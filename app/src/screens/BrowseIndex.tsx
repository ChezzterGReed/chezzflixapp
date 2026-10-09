import { useEffect, useState } from 'react'
import { Focusable } from '../components/Focusable'
import { BackButton } from '../components/BackButton'
import { getCollections, getGenres, imageUrl, type PlexCollectionRef, type PlexSection, type PlexServer } from '../lib/plex'
import type { AnimeInfo } from '../lib/homeData'
import type { HomeTab } from '../lib/settings'

const hue = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 11)
const TAB_NAME: Record<HomeTab, string> = { all: 'Everything', foryou: 'For You', trending: 'Everything', movie: 'Movies', show: 'Shows', anime: 'Anime' }

interface Props {
  server: PlexServer; sections: PlexSection[]; tab: HomeTab; kind: 'genres' | 'collections'; anime?: AnimeInfo
  /** Set when opened from a specific library. */
  section?: PlexSection
  onBack: () => void
  onGenre: (genre: string) => void; onCollection: (c: PlexCollectionRef) => void
}

/** Every genre, or every collection, for the current Home tab. */
export function BrowseIndex({ server, sections, tab, kind, anime, section, onBack, onGenre, onCollection }: Props) {
  const [genres, setGenres] = useState<string[]>()
  const [collections, setCollections] = useState<PlexCollectionRef[]>()
  const secs = section ? [section] : sections.filter((s) => tab === 'all' || tab === 'anime' || tab === 'trending' || s.type === tab)

  useEffect(() => {
    let alive = true
    if (kind === 'genres') {
      if (tab === 'anime') {
        const tags = new Set<string>(); (anime?.items ?? []).forEach((m) => m.Genre?.forEach((g) => g.tag !== 'Anime' && tags.add(g.tag)))
        setGenres([...tags].sort())
      } else Promise.all(secs.map((s) => getGenres(server, s.key))).then((g) => alive && setGenres([...new Set(g.flat().map((x) => x.title))].sort()))
    } else {
      Promise.all((tab === 'anime' ? [] : secs).map((s) => getCollections(server, s.key))).then((c) => alive && setCollections(c.flat().sort((a, b) => a.title.replace(/^_+/, '').localeCompare(b.title.replace(/^_+/, '')))))
    }
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server, kind, tab, sections, section])

  const loading = kind === 'genres' ? !genres : !collections
  const empty = !loading && (kind === 'genres' ? !genres?.length : !collections?.length)

  return (
    <div className="px-[var(--gutter)] pb-24 pt-10">
      <BackButton onBack={onBack} label={section ? `Back to ${section.title}` : 'Back'} />
      <div className="fade-up mb-8">
        <h1 className="text-[2.6rem] font-extrabold tracking-[-0.03em]">{kind === 'genres' ? 'Genres' : 'Collections'}</h1>
        <p className="mt-1 text-white/55">{section ? section.title : TAB_NAME[tab]}</p>
      </div>
      {empty && <p className="py-12 text-white/55">{kind === 'genres' ? 'No genres found.' : 'No collections found here.'}</p>}
      {kind === 'genres' ? (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
          {loading ? Array.from({ length: 12 }, (_, i) => <div key={i} className="skeleton aspect-[16/9] rounded-2xl" />)
            : genres!.map((g) => (
              <Focusable key={g} onEnter={() => onGenre(g)} title={g} onFocus={(el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                <div className="relative aspect-[16/9] overflow-hidden rounded-2xl p-4 shadow-lg transition-[transform,box-shadow] duration-300 ease-out-expo group-hover/f:scale-[1.04] group-data-[hl=true]/f:scale-[1.06] group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]"
                  style={{ background: `linear-gradient(135deg, hsl(${hue(g)} 55% 34%), hsl(${(hue(g) + 50) % 360} 60% 14%))` }}>
                  <div className="absolute -right-6 -top-6 size-28 rounded-full bg-white/10 blur-sm" />
                  <div className="absolute bottom-4 left-4 text-xl font-extrabold leading-tight tracking-tight drop-shadow">{g}</div>
                </div>
              </Focusable>
            ))}
        </div>
      ) : (
        <div className="grid gap-x-4 gap-y-8 [grid-template-columns:repeat(auto-fill,minmax(var(--card-w),1fr))]">
          {loading ? Array.from({ length: 12 }, (_, i) => <div key={i} className="skeleton aspect-[2/3] rounded-xl" />)
            : collections!.map((c) => (
              <Focusable key={c.ratingKey} onEnter={() => onCollection(c)} title={c.title} onFocus={(el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-surface transition-[transform,box-shadow] duration-300 ease-out-expo group-hover/f:scale-[1.03] group-data-[hl=true]/f:scale-[1.06] group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]"
                  style={{ background: `linear-gradient(160deg, hsl(${hue(c.title)} 50% 30%), hsl(${(hue(c.title) + 40) % 360} 55% 12%))` }}>
                  {c.thumb && <img src={imageUrl(server, c.thumb, 360, 540)} alt="" loading="lazy" draggable={false} className="absolute inset-0 size-full object-cover" />}
                </div>
                <div className="mt-2.5 truncate px-0.5 text-[0.95rem] font-semibold">{c.title.replace(/^_+/, '')}</div>
              </Focusable>
            ))}
        </div>
      )}
    </div>
  )
}
