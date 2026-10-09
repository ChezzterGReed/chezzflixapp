import { useEffect, useState } from 'react'
import { Activity, Cpu, ExternalLink, Gauge, MemoryStick, Pause, Play, Radio, Wifi } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { Focusable } from '../components/Focusable'
import { getHistory, getServerInfo, getSessions, imageUrl, type PlexHistoryEntry, type PlexMedia, type PlexServer, type PlexSession, type ServerInfo, type StreamKind } from '../lib/plex'
import { inTauri } from '../lib/player'

const KIND: Record<StreamKind, { label: string; cls: string }> = {
  direct: { label: 'Direct Play', cls: 'bg-emerald-400/15 text-emerald-300 ring-emerald-300/30' },
  stream: { label: 'Direct Stream', cls: 'bg-sky-400/15 text-sky-300 ring-sky-300/30' },
  transcode: { label: 'Transcoding', cls: 'bg-amber-400/15 text-amber-300 ring-amber-300/30' },
}

const ago = (t: number) => {
  const s = Math.max(0, Date.now() / 1000 - t)
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  const d = Math.round(s / 86400)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white/6 p-5 ring-1 ring-white/10">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/55"><span className="text-accent">{icon}</span>{label}</div>
      <div className="text-[2rem] font-extrabold leading-none tracking-tight">{value}</div>
      {hint && <div className="mt-2 text-sm text-white/45">{hint}</div>}
    </div>
  )
}

/** The server owner's view of what's happening: who is streaming what, how, and recent activity. */
export function Dashboard({ server, onOpen }: { server: PlexServer; onOpen: (m: PlexMedia) => void }) {
  const [sessions, setSessions] = useState<PlexSession[]>()
  const [history, setHistory] = useState<PlexHistoryEntry[]>()
  const [info, setInfo] = useState<ServerInfo>({})
  const [error, setError] = useState<string>()

  useEffect(() => {
    let alive = true
    const live = () => {
      getSessions(server).then((s) => { if (alive) { setSessions(s); setError(undefined) } }).catch((e) => alive && setError(String(e)))
      getServerInfo(server).then((i) => alive && setInfo(i)).catch(() => {})
    }
    live()
    getHistory(server, 30).then((h) => alive && setHistory(h)).catch(() => alive && setHistory([]))
    const t = setInterval(live, 5000)
    const h = setInterval(() => getHistory(server, 30).then((x) => alive && setHistory(x)).catch(() => {}), 60_000)
    return () => { alive = false; clearInterval(t); clearInterval(h) }
  }, [server])

  const list = sessions ?? []
  const total = list.reduce((n, s) => n + s.bandwidth, 0)
  const counts = { direct: list.filter((s) => s.kind === 'direct').length, stream: list.filter((s) => s.kind === 'stream').length, transcode: list.filter((s) => s.kind === 'transcode').length }
  const openWeb = async () => {
    const url = 'https://app.plex.tv/desktop/'
    if (inTauri) { const { openUrl } = await import('@tauri-apps/plugin-opener'); await openUrl(url) } else window.open(url, '_blank')
  }

  return (
    <div className="px-[var(--gutter)] pb-24 pt-14">
      <div className="mb-8 flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-[2.2rem] font-extrabold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-white/55">{server.name}{info.version ? ` · Plex Media Server ${info.version}` : ''}{info.platform ? ` · ${info.platform}` : ''}</p>
        </div>
        <div className="flex-1" />
        <Focusable focusKey="dash-web" onEnter={openWeb} title="Open Plex Web">
          <div className="flex items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold transition-colors group-hover/f:bg-white/20 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><ExternalLink size={16} />Open Plex Web</div>
        </Focusable>
      </div>

      <div className="mb-10 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
        <Stat icon={<Radio size={18} />} label="Streams now" value={String(list.length)} hint={list.length ? `${list.filter((s) => s.device.state === 'playing').length} playing` : 'Nobody is watching'} />
        <Stat icon={<Gauge size={18} />} label="Bandwidth" value={`${(total / 1000).toFixed(1)} Mbps`} hint={list.some((s) => s.location !== 'lan') ? `${list.filter((s) => s.location !== 'lan').length} remote` : 'All on your network'} />
        <Stat icon={<Activity size={18} />} label="Playback type" value={`${counts.direct} / ${counts.stream} / ${counts.transcode}`} hint="Direct · Stream · Transcode" />
        {info.cpu != null && <Stat icon={<Cpu size={18} />} label="Server CPU" value={`${Math.round(info.cpu)}%`} />}
        {info.memory != null && <Stat icon={<MemoryStick size={18} />} label="Server memory" value={`${Math.round(info.memory)}%`} />}
      </div>

      <h2 className="mb-4 text-[1.3rem] font-bold tracking-tight">Now streaming</h2>
      {error && <p className="mb-6 text-red-300">Couldn't read the server's activity. {error}</p>}
      {sessions && sessions.length === 0 && !error && <p className="mb-10 rounded-2xl bg-white/5 p-6 text-white/55">Nothing is streaming right now. This refreshes by itself.</p>}
      {!sessions && !error && <div className="skeleton mb-10 h-40 rounded-2xl" />}
      {list.length > 0 && (
        <div className="mb-12 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,430px),1fr))]">
          {list.map((s) => (
            <Focusable key={s.id} onEnter={() => onOpen({ ratingKey: s.ratingKey, type: s.type, title: s.title })} title={`${s.user.name} — ${s.title}`}>
              <div className="flex gap-4 rounded-2xl bg-white/6 p-4 ring-1 ring-white/10 transition-all group-hover/f:bg-white/10 group-data-[hl=true]/f:scale-[1.02] group-data-[hl=true]/f:bg-white/12 group-data-[hl=true]/f:ring-2 group-data-[hl=true]/f:ring-accent">
                <img src={imageUrl(server, s.thumb, 200, 300)} alt="" draggable={false} className="h-36 w-24 shrink-0 rounded-lg bg-surface object-cover" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-2.5"><Avatar name={s.user.name} thumb={s.user.thumb} size={26} /><span className="truncate font-bold">{s.user.name}</span>
                    <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-white/55">{s.device.state === 'paused' ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}{s.device.state}</span></div>
                  <div className="mt-2 truncate text-[1.1rem] font-bold">{s.title}</div>
                  <div className="truncate text-sm text-white/60">{s.subtitle}</div>
                  <div className="mt-auto pt-3">
                    <div className="h-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-accent" style={{ width: `${s.progress * 100}%` }} /></div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.8rem] text-white/60">
                      <span className={`rounded-full px-2.5 py-0.5 font-bold ring-1 ${KIND[s.kind].cls}`}>{KIND[s.kind].label}</span>
                      <span>{s.detail}</span>
                      <span className="flex items-center gap-1"><Wifi size={12} />{s.location === 'lan' ? 'Home network' : 'Remote'}</span>
                    </div>
                    <div className="mt-1 truncate text-[0.8rem] text-white/40">{s.device.name}{s.device.product ? ` · ${s.device.product}` : ''}</div>
                  </div>
                </div>
              </div>
            </Focusable>
          ))}
        </div>
      )}

      <h2 className="mb-4 text-[1.3rem] font-bold tracking-tight">Recent activity</h2>
      {!history && <div className="skeleton h-48 rounded-2xl" />}
      {history && history.length === 0 && <p className="rounded-2xl bg-white/5 p-6 text-white/55">No watch history yet.</p>}
      {history && history.length > 0 && (
        <div className="divide-y divide-white/8 overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10">
          {history.map((h) => (
            <div key={h.key} className="flex items-center gap-4 px-5 py-3.5">
              <Avatar name={h.user} thumb={h.userThumb} size={34} />
              <div className="min-w-0 flex-1"><div className="truncate font-semibold">{h.title}</div><div className="truncate text-sm text-white/50">{h.subtitle}</div></div>
              <div className="shrink-0 text-right"><div className="text-sm font-semibold text-white/75">{h.user}</div><div className="text-xs text-white/45">{ago(h.viewedAt)}</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
