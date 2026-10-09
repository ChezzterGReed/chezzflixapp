import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { FocusContext, getCurrentFocusKey, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { useBack } from '../lib/back'

/** An overlay that traps D-pad focus inside it, closes on Back/Escape, and restores focus when dismissed. */
export function Layer({ onClose, children, className = '', scrim = 'bg-black/60 backdrop-blur-sm', focusKey: fk, player }: { onClose: () => void; children: ReactNode; className?: string; scrim?: string; focusKey?: string; player?: boolean }) {
  const { ref, focusKey } = useFocusable({ focusKey: fk, isFocusBoundary: true, focusBoundaryDirections: ['up', 'down', 'left', 'right'] })
  useBack(onClose)
  useEffect(() => {
    const prev = getCurrentFocusKey()
    const t = setTimeout(() => setFocus(focusKey), 30)
    return () => { clearTimeout(t); if (prev) setTimeout(() => setFocus(prev), 0) }
  }, [focusKey])
  // `player`: lives inside #root marked data-player, so it stays visible while native (mpv) video shows through the page.
  // Rendered at the top of <body>: an ancestor with a transform/animation would otherwise trap this popup beneath its siblings.
  return createPortal(
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} data-layer {...(player ? { 'data-player': '' } : {})} className={`fixed inset-0 z-50 ${scrim} fade-in`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div className={className}>{children}</div>
      </div>
    </FocusContext.Provider>,
    player ? document.getElementById('root') ?? document.body : document.body,
  )
}
