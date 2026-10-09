import { useEffect, useState } from 'react'
import { BookmarkMinus, Info, Plus } from 'lucide-react'
import { Focusable } from '../components/Focusable'
import { Layer } from '../components/Layer'
import { PosterCard } from '../components/Card'
import { RequestDetail } from '../components/RequestDetail'
import { normalizeBase, type RequestItem } from '../lib/overseerr'
import { reveal } from '../lib/scroll'
import { searchTmdb } from '../lib/tmdb'
import { useSettings } from '../lib/settings'
import { getWatchlist, matchLibrary, setOnWatchlist, type WatchItem } from '../lib/watchlist'
import type { PlexMedia, PlexSection, PlexServer } from '../lib/plex'

function MenuItem({ icon, label, onEnter, danger }: { icon: React.ReactNode; label: string; onEnter: () => void; danger?: boolean }) {
  return (
    <Focusable onEnter={onEnter} title={label}>
      <div className={`flex h-12 items-center gap-3 rounded-xl px-3.5 text-[0.95rem] font-semibold transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${danger ? 'text-red-300 group-data-[hl=true]/f:text-red-700' : ''}`}>{icon}{label}</div>
    </Focusable>
  )
}

const focusRing = 'transition-[transform,box-shadow] duration-300 ease-out-expo group-data-[hl=true]/f:scale-[1.07] group-data-[hl=true]/f:shadow-[0_18px_40px_-8px_rgba(0,0,0,.8),0_0_0_3px_var(--accent)] group-hover/f:scale-[1.03]'

/** A Watchlist title that isn't in the library. */
function RemoteCard({ item, onEnter }: { item: WatchItem; onEnter: () => void }) {
  return (
    <Focusable onEnter={onEnter} onLongPress={onEnter} onFocus={(el) => reveal(el)} title={`${item.title} — not in your library`} className="w-full shrink-0">
      <div className={`relative aspect-[2/3] overflow-hidden rounded-xl bg-surface ${focusRing}`}>
        {item.poster
          ? <img src={item.poster} alt={item.title} loading="lazy" decoding="async" draggable={false} className="absolute inset-0 h-full w-full object-cover brightness-[.8]" />
          : <div className="absolute inset-0 grid place-items-center bg-linear-to-br from-white/10 to-white/[0.03] p-4 text-center text-lg font-bold text-white/70">{item.title}</div>}
        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/40 to-transparent px-2.5 pb-2.5 pt-10">
          <div className="inline-flex rounded-full bg-white/20 px-2.5 py-1 text-[0.72rem] font-extrabold uppercase tracking-wide backdrop-blur">Not in library</div>
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
  const [requesting, setRequesting] = useState<RequestItem>()

  useEffect(() => {
    let alive = true
    getWatchlist(token, true).then(async (list) => {
      if (!alive) return
      setItems(list)
      const m = await matchLibrary(server, sections, list).catch(() => new Map<string, PlexMedia>())
      if (alive) setLocal(m)
    }).catch(() => alive && (setError(true), setItems([])))
    return () => { alive = false }
  }, [server, token, sections])

  const remove = async (i: WatchItem) => {
    setMenu(undefined)
    setItems((l) => l?.filter((x) => x.key !== i.key))
    await setOnWatchlist(token, i, false).catch(() => {})
  }
  const request = async (i: WatchItem) => {
    setMenu(undefined)
    const hits = await searchTmdb(settings.tmdbKey, i.title).catch(() => [])
    const hit = hits.find((h) => h.type === (i.type === 'show' ? 'tv' : 'movie') && (!i.year || !h.year || Math.abs(h.year - i.year) <= 1)) ?? hits[0]
    if (hit) setRequesting(hit)
  }

  const onList = menu ? local.get(menu.key) : undefined
  return (
    <div className="px-[var(--gutter)] pb-24 pt-14">
      <h1 className="fade-up text-[2.6rem] font-extrabold tracking-[-0.03em]">Watchlist</h1>
      <p className="mb-8 mt-1 text-white/55">{items ? `${items.length} title${items.length === 1 ? '' : 's'} on your Plex Watchlist · hold OK on one to remove it` : ' '}</p>
      <div className="grid gap-x-4 gap-y-8 [grid-template-columns:repeat(auto-fill,minmax(var(--card-w),1fr))]">
        {!items ? Array.from({ length: 12 }, (_, i) => <div key={i} className="skeleton aspect-[2/3] rounded-xl" />)
          : items.map((i) => {
            const m = local.get(i.key)
            return <div key={i.key} className="[--card-w:100%]">
              {m ? <PosterCard m={m} server={server} onEnter={() => onOpen(m)} onLongPress={() => setMenu(i)} onFocus={(el) => reveal(el)} /> : <RemoteCard item={i} onEnter={() => setMenu(i)} />}
            </div>
          })}
      </div>
      {items && items.length === 0 && <p className="py-16 text-white/55">{error ? "Couldn't load your Watchlist right now." : 'Nothing here yet. Open a movie or show and choose Watchlist to save it.'}</p>}

      {menu && (
        <Layer onClose={() => setMenu(undefined)} scrim="bg-black/55 backdrop-blur-sm" className="absolute left-1/2 top-1/2 w-[min(380px,92vw)] -translate-x-1/2 -translate-y-1/2">
          <div className="pop overflow-hidden rounded-3xl bg-[#17171c]/95 p-2 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10 backdrop-blur-2xl">
            <div className="px-3.5 pb-2 pt-3"><div className="truncate text-[1.02rem] font-bold">{menu.title}</div><div className="text-sm text-white/55">{[menu.year, menu.type === 'show' ? 'Series' : 'Movie'].filter(Boolean).join(' · ')}</div></div>
            <div className="space-y-0.5">
              {onList && <MenuItem icon={<Info size={20} />} label="More info" onEnter={() => { setMenu(undefined); onOpen(onList) }} />}
              {!onList && canRequest && <MenuItem icon={<Plus size={20} />} label="Request" onEnter={() => request(menu)} />}
              <MenuItem danger icon={<BookmarkMinus size={20} />} label="Remove from Watchlist" onEnter={() => remove(menu)} />
            </div>
          </div>
        </Layer>
      )}
      {requesting && <RequestDetail item={requesting} base={normalizeBase(settings.overseerrUrl)} plexToken={token} tmdbKey={settings.tmdbKey} onClose={() => setRequesting(undefined)} />}
    </div>
  )
}
