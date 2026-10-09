#!/usr/bin/env bash
# Builds a self-contained libmpv for ONE architecture (arm64 or x86_64).
#
# Everything libmpv needs (ffmpeg, libplacebo, libass, freetype, harfbuzz, fribidi, dav1d, openssl) is compiled
# as a STATIC library into out/<arch>/ and linked into a single libmpv dylib that depends only on macOS system
# libraries. No Homebrew paths leak in: pkg-config is pointed at our own prefix only.
#
# Usage: scripts/build.sh arm64|x86_64        (resumable: finished stages are skipped)
set -euo pipefail

ARCH="${1:?usage: build.sh arm64|x86_64}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/versions.env"

SRC="$ROOT/work/src"
PREFIX="$ROOT/out/$ARCH"
BUILD="$ROOT/work/build/$ARCH"
LOGS="$ROOT/work/logs"
BIN="$ROOT/work/bin"
JOBS="$(sysctl -n hw.ncpu)"
HOST_ARCH="$(uname -m)"; [ "$HOST_ARCH" = "arm64" ] || HOST_ARCH="x86_64"
mkdir -p "$PREFIX/lib/pkgconfig" "$BUILD" "$LOGS" "$BIN"

case "$ARCH" in
  arm64)  TRIPLE=aarch64-apple-darwin; OSSL=darwin64-arm64-cc;  MESON_CPU=aarch64 ;;
  x86_64) TRIPLE=x86_64-apple-darwin;  OSSL=darwin64-x86_64-cc; MESON_CPU=x86_64 ;;
  *) echo "unknown arch $ARCH"; exit 1 ;;
esac
CROSS=0; [ "$ARCH" != "$HOST_ARCH" ] && CROSS=1

# --- isolate the build from Homebrew ---------------------------------------------------------------
ln -sf "$(command -v pkgconf)" "$BIN/pkg-config" 2>/dev/null || true
export PATH="$BIN:$PATH"
export MACOSX_DEPLOYMENT_TARGET="$MACOS_MIN"
export PKG_CONFIG_LIBDIR="$PREFIX/lib/pkgconfig"
unset PKG_CONFIG_PATH
FLAGS="-arch $ARCH -mmacosx-version-min=$MACOS_MIN -O2 -fPIC"
# Workaround: some Command Line Tools installs keep a partial, stale copy of libc++ headers in the toolchain folder
# (no <cassert> etc.) which clang prefers over the complete copy in the SDK. Point C++ at the SDK's headers explicitly.
SDK="$(xcrun --show-sdk-path)"
CXX_SDK_FLAGS="-nostdinc++ -isystem $SDK/usr/include/c++/v1"
export CFLAGS="$FLAGS" CXXFLAGS="$FLAGS $CXX_SDK_FLAGS" OBJCFLAGS="$FLAGS" LDFLAGS="-arch $ARCH -mmacosx-version-min=$MACOS_MIN"
export CC="clang" CXX="clang++"

# Meson machine file (meson ignores CFLAGS when a cross file is used, so the flags live here).
MESON_FILE="$BUILD/meson-$ARCH.ini"
cat > "$MESON_FILE" <<EOF
[binaries]
c = ['clang', '-arch', '$ARCH']
cpp = ['clang++', '-arch', '$ARCH', '-nostdinc++', '-isystem', '$SDK/usr/include/c++/v1']
objc = ['clang', '-arch', '$ARCH']
ar = 'ar'
strip = 'strip'
pkg-config = '$BIN/pkg-config'

[host_machine]
system = 'darwin'
cpu_family = '$MESON_CPU'
cpu = '$MESON_CPU'
endian = 'little'

[properties]
needs_exe_wrapper = false

[built-in options]
c_args = ['-mmacosx-version-min=$MACOS_MIN', '-O2', '-fPIC']
cpp_args = ['-mmacosx-version-min=$MACOS_MIN', '-O2', '-fPIC']
objc_args = ['-mmacosx-version-min=$MACOS_MIN', '-O2', '-fPIC']
c_link_args = ['-mmacosx-version-min=$MACOS_MIN', '-Wl,-dead_strip_dylibs']
cpp_link_args = ['-mmacosx-version-min=$MACOS_MIN', '-Wl,-dead_strip_dylibs']
objc_link_args = ['-mmacosx-version-min=$MACOS_MIN', '-Wl,-dead_strip_dylibs']
pkg_config_path = ['$PREFIX/lib/pkgconfig']
EOF

stage() { # stage <name> <function>
  local name="$1" fn="$2" stamp="$PREFIX/.stamp-$1"
  if [ -f "$stamp" ]; then echo "[$ARCH] $name: done already"; return; fi
  echo "[$ARCH] $name: building…  (log: work/logs/$ARCH-$name.log)"
  if ( set -euo pipefail; "$fn" ) > "$LOGS/$ARCH-$name.log" 2>&1; then
    touch "$stamp"; echo "[$ARCH] $name: ok"
  else
    echo "[$ARCH] $name: FAILED — last lines:"; tail -25 "$LOGS/$ARCH-$name.log"; exit 1
  fi
}

meson_static() { # meson_static <name> <extra meson args…>   (static dependency, installed into $PREFIX)
  local name="$1"; shift
  rm -rf "$BUILD/$name"
  meson setup "$BUILD/$name" "$SRC/$name" --cross-file "$MESON_FILE" --prefix "$PREFIX" --libdir lib \
    --buildtype release --default-library static "$@"
  ninja -C "$BUILD/$name" -j "$JOBS"
  ninja -C "$BUILD/$name" install
}

# --- stages ----------------------------------------------------------------------------------------
build_openssl() {
  rm -rf "$BUILD/openssl"; cp -R "$SRC/openssl" "$BUILD/openssl"; cd "$BUILD/openssl"
  # --openssldir=/etc/ssl: macOS ships its CA bundle at /etc/ssl/cert.pem, so HTTPS verification finds it.
  ./Configure "$OSSL" no-shared no-tests no-docs no-apps no-engine no-module --prefix="$PREFIX" --openssldir=/etc/ssl --libdir=lib "-mmacosx-version-min=$MACOS_MIN"
  make -j "$JOBS" build_libs
  make install_dev
}

build_dav1d() { meson_static dav1d -Denable_tools=false -Denable_tests=false -Denable_examples=false -Denable_docs=false; }

build_freetype() { meson_static freetype -Dbrotli=disabled -Dbzip2=disabled -Dharfbuzz=disabled -Dpng=disabled -Dzlib=system -Dtests=disabled; }

build_harfbuzz() {
  meson_static harfbuzz -Dfreetype=enabled -Dcoretext=enabled -Dglib=disabled -Dgobject=disabled -Dcairo=disabled -Dicu=disabled \
    -Dtests=disabled -Dbenchmark=disabled -Ddocs=disabled -Dutilities=disabled -Dintrospection=disabled
}

build_fribidi() { meson_static fribidi -Ddocs=false -Dtests=false -Dbin=false; }

build_libass() {
  rm -rf "$BUILD/libass"; mkdir -p "$BUILD/libass"; cd "$BUILD/libass"
  CC="clang -arch $ARCH" "$SRC/libass/configure" --prefix="$PREFIX" --host="$TRIPLE" --disable-shared --enable-static \
    --disable-fontconfig --disable-libunibreak --enable-coretext --disable-require-system-font-provider
  make -j "$JOBS"
  make install
}

build_libplacebo() {
  # OpenGL renderer only: that's what libmpv's render API uses. No Vulkan/shaderc, so no extra heavy dependencies.
  meson_static libplacebo -Dvulkan=disabled -Dopengl=enabled -Dd3d11=disabled -Dglslang=disabled -Dshaderc=disabled \
    -Dlcms=disabled -Dlibdovi=disabled -Dunwind=disabled -Dxxhash=disabled -Ddemos=false -Dtests=false -Dbench=false -Dfuzz=false
}

build_ffmpeg() {
  rm -rf "$BUILD/ffmpeg"; mkdir -p "$BUILD/ffmpeg"; cd "$BUILD/ffmpeg"
  local cross=(); [ "$CROSS" = 1 ] && cross=(--enable-cross-compile)
  # Decoders/demuxers/parsers/filters stay at their defaults so mpv can play whatever a Plex library contains.
  # No GPL or nonfree components: no x264/x265, no fdk-aac. OpenSSL (Apache-2.0) needs --enable-version3 (LGPLv3).
  "$SRC/ffmpeg/configure" --prefix="$PREFIX" --arch="$ARCH" --target-os=darwin ${cross[@]+"${cross[@]}"} \
    --cc="clang -arch $ARCH" --cxx="clang++ -arch $ARCH $CXX_SDK_FLAGS" --pkg-config=pkg-config --pkg-config-flags=--static \
    --extra-cflags="-mmacosx-version-min=$MACOS_MIN -I$PREFIX/include" --extra-ldflags="-arch $ARCH -mmacosx-version-min=$MACOS_MIN -L$PREFIX/lib" \
    --disable-autodetect --disable-programs --disable-doc --disable-debug --disable-shared --enable-static --enable-pic \
    --enable-version3 --enable-network --enable-openssl --enable-libdav1d --enable-zlib --enable-bzlib --enable-iconv \
    --enable-videotoolbox --enable-audiotoolbox \
    --disable-encoders --disable-muxers --disable-devices --disable-avdevice
  make -j "$JOBS"
  make install
}

build_mpv() {
  rm -rf "$BUILD/mpv"
  meson setup "$BUILD/mpv" "$SRC/mpv" --cross-file "$MESON_FILE" --prefix "$PREFIX" --libdir lib --sysconfdir /etc --buildtype release \
    -Dprefer_static=true \
    -Dlibmpv=true -Dcplayer=false -Dgpl=false -Dtests=false \
    -Dcocoa=enabled -Dgl=enabled -Dgl-cocoa=enabled -Dvideotoolbox-gl=enabled -Dvideotoolbox-pl=disabled -Dcoreaudio=enabled \
    -Dswift-build=enabled "-Dswift-flags=-target $ARCH-apple-macosx$MACOS_MIN" \
    -Dmacos-cocoa-cb=disabled -Dmacos-media-player=disabled -Dmacos-touchbar=disabled \
    -Dlua=disabled -Djavascript=disabled -Dlcms2=disabled -Dlibarchive=disabled -Dlibbluray=disabled -Duchardet=disabled \
    -Drubberband=disabled -Dvapoursynth=disabled -Dzimg=disabled -Dsdl2-gamepad=disabled -Dsdl2-audio=disabled -Dsdl2-video=disabled \
    -Dshaderc=disabled -Dspirv-cross=disabled -Dvulkan=disabled -Djpeg=disabled -Dopenal=disabled -Dlibavdevice=disabled \
    -Dmanpage-build=disabled -Dhtml-build=disabled -Dpdf-build=disabled
  ninja -C "$BUILD/mpv" -j "$JOBS"
  ninja -C "$BUILD/mpv" install
}

stage openssl    build_openssl
stage dav1d      build_dav1d
stage freetype   build_freetype
stage harfbuzz   build_harfbuzz
stage fribidi    build_fribidi
stage libass     build_libass
stage libplacebo build_libplacebo
stage ffmpeg     build_ffmpeg
stage mpv        build_mpv

echo "[$ARCH] ✔ libmpv built: $PREFIX/lib/libmpv.2.dylib"
file "$PREFIX/lib/libmpv.2.dylib" 2>/dev/null || true
