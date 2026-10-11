import { useEffect, useState } from 'react'
import { Layer } from './Layer'
import { Focusable } from './Focusable'
import { ASK_SECONDS } from '../lib/stillWatching'

/** The "Are you still watching?" card. Any answer keeps it going; no answer in 15 seconds calls `onTimeout`. */
export function StillWatching({ onStay, onTimeout }: { onStay: () => void; onTimeout: () => void }) {
  const [left, setLeft] = useState(ASK_SECONDS)
  useEffect(() => {
    const t = setInterval(() => setLeft((n) => n - 1), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => { if (left <= 0) onTimeout() }, [left]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Layer player z="z-[90]" onClose={onStay} scrim="bg-black/70 backdrop-blur-sm" className="absolute left-1/2 top-1/2 w-[min(440px,92vw)] -translate-x-1/2 -translate-y-1/2">
      <div data-nopause className="pop rounded-3xl bg-[#17171c]/95 p-7 text-center shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10">
        <div className="text-2xl font-extrabold tracking-tight">Are you still watching?</div>
        <div className="mt-2 text-white/60">Stopping in {Math.max(0, left)}s to save bandwidth.</div>
        <div className="mx-auto mt-4 h-1 w-48 overflow-hidden rounded-full bg-white/15"><div className="h-full bg-accent transition-[width] duration-1000 ease-linear" style={{ width: `${(Math.max(0, left) / ASK_SECONDS) * 100}%` }} /></div>
        <div className="mt-6 flex justify-center">
          <Focusable onEnter={onStay} title="Yes, keep watching">
            <div className="rounded-full bg-white px-8 py-3 text-[1.02rem] font-bold text-black transition-all group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]">Yes, keep watching</div>
          </Focusable>
        </div>
      </div>
    </Layer>
  )
}
