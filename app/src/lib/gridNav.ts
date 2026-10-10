import { useEffect, type RefObject } from 'react'
import { getCurrentFocusKey, setFocus } from '@noriginmedia/norigin-spatial-navigation'

/**
 * Up / Down inside grids of cards: go to the row above or below, onto the card closest to where you are. Plain spatial navigation can skip a
 * short row (a row of 2 under a row of 6, when you're on the 5th card) because nothing sits directly below; this never does.
 * Mark each card's wrapper with `data-grid-cell`; everything inside `container` is treated as one grid, however many sections it has.
 */
export function useGridNav(container: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (document.querySelector('[data-layer]')) return   // a popup owns the keys
      const root = container.current, key = getCurrentFocusKey()
      if (!root || !key) return
      const cur = root.querySelector<HTMLElement>(`[data-grid-cell] [data-fk="${key}"]`)
      if (!cur) return
      const cards = [...root.querySelectorAll<HTMLElement>('[data-grid-cell] [data-fk]')]
      const box = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return { cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2, top: r.top } }
      // Rows = cards sharing (about) the same top edge. The focused card is scaled up, so compare by centre line.
      const me = box(cur)
      const rows: { y: number; items: { el: HTMLElement; cx: number }[] }[] = []
      for (const el of cards) {
        const b = box(el)
        const row = rows.find((r) => Math.abs(r.y - b.cy) < 40)
        if (row) row.items.push({ el, cx: b.cx }); else rows.push({ y: b.cy, items: [{ el, cx: b.cx }] })
      }
      rows.sort((a, b) => a.y - b.y)
      const at = rows.findIndex((r) => Math.abs(r.y - me.cy) < 40)
      const next = rows[at + (e.key === 'ArrowDown' ? 1 : -1)]
      if (at < 0 || !next) return   // top or bottom row: leave it to the normal navigation
      const target = next.items.reduce((best, it) => (Math.abs(it.cx - me.cx) < Math.abs(best.cx - me.cx) ? it : best))
      const fk = target.el.getAttribute('data-fk')
      if (!fk) return
      e.preventDefault(); e.stopPropagation()
      setFocus(fk)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [container])
}
