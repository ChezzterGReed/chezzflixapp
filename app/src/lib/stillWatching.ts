// "Are you still watching?": after 4 hours of actual playback (counted across episodes and channel flips, and again every 4 hours after),
// a prompt appears for 15 seconds. Dismiss it to carry on; ignore it and the stream stops and you're taken home.
import { useCallback, useEffect, useState } from 'react'

export const WATCH_LIMIT_MS = 4 * 3600_000
export const ASK_SECONDS = 15
const IDLE_RESET_MS = 20 * 60_000   // nothing played for this long: start counting again
const TICK_MS = 5000

let played = 0
let lastActive = 0

const limit = () => { try { const v = import.meta.env.DEV ? Number(localStorage.getItem('chezzflix_still_ms')) : 0; return v > 0 ? v : WATCH_LIMIT_MS } catch { return WATCH_LIMIT_MS } }

/** Call with whether video is playing right now. `asking` turns true when it's time to ask; `confirm` is "yes, still here". */
export function useStillWatching(playing: boolean): { asking: boolean; confirm: () => void } {
  const [asking, setAsking] = useState(false)
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
