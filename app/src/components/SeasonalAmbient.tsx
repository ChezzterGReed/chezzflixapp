import { useTheme } from '../lib/settings'

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
function Spooky() {
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

/** Slow snowfall: a handful of flakes (hidden in low-power mode). */
function Snow({ count = 12 }: { count?: number }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {Array.from({ length: count }, (_, n) => (
        <i key={n} className="flake" style={{ left: `${(n * 41 + 9) % 100}%`, width: 3 + (n % 3), height: 3 + (n % 3), animationDuration: `${26 + (n % 5) * 5}s`, animationDelay: `${-n * 3.1}s`, ['--drift' as string]: `${(n % 2 ? 1 : -1) * (14 + (n % 4) * 6)}px` }} />
      ))}
    </div>
  )
}

/** Frost creeping in from a corner: a few ice-crystal branches and a pale glow. Drawn once, never animated. */
function FrostCorner({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  const branch = (x: number, y: number, a: number, len: number): string => {
    const r = (a * Math.PI) / 180, ex = x + Math.cos(r) * len, ey = y + Math.sin(r) * len
    return `M${x} ${y}L${ex.toFixed(1)} ${ey.toFixed(1)}`
  }
  let d = ''
  for (const a of [10, 40, 70]) {
    const r = (a * Math.PI) / 180, len = a === 40 ? 150 : 110
    d += branch(0, 0, a, len)
    for (const t of [0.35, 0.6, 0.82]) { const x = Math.cos(r) * len * t, y = Math.sin(r) * len * t, l = 28 * (1.1 - t); d += branch(x, y, a - 50, l) + branch(x, y, a + 50, l) }
  }
  return (
    <div style={style} className={`pointer-events-none fixed z-[5] size-[clamp(120px,15vw,230px)] max-md:hidden ${className}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_0_0,rgba(186,230,253,.42),rgba(186,230,253,.12)_45%,transparent_72%)]" />
      <svg viewBox="0 0 160 160" className="absolute inset-0 size-full" fill="none" stroke="rgba(224,242,254,.55)" strokeWidth="1.1" strokeLinecap="round"><path d={d} /></svg>
    </div>
  )
}

/** A garland draped along the top edge, with a few twinkling lights. */
function Garland({ style }: { style?: React.CSSProperties }) {
  const lights: [number, number, string, number][] = [[70, 33, '#ef4444', 0], [150, 44, '#fbbf24', 0.5], [235, 40, '#60a5fa', 1], [320, 27, '#ef4444', 1.5], [400, 22, '#34d399', 0.8], [480, 29, '#fbbf24', 0.2]]
  return (
    <svg style={style} viewBox="0 0 560 70" className="pointer-events-none fixed top-0 z-[5] w-[clamp(280px,42vw,640px)] max-md:hidden" fill="none" aria-hidden>
      <path d="M0 8Q70 62 140 38T280 28T420 18T560 12" stroke="#14532d" strokeWidth="11" strokeLinecap="round" />
      <path d="M0 8Q70 62 140 38T280 28T420 18T560 12" stroke="#22803f" strokeWidth="7" strokeLinecap="round" strokeDasharray="2 5" />
      {[[105, 52], [210, 36], [350, 22], [470, 20]].map(([x, y], n) => <g key={n}><circle cx={x} cy={y} r="4.2" fill="#dc2626" /><circle cx={x + 6} cy={y - 1} r="3.4" fill="#ef4444" /></g>)}
      {lights.map(([x, y, c, dl], n) => <g key={n}><path d={`M${x} ${y}v7`} stroke="#0b3d1d" strokeWidth="1.5" /><circle className="twinkle" cx={x} cy={y + 10} r="4" fill={c} style={{ animationDelay: `${dl}s` }} /></g>)}
    </svg>
  )
}

/** A little stack of presents. */
function Presents({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 90" className={className} aria-hidden>
      <rect x="6" y="40" width="50" height="46" rx="3" fill="#b91c1c" /><rect x="27" y="40" width="8" height="46" fill="#fbbf24" /><rect x="6" y="56" width="50" height="7" fill="#fbbf24" opacity=".9" />
      <path d="M31 40c-8-14-22-8-14 0zM31 40c8-14 22-8 14 0z" fill="#fbbf24" />
      <rect x="58" y="52" width="38" height="34" rx="3" fill="#15803d" /><rect x="73" y="52" width="8" height="34" fill="#fca5a5" />
      <path d="M77 52c-7-11-18-6-12 0zM77 52c7-11 18-6 12 0z" fill="#fca5a5" />
      <rect x="86" y="66" width="28" height="20" rx="3" fill="#7c3aed" /><rect x="97" y="66" width="6" height="20" fill="#fde68a" />
    </svg>
  )
}

function Frost() {
  return (
    <>
      <Snow />
      <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0 z-[5] h-[26vh] bg-linear-to-t from-[#7dd3fc]/[.15] via-[#7dd3fc]/[.05] to-transparent" />
      <FrostCorner className="top-0" style={{ left: 'var(--rail)' }} />
      <FrostCorner className="top-0 right-0 -scale-x-100" />
      <FrostCorner className="bottom-0 right-0 -scale-100" />
      <FrostCorner className="bottom-0 -scale-y-100" style={{ left: 'var(--rail)' }} />
    </>
  )
}

function Festive() {
  return (
    <>
      <Snow count={8} />
      <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0 z-[5] h-[26vh] bg-linear-to-t from-[#e11d48]/[.15] via-[#15803d]/[.05] to-transparent" />
      <Garland style={{ left: 'var(--rail)' }} />
      <Presents className="pointer-events-none fixed bottom-2 right-3 z-[5] w-[clamp(60px,7vw,110px)] max-md:hidden" />
    </>
  )
}

/** Seasonal atmosphere: spooky fog and embers in October; snow, frost or garlands in December. All kept faint and mostly still. */
export function SeasonalAmbient() {
  const { key } = useTheme()
  if (key === 'halloween') return <Spooky />
  if (key === 'frost') return <Frost />
  if (key === 'festive') return <Festive />
  return null
}
