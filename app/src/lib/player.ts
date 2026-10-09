import { reportProgress, type PlexMedia, type PlexServer } from './plex'

export const inTauri = '__TAURI_INTERNALS__' in window

/** Hands a direct-play URL to the native player and mirrors progress back to Plex. Returns false if there is no native player. */
export async function startPlayback(server: PlexServer, media: PlexMedia, url: string): Promise<boolean> {
  if (!inTauri) return false
  const { invoke } = await import('@tauri-apps/api/core')
  const { listen } = await import('@tauri-apps/api/event')

  const un1 = await listen<{ timeMs: number; paused: boolean }>('player-progress', (e) =>
    reportProgress(server, media, e.payload.paused ? 'paused' : 'playing', e.payload.timeMs))
  const un2 = await listen<{ timeMs: number }>('player-ended', (e) => {
    reportProgress(server, media, 'stopped', e.payload.timeMs)
    un1(); un2()
  })
  await invoke('play', { url, startSeconds: (media.viewOffset ?? 0) / 1000, title: media.title })
  return true
}
