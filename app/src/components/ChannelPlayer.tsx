import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, TriangleAlert } from 'lucide-react'
import { Layer } from './Layer'
import { Focusable } from './Focusable'
import { DEMO_URI, directPlayUrl, getMetadata, type PlexMedia, type PlexServer } from '../lib/plex'
import { planPlayback } from '../lib/playback'
import { applySubStyle, keepAwake, mpvCmd, mpvSet, nativeStart, onMpv, setNativeVideoActive } from '../lib/native'
import { useSettings } from '../lib/settings'
import { slotAt, useGuide, type Channel, type Slot } from '../lib/tvguide'

interface Props { server: PlexServer; channels: Channel[]; start: number; onClose: () => void }

const TUNE_DELAY = 350   // wait for the remote to settle before loading, so flipping through channels doesn't hammer the server
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/**
 * Full-screen live-TV viewing: tunes a channel to whatever is "on" right now (part-way through, like cable) and flips channels with Up / Down.
 * Back returns to the guide. No pausing or seeking, and nothing is reported to Plex: no watch history, no Continue Watching.
 */
export function ChannelPlayer({ server, channels, start, onClose }: Props) {
  const { settings } = useSettings()
  const guide = useGuide()
  const [mode, setMode] = useState<'pending' | 'native' | 'web'>('pending')
  const [idx, setIdx] = useState(start)
  const [status, setStatus] = useState<'tuning' | 'playing' | 'error'>('tuning')
  const [slot, setSlot] = useState<Slot>()
  const [banner, setBanner] = useState(true)
  const [leaving, setLeaving] = useState(false)
  const seq = useRef(0)
  const idxRef = useRef(idx); idxRef.current = idx
  const slotsRef = useRef(guide.slots); slotsRef.current = guide.slots
  const nativeOn = useRef(false)
  const bannerTimer = useRef<number>(0)
  const advance = useRef<number>(0)
  const video = useRef<HTMLVideoElement>(null)
  const hls = useRef<{ destroy: () => void } | null>(null)
  const modeRef = useRef(mode); modeRef.current = mode

  useEffect(() => { nativeStart().then((ok) => setMode(ok ? 'native' : 'web')) }, [])
  useEffect(() => { keepAwake(true); return () => { keepAwake(false) } }, [])
  useEffect(() => { if (mode === 'native') applySubStyle(settings).catch(() => {}) }, [mode, status, settings.subSize, settings.subFont, settings.subColor, settings.subEdge, settings.subBackground])

  const flash = useCallback(() => { setBanner(true); clearTimeout(bannerTimer.current); bannerTimer.current = window.setTimeout(() => setBanner(false), 5000) }, [])

  // Tune: find what's on now, jump into it part-way through, and line up the next switch for when it ends.
  const tune = useCallback(async (i: number) => {
    const my = ++seq.current
    clearTimeout(advance.current)
    const ch = channels[i]
    setStatus('tuning'); flash()
    const now = Date.now()
    const s = slotAt(slotsRef.current[ch.id], now)
    setSlot(s)
    if (!s) { setStatus('error'); return }
    try {
      const media: PlexMedia = await getMetadata(server, s.key)
      if (my !== seq.current) return
      const dur = (media.duration ?? s.end - s.start) / 1000
      const offset = Math.max(0, Math.min((Date.now() - s.start) / 1000, Math.max(0, dur - 8)))
      advance.current = window.setTimeout(() => { if (my === seq.current) tune(idxRef.current) }, Math.max(1000, s.end - Date.now()))
      if (modeRef.current === 'native') {
        const url = directPlayUrl(server, media)
        if (!url) throw new Error('no file')
        await mpvCmd('loadfile', url, 'replace', '-1', `start=${offset.toFixed(1)},pause=no`)
      } else {
        const v = video.current
        if (!v) return
        hls.current?.destroy(); hls.current = null
        const plan = planPlayback(server, media)
        const begin = () => { v.removeEventListener('loadedmetadata', begin); if (server.uri !== DEMO_URI) v.currentTime = offset; v.play().catch(() => {}) }
        v.addEventListener('loadedmetadata', begin)
        if (plan.hls && !v.canPlayType('application/vnd.apple.mpegurl')) {
          const Hls = (await import('hls.js')).default
          if (!Hls.isSupported()) throw new Error('unsupported')
          const h = new Hls({ startPosition: offset, maxBufferLength: 20 }); hls.current = h
          h.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal && my === seq.current) setStatus('error') })
          h.loadSource(plan.url); h.attachMedia(v)
        } else v.src = plan.url
      }
    } catch (e) { console.warn('[tv guide] tune failed', e); if (my === seq.current) setStatus('error') }
  }, [channels, server, flash])

  // Native engine events (loaded / ended / failed).
  useEffect(() => {
    if (mode !== 'native') return
    let off: (() => void) | undefined, dead = false
    onMpv((p) => { if (p.name === 'eof-reached' && p.value === true) tune(idxRef.current) }, (e) => {
      if (e.event === 'loaded') { if (!nativeOn.current) { nativeOn.current = true; setNativeVideoActive(true) } setStatus('playing'); flash() }
      if ((e.event === 'end' && e.reason === 4) || e.event === 'error') setStatus('error')
    }).then((u) => { if (dead) u(); else off = u })
    mpvSet('volume', 100).catch(() => {}); mpvSet('mute', false).catch(() => {})
    return () => {
      dead = true; off?.()
      mpvCmd('stop').catch(() => {})
      setNativeVideoActive(false)
      document.documentElement.classList.add('ui-fade')
      setTimeout(() => document.documentElement.classList.remove('ui-fade'), 900)
    }
  }, [mode, tune, flash])
  useEffect(() => () => { clearTimeout(advance.current); clearTimeout(bannerTimer.current); hls.current?.destroy(); seq.current++ }, [])

  // Tune whenever the channel changes (after a short settle), once the engine is chosen.
  useEffect(() => {
    if (mode === 'pending') return
    setStatus('tuning'); flash()
    const t = setTimeout(() => tune(idx), idx === start && seq.current === 0 ? 0 : TUNE_DELAY)
    return () => clearTimeout(t)
  }, [idx, mode, tune, start, flash])

  const flip = (d: 1 | -1) => setIdx((i) => (i + d + channels.length) % channels.length)
  const close = () => { if (leaving) return; setLeaving(true); setTimeout(onClose, 300) }

  const ch = channels[idx]
  const now = Date.now()
  return (
    <Layer player onClose={close} scrim="bg-transparent">
      <div className="absolute inset-0">
        {mode === 'web' && <video ref={video} playsInline className="absolute inset-0 size-full bg-black object-contain" onPlaying={() => { setStatus('playing'); flash() }} onEnded={() => tune(idxRef.current)} onError={() => setStatus('error')} />}
        {/* Receives the remote: Up / Down flip channels, OK shows the banner */}
        <Focusable focusKey="channel-surface" title="Channel" onEnter={flash} onArrow={(d) => { if (d === 'up') { flip(-1); return false } if (d === 'down') { flip(1); return false } return false }} className="absolute inset-0">
          <div className="size-full" />
        </Focusable>

        {/* Banner: channel, title, episode */}
        <div className={`pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/50 to-transparent px-12 pb-10 pt-28 transition-opacity duration-500 ${banner && status !== 'tuning' || (status === 'tuning' && banner) ? 'opacity-100' : 'opacity-0'}`}>
          <div className="flex items-end gap-6">
            <div className="grid min-w-[5.5rem] place-items-center rounded-2xl bg-white/15 px-4 py-3 text-center"><div className="text-3xl font-extrabold leading-none tabular-nums">{ch.number}</div></div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold uppercase tracking-[0.2em] text-white/60">{ch.name}</div>
              <div className="truncate text-3xl font-extrabold tracking-tight">{slot?.title ?? '—'}</div>
              {slot?.sub && <div className="truncate text-lg text-white/70">{slot.sub}</div>}
            </div>
            {slot && <div className="shrink-0 text-right text-sm text-white/60">{clock(slot.start)} – {clock(slot.end)}<div className="text-xs">{Math.max(0, Math.round((slot.end - now) / 60000))} min left</div></div>}
          </div>
        </div>

        {/* Tuning / error cover */}
        <div className={`pointer-events-none absolute inset-0 grid place-items-center bg-black transition-opacity duration-300 ${status === 'playing' && !leaving ? 'opacity-0' : 'opacity-100'}`}>
          {status === 'tuning' && !leaving && (
            <div className="text-center"><Loader2 className="mx-auto animate-spin text-white/60" size={44} />
              <div className="mt-5 text-4xl font-extrabold tabular-nums">{ch.number}</div><div className="mt-1 font-bold tracking-wide text-white/70">{ch.name}</div>
              <div className="mt-3 text-sm uppercase tracking-[0.3em] text-white/40">Tuning</div></div>
          )}
          {status === 'error' && !leaving && (
            <div className="max-w-md text-center"><TriangleAlert className="mx-auto text-amber-300" size={44} />
              <div className="mt-4 text-2xl font-extrabold">{ch.number} · {ch.name}</div>
              <p className="mt-2 text-white/70">This channel isn’t working. Try another channel (Up or Down).</p></div>
          )}
        </div>
      </div>
    </Layer>
  )
}
