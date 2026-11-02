import { LayoutDashboard, Users } from 'lucide-react'
import { Layer } from './Layer'
import { Focusable } from './Focusable'

/** The corner picture's menu for a server owner: the Dashboard, or switch profile. */
export function MinimalAccountMenu({ streams, onDashboard, onProfiles, onClose }: { streams?: number; onDashboard: () => void; onProfiles: () => void; onClose: () => void }) {
  const Item = ({ icon, label, badge, onEnter }: { icon: React.ReactNode; label: string; badge?: number; onEnter: () => void }) => (
    <Focusable onEnter={onEnter} title={label}>
      <div className="flex h-13 items-center gap-3 rounded-xl px-4 text-[1.02rem] font-semibold transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">
        {icon}<span className="flex-1">{label}</span>{!!badge && <span className="rounded-full bg-accent px-2 py-0.5 text-[0.75rem] font-extrabold text-black">{badge}</span>}
      </div>
    </Focusable>
  )
  return (
    <Layer onClose={onClose} scrim="bg-black/40" className="absolute bottom-24 right-10 w-[300px]">
      <div className="pop rounded-2xl bg-[#17171c]/95 p-2 shadow-[0_30px_80px_-10px_rgba(0,0,0,.9)] ring-1 ring-white/10 backdrop-blur-2xl">
        <Item icon={<LayoutDashboard size={21} />} label="Dashboard" badge={streams} onEnter={onDashboard} />
        <Item icon={<Users size={21} />} label="Switch profile" onEnter={onProfiles} />
      </div>
    </Layer>
  )
}
