import { useEffect, useState } from 'react'

const now = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** The device's clock, in the person's own 12 / 24 hour format. */
export function Clock({ className = '' }: { className?: string }) {
  const [t, setT] = useState(now)
  useEffect(() => { const i = setInterval(() => setT(now()), 5000); return () => clearInterval(i) }, [])
  return <time aria-label="Current time" className={`tabular-nums ${className}`}>{t}</time>
}
