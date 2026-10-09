import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, AudioLines, Captions, SkipBack, Check, FastForward, Loader2, Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { pause as pauseNav, resume as resumeNav } from '@noriginmedia/norigin-spatial-navigation'
import { planPlayback, streamsOf, type PlaybackPlan, type TrackChoice } from '../lib/playback'
import { backdropPath, DEMO_URI, directPlayUrl, episodeLabel, getNextEpisode, getPreviousEpisode, imageUrl, isSpoilerRisk, reportProgress, type PlexMedia, type PlexServer } from '../lib/plex'
import { applySubStyle, isAndroid, mpvCmd, mpvSet, mpvTracks, nativeStart, onMpv, setExternalSubs, setNativeVideoActive, type MpvTrack } from '../lib/native'
import { useBack } from '../lib/back'
import { useSettings } from '../lib/settings'
import { clampBoost, dbLabel, useLevelEngine } from '../lib/leveling'

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(sec).padStart(2, '0')}`
}

const KIND_STYLE = { direct: 'bg-emerald-400/20 text-emerald-300 ring-emerald-300/30', stream: 'bg-sky-400/20 text-sky-300 ring-sky-300/30', transcode: 'bg-amber-400/20 text-amber-300 ring-amber-300/30' }

interface Props { server: PlexServer; media: PlexMedia; onClose: () => void; onPlayNext: (m: PlexMedia) => void }

// Set when one episode hands over to the next, so the new player starts already black instead of flashing the app UI.
let continuing = false
const FADE_MS = 650   // fade to black / fade back
const IRIS_MS = 950   // the exit: the app grows back over the video
const BEAT_MS = 900   // time held in black while the video loads

export function Player({ server, media, onClose: finishClose, onPlayNext }: Props) {
  const { settings, update } = useSettings()
  const [levelPanel, setLevelPanel] = useState<number | null>(null)   // row highlighted in the volume menu (null = closed)
  const [loadedTick, setLoadedTick] = useState(0)
  const video = useRef<HTMLVideoElement>(null)
  const hls = useRef<{ destroy: () => void } | null>(null)
  const timeRef = useRef(0)
  const [choice, setChoice] = useState<TrackChoice>({})
  const [plan, setPlan] = useState<PlaybackPlan>()
  const [error, setError] = useState<string>()
  const [buffering, setBuffering] = useState(true)
  const [paused, setPausedState] = useState(true)
  const setPaused = (v: boolean) => { pausedRef.current = v; setPausedState(v) }
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState((media.duration ?? 0) / 1000)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [controls, setControls] = useState(true)
  const [panel, setPanel] = useState<null | { col: 0 | 1; idx: number }>(null)
  // Remote: once the controls are up, Left/Right move between buttons (Up reaches the seek bar). Hidden controls: Left/Right just skip.
  const [ctlRow, setCtlRow] = useState<null | 'seek' | 'buttons'>(null)
  const [ctlIdx, setCtlIdx] = useState(0)
  const [panelTick, setPanelTick] = useState(0)
  const [prev, setPrev] = useState<PlexMedia | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [next, setNext] = useState<PlexMedia | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  const idle = useRef<number>(0)
  const fallbackStep = useRef<'none' | 'stream' | 'transcode'>('none')
  // ----- cinematic start: fade to black -> hold a beat while loading -> play as the black lifts -----
  const cont = useRef(continuing)
  const [coverOn, setCoverOn] = useState(cont.current)   // black cover visible?
  const [black, setBlack] = useState(cont.current)       // fully black (safe to swap the UI out underneath)
  const [ready, setReady] = useState(false)               // video loaded and paused on its first frame
  const [lifted, setLifted] = useState(false)             // cover gone, controls available
  const [closing, setClosing] = useState(false)
  const blackAt = useRef(cont.current ? Date.now() : 0)
  const liftedRef = useRef(false)
  const closingRef = useRef(false)
  const exitStyle = useRef<'none' | 'iris' | 'fade'>('none')
  const volumeRef = useRef(1)
  const [revealing, setRevealing] = useState(false)
  const engaged = useRef(false)
  const nativeGaveUp = useRef(false)
  // 'native' = embedded libmpv (desktop app): plays the original file, whatever the format. 'web' = <video> + Plex remux fallback.
  const [mode, setMode] = useState<'pending' | 'native' | 'web'>('pending')
  const [nTracks, setNTracks] = useState<MpvTrack[]>([])
  const endedRef = useRef<() => void>(() => {})
  const pausedRef = useRef(false)

  const plexAudio = streamsOf(media, 2)
  const plexSubs = streamsOf(media, 3)
  const trackLabel = (t: MpvTrack) => [t.title || t.lang?.toUpperCase(), t.codec?.toUpperCase(), t.channels ? `${t.channels}ch` : '', t.external ? 'external' : ''].filter(Boolean).join(' · ') || 'Track'
  type Row = { id: number; label: string; on: boolean }
  const audio: Row[] = mode === 'native'
    ? nTracks.filter((t) => t.type === 'audio').map((t) => ({ id: t.id, label: trackLabel(t), on: t.selected }))
    : plexAudio.map((s) => ({ id: s.id, label: s.displayTitle ?? s.language ?? 'Track', on: (choice.audioId ?? (plexAudio.find((x) => x.selected) ?? plexAudio[0])?.id) === s.id }))
  const subs: Row[] = mode === 'native'
    ? nTracks.filter((t) => t.type === 'sub').map((t) => ({ id: t.id, label: trackLabel(t), on: t.selected }))
    : plexSubs.map((s) => ({ id: s.id, label: s.displayTitle ?? s.language ?? 'Track', on: (choice.subtitleId === undefined ? plexSubs.find((x) => x.selected)?.id ?? null : choice.subtitleId) === s.id }))
  const intro = media.Marker?.find((m) => m.type === 'intro')
  const credits = media.Marker?.find((m) => m.type === 'credits')

  const poke = useCallback(() => {
    setControls(true)
    clearTimeout(idle.current)
    idle.current = window.setTimeout(() => { setControls(false); if (!pausedRef.current) setCtlRow(null) }, 3200)
  }, [])

  // ----- load / reload the source -----
  const load = useCallback(async (p: PlaybackPlan, startAt: number) => {
    const v = video.current
    if (!v) return
    hls.current?.destroy(); hls.current = null
    setPlan(p); setError(undefined); setBuffering(true)
    const seekOnReady = () => { if (startAt > 1) v.currentTime = startAt; v.removeEventListener('loadedmetadata', seekOnReady) }
    v.addEventListener('loadedmetadata', seekOnReady)
    if (p.hls && !v.canPlayType('application/vnd.apple.mpegurl')) {
      const Hls = (await import('hls.js')).default
      if (!Hls.isSupported()) return setError('This device cannot play streamed video.')
      const h = new Hls({ startPosition: startAt > 1 ? startAt : -1, maxBufferLength: 40 })
      hls.current = h
      h.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) fail('The server could not start this stream.') })
      h.loadSource(p.url); h.attachMedia(v)
    } else {
      v.src = p.url
    }
    v.preload = 'auto'
    if (liftedRef.current) v.play().catch(() => setPaused(true)) // before the cover lifts, wait on the first frame
  }, [])

  // If the original file won't play, step down gracefully: direct -> direct stream -> transcode.
  const fail = useCallback((msg: string) => {
    const order = ['none', 'stream', 'transcode'] as const
    const nextStep = order[order.indexOf(fallbackStep.current) + 1]
    if (!nextStep || nextStep === 'none') return setError(msg)
    fallbackStep.current = nextStep
    load(planPlayback(server, media, choice, nextStep), timeRef.current || (media.viewOffset ?? 0) / 1000)
  }, [choice, load, media, server])

  // Decide the engine once: embedded libmpv if this is the desktop app and it starts, otherwise the web player.
  useEffect(() => { continuing = false; nativeStart().then((ok) => setMode(ok ? 'native' : 'web')) }, [])
  // Volume / mute chosen in our UI -> mpv
  useEffect(() => { if (mode === 'native') { mpvSet('volume', Math.round(volume * 100)).catch(() => {}); mpvSet('mute', muted).catch(() => {}) } }, [mode, volume, muted])

  const loadNative = useCallback(async (startAt: number) => {
    const url = directPlayUrl(server, media)
    if (!url) return setError('No playable file was found for this title.')
    setPlan({ kind: 'direct', url, hls: false, summary: 'Direct Play', reason: '' })
    setError(undefined); setBuffering(true)
    // Load paused: the first frame is decoded behind the black cover, and playback starts as the cover lifts.
    mpvSet('video-zoom', 0).catch(() => {}); mpvSet('brightness', 0).catch(() => {})
    mpvSet('af', '').catch(() => {})   // clean slate; the volume engine installs its filters once the file has loaded
    // Android's engine needs sidecar subtitles when the file loads (mpv adds them afterwards, below).
    setExternalSubs(plexSubs.filter((s) => s.key).map((s) => ({ url: `${server.uri}${s.key}?X-Plex-Token=${server.accessToken}`, lang: s.languageCode, name: s.displayTitle })))
    try { await mpvCmd('loadfile', url, 'replace', '-1', `start=${startAt > 1 ? startAt : 0},pause=yes`) } catch (e) { setError(String(e)) }
  }, [server, media])

  useEffect(() => {
    if (mode === 'pending') return
    fallbackStep.current = 'none'
    const start = timeRef.current > 5 ? timeRef.current : (media.viewOffset ?? 0) / 1000
    if (mode === 'native') loadNative(start)
    else load(planPlayback(server, media, choice), start)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, choice, media.ratingKey])

  // Native engine -> UI state
  useEffect(() => {
    if (mode !== 'native') return
    let off: (() => void) | undefined, dead = false
    const flags = { cache: false, seeking: false }
    const refreshTracks = () => mpvTracks().then(setNTracks).catch(() => {})
    onMpv((p) => {
      const n = typeof p.value === 'number' ? p.value : undefined
      switch (p.name) {
        case 'time-pos': if (n !== undefined) { timeRef.current = n; setTime(n); setReady(true) } break
        case 'duration': if (n) setDuration(n); break
        case 'pause': setPaused(!!p.value); break
        case 'volume': if (n !== undefined) setVolume(n / 100); break
        case 'mute': setMuted(!!p.value); break
        case 'demuxer-cache-time': if (n !== undefined) setBuffered(n); break
        case 'paused-for-cache': flags.cache = !!p.value; setBuffering(flags.cache || flags.seeking); break
        case 'seeking': flags.seeking = !!p.value; setBuffering(flags.cache || flags.seeking); break
        case 'eof-reached': if (p.value === true) endedRef.current(); break
      }
    }, (e) => {
      if (e.event === 'loaded') {
        setBuffering(false); setReady(true); refreshTracks(); setLoadedTick((n) => n + 1)
        // Sidecar subtitles Plex knows about (embedded ones are already in mpv's track list).
        plexSubs.filter((s) => s.key).forEach((s) => mpvCmd('sub-add', `${server.uri}${s.key}?X-Plex-Token=${server.accessToken}`, 'auto').catch(() => {}))
        setTimeout(refreshTracks, 800)
      }
      // On Android a TV may lack a decoder for something (an unusual codec): before anything has played, hand over to the web player,
      // where Plex repackages the file, rather than showing an error.
      if (isAndroid && (e.event === 'error' || (e.event === 'end' && e.reason === 4)) && timeRef.current < 1 && !nativeGaveUp.current) {
        nativeGaveUp.current = true
        mpvCmd('stop').catch(() => {})
        setMode('web')
        return
      }
      if (e.event === 'end' && e.reason === 4) setError('mpv could not play this file.')
      if (e.event === 'error') setError(e.message ?? 'The native player failed to start.')
    }).then((u) => { if (dead) u(); else off = u })
    return () => { dead = true; off?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // Leaving the player: stop mpv and let the app's own UI show again.
  useEffect(() => () => {
    if (mode === 'native') mpvCmd('stop').catch(() => {})
    if (!engaged.current) return
    if (!continuing) {
      setNativeVideoActive(false)
      if (exitStyle.current !== 'iris') {
        // Bring the app UI back with a fade rather than a cut.
        document.documentElement.classList.add('ui-fade')
        setTimeout(() => document.documentElement.classList.remove('ui-fade'), 900)
      }
    }
    // The exit transition fades volume to zero; put everything back so the next thing mpv plays (a clip, the next title) is audible.
    if (mode === 'native') { mpvSet('video-zoom', 0).catch(() => {}); mpvSet('brightness', 0).catch(() => {}); mpvSet('volume', 100).catch(() => {}); mpvSet('mute', false).catch(() => {}) }
  }, [mode])

  // Cover timeline
  useEffect(() => {
    if (cont.current) return
    const start = setTimeout(() => setCoverOn(true), 40) // after first paint, so the opacity transition actually runs
    const t = setTimeout(() => { blackAt.current = Date.now(); setBlack(true) }, FADE_MS + 40)
    return () => { clearTimeout(start); clearTimeout(t) }
  }, [])
  // Once it's black, swap the app UI out from underneath and let the native view show through.
  useEffect(() => {
    if (!black) return
    engaged.current = true
    if (mode === 'native' && !closingRef.current) setNativeVideoActive(true)
  }, [black, mode])
  // Start playback and lift the cover: after the loading beat, and only once the first frame is ready (or something failed).
  useEffect(() => {
    if (!black || lifted || closing || mode === 'pending' || (!ready && !error)) return
    const wait = Math.max(0, BEAT_MS - (Date.now() - blackAt.current))
    const t = setTimeout(() => {
      if (!error) { if (mode === 'native') mpvSet('pause', 'no').catch(() => {}); else video.current?.play().catch(() => setPaused(true)) }
      liftedRef.current = true
      setCoverOn(false)
      setTimeout(() => { setLifted(true); poke() }, FADE_MS + 150)
    }, wait)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [black, ready, error, mode, lifted, closing])
  // Safety net: never sit in black forever.
  useEffect(() => { if (!black) return; const t = setTimeout(() => setReady(true), 25_000); return () => clearTimeout(t) }, [black])

  // Leaving (back, end of title): fade to black first, then really close.
  const fadeOut = useCallback((then: () => void) => {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true); setLifted(false); setCoverOn(true)
    setTimeout(then, FADE_MS)
  }, [])
  volumeRef.current = volume
  const close = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true); setLifted(false)
    if (mode === 'native') {
      // Iris: the app grows from the middle of the screen over the playing picture, which slowly zooms in, dims and goes quiet.
      exitStyle.current = 'iris'
      const root = document.documentElement
      root.style.setProperty('--iris-y', `${window.scrollY + window.innerHeight * 0.5}px`)
      root.dataset.nativeVideo = 'exit'
      const steps = 16, startVol = Math.round(volumeRef.current * 100)
      let n = 0
      const iv = setInterval(() => {
        n++
        const t = n / steps, e = t * t * (3 - 2 * t)
        mpvSet('video-zoom', (0.1 * e).toFixed(3)).catch(() => {})
        mpvSet('brightness', Math.round(-30 * e)).catch(() => {})
        mpvSet('volume', Math.round(startVol * (1 - t))).catch(() => {})
        if (n >= steps) clearInterval(iv)
      }, IRIS_MS / steps)
      setTimeout(finishClose, IRIS_MS + 60)
    } else {
      exitStyle.current = 'fade'
      setRevealing(true) // the web player eases away over the app, which is already underneath
      setTimeout(finishClose, 720)
    }
  }, [mode, finishClose])

  useEffect(() => () => { hls.current?.destroy(); if (video.current) { video.current.removeAttribute('src'); video.current.load() } }, [])

  // ----- progress reporting -----
  useEffect(() => {
    const t = setInterval(() => { if (timeRef.current > 0) reportProgress(server, media, (mode === 'native' ? pausedRef.current : video.current?.paused) ? 'paused' : 'playing', timeRef.current * 1000) }, 10_000)
    return () => { clearInterval(t); reportProgress(server, media, 'stopped', timeRef.current * 1000) }
  }, [server, media, mode])

  // ----- next episode lookup -----
  useEffect(() => { getNextEpisode(server, media).then(setNext).catch(() => setNext(null)); getPreviousEpisode(server, media).then(setPrev).catch(() => setPrev(null)) }, [server, media])

  // ----- keep spatial-nav out of the way; the player owns the keys -----
  useEffect(() => { pauseNav(); return () => resumeNav() }, [])
  useBack(() => { if (panel) setPanel(null); else if (levelPanel !== null) setLevelPanel(null); else if (ctlRow) { setCtlRow(null); setControls(false) } else close() })
  useEffect(() => { poke(); return () => clearTimeout(idle.current) }, [poke])

  const seek = useCallback((t: number) => {
    const target = Math.max(0, Math.min(duration || t, t))
    if (mode === 'native') mpvCmd('seek', target, 'absolute').catch(() => {})
    else { const v = video.current; if (v) v.currentTime = target }
    poke()
  }, [duration, poke, mode])
  const toggle = useCallback(() => {
    if (mode === 'native') mpvCmd('cycle', 'pause').catch(() => {})
    else { const v = video.current; if (!v) return; v.paused ? v.play() : v.pause() }
    poke()
  }, [poke, mode])
  const toggleFullscreen = useCallback(async () => {
    if ('__TAURI_INTERNALS__' in window) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const w = getCurrentWindow(); const on = !(await w.isFullscreen()); await w.setFullscreen(on); setFullscreen(on)
    } else if (document.fullscreenElement) { await document.exitFullscreen(); setFullscreen(false) }
    else { await document.documentElement.requestFullscreen().catch(() => {}); setFullscreen(true) }
  }, [])

  // Volume boost: auto leveling + dialogue boost + a manual amount, all adjustable while watching (see lib/leveling.ts).
  const level = useLevelEngine({ active: mode === 'native' && !isAndroid, loaded: loadedTick, media, autoLevel: settings.autoLevel, dialogueBoost: settings.dialogueBoost })
  // Subtitle look (plain-text subtitles; styled .ass ones keep their own).
  useEffect(() => { if (mode === 'native') applySubStyle(settings).catch(() => {}) }, [mode, loadedTick, settings.subSize, settings.subFont, settings.subColor, settings.subEdge, settings.subBackground])
  // Manual boost: from Auto, the first press starts from the boost currently in effect, then moves 1 dB at a time (-10 to +10).
  const nudgeBoost = (d: 1 | -1) => level.setBoost(clampBoost((level.boost === 'auto' ? Math.round(level.gain) : level.boost) + d))
  // Android's engine has no live loudness analysis yet, so it offers the manual boost only (applied as a steady gain).
  useEffect(() => { if (isAndroid && mode === 'native') mpvSet('gain-db', typeof level.boost === 'number' ? level.boost : 0).catch(() => {}) }, [mode, level.boost])
  const allLevelRows = [
    { label: 'Auto leveling', value: settings.autoLevel ? 'On' : 'Off', hint: 'Measures the title, holds one steady boost', act: () => update({ autoLevel: !settings.autoLevel }) },
    { label: 'Dialogue boost', value: settings.dialogueBoost ? 'On' : 'Off', hint: 'Lifts voices in surround audio', act: () => update({ dialogueBoost: !settings.dialogueBoost }) },
    { label: 'Boost', value: level.boost === 'auto' ? (settings.autoLevel && level.gain ? `Auto · ${dbLabel(Math.round(level.gain))}` : 'Auto') : dbLabel(level.boost), hint: level.boost === 'auto' ? 'Use − and + to set it yourself' : 'Set by you · press OK for Auto', act: () => level.setBoost('auto') },
  ]
  const levelRows = isAndroid ? allLevelRows.slice(2) : allLevelRows   // the boost row is always the last one
  const boostRow = levelRows.length - 1
  const levelActive = (!isAndroid && (settings.autoLevel || settings.dialogueBoost)) || (typeof level.boost === 'number' && level.boost !== 0)

  const showNext = !!next && duration > 0 && time > (credits ? credits.startTimeOffset / 1000 : duration - 30)
  const goNext = useCallback(() => { if (next) fadeOut(() => { continuing = true; onPlayNext(next) }) }, [next, onPlayNext, fadeOut])
  const goPrev = useCallback(() => { if (prev) fadeOut(() => { continuing = true; onPlayNext(prev) }) }, [prev, onPlayNext, fadeOut])
  endedRef.current = () => (next && settings.autoplayNext ? goNext() : close())

  // Up Next countdown (only if autoplay is on)
  useEffect(() => {
    if (!showNext || !settings.autoplayNext) return setCountdown(null)
    setCountdown((c) => c ?? 10)
    const t = setInterval(() => setCountdown((c) => (c === null ? null : c - 1)), 1000)
    return () => clearInterval(t)
  }, [showNext, settings.autoplayNext])
  useEffect(() => { if (countdown !== null && countdown <= 0) goNext() }, [countdown, goNext])

  // Skip credits (when there's no next episode to hand over to: movies and series finales)
  const inCredits = !!credits && duration > 0 && time >= credits.startTimeOffset / 1000 && time < credits.endTimeOffset / 1000
  const skipCredits = useCallback(() => {
    if (!credits) return
    const end = credits.endTimeOffset / 1000
    if (!duration || end >= duration - 5) close(); else seek(end)
  }, [credits, duration, close, seek])
  const showSkipCredits = inCredits && !next
  // Skip intro
  const inIntro = !!intro && time >= intro.startTimeOffset / 1000 && time < intro.endTimeOffset / 1000
  useEffect(() => { if (inIntro && settings.autoSkipIntro && intro) seek(intro.endTimeOffset / 1000) }, [inIntro, settings.autoSkipIntro, intro, seek])
  const showSkipIntro = inIntro && !settings.autoSkipIntro && !!intro
  // What OK/Enter does when an on-screen button is showing (otherwise it pauses): Skip intro, Skip credits, or Play now on Up Next.
  const primary: (() => void) | null = showSkipIntro ? () => seek(intro!.endTimeOffset / 1000) : showSkipCredits ? skipCredits : showNext && next ? goNext : null

  // ----- tracks -----
  const choose = (col: 0 | 1, idx: number) => {
    if (mode === 'native') {
      if (col === 0) mpvSet('aid', audio[idx].id).then(() => mpvTracks().then(setNTracks)).catch(() => {})
      else mpvSet('sid', idx === 0 ? 'no' : subs[idx - 1].id).then(() => mpvTracks().then(setNTracks)).catch(() => {})
    } else if (col === 0) setChoice((c) => ({ ...c, audioId: audio[idx].id }))
    else setChoice((c) => ({ ...c, subtitleId: idx === 0 ? null : subs[idx - 1].id }))
    setPanel(null)
  }
  const activeSub = subs.find((r) => r.on)?.id ?? null

  // ----- the control bar, in order, for remote navigation -----
  const hasBoost = mode === 'native' || location.search.includes('levels')
  const order = ['play', ...(prev ? ['prev'] : []), 'back', 'fwd', 'mute', ...(next ? ['next'] : []), ...(hasBoost ? ['boost'] : []), 'subs', 'full']
  const acts: Record<string, () => void> = {
    play: toggle, prev: goPrev, next: goNext, mute: () => setMuted((m) => !m), full: toggleFullscreen,
    back: () => seek(timeRef.current - settings.seekBack), fwd: () => seek(timeRef.current + settings.seekForward),
    boost: () => setLevelPanel(levelPanel === null ? 0 : null), subs: () => setPanel(panel ? null : { col: 0, idx: 0 }),
  }
  const cur = order[Math.min(ctlIdx, order.length - 1)]
  const cf = (id: string) => ctlRow === 'buttons' && cur === id

  // Menus (audio & subtitles, volume) close by themselves after a few idle seconds.
  useEffect(() => {
    if (!panel && levelPanel === null) return
    const t = setTimeout(() => { setPanel(null); setLevelPanel(null) }, 5000)
    return () => clearTimeout(t)
  }, [panel, levelPanel, panelTick])
  const menuLeave = useRef<number>(0)

  // ----- keyboard / remote -----
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (panel || levelPanel !== null) setPanelTick((n) => n + 1)
      if (panel) {
        const rows = [audio.length, subs.length + 1]
        if (e.key === 'ArrowDown') setPanel({ ...panel, idx: Math.min(rows[panel.col] - 1, panel.idx + 1) })
        else if (e.key === 'ArrowUp') setPanel({ ...panel, idx: Math.max(0, panel.idx - 1) })
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const col = panel.col === 0 ? 1 : 0; setPanel({ col, idx: Math.min(panel.idx, rows[col] - 1) }) }
        else if (e.key === 'Enter') choose(panel.col, panel.idx)
        else return
        e.preventDefault(); e.stopPropagation(); return
      }
      if (levelPanel !== null) {
        if (e.key === 'ArrowDown') setLevelPanel(Math.min(levelRows.length - 1, levelPanel + 1))
        else if (e.key === 'ArrowUp') setLevelPanel(Math.max(0, levelPanel - 1))
        else if (e.key === 'ArrowRight' && levelPanel === boostRow) nudgeBoost(1)
        else if (e.key === 'ArrowLeft' && levelPanel === boostRow) nudgeBoost(-1)
        else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') levelRows[levelPanel].act()
        else if (e.key === 'v') setLevelPanel(null)
        else return
        e.preventDefault(); e.stopPropagation(); poke(); return
      }
      // On-screen actions (skip intro, up next...) answer to OK first.
      if (e.key === 'Enter' && primary && ctlRow !== 'buttons') { primary(); e.preventDefault(); return }
      // Controls up and focused: the remote moves around them.
      if (controls && ctlRow) {
        const last = order.length - 1
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          const d = e.key === 'ArrowLeft' ? -1 : 1
          if (ctlRow === 'seek') seek(timeRef.current + (d < 0 ? -settings.seekBack : settings.seekForward))
          else setCtlIdx((i) => Math.max(0, Math.min(last, Math.min(i, last) + d)))
          poke()
        } else if (e.key === 'ArrowUp') { if (ctlRow === 'buttons') setCtlRow('seek'); poke() }
        else if (e.key === 'ArrowDown') {
          if (ctlRow === 'seek') { setCtlRow('buttons'); poke() }
          else if (showNext && countdown !== null) setCountdown(null)
          else { setCtlRow(null); setControls(false) }
        } else if (e.key === 'Enter' || e.key === ' ') { if (ctlRow === 'seek') toggle(); else acts[cur]?.(); poke() }
        else if (!['k', 'MediaPlayPause', 'm', 'v', 'f', 'n', 'p', 'c', 's', 'j', 'l'].includes(e.key)) return
        else { /* fall through to the shortcuts below */ }
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) { e.preventDefault(); e.stopPropagation(); return }
      }
      switch (e.key) {
        case 'Enter': toggle(); break
        case ' ': case 'k': case 'MediaPlayPause': toggle(); break
        case 'ArrowLeft': case 'j': seek(timeRef.current - settings.seekBack); break
        case 'ArrowRight': case 'l': seek(timeRef.current + settings.seekForward); break
        case 'ArrowUp': case 'ArrowDown': setCtlIdx(0); setCtlRow('buttons'); poke(); break   // bring up the controls and put the remote on them
        case 'm': setMuted((x) => !x); break
        case 'v': if (hasBoost) { setLevelPanel(0); poke() } break
        case 'f': toggleFullscreen(); break
        case 'n': if (next) goNext(); break
        case 'p': if (prev) goPrev(); break
        case 'c': case 's': setPanel({ col: 1, idx: 0 }); break
        default: return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  })

  const pct = duration ? (time / duration) * 100 : 0
  const title = media.type === 'episode' ? media.grandparentTitle : media.title
  const subtitle = media.type === 'episode' ? `${episodeLabel(media)} · ${media.title}` : media.year?.toString()

  return (
    <div data-player className={`fixed inset-0 z-[70] text-white transition-[opacity,transform] duration-700 ease-[cubic-bezier(.65,.05,.25,1)] ${mode === 'native' ? 'bg-transparent' : 'bg-black'} ${revealing ? 'scale-[1.08] opacity-0' : ''}`} onMouseMove={poke} style={{ cursor: controls ? 'default' : 'none' }}
      // The native (mpv) picture is behind the page, so clicks on the picture land here: click = pause/play, double-click = fullscreen.
      onClick={(e) => { if ((panel || levelPanel !== null) && !(e.target as HTMLElement).closest('[data-menu]')) { setPanel(null); setLevelPanel(null); return }
        if (mode !== 'native' || !lifted || closing || (e.target as HTMLElement).closest('button, input, [role=slider], [data-nopause]')) return; toggle() }}
      onDoubleClick={(e) => { if (mode !== 'native' || !lifted || closing || (e.target as HTMLElement).closest('button, input, [role=slider], [data-nopause]')) return; toggleFullscreen() }}>
      {mode !== 'native' && <video ref={video} loop={server.uri === DEMO_URI} className="absolute inset-0 size-full bg-black object-contain" playsInline
        onClick={toggle} onDoubleClick={toggleFullscreen}
        onPlay={() => setPaused(false)} onPause={() => setPaused(true)}
        onWaiting={() => setBuffering(true)} onPlaying={() => setBuffering(false)} onCanPlay={() => { setBuffering(false); setReady(true) }}
        onTimeUpdate={(e) => { const v = e.currentTarget; timeRef.current = v.currentTime; setTime(v.currentTime); if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1)) }}
        onDurationChange={(e) => isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        onVolumeChange={(e) => { setVolume(e.currentTarget.volume); setMuted(e.currentTarget.muted) }}
        onEnded={() => (next && settings.autoplayNext ? goNext() : close())}
        onError={() => fail('This file could not be played.')} />}
      {mode !== 'native' && <VolumeSync video={video} volume={volume} muted={muted} />}

      {/* Loading / error states */}
      {buffering && !error && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          {time === 0 && mode !== 'native' && <img src={imageUrl(server, backdropPath(media), 1280, 720)} alt="" className="absolute inset-0 size-full object-cover opacity-25 blur-sm" />}
          <Loader2 className="relative animate-spin text-white/80" size={52} />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-black/80 px-8 text-center">
          <div><p className="mb-6 text-lg text-white/80">{error}</p>
            <button onClick={close} className="rounded-full bg-white px-6 py-2.5 font-bold text-black">Back</button></div>
        </div>
      )}

      {/* Paused: the picture dims and says so */}
      <div className={`pointer-events-none absolute inset-0 grid place-items-center bg-black/55 transition-opacity duration-300 ${paused && lifted && !closing && !error ? 'opacity-100' : 'opacity-0'}`}>
        <div className="flex flex-col items-center gap-3">
          <span className="grid size-24 place-items-center rounded-full bg-white/15 ring-1 ring-white/25 backdrop-blur"><Pause size={44} fill="currentColor" /></span>
          <span className="text-sm font-bold uppercase tracking-[0.3em] text-white/70">Paused</span>
        </div>
      </div>

      {/* On-screen actions sit above the control bar and answer to the mouse and to OK/Enter */}
      {showSkipIntro && (
        <button onClick={() => seek(intro!.endTimeOffset / 1000)} className="fade-in absolute bottom-60 right-12 z-[25] inline-flex items-center gap-2.5 rounded-xl bg-white px-7 py-3.5 text-[1.05rem] font-bold text-black shadow-2xl ring-4 ring-white/30 transition hover:scale-105 hover:ring-accent active:scale-95">
          <FastForward size={20} fill="currentColor" />Skip intro
        </button>
      )}
      {showSkipCredits && (
        <button onClick={skipCredits} className="fade-in absolute bottom-60 right-12 z-[25] inline-flex items-center gap-2.5 rounded-xl bg-white px-7 py-3.5 text-[1.05rem] font-bold text-black shadow-2xl ring-4 ring-white/30 transition hover:scale-105 hover:ring-accent active:scale-95">
          <FastForward size={20} fill="currentColor" />Skip credits
        </button>
      )}

      {showNext && next && (
        <div data-nopause className="pop absolute bottom-60 right-12 z-[25] w-80 overflow-hidden rounded-2xl bg-[#17171c]/95 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
          <div className="relative aspect-video overflow-hidden"><img src={imageUrl(server, next.thumb, 640, 360)} alt="" className={`size-full object-cover transition-all duration-500 ${settings.hideSpoilers && isSpoilerRisk(next) ? 'scale-125 blur-2xl brightness-75' : ''}`} />
            <div className="absolute inset-0 bg-linear-to-t from-black/80 to-transparent" />
            <div className="absolute bottom-3 left-4 right-4"><div className="text-xs font-bold uppercase tracking-widest text-white/60">Up next{countdown !== null ? ` · ${Math.max(0, countdown)}s` : ''}</div>
              <div className="truncate font-bold">{episodeLabel(next)} · {next.title}</div></div></div>
          <div className="flex gap-2 p-3">
            <button onClick={goNext} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white py-2.5 text-sm font-bold text-black ring-2 ring-white/40 transition hover:scale-[1.04] hover:bg-accent hover:ring-accent active:scale-95"><Play size={15} fill="currentColor" />Play now</button>
            <button onClick={() => setCountdown(null)} className="rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold transition hover:bg-white/25 active:scale-95">Stay</button>
          </div>
        </div>
      )}

      {/* Chrome */}
      <div className={`absolute inset-0 transition-opacity duration-300 ${lifted && !closing && (controls || paused || panel || levelPanel !== null) ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        <div data-nopause className="absolute inset-x-0 top-0 flex items-start gap-4 bg-linear-to-b from-black/80 to-transparent px-8 pb-16 pt-6">
          <button onClick={close} aria-label="Back" className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 backdrop-blur transition hover:bg-white/25"><ArrowLeft size={22} /></button>
          <div className="min-w-0 flex-1 pt-0.5"><div className="truncate text-xl font-bold">{title}</div><div className="truncate text-sm text-white/65">{subtitle}</div></div>
          {plan && <div className={`rounded-full px-3.5 py-1.5 text-xs font-bold ring-1 ${KIND_STYLE[plan.kind]}`}>{plan.summary}</div>}
        </div>

        <div data-nopause className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/90 via-black/50 to-transparent px-8 pb-7 pt-24">
          <SeekBar focused={ctlRow === 'seek'} pct={pct} buffered={duration ? (buffered / duration) * 100 : 0} duration={duration} onSeek={seek} intro={intro} credits={credits} />
          <div className="mt-1.5 flex justify-between text-sm tabular-nums text-white/70"><span>{fmt(time)}</span><span>-{fmt(duration - time)}</span></div>
          <div className="mt-2 flex items-center gap-2">
            <Ctl label={paused ? 'Play' : 'Pause'} onClick={toggle} big focused={cf('play')}>{paused ? <Play size={28} fill="currentColor" /> : <Pause size={28} fill="currentColor" />}</Ctl>
            {prev && <Ctl label="Previous episode" onClick={goPrev} focused={cf('prev')}><SkipBack size={24} /></Ctl>}
            <Ctl label={`Back ${settings.seekBack} seconds`} onClick={acts.back} focused={cf('back')}><span className="relative grid place-items-center"><RotateCcw size={28} /><b className="absolute text-[0.6rem] font-extrabold">{settings.seekBack}</b></span></Ctl>
            <Ctl label={`Forward ${settings.seekForward} seconds`} onClick={acts.fwd} focused={cf('fwd')}><span className="relative grid place-items-center"><RotateCw size={28} /><b className="absolute text-[0.6rem] font-extrabold">{settings.seekForward}</b></span></Ctl>
            <div className="group/vol ml-1 flex items-center">
              <Ctl label="Mute" onClick={() => setMuted((m) => !m)} focused={cf('mute')}>{muted || volume === 0 ? <VolumeX size={24} /> : <Volume2 size={24} />}</Ctl>
              <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} aria-label="Volume"
                onChange={(e) => { setVolume(+e.target.value); setMuted(false) }}
                className="h-1 w-0 cursor-pointer appearance-none overflow-hidden rounded-full bg-white/30 accent-white opacity-0 transition-all group-hover/vol:w-24 group-hover/vol:opacity-100" />
            </div>
            <div className="flex-1" />
            {next && <Ctl label="Next episode" onClick={goNext} focused={cf('next')}><SkipForward size={24} /></Ctl>}
            {hasBoost && <Ctl label="Volume boost" onClick={() => setLevelPanel(levelPanel === null ? 0 : null)} focused={cf('boost')}><span className="relative grid place-items-center"><AudioLines size={24} />{levelActive && <i className="absolute -right-1 -top-1 size-2 rounded-full bg-accent" />}</span></Ctl>}
            <Ctl label="Audio & subtitles" onClick={() => setPanel(panel ? null : { col: 0, idx: 0 })} focused={cf('subs')}><Captions size={26} /></Ctl>
            <Ctl label="Fullscreen" onClick={toggleFullscreen} focused={cf('full')}>{fullscreen ? <Minimize size={24} /> : <Maximize size={24} />}</Ctl>
          </div>
        </div>

        {levelPanel !== null && (
          <div data-nopause data-menu onMouseEnter={() => clearTimeout(menuLeave.current)} onMouseLeave={() => { menuLeave.current = window.setTimeout(() => { setPanel(null); setLevelPanel(null) }, 1000) }} className="pop absolute bottom-32 right-24 w-[24rem] rounded-2xl bg-[#17171c]/95 p-2.5 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
            <div className="px-3 pb-1 pt-1.5 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-white/40">Volume boost</div>
            {levelRows.map((r, i) => (
              <div key={r.label} onMouseEnter={() => setLevelPanel(i)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${levelPanel === i ? 'bg-white text-black' : 'hover:bg-white/10'}`}>
                <button onClick={() => { setLevelPanel(i); r.act() }} className="min-w-0 flex-1 text-left"><span className="block text-sm font-bold">{r.label}</span><span className={`block truncate text-xs ${levelPanel === i ? 'text-black/55' : 'text-white/45'}`}>{r.hint}</span></button>
                {i === boostRow ? (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <button aria-label="Quieter by 1 dB" disabled={typeof level.boost === 'number' && level.boost <= -10} onClick={() => nudgeBoost(-1)} className={`grid size-8 place-items-center rounded-full text-lg font-bold transition active:scale-90 disabled:opacity-30 ${levelPanel === i ? 'bg-black/10 hover:bg-black/20' : 'bg-white/10 hover:bg-white/25'}`}>−</button>
                    <span className="min-w-[4.6rem] text-center text-xs font-bold tabular-nums">{r.value}</span>
                    <button aria-label="Louder by 1 dB" disabled={typeof level.boost === 'number' && level.boost >= 10} onClick={() => nudgeBoost(1)} className={`grid size-8 place-items-center rounded-full text-lg font-bold transition active:scale-90 disabled:opacity-30 ${levelPanel === i ? 'bg-black/10 hover:bg-black/20' : 'bg-white/10 hover:bg-white/25'}`}>+</button>
                  </span>
                ) : (
                  <button onClick={() => { setLevelPanel(i); r.act() }} className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${levelPanel === i ? 'bg-black/10' : 'bg-white/10'} ${r.value === 'On' ? 'text-accent' : ''}`}>{r.value}</button>
                )}
              </div>
            ))}
          </div>
        )}

        {panel && (
          <div data-nopause data-menu onMouseEnter={() => clearTimeout(menuLeave.current)} onMouseLeave={() => { menuLeave.current = window.setTimeout(() => { setPanel(null); setLevelPanel(null) }, 1000) }} className="pop absolute bottom-32 right-8 flex w-[520px] max-w-[92vw] gap-1 rounded-2xl bg-[#17171c]/95 p-3 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
            {[{ t: 'Audio', rows: audio },
              { t: 'Subtitles', rows: [{ id: -1, label: 'Off', on: activeSub === null }, ...subs] }].map((c, col) => (
              <div key={c.t} className="min-w-0 flex-1">
                <div className="px-3 pb-1 pt-1 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-white/40">{c.t}</div>
                {c.rows.map((r, idx) => (
                  <button key={r.id} onClick={() => choose(col as 0 | 1, idx)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors hover:bg-white/10 ${panel.col === col && panel.idx === idx ? 'bg-white text-black hover:bg-white' : ''}`}>
                    <span className="flex-1 truncate">{r.label}</span>{r.on && <Check size={16} className={panel.col === col && panel.idx === idx ? '' : 'text-accent'} />}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* The cinematic cover: black fades in over the UI, holds while the video loads, then lifts */}
      {!lifted || coverOn ? (
        <div className={`pointer-events-none absolute inset-0 z-30 grid place-items-center bg-black transition-opacity ease-in-out ${coverOn ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDuration: `${FADE_MS}ms` }}>
          <Loader2 className={`animate-spin text-white/40 transition-opacity duration-700 ${black && !ready && !closing ? 'opacity-100 delay-[1200ms]' : 'opacity-0'}`} size={40} />
        </div>
      ) : null}
    </div>
  )
}

function VolumeSync({ video, volume, muted }: { video: React.RefObject<HTMLVideoElement | null>; volume: number; muted: boolean }) {
  useEffect(() => { if (video.current) { video.current.volume = volume; video.current.muted = muted } }, [video, volume, muted])
  return null
}

function Ctl({ children, label, onClick, big, focused }: { children: React.ReactNode; label: string; onClick: () => void; big?: boolean; focused?: boolean }) {
  return <button aria-label={label} title={label} onClick={onClick} className={`grid shrink-0 place-items-center rounded-full transition hover:bg-white/15 active:scale-95 ${focused ? 'scale-110 bg-white text-black ring-4 ring-accent/70' : ''} ${big ? 'size-14' : 'size-12'}`}>{children}</button>
}

function SeekBar({ focused, pct, buffered, duration, onSeek, intro, credits }: { focused?: boolean; pct: number; buffered: number; duration: number; onSeek: (t: number) => void; intro?: { startTimeOffset: number; endTimeOffset: number }; credits?: { startTimeOffset: number; endTimeOffset: number } }) {
  const bar = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const at = (e: React.PointerEvent | PointerEvent) => { const r = bar.current!.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) }
  const drag = (e: React.PointerEvent) => {
    onSeek(at(e) * duration)
    const move = (ev: PointerEvent) => onSeek(at(ev) * duration)
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  const mark = (m?: { startTimeOffset: number; endTimeOffset: number }) => m && duration ? { left: `${(m.startTimeOffset / 1000 / duration) * 100}%`, width: `${((m.endTimeOffset - m.startTimeOffset) / 1000 / duration) * 100}%` } : undefined
  return (
    <div ref={bar} role="slider" aria-label="Seek" aria-valuenow={Math.round(pct)} className="group/seek relative flex h-6 cursor-pointer items-center"
      onPointerDown={drag} onPointerMove={(e) => setHover(at(e))} onPointerLeave={() => setHover(null)}>
      <div className={`relative w-full rounded-full bg-white/25 transition-all group-hover/seek:h-1.5 ${focused ? 'h-2 ring-2 ring-white/70' : 'h-1'}`}>
        <div className="absolute inset-y-0 left-0 rounded-full bg-white/30" style={{ width: `${buffered}%` }} />
        {[intro, credits].map((m, i) => mark(m) && <div key={i} className="absolute inset-y-0 rounded-full bg-white/50" style={mark(m)} />)}
        <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${pct}%` }} />
        <div className={`absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-transform group-hover/seek:scale-100 ${focused ? 'scale-125' : 'scale-0'}`} style={{ left: `${pct}%` }} />
      </div>
      {hover !== null && duration > 0 && <div className="pointer-events-none absolute -top-8 -translate-x-1/2 rounded-md bg-black/80 px-2 py-1 text-xs font-semibold tabular-nums" style={{ left: `${hover * 100}%` }}>{fmt(hover * duration)}</div>}
    </div>
  )
}
