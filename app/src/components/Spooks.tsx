import { useArtId } from './Pumpkin'

/** A cute bat in the shared flat style: purple wings and body with one darker shade, big shiny eyes, two tiny fangs. */
export function Bat({ size = 28, className = '' }: { size?: number; className?: string }) {
  const k = useArtId()
  const wings = 'M36 14C30 6 20 3 7 6C11 10 10 15 5 20C12 19 15 23 15 29C19 25 24 25 27 30C29 26 33 25 36 27C39 25 43 26 45 30C48 25 53 25 57 29C57 23 60 19 67 20C62 15 61 10 65 6C52 3 42 6 36 14Z'
  return (
    <svg viewBox="0 0 72 44" width={size * 1.64} height={size} className={className} aria-hidden>
      <defs><clipPath id={`w${k}`}><path d={wings} /><ellipse cx="36" cy="23" rx="10.500" ry="12" /></clipPath></defs>
      <path d={wings} fill="#8266e6" />
      <path d="M27 11L25 3L32 8ZM45 11L47 3L40 8Z" fill="#8266e6" />
      <ellipse cx="36" cy="23" rx="10.500" ry="12" fill="#8f74ef" />
      <g clipPath={`url(#w${k})`}><ellipse cx="36" cy="46" rx="44" ry="19" fill="#6446c4" /></g>
      <circle cx="31.500" cy="21" r="3.700" fill="#fff" /><circle cx="40.500" cy="21" r="3.700" fill="#fff" />
      <circle cx="32.200" cy="21.700" r="2" fill="#2b1a55" /><circle cx="39.800" cy="21.700" r="2" fill="#2b1a55" />
      <circle cx="32.900" cy="20.900" r=".75" fill="#fff" /><circle cx="40.500" cy="20.900" r=".75" fill="#fff" />
      <path d="M32.500 27.800Q36 30.500 39.500 27.800" stroke="#2b1a55" strokeWidth="1.500" strokeLinecap="round" fill="none" />
      <path d="M33.200 28.300l.9 2.300.9-1.700M38.800 28.300l-.9 2.300-.9-1.700" fill="#fff" />
      <circle cx="29" cy="26.500" r="1.800" fill="#ff7aa8" opacity=".45" /><circle cx="43" cy="26.500" r="1.800" fill="#ff7aa8" opacity=".45" />
    </svg>
  )
}

/** A friendly little ghost in the shared flat style: one soft white body with a single shade on the right, big shiny eyes, rosy cheeks. */
export function Ghost({ size = 28, className = '' }: { size?: number; className?: string }) {
  const k = useArtId()
  const body = 'M28 4C15 4 8 13 8 26V52C8 55 11 56 13 54L17 50L22 55C24 57 26 57 28 55C30 57 32 57 34 55L39 50L43 54C45 56 48 55 48 52V26C48 13 41 4 28 4Z'
  return (
    <svg viewBox="0 0 56 64" width={size * 0.875} height={size} className={className} aria-hidden>
      <defs><clipPath id={`g${k}`}><path d={body} /></clipPath></defs>
      <ellipse cx="28" cy="60.500" rx="15" ry="2.400" fill="#000" opacity=".2" />
      <path d={body} fill="#fafaff" />
      <g clipPath={`url(#g${k})`}><ellipse cx="54" cy="40" rx="15" ry="34" fill="#dcdff5" /><path d="M13 22C14 15 19 10 26 9" stroke="#fff" strokeWidth="2.400" strokeLinecap="round" fill="none" /></g>
      <ellipse cx="21" cy="26" rx="3.700" ry="4.900" fill="#2b2a4a" /><ellipse cx="35" cy="26" rx="3.700" ry="4.900" fill="#2b2a4a" />
      <circle cx="22.300" cy="24.200" r="1.400" fill="#fff" /><circle cx="36.300" cy="24.200" r="1.400" fill="#fff" />
      <ellipse cx="28" cy="35" rx="2.400" ry="3" fill="#2b2a4a" />
      <circle cx="14.500" cy="33" r="3" fill="#ff8fb0" opacity=".5" /><circle cx="41.500" cy="33" r="3" fill="#ff8fb0" opacity=".5" />
    </svg>
  )
}
