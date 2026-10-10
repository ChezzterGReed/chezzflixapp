// Plex API layer. Direct play is the default; transcode is an explicit fallback.
import { artUrl, mockGet } from './mock'

const PRODUCT = 'Chezzflix'
export const DEMO_URI = 'demo://'

export function clientId(): string {
  let id = localStorage.getItem('plex_client_id')
  if (!id) {
    id = 'chezzflix-' + crypto.randomUUID()
    localStorage.setItem('plex_client_id', id)
  }
  return id
}

/** What Plex shows in its dashboard for this player: the device's name and platform (not just "Web"). */
function deviceInfo() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/Android/i.test(ua)) {
    const model = /Android[^;)]*;\s*([^;)]+?)\s*(?:Build\/|\))/i.exec(ua)?.[1]?.trim()
    return { name: model || 'Android TV', platform: 'Android', device: model || 'Android TV' }
  }
  if (/Mac/i.test(ua)) return { name: 'Mac', platform: 'macOS', device: 'Mac' }
  return { name: 'Web browser', platform: 'Web', device: 'Browser' }
}
const DEVICE = deviceInfo()

function baseHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/json',
    'X-Plex-Product': PRODUCT,
    'X-Plex-Version': '0.3.5',
    'X-Plex-Client-Identifier': clientId(),
    'X-Plex-Platform': DEVICE.platform,
    'X-Plex-Device': DEVICE.device,
    'X-Plex-Device-Name': DEVICE.name,
  }
  if (token) h['X-Plex-Token'] = token
  return h
}

export interface PlexServer {
  name: string
  /** The server's machine identifier (stable, only visible to people with access to it). */
  id?: string
  uri: string
  accessToken: string
  local: boolean
  /** This account owns the server (so it may see the dashboard). */
  owned?: boolean
  /** Connected through Plex's relay (bandwidth-limited) because no direct route was reachable. */
  relay?: boolean
}

export interface PlexTag { tag: string; role?: string; thumb?: string }

export interface PlexMedia {
  ratingKey: string
  title: string
  type: 'movie' | 'show' | 'season' | 'episode' | string
  summary?: string
  tagline?: string
  year?: number
  rating?: number
  audienceRating?: number
  contentRating?: string
  thumb?: string
  art?: string
  duration?: number
  viewOffset?: number
  lastViewedAt?: number
  /** Plex's own id for the title (plex://movie/…): the same everywhere, so it links a library item to the Watchlist. */
  guid?: string
  Guid?: { id: string }[]
  viewCount?: number
  leafCount?: number
  viewedLeafCount?: number
  childCount?: number
  addedAt?: number
  originallyAvailableAt?: string
  studio?: string
  grandparentTitle?: string
  grandparentThumb?: string
  grandparentArt?: string
  grandparentRatingKey?: string
  parentTitle?: string
  parentRatingKey?: string
  parentThumb?: string
  index?: number
  parentIndex?: number
  Genre?: PlexTag[]
  Collection?: PlexTag[]
  Role?: PlexTag[]
  Director?: PlexTag[]
  userRating?: number
  Image?: { type: string; url: string }[]
  OnDeck?: { Metadata?: PlexMedia }
  librarySectionID?: number | string
  Marker?: PlexMarker[]
  Media?: PlexMediaInfo[]
}

export interface PlexMarker { type: string; startTimeOffset: number; endTimeOffset: number }
export interface PlexStream { id: number; streamType: 1 | 2 | 3 | number; codec?: string; language?: string; languageCode?: string; displayTitle?: string; selected?: boolean; key?: string; format?: string; forced?: boolean; default?: boolean; channels?: number }
export interface PlexMediaInfo { Part: { key: string; file?: string; Stream?: PlexStream[] }[]; container?: string; videoCodec?: string; audioCodec?: string; videoResolution?: string; bitrate?: number }

export interface PlexHub {
  title: string
  hubIdentifier: string
  type?: string
  Metadata?: PlexMedia[]
}

export interface PlexSection { key: string; title: string; type: string; agent?: string; scanner?: string }
/** "Other Videos" / personal-media libraries (home videos, concerts, clips): Plex files them under movies but they have no metadata agent. */
export const isOtherSection = (s: PlexSection) => /\.none$/i.test(s.agent ?? '') || /video files/i.test(s.scanner ?? '')
export interface PlexProfile { id: number; uuid: string; title: string; thumb?: string; protected?: boolean; admin?: boolean }

// ---------- Auth (PIN flow) ----------
/** strong=false -> short 4-char code for plex.tv/link; strong=true -> long code for the browser auth URL. */
export async function requestPin(strong = false) {
  const r = await fetch(`https://plex.tv/api/v2/pins?strong=${strong}`, { method: 'POST', headers: baseHeaders() })
  if (!r.ok) throw new Error(`Plex returned ${r.status}`)
  return (await r.json()) as { id: number; code: string; expiresIn?: number; expiresAt?: string }
}

export function authUrl(code: string) {
  const p = new URLSearchParams({ clientID: clientId(), code })
  return `https://app.plex.tv/auth#?${p}&context[device][product]=${PRODUCT}`
}

export async function checkPin(id: number): Promise<string | null> {
  const r = await fetch(`https://plex.tv/api/v2/pins/${id}`, { headers: baseHeaders() })
  return (await r.json()).authToken ?? null
}

// ---------- Profiles ----------
export async function getProfiles(token: string): Promise<PlexProfile[]> {
  if (token === 'demo') return mockGet('/profiles') as PlexProfile[]
  const r = await fetch('https://clients.plex.tv/api/v2/home/users', { headers: baseHeaders(token) })
  if (!r.ok) return []
  const j = await r.json()
  return (j.users ?? j) as PlexProfile[]
}

/** Returns the new profile's auth token. Throws on wrong PIN. */
export async function switchProfile(token: string, uuid: string, pin?: string): Promise<string> {
  const q = pin ? `?pin=${encodeURIComponent(pin)}` : ''
  const r = await fetch(`https://clients.plex.tv/api/v2/home/users/${uuid}/switch${q}`, { method: 'POST', headers: baseHeaders(token) })
  if (!r.ok) throw new Error(r.status === 403 ? 'Incorrect PIN' : `Could not switch profile (${r.status})`)
  return (await r.json()).authToken
}

export async function getCurrentUser(token: string): Promise<{ title: string; thumb?: string; uuid?: string }> {
  if (token === 'demo') return { title: 'Chezz', thumb: 'demo:avatar:Chezz', uuid: 'u1' }
  const r = await fetch('https://clients.plex.tv/api/v2/user', { headers: baseHeaders(token) })
  return r.json()
}

// ---------- Servers ----------
export function demoServer(): PlexServer {
  return { id: 'demo-server', owned: true, name: 'Demo Server', uri: DEMO_URI, accessToken: 'demo', local: true }
}

interface PlexConnection { uri: string; local: boolean; relay: boolean }

/** Asks a connection who it is, and only accepts it if it's really *this* server (guards against another device on the same LAN address). */
async function probe(uri: string, token: string, machineId: string | undefined, timeoutMs: number): Promise<boolean> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(`${uri}/identity`, { headers: baseHeaders(token), signal: ctrl.signal })
    if (!r.ok) return false
    const id = (await r.json())?.MediaContainer?.machineIdentifier
    return !machineId || !id || id === machineId
  } catch { return false } finally { clearTimeout(timer) }
}

/**
 * Picks the best working way to reach a server: your home network if you're on it, otherwise your server's
 * direct remote address, otherwise Plex's relay (slow, capped). All connections are tried at once.
 */
async function pickConnection(conns: PlexConnection[], token: string, machineId?: string): Promise<PlexConnection | null> {
  const probes = conns.map((c) => ({ c, ok: probe(c.uri, token, machineId, c.local ? 1800 : c.relay ? 6000 : 4500) }))
  const firstOf = (pred: (c: PlexConnection) => boolean) =>
    Promise.any(probes.filter((p) => pred(p.c)).map((p) => p.ok.then((ok) => (ok ? p.c : Promise.reject(new Error('unreachable'))))))
  for (const tier of [(c: PlexConnection) => c.local, (c: PlexConnection) => !c.local && !c.relay, (c: PlexConnection) => c.relay]) {
    try { return await firstOf(tier) } catch { /* nothing in this tier answered; try the next */ }
  }
  return null
}

export async function getServers(token: string): Promise<PlexServer[]> {
  if (token === 'demo') return [demoServer()]
  const r = await fetch('https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1', { headers: baseHeaders(token) })
  const resources = await r.json()
  const out: PlexServer[] = []
  for (const res of resources) {
    if (!res.provides?.includes('server')) continue
    const conns: PlexConnection[] = res.connections ?? []
    const chosen = (await pickConnection(conns, res.accessToken, res.clientIdentifier)) ?? conns.find((c) => !c.relay) ?? conns[0]
    if (chosen) out.push({ id: res.clientIdentifier, owned: !!res.owned, name: res.name, uri: chosen.uri, accessToken: res.accessToken, local: chosen.local, relay: chosen.relay })
  }
  return out
}

// ---------- Requests (cached; stale-while-revalidate keeps navigation instant) ----------
const cache = new Map<string, { at: number; data: unknown }>()
const inflight = new Map<string, Promise<unknown>>()

async function get<T>(server: PlexServer, path: string, ttl = 60_000): Promise<T> {
  const key = server.uri + path
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.data as T
  if (inflight.has(key)) return inflight.get(key) as Promise<T>
  const p = (async () => {
    let data: unknown
    if (server.uri === DEMO_URI) {
      await new Promise((r) => setTimeout(r, 120)) // feel real latency in demo
      data = mockGet(path)
    } else {
      const r = await fetch(`${server.uri}${path}`, { headers: baseHeaders(server.accessToken) })
      if (!r.ok) throw new Error(`Plex ${r.status} on ${path}`)
      data = (await r.json()).MediaContainer
    }
    cache.set(key, { at: Date.now(), data })
    return data
  })().finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p as Promise<T>
}

export function invalidateCache() { cache.clear() }

/** Best-effort: ask the server to drop an item from Continue Watching. (Hiding is also done locally, per profile.) */
export async function removeFromContinueWatching(server: PlexServer, ratingKey: string) {
  if (server.uri === DEMO_URI) return
  await fetch(`${server.uri}/actions/removeFromContinueWatching?ratingKey=${encodeURIComponent(ratingKey)}`, { method: 'PUT', headers: baseHeaders(server.accessToken) }).catch(() => {})
  invalidateCache()
}

/** Every item in a library with its external ids (tmdb://…), for matching against TMDB lists. */
export async function getSectionWithGuids(server: PlexServer, sectionKey: string): Promise<PlexMedia[]> {
  const c = await get<{ Metadata?: PlexMedia[] }>(server, `/library/sections/${sectionKey}/all?includeGuids=1&X-Plex-Container-Start=0&X-Plex-Container-Size=10000`, 300_000)
  return c.Metadata ?? []
}

// ---------- Library ----------
export async function getSections(server: PlexServer): Promise<PlexSection[]> {
  const c = await get<{ Directory?: PlexSection[] }>(server, '/library/sections')
  return (c.Directory ?? []).filter((d) => d.type === 'movie' || d.type === 'show')
}

export async function getHubs(server: PlexServer): Promise<PlexHub[]> {
  const c = await get<{ Hub?: PlexHub[] }>(server, '/hubs?count=24')
  return (c.Hub ?? []).filter((h) => h.Metadata?.length)
}

export async function getSectionHubs(server: PlexServer, key: string): Promise<PlexHub[]> {
  const c = await get<{ Hub?: PlexHub[] }>(server, `/hubs/sections/${key}?count=24`)
  return (c.Hub ?? []).filter((h) => h.Metadata?.length)
}

export interface PlexGenre { key: string; title: string }
export async function getGenres(server: PlexServer, sectionKey: string): Promise<PlexGenre[]> {
  const c = await get<{ Directory?: PlexGenre[] }>(server, `/library/sections/${sectionKey}/genre`)
  return c.Directory ?? []
}

export async function getGenreItems(server: PlexServer, sectionKey: string, genreKey: string, size = 30): Promise<PlexMedia[]> {
  const c = await get<{ Metadata?: PlexMedia[] }>(server, `/library/sections/${sectionKey}/all?genre=${encodeURIComponent(genreKey)}&sort=addedAt:desc&X-Plex-Container-Start=0&X-Plex-Container-Size=${size}`)
  return c.Metadata ?? []
}

export async function getGenreRandom(server: PlexServer, sectionKey: string, genreKey: string, size = 14): Promise<PlexMedia[]> {
  const c = await get<{ Metadata?: PlexMedia[] }>(server, `/library/sections/${sectionKey}/all?genre=${encodeURIComponent(genreKey)}&sort=random&X-Plex-Container-Start=0&X-Plex-Container-Size=${size}`, 0)
  return c.Metadata ?? []
}

export async function getRandomItems(server: PlexServer, sectionKey: string, size = 12): Promise<PlexMedia[]> {
  const c = await get<{ Metadata?: PlexMedia[] }>(server, `/library/sections/${sectionKey}/all?sort=random&X-Plex-Container-Start=0&X-Plex-Container-Size=${size}`, 0)
  return c.Metadata ?? []
}

export interface PlexCollectionRef { ratingKey: string; title: string; thumb?: string; sectionKey?: string }
export async function getPlaylists(server: PlexServer): Promise<PlexCollectionRef[]> {
  try {
    const c = await get<{ Metadata?: PlexCollectionRef[] }>(server, '/playlists?playlistType=video')
    return c.Metadata ?? []
  } catch { return [] }
}
export async function getPlaylistItems(server: PlexServer, id: string): Promise<PlexMedia[]> {
  const c = await get<{ Metadata?: PlexMedia[] }>(server, `/playlists/${id}/items`)
  return c.Metadata ?? []
}
export async function getCollections(server: PlexServer, sectionKey: string): Promise<PlexCollectionRef[]> {
  try {
    const c = await get<{ Metadata?: PlexCollectionRef[] }>(server, `/library/sections/${sectionKey}/collections`)
    return (c.Metadata ?? []).map((m) => ({ ...m, sectionKey }))
  } catch { return [] }
}
export async function getCollectionItems(server: PlexServer, id: string): Promise<PlexMedia[]> {
  const c = await get<{ Metadata?: PlexMedia[] }>(server, `/library/collections/${id}/children`)
  return c.Metadata ?? []
}

/** The episode before `ep` (rolls back into the previous season's last episode). */
export async function getPreviousEpisode(server: PlexServer, ep: PlexMedia): Promise<PlexMedia | null> {
  if (ep.type !== 'episode' || !ep.parentRatingKey) return null
  const siblings = await getChildren(server, ep.parentRatingKey)
  const i = siblings.findIndex((e) => e.ratingKey === ep.ratingKey)
  if (i > 0) return siblings[i - 1]
  if (!ep.grandparentRatingKey) return null
  const seasons = (await getChildren(server, ep.grandparentRatingKey)).filter((s) => s.index !== 0)
  const si = seasons.findIndex((s) => s.ratingKey === ep.parentRatingKey)
  const before = si > 0 ? seasons[si - 1] : undefined
  if (!before) return null
  const eps = await getChildren(server, before.ratingKey)
  return eps[eps.length - 1] ?? null
}

/** The episode that follows `ep` (rolls over into the next season). */
export async function getNextEpisode(server: PlexServer, ep: PlexMedia): Promise<PlexMedia | null> {
  if (ep.type !== 'episode' || !ep.parentRatingKey) return null
  const siblings = await getChildren(server, ep.parentRatingKey)
  const i = siblings.findIndex((e) => e.ratingKey === ep.ratingKey)
  if (i >= 0 && siblings[i + 1]) return siblings[i + 1]
  if (!ep.grandparentRatingKey) return null
  const seasons = (await getChildren(server, ep.grandparentRatingKey)).filter((s) => s.index !== 0)
  const si = seasons.findIndex((s) => s.ratingKey === ep.parentRatingKey)
  const next = seasons[si + 1]
  return next ? (await getChildren(server, next.ratingKey))[0] ?? null : null
}

export async function getOnDeck(server: PlexServer): Promise<PlexMedia[]> {
  const c = await get<{ Metadata?: PlexMedia[] }>(server, '/library/onDeck')
  return c.Metadata ?? []
}

export async function getMetadata(server: PlexServer, ratingKey: string): Promise<PlexMedia> {
  const c = await get<{ Metadata: PlexMedia[] }>(server, `/library/metadata/${ratingKey}?includeOnDeck=1&includeMarkers=1`, 30_000)
  return c.Metadata[0]
}

/** Every episode of a show in one request (season and episode numbers included). */
export async function getAllLeaves(server: PlexServer, ratingKey: string): Promise<PlexMedia[]> {
  const c = await get<{ Metadata?: PlexMedia[] }>(server, `/library/metadata/${ratingKey}/allLeaves`, 300_000)
  return c.Metadata ?? []
}
export async function getChildren(server: PlexServer, ratingKey: string): Promise<PlexMedia[]> {
  const c = await get<{ Metadata?: PlexMedia[] }>(server, `/library/metadata/${ratingKey}/children`)
  return c.Metadata ?? []
}

export async function getRelated(server: PlexServer, ratingKey: string): Promise<PlexMedia[]> {
  try {
    const c = await get<{ Hub?: PlexHub[] }>(server, `/hubs/metadata/${ratingKey}/related`)
    return (c.Hub ?? []).flatMap((h) => h.Metadata ?? []).slice(0, 20)
  } catch { return [] }
}

export const SORTS = {
  titleAsc: { label: 'A – Z', q: 'titleSort' },
  titleDesc: { label: 'Z – A', q: 'titleSort:desc' },
  added: { label: 'Recently added', q: 'addedAt:desc' },
  released: { label: 'Release date', q: 'originallyAvailableAt:desc' },
} as const
export type SortKey = keyof typeof SORTS

export async function getSectionItems(server: PlexServer, key: string, sort: SortKey | string, start = 0, size = 120, year?: number, unwatched = false) {
  const sortQ = (SORTS as Record<string, { q: string }>)[sort]?.q ?? sort
  const q = `sort=${encodeURIComponent(sortQ)}&X-Plex-Container-Start=${start}&X-Plex-Container-Size=${size}${year ? `&year=${year}` : ''}${unwatched ? '&unwatched=1' : ''}`
  const c = await get<{ Metadata?: PlexMedia[]; totalSize?: number }>(server, `/library/sections/${key}/all?${q}`)
  return { items: c.Metadata ?? [], total: c.totalSize ?? c.Metadata?.length ?? 0 }
}

/** The whole library (paged in chunks) — used when collections are grouped client-side. */
export async function getAllSectionItems(server: PlexServer, key: string, sort: SortKey | string, year?: number, cap = 5000, unwatched = false): Promise<PlexMedia[]> {
  const out: PlexMedia[] = []
  for (let start = 0; start < cap; start += 500) {
    const r = await getSectionItems(server, key, sort, start, 500, year, unwatched)
    out.push(...r.items)
    if (out.length >= r.total || r.items.length === 0) break
  }
  return out
}

/** What this profile has watched or is watching, newest first (movies with a play or progress, shows with any episode watched). */
export async function getWatchedItems(server: PlexServer, sectionKey: string, size = 160): Promise<PlexMedia[]> {
  const c = await get<{ Metadata?: PlexMedia[] }>(server, `/library/sections/${sectionKey}/all?sort=lastViewedAt:desc&X-Plex-Container-Start=0&X-Plex-Container-Size=${size}`, 300_000)
  return (c.Metadata ?? []).filter((m) => (m.type === 'movie' ? (m.viewCount ?? 0) > 0 || (m.viewOffset ?? 0) > 0 : (m.viewedLeafCount ?? 0) > 0))
}

/** Titles this profile hasn't started (up to `cap`, newest added first). */
export async function getUnwatchedItems(server: PlexServer, sectionKey: string, cap = 1500): Promise<PlexMedia[]> {
  const out: PlexMedia[] = []
  for (let start = 0; start < cap; start += 500) {
    const c = await get<{ Metadata?: PlexMedia[]; totalSize?: number }>(server, `/library/sections/${sectionKey}/all?unwatched=1&sort=addedAt:desc&X-Plex-Container-Start=${start}&X-Plex-Container-Size=500`, 300_000)
    out.push(...(c.Metadata ?? []))
    if (out.length >= (c.totalSize ?? 0) || !(c.Metadata ?? []).length) break
  }
  return out.filter((m) => m.type === 'movie' ? (m.viewOffset ?? 0) === 0 : (m.viewedLeafCount ?? 0) === 0)
}

/** Years that have content in a library (for the year filter). */
export async function getYears(server: PlexServer, sectionKey: string): Promise<number[]> {
  try {
    const c = await get<{ Directory?: { title: string }[] }>(server, `/library/sections/${sectionKey}/year`)
    return (c.Directory ?? []).map((d) => parseInt(d.title)).filter((n) => n > 1800).sort((a, b) => b - a)
  } catch { return [] }
}

/** Shows only: newest by latest episode added (what Plex's own "Recently Added" shows). */
export async function getRecentShows(server: PlexServer, sectionKey: string, size = 30): Promise<PlexMedia[]> {
  try {
    const c = await get<{ Metadata?: PlexMedia[] }>(server, `/library/sections/${sectionKey}/recentlyAdded?type=2&X-Plex-Container-Start=0&X-Plex-Container-Size=${size}`)
    return c.Metadata ?? []
  } catch { return [] }
}

export async function search(server: PlexServer, query: string): Promise<PlexMedia[]> {
  const c = await get<{ Hub?: PlexHub[] }>(server, `/hubs/search?query=${encodeURIComponent(query)}&limit=24`, 15_000)
  return (c.Hub ?? []).filter((h) => ['movie', 'show'].includes(h.type ?? '')).flatMap((h) => h.Metadata ?? [])
}

export async function setWatched(server: PlexServer, ratingKey: string, watched: boolean) {
  if (server.uri === DEMO_URI) return
  const p = new URLSearchParams({ key: ratingKey, identifier: 'com.plexapp.plugins.library' })
  await fetch(`${server.uri}/:/${watched ? 'scrobble' : 'unscrobble'}?${p}`, { headers: baseHeaders(server.accessToken) })
  invalidateCache()
}

// ---------- Display helpers ----------
export function imageUrl(server: PlexServer, path: string | undefined, w = 300, h = 450) {
  if (!path) return ''
  if (server.uri === DEMO_URI) return artUrl(path, w, h)
  const p = new URLSearchParams({ width: String(w), height: String(h), minSize: '1', upscale: '1', url: path, 'X-Plex-Token': server.accessToken })
  return `${server.uri}/photo/:/transcode?${p}`
}

/** Poster for display: episodes show their series poster, not the episode still. */
export function posterPath(m: PlexMedia): string | undefined {
  if (m.type === 'episode') return m.grandparentThumb ?? m.thumb
  if (m.type === 'season') return m.thumb ?? m.parentThumb
  return m.thumb
}

export function backdropPath(m: PlexMedia): string | undefined {
  return m.art ?? m.grandparentArt
}

export function logoPath(m: PlexMedia): string | undefined {
  return m.Image?.find((i) => i.type === 'clearLogo')?.url
}

export function progressOf(m: PlexMedia): number {
  if (m.viewOffset && m.duration) return Math.min(1, m.viewOffset / m.duration)
  return 0
}

export function isWatched(m: PlexMedia): boolean {
  if (m.type === 'show' || m.type === 'season') return !!m.leafCount && m.viewedLeafCount === m.leafCount
  return (m.viewCount ?? 0) > 0 && !m.viewOffset
}

/** An episode you haven't started: its still and description could spoil the story. */
export function isSpoilerRisk(m: PlexMedia): boolean {
  return m.type === 'episode' && !isWatched(m) && !m.viewOffset
}

export function formatRuntime(ms?: number): string {
  if (!ms) return ''
  const m = Math.round(ms / 60000)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}

export function formatLeft(m: PlexMedia): string {
  if (!m.duration || !m.viewOffset) return ''
  return `${formatRuntime(m.duration - m.viewOffset)} left`
}

export function episodeLabel(m: PlexMedia): string {
  return m.parentIndex != null && m.index != null ? `S${m.parentIndex} · E${m.index}` : ''
}

/** Resolve what "Play" should actually start for any item (show -> next up episode). */
export async function resolvePlayable(server: PlexServer, item: PlexMedia): Promise<PlexMedia | null> {
  if (item.type === 'movie' || item.type === 'episode') return getMetadata(server, item.ratingKey)
  if (item.type === 'show') {
    const full = await getMetadata(server, item.ratingKey)
    const next = full.OnDeck?.Metadata
    if (next) return getMetadata(server, next.ratingKey)
    const seasons = await getChildren(server, item.ratingKey)
    const first = seasons.find((s) => s.index !== 0) ?? seasons[0]
    if (!first) return null
    const eps = await getChildren(server, first.ratingKey)
    return eps[0] ? getMetadata(server, eps[0].ratingKey) : null
  }
  if (item.type === 'season') {
    const eps = await getChildren(server, item.ratingKey)
    return eps[0] ? getMetadata(server, eps[0].ratingKey) : null
  }
  return null
}

// ---------- Playback ----------
/** Original file, untouched. This is true direct play — no server work. */
export const DEMO_VIDEO: string = import.meta.env.VITE_DEMO_VIDEO || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
export function directPlayUrl(server: PlexServer, media: PlexMedia): string | null {
  if (server.uri === DEMO_URI) return DEMO_VIDEO // (the in-app player picks its own demo clip)
  const key = media.Media?.[0]?.Part?.[0]?.key
  return key ? `${server.uri}${key}?X-Plex-Token=${server.accessToken}` : null
}

/** Last-resort HLS transcode. Only used when the user opts in or the native player can't cope. */
export function transcodeUrl(server: PlexServer, media: PlexMedia, offsetSec = 0): string {
  const p = new URLSearchParams({
    path: `/library/metadata/${media.ratingKey}`,
    protocol: 'hls', directPlay: '0', directStream: '1',
    offset: String(offsetSec), session: crypto.randomUUID(),
    'X-Plex-Client-Identifier': clientId(), 'X-Plex-Product': PRODUCT, 'X-Plex-Token': server.accessToken,
  })
  return `${server.uri}/video/:/transcode/universal/start.m3u8?${p}`
}

export async function reportProgress(server: PlexServer, m: PlexMedia, state: 'playing' | 'paused' | 'stopped', timeMs: number) {
  if (server.uri === DEMO_URI) return
  const p = new URLSearchParams({
    ratingKey: m.ratingKey, key: `/library/metadata/${m.ratingKey}`, state,
    time: String(Math.round(timeMs)), duration: String(m.duration ?? 0),
  })
  await fetch(`${server.uri}/:/timeline?${p}`, { headers: baseHeaders(server.accessToken) }).catch(() => {})
  invalidateCache()
}

// ---------- Server dashboard (owner) ----------
export type StreamKind = 'direct' | 'stream' | 'transcode'
export interface PlexSession {
  id: string; ratingKey: string; type: string; title: string; subtitle: string; thumb?: string
  user: { name: string; thumb?: string }
  device: { name: string; product?: string; platform?: string; state: 'playing' | 'paused' | 'buffering' | string; local: boolean }
  bandwidth: number            // kbps
  location: string             // 'lan' | 'wan'
  kind: StreamKind
  detail: string               // e.g. "1080p · 8.2 Mbps"
  progress: number             // 0..1
}
export interface PlexHistoryEntry { key: string; title: string; subtitle: string; type: string; viewedAt: number; user: string; userThumb?: string; thumb?: string }
export interface ServerInfo { version?: string; platform?: string; name?: string; cpu?: number; memory?: number }

export async function getSessions(server: PlexServer): Promise<PlexSession[]> {
  const c = await get<{ Metadata?: any[] }>(server, '/status/sessions', 0) // eslint-disable-line @typescript-eslint/no-explicit-any
  return (c.Metadata ?? []).map((m) => {
    const t = m.TranscodeSession
    const kind: StreamKind = t ? (t.videoDecision === 'transcode' ? 'transcode' : 'stream') : 'direct'
    const media = m.Media?.[0]
    const res = media?.videoResolution ? (/^\d+$/.test(media.videoResolution) ? `${media.videoResolution}p` : String(media.videoResolution).toUpperCase()) : ''
    const bw: number = m.Session?.bandwidth ?? media?.bitrate ?? 0
    const ep = m.type === 'episode'
    return {
      id: String(m.Session?.id ?? m.sessionKey ?? m.ratingKey), ratingKey: String(ep ? m.grandparentRatingKey ?? m.ratingKey : m.ratingKey), type: ep ? 'show' : m.type,
      title: ep ? m.grandparentTitle ?? m.title : m.title,
      subtitle: ep ? `S${m.parentIndex} · E${m.index} · ${m.title}` : [m.year, m.type === 'movie' ? 'Movie' : ''].filter(Boolean).join(' · '),
      thumb: ep ? m.grandparentThumb ?? m.thumb : m.thumb,
      user: { name: m.User?.title ?? 'Someone', thumb: m.User?.thumb },
      device: { name: m.Player?.title ?? 'Unknown device', product: m.Player?.product, platform: m.Player?.platform, state: m.Player?.state ?? 'playing', local: m.Player?.local ?? m.Session?.location === 'lan' },
      bandwidth: bw, location: m.Session?.location ?? 'lan', kind,
      detail: [res, bw ? `${(bw / 1000).toFixed(1)} Mbps` : ''].filter(Boolean).join(' · '),
      progress: m.duration ? Math.min(1, (m.viewOffset ?? 0) / m.duration) : 0,
    }
  })
}

export async function getHistory(server: PlexServer, size = 30): Promise<PlexHistoryEntry[]> {
  const [h, a] = await Promise.all([
    get<{ Metadata?: any[] }>(server, `/status/sessions/history/all?sort=viewedAt:desc&X-Plex-Container-Start=0&X-Plex-Container-Size=${size}`, 20_000), // eslint-disable-line @typescript-eslint/no-explicit-any
    get<{ Account?: { id: number; name: string; thumb?: string }[] }>(server, '/accounts', 300_000).catch(() => ({ Account: [] as { id: number; name: string; thumb?: string }[] })),
  ])
  const who = new Map((a.Account ?? []).map((x) => [x.id, x]))
  return (h.Metadata ?? []).map((m) => {
    const ep = m.type === 'episode'
    const acct = who.get(m.accountID)
    return { key: `${m.historyKey ?? m.ratingKey}-${m.viewedAt}`, title: ep ? m.grandparentTitle ?? m.title : m.title, subtitle: ep ? `S${m.parentIndex} · E${m.index} · ${m.title}` : String(m.year ?? ''), type: m.type, viewedAt: m.viewedAt, user: acct?.name || 'Someone', userThumb: acct?.thumb, thumb: ep ? m.grandparentThumb ?? m.thumb : m.thumb }
  })
}

export async function getServerInfo(server: PlexServer): Promise<ServerInfo> {
  const [id, res] = await Promise.all([
    get<{ version?: string; platform?: string; friendlyName?: string }>(server, '/', 60_000).catch(() => ({}) as { version?: string; platform?: string; friendlyName?: string }),
    get<{ StatisticsResources?: { hostCpuUtilization?: number; hostMemoryUtilization?: number }[] }>(server, '/statistics/resources?timespan=6', 0).catch(() => ({}) as { StatisticsResources?: { hostCpuUtilization?: number; hostMemoryUtilization?: number }[] }),
  ])
  const last = res.StatisticsResources?.[res.StatisticsResources.length - 1]
  return { version: id.version, platform: id.platform, name: id.friendlyName, cpu: last?.hostCpuUtilization, memory: last?.hostMemoryUtilization }
}
