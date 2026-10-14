// Updating from a feed the page names (the Beta channel). The built-in updater has one fixed address; this one is told the address per check.
// Same signature check as the normal updater: an update is installed only if it is signed with the app's key.
use serde_json::{json, Value};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Update>>);

/// Looks for an update in the feed at `feed`. Returns {version, notes} when one is newer than this app, else null.
#[tauri::command]
pub async fn update_check(app: AppHandle, state: State<'_, PendingUpdate>, feed: String) -> Result<Option<Value>, String> {
    let url: tauri::Url = feed.parse().map_err(|e| format!("bad feed address: {e}"))?;
    let updater = app.updater_builder().endpoints(vec![url]).map_err(|e| e.to_string())?.build().map_err(|e| e.to_string())?;
    match updater.check().await.map_err(|e| e.to_string())? {
        Some(u) => {
            let info = json!({ "version": u.version, "notes": u.body });
            *state.0.lock().unwrap() = Some(u);
            Ok(Some(info))
        }
        None => { *state.0.lock().unwrap() = None; Ok(None) }
    }
}

/// Downloads and installs the update found by `update_check` (progress comes back as `update-progress` events). The page relaunches afterwards.
#[tauri::command]
pub async fn update_install(app: AppHandle, state: State<'_, PendingUpdate>) -> Result<(), String> {
    let update = state.0.lock().unwrap().take().ok_or("no update to install")?;
    let mut got: u64 = 0;
    let handle = app.clone();
    update.download_and_install(
        move |chunk, total| { got += chunk as u64; let _ = handle.emit("update-progress", json!({ "got": got, "total": total })); },
        || {},
    ).await.map_err(|e| e.to_string())
}
