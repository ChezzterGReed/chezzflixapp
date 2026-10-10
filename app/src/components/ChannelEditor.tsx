import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Loader2, Plus, X } from 'lucide-react'
import { setFocus } from '@noriginmedia/norigin-spatial-navigation'
import { Layer } from './Layer'
import { Focusable } from './Focusable'
import { Btn, CheckRow, LetterBar, NameField, Pill, RatingPicker, letterOf, lettersIn } from './AddChannel'
import { getAllSectionItems, getGenres, isOtherSection, type PlexMedia, type PlexSection, type PlexServer } from '../lib/plex'
import type { Channel } from '../lib/tvguide'

type ShowEntry = NonNullable<Channel['shows']>[number]
type MovieEntry = NonNullable<Channel['movieItems']>[number]
type Picked = { shows?: ShowEntry[]; movies?: MovieEntry[]; genres?: string[] }
const PAGE = 60

/** A checklist of shows, movies or genres to add to a channel (anything already on it is left out). */
function ContentPicker({ kind, server, sections, exclude, onPick, onClose }: { kind: 'shows' | 'movies' | 'genres'; server: PlexServer; sections: PlexSection[]; exclude: Set<string>; onPick: (p: Picked) => void; onClose: () => void }) {
  const [list, setList] = useState<{ id: string; label: string; sub?: string; show?: ShowEntry; movie?: MovieEntry }[]>()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')
  const [letter, setLetter] = useState('')
  const [limit, setLimit] = useState(PAGE)

  useEffect(() => {
    let alive = true
    const type = kind === 'shows' ? 'show' : 'movie'
    const libs = sections.filter((s) => s.type === type && !isOtherSection(s))
    const load = async () => {
      if (kind === 'genres') {
        const g = [...new Set((await Promise.all(libs.map((s) => getGenres(server, s.key).catch(() => [])))).flat().map((x) => x.title))].sort((a, b) => a.localeCompare(b))
        return g.filter((x) => !exclude.has(x)).map((x) => ({ id: x, label: x }))
      }
      const all = (await Promise.all(libs.map((s) => getAllSectionItems(server, s.key, 'titleAsc').catch(() => [] as PlexMedia[])))).flat()
      const seen = new Set<string>()
      return all.filter((m) => m.type === type && !seen.has(m.ratingKey) && !exclude.has(m.ratingKey) && !!seen.add(m.ratingKey)).sort((a, b) => a.title.localeCompare(b.title)).map((m) => (
        kind === 'shows'
          ? { id: m.ratingKey, label: m.title, sub: m.year ? String(m.year) : undefined, show: { key: m.ratingKey, title: m.title, thumb: m.thumb, art: m.art } }
          : { id: m.ratingKey, label: m.title, sub: m.year ? String(m.year) : undefined, movie: { key: m.ratingKey, title: m.title, year: m.year, dur: m.duration ?? 100 * 60_000, date: m.originallyAvailableAt, thumb: m.thumb, art: m.art, rating: m.contentRating ?? '' } }
      ))
    }
    load().then((l) => alive && setList(l)).catch(() => alive && setList([]))
    return () => { alive = false }
  }, [kind, server, sections]) // eslint-disable-line react-hooks/exhaustive-deps

  const letters = useMemo(() => lettersIn((list ?? []).map((x) => x.label)), [list])
  // Typing in the filter box takes over from a chosen letter.
  const shown = (list ?? []).filter((x) => (filter ? x.label.toLowerCase().includes(filter.toLowerCase()) : letter ? letterOf(x.label) === letter : true))
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const done = () => {
    const chosen = (list ?? []).filter((x) => picked.has(x.id))
    onPick(kind === 'genres' ? { genres: chosen.map((x) => x.id) } : kind === 'shows' ? { shows: chosen.map((x) => x.show!) } : { movies: chosen.map((x) => x.movie!) })
  }
  useEffect(() => { const t = setTimeout(() => setFocus(kind === 'genres' ? 'cp-add' : 'cp-filter'), 150); return () => clearTimeout(t) }, [kind, !!list]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Layer onClose={onClose} scrim="bg-black/70 backdrop-blur-sm" className="absolute left-1/2 top-1/2 flex max-h-[88vh] w-[min(660px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col">
      <div className="pop flex max-h-[88vh] flex-col overflow-hidden rounded-3xl bg-[#17171c]/95 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10">
        <div className="flex shrink-0 items-center gap-3 border-b border-white/8 px-6 py-4"><h2 className="flex-1 text-xl font-extrabold tracking-tight">{kind === 'shows' ? 'Add shows' : kind === 'movies' ? 'Add movies' : 'Add genres'}</h2>
          <Focusable onEnter={onClose} title="Close"><div className="grid size-9 place-items-center rounded-full transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><X size={18} /></div></Focusable></div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {kind !== 'genres' && <div className="mb-3"><NameField focusKey="cp-filter" value={filter} onChange={(v) => { setFilter(v); if (v) setLetter(''); setLimit(PAGE) }} placeholder={`Filter ${kind}…`} /></div>}
          {kind !== 'genres' && list && <LetterBar letters={letters} value={filter ? '' : letter} onPick={(l) => { setLetter(l); setFilter(''); setLimit(PAGE) }} />}
          {!list ? <div className="grid place-items-center py-16"><Loader2 className="animate-spin text-white/50" size={30} /></div>
            : <>
              {shown.slice(0, limit).map((x) => <CheckRow key={x.id} label={x.label} sub={x.sub} on={picked.has(x.id)} onEnter={() => toggle(x.id)} />)}
              {shown.length > limit && <div className="pt-2"><Btn onEnter={() => setLimit((l) => l + PAGE)}>Show more ({shown.length - limit} left)</Btn></div>}
              {shown.length === 0 && <p className="py-10 text-center text-white/50">{list.length ? 'Nothing matches.' : 'Nothing left to add.'}</p>}
            </>}
        </div>
        <div className="flex shrink-0 items-center gap-3 border-t border-white/8 px-6 py-4">
          <Btn onEnter={onClose}><ArrowLeft size={16} />Cancel</Btn><div className="flex-1" />
          <Btn focusKey="cp-add" primary disabled={!picked.size} onEnter={done}>Add {picked.size || ''} selected</Btn>
        </div>
      </div>
    </Layer>
  )
}

/** What's on a channel: tick or untick shows, movies and genres, add more, and change how it plays. */
export function ChannelEditor({ channel, server, sections, onChange, onClose }: { channel: Channel; server: PlexServer; sections: PlexSection[]; onChange: (patch: Partial<Channel>) => void; onClose: () => void }) {
  // Everything that was ever on the channel while this window is open stays listed, so an unticked item can be ticked again.
  const [shows, setShows] = useState<ShowEntry[]>(channel.shows ?? [])
  const [movies, setMovies] = useState<MovieEntry[]>(channel.movieItems ?? [])
  const [genres, setGenres] = useState<string[]>(channel.genres ?? [])
  const [adding, setAdding] = useState<'shows' | 'movies' | 'genres'>()
  const [note, setNote] = useState('')

  const onShows = channel.shows ?? [], onMovies = channel.movieItems ?? [], onGenres = channel.genres ?? []
  const total = channel.kind === 'shows' ? onShows.length : onGenres.length + onMovies.length
  const guard = () => { if (total <= 1) { setNote(`A channel needs at least one ${channel.kind === 'shows' ? 'show' : 'movie or genre'}.`); setTimeout(() => setNote(''), 2600); return true } return false }

  const toggleShow = (s: ShowEntry) => { if (onShows.some((x) => x.key === s.key)) { if (!guard()) onChange({ shows: onShows.filter((x) => x.key !== s.key) }) } else onChange({ shows: [...onShows, s] }) }
  const toggleMovie = (m: MovieEntry) => { if (onMovies.some((x) => x.key === m.key)) { if (!guard()) onChange({ movieItems: onMovies.filter((x) => x.key !== m.key) }) } else onChange({ movieItems: [...onMovies, m] }) }
  const toggleGenre = (g: string) => { if (onGenres.includes(g)) { if (!guard()) onChange({ genres: onGenres.filter((x) => x !== g) }) } else onChange({ genres: [...onGenres, g] }) }

  const exclude = useMemo(() => new Set<string>(adding === 'shows' ? onShows.map((s) => s.key) : adding === 'movies' ? onMovies.map((m) => m.key) : onGenres), [adding, onShows, onMovies, onGenres])
  const picked = (p: Picked) => {
    if (p.shows) { setShows((l) => [...l, ...p.shows!.filter((s) => !l.some((x) => x.key === s.key))]); onChange({ shows: [...onShows, ...p.shows.filter((s) => !onShows.some((x) => x.key === s.key))] }) }
    if (p.movies) { setMovies((l) => [...l, ...p.movies!.filter((s) => !l.some((x) => x.key === s.key))]); onChange({ movieItems: [...onMovies, ...p.movies.filter((s) => !onMovies.some((x) => x.key === s.key))] }) }
    if (p.genres) { setGenres((l) => [...l, ...p.genres!.filter((g) => !l.includes(g))]); onChange({ genres: [...onGenres, ...p.genres.filter((g) => !onGenres.includes(g))] }) }
    setAdding(undefined)
  }
  useEffect(() => { const t = setTimeout(() => setFocus('ce-done'), 150); return () => clearTimeout(t) }, [])

  const heading = (t: string) => <div className="mb-1 mt-5 px-1 text-[0.7rem] font-bold uppercase tracking-[0.2em] text-white/45">{t}</div>
  return (
    <Layer onClose={onClose} scrim="bg-black/70 backdrop-blur-sm" className="absolute left-1/2 top-1/2 flex max-h-[88vh] w-[min(700px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col">
      <div className="pop flex max-h-[88vh] flex-col overflow-hidden rounded-3xl bg-[#17171c]/95 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10">
        <div className="flex shrink-0 items-center gap-3 border-b border-white/8 px-6 py-4">
          <h2 className="min-w-0 flex-1 truncate text-xl font-extrabold tracking-tight">{channel.number} · {channel.name}<span className="font-semibold text-white/45"> · content</span></h2>
          <Focusable onEnter={onClose} title="Close"><div className="grid size-9 place-items-center rounded-full transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><X size={18} /></div></Focusable>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-1">
          {channel.kind === 'shows' ? <>
            {heading('How it plays')}
            <div className="flex flex-wrap items-center gap-2 px-1 pb-1">
              <Pill active={channel.episodeOrder !== 'random'} onEnter={() => onChange({ episodeOrder: 'ordered' })}>In order</Pill><Pill active={channel.episodeOrder === 'random'} onEnter={() => onChange({ episodeOrder: 'random' })}>Random</Pill>
              {shows.length > 1 && <><span className="mx-1 text-white/30">|</span>{[1, 2, 3, 4, 5].map((n) => <Pill key={n} active={(channel.perBlock ?? 1) === n} onEnter={() => onChange({ perBlock: n })}>{n} per turn</Pill>)}</>}
            </div>
            {heading(`Shows (${onShows.length})`)}
            {shows.map((s) => <CheckRow key={s.key} label={s.title} on={onShows.some((x) => x.key === s.key)} onEnter={() => toggleShow(s)} />)}
            <div className="pt-2"><Btn onEnter={() => setAdding('shows')}><Plus size={16} />Add shows</Btn></div>
          </> : <>
            {heading('How it plays')}
            <div className="flex flex-wrap gap-2 px-1 pb-1"><Pill active={channel.movieOrder === 'release'} onEnter={() => onChange({ movieOrder: 'release' })}>Release date</Pill><Pill active={channel.movieOrder !== 'release'} onEnter={() => onChange({ movieOrder: 'random' })}>Random</Pill></div>
            {genres.length > 0 && <>{heading(`Genres (${onGenres.length})`)}{genres.map((g) => <CheckRow key={g} label={g} sub="every movie in it" on={onGenres.includes(g)} onEnter={() => toggleGenre(g)} />)}</>}
            {movies.length > 0 && <>{heading(`Movies added one by one (${onMovies.length})`)}{movies.map((m) => <CheckRow key={m.key} label={m.title} sub={m.year ? String(m.year) : undefined} on={onMovies.some((x) => x.key === m.key)} onEnter={() => toggleMovie(m)} />)}</>}
            {heading(`Ratings (${channel.ratings?.length ? channel.ratings.length + ' chosen' : 'all'})`)}
            <RatingPicker value={channel.ratings ?? []} onChange={(v) => onChange({ ratings: v.length ? v : undefined })} />
            <div className="flex flex-wrap gap-2 pt-3"><Btn onEnter={() => setAdding('genres')}><Plus size={16} />Add genres</Btn><Btn onEnter={() => setAdding('movies')}><Plus size={16} />Add movies</Btn></div>
          </>}
        </div>
        <div className="flex shrink-0 items-center gap-3 border-t border-white/8 px-6 py-4">
          <span className="min-w-0 flex-1 text-sm text-amber-300/90">{note || 'Changes apply right away. The schedule is rebuilt the next time you open the guide.'}</span>
          <Btn primary focusKey="ce-done" onEnter={onClose}>Done</Btn>
        </div>
      </div>
      {adding && <ContentPicker kind={adding} server={server} sections={sections} exclude={exclude} onPick={picked} onClose={() => setAdding(undefined)} />}
    </Layer>
  )
}
