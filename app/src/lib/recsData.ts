// Fetches what recs.ts needs from Plex (this profile's history + the unwatched library) and caches it for the session.
import { getUnwatchedItems, getWatchedItems, type PlexMedia, type PlexSection, type PlexServer } from './plex'
import { buildRecs, type RecRow } from './recs'
import { tabOk, type AnimeInfo, type Tab } from './homeData'

interface Raw { history: PlexMedia[]; candidates: PlexMedia[] }
const histCache = new Map<string, Promise<PlexMedia[]>>()
const candCache = new Map<string, Promise<PlexMedia[]>>()
/** Forget the watch history read for recommendations (switching profile or signing out). */
export const clearRecsCache = () => { histCache.clear(); candCache.clear() }

// The access token identifies the profile, so each profile gets its own history.
const baseKey = (server: PlexServer, sections: PlexSection[]) => `${server.uri}|${server.accessToken.slice(-10)}|${sections.map((s) => s.key).join(',')}`

/** What you've watched: re-read after you finish watching something (`watchBust`) or after a library change (`bust`). Everything not yet watched changes only with the library. */
function raw(server: PlexServer, sections: PlexSection[], bust: number, watchBust: number): Promise<Raw> {
  const hk = `${baseKey(server, sections)}|${bust}|${watchBust}`, ck = `${baseKey(server, sections)}|${bust}`
  let h = histCache.get(hk)
  if (!h) { h = Promise.all(sections.map((s) => getWatchedItems(server, s.key).catch(() => []))).then((l) => l.flat()); histCache.set(hk, h) }
  let c = candCache.get(ck)
  if (!c) { c = Promise.all(sections.map((s) => getUnwatchedItems(server, s.key).catch(() => []))).then((l) => l.flat()); candCache.set(ck, c) }
  return Promise.all([h, c]).then(([history, candidates]) => ({ history, candidates }))
}

export interface RecsOptions { tab: Tab; anime?: AnimeInfo; seedGenres: string[]; notInterested: Record<string, number>; bust: number; /** Bumped each time something is watched. */ watchBust?: number; maxRows?: number }

/** Recommendation rows for a Home tab (movies tab -> only movies, etc.). Cheap to call again when "Not interested" changes. */
export async function loadRecs(server: PlexServer, sections: PlexSection[], o: RecsOptions): Promise<RecRow[]> {
  const { history, candidates } = await raw(server, sections, o.bust, o.watchBust ?? 0)
  const inTab = (m: PlexMedia) => tabOk(o.tab, m, o.anime)
  return buildRecs({ history, candidates: candidates.filter(inTab), seedGenres: o.seedGenres, notInterested: o.notInterested, maxRows: o.maxRows, anchorType: o.tab === 'movie' ? 'movie' : o.tab === 'show' ? 'show' : undefined })
}
