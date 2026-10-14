import { useEffect, useRef, useState } from 'react'

// What each named spot last showed, so a name that changes while its spot is re-created (a new profile) still animates from the old one.
const memory = new Map<string, string>()

/**
 * A name that animates when it changes: the old letters fade away, then the new ones ease in one by one.
 * `intro`: also ease the letters in when first shown. `hold`: wait (showing the old name) until this turns false.
 */
export function SwapText({ text, id, intro, hold, stagger = 60 }: { text: string; id?: string; intro?: boolean; hold?: boolean; stagger?: number }) {
  const [shown, setShown] = useState(() => (id ? memory.get(id) : undefined) ?? text)
  const [phase, setPhase] = useState<'in' | 'out' | 'still'>(intro ? 'in' : 'still')
  const first = useRef(true)
  useEffect(() => {
    first.current = false
    if (hold || text === shown) { if (id && text === shown) memory.set(id, shown); return }
    setPhase('out')
    const t = setTimeout(() => { setShown(text); setPhase('in'); if (id) memory.set(id, text) }, 420 + Math.min(shown.length, 12) * 25)
    return () => clearTimeout(t)
  }, [text, hold]) // eslint-disable-line react-hooks/exhaustive-deps
  const cls = phase === 'in' ? 'letter-in' : phase === 'out' ? 'letter-out' : ''
  return (
    <span aria-label={shown} className="inline-flex">
      {[...shown].map((ch, n) => (
        <span key={`${shown}:${phase}:${n}`} aria-hidden className={cls} style={cls ? { animationDelay: `${phase === 'out' ? n * 25 : n * stagger}ms` } : undefined}>{ch === ' ' ? ' ' : ch}</span>
      ))}
    </span>
  )
}
