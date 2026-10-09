import { useEffect, useState } from 'react'
import { Check, Delete, LogOut, Settings as Cog } from 'lucide-react'
import { Layer } from './Layer'
import { Focusable } from './Focusable'
import { Avatar } from './Avatar'
import type { PlexProfile } from '../lib/plex'

function Item({ onEnter, children, danger }: { onEnter: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <Focusable onEnter={onEnter}>
      <div className={`flex h-12 items-center gap-3 rounded-xl px-3 text-[0.95rem] font-semibold transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${danger ? 'text-white/60' : ''}`}>{children}</div>
    </Focusable>
  )
}

export function PinPad({ name, thumb, error, onSubmit, onCancel }: { name: string; thumb?: string; error?: string; onSubmit: (pin: string) => void; onCancel: () => void }) {
  const [pin, setPin] = useState('')
  const press = (d: string) => {
    const next = (pin + d).slice(0, 4)
    setPin(next)
    if (next.length === 4) onSubmit(next)
  }
  // Physical number keys (desktop) — Backspace is left to the global Back handler only when the pad is empty.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace' && pin) { e.stopPropagation(); setPin((p) => p.slice(0, -1)) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })
  return (
    <Layer onClose={onCancel} scrim="bg-black/75 backdrop-blur-md" className="absolute left-1/2 top-1/2 w-[340px] -translate-x-1/2 -translate-y-1/2 text-center">
      <div className="pop rounded-3xl bg-surface p-8 shadow-2xl ring-1 ring-white/10">
        <div className="mb-3 flex justify-center"><Avatar name={name} thumb={thumb} size={64} /></div>
        <div className="text-lg font-bold">{name}</div>
        <div className="mt-1 text-sm text-white/60">{error ?? 'Enter your 4-digit PIN'}</div>
        <div className="my-6 flex justify-center gap-3">{[0, 1, 2, 3].map((i) => <i key={i} className={`size-3.5 rounded-full border-2 transition-colors ${i < pin.length ? 'border-accent bg-accent' : 'border-white/30'}`} />)}</div>
        <div className="grid grid-cols-3 gap-2.5">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'x', '0', '⌫'].map((k) => k === 'x' ? <div key={k} /> : (
            <Focusable key={k} onEnter={() => k === '⌫' ? setPin(pin.slice(0, -1)) : press(k)}>
              <div className="grid h-14 place-items-center rounded-xl bg-white/8 text-xl font-bold transition-colors group-hover/f:bg-white/15 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">{k === '⌫' ? <Delete size={22} /> : k}</div>
            </Focusable>
          ))}
        </div>
      </div>
    </Layer>
  )
}

interface Props {
  profiles: PlexProfile[]
  currentName: string
  onClose: () => void
  onSwitch: (p: PlexProfile, pin?: string) => Promise<void>
  onSettings: () => void
  onSignOut: () => void
}

export function ProfileMenu({ profiles, currentName, onClose, onSwitch, onSettings, onSignOut }: Props) {
  const [pinFor, setPinFor] = useState<PlexProfile>()
  const [error, setError] = useState<string>()

  const choose = async (p: PlexProfile, pin?: string) => {
    if (p.title === currentName) return onClose()
    if (p.protected && !pin) { setError(undefined); return setPinFor(p) }
    try { await onSwitch(p, pin); onClose() } catch (e) { setError((e as Error).message); setPinFor(p) }
  }

  if (pinFor) return <PinPad name={pinFor.title} thumb={pinFor.thumb} error={error} onCancel={() => setPinFor(undefined)} onSubmit={(pin) => choose(pinFor, pin)} />

  return (
    <Layer onClose={onClose} scrim="bg-black/40" className="absolute bottom-6 left-[calc(var(--rail)+12px)] w-[300px]">
      <div className="pop rounded-2xl bg-[#17171c]/95 p-2 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10 backdrop-blur-2xl">
        <div className="px-3 pb-1 pt-2 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-white/40">Who's watching?</div>
        {profiles.map((p) => (
          <Item key={p.uuid} onEnter={() => choose(p)}>
            <Avatar name={p.title} thumb={p.thumb} size={32} /><span className="flex-1 truncate">{p.title}</span>
            {p.protected && <span className="text-[0.7rem] text-white/45">PIN</span>}
            {p.title === currentName && <Check size={18} className="text-accent" />}
          </Item>
        ))}
        <div className="my-2 h-px bg-white/10" />
        <Item onEnter={onSettings}><Cog size={20} className="ml-1 mr-0.5" />Settings</Item>
        <Item onEnter={onSignOut} danger><LogOut size={20} className="ml-1 mr-0.5" />Sign out</Item>
      </div>
    </Layer>
  )
}
