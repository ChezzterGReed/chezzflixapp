import { useEffect } from 'react'
import { setFocus } from '@noriginmedia/norigin-spatial-navigation'
import { Layer } from './Layer'
import { Focusable } from './Focusable'

/** Back on the very first screen: ask before closing the app. */
export function ExitConfirm({ onStay, onExit }: { onStay: () => void; onExit: () => void }) {
  useEffect(() => { const t = setTimeout(() => setFocus('exit-stay'), 80); return () => clearTimeout(t) }, [])
  return (
    <Layer onClose={onStay} scrim="bg-black/65 backdrop-blur-sm" className="absolute left-1/2 top-1/2 w-[min(460px,92vw)] -translate-x-1/2 -translate-y-1/2">
      <div className="pop rounded-3xl bg-[#17171c]/95 p-7 text-center shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10">
        <div className="text-[1.4rem] font-extrabold tracking-tight">Close the app?</div>
        <p className="mt-2 text-white/60">You can pick up where you left off next time.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Focusable focusKey="exit-stay" onEnter={onStay} title="Stay">
            <div className="rounded-full bg-white/15 px-8 py-3 text-[1.02rem] font-bold transition-all group-hover/f:bg-white/25 group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">Stay</div>
          </Focusable>
          <Focusable focusKey="exit-close" onEnter={onExit} title="Close app">
            <div className="rounded-full bg-white/15 px-8 py-3 text-[1.02rem] font-bold transition-all group-hover/f:bg-white/25 group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">Close app</div>
          </Focusable>
        </div>
      </div>
    </Layer>
  )
}
