import {
  getAllSectionItems, getCollectionItems, getCollections, getGenreItems, getGenreRandom, getGenres, getHubs, getMetadata, getOnDeck, getPlaylistItems,
  getRandomItems, getRecentShows, getSectionItems, isOtherSection, isWatched, serverTrending, type PlexMedia, type PlexSection, type PlexServer,
} from './plex'
import type { HomeRowCfg, HomeTab, Season, Settings } from './settings'
import { trendingInLibrary } from './tmdb'
import { shuffled } from './session'
import { getWatchlist, matchLibrary } from './watchlist'
import { listsFor, matchList } from './seasonal'
import { currentlyAiring, newSeasonShows } from './newSeason'

export type Tab = HomeTab
export interface HomeRow { id: string; title: string; subtitle?: string; items: PlexMedia[]; continue?: boolean; /** A seasonal list: how many of its movies are on the server (shows "See all"). */ seasonal?: { id: string; total: number }; /** The New Season Available row (re-worked when something is watched). */ newSeason?: boolean }
/** Why a tab might have less than expected (shown as a friendly note). */
export type HomeNotice = { kind: 'tmdb-key' } | { kind: 'tmdb-error'; message: string } | { kind: 'tmdb-empty' }

export const showKey = (m: PlexMedia) => (m.type === 'episode' ? m.grandparentRatingKey ?? m.ratingKey : m.type === 'season' ? m.parentRatingKey ?? m.ratingKey : m.ratingKey)
const isContinueHub = (h: { hubIdentifier: string }) => /continue/i.test(h.hubIdentifier)
const dedupe = (items: PlexMedia[]) => { const seen = new Set<string>(); return items.filter((m) => !seen.has(showKey(m)) && !!seen.add(showKey(m))) }
const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5)
const QUICK_MS = 30 * 60_000

// ---------- Anime ----------
// Plex has no "anime" type. We treat a title as anime if it lives in a library named like "Anime", or carries the "Anime" genre.
export interface AnimeInfo { keys: Set<string>; sections: Set<string>; shows: number; items: PlexMedia[] }
export const ANIME_MIN_SHOWS = 5
const animeCache = new Map<string, Promise<AnimeInfo>>()

export function loadAnime(server: PlexServer, sections: PlexSection[], bust = 0): Promise<AnimeInfo> {
  const sig = `${server.uri}|${sections.map((s) => s.key).join(',')}|${bust}`
  let p = animeCache.get(sig)
  if (!p) {
    p = (async () => {
      const named = sections.filter((s) => /anime/i.test(s.title))
      const others = sections.filter((s) => !/anime/i.test(s.title))
      const fromNamed = await Promise.all(named.map((s) => getSectionItems(server, s.key, 'added', 0, 300).then((r) => r.items).catch(() => [])))
      const fromGenre = await Promise.all(others.map(async (s) => {
        const g = (await getGenres(server, s.key).catch(() => [])).find((x) => /^anime$/i.test(x.title))
        return g ? getGenreItems(server, s.key, g.key, 300).catch(() => []) : []
      }))
      const items = [...fromNamed.flat(), ...fromGenre.flat()]
      return { keys: new Set(items.map((m) => m.ratingKey)), sections: new Set(named.map((s) => s.key)), shows: items.filter((m) => m.type === 'show').length, items }
    })()
    animeCache.set(sig, p)
  }
  return p
}

export const animeEnabled = (a?: AnimeInfo) => !!a && a.shows >= ANIME_MIN_SHOWS
const isAnime = (a: AnimeInfo | undefined, m: PlexMedia) => !!a && (a.keys.has(showKey(m)) || a.sections.has(String(m.librarySectionID)))

/** Does `m` belong on this tab? Anime only gets its own tab (and leaves Movies/TV) once there's enough of it. */
export function tabOk(tab: Tab, m: PlexMedia, anime?: AnimeInfo): boolean {
  const on = animeEnabled(anime)
  if (tab === 'anime') return on && isAnime(anime, m)
  if (tab === 'trending' || tab === 'foryou') return true
  if (tab !== 'all' && on && isAnime(anime, m)) return false
  return tab === 'all' || (tab === 'movie' ? m.type === 'movie' : m.type !== 'movie')
}

// ---------- Row catalog: what each tab shows by default, and what else can be added ----------
const b = (ref: string, title: string, enabled = true): HomeRowCfg => ({ id: `builtin:${ref}`, kind: 'builtin', ref, title, enabled })
const g = (ref: string, title = ref, enabled = true): HomeRowCfg => ({ id: `genre:${ref}`, kind: 'genre', ref, title, enabled })

/** Popular genres offered during setup, and the fallback rows when none were picked. */
export const POPULAR_GENRES = ['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Thriller', 'War', 'Western']
const MAX_GENRE_ROWS = 6

/** The default layout of each tab, in order. `genres` (from first-run setup) replaces the stock genre rows on Home, Movies and Shows. */
export function defaultRows(tab: Tab, genres: string[] = []): HomeRowCfg[] {
  const mine = genres.slice(0, MAX_GENRE_ROWS).map((x) => g(x))
  switch (tab) {
    case 'foryou': return [b('continue', 'Continue Watching')]
    case 'trending': return [b('tmdb-movie', 'Trending Movies This Week'), b('tmdb-tv', 'Trending Shows This Week'), b('trending', 'From Your Trending Collection')]
    case 'show': return [b('continue', 'Continue Watching'), b('recent', 'Recently Added Shows'), b('quick', 'Quick Watch · 30 min or less'), b('trending', 'Trending'), ...(mine.length ? mine : [g('Comedy'), g('Drama'), g('Crime')])]
    case 'anime': return [b('continue', 'Continue Watching'), b('recent', 'Recently Added'), g('Action'), g('Fantasy'), g('Comedy')]
    default: return [b('continue', 'Continue Watching'), b('recent', 'Recently Added Movies'), b('released', 'Recently Released Movies'), b('trending', 'Trending'), ...(mine.length ? mine : [g('Action'), g('Comedy'), g('Horror')])]
  }
}

/** Rows that exist but are off until the user turns them on. */
function optionalRows(tab: Tab): HomeRowCfg[] {
  const base = [b('watchlist', 'From Your Watchlist', false), b('toprated', 'Top Rated', false), b('random', 'Random Picks', false)]
  if (tab === 'trending') return [b('serveractivity', 'Trending with Others on Your Server', false)]   // (the Trending tab only has its own few rows)
  if (tab === 'movie') return [b('short', '90 Minutes or Less', false), ...base, g('Thriller', 'Thriller', false), g('Sci-Fi', 'Sci-Fi', false), g('Drama', 'Drama', false), g('Animation', 'Animation', false), g('Horror', 'Horror', false)]
  if (tab === 'show') return [b('airing', 'Currently Airing', false), b('released', 'Recently Released', false), ...base, g('Sci-Fi', 'Sci-Fi', false), g('Documentary', 'Documentary', false), g('Horror', 'Horror', false)]
  if (tab === 'anime') return [b('airing', 'Currently Airing', false), b('released', 'Recently Released', false), ...base, g('Adventure', 'Adventure', false)]
  return [...base, g('Thriller', 'Thriller', false), g('Sci-Fi', 'Sci-Fi', false), g('Drama', 'Drama', false), g('Animation', 'Animation', false), g('Horror', 'Horror', false)]
}

/** Everything a tab could show: defaults (on), then extras and Plex's own rows (off). */
export function rowCatalog(tab: Tab, genres: string[] = []): HomeRowCfg[] {
  const defaults = defaultRows(tab, genres)
  const have = new Set(defaults.map((r) => r.id))
  return [...defaults, ...optionalRows(tab).filter((r) => !have.has(r.id))]
}

/** Saved layout wins (order + on/off); anything it doesn't know about yet is appended with its default state. */
export function mergeRows(saved: HomeRowCfg[] | undefined, catalog: HomeRowCfg[]): HomeRowCfg[] {
  if (!saved) return catalog.map((r) => ({ ...r }))
  const out = saved.map((r) => ({ ...r }))
  for (const c of catalog) if (!out.some((r) => r.id === c.id)) out.push({ ...c })
  return out
}

// ---------- Row resolvers ----------
const genreMatch = (ref: string, title: string) => title.toLowerCase().startsWith(ref.toLowerCase()) || (/^fantasy$/i.test(ref) && /fantasy/i.test(title)) || (/^sci-?fi$/i.test(ref) && /sci/i.test(title))
const released = (m: PlexMedia) => !m.originallyAvailableAt || new Date(m.originallyAvailableAt).getTime() <= Date.now()
const byAdded = (a: PlexMedia, b2: PlexMedia) => (b2.addedAt ?? 0) - (a.addedAt ?? 0)
const byRelease = (a: PlexMedia, b2: PlexMedia) => (b2.originallyAvailableAt ?? '').localeCompare(a.originallyAvailableAt ?? '')
const interleave = (a: PlexMedia[], c: PlexMedia[]) => { const out: PlexMedia[] = []; for (let i = 0; i < Math.max(a.length, c.length); i++) { if (a[i]) out.push(a[i]); if (c[i]) out.push(c[i]) } return dedupe(out) }

interface Ctx { server: PlexServer; token: string; profileName: string; tab: Tab; secs: PlexSection[]; all: PlexSection[]; tmdbKey: string; anime?: AnimeInfo; keep: (m: PlexMedia) => boolean; notices: HomeNotice[] }

async function builtin(c: Ctx, ref: string): Promise<PlexMedia[]> {
  const { server, tab, secs, anime } = c
  const isAnimeTab = tab === 'anime'
  const pool = isAnimeTab ? (anime?.items ?? []) : []
  switch (ref) {
    case 'recent': {
      if (isAnimeTab) return [...pool].sort(byAdded).slice(0, 30)
      const lists = await Promise.all(secs.map((s) => (s.type === 'show' ? getRecentShows(server, s.key, 30) : getSectionItems(server, s.key, 'added', 0, 30).then((r) => r.items))))
      return lists.flat().sort(byAdded)
    }
    case 'released': {
      if (isAnimeTab) return pool.filter(released).sort(byRelease).slice(0, 30)
      const lists = await Promise.all(secs.map((s) => getSectionItems(server, s.key, 'released', 0, 40).then((r) => r.items)))
      return lists.flat().filter(released).sort(byRelease)
    }
    case 'toprated': {
      if (isAnimeTab) return [...pool].sort((a, b2) => (b2.audienceRating ?? 0) - (a.audienceRating ?? 0)).slice(0, 30)
      const lists = await Promise.all(secs.map((s) => getSectionItems(server, s.key, 'audienceRating:desc', 0, 30).then((r) => r.items)))
      return lists.flat().sort((a, b2) => (b2.audienceRating ?? 0) - (a.audienceRating ?? 0))
    }
    case 'watchlist': {
      // What's on your Plex Watchlist that this server has (matched like the Watchlist screen does), shuffled, and only the kind of title this tab is about.
      if (!c.token) return []
      const wl = await getWatchlist(c.token).catch(() => [])
      const kind = tab === 'movie' ? 'movie' : tab === 'show' || tab === 'anime' ? 'show' : undefined
      const mine = wl.filter((i) => !kind || i.type === kind)
      if (!mine.length) return []
      const found = await matchLibrary(server, c.all, mine).catch(() => new Map<string, PlexMedia>())
      return shuffled(mine.map((i) => found.get(i.key)).filter((m): m is PlexMedia => !!m), 11).slice(0, 30)   // (anime: the tab's own filter trims it afterwards)
    }
    case 'short': {
      // Movies that run 90 minutes or less.
      const lists = await Promise.all(secs.filter((s) => s.type === 'movie' && !isOtherSection(s)).map((s) => getAllSectionItems(server, s.key, 'added', undefined, 3000).catch(() => [] as PlexMedia[])))
      return shuffled(lists.flat().filter((m) => (m.duration ?? 0) > 0 && (m.duration ?? 0) <= 90 * 60_000), 12).slice(0, 30)
    }
    case 'airing': return currentlyAiring(server, c.all).then((l) => l.filter((m) => tabOk(tab, m, anime)))   // shows with an episode out in the last 30 days
    case 'serveractivity': {
      // What other people on this server have been watching lately (needs the server owner's view of activity; anyone else just gets no row).
      const hot = await serverTrending(server, c.profileName).catch(() => [])
      const found = await Promise.all(hot.slice(0, 24).map((h) => getMetadata(server, h.key).catch(() => null)))
      return found.filter((m): m is PlexMedia => !!m && (m.type === 'movie' || m.type === 'show'))
    }
    case 'random': {
      if (isAnimeTab) return shuffle(pool).slice(0, 24)
      return shuffle((await Promise.all(secs.map((s) => getRandomItems(server, s.key, 24)))).flat())
    }
    case 'tmdb-movie':
    case 'tmdb-tv': {
      if (!c.tmdbKey) { if (!c.notices.some((n) => n.kind === 'tmdb-key')) c.notices.push({ kind: 'tmdb-key' }); return [] }
      try { return await trendingInLibrary(server, c.all, c.tmdbKey, ref === 'tmdb-movie' ? 'movie' : 'tv') }
      catch (e) { c.notices.push({ kind: 'tmdb-error', message: (e as Error).message }); return [] }
    }
    case 'trending': {
      // Uses a collection you maintain: any collection with "trending" in its name (e.g. "_Trending Movies"). No collection, no row.
      const cols = (await Promise.all(secs.map((s) => getCollections(server, s.key)))).flat().filter((col) => /trending/i.test(col.title))
      return (await Promise.all(cols.map((col) => getCollectionItems(server, col.ratingKey)))).flat()
    }
    case 'quick': {
      // Shows whose episodes run 30 minutes or less.
      const lists = await Promise.all(secs.filter((s) => s.type === 'show').map((s) => getSectionItems(server, s.key, 'added', 0, 400).then((r) => r.items)))
      return shuffle(lists.flat().filter((m) => (m.duration ?? 0) > 0 && (m.duration ?? 0) <= QUICK_MS)).slice(0, 30)
    }
    default: return []
  }
}

/** A mix of the newest and a random sample from a genre, so the row feels fresh each visit. */
async function genreMix(c: Ctx, ref: string): Promise<PlexMedia[]> {
  const { server, tab, secs, anime } = c
  if (tab === 'anime') {
    const inGenre = (anime?.items ?? []).filter((m) => (m.Genre ?? []).some((x) => genreMatch(ref, x.tag)))
    return interleave([...inGenre].sort(byAdded).slice(0, 10), shuffle(inGenre).slice(0, 14))
  }
  const parts = await Promise.all(secs.map(async (s) => {
    const genre = (await getGenres(server, s.key).catch(() => [])).find((x) => genreMatch(ref, x.title))
    if (!genre) return [[], []] as PlexMedia[][]
    return Promise.all([getGenreItems(server, s.key, genre.key, 12).catch(() => []), getGenreRandom(server, s.key, genre.key, 14).catch(() => [])])
  }))
  return interleave(parts.flatMap((p) => p[0]).sort(byAdded), shuffle(parts.flatMap((p) => p[1])))
}

async function custom(c: Ctx, cfg: HomeRowCfg): Promise<PlexMedia[]> {
  if (cfg.kind === 'genre') return genreMix(c, cfg.ref)
  if (cfg.kind === 'playlist') return getPlaylistItems(c.server, cfg.ref)
  if (cfg.kind === 'collection') return getCollectionItems(c.server, cfg.ref)
  return []
}

/** Continue Watching and On Deck as one list, limited to the chosen look-back, minus anything you removed, with pinned titles always first. */
async function continueItems(server: PlexServer, settings: Settings): Promise<PlexMedia[]> {
  const [hubs, deck] = await Promise.all([getHubs(server).catch(() => []), getOnDeck(server).catch(() => [])])
  const fromHub = hubs.find(isContinueHub)?.Metadata ?? []
  const merged = dedupe([...fromHub, ...deck])
  const now = Date.now() / 1000
  const recent = merged.filter((m) => {
    const removedAt = settings.dismissedContinue[m.ratingKey]
    if (removedAt != null && (m.lastViewedAt ?? 0) <= removedAt) return false // removed, and not watched since
    return !(m.lastViewedAt && now - m.lastViewedAt > settings.continueDays * 86400)
  })
  const pins = settings.pinned
  const isPinned = (m: PlexMedia) => !!pins[m.ratingKey] || (!!m.grandparentRatingKey && !!pins[m.grandparentRatingKey])
  // Pinned titles that have nothing in progress still appear, as the show / movie itself.
  const have = new Set(merged.flatMap((m) => [m.ratingKey, m.grandparentRatingKey ?? '']))
  const extras = (await Promise.all(Object.keys(pins).filter((k) => !have.has(k)).sort((x, y) => pins[y] - pins[x]).map((k) => getMetadata(server, k).catch(() => null)))).filter((m): m is PlexMedia => !!m)
  // Your latest movie and your latest show/episode lead; pinned titles come next, then everything else (in progress first).
  const latest = (pick: (m: PlexMedia) => boolean) => recent.filter((m) => pick(m) && m.lastViewedAt).sort((x, y) => (y.lastViewedAt ?? 0) - (x.lastViewedAt ?? 0))[0]
  const lead = [latest((m) => m.type === 'movie'), latest((m) => m.type !== 'movie')].filter((m): m is PlexMedia => !!m).sort((x, y) => (y.lastViewedAt ?? 0) - (x.lastViewedAt ?? 0))
  const led = new Set(lead.map((m) => m.ratingKey))
  const rest = recent.filter((m) => !led.has(m.ratingKey) && !isPinned(m))
  return [...lead, ...merged.filter((m) => isPinned(m) && !led.has(m.ratingKey)), ...extras, ...rest.filter((m) => m.viewOffset), ...rest.filter((m) => !m.viewOffset)]
}

/** The New Season Available shows that belong on this tab. */
export async function newSeasonItems(server: PlexServer, visible: PlexSection[], tab: Tab, anime: AnimeInfo | undefined): Promise<PlexMedia[]> {
  const shows = await newSeasonShows(server, visible).catch(() => [] as PlexMedia[])
  return shows.filter((m) => tabOk(tab, m, anime))
}

/** Just the Continue Watching row, re-read (it changes when you watch something); returns the rows with it replaced, or null if a full reload is needed. */
export async function refreshContinue(server: PlexServer, visible: PlexSection[], tab: Tab, settings: Settings, anime: AnimeInfo | undefined, rows: HomeRow[]): Promise<HomeRow[] | null> {
  const at = rows.findIndex((r) => r.continue)
  if (at < 0) return null
  const hidden = new Set(settings.hiddenLibraries)
  const keep = (m: PlexMedia) => tabOk(tab, m, anime) && (m.librarySectionID == null || !hidden.has(String(m.librarySectionID)))
  const items = (await continueItems(server, settings)).filter(keep)
  let out = items.length ? rows.map((r, i) => (i === at ? { ...r, items: items.slice(0, 30) } : r)) : rows.filter((_, i) => i !== at)
  // Watching the new season takes a show off the New Season Available row.
  if (out.some((r) => r.newSeason)) {
    const fresh = await newSeasonItems(server, visible, tab, anime)
    out = fresh.length ? out.map((r) => (r.newSeason ? { ...r, items: fresh } : r)) : out.filter((r) => !r.newSeason)
  }
  return out
}

export function layoutFor(tab: Tab, settings: Settings, season: Season): HomeRowCfg[] {
  const saved = settings.homeRows[tab]
  let layout = mergeRows(saved, rowCatalog(tab, settings.genres)).filter((r) => r.kind !== 'hub')   // (Plex's own rows were removed; an old layout that had some just loses them)
  if (tab === 'trending') { const own = new Set(rowCatalog('trending').map((r) => r.id)); layout = layout.filter((r) => own.has(r.id)) }
  // Spooky season: Horror might not be among the picked genres; October brings its row back (the Spooky Season list row is added in loadRows).
  if (season === 'halloween' && !saved && (tab === 'all' || tab === 'movie') && !layout.some((r) => r.id === 'genre:Horror' && r.enabled)) layout = layout.map((r) => (r.id === 'genre:Horror' ? { ...r, enabled: true } : r))
  return layout
}

export async function loadRows(server: PlexServer, sections: PlexSection[], tab: Tab, settings: Settings, anime: AnimeInfo | undefined, season: Season, token = '', profileName = ''): Promise<{ rows: HomeRow[]; notices: HomeNotice[] }> {
  const hidden = new Set(settings.hiddenLibraries)
  const visible = sections.filter((s) => !hidden.has(s.key))
  const secOk = (m: PlexMedia) => m.librarySectionID == null || !hidden.has(String(m.librarySectionID))
  const keep = (m: PlexMedia) => tabOk(tab, m, anime) && secOk(m)
  // Built-in rows look where the tab implies; "All" is movie-led by default but custom rows can come from anywhere.
  const builtinSecs = visible.filter((s) => (tab === 'show' ? s.type === 'show' : tab === 'anime' || tab === 'trending' ? true : s.type === 'movie'))
  const customSecs = visible.filter((s) => (tab === 'all' || tab === 'foryou' || tab === 'anime' || tab === 'trending' ? true : s.type === tab))

  const layout = layoutFor(tab, settings, season)

  const notices: HomeNotice[] = []
  const bctx: Ctx = { server, token, profileName, tab, secs: builtinSecs, all: visible, tmdbKey: settings.tmdbKey, anime, keep, notices }
  const cctx: Ctx = { server, token, profileName, tab, secs: customSecs, all: visible, tmdbKey: settings.tmdbKey, anime, keep, notices }
  // The default genre rows (Action, Comedy, Horror...) follow the tab: movies on Home/Movies, shows on Shows. Rows you add yourself search everything.
  const defaults = new Set(defaultRows(tab, settings.genres).map((r) => r.id))

  const rows = await Promise.all(layout.filter((r) => r.enabled).map(async (cfg): Promise<HomeRow | null> => {
    let items: PlexMedia[] = []
    let cont = false
    try {
      if (cfg.kind === 'builtin' && cfg.ref === 'continue') { items = await continueItems(server, settings); cont = true }
      else if (cfg.kind === 'builtin') items = await builtin(bctx, cfg.ref)
      else items = await custom(cfg.kind === 'genre' && defaults.has(cfg.id) ? bctx : cctx, cfg)
    } catch { return null }
    items = items.filter(keep)
    if (!cont) { items = dedupe(items); if (settings.hideWatched) items = items.filter((m) => !isWatched(m)) }
    return items.length ? { id: cfg.id, title: cfg.title, items: items.slice(0, 30), continue: cont } : null
  }))
  const out = rows.filter((r): r is HomeRow => !!r)
  // Seasonal lists (in season, on the movie-led tabs): the list's movies that this server has, right under Continue Watching.
  if ((tab === 'all' || tab === 'movie') && season) {
    for (const list of listsFor(season)) {
      const have = await matchList(server, visible, list).catch(() => [] as PlexMedia[])
      if (have.length < 3) continue
      const row: HomeRow = { id: `seasonal:${list.id}`, title: list.title, items: shuffled(have, 9).slice(0, 30), seasonal: { id: list.id, total: have.length } }
      const at = out.findIndex((r) => r.continue)
      out.splice(at + 1, 0, row)
    }
  }
  // New Season Available: shows you've watched whose new season (or new episodes in a later season) came out recently. On the TV Shows and Anime tabs, and on
  // Home when the banner is off (when it's on, they lead the banner instead).
  if (tab === 'show' || tab === 'anime' || (tab === 'all' && !settings.hero)) {
    const items = await newSeasonItems(server, visible, tab, anime)
    if (items.length) out.splice(out.findIndex((r) => r.continue) + 1, 0, { id: 'builtin:newseason', title: 'New Season Available', subtitle: 'New episodes since you last watched', items, newSeason: true })
  }
  if (tab === 'trending' && settings.tmdbKey && !notices.length && !out.some((r) => r.id.startsWith('builtin:tmdb'))) notices.push({ kind: 'tmdb-empty' })
  return { rows: out, notices }
}

const HERO_SIZE = 10
const interleaveAll = (lists: PlexMedia[][]) => { const out: PlexMedia[] = []; for (let i = 0; i < Math.max(0, ...lists.map((l) => l.length)); i++) for (const l of lists) if (l[i]) out.push(l[i]); return out }

/**
 * Up to ten featured titles, in priority order: what you're watching, then new releases, then what's trending, then recommendations.
 * Each group gets a share (4 / 3 / 2 / 2); unused share flows down to the next group. `recItems` can arrive later (see Home).
 */
export async function loadHero(server: PlexServer, sections: PlexSection[], tab: Tab, settings: Settings, rows: HomeRow[], anime?: AnimeInfo, recItems: PlexMedia[] = [], topUp = true): Promise<PlexMedia[]> {
  const hidden = new Set(settings.hiddenLibraries)
  const visible = sections.filter((s) => !hidden.has(s.key))
  const art = (m: PlexMedia) => !!(m.art || m.grandparentArt)
  // The banner features movies and shows only: not clips, home videos, concerts or other personal media.
  const others = new Set(sections.filter(isOtherSection).map((x) => x.key))
  const feature = (m: PlexMedia) => (m.type === 'movie' || m.type === 'show' || m.type === 'episode') && !others.has(String(m.librarySectionID))
  const ok = (m: PlexMedia) => art(m) && feature(m) && tabOk(tab, m, anime)

  const cont = (rows.find((r) => r.continue)?.items ?? []).filter(ok)
  const fresh = rows.filter((r) => !r.continue && r.id === 'builtin:released').flatMap((r) => r.items)
  const added = rows.filter((r) => !r.continue && /recent|added/i.test(r.id + r.title) && r.id !== 'builtin:released').flatMap((r) => r.items)
  const newest = [...fresh, ...added].filter(ok)
  const kinds: ('movie' | 'tv')[] = tab === 'movie' ? ['movie'] : tab === 'show' ? ['tv'] : ['movie', 'tv']
  const tmdb = settings.tmdbKey && tab !== 'anime' ? await Promise.all(kinds.map((k) => trendingInLibrary(server, visible, settings.tmdbKey, k).catch(() => [] as PlexMedia[]))) : []
  const trend = [...interleaveAll(tmdb), ...rows.filter((r) => r.id === 'builtin:trending').flatMap((r) => r.items)].filter(ok)
  const recs = recItems.filter(ok)
  // Shows with a new season out lead the banner (on the tabs that have shows), each marked "New Season".
  const nsAll = tab === 'all' || tab === 'show' || tab === 'anime' ? await newSeasonItems(server, visible, tab, anime) : []
  const ns = nsAll.filter(ok)
  const nsInfo = new Map(nsAll.map((m) => [m.ratingKey, m.newSeason]))

  const seen = new Set<string>()
  // What you're watching leads in order; the other groups are reshuffled each launch so the later slides differ.
  const groups = [ns.slice(0, 3), cont, shuffled(newest.slice(0, 16), 4), shuffled(trend.slice(0, 16), 5), shuffled(recs.slice(0, 16), 6)].map((list) => list.filter((m) => !seen.has(showKey(m)) && !!seen.add(showKey(m))))
  const quota = [2, 4, 3, 2, 2]
  const take = groups.map((g, i) => Math.min(quota[i], g.length))
  let spare = HERO_SIZE - take.reduce((a, b) => a + b, 0)
  for (let i = 0; i < groups.length && spare > 0; i++) { const more = Math.min(spare, groups[i].length - take[i]); take[i] += more; spare -= more }
  const picks = groups.flatMap((g, i) => g.slice(0, take[i])).slice(0, HERO_SIZE)

  if (topUp && picks.length < HERO_SIZE) {
    const have = new Set(picks.map(showKey))
    const fallback = rows.flatMap((r) => r.items).filter((m) => ok(m) && !have.has(showKey(m)) && !!have.add(showKey(m)))
    picks.push(...fallback.slice(0, HERO_SIZE - picks.length))
  }
  const full = await Promise.all(picks.map((m) => getMetadata(server, showKey(m)).catch(() => null)))
  return full.filter((m): m is PlexMedia => !!m).map((m) => (nsInfo.get(m.ratingKey) ? { ...m, newSeason: nsInfo.get(m.ratingKey) } : m))
}
