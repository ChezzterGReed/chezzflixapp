// "Shuffle": a random order of movies (a library, with its filters) or of one show's episodes, played one after another.
// While a shuffle is going, the player's Next / Previous follow it instead of the show's own order.
import type { PlexMedia } from './plex'

let queue: PlexMedia[] = []

/** Sets up a new random order and returns the first title to play. */
export function startQueue(items: PlexMedia[]): PlexMedia | undefined {
  const a = items.filter((m) => m.type === 'movie' || m.type === 'episode')
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  queue = a
  return a[0]
}
export const clearQueue = () => { queue = [] }
export const inQueue = (m: PlexMedia) => queue.some((x) => x.ratingKey === m.ratingKey)
/** The titles either side of `m` in the shuffle, or null when `m` isn't part of one. */
export function queueNeighbors(m: PlexMedia): { prev: PlexMedia | null; next: PlexMedia | null; at: number; total: number } | null {
  const i = queue.findIndex((x) => x.ratingKey === m.ratingKey)
  return i < 0 ? null : { prev: queue[i - 1] ?? null, next: queue[i + 1] ?? null, at: i + 1, total: queue.length }
}
