// Volume boost for quiet titles (desktop player). One steady gain across the whole title, never a gain-rider: riding the level
// lifts hiss and pumps, so this only measures, then holds a fixed gain (with a limiter so it can't clip).
//
//  Auto leveling   measures the title's loudness while it plays, picks one gain to reach TARGET_LUFS, ramps to it gently, refines it
//                  twice early on, and remembers it for the title (the whole show, for episodes) so next time it's right from the start.
//  Dialogue boost  for 5.1/7.1 audio, lifts only the center channel (where dialogue lives) before the TV mixes down to stereo.
//  Boost amount    manual override per title: Auto (follow auto leveling) or a fixed amount nudged in 1 dB steps, -10 to +10; remembered too.
import { useCallback, useEffect, useRef, useState } from 'react'
import { mpvCmd, mpvGet, mpvSet } from './native'
import type { PlexMedia } from './plex'

/** 'auto' follows auto leveling; a number is a fixed boost in dB (0 = none). */
export type Boost = 'auto' | number
export const MAX_BOOST = 10
export const clampBoost = (n: number) => Math.max(-MAX_BOOST, Math.min(MAX_BOOST, Math.round(n)))
export const dbLabel = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)} dB`

export const TARGET_LUFS = -22
const MIN_GAIN = -6, MAX_GAIN = 15
const FIRST_AT = 20, REFINE_AT = [60, 180], STOP_AT = 300   // seconds of playback
const LIMITER = 'alimiter=limit=0.97:attack=5:release=60:level=disabled'
const DIALOGUE = 1.8   // center channel x1.8 (about +5 dB)

const LAYOUTS: Record<string, string[]> = {
  '3.0': ['FL', 'FR', 'FC'], '4.0': ['FL', 'FR', 'FC', 'BC'], '5.0': ['FL', 'FR', 'FC', 'BL', 'BR'], '5.0(side)': ['FL', 'FR', 'FC', 'SL', 'SR'],
  '5.1': ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR'], '5.1(side)': ['FL', 'FR', 'FC', 'LFE', 'SL', 'SR'], '6.1': ['FL', 'FR', 'FC', 'LFE', 'BC', 'SL', 'SR'],
  '7.1': ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'SL', 'SR'],
}
const dialoguePan = (layout: string) => { const ch = LAYOUTS[layout]; return ch ? `lavfi=[pan=${layout}|${ch.map((c) => (c === 'FC' ? `FC=${DIALOGUE}*FC` : `${c}=${c}`)).join('|')}]` : null }

// ---- what we remember per title (a whole show shares one entry) ----
interface Mem { gain?: number; boost?: Boost }
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

interface Opts { active: boolean; loaded: number; media: PlexMedia; autoLevel: boolean; dialogueBoost: boolean }

/** Drives mpv's audio filters for the current title. `loaded` ticks up each time a file finishes loading. */
export function useLevelEngine({ active, loaded, media, autoLevel, dialogueBoost }: Opts) {
  const key = memKey(media)
  const [boost, setBoostState] = useState<Boost>(() => readMem(key).boost ?? 'auto')
  const [gain, setGain] = useState(0)
  const g = useRef({ gain: 0, sig: '', ticks: 0, lastPos: -1, timer: 0, ramp: 0 })

  const setBoost = useCallback((b: Boost) => { setBoostState(b); writeMem(key, { boost: b }) }, [key])

  const rampTo = useCallback((target: number) => {
    const s = g.current
    clearInterval(s.ramp)
    const from = s.gain, steps = 12
    let i = 0
    s.ramp = window.setInterval(() => {
      i++
      const v = from + ((target - from) * i) / steps
      s.gain = v; setGain(v)
      mpvCmd('af-command', 'g', 'volume', `${v.toFixed(2)}dB`, 'volume').catch(() => {})
      if (i >= steps) clearInterval(s.ramp)
    }, 200)
  }, [])

  useEffect(() => {
    if (!active || !loaded) return
    const s = g.current
    let dead = false
    clearInterval(s.timer); clearInterval(s.ramp)
    ;(async () => {
      const mem = readMem(key)
      const measuring = boost === 'auto' && autoLevel
      const holds = typeof boost === 'number' || autoLevel
      const want = typeof boost === 'number' ? boost : autoLevel ? mem.gain ?? 0 : 0
      const layout = dialogueBoost ? await mpvGet('audio-params/hr-channels').catch(() => null) : null
      const pan = layout ? dialoguePan(layout) : null
      const parts = [pan, measuring ? '@m:lavfi=[ebur128=metadata=1]' : null, holds ? 'GAIN' : null].filter(Boolean) as string[]
      const sig = parts.join(',')
      if (dead) return
      if (sig !== s.sig) {
        s.sig = sig; s.gain = want; setGain(want)
        await mpvSet('af', parts.map((p) => (p === 'GAIN' ? gainFilter(want) : p)).join(',')).catch(() => {})
      } else if (holds && Math.abs(want - s.gain) > 0.05) rampTo(want)
      if (!measuring || dead) return

      // Measure while it plays; hold one gain.
      s.ticks = 0; s.lastPos = -1
      s.timer = window.setInterval(async () => {
        const pos = Number(await mpvGet('time-pos').catch(() => null))
        if (!isFinite(pos) || pos === s.lastPos) return   // paused or seeking
        s.lastPos = pos; s.ticks++
        if (s.ticks > STOP_AT) return clearInterval(s.timer)
        const first = !mem.gain && s.ticks === FIRST_AT
        if (!first && !REFINE_AT.includes(s.ticks)) return
        const lufs = Number(await mpvGet('af-metadata/m/lavfi.r128.I').catch(() => null))
        if (!isFinite(lufs) || lufs < -60) return   // nothing but silence so far
        let next = clamp(TARGET_LUFS - lufs)
        if (!first) next = Math.max(s.gain - 3, Math.min(s.gain + 3, next))   // later corrections stay small
        writeMem(key, { gain: next }); rampTo(next)
      }, 1000)
    })()
    return () => { dead = true; clearInterval(s.timer) }
  }, [active, loaded, key, boost, autoLevel, dialogueBoost, rampTo])

  useEffect(() => () => { clearInterval(g.current.timer); clearInterval(g.current.ramp); g.current.sig = '' }, [])
  return { boost, setBoost, gain }
}
