// Demo data for UI development (open the app with ?demo). Not used with a real server.
import type { PlexMedia, PlexHub } from './plex'

const hue = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7)

/** Generated artwork so layouts can be judged without real posters. Path format: demo:<kind>:<title> */
export function artUrl(path: string, w: number, h: number): string {
  const [, kind, ...rest] = path.split(':')
  const title = rest.join(':')
  const hh = hue(title)
  if (kind === 'avatar') {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hh},70%,60%)"/><stop offset="1" stop-color="hsl(${(hh + 60) % 360},70%,35%)"/></linearGradient></defs><rect width="200" height="200" fill="url(#a)"/><circle cx="100" cy="82" r="34" fill="rgba(255,255,255,.9)"/><path d="M34 200c0-44 30-70 66-70s66 26 66 70z" fill="rgba(255,255,255,.9)"/></svg>`
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
  }
  const poster = kind === 'poster'
  const W = poster ? 400 : 1280, H = poster ? 600 : kind === 'still' ? 720 : 720
  const words = title.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) { if ((cur + ' ' + w).trim().length > (poster ? 11 : 26)) { lines.push(cur); cur = w } else cur = (cur + ' ' + w).trim() }
  lines.push(cur)
  const size = poster ? 56 : 84
  const text = lines.map((l, i) => `<text x="${poster ? 36 : 90}" y="${(poster ? H - 60 : H - 120) - (lines.length - 1 - i) * size * 1.1}" font-family="Georgia,serif" font-weight="700" font-size="${size}" fill="rgba(255,255,255,.92)">${l.replace(/&/g, '&amp;')}</text>`).join('')
  const h2 = (hh + 40) % 360, h3 = (hh + 200) % 360
  const scene = kind === 'poster' ? '' : `
<polygon points="0,${H * 0.72} ${W * 0.22},${H * 0.46} ${W * 0.4},${H * 0.66} ${W * 0.62},${H * 0.36} ${W * 0.85},${H * 0.64} ${W},${H * 0.5} ${W},${H} 0,${H}" fill="hsl(${h3},45%,10%)" opacity=".75"/>
<polygon points="0,${H * 0.85} ${W * 0.3},${H * 0.6} ${W * 0.55},${H * 0.8} ${W * 0.8},${H * 0.58} ${W},${H * 0.78} ${W},${H} 0,${H}" fill="hsl(${h3},40%,6%)" opacity=".9"/>`
  const posterScene = kind !== 'poster' ? '' : `<polygon points="0,${H * 0.62} ${W * 0.35},${H * 0.4} ${W * 0.7},${H * 0.58} ${W},${H * 0.42} ${W},${H} 0,${H}" fill="hsl(${h3},45%,9%)" opacity=".7"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hh},60%,40%)"/><stop offset="1" stop-color="hsl(${h2},62%,14%)"/></linearGradient>
<radialGradient id="r" cx=".72" cy=".28" r=".55"><stop offset="0" stop-color="hsl(${(hh + 30) % 360},90%,70%)" stop-opacity=".85"/><stop offset="1" stop-color="transparent"/></radialGradient>
<linearGradient id="s" x1="0" y1=".4" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".6"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="${H}" fill="url(#r)"/>
<circle cx="${W * 0.72}" cy="${H * 0.3}" r="${H * 0.12}" fill="hsl(${(hh + 30) % 360},95%,88%)" opacity=".8"/>${scene}${posterScene}
<rect width="${W}" height="${H}" fill="url(#s)"/>${kind === 'poster' ? text : ''}</svg>`
  void w; void h
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

interface Seed { id: number; title: string; type: 'movie' | 'show'; year: number; genres: string[]; cr: string; min: number; rating: number; summary: string; seasons?: number }

const S: Seed[] = [
  { id: 1, title: 'Midnight Meridian', type: 'movie', year: 2024, genres: ['Sci-Fi', 'Thriller'], cr: 'PG-13', min: 138, rating: 8.4, summary: 'When a deep-space relay goes silent, a disgraced navigator is the only one who remembers the route to where it vanished. What she finds waiting there rewrites everything humanity believed about distance.' },
  { id: 2, title: 'The Salt Road', type: 'show', year: 2023, genres: ['Drama', 'Western'], cr: 'TV-MA', min: 54, rating: 8.9, seasons: 3, summary: 'Three families fight over the last working water rights in a drying territory, where every alliance has a price and every road leads back to the salt flats.' },
  { id: 3, title: 'Paper Lanterns', type: 'movie', year: 2022, genres: ['Drama', 'Romance'], cr: 'PG', min: 112, rating: 7.8, summary: 'Two strangers keep missing each other across one long festival night in Kyoto, in a story told entirely in the moments between.' },
  { id: 4, title: 'Iron Orchard', type: 'show', year: 2024, genres: ['Crime', 'Mystery'], cr: 'TV-14', min: 47, rating: 8.2, seasons: 2, summary: 'A retired detective returns to the apple town she fled, where the orchards have started giving up things buried decades ago.' },
  { id: 5, title: 'Velocity', type: 'movie', year: 2025, genres: ['Action', 'Thriller'], cr: 'R', min: 121, rating: 7.4, summary: 'A courier has eleven minutes to cross a city locked down by someone who knows every route she will take.' },
  { id: 6, title: 'Quiet Harbor', type: 'show', year: 2021, genres: ['Comedy', 'Drama'], cr: 'TV-PG', min: 28, rating: 8.6, seasons: 3, summary: 'The staff of a failing seaside lighthouse museum treat every slow day like a heist, a crisis, or a very small revolution.' },
  { id: 7, title: 'Neon Cartographers', type: 'movie', year: 2023, genres: ['Sci-Fi', 'Animation'], cr: 'PG-13', min: 104, rating: 8.1, summary: 'In a city that rewrites its own streets every night, a mapmaker apprentice discovers someone is drawing a way out.' },
  { id: 8, title: 'Last Light at Kestrel', type: 'movie', year: 2020, genres: ['Drama', 'War'], cr: 'R', min: 149, rating: 8.7, summary: 'A radio operator and a deserter share an abandoned signal station through one impossible winter at the edge of the front.' },
  { id: 9, title: 'Glass Houses', type: 'show', year: 2025, genres: ['Thriller', 'Drama'], cr: 'TV-MA', min: 52, rating: 7.9, seasons: 1, summary: 'In a gated community with no curtains, nobody keeps secrets for long — but one family is better at it than the rest.' },
  { id: 10, title: 'Sunday Drivers', type: 'movie', year: 2021, genres: ['Comedy'], cr: 'PG-13', min: 96, rating: 7.1, summary: 'A grandmother, her estranged grandson, and a stolen vintage Cadillac make a very slow getaway across Ohio.' },
  { id: 11, title: 'Cold Equations', type: 'show', year: 2022, genres: ['Sci-Fi', 'Drama'], cr: 'TV-14', min: 58, rating: 9.0, seasons: 2, summary: 'Eight engineers on a failing ark ship must decide, one impossible budget at a time, who the voyage is actually for.' },
  { id: 12, title: 'Bellwether', type: 'movie', year: 2024, genres: ['Mystery', 'Thriller'], cr: 'R', min: 117, rating: 7.6, summary: 'A flock of sheep walks into a reservoir. A county vet starts asking why, and the county starts asking her to stop.' },
  { id: 13, title: 'The Understudies', type: 'show', year: 2023, genres: ['Comedy'], cr: 'TV-14', min: 24, rating: 8.0, seasons: 2, summary: 'The second-string cast of a legendary stage show finally gets the lead roles — for one night, then another, then forever.' },
  { id: 14, title: 'Ember & Ash', type: 'movie', year: 2019, genres: ['Fantasy', 'Adventure'], cr: 'PG', min: 128, rating: 7.7, summary: 'Two rival dragon tenders must cross the burning north together to return an egg neither of their kingdoms can admit exists.' },
  { id: 15, title: 'Harbor Lights', type: 'movie', year: 2018, genres: ['Romance', 'Drama'], cr: 'PG-13', min: 108, rating: 7.2, summary: 'A ferry pilot and the island doctor have exactly one crossing a day to say what they mean.' },
  { id: 16, title: 'Static', type: 'movie', year: 2025, genres: ['Horror', 'Thriller'], cr: 'R', min: 99, rating: 6.9, summary: 'A late-night radio host begins receiving calls from listeners describing the room she is sitting in.' },
]

// Anime (tagged with the "Anime" genre inside the normal libraries). `?anime=3` limits how many shows exist, to test the 5-show threshold.
const ANIME_SHOWS = ['Skyward Blade', 'Tidecaller', 'Paper Moon Academy', 'Neon Ronin', 'Starlit Express', 'Ember Heart', 'Hollow Crown']
const animeCount = Number(new URLSearchParams(location.search).get('anime') ?? 7)
ANIME_SHOWS.slice(0, animeCount).forEach((title, i) => S.push({
  id: 17 + i, title, type: 'show', year: 2019 + (i % 6), genres: ['Anime', i % 2 ? 'Fantasy' : 'Action'], cr: 'TV-14', min: 24, rating: 8.1 + (i % 5) / 10, seasons: 1 + (i % 3),
  summary: `${title} follows a reluctant hero through a world where every choice has a cost, with animation and music that carry every scene.`,
}))
if (animeCount > 0) S.push(
  { id: 30, title: 'Whispering Hills', type: 'movie', year: 2022, genres: ['Anime', 'Fantasy'], cr: 'PG', min: 112, rating: 8.5, summary: 'A girl who can hear the mountains finds out what they have been trying to tell her for a hundred years.' },
  { id: 31, title: 'Last Train to Nowhere', type: 'movie', year: 2020, genres: ['Anime', 'Drama'], cr: 'PG-13', min: 98, rating: 8.0, summary: 'A night train that only appears in the rain carries three strangers toward the same impossible stop.' },
)

const STREAMS = (key: string) => ({
  container: 'mkv', videoCodec: 'h264', audioCodec: 'eac3', videoResolution: '1080',
  Part: [{ key, Stream: [
    { id: 1, streamType: 1, codec: 'h264', displayTitle: '1080p (H.264)' },
    { id: 2, streamType: 2, codec: 'eac3', language: 'English', displayTitle: 'English (EAC3 5.1)', selected: true, channels: 6 },
    { id: 3, streamType: 2, codec: 'aac', language: 'Spanish', displayTitle: 'Spanish (AAC Stereo)', channels: 2 },
    { id: 4, streamType: 3, codec: 'srt', language: 'English', displayTitle: 'English (SRT)', key: '/demo/en.srt' },
    { id: 5, streamType: 3, codec: 'pgs', language: 'English', displayTitle: 'English (PGS)' },
  ] }],
})

const bySeed = (id: number) => S.find((s) => s.id === id)!
const NOW = Math.floor(Date.now() / 1000)
const WORDS = ['Departures', 'The Long Way Round', 'Fault Lines', 'Ghost Light', 'Salt and Rain', 'What the River Kept', 'Low Tide', 'Open Water', 'The Understory', 'Hard Reset']

// Which collections each demo title belongs to (shown on the info screen).
const COLLECTIONS: Record<number, string[]> = { 1: ['_Trending Movies', 'Edge-of-Your-Seat Thrillers'], 5: ['_Trending Movies', 'Edge-of-Your-Seat Thrillers'], 12: ['Edge-of-Your-Seat Thrillers'], 16: ['_Trending Movies', 'Edge-of-Your-Seat Thrillers'], 3: ['Feel-Good Favorites'], 10: ['Feel-Good Favorites'], 15: ['Feel-Good Favorites'], 7: ['_Trending Movies'], 2: ['Prestige Drama'], 11: ['Prestige Drama'] }

function item(s: Seed, extra: Partial<PlexMedia> = {}): PlexMedia {
  const isShow = s.type === 'show'
  return {
    ratingKey: String(s.id), title: s.title, type: s.type, year: s.year, summary: s.summary, librarySectionID: s.type === 'movie' ? 1 : 2,
    audienceRating: s.rating, contentRating: s.cr, duration: s.min * 60000, addedAt: NOW - s.id * 86400,
    thumb: `demo:poster:${s.title}`, art: `demo:art:${s.title}`,
    Genre: s.genres.map((tag) => ({ tag })),
    Collection: (COLLECTIONS[s.id] ?? []).map((tag) => ({ tag })),
    Guid: [{ id: `tmdb://${1000 + s.id}` }],
    originallyAvailableAt: `${s.year}-${String(((s.id * 5) % 12) + 1).padStart(2, '0')}-15`,
    Role: ['Mara Ellison', 'Theo Navarro', 'Priya Anand', 'Jonas Webb', 'Lena Okafor', 'Daniel Ruiz', 'Ines Falk'].map((tag, i) => ({ tag, role: ['Lead', 'Support', 'Support', 'Guest', 'Support', 'Lead', 'Cameo'][i] })),
    ...(isShow ? { leafCount: (s.seasons ?? 1) * 8, viewedLeafCount: (s.id * 3) % ((s.seasons ?? 1) * 8), childCount: s.seasons } : { Media: [STREAMS(`/demo/${s.id}.mkv`)], Marker: [{ type: 'credits', startTimeOffset: 540000, endTimeOffset: s.min * 60000 }] }),
    ...extra,
  }
}

function episode(showId: number, season: number, ep: number, viewed = false, offset = 0): PlexMedia {
  const s = bySeed(showId)
  const t = WORDS[(ep + season * 3) % WORDS.length]
  return {
    ratingKey: `e-${showId}-${season}-${ep}`, title: t, type: 'episode',
    summary: `${s.title} — season ${season}, episode ${ep}. The consequences of the last hour start to catch up with everyone involved, and a decision nobody wanted to make gets made anyway.`,
    index: ep, parentIndex: season, duration: s.min * 60000, grandparentTitle: s.title, grandparentRatingKey: String(showId),
    parentRatingKey: `s-${showId}-${season}`, grandparentThumb: `demo:poster:${s.title}`, grandparentArt: `demo:art:${s.title}`,
    thumb: `demo:still:${t}`, viewCount: viewed ? 1 : 0, viewOffset: offset || undefined, addedAt: NOW - ep * 3600,
    librarySectionID: 2,
    Marker: [{ type: 'intro', startTimeOffset: 6000, endTimeOffset: 18000 }, { type: 'credits', startTimeOffset: 540000, endTimeOffset: s.min * 60000 }],
    Media: [STREAMS(`/demo/${showId}-${season}-${ep}.mkv`)],
  }
}

function hubs(): PlexHub[] {
  const m = (ids: number[], extra?: (s: Seed) => Partial<PlexMedia>) => ids.map((i) => item(bySeed(i), extra?.(bySeed(i))))
  return [
    { title: 'Continue Watching', hubIdentifier: 'home.continue', type: 'mixed', Metadata: [
      { ...episode(2, 2, 4, false, 1_320_000), lastViewedAt: NOW - 2 * 86400 },
      item(bySeed(1), { viewOffset: 3_100_000, lastViewedAt: NOW - 5 * 86400 }),
      { ...episode(11, 1, 6, false, 600_000), lastViewedAt: NOW - 20 * 86400 },
      item(bySeed(8), { viewOffset: 1_200_000, lastViewedAt: NOW - 130 * 86400 }), // older than 3 months: should not show
      { ...episode(4, 1, 3, false, 2_100_000), lastViewedAt: NOW - 40 * 86400 },
    ] },
    { title: 'Recently Added Movies', hubIdentifier: 'movie.recentlyadded', type: 'movie', Metadata: m([5, 12, 16, 1, 7, 3]) },
    { title: 'Recently Added TV', hubIdentifier: 'show.recentlyadded', type: 'episode', Metadata: [episode(9, 1, 8), episode(4, 2, 2), episode(13, 2, 5), episode(6, 3, 1), episode(11, 2, 1)] },
    { title: 'Top Rated', hubIdentifier: 'movie.toprated', type: 'mixed', Metadata: m([11, 2, 8, 6, 1, 7]) },
    { title: 'Sci-Fi & Fantasy', hubIdentifier: 'genre.scifi', type: 'mixed', Metadata: m([7, 11, 14, 1, 16]) },
    { title: 'Laugh Out Loud', hubIdentifier: 'genre.comedy', type: 'mixed', Metadata: m([6, 13, 10, 4]) },
    { title: 'Drama & Romance', hubIdentifier: 'genre.drama', type: 'mixed', Metadata: m([3, 15, 2, 8, 9]) },
  ]
}

export function mockGet(rawPath: string): unknown {
  const [path, query = ''] = rawPath.split('?')
  const q = new URLSearchParams(query)
  if (path === '/profiles') return [
    { id: 1, uuid: 'u1', title: 'Chezz', admin: true, thumb: 'demo:avatar:Chezz' }, { id: 2, uuid: 'u2', title: 'Alex', thumb: 'demo:avatar:Alex' }, { id: 3, uuid: 'u3', title: 'Kids', protected: true, thumb: 'demo:avatar:Kids' },
  ]
  if (path === '/library/sections') {
    const base = [{ key: '1', title: 'Movies', type: 'movie' }, { key: '2', title: 'TV Shows', type: 'show' }]
    if (!location.search.includes('many')) return { Directory: base }
    const extra = ['4K Movies', 'Documentaries', 'Kids', 'Classics', 'Stand-up', 'Holiday', 'Foreign Films', 'Reality TV', 'Sports', 'Home Videos', 'Concerts', 'Short Films']
    return { Directory: [...base, ...extra.map((t, i) => ({ key: String(10 + i), title: t, type: i % 2 ? 'show' : 'movie' }))] }
  }
  if (path === '/hubs') return { Hub: hubs() }
  if (path === '/library/onDeck') return { Metadata: [{ ...episode(9, 1, 2), type: 'episode' as const }] }
  const secHubs = path.match(/^\/hubs\/sections\/(\d+)/)
  if (secHubs) {
    const type = secHubs[1] === '1' ? 'movie' : 'show'
    const all = S.filter((x) => x.type === type)
    const mk = (title: string, id: string, list: Seed[]) => ({ title, hubIdentifier: id, type, Metadata: list.map((x) => item(x)) })
    return { Hub: [
      mk('Recently Added', `${type}.recent`, all),
      mk('Top Rated', `${type}.top`, [...all].sort((a, b) => b.rating - a.rating)),
      mk('Unwatched', `${type}.unwatched`, [...all].reverse()),
      mk('Recently Released', `${type}.released`, [...all].sort((a, b) => b.year - a.year)),
    ] }
  }
  const gen = path.match(/^\/library\/sections\/(\d+)\/genre/)
  if (gen) {
    const type = gen[1] === '1' ? 'movie' : 'show'
    const tags = [...new Set(S.filter((x) => x.type === type).flatMap((x) => x.genres))]
    return { Directory: tags.map((t) => ({ key: t, title: t })) }
  }
  const years = path.match(/^\/library\/sections\/(\d+)\/year/)
  if (years) { const type = years[1] === '1' ? 'movie' : 'show'; return { Directory: [...new Set(S.filter((x) => x.type === type).map((x) => x.year))].map((y) => ({ key: String(y), title: String(y) })) } }
  const recent = path.match(/^\/library\/sections\/(\d+)\/recentlyAdded/)
  if (recent) return { Metadata: S.filter((x) => x.type === (recent[1] === '1' ? 'movie' : 'show')).sort((a, b) => b.id - a.id).map((x) => item(x)) }
  const colls = path.match(/^\/library\/sections\/(\d+)\/collections/)
  if (colls) return { Metadata: colls[1] === '1' ? [{ ratingKey: 'c4', title: '_Trending Movies', thumb: 'demo:poster:Trending' }, { ratingKey: 'c1', title: 'Edge-of-Your-Seat Thrillers', thumb: 'demo:poster:Thrillers' }, { ratingKey: 'c2', title: 'Feel-Good Favorites', thumb: 'demo:poster:Feel Good' }] : [{ ratingKey: 'c3', title: 'Prestige Drama', thumb: 'demo:poster:Prestige' }] }
  const collItems = path.match(/^\/library\/collections\/(\w+)\/children/)
  if (collItems) { const pick = collItems[1] === 'c4' ? [1, 5, 16, 7] : collItems[1] === 'c1' ? [1, 5, 12, 16] : collItems[1] === 'c2' ? [3, 10, 15] : [2, 11]; return { Metadata: pick.map((i) => item(bySeed(i))) } }
  if (path === '/playlists') return { Metadata: [{ ratingKey: 'p1', title: 'Friday Movie Night' }, { ratingKey: 'p2', title: 'Rainy Day Comfort' }] }
  const plItems = path.match(/^\/playlists\/(\w+)\/items/)
  if (plItems) return { Metadata: (plItems[1] === 'p1' ? [5, 1, 14, 7, 12] : [3, 15, 6, 10]).map((i) => item(bySeed(i))) }
  if (path.startsWith('/library/sections/')) {
    const type = path.includes('/1/') ? 'movie' : 'show'
    const genre = q.get('genre')
    const year = q.get('year')
    let list = S.filter((s) => s.type === type && (!genre || s.genres.includes(genre)) && (!year || String(s.year) === year)).map((s) => item(s))
    const sort = q.get('sort') ?? 'titleSort'
    if (sort === 'random') { list = list.sort(() => Math.random() - 0.5); return { Metadata: list, totalSize: list.length } }
    if (sort.startsWith('titleSort')) { list.sort((a, b) => a.title.localeCompare(b.title)); if (sort.endsWith(':desc')) list.reverse() }
    else if (sort.startsWith('addedAt')) list.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
    else if (sort.startsWith('originally')) list.sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
    else list.sort((a, b) => (b.audienceRating ?? 0) - (a.audienceRating ?? 0))
    // Pad the full-library grid (page size 120) so scrolling/paging has something to chew on; small row queries stay clean.
    if (!genre && !year && Number(q.get('X-Plex-Container-Size') ?? 0) === 120) list = [...list, ...list.map((x) => ({ ...x, ratingKey: x.ratingKey + 'b' }))]
    return { Metadata: list, totalSize: list.length }
  }
  if (path.startsWith('/hubs/search')) {
    const term = (q.get('query') ?? '').toLowerCase()
    return { Hub: [{ title: 'Results', hubIdentifier: 'r', type: 'movie', Metadata: S.filter((s) => s.title.toLowerCase().includes(term)).map((s) => item(s)) }] }
  }
  const rel = path.match(/^\/hubs\/metadata\/(\d+)\/related/)
  if (rel) return { Hub: [{ title: 'More like this', hubIdentifier: 'rel', Metadata: S.filter((s) => String(s.id) !== rel[1]).slice(0, 8).map((s) => item(s)) }] }
  const kids = path.match(/^\/library\/metadata\/([^/]+)\/children/)
  if (kids) {
    const id = kids[1]
    if (id.startsWith('s-')) {
      const [, showId, season] = id.split('-').map(Number)
      return { Metadata: Array.from({ length: 8 }, (_, i) => episode(showId, season, i + 1, season === 1 || i < 3, season === 2 && i === 3 ? 1_320_000 : 0)) }
    }
    const s = bySeed(parseInt(id))
    return { Metadata: Array.from({ length: s.seasons ?? 1 }, (_, i) => ({ ratingKey: `s-${s.id}-${i + 1}`, title: `Season ${i + 1}`, type: 'season', index: i + 1, leafCount: 8, viewedLeafCount: i === 0 ? 8 : 0, thumb: `demo:poster:${s.title}`, parentRatingKey: String(s.id) })) }
  }
  const md = path.match(/^\/library\/metadata\/([^/]+)$/)
  if (md) {
    const id = md[1]
    if (id.startsWith('e-')) { const [, a, b, c] = id.split('-').map(Number); return { Metadata: [episode(a, b, c)] } }
    const base = item(bySeed(parseInt(id)))
    if (base.type === 'show') base.OnDeck = { Metadata: episode(parseInt(id), 2, 4, false, 1_320_000) }
    return { Metadata: [base] }
  }
  return {}
}
