#!/usr/bin/env bash
# Merges the arm64 and x86_64 libmpv builds into ONE universal dylib, checks it only depends on macOS system
# libraries, ad-hoc signs it, and collects the third-party license notices.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/versions.env"
OUT="$ROOT/out/universal"
SRC="$ROOT/work/src"
mkdir -p "$OUT/lib" "$ROOT/licenses"

for a in arm64 x86_64; do
  [ -f "$ROOT/out/$a/lib/libmpv.2.dylib" ] || { echo "missing $a build — run scripts/build.sh $a first"; exit 1; }
done

lipo -create "$ROOT/out/arm64/lib/libmpv.2.dylib" "$ROOT/out/x86_64/lib/libmpv.2.dylib" -output "$OUT/lib/libmpv.2.dylib"
ln -sf libmpv.2.dylib "$OUT/lib/libmpv.dylib"
install_name_tool -id "@rpath/libmpv.2.dylib" "$OUT/lib/libmpv.2.dylib"
# Drop any developer-machine search paths (e.g. the Command Line Tools folder); keep the system Swift runtime path.
for arch in arm64 x86_64; do
  otool -arch "$arch" -l "$OUT/lib/libmpv.2.dylib" | awk '/LC_RPATH/{f=1} f&&/ path /{print $2; f=0}' | sort -u | while read -r rp; do
    [ "$rp" = "/usr/lib/swift" ] && continue
    install_name_tool -delete_rpath "$rp" "$OUT/lib/libmpv.2.dylib" 2>/dev/null || true
  done
done

echo "architectures: $(lipo -archs "$OUT/lib/libmpv.2.dylib")"

# Must only reference macOS itself. Anything else (Homebrew, our build folder) would break on someone else's Mac.
bad="$(otool -arch all -L "$OUT/lib/libmpv.2.dylib" | tail -n +2 | grep -E '^\s' | grep -vE '^\s*(/usr/lib/|/System/Library/|@rpath/libmpv\.2\.dylib)' || true)"
if [ -n "$bad" ]; then echo "✘ libmpv depends on non-system libraries:"; echo "$bad"; exit 1; fi
echo "✔ depends only on system libraries"

# Make the system Swift runtime links optional so older macOS versions that lack a newer overlay can still launch the app.
python3 "$ROOT/scripts/weaken_swift.py" "$OUT/lib/libmpv.2.dylib"

codesign --force --sign - "$OUT/lib/libmpv.2.dylib"

# License notices (LGPL requires shipping them with the app).
L="$ROOT/licenses"; rm -rf "$L"; mkdir -p "$L"
cp_lic() { local name="$1"; shift; for f in "$@"; do [ -f "$SRC/$name/$f" ] && cp "$SRC/$name/$f" "$L/${name}-$(basename "$f")"; done; }
cp_lic mpv LICENSE.LGPL Copyright
cp_lic ffmpeg COPYING.LGPLv3 COPYING.LGPLv2.1 LICENSE.md
cp_lic libplacebo LICENSE
cp_lic libass COPYING
cp_lic freetype docs/FTL.TXT
cp_lic harfbuzz COPYING
cp_lic fribidi COPYING
cp_lic dav1d COPYING
cp_lic openssl LICENSE.txt
cat > "$L/THIRD-PARTY.md" <<DOC
# Third-party software in Chezzflix's built-in player

Chezzflix plays video with **libmpv**, built from source as an LGPL-only library (no GPL components), with these
statically linked libraries:

| Component | Version | License |
|---|---|---|
| mpv (libmpv) | ${MPV_VERSION} | LGPL-2.1-or-later |
| FFmpeg | ${FFMPEG_VERSION} | LGPL-3.0-or-later (built with --enable-version3, no GPL/nonfree parts) |
| libplacebo | ${LIBPLACEBO_TAG} | LGPL-2.1-or-later |
| libass | ${LIBASS_VERSION} | ISC |
| FreeType | ${FREETYPE_VERSION} | FreeType License (FTL) |
| HarfBuzz | ${HARFBUZZ_VERSION} | MIT |
| FriBidi | ${FRIBIDI_VERSION} | LGPL-2.1-or-later |
| dav1d | ${DAV1D_VERSION} | BSD-2-Clause |
| OpenSSL | ${OPENSSL_VERSION} | Apache-2.0 |

Source code for each component is available from its upstream project at the version above. The exact build
recipe (flags, versions) is in \`native-deps/scripts/build.sh\`, so the library can be rebuilt or replaced.
DOC
echo "✔ universal libmpv: $OUT/lib/libmpv.2.dylib"
