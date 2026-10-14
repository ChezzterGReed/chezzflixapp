import { useRef } from 'react'
import { Play } from 'lucide-react'
import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { Focusable } from './Focusable'
import { focusRing } from './Card'
import { reveal } from '../lib/scroll'
import { formatRuntime, imageUrl, type PlexMedia, type PlexServer } from '../lib/plex'

const KINDS: Record<string, string> = { trailer: 'Trailer', behindTheScenes: 'Behind the scenes', interview: 'Interview', featurette: 'Featurette', deletedScene: 'Deleted scene', scene: 'Scene', short: 'Short', clip: 'Clip', other: 'Extra' }
const kindOf = (m: PlexMedia) => KINDS[m.subtype ?? ''] ?? (m.subtype ? m.subtype.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()) : 'Extra')

/** Trailers and extras for a title: a row of clips that play right away. */
export function ExtrasRow({ items, server, onPlay }: { items: PlexMedia[]; server: PlexServer; onPlay: (m: PlexMedia) => void }) {
  const { ref, focusKey } = useFocusable({ saveLastFocusedChild: true, autoRestoreFocus: false })
  const track = useRef<HTMLDivElement>(null)
  return (
    <FocusContext.Provider value={focusKey}>
      <section ref={ref} className="relative mb-9">
        <h2 className="mb-3 px-[var(--gutter)] text-[1.35rem] font-bold tracking-tight">Trailers &amp; extras</h2>
        <div ref={track} className="flex gap-4 overflow-x-auto px-[var(--gutter)] py-5 -my-5">
          {items.map((m, i) => (
            <Focusable key={m.ratingKey} onEnter={() => onPlay(m)} onFocus={(el) => reveal(el, { block: 'center', inline: 'center' })} title={`${kindOf(m)}: ${m.title}`} leftToRail={i === 0} className="w-[var(--land-w)] shrink-0">
              <div className={`relative aspect-video overflow-hidden rounded-xl bg-surface ${focusRing}`}>
                {m.thumb && <img src={imageUrl(server, m.thumb, 640, 360)} alt="" loading="lazy" draggable={false} className="absolute inset-0 size-full object-cover" />}
                <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/15 to-transparent" />
                <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-wider text-white/85">{kindOf(m)}</span>
                <span className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-white/20 backdrop-blur"><Play size={16} fill="white" /></span>
                <div className="absolute inset-x-3.5 bottom-3">
                  <div className="truncate text-[0.95rem] font-bold leading-tight drop-shadow">{m.title}</div>
                  {m.duration ? <div className="mt-0.5 text-[0.78rem] text-white/75">{formatRuntime(m.duration)}</div> : null}
                </div>
              </div>
            </Focusable>
          ))}
        </div>
      </section>
    </FocusContext.Provider>
  )
}
