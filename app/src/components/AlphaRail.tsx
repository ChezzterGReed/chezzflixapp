import { Loader2 } from 'lucide-react'
import { Focusable } from './Focusable'

/** The first letter a title is filed under (digits and symbols go under #). */
export const alphaOf = (title: string) => { const c = title.trim().charAt(0).toUpperCase(); return c >= 'A' && c <= 'Z' ? c : '#' }

/**
 * A column of letters down the right edge of a long list: move right from the grid, pick a letter, and the list jumps to it.
 * Only letters that have titles are shown.
 */
export function AlphaRail({ letters, onPick, busy }: { letters: string[]; onPick: (l: string) => void; busy?: boolean }) {
  if (letters.length < 2) return null
  return (
    <div className="pointer-events-none fixed inset-y-0 right-1 z-[35] flex items-center max-md:hidden">
      <div className="pointer-events-auto flex max-h-[92vh] flex-col items-center rounded-full bg-black/45 py-1.5" style={{ fontSize: 'clamp(9px, 1.9vh, 13px)' }}>
        {busy && <Loader2 size={12} className="mb-1 animate-spin text-accent" />}
        {letters.map((l) => (
          <Focusable key={l} onEnter={() => onPick(l)} title={`Jump to ${l}`}>
            <div className="grid w-[2.1em] place-items-center rounded-full font-bold leading-[1.45] text-white/70 transition-colors group-hover/f:bg-white/20 group-data-[hl=true]/f:bg-accent group-data-[hl=true]/f:text-black">{l}</div>
          </Focusable>
        ))}
      </div>
    </div>
  )
}
