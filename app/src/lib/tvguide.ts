// TV Guide engine: turns "channels" (a set of shows, or a set of movie genres) into an endless schedule, like cable TV.
// The guide is built only when the TV Guide screen is opened, never at startup. It is kept on this device and reused: what has aired is
// dropped and the future is topped up, so leaving and coming back finds the same channels still "on". Nothing here reports watch progress.
import { useSyncExternalStore } from 'react'
import {
  DEMO_URI, getAllLeaves, getChildren, getGenreItems, getGenres, isOtherSection, type PlexMedia, type PlexSection, type PlexServer,
} from './plex'
import { shuffled } from './session'

// ---------- Channels ----------
export interface Channel {
  id: string
  number: number
  name: string
  kind: 'shows' | 'movies'
  /** Show channels: the shows (local ratingKey + title + artwork paths), how many episodes per turn, and the order. */
  shows?: { key: string; title: string; thumb?: string; art?: string }[]
  perBlock?: number
  episodeOrder?: 'ordered' | 'random'
  /** Movie channels: genre names (all movies in any of them), movies added one by one, and the order. */
  genres?: string[]
  movieItems?: { key: string; title: string; year?: number; dur: number; date?: string; thumb?: string; art?: string }[]
  movieOrder?: 'release' | 'random'
  /** Audio and subtitle choices for this channel (they override the guide's defaults). */
  prefs?: ChannelPrefs
}
export interface ChannelPrefs { subs?: 'default' | 'on' | 'off'; subLang?: string; audioLang?: string }

// ---------- Languages for audio / subtitle preferences ----------
export const LANGS: { id: string; name: string; codes: string[] }[] = [
  { id: 'en', name: 'English', codes: ['en', 'eng'] }, { id: 'ja', name: 'Japanese', codes: ['ja', 'jpn'] }, { id: 'es', name: 'Spanish', codes: ['es', 'spa'] },
  { id: 'fr', name: 'French', codes: ['fr', 'fra', 'fre'] }, { id: 'de', name: 'German', codes: ['de', 'deu', 'ger'] }, { id: 'it', name: 'Italian', codes: ['it', 'ita'] },
  { id: 'pt', name: 'Portuguese', codes: ['pt', 'por'] }, { id: 'ko', name: 'Korean', codes: ['ko', 'kor'] }, { id: 'zh', name: 'Chinese', codes: ['zh', 'zho', 'chi'] },
  { id: 'ru', name: 'Russian', codes: ['ru', 'rus'] }, { id: 'hi', name: 'Hindi', codes: ['hi', 'hin'] },
]
export const langName = (id?: string) => LANGS.find((l) => l.id === id)?.name ?? 'Default'
/** Does a track (language code or title) match a language choice? */
export function trackIs(t: { lang?: string; title?: string }, id?: string): boolean {
  const l = LANGS.find((x) => x.id === id)
  if (!l) return false
  const code = (t.lang ?? '').toLowerCase()
  return l.codes.some((c) => code === c || code.startsWith(c + '-')) || (t.title ?? '').toLowerCase().includes(l.name.toLowerCase())
}
/** Which audio / subtitle track to switch to: a channel's own choice, else the guide's default. Returns undefined to leave things alone. */
export function chooseTracks(tracks: { id: number; type: string; lang?: string; title?: string; forced: boolean }[], channel: ChannelPrefs | undefined, defaults: { subs: 'on' | 'off'; subLang: string; audioLang: string }) {
  const audioLang = channel?.audioLang || defaults.audioLang
  const subsMode = channel?.subs && channel.subs !== 'default' ? channel.subs : defaults.subs
  const subLang = channel?.subLang || defaults.subLang
  const audio = audioLang ? tracks.filter((t) => t.type === 'audio').find((t) => trackIs(t, audioLang)) : undefined
  let sid: number | 'no' | undefined
  if (subsMode === 'off') sid = 'no'
  else {
    const subs = tracks.filter((t) => t.type === 'sub' && trackIs(t, subLang || 'en'))
    const full = subs.find((t) => !t.forced) ?? subs[0]
    sid = full?.id
  }
  return { aid: audio?.id, sid }
}
export type ChannelDraft = Omit<Channel, 'id' | 'number'>

export const MAX_CHANNELS = 40
export const HOUR = 3_600_000
const MIN = 60_000

/** Two channels with the same name get (1), (2)... */
export function uniqueName(name: string, others: string[]): string {
  const base = name.trim() || 'Channel'
  const taken = new Set(others.map((n) => n.toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  for (let i = 1; ; i++) { const c = `${base} (${i})`; if (!taken.has(c.toLowerCase())) return c }
}
export function newChannel(draft: ChannelDraft, existing: Channel[]): Channel {
  const used = new Set(existing.map((c) => c.number))
  let number = 1; while (used.has(number)) number++
  return { ...draft, id: `ch-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`, number, name: uniqueName(draft.name, existing.map((c) => c.name)) }
}
/** A copy of a channel (new number, name with (1), (2)...). */
export function cloneChannel(c: Channel, existing: Channel[]): Channel {
  const { id: _id, number: _n, ...draft } = JSON.parse(JSON.stringify(c)) as Channel
  void _id; void _n
  return newChannel({ ...draft, name: c.name }, existing)
}
/** What the schedule depends on: when this changes, the channel's schedule is rebuilt. */
const signature = (c: Channel) => JSON.stringify([c.kind, c.shows?.map((s) => s.key), c.perBlock, c.episodeOrder, c.genres, c.movieItems?.map((m) => m.key), c.movieOrder])

// ---------- Schedule ----------
export interface Slot {
  key: string          // ratingKey of the episode / movie to play
  start: number        // epoch ms
  end: number
  title: string        // show or movie title
  sub?: string         // "S02E04 · Episode title" or the movie's year
  th?: string          // poster path
  ar?: string          // backdrop path
}
interface ShowState { start: number; seed: number; pos: number }
interface ChanState { rot: number; inBlock: number; shows: Record<string, ShowState>; movie?: ShowState }
interface Stored { sig: string; slots: Slot[]; st: ChanState }
interface Source { eps?: Record<string, Ep[]>; movies?: Movie[] }
interface Ep { key: string; dur: number; label: string; title: string }
interface Movie { key: string; dur: number; title: string; year?: number; date: string; th?: string; ar?: string }

// ---------- Seeded randomness (so a saved position can be resumed exactly) ----------
function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
function permutation(n: number, seed: number): number[] {
  const r = mulberry32(seed), a = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}
const permCache = new Map<string, number[]>()
function perm(n: number, seed: number) { const k = `${n}:${seed}`; let p = permCache.get(k); if (!p) { if (permCache.size > 200) permCache.clear(); p = permutation(n, seed); permCache.set(k, p) } return p }
/** The index of the pos-th item: every item is used once per cycle (in order, or in a fresh shuffle each cycle) before any repeats. */
function pick(n: number, st: ShowState, random: boolean): number {
  const t = st.start + st.pos
  return random ? perm(n, st.seed + Math.floor(t / n))[t % n] : t % n
}
const freshState = (n: number): ShowState => ({ start: Math.floor(Math.random() * Math.max(1, n)), seed: Math.floor(Math.random() * 2 ** 30), pos: 0 })

// ---------- Loading what a channel plays ----------
const episodeCache = new Map<string, Ep[]>()
async function loadEpisodes(server: PlexServer, showKey: string): Promise<Ep[]> {
  const hit = episodeCache.get(server.uri + showKey)
  if (hit) return hit
  let leaves: PlexMedia[] = []
  if (server.uri !== DEMO_URI) leaves = await getAllLeaves(server, showKey).catch(() => [])
  if (!leaves.length) {   // (also how the demo works) walk the seasons
    const seasons = await getChildren(server, showKey).catch(() => [] as PlexMedia[])
    leaves = (await Promise.all(seasons.map((s) => getChildren(server, s.ratingKey).catch(() => [] as PlexMedia[])))).flat()
  }
  const eps = leaves
    .filter((e) => e.type === 'episode' && (e.parentIndex ?? 1) !== 0)   // no specials
    .sort((a, b) => (a.parentIndex ?? 0) - (b.parentIndex ?? 0) || (a.index ?? 0) - (b.index ?? 0))
    .map((e): Ep => ({
      key: e.ratingKey, dur: e.duration && e.duration > 60_000 ? e.duration : 30 * MIN, title: e.title,
      label: `S${String(e.parentIndex ?? 0).padStart(2, '0')}E${String(e.index ?? 0).padStart(2, '0')}`,
    }))
  episodeCache.set(server.uri + showKey, eps)
  return eps
}

const movieCache = new Map<string, Movie[]>()
const lower = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
export async function loadMovies(server: PlexServer, sections: PlexSection[], genres: string[]): Promise<Movie[]> {
  const ck = server.uri + '|' + sections.map((s) => s.key).join(',') + '|' + [...genres].sort().join(',')
  const hit = movieCache.get(ck)
  if (hit) return hit
  const want = new Set(genres.map(lower))
  const libs = sections.filter((s) => s.type === 'movie' && !isOtherSection(s))
  const best = new Map<string, { m: PlexMedia; rank: number }>()
  await Promise.all(libs.map(async (sec) => {
    const rank = /4k|uhd/i.test(sec.title) ? 1 : 0   // prefer the regular copy over a 4K one
    const gs = (await getGenres(server, sec.key).catch(() => [])).filter((g) => want.has(lower(g.title)))
    for (const g of gs) {
      for (const m of await getGenreItems(server, sec.key, g.key, 4000).catch(() => [] as PlexMedia[])) {
        const id = m.guid || `${lower(m.title)}:${m.year ?? ''}`
        const cur = best.get(id)
        if (!cur || rank < cur.rank) best.set(id, { m, rank })
      }
    }
  }))
  const list = [...best.values()].map(({ m }): Movie => ({
    key: m.ratingKey, dur: m.duration && m.duration > 10 * MIN ? m.duration : 100 * MIN, title: m.title, year: m.year,
    date: m.originallyAvailableAt ?? `${m.year ?? 0}`, th: m.thumb, ar: m.art,
  }))
  movieCache.set(ck, list)
  return list
}

// ---------- Building one channel's schedule ----------
async function sources(server: PlexServer, sections: PlexSection[], ch: Channel): Promise<Source> {
  if (ch.kind === 'shows') {
    const eps: Record<string, Ep[]> = {}
    await Promise.all((ch.shows ?? []).map(async (s) => { eps[s.key] = await loadEpisodes(server, s.key) }))
    return { eps }
  }
  const own: Movie[] = (ch.movieItems ?? []).map((m) => ({ key: m.key, dur: m.dur > 10 * MIN ? m.dur : 100 * MIN, title: m.title, year: m.year, date: m.date ?? `${m.year ?? 0}`, th: m.thumb, ar: m.art }))
  const fromGenres = (ch.genres ?? []).length ? await loadMovies(server, sections, ch.genres ?? []) : []
  const seen = new Set(own.map((m) => m.key))
  const movies = [...own, ...fromGenres.filter((m) => !seen.has(m.key))]
  return { movies: ch.movieOrder === 'release' ? [...movies].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)) : movies }
}

/** Adds programs to the end of a channel's schedule until it reaches `until`. The first program of a fresh schedule is already part-way through. */
function fill(ch: Channel, src: Source, stored: Stored, now: number, until: number) {
  const { slots, st } = stored
  const add = (s: Omit<Slot, 'start' | 'end'>, dur: number) => {
    let start = slots.length ? slots[slots.length - 1].end : now
    if (!slots.length) start = now - Math.round(dur * (0.1 + Math.random() * 0.7))   // usually join part-way through
    slots.push({ ...s, start, end: start + dur })
  }
  let guard = 0
  const last = () => (slots.length ? slots[slots.length - 1].end : -1)
  if (ch.kind === 'shows') {
    const shows = (ch.shows ?? []).filter((s) => (src.eps?.[s.key]?.length ?? 0) > 0)
    if (!shows.length) return
    const block = Math.max(1, Math.min(5, ch.perBlock ?? 1))
    while ((last() < until) && guard++ < 5000) {
      const show = shows[st.rot % shows.length]
      const eps = src.eps![show.key]
      const ss = (st.shows[show.key] ??= freshState(eps.length))
      const ep = eps[pick(eps.length, ss, ch.episodeOrder === 'random')]
      ss.pos++
      add({ key: ep.key, title: show.title, sub: `${ep.label} · ${ep.title}`, th: show.thumb, ar: show.art }, ep.dur)
      if (++st.inBlock >= block) { st.inBlock = 0; st.rot++ }
    }
  } else {
    const movies = src.movies ?? []
    if (!movies.length) return
    const ms = (st.movie ??= freshState(movies.length))
    while ((last() < until) && guard++ < 5000) {
      const m = movies[pick(movies.length, ms, ch.movieOrder !== 'release')]
      ms.pos++
      add({ key: m.key, title: m.title, sub: m.year ? String(m.year) : undefined, th: m.th, ar: m.ar }, m.dur)
    }
  }
}

// ---------- The guide (module-level, so building carries on if you leave the screen) ----------
interface GuideState { slots: Record<string, Slot[]>; building: boolean; done: number; total: number; ready: boolean; error?: string }
let state: GuideState = { slots: {}, building: false, done: 0, total: 0, ready: false }
const subs = new Set<() => void>()
const set = (p: Partial<GuideState>) => { state = { ...state, ...p }; subs.forEach((f) => f()) }
export const useGuide = () => useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb) } }, () => state)

const storeKey = (scope: string) => `chezzflix_guide_${scope}`
function readStore(scope: string): Record<string, Stored> { try { return JSON.parse(localStorage.getItem(storeKey(scope)) ?? '{}') } catch { return {} } }
function writeStore(scope: string, all: Record<string, Stored>) { try { localStorage.setItem(storeKey(scope), JSON.stringify(all)) } catch { /* storage full: the guide just rebuilds next time */ } }

let running: Promise<void> | null = null
let runKey = ''
let jobId = 0

/**
 * Builds (or tops up) the schedule for every channel. Safe to call again: if a build is already running it just waits for it.
 * Channels appear in `useGuide().slots` as they finish.
 */
export function ensureGuide(server: PlexServer, sections: PlexSection[], scope: string, channels: Channel[], hours: number): Promise<void> {
  const key = scope + '|' + channels.map((c) => c.id + signature(c)).join('') + '|' + hours
  if (running && runKey === key) return running
  runKey = key
  const job = (async () => {
    const me = ++jobId, live = () => me === jobId   // a newer build (channels changed) supersedes this one
    const now = Date.now()
    const until = now + hours * HOUR
    const all = readStore(scope)
    // If every channel already has a saved schedule that's still running, show it straight away and top it up behind the scenes.
    const cached: Record<string, Slot[]> = {}
    const haveAll = channels.every((c) => { const p = all[c.id]; const s = p && p.sig === signature(c) ? p.slots.filter((x) => x.end > now) : []; if (s.length) cached[c.id] = s; return s.length > 0 })
    if (haveAll) set({ building: true, done: channels.length, total: channels.length, ready: true, error: undefined, slots: cached })
    else set({ building: true, done: 0, total: channels.length, ready: false, error: undefined, slots: {} })
    let done = 0
    const queue = [...channels]
    const worker = async () => {
      for (let ch = queue.shift(); ch; ch = queue.shift()) {
        try {
          const prev = all[ch.id]
          const same = prev && prev.sig === signature(ch)
          const stored: Stored = same ? { ...prev, slots: prev.slots.filter((s) => s.end > now) } : { sig: signature(ch), slots: [], st: { rot: 0, inBlock: 0, shows: {} } }
          if (!stored.slots.length) stored.st = { rot: Math.floor(Math.random() * 1000), inBlock: 0, shows: stored.st.shows ?? {} }   // everything aired: start fresh somewhere else
          const src = await sources(server, sections, ch)
          fill(ch, src, stored, now, until)
          all[ch.id] = stored
          if (live()) set({ slots: { ...state.slots, [ch.id]: stored.slots } })
        } catch (e) { console.warn('[guide]', ch.name, e); if (live()) set({ slots: { ...state.slots, [ch.id]: [] } }) }
        done++
        if (live() && !haveAll) set({ done })
      }
    }
    await Promise.all([worker(), worker(), worker()])
    for (const id of Object.keys(all)) if (!channels.some((c) => c.id === id)) delete all[id]   // forget deleted channels
    if (!live()) return
    writeStore(scope, all)
    set({ building: false, ready: true })
  })().finally(() => { if (runKey === key) running = null })
  running = job
  return job
}

/** Keeps the schedule from running dry while the guide or a channel is on screen: tops up any channel with under six hours left. */
export async function topUp(server: PlexServer, sections: PlexSection[], scope: string, channels: Channel[], hours: number) {
  if (state.building) return
  const now = Date.now()
  const low = channels.filter((c) => { const s = state.slots[c.id]; return s && s.length && s[s.length - 1].end < now + 6 * HOUR })
  if (!low.length) return
  const all = readStore(scope)
  for (const ch of low) {
    const stored = all[ch.id]
    if (!stored) continue
    try {
      const src = await sources(server, sections, ch)
      stored.slots = stored.slots.filter((s) => s.end > now - HOUR)
      fill(ch, src, stored, now, now + hours * HOUR)
      set({ slots: { ...state.slots, [ch.id]: stored.slots } })
    } catch { /* try again next time */ }
  }
  writeStore(scope, all)
}

export function slotAt(slots: Slot[] | undefined, t: number): Slot | undefined {
  return slots?.find((s) => s.start <= t && t < s.end)
}

// ---------- Suggested channels ----------
export const DEFAULT_GENRES = ['Action', 'Horror', 'Comedy', 'Thriller', 'Family']
export interface Suggestion { id: string; label: string; hint: string; draft: ChannelDraft }

/** One or two 24/7 channels for shows you've been watching, and up to five genre channels. */
export async function suggestChannels(server: PlexServer, sections: PlexSection[], pickedGenres: string[], getWatched: (key: string) => Promise<PlexMedia[]>): Promise<Suggestion[]> {
  const out: Suggestion[] = []
  const shows = sections.filter((s) => s.type === 'show' && !isOtherSection(s))
  const recent = (await Promise.all(shows.map((s) => getWatched(s.key).catch(() => [] as PlexMedia[])))).flat()
    .filter((m) => m.type === 'show').sort((a, b) => (b.lastViewedAt ?? 0) - (a.lastViewedAt ?? 0))
  const seen = new Set<string>()
  for (const m of recent) {
    if (seen.has(m.ratingKey) || seen.size >= 2) continue
    seen.add(m.ratingKey)
    out.push({ id: `show:${m.ratingKey}`, label: `${m.title} 24/7`, hint: 'A show you’ve been watching, on a loop',
      draft: { name: `${m.title} 24/7`, kind: 'shows', shows: [{ key: m.ratingKey, title: m.title, thumb: m.thumb, art: m.art }], perBlock: 1, episodeOrder: 'random' } })
  }
  const movies = sections.filter((s) => s.type === 'movie' && !isOtherSection(s))
  const have = new Map<string, string>()
  for (const g of (await Promise.all(movies.map((s) => getGenres(server, s.key).catch(() => [])))).flat()) have.set(lower(g.title), g.title)
  const chosen: string[] = []
  for (const g of [...pickedGenres, ...DEFAULT_GENRES]) {
    const real = have.get(lower(g)) ?? [...have.entries()].find(([k]) => k.startsWith(lower(g)))?.[1]
    if (real && !chosen.includes(real)) chosen.push(real)
    if (chosen.length >= 5) break
  }
  for (const g of chosen) out.push({ id: `genre:${g}`, label: g, hint: `Movies in ${g}`, draft: { name: g, kind: 'movies', genres: [g], movieOrder: 'random' } })
  return out
}

export { shuffled }
