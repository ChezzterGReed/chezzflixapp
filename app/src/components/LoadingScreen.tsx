import { useEffect, useState } from 'react'
import { Aurora } from './Aurora'

const MESSAGES = ['Connecting to your server…', 'Gathering your libraries…', 'Dimming the lights…', 'Cueing up something good…']

/** Full-screen loading scene: the aurora backdrop, a ringed logo, the service name easing in, and rotating status lines. */
export function LoadingScreen({ visible }: { visible: boolean }) {
  const [mounted, setMounted] = useState(visible)
  const [i, setI] = useState(0)
  useEffect(() => {
    if (visible) { setMounted(true); return }
    const t = setTimeout(() => setMounted(false), 800)
    return () => clearTimeout(t)
  }, [visible])
  useEffect(() => { if (!visible) return; const t = setInterval(() => setI((x) => (x + 1) % MESSAGES.length), 2300); return () => clearInterval(t) }, [visible])

  const brand = (() => { try { return localStorage.getItem('chezzflix_last_brand') || 'CHEZZFLIX' } catch { return 'CHEZZFLIX' } })()

  if (!mounted) return null
  return (
    <div aria-live="polite" className={`fixed inset-0 z-[90] overflow-hidden transition-opacity duration-700 ease-in-out ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
      <Aurora />
      <div className="relative z-10 grid h-full place-items-center">
        <div className="text-center">
          <div className="relative mx-auto mb-7 grid size-24 place-items-center">
            <span className="ring-spin absolute inset-0 rounded-full" />
            <span className="absolute inset-[5px] rounded-full bg-[#07070a]" />
            <span className="logo-breathe relative grid size-14 place-items-center rounded-2xl bg-accent text-3xl font-extrabold text-black shadow-[0_0_50px_-4px_var(--accent)]">{brand[0]}</span>
          </div>
          <div className="mb-3 flex justify-center text-[1.05rem] font-extrabold tracking-[0.34em]">
            {[...brand].map((ch, n) => <span key={n} className="letter-in" style={{ animationDelay: `${n * 70}ms` }}>{ch}</span>)}
          </div>
          <div key={i} className="fade-in h-5 text-sm tracking-wide text-white/50">{MESSAGES[i]}</div>
          <div className="mx-auto mt-5 h-[3px] w-44 overflow-hidden rounded-full bg-white/10"><span className="load-bar block h-full w-1/3 rounded-full bg-accent" /></div>
        </div>
      </div>
    </div>
  )
}
