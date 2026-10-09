// Trending lists come from TMDB (free API key, non-commercial use; attribution shown in Settings).
// We only ever show titles that exist in the user's own Plex library, matched through Plex's stored tmdb:// ids.
import { getSectionWithGuids, type PlexMedia, type PlexSection, type PlexServer } from './plex'

export type TmdbKind = 'movie' | 'tv'
export const DEMO_TMDB_KEY = 'demo'

/** TMDB ids in trending order (up to ~60). */
export async function trendingIds(key: string, kind: TmdbKind, window: 'day' | 'week' = 'week'): Promise<number[]> {
  if (key === DEMO_TMDB_KEY) return kind === 'movie' ? [1005, 1016, 1001, 1007, 1012, 1003, 9999] : [1011, 1002, 1019, 1004, 8888]
  const bearer = key.length > 40
  const ids: number[] = []
  for (const page of [1, 2, 3]) {
    const url = `https://api.themoviedb.org/3/trending/${kind}/${window}?page=${page}${bearer ? '' : `&api_key=${encodeURIComponent(key)}`}`
    const r = await fetch(url, bearer ? { headers: { Authorization: `Bearer ${key}` } } : undefined)
    if (!r.ok) { if (page === 1) throw new Error(r.status === 401 ? 'TMDB rejected the key.' : `TMDB error ${r.status}`); break }
    ids.push(...(await r.json()).results.map((x: { id: number }) => x.id))
  }
  return ids
}

const indexCache = new Map<string, Promise<Map<string, PlexMedia>>>()
/** "movie:603" / "tv:1396" -> the matching item in the library. */
export function guidIndex(server: PlexServer, sections: PlexSection[]): Promise<Map<string, PlexMedia>> {
  const sig = server.uri + sections.map((s) => s.key).join(',')
  let p = indexCache.get(sig)
  if (!p) {
    p = Promise.all(sections.map((s) => getSectionWithGuids(server, s.key).catch(() => []))).then((lists) => {
      const map = new Map<string, PlexMedia>()
      for (const m of lists.flat()) {
        const id = m.Guid?.find((g) => g.id.startsWith('tmdb://'))?.id.slice(7)
        if (id) map.set(`${m.type === 'movie' ? 'movie' : 'tv'}:${id}`, m)
      }
      return map
    })
    indexCache.set(sig, p)
  }
  return p
}

/** This week's trending titles that you actually own, in trending order. */
export async function trendingInLibrary(server: PlexServer, sections: PlexSection[], key: string, kind: TmdbKind, window: 'day' | 'week' = 'week'): Promise<PlexMedia[]> {
  const [ids, index] = await Promise.all([trendingIds(key, kind, window), guidIndex(server, sections)])
  return ids.map((id) => index.get(`${kind}:${id}`)).filter((m): m is PlexMedia => !!m)
}
