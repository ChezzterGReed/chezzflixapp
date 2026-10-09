import { useRef, type ReactNode } from 'react'
import { setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { setFocusedKey, useIsFocused } from '../lib/input'

const LONG_PRESS_MS = 550

interface Props {
  focusKey?: string
  onEnter?: () => void
  /** Long-press (hold OK / hold the mouse button / touch) or right-click: used for context menus. */
  onLongPress?: () => void
  onFocus?: (el: HTMLElement) => void
  className?: string
  title?: string
  /** Pressing Left here hands focus to the nav rail (for full-bleed content that spatial nav can't see past). */
  leftToRail?: boolean
  /** Pressing Right here hands focus to the main content (used by the nav rail). */
  rightToContent?: boolean
  children: ReactNode | ((focused: boolean) => ReactNode)
}

/** A D-pad/keyboard/mouse focus target. Style with `group-data-[hl=true]/f:`. */
export function Focusable({ focusKey, onEnter, onLongPress, onFocus, className = '', title, leftToRail, rightToContent, children }: Props) {
  const keyRef = useRef('')
  const keyTimer = useRef<number>(0)
  const keyLong = useRef(false)
  const ptrTimer = useRef<number>(0)
  const ptrLong = useRef(false)

  const { ref, focusSelf, focusKey: fk } = useFocusable({
    focusKey,
    // With a long-press action, the short action fires on release so holding doesn't also trigger it.
    onEnterPress: onLongPress
      ? () => {
          if (keyTimer.current) return // key auto-repeat
          keyLong.current = false
          keyTimer.current = window.setTimeout(() => { keyLong.current = true; keyTimer.current = 0; onLongPress() }, LONG_PRESS_MS)
        }
      : onEnter,
    onEnterRelease: onLongPress
      ? () => {
          if (keyTimer.current) { clearTimeout(keyTimer.current); keyTimer.current = 0; if (!keyLong.current) onEnter?.() }
          keyLong.current = false
        }
      : undefined,
    onFocus: () => { setFocusedKey(keyRef.current); if (ref.current) onFocus?.(ref.current as HTMLElement) },
    onArrowPress: (dir) => {
      if (dir === 'left' && leftToRail) { setFocus('SIDEBAR'); return false }
      if (dir === 'right' && rightToContent) { setFocus('MAIN'); return false }
      return true
    },
  })
  keyRef.current = fk
  const focused = useIsFocused(fk)

  const pointer = onLongPress ? {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return
      ptrLong.current = false
      clearTimeout(ptrTimer.current)
      ptrTimer.current = window.setTimeout(() => { ptrLong.current = true; onLongPress() }, LONG_PRESS_MS)
    },
    onPointerUp: () => clearTimeout(ptrTimer.current),
    onPointerLeave: () => clearTimeout(ptrTimer.current),
    onPointerCancel: () => clearTimeout(ptrTimer.current),
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); clearTimeout(ptrTimer.current); ptrLong.current = true; onLongPress() },
  } : {}

  return (
    <div ref={ref} role="button" aria-label={title} data-hl={focused} {...pointer}
      onClick={() => { if (ptrLong.current) { ptrLong.current = false; return } focusSelf(); onEnter?.() }} className={`group/f ${className}`}>
      {typeof children === 'function' ? children(focused) : children}
    </div>
  )
}
