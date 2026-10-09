// Bridge to the embedded video engine. The page speaks one small vocabulary (the mpv one), and this file translates it:
//   macOS    -> embedded libmpv (Rust, drawn behind the transparent web view)
//   Android  -> Media3 ExoPlayer (Kotlin plugin, drawn behind the transparent web view)
// Everything else (browser, Windows for now) has no native engine and the caller falls back to the web player.
import { inTauri } from './player'

export interface MpvTrack { id: number; type: 'audio' | 'sub' | 'video'; title?: string; lang?: string; codec?: string; channels?: string; selected: boolean; default: boolean; forced: boolean; external: boolean }
export type MpvProp = { name: string; value: number | boolean | null }
type MpvEvent = { event: string; reason?: number; error?: number; message?: string }

export const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)

async function core() { return import('@tauri-apps/api/core') }
async function droid<T = unknown>(command: string, args?: object): Promise<T> { return (await core()).invoke<T>('plugin:player|call', { command, args }) }

// ---- Android state the translation needs ----
let paused = true
let externalSubs: { url: string; lang?: string; name?: string }[] = []
/** Sidecar subtitle files for the NEXT file loaded (Android needs them at load time; mpv adds them afterwards). */
export function setExternalSubs(subs: { url: string; lang?: string; name?: string }[]) { externalSubs = subs }

const yes = (v: string | number | boolean) => v === true || v === 'yes' || v === 'true' || v === 1

/** Starts the engine (once). Resolves false where it isn't available (browser, Windows for now). */
export async function nativeStart(): Promise<boolean> {
  if (!inTauri) return false
  try {
    if (isAndroid) { await droid('getProp', { name: 'time-pos' }); return true }
    await (await core()).invoke('mpv_start'); return true
  } catch (e) { console.warn('[native player]', e); return false }
}

export async function mpvCmd(...args: (string | number)[]) {
  const a = args.map(String)
  if (!isAndroid) return (await core()).invoke('mpv_cmd', { args: a })
  switch (a[0]) {
    case 'loadfile': {
      const opts = Object.fromEntries((a[4] ?? '').split(',').filter(Boolean).map((kv) => kv.split('=') as [string, string]))
      const startMs = Math.round((parseFloat(opts.start ?? '0') || 0) * 1000)
      const subs = externalSubs; externalSubs = []
      return droid('loadMedia', { url: a[1], startMs, pause: opts.pause !== 'no', subs })
    }
    case 'seek': return droid('seek', { value: parseFloat(a[1]) })
    case 'cycle': if (a[1] === 'pause') return droid('setPause', { value: !paused }); return
    case 'stop': return droid('stop')
    default: return   // sub-add, af-command, ...: not needed by this engine
  }
}

export async function mpvSet(name: string, value: string | number | boolean) {
  if (!isAndroid) return (await core()).invoke('mpv_set', { name, value: typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value) })
  switch (name) {
    case 'pause': return droid('setPause', { value: yes(value) })
    case 'volume': return droid('setVolume', { value: Number(value) / 100 })
    case 'mute': return droid('setMute', { value: yes(value) })
    case 'aid': return droid('selectAudio', { value: Number(value) })
    case 'sid': return droid('selectSubtitle', { value: value === 'no' ? 0 : Number(value) })
    case 'gain-db': return droid('setGain', { value: Number(value) })
    default: return   // af, video-zoom, brightness...
  }
}

export async function mpvGet(name: string): Promise<string | null> {
  if (!isAndroid) return (await core()).invoke<string | null>('mpv_get', { name })
  const r = await droid<{ value: string | number | null }>('getProp', { name })
  return r.value == null ? null : String(r.value)
}

export async function mpvTracks() {
  if (!isAndroid) return (await core()).invoke<MpvTrack[]>('mpv_tracks')
  return (await droid<{ tracks: MpvTrack[] }>('tracks')).tracks
}

export async function onMpv(onProp: (p: MpvProp) => void, onEvent: (e: MpvEvent) => void) {
  if (isAndroid) {
    const { addPluginListener } = await core()
    const a = await addPluginListener<MpvProp>('player', 'prop', (p) => { if (p.name === 'pause') paused = !!p.value; onProp(p) })
    const b = await addPluginListener<MpvEvent>('player', 'event', onEvent)
    return () => { a.unregister(); b.unregister() }
  }
  const { listen } = await import('@tauri-apps/api/event')
  const a = await listen<MpvProp>('mpv-prop', (e) => onProp(e.payload))
  const b = await listen<MpvEvent>('mpv-event', (e) => onEvent(e.payload))
  return () => { a(); b() }
}

/** While native video plays, the page must be see-through so the video behind it shows. */
export function setNativeVideoActive(on: boolean) {
  if (on) document.documentElement.dataset.nativeVideo = '1'
  else delete document.documentElement.dataset.nativeVideo
}
