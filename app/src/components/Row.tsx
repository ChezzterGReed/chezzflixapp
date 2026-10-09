import { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { LandscapeCard, PosterCard } from './Card'
import { Pumpkin } from './Pumpkin'
import type { PlexMedia, PlexServer } from '../lib/plex'

interface Props {
  title: string
  items: PlexMedia[]
  server: PlexServer
  variant?: 'poster' | 'landscape'
  onSelect: (m: PlexMedia) => void
  /** Seasonal styling for the title (e.g. Spooky Season). */
  themed?: boolean
}

export function Row({ title, items, server, variant = 'poster', onSelect, themed }: Props) {
  const { ref, focusKey } = useFocusable({ saveLastFocusedChild: true, autoRestoreFocus: false })
  const track = useRef<HTMLDivElement>(null)

  // Keep the focused card centred in the row and the row comfortably in view.
  const reveal = (el: HTMLElement) => el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
  const nudge = (dir: -1 | 1) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.8, behavior: 'smooth' })

  return (
    <FocusContext.Provider value={focusKey}>
      <section ref={ref} className="group/row relative mb-9">
        <h2 className={`mb-3 px-[var(--gutter)] text-[1.35rem] font-bold tracking-tight ${themed ? 'text-accent drop-shadow-[0_0_14px_var(--accent)]' : ''}`}>{themed && <Pumpkin size={26} className="mr-2 inline-block -translate-y-0.5" />}{title}</h2>
        <div className="relative">
          <div ref={track} className="flex snap-x gap-4 overflow-x-auto scroll-smooth px-[var(--gutter)] py-5 -my-5 [scroll-padding-inline:var(--gutter)]">
            {items.map((m, idx) => variant === 'landscape'
              ? <LandscapeCard key={m.ratingKey} m={m} server={server} onEnter={() => onSelect(m)} onFocus={reveal} leftEdge={idx === 0} />
              : <PosterCard key={m.ratingKey} m={m} server={server} onEnter={() => onSelect(m)} onFocus={reveal} leftEdge={idx === 0} />)}
          </div>
          {([-1, 1] as const).map((d) => (
            <button key={d} aria-label={d < 0 ? 'Scroll left' : 'Scroll right'} onClick={() => nudge(d)} tabIndex={-1}
              className={`absolute top-0 z-10 hidden h-[calc(100%-2.6rem)] w-12 items-center justify-center ${d < 0 ? 'bg-linear-to-r' : 'bg-linear-to-l'} from-black/70 to-transparent opacity-0 transition-opacity group-hover/row:opacity-100 md:flex ${d < 0 ? 'left-[var(--rail)]' : 'right-0'}`}>
              {d < 0 ? <ChevronLeft size={30} /> : <ChevronRight size={30} />}
            </button>
          ))}
        </div>
      </section>
    </FocusContext.Provider>
  )
}

export function RowSkeleton({ landscape }: { landscape?: boolean }) {
  return (
    <div className="mb-9">
      <div className="skeleton mb-3 ml-[var(--gutter)] h-6 w-52 rounded" />
      <div className="flex gap-4 overflow-hidden px-[var(--gutter)]">
        {Array.from({ length: 9 }, (_, i) => <div key={i} className={`skeleton shrink-0 rounded-xl ${landscape ? 'aspect-video w-[var(--land-w)]' : 'aspect-[2/3] w-[var(--card-w)]'}`} />)}
      </div>
    </div>
  )
}
