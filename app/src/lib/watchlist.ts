// Plex Watchlist: the account-wide list kept on Plex's cloud (not on your server). Titles on it may or may not be in your library.
import { clientId, DEMO_URI, getMetadata, getSectionWithGuids, type PlexMedia, type PlexSection, type PlexServer } from './plex'

const DISCOVER = 'https://discover.provider.plex.tv'

export interface WatchItem { key: string; title: string; year?: number; type: 'movie' | 'show'; poster?: string; summary?: string }

const headers = (token: string) => ({ Accept: 'application/json', 'X-Plex-Token': token, 'X-Plex-Client-Identifier': clientId(), 'X-Plex-Product': 'Chezzflix' })

/** Plex's id for a title: the last part of its plex:// guid. The same value identifies it in your library and on the Watchlist. */
export function watchKey(server: PlexServer, m: PlexMedia): string | undefined {
  if (m.guid?.startsWith('plex://')) return m.guid.split('/').pop()
  return server.uri === DEMO_URI ? `demo-local:${m.ratingKey}` : undefined
}
export const watchItemOf = (key: string, m: PlexMedia): WatchItem => ({ key, title: m.title, year: m.year, type: m.type === 'show' ? 'show' : 'movie' })

let cache: { token: string; at: number; items: WatchItem[] } | undefined
let demo: WatchItem[] = [
  { key: 'demo-remote:1', title: 'The Last Frontier', year: 2024, type: 'show' },
  { key: 'demo-remote:2', title: 'Echoes of Mars', year: 2023, type: 'movie' },
  { key: 'demo-remote:3', title: 'Paper Lanterns', year: 2022, type: 'movie' },
]

export async function getWatchlist(token: string, fresh = false): Promise<WatchItem[]> {
  if (token === 'demo') return [...demo]
  if (!fresh && cache && cache.token === token && Date.now() - cache.at < 60_000) return cache.items
  const items: WatchItem[] = []
  for (let start = 0; ;) {
    const r = await fetch(`${DISCOVER}/library/sections/watchlist/all?includeCollections=1&includeExternalMedia=1&X-Plex-Container-Start=${start}&X-Plex-Container-Size=100`, { headers: headers(token) })
    if (!r.ok) throw new Error(`Plex ${r.status}`)
    const c = (await r.json()).MediaContainer as { Metadata?: (PlexMedia & { ratingKey: string })[]; totalSize?: number }
    const md = c.Metadata ?? []
    items.push(...md.filter((m) => m.type === 'movie' || m.type === 'show').map((m) => ({
      key: m.ratingKey, title: m.title, year: m.year, type: m.type as 'movie' | 'show', summary: m.summary,
      poster: m.thumb?.startsWith('http') ? m.thumb : undefined,
    })))
    start += md.length
    if (!md.length || start >= (c.totalSize ?? 0)) break
  }
  cache = { token, at: Date.now(), items }
  return items
}

export async function setOnWatchlist(token: string, item: WatchItem, on: boolean): Promise<void> {
  if (token === 'demo') { demo = on ? [item, ...demo.filter((x) => x.key !== item.key)] : demo.filter((x) => x.key !== item.key); return }
  const r = await fetch(`${DISCOVER}/actions/${on ? 'addToWatchlist' : 'removeFromWatchlist'}?ratingKey=${encodeURIComponent(item.key)}`, { method: 'PUT', headers: headers(token) })
  if (!r.ok) throw new Error(`Plex ${r.status}`)
  if (cache?.token === token) cache = { ...cache, items: on ? [item, ...cache.items.filter((x) => x.key !== item.key)] : cache.items.filter((x) => x.key !== item.key) }
}

/** Which Watchlist titles are in your libraries (matched by Plex id, then by title and year), so they open directly. */
export async function matchLibrary(server: PlexServer, sections: PlexSection[], items: WatchItem[]): Promise<Map<string, PlexMedia>> {
  const out = new Map<string, PlexMedia>()
  if (server.uri === DEMO_URI) {
    await Promise.all(items.filter((i) => i.key.startsWith('demo-local:')).map(async (i) => { const m = await getMetadata(server, i.key.slice(11)).catch(() => null); if (m) out.set(i.key, m) }))
    return out
  }
  const all = (await Promise.all(sections.map((s) => getSectionWithGuids(server, s.key).catch(() => [])))).flat()
  const byGuid = new Map<string, PlexMedia>(), byTitle = new Map<string, PlexMedia>()
  const t = (title: string, year?: number, type?: string) => `${type}:${title.toLowerCase().replace(/[^a-z0-9]/g, '')}:${year ?? ''}`
  for (const m of all) { if (m.guid?.startsWith('plex://')) byGuid.set(m.guid.split('/').pop()!, m); byTitle.set(t(m.title, m.year, m.type), m) }
  for (const i of items) { const m = byGuid.get(i.key) ?? byTitle.get(t(i.title, i.year, i.type)); if (m) out.set(i.key, m) }
  return out
}
