// Short clips for "Preview" (a taste of a movie or a show) and "Recap" (a few seconds from across an episode).
import { getChildren, getMetadata, type PlexMedia, type PlexServer } from './plex'

/** A stretch of the file to play: `start` and `len` in seconds. */
export interface Segment { start: number; len: number }

export const PREVIEW_LEN = 30
export const RECAP_PARTS = 5
export const RECAP_LEN = 10      // each of the first four clips
export const RECAP_FINALE = 20   // the last clip: the final seconds before the credits

const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo)
const durationOf = (m: PlexMedia) => (m.duration ?? 0) / 1000

/** Movies jump 3-8 minutes in; the first episode of a show 2-5 minutes in. Plays for thirty seconds. */
export function previewSegments(m: PlexMedia): Segment[] {
  const dur = durationOf(m)
  let start = m.type === 'movie' ? between(180, 480) : between(120, 300)
  if (dur > 0) start = Math.min(start, Math.max(0, dur - PREVIEW_LEN - 5))   // never past the end of a short film
  return [{ start: Math.round(start), len: PREVIEW_LEN }]
}

/**
 * The episode (up to its credits, when Plex has marked them) is cut into five equal parts: 10 seconds from a little way into each of
 * the first four. The fifth clip is 20 seconds: the stretch right before the credits begin, or, without credits, from the last part.
 */
export function recapSegments(m: PlexMedia): Segment[] {
  const dur = durationOf(m)
  if (dur <= 0) return []
  const credits = m.Marker?.find((k) => k.type === 'credits')
  const creditsAt = credits && credits.startTimeOffset / 1000 > 60 ? credits.startTimeOffset / 1000 : 0
  const end = creditsAt || dur
  const part = end / RECAP_PARTS
  const clamp = (start: number, len: number) => Math.max(0, Math.min(start, dur - len - 1))
  const segs: Segment[] = Array.from({ length: RECAP_PARTS - 1 }, (_, i) => ({ start: clamp(i * part + part * 0.25, RECAP_LEN), len: RECAP_LEN }))
  segs.push(creditsAt ? { start: Math.max(0, creditsAt - RECAP_FINALE), len: RECAP_FINALE } : { start: clamp((RECAP_PARTS - 1) * part + part * 0.25, RECAP_FINALE), len: RECAP_FINALE })
  return segs
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
