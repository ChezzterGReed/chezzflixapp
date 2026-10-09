import { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { setFocus } from '@noriginmedia/norigin-spatial-navigation'
import { Focusable } from '../components/Focusable'
import { BrandMark, OnboardingShell } from '../components/OnboardingShell'
import { authUrl, checkPin, requestPin } from '../lib/plex'

const ANDROID = /Android/i.test(navigator.userAgent)

async function openExternal(url: string) {
  if ('__TAURI_INTERNALS__' in window) {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
  } else {
    window.open(url, '_blank')
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** TV-friendly sign-in: a short code to enter at plex.tv/link on a phone or computer. Codes refresh before they expire. */
export function Login({ onToken }: { onToken: (t: string) => void }) {
  const [code, setCode] = useState<string>()
  const [error, setError] = useState<string>()
  const [browserOpen, setBrowserOpen] = useState(false)
  const run = useRef(0)   // bumped to cancel any polling loop that's been replaced

  const poll = useCallback(async (id: number, lifetimeMs: number, gen: number, onExpire?: () => void) => {
    const started = Date.now()
    while (gen === run.current) {
      await sleep(2000)
      if (gen !== run.current) return
      const t = await checkPin(id).catch(() => null)
      if (t) { run.current++; onToken(t); return }
      if (Date.now() - started > lifetimeMs - 5000) { onExpire?.(); return }
    }
  }, [onToken])

  const start = useCallback(async () => {
    const gen = ++run.current
    setError(undefined); setCode(undefined)
    try {
      const pin = await requestPin(false)
      if (gen !== run.current) return
      setCode(pin.code)
      poll(pin.id, (pin.expiresIn ?? 900) * 1000, gen, () => { if (gen === run.current) start() }) // about to expire: fetch a fresh code
    } catch (e) {
      if (gen === run.current) setError(`Couldn't reach Plex (${(e as Error).message}). Check your internet connection.`)
    }
  }, [poll])

  useEffect(() => { start(); return () => { run.current++ } }, [start])
  useEffect(() => { if (ANDROID) return; const t = setTimeout(() => setFocus('login-browser'), 250); return () => clearTimeout(t) }, []) // a remote needs somewhere to start

  const signInHere = async () => {
    const gen = run.current
    try {
      const pin = await requestPin(true)
      await openExternal(authUrl(pin.code))
      setBrowserOpen(true)
      poll(pin.id, (pin.expiresIn ?? 900) * 1000, gen)
    } catch { setError("Couldn't open the sign-in page.") }
  }

  const tiles = code ? [...code.toUpperCase()] : ['', '', '', '']

  return (
    <OnboardingShell>
      <div className="fade-up w-[min(540px,100%)] rounded-[2rem] bg-white/[0.045] p-9 text-center shadow-[0_40px_120px_-30px_rgba(0,0,0,.9)] ring-1 ring-white/12 backdrop-blur-2xl sm:p-12">
        <BrandMark />
        <h1 className="mt-9 text-[2rem] font-extrabold leading-tight tracking-[-0.03em]">Sign in with Plex</h1>
        <p className="mx-auto mt-2 max-w-sm text-[0.98rem] text-white/60">Link this device to your Plex account from your phone or computer. It only takes a moment.</p>

        <ol className="mx-auto mt-8 max-w-sm space-y-3.5 text-left text-[0.98rem]">
          <li className="flex items-center gap-3.5"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-sm font-extrabold text-black">1</span><span className="text-white/80">On another device, go to <b className="text-white">plex.tv/link</b></span></li>
          <li className="flex items-center gap-3.5"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-sm font-extrabold text-black">2</span><span className="text-white/80">Enter this code</span></li>
        </ol>

        <div className="mt-7 flex justify-center gap-3" aria-label={code ? `Your code is ${[...code].join(' ')}` : 'Getting your code'}>
          {tiles.map((ch, n) => (
            <div key={n + (code ?? '')} className={`grid size-[4.6rem] place-items-center rounded-2xl font-mono text-[2.7rem] font-bold leading-none ring-1 ring-white/15 sm:size-[5.2rem] ${code ? 'letter-in bg-black/45 text-white shadow-[inset_0_-3px_0_var(--accent)]' : 'skeleton'}`} style={{ animationDelay: `${n * 80}ms` }}>
              {ch}
            </div>
          ))}
        </div>

        {error ? (
          <div className="mt-7 space-y-4">
            <p className="text-[0.95rem] text-red-300">{error}</p>
            <Focusable focusKey="login-retry" onEnter={start}>
              <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-bold text-black transition-transform group-data-[hl=true]/f:scale-105"><RefreshCw size={18} />Try again</div>
            </Focusable>
          </div>
        ) : (
          <div className="mt-7 flex items-center justify-center gap-2.5 text-sm text-white/55">
            <span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-70" /><span className="relative inline-flex size-2.5 rounded-full bg-accent" /></span>
            {browserOpen ? 'Finish signing in in your browser…' : 'Waiting for you to enter the code…'}
          </div>
        )}

        {/* Android TV boxes usually have no web browser, so there the code on another device is the way in. */}
        {!ANDROID && (
          <>
            <div className="my-8 flex items-center gap-4 text-xs font-semibold uppercase tracking-[0.2em] text-white/30"><i className="h-px flex-1 bg-white/10" />or<i className="h-px flex-1 bg-white/10" /></div>

            <Focusable focusKey="login-browser" onEnter={signInHere}>
              <div className="mx-auto inline-flex items-center gap-2.5 rounded-full bg-white/10 px-6 py-3.5 text-[0.98rem] font-semibold transition-all group-hover/f:bg-white/20 group-data-[hl=true]/f:scale-105 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">
                <ExternalLink size={18} />Sign in on this device instead
              </div>
            </Focusable>
          </>
        )}
      </div>
    </OnboardingShell>
  )
}
