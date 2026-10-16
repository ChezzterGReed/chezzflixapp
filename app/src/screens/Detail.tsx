import { useEffect, useRef, useState } from 'react'
import { BIG_IMAGE } from '../lib/perf'
import { reveal, scrollToTopOf } from '../lib/scroll'
import { VersionRows, focusFirstVersion } from '../components/VersionPicker'
import { findVersions, type Version } from '../lib/versions'
import { useBack } from '../lib/back'
import { ArrowLeft, BookmarkCheck, BookmarkPlus, Check, Clapperboard, Eye, EyeOff, History, Layers, Loader2, Pin, PinOff, Play, Pencil, Radio, Shuffle, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useSettings } from '../lib/settings'
import { AddToChannel } from '../components/AddToChannel'
import { getWatchlist, setOnWatchlist, watchItemOf, watchKey } from '../lib/watchlist'
import { setFocus } from '@noriginmedia/norigin-spatial-navigation'
import { Layer } from '../components/Layer'
import { EditInfo } from '../components/EditInfo'
import { EpisodeMenu } from '../components/EpisodeMenu'
import { canEdit } from '../lib/edit'
import { Focusable } from '../components/Focusable'
import { Avatar } from '../components/Avatar'
import { Row } from '../components/Row'
import { moreLikeThis } from '../lib/similar'
import { ExtrasRow } from '../components/ExtrasRow'
import { ClipPopup } from '../components/ClipPopup'
import { firstEpisode, previewSegments, recapSegments, withFile, type Segment } from '../lib/clips'
import {
  backdropPath, posterPath, episodeLabel, getExtras, formatLeft, formatRuntime, getAllLeaves, getChildren, getMetadata, getRelated, getSections, imageUrl, isSpoilerRisk, isWatched, logoPath,
  progressOf, setWatched, type PlexMedia, type PlexServer,
  resolvePlayable,
} from '../lib/plex'

function Pill({ children, onEnter, active, focusKey, onArrow }: { children: React.ReactNode; onEnter: () => void; active?: boolean; focusKey?: string; onArrow?: (d: 'left' | 'right' | 'up' | 'down') => boolean | void }) {
  return (
    <Focusable focusKey={focusKey} onEnter={onEnter} onArrow={onArrow} onFocus={(el) => reveal(el, { block: 'center' })}>
      <div className={`whitespace-nowrap rounded-full px-5 py-2 text-[0.92rem] font-semibold transition-colors group-hover/f:bg-white/20 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${active ? 'bg-accent text-black' : 'bg-white/8 text-white/60'}`}>{children}</div>
    </Focusable>
  )
}

/** A long show (more than 8 seasons) gets one season button that opens a list, with arrows to step to the previous or next season. */
const MANY_SEASONS = 8
function SeasonSelect({ seasons, season, onPick, onArrow }: { seasons: PlexMedia[]; season?: string; onPick: (key: string) => void; onArrow: (d: 'left' | 'right' | 'up' | 'down') => boolean | void }) {
  const [open, setOpen] = useState(false)
  const at = seasons.findIndex((x) => x.ratingKey === season)
  const cur = seasons[at]
  const step = (d: -1 | 1) => { const n = seasons[at + d]; if (n) onPick(n.ratingKey) }
  useEffect(() => { if (open && season) { const t = setTimeout(() => setFocus(`smenu-${season}`), 60); return () => clearTimeout(t) } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const round = 'grid size-10 place-items-center rounded-full transition-colors group-hover/f:bg-white/20 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black'
  return (
    <>
      <Focusable focusKey="season-prev" onEnter={() => step(-1)} onArrow={onArrow} title="Previous season"><div className={`${round} ${at > 0 ? 'bg-white/10' : 'bg-white/5 text-white/25'}`}><ChevronLeft size={20} /></div></Focusable>
      <Focusable focusKey="season-select" onEnter={() => setOpen(true)} onArrow={onArrow} title="Choose a season">
        <div className="flex items-center gap-2 whitespace-nowrap rounded-full bg-accent px-5 py-2 text-[0.92rem] font-semibold text-black transition-colors group-hover/f:bg-accent/85 group-data-[hl=true]/f:bg-white">{cur?.title ?? 'Seasons'}<ChevronDown size={16} /></div>
      </Focusable>
      <Focusable focusKey="season-next" onEnter={() => step(1)} onArrow={onArrow} title="Next season"><div className={`${round} ${at >= 0 && at < seasons.length - 1 ? 'bg-white/10' : 'bg-white/5 text-white/25'}`}><ChevronRight size={20} /></div></Focusable>
      {open && (
        <Layer onClose={() => { setOpen(false); setTimeout(() => setFocus('season-select'), 30) }} scrim="bg-black/60 backdrop-blur-sm" className="absolute left-1/2 top-1/2 w-[min(360px,92vw)] -translate-x-1/2 -translate-y-1/2">
          <div className="pop rounded-3xl bg-[#17171c]/95 p-2 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10">
            <div className="px-3.5 pb-2 pt-3 text-lg font-bold">Seasons</div>
            <div className="max-h-[56vh] overflow-y-auto overscroll-contain [scrollbar-width:none]">
              {seasons.map((x) => (
                <Focusable key={x.ratingKey} focusKey={`smenu-${x.ratingKey}`} onEnter={() => { onPick(x.ratingKey); setOpen(false); setTimeout(() => setFocus('season-select'), 30) }} title={x.title}>
                  <div className="flex h-12 items-center gap-3 rounded-xl px-3.5 text-[0.95rem] font-semibold transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><span className="flex-1">{x.title}</span>{x.ratingKey === season && <Check size={18} />}</div>
                </Focusable>
              ))}
            </div>
          </div>
        </Layer>
      )}
    </>
  )
}

function Episode({ ep, server, spoiler, onReveal, onRevealShow, onPlay, onRecap, onEdit, onMenu, upTo }: { ep: PlexMedia; server: PlexServer; spoiler: boolean; onReveal: () => void; /** Set once this episode has been revealed by hand: offers to unblur the whole show. */ onRevealShow?: () => void; onPlay: (m: PlexMedia) => void; onRecap: (m: PlexMedia) => void; /** Desktop owner only: open the edit window. */ onEdit?: (m: PlexMedia) => void; /** Hold OK / right-click: the episode's menu. */ onMenu: (m: PlexMedia) => void; /** First episode only: where Up goes (the season buttons). */ upTo?: string }) {
  const p = progressOf(ep)
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <Focusable focusKey={`ep-${ep.ratingKey}`} onEnter={() => onPlay(ep)} onLongPress={() => onMenu(ep)} onFocus={(el) => reveal(el)} onArrow={(d) => { if (d === 'up' && upTo) { setFocus(upTo); return false } }}>
          <div className="flex gap-5 rounded-2xl p-3 transition-all duration-200 group-hover/f:bg-white/6 group-data-[hl=true]/f:bg-white/12 group-data-[hl=true]/f:ring-2 group-data-[hl=true]/f:ring-white">
            <div className="relative aspect-video w-[min(280px,32vw)] shrink-0 overflow-hidden rounded-xl bg-surface-2">
              <img src={imageUrl(server, ep.thumb, 560, 315)} alt="" loading="lazy" draggable={false} className={`h-full w-full object-cover transition-all duration-500 ${spoiler ? 'scale-110 blur-lg brightness-90' : ''}`} />
              <div className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition-opacity group-hover/f:opacity-100 group-data-[hl=true]/f:opacity-100"><Play size={34} fill="white" /></div>
              {p > 0 && <div className="absolute inset-x-0 bottom-0 h-1 bg-white/25"><div className="h-full bg-accent" style={{ width: `${p * 100}%` }} /></div>}
            </div>
            <div className="min-w-0 flex-1 py-1">
              <div className="flex items-baseline gap-3">
                <span className="text-[0.85rem] font-bold tabular-nums text-white/45">{ep.index}</span>
                <h4 className="truncate text-[1.05rem] font-bold">{ep.title}</h4>
                {isWatched(ep) && <Check size={16} className="shrink-0 text-accent" />}
                <span className="ml-auto shrink-0 text-sm text-white/50">{p > 0 ? formatLeft(ep) : formatRuntime(ep.duration)}</span>
              </div>
              <p className={`clamp-3 mt-1.5 text-[0.92rem] leading-relaxed text-white/60 transition-all duration-500 ${spoiler ? 'select-none blur-[6px]' : ''}`}>{ep.summary}</p>
            </div>
          </div>
        </Focusable>
      </div>
      {onEdit && (
        <Focusable focusKey={`edit-${ep.ratingKey}`} onEnter={() => onEdit(ep)} title="Edit this episode">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 transition-colors group-hover/f:bg-white/25 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><Pencil size={16} /></div>
        </Focusable>
      )}
      {!spoiler && (
        <Focusable focusKey={`recap-${ep.ratingKey}`} onEnter={() => onRecap(ep)} title="Recap">
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold transition-colors group-hover/f:bg-white/25 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><History size={16} />Recap</div>
        </Focusable>
      )}
      {!spoiler && onRevealShow && (
        <Focusable focusKey={`revealshow-${ep.ratingKey}`} onEnter={onRevealShow} title="Reveal whole show?">
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-white/12 px-4 py-2.5 text-sm font-semibold transition-colors group-hover/f:bg-white/25 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><Eye size={16} />Reveal whole show?</div>
        </Focusable>
      )}
      {spoiler && (
        <Focusable onEnter={() => { onReveal(); setTimeout(() => setFocus(`ep-${ep.ratingKey}`), 0) }} title="Click to reveal">
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-white/12 px-4 py-2.5 text-sm font-semibold transition-colors group-hover/f:bg-white/25 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><Eye size={16} />Click to reveal</div>
        </Focusable>
      )}
    </div>
  )
}

interface Props { ratingKey: string; server: PlexServer; token: string; /** Land on this episode (its season selected) instead of the Play button. */ focusEpisode?: { season?: string; ep: string }; onClose: () => void; onPlay: (m: PlexMedia, how?: boolean | 'beginning') => void; /** Play a show's episodes in a random order. */ onShuffle: (items: PlexMedia[]) => void; /** Something was edited on the server: reload. */ onEdited: () => void; onOpen: (m: PlexMedia) => void; /** Opens everything on the server with this person. */ onActor: (a: { name: string; id?: string }) => void; onCollection: (title: string, sectionId?: string | number) => void }

export function Detail({ ratingKey, server, token, focusEpisode, onClose, onPlay, onShuffle, onEdited, onOpen, onActor, onCollection }: Props) {
  const [m, setM] = useState<PlexMedia>()
  const [seasons, setSeasons] = useState<PlexMedia[]>([])
  const [season, setSeason] = useState<string>()
  const [episodes, setEpisodes] = useState<PlexMedia[]>([])
  const [related, setRelated] = useState<PlexMedia[]>([])
  const [watched, setWatchedState] = useState(false)
  const { settings, update } = useSettings()
  const [addToChannel, setAddToChannel] = useState(false)
  const [onList, setOnList] = useState<boolean>()   // undefined until we know (or when this title can't be on a Watchlist)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [clip, setClip] = useState<{ media: PlexMedia; segments: Segment[]; heading: string; subheading?: string }>()
  const [busy, setBusy] = useState(false)
  // Choosing a quality when a title exists in several versions / libraries.
  const [confirmShow, setConfirmShow] = useState(false)   // "reveal the whole show?" question
  const [ask, setAsk] = useState<'pin' | 'watched'>()   // a yes / no question before pinning or marking watched
  const [toast, setToast] = useState<string>()
  const toastTimer = useRef(0)
  const flash = (msg: string) => { setToast(msg); clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(undefined), 3200) }
  useEffect(() => () => clearTimeout(toastTimer.current), [])
  const showKey = m?.type === 'show' ? m.ratingKey : undefined
  const showUnblurred = !!showKey && !!settings.spoilerFreeShows[showKey]   // chosen by you: this show's episodes are never blurred
  const [picker, setPicker] = useState<{ anchor: 'button' | 'modal'; versions: Version[]; title: string }>()
  const closePicker = () => { const a = picker?.anchor; setPicker(undefined); if (a === 'button') setTimeout(() => setFocus('detail-play'), 30) }
  useBack(closePicker, picker?.anchor === 'button')
  // `how`: undefined = the usual (asks about continuing if it is partly watched); true = continue; 'beginning' = start over.
  const pickHow = useRef<boolean | 'beginning' | undefined>(undefined)
  const requestPlay = async (item: PlexMedia, anchor: 'button' | 'modal', how?: boolean | 'beginning') => {
    pickHow.current = how
    const target = await resolvePlayable(server, item).catch(() => null)
    const vs = target ? await findVersions(server, target) : []
    if (vs.length > 1) { setPicker({ anchor, versions: vs, title: target?.title ?? item.title }); if (anchor === 'button') focusFirstVersion('ver') }
    else onPlay(item, how)
  }
  const [epMenu, setEpMenu] = useState<PlexMedia>()   // the episode whose menu is open
  const markEpisode = async (ep: PlexMedia) => {
    const next = !isWatched(ep)
    setEpisodes((l) => l.map((e) => (e.ratingKey === ep.ratingKey ? { ...e, viewCount: next ? Math.max(1, e.viewCount ?? 0) : 0, viewOffset: undefined } : e)))
    await setWatched(server, ep.ratingKey, next).catch(() => {})
    flash(next ? `Marked ${ep.title} as watched` : `Marked ${ep.title} as unwatched`)
  }
  const [extras, setExtras] = useState<PlexMedia[]>([])   // trailers and extras
  const [editing, setEditing] = useState<PlexMedia>()   // the title (or episode) whose details are being edited
  const [shuffleBusy, setShuffleBusy] = useState(false)
  // Every episode of the show (not the specials), in a random order.
  const shuffleShow = async () => {
    if (shuffleBusy) return
    setShuffleBusy(true)
    try { onShuffle((await getAllLeaves(server, ratingKey)).filter((e) => e.parentIndex !== 0)) } catch { onShuffle([]) } finally { setShuffleBusy(false) }
  }
  const pickVersion = (v: Version) => { setPicker(undefined); onPlay(v.media, pickHow.current) }

  useEffect(() => {
    let alive = true
    getMetadata(server, ratingKey).then(async (full) => {
      if (!alive) return
      setM(full); setWatchedState(isWatched(full))
      if (full.type === 'show') {
        const ss = (await getChildren(server, ratingKey)).filter((s) => s.index !== 0 || (full.childCount ?? 0) === 1)
        if (!alive) return
        setSeasons(ss)
        const current = full.OnDeck?.Metadata?.parentRatingKey
        setSeason((ss.find((s) => s.ratingKey === focusEpisode?.season) ?? ss.find((s) => s.ratingKey === current) ?? ss[0])?.ratingKey)
      }
    })
    // ("More like this" is worked out once the title itself has loaded; see below)
    return () => { alive = false }
  }, [ratingKey, server])

  // "More like this": the same collection or series first, then the closest matches, drawn from ALL your libraries of this kind (Plex's own list is the fallback).
  useEffect(() => {
    if (!m || (m.type !== 'movie' && m.type !== 'show')) return
    let alive = true
    const fallback = () => getRelated(server, m.ratingKey)
    getSections(server).then((secs) => moreLikeThis(server, secs, settings.hiddenLibraries, m)).then((r) => (r.length ? r : fallback())).catch(fallback).then((r) => alive && setRelated(r))
    return () => { alive = false }
  }, [m?.ratingKey, server]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!season) return
    let alive = true
    getChildren(server, season).then((e) => alive && setEpisodes(e))
    return () => { alive = false }
  }, [season, server])

  // Land on Play as soon as the page has content — the fastest path to watching.
  useEffect(() => { if (m && !focusEpisode) setTimeout(() => setFocus('detail-play'), 80) }, [m]) // eslint-disable-line react-hooks/exhaustive-deps
  // Opened from Continue Watching with "open at that episode": go straight to it once its season's list is in.
  const landed = useRef(false)
  useEffect(() => {
    if (!focusEpisode || landed.current || !episodes.some((e) => e.ratingKey === focusEpisode.ep)) return
    landed.current = true
    setTimeout(() => setFocus(`ep-${focusEpisode.ep}`), 150)
  }, [episodes, focusEpisode])

  useEffect(() => {
    if (!m || (m.type !== 'movie' && m.type !== 'show')) { setExtras([]); return }
    let alive = true
    getExtras(server, m.ratingKey).then((x) => alive && setExtras(x)).catch(() => alive && setExtras([]))
    return () => { alive = false }
  }, [m?.ratingKey, server]) // eslint-disable-line react-hooks/exhaustive-deps
  // Pin to Continue Watching: stays there, started or not, until unpinned.
  const pinned = !!(m && settings.pinned[m.ratingKey])
  const togglePin = () => {
    if (!m) return
    const pins = { ...settings.pinned }
    if (pinned) delete pins[m.ratingKey]; else pins[m.ratingKey] = Math.floor(Date.now() / 1000)
    update({ pinned: pins })
    flash(pinned ? `Unpinned ${m.title} from Continue Watching` : `Pinned ${m.title} to Continue Watching`)
  }
  // Plex Watchlist (kept on Plex's cloud, per account).
  const wKey = m ? watchKey(server, m) : undefined
  useEffect(() => {
    if (!wKey) { setOnList(undefined); return }
    let alive = true
    getWatchlist(token).then((l) => alive && setOnList(l.some((x) => x.key === wKey))).catch(() => alive && setOnList(undefined))
    return () => { alive = false }
  }, [wKey, token])
  const toggleList = async () => {
    if (!m || !wKey || onList === undefined) return
    const next = !onList
    setOnList(next)
    try { await setOnWatchlist(token, watchItemOf(wKey, m), next); flash(next ? `Added ${m.title} to your Watchlist` : `Removed ${m.title} from your Watchlist`) }
    catch { setOnList(!next); flash('Couldn’t update your Watchlist. Try again.') }
  }

  const toggleWatched = async () => {
    if (!m) return
    const next = !watched
    setWatchedState(next)
    await setWatched(server, m.ratingKey, next)
    flash(next ? `Marked ${m.title} as watched` : `Marked ${m.title} as unwatched`)
  }

  // Preview: 10s from a random point a few minutes in (a movie, or episode 1 of a show).
  const preview = async () => {
    if (!m || busy) return
    setBusy(true)
    try {
      const target = m.type === 'show' ? await firstEpisode(server, m) : await withFile(server, m)
      if (target) setClip({ media: target, segments: previewSegments(target), heading: m.title, subheading: m.type === 'show' ? `Preview · ${episodeLabel(target) || 'Episode 1'}` : 'Preview' })
    } finally { setBusy(false) }
  }
  // Recap: short snippets spread across one episode (see recapPlan).
  const recap = async (ep: PlexMedia) => {
    const full = await getMetadata(server, ep.ratingKey)   // the full record carries the credits marker the last clip needs
    const segments = recapSegments(full)
    if (segments.length) setClip({ media: full, segments, heading: `${m?.title ?? full.grandparentTitle ?? ''}`, subheading: `Recap · ${episodeLabel(full)} · ${full.title}` })
  }

  const next = m?.type === 'show' ? m.OnDeck?.Metadata : undefined
  const resumeTarget = next ?? (m?.viewOffset ? m : undefined)
  const playLabel = resumeTarget?.viewOffset ? 'Resume' : 'Play'
  // Look for other versions in the background so the picker appears instantly when Play is pressed.
  const playKey = (resumeTarget ?? m)?.ratingKey
  useEffect(() => {
    const it = resumeTarget ?? m
    if (it) resolvePlayable(server, it).then((t) => t && findVersions(server, t)).catch(() => {})
  }, [playKey, server]) // eslint-disable-line react-hooks/exhaustive-deps
  const sub = next ? episodeLabel(next) : ''
  const score = m?.audienceRating ?? m?.rating
  const cast = (m?.Role ?? []).slice(0, 14)
  const minimal = settings.infoStyle === 'minimal'

  return (
    <Layer onClose={onClose} scrim="bg-bg" className="absolute inset-0 overflow-y-auto overflow-x-hidden">
      {!m ? <div className="grid h-full place-items-center"><div className="skeleton size-14 rounded-full" /></div> : (
        <div className="relative pb-24">
          {minimal
            ? <div aria-hidden className="absolute inset-x-0 top-0 h-[70vh] bg-[radial-gradient(900px_420px_at_18%_0%,color-mix(in_oklab,var(--accent)_16%,transparent),transparent_70%)]" />
            : (
              <div className="absolute inset-x-0 top-0 h-[78vh] min-h-[560px] overflow-hidden">
                <img src={imageUrl(server, backdropPath(m), BIG_IMAGE.w, BIG_IMAGE.h)} alt="" draggable={false} className="fade-in h-full w-full object-cover object-[50%_20%]" />
                <div className="absolute inset-0 bg-linear-to-r from-bg via-bg/75 via-40% to-bg/10" />
                <div className="absolute inset-0 bg-linear-to-t from-bg via-bg/30 via-45% to-transparent" />
              </div>
            )}

          <div className="relative px-[var(--gutter)] pt-8">
            <Focusable focusKey="detail-back" onEnter={onClose} title="Back" onFocus={scrollToTopOf}>
              <div className="inline-flex h-11 items-center gap-2 rounded-full bg-black/35 pl-3 pr-5 text-sm font-semibold transition-colors group-hover/f:bg-white/20 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><ArrowLeft size={18} />Back</div>
            </Focusable>

            <div className={minimal ? 'fade-up mt-8 flex items-start gap-10 max-md:flex-col' : 'fade-up mt-[12vh] max-w-[46rem]'}>
              {minimal && <img src={imageUrl(server, posterPath(m), 640, 960)} alt={m.title} draggable={false} className="w-[min(300px,26vw)] shrink-0 rounded-2xl bg-surface object-cover shadow-[0_24px_60px_-20px_rgba(0,0,0,.9)] max-md:w-48" />}
              <div className={minimal ? 'min-w-0 max-w-[50rem] flex-1' : ''}>
              {logoPath(m) && !minimal
                ? <img src={imageUrl(server, logoPath(m), 800, 300)} alt={m.title} className="mb-5 max-h-40 max-w-[30rem] object-contain object-left" />
                : <h1 className="mb-4 text-[clamp(2.6rem,5.2vw,5rem)] font-extrabold leading-[0.98] tracking-[-0.035em]">{m.title}</h1>}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.95rem] font-medium text-white/85">
                {score ? <span className="flex items-center gap-1 font-bold"><span className="text-accent">★</span>{score.toFixed(1)}</span> : null}
                {m.contentRating && <span className="rounded border border-white/40 px-1.5 py-px text-[0.75rem] font-semibold">{m.contentRating}</span>}
                {[m.year, m.type === 'show' ? `${m.childCount ?? seasons.length} Season${(m.childCount ?? seasons.length) === 1 ? '' : 's'}` : formatRuntime(m.duration)].filter(Boolean).map((b, i) => <span key={i} className="flex items-center gap-3"><i className="size-1 rounded-full bg-white/40" />{b}</span>)}
              </div>
              {m.tagline && <p className="mt-4 text-lg font-semibold italic text-white/70">{m.tagline}</p>}
              <p className="mt-4 max-w-[40rem] text-[1.05rem] leading-relaxed text-white/80">{m.summary}</p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <div className="relative">
                <Focusable focusKey="detail-play" onEnter={() => (picker ? closePicker() : requestPlay(resumeTarget ?? m, 'button'))} title="Play" onFocus={scrollToTopOf}>
                  <div className="flex h-13 items-center gap-2.5 rounded-full bg-white px-8 text-[1.05rem] font-bold text-black transition-all duration-200 group-hover/f:bg-white/90 group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]">
                    <Play size={20} fill="currentColor" />{playLabel}{sub && <span className="font-semibold text-black/60">{sub}</span>}
                  </div>
                </Focusable>
                {picker?.anchor === 'button' && (
                  <div data-nopause className="pop absolute left-0 top-full z-30 mt-2 w-[min(24rem,86vw)] rounded-2xl bg-[#17171c]/95 p-1.5 shadow-[0_20px_60px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10 backdrop-blur-xl">
                    <VersionRows prefix="ver" versions={picker.versions} onPick={pickVersion} onUp={closePicker} />
                  </div>
                )}
                </div>
                {m.type === 'show' && (
                  <Focusable focusKey="detail-shuffle" onEnter={shuffleShow} title="Shuffle episodes" onFocus={scrollToTopOf}>
                    <div className="grid size-13 place-items-center rounded-full bg-white/15 transition-all duration-200 group-hover/f:bg-white/25 group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]">
                      {shuffleBusy ? <Loader2 size={20} className="animate-spin" /> : <Shuffle size={20} />}
                    </div>
                  </Focusable>
                )}
                {canEdit(server) && (
                  <Focusable focusKey="detail-edit" onEnter={() => setEditing(m)} title="Edit info" onFocus={scrollToTopOf}>
                    <div className="grid size-13 place-items-center rounded-full bg-white/15 transition-all duration-200 group-hover/f:bg-white/25 group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]"><Pencil size={20} /></div>
                  </Focusable>
                )}
                <Focusable onEnter={() => setAsk('watched')} title={watched ? 'Mark as unwatched' : 'Mark as watched'} onFocus={scrollToTopOf}>
                  <div className="grid size-13 place-items-center rounded-full bg-white/15 transition-all duration-200 group-hover/f:bg-white/25 group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]">{watched ? <EyeOff size={20} /> : <Eye size={20} />}</div>
                </Focusable>
                <Focusable focusKey="detail-preview" onEnter={preview} title={'Preview'} onFocus={scrollToTopOf}>
                  <div className="grid size-13 place-items-center rounded-full bg-white/15 transition-all duration-200 group-hover/f:bg-white/25 group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]">{busy ? <Loader2 size={20} className="animate-spin" /> : <Clapperboard size={20} />}</div>
                </Focusable>
                <Focusable onEnter={() => setAsk('pin')} title={pinned ? 'Unpin from Continue Watching' : 'Pin to Continue Watching'} onFocus={scrollToTopOf}>
                  <div className="grid size-13 place-items-center rounded-full bg-white/15 transition-all duration-200 group-hover/f:bg-white/25 group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]">{pinned ? <PinOff size={20} className="text-accent" /> : <Pin size={20} />}</div>
                </Focusable>
                {settings.tvGuide && (m.type === 'show' || m.type === 'movie') && (
                  <Focusable onEnter={() => setAddToChannel(true)} title={'Add to a TV Guide channel'} onFocus={scrollToTopOf}>
                  <div className="grid size-13 place-items-center rounded-full bg-white/15 transition-all duration-200 group-hover/f:bg-white/25 group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]"><Radio size={20} /></div>
                </Focusable>
                )}
                {onList !== undefined && (
                  <Focusable onEnter={toggleList} title={onList ? 'Remove from Watchlist' : 'Add to Watchlist'} onFocus={scrollToTopOf}>
                  <div className="grid size-13 place-items-center rounded-full bg-white/15 transition-all duration-200 group-hover/f:bg-white/25 group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]">{onList ? <BookmarkCheck size={20} className="text-accent" /> : <BookmarkPlus size={20} />}</div>
                </Focusable>
                )}
              </div>

              <dl className="mt-8 grid max-w-[40rem] grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[0.9rem]">
                {cast.length > 0 && <><dt className="text-white/45">Starring</dt><dd className="text-white/80">{cast.slice(0, 4).map((c) => c.tag).join(', ')}</dd></>}
                {(m.Genre?.length ?? 0) > 0 && <><dt className="text-white/45">Genres</dt><dd className="text-white/80">{m.Genre!.map((g) => g.tag).join(', ')}</dd></>}
                {m.studio && <><dt className="text-white/45">Studio</dt><dd className="text-white/80">{m.studio}</dd></>}
                {(m.Collection?.length ?? 0) > 0 && (
                  <>
                    <dt className="pt-1.5 text-white/45">Part of</dt>
                    <dd className="flex flex-wrap gap-2">
                      {m.Collection!.map((c) => (
                        <Focusable key={c.tag} onEnter={() => onCollection(c.tag, m.librarySectionID)} title={c.tag}>
                          <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-[0.85rem] font-semibold text-white/90 transition-colors group-hover/f:bg-white/20 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><Layers size={14} className="text-accent group-data-[hl=true]/f:text-black" />{c.tag.replace(/^_+/, '')}</div>
                        </Focusable>
                      ))}
                    </dd>
                  </>
                )}
              </dl>
              </div>
            </div>
          </div>

          {m.type === 'show' && (
            <section className="relative mt-16 px-[var(--gutter)]">
              <div className="mb-5 flex flex-wrap items-center gap-3">
                <h2 className="mr-3 text-[1.35rem] font-bold tracking-tight">Episodes</h2>
                {(() => {
                  const seasonArrow = (d: 'left' | 'right' | 'up' | 'down') => { if (d === 'down' && episodes[0]) { setFocus(`ep-${episodes[0].ratingKey}`); return false } if (d === 'up') { setFocus('detail-play'); return false } }
                  return seasons.length > MANY_SEASONS
                    ? <SeasonSelect seasons={seasons} season={season} onPick={setSeason} onArrow={seasonArrow} />
                    : seasons.map((s) => <Pill key={s.ratingKey} focusKey={`season-${s.ratingKey}`} active={s.ratingKey === season} onEnter={() => setSeason(s.ratingKey)} onArrow={seasonArrow}>{s.title}</Pill>)
                })()}
              </div>
              <div className="space-y-1.5">
                {episodes.length === 0 ? Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-[130px] rounded-2xl" />)
                  : episodes.map((ep, n) => <Episode key={ep.ratingKey} ep={ep} server={server} onPlay={(e) => requestPlay(e, 'modal')} onRecap={recap} onMenu={setEpMenu} onEdit={canEdit(server) ? setEditing : undefined} upTo={n === 0 && season ? (seasons.length > MANY_SEASONS ? 'season-select' : `season-${season}`) : undefined}
                    spoiler={settings.hideSpoilers && !showUnblurred && isSpoilerRisk(ep) && !revealed.has(ep.ratingKey)}
                    onReveal={() => setRevealed((r) => new Set(r).add(ep.ratingKey))}
                    onRevealShow={settings.hideSpoilers && !showUnblurred && isSpoilerRisk(ep) && revealed.has(ep.ratingKey) ? () => setConfirmShow(true) : undefined} />)}
              </div>
            </section>
          )}

          {cast.length > 0 && (
            <section className="relative mt-14">
              <h2 className="mb-4 px-[var(--gutter)] text-[1.35rem] font-bold tracking-tight">Cast</h2>
              <div className="flex gap-6 overflow-x-auto px-[var(--gutter)] pb-2">
                {cast.map((c) => (
                  <Focusable key={c.tag} onEnter={() => onActor({ name: c.tag, id: c.id != null ? String(c.id) : undefined })} onFocus={(el) => reveal(el, { block: 'center', inline: 'center' })} title={`${c.tag}: everything with them on your server`} className="w-24 shrink-0">
                  <div className="text-center">
                    <div className="relative mx-auto size-20 overflow-hidden rounded-full transition-all group-hover/f:ring-2 group-hover/f:ring-white/60 group-data-[hl=true]/f:scale-110 group-data-[hl=true]/f:ring-4 group-data-[hl=true]/f:ring-white">
                      <Avatar name={c.tag} size={80} />
                      {c.thumb && <img src={imageUrl(server, c.thumb, 160, 160)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                    </div>
                    <div className="mt-2 truncate text-sm font-semibold">{c.tag}</div>
                    <div className="truncate text-xs text-white/45">{c.role}</div>
                  </div>
                  </Focusable>
                ))}
              </div>
            </section>
          )}

          {extras.length > 0 && <div className="relative mt-14"><ExtrasRow items={extras} server={server} onPlay={onPlay} /></div>}
          {related.length > 0 && <div className="relative mt-14"><Row title="More like this" items={related} server={server} onSelect={onOpen} /></div>}
        </div>
      )}
      {ask && m && (() => {
        const yes = ask === 'pin' ? togglePin : toggleWatched
        const q = ask === 'pin'
          ? (pinned ? `Would you like to unpin ${m.title} from your Continue Watching?` : `Would you like to pin ${m.title} to your Continue Watching?`)
          : (watched ? `Would you like to mark ${m.title} as unwatched?` : `Would you like to mark ${m.title} as watched?`)
        const detail = ask === 'pin'
          ? (pinned ? 'It will leave your Continue Watching row unless you are partway through it.' : 'It stays in your Continue Watching row, even if you have not started it, until you unpin it.')
          : (m.type === 'show' ? (watched ? 'Every episode will be marked as unwatched.' : 'Every episode will be marked as watched.') : (watched ? 'Your progress and watch history for it are cleared.' : 'It will show as watched, and leave Continue Watching.'))
        return (
          <Layer onClose={() => setAsk(undefined)} className="absolute left-1/2 top-1/2 w-[min(460px,92vw)] -translate-x-1/2 -translate-y-1/2">
            <div className="pop rounded-3xl bg-[#17171c]/95 p-6 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10">
              <div className="text-xl font-extrabold leading-snug tracking-tight">{q}</div>
              <div className="mt-2 text-sm text-white/65">{detail}</div>
              <div className="mt-5 flex gap-3">
                <Focusable focusKey="ask-yes" onEnter={() => { setAsk(undefined); void yes() }} title="Yes">
                  <div className="rounded-full bg-white px-8 py-2.5 font-bold text-black transition-all group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]">Yes</div>
                </Focusable>
                <Focusable focusKey="ask-no" onEnter={() => setAsk(undefined)} title="No">
                  <div className="rounded-full bg-white/15 px-8 py-2.5 font-semibold transition-all group-hover/f:bg-white/25 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">No</div>
                </Focusable>
              </div>
            </div>
          </Layer>
        )
      })()}
      {toast && <div role="status" className="pop pointer-events-none fixed bottom-10 left-1/2 z-[95] max-w-[min(560px,92vw)] -translate-x-1/2 rounded-full bg-white px-6 py-3 text-center text-sm font-semibold text-black shadow-2xl">{toast}</div>}
      {confirmShow && showKey && (
        <Layer onClose={() => setConfirmShow(false)} className="absolute left-1/2 top-1/2 w-[min(440px,92vw)] -translate-x-1/2 -translate-y-1/2">
          <div className="pop rounded-3xl bg-[#17171c]/95 p-6 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10">
            <div className="text-xl font-extrabold tracking-tight">Reveal the whole show?</div>
            <div className="mt-2 text-sm text-white/65">This removes the spoiler blur from every episode of {m?.title}, for good. Other shows keep their blur.</div>
            <div className="mt-5 flex gap-3">
              <Focusable onEnter={() => { update({ spoilerFreeShows: { ...settings.spoilerFreeShows, [showKey]: true } }); setConfirmShow(false) }} title="Yes, reveal it all">
                <div className="rounded-full bg-white px-6 py-2.5 font-bold text-black transition-all group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]">Yes, reveal it all</div>
              </Focusable>
              <Focusable onEnter={() => setConfirmShow(false)} title="No">
                <div className="rounded-full bg-white/15 px-6 py-2.5 font-semibold transition-all group-hover/f:bg-white/25 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">No</div>
              </Focusable>
            </div>
          </div>
        </Layer>
      )}
      {picker?.anchor === 'modal' && (
        <Layer onClose={() => setPicker(undefined)} className="absolute left-1/2 top-1/2 w-[min(420px,92vw)] -translate-x-1/2 -translate-y-1/2">
          <div className="pop overflow-hidden rounded-3xl bg-[#17171c]/95 p-2 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10">
            <div className="px-3.5 pb-2 pt-3"><div className="truncate text-[1.02rem] font-bold">{picker.title}</div><div className="text-sm text-white/55">Choose a version to play</div></div>
            <VersionRows prefix="vermodal" versions={picker.versions} onPick={pickVersion} />
          </div>
        </Layer>
      )}
      {epMenu && <EpisodeMenu server={server} ep={epMenu} onClose={() => { const k = epMenu.ratingKey; setEpMenu(undefined); setTimeout(() => setFocus(`ep-${k}`), 60) }} onContinue={() => requestPlay(epMenu, 'modal', true)} onPlay={() => requestPlay(epMenu, 'modal', (epMenu.viewOffset ?? 0) >= 15_000 ? 'beginning' : undefined)} onToggleWatched={() => markEpisode(epMenu)} />}
      {editing && <EditInfo server={server} item={editing} onClose={() => { setEditing(undefined); setTimeout(() => setFocus(editing.type === 'episode' ? `edit-${editing.ratingKey}` : 'detail-edit'), 60) }} onSaved={onEdited} />}
      {addToChannel && m && <AddToChannel server={server} items={[m]} channels={settings.channels} onSave={(channels) => update({ channels })} onClose={() => setAddToChannel(false)} />}
      {clip && <ClipPopup key={clip.media.ratingKey + clip.segments.length} server={server} media={clip.media} segments={clip.segments} heading={clip.heading} subheading={clip.subheading} onClose={() => setClip(undefined)} />}
    </Layer>
  )
}
