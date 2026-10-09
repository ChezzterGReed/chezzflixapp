// Sanity tests for the recommendation engine: node scripts/test-recs.mjs
import { buildRecs, genresOf } from '../app/src/lib/recs.ts'

let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
const pick = (a) => a[Math.floor(rnd() * a.length)]
const GENRES = ['Drama', 'Comedy', 'Action', 'Horror', 'Thriller', 'Sci-Fi', 'Romance', 'Crime', 'Fantasy', 'Documentary', 'Animation', 'Mystery']
const PEOPLE = Array.from({ length: 40 }, (_, i) => `Person ${i}`)
const NOW = 1_790_000_000, DAY = 86400
const lib = Array.from({ length: 1500 }, (_, i) => {
  const gs = [...new Set([pick(GENRES), pick(GENRES), ...(rnd() < 0.4 ? [pick(GENRES)] : [])])]
  const show = rnd() < 0.45
  return { ratingKey: String(i + 1), title: `Title ${i + 1}`, type: show ? 'show' : 'movie', year: 1990 + Math.floor(rnd() * 37), audienceRating: 5 + rnd() * 4, contentRating: pick(['PG', 'PG-13', 'R', 'TV-14', 'TV-MA']),
    addedAt: NOW - Math.floor(rnd() * 300) * DAY, Genre: gs.map((tag) => ({ tag })), Role: Array.from({ length: 4 }, () => ({ tag: pick(PEOPLE) })), Director: [{ tag: pick(PEOPLE) }],
    ...(show ? { leafCount: 20, viewedLeafCount: 0 } : { duration: 6_000_000 }) }
})
const take = (n, f) => lib.filter(f).slice(0, n)
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); if (!cond) process.exitCode = 1 }
const share = (items, gs) => items.filter((m) => genresOf(m).some((g) => gs.includes(g))).length / Math.max(1, items.length)
const watched = (items, daysAgo, extra = {}) => items.map((m, i) => ({ ...m, lastViewedAt: NOW - (daysAgo + i * 5) * DAY, viewCount: 1, ...extra }))
const run = (history, o = {}) => { const used = new Set(history.map((h) => h.ratingKey)); return buildRecs({ history, candidates: lib.filter((m) => !used.has(m.ratingKey)), now: NOW, ...o }) }

// 1) Currently watching recent dramas (shows, 2024+): expect drama/thriller-heavy, recent-leaning recs
{
  const h = watched(take(6, (m) => m.type === 'show' && m.year >= 2023 && genresOf(m).some((g) => ['Drama', 'Thriller'].includes(g))), 2, { viewedLeafCount: 8 })
  const rows = run(h)
  const top = rows[0]
  ok('recent drama watcher: first row is "Recommended for you"', top?.id === 'recs:foryou', top?.title)
  ok('  top 12 are mostly drama/thriller', share(top.items.slice(0, 12), ['Drama', 'Thriller']) >= 0.7, `${Math.round(share(top.items.slice(0, 12), ['Drama', 'Thriller']) * 100)}%`)
  const avgYear = top.items.slice(0, 12).reduce((a, m) => a + m.year, 0) / 12
  ok('  and leans recent', avgYear > 2005, `avg year ${avgYear.toFixed(0)}`)
  ok('  has a "Because you\'re watching" row', rows.some((r) => /Because you're watching/.test(r.title)), rows.map((r) => r.title).join(' | '))
  ok('  no title repeated across rows', new Set(rows.flatMap((r) => r.items.map((m) => m.ratingKey))).size === rows.flatMap((r) => r.items).length)
  ok('  never recommends what was watched', !rows.some((r) => r.items.some((m) => h.some((x) => x.ratingKey === m.ratingKey))))
}
// 2) Horror movie fan
{
  const h = watched(take(8, (m) => m.type === 'movie' && genresOf(m).includes('Horror')), 3)
  const rows = run(h)
  ok('horror fan: top 12 mostly horror', share(rows[0].items.slice(0, 12), ['Horror']) >= 0.6, `${Math.round(share(rows[0].items.slice(0, 12), ['Horror']) * 100)}%`)
  ok('  has a "More Horror" or "New in Horror" row', rows.some((r) => /Horror/.test(r.title)), rows.map((r) => r.title).join(' | '))
}
// 3) Mixed taste: horror + comedy both represented
{
  const h = [...watched(take(5, (m) => genresOf(m).includes('Horror')), 4), ...watched(take(5, (m) => genresOf(m).includes('Comedy') && !genresOf(m).includes('Horror')), 6)]
  const rows = run(h)
  const all = rows.flatMap((r) => r.items)
  ok('mixed taste: both horror and comedy appear', share(all, ['Horror']) > 0.15 && share(all, ['Comedy']) > 0.15, `horror ${Math.round(share(all, ['Horror']) * 100)}%, comedy ${Math.round(share(all, ['Comedy']) * 100)}%`)
}
// 4) Cold start
{
  const rows = run([], { seedGenres: ['Comedy', 'Action'] })
  ok('cold start with chosen genres: "Picked for you"', rows[0]?.title === 'Picked for you')
  ok('  mostly comedy/action', share(rows[0].items.slice(0, 12), ['Comedy', 'Action']) >= 0.7, `${Math.round(share(rows[0].items.slice(0, 12), ['Comedy', 'Action']) * 100)}%`)
  ok('no history and no genres: nothing', run([]).length === 0)
}
// 5) Not interested
{
  const h = watched(take(6, (m) => genresOf(m).includes('Sci-Fi')), 3)
  const first = run(h)[0].items.slice(0, 5)
  const ni = Object.fromEntries(first.map((m) => [m.ratingKey, NOW]))
  const again = run(h, { notInterested: ni }).flatMap((r) => r.items)
  ok('"Not interested" titles never come back', !again.some((m) => ni[m.ratingKey]))
}
// 6) Daily variety is gentle: top-24 mostly the same next day
{
  const h = watched(take(6, (m) => genresOf(m).includes('Crime')), 3)
  const a = new Set(run(h, { now: NOW })[0].items.map((m) => m.ratingKey)), b = run(h, { now: NOW + DAY })[0].items.map((m) => m.ratingKey)
  const overlap = b.filter((k) => a.has(k)).length / b.length
  ok('next day: similar but not frozen', overlap >= 0.5 && overlap < 1, `${Math.round(overlap * 100)}% same`)
}
// 7) Old taste: era row for a clear older pattern
{
  const h = watched(take(8, (m) => m.year >= 1992 && m.year <= 1998), 5)
  const rows = run(h)
  ok('old-era viewer gets an era row or older-leaning picks', rows.some((r) => /^\d{4}s picks$/.test(r.title)) || rows[0].items.slice(0, 12).reduce((a, m) => a + m.year, 0) / 12 < 2005, rows.map((r) => r.title).join(' | '))
}
// 8) Speed
{
  const t = Date.now(); const big = Array.from({ length: 6000 }, (_, i) => ({ ...lib[i % lib.length], ratingKey: 'b' + i }))
  buildRecs({ history: watched(take(30, () => true), 2), candidates: big, now: NOW })
  const ms = Date.now() - t
  ok('6000 candidates in under 1.5 s', ms < 1500, `${ms} ms`)
}
