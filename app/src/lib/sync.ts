// Keeps a person's settings the same on every device they use, through the small sync service in /sync-worker (it checks with Plex that
// the person is who they say, and stores their settings under a hash; it never holds a login). What goes up: preferences (colours, home layout,
// subtitle look, TV Guide channels...). What never does: the TMDB key, the Overseerr address, and settings that belong to one device.
//
// Merging is per setting: every setting remembers when it was last changed on this device, and for each one the newest change wins.
import type { Settings } from './settings'

/** Where the sync service lives (set once it's deployed; empty = sync is switched off everywhere). */
export const SYNC_URL: string = import.meta.env.VITE_SYNC_URL || ''   // e.g. https://chezzflix-sync.<you>.workers.dev

/** Settings that stay on the device: secrets, and things that depend on this particular hardware. */
export const NOT_SYNCED: readonly (keyof Settings | 'syncSettings')[] = ['tmdbKey', 'overseerrUrl', 'lightEffects', 'player', 'syncSettings']

export interface SyncAuth { token: string; serverId: string }
export type Meta = Record<string, number>
export interface Remote { found: boolean; updatedAt?: number; data?: { values: Record<string, unknown>; meta: Meta } }

const headers = (a: SyncAuth) => ({ 'X-Plex-Token': a.token, 'X-Server-Id': a.serverId })

export async function pullSettings(a: SyncAuth): Promise<Remote> {
  const r = await fetch(`${SYNC_URL}/v1/settings`, { headers: headers(a), cache: 'no-store' })
  if (!r.ok) throw new Error(`sync ${r.status}`)
  return r.json()
}
export async function pushSettings(a: SyncAuth, values: Record<string, unknown>, meta: Meta, retry = true): Promise<void> {
  const r = await fetch(`${SYNC_URL}/v1/settings`, { method: 'PUT', headers: { ...headers(a), 'Content-Type': 'application/json' }, body: JSON.stringify({ values, meta }) })
  if (r.status === 429 && retry) { await new Promise((res) => setTimeout(res, 1800)); return pushSettings(a, values, meta, false) }   // (the service spaces writes out a little)
  if (!r.ok) throw new Error(`sync ${r.status}`)
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
export const isSynced = (key: string) => !(NOT_SYNCED as readonly string[]).includes(key)

/** What a brand-new record of "when did I change this" looks like: anything already different from the defaults counts as an old change (time 1). */
export function initialMeta(current: Record<string, unknown>, defaults: Record<string, unknown>): Meta {
  const m: Meta = {}
  for (const k of Object.keys(defaults)) if (isSynced(k) && !same(current[k], defaults[k])) m[k] = 1
  return m
}

/**
 * Combines this device's settings with what the service has. For each setting the newer change wins (a tie goes to the service's copy, so
 * devices settle on the same thing). Returns what to take from the service, the merged "when changed" record, and whether this device has
 * anything newer to send.
 */
export function mergeSettings(local: Record<string, unknown>, localMeta: Meta, defaults: Record<string, unknown>, remote?: { values: Record<string, unknown>; meta: Meta }): { adopt: Record<string, unknown>; meta: Meta; push: boolean } {
  const adopt: Record<string, unknown> = {}, meta: Meta = { ...localMeta }
  let push = !remote
  for (const k of Object.keys(defaults)) {
    if (!isSynced(k)) continue
    const lt = localMeta[k] ?? 0
    if (remote && k in remote.values) {
      const rt = remote.meta[k] ?? 0
      if (rt >= lt) { if (!same(remote.values[k], local[k])) adopt[k] = remote.values[k]; meta[k] = rt }
      else push = true   // this device changed it more recently
    } else if (lt > 0) push = true   // the service has never heard of this one
  }
  return { adopt, meta, push }
}

export function syncedValues(settings: Record<string, unknown>, defaults: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(defaults)) if (isSynced(k)) out[k] = settings[k]
  return out
}
