import { useState } from 'react'
import { artUrl } from '../lib/mock'

const COLORS = ['#ff4b3e', '#ffa21f', '#2ed1b4', '#43a8ff', '#7a7bff', '#b06bff', '#ff5c99']

/** Plex profile picture, falling back to a coloured initial if there isn't one (or it fails to load). */
export function Avatar({ name, thumb, size = 36, className = '' }: { name: string; thumb?: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false)
  const c = COLORS[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % COLORS.length]
  const src = thumb ? (thumb.startsWith('demo:') ? artUrl(thumb, size, size) : thumb) : ''
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-full ${className}`} style={{ width: size, height: size, background: c }}>
      <span className="absolute inset-0 grid place-items-center font-bold text-black" style={{ fontSize: size * 0.42 }}>{name.trim()[0]?.toUpperCase() ?? '?'}</span>
      {src && !failed && <img src={src} alt="" draggable={false} onError={() => setFailed(true)} className="absolute inset-0 size-full object-cover" />}
    </div>
  )
}
