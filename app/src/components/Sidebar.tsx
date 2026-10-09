import { useState, type ReactNode } from 'react'
import { reveal } from '../lib/scroll'
import { Bookmark, Film, LayoutGrid, Home, LayoutDashboard, Search, Tv } from 'lucide-react'
import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { Focusable } from './Focusable'
import { useInputMode, useTyping } from '../lib/input'
import { useSeason } from '../lib/settings'
import { Pumpkin } from './Pumpkin'
import { Layer } from './Layer'
import { Logo } from './Logo'
import { Avatar } from './Avatar'
import type { PlexSection } from '../lib/plex'
import type { HomeTab } from '../lib/settings'

export type ListSource = { kind: 'genre'; tab: HomeTab; genre: string; sectionKey?: string } | { kind: 'collection'; id: string }
export type View =
  | { type: 'home' } | { type: 'search' } | { type: 'watchlist' } | { type: 'dashboard' } | { type: 'library'; section: PlexSection }
  | { type: 'browse'; kind: 'genres' | 'collections'; tab: HomeTab; section?: PlexSection }
  | { type: 'list'; title: string; subtitle?: string; source: ListSource }

function NavItem({ icon, label, active, onEnter, focusKey }: { icon: ReactNode; label: string; active?: boolean; onEnter: () => void; focusKey?: string }) {
  return (
    <Focusable focusKey={focusKey} onEnter={onEnter} title={label} rightToContent onFocus={(el) => reveal(el, { block: 'nearest' })}>
      <div className={`relative flex h-12 items-center overflow-hidden rounded-xl transition-colors duration-200 group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${active ? 'text-white' : 'text-white/60'}`}>
        {active && <i className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-accent group-data-[hl=true]/f:bg-black" />}
        <span className="grid w-[52px] shrink-0 place-items-center">{icon}</span>
        <span className="whitespace-nowrap pr-5 text-[0.95rem] font-semibold opacity-0 transition-opacity duration-200 group-data-[open=true]/nav:opacity-100">{label}</span>
      </div>
    </Focusable>
  )
}

interface Props {
  sections: PlexSection[]
  view: View
  onNavigate: (v: View) => void
  profileName: string
  profileThumb?: string
  brand: string
  avatarLogo: boolean
  onProfile: () => void
  /** Server owner only. */
  showDashboard?: boolean
}

export function Sidebar({ sections, view, onNavigate, profileName, profileThumb, brand, avatarLogo, onProfile, showDashboard }: Props) {
  const mode = useInputMode()
  const typing = useTyping()
  const season = useSeason()
  const [hover, setHover] = useState(false)
  const { ref, focusKey, hasFocusedChild } = useFocusable({ focusKey: 'SIDEBAR', trackChildren: true, saveLastFocusedChild: true })
  // With a mouse, the rail follows the pointer; with a remote/keyboard it follows focus. (Fixes it staying open after you click away.)
  const open = hover || (hasFocusedChild && mode === 'key' && !typing)
  const isLib = (k: string) => view.type === 'library' && view.section.key === k
  // Only the first few libraries are listed; "View all" opens a scrollable picker with every one.
  const LIMIT = 5
  const [picker, setPicker] = useState(false)
  const listed = sections.slice(0, LIMIT)

  return (
    <FocusContext.Provider value={focusKey}>
      <nav ref={ref} data-open={open} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        className={`group/nav fixed inset-y-0 left-0 z-30 flex flex-col px-3 py-6 transition-[width] duration-300 ease-out-expo max-md:hidden ${open ? 'w-[264px]' : 'w-[var(--rail)]'}`}>
        {/* Soft scrim instead of a hard panel, so the artwork behind stays part of the page */}
        <div aria-hidden className={`pointer-events-none absolute inset-y-0 left-0 -z-10 bg-linear-to-r transition-all duration-500 ease-out-expo ${open ? 'w-[520px] from-black/95 via-black/80 via-45% to-transparent' : 'w-[160px] from-black/60 to-transparent'}`} />
        <div className="mb-6 flex h-14 items-center overflow-hidden">
          <span className="grid w-[52px] shrink-0 place-items-center">
            <span className="relative">
              {avatarLogo ? <Avatar name={profileName} thumb={profileThumb} size={34} /> : <Logo size={52} />}
              {season === 'halloween' && <Pumpkin size={21} className="absolute right-0.5 top-0 drop-shadow" />}
            </span>
          </span>
          <span className={`whitespace-nowrap font-display text-[1.4rem] leading-none tracking-[0.14em] transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}>{brand}</span>
        </div>

        <div className="space-y-1">
          <NavItem focusKey="nav-home" icon={<Home size={22} />} label="Home" active={view.type === 'home'} onEnter={() => onNavigate({ type: 'home' })} />
          <NavItem focusKey="nav-search" icon={<Search size={22} />} label="Search" active={view.type === 'search'} onEnter={() => onNavigate({ type: 'search' })} />
          <NavItem focusKey="nav-watchlist" icon={<Bookmark size={22} />} label="Watchlist" active={view.type === 'watchlist'} onEnter={() => onNavigate({ type: 'watchlist' })} />
        </div>

        {/* Libraries scroll on their own so a long list never pushes the profile button off screen */}
        <div className="mt-6 flex min-h-0 flex-1 flex-col">
          <div className={`mb-2 h-4 shrink-0 overflow-hidden whitespace-nowrap px-[18px] font-display text-[0.95rem] uppercase leading-4 tracking-[0.2em] text-white/85 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}>Libraries</div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain py-1">
            {listed.map((s) => (
              <NavItem key={s.key} focusKey={`nav-lib-${s.key}`} icon={s.type === 'movie' ? <Film size={22} /> : <Tv size={22} />} label={s.title} active={isLib(s.key)} onEnter={() => onNavigate({ type: 'library', section: s })} />
            ))}
          </div>
        </div>

        {picker && <LibraryPicker sections={sections} activeKey={view.type === 'library' ? view.section.key : undefined} onClose={() => setPicker(false)} onPick={(x) => { setPicker(false); onNavigate({ type: 'library', section: x }) }} />}

        <div className="mt-3 shrink-0">
          {sections.length > 0 && <div className="mb-1"><NavItem focusKey="nav-lib-more" icon={<LayoutGrid size={22} />} label="View all libraries" active={view.type === 'library' && sections.findIndex((x) => isLib(x.key)) >= LIMIT} onEnter={() => setPicker(true)} /></div>}
          {showDashboard && <div className="mb-1"><NavItem focusKey="nav-dashboard" icon={<LayoutDashboard size={22} />} label="Dashboard" active={view.type === 'dashboard'} onEnter={() => onNavigate({ type: 'dashboard' })} /></div>}
          <Focusable focusKey="nav-profile" onEnter={onProfile} title="Profile" rightToContent>
            <div className="flex h-14 items-center overflow-hidden rounded-xl transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">
              <span className="grid w-[52px] shrink-0 place-items-center"><Avatar name={profileName} thumb={profileThumb} size={32} /></span>
              <span className="whitespace-nowrap pr-5 text-[0.95rem] font-semibold opacity-0 transition-opacity duration-200 group-data-[open=true]/nav:opacity-100">{profileName}</span>
            </div>
          </Focusable>
        </div>
      </nav>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-white/10 bg-[#0d0d11]/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        {([
          { label: 'Home', icon: <Home size={22} />, active: view.type === 'home', go: () => onNavigate({ type: 'home' }) },
          { label: 'Search', icon: <Search size={22} />, active: view.type === 'search', go: () => onNavigate({ type: 'search' }) },
          { label: 'Watchlist', icon: <Bookmark size={22} />, active: view.type === 'watchlist', go: () => onNavigate({ type: 'watchlist' }) },
          ...sections.map((s) => ({ label: s.title, icon: s.type === 'movie' ? <Film size={22} /> : <Tv size={22} />, active: isLib(s.key), go: () => onNavigate({ type: 'library', section: s }) })),
          ...(showDashboard ? [{ label: 'Dashboard', icon: <LayoutDashboard size={22} />, active: view.type === 'dashboard', go: () => onNavigate({ type: 'dashboard' }) }] : []),
          { label: 'You', icon: <Avatar name={profileName} thumb={profileThumb} size={24} />, active: false, go: onProfile },
        ]).map((t) => (
          <button key={t.label} onClick={t.go} className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[0.68rem] font-semibold ${t.active ? 'text-white' : 'text-white/50'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </nav>
    </FocusContext.Provider>
  )
}

/** Every library in a scrollable popup: pick one to open it. */
function LibraryPicker({ sections, activeKey, onClose, onPick }: { sections: PlexSection[]; activeKey?: string; onClose: () => void; onPick: (s: PlexSection) => void }) {
  return (
    <Layer onClose={onClose} scrim="bg-black/60 backdrop-blur-sm" className="absolute left-1/2 top-1/2 w-[min(420px,92vw)] -translate-x-1/2 -translate-y-1/2">
      <div className="pop overflow-hidden rounded-3xl bg-[#17171c]/95 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10 backdrop-blur-2xl">
        <div className="px-5 pb-2 pt-5 font-display text-[1.4rem] tracking-[0.12em]">LIBRARIES</div>
        <div className="max-h-[min(60vh,520px)] space-y-0.5 overflow-y-auto overscroll-contain p-2 pt-1">
          {sections.map((s) => (
            <Focusable key={s.key} focusKey={`pick-lib-${s.key}`} onEnter={() => onPick(s)} title={s.title}>
              <div className={`flex h-12 items-center gap-3 rounded-xl px-3.5 text-[0.98rem] font-semibold transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${s.key === activeKey ? 'text-accent' : ''}`}>
                {s.type === 'movie' ? <Film size={20} /> : <Tv size={20} />}<span className="min-w-0 flex-1 truncate">{s.title}</span>
              </div>
            </Focusable>
          ))}
        </div>
      </div>
    </Layer>
  )
}
