import { useEffect, useState } from 'react'
import { Download, Loader2, Sparkles } from 'lucide-react'
import { Focusable } from './Focusable'
import { Layer } from './Layer'
import { isAndroid } from '../lib/native'
import { checkForUpdate, installUpdate, splitNotes, useUpdater } from '../lib/updater'

const RECHECK_MS = 6 * 3600_000

/** Checks for updates shortly after launch (then every few hours) and offers to install one. */
export function UpdatePrompt() {
  const u = useUpdater()
  const [later, setLater] = useState<string>()

  useEffect(() => {
    const first = setTimeout(checkForUpdate, 6000)
    const again = setInterval(checkForUpdate, RECHECK_MS)
    return () => { clearTimeout(first); clearInterval(again) }
  }, [])

  const busy = u.status === 'downloading' || u.status === 'installing'
  const showing = u.status === 'available' && u.version !== later
  if (!showing && !busy) return null
  // On a TV the offer is a popup that owns the remote (OK = Update now, Back = Later), like the other menus, so it can always be reached.
  const modal = isAndroid && showing

  const card = (
    <div className={`pop z-[60] rounded-2xl bg-[#17171c]/95 p-5 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl ${modal ? 'w-[min(540px,calc(100vw-2rem))] p-7' : 'fixed bottom-8 right-8 w-[min(380px,calc(100vw-2rem))]'}`}>
      <div className="flex items-start gap-3.5">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent/20 text-accent">{busy ? <Loader2 size={22} className="animate-spin" /> : <Sparkles size={22} />}</span>
        <div className="min-w-0 flex-1">
          <div className="font-bold">{u.status === 'installing' ? 'Restarting…' : busy ? `Updating to ${u.version}` : `Version ${u.version} is ready`}</div>
          {!busy && splitNotes(u.notes).name && <p className="mt-1 text-sm font-semibold text-white/70">{splitNotes(u.notes).name}</p>}
          {!busy && <p className="mt-1 text-xs text-white/40">You have {u.current}.</p>}
        </div>
      </div>
      {busy
        ? <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${Math.round(u.progress * 100)}%` }} /></div>
        : (
          <div className="mt-4 flex gap-2.5">
            <Focusable focusKey="update-now" onEnter={installUpdate} title="Update now">
              <div className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black transition-transform group-hover/f:scale-105 group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]"><Download size={16} />Update now</div>
            </Focusable>
            <Focusable focusKey="update-later" onEnter={() => setLater(u.version)} title="Later">
              <div className="rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold transition-colors group-hover/f:bg-white/20 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">Later</div>
            </Focusable>
          </div>
        )}
    </div>
  )

  if (modal) return <Layer onClose={() => setLater(u.version)} scrim="bg-black/60"><div className="absolute inset-0 grid place-items-center px-6">{card}</div></Layer>
  return card
}
