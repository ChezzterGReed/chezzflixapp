import { useEffect, useRef, useState } from 'react'
import { scrollTo } from '../lib/scroll'
import { BIG_IMAGE } from '../lib/perf'
import { Info, Play } from 'lucide-react'
import { FocusContext, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { Focusable } from './Focusable'
import { backdropPath, episodeLabel, formatRuntime, imageUrl, logoPath, type PlexMedia, type PlexServer } from '../lib/plex'

const ROTATE_MS = 8000

function playLabel(m: PlexMedia): string {
  const next = m.type === 'show' ? m.OnDeck?.Metadata : undefined
  if (next) return `${next.viewOffset ? 'Resume' : 'Play'} ${episodeLabel(next)}`.trim()
  return m.viewOffset ? 'Resume' : 'Play'
}

function Meta({ m }: { m: PlexMedia }) {
  const score = m.audienceRating ?? m.rating
  const length = m.type === 'show' ? (m.childCount ? `${m.childCount} Season${m.childCount > 1 ? 's' : ''}` : '') : formatRuntime(m.duration)
  const bits = [m.year, length, ...(m.Genre ?? []).slice(0, 3).map((g) => g.tag)].filter(Boolean)
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.95rem] font-medium text-white/85">
      {score ? <span className="flex items-center gap-1 font-bold text-white"><span className="text-accent">★</span>{score.toFixed(1)}</span> : null}
      {m.contentRating && <span className="rounded border border-white/40 px-1.5 py-px text-[0.75rem] font-semibold">{m.contentRating}</span>}
      {bits.map((b, i) => <span key={i} className="flex items-center gap-3">{i > 0 || score || m.contentRating ? <i className="size-1 rounded-full bg-white/40" /> : null}{b}</span>)}
    </div>
  )
}

interface Props { items: PlexMedia[]; server: PlexServer; rotate: boolean; /** Focus key of the active tab, so Up from the banner reaches the tab bar. */ tabKey: string; onPlay: (m: PlexMedia) => void; onInfo: (m: PlexMedia) => void }

export function Hero({ items, server, rotate, tabKey, onPlay, onInfo }: Props) {
  const [i, setI] = useState(0)
  // Pauses only while the pointer rests on the title/buttons (so you can read or click) — never because the Play button happens to hold focus.
  const [hover, setHover] = useState(false)
  const { ref, focusKey } = useFocusable({ trackChildren: true, focusKey: 'HERO', saveLastFocusedChild: true, autoRestoreFocus: false })
  const paused = hover || !rotate || items.length < 2
  // Set while the slideshow advances itself: the buttons remount and briefly regain focus, which must not scroll the page.
  const auto = useRef(false)

  useEffect(() => {
    if (paused) return
    const t = setTimeout(() => { auto.current = true; setI((x) => (x + 1) % items.length); setTimeout(() => { auto.current = false }, 700) }, ROTATE_MS)
    return () => clearTimeout(t)
  }, [i, paused, items.length])

  const m = items[i]
  const logo = logoPath(m)
  // The tab bar floats over the banner, so spatial navigation can't tell it's "above": go there directly.
  const up = (dir: string) => { if (dir === 'up') { setFocus(tabKey); return false } }
  const toTop = () => { if (!auto.current) scrollTo(window, 'y', 0) }

  return (
    <FocusContext.Provider value={focusKey}>
      <header ref={ref}
        className="relative h-[66vh] min-h-[480px] max-h-[820px] w-full overflow-hidden">
        {/* Backdrops crossfade; only neighbours are mounted so we don't pull every image up front */}
        {items.map((it, n) => Math.abs(n - i) <= 1 || (i === 0 && n === items.length - 1) ? (
          <img key={it.ratingKey} src={imageUrl(server, backdropPath(it), BIG_IMAGE.w, BIG_IMAGE.h)} alt="" draggable={false}
            className={`absolute inset-0 h-full w-full object-cover object-[50%_20%] transition-opacity duration-[1100ms] ease-in-out ${n === i ? 'opacity-100' : 'opacity-0'}`} />
        ) : null)}
        <div className="absolute inset-0 bg-linear-to-r from-bg via-bg/70 via-35% to-transparent to-75%" />
        <div className="absolute inset-0 bg-linear-to-t from-bg via-transparent via-40% to-transparent" />
        <div className="absolute inset-x-0 top-0 h-40 bg-linear-to-b from-black/60 to-transparent" />

        <div key={m.ratingKey} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} className="fade-up absolute bottom-[12%] left-[var(--gutter)] max-w-[min(640px,52vw)]">
          {logo
            ? <img src={imageUrl(server, logo, 800, 300)} alt={m.title} className="mb-5 max-h-36 max-w-[28rem] object-contain object-left drop-shadow-2xl" />
            : <h1 className="mb-4 text-[clamp(2.6rem,5.6vw,5.4rem)] font-extrabold leading-[0.98] tracking-[-0.035em] drop-shadow-2xl">{m.title}</h1>}
          <Meta m={m} />
          <p className="clamp-3 mt-4 max-w-[34rem] text-[1.05rem] leading-relaxed text-white/80">{m.summary}</p>
          <div className="mt-7 flex items-center gap-3">
            <Focusable focusKey="hero-play" onEnter={() => onPlay(m)} onFocus={toTop} onArrow={up} title="Play" leftToRail>
              <div className="flex h-13 items-center gap-2.5 rounded-full bg-white px-8 text-[1.05rem] font-bold text-black transition-all duration-200 group-hover/f:bg-white/90 group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]">
                <Play size={20} fill="currentColor" />{playLabel(m)}
              </div>
            </Focusable>
            <Focusable focusKey="hero-info" onEnter={() => onInfo(m)} onFocus={toTop} onArrow={up} title="More info">
              <div className="flex h-13 items-center gap-2.5 rounded-full bg-white/15 px-7 text-[1.05rem] font-semibold backdrop-blur-md transition-all duration-200 group-hover/f:bg-white/25 group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:bg-white/30 group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]">
                <Info size={20} />More info
              </div>
            </Focusable>
          </div>
        </div>

        {items.length > 1 && (
          <div className="absolute bottom-[11%] right-[var(--gutter)] flex items-center">
            {items.map((it, n) => (
              <Focusable key={it.ratingKey} onEnter={() => setI(n)} onFocus={() => setI(n)} onArrow={up} title={`Show ${it.title}`}>
                <div className="group/dot grid size-8 place-items-center" aria-current={n === i}>
                  <span className={`block rounded-full transition-all duration-300 group-hover/dot:scale-125 group-data-[hl=true]/f:scale-150 group-data-[hl=true]/f:bg-white ${n === i ? 'size-3 bg-accent shadow-[0_0_12px_var(--accent)]' : 'size-2 bg-white/40 group-hover/dot:bg-white/80'}`} />
                </div>
              </Focusable>
            ))}
          </div>
        )}
      </header>
    </FocusContext.Provider>
  )
}

export function HeroSkeleton() {
  return (
    <div className="relative h-[66vh] min-h-[480px] max-h-[820px] w-full">
      <div className="skeleton absolute inset-0" />
      <div className="absolute bottom-[12%] left-[var(--gutter)] space-y-4">
        <div className="h-16 w-96 rounded-lg bg-white/5" /><div className="h-4 w-72 rounded bg-white/5" /><div className="h-4 w-[30rem] rounded bg-white/5" />
      </div>
    </div>
  )
}
