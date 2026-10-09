// "Sealed" values: a secret (e.g. the owner's TMDB key) locked with a key derived from the Plex server's ID.
// The locked blob can sit in the public repo: without the server ID it's unreadable, and the ID is only visible to people who
// have access to that server. People ON the server can unlock it (the app needs the real value to use it), so only seal things
// you're happy for them to see. Shared by the app and scripts/seal-key.mjs (keep this file free of non-erasable TypeScript).

export interface Sealed { v: 1; salt: string; iv: string; ct: string }

const ITER = 200_000
const enc = new TextEncoder()
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function keyFor(serverId: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(serverId.trim().toLowerCase()), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITER }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function seal(plain: string, serverId: string, purpose: string): Promise<Sealed> {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: enc.encode(purpose) }, await keyFor(serverId, salt), enc.encode(plain))
  return { v: 1, salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ct)) }
}

/** The plain value, or null if this server isn't the one it was sealed for (or the blob is missing/damaged). */
export async function unseal(blob: Sealed | undefined | null, serverId: string | undefined, purpose: string): Promise<string | null> {
  if (!blob || blob.v !== 1 || !serverId) return null
  try {
    const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) as BufferSource, additionalData: enc.encode(purpose) }, await keyFor(serverId, unb64(blob.salt)), unb64(blob.ct) as BufferSource)
    return new TextDecoder().decode(out)
  } catch { return null }
}
