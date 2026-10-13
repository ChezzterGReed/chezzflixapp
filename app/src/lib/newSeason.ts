// "New Season Available": shows you've watched some of, that have new episodes out (in the last 90 days) in a LATER season than anything you've
// watched. Watching half a season while more of that same season arrives doesn't count; having watched Season 2 (or part of Season 3) and
// now Season 4 has started does. Meant to nudge people back into a show they were in the middle of.
import { getAllLeaves, getMetadata, getRecentEpisodes, isOtherSection, type PlexMedia, type PlexSection, type PlexServer } from './plex'

export const NEW_SEASON_DAYS = 90
const MAX_CANDIDATES = 40

let cached: { sig: string; at: number; p: Promise<PlexMedia[]> } | undefined
/** Call after something was watched, so the list is worked out again. */
export const resetNewSeason = () => { cached = undefined }

/** The qualifying shows (as show records carrying `newSeason`), most recently released first. Cached for a minute. */
export function newSeasonShows(server: PlexServer, sections: PlexSection[]): Promise<PlexMedia[]> {
  const sig = `${server.uri}|${server.accessToken.slice(-8)}|${sections.map((s) => s.key).join(',')}`
  if (cached && cached.sig === sig && Date.now() - cached.at < 60_000) return cached.p
  const p = build(server, sections).catch(() => [] as PlexMedia[])
  cached = { sig, at: Date.now(), p }
  return p
}

async function build(server: PlexServer, sections: PlexSection[]): Promise<PlexMedia[]> {
  const tv = sections.filter((s) => s.type === 'show' && !isOtherSection(s))
  const lists = await Promise.all(tv.map((s) => getRecentEpisodes(server, s.key, 400).catch(() => [] as PlexMedia[])))
  const now = Date.now(), cutoff = now - NEW_SEASON_DAYS * 86400_000
  // Recent, unwatched, real-season episodes, grouped by show.
  const byShow = new Map<string, PlexMedia[]>()
  const seen = new Set<string>()
  for (const ep of lists.flat()) {
    if (seen.has(ep.ratingKey)) continue
    seen.add(ep.ratingKey)
    const show = ep.grandparentRatingKey
    if (!show || !ep.originallyAvailableAt || (ep.parentIndex ?? 0) < 1 || (ep.viewCount ?? 0) > 0) continue
    const t = Date.parse(ep.originallyAvailableAt)
    if (!isFinite(t) || t < cutoff || t > now + 86400_000) continue
    const l = byShow.get(show); if (l) l.push(ep); else byShow.set(show, [ep])
  }
  const newest = (eps: PlexMedia[]) => Math.max(...eps.map((e) => Date.parse(e.originallyAvailableAt!)))
  const candidates = [...byShow.entries()].sort((a, b) => newest(b[1]) - newest(a[1])).slice(0, MAX_CANDIDATES)

  type Hit = { show: PlexMedia; when: number }
  const hits = await Promise.all(candidates.map(async ([showKey, recent]): Promise<Hit | null> => {
    const leaves = await getAllLeaves(server, showKey).catch(() => [] as PlexMedia[])
    const watched = leaves.filter((e) => (e.viewCount ?? 0) > 0 && (e.parentIndex ?? 0) > 0).map((e) => e.parentIndex!)
    if (!watched.length) return null                                  // never watched any of it: not a "come back" show
    const lastWatchedSeason = Math.max(...watched)
    const fresh = recent.filter((e) => (e.parentIndex ?? 0) > lastWatchedSeason)
    if (!fresh.length) return null                                    // new episodes, but in the season you're already in
    const season = Math.max(...fresh.map((e) => e.parentIndex!))
    const count = fresh.filter((e) => e.parentIndex === season).length
    const show = await getMetadata(server, showKey).catch(() => null)
    return show ? { show: { ...show, newSeason: { season, count } }, when: newest(fresh) } : null
  }))
  return hits.filter((h): h is Hit => !!h).sort((a, b) => b.when - a.when).map((h) => h.show)
}

/** Shows ordered by the release date of their newest episode (newest first); shows with nothing in the recent-episodes window follow, newest-added first. */
export async function orderByNewestEpisode(server: PlexServer, sectionKey: string, shows: PlexMedia[]): Promise<PlexMedia[]> {
  const eps = await getRecentEpisodes(server, sectionKey, 1500).catch(() => [] as PlexMedia[])
  const rank = new Map<string, number>()
  eps.forEach((e, i) => { const k = e.grandparentRatingKey; if (k && !rank.has(k) && e.originallyAvailableAt) rank.set(k, i) })   // the list is newest first, so a show's first appearance is its newest episode
  const withEp = shows.filter((s) => rank.has(s.ratingKey)).sort((a, b) => rank.get(a.ratingKey)! - rank.get(b.ratingKey)!)
  const rest = shows.filter((s) => !rank.has(s.ratingKey)).sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
  return [...withEp, ...rest]
}

let airing: { sig: string; at: number; p: Promise<PlexMedia[]> } | undefined
/** Shows with an episode released in the last 30 days (watched or not), newest release first: "Currently Airing". */
export function currentlyAiring(server: PlexServer, sections: PlexSection[]): Promise<PlexMedia[]> {
  const sig = `${server.uri}|${server.accessToken.slice(-8)}|${sections.map((s) => s.key).join(',')}`
  if (airing && airing.sig === sig && Date.now() - airing.at < 120_000) return airing.p
  const p = (async () => {
    const tv = sections.filter((s) => s.type === 'show' && !isOtherSection(s))
    const lists = await Promise.all(tv.map((s) => getRecentEpisodes(server, s.key, 600).catch(() => [] as PlexMedia[])))
    const now = Date.now(), cutoff = now - 30 * 86400_000
    const newest = new Map<string, number>()
    for (const ep of lists.flat()) {
      const show = ep.grandparentRatingKey
      if (!show || !ep.originallyAvailableAt || (ep.parentIndex ?? 0) < 1) continue
      const t = Date.parse(ep.originallyAvailableAt)
      if (!isFinite(t) || t < cutoff || t > now + 86400_000) continue
      newest.set(show, Math.max(newest.get(show) ?? 0, t))
    }
    const top = [...newest.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)
    const shows = await Promise.all(top.map(([k]) => getMetadata(server, k).catch(() => null)))
    return shows.filter((m): m is PlexMedia => !!m)
  })().catch(() => [] as PlexMedia[])
  airing = { sig, at: Date.now(), p }
  return p
}
