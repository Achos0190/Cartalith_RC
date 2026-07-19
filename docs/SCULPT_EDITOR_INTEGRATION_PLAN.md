# Sculpt Editor Integration Plan

## Goal

Promote today's hand-drawn terrain tools — currently a "Manual Terrain" accordion buried in
Generate → World, sitting alongside "Geology," "Hydrology," "Climate," "Ecology" — into a
full-fledged, stamp-based, non-destructive landscape editor, by porting the architecture proven
in `fractal-geology/Fractal Geology Painter v0.1.html` (11 feature brushes, per-feature fractal
edge character, a stamp stack, a cheap live-preview compositor) into Cartalith's engine (script
block 1), while satisfying three hard requirements from the brief:

1. **Full, rich menu** — not one accordion among several, its own editor surface.
2. **Zoom and brush size stay visually and behaviorally consistent** — the brush footprint must
   read as the same real-world size at any zoom level, in every view mode (including LOD).
3. **Painted geology feeds the resource/affordance system (lithology → soil → water access →
   resource potentials → carrying capacity → settlement suitability) — but only on commit.**
   While painting/tuning, nothing downstream recomputes; the expensive full-grid pipeline runs
   once, deliberately, when the user says so.

This document is a plan, not a diff. Two decisions below need your sign-off before any of the
phased work (P0+) starts — flagged inline and summarized at the end.

## Current state (verified in `Cartalith Gen1 v1.06.html`, not assumed)

**It isn't literally under "Geology."** The accordion is titled **"Manual Terrain"** (line 1005),
a *sibling* of the "Geology" accordion (line 762, which actually hosts Source/Planet/Scale/World
Structure/Tectonics/Volcanism) — both live inside `#genWorld` (Generate → World). Functionally
your instinct is right either way: it's one collapsible section among many, not its own surface.

**Two independent, overlapping brush systems exist today, both destructive:**

| | Plotline feature brush | Direct-paint brush |
|---|---|---|
| Entry point | `applyFeatureAlongCurve()` (line 6775) | `sculpt()` (~6698) / `brushHeight()` (line 8356) |
| Features/modes | 7: mountainRange, hills, ridge, plateau, escarpment, canyon, river | 9: raise, lower, smooth, cliff, ridge, canyon, mesa, volcano, water |
| Interaction | draw a guide stroke (RDP-simplified, Catmull-Rom smoothed), then **Apply** | live drag-paint |
| Writes to | `field` directly, in place | `field` directly, in place (except `water` — see below) |
| Post-stroke recompute | **Full-map** `computeFlow(true); refreshClimate()` (line 10160–10162) | `endPaintStroke()` → `recomputeClimate()` → **temperature only** (line 4260) |
| Undo | shared 5-slot full-`Float32Array` snapshot stack (`pushUndo`/`undoStack`, line 7028) | same |

The asymmetry in the middle row is real and already inconsistent: painting a mountain range with
the guide tool already triggers a full climate+flow recompute per stroke (expensive, but at least
correct); direct-paint sculpting does not touch rain/flow/lithology/resources **at all** until
something else happens to call `computeFlow()`. Neither is "on commit" — both are "on every
stroke, differently."

**The affordance/resource stack already exists and is exactly the right commit hook.**
`buildLithology → buildSoilFertility / buildWaterAccess → buildResourcePotentials →
buildCarryingCapacity → buildSettlementSuitability` (lines 4700–4895) are pure functions, lazily
cached (`_lithField/_soilField/_waterField/_resourcePots/_carryCapField/_settleSuitField`), and —
confirmed by direct inspection — **correctly invalidated by `generate()` (2646) and
`computeFlow()` (4031)**. So "recompute resources on commit" is not new machinery: it's *already
what happens* whenever `computeFlow(true)` runs. The gap is only that direct-paint sculpting never
calls it, and the guide-brush calls it on every single stroke instead of once at commit.

**No sculpt-overlay/delta layer exists**, despite `docs/UNIFIED_TOOL_PLAN.md` describing one
(`sculpt_delta.f32`, a `[Bake & regenerate] / [Regenerate, keep overlays] / [Cancel]` dialog). That
document predates the actual merge architecture (4 sequential script blocks, not a `Gen.*`
namespace) and was superseded. Today, sculpting a mountain by hand and then clicking "Generate
world" silently discards it — `_imported` (the only guard on `confirmRegenerate()`, line 10007)
is never set by sculpting. This plan's Draft/Committed split (below) is the first real
implementation of that superseded idea, built to match what actually shipped.

**Water already has a non-destructive precedent worth reusing, not reinventing.**
`depositWater(gx,gy)` (line 6656) — the existing "Water" direct-paint mode — floods the brush
radius up to the clicked terrain height into `lakeMask` (a `Uint8Array`, line 4682), **without
touching `field` or sea level**, and is explicitly documented as "cleared on the next generate()."
`buildWaterBodies`'s `forceLake` option (line 4673) makes `lakeMask` cells always classify as
lake regardless of connectivity. Separately, the existing plotline `river` feature already locks
carved cells into `riverMask`/`riverFloor` (line 10158) to protect them from erosion refill. **Both
of these are exactly the mechanisms the new Lake and River stamps should extend**, not replace —
see §5.

**Brush-size-vs-zoom already works for the common case, with one real gap.** Off-LOD, the brush
cursor (`renderBrushCursor`, line 7104) is drawn onto `#polyOverlay`, a sibling canvas inside the
same `.canvas-stack` that `viewT`'s CSS `transform: translate()/scale()` applies to — so the
cursor **already** visually scales with zoom, free, no extra code. In LOD (tiled) mode, though,
`renderBrushCursor` **bails out entirely** (`if(_lodOn ...) return;`, line 7107) — no cursor is
drawn at all — even though the underlying edit machinery (`editTileAt`, line 8397) already
rescales the *effect* radius correctly per tile resolution. That's a real, fixable gap, not a
design choice.

## Design decision 1 — where does the new editor live?

**Recommendation: a 4th Generate sub-tab**, alongside World / Civilization / Cartography —
`data-gsub="sculpt"`, label "Sculpt" (reviving the name the pre-merge standalone engine's own
history used for this before two IA passes folded it into an accordion).

The alternative — a new top-level tab alongside Generate/Explore — is mechanically no harder
(both are additive edits to `#tabBar`/`#genSubBar` and their click handlers), but
`tests/perf/smoke_gen1.js` line 1562 asserts `tabCount === 2 && tabsOnly2 === true`, and CLAUDE.md
+ the v0.65 CHANGELOG entry both frame the 2-position top bar as a deliberate, hard-won IA
decision (Assets/Export were *demoted out* of being tabs specifically to preserve it). A 4th
Generate sub-tab is additive to an array-based assertion (`subTabs`, smoke_gen1.js line 426) and
doesn't touch that invariant, while still delivering everything "full-fledged" actually requires:
its own toolbar, its own canvas-interaction mode, its own inspector panel — a genuine sibling of
World/Civilization/Cartography, not a `<details>` accordion buried inside one of them.

`_manualTerrainActive()` (line 6737, currently gated to `_genSubTab==='world'`) is replaced by an
equivalent `_sculptEditorActive()` gated to `_genSubTab==='sculpt'`.

## Design decision 2 — what does "commit" actually do to history?

Two models are possible; I recommend the first:

**A. Session-scoped stamp stack (recommended).** The stamp stack (per §3) is a cheap, fully
non-destructive *staging area* for the current sculpting session — unlimited undo/redo, reorder,
re-tune, hide, delete, all essentially free because it's JSON snapshots of a lightweight object
list, not the heightmap. **Commit** bakes the whole stack into `field` in one pass, runs
`computeFlow(true); refreshClimate()` once, pushes **one** snapshot onto the existing
`pushUndo()`/`undoStack`, and clears the stamp stack. A single Ctrl+Z after commit reverts the
whole batch cleanly (consistent with how every other field-mutating action in the engine — Generate,
erosion passes, the plotline brush — already uses `pushUndo`). Once committed, a stamp is no
longer independently editable; adjusting a committed mountain range means painting a new stamp on
top of it, the same way a second erosion pass builds on the first rather than reopening it.

**B. Fully persistent stamp history**, matching the PoC's own model exactly (stamps live for the
whole project; the field is always "base + full replay of every stamp ever placed," rebuildable at
any time). This is more faithful to the PoC's non-destructive ideal, but doesn't scale to
Cartalith's grid sizes: replaying dozens of stamps over a full `GW×GH` world grid (versus the PoC's
fixed 512×512 canvas) on every edit could cost real seconds, and — critically — `field` is *also*
mutated by things that aren't stamps at all (tectonics, erosion ops, imported heightmaps), so "the
field is always a pure function of the stamp stack" stops being true the moment any of those runs.

**Recommendation: A.** It reuses the existing undo idiom instead of inventing project-lifetime
stamp persistence, and matches the brief's "updating to layers only happens when committing the
terrain" literally: draft work is free and reversible; committing is the one deliberate, coarser
step, exactly like every other terrain-shaping stage in the engine already is.

## 3. Layer model

```
┌─────────────────────────────────────────────────────────────────────┐
│  DRAFT (new)                                                        │
│  sculptStamps[]  — { id, type, seed, g:{...}, f:{...}, pts, hidden }│
│  previewField    — Float32Array, = committed field + Σ(visible      │
│                     stamps' deltas), rebuilt ONLY within each       │
│                     stamp's bbox (the PoC's dirty-rect compositor)  │
│  stampHistory    — JSON snapshots of sculptStamps[] (cheap, deep    │
│                     undo/redo while painting/tuning)                │
│  Nothing here touches `field`, `rainField`, `tempField`, lithology, │
│  resources, or triggers any recompute.                              │
└─────────────────────────────────────────────────────────┬───────────┘
                                                            │ COMMIT
                                                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  COMMITTED (existing engine state)                                  │
│  field — bake every stamp in stack order (ported applyStamp)        │
│  computeFlow(true)  → clears _riverNet/_waterBody/_cartBiome/…       │
│  refreshClimate()   → temperature + weather + moisture + currents   │
│  (this ALREADY nulls _lithField/_soilField/_waterField/_resourcePots│
│   /_carryCapField/_settleSuitField — confirmed at lines 2646, 4031) │
│  pushUndo() — ONE snapshot for the whole batch                      │
│  sculptStamps[] cleared; stampHistory cleared                       │
└───────────────────────────────────────────────────────────────────┘
```

The commit step is small precisely because it reuses existing, already-correct invalidation —
the plan's job is making sure it *always* runs (once, on commit), not building new invalidation.

## 4. Feature registry — consolidating three overlapping lists into one

| Existing plotline (7) | Existing direct-paint (9) | PoC (11) | Unified registry entry |
|---|---|---|---|
| mountainRange | — | mountains | **Mountains** (ridged multifractal, PoC's peak-sharpness/ruggedness controls) |
| hills | — | hills | **Hills** (smooth FBM, PoC's softness control) |
| ridge | ridge | — | **Ridge** (keep as its own entry — a linear crest, distinct from a mountain mass) |
| plateau | mesa | plateau | **Plateau** (PoC's terraced FBM, `Math.max` never-lowers semantics kept) |
| escarpment | cliff | cliff | **Cliff / Escarpment** (merge — both are a side-signed step across the stroke normal; PoC's low-frequency "fault trace" edge warp is a strict improvement on both) |
| canyon | canyon | canyon | **Canyon** |
| — | — | valley | **Valley** (new — PoC's broad U-shaped trough, distinct from Canyon) |
| river | — | river | **River** — commit locks carved cells into **existing** `riverMask`/`riverFloor` (line 10158 precedent), reusing `enforceChannelDescent` |
| — | — | lake | **Lake** — commit extends **existing** `lakeMask`/`depositWater`/`forceLake` (line 6656 precedent) with the PoC's radial bowl + fractal shoreline, instead of a flat flood |
| — | — | basin | **Basin** (new — endorheic sink, no outlet, distinct from Lake which always fills to a level) |
| — | — | coastline | **Coastline** (new) |
| — | volcano | volcano | **Volcano** (PoC's cone+crater+flank-rough, richer than the existing conical stamp) |
| — | raise/lower/smooth | — | **Freehand** (kept as its own registry entry, not retired — a genuinely different interaction: continuous drag, no preset landform, for quick touch-ups. `mesa`/`volcano`'s STAMP_BRUSHES one-dab-per-tap behavior and `cliff`/`ridge`/`canyon`'s STROKE_BRUSHES direction-from-drag behavior fold into Freehand's sub-modes.) |

Net: **13 registry entries**, each with the PoC's per-feature `controls[]` (dynamic parameter
panel) and per-feature `edgeChar`/`edgeFreqMul` fractal edge character (§6), replacing both the
7-feature plotline set and the 9-mode direct-paint set. All 8 PoC presets (Rolling Hills, Alps,
Rockies, Badlands, Volcanic Isle, Mesa, Karst, Glacial Valley) port as one-click parameter seeds.

**Not retired, kept as a fallback:** the existing plotline/direct-paint code paths stay reachable
only if something outside the new tab still depends on them (to be confirmed in P0 — a quick
grep found no other call sites besides the UI handlers themselves, so full retirement is likely
clean, but this gets verified before deleting anything, not assumed).

## 5. Zoom / pointer sizing

1. **Off-LOD:** already correct (CSS-transform sibling-canvas trick) — no change needed.
2. **LOD mode:** replace `renderBrushCursor`'s early bail (line 7107) with an LOD-aware draw that
   converts the world-space radius to the current tile's screen scale using the **same math
   `editTileAt` already uses** (`state.radius * p.td.w / p.b.w`, line 8397) — so the visual
   cursor and the actual applied effect finally agree in LOD mode, matching what already works
   off-LOD.
3. **Live real-world readout:** next to the brush-size slider, show `radius × cellKm` (reusing the
   `cellKm = state.mapWidthKm / GW` idiom already used ad hoc at ~30 call sites) so "relative
   size" isn't just visual — the user sees the actual km footprint at any zoom.
4. **Pointer→grid conversion:** audit all painting pointer handlers to route through the existing
   `evtToGridLOD()` (line 7057) uniformly, so painting behaves identically whether the user is
   zoomed via `viewT.scale` or via LOD's own `_lodZoom`. Today the direct-paint and guide-stroke
   handlers call `evtToGrid` at a few sites that predate `evtToGridLOD` — P0 confirms and fixes
   any that aren't LOD-safe yet.

## 6. Fractal edge character (ported from the PoC, §"per-feature edge character")

Each registry entry keeps its own `edgeChar`/`edgeFreqMul` multiplier on the domain-warped mask
boundary (coastlines and lakes ragged and low-frequency; mountain ridgelines tight and
high-frequency; rivers and valleys comparatively clean since their shape already comes from the
meander parameter; Cliff/Escarpment wanders like a fault trace). This is a straight port of the
PoC's `stampBBox`/`applyStamp` warp logic (`fractal-geology/Fractal Geology Painter v0.1.html`,
the `edgeChar`/`edgeFreqMul`/mottled-transition-band code) — see that file's README for the
worked rationale per landform. One adaptation: Cartalith's `field` uses `state.seaLevel` (not a
flat 0.42) and needs the noise-scale/octave/persistence/lacunarity parameters to reuse the
engine's own `fbm`/`ridged` primitives rather than the PoC's standalone `makeNoise`, so seeds stay
consistent with the rest of the terrain (no second unrelated noise library).

**Open item for P0:** does the existing curve-distance code (`applyFeatureAlongCurve`'s nearest-
point search) already account for world-mode equirectangular wraparound (painting a feature that
crosses the antimeridian)? Not verified yet — needs a direct check before the ported compositor
assumes an answer either way, since world mode wrap (CLAUDE.md invariant 9) is a hard constraint
elsewhere in the engine.

## 7. Water — extend existing mechanisms, don't add a parallel one

- **River stamps**, on commit: call the existing `enforceChannelDescent` + lock cells into
  `riverMask`/`riverFloor` — literally the same call the plotline river feature already makes
  (line 10158). No new field.
- **Lake stamps**, on commit: extend `depositWater`'s `lakeMask` deposit with the PoC's radial
  bowl-carving (actually lower `field` in a falloff bowl, not just flood-to-level) and fractal
  shoreline warp, then mark the settled cells in `lakeMask` with `forceLake` so `buildWaterBodies`
  classifies them correctly regardless of connectivity. Reuses the existing invalidation
  (`_waterBody=null` etc., already correctly wired at every `lakeMask`-writing site).
- **Basin/Coastline/Canyon/Valley** don't need a water flag at all — they're pure elevation
  shaping; whether a cell ends up underwater falls out of `isWater(v) = v<state.seaLevel` (line
  6342) same as any other terrain.

## 8. UI / menu content (the "full and rich" ask)

New `#genSculpt` panel (sibling of `#genWorld`/`#genCiv`/`#genCarto`), built from Cartalith's
existing idioms — not the PoC's raw HTML/CSS, so it matches the rest of the app:

- **Feature palette** — `.seg`-style button grid (13 entries, icon+label), built the same way
  `seg('brushSeg','brush','brush')` (line 9995) already wires buttons to state today.
- **Presets row** — 8 buttons, one-click parameter seed (port PoC's `PRESETS` table).
- **Global brush/noise** accordion — brush size (+ live km readout), hardness, intensity, noise
  scale, octaves, persistence, lacunarity, **edge noise** (new), seed + 🎲, using the engine's
  existing `bind()`/`v()`/`lab()` slider-wiring helpers (CLAUDE.md invariant 7).
- **Per-feature dynamic controls** — built from each registry entry's `controls[]`, same pattern
  as the PoC's `buildFeatureControls()`.
- **Stamp stack panel** — list of this-session stamps: select / reorder / hide / delete, port of
  the PoC's `#stampList`.
- **Commit / Discard draft** buttons (replacing today's implicit "it's already been written to
  `field`" model) — Commit runs §3's bake sequence; Discard clears the draft stack with no field
  changes at all.
- **Draft-vs-committed visual distinction** — since Cartalith's main view is already full-color
  terrain (unlike the PoC's grayscale-first default), add a subtle staged-edit indicator (outline
  or hatch over cells with a pending, uncommitted delta) rather than porting the PoC's 5 view-mode
  buttons, which would duplicate views the main app already has (biome/relief/debug).

## 9. Phased implementation

- **P0 — Port the pure core, prove it in isolation.** Move the PoC's noise/geometry/feature-
  registry/compositor into script block 1 as self-contained, namespaced functions (no collisions
  with `applyFeatureAlongCurve`/`brushHeight`). Headless-test against Cartalith's own
  `tests/run.sh` harness *before* any UI wiring, porting the PoC's 77-assertion corpus
  (`fractal-geology/tests/test_tail.js`) retargeted at `state.seaLevel`/engine noise. Resolve the
  world-wrap open item (§6) here. No user-visible change yet.
- **P1 — Tab shell.** `#genSculpt` + `data-gsub="sculpt"`, wired into `_genSubTab` show/hide, empty
  panel. Confirm `tests/perf/smoke_gen1.js`'s 2-tab-bar assertion is untouched and its `subTabs`
  array assertion is additive. No functionality yet.
- **P2 — Draft layer.** Stamp stack + `previewField` compositor + feature palette + presets +
  per-feature controls + stamp-stack panel + cheap stamp-history undo/redo. `field` is never
  touched. `_sculptEditorActive()` gates pointer handling exactly like `_manualTerrainActive()`
  does today.
- **P3 — Commit path.** Bake stack → `field`; `computeFlow(true); refreshClimate()`; one
  `pushUndo()`; clear draft. Verify via the existing Resources/Carry Cap/Settlement debug views
  that painting a mountain range and committing actually moves copper/iron potential and
  settlement suitability — this is the acceptance test for the whole "feeds resources on commit"
  requirement.
- **P4 — Zoom/pointer polish.** Fix `renderBrushCursor`'s LOD bail; live km readout;
  `evtToGridLOD` audit.
- **P5 — Water integration.** River→`riverMask`/`riverFloor`; Lake→enriched `lakeMask`/
  `depositWater`.
- **P6 — Deprecate the old accordion.** Remove "Manual Terrain," `applyFeatureAlongCurve` call
  sites, old `brushHeight`/`sculpt()` mode chain — *after* confirming (P0's grep) nothing else
  depends on them. Freehand raise/lower/smooth survives as a registry entry (§4), not a
  regression.
- **P7 — Docs/tests.** CHANGELOG entry, ROADMAP update, `tests/run.sh` assertion additions,
  `tests/perf/smoke_gen1.js` additions for the new tab + commit flow.

## 10. Verification

- Headless: extend `tests/run.sh`'s suite with the ported feature registry (determinism,
  `[0,1]` bounds, mask locality, raise/lower/water semantics — the PoC's own corpus is the
  starting point) plus new assertions for the commit sequence (`computeFlow`/`refreshClimate`
  actually called once per commit, never mid-draft; affordance caches null after commit, non-null
  and unchanged during draft).
- Browser (`tests/perf/smoke_gen1.js` additions): tab mechanics, paint → draft (verify `field`
  unchanged) → commit (verify `field` changed + a debug-view resource field changed) → undo
  (verify one Ctrl+Z fully reverts), LOD-mode cursor visibility, zoom-relative brush-circle size
  at a few `viewT.scale`/LOD-zoom levels.
- Cross-version neutrality (CLAUDE.md's standing rule): with the new tab never opened / no stamps
  committed, `generate()` and rendering stay bit-identical to v1.06 at defaults — same FNV-hash
  discipline as every other opt-in feature in this codebase.

## Summary of what needs your sign-off before P0 starts

1. **Tab placement** — new Generate sub-tab "Sculpt" (recommended) vs. a new top-level tab
   (breaks the tested 2-position phase-switch invariant).
2. **Commit model** — session-scoped stack that bakes into `field` and clears on commit
   (recommended, reuses existing `pushUndo`) vs. a fully persistent, always-replayed stamp
   history (truer to the PoC, doesn't scale to world-size grids).
3. Whether to fully retire the plotline/direct-paint code paths in P6 or keep them dormant
   behind a flag for one release as a safety net — recommendation is full retirement once P0's
   dependency check comes back clean, but flagging this as a place you may want a more
   conservative default.
