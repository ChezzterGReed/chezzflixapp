import type { ReactNode } from 'react'
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

function Tab({ id, active, icon, label, onEnter, round }: { id: TopTab; active: boolean; icon?: ReactNode; label?: string; onEnter: () => void; round?: boolean }) {
  return (
    <Focusable focusKey={`mtab-${id}`} onEnter={onEnter} title={label ?? id} onArrow={(d) => { if (d === 'down') { setFocus(id === 'libraries' && doesFocusableExist('lib-current') ? 'lib-current' : 'MAIN'); return false } if (d === 'up') return false }}>
      <div className={`flex h-12 items-center justify-center gap-2 rounded-full text-[1.02rem] font-semibold transition-colors duration-200 group-hover/f:bg-white/15 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${round ? 'w-12' : 'px-6'} ${active ? 'bg-white/18 text-white' : 'text-white/65'}`}>
        {icon}{label}
      </div>
    </Focusable>
  )
}

/** The Minimal layout's navigation: one centred row of tabs along the top. */
export function TopBar({ view, tvGuide, trending, watchlist, onGo, onSettings }: { view: View; tvGuide: boolean; trending: boolean; /** Something is on the Watchlist. */ watchlist: boolean; onGo: (v: View) => void; onSettings: () => void }) {
  const { ref, focusKey } = useFocusable({ focusKey: 'TOPBAR', saveLastFocusedChild: true, trackChildren: true })
  const cur = tabOf(view)
  return (
    <FocusContext.Provider value={focusKey}>
      <nav ref={ref} className="pointer-events-none fixed inset-x-0 top-0 z-[45] flex justify-center pt-6">
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-black/45 p-1.5 shadow-[0_10px_40px_-10px_rgba(0,0,0,.8)] ring-1 ring-white/10 backdrop-blur-xl">
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
    <div className="fixed bottom-7 right-10 z-[44]">
      <Focusable focusKey="mprofile" onEnter={onOpen} title="Profile" onArrow={(d) => { if (d === 'up' || d === 'left') { setFocus('MAIN'); return false } if (d === 'down' || d === 'right') return false }}>
        <div className="relative rounded-full p-1 transition-all duration-200 group-hover/f:scale-105 group-data-[hl=true]/f:scale-110 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]">
          <Avatar name={name} thumb={thumb} size={46} />
          {update && <UpdateDot className="absolute right-0 top-0" />}
        </div>
      </Focusable>
    </div>
  )
}
