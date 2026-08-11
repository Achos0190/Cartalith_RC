# Toolchain setup

Everything needed before writing any Rust/Godot code. Per `DECISIONS.md` §5, this session's
cloud environment does the actual building — this document is written for that context, but
applies equally if the owner ever sets this up locally.

## Do not hardcode version numbers from this document without re-checking

This document was written in a session with a training/knowledge cutoff. Godot, `gdext`,
`cargo-ndk`, `cargo-xwin`, and the Android NDK all move. **At actual setup time, check each
tool's own current release page/docs rather than trusting a version number written here** —
this is the same discipline the root `CLAUDE.md` enforces around not trusting a stale
assumption (e.g. its own repeated `VERSION`-const-drift lesson). Where this document does
name a specific tool version, treat it as "what was current when this was written," not a
pin.

## Rust

- Install via `rustup` (not a distro package manager — need easy access to multiple
  targets).
- Add cross-compilation targets:
  ```
  rustup target add x86_64-pc-windows-msvc      # Windows (via cargo-xwin, see below)
  rustup target add aarch64-linux-android        # Android (via cargo-ndk)
  rustup target add armv7-linux-androideabi
  rustup target add x86_64-linux-android
  rustup target add i686-linux-android
  ```
  (the four Android targets cover ARM64, ARM32, x86_64, and x86 devices/emulators — a real
  Android device today is almost always `aarch64`, but include the others for emulator
  testing and broader device coverage.)
- `godot-rust`/`gdext` tracks recent stable Rust; check its own `Cargo.toml`/docs for a
  minimum-supported-Rust-version at setup time.

## Godot

- Install the **latest stable Godot 4.x** release (see `DECISIONS.md` §9 for why this
  document doesn't pin a specific patch version) from the official godotengine.org
  downloads page.
- Godot has a **headless/server build** usable for CI-style automated exports without a
  display — relevant since this session runs in a container. Confirm this works for
  triggering Windows/Android exports non-interactively before assuming the normal GUI editor
  is required for every build step.
- Download the matching **export templates** for the installed Godot version (Editor →
  Manage Export Templates, or the equivalent CLI/headless path) — required before any
  platform export will work, including Windows and Android.

## `gdext` (godot-rust)

- Add as a dependency of the `cartalith-godot` crate only (per `ARCHITECTURE.md` — no other
  crate should depend on it).
- **Verify Android export actually works early** — per `REFERENCES.md`'s flagged risk,
  `gdext`'s own docs describe Android/WASM support as experimental with "documentation and
  tooling still lacking" as of the most recent check. This is the single highest-risk item
  in the whole toolchain for THIS project's specific goal (a working `.apk`). Confirm it in
  Phase 0 (`ROADMAP.md`) before investing further.

## Android (for the `.apk`)

- **Android SDK + NDK.** The NDK is what Rust code actually compiles against; the SDK
  (plus a JDK) is what Gradle/Godot's own Android export pipeline needs to assemble the
  final `.apk`.
- **`cargo-ndk`** (see `REFERENCES.md`) — compiles the Rust `cartalith-godot`
  cdylib/staticlib for each Android target without hand-managing NDK toolchain paths.
- A JDK (for Gradle, which Godot's Android export uses under the hood).
- **No signing keystore needed yet** per `DECISIONS.md` §6 (personal/hobby distribution) —
  a debug-signed `.apk` (Godot/Gradle's default) is sufficient for the owner to sideload and
  test. Revisit if the distribution goal ever changes.

## Windows (for the `.exe`)

- Building happens in this Linux cloud session, so **cross-compilation**, not a native
  Windows build. Options, in order of how well they fit "keep this reproducible in a Linux
  container":
  1. **`cargo-xwin`** (see `REFERENCES.md`) — cross-compiles Rust to the
     `x86_64-pc-windows-msvc` target from Linux, fetching the necessary Windows
     SDK/CRT pieces itself. Check its current minimum Rust version requirement at setup
     time.
  2. `x86_64-pc-windows-gnu` + `mingw-w64` — an alternative that avoids needing MSVC-specific
     SDK files at all, at the cost of a GNU-ABI build rather than the more
     conventionally-expected MSVC one. Worth having as a fallback if `cargo-xwin` proves
     troublesome.
- Godot's own Windows export also needs its export templates (see above) and, separately
  from the Rust cross-compilation, Godot's own export pipeline needs to be told how to
  cross-export a Windows build from a Linux host — confirm this is actually supported
  smoothly (Godot has historically supported cross-exporting reasonably well, but verify
  against the actually-installed version rather than assuming).
- **Final verification still needs a real Windows machine** — building an `.exe` here only
  confirms it compiles and Godot's exporter accepted it, not that it actually runs
  correctly on Windows (`DECISIONS.md` §5).

## Save-file reading (for `cartalith-io`, see `SAVEFILE_COMPAT.md`)

- `zip` crate — reads the HTML app's `.zip` saves directly (verified to be standard ZIP,
  see `SAVEFILE_COMPAT.md`).
- `serde` + `serde_json` — parses `params.json`.

## Suggested install-order sanity check (Phase 0)

Before porting any real engine logic, confirm — in this order, so a failure is easy to
attribute to the right layer:
1. `cargo new --lib` a throwaway crate, confirm plain Rust compiles/tests in this
   environment.
2. Add `gdext`, confirm a minimal GDExtension class loads inside the Godot editor
   (headless, if possible — see the Godot section above).
3. Confirm a Windows cross-compiled build of that same minimal extension is produced and
   Godot's exporter accepts it, producing an `.exe`.
4. Confirm an Android cross-compiled build (via `cargo-ndk`) is produced and Godot's
   exporter accepts it, producing an `.apk`. **This is the step most likely to surface real
   problems** per the `gdext` Android-maturity flag above — budget real time for it, don't
   assume it'll be as smooth as step 3.
5. Only once all four steps above are confirmed: start Phase 1 (`ROADMAP.md`) — the actual
   terrain engine port.
