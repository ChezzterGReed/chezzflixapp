#!/usr/bin/env node
// Checks which channels of one or more M3U playlists actually play from this machine, and writes the answers to a JSON file.
//   node scripts/m3u-check.mjs <out.json> <playlist.m3u|folder> [more...] [--country us,ca] [--concurrency 40]
// A channel is "alive" when its HLS playlist loads and the first video segment answers (other streams: when bytes arrive).
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseM3U } from '../app/src/lib/liveParse.ts'

const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf(`--${n}`); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v }
const countries = (opt('country', '') || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
const conc = Number(opt('concurrency', 40))
const [outFile, ...inputs] = args
if (!outFile || !inputs.length) { console.error('usage: m3u-check.mjs <out.json> <playlist|folder>... [--country us] [--concurrency 40]'); process.exit(1) }

const files = inputs.flatMap((p) => (statSync(p).isDirectory() ? readdirSync(p).filter((f) => f.endsWith('.m3u')).map((f) => join(p, f)) : [p]))
const countryOf = (c) => /\.([a-z]{2})(@|$)/i.exec(c.epg ?? '')?.[1]?.toLowerCase() ?? '??'
const byUrl = new Map()
for (const f of files) for (const c of parseM3U(readFileSync(f, 'utf8')).channels) {
  if (countries.length && !countries.includes(countryOf(c))) continue
  const e = byUrl.get(c.url)
  if (e) { e.files.push(f.split('/').pop()); for (const g of c.groups) if (!e.groups.includes(g)) e.groups.push(g) } else byUrl.set(c.url, { ...c, files: [f.split('/').pop()] })
}
const list = [...byUrl.values()]
const prev = existsSync(outFile) ? new Map(JSON.parse(readFileSync(outFile, 'utf8')).map((r) => [r.url, r])) : new Map()
console.log(`${list.length} channels to check (${prev.size} already known)`)

const UA = 'VLC/3.0.20 LibVLC/3.0.20'
async function get(url, ms, range, ua, ref) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms)
  try {
    const r = await fetch(url, { signal: ac.signal, redirect: 'follow', headers: { 'User-Agent': ua || UA, ...(ref ? { Referer: ref } : {}), ...(range ? { Range: range } : {}) } })
    return r
  } catch { clearTimeout(t); return null }
}
async function text(r, max = 400_000) {
  const reader = r.body.getReader(), dec = new TextDecoder(); let s = ''
  while (s.length < max) { const { done, value } = await reader.read(); if (done) break; s += dec.decode(value, { stream: true }) }
  reader.cancel().catch(() => {}); return s
}
const abs = (base, p) => new URL(p, base).href
async function check(c) {
  const t0 = Date.now()
  let r = await get(c.url, 9000, undefined, c.ua, c.referrer)
  if (!r) return { ok: false, why: 'no answer' }
  if (!r.ok) return { ok: false, why: `http ${r.status}` }
  const ct = r.headers.get('content-type') ?? ''
  if (!/\.m3u8?(\?|$)/i.test(c.url) && !/mpegurl/i.test(ct)) {   // not HLS: any bytes at all
    const reader = r.body.getReader(); const { value } = await reader.read().catch(() => ({})); reader.cancel().catch(() => {})
    return value?.length ? { ok: true, ms: Date.now() - t0, kind: 'direct' } : { ok: false, why: 'empty' }
  }
  let body = await text(r), base = r.url || c.url
  if (!body.includes('#EXTM3U')) return { ok: false, why: 'not a playlist' }
  for (let hop = 0; hop < 2 && body.includes('#EXT-X-STREAM-INF'); hop++) {   // a master playlist: follow the first stream
    const lines = body.split(/\r?\n/), i = lines.findIndex((l) => l.startsWith('#EXT-X-STREAM-INF'))
    const next = lines.slice(i + 1).find((l) => l && !l.startsWith('#'))
    if (!next) return { ok: false, why: 'empty master' }
    const u = abs(base, next); const r2 = await get(u, 9000, undefined, c.ua, c.referrer)
    if (!r2 || !r2.ok) return { ok: false, why: r2 ? `variant ${r2.status}` : 'variant no answer' }
    body = await text(r2); base = r2.url || u
  }
  const seg = body.split(/\r?\n/).find((l) => l && !l.startsWith('#'))
  if (!seg) return { ok: false, why: 'no segments' }
  const s = await get(abs(base, seg), 9000, 'bytes=0-2047', c.ua, c.referrer)
  if (!s || !(s.ok || s.status === 206)) return { ok: false, why: s ? `segment ${s.status}` : 'segment no answer' }
  const reader = s.body.getReader(); const { value } = await reader.read().catch(() => ({})); reader.cancel().catch(() => {})
  return value?.length ? { ok: true, ms: Date.now() - t0, kind: 'hls' } : { ok: false, why: 'empty segment' }
}

const results = []
let i = 0, done = 0
await Promise.all(Array.from({ length: conc }, async () => {
  while (i < list.length) {
    const c = list[i++]
    const known = prev.get(c.url)
    const r = known ?? { url: c.url, ...(await check(c).catch((e) => ({ ok: false, why: String(e) }))) }
    results.push({ url: c.url, id: c.id, name: c.name, groups: c.groups, files: c.files, epg: c.epg, country: countryOf(c), quality: c.quality, notes: c.notes, logo: c.logo, ua: c.ua, referrer: c.referrer, ok: r.ok, why: r.why, ms: r.ms })
    if (++done % 100 === 0) { console.log(`${done}/${list.length}  alive so far: ${results.filter((x) => x.ok).length}`); writeFileSync(outFile, JSON.stringify(results)) }
  }
}))
writeFileSync(outFile, JSON.stringify(results))
console.log(`done: ${results.filter((x) => x.ok).length} alive of ${results.length}`)
