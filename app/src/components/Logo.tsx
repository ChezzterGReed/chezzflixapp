import logo from '../assets/logo.png'
import { SeasonIcon } from './SeasonIcon'
import { useSeason } from '../lib/settings'

/** The Chezzflix mark (a cut-out portrait with a transparent background). Sized by height; width follows. In season it's the season's emblem (a pumpkin, snowflake or bauble). */
export function Logo({ size = 44, className = '' }: { size?: number; className?: string }) {
  const season = useSeason()
  if (season) {
    return <span className={`grid select-none place-items-center ${className}`} style={{ height: size, width: size * 1.145 }}><SeasonIcon size={Math.round(size * 0.68)} /></span>
  }
  return <img src={logo} alt="" draggable={false} decoding="async" className={`select-none object-contain ${className}`} style={{ height: size, width: size * 1.145 }} />
}
