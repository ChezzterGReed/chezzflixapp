import { useState } from 'react'
import { Radio } from 'lucide-react'
import { Focusable } from './Focusable'
import { focusRing } from './Card'
import { imageUrl, type PlexServer } from '../lib/plex'
import type { HolidayId, HolidayRowData, HolidayShow } from '../lib/holidayEpisodes'

export type HolidayAction = { kind: 'show'; id: HolidayId; show: string } | { kind: 'all'; id: HolidayId } | { kind: 'tune'; id: HolidayId } | { kind: 'play'; id: HolidayId; show: string }

/** What a holiday row holds, in order: up to four shows, then "Tune In", then "Explore all". */
export function holidayEntries(row: HolidayRowData): { key: string; action: HolidayAction; show?: HolidayShow }[] {
  return [
    ...row.shows.map((s) => ({ key: `s-${s.key}`, action: { kind: 'show', id: row.id, show: s.key } as HolidayAction, show: s })),
    { key: 'tune', action: { kind: 'tune', id: row.id } as HolidayAction },
    { key: 'all', action: { kind: 'all', id: row.id } as HolidayAction },
  ]
}

/** A 16:9 card of a holiday row: a show (a darkened still from one of its episodes), the Tune In tile, or the Explore all tile. */
export function HolidayCard({ entry, row, server, minimal, focusKey, onEnter, onFocus, onUp, leftEdge }: {
  entry: ReturnType<typeof holidayEntries>[number]; row: HolidayRowData; server: PlexServer; minimal?: boolean; focusKey?: string
  onEnter: () => void; onFocus: (el: HTMLElement) => void; onUp?: () => boolean; leftEdge?: boolean
}) {
  const [loaded, setLoaded] = useState(false)
  const s = entry.show
  const img = s ? imageUrl(server, s.still ?? s.art ?? s.thumb, 640, 360) : undefined
  const shell = minimal
    ? 'relative h-[var(--mh)] aspect-video overflow-hidden rounded-2xl transition-[transform,box-shadow] duration-200 ease-out group-data-[hl=true]/f:scale-[1.07] group-data-[hl=true]/f:shadow-[0_0_0_3px_#fff,0_18px_40px_-8px_rgba(0,0,0,.8)]'
    : `relative aspect-video overflow-hidden rounded-xl ${focusRing}`
  const label = s ? s.title : entry.action.kind === 'tune' ? 'Tune In' : 'Explore all'
  return (
    <Focusable focusKey={focusKey} onEnter={onEnter} onFocus={onFocus} title={label} leftToRail={leftEdge} className={minimal ? 'shrink-0' : 'w-[var(--land-w)] shrink-0'}
      onArrow={onUp ? (d) => { if (d === 'up') return onUp() } : undefined}>
      <div className={`${shell} ${s ? 'bg-surface' : entry.action.kind === 'tune' ? 'bg-accent text-black' : 'bg-white/10 ring-1 ring-white/15'}`}>
        {s && img && <img src={img} alt="" loading="lazy" decoding="async" draggable={false} onLoad={() => setLoaded(true)} className={`absolute inset-0 size-full object-cover brightness-[.38] saturate-[.8] transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`} />}
        {s && <div className="absolute inset-0 bg-black/25" />}
        {s && (
          <div className="absolute inset-0 grid place-content-center justify-items-center gap-1.5 px-4 text-center">
            <div className="line-clamp-2 font-display text-[1.5rem] uppercase leading-[1.05] tracking-[0.08em] drop-shadow-lg">{s.title}</div>
            <div className="text-[0.8rem] font-semibold text-white/70">{s.count} episodes</div>
          </div>
        )}
        {!s && entry.action.kind === 'tune' && (
          <div className="absolute inset-0 grid place-content-center justify-items-center gap-1.5 text-center">
            <Radio size={30} />
            <div className="font-display text-[1.5rem] uppercase leading-none tracking-[0.1em]">Tune In</div>
            <div className="text-[0.82rem] font-semibold opacity-75">Watch it live now</div>
          </div>
        )}
        {!s && entry.action.kind === 'all' && (
          <div className="absolute inset-0 grid place-content-center justify-items-center gap-1.5 text-center">
            <div className="text-3xl font-extrabold leading-none">→</div>
            <div className="font-display text-[1.5rem] uppercase leading-none tracking-[0.1em]">Explore all</div>
            <div className="text-[0.82rem] font-semibold text-white/65">{row.all.length} show{row.all.length === 1 ? '' : 's'}</div>
          </div>
        )}
      </div>
    </Focusable>
  )
}
