import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Search as SearchIcon, Star, TriangleAlert, Tv } from 'lucide-react'
import { getCurrentFocusKey, setFocus } from '@noriginmedia/norigin-spatial-navigation'
import { Focusable } from '../components/Focusable'
import { LivePlayer } from '../components/LivePlayer'
import { groupsOf, lastWatched, loadEpg, loadLive, nowNext, useLive, type LiveChannel } from '../lib/live'
import { reveal } from '../lib/scroll'
import { useSettings } from '../lib/settings'

const PAGE = 60
const FAV = '★ Favorites'
const safe = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '_')
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

function Chip({ label, count, active, onEnter }: { label: string; count?: number; active: boolean; onEnter: () => void }) {
  return (
    <Focusable onEnter={onEnter} title={label} onFocus={(el) => reveal(el, { block: 'none', inline: 'center' })} className="shrink-0">
      <div className={`flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[0.95rem] font-semibold transition-colors group-hover/f:bg-white/20 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${active ? 'bg-accent text-black' : 'bg-white/10 text-white/80'}`}>
        {label}{count !== undefined && <span className="text-[0.75rem] opacity-60">{count}</span>}
      </div>
    </Focusable>
  )
}

function Row({ c, n, fav, onPlay, onFav, onFocus }: { c: LiveChannel; n: number; fav: boolean; onPlay: () => void; onFav: () => void; onFocus: (el: HTMLElement) => void }) {
  const { now, next } = nowNext(c)
  const pct = now ? Math.max(0, Math.min(100, ((Date.now() - now.s) / (now.e - now.s)) * 100)) : 0
  const [bad, setBad] = useState(false)
  return (
    <div className="flex items-stretch gap-2">
      <Focusable focusKey={`live-ch-${safe(c.id)}`} onEnter={onPlay} onLongPress={onFav} onFocus={onFocus} title={c.name} className="min-w-0 flex-1">
        <div className="flex items-center gap-4 rounded-2xl bg-white/[0.06] px-4 py-3 ring-1 ring-white/8 transition-all group-hover/f:bg-white/12 group-data-[hl=true]/f:scale-[1.01] group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">
          <span className="w-9 shrink-0 text-right text-sm font-bold tabular-nums opacity-50">{n}</span>
          <span className="grid h-12 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-black/30 p-1">
            {c.logo && !bad ? <img src={c.logo} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setBad(true)} className="max-h-full max-w-full object-contain" /> : <Tv size={22} className="opacity-40" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2"><span className="truncate text-[1.08rem] font-bold">{c.name}</span>
              {c.quality && <span className="shrink-0 rounded bg-white/15 px-1.5 py-0.5 text-[0.62rem] font-bold tracking-wider opacity-70 group-data-[hl=true]/f:bg-black/10">{c.quality.toUpperCase()}</span>}
              {c.notes?.map((t) => <span key={t} className="shrink-0 rounded bg-amber-400/20 px-1.5 py-0.5 text-[0.62rem] font-bold text-amber-200 group-data-[hl=true]/f:bg-amber-600/20 group-data-[hl=true]/f:text-amber-900">{t}</span>)}
            </span>
            {now
              ? <span className="mt-0.5 block"><span className="block truncate text-sm opacity-80">{now.t} <span className="opacity-60">· until {clock(now.e)}</span></span>
                  <span className="mt-1 block h-[3px] max-w-xs overflow-hidden rounded-full bg-white/20 group-data-[hl=true]/f:bg-black/15"><span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} /></span>
                  {next && <span className="mt-1 block truncate text-xs opacity-55">Next · {clock(next.s)} · {next.t}</span>}</span>
              : <span className="mt-0.5 block truncate text-sm opacity-55">{c.groups.join(' · ')}</span>}
          </span>
          {fav && <Star size={18} className="shrink-0 fill-accent text-accent group-data-[hl=true]/f:fill-black group-data-[hl=true]/f:text-black" />}
        </div>
      </Focusable>
      <Focusable focusKey={`live-fav-${safe(c.id)}`} onEnter={onFav} onFocus={onFocus} title={fav ? 'Remove from favorites' : 'Add to favorites'}>
        <div className="grid h-full w-14 place-items-center rounded-2xl bg-white/[0.06] ring-1 ring-white/8 transition-colors group-hover/f:bg-white/15 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><Star size={20} className={fav ? 'fill-current' : 'opacity-60'} /></div>
      </Focusable>
    </div>
  )
}

/** Live TV: the channels of the playlist added in Settings, by group, with search and favorites, and what's on now when there is a guide. */
export function LiveTV() {
  const { settings, update } = useSettings()
  const live = useLive()
  const [group, setGroup] = useState('')
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [watching, setWatching] = useState<{ list: LiveChannel[]; idx: number }>()
  const input = useRef<HTMLInputElement>(null)
  const landed = useRef(false)

  useEffect(() => { void loadLive(settings.liveUrl).then(() => loadEpg(settings.liveEpgUrl)) }, [settings.liveUrl, settings.liveEpgUrl])
  useEffect(() => { const t = setInterval(() => { void loadEpg(settings.liveEpgUrl) }, 10 * 60_000); return () => clearInterval(t) }, [settings.liveEpgUrl])

  const favs = useMemo(() => new Set(settings.liveFavs), [settings.liveFavs])
  const groups = useMemo(() => groupsOf(live.channels), [live.channels])
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return live.channels.filter((c) => (!group ? true : group === FAV ? favs.has(c.id) : c.groups.includes(group)) && (!needle || c.name.toLowerCase().includes(needle) || c.groups.some((g) => g.toLowerCase().includes(needle))))
  }, [live.channels, group, q, favs])
  useEffect(() => { setLimit(PAGE) }, [group, q])

  // The cursor starts on the channel you watched last (or the first one).
  useEffect(() => {
    if (landed.current || !list.length) return
    landed.current = true
    const last = lastWatched(), at = last ? list.findIndex((c) => c.id === last) : -1
    if (at >= limit) setLimit(at + 20)
    // (Arriving from a tab or the side menu, the cursor stays there until you move down.)
    const from = getCurrentFocusKey() ?? ''
    if (from.startsWith('mtab-') || from.startsWith('nav-') || from === 'TOPBAR' || from === 'SIDEBAR') return
    setTimeout(() => setFocus(`live-ch-${safe(list[Math.max(0, at)].id)}`), 150)
  }, [list]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFav = (c: LiveChannel) => update({ liveFavs: favs.has(c.id) ? settings.liveFavs.filter((x) => x !== c.id) : [...settings.liveFavs, c.id] })
  const open = (i: number) => setWatching({ list, idx: i })
  const back = (i: number) => {
    const at = watching?.list[i]
    setWatching(undefined)
    if (at) setTimeout(() => setFocus(`live-ch-${safe(at.id)}`), 200)
  }

  const subtitle = live.status === 'ready' ? `${list.length === live.channels.length ? live.channels.length : `${list.length} of ${live.channels.length}`} channels${live.epgStatus === 'loading' ? ' · loading the guide…' : live.epgStatus === 'error' ? ' · the guide could not be loaded' : ''}` : ' '
  return (
    <div className="px-[var(--gutter)] pb-24 pt-10">
      <div className="mb-6 flex items-end justify-between gap-6">
        <div><h1 className="font-display text-[clamp(2.2rem,4.4vw,3.6rem)] uppercase leading-none tracking-[0.1em]">Live TV</h1><div className="mt-3 h-[3px] w-20 rounded-full bg-accent" /><p className="mt-3 text-white/60">{subtitle}</p></div>
        <p className="hidden max-w-[16rem] text-right text-sm text-white/40 md:block">Hold OK on a channel to add it to your favorites</p>
      </div>

      {live.status === 'loading' && !live.channels.length && <div className="flex items-center gap-3 py-16 text-white/60"><Loader2 className="animate-spin" size={22} />Loading your channels…</div>}
      {live.status === 'error' && !live.channels.length && (
        <div className="max-w-xl py-12">
          <div className="flex items-center gap-3 text-amber-200"><TriangleAlert size={24} /><span className="text-lg font-bold">The playlist couldn’t be loaded</span></div>
          <p className="mt-2 text-white/65">{live.error}</p><p className="mt-1 text-sm text-white/45">Check the address in Settings → Live TV.</p>
          <div className="mt-5"><Focusable focusKey="live-retry" onEnter={() => { void loadLive(settings.liveUrl, true) }} title="Try again"><div className="inline-block rounded-full bg-white/12 px-6 py-2.5 font-semibold transition-colors group-hover/f:bg-white/25 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">Try again</div></Focusable></div>
        </div>
      )}

      {live.channels.length > 0 && (
        <>
          <Focusable focusKey="live-search" onEnter={() => input.current?.focus()} title="Search channels">
            <div className="relative mb-5 max-w-2xl">
              <SearchIcon size={22} className="absolute left-0 top-1/2 -translate-y-1/2 text-white/50" />
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search channels" enterKeyHint="search" spellCheck={false}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') e.currentTarget.blur()
                  else if (e.key === 'Enter' || e.key === 'Escape') { e.currentTarget.blur(); setFocus('live-search') }
                  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') e.stopPropagation()
                }}
                className="w-full border-b-2 border-white/15 bg-transparent py-3 pl-9 text-xl font-bold tracking-tight outline-none transition-colors placeholder:text-white/25 focus:border-accent group-data-[hl=true]/f:border-accent" />
            </div>
          </Focusable>
          <div className="m-hide-scroll -mx-1 mb-6 flex gap-2 overflow-x-auto px-1 py-1">
            <Chip label="All" count={live.channels.length} active={!group} onEnter={() => setGroup('')} />
            {settings.liveFavs.length > 0 && <Chip label={FAV} count={settings.liveFavs.filter((id) => live.channels.some((c) => c.id === id)).length} active={group === FAV} onEnter={() => setGroup(group === FAV ? '' : FAV)} />}
            {groups.map((g) => <Chip key={g.name} label={g.name} count={g.count} active={group === g.name} onEnter={() => setGroup(group === g.name ? '' : g.name)} />)}
          </div>
          <div className="space-y-2">
            {list.slice(0, limit).map((c, i) => <Row key={c.id} c={c} n={i + 1} fav={favs.has(c.id)} onPlay={() => open(i)} onFav={() => toggleFav(c)} onFocus={(el) => { reveal(el); if (i >= limit - 12) setLimit((l) => l + PAGE) }} />)}
          </div>
          {list.length === 0 && <p className="py-12 text-white/55">{group === FAV ? 'No favorites yet. Hold OK on a channel to add one.' : `No channels match “${q}”.`}</p>}
        </>
      )}
      {watching && <LivePlayer channels={watching.list} start={watching.idx} onClose={(i) => { if (i >= limit) setLimit(i + 20); back(i) }} />}
    </div>
  )
}
