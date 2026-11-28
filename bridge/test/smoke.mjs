// Starts a fake Plex and the bridge, then checks the Xtream endpoints and that file ranges pass straight through.
import http from 'node:http'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'

const FILE = Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 251))
const md = (o) => ({ addedAt: 1700000000, thumb: '/library/metadata/1/thumb/1', art: '/library/metadata/1/art/1', Genre: [{ tag: 'Drama' }], ...o })
const movie = md({ ratingKey: '11', type: 'movie', title: 'Test Movie', year: 2020, summary: 'A movie.', duration: 5400000, Media: [{ container: 'mkv', Part: [{ key: '/library/parts/111/1/file.mkv' }] }] })
const show = md({ ratingKey: '20', type: 'show', title: 'Test Show', year: 2019, summary: 'A show.' })
const eps = [1, 2].map((n) => md({ ratingKey: String(30 + n), type: 'episode', title: `Ep ${n}`, parentIndex: 1, index: n, duration: 1500000, Media: [{ container: 'mp4', Part: [{ key: `/library/parts/22${n}/1/file.mp4` }] }] }))

const plex = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), j = (mc) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ MediaContainer: mc })) }
  if (req.headers['x-plex-token'] !== 'tok') { res.writeHead(401); return res.end() }
  if (u.pathname === '/library/sections') return j({ Directory: [{ key: '1', type: 'movie', title: 'Movies' }, { key: '2', type: 'show', title: 'TV Shows' }, { key: '3', type: 'artist', title: 'Music' }] })
  if (u.pathname === '/library/sections/1/all') return j({ Metadata: [movie] })
  if (u.pathname === '/library/sections/2/all') return j({ Metadata: [show] })
  if (u.pathname === '/library/metadata/20/allLeaves') return j({ Metadata: eps })
  if (u.pathname === '/library/metadata/11') return j({ Metadata: [movie] })
  if (u.pathname === '/photo/:/transcode') { res.writeHead(200, { 'content-type': 'image/jpeg' }); return res.end('JPEG') }
  if (u.pathname.startsWith('/library/parts/')) {
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '')
    if (!m) { res.writeHead(200, { 'content-length': FILE.length, 'accept-ranges': 'bytes', 'content-type': 'video/x-matroska' }); return res.end(FILE) }
    const a = +m[1], b = m[2] ? +m[2] : FILE.length - 1
    res.writeHead(206, { 'content-range': `bytes ${a}-${b}/${FILE.length}`, 'content-length': b - a + 1, 'accept-ranges': 'bytes' }); return res.end(FILE.subarray(a, b + 1))
  }
  res.writeHead(404); res.end()
})
await new Promise((r) => plex.listen(0, r))
const bridge = spawn('node', ['server.mjs'], { env: { ...process.env, PLEX_URL: `http://127.0.0.1:${plex.address().port}`, PLEX_TOKEN: 'tok', BRIDGE_USER: 'u', BRIDGE_PASS: 'p', PORT: '18080' }, stdio: ['ignore', 'pipe', 'inherit'] })
await new Promise((r) => bridge.stdout.on('data', () => r()))
const B = 'http://127.0.0.1:18080', A = `${B}/player_api.php?username=u&password=p`
const get = async (u, o) => { const r = await fetch(u, o); return { r, body: await r.text() } }
const json = async (u) => JSON.parse((await get(u)).body)
let failed = false
try {
  assert.equal((await get(`${B}/player_api.php?username=u&password=bad`)).r.status, 401)
  const info = await json(A); assert.equal(info.user_info.auth, 1); assert.equal(info.server_info.port, '18080')
  const vc = await json(`${A}&action=get_vod_categories`); assert.deepEqual(vc.map((c) => c.category_name), ['Drama'])
  const vs = await json(`${A}&action=get_vod_streams`); assert.equal(vs.length, 1); assert.equal(vs[0].stream_id, 11); assert.equal(vs[0].container_extension, 'mkv')
  assert.equal((await json(`${A}&action=get_vod_streams&category_id=9`)).length, 0)
  const vi = await json(`${A}&action=get_vod_info&vod_id=11`); assert.equal(vi.movie_data.stream_id, 11); assert.equal(vi.info.duration, '01:30:00')
  const ss = await json(`${A}&action=get_series`); assert.equal(ss[0].series_id, 20)
  const si = await json(`${A}&action=get_series_info&series_id=20`); assert.equal(si.episodes['1'].length, 2); assert.equal(si.episodes['1'][0].container_extension, 'mp4'); assert.equal(si.seasons[0].episode_count, '2')
  assert.deepEqual(await json(`${A}&action=get_live_streams`), [])
  // the original file, whole and by range
  const whole = await fetch(`${B}/movie/u/p/11.mkv`); assert.equal(whole.status, 200); assert.equal(Buffer.compare(Buffer.from(await whole.arrayBuffer()), FILE), 0)
  const part = await fetch(`${B}/movie/u/p/11.mkv`, { headers: { Range: 'bytes=100-199' } }); assert.equal(part.status, 206); assert.equal(Buffer.compare(Buffer.from(await part.arrayBuffer()), FILE.subarray(100, 200)), 0)
  const epf = await fetch(`${B}/series/u/p/32.mp4`, { headers: { Range: 'bytes=0-9' } }); assert.equal(epf.status, 206)
  assert.equal((await fetch(`${B}/movie/u/wrong/11.mkv`)).status, 401)
  // pictures need the bridge's signature; the Plex token is never in what the app sees
  const icon = vs[0].stream_icon; assert.ok(!icon.includes('tok')); assert.equal((await get(icon)).body, 'JPEG')
  assert.equal((await get(icon.replace(/\/img\/[^?]+/, '/img/nope'))).r.status, 403)
  const pl = (await get(`${B}/get.php?username=u&password=p&type=m3u_plus`)).body; assert.match(pl, /^#EXTM3U/); assert.match(pl, /\/movie\/u\/p\/11\.mkv/)
  console.log('all checks passed')
} catch (e) { failed = true; console.error(e) }
bridge.kill(); plex.close(); process.exit(failed ? 1 : 0)
