// Bridge to the embedded libmpv player (desktop app). mpv draws behind the transparent webview.
import { inTauri } from './player'

export interface MpvTrack { id: number; type: 'audio' | 'sub' | 'video'; title?: string; lang?: string; codec?: string; channels?: string; selected: boolean; default: boolean; forced: boolean; external: boolean }
export type MpvProp = { name: string; value: number | boolean | null }

async function core() { return import('@tauri-apps/api/core') }

/** Starts the engine (once). Resolves false where it isn't available (browser, Windows/Android for now). */
export async function nativeStart(): Promise<boolean> {
  if (!inTauri) return false
  try { await (await core()).invoke('mpv_start'); return true } catch (e) { console.warn('[native player]', e); return false }
}
export async function mpvCmd(...args: (string | number)[]) { return (await core()).invoke('mpv_cmd', { args: args.map(String) }) }
export async function mpvSet(name: string, value: string | number | boolean) { return (await core()).invoke('mpv_set', { name, value: typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value) }) }
export async function mpvGet(name: string) { return (await core()).invoke<string | null>('mpv_get', { name }) }
export async function mpvTracks() { return (await core()).invoke<MpvTrack[]>('mpv_tracks') }

export async function onMpv(onProp: (p: MpvProp) => void, onEvent: (e: { event: string; reason?: number; error?: number; message?: string }) => void) {
  const { listen } = await import('@tauri-apps/api/event')
  const a = await listen<MpvProp>('mpv-prop', (e) => onProp(e.payload))
  const b = await listen<{ event: string; reason?: number; error?: number; message?: string }>('mpv-event', (e) => onEvent(e.payload))
  return () => { a(); b() }
}

/** While native video plays, the page must be see-through so the video behind it shows. */
export function setNativeVideoActive(on: boolean) {
  if (on) document.documentElement.dataset.nativeVideo = '1'
  else delete document.documentElement.dataset.nativeVideo
}
