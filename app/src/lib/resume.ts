// Coming back to the app after it was closed behind your back. On a TV the system often throws a backgrounded app away after a few minutes;
// these keep just enough to pick up where you were: the connection details (so the app opens straight away instead of reconnecting behind
// a loading screen) and, if something was playing, what it was and how far in.
import type { PlexProfile, PlexSection, PlexServer } from './plex'

const RESUME_KEY = 'chezzflix_resume'
const BOOT_KEY = 'chezzflix_boot'
export const RESUME_MAX_AGE_MS = 30 * 60_000    // a movie is picked up again if you come back within half an hour
export const BOOT_MAX_AGE_MS = 2 * 3600_000     // the app opens instantly if it was last used within two hours

export interface Resume { ratingKey: string; versionIndex?: number; offsetMs: number; paused: boolean; at: number; profile: string }
export interface BootSnap { token: string; server: PlexServer; sections: PlexSection[]; profiles: PlexProfile[]; me: { name: string; thumb?: string; key: string }; at: number }

const read = <T,>(k: string): T | undefined => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : undefined } catch { return undefined } }
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* full or private mode */ } }

export const saveResume = (r: Resume) => write(RESUME_KEY, r)
export const clearResume = () => { try { localStorage.removeItem(RESUME_KEY) } catch { /* ignore */ } }
export function loadResume(profile: string): Resume | undefined {
  const r = read<Resume>(RESUME_KEY)
  return r && r.profile === profile && Date.now() - r.at < RESUME_MAX_AGE_MS ? r : undefined
}

export const saveBoot = (s: BootSnap) => write(BOOT_KEY, s)
export const clearBoot = () => { try { localStorage.removeItem(BOOT_KEY) } catch { /* ignore */ } }
export function loadBoot(token: string): BootSnap | undefined {
  const s = read<BootSnap>(BOOT_KEY)
  return s && s.token === token && Date.now() - s.at < BOOT_MAX_AGE_MS && s.server?.uri && s.me?.key ? s : undefined
}
