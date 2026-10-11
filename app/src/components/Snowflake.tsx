/** A six-armed snowflake, icy blue and white. */
export function Snowflake({ size = 20, className = '' }: { size?: number; className?: string }) {
  const arm = (
    <g>
      <path d="M16 16V3" />
      <path d="M16 7l-3-3M16 7l3-3M16 11l-2.4-2.4M16 11l2.4-2.4" />
    </g>
  )
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden fill="none" stroke="url(#sf)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="sf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#7dd3fc" /></linearGradient>
      </defs>
      {[0, 60, 120, 180, 240, 300].map((a) => <g key={a} transform={`rotate(${a} 16 16)`}>{arm}</g>)}
      <circle cx="16" cy="16" r="2" fill="#e0f2fe" stroke="none" />
    </svg>
  )
}
