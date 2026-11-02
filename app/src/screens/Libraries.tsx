import { useState } from 'react'
import { Eye, EyeOff, Film, Tv } from 'lucide-react'
import { FocusContext, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { Focusable } from '../components/Focusable'
import { Library } from './Library'
import { useSettings } from '../lib/settings'
import type { PlexCollectionRef, PlexMedia, PlexSection, PlexServer } from '../lib/plex'

/** The Minimal layout's Libraries tab: every library down the left (switch each on or off for this profile), the chosen one's titles beside it. */
export function Libraries({ server, token, all, onOpen, onShuffle, onBrowse, onCollection, start }: {
  server: PlexServer; token: string; all: PlexSection[]
  onOpen: (m: PlexMedia) => void; onShuffle: (items: PlexMedia[]) => void; onBrowse: (s: PlexSection, kind: 'genres' | 'collections') => void; onCollection: (c: PlexCollectionRef) => void
  start?: PlexSection
}) {
  const { settings, update } = useSettings()
  const firstShown = all.find((s) => !settings.hiddenLibraries.includes(s.key)) ?? all[0]
  const [selKey, setSel] = useState((start ?? firstShown)?.key)
  const sel = all.find((s) => s.key === selKey) ?? firstShown
  const { ref, focusKey } = useFocusable({ focusKey: 'LIBNAV', saveLastFocusedChild: true, autoRestoreFocus: false })
  const toggle = (s: PlexSection) => {
    const off = settings.hiddenLibraries.includes(s.key)
    update({ hiddenLibraries: off ? settings.hiddenLibraries.filter((k) => k !== s.key) : [...settings.hiddenLibraries, s.key] })
  }
  return (
    <div className="min-h-screen pt-28">
      <FocusContext.Provider value={focusKey}>
        <aside ref={ref} className="fixed bottom-0 left-0 top-28 z-20 w-[19rem] overflow-y-auto overscroll-contain px-6 pb-10 m-hide-scroll">
          <div className="mb-3 px-2 font-display text-[1.05rem] uppercase tracking-[0.2em] text-white/70">Libraries</div>
          <div className="space-y-1.5">
            {all.map((s, i) => {
              const off = settings.hiddenLibraries.includes(s.key)
              return (
                <div key={s.key} className="flex items-center gap-1.5">
                  <div className="min-w-0 flex-1">
                    <Focusable focusKey={s.key === sel?.key ? 'lib-current' : `lib-${s.key}`} onEnter={() => setSel(s.key)} title={s.title} onArrow={(d) => { if (d === 'up' && i === 0) { setFocus('mtab-libraries'); return false } }}>
                      <div className={`flex h-12 items-center gap-3 rounded-xl px-3.5 text-[1rem] font-semibold transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${s.key === sel?.key ? 'bg-white/12 text-white' : off ? 'text-white/35' : 'text-white/70'}`}>
                        {s.type === 'movie' ? <Film size={20} /> : <Tv size={20} />}<span className="min-w-0 flex-1 truncate">{s.title}</span>
                      </div>
                    </Focusable>
                  </div>
                  <Focusable focusKey={`libeye-${s.key}`} onEnter={() => toggle(s)} title={off ? `Show ${s.title}` : `Hide ${s.title}`} onArrow={(d) => { if (d === 'up' && i === 0) { setFocus('mtab-libraries'); return false } }}>
                    <div className={`grid size-12 place-items-center rounded-xl transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${off ? 'text-white/35' : 'text-white/70'}`}>{off ? <EyeOff size={20} /> : <Eye size={20} />}</div>
                  </Focusable>
                </div>
              )
            })}
          </div>
          <p className="mt-4 px-2 text-[0.8rem] leading-snug text-white/40">The eye shows or hides a library on Home and in search. Hidden ones can still be opened here.</p>
        </aside>
      </FocusContext.Provider>
      <div className="ml-[19rem]" style={{ ['--gutter' as string]: '28px' }}>
        {sel && <Library key={sel.key} server={server} token={token} section={sel} onOpen={onOpen} onShuffle={onShuffle} onBrowse={(kind) => onBrowse(sel, kind)} onCollection={onCollection} />}
      </div>
    </div>
  )
}
