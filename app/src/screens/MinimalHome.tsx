import { useEffect, useRef, useState } from 'react'
import { Info, Play } from 'lucide-react'
import { FocusContext, doesFocusableExist, getCurrentFocusKey, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { Focusable } from '../components/Focusable'
import { useItemMenu } from '../lib/itemMenu'
import { useFocusedKey } from '../lib/input'
import { scrollTo } from '../lib/scroll'
import { BIG_IMAGE, LOW_POWER } from '../lib/perf'
import { useSeason, useSettings } from '../lib/settings'
import { SeasonIcon } from '../components/SeasonIcon'
import { backdropPath, episodeLabel, formatRuntime, getSectionItems, imageUrl, logoPath, posterPath, progressOf, type PlexMedia, type PlexSection, type PlexServer } from '../lib/plex'
import type { AnimeInfo, HomeRow, Tab } from '../lib/homeData'
import { playLabel } from '../components/Hero'
import { HolidayCard, holidayEntries, type HolidayAction } from '../components/HolidayCards'
import { pendingFocus, tabDown } from '../lib/layout'

type MRowData = HomeRow & { recs?: boolean; typeTab?: Tab }

const POSTER = LOW_POWER ? [240, 360] as const : [360, 540] as const
const WIDE = LOW_POWER ? [480, 270] as const : [640, 360] as const
const ROTATE_MS = 8000

/** Short Movies / TV Shows / Anime rows for the end of Home (the row's name opens the whole section). */
function useTypeRows(server: PlexServer, sections: PlexSection[], anime: AnimeInfo | undefined, enabled: boolean): MRowData[] {
  const [rows, setRows] = useState<MRowData[]>([])
  const sig = sections.map((s) => s.key).join(',') + '|' + (anime?.items.length ?? 0)
  useEffect(() => {
    if (!enabled) { setRows([]); return }
    let alive = true
    const recent = async (type: 'movie' | 'show') => {
      const lists = await Promise.all(sections.filter((s) => s.type === type).map((s) => getSectionItems(server, s.key, 'addedAt:desc', 0, 18).then((r) => r.items).catch(() => [] as PlexMedia[])))
      return lists.flat().sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)).slice(0, 18)
    }
    Promise.all([recent('movie'), recent('show')]).then(([movies, shows]) => {
      if (!alive) return
      const out: MRowData[] = []
      if (movies.length) out.push({ id: 'type:movie', title: 'Movies', items: movies, typeTab: 'movie' })
      if (shows.length) out.push({ id: 'type:show', title: 'TV Shows', items: shows, typeTab: 'show' })
      const a = (anime?.items ?? []).slice(0, 18)
      if (a.length) out.push({ id: 'type:anime', title: 'Anime', items: a, typeTab: 'anime' })
      setRows(out)
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server, sig, enabled])
  return rows
}

function Meta({ m }: { m: PlexMedia }) {
  const score = m.audienceRating ?? m.rating
  const isEp = m.type === 'episode'
  const length = m.type === 'show' ? (m.childCount ? `${m.childCount} Season${m.childCount > 1 ? 's' : ''}` : '') : formatRuntime(m.duration)
  const bits = [m.year, length].filter(Boolean)
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[1.02rem] font-medium text-white/85">
      {isEp && <span className="font-bold text-white">{episodeLabel(m)}</span>}
      {score ? <span className="flex items-center gap-1 font-bold text-white"><span className="text-accent">★</span>{score.toFixed(1)}</span> : null}
      {m.contentRating && <span className="rounded border border-white/40 px-1.5 py-px text-[0.75rem] font-semibold">{m.contentRating}</span>}
      {bits.map((b, i) => <span key={i} className="flex items-center gap-3">{i > 0 || isEp || score || m.contentRating ? <i className="size-1 rounded-full bg-white/40" /> : null}{b}</span>)}
    </div>
  )
}

/** A full-screen picture that fades in; the bottom fifth is the same picture blurred, so its colours run on past the edge. */
function Backdrop({ m, server }: { m: PlexMedia; server: PlexServer }) {
  const src = imageUrl(server, backdropPath(m) ?? m.thumb, BIG_IMAGE.w, BIG_IMAGE.h)
  return (
    <div className="m-fade absolute inset-0">
      <img src={src} alt="" draggable={false} className="absolute inset-0 size-full object-cover object-[50%_25%]" />
      {!LOW_POWER && (
        <div className="absolute inset-x-0 bottom-0 h-[26vh] overflow-hidden" style={{ WebkitMaskImage: 'linear-gradient(to top, #000 50%, transparent)', maskImage: 'linear-gradient(to top, #000 50%, transparent)' }}>
          <img src={src} alt="" draggable={false} className="absolute bottom-0 left-0 h-screen w-full object-cover object-[50%_25%]" style={{ filter: 'blur(36px) saturate(1.15)', transform: 'scale(1.12)', transformOrigin: 'bottom' }} />
        </div>
      )}
    </div>
  )
}

function MCard({ m, server, row, wide, onEnter, onFocus, fromContinue, fromRecs, onUp }: { m: PlexMedia; server: PlexServer; row: number; wide: boolean; onEnter: () => void; onFocus: (el: HTMLElement) => void; fromContinue?: boolean; fromRecs?: boolean; onUp?: () => boolean }) {
  const openMenu = useItemMenu()
  const art = wide ? (m.type === 'episode' ? m.thumb : backdropPath(m) ?? m.thumb) : posterPath(m)
  const [w, h] = wide ? WIDE : POSTER
  const p = progressOf(m)
  const [loaded, setLoaded] = useState(false)
  return (
    <Focusable focusKey={`mcard-${row}-${m.ratingKey}`} onEnter={onEnter} onFocus={onFocus} title={m.title} className="shrink-0"
      onLongPress={m.type === 'collection' ? undefined : () => openMenu(m, { fromContinue, fromRecs })}
      onArrow={(d) => { if (d === 'up' && onUp) return onUp(); }}>
      <div className={`relative h-[var(--mh)] overflow-hidden rounded-2xl bg-white/8 transition-[transform,box-shadow] duration-200 ease-out group-data-[hl=true]/f:scale-[1.07] group-data-[hl=true]/f:shadow-[0_0_0_3px_#fff,0_18px_40px_-8px_rgba(0,0,0,.8)] ${wide ? 'aspect-video' : 'aspect-[2/3]'}`}>
        {art && <img src={imageUrl(server, art, w, h)} alt="" loading="lazy" decoding="async" draggable={false} onLoad={() => setLoaded(true)} className={`absolute inset-0 size-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`} />}
        {m.newSeason && <div className="absolute left-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">New</div>}
        {p > 0 && <div className="absolute inset-x-0 bottom-0 h-1.5 bg-white/25"><div className="h-full bg-accent" style={{ width: `${p * 100}%` }} /></div>}
      </div>
    </Focusable>
  )
}

function MRow({ idx, row, active, server, continueWide, onShow, onTitle, onUp, onPick, onHoliday, themed }: { onHoliday: (a: HolidayAction) => void; themed?: boolean; onPick: (m: PlexMedia, fromContinue?: boolean) => void; idx: number; row: MRowData; active: number; server: PlexServer; continueWide: boolean; onShow: (m: PlexMedia, idx: number) => void; onTitle?: () => void; onUp: () => boolean }) {
  const { ref, focusKey } = useFocusable({ focusKey: `mrow-${idx}`, saveLastFocusedChild: true, autoRestoreFocus: false })
  const track = useRef<HTMLDivElement>(null)
  const wide = !!row.continue && continueWide
  const rel = idx - active
  const opacity = rel < 0 ? 0 : rel === 0 ? 1 : rel === 1 ? 0.5 : 0
  return (
    <FocusContext.Provider value={focusKey}>
      <section ref={ref} className="h-[var(--mrow)] shrink-0 transition-opacity duration-300 ease-out" style={{ opacity }}>
        <div className="flex h-[2.7rem] items-center px-[var(--mg)]">
          {onTitle
            ? <Focusable focusKey={`mtitle-${idx}`} onEnter={onTitle} title={row.title} onFocus={() => onShow(row.items[0], idx)} onArrow={(d) => { if (d === 'up' && idx === 0) return onUp() }}>
                <div className="flex items-center gap-1.5 rounded-full px-4 py-1 text-[1.25rem] font-bold tracking-tight transition-colors group-hover/f:bg-white/15 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">{themed && <SeasonIcon size={24} className="-translate-y-px" />}<span className={themed ? 'text-accent group-data-[hl=true]/f:text-black' : ''}>{row.title}</span>{row.seasonal && <span className="ml-1 text-[0.9rem] font-semibold text-white/55 group-data-[hl=true]/f:text-black/60">See all {row.seasonal.total}</span>}<span className="text-white/50 group-data-[hl=true]/f:text-black/60">›</span></div>
              </Focusable>
            : <h2 className={`flex items-center gap-1.5 px-4 text-[1.25rem] font-bold tracking-tight ${themed ? 'text-accent' : 'text-white/90'}`}>{themed && <SeasonIcon size={24} className="-translate-y-px" />}{row.title}</h2>}
        </div>
        <div ref={track} className="m-hide-scroll flex gap-4 overflow-x-auto px-[var(--mg)] py-4 -my-1">
          {row.holiday && holidayEntries(row.holiday).map((e, n) => (
            <HolidayCard key={e.key} entry={e} row={row.holiday!} server={server} minimal focusKey={`mcard-${idx}-hol-${e.key}`}
              onUp={idx === 0 && !onTitle ? onUp : undefined}
              onEnter={() => onHoliday(e.action)}
              onFocus={(el) => {
                onShow(row.items[Math.min(n, row.items.length - 1)] ?? row.items[0], idx)
                const t = track.current
                if (!t) return
                const left = el.offsetLeft - t.scrollLeft, right = left + el.offsetWidth
                if (left < 56) scrollTo(t, 'x', el.offsetLeft - 56)
                else if (right > t.clientWidth - 140) scrollTo(t, 'x', t.scrollLeft + right - (t.clientWidth - 140))
              }} />
          ))}
          {!row.holiday && row.items.map((m) => (
            <MCard key={m.ratingKey} m={m} server={server} row={idx} wide={wide} fromContinue={row.continue} fromRecs={row.recs}
              onUp={idx === 0 && !onTitle ? onUp : undefined}
              onEnter={() => onPick(m, row.continue)}
              onFocus={(el) => {
                onShow(m, idx)
                // Only as far as needed to keep the card (and a hint of the next one) in view.
                const t = track.current
                if (!t) return
                const left = el.offsetLeft - t.scrollLeft, right = left + el.offsetWidth
                if (left < 56) scrollTo(t, 'x', el.offsetLeft - 56)
                else if (right > t.clientWidth - 140) scrollTo(t, 'x', t.scrollLeft + right - (t.clientWidth - 140))
              }} />
          ))}
        </div>
      </section>
    </FocusContext.Provider>
  )
}

interface Props {
  server: PlexServer
  /** Libraries switched on for this profile (for the Movies / TV Shows rows). */
  sections: PlexSection[]
  anime?: AnimeInfo
  tab: Tab
  hero?: PlexMedia[]
  rows: MRowData[] | undefined
  rotate: boolean
  onPlay: (m: PlexMedia, fromContinue?: boolean) => void
  onOpen: (m: PlexMedia) => void
  onType: (tab: Tab) => void
  /** Opens a seasonal list in full. */
  onSeasonal: (id: string) => void
  onHoliday: (a: HolidayAction) => void
  continueWide: boolean
}

/** The Minimal look: the picture fills the screen, the title and details sit over it, and one row at a time runs along the bottom. */
export function MinimalHome({ server, sections, anime, tab, hero, rows, rotate, onPlay, onOpen, onType, onSeasonal, onHoliday, continueWide }: Props) {
  const { settings } = useSettings()
  const season = useSeason()
  const key = useFocusedKey()
  const typeRows = useTypeRows(server, sections, anime, tab === 'all' && settings.minimalTypeRows)
  const all: MRowData[] = rows ? [...rows, ...typeRows] : []
  const [hi, setHi] = useState(0)
  const [seen, setSeen] = useState<PlexMedia>()      // the title the cursor was last on
  const [active, setActive] = useState(0)
  const [toHero, setToHero] = useState(false)   // heading up to the banner: its buttons are put back on screen first
  // Whether the view is down in the rows. The tabs don't change it: going up to them leaves the screen as it was.
  const [rowsMode, setRowsMode] = useState(false)
  const lastRow = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!key) return
    if (key.startsWith('mcard-') || key.startsWith('mtitle-') || key === 'mprofile') { setRowsMode(true); if (key !== 'mprofile') lastRow.current = key }
    else if (key.startsWith('hero-')) setRowsMode(false)
  }, [key])
  const inRows = !toHero && rowsMode
  const hasHero = !!hero?.length
  const heroItem = hasHero ? hero![hi % hero!.length] : undefined
  const shown = inRows ? seen ?? heroItem : heroItem ?? seen ?? all[0]?.items[0]
  const heroMode = !inRows && hasHero
  const pick = (m: PlexMedia, c?: boolean) => (m.type === 'collection' ? onOpen(m) : onPlay(m, c))

  // Back at the top (banner, tabs): the first row is the one in view again.
  useEffect(() => { if (key && key.startsWith('hero-')) setToHero(false) }, [key])
  useEffect(() => { if (key && key.startsWith('hero-')) setActive(0) }, [key])
  // Down from a tab: back to where the cursor was (the banner's button, or the card it was on).
  useEffect(() => {
    tabDown.fn = () => {
      if (rowsMode && lastRow.current && doesFocusableExist(lastRow.current)) return lastRow.current
      return doesFocusableExist('hero-play') ? 'hero-play' : doesFocusableExist('mrow-0') ? 'mrow-0' : undefined
    }
    return () => { tabDown.fn = null }
  }, [rowsMode, hero])

  // The recommended titles take turns while the cursor isn't down in the rows.
  useEffect(() => {
    if (!hasHero || hero!.length < 2 || !rotate || inRows) return
    const t = setTimeout(() => { if (!document.documentElement.dataset.nativeVideo) setHi((n) => (n + 1) % hero!.length) }, ROTATE_MS)
    return () => clearTimeout(t)
  }, [hi, hasHero, hero, rotate, inRows])

  // The picture crossfades: the new one fades in over the one before, which is dropped once it's covered.
  const [stack, setStack] = useState<PlexMedia[]>([])
  const shownKey = shown?.ratingKey
  useEffect(() => {
    if (!shown) return
    setStack((s) => [...s.filter((x) => x.ratingKey !== shown.ratingKey).slice(-1), shown])
    const t = setTimeout(() => setStack((s) => s.slice(-1)), 700)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey])

  // Land the cursor on something once there's something to land on (the banner's Play button when there is one, so it has been worked out first).
  const readyRows = !!rows, heroKnown = hero !== undefined
  useEffect(() => {
    if (!readyRows) return
    const land = () => {
      if (pendingFocus.key) { setTimeout(land, 2600); return }   // coming back to this screen: the cursor is being put back where it was
      const k = getCurrentFocusKey()
      if (k && k !== 'SN:ROOT' && k !== 'MAIN' && doesFocusableExist(k)) return
      setFocus(doesFocusableExist('hero-play') ? 'hero-play' : 'mrow-0')
    }
    const t = setTimeout(land, heroKnown ? 120 : 3000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyRows, heroKnown, tab])

  const toTop = () => { setFocus(tab === 'trending' ? 'mtab-trending' : 'mtab-home'); return false }
  const toRows = () => { if (doesFocusableExist('mrow-0')) setFocus('mrow-0'); return false }
  const upFromFirstRow = () => {
    if (!hasHero) return toTop()
    setToHero(true); setTimeout(() => setFocus('hero-play'), 40)
    return false
  }

  const m = shown
  const isEp = m?.type === 'episode'
  const title = m ? (isEp ? m.grandparentTitle ?? m.title : m.title) : ''
  const logo = m && !isEp ? logoPath(m) : undefined
  const long = title.length > 28 ? 1 : 0

  return (
    <div className="fixed inset-0 overflow-hidden bg-bg" style={{ ['--mh' as string]: 'clamp(150px, 22vh, 240px)', ['--mrow' as string]: 'calc(clamp(150px, 22vh, 240px) + 4.3rem)', ['--mg' as string]: '56px' }}>
      {stack.map((s) => <Backdrop key={s.ratingKey} m={s} server={server} />)}
      <div className="absolute inset-0 bg-linear-to-r from-black/75 via-black/25 via-45% to-transparent" />
      {heroMode && m?.holidaySlide && <div key={`wash-${m.ratingKey}`} className="m-fade absolute inset-0 bg-[radial-gradient(ellipse_at_15%_85%,color-mix(in_srgb,var(--accent)_38%,transparent),transparent_60%)]" />}
      <div className="absolute inset-x-0 bottom-0 h-[34vh] bg-linear-to-t from-black/60 to-transparent" />
      <div className="absolute inset-x-0 top-0 h-36 bg-linear-to-b from-black/55 to-transparent" />

      <div className="relative flex h-full flex-col justify-end">
        <div className="flex-1" />
        {m && (
          <div className="mb-7 max-w-[min(820px,62vw)] px-[var(--mg)]">
           <div key={m.ratingKey} className="m-fade">
            {heroMode && m.newSeason && <div className="mb-3 inline-flex rounded-full bg-accent px-3.5 py-1 text-[0.8rem] font-extrabold uppercase tracking-[0.14em] text-white">New Season</div>}
            {heroMode && m.holidaySlide && <div className="mb-3 inline-flex rounded-full bg-accent px-3.5 py-1 text-[0.8rem] font-extrabold uppercase tracking-[0.14em] text-black">{m.holidaySlide.label}</div>}
            {heroMode && m.holidaySlide?.headline
              ? <h1 className="mb-3 font-display text-[clamp(2.2rem,4.2vw,3.8rem)] uppercase leading-[1.02] tracking-[0.06em] drop-shadow-2xl">{m.holidaySlide.headline}</h1>
              : logo
              ? <img src={imageUrl(server, logo, 800, 300)} alt={title} className="mb-4 max-h-32 max-w-[26rem] object-contain object-left drop-shadow-2xl" />
              : <h1 className={`mb-3 text-balance font-extrabold leading-[1.02] tracking-[-0.03em] drop-shadow-2xl ${long ? 'text-[clamp(2rem,3.6vw,3.4rem)]' : 'text-[clamp(2.4rem,4.6vw,4.4rem)]'}`}>{title}</h1>}
            {isEp && <div className="mb-1.5 text-[1.15rem] font-semibold text-white/90">{m.title}</div>}
            <Meta m={m} />
            {settings.showInfo && m.summary && <p className="clamp-2 mt-3 max-w-[36rem] text-[1.02rem] leading-relaxed text-white/75">{m.summary}</p>}
           </div>
            {heroMode && (
              <div className="mt-6 flex items-center gap-3">
                <Focusable focusKey="hero-play" onEnter={() => onPlay(m)} title="Play" onArrow={(d) => { if (d === 'up') return toTop(); if (d === 'down') return toRows(); if (d === 'left') return false }}>
                  <div className="flex h-13 items-center gap-2.5 rounded-full bg-white px-8 text-[1.05rem] font-bold text-black transition-all duration-200 group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]"><Play size={20} fill="currentColor" />{playLabel(m)}</div>
                </Focusable>
                <Focusable focusKey="hero-info" onEnter={() => onOpen(m)} title="More info" onArrow={(d) => { if (d === 'up') return toTop(); if (d === 'down') return toRows() }}>
                  <div className="flex h-13 items-center gap-2.5 rounded-full bg-white/18 px-7 text-[1.05rem] font-semibold transition-all duration-200 group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:bg-white/30 group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]"><Info size={20} />{m.holidaySlide ? m.holidaySlide.explore : 'More info'}</div>
                </Focusable>
                {hero!.length > 1 && (
                  <div className="ml-3 flex items-center">
                    {hero!.map((it, n) => (
                      <Focusable key={it.ratingKey} focusKey={`hero-dot-${n}`} onEnter={() => setHi(n)} onFocus={() => setHi(n)} title={`Show ${it.title}`} onArrow={(d) => { if (d === 'up') return toTop(); if (d === 'down') return toRows() }}>
                        <div className="grid size-8 place-items-center" aria-current={n === hi % hero!.length}>
                          <span className={`block rounded-full transition-all duration-300 group-data-[hl=true]/f:scale-150 group-data-[hl=true]/f:bg-white ${n === hi % hero!.length ? 'size-3 bg-accent shadow-[0_0_12px_var(--accent)]' : 'size-2 bg-white/45'}`} />
                        </div>
                      </Focusable>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* One row in full, the top of the next peeking up behind it */}
        <div className="h-[calc(var(--mrow)+4.2rem)] shrink-0 overflow-hidden">
          {!rows
            ? <div className="flex gap-4 px-[var(--mg)] pt-12">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton h-[var(--mh)] aspect-[2/3] shrink-0 rounded-2xl" />)}</div>
            : (
              <div className="transition-transform duration-[380ms] ease-out" style={{ transform: `translateY(calc(var(--mrow) * ${-active}))` }}>
                {all.length === 0 && <p className="px-[var(--mg)] pt-10 text-white/60">Nothing to show here yet.</p>}
                {all.map((r, i) => (
                  <MRow key={r.id} onHoliday={onHoliday} idx={i} row={r} active={active} server={server} continueWide={continueWide}
                    onPick={pick} onShow={(it, ri) => { setSeen(it); setActive(ri) }} onUp={upFromFirstRow}
                    themed={!!r.holiday || !!r.seasonal || (season === 'halloween' && r.title === 'Spooky Season')}
                    onTitle={r.typeTab ? () => onType(r.typeTab!) : r.seasonal ? () => onSeasonal(r.seasonal!.id) : undefined} />
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  )
}
