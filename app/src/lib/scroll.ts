// One scroller for "keep the focused thing in view". The old approach asked the browser for a smooth scroll on every focus change; hold a
// direction and those animations restart over and over, which looks jittery and lags behind the cursor. Here each scrollable area has a
// single animation that glides toward the LATEST target (exponential easing), so rapid moves feel continuous and always catch up.

interface Anim { target: number; raf: number; last: number }
const anims = new Map<Element | Window, { x?: Anim; y?: Anim }>()
const TAU = 85   // ms: how quickly it closes in on the target

const isRoot = (s: Element | Window): s is Window => s === window
const pos = (s: Element | Window, axis: 'x' | 'y') => (isRoot(s) ? (axis === 'y' ? window.scrollY : window.scrollX) : axis === 'y' ? (s as Element).scrollTop : (s as Element).scrollLeft)
const maxPos = (s: Element | Window, axis: 'x' | 'y') => {
  if (isRoot(s)) { const d = document.documentElement; return axis === 'y' ? d.scrollHeight - window.innerHeight : d.scrollWidth - window.innerWidth }
  const e = s as Element; return axis === 'y' ? e.scrollHeight - e.clientHeight : e.scrollWidth - e.clientWidth
}
const set = (s: Element | Window, axis: 'x' | 'y', v: number) => {
  if (isRoot(s)) window.scrollTo({ [axis === 'y' ? 'top' : 'left']: v, behavior: 'instant' } as ScrollToOptions)
  else (s as Element).scrollTo({ [axis === 'y' ? 'top' : 'left']: v, behavior: 'instant' } as ScrollToOptions)
}

/** Glide a scroller toward `target` along one axis. Calling again just moves the target; the motion stays smooth. */
export function scrollTo(s: Element | Window, axis: 'x' | 'y', target: number, instant = false) {
  const t = Math.max(0, Math.min(maxPos(s, axis), target))
  const entry = anims.get(s) ?? {}; anims.set(s, entry)
  const cur = entry[axis]
  if (instant || Math.abs(t - pos(s, axis)) < 1) { if (cur) cancelAnimationFrame(cur.raf); entry[axis] = undefined; set(s, axis, t); return }
  if (cur) { cur.target = t; return }
  const a: Anim = { target: t, raf: 0, last: performance.now() }
  entry[axis] = a
  const tick = (now: number) => {
    const dt = Math.min(64, now - a.last); a.last = now
    const p = pos(s, axis), diff = a.target - p
    if (Math.abs(diff) < 0.6) { set(s, axis, a.target); entry[axis] = undefined; return }
    set(s, axis, p + diff * (1 - Math.exp(-dt / TAU)))
    a.raf = requestAnimationFrame(tick)
  }
  a.raf = requestAnimationFrame(tick)
}

function scroller(el: HTMLElement, axis: 'x' | 'y'): Element | Window {
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    const st = getComputedStyle(n)
    const ov = axis === 'y' ? st.overflowY : st.overflowX
    if ((ov === 'auto' || ov === 'scroll') && (axis === 'y' ? n.scrollHeight > n.clientHeight + 1 : n.scrollWidth > n.clientWidth + 1)) return n
  }
  return window
}

export interface RevealOpts { block?: 'center' | 'nearest' | 'none'; inline?: 'center' | 'nearest' | 'none'; margin?: number }

/** Bring `el` into view inside whatever scrolls around it, gliding smoothly. */
export function reveal(el: HTMLElement, { block = 'center', inline = 'none', margin = 24 }: RevealOpts = {}) {
  const r = el.getBoundingClientRect()
  for (const axis of ['y', 'x'] as const) {
    const mode = axis === 'y' ? block : inline
    if (mode === 'none') continue
    const s = scroller(el, axis)
    const box = isRoot(s) ? { start: 0, end: axis === 'y' ? window.innerHeight : window.innerWidth } : (() => { const b = (s as Element).getBoundingClientRect(); return axis === 'y' ? { start: b.top, end: b.bottom } : { start: b.left, end: b.right } })()
    const a0 = axis === 'y' ? r.top : r.left, a1 = axis === 'y' ? r.bottom : r.right
    const cur = pos(s, axis)
    if (mode === 'center') scrollTo(s, axis, cur + ((a0 + a1) / 2 - (box.start + box.end) / 2))
    else if (a0 < box.start + margin) scrollTo(s, axis, cur - (box.start + margin - a0))
    else if (a1 > box.end - margin) scrollTo(s, axis, cur + (a1 - (box.end - margin)))
  }
}

/** If `el` sits inside a scrolling panel (Settings, a popup, the side menu's library list), keep it visible there. Does nothing for the page itself. */
export function revealInPanel(el: HTMLElement) {
  if (scroller(el, 'y') !== window) reveal(el, { block: 'nearest', inline: 'none', margin: 56 })
}

/** Scroll the panel or page that contains `el` back to its top (used when focus returns to the top of a long screen). */
export function scrollToTopOf(el: HTMLElement) { scrollTo(scroller(el, 'y'), 'y', 0) }
