import { useEffect, type ReactNode } from 'react'
import { getCurrentFocusKey } from '@noriginmedia/norigin-spatial-navigation'
import { tabDown } from '../lib/layout'
import { Search, Settings as Cog } from 'lucide-react'
import { FocusContext, doesFocusableExist, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { Focusable } from './Focusable'
import { Avatar } from './Avatar'
import { UpdateDot, useUpdatePending } from './UpdateDot'
import type { View } from './Sidebar'

export type TopTab = 'search' | 'home' | 'trending' | 'libraries' | 'watchlist' | 'guide' | 'settings'

/** Which top tab a screen belongs to. */
export function tabOf(view: View): TopTab | undefined {
  if (view.type === 'search') return 'search'
  if (view.type === 'home') return view.tab === 'trending' ? 'trending' : 'home'
  if (view.type === 'libraries' || view.type === 'library') return 'libraries'
  if (view.type === 'watchlist') return 'watchlist'
  if (view.type === 'guide') return 'guide'
  return undefined
}

/** Down from a tab: into the screen's content (the first title in a library, or wherever the screen says the cursor was). */
const tabNow = { k: '' }   // the tab of the screen on show
function goDown(id?: TopTab) {
  const first = id === 'libraries' ? document.querySelector<HTMLElement>('[data-grid-cell] [data-fk]')?.getAttribute('data-fk') ?? undefined : undefined
  const k = first ?? tabDown.fn?.() ?? undefined
  setFocus(k && doesFocusableExist(k) ? k : 'MAIN')
}

function Tab({ id, active, icon, label, onEnter, round }: { id: TopTab; active: boolean; icon?: ReactNode; label?: string; onEnter: () => void; round?: boolean }) {
  return (
    <Focusable focusKey={`mtab-${id}`} onEnter={onEnter} title={label ?? id} onArrow={(d) => { if (d === 'down') { goDown(id); return false } if (d === 'up') return false; if (d === 'left' && id === 'search') { setFocus('mprofile'); return false } }}>
      <div className={`flex h-12 items-center justify-center gap-2 rounded-full text-[1.02rem] font-semibold transition-colors duration-200 group-hover/f:bg-white/15 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${round ? 'w-12' : 'px-6'} ${active ? 'bg-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-white' : 'text-white/65'}`}>
        {icon}{label}
      </div>
    </Focusable>
  )
}

/** The Minimal layout's navigation: one centred row of tabs along the top. */
export function TopBar({ view, tvGuide, trending, watchlist, onGo, onSettings }: { view: View; tvGuide: boolean; trending: boolean; /** Something is on the Watchlist. */ watchlist: boolean; onGo: (v: View) => void; onSettings: () => void }) {
  const { ref, focusKey } = useFocusable({ focusKey: 'TOPBAR', saveLastFocusedChild: true, trackChildren: true })
  const cur = tabOf(view)
  tabNow.k = cur ? `mtab-${cur}` : ''
  // On any screen: Up from the top-most thing on it reaches the tabs.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || document.querySelector('[data-layer], [data-player]')) return
      const key = getCurrentFocusKey()
      if (!key || key === 'SN:ROOT' || key === 'TOPBAR' || key === 'mprofile' || key.startsWith('mtab-') || key.startsWith('mcard-') || key.startsWith('mtitle-') || key.startsWith('hero-')) return   // Minimal Home steps through its banner on its own
      const el = document.querySelector<HTMLElement>(`[data-fk="${key}"]`)
      if (!el) return
      const y = (n: Element) => { const r = n.getBoundingClientRect(); return (r.top + r.bottom) / 2 }
      const me = y(el)
      for (const n of document.querySelectorAll('[data-fk]')) {
        if (n === el || n.closest('nav') || n.getAttribute('data-fk') === 'mprofile') continue   // (the tabs and your picture float over the page: they aren't "above" its content)
        const r = n.getBoundingClientRect()
        if (r.width > 0 && r.height > 0 && y(n) < me - 12) return   // something is still above: the normal move handles it
      }
      const t = cur && doesFocusableExist(`mtab-${cur}`) ? `mtab-${cur}` : 'mtab-home'
      if (doesFocusableExist(t)) { e.preventDefault(); e.stopPropagation(); setFocus(t) }
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [cur])
  return (
    <FocusContext.Provider value={focusKey}>
      <nav ref={ref} className="pointer-events-none fixed inset-x-0 top-0 z-[45] flex justify-center pt-6">
        <div data-tabs className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-black/45 p-1.5 shadow-[0_10px_40px_-10px_rgba(0,0,0,.8)] ring-1 ring-[color-mix(in_srgb,var(--accent)_28%,transparent)] backdrop-blur-xl">
          <Tab id="search" round active={cur === 'search'} icon={<Search size={21} />} label={undefined} onEnter={() => onGo({ type: 'search' })} />
          <Tab id="home" active={cur === 'home'} label="Home" onEnter={() => onGo({ type: 'home' })} />
          {trending && <Tab id="trending" active={cur === 'trending'} label="Trending" onEnter={() => onGo({ type: 'home', tab: 'trending' })} />}
          <Tab id="libraries" active={cur === 'libraries'} label="Libraries" onEnter={() => onGo({ type: 'libraries' })} />
          {watchlist && <Tab id="watchlist" active={cur === 'watchlist'} label="Watchlist" onEnter={() => onGo({ type: 'watchlist' })} />}
          {tvGuide && <Tab id="guide" active={cur === 'guide'} label="TV Guide" onEnter={() => onGo({ type: 'guide' })} />}
          <Tab id="settings" round active={false} icon={<Cog size={21} />} onEnter={onSettings} />
        </div>
      </nav>
    </FocusContext.Provider>
  )
}

/** Your picture in the bottom-right corner: OK opens the profile switcher. */
export function MinimalProfile({ name, thumb, onOpen }: { name: string; thumb?: string; onOpen: () => void }) {
  const update = useUpdatePending()
  return (
    <div className="fixed left-10 top-[1.35rem] z-[46]">
      <Focusable focusKey="mprofile" onEnter={onOpen} title="Profile" onArrow={(d) => { if (d === 'right') { setFocus(tabNow.k && doesFocusableExist(tabNow.k) ? tabNow.k : 'mtab-home'); return false } if (d === 'down') { goDown(); return false } if (d === 'up' || d === 'left') return false }}>
        <div className="relative rounded-full p-1 transition-all duration-200 group-hover/f:scale-105 group-data-[hl=true]/f:scale-110 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]">
          <Avatar name={name} thumb={thumb} size={46} />
          {update && <UpdateDot className="absolute right-0 top-0" />}
        </div>
      </Focusable>
    </div>
  )
}
