# Porting Cartalith to Godot — start here

**Read this first if you are picking up this effort.** This folder is currently
**documentation only** — no Rust or Godot project lives here yet. It exists to capture the
scope, architecture, and working discipline for a ground-up native port of Cartalith Gen1
(the single-file HTML worldbuilding tool, see the repo root `CLAUDE.md`) to a Rust engine
core inside Godot, targeting a Windows `.exe` and an Android `.apk`.

This is a **new project**, not a refactor of the existing HTML file. Nothing in
`Cartalith Gen1 v*.html` changes as a result of this effort, and this folder's docs do not
modify that project's own working rules — they exist alongside it.

**Also in this folder**: a frozen reference copy of the HTML app
(`reference/Cartalith Gen1 v2.10.html`) with a generated function index
(`reference/FUNCTION_INDEX.md`, 1094 top-level functions across all 4 script blocks), and a
`skills/` folder with Claude Code skills for this effort — see `SKILLS.md` and the
"What's in this folder" table in this directory's own `CLAUDE.md`.

## Why this exists

The owner wants Cartalith to run as dedicated, performant, cross-platform native
applications (Windows + Android) rather than a browser tool. Wrapping the existing
JS/Canvas/WebGL app (Tauri/Electron + Capacitor) was considered and rejected in favor of a
genuine rewrite, because the owner's stated goal is **performance and cross-platform
compatibility**, not merely "a native-feeling shell around the same code." See
`DECISIONS.md` for the full reasoning trail.

## The decisions that shape everything else

Made via a structured Q&A with the owner (2026 session). Full rationale for each lives in
`DECISIONS.md` — read that before second-guessing any of these:

| Question | Decision |
|---|---|
| First milestone scope | **Terrain-only MVP** — full procedural pipeline, no civ/UI/asset-library/sculpt/journey-planner |
| MVP terrain boundary | **Full pipeline including erosion + hydrology/rivers** — not just heightmap+climate |
| Engine architecture | **Godot + Rust via `gdext`** — Rust owns engine logic, Godot owns rendering/UI/platform export |
| Rendering scope (v1) | **2D only** — the current app's optional 3D terrain-drape view is a later phase |
| Dev/build environment | **Claude Code's cloud session does the work** — owner handles final on-device verification (real Windows run, real Android install) |
| Distribution bar | **Personal/hobby tool** — no store listings, no signing certs, no store-policy work for now |
| Correctness strategy | **Golden-value parity against the JS engine** — the Rust port must reproduce the existing engine's numeric output (within a documented tolerance), not just "look right" |
| Code location | **This folder stays documentation-only.** The actual Rust/Godot project source will live in a **new, separate repository** once porting begins — not in `Cartalith_RC` |
| Godot version | Pin to the **latest stable Godot 4.x** available at setup time (see `TOOLCHAIN.md` — do not hardcode a version number from this document without re-checking) |
| Roadmap | This folder also sketches a rough **post-MVP roadmap** (civ layer, 3D view, asset library, sculpt editor, journey planner) at a high level — see `ROADMAP.md` |
| Savefile compatibility | The port must be able to **read an existing HTML-app `.zip` save's terrain data** (not write one yet) — see `SAVEFILE_COMPAT.md` |
| Build structure | A Cargo **workspace of one crate per subsystem** (noise, RNG, terrain, climate, erosion, hydrology, an orchestrator, save/load, the Godot boundary) — see `ARCHITECTURE.md` |

## Reading order

1. **`DECISIONS.md`** — every major choice, why it was made, and what was rejected. Read
   this before proposing to change any of the table above.
2. **`MVP_SCOPE.md`** — the precise, line-by-line-mapped definition of what the terrain-only
   MVP includes and excludes, plus concrete "done" criteria.
3. **`ARCHITECTURE.md`** — the Rust↔Godot split, the per-subsystem crate layout that keeps
   the project modular, data-flow model, and how this maps onto the existing JS engine's own
   architecture.
4. **`SAVEFILE_COMPAT.md`** — the HTML app's `.zip` save format (verified directly against
   the live `exportZip()`/`zipStore()` code, not guessed), and exactly what the port needs
   to read from it for MVP.
5. **`PARITY_TESTING.md`** — how golden data gets extracted from the JS engine and how the
   Rust port gets verified against it.
6. **`REFERENCES.md`** — real, currently-maintained libraries and existing projects worth
   using or learning from (noise, save-file parsing, cross-compilation tooling, Godot
   terrain plugins for the later 3D phase), researched live rather than assumed.
7. **`TOOLCHAIN.md`** — exact tools and setup steps needed before writing any Rust/Godot
   code.
8. **`ROADMAP.md`** — what comes after the MVP, at a high level.

## Working discipline for this effort

The existing Cartalith Gen1 project (`CLAUDE.md` at the repo root) has an extremely
deliberate discipline: measure before fixing, extensive automated test suites, bit-identity
hashing, one thing finished before the next starts, everything documented with rationale.
**Carry that discipline into this port.** Specifically:

- **Measure before porting a subsystem, don't assume.** Before porting e.g. the erosion
  kernel, read the JS source (`Cartalith Gen1 v*.html`, the newest version — see the repo
  root `CLAUDE.md`'s file table), understand what it actually does and why (the CHANGELOG
  entries explain a lot of "why," not just "what"), and extract golden reference values
  BEFORE writing the Rust equivalent, so there is something concrete to test against as you
  go — not just at the end.
- **One subsystem at a time, verified before moving to the next.** Do not port tectonics,
  climate, erosion, and hydrology all at once and then try to debug the combination. Port in
  the pipeline's own dependency order (see `MVP_SCOPE.md`), verify each stage's output
  against golden data, then proceed.
- **A rewrite is not required to be a literal line-for-line translation**, but per the
  "golden-value parity" decision, it IS required to be **numerically faithful** — same
  algorithms, same constants, same formulas, adapted idiomatically to Rust (ownership,
  iterators, `rayon` for the parallel passes that were Web Workers in JS) but not
  creatively reinterpreted. If a genuine improvement or deviation seems worth making,
  that is a decision to raise with the owner, not to make silently — exactly the discipline
  `CLAUDE.md` already documents for the JS engine itself ("never fabricate a value," "a
  deliberate re-baseline is disclosed, not silent").
- **Document as you go.** Every version/milestone of the port should get a changelog-style
  entry (once the new repo exists, that repo gets its own `CHANGELOG.md` — see
  `ARCHITECTURE.md` for the proposed new-repo layout) explaining what was ported, how it was
  verified, and what's still open. Future sessions — human or AI — need to be able to pick
  this up cold, the same way `docs/HANDOFF.md` lets a fresh Claude Code session pick up the
  HTML project cold.
- **Flag what can't be verified headlessly.** Real GPU rendering, real Android touch input,
  and real on-device performance cannot be verified inside this cloud session. Say so
  explicitly wherever it applies, the same way the HTML project's `CLAUDE.md` flags
  WebGL/Worker/canvas interaction as needing manual browser verification. Don't claim
  something "works" when it has only been confirmed to compile and pass headless unit tests.

## Current status

**Planning complete, no code written yet.** Next step (per `ROADMAP.md` Phase 0): a walking
skeleton proving the Rust+`gdext`+Godot toolchain builds and runs on all three targets
(Godot editor, Windows export, Android export) with trivial placeholder content, before any
real engine logic is ported. That work happens in the **new repository** described in
`ARCHITECTURE.md`, not in this folder.
