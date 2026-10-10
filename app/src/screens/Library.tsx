import { useTitleSelection } from '../components/Bulk'
import { AlphaRail, alphaOf } from '../components/AlphaRail'
import { useGridNav } from '../lib/gridNav'
import { useEffect, useMemo, useRef, useState } from 'react'
import { reveal } from '../lib/scroll'
import { Eye, EyeOff, Layers, Tags } from 'lucide-react'
import { PosterCard } from '../components/Card'
import { SortBar } from '../components/SortBar'
import { Focusable } from '../components/Focusable'
import { getAllSectionItems, getCollections, getFirstCharacters, getSectionItems, getYears, isWatched, type PlexCollectionRef, type PlexMedia, type PlexSection, type PlexServer, type SortKey } from '../lib/plex'
import { useSettings } from '../lib/settings'
import { setFocus } from '@noriginmedia/norigin-spatial-navigation'

const PAGE = 120

/** Collapse a library into collection tiles: one tile per collection, plus every title that isn't in one. */
function groupByCollection(items: PlexMedia[], cols: PlexCollectionRef[]): PlexMedia[] {
  // Collections named with a leading underscore (e.g. "_Trending Movies") are housekeeping lists, not groupings.
  const real = new Map(cols.filter((c) => !c.title.startsWith('_')).map((c) => [c.title, c]))
  const seen = new Set<string>()
  const out: PlexMedia[] = []
  for (const m of items) {
    const tag = (m.Collection ?? []).map((t) => t.tag).find((t) => real.has(t))
    if (!tag) { out.push(m); continue }
    if (seen.has(tag)) continue
    seen.add(tag)
    const c = real.get(tag)!
    out.push({ ratingKey: c.ratingKey, type: 'collection', title: c.title, thumb: c.thumb } as PlexMedia)
  }
  return out
}

interface Props {
  server: PlexServer; token: string; section: PlexSection
  onOpen: (m: PlexMedia) => void
  onBrowse: (kind: 'genres' | 'collections') => void
  onCollection: (c: { ratingKey: string; title: string }) => void
}

export function Library({ server, token, section, onOpen, onBrowse, onCollection }: Props) {
  const { settings, update } = useSettings()
  const sel = useTitleSelection(server, token)
  const collapse = !!settings.collapseCollections[section.key]
  const unwatched = !!settings.unwatchedOnly[section.key]
  const [sort, setSort] = useState<SortKey>('titleAsc')
  const [year, setYear] = useState<number>()
  const [years, setYears] = useState<number[]>([])
  const [items, setItems] = useState<PlexMedia[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const sentinel = useRef<HTMLDivElement>(null)
  const page = useRef<HTMLDivElement>(null)
  useGridNav(page)
  // Jump-to-letter strip: only when the list is in plain A-Z order (no filters), and long enough to need it.
  const [letters, setLetters] = useState<string[]>([])
  const [jumping, setJumping] = useState(false)
  const jumpTo = useRef<string | null>(null)
  useEffect(() => { let alive = true; getFirstCharacters(server, section.key).then((l) => alive && setLetters(l)); return () => { alive = false } }, [server, section.key])
  const railOn = (sort === 'titleAsc' || sort === 'titleDesc') && !collapse && !unwatched && !year && total > 60
  const sortedLetters = sort === 'titleDesc' ? [...letters].reverse() : letters
  const focusLetter = (l: string) => {
    const hit = items.find((m) => alphaOf((m as { titleSort?: string }).titleSort || m.title) === l)
    const el = hit && document.querySelector<HTMLElement>(`[data-rk="${hit.ratingKey}"] [data-fk]`)
    const fk = el?.getAttribute('data-fk')
    if (fk) setFocus(fk)
  }
  const pickLetter = async (l: string) => {
    if (items.length < total) {   // not every title is loaded yet: load the lot (once), then jump
      setJumping(true)
      const all = await getAllSectionItems(server, section.key, sort, undefined, 8000, false).catch(() => items)
      setItems(all); setTotal(all.length); setJumping(false)
      jumpTo.current = l
    } else focusLetter(l)
  }
  useEffect(() => { if (jumpTo.current && items.length >= total) { const l = jumpTo.current; jumpTo.current = null; setTimeout(() => focusLetter(l), 120) } }, [items]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { getYears(server, section.key).then(setYears) }, [server, section.key])

  // Expanded: page through the server list. Collapsed: load everything once and group it here.
  useEffect(() => {
    let alive = true
    setLoading(true); setItems([])
    if (collapse) {
      Promise.all([getAllSectionItems(server, section.key, sort, year, 5000, unwatched), getCollections(server, section.key)]).then(([all, cols]) => {
        if (!alive) return
        const grouped = groupByCollection(all, cols).filter((m) => !unwatched || m.type === 'collection' || !isWatched(m))
        setItems(grouped); setTotal(grouped.length); setLoading(false)
      })
    } else {
      getSectionItems(server, section.key, sort, 0, PAGE, year, unwatched).then((r) => { if (alive) { setItems(r.items); setTotal(r.total); setLoading(false) } })
    }
    return () => { alive = false }
  }, [server, section.key, sort, year, collapse, unwatched])

  useEffect(() => {
    const el = sentinel.current
    if (!el || collapse) return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !loading && items.length < total) {
        setLoading(true)
        getSectionItems(server, section.key, sort, items.length, PAGE, year, unwatched).then((r) => { setItems((x) => [...x, ...r.items]); setLoading(false) })
      }
    }, { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [items.length, total, loading, server, section.key, sort, year, collapse, unwatched])

  const noun = section.type === 'movie' ? 'movies' : 'shows'
  const count = useMemo(() => (collapse ? `${total.toLocaleString()} tiles · collections grouped` : `${total.toLocaleString()} ${unwatched ? `unwatched ${noun}` : noun}`) + (year ? ` from ${year}` : ''), [collapse, total, noun, year, unwatched])
  const toolBtn = 'flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors group-hover/f:bg-white/20 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black'

  return (
    <div ref={page} className="px-[var(--gutter)] pb-24 pt-14">
      {railOn && <AlphaRail letters={sortedLetters} onPick={pickLetter} busy={jumping} />}
      <div className="fade-up mb-8 flex flex-wrap items-start justify-between gap-x-6 gap-y-5">
        <div>
          <h1 className="text-[2.6rem] font-extrabold tracking-[-0.03em]">{section.title}</h1>
          <p className="mt-1 text-white/55">{loading && !items.length ? '\u00a0' : count}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Focusable onEnter={() => update({ unwatchedOnly: { ...settings.unwatchedOnly, [section.key]: !unwatched } })} title="Show unwatched only" leftToRail>
              <div className={`${toolBtn} ${unwatched ? 'bg-accent text-black' : 'bg-white/8 text-white/80'}`}>{unwatched ? <EyeOff size={15} /> : <Eye size={15} />}{unwatched ? 'Unwatched only' : 'All titles'}</div>
            </Focusable>
            <Focusable onEnter={() => onBrowse('genres')} title="Browse genres"><div className={`${toolBtn} bg-white/8 text-white/80`}><Tags size={15} />Genres</div></Focusable>
            <Focusable onEnter={() => onBrowse('collections')} title="Browse collections"><div className={`${toolBtn} bg-white/8 text-white/80`}><Layers size={15} />Collections</div></Focusable>
            <Focusable onEnter={() => update({ collapseCollections: { ...settings.collapseCollections, [section.key]: !collapse } })} title="Group collections">
              <div className={`${toolBtn} ${collapse ? 'bg-accent text-black' : 'bg-white/8 text-white/80'}`}>
                <Layers size={15} />{collapse ? 'Collections grouped' : 'Group collections'}
              </div>
            </Focusable>
          </div>
        </div>
        <div className="pt-1.5"><SortBar sort={sort} onSort={setSort} years={years} year={year} onYear={setYear} /></div>
      </div>
      <div className="grid gap-x-4 gap-y-8 [grid-template-columns:repeat(auto-fill,minmax(var(--card-w),1fr))]">
        {items.map((m) => (
          <div key={m.ratingKey} data-grid-cell data-rk={m.ratingKey} className="[--card-w:100%]">
            {(() => {
              const pickable = m.type === 'movie' || m.type === 'show'
              return <PosterCard m={m} server={server} onFocus={(el) => reveal(el)} selecting={sel.active && pickable} checked={sel.has(m)}
                onEnter={() => (sel.active ? pickable && sel.toggle(m) : m.type === 'collection' ? onCollection(m) : onOpen(m))}
                onLongPress={sel.active ? () => pickable && sel.toggle(m) : undefined} onSelect={pickable ? () => sel.start(m) : undefined} />
            })()}
          </div>
        ))}
        {loading && Array.from({ length: items.length ? 6 : 18 }, (_, i) => <div key={'s' + i} className="skeleton aspect-[2/3] rounded-xl" />)}
      </div>
      {!loading && items.length === 0 && <p className="py-16 text-white/55">{year ? `Nothing from ${year} here. Try another year.` : (unwatched ? 'Nothing unwatched here. You\'ve seen it all!' : 'This library is empty.')}</p>}
      <div ref={sentinel} className="h-px" />
      {sel.bar}
    </div>
  )
}
