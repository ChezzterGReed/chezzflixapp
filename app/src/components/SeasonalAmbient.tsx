import { useSeason } from '../lib/settings'

/** Fixed corner cobweb: a few spokes and curved threads. Drawn once, never animated. */
function Cobweb({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg style={style} viewBox="0 0 160 160" className={className} fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" aria-hidden>
      <path d="M0 0 L160 0 M0 0 L0 160 M0 0 L150 70 M0 0 L120 120 M0 0 L70 150" />
      <path d="M40 0 Q34 34 0 40 M80 0 Q62 62 0 80 M120 0 Q92 92 0 120 M158 0 Q116 116 0 158" />
      <path d="M100 100 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0" strokeWidth="1.4" />
    </svg>
  )
}

/** A tiny bat silhouette. */
function Bat({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 20" className={className} fill="currentColor" aria-hidden>
      <path d="M20 8c-2-3-5-5-9-5 1 2 1 4 0 6-3 0-7 1-11 4 4-1 7 0 10 3 1-2 3-3 5-3 1 2 3 3 5 3s4-1 5-3c2 0 4 1 5 3 3-3 6-4 10-3-4-3-8-4-11-4-1-2-1-4 0-6-4 0-7 2-9 5z" />
    </svg>
  )
}

/**
 * Spooky season atmosphere, kept very light: drifting fog and a few embers (switched off in low-power mode), plus still decoration that costs
 * nothing to draw: an orange glow along the bottom edge, a cobweb in the top corner and a few bats.
 */
export function SeasonalAmbient() {
  const season = useSeason()
  if (season !== 'halloween') return null
  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="fog fog-1" /><div className="fog fog-2" />
        {Array.from({ length: 5 }, (_, n) => (
          <i key={n} className="mote ember" style={{ left: `${(n * 37 + 11) % 100}%`, width: 3, height: 3, animationDuration: `${30 + n * 5}s`, animationDelay: `${-n * 4}s`, ['--drift' as string]: `${(n % 2 ? 1 : -1) * 18}px` }} />
        ))}
      </div>
      {/* Still decoration, above the page but never in the way */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0 z-[5] h-[26vh] bg-linear-to-t from-[#ff7a1a]/[.14] via-[#ff7a1a]/[.045] to-transparent" />
      <Cobweb className="pointer-events-none fixed top-0 z-[5] size-[clamp(90px,11vw,170px)] text-white/[.16] max-md:hidden" style={{ left: "var(--rail)" }} />
      <div aria-hidden className="pointer-events-none fixed right-[5vw] top-[3.5vh] z-[5] flex items-end gap-2 text-[#ff7a1a]/45 max-md:hidden">
        <Bat className="mb-3 w-6 -rotate-12" /><Bat className="w-8" /><Bat className="mb-5 w-5 rotate-12" />
      </div>
    </>
  )
}
