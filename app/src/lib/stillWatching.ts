// "Are you still watching?": after 4 hours of actual playback (counted across episodes and channel flips, and again every 4 hours after), or after 30 minutes sitting paused,
// the stream closes (as if you pressed Back) and a prompt is shown on the screen you return to: Resume carries on from where it stopped.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { PlexMedia } from './plex'

export const WATCH_LIMIT_MS = 4 * 3600_000
export const PAUSE_LIMIT_MS = 30 * 60_000   // paused this long: ask too (Plex itself drops a stream paused for 35 minutes by default)
const IDLE_RESET_MS = 20 * 60_000   // nothing played for this long: start counting again
const TICK_MS = 5000

let played = 0
let lastActive = 0

const pauseLimit = () => { try { const v = import.meta.env.DEV ? Number(localStorage.getItem('chezzflix_pause_ms')) : 0; return v > 0 ? v : PAUSE_LIMIT_MS } catch { return PAUSE_LIMIT_MS } }
const limit = () => { try { const v = import.meta.env.DEV ? Number(localStorage.getItem('chezzflix_still_ms')) : 0; return v > 0 ? v : WATCH_LIMIT_MS } catch { return WATCH_LIMIT_MS } }

/** Call with whether video is playing right now (and whether it is sitting paused). `asking` turns true when it's time to ask; `confirm` is "yes, still here". */
export function useStillWatching(playing: boolean, paused = false): { asking: boolean; confirm: () => void } {
  const [asking, setAsking] = useState(false)
  // Sitting paused for half an hour asks as well.
  useEffect(() => {
    if (!paused || asking) return
    const t = setTimeout(() => setAsking(true), pauseLimit())
    return () => clearTimeout(t)
  }, [paused, asking])
  useEffect(() => {
    if (!playing || asking) return
    if (lastActive && Date.now() - lastActive > IDLE_RESET_MS) played = 0
    let last = Date.now()
    const t = setInterval(() => {
      const now = Date.now()
      played += now - last; last = now; lastActive = now
      if (played >= limit()) { played = 0; setAsking(true) }
    }, TICK_MS)
    return () => { clearInterval(t); const now = Date.now(); played += now - last; lastActive = now }
  }, [playing, asking])
  const confirm = useCallback(() => { played = 0; setAsking(false) }, [])
  return { asking, confirm }
}

// The prompt itself is shown by the app, on the screen the player closes back to (a video playing over the page can't be trusted to take
// the remote while it's still running, so the stream is closed first).
export interface StillAsk { item: PlexMedia; /** Wording for the card when the item alone doesn't say it (a guide program). */ title?: string; sub?: string; /** A guide channel to tune back to (instead of playing the item). */ channelId?: string }
let pending: StillAsk | undefined
const subs = new Set<() => void>()
export const askStill = (a: StillAsk) => { pending = a; subs.forEach((f) => f()) }
export const clearStill = () => { pending = undefined; subs.forEach((f) => f()) }
export const usePendingStill = () => useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb) } }, () => pending)
