// A tiny "boop" as you move around, made with the browser's own audio (no sound files). Quiet, short, and switchable in Settings.
let ctx: AudioContext | null = null
let enabled = true
let last = 0

export const setNavSounds = (on: boolean) => { enabled = on }

export function navBlip() {
  if (!enabled) return
  const now = performance.now()
  if (now - last < 45) return   // holding a direction: a steady patter, not a buzz
  last = now
  if (document.documentElement.dataset.nativeVideo || document.querySelector('[data-player]')) return   // never over a video's sound
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx ??= new AC()
    if (ctx.state === 'suspended') void ctx.resume()
    const t = ctx.currentTime
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(640, t)
    o.frequency.exponentialRampToValueAtTime(960, t + 0.05)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
    o.connect(g).connect(ctx.destination)
    o.start(t); o.stop(t + 0.1)
  } catch { /* no audio available: stay silent */ }
}
