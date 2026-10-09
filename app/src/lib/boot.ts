import { useSyncExternalStore } from 'react'

// "Booted" = the library has loaded enough to show Home. Until then the animated loading screen covers everything.
let booted = false
const subs = new Set<() => void>()
const subscribe = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb) } }

export function setBooted(v: boolean) { if (v !== booted) { booted = v; subs.forEach((f) => f()) } }
export function useBooted() { return useSyncExternalStore(subscribe, () => booted) }
