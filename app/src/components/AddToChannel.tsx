import { useEffect, useState } from 'react'
import { Check, ListPlus, Plus, Radio, X } from 'lucide-react'
import { setFocus } from '@noriginmedia/norigin-spatial-navigation'
import { Layer } from './Layer'
import { Focusable } from './Focusable'
import { Btn, Choice, NameField, Pill } from './AddChannel'
import type { PlexMedia } from '../lib/plex'
import { MAX_CHANNELS, newChannel, type Channel } from '../lib/tvguide'

type Step = 'choose' | 'existing' | 'newShow' | 'newMovie' | 'done'

interface Props { items: PlexMedia[]; channels: Channel[]; onSave: (channels: Channel[]) => void; onClose: () => void }

/** Put one or several shows (or several movies) on a channel: an existing one, or a new one. */
export function AddToChannel({ items, channels, onSave, onClose }: Props) {
  const isShow = items[0]?.type === 'show'
  const many = items.length > 1
  const [step, setStep] = useState<Step>('choose')
  const [name, setName] = useState('')
  const [order, setOrder] = useState<'ordered' | 'random' | 'release'>(isShow ? 'ordered' : 'random')
  const [perBlock, setPerBlock] = useState(1)
  const [added, setAdded] = useState('')
  const [note, setNote] = useState('')

  const showEntries = items.map((m) => ({ key: m.ratingKey, title: m.title, thumb: m.thumb, art: m.art }))
  const movieEntries = items.map((m) => ({ key: m.ratingKey, title: m.title, year: m.year, dur: m.duration ?? 100 * 60_000, date: m.originallyAvailableAt, thumb: m.thumb, art: m.art }))
  // A channel is a candidate when at least one of these isn't on it yet.
  const missing = (c: Channel) => (isShow ? showEntries.filter((s) => !c.shows?.some((x) => x.key === s.key)) : movieEntries.filter((s) => !c.movieItems?.some((x) => x.key === s.key)))
  const eligible = channels.filter((c) => (isShow ? c.kind === 'shows' : c.kind === 'movies') && missing(c).length > 0)
  const full = channels.length >= MAX_CHANNELS
  const noun = isShow ? (many ? `${items.length} shows` : 'show') : (many ? `${items.length} movies` : 'movie')
  const suggested = isShow && !many ? `${items[0].title} 24/7` : items.slice(0, 2).map((m) => m.title).join(' · ')

  useEffect(() => {
    const t = setTimeout(() => setFocus({ choose: 'atc-first', existing: 'atc-first', newShow: 'atc-create', newMovie: 'atc-create', done: 'atc-done' }[step]), 120)
    return () => clearTimeout(t)
  }, [step])

  const addTo = (c: Channel) => {
    const add = missing(c)
    setNote(add.length < items.length ? `${add.length} new added · ${items.length - add.length} ${items.length - add.length === 1 ? 'was' : 'were'} already on it` : '')
    onSave(channels.map((x) => (x.id !== c.id ? x : isShow ? { ...x, shows: [...(x.shows ?? []), ...(add as typeof showEntries)] } : { ...x, movieItems: [...(x.movieItems ?? []), ...(add as typeof movieEntries)] })))
    setAdded(c.name); setStep('done')
  }
  const create = () => {
    const finalName = name.trim() || suggested
    const draft = isShow
      ? { name: finalName, kind: 'shows' as const, shows: showEntries, perBlock: many ? perBlock : 1, episodeOrder: order === 'random' ? 'random' as const : 'ordered' as const }
      : { name: finalName, kind: 'movies' as const, genres: [], movieItems: movieEntries, movieOrder: order === 'release' ? 'release' as const : 'random' as const }
    const ch = newChannel(draft, channels)
    onSave([...channels, ch])
    setAdded(ch.name); setStep('done')
  }

  const title = { choose: 'Add to a channel', existing: 'Choose a channel', newShow: isShow && !many ? 'New 24/7 channel' : 'New channel', newMovie: 'New channel', done: 'Added' }[step]
  const label = items.length === 1 ? items[0].title : `${items.length} ${isShow ? 'shows' : 'movies'}`
  return (
    <Layer onClose={step === 'choose' || step === 'done' ? onClose : () => setStep('choose')} scrim="bg-black/70 backdrop-blur-sm" className="absolute left-1/2 top-1/2 w-[min(620px,94vw)] -translate-x-1/2 -translate-y-1/2">
      <div className="pop max-h-[88vh] overflow-y-auto rounded-3xl bg-[#17171c]/95 p-6 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10">
        <div className="flex items-center gap-3">
          <h2 className="flex-1 truncate text-xl font-extrabold tracking-tight">{title} <span className="font-semibold text-white/45">· {label}</span></h2>
          <Focusable onEnter={onClose} title="Close"><div className="grid size-9 place-items-center rounded-full transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><X size={18} /></div></Focusable>
        </div>

        {step === 'choose' && (
          <div className="mt-4 space-y-3">
            {isShow ? <>
              <Choice focusKey="atc-first" icon={<Radio size={24} />} label={many ? 'New channel' : 'New 24/7 channel'} hint={many ? `A channel with these ${noun}` : `${items[0].title}, on a loop`} onEnter={() => { setName(''); setStep('newShow') }} />
              <Choice icon={<ListPlus size={24} />} label="Existing channel" hint={eligible.length ? `${eligible.length} show channel${eligible.length === 1 ? '' : 's'} you can add ${many ? 'them' : 'it'} to` : 'No show channels to add to'} onEnter={() => eligible.length && setStep('existing')} />
            </> : <>
              <Choice focusKey="atc-first" icon={<ListPlus size={24} />} label="Existing channel" hint={eligible.length ? `${eligible.length} movie channel${eligible.length === 1 ? '' : 's'} you can add ${many ? 'them' : 'it'} to` : 'No movie channels to add to'} onEnter={() => eligible.length && setStep('existing')} />
              <Choice icon={<Plus size={24} />} label="New channel" hint={many ? `Start a movie channel with these ${noun}` : 'Start a movie channel with this film'} onEnter={() => { setName(''); setStep('newMovie') }} />
            </>}
            {full && <p className="text-sm text-amber-300/80">You’re at the channel limit ({MAX_CHANNELS}), so new channels can’t be created.</p>}
          </div>
        )}

        {step === 'existing' && (
          <div className="mt-4 space-y-2">
            {eligible.map((c, i) => <Choice key={c.id} focusKey={i === 0 ? 'atc-first' : undefined} icon={<span className="text-lg font-extrabold tabular-nums">{c.number}</span>} label={c.name} hint={`${missing(c).length === items.length ? `Adds ${items.length}` : `Adds ${missing(c).length} of ${items.length} (the rest are already on it)`} · ${c.kind === 'shows' ? `${c.shows?.length ?? 0} show${(c.shows?.length ?? 0) === 1 ? '' : 's'} now` : 'movies'}`} onEnter={() => addTo(c)} />)}
          </div>
        )}

        {(step === 'newShow' || step === 'newMovie') && (
          <div className="mt-4 space-y-5">
            {isShow && many && <div><div className="mb-2 font-bold">Episodes per show, each turn</div><div className="flex gap-2">{[1, 2, 3, 4, 5].map((n) => <Pill key={n} active={perBlock === n} onEnter={() => setPerBlock(n)}>{n}</Pill>)}</div></div>}
            <div><div className="mb-2 font-bold">{isShow ? 'Episode order' : 'Movie order'}</div>
              <div className="flex gap-2">{isShow
                ? <><Pill active={order === 'ordered'} onEnter={() => setOrder('ordered')}>In order</Pill><Pill active={order === 'random'} onEnter={() => setOrder('random')}>Random</Pill></>
                : <><Pill active={order === 'release'} onEnter={() => setOrder('release')}>Release date</Pill><Pill active={order === 'random'} onEnter={() => setOrder('random')}>Random</Pill></>}</div></div>
            <div><div className="mb-2 font-bold">Name</div><NameField value={name} onChange={setName} placeholder={suggested} /></div>
            <Btn primary focusKey="atc-create" disabled={full} onEnter={create}>Create channel</Btn>
          </div>
        )}

        {step === 'done' && (
          <div className="mt-5 flex items-center gap-4"><span className="grid size-12 place-items-center rounded-full bg-accent text-black"><Check size={26} strokeWidth={3} /></span>
            <div className="min-w-0 flex-1"><div className="font-bold">On “{added}”</div><div className="text-sm text-white/55">{note ? `${note}. ` : ''}It will appear in the TV Guide the next time you open it.</div></div>
            <Btn primary focusKey="atc-done" onEnter={onClose}>Done</Btn></div>
        )}
      </div>
    </Layer>
  )
}
