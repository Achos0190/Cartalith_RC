# Reference libraries and projects

Researched via live web search (not from possibly-stale training knowledge — this project's
own discipline is to measure/verify rather than assume, applied here to "what's actually
current and maintained" too). Re-verify currency/maintenance status again before actually
adding any of these as a dependency — this list is a starting point for evaluation, not a
pre-approved dependency list.

## Godot ↔ Rust binding

- **[`godot-rust/gdext`](https://github.com/godot-rust/gdext)** — the GDExtension binding
  for Godot 4, already decided in `DECISIONS.md` §3. As of the most recent check, it's in
  active, usable development (recent updates cited: Godot 4.6 API-level support, Rust
  Edition 2024, WebAssembly improvements). **Platform support caveat, explicitly flagged by
  the project itself: Android and WebAssembly support is described as "experimental," with
  "documentation and tooling still lacking."** Given this port's whole point is an Android
  `.apk`, this is the single most important thing to de-risk in Phase 0 (`ROADMAP.md`) —
  confirm `gdext` actually produces a working Android export BEFORE committing further, not
  after the terrain engine is already ported. If `gdext`'s Android story turns out to be too
  rough, the fallback options are: (a) write the Android-facing boundary in C++ instead of
  Rust for just that platform (unattractive — reintroduces a second language at the exact
  boundary this architecture tries to keep thin), or (b) reconsider Godot entirely for
  Android specifically. Surface this risk to the owner explicitly if it materializes — don't
  silently work around it.
  ([godot-rust book](https://godot-rust.github.io/book/), [docs.rs/godot](https://docs.rs/godot))

## Noise / procedural generation

- **[`noise-rs` (crate `noise`)](https://github.com/Razaekel/noise-rs)** — the standard,
  actively maintained Rust procedural noise library (Perlin/Simplex/Worley/fBm/ridged
  multifractal, combinators). **Not used for `cartalith-noise`** per `ARCHITECTURE.md`'s
  explanation (golden-parity requires the exact existing hash/lattice functions, not a
  different noise implementation) — but a real candidate for later, non-parity-critical
  decorative rendering effects post-MVP.
- An older crate, `noisy`, showed up in the same search and is explicitly **not
  maintained** — noise-rs is what its own maintainers point people to instead. Don't use it.

## Save/load (for `cartalith-io`, see `SAVEFILE_COMPAT.md`)

- **[`zip` crate](https://docs.rs/zip)** — reads/writes ZIP archives, DEFLATE support
  built in (DEFLATE is what the HTML app's own `exportZip()` uses as of its own v1.90
  compression work — see the root `CHANGELOG.md`). This is the natural choice for parsing
  the HTML app's `.zip` save files in `cartalith-io`.
- **`serde` + `serde_json`** — for parsing the save format's `params.json` (the HTML app's
  `serializeState()` output). Standard, no real alternative worth considering.

## Cross-compilation tooling

- **[`cargo-ndk`](https://github.com/bbqsrc/cargo-ndk)** — compiles Rust for Android via
  the NDK "without hassle." Add the Android targets via `rustup target add
  aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android`
  first. See `TOOLCHAIN.md`.
- **`cargo-xwin`** — cross-compiles Rust to Windows MSVC targets from a non-Windows host
  (relevant since this port's building happens in a Linux cloud session per `DECISIONS.md`
  §5). Confirm current minimum Rust version requirements against its own docs at setup
  time, not against whatever this document says, since tool version requirements move.

## Godot terrain plugins (relevant to the later 3D phase, NOT the 2D MVP)

Both are **C++ GDExtension terrain systems for Godot 4** aimed at real-time 3D heightmap
terrain rendering with texture painting, sculpting, and LOD — i.e. exactly the kind of thing
the JS engine's own 3D drape view (`view3d`) does, and exactly what `ROADMAP.md`'s later 3D
phase would need to either use or take inspiration from:

- **[`TokisanGames/Terrain3D`](https://github.com/TokisanGames/Terrain3D)** — described as
  a high-performance, editable terrain system, GPU-driven clipmap mesh terrain, terrains
  from 64×64m up to 65.5×65.5km, up to 32 textures, up to 10 LOD levels, heightmap import
  support. The more actively promoted/current-looking of the two found. Worth a real
  evaluation pass when the 3D phase is actually being planned — either as a dependency
  (if its heightmap-import path can consume this project's own generated height data
  directly) or purely as a reference for how a Godot-4-idiomatic clipmap terrain renderer
  is structured.
- **[`Zylann/godot_heightmap_plugin`](https://github.com/Zylann/godot_heightmap_plugin)** —
  an older, GDScript-based heightmap terrain plugin (texture painting, colouring, holes,
  LOD, grass). Simpler, GDScript rather than a native extension — potentially lower
  performance ceiling but also lower integration risk than a C++ GDExtension if that
  matters when it's actually evaluated.

**Do not evaluate these now** — they're 3D-phase concerns and pulling them into the
terrain-only MVP would violate `MVP_SCOPE.md`'s explicit exclusion of the 3D view. Listed
here so the later phase doesn't have to re-discover them from scratch.

## Hydraulic erosion — reference implementations, NOT a dependency

Several open-source droplet-based hydraulic erosion projects turned up in research
(`csaddison/Hydraulic-Erosion-Sim`, `guydols/HydraulicErosion`, `weigert/SimpleErosion`,
among others) — these are useful as **cross-reference reading** to sanity-check an
understanding of the droplet-erosion technique (inertia/capacity/deposit/erode/evaporate
parameters — the same vocabulary the existing JS engine's own `erosion` state block already
uses, per this repo's own generation-info dumps) while porting `cartalith-erosion`. **Do
not port from any of these** — per `PARITY_TESTING.md`, the actual source of truth is the
existing JS `dropletKernel`/`streamPowerKernel` implementation in `Cartalith Gen1 v*.html`
itself, which has its own specific tuning (accumulated over many owner-verified versions —
see the root `CHANGELOG.md`'s erosion-related entries, e.g. v1.87/v1.89's `MinHeap`
optimization work) that a generic reference implementation won't reproduce. Read these only
to build intuition for *why* the existing algorithm's parameters behave the way they do, not
as a source to copy formulas from.

## Explicitly not adopted, and why

- **`bevy`** — a full Rust game engine, considered and rejected as the primary framework in
  `DECISIONS.md` §3 in favor of Godot. Its crate ecosystem (some noise/procedural-generation
  crates originated for Bevy specifically) may still contain useful reference code, but
  nothing found in this research pass looked like a clear win worth pulling in given Godot
  is the chosen shell.
- **Wrapping the existing HTML app (Tauri/Electron/Capacitor)** — rejected in
  `DECISIONS.md` §1. Not re-litigated here.
