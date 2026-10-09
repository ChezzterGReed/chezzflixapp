// Talks to the request service (Overseerr). People are signed in with their own Plex token, so a request counts as theirs,
// with their own permissions, limits and approvals. In the desktop app calls go through the native bridge (no CORS, keeps the
// sign-in cookie); if signing in isn't possible the UI falls back to a QR code for Overseerr's own page.
import { inTauri } from './player'

export interface RequestItem { tmdbId: number; type: 'movie' | 'tv'; title: string; year?: number; overview?: string; poster?: string; backdrop?: string; rating?: number }
export interface SeasonInfo { n: number; name: string; episodes?: number; state: RequestState }
export type RequestState = 'none' | 'pending' | 'processing' | 'partial' | 'available'

export type ErrorKind = 'unreachable' | 'signin' | 'rejected' | 'exists' | 'failed'
export class RequestError extends Error {
  kind: ErrorKind
  constructor(kind: ErrorKind, message: string) { super(message); this.kind = kind }
}

export const DEMO_REQUESTS_URL = 'https://requests.demo'

/** "requests.example.com/" -> "https://requests.example.com" */
export function normalizeBase(raw: string): string {
  let u = raw.trim()
  if (!u) return ''
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`
  return u.replace(/\/(api(\/.*)?)?\/*$/i, '').replace(/\/+$/, '')
}
/** Overseerr's own page for a title (what the QR code points at). */
export const webUrl = (base: string, item: Pick<RequestItem, 'type' | 'tmdbId'>) => `${normalizeBase(base)}/${item.type}/${item.tmdbId}`

interface Res { status: number; json: any } // eslint-disable-line @typescript-eslint/no-explicit-any

async function http(method: string, url: string, body?: unknown): Promise<Res> {
  try {
    if (inTauri) {
      const { invoke } = await import('@tauri-apps/api/core')
      const r = await invoke<{ status: number; body: string }>('requests_http', { req: { method, url, body } })
      let json: unknown = null
      try { json = JSON.parse(r.body) } catch { /* not JSON */ }
      return { status: r.status, json }
    }
    const r = await fetch(url, { method, credentials: 'include', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
    return { status: r.status, json: await r.json().catch(() => null) }
  } catch (e) {
    throw new RequestError('unreachable', typeof e === 'string' ? e : "Couldn't reach the request server.")
  }
}

// ---- demo mode: a fake Overseerr so the whole flow can be previewed ----
const demoPending = new Set<string>()
async function demo(method: string, path: string, body?: any): Promise<Res> { // eslint-disable-line @typescript-eslint/no-explicit-any
  await new Promise((r) => setTimeout(r, 650))
  if (path === '/auth/plex') return { status: 200, json: { displayName: 'Chezz' } }
  if (path === '/auth/me') return { status: 200, json: { displayName: 'Chezz' } }
  const m = path.match(/^\/(movie|tv)\/(\d+)/)
  if (m && method === 'GET') {
    const pending = demoPending.has(`${m[1]}:${m[2]}`)
    return { status: 200, json: { mediaInfo: pending ? { status: 2, seasons: [{ seasonNumber: 1, status: 2 }] } : undefined } }
  }
  if (path === '/request' && method === 'POST') { demoPending.add(`${body.mediaType}:${body.mediaId}`); return { status: 201, json: { id: 1 } } }
  return { status: 404, json: null }
}

// ---- session ----
const signedIn = new Map<string, number>()
const FRESH_MS = 15 * 60_000

async function call(base: string, token: string, method: string, path: string, body?: unknown): Promise<Res> {
  const isDemo = base === DEMO_REQUESTS_URL
  const go = () => (isDemo ? demo(method, path, body) : http(method, `${base}/api/v1${path}`, body))
  const key = `${base}|${token.slice(-8)}`
  if (!isDemo && !(Date.now() - (signedIn.get(key) ?? 0) < FRESH_MS)) {
    const r = await go0(base, token)
    if (!r) throw new RequestError('signin', "Couldn't sign you in to the request service.")
    signedIn.set(key, Date.now())
  }
  let r = await go()
  if (r.status === 401 && !isDemo) { signedIn.delete(key); if (await go0(base, token)) { signedIn.set(key, Date.now()); r = await go() } }
  return r
}
async function go0(base: string, token: string): Promise<boolean> {
  const r = await http('POST', `${base}/api/v1/auth/plex`, { authToken: token })
  if (r.status === 200) return true
  if (r.status === 401 || r.status === 403) throw new RequestError('signin', r.json?.message ?? "This Plex account isn't set up on the request service yet.")
  throw new RequestError('failed', r.json?.message ?? `The request service answered with an error (${r.status}).`)
}

/** Signs in and returns the display name: used by the Settings "Test" button. */
export async function testConnection(rawBase: string, token: string): Promise<string> {
  const base = normalizeBase(rawBase)
  if (base === DEMO_REQUESTS_URL) return (await demo('GET', '/auth/me')).json.displayName
  if (!(await go0(base, token))) throw new RequestError('signin', 'Sign-in was refused.')
  const me = await http('GET', `${base}/api/v1/auth/me`)
  return me.json?.displayName ?? me.json?.plexUsername ?? me.json?.email ?? 'your account'
}

const STATES: Record<number, RequestState> = { 2: 'pending', 3: 'processing', 4: 'partial', 5: 'available' }

/** Is it already requested/available? Null when the request service can't be asked (e.g. not signed in). */
export async function getState(rawBase: string, token: string, item: RequestItem): Promise<{ state: RequestState; seasons: Map<number, RequestState> } | null> {
  try {
    const r = await call(normalizeBase(rawBase), token, 'GET', `/${item.type}/${item.tmdbId}`)
    if (r.status !== 200) return null
    const info = r.json?.mediaInfo
    const seasons = new Map<number, RequestState>()
    for (const s of info?.seasons ?? []) if (STATES[s.status]) seasons.set(s.seasonNumber, STATES[s.status])
    return { state: STATES[info?.status] ?? 'none', seasons }
  } catch { return null }
}

/** Submits the request. Throws a RequestError describing why not (the UI then offers the QR code). */
export async function submitRequest(rawBase: string, token: string, item: RequestItem, seasons?: number[] | 'all'): Promise<void> {
  const r = await call(normalizeBase(rawBase), token, 'POST', '/request', { mediaType: item.type, mediaId: item.tmdbId, ...(item.type === 'tv' ? { seasons: seasons ?? 'all' } : {}) })
  if (r.status === 200 || r.status === 201) return
  const msg: string | undefined = r.json?.message
  if (r.status === 409) throw new RequestError('exists', 'This has already been requested.')
  if (r.status === 403) throw new RequestError('rejected', msg ?? "You don't have permission to request this (or you've reached your limit).")
  if (r.status === 401) throw new RequestError('signin', msg ?? "Couldn't sign you in to the request service.")
  throw new RequestError('failed', msg ?? `The request service answered with an error (${r.status}).`)
}
