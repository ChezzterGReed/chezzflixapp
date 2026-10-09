import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Focusable } from './Focusable'
import { focusRing } from './Card'
import type { RequestItem } from '../lib/overseerr'


/** A title that isn't in the library: same shape as a poster card, marked as requestable. */
export function RequestCard({ item, onEnter, onFocus }: { item: RequestItem; onEnter: () => void; onFocus: (el: HTMLElement) => void }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <Focusable onEnter={onEnter} onFocus={onFocus} title={`${item.title} — request`} className="w-[var(--card-w)] shrink-0">
      <div className={`relative aspect-[2/3] overflow-hidden rounded-xl bg-surface ${focusRing}`}>
        {!item.poster && <div className="absolute inset-0 grid place-items-center bg-linear-to-br from-white/10 to-white/[0.03] p-4 text-center text-lg font-bold text-white/70">{item.title}</div>}
        {item.poster && <>
          {!loaded && <div className="skeleton absolute inset-0" />}
          <img src={item.poster} alt={item.title} loading="lazy" decoding="async" draggable={false} onLoad={() => setLoaded(true)}
            className={`absolute inset-0 h-full w-full object-cover brightness-[.8] transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`} />
        </>}
        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/40 to-transparent px-2.5 pb-2.5 pt-10">
          <div className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[0.72rem] font-extrabold uppercase tracking-wide text-black"><Plus size={13} strokeWidth={3} />Request</div>
        </div>
      </div>
      <div className="mt-2.5 px-0.5 opacity-70 transition-opacity group-data-[hl=true]/f:opacity-100 group-hover/f:opacity-100">
        <div className="truncate text-[0.95rem] font-semibold leading-tight">{item.title}</div>
        <div className="mt-0.5 truncate text-[0.8rem] text-white/60">{[item.year, item.type === 'tv' ? 'Series' : 'Movie'].filter(Boolean).join(' · ')} · Not in your library</div>
      </div>
    </Focusable>
  )
}
