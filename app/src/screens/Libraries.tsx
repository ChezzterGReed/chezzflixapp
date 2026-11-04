import { useEffect, useRef, useState } from 'react'
import { Check, Film, Library as LibraryIcon, Pin, PinOff, RefreshCw, Tv, X } from 'lucide-react'
import { FocusContext, doesFocusableExist, getCurrentFocusKey, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { Focusable } from '../components/Focusable'
import { Layer } from '../components/Layer'
import { Library } from './Library'
import { useSettings } from '../lib/settings'
import type { PlexCollectionRef, PlexMedia, PlexSection, PlexServer } from '../lib/plex'

const typeIcon = (s: PlexSection, size = 22) => (s.type === 'movie' ? <Film size={size} /> : <Tv size={size} />)

/** Every library, with a switch for each: which ones are listed in the side list (and on Home and in search). */
function AllLibraries({ all, hidden, onToggle, onOpen, onClose }: { all: PlexSection[]; hidden: string[]; onToggle: (s: PlexSection) => void; onOpen: (s: PlexSection) => void; onClose: () => void }) {
  return (
    <Layer onClose={onClose} scrim="bg-black/60 backdrop-blur-sm" className="absolute left-1/2 top-1/2 w-[min(520px,92vw)] -translate-x-1/2 -translate-y-1/2">
      <div className="pop overflow-hidden rounded-3xl bg-[#17171c]/95 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10">
        <div className="px-6 pb-1 pt-5 font-display text-[1.4rem] tracking-[0.12em]">ALL LIBRARIES</div>
        <p className="px-6 pb-2 text-sm text-white/55">Choose which libraries are listed. OK switches one on or off; the arrow opens it.</p>
        <div className="max-h-[min(55vh,480px)] space-y-1 overflow-y-auto overscroll-contain p-3 pt-1">
          {all.map((s) => {
            const off = hidden.includes(s.key)
            return (
              <div key={s.key} className="flex items-center gap-1.5">
                <div className="min-w-0 flex-1">
                  <Focusable focusKey={`all-${s.key}`} onEnter={() => onToggle(s)} title={s.title}>
                    <div className={`flex h-12 items-center gap-3 rounded-xl px-3.5 text-[1rem] font-semibold transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${off ? 'text-white/40' : ''}`}>
                      {typeIcon(s, 20)}<span className="min-w-0 flex-1 truncate">{s.title}</span>
                      <span className={`grid size-6 place-items-center rounded-md ring-1 ${off ? 'ring-white/25' : 'bg-accent text-black ring-accent'}`}>{!off && <Check size={16} strokeWidth={3} />}</span>
                    </div>
                  </Focusable>
                </div>
                <Focusable focusKey={`allopen-${s.key}`} onEnter={() => onOpen(s)} title={`Open ${s.title}`}>
                  <div className="grid h-12 place-items-center rounded-xl px-4 text-lg font-bold text-white/70 transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">›</div>
                </Focusable>
              </div>
            )
          })}
        </div>
      </div>
    </Layer>
  )
}

/** Hold OK on a library in the side list: keep it in the list (or take it off), or ask the server to look for new files in it. */
function LibraryMenu({ section, pinned, onPin, onScan, onClose }: { section: PlexSection; pinned: boolean; onPin: () => void; onScan: () => void; onClose: () => void }) {
  const Row = ({ icon, label, onEnter }: { icon: React.ReactNode; label: string; onEnter: () => void }) => (
    <Focusable onEnter={() => { onClose(); onEnter() }}>
      <div className="flex h-12 items-center gap-3 rounded-xl px-3.5 text-[0.95rem] font-semibold transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">{icon}{label}</div>
    </Focusable>
  )
  return (
    <Layer onClose={onClose} scrim="bg-black/55 backdrop-blur-sm" className="absolute left-1/2 top-1/2 w-[min(380px,92vw)] -translate-x-1/2 -translate-y-1/2">
      <div className="pop overflow-hidden rounded-3xl bg-[#17171c]/95 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10">
        <div className="flex items-center gap-3 p-4 pb-3">
          <span className="grid size-10 place-items-center rounded-xl bg-white/10">{typeIcon(section, 20)}</span>
          <div className="min-w-0 flex-1 truncate text-[1.05rem] font-bold">{section.title}</div>
          <Focusable onEnter={onClose} title="Close"><div className="grid size-9 place-items-center rounded-full transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><X size={18} /></div></Focusable>
        </div>
        <div className="space-y-0.5 p-2 pt-0">
          <Row icon={pinned ? <PinOff size={20} /> : <Pin size={20} />} label={pinned ? 'Unpin from the list' : 'Pin to the list'} onEnter={onPin} />
          <Row icon={<RefreshCw size={20} />} label="Refresh library" onEnter={onScan} />
        </div>
      </div>
    </Layer>
  )
}

/**
 * The Minimal layout's Libraries tab: the libraries you have switched on run down the left (a slim strip of icons that opens while the cursor is on it),
 * the chosen one's titles fill the rest. "View all" lists every library with a switch for each.
 */
export function Libraries({ server, token, all, onOpen, onShuffle, onBrowse, onCollection, onScan, start }: {
  server: PlexServer; token: string; all: PlexSection[]
  onOpen: (m: PlexMedia) => void; onShuffle: (items: PlexMedia[]) => void; onBrowse: (s: PlexSection, kind: 'genres' | 'collections') => void; onCollection: (c: PlexCollectionRef) => void; onScan: (s: PlexSection) => void
  start?: PlexSection
}) {
  const { settings, update } = useSettings()
  const enabled = all.filter((s) => !settings.hiddenLibraries.includes(s.key))
  const [selKey, setSel] = useState((start ?? enabled[0] ?? all[0])?.key)
  const sel = all.find((s) => s.key === selKey) ?? enabled[0] ?? all[0]
  const [picker, setPicker] = useState(false)
  const [menuFor, setMenuFor] = useState<PlexSection>()
  const { ref, focusKey, hasFocusedChild } = useFocusable({ focusKey: 'LIBNAV', saveLastFocusedChild: true, autoRestoreFocus: false, trackChildren: true })
  const open = hasFocusedChild
  const content = useRef<HTMLDivElement>(null)
  const keyOf = (s: PlexSection) => `lib-${s.key}`   // fixed per library: a focus key can't change once its button is on screen
  const selNow = useRef(''); selNow.current = sel ? keyOf(sel) : ''
  const toggle = (s: PlexSection) => {
    const off = settings.hiddenLibraries.includes(s.key)
    update({ hiddenLibraries: off ? settings.hiddenLibraries.filter((k) => k !== s.key) : [...settings.hiddenLibraries, s.key] })
  }

  // The edges of the content: Up from the top row reaches the tabs (not the letters down the side), and Right from the last column reaches the letters.
  useEffect(() => {
    const centre = (el: Element) => { const r = el.getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2, r } }
    const h = (e: KeyboardEvent) => {
      if ((e.key !== 'ArrowUp' && e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || document.querySelector('[data-layer]')) return
      const key = getCurrentFocusKey()
      if (!key) return
      const cur = document.querySelector(`[data-fk="${key}"]`)
      const root = content.current
      if (!cur || !root) return
      const inAlpha = !!cur.closest('[data-alpha]')
      const inContent = root.contains(cur) && !inAlpha
      if (!inAlpha && !inContent) return
      const me = centre(cur)
      const letters = [...document.querySelectorAll('[data-alpha] [data-fk]')]
      const content_ = [...root.querySelectorAll('[data-fk]')].filter((n) => !n.closest('[data-alpha]') && n !== cur)
      if (e.key === 'ArrowUp') {
        const pool = inAlpha ? letters.filter((n) => n !== cur) : content_
        if (pool.some((n) => centre(n).y < me.y - 12)) return   // something is still above
        e.preventDefault(); e.stopPropagation(); setFocus('mtab-libraries')
      } else if (e.key === 'ArrowLeft') {
        if (inAlpha || content_.some((n) => { const c = centre(n); return c.x < me.x - 12 && Math.abs(c.y - me.y) < 40 })) return   // something is still to the left
        const side = doesFocusableExist(selNow.current) ? selNow.current : 'lib-viewall'
        e.preventDefault(); e.stopPropagation(); setFocus(side)
      } else if (inContent && letters.length) {
        if (content_.some((n) => { const c = centre(n); return c.x > me.x + 12 && Math.abs(c.y - me.y) < 40 })) return   // something is still to the right
        const near = letters.reduce((a, b) => (Math.abs(centre(b).y - me.y) < Math.abs(centre(a).y - me.y) ? b : a))
        const fk = near.getAttribute('data-fk')
        if (fk) { e.preventDefault(); e.stopPropagation(); setFocus(fk) }
      }
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [])

  return (
    <div className="min-h-screen pt-28">
      <FocusContext.Provider value={focusKey}>
        <aside ref={ref} data-open={open} className={`fixed bottom-0 left-0 top-0 z-[30] overflow-y-auto overscroll-contain px-3 pb-8 pt-28 transition-[width] duration-300 ease-out-expo m-hide-scroll ${open ? 'w-[19rem] bg-linear-to-r from-black/95 via-black/90 to-black/60' : 'w-[5rem]'}`}>
          <div className="space-y-1.5">
            {enabled.map((s, i) => (
              <Focusable key={s.key} focusKey={keyOf(s)} onEnter={() => setSel(s.key)} onLongPress={() => setMenuFor(s)} title={s.title} onArrow={(d) => {
                if (d === 'up') { setFocus(i === 0 ? 'mtab-libraries' : keyOf(enabled[i - 1])); return false }
                if (d === 'down') { setFocus(i === enabled.length - 1 ? 'lib-viewall' : keyOf(enabled[i + 1])); return false }
                if (d === 'left') return false
              }}>
                <div className={`flex h-12 items-center overflow-hidden rounded-xl transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${s.key === sel?.key ? 'bg-white/14 text-white' : 'text-white/65'}`}>
                  <span className="grid w-[3.5rem] shrink-0 place-items-center">{typeIcon(s)}</span>
                  <span className={`min-w-0 flex-1 truncate pr-4 text-[1rem] font-semibold transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}>{s.title}</span>
                </div>
              </Focusable>
            ))}
            <Focusable focusKey="lib-viewall" onEnter={() => setPicker(true)} title="View all libraries" onArrow={(d) => { if (d === 'up') { setFocus(enabled.length ? keyOf(enabled[enabled.length - 1]) : 'mtab-libraries'); return false } if (d === 'down' || d === 'left') return false }}>
              <div className="flex h-12 items-center overflow-hidden rounded-xl text-white/65 transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">
                <span className="grid w-[3.5rem] shrink-0 place-items-center"><LibraryIcon size={22} /></span>
                <span className={`min-w-0 flex-1 truncate pr-4 text-[1rem] font-semibold transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}>View all</span>
              </div>
            </Focusable>
          </div>
        </aside>
      </FocusContext.Provider>
      {menuFor && <LibraryMenu section={menuFor} pinned={!settings.hiddenLibraries.includes(menuFor.key)} onPin={() => toggle(menuFor)} onScan={() => onScan(menuFor)} onClose={() => { const k = keyOf(menuFor); setMenuFor(undefined); setTimeout(() => setFocus(doesFocusableExist(k) ? k : 'lib-viewall'), 120) }} />}
      {picker && <AllLibraries all={all} hidden={settings.hiddenLibraries} onToggle={toggle} onClose={() => setPicker(false)} onOpen={(s) => { setSel(s.key); setPicker(false) }} />}
      <div ref={content} className="ml-[5rem]" style={{ ['--gutter' as string]: '28px' }}>
        {sel && <Library key={sel.key} server={server} token={token} section={sel} onOpen={onOpen} onShuffle={onShuffle} onBrowse={(kind) => onBrowse(sel, kind)} onCollection={onCollection} />}
      </div>
    </div>
  )
}
