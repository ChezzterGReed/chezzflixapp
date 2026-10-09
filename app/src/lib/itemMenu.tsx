import { createContext, useContext } from 'react'
import type { PlexMedia } from './plex'

/** Opens the context menu for a title (right-click, or long-press / hold OK). `fromContinue` adds "Remove from Continue Watching". */
export type OpenItemMenu = (item: PlexMedia, opts?: { fromContinue?: boolean }) => void
export const ItemMenuContext = createContext<OpenItemMenu>(() => {})
export const useItemMenu = () => useContext(ItemMenuContext)
