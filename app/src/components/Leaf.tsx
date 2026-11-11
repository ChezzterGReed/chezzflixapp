import { useArtId } from './Pumpkin'

const TONES = {
  orange: ['#f08a2c', '#d4691c', '#ffb25e'],
  red: ['#e2573a', '#bd3a22', '#ff8461'],
  gold: ['#f2b92f', '#d4931a', '#ffd965'],
  brown: ['#b8692a', '#8f4a1c', '#d8944f'],
} as const
export type LeafTone = keyof typeof TONES

/** An autumn leaf in the shared flat style: one colour, a darker half for shade, a lighter streak, simple veins, and a stem. */
export function Leaf({ size = 20, className = '', tone = 'orange', style }: { size?: number; className?: string; tone?: LeafTone; style?: React.CSSProperties }) {
  const k = useArtId()
  const [base, shade, light] = TONES[tone]
  const d = 'M32 5C34 11 40 12 46 10C45 17 49 20 55 22C50 27 51 32 55 38C48 38 45 42 44 48C39 45 35 46 32 53C29 46 25 45 20 48C19 42 16 38 9 38C13 32 14 27 9 22C15 20 19 17 18 10C24 12 30 11 32 5Z'
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} style={style} aria-hidden>
      <defs><clipPath id={`c${k}`}><path d={d} /></clipPath></defs>
      <path d="M32 50V60" stroke={shade} strokeWidth="3.800" strokeLinecap="round" />
      <path d={d} fill={base} />
      <g clipPath={`url(#c${k})`}>
        <rect x="32" y="0" width="30" height="64" fill={shade} />
        <ellipse cx="22.500" cy="22" rx="3.400" ry="7" fill={light} transform="rotate(-28 22.500 22)" />
        <path d="M32 14V50M32 27L22 19M32 27L42 19M32 38L20 30M32 38L44 30" stroke="#fff" strokeOpacity=".4" strokeWidth="1.900" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  )
}
