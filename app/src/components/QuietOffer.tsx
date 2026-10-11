import { useEffect, useState } from 'react'
import { Layer } from './Layer'
import { Focusable } from './Focusable'
import { dbLabel } from '../lib/leveling'

const OFFER_SECONDS = 10
const TRY_SECONDS = 6

/** A circle that empties over `seconds` (so it's obvious the popup will go away on its own). */
function Radial({ seconds, label }: { seconds: number; label: number }) {
  const [go, setGo] = useState(false)
  useEffect(() => { const t = requestAnimationFrame(() => setGo(true)); return () => cancelAnimationFrame(t) }, [])
  const r = 15, c = 2 * Math.PI * r
  return (
    <div className="relative grid size-10 shrink-0 place-items-center">
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="3" />
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={go ? c : 0} style={{ transition: `stroke-dashoffset ${seconds}s linear` }} />
      </svg>
      <span className="text-sm font-bold tabular-nums">{label}</span>
    </div>
  )
}

/**
 * Auto leveling is off but this title is quiet: offer to try it. Ignoring it (10 s) just closes it; "Don't show again" stops it for good.
 * "Try it" warns for 6 s (so the jump in volume isn't a surprise), then calls `onApply`.
 */
export function QuietOffer({ gain, onApply, onNever, onClose }: { gain: number; onApply: () => void; onNever: () => void; onClose: () => void }) {
  const [stage, setStage] = useState<'offer' | 'trying' | 'done'>('offer')
  const [left, setLeft] = useState(OFFER_SECONDS)
  useEffect(() => {
    if (stage === 'done') { const t = setTimeout(onClose, 3500); return () => clearTimeout(t) }
    setLeft(stage === 'offer' ? OFFER_SECONDS : TRY_SECONDS)
    const t = setInterval(() => setLeft((n) => n - 1), 1000)
    return () => clearInterval(t)
  }, [stage]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (left > 0) return
    if (stage === 'offer') onClose()
    else if (stage === 'trying') { onApply(); setStage('done') }
  }, [left]) // eslint-disable-line react-hooks/exhaustive-deps
  const db = dbLabel(Math.round(gain))
  return (
    <Layer player z="z-[85]" onClose={onClose} scrim="bg-transparent" className="absolute bottom-28 left-1/2 w-[min(560px,92vw)] -translate-x-1/2">
      <div data-nopause className="pop rounded-3xl bg-[#17171c]/95 p-5 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10 backdrop-blur-xl">
        {stage === 'done' ? (
          <div className="text-[1.05rem] font-bold">Boost applied {db} <span className="font-medium text-white/60">· Auto leveling is now on (Settings → Playback)</span></div>
        ) : (
          <div className="flex items-start gap-4">
            <Radial key={stage} seconds={stage === 'offer' ? OFFER_SECONDS : TRY_SECONDS} label={Math.max(0, left)} />
            <div className="min-w-0 flex-1">
              {stage === 'offer' ? (
                <>
                  <div className="text-[1.1rem] font-extrabold tracking-tight">This looks pretty quiet</div>
                  <div className="mt-1 text-sm text-white/65">Want to try auto volume leveling? It would lift this by about {db}.</div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Focusable onEnter={() => setStage('trying')} title="Try it">
                      <div className="rounded-full bg-white px-6 py-2.5 text-[0.95rem] font-bold text-black transition-all group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]">Try it</div>
                    </Focusable>
                    <Focusable onEnter={onNever} title="Don't show again">
                      <div className="rounded-full bg-white/15 px-6 py-2.5 text-[0.95rem] font-semibold transition-all group-hover/f:bg-white/25 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">Don’t show again</div>
                    </Focusable>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[1.1rem] font-extrabold tracking-tight">Applying a {db} boost in {Math.max(0, left)}…</div>
                  <div className="mt-1 text-sm text-white/65">Turn down the volume on your device now, the sound is about to get louder.</div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Layer>
  )
}
