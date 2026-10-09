# Third-party software in Chezzflix's built-in player

Chezzflix plays video with **libmpv**, built from source as an LGPL-only library (no GPL components), with these
statically linked libraries:

| Component | Version | License |
|---|---|---|
| mpv (libmpv) | 0.41.0 | LGPL-2.1-or-later |
| FFmpeg | 9.0.2 | LGPL-3.0-or-later (built with --enable-version3, no GPL/nonfree parts) |
| libplacebo | v7.360.1 | LGPL-2.1-or-later |
| libass | 0.17.4 | ISC |
| FreeType | 2.14.1 | FreeType License (FTL) |
| HarfBuzz | 11.5.0 | MIT |
| FriBidi | 1.0.16 | LGPL-2.1-or-later |
| dav1d | 1.5.1 | BSD-2-Clause |
| OpenSSL | 3.5.2 | Apache-2.0 |

Source code for each component is available from its upstream project at the version above. The exact build
recipe (flags, versions) is in `native-deps/scripts/build.sh`, so the library can be rebuilt or replaced.
