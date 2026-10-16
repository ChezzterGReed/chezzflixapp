import { Eye, EyeOff, Play, RotateCcw, X } from 'lucide-react'
import { Layer } from './Layer'
import { Focusable } from './Focusable'
import { episodeLabel, imageUrl, isWatched, type PlexMedia, type PlexServer } from '../lib/plex'

const hms = (ms: number) => {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`
}

function Item({ icon, label, onEnter, focusKey }: { icon: React.ReactNode; label: string; onEnter: () => void; focusKey?: string }) {
  return (
    <Focusable focusKey={focusKey} onEnter={onEnter} title={label}>
      <div className="flex h-12 items-center gap-3 rounded-xl px-3.5 text-[0.95rem] font-semibold transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">{icon}{label}</div>
    </Focusable>
  )
}

/** Hold OK (or right-click) on an episode: continue from where you stopped, play (from the beginning if it is partly watched), mark watched. */
export function EpisodeMenu({ server, ep, onClose, onContinue, onPlay, onToggleWatched }: { server: PlexServer; ep: PlexMedia; onClose: () => void; onContinue: () => void; onPlay: () => void; onToggleWatched: () => void }) {
  const progress = ep.viewOffset ?? 0
  const partly = progress >= 15_000
  const watched = isWatched(ep)
  const act = (f: () => void) => () => { onClose(); f() }
  return (
    <Layer onClose={onClose} scrim="bg-black/55 backdrop-blur-sm" className="absolute left-1/2 top-1/2 w-[min(400px,92vw)] -translate-x-1/2 -translate-y-1/2">
      <div className="pop overflow-hidden rounded-3xl bg-[#17171c]/95 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10 backdrop-blur-2xl">
        <div className="flex items-center gap-3.5 p-4 pb-3">
          <img src={imageUrl(server, ep.thumb, 200, 113)} alt="" draggable={false} className="h-14 w-24 shrink-0 rounded-md bg-surface object-cover" />
          <div className="min-w-0 flex-1"><div className="truncate text-[1.02rem] font-bold">{ep.title}</div><div className="truncate text-sm text-white/55">{episodeLabel(ep)}{watched ? ' · watched' : ''}</div></div>
          <Focusable onEnter={onClose} title="Close"><div className="grid size-9 place-items-center rounded-full transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><X size={18} /></div></Focusable>
        </div>
        <div className="space-y-0.5 p-2 pt-0">
          {partly && <Item focusKey="epmenu-continue" icon={<Play size={20} fill="currentColor" />} label={`Continue from ${hms(progress)}`} onEnter={act(onContinue)} />}
          <Item focusKey={partly ? undefined : 'epmenu-play'} icon={partly ? <RotateCcw size={19} /> : <Play size={20} fill="currentColor" />} label={partly ? 'Play from beginning' : 'Play'} onEnter={act(onPlay)} />
          <Item icon={watched ? <EyeOff size={20} /> : <Eye size={20} />} label={watched ? 'Mark as unwatched' : 'Mark as watched'} onEnter={act(onToggleWatched)} />
        </div>
      </div>
    </Layer>
  )
}
