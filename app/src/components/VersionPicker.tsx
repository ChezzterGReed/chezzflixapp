import { setFocus } from '@noriginmedia/norigin-spatial-navigation'
import { Focusable } from './Focusable'
import type { Version } from '../lib/versions'

/** The list of qualities to choose from (used under the Play button and in the episode popup). */
export function VersionRows({ versions, onPick, onUp, prefix }: { versions: Version[]; onPick: (v: Version) => void; /** Up from the first row. */ onUp?: () => void; prefix: string }) {
  return (
    <>
      {versions.map((v, i) => (
        <Focusable key={v.id} focusKey={`${prefix}-${i}`} onEnter={() => onPick(v)} title={`Play ${v.label}`}
          onArrow={(d) => { if (d === 'left' || d === 'right') return false; if (d === 'up' && i === 0) { onUp?.(); return false } if (d === 'down' && i === versions.length - 1) return false }}>
          <div className="flex items-center gap-3 rounded-xl px-4 py-2.5 transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">
            <span className="text-[1rem] font-bold">{v.label}</span>
            <span className="min-w-0 flex-1 truncate text-sm opacity-60">{v.detail}</span>
          </div>
        </Focusable>
      ))}
    </>
  )
}

export const focusFirstVersion = (prefix: string) => setTimeout(() => setFocus(`${prefix}-0`), 30)
