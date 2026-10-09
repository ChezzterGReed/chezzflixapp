fn main() {
    // The build script runs on the host, so ask Cargo which OS we're building FOR (Android builds happen on a Mac).
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        use std::path::PathBuf;

        // Native video surface (NSView + OpenGL context) that libmpv renders into.
        cc::Build::new()
            .file("src/gl.m")
            .flag("-fobjc-arc")
            .flag("-Wno-deprecated-declarations")
            .compile("chezzgl");
        println!("cargo:rerun-if-changed=src/gl.m");
        for fw in ["Cocoa", "OpenGL"] {
            println!("cargo:rustc-link-lib=framework={fw}");
        }

        // Prefer our own self-contained, universal libmpv (native-deps/). Fall back to Homebrew's for quick dev setups.
        let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
        let ours = manifest.join("../../native-deps/out/universal/lib").canonicalize().ok().filter(|p| p.join("libmpv.2.dylib").exists());
        match &ours {
            Some(dir) => {
                println!("cargo:rustc-link-search=native={}", dir.display());
                // Only dev builds look in the project folder; a release app must find libmpv inside its own bundle.
                if std::env::var("PROFILE").map(|p| p == "debug").unwrap_or(false) {
                    println!("cargo:rustc-link-arg=-Wl,-rpath,{}", dir.display());
                }
            }
            None => {
                println!("cargo:warning=native-deps/out/universal not found: linking Homebrew's libmpv (this build won't run on other Macs)");
                println!("cargo:rustc-link-search=native=/opt/homebrew/lib");
            }
        }
        println!("cargo:rustc-link-lib=dylib=mpv");
        // (Tauri adds @executable_path/../Frameworks itself when bundling the framework.)
        println!("cargo:rerun-if-changed=../../native-deps/out/universal/lib/libmpv.2.dylib");
    }
    // The two Android (Kotlin) plugins are part of this app, so their commands are declared here for the permission system.
    let kotlin = || tauri_build::InlinedPlugin::new()
        .commands(&["call", "register_listener", "remove_listener"])
        .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands);
    tauri_build::try_build(tauri_build::Attributes::new().plugin("player", kotlin()).plugin("appupdate", kotlin())).expect("failed to run tauri-build");
}
