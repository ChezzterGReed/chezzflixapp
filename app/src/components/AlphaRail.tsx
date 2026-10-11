import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Focusable } from './Focusable'
import { useFocusedKey } from '../lib/input'

/** The first letter a title is filed under (digits and symbols go under #). */
export const alphaOf = (title: string) => { const c = title.trim().charAt(0).toUpperCase(); return c >= 'A' && c <= 'Z' ? c : '#' }

/**
 * A column of letters down the right edge of a long list: move right from the grid, pick a letter, and the list jumps to it.
 * Only letters that have titles are shown. The letters are as big as the screen allows, and the one under the cursor is also shown large.
 */
export function AlphaRail({ letters, onPick, busy }: { letters: string[]; onPick: (l: string) => void; busy?: boolean }) {
  const [hot, setHot] = useState<string>()
  const focused = useFocusedKey()
  const onRail = !!focused && !!document.querySelector(`[data-alpha] [data-fk="${focused}"]`)   // is the cursor on the strip right now?
  if (letters.length < 2) return null
  // Size to the screen: all the letters fit the height, as large as that allows (never tiny, never silly).
  const font = `clamp(12px, calc(88vh / ${letters.length * 1.55}), 24px)`
  return (
    <>
      <div data-alpha className="pointer-events-none fixed inset-y-0 right-1.5 z-[35] flex items-center max-md:hidden">
        <div className="pointer-events-auto flex max-h-[94vh] flex-col items-center rounded-full bg-black/60 px-1 py-2 ring-1 ring-white/10" style={{ fontSize: font }}>
          {busy && <Loader2 size={14} className="mb-1 animate-spin text-accent" />}
          {letters.map((l) => (
            <Focusable key={l} onEnter={() => onPick(l)} onFocus={() => setHot(l)} title={`Jump to ${l}`}>
              <div className="grid w-[2.1em] place-items-center rounded-full font-extrabold leading-[1.55] text-white/90 transition-colors group-hover/f:bg-white/20 group-data-[hl=true]/f:bg-accent group-data-[hl=true]/f:text-black">{l}</div>
            </Focusable>
          ))}
        </div>
      </div>
      {/* The letter you're on, big enough to read from the couch */}
      {hot && onRail && <div aria-hidden className="pointer-events-none fixed right-[4.2rem] top-1/2 z-[35] grid size-24 -translate-y-1/2 place-items-center rounded-3xl bg-black/70 text-[3.6rem] font-extrabold text-accent shadow-2xl ring-1 ring-white/15 max-md:hidden">{hot}</div>}
    </>
  )
}
