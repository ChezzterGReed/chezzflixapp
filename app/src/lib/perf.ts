// Low-power mode: on TV boxes and small devices, skip the expensive eye candy (blur-behind, animated glows, shimmer) and use smaller images.
// Set automatically on Android and on devices reporting few cores or little memory; add `?perf=low` / `?perf=high` to force it.
const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('perf') : null
const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }) : undefined
export const LOW_POWER = q === 'low' || (q !== 'high' && !!nav && (/Android/i.test(nav.userAgent) || (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4))
if (typeof document !== 'undefined') document.documentElement.dataset.perf = LOW_POWER ? 'low' : 'high'
/** Width to request for full-screen artwork. */
export const BIG_IMAGE = LOW_POWER ? { w: 1280, h: 720 } : { w: 1920, h: 1080 }
