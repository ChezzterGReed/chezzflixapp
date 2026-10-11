import { Layer } from './Layer'
import { Focusable } from './Focusable'
import type { Version } from '../lib/versions'

/** Shown when playback keeps stalling and a lighter copy of the title exists: switch to it (at the same spot) or carry on. */
export function StallOffer({ lighter, onSwitch, onDismiss }: { lighter: Version; onSwitch: () => void; onDismiss: () => void }) {
  return (
    <Layer player z="z-[85]" onClose={onDismiss} scrim="bg-transparent" className="absolute bottom-28 left-1/2 w-[min(540px,92vw)] -translate-x-1/2">
      <div data-nopause className="pop rounded-3xl bg-[#17171c]/95 p-5 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10 backdrop-blur-xl">
        <div className="text-[1.1rem] font-extrabold tracking-tight">Having trouble playing this smoothly?</div>
        <div className="mt-1 text-sm text-white/65">You may have better luck with the {lighter.label} version{lighter.detail ? ` (${lighter.detail})` : ''}. It will pick up right where you are.</div>
        <div className="mt-4 flex gap-3">
          <Focusable onEnter={onSwitch} title={`Switch to ${lighter.label}`}>
            <div className="rounded-full bg-white px-6 py-2.5 text-[0.95rem] font-bold text-black transition-all group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]">Switch to {lighter.label}</div>
          </Focusable>
          <Focusable onEnter={onDismiss} title="Keep watching">
            <div className="rounded-full bg-white/15 px-6 py-2.5 text-[0.95rem] font-semibold transition-all group-hover/f:bg-white/25 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">No thanks</div>
          </Focusable>
        </div>
      </div>
    </Layer>
  )
}
