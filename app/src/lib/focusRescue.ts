// When a screen changes, the button that had focus can disappear; the remote would then do nothing. This puts focus back somewhere sensible.
import { doesFocusableExist, getCurrentFocusKey, setFocus } from '@noriginmedia/norigin-spatial-navigation'

const hasFocus = () => { const k = getCurrentFocusKey(); return !!k && k !== 'SN:ROOT' && doesFocusableExist(k) }

/** True if something is (now) focused. Tries each candidate area in turn. */
export function ensureFocus(prefer: string[] = ['MAIN', 'SIDEBAR']): boolean {
  if (hasFocus()) return true
  for (const k of prefer) { if (doesFocusableExist(k)) { setFocus(k); if (hasFocus()) return true } }
  return false
}

/** After a screen change, keep trying for a few seconds while the new screen loads and its buttons appear. */
export function rescueSoon(prefer?: string[]) {
  for (const ms of [200, 600, 1300, 2500, 5000]) setTimeout(() => ensureFocus(prefer), ms)
}
