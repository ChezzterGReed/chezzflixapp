import { Flame, TrendingUp } from 'lucide-react'
import { imageUrl, posterPath, type PlexMedia, type PlexServer } from '../lib/plex'

/** The Trending tab's header: a slim banner with a fan of this week's trending posters (instead of a rotating hero). */
export function TrendingBanner({ server, posters, count, loading }: { server: PlexServer; posters: PlexMedia[]; count: number; loading: boolean }) {
  const fan = posters.slice(0, 5)
  return (
    <div className="relative isolate overflow-hidden pb-10 pt-28">
      {/* colour wash + slow sheen */}
      <div className="absolute inset-0 -z-10 bg-linear-to-br from-accent/35 via-[#14111c] to-bg" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_80%_20%,rgba(255,255,255,.10),transparent_55%)]" />
      <div className="banner-sheen absolute inset-y-0 -z-10 w-1/3 bg-linear-to-r from-transparent via-white/8 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-24 bg-linear-to-t from-bg to-transparent" />

      <div className="relative flex items-end justify-between gap-8 px-[var(--gutter)]">
        <div className="fade-up max-w-xl">
          <div className="mb-3 flex items-center gap-2 text-[0.72rem] font-bold uppercase tracking-[0.22em] text-white/70">
            <Flame size={15} className="text-accent" />This week
          </div>
          <h1 className="text-[clamp(2.4rem,4.6vw,4.2rem)] font-extrabold leading-[0.98] tracking-[-0.035em]">Trending now</h1>
          <p className="mt-3 flex items-center gap-2 text-[1.02rem] text-white/70">
            <TrendingUp size={18} className="shrink-0 text-accent" />
            {loading ? 'Checking what everyone’s watching…' : count > 0 ? `${count} of this week’s trending titles are in your library.` : 'What’s popular right now, matched to your library.'}
          </p>
        </div>

        {/* a fan of posters */}
        <div className="relative hidden h-44 w-[22rem] shrink-0 md:block">
          {fan.map((m, n) => {
            const mid = (fan.length - 1) / 2
            return (
              <div key={m.ratingKey} className="fan-card absolute bottom-0 aspect-[2/3] w-28 overflow-hidden rounded-xl bg-surface shadow-[0_18px_40px_-10px_rgba(0,0,0,.8)] ring-1 ring-white/15"
                style={{ left: `${n * 58}px`, transform: `translateY(${Math.abs(n - mid) * 6}px) rotate(${(n - mid) * 5}deg)`, zIndex: 10 - Math.abs(n - mid) | 0, animationDelay: `${n * 90}ms` }}>
                <img src={imageUrl(server, posterPath(m), 240, 360)} alt="" draggable={false} className="size-full object-cover" />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
