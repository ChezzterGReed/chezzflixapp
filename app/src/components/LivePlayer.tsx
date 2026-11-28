import { useCallback, useEffect, useRef, useState } from 'react'
import { Captions, Check, Loader2, TriangleAlert } from 'lucide-react'
import { useInputMode } from '../lib/input'
import { Layer } from './Layer'
import { Focusable } from './Focusable'
import { Clock } from './Clock'
import { keepAwake, isAndroid, mpvCmd, mpvGet, mpvSet, mpvTracks, nativeStart, onMpv, setMediaInfo, setNativeVideoActive, trackName, type MpvTrack } from '../lib/native'
import { useSettings } from '../lib/settings'
import { setNowPlaying, setPlayback, startNowPlaying } from '../lib/nowPlaying'
import { nowNext, setLastWatched, useLive, type LiveChannel } from '../lib/live'

interface Props { channels: LiveChannel[]; start: number; /** Closed; `idx` is the channel that was on screen. */ onClose: (idx: number) => void }

const TUNE_DELAY = 350   // wait for the remote to settle, so flipping through channels doesn't open a connection for each one
const DEFAULT_UA = 'VLC/3.0.20 LibVLC/3.0.20'   // many playlist hosts turn away a player that doesn't introduce itself as a known one
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** Full-screen viewing of a Live TV channel: Up / Down (or Left / Right, per the Guide setting) flip channels, number keys jump, OK shows what's on. */
export function LivePlayer({ channels, start, onClose }: Props) {
  const { settings } = useSettings()
  useLive()   // (re-reads what's on when the guide arrives)
  const inputMode = useInputMode()
  const [mode, setMode] = useState<'pending' | 'native' | 'web'>('pending')
  const [listening, setListening] = useState(false)   // the engine's events are being heard: tuning waits for this, so a quick "loaded" can't be missed
  const [idx, setIdx] = useState(start)
  const [status, setStatus] = useState<'tuning' | 'playing' | 'error'>('tuning')
  const [banner, setBanner] = useState(true)
  const [ctl, setCtl] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [why, setWhy] = useState('')
  const [digits, setDigits] = useState('')
  const [tracksOpen, setTracksOpen] = useState(false)
  const [tracks, setTracks] = useState<MpvTrack[]>([])
  const [, tick] = useState(0)
  const seq = useRef(0)
  const idxRef = useRef(idx); idxRef.current = idx
  const modeRef = useRef(mode); modeRef.current = mode
  const ctlRef = useRef(false); ctlRef.current = ctl
  const tracksOpenRef = useRef(false); tracksOpenRef.current = tracksOpen
  const channelsRef = useRef(channels); channelsRef.current = channels
  const video = useRef<HTMLVideoElement>(null)
  const hls = useRef<{ destroy: () => void } | null>(null)
  const nativeOn = useRef(false)
  const bannerTimer = useRef(0)
  const loadWatch = useRef(0)
  const recovering = useRef(0)
  const fails = useRef(0)
  const digitTimer = useRef(0)
  const lastMove = useRef(0)
  const ptr = useRef({ x: -1, y: -1 })   // (the web view repeats a mouse move when the picture behind it changes: only a real move shows the info)

  const flash = useCallback(() => { setBanner(true); clearTimeout(bannerTimer.current); bannerTimer.current = window.setTimeout(() => { if (!tracksOpenRef.current) { setBanner(false); setCtl(false) } }, 5000) }, [])
  // The clock on the banner (and the progress of what's on) moves along.
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 20_000); return () => clearInterval(t) }, [])

  const tuneRef = useRef<(i: number) => void>(() => {})
  // A stream that drops (or never starts) is tried again with growing pauses; after a few tries it says so and carries on trying.
  const recover = useCallback((reason: string) => {
    if (recovering.current) return
    setWhy(reason)
    const n = fails.current++
    setStatus(n >= 2 ? 'error' : 'tuning')
    recovering.current = window.setTimeout(() => { recovering.current = 0; tuneRef.current(idxRef.current) }, [800, 2000, 4000, 8000, 15000][Math.min(n, 4)])
  }, [])

  const tune = useCallback(async (i: number) => {
    const my = ++seq.current
    const ch = channelsRef.current[i]
    if (!ch) return
    clearTimeout(loadWatch.current)
    loadWatch.current = window.setTimeout(() => { if (my === seq.current) recover('no response') }, 20_000)
    setStatus((s) => (s === 'error' ? s : 'tuning'))
    setLastWatched(ch.id)
    try {
      if (modeRef.current === 'native') {
        setMediaInfo({ title: ch.name })
        if (!isAndroid) { await mpvSet('user-agent', ch.ua || DEFAULT_UA).catch(() => {}); await mpvSet('referrer', ch.referrer ?? '').catch(() => {}) }
        await mpvCmd('loadfile', ch.url, 'replace', '-1', 'pause=no')
      } else {
        const v = video.current
        if (!v) return
        hls.current?.destroy(); hls.current = null
        if (!v.canPlayType('application/vnd.apple.mpegurl') && /\.m3u8(\?|$)/i.test(ch.url)) {
          const Hls = (await import('hls.js')).default
          if (!Hls.isSupported()) throw new Error('unsupported')
          let netTries = 0, mediaTries = 0
          const h = new Hls({ maxBufferLength: 20, liveSyncDurationCount: 3 }); hls.current = h
          h.on(Hls.Events.ERROR, (_e, d) => {
            if (!d.fatal || my !== seq.current) return
            if (d.type === Hls.ErrorTypes.NETWORK_ERROR && netTries++ < 2) h.startLoad()
            else if (d.type === Hls.ErrorTypes.MEDIA_ERROR && mediaTries++ < 2) h.recoverMediaError()
            else recover('stream')
          })
          h.loadSource(ch.url); h.attachMedia(v)
          v.play().catch(() => {})
        } else { v.src = ch.url; v.play().catch(() => {}) }
      }
    } catch (e) { console.warn('[live] tune failed', e); if (my === seq.current) recover('tune') }
  }, [recover])
  tuneRef.current = tune

  useEffect(() => { nativeStart().then((ok) => setMode(ok ? 'native' : 'web')) }, [])
  useEffect(() => { keepAwake(true); return () => { keepAwake(false) } }, [])

  // The engine's events (loaded / ended / failed).
  useEffect(() => {
    if (mode !== 'native') return
    let off: (() => void) | undefined, dead = false
    onMpv((p) => { if (p.name === 'eof-reached' && p.value === true) recover('ended') }, (e) => {
      if (e.event === 'loaded') { clearTimeout(loadWatch.current); fails.current = 0; if (!nativeOn.current) { nativeOn.current = true; setNativeVideoActive(true) } setStatus('playing'); setWhy(''); flash() }
      if ((e.event === 'end' && e.reason === 4) || e.event === 'error') recover(`player ${e.message ?? ''}`.trim())
    }).then((u) => { if (dead) u(); else { off = u; setListening(true) } })
    mpvSet('volume', 100).catch(() => {}); mpvSet('mute', false).catch(() => {})
    return () => {
      dead = true; off?.()
      mpvCmd('stop').catch(() => {})
      setNativeVideoActive(false)
      document.documentElement.classList.add('ui-fade')
      setTimeout(() => document.documentElement.classList.remove('ui-fade'), 900)
    }
  }, [mode, recover, flash])
  // A picture that has silently stopped moving is treated like a drop.
  useEffect(() => {
    if (mode !== 'native' || status !== 'playing') return
    let last = '', still = 0
    const t = setInterval(async () => {
      const now = await mpvGet('time-pos').catch(() => null)
      if (now !== null && now !== last) { last = now; still = 0 } else if (now !== null && ++still >= 4) { still = 0; recover('stalled') }
    }, 5000)
    return () => clearInterval(t)
  }, [mode, status, recover])
  useEffect(() => () => { clearTimeout(loadWatch.current); clearTimeout(recovering.current); clearTimeout(bannerTimer.current); clearTimeout(digitTimer.current); hls.current?.destroy(); seq.current++ }, [])

  // Tune whenever the channel changes (after a short settle), once the engine is chosen.
  useEffect(() => {
    if (mode === 'pending' || (mode === 'native' && !listening)) return
    clearTimeout(recovering.current); recovering.current = 0; fails.current = 0
    setStatus('tuning'); flash()
    const t = setTimeout(() => tune(idx), idx === start && seq.current === 0 ? 0 : TUNE_DELAY)
    return () => clearTimeout(t)
  }, [idx, mode, listening, tune, start, flash])

  const flip = (d: 1 | -1) => setIdx((i) => (i + d + channels.length) % channels.length)
  const flipRef = useRef(flip); flipRef.current = flip
  useEffect(() => {
    let stop: (() => void) | undefined, dead = false
    startNowPlaying((k) => { if (k.key === 'next') flipRef.current(1); else if (k.key === 'previous') flipRef.current(-1) }).then((f) => { if (dead) f(); else stop = f })
    return () => { dead = true; stop?.() }
  }, [])

  const ch = channels[idx]
  const { now: onNow, next: onNext } = nowNext(ch)
  useEffect(() => { setNowPlaying({ title: onNow?.t ?? ch.name, subtitle: ch.name }); setPlayback('playing') }, [idx, onNow?.t]) // eslint-disable-line react-hooks/exhaustive-deps

  // Typing a channel number jumps to it.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (tracksOpenRef.current || !/^[0-9]$/.test(e.key)) return
      e.preventDefault()
      setDigits((d) => {
        const next = (d + e.key).slice(-4)
        clearTimeout(digitTimer.current)
        digitTimer.current = window.setTimeout(() => { const n = Number(next); if (n >= 1 && n <= channelsRef.current.length) setIdx(n - 1); setDigits('') }, 1400)
        return next
      })
      flash()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [flash])

  const close = () => { if (leaving) return; setLeaving(true); setTimeout(() => onClose(idxRef.current), 300) }
  const openTracks = useCallback(() => {
    setCtl(false); flash()
    mpvTracks().then((t) => { setTracks(t.filter((x) => x.type === 'audio' || x.type === 'sub')); setTracksOpen(true) }).catch(() => {})
  }, [flash])
  const pickTrack = (t: MpvTrack | 'off') => {
    if (t === 'off') mpvSet('sid', 'no').catch(() => {})
    else mpvSet(t.type === 'audio' ? 'aid' : 'sid', t.id).catch(() => {})
    setTracksOpen(false); flash()
  }

  const at = Date.now()
  const pct = onNow ? Math.max(0, Math.min(100, ((at - onNow.s) / (onNow.e - onNow.s)) * 100)) : 0
  return (
    <Layer player onClose={() => { if (ctlRef.current) { setCtl(false); setBanner(false) } else close() }} scrim="bg-transparent">
      <div className="absolute inset-0" onMouseMove={(e) => { const t = Date.now(), d = Math.abs(e.clientX - ptr.current.x) + Math.abs(e.clientY - ptr.current.y); ptr.current = { x: e.clientX, y: e.clientY }; if (d > 4 && t - lastMove.current > 500) { lastMove.current = t; flash() } }}>
        {mode === 'web' && <video ref={video} playsInline className="absolute inset-0 size-full bg-black object-contain" onPlaying={() => { clearTimeout(loadWatch.current); fails.current = 0; setStatus('playing'); flash() }} onEnded={() => recover('ended')} onError={() => recover('video')} />}
        <Focusable focusKey="live-surface" title="Channel"
          onEnter={() => { if (banner && status === 'playing' && mode === 'native' && inputMode === 'key') openTracks(); else flash() }}
          onArrow={(raw) => {
            const vert = settings.guideZap !== 'sides'
            const flipAxis = vert ? raw === 'up' || raw === 'down' : raw === 'left' || raw === 'right'
            if (!flipAxis) { flash(); if (ctlRef.current) openTracks(); else setCtl(true); return false }
            setCtl(false); flip(raw === 'up' || raw === 'left' ? -1 : 1); return false
          }}
          className="absolute inset-0">
          <div className="size-full" />
        </Focusable>

        {/* Tuning / error cover */}
        <div className={`pointer-events-none absolute inset-0 grid place-items-center bg-black transition-opacity duration-300 ${status === 'playing' && !leaving ? 'opacity-0' : 'opacity-100'}`}>
          {status === 'tuning' && !leaving && <div className="text-center"><Loader2 className="mx-auto animate-spin text-white/60" size={44} /><div className="mt-4 text-sm uppercase tracking-[0.3em] text-white/50">Tuning</div></div>}
          {status === 'error' && !leaving && (
            <div className="max-w-md -translate-y-10 text-center"><TriangleAlert className="mx-auto text-amber-300" size={44} />
              <p className="mt-3 text-white/70">This channel isn’t working right now. Still trying; or pick another channel.</p>{why && <p className="mt-2 text-xs text-white/35">{why}</p>}</div>
          )}
        </div>

        <div className={`pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between bg-linear-to-b from-black/70 to-transparent px-8 pb-14 pt-6 transition-opacity duration-500 ${banner || status !== 'playing' || digits ? 'opacity-100' : 'opacity-0'}`}>
          <div className="min-h-[3rem] text-5xl font-extrabold tabular-nums tracking-wider text-white drop-shadow-lg">{digits}</div>
          <Clock className="text-xl font-semibold text-white/90" />
        </div>

        {/* Banner: channel, what's on, what's next */}
        <div className={`pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/50 to-transparent px-12 pb-10 pt-28 transition-opacity duration-500 ${banner || status !== 'playing' ? 'opacity-100' : 'opacity-0'}`}>
          <div className="flex items-end gap-6">
            <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white/12 p-2">
              {ch.logo ? <img src={ch.logo} alt="" className="max-h-full max-w-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none' }} /> : <span className="text-3xl font-extrabold tabular-nums">{idx + 1}</span>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3 text-sm font-bold uppercase tracking-[0.2em] text-white/60"><span className="tabular-nums">{idx + 1}</span><span className="truncate">{ch.name}</span>{ch.quality && <span className="rounded bg-white/15 px-1.5 py-0.5 text-[0.65rem] tracking-wider">{ch.quality.toUpperCase()}</span>}</div>
              <div className="truncate text-3xl font-extrabold tracking-tight">{onNow?.t ?? ch.groups.join(' · ')}</div>
              {onNow && <div className="mt-2 h-1 max-w-xl overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} /></div>}
              {onNext && <div className="mt-2 truncate text-lg text-white/70">Next · {clock(onNext.s)} · {onNext.t}</div>}
            </div>
            {mode === 'native' && status === 'playing' && (
              <button onClick={openTracks} className={`${banner ? 'pointer-events-auto' : 'pointer-events-none'} flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition ${inputMode === 'key' && ctl ? 'scale-105 bg-white text-black' : 'bg-white/15 hover:bg-white/25'}`}><Captions size={18} />Audio & subtitles{inputMode === 'key' && ctl && <span className="rounded bg-black/10 px-1.5 text-xs font-bold">OK</span>}</button>
            )}
            {onNow && <div className="shrink-0 text-right text-sm text-white/60">{clock(onNow.s)} – {clock(onNow.e)}<div className="text-xs">{Math.max(0, Math.round((onNow.e - at) / 60000))} min left</div></div>}
          </div>
        </div>

        {tracksOpen && (
          <Layer player z="z-[85]" onClose={() => setTracksOpen(false)} scrim="bg-transparent" className="absolute bottom-40 left-1/2 w-[min(520px,94vw)] -translate-x-1/2">
            <div data-nopause className="pop flex gap-2 rounded-2xl bg-[#17171c]/95 p-3 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
              {([['Audio', tracks.filter((t) => t.type === 'audio')], ['Subtitles', tracks.filter((t) => t.type === 'sub')]] as const).map(([name, list]) => (
                <div key={name} className="min-w-0 flex-1">
                  <div className="px-3 pb-1 pt-1 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-white/40">{name}</div>
                  <div className="max-h-[40vh] overflow-y-auto overscroll-contain">
                    {name === 'Subtitles' && (
                      <Focusable onEnter={() => pickTrack('off')} title="Subtitles off">
                        <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><span className="flex-1">Off</span>{!list.some((t) => t.selected) && <Check size={16} />}</div>
                      </Focusable>
                    )}
                    {list.length === 0 && <div className="px-3 py-2.5 text-sm text-white/45">{name === 'Audio' ? 'Nothing to choose' : 'None in this stream'}</div>}
                    {list.map((t) => (
                      <Focusable key={`${t.type}-${t.id}`} onEnter={() => pickTrack(t)} title={trackName(t)}>
                        <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><span className="flex-1 truncate">{trackName(t)}</span>{t.selected && <Check size={16} />}</div>
                      </Focusable>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Layer>
        )}
      </div>
    </Layer>
  )
}
