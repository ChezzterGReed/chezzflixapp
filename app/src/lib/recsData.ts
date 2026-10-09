// Fetches what recs.ts needs from Plex (this profile's history + the unwatched library) and caches it for the session.
import { getUnwatchedItems, getWatchedItems, type PlexMedia, type PlexSection, type PlexServer } from './plex'
import { buildRecs, type RecRow } from './recs'
import { tabOk, type AnimeInfo, type Tab } from './homeData'

interface Raw { history: PlexMedia[]; candidates: PlexMedia[] }
const cache = new Map<string, Promise<Raw>>()

function raw(server: PlexServer, sections: PlexSection[], bust: number): Promise<Raw> {
  // The access token identifies the profile, so each profile gets its own history.
  const key = `${server.uri}|${server.accessToken.slice(-10)}|${sections.map((s) => s.key).join(',')}|${bust}`
  let p = cache.get(key)
  if (!p) {
    p = Promise.all([
      Promise.all(sections.map((s) => getWatchedItems(server, s.key).catch(() => []))),
      Promise.all(sections.map((s) => getUnwatchedItems(server, s.key).catch(() => []))),
    ]).then(([h, c]) => ({ history: h.flat(), candidates: c.flat() }))
    cache.set(key, p)
  }
  return p
}

export interface RecsOptions { tab: Tab; anime?: AnimeInfo; seedGenres: string[]; notInterested: Record<string, number>; bust: number; maxRows?: number }

/** Recommendation rows for a Home tab (movies tab -> only movies, etc.). Cheap to call again when "Not interested" changes. */
export async function loadRecs(server: PlexServer, sections: PlexSection[], o: RecsOptions): Promise<RecRow[]> {
  const { history, candidates } = await raw(server, sections, o.bust)
  const inTab = (m: PlexMedia) => tabOk(o.tab, m, o.anime)
  return buildRecs({ history, candidates: candidates.filter(inTab), seedGenres: o.seedGenres, notInterested: o.notInterested, maxRows: o.maxRows, anchorType: o.tab === 'movie' ? 'movie' : o.tab === 'show' ? 'show' : undefined })
}
