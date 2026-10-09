#!/usr/bin/env bash
# Downloads and unpacks every source into work/src/<name>. Each download gets its own directory.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/versions.env"
DL="$ROOT/work/downloads"; SRC="$ROOT/work/src"
mkdir -p "$DL" "$SRC"

get() { # name url archive-filename
  local name="$1" url="$2" file="$3"
  [ -d "$SRC/$name" ] && { echo "have $name"; return; }
  mkdir -p "$DL/$name"
  echo "fetching $name"
  curl -fL --retry 3 -o "$DL/$name/$file" "$url"
  mkdir -p "$SRC/$name"
  tar -xf "$DL/$name/$file" -C "$SRC/$name" --strip-components=1
}

get mpv       "https://github.com/mpv-player/mpv/archive/refs/tags/v${MPV_VERSION}.tar.gz"                                            mpv.tar.gz
get ffmpeg    "https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz"                                                             ffmpeg.tar.xz
get freetype  "https://download.savannah.gnu.org/releases/freetype/freetype-${FREETYPE_VERSION}.tar.xz"                                 freetype.tar.xz
get harfbuzz  "https://github.com/harfbuzz/harfbuzz/releases/download/${HARFBUZZ_VERSION}/harfbuzz-${HARFBUZZ_VERSION}.tar.xz"        harfbuzz.tar.xz
get fribidi   "https://github.com/fribidi/fribidi/releases/download/v${FRIBIDI_VERSION}/fribidi-${FRIBIDI_VERSION}.tar.xz"              fribidi.tar.xz
get libass    "https://github.com/libass/libass/releases/download/${LIBASS_VERSION}/libass-${LIBASS_VERSION}.tar.xz"                   libass.tar.xz
get openssl   "https://github.com/openssl/openssl/releases/download/openssl-${OPENSSL_VERSION}/openssl-${OPENSSL_VERSION}.tar.gz"      openssl.tar.gz

# dav1d's GitLab archive links are bot-protected, so use git for the VideoLAN projects.
if [ ! -d "$SRC/dav1d" ]; then
  echo "cloning dav1d $DAV1D_VERSION"
  git clone --depth 1 --branch "$DAV1D_VERSION" https://code.videolan.org/videolan/dav1d.git "$SRC/dav1d"
fi

# libplacebo needs its git submodules, which release tarballs don't include.
if [ ! -d "$SRC/libplacebo" ]; then
  echo "cloning libplacebo $LIBPLACEBO_TAG"
  git clone --depth 1 --branch "$LIBPLACEBO_TAG" --recursive --shallow-submodules https://code.videolan.org/videolan/libplacebo.git "$SRC/libplacebo"
fi
echo "sources ready"
