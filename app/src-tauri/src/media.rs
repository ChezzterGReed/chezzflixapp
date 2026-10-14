// "Now Playing" and media keys on the Mac: the track shows in Control Center / the menu bar, and the keyboard's play, pause and
// skip keys (and AirPods, and the lock-screen controls) reach the player. The page sends what is playing; key presses come back as
// `media-key` events.
use serde_json::json;
use souvlaki::{MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition, PlatformConfig, SeekDirection};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct MediaState(pub Mutex<Option<MediaControls>>);

#[tauri::command]
pub fn media_init(app: AppHandle, state: State<MediaState>) -> Result<(), String> {
    let mut guard = state.0.lock().unwrap();
    if guard.is_some() { return Ok(()); }
    let mut c = MediaControls::new(PlatformConfig { dbus_name: "chezzflix", display_name: "Chezzflix", hwnd: None }).map_err(|e| format!("{e:?}"))?;
    c.attach(move |ev: MediaControlEvent| {
        let payload = match ev {
            MediaControlEvent::Play => json!({ "key": "play" }),
            MediaControlEvent::Pause => json!({ "key": "pause" }),
            MediaControlEvent::Toggle => json!({ "key": "toggle" }),
            MediaControlEvent::Next => json!({ "key": "next" }),
            MediaControlEvent::Previous => json!({ "key": "previous" }),
            MediaControlEvent::Stop => json!({ "key": "stop" }),
            MediaControlEvent::Seek(d) => json!({ "key": "seekBy", "secs": if matches!(d, SeekDirection::Forward) { 10.0 } else { -10.0 } }),
            MediaControlEvent::SeekBy(d, by) => json!({ "key": "seekBy", "secs": if matches!(d, SeekDirection::Forward) { by.as_secs_f64() } else { -by.as_secs_f64() } }),
            MediaControlEvent::SetPosition(MediaPosition(p)) => json!({ "key": "seekTo", "secs": p.as_secs_f64() }),
            _ => return,
        };
        let _ = app.emit("media-key", payload);
    }).map_err(|e| format!("{e:?}"))?;
    *guard = Some(c);
    Ok(())
}

#[tauri::command]
pub fn media_meta(state: State<MediaState>, title: String, subtitle: Option<String>, cover: Option<String>, duration_secs: Option<f64>) -> Result<(), String> {
    if let Some(c) = state.0.lock().unwrap().as_mut() {
        c.set_metadata(MediaMetadata {
            title: Some(&title), artist: subtitle.as_deref(), album: None, cover_url: cover.as_deref(),
            duration: duration_secs.filter(|d| *d > 0.0).map(Duration::from_secs_f64),
        }).map_err(|e| format!("{e:?}"))?;
    }
    Ok(())
}

/// `status`: "playing", "paused" or "stopped".
#[tauri::command]
pub fn media_playback(state: State<MediaState>, status: String, position_secs: Option<f64>) -> Result<(), String> {
    if let Some(c) = state.0.lock().unwrap().as_mut() {
        let progress = position_secs.map(|p| MediaPosition(Duration::from_secs_f64(p.max(0.0))));
        let pb = match status.as_str() { "playing" => MediaPlayback::Playing { progress }, "paused" => MediaPlayback::Paused { progress }, _ => MediaPlayback::Stopped };
        c.set_playback(pb).map_err(|e| format!("{e:?}"))?;
    }
    Ok(())
}
