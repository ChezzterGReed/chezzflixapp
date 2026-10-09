# Building and sharing Chezzflix on macOS

## Build the app (universal: Apple Silicon + Intel)

One-time: build the player engine (see `native-deps/README.md`):

```bash
cd native-deps && ./scripts/fetch.sh && ./scripts/build.sh arm64 && ./scripts/build.sh x86_64 && ./scripts/universal.sh
```

Then:

```bash
cd app
source ~/.cargo/env
MACOSX_DEPLOYMENT_TARGET=11.0 npx tauri build --target universal-apple-darwin
```

Output (`app/src-tauri/target/universal-apple-darwin/release/bundle/`):
- `macos/Chezzflix.app` — the app
- `dmg/Chezzflix_0.1.0_universal.dmg` — the installer (a copy is kept in `releases/`)

The app is fully self-contained (player engine inside `Contents/Frameworks`) and runs on macOS 11 or later.

## What recipients will see

The app is **ad-hoc signed** (`signingIdentity: "-"`): the bundle is intact and verifiable, but not tied to an Apple
developer identity and not notarized. On another Mac, macOS Gatekeeper will say the app "can't be opened because Apple
cannot check it for malicious software". Recipients can still open it:

- **Right-click the app → Open → Open** (first launch only), or
- Terminal: `xattr -dr com.apple.quarantine /Applications/Chezzflix.app`

## Making it open with a double-click (no warning)

Needs a paid Apple Developer Program membership ($99/year):

1. Create a **Developer ID Application** certificate in your Apple developer account and install it in Keychain.
2. Set in `app/src-tauri/tauri.conf.json` → `bundle.macOS.signingIdentity` to its name, e.g.
   `"Developer ID Application: Your Name (TEAMID)"` (replace the current `"-"`).
3. Export these before `tauri build` so Tauri notarizes automatically:
   `APPLE_ID`, `APPLE_PASSWORD` (an app-specific password), `APPLE_TEAM_ID`.

## Licensing

The player engine is an LGPL-only build; license notices ship inside the app (`Contents/Resources/licenses`). Keep
`native-deps/` available — it is the rebuild recipe. This is not legal advice.

## Not covered yet

- Windows and Android builds (they use the browser-style player until native engines are added).
- Auto-update (Tauri's updater plugin + a hosted release feed).
- A custom app icon (currently Tauri's default).
