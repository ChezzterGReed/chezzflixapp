import logo from '../assets/logo.png'
import { Pumpkin } from './Pumpkin'
import { useSeason } from '../lib/settings'

/** The Chezzflix mark (a cut-out portrait with a transparent background). Sized by height; width follows. In spooky season it's a pumpkin. */
export function Logo({ size = 44, className = '' }: { size?: number; className?: string }) {
  const season = useSeason()
  if (season === 'halloween') {
    return <span className={`grid select-none place-items-center ${className}`} style={{ height: size, width: size * 1.145 }}><Pumpkin size={Math.round(size * 0.68)} className="drop-shadow-[0_0_14px_rgba(255,122,26,.55)]" /></span>
  }
  return <img src={logo} alt="" draggable={false} decoding="async" className={`select-none object-contain ${className}`} style={{ height: size, width: size * 1.145 }} />
}
