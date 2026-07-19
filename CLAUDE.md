# Cartalith Gen1

> **New session? Read `docs/HANDOFF.md` first** — current state, next task, how to verify.

Single-file HTML worldbuilding tool. **The main deliverable is the newest
`Cartalith Gen1 v*.html`** (currently **v1.11**) — a zero-dependency HTML/JS/CSS application,
designed to open via `file://` (a local HTTP server is an accepted fallback for Workers/WASM
threads; `file://` must degrade gracefully, never break).

| File | Role |
|------|------|
| `Cartalith Gen1 v1.11.html` | **Current** unified tool (~20.7k lines, 4 script blocks — see architecture below) |
| `Cartalith Gen1 v0.57/v0.6/v0.61…v1.10.html` | Previous Gen1 versions (kept; never edit in place) |
| `Cartalith_V1.915.html` | Pre-merge cartographic editor, kept as reference (routes, settlements, paint grid, politics, journey planner) |
| `urban-morphology/Urban Morphology v0.1.html` | Standalone procedural city-layout PoC, kept as reference — its engine was ported into Gen1's 4th script block (v0.95); the PoC file itself is never edited |
| `assets/sample_pack.zip` + `make_sample_pack.py` | Reference CC0 asset pack + its generator (in-app importer) |
| `docs/` | HANDOFF, roadmap, plans, `docs/research/` reports |
| `tests/` | Headless verification harness (`run.sh`, stubs, 923-assertion suite; `run_um.sh`, 831-assertion urban-morphology suite) + `tests/perf/` Playwright A/B + UI-smoke harnesses |
| `legacy/` | Historical merge tooling — **non-functional here** (inputs absent); see `legacy/README.md` |
| `CHANGELOG.md` | Per-version engine log (v0.037 → current), moved out of this file |

## Working rules

- Finish one thing before starting the next. Confirm design before building.
- **New version = new file** (`Cartalith Gen1 v0.XX.html`); don't edit old versions in place.
- **Version naming: two-digit minor from v0.61 on** (v0.61, v0.62, … v0.70). `sort -V` compares
  the minor numerically, so `v0.7` would sort *before* `v0.61` — the `tests/run.sh` default and
  any "pick newest" logic depend on the two-digit convention.
- **After any change to the engine (script block 1): run `tests/run.sh`.** A change is not done
  until it passes (923 assertions green).
- Cross-version neutrality: additive/opt-in changes must be proven byte-identical to the prior
  version at defaults (FNV checksums of field/temp/rain/render at seed 12345, 256px, region).
- GPU (WebGL) code, Web Worker glue, and canvas interaction cannot be tested headlessly — flag
  them for manual browser verification.
- Never let unbuilt features read as regressions in conversation.

## Merged-file architecture

The Gen1 file contains **four sequential `<script>` blocks** plus one `<style>` block. Blocks
execute in order; cross-block initialization must not assume a later block has run (see the
`#carIconGallery` comment in the file for the established pattern — a later block performs the
init, not `setTimeout(...,0)`).

1. **Generator engine + app shell** (~8.0k lines, `const VERSION='0.85'`). The full
   `elevation_foundation` lineage: procedural heightmap/tectonics/climate/erosion pipeline,
   renderer, LOD/atlas, exports, UI wiring. Everything `tests/run.sh` exercises.
2. **Civ/politics layer** (~4.2k lines): factions (`CIV_FACTIONS`, deterministic golden-angle
   colours for appended factions, a per-faction naming culture from `CIV_CULTURES` driving
   `_civSettleName`'s syllable/suffix pool — v1.07's `civFactionCulture` parallel array — and a
   per-faction state religion from `CIV_RELIGIONS` — v1.10's `civFactionReligion` parallel array),
   settlements/ways/icons/territory drape, ported from the Cartalith editor. v1.10 also adds
   `civProvince` (a `civTerritory`-parallel raster subdividing each faction's territory into
   settlement-seeded provinces via `_civGenerateProvinces()`, on-demand/not persisted). Also hosts
   the v0.95 urban-morphology adapter (`_umPlaceContext`,
   `_umModelFor`'s cache/queue, `_umDrawLayout`'s deep-zoom crossfade renderer) that bridges a
   settlement to script block 4's engine — see "Urban morphology" below.
3. **Asset Library** (~1.2k lines, IIFE): the native asset-management page (AssetDB,
   collections, importers incl. sprite-sheet slicer, validator, pack export). Migrated from the
   old standalone compiler; assets travel with the project ZIP via `_alExportEntries`/
   `_alImportProject` hooks.
4. **Urban morphology engine** (~2.6k lines, `const UME=(()=>{...})()`, v0.95): a pure, DOM-free
   procedural historical-city-layout generator (streets → blocks → parcels → buildings →
   walls/fortifications → districts → detail) ported from `urban-morphology/Urban Morphology
   v0.1.html`, namespaced in its own IIFE so it never touches the other blocks' globals. Entry
   point `UME.cityGen(seed,opts)` (renamed from the source's `generate` to avoid ambiguity with
   Gen1's own `generate()`). Delimited by `<!-- UM-ENGINE-START -->`/`<!-- UM-ENGINE-END -->`
   comment markers, extracted for headless testing by `tests/run_um.sh` exactly like the source
   PoC's own harness. Deliberately does NOT redefine `mulberry32` — it falls through to script
   block 1's byte-identical copy via JS scoping in the browser; `tests/run_um.sh` prepends a copy
   when extracting the block standalone.

### Urban morphology (v0.95)

Opt-in (`state.viz.urbanLayouts`, default `false`) deep-zoom reveal: past a real-km crossfade
band (`lodSpanKm()` between `UM_FADE_FAR_KM=24` and `UM_FADE_NEAR_KM=10`), a settlement's pin
fades out and its own procedurally-generated street layout fades in, drawn (opaque; the crossfade
is the layer `globalAlpha`) as `civCtx` vector strokes/fills in `drawCivLayer` (`_umDrawLayout`),
positioned by mapping the generated model's meters around `model.anchors.market` onto the
settlement's real grid coordinate **and rotated by `model._umOrient`** (v0.96 `_umTerrainOrient`:
`buildSite` grows its river west→east in a local frame, so the drawing is turned to line that up
with the real river axis / sea direction — landlocked ⇒ 0). The adapter (`_umPlaceContext`) infers
age/wall/harbour-size defaults from the settlement's existing population/tier (age/walls overridable
per-settlement via the popup's Age/Fortifications fields, `p.umAge`/`p.umWalls`, both nullable =
infer). **v0.97 (seamless refactor Stage 1):** the town is built AROUND the real roads — the
`civWays` reaching the settlement are resampled by arc length (~55 m; civWay vertices are km apart),
transformed into the layout's local frame (the exact inverse of `_umDrawLayout`'s transform, so an
injected road drawn back overlays the map road pixel-for-pixel), and passed as `opts.primaryPaths`
to `UME.cityGen`, whose `buildPrimariesFromPaths` adds them as the primary-street skeleton that
`grow()`/`buildBlocks`/`buildWall` build around. So the through-road IS the town's high street
(enters/exits at gates), not a separate parallel line. Falls back to `_umRouteEnds` (v0.96
aligned-bearings, `buildPrimaries` synthesis) when no roads connect. Internal streets/lanes/parcels
stay the engine's own procedural growth. **v0.98 (seamless refactor Stage 2 — water):** the town's
WATER is the map's water too. `_umWaterCtx(p)` packages the real water near the settlement into the
layout's local box frame (orient forced to 0, referenced to the box centre C = the settlement's real
position): (a) the nearest real river centerline (`traceRiverPolylines`' nearest stem, with a
resolution-aware search radius — at a coarse 512px region the whole ~1.7 km town box is barely one
grid cell) and (b) a coarse local raster of ALL real water over the box (sea + sub-sea-level lakes,
river band stamped in) plus its chamfer distance transform. `buildSite(seed,Wm,Hm,kind,opts)` then,
when `opts.water` is present, sources `isWater`/`riverDist` from that mask/DT and takes `river` as the
real centerline (or, for a purely coastal town, a shoreline extracted from the mask) — so the town's
bridge/bank/quay/coastline all match the map, and it never builds in the sea; the synthetic-water path
(no `opts.water`, the headless UME suite) is untouched and bit-identical. `generate()` pins the market
onto C (nudging off water if C is in the channel) so town water AND roads land on the map pixel-for-
pixel. A town whose nearest river is genuinely a couple of cells off gets NO wrong synthetic river.
**v0.99 (Stage 3 — coastal polish):** `_umWaterCtx`'s local water mask samples the height field
**bilinearly** per 22 m cell (not nearest grid cell), so the town's coastline follows the real
heightmap smoothly instead of reading as one blocky box at coarse resolutions; and `townBank`'s
water-following bank is offset toward the actual land (market side) for any coast facing, not the
synthetic `y−5` "town is north" (guarded on `site.usesRealWater`, so the UME suite stays byte-
identical). Still flagged: on a coastal town the enceinte is sized from the street-graph built-mass
hull, which folds in arterial junctions and can enclose empty land beyond the built fabric (a
growth/hull redesign, next pass); "river through town" reads best at 1K/2K.
**v1.00 (settlement-layout polish + explore popup):** (a) `removeWaterCrossings` gains a real-water pass
that culls town primaries/streets crossing open water away from the one bridge (`site.bridgePt`) — no
road walks into the sea; guarded on `usesRealWater`, so the synthetic UME suite is byte-identical. (b)
`generate()`'s market nudge searches the whole box (was 340 m) so a shore-edge settlement lands its
centre on real land. (c) `_umWaterCtx` flags `mostlyWater` (box >72% water) and `_umModelFor` bails to
the bare pin — a settlement in a lake/mid-sea shows no floating town. (d) Tapping a settlement in explore
shows its town in the editor popup: `_umModelForNow` (synchronous cached generate) + `_umDrawLayoutPreview`
(fit-to-BUILT-MASS, approach roads run off-frame) render a zoomed layout card in `_civOpenPlacePopup`.
Generation is deferred one-settlement-per-frame (`_umScheduleGenStep`) and cached (`_umModelFor`,
keyed on every input that affects the layout — including a water signature) so a cache miss shows the
pin, not a stall, until the model lands.

### Engine (block 1) essentials

One module scope, module-level globals, no classes. Resolution `GW × GH` (world mode = 2:1
equirectangular, region = 1.56:1, `GH = gridH(GW)`). Global Float32Arrays allocated in
`allocate()`: `field` (heightmap [0,1], sea level default 0.42), `stressField`, `baseField`,
`ageField`, `flexureField`, `heterogeneityField`, `resistanceField`, `volcanicField`,
`impactField`, `tempField` (°C), `rainField` [0,1], `flowField`, plus `plateId` (Int16),
`boundaryMask`/`boundaryType` (Uint8), `shearField`, and the nullable set below.

Pipeline (`generate()`): continentality → **`buildTectonicSubstrate()`** (warp → plates →
stress → flexure → base blur + age → heterogeneity → resistance → orogeny; also replayed by
`loadZip` to reconstruct the tectonic substrate exactly from the saved seed) → height formula →
normalize → volcanism + craters → **flow(area) → climate → flow(discharge)** (rivers accumulate
runoff — `computeFlow(true)` seeds cells with mean-normalised rain) → render. Canonical stage
order rationale: `docs/research/pipeline-order-audit.md`.

Erosion ops (droplet/stream-power/glacial/velocity) run in blob-URL Web Workers built by
stringifying self-contained kernels, with sync fallbacks; `evolveCoupled` runs the
climate↔erosion loop; `routeSediment` is mass-conserving. Renderer: per-pixel material mixture
via `materialWeights` (Σ=1), multi-scale hillshade, opt-in NPR styles, LOD/atlas tile pyramid
(IndexedDB-backed baking), Strahler/Rosgen river network. Export/import: `exportZip()`/`loadZip()`
— `params.json` + f32 fields + PNG layers + Cartalith-loadable `biome_baked.bin`/
`terrain_baked.bin`/`cartalith_grid.json` (+ optional atlas/asset-library entries).

Per-version details for everything above: `CHANGELOG.md`. Per-parameter reference:
`docs/GENERATOR_PARAMETERS.md`.

### Invariants (never violate)

1. `materialWeights` fractions sum to 1.0 for all valid inputs.
2. All Float32Arrays remain finite after every pipeline stage.
3. Coarse-grid (240×150) climate blur always uses CPU `blurCoarse()` — never GPU.
4. Nullable fields (`warpX`/`warpY`, `geoidField`, `tideField`, `continentalField`,
   `orogenyField`, `riverMask`/`riverFloor`) may be `null` — every consumer must null-check.
5. `deriveFromWorldStructure()` is called only from checkbox/archetype handlers, never inside
   `generate()`.
6. Transient UI state is never serialized (and `assetPack` is a module global, never serialized).
7. `v(id,val)` / `lab(id,txt)` are module-level globals.
8. The γC height term was deliberately removed — do not re-add it.
9. World mode seam: avg wrap delta < 0.12 (seed-dependent and occasionally near the threshold —
   don't tighten it).
10. Earth defaults (g=1) reproduce the previous version bit-exactly (asserted via g-toggle
    round-trip).
11. The worker kernels (`dropletKernel`, `streamPowerKernel`, `glacialKernel`,
    `velocityErodeKernel`) and the GENPOOL row-fills stay **self-contained** — no module
    globals; the suite rebuilds them from `toString()` and asserts bit-identical output.
12. **`generate()` completes synchronously when no worker pool is engaged** — no `await` may be
    reached on that path (`buildTectonicSubstrate` returns `false` sync / a Promise only on the
    pool path). v0.6 broke this and shipped 32 headless failures; restored in v0.61. The
    headless suite and any unawaited caller depend on it.
13. Frozen vocabularies are append-only, never renumbered: `BIOME_KEYS`, `KOPPEN_KEYS`,
    `BTYPE_KEYS`, `LITH_KEYS`, `CART_BIOMES`/`CART_TERRAINS`, pack slot vocabularies
    (save-format stability).
14. Keep CPU and GPU temperature lapse (`uLapse`) in lockstep.

## Verification

```bash
tests/run.sh                        # newest Gen1 file: extract engine → node --check → 923-assertion suite
tests/run.sh "Cartalith Gen1 v0.57.html"   # or any explicit target
tests/run_um.sh                     # newest Gen1 file: extract script block 4 → node --check → 831-assertion urban-morphology suite
node tests/perf/hash_gen1.js A.html B.html # Playwright A/B bit-identity battery (same-binary FNV hashes)
node tests/perf/perf_gen1.js               # timing harness (headless Chromium)
node tests/perf/smoke_gen1.js A.html        # Playwright UI-chrome smoke (onboarding/layers/presets/phase)
```

Stubs live in `tests/stub_head.js`; assertions in `tests/test_tail.js` — extend both when adding
pipeline stages or browser APIs. The suite covers the CPU paths of script block 1 only; blocks
2–3 and all GPU/Worker/canvas interaction need a browser pass. Script block 4 (urban morphology)
is pure/DOM-free like block 1, so it gets its own headless harness (`tests/run_um.sh` +
`tests/um_test_tail.js`, ported from `urban-morphology/tests/`) — but the block 2 adapter/renderer
that calls it is civ-layer code, so THAT half still needs `tests/perf/smoke_gen1.js`.

## Roadmap

See `docs/ROADMAP.md` and the plans/research under `docs/`. History: `CHANGELOG.md`.
