// Holiday episode channels: every episode on the server that belongs to a holiday (Thanksgiving, Christmas, Halloween), from any show,
// played in release order. An episode counts when it is on a known list (lib/lists/holidayEpisodes.ts), when its title names the holiday,
// or when its description does. The lists and title search are quick; reading every show's descriptions takes longer, so it runs in the
// background and the channels update when it finishes (and the result is remembered for half a day).
import { getAllLeaves, getAllSectionItems, getWatchedShowKeys, isOtherSection, searchEpisodesByTitle, type PlexMedia, type PlexSection, type PlexServer } from './plex'
import type { Channel } from './tvguide'
import { HOLIDAY_EPISODES, type HolidayId } from './lists/holidayEpisodes'
export type { HolidayId }
import { HOLIDAY_BLOCKED, HOLIDAY_SHOW_NAMES } from './lists/holidayShows'

// ---- Testing switches. For now every holiday channel is on all year, counts any show, and appears with a single episode. ----
// Later: ALWAYS_ON = false (only in season, see `season`), ONLY_WATCHED = true (shows with something watched), MIN_EPISODES = 6.
const ALWAYS_ON = true
const ONLY_WATCHED = false
const MIN_EPISODES = 1

interface Holiday { id: HolidayId; name: string; row: string; season: string; titleTerms: string[]; re: RegExp; accent: string }
const HOLIDAYS: Holiday[] = [
  { id: 'thanksgiving', name: 'Thanksgiving Episodes', row: 'Giving Thanks: Thanksgiving Episodes', season: 'thanksgiving', titleTerms: ['thanksgiving'], re: /thanksgiving/i, accent: '#d9822b' },
  { id: 'christmas', name: 'Holiday Episodes', row: 'Deck the Halls: Holiday Episodes', season: 'christmas', titleTerms: ['christmas', 'xmas'], re: /christmas|xmas|secret santa|santa claus/i, accent: '#e0463b' },
  { id: 'halloween', name: 'Halloween Episodes', row: 'Tricks & Treats: Halloween Episodes', season: 'halloween', titleTerms: ['halloween', 'trick or treat', 'trick-or-treat'], re: /halloween|trick[- ]or[- ]treat/i, accent: '#ff7a1a' },
]

const norm = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/\(\d{4}\)\s*$/, '').replace(/^(the|a|an) /, '').replace(/[^a-z0-9]/g, '')
const ALLOWED = new Set([...HOLIDAY_SHOW_NAMES, ...Object.values(HOLIDAY_EPISODES).flat().map((e) => e[0])].map((n) => norm(n)))
const BLOCKED = new Set(HOLIDAY_BLOCKED.map((n) => norm(n)))
const counts = (title: string) => ALLOWED.has(norm(title)) && !BLOCKED.has(norm(title))
const tvLibs = (sections: PlexSection[]) => sections.filter((s) => s.type === 'show' && !isOtherSection(s))

const leavesMemo = new Map<string, Promise<PlexMedia[]>>()
const leavesOf = (server: PlexServer, showKey: string) => {
  const k = server.uri + showKey
  let p = leavesMemo.get(k)
  if (!p) { p = getAllLeaves(server, showKey).then((l) => l.filter((m) => m.type === 'episode')).catch(() => [] as PlexMedia[]); leavesMemo.set(k, p); setTimeout(() => leavesMemo.delete(k), 10 * 60_000) }
  return p
}

interface Show { key: string; title: string }
const showMeta = new Map<string, { w: boolean; pop: number }>()   // per show: watched on this profile, and how well liked
async function showsOf(server: PlexServer, libs: PlexSection[]): Promise<Show[]> {
  const out: Show[] = [], seen = new Set<string>()
  for (const l of await Promise.all(libs.map((s) => getAllSectionItems(server, s.key, 'titleAsc', undefined, 5000, false, true).catch(() => [] as PlexMedia[])))) {
    for (const m of l) if (m.type === 'show' && counts(m.title) && !seen.has(m.ratingKey)) { seen.add(m.ratingKey); out.push({ key: m.ratingKey, title: m.title }); showMeta.set(m.ratingKey, { w: (m.viewedLeafCount ?? 0) > 0, pop: m.audienceRating ?? m.rating ?? 0 }) }
  }
  return out
}

type Found = Record<HolidayId, Map<string, PlexMedia>>
const emptyFound = (): Found => ({ thanksgiving: new Map(), christmas: new Map(), halloween: new Map() })

/** Episodes from the known lists: only shows that are on this server are looked at. */
async function fromLists(server: PlexServer, shows: Show[], found: Found) {
  const byName = new Map<string, string[]>()
  for (const s of shows) { const k = norm(s.title); byName.set(k, [...(byName.get(k) ?? []), s.key]) }
  for (const h of HOLIDAYS) {
    const wanted = new Map<string, typeof HOLIDAY_EPISODES.christmas>()
    for (const e of HOLIDAY_EPISODES[h.id]) { const k = norm(e[0]); if (byName.has(k)) wanted.set(k, [...(wanted.get(k) ?? []), e]) }
    await Promise.all([...wanted].map(async ([name, entries]) => {
      for (const key of byName.get(name) ?? []) {
        const eps = await leavesOf(server, key)
        for (const [, s, n, title] of entries) {
          const byTitle = title ? eps.find((m) => norm(m.title) === norm(title)) : undefined
          const byNumber = s > 0 ? eps.find((m) => m.parentIndex === s && m.index === n) : undefined
          const hit = byTitle ?? byNumber
          if (hit) found[h.id].set(hit.ratingKey, hit)
        }
      }
    }))
  }
}

/** Episodes whose title names the holiday (the server does the searching). */
async function fromTitles(server: PlexServer, libs: PlexSection[], found: Found) {
  for (const h of HOLIDAYS) for (const lib of libs) for (const term of h.titleTerms) {
    for (const m of await searchEpisodesByTitle(server, lib.key, term)) if (m.type === 'episode' && h.re.test(m.title) && counts(m.grandparentTitle ?? '')) found[h.id].set(m.ratingKey, m)
  }
}

/** Episodes whose description mentions the holiday: reads every show's episodes, a few at a time. */
async function fromSummaries(server: PlexServer, shows: Show[], found: Found) {
  let next = 0
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < shows.length) {
      for (const m of await leavesOf(server, shows[next++].key)) {
        const text = `${m.title} ${m.summary ?? ''}`
        for (const h of HOLIDAYS) if (h.re.test(text)) found[h.id].set(m.ratingKey, m)
      }
    }
  }))
}

function build(found: Found, watched: Set<string> | undefined, season: string | null): Channel[] {
  const out: Channel[] = []
  let n = -10
  for (const h of HOLIDAYS) {
    if (!ALWAYS_ON && h.season !== season) continue
    const eps = [...found[h.id].values()].filter((m) => !watched || (m.grandparentRatingKey && watched.has(m.grandparentRatingKey)))
    if (eps.length < MIN_EPISODES) continue
    const items = eps.map((m) => ({
      key: m.ratingKey, title: `${m.grandparentTitle ?? ''}${m.grandparentTitle ? ': ' : ''}${m.title}`, year: m.year, dur: m.duration && m.duration > 60_000 ? m.duration : 30 * 60_000,
      date: m.originallyAvailableAt, thumb: m.grandparentThumb ?? m.thumb, art: m.grandparentArt ?? m.art,
      ep: m.grandparentRatingKey ? { show: m.grandparentRatingKey, showTitle: m.grandparentTitle ?? '', label: `S${String(m.parentIndex ?? 0).padStart(2, '0')}E${String(m.index ?? 0).padStart(2, '0')}`, title: m.title, still: m.thumb, w: showMeta.get(m.grandparentRatingKey)?.w, pop: showMeta.get(m.grandparentRatingKey)?.pop } : undefined,
    }))
    out.push({ id: `seasonal:eps:${h.id}`, number: n++, name: h.name, kind: 'movies', genres: [], movieItems: items, movieOrder: 'release', seasonal: true, accent: h.accent })
  }
  return out
}

const KEEP = 12 * 60 * 60_000
const LS = 'chezzflix_holiday_eps_v4'
const readSaved = (server: PlexServer): Channel[] | undefined => { try { const s = JSON.parse(localStorage.getItem(LS) ?? 'null'); if (s && s.uri === server.uri && s.always === ALWAYS_ON && s.watched === ONLY_WATCHED && Date.now() - s.at < KEEP) return s.chans } catch { /* ignore */ } }
const save = (server: PlexServer, chans: Channel[]) => { try { localStorage.setItem(LS, JSON.stringify({ uri: server.uri, at: Date.now(), always: ALWAYS_ON, watched: ONLY_WATCHED, chans })) } catch { /* ignore */ } }

let running: Promise<void> | undefined
let lateCb: ((c: Channel[]) => void) | undefined   // (the newest listener: the guide may have been reopened while the scan runs)

/**
 * The holiday episode channels. Returns what the lists and episode titles give right away; the descriptions are read in the background,
 * and `onLate` gets the complete set when that is done. `season` is the app's current season (only used once ALWAYS_ON is off).
 */
const memo = new Map<string, Promise<Channel[]>>()   // what was worked out this session (replaced by the complete set when the scan finishes)
export function holidayEpisodeChannels(server: PlexServer, sections: PlexSection[], season: string | null, onLate?: (c: Channel[]) => void): Promise<Channel[]> {
  const k = server.uri + '|' + (ALWAYS_ON ? '' : season)
  lateCb = onLate ?? lateCb
  let p = memo.get(k)
  if (!p) { p = work(server, sections, season, (all) => { memo.set(k, Promise.resolve(all)); lateCb?.(all) }); memo.set(k, p); setTimeout(() => memo.delete(k), 20 * 60_000) }
  return p
}

async function work(server: PlexServer, sections: PlexSection[], season: string | null, done: (c: Channel[]) => void): Promise<Channel[]> {
  const saved = readSaved(server)
  if (saved) return saved.filter((c) => ALWAYS_ON || c.id === `seasonal:eps:${season}`)
  const libs = tvLibs(sections)
  if (!libs.length) return []
  const shows = await showsOf(server, libs)
  const watched = ONLY_WATCHED ? new Set((await Promise.all(libs.map((l) => getWatchedShowKeys(server, l.key).catch(() => new Set<string>())))).flatMap((s) => [...s])) : undefined
  const found = emptyFound()
  await Promise.all([fromLists(server, shows, found), fromTitles(server, libs, found)])
  const quick = build(found, watched, season)
  if (!running) {
    running = fromSummaries(server, ONLY_WATCHED ? shows.filter((s) => watched?.has(s.key)) : shows, found)
      .then(() => { const all = build(found, watched, season); save(server, all); done(all); window.dispatchEvent(new Event('chezz-holiday')) })
      .catch(() => {})
      .finally(() => { running = undefined })
  }
  return quick
}

// ---------- The Home row and its screens ----------
export interface HolidayShow { key: string; title: string; thumb?: string; art?: string; still?: string; keys: string[]; count: number; watched: boolean; pop: number }
export interface HolidayRowData { id: HolidayId; title: string; channelId: string; /** The shows to put in the row (at most four). */ shows: HolidayShow[]; /** Every show that qualifies, for "Explore all". */ all: HolidayShow[] }
export const holidayTitle = (id: HolidayId) => HOLIDAYS.find((h) => h.id === id)?.row ?? ''
export const holidayAccent = (id: HolidayId) => HOLIDAYS.find((h) => h.id === id)?.accent ?? '#ff7a1a'
export const holidayName = (id: HolidayId) => HOLIDAYS.find((h) => h.id === id)?.name ?? ''
const SHOW_MIN = 3, ROW_MAX = 4

/** One holiday's episodes, grouped by show; only shows with at least three of them count. Watched shows first, then the best liked. */
export function holidayShows(chan: Channel | undefined): HolidayShow[] {
  const by = new Map<string, HolidayShow>()
  for (const m of chan?.movieItems ?? []) {
    if (!m.ep) continue
    const g = by.get(m.ep.show) ?? { key: m.ep.show, title: m.ep.showTitle, thumb: m.thumb, art: m.art, still: m.ep.still, keys: [], count: 0, watched: !!m.ep.w, pop: m.ep.pop ?? 0 }
    g.keys.push(m.key); g.count++
    if (!g.still && m.ep.still) g.still = m.ep.still
    by.set(m.ep.show, g)
  }
  return [...by.values()].filter((g) => g.count >= SHOW_MIN).sort((a, b) => Number(b.watched) - Number(a.watched) || b.pop - a.pop || b.count - a.count)
}

/** The Home row for the holiday that's on, if it has a show with enough episodes. */
export async function holidayRows(server: PlexServer, sections: PlexSection[], season: string | null = null): Promise<HolidayRowData[]> {
  if (!season) return []   // only in season (the preview setting in Settings pretends it's one)
  const chans = await holidayEpisodeChannels(server, sections, season)
  const out: HolidayRowData[] = []
  for (const h of HOLIDAYS) {
    if (h.season !== season) continue
    const chan = chans.find((c) => c.id === `seasonal:eps:${h.id}`)
    const all = holidayShows(chan)
    if (all.length) out.push({ id: h.id, title: h.row, channelId: `seasonal:eps:${h.id}`, shows: all.slice(0, ROW_MAX), all })
  }
  return out
}

/** One show's holiday episodes for a holiday, oldest first (the order they play as a playlist). */
export async function holidayEpisodesOf(server: PlexServer, sections: PlexSection[], id: HolidayId, showKey: string): Promise<PlexMedia[]> {
  const chan = (await holidayEpisodeChannels(server, sections, null)).find((c) => c.id === `seasonal:eps:${id}`)
  const want = new Set(holidayShows(chan).find((g) => g.key === showKey)?.keys ?? [])
  const eps = (await leavesOf(server, showKey)).filter((m) => want.has(m.ratingKey))
  return eps.sort((a, b) => (a.originallyAvailableAt ?? '').localeCompare(b.originallyAvailableAt ?? '') || (a.parentIndex ?? 0) - (b.parentIndex ?? 0) || (a.index ?? 0) - (b.index ?? 0))
}
