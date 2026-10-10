import { useEffect, useMemo, useRef, useState } from 'react'
import { setFocus } from '@noriginmedia/norigin-spatial-navigation'
import { AlphaRail, alphaOf } from '../components/AlphaRail'
import { useGridNav } from '../lib/gridNav'
import { reveal } from '../lib/scroll'
import { PosterCard } from '../components/Card'
import { SortBar } from '../components/SortBar'
import { BackButton } from '../components/BackButton'
import type { PlexMedia, PlexServer, SortKey } from '../lib/plex'

const titleOf = (m: PlexMedia) => (m as { titleSort?: string }).titleSort || m.title
const released = (m: PlexMedia) => m.originallyAvailableAt ?? `${m.year ?? 0}`

interface Props { server: PlexServer; title: string; subtitle?: string; load: () => Promise<PlexMedia[]>; onOpen: (m: PlexMedia) => void; onBack: () => void }

/** A grid of titles loaded all at once (a genre or a collection), sorted and filtered in the browser. */
export function ListView({ server, title, subtitle, load, onOpen, onBack }: Props) {
  const [items, setItems] = useState<PlexMedia[]>()
  const [sort, setSort] = useState<SortKey>('added')
  const [year, setYear] = useState<number>()
  const page = useRef<HTMLDivElement>(null)
  useGridNav(page)

  useEffect(() => { let alive = true; load().then((r) => alive && setItems(r)).catch(() => alive && setItems([])); return () => { alive = false } }, [load])

  const years = useMemo(() => [...new Set((items ?? []).map((m) => m.year).filter((y): y is number => !!y))].sort((a, b) => b - a), [items])
  const shown = useMemo(() => {
    const list = (items ?? []).filter((m) => !year || m.year === year)
    const cmp: Record<SortKey, (a: PlexMedia, b: PlexMedia) => number> = {
      titleAsc: (a, b) => titleOf(a).localeCompare(titleOf(b)),
      titleDesc: (a, b) => titleOf(b).localeCompare(titleOf(a)),
      added: (a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0),
      released: (a, b) => released(b).localeCompare(released(a)),
    }
    return [...list].sort(cmp[sort])
  }, [items, sort, year])

  // Jump-to-letter strip for long lists in A-Z (or Z-A) order.
  const alpha = sort === 'titleAsc' || sort === 'titleDesc'
  const letters = useMemo(() => {
    const set = [...new Set(shown.map((m) => alphaOf(titleOf(m))))].sort((a, b) => (a === '#' ? -1 : b === '#' ? 1 : a.localeCompare(b)))
    return sort === 'titleDesc' ? set.reverse() : set
  }, [shown, sort])
  const pickLetter = (l: string) => {
    const hit = shown.find((m) => alphaOf(titleOf(m)) === l)
    const fk = hit && document.querySelector<HTMLElement>(`[data-rk="${hit.ratingKey}"] [data-fk]`)?.getAttribute('data-fk')
    if (fk) setFocus(fk)
  }

  return (
    <div ref={page} className="px-[var(--gutter)] pb-24 pt-10">
      {alpha && shown.length > 40 && <AlphaRail letters={letters} onPick={pickLetter} />}
      <BackButton onBack={onBack} />
      <div className="fade-up mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[2.6rem] font-extrabold tracking-[-0.03em]">{title}</h1>
          <p className="mt-1 text-white/55">{items ? `${shown.length.toLocaleString()} title${shown.length === 1 ? '' : 's'}${subtitle ? ` · ${subtitle}` : ''}` : ' '}</p>
        </div>
        <SortBar sort={sort} onSort={setSort} years={years} year={year} onYear={setYear} />
      </div>
      <div className="grid gap-x-4 gap-y-8 [grid-template-columns:repeat(auto-fill,minmax(var(--card-w),1fr))]">
        {!items ? Array.from({ length: 12 }, (_, i) => <div key={i} className="skeleton aspect-[2/3] rounded-xl" />)
          : shown.map((m) => (
            <div key={m.ratingKey} data-grid-cell data-rk={m.ratingKey} className="[--card-w:100%]">
              <PosterCard m={m} server={server} onEnter={() => onOpen(m)} onFocus={(el) => reveal(el)} />
            </div>
          ))}
      </div>
      {items && shown.length === 0 && <p className="py-16 text-white/55">Nothing matches. Try another year.</p>}
    </div>
  )
}
