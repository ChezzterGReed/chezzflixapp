// A soft, creamy "thock" as you move around, like a lubed linear keyboard switch (think KTT Kang White): a short, muted, mid-low knock with
// almost no high end and no deep boom. Made with the browser's own audio (no sound files). Quiet, short, and switchable in Settings.
//
// The sound is a tiny burst of noise that excites two resonances (the "case" ringing at a few hundred Hz), a soft fixed-pitch body tone
// underneath, and a low-pass over everything so nothing sharp gets through. No pitch sweep and no sub-bass, so it never reads as a drum.
import navUrl from '../assets/nav.mp3?url'

let ctx: AudioContext | null = null
let navBuf: AudioBuffer | null = null
let navLoading = false
let enabled = true
let last = 0

export const setNavSounds = (on: boolean) => { enabled = on }

export interface Thock { f1: number; q1: number; g1: number; f2: number; q2: number; g2: number; body: number; bodyGain: number; lowpass: number; decay: number; level: number }
// Weighted so most of the energy sits around 120-600 Hz (deep and smooth) with very little above 1.2 kHz.
export const THOCK: Thock = { f1: 280, q1: 3, g1: 14, f2: 480, q2: 3, g2: 9, body: 180, bodyGain: 0.025, lowpass: 1300, decay: 0.065, level: 0.17 }
/** Two other flavours to try: a little lighter and rounder (marble-like), and a little deeper and softer. */
export const THOCK_LIGHT: Thock = { f1: 400, q1: 3, g1: 11, f2: 700, q2: 3, g2: 7, body: 230, bodyGain: 0.02, lowpass: 1700, decay: 0.055, level: 0.15 }
export const THOCK_DEEP: Thock = { f1: 240, q1: 3, g1: 15, f2: 400, q2: 3, g2: 9, body: 160, bodyGain: 0.025, lowpass: 1100, decay: 0.07, level: 0.17 }

let noiseBuf: AudioBuffer | null = null
function noiseFor(c: BaseAudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf
  const n = Math.floor(c.sampleRate * 0.03)
  const b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0)
  for (let i = 0; i < n; i++) { const e = 1 - i / n; d[i] = (Math.random() * 2 - 1) * e * e }   // a burst that dies away
  return (noiseBuf = b)
}

/** Schedules one thock on any audio context (live or offline) at time `t`. `v` is a small pitch variation around 1. */
export function synthThock(c: BaseAudioContext, dest: AudioNode, t: number, p: Thock = THOCK, v = 1) {
  const master = c.createGain(); master.gain.value = p.level
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = p.lowpass; lp.Q.value = 0.5
  master.connect(lp).connect(dest)

  // The case ringing: noise through two resonances, each dying away quickly.
  const src = c.createBufferSource(); src.buffer = noiseFor(c)
  for (const [f, q, g, dec] of [[p.f1, p.q1, p.g1, p.decay], [p.f2, p.q2, p.g2, p.decay * 0.75]] as const) {
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * v; bp.Q.value = q
    const eg = c.createGain()
    eg.gain.setValueAtTime(0.0001, t); eg.gain.exponentialRampToValueAtTime(g, t + 0.002); eg.gain.exponentialRampToValueAtTime(0.0001, t + dec)
    src.connect(bp).connect(eg).connect(master)
  }
  src.start(t); src.stop(t + 0.04)

  // A soft body tone, fixed pitch (no sweep), for warmth.
  const body = c.createOscillator(), bg = c.createGain()
  body.type = 'sine'; body.frequency.value = p.body * v
  bg.gain.setValueAtTime(0.0001, t); bg.gain.exponentialRampToValueAtTime(p.bodyGain, t + 0.004); bg.gain.exponentialRampToValueAtTime(0.0001, t + p.decay * 0.9)
  body.connect(bg).connect(master)
  body.start(t); body.stop(t + p.decay + 0.02)
}

const AC = (): typeof AudioContext => window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext

const ANDROID = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
let keeper: AudioBufferSourceNode | null = null
/** Android: an inaudible, never-ending sound keeps the phone or TV's audio output awake, so the first blip after a pause isn't late (waking the output takes a moment). */
function keepWarm(c: AudioContext) {
  try {
    keeper?.stop()
    const n = c.sampleRate, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * 0.00008   // (just above digital silence, which the system would switch the output off for)
    const s = c.createBufferSource(); s.buffer = b; s.loop = true; s.connect(c.destination); s.start()
    keeper = s
  } catch { /* ignore */ }
}
/** Get the sound ready on the first key press or touch (and after any pause), instead of on the first blip. */
function warm() {
  if (!enabled || !ANDROID) return
  try {
    if (!ctx || ctx.state === 'closed') { freshContext(); keepWarm(ctx!) }
    else if (ctx.state === 'suspended') void ctx.resume()
  } catch { /* no audio */ }
}
if (typeof window !== 'undefined' && ANDROID) {
  for (const ev of ['keydown', 'pointerdown', 'touchstart'] as const) window.addEventListener(ev, warm, { capture: true, passive: true })
}

let born = 0
function freshContext() {
  try { void ctx?.close() } catch { /* already closed */ }
  ctx = new (AC())({ latencyHint: 'interactive' })
  born = performance.now()
}

/**
 * How long a sound started right now would take to be heard, in ms. Browsers' audio output can fall behind after a while (a busy page, a
 * long-running audio context) so that every blip arrives late; when that happens the context is simply replaced with a fresh one.
 */
function outputDelayMs(c: AudioContext): number {
  try {
    const t = c.getOutputTimestamp?.()
    if (t && t.performanceTime && t.contextTime != null) return t.performanceTime + (c.currentTime - t.contextTime) * 1000 - performance.now()
  } catch { /* not supported */ }
  return 0
}

export function navBlip() {
  if (!enabled) return
  const now = performance.now()
  if (now - last < 40) return   // holding a direction: a steady patter, not a buzz
  const idle = now - last
  last = now
  if (document.documentElement.dataset.nativeVideo || document.querySelector('[data-player]')) return   // never over a video's sound
  try {
    // A new context after a long pause, after a few minutes of use, or the moment the output is running behind.
    // (On Android the context is kept alive and warm instead: replacing it is what made a blip late.)
    const replace = !ctx || ctx.state === 'closed' || (ANDROID ? outputDelayMs(ctx) > 250 : idle > 45_000 || now - born > 180_000 || outputDelayMs(ctx) > 200)
    if (replace) { freshContext(); if (ANDROID) keepWarm(ctx!) }
    const c = ctx!
    if (c.state === 'suspended') void c.resume()
    if (navBuf) {
      const src = c.createBufferSource(), g = c.createGain()
      src.buffer = navBuf; src.playbackRate.value = 0.97 + Math.random() * 0.06; g.gain.value = 0.35   // each press a hair different
      src.connect(g).connect(c.destination); src.onended = () => { src.disconnect(); g.disconnect() }; src.start()
    } else {
      if (!navLoading) { navLoading = true; fetch(navUrl).then((r) => r.arrayBuffer()).then((b) => c.decodeAudioData(b)).then((d) => { navBuf = d }).catch(() => { navLoading = false }) }
      synthThock(c, c.destination, c.currentTime, THOCK, 0.96 + Math.random() * 0.08)   // until the sound file has loaded
    }
  } catch { /* no audio available: stay silent */ }
}
