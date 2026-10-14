// How many streams are playing on the server right now (only the server's owner can see them), for the Dashboard badge.
import { useEffect, useState } from 'react'
import { getSessions, type PlexServer } from './plex'

const EVERY_MS = 30_000

export function useStreamCount(server: PlexServer, enabled: boolean): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!enabled) { setN(0); return }
    let alive = true
    const poll = () => { if (!document.hidden) getSessions(server).then((s) => alive && setN(s.length)).catch(() => {}) }
    poll()
    const t = setInterval(poll, EVERY_MS)
    return () => { alive = false; clearInterval(t) }
  }, [server, enabled])
  return n
}
