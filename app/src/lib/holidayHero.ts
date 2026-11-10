// The holiday slides at the front of the Home banner: a few of the season's movies (the ones you've watched most first), then one of your
// shows that has holiday episodes, worded for the occasion. Only while a season is on (Settings can pretend one is).
import { getMetadata, type HolidaySlide, type PlexMedia, type PlexSection, type PlexServer } from './plex'
import { holidayRows, type HolidayId } from './holidayEpisodes'
import { listsFor, matchList } from './seasonal'
import { shuffled } from './session'
import type { Season } from './settings'

const WORDS: Record<HolidayId, { label: string; headline: (show: string) => string; movieLabel: string; moviesExplore: string; showsExplore: string }> = {
  halloween: { label: 'Spooky Season', headline: (s) => `Celebrate spooky season with ${s}`, movieLabel: 'Spooky Season pick', moviesExplore: 'Explore Halloween collection', showsExplore: 'Explore Halloween episodes' },
  christmas: { label: 'Holiday Season', headline: (s) => `Unwrap the holidays with ${s}`, movieLabel: 'Holiday pick', moviesExplore: 'Explore holiday collection', showsExplore: 'Explore holiday episodes' },
  thanksgiving: { label: 'Thanksgiving', headline: (s) => `Give thanks with ${s}`, movieLabel: 'Thanksgiving pick', moviesExplore: 'Explore Thanksgiving collection', showsExplore: 'Explore Thanksgiving episodes' },
}

export async function holidaySlides(server: PlexServer, sections: PlexSection[], season: Season): Promise<PlexMedia[]> {
  if (!season) return []
  const holiday: HolidayId = season
  const w = WORDS[holiday]
  const out: PlexMedia[] = []

  // Movies for the season: watched ones first (the most-watched leading), the rest in a random order.
  if (season) {
    const found = new Map<string, { m: PlexMedia; list: string }>()
    for (const list of listsFor(season)) for (const m of await matchList(server, sections, list).catch(() => [] as PlexMedia[])) if (!found.has(m.ratingKey)) found.set(m.ratingKey, { m, list: list.id })
    const all = [...found.values()].filter((x) => x.m.art)
    const watched = all.filter((x) => (x.m.viewCount ?? 0) > 0).sort((a, b) => (b.m.viewCount ?? 0) - (a.m.viewCount ?? 0))
    const rest = shuffled(all.filter((x) => !(x.m.viewCount ?? 0)), 7)
    const picks = [...watched.slice(0, 3), ...rest].slice(0, 3)
    const full = await Promise.all(picks.map((p) => getMetadata(server, p.m.ratingKey).then((m): PlexMedia => ({ ...m, holidaySlide: { kind: 'movie', holiday, label: w.movieLabel, explore: w.moviesExplore, listId: p.list } as HolidaySlide })).catch(() => null)))
    out.push(...full.filter((m): m is PlexMedia => !!m))
  }

  // One show with holiday episodes: one you've watched if there is one.
  const rows = await holidayRows(server, sections, season).catch(() => [])
  const shows = rows.find((r) => r.id === holiday)?.all ?? []
  const seen = shows.filter((s) => s.watched)
  const pool = seen.length ? shuffled(seen.slice(0, 3), 11) : shows.slice(0, 1)
  const pick = pool[0]
  if (pick) {
    const m = await getMetadata(server, pick.key).catch(() => null)
    if (m) out.push({ ...m, holidaySlide: { kind: 'show', holiday, label: w.label, headline: w.headline(pick.title), explore: w.showsExplore, showKey: pick.key } })
  }
  return out
}
