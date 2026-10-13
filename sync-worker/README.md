# Chezzflix settings sync

A tiny Cloudflare Worker + database that keeps each person's app settings (colours, home layout, subtitle look, TV Guide channels and their
content...) the same on every device. It is free at this size (Cloudflare's free plan allows about 100,000 requests a day).

**What it stores:** one row per person per Plex server, keyed by a hash of (server id + the person's Plex user id). The row is that person's
settings as JSON. No names, no logins, no tokens.

**What it never receives:** the TMDB key, the Overseerr address, and settings that belong to one device (low-power mode, video engine).

**How it knows who is asking:** each request carries the person's Plex token. The Worker asks plex.tv who the token belongs to and whether
they can use the claimed server, uses the answer to pick the row, and forgets the token. Someone who isn't on a server can't read or write
anything for it. The Worker keeps no logs of tokens; keep it that way if you change it.

## Set it up (about 10 minutes, once)

You need a free Cloudflare account (https://dash.cloudflare.com/sign-up) and Node installed. Turn on two-factor sign-in for the account.

```bash
cd sync-worker
npm install
npx wrangler login            # opens a browser to sign in to Cloudflare
npm run db:create             # prints a database_id: paste it into wrangler.toml
npm run db:init               # creates the table
npm run deploy                # prints the Worker's address, e.g. https://chezzflix-sync.<you>.workers.dev
```

Then put that address in `app/src/lib/sync.ts` (`SYNC_URL`), or build the app with `VITE_SYNC_URL=<address>`, and publish a new version.
Until an address is set, sync stays off and the app behaves as before.

## Trying it locally

```bash
npm run db:init:local
node fake-plex.mjs &                                   # a stand-in for plex.tv (tokens look like tok-<name>)
npx wrangler dev --local --persist-to .wrangler-dev --var PLEX_API:http://localhost:8788
VITE_SYNC_URL=http://localhost:8787 npm run dev        # in /app: the demo app syncs under a fake token
```

## The API

`GET /v1/settings` and `PUT /v1/settings`, both with headers `X-Plex-Token` and `X-Server-Id`. `PUT` takes `{ "values": {...}, "meta": {...} }`
(`meta` = when each setting was last changed on a device). Writes are limited to one every ~1.5 s per person and 256 KB per row.
