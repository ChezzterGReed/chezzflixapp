import {
  getCollectionItems, getCollections, getGenreItems, getGenreRandom, getGenres, getHubs, getMetadata, getOnDeck, getPlaylistItems,
  getRandomItems, getRecentShows, getSectionItems, isOtherSection, isWatched, type PlexMedia, type PlexSection, type PlexServer,
} from './plex'
import type { HomeRowCfg, HomeTab, Season, Settings } from './settings'
import { trendingInLibrary } from './tmdb'

export type Tab = HomeTab
export interface HomeRow { id: string; title: string; items: PlexMedia[]; continue?: boolean }
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
  const base = [b('toprated', 'Top Rated', false), b('random', 'Random Picks', false)]
  if (tab === 'show') return [b('released', 'Recently Released', false), ...base, g('Sci-Fi', 'Sci-Fi', false), g('Documentary', 'Documentary', false), g('Horror', 'Horror', false)]
  if (tab === 'anime') return [b('released', 'Recently Released', false), ...base, g('Adventure', 'Adventure', false)]
  return [...base, g('Thriller', 'Thriller', false), g('Sci-Fi', 'Sci-Fi', false), g('Drama', 'Drama', false), g('Animation', 'Animation', false), g('Horror', 'Horror', false)]
}

export async function listPlexHubs(server: PlexServer): Promise<HomeRowCfg[]> {
  const hubs = await getHubs(server).catch(() => [])
  return hubs.filter((h) => !isContinueHub(h)).map((h) => ({ id: `hub:${h.hubIdentifier}`, kind: 'hub' as const, ref: h.hubIdentifier, title: h.title, enabled: false }))
}

/** Everything a tab could show: defaults (on), then extras and Plex's own rows (off). */
export function rowCatalog(tab: Tab, plexHubs: HomeRowCfg[] = [], genres: string[] = []): HomeRowCfg[] {
  const defaults = defaultRows(tab, genres)
  const have = new Set(defaults.map((r) => r.id))
  return [...defaults, ...optionalRows(tab).filter((r) => !have.has(r.id)), ...plexHubs.filter((r) => !have.has(r.id))]
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

interface Ctx { server: PlexServer; tab: Tab; secs: PlexSection[]; all: PlexSection[]; tmdbKey: string; anime?: AnimeInfo; keep: (m: PlexMedia) => boolean; notices: HomeNotice[] }

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

const CONTINUE_WINDOW_S = 90 * 86400

/** Continue Watching and On Deck as one list, limited to the last three months, minus anything you removed. */
async function continueItems(server: PlexServer, settings: Settings): Promise<PlexMedia[]> {
  const [hubs, deck] = await Promise.all([getHubs(server).catch(() => []), getOnDeck(server).catch(() => [])])
  const fromHub = hubs.find(isContinueHub)?.Metadata ?? []
  const merged = dedupe([...fromHub, ...deck])
  const now = Date.now() / 1000
  const recent = merged.filter((m) => {
    const removedAt = settings.dismissedContinue[m.ratingKey]
    if (removedAt != null && (m.lastViewedAt ?? 0) <= removedAt) return false // removed, and not watched since
    return !(m.lastViewedAt && now - m.lastViewedAt > CONTINUE_WINDOW_S)
  })
  return [...recent.filter((m) => m.viewOffset), ...recent.filter((m) => !m.viewOffset)]
}

export function layoutFor(tab: Tab, settings: Settings, plexHubs: HomeRowCfg[], season: Season): HomeRowCfg[] {
  const saved = settings.homeRows[tab]
  let layout = mergeRows(saved, rowCatalog(tab, plexHubs, settings.genres))
  // Spooky season: the Horror row becomes "Spooky Season" and (unless you've arranged things yourself) moves up under Continue Watching.
  if (season === 'halloween') {
    // Horror might not be among the picked genres; October brings it back.
    if (!saved && (tab === 'all' || tab === 'movie') && !layout.some((r) => r.id === 'genre:Horror' && r.enabled)) layout = layout.map((r) => (r.id === 'genre:Horror' ? { ...r, enabled: true } : r))
    layout = layout.map((r) => (r.id === 'genre:Horror' ? { ...r, title: 'Spooky Season' } : r))
    if (!saved) {
      const i = layout.findIndex((r) => r.id === 'genre:Horror')
      if (i > 1) { const [h] = layout.splice(i, 1); layout.splice(1, 0, h) }
    }
  }
  return layout
}

export async function loadRows(server: PlexServer, sections: PlexSection[], tab: Tab, settings: Settings, anime: AnimeInfo | undefined, season: Season): Promise<{ rows: HomeRow[]; notices: HomeNotice[] }> {
  const hidden = new Set(settings.hiddenLibraries)
  const visible = sections.filter((s) => !hidden.has(s.key))
  const secOk = (m: PlexMedia) => m.librarySectionID == null || !hidden.has(String(m.librarySectionID))
  const keep = (m: PlexMedia) => tabOk(tab, m, anime) && secOk(m)
  // Built-in rows look where the tab implies; "All" is movie-led by default but custom rows can come from anywhere.
  const builtinSecs = visible.filter((s) => (tab === 'show' ? s.type === 'show' : tab === 'anime' || tab === 'trending' ? true : s.type === 'movie'))
  const customSecs = visible.filter((s) => (tab === 'all' || tab === 'foryou' || tab === 'anime' || tab === 'trending' ? true : s.type === tab))

  const hubs = await getHubs(server).catch(() => [])
  const plexHubs = hubs.filter((h) => !isContinueHub(h))
  const hubCfgs = plexHubs.map((h) => ({ id: `hub:${h.hubIdentifier}`, kind: 'hub' as const, ref: h.hubIdentifier, title: h.title, enabled: false }))
  const layout = layoutFor(tab, settings, hubCfgs, season)

  const notices: HomeNotice[] = []
  const bctx: Ctx = { server, tab, secs: builtinSecs, all: visible, tmdbKey: settings.tmdbKey, anime, keep, notices }
  const cctx: Ctx = { server, tab, secs: customSecs, all: visible, tmdbKey: settings.tmdbKey, anime, keep, notices }
  // The default genre rows (Action, Comedy, Horror...) follow the tab: movies on Home/Movies, shows on Shows. Rows you add yourself search everything.
  const defaults = new Set(defaultRows(tab, settings.genres).map((r) => r.id))

  const rows = await Promise.all(layout.filter((r) => r.enabled).map(async (cfg): Promise<HomeRow | null> => {
    let items: PlexMedia[] = []
    let cont = false
    try {
      if (cfg.kind === 'builtin' && cfg.ref === 'continue') { items = await continueItems(server, settings); cont = true }
      else if (cfg.kind === 'builtin') items = await builtin(bctx, cfg.ref)
      else if (cfg.kind === 'hub') items = plexHubs.find((h) => h.hubIdentifier === cfg.ref)?.Metadata ?? []
      else items = await custom(cfg.kind === 'genre' && defaults.has(cfg.id) ? bctx : cctx, cfg)
    } catch { return null }
    items = items.filter(keep)
    if (!cont) { items = dedupe(items); if (settings.hideWatched) items = items.filter((m) => !isWatched(m)) }
    return items.length ? { id: cfg.id, title: cfg.title, items: items.slice(0, 30), continue: cont } : null
  }))
  const out = rows.filter((r): r is HomeRow => !!r)
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

  const seen = new Set<string>()
  const groups = [cont, newest, trend, recs].map((list) => list.filter((m) => !seen.has(showKey(m)) && !!seen.add(showKey(m))))
  const quota = [4, 3, 2, 2]
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
  return full.filter((m): m is PlexMedia => !!m)
}
