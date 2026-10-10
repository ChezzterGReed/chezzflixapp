// Remembers the audio and subtitle choices you make while watching a TV show, so the rest of its episodes follow the same rules
// (e.g. an anime: Japanese audio with English subtitles). Saved per show on this device; movies aren't remembered.
import { LANGS } from './tvguide'
import type { PlexMedia, PlexStream } from './plex'

interface TrackRef { lang?: string; title?: string; forced?: boolean }
export interface TrackPref { audio?: TrackRef; sub?: 'off' | TrackRef }
const KEY = 'chezzflix_track_prefs'

const keyOf = (m: PlexMedia) => (m.type === 'episode' ? `show:${m.grandparentRatingKey ?? m.ratingKey}` : null)
const readAll = (): Record<string, TrackPref> => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} } }

export const getTrackPref = (m: PlexMedia): TrackPref | undefined => { const k = keyOf(m); return k ? readAll()[k] : undefined }
export function saveTrackPref(m: PlexMedia, patch: TrackPref) {
  const k = keyOf(m)
  if (!k) return
  try { const all = readAll(); all[k] = { ...all[k], ...patch }; localStorage.setItem(KEY, JSON.stringify(all)) } catch { /* private mode */ }
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

interface Track { id: number; type: string; lang?: string; title?: string; forced?: boolean }

/** Which tracks to switch to for this episode (undefined = leave it alone). */
export function pickTracks(tracks: Track[], pref: TrackPref | undefined): { aid?: number; sid?: number | 'no' } {
  if (!pref) return {}
  const out: { aid?: number; sid?: number | 'no' } = {}
  if (pref.audio?.lang) {
    const c = tracks.filter((t) => t.type === 'audio' && sameLang(t.lang, pref.audio!.lang))
    out.aid = (c.find((t) => pref.audio!.title && t.title === pref.audio!.title) ?? c[0])?.id
  }
  const sp = pref.sub
  if (sp === 'off') out.sid = 'no'
  else if (sp?.lang) {
    const c = tracks.filter((t) => t.type === 'sub' && sameLang(t.lang, sp.lang))
    const want = sp.forced ?? false
    out.sid = (c.find((t) => !!t.forced === want && (!sp.title || t.title === sp.title)) ?? c.find((t) => !!t.forced === want) ?? c[0])?.id
  }
  return out
}

/** Web player: the same idea, matched against Plex's stream list. */
export function webChoice(m: PlexMedia, audio: PlexStream[], subs: PlexStream[]): { audioId?: number; subtitleId?: number | null } {
  const pref = getTrackPref(m)
  if (!pref) return {}
  const ch: { audioId?: number; subtitleId?: number | null } = {}
  const lang = (s: PlexStream) => s.languageCode ?? s.language
  if (pref.audio?.lang) ch.audioId = audio.find((s) => sameLang(lang(s), pref.audio!.lang))?.id
  if (pref.sub === 'off') ch.subtitleId = null
  else if (pref.sub?.lang) { const want = pref.sub.forced ?? false; ch.subtitleId = (subs.find((s) => sameLang(lang(s), (pref.sub as TrackRef).lang) && !!s.forced === want) ?? subs.find((s) => sameLang(lang(s), (pref.sub as TrackRef).lang)))?.id }
  return ch
}
