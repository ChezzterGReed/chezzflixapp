#!/usr/bin/env bash
# Builds BOTH the Mac and Android apps and publishes them as one GitHub release (so the update feed covers both).
# Usage: scripts/publish.sh "What's new"      (bump "version" in app/src-tauri/tauri.conf.json + Cargo.toml first)
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="ChezzterGReed/chezzflixapp"
VER="$(python3 -c "import json;print(json.load(open('app/src-tauri/tauri.conf.json'))['version'])")"
NOTES="${1:-}"
gh release view "v$VER" --repo "$REPO" >/dev/null 2>&1 && { echo "v$VER already exists on GitHub: bump the version first."; exit 1; }
mkdir -p "releases/$VER"; printf '%s' "$NOTES" > "releases/$VER/notes.txt"
scripts/release-mac.sh
scripts/release-android.sh
cp "releases/$VER/Chezzflix_${VER}_universal.dmg" "releases/$VER/Chezzflix.dmg"   # fixed-name copy for ".../releases/latest/download/Chezzflix.dmg"
scripts/make-feed.py "$VER" "https://github.com/$REPO/releases/download/v$VER"
gh release create "v$VER" --repo "$REPO" --title "Chezzflix $VER" --notes "${NOTES:-Chezzflix $VER}" \
  "releases/$VER/Chezzflix_${VER}_universal.dmg" "releases/$VER/Chezzflix.app.tar.gz" "releases/$VER/Chezzflix.app.tar.gz.sig" \
  "releases/$VER/Chezzflix_${VER}_android.apk" "releases/$VER/Chezzflix.apk" "releases/$VER/Chezzflix.dmg" "releases/latest.json"
echo "✔ Published v$VER (Mac + Android). Installed apps will offer it; new Android installs: .../releases/latest/download/Chezzflix.apk"
