import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FocusContext, GetBoundingClientRectAdapter, doesFocusableExist, getCurrentFocusKey, init, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import {
  directPlayUrl, getCollectionItems, getCollections, getCurrentUser, getGenreItems, getGenres, getProfiles, getSections, getServers, invalidateCache,
  isWatched, removeFromContinueWatching, resolvePlayable, setWatched, switchProfile, type PlexCollectionRef, type PlexMedia, type PlexProfile, type PlexSection, type PlexServer,
} from './lib/plex'
import { loadAnime, tabOk } from './lib/homeData'
import { setBooted, useBooted } from './lib/boot'
import { useBack } from './lib/back'
import { justMoved, moveCount, settleMs } from './lib/input'
import { ensureFocus, rescueSoon } from './lib/focusRescue'
import { isAndroid } from './lib/native'
import { inTauri, startPlayback } from './lib/player'
import { brandName, SettingsProvider, useSettings } from './lib/settings'
import { Login } from './screens/Login'
import { unseal, type Sealed } from './lib/sealed'
import sealedKeys from './lib/sealed-keys.json'
import { UpdatePrompt } from './components/UpdatePrompt'
import { GenreSetup, LibrarySetup, ProfilePicker } from './screens/Onboarding'
import { Home } from './screens/Home'
import { Library } from './screens/Library'
import { Search } from './screens/Search'
import { Watchlist } from './screens/Watchlist'
import { TVGuide } from './screens/TVGuide'
import { Dashboard } from './screens/Dashboard'
import { BrowseIndex } from './screens/BrowseIndex'
import { ListView } from './screens/ListView'
import { Detail } from './screens/Detail'
import { Sidebar, type View } from './components/Sidebar'
import { ProfileMenu } from './components/ProfileMenu'
import { SettingsModal } from './components/SettingsModal'
import { Player } from './components/Player'
import { ItemMenu } from './components/ItemMenu'
import { ItemMenuContext } from './lib/itemMenu'
import { LoadingScreen } from './components/LoadingScreen'
import { SeasonalAmbient } from './components/SeasonalAmbient'

// Measure true on-screen positions: by default the library ignores that a list (like the side menu's libraries) has scrolled, so the
// last item looked like it was BELOW the Dashboard button and "down" could never reach it.
init({
  debug: false, visualDebug: false,
  layoutAdapter: GetBoundingClientRectAdapter,
})
if (import.meta.env.DEV) (window as unknown as { __nav: unknown }).__nav = { getCurrentFocusKey }

const DEMO = new URLSearchParams(location.search).has('demo') || import.meta.env.VITE_DEMO === '1'   // VITE_DEMO=1 builds a demo-mode app (for testing without a Plex account)
const CHOSEN_KEY = 'plex_profile_chosen'
const store = DEMO ? sessionStorage : localStorage
const isChosen = () => store.getItem(CHOSEN_KEY) === '1'
const markChosen = () => store.setItem(CHOSEN_KEY, '1')
// `?demo&fresh` replays first-run (profile + library steps) in the demo.
if (DEMO && new URLSearchParams(location.search).has('fresh') && !sessionStorage.getItem('chezzflix_fresh_done')) {
  Object.keys(localStorage).filter((k) => k.startsWith('chezzflix_settings')).forEach((k) => localStorage.removeItem(k))
  sessionStorage.removeItem(CHOSEN_KEY); sessionStorage.setItem('chezzflix_fresh_done', '1')
}

interface Me { name: string; thumb?: string; key: string }

function Main({ token, server, allSections, profiles, me, onSwitch, onSignOut }: {
  token: string; server: PlexServer; allSections: PlexSection[]; profiles: PlexProfile[]; me: Me
  onSwitch: (p: PlexProfile, pin?: string) => Promise<void>; onSignOut: () => void
}) {
  const { settings, update } = useSettings()
  const [menu, setMenu] = useState<{ item: PlexMedia; fromContinue?: boolean; fromRecs?: boolean; onSelect?: () => void }>()
  const [view, setView] = useState<View>({ type: 'home' })
  const [history, setHistory] = useState<View[]>([])
  const [details, setDetails] = useState<string[]>([])
  const [layer, setLayer] = useState<'profile' | 'settings' | null>(null)
  const [playing, setPlaying] = useState<PlexMedia>()
  const [refreshKey, setRefreshKey] = useState(0)
  const [toast, setToast] = useState<string>()
  const toastTimer = useRef<number>(0)
  const { ref: mainRef, focusKey: mainKey } = useFocusable({ focusKey: 'MAIN', saveLastFocusedChild: true, autoRestoreFocus: false })

  const sections = useMemo(() => allSections.filter((s) => !settings.hiddenLibraries.includes(s.key)), [allSections, settings.hiddenLibraries])
  const say = (msg: string) => { setToast(msg); clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(undefined), 3500) }

  // Switching the TV Guide off while you're in it returns Home.
  useEffect(() => { if (view.type === 'guide' && !settings.tvGuide) setView({ type: 'home' }) }, [settings.tvGuide, view])
  // If the library you're viewing gets hidden, fall back to Home.
  useEffect(() => { if (view.type === 'library' && !allSections.some((s) => s.key === (view as { section: PlexSection }).section.key)) setView({ type: 'home' }) }, [allSections, view])

  // Rail navigation starts fresh; drilling in (browse -> genre -> title) keeps a back stack.
  const navigate = (v: View) => { setView(v); setHistory([]); setDetails([]); window.scrollTo({ top: 0 }) }
  const push = (v: View) => { setHistory((h) => [...h, view]); setView(v); setDetails([]); window.scrollTo({ top: 0 }) }
  const back = () => { setView(history[history.length - 1]); setHistory((h) => h.slice(0, -1)); window.scrollTo({ top: 0 }) }
  // Back: go back a screen; with nothing to go back to, a TV remote's Back goes Home, and from Home it opens/closes the side menu.
  const railKey = () => (view.type === 'library' ? `nav-lib-${view.section.key}` : view.type === 'search' ? 'nav-search' : view.type === 'watchlist' ? 'nav-watchlist' : view.type === 'guide' ? 'nav-guide' : view.type === 'dashboard' ? 'nav-dashboard' : 'nav-home')
  const toggleRail = () => { const k = getCurrentFocusKey() ?? ''; if (k.startsWith('nav-')) setFocus('MAIN'); else setFocus(doesFocusableExist(railKey()) ? railKey() : 'SIDEBAR') }
  useBack(() => {
    if (history.length > 0) return back()
    if (isAndroid) toggleRail()   // nothing to go back to: the remote's Back opens / closes the side menu (Home is in the menu)
  })
  // Left with nothing further left to select always opens the side menu.
  const railKeyRef = useRef(railKey()); railKeyRef.current = railKey()
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' || e.repeat || justMoved() || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const before = getCurrentFocusKey(), m0 = moveCount()
      if (!before || before === 'SN:ROOT' || before.startsWith('nav-')) return
      setTimeout(() => {
        if (getCurrentFocusKey() !== before || moveCount() !== m0 || document.querySelector('[data-layer], [data-player]')) return   // it moved, or a popup / the player owns the keys
        const k = railKeyRef.current
        setFocus(doesFocusableExist(k) ? k : 'SIDEBAR')
      }, settleMs())
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
  // The focused button can vanish when a screen changes or reloads; put focus back so the remote never goes dead.
  useEffect(() => { rescueSoon() }, [view])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key) && !ensureFocus()) { e.preventDefault(); e.stopPropagation() } }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [])

  // Content for a genre / collection list.
  const listLoader = useMemo(() => {
    if (view.type !== 'list') return undefined
    const src = view.source
    return async (): Promise<PlexMedia[]> => {
      if (src.kind === 'collection') return getCollectionItems(server, src.id)
      const anime = await loadAnime(server, sections, 0).catch(() => undefined)
      const secs = sections.filter((x) => (src.sectionKey ? x.key === src.sectionKey : src.tab === 'all' || src.tab === 'anime' || src.tab === 'trending' || x.type === src.tab))
      if (src.tab === 'anime') return (anime?.items ?? []).filter((m) => m.Genre?.some((g) => g.tag === src.genre))
      const lists = await Promise.all(secs.map(async (x) => {
        const g = (await getGenres(server, x.key)).find((y) => y.title === src.genre)
        return g ? getGenreItems(server, x.key, g.key, 300) : []
      }))
      return lists.flat().filter((m) => tabOk(src.tab, m, anime))
    }
  }, [view, server, sections])

  const openCollection = async (title: string, sectionId?: string | number) => {
    const secs = sectionId != null ? sections.filter((x) => x.key === String(sectionId)) : sections
    const found: PlexCollectionRef | undefined = (await Promise.all((secs.length ? secs : sections).map((x) => getCollections(server, x.key)))).flat().find((c) => c.title === title)
    if (!found) return say(`Couldn't find the “${title.replace(/^_+/, '')}” collection.`)
    push({ type: 'list', title: found.title.replace(/^_+/, ''), subtitle: 'Collection', source: { kind: 'collection', id: found.ratingKey } })
  }

  const play = async (m: PlexMedia) => {
    try {
      const target = await resolvePlayable(server, m)
      if (!target) return say('No playable file found for ' + m.title)
      if (settings.player === 'mpv' && inTauri) {
        const url = directPlayUrl(server, target)
        if (!url) return say('No playable file found for ' + m.title)
        await startPlayback(server, target, url)
        return
      }
      setPlaying(target)
    } catch (e) { say('Could not start playback: ' + (e as Error).message) }
  }

  const closePlayer = () => { setPlaying(undefined); invalidateCache(); setRefreshKey((k) => k + 1) }
  const playNext = async (m: PlexMedia) => { const full = await resolvePlayable(server, m); if (full) setPlaying(full) }

  const open = (m: PlexMedia) => {
    const key = m.type === 'episode' ? m.grandparentRatingKey ?? m.ratingKey : m.type === 'season' ? m.parentRatingKey ?? m.ratingKey : m.ratingKey
    setDetails((d) => d[d.length - 1] === key ? d : [...d, key])
  }

  // ----- per-title menu (right-click / long-press) -----
  const notInterested = (m: PlexMedia) => {
    update({ notInterested: { ...settings.notInterested, [m.ratingKey]: Math.floor(Date.now() / 1000) } })
    say("Got it. We'll show fewer titles like this.")
  }
  const toggleWatched = async (m: PlexMedia) => {
    const next = !isWatched(m)
    await setWatched(server, m.ratingKey, next)
    invalidateCache(); setRefreshKey((k) => k + 1)
    say(next ? 'Marked as watched' : 'Marked as unwatched')
  }
  const removeContinue = (m: PlexMedia) => {
    // Hidden on our side (per profile) until you watch more; also asks the server to drop it.
    const pinned = { ...settings.pinned }
    delete pinned[m.ratingKey]; if (m.grandparentRatingKey) delete pinned[m.grandparentRatingKey]   // removing a pinned title unpins it
    update({ pinned, dismissedContinue: { ...settings.dismissedContinue, [m.ratingKey]: Math.floor(Date.now() / 1000) } })
    removeFromContinueWatching(server, m.ratingKey)
    say('Removed from Continue Watching')
  }

  // Connected the long way round? Say so once, so slow playback isn't a mystery.
  useEffect(() => { if (server.relay) say('Connected through Plex’s relay, which can limit video quality. Allow direct connections on your server for the best playback.') }, [server.uri])  // eslint-disable-line react-hooks/exhaustive-deps

  void token
  return (
    <ItemMenuContext.Provider value={(item, opts) => setMenu({ item, fromContinue: opts?.fromContinue, fromRecs: opts?.fromRecs, onSelect: opts?.onSelect })}>
      <SeasonalAmbient />
      <Sidebar tvGuide={settings.tvGuide} sections={sections} everySection={allSections} view={view} onNavigate={navigate} profileName={me.name} profileThumb={me.thumb}
        brand={brandName(settings)} avatarLogo={settings.avatarLogo} onProfile={() => setLayer('profile')} showDashboard={!!server.owned} />
      <FocusContext.Provider value={mainKey}>
        <main ref={mainRef} key={view.type + (view.type === 'library' ? view.section.key : view.type === 'browse' ? view.kind + view.tab : view.type === 'list' ? view.title : '')} className="fade-in min-h-screen md:pl-[var(--rail)]"
          style={view.type === 'home' ? { paddingLeft: 0, ['--gutter' as string]: 'calc(var(--rail) + 44px)' } : undefined}>
          {view.type === 'home' && <Home server={server} sections={allSections} refreshKey={refreshKey} onPlay={play} onOpen={open} onBrowse={(kind, tab) => push({ type: 'browse', kind, tab })} onOpenSettings={() => setLayer('settings')} />}
          {view.type === 'browse' && <BrowseIndex server={server} sections={sections} tab={view.tab} kind={view.kind} section={view.section} onBack={back}
            onGenre={(genre) => push({ type: 'list', title: genre, subtitle: view.section ? view.section.title : view.tab === 'all' ? undefined : ({ movie: 'Movies', show: 'TV Shows', anime: 'Anime' } as Record<string, string>)[view.tab], source: { kind: 'genre', tab: view.tab, genre, sectionKey: view.section?.key } })}
            onCollection={(c) => push({ type: 'list', title: c.title.replace(/^_+/, ''), subtitle: 'Collection', source: { kind: 'collection', id: c.ratingKey } })} />}
          {view.type === 'list' && listLoader && <ListView server={server} title={view.title} subtitle={view.subtitle} load={listLoader} onOpen={open} onBack={back} />}
          {view.type === 'library' && <Library server={server} token={token} section={view.section} onOpen={open}
            onBrowse={(kind) => push({ type: 'browse', kind, tab: view.section.type === 'movie' ? 'movie' : 'show', section: view.section })}
            onCollection={(c) => push({ type: 'list', title: c.title.replace(/^_+/, ''), subtitle: 'Collection', source: { kind: 'collection', id: c.ratingKey } })} />}
          {view.type === 'dashboard' && server.owned && <Dashboard server={server} onOpen={open} />}
          {view.type === 'guide' && settings.tvGuide && <TVGuide server={server} sections={sections} scope={me.key} onLeave={() => navigate({ type: 'home' })} />}
          {view.type === 'watchlist' && <Watchlist server={server} token={token} sections={allSections} onOpen={open} />}
          {view.type === 'search' && <Search server={server} token={token} sections={allSections} onOpen={open} />}
        </main>
      </FocusContext.Provider>

      {details.length > 0 && <Detail key={details[details.length - 1] + refreshKey} ratingKey={details[details.length - 1]} server={server} token={token}
        onClose={() => setDetails((d) => d.slice(0, -1))} onPlay={play} onOpen={open} onCollection={openCollection} />}
      {layer === 'profile' && <ProfileMenu profiles={profiles} currentName={me.name} onClose={() => setLayer(null)} onSwitch={onSwitch}
        onSettings={() => setLayer('settings')} onSignOut={onSignOut} />}
      {layer === 'settings' && <SettingsModal server={server} token={token} sections={allSections} profileName={me.name} profileThumb={me.thumb} onClose={() => setLayer(null)} />}
      {menu && <ItemMenu item={menu.item} server={server} fromContinue={menu.fromContinue} fromRecs={menu.fromRecs} onNotInterested={() => notInterested(menu.item)} onSelect={menu.onSelect} onClose={() => setMenu(undefined)}
        onPlay={() => play(menu.item)} onInfo={() => open(menu.item)} onToggleWatched={() => toggleWatched(menu.item)} onRemoveContinue={() => removeContinue(menu.item)} />}
      {playing && <Player key={playing.ratingKey} server={server} media={playing} onClose={closePlayer} onPlayNext={playNext} />}

      {toast && <div className="pop fixed bottom-8 left-1/2 z-[80] -translate-x-1/2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black shadow-2xl">{toast}</div>}
    </ItemMenuContext.Provider>
  )
}

/** First run for a profile: choose libraries, then favourite genres, then the app. */
function Gate(props: Parameters<typeof Main>[0]) {
  const { settings, update } = useSettings()
  const [step, setStep] = useState<'libraries' | 'genres'>(props.allSections.length > 1 ? 'libraries' : 'genres')
  const need = !settings.setupDone
  useEffect(() => { if (need) setBooted(true) }, [need]) // let the setup screens show instead of the loading screen
  if (need && step === 'libraries') return <LibrarySetup sections={props.allSections} hidden={settings.hiddenLibraries} name={props.me.name} thumb={props.me.thumb}
    onDone={(hiddenKeys) => { update({ hiddenLibraries: hiddenKeys }); setStep('genres') }} />
  if (need) return <GenreSetup server={props.server} sections={props.allSections.filter((s) => !settings.hiddenLibraries.includes(s.key))} name={props.me.name} thumb={props.me.thumb}
    onDone={(genres) => { update({ genres, setupDone: true }); setBooted(false) }} />
  return <Main {...props} />
}

function Session({ token, onToken, onSignOut }: { token: string; onToken: (t: string) => void; onSignOut: () => void }) {
  const [server, setServer] = useState<PlexServer>()
  const [sections, setSections] = useState<PlexSection[]>([])
  const [profiles, setProfiles] = useState<PlexProfile[]>([])
  const [me, setMe] = useState<Me>()
  const [error, setError] = useState<string>()
  const [needsPick, setNeedsPick] = useState(false)
  const [shared, setShared] = useState<{ tmdbKey?: string; overseerrUrl?: string }>({})
  const demoPick = useRef<PlexProfile | undefined>(undefined)

  // A TMDB key sealed for this particular server unlocks only when you're connected to it.
  const serverId = server?.id
  useEffect(() => {
    let alive = true
    const sealed = sealedKeys as { tmdb?: Sealed; overseerr?: Sealed }
    // `?demo&requests` previews the request flow with a fake service.
    if (serverId === 'demo-server' && location.search.includes('requests')) { setShared({ tmdbKey: 'demo', overseerrUrl: 'https://requests.demo' }); return }
    Promise.all([unseal(sealed.tmdb, serverId, 'tmdb'), unseal(sealed.overseerr, serverId, 'overseerr')])
      .then(([tmdbKey, overseerrUrl]) => alive && setShared({ tmdbKey: tmdbKey ?? undefined, overseerrUrl: overseerrUrl ?? undefined }))
    return () => { alive = false }
  }, [serverId])

  const connect = useCallback(async () => {
    setError(undefined); setServer(undefined); setBooted(false)
    try {
      // First sign-in on this device with more than one profile: ask who's watching before anything else.
      const ps = await getProfiles(token)
      if (ps.length > 1 && !isChosen()) { setProfiles(ps); setNeedsPick(true); setBooted(true); return }
      setNeedsPick(false)
      const [servers, user] = await Promise.all([getServers(token), token === 'demo' && demoPick.current ? Promise.resolve({ title: demoPick.current.title, thumb: demoPick.current.thumb, uuid: demoPick.current.uuid }) : getCurrentUser(token)])
      if (!servers[0]) return setError('No Plex servers found on this account.')
      setSections(await getSections(servers[0]))
      setServer(servers[0]); setProfiles(ps); setMe({ name: user.title, thumb: user.thumb, key: user.uuid ?? user.title })
    } catch (e) { setError(String(e)); setBooted(true) }
  }, [token])
  useEffect(() => { connect() }, [connect])

  // Moved to a different network (home -> away)? Re-pick the best route to the server: local, then direct remote, then relay.
  useEffect(() => {
    if (!server || token === 'demo') return
    let busy = false, last = Date.now()
    const recheck = async (force: boolean) => {
      if (busy || (!force && Date.now() - last < 60_000)) return
      busy = true; last = Date.now()
      try { const s = (await getServers(token))[0]; if (s && s.uri !== server.uri) { invalidateCache(); setServer(s) } } catch { /* offline: keep what we have */ } finally { busy = false }
    }
    const onOnline = () => recheck(true), onFocus = () => recheck(false)
    window.addEventListener('online', onOnline); window.addEventListener('focus', onFocus)
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('focus', onFocus) }
  }, [server, token])

  const pick = async (p: PlexProfile, pin?: string) => {
    const t = token === 'demo' ? 'demo' : await switchProfile(token, p.uuid, pin) // a wrong PIN throws here, before anything is remembered
    markChosen(); invalidateCache(); demoPick.current = p
    setNeedsPick(false)
    if (t !== token) onToken(t); else connect()
  }

  const switchTo = async (p: PlexProfile, pin?: string) => {
    const t = token === 'demo' ? 'demo' : await switchProfile(token, p.uuid, pin)
    invalidateCache()
    setMe({ name: p.title, thumb: p.thumb, key: p.uuid })
    if (t !== token) onToken(t)
  }

  if (error) return (
    <div className="grid h-screen place-items-center px-8 text-center">
      <div><p className="mb-6 text-lg text-white/70">{error}</p>
        <button onClick={connect} className="rounded-full bg-white px-6 py-2.5 font-bold text-black">Try again</button>
        <button onClick={onSignOut} className="ml-3 rounded-full bg-white/10 px-6 py-2.5 font-semibold">Sign out</button></div>
    </div>
  )
  if (needsPick) return <ProfilePicker profiles={profiles} onPick={pick} onSignOut={onSignOut} />
  if (!server || !me) return null // the animated loading screen (rendered by App) covers this

  return (
    <SettingsProvider profileKey={me.key} shared={shared}>
      <Gate key={me.key} token={token} server={server} allSections={sections} profiles={profiles} me={me} onSwitch={switchTo} onSignOut={onSignOut} />
    </SettingsProvider>
  )
}

export default function App() {
  const [token, setToken] = useState(() => (DEMO ? 'demo' : localStorage.getItem('plex_token')))
  const onToken = useCallback((t: string) => { if (!DEMO) localStorage.setItem('plex_token', t); setToken(t) }, [])
  const signOut = () => { localStorage.removeItem('plex_token'); store.removeItem(CHOSEN_KEY); invalidateCache(); setToken(null) }
  const booted = useBooted()
  return (
    <>
      {token ? <Session token={token} onToken={onToken} onSignOut={signOut} /> : <Login onToken={onToken} />}
      <LoadingScreen visible={!!token && !booted} />
      <UpdatePrompt />
    </>
  )
}
