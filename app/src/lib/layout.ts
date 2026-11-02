import { isAndroid } from './native'
import { useSettings } from './settings'

/** TVs and boxes run the Android build; `?tv` previews the TV layouts in a browser. */
export const isTvDevice = isAndroid || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('tv'))

/** True when this device is a TV and the person chose the Minimal look. */
export function useMinimal(): boolean {
  const { settings } = useSettings()
  return isTvDevice && settings.layout === 'minimal'
}
