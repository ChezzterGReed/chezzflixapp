// Trending lists come from TMDB (free API key, non-commercial use; attribution shown in Settings).
// We only ever show titles that exist in the user's own Plex library, matched through Plex's stored tmdb:// ids.
import { getSectionWithGuids, type PlexMedia, type PlexSection, type PlexServer } from './plex'
import type { RequestItem, SeasonInfo } from './overseerr'

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

// ---------- Search beyond the library (titles you can request) ----------
const IMG = 'https://image.tmdb.org/t/p'
const yearOf = (d?: string) => (d && d.length >= 4 ? Number(d.slice(0, 4)) : undefined)

interface TmdbHit { id: number; media_type?: string; title?: string; name?: string; release_date?: string; first_air_date?: string; overview?: string; poster_path?: string | null; backdrop_path?: string | null; vote_average?: number }
const toItem = (x: TmdbHit, type: 'movie' | 'tv'): RequestItem => ({
  tmdbId: x.id, type, title: (type === 'movie' ? x.title : x.name) ?? '', year: yearOf(type === 'movie' ? x.release_date : x.first_air_date), overview: x.overview || undefined,
  poster: x.poster_path ? `${IMG}/w500${x.poster_path}` : undefined, backdrop: x.backdrop_path ? `${IMG}/w1280${x.backdrop_path}` : undefined, rating: x.vote_average || undefined,
})

async function tmdbGet<T>(key: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const bearer = key.length > 40
  const q = new URLSearchParams({ ...params, ...(bearer ? {} : { api_key: key }) })
  const r = await fetch(`https://api.themoviedb.org/3${path}?${q}`, bearer ? { headers: { Authorization: `Bearer ${key}` } } : undefined)
  if (!r.ok) throw new Error(r.status === 401 ? 'TMDB rejected the key.' : `TMDB error ${r.status}`)
  return r.json()
}

const DEMO_HITS: RequestItem[] = [
  { tmdbId: 9999, type: 'movie', title: 'Midnight Express Lane', year: 2023, overview: 'A night-shift train conductor finds one passenger who was never on the manifest, and the route stops matching the map.', rating: 7.6 },
  { tmdbId: 8888, type: 'tv', title: 'The Understudies: Abroad', year: 2025, overview: 'The second-string cast takes the show on the road, where nobody has heard of the first string.', rating: 8.1 },
  { tmdbId: 7777, type: 'movie', title: 'Harbor Lights II', year: 2026, overview: 'The ferry pilot and the island doctor get a second crossing, and a lot more to say.', rating: 6.8 },
  { tmdbId: 7776, type: 'movie', title: 'Static: Reception', year: 2026, overview: 'The late-night host is back on air, and so are the callers.', rating: 6.4 },
]

export async function searchTmdb(key: string, query: string): Promise<RequestItem[]> {
  if (key === DEMO_TMDB_KEY) { const q = query.toLowerCase(); return DEMO_HITS.filter((h) => h.title.toLowerCase().includes(q.slice(0, 4)) || q.length < 5).slice(0, 6) }
  const r = await tmdbGet<{ results: TmdbHit[] }>(key, '/search/multi', { query, include_adult: 'false' })
  return r.results.filter((x) => x.media_type === 'movie' || x.media_type === 'tv').map((x) => toItem(x, x.media_type as 'movie' | 'tv')).filter((x) => x.title)
}

/** A show's seasons (without specials), for the request picker. */
export async function tmdbSeasons(key: string, tmdbId: number): Promise<SeasonInfo[]> {
  if (key === DEMO_TMDB_KEY) return [1, 2, 3].map((n) => ({ n, name: `Season ${n}`, episodes: 8, state: 'none' as const }))
  const r = await tmdbGet<{ seasons?: { season_number: number; name: string; episode_count: number }[] }>(key, `/tv/${tmdbId}`)
  return (r.seasons ?? []).filter((s) => s.season_number > 0).map((s) => ({ n: s.season_number, name: s.name, episodes: s.episode_count, state: 'none' as const }))
}
