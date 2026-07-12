# Phase 0 — Architecture Proposal

**Project:** Procedural Urban Morphology Generator (see `../CHARTER.md`)
**Status:** Phase 0 deliverable 4 of 4. No implementation.
**Inputs:** literature review (`01-…`), algorithm survey (`02-…`, verdicts referenced as
"Alg. n"), assumptions register (`03-…`, entries referenced as `M-…`).

This document proposes the design the evidence supports. It refines the charter in three
places the research demands (lit. review §11): an **anchor stage** before roads, a
**per-epoch growth loop** around the pipeline, and a parametric **site model** as input
context. Everything else follows the charter directly.

---

## 1. The core model: frame → growth → maturation

The primary question — *can historical morphology emerge from constrained procedural growth
rather than template placement?* — gets a sharper, evidence-based formulation:

> Historical fabric = (planned frames + accretive growth) × time.

The engine therefore runs a **time-stepped growth loop over epochs**. Each epoch executes
the charter pipeline stages incrementally; "planned" traditions differ from "organic" ones
only in *which* stage does the work in a given epoch (an instant plat vs. frontier
accretion) and in the tradition parameter pack. Both fabrics then age under the same
maturation operators (subdivision, infill, encroachment, bounded drift). This is the
mechanism by which one engine serves 23 traditions (lit. review §1.1 family reduction).

```
seed ─► SITE (S)                                 parametric context, once
        └► ANCHORS (A)                           initial institutions, gates-to-be
            └► per epoch e = 1..E:
                R1 primary routes      (once, then immutable — M-GRW-3)
                R2 street growth       (densify/explore budget — M-GRW-1)
                K1 blocks              (faces of new/changed streets)
                P1 parcels             (series platting on new frontages)
                B1 buildings           (demand-driven occupancy)
                B2 architectural grammar (footprint ops + roofs)
                D1 districts           (derived from centrality + anchors)
                W1 wall episodes       (event-driven — M-GRW-2)
                X1 maturation          (subdivision, infill, drift — M-GRW-4)
            └► DETAIL (T)                        clutter, once, post-loop
                └► SVG (V)                       serialization only
```

Stage modularity (charter requirement) is preserved: each stage is a pure function
`(state, params, rngStream) → state'` and can be replaced independently; the *loop driver*
owns sequencing. Running with `E = 1` and a planned pack degenerates to the charter's linear
pipeline — the linear pipeline is a special case, not a casualty.

## 2. Repository & file layout

```
urban-morphology/
  CHARTER.md                     founding charter (verbatim)
  README.md                      status, how to open, how to test
  docs/                          Phase 0 deliverables (this set)
  Urban Morphology v0.1.html     Phase 1+ single-file app (does not exist yet)
  tests/
    run.sh                       extract engine script-block → node harness
    stub_head.js                 DOM/SVG stubs for headless runs
    test_tail.js                 assertions: determinism, topology, statistics
    goldens/                     seed → FNV geometry hashes per stage
```

Single HTML file, three `<script>` blocks in fixed order (a convention proven by the
Cartalith harness, adopted as *convention only* — zero code sharing, per charter isolation):

1. **Engine** — pure JS, no DOM access: RNG, geometry kernel, graph, all pipeline stages.
   Everything headlessly testable lives here.
2. **App shell** — UI wiring, camera, selection/inspector, morphometrics panel.
3. **Styles & presets** — tradition packs (JSON-in-JS), render themes (cadastral /
   excavation-plan / ink survey).

No frameworks, no build, no dependencies; opens via `file://`. The only "dependency-like"
decision is writing our own integer Boolean/offset kernel (Alg. 13) — justified in §5.

## 3. Determinism design (charter: same seed ⇒ identical output)

- **RNG**: 64-bit SplitMix-style generator, own implementation on `Math.imul`/32-bit pairs
  (BigInt-free). **Substreams by label**: `rng.stream("P1/block:00417")` hashes the label
  (FNV-1a) with the master seed. Consequence: adding parcels to block 418 cannot perturb
  block 417 — the charter's "changes to one subsystem should not invalidate unrelated
  output" falls out of labeled streams + stable IDs.
- **Stable IDs**: every entity ID = its creation path (`blk-e2-r0417-f3`), never an
  allocation counter shared across subsystems.
- **No hidden nondeterminism**: no `Math.random`, no `Date`, no iteration over unordered
  containers in geometry paths (Maps only, insertion-ordered by construction; sorts use
  total-order comparators with ID tiebreakers).
- **Cross-engine reproducibility**: JS engines differ in `Math.sin/cos/atan2` low bits
  (implementation-approximated). The engine ships `dtrig` — small polynomial sin/cos/atan2
  using only IEEE-754 `+ − × ÷` (deterministic everywhere) — used in all *decision-feeding*
  geometry. Golden hashes are then valid across browsers and Node, which the headless
  harness depends on.
- **Fixed-point coordinates**: all topology in integer millimeters (`x_mm`, `y_mm` as 32-bit
  ints; world ≤ ±2 km fits comfortably). Exact predicates, no epsilon drift, hashable state.
  Floats appear only transiently inside kernels and are snapped on output.

## 4. Data model (engine state)

All engine state is one serializable object (JSON round-trippable, hashable):

- **SiteModel** (input context, not terrain — lit. review §11.5): water polylines/polygons,
  flood band, analytic slope proxy `s(x,y)` (few radial/ridge primitives, parametric),
  external route endpoints (bearing + weight from M-REG-1/6), optional harbour/bridge span.
- **AnchorSet**: typed anchors (market, temple, castle, harbour, gate…) with placement
  provenance and service parameters (M-DEN-6/8).
- **RoadGraph**: half-edge planar graph (Alg. 10). Node `{id, x_mm, y_mm, pinned}`; edge
  `{id, class: primary|street|lane|access, width_mm (M-NET-8), epoch, provenance}`. Faces
  recomputed per epoch delta.
- **Block** `{id, faceRef, polygon, frontageRuns[]}` — polygon = face inset by per-edge half
  street widths (Alg. 11).
- **Parcel** `{id, polygon, blockRef, frontage: {edgeRef, span}, depth, age, districtRef,
  flags: backland|corner}` — created in **series** per frontage run (M-PAR-4 contract).
- **Building** `{id, parcelRef, footprint (poly, holes for courts), roof: {ridges, style},
  type, age}`.
- **District**: derived labelling over parcels `{id, kind, paramsOverride}` — computed, not
  painted (M-NET-10, M-DEN-5).
- **Wall** `{circuitPolyline, gates[], epoch}`.
- **Detail** `{kind: tree|well|fence|cross|…, pos/polyline, rule}` (M-DEN-7).
- Every entity carries `meta.provenance = {rule, inputs[], registerRefs[]}` — the charter's
  "traceable to constraints", inspectable in the UI and exported with the SVG.

## 5. Geometry kernel (the one hard component)

Scope-limited by design so it stays ~500–800 LOC and testable:

- integer coords; orientation/incircle predicates exact in 64-bit via `Math.imul` splits;
- segment intersection + snap-to-grid (GIS discipline, lit. review §6);
- polygon area/winding/point-in-poly/convexity; simplification (chord tolerance);
- Boolean ops on simple polygons (Martinez-style sweep, restricted to the clean inputs the
  pipeline guarantees: no self-intersection, snapped vertices — enforced by validators);
- inward offset with per-edge distances + miter limit (Alg. 11), straight-skeleton fallback;
- straight skeleton for simple polygons ≤ ~64 vertices (Alg. 14: parcels-strips + roofs),
  with OBB-subdivision fallback (Alg. 15) on numerical failure — **every skeleton call site
  must survive fallback** (robustness invariant);
- uniform-grid spatial index.

Rationale for building rather than vendoring: Clipper-class libraries are ~10× this scope,
violate the no-dependency default, and our inputs are pipeline-controlled (simple, snapped,
small) — the general cases those libraries pay for cannot reach us. This is the "technically
justified" analysis the charter asks for, resolved in favour of self-implementation.

## 6. Stage specifications (evidence per stage)

- **S — Site**: pick site archetype (river-crossing / harbour / hilltop / plain / pass),
  instantiate SiteModel params from seed. Evidence: lit. review §4.
- **A — Anchors**: score candidate anchor positions on fields (water access, route
  convergence, defense, flood exclusion — M-REG-5/6); place tradition's founding anchors
  (market/temple/castle). Gates are *reserved bearings*, realized when walls appear.
- **R1 — Primary routes** (Alg. 2): least-cost paths from external endpoints to anchors,
  sequential with overlap reinforcement; funnel at bridge/ford. Immutable thereafter
  (M-GRW-3). Approach ribbons get pre-urban strip fields (M-GRW-5) for later fossilization.
- **R2 — Street growth** (Alg. 1): per-epoch candidate proposals (densify vs explore budget
  M-GRW-1), scored by access + frontage demand + district direction field; legalized by
  snap/extend/reject (M-NET-3/4); planned plats stamped as rectangular frames per tradition
  modulus (M-BLK-3) when the epoch's pack says so.
- **K1 — Blocks** (Alg. 10/11): face extraction on changed region; inset by street class.
- **P1 — Parcels** (Alg. 14/15): per frontage run, series platting: strip mode (depth from
  M-PAR-2/M-BLK-4, widths by grant-then-subdivide history M-PAR-1) or module mode (house
  modules M-PAR-6 → plots) or OBB mode; backland rule M-PAR-8.
- **B1/B2 — Buildings & grammar** (Alg. 9): occupancy order by centrality-weighted demand
  (M-NET-10, M-DEN-2/3); footprint grammar ops (frontage range, wings, courtyard-carve per
  M-BLD-3, outbuildings per age M-BLD-6); roofs via skeleton (M-BLD-7).
- **D1 — Districts**: compute segment-graph betweenness/closeness (Brandes; Part III of the
  survey), combine with anchor fields; allocate uses by rules (M-DEN-5); districts override
  pack parameters locally (denser core, workshop edge, temple precinct).
- **W1 — Walls**: event per M-GRW-2; circuit = offset hull of built extent + reserve,
  terrain-deflected; gates at primary-road crossings (M-NET-9); extramural ribbons continue
  at gates.
- **X1 — Maturation**: plot subdivision/amalgamation, rear infill progression (M-BLD-6),
  market encroachment, bounded node drift (M-GRW-4, planned nodes pinned initially).
- **T — Detail**: rule-scored deterministic placement (wells M-DEN-7, trees in low-GSI rear
  plots M-PAR-5, fences on low-density boundaries, market furniture).
- **V — SVG**: serialization only; **the renderer never invents geometry** (charter).

## 7. Tradition packs ("morphological genome")

A pack is data, never code — the charter's cultural-preference separation:

```js
{
  id: "medieval-nw-europe",
  era: [{ planned: 0.2, accretive: 0.8 }, …],     // per-epoch mix
  orientation: "street" | "cardinal±3°" | 15.5,    // M-BLD-4
  streets: { widths: M-NET-8 row, deadEndTarget: [0.10,0.20] },  // M-NET-2
  plats:   { module: M-BLK-3 entry | null, plotRule: "grant+subdivide" | "houseModule" },
  parcels: { frontage: M-PAR-1, depthAspect: M-PAR-2 },
  buildings:{ courtShare: M-BLD-3, partyWall: M-BLD-5, roof: "gable" },
  anchors: { founding: ["market","church"], spawn: M-DEN-8 },
  walls:   { policy: "episodic", reserve: 0.15 },  // M-NET-9, M-GRW-2
  density: { intramural: M-DEN-1, gradient: M-DEN-3 },
  acceptance: { deg4: [0.10,0.25], Hθ: [3.2,3.58], meshedness: [0.09,0.26], … }
}
```

Phase 1 ships two packs chosen to *maximally differ* (medieval-NW-Europe accretive vs
Roman/colonial planned) — if one engine passes both packs' acceptance bands, the primary
question is answered affirmatively. Further packs (Islamic, Chang'an, kancha, low-density
dispersal) are data additions in Phase 4+.

## 8. Verification & acceptance harness

Mirrors the discipline that works in this repository, isolated under
`urban-morphology/tests/`:

1. **Headless suite** (`tests/run.sh`): extract engine block → `node --check` → run
   `stub_head.js + engine + test_tail.js`.
2. **Determinism goldens**: FNV-1a hashes of serialized state after every stage at fixed
   seeds; identical across Node and browsers (guaranteed by §3 `dtrig` + integer coords).
3. **Topology invariants** (every generated city, every seed in the suite):
   planarity; polygon validity; Σ parcel areas ≈ block area (< 0.5% loss);
   every parcel has frontage or backland flag (M-PAR-8); no footprint escapes its parcel;
   no building without parcel, no parcel without block.
4. **Statistical acceptance**: metrics of Part III of the survey vs the active pack's
   `acceptance` bands (junction mix M-NET-1, dead-ends M-NET-2, segment lengths M-NET-4,
   meshedness M-NET-5, block-area tail M-BLK-1, frontage KS M-PAR-1, orientation entropy
   M-NET-7, density gradient M-DEN-3). **A city that fails its pack's bands fails CI.**
5. **In-app morphometrics panel**: the same statistics live, so the charter's "independent
   observers" acceptance test is backed by numbers on screen.
6. Unverified register entries (`L` confidence) are printed by the harness as a debt list;
   Phase exit criteria include shrinking it.

## 9. SVG output contract (editability & metadata — charter "Output")

- Layer groups in z-order: `site → districts → blocks → parcels → buildings → roads-casing
  → roads → walls → details → labels`; each `<g data-um-layer="…">`.
- One element per entity, `id` = entity ID, classed by type (`class="um-parcel um-district-market"`);
  geometry as `<path>`/`<polyline>`; **no transforms baked into leaf elements** (editability).
- Metadata: compact per-element `data-um` JSON (type, refs, provenance rule, register refs);
  one document-level `<metadata id="um-model">` carrying the full serialized model + seed +
  pack + engine version — a saved SVG is *re-openable* (the SVG is the save file).
- Styles: CSS classes in one `<style>` block per theme (cadastral / excavation / ink);
  restyling never touches geometry.
- viewBox in meters, y-down; exported at 1 unit = 1 m.
- Performance envelope: target ≤ ~3·10³ parcels ⇒ ~2–4·10⁴ SVG nodes — within comfortable
  DOM budget; generation target < 2 s for the default town, < 10 s for the 10⁴-parcel
  stress seed (all main-thread sync; no workers needed at PoC scale — and a sync pipeline
  keeps the harness trivial).

## 10. Phase mapping & exit criteria

| Phase (charter) | Contents | Exit criteria |
|---|---|---|
| 1 — renderer, seed, camera, roads | §2 skeleton; §3 RNG; kernel §5 minus skeleton; S/A/R1/R2; SVG layers | goldens stable across Node+2 browsers; junction/dead-end/entropy bands pass for both packs' road nets |
| 2 — blocks & parcels | K1/P1 (+ skeleton), topology validators | invariant set 3 green on 100-seed sweep; block-area tail τ∈[1.7,2.3]; frontage KS pass |
| 3 — buildings & grammar | B1/B2, maturation X1 | coverage-by-ring bands (M-PAR-5); courtyard shares per pack; roofs render from skeletons |
| 4 — districts, details, export | D1/W1/T, morphometrics panel, SVG metadata round-trip | full acceptance battery both packs; SVG re-open round-trip byte-stable |

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Straight-skeleton robustness | scope-limited inputs; mandatory OBB fallback at every call site (§5); skeleton failures counted in CI |
| Boolean-kernel edge cases | integer snap + input validators (only clean simple polygons reach it); 200+ randomized kernel tests with area-conservation oracles |
| Cross-engine float drift | `dtrig` + integer topology (§3); goldens run in Node and Playwright-driven browsers |
| SVG DOM blowup | entity budget + LOD grouping (details layer toggleable); stress seed in CI timing |
| "Uncanny regularity" (looks drawn) | maturation operators + statistical acceptance bands are *requirements*, not decoration (M-GRW-4, M-BLD-6) |
| Scope creep toward Cartalith | charter isolation rule; no imports either direction; only conventions shared |
| Evidence gaps (`L` entries) | tracked debt list in harness; Phase 2 research pass on digitized cadastres to sharpen M-NET-2, M-PAR-3, M-DEN-7/8 |

## 12. What Phase 1 does *not* include (explicit non-goals)

Tensor-field streets (deferred, Alg. 3), CDT (deferred), WFC/reaction-diffusion (rejected),
workers/threading, non-SVG renderers, terrain simulation, and any Cartalith integration.
