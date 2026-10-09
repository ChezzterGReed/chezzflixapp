import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Check, Download, Eye, Film, Home, Info, Loader2, Palette, Play, Plus, RotateCcw, Trash2, Type, X } from 'lucide-react'
import { Layer } from './Layer'
import { Focusable } from './Focusable'
import { Avatar } from './Avatar'
import { ACCENTS, brandName, cleanBrand, currentSeason, useSettings, type HomeRowCfg, type HomeTab } from '../lib/settings'
import { getCollections, getGenres, getPlaylists, type PlexSection, type PlexServer } from '../lib/plex'
import { listPlexHubs, mergeRows, rowCatalog } from '../lib/homeData'
import { inTauri } from '../lib/player'
import { trendingIds } from '../lib/tmdb'
import { Pumpkin } from './Pumpkin'
import { checkForUpdate, installUpdate, useUpdater } from '../lib/updater'

const ring = 'group-data-[hl=true]/f:ring-2 group-data-[hl=true]/f:ring-white'

function Row({ label, hint, children, onEnter }: { label: string; hint?: string; children: ReactNode; onEnter?: () => void }) {
  const inner = (
    <div className={`flex items-center gap-4 rounded-xl px-4 py-3.5 transition-colors ${onEnter ? `group-hover/f:bg-white/8 group-data-[hl=true]/f:bg-white/15 ${ring}` : ''}`}>
      <div className="min-w-0 flex-1"><div className="font-semibold">{label}</div>{hint && <div className="text-sm text-white/55">{hint}</div>}</div>
      {children}
    </div>
  )
  return onEnter ? <Focusable onEnter={onEnter}>{inner}</Focusable> : inner
}

function Switch({ on }: { on: boolean }) {
  return <div className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-white/20'}`}><i className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${on ? 'left-6' : 'left-1'}`} /></div>
}
function Toggle({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return <Row label={label} hint={hint} onEnter={() => onChange(!on)}><Switch on={on} /></Row>
}

function Pill({ active, onEnter, children, title }: { active?: boolean; onEnter: () => void; children: ReactNode; title?: string }) {
  return (
    <Focusable onEnter={onEnter} title={title}>
      <div className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors group-hover/f:bg-white/20 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${active ? 'bg-accent text-black' : 'bg-white/8 text-white/65'}`}>{children}</div>
    </Focusable>
  )
}

function IconBtn({ onEnter, label, children, disabled }: { onEnter: () => void; label: string; children: ReactNode; disabled?: boolean }) {
  return (
    <Focusable onEnter={disabled ? undefined : onEnter} title={label}>
      <div className={`grid size-9 place-items-center rounded-lg transition-colors group-hover/f:bg-white/15 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${disabled ? 'opacity-25' : 'text-white/70'}`}>{children}</div>
    </Focusable>
  )
}

/** Text input that still works with a D-pad: Enter on the field starts typing, Enter/Esc finishes. */
function TextField({ value, onChange, placeholder, suffix }: { value: string; onChange: (v: string) => void; placeholder: string; suffix?: string }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <Focusable onEnter={() => input.current?.focus()}>
      <div className={`flex items-center rounded-xl bg-white/8 px-4 py-3 transition-colors focus-within:bg-white/12 group-hover/f:bg-white/12 group-data-[hl=true]/f:bg-white/15 ${ring}`}>
        <span className="relative inline-block min-w-[3ch] text-xl font-extrabold tracking-[0.12em]">
          <span aria-hidden className="invisible whitespace-pre">{value || placeholder}</span>
          <input ref={input} value={value} maxLength={12} placeholder={placeholder} spellCheck={false} autoCapitalize="characters"
            onChange={(e) => onChange(cleanBrand(e.target.value))}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.stopPropagation(); e.currentTarget.blur() } else if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') e.stopPropagation() }}
            className="absolute inset-0 w-full bg-transparent outline-none placeholder:text-white/25" />
        </span>
        {suffix && <span className="text-xl font-extrabold tracking-[0.12em] text-white/40">{suffix}</span>}
      </div>
    </Focusable>
  )
}

const Heading = ({ children }: { children: ReactNode }) => <div className="mb-1 mt-5 px-4 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-white/40 first:mt-0">{children}</div>

// ---------------- panels ----------------
function Appearance({ profileName, profileThumb }: { profileName: string; profileThumb?: string }) {
  const { settings, update } = useSettings()
  return (
    <>
      <Heading>Service name — only for {profileName}</Heading>
      <div className="px-4 py-2">
        <TextField value={settings.brand} onChange={(v) => update({ brand: v })} placeholder="CHEZZ" suffix="FLIX" />
        <p className="mt-2 text-sm text-white/55">Your profile will see the app as <b className="tracking-widest text-white">{brandName(settings)}</b>.</p>
      </div>
      <Toggle label="Use my profile picture as the logo" hint="Shown at the top of the menu instead of the letter tile" on={settings.avatarLogo} onChange={(v) => update({ avatarLogo: v })} />
      <div className="flex items-center gap-3 px-4 pb-2 text-sm text-white/55"><Avatar name={profileName} thumb={profileThumb} size={28} />Preview of the logo style on the menu</div>
      <Toggle label="Seasonal themes" hint={currentSeason() === 'halloween' ? 'It\'s spooky season: a little fog, embers and a Spooky Season row. Turn off for the plain look.' : 'Subtle touches for holidays and seasons, when one is on'} on={settings.seasonal} onChange={(v) => update({ seasonal: v })} />
      <Heading>Accent colour</Heading>
      {settings.seasonal && currentSeason() === 'halloween' && (
        <div className="mx-4 mb-2 flex items-center gap-2.5 rounded-xl bg-accent/12 px-3.5 py-2.5 text-sm text-white/80"><Pumpkin size={22} />Spooky season is using pumpkin orange. Turn off Seasonal themes above to use your own colour.</div>
      )}
      <div className="flex flex-wrap gap-3 px-4 py-3">
        {ACCENTS.map((a) => (
          <Focusable key={a.value} onEnter={() => update({ accent: a.value })} title={a.name}>
            <div className="grid size-10 place-items-center rounded-full text-black transition-transform group-hover/f:scale-110 group-data-[hl=true]/f:scale-125 group-data-[hl=true]/f:ring-2 group-data-[hl=true]/f:ring-white group-data-[hl=true]/f:ring-offset-2 group-data-[hl=true]/f:ring-offset-surface" style={{ background: a.value }}>
              {settings.accent === a.value && <Check size={20} strokeWidth={3} />}
            </div>
          </Focusable>
        ))}
      </div>
    </>
  )
}

function Playback() {
  const { settings, update } = useSettings()
  return (
    <>
      <Heading>Player</Heading>
      <div className="flex gap-2 px-4 py-2">
        <Pill active={settings.player === 'app'} onEnter={() => update({ player: 'app' })}>Built-in player</Pill>
        {inTauri && <Pill active={settings.player === 'mpv'} onEnter={() => update({ player: 'mpv' })}>mpv (separate window)</Pill>}
      </div>
      <p className="px-4 pb-2 text-sm text-white/55">{inTauri ? 'In the desktop app, the built-in mpv engine plays your original files inside the window — MKV, DTS, TrueHD and image subtitles included — with no transcoding.' : 'In a browser, the player direct-plays what it can and falls back to Direct Stream or Transcoding, and says which in the corner.'} {inTauri ? 'The external option opens mpv in its own window instead.' : ''}</p>
      <Heading>Episodes</Heading>
      <Toggle label="Autoplay next episode" hint="Continue to the next episode after a short countdown" on={settings.autoplayNext} onChange={(v) => update({ autoplayNext: v })} />
      <Toggle label="Skip intros automatically" hint="Jump past the intro whenever Plex has marked one" on={settings.autoSkipIntro} onChange={(v) => update({ autoSkipIntro: v })} />
    </>
  )
}

function Libraries({ sections }: { sections: PlexSection[] }) {
  const { settings, update } = useSettings()
  const hidden = new Set(settings.hiddenLibraries)
  const toggle = (k: string) => update({ hiddenLibraries: hidden.has(k) ? settings.hiddenLibraries.filter((x) => x !== k) : [...settings.hiddenLibraries, k] })
  return (
    <>
      <p className="px-4 pb-3 text-sm text-white/55">Choose which libraries show up in the menu and on Home. Hidden libraries stay on your server and can be turned back on any time.</p>
      {sections.map((s) => <Toggle key={s.key} label={s.title} hint={s.type === 'movie' ? 'Movies' : 'TV shows'} on={!hidden.has(s.key)} onChange={() => toggle(s.key)} />)}
    </>
  )
}

const TAB_LABEL: Record<HomeTab, string> = { all: 'Home', trending: 'Trending', movie: 'Movies', show: 'Shows', anime: 'Anime' }

function HomeEditor({ server, sections }: { server: PlexServer; sections: PlexSection[] }) {
  const { settings, update } = useSettings()
  const [tab, setTab] = useState<HomeTab>('all')
  const [plexHubs, setPlexHubs] = useState<HomeRowCfg[]>([])
  const [genres, setGenres] = useState<string[]>([])
  const [playlists, setPlaylists] = useState<{ id: string; title: string }[]>([])
  const [collections, setCollections] = useState<{ id: string; title: string }[]>([])
  const [adding, setAdding] = useState<'genre' | 'playlist' | 'collection' | null>(null)

  useEffect(() => {
    listPlexHubs(server).then(setPlexHubs)
    Promise.all(sections.map((s) => getGenres(server, s.key))).then((g) => setGenres([...new Set(g.flat().map((x) => x.title))].sort()))
    getPlaylists(server).then((p) => setPlaylists(p.map((x) => ({ id: x.ratingKey, title: x.title }))))
    Promise.all(sections.map((s) => getCollections(server, s.key))).then((c) => setCollections(c.flat().map((x) => ({ id: x.ratingKey, title: x.title }))))
  }, [server, sections])

  const saved = settings.homeRows[tab]
  const rows = mergeRows(saved, rowCatalog(tab, plexHubs, settings.genres))
  const save = (next: HomeRowCfg[]) => update({ homeRows: { ...settings.homeRows, [tab]: next } })
  const reset = () => { const { [tab]: _drop, ...rest } = settings.homeRows; void _drop; update({ homeRows: rest }) }
  const move = (i: number, d: -1 | 1) => { const n = [...rows]; [n[i], n[i + d]] = [n[i + d], n[i]]; save(n) }
  const add = (kind: HomeRowCfg['kind'], ref: string, title: string) => {
    const id = `${kind}:${ref}`
    save(rows.some((r) => r.id === id) ? rows.map((r) => (r.id === id ? { ...r, enabled: true } : r)) : [...rows, { id, kind, ref, title, enabled: true }])
    setAdding(null)
  }
  const choices = adding === 'genre' ? genres.map((g) => ({ ref: g, title: g })) : adding === 'playlist' ? playlists.map((p) => ({ ref: p.id, title: p.title })) : adding === 'collection' ? collections.map((c) => ({ ref: c.id, title: c.title })) : []
  const kindLabel = (r: HomeRowCfg) => (r.kind === 'builtin' ? undefined : r.kind === 'hub' ? 'From Plex' : r.kind[0].toUpperCase() + r.kind.slice(1))

  return (
    <>
      <p className="px-4 pb-3 text-sm text-white/55">Each tab has its own layout. Turn rows on or off, reorder them, and add your own from genres, playlists and collections.</p>
      <div className="flex flex-wrap gap-2 px-4 pb-3">
        {(Object.keys(TAB_LABEL) as HomeTab[]).map((t) => <Pill key={t} active={tab === t} onEnter={() => setTab(t)}>{TAB_LABEL[t]}</Pill>)}
      </div>
      <div className="space-y-0.5">
        {rows.map((r, i) => (
          <div key={r.id} className="flex items-center gap-1 rounded-xl pr-2 transition-colors hover:bg-white/5">
            <div className="min-w-0 flex-1"><Row label={r.title} hint={kindLabel(r)} onEnter={() => save(rows.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)))}><Switch on={r.enabled} /></Row></div>
            <IconBtn label="Move up" disabled={i === 0} onEnter={() => move(i, -1)}><ArrowUp size={18} /></IconBtn>
            <IconBtn label="Move down" disabled={i === rows.length - 1} onEnter={() => move(i, 1)}><ArrowDown size={18} /></IconBtn>
            {['genre', 'playlist', 'collection'].includes(r.kind) && !defaultIds(tab, settings.genres).has(r.id) && <IconBtn label="Remove" onEnter={() => save(rows.filter((x) => x.id !== r.id))}><Trash2 size={18} /></IconBtn>}
          </div>
        ))}
      </div>

      <Heading>Add a row</Heading>
      <div className="flex flex-wrap gap-2 px-4 py-2">
        <Pill active={adding === 'genre'} onEnter={() => setAdding(adding === 'genre' ? null : 'genre')}><Plus size={15} />Genre</Pill>
        <Pill active={adding === 'playlist'} onEnter={() => setAdding(adding === 'playlist' ? null : 'playlist')}><Plus size={15} />Playlist</Pill>
        <Pill active={adding === 'collection'} onEnter={() => setAdding(adding === 'collection' ? null : 'collection')}><Plus size={15} />Collection</Pill>
        {saved && <Pill onEnter={reset}><RotateCcw size={15} />Reset {TAB_LABEL[tab]} to default</Pill>}
      </div>
      {adding && (
        <div className="fade-in flex flex-wrap gap-2 rounded-2xl bg-white/5 p-4">
          {choices.length === 0 ? <span className="text-sm text-white/50">Nothing found on your server for this.</span>
            : choices.map((c) => <Pill key={c.ref} onEnter={() => add(adding, c.ref, c.title)}>{c.title}</Pill>)}
        </div>
      )}
    </>
  )
}
const defaultIds = (tab: HomeTab, genres: string[]) => new Set(rowCatalog(tab, [], genres).map((r) => r.id))

/** TMDB key entry for the Trending tab, with a quick check and the attribution TMDB's terms require. */
function TmdbKey() {
  const { settings, update } = useSettings()
  const [status, setStatus] = useState<'idle' | 'checking' | 'ok' | 'bad'>('idle')
  const input = useRef<HTMLInputElement>(null)
  const check = async () => {
    if (!settings.tmdbKey) return setStatus('idle')
    setStatus('checking')
    try { await trendingIds(settings.tmdbKey, 'movie'); setStatus('ok') } catch { setStatus('bad') }
  }
  return (
    <div className="px-4 py-2">
      <Focusable onEnter={() => input.current?.focus()}>
        <div className={`flex items-center gap-3 rounded-xl bg-white/8 px-4 py-3 transition-colors focus-within:bg-white/12 group-hover/f:bg-white/12 group-data-[hl=true]/f:bg-white/15 ${ring}`}>
          <input ref={input} value={settings.tmdbKey} placeholder="Paste your TMDB API key" spellCheck={false} autoCapitalize="off" autoCorrect="off"
            onChange={(e) => { update({ tmdbKey: e.target.value.trim() }); setStatus('idle') }}
            onBlur={check}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.stopPropagation(); e.currentTarget.blur() } else if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') e.stopPropagation() }}
            className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-white/30" />
          <span className={`shrink-0 text-xs font-bold ${status === 'ok' ? 'text-emerald-300' : status === 'bad' ? 'text-red-300' : 'text-white/40'}`}>
            {status === 'checking' ? 'Checking…' : status === 'ok' ? 'Connected' : status === 'bad' ? 'Key not accepted' : settings.tmdbKey ? '' : 'Not set'}
          </span>
        </div>
      </Focusable>
      <p className="mt-2 text-sm text-white/55">The Trending tab uses TMDB's weekly trending lists, then shows only titles that are in your library. Get a free key at themoviedb.org → Settings → API.</p>
      <p className="mt-2 text-xs text-white/40">This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
    </div>
  )
}

function Content() {
  const { settings, update } = useSettings()
  return (
    <>
      <Toggle label="Hide spoilers" hint="Blur thumbnails and descriptions of episodes you haven't watched. You can reveal one at a time." on={settings.hideSpoilers} onChange={(v) => update({ hideSpoilers: v })} />
      <Toggle label="Hide watched titles" hint="Keep finished movies and shows out of discovery rows" on={settings.hideWatched} onChange={(v) => update({ hideWatched: v })} />
      <Heading>Trending</Heading>
      <TmdbKey />
      <Heading>Home</Heading>
      <Toggle label="Rotate featured titles" hint="Cycle through the hero banner automatically" on={settings.heroRotate} onChange={(v) => update({ heroRotate: v })} />
    </>
  )
}

function About() {
  const u = useUpdater()
  useEffect(() => { checkForUpdate() }, [])
  const busy = u.status === 'checking' || u.status === 'downloading' || u.status === 'installing'
  const line = {
    idle: '', checking: 'Checking for updates…', uptodate: "You're up to date.", available: `Version ${u.version} is available.`,
    downloading: `Downloading ${u.version}… ${Math.round(u.progress * 100)}%`, installing: 'Installing and restarting…', error: `Couldn't check for updates. ${u.error ?? ''}`,
  }[u.status]
  return (
    <>
      <Row label="Chezzflix" hint={u.current ? `Version ${u.current}` : inTauri ? '' : 'Running in a browser'}><span /></Row>
      <Row label="Updates" hint={line}>
        {u.status === 'available'
          ? <Focusable onEnter={installUpdate} title="Update now"><div className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-black transition-transform group-hover/f:scale-105 group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:ring-2 group-data-[hl=true]/f:ring-white"><Download size={16} />Update now</div></Focusable>
          : <Focusable onEnter={() => !busy && checkForUpdate()} title="Check for updates"><div className="flex items-center gap-2 rounded-full bg-white/12 px-5 py-2.5 text-sm font-semibold transition-colors group-hover/f:bg-white/25 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">{busy && <Loader2 size={16} className="animate-spin" />}Check now</div></Focusable>}
      </Row>
      <p className="px-4 pt-2 text-sm text-white/45">Chezzflix checks for updates when it opens and installs them only when you say so.</p>
    </>
  )
}

const PANELS = [
  { id: 'appearance', label: 'Appearance', icon: Palette }, { id: 'playback', label: 'Playback', icon: Play },
  { id: 'libraries', label: 'Libraries', icon: Film }, { id: 'home', label: 'Home', icon: Home }, { id: 'content', label: 'Content', icon: Eye },
  { id: 'about', label: 'About', icon: Info },
] as const

interface Props { server: PlexServer; sections: PlexSection[]; profileName: string; profileThumb?: string; onClose: () => void }

export function SettingsModal({ server, sections, profileName, profileThumb, onClose }: Props) {
  const [panel, setPanel] = useState<(typeof PANELS)[number]['id']>('appearance')
  return (
    <Layer onClose={onClose} className="absolute left-1/2 top-1/2 h-[min(680px,90vh)] w-[min(980px,95vw)] -translate-x-1/2 -translate-y-1/2">
      <div className="pop flex h-full overflow-hidden rounded-3xl bg-surface shadow-2xl ring-1 ring-white/10">
        <aside className="flex w-60 shrink-0 flex-col border-r border-white/8 bg-black/20 p-4 max-sm:w-16">
          <div className="mb-5 flex items-center gap-3 px-2 pt-1"><Avatar name={profileName} thumb={profileThumb} size={40} /><div className="min-w-0 max-sm:hidden"><div className="truncate font-bold">{profileName}</div><div className="text-xs text-white/45">Settings</div></div></div>
          <div className="space-y-1">
            {PANELS.map((p) => (
              <Focusable key={p.id} focusKey={`set-${p.id}`} onEnter={() => setPanel(p.id)} title={p.label}>
                <div className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-[0.95rem] font-semibold transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${panel === p.id ? 'bg-accent/20 text-accent' : 'text-white/60'}`}><p.icon size={20} /><span className="max-sm:hidden">{p.label}</span></div>
              </Focusable>
            ))}
          </div>
          <div className="mt-auto max-sm:hidden"><Focusable onEnter={onClose} title="Close"><div className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-[0.95rem] font-semibold text-white/60 transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><X size={20} />Close</div></Focusable></div>
        </aside>
        <section className="min-w-0 flex-1 overflow-y-auto p-6">
          <h2 className="mb-5 flex items-center gap-2.5 px-4 text-2xl font-extrabold tracking-tight"><Type className="hidden" />{PANELS.find((p) => p.id === panel)!.label}</h2>
          {panel === 'appearance' && <Appearance profileName={profileName} profileThumb={profileThumb} />}
          {panel === 'playback' && <Playback />}
          {panel === 'libraries' && <Libraries sections={sections} />}
          {panel === 'home' && <HomeEditor server={server} sections={sections} />}
          {panel === 'content' && <Content />}
          {panel === 'about' && <About />}
          <div className="mt-6 rounded-xl bg-white/5 px-4 py-3 text-sm text-white/55">Connected to <b className="text-white">{server.name}</b>. These settings belong to <b className="text-white">{profileName}</b>.</div>
        </section>
      </div>
    </Layer>
  )
}
