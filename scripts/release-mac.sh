#!/usr/bin/env bash
# Builds the universal Mac app, then assembles everything an update server needs into releases/<version>/:
#   Chezzflix_<v>_universal.dmg   - the installer for new people
#   Chezzflix.app.tar.gz + .sig   - the signed update package the app downloads
#   latest.json                   - the feed the installed apps check
# Usage: scripts/release-mac.sh [download-base-url]   (default: this repo's GitHub Releases; pass http://localhost:8787 for a local test)
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="ChezzterGReed/chezzflixapp"
VER_="$(python3 -c "import json;print(json.load(open('app/src-tauri/tauri.conf.json'))['version'])")"
BASE="${1:-https://github.com/$REPO/releases/download/v$VER_}"
KEY="${TAURI_SIGNING_PRIVATE_KEY_PATH:-$HOME/.tauri/chezzflix.key}"
[ -f "$KEY" ] || { echo "Signing key not found at $KEY"; exit 1; }
export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY")" TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" MACOSX_DEPLOYMENT_TARGET=11.0

( cd app && npx tauri build --target universal-apple-darwin )

B=app/src-tauri/target/universal-apple-darwin/release/bundle
VER="$(python3 -c "import json;print(json.load(open('app/src-tauri/tauri.conf.json'))['version'])")"
OUT="releases/$VER"; mkdir -p "$OUT"
cp "$B/dmg/Chezzflix_${VER}_universal.dmg" "$OUT/"
cp "$B/macos/Chezzflix.app.tar.gz" "$B/macos/Chezzflix.app.tar.gz.sig" "$OUT/"
python3 - "$OUT" "$VER" "$BASE" <<'PY'
import json, sys, datetime
out, ver, base = sys.argv[1:4]
sig = open(f"{out}/Chezzflix.app.tar.gz.sig").read().strip()
entry = {"signature": sig, "url": f"{base}/Chezzflix.app.tar.gz" if "github.com" in base else f"{base}/{ver}/Chezzflix.app.tar.gz"}
feed = {"version": ver, "notes": open(f"{out}/notes.txt").read().strip() if __import__('os').path.exists(f"{out}/notes.txt") else "",
        "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "platforms": {"darwin-aarch64": entry, "darwin-x86_64": entry}}
json.dump(feed, open("releases/latest.json", "w"), indent=2)
PY
echo; echo "✔ $OUT ready; feed: releases/latest.json (version $VER)"
