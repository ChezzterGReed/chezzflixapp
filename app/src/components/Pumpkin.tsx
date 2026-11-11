import { useId } from 'react'

/** Ids must be unique per drawing (several are on screen at once, and a hidden one must not break the others). */
export const useArtId = () => useId().replace(/[^a-zA-Z0-9]/g, '')

/*
 * The holiday art shares one flat, cel-shaded look: no outlines, one base colour with a single darker shade and a single lighter highlight
 * (both clipped to the shape, so each piece reads as ONE object), rounded forms, a small white glint, and simple faces where there are any.
 */

/** A polygon with softly rounded corners, as a path (corner radius `r`). */
function soft(pts: [number, number][], r: number): string {
  const n = pts.length
  let d = ''
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n]
    const toward = (a: [number, number], b: [number, number]) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, t = Math.min(r, l / 2) / l; return [a[0] + dx * t, a[1] + dy * t] as const }
    const s = toward(p1, p0), e = toward(p1, p2)
    d += `${i ? 'L' : 'M'}${s[0].toFixed(2)} ${s[1].toFixed(2)}Q${p1[0]} ${p1[1]} ${e[0].toFixed(2)} ${e[1].toFixed(2)}`
  }
  return d + 'Z'
}

/**
 * A cute jack-o'-lantern. A plump body of three lobes (the middle one a shade lighter, so the ribs show without any drawn lines), shade and a
 * highlight cut to the body, and a face that is carved out of the same surface: the openings glow warm, with the cut's own edge casting a
 * thin shadow along the top. Everything sits inside the body with room to spare.
 */
export function Pumpkin({ size = 20, className = '' }: { size?: number; className?: string }) {
  const k = useArtId()
  const eye = (cx: number) => soft([[cx, 25.600], [cx + 4.200, 33.200], [cx - 4.200, 33.200]], 1.700)
  const nose = soft([[32, 36.400], [34, 40], [30, 40]], 1)
  const mouth = 'M22.400 42.600Q22.600 41.400 24 41.800Q32 43.400 40 41.800Q41.400 41.400 41.600 42.600Q41.400 49.800 32 50.600Q22.600 49.800 22.400 42.600Z'
  const face = `${eye(25)}${eye(39)}${nose}${mouth}`
  const tooth = (x: number) => soft([[x - 1.700, 41.200], [x + 1.700, 41.200], [x + 1.700, 45], [x - 1.700, 45]], 0.9)
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden>
      <defs>
        <clipPath id={`b${k}`}><ellipse cx="18" cy="36.500" rx="15" ry="19" /><ellipse cx="46" cy="36.500" rx="15" ry="19" /><ellipse cx="32" cy="36.500" rx="14.500" ry="20.500" /></clipPath>
        <path id={`f${k}`} d={face} />
        <clipPath id={`c${k}`}><use href={`#f${k}`} /></clipPath>
      </defs>
      <ellipse cx="32" cy="59.500" rx="21" ry="2.800" fill="#000" opacity=".2" />
      {/* stem and leaf (behind the body, so they grow out of it) */}
      <path d="M32 20C31.500 15 33 11.500 37.500 9" stroke="#7a5a2e" strokeWidth="5.400" strokeLinecap="round" fill="none" />
      <path d="M32.600 17C32.200 14.500 33.400 12.400 35.600 10.800" stroke="#a07c46" strokeWidth="1.700" strokeLinecap="round" fill="none" />
      <path d="M38 12C40.500 6.500 47.500 6.500 51 10.500C47 14.800 41 14.800 38 12Z" fill="#62b03c" />
      <path d="M39.500 12C43 10.200 46.600 10.200 49.500 10.600" stroke="#4a8f2c" strokeWidth="1.400" strokeLinecap="round" fill="none" />
      {/* body */}
      <g fill="#ff8a1f"><ellipse cx="18" cy="36.500" rx="15" ry="19" /><ellipse cx="46" cy="36.500" rx="15" ry="19" /></g>
      <ellipse cx="32" cy="36.500" rx="14.500" ry="20.500" fill="#ff9630" />
      <g clipPath={`url(#b${k})`}>
        <ellipse cx="65" cy="40" rx="15" ry="30" fill="#e5661a" />
        <ellipse cx="32" cy="79" rx="30" ry="24" fill="#e5661a" />
        <path d="M17.800 22C13.500 31 13.500 43 18.500 52M46.200 22C50.500 31 50.500 43 45.500 52" stroke="#e5661a" strokeWidth="1.800" strokeLinecap="round" fill="none" />
        <path d="M9.500 33Q9 27 13.500 23.500" stroke="#ffc07a" strokeWidth="2.600" strokeLinecap="round" fill="none" />
        <circle cx="12.500" cy="41.500" r="3.200" fill="#ff5f6d" opacity=".3" /><circle cx="51" cy="41.500" r="3.200" fill="#ff5f6d" opacity=".22" />
        <g clipPath={`url(#c${k})`}>
          <rect width="64" height="64" fill="#b8400c" />
          <use href={`#f${k}`} transform="translate(0 1.700)" fill="#ffd04a" />
        </g>
        <path d={tooth(29)} fill="#ff9630" /><path d={tooth(35)} fill="#ff9630" />
      </g>
    </svg>
  )
}
