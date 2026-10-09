import { useEffect, useRef, useState } from 'react'
import { Search as SearchIcon } from 'lucide-react'
import { PosterCard } from '../components/Card'
import { RequestCard } from '../components/RequestCard'
import { RequestDetail } from '../components/RequestDetail'
import { search, type PlexMedia, type PlexSection, type PlexServer } from '../lib/plex'
import { guidIndex, searchTmdb } from '../lib/tmdb'
import { normalizeBase, type RequestItem } from '../lib/overseerr'
import { useSettings } from '../lib/settings'

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
/** How close a title is to what was typed: exact, starts with, contains, or just related. */
function closeness(title: string, q: string): number {
  const t = norm(title), n = norm(q)
  if (t === n) return 4
  if (t.startsWith(n)) return 3
  if (t.split(' ').some((w) => w.startsWith(n))) return 2.5
  return t.includes(n) ? 2 : 1
}

export function Search({ server, token, sections, onOpen }: { server: PlexServer; token: string; sections: PlexSection[]; onOpen: (m: PlexMedia) => void }) {
  const { settings } = useSettings()
  const canRequest = settings.requests && !!settings.tmdbKey && !!settings.overseerrUrl
  const [q, setQ] = useState('')
  const [local, setLocal] = useState<PlexMedia[]>()
  const [remote, setRemote] = useState<RequestItem[]>([])
  const [requesting, setRequesting] = useState<RequestItem>()
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { input.current?.focus() }, [])
  useEffect(() => {
    if (q.trim().length < 2) { setLocal(undefined); setRemote([]); return }
    const t = setTimeout(() => {
      const term = q.trim()
      search(server, term).then(setLocal).catch(() => setLocal([]))
      if (canRequest) {
        // Titles TMDB knows about, minus anything already in the library.
        Promise.all([searchTmdb(settings.tmdbKey, term), guidIndex(server, sections)])
          .then(([hits, idx]) => setRemote(hits.filter((h) => !idx.has(`${h.type}:${h.tmdbId}`))))
          .catch(() => setRemote([]))
      } else setRemote([])
    }, 260)
    return () => clearTimeout(t)
  }, [q, server, sections, canRequest, settings.tmdbKey])

  const term = q.trim()
  // Two lists: what you can watch right now, then what you could request. Each is ordered by how close the title is to what was typed.
  const rank = <T,>(list: T[], title: (x: T) => string) => list.map((x, i) => ({ x, i, c: closeness(title(x), term) })).sort((p, r) => r.c - p.c || p.i - r.i).map((e) => e.x)
  const available = rank(local ?? [], (m) => m.title)
  const requestable = rank(remote, (r) => r.title)
  const scroll = (el: HTMLElement) => el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  const grid = 'fade-in grid gap-x-4 gap-y-8 [grid-template-columns:repeat(auto-fill,minmax(var(--card-w),1fr))]'

  return (
    <div className="px-[var(--gutter)] pb-24 pt-14">
      <div className="relative mb-10 max-w-3xl">
        <SearchIcon size={28} className="absolute left-0 top-1/2 -translate-y-1/2 text-white/50" />
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={canRequest ? 'Search movies and shows' : 'Search movies and shows'}
          className="w-full border-b-2 border-white/15 bg-transparent py-4 pl-12 text-[2rem] font-bold tracking-tight outline-none transition-colors placeholder:text-white/25 focus:border-accent" />
      </div>
      {local === undefined && <p className="text-white/45">{canRequest ? 'Start typing to search your library and find titles to request.' : 'Start typing to search your libraries.'}</p>}
      {local && available.length === 0 && requestable.length === 0 && <p className="text-white/55">Nothing matches “{q}”. Check the spelling or try a shorter title.</p>}
      {available.length > 0 && (
        <section>
          <h2 className="mb-5 text-[1.3rem] font-bold tracking-tight">Available to watch</h2>
          <div className={grid}>
            {available.map((m) => <div key={m.ratingKey} className="[--card-w:100%]"><PosterCard m={m} server={server} onEnter={() => onOpen(m)} onFocus={scroll} /></div>)}
          </div>
        </section>
      )}
      {requestable.length > 0 && (
        <section className={available.length > 0 ? 'mt-14' : ''}>
          <h2 className="text-[1.3rem] font-bold tracking-tight">Request something</h2>
          <p className="mb-5 mt-1 text-sm text-white/50">{available.length === 0 && local ? `Nothing in your library matches “${q}”, but you can request it.` : 'Not in your library yet. Request it and it will be added.'}</p>
          <div className={grid}>
            {requestable.map((r) => <div key={`${r.type}:${r.tmdbId}`} className="[--card-w:100%]"><RequestCard item={r} onEnter={() => setRequesting(r)} onFocus={scroll} /></div>)}
          </div>
        </section>
      )}
      {requesting && <RequestDetail item={requesting} base={normalizeBase(settings.overseerrUrl)} plexToken={token} tmdbKey={settings.tmdbKey} onClose={() => setRequesting(undefined)} />}
    </div>
  )
}
