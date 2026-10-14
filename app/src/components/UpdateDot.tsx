import { useUpdater } from '../lib/updater'

/** True while a newer version is waiting to be installed. */
export const useUpdatePending = () => useUpdater().status === 'available'

/** A small "!" badge: shown wherever the way to the pending update passes (the profile picture, Settings, About). */
export function UpdateDot({ className = '' }: { className?: string }) {
  return <span aria-label="Update available" title="Update available" className={`grid size-[17px] shrink-0 place-items-center rounded-full bg-accent text-[0.68rem] font-extrabold leading-none text-black shadow ring-2 ring-black/60 ${className}`}>!</span>
}
