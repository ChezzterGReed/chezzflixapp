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

## Android / Android TV

Build a signed APK (64-bit + 32-bit ARM) with `scripts/release-android.sh` → `releases/<version>/Chezzflix_<version>_android.apk`.
Needs JDK 17, the Android SDK + NDK 27 (see the script header) and the signing key `~/.tauri/chezzflix-android.jks`
(password in `~/.tauri/chezzflix-android.pw`; `gen/android/keystore.properties` points at them and is git-ignored).
**Back that key up**: Android only installs an update over an app signed with the same key.

Sideload on a device (Shield, Onn, Fire TV, phones):
1. Turn on developer options + ADB debugging (Fire TV: Settings → My Fire TV → Developer options, also allow Apps from Unknown Sources).
2. `adb connect <device-ip>:5555` (approve the prompt on the TV once), then `adb install -r Chezzflix_<version>_android.apk`.
   (Or host the APK and use the "Downloader" app on the TV.)

Testing without a TV: `avdmanager create avd -n chezz_tv -k "system-images;android-36;android-tv;arm64-v8a" -d tv_1080p`, run the emulator,
and build with `VITE_DEMO=1 npx tauri android build --debug --target aarch64 --apk` for a demo-mode app (no Plex account needed).

## Beta channel (testing before it goes live)

Two branches: **`main`** is what is live; **`beta`** is where new work is tried first.

1. Work and commit on the `beta` branch (`git checkout beta`).
2. Bump the version as usual (it is just the next number; betas need no special suffix), then `scripts/publish.sh --beta "Name" "Details"`.
   It builds Mac and Android and publishes a GitHub **pre-release**. Live users never see it.
3. Devices set to **Settings → About → Update channel → Beta** are offered it. The first time, a device has to get a beta-capable build
   by hand (Mac: the .dmg on the release page; Android: the APK link on the release page, or the Downloader app with that address).
   After that it updates itself, beta or live, whichever is further ahead.
4. When the beta has been tested: `scripts/promote.sh <version>` turns that **same build** into the live release (no rebuild), then
   `git checkout main && git merge beta && git push` to keep the branches in step.

`scripts/publish.sh` without `--beta` refuses to run anywhere but `main`, so untested work cannot go live by accident.
