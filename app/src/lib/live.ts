// Live TV: a playlist (M3U) the person adds in Settings, kept on the device, plus an optional guide (XMLTV) for what's on now and next.
import { useSyncExternalStore } from 'react'
import { inTauri } from './player'
import { parseM3U, type LiveChannel, type LivePlaylist } from './liveParse'
export type { LiveChannel } from './liveParse'

const CACHE_KEY = 'chezzflix_live_playlist_v1'
const PLAYLIST_FRESH_MS = 12 * 3600_000
const EPG_FRESH_MS = 30 * 60_000
const EPG_AHEAD_MS = 14 * 3600_000

export interface EpgProgram { s: number; e: number; t: string; d: string }
interface State { url: string; channels: LiveChannel[]; epgUrl?: string; status: 'idle' | 'loading' | 'ready' | 'error'; error?: string; at: number; epg: Map<string, EpgProgram[]>; epgAt: number; epgStatus: 'idle' | 'loading' | 'ready' | 'none' | 'error' }
let state: State = { url: '', channels: [], status: 'idle', at: 0, epg: new Map(), epgAt: 0, epgStatus: 'idle' }
const subs = new Set<() => void>()
const set = (p: Partial<State>) => { state = { ...state, ...p }; subs.forEach((f) => f()) }
export const getLive = () => state
export const useLive = () => useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb) } }, () => state)

async function fetchText(url: string): Promise<string> {
  if (inTauri) return (await import('@tauri-apps/api/core')).invoke<string>('live_fetch', { url })
  const r = await fetch(url)   // (a plain browser: only works for hosts that allow it)
  if (!r.ok) throw new Error(`The server answered ${r.status}.`)
  return r.text()
}

function readCache(url: string): { pl: LivePlaylist; at: number } | undefined {
  try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as { url: string; at: number; pl: LivePlaylist } | null; if (c && c.url === url && c.pl?.channels?.length) return { pl: c.pl, at: c.at } } catch { /* none */ }
}
function writeCache(url: string, pl: LivePlaylist, at: number) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ url, at, pl })) } catch { /* too big or private mode: it is just fetched again next time */ } }

let loading: Promise<void> | null = null
/** Reads the playlist for this address: what's saved shows at once, and it is fetched again when it's old (or when `force`). */
export async function loadLive(url: string, force = false): Promise<void> {
  url = url.trim()
  if (!url) { set({ url: '', channels: [], status: 'idle', error: undefined, epg: new Map(), epgStatus: 'idle', epgAt: 0 }); return }
  if (state.url !== url) set({ url, channels: [], epgUrl: undefined, status: 'loading', error: undefined, epg: new Map(), epgStatus: 'idle', epgAt: 0 })
  const cached = readCache(url)
  if (cached && !state.channels.length) set({ channels: cached.pl.channels, epgUrl: cached.pl.epgUrl, status: 'ready', at: cached.at })
  if (!force && state.status === 'ready' && Date.now() - state.at < PLAYLIST_FRESH_MS) return
  if (loading) return loading
  if (!state.channels.length) set({ status: 'loading', error: undefined })
  loading = (async () => {
    try {
      const pl = parseM3U(await fetchText(url))
      if (!pl.channels.length) throw new Error('No channels were found in that playlist.')
      const at = Date.now()
      writeCache(url, pl, at)
      set({ channels: pl.channels, epgUrl: pl.epgUrl, status: 'ready', error: undefined, at })
    } catch (e) {
      const msg = typeof e === 'string' ? e : (e as Error).message
      // A copy that was already there keeps working; only with nothing to show is it an error.
      if (state.channels.length) console.warn('[live] refresh failed', msg); else set({ status: 'error', error: msg })
    } finally { loading = null }
  })()
  return loading
}

let epgLoading: Promise<void> | null = null
/** What's on now and next, from the guide(s): the addresses given in Settings, else the ones the playlist names (it may name several). Only channels with a guide id are asked for. */
export async function loadEpg(override: string, force = false): Promise<void> {
  const urls = [...new Set((override.trim() || state.epgUrl || '').split(/[\s,]+/).filter((u) => /^https?:\/\//i.test(u)))]
  if (!urls.length || !inTauri) { set({ epgStatus: 'none' }); return }   // (the guide files are large and gzipped: the app reads them itself)
  if (!force && state.epgStatus === 'ready' && Date.now() - state.epgAt < EPG_FRESH_MS) return
  if (epgLoading) return epgLoading
  const ids = [...new Set(state.channels.flatMap((c) => [c.epg, c.epgAlt]).filter((x): x is string => !!x))]
  if (!ids.length) { set({ epgStatus: 'none' }); return }
  if (!state.epg.size) set({ epgStatus: 'loading' })
  epgLoading = (async () => {
    try {
      const now = Date.now()
      const { invoke } = await import('@tauri-apps/api/core')
      const got = await Promise.allSettled(urls.map((url) => invoke<Record<string, EpgProgram[]>>('live_epg', { url, ids, from: now - 3600_000, to: now + EPG_AHEAD_MS })))
      const useful = (p: EpgProgram) => !/^(no (program )?information|no info available|to be announced|tba)$/i.test(p.t.trim())   // (placeholders say nothing: the channel's group shows instead)
      const merged = new Map<string, EpgProgram[]>()
      for (const g of got) if (g.status === 'fulfilled') for (const [k, v] of Object.entries(g.value)) { const l = v.filter(useful); if (l.length > (merged.get(k)?.length ?? 0)) merged.set(k, l) }
      const failed = got.every((g) => g.status === 'rejected')
      if (failed) console.warn('[live] guides failed', got)
      set({ epg: failed && state.epg.size ? state.epg : merged, epgStatus: failed ? (state.epg.size ? 'ready' : 'error') : 'ready', epgAt: Date.now() })
    } catch (e) { console.warn('[live] guide failed', e); set({ epgStatus: state.epg.size ? 'ready' : 'error' }) } finally { epgLoading = null }
  })()
  return epgLoading
}

/** What's on now and what's next for a channel (from the guide, when there is one). */
export function nowNext(c: LiveChannel | undefined, at = Date.now()): { now?: EpgProgram; next?: EpgProgram } {
  let upcoming: { next?: EpgProgram } = {}
  for (const k of [c?.epg, c?.epgAlt]) {
    const list = k ? state.epg.get(k) : undefined
    if (!list?.length) continue
    const i = list.findIndex((p) => p.s <= at && p.e > at)
    if (i >= 0) return { now: list[i], next: list[i + 1] }
    if (!upcoming.next) upcoming = { next: list.find((p) => p.s > at) }
  }
  return upcoming
}

/** The groups in a playlist, biggest first. */
export function groupsOf(channels: LiveChannel[]): { name: string; count: number }[] {
  const m = new Map<string, number>()
  for (const c of channels) for (const g of c.groups) m.set(g, (m.get(g) ?? 0) + 1)
  return [...m].map(([name, count]) => ({ name, count })).sort((a, b) => Number(a.name === 'Other') - Number(b.name === 'Other') || b.count - a.count || a.name.localeCompare(b.name))
}

export const LAST_KEY = 'chezzflix_live_last'
export const lastWatched = () => { try { return localStorage.getItem(LAST_KEY) ?? '' } catch { return '' } }
export const setLastWatched = (id: string) => { try { localStorage.setItem(LAST_KEY, id) } catch { /* ignore */ } }
