import { useState } from 'react'
import { Leaf, Radio } from 'lucide-react'
import { Pumpkin } from './Pumpkin'
import { Ornament } from './Ornament'
import { Snowflake } from './Snowflake'
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

/** Little decorations for the corner and top of a show's card, to suit the holiday. */
function Deco({ id }: { id: HolidayId }) {
  if (id === 'halloween') return (
    <>
      <svg aria-hidden viewBox="0 0 60 60" className="pointer-events-none absolute left-0 top-0 w-14 text-white/35" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><path d="M0 0L58 0M0 0L0 58M0 0L52 26M0 0L40 40M0 0L26 52M14 0Q12 12 0 14M28 0Q22 22 0 28M42 0Q32 32 0 42" /></svg>
      <Pumpkin size={30} className="pointer-events-none absolute right-2 top-2 rotate-12 drop-shadow" />
      <Pumpkin size={18} className="pointer-events-none absolute bottom-2 left-2 -rotate-12 opacity-80 drop-shadow" />
    </>
  )
  if (id === 'christmas') return (
    <>
      <svg aria-hidden viewBox="0 0 200 20" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 top-0 h-5 w-full" fill="none">
        <path d="M0 3Q50 17 100 5T200 3" stroke="#14532d" strokeWidth="3" strokeLinecap="round" /><path d="M0 3Q50 17 100 5T200 3" stroke="#22803f" strokeWidth="1.6" strokeDasharray="1 3" strokeLinecap="round" />
        {[[22, 9, '#ef4444'], [55, 12, '#fbbf24'], [90, 9, '#60a5fa'], [128, 6, '#34d399'], [162, 8, '#ef4444'], [190, 5, '#fbbf24']].map(([x, y, c], n) => <circle key={n} className="twinkle" cx={x as number} cy={(y as number) + 3} r="2.2" fill={c as string} style={{ animationDelay: `${n * 0.35}s` }} />)}
      </svg>
      <Ornament size={26} className="pointer-events-none absolute bottom-2 right-2 drop-shadow" />
      <Snowflake size={18} className="pointer-events-none absolute bottom-2 left-2 opacity-70" />
    </>
  )
  return (
    <>
      <Leaf size={30} fill="currentColor" className="pointer-events-none absolute right-2 top-2 rotate-12 text-[#d9822b] drop-shadow" />
      <Leaf size={20} fill="currentColor" className="pointer-events-none absolute left-2 top-2 -rotate-[28deg] text-[#a8481b] drop-shadow" />
      <Leaf size={16} fill="currentColor" className="pointer-events-none absolute bottom-2 right-3 rotate-[70deg] text-[#d9a441] opacity-80" />
    </>
  )
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
        {s && <Deco id={row.id} />}
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
