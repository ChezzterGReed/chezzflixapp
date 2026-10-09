// A small HTTP bridge for the request service (Overseerr). The web view can't call it directly (no CORS headers),
// and its sign-in is a session cookie, so requests go through here, with a cookie jar that lives for the app session.
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::State;

pub struct NetState { client: reqwest::Client }

impl Default for NetState {
    fn default() -> Self {
        let client = reqwest::Client::builder()
            .cookie_store(true)
            .use_native_tls()
            .timeout(Duration::from_secs(20))
            .user_agent("Chezzflix")
            .build()
            .expect("http client");
        NetState { client }
    }
}

#[derive(Deserialize)]
pub struct HttpReq { method: String, url: String, body: Option<serde_json::Value> }

#[derive(Serialize)]
pub struct HttpRes { status: u16, body: String }

/// Only Overseerr's own API is reachable through here, never arbitrary URLs.
#[tauri::command]
pub async fn requests_http(state: State<'_, NetState>, req: HttpReq) -> Result<HttpRes, String> {
    let url = reqwest::Url::parse(&req.url).map_err(|e| format!("Bad address: {e}"))?;
    if !matches!(url.scheme(), "http" | "https") || !url.path().contains("/api/v1/") {
        return Err("Not an Overseerr API address.".into());
    }
    let method = reqwest::Method::from_bytes(req.method.to_uppercase().as_bytes()).map_err(|_| "Bad method".to_string())?;
    let mut rb = state.client.request(method, url).header("Accept", "application/json");
    if let Some(b) = req.body { rb = rb.json(&b); }
    let res = rb.send().await.map_err(|e| if e.is_timeout() { "The request server took too long to answer.".to_string() } else if e.is_connect() { "Couldn't reach the request server.".to_string() } else { e.to_string() })?;
    let status = res.status().as_u16();
    let body = res.text().await.map_err(|e| e.to_string())?;
    Ok(HttpRes { status, body })
}
