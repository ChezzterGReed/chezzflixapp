import { useEffect, useRef } from 'react'

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
