import { doesFocusableExist, setFocus } from '@noriginmedia/norigin-spatial-navigation'
import { isAndroid } from './native'
import { useSettings } from './settings'

/** TVs and boxes run the Android build; `?tv` previews the TV layouts in a browser. */
export const isTvDevice = isAndroid || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('tv'))

/** True when this device is a TV and the person chose the Minimal look. */
export function useMinimal(): boolean {
  const { settings } = useSettings()
  return isTvDevice && settings.layout === 'minimal'
}

/** Where Down from a top tab lands, set by the screen underneath (it knows where the cursor was last). */
export const tabDown: { fn: (() => string | undefined) | null } = { fn: null }

/** Going back to a screen: the key of the button the cursor was on when you left it. Screens that fill in late check this before choosing where to land. */
export const pendingFocus: { key: string | undefined } = { key: undefined }
/** Puts the cursor back where it was (keeps trying for a couple of seconds while the screen loads). Keys that are made up on the fly can't be found again and are skipped. */
export function restoreFocus(k?: string) {
  if (!k || k.startsWith('sn:') || k === 'SN:ROOT') return
  pendingFocus.key = k
  let tries = 0
  const t = setInterval(() => {
    tries++
    if (doesFocusableExist(k)) { setFocus(k); pendingFocus.key = undefined; clearInterval(t) }
    else if (tries > 12) { pendingFocus.key = undefined; clearInterval(t) }
  }, 200)
}
