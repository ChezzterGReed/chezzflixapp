// Every copy of a title you can play: extra versions inside the same Plex item, and the same title in OTHER libraries (even ones hidden
// from the side menu), e.g. a 1080p copy in "Movies" and a 4K HDR copy in "4K Movies".
import { findInSection, getChildren, getMetadata, getSections, type PlexMedia, type PlexMediaInfo, type PlexServer } from './plex'

export interface Version {
  id: string
  /** "4K HDR", "1080p"… */
  label: string
  /** "HEVC · 38.2 GB · 4K Movies" */
  detail: string
  /** Pixel rows (2160, 1080…), for deciding which is lighter. */
  height: number
  bitrate: number
  /** What to play: the title with this version first. */
  media: PlexMedia
  /** The one that was asked for (so "current" can be skipped when suggesting another). */
  same?: boolean
}

const RES: Record<string, { label: string; h: number }> = { '4k': { label: '4K', h: 2160 }, '2160': { label: '4K', h: 2160 }, '1080': { label: '1080p', h: 1080 }, '720': { label: '720p', h: 720 }, '576': { label: '576p', h: 576 }, '480': { label: '480p', h: 480 }, sd: { label: 'SD', h: 480 } }

function describe(info: PlexMediaInfo): { label: string; h: number; detail: string[] } {
  const r = RES[String(info.videoResolution ?? '').toLowerCase()] ?? { label: info.videoResolution ? `${info.videoResolution}p` : 'Version', h: parseInt(info.videoResolution ?? '0') || 0 }
  const v = info.Part?.[0]?.Stream?.find((s) => s.streamType === 1)
  const txt = `${v?.displayTitle ?? ''} ${v?.extendedDisplayTitle ?? ''}`
  const hdr = v?.DOVIPresent || /dolby vision|dovi/i.test(txt) ? 'Dolby Vision' : /hdr/i.test(txt) || v?.colorTrc === 'smpte2084' || v?.colorTrc === 'arib-std-b67' ? 'HDR' : ''
  const size = info.Part?.[0]?.size
  return { label: [r.label, hdr].filter(Boolean).join(' '), h: r.h, detail: [info.videoCodec?.toUpperCase(), size ? `${(size / 1e9).toFixed(1)} GB` : '', info.bitrate ? `${(info.bitrate / 1000).toFixed(1)} Mbps` : ''].filter(Boolean) as string[] }
}

/** The same item with version `i` moved to the front (everything that plays a file reads Media[0]). */
function withVersion(m: PlexMedia, i: number, offset?: number): PlexMedia {
  const media = m.Media ?? []
  return { ...m, Media: [media[i], ...media.filter((_, j) => j !== i)], versionIndex: i, viewOffset: offset ?? m.viewOffset }
}

const cache = new Map<string, Promise<Version[]>>()

/** All the ways to play `target` (a full movie/episode record). Cached; resolves to [] on any trouble. */
export function findVersions(server: PlexServer, target: PlexMedia): Promise<Version[]> {
  const k = `${server.uri}|${target.ratingKey}|${target.versionIndex ?? 0}`
  let p = cache.get(k)
  if (!p) { p = build(server, target).catch(() => []); cache.set(k, p) }
  return p
}

async function build(server: PlexServer, target: PlexMedia): Promise<Version[]> {
  if (target.type !== 'movie' && target.type !== 'episode') return []
  const out: Version[] = []
  const offset = target.viewOffset
  // A version that was already picked has been moved to the front of its list; start again from the natural order.
  const natural = target.versionIndex !== undefined ? await getMetadata(server, target.ratingKey) : target
  const add = (m: PlexMedia, lib: string, same: boolean) => (m.Media ?? []).forEach((info, i) => {
    const d = describe(info)
    out.push({ id: `${m.ratingKey}:${i}`, label: d.label, detail: [...d.detail, lib].filter(Boolean).join(' · '), height: d.h, bitrate: info.bitrate ?? 0, media: withVersion(m, i, offset), same: same && i === (target.versionIndex ?? 0) })
  })
  const sections = await getSections(server)
  const mine = sections.find((s) => String(s.key) === String(target.librarySectionID))
  add(natural, sections.length > 1 ? mine?.title ?? '' : '', true)

  // The same title elsewhere.
  const others = sections.filter((s) => String(s.key) !== String(target.librarySectionID) && s.type === (target.type === 'movie' ? 'movie' : 'show'))
  const seen = new Set([target.ratingKey])
  const found = await Promise.all(others.map(async (s) => ({ s, items: await matchIn(server, s.key, target).catch(() => []) })))
  for (const { s, items } of found) for (const it of items) {
    if (seen.has(it.ratingKey)) continue
    seen.add(it.ratingKey)
    const full = await getMetadata(server, it.ratingKey).catch(() => null)
    if (full) add(full, s.title, false)
  }
  return out.length > 1 ? out.sort((a, b) => b.height - a.height || b.bitrate - a.bitrate) : []
}

const norm = (t?: string) => (t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

async function matchIn(server: PlexServer, key: string, t: PlexMedia): Promise<PlexMedia[]> {
  if (t.type === 'movie') {
    if (t.guid) { const hit = await findInSection(server, key, `guid=${encodeURIComponent(t.guid)}`); if (hit.length) return hit }
    const hit = await findInSection(server, key, `title=${encodeURIComponent(t.title)}`)
    return hit.filter((x) => norm(x.title) === norm(t.title) && (!t.year || !x.year || x.year === t.year))
  }
  // An episode: by its own guid, else find the show here and walk to the same season and episode number.
  if (t.guid) { const hit = await findInSection(server, key, `type=4&guid=${encodeURIComponent(t.guid)}`); if (hit.length) return hit }
  const shows = (await findInSection(server, key, `type=2&title=${encodeURIComponent(t.grandparentTitle ?? '')}`)).filter((x) => norm(x.title) === norm(t.grandparentTitle))
  for (const show of shows) {
    const season = (await getChildren(server, show.ratingKey)).find((x) => x.index === t.parentIndex)
    const ep = season && (await getChildren(server, season.ratingKey)).find((x) => x.index === t.index)
    if (ep) return [ep]
  }
  return []
}

/** A lighter copy than what's playing now (smaller picture or lower bitrate), for "try this if it keeps buffering". */
export function lighterThan(versions: Version[], current: PlexMedia): Version | undefined {
  const cur = versions.find((v) => v.media.versionIndex === current.versionIndex && v.media.ratingKey === current.ratingKey) ?? versions.find((v) => v.media.ratingKey === current.ratingKey && (v.media.versionIndex ?? 0) === (current.versionIndex ?? 0))
  const curBr = cur?.bitrate ?? current.Media?.[0]?.bitrate ?? Infinity, curH = cur?.height ?? 99999
  return [...versions].filter((v) => v !== cur && (v.height < curH || (v.height === curH && v.bitrate > 0 && v.bitrate < curBr * 0.7))).sort((a, b) => b.height - a.height)[0]
}
