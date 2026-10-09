# native-deps — Chezzflix's built-in player engine

Chezzflix plays video with **libmpv**. This folder builds it from source as a **single, self-contained, universal
(Apple Silicon + Intel) dylib** that depends only on macOS system libraries, so the packaged app runs on any Mac
(macOS 11+) with nothing else installed.

Everything is built **static** into `libmpv.2.dylib`: FFmpeg, libplacebo, libass, FreeType, HarfBuzz, FriBidi, dav1d,
OpenSSL. It is an **LGPL-only** build (no GPL or non-free components), which is what makes it legal to ship.
Versions are pinned in `versions.env`.

## Build

Needs Xcode Command Line Tools and `brew install meson ninja nasm pkgconf`.

```bash
cd native-deps
./scripts/fetch.sh              # download sources into work/ (~600 MB)
./scripts/build.sh arm64        # Apple Silicon  -> out/arm64
./scripts/build.sh x86_64       # Intel (cross-compiled) -> out/x86_64
./scripts/universal.sh          # merge -> out/universal/lib/libmpv.2.dylib, collect licenses/
```

Both archs can build at the same time. Builds are resumable (finished stages are skipped); delete `out/<arch>/.stamp-<name>`
to redo one library. Logs are in `work/logs/`.

## How the app uses it

- `app/src-tauri/build.rs` links `out/universal/lib/libmpv.2.dylib` (falls back to Homebrew's for quick dev setups).
- `tauri.conf.json` copies it into `Chezzflix.app/Contents/Frameworks/` and ships `licenses/` as app resources.
- `app/src-tauri/src/native.rs` + `gl.m` render frames into a native OpenGL view behind the transparent web UI.

## Notes

- **Command Line Tools quirk:** some installs keep a partial copy of the libc++ headers in the toolchain folder, which
  breaks any C++ compile (`'cassert' file not found`). `build.sh` works around it by pointing C++ at the SDK's headers.
- **Licensing:** if you distribute the app, include `licenses/` (done automatically by the bundle config) and keep this
  folder available — it is the recipe for rebuilding or replacing the library, which the LGPL asks for.
- **Updating mpv/FFmpeg:** change the version in `versions.env`, delete `work/src/<name>` and `out/*`, rebuild.
