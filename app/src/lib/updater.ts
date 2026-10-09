// Self-updating (desktop app). Checks the update feed, downloads a signed update and restarts into it.
// In a plain browser there is nothing to update; add `?update` to the URL to preview the prompt with a fake update.
import { useSyncExternalStore } from 'react'
import { inTauri } from './player'

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
  if (fake) { set({ status: 'checking' }); await new Promise((r) => setTimeout(r, 700)); return set({ status: 'available', version: '0.2.0', notes: 'Preview and Recap on every title, plus a smoother home screen.' }) }
  if (!inTauri) return
  set({ status: 'checking', error: undefined })
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
