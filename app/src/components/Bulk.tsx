import { useCallback, useState } from 'react'
import { BookmarkPlus, Radio } from 'lucide-react'
import { SelectionBar } from './SelectionBar'
import { AddToChannel } from './AddToChannel'
import { getMetadata, type PlexMedia, type PlexServer } from '../lib/plex'
import { useSettings } from '../lib/settings'
import { setOnWatchlist, watchItemOf, watchKey } from '../lib/watchlist'

/**
 * Picking several movies / shows on a screen (a library, search results). Cards ask `active`, `has(m)` and `toggle(m)`; the screen renders `bar`.
 * Actions: add all to the Watchlist, or add them to a channel (only when they're all movies or all shows).
 */
export function useTitleSelection(server: PlexServer, token: string) {
  const { settings, update } = useSettings()
  const [active, setActive] = useState(false)
  const [picked, setPicked] = useState<Map<string, PlexMedia>>(new Map())
  const [note, setNote] = useState<string>()
  const [channelFor, setChannelFor] = useState<PlexMedia[]>()

  const start = useCallback((m: PlexMedia) => { setActive(true); setPicked(new Map([[m.ratingKey, m]])) }, [])
  const toggle = useCallback((m: PlexMedia) => setPicked((p) => { const n = new Map(p); if (n.has(m.ratingKey)) n.delete(m.ratingKey); else n.set(m.ratingKey, m); return n }), [])
  const cancel = useCallback(() => { setActive(false); setPicked(new Map()) }, [])
  const has = useCallback((m: PlexMedia) => picked.has(m.ratingKey), [picked])
  const flash = (msg: string) => { setNote(msg); setTimeout(() => setNote(undefined), 2600) }

  const items = [...picked.values()]
  const kinds = new Set(items.map((m) => m.type))
  const sameKind = kinds.size === 1 && (kinds.has('movie') || kinds.has('show'))

  const addToWatchlist = async () => {
    const list = items
    let ok = 0
    await Promise.all(list.map(async (m) => {
      try {
        const full = watchKey(server, m) ? m : await getMetadata(server, m.ratingKey)
        const key = watchKey(server, full)
        if (key) { await setOnWatchlist(token, watchItemOf(key, full), true); ok++ }
      } catch { /* skip this one */ }
    }))
    cancel(); flash(ok === list.length ? `Added ${ok} to your Watchlist` : `Added ${ok} of ${list.length} to your Watchlist`)
  }

  const bar = (
    <>
      <SelectionBar active={active} count={items.length} noun={items.length === 1 ? 'title' : 'titles'} note={note} onCancel={cancel}
        actions={[
          { label: 'Add to Watchlist', icon: <BookmarkPlus size={20} />, disabled: !items.length, onEnter: addToWatchlist },
          // Channels take all movies or all shows, so with a mix only the Watchlist is offered.
          ...(settings.tvGuide && sameKind ? [{ label: 'Add to a channel', icon: <Radio size={20} />, onEnter: () => setChannelFor(items) }] : []),
        ]} />
      {!active && note && <div className="pop fixed bottom-8 left-1/2 z-[80] -translate-x-1/2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black shadow-2xl">{note}</div>}
      {channelFor && <AddToChannel items={channelFor} channels={settings.channels} onSave={(channels) => update({ channels })} onClose={() => { setChannelFor(undefined); cancel() }} />}
    </>
  )
  return { active, has, toggle, start, cancel, bar }
}
