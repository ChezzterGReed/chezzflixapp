#!/usr/bin/env node
// Builds one playlist from the answers of m3u-check.mjs, keeping only channels that play and the groups you want.
//   node scripts/m3u-merge.mjs <check.json> <out.m3u> [--exclude-groups Religious,Shop] [--include-groups Movies,Series] [--drop-geo] [--drop-names "regex"] [--epg url]
//                              [--clean]  other countries' feeds out, one version of each channel, local stations and not-24/7 channels out, slow streams out
//                              [--only Series=names.txt]  in that group keep only the channels named in the file (one per line); repeatable
//                              [--report report.txt]  what was removed and why (with --clean)
//                              [--names names.txt]    a plain list of what was kept, by group
// A channel's group is the first one it is listed under; --include-groups also keeps channels that are listed under it as a second group.
import { readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const flag = (n) => { const i = args.indexOf(`--${n}`); if (i < 0) return false; args.splice(i, 1); return true }
const opt = (n, d = '') => { const i = args.indexOf(`--${n}`); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v }
const list = (v) => v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
const include = list(opt('include-groups')), exclude = list(opt('exclude-groups'))
const dropGeo = flag('drop-geo'), dropNames = opt('drop-names') ? new RegExp(opt('drop-names'), 'i') : null
const epgOpt = opt('epg', 'https://epg.kanya.io/us/guide.xml.gz')
const onlyArgs = []
for (let i; (i = args.indexOf('--only')) >= 0; ) { onlyArgs.push(args[i + 1]); args.splice(i, 2) }
const norm = (n) => n.toLowerCase().replace(/\((united states|usa?)\)/g, ' ').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '')
const only = new Map(onlyArgs.map((a) => { const [g, f] = a.split('='); return [g.toLowerCase(), new Set(readFileSync(f, 'utf8').split(/\r?\n/).map((x) => x.trim()).filter(Boolean).map(norm))] }))
const clean = flag('clean'), reportFile = opt('report'), namesFile = opt('names'), keepLocals = flag('keep-locals')
const [inFile, outFile] = args
if (!inFile || !outFile) { console.error('usage: m3u-merge.mjs <check.json> <out.m3u> [options]'); process.exit(1) }

const all = JSON.parse(readFileSync(inFile, 'utf8')).filter((c) => c.ok)
const seen = new Set()
const keep = []
for (const c of all) {
  const groups = c.groups.map((g) => g.toLowerCase())
  if (exclude.includes(groups[0])) continue
  if (include.length && !groups.some((g) => include.includes(g))) continue
  if (dropGeo && c.notes?.some((n) => /geo/i.test(n))) continue
  if (dropNames && dropNames.test(c.name)) continue
  const key = c.epg ?? c.name.toLowerCase()   // the same channel listed twice: the first working one stays
  if (seen.has(key)) continue
  seen.add(key)
  const group = include.length ? c.groups.find((g) => include.includes(g.toLowerCase())) ?? c.groups[0] : c.groups[0]
  keep.push({ ...c, group })
}
const removed = []
if (clean) {
  // Feeds made for other countries or languages (the id says US, the name says otherwise).
  const FOREIGN = /\b(latin america|latam|brasil|brazil|mexico|méxico|colombia|chile|argentina|peru|venezuela|ecuador|uruguay|paraguay|bolivia|costa rica|panama|caribbean|spain|españa|portugal|france|germany|italy|netherlands|belgium|ireland|uk|britain|canada|poland|czech( republic)?|hungary|romania|bulgaria|serbia|croatia|greece|turkey|russia|ukraine|scandinavia|nordic|sweden|norway|denmark|finland|israel|arab|middle east|africa|nigeria|india|pakistan|asia|korea|japan|china|taiwan|philippines|indonesia|malaysia|thailand|vietnam|australia|new zealand|emea|apac|en espa(n|ñ)ol|español|espanol|latino|latina|hispano|br|ca|mx|es|fr|de|it|pl|ru|ar|co|cl|pe)\s*$|\b(latin america|latam|brasil|brazil|en espa(n|ñ)ol|español|espanol)\b/i
  const LOCAL = /^(abc|nbc|cbs|fox|pbs|cw|the cw|my ?network( tv)?|telemundo|univision|unimas|ion|ind|azteca)\s+[kw][a-z]{2,3}(-[a-z0-9]+)?$/i
  const drop = (c, why) => removed.push({ c, why })
  let rest = keep.splice(0)
  rest = rest.filter((c) => { if (FOREIGN.test(c.name.replace(/\(united states\)/ig, '').trim())) { drop(c, 'other country or language'); return false } return true })
  // The channel's own id names the region of a feed too (...@Spain, ...@Poland); LatAm, BR, CA and UK tags are too loose to trust (English channels carry them).
  const FOREIGN_ID = /@(spain|france|germany|italy|poland|colombia|mexico|argentina|czechrepublic|europe|arabic|latinamerica)$/i
  // (the id's region tag is loose, so channels you named yourself in --only lists stay)
  rest = rest.filter((c) => { if (c.epg && FOREIGN_ID.test(c.epg) && !only.has(c.group.toLowerCase())) { drop(c, 'other country or language'); return false } return true })
  rest = rest.filter((c) => { if (c.notes?.some((n) => /not 24\/7/i.test(n))) { drop(c, 'not on all the time'); return false } return true })
  const CALLSIGN = /^[kw][a-z]{2,3}(-?(tv|dt|cd|ld|lp))?(\s*\d+(\.\d+)?)?$/i
  const ACCESS = /(community|county|city of|public access|\b(akaku|cmap|tap tv|bhtv\d*|tempe|temecula|wehotv|detroit channel)\b)/i
  if (!keepLocals) rest = rest.filter((c) => {
    const n = c.name.trim()
    if (LOCAL.test(n) || CALLSIGN.test(n)) { drop(c, 'local station'); return false }
    if (ACCESS.test(n) || (c.group === 'Other' && /\s\d{1,2}$/.test(n))) { drop(c, 'local community channel'); return false }
    return true
  })
  rest = rest.filter((c) => { if ((c.ms ?? 0) > 6000) { drop(c, 'very slow to start'); return false } return true })
  // One version of each channel: the US-labelled one, else the plain one, else the best quality and fastest.
  const keyOf = (n) => n.replace(/\((united states|usa?)\)/ig, ' ').replace(/\b(us|usa)\s*$/i, '').replace(/\b(hd|sd|west|east|pacific|mountain|central|plus|\+\s?1|\+\s?2)\b/ig, ' ').replace(/[^a-z0-9]+/ig, ' ').trim().toLowerCase()
  const score = (c) => (/\((united states|usa?)\)|\b(us|usa)\s*$/i.test(c.name) ? 100 : 0) + (/\b(west|pacific|mountain|\+\s?\d)\b/i.test(c.name) ? 0 : 20) + (/\b(hd)\b/i.test(c.name) || /1080|720/.test(c.quality ?? '') ? 5 : 0) - (c.ms ?? 0) / 2000
  const groups = new Map()
  for (const c of rest) { const k = keyOf(c.name) || c.name.toLowerCase(); (groups.get(k) ?? groups.set(k, []).get(k)).push(c) }
  rest = []
  for (const list of groups.values()) { list.sort((a, b) => score(b) - score(a)); rest.push(list[0]); for (const x of list.slice(1)) drop(x, `another version kept: ${list[0].name}`) }
  // A run of numbered live feeds (News Live 1, 2, 3 ...): the first is enough.
  const stems = new Map()
  for (const c of rest) { const m = /^(.*\S)\s+(\d{1,2})$/.exec(c.name); if (m) (stems.get(m[1].toLowerCase()) ?? stems.set(m[1].toLowerCase(), []).get(m[1].toLowerCase())).push({ c, n: Number(m[2]) }) }
  const gone = new Set()
  for (const [stem, l] of stems) if (l.length >= 3 && /live$/.test(stem)) { l.sort((a, b) => a.n - b.n); for (const x of l.slice(1)) { gone.add(x.c); drop(x.c, `numbered feed, kept ${l[0].c.name}`) } }
  keep.push(...rest.filter((c) => !gone.has(c)))
}
if (only.size) {
  const wanted = new Map([...only].map(([g, set]) => [g, new Set(set)]))
  const kept = keep.splice(0).filter((c) => {
    const set = only.get(c.group.toLowerCase())
    if (!set) return true
    if (set.has(norm(c.name))) { wanted.get(c.group.toLowerCase()).delete(norm(c.name)); return true }
    removed.push({ c, why: `not on your ${c.group} list` }); return false
  })
  keep.push(...kept)
  globalThis.__missing = wanted
}
keep.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name))
const q = (s) => String(s ?? '').replace(/"/g, "'")
// Pluto TV streams carry the channel's Pluto id: the Pluto guide knows what is on them (the app matches them up).
const epg = keep.some((c) => /jmp2\.uk\/plu-/i.test(c.url)) && !epgOpt.includes('PlutoTV') ? `${epgOpt},https://i.mjh.nz/PlutoTV/us.xml.gz` : epgOpt
const out = [`#EXTM3U x-tvg-url="${epg}"`]
for (const c of keep) {
  const tags = [c.quality ? `(${c.quality})` : '', ...(c.notes ?? []).map((n) => `[${n}]`)].filter(Boolean).join(' ')
  out.push(`#EXTINF:-1 ${c.epg ? `tvg-id="${q(c.epg)}" ` : ''}${c.logo ? `tvg-logo="${q(c.logo)}" ` : ''}group-title="${q(c.group)}",${c.name}${tags ? ` ${tags}` : ''}`)
  if (c.ua) out.push(`#EXTVLCOPT:http-user-agent=${c.ua}`)
  if (c.referrer) out.push(`#EXTVLCOPT:http-referrer=${c.referrer}`)
  out.push(c.url)
}
writeFileSync(outFile, out.join('\n') + '\n')
const g = new Map(); keep.forEach((c) => g.set(c.group, (g.get(c.group) ?? 0) + 1))
if (reportFile && removed.length) {
  const by = new Map(); for (const r of removed) { const k = r.why.split(':')[0]; (by.get(k) ?? by.set(k, []).get(k)).push(r) }
  writeFileSync(reportFile, [...by].map(([k, l]) => `== ${k} (${l.length}) ==\n` + l.map((r) => `${r.c.name}${r.why.includes(':') ? `   <- ${r.why.split(': ')[1]}` : ''}`).sort().join('\n')).join('\n\n') + '\n')
  console.log([...by].map(([k, l]) => `${k}: ${l.length}`).join('   '))
}
if (namesFile) {
  const by = new Map(); for (const c of keep) (by.get(c.group) ?? by.set(c.group, []).get(c.group)).push(c)
  writeFileSync(namesFile, `${keep.length} channels\n` + [...by].sort((a, b) => b[1].length - a[1].length).map(([g, l]) => `\n== ${g} (${l.length}) ==\n` + l.map((c) => c.name).join('\n')).join('\n') + '\n')
}
console.log(`${keep.length} channels written to ${outFile}`)
for (const [g, set] of globalThis.__missing ?? []) if (set.size) console.log(`not found in ${g}: ${[...set].join(', ')}`)
console.log([...g].sort((a, b) => b[1] - a[1]).map((x) => x.join(': ')).join('   '))
