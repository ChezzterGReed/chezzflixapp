import { useEffect, useState } from 'react'
import { ArrowRight, Clapperboard, Info, Play, Sparkles, Tv, Wand2 } from 'lucide-react'
import { setFocus } from '@noriginmedia/norigin-spatial-navigation'
import { Focusable } from './Focusable'
import { Meta, playLabel } from './Hero'
import { tabStats, type AnimeInfo, type Tab, type TabStat } from '../lib/homeData'
import { backdropPath, imageUrl, type PlexMedia, type PlexSection, type PlexServer } from '../lib/plex'

type Look = { eyebrow: string; title: string; tagline: string; icon: React.ReactNode; wash: string; glow: string; chip: string }
const LOOKS: Partial<Record<Tab, Look>> = {
  foryou: { eyebrow: 'Made for you', title: 'Picked for you', tagline: 'Matched to what you actually watch.', icon: <Wand2 size={15} />, wash: 'from-violet-500/35 via-[#15111f] to-bg', glow: 'rgba(167,139,250,.22)', chip: 'bg-violet-400/20 text-violet-100 ring-violet-300/30' },
  movie: { eyebrow: 'Movie night', title: 'Movies', tagline: 'Something to press play on tonight.', icon: <Clapperboard size={15} />, wash: 'from-amber-500/30 via-[#1a130d] to-bg', glow: 'rgba(251,191,36,.20)', chip: 'bg-amber-400/20 text-amber-100 ring-amber-300/30' },
  show: { eyebrow: 'Binge-worthy', title: 'Shows', tagline: 'Pick up a series, or start a new one.', icon: <Tv size={15} />, wash: 'from-sky-500/30 via-[#0e1520] to-bg', glow: 'rgba(56,189,248,.20)', chip: 'bg-sky-400/20 text-sky-100 ring-sky-300/30' },
  anime: { eyebrow: 'Anime', title: 'Anime', tagline: 'Series and films from your anime shelves.', icon: <Sparkles size={15} />, wash: 'from-fuchsia-500/35 via-[#1b0f1d] to-bg', glow: 'rgba(232,121,249,.22)', chip: 'bg-fuchsia-400/20 text-fuchsia-100 ring-fuchsia-300/30' },
}
export const hasTabBanner = (t: Tab) => !!LOOKS[t]

const MAX_PICKS = 10
const ROTATE_MS = 8000
const pill = 'flex h-11 items-center gap-2 rounded-full px-5 text-[0.95rem] font-bold transition-all duration-200'

/** The banner for the For You, Movies, Shows and Anime tabs: each has its own colour, a few numbers about your library, and a spotlight pick (instead of Home's rotating hero). */
export function TabBanner({ tab, server, visible, anime, picks: all, rotate, topGenres, count, profileName, tabKey, onPlay, onInfo }: {
  tab: Tab; server: PlexServer; visible: PlexSection[]; anime?: AnimeInfo; /** The spotlight candidates (the hero list); empty when the hero is off. */ picks: PlexMedia[]; /** Move on to the next pick by itself (the same setting as the Home hero). */ rotate: boolean
  /** For You: titles recommended / the genres they lean towards. */ topGenres: string[]; count: number; profileName: string; tabKey: string; onPlay: (m: PlexMedia) => void; onInfo: (m: PlexMedia) => void
}) {
  const look = LOOKS[tab]!
  const [stats, setStats] = useState<TabStat[]>([])
  const picks = all.slice(0, MAX_PICKS)
  const [i, setI] = useState(0)
  const [hover, setHover] = useState(false)
  // Moves through the picks on its own, like the Home hero (it waits while the pointer rests on the card).
  useEffect(() => {
    if (!rotate || hover || picks.length < 2 || document.documentElement.dataset.nativeVideo) return
    const t = setTimeout(() => setI((x) => (x + 1) % picks.length), ROTATE_MS)
    return () => clearTimeout(t)
  }, [i, rotate, hover, picks.length])
  useEffect(() => {
    let alive = true
    setStats([])
    tabStats(server, visible, tab, anime).then((s) => alive && setStats(s)).catch(() => {})
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server, tab, visible.map((s) => s.key).join(','), anime])
  const m = picks.length ? picks[i % picks.length] : undefined
  const up = (d: string) => { if (d === 'up') { setFocus(tabKey); return false } }
  const title = tab === 'foryou' && profileName ? `Picked for ${profileName}` : look.title
  const shown = tab === 'foryou' ? (count > 0 ? [{ label: 'titles lined up', value: count }] : []) : stats.filter((s) => s.value > 0)

  return (
    <div className="relative isolate overflow-hidden pb-10 pt-36">
      <div className={`absolute inset-0 -z-10 bg-linear-to-br ${look.wash}`} />
      <div className="absolute inset-0 -z-10" style={{ background: `radial-gradient(ellipse at 85% 25%, ${look.glow}, transparent 55%)` }} />
      <div className="banner-sheen absolute inset-y-0 -z-10 w-1/3 bg-linear-to-r from-transparent via-white/8 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-24 bg-linear-to-t from-bg to-transparent" />

      <div className="relative flex items-end justify-between gap-8 px-[var(--gutter)]">
        <div className="fade-up max-w-xl min-w-0">
          <div className="mb-3 flex items-center gap-2 text-[0.72rem] font-bold uppercase tracking-[0.22em] text-white/70"><span className="text-white">{look.icon}</span>{look.eyebrow}</div>
          <h1 className="text-[clamp(2.4rem,4.6vw,4.2rem)] font-extrabold leading-[0.98] tracking-[-0.035em]">{title}</h1>
          <p className="mt-3 text-[1.02rem] text-white/70">{look.tagline}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {shown.map((s) => <span key={s.label} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ${look.chip}`}><b className="font-extrabold tabular-nums">{s.value.toLocaleString()}</b> {s.label}</span>)}
            {tab === 'foryou' && topGenres.slice(0, 3).map((g) => <span key={g} className="rounded-full bg-white/10 px-3.5 py-1.5 text-sm font-semibold text-white/80 ring-1 ring-white/15">{g}</span>)}
          </div>
        </div>

        {m && (
          <div key={m.ratingKey} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} className="fade-up hidden w-[min(28rem,40vw)] shrink-0 md:block">
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-surface shadow-[0_24px_60px_-12px_rgba(0,0,0,.85)] ring-1 ring-white/15">
              <img src={imageUrl(server, backdropPath(m), 960, 540)} alt="" draggable={false} className="absolute inset-0 size-full object-cover" />
              <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/25 to-transparent" />
              <div className="absolute left-4 top-3 rounded-full bg-black/55 px-3 py-1 text-[0.7rem] font-bold uppercase tracking-[0.18em] text-white/85">{m.newSeason ? 'New season' : tab === 'foryou' ? 'Top match' : 'Spotlight'}</div>
              <div className="absolute inset-x-4 bottom-6">
                <div className="truncate text-xl font-extrabold">{m.title}</div>
                <Meta m={m} />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2.5">
              <Focusable focusKey="hero-play" onEnter={() => onPlay(m)} onArrow={up} title="Play" leftToRail>
                <div className={`${pill} bg-white text-black group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]`}><Play size={18} fill="currentColor" />{playLabel(m)}</div>
              </Focusable>
              <Focusable focusKey="hero-info" onEnter={() => onInfo(m)} onArrow={up} title="More info">
                <div className={`${pill} bg-white/15 group-hover/f:bg-white/25 group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:bg-white/30 group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]`}><Info size={18} />Info</div>
              </Focusable>
              {picks.length > 1 && (
                <>
                <Focusable focusKey="hero-another" onEnter={() => setI((x) => (x + 1) % picks.length)} onArrow={up} title="Next pick">
                  <div className="grid size-11 place-items-center rounded-full bg-white/15 transition-all duration-200 group-hover/f:bg-white/25 group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]"><ArrowRight size={19} /></div>
                </Focusable>
                <span className="ml-1 text-sm font-semibold tabular-nums text-white/50">{(i % picks.length) + 1} / {picks.length}</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
