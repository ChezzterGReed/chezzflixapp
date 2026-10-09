// Personal recommendations, computed on this device from a profile's own watch history. Nothing leaves the device.
//
// 1. TASTE   every watched title adds weight to its genres, people (directors / lead actors), release years, content rating and type.
//            A title counts more when it's recent, when you're partway through it, when you rewatched it or rated it highly.
// 2. SCORE   each unwatched title in the library is scored against that taste (genre fit, release-year fit, people, quality...).
// 3. ROWS    themed rows are assembled from the scores: Recommended, Because you watched X, More <genre>, More with <person>,
//            Just added, Highly rated... never repeating a title, with a little daily variety so Home doesn't look frozen.
// Keep this file free of imports from the rest of the app (only types), so it can be tested on its own.
import type { PlexMedia } from './plex'

export interface RecRow { id: string; title: string; subtitle?: string; items: PlexMedia[] }

export interface RecInput {
  /** Titles the profile has watched or is part-way through (any order). */
  history: PlexMedia[]
  /** Unwatched titles in the library. */
  candidates: PlexMedia[]
  now?: number                                   // epoch seconds
  /** Genres picked in setup; used while there's little history to learn from. */
  seedGenres?: string[]
  /** "Not interested" titles (ratingKey -> when): never shown, and they nudge similar titles down. */
  notInterested?: Record<string, number>
  maxRows?: number
}

const DAY = 86400
const ALIAS: Record<string, string> = { 'science fiction': 'Sci-Fi', 'sci-fi': 'Sci-Fi', 'sci-fi & fantasy': 'Sci-Fi', 'action & adventure': 'Action', 'war & politics': 'War', 'tv movie': 'Movie' }
const canon = (tag: string) => ALIAS[tag.trim().toLowerCase()] ?? tag.trim()
export const genresOf = (m: PlexMedia) => [...new Set((m.Genre ?? []).map((g) => canon(g.tag)).filter(Boolean))]
const peopleOf = (m: PlexMedia): { name: string; kind: 'director' | 'actor' }[] => [
  ...(m.Director ?? []).slice(0, 2).map((d) => ({ name: d.tag, kind: 'director' as const })),
  ...(m.Role ?? []).slice(0, 5).map((r) => ({ name: r.tag, kind: 'actor' as const })),
]

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return (h >>> 0) / 4294967296 }

/** How much a watched title says about taste (about 0.1 for something old, up to ~3 for something you're in the middle of). */
export function weightOf(m: PlexMedia, now: number): number {
  const days = m.lastViewedAt ? Math.max(0, (now - m.lastViewedAt) / DAY) : 120
  let w = Math.max(0.12, Math.exp(-days / 75))
  if (m.type === 'show' && m.leafCount) {
    const frac = (m.viewedLeafCount ?? 0) / m.leafCount
    if (frac > 0 && frac < 1 && days < 45) w *= 1.9            // currently watching
    else if (frac >= 1) w *= 1.15
  }
  if (m.type === 'movie' && m.viewOffset && m.duration && m.viewOffset / m.duration > 0.1 && (m.viewCount ?? 0) === 0) w *= 1.5
  if ((m.viewCount ?? 0) > 1) w *= 1.25
  if (m.userRating != null) w *= m.userRating >= 8 ? 1.5 : m.userRating >= 6 ? 1 : 0.3
  return w
}

export interface Taste {
  genres: Map<string, number>        // 0..1, 1 = favourite
  people: Map<string, { aff: number; kind: 'director' | 'actor'; titles: number }>
  year: { mean: number; sd: number; known: boolean }
  ratings: Map<string, number>       // share of weight per content rating
  movieShare: number
  total: number
}

export function buildTaste(history: PlexMedia[], now: number, seedGenres: string[] = []): Taste {
  const genres = new Map<string, number>()
  const people = new Map<string, { w: number; kind: 'director' | 'actor'; titles: number }>()
  const ratings = new Map<string, number>()
  let total = 0, movieW = 0, ySum = 0, ySq = 0, yW = 0
  for (const m of history) {
    const w = weightOf(m, now)
    total += w
    if (m.type === 'movie') movieW += w
    for (const g of genresOf(m)) genres.set(g, (genres.get(g) ?? 0) + w)
    for (const p of peopleOf(m)) { const cur = people.get(p.name) ?? { w: 0, kind: p.kind, titles: 0 }; cur.w += w; cur.titles++; people.set(p.name, cur) }
    if (m.contentRating) ratings.set(m.contentRating, (ratings.get(m.contentRating) ?? 0) + w)
    if (m.year) { ySum += w * m.year; ySq += w * m.year * m.year; yW += w }
  }
  // Barely any history: lean on what was picked in setup.
  if (history.length < 3) for (const g of seedGenres) genres.set(canon(g), (genres.get(canon(g)) ?? 0) + Math.max(1, total / Math.max(1, seedGenres.length)))
  const gMax = Math.max(0, ...genres.values()), pMax = Math.max(0, ...[...people.values()].filter((p) => p.titles >= 2).map((p) => p.w))
  const mean = yW ? ySum / yW : 0
  const sd = yW ? Math.sqrt(Math.max(0, ySq / yW - mean * mean)) : 0
  return {
    genres: new Map([...genres].map(([g, w]) => [g, gMax ? w / gMax : 0])),
    people: new Map([...people].filter(([, p]) => p.titles >= 2).map(([n, p]) => [n, { aff: pMax ? p.w / pMax : 0, kind: p.kind, titles: p.titles }])),
    year: { mean, sd: clamp(sd, 5, 22), known: history.length >= 3 && yW > 0 },
    ratings: new Map([...ratings].map(([r, w]) => [r, total ? w / total : 0])),
    movieShare: total ? movieW / total : 0.5,
    total,
  }
}

const topGenres = (t: Taste, n: number) => [...t.genres].sort((a, b) => b[1] - a[1]).slice(0, n)

export function scoreItem(t: Taste, m: PlexMedia, dayKey = 0, ni: PlexMedia[] = []): number {
  const gs = genresOf(m)
  const affs = gs.map((g) => t.genres.get(g) ?? 0).sort((a, b) => b - a)
  const genre = affs.length ? affs.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, Math.max(2, affs.length)) : 0
  const topSet = new Set(topGenres(t, 4).map(([g]) => g))
  const overlap = Math.min(0.3, gs.filter((g) => topSet.has(g)).length * 0.12)
  const year = t.year.known && m.year ? Math.exp(-0.5 * ((m.year - t.year.mean) / t.year.sd) ** 2) : 0.6
  const people = clamp(peopleOf(m).reduce((a, p) => a + (t.people.get(p.name)?.aff ?? 0), 0))
  const quality = clamp(((m.audienceRating ?? m.rating ?? 6) / 10))
  const rating = m.contentRating && t.ratings.size ? clamp((t.ratings.get(m.contentRating) ?? 0) * 2) : 0.5
  const type = m.type === 'movie' ? t.movieShare : 1 - t.movieShare
  let s = 0.5 * clamp(genre + overlap) + 0.18 * year + 0.12 * people + 0.1 * quality + 0.06 * rating + 0.04 * type
  // "Not interested" nudges similar titles (shared genres) down a little.
  if (ni.length) { const g = new Set(gs); const hit = ni.filter((x) => genresOf(x).some((y) => g.has(y))).length; s -= Math.min(0.12, hit * 0.03) }
  return s + (hash(m.ratingKey + ':' + dayKey) - 0.5) * 0.06   // a little daily variety
}

function similarity(a: PlexMedia, b: PlexMedia): number {
  const ga = new Set(genresOf(a)), gb = genresOf(b)
  const shared = gb.filter((g) => ga.has(g)).length
  if (!shared) return 0
  const jac = shared / (ga.size + gb.length - shared)
  const pa = new Map(peopleOf(a).map((p) => [p.name, p.kind]))
  const pb = peopleOf(b)
  const ppl = clamp(pb.reduce((n, p) => n + (pa.has(p.name) ? (p.kind === 'director' ? 1 : 0.4) : 0), 0))
  const year = a.year && b.year ? Math.exp(-Math.abs(a.year - b.year) / 12) : 0.5
  return 0.5 * jac + 0.2 * ppl + 0.15 * year + 0.1 * (a.type === b.type ? 1 : 0) + 0.05 * (a.contentRating && a.contentRating === b.contentRating ? 1 : 0)
}

/** Greedy pick that spreads across genres, so one row isn't ten near-identical titles. */
function diversify(list: { m: PlexMedia; s: number }[], n: number): PlexMedia[] {
  const pool = list.map((x) => ({ ...x })), out: PlexMedia[] = [], seen = new Map<string, number>()
  while (out.length < n && pool.length) {
    let best = 0, bestV = -Infinity
    for (let i = 0; i < pool.length; i++) {
      const g = genresOf(pool[i].m)[0] ?? ''
      const v = pool[i].s - 0.035 * (seen.get(g) ?? 0)
      if (v > bestV) { bestV = v; best = i }
    }
    const [pick] = pool.splice(best, 1)
    out.push(pick.m)
    const g = genresOf(pick.m)[0] ?? ''
    seen.set(g, (seen.get(g) ?? 0) + 1)
  }
  return out
}

const decade = (y: number) => Math.floor(y / 10) * 10

export function buildRecs(input: RecInput): RecRow[] {
  const now = input.now ?? Math.floor(Date.now() / 1000)
  const dayKey = Math.floor(now / DAY)
  const ni = input.notInterested ?? {}
  const history = input.history
  const taste = buildTaste(history, now, input.seedGenres)
  if (!taste.genres.size) return []   // nothing to go on yet

  const cands = input.candidates.filter((m) => !ni[m.ratingKey])
  const niItems = input.candidates.filter((m) => ni[m.ratingKey])
  const scored = cands.map((m) => ({ m, s: scoreItem(taste, m, dayKey, niItems) })).sort((a, b) => b.s - a.s)
  const cold = history.length < 3
  const rows: RecRow[] = []
  const used = new Set<string>()
  const add = (row: RecRow, min = 5) => {
    const items = row.items.filter((m) => !used.has(m.ratingKey))
    if (items.length < min) return
    items.forEach((m) => used.add(m.ratingKey))
    rows.push({ ...row, items })
  }
  const nowYear = new Date(now * 1000).getFullYear()

  // 1) Recommended for you
  add({ id: 'recs:foryou', title: cold ? 'Picked for you' : 'Recommended for you', subtitle: cold ? 'Based on the genres you chose' : 'Based on what you watch', items: diversify(scored, 24) })

  // Rows are built one after another from what earlier rows haven't used, so every themed row still has fresh titles.
  type Maker = () => RecRow | null
  const free = <T extends { m: PlexMedia }>(list: T[]) => list.filter((x) => !used.has(x.m.ratingKey))

  // 2) Because you watched / are watching (strongest recent signals, different titles)
  const anchors = [...history].filter((m) => genresOf(m).length).sort((a, b) => weightOf(b, now) - weightOf(a, now))
  const chosen: PlexMedia[] = []
  for (const a of anchors) {
    if (chosen.length >= 3) break
    if (chosen.some((u) => similarity(u, a) > 0.6)) continue   // don't anchor on three near-twins
    if (scored.filter((x) => similarity(a, x.m) > 0.25).length < 5) continue
    chosen.push(a)
  }
  const anchorMaker = (a: PlexMedia): Maker => () => {
    const sims = free(scored).map((x) => ({ m: x.m, s: similarity(a, x.m) * 0.7 + x.s * 0.3 })).filter((x) => similarity(a, x.m) > 0.25).sort((p, q) => q.s - p.s)
    const frac = a.type === 'show' && a.leafCount ? (a.viewedLeafCount ?? 0) / a.leafCount : a.viewOffset ? 0.5 : 1
    return { id: `recs:because:${a.ratingKey}`, title: frac > 0 && frac < 1 ? `Because you're watching ${a.title}` : `Because you watched ${a.title}`, items: diversify(sims, 20) }
  }

  // 3) Genre rows, leaning on release years when that's a pattern
  const genreMaker = (g: string): Maker => () => {
    const inG = free(scored).filter((x) => genresOf(x.m).includes(g))
    const recentLean = taste.year.known && taste.year.mean >= nowYear - 5
    const recent = recentLean ? inG.filter((x) => (x.m.year ?? 0) >= nowYear - 3) : []
    return recent.length >= 8
      ? { id: `recs:genre:${g}`, title: `New in ${g}`, subtitle: `${g} from the last few years`, items: recent.slice(0, 22).map((x) => x.m) }
      : { id: `recs:genre:${g}`, title: `More ${g}`, items: diversify(inG, 22) }
  }
  const [g1, g2, g3] = topGenres(taste, 3).map(([g]) => g)

  // 4) Just added, picked for you
  const fresh: Maker = () => ({ id: 'recs:new', title: 'New to your library, picked for you', items: free(scored).filter((x) => x.m.addedAt && now - x.m.addedAt < 45 * DAY).slice(0, 20).map((x) => x.m) })

  // 5) A person you keep coming back to
  const person = [...taste.people].filter(([, p]) => p.titles >= 2).sort((a, b) => b[1].aff * b[1].titles - a[1].aff * a[1].titles)[0]
  const personRow: Maker = () => person ? {
    id: `recs:person:${person[0]}`, title: person[1].kind === 'director' ? `More from ${person[0]}` : `More with ${person[0]}`,
    items: free(scored).filter((x) => peopleOf(x.m).some((p) => p.name === person[0])).slice(0, 20).map((x) => x.m),
  } : null

  // 6) Highly rated that fit your taste
  const gems: Maker = () => ({ id: 'recs:gems', title: 'Highly rated, waiting for you', items: free(scored).filter((x) => (x.m.audienceRating ?? x.m.rating ?? 0) >= 7.8 && x.s > 0.45).slice(0, 20).map((x) => x.m) })

  // 7) An era you favour (only when it's a clear, older pattern)
  const era: Maker = () => {
    if (!(taste.year.known && taste.year.sd < 10 && taste.year.mean < nowYear - 15)) return null
    const d = decade(Math.round(taste.year.mean))
    return { id: `recs:era:${d}`, title: `${d}s picks`, items: free(scored).filter((x) => x.m.year && decade(x.m.year) === d).slice(0, 20).map((x) => x.m) }
  }

  // Interleaved so Home gets a varied mix at the top when only a few rows are shown.
  const order: (Maker | null)[] = [
    chosen[0] ? anchorMaker(chosen[0]) : null, g1 ? genreMaker(g1) : null, fresh, chosen[1] ? anchorMaker(chosen[1]) : null, personRow,
    g2 ? genreMaker(g2) : null, gems, chosen[2] ? anchorMaker(chosen[2]) : null, era, g3 ? genreMaker(g3) : null,
  ]
  for (const make of order) { const r = make?.(); if (r) add(r) }
  return rows.slice(0, input.maxRows ?? 12)
}
