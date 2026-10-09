import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, Loader2, Plus, Smartphone, Star } from 'lucide-react'
import { setFocus } from '@noriginmedia/norigin-spatial-navigation'
import { Layer } from './Layer'
import { Focusable } from './Focusable'
import { QrCode } from './QrCode'
import { getState, normalizeBase, RequestError, submitRequest, webUrl, type RequestItem, type RequestState, type SeasonInfo } from '../lib/overseerr'
import { tmdbSeasons } from '../lib/tmdb'

const STATE_TEXT: Record<RequestState, string> = { none: '', pending: 'Requested', processing: 'Being added', partial: 'Partly available', available: 'Available' }

function Pill({ children, onEnter, on, disabled }: { children: React.ReactNode; onEnter: () => void; on?: boolean; disabled?: boolean }) {
  return (
    <Focusable onEnter={() => !disabled && onEnter()}>
      <div className={`whitespace-nowrap rounded-full px-5 py-2.5 text-[0.95rem] font-semibold transition-colors group-hover/f:bg-white/20 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${disabled ? 'bg-white/5 text-white/30' : on ? 'bg-accent text-black' : 'bg-white/10 text-white/70'}`}>{children}</div>
    </Focusable>
  )
}

interface Props { item: RequestItem; base: string; plexToken: string; tmdbKey: string; onClose: () => void }

/** The page for a title that isn't in the library: just a big Request button (and, for shows, which seasons). */
export function RequestDetail({ item, base, plexToken, tmdbKey, onClose }: Props) {
  const [phase, setPhase] = useState<'idle' | 'working' | 'done' | 'qr'>('idle')
  const [why, setWhy] = useState<string>()
  const [state, setState] = useState<RequestState>('none')
  const [seasons, setSeasons] = useState<SeasonInfo[]>([])
  const [picked, setPicked] = useState<Set<number> | 'all'>('all')
  const [note, setNote] = useState<string>()
  const url = useMemo(() => webUrl(base, item), [base, item])

  // Seasons come from TMDB; whether anything is already requested comes from the request service (if it will talk to us).
  useEffect(() => {
    let alive = true
    ;(async () => {
      const [ss, st] = await Promise.all([item.type === 'tv' ? tmdbSeasons(tmdbKey, item.tmdbId).catch(() => []) : Promise.resolve([]), getState(base, plexToken, item)])
      if (!alive) return
      if (st) { setState(st.state); setSeasons(ss.map((s) => ({ ...s, state: st.seasons.get(s.n) ?? 'none' }))) } else setSeasons(ss)
    })()
    return () => { alive = false }
  }, [item, base, plexToken, tmdbKey])
  useEffect(() => { const t = setTimeout(() => setFocus('request-btn'), 120); return () => clearTimeout(t) }, [])

  const free = seasons.filter((s) => s.state === 'none')
  const send = async () => {
    setPhase('working'); setNote(undefined)
    try {
      const chosen = picked === 'all' ? (seasons.length ? free.map((s) => s.n) : 'all') : [...picked].sort((a, b) => a - b)
      if (Array.isArray(chosen) && chosen.length === 0) { setPhase('idle'); return setNote('Every season has already been requested.') }
      await submitRequest(base, plexToken, item, chosen)
      setState('pending'); setPhase('done')
    } catch (e) {
      const err = e as RequestError
      if (err.kind === 'exists') { setState('pending'); return setPhase('done') }
      if (err.kind === 'rejected') { setPhase('idle'); return setNote(err.message) }
      setWhy(err.message); setPhase('qr')   // couldn't do it from here: finish on a phone
    }
  }
  const toggle = (n: number) => setPicked((cur) => {
    const set = new Set(cur === 'all' ? free.map((s) => s.n) : cur)
    if (set.has(n)) set.delete(n); else set.add(n)
    return set.size === free.length ? 'all' : set
  })
  const showSeasons = item.type === 'tv' && seasons.length > 1
  const requested = state !== 'none' && state !== 'partial'

  return (
    <Layer onClose={onClose} scrim="bg-bg" className="absolute inset-0 overflow-y-auto overflow-x-hidden">
      <div className="relative min-h-full pb-24">
        <div className="absolute inset-x-0 top-0 h-[78vh] min-h-[560px] overflow-hidden">
          {(item.backdrop ?? item.poster) && <img src={item.backdrop ?? item.poster} alt="" draggable={false} className="fade-in h-full w-full object-cover object-[50%_20%]" />}
          <div className="absolute inset-0 bg-linear-to-r from-bg via-bg/75 via-40% to-bg/10" />
          <div className="absolute inset-0 bg-linear-to-t from-bg via-bg/40 via-45% to-transparent" />
        </div>

        <div className="relative px-[var(--gutter)] pt-8">
          <Focusable focusKey="request-back" onEnter={onClose} title="Back">
            <div className="inline-flex h-11 items-center gap-2 rounded-full bg-black/35 pl-3 pr-5 text-sm font-semibold backdrop-blur-md transition-colors group-hover/f:bg-white/20 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><ArrowLeft size={18} />Back</div>
          </Focusable>

          <div className="fade-up mt-[12vh] max-w-[46rem]">
            <h1 className="mb-4 text-[clamp(2.6rem,5.2vw,5rem)] font-extrabold leading-[0.98] tracking-[-0.035em]">{item.title}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.95rem] font-medium text-white/85">
              {item.rating ? <span className="flex items-center gap-1 font-bold"><Star size={15} className="fill-accent text-accent" />{item.rating.toFixed(1)}</span> : null}
              {[item.year, item.type === 'tv' ? 'Series' : 'Movie'].filter(Boolean).map((b, i) => <span key={i} className="flex items-center gap-3">{(i > 0 || item.rating) ? <i className="size-1 rounded-full bg-white/40" /> : null}{b}</span>)}
              <span className="rounded-full bg-white/12 px-3 py-0.5 text-[0.78rem] font-semibold text-white/80">Not in your library</span>
            </div>
            {item.overview && <p className="mt-5 max-w-[40rem] text-[1.05rem] leading-relaxed text-white/80">{item.overview}</p>}

            {phase !== 'qr' && showSeasons && !requested && (
              <div className="mt-8">
                <div className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-white/45">Seasons</div>
                <div className="flex flex-wrap gap-2.5">
                  <Pill on={picked === 'all'} onEnter={() => setPicked('all')}>{free.length === seasons.length ? 'All seasons' : 'All remaining'}</Pill>
                  {seasons.map((s) => (
                    <Pill key={s.n} disabled={s.state !== 'none'} on={s.state === 'none' && picked !== 'all' && picked.has(s.n)} onEnter={() => toggle(s.n)}>
                      {s.name.replace(/^Season\s*/i, 'S')}{s.state !== 'none' ? ` · ${STATE_TEXT[s.state]}` : ''}
                    </Pill>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-9">
              {phase === 'done' || requested ? (
                <div className="pop flex items-center gap-4">
                  <span className="grid size-14 place-items-center rounded-full bg-accent text-black"><Check size={28} strokeWidth={3} /></span>
                  <div><div className="text-xl font-extrabold">{state === 'available' ? 'Available now' : state === 'processing' ? 'On its way' : 'Requested'}</div>
                    <div className="text-white/60">{state === 'available' ? 'Look for it in your library.' : "It'll show up in your library once it's ready."}</div></div>
                </div>
              ) : phase === 'qr' ? null : (
                <>
                  <Focusable focusKey="request-btn" onEnter={() => phase === 'idle' && send()} title="Request">
                    <div className="inline-flex h-16 min-w-72 items-center justify-center gap-3 rounded-full bg-accent px-12 text-[1.2rem] font-extrabold text-black shadow-[0_18px_44px_-12px_var(--accent)] transition-all duration-200 group-hover/f:brightness-110 group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:ring-4 group-data-[hl=true]/f:ring-white">
                      {phase === 'working' ? <><Loader2 size={24} className="animate-spin" />Sending…</> : <><Plus size={26} strokeWidth={3} />Request</>}
                    </div>
                  </Focusable>
                  {note && <p className="mt-4 max-w-md text-red-300">{note}</p>}
                  <Focusable focusKey="request-phone" onEnter={() => { setWhy(undefined); setPhase('qr') }} title="Use my phone instead">
                    <div className="mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white/55 transition-colors group-hover/f:text-white group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black"><Smartphone size={16} />Use my phone instead</div>
                  </Focusable>
                </>
              )}
            </div>

            {phase === 'qr' && (
              <div className="pop mt-2 flex flex-wrap items-center gap-8 rounded-3xl bg-white/6 p-7 ring-1 ring-white/10">
                <QrCode value={url} size={240} />
                <div className="min-w-0 max-w-sm">
                  <div className="text-2xl font-extrabold tracking-tight">Finish on your phone</div>
                  <p className="mt-2 text-white/70">Scan this with your phone's camera. It opens this title on the request page — sign in with Plex and press Request.</p>
                  {why && <p className="mt-3 text-sm text-amber-200/80">{why}</p>}
                  <p className="mt-3 break-all text-xs text-white/40">{url.replace(normalizeBase(base), new URL(normalizeBase(base)).host)}</p>
                  <Focusable focusKey="request-qr-back" onEnter={() => setPhase('idle')} title="Back to request">
                    <div className="mt-5 inline-block rounded-full bg-white/12 px-5 py-2.5 text-sm font-semibold transition-colors group-hover/f:bg-white/25 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">Back</div>
                  </Focusable>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layer>
  )
}
