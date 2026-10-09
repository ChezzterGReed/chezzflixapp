import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, RotateCcw, Volume2, VolumeX, X } from 'lucide-react'
import { Layer } from './Layer'
import { Focusable } from './Focusable'
import { planPlayback, type PlaybackPlan } from '../lib/playback'
import { DEMO_URI, directPlayUrl, type PlexMedia, type PlexServer } from '../lib/plex'
import { clipAf } from '../lib/leveling'
import { useSettings } from '../lib/settings'
import { mpvCmd, mpvSet, nativeStart, onMpv, setNativeVideoActive } from '../lib/native'
import type { Segment } from '../lib/clips'

interface Props { server: PlexServer; media: PlexMedia; segments: Segment[]; heading: string; subheading?: string; onClose: () => void }

/**
 * Plays a few snippets of a title (Preview: one clip; Recap: several) and then stops.
 * In the desktop app it uses the embedded mpv engine, so the original file plays directly, whatever the format.
 * Elsewhere (browser, platforms without the engine) it falls back to a small window with the web video player.
 */
export function ClipPopup(props: Props) {
  const [mode, setMode] = useState<'pending' | 'native' | 'web'>('pending')
  useEffect(() => { nativeStart().then((ok) => setMode(ok ? 'native' : 'web')) }, [])
  if (mode === 'pending') return null
  return mode === 'native' ? <NativeClip {...props} onFail={() => setMode('web')} /> : <WebClip {...props} />
}

function Bars({ segments, cur, t, done }: { segments: Segment[]; cur: number; t: number; done: boolean }) {
  return (
    <div className="flex gap-1.5">
      {segments.map((s, i) => (
        <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-accent" style={{ width: `${done || i < cur ? 100 : i === cur ? Math.min(100, (t / s.len) * 100) : 0}%`, transition: 'width .25s linear' }} />
        </div>
      ))}
    </div>
  )
}

function NativeClip({ server, media, segments, heading, subheading, onClose, onFail }: Props & { onFail: () => void }) {
  const { settings } = useSettings()
  const [cur, setCur] = useState(0)
  const [t, setT] = useState(0)
  const [lifted, setLifted] = useState(false)    // black cover gone, video visible
  const [cut, setCut] = useState(false)          // dip to black between recap clips
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [muted, setMuted] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const curRef = useRef(0)
  const liftedRef = useRef(false)
  const doneRef = useRef(false)
  const switching = useRef(false)
  const settling = useRef(false)   // just sought: ignore stale time updates until the new position arrives
  const flags = useRef({ cache: false, seeking: false })

  useEffect(() => {
    const url = directPlayUrl(server, media)
    if (!url) { onFail(); return }
    let off: (() => void) | undefined, dead = false, lift: number | undefined
    const reveal = () => {
      if (liftedRef.current) return
      liftedRef.current = true
      lift = window.setTimeout(() => { setNativeVideoActive(true); mpvSet('pause', 'no').catch(() => {}); setLifted(true) }, 350)
    }
    onMpv((p) => {
      const n = typeof p.value === 'number' ? p.value : undefined
      if (p.name === 'paused-for-cache') { flags.current.cache = !!p.value; setLoading(flags.current.cache || flags.current.seeking) }
      else if (p.name === 'seeking') { flags.current.seeking = !!p.value; setLoading(flags.current.cache || flags.current.seeking) }
      else if (p.name === 'time-pos' && n !== undefined) {
        if (!liftedRef.current || switching.current || doneRef.current) return
        const seg = segments[curRef.current]
        if (!seg) return
        if (settling.current) { if (n >= seg.start - 0.5 && n < seg.start + seg.len) settling.current = false; else return }
        setT(Math.max(0, n - seg.start))
        if (n >= seg.start + seg.len) {
          if (curRef.current >= segments.length - 1) { mpvSet('pause', 'yes').catch(() => {}); doneRef.current = true; setDone(true); return }
          switching.current = true; settling.current = true
          curRef.current += 1; setCur(curRef.current); setT(0); setCut(true)
          setTimeout(() => { mpvCmd('seek', segments[curRef.current].start, 'absolute').catch(() => {}); setCut(false); switching.current = false }, 220)
        }
      }
    }, (e) => {
      if (e.event === 'loaded') reveal()
      if ((e.event === 'end' && e.reason === 4) || e.event === 'error') onFail()
    }).then((u) => { if (dead) u(); else off = u })
    // Clips always start at full volume, unmuted, whatever the last video left behind.
    mpvSet('volume', 100).catch(() => {}); mpvSet('mute', false).catch(() => {})
    mpvSet('af', clipAf(media, settings.autoLevel)).catch(() => {})   // clips get this title's remembered boost too
    // Load paused on the first frame; it plays as the black cover lifts.
    mpvCmd('loadfile', url, 'replace', '-1', `start=${segments[0]?.start ?? 0},pause=yes`).catch(onFail)
    const safety = window.setTimeout(reveal, 15_000)
    return () => {
      dead = true; off?.(); clearTimeout(lift); clearTimeout(safety)
      mpvCmd('stop').catch(() => {})
      setNativeVideoActive(false)
      document.documentElement.classList.add('ui-fade')
      setTimeout(() => document.documentElement.classList.remove('ui-fade'), 900)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { mpvSet('mute', muted).catch(() => {}) }, [muted])

  const close = () => { if (leaving) return; setLeaving(true); setTimeout(onClose, 350) }
  const replay = () => {
    curRef.current = 0; doneRef.current = false; switching.current = false; settling.current = true
    setCur(0); setT(0); setDone(false)
    mpvCmd('seek', segments[0].start, 'absolute').catch(() => {})
    mpvSet('pause', 'no').catch(() => {})
  }

  return (
    <Layer player onClose={close} scrim="bg-transparent">
      <div className="absolute inset-0" onMouseDown={(e) => e.stopPropagation()}>
        {loading && lifted && !done && <div className="pointer-events-none absolute inset-0 grid place-items-center"><Loader2 className="animate-spin text-white/80" size={48} /></div>}

        {done && (
          <div className="fade-in absolute inset-0 grid place-items-center bg-black/55">
            <Focusable focusKey="clip-replay" onEnter={replay} title="Replay">
              <div className="flex items-center gap-2.5 rounded-full bg-white px-8 py-3.5 text-[1.05rem] font-bold text-black transition-transform group-hover/f:scale-105 group-data-[hl=true]/f:scale-110 group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]"><RotateCcw size={20} />Replay</div>
            </Focusable>
          </div>
        )}

        <div className={`absolute inset-x-0 bottom-0 bg-linear-to-t from-black/90 via-black/55 to-transparent px-10 pb-8 pt-24 transition-opacity duration-500 ${lifted ? 'opacity-100' : 'opacity-0'}`}>
          <Bars segments={segments} cur={cur} t={t} done={done} />
          <div className="mt-4 flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <div className="truncate text-xl font-bold">{heading}</div>
              {subheading && <div className="truncate text-sm text-white/65">{subheading}</div>}
            </div>
            <Focusable focusKey="clip-mute" onEnter={() => setMuted((m) => !m)} title={muted ? 'Unmute' : 'Mute'}>
              <div className="grid size-11 place-items-center rounded-full bg-white/15 transition-colors group-hover/f:bg-white/30 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">{muted ? <VolumeX size={20} /> : <Volume2 size={20} />}</div>
            </Focusable>
            <Focusable focusKey="clip-close" onEnter={close} title="Close">
              <div className="flex h-11 items-center gap-2 rounded-full bg-white/15 pl-4 pr-5 text-sm font-semibold transition-colors group-hover/f:bg-white/30 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><X size={18} />Close</div>
            </Focusable>
          </div>
        </div>

        {/* Black cover: up while the clip loads, between recap clips, and when leaving */}
        <div className={`pointer-events-none absolute inset-0 grid place-items-center bg-black transition-opacity ease-in-out ${!lifted || cut || leaving ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDuration: cut ? '200ms' : '450ms' }}>
          {!lifted && !leaving && <Loader2 className="animate-spin text-white/40" size={40} />}
        </div>
      </div>
    </Layer>
  )
}

function WebClip({ server, media, segments, heading, subheading, onClose }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const hls = useRef<{ destroy: () => void } | null>(null)
  const step = useRef<'none' | 'stream' | 'transcode'>('none')
  const segs = useRef(segments)
  const [cur, setCur] = useState(0)
  const [t, setT] = useState(0)
  const [loading, setLoading] = useState(true)
  const [cut, setCut] = useState(false)          // brief dip to black between recap clips
  const [done, setDone] = useState(false)
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState<string>()
  const curRef = useRef(0)
  const switching = useRef(false)

  const load = useCallback(async (plan: PlaybackPlan, from: number) => {
    const v = video.current
    if (!v) return
    hls.current?.destroy(); hls.current = null
    setLoading(true); setError(undefined)
    const ready = () => {
      v.removeEventListener('loadedmetadata', ready)
      // The demo clip is a few seconds long, so squeeze the plan into it.
      if (server.uri === DEMO_URI && isFinite(v.duration)) {
        const total = (media.duration ?? 0) / 1000 || 1
        segs.current = segments.map((s) => ({ start: (s.start / total) * v.duration * 0.6, len: Math.min(s.len, v.duration / (segments.length + 1)) }))
      }
      v.currentTime = segs.current[curRef.current]?.start ?? 0
      v.play().catch(() => {})
    }
    v.addEventListener('loadedmetadata', ready)
    if (plan.hls && !v.canPlayType('application/vnd.apple.mpegurl')) {
      const Hls = (await import('hls.js')).default
      if (!Hls.isSupported()) return setError('This device cannot play streamed video.')
      const h = new Hls({ startPosition: from, maxBufferLength: 20 })
      hls.current = h
      h.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) fail() })
      h.loadSource(plan.url); h.attachMedia(v)
    } else v.src = plan.url
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media, server, segments])

  // If the file won't play as it is, step down: original -> repackaged -> re-encoded.
  const fail = useCallback(() => {
    const order = ['none', 'stream', 'transcode'] as const
    const next = order[order.indexOf(step.current) + 1]
    if (!next || next === 'none') return setError("This clip couldn't be played.")
    step.current = next
    load(planPlayback(server, media, {}, next), segs.current[curRef.current]?.start ?? 0)
  }, [load, media, server])

  useEffect(() => {
    load(planPlayback(server, media), segs.current[0]?.start ?? 0)
    return () => { hls.current?.destroy(); const v = video.current; if (v) { v.pause(); v.removeAttribute('src'); v.load() } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onTime = () => {
    const v = video.current
    if (!v || switching.current || done) return
    const seg = segs.current[curRef.current]
    if (!seg) return
    setT(Math.max(0, v.currentTime - seg.start))
    if (v.currentTime >= seg.start + seg.len) {
      if (curRef.current >= segs.current.length - 1) { v.pause(); setDone(true); return }
      switching.current = true
      curRef.current += 1; setCur(curRef.current); setT(0); setCut(true)
      setTimeout(() => { v.currentTime = segs.current[curRef.current].start; setLoading(true); setCut(false); switching.current = false }, 200)
    }
  }

  const replay = () => {
    const v = video.current
    if (!v) return
    curRef.current = 0; switching.current = false
    setCur(0); setT(0); setDone(false); setLoading(true)
    v.currentTime = segs.current[0].start
    v.play().catch(() => {})
  }

  return (
    <Layer onClose={onClose} scrim="bg-black/75 backdrop-blur-md">
      <div className="absolute inset-0 grid place-items-center px-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pop w-[min(960px,92vw)] overflow-hidden rounded-3xl bg-[#101014] shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/10">
        <div className="relative aspect-video bg-black">
          <video ref={video} playsInline muted={muted} className="size-full object-contain" preload="auto"
            onTimeUpdate={onTime} onPlaying={() => setLoading(false)} onWaiting={() => setLoading(true)} onCanPlay={() => setLoading(false)} onError={fail} />
          <div className={`pointer-events-none absolute inset-0 bg-black transition-opacity duration-200 ${cut ? 'opacity-100' : 'opacity-0'}`} />
          {loading && !done && !error && <div className="pointer-events-none absolute inset-0 grid place-items-center"><Loader2 className="animate-spin text-white/80" size={48} /></div>}
          {error && <div className="absolute inset-0 grid place-items-center bg-black/80 px-8 text-center text-white/80">{error}</div>}
          {done && (
            <div className="fade-in absolute inset-0 grid place-items-center bg-black/65 backdrop-blur-sm">
              <Focusable focusKey="clip-replay" onEnter={replay} title="Replay">
                <div className="flex items-center gap-2.5 rounded-full bg-white px-8 py-3.5 text-[1.05rem] font-bold text-black transition-transform group-hover/f:scale-105 group-data-[hl=true]/f:scale-110 group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]"><RotateCcw size={20} />Replay</div>
              </Focusable>
            </div>
          )}
        </div>

        <div className="px-6 pt-4"><Bars segments={segs.current} cur={cur} t={t} done={done} /></div>

        <div className="flex items-center gap-4 px-6 pb-5 pt-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-bold">{heading}</div>
            {subheading && <div className="truncate text-sm text-white/55">{subheading}</div>}
          </div>
          <Focusable focusKey="clip-mute" onEnter={() => setMuted((m) => !m)} title={muted ? 'Unmute' : 'Mute'}>
            <div className="grid size-11 place-items-center rounded-full bg-white/10 transition-colors group-hover/f:bg-white/25 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">{muted ? <VolumeX size={20} /> : <Volume2 size={20} />}</div>
          </Focusable>
          <Focusable focusKey="clip-close" onEnter={onClose} title="Close">
            <div className="flex h-11 items-center gap-2 rounded-full bg-white/10 pl-4 pr-5 text-sm font-semibold transition-colors group-hover/f:bg-white/25 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><X size={18} />Close</div>
          </Focusable>
        </div>
      </div>
      </div>
    </Layer>
  )
}
