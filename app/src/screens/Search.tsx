import { useEffect, useRef, useState } from 'react'
import { Search as SearchIcon } from 'lucide-react'
import { PosterCard } from '../components/Card'
import { search, type PlexMedia, type PlexServer } from '../lib/plex'

export function Search({ server, onOpen }: { server: PlexServer; onOpen: (m: PlexMedia) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<PlexMedia[]>()
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { input.current?.focus() }, [])
  useEffect(() => {
    if (q.trim().length < 2) return setResults(undefined)
    const t = setTimeout(() => search(server, q.trim()).then(setResults).catch(() => setResults([])), 220)
    return () => clearTimeout(t)
  }, [q, server])

  return (
    <div className="px-[var(--gutter)] pb-24 pt-14">
      <div className="relative mb-10 max-w-3xl">
        <SearchIcon size={28} className="absolute left-0 top-1/2 -translate-y-1/2 text-white/50" />
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search movies and shows"
          className="w-full border-b-2 border-white/15 bg-transparent py-4 pl-12 text-[2rem] font-bold tracking-tight outline-none transition-colors placeholder:text-white/25 focus:border-accent" />
      </div>
      {results === undefined && <p className="text-white/45">Start typing to search your libraries.</p>}
      {results && results.length === 0 && <p className="text-white/55">Nothing matches “{q}”. Check the spelling or try a shorter title.</p>}
      {results && results.length > 0 && (
        <div className="fade-in grid gap-x-4 gap-y-8 [grid-template-columns:repeat(auto-fill,minmax(var(--card-w),1fr))]">
          {results.map((m) => <div key={m.ratingKey} className="[--card-w:100%]"><PosterCard m={m} server={server} onEnter={() => onOpen(m)} onFocus={(el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' })} /></div>)}
        </div>
      )}
    </div>
  )
}
