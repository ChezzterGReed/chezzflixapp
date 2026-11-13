import { Play } from 'lucide-react'
import { Layer } from './Layer'
import { Focusable } from './Focusable'
import { episodeLabel, imageUrl, posterPath, type PlexServer } from '../lib/plex'
import type { StillAsk } from '../lib/stillWatching'

/**
 * "Are you still watching?", shown over the screen you come back to once the stream has been closed. Resume carries on exactly as if you had
 * pressed Resume on the title itself; the window is a dark tint of the accent colour.
 */
export function StillWatching({ server, ask, onResume, onClose }: { server: PlexServer; ask: StillAsk; onResume: () => void; onClose: () => void }) {
  const item = ask.item
  const title = ask.title ?? (item.type === 'episode' ? item.grandparentTitle ?? item.title : item.title)
  const sub = ask.sub ?? (item.type === 'episode' ? `${episodeLabel(item)} · ${item.title}` : item.year?.toString())
  const poster = posterPath(item)
  return (
    <Layer onClose={onClose} scrim="bg-black/75 backdrop-blur-sm" className="absolute left-1/2 top-1/2 w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2">
      <div className="pop flex gap-6 overflow-hidden rounded-3xl bg-[color-mix(in_srgb,var(--accent)_22%,#0b0b10)] p-6 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-[color-mix(in_srgb,var(--accent)_45%,transparent)]">
        {poster && <img src={imageUrl(server, poster, 300, 450)} alt="" draggable={false} className="aspect-[2/3] w-[34%] max-w-[170px] shrink-0 self-start rounded-xl bg-black/30 object-cover shadow-[0_14px_36px_-8px_rgba(0,0,0,.8)]" />}
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <div className="text-[1.65rem] font-extrabold leading-tight tracking-tight text-white">Are you still watching?</div>
          <div className="mt-3 truncate text-[1.05rem] font-semibold text-white">{title}</div>
          {sub && <div className="truncate text-[0.95rem] text-white/85">{sub}</div>}
          <div className="mt-6 flex flex-wrap gap-3">
            <Focusable focusKey="still-resume" onEnter={onResume} title="Resume">
              <div className="flex items-center gap-2 rounded-full bg-white px-7 py-3 text-[1.02rem] font-bold text-black transition-all group-hover/f:scale-105 group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]"><Play size={18} fill="currentColor" />Resume</div>
            </Focusable>
            <Focusable focusKey="still-no" onEnter={onClose} title="Not now">
              <div className="rounded-full bg-white/15 px-6 py-3 text-[1.02rem] font-semibold text-white transition-all group-hover/f:bg-white/25 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">Not now</div>
            </Focusable>
          </div>
        </div>
      </div>
    </Layer>
  )
}
