import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/** A QR code drawn locally (nothing is sent to an outside service). Dark-on-white so phone cameras read it reliably. */
export function QrCode({ value, size = 280 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string>()
  useEffect(() => { let alive = true; QRCode.toDataURL(value, { margin: 2, width: size * 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }).then((u) => alive && setSrc(u)).catch(() => {}); return () => { alive = false } }, [value, size])
  return <div className="overflow-hidden rounded-2xl bg-white p-1 shadow-2xl" style={{ width: size, height: size }}>{src && <img src={src} alt="QR code" width={size} height={size} draggable={false} />}</div>
}
