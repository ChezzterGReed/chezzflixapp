import { useSyncExternalStore } from 'react'
import { navBlip } from './sfx'

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

// Timing of arrow presses, so "nothing further left" can be told apart from "still moving": navigation is async and slow on a TV.
let arrowAt = 0, arrowRepeat = false, focusAt = 0, latency = 80
export function setFocusedKey(key: string | null) {
  if (key === focusedKey) return
  focusedKey = key
  const now = performance.now()
  if (now - arrowAt < 900) latency = Math.max(40, Math.min(700, latency * 0.5 + (now - arrowAt) * 0.5))
  focusAt = now
  if (key && now - arrowAt < 300) navBlip()   // a step made with the arrow keys / remote (not programmatic focus)
  notify()
}
/** How long to wait after an arrow press before deciding focus really had nowhere to go (adapts to how slow this device is). */
export const settleMs = () => Math.round(Math.max(130, Math.min(650, latency * 1.8 + 60)))
/** True if focus just arrived somewhere, or the key is being held: pressing Left then shouldn't also open the side menu. */
// Screens that move their own cursor (the TV Guide grid) call noteMove(), so "nothing moved" checks elsewhere don't fire.
let moves = 0
export const noteMove = () => { moves++; focusAt = performance.now() }
export const moveCount = () => moves
export const justMoved = () => arrowRepeat || performance.now() - focusAt < 300

// Holding OK to open a menu must not also "press" whatever gets focus in it (the key keeps repeating until released).
let enterBlocked = false
export const blockEnterUntilRelease = () => { enterBlocked = true }

if (typeof window !== 'undefined') {
  document.documentElement.dataset.input = mode
  // Typing into a text field isn't navigation: only arrows, Enter, Escape etc. switch to remote/keyboard mode there.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && enterBlocked) { e.stopPropagation(); e.preventDefault(); return }
    if (e.key.startsWith('Arrow')) { arrowAt = performance.now(); arrowRepeat = e.repeat }
    if (isEditable(e.target) && (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete')) return; setMode('key')
  }, true)
  window.addEventListener('keyup', (e) => { if (e.key === 'Enter' && enterBlocked) { enterBlocked = false; e.stopPropagation(); e.preventDefault() } }, true)
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

/** The key of the one focused element (null if none): the source of truth for "where is the cursor". */
export function useFocusedKey(): string | null { return useSyncExternalStore(subscribe, () => focusedKey) }

export function useInputMode(): InputMode {
  return useSyncExternalStore(subscribe, () => mode)
}

/** True only for the one focused element, and only while a remote/keyboard is in use. */
export function useIsFocused(key: string): boolean {
  return useSyncExternalStore(subscribe, () => mode === 'key' && focusedKey === key)
}
