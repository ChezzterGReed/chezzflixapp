import { useTitleSelection } from '../components/Bulk'
import { AlphaRail, alphaOf } from '../components/AlphaRail'
import { useGridNav } from '../lib/gridNav'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { reveal } from '../lib/scroll'
import { Eye, EyeOff, Layers, Loader2, Shuffle, Tags, X } from 'lucide-react'
import { PosterCard } from '../components/Card'
import { SortBar } from '../components/SortBar'
import { Focusable } from '../components/Focusable'
import { orderByNewestEpisode } from '../lib/newSeason'
import { getAllSectionItems, getCollections, getFirstCharacters, getSectionItems, getYears, isWatched, type PlexCollectionRef, type PlexMedia, type PlexSection, type PlexServer, type SortKey } from '../lib/plex'
import { useSettings } from '../lib/settings'
import { pendingFocus } from '../lib/layout'
import { doesFocusableExist, setFocus } from '@noriginmedia/norigin-spatial-navigation'

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
  /** Play everything in the list (with its filters) in a random order. */
  onShuffle: (items: PlexMedia[]) => void
  onBrowse: (kind: 'genres' | 'collections') => void
  onCollection: (c: { ratingKey: string; title: string }) => void
}

export function Library({ server, token, section, onOpen, onShuffle, onBrowse, onCollection }: Props) {
  const { settings, update } = useSettings()
  const sel = useTitleSelection(server, token)
  const collapse = !!settings.collapseCollections[section.key]
  const unwatched = !!settings.unwatchedOnly[section.key]
  // The sort order and year are kept per library, for next time (and on the person's other devices).
  const saved = settings.libView?.[section.key]
  const [sort, setSortState] = useState<SortKey>((saved?.sort as SortKey) ?? 'titleAsc')
  const [year, setYearState] = useState<number | undefined>(saved?.year)
  const remember = (s: SortKey, y: number | undefined) => update({ libView: { ...settings.libView, [section.key]: { sort: s, year: y } } })
  const setSort = (s: SortKey) => { setSortState(s); remember(s, year) }
  const setYear = (y?: number) => { setYearState(y); remember(sort, y) }
  const filtered = year !== undefined || unwatched
  const clearFilters = () => { setYearState(undefined); remember(sort, undefined); if (unwatched) update({ unwatchedOnly: { ...settings.unwatchedOnly, [section.key]: false }, libView: { ...settings.libView, [section.key]: { sort, year: undefined } } }) }
  const [years, setYears] = useState<number[]>([])
  const [items, setItems] = useState<PlexMedia[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  // Only the rows near the screen exist in the page (a big library is thousands of posters; drawing them all makes every key press slow).
  // The rows above and below are empty space of the right height, so the scroll bar, scrolling and the letter jump all behave as if everything were there.
  const grid = useRef<HTMLDivElement>(null)
  const [geo, setGeo] = useState({ cols: 6, pitch: 340 })   // columns, and the height of a row including the gap below it (measured once rows exist)
  const [win, setWin] = useState({ first: 0, last: 7 })      // the rows that are drawn
  const focusRow = useRef(-1)
  const rowsTotal = Math.ceil(items.length / geo.cols)
  const place = useCallback(() => {
    const g = grid.current
    if (!g) return
    const top = g.getBoundingClientRect().top + window.scrollY
    const buf = window.innerHeight * 1.1
    let first = Math.floor((window.scrollY - buf - top) / geo.pitch), last = Math.ceil((window.scrollY + window.innerHeight + buf - top) / geo.pitch)
    const f = focusRow.current   // the cursor's neighbours are always there (if the scrolling hasn't caught up with the cursor yet, draw around the cursor)
    if (f >= 0) { if (f >= first + 1 && f <= last - 1) { first = Math.min(first, f - 4); last = Math.max(last, f + 4) } else { first = f - 8; last = f + 8 } }
    first = Math.max(0, first); last = Math.max(first + 1, last)
    setWin((w) => (w.first === first && w.last === last ? w : { first, last }))
  }, [geo.pitch])
  useEffect(() => {
    let raf = 0
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place) }
    window.addEventListener('scroll', on, { passive: true }); window.addEventListener('resize', on)
    place()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', on); window.removeEventListener('resize', on) }
  }, [place])
  // Measure the real number of columns and row height from what is drawn.
  const measure = useCallback(() => {
    const g = grid.current
    const cell = g?.querySelector<HTMLElement>('[data-grid-cell]')
    if (!g || !cell) return
    const cs = getComputedStyle(g)
    const cols = Math.max(1, cs.gridTemplateColumns.split(' ').filter(Boolean).length)
    const pitch = Math.round(cell.offsetHeight + (parseFloat(cs.rowGap) || 0))
    setGeo((o) => (o.cols === cols && Math.abs(o.pitch - pitch) < 2 ? o : { cols, pitch }))
  }, [])
  useLayoutEffect(() => { measure() }, [measure, items.length, win.first, win.last])
  useEffect(() => { const g = grid.current; if (!g) return; const ro = new ResizeObserver(measure); ro.observe(g); return () => ro.disconnect() }, [measure])
  useEffect(() => { setWin({ first: 0, last: 7 }); focusRow.current = -1; window.scrollTo({ top: 0, behavior: 'instant' }) }, [section.key, sort, year, collapse, unwatched])
  /** Scroll so the title at `index` is in the middle of the screen and drawn (the cursor can then be put on it). */
  const showIndex = useCallback((index: number) => {
    const g = grid.current
    if (!g || index < 0) return
    const row = Math.floor(index / geo.cols)
    focusRow.current = row
    window.scrollTo({ top: Math.max(0, g.getBoundingClientRect().top + window.scrollY + row * geo.pitch - window.innerHeight / 3), behavior: 'instant' })
    place()
  }, [geo, place])
  const focusItem = useCallback((m: PlexMedia, tries = 0) => {
    const k = `card-${m.ratingKey}`
    if (doesFocusableExist(k)) setFocus(k)
    else if (tries < 10) setTimeout(() => focusItem(m, tries + 1), 80)
  }, [])
  // Coming back to the library: the title the cursor was on has to be drawn again.
  useEffect(() => {
    const k = pendingFocus.key
    if (!k?.startsWith('card-') || !items.length) return
    const at = items.findIndex((m) => `card-${m.ratingKey}` === k)
    if (at >= 0) showIndex(at)
  }, [items.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const sentinel = useRef<HTMLDivElement>(null)
  const page = useRef<HTMLDivElement>(null)
  useGridNav(page)
  // Jump-to-letter strip: whenever the list is in A-Z (or Z-A) order and long enough to need it, with any filter on (it then lists the letters that are left).
  const [serverLetters, setServerLetters] = useState<{ l: string; n: number }[]>([])
  const [jumping, setJumping] = useState(false)
  const jumpTo = useRef<string | null>(null)
  useEffect(() => { if (collapse) return; let alive = true; getFirstCharacters(server, section.key, year, unwatched).then((l) => alive && setServerLetters(l)).catch(() => {}); return () => { alive = false } }, [server, section.key, year, unwatched, collapse])
  // Grouped collections: everything is already loaded, so the letters come straight from the tiles on screen.
  const letters = useMemo(() => (collapse ? [...new Set(items.map((m) => alphaOf((m as { titleSort?: string }).titleSort || m.title)))].sort((a, b) => (a === '#' ? -1 : b === '#' ? 1 : a.localeCompare(b))) : serverLetters.map((x) => x.l)), [collapse, items, serverLetters])
  const railOn = (sort === 'titleAsc' || sort === 'titleDesc') && total > 60
  const sortedLetters = sort === 'titleDesc' ? [...letters].reverse() : letters
  const focusLetter = (l: string) => {
    // Where the letter starts is counted from how many titles the server files under each letter before it (its sort order, not the shown title); grouped collections only have what's on screen.
    let at = -1
    if (!collapse && serverLetters.length) {
      const order = sort === 'titleDesc' ? [...serverLetters].reverse() : serverLetters
      let n = 0
      for (const x of order) { if (x.l === l) { at = n; break } n += x.n }
    }
    const hit = at >= 0 ? items[at] : items.find((m) => alphaOf((m as { titleSort?: string }).titleSort || m.title) === l)
    if (!hit) return
    showIndex(items.indexOf(hit))   // draw that part of the list, then land on the title
    setTimeout(() => focusItem(hit), 60)
  }
  const pickLetter = async (l: string) => {
    if (items.length < total) {   // not every title is loaded yet: load the lot (once), then jump
      setJumping(true)
      const all = await getAllSectionItems(server, section.key, sort, year, 8000, unwatched, true).catch(() => items)
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
    // "New episodes": the shows are ordered by their newest episode here (the server can't do that for us).
    const arrange = (list: PlexMedia[]) => (sort === 'newEpisodes' ? orderByNewestEpisode(server, section.key, list) : Promise.resolve(list))
    if (collapse) {
      Promise.all([getAllSectionItems(server, section.key, sort, year, 5000, unwatched, true).then(arrange), getCollections(server, section.key)]).then(([all, cols]) => {
        if (!alive) return
        const grouped = groupByCollection(all, cols).filter((m) => !unwatched || m.type === 'collection' || !isWatched(m))
        setItems(grouped); setTotal(grouped.length); setLoading(false)
      })
    } else if (sort === 'newEpisodes') {
      getAllSectionItems(server, section.key, sort, year, 5000, unwatched, true).then(arrange).then((list) => { if (alive) { setItems(list); setTotal(list.length); setLoading(false) } })
    } else {
      getSectionItems(server, section.key, sort, 0, PAGE, year, unwatched, true).then((r) => { if (alive) { setItems(r.items); setTotal(r.total); setLoading(false) } })
    }
    return () => { alive = false }
  }, [server, section.key, sort, year, collapse, unwatched])

  useEffect(() => {
    const el = sentinel.current
    if (!el || collapse) return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !loading && items.length < total) {
        setLoading(true)
        getSectionItems(server, section.key, sort, items.length, PAGE, year, unwatched, true).then((r) => { setItems((x) => [...x, ...r.items]); setLoading(false) })
      }
    }, { rootMargin: '1400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [items.length, total, loading, server, section.key, sort, year, collapse, unwatched])

  const noun = section.type === 'movie' ? 'movies' : 'shows'
  const count = useMemo(() => (collapse ? `${total.toLocaleString()} tiles · collections grouped` : `${total.toLocaleString()} ${unwatched ? `unwatched ${noun}` : noun}`) + (year ? ` from ${year}` : ''), [collapse, total, noun, year, unwatched])
  const [shuffling, setShuffling] = useState(false)
  // Everything the filters leave (not only what has scrolled into view), as movies: collections are only groupings.
  const shuffleAll = async () => {
    if (shuffling) return
    setShuffling(true)
    try {
      const all = items.length >= total && !collapse ? items : await getAllSectionItems(server, section.key, sort, year, 8000, unwatched, true)
      onShuffle(all.filter((m) => m.type === 'movie'))
    } catch { onShuffle([]) } finally { setShuffling(false) }
  }
  const toolBtn = 'flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors group-hover/f:bg-white/20 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black'

  return (
    <div ref={page} className="px-[var(--gutter)] pb-24 pt-14">
      {railOn && <AlphaRail letters={sortedLetters} onPick={pickLetter} busy={jumping} />}
      <div className={`fade-up mb-8 flex flex-wrap items-start justify-between gap-x-6 gap-y-5 ${railOn ? 'mr-12' : ''}`}>
        <div>
          <h1 className="text-[2.6rem] font-extrabold tracking-[-0.03em]">{section.title}</h1>
          <p className="mt-1 text-white/55">{loading && !items.length ? '\u00a0' : count}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Focusable onEnter={() => update({ unwatchedOnly: { ...settings.unwatchedOnly, [section.key]: !unwatched } })} title="Show unwatched only" leftToRail>
              <div className={`${toolBtn} ${unwatched ? 'bg-accent text-black' : 'bg-white/8 text-white/80'}`}>{unwatched ? <EyeOff size={15} /> : <Eye size={15} />}{unwatched ? 'Unwatched only' : 'All titles'}</div>
            </Focusable>
            {filtered && (
              <Focusable onEnter={clearFilters} title="Clear filters">
                <div className={`${toolBtn} bg-white/8 text-white/80`}><X size={15} />Clear filters</div>
              </Focusable>
            )}
            {section.type === 'movie' && (
              <Focusable onEnter={shuffleAll} title="Shuffle these movies">
                <div className={`${toolBtn} bg-white/8 text-white/80`}>{shuffling ? <Loader2 size={15} className="animate-spin" /> : <Shuffle size={15} />}Shuffle</div>
              </Focusable>
            )}
            <Focusable onEnter={() => onBrowse('genres')} title="Browse genres"><div className={`${toolBtn} bg-white/8 text-white/80`}><Tags size={15} />Genres</div></Focusable>
            <Focusable onEnter={() => onBrowse('collections')} title="Browse collections"><div className={`${toolBtn} bg-white/8 text-white/80`}><Layers size={15} />Collections</div></Focusable>
            <Focusable onEnter={() => update({ collapseCollections: { ...settings.collapseCollections, [section.key]: !collapse } })} title="Group collections">
              <div className={`${toolBtn} ${collapse ? 'bg-accent text-black' : 'bg-white/8 text-white/80'}`}>
                <Layers size={15} />{collapse ? 'Collections grouped' : 'Group collections'}
              </div>
            </Focusable>
          </div>
        </div>
        <div className="pt-1.5"><SortBar sort={sort} onSort={setSort} years={years} year={year} onYear={setYear} tv={section.type === 'show'} /></div>
      </div>
      <div ref={grid} className="grid gap-x-4 gap-y-8 [grid-template-columns:repeat(auto-fill,minmax(var(--card-w),1fr))]"
        style={{ paddingTop: Math.min(win.first, rowsTotal) * geo.pitch, paddingBottom: Math.max(0, rowsTotal - 1 - win.last) * geo.pitch }}>
        {items.slice(win.first * geo.cols, (win.last + 1) * geo.cols).map((m) => (
          <div key={m.ratingKey} data-grid-cell data-rk={m.ratingKey} className="[--card-w:100%]">
            {(() => {
              const pickable = m.type === 'movie' || m.type === 'show'
              return <PosterCard focusKey={`card-${m.ratingKey}`} m={m} server={server} onFocus={(el) => { focusRow.current = Math.floor(items.indexOf(m) / geo.cols); place(); reveal(el) }} selecting={sel.active && pickable} checked={sel.has(m)}
                onEnter={() => (sel.active ? pickable && sel.toggle(m) : m.type === 'collection' ? onCollection(m) : onOpen(m))}
                onLongPress={sel.active ? () => pickable && sel.toggle(m) : undefined} onSelect={pickable ? () => sel.start(m) : undefined} />
            })()}
          </div>
        ))}
        {loading && win.last >= rowsTotal - 1 && Array.from({ length: items.length ? 6 : 18 }, (_, i) => <div key={'s' + i} className="skeleton aspect-[2/3] rounded-xl" />)}
      </div>
      {!loading && items.length === 0 && <p className="py-16 text-white/55">{year ? `Nothing from ${year} here. Try another year.` : (unwatched ? 'Nothing unwatched here. You\'ve seen it all!' : 'This library is empty.')}</p>}
      <div ref={sentinel} className="h-px" />
      {sel.bar}
    </div>
  )
}
