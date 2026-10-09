import { useEffect, useRef } from 'react'
import { setMode } from './input'

// Stack of "go back" handlers. The most recently mounted layer (overlay, menu, detail page) wins.
const stack: (() => void)[] = []
let bound = false

function bind() {
  if (bound) return
  bound = true
  window.addEventListener('keydown', (e) => {
    const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
    const isBack = e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack' || (e.key === 'Backspace' && !inField)
    if (isBack && stack.length) { e.preventDefault(); stack[stack.length - 1]() }
  })
}

/** Android: the Back button asks the app first. Returns true when something handled it (so the app stays open). */
if (typeof window !== 'undefined') (window as unknown as { __chezzBack: () => boolean }).__chezzBack = () => { setMode('key'); if (!stack.length) return false; stack[stack.length - 1](); return true }

export function useBack(handler: () => void, active = true) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    if (!active) return
    bind()
    const fn = () => ref.current()
    stack.push(fn)
    return () => { const i = stack.indexOf(fn); if (i >= 0) stack.splice(i, 1) }
  }, [active])
}
