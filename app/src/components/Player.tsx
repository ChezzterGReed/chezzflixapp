import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, AudioLines, Captions, SkipBack, Check, FastForward, Loader2, Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, SkipForward, Volume2, VolumeX, Ellipsis } from 'lucide-react'
import { pause as pauseNav, resume as resumeNav } from '@noriginmedia/norigin-spatial-navigation'
import { findVersions, lighterThan, type Version } from '../lib/versions'
import { Clock } from './Clock'
import { setNowPlaying, setPlayback, startNowPlaying, type MediaKey } from '../lib/nowPlaying'
import { StallOffer } from './StallOffer'
import { VolumePill } from './VolumePill'
import { queueNeighbors } from '../lib/shuffleQueue'
import { saveResume } from '../lib/resume'
import { activeProfile } from '../lib/profile'
import { useStillWatching } from '../lib/stillWatching'
import { StillWatching } from './StillWatching'
import { getTrackPref, pickTracks, saveTrackPref, webChoice } from '../lib/trackPrefs'
import { planPlayback, streamsOf, type PlaybackPlan, type TrackChoice } from '../lib/playback'
import { backdropPath, DEMO_URI, directPlayUrl, episodeLabel, getNextEpisode, getPreviousEpisode, imageUrl, isSpoilerRisk, reportProgress, stopTranscode, type PlexMedia, type PlexServer } from '../lib/plex'
import { applySubStyle, isAndroid, keepAwake, mpvCmd, mpvSet, mpvTracks, nativeStart, onMpv, setExternalSubs, setNativeVideoActive, type MpvTrack } from '../lib/native'
import { NextMovies } from './NextMovies'
import { useBack } from '../lib/back'
import { useSettings } from '../lib/settings'
import { clampBoost, dbLabel, MAX_BOOST, MIN_BOOST, useLevelEngine } from '../lib/leveling'

const HOLD_START_MS = 450   // a fast-forward / rewind key held this long starts gliding
const HOLD_STEP_MS = 2000   // holding a fast-forward / rewind key: how long at each speed before the next
const SPEEDS = [0.5, 0.75, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2, 2.5, 3]
const SLEEPS: (number | 'episode' | null)[] = [null, 15, 30, 45, 60, 90, 'episode']   // minutes, or "when this episode ends"
const QUALITIES: { kbps: number | null; label: string }[] = [   // each resolution is tied to a typical bitrate for that picture size
  { kbps: null, label: 'Original' }, { kbps: 3000, label: '1080p' }, { kbps: 1500, label: '720p' }, { kbps: 700, label: '360p' }, { kbps: 350, label: '240p' },
]
const sleepLabel = (v: number | 'episode' | null) => (v === null ? 'Off' : v === 'episode' ? 'End of episode' : `${v} min`)

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(sec).padStart(2, '0')}`
}

const KIND_STYLE = { direct: 'bg-emerald-400/20 text-emerald-300 ring-emerald-300/30', stream: 'bg-sky-400/20 text-sky-300 ring-sky-300/30', transcode: 'bg-amber-400/20 text-amber-300 ring-amber-300/30' }

interface Props { server: PlexServer; media: PlexMedia; /** `home`: closed because nobody answered "Are you still watching?" */ onClose: (home?: boolean) => void; onPlayNext: (m: PlexMedia) => void; /** Swap to another version of the same title (already positioned to resume). */ onSwitch: (m: PlexMedia) => void }

/** A credits marker that ends at least this many seconds before the end of the file means something plays after the credits. */
const SCENE_GAP = 12

// Set when one episode hands over to the next, so the new player starts already black instead of flashing the app UI.
let continuing = false
const FADE_MS = 650   // fade to black / fade back
const IRIS_MS = 950   // the exit: the app grows back over the video
const BEAT_MS = 900   // time held in black while the video loads

export function Player({ server, media, onClose: finishClose, onPlayNext, onSwitch }: Props) {
  const { settings, update } = useSettings()
  const [stylePanel, setStylePanel] = useState<number | null>(null)   // row highlighted in the subtitle-style menu (null = closed)
  const [levelPanel, setLevelPanel] = useState<number | null>(null)   // row highlighted in the volume menu (null = closed)
  const [loadedTick, setLoadedTick] = useState(0)
  const video = useRef<HTMLVideoElement>(null)
  const hls = useRef<{ destroy: () => void } | null>(null)
  const timeRef = useRef(0)
  // Start from what you chose last time on this show (web player); the native player applies it once the file loads.
  const [choice, setChoice] = useState<TrackChoice>(() => webChoice(media, streamsOf(media, 2), streamsOf(media, 3)))
  const [plan, setPlan] = useState<PlaybackPlan>()
  const planRef = useRef<PlaybackPlan | undefined>(undefined); planRef.current = plan
  const [error, setError] = useState<string>()
  const [buffering, setBuffering] = useState(true)
  const [paused, setPausedState] = useState(true)
  const setPaused = (v: boolean) => { pausedRef.current = v; setPausedState(v) }
  // No dimming or sleeping while it plays (a paused video may dim, like anywhere else).
  useEffect(() => { keepAwake(!paused) }, [paused])
  useEffect(() => () => { keepAwake(false) }, [])
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
  const [suggest, setSuggest] = useState(false)   // the "what to watch next" screen after a movie
  const suggestRef = useRef(false); suggestRef.current = suggest
  const [stayed, setStayed] = useState(false)   // "Stay" was chosen on the Up Next card: hide it and don't move on by itself
  useEffect(() => { setStayed(false) }, [media.ratingKey])
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
  const homeRef = useRef(false)
  const bufferingRef = useRef(true)
  const lastSeek = useRef(0)
  const stalls = useRef<{ at: number; ms: number }[]>([])
  const stallStart = useRef(0)
  const offered = useRef(false)
  const [offer, setOffer] = useState(false)
  const [versions, setVersions] = useState<Version[]>([])
  const { asking: askingStill, confirm: stillHere } = useStillWatching(!paused && ready && !closing)
  const exitStyle = useRef<'none' | 'iris' | 'fade'>('none')
  const volumeRef = useRef(1)
  const [revealing, setRevealing] = useState(false)
  const engaged = useRef(false)
  const nativeGaveUp = useRef(false)
  // 'native' = embedded libmpv (desktop app): plays the original file, whatever the format. 'web' = <video> + Plex remux fallback.
  const [mode, setMode] = useState<'pending' | 'native' | 'web'>('pending')
  const [nTracks, setNTracks] = useState<MpvTrack[]>([])
  const reloadTracks = useCallback(() => { mpvTracks().then(setNTracks).catch(() => {}) }, [])
  const endedRef = useRef<() => void>(() => {})
  const pausedRef = useRef(false)
  // A transcode started part-way in (Plex starts the stream at an offset): mpv's clock counts from there, so this is added back to show the real time.
  const tBase = useRef(0)

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
    if (planRef.current && planRef.current.url !== p.url) stopTranscode(server, planRef.current.url)
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
    // Audio / subtitle choices remembered for this show (applied twice: embedded tracks right away, sidecar subtitles a moment later).
    const applyPrefs = async (tries = 0): Promise<void> => {
      const pref = getTrackPref(media)
      try {
        const tracks = await mpvTracks()
        if (!tracks.length && tries < 3) { await new Promise((r) => setTimeout(r, 500)); return applyPrefs(tries + 1) }
        const pick = pickTracks(tracks, pref)
        if (pick.aid !== undefined) await mpvSet('aid', pick.aid)
        if (pick.sid !== undefined) await mpvSet('sid', pick.sid)
        refreshTracks()
      } catch { /* keep the file's defaults */ }
    }
    onMpv((p) => {
      const n = typeof p.value === 'number' ? p.value : undefined
      switch (p.name) {
        case 'time-pos': if (n !== undefined && !scrubbing.current) { const t = n + tBase.current; timeRef.current = t; setTime(t); setReady(true) } break
        case 'duration': if (n) setDuration(n + tBase.current); break
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
        applyPrefs(); setTimeout(applyPrefs, 1100)
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
      // (Opened again after the app was closed while paused: stay paused.)
      if (!error && !media.resumePaused) { if (mode === 'native') mpvSet('pause', 'no').catch(() => {}); else video.current?.play().catch(() => setPaused(true)) }
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
      setTimeout(() => finishClose(homeRef.current), IRIS_MS + 60)
    } else {
      exitStyle.current = 'fade'
      setRevealing(true) // the web player eases away over the app, which is already underneath
      setTimeout(() => finishClose(homeRef.current), 720)
    }
  }, [mode, finishClose])

  // A movie ending (or its credits skipped): offer what to watch next, if that's switched on; otherwise just leave.
  const finish = useCallback(() => {
    if (media.type === 'movie' && settings.movieSuggestions && !closingRef.current) {
      if (mode === 'native') mpvSet('pause', 'yes').catch(() => {}); else video.current?.pause()
      setSuggest(true)
    } else close()
  }, [media.type, settings.movieSuggestions, mode, close])
  useEffect(() => () => { hls.current?.destroy(); if (video.current) { video.current.removeAttribute('src'); video.current.load() } }, [])

  // ----- progress reporting -----
  useEffect(() => {
    if (media.type === 'clip') return   // (a trailer or extra: nothing to remember)
    const t = setInterval(() => { if (timeRef.current > 0) reportProgress(server, media, (mode === 'native' ? pausedRef.current : video.current?.paused) ? 'paused' : 'playing', timeRef.current * 1000) }, 10_000)
    return () => { clearInterval(t); reportProgress(server, media, 'stopped', timeRef.current * 1000); stopTranscode(server, planRef.current?.url) }
  }, [server, media, mode])

  // ----- next episode lookup -----
  // (a shuffle in progress decides what comes next and before)
  useEffect(() => {
    const q = queueNeighbors(media)
    if (q) { setNext(q.next); setPrev(q.prev); return }
    getNextEpisode(server, media).then(setNext).catch(() => setNext(null)); getPreviousEpisode(server, media).then(setPrev).catch(() => setPrev(null))
  }, [server, media])

  // Volume boost: auto leveling + dialogue boost + a manual amount, all adjustable while watching (see lib/leveling.ts).
  const level = useLevelEngine({ active: mode === 'native', loaded: loadedTick, media, autoLevel: settings.autoLevel, dialogueBoost: settings.dialogueBoost && !isAndroid, scanQuiet: !settings.quietHintOff })
  // If the app is closed behind your back (a TV drops it from memory after a while), remember what was playing and where, so it can be picked up again.
  useEffect(() => {
    if (server.uri === DEMO_URI) return
    const save = () => {
      if (closingRef.current || !liftedRef.current) return
      const t = timeRef.current
      if (t < 10 || (duration && t > duration - 60)) return   // barely started, or nearly over: nothing worth coming back to
      saveResume({ ratingKey: media.ratingKey, versionIndex: media.versionIndex, offsetMs: Math.round(t * 1000), paused: pausedRef.current, at: Date.now(), profile: activeProfile() })
    }
    const iv = setInterval(save, 5000)
    const hide = () => { if (document.hidden) save() }
    document.addEventListener('visibilitychange', hide); window.addEventListener('pagehide', save)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', save) }
  }, [media.ratingKey, media.versionIndex, duration, server.uri])

  // Other versions of this title (other qualities, other libraries): used to suggest a lighter one if playback keeps stalling.
  useEffect(() => { findVersions(server, media).then(setVersions).catch(() => {}) }, [server, media])
  const lighter = useMemo(() => lighterThan(versions, media), [versions, media])
  bufferingRef.current = buffering
  useEffect(() => {
    if (!lighter || offered.current) return
    const t = setInterval(() => {
      const now = Date.now()
      if (!liftedRef.current || closingRef.current || pausedRef.current) { stallStart.current = 0; return }
      if (bufferingRef.current) { if (!stallStart.current && now - lastSeek.current > 5000) stallStart.current = now }   // (waiting after a seek is normal)
      else if (stallStart.current) { const ms = now - stallStart.current; stallStart.current = 0; if (ms > 1500) stalls.current.push({ at: now, ms }) }
      stalls.current = stalls.current.filter((x) => now - x.at < 180_000)
      const ongoing = stallStart.current ? now - stallStart.current : 0
      const total = stalls.current.reduce((a, x) => a + x.ms, ongoing)
      if (stalls.current.length >= 3 || total >= 20_000 || ongoing >= 12_000) { offered.current = true; setOffer(true) }   // 3 stalls in 3 minutes, or a long wait
    }, 1000)
    return () => clearInterval(t)
  }, [lighter])
  const modalOpen = (askingStill || offer) && !closing
  const modalRef = useRef(false); modalRef.current = modalOpen
  useEffect(() => { if (modalOpen) { resumeNav(); return () => pauseNav() } }, [modalOpen])

  // ----- keep spatial-nav out of the way; the player owns the keys -----
  useEffect(() => { pauseNav(); return () => resumeNav() }, [])
  useBack(() => { if (level.note?.kind === 'offer') level.declineOffer(); else if (level.note) level.closeNote(); else if (stylePanel !== null) setStylePanel(null); else if (morePanel !== null) setMorePanel(null); else if (sleepDone) { setSleepDone(false); close() } else if (panel) setPanel(null); else if (levelPanel !== null) setLevelPanel(null); else if (ctlRow) { setCtlRow(null); setControls(false) } else close() })
  useEffect(() => { poke(); return () => clearTimeout(idle.current) }, [poke])

  const seek = useCallback((t: number) => {
    lastSeek.current = Date.now()
    const target = Math.max(0, Math.min(duration || t, t))
    if (mode === 'native') {
      // (a transcode that started part-way in can't seek before its start: that restarts it from the new spot)
      if (qLoaded.current !== 0 && target < tBase.current) restartStream(target)
      else mpvCmd('seek', target - tBase.current, 'absolute').catch(() => {})
    } else { const v = video.current; if (v) v.currentTime = target }
    poke()
  }, [duration, poke, mode]) // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = useCallback(() => {
    if (trick.current) { stopTrickRef.current(true); return }   // Play while gliding: back to normal speed
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

  // ----- the "more" menu: playback speed, a sleep timer, and a quality for right now (never remembered: the next title plays as the original again) -----
  const [morePanel, setMorePanel] = useState<number | null>(null)
  const [speed, setSpeedState] = useState(1)
  const [sleepIdx, setSleepIdx] = useState(0)
  const [sleepDone, setSleepDone] = useState(false)   // the timer ran out: paused, waiting to hear whether you are still there
  const [qIdx, setQIdx] = useState(0)
  const qLoaded = useRef(0)
  const sleepTimer = useRef(0)
  const volNow = useRef(1); volNow.current = volume
  const sleepEp = SLEEPS[sleepIdx] === 'episode'
  const cycle = (len: number, at: number, d: number) => (at + d + len) % len
  const moreRows = [
    { label: 'Playback speed', hint: 'The voices keep their pitch', value: `${speed}×`, step: (d: number) => setSpeedState(SPEEDS[cycle(SPEEDS.length, Math.max(0, SPEEDS.indexOf(speed)), d)]) },
    { label: 'Sleep timer', hint: 'Fades the sound out, then pauses', value: sleepLabel(SLEEPS[sleepIdx]), step: (d: number) => setSleepIdx((i) => cycle(SLEEPS.length, i, d)) },
    { label: 'Quality', hint: 'Just for now. The next title plays as the original again', value: QUALITIES[qIdx].label, step: (d: number) => setQIdx((i) => cycle(QUALITIES.length, i, d)) },
  ]
  useEffect(() => {
    if (mode === 'native') mpvSet('speed', speed).catch(() => {})
    else { const v = video.current; if (v) { v.defaultPlaybackRate = speed; v.playbackRate = speed } }
  }, [speed, mode, plan, loadedTick])
  const pauseNow = () => { if (mode === 'native') mpvSet('pause', true).catch(() => {}); else video.current?.pause(); setPaused(true) }
  const sleepNow = useCallback(async () => {
    const v0 = volNow.current
    for (let i = 1; i <= 10; i++) { setVolume(v0 * (1 - i / 10)); await new Promise((r) => setTimeout(r, 450)) }
    pauseNow(); setVolume(v0); setSleepIdx(0); setSleepDone(true); setCtlRow(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])
  useEffect(() => {
    clearTimeout(sleepTimer.current)
    const s = SLEEPS[sleepIdx]
    if (typeof s !== 'number') return
    sleepTimer.current = window.setTimeout(() => { void sleepNow() }, s * 60_000)
    return () => clearTimeout(sleepTimer.current)
  }, [sleepIdx, sleepNow])
  const wakeFromSleep = () => { setSleepDone(false); if (mode === 'native') mpvSet('pause', false).catch(() => {}); else video.current?.play().catch(() => {}); setPaused(false) }
  // ----- fast-forward / rewind, like a TV: holding the key starts a smooth glide at one speed (a fast-forward icon); each further press of the same
  // direction goes faster (one more triangle each time, up to three steps); the opposite direction slows it a step at a time, back to normal playing; Play ends it -----
  const scrubbing = useRef(false)
  const trick = useRef<{ dir: 1 | -1; level: number; pos: number; last: number; applied: number; wasPlaying: boolean; levelAt: number } | null>(null)
  const [trickUi, setTrickUi] = useState<{ dir: 1 | -1; level: number; speed: number } | null>(null)
  const trickTimer = useRef(0)
  const seekRef = useRef(seek); seekRef.current = seek
  const durRef = useRef(duration); durRef.current = duration
  /** Seconds of video per second at each step. The top step is a little beyond what holding a key used to reach. */
  const trickSpeed = (level: number) => { const total = durRef.current || 3600; return level <= 1 ? 10 : level === 2 ? Math.round(Math.max(30, Math.min(70, total / 110))) : Math.round(Math.max(120, Math.min(400, total / 20))) }
  const resumePlay = () => { if (mode === 'native') mpvSet('pause', false).catch(() => {}); else video.current?.play().catch(() => {}); setPaused(false) }
  const stopTrick = (resume: boolean) => {
    const c = trick.current
    if (!c) return
    clearInterval(trickTimer.current); trick.current = null; setTrickUi(null)
    seekRef.current(c.pos)
    scrubbing.current = false
    if (resume || c.wasPlaying) resumePlay()
    poke()
  }
  const stopTrickRef = useRef(stopTrick); stopTrickRef.current = stopTrick
  const startTrick = (dir: 1 | -1) => {
    const c = trick.current = { dir, level: 1, pos: timeRef.current, last: performance.now(), applied: 0, wasPlaying: !pausedRef.current, levelAt: performance.now() }
    scrubbing.current = true
    if (c.wasPlaying) pauseNow()   // (the picture follows the playhead while it moves, without the sound chopping)
    setTrickUi({ dir, level: 1, speed: trickSpeed(1) })
    trickTimer.current = window.setInterval(() => {
      const t = trick.current
      if (!t) return
      const now = performance.now(), dt = (now - t.last) / 1000
      t.last = now
      const total = durRef.current || 3600
      t.pos = Math.max(0, Math.min(Math.max(0, total - 2), t.pos + t.dir * trickSpeed(t.level) * dt))
      timeRef.current = t.pos; setTime(t.pos); poke()
      if (now - t.applied > 240) { t.applied = now; seekRef.current(t.pos) }
      // The key is still down in the direction of travel: move up a step every couple of seconds, up to the top.
      const h = heldKey.current
      if (h && h.dir === t.dir) {
        if (h.sawRepeat && now - h.last > 700) clearHeld()   // (the repeats stopped, so it was let go)
        else if (t.level < 3 && now - t.levelAt >= HOLD_STEP_MS) { t.level++; t.levelAt = now; setTrickUi({ dir: t.dir, level: t.level, speed: trickSpeed(t.level) }) }
      }
      if ((t.dir > 0 && t.pos >= total - 2) || (t.dir < 0 && t.pos <= 0)) stopTrick(true)   // reached an end: carry on playing from there
    }, 60)
  }
  // Is a fast-forward / rewind key held down right now? Known from the key coming up (or, on remotes that repeat, from the repeats stopping).
  const heldKey = useRef<{ dir: 1 | -1; last: number; sawRepeat: boolean; timer: number } | null>(null)
  const clearHeld = () => { if (heldKey.current) { clearTimeout(heldKey.current.timer); heldKey.current = null } }
  const releaseKey = (dir: 1 | -1) => { if (heldKey.current?.dir === dir) clearHeld() }
  /** One press of a direction key (or the remote's fast-forward / rewind button). Holding it past a moment starts the glide. */
  const press = (dir: 1 | -1, e: KeyboardEvent) => {
    const now = performance.now()
    if (e.repeat) {   // (a remote that sends repeats while held)
      const h = heldKey.current
      if (h && h.dir === dir) { h.last = now; h.sawRepeat = true }
      else if (!h) { heldKey.current = { dir, last: now, sawRepeat: true, timer: 0 }; if (!trick.current) startTrick(dir) }
      return
    }
    clearHeld()
    const t = trick.current
    if (t) {
      const level = dir === t.dir ? Math.min(3, t.level + 1) : t.level - 1
      if (level <= 0) { stopTrick(true); return }   // slowed all the way: back to normal playing
      t.level = level; t.levelAt = now; setTrickUi({ dir: t.dir, level, speed: trickSpeed(level) })
    } else seek(timeRef.current + (dir > 0 ? settings.seekForward : -settings.seekBack))   // a tap: step
    const h = heldKey.current = { dir, last: now, sawRepeat: false, timer: 0 }
    // Still down after a moment: it is a hold, so glide (this works whether or not the remote repeats the key).
    if (!trick.current) h.timer = window.setTimeout(() => { if (heldKey.current === h && !trick.current) startTrick(dir) }, HOLD_START_MS)
  }
  useEffect(() => () => { clearInterval(trickTimer.current); clearHeld() }, [])
  useEffect(() => {
    const up = (e: KeyboardEvent) => {
      const d = e.key === 'ArrowRight' || e.key === 'l' || e.key === 'MediaFastForward' ? 1 : e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'MediaRewind' ? -1 : 0
      if (d) releaseKey(d as 1 | -1)
    }
    window.addEventListener('keyup', up, true)
    return () => window.removeEventListener('keyup', up, true)
  })

  // A different quality: reload the same spot (a transcode capped at that bitrate, or back to the original file). Waits a moment so stepping through the list doesn't reload at every step.
  const startStream = (kbps: number | null, at: number) => {
    fallbackStep.current = 'none'
    stopTranscode(server, planRef.current?.url)   // the stream being replaced is finished with
    if (mode === 'native') {
      if (kbps === null) {
        const url = directPlayUrl(server, media)
        if (!url) return
        tBase.current = 0
        setPlan({ kind: 'direct', url, hls: false, summary: 'Direct Play', reason: '' })
        setBuffering(true)
        mpvCmd('loadfile', url, 'replace', '-1', `start=${at > 1 ? at : 0},pause=${pausedRef.current ? 'yes' : 'no'}`).catch((e) => setError(String(e)))
      } else {
        // The same kind of request the in-app (web) player makes, starting the stream at the right spot.
        const p = planPlayback(server, media, choice, undefined, kbps)
        const u = new URL(p.url); u.searchParams.set('offset', String(Math.floor(at))); u.searchParams.set('session', crypto.randomUUID())
        tBase.current = Math.floor(at)
        setPlan({ ...p, url: u.toString() })
        setBuffering(true)
        mpvCmd('loadfile', u.toString(), 'replace', '-1', `pause=${pausedRef.current ? 'yes' : 'no'}`).catch((e) => setError(String(e)))
      }
    } else load(planPlayback(server, media, choice, undefined, kbps ?? undefined), at)
  }
  const restartStream = (at: number) => startStream(QUALITIES[qLoaded.current].kbps, at)
  useEffect(() => {
    if (mode === 'pending' || qIdx === qLoaded.current) return
    const t = setTimeout(() => { qLoaded.current = qIdx; startStream(QUALITIES[qIdx].kbps, timeRef.current) }, 1100)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qIdx, mode])

  // Subtitle look (plain-text subtitles; styled .ass ones keep their own).
  useEffect(() => { if (mode === 'native') applySubStyle(settings).catch(() => {}) }, [mode, loadedTick, settings.subSize, settings.subFont, settings.subColor, settings.subEdge, settings.subBackground])
  // Manual boost: from Auto, the first press starts from the boost currently in effect, then moves 1 dB at a time (-10 to +15).
  const nudgeBoost = (d: 1 | -1) => level.setBoost(clampBoost((level.boost === 'auto' ? Math.round(level.gain) : level.boost) + d))
  const allLevelRows = [
    { label: 'Auto leveling', value: settings.autoLevel ? 'On' : 'Off', hint: 'Measures the title, holds one steady boost', act: () => update({ autoLevel: !settings.autoLevel }) },
    { label: 'Dialogue boost', value: settings.dialogueBoost ? 'On' : 'Off', hint: 'Lifts voices in surround audio', act: () => update({ dialogueBoost: !settings.dialogueBoost }) },
    { label: 'Re-run auto adjust', value: 'Run', hint: 'Listen to this title again and pick a new boost', act: () => { if (level.boost !== 'auto') level.setBoost('auto'); if (!settings.autoLevel) update({ autoLevel: true }); level.remeasure(); setLevelPanel(null) } },
    { label: 'Boost', value: level.boost === 'auto' ? (settings.autoLevel && level.gain ? `Auto · ${dbLabel(Math.round(level.gain))}` : 'Auto') : dbLabel(level.boost), hint: level.boost === 'auto' ? 'Use − and + to set it yourself' : 'Set by you · press OK for Auto', act: () => level.setBoost('auto') },
  ]
  const levelRows = isAndroid ? [allLevelRows[0], allLevelRows[2], allLevelRows[3]] : allLevelRows   // (no dialogue boost on Android); the boost row is always the last one
  const boostRow = levelRows.length - 1
  const noteShown = useRef(level.note); if (level.note) noteShown.current = level.note   // keeps the last text while it fades out
  const [pill, setPill] = useState(-1)   // remote/keyboard: which pill button is highlighted (-1: none yet, press OK to start)
  const noteKind = level.note?.kind
  const pillOpen = noteKind === 'applied'   // (the "Boost applied" pill is the one the remote can step into; "Auto-adjusting" is mouse / touch only, and Back closes it)
  const pillIds = noteKind === 'applied' ? ['revert', 'minus', 'plus', 'dismiss', 'disable'] : noteKind === 'offer' ? ['yes', 'no'] : noteKind === 'measuring' ? ['dismiss', 'disable'] : []
  const pillAct = (id: string) => {
    if (id === 'revert') level.revertNote()
    else if (id === 'minus') level.adjustNote(-1)
    else if (id === 'plus') level.adjustNote(1)
    else if (id === 'yes') { level.acceptOffer(); if (!settings.autoLevel) update({ autoLevel: true }) }   // (accepting turns Auto volume leveling on)
    else if (id === 'no') level.declineOffer()
    else if (id === 'dismiss') level.closeNote()
    else { update({ autoLevel: false }); level.closeNote() }   // Disable: auto leveling off everywhere; whatever boost is playing glides back to normal
  }
  useEffect(() => { setPill(-1) }, [noteKind])
  const levelActive = (settings.autoLevel || (!isAndroid && settings.dialogueBoost)) || (typeof level.boost === 'number' && level.boost !== 0)

  // A scene after the credits: the credits marker ends well before the file does. Then the credits can be skipped to the scene,
  // and "Up next" waits until the scene has played (otherwise the next episode would cut it off).
  const scene = settings.waitForScenes && !!credits && duration > 0 && credits.endTimeOffset / 1000 < duration - SCENE_GAP
  const showNext = !!next && !stayed && !sleepEp && duration > 0 && time > (scene ? duration - 15 : credits ? credits.startTimeOffset / 1000 + 3 : duration - 30)
  const goNext = useCallback(() => { if (next) fadeOut(() => { continuing = true; onPlayNext(next) }) }, [next, onPlayNext, fadeOut])
  const goPrev = useCallback(() => { if (prev) fadeOut(() => { continuing = true; onPlayNext(prev) }) }, [prev, onPlayNext, fadeOut])
  endedRef.current = () => (sleepEp ? close() : next && settings.autoplayNext && !stayed ? goNext() : finish())

  // Now Playing / media keys: what is on, and the keys, headphone buttons and lock-screen controls reaching this player.
  const mediaKey = useRef<(k: MediaKey) => void>(() => {})
  mediaKey.current = (k) => {
    switch (k.key) {
      case 'toggle': toggle(); break
      case 'play': if (pausedRef.current) toggle(); break
      case 'pause': if (!pausedRef.current) toggle(); break
      case 'next': if (next) goNext(); break
      case 'previous': if (prev) goPrev(); else seek(0); break
      case 'seekBy': seek(timeRef.current + (k.secs ?? 0)); break
      case 'seekTo': seek(k.secs ?? 0); break
      case 'stop': close(); break
    }
  }
  useEffect(() => {
    let stop: (() => void) | undefined, dead = false
    startNowPlaying((k) => mediaKey.current(k)).then((f) => { if (dead) f(); else stop = f })
    return () => { dead = true; stop?.() }
  }, [])
  useEffect(() => {
    const show = media.type === 'episode' ? media.grandparentTitle ?? media.title : media.title
    const art = media.type === 'episode' ? media.grandparentThumb ?? media.thumb : media.thumb
    setNowPlaying({ title: media.type === 'episode' ? media.title : show ?? media.title, subtitle: media.type === 'episode' ? `${show} · ${episodeLabel(media)}` : media.year?.toString(), artwork: art ? imageUrl(server, art, 512, 512) : undefined, duration: (media.duration ?? 0) / 1000 })
  }, [media.ratingKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPlayback(paused ? 'paused' : 'playing', timeRef.current, duration) }, [paused, duration]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(() => setPlayback(pausedRef.current ? 'paused' : 'playing', timeRef.current, duration), 5000); return () => clearInterval(t) }, [duration])

  // Up Next countdown (only if autoplay is on)
  useEffect(() => {
    if (!showNext || !settings.autoplayNext) return setCountdown(null)
    setCountdown((c) => c ?? settings.nextCountdown)
    const t = setInterval(() => setCountdown((c) => (c === null ? null : c - 1)), 1000)
    return () => clearInterval(t)
  }, [showNext, settings.autoplayNext, settings.nextCountdown])
  useEffect(() => { if (countdown !== null && countdown <= 0) goNext() }, [countdown, goNext])

  // Skip credits (when there's no next episode to hand over to: movies and series finales)
  const inCredits = !!credits && duration > 0 && time >= credits.startTimeOffset / 1000 && time < credits.endTimeOffset / 1000
  const skipCredits = useCallback(() => {
    if (!credits) return
    const end = credits.endTimeOffset / 1000
    if (!duration || end >= duration - 5) finish(); else seek(end)
  }, [credits, duration, finish, seek])
  const showSkipCredits = inCredits && (!next || scene)
  // Skip intro
  const inIntro = !!intro && time >= intro.startTimeOffset / 1000 && time < intro.endTimeOffset / 1000
  useEffect(() => { if (inIntro && settings.autoSkipIntro && intro) seek(intro.endTimeOffset / 1000) }, [inIntro, settings.autoSkipIntro, intro, seek])
  const showSkipIntro = inIntro && !settings.autoSkipIntro && !!intro
  // What OK/Enter does when an on-screen button is showing (otherwise it pauses): Skip intro, Skip credits, or Play now on Up Next.
  const primary: (() => void) | null = sleepDone ? wakeFromSleep : showSkipIntro ? () => seek(intro!.endTimeOffset / 1000) : showSkipCredits ? skipCredits : showNext && next ? goNext : null

  // ----- tracks -----
  const choose = (col: 0 | 1, idx: number) => {
    if (col === 1 && idx === subs.length + 1) { setPanel(null); setStylePanel(0); return }   // "Subtitle style…"
    if (mode === 'native') {
      // The player applies a track change a moment later, so re-read the list a few times until it shows the new choice.
      const reread = () => [0, 350, 1000].forEach((ms) => setTimeout(reloadTracks, ms))
      if (col === 0) { mpvSet('aid', audio[idx].id).then(reread).catch(() => {}); const t = nTracks.find((x) => x.type === 'audio' && x.id === audio[idx].id); if (t) saveTrackPref(media, { audio: { lang: t.lang, title: t.title } }) }
      else {
        mpvSet('sid', idx === 0 ? 'no' : subs[idx - 1].id).then(reread).catch(() => {})
        const t = idx === 0 ? undefined : nTracks.find((x) => x.type === 'sub' && x.id === subs[idx - 1].id)
        saveTrackPref(media, { sub: idx === 0 ? 'off' : { lang: t?.lang, title: t?.title, forced: t?.forced } })   // for the rest of this show's episodes
      }
    } else if (col === 0) { setChoice((c) => ({ ...c, audioId: audio[idx].id })); const s = plexAudio.find((x) => x.id === audio[idx].id); if (s) saveTrackPref(media, { audio: { lang: s.languageCode ?? s.language, title: s.displayTitle } }) }
    else {
      setChoice((c) => ({ ...c, subtitleId: idx === 0 ? null : subs[idx - 1].id }))
      const s = idx === 0 ? undefined : plexSubs.find((x) => x.id === subs[idx - 1].id)
      saveTrackPref(media, { sub: idx === 0 ? 'off' : { lang: s?.languageCode ?? s?.language, title: s?.displayTitle, forced: s?.forced } })
    }
    setPanel(null)
  }
  // Subtitle look, adjustable while watching (same settings as Settings → Playback).
  const styleRows = [
    { label: 'Size', key: 'subSize', opts: [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large'], ['huge', 'Huge']] },
    { label: 'Font', key: 'subFont', opts: [['sans', 'Sans'], ['serif', 'Serif'], ['mono', 'Mono']] },
    { label: 'Colour', key: 'subColor', opts: [['white', 'White'], ['yellow', 'Yellow']] },
    { label: 'Edge', key: 'subEdge', opts: [['outline', 'Outline'], ['shadow', 'Shadow'], ['none', 'None']] },
    { label: 'Background box', key: 'subBackground', opts: [[false, 'Off'], [true, 'On']] },
  ] as const
  const styleValue = (i: number) => { const r = styleRows[i]; return (r.opts as readonly (readonly [unknown, string])[]).find((o) => o[0] === (settings as unknown as Record<string, unknown>)[r.key])?.[1] ?? '' }
  const stepStyle = (i: number, d: 1 | -1) => {
    const r = styleRows[i], opts = r.opts as readonly (readonly [unknown, string])[]
    const at = Math.max(0, opts.findIndex((o) => o[0] === (settings as unknown as Record<string, unknown>)[r.key]))
    update({ [r.key]: opts[(at + d + opts.length) % opts.length][0] } as Partial<typeof settings>)
  }
  const activeSub = subs.find((r) => r.on)?.id ?? null
  useEffect(() => { if (panel && mode === 'native') reloadTracks() }, [!!panel, mode, reloadTracks])   // opening the menu shows what's really selected

  // ----- the control bar, in order, for remote navigation -----
  const hasBoost = mode === 'native' || location.search.includes('levels')
  const order = ['play', ...(prev ? ['prev'] : []), 'back', 'fwd', 'mute', ...(next ? ['next'] : []), ...(hasBoost ? ['boost'] : []), 'subs', 'more', 'full']
  const acts: Record<string, () => void> = {
    play: toggle, prev: goPrev, next: goNext, mute: () => setMuted((m) => !m), full: toggleFullscreen,
    back: () => seek(timeRef.current - settings.seekBack), fwd: () => seek(timeRef.current + settings.seekForward),
    boost: () => setLevelPanel(levelPanel === null ? 0 : null), subs: () => setPanel(panel ? null : { col: 0, idx: 0 }),
    more: () => { setPanel(null); setLevelPanel(null); setStylePanel(null); setMorePanel(morePanel === null ? 0 : null) },
  }
  const cur = order[Math.min(ctlIdx, order.length - 1)]
  const cf = (id: string) => ctlRow === 'buttons' && cur === id

  // Menus (audio & subtitles, volume) close by themselves after a few idle seconds.
  useEffect(() => {
    if (!panel && levelPanel === null && stylePanel === null && morePanel === null) return
    const t = setTimeout(() => { setPanel(null); setLevelPanel(null); setStylePanel(null); setMorePanel(null) }, stylePanel !== null || morePanel !== null ? 12000 : 5000)   // longer while adjusting
    return () => clearTimeout(t)
  }, [panel, levelPanel, stylePanel, morePanel, panelTick])
  const menuLeave = useRef<number>(0)

  // ----- keyboard / remote -----
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || suggestRef.current || modalRef.current) return   // (the "what next" screen has its own navigation)
      // The remote's fast-forward / rewind buttons: a tap steps, holding glides (and speeds up).
      const mk = e.key === 'MediaFastForward' ? 1 : e.key === 'MediaRewind' ? -1 : 0
      if (mk) { press(mk, e); poke(); e.preventDefault(); e.stopPropagation(); return }
      // The "Boost applied" pill: OK starts adjusting it, then Left/Right pick Revert / − / +, OK presses, Back closes (see useBack).
      if (noteKind === 'offer' && e.key === 'Enter') { pillAct('yes'); e.preventDefault(); e.stopPropagation(); return }   // the offer: OK = Yes (Back = No)
      if (pillOpen) {
        if (pill < 0) { if (e.key === 'Enter') { setPill(1); level.holdNote(); e.preventDefault(); e.stopPropagation(); return } }
        else if (['ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) {
          const id = pillIds[pill]
          if (e.key === 'ArrowLeft') setPill(Math.max(0, pill - 1)); else if (e.key === 'ArrowRight') setPill(Math.min(pillIds.length - 1, pill + 1))
          else pillAct(id)
          if (e.key !== 'Enter' || id === 'minus' || id === 'plus') level.holdNote()
          e.preventDefault(); e.stopPropagation(); return
        }
      }
      if (panel || levelPanel !== null || stylePanel !== null || morePanel !== null) setPanelTick((n) => n + 1)
      if (morePanel !== null) {
        if (e.key === 'ArrowDown') setMorePanel(Math.min(moreRows.length - 1, morePanel + 1))
        else if (e.key === 'ArrowUp') setMorePanel(Math.max(0, morePanel - 1))
        else if (e.key === 'ArrowLeft') moreRows[morePanel].step(-1)
        else if (e.key === 'ArrowRight' || e.key === 'Enter') moreRows[morePanel].step(1)
        else return
        e.preventDefault(); e.stopPropagation(); return
      }
      if (stylePanel !== null) {
        if (e.key === 'ArrowDown') setStylePanel(Math.min(styleRows.length - 1, stylePanel + 1))
        else if (e.key === 'ArrowUp') setStylePanel(Math.max(0, stylePanel - 1))
        else if (e.key === 'ArrowLeft') stepStyle(stylePanel, -1)
        else if (e.key === 'ArrowRight' || e.key === 'Enter') stepStyle(stylePanel, 1)
        else return
        e.preventDefault(); e.stopPropagation(); return
      }
      if (panel) {
        const rows = [audio.length, subs.length + 2]
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
          if (ctlRow === 'seek') press(d as 1 | -1, e)
          else setCtlIdx((i) => Math.max(0, Math.min(last, Math.min(i, last) + d)))
          poke()
        } else if (e.key === 'ArrowUp') { if (ctlRow === 'buttons') setCtlRow('seek'); poke() }
        else if (e.key === 'ArrowDown') {
          if (ctlRow === 'seek') { setCtlRow('buttons'); poke() }
          else if (showNext && countdown !== null) { setCountdown(null); setStayed(true) }
          else { setCtlRow(null); setControls(false) }
        } else if (e.key === 'Enter' || e.key === ' ') { if (ctlRow === 'seek') toggle(); else acts[cur]?.(); poke() }
        else if (!['k', 'MediaPlayPause', 'm', 'v', 'f', 'n', 'p', 'c', 's', 'j', 'l'].includes(e.key)) return
        else { /* fall through to the shortcuts below */ }
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) { e.preventDefault(); e.stopPropagation(); return }
      }
      switch (e.key) {
        case 'Enter': toggle(); break
        case ' ': case 'k': case 'MediaPlayPause': toggle(); break
        case 'ArrowLeft': case 'j': press(-1, e); break
        case 'ArrowRight': case 'l': press(1, e); break
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
      onClick={(e) => { if ((panel || levelPanel !== null || stylePanel !== null || morePanel !== null) && !(e.target as HTMLElement).closest('[data-menu]')) { setPanel(null); setLevelPanel(null); setStylePanel(null); setMorePanel(null); return }
        if (mode !== 'native' || !lifted || closing || (e.target as HTMLElement).closest('button, input, [role=slider], [data-nopause]')) return; toggle() }}
      onDoubleClick={(e) => { if (mode !== 'native' || !lifted || closing || (e.target as HTMLElement).closest('button, input, [role=slider], [data-nopause]')) return; toggleFullscreen() }}>
      {mode !== 'native' && <video ref={video} loop={server.uri === DEMO_URI} className="absolute inset-0 size-full bg-black object-contain" playsInline
        onClick={toggle} onDoubleClick={toggleFullscreen}
        onPlay={() => setPaused(false)} onPause={() => setPaused(true)}
        onWaiting={() => setBuffering(true)} onPlaying={() => setBuffering(false)} onCanPlay={() => { setBuffering(false); setReady(true) }}
        onTimeUpdate={(e) => { if (scrubbing.current) return; const v = e.currentTarget; timeRef.current = v.currentTime; setTime(v.currentTime); if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1)) }}
        onDurationChange={(e) => isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        onVolumeChange={(e) => { setVolume(e.currentTarget.volume); setMuted(e.currentTarget.muted) }}
        onEnded={() => endedRef.current()}
        onError={() => fail('This file could not be played.')} />}
      {mode !== 'native' && <VolumeSync video={video} volume={volume} muted={muted} />}

      {/* Loading / error states */}
      {buffering && !trickUi && !error && (
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

      {/* Fast-forward / rewind: triangles for the step (two, three, four), and how fast */}
      {trickUi && (
        <div aria-live="polite" className="pointer-events-none absolute left-1/2 top-[42%] z-[22] flex -translate-x-1/2 flex-col items-center gap-2 rounded-3xl bg-black/60 px-9 py-5 shadow-2xl backdrop-blur">
          <div className="flex items-center">
            {Array.from({ length: trickUi.level + 1 }, (_, i) => <Play key={i} size={34} fill="currentColor" className={`-mx-1 ${trickUi.dir < 0 ? '-scale-x-100' : ''}`} />)}
          </div>
          <div className="text-sm font-bold tabular-nums tracking-wide text-white/80">{trickUi.speed}×</div>
        </div>
      )}

      {/* Paused: the picture dims and says so */}
      <div className={`pointer-events-none absolute inset-0 grid place-items-center bg-black/55 transition-opacity duration-300 ${paused && !trickUi && lifted && !closing && !error ? 'opacity-100' : 'opacity-0'}`}>
        <div className="flex flex-col items-center gap-3">
          <Pause size={64} fill="currentColor" className="drop-shadow-lg" />
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
          <div className="relative aspect-video overflow-hidden"><img src={imageUrl(server, next.type === 'movie' ? next.art ?? next.thumb : next.thumb, 640, 360)} alt="" className={`size-full object-cover transition-all duration-500 ${settings.hideSpoilers && isSpoilerRisk(next) ? 'scale-110 blur-lg brightness-90' : ''}`} />
            <div className="absolute inset-0 bg-linear-to-t from-black/80 to-transparent" />
            <div className="absolute bottom-3 left-4 right-4"><div className="text-xs font-bold uppercase tracking-widest text-white/60">Up next{countdown !== null ? ` · ${Math.max(0, countdown)}s` : ''}</div>
              <div className="truncate font-bold">{[episodeLabel(next), next.title].filter(Boolean).join(' · ')}</div></div></div>
          <div className="flex gap-2 p-3">
            <button onClick={goNext} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white py-2.5 text-sm font-bold text-black ring-2 ring-white/40 transition hover:scale-[1.04] hover:bg-accent hover:ring-accent active:scale-95"><Play size={15} fill="currentColor" />Play now</button>
            <button onClick={() => { setCountdown(null); setStayed(true) }} className="rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold transition hover:bg-white/25 active:scale-95">Stay</button>
          </div>
        </div>
      )}

      {/* Chrome */}
      <div className={`absolute inset-0 transition-opacity duration-300 ${lifted && !closing && (controls || paused || panel || levelPanel !== null || stylePanel !== null || morePanel !== null) ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        <div data-nopause className="absolute inset-x-0 top-0 flex items-start gap-4 bg-linear-to-b from-black/80 to-transparent px-8 pb-16 pt-6">
          <button onClick={close} aria-label="Back" className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 backdrop-blur transition hover:bg-white/25"><ArrowLeft size={22} /></button>
          <div className="min-w-0 flex-1 pt-0.5"><div className="truncate text-xl font-bold">{title}</div><div className="truncate text-sm text-white/65">{subtitle}</div>
            {plan && <div className={`mt-2 inline-block rounded-full px-3.5 py-1 text-xs font-bold ring-1 ${KIND_STYLE[plan.kind]}`}>{plan.summary}</div>}</div>
          <Clock className="shrink-0 pt-1 text-xl font-semibold text-white/90" />
        </div>

        <div data-nopause className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/90 via-black/50 to-transparent px-8 pb-7 pt-24">
          <SeekBar focused={ctlRow === 'seek'} pct={pct} buffered={duration ? (buffered / duration) * 100 : 0} duration={duration} onSeek={seek} intro={intro} credits={credits} />
          <div className="mt-1.5 flex justify-between text-sm tabular-nums text-white/70"><span>{fmt(time)}</span><span>-{fmt(duration - time)}</span></div>
          <div className="mt-2 flex items-center gap-2">
            <Ctl label={paused ? 'Play' : 'Pause'} onClick={toggle} big focused={cf('play')}>{paused ? <Play size={28} fill="currentColor" /> : <Pause size={28} fill="currentColor" />}</Ctl>
            {prev && <Ctl label={media.type === 'movie' ? 'Previous movie' : 'Previous episode'} onClick={goPrev} focused={cf('prev')}><SkipBack size={24} /></Ctl>}
            <Ctl label={`Back ${settings.seekBack} seconds`} onClick={acts.back} focused={cf('back')}><span className="relative grid place-items-center"><RotateCcw size={28} /><b className="absolute text-[0.6rem] font-extrabold">{settings.seekBack}</b></span></Ctl>
            <Ctl label={`Forward ${settings.seekForward} seconds`} onClick={acts.fwd} focused={cf('fwd')}><span className="relative grid place-items-center"><RotateCw size={28} /><b className="absolute text-[0.6rem] font-extrabold">{settings.seekForward}</b></span></Ctl>
            <div className="group/vol ml-1 flex items-center">
              <Ctl label="Mute" onClick={() => setMuted((m) => !m)} focused={cf('mute')}>{muted || volume === 0 ? <VolumeX size={24} /> : <Volume2 size={24} />}</Ctl>
              <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} aria-label="Volume"
                onChange={(e) => { setVolume(+e.target.value); setMuted(false) }}
                className="h-1 w-0 cursor-pointer appearance-none overflow-hidden rounded-full bg-white/30 accent-white opacity-0 transition-all group-hover/vol:w-24 group-hover/vol:opacity-100" />
            </div>
            <div className="flex-1" />
            {next && <Ctl label={media.type === 'movie' ? 'Next movie' : 'Next episode'} onClick={goNext} focused={cf('next')}><SkipForward size={24} /></Ctl>}
            {hasBoost && <Ctl label="Volume boost" onClick={() => setLevelPanel(levelPanel === null ? 0 : null)} focused={cf('boost')}><span className="relative grid place-items-center"><AudioLines size={24} />{levelActive && <i className="absolute -right-1 -top-1 size-2 rounded-full bg-accent" />}</span></Ctl>}
            <Ctl label="Audio & subtitles" onClick={() => setPanel(panel ? null : { col: 0, idx: 0 })} focused={cf('subs')}><Captions size={26} /></Ctl>
            <Ctl label="More: speed, sleep timer, quality" onClick={acts.more} focused={cf('more')}><span className="relative grid place-items-center"><Ellipsis size={26} />{(speed !== 1 || sleepIdx !== 0 || qIdx !== 0) && <i className="absolute -right-1 -top-1 size-2 rounded-full bg-accent" />}</span></Ctl>
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
                    <button aria-label="Quieter by 1 dB" disabled={typeof level.boost === 'number' && level.boost <= MIN_BOOST} onClick={() => nudgeBoost(-1)} className={`grid size-8 place-items-center rounded-full text-lg font-bold transition active:scale-90 disabled:opacity-30 ${levelPanel === i ? 'bg-black/10 hover:bg-black/20' : 'bg-white/10 hover:bg-white/25'}`}>−</button>
                    <span className="min-w-[4.6rem] text-center text-xs font-bold tabular-nums">{r.value}</span>
                    <button aria-label="Louder by 1 dB" disabled={typeof level.boost === 'number' && level.boost >= MAX_BOOST} onClick={() => nudgeBoost(1)} className={`grid size-8 place-items-center rounded-full text-lg font-bold transition active:scale-90 disabled:opacity-30 ${levelPanel === i ? 'bg-black/10 hover:bg-black/20' : 'bg-white/10 hover:bg-white/25'}`}>+</button>
                  </span>
                ) : (
                  <button onClick={() => { setLevelPanel(i); r.act() }} className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${levelPanel === i ? 'bg-black/10' : 'bg-white/10'} ${r.value === 'On' ? 'text-accent' : ''}`}>{r.value}</button>
                )}
              </div>
            ))}
          </div>
        )}

        {morePanel !== null && (
          <div data-nopause data-menu className="pop absolute bottom-32 right-8 w-[24rem] max-w-[92vw] rounded-2xl bg-[#17171c]/95 p-2.5 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
            <div className="px-3 pb-1 pt-1.5 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-white/40">More</div>
            {moreRows.map((r, i) => (
              <div key={r.label} onMouseEnter={() => setMorePanel(i)} className={`rounded-xl px-3 py-2.5 transition-colors ${morePanel === i ? 'bg-white text-black' : 'hover:bg-white/10'}`}>
                <div className="flex items-center gap-3">
                  <span className="flex-1 text-sm font-bold">{r.label}</span>
                  <button aria-label={`${r.label}: previous`} onClick={() => r.step(-1)} className={`grid size-8 place-items-center rounded-full text-lg font-bold transition active:scale-90 ${morePanel === i ? 'bg-black/10 hover:bg-black/20' : 'bg-white/10 hover:bg-white/25'}`}>‹</button>
                  <span className="min-w-[6.4rem] text-center text-xs font-bold tabular-nums">{r.value}</span>
                  <button aria-label={`${r.label}: next`} onClick={() => r.step(1)} className={`grid size-8 place-items-center rounded-full text-lg font-bold transition active:scale-90 ${morePanel === i ? 'bg-black/10 hover:bg-black/20' : 'bg-white/10 hover:bg-white/25'}`}>›</button>
                </div>
                <div className={`mt-0.5 text-xs ${morePanel === i ? 'text-black/55' : 'text-white/40'}`}>{r.hint}</div>
              </div>
            ))}
          </div>
        )}

        {stylePanel !== null && (
          <div data-nopause data-menu className="pop absolute bottom-32 right-8 w-[22rem] max-w-[92vw] rounded-2xl bg-[#17171c]/95 p-2.5 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
            <div className="px-3 pb-1 pt-1.5 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-white/40">Subtitle style</div>
            {styleRows.map((r, i) => (
              <div key={r.key} onMouseEnter={() => setStylePanel(i)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${stylePanel === i ? 'bg-white text-black' : 'hover:bg-white/10'}`}>
                <span className="flex-1 text-sm font-bold">{r.label}</span>
                <button aria-label={`${r.label}: previous`} onClick={() => stepStyle(i, -1)} className={`grid size-8 place-items-center rounded-full text-lg font-bold transition active:scale-90 ${stylePanel === i ? 'bg-black/10 hover:bg-black/20' : 'bg-white/10 hover:bg-white/25'}`}>‹</button>
                <span className="min-w-[4.6rem] text-center text-xs font-bold">{styleValue(i)}</span>
                <button aria-label={`${r.label}: next`} onClick={() => stepStyle(i, 1)} className={`grid size-8 place-items-center rounded-full text-lg font-bold transition active:scale-90 ${stylePanel === i ? 'bg-black/10 hover:bg-black/20' : 'bg-white/10 hover:bg-white/25'}`}>›</button>
              </div>
            ))}
            <div className="px-3 pb-1 pt-1.5 text-xs text-white/45">Applies to plain-text subtitles. Styled (.ass) ones keep their own look.</div>
          </div>
        )}

        {panel && (
          <div data-nopause data-menu onMouseEnter={() => clearTimeout(menuLeave.current)} onMouseLeave={() => { menuLeave.current = window.setTimeout(() => { setPanel(null); setLevelPanel(null) }, 1000) }} className="pop absolute bottom-32 right-8 flex w-[520px] max-w-[92vw] gap-1 rounded-2xl bg-[#17171c]/95 p-3 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
            {[{ t: 'Audio', rows: audio },
              { t: 'Subtitles', rows: [{ id: -1, label: 'Off', on: activeSub === null }, ...subs, { id: -2, label: 'Subtitle style…', on: false }] }].map((c, col) => (
              <div key={c.t} className="min-w-0 flex-1 max-h-[min(60vh,28rem)] overflow-y-auto overscroll-contain [scrollbar-width:thin]">
                <div className="px-3 pb-1 pt-1 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-white/40">{c.t}</div>
                {c.rows.map((r, idx) => (
                  <button key={r.id} ref={panel.col === col && panel.idx === idx ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined} onClick={() => choose(col as 0 | 1, idx)}
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

      {/* After a movie: what to watch next */}
      {offer && lighter && !closing && !askingStill && <StallOffer lighter={lighter} onDismiss={() => setOffer(false)} onSwitch={() => { setOffer(false); fadeOut(() => { continuing = true; onSwitch({ ...lighter.media, viewOffset: Math.round(timeRef.current * 1000) }) }) }} />}
      {/* Auto leveling heads-up: the volume is about to shift by itself, so say so (then say what it did) */}
      <div aria-live="polite" data-nopause className={`absolute left-1/2 z-40 -translate-x-1/2 transition-all duration-700 ${controls ? 'bottom-36' : 'bottom-10'} ${level.note ? 'opacity-100' : 'translate-y-2 opacity-0'} ${level.note ? 'pointer-events-auto' : 'pointer-events-none'}`}
        onMouseEnter={() => { if (pillOpen) level.holdNote() }} onMouseMove={() => { if (pillOpen) level.holdNote() }}>
        {noteShown.current && <VolumePill note={noteShown.current} gain={level.gain} ids={pillIds} active={pill} hint="You can turn this off any time in the player controls." onAct={(id, i) => { setPill(i); pillAct(id) }} />}
      </div>
      {sleepDone && !closing && (
        <div data-nopause className="pop absolute left-1/2 top-1/2 z-[60] w-[min(420px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-[#17171c]/95 p-7 text-center shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
          <div className="text-xl font-extrabold">Sleep timer</div>
          <p className="mt-2 text-sm text-white/65">Playback was paused. Press OK to keep watching, or Back to leave.</p>
          <button onClick={wakeFromSleep} className="mt-5 rounded-full bg-white px-8 py-2.5 font-bold text-black transition hover:scale-105">Keep watching</button>
        </div>
      )}
      {askingStill && !closing && <StillWatching onStay={stillHere} onTimeout={() => { homeRef.current = true; close() }} />}
      {suggest && <NextMovies server={server} media={media} onClose={close} onPlay={(m) => fadeOut(() => { continuing = true; onPlayNext(m) })} />}
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
