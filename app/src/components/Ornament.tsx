/** A Christmas bauble: red with a gold cap and a highlight. */
export function Ornament({ size = 20, className = '', hue = 0 }: { size?: number; className?: string; /** Rotates the colour (0 = red, ~120 = green, ~50 = gold). */ hue?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} style={hue ? { filter: `hue-rotate(${hue}deg)` } : undefined} aria-hidden>
      <defs>
        <radialGradient id="orn" cx=".38" cy=".34" r=".85"><stop offset="0" stopColor="#ff6b81" /><stop offset=".55" stopColor="#e11d48" /><stop offset="1" stopColor="#881337" /></radialGradient>
      </defs>
      <path d="M16 1.5c-1.4 0-2 1-2 2.2v1.8h4V3.7c0-1.2-.6-2.2-2-2.2z" fill="none" stroke="#fbbf24" strokeWidth="1.4" />
      <rect x="12.6" y="5" width="6.8" height="3.6" rx="1" fill="#fbbf24" />
      <circle cx="16" cy="19" r="10.5" fill="url(#orn)" />
      <path d="M7.5 17c3-1 5-.6 8.5.4s5.600 1.200 8.500 0" fill="none" stroke="#fde68a" strokeWidth="1.3" strokeLinecap="round" opacity=".85" />
      <ellipse cx="12" cy="14" rx="2.6" ry="1.6" fill="#fff" opacity=".45" transform="rotate(-30 12 14)" />
    </svg>
  )
}
