// Seasonal lists: hand-picked movies for a time of year ("Spooky Season" in October). When the season is on, Home shows a row of whichever
// of the list's movies are on this server, and a "See all" for the full set. Add a new list by creating a file in lib/lists and
// registering it below; it appears whenever its season is active (and the profile has Seasonal themes on).
import { getSectionWithGuids, isOtherSection, type PlexMedia, type PlexSection, type PlexServer } from './plex'
import type { Channel } from './tvguide'
import type { Season } from './settings'
import { SPOOKY } from './lists/spooky'

export interface SeasonalList { id: string; season: Exclude<Season, null>; title: string; subtitle: string; entries: [string, number][] }

export const SEASONAL_LISTS: SeasonalList[] = [
  { id: 'spooky', season: 'halloween', title: 'Spooky Season', subtitle: 'Halloween favourites and spooky-season vibes', entries: SPOOKY },
]

export const listsFor = (season: Season): SeasonalList[] => (season ? SEASONAL_LISTS.filter((l) => l.season === season) : [])
export const seasonalList = (id: string) => SEASONAL_LISTS.find((l) => l.id === id)

const norm = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/^(the|a|an) /, '').replace(/[^a-z0-9]/g, '')

/** The list's movies that are on this server (matched by title and year, a year either side allowed), in the list's order. */
export async function matchList(server: PlexServer, sections: PlexSection[], list: SeasonalList): Promise<PlexMedia[]> {
  const libs = sections.filter((s) => s.type === 'movie' && !isOtherSection(s))
  const all = (await Promise.all(libs.map((s) => getSectionWithGuids(server, s.key).catch(() => [] as PlexMedia[])))).flat()
  const byTitle = new Map<string, PlexMedia[]>(), byHead = new Map<string, PlexMedia[]>()
  const put = (map: Map<string, PlexMedia[]>, k: string, m: PlexMedia) => { const l = map.get(k); if (l) l.push(m); else map.set(k, [m]) }
  const head = (t: string) => norm(t.split(':')[0])
  for (const m of all) { put(byTitle, norm(m.title), m); if (m.title.includes(':')) put(byHead, head(m.title), m) }
  const out: PlexMedia[] = [], seen = new Set<string>()
  for (const [title, year] of list.entries) {
    // Exact title (a year either side is fine); or, when the server's title adds a ": subtitle", the same start with the exact year.
    const cands = byTitle.get(norm(title))
    let hit = cands ? cands.find((m) => m.year === year) ?? cands.find((m) => m.year != null && Math.abs(m.year - year) <= 1) : undefined
    if (!hit) hit = byHead.get(norm(title))?.find((m) => m.year === year)
    if (!hit && title.includes(':')) hit = byTitle.get(head(title))?.find((m) => m.year === year)
    if (hit && !seen.has(hit.ratingKey)) { seen.add(hit.ratingKey); out.push(hit) }
  }
  return out
}

// ---------- Seasonal TV Guide channels ----------
/** Ratings for the after-dark channel (PG-13 and up); everything else (G, PG, kids' TV ratings, unrated kids' titles) is the family one. */
const ADULT = /^(pg-13|r|nc-17|tv-14|tv-ma|unrated|x)$/i
const adult = (m: PlexMedia) => ADULT.test((m.contentRating ?? '').replace(/^[a-z]{2}\//i, '').trim())
export const PUMPKIN_ORANGE = '#ff7a1a'

/** In season, two channels built from the season's list: one for the whole family (G and PG), one for after dark (PG-13 and up). Only those with enough movies. */
export async function seasonalChannels(server: PlexServer, sections: PlexSection[], season: Season): Promise<Channel[]> {
  const out: Channel[] = []
  for (const list of listsFor(season)) {
    const have = await matchList(server, sections, list).catch(() => [] as PlexMedia[])
    const entry = (m: PlexMedia) => ({ key: m.ratingKey, title: m.title, year: m.year, dur: m.duration ?? 100 * 60_000, date: m.originallyAvailableAt, thumb: m.thumb, art: m.art })
    const make = (id: string, number: number, name: string, items: PlexMedia[]): Channel | null => items.length < 3 ? null : { id: `seasonal:${list.id}:${id}`, number, name, kind: 'movies', genres: [], movieItems: items.map(entry), movieOrder: 'random', seasonal: true, accent: PUMPKIN_ORANGE }
    const a = make('family', -2, list.title, have.filter((m) => !adult(m)))
    const b = make('afterdark', -1, `${list.title} After Dark`, have.filter(adult))
    out.push(...[a, b].filter((c): c is Channel => !!c))
  }
  return out
}
