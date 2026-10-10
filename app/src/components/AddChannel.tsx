import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, Film, Loader2, Tv, X } from 'lucide-react'
import { setFocus } from '@noriginmedia/norigin-spatial-navigation'
import { Layer } from './Layer'
import { Focusable } from './Focusable'
import { getAllSectionItems, getGenres, isOtherSection, type PlexMedia, type PlexSection, type PlexServer } from '../lib/plex'
import { uniqueName, type Channel, type ChannelDraft } from '../lib/tvguide'

type Step = 'type' | 'shows' | 'showOpts' | 'movies' | 'movieOpts' | 'name'
const PAGE = 60

function Choice({ icon, label, hint, onEnter, focusKey }: { icon: ReactNode; label: string; hint?: string; onEnter: () => void; focusKey?: string }) {
  return (
    <Focusable focusKey={focusKey} onEnter={onEnter} title={label}>
      <div className="flex items-center gap-4 rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10 transition-all group-hover/f:bg-white/10 group-data-[hl=true]/f:scale-[1.02] group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent/20 text-accent group-data-[hl=true]/f:bg-black/10 group-data-[hl=true]/f:text-black">{icon}</span>
        <span className="min-w-0"><span className="block text-[1.05rem] font-bold">{label}</span>{hint && <span className="block text-sm opacity-60">{hint}</span>}</span>
      </div>
    </Focusable>
  )
}

export function CheckRow({ label, sub, on, onEnter }: { label: string; sub?: string; on: boolean; onEnter: () => void }) {
  return (
    <Focusable onEnter={onEnter} title={label}>
      <div className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">
        <span className={`grid size-6 shrink-0 place-items-center rounded-md ring-1 transition-colors ${on ? 'bg-accent text-black ring-accent' : 'ring-white/30'}`}>{on && <Check size={15} strokeWidth={3} />}</span>
        <span className="min-w-0 flex-1 truncate font-semibold">{label}</span>
        {sub && <span className="shrink-0 text-sm opacity-55">{sub}</span>}
      </div>
    </Focusable>
  )
}

export function Pill({ active, onEnter, children }: { active?: boolean; onEnter: () => void; children: ReactNode }) {
  return (
    <Focusable onEnter={onEnter}>
      <div className={`rounded-full px-5 py-2 text-[0.92rem] font-semibold transition-colors group-hover/f:bg-white/20 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${active ? 'bg-accent text-black' : 'bg-white/10 text-white/75'}`}>{children}</div>
    </Focusable>
  )
}

export function Btn({ children, onEnter, primary, focusKey, disabled }: { children: ReactNode; onEnter: () => void; primary?: boolean; focusKey?: string; disabled?: boolean }) {
  return (
    <Focusable focusKey={focusKey} onEnter={disabled ? undefined : onEnter}>
      <div className={`flex items-center gap-2 rounded-full px-6 py-2.5 text-[0.95rem] font-bold transition-all ${disabled ? 'bg-white/5 text-white/30' : primary ? 'bg-white text-black group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]' : 'bg-white/12 group-hover/f:bg-white/20 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black'}`}>{children}</div>
    </Focusable>
  )
}

/** A text box that works with a remote: OK opens the keyboard, Enter/Down leaves it. */
export function NameField({ value, onChange, placeholder, focusKey = 'name-field' }: { value: string; onChange: (v: string) => void; placeholder: string; focusKey?: string }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <Focusable focusKey={focusKey} onEnter={() => input.current?.focus()} title={placeholder}>
      <div className="rounded-2xl bg-white/[0.07] px-5 py-3.5 ring-1 ring-white/10 transition-all group-data-[hl=true]/f:ring-2 group-data-[hl=true]/f:ring-accent">
        <input ref={input} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} enterKeyHint="done"
          onKeyDown={(e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') e.currentTarget.blur(); else if (e.key === 'Enter' || e.key === 'Escape') { e.currentTarget.blur(); setFocus(focusKey) } }}
          className="w-full bg-transparent text-[1.15rem] font-semibold outline-none placeholder:text-white/30" />
      </div>
    </Focusable>
  )
}

interface Props { server: PlexServer; sections: PlexSection[]; existing: Channel[]; onClose: () => void; onCreate: (draft: ChannelDraft) => void }

/** The "add a channel" flow: shows or movies -> what to include -> how it plays -> a name. */
export function AddChannel({ server, sections, existing, onClose, onCreate }: Props) {
  const [step, setStep] = useState<Step>('type')
  const [shows, setShows] = useState<PlexMedia[]>()
  const [pickedShows, setPickedShows] = useState<PlexMedia[]>([])
  const [filter, setFilter] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [genres, setGenres] = useState<string[]>()
  const [pickedGenres, setPickedGenres] = useState<string[]>([])
  const [perBlock, setPerBlock] = useState(1)
  const [episodeOrder, setEpisodeOrder] = useState<'ordered' | 'random'>('ordered')
  const [movieOrder, setMovieOrder] = useState<'release' | 'random'>('random')
  const [name, setName] = useState('')

  const showLibs = useMemo(() => sections.filter((s) => s.type === 'show' && !isOtherSection(s)), [sections])
  const movieLibs = useMemo(() => sections.filter((s) => s.type === 'movie' && !isOtherSection(s)), [sections])

  useEffect(() => {
    if (step === 'shows' && !shows) {
      Promise.all(showLibs.map((s) => getAllSectionItems(server, s.key, 'titleAsc').catch(() => [] as PlexMedia[])))
        .then((l) => { const seen = new Set<string>(); setShows(l.flat().filter((m) => m.type === 'show' && !seen.has(m.ratingKey) && !!seen.add(m.ratingKey)).sort((a, b) => a.title.localeCompare(b.title))) })
    }
    if (step === 'movies' && !genres) {
      Promise.all(movieLibs.map((s) => getGenres(server, s.key).catch(() => [])))
        .then((l) => setGenres([...new Set(l.flat().map((g) => g.title))].sort((a, b) => a.localeCompare(b))))
    }
  }, [step, shows, genres, server, showLibs, movieLibs])

  // Land on something sensible whenever the step changes.
  useEffect(() => {
    const k = { type: 'add-shows', shows: 'add-filter', showOpts: 'add-next', movies: 'add-next', movieOpts: 'add-next', name: 'name-field' }[step]
    const t = setTimeout(() => setFocus(k), 120)
    return () => clearTimeout(t)
  }, [step])

  const toggleShow = (m: PlexMedia) => setPickedShows((p) => (p.some((x) => x.ratingKey === m.ratingKey) ? p.filter((x) => x.ratingKey !== m.ratingKey) : [...p, m]))
  const toggleGenre = (g: string) => setPickedGenres((p) => (p.includes(g) ? p.filter((x) => x !== g) : [...p, g]))

  const suggestedName = step === 'name' && !name
    ? (movieMode() ? pickedGenres.slice(0, 3).join(' · ') : pickedShows.length === 1 ? `${pickedShows[0].title} 24/7` : pickedShows.slice(0, 2).map((s) => s.title).join(' · '))
    : ''
  function movieMode() { return pickedGenres.length > 0 && pickedShows.length === 0 }

  const finish = () => {
    const finalName = uniqueName(name.trim() || suggestedName || 'Channel', existing.map((c) => c.name))
    if (movieMode()) onCreate({ name: finalName, kind: 'movies', genres: pickedGenres, movieOrder })
    else onCreate({ name: finalName, kind: 'shows', shows: pickedShows.map((m) => ({ key: m.ratingKey, title: m.title, thumb: m.thumb, art: m.art })), perBlock: pickedShows.length > 1 ? perBlock : 1, episodeOrder })
  }

  const back = () => {
    if (step === 'type') return onClose()
    setStep({ shows: 'type', showOpts: 'shows', movies: 'type', movieOpts: 'movies', name: movieMode() ? 'movieOpts' : 'showOpts' }[step] as Step)
  }

  const filtered = (shows ?? []).filter((m) => !filter || m.title.toLowerCase().includes(filter.toLowerCase()))
  const title = { type: 'Add a channel', shows: 'Choose shows', showOpts: 'How should it play?', movies: 'Choose genres', movieOpts: 'How should it play?', name: 'Name your channel' }[step]

  return (
    <Layer onClose={back} scrim="bg-black/70 backdrop-blur-sm" className="absolute left-1/2 top-1/2 flex max-h-[88vh] w-[min(660px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col">
      <div className="pop flex max-h-[88vh] flex-col overflow-hidden rounded-3xl bg-[#17171c]/95 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10">
        <div className="flex shrink-0 items-center gap-3 border-b border-white/8 px-6 py-4">
          <h2 className="flex-1 text-xl font-extrabold tracking-tight">{title}</h2>
          <Focusable onEnter={onClose} title="Close"><div className="grid size-9 place-items-center rounded-full transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><X size={18} /></div></Focusable>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {step === 'type' && (
            <div className="space-y-3">
              <Choice focusKey="add-shows" icon={<Tv size={24} />} label="TV shows" hint="Episodes from the shows you pick, one after another" onEnter={() => { setPickedGenres([]); setStep('shows') }} />
              <Choice icon={<Film size={24} />} label="Movies" hint="Every movie in the genres you pick" onEnter={() => { setPickedShows([]); setStep('movies') }} />
            </div>
          )}

          {step === 'shows' && (
            <>
              <div className="mb-3"><NameField focusKey="add-filter" value={filter} onChange={(v) => { setFilter(v); setLimit(PAGE) }} placeholder="Filter shows…" /></div>
              {!shows ? <div className="grid place-items-center py-16"><Loader2 className="animate-spin text-white/50" size={30} /></div>
                : <>
                  {filtered.slice(0, limit).map((m) => <CheckRow key={m.ratingKey} label={m.title} sub={m.year ? String(m.year) : undefined} on={pickedShows.some((x) => x.ratingKey === m.ratingKey)} onEnter={() => toggleShow(m)} />)}
                  {filtered.length > limit && <div className="pt-2"><Btn onEnter={() => setLimit((l) => l + PAGE)}>Show more ({filtered.length - limit} left)</Btn></div>}
                  {filtered.length === 0 && <p className="py-10 text-center text-white/50">No shows match.</p>}
                </>}
            </>
          )}

          {step === 'showOpts' && (
            <div className="space-y-6 px-1 py-2">
              {pickedShows.length > 1 && (
                <div><div className="mb-2 font-bold">Episodes per show, each turn</div><div className="flex flex-wrap gap-2">{[1, 2, 3, 4, 5].map((n) => <Pill key={n} active={perBlock === n} onEnter={() => setPerBlock(n)}>{n}</Pill>)}</div>
                  <p className="mt-2 text-sm text-white/50">{perBlock} episode{perBlock > 1 ? 's' : ''} of one show, then the next show, and so on around the list.</p></div>
              )}
              <div><div className="mb-2 font-bold">Episode order</div><div className="flex flex-wrap gap-2"><Pill active={episodeOrder === 'ordered'} onEnter={() => setEpisodeOrder('ordered')}>In order</Pill><Pill active={episodeOrder === 'random'} onEnter={() => setEpisodeOrder('random')}>Random</Pill></div>
                <p className="mt-2 text-sm text-white/50">Every episode plays before any repeats. Each show picks up where it left off.</p></div>
            </div>
          )}

          {step === 'movies' && (
            <>
              {!genres ? <div className="grid place-items-center py-16"><Loader2 className="animate-spin text-white/50" size={30} /></div>
                : <>
                  <p className="px-2 pb-2 text-sm text-white/50">Pick one or two for a focused channel. With several, all their movies are mixed together.</p>
                  {genres.map((g) => <CheckRow key={g} label={g} on={pickedGenres.includes(g)} onEnter={() => toggleGenre(g)} />)}
                  {genres.length === 0 && <p className="py-10 text-center text-white/50">No genres found in your movie libraries.</p>}
                </>}
            </>
          )}

          {step === 'movieOpts' && (
            <div className="px-1 py-2"><div className="mb-2 font-bold">Movie order</div><div className="flex flex-wrap gap-2"><Pill active={movieOrder === 'release'} onEnter={() => setMovieOrder('release')}>Release date</Pill><Pill active={movieOrder === 'random'} onEnter={() => setMovieOrder('random')}>Random</Pill></div>
              <p className="mt-2 text-sm text-white/50">Every movie plays before any repeats.</p></div>
          )}

          {step === 'name' && (
            <div className="px-1 py-2"><NameField value={name} onChange={setName} placeholder={suggestedName || 'Channel name'} />
              <p className="mt-3 px-1 text-sm text-white/50">Leave it empty to use “{suggestedName || 'Channel'}”.</p></div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-white/8 px-6 py-4">
          <Btn onEnter={back}><ArrowLeft size={16} />{step === 'type' ? 'Cancel' : 'Back'}</Btn>
          <div className="flex-1" />
          {step === 'shows' && <Btn focusKey="add-next" primary disabled={!pickedShows.length} onEnter={() => setStep(pickedShows.length > 1 ? 'showOpts' : 'showOpts')}>Next · {pickedShows.length} selected</Btn>}
          {step === 'showOpts' && <Btn focusKey="add-next" primary onEnter={() => { setName(''); setStep('name') }}>Next</Btn>}
          {step === 'movies' && <Btn focusKey="add-next" primary disabled={!pickedGenres.length} onEnter={() => setStep('movieOpts')}>Next · {pickedGenres.length} selected</Btn>}
          {step === 'movieOpts' && <Btn focusKey="add-next" primary onEnter={() => { setName(''); setStep('name') }}>Next</Btn>}
          {step === 'name' && <Btn focusKey="add-next" primary onEnter={finish}>Create channel</Btn>}
        </div>
      </div>
    </Layer>
  )
}
