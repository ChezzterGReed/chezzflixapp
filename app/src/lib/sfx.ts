// A soft mechanical-keyboard "thock" as you move around, made with the browser's own audio (no sound files): a short low knock with a
// pitch that drops away, a touch of muffled click on top, and a tiny random variation so it never sounds mechanical in the bad sense.
// Quiet, short, and switchable in Settings.
let ctx: AudioContext | null = null
let noise: AudioBuffer | null = null
let enabled = true
let last = 0

export const setNavSounds = (on: boolean) => { enabled = on }

export function navBlip() {
  if (!enabled) return
  const now = performance.now()
  if (now - last < 40) return   // holding a direction: a steady patter, not a buzz
  last = now
  if (document.documentElement.dataset.nativeVideo || document.querySelector('[data-player]')) return   // never over a video's sound
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx ??= new AC()
    if (ctx.state === 'suspended') void ctx.resume()
    const t = ctx.currentTime
    const v = 0.94 + Math.random() * 0.12   // each press a little different

    const out = ctx.createGain()
    out.gain.value = 0.9
    out.connect(ctx.destination)

    // The thock: a low body whose pitch falls quickly, like a keycap bottoming out on a padded plate.
    const body = ctx.createOscillator(), bg = ctx.createGain(), lp = ctx.createBiquadFilter()
    body.type = 'sine'
    body.frequency.setValueAtTime(205 * v, t)
    body.frequency.exponentialRampToValueAtTime(92 * v, t + 0.07)
    lp.type = 'lowpass'; lp.frequency.value = 900
    bg.gain.setValueAtTime(0.0001, t)
    bg.gain.exponentialRampToValueAtTime(0.34, t + 0.004)
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.11)
    body.connect(lp).connect(bg).connect(out)
    body.start(t); body.stop(t + 0.12)

    // Under it, a short triangle knock for weight.
    const knock = ctx.createOscillator(), kg = ctx.createGain()
    knock.type = 'triangle'
    knock.frequency.setValueAtTime(130 * v, t)
    knock.frequency.exponentialRampToValueAtTime(70 * v, t + 0.05)
    kg.gain.setValueAtTime(0.0001, t)
    kg.gain.exponentialRampToValueAtTime(0.16, t + 0.003)
    kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.07)
    knock.connect(kg).connect(out)
    knock.start(t); knock.stop(t + 0.08)

    // On top, a muffled tick (filtered noise) so it reads as a key, not a drum.
    if (!noise) { noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1 }
    const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), ng = ctx.createGain()
    src.buffer = noise
    bp.type = 'bandpass'; bp.frequency.value = 1500 * v; bp.Q.value = 0.8
    ng.gain.setValueAtTime(0.0001, t)
    ng.gain.exponentialRampToValueAtTime(0.07, t + 0.002)
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03)
    src.connect(bp).connect(ng).connect(out)
    src.start(t); src.stop(t + 0.04)
  } catch { /* no audio available: stay silent */ }
}
