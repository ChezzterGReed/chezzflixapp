import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { resume as resumeNav } from '@noriginmedia/norigin-spatial-navigation'
import { Focusable } from './Focusable'
import { Row } from './Row'
import { Layer } from './Layer'
import { getCollectionItems, getCollections, getRelated, type PlexMedia, type PlexServer } from '../lib/plex'

/** After a movie ends: what to watch next. Sequels and the rest of its collection first, then similar movies. Pick one to start it. */
export function NextMovies({ server, media, onPlay, onClose }: { server: PlexServer; media: PlexMedia; onPlay: (m: PlexMedia) => void; onClose: () => void }) {
  const [series, setSeries] = useState<PlexMedia[]>()
  const [similar, setSimilar] = useState<PlexMedia[]>()

  useEffect(() => {
    let alive = true
    const tags = (media.Collection ?? []).map((c) => c.tag)
    const sec = media.librarySectionID != null ? String(media.librarySectionID) : ''
    ;(async () => {
      let inSeries: PlexMedia[] = []
      try {
        const col = tags.length && sec ? (await getCollections(server, sec)).find((c) => tags.includes(c.title)) : undefined
        if (col) inSeries = (await getCollectionItems(server, col.ratingKey)).filter((m) => m.type === 'movie' && m.ratingKey !== media.ratingKey)
      } catch { /* no collection */ }
      const y = media.year ?? 0
      // Later films first (in release order), then earlier ones.
      inSeries.sort((a, b) => { const la = (a.year ?? 0) >= y, lb = (b.year ?? 0) >= y; return la === lb ? (a.year ?? 0) - (b.year ?? 0) : la ? -1 : 1 })
      const seen = new Set([media.ratingKey, ...inSeries.map((m) => m.ratingKey)])
      const rel = (await getRelated(server, media.ratingKey).catch(() => [])).filter((m) => m.type === 'movie' && !seen.has(m.ratingKey))
      if (alive) { setSeries(inSeries); setSimilar(rel) }
    })()
    return () => { alive = false }
  }, [server, media])

  // The player holds spatial navigation paused while it plays; this screen needs it.
  useEffect(() => { resumeNav() }, [])
  const loading = !series || !similar

  return (
    <Layer player z="z-[80]" scrim="bg-black" onClose={onClose}>
      <div data-nopause className="absolute inset-0 overflow-y-auto pb-16 pt-12">
        <div className="mb-8 flex items-start gap-4 px-[var(--gutter)]">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold uppercase tracking-[0.25em] text-white/50">Finished</div>
            <h1 className="mt-1 truncate text-[2.4rem] font-extrabold tracking-[-0.03em]">{media.title}</h1>
            <p className="mt-1 text-white/60">What would you like to watch next?</p>
          </div>
          <Focusable focusKey="next-close" onEnter={onClose} title="Close">
            <div className="flex h-11 items-center gap-2 rounded-full bg-white/15 pl-4 pr-5 text-sm font-semibold transition-colors group-hover/f:bg-white/30 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><X size={18} />Close</div>
          </Focusable>
        </div>
        {loading && <div className="grid place-items-center py-20"><Loader2 className="animate-spin text-white/50" size={36} /></div>}
        {series && series.length > 0 && <Row title={(media.Collection?.[0]?.tag ?? 'In the series').replace(/^_+/, '')} subtitle="Sequels and the rest of the collection" items={series} server={server} onSelect={onPlay} />}
        {similar && similar.length > 0 && <Row title="More like this" items={similar} server={server} onSelect={onPlay} />}
        {series && similar && series.length === 0 && similar.length === 0 && <p className="px-[var(--gutter)] py-10 text-white/55">No suggestions for this one. Use Close to go back.</p>}
      </div>
    </Layer>
  )
}
