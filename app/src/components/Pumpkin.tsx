/** A little jack-o'-lantern for spooky season. */
export function Pumpkin({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden>
      <defs>
        <radialGradient id="pk" cx=".4" cy=".35" r=".8"><stop offset="0" stopColor="#ffb347" /><stop offset=".6" stopColor="#ff7a1a" /><stop offset="1" stopColor="#c2410c" /></radialGradient>
      </defs>
      <path d="M16 7c-1-3 0-5 2-6" stroke="#4d7c0f" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <ellipse cx="9.5" cy="19" rx="7" ry="9" fill="url(#pk)" />
      <ellipse cx="22.5" cy="19" rx="7" ry="9" fill="url(#pk)" />
      <ellipse cx="16" cy="19" rx="6" ry="10" fill="url(#pk)" />
      <path d="M11.5 17l2.4 3h-4.8zM20.5 17l2.4 3h-4.8z" fill="#3b1304" />
      <path d="M11 24c1.5 1.8 3 2.6 5 2.6s3.5-.8 5-2.6c-1.5.7-3.2 1-5 1s-3.5-.3-5-1z" fill="#3b1304" />
    </svg>
  )
}
