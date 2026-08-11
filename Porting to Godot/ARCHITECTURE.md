# Architecture

## The core split

Rust owns **all engine state and logic**. Godot owns **rendering, UI, input, and platform
packaging**. This mirrors the existing HTML app's own separation between its engine script
block and its app-shell/UI script blocks (see the root `CLAUDE.md`) — that separation
already exists conceptually in the JS code, this port makes it a hard architectural boundary
instead of a soft convention.

Concretely:

- Rust exposes a small number of **GDExtension classes** via `gdext` (e.g. a `WorldGen`
  class with methods like `generate(seed, width_km, resolution) -> ()`,
  `get_height_texture() -> PackedFloat32Array` or similar, `get_biome_texture() -> ...`).
  Godot's GDScript (or a thin Rust-side glue node) calls into these, receives back either
  raw arrays or ready-made `Image`/`ImageTexture` objects, and does the actual drawing.
- Godot never re-implements generation logic. If Godot-side code is computing anything
  beyond "how do I display/lay out what Rust gave me," that logic belongs in Rust instead.
- Rust never touches Godot's scene tree, node lifecycle, or input directly. If a
  Rust-side struct wants to react to something in Godot, the direction of communication
  should be Godot calling into Rust, not the reverse — keeps the engine testable as plain
  Rust with `cargo test`, independent of Godot ever running.

## Why this split, not something looser

Two failure modes this avoids:
1. Logic creeping into GDScript "because it was quick" — this quietly re-introduces the
   exact "several functions/places answering the same question and drifting apart" problem
   the HTML project's own `CHANGELOG.md` documents hitting *repeatedly* (its own words: "the
   umpteenth instance of this file's own recurring lesson"). One engine, one source of
   truth, in Rust.
2. Engine code depending on Godot types (`Vector2`, `Color`, etc.) — this would make the
   engine untestable without booting Godot, and would block ever reusing the engine core for
   a WASM/browser build later (see `DECISIONS.md` §2's WASM point). Engine-facing structs use
   plain Rust types (`f32`, `[f32; N]`/`Vec<f32>`, or `ndarray` if that ends up being the
   array library of choice); the `gdext`-facing boundary layer converts to/from Godot types
   at the edge, not in the middle of the engine.

## Proposed crate layout: one crate per subsystem, not one crate with modules

A **Cargo workspace** of many small crates, mirroring the HTML app's own 4-script-block
separation but made into real, independently-compilable, independently-testable units — this
is the direct answer to "how do we keep this modular." The dependency graph should read the
same top-to-bottom order as the JS engine's own pipeline (root `CLAUDE.md`'s "Pipeline"
paragraph), so a crate only ever depends on the ones before it, never sideways or backward:

```
cartalith-native/                       (workspace root, new repository)
├── Cargo.toml                          (workspace manifest — [workspace] members = [...])
├── crates/
│   ├── cartalith-noise/                (foundational, zero internal deps: hash()/vnoise()/
│   │                                     fbm()/ridged() — the exact JS primitives, bit-for-
│   │                                     bit ported, NOT swapped for noise-rs — see below)
│   ├── cartalith-rng/                  (mulberry32, ported exactly — see PARITY_TESTING.md)
│   ├── cartalith-terrain/              (tectonics → height formula → normalize → volcanism/
│   │                                     craters → world-structure archetypes; depends on
│   │                                     cartalith-noise + cartalith-rng)
│   ├── cartalith-climate/              (temperature, wind, rainfall; depends on
│   │                                     cartalith-terrain for elevation/coastline input)
│   ├── cartalith-erosion/              (droplet/stream-power/thermal kernels; depends on
│   │                                     cartalith-terrain + cartalith-climate)
│   ├── cartalith-hydrology/            (flow accumulation, river network, real-km-aware
│   │                                     channel width; depends on cartalith-erosion)
│   ├── cartalith-engine/               (the ORCHESTRATOR — owns the `WorldState` struct,
│   │                                     runs the full pipeline in order by calling into
│   │                                     the crates above, is the ONE public API surface
│   │                                     everything else depends on. No generation logic
│   │                                     of its own — see the "orchestrator, not another
│   │                                     god object" note below)
│   ├── cartalith-io/                   (save/load; reads the HTML app's .zip format —
│   │                                     see SAVEFILE_COMPAT.md; depends on cartalith-engine
│   │                                     for the WorldState shape it deserializes into)
│   └── cartalith-godot/                (the gdext boundary layer — the ONLY crate allowed
│                                         to depend on godot-rust; depends on
│                                         cartalith-engine + cartalith-io; thin, converts
│                                         types, exposes GDExtension classes)
├── godot-project/                      (the actual Godot project: scenes, GDScript glue,
│   ├── project.godot                     export presets — consumes cartalith-godot's .gdextension)
│   ├── scenes/
│   └── ...
└── docs/
    ├── CHANGELOG.md                    (this project's own version-by-version log, same
    │                                     discipline as Cartalith_RC's CHANGELOG.md)
    └── HANDOFF.md                      (same role as Cartalith_RC's docs/HANDOFF.md — a
                                          fresh-session orientation doc, kept current)
```

**Why `cartalith-noise` hand-ports `hash()`/`vnoise()`/`fbm()`/`ridged()` instead of using
the well-known `noise-rs` crate** (see `REFERENCES.md`): `noise-rs` is a real, actively
maintained, well-regarded Rust noise library and would be the obvious default choice for a
project NOT bound by golden-value parity. But it implements different lattice-gradient/hash
functions than the JS engine's own hand-rolled `hash(xi,yi,s)`, so its output would never
numerically match the existing engine's terrain at the same seed — the entire point of
`PARITY_TESTING.md`'s discipline. Hand-port the exact existing primitives for
`cartalith-noise`; `noise-rs` remains a reasonable option for later, non-parity-critical
decorative effects (see `ROADMAP.md`) where matching the JS engine bit-for-bit isn't the
goal.

**What "modular" buys, concretely:**
- Each crate has its own `cargo test` and can be reasoned about, ported, and golden-parity
  verified in isolation (see `PARITY_TESTING.md`'s "one stage at a time" test structure —
  this crate split is what makes that natural instead of forced).
- Adding a later subsystem (civ/politics, urban morphology, asset library — see
  `ROADMAP.md`) means adding a NEW crate (`cartalith-civ`, `cartalith-urban`,
  `cartalith-assets`) that depends on `cartalith-engine`'s public types, without ever
  touching the terrain/climate/erosion/hydrology crates. This is the actual mechanism that
  prevents the "two functions answering one question, and they drift" failure mode the
  existing HTML project's own `CHANGELOG.md` documents hitting repeatedly (v1.30 settlement
  suitability, v1.32 coastal tests, v1.34 food logistics, v1.95's whole 7-instance sweep) —
  a hard crate boundary makes it much harder to accidentally write a second, slightly
  different copy of logic that already lives one crate over, because you'd have to
  explicitly add a dependency and import it, not just "helpfully" duplicate it inline.
- `cartalith-godot` is the ONLY crate that knows Godot exists. Every other crate — including
  `cartalith-engine`, the orchestrator — builds and tests as plain Rust with zero Godot
  installed, which is also what makes a future WASM/browser target (`DECISIONS.md` §2)
  realistic later: swap `cartalith-godot` for a `cartalith-wasm` crate, same
  `cartalith-engine` underneath, no engine code touched.
- `cartalith-io` (save/load) is its own crate specifically so file-format concerns (ZIP
  parsing, JSON parsing, the HTML format's historical compat shims — see
  `SAVEFILE_COMPAT.md`) never leak into the actual generation logic, the same
  separation-of-concerns reason the JS engine itself keeps `exportZip()`/`loadZip()`
  logically distinct from `generate()` despite living in the same file.

**`cartalith-engine` is an orchestrator, not another god object.** Its job is: own the
`WorldState` struct (the Rust equivalent of the JS `state` + `field`/`tempField`/etc.
globals), and call the pipeline stages in the right order with the right data threaded
between them. It should NOT contain generation formulas itself — if you're about to write a
height-formula tweak inside `cartalith-engine`, that logic belongs in `cartalith-terrain`
instead. This mirrors this project's own repeatedly-learned lesson about keeping "one
function, one job" rather than letting a coordinating layer accumulate logic that belongs
elsewhere.

This is a **proposal**, not a commitment made in stone before a line of code exists — refine
it once the walking skeleton (Phase 0, see `ROADMAP.md`) is actually being built and real
friction points show up (e.g. climate and erosion may turn out to need a tighter iteration
loop between them than a clean one-way dependency allows — the JS engine's own
`evolveCoupled()` function, per the root `CLAUDE.md`, exists specifically because
climate↔erosion coupling is a real two-way relationship, not two independent stages; read
that function before assuming the crate split above is perfectly one-directional in
practice). But start from this shape rather than inventing a new one per subsystem, and
don't collapse it back into one monolithic crate for convenience — that's the exact thing
this structure is meant to prevent.

## Data flow for generation

1. Godot UI collects parameters (seed, resolution, map-width-km) and calls
   `WorldGen.generate(...)` on the Rust side.
2. Rust runs the full pipeline (see `MVP_SCOPE.md`) synchronously or on a background thread
   (erosion is the expensive stage — likely wants to run off the main/render thread so the
   UI doesn't freeze, using Godot's own threading primitives or a Rust `std::thread` +
   a completion signal back to Godot). The JS engine's own invariant — **`generate()`
   completes deterministically and the caller can rely on that** — should have a clear Rust
   equivalent decided explicitly when this is built, not left implicit.
3. On completion, Rust hands back the generated fields (height, temperature, rainfall,
   biome classification, flow/river data) as flat arrays or pre-built `Image`s.
4. Godot converts to `ImageTexture`s and draws them (a full-screen quad / `TextureRect` /
   `Sprite2D` is enough for MVP — no LOD tiling needed, see `MVP_SCOPE.md`).

## Threading model for erosion

The JS engine dispatches erosion (droplet/stream-power kernels) to Web Workers for
parallelism, with a synchronous CPU fallback (see the root `CLAUDE.md` invariant 11 — the
worker kernels are deliberately self-contained, no closure over module globals, so they can
be `toString()`'d into a blob-URL worker). Rust's natural equivalent is **`rayon`** for
data-parallel per-cell/per-droplet work, which avoids needing to hand-roll a worker-pool
abstraction at all. Decide explicitly, when this stage is ported, whether droplet erosion
parallelizes per-droplet (many independent short-lived simulations, likely `rayon`-friendly)
or needs a different decomposition (droplets mutate a shared height array as they carve,
which is a genuine data race across droplets unless carefully bucketed/serialized — read how
the JS `dropletKernel` actually handles this and don't assume it parallelizes trivially).

## What this document deliberately does not decide yet

- The exact array/math library (`ndarray` vs. plain `Vec<f32>` + manual indexing vs.
  something else) — pick this when actually writing `cartalith-engine`, informed by real
  ergonomics, not decided speculatively here.
- Exact GDExtension API surface (method names, exact types crossing the boundary) — design
  this against the real needs of Phase 0/Phase 1 (`ROADMAP.md`), not upfront.
- Windows cross-compilation toolchain specifics (`cargo-xwin` vs. building on real Windows)
  — see `TOOLCHAIN.md`.
