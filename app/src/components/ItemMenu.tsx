import { useEffect, useState } from 'react'
import { BookmarkMinus, BookmarkPlus, CheckSquare, Eye, EyeOff, Info, Pencil, Play, ThumbsDown, X, XCircle } from 'lucide-react'
import { Layer } from './Layer'
import { Focusable } from './Focusable'
import { episodeLabel, getMetadata, imageUrl, isWatched, posterPath, type PlexMedia, type PlexServer } from '../lib/plex'
import { getWatchlist, setOnWatchlist, watchItemOf, watchKey } from '../lib/watchlist'

interface Props {
  item: PlexMedia; server: PlexServer; /** The person's Plex token (for their Watchlist) and a way to tell them what happened. */ token: string; say: (msg: string) => void; fromContinue?: boolean; fromRecs?: boolean
  onClose: () => void; onPlay: () => void; onInfo: () => void; onToggleWatched: () => void; onRemoveContinue: () => void; onNotInterested?: () => void; onSelect?: () => void
  /** Desktop owner only: edit this title's details and artwork. */
  onEdit?: () => void
}

function Item({ icon, label, onEnter, danger }: { icon: React.ReactNode; label: string; onEnter: () => void; danger?: boolean }) {
  return (
    <Focusable onEnter={onEnter}>
      <div className={`flex h-12 items-center gap-3 rounded-xl px-3.5 text-[0.95rem] font-semibold transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${danger ? 'text-red-300 group-data-[hl=true]/f:text-red-700' : ''}`}>{icon}{label}</div>
    </Focusable>
  )
}

/** The per-title menu: play, details, watched state, and (in Continue Watching) remove. */
export function ItemMenu({ item, server, token, say, fromContinue, fromRecs, onClose, onPlay, onInfo, onToggleWatched, onRemoveContinue, onNotInterested, onSelect, onEdit }: Props) {
  const title = item.type === 'episode' ? item.grandparentTitle ?? item.title : item.title
  const sub = item.type === 'episode' ? `${episodeLabel(item)} · ${item.title}` : [item.year, item.type === 'show' ? 'Series' : undefined].filter(Boolean).join(' · ')
  const watched = isWatched(item)
  const act = (f: () => void) => () => { onClose(); f() }
  // Watchlist (on Plex's cloud): works on the movie or show (an episode stands for its show). Lists don't always carry Plex's id, so it's read from the title when missing.
  const [wl, setWl] = useState<{ m: PlexMedia; key: string; on: boolean }>()
  useEffect(() => {
    let alive = true
    const id = item.type === 'episode' ? item.grandparentRatingKey : item.type === 'movie' || item.type === 'show' ? item.ratingKey : undefined
    if (!id) return
    ;(async () => {
      const m = item.type !== 'episode' && item.guid ? item : await getMetadata(server, id)
      const key = watchKey(server, m)
      if (!key) return
      const list = await getWatchlist(token)
      if (alive) setWl({ m, key, on: list.some((x) => x.key === key) })
    })().catch(() => {})
    return () => { alive = false }
  }, [item.ratingKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const toggleWl = async () => {
    if (!wl) return
    const next = !wl.on
    try { await setOnWatchlist(token, watchItemOf(wl.key, wl.m), next); say(next ? `Added ${wl.m.title} to your Watchlist` : `Removed ${wl.m.title} from your Watchlist`) }
    catch { say('Couldn’t update your Watchlist. Try again.') }
  }
  return (
    <Layer onClose={onClose} scrim="bg-black/55 backdrop-blur-sm" className="absolute left-1/2 top-1/2 w-[min(380px,92vw)] -translate-x-1/2 -translate-y-1/2">
      <div className="pop overflow-hidden rounded-3xl bg-[#17171c]/95 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10 backdrop-blur-2xl">
        <div className="flex items-center gap-3.5 p-4 pb-3">
          <img src={imageUrl(server, posterPath(item), 160, 240)} alt="" draggable={false} className="h-16 w-11 shrink-0 rounded-md bg-surface object-cover" />
          <div className="min-w-0 flex-1"><div className="truncate text-[1.02rem] font-bold">{title}</div><div className="truncate text-sm text-white/55">{sub}</div></div>
          <Focusable onEnter={onClose} title="Close"><div className="grid size-9 place-items-center rounded-full transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><X size={18} /></div></Focusable>
        </div>
        <div className="space-y-0.5 p-2 pt-0">
          <Item icon={<Play size={20} fill="currentColor" />} label={item.viewOffset ? 'Resume' : 'Play'} onEnter={act(onPlay)} />
          <Item icon={<Info size={20} />} label="More info" onEnter={act(onInfo)} />
          <Item icon={watched ? <EyeOff size={20} /> : <Eye size={20} />} label={watched ? 'Mark as unwatched' : 'Mark as watched'} onEnter={act(onToggleWatched)} />
          {wl && <Item icon={wl.on ? <BookmarkMinus size={20} /> : <BookmarkPlus size={20} />} label={wl.on ? 'Remove from Watchlist' : 'Add to Watchlist'} onEnter={act(toggleWl)} />}
          {onEdit && <Item icon={<Pencil size={20} />} label="Edit info" onEnter={act(onEdit)} />}
          {onSelect && <Item icon={<CheckSquare size={20} />} label="Select" onEnter={act(onSelect)} />}
          {fromRecs && onNotInterested && <Item icon={<ThumbsDown size={20} />} label="Not interested" onEnter={act(onNotInterested)} />}
          {fromContinue && <Item danger icon={<XCircle size={20} />} label="Remove from Continue Watching" onEnter={act(onRemoveContinue)} />}
        </div>
      </div>
    </Layer>
  )
}
