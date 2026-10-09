import { useMemo } from 'react'

/** The animated backdrop shared by the loading, sign-in and setup screens: drifting colour, plus rising motes (embers in spooky season). */
export function Aurora({ particles = 22 }: { particles?: number }) {
  const motes = useMemo(() => Array.from({ length: particles }, (_, n) => ({
    left: (n * 53 + 7) % 100, size: 2 + ((n * 7) % 5), dur: 14 + ((n * 5) % 12), delay: -((n * 3.7) % 20), drift: ((n * 17) % 40) - 20,
  })), [particles])
  return (
    <div aria-hidden className="loading-scene absolute inset-0 overflow-hidden bg-[#07070a]">
      <div className="orb orb-a" /><div className="orb orb-b" /><div className="orb orb-c" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,.75)_100%)]" />
      {motes.map((p, n) => (
        <i key={n} className="mote" style={{ left: `${p.left}%`, width: p.size, height: p.size, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`, ['--drift' as string]: `${p.drift}px` }} />
      ))}
    </div>
  )
}
