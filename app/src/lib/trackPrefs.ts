// Remembers the audio and subtitle choices you make while watching a TV show, so the rest of its episodes follow the same rules
// (e.g. an anime: Japanese audio with English subtitles). Saved per show on this device; a movie remembers its own choices for when you come back to it.
import { LANGS } from './tvguide'
import { activeProfile } from './profile'
import type { PlexMedia, PlexStream } from './plex'

/** A remembered audio or subtitle choice: its language, and what kind of track it was (codec, and whether it was a sidecar file) so the same kind is picked next time. */
interface TrackRef { lang?: string; title?: string; forced?: boolean; codec?: string; ext?: boolean }
export interface TrackPref { audio?: TrackRef; sub?: 'off' | TrackRef }
const KEY = 'chezzflix_track_prefs'

// Kept per profile (what one person picks for a show doesn't change what another sees). Choices saved before profiles were separated are still read as a fallback.
const baseKey = (m: PlexMedia) => (m.type === 'episode' ? `show:${m.grandparentRatingKey ?? m.ratingKey}` : m.type === 'movie' ? `movie:${m.ratingKey}` : null)
const keyOf = (m: PlexMedia) => { const b = baseKey(m); return b && activeProfile() ? `${activeProfile()}|${b}` : b }
// The choices live in the profile's settings (so they sync to the person's other devices); the settings provider hands over its copy here.
// Choices saved on this device before that are still read (and move into the settings the next time something is saved).
export interface TrackPrefStore { get: () => Record<string, TrackPref>; set: (v: Record<string, TrackPref>) => void }
let store: TrackPrefStore | undefined
export const bindTrackPrefs = (s: TrackPrefStore | undefined) => { store = s }
const legacy = (): Record<string, TrackPref> => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} } }
const readAll = (): Record<string, TrackPref> => (store ? { ...legacy(), ...store.get() } : legacy())

export const getTrackPref = (m: PlexMedia): TrackPref | undefined => { const k = keyOf(m); if (!k) return undefined; const all = readAll(); return all[k] ?? all[baseKey(m)!] }
export function saveTrackPref(m: PlexMedia, patch: TrackPref) {
  const k = keyOf(m)
  if (!k) return
  try {
    const all = readAll(); const next = { ...all[k], ...patch }
    delete all[k]; all[k] = next   // newest last
    const keys = Object.keys(all); if (keys.length > 150) for (const old of keys.slice(0, keys.length - 150)) delete all[old]   // movies add up (and these travel with the settings): keep the most recent
    if (store) store.set(all); else localStorage.setItem(KEY, JSON.stringify(all))
  } catch { /* private mode */ }
}

/** Language codes differ ("ja", "jpn", "Japanese"): compare them by meaning. */
export function sameLang(a?: string, b?: string): boolean {
  if (!a || !b) return false
  const x = a.toLowerCase(), y = b.toLowerCase()
  if (x === y) return true
  const id = (v: string) => LANGS.find((l) => l.codes.includes(v) || l.codes.includes(v.split('-')[0]) || l.name.toLowerCase() === v)?.id
  const ix = id(x), iy = id(y)
  return !!ix && ix === iy
}

interface Track { id: number; type: string; lang?: string; title?: string; forced?: boolean; codec?: string; selected?: boolean; external?: boolean }

/** Plain .srt files are the most dependable subtitles: given a choice of the same language, take one of those. */
export const isSrt = (codec?: string) => !!codec && /^(subrip|srt)$/i.test(codec)

interface Cand { id: number; lang?: string; title?: string; forced?: boolean; codec?: string; ext?: boolean }
/**
 * The subtitle track that is most like a remembered one: the same language first (or, for a choice saved with no language, the same kind of
 * track), then the same forced-ness, title, file type (srt, ass...) and sidecar-or-embedded; plain .srt wins a tie.
 */
function bestSub(cands: Cand[], want: TrackRef): number | undefined {
  const pool = want.lang ? cands.filter((t) => sameLang(t.lang, want.lang)) : cands.filter((t) => want.ext === undefined || !!t.ext === want.ext)
  if (!pool.length) return undefined
  const score = (t: Cand) => (!!t.forced === (want.forced ?? false) ? 8 : 0) + (want.title && t.title === want.title ? 4 : 0) + (want.codec && t.codec && t.codec.toLowerCase() === want.codec.toLowerCase() ? 2 : 0) + (want.ext !== undefined && !!t.ext === want.ext ? 1 : 0) + (isSrt(t.codec) ? 0.5 : 0)
  return pool.reduce((best, t) => (score(t) > score(best) ? t : best), pool[0]).id
}

/** Which tracks to switch to for this episode (undefined = leave it alone). */
export function pickTracks(tracks: Track[], pref: TrackPref | undefined): { aid?: number; sid?: number | 'no' } {
  const out: { aid?: number; sid?: number | 'no' } = {}
  // Subtitles stay off unless the person has turned them on (and for a show, that choice is remembered for its episodes).
  if (!pref) { out.sid = 'no'; return out }
  if (pref.audio?.lang) {
    const c = tracks.filter((t) => t.type === 'audio' && sameLang(t.lang, pref.audio!.lang))
    out.aid = (c.find((t) => pref.audio!.title && t.title === pref.audio!.title) ?? c[0])?.id
  }
  const sp = pref.sub
  if (!sp || sp === 'off') out.sid = 'no'
  else out.sid = bestSub(tracks.filter((t) => t.type === 'sub').map((t) => ({ id: t.id, lang: t.lang, title: t.title, forced: t.forced, codec: t.codec, ext: t.external })), sp)
  return out
}

/** Web player: the same idea, matched against Plex's stream list. */
const lang = (s: PlexStream) => s.languageCode ?? s.language
export function webChoice(m: PlexMedia, audio: PlexStream[], subs: PlexStream[]): { audioId?: number; subtitleId?: number | null } {
  const pref = getTrackPref(m)
  if (!pref) return { subtitleId: null }   // subtitles off unless the person turns them on
  const ch: { audioId?: number; subtitleId?: number | null } = {}
  if (pref.audio?.lang) ch.audioId = audio.find((s) => sameLang(lang(s), pref.audio!.lang))?.id
  if (!pref.sub || pref.sub === 'off') ch.subtitleId = null
  else ch.subtitleId = bestSub(subs.map((x) => ({ id: x.id, lang: lang(x), title: x.displayTitle, forced: x.forced, codec: x.codec, ext: !!x.key })), pref.sub) ?? null
  return ch
}
