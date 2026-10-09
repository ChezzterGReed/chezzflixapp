import { Eye, EyeOff, Info, Play, X, XCircle } from 'lucide-react'
import { Layer } from './Layer'
import { Focusable } from './Focusable'
import { episodeLabel, imageUrl, isWatched, posterPath, type PlexMedia, type PlexServer } from '../lib/plex'

interface Props {
  item: PlexMedia; server: PlexServer; fromContinue?: boolean
  onClose: () => void; onPlay: () => void; onInfo: () => void; onToggleWatched: () => void; onRemoveContinue: () => void
}

function Item({ icon, label, onEnter, danger }: { icon: React.ReactNode; label: string; onEnter: () => void; danger?: boolean }) {
  return (
    <Focusable onEnter={onEnter}>
      <div className={`flex h-12 items-center gap-3 rounded-xl px-3.5 text-[0.95rem] font-semibold transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${danger ? 'text-red-300 group-data-[hl=true]/f:text-red-700' : ''}`}>{icon}{label}</div>
    </Focusable>
  )
}

/** The per-title menu: play, details, watched state, and (in Continue Watching) remove. */
export function ItemMenu({ item, server, fromContinue, onClose, onPlay, onInfo, onToggleWatched, onRemoveContinue }: Props) {
  const title = item.type === 'episode' ? item.grandparentTitle ?? item.title : item.title
  const sub = item.type === 'episode' ? `${episodeLabel(item)} · ${item.title}` : [item.year, item.type === 'show' ? 'Series' : undefined].filter(Boolean).join(' · ')
  const watched = isWatched(item)
  const act = (f: () => void) => () => { onClose(); f() }
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
          {fromContinue && <Item danger icon={<XCircle size={20} />} label="Remove from Continue Watching" onEnter={act(onRemoveContinue)} />}
        </div>
      </div>
    </Layer>
  )
}
