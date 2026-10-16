import { Play, RotateCcw } from 'lucide-react'
import { Layer } from './Layer'
import { Focusable } from './Focusable'
import { episodeLabel, imageUrl, type PlexMedia, type PlexServer } from '../lib/plex'

const hms = (ms: number) => {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`
}

/** "Continue from 23:41, or start from the beginning?" for something you have partly watched (asked everywhere except Continue Watching). */
export function ResumePrompt({ server, item, onContinue, onRestart, onClose }: { server: PlexServer; item: PlexMedia; onContinue: () => void; onRestart: () => void; onClose: () => void }) {
  const title = item.type === 'episode' ? item.grandparentTitle ?? item.title : item.title
  const sub = item.type === 'episode' ? `${episodeLabel(item)} · ${item.title}` : item.year?.toString()
  const art = item.type === 'episode' ? item.thumb ?? item.grandparentThumb : item.art ?? item.thumb
  return (
    <Layer onClose={onClose} scrim="bg-black/65 backdrop-blur-sm" className="absolute left-1/2 top-1/2 w-[min(520px,92vw)] -translate-x-1/2 -translate-y-1/2">
      <div className="pop overflow-hidden rounded-3xl bg-[#17171c]/95 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10 backdrop-blur-2xl">
        {art && <div className="relative aspect-[16/6] overflow-hidden"><img src={imageUrl(server, art, 760, 285)} alt="" draggable={false} className="size-full object-cover" /><div className="absolute inset-0 bg-linear-to-t from-[#17171c] via-[#17171c]/30 to-transparent" /></div>}
        <div className={`p-6 ${art ? '-mt-10 relative' : ''}`}>
          <div className="truncate text-xl font-extrabold tracking-tight">{title}</div>
          {sub && <div className="truncate text-sm text-white/60">{sub}</div>}
          <p className="mt-3 text-white/75">You stopped at <b className="text-white">{hms(item.viewOffset ?? 0)}</b>.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Focusable focusKey="resume-continue" onEnter={onContinue} title="Continue">
              <div className="flex items-center gap-2 rounded-full bg-white px-6 py-3 font-bold text-black transition-all group-hover/f:scale-105 group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]"><Play size={18} fill="currentColor" />Continue from {hms(item.viewOffset ?? 0)}</div>
            </Focusable>
            <Focusable focusKey="resume-restart" onEnter={onRestart} title="Start from the beginning">
              <div className="flex items-center gap-2 rounded-full bg-white/15 px-6 py-3 font-semibold transition-all group-hover/f:bg-white/25 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><RotateCcw size={17} />Start from the beginning</div>
            </Focusable>
          </div>
        </div>
      </div>
    </Layer>
  )
}
