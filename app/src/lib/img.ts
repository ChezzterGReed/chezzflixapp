import { useEffect, useRef, useState } from 'react'

const DELAYS = [800, 2500, 6000, 12000]   // ms before each new attempt

/**
 * A picture that tries again when it fails to load (the server can be busy while a list refreshes, and a failed picture would otherwise stay
 * broken until something remounted it). Each attempt asks for a slightly different address, so the browser doesn't reuse the failure.
 * Use `src` and `onError` on the <img>.
 */
export function useImgRetry(src: string | undefined): { src: string | undefined; onError: () => void } {
  const [n, setN] = useState(0)
  const timer = useRef(0)
  useEffect(() => { setN(0); return () => clearTimeout(timer.current) }, [src])
  const url = src && n ? `${src}${src.includes('?') ? '&' : '?'}_r=${n}` : src
  const onError = () => {
    if (n >= DELAYS.length) return
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setN((x) => x + 1), DELAYS[n])
  }
  return { src: url, onError }
}
