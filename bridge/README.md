# Chezzflix Bridge

Your Plex movies and shows as an **Xtream Codes** service, so IPTV apps (TiviMate, IPTV Smarters, XCIPTV, Televizo and similar) can browse and play them.

It never transcodes. Playing a title sends the original file straight through from Plex (with seeking), and the device you're watching on does the decoding.

## Run it (Docker, on the NAS or any machine that can reach Plex)

```bash
cd bridge
cp example.env .env      # then fill in PLEX_URL, PLEX_TOKEN and BRIDGE_PASS
docker compose up -d --build
```

In the IPTV app, add a provider of type **Xtream Codes** with:

| Field | Value |
|---|---|
| Server / URL | `http://<machine running the bridge>:8080` |
| Username | your `BRIDGE_USER` |
| Password | your `BRIDGE_PASS` |

Apps that only take a playlist can use `http://<host>:8080/get.php?username=USER&password=PASS&type=m3u_plus` (movies only).

Without Docker: `PLEX_URL=... PLEX_TOKEN=... BRIDGE_PASS=... node server.mjs` (Node 20 or newer).

## Away from home

Don't forward the port to the internet as is. Either put the machine on **Tailscale** and use its Tailscale address, or put it behind an HTTPS reverse proxy (Caddy, Nginx Proxy Manager). The password is part of every stream address, so make it long.

## Finding your Plex token

Plex Web → any item → ⋯ → Get Info → View XML; the address ends with `X-Plex-Token=...`.

## What it does and doesn't do

- Movies and shows (seasons and episodes), grouped by genre, with posters and summaries.
- Pictures are fetched through the bridge, so the Plex token never reaches the IPTV app.
- Nothing is marked watched in Plex.
- Live channels / TV guide are not part of this version (the Live section is empty).
- Subtitles: whatever the IPTV app's player can read from inside the file. Sidecar `.srt` files aren't passed along.
- If a device can't decode a file (for example some DTS audio on a Fire Stick), the bridge can't fix that: it doesn't transcode.

Test it without Plex: `npm test` starts a fake Plex and checks every endpoint.
