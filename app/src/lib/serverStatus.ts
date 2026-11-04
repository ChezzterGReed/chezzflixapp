// Whether the Plex server can be reached right now. A couple of failed requests in a row flip it to "down" (the app then says so and keeps
// trying in the background); the first answer that comes back flips it back and the screens reload.
import { useEffect, useState } from 'react'

let down = false
let fails = 0
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

export function reportOk() { fails = 0; if (down) { down = false; emit() } }
export function reportFail() { if (++fails >= 2 && !down) { down = true; emit() } }
export const isServerDown = () => down

export function useServerDown(): boolean {
  const [v, setV] = useState(down)
  useEffect(() => { const f = () => setV(down); subs.add(f); f(); return () => { subs.delete(f) } }, [])
  return v
}
