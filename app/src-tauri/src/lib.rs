use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

#[cfg(target_os = "macos")]
mod native;
mod mobile;
mod net;
#[cfg(target_os = "macos")]
use native::NativeState;
#[cfg(not(target_os = "macos"))]
#[derive(Default)]
struct NativeState;

#[derive(Default)]
struct Player(Mutex<Option<Child>>);

fn mpv_binary() -> String {
    for p in ["/opt/homebrew/bin/mpv", "/usr/local/bin/mpv", "mpv"] {
        if p == "mpv" || std::path::Path::new(p).exists() {
            return p.to_string();
        }
    }
    "mpv".into()
}

/// Launch mpv on a direct-play URL. Emits `player-progress` {timeMs, paused} and `player-ended`.
#[tauri::command]
fn play(app: AppHandle, state: State<Player>, url: String, start_seconds: Option<f64>, title: Option<String>) -> Result<(), String> {
    stop_inner(&state);
    let sock = std::env::temp_dir().join("chezzflix-mpv.sock");
    let _ = std::fs::remove_file(&sock);

    let mut cmd = Command::new(mpv_binary());
    cmd.arg(format!("--input-ipc-server={}", sock.display()))
        .arg("--fs")
        .arg("--force-window=yes")
        .arg("--keep-open=no")
        // Pass through lossless/surround audio untouched when the output supports it.
        .arg("--audio-spdif=ac3,eac3,dts,dts-hd,truehd")
        .arg("--hwdec=auto-safe")
        .arg("--sub-auto=fuzzy")
        .arg(format!("--force-media-title={}", title.unwrap_or_default()));
    if let Some(s) = start_seconds {
        cmd.arg(format!("--start={s}"));
    }
    cmd.arg(&url).stdout(Stdio::null()).stderr(Stdio::null());

    let child = cmd.spawn().map_err(|e| format!("could not start mpv (is it installed?): {e}"))?;
    *state.0.lock().unwrap() = Some(child);

    #[cfg(unix)]
    std::thread::spawn(move || watch_progress(app, sock));
    Ok(())
}

#[cfg(unix)]
fn watch_progress(app: AppHandle, sock: std::path::PathBuf) {
    use std::os::unix::net::UnixStream;
    let mut stream = None;
    for _ in 0..50 {
        if let Ok(s) = UnixStream::connect(&sock) { stream = Some(s); break; }
        std::thread::sleep(std::time::Duration::from_millis(200));
    }
    let Some(mut stream) = stream else { return };
    for (id, prop) in [(1, "time-pos"), (2, "pause")] {
        let msg = json!({"command": ["observe_property", id, prop]});
        let _ = writeln!(stream, "{msg}");
    }
    let (mut time_ms, mut paused) = (0.0_f64, false);
    let mut last_emit = std::time::Instant::now();
    for line in BufReader::new(stream).lines().map_while(Result::ok) {
        let Ok(v) = serde_json::from_str::<Value>(&line) else { continue };
        if v["event"] == "property-change" {
            match v["name"].as_str() {
                Some("time-pos") => if let Some(t) = v["data"].as_f64() { time_ms = t * 1000.0 },
                Some("pause") => paused = v["data"].as_bool().unwrap_or(false),
                _ => {}
            }
            if last_emit.elapsed().as_secs() >= 10 {
                last_emit = std::time::Instant::now();
                let _ = app.emit("player-progress", json!({"timeMs": time_ms, "paused": paused}));
            }
        }
    }
    let _ = app.emit("player-ended", json!({"timeMs": time_ms}));
}

fn stop_inner(state: &State<Player>) {
    if let Some(mut c) = state.0.lock().unwrap().take() {
        let _ = c.kill();
        let _ = c.wait();
    }
}

// ---------- embedded libmpv (macOS) ----------
#[tauri::command]
async fn mpv_start(app: AppHandle, window: tauri::WebviewWindow, state: State<'_, NativeState>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        if state.0.lock().unwrap().is_some() { return Ok(()); }
        let view = window.ns_view().map_err(|e| e.to_string())? as usize;
        let (tx, rx) = std::sync::mpsc::channel();
        window.run_on_main_thread(move || { let _ = tx.send(native::Native::start(app, view)); }).map_err(|e| e.to_string())?;
        let engine = rx.recv().map_err(|e| e.to_string())??;
        *state.0.lock().unwrap() = Some(engine);
        return Ok(());
    }
    #[allow(unreachable_code)]
    { let _ = (&app, &window, &state); Err("embedded player is not available on this platform yet".into()) }
}

#[tauri::command]
async fn mpv_cmd(args: Vec<String>, state: State<'_, NativeState>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { return state.0.lock().unwrap().as_ref().ok_or("player not started")?.command(&args); }
    #[allow(unreachable_code)]
    { let _ = (&args, &state); Err("unavailable".into()) }
}

#[tauri::command]
async fn mpv_set(name: String, value: String, state: State<'_, NativeState>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { return state.0.lock().unwrap().as_ref().ok_or("player not started")?.set(&name, &value); }
    #[allow(unreachable_code)]
    { let _ = (&name, &value, &state); Err("unavailable".into()) }
}

#[tauri::command]
async fn mpv_get(name: String, state: State<'_, NativeState>) -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    { return Ok(state.0.lock().unwrap().as_ref().ok_or("player not started")?.get(&name)); }
    #[allow(unreachable_code)]
    { let _ = (&name, &state); Err("unavailable".into()) }
}

#[tauri::command]
async fn mpv_tracks(state: State<'_, NativeState>) -> Result<Value, String> {
    #[cfg(target_os = "macos")]
    { return Ok(state.0.lock().unwrap().as_ref().ok_or("player not started")?.tracks()); }
    #[allow(unreachable_code)]
    { let _ = &state; Err("unavailable".into()) }
}

#[tauri::command]
fn stop(state: State<Player>) {
    stop_inner(&state);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(mobile::player::init())
        .plugin(mobile::appupdate::init());
    // Self-updating is desktop-only; Android gets its own mechanism.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());
    builder
        .manage(Player::default())
        .manage(NativeState::default())
        .manage(net::NetState::default())
        .invoke_handler(tauri::generate_handler![play, stop, mpv_start, mpv_cmd, mpv_set, mpv_get, mpv_tracks, net::requests_http])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
