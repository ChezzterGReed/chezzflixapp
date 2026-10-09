import { useEffect, useRef, useState } from 'react'
import { setFocus } from '@noriginmedia/norigin-spatial-navigation'
import { Hero, HeroSkeleton } from '../components/Hero'
import { TrendingBanner } from '../components/TrendingBanner'
import { Row, RowSkeleton } from '../components/Row'
import { Layers, Settings as Cog, Tags, TrendingUp } from 'lucide-react'
import { Focusable } from '../components/Focusable'
import { setBooted } from '../lib/boot'
import { animeEnabled, loadAnime, loadHero, loadRows, type AnimeInfo, type HomeNotice, type HomeRow, type Tab } from '../lib/homeData'
import type { PlexMedia, PlexSection, PlexServer } from '../lib/plex'
import { useSeason, useSettings } from '../lib/settings'

interface Props { server: PlexServer; sections: PlexSection[]; refreshKey: number; onPlay: (m: PlexMedia) => void; onOpen: (m: PlexMedia) => void; onBrowse: (kind: 'genres' | 'collections', tab: Tab) => void; onOpenSettings: () => void }

const TABS: { id: Tab; label: string }[] = [{ id: 'all', label: 'Home' }, { id: 'trending', label: 'Trending' }, { id: 'movie', label: 'Movies' }, { id: 'show', label: 'Shows' }, { id: 'anime', label: 'Anime' }]
const TAB_KEY = 'chezzflix_home_tab'

export function Home({ server, sections, refreshKey, onPlay, onOpen, onBrowse, onOpenSettings }: Props) {
  const { settings } = useSettings()
  const season = useSeason()
  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem(TAB_KEY) as Tab) || 'all')
  const [rows, setRows] = useState<HomeRow[]>()
  const [hero, setHero] = useState<PlexMedia[]>()
  const [anime, setAnime] = useState<AnimeInfo>()
  const [error, setError] = useState<string>()
  const [rowsAnime, setRowsAnime] = useState<AnimeInfo>()
  const [notices, setNotices] = useState<HomeNotice[]>([])
  const focusedOnce = useRef(false)
  const heroFor = useRef('')

  useEffect(() => { try { sessionStorage.setItem(TAB_KEY, tab) } catch { /* ignore */ } }, [tab])

  // Only this profile's visible libraries count towards the anime tab.
  const visible = sections.filter((s) => !settings.hiddenLibraries.includes(s.key))
  const showAnime = animeEnabled(anime)
  const activeTab: Tab = tab === 'anime' && anime && !showAnime ? 'all' : tab

  // Rows
  useEffect(() => {
    let alive = true
    setError(undefined)
    const animeP = loadAnime(server, visible, refreshKey)
    animeP.then((a) => alive && setAnime(a)).catch(() => {})
    ;(activeTab === 'all' || activeTab === 'trending' ? Promise.resolve(undefined) : animeP.catch(() => undefined))
      .then(async (a) => { const r = await loadRows(server, sections, activeTab, settings, a, season); if (alive) { setRowsAnime(a); setNotices(r.notices); setRows(r.rows) } })
      .catch((e) => { if (alive) { setError(String(e)); setBooted(true) } })
    return () => { alive = false }
  }, [server, sections, activeTab, settings.homeRows, settings.hiddenLibraries, settings.hideWatched, settings.tmdbKey, settings.dismissedContinue, season, refreshKey])

  // Hero (re-rolled when the tab or library set changes, not on every row tweak)
  useEffect(() => {
    if (!rows) return
    // Trending has a banner instead of a hero.
    if (activeTab === 'trending') { setHero([]); return }
    const sig = `${activeTab}|${settings.hiddenLibraries.join(',')}|${refreshKey}`
    if (heroFor.current === sig && hero) return
    heroFor.current = sig
    let alive = true
    loadHero(server, sections, activeTab, settings, rows, rowsAnime).then((h) => alive && setHero(h)).catch(() => alive && setHero([]))
    return () => { alive = false }
  }, [rows])

  // The loading screen lifts once the first hero is ready (or we know there isn't one).
  useEffect(() => { if (hero) setBooted(true) }, [hero])
  useEffect(() => { const t = setTimeout(() => setBooted(true), 20_000); return () => clearTimeout(t) }, [])

  useEffect(() => {
    if (activeTab === 'trending' && rows && !focusedOnce.current) { focusedOnce.current = true; setTimeout(() => setFocus('tab-trending'), 60) }
  }, [rows, activeTab])

  useEffect(() => {
    if (hero?.length && !focusedOnce.current) { focusedOnce.current = true; setTimeout(() => setFocus('hero-play'), 60) }
  }, [hero])

  const switchTab = (t: Tab) => { if (t === activeTab) return; setRows(undefined); setHero(undefined); heroFor.current = ''; setTab(t) }

  if (error) return <div className="grid h-screen place-items-center px-8 text-center text-white/70">Couldn't load your library.<br />{error}</div>

  return (
    <div className="relative pb-24">
      <div className="absolute left-[var(--gutter)] top-7 z-20 flex items-center gap-3">
        <div className="flex gap-1 rounded-full bg-black/35 p-1 backdrop-blur-xl">
          {TABS.filter((t) => t.id !== 'anime' || showAnime).map((t) => (
            <Focusable key={t.id} focusKey={`tab-${t.id}`} onEnter={() => switchTab(t.id)} title={t.label} leftToRail={t.id === 'all'}>
              <div className={`rounded-full px-5 py-2 text-[0.92rem] font-semibold transition-colors group-hover/f:bg-white/15 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${activeTab === t.id ? 'bg-accent text-black' : 'text-white/65'}`}>{t.label}</div>
            </Focusable>
          ))}
        </div>
      </div>

      {activeTab === 'trending'
        ? <TrendingBanner server={server} posters={(rows ?? []).filter((r) => r.id.startsWith('builtin:tmdb')).flatMap((r) => r.items)} count={(rows ?? []).filter((r) => r.id.startsWith('builtin:tmdb')).reduce((n, r) => n + r.items.length, 0)} loading={!rows} />
        : hero?.length ? <Hero key={activeTab} items={hero} server={server} rotate={settings.heroRotate} onPlay={onPlay} onInfo={onOpen} />
          : hero ? <div className="h-28" /> : <HeroSkeleton />}
      <div className="relative z-10 pt-2">
        {!rows
          ? <><RowSkeleton landscape /><RowSkeleton /><RowSkeleton /></>
          : rows.length === 0
            ? <p className="px-[var(--gutter)] py-16 text-white/55">Nothing to show here yet. Try another tab, or turn rows back on in Settings → Home.</p>
            : rows.map((r) => <Row key={r.id} title={r.title} items={r.items} server={server} variant={r.continue ? 'landscape' : 'poster'} themed={season === 'halloween' && r.title === 'Spooky Season'} onSelect={(m) => r.continue ? onPlay(m) : onOpen(m)} />)}

        {rows && activeTab === 'trending' && notices.map((n) => (
          <div key={n.kind} className="mx-[var(--gutter)] mb-8 flex max-w-3xl items-center gap-5 rounded-2xl bg-white/6 p-5 ring-1 ring-white/10">
            <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent/20 text-accent"><TrendingUp size={24} /></div>
            <div className="min-w-0 flex-1 text-[0.95rem] leading-relaxed text-white/75">
              {n.kind === 'tmdb-key' && <>See what's trending this week, filtered to what's in your library. It uses TMDB (free) — add your key to turn it on.</>}
              {n.kind === 'tmdb-error' && <>Couldn't load trending: {n.message} Check your TMDB key in Settings.</>}
              {n.kind === 'tmdb-empty' && <>None of this week's trending titles are in your library right now.</>}
            </div>
            {n.kind !== 'tmdb-empty' && (
              <Focusable onEnter={onOpenSettings} title="Open settings">
                <div className="flex shrink-0 items-center gap-2 rounded-full bg-white/12 px-5 py-2.5 text-sm font-semibold transition-colors group-hover/f:bg-white/25 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><Cog size={16} />Open settings</div>
              </Focusable>
            )}
          </div>
        ))}

        {/* Explore: under the last row of content */}
        {rows && activeTab !== 'trending' && (
          <div className="mt-4 flex flex-wrap gap-3 px-[var(--gutter)]">
            <Focusable focusKey="explore-genres" onEnter={() => onBrowse('genres', activeTab)} title="Explore genres" leftToRail>
              <div className="flex items-center gap-2.5 rounded-2xl bg-white/8 px-6 py-4 text-[1.02rem] font-bold transition-all group-hover/f:bg-white/16 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black group-data-[hl=true]/f:scale-105"><Tags size={20} className="text-accent group-data-[hl=true]/f:text-black" />Explore Genres</div>
            </Focusable>
            <Focusable focusKey="explore-collections" onEnter={() => onBrowse('collections', activeTab)} title="Explore collections">
              <div className="flex items-center gap-2.5 rounded-2xl bg-white/8 px-6 py-4 text-[1.02rem] font-bold transition-all group-hover/f:bg-white/16 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black group-data-[hl=true]/f:scale-105"><Layers size={20} className="text-accent group-data-[hl=true]/f:text-black" />Explore Collections</div>
            </Focusable>
          </div>
        )}
      </div>
    </div>
  )
}
