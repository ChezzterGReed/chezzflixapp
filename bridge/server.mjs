// Chezzflix Bridge: your Plex library as an Xtream Codes service, for IPTV apps.
// Movies and shows are listed as on-demand titles; playing one sends the ORIGINAL file straight through (byte ranges, no transcoding),
// so the device that's watching does all the decoding. No dependencies: Node 20+ only.
import http from 'node:http'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'

const env = process.env
const PLEX = (env.PLEX_URL || '').replace(/\/+$/, '')
const TOKEN = env.PLEX_TOKEN || ''
const PORT = Number(env.PORT || 8080)
const ONLY = (env.BRIDGE_LIBRARIES || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
const CACHE_MS = Number(env.BRIDGE_CACHE_MINUTES || 10) * 60_000
if (!PLEX || !TOKEN) { console.error('Set PLEX_URL and PLEX_TOKEN.'); process.exit(1) }
let USER = env.BRIDGE_USER, PASS = env.BRIDGE_PASS
if (!USER || !PASS) {
  USER = USER || 'chezzflix'; PASS = PASS || crypto.randomBytes(9).toString('base64url')
  console.log(`No BRIDGE_USER / BRIDGE_PASS set. Using username "${USER}" and password "${PASS}" (set them to keep them between restarts).`)
}

const plexHeaders = (extra = {}) => ({ Accept: 'application/json', 'X-Plex-Token': TOKEN, 'X-Plex-Client-Identifier': 'chezzflix-bridge', 'X-Plex-Product': 'Chezzflix Bridge', ...extra })
async function plex(path) {
  const r = await fetch(PLEX + path, { headers: plexHeaders() })
  if (!r.ok) throw new Error(`Plex ${r.status} for ${path}`)
  return (await r.json()).MediaContainer ?? {}
}

// ---------- the library, read from Plex and kept for a while ----------
const parts = new Map()   // ratingKey -> { key, ext, size } for movies and episodes
const ext = (m) => (m.Media?.[0]?.container || m.Media?.[0]?.Part?.[0]?.container || 'mkv').toLowerCase()
function remember(m) { const p = m.Media?.[0]?.Part?.[0]; if (p?.key) parts.set(String(m.ratingKey), { key: p.key, ext: ext(m) }) }
const sec = (n) => Math.round((n || 0) / 1000)
const hms = (ms) => { const s = sec(ms); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':') }
const iso = (t) => (t ? new Date(t * 1000).toISOString().slice(0, 10) : '')

let lib = null, loading = null, loadedAt = 0
async function load() {
  const secs = (await plex('/library/sections')).Directory ?? []
  const wanted = secs.filter((s) => (s.type === 'movie' || s.type === 'show') && (!ONLY.length || ONLY.includes(String(s.title).toLowerCase())))
  const movies = [], shows = []
  for (const s of wanted) {
    const items = (await plex(`/library/sections/${s.key}/all`)).Metadata ?? []
    for (const m of items) { if (s.type === 'movie') { remember(m); movies.push(m) } else shows.push(m) }
  }
  const cats = (items) => {
    const names = [...new Set(items.map((m) => m.Genre?.[0]?.tag || 'Other'))].sort((a, b) => (a === 'Other') - (b === 'Other') || a.localeCompare(b))
    return { names, id: (m) => String(names.indexOf(m.Genre?.[0]?.tag || 'Other') + 1) }
  }
  lib = { movies, shows, mcat: cats(movies), scat: cats(shows), series: new Map() }
  loadedAt = Date.now()
}
async function library() {
  if (lib && Date.now() - loadedAt < CACHE_MS) return lib
  if (!loading) loading = load().finally(() => { loading = null })
  if (lib) { loading.catch(() => {}); return lib }   // serve the old copy while a fresh one is read
  await loading; return lib
}
async function episodes(id) {
  const L = await library()
  const hit = L.series.get(id)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.eps
  const eps = ((await plex(`/library/metadata/${id}/allLeaves`)).Metadata ?? []).filter((e) => e.type === 'episode')
  eps.forEach(remember)
  L.series.set(id, { at: Date.now(), eps })
  return eps
}

// ---------- pictures: Plex's own, resized, behind a signature (so the token never leaves the server) ----------
const sign = (p) => crypto.createHmac('sha256', PASS).update(p).digest('base64url').slice(0, 22)
const imgUrl = (base, path, w = 400, h = 600) => (path ? `${base}/img/${sign(`${path}|${w}x${h}`)}?p=${encodeURIComponent(path)}&w=${w}&h=${h}` : '')

// ---------- Xtream Codes API ----------
function api(L, base, q) {
  const a = q.get('action')
  const poster = (m) => imgUrl(base, m.thumb)
  const backdrop = (m) => (m.art ? [imgUrl(base, m.art, 1280, 720)] : [])
  const rating = (m) => String(m.audienceRating ?? m.rating ?? '0')
  const five = (m) => String(Math.round(((m.audienceRating ?? m.rating ?? 0) / 2) * 10) / 10)
  const genres = (m) => (m.Genre ?? []).map((g) => g.tag).join(', ')
  switch (a) {
    case 'get_vod_categories': return L.mcat.names.map((n, i) => ({ category_id: String(i + 1), category_name: n, parent_id: 0 }))
    case 'get_series_categories': return L.scat.names.map((n, i) => ({ category_id: String(i + 1), category_name: n, parent_id: 0 }))
    case 'get_live_categories': case 'get_live_streams': return []
    case 'get_vod_streams': {
      const want = q.get('category_id')
      return L.movies.filter((m) => m.Media?.length && (!want || L.mcat.id(m) === want)).map((m, i) => ({
        num: i + 1, name: m.title, stream_type: 'movie', stream_id: Number(m.ratingKey), stream_icon: poster(m), rating: rating(m), rating_5based: five(m),
        added: String(m.addedAt ?? 0), category_id: L.mcat.id(m), category_ids: [Number(L.mcat.id(m))], container_extension: ext(m), custom_sid: '', direct_source: '',
      }))
    }
    case 'get_series': {
      const want = q.get('category_id')
      return L.shows.filter((m) => !want || L.scat.id(m) === want).map((m, i) => ({
        num: i + 1, name: m.title, series_id: Number(m.ratingKey), cover: poster(m), plot: m.summary ?? '', cast: '', director: '', genre: genres(m),
        releaseDate: m.originallyAvailableAt ?? String(m.year ?? ''), last_modified: String(m.updatedAt ?? m.addedAt ?? 0), rating: rating(m), rating_5based: five(m),
        backdrop_path: backdrop(m), youtube_trailer: '', episode_run_time: String(Math.round((m.duration ?? 0) / 60000)), category_id: L.scat.id(m), category_ids: [Number(L.scat.id(m))],
      }))
    }
    default: return null
  }
}
async function vodInfo(L, base, id) {
  const m = ((await plex(`/library/metadata/${id}`)).Metadata ?? [])[0]
  if (!m) return {}
  remember(m)
  return {
    info: { movie_image: imgUrl(base, m.thumb), backdrop_path: m.art ? [imgUrl(base, m.art, 1280, 720)] : [], name: m.title, releasedate: m.originallyAvailableAt ?? String(m.year ?? ''), plot: m.summary ?? '',
      genre: (m.Genre ?? []).map((g) => g.tag).join(', '), duration_secs: sec(m.duration), duration: hms(m.duration), rating: String(m.audienceRating ?? m.rating ?? '0'), country: '', cast: (m.Role ?? []).slice(0, 8).map((r) => r.tag).join(', '), director: (m.Director ?? []).map((r) => r.tag).join(', ') },
    movie_data: { stream_id: Number(m.ratingKey), name: m.title, added: String(m.addedAt ?? 0), category_id: L.mcat.id(m), container_extension: ext(m), custom_sid: '', direct_source: '' },
  }
}
async function seriesInfo(L, base, id) {
  const show = L.shows.find((s) => String(s.ratingKey) === String(id)) ?? ((await plex(`/library/metadata/${id}`)).Metadata ?? [])[0]
  if (!show) return {}
  const eps = await episodes(String(id))
  const by = {}
  for (const e of eps) (by[e.parentIndex ?? 0] ??= []).push(e)
  const seasons = Object.keys(by).map(Number).sort((a, b) => a - b)
  const episodesOut = {}
  for (const n of seasons) episodesOut[n] = by[n].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((e) => ({
    id: String(e.ratingKey), episode_num: e.index ?? 0, title: e.title, container_extension: ext(e), custom_sid: '', added: String(e.addedAt ?? 0), season: n, direct_source: '',
    info: { movie_image: imgUrl(base, e.thumb, 640, 360), plot: e.summary ?? '', releasedate: e.originallyAvailableAt ?? '', duration_secs: sec(e.duration), duration: hms(e.duration), rating: String(e.audienceRating ?? e.rating ?? '0') },
  }))
  return {
    seasons: seasons.map((n) => ({ season_number: n, name: n === 0 ? 'Specials' : `Season ${n}`, episode_count: String(by[n].length), overview: '', air_date: '', cover: imgUrl(base, show.thumb), cover_big: imgUrl(base, show.thumb) })),
    info: { name: show.title, cover: imgUrl(base, show.thumb), plot: show.summary ?? '', genre: (show.Genre ?? []).map((g) => g.tag).join(', '), releaseDate: show.originallyAvailableAt ?? String(show.year ?? ''), rating: String(show.audienceRating ?? show.rating ?? '0'), backdrop_path: show.art ? [imgUrl(base, show.art, 1280, 720)] : [], category_id: L.scat.id(show) },
    episodes: episodesOut,
  }
}

// A plain M3U of everything, for apps that only take a playlist file.
function m3u(L, base) {
  const out = ['#EXTM3U']
  const line = (name, logo, group, url) => out.push(`#EXTINF:-1 tvg-name="${name.replace(/"/g, "'")}" tvg-logo="${logo}" group-title="${group.replace(/"/g, "'")}",${name}`, url)
  for (const m of L.movies) if (m.Media?.length) line(m.title, imgUrl(base, m.thumb), `Movies - ${m.Genre?.[0]?.tag || 'Other'}`, `${base}/movie/${USER}/${PASS}/${m.ratingKey}.${ext(m)}`)
  return out.join('\n') + '\n'
}

// ---------- the files: byte ranges passed straight through from Plex ----------
async function pipeFrom(path, req, res, head = false) {
  const ac = new AbortController()
  res.on('close', () => ac.abort())
  const h = plexHeaders({ Accept: '*/*' })
  if (req.headers.range) h.Range = req.headers.range
  let r
  try { r = await fetch(PLEX + path, { headers: h, signal: ac.signal, method: head ? 'HEAD' : 'GET' }) } catch { if (!res.headersSent) { res.writeHead(502).end() } return }
  const keep = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']
  const out = {}
  for (const k of keep) { const v = r.headers.get(k); if (v) out[k] = v }
  out['accept-ranges'] ??= 'bytes'
  res.writeHead(r.status, out)
  if (head || !r.body) return res.end()
  Readable.fromWeb(r.body).on('error', () => res.destroy()).pipe(res)
}
async function partFor(id) {
  if (parts.has(id)) return parts.get(id)
  const m = ((await plex(`/library/metadata/${id}`)).Metadata ?? [])[0]
  if (m) remember(m)
  return parts.get(id)
}

const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(typeof body === 'string' ? body : JSON.stringify(body)) }
const authed = (u, p) => u === USER && p === PASS
const baseOf = (req) => `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers['x-forwarded-host'] || req.headers.host}`

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), q = url.searchParams, base = baseOf(req)
  try {
    if (url.pathname === '/health') return send(res, 200, { ok: true })

    if (url.pathname.startsWith('/img/')) {
      const p = q.get('p') || '', w = Number(q.get('w') || 400), h = Number(q.get('h') || 600)
      if (!p || url.pathname.slice(5) !== sign(`${p}|${w}x${h}`)) return send(res, 403, { error: 'bad signature' })
      return pipeFrom(`/photo/:/transcode?width=${w}&height=${h}&minSize=1&upscale=1&url=${encodeURIComponent(p)}`, { headers: {} }, res)
    }

    const file = url.pathname.match(/^\/(movie|series)\/([^/]+)\/([^/]+)\/(\d+)(?:\.\w+)?$/)
    if (file) {
      if (!authed(decodeURIComponent(file[2]), decodeURIComponent(file[3]))) return send(res, 401, { error: 'unauthorized' })
      const part = await partFor(file[4])
      if (!part) return send(res, 404, { error: 'not found' })
      return pipeFrom(part.key, req, res, req.method === 'HEAD')
    }

    const isApi = url.pathname === '/player_api.php' || url.pathname === '/get.php' || url.pathname === '/xmltv.php'
    if (isApi) {
      if (!authed(q.get('username'), q.get('password'))) return send(res, 401, { user_info: { auth: 0 } })
      if (url.pathname === '/xmltv.php') return send(res, 200, '<?xml version="1.0" encoding="UTF-8"?><tv generator-info-name="chezzflix-bridge"></tv>\n', 'application/xml')
      const L = await library()
      if (url.pathname === '/get.php') return send(res, 200, m3u(L, base), 'audio/x-mpegurl')
      const a = q.get('action')
      if (!a) {
        const u = new URL(base)
        return send(res, 200, {
          user_info: { username: USER, password: PASS, message: 'Chezzflix Bridge', auth: 1, status: 'Active', exp_date: null, is_trial: '0', active_cons: '0', created_at: '1700000000', max_connections: '10', allowed_output_formats: ['m3u8', 'ts'] },
          server_info: { url: u.hostname, port: u.port || (u.protocol === 'https:' ? '443' : '80'), https_port: '443', server_protocol: u.protocol.replace(':', ''), rtmp_port: '0', timezone: 'UTC', timestamp_now: Math.floor(Date.now() / 1000), time_now: new Date().toISOString().replace('T', ' ').slice(0, 19) },
        })
      }
      if (a === 'get_vod_info') return send(res, 200, await vodInfo(L, base, q.get('vod_id')))
      if (a === 'get_series_info') return send(res, 200, await seriesInfo(L, base, q.get('series_id')))
      const r = api(L, base, q)
      return send(res, r ? 200 : 404, r ?? { error: `unknown action ${a}` })
    }
    send(res, 404, { error: 'not found' })
  } catch (e) {
    console.error(e.message)
    if (!res.headersSent) send(res, 502, { error: 'Plex did not answer' }); else res.destroy()
  }
}).listen(PORT, () => console.log(`Chezzflix Bridge on :${PORT}  (Xtream login: ${USER} / ${PASS})`))
