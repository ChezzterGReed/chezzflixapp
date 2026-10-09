// Bridges to Kotlin code on Android: the ExoPlayer video player ("player") and the app updater ("appupdate").
// Each plugin exposes the same three IPC commands: `call` (run a named Kotlin command) and the pair that registers event listeners.
// On desktop these plugins load but do nothing; the app only calls them on Android.
use serde::Serialize;
use serde_json::Value;
use tauri::{
    ipc::Channel,
    plugin::{Builder, TauriPlugin},
    Manager, State, Wry,
};

#[cfg(mobile)]
type Inner = tauri::plugin::PluginHandle<Wry>;
#[cfg(not(mobile))]
type Inner = ();

macro_rules! kotlin_plugin {
    ($modname:ident, $name:literal, $class:literal) => {
        pub mod $modname {
            use super::*;

            #[allow(dead_code)]
            pub struct Handle(Option<Inner>);

            #[derive(Serialize)]
            struct RegisterArgs { event: String, handler: Channel<Value> }
            #[derive(Serialize)]
            #[serde(rename_all = "camelCase")]
            struct RemoveArgs { event: String, channel_id: u32 }

            #[tauri::command]
            async fn call(state: State<'_, Handle>, command: String, args: Option<Value>) -> Result<Value, String> {
                #[cfg(mobile)]
                { let h = state.0.as_ref().ok_or("not available")?; return h.run_mobile_plugin_async(&command, args.unwrap_or(Value::Null)).await.map_err(|e| e.to_string()); }
                #[allow(unreachable_code)]
                { let _ = (&state, &command, &args); Err("only available on Android".into()) }
            }

            #[tauri::command]
            async fn register_listener(state: State<'_, Handle>, event: String, handler: Channel<Value>) -> Result<(), String> {
                #[cfg(mobile)]
                { let h = state.0.as_ref().ok_or("not available")?; return h.run_mobile_plugin_async("registerListener", RegisterArgs { event, handler }).await.map_err(|e| e.to_string()); }
                #[allow(unreachable_code)]
                { let _ = (&state, &event, &handler); let _ = RegisterArgs { event: String::new(), handler }; Err("only available on Android".into()) }
            }

            #[tauri::command]
            async fn remove_listener(state: State<'_, Handle>, event: String, channel_id: u32) -> Result<(), String> {
                #[cfg(mobile)]
                { let h = state.0.as_ref().ok_or("not available")?; return h.run_mobile_plugin_async("removeListener", RemoveArgs { event, channel_id }).await.map_err(|e| e.to_string()); }
                #[allow(unreachable_code)]
                { let _ = (&state, &event, &channel_id); let _ = RemoveArgs { event: String::new(), channel_id: 0 }; Err("only available on Android".into()) }
            }

            pub fn init() -> TauriPlugin<Wry> {
                Builder::new($name)
                    .invoke_handler(tauri::generate_handler![call, register_listener, remove_listener])
                    .setup(|app, _api| {
                        #[cfg(target_os = "android")]
                        let inner = Some(_api.register_android_plugin("app.chezzflix.client", $class)?);
                        #[cfg(not(target_os = "android"))]
                        let inner: Option<Inner> = None;
                        app.manage(Handle(inner));
                        Ok(())
                    })
                    .build()
            }
        }
    };
}

kotlin_plugin!(player, "player", "PlayerPlugin");
kotlin_plugin!(appupdate, "appupdate", "AppUpdatePlugin");
