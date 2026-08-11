# Decision log

Every major choice behind this port, in the order they were made, with the reasoning and
what was explicitly rejected. If a later session wants to revisit one of these, read the
"why" here first — most of these were narrowed from a real set of alternatives, not picked
by default.

## 1. Native rewrite, not a wrapped web app

**Considered**: wrapping the existing `Cartalith Gen1 v*.html` file with Tauri/Electron
(desktop) and Capacitor or a Trusted Web Activity (Android) — near-zero porting cost, reuses
100% of the existing, extensively-tested JS engine.

**Decided**: a genuine native rewrite (Rust engine + Godot shell).

**Why**: the owner's explicit goal is "performance and crossplatform compatibility," not
"an installable icon for the existing tool." A wrapped web app is still running the same
Canvas2D/WebGL JS engine inside a system webview or bundled Chromium — it gets you a
double-clickable icon, not meaningfully different performance, and Android WebView
GPU/touch behavior is a known source of quirks the existing project already has to work
around (see the HTML project's own `CLAUDE.md` mobile-viewport and touch-handling history).
If the goal were purely "ship an exe/apk fast," the wrapper path would be the right call —
it is objectively lower risk and dramatically less work. It was correctly named as an
option and rejected on stated goals, not on merit.

## 2. Rust over C/C++ for the engine

**Considered**: C or C++ for the engine core — Godot's own native extension API
(GDExtension) was originally designed for C++, giving it arguably the most frictionless
integration path.

**Decided**: Rust.

**Why**: raw performance is a wash — both compile to native code via LLVM/similar backends,
neither has an inherent speed advantage over a competently-written implementation in the
other. The deciding factors:
- **Memory safety for buffer-heavy code.** This engine's whole job is manipulating large
  flat arrays (heightmaps, temperature/rainfall/flow fields, LOD tile pyramids) across many
  sequential passes — exactly the code shape where C/C++ produces silent
  out-of-bounds/use-after-free/aliasing bugs. The existing JS project's own `CHANGELOG.md`
  has repeatedly hit this EXACT bug class (edge-clamping errors, off-by-one indexing,
  wraparound bugs at the antimeridian, NaN propagation) and had to catch it via extensive
  runtime testing because JS gives no compile-time guarantee. Rust's borrow checker and
  bounds-checked-by-default slices catch a meaningful fraction of that class at compile time
  or via a panic at the exact faulty line, not a silent wrong answer three passes later.
- **One toolchain, three targets.** `cargo` cross-compiles cleanly to Windows, to Android
  (via `cargo-ndk`), and to WebAssembly (`wasm-bindgen`/`wasm-pack`, the best WASM story of
  any systems language) — meaning a future browser build could share the exact same engine
  core with zero duplicated logic. C/C++ can also target WASM (Emscripten) but the tooling
  is generally considered clunkier and less unified than Rust's.
- **Mature Godot bindings.** `gdext` (godot-rust) is an actively maintained GDExtension
  binding for Godot 4, giving Rust first-class access to Godot's node/scene system without
  needing to hand-write a C ABI bridge.

**Acknowledged tradeoff**: the borrow checker actively fights the pattern this generator
leans on heavily — many passes mutating large shared arrays in place (erosion, flow
accumulation, iterative climate relaxation). Expect porting these passes to take real
up-front thought about ownership (arena patterns, `&mut [f32]` slices passed through
functions rather than shared mutable state, `rayon` for the passes that were Web Workers)
rather than a mechanical translation. This is a one-time cost paid during the port, not an
ongoing tax.

## 3. Godot + Rust via `gdext`, not Rust-only

**Considered**: a pure-Rust stack with no game engine (e.g. `bevy`, or bare
`wgpu`+`winit`) — full control, lighter dependency footprint, no GDScript/Godot-specific
concepts to learn.

**Decided**: Godot, with Rust as the engine core via `gdext`.

**Why**: Godot already solves — for free — the parts of this problem that are NOT this
project's differentiator: windowing, input handling (including touch, which the existing
JS project has substantial documented history fighting with on mobile), a scene/UI system,
and — critically — **one-click export pipelines for both Windows and Android**, including
handling the Android NDK/Gradle/signing plumbing that would otherwise need to be built by
hand with a pure-Rust stack. The engine's actual value (procedural generation, simulation)
is exactly what moves into Rust via `gdext`; Godot is the shell, matching this project's own
existing architectural instinct (the HTML app already separates "engine" from "app
shell/UI" as its own first script block vs. the rest — see the root `CLAUDE.md`'s
"Merged-file architecture" section).

## 4. 2D only for v1

**Considered**: porting both the 2D map view and the existing app's optional 3D
terrain-drape view together, to avoid a second rendering-architecture pass later.

**Decided**: 2D only for the terrain MVP; 3D is a later, separate phase.

**Why**: 3D introduces a second full rendering pipeline (mesh generation from the
heightmap, camera controls, lighting) on top of an already large scope (a working
procedural-generation engine, ported and verified). Cutting it from v1 keeps the first
milestone honestly achievable and testable. See `ROADMAP.md` for where it re-enters.

## 5. This cloud session does the coding and builds

**Considered**: doing the work on the owner's local PC via Claude Code CLI (matching the
owner's own initial phrasing, "using a PC to work on"); a hybrid split.

**Decided**: the cloud session writes the Rust/Godot code and produces cross-compiled
builds (Windows via cross-compilation tooling, Android via the NDK) directly.

**Why**: Godot can cross-export to both Windows and Android from a Linux environment
given the right SDKs/export templates installed — a real Windows or macOS machine is not a
hard requirement for *building*. What a cloud container genuinely cannot do is **final
on-device verification**: actually running the `.exe` on Windows, actually installing and
touch-testing the `.apk` on an Android device, confirming real GPU rendering behavior. That
split — build here, verify on real hardware — mirrors the exact carve-out the existing HTML
project's `CLAUDE.md` already documents for WebGL/Worker/canvas/touch interaction ("flagged
for manual browser verification"). Every port milestone in this effort should be equally
explicit about what was verified headlessly vs. what still needs the owner's own hardware.

## 6. Personal/hobby distribution bar

**Considered**: aiming at Play Store / Steam-style store distribution from early on.

**Decided**: personal/hobby tool for now — builds the owner runs themselves (a plain
`.exe`, a sideloaded `.apk`). No code-signing certificates, no store listings, no store
policy compliance work as near-term scope.

**Why**: keeps early milestones focused on the engine port itself rather than distribution
logistics that only matter once there's something worth distributing. This can change later
without architectural cost — nothing about targeting a store retroactively invalidates the
engine work.

## 7. Golden-value parity testing

**Considered**: testing the Rust port on its own terms (unit tests, visual sanity checks)
without requiring it to numerically match the existing JS engine.

**Decided**: golden-value parity — extract known-good output from the JS engine at fixed
seeds (the same kind of data `tests/perf/hash_gen1.js` already produces for the HTML
project's own bit-identity discipline) and require the Rust port to reproduce it within a
defined numerical tolerance.

**Why**: the JS engine represents ~200+ versions of accumulated, owner-verified correctness
— hundreds of measured, disclosed fixes to things like scale-invariant terrain detail,
river network formation, climate coupling, and settlement placement. Re-deriving all of that
"from vibes" in a fresh rewrite would silently discard a huge amount of hard-won correctness.
Golden-value parity turns the existing engine into ground truth the port can be mechanically
checked against, the same way this project already treats its own hash-identity discipline
as non-negotiable. See `PARITY_TESTING.md` for exactly how this works and why exact
bit-identity (the HTML project's own JS-to-JS standard) is not realistic cross-language, and
what tolerance is used instead.

## 8. Documentation here, code in a new repository

**Considered**: keeping the Rust/Godot project source in this same repository (either at
the root or inside this "Porting to Godot" folder), so docs and code share one history.

**Decided**: this folder stays documentation-only. The Rust/Godot project gets its own new
repository once porting actually begins.

**Why**: `Cartalith_RC` has its own strict, unrelated conventions (single HTML file,
version-per-file, a specific test/hash discipline tied to that file) that a Rust/Cargo/Godot
project structure doesn't fit and shouldn't be forced into. A clean new repository avoids
tooling conflicts (`.gitignore` scope, CI assumptions, README/CLAUDE.md ownership) and keeps
each project's own conventions legible on their own terms. This document set is written so
it can be copied wholesale into that new repository as its seed documentation once it
exists — nothing here is written to depend on staying inside `Cartalith_RC`.

## 9. Godot version: latest stable at setup time, not a hardcoded pin here

**Decided**: whoever actually sets up the new repository should install and pin the
**latest stable Godot 4.x release available at that moment**, and record the exact version
number in that new repository's own toolchain documentation.

**Why**: this document was written in a session with a knowledge cutoff; hardcoding a
specific Godot patch version here risks it being stale — possibly missing bugfixes, possibly
referencing a version that's no longer the recommended default — by the time this plan is
actually executed. This is the same discipline the HTML project's own `CLAUDE.md` enforces
around not trusting a stale assumption without re-measuring (e.g. the repeated `VERSION`
const drift lesson, or re-verifying a "current" resolution/scenario before trusting it). See
`TOOLCHAIN.md` for how to check.
