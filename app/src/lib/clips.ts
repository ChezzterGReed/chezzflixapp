// Short clips for "Preview" (a taste of a movie or a show) and "Recap" (a few seconds from across an episode).
import { getChildren, getMetadata, type PlexMedia, type PlexServer } from './plex'

/** A stretch of the file to play: `start` and `len` in seconds. */
export interface Segment { start: number; len: number }

export const PREVIEW_LEN = 10
export const RECAP_PARTS = 8
export const RECAP_LEN = 3.5

const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo)
const durationOf = (m: PlexMedia) => (m.duration ?? 0) / 1000

/** Movies jump 3-8 minutes in; the first episode of a show 2-5 minutes in. Plays for ten seconds. */
export function previewSegments(m: PlexMedia): Segment[] {
  const dur = durationOf(m)
  let start = m.type === 'movie' ? between(180, 480) : between(120, 300)
  if (dur > 0) start = Math.min(start, Math.max(0, dur - PREVIEW_LEN - 5))   // never past the end of a short film
  return [{ start: Math.round(start), len: PREVIEW_LEN }]
}

/** The episode is cut into eight equal parts; 3.5 seconds from a little way into each. */
export function recapSegments(m: PlexMedia): Segment[] {
  const dur = durationOf(m)
  if (dur <= 0) return []
  const part = dur / RECAP_PARTS
  return Array.from({ length: RECAP_PARTS }, (_, i) => ({ start: Math.max(0, Math.min(i * part + part * 0.25, dur - RECAP_LEN - 1)), len: RECAP_LEN }))
}

/** Episode 1 of the first real season, with full file details (a show itself has nothing to play). */
export async function firstEpisode(server: PlexServer, show: PlexMedia): Promise<PlexMedia | null> {
  const seasons = await getChildren(server, show.ratingKey)
  const first = seasons.find((s) => s.index !== 0) ?? seasons[0]
  if (!first) return null
  const eps = await getChildren(server, first.ratingKey)
  return eps[0] ? getMetadata(server, eps[0].ratingKey) : null
}

/** List results sometimes lack file details; fetch them when missing. */
export async function withFile(server: PlexServer, m: PlexMedia): Promise<PlexMedia> {
  return m.Media?.[0]?.Part?.[0]?.key ? m : getMetadata(server, m.ratingKey)
}
