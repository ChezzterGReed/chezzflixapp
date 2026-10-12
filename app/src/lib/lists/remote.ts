// The seasonal movie lists live in a file in the project's repo (docs/lists.json), so they can be updated without releasing a new app.
// The app fetches it when it starts (a couple of seconds at most), remembers the last copy it got, and falls back to the lists built in
// to the app if it has never been able to reach the file.
import type { Season } from '../settings'

export const LISTS_URL: string = import.meta.env.VITE_LISTS_URL || 'https://raw.githubusercontent.com/ChezzterGReed/chezzflixapp/main/docs/lists.json'
const KEY = 'chezzflix_remote_lists'
const FETCH_TIMEOUT_MS = 2500

type Entries = [string, number][]
let remote: Partial<Record<Exclude<Season, null>, Entries>> = {}

/** Keeps only well-formed [title, year] pairs (a typo in the file can't break the app). */
function clean(v: unknown): Entries | undefined {
  if (!Array.isArray(v)) return undefined
  const out = v.filter((e): e is [string, number] => Array.isArray(e) && typeof e[0] === 'string' && e[0].trim() !== '' && Number.isFinite(e[1])).map((e) => [e[0].trim(), Math.round(e[1])] as [string, number])
  return out.length ? out : undefined
}
function adopt(data: unknown) {
  const lists = (data as { lists?: Record<string, unknown> } | null)?.lists
  if (!lists) return
  const next: typeof remote = {}
  for (const s of ['halloween', 'christmas'] as const) { const e = clean(lists[s]); if (e) next[s] = e }
  remote = { ...remote, ...next }
}

try { adopt(JSON.parse(localStorage.getItem(KEY) ?? 'null')) } catch { /* nothing remembered yet */ }

let started: Promise<void> | undefined
/** Fetches the latest lists once per run. Never throws; resolves when the file is in, or after a short wait / on any problem. */
export function ensureRemoteLists(): Promise<void> {
  started ??= (async () => {
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS)
      const r = await fetch(LISTS_URL, { signal: ctl.signal, cache: 'no-cache' }).finally(() => clearTimeout(t))
      if (!r.ok) return
      const data = await r.json()
      adopt(data)
      try { localStorage.setItem(KEY, JSON.stringify(data)) } catch { /* private mode */ }
    } catch { /* offline, or the file moved: keep what we have */ }
  })()
  return started
}

/** The season's list from the file if there is one, else the one built in. */
export const entriesFor = (season: Exclude<Season, null>, builtIn: Entries): Entries => remote[season] ?? builtIn
