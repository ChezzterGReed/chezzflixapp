import { useEffect, useMemo, useRef, useState } from 'react'
import { Play, Radio, Shuffle, Trophy } from 'lucide-react'
import { setFocus } from '@noriginmedia/norigin-spatial-navigation'
import { BackButton } from '../components/BackButton'
import { Btn } from '../components/AddChannel'
import { LandscapeCard } from '../components/Card'
import { HolidayCard, holidayEntries } from '../components/HolidayCards'
import { useGridNav } from '../lib/gridNav'
import { reveal } from '../lib/scroll'
import { getAllLeaves, type PlexMedia, type PlexSection, type PlexServer } from '../lib/plex'
import { holidayAccent, holidayEpisodeChannels, holidayName, holidayShows, holidayTitle, type HolidayId, type HolidayShow } from '../lib/holidayEpisodes'

interface Props {
  server: PlexServer; sections: PlexSection[]; id: HolidayId; /** One show's holiday episodes; without it, every show that has some. */ show?: string
  onBack: () => void; onPlay: (m: PlexMedia) => void; onPlayList: (items: PlexMedia[], from: PlexMedia) => void; onShuffle: (items: PlexMedia[]) => void; onShow: (showKey: string) => void; onTune: () => void
}

/** Holiday episodes: every show that has some (Explore all), or one show's holiday episodes to play, shuffle or tune in to. */
export function HolidayScreen({ server, sections, id, show, onBack, onPlayList, onShuffle, onShow, onTune }: Props) {
  const page = useRef<HTMLDivElement>(null)
  useGridNav(page)
  const [shows, setShows] = useState<HolidayShow[]>()
  const [eps, setEps] = useState<PlexMedia[]>()

  useEffect(() => {
    let alive = true
    holidayEpisodeChannels(server, sections, null).then((c) => { if (alive) setShows(holidayShows(c.find((x) => x.id === `seasonal:eps:${id}`))) }).catch(() => alive && setShows([]))
    return () => { alive = false }
  }, [server, sections, id])

  const current = useMemo(() => shows?.find((s) => s.key === show), [shows, show])
  useEffect(() => {
    if (!current) { setEps(undefined); return }
    let alive = true
    const want = new Set(current.keys)
    getAllLeaves(server, current.key).then((l) => {
      if (alive) setEps(l.filter((m) => m.type === 'episode' && want.has(m.ratingKey)).sort((a, b) => (a.originallyAvailableAt ?? '').localeCompare(b.originallyAvailableAt ?? '') || (a.parentIndex ?? 0) - (b.parentIndex ?? 0) || (a.index ?? 0) - (b.index ?? 0)))
    }).catch(() => alive && setEps([]))
    return () => { alive = false }
  }, [server, current])

  useEffect(() => {
    if (show ? !eps?.length : !shows?.length) return
    const t = setTimeout(() => setFocus(show ? 'hol-play' : 'hol-first'), 120)
    return () => clearTimeout(t)
  }, [show, eps, shows])

  const title = show ? current?.title ?? ' ' : holidayTitle(id)
  const sub = show ? (eps ? `${eps.length} ${holidayName(id).replace(' Episodes', '').toLowerCase()} episode${eps.length === 1 ? '' : 's'}` : ' ') : shows ? `${shows.length} show${shows.length === 1 ? '' : 's'} with ${holidayName(id).replace(' Episodes', '')} episodes` : ' '
  // Brooklyn Nine-Nine's Halloween episodes are the show's yearly heists: they get a look of their own.
  const heist = !!show && id === 'halloween' && /brooklyn\s*nine/i.test(current?.title ?? '')
  const all = useMemo(() => ({ id, title, channelId: `seasonal:eps:${id}`, shows: shows ?? [], all: shows ?? [] }), [id, title, shows])

  return (
    <div ref={page} className="relative isolate px-[var(--gutter)] pb-24 pt-10" style={{ ['--accent' as string]: heist ? '#f6c445' : holidayAccent(id) }}>
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[460px] bg-[radial-gradient(ellipse_at_20%_0%,color-mix(in_srgb,var(--accent)_34%,transparent),transparent_65%)]" />
      {heist && <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[460px] bg-[linear-gradient(135deg,rgba(20,45,110,.55),transparent_60%)]" />}
      <BackButton onBack={onBack} />
      <div className="fade-up mb-8">
        {heist && <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-accent px-3.5 py-1 text-[0.8rem] font-extrabold uppercase tracking-[0.16em] text-black"><Trophy size={14} />The Halloween Heist</div>}
        <h1 className="font-display text-[clamp(2.2rem,4.4vw,3.8rem)] uppercase leading-none tracking-[0.1em]">{title}</h1>
        <div className="mt-4 h-[3px] w-20 rounded-full bg-accent" />
        <p className="mt-4 text-white/60">{sub}</p>
        {!show && (
          <>
            <p className="mt-4 max-w-[40rem] text-[1.05rem] leading-relaxed text-white/75">Every {holidayName(id).replace(' Episodes', '').toLowerCase()} episode on your server, gathered from your shows. Pick a show to see its episodes and play them in order, or tune in to catch them live on their own channel.</p>
            <div className="mt-6 flex flex-wrap gap-3"><Btn primary onEnter={onTune}><Radio size={16} />Tune in</Btn></div>
          </>
        )}
        {heist && <p className="mt-4 max-w-[40rem] text-[1.05rem] leading-relaxed text-white/75">Every Halloween is heist night at the Nine-Nine: schemes, disguises, double-crosses and one very serious title on the line. Each episode here is part of the tradition, from the first heist to the last.</p>}
        {show && (
          <div className="mt-6 flex flex-wrap gap-3">
            <Btn focusKey="hol-play" primary disabled={!eps?.length} onEnter={() => eps?.[0] && onPlayList(eps, eps[0])}><Play size={17} fill="currentColor" />Play</Btn>
            <Btn disabled={!eps?.length} onEnter={() => eps && onShuffle(eps)}><Shuffle size={16} />Shuffle</Btn>
            <Btn onEnter={onTune}><Radio size={16} />Tune in</Btn>
          </div>
        )}
      </div>

      {!show && (
        <div className="grid gap-x-4 gap-y-6 [grid-template-columns:repeat(auto-fill,minmax(var(--land-w),1fr))]">
          {!shows ? Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton aspect-video rounded-xl" />)
            : shows.map((s, i) => {
              const e = holidayEntries({ ...all, shows: [s] })[0]
              return <div key={s.key} data-grid-cell className="[--land-w:100%]"><HolidayCard entry={e} row={all} server={server} focusKey={i === 0 ? 'hol-first' : undefined} onEnter={() => onShow(s.key)} onFocus={(el) => reveal(el)} /></div>
            })}
        </div>
      )}
      {!show && shows && shows.length === 0 && <p className="py-16 text-white/55">No shows with {holidayName(id).toLowerCase()} on your server yet.</p>}

      {show && (
        <div className="grid gap-x-4 gap-y-8 [grid-template-columns:repeat(auto-fill,minmax(var(--land-w),1fr))]">
          {!eps ? Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton aspect-video rounded-xl" />)
            : eps.map((m) => (
              <div key={m.ratingKey} data-grid-cell data-rk={m.ratingKey} className="relative [--land-w:100%]">
                <LandscapeCard m={m} server={server} onEnter={() => eps && onPlayList(eps, m)} onFocus={(el) => reveal(el)} />
                {heist && <span className="pointer-events-none absolute left-2.5 top-2.5 z-10 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-[0.66rem] font-extrabold uppercase tracking-[0.14em] text-black shadow"><Trophy size={11} />Heist</span>}
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
