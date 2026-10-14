import { setLastBrand } from './brand'
import { LOW_POWER } from './perf'
import { setNavSounds } from './sfx'
import { setActiveProfile } from './profile'
import { initialMeta, isSynced, mergeSettings, pullSettings, pushSettings, syncedValues, SYNC_URL, type Meta, type SyncAuth } from './sync'
import type { Channel, ChannelPrefs } from './tvguide'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

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
  /** Per Home tab: show only titles you haven't watched (a tab without an entry follows `hideWatched`). */
  hideWatchedTabs: Partial<Record<HomeTab, boolean>>
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
  /** Keep this profile's settings the same on every device (when the sync service is set up). Not itself synced. */
  syncSettings: boolean
  /** After a long break between episodes, offer a recap before the next one (days = how long a break counts). */
  recapNudge: boolean
  recapNudgeDays: number
  /** Shows (by rating key) where it was turned off for good. */
  recapNudgeOff: Record<string, boolean>
  /** Shows where "Skip" was chosen: the last-viewed time of the episode it was for, so the same break isn't offered again. */
  recapNudgeSkipped: Record<string, number>
  /** December look: an icy theme or a festive red-and-green one. */
  holidayStyle: 'frost' | 'festive'
  /** Shows (by rating key) whose episodes you've chosen never to blur. */
  spoilerFreeShows: Record<string, boolean>
  /** "Don't show again" on the quiet-title suggestion. */
  quietHintOff: boolean
  /** Lifts the center (dialogue) channel of surround audio (desktop player). */
  dialogueBoost: boolean
  autoplayNext: boolean
  /** A slideshow of what's on the server after a few quiet minutes. */
  screensaver: boolean
  screensaverMins: number
  /** When the credits have a scene after them, let it play before offering the next episode. */
  waitForScenes: boolean
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
  accent: ACCENTS[0].value, hero: true, heroRotate: true, hideWatched: false, hideWatchedTabs: {}, hideSpoilers: false, brand: DEFAULT_BRAND, avatarLogo: false,
  hiddenLibraries: [], homeRows: {}, seasonal: true, tvGuide: true, guideHours: 12, guideSubs: 'off', guideSubLang: 'en', guideAudioLang: '', guideLeveling: true, seasonalPrefs: {}, channels: [], guideOffered: false, lightEffects: false, setupDone: false, genres: [], requests: true, recs: true, notInterested: {}, overseerrUrl: '', tmdbKey: '', dismissedContinue: {}, pinned: {}, continueDays: 90, collapseCollections: {}, player: 'app', autoLevel: false, syncSettings: true, recapNudge: true, recapNudgeDays: 9, recapNudgeOff: {}, recapNudgeSkipped: {}, holidayStyle: 'festive', spoilerFreeShows: {}, quietHintOff: false, dialogueBoost: false, autoplayNext: true, screensaver: true, screensaverMins: 10, waitForScenes: true, nextCountdown: 10, seekBack: 10, seekForward: 30, continueStyle: 'episode', continueOpen: 'play', movieSuggestions: true, navSounds: true, infoStyle: 'full', unwatchedOnly: {}, autoSkipIntro: false, subSize: 'medium', subFont: 'sans', subColor: 'white', subEdge: 'outline', subBackground: false,
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

/** Does this Home tab leave out titles you've already watched? */
export const hidesWatched = (s: Pick<Settings, 'hideWatched' | 'hideWatchedTabs'>, tab: HomeTab): boolean => s.hideWatchedTabs?.[tab] ?? s.hideWatched

export const brandName = (s: Pick<Settings, 'brand'>) => `${s.brand || DEFAULT_BRAND}FLIX`
export const cleanBrand = (v: string) => v.replace(/flix$/i, '').replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 12)

const keyFor = (profileKey: string) => `chezzflix_settings_${profileKey}`
function load(profileKey: string): Settings {
  try {
    // (A pre-profiles global copy, if one is still around, goes to the first profile that opens and is then removed, so no later profile inherits it.)
    const own = localStorage.getItem(keyFor(profileKey))
    const legacy = own == null ? localStorage.getItem('chezzflix_settings') : null
    if (legacy != null) { try { localStorage.removeItem('chezzflix_settings') } catch { /* ignore */ } }
    const raw = own ?? legacy
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
  /** Syncing this profile's settings with the person's other devices. */
  sync: { enabled: boolean; status: 'idle' | 'syncing' | 'ok' | 'error'; at: number; now: () => void }
}
const Ctx = createContext<SettingsCtx>({ settings: DEFAULTS, update: () => {}, ownTmdbKey: '', tmdbShared: false, ownOverseerrUrl: '', overseerrShared: false, sync: { enabled: false, status: 'idle', at: 0, now: () => {} } })
export const useSettings = () => useContext(Ctx)
/** Sync status for the Settings screen. */
export const useSync = () => useContext(Ctx).sync
/** The active seasonal theme for this profile (null when off or out of season). */
export function useSeason(): Season { const { settings } = useContext(Ctx); return settings.seasonal ? currentSeason() : null }
/** Season plus which holiday style is chosen and the colour it brings. */
export function useTheme(): { season: Season; style: HolidayStyle; key: string; accent: string | null } {
  const { settings } = useContext(Ctx)
  const season = settings.seasonal ? currentSeason() : null
  const style = forcedHoliday() ?? settings.holidayStyle
  return { season, style, key: themeKey(season, style), accent: seasonAccent(season, style) }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const metaKey = (profileKey: string) => `chezzflix_syncmeta_${profileKey}`
function loadMeta(profileKey: string, settings: Settings): Meta {
  try { const raw = localStorage.getItem(metaKey(profileKey)); if (raw) return JSON.parse(raw) as Meta } catch { /* fall through */ }
  return initialMeta(settings as unknown as Record<string, unknown>, DEFAULTS as unknown as Record<string, unknown>)   // first time on this device: what's already customised counts as an old change
}
const saveMeta = (profileKey: string, m: Meta) => { try { localStorage.setItem(metaKey(profileKey), JSON.stringify(m)) } catch { /* private mode */ } }

/** Settings are stored per Plex profile, so each person gets their own accent, name, rows and libraries. */
export function SettingsProvider({ profileKey, shared: sharedValues, syncAuth, children }: { profileKey: string; shared?: { tmdbKey?: string; overseerrUrl?: string }; /** Who this is, for the sync service (the person's Plex token and the server). */ syncAuth?: SyncAuth; children: ReactNode }) {
  setActiveProfile(profileKey)   // (for the few per-profile things kept outside these settings, like each show's audio / subtitle choice)
  const [settings, setSettings] = useState<Settings>(() => load(profileKey))
  const loadedFor = useRef(profileKey)
  const settingsRef = useRef(settings); settingsRef.current = settings
  const metaRef = useRef<Meta>(loadMeta(profileKey, settings))
  const authRef = useRef(syncAuth); authRef.current = syncAuth
  const syncTimer = useRef(0)
  const syncing = useRef(false)
  const lastSync = useRef(0)
  const [syncState, setSyncState] = useState<{ status: 'idle' | 'syncing' | 'ok' | 'error'; at: number }>({ status: 'idle', at: 0 })
  const skipSave = useRef(false)   // the render right after switching profile still holds the previous person's settings: never save those under the new profile

  useEffect(() => {
    if (loadedFor.current !== profileKey) { loadedFor.current = profileKey; skipSave.current = true; const next = load(profileKey); metaRef.current = loadMeta(profileKey, next); setSettings(next) }
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
    setLastBrand(brandName(settings))
    try {
      localStorage.setItem('chezzflix_last_accent', tint ?? settings.accent)
      localStorage.setItem('chezzflix_last_season', season ? '1' : '0')
      localStorage.setItem('chezzflix_last_theme', themeKey(season, style))
    } catch { /* ignore */ }
    if (skipSave.current) { skipSave.current = false; return }
    if (loadedFor.current === profileKey) { try { localStorage.setItem(keyFor(profileKey), JSON.stringify(settings)) } catch { /* private mode */ } }
  }, [settings, profileKey])

  // ----- sync with the person's other devices -----
  const runSync = useCallback(async () => {
    const auth = authRef.current
    if (!SYNC_URL || !auth || !settingsRef.current.syncSettings || syncing.current || loadedFor.current !== profileKey) return
    syncing.current = true
    setSyncState((s) => ({ ...s, status: 'syncing' }))
    try {
      const remote = await pullSettings(auth)
      const cur = settingsRef.current as unknown as Record<string, unknown>
      const rd = remote.found && remote.data && remote.data.values && remote.data.meta ? remote.data : undefined
      const { adopt, meta, push } = mergeSettings(cur, metaRef.current, DEFAULTS as unknown as Record<string, unknown>, rd)
      metaRef.current = meta; saveMeta(profileKey, meta)
      if (Object.keys(adopt).length) setSettings((s) => ({ ...s, ...adopt }))   // (changes that came from another device are not sent back)
      if (push) await pushSettings(auth, syncedValues({ ...cur, ...adopt }, DEFAULTS as unknown as Record<string, unknown>), meta)
      setSyncState({ status: 'ok', at: Date.now() })
    } catch { setSyncState((s) => ({ ...s, status: 'error' })) } finally { syncing.current = false; lastSync.current = Date.now() }
  }, [profileKey])
  const scheduleSync = useCallback(() => { clearTimeout(syncTimer.current); syncTimer.current = window.setTimeout(() => { void runSync() }, 3000) }, [runSync])

  // On start (and when the profile or connection changes), then every few minutes and whenever the app comes back to the front.
  useEffect(() => {
    if (!SYNC_URL || !syncAuth) return
    const first = window.setTimeout(() => { void runSync() }, 800)
    const every = window.setInterval(() => { void runSync() }, 5 * 60_000)
    const back = () => { if (!document.hidden && Date.now() - lastSync.current > 60_000) void runSync() }
    document.addEventListener('visibilitychange', back)
    return () => { clearTimeout(first); clearInterval(every); clearTimeout(syncTimer.current); document.removeEventListener('visibilitychange', back) }
  }, [runSync, syncAuth?.token, syncAuth?.serverId, settings.syncSettings]) // eslint-disable-line react-hooks/exhaustive-deps

  // A change made here: note when (per setting), and send it on shortly.
  const update = useCallback((p: Partial<Settings>) => {
    const cur = settingsRef.current as unknown as Record<string, unknown>, now = Date.now()
    let changed = false
    for (const [k, v] of Object.entries(p)) if (isSynced(k) && !same(v, cur[k])) { metaRef.current[k] = now; changed = true }
    if (changed) { saveMeta(profileKey, metaRef.current); scheduleSync() }
    setSettings((s) => ({ ...s, ...p }))
  }, [profileKey, scheduleSync])

  // Values shared by this server's owner are applied on top, never saved into this person's own settings.
  const tmdbShared = !settings.tmdbKey && !!sharedValues?.tmdbKey
  const overseerrShared = !settings.overseerrUrl && !!sharedValues?.overseerrUrl
  const effective = { ...settings, ...(tmdbShared ? { tmdbKey: sharedValues!.tmdbKey! } : {}), ...(overseerrShared ? { overseerrUrl: sharedValues!.overseerrUrl! } : {}) }
  return <Ctx.Provider value={{ settings: effective, update, ownTmdbKey: settings.tmdbKey, tmdbShared, ownOverseerrUrl: settings.overseerrUrl, overseerrShared, sync: { enabled: !!SYNC_URL && !!syncAuth, status: syncState.status, at: syncState.at, now: () => { void runSync() } } }}>{children}</Ctx.Provider>
}
