#!/usr/bin/env node
// Locks your TMDB key so only people connected to YOUR Plex server can use it, then stores the locked blob in the app.
// Run:  node scripts/seal-key.mjs        (nothing you type here is sent anywhere or saved in plain text)
// Find your Server ID in Chezzflix: Settings → About → Server ID → Copy.
import { createInterface } from 'node:readline'
import { readFileSync, writeFileSync } from 'node:fs'
import { seal, unseal } from '../app/src/lib/sealed.ts'

const FILE = new URL('../app/src/lib/sealed-keys.json', import.meta.url)

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY })
let muted = false
const write = rl._writeToOutput?.bind(rl)
rl._writeToOutput = (str) => { if (!muted) write?.(str) }
const lines = rl[Symbol.asyncIterator]()   // buffers lines, so piped input and real typing both work
const ask = async (question, hidden = false) => {
  process.stdout.write(question)
  muted = hidden
  const { value } = await lines.next()
  muted = false
  if (hidden) process.stdout.write('\n')
  return (value ?? '').trim()
}

const serverId = await ask('Server ID: ')
const tmdb = await ask('TMDB API key (hidden): ', true)
rl.close()
if (!serverId || !tmdb) { console.error('Both are required.'); process.exit(1) }

const blob = await seal(tmdb, serverId, 'tmdb')
if ((await unseal(blob, serverId, 'tmdb')) !== tmdb) { console.error('Self-check failed; nothing written.'); process.exit(1) }
if ((await unseal(blob, serverId + 'x', 'tmdb')) !== null) { console.error('Self-check failed; nothing written.'); process.exit(1) }

const all = JSON.parse(readFileSync(FILE, 'utf8'))
all.tmdb = blob
writeFileSync(FILE, JSON.stringify(all, null, 2) + '\n')
console.log('\n✔ Locked and saved to app/src/lib/sealed-keys.json. It only unlocks on your server.\n  Next: commit it and publish a new version so installed apps pick it up.')
