//! Embedded libmpv player (macOS). mpv renders into a native OpenGL view placed *behind* the transparent
//! webview, so the Chezzflix UI sits on top of real direct-play video (MKV, HEVC, DTS, TrueHD, PGS...).
#![cfg(target_os = "macos")]
#![allow(dead_code)]

use serde_json::{json, Value};
use std::ffi::{c_char, c_double, c_int, c_void, CStr, CString};
use std::ptr::null_mut;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::JoinHandle;
use tauri::{AppHandle, Emitter};

// ---------- libmpv C API (just what we need) ----------
#[repr(C)]
struct MpvEvent { event_id: c_int, error: c_int, reply_userdata: u64, data: *mut c_void }
#[repr(C)]
struct MpvEventProperty { name: *const c_char, format: c_int, data: *mut c_void }
#[repr(C)]
struct MpvEventEndFile { reason: c_int, error: c_int }
#[repr(C)]
struct RenderParam { type_: c_int, data: *mut c_void }
#[repr(C)]
struct OpenGLInitParams { get_proc_address: Option<unsafe extern "C" fn(*mut c_void, *const c_char) -> *mut c_void>, ctx: *mut c_void }
#[repr(C)]
struct OpenGLFbo { fbo: c_int, w: c_int, h: c_int, internal_format: c_int }

type UpdateFn = unsafe extern "C" fn(*mut c_void);

unsafe extern "C" {
    fn mpv_create() -> *mut c_void;
    fn mpv_initialize(h: *mut c_void) -> c_int;
    fn mpv_terminate_destroy(h: *mut c_void);
    fn mpv_set_option_string(h: *mut c_void, name: *const c_char, data: *const c_char) -> c_int;
    fn mpv_set_property_string(h: *mut c_void, name: *const c_char, data: *const c_char) -> c_int;
    fn mpv_get_property_string(h: *mut c_void, name: *const c_char) -> *mut c_char;
    fn mpv_command(h: *mut c_void, args: *mut *const c_char) -> c_int;
    fn mpv_observe_property(h: *mut c_void, userdata: u64, name: *const c_char, format: c_int) -> c_int;
    fn mpv_wait_event(h: *mut c_void, timeout: c_double) -> *mut MpvEvent;
    fn mpv_wakeup(h: *mut c_void);
    fn mpv_free(p: *mut c_void);
    fn mpv_error_string(e: c_int) -> *const c_char;

    fn mpv_render_context_create(res: *mut *mut c_void, mpv: *mut c_void, params: *mut RenderParam) -> c_int;
    fn mpv_render_context_set_update_callback(rc: *mut c_void, cb: Option<UpdateFn>, ctx: *mut c_void);
    fn mpv_render_context_update(rc: *mut c_void) -> u64;
    fn mpv_render_context_render(rc: *mut c_void, params: *mut RenderParam) -> c_int;
    fn mpv_render_context_report_swap(rc: *mut c_void);
    fn mpv_render_context_free(rc: *mut c_void);

    // gl.m
    fn chezz_gl_create(parent: *mut c_void) -> *mut c_void;
    fn chezz_gl_begin(h: *mut c_void, w: *mut c_int, hh: *mut c_int, fbo: *mut c_int) -> c_int;
    fn chezz_gl_end(h: *mut c_void, present: c_int);
    fn chezz_gl_destroy(h: *mut c_void);
    fn chezz_gl_proc(name: *const c_char) -> *mut c_void;
}

const FMT_FLAG: c_int = 3;
const FMT_INT64: c_int = 4;
const FMT_DOUBLE: c_int = 5;
const EV_SHUTDOWN: c_int = 1;
const EV_END_FILE: c_int = 7;
const EV_FILE_LOADED: c_int = 8;
const EV_PROPERTY: c_int = 22;
const RENDER_UPDATE_FRAME: u64 = 1;

fn cstr(s: &str) -> CString { CString::new(s.replace('\0', "")).unwrap() }
fn err_text(code: c_int) -> String { unsafe { CStr::from_ptr(mpv_error_string(code)).to_string_lossy().into_owned() } }

unsafe extern "C" fn gpa(_: *mut c_void, name: *const c_char) -> *mut c_void { unsafe { chezz_gl_proc(name) } }
unsafe extern "C" fn on_update(ctx: *mut c_void) {
    let tx = unsafe { &*(ctx as *const mpsc::Sender<()>) };
    let _ = tx.send(());
}

/// Pointers shared between threads. mpv's client API is thread-safe; the GL view is only touched under its CGL lock.
#[derive(Clone, Copy)]
struct Ptr(usize);
impl Ptr { fn get(self) -> *mut c_void { self.0 as *mut c_void } }

pub struct Native {
    mpv: Ptr,
    gl: Ptr,
    stop: Arc<AtomicBool>,
    wake: mpsc::Sender<()>,
    threads: Vec<JoinHandle<()>>,
}

#[derive(Default)]
pub struct NativeState(pub Mutex<Option<Native>>);

impl Native {
    /// Create mpv + the native video view. `parent_view` is the window's content NSView; call from the main thread.
    pub fn start(app: AppHandle, parent_view: usize) -> Result<Native, String> {
        unsafe {
            let gl = chezz_gl_create(parent_view as *mut c_void);
            if gl.is_null() { return Err("could not create the native video view".into()); }

            let mpv = mpv_create();
            if mpv.is_null() { return Err("mpv_create failed".into()); }
            let set = |k: &str, v: &str| { mpv_set_option_string(mpv, cstr(k).as_ptr(), cstr(v).as_ptr()); };
            set("vo", "libmpv");
            set("hwdec", "videotoolbox");
            set("config", "no");
            set("load-scripts", "no");
            set("ytdl", "no");
            set("osc", "no");
            set("input-default-bindings", "no");
            set("input-vo-keyboard", "no");
            set("idle", "yes");
            set("keep-open", "yes"); // stay on the last frame; the UI decides what happens at the end
            set("cache", "yes");
            set("demuxer-max-bytes", "200MiB");
            set("demuxer-readahead-secs", "60");
            set("sub-auto", "fuzzy");
            set("audio-client-name", "Chezzflix");
            let r = mpv_initialize(mpv);
            if r < 0 { return Err(format!("mpv_initialize: {}", err_text(r))); }

            let stop = Arc::new(AtomicBool::new(false));
            let (tx, rx) = mpsc::channel::<()>();
            let (gl_p, mpv_p) = (Ptr(gl as usize), Ptr(mpv as usize));
            let mut threads = vec![];

            // ----- render thread: owns the GL context while drawing -----
            let stop_r = stop.clone();
            let tx_cb = tx.clone();
            let app_r = app.clone();
            threads.push(std::thread::Builder::new().name("mpv-render".into()).spawn(move || {
                let (gl, mpv) = (gl_p.get(), mpv_p.get());
                let (mut w, mut h, mut fbo) = (0, 0, 0);
                chezz_gl_begin(gl, &mut w, &mut h, &mut fbo);
                let api = cstr("opengl");
                let mut init = OpenGLInitParams { get_proc_address: Some(gpa), ctx: null_mut() };
                let mut params = [
                    RenderParam { type_: 1, data: api.as_ptr() as *mut c_void },
                    RenderParam { type_: 2, data: &mut init as *mut _ as *mut c_void },
                    RenderParam { type_: 0, data: null_mut() },
                ];
                let mut rc: *mut c_void = null_mut();
                let cr = mpv_render_context_create(&mut rc, mpv, params.as_mut_ptr());
                chezz_gl_end(gl, 0);
                if cr < 0 || rc.is_null() {
                    let _ = app_r.emit("mpv-event", json!({ "event": "error", "message": format!("render context: {}", err_text(cr)) }));
                    return;
                }
                let cb_ctx = Box::into_raw(Box::new(tx_cb));
                mpv_render_context_set_update_callback(rc, Some(on_update), cb_ctx as *mut c_void);

                while rx.recv().is_ok() {
                    if stop_r.load(Ordering::Relaxed) { break; }
                    while rx.try_recv().is_ok() {} // coalesce bursts
                    if mpv_render_context_update(rc) & RENDER_UPDATE_FRAME == 0 { continue; }
                    chezz_gl_begin(gl, &mut w, &mut h, &mut fbo);
                    if w > 0 && h > 0 {
                        let mut f = OpenGLFbo { fbo, w, h, internal_format: 0 };
                        let mut flip: c_int = 1;
                        let mut p = [
                            RenderParam { type_: 3, data: &mut f as *mut _ as *mut c_void },
                            RenderParam { type_: 4, data: &mut flip as *mut _ as *mut c_void },
                            RenderParam { type_: 0, data: null_mut() },
                        ];
                        mpv_render_context_render(rc, p.as_mut_ptr());
                        chezz_gl_end(gl, 1);
                        mpv_render_context_report_swap(rc);
                    } else {
                        chezz_gl_end(gl, 0);
                    }
                }

                // Teardown: detach the callback before freeing so no update can land on a dead channel.
                mpv_render_context_set_update_callback(rc, None, null_mut());
                chezz_gl_begin(gl, &mut w, &mut h, &mut fbo);
                mpv_render_context_free(rc);
                chezz_gl_end(gl, 0);
                drop(Box::from_raw(cb_ctx));
            }).map_err(|e| e.to_string())?);

            // ----- event thread: forwards property changes to the UI -----
            let stop_e = stop.clone();
            let app_e = app.clone();
            for (i, (name, fmt)) in [("time-pos", FMT_DOUBLE), ("duration", FMT_DOUBLE), ("pause", FMT_FLAG), ("volume", FMT_DOUBLE),
                ("mute", FMT_FLAG), ("paused-for-cache", FMT_FLAG), ("eof-reached", FMT_FLAG), ("demuxer-cache-time", FMT_DOUBLE),
                ("seeking", FMT_FLAG)].iter().enumerate() {
                mpv_observe_property(mpv, i as u64 + 1, cstr(name).as_ptr(), *fmt);
            }
            threads.push(std::thread::Builder::new().name("mpv-events".into()).spawn(move || {
                let mpv = mpv_p.get();
                while !stop_e.load(Ordering::Relaxed) {
                    let ev = &*mpv_wait_event(mpv, 0.25);
                    match ev.event_id {
                        EV_SHUTDOWN => break,
                        EV_PROPERTY => {
                            let p = &*(ev.data as *const MpvEventProperty);
                            let name = CStr::from_ptr(p.name).to_string_lossy().into_owned();
                            let value = if p.data.is_null() { Value::Null } else { match p.format {
                                FMT_DOUBLE => json!(*(p.data as *const f64)),
                                FMT_FLAG => json!(*(p.data as *const c_int) != 0),
                                FMT_INT64 => json!(*(p.data as *const i64)),
                                _ => Value::Null,
                            } };
                            let _ = app_e.emit("mpv-prop", json!({ "name": name, "value": value }));
                        }
                        EV_FILE_LOADED => { let _ = app_e.emit("mpv-event", json!({ "event": "loaded" })); }
                        EV_END_FILE => {
                            let e = &*(ev.data as *const MpvEventEndFile);
                            let _ = app_e.emit("mpv-event", json!({ "event": "end", "reason": e.reason, "error": e.error }));
                        }
                        _ => {}
                    }
                }
            }).map_err(|e| e.to_string())?);

            Ok(Native { mpv: mpv_p, gl: gl_p, stop, wake: tx, threads })
        }
    }

    pub fn command(&self, args: &[String]) -> Result<(), String> {
        let owned: Vec<CString> = args.iter().map(|a| cstr(a)).collect();
        let mut ptrs: Vec<*const c_char> = owned.iter().map(|c| c.as_ptr()).collect();
        ptrs.push(std::ptr::null());
        let r = unsafe { mpv_command(self.mpv.get(), ptrs.as_mut_ptr()) };
        if r < 0 { Err(format!("{}: {}", args.first().cloned().unwrap_or_default(), err_text(r))) } else { Ok(()) }
    }

    pub fn set(&self, name: &str, value: &str) -> Result<(), String> {
        let r = unsafe { mpv_set_property_string(self.mpv.get(), cstr(name).as_ptr(), cstr(value).as_ptr()) };
        if r < 0 { Err(format!("set {name}: {}", err_text(r))) } else { Ok(()) }
    }

    fn get(&self, name: &str) -> Option<String> {
        unsafe {
            let p = mpv_get_property_string(self.mpv.get(), cstr(name).as_ptr());
            if p.is_null() { return None; }
            let s = CStr::from_ptr(p).to_string_lossy().into_owned();
            mpv_free(p as *mut c_void);
            Some(s)
        }
    }

    /// Audio / subtitle / video tracks of the loaded file, as mpv sees them (embedded + external).
    pub fn tracks(&self) -> Value {
        let n: usize = self.get("track-list/count").and_then(|c| c.parse().ok()).unwrap_or(0);
        let yes = |s: Option<String>| s.as_deref() == Some("yes");
        let list: Vec<Value> = (0..n).map(|i| {
            let g = |k: &str| self.get(&format!("track-list/{i}/{k}"));
            json!({
                "id": g("id").and_then(|v| v.parse::<i64>().ok()),
                "type": g("type"), "title": g("title"), "lang": g("lang"), "codec": g("codec"),
                "channels": g("demux-channel-count").or_else(|| g("audio-channels")),
                "selected": yes(g("selected")), "default": yes(g("default")),
                "forced": yes(g("forced")), "external": yes(g("external")),
            })
        }).collect();
        Value::Array(list)
    }
}
