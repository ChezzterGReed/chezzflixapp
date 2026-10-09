#!/usr/bin/env bash
# Builds a release and publishes it to GitHub Releases. Installed copies find it through latest.json and offer the update.
# Usage: scripts/publish-mac.sh "What's new in this version"      (bump "version" in app/src-tauri/tauri.conf.json + Cargo.toml first)
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="ChezzterGReed/chezzflixapp"
VER="$(python3 -c "import json;print(json.load(open('app/src-tauri/tauri.conf.json'))['version'])")"
NOTES="${1:-}"
mkdir -p "releases/$VER"; printf '%s' "$NOTES" > "releases/$VER/notes.txt"
scripts/release-mac.sh
gh release view "v$VER" --repo "$REPO" >/dev/null 2>&1 && { echo "v$VER already exists on GitHub — bump the version first."; exit 1; }
gh release create "v$VER" --repo "$REPO" --title "Chezzflix $VER" --notes "${NOTES:-Chezzflix $VER}" \
  "releases/$VER/Chezzflix_${VER}_universal.dmg" "releases/$VER/Chezzflix.app.tar.gz" "releases/$VER/Chezzflix.app.tar.gz.sig" "releases/latest.json"
echo "✔ Published v$VER — installed apps will offer it within a few hours (or via Settings → About → Check now)."
