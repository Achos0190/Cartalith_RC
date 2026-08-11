# Parity testing: validating the Rust port against the JS engine

Per `DECISIONS.md` §7, the Rust port must reproduce the existing JS engine's numeric output
at fixed seeds, not merely "look similar." This document is how.

## Why not bit-identity

`Cartalith_RC`'s own test discipline (`tests/perf/hash_gen1.js`) asserts **exact** FNV-hash
bit-identity between two HTML file versions — that works because both sides run the
identical JavaScript, in the identical double-precision floating-point semantics, doing the
identical operations in the identical order. That standard is **not achievable across
languages**: Rust `f32`/`f64` arithmetic, LLVM's instruction scheduling/vectorization, and
JS's own float semantics will not produce bit-identical results even for the "same"
formula, especially across many chained operations (tectonic substrate → height → erosion
→ hydrology is a long chain where tiny per-step differences compound).

**The standard here is numerical tolerance, not bit-identity.** Getting this tolerance
right matters: too loose and it stops catching real bugs, too tight and it fails on
harmless floating-point noise and trains whoever's maintaining this to ignore failures.

## Extracting golden data from the JS engine

1. Use `Cartalith Gen1 v*.html` (the newest version — check the root `CLAUDE.md`'s file
   table for which one that currently is) as the reference.
2. Reuse the existing headless test harness pattern from `tests/perf/hash_gen1.js` and
   `tests/stub_head.js` — these already know how to run the engine headlessly via Playwright
   and read out `field`/`tempField`/`rainField`/`flowField` after `generate()`.
3. For a small, fixed set of reference configurations (at minimum: the app's own literal
   default — seed 12345-style reference seed, 512px, 800km map-width per this project's own
   convention — plus at least one small map-width case and one large/world-scale case, since
   this repo's own history (v1.60, v2.05, v2.07) shows real bugs specifically at scale
   extremes), dump the raw float arrays to a portable format (flat binary `.f32` files or
   JSON, matching the existing `.f32` export the HTML app's own `exportZip()` already
   produces — reuse that mechanism rather than inventing a new dump format).
4. Store these golden files in the new repository (`cartalith-engine/tests/golden/` or
   similar) — small enough at 512px to check into git directly; do not commit a 2048px+
   dump if it makes the repo unreasonably large — use the smallest resolution that still
   meaningfully exercises the pipeline.

## What "within tolerance" means

- **Per-field relative/absolute tolerance, not a single global number.** Height (`field`,
  range roughly `[0,1]`) is different in character from temperature (`tempField`, range
  roughly `[-40,40]`°C) or flow (`flowField`, which can span many orders of magnitude at
  river mouths vs. dry land). Pick a sensible per-field tolerance rather than one constant
  for everything — and document the reasoning for each, the same way this project documents
  every numeric constant's provenance rather than leaving it unexplained.
- **Aggregate checks in addition to per-cell checks.** A per-cell tolerance check is the
  right first line of defense, but also assert distribution-level properties (mean, land
  fraction, min/max) — this project's own history (the v1.25 sea-level/archetype fix,
  v1.34's food-shed calibration) repeatedly found that "measure the actual distribution, not
  an assumed one" is what catches real calibration bugs that a narrow per-cell tolerance can
  miss or over-flag.
- **A failing parity test means: read the JS source for that stage again, don't just widen
  the tolerance.** Widening tolerance until a test passes defeats the entire point of this
  discipline. If a genuine, understood, disclosed algorithmic difference exists (e.g. a
  different RNG stream shape because Rust's PRNG isn't literally the JS `mulberry32`
  reimplementation — see the note below), document why and adjust deliberately, the same
  way this project's CHANGELOG documents every deliberate re-baseline with a stated reason.

## The RNG has to match, or nothing downstream will

The JS engine uses `mulberry32` (a specific, simple, deterministic PRNG — see the root
`CLAUDE.md`'s note that the urban-morphology engine "deliberately does NOT redefine
`mulberry32`... falls through to script block 1's byte-identical copy"). **Port
`mulberry32` itself, faithfully, as the very first thing**, and test IT in isolation before
testing anything that depends on it (which is almost everything — tectonic plate placement,
noise seeding, feature placement all derive from it). If the Rust port used a different PRNG
(even a "better" one), no golden-value comparison downstream would ever match, for reasons
having nothing to do with whether the port is otherwise correct — this would waste enormous
debugging time on a problem that's actually already solved by reading the existing `CLAUDE.md`
note above.

The same applies to the value-noise primitive (`hash()`/`vnoise()`/`fbm()`/`ridged()` — see
the proposed `noise.rs` module in `ARCHITECTURE.md`). Port these exactly, test them in
isolation against known input/output pairs extracted from the JS engine, before building
anything on top of them.

## Suggested test structure

```
cartalith-engine/tests/golden_parity.rs
```
- One test per pipeline stage (`test_tectonic_substrate_matches_golden`,
  `test_height_field_matches_golden`, `test_climate_matches_golden`,
  `test_erosion_matches_golden`, `test_hydrology_matches_golden`), each loading the relevant
  golden file(s) and running only that stage's logic against a known-good input from the
  PREVIOUS stage (not re-running the whole pipeline every time) — this isolates failures to
  the actual stage that regressed, the same "one thing at a time" discipline as
  `README.md`'s working-discipline section.
- A final `test_full_pipeline_matches_golden` running the whole thing end to end, for the
  configurations described above.
- Keep these runnable via plain `cargo test`, with zero Godot dependency — this is exactly
  why `cartalith-engine` must not depend on `gdext` (see `ARCHITECTURE.md`).
