import { useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Layer } from './Layer'
import { Focusable } from './Focusable'
import { ClipPopup } from './ClipPopup'
import { episodeLabel, getMetadata, type PlexMedia, type PlexServer } from '../lib/plex'
import { recapSegments, type Segment } from '../lib/clips'

type Stage = 'ask' | 'loading' | 'recap' | 'card' | 'leaving'
const CARD_MS = 2600   // how long "Now Playing" stays up

/**
 * Before an episode you haven't seen starts, after a long break: the screen goes black and asks whether you'd like a recap of the last
 * episode you watched. Skip / Not for this show carry straight on; a recap plays full screen, fades to black, shows "Now Playing", then
 * the episode starts. `onPlay` starts the real playback; `onDone` removes this screen (once the player has taken over).
 */
export function RecapNudge({ server, target, prev, days, onSkip, onNever, onPlay, onDone }: {
  server: PlexServer; target: PlexMedia; prev: PlexMedia; days: number
  onSkip: () => void; onNever: () => void; onPlay: () => void; onDone: () => void
}) {
  const [stage, setStage] = useState<Stage>('ask')
  const [clip, setClip] = useState<{ media: PlexMedia; segments: Segment[] }>()
  const started = useRef(false)
  const showName = target.grandparentTitle ?? target.title

  // Hand over to the real playback (once), then drop this screen after the player has had time to fade up from black.
  const play = () => {
    if (started.current) return
    started.current = true
    setStage('leaving')
    onPlay()
    setTimeout(onDone, 1100)
  }
  const watchRecap = async () => {
    setStage('loading')
    try {
      const full = await getMetadata(server, prev.ratingKey)   // the full record carries the credits marker the last clip needs
      const segments = recapSegments(full)
      if (!segments.length) return setStage('card')
      setClip({ media: full, segments }); setStage('recap')
    } catch { setStage('card') }
  }
  const afterRecap = useRef(() => {}); afterRecap.current = () => setStage((s) => { if (s === 'recap') { onSkip(); return 'card' } return s })   // (having watched the recap, this break needn't be offered again)
  useEffect(() => { if (stage !== 'card') return; const t = setTimeout(play, CARD_MS); return () => clearTimeout(t) }, [stage]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* The black screen, up for the whole thing until the episode is on its way */}
      <div className="fixed inset-0 z-[74] bg-black" />

      {stage === 'ask' && (
        <Layer z="z-[76]" scrim="bg-transparent" onClose={() => { onSkip(); play() }} className="absolute left-1/2 top-1/2 w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2">
          <div className="pop text-center">
            <div className="mx-auto mb-5 grid size-14 place-items-center rounded-full bg-white/10"><RotateCcw size={26} /></div>
            <div className="text-[1.7rem] font-extrabold tracking-tight">Welcome back to {showName}</div>
            <p className="mx-auto mt-2 max-w-md text-white/65">It’s been {days} day{days === 1 ? '' : 's'} since you last watched. Want a quick recap of {episodeLabel(prev)} before {episodeLabel(target)}?</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Focusable focusKey="nudge-recap" onEnter={watchRecap} title="Watch recap">
                <div className="rounded-full bg-white px-7 py-3 text-[1rem] font-bold text-black transition-all group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]">Watch recap</div>
              </Focusable>
              <Focusable onEnter={() => { onSkip(); play() }} title="Skip">
                <div className="rounded-full bg-white/15 px-7 py-3 text-[1rem] font-semibold transition-all group-hover/f:bg-white/25 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">Skip</div>
              </Focusable>
              <Focusable onEnter={() => { onNever(); play() }} title="Not for this show">
                <div className="rounded-full bg-white/15 px-7 py-3 text-[1rem] font-semibold transition-all group-hover/f:bg-white/25 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">Not for this show</div>
              </Focusable>
            </div>
          </div>
        </Layer>
      )}

      {stage === 'recap' && clip && (
        <ClipPopup server={server} media={clip.media} segments={clip.segments} heading={`Previously on ${showName}`} subheading={`${episodeLabel(prev)} · ${prev.title}`} onFinished={() => afterRecap.current()} onClose={() => afterRecap.current()} />
      )}

      {stage === 'card' && (
        <div className="fade-in fixed inset-0 z-[77] grid place-items-center bg-black text-center">
          <div>
            <div className="text-sm font-bold uppercase tracking-[0.35em] text-white/50">Now Playing</div>
            <div className="mt-4 text-[2.4rem] font-extrabold tracking-tight">{showName}</div>
            <div className="mt-1 text-xl text-white/70">{episodeLabel(target)} · {target.title}</div>
          </div>
        </div>
      )}
    </>
  )
}
