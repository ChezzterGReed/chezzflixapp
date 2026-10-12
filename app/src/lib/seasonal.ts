// Seasonal lists: hand-picked movies for a time of year ("Spooky Season" in October). When the season is on, Home shows a row of whichever
// of the list's movies are on this server, and a "See all" for the full set. Add a new list by creating a file in lib/lists and
// registering it below; it appears whenever its season is active (and the profile has Seasonal themes on).
import { getSectionWithGuids, isOtherSection, type PlexMedia, type PlexSection, type PlexServer } from './plex'
import type { Channel } from './tvguide'
import { guidIndex, tmdbMovieMeta, type MovieMeta } from './tmdb'
import type { RequestItem } from './overseerr'
import type { Season } from './settings'
import { SPOOKY } from './lists/spooky'
import { CHRISTMAS } from './lists/christmas'
import { ensureRemoteLists, entriesFor } from './lists/remote'

/** A channel made from a list: `keep` narrows which of the list's movies it plays (default: all of them). */
export interface SeasonalChannel { id: string; number: number; name: string; keep?: (m: PlexMedia) => boolean }
export interface SeasonalList {
  id: string; season: Exclude<Season, null>; title: string; subtitle: string
  /** The built-in copy of the list; the live one (from the hosted file, when reachable) is `listEntries(list)`. */
  entries: [string, number][]
  /** Only these of the list's movies belong (e.g. by rating). */
  keep?: (m: PlexMedia) => boolean
  /** The list (and its channels) only appear when at least this many of its movies are on the server. Default 3. */
  min?: number
  channels?: SeasonalChannel[]
}

// ---- who a movie is for ----
/** Ratings for the after-dark channel (PG-13 and up); everything else (G, PG, kids' TV ratings, unrated kids' titles) is the family one. */
const ADULT = /^(pg-13|r|nc-17|tv-14|tv-ma|unrated|x)$/i
const rating = (m: PlexMedia) => (m.contentRating ?? '').replace(/^[a-z]{2}\//i, '').trim()
const adult = (m: PlexMedia) => ADULT.test(rating(m))
// Christmas: G / PG (and the TV equivalents) are for everyone; unrated old classics too. PG-13, R and TV-14/MA are the "Violent Night" side.
const MATURE = /^(pg-13|r|nc-17|tv-14|tv-ma|x)$/i
const matureRated = (m: PlexMedia) => MATURE.test(rating(m))
const DARK = /horror|thriller|crime|action|mystery|suspense/i
const hasDarkGenre = (m: PlexMedia) => !m.Genre?.length || m.Genre.some((g) => DARK.test(g.tag))
const familyXmas = (m: PlexMedia) => !matureRated(m)
const violentXmas = (m: PlexMedia) => matureRated(m) && hasDarkGenre(m)

export const SEASONAL_LISTS: SeasonalList[] = [
  { id: 'spooky', season: 'halloween', title: 'Spooky Season', subtitle: 'Halloween favourites and spooky-season vibes', entries: SPOOKY,
    channels: [{ id: 'family', number: -2, name: 'Spooky Season', keep: (m) => !adult(m) }, { id: 'afterdark', number: -1, name: 'Spooky Season After Dark', keep: adult }] },
  { id: 'xmas', season: 'christmas', title: 'Holiday Movies', subtitle: 'Christmas favourites for the whole family', entries: CHRISTMAS, keep: familyXmas, min: 8,
    channels: [{ id: 'a', number: -2, name: 'Holiday Movies' }, { id: 'b', number: -1, name: 'Holiday Movies 2' }] },
  { id: 'xmas-violent', season: 'christmas', title: 'Violent Night', subtitle: 'Christmas with a bite: slashers, thrillers and action', entries: CHRISTMAS, keep: violentXmas, min: 8 },
]

/** The list's movies as currently published (hosted file) or, failing that, as built into this version. */
export const listEntries = (l: SeasonalList): [string, number][] => entriesFor(l.season, l.entries)

export const listsFor = (season: Season): SeasonalList[] => (season ? SEASONAL_LISTS.filter((l) => l.season === season) : [])
export const seasonalList = (id: string) => SEASONAL_LISTS.find((l) => l.id === id)

const norm = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/^(the|a|an) /, '').replace(/[^a-z0-9]/g, '')

interface LibIndex { byTitle: Map<string, PlexMedia[]>; byHead: Map<string, PlexMedia[]> }
async function libraryIndex(server: PlexServer, sections: PlexSection[]): Promise<LibIndex> {
  const libs = sections.filter((s) => s.type === 'movie' && !isOtherSection(s))
  const all = (await Promise.all(libs.map((s) => getSectionWithGuids(server, s.key).catch(() => [] as PlexMedia[])))).flat()
  const byTitle = new Map<string, PlexMedia[]>(), byHead = new Map<string, PlexMedia[]>()
  const put = (map: Map<string, PlexMedia[]>, k: string, m: PlexMedia) => { const l = map.get(k); if (l) l.push(m); else map.set(k, [m]) }
  for (const m of all) { put(byTitle, norm(m.title), m); if (m.title.includes(':')) put(byHead, head(m.title), m) }
  return { byTitle, byHead }
}
const head = (t: string) => norm(t.split(':')[0])
/** Exact title (a year either side is fine); or, when the server's title adds a ": subtitle", the same start with the exact year. */
function findEntry(idx: LibIndex, title: string, year: number): PlexMedia | undefined {
  const cands = idx.byTitle.get(norm(title))
  let hit = cands ? cands.find((m) => m.year === year) ?? cands.find((m) => m.year != null && Math.abs(m.year - year) <= 1) : undefined
  if (!hit) hit = idx.byHead.get(norm(title))?.find((m) => m.year === year)
  if (!hit && title.includes(':')) hit = idx.byTitle.get(head(title))?.find((m) => m.year === year)
  return hit
}

/** The list's movies that are on this server (matched by title and year, a year either side allowed), in the list's order. */
export async function matchList(server: PlexServer, sections: PlexSection[], list: SeasonalList): Promise<PlexMedia[]> {
  await ensureRemoteLists()
  const idx = await libraryIndex(server, sections)
  const out: PlexMedia[] = [], seen = new Set<string>()
  for (const [title, year] of listEntries(list)) {
    const hit = findEntry(idx, title, year)
    if (hit && !seen.has(hit.ratingKey)) { seen.add(hit.ratingKey); out.push(hit) }
  }
  const kept = list.keep ? out.filter(list.keep) : out
  return kept.length >= (list.min ?? 3) ? kept : []   // a list with only a handful of films isn't worth showing
}

/**
 * The list's movies that this server does NOT have, as things that can be requested. Each is looked up on TMDB (which also gives its age
 * rating and genres, so a family list doesn't offer an R-rated slasher), skipping anything the library already owns under another name.
 */
export async function missingFromList(server: PlexServer, sections: PlexSection[], list: SeasonalList, tmdbKey: string): Promise<RequestItem[]> {
  await ensureRemoteLists()
  const [idx, owned] = await Promise.all([libraryIndex(server, sections), guidIndex(server, sections)])
  const todo = listEntries(list).filter(([title, year]) => !findEntry(idx, title, year))
  const metas: (MovieMeta | null)[] = new Array(todo.length).fill(null)
  let next = 0
  await Promise.all(Array.from({ length: 6 }, async () => { while (next < todo.length) { const i = next++; metas[i] = await tmdbMovieMeta(tmdbKey, todo[i][0], todo[i][1]) } }))
  const seen = new Set<number>(), out: RequestItem[] = []
  for (const m of metas) {
    if (!m || seen.has(m.item.tmdbId) || owned.has(`movie:${m.item.tmdbId}`)) continue
    seen.add(m.item.tmdbId)
    const stand: PlexMedia = { ratingKey: '', title: m.item.title, type: 'movie', year: m.item.year, contentRating: m.cert, Genre: m.genres.map((tag) => ({ tag })) }
    if (!list.keep || list.keep(stand)) out.push(m.item)
  }
  return out
}

/** "#rrggbb" + alpha -> rgba(). */
export function hexA(hex: string, a: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

// ---------- Seasonal TV Guide channels ----------
/** In season, the channels each list asks for, built from its movies (only for lists with enough of them). `accent` is the season's colour. */
export async function seasonalChannels(server: PlexServer, sections: PlexSection[], season: Season, accent = '#ff7a1a'): Promise<Channel[]> {
  const out: Channel[] = []
  for (const list of listsFor(season)) {
    if (!list.channels?.length) continue
    const have = await matchList(server, sections, list).catch(() => [] as PlexMedia[])
    const entry = (m: PlexMedia) => ({ key: m.ratingKey, title: m.title, year: m.year, dur: m.duration ?? 100 * 60_000, date: m.originallyAvailableAt, thumb: m.thumb, art: m.art })
    for (const c of list.channels) {
      const items = c.keep ? have.filter(c.keep) : have
      if (items.length < (list.min ?? 3)) continue
      out.push({ id: `seasonal:${list.id}:${c.id}`, number: c.number, name: c.name, kind: 'movies', genres: [], movieItems: items.map(entry), movieOrder: 'random', seasonal: true, accent })
    }
  }
  return out
}
