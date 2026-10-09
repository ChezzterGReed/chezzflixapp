import { useEffect, useMemo, useState } from 'react'
import { Check, Film, Loader2, Lock, Tv } from 'lucide-react'
import { setFocus } from '@noriginmedia/norigin-spatial-navigation'
import { Avatar } from '../components/Avatar'
import { Focusable } from '../components/Focusable'
import { BrandMark, OnboardingShell } from '../components/OnboardingShell'
import { PinPad } from '../components/ProfileMenu'
import { reveal } from '../lib/scroll'
import { getGenres, type PlexProfile, type PlexSection, type PlexServer } from '../lib/plex'
import { POPULAR_GENRES } from '../lib/homeData'

/** "Who's watching?" — shown the first time you sign in on a device. */
export function ProfilePicker({ profiles, onPick, onSignOut }: { profiles: PlexProfile[]; onPick: (p: PlexProfile, pin?: string) => Promise<void>; onSignOut: () => void }) {
  const [pinFor, setPinFor] = useState<PlexProfile>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState<string>()

  useEffect(() => { const t = setTimeout(() => setFocus(`profile-${profiles[0]?.uuid}`), 250); return () => clearTimeout(t) }, [profiles])

  const choose = async (p: PlexProfile, pin?: string) => {
    if (p.protected && !pin) { setError(undefined); return setPinFor(p) }
    setBusy(p.uuid)
    try { await onPick(p, pin) } catch (e) { setBusy(undefined); setError((e as Error).message); if (p.protected) setPinFor(p) }
  }

  return (
    <OnboardingShell>
      <div className="fade-up w-full max-w-4xl text-center">
        <BrandMark />
        <h1 className="mt-10 text-[clamp(2rem,4vw,3rem)] font-extrabold tracking-[-0.035em]">Who's watching?</h1>
        <p className="mt-2 text-white/55">Pick your profile. Your row layout, libraries and look follow you.</p>
        <div className="mt-12 flex flex-wrap justify-center gap-x-9 gap-y-10">
          {profiles.map((p, n) => (
            <Focusable key={p.uuid} focusKey={`profile-${p.uuid}`} onEnter={() => !busy && choose(p)} onFocus={(el) => reveal(el)} title={p.title}>
              <div className="letter-in group/tile flex w-36 flex-col items-center" style={{ animationDelay: `${n * 90}ms` }}>
                <div className="relative transition-transform duration-300 ease-out-expo group-hover/f:scale-105 group-data-[hl=true]/f:scale-110">
                  <div className="rounded-full p-1 transition-all duration-300 group-hover/f:ring-4 group-hover/f:ring-white/40 group-data-[hl=true]/f:ring-4 group-data-[hl=true]/f:ring-accent">
                    <Avatar name={p.title} thumb={p.thumb} size={128} />
                  </div>
                  {p.protected && <span className="absolute bottom-1 right-1 grid size-8 place-items-center rounded-full bg-black/70 ring-1 ring-white/20 backdrop-blur"><Lock size={15} /></span>}
                  {busy === p.uuid && <span className="absolute inset-1 grid place-items-center rounded-full bg-black/60"><Loader2 className="animate-spin" /></span>}
                </div>
                <div className="mt-4 max-w-full truncate text-lg font-semibold text-white/70 transition-colors group-hover/f:text-white group-data-[hl=true]/f:text-white">{p.title}</div>
              </div>
            </Focusable>
          ))}
        </div>
        {error && !pinFor && <p className="mt-8 text-red-300">{error}</p>}
        <Focusable focusKey="profile-signout" onEnter={onSignOut} onFocus={(el) => reveal(el)}>
          <div className="mx-auto mt-14 inline-block rounded-full px-5 py-2.5 text-sm font-semibold text-white/45 transition-colors group-hover/f:text-white group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">Use a different Plex account</div>
        </Focusable>
      </div>
      {pinFor && <PinPad name={pinFor.title} thumb={pinFor.thumb} error={error} onCancel={() => { setPinFor(undefined); setError(undefined) }} onSubmit={(pin) => { setPinFor(undefined); choose(pinFor, pin) }} />}
    </OnboardingShell>
  )
}

/** Choose which libraries appear in the menu and on Home. Shown once per profile. */
export function LibrarySetup({ sections, hidden, name, thumb, onDone }: { sections: PlexSection[]; hidden: string[]; name: string; thumb?: string; onDone: (hiddenKeys: string[]) => void }) {
  const [on, setOn] = useState<Set<string>>(() => new Set(sections.filter((s) => !hidden.includes(s.key)).map((s) => s.key)))
  useEffect(() => { const t = setTimeout(() => setFocus(`lib-${sections[0]?.key}`), 250); return () => clearTimeout(t) }, [sections])

  const toggle = (k: string) => setOn((cur) => {
    const next = new Set(cur)
    if (next.has(k)) { if (next.size > 1) next.delete(k) } else next.add(k)   // always keep at least one
    return next
  })
  const done = () => onDone(sections.filter((s) => !on.has(s.key)).map((s) => s.key))

  return (
    <OnboardingShell>
      <div className="fade-up w-[min(640px,100%)] text-center">
        <div className="mb-8 flex justify-center"><Avatar name={name} thumb={thumb} size={72} /></div>
        <h1 className="text-[clamp(1.8rem,3.4vw,2.6rem)] font-extrabold tracking-[-0.03em]">What should be on your home screen{name ? `, ${name}` : ''}?</h1>
        <p className="mx-auto mt-3 max-w-md text-white/55">Choose the libraries you want. You can change this any time in Settings → Libraries.</p>

        <div className="mt-10 space-y-3 text-left">
          {sections.map((s, n) => {
            const selected = on.has(s.key)
            return (
              <Focusable key={s.key} focusKey={`lib-${s.key}`} onEnter={() => toggle(s.key)} onFocus={(el) => reveal(el)} title={s.title}>
                <div className="letter-in flex items-center gap-4 rounded-2xl bg-white/[0.05] p-4 pr-5 ring-1 ring-white/10 transition-all duration-200 group-hover/f:bg-white/10 group-data-[hl=true]/f:scale-[1.02] group-data-[hl=true]/f:bg-white/15 group-data-[hl=true]/f:ring-2 group-data-[hl=true]/f:ring-accent" style={{ animationDelay: `${n * 70}ms` }}>
                  <span className={`grid size-12 shrink-0 place-items-center rounded-xl transition-colors ${selected ? 'bg-accent text-black' : 'bg-white/10 text-white/60'}`}>{s.type === 'movie' ? <Film size={22} /> : <Tv size={22} />}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-[1.08rem] font-bold">{s.title}</span>{s.title.toLowerCase().replace(/\s/g, '') !== (s.type === 'movie' ? 'movies' : 'tvshows') && <span className="text-sm text-white/50">{s.type === 'movie' ? 'Movies' : 'TV shows'}</span>}</span>
                  <span className={`grid size-8 shrink-0 place-items-center rounded-full transition-all ${selected ? 'scale-100 bg-accent text-black' : 'scale-90 bg-white/10 text-transparent'}`}><Check size={18} strokeWidth={3} /></span>
                </div>
              </Focusable>
            )
          })}
        </div>

        <Focusable focusKey="lib-continue" onEnter={done} onFocus={(el) => reveal(el)} title="Continue">
          <div className="mx-auto mt-10 inline-flex min-w-56 items-center justify-center rounded-full bg-accent px-10 py-4 text-[1.05rem] font-extrabold text-black shadow-[0_18px_40px_-12px_var(--accent)] transition-transform group-hover/f:scale-105 group-data-[hl=true]/f:scale-110 group-data-[hl=true]/f:ring-4 group-data-[hl=true]/f:ring-white">Continue</div>
        </Focusable>
      </div>
    </OnboardingShell>
  )
}

const genreMatches = (pick: string, title: string) => title.toLowerCase().startsWith(pick.toLowerCase()) || (/^sci-?fi$/i.test(pick) && /sci/i.test(title))

/** Pick the kinds of movies and shows you like; they become your default genre rows. Shown once per profile, after the libraries. */
export function GenreSetup({ server, sections, name, thumb, onDone }: { server: PlexServer; sections: PlexSection[]; name: string; thumb?: string; onDone: (genres: string[]) => void }) {
  const [available, setAvailable] = useState<string[]>()
  const [picked, setPicked] = useState<string[]>([])

  // Only offer genres that actually exist in the libraries you kept.
  useEffect(() => {
    let alive = true
    Promise.all(sections.map((s) => getGenres(server, s.key).catch(() => [])))
      .then((all) => { if (alive) { const titles = all.flat().map((g) => g.title); setAvailable(POPULAR_GENRES.filter((p) => titles.some((t) => genreMatches(p, t)))) } })
      .catch(() => alive && setAvailable(POPULAR_GENRES))
    return () => { alive = false }
  }, [server, sections])

  const list = useMemo(() => (available && available.length >= 4 ? available : available ? POPULAR_GENRES : undefined), [available])
  useEffect(() => { if (list) { const t = setTimeout(() => setFocus(`genre-${list[0]}`), 250); return () => clearTimeout(t) } }, [list])

  const toggle = (g: string) => setPicked((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]))

  return (
    <OnboardingShell>
      <div className="fade-up w-[min(760px,100%)] text-center">
        <div className="mb-8 flex justify-center"><Avatar name={name} thumb={thumb} size={72} /></div>
        <h1 className="text-[clamp(1.8rem,3.4vw,2.6rem)] font-extrabold tracking-[-0.03em]">What do you like to watch{name ? `, ${name}` : ''}?</h1>
        <p className="mx-auto mt-3 max-w-md text-white/55">Pick a few genres. They become the rows on your Home, Movies and Shows tabs, so what you love is always up front.</p>

        <div className="mt-10 flex min-h-40 flex-wrap justify-center gap-3">
          {!list ? <Loader2 className="mt-12 animate-spin text-white/40" size={34} /> : list.map((g, n) => {
            const on = picked.includes(g)
            return (
              <Focusable key={g} focusKey={`genre-${g}`} onEnter={() => toggle(g)} onFocus={(el) => reveal(el)} title={g}>
                <div className={`letter-in flex items-center gap-2 rounded-full px-6 py-3 text-[1.02rem] font-bold ring-1 transition-all duration-200 group-hover/f:bg-white/20 group-data-[hl=true]/f:scale-110 group-data-[hl=true]/f:ring-4 group-data-[hl=true]/f:ring-white ${on ? 'bg-accent text-black ring-accent' : 'bg-white/8 text-white/80 ring-white/10'}`} style={{ animationDelay: `${n * 35}ms` }}>
                  {on && <Check size={17} strokeWidth={3} />}{g}
                </div>
              </Focusable>
            )
          })}
        </div>

        <div className="mt-10 flex items-center justify-center gap-4">
          <Focusable focusKey="genre-continue" onEnter={() => onDone(picked)} onFocus={(el) => reveal(el)} title="Continue">
            <div className="inline-flex min-w-56 items-center justify-center rounded-full bg-accent px-10 py-4 text-[1.05rem] font-extrabold text-black shadow-[0_18px_40px_-12px_var(--accent)] transition-transform group-hover/f:scale-105 group-data-[hl=true]/f:scale-110 group-data-[hl=true]/f:ring-4 group-data-[hl=true]/f:ring-white">{picked.length ? `Continue · ${picked.length} picked` : 'Continue'}</div>
          </Focusable>
          <Focusable focusKey="genre-skip" onEnter={() => onDone([])} onFocus={(el) => reveal(el)} title="Skip">
            <div className="rounded-full px-5 py-3 text-sm font-semibold text-white/50 transition-colors group-hover/f:text-white group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">Skip</div>
          </Focusable>
        </div>
      </div>
    </OnboardingShell>
  )
}
