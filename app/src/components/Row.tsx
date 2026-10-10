import { useRef } from 'react'
import { reveal, scrollTo } from '../lib/scroll'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { LandscapeCard, PosterCard } from './Card'
import { Focusable } from './Focusable'
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
  /** A short line under the title saying why these are here. */
  subtitle?: string
  /** Personalized row: titles can be dismissed with "Not interested". */
  fromRecs?: boolean
  /** Continue Watching row (gives titles the "Remove from Continue Watching" menu). */
  fromContinue?: boolean
  /** A last tile that opens the full list ("See all 42"). */
  onMore?: () => void
  moreLabel?: string
}

export function Row({ title, items, server, variant = 'poster', onSelect, themed, subtitle, fromRecs, fromContinue, onMore, moreLabel }: Props) {
  const { ref, focusKey } = useFocusable({ saveLastFocusedChild: true, autoRestoreFocus: false })
  const track = useRef<HTMLDivElement>(null)

  // Keep the focused card centred in the row and the row comfortably in view.
  const focusReveal = (el: HTMLElement) => reveal(el, { block: 'center', inline: 'center' })
  const nudge = (dir: -1 | 1) => { const t = track.current; if (t) scrollTo(t, 'x', t.scrollLeft + dir * t.clientWidth * 0.8) }

  return (
    <FocusContext.Provider value={focusKey}>
      <section ref={ref} className="group/row relative mb-9">
        <h2 className={`${subtitle ? 'mb-0.5' : 'mb-3'} px-[var(--gutter)] text-[1.35rem] font-bold tracking-tight ${themed ? 'text-accent drop-shadow-[0_0_14px_var(--accent)]' : ''}`}>{themed && <Pumpkin size={26} className="mr-2 inline-block -translate-y-0.5" />}{title}</h2>
        {subtitle && <p className="mb-3 px-[var(--gutter)] text-sm text-white/45">{subtitle}</p>}
        <div className="relative">
          <div ref={track} className="flex gap-4 overflow-x-auto px-[var(--gutter)] py-5 -my-5">
            {items.map((m, idx) => variant === 'landscape'
              ? <LandscapeCard key={m.ratingKey} m={m} server={server} onEnter={() => onSelect(m)} onFocus={focusReveal} leftEdge={idx === 0} />
              : <PosterCard key={m.ratingKey} m={m} server={server} onEnter={() => onSelect(m)} onFocus={focusReveal} leftEdge={idx === 0} fromRecs={fromRecs} fromContinue={fromContinue} />)}
            {onMore && (
              <Focusable onEnter={onMore} onFocus={focusReveal} title={moreLabel ?? 'See all'} className="w-[var(--card-w)] shrink-0">
                <div className="grid aspect-[2/3] place-items-center rounded-xl bg-white/[0.06] p-4 text-center ring-1 ring-white/10 transition-all group-hover/f:bg-white/12 group-data-[hl=true]/f:scale-[1.06] group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">
                  <div><div className="text-3xl font-extrabold">→</div><div className="mt-2 font-bold">{moreLabel ?? 'See all'}</div></div>
                </div>
              </Focusable>
            )}
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
