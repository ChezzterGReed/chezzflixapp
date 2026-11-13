// Bridge to the embedded video engine. The page speaks one small vocabulary (the mpv one), and this file translates it:
//   macOS    -> embedded libmpv (Rust, drawn behind the transparent web view)
//   Android  -> Media3 ExoPlayer (Kotlin plugin, drawn behind the transparent web view)
// Everything else (browser, Windows for now) has no native engine and the caller falls back to the web player.
import { inTauri } from './player'

export interface MpvTrack { id: number; type: 'audio' | 'sub' | 'video'; title?: string; lang?: string; codec?: string; channels?: string; selected: boolean; default: boolean; forced: boolean; external: boolean }
export type MpvProp = { name: string; value: number | boolean | null }
type MpvEvent = { event: string; reason?: number; error?: number; message?: string }

export const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)

// The Android shell passes the remote's fast-forward / rewind buttons in through here (the web view doesn't turn them into key events itself).
if (isAndroid && typeof window !== 'undefined') {
  (window as unknown as { __chezzMediaKey?: (key: 'ff' | 'rw', down: boolean, repeat: boolean) => void }).__chezzMediaKey = (key, down, repeat) => {
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: key === 'ff' ? 'MediaFastForward' : 'MediaRewind', repeat, bubbles: true, cancelable: true }))
  }
}

async function core() { return import('@tauri-apps/api/core') }
async function droid<T = unknown>(command: string, args?: object): Promise<T> { return (await core()).invoke<T>('plugin:player|call', { command, args }) }

// ---- Android state the translation needs ----
let paused = true
let externalSubs: { url: string; lang?: string; name?: string }[] = []
/** What the Android media session shows for the NEXT file loaded (title, subtitle, artwork). */
let mediaInfo: { title: string; subtitle?: string; artwork?: string } | undefined
export function setMediaInfo(i: { title: string; subtitle?: string; artwork?: string }) { mediaInfo = i }
/** Sidecar subtitle files for the NEXT file loaded (Android needs them at load time; mpv adds them afterwards). */
export function setExternalSubs(subs: { url: string; lang?: string; name?: string }[]) { externalSubs = subs }

// ---- Naming tracks: the language first ----
const LANG3: Record<string, string> = { eng: 'en', spa: 'es', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', ita: 'it', por: 'pt', jpn: 'ja', kor: 'ko', chi: 'zh', zho: 'zh', rus: 'ru', ara: 'ar', hin: 'hi', dut: 'nl', nld: 'nl', swe: 'sv', nor: 'no', dan: 'da', fin: 'fi', pol: 'pl', tur: 'tr', heb: 'he', tha: 'th', vie: 'vi', ind: 'id', ukr: 'uk', cze: 'cs', ces: 'cs', gre: 'el', ell: 'el', hun: 'hu', rum: 'ro', ron: 'ro', cat: 'ca', per: 'fa', fas: 'fa', ice: 'is', isl: 'is', may: 'ms', msa: 'ms' }
/** "English" from "eng" / "en" / "en-US" (undefined for "und" and nothing). */
export function languageName(code?: string): string | undefined {
  const c = (code ?? '').toLowerCase().split(/[-_]/)[0]
  if (!c || c === 'und' || c === 'unk') return undefined
  const two = c.length === 2 ? c : LANG3[c]
  if (two) { try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(two) ?? undefined } catch { /* fall through */ } }
  return c.length >= 3 ? c.toUpperCase() : undefined
}
/** An audio or subtitle track's name for a menu, starting with the language ("Spanish · Commentary · AC3 · 5.1ch · external"). `title` replaces the track's own title (when the caller has cleaned it). */
export function trackName(t: MpvTrack, title: string | undefined = t.title): string {
  const lang = languageName(t.lang)
  const name = (title ?? '').trim()
  const parts: string[] = []
  if (lang) parts.push(name && !/^(und|unknown|track \d+)$/i.test(name) && !name.toLowerCase().includes(lang.toLowerCase()) ? `${lang} · ${name}` : name && name.toLowerCase().includes(lang.toLowerCase()) ? name : lang)
  else if (name) parts.push(name)
  if (t.codec) parts.push(t.codec.toUpperCase())
  if (t.channels) parts.push(`${t.channels}ch`)
  if (t.external) parts.push('external')
  return parts.join(' · ') || 'Track'
}

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
      return droid('loadMedia', { url: a[1], startMs, pause: opts.pause !== 'no', subs, title: mediaInfo?.title, subtitle: mediaInfo?.subtitle, artwork: mediaInfo?.artwork })
    }
    case 'seek': return droid('seek', { value: parseFloat(a[1]) })
    case 'cycle': if (a[1] === 'pause') return droid('setPause', { value: !paused }); return
    case 'stop': return droid('stop')
    case 'af-command': { const m = /(-?[\d.]+)dB/.exec(a[3] ?? ''); if (m) return droid('setGain', { value: parseFloat(m[1]) }); return }   // auto leveling's gain changes
    default: return   // sub-add, ...: not needed by this engine
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
    case 'speed': return droid('setSpeed', { value: Number(value) })
    case 'gain-db': return droid('setGain', { value: Number(value) })
    case 'af': { const m = /volume=(-?[\d.]+)dB/.exec(String(value)); return droid('setGain', { value: m ? parseFloat(m[1]) : 0 }) }   // the engine's filter list: only its volume part applies here
    default: return   // video-zoom, brightness...
  }
}

let wakeLock: { release: () => Promise<void> } | null = null
/** Stops the screen dimming / sleeping while something plays (and lets it again afterwards). */
export async function keepAwake(on: boolean) {
  try {
    if (isAndroid) await droid('setKeepAwake', { value: on })
    else if ('__TAURI_INTERNALS__' in window) await (await core()).invoke('keep_awake', { on })
    else if (on) wakeLock = await (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null
    else { await wakeLock?.release(); wakeLock = null }
  } catch { /* best effort */ }
}

export interface SubStyle { subSize: string; subFont: string; subColor: string; subEdge: string; subBackground: boolean; subLift?: number }
export const SUB_SIZES = { small: 0.75, medium: 1, large: 1.3, huge: 1.7 } as const
/** Applies the subtitle look to the player (plain-text subtitles; styled .ass ones keep their own). */
export async function applySubStyle(s: SubStyle) {
  const size = SUB_SIZES[s.subSize as keyof typeof SUB_SIZES] ?? 1
  if (isAndroid) return droid('setSubStyle', { size, font: s.subFont, color: s.subColor, edge: s.subEdge, background: s.subBackground, lift: s.subLift ?? 0 })
  const set = (n: string, v: string | number) => mpvSet(n, v).catch(() => {})
  await Promise.all([
    set('sub-font-size', Math.round(55 * size)),
    set('sub-pos', 100 - (s.subLift ?? 0)),   // 100 is the bottom edge; smaller moves the text up
    set('sub-font', s.subFont === 'serif' ? 'Georgia' : s.subFont === 'mono' ? 'Menlo' : 'Helvetica Neue'),
    set('sub-color', s.subColor === 'yellow' ? '#FFE600' : '#FFFFFF'),
    set('sub-border-style', s.subBackground ? 'background-box' : 'outline-and-shadow'),
    set('sub-back-color', '#BF000000'),
    set('sub-border-color', '#000000'),
    set('sub-border-size', s.subEdge === 'outline' ? 3 : 0),
    set('sub-shadow-offset', s.subEdge === 'shadow' ? 3 : 0),
    set('sub-shadow-color', '#99000000'),
  ])
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

/** Closes the app (Android: all of its screens; desktop: the window). */
export async function exitApp(): Promise<void> {
  try {
    if (isAndroid) { await droid('exitApp'); return }
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().close()
  } catch { window.close() }
}

/**
 * Android only: asks for the same program again with a second player that loads out of sight and then takes over (see PlayerPlugin.prepareSwap).
 * Resolves true once it has swapped, false when it couldn't (the caller then reloads the usual way).
 */
export async function nativeSwap(url: string, startMs: number, subs?: { url: string; lang?: string; name?: string }[]): Promise<boolean> {
  if (!isAndroid) return false
  try { await droid('prepareSwap', { url, startMs, pause: false, subs, title: mediaInfo?.title, subtitle: mediaInfo?.subtitle, artwork: mediaInfo?.artwork }); return true } catch (e) { console.warn('[native swap]', e); return false }
}
