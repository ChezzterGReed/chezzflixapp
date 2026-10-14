#!/usr/bin/env bash
# Makes a tested beta the live release: the same build, no rebuild. Devices on the Live channel are offered it from then on.
# Usage: scripts/promote.sh <version>        (then merge the beta branch into main: see the reminder it prints)
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="ChezzterGReed/chezzflixapp"
VER="${1:?Usage: scripts/promote.sh <version>  (for example 0.3.29)}"
gh release view "v$VER" --repo "$REPO" --json isPrerelease --jq '.isPrerelease' | grep -q true || { echo "v$VER is not a beta (or does not exist)."; exit 1; }
gh release edit "v$VER" --repo "$REPO" --prerelease=false --latest
echo "✔ v$VER is now the live release."
echo "Now keep the branches in step:  git checkout main && git merge beta && git push"
