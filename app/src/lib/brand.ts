import { useSyncExternalStore } from 'react'

// The app's name as the signed-in profile has set it (CHEZZFLIX, TYLERFLIX...). Kept so the loading screen can show it before the profile's settings
// have loaded, and so it can swap to the new profile's name while loading.
const KEY = 'chezzflix_last_brand'
const read = () => { try { return localStorage.getItem(KEY) || 'CHEZZFLIX' } catch { return 'CHEZZFLIX' } }
let current = read()
const subs = new Set<() => void>()

export function setLastBrand(v: string) {
  try { localStorage.setItem(KEY, v) } catch { /* ignore */ }
  if (v !== current) { current = v; subs.forEach((f) => f()) }
}
export const useLastBrand = () => useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb) } }, () => current)
