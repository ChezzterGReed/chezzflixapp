#!/usr/bin/env node
// Locks values (your TMDB key, your Overseerr address) so only people connected to YOUR Plex server can use them, then stores the locked blobs in the app.
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
const tmdb = await ask('TMDB API key (hidden; Enter to keep what is already saved): ', true)
const overseerr = await ask('Overseerr address, e.g. requests.example.com (Enter to keep what is already saved): ')
rl.close()
if (!serverId) { console.error('A Server ID is required.'); process.exit(1) }

const all = JSON.parse(readFileSync(FILE, 'utf8'))
async function put(name, plain) {
  if (!plain) return
  const blob = await seal(plain, serverId, name)
  if ((await unseal(blob, serverId, name)) !== plain || (await unseal(blob, serverId + 'x', name)) !== null) { console.error(`Self-check failed for ${name}; nothing written.`); process.exit(1) }
  all[name] = blob
  console.log(`✔ ${name} locked`)
}
await put('tmdb', tmdb)
await put('overseerr', overseerr.replace(/\/+$/, ''))
writeFileSync(FILE, JSON.stringify(all, null, 2) + '\n')
console.log('\nSaved to app/src/lib/sealed-keys.json. It only unlocks on your server.\n  Next: commit it and publish a new version so installed apps pick it up.')
