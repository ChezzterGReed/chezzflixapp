// One random seed per app launch: recommendations and the banner's later slides reshuffle every time the app starts,
// but stay steady while it's open (switching tabs doesn't reshuffle everything under you).
export const SESSION_SEED = Math.floor(Math.random() * 2 ** 31)

function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

/** A repeatable shuffle for this launch; `salt` gives each list its own order. */
export function shuffled<T>(list: T[], salt = 0): T[] {
  const r = mulberry32(SESSION_SEED + salt * 7919), a = [...list]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}
/** 0..1, stable for a key during this launch. */
export function jitter(key: string): number {
  let h = SESSION_SEED
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 2654435761)
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296
}
