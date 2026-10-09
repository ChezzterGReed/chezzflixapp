import logo from '../assets/logo.png'

/** The Chezzflix mark (a cut-out portrait with a transparent background). Sized by height; width follows. */
export function Logo({ size = 44, className = '' }: { size?: number; className?: string }) {
  return <img src={logo} alt="" draggable={false} decoding="async" className={`select-none object-contain ${className}`} style={{ height: size, width: size * 1.145 }} />
}
