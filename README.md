# Chezzflix

A custom Plex frontend: TV-first interface, direct play through an embedded mpv engine, per-profile settings.

- `app/` — the app (Tauri 2 + React). `cd app && npm install && npx tauri dev`
- `native-deps/` — builds the self-contained LGPL libmpv the app embeds (see its README). Needed before a release build.
- `scripts/` — `release-mac.sh` (build + update feed) and `publish-mac.sh` (publish to GitHub Releases)
- `DISTRIBUTING.md` — signing, installing and sharing the Mac app

Chezzflix is not affiliated with Plex. Trending uses the TMDB API but is not endorsed or certified by TMDB.
