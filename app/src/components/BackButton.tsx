import { ArrowLeft } from 'lucide-react'
import { Focusable } from './Focusable'

/** "Back to <where you came from>" — also reachable with Escape / the remote's Back button. */
export function BackButton({ onBack, label = 'Back' }: { onBack: () => void; label?: string }) {
  return (
    <Focusable focusKey="page-back" onEnter={onBack} title={label} leftToRail>
      <div className="mb-6 inline-flex h-11 items-center gap-2 rounded-full bg-white/10 pl-3.5 pr-5 text-sm font-semibold backdrop-blur-md transition-colors group-hover/f:bg-white/20 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">
        <ArrowLeft size={18} />{label}
      </div>
    </Focusable>
  )
}
