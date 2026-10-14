import { useCallback, useEffect, useRef, useState } from 'react'
import { Captions, Check, Loader2, TriangleAlert } from 'lucide-react'
import { useInputMode } from '../lib/input'
import { useStillWatching } from '../lib/stillWatching'
import { StillWatching } from './StillWatching'
import { Layer } from './Layer'
import { SeasonIcon } from './SeasonIcon'
import { Focusable } from './Focusable'
import { DEMO_URI, directPlayUrl, getMetadata, type PlexMedia, type PlexServer } from '../lib/plex'
import { planPlayback } from '../lib/playback'
import { applySubStyle, keepAwake, mpvCmd, mpvSet, mpvTracks, nativeStart, onMpv, setNativeVideoActive, type MpvTrack } from '../lib/native'
import { useSettings } from '../lib/settings'
import { hexA } from '../lib/seasonal'
import { dbLabel, useLevelEngine } from '../lib/leveling'
import { VolumePill } from './VolumePill'
import { chooseTracks, slotAt, useGuide, type Channel, type Slot } from '../lib/tvguide'

interface Props { server: PlexServer; channels: Channel[]; start: number; onClose: () => void; /** Nobody answered "Are you still watching?" */ onIdle?: () => void }

const TUNE_DELAY = 350   // wait for the remote to settle before loading, so flipping through channels doesn't hammer the server
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/**
 * Full-screen live-TV viewing: tunes a channel to whatever is "on" right now (part-way through, like cable) and flips channels with Up / Down.
 * Back returns to the guide. No pausing or seeking, and nothing is reported to Plex: no watch history, no Continue Watching.
 */
export function ChannelPlayer({ server, channels, start, onClose, onIdle }: Props) {
  const { settings, update } = useSettings()
  const guide = useGuide()
  const [mode, setMode] = useState<'pending' | 'native' | 'web'>('pending')
  const [idx, setIdx] = useState(start)
  const [status, setStatus] = useState<'tuning' | 'playing' | 'error'>('tuning')
  const [slot, setSlot] = useState<Slot>()
  const [media, setMedia] = useState<PlexMedia>()
  const [loadedTick, setLoadedTick] = useState(0)
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
  const settingsRef = useRef(settings); settingsRef.current = settings

  // Audio and subtitle choices: this channel's own, else the guide's defaults.
  const applyTracks = useCallback(async (tries = 0): Promise<void> => {
    try {
      const tracks = await mpvTracks()
      if (!tracks.length && tries < 3) { await new Promise((r) => setTimeout(r, 600)); return applyTracks(tries + 1) }
      const s = settingsRef.current
      const pick = chooseTracks(tracks, channels[idxRef.current]?.prefs, { subs: s.guideSubs, subLang: s.guideSubLang, audioLang: s.guideAudioLang })
      if (pick.aid !== undefined) await mpvSet('aid', pick.aid)
      if (pick.sid === 'no') await mpvSet('sid', 'no')
      else if (pick.sid !== undefined) await mpvSet('sid', pick.sid)
    } catch { /* keep the file's own defaults */ }
  }, [channels])

  useEffect(() => { nativeStart().then((ok) => setMode(ok ? 'native' : 'web')) }, [])
  useEffect(() => { keepAwake(true); return () => { keepAwake(false) } }, [])
  useEffect(() => { if (mode === 'native') applySubStyle(settings).catch(() => {}) }, [mode, status, settings.subSize, settings.subFont, settings.subColor, settings.subEdge, settings.subBackground])

  const [tracksOpen, setTracksOpen] = useState(false)
  const [tracks, setTracks] = useState<MpvTrack[]>([])
  const tracksOpenRef = useRef(false); tracksOpenRef.current = tracksOpen
  const inputMode = useInputMode()
  // The info banner (channel, title, episode, and the audio & subtitles button): it stays up while the track menu is open.
  const flash = useCallback(() => { setBanner(true); clearTimeout(bannerTimer.current); bannerTimer.current = window.setTimeout(() => { if (!tracksOpenRef.current) setBanner(false) }, 5000) }, [])
  const lastMove = useRef(0)
  const openTracks = useCallback(() => {
    flash()
    mpvTracks().then((t) => { setTracks(t.filter((x) => x.type === 'audio' || x.type === 'sub')); setTracksOpen(true) }).catch(() => {})
  }, [flash])
  const pickTrack = (t: MpvTrack | 'off') => {
    if (t === 'off') mpvSet('sid', 'no').catch(() => {})
    else mpvSet(t.type === 'audio' ? 'aid' : 'sid', t.id).catch(() => {})
    setTracksOpen(false); flash()
  }
  const trackLabel = (t: MpvTrack) => [t.title || t.lang?.toUpperCase(), t.codec?.toUpperCase(), t.channels ? `${t.channels}ch` : '', t.external ? 'external' : ''].filter(Boolean).join(' · ') || 'Track'

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
      setMedia(media)
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

  // A short fade-up on each tune, so the first moments of a louder program don't jolt, while the level evens out.
  const fade = useRef<number>(0)
  const fadeIn = useCallback(() => {
    clearInterval(fade.current)
    mpvSet('volume', 0).catch(() => {})
    let i = 0
    fade.current = window.setInterval(() => { i++; mpvSet('volume', Math.min(100, Math.round((i / 8) * 100))).catch(() => {}); if (i >= 8) clearInterval(fade.current) }, 80)
  }, [])
  useEffect(() => () => { clearInterval(fade.current) }, [])

  // With leveling off, the guide plays at normal volume: clear any gain left over from earlier (and clean up on the way out).
  useEffect(() => {
    if (mode !== 'native') return
    if (!settings.guideLeveling) mpvSet('af', '').catch(() => {})
    return () => { mpvSet('af', '').catch(() => {}) }
  }, [mode, settings.guideLeveling])

  // Even out loudness between channels and programs (measures a few seconds, then holds one steady gain; remembered per show / movie).
  const level = useLevelEngine({ active: mode === 'native' && settings.guideLeveling && !!media, loaded: loadedTick, media: media ?? ({ ratingKey: 'none', type: 'movie', title: '' } as PlexMedia), autoLevel: true, dialogueBoost: false, fast: true, ask: true })
  // The current boost for this program, adjustable by hand from the audio menu (a hand-set level is remembered for the program).
  const boostNow = typeof level.boost === 'number' ? level.boost : Math.round(level.gain)
  const nudge = (d: number) => level.setBoost(Math.max(-10, Math.min(15, boostNow + d)))
  const noteShown = useRef(level.note); if (level.note) noteShown.current = level.note   // keeps the last text while it fades out
  const pillIds = level.note?.kind === 'offer' ? ['yes', 'no'] : level.note?.kind === 'applied' ? ['dismiss', 'disable'] : []
  // With the remote: Up / Down move onto the volume pill while it shows (then Left / Right choose, OK presses); Back closes it.
  const [pill, setPill] = useState(-1)
  const pillRef = useRef(-1); pillRef.current = pill
  const pillIdsRef = useRef<string[]>([]); pillIdsRef.current = pillIds
  useEffect(() => { setPill(-1) }, [level.note?.kind])
  const pillAct = (id: string) => {
    if (id === 'yes') level.acceptOffer()
    else if (id === 'no') level.declineOffer()
    else if (id === 'disable') { update({ guideLeveling: false }); level.closeNote() }
    else level.closeNote()
    setPill(-1)
  }

  // Native engine events (loaded / ended / failed).
  useEffect(() => {
    if (mode !== 'native') return
    let off: (() => void) | undefined, dead = false
    onMpv((p) => { if (p.name === 'eof-reached' && p.value === true) tune(idxRef.current) }, (e) => {
      if (e.event === 'loaded') { if (!nativeOn.current) { nativeOn.current = true; setNativeVideoActive(true) } setStatus('playing'); flash(); applyTracks(); setLoadedTick((n) => n + 1); fadeIn() }
      if ((e.event === 'end' && e.reason === 4) || e.event === 'error') setStatus('error')
    }).then((u) => { if (dead) u(); else off = u })
    mpvSet('volume', 100).catch(() => {}); mpvSet('mute', false).catch(() => {})
    return () => {
      dead = true; off?.()
      mpvSet('volume', 100).catch(() => {})   // leave things audible for whatever plays next
      mpvCmd('stop').catch(() => {})
      setNativeVideoActive(false)
      document.documentElement.classList.add('ui-fade')
      setTimeout(() => document.documentElement.classList.remove('ui-fade'), 900)
    }
  }, [mode, tune, flash, applyTracks])
  useEffect(() => () => { clearTimeout(advance.current); clearTimeout(bannerTimer.current); hls.current?.destroy(); seq.current++ }, [])

  // Tune whenever the channel changes (after a short settle), once the engine is chosen.
  useEffect(() => {
    if (mode === 'pending') return
    setStatus('tuning'); flash()
    const t = setTimeout(() => tune(idx), idx === start && seq.current === 0 ? 0 : TUNE_DELAY)
    return () => clearTimeout(t)
  }, [idx, mode, tune, start, flash])

  const flip = (d: 1 | -1) => setIdx((i) => (i + d + channels.length) % channels.length)
  const close = (idle = false) => { if (leaving) return; setLeaving(true); setTimeout(idle && onIdle ? onIdle : onClose, 300) }
  const { asking: askingStill, confirm: stillHere } = useStillWatching(status === 'playing' && !leaving)

  const ch = channels[idx]
  const now = Date.now()
  return (
    <Layer player onClose={() => { if (level.note?.kind === 'offer') level.declineOffer(); else if (level.note) level.closeNote(); else close() }} scrim="bg-transparent">
      <div className="absolute inset-0" onMouseMove={() => { const t = Date.now(); if (t - lastMove.current > 500) { lastMove.current = t; flash() } }}>
        {askingStill && !leaving && <StillWatching onStay={stillHere} onTimeout={() => close(true)} />}
        {mode === 'web' && <video ref={video} playsInline className="absolute inset-0 size-full bg-black object-contain" onPlaying={() => { setStatus('playing'); flash() }} onEnded={() => tune(idxRef.current)} onError={() => setStatus('error')} />}
        {/* Receives the remote: Up / Down flip channels, OK shows the banner */}
        <Focusable focusKey="channel-surface" title="Channel"
          onEnter={() => { if (pillRef.current >= 0 && pillIdsRef.current[pillRef.current]) { pillAct(pillIdsRef.current[pillRef.current]); return } if (level.note?.kind === 'offer') { level.acceptOffer(); return } if (banner && status === 'playing' && mode === 'native' && inputMode === 'key') openTracks(); else flash() }}   // OK shows the info; OK again, with it showing, opens audio & subtitles
          onArrow={(d) => {
            const ids = pillIdsRef.current
            if (ids.length) {
              if (pillRef.current < 0 && (d === 'up' || d === 'down')) { setPill(0); level.holdNote(); return false }
              if (pillRef.current >= 0) { if (d === 'left') setPill(Math.max(0, pillRef.current - 1)); else if (d === 'right') setPill(Math.min(ids.length - 1, pillRef.current + 1)); level.holdNote(); return false }
            }
            if (d === 'up') { flip(-1); return false } if (d === 'down') { flip(1); return false } flash(); return false }}   // Left / Right also bring the info up
          className="absolute inset-0">
          <div className="size-full" />
        </Focusable>

        {/* Banner: channel, title, episode */}
        <div className={`pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/50 to-transparent px-12 pb-10 pt-28 transition-opacity duration-500 ${banner && status !== 'tuning' || (status === 'tuning' && banner) ? 'opacity-100' : 'opacity-0'}`}>
          <div className="flex items-end gap-6">
            <div className="grid min-w-[5.5rem] place-items-center rounded-2xl px-4 py-3 text-center" style={{ background: ch.accent ? hexA(ch.accent, 0.3) : 'rgba(255,255,255,.15)' }}>{ch.seasonal ? <SeasonIcon size={34} /> : <div className="text-3xl font-extrabold leading-none tabular-nums">{ch.number}</div>}</div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold uppercase tracking-[0.2em] text-white/60">{ch.name}</div>
              <div className="truncate text-3xl font-extrabold tracking-tight">{slot?.title ?? '—'}</div>
              {slot?.sub && <div className="truncate text-lg text-white/70">{slot.sub}</div>}
            </div>
            {mode === 'native' && status === 'playing' && (
              <button onClick={openTracks} className={`${banner ? 'pointer-events-auto' : 'pointer-events-none'} flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition ${inputMode === 'key' ? 'bg-white text-black' : 'bg-white/15 hover:bg-white/25'}`}><Captions size={18} />Audio & subtitles{inputMode === 'key' && <span className="rounded bg-black/10 px-1.5 text-xs font-bold">OK</span>}</button>
            )}
            {slot && <div className="shrink-0 text-right text-sm text-white/60">{clock(slot.start)} – {clock(slot.end)}<div className="text-xs">{Math.max(0, Math.round((slot.end - now) / 60000))} min left</div></div>}
          </div>
        </div>

        {/* Volume: the offer to adjust a loud or quiet program, the adjustment easing in, and "complete" */}
        <div aria-live="polite" className={`absolute bottom-52 left-1/2 z-40 -translate-x-1/2 transition-all duration-700 ${level.note ? 'pointer-events-auto opacity-100' : 'pointer-events-none translate-y-2 opacity-0'}`}>
          {noteShown.current && <VolumePill note={noteShown.current} gain={level.gain} ids={pillIds} active={pill} hint="You can turn this off in Guide settings." onAct={(id) => pillAct(id)} />}
        </div>
        {tracksOpen && (
          <Layer player z="z-[85]" onClose={() => setTracksOpen(false)} scrim="bg-transparent" className="absolute bottom-40 left-1/2 w-[min(640px,94vw)] -translate-x-1/2">
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
                    {list.length === 0 && name === 'Audio' && <div className="px-3 py-2.5 text-sm text-white/45">Nothing to choose</div>}
                    {list.map((t) => (
                      <Focusable key={`${t.type}-${t.id}`} onEnter={() => pickTrack(t)} title={trackLabel(t)}>
                        <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><span className="flex-1 truncate">{trackLabel(t)}</span>{t.selected && <Check size={16} />}</div>
                      </Focusable>
                    ))}
                  </div>
                </div>
              ))}
              <div className="w-48 shrink-0">
                <div className="px-3 pb-1 pt-1 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-white/40">Volume</div>
                <Focusable onEnter={() => { if (!settings.guideLeveling) level.rescan(); update({ guideLeveling: !settings.guideLeveling }); setTracksOpen(false); flash() }} title="Audio scan">
                  <div className="rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><div className="flex items-center gap-2"><span className="flex-1">Audio scan</span><span className="text-xs font-bold">{settings.guideLeveling ? 'On' : 'Off'}</span></div><div className="mt-0.5 text-[0.7rem] font-medium opacity-60">{settings.guideLeveling ? 'OK turns it off' : 'OK scans this program'}</div></div>
                </Focusable>
                {settings.guideLeveling && (
                  <div className="px-3 pt-2.5">
                    <div className="pb-1 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-white/40">Boost</div>
                    <div className="flex items-center gap-1.5">
                      <Focusable onEnter={() => nudge(-1)} title="Quieter by 1 dB"><div className="grid size-9 place-items-center rounded-full bg-white/12 text-lg font-bold transition-colors group-hover/f:bg-white/25 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">−</div></Focusable>
                      <span className="min-w-[3.6rem] text-center text-sm font-bold tabular-nums">{dbLabel(boostNow)}</span>
                      <Focusable onEnter={() => nudge(1)} title="Louder by 1 dB"><div className="grid size-9 place-items-center rounded-full bg-white/12 text-lg font-bold transition-colors group-hover/f:bg-white/25 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">+</div></Focusable>
                    </div>
                    {typeof level.boost === 'number' && <div className="mt-1.5"><Focusable onEnter={() => level.setBoost('auto')} title="Back to automatic"><div className="rounded-full px-3 py-1.5 text-xs font-semibold text-white/70 transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">Back to automatic</div></Focusable></div>}
                  </div>
                )}
              </div>
            </div>
          </Layer>
        )}

        {/* Tuning / error cover */}
        <div className={`pointer-events-none absolute inset-0 grid place-items-center bg-black transition-opacity duration-300 ${status === 'playing' && !leaving ? 'opacity-0' : 'opacity-100'}`}>
          {status === 'tuning' && !leaving && (
            <div className="text-center"><Loader2 className="mx-auto animate-spin text-white/60" size={44} />
              <div className="mt-5 flex justify-center text-4xl font-extrabold tabular-nums">{ch.seasonal ? <SeasonIcon size={44} /> : ch.number}</div><div className="mt-1 font-bold tracking-wide" style={{ color: ch.accent ?? 'rgba(255,255,255,.7)' }}>{ch.name}</div>
              <div className="mt-3 text-sm uppercase tracking-[0.3em] text-white/40">Tuning</div></div>
          )}
          {status === 'error' && !leaving && (
            <div className="max-w-md text-center"><TriangleAlert className="mx-auto text-amber-300" size={44} />
              <div className="mt-4 text-2xl font-extrabold">{ch.seasonal ? '' : `${ch.number} · `}{ch.name}</div>
              <p className="mt-2 text-white/70">This channel isn’t working. Try another channel (Up or Down).</p></div>
          )}
        </div>
      </div>
    </Layer>
  )
}
