import { LOW_POWER } from './perf'
import { setNavSounds } from './sfx'
import type { Channel, ChannelPrefs } from './tvguide'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

export const ACCENTS: { name: string; value: string }[] = [
  { name: 'Ember', value: '#ff4b3e' }, { name: 'Amber', value: '#ffa21f' }, { name: 'Lime', value: '#9be15d' },
  { name: 'Teal', value: '#2ed1b4' }, { name: 'Sky', value: '#43a8ff' }, { name: 'Indigo', value: '#7a7bff' },
  { name: 'Violet', value: '#b06bff' }, { name: 'Rose', value: '#ff5c99' },
]

export type HomeTab = 'all' | 'foryou' | 'trending' | 'movie' | 'show' | 'anime'

/**
 * One row on a Home tab.
 *  builtin    - Chezzflix's own rows (continue, recent, released, trending, quick...)
 *  hub        - one of Plex's own recommendation rows
 *  genre / playlist / collection - chosen by the user
 */
export interface HomeRowCfg { id: string; kind: 'builtin' | 'hub' | 'genre' | 'playlist' | 'collection'; ref: string; title: string; enabled: boolean }

export interface Settings {
  accent: string
  /** Show the large featured banner at the top of Home. */
  hero: boolean
  heroRotate: boolean
  hideWatched: boolean
  hideSpoilers: boolean
  brand: string
  avatarLogo: boolean
  hiddenLibraries: string[]
  /** Saved row layout per tab. A tab with no entry uses its built-in default layout. */
  homeRows: Partial<Record<HomeTab, HomeRowCfg[]>>
  seasonal: boolean
  /** The TV Guide (channels built from your library). */
  tvGuide: boolean
  /** How many hours ahead the guide is built. */
  guideHours: number
  /** TV Guide defaults: subtitles on/off, their language, and the preferred audio language ('' = whatever the file defaults to). Channels can override them. */
  guideSubs: 'on' | 'off'
  guideSubLang: string
  guideAudioLang: string
  /** TV Guide: even out loudness between channels and programs. */
  guideLeveling: boolean
  /** Audio / subtitle choices for the app's seasonal channels (they aren't stored with your own channels). */
  seasonalPrefs: Record<string, ChannelPrefs>
  channels: Channel[]
  /** The first-time "want some suggested channels?" offer has been shown. */
  guideOffered: boolean
  /** Fewer visual effects (no blur-behind, no drifting backgrounds): lighter on the graphics chip and battery. */
  lightEffects: boolean
  /** The one-time "choose your libraries" step has been completed for this profile. */
  setupDone: boolean
  /** Genres picked during setup (in order). They become the default genre rows on Home, Movies and Shows. Empty = built-in defaults. */
  genres: string[]
  /** Show titles that aren't in the library (from TMDB) in search, so they can be requested. */
  requests: boolean
  /** Address of the request service (Overseerr), e.g. https://requests.example.com */
  overseerrUrl: string
  /** Personalized rows ("Recommended for you", "Because you watched…") built on this device from your watch history. */
  recs: boolean
  /** Titles you told us you're not interested in: ratingKey -> when. */
  notInterested: Record<string, number>
  /** TMDB key (v3 key or v4 read token) for the Trending tab. */
  tmdbKey: string
  /** Continue Watching items you removed: ratingKey -> when (epoch seconds). They return once you watch more. */
  dismissedContinue: Record<string, number>
  /** Titles pinned to Continue Watching (ratingKey -> when pinned): they stay there, started or not, finished or not, until unpinned. */
  pinned: Record<string, number>
  /** How far back Continue Watching looks, in days. */
  continueDays: number
  /** Libraries (by key) that list a collection as one tile instead of every title in it. */
  collapseCollections: Record<string, boolean>
  player: 'app' | 'mpv'
  /** Measures each title and holds one steady volume boost, so quiet movies don't need the TV turned way up (desktop player). */
  autoLevel: boolean
  /** December look: an icy theme or a festive red-and-green one. */
  holidayStyle: 'frost' | 'festive'
  /** Shows (by rating key) whose episodes you've chosen never to blur. */
  spoilerFreeShows: Record<string, boolean>
  /** "Don't show again" on the quiet-title suggestion. */
  quietHintOff: boolean
  /** Lifts the center (dialogue) channel of surround audio (desktop player). */
  dialogueBoost: boolean
  autoplayNext: boolean
  /** Seconds the Up Next card counts down before the next episode starts (0 = straight away). */
  nextCountdown: number
  /** Seconds the player's back / forward buttons and left / right keys jump. */
  seekBack: number
  seekForward: number
  /** Continue Watching tiles: the episode's own thumbnail, or the show's poster with the season and episode underneath. */
  continueStyle: 'episode' | 'poster'
  /** Clicking an episode in Continue Watching: play it, or open the show's page at that episode. */
  continueOpen: 'play' | 'episode'
  /** After a movie ends (or you skip its credits): a screen of what to watch next. */
  movieSuggestions: boolean
  /** A small sound as you move around. */
  navSounds: boolean
  /** Info screen for a title: the cinematic page, or a plainer poster-and-details page. */
  infoStyle: 'full' | 'minimal'
  /** Per library: show only titles you haven't watched. */
  unwatchedOnly: Record<string, boolean>
  autoSkipIntro: boolean
  /** Subtitle look for plain-text subtitles (.srt etc.); styled ones (.ass) keep their own. */
  subSize: 'small' | 'medium' | 'large' | 'huge'
  subFont: 'sans' | 'serif' | 'mono'
  subColor: 'white' | 'yellow'
  subEdge: 'outline' | 'shadow' | 'none'
  subBackground: boolean
}

export const DEFAULT_BRAND = 'CHEZZ'
const DEFAULTS: Settings = {
  accent: ACCENTS[0].value, hero: true, heroRotate: true, hideWatched: false, hideSpoilers: false, brand: DEFAULT_BRAND, avatarLogo: false,
  hiddenLibraries: [], homeRows: {}, seasonal: true, tvGuide: true, guideHours: 12, guideSubs: 'off', guideSubLang: 'en', guideAudioLang: '', guideLeveling: true, seasonalPrefs: {}, channels: [], guideOffered: false, lightEffects: false, setupDone: false, genres: [], requests: true, recs: true, notInterested: {}, overseerrUrl: '', tmdbKey: '', dismissedContinue: {}, pinned: {}, continueDays: 90, collapseCollections: {}, player: 'app', autoLevel: false, holidayStyle: 'festive', spoilerFreeShows: {}, quietHintOff: false, dialogueBoost: false, autoplayNext: true, nextCountdown: 10, seekBack: 10, seekForward: 30, continueStyle: 'episode', continueOpen: 'play', movieSuggestions: true, navSounds: true, infoStyle: 'full', unwatchedOnly: {}, autoSkipIntro: false, subSize: 'medium', subFont: 'sans', subColor: 'white', subEdge: 'outline', subBackground: false,
}

export const PUMPKIN = '#ff7a1a'
export const FROST_BLUE = '#7dd3fc'
export const FESTIVE_RED = '#e11d48'
export type Season = 'halloween' | 'christmas' | null
export type HolidayStyle = 'frost' | 'festive'
/** October is spooky season, December is Christmas. `?season=halloween` / `?season=christmas` (and `&holiday=frost`) force one for previewing. */
export function currentSeason(): Season {
  const q = new URLSearchParams(location.search)
  const forced = q.get('season')
  if (forced) return forced === 'halloween' || forced === 'christmas' ? forced : null
  const m = new Date().getMonth()
  return m === 9 ? 'halloween' : m === 11 ? 'christmas' : null
}
export const forcedHoliday = (): HolidayStyle | null => { const h = new URLSearchParams(location.search).get('holiday'); return h === 'frost' || h === 'festive' ? h : null }
/** The colour a season imposes on the app (null = your own accent). */
export const seasonAccent = (season: Season, style: HolidayStyle): string | null => (season === 'halloween' ? PUMPKIN : season === 'christmas' ? (style === 'frost' ? FROST_BLUE : FESTIVE_RED) : null)
/** One word for the look in use: 'halloween', 'frost', 'festive' or '' (used by the stylesheet). */
export const themeKey = (season: Season, style: HolidayStyle): string => (season === 'christmas' ? style : season ?? '')

export const brandName = (s: Pick<Settings, 'brand'>) => `${s.brand || DEFAULT_BRAND}FLIX`
export const cleanBrand = (v: string) => v.replace(/flix$/i, '').replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 12)

const keyFor = (profileKey: string) => `chezzflix_settings_${profileKey}`
function load(profileKey: string): Settings {
  try {
    const raw = localStorage.getItem(keyFor(profileKey)) ?? localStorage.getItem('chezzflix_settings')
    const parsed = raw ? JSON.parse(raw) : {}
    // Older versions stored one global row list; per-tab layouts replaced it.
    if (!parsed.homeRows || Array.isArray(parsed.homeRows)) parsed.homeRows = {}
    return { ...DEFAULTS, ...parsed }
  } catch { return DEFAULTS }
}

interface SettingsCtx {
  /** What the app should use: your own choices, with a shared TMDB key filling in when you haven't set one. */
  settings: Settings
  update: (p: Partial<Settings>) => void
  /** The TMDB key this person typed themselves ('' if none). */
  ownTmdbKey: string
  /** True when the TMDB key in `settings` is the one shared by this server's owner. */
  tmdbShared: boolean
  ownOverseerrUrl: string
  overseerrShared: boolean
}
const Ctx = createContext<SettingsCtx>({ settings: DEFAULTS, update: () => {}, ownTmdbKey: '', tmdbShared: false, ownOverseerrUrl: '', overseerrShared: false })
export const useSettings = () => useContext(Ctx)
/** The active seasonal theme for this profile (null when off or out of season). */
export function useSeason(): Season { const { settings } = useContext(Ctx); return settings.seasonal ? currentSeason() : null }
/** Season plus which holiday style is chosen and the colour it brings. */
export function useTheme(): { season: Season; style: HolidayStyle; key: string; accent: string | null } {
  const { settings } = useContext(Ctx)
  const season = settings.seasonal ? currentSeason() : null
  const style = forcedHoliday() ?? settings.holidayStyle
  return { season, style, key: themeKey(season, style), accent: seasonAccent(season, style) }
}

/** Settings are stored per Plex profile, so each person gets their own accent, name, rows and libraries. */
export function SettingsProvider({ profileKey, shared: sharedValues, children }: { profileKey: string; shared?: { tmdbKey?: string; overseerrUrl?: string }; children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => load(profileKey))
  const loadedFor = useRef(profileKey)

  useEffect(() => {
    if (loadedFor.current !== profileKey) { loadedFor.current = profileKey; setSettings(load(profileKey)) }
  }, [profileKey])

  useEffect(() => {
    const season = settings.seasonal ? currentSeason() : null
    // A season brings its own colour (pumpkin orange, icy blue or festive red); turn Seasonal themes off to keep your own.
    const style = forcedHoliday() ?? settings.holidayStyle
    const tint = seasonAccent(season, style)
    document.documentElement.style.setProperty('--accent', tint ?? settings.accent)
    document.documentElement.dataset.season = themeKey(season, style)
    document.documentElement.dataset.perf = LOW_POWER || settings.lightEffects ? 'low' : 'high'
    setNavSounds(settings.navSounds)
    document.title = brandName(settings)
    try {
      localStorage.setItem('chezzflix_last_brand', brandName(settings))
      localStorage.setItem('chezzflix_last_accent', tint ?? settings.accent)
      localStorage.setItem('chezzflix_last_season', season ? '1' : '0')
      localStorage.setItem('chezzflix_last_theme', themeKey(season, style))
    } catch { /* ignore */ }
    if (loadedFor.current === profileKey) { try { localStorage.setItem(keyFor(profileKey), JSON.stringify(settings)) } catch { /* private mode */ } }
  }, [settings, profileKey])

  // Values shared by this server's owner are applied on top, never saved into this person's own settings.
  const tmdbShared = !settings.tmdbKey && !!sharedValues?.tmdbKey
  const overseerrShared = !settings.overseerrUrl && !!sharedValues?.overseerrUrl
  const effective = { ...settings, ...(tmdbShared ? { tmdbKey: sharedValues!.tmdbKey! } : {}), ...(overseerrShared ? { overseerrUrl: sharedValues!.overseerrUrl! } : {}) }
  return <Ctx.Provider value={{ settings: effective, update: (p) => setSettings((s) => ({ ...s, ...p })), ownTmdbKey: settings.tmdbKey, tmdbShared, ownOverseerrUrl: settings.overseerrUrl, overseerrShared }}>{children}</Ctx.Provider>
}
