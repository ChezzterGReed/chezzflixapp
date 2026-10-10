import { useSeason } from '../lib/settings'

/** A very faint seasonal atmosphere behind the content. Currently: drifting fog and a few embers for spooky season. */
export function SeasonalAmbient() {
  const season = useSeason()
  if (season !== 'halloween') return null
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="fog fog-1" /><div className="fog fog-2" />
      {Array.from({ length: 5 }, (_, n) => (
        <i key={n} className="mote ember" style={{ left: `${(n * 37 + 11) % 100}%`, width: 3, height: 3, animationDuration: `${30 + n * 5}s`, animationDelay: `${-n * 4}s`, ['--drift' as string]: `${(n % 2 ? 1 : -1) * 18}px` }} />
      ))}
    </div>
  )
}
