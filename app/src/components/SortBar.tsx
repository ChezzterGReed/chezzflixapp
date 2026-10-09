import { useState } from 'react'
import { CalendarDays, Check, X } from 'lucide-react'
import { Focusable } from './Focusable'
import { Layer } from './Layer'
import { SORTS, type SortKey } from '../lib/plex'

function Pill({ active, onEnter, children, title }: { active?: boolean; onEnter: () => void; children: React.ReactNode; title?: string }) {
  return (
    <Focusable onEnter={onEnter} title={title}>
      <div className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors group-hover/f:bg-white/20 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${active ? 'bg-accent text-black' : 'bg-white/8 text-white/65'}`}>{children}</div>
    </Focusable>
  )
}

function YearPicker({ years, year, onPick, onClose }: { years: number[]; year?: number; onPick: (y?: number) => void; onClose: () => void }) {
  return (
    <Layer onClose={onClose} className="absolute left-1/2 top-1/2 max-h-[80vh] w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2">
      <div className="pop flex max-h-[80vh] flex-col rounded-3xl bg-surface p-6 shadow-2xl ring-1 ring-white/10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-extrabold tracking-tight">Release year</h2>
          <Focusable onEnter={onClose} title="Close"><div className="grid size-9 place-items-center rounded-full transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><X size={18} /></div></Focusable>
        </div>
        <div className="grid grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-5">
          <Focusable onEnter={() => { onPick(undefined); onClose() }}>
            <div className={`col-span-2 grid h-11 place-items-center rounded-xl text-sm font-bold transition-colors group-hover/f:bg-white/20 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${!year ? 'bg-accent text-black' : 'bg-white/8'}`}>All years</div>
          </Focusable>
          {years.map((y) => (
            <Focusable key={y} onEnter={() => { onPick(y); onClose() }}>
              <div className={`flex h-11 items-center justify-center gap-1 rounded-xl text-sm font-bold tabular-nums transition-colors group-hover/f:bg-white/20 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${year === y ? 'bg-accent text-black' : 'bg-white/8'}`}>{y}{year === y && <Check size={14} />}</div>
            </Focusable>
          ))}
        </div>
      </div>
    </Layer>
  )
}

interface Props { sort: SortKey; onSort: (s: SortKey) => void; years: number[]; year?: number; onYear: (y?: number) => void }

/** Sort pills (A–Z, Z–A, recently added, release date) plus a release-year filter. */
export function SortBar({ sort, onSort, years, year, onYear }: Props) {
  const [picking, setPicking] = useState(false)
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(SORTS) as SortKey[]).map((k) => <Pill key={k} active={sort === k} onEnter={() => onSort(k)}>{SORTS[k].label}</Pill>)}
        <span className="mx-1 h-5 w-px bg-white/15" />
        <Pill active={!!year} onEnter={() => setPicking(true)} title="Filter by release year"><CalendarDays size={15} />{year ?? 'Year'}</Pill>
        {year && <Pill onEnter={() => onYear(undefined)} title="Clear year"><X size={14} />Clear</Pill>}
      </div>
      {picking && <YearPicker years={years} year={year} onPick={onYear} onClose={() => setPicking(false)} />}
    </>
  )
}
