import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Copy, Languages, ListChecks, Loader2, Pencil, Plus, Radio, SlidersHorizontal, Sparkles, Trash2 } from 'lucide-react'
import { setFocus } from '@noriginmedia/norigin-spatial-navigation'
import { AddChannel, Btn, CheckRow, NameField, Pill } from '../components/AddChannel'
import { ChannelEditor } from '../components/ChannelEditor'
import { ChannelPlayer } from '../components/ChannelPlayer'
import { Focusable } from '../components/Focusable'
import { Layer } from '../components/Layer'
import { getMetadata, getWatchedItems, imageUrl, type PlexSection, type PlexServer } from '../lib/plex'
import { reveal } from '../lib/scroll'
import { noteMove } from '../lib/input'
import { useSettings, useSeason } from '../lib/settings'
import { seasonalChannels } from '../lib/seasonal'
import { Pumpkin } from '../components/Pumpkin'
import { cloneChannel, ensureGuide, HOUR, LANGS, newChannel, slotAt, suggestChannels, topUp, uniqueName, useGuide, type Channel, type ChannelDraft, type Slot, type Suggestion } from '../lib/tvguide'

const MIN = 60_000
const PPM = 10       // pixels per minute (so 30 minutes = 300px)
const ROW_H = 66
const CH_W = 150
const SLOW_MS = 8000 // after this long, offer to leave while the guide keeps building

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const until = (ms: number) => { const m = Math.max(0, Math.round(ms / MIN)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min` }

interface Props { server: PlexServer; sections: PlexSection[]; scope: string; onLeave: () => void }

/** The TV Guide: channels built from your library, an endless schedule, and a classic grid to browse it. */
export function TVGuide({ server, sections, scope, onLeave }: Props) {
  const { settings, update } = useSettings()
  const guide = useGuide()
  const season = useSeason()
  const [seasonalBase, setSeasonalBase] = useState<Channel[]>([])
  const [seasonalReady, setSeasonalReady] = useState(false)
  // In season, the app's own channels (e.g. Spooky Season) come first, in the season's colour; the guide waits until they're worked out.
  useEffect(() => {
    let alive = true
    if (!season) { setSeasonalBase([]); setSeasonalReady(true); return }
    setSeasonalReady(false)
    seasonalChannels(server, sections, season).then((c) => { if (alive) { setSeasonalBase(c); setSeasonalReady(true) } }).catch(() => alive && setSeasonalReady(true))
    return () => { alive = false }
  }, [server, sections, season])
  const seasonalChans = useMemo(() => seasonalBase.map((c) => ({ ...c, prefs: settings.seasonalPrefs[c.id] })), [seasonalBase, settings.seasonalPrefs])
  const userChannels = useMemo(() => [...settings.channels].sort((a, b) => a.number - b.number), [settings.channels])
  const channels = useMemo(() => [...seasonalChans, ...userChannels], [seasonalChans, userChannels])
  const [origin] = useState(() => Math.floor(Date.now() / (30 * MIN)) * 30 * MIN)   // the grid starts at the last half hour, so the "now" line sits inside it
  const [now, setNow] = useState(Date.now())
  const [sel, setSel] = useState(() => ({ row: 0, t: Date.now() }))
  const selRef = useRef(sel); selRef.current = sel
  const [adding, setAdding] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [menu, setMenu] = useState<Channel>()
  const [renaming, setRenaming] = useState<Channel>()
  const [prefsFor, setPrefsFor] = useState<Channel>()
  const [editing, setEditing] = useState<string>()   // id of the channel whose content is being edited
  const [guideSettings, setGuideSettings] = useState(false)
  const [watching, setWatching] = useState<number>()
  const [slow, setSlow] = useState(false)
  const track = useRef<HTMLDivElement>(null)

  // Build (or top up) the guide when this screen opens, and keep it from running dry while it's open.
  const hours = settings.guideHours
  useEffect(() => {
    if (!channels.length || !seasonalReady) return
    ensureGuide(server, sections, scope, channels, hours).catch(() => {})
  }, [server, sections, scope, channels, hours, seasonalReady])
  useEffect(() => {
    const t = setInterval(() => { setNow(Date.now()); topUp(server, sections, scope, channels, hours) }, 60_000)
    return () => clearInterval(t)
  }, [server, sections, scope, channels, hours])

  const loading = !seasonalReady || (channels.length > 0 && !guide.ready)
  useEffect(() => {
    if (!loading) { setSlow(false); return }
    const t = setTimeout(() => setSlow(true), SLOW_MS)
    return () => clearTimeout(t)
  }, [loading])

  // First time with no channels: offer some.
  useEffect(() => { if (!userChannels.length && !settings.guideOffered) setSuggesting(true) }, [userChannels.length, settings.guideOffered])

  useEffect(() => { if (guide.ready && channels.length && watching === undefined && !adding && !suggesting) { const t = setTimeout(() => setFocus('guide-grid'), 150); return () => clearTimeout(t) } }, [guide.ready, channels.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const rowSlots = (row: number): Slot[] => (channels[row] ? guide.slots[channels[row].id] ?? [] : [])
  const cur = slotAt(rowSlots(sel.row), sel.t) ?? rowSlots(sel.row).find((s) => s.end > sel.t)
  const aired = (s: Slot) => s.end > origin

  // ----- grid navigation (one focus target; the cursor is ours) -----
  const move = (dir: 'left' | 'right' | 'up' | 'down'): boolean | void => {
    const { row, t } = selRef.current
    const slots = rowSlots(row).filter(aired)
    const c = slotAt(slots, t) ?? slots.find((s) => s.end > t)
    if (!c) return false
    const anchor = Math.max(c.start, origin) + 1
    if (dir === 'right') { const n = slots[slots.indexOf(c) + 1]; if (n) { noteMove(); setSel({ row, t: n.start + 1 }) } return false }
    if (dir === 'left') { const p = slots[slots.indexOf(c) - 1]; if (p) { noteMove(); setSel({ row, t: Math.max(p.start, origin) + 1 }); return false } return }   // at the first one: let Left open the side menu
    if (dir === 'up') { if (row === 0) { setFocus('guide-add'); return false } noteMove(); setSel({ row: row - 1, t: anchor }); return false }
    if (row < channels.length - 1) { noteMove(); setSel({ row: row + 1, t: anchor }) }
    return false
  }

  // Keep the highlighted cell in view (the track scrolls sideways, the page scrolls up and down).
  useEffect(() => {
    if (!cur) return
    const el = document.getElementById(`cell-${sel.row}-${cur.start}`)
    if (el) { reveal(el, { block: 'none', inline: 'nearest', margin: CH_W + 30 }); reveal(el, { block: 'nearest', inline: 'none', margin: 56 }) }
  }, [sel.row, cur?.start, guide.ready]) // eslint-disable-line react-hooks/exhaustive-deps

  // Details for the highlighted program (its summary comes from Plex, a moment after you stop moving).
  const [summary, setSummary] = useState('')
  const summaries = useRef(new Map<string, string>())
  useEffect(() => {
    if (!cur) { setSummary(''); return }
    const hit = summaries.current.get(cur.key)
    if (hit !== undefined) { setSummary(hit); return }
    setSummary('')
    const t = setTimeout(() => getMetadata(server, cur.key).then((m) => { summaries.current.set(cur.key, m.summary ?? ''); setSummary(m.summary ?? '') }).catch(() => {}), 250)
    return () => clearTimeout(t)
  }, [cur?.key, server]) // eslint-disable-line react-hooks/exhaustive-deps

  // ----- channel changes -----
  const create = (drafts: ChannelDraft[]) => {
    let list = [...settings.channels]
    for (const d of drafts) { if (list.length >= 40) break; list = [...list, newChannel(d, list)] }
    update({ channels: list, guideOffered: true })
  }
  const patchChannel = (id: string, patch: Partial<Channel>) => update({ channels: settings.channels.map((x) => (x.id === id ? { ...x, ...patch } : x)) })
  const clone = (c: Channel) => { if (settings.channels.length < 40) update({ channels: [...settings.channels, cloneChannel(c, settings.channels)] }) }
  const setPrefs = (c: Channel, prefs: Channel['prefs']) => (c.seasonal ? update({ seasonalPrefs: { ...settings.seasonalPrefs, [c.id]: prefs ?? {} } }) : update({ channels: settings.channels.map((x) => (x.id === c.id ? { ...x, prefs } : x)) }))
  const remove = (c: Channel) => { update({ channels: settings.channels.filter((x) => x.id !== c.id) }); setMenu(undefined); setSel({ row: 0, t: Date.now() }) }
  const rename = (c: Channel, name: string) => { update({ channels: settings.channels.map((x) => (x.id === c.id ? { ...x, name: uniqueName(name, settings.channels.filter((y) => y.id !== c.id).map((y) => y.name)) } : x)) }); setRenaming(undefined) }

  const span = hours * 60 * PPM
  const ticks = useMemo(() => { const out: number[] = []; for (let t = Math.ceil(origin / (30 * MIN)) * 30 * MIN; t < origin + hours * HOUR; t += 30 * MIN) out.push(t); return out }, [origin, hours])

  // ----- render -----
  const header = (
    <div className="mb-3 flex shrink-0 items-center gap-3">
      <div className="flex items-center gap-3 text-[1.8rem] font-extrabold tracking-[-0.03em]"><Radio size={26} className="text-accent" />TV Guide</div>
      <div className="flex-1" />
      <Focusable focusKey="guide-add" onEnter={() => setAdding(true)} title="Add channel" leftToRail onArrow={(d) => { if (d === 'down' && guide.ready && channels.length) { setFocus('guide-grid'); return false } if (d === 'up') return false }}>
        <div className="flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[0.95rem] font-bold text-black transition-transform group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]"><Plus size={18} />Add channel</div>
      </Focusable>
      <Focusable focusKey="guide-settings" onEnter={() => setGuideSettings(true)} title="Guide settings" onArrow={(d) => { if (d === 'down' && guide.ready && channels.length) { setFocus('guide-grid'); return false } if (d === 'up') return false }}>
        <div className="flex h-11 items-center gap-2 rounded-full bg-white/12 px-5 text-[0.95rem] font-semibold transition-colors group-hover/f:bg-white/20 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><SlidersHorizontal size={17} />Settings</div>
      </Focusable>
      <Focusable focusKey="guide-suggest" onEnter={() => setSuggesting(true)} title="Suggested channels" onArrow={(d) => { if (d === 'down' && guide.ready && channels.length) { setFocus('guide-grid'); return false } if (d === 'up') return false }}>
        <div className="flex h-11 items-center gap-2 rounded-full bg-white/12 px-5 text-[0.95rem] font-semibold transition-colors group-hover/f:bg-white/20 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><Sparkles size={17} />Suggested</div>
      </Focusable>
    </div>
  )

  let body
  if (!channels.length) {
    body = (
      <div className="mx-auto mt-16 max-w-xl text-center">
        <Radio size={46} className="mx-auto text-white/30" />
        <h2 className="mt-5 text-2xl font-extrabold">No channels yet</h2>
        <p className="mt-2 text-white/55">Turn your library into live TV: channels of shows or movies that are always on, so you can jump in wherever they are.</p>
      </div>
    )
  } else if (loading) {
    body = (
      <div className="mx-auto mt-20 max-w-md text-center">
        <Loader2 className="mx-auto animate-spin text-accent" size={42} />
        <h2 className="mt-6 text-2xl font-extrabold">Building your guide…</h2>
        <p className="mt-2 text-white/55">{guide.total ? `Channel ${Math.min(guide.done + 1, guide.total)} of ${guide.total}` : 'Getting started'}</p>
        {slow && (
          <div className="fade-in mt-8">
            <p className="text-white/70">This is taking longer than expected. You can leave and come back: the guide keeps building in the background.</p>
            <div className="mt-4 flex justify-center"><Btn primary focusKey="guide-leave" onEnter={onLeave}><ArrowLeft size={16} />Back to Home</Btn></div>
          </div>
        )}
      </div>
    )
  } else {
    const heroArt = cur?.ar ?? cur?.th
    body = (
      <>
        {/* What's highlighted: artwork and details */}
        <div className="mb-3 flex shrink-0 gap-5 rounded-2xl bg-white/[0.05] p-3 ring-1 ring-white/10">
          <div className="relative aspect-video w-[min(250px,28vw)] shrink-0 overflow-hidden rounded-xl bg-surface">
            {heroArt && <img src={imageUrl(server, heroArt, 640, 360)} alt="" draggable={false} className="absolute inset-0 size-full object-cover" />}
            <div className="absolute inset-0 bg-linear-to-t from-black/70 to-transparent" />
            <div className="absolute bottom-2 left-3 text-sm font-bold">{channels[sel.row]?.seasonal ? '' : `${channels[sel.row]?.number} · `}{channels[sel.row]?.name}</div>
          </div>
          <div className="min-w-0 flex-1 py-1">
            {cur ? <>
              <div className="truncate text-[1.45rem] font-extrabold leading-tight">{cur.title}</div>
              {cur.sub && <div className="truncate text-white/70">{cur.sub}</div>}
              <p className="clamp-2 mt-1.5 text-[0.9rem] leading-snug text-white/65">{summary}</p>
              <div className="mt-2 text-sm font-semibold text-white/55">
                {clock(cur.start)} – {clock(cur.end)} · {cur.start <= now && now < cur.end ? <span className="text-accent">On now · {until(cur.end - now)} left</span> : cur.start > now ? `Starts in ${until(cur.start - now)}` : 'Aired'}
              </div>
            </> : <div className="text-white/50">Nothing scheduled.</div>}
          </div>
        </div>

        {/* The grid */}
        <Focusable focusKey="guide-grid" title="Guide" className="min-h-0 flex-1" leftToRail onArrow={move} onEnter={() => { if (selRef.current.row < channels.length) setWatching(selRef.current.row) }}
          onLongPress={() => { const c = channels[selRef.current.row]; if (c) setMenu(c) }}>
          <div className="h-full overflow-hidden rounded-2xl bg-[#101016] ring-1 ring-white/10">
            <div ref={track} className="h-full overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="relative" style={{ width: CH_W + span }}>
                {/* "Now": a line down the whole guide */}
                {now >= origin && now < origin + hours * HOUR && <div className="pointer-events-none absolute inset-y-0 z-[4] w-[2px] bg-accent/80 shadow-[0_0_10px_var(--accent)]" style={{ left: CH_W + ((now - origin) / MIN) * PPM }}><i className="absolute -left-[5px] top-0 size-3 rounded-full bg-accent" /></div>}
                {/* Time ruler */}
                <div className="sticky top-0 z-[8] flex h-11 border-b border-white/10 bg-[#1a1a22]" style={{ width: CH_W + span }}>
                  <div className="sticky left-0 z-[9] flex shrink-0 items-center bg-[#16161d] px-4 text-sm font-bold text-white/70" style={{ width: CH_W }}>{new Date(origin).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                  <div className="relative" style={{ width: span }}>
                    {ticks.map((t) => <span key={t} className="absolute border-l border-white/15 pl-2 text-sm font-semibold text-white/70" style={{ left: ((t - origin) / MIN) * PPM, height: 44, lineHeight: '44px', top: 0 }}>{clock(t)}</span>)}
                  </div>
                </div>
                {channels.map((ch, row) => {
                  const slots = (guide.slots[ch.id] ?? []).filter(aired)
                  return (
                    <div key={ch.id} className="relative flex border-b border-white/[0.07]" style={{ height: ROW_H, width: CH_W + span }}>
                      <div className={`sticky left-0 z-[6] flex shrink-0 items-center gap-3 px-4 transition-colors ${sel.row === row ? 'bg-[#26262f]' : 'bg-[#16161d]'}`} style={{ width: CH_W, boxShadow: ch.accent ? `inset 3px 0 0 ${ch.accent}` : undefined }}>
                        {ch.seasonal ? <Pumpkin size={26} /> : <span className="text-xl font-extrabold tabular-nums text-white/90">{ch.number}</span>}
                        <span className="min-w-0 flex-1 text-sm font-semibold leading-tight" style={{ color: ch.accent }}><span className={ch.accent ? '' : 'text-white/65'}>{ch.name}</span></span>
                      </div>
                      <div className="relative" style={{ width: span }}>
                        {slots.length === 0 && <div className="absolute inset-y-0 left-4 flex items-center text-sm text-white/40">Nothing to schedule: this channel has no playable content.</div>}
                        {slots.map((s) => {
                          const left = Math.max(0, ((s.start - origin) / MIN) * PPM)
                          const right = Math.min(span, ((s.end - origin) / MIN) * PPM)
                          const on = sel.row === row && cur?.start === s.start
                          return (
                            <div key={s.start} id={`cell-${row}-${s.start}`} onClick={() => { selRef.current = { row, t: s.start + 1 }; setSel(selRef.current) }}
                              className={`absolute inset-y-[3px] overflow-hidden rounded-lg px-3 py-1.5 ring-1 transition-colors ${on ? 'bg-white text-black ring-white group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]' : ch.accent ? 'ring-[#ff7a1a]/40' : 'bg-white/[0.07] ring-white/10'}`}
                              style={{ left: left + 2, width: Math.max(8, right - left - 4), background: !on && ch.accent ? 'rgba(255,122,26,.16)' : undefined }}>
                              <div className="flex items-center gap-1.5 truncate text-[0.98rem] font-bold">{s.start < origin && <span className="opacity-60">◂</span>}<span className="truncate">{s.title}</span></div>
                              <div className={`truncate text-xs ${on ? 'text-black/60' : 'text-white/50'}`}>{s.sub}</div>
                              {s.start <= now && now < s.end && <div className={`absolute inset-x-0 bottom-0 h-[3px] ${on ? 'bg-black/20' : 'bg-white/10'}`}><div className="h-full bg-accent" style={{ width: `${((now - s.start) / (s.end - s.start)) * 100}%` }} /></div>}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </Focusable>
        <p className="mt-2 shrink-0 px-1 text-xs text-white/40">OK tunes a channel · hold OK for channel options · Up and Down flip channels while watching</p>
      </>
    )
  }

  const draftsDone = useCallback((d: ChannelDraft) => { create([d]); setAdding(false) }, [settings.channels]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-screen flex-col px-[var(--gutter)] pb-4 pt-6">
      {header}
      {body}

      {adding && <AddChannel server={server} sections={sections} existing={settings.channels} onClose={() => setAdding(false)} onCreate={draftsDone} />}
      {suggesting && <Suggestions server={server} sections={sections} existing={settings.channels} genres={settings.genres} onClose={() => { setSuggesting(false); if (!settings.guideOffered) update({ guideOffered: true }) }} onAdd={(d) => { create(d); setSuggesting(false) }} />}
      {watching !== undefined && <ChannelPlayer server={server} channels={channels} start={watching} onClose={() => { setWatching(undefined); setTimeout(() => setFocus('guide-grid'), 150) }} />}

      {menu && (
        <Layer onClose={() => setMenu(undefined)} scrim="bg-black/55 backdrop-blur-sm" className="absolute left-1/2 top-1/2 w-[min(380px,92vw)] -translate-x-1/2 -translate-y-1/2">
          <div className="pop overflow-hidden rounded-3xl bg-[#17171c]/95 p-2 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10">
            <div className="px-3.5 pb-2 pt-3"><div className="truncate text-[1.02rem] font-bold">{menu.seasonal ? '' : `${menu.number} · `}{menu.name}</div><div className="text-sm text-white/55">{menu.seasonal ? 'Seasonal channel · built from this season’s list' : 'Channel options'}</div></div>
            {!menu.seasonal && <MenuItem icon={<ListChecks size={20} />} label="Edit content" onEnter={() => { setEditing(menu.id); setMenu(undefined) }} />}
            <MenuItem icon={<Languages size={20} />} label="Preferences" onEnter={() => { setPrefsFor(menu); setMenu(undefined) }} />
            <MenuItem icon={<Copy size={20} />} label="Clone channel" onEnter={() => { clone(menu); setMenu(undefined) }} />
            {!menu.seasonal && <MenuItem icon={<Pencil size={20} />} label="Rename" onEnter={() => { setRenaming(menu); setMenu(undefined) }} />}
            {!menu.seasonal && <MenuItem danger icon={<Trash2 size={20} />} label="Delete channel" onEnter={() => remove(menu)} />}
          </div>
        </Layer>
      )}
      {editing && settings.channels.find((c) => c.id === editing) && <ChannelEditor channel={settings.channels.find((c) => c.id === editing)!} server={server} sections={sections} onChange={(patch) => patchChannel(editing, patch)} onClose={() => setEditing(undefined)} />}
      {prefsFor && <Prefs channel={prefsFor.seasonal ? (seasonalChans.find((c) => c.id === prefsFor.id) ?? prefsFor) : (settings.channels.find((c) => c.id === prefsFor.id) ?? prefsFor)} onChange={(p) => setPrefs(prefsFor, p)} onClose={() => setPrefsFor(undefined)} />}
      {guideSettings && <GuideDefaults onClose={() => setGuideSettings(false)} />}
      {renaming && <Rename channel={renaming} onClose={() => setRenaming(undefined)} onSave={(n) => rename(renaming, n)} />}
    </div>
  )
}

function MenuItem({ icon, label, onEnter, danger }: { icon: React.ReactNode; label: string; onEnter: () => void; danger?: boolean }) {
  return (
    <Focusable onEnter={onEnter} title={label}>
      <div className={`flex h-12 items-center gap-3 rounded-xl px-3.5 text-[0.95rem] font-semibold transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${danger ? 'text-red-300 group-data-[hl=true]/f:text-red-700' : ''}`}>{icon}{label}</div>
    </Focusable>
  )
}

function Rename({ channel, onClose, onSave }: { channel: Channel; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(channel.name)
  return (
    <Layer onClose={onClose} scrim="bg-black/60 backdrop-blur-sm" className="absolute left-1/2 top-1/2 w-[min(440px,92vw)] -translate-x-1/2 -translate-y-1/2">
      <div className="pop rounded-3xl bg-[#17171c]/95 p-6 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10">
        <div className="mb-4 text-lg font-bold">Rename channel</div>
        <NameField value={name} onChange={setName} placeholder="Channel name" />
        <div className="mt-5 flex gap-2.5"><Btn onEnter={onClose}>Cancel</Btn><Btn primary onEnter={() => name.trim() && onSave(name)}>Save</Btn></div>
      </div>
    </Layer>
  )
}

/** "Want some channels to start with?" A checklist, all ticked: shows you've been watching, and genre channels. */
function Suggestions({ server, sections, existing, genres, onClose, onAdd }: { server: PlexServer; sections: PlexSection[]; existing: Channel[]; genres: string[]; onClose: () => void; onAdd: (d: ChannelDraft[]) => void }) {
  const [list, setList] = useState<Suggestion[]>()
  const [on, setOn] = useState<Set<string>>(new Set())
  useEffect(() => {
    let alive = true
    suggestChannels(server, sections, genres, (k) => getWatchedItems(server, k, 60)).then((l) => {
      if (!alive) return
      const names = new Set(existing.map((c) => c.name.toLowerCase()))
      const fresh = l.filter((s) => !names.has(s.label.toLowerCase()))
      setList(fresh); setOn(new Set(fresh.map((s) => s.id)))
    }).catch(() => alive && setList([]))
    return () => { alive = false }
  }, [server, sections, genres]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (list) { const t = setTimeout(() => setFocus('sug-add'), 150); return () => clearTimeout(t) } }, [list])
  const toggle = (id: string) => setOn((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <Layer onClose={onClose} scrim="bg-black/70 backdrop-blur-sm" className="absolute left-1/2 top-1/2 w-[min(720px,94vw)] -translate-x-1/2 -translate-y-1/2">
      <div className="pop max-h-[88vh] overflow-y-auto rounded-3xl bg-[#17171c]/95 p-6 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10">
        <div className="flex items-center gap-3 text-xl font-extrabold"><Sparkles className="text-accent" size={22} />Want some channels to start with?</div>
        <p className="mt-1 text-sm text-white/55">Based on what you watch and the genres you picked. Untick any you don’t want.</p>
        <div className="mt-4">
          {!list ? <div className="grid place-items-center py-10"><Loader2 className="animate-spin text-white/50" size={28} /></div>
            : list.length === 0 ? <p className="py-8 text-center text-white/55">Nothing to suggest right now. You can add channels yourself.</p>
            : list.map((s) => <CheckRow key={s.id} label={s.label} sub={s.hint} below on={on.has(s.id)} onEnter={() => toggle(s.id)} />)}
        </div>
        <div className="mt-5 flex gap-2.5">
          <Btn onEnter={onClose}>Not now</Btn>
          <Btn primary focusKey="sug-add" disabled={!list || on.size === 0} onEnter={() => onAdd((list ?? []).filter((s) => on.has(s.id)).map((s) => s.draft))}>Add {on.size || ''} channel{on.size === 1 ? '' : 's'}</Btn>
        </div>
      </div>
    </Layer>
  )
}

const langPills = (value: string | undefined, onPick: (v: string) => void, defaultLabel: string) => (
  <div className="flex flex-wrap gap-2">
    <Pill active={!value} onEnter={() => onPick('')}>{defaultLabel}</Pill>
    {LANGS.map((l) => <Pill key={l.id} active={value === l.id} onEnter={() => onPick(l.id)}>{l.name}</Pill>)}
  </div>
)

/** Guide-wide defaults for audio and subtitles (each channel can override them in its Preferences). */
function GuideDefaults({ onClose }: { onClose: () => void }) {
  const { settings, update } = useSettings()
  return (
    <Layer onClose={onClose} scrim="bg-black/70 backdrop-blur-sm" className="absolute left-1/2 top-1/2 w-[min(720px,94vw)] -translate-x-1/2 -translate-y-1/2">
      <div className="pop max-h-[88vh] overflow-y-auto rounded-3xl bg-[#17171c]/95 p-6 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10">
        <div className="flex items-center gap-3 text-xl font-extrabold"><SlidersHorizontal className="text-accent" size={22} />Guide settings</div>
        <p className="mt-1 text-sm text-white/55">Defaults for every channel. Each channel can override them from its options (hold OK on a channel).</p>
        <div className="mt-5 space-y-5">
          <div><div className="mb-2 font-bold">Subtitles</div><div className="flex gap-2"><Pill active={settings.guideSubs === 'off'} onEnter={() => update({ guideSubs: 'off' })}>Off</Pill><Pill active={settings.guideSubs === 'on'} onEnter={() => update({ guideSubs: 'on' })}>On</Pill></div></div>
          {settings.guideSubs === 'on' && <div><div className="mb-2 font-bold">Subtitle language</div>{langPills(settings.guideSubLang, (v) => update({ guideSubLang: v || 'en' }), 'English')}</div>}
          <div><div className="mb-2 font-bold">Even out volume between channels</div><div className="flex gap-2"><Pill active={settings.guideLeveling} onEnter={() => update({ guideLeveling: true })}>On</Pill><Pill active={!settings.guideLeveling} onEnter={() => update({ guideLeveling: false })}>Off</Pill></div><p className="mt-2 text-sm text-white/50">Measures each program for a few seconds and holds one steady volume, remembered for next time, so channel changes aren’t jarring. It never changes a program by more than 5 dB either way. Turn it off and everything plays at its normal volume. Dolby and DTS sent straight to a receiver can’t be adjusted.</p></div>
          <div><div className="mb-2 font-bold">Audio language</div>{langPills(settings.guideAudioLang, (v) => update({ guideAudioLang: v }), 'Whatever the file plays by default')}</div>
        </div>
        <div className="mt-6"><Btn primary focusKey="gd-done" onEnter={onClose}>Done</Btn></div>
      </div>
    </Layer>
  )
}

/** One channel's audio and subtitle choices. "Default" follows the guide settings. */
function Prefs({ channel, onChange, onClose }: { channel: Channel; onChange: (p: Channel['prefs']) => void; onClose: () => void }) {
  const p = channel.prefs ?? {}
  const set = (patch: NonNullable<Channel['prefs']>) => onChange({ ...p, ...patch })
  return (
    <Layer onClose={onClose} scrim="bg-black/70 backdrop-blur-sm" className="absolute left-1/2 top-1/2 w-[min(720px,94vw)] -translate-x-1/2 -translate-y-1/2">
      <div className="pop max-h-[88vh] overflow-y-auto rounded-3xl bg-[#17171c]/95 p-6 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10">
        <div className="flex items-center gap-3 text-xl font-extrabold"><Languages className="text-accent" size={22} />{channel.seasonal ? '' : `${channel.number} · `}{channel.name}: preferences</div>
        <p className="mt-1 text-sm text-white/55">For example: an anime channel with Japanese audio and English subtitles, another with English audio and no subtitles. “Default” uses the guide settings.</p>
        <div className="mt-5 space-y-5">
          <div><div className="mb-2 font-bold">Audio language</div>{langPills(p.audioLang, (v) => set({ audioLang: v }), 'Default')}</div>
          <div><div className="mb-2 font-bold">Subtitles</div>
            <div className="flex gap-2">{(['default', 'off', 'on'] as const).map((m) => <Pill key={m} active={(p.subs ?? 'default') === m} onEnter={() => set({ subs: m })}>{m === 'default' ? 'Default' : m === 'off' ? 'Off' : 'On'}</Pill>)}</div></div>
          {p.subs === 'on' && <div><div className="mb-2 font-bold">Subtitle language</div>{langPills(p.subLang, (v) => set({ subLang: v }), 'Default')}</div>}
        </div>
        <div className="mt-6"><Btn primary focusKey="pf-done" onEnter={onClose}>Done</Btn></div>
      </div>
    </Layer>
  )
}
