import { useEffect, useMemo, useRef, useState } from 'react'
import { Clock } from './Clock'
import { backdropPath, getRandomItems, imageUrl, isOtherSection, type PlexMedia, type PlexSection, type PlexServer } from '../lib/plex'

const SLIDE_MS = 12_000
const MOVED_ENOUGH = 40   // a TV's phantom pointer jitter shouldn't wake it

// A slow drift for each background, a different one each time: zoom in, zoom out, or glide to one side. Only the picture's transform moves, which even a modest TV box can do smoothly.
const DRIFTS = [
  ['scale(1.04) translate(0%, 0%)', 'scale(1.16) translate(-1.6%, -1.2%)'],
  ['scale(1.16) translate(1.4%, 1%)', 'scale(1.05) translate(0%, 0%)'],
  ['scale(1.12) translate(2%, 0%)', 'scale(1.12) translate(-2%, 0%)'],
  ['scale(1.12) translate(-1.5%, 1.5%)', 'scale(1.12) translate(1.5%, -1.5%)'],
] as const

/** Builds the slideshow: full-screen backgrounds, in a random order. */
const buildSlides = (pool: PlexMedia[]): PlexMedia[] => pool.filter((m) => backdropPath(m)).slice(0, 24)

/**
 * After a few quiet minutes (and nothing playing) the screen drifts into a slideshow of what's on the server: backgrounds drifting slowly past.
 * Any key, click or real movement brings the app back (and is not passed on, so waking it never presses anything).
 */
export function Screensaver({ server, sections, enabled, minutes }: { server: PlexServer; sections: PlexSection[]; enabled: boolean; minutes: number }) {
  const [on, setOn] = useState(false)
  const [slides, setSlides] = useState<PlexMedia[]>([])
  const [at, setAt] = useState(0)
  // Coming in: the app fades to black, then the slideshow fades up. Going out: the slideshow fades to black, then the app fades back.
  const [mounted, setMounted] = useState(false)   // the overlay exists
  const [dark, setDark] = useState(false)          // the black layer is opaque
  const [content, setContent] = useState(false)    // the slideshow is showing
  const idle = useRef(0)
  const last = useRef({ x: -1, y: -1 })
  const onRef = useRef(false); onRef.current = on
  const pool = useRef<{ at: number; items: PlexMedia[] } | undefined>(undefined)
  const sectionKeys = useMemo(() => sections.filter((s) => (s.type === 'movie' || s.type === 'show') && !isOtherSection(s)).map((s) => s.key).join(','), [sections])

  // Waiting: any activity starts the countdown again.
  useEffect(() => {
    if (!enabled) { setOn(false); return }
    const arm = () => { clearTimeout(idle.current); idle.current = window.setTimeout(() => { if (!document.documentElement.dataset.nativeVideo) setOn(true) }, minutes * 60_000) }
    const wake = (e: Event) => {
      if (!onRef.current) { arm(); return }
      if (e.type === 'mousemove') { const m = e as MouseEvent; const d = Math.hypot(m.clientX - last.current.x, m.clientY - last.current.y); if (last.current.x < 0) { last.current = { x: m.clientX, y: m.clientY }; return } if (d < MOVED_ENOUGH) return }
      if (e.type !== 'mousemove') { e.preventDefault(); e.stopPropagation() }
      setOn(false); arm()
    }
    const evs = ['keydown', 'mousedown', 'mousemove', 'touchstart', 'wheel'] as const
    evs.forEach((n) => window.addEventListener(n, wake, true))
    arm()
    return () => { clearTimeout(idle.current); evs.forEach((n) => window.removeEventListener(n, wake, true)) }
  }, [enabled, minutes])

  useEffect(() => {
    if (on) {
      setMounted(true)
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setDark(true)))
      const t = setTimeout(() => setContent(true), 1100)
      return () => { cancelAnimationFrame(raf); clearTimeout(t) }
    }
    setContent(false)
    const t1 = setTimeout(() => setDark(false), 650)
    const t2 = setTimeout(() => setMounted(false), 650 + 1150)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [on])

  // Starting: gather something to show (fresh at most every half hour).
  useEffect(() => {
    if (!on) return
    last.current = { x: -1, y: -1 }
    let alive = true
    const fresh = pool.current && Date.now() - pool.current.at < 30 * 60_000
    const go = (items: PlexMedia[]) => { if (alive) { setSlides(buildSlides(items)); setAt(0) } }
    if (fresh) go(pool.current!.items)
    else Promise.all(sectionKeys.split(',').filter(Boolean).map((k) => getRandomItems(server, k, 40).catch(() => [] as PlexMedia[])))
      .then((lists) => {
        const items = lists.flat().sort(() => Math.random() - 0.5)
        pool.current = { at: Date.now(), items }
        go(items)
      })
    return () => { alive = false }
  }, [on, server, sectionKeys])

  useEffect(() => {
    if (!on || slides.length < 2) return
    const t = setInterval(() => setAt((i) => (i + 1) % slides.length), SLIDE_MS)
    return () => clearInterval(t)
  }, [on, slides.length])

  // The next picture is fetched ahead, so a change never waits.
  useEffect(() => {
    if (!on || !slides.length) return
    const n = slides[(at + 1) % slides.length]
    const i = new Image(); i.src = imageUrl(server, backdropPath(n), 1280, 720)
  }, [on, at, slides, server])

  if (!mounted) return null
  const s = slides[at]
  return (
    <div role="presentation" className={`fixed inset-0 z-[200] overflow-hidden bg-black transition-opacity duration-[1100ms] ease-in-out ${dark ? 'opacity-100' : 'opacity-0'} ${on ? '' : 'pointer-events-none'}`}>
      <div className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${content ? 'opacity-100' : 'opacity-0'}`}>
      {s && (
        <div key={at} className="ss-slide absolute inset-0">
          <img src={imageUrl(server, backdropPath(s), 1280, 720)} alt="" draggable={false} className="ss-pan absolute inset-0 size-full object-cover"
            style={{ '--kb-from': DRIFTS[at % DRIFTS.length][0], '--kb-to': DRIFTS[at % DRIFTS.length][1] } as React.CSSProperties} />
          <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-black/40" />
          <div className="absolute bottom-12 left-14 max-w-[60vw]">
            <div className="text-[clamp(1.6rem,3vw,2.8rem)] font-extrabold tracking-tight drop-shadow-lg">{s.title}</div>
            {s.year ? <div className="mt-1 text-lg font-semibold text-white/70">{s.year}</div> : null}
          </div>
        </div>
      )}
      <Clock className="absolute right-14 top-10 text-3xl font-semibold text-white/80 drop-shadow" />
      </div>
    </div>
  )
}
