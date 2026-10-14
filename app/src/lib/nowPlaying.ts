// "Now Playing" and media keys. What is playing is shown in the system's own controls, and the media keys, headphone buttons and
// lock-screen controls reach the player:
//   Mac      -> the system Now Playing / media-key center (Rust)
//   Android  -> a media session wrapped around the player (Kotlin), which handles play / pause / seek itself
//   browser  -> the Media Session API
import { inTauri } from './player'
import { isAndroid, setMediaInfo } from './native'

export interface MediaKey { key: 'play' | 'pause' | 'toggle' | 'next' | 'previous' | 'stop' | 'seekBy' | 'seekTo'; secs?: number }
export interface NowPlaying { title: string; subtitle?: string; artwork?: string; duration?: number }

const mac = inTauri && !isAndroid
const web = !mac && typeof navigator !== 'undefined' && 'mediaSession' in navigator
const invoke = async (cmd: string, args?: Record<string, unknown>) => (await import('@tauri-apps/api/core')).invoke(cmd, args)

/** Starts listening for the media keys. Returns a function that stops (and clears what is shown). */
export async function startNowPlaying(onKey: (k: MediaKey) => void): Promise<() => void> {
  const offs: (() => void)[] = []
  if (mac) {
    try {
      await invoke('media_init')
      const { listen } = await import('@tauri-apps/api/event')
      offs.push(await listen<MediaKey>('media-key', (e) => onKey(e.payload)))
    } catch (e) { console.warn('[now playing]', e) }
  }
  if (web) {
    const ms = navigator.mediaSession
    const on = (a: MediaSessionAction, h: MediaSessionActionHandler) => { try { ms.setActionHandler(a, h); offs.push(() => { try { ms.setActionHandler(a, null) } catch { /* ignore */ } }) } catch { /* not supported here */ } }
    on('play', () => onKey({ key: 'play' })); on('pause', () => onKey({ key: 'pause' })); on('stop', () => onKey({ key: 'stop' }))
    on('nexttrack', () => onKey({ key: 'next' })); on('previoustrack', () => onKey({ key: 'previous' }))
    on('seekbackward', (d) => onKey({ key: 'seekBy', secs: -(d.seekOffset ?? 10) })); on('seekforward', (d) => onKey({ key: 'seekBy', secs: d.seekOffset ?? 10 }))
    on('seekto', (d) => onKey({ key: 'seekTo', secs: d.seekTime ?? 0 }))
  }
  return () => { offs.forEach((f) => f()); setPlayback('stopped'); if (web) navigator.mediaSession.metadata = null }
}

/** What is playing (call before the file loads on Android: the player reads it when it starts). */
export function setNowPlaying(info: NowPlaying) {
  setMediaInfo(info)
  if (mac) invoke('media_meta', { title: info.title, subtitle: info.subtitle ?? null, cover: info.artwork ?? null, durationSecs: info.duration ?? null }).catch(() => {})
  if (web) { try { navigator.mediaSession.metadata = new MediaMetadata({ title: info.title, artist: info.subtitle ?? '', artwork: info.artwork ? [{ src: info.artwork, sizes: '512x512' }] : [] }) } catch { /* ignore */ } }
}

export function setPlayback(status: 'playing' | 'paused' | 'stopped', position?: number, duration?: number) {
  if (mac) invoke('media_playback', { status, positionSecs: position ?? null }).catch(() => {})
  if (web) {
    const ms = navigator.mediaSession
    ms.playbackState = status === 'stopped' ? 'none' : status
    try { if (status !== 'stopped' && duration && isFinite(duration) && position !== undefined) ms.setPositionState({ duration, position: Math.min(position, duration), playbackRate: 1 }) } catch { /* ignore */ }
  }
}
