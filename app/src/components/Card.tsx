import { useState } from 'react'
import { LOW_POWER } from '../lib/perf'
import { Check, Pin } from 'lucide-react'
import { Focusable } from './Focusable'
import { CheckMark } from './SelectionBar'
import { useSettings } from '../lib/settings'
import { useItemMenu } from '../lib/itemMenu'
import { backdropPath, episodeLabel, formatLeft, imageUrl, isSpoilerRisk, isWatched, posterPath, progressOf, type PlexMedia, type PlexServer } from '../lib/plex'

function Img({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <>
      {!loaded && <div className="skeleton absolute inset-0" />}
      {src && <img src={src} alt={alt} loading="lazy" decoding="async" draggable={false} onLoad={() => setLoaded(true)}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'} ${className}`} />}
    </>
  )
}

/** Marks a title that's pinned to Continue Watching. */
function PinMark({ m }: { m: PlexMedia }) {
  const { settings } = useSettings()
  if (!settings.pinned[m.ratingKey] && !(m.grandparentRatingKey && settings.pinned[m.grandparentRatingKey])) return null
  return <div className="absolute left-2 top-2 grid size-6 place-items-center rounded-full bg-black/60 text-accent"><Pin size={13} fill="currentColor" /></div>
}

function Badge({ m }: { m: PlexMedia }) {
  if (isWatched(m)) return <div className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-black/60"><Check size={14} strokeWidth={3} /></div>
  if ((m.type === 'show' || m.type === 'season') && m.leafCount) {
    const left = m.leafCount - (m.viewedLeafCount ?? 0)
    return left > 0 ? <div className="absolute right-2 top-2 min-w-6 rounded-full bg-accent px-1.5 py-0.5 text-center text-[11px] font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,.45)]">{left}</div> : null
  }
  return null
}

function Progress({ p }: { p: number }) {
  return p > 0 ? <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20"><div className="h-full bg-accent" style={{ width: `${p * 100}%` }} /></div> : null
}

export const focusRing = LOW_POWER
  ? 'transition-transform duration-200 ease-out group-data-[hl=true]/f:scale-[1.06] group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]'
  : 'transition-[transform,box-shadow] duration-300 ease-out-expo group-data-[hl=true]/f:scale-[1.07] group-data-[hl=true]/f:shadow-[0_18px_40px_-8px_rgba(0,0,0,.8),0_0_0_3px_var(--accent)] group-hover/f:scale-[1.03]'

export function PosterCard({ m, server, onEnter, onFocus, leftEdge, fromRecs, fromContinue, onLongPress, onSelect, selecting, checked }: { m: PlexMedia; server: PlexServer; onEnter: () => void; onFocus: (el: HTMLElement) => void; leftEdge?: boolean; fromRecs?: boolean; fromContinue?: boolean; onLongPress?: () => void; /** Adds "Select" to the menu and starts picking several. */ onSelect?: () => void; /** Picking mode: shows a tick, filled when picked. */ selecting?: boolean; checked?: boolean }) {
  const title = m.type === 'episode' ? m.grandparentTitle ?? m.title : m.title
  const sub = m.type === 'episode' ? `${episodeLabel(m)}` : m.type === 'collection' ? 'Collection' : [m.year, m.type === 'show' ? 'Series' : m.contentRating].filter(Boolean).join(' · ')
  const openMenu = useItemMenu()
  return (
    <Focusable onEnter={onEnter} onLongPress={onLongPress ?? (m.type === 'collection' ? undefined : () => openMenu(m, { fromRecs, fromContinue, onSelect }))} onFocus={onFocus} title={title} leftToRail={leftEdge} className="w-[var(--card-w)] shrink-0">
      <div className={`relative aspect-[2/3] overflow-hidden rounded-xl bg-surface ${focusRing} ${selecting && checked ? 'ring-4 ring-accent' : ''}`}>
        {selecting && <CheckMark checked={!!checked} />}
        <Img src={imageUrl(server, posterPath(m), 360, 540)} alt={title} />
        <Badge m={m} />
        <PinMark m={m} />
        <Progress p={progressOf(m)} />
      </div>
      <div className="mt-2.5 px-0.5 opacity-70 transition-opacity group-data-[hl=true]/f:opacity-100 group-hover/f:opacity-100">
        <div className="truncate text-[0.95rem] font-semibold leading-tight">{title}</div>
        <div className="mt-0.5 truncate text-[0.8rem] text-white/60">{sub}</div>
      </div>
    </Focusable>
  )
}

export function LandscapeCard({ m, server, onEnter, onFocus, leftEdge }: { m: PlexMedia; server: PlexServer; onEnter: () => void; onFocus: (el: HTMLElement) => void; leftEdge?: boolean }) {
  const isEp = m.type === 'episode'
  const title = isEp ? m.grandparentTitle ?? m.title : m.title
  const sub = isEp ? `${episodeLabel(m)} · ${m.title}` : formatLeft(m) || m.year?.toString()
  const art = isEp ? m.thumb : backdropPath(m) ?? m.thumb
  const { settings } = useSettings()
  const blur = settings.hideSpoilers && isSpoilerRisk(m)
  const openMenu = useItemMenu()
  return (
    <Focusable onEnter={onEnter} onLongPress={() => openMenu(m, { fromContinue: true })} onFocus={onFocus} title={title} leftToRail={leftEdge} className="w-[var(--land-w)] shrink-0 snap-start">
      <div className={`relative aspect-video overflow-hidden rounded-xl bg-surface ${focusRing}`}>
        <Img src={imageUrl(server, art, 640, 360)} alt={title} className={blur ? 'scale-125 blur-2xl brightness-75' : ''} />
        <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/10 to-transparent" />
        <div className="absolute inset-x-3.5 bottom-3.5">
          <div className="truncate text-[0.95rem] font-bold leading-tight drop-shadow">{title}</div>
          <div className="mt-0.5 truncate text-[0.78rem] text-white/75">{sub}</div>
        </div>
        <PinMark m={m} />
        <Progress p={progressOf(m)} />
      </div>
      {m.viewOffset ? <div className="mt-2 px-0.5 text-[0.78rem] text-white/55">{formatLeft(m)}</div> : null}
    </Focusable>
  )
}
