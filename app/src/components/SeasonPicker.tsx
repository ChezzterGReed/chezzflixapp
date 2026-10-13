import { useEffect, useRef, useState } from 'react'
import { ChevronRight, Loader2, X } from 'lucide-react'
import { setFocus } from '@noriginmedia/norigin-spatial-navigation'
import { Layer } from './Layer'
import { Focusable } from './Focusable'
import { Btn, CheckRow } from './AddChannel'
import { describeSeasons, loadSeasons, type Channel, type SeasonInfo } from '../lib/tvguide'
import type { PlexServer } from '../lib/plex'

type ShowEntry = NonNullable<Channel['shows']>[number]

/** Every season except specials: what a show plays when nothing special has been chosen. */
const defaultSet = (all: SeasonInfo[]) => new Set(all.filter((s) => s.index !== 0).map((s) => s.index))
const sameSet = (a: Set<number>, b: Set<number>) => a.size === b.size && [...a].every((x) => b.has(x))

/** Tick the seasons of one show that a channel should play. Saving "everything but specials" stores nothing (that's the default). */
export function SeasonPicker({ server, show, value, onSave, onClose }: { server: PlexServer; show: { key: string; title: string }; value?: number[]; onSave: (seasons: number[] | undefined) => void; onClose: () => void }) {
  const [all, setAll] = useState<SeasonInfo[]>()
  const [picked, setPicked] = useState<Set<number>>(new Set(value ?? []))
  useEffect(() => {
    let alive = true
    loadSeasons(server, show.key).then((l) => { if (!alive) return; setAll(l); if (!value) setPicked(defaultSet(l)) })
    return () => { alive = false }
  }, [server, show.key]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (all) { const t = setTimeout(() => setFocus('sp-save'), 120); return () => clearTimeout(t) } }, [!!all])

  const toggle = (i: number) => setPicked((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n })
  const save = () => { if (all) onSave(sameSet(picked, defaultSet(all)) ? undefined : [...picked].sort((a, b) => a - b)); onClose() }

  return (
    <Layer onClose={onClose} z="z-[60]" scrim="bg-black/70 backdrop-blur-sm" className="absolute left-1/2 top-1/2 flex max-h-[88vh] w-[min(520px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col">
      <div className="pop flex max-h-[88vh] flex-col overflow-hidden rounded-3xl bg-[#17171c]/95 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10">
        <div className="flex shrink-0 items-center gap-3 border-b border-white/8 px-6 py-4">
          <h2 className="min-w-0 flex-1 truncate text-xl font-extrabold tracking-tight">{show.title}<span className="font-semibold text-white/45"> · seasons</span></h2>
          <Focusable onEnter={onClose} title="Close"><div className="grid size-9 place-items-center rounded-full transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><X size={18} /></div></Focusable>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!all ? <div className="grid place-items-center py-14"><Loader2 className="animate-spin text-white/50" size={30} /></div>
            : all.length === 0 ? <p className="py-10 text-center text-white/50">Couldn’t read this show’s seasons.</p>
            : <>
              <div className="mb-2 flex gap-2 px-1">
                <Btn onEnter={() => setPicked(defaultSet(all))}>All seasons</Btn>
                <Btn onEnter={() => setPicked(new Set())}>None</Btn>
              </div>
              {all.map((s) => <CheckRow key={s.index} label={s.title} sub={`${s.episodes} episode${s.episodes === 1 ? '' : 's'}`} on={picked.has(s.index)} onEnter={() => toggle(s.index)} />)}
            </>}
        </div>
        <div className="flex shrink-0 items-center gap-3 border-t border-white/8 px-6 py-4">
          <span className="min-w-0 flex-1 truncate text-sm text-white/55">{picked.size ? describeSeasons([...picked]) : 'Pick at least one season'}</span>
          <Btn onEnter={onClose}>Cancel</Btn>
          <Btn primary focusKey="sp-save" disabled={!picked.size} onEnter={save}>Save</Btn>
        </div>
      </div>
    </Layer>
  )
}

/**
 * The shows you're adding, each with the seasons it will play (everything but specials unless you change it). Only shows with more than one
 * season are listed. If none are, `onNone` is called as soon as that's known, so the step can be skipped.
 */
export function SeasonsList({ server, shows, sel, onSel, onNone }: { server: PlexServer; shows: ShowEntry[]; sel: Record<string, number[] | undefined>; onSel: (key: string, seasons: number[] | undefined) => void; onNone?: () => void }) {
  const [counts, setCounts] = useState<Record<string, number>>()
  const [editing, setEditing] = useState<ShowEntry>()
  const none = useRef(onNone); none.current = onNone
  useEffect(() => {
    let alive = true
    Promise.all(shows.map(async (s) => [s.key, (await loadSeasons(server, s.key)).filter((x) => x.index !== 0).length] as const)).then((l) => {
      if (!alive) return
      const c = Object.fromEntries(l); setCounts(c)
      if (!l.some(([, n]) => n > 1)) none.current?.()
    })
    return () => { alive = false }
  }, [server, shows.map((s) => s.key).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  const multi = shows.filter((s) => (counts?.[s.key] ?? 0) > 1)
  return (
    <>
      <p className="px-2 pb-2 text-sm text-white/55">Every season plays unless you choose otherwise (specials are left out). Pick a show to change which seasons.</p>
      {!counts ? <div className="grid place-items-center py-14"><Loader2 className="animate-spin text-white/50" size={30} /></div>
        : multi.map((s) => (
          <Focusable key={s.key} onEnter={() => setEditing(s)} title={`${s.title}: choose seasons`}>
            <div className="flex items-center gap-3 rounded-xl px-3.5 py-3 transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">
              <span className="min-w-0 flex-1 truncate font-semibold">{s.title}</span>
              <span className="shrink-0 text-sm opacity-60">{describeSeasons(sel[s.key])}</span>
              <ChevronRight size={18} className="shrink-0 opacity-60" />
            </div>
          </Focusable>
        ))}
      {editing && <SeasonPicker server={server} show={editing} value={sel[editing.key]} onSave={(v) => onSel(editing.key, v)} onClose={() => setEditing(undefined)} />}
    </>
  )
}

/** A small window that asks which seasons to include for shows being added; skips itself if none of them has more than one season. */
export function SeasonsReview({ server, shows, onDone, onCancel }: { server: PlexServer; shows: ShowEntry[]; onDone: (shows: ShowEntry[]) => void; onCancel: () => void }) {
  const [sel, setSel] = useState<Record<string, number[] | undefined>>(() => Object.fromEntries(shows.map((s) => [s.key, s.seasons])))
  const finish = () => onDone(shows.map((s) => ({ ...s, seasons: sel[s.key] })))
  const finishRef = useRef(finish); finishRef.current = finish
  useEffect(() => { const t = setTimeout(() => setFocus('sr-done'), 400); return () => clearTimeout(t) }, [])
  return (
    <Layer onClose={onCancel} z="z-[55]" scrim="bg-black/70 backdrop-blur-sm" className="absolute left-1/2 top-1/2 flex max-h-[88vh] w-[min(560px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col">
      <div className="pop flex max-h-[88vh] flex-col overflow-hidden rounded-3xl bg-[#17171c]/95 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10">
        <div className="flex shrink-0 items-center gap-3 border-b border-white/8 px-6 py-4"><h2 className="flex-1 text-xl font-extrabold tracking-tight">Which seasons?</h2></div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4"><SeasonsList server={server} shows={shows} sel={sel} onSel={(k, v) => setSel((p) => ({ ...p, [k]: v }))} onNone={() => finishRef.current()} /></div>
        <div className="flex shrink-0 items-center gap-3 border-t border-white/8 px-6 py-4"><Btn onEnter={onCancel}>Cancel</Btn><div className="flex-1" /><Btn primary focusKey="sr-done" onEnter={finish}>Add</Btn></div>
      </div>
    </Layer>
  )
}
