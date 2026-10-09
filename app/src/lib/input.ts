import { useSyncExternalStore } from 'react'

// One source of truth for "what is highlighted": the input mode (remote/keyboard vs mouse) and the single focused element.
// Highlights come from here rather than each button's own flag, so two buttons can never both look selected.
export type InputMode = 'key' | 'mouse'
let mode: InputMode = 'key'
let focusedKey: string | null = null
const subs = new Set<() => void>()
const notify = () => subs.forEach((f) => f())

const isEditable = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable)
let typing = false
function setTyping(v: boolean) { if (v !== typing) { typing = v; notify() } }
/** True while a text field has the cursor (search box, settings fields). */
export function useTyping(): boolean { return useSyncExternalStore(subscribe, () => typing) }

export function setMode(next: InputMode) {
  if (next === mode) return
  mode = next
  document.documentElement.dataset.input = next
  notify()
}

export function setFocusedKey(key: string | null) {
  if (key === focusedKey) return
  focusedKey = key
  notify()
}

if (typeof window !== 'undefined') {
  document.documentElement.dataset.input = mode
  // Typing into a text field isn't navigation: only arrows, Enter, Escape etc. switch to remote/keyboard mode there.
  window.addEventListener('keydown', (e) => { if (isEditable(e.target) && (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete')) return; setMode('key') }, true)
  window.addEventListener('focusin', (e) => setTyping(isEditable(e.target)), true)
  window.addEventListener('focusout', () => setTyping(false), true)
  window.addEventListener('pointerdown', () => setMode('mouse'), true)
  let lastX = 0, lastY = 0
  window.addEventListener('mousemove', (e) => {
    if (Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY) > 4) setMode('mouse')
    lastX = e.clientX; lastY = e.clientY
  }, true)
}

const subscribe = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb) } }

export function useInputMode(): InputMode {
  return useSyncExternalStore(subscribe, () => mode)
}

/** True only for the one focused element, and only while a remote/keyboard is in use. */
export function useIsFocused(key: string): boolean {
  return useSyncExternalStore(subscribe, () => mode === 'key' && focusedKey === key)
}
