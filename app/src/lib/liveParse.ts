// Reading an M3U playlist (the common IPTV format): one #EXTINF line per channel, then its address.
export interface LiveChannel {
  /** Stable id: the playlist's own channel id (tvg-id), else the name; a repeat gets a number added. */
  id: string
  /** The guide's id for this channel (tvg-id), when the playlist gives one. */
  epg?: string
  /** A second guide id, read from the stream address when it names the channel (e.g. a Pluto TV channel id). */
  epgAlt?: string
  name: string
  logo?: string
  groups: string[]
  url: string
  /** Quality tag taken out of the name, e.g. "720p". */
  quality?: string
  /** Notes taken out of the name, e.g. "Geo-blocked". */
  notes?: string[]
  /** Extra request headers the stream needs. */
  ua?: string
  referrer?: string
}
export interface LivePlaylist { channels: LiveChannel[]; /** The guide address named in the playlist's first line. */ epgUrl?: string }

const attr = (line: string, key: string) => new RegExp(`${key}="([^"]*)"`, 'i').exec(line)?.[1]?.trim() || undefined

/** "BBC One (720p) [Geo-blocked]" -> the name without its tags, plus what the tags said. */
export function cleanChannelName(raw: string): { name: string; quality?: string; notes: string[] } {
  let name = raw.trim(), quality: string | undefined
  const notes: string[] = []
  name = name.replace(/\s*\[([^\]]+)\]/g, (_, n: string) => { notes.push(n.trim()); return '' })
  name = name.replace(/\s*\((\d{3,4}[pi]|4k|uhd|hd|sd)\)\s*$/i, (_, q: string) => { quality = q.toLowerCase(); return '' })
  return { name: name.trim() || raw.trim(), quality, notes }
}

export function parseM3U(text: string): LivePlaylist {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  const out: LiveChannel[] = []
  const seen = new Map<string, number>()
  const epgUrl = attr(lines.find((l) => l.startsWith('#EXTM3U')) ?? '', 'x-tvg-url') ?? attr(lines.find((l) => l.startsWith('#EXTM3U')) ?? '', 'url-tvg')?.split(',')[0]
  let cur: { name: string; line: string; ua?: string; referrer?: string } | null = null
  for (const raw of lines) {
    const l = raw.trim()
    if (!l) continue
    if (l.startsWith('#EXTINF')) {
      const comma = l.lastIndexOf(',')
      cur = { name: comma >= 0 ? l.slice(comma + 1) : '', line: l }
    } else if (l.startsWith('#EXTVLCOPT:') && cur) {
      const m = /^#EXTVLCOPT:([^=]+)=(.*)$/.exec(l)
      if (m) { const k = m[1].toLowerCase(); if (k === 'http-user-agent') cur.ua = m[2]; else if (k === 'http-referrer') cur.referrer = m[2] }
    } else if (l.startsWith('#EXTHTTP:') && cur) {
      try { const h = JSON.parse(l.slice(9)) as Record<string, string>; for (const [k, v] of Object.entries(h)) { if (/^user-agent$/i.test(k)) cur.ua = v; else if (/^referr?er$/i.test(k)) cur.referrer = v } } catch { /* not JSON */ }
    } else if (!l.startsWith('#') && cur) {
      if (/^https?:\/\//i.test(l)) {
        const tvg = attr(cur.line, 'tvg-id')
        const named = cleanChannelName(cur.name || attr(cur.line, 'tvg-name') || 'Channel')
        const base = tvg ?? named.name
        const n = (seen.get(base) ?? 0) + 1
        seen.set(base, n)
        const groups = (attr(cur.line, 'group-title') ?? '').split(/[;|]/).map((g) => g.trim()).filter(Boolean).map((g) => (/^undefined$/i.test(g) ? 'Other' : g))
        const ua = l.includes('|') ? undefined : cur.ua
        out.push({
          id: n === 1 ? base : `${base}#${n}`, epg: tvg, epgAlt: /^https?:\/\/[^/]*jmp2\.uk\/plu-([0-9a-f]{24})/i.exec(l)?.[1], name: named.name, logo: attr(cur.line, 'tvg-logo'), groups: groups.length ? groups : ['Other'], url: l,
          quality: named.quality, notes: named.notes.length ? named.notes : undefined, ua, referrer: cur.referrer,
        })
      }
      cur = null
    }
  }
  return { channels: out, epgUrl }
}
