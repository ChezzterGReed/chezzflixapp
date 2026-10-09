import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

export const ACCENTS: { name: string; value: string }[] = [
  { name: 'Ember', value: '#ff4b3e' }, { name: 'Amber', value: '#ffa21f' }, { name: 'Lime', value: '#9be15d' },
  { name: 'Teal', value: '#2ed1b4' }, { name: 'Sky', value: '#43a8ff' }, { name: 'Indigo', value: '#7a7bff' },
  { name: 'Violet', value: '#b06bff' }, { name: 'Rose', value: '#ff5c99' },
]

export type HomeTab = 'all' | 'trending' | 'movie' | 'show' | 'anime'

/**
 * One row on a Home tab.
 *  builtin    - Chezzflix's own rows (continue, recent, released, trending, quick...)
 *  hub        - one of Plex's own recommendation rows
 *  genre / playlist / collection - chosen by the user
 */
export interface HomeRowCfg { id: string; kind: 'builtin' | 'hub' | 'genre' | 'playlist' | 'collection'; ref: string; title: string; enabled: boolean }

export interface Settings {
  accent: string
  heroRotate: boolean
  hideWatched: boolean
  hideSpoilers: boolean
  brand: string
  avatarLogo: boolean
  hiddenLibraries: string[]
  /** Saved row layout per tab. A tab with no entry uses its built-in default layout. */
  homeRows: Partial<Record<HomeTab, HomeRowCfg[]>>
  seasonal: boolean
  /** The one-time "choose your libraries" step has been completed for this profile. */
  setupDone: boolean
  /** Genres picked during setup (in order). They become the default genre rows on Home, Movies and Shows. Empty = built-in defaults. */
  genres: string[]
  /** Show titles that aren't in the library (from TMDB) in search, so they can be requested. */
  requests: boolean
  /** Address of the request service (Overseerr), e.g. https://requests.example.com */
  overseerrUrl: string
  /** TMDB key (v3 key or v4 read token) for the Trending tab. */
  tmdbKey: string
  /** Continue Watching items you removed: ratingKey -> when (epoch seconds). They return once you watch more. */
  dismissedContinue: Record<string, number>
  /** Libraries (by key) that list a collection as one tile instead of every title in it. */
  collapseCollections: Record<string, boolean>
  player: 'app' | 'mpv'
  /** Measures each title and holds one steady volume boost, so quiet movies don't need the TV turned way up (desktop player). */
  autoLevel: boolean
  /** Lifts the center (dialogue) channel of surround audio (desktop player). */
  dialogueBoost: boolean
  autoplayNext: boolean
  autoSkipIntro: boolean
}

export const DEFAULT_BRAND = 'CHEZZ'
const DEFAULTS: Settings = {
  accent: ACCENTS[0].value, heroRotate: true, hideWatched: false, hideSpoilers: false, brand: DEFAULT_BRAND, avatarLogo: false,
  hiddenLibraries: [], homeRows: {}, seasonal: true, setupDone: false, genres: [], requests: true, overseerrUrl: '', tmdbKey: '', dismissedContinue: {}, collapseCollections: {}, player: 'app', autoLevel: false, dialogueBoost: false, autoplayNext: true, autoSkipIntro: false,
}

export const PUMPKIN = '#ff7a1a'
export type Season = 'halloween' | null
/** October is spooky season. `?season=halloween` forces it for previewing. */
export function currentSeason(): Season {
  const forced = new URLSearchParams(location.search).get('season')
  if (forced) return forced === 'halloween' ? 'halloween' : null
  return new Date().getMonth() === 9 ? 'halloween' : null
}

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

/** Settings are stored per Plex profile, so each person gets their own accent, name, rows and libraries. */
export function SettingsProvider({ profileKey, shared: sharedValues, children }: { profileKey: string; shared?: { tmdbKey?: string; overseerrUrl?: string }; children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => load(profileKey))
  const loadedFor = useRef(profileKey)

  useEffect(() => {
    if (loadedFor.current !== profileKey) { loadedFor.current = profileKey; setSettings(load(profileKey)) }
  }, [profileKey])

  useEffect(() => {
    const season = settings.seasonal ? currentSeason() : null
    // Spooky season is always pumpkin orange (turn Seasonal themes off to keep your own colour).
    document.documentElement.style.setProperty('--accent', season === 'halloween' ? PUMPKIN : settings.accent)
    document.documentElement.dataset.season = season ?? ''
    document.title = brandName(settings)
    try { localStorage.setItem('chezzflix_last_brand', brandName(settings)) } catch { /* ignore */ }
    if (loadedFor.current === profileKey) { try { localStorage.setItem(keyFor(profileKey), JSON.stringify(settings)) } catch { /* private mode */ } }
  }, [settings, profileKey])

  // Values shared by this server's owner are applied on top, never saved into this person's own settings.
  const tmdbShared = !settings.tmdbKey && !!sharedValues?.tmdbKey
  const overseerrShared = !settings.overseerrUrl && !!sharedValues?.overseerrUrl
  const effective = { ...settings, ...(tmdbShared ? { tmdbKey: sharedValues!.tmdbKey! } : {}), ...(overseerrShared ? { overseerrUrl: sharedValues!.overseerrUrl! } : {}) }
  return <Ctx.Provider value={{ settings: effective, update: (p) => setSettings((s) => ({ ...s, ...p })), ownTmdbKey: settings.tmdbKey, tmdbShared, ownOverseerrUrl: settings.overseerrUrl, overseerrShared }}>{children}</Ctx.Provider>
}
