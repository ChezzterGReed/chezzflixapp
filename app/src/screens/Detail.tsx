import { useEffect, useRef, useState } from 'react'
import { BIG_IMAGE } from '../lib/perf'
import { reveal, scrollToTopOf } from '../lib/scroll'
import { ArrowLeft, BookmarkCheck, BookmarkPlus, Check, Clapperboard, Eye, EyeOff, History, Layers, Loader2, Pin, PinOff, Play, Radio } from 'lucide-react'
import { useSettings } from '../lib/settings'
import { AddToChannel } from '../components/AddToChannel'
import { getWatchlist, setOnWatchlist, watchItemOf, watchKey } from '../lib/watchlist'
import { setFocus } from '@noriginmedia/norigin-spatial-navigation'
import { Layer } from '../components/Layer'
import { Focusable } from '../components/Focusable'
import { Avatar } from '../components/Avatar'
import { Row } from '../components/Row'
import { ClipPopup } from '../components/ClipPopup'
import { firstEpisode, previewSegments, recapSegments, withFile, type Segment } from '../lib/clips'
import {
  backdropPath, posterPath, episodeLabel, formatLeft, formatRuntime, getChildren, getMetadata, getRelated, imageUrl, isSpoilerRisk, isWatched, logoPath,
  progressOf, setWatched, type PlexMedia, type PlexServer,
} from '../lib/plex'

function Pill({ children, onEnter, active, focusKey, onArrow }: { children: React.ReactNode; onEnter: () => void; active?: boolean; focusKey?: string; onArrow?: (d: 'left' | 'right' | 'up' | 'down') => boolean | void }) {
  return (
    <Focusable focusKey={focusKey} onEnter={onEnter} onArrow={onArrow} onFocus={(el) => reveal(el, { block: 'center' })}>
      <div className={`whitespace-nowrap rounded-full px-5 py-2 text-[0.92rem] font-semibold transition-colors group-hover/f:bg-white/20 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${active ? 'bg-accent text-black' : 'bg-white/8 text-white/60'}`}>{children}</div>
    </Focusable>
  )
}

function Episode({ ep, server, spoiler, onReveal, onPlay, onRecap, upTo }: { ep: PlexMedia; server: PlexServer; spoiler: boolean; onReveal: () => void; onPlay: (m: PlexMedia) => void; onRecap: (m: PlexMedia) => void; /** First episode only: where Up goes (the season buttons). */ upTo?: string }) {
  const p = progressOf(ep)
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <Focusable focusKey={`ep-${ep.ratingKey}`} onEnter={() => onPlay(ep)} onFocus={(el) => reveal(el)} onArrow={(d) => { if (d === 'up' && upTo) { setFocus(upTo); return false } }}>
          <div className="flex gap-5 rounded-2xl p-3 transition-all duration-200 group-hover/f:bg-white/6 group-data-[hl=true]/f:bg-white/12 group-data-[hl=true]/f:ring-2 group-data-[hl=true]/f:ring-white">
            <div className="relative aspect-video w-[min(280px,32vw)] shrink-0 overflow-hidden rounded-xl bg-surface-2">
              <img src={imageUrl(server, ep.thumb, 560, 315)} alt="" loading="lazy" draggable={false} className={`h-full w-full object-cover transition-all duration-500 ${spoiler ? 'scale-125 blur-2xl brightness-75' : ''}`} />
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
      {!spoiler && (
        <Focusable focusKey={`recap-${ep.ratingKey}`} onEnter={() => onRecap(ep)} title="Recap">
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold transition-colors group-hover/f:bg-white/25 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><History size={16} />Recap</div>
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

interface Props { ratingKey: string; server: PlexServer; token: string; /** Land on this episode (its season selected) instead of the Play button. */ focusEpisode?: { season?: string; ep: string }; onClose: () => void; onPlay: (m: PlexMedia) => void; onOpen: (m: PlexMedia) => void; onCollection: (title: string, sectionId?: string | number) => void }

export function Detail({ ratingKey, server, token, focusEpisode, onClose, onPlay, onOpen, onCollection }: Props) {
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
    getRelated(server, ratingKey).then((r) => alive && setRelated(r))
    return () => { alive = false }
  }, [ratingKey, server])

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

  // Pin to Continue Watching: stays there, started or not, until unpinned.
  const pinned = !!(m && settings.pinned[m.ratingKey])
  const togglePin = () => {
    if (!m) return
    const pins = { ...settings.pinned }
    if (pinned) delete pins[m.ratingKey]; else pins[m.ratingKey] = Math.floor(Date.now() / 1000)
    update({ pinned: pins })
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
    await setOnWatchlist(token, watchItemOf(wKey, m), next).catch(() => setOnList(!next))
  }

  const toggleWatched = async () => {
    if (!m) return
    const next = !watched
    setWatchedState(next)
    await setWatched(server, m.ratingKey, next)
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
  // Recap: eight short snippets spread across one episode.
  const recap = async (ep: PlexMedia) => {
    const full = await getMetadata(server, ep.ratingKey)   // the full record carries the credits marker the last clip needs
    const segments = recapSegments(full)
    if (segments.length) setClip({ media: full, segments, heading: `${m?.title ?? full.grandparentTitle ?? ''}`, subheading: `Recap · ${episodeLabel(full)} · ${full.title}` })
  }

  const next = m?.type === 'show' ? m.OnDeck?.Metadata : undefined
  const resumeTarget = next ?? (m?.viewOffset ? m : undefined)
  const playLabel = resumeTarget?.viewOffset ? 'Resume' : 'Play'
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
                <Focusable focusKey="detail-play" onEnter={() => onPlay(resumeTarget ?? m)} title="Play" onFocus={scrollToTopOf}>
                  <div className="flex h-13 items-center gap-2.5 rounded-full bg-white px-8 text-[1.05rem] font-bold text-black transition-all duration-200 group-hover/f:bg-white/90 group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]">
                    <Play size={20} fill="currentColor" />{playLabel}{sub && <span className="font-semibold text-black/60">{sub}</span>}
                  </div>
                </Focusable>
                <Focusable onEnter={toggleWatched} title={watched ? 'Mark unwatched' : 'Mark watched'} onFocus={scrollToTopOf}>
                  <div className="flex h-13 items-center gap-2.5 rounded-full bg-white/15 px-6 text-[1rem] font-semibold transition-all duration-200 group-hover/f:bg-white/25 group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:bg-white/30 group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]">
                    {watched ? <EyeOff size={20} /> : <Eye size={20} />}{watched ? 'Mark unwatched' : 'Mark watched'}
                  </div>
                </Focusable>
                <Focusable focusKey="detail-preview" onEnter={preview} title="Preview" onFocus={scrollToTopOf}>
                  <div className="flex h-13 items-center gap-2.5 rounded-full bg-white/15 px-6 text-[1rem] font-semibold transition-all duration-200 group-hover/f:bg-white/25 group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:bg-white/30 group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]">
                    {busy ? <Loader2 size={20} className="animate-spin" /> : <Clapperboard size={20} />}Preview
                  </div>
                </Focusable>
                <Focusable onEnter={togglePin} title={pinned ? 'Unpin from Continue Watching' : 'Pin to Continue Watching'} onFocus={scrollToTopOf}>
                  <div className="flex h-13 items-center gap-2.5 rounded-full bg-white/15 px-6 text-[1rem] font-semibold transition-all duration-200 group-hover/f:bg-white/25 group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:bg-white/30 group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]">
                    {pinned ? <PinOff size={20} /> : <Pin size={20} />}{pinned ? 'Unpin' : 'Pin'}
                  </div>
                </Focusable>
                {settings.tvGuide && (m.type === 'show' || m.type === 'movie') && (
                  <Focusable onEnter={() => setAddToChannel(true)} title="Add to a TV Guide channel" onFocus={scrollToTopOf}>
                    <div className="flex h-13 items-center gap-2.5 rounded-full bg-white/15 px-6 text-[1rem] font-semibold transition-all duration-200 group-hover/f:bg-white/25 group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:bg-white/30 group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]">
                      <Radio size={20} />Channel
                    </div>
                  </Focusable>
                )}
                {onList !== undefined && (
                  <Focusable onEnter={toggleList} title={onList ? 'Remove from Watchlist' : 'Add to Watchlist'} onFocus={scrollToTopOf}>
                    <div className="flex h-13 items-center gap-2.5 rounded-full bg-white/15 px-6 text-[1rem] font-semibold transition-all duration-200 group-hover/f:bg-white/25 group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:bg-white/30 group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]">
                      {onList ? <BookmarkCheck size={20} className="text-accent" /> : <BookmarkPlus size={20} />}Watchlist
                    </div>
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
                {seasons.map((s) => <Pill key={s.ratingKey} focusKey={`season-${s.ratingKey}`} active={s.ratingKey === season} onEnter={() => setSeason(s.ratingKey)}
                  onArrow={(d) => { if (d === 'down' && episodes[0]) { setFocus(`ep-${episodes[0].ratingKey}`); return false } if (d === 'up') { setFocus('detail-play'); return false } }}>{s.title}</Pill>)}
              </div>
              <div className="space-y-1.5">
                {episodes.length === 0 ? Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-[130px] rounded-2xl" />)
                  : episodes.map((ep, n) => <Episode key={ep.ratingKey} ep={ep} server={server} onPlay={onPlay} onRecap={recap} upTo={n === 0 && season ? `season-${season}` : undefined}
                    spoiler={settings.hideSpoilers && isSpoilerRisk(ep) && !revealed.has(ep.ratingKey)}
                    onReveal={() => setRevealed((r) => new Set(r).add(ep.ratingKey))} />)}
              </div>
            </section>
          )}

          {cast.length > 0 && (
            <section className="relative mt-14">
              <h2 className="mb-4 px-[var(--gutter)] text-[1.35rem] font-bold tracking-tight">Cast</h2>
              <div className="flex gap-6 overflow-x-auto px-[var(--gutter)] pb-2">
                {cast.map((c) => (
                  <div key={c.tag} className="w-24 shrink-0 text-center">
                    <div className="relative mx-auto size-20 overflow-hidden rounded-full">
                      <Avatar name={c.tag} size={80} />
                      {c.thumb && <img src={imageUrl(server, c.thumb, 160, 160)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                    </div>
                    <div className="mt-2 truncate text-sm font-semibold">{c.tag}</div>
                    <div className="truncate text-xs text-white/45">{c.role}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {related.length > 0 && <div className="relative mt-14"><Row title="More like this" items={related} server={server} onSelect={onOpen} /></div>}
        </div>
      )}
      {addToChannel && m && <AddToChannel items={[m]} channels={settings.channels} onSave={(channels) => update({ channels })} onClose={() => setAddToChannel(false)} />}
      {clip && <ClipPopup key={clip.media.ratingKey + clip.segments.length} server={server} media={clip.media} segments={clip.segments} heading={clip.heading} subheading={clip.subheading} onClose={() => setClip(undefined)} />}
    </Layer>
  )
}
