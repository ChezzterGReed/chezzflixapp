import { useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Focusable } from './Focusable'
import { Layer } from './Layer'
import { useBack } from '../lib/back'

export interface BulkAction { label: string; hint?: string; icon: ReactNode; danger?: boolean; disabled?: boolean; onEnter: () => void }

/**
 * The bar shown while picking several titles, and the menu of what to do with them. Back (or the Actions button) opens the menu, which
 * always includes "Cancel selection", so you can finish or leave from the same place.
 */
export function SelectionBar({ active, count, noun, actions, note, onCancel }: { active: boolean; count: number; noun: string; actions: BulkAction[]; note?: string; onCancel: () => void }) {
  const [open, setOpen] = useState(false)
  useBack(() => setOpen(true), active && !open)
  if (!active) return null
  const done = (f: () => void) => () => { setOpen(false); f() }
  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center">
        <div className="pop pointer-events-auto flex items-center gap-2.5 rounded-full bg-[#17171c]/95 py-2 pl-6 pr-2 shadow-[0_20px_60px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/15">
          <span className="mr-2 text-[0.95rem] font-bold tabular-nums">{note ?? `${count} selected`}</span>
          <Focusable focusKey="bulk-actions" onEnter={() => setOpen(true)} title="Actions">
            <div className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black transition-transform group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:shadow-[0_0_0_3px_var(--accent)]">Actions</div>
          </Focusable>
          <Focusable focusKey="bulk-cancel" onEnter={onCancel} title="Cancel selection">
            <div className="grid size-10 place-items-center rounded-full bg-white/12 transition-colors group-hover/f:bg-white/25 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><X size={18} /></div>
          </Focusable>
        </div>
      </div>

      {open && (
        <Layer onClose={() => setOpen(false)} scrim="bg-black/55 backdrop-blur-sm" className="absolute left-1/2 top-1/2 w-[min(400px,92vw)] -translate-x-1/2 -translate-y-1/2">
          <div className="pop overflow-hidden rounded-3xl bg-[#17171c]/95 p-2 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10">
            <div className="px-3.5 pb-2 pt-3"><div className="text-[1.02rem] font-bold">{count} {noun} selected</div><div className="text-sm text-white/55">What would you like to do?</div></div>
            <div className="space-y-0.5">
              {actions.map((a) => (
                <Focusable key={a.label} onEnter={a.disabled ? undefined : done(a.onEnter)} title={a.label}>
                  <div className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${a.disabled ? 'opacity-40' : ''} ${a.danger ? 'text-red-300 group-data-[hl=true]/f:text-red-700' : ''}`}>
                    {a.icon}<span className="min-w-0"><span className="block font-semibold">{a.label}</span>{a.hint && <span className="block text-xs opacity-60">{a.hint}</span>}</span>
                  </div>
                </Focusable>
              ))}
              <Focusable onEnter={done(onCancel)} title="Cancel selection">
                <div className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 font-semibold transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><X size={20} />Cancel selection</div>
              </Focusable>
            </div>
          </div>
        </Layer>
      )}
    </>
  )
}

/** Small ticks drawn over a poster while selecting. */
export function CheckMark({ checked }: { checked: boolean }) {
  return (
    <div className={`absolute left-2 top-2 z-10 grid size-7 place-items-center rounded-full ring-2 transition-colors ${checked ? 'bg-accent text-black ring-accent' : 'bg-black/55 text-transparent ring-white/60'}`}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
    </div>
  )
}
