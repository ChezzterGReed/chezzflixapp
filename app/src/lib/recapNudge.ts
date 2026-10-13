// "Welcome back" nudge: before an episode you haven't seen starts, if it's been a long while since you watched the one before it, offer a recap
// of that previous episode. Never for a rewatch (the episode is already watched) and never for the first episode of a show.
import { getPreviousEpisode, isWatched, type PlexMedia, type PlexServer } from './plex'
import type { Settings } from './settings'

export const RECAP_GAP_DEFAULT = 9
export const RECAP_GAP_MIN = 1
export const RECAP_GAP_MAX = 30

export interface RecapNudge { prev: PlexMedia; days: number }

/** The previous episode and how many days ago you watched it, if a recap should be offered before `target` plays; otherwise null. */
export async function recapNudgeFor(server: PlexServer, target: PlexMedia, s: Pick<Settings, 'recapNudge' | 'recapNudgeDays' | 'recapNudgeOff' | 'recapNudgeSkipped'>): Promise<RecapNudge | null> {
  if (!s.recapNudge || target.type !== 'episode') return null
  if (isWatched(target) || (target.viewOffset ?? 0) > 0) return null   // a rewatch, or an episode you already started: no nudge
  const show = target.grandparentRatingKey
  if (!show || s.recapNudgeOff[show]) return null
  const prev = await getPreviousEpisode(server, target)
  if (!prev || !(prev.viewCount && prev.viewCount > 0) || !prev.lastViewedAt) return null   // nothing watched before it: a first episode, or a show you've only dipped into
  if (s.recapNudgeSkipped[show] === prev.lastViewedAt) return null          // already said "Skip" for this very gap
  const days = Math.floor((Date.now() / 1000 - prev.lastViewedAt) / 86400)
  if (days < s.recapNudgeDays) return null
  return { prev, days }
}
