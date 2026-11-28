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

// ---------- Live TV: the playlist (M3U) and its guide (XMLTV) ----------
// Playlist hosts rarely allow the web view to read them (no CORS headers), and the guide is usually a large gzip file, so both are fetched and read here.
use std::collections::{HashMap, HashSet};
use std::io::Read;

const MAX_BYTES: usize = 120 * 1024 * 1024;

async fn download(url: &str) -> Result<Vec<u8>, String> {
    let u = reqwest::Url::parse(url.trim()).map_err(|_| "That address doesn't look right.".to_string())?;
    if !matches!(u.scheme(), "http" | "https") { return Err("The address must start with http:// or https://".into()); }
    let client = reqwest::Client::builder().use_native_tls().timeout(Duration::from_secs(90)).user_agent("Chezzflix").build().map_err(|e| e.to_string())?;
    let res = client.get(u).send().await.map_err(|e| if e.is_timeout() { "The server took too long to answer.".to_string() } else if e.is_connect() { "Couldn't reach that address.".to_string() } else { e.to_string() })?;
    if !res.status().is_success() { return Err(format!("The server answered {}.", res.status().as_u16())); }
    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    if bytes.len() > MAX_BYTES { return Err("That file is too large.".into()); }
    Ok(bytes.to_vec())
}

fn gunzipped(bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    if bytes.len() > 2 && bytes[0] == 0x1f && bytes[1] == 0x8b {
        let mut out = Vec::new();
        flate2::read::GzDecoder::new(&bytes[..]).take(MAX_BYTES as u64 * 4).read_to_end(&mut out).map_err(|_| "Couldn't unpack that file.".to_string())?;
        Ok(out)
    } else { Ok(bytes) }
}

/// A text file from the internet (an M3U playlist), unpacked if it is gzipped.
#[tauri::command]
pub async fn live_fetch(url: String) -> Result<String, String> {
    let bytes = gunzipped(download(&url).await?)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[derive(Serialize)]
pub struct EpgProg { s: i64, e: i64, t: String, d: String }

/// "20261127203000 +0000" -> milliseconds since 1970 (no zone means UTC).
fn xmltv_time(v: &str) -> Option<i64> {
    let v = v.trim();
    let (stamp, zone) = match v.split_once(' ') { Some((a, b)) => (a, b.trim()), None => (v, "") };
    if stamp.len() < 12 { return None; }
    let n = |a: usize, b: usize| stamp.get(a..b).and_then(|x| x.parse::<i64>().ok());
    let (y, mo, d, h, mi) = (n(0, 4)?, n(4, 6)?, n(6, 8)?, n(8, 10)?, n(10, 12)?);
    let sec = n(12, 14).unwrap_or(0);
    // days since 1970-01-01 (civil calendar)
    let y2 = if mo <= 2 { y - 1 } else { y };
    let era = if y2 >= 0 { y2 } else { y2 - 399 } / 400;
    let yoe = y2 - era * 400;
    let doy = (153 * (if mo > 2 { mo - 3 } else { mo + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;
    let mut t = days * 86400 + h * 3600 + mi * 60 + sec;
    if zone.len() >= 5 {
        let sign = if zone.starts_with('-') { -1 } else { 1 };
        if let (Some(zh), Some(zm)) = (zone.get(1..3).and_then(|x| x.parse::<i64>().ok()), zone.get(3..5).and_then(|x| x.parse::<i64>().ok())) { t -= sign * (zh * 3600 + zm * 60); }
    }
    Some(t * 1000)
}

/// What's on (title and description) for the given channel ids between `from` and `to` (ms), read from an XMLTV guide of any size without keeping the rest.
#[tauri::command]
pub async fn live_epg(url: String, ids: Vec<String>, from: i64, to: i64) -> Result<HashMap<String, Vec<EpgProg>>, String> {
    let bytes = download(&url).await?;
    tauri::async_runtime::spawn_blocking(move || -> Result<HashMap<String, Vec<EpgProg>>, String> {
        use quick_xml::events::Event;
        use quick_xml::Reader;
        let want: HashSet<String> = ids.into_iter().collect();
        let gz = bytes.len() > 2 && bytes[0] == 0x1f && bytes[1] == 0x8b;
        let src: Box<dyn Read> = if gz { Box::new(flate2::read::GzDecoder::new(std::io::Cursor::new(bytes))) } else { Box::new(std::io::Cursor::new(bytes)) };
        let mut rd = Reader::from_reader(std::io::BufReader::new(src));
        let mut buf = Vec::new();
        let mut out: HashMap<String, Vec<EpgProg>> = HashMap::new();
        // the programme being read
        let mut cur: Option<(String, i64, i64, String, String)> = None;
        let mut field = 0u8;   // 1 = title, 2 = desc
        loop {
            match rd.read_event_into(&mut buf) {
                Ok(Event::Start(e)) => match e.name().as_ref() {
                    b"programme" => {
                        let (mut ch, mut s, mut st) = (String::new(), None, None);
                        for a in e.attributes().flatten() {
                            let v = a.unescape_value().map(|x| x.into_owned()).unwrap_or_default();
                            match a.key.as_ref() { b"channel" => ch = v, b"start" => s = xmltv_time(&v), b"stop" => st = xmltv_time(&v), _ => {} }
                        }
                        cur = match (s, st) { (Some(s), Some(st)) if st > from && s < to && want.contains(&ch) => Some((ch, s, st, String::new(), String::new())), _ => None };
                    }
                    b"title" if cur.is_some() => field = 1,
                    b"desc" if cur.is_some() => field = 2,
                    _ => {}
                },
                Ok(Event::Text(t)) => if let Some(c) = cur.as_mut() {
                    let txt = t.unescape().map(|x| x.into_owned()).unwrap_or_default();
                    if field == 1 && c.3.is_empty() { c.3 = txt } else if field == 2 && c.4.is_empty() { c.4 = txt.chars().take(400).collect() }
                },
                Ok(Event::End(e)) => match e.name().as_ref() {
                    b"title" | b"desc" => field = 0,
                    b"programme" => { if let Some((ch, s, e2, t, d)) = cur.take() { out.entry(ch).or_default().push(EpgProg { s, e: e2, t, d }); } field = 0; }
                    _ => {}
                },
                Ok(Event::Eof) => break,
                Err(_) => break,   // a damaged tail still leaves what was read
                _ => {}
            }
            buf.clear();
        }
        for v in out.values_mut() { v.sort_by_key(|p| p.s); }
        Ok(out)
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::xmltv_time;
    #[test]
    fn guide_times() {
        assert_eq!(xmltv_time("20261127203000 +0000"), Some(1795811400000));
        assert_eq!(xmltv_time("20261127153000 -0500"), Some(1795811400000));
        assert_eq!(xmltv_time("20261127203000"), Some(1795811400000));
        assert_eq!(xmltv_time("20240229000000 +0000"), Some(1709164800000));
        assert_eq!(xmltv_time("nope"), None);
    }
}

