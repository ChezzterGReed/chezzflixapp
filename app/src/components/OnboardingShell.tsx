import type { ReactNode } from 'react'
import { Aurora } from './Aurora'

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
      <span className={`grid place-items-center rounded-xl bg-accent font-extrabold text-black shadow-[0_0_34px_-6px_var(--accent)] ${size === 'lg' ? 'size-12 text-2xl' : 'size-9 text-lg'}`}>{brand[0]}</span>
      <span className={`font-extrabold tracking-[0.3em] ${size === 'lg' ? 'text-lg' : 'text-sm'}`}>{brand}</span>
    </div>
  )
}
