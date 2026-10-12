import { dbLabel, type useLevelEngine } from '../lib/leveling'

type Note = NonNullable<ReturnType<typeof useLevelEngine>['note']>

const BUTTONS: Record<string, { label: string; aria: string }> = {
  yes: { label: 'Yes', aria: 'Yes, adjust the volume automatically' },
  no: { label: 'No', aria: 'No, leave the volume alone' },
  revert: { label: 'Revert', aria: 'Revert: switch the boost off for this title' },
  minus: { label: '−', aria: 'Quieter by 1 dB' },
  plus: { label: '+', aria: 'Louder by 1 dB' },
  dismiss: { label: 'Dismiss', aria: 'Close this' },
  disable: { label: 'Disable', aria: 'Turn auto leveling off' },
}

/** The small pill that talks about volume: scanning, the offer to adjust, the adjustment easing in (with the number climbing), and "complete". */
export function VolumePill({ note, gain, ids, active, onAct, hint }: { note: Note; gain: number; ids: string[]; active: number; onAct: (id: string, index: number) => void; hint: string }) {
  const db = dbLabel(Math.round(gain))
  const text = note.kind === 'measuring' ? 'Scanning this title to even out the volume. Please don’t change your device’s volume for a moment.'
    : note.kind === 'offer' ? `This title seems a little ${note.loud ? 'loud' : 'quiet'}. Would you like to automatically adjust the volume?`
    : note.kind === 'applying' ? `Adjusting the volume… ${db}`
    : Math.abs(note.gain) < 0.5 ? 'Volume checked: no change needed'
    : note.gain > 0 ? `Boost complete ${dbLabel(Math.round(note.gain))}` : `Volume lowered ${dbLabel(Math.round(note.gain))}`
  const sub = note.kind === 'applied' && Math.abs(note.gain) >= 0.5 ? hint : ''
  return (
    <div className="flex max-w-[min(780px,94vw)] items-center gap-4 rounded-3xl bg-black/75 px-5 py-3 text-sm font-semibold text-white shadow-xl ring-1 ring-white/10 backdrop-blur-md">
      <div className="min-w-0">
        <div className="tabular-nums">{text}</div>
        {sub && <div className="mt-0.5 text-xs font-medium text-white/60">{sub}</div>}
      </div>
      {ids.length > 0 && (
        <span className="flex shrink-0 items-center gap-1.5">
          {ids.map((id, i) => {
            const b = BUTTONS[id]
            const small = id === 'minus' || id === 'plus'
            return <button key={id} aria-label={b.aria} onClick={() => onAct(id, i)}
              className={`rounded-full px-3 py-1 text-xs font-bold transition active:scale-90 ${small ? 'min-w-8 text-sm' : ''} ${id === 'disable' ? 'text-red-200' : ''} ${active === i ? 'bg-white text-black' : 'bg-white/15 hover:bg-white/25'}`}>{b.label}</button>
          })}
        </span>
      )}
    </div>
  )
}
