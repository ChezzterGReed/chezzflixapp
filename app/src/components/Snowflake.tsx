import { useArtId } from './Pumpkin'

/** A chunky snowflake in the shared flat style: icy white arms over one darker blue copy of themselves (the shade), with bobble tips. */
export function Snowflake({ size = 20, className = '' }: { size?: number; className?: string }) {
  const k = useArtId()
  const arms = (
    <>
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <g key={a} transform={`rotate(${a} 32 32)`}>
          <path d="M32 32V10" /><path d="M32 20l-6-6M32 20l6-6M32 27l-4.500-4.500M32 27l4.500-4.500" /><circle cx="32" cy="7.500" r="2.800" stroke="none" />
        </g>
      ))}
      <circle cx="32" cy="32" r="5" stroke="none" />
    </>
  )
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden fill="none" strokeWidth="3.800" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="32" cy="32" r="30" fill={`url(#h${k})`} />
      <defs><radialGradient id={`h${k}`}><stop offset="0" stopColor="#bae6fd" stopOpacity=".4" /><stop offset="1" stopColor="#bae6fd" stopOpacity="0" /></radialGradient></defs>
      <g stroke="#7cc4ee" fill="#7cc4ee" transform="translate(1.200 1.500)">{arms}</g>
      <g stroke="#f2fbff" fill="#f2fbff">{arms}</g>
      <circle cx="32" cy="32" r="2" fill="#a9dcf7" stroke="none" />
    </svg>
  )
}
