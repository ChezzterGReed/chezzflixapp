// Volume boost for quiet titles (desktop player). One steady gain across the whole title, never a gain-rider: riding the level
// lifts hiss and pumps, so this only measures, then holds a fixed gain (with a limiter so it can't clip).
//
//  Auto leveling   measures the title's loudness while it plays, picks one gain to reach TARGET_LUFS, ramps to it gently, refines it
//                  twice early on, and remembers it for the title (the whole show, for episodes) so next time it's right from the start.
//  Dialogue boost  for 5.1/7.1 audio, lifts only the center channel (where dialogue lives) before the TV mixes down to stereo.
//  Boost amount    manual override per title: Auto (follow auto leveling) or a fixed amount nudged in 1 dB steps, -10 to +15; remembered too.
import { useCallback, useEffect, useRef, useState } from 'react'
import { mpvCmd, mpvGet, mpvSet } from './native'
import type { PlexMedia } from './plex'

/** 'auto' follows auto leveling; a number is a fixed boost in dB (0 = none). */
export type Boost = 'auto' | number
export const MAX_BOOST = 15
export const MIN_BOOST = -10
export const clampBoost = (n: number) => Math.max(MIN_BOOST, Math.min(MAX_BOOST, Math.round(n)))
export const dbLabel = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)} dB`

export const NOTE_MS = 3500        // the "Boost applied" pill stays this long if left alone...
const NOTE_TOUCHED_MS = 4000  // ...or this long after the last time it was touched
export const TARGET_LUFS = -22
const MIN_GAIN = -5, MAX_GAIN = 15   // automatic leveling lifts a quiet title by up to 15 dB and can lower a loud one by up to 5
const FIRST_AT = 20, REFINE_AT = [60, 180], STOP_AT = 300   // seconds of playback
const FAST_FIRST_AT = 6, FAST_REFINE_AT = [20, 60], FAST_STOP_AT = 120   // the TV Guide: you're surfing, so settle quickly
const LIMITER = 'alimiter=limit=0.97:attack=5:release=60:level=disabled'
export const OFFER_DB = 5          // a title that would need more than this much change, up or down, gets the "adjust the volume?" offer
const OFFER_MS = 6000              // the offer stays up this long, then goes away and does nothing
const MEASURING_MS = 4000          // the "scanning this title" heads-up stays up this long
const declined = new Set<string>() // titles whose offer was answered No (or ignored) this session: not asked again
const DIALOGUE = 1.8   // center channel x1.8 (about +5 dB)

const LAYOUTS: Record<string, string[]> = {
  '3.0': ['FL', 'FR', 'FC'], '4.0': ['FL', 'FR', 'FC', 'BC'], '5.0': ['FL', 'FR', 'FC', 'BL', 'BR'], '5.0(side)': ['FL', 'FR', 'FC', 'SL', 'SR'],
  '5.1': ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR'], '5.1(side)': ['FL', 'FR', 'FC', 'LFE', 'SL', 'SR'], '6.1': ['FL', 'FR', 'FC', 'LFE', 'BC', 'SL', 'SR'],
  '7.1': ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'SL', 'SR'],
}
const dialoguePan = (layout: string) => { const ch = LAYOUTS[layout]; return ch ? `lavfi=[pan=${layout}|${ch.map((c) => (c === 'FC' ? `FC=${DIALOGUE}*FC` : `${c}=${c}`)).join('|')}]` : null }

// ---- what we remember per title (a whole show shares one entry) ----
interface Mem { gain?: number; boost?: Boost; /** The amount was set by hand from the "Boost applied" pill: auto leveling leaves it alone. */ locked?: boolean }
const MEM_KEY = 'chezzflix_levels'
export const memKey = (m: PlexMedia) => (m.type === 'episode' ? `show:${m.grandparentRatingKey ?? m.ratingKey}` : `item:${m.ratingKey}`)
function readAll(): Record<string, Mem> { try { return JSON.parse(localStorage.getItem(MEM_KEY) ?? '{}') } catch { return {} } }
export function readMem(key: string): Mem {
  const m = readAll()[key] ?? {}
  const b = m.boost as unknown
  return { ...m, boost: b === 'off' ? 0 : typeof b === 'number' ? clampBoost(b) : b === 'auto' ? 'auto' : undefined }   // older versions stored 'off' and +3/+6/+9/+12
}
function writeMem(key: string, patch: Mem) { try { const all = readAll(); all[key] = { ...all[key], ...patch }; localStorage.setItem(MEM_KEY, JSON.stringify(all)) } catch { /* private mode */ } }

const clamp = (v: number) => Math.max(MIN_GAIN, Math.min(MAX_GAIN, v))
const gainFilter = (g: number) => `@g:lavfi=[volume=${g.toFixed(2)}dB:eval=frame,${LIMITER}]`

/** For short clips (Preview/Recap): the steady gain this title would get, without measuring. */
export function clipAf(media: PlexMedia, autoLevel: boolean): string {
  const m = readMem(memKey(media))
  const g = typeof m.boost === 'number' ? m.boost : autoLevel ? m.gain ?? 0 : 0
  return Math.abs(g) < 0.1 ? '' : `lavfi=[volume=${g.toFixed(2)}dB,${LIMITER}]`
}

interface Opts {
  active: boolean; loaded: number; media: PlexMedia; autoLevel: boolean; dialogueBoost: boolean
  /** Settle sooner and jump straight to a remembered gain (TV Guide). */ fast?: boolean
  /** Auto leveling is off, but still listen, and offer to adjust a title that is a lot too loud or quiet. */ scanQuiet?: boolean
  /** TV Guide: never adjusts by itself; listens and offers (a title already accepted once keeps its remembered level). */ ask?: boolean
}

/** Drives mpv's audio filters for the current title. `loaded` ticks up each time a file finishes loading. */
export function useLevelEngine({ active, loaded, media, autoLevel, dialogueBoost, fast, scanQuiet, ask }: Opts) {
  const firstAt = fast ? FAST_FIRST_AT : FIRST_AT, refineAt = fast ? FAST_REFINE_AT : REFINE_AT, stopAt = fast ? FAST_STOP_AT : STOP_AT
  // The guide keeps its own remembered levels (capped), separate from the player's, so neither affects the other.
  const key = (fast ? 'guide:' : '') + memKey(media)
  const limit = useCallback((v: number) => Math.max(MIN_GAIN, Math.min(MAX_GAIN, v)), [])
  // A boost you set by hand goes from -10 to +15 dB; the automatic one from -5 to +15.
  const manual = (v: number) => Math.max(MIN_BOOST, Math.min(MAX_BOOST, v))
  const [boost, setBoostState] = useState<Boost>(() => readMem(key).boost ?? 'auto')
  const [gain, setGain] = useState(0)
  /** For a title that hasn't been measured yet: 'measuring' while it listens, then 'applied' (briefly) with the boost it chose. */
  const [note, setNote] = useState<null | { kind: 'measuring' } | { kind: 'offer'; target: number; loud: boolean } | { kind: 'applying'; to: number } | { kind: 'applied'; gain: number }>(null)
  const noteTimer = useRef(0)
  const noteKindRef = useRef<string | undefined>(undefined)
  noteKindRef.current = note?.kind
  const [rerunTick, setRerunTick] = useState(0)
  const armNote = useCallback((ms: number) => { clearTimeout(noteTimer.current); noteTimer.current = window.setTimeout(() => setNote(null), ms) }, [])
  const rerun = useRef(false)
  const offered = useRef('')                 // the title an offer was already made for in this player
  const accepting = useRef(false)             // an offer was just accepted: the change is announced and eased in slowly
  const [acceptTick, setAcceptTick] = useState(0)
  const offerTarget = useRef(0)
  const g = useRef({ gain: 0, sig: '', ticks: 0, lastPos: -1, timer: 0, ramp: 0 })

  const setBoost = useCallback((b: Boost) => { setBoostState(b); writeMem(key, { boost: b }) }, [key])

  /** Eases the gain to `target`. Announced: slower (so the number on the pill visibly climbs), ending in the "boost complete" pill. */
  const rampTo = useCallback((target: number, announce = false) => {
    const s = g.current
    clearInterval(s.ramp)
    const from = s.gain, delta = Math.abs(target - from)
    if (announce && delta < 0.5) { setNote({ kind: 'applied', gain: target }); armNote(NOTE_MS); return }
    const steps = announce ? Math.max(12, Math.min(40, Math.round(delta * 4))) : 12
    if (announce) { clearTimeout(noteTimer.current); setNote({ kind: 'applying', to: target }) }
    let i = 0
    s.ramp = window.setInterval(() => {
      i++
      const v = from + ((target - from) * i) / steps
      s.gain = v; setGain(v)
      mpvCmd('af-command', 'g', 'volume', `${v.toFixed(2)}dB`, 'volume').catch(() => {})
      if (i >= steps) { clearInterval(s.ramp); if (announce) { setNote({ kind: 'applied', gain: target }); armNote(NOTE_MS) } }
    }, announce ? 150 : 200)
  }, [armNote])

  useEffect(() => {
    if (!active || !loaded) return
    const s = g.current
    let dead = false
    clearInterval(s.timer); clearInterval(s.ramp)
    const fresh = rerun.current; rerun.current = false   // "Re-run" was pressed: measure again even though this title has a remembered boost
    const accepted = accepting.current; accepting.current = false   // an offer was just accepted
    ;(async () => {
      const mem = readMem(key)
      // TV Guide (`ask`): until a title's level has been accepted once, it is only listened to and offered, never changed on its own.
      const askFirst = !!ask && boost === 'auto' && !mem.gain
      const measuring = boost === 'auto' && autoLevel && !askFirst
      const scanOnly = ((!measuring && !!scanQuiet && boost === 'auto' && !fast && !autoLevel) || askFirst) && !mem.gain && offered.current !== key && !declined.has(key)
      const holds = typeof boost === 'number' || (autoLevel && !askFirst)
      const want = typeof boost === 'number' ? manual(boost) : limit(autoLevel ? mem.gain ?? 0 : 0)
      const layout = dialogueBoost ? await mpvGet('audio-params/hr-channels').catch(() => null) : null
      const pan = layout ? dialoguePan(layout) : null
      const parts = [pan, measuring || scanOnly ? '@m:lavfi=[ebur128=metadata=1]' : null, holds ? 'GAIN' : null].filter(Boolean) as string[]
      const sig = parts.join(',')
      if (dead) return
      if (sig !== s.sig) {
        // Switching the boost on while something is already playing: begin at what you're hearing now and glide to the new level.
        const glide = holds && (!fast || accepted) && s.sig !== '' && !s.sig.includes('GAIN') && Math.abs(want) > 0.05
        const start = glide ? 0 : want
        // Switching the boost off while it is on: come back down gently, then take the gain filter out.
        const fadeOut = !holds && !fast && s.sig.includes('GAIN') && Math.abs(s.gain) > 0.05
        const keepGain = fadeOut ? s.gain : start
        s.sig = sig; if (!fadeOut) { s.gain = start; setGain(start) }
        await mpvSet('af', (fadeOut ? [...parts, 'GAIN'] : parts).map((p) => (p === 'GAIN' ? gainFilter(fadeOut ? keepGain : start) : p)).join(',')).catch(() => {})
        if (fadeOut && !dead) { rampTo(0); setTimeout(() => { if (g.current.sig === sig) mpvSet('af', parts.map((p) => (p === 'GAIN' ? gainFilter(0) : p)).join(',')).catch(() => {}) }, 2800) }
        if (glide && !dead) rampTo(want, accepted)
      } else if (holds && Math.abs(want - s.gain) > 0.05) {
        if (fast) { clearInterval(s.ramp); s.gain = want; setGain(want); mpvCmd('af-command', 'g', 'volume', `${want.toFixed(2)}dB`, 'volume').catch(() => {}) }   // a channel change: no slow glide
        else rampTo(want)
      }
      if (scanOnly && !dead) {
        // Listen only (nothing is changed): if it needs more than OFFER_DB either way, offer to fix it (once per title).
        s.ticks = 0; s.lastPos = -1
        s.timer = window.setInterval(async () => {
          const pos = Number(await mpvGet('time-pos').catch(() => null))
          if (!isFinite(pos) || pos === s.lastPos) return
          s.lastPos = pos; s.ticks++
          if (s.ticks > stopAt) return clearInterval(s.timer)
          if (s.ticks !== firstAt && !refineAt.includes(s.ticks)) return
          const lufs = Number(await mpvGet('af-metadata/m/lavfi.r128.I').catch(() => null))
          if (!isFinite(lufs) || lufs < -60) return
          const raw = TARGET_LUFS - lufs
          if (Math.abs(raw) > OFFER_DB) {
            offered.current = key; clearInterval(s.timer)
            offerTarget.current = limit(clamp(raw))
            setNote({ kind: 'offer', target: offerTarget.current, loud: raw < 0 }); armNote(OFFER_MS)   // (left alone for 6 seconds, it just goes away)
          }
        }, 1000)
        return
      }
      if (!measuring || dead) return
      if (!accepted) { clearTimeout(noteTimer.current); if (!fast && (!mem.gain || fresh)) { setNote({ kind: 'measuring' }); armNote(MEASURING_MS) } else setNote(null) }   // only a title that has to be measured now gets the heads-up, and only briefly

      // Measure while it plays; hold one gain.
      s.ticks = 0; s.lastPos = -1
      s.timer = window.setInterval(async () => {
        const pos = Number(await mpvGet('time-pos').catch(() => null))
        if (!isFinite(pos) || pos === s.lastPos) return   // paused or seeking
        s.lastPos = pos; s.ticks++
        if (s.ticks > stopAt || readMem(key).locked) { clearInterval(s.timer); setNote((n) => (n?.kind === 'measuring' ? null : n)); return }   // (a boost set by hand from the pill is final)
        const first = (!mem.gain || fresh) && s.ticks === firstAt
        if (!first && !refineAt.includes(s.ticks)) return
        const lufs = Number(await mpvGet('af-metadata/m/lavfi.r128.I').catch(() => null))
        if (!isFinite(lufs) || lufs < -60) return   // nothing but silence so far
        let next = limit(clamp(TARGET_LUFS - lufs))
        if (!first) next = limit(Math.max(s.gain - 3, Math.min(s.gain + 3, next)))   // later corrections stay small
        writeMem(key, { gain: next, locked: false }); rampTo(next, first && !fast)   // the first level found for a title is eased in and announced; later fine-tuning is silent
      }, 1000)
    })()
    return () => { dead = true; clearInterval(s.timer); clearTimeout(noteTimer.current); setNote(null) }
  }, [active, loaded, key, boost, autoLevel, scanQuiet, ask, rerunTick, acceptTick, dialogueBoost, rampTo, armNote, fast, firstAt, refineAt, stopAt, limit])

  useEffect(() => () => { clearInterval(g.current.timer); clearInterval(g.current.ramp); g.current.sig = '' }, [])
  /** Yes to "adjust the volume automatically?": remember the level; the new level is then eased in (announced). Returns nothing; the caller turns the setting on where that applies. */
  const acceptOffer = useCallback(() => { clearTimeout(noteTimer.current); writeMem(key, { gain: offerTarget.current, locked: false }); accepting.current = true; setNote(null); setAcceptTick((n) => n + 1) }, [key])
  /** No (or Back): leave this title alone, and don't ask about it again this session. */
  const declineOffer = useCallback(() => { clearTimeout(noteTimer.current); declined.add(key); setNote(null) }, [key])
  /** Listen to this title again and pick a fresh boost (the current one stays until the new one is ready). */
  const remeasure = useCallback(() => { writeMem(key, { locked: false }); rerun.current = true; setRerunTick((n) => n + 1) }, [key])
  // The "Boost applied" pill: nudge the amount by 1 dB (it stays put from then on), switch the boost off for this title, or keep the pill open.
  const holdNote = useCallback(() => { if (noteKindRef.current === 'applied') armNote(NOTE_TOUCHED_MS); else if (noteKindRef.current === 'offer') armNote(OFFER_MS * 2) }, [armNote])
  const adjustNote = useCallback((d: number) => {
    const s = g.current, v = limit(Math.round(s.gain + d))
    clearInterval(s.ramp); s.gain = v; setGain(v)
    mpvCmd('af-command', 'g', 'volume', `${v.toFixed(2)}dB`, 'volume').catch(() => {})
    writeMem(key, { gain: v, locked: true })
    setNote({ kind: 'applied', gain: v }); armNote(NOTE_TOUCHED_MS)
  }, [key, limit, armNote])
  const revertNote = useCallback(() => { clearTimeout(noteTimer.current); setNote(null); setBoost(0) }, [setBoost])
  const closeNote = useCallback(() => { clearTimeout(noteTimer.current); setNote(null) }, [])
  /** Forget that this title was already offered or declined, so switching the scan back on listens to it again. */
  const rescan = useCallback(() => { declined.delete(key); offered.current = '' }, [key])
  return { boost, setBoost, gain, note, holdNote, rescan, adjustNote, revertNote, closeNote, acceptOffer, declineOffer, remeasure }
}
