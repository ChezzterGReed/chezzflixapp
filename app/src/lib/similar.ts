// "More like this" and "everything with this actor", built from ALL of your libraries of the same kind (every movie library for a movie, every TV
// library for a show), not just the library the title happens to sit in; a title that exists in several libraries (1080p and 4K copies) is listed once.
import { getSectionWithGuids, isOtherSection, type PlexMedia, type PlexSection, type PlexServer } from './plex'

const norm = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
const idKey = (m: PlexMedia) => `${m.type}|${m.guid ?? `${norm(m.title)}|${m.year ?? ''}`}`

/** Every title of this kind across your libraries, once each (a copy in a library you haven't hidden wins over one in a hidden library). */
export async function allOfKind(server: PlexServer, sections: PlexSection[], hidden: string[], kind: 'movie' | 'show'): Promise<PlexMedia[]> {
  const libs = sections.filter((s) => s.type === kind && !isOtherSection(s)).sort((a, b) => Number(hidden.includes(a.key)) - Number(hidden.includes(b.key)))
  const lists = await Promise.all(libs.map((s) => getSectionWithGuids(server, s.key).catch(() => [] as PlexMedia[])))
  const seen = new Set<string>(), out: PlexMedia[] = []
  for (const m of lists.flat()) { if (m.type !== kind) continue; const k = idKey(m); if (!seen.has(k)) { seen.add(k); out.push(m) } }
  return out
}

/** "Home Alone 2: Lost in New York" and "Home Alone" -> the same franchise key. */
const franchise = (t: string) => norm(t.split(':')[0]).replace(/\s+(part\s+)?(\d+|ii|iii|iv|v|vi|vii|viii|ix|x)$/, '').trim()
const tags = (l?: { tag: string }[]) => (l ?? []).map((t) => norm(t.tag)).filter(Boolean)

/**
 * Titles like `src`: the same collection or series first, then the best matches on director, cast, genre and era. Sequels and other members of
 * its collection lead (earliest first); the rest follow by how much they have in common.
 */
export async function moreLikeThis(server: PlexServer, sections: PlexSection[], hidden: string[], src: PlexMedia, size = 24): Promise<PlexMedia[]> {
  const kind = src.type === 'movie' ? 'movie' : src.type === 'show' ? 'show' : undefined
  if (!kind) return []
  const pool = await allOfKind(server, sections, hidden, kind)
  const mine = idKey(src)
  const collections = new Set(tags(src.Collection)), genres = new Set(tags(src.Genre)), directors = new Set(tags(src.Director))
  const cast = new Set(tags(src.Role).slice(0, 10))
  const fr = franchise(src.title)
  const scored = pool.filter((m) => m.ratingKey !== src.ratingKey && idKey(m) !== mine).map((m) => {
    let score = 0, group = 0
    if (tags(m.Collection).some((c) => collections.has(c))) { score += 100; group = 2 }                 // same collection
    if (fr.length >= 4 && franchise(m.title) === fr) { score += 90; group = Math.max(group, 2) }       // same series (sequels, prequels)
    for (const g of tags(m.Genre)) if (genres.has(g)) score += 8
    for (const d of tags(m.Director)) if (directors.has(d)) score += 16
    let shared = 0
    for (const a of tags(m.Role).slice(0, 10)) if (cast.has(a)) shared++
    score += Math.min(shared, 4) * 7
    if (src.year && m.year && Math.abs(src.year - m.year) <= 6) score += 3
    if (src.contentRating && m.contentRating === src.contentRating) score += 2
    return { m, score, group }
  }).filter((x) => x.group > 0 || x.score >= 12)   // something real in common, not just the same age rating
  const family = scored.filter((x) => x.group > 0).sort((a, b) => (a.m.year ?? 0) - (b.m.year ?? 0))   // the collection / series in order
  const rest = scored.filter((x) => x.group === 0).sort((a, b) => b.score - a.score || (b.m.audienceRating ?? 0) - (a.m.audienceRating ?? 0))
  return [...family, ...rest].slice(0, size).map((x) => x.m)
}

/** Everything on your server with this person in the cast (movies and shows, all libraries), once each. */
export async function withActor(server: PlexServer, sections: PlexSection[], hidden: string[], actor: { name: string; id?: string }): Promise<PlexMedia[]> {
  const [movies, shows] = await Promise.all([allOfKind(server, sections, hidden, 'movie'), allOfKind(server, sections, hidden, 'show')])
  const name = norm(actor.name)
  const hits = [...movies, ...shows].filter((m) => (m.Role ?? []).some((r) => norm(r.tag) === name || (!!actor.id && String(r.id) === actor.id)))
  return hits.sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
}
