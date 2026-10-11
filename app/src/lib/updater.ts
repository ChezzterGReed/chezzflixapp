// Self-updating (desktop app). Checks the update feed, downloads a signed update and restarts into it.
// In a plain browser there is nothing to update; add `?update` to the URL to preview the prompt with a fake update.
import { useSyncExternalStore } from 'react'
import { inTauri } from './player'
import { isAndroid } from './native'

// Android reads the same feed as the Mac app (its `android` entry), because it installs by hand rather than through Tauri's updater.
const FEED_URL: string = import.meta.env.VITE_FEED_URL || 'https://github.com/ChezzterGReed/chezzflixapp/releases/latest/download/latest.json'
interface AndroidRelease { version: string; url: string; sha256?: string; size?: number }
const newer = (a: string, b: string) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) } return false }
async function droidUpdate<T>(command: string, args?: object): Promise<T> { return (await import('@tauri-apps/api/core')).invoke<T>('plugin:appupdate|call', { command, args }) }
let androidPending: AndroidRelease | undefined

export type UpdateStatus = 'idle' | 'checking' | 'uptodate' | 'available' | 'downloading' | 'installing' | 'error'
interface State { status: UpdateStatus; current: string; version?: string; notes?: string; progress: number; error?: string }

const fake = !inTauri && new URLSearchParams(location.search).has('update')
let state: State = { status: 'idle', current: fake ? '0.1.0' : '', progress: 0 }
const listeners = new Set<() => void>()
const set = (p: Partial<State>) => { state = { ...state, ...p }; listeners.forEach((l) => l()) }
export const useUpdater = () => useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => state)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pending: any

export async function checkForUpdate(): Promise<void> {
  if (state.status === 'checking' || state.status === 'downloading' || state.status === 'installing') return
  if (fake) { set({ status: 'checking' }); await new Promise((r) => setTimeout(r, 700)); return set({ status: 'available', version: '0.2.0', notes: 'Previews and Recaps\n\n- Preview and Recap on every title\n- A smoother home screen' }) }
  if (!inTauri) return
  set({ status: 'checking', error: undefined })
  if (isAndroid) {
    try {
      const { getVersion } = await import('@tauri-apps/api/app')
      const current = await getVersion()
      set({ current })
      const r = await droidUpdate<{ status: number; body: string }>('fetchText', { url: `${FEED_URL}${FEED_URL.includes('?') ? '&' : '?'}t=${Date.now()}` })
      if (r.status !== 200) throw new Error(`The update server answered ${r.status}`)
      const feed = JSON.parse(r.body) as { notes?: string; android?: AndroidRelease }
      if (!feed.android || !newer(feed.android.version, current)) return set({ status: 'uptodate' })
      androidPending = feed.android
      return set({ status: 'available', version: feed.android.version, notes: feed.notes || undefined })
    } catch (e) { return set({ status: 'error', error: String(e) }) }
  }
  try {
    const { getVersion } = await import('@tauri-apps/api/app')
    set({ current: await getVersion() })
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check()
    if (!update) return set({ status: 'uptodate' })
    pending = update
    set({ status: 'available', version: update.version, notes: update.body ?? undefined })
  } catch (e) { set({ status: 'error', error: String(e) }) }
}

export async function installUpdate(): Promise<void> {
  if (fake) {
    set({ status: 'downloading', progress: 0 })
    for (let i = 1; i <= 20; i++) { await new Promise((r) => setTimeout(r, 120)); set({ progress: i / 20 }) }
    return set({ status: 'installing' })
  }
  if (isAndroid) {
    if (!androidPending) return
    try {
      set({ status: 'downloading', progress: 0 })
      const { addPluginListener } = await import('@tauri-apps/api/core')
      const sub = await addPluginListener<{ received: number; total: number }>('appupdate', 'progress', (p) => { if (p.total > 0) set({ progress: Math.min(1, p.received / p.total) }) })
      try { await droidUpdate('download', { url: androidPending.url, sha256: androidPending.sha256 }) } finally { sub.unregister() }
      set({ status: 'installing', progress: 1 })
      const r = await droidUpdate<{ needsPermission: boolean }>('install')
      // Android asks once for permission to install from this app; after allowing it, press Update again.
      set({ status: 'available', progress: 0, error: undefined, notes: r.needsPermission
        ? 'Android needs your OK first: allow installs from Chezzflix on the screen that opened (Settings → Apps → Special access → Install unknown apps), then choose Update again.'
        : 'The Android installer is open. Confirm there to finish updating (choose Update again if you cancelled).' })
    } catch (e) { set({ status: 'error', error: String(e) }) }
    return
  }
  if (!pending) return
  try {
    set({ status: 'downloading', progress: 0 })
    let total = 0, got = 0
    await pending.downloadAndInstall((e: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => {
      if (e.event === 'Started') total = e.data?.contentLength ?? 0
      else if (e.event === 'Progress') { got += e.data?.chunkLength ?? 0; if (total) set({ progress: Math.min(1, got / total) }) }
      else if (e.event === 'Finished') set({ status: 'installing', progress: 1 })
    })
    const { relaunch } = await import('@tauri-apps/plugin-process')
    await relaunch()
  } catch (e) { set({ status: 'error', error: String(e) }) }
}

/** A release's notes are written as a short name, a blank line, then the details. (Older notes are just details.) */
export function splitNotes(notes?: string): { name: string; details: string } {
  const t = (notes ?? '').trim()
  const i = t.indexOf('\n')
  if (i < 0) return { name: '', details: t }
  return { name: t.slice(0, i).trim(), details: t.slice(i).trim() }
}

export interface ReleaseInfo { version: string; name: string; details: string; date?: string }

/** The latest releases from GitHub (newest first), for "what's new". */
export async function fetchReleases(count = 6): Promise<ReleaseInfo[]> {
  const r = await fetch(`https://api.github.com/repos/ChezzterGReed/chezzflixapp/releases?per_page=${count}`, { headers: { Accept: 'application/vnd.github+json' } })
  if (!r.ok) throw new Error(`GitHub ${r.status}`)
  const list = (await r.json()) as { tag_name: string; name?: string; body?: string; published_at?: string; draft?: boolean }[]
  return list.filter((x) => !x.draft).map((x) => {
    const { name, details } = splitNotes(x.body)
    return { version: x.tag_name.replace(/^v/, ''), name, details, date: x.published_at }
  })
}
