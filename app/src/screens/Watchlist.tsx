import { useEffect, useRef, useState } from 'react'
import { useGridNav } from '../lib/gridNav'
import { ArrowDown, ArrowUp, BookmarkMinus, Check, CheckSquare, ChevronDown, Info, Plus, Tags } from 'lucide-react'
import { setFocus } from '@noriginmedia/norigin-spatial-navigation'
import { Focusable } from '../components/Focusable'
import { Layer } from '../components/Layer'
import { CheckMark, SelectionBar } from '../components/SelectionBar'
import { PosterCard, focusRing } from '../components/Card'
import { RequestDetail } from '../components/RequestDetail'
import { normalizeBase, type RequestItem } from '../lib/overseerr'
import { reveal } from '../lib/scroll'
import { searchTmdb } from '../lib/tmdb'
import { useSettings } from '../lib/settings'
import { getWatchlist, matchLibrary, setOnWatchlist, type WatchItem } from '../lib/watchlist'
import type { PlexMedia, PlexSection, PlexServer } from '../lib/plex'

type SortKey = 'added' | 'name' | 'released'
/** Each sort has a usual direction (dir 1) and its reverse (dir -1); choosing the active sort again flips it. */
const SORTS: { id: SortKey; label: string; ways: [string, string] }[] = [
  { id: 'added', label: 'Date added', ways: ['Newest', 'Oldest'] }, { id: 'name', label: 'Name', ways: ['A–Z', 'Z–A'] }, { id: 'released', label: 'Release date', ways: ['Newest', 'Oldest'] },
]
const sortName = (t: string) => t.replace(/^(the|a|an)\s+/i, '').toLowerCase()

function MenuItem({ icon, label, onEnter, danger }: { icon: React.ReactNode; label: string; onEnter: () => void; danger?: boolean }) {
  return (
    <Focusable onEnter={onEnter} title={label}>
      <div className={`flex h-12 items-center gap-3 rounded-xl px-3.5 text-[0.95rem] font-semibold transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${danger ? 'text-red-300 group-data-[hl=true]/f:text-red-700' : ''}`}>{icon}{label}</div>
    </Focusable>
  )
}


/** A Watchlist title that isn't in the library. */
function RemoteCard({ item, onEnter, onLongPress, selecting, checked }: { item: WatchItem; onEnter: () => void; onLongPress?: () => void; selecting?: boolean; checked?: boolean }) {
  return (
    <Focusable onEnter={onEnter} onLongPress={onLongPress ?? onEnter} onFocus={(el) => reveal(el)} title={`${item.title} — not in your library`} className="w-full shrink-0">
      <div className={`relative aspect-[2/3] overflow-hidden rounded-xl bg-surface ${focusRing} ${selecting && checked ? 'ring-4 ring-accent' : ''}`}>
        {selecting && <CheckMark checked={!!checked} />}
        {item.poster
          ? <img src={item.poster} alt={item.title} loading="lazy" decoding="async" draggable={false} className="absolute inset-0 h-full w-full object-cover brightness-[.8]" />
          : <div className="absolute inset-0 grid place-items-center bg-linear-to-br from-white/10 to-white/[0.03] p-4 text-center text-lg font-bold text-white/70">{item.title}</div>}
        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/40 to-transparent px-2.5 pb-2.5 pt-10">
          <div className="inline-flex rounded-full bg-white/20 px-2.5 py-1 text-[0.72rem] font-extrabold uppercase tracking-wide">Not in library</div>
        </div>
      </div>
      <div className="mt-2.5 px-0.5 opacity-70 transition-opacity group-data-[hl=true]/f:opacity-100 group-hover/f:opacity-100">
        <div className="truncate text-[0.95rem] font-semibold leading-tight">{item.title}</div>
        <div className="mt-0.5 truncate text-[0.8rem] text-white/60">{[item.year, item.type === 'show' ? 'Series' : 'Movie'].filter(Boolean).join(' · ')}</div>
      </div>
    </Focusable>
  )
}

interface Props { server: PlexServer; token: string; sections: PlexSection[]; onOpen: (m: PlexMedia) => void }

/** Your Plex Watchlist: titles you saved on Plex. Ones in your library open directly; others can be requested. Hold OK on a title to remove it. */
export function Watchlist({ server, token, sections, onOpen }: Props) {
  const { settings } = useSettings()
  const canRequest = settings.requests && !!settings.tmdbKey && !!settings.overseerrUrl
  const [items, setItems] = useState<WatchItem[]>()
  const [local, setLocal] = useState<Map<string, PlexMedia>>(new Map())
  const [error, setError] = useState(false)
  const [menu, setMenu] = useState<WatchItem>()
  const [confirm, setConfirm] = useState<WatchItem[]>()
  const [tab, setTab] = useState<'all' | 'movie' | 'show'>('all')
  const [matched, setMatched] = useState(false)   // the list has been compared with the library (sorting and genres wait for that)
  const [sort, setSort] = useState<SortKey>('added')
  const [dir, setDir] = useState<1 | -1>(1)
  const [genre, setGenre] = useState<string>()
  const [genreMenu, setGenreMenu] = useState(false)
  const page = useRef<HTMLDivElement>(null)
  useGridNav(page)
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [requesting, setRequesting] = useState<RequestItem>()

  useEffect(() => {
    let alive = true
    setMatched(false)
    getWatchlist(token, true).then(async (list) => {
      if (!alive) return
      setItems(list)
      const m = await matchLibrary(server, sections, list).catch(() => new Map<string, PlexMedia>())
      if (alive) { setLocal(m); setMatched(true) }
    }).catch(() => alive && (setError(true), setItems([])))
    return () => { alive = false }
  }, [server, token, sections])

  const remove = async (gone: WatchItem[]) => {
    setConfirm(undefined); setSelecting(false); setPicked(new Set())
    const keys = new Set(gone.map((x) => x.key))
    setItems((l) => l?.filter((x) => !keys.has(x.key)))
    await Promise.all(gone.map((i) => setOnWatchlist(token, i, false).catch(() => {})))
  }
  const togglePick = (k: string) => setPicked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const cancelSelect = () => { setSelecting(false); setPicked(new Set()) }
  const request = async (i: WatchItem) => {
    setMenu(undefined)
    const hits = await searchTmdb(settings.tmdbKey, i.title).catch(() => [])
    const hit = hits.find((h) => h.type === (i.type === 'show' ? 'tv' : 'movie') && (!i.year || !h.year || Math.abs(h.year - i.year) <= 1)) ?? hits[0]
    if (hit) setRequesting(hit)
  }

  // Genres and release date come from your library's copy when you have it, otherwise from Plex's own record of the title.
  const genresOf = (i: WatchItem) => local.get(i.key)?.Genre?.map((g) => g.tag) ?? i.genres ?? []
  const releasedOf = (i: WatchItem) => local.get(i.key)?.originallyAvailableAt ?? i.released ?? (i.year ? `${i.year}-01-01` : '')
  const ofType = (items ?? []).filter((x) => tab === 'all' || x.type === tab)
  const genreCounts = new Map<string, number>()
  for (const i of ofType) for (const g of new Set(genresOf(i))) genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1)
  const genreList = [...genreCounts].sort((a, b) => a[0].localeCompare(b[0]))
  const activeGenre = genre && genreCounts.has(genre) ? genre : undefined
  const shown = (() => {
    type Row = { i: WatchItem; pos: number }
    const rows: Row[] = ofType.map((i, pos) => ({ i, pos })).filter(({ i }) => !activeGenre || genresOf(i).includes(activeGenre))
    const cmp: Record<SortKey, (a: Row, b: Row) => number> = {
      added: (a, b) => a.pos - b.pos,   // (Plex lists the Watchlist newest first)
      name: (a, b) => sortName(a.i.title).localeCompare(sortName(b.i.title)),
      released: (a, b) => releasedOf(b.i).localeCompare(releasedOf(a.i)),
    }
    return rows.sort((a, b) => dir * cmp[sort](a, b) || a.pos - b.pos).map((x) => x.i)
  })()
  const pickSort = (id: SortKey) => { if (id === sort) setDir((d) => (d === 1 ? -1 : 1)); else { setSort(id); setDir(1) } }

  const onList = menu ? local.get(menu.key) : undefined
  return (
    <div ref={page} className="px-[var(--gutter)] pb-24 pt-14">
      <h1 className="fade-up text-[2.6rem] font-extrabold tracking-[-0.03em]">Watchlist</h1>
      <p className="mb-5 mt-1 text-white/55">{items ? `${items.length} title${items.length === 1 ? '' : 's'} on your Plex Watchlist · hold OK on one for options, or choose Select to pick several` : ' '}</p>
      <div className="mb-7 flex gap-2">
        {([['all', 'All'], ['movie', 'Movies'], ['show', 'TV Shows']] as const).map(([id, label], n) => (
          <Focusable key={id} focusKey={`wl-tab-${id}`} onEnter={() => setTab(id)} title={label} leftToRail={n === 0}>
            <div className={`rounded-full px-5 py-2 text-[0.95rem] font-semibold transition-colors group-hover/f:bg-white/20 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${tab === id ? 'bg-accent text-black' : 'bg-white/10 text-white/70'}`}>{label}{items ? <span className="ml-2 opacity-60">{id === 'all' ? items.length : items.filter((x) => x.type === id).length}</span> : null}</div>
          </Focusable>
        ))}
      </div>
      {matched && items && items.length > 1 && (
        <div className="mb-7 flex flex-wrap items-center gap-2">
          {SORTS.map((o, n) => (
            <Focusable key={o.id} leftToRail={n === 0} focusKey={`wl-sort-${o.id}`} onEnter={() => pickSort(o.id)} title={sort === o.id ? `${o.label}: ${o.ways[dir === 1 ? 0 : 1]}. Choose again to reverse.` : `Sort by ${o.label.toLowerCase()}`}>
              <div className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors group-hover/f:bg-white/20 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${sort === o.id ? 'bg-white/90 text-black' : 'bg-white/10 text-white/70'}`}>
                {o.label}{sort === o.id && <span className="flex items-center gap-0.5 opacity-70">{dir === 1 ? <ArrowDown size={14} /> : <ArrowUp size={14} />}<span className="text-xs">{o.ways[dir === 1 ? 0 : 1]}</span></span>}
              </div>
            </Focusable>
          ))}
          <span className="mx-1 h-5 w-px bg-white/15" />
          <Focusable focusKey="wl-genre" onEnter={() => setGenreMenu(true)} title="Filter by genre">
            <div className={`flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors group-hover/f:bg-white/20 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${activeGenre ? 'bg-accent text-black' : 'bg-white/10 text-white/70'}`}><Tags size={15} />{activeGenre ?? 'Genre'}<ChevronDown size={14} /></div>
          </Focusable>
          {activeGenre && <Focusable onEnter={() => setGenre(undefined)} title="Clear the genre filter"><div className="rounded-full bg-white/10 px-3.5 py-2 text-sm font-semibold text-white/70 transition-colors group-hover/f:bg-white/20 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">Clear</div></Focusable>}
        </div>
      )}
      <div className="grid gap-x-4 gap-y-8 [grid-template-columns:repeat(auto-fill,minmax(var(--card-w),1fr))]">
        {!items ? Array.from({ length: 12 }, (_, i) => <div key={i} className="skeleton aspect-[2/3] rounded-xl" />)
          : shown.map((i) => {
            const m = local.get(i.key)
            return <div key={i.key} data-grid-cell className="[--card-w:100%]">
              {m ? <PosterCard m={m} server={server} selecting={selecting} checked={picked.has(i.key)} onEnter={() => (selecting ? togglePick(i.key) : onOpen(m))} onLongPress={() => (selecting ? togglePick(i.key) : setMenu(i))} onFocus={(el) => reveal(el)} />
                : <RemoteCard item={i} selecting={selecting} checked={picked.has(i.key)} onEnter={() => (selecting ? togglePick(i.key) : setMenu(i))} onLongPress={() => (selecting ? togglePick(i.key) : setMenu(i))} />}
            </div>
          })}
      </div>
      {items && items.length > 0 && activeGenre && shown.length === 0 && <p className="py-16 text-white/55">Nothing with that genre here.</p>}
      {items && items.length > 0 && !items.some((x) => tab === 'all' || x.type === tab) && <p className="py-16 text-white/55">{tab === 'movie' ? 'No movies on your Watchlist.' : 'No TV shows on your Watchlist.'}</p>}
      {items && items.length === 0 && <p className="py-16 text-white/55">{error ? "Couldn't load your Watchlist right now." : 'Nothing here yet. Open a movie or show and choose Watchlist to save it.'}</p>}

      {genreMenu && (
        <Layer onClose={() => { setGenreMenu(false); setTimeout(() => setFocus('wl-genre'), 30) }} scrim="bg-black/55 backdrop-blur-sm" className="absolute left-1/2 top-1/2 w-[min(380px,92vw)] -translate-x-1/2 -translate-y-1/2">
          <div className="pop rounded-3xl bg-[#17171c]/95 p-2 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10 backdrop-blur-2xl">
            <div className="px-3.5 pb-2 pt-3 text-lg font-bold">Genre</div>
            <div className="max-h-[56vh] overflow-y-auto overscroll-contain [scrollbar-width:none]">
              {[['', ofType.length] as [string, number], ...genreList].map(([g, n]) => (
                <Focusable key={g || 'all'} focusKey={`wl-g-${g || 'all'}`} onEnter={() => { setGenre(g || undefined); setGenreMenu(false); setTimeout(() => setFocus('wl-genre'), 30) }} title={g || 'All genres'}>
                  <div className="flex h-12 items-center gap-3 rounded-xl px-3.5 text-[0.95rem] font-semibold transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><span className="flex-1">{g || 'All genres'}</span><span className="text-sm opacity-50">{n}</span>{(g || undefined) === activeGenre && <Check size={18} />}</div>
                </Focusable>
              ))}
            </div>
          </div>
        </Layer>
      )}
      {menu && (
        <Layer onClose={() => setMenu(undefined)} scrim="bg-black/55 backdrop-blur-sm" className="absolute left-1/2 top-1/2 w-[min(380px,92vw)] -translate-x-1/2 -translate-y-1/2">
          <div className="pop overflow-hidden rounded-3xl bg-[#17171c]/95 p-2 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10 backdrop-blur-2xl">
            <div className="px-3.5 pb-2 pt-3"><div className="truncate text-[1.02rem] font-bold">{menu.title}</div><div className="text-sm text-white/55">{[menu.year, menu.type === 'show' ? 'Series' : 'Movie'].filter(Boolean).join(' · ')}</div></div>
            <div className="space-y-0.5">
              {onList && <MenuItem icon={<Info size={20} />} label="More info" onEnter={() => { setMenu(undefined); onOpen(onList) }} />}
              {!onList && canRequest && <MenuItem icon={<Plus size={20} />} label="Request" onEnter={() => request(menu)} />}
              <MenuItem icon={<CheckSquare size={20} />} label="Select" onEnter={() => { setSelecting(true); setPicked(new Set([menu.key])); setMenu(undefined) }} />
              <MenuItem danger icon={<BookmarkMinus size={20} />} label="Remove from Watchlist" onEnter={() => { setConfirm([menu]); setMenu(undefined) }} />
            </div>
          </div>
        </Layer>
      )}
      {confirm && (
        <Layer onClose={() => setConfirm(undefined)} scrim="bg-black/60" className="absolute left-1/2 top-1/2 w-[min(400px,92vw)] -translate-x-1/2 -translate-y-1/2">
          <div className="pop rounded-3xl bg-[#17171c]/95 p-6 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10 backdrop-blur-2xl">
            <div className="text-[1.1rem] font-bold">{confirm.length === 1 ? 'Remove from Watchlist?' : `Remove ${confirm.length} titles?`}</div>
            <p className="mt-1.5 text-sm text-white/60">{confirm.length === 1 ? `“${confirm[0].title}” will be taken off your Plex Watchlist.` : `${confirm.length} titles will be taken off your Plex Watchlist.`}</p>
            <div className="mt-5 flex gap-2.5">
              <Focusable focusKey="wl-no" onEnter={() => setConfirm(undefined)} title="No">
                <div className="rounded-full bg-white/10 px-7 py-2.5 text-sm font-semibold transition-colors group-hover/f:bg-white/20 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">No</div>
              </Focusable>
              <Focusable focusKey="wl-yes" onEnter={() => remove(confirm)} title="Yes, remove">
                <div className="rounded-full bg-red-500/20 px-7 py-2.5 text-sm font-bold text-red-200 transition-colors group-hover/f:bg-red-500/30 group-data-[hl=true]/f:bg-red-500 group-data-[hl=true]/f:text-white">Yes, remove</div>
              </Focusable>
            </div>
          </div>
        </Layer>
      )}
      <SelectionBar active={selecting} count={picked.size} noun={picked.size === 1 ? 'title' : 'titles'} onCancel={cancelSelect}
        actions={[{ label: 'Remove from Watchlist', icon: <BookmarkMinus size={20} />, danger: true, disabled: picked.size === 0, onEnter: () => setConfirm((items ?? []).filter((x) => picked.has(x.key))) }]} />
      {requesting && <RequestDetail item={requesting} base={normalizeBase(settings.overseerrUrl)} plexToken={token} tmdbKey={settings.tmdbKey} onClose={() => setRequesting(undefined)} />}
    </div>
  )
}
