// Chezzflix settings sync (plain JavaScript, for pasting into the Cloudflare dashboard's Worker editor): stores each person's app settings (colours, home layout, TV Guide channels...) per Plex server, so a new device
// picks them up automatically.
//
// How it knows who is asking, without ever keeping a login: every request carries the person's Plex token. The Worker asks plex.tv who that
// token belongs to and whether that person can use the claimed server, then forgets the token. Settings are stored under a hash of
// (server id + Plex user id), so the database holds no names, tokens or passwords, and nobody can read or write someone else's row.
// The TMDB key and Overseerr address are never sent here (the app leaves them out).

const MAX_BYTES = 256 * 1024   // a person's settings, including their channels, are a few KB; this is generous
const MIN_GAP_MS = 1500        // a person can't hammer writes
const lastWrite = new Map()

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Plex-Token, X-Server-Id',
  'Access-Control-Max-Age': '86400',
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors } })

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const plexHeaders = (token) => ({ 'X-Plex-Token': token, Accept: 'application/json', 'X-Plex-Client-Identifier': 'chezzflix-sync', 'X-Plex-Product': 'Chezzflix Sync' })

/** Who owns this Plex token, and can they use this server? Returns the person's Plex id, or null. The token is used here and nowhere else. */
async function verify(env, token, serverId) {
  const base = env.PLEX_API ?? 'https://plex.tv'
  const [u, r] = await Promise.all([
    fetch(`${base}/api/v2/user`, { headers: plexHeaders(token) }),
    fetch(`${base}/api/v2/resources?includeHttps=1`, { headers: plexHeaders(token) }),
  ])
  if (!u.ok || !r.ok) return null
  const user = await u.json()
  const resources = await r.json()
  const who = user.uuid ?? (user.id != null ? String(user.id) : '')
  if (!who) return null
  if (!resources.some((x) => x.clientIdentifier === serverId && (x.provides ?? '').includes('server'))) return null   // not their server
  return who
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    const url = new URL(req.url)
    if (url.pathname === '/' || url.pathname === '/health') return json({ ok: true, service: 'chezzflix-sync' })
    if (url.pathname !== '/v1/settings') return json({ error: 'not found' }, 404)

    const token = req.headers.get('X-Plex-Token') ?? ''
    const serverId = req.headers.get('X-Server-Id') ?? ''
    if (!token || !serverId || serverId.length > 100) return json({ error: 'missing identity' }, 400)

    let who
    try { who = await verify(env, token, serverId) } catch { return json({ error: 'could not check with Plex' }, 502) }
    if (!who) return json({ error: 'not allowed' }, 403)
    const id = await sha256(`${serverId}|${who}`)

    if (req.method === 'GET') {
      const row = await env.DB.prepare('SELECT data, updated_at FROM settings WHERE id = ?').bind(id).first()
      if (!row) return json({ found: false })
      return json({ found: true, updatedAt: row.updated_at, data: JSON.parse(row.data) })
    }

    if (req.method === 'PUT') {
      const now = Date.now()
      if (now - (lastWrite.get(id) ?? 0) < MIN_GAP_MS) return json({ error: 'slow down' }, 429)
      lastWrite.set(id, now)
      if (lastWrite.size > 5000) lastWrite.clear()
      const text = await req.text()
      if (text.length > MAX_BYTES) return json({ error: 'too large' }, 413)
      let body
      try { body = JSON.parse(text) } catch { return json({ error: 'bad json' }, 400) }
      if (!body || typeof body.values !== 'object' || body.values === null || typeof body.meta !== 'object' || body.meta === null) return json({ error: 'bad shape' }, 400)
      const data = JSON.stringify({ values: body.values, meta: body.meta })
      await env.DB.prepare('INSERT INTO settings (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at').bind(id, data, now).run()
      return json({ ok: true, updatedAt: now })
    }
    return json({ error: 'method not allowed' }, 405)
  },
}
