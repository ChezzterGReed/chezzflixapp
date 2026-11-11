import { useArtId } from './Pumpkin'

/** A bauble in the shared flat style: one red ball with a single shade and highlight, a gold cap, a cream swirl, dots and a sparkle. */
export function Ornament({ size = 20, className = '', hue = 0 }: { size?: number; className?: string; /** Rotates the colour (0 = red, ~120 = green, ~50 = gold). */ hue?: number }) {
  const k = useArtId()
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} style={hue ? { filter: `hue-rotate(${hue}deg)` } : undefined} aria-hidden>
      <defs><clipPath id={`b${k}`}><circle cx="32" cy="39" r="22" /></clipPath></defs>
      <ellipse cx="32" cy="62" rx="14" ry="2" fill="#000" opacity=".2" />
      <path d="M32 3.500c-3 0-4.500 1.800-4.500 4.500v3h9V8c0-2.700-1.500-4.500-4.500-4.500z" fill="none" stroke="#f5b52c" strokeWidth="2.800" />
      <circle cx="32" cy="39" r="22" fill="#e8334f" />
      <g clipPath={`url(#b${k})`}>
        <ellipse cx="42" cy="58" rx="30" ry="17" fill="#c21f3f" />
        <path d="M8 36c8-4 12-2 24 1.500s16 3 26 0" fill="none" stroke="#fff0c2" strokeWidth="3.400" strokeLinecap="round" />
        <g fill="#fff0c2"><circle cx="20" cy="47" r="2" /><circle cx="32" cy="51" r="2" /><circle cx="44" cy="47" r="2" /><circle cx="26" cy="27" r="1.700" /><circle cx="39" cy="27" r="1.700" /></g>
        <ellipse cx="22.500" cy="26" rx="5" ry="3" fill="#fff" opacity=".55" transform="rotate(-32 22.500 26)" />
      </g>
      <rect x="25" y="10" width="14" height="8.500" rx="2.800" fill="#f5b52c" />
      <rect x="25" y="14.500" width="14" height="4" rx="2" fill="#dc9a14" />
      <path d="M51 9l1.400 3.600 3.600 1.400-3.600 1.400L51 19l-1.400-3.600L46 14l3.600-1.400z" fill="#fff" />
    </svg>
  )
}
