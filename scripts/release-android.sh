#!/usr/bin/env bash
# Builds a signed Android APK (64-bit and 32-bit ARM, so it runs on Shield, Onn, Fire TV and phones) into releases/<version>/.
# Needs: JDK 17 (brew install openjdk@17), the Android SDK + NDK 27 (~/Library/Android/sdk), and the signing key in ~/.tauri (see DISTRIBUTING.md).
set -euo pipefail
cd "$(dirname "$0")/.."
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}" ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export NDK_HOME="${NDK_HOME:-$ANDROID_HOME/ndk/27.2.12479018}"
NDKBIN="$NDK_HOME/toolchains/llvm/prebuilt/darwin-x86_64/bin"
SHIMS="$HOME/.cache/chezzflix-ndk-shims"   # OpenSSL's build looks for old GNU tool names; point them at the NDK's LLVM tools
mkdir -p "$SHIMS"
for t in aarch64-linux-android armv7a-linux-androideabi arm-linux-androideabi i686-linux-android x86_64-linux-android; do for tool in ar ranlib strip nm objcopy; do ln -sf "$NDKBIN/llvm-$tool" "$SHIMS/$t-$tool"; done; done
export PATH="$SHIMS:$NDKBIN:$ANDROID_HOME/platform-tools:$PATH"
unset VITE_DEMO

VER="$(python3 -c "import json;print(json.load(open('app/src-tauri/tauri.conf.json'))['version'])")"
( cd app && npx tauri android build --apk --target aarch64 armv7 )
APK="$(find app/src-tauri/gen/android/app/build/outputs/apk -name '*release*.apk' | head -1)"
[ -n "$APK" ] || { echo "No release APK found"; exit 1; }
mkdir -p "releases/$VER"; cp "$APK" "releases/$VER/Chezzflix_${VER}_android.apk"
cp "releases/$VER/Chezzflix_${VER}_android.apk" "releases/$VER/Chezzflix.apk"   # a fixed-name copy: .../releases/latest/download/Chezzflix.apk always means "the newest"
echo "✔ releases/$VER/Chezzflix_${VER}_android.apk (+ Chezzflix.apk)"
