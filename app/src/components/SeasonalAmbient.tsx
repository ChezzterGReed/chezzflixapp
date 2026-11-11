import { useTheme } from '../lib/settings'
import { Leaf } from './Leaf'
import { useArtId } from './Pumpkin'
import { Bat, Ghost } from './Spooks'
import { useMinimal } from '../lib/layout'

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
      <div aria-hidden className="pointer-events-none fixed right-[5vw] top-[3vh] z-[5] flex items-end gap-2 max-md:hidden">
        <Bat size={20} className="mb-3 -rotate-12 opacity-90" /><Bat size={28} className="bat-flap" /><Bat size={16} className="mb-5 rotate-12 opacity-90" />
      </div>
      <Ghost size={54} className="ghost-float pointer-events-none fixed bottom-3 right-4 z-[5] max-md:hidden" />
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

/** A garland draped along the whole top edge (rail to edge), with twinkling lights. The tabs sit above it, so it runs on behind them. */
function Garland() {
  const W = 1600, swag = 200, H = 70
  const colours = ['#ef4444', '#fbbf24', '#60a5fa', '#34d399']
  let d = ''
  const lights: { x: number; y: number; c: string; dl: number }[] = [], berries: { x: number; y: number }[] = []
  for (let i = 0; i * swag < W; i++) {
    const x0 = i * swag, y0 = 8, cx = x0 + swag / 2, cy = 60, x2 = x0 + swag, y2 = 8
    d += `${i ? '' : `M${x0} ${y0}`}Q${cx} ${cy} ${x2} ${y2}`
    const at = (t: number) => ({ x: (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x2, y: (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y2 })
    ;[0.2, 0.4, 0.6, 0.8].forEach((t, n) => { const p = at(t); lights.push({ x: p.x, y: p.y, c: colours[(i * 4 + n) % colours.length], dl: ((i * 4 + n) % 5) * 0.4 }) })
    ;[0.5].forEach((t) => berries.push(at(t)))
  }
  return (
    <div aria-hidden className="pointer-events-none fixed right-0 top-0 z-[5] h-[clamp(46px,5.5vw,84px)] max-md:hidden" style={{ left: 'var(--rail)' }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMin slice" className="absolute inset-0 size-full" fill="none">
        <path d={d} stroke="#14532d" strokeWidth="11" strokeLinecap="round" />
        <path d={d} stroke="#22803f" strokeWidth="7" strokeLinecap="round" strokeDasharray="2 5" />
        {berries.map((p, n) => <g key={n}><circle cx={p.x} cy={p.y + 1} r="4.2" fill="#dc2626" /><circle cx={p.x + 6} cy={p.y} r="3.4" fill="#ef4444" /></g>)}
        {lights.map((l, n) => <g key={n}><path d={`M${l.x} ${l.y}v7`} stroke="#0b3d1d" strokeWidth="1.5" /><circle className="twinkle" cx={l.x} cy={l.y + 10} r="4" fill={l.c} style={{ animationDelay: `${l.dl}s` }} /></g>)}
      </svg>
    </div>
  )
}

/** A little stack of presents, in the same glossy two-tone style as the rest. */
function Presents({ className = '' }: { className?: string }) {
  const k = useArtId()
  const box = (id: string, a: string, b: string) => <linearGradient id={`${id}${k}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient>
  return (
    <svg viewBox="0 0 128 96" className={className} aria-hidden>
      <defs>{box('r', '#f0506b', '#a8123a')}{box('g', '#35b36a', '#13683a')}{box('v', '#9b7bea', '#5b34b0')}</defs>
      <ellipse cx="64" cy="92" rx="54" ry="3.600" fill="#000" opacity=".2" />
      <rect x="6" y="40" width="54" height="50" rx="6" fill={`url(#r${k})`} /><rect x="29" y="40" width="9" height="50" fill="#ffe08a" /><rect x="6" y="58" width="54" height="8" fill="#ffe08a" opacity=".92" />
      <path d="M33.500 40C24 24 10 31 21 40zM33.500 40C43 24 57 31 46 40z" fill="#ffd45e" /><circle cx="33.500" cy="39" r="4" fill="#f5b52c" />
      <rect x="62" y="54" width="40" height="36" rx="6" fill={`url(#g${k})`} /><rect x="78" y="54" width="8" height="36" fill="#ffc9d4" />
      <path d="M82 54C74 42 62 47 70 54zM82 54C90 42 102 47 94 54z" fill="#ffc9d4" />
      <rect x="92" y="68" width="30" height="22" rx="5" fill={`url(#v${k})`} /><rect x="104" y="68" width="6" height="22" fill="#ffe9a8" />
      <path d="M13 46h10M68 62h6M98 74h4" stroke="#fff" strokeOpacity=".4" strokeWidth="2.400" strokeLinecap="round" />
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
      <Garland />
      <Presents className="pointer-events-none fixed bottom-2 right-3 z-[5] w-[clamp(60px,7vw,110px)] max-md:hidden" />
    </>
  )
}

/** Thanksgiving: a few autumn leaves drifting down (switched off in low-power mode), a warm glow along the bottom, and leaves gathered in two corners. */
function Harvest() {
  const tones = ['orange', 'red', 'gold', 'brown', 'orange'] as const
  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        {Array.from({ length: 9 }, (_, n) => (
          <Leaf key={n} tone={tones[n % tones.length]} size={20 + (n % 3) * 6} className="leaf" style={{ left: `${(n * 37 + 8) % 100}%`, animationDuration: `${24 + (n % 5) * 5}s`, animationDelay: `${-n * 3.4}s`, ['--drift' as string]: `${(n % 2 ? 1 : -1) * (6 + (n % 4) * 3)}vw`, ['--turn' as string]: `${(n % 2 ? 1 : -1) * (200 + n * 40)}deg` }} />
        ))}
      </div>
      <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0 z-[5] h-[26vh] bg-linear-to-t from-[#c8702a]/[.17] via-[#8c3b17]/[.06] to-transparent" />
      <div aria-hidden className="pointer-events-none fixed top-0 z-[5] flex gap-1 max-md:hidden" style={{ right: '3vw' }}>
        <Leaf size={40} tone="red" className="-mt-3 rotate-[18deg] opacity-80" /><Leaf size={30} tone="gold" className="-rotate-[24deg] opacity-80" /><Leaf size={26} tone="orange" className="-mt-1 rotate-[52deg] opacity-80" />
      </div>
      <div aria-hidden className="pointer-events-none fixed bottom-1 z-[5] flex items-end gap-1 max-md:hidden" style={{ left: 'calc(var(--rail) + 14px)' }}>
        <Leaf size={34} tone="brown" className="-rotate-[14deg] opacity-85" /><Leaf size={26} tone="orange" className="mb-1 rotate-[30deg] opacity-85" /><Leaf size={22} tone="gold" className="-rotate-[60deg] opacity-85" />
      </div>
    </>
  )
}

/** Seasonal atmosphere: spooky fog and embers in October; snow, frost or garlands in December. All kept faint and mostly still. */
export function SeasonalAmbient() {
  const { key } = useTheme()
  const minimal = useMinimal()   // (no side rail in Minimal, so the corner decorations sit right in the corner)
  const art = key === 'halloween' ? <Spooky /> : key === 'frost' ? <Frost /> : key === 'festive' ? <Festive /> : key === 'harvest' ? <Harvest /> : null
  return art && <div className="contents" style={minimal ? { ['--rail' as string]: '0px' } : undefined}>{art}</div>
}
