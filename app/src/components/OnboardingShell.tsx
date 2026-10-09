import type { ReactNode } from 'react'
import { Aurora } from './Aurora'
import { Logo } from './Logo'

/** Full-screen stage for sign-in and setup screens: animated backdrop, content truly centred (and scrollable on tiny windows). */
export function OnboardingShell({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="fixed inset-0"><Aurora /></div>
      <div className="fixed inset-0 overflow-y-auto">
        <div className="relative z-10 mx-auto grid min-h-full w-full place-items-center px-6 py-10">{children}</div>
      </div>
    </>
  )
}

export function BrandMark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const brand = (() => { try { return localStorage.getItem('chezzflix_last_brand') || 'CHEZZFLIX' } catch { return 'CHEZZFLIX' } })()
  return (
    <div className="flex items-center justify-center gap-3">
      <Logo size={size === 'lg' ? 96 : 76} className="drop-shadow-[0_6px_18px_rgba(0,0,0,.5)]" />
      <span className={`font-display tracking-[0.24em] ${size === 'lg' ? 'text-2xl' : 'text-lg'}`}>{brand}</span>
    </div>
  )
}
