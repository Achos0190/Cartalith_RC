# Cartalith Gen1

> **New session? Read `docs/HANDOFF.md` first** — current state, next task, how to verify.

Single-file HTML worldbuilding tool. **The main deliverable is the newest
`Cartalith Gen1 v*.html`** (currently **v1.60**) — a zero-dependency HTML/JS/CSS application,
designed to open via `file://` (a local HTTP server is an accepted fallback for Workers/WASM
threads; `file://` must degrade gracefully, never break).

| File | Role |
|------|------|
| `Cartalith Gen1 v1.60.html` | **Current** unified tool (~28.7k lines, 4 script blocks — see architecture below) |
| `Cartalith Gen1 v0.57/v0.6/v0.61…v1.59.html` | Previous Gen1 versions (kept; never edit in place) |
| `Cartalith_V1.915.html` | Pre-merge cartographic editor, kept as reference (routes, settlements, paint grid, politics, journey planner) |
| `urban-morphology/Urban Morphology v0.1.html` | Standalone procedural city-layout PoC, kept as reference — its engine was ported into Gen1's 4th script block (v0.95); the PoC file itself is never edited |
| `fractal-geology/Fractal Geology Painter v0.1.html` | Standalone stamp-based terrain-sculpt PoC, kept as reference — its engine was ported into Gen1's Generate → Sculpt sub-tab (v1.15); the PoC file itself is never edited |
| `assets/sample_pack.zip` + `make_sample_pack.py` | Reference CC0 asset pack + its generator (in-app importer) |
| `docs/` | HANDOFF, roadmap, plans, `docs/research/` reports (incl. `settlement-resources.md`, `food-logistics.md`, `travel-speeds.md`, `agricultural-productivity.md`, `water-access-travel.md`, `political-fragmentation.md`), `docs/SCULPT_EDITOR_INTEGRATION_PLAN.md` |
| `tests/` | Headless verification harness (`run.sh`, stubs, 1016-assertion suite; `run_um.sh`, 852-assertion urban-morphology suite) + `tests/perf/` Playwright A/B + UI-smoke harnesses |
| `legacy/` | Historical merge tooling — **non-functional here** (inputs absent); see `legacy/README.md` |
| `CHANGELOG.md` | Per-version engine log (v0.037 → current), moved out of this file |

## Working rules

- Finish one thing before starting the next. Confirm design before building.
- **New version = new file** (`Cartalith Gen1 v0.XX.html`); don't edit old versions in place.
- **Version naming: two-digit minor from v0.61 on** (v0.61, v0.62, … v0.70). `sort -V` compares
  the minor numerically, so `v0.7` would sort *before* `v0.61` — the `tests/run.sh` default and
  any "pick newest" logic depend on the two-digit convention.
- **After any change to the engine (script block 1): run `tests/run.sh`.** A change is not done
  until it passes (1016 assertions green). Script block 4 changes likewise require `tests/run_um.sh`
  (852 assertions green).
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

1. **Generator engine + app shell** (~9.5k lines). The full `elevation_foundation` lineage:
   procedural heightmap/tectonics/climate/erosion pipeline, renderer, LOD/atlas, exports, UI
   wiring, and (v1.15) the **Sculpt editor** — see below. Everything `tests/run.sh` exercises.
2. **Civ/politics layer** (~6.9k lines): factions (`CIV_FACTIONS`, deterministic golden-angle
   colours for appended factions, a per-faction naming culture from `CIV_CULTURES` driving
   `_civSettleName`'s syllable/suffix pool — v1.07's `civFactionCulture` parallel array, a
   per-faction state religion from `CIV_RELIGIONS` — v1.10's `civFactionReligion` parallel array —
   and a per-faction government type from `CIV_GOVERNMENTS` — v1.16's `civFactionGovernment`
   parallel array, same convention), settlements/ways/icons/territory drape, ported from the
   Cartalith editor. v1.10 also adds `civProvince` (a `civTerritory`-parallel raster subdividing
   each faction's territory into settlement-seeded provinces via `_civGenerateProvinces()`,
   on-demand/not persisted). v1.16 adds the Civilization-menu data/UI layer — see "Civilization
   menu redesign" below — including `_civFactionAggregates()`, the cached per-faction stats pass
   every Factions/Settlements/Economy/Statistics sub-page reads from. Also hosts the v0.95
   urban-morphology adapter (`_umPlaceContext`, `_umModelFor`'s cache/queue, `_umDrawLayout`'s
   deep-zoom crossfade renderer) that bridges a settlement to script block 4's engine — see
   "Urban morphology" below.
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

### Sculpt editor (v1.15)

Replaces the old "Manual Terrain" accordion (plotline feature brush + direct paint) entirely, as
a 4th Generate sub-tab (`data-gsub="sculpt"`, `#genSculpt`). Ported from `fractal-geology/Fractal
Geology Painter v0.1.html` per `docs/SCULPT_EDITOR_INTEGRATION_PLAN.md`. **Stamp-based,
non-destructive:** paint geological intent (a stroke or a tap) → a 13-entry feature registry
(`SCULPT_FEATURES` — mountains/hills/ridge/plateau/cliff/canyon/valley/river/lake/basin/
coastline/volcano/freehand, each with fractal-edge-warp character via `edgeChar`/`edgeFreqMul`)
composites a coverage mask into a **session-scoped DRAFT stack** (`sculptStamps[]`, JSON-snapshot
undo/redo) that never touches `field` — a live translucent outline overlay (`#polyOverlay` off-LOD,
reprojected onto `vctx` under Tiled LOD) previews it. **Commit** (`sculptCommit()`) bakes the whole
stack into `field` once, re-clamps any pre-existing locked river channel a non-river stamp may have
raised (`enforceRiverChannels()` — the same precedent `carveRiverValleys()` follows), carves+locks
new River stamps (`enforceChannelDescent`, converting the stamp's `{x,y}` points to the `[x,y]`
pairs that function expects — the SAME conversion `carveRiverValleys()` does for
`traceRiverPolylines`' output), deposits Lake stamps into `lakeMask` (the same array the retired
direct-paint Water tool used, so `buildWaterBodies`'s `forceLake` path classifies them), then one
`computeFlow(true); refreshClimate();`, one `pushUndo()`, and one `renderNow()` — so the visible
map and any open debug/resource view redraw with post-commit data in the same frame. Brush size is
stored in **grid cells**, not screen pixels, so it reads the same real-world km radius at any zoom
(`evtToGridLOD` for pointer capture, matching the LOD-aware convention the rest of the file uses).
Noise: `sculptFbm`/`sculptRidged`/`sculptBillow`, new parametrized wrappers on this engine's own
`vnoise()`/`hash()` — deliberately not the engine's hardcoded 6-octave `fbm()`/`ridged()` (every
sculpt feature needs octaves/persistence/lacunarity as independent sliders) and not the PoC's own
classic-Perlin `makeNoise()`.

### Civilization menu redesign (v1.16)

A UI/data-architecture refactor of `#genCiv` — not a simulation rewrite. Replaced the flat
Peoples/Settlements/Polity/Infrastructure `<details>`-accordion stack with an inner sub-tab bar
(`#civSubBar`, same click-handler pattern as `#genSubBar`): **Generation → Factions →
Settlements → Economy → Statistics** (`_civSubTab`, `_civRefreshActiveSubPage()` — renders only
the currently-active sub-page, zero cost while any other is open). `civPoiTypeRow`/the manual
way-drawing controls live above the bar, always visible regardless of active sub-page (they
belong to the top-level tool palette's Place-POI/Draw-way tools, not one sub-page).

**Data layer** — `_civFactionAggregates()`: one cached `O(GW·GH + nPlaces)` pass (gated on
`[_civAggGen,_civTerrGen,_fieldGen,faction count]`, modeled on `_civRegionalPopulation()`'s
existing single-pass shape) producing, per faction: population (Σ settlement pop — distinct from
`_civRegionalPopulation`'s density-integral ceiling, kept separate as `foodProductionCapacity`),
territory km², food surplus, trade/tax income, capital (derived from `kind`/`pop`, no override
field), a 5-way power breakdown (military/economic/political/cultural/religious + a derived
overall — explicitly labeled heuristic, never presented as simulated), imports/exports/strategic
resources (territory-mean `currentResourcePotentials()` vs. world mean), and per-sector
production (`sectorOutput`, `CIV_PRIMARY_SPECIALISATION` bucketing `CIV_SPECIALISATIONS` into
Agriculture/Livestock/Fishing/Forestry/Mining, everything else → `craft`, labeled
"(approximate)" — the one field with no direct backing signal). **Never re-runs
`_civNetworkMetrics`' Brandes betweenness** — faction economic/political numbers consume the
*persisted* `economicImportance`/`tradeVolume` from the last Auto-Populate/Generate-Roads run
(stale until the next one — an accepted tradeoff). Seven `_civPlace*` settlement-level functions
(Prosperity/Food-surplus/Defensibility/Connected-roads/Connected-rivers/Resource-context) are
thin on-demand wrappers around pre-existing primitives (`_umInferWalls`, `_umSiteKindFromTerrain`,
`buildSettlementSuitability`'s defensibility term, `currentResourcePotentials()`,
`_civCatchmentDensityMean`) — no new full-grid pass, called only for rendered rows/inspectors.

**Generation page**: pure relocation of Auto-Populate/`civAutoPolityBtn` (relabeled "Recalculate
Territories")/`civAutoRoutesBtn` (relabeled "Generate Roads") — same ids/handlers, zero logic
change; provinces/scale+opacity sliders/way list under an "Advanced" disclosure.

**Factions page**: the original compact pill picker (`civFactionPicker`) stays — it still drives
`_civActiveFaction`, the Territory-paint/Drop-settlement map tools' "paint/drop as" selection, a
deliberately separate concern from *browsing* a faction. Below it, a richer faction list; clicking
a row opens `_civPopulateFactionEditor` inline (editable Name/Government/Culture/Religion +
read-only aggregate fields + a "Diplomatic relations — not yet implemented" placeholder) with a
lazy-loaded settlement sublist (`<details>` `toggle`, gated on `builtGen===_civAggGen` — an
unchanged re-expand is a DOM node-identity no-op). `_civPopulateEntityInspector(host,kind,entity,
rowRefs)` is a thin dispatcher to the settlement- or faction- populate function (not a merge —
their editable fields differ too much for that to reduce duplication rather than relocate it).

**Settlements page**: a virtual-scrolling table (`ST_ROW_H=28`, a fixed recycled row pool sized
to the viewport + overscan, positioned via `transform:translateY` — never sized to settlement
count) with search + faction/type/econ-role/pop-range filters and 7 sort keys, over a new
transient `state.civTableFilter` (kept separate from `state.mapFilter` — different shape/intent).
`_stRebuildFiltered()` (the O(n log n)-plus-bounded-per-row-cost pass) runs only on an explicit
filter/sort/search change (debounced); `_stUpdateVisible()` never recomputes, only repositions/
repatches the pool on scroll. Row click reuses the `_civSelectedPlace`/`_civMoveViewTo`/
`_civOpenPlacePopup` precedent, feeding `_civSelectedRowRefs={nameSpan}` so a Name keystroke live-
patches the visible row (mirrors the old sidebar list's own convention — `_civRenderPlaceEditor()`
rebuilds the active sub-page *before* opening the inspector so this ref is fresh). POIs stay
reachable via a toggle reusing the untouched `_civRenderPoiList`.

**Settlement Inspector** (`_civPopulatePlaceEditor`, still the existing map-anchored popup via
`_civOpenPlacePopup()`) gained a read-only "Derived" block (Prosperity/Food surplus/Defensibility/
Connected roads/Connected rivers/Nearby strategic resources) + a Focus-camera button
(`_civMoveViewTo`). Existing editable fields/handlers untouched.

**Economy/Statistics pages** render exclusively from `_civFactionAggregates()` plus trivial extra
tallies (way km/count, settlement-tier counts via the existing `kind` vocabulary, mean
Prosperity) — no separate computation path.

`_civRenderSettlementList()`/`#civSettlementList`/`#civSettlementCount` (superseded by the
virtualized table) were deleted outright, not left as dead-but-harmless code.

### Settlement generation refactor (v1.17)

Owner-directed audit-then-refactor ("settlements emerge from geography, the renderer never
invents geography"). The audit ships as `docs/research/settlement-generation-audit.md` — read it
before touching settlement code. Every new UME capability is keyed on a NEW `opts.*` (the v0.98
guard pattern), so the synthetic path — and the headless UME suite's goldens — stays
byte-identical; everything renders only under opt-in `urbanLayouts`/the tap-popup, so the default
map render is bit-identical to v1.16.

- **Site Profile (S1)**: `_umSiteProfile(p)` (block 2, cached Map keyed `x,y,_fieldGen,_civAggGen`)
  — elevation/slope/aspect/relief/visibility, coast distance (`_civCoastDistField()` chamfer DT),
  river order/width/confluence/distance (`_civRiverPolylines()` cache), floodplain
  (`currentFloodField()` — the documented valley-width proxy), roads, resources (point +
  hinterland-disc max), biome/climate, defensibility, buildable fraction. Surfaced as the
  Inspector's "Site" line; feeds S2–S6. `_umCacheKey` FNV-hashes mask/terrain content (the old
  count-based water fingerprint could collide two coastlines onto one cached layout).
- **Function (S2)**: auto-populate assigns `p.specialisation` via `_civDeriveSpecialisation`
  (priority rules + scored argmax, 0.30 floor → 'none' means honestly no economic pull;
  `==null`-guarded so hand-set values survive). `mining` trait keyed off real hinterland ore.
  `civFactionCulture` → `opts.culture` (UME still resolves to 'medieval' — plumbing only).
- **Real terrain (S3)**: `_umTerrainCtx(p)` — the land twin of `_umWaterCtx` (22 m bilinear
  raster of real `field` over the town box) → `opts.terrain`; `buildSite.height()` samples it
  (the 3 invented Gaussian hills are skipped), so street costs/market siting/bridgePt/slope
  rejection/`terrainSuitability` all read real relief with zero downstream changes;
  `terrainAware` enabled on this path. Flat/coarse boxes honestly build flat-site towns.
- **Walls (S4)**: `_umWallSpec(p)` → none|ditch|palisade|stone (fortress always stone; most
  hamlets unwalled; `p.umWalls` override wins: true→stone/false→none), threaded as
  `opts.wallStyle` → `wallState.style`; both renderers draw palisade/ditch visibly lighter than
  stone. `buildWall` deflects ring vertices (±60 m, relief-relative gains, gated relief≥0.01)
  onto genuinely higher real ground; `wallState.terrainDeflected` is the diagnostic.
- **Validity (S5)**: `_umWaterCtx` exports `riverOrder` + `seaLakeCells` (counted BEFORE the
  river band is stamped). With real water the decorative auto-bridges are gone:
  `detectRiverCrossings(site,g)` runs on the FINAL graph (after `removeWaterCrossings`/
  `privatizeAlleys`/`clearFortZone`) — surviving road×centerline intersections become
  `site.bridges` (the road IS the bridge), a crossing-less through-town gets `site.ford`.
  `buildHarbour` requires navigability (seaLakeCells≥40 or order≥3) and a non-cliff shore,
  else no quay/piers/mole + `site.harbourInvalid='unnavigable'|'cliff'`.
- **Economy (S6)**: `opts.economy={specialisation, oreBearing}` (`_umOreBearing` = direction of
  the strongest hinterland deposit, layout-frame). `assignDistricts` adds bounded overrides on
  physical predicates: oreyard (periphery toward the ore), fishery (waterfront), sawyard (bank,
  periphery fallback), granary (by the market), warehouse rows (along primaries, sharing the
  harbour store grammar), pastoral paddocks; scale-relative fallbacks keep hamlets honest.
  Yard-shed grammar + per-economy details (spoil heaps/drying racks/log booms) + renderer
  district tints (`_UM_ECON_TINT`). Specialisation is part of the model cache key.
- **Diagnostics (S7)**: `siteprofile` debug raster view (block 1 — slope+flood buildability
  composite via new `currentSlopeField()`, full pattern incl. `renderDebugTile` mirror + legend
  + LAYER_GROUPS) and the `state.viz.civDiagnostics` vector overlay (block 2 — per-settlement
  footprint box + specialisation/wall-spec/river-class/bridge-ford-harbour-validity card; peeks
  the model LRU by seed prefix, NEVER builds a context or triggers generation; 60-card/frame cap).
- **Known scope cuts** (documented in the audit + HANDOFF): per-culture morphology (2 UME
  profiles), `model.details` never drawn by the Gen1 renderers (pre-existing), wall deflection
  is bounded not ridge-tracing, floodplain is the valley-width proxy.

### Interactive City Viewer (v1.18)

Owner request (part 2 of a religion+city-viewer ask; the owner prioritized this first via
`AskUserQuestion`, deferring religion editing to a separate later effort). Extends the existing
UME engine/adapter rather than a new one: `UME.cityGen`'s model already carried named districts,
real growth-stage history (`wall.history`/`parcel.age`/edge `.epoch`), and a full civic/religious/
economic building roster (`churches`/`markets`/`civic`/`games`/`details`) that neither existing
renderer (`_umDrawLayout`, `_umDrawLayoutPreview`) ever drew — this feature is almost entirely a
civ-layer (block 2) rendering/camera/UI addition, zero new `UME.cityGen` capability or `opts.*`.

- **Entry point**: `_civInfoAt` (Explore mode's "Info" tool — previously a plain terrain/nearest-
  settlement text sidebar, `#civInfoPanel`) gained a tight pin-hit test (reusing
  `_civSelectPlaceAt`'s own pick radius) — a genuine settlement hit with a valid model calls
  `_civOpenCityViewer(p)` instead of filling the sidebar; a miss falls through unchanged. The
  Civilization-mode editor (`_civOpenPlacePopup`, reached via the Inspect tool/settlement table/
  right-click) is untouched — a deliberately separate "author the world" vs. "explore the world"
  split.
- **Shell**: `#cityViewerModal` (full-viewport, canvas + docked `#cvInfoPanel`), its own camera
  `_cvCam={panX,panY,scale}` (pan/zoom math mirrors the main map's `viewT`/`zoomAt`/`panDrag`
  convention but is fully self-contained — never reads/writes the main map's camera). Opens via
  the existing `_umModelForNow` (synchronous, cache-backed since v1.00); initial view fits the
  same built-mass bounding box `_umDrawLayoutPreview` already computes.
- **LOD draw pipeline** (`_cvDrawCity`): extends `_umDrawLayoutPreview`'s exact layer stack
  (water→blocks→streets→wall→bridges→buildings+ridge), gated purely by camera scale (draw-time
  only — the whole model is already generated in one `UME.cityGen()` call regardless of the
  viewer, so there's no new generation-laziness machinery): parcel district fills
  (`_UM_DISTRICT_FILL`) + gates + plaza at the "city" tier (`CV_LOD_CITY`), courtyard-building
  distinction at "neighbourhood" (`CV_LOD_HOOD`), civic/religious/market/clutter glyphs at "max"
  (`CV_LOD_MAX`) — each viewport-culled via the same bbox-with-margin idiom `drawCivLayer` already
  uses for settlements. Per-glyph jitter uses the global `hash(x,y,seed)` primitive (block 1),
  not the UME engine's own `stream`/`fnv1a` pair, which lives inside its isolated IIFE and isn't
  reachable from block 2.
- **Info panel** (`_civPopulateCityViewerInfo`): General/Economy/Infrastructure/Military/Religion/
  Demographics/History, sourcing only data already confirmed to exist (`_umSiteProfile`,
  `_civFactionAggregates()`, the `_civPlace*` primitives, `wall.history`). Faction-level figures
  labeled "(faction-level)"; genuinely unsimulated data (per-settlement religion, a structured
  event timeline) gets an honest "not yet modeled" note, never a fabricated value. Edit button
  opens the existing settlement editor — no new city-layout editing.
- **Known scope cuts** (documented in HANDOFF): deep procedural-layout editing (needs a new
  persisted per-city edit-overlay model), literal contour-terracing, a "pilgrimage city"
  archetype with ceremonial roads — all genuinely new engine capabilities, unlike everything else
  this feature surfaces, which was already generated and simply never drawn. Religion Manager
  (the deferred half of the original request) — not started.

### Sculpt mobile pan joystick (v1.19)

Owner request: on touch, a single-finger canvas drag is captured as a sculpt paint stroke
(`sculptPointerDown`), so there was no gesture left to pan with while painting — the existing
`#panBtn` ✋ toggle only offers an either/or choice. Ported `Cartalith_V1.915.html`'s own "ANDROID
NAV PAD" pan mechanics (read-only reference, never edited) as a new small `#sculptNavpad` stick,
touch-only (`isMobile`), shown only while `_sculptEditorActive()`.

- **Shell**: `#sculptNavpad` (CSS: `.sculpt-navpad-stick`/`.sculpt-navpad-knob`) stacks directly
  above `#zoomOverlay` in the same bottom-right corner column. Stick-only — no zoom slider, since
  `#zoomOverlay` already has dedicated `+`/`−`; "small graphic joystick" per the owner's own
  phrasing.
- **Pan mechanics**: `_sculptNavSetKnob`/`_sculptNavPanLoop`/`_sculptNavResetKnob` are a direct
  port of V1.915's own knob-to-velocity mapping (`MAX_OFFSET`/`DEAD_ZONE`/`MAX_SPEED`) and
  `requestAnimationFrame` continuous-pan loop. The loop drives whichever camera is actually active
  — `viewT.panX/panY` off-LOD, `_lodCx/_lodCy` under Tiled LOD — branching on `_lodOn` exactly
  like the existing `panDrag`/`_lodPan` drag handlers, so a knob nudge pans identically to a real
  drag, just relocated off the paintable canvas.
- **Visibility sync** (`_sculptNavSync`): re-run from every place `_sculptEditorActive()`'s
  inputs can change — the top Generate/Explore tab switch, the `#genSubBar` sub-tab switch, and
  `applyFinalizedUI` (finalizing forces read-only).
- **Known scope cuts**: no zoom slider (deliberate — see Shell above); not extended to other
  touch/paint tools (e.g. Cartography's paint mode) — not requested, left for a future session if
  the same conflict is ever reported there.

### Expanded natural-feature vocabulary (v1.20)

Owner request: "let's go up to 4/5 different possible tree types (and for other landscape types
and features) that can be placed at relatively random." Extends the existing opt-in procedural
map-icon layer (`placeMapIcons`/`drawMapIcons`, `state.viz.icons` default `false`) rather than
building a new system — that toggle previously drew only 2 tree styles and nothing on grassland/
steppe/desert/tundra.

- **Biome → feature mapping** (`placeMapIcons`, block 1): trees grew from 2 to 5 kinds keyed off
  the frozen `BIOME_KEYS` index — `conifer`/`broadleaf` unchanged; new `rainforest` (temperate
  rainforest + tropical jungle, same dense closed-canopy grid); new `savanna` (savanna + tropical
  dry, sparse — thinned by a per-cell `hash()` keep-probability test); new `wetland` (a REAL
  terrain signal via `currentWetlandMask()`, checked FIRST and overriding whatever biome sits
  underneath a marsh pocket, not a climate bucket). New ground-scatter category (non-tree,
  returned as `icons.scatter`, separate from `icons.trees`): `shrub` (grass/steppe/Mediterranean),
  `cactus` (warm desert), `boulder` (tundra, and cold desert — split by `tempField` at 10°C).
  `opts.tempField`/`opts.wetlandMask` are strictly OPTIONAL additions to `placeMapIcons`'s
  existing `opts` object (omitted ⇒ desert always reads warm/cactus, no wetland override) — the
  function stays the "pure primitive, no globals" contract `tests/test_tail.js`'s synthetic-ridge
  unit test already relies on; the live call site passes the real `tempField`/
  `currentWetlandMask()`.
- **Mountains/hills**: variety in the procedural FALLBACK only (`drawMapIcons`, which may read
  `tempField`/`rainField` module globals directly — it's only ever exercised against a real
  `generate()`'d world, unlike `placeMapIcons`) — a snow cap below ~2°C (`tempField` already has
  elevation lapse baked in, invariant 14 below — no new computation) and a rockier hill outline
  when `rainField` reads arid. Pack art for `mountain`/`hill` deliberately stays
  climate-unconditioned (still N positionally-picked variants, unchanged schema) — a disclosed
  scope cut to avoid schema churn.
- **Manual placement parity**: every new kind is also placeable one-at-a-time via the Icon tool's
  "Feature icons" family, exactly like the original 4 — `PACK_ICON_SLOTS` and
  `CIV_FEATURE_ICON_TYPES` both grew 4→10 in lockstep, plus the Asset Library's own `FAMILIES`
  reference table (block 3).
- **Sample pack**: `assets/make_sample_pack.py` gained 6 new procedural silhouette generators
  (same stdlib noise/raster style as the existing `conifer()`/`broadleaf()`/`hill()` — no
  real/downloaded art needed) and `assets/sample_pack.zip` was regenerated (21 icon sprites across
  10 slots, up from 9).
- **Known scope cuts**: `mountain`/`hill` pack-art selection isn't climate-aware, only the
  fallback (see above); the hot/cold-desert and snow-cap thresholds are reasonable un-tuned
  defaults; `structures.trait` badges and biome/terrain ground-texture art remain parsed-but-
  undrawn (pre-existing gaps, unrelated to this feature); no new POI/settlement slots — a much
  larger reference sheet the owner shared (ruins, standing stones, lighthouses, 16 culture packs,
  etc.) remains reachable only via the Asset Library's existing free-form `custom` icon family +
  sprite-sheet slicer, manually placed, not auto-attached to anything.

### Sprite-sheet slicer zoom/pan (v1.21)

Owner request, prompted by asking whether the slicer (`SpriteSheetImporter`, block 3) has a max
upload size: it doesn't, but `redraw()` always scaled the WHOLE sheet down to fit a fixed box, so
a large/detailed sheet just got small — no way to work at precision. Owner: *"I'd like zoom and
pan buttons and an option for the viewer to zoom. That way it should be easier to work accurately
with larger resolution sheets."*

- **Key finding**: `.al-slice-cv-wrap` already had CSS `overflow:auto`, dormant only because
  `redraw()` always capped the canvas to fit inside it. Lifting that cap on zoom lets the canvas
  exceed its container and the browser's own scrollbars/wheel-scroll/touch-scroll do the panning
  for free — no custom camera/transform system needed (unlike the main map's `viewT`/`zoomAt()` or
  the v1.18 City Viewer's `_cvCam`). Consequently `evToSrc(e)` (the pointer→source-coordinate
  converter every hit-test/drag function depends on) needed **zero changes** — it already derives
  from `cv.getBoundingClientRect()`, which stays accurate regardless of scroll position.
- **Zoom**: new `zoomMul` state (reset to `1` on every new sheet load); `redraw()`'s existing
  fit-to-box math becomes the baseline (`fitScale()`), actual `scale = fitScale()*zoomMul` — every
  downstream draw call already multiplied purely by `scale`, so no other redraw changes. `−`/`+`/
  `Fit` buttons plus a live `NN%` readout (new `.al-slice-zoom` toolbar); wheel-zoom on the wrap
  zooms to cursor (`zoomBy(factor,clientX,clientY)` captures the source point under the cursor via
  `evToSrc` before rescaling, then adjusts `wrap.scrollLeft/scrollTop` to keep it fixed — the same
  trick the main map's `zoomAt()` does via transform instead of scroll). `maxZoomMul()` caps zoom
  at a flat ~6000px canvas-dimension ceiling (memory-bounded, not tied to the sheet's native
  resolution).
- **Pan**: new 4th mode (`'pan'`, "✋ Pan") in `#alSlMode` alongside select/grid/pick. Its
  pointerdown/pointermove/pointerup handlers capture the starting scroll offset and client
  position, then set `wrap.scrollLeft/scrollTop` from the client-space delta — mirrors the main
  map's own `panDrag` idiom, just targeting native scroll instead of a CSS transform. Native
  scrollbars/trackpad scroll keep working in every mode regardless — Pan mode is for click-drag
  precision, not the only way to move around.
- **Flex-centering fix**: `.al-slice-cv-wrap` changed from a flex container
  (`align-items:flex-start;justify-content:center`) to plain block layout — a flex container
  centering an item that overflows it is a known cross-browser quirk where the "before" overflow
  can end up unreachable by scroll; the canvas now just sits top-left in normal flow.
- **Known scope cuts**: none — the tool had zero prior headless/smoke coverage, so this feature
  also added the first Playwright-driven smoke coverage for the slicer (`R.v121` in
  `tests/perf/smoke_gen1.js`), necessarily DOM/real-mouse-driven since `SpriteSheetImporter` is
  deliberately not exposed on `window` (synthetic `dispatchEvent` PointerEvents fail Chromium's
  `setPointerCapture`, which requires a genuinely browser-tracked pointer — Playwright's real
  `page.mouse.*` APIs sidestep this).

### Joystick direction + all-views + LOD0 supersample (v1.22)

Three owner-reported items in one pass. Owner: *"The joystick works in the opposite direction that
we push, and on mobile/tablet i think we should just have it in all views"* + *"When using LOD
pyramid tiling LOD0 seems to be of poor resolution (even if we pick 1k/2k) and the individual sub
division of tiles below LOD0 should be tiles of 512px."*

- **Joystick direction** (`_sculptNavSetKnob`, block 1): the v1.19 port of `Cartalith_V1.915.html`'s
  ANDROID NAV PAD dropped the source's velocity **negation** (`vx = -(dx/mag)*…`, whose own comment
  reads "drag the knob right → reveal map to the right"), which inverted the feel. Restoring that one
  sign fixes BOTH pan-loop branches at once — off-LOD `viewT.panX += _svx` (content translation ⇒
  negative `_svx` moves content left ⇒ view travels right) and LOD `_lodCx -= _svx` (camera centre ⇒
  negative `_svx` moves the centre right ⇒ view travels right) already carry the opposite signs the
  two camera conventions need, so the single flip is the whole fix.
- **Joystick in all main-map views** (`_sculptNavSync`): was gated to `isMobile && _sculptEditorActive()`;
  now `isMobile && !_view3dOn`, further hidden while the setup gate (`#onboard`) is up or the City
  Viewer modal is open. `isMobile` is checked FIRST so non-touch devices (and the headless suite,
  where `getComputedStyle` is undefined) short-circuit before any modal query. Re-synced from every
  place its inputs change: the top-tab / `#genSubBar` switch and `applyFinalizedUI` (as before) plus
  `_setupHide`/`_setupOpen`, `enter3D`/`exit3D`, and `_civOpenCityViewer`/`_civCloseCityViewer`. The
  `#sculptNavpad` element id and `_sculptNav*` names are kept (the joystick was born in the Sculpt
  editor); only the gate widened.
- **LOD0 supersample** (block 1): the LOD compositor drew into the GW×GH `#view` canvas, so fully
  zoomed out the whole map mapped 1:1 into GW pixels (the coarse-field resolution) and the pyramid's
  finer sub-tiles were downsampled straight back — no visible detail before the display upscaled it.
  New `_lodRenderW()` (pure, GW-only → headless-safe) supersamples the LOD backing to `2× GW`, hard-
  capped at `2560px` (`Math.max(GW, Math.min(2560, GW*2))`, so it never DOWNsamples a big world);
  `lodViewRect` picks the pyramid level via `pyramidLevelForZoom(span, _lodRenderW(), _lodTile, …)`
  instead of `GW`, so LOD0 already composes from finer tiles (z=1 at a 1024px world = 2×2 sub-tiles,
  each 1024px = 2× procedural detail). `drawLODView` resizes `#view` to `RW×RH` and sets a context
  transform `setTransform(RW/GW,0,0,RH/GH)` so ALL its existing GW×GH-logical draw math (overview
  blit, tiles, reprojected vector overlays) maps onto the larger backing UNCHANGED. `renderNow`
  restores `#view` to GW×GH on the non-LOD path (guarded off the partial-repaint `rect` fast path)
  before its `putImageData(GW×GH)`, so the default render is **byte-identical** (hash battery ALL
  IDENTICAL incl. every opt-in scenario — LOD is opt-in, default off). `_v3dGrabColor` downscales the
  whole (possibly supersampled) canvas to the GW×GH 3D-drape grid instead of cropping its top-left
  corner; the GL `uploadColor` path (normalized UVs) needs no change. `scheduleLodRefine` now
  sharpens on any settle (was gated `_lodZoom>1.05`, which skipped the fully zoomed-out base).
- **Known scope cuts**: the supersample factor is a fixed 2× capped at 2560px (not display-DPI
  adaptive — a bounded default so tablets stay smooth; a 4K+ display can still gently upscale past
  the cap); the instant LOD overview placeholder stays at the 512px `OV_TARGET_W` (covered by the
  sharp finer tiles after refine, so it only affects the brief pre-refine frame); civ-layer overlay
  canvases stay GW×GH (they read slightly softer than the supersampled terrain under LOD, alignment
  unaffected). Canvas/GPU/touch interaction — manual on-device verification per this file's headless
  carve-out.

### Settlement pick-radius + Journey Planner fixes (v1.23)

Three owner-reported bugs, all civ/Journey-Planner (block 2) — engine/UME suites and hash
bit-identity unchanged (these paths never touch the terrain raster).

- **Settlement clickable area now scales with zoom** (`_civZoomPickR`, block 2). The place-pick
  radii were flat GRID-space values (`GW/50`, `GW/35`) while the pins draw at a roughly constant
  on-screen size (`_civZoomK`), so zooming in ballooned the clickable target on screen and swallowed
  pan drags near a settlement. `_civZoomPickR(gridR0)` divides the zoom-1 grid radius by the live
  zoom — `viewT.scale` off-LOD (clamped exactly like `_civZoomK`), `_lodZoom` under Tiled LOD —
  keeping it a constant on-screen size; unchanged at zoom 1. Applied at all five place-pick sites:
  `_civSelectPlaceAt`, `_civDropPlace`'s select-near-existing, both `_civInfoAt` radii (generous
  nearest + tight City-Viewer pin-hit), and the right-click "nearest place" context menu. (The
  internal `_jpSettlements` route-snap radius is NOT a screen interaction — left grid-space.)
- **Journey Planner sea speed ordering** (`JP_TERRAIN.sea`, block 2). This row is the STRUCTURAL
  water-type modifier; wind/current is a SEPARATE axis in `JP_ROUTE.sea`, so it must not be
  double-counted. Open Sea (0.85) was slower than Coastal Waters (1.00) — and `1.00/0.85≈1.18`
  matched the owner-reported 97/82 km-day ratio, confirming a systemic base-table sign error, not a
  one-off weather roll. Reordered to rise with distance from shore (pre-industrial coastal sailing
  hugged the coast and anchored at night; open-sea passages ran continuously): `Sheltered Bay 0.95 <
  Coastal Waters 1.00 < Open Sea 1.20`, with `Rough Open Sea 0.60` the weather-degraded outlier.
- **Vessel↔terrain compatibility — one source of truth** (`_jpVesselWaterBlock`, block 2). The
  autoselector (`_jpVesselFits` → `jpAutoPickVessel`/`_jpAutoStageVessel`) and the validator
  (`jpCalcWater`) each carried their own inline copy of the mode / open-sea-rating / `invalidWater`
  rules — two definitions free to drift. Both now call `_jpVesselWaterBlock(ship,cat,terrain)`, so a
  vessel the selector is allowed to pick can never be one the validator later rejects, while the
  validator still fires for a genuinely infeasible MANUAL / per-stage-override choice (the selector
  path just never produces one). The Dhow is deliberately left `openSea:true` — historically correct
  (Indian-Ocean monsoon dhows were genuine open-water traders); `JP_SHIPS` stays the authoritative
  per-vessel data, so a coastal-only variant is a one-line override that both paths pick up.
- **Tests**: 8 new smoke assertions (`R.v123` in `tests/perf/smoke_gen1.js`) — Open Sea > Coastal
  Waters; no residual sea-pair ordering bug; selector⟺validator agreement across every vessel ×
  water terrain; autoselect never flagged invalid; an autoselected Open Sea vessel passes the real
  `jpCalcWater`; a manual river-barge-on-open-sea is still blocked; the Dhow spot-check; and the
  settlement pick radius shrinking with zoom (off-LOD and under LOD). Journey-Planner logic lives in
  block 2, so it is smoke-tested (Playwright in-page `evaluate`), not by the block-1 headless suite.
- **Known scope cuts**: base ship speeds (`JP_SHIPS.speed`) and per-scenario `hours` are untouched,
  so the absolute km/day can run above the historical reference band for a large ship on a long day —
  the fix is the ORDERING, not the absolute magnitude. Land/river terrain speeds and unrelated vessel
  types are untouched. Settlement pan-near-pin feel is canvas/pointer — manual on-device
  verification per this file's headless carve-out.

### External QA report fixes (v1.24)

An external QA report (headless jsdom + real-event harness run against v1.21) flagged 8 findings.
All 8 were independently re-verified against the current file (line numbers had shifted since v1.21,
behavior hadn't) before fixing. Every fix is civ/UI-layer or a pure internal-accounting/escaping
change, so engine/UME suites and hash bit-identity are unchanged.

- **BUG-1 (HIGH) — World Structure sliders were completely dead.** `segOn` is a `const` declared
  inside `syncUI()`'s own scope; the `wsp()` per-slider `change` handler (a separate top-level
  closure) called it anyway, throwing `ReferenceError: segOn is not defined` — *after*
  `state.world_structure.archetype='custom'` was set but *before* `deriveFromWorldStructure()`/
  `syncDerivedTectSliders()`/regeneration ever ran. Releasing any of the five sliders silently did
  nothing (the archetype-button click handler right above it was unaffected — it toggles the pill
  directly, never calling `segOn`). Fixed by inlining that same direct toggle in the slider handler
  instead of calling the out-of-scope helper.
- **BUG-2 (HIGH, data loss) — Delete while typing deleted the selected settlement.** The global
  keydown listener for Delete (removes `_civSelectedPlace`) and Escape (commits an in-progress route/
  way) had no typing guard, unlike every sibling keydown listener in the file (layer hotkeys, Ctrl+Z/
  space-pan, Shift+D — all check `tag==='INPUT'||'TEXTAREA'||'SELECT'||isContentEditable`). The
  place-edit popup is exactly the context where a place is selected AND the user is typing (Name/Pop/
  History) — one stray forward-Delete keypress silently deleted the settlement, no confirm, no undo.
  Added the same guard the sibling handlers already use.
- **BUG-4 (MEDIUM, data loss) — inconsistent confirmation on destructive actions.** "Clear all
  labels", "Clear all icons", and the place-editor's "Delete place" button all mutated immediately
  with zero confirmation, unlike the matching civ-tab clears (`civClearTerrBtn`/`civClearRoadsBtn`/
  `civClearPlacesBtn`), which already `confirm()` with a count. Added matching `confirm()` calls
  (with counts, same wording convention) to all three — hand-placed labels/icons/settlements can
  represent real work.
- **BUG-5 (MEDIUM) — no `beforeunload` guard anywhere.** Manual "File → Export .zip" is the only save
  path; an accidental refresh/tab-close silently lost every edit since the last export. New
  `_hasLiveWorld()` (the setup gate — `_obEl` — is hidden ⇒ a world exists, the same contract
  `_setupHide`/`_setupOpen` already enforce) plus a `beforeunload` listener that warns whenever it's
  true. Deliberately NOT a fine-grained "dirty since last export" flag: threading that through every
  mutation site (places/labels/icons/ways/journeys/factions/terrain sculpt/paint…) is a lot of surface
  area to keep in sync, and a single missed spot would silently fail to warn — worse than no guard at
  all. A blanket "warn whenever a world exists" can never silently under-warn; the cost is one extra
  prompt right after an export, ordinary browser UX for an unsaved-work editor.
- **BUG-3 (MEDIUM) — busy overlay hid prematurely with queued operations.** `showBusy`/`hideBusy` had
  no nesting counter, so two ops queued via `withBusy`'s `_busyChain` (e.g. two quick slider changes)
  hid the overlay when the *first* op finished while the second was still queued/running — the app
  read as idle mid-generation. New `_busyDepth` counter, a pure internal-accounting change inside
  `showBusy`/`hideBusy` themselves — every existing call site (erosion ops guarded by `_eroBusy`,
  bake/finalize/loadZip guarded by disabled buttons) is already a balanced 1:1 pair, so no call site
  needed to change; clamped at 0 so a stray extra `hideBusy()` (e.g. `generate()`'s
  already-finalized early return) can never go negative and get "owed" a future hide.
- **BUG-6 (LOW) — dead asset-pack thumbnail gallery.** `renderPackInspector()` has always targeted
  `#packGrid` — real, fully-specified CSS (`#packGrid{display:flex;...}`) with no corresponding HTML
  element — so it silently no-op'd and a loaded pack's texture/icon thumbnails never rendered
  anywhere. Restored the missing `<div id="packGrid">` next to `#packInfo`.
- **BUG-7 (LOW) — unescaped user text in `innerHTML` content contexts.** Attribute contexts and the
  History textarea already escaped correctly (pre-existing), but several content-context sites
  didn't: a settlement/faction name containing `<` corrupted the row markup, and
  `<img src=x onerror=…>` executed. New shared `_escHtml(s)` (promoted from an ad hoc local one-off
  that already existed for the Journey Planner's route-stops line), applied at the confirmed
  content-interpolation sites of user-editable text: the settlement/POI list row, both faction
  `<option>` dropdowns (map-filter select + the place-editor's faction picker), the City Viewer
  header, and the virtual-scroll settlements table row (name + faction). This is the reported
  examples fixed, not an exhaustive file-wide sweep — see the scope note in `docs/HANDOFF.md`.
- **BUG-8 (LOW) — stuck Space-pan on focus loss.** `spaceDown` was only ever cleared on `keyup`; an
  Alt-Tab / OS shortcut fired while holding Space means that keyup is never delivered to the page,
  leaving `spaceDown` stuck `true` — the next left-drag pans instead of using the active tool until
  Space is tapped again. Added a `window` `blur` listener clearing `spaceDown` (and `_cam3dDrag`, the
  analogous stuck-drag case for the 3D orbit/pan camera).
- **Tests**: 8 new smoke assertions (`R.v124` in `tests/perf/smoke_gen1.js`), one per bug — dispatched
  real `KeyboardEvent`s (Delete/Escape/Space), stubbed `window.confirm` to decline and checked data
  survived, exercised `showBusy`/`hideBusy` directly, checked `_escHtml`'s output and `_stRowHtml`'s
  actual rendered markup for a deliberately hostile name. One test-only bug found during
  verification: the BUG-3 assertion needed to force a clean `_busyDepth=0` baseline before probing,
  since an earlier `withBusy()`-queued op elsewhere in the long smoke run can still be in flight on
  its own timer by the time this block runs — not an app bug, a test-isolation gap.
- **Confirmed as non-issues, left alone** (per the report's own findings): the duplicate
  `id="finalizeSec"` (the second instance is inside an HTML comment, not live markup); the
  `generate`/`exportZip`/`loadZip`/`renderNow` reassignment-wrapper pattern (every call site resolves
  the wrapped global lazily inside its own closure, so no stale-reference bug); the
  `_sculptCtx.waterOut===_sculptCtx.waterOut` line (an intentional NaN self-check, not a typo).

### World-Structure archetype sea-level fix (v1.25)

Owner report: "when selecting the preset worldshapes like volcanic, archipelago or islands the
result isn't what is suggested." Root-caused with a Playwright probe (measured land fraction +
connected-component landmass fragmentation across all six `ARCHETYPES` at a fixed seed/
resolution) BEFORE writing any fix, per this file's own working-rules discipline.

- **Root cause.** `deriveFromWorldStructure()` (line ~2181) derives `state.tect.plates`/`vel`/
  `volc.count`/`tectonicGraph`/`foldIntensity`/`trenchDepth` from an archetype's bundle but never
  touches `state.seaLevel` — an independent user slider (`#sea`, default 0.42) that stays wherever
  it was left. `normalize()` is a pure min-max stretch of `field`, also continentality-
  independent. Combined with the height formula's (`fillHeightRows`) disproportionate orogeny
  contribution for exactly the low-continentality archetypes (Archipelago `tectonicEnergy:0.80`,
  Volcanic `tectonicEnergy:0.90`), the fixed sea level didn't land at the right threshold for
  those worlds' own height distributions. Measured pre-fix at seed 12345/512px: **Archipelago
  (continentality 0.15) rendered 71.5% land; Volcanic (continentality 0.05) rendered 60.6% land**
  — both MORE land than plain Classic's 56.5%, backwards from what those archetype names promise.
- **Fix**: `applyWorldStructureSeaLevel()` (new, defined right after `generateContinentalityField()`),
  gated on `state.world_structure.enabled`, called inside `generate()` right after `normalize()` +
  the volcanism/craters `[0,1]` clamp, before `computeFlow()`/`refreshClimate()`/
  `carveRiverValleys()` (all of which read `state.seaLevel` for land/ocean classification). Reuses
  `generateContinentalityField()`'s own O(N) histogram-percentile technique (same `BINS=2000`
  approach): measures the ACTUAL generated field's height histogram and re-anchors
  `state.seaLevel` to the threshold yielding exactly the archetype's promised
  `(1−continentality)` ocean fraction, clamped to `[0.05,0.95]`. Chosen over a predictive pre-
  generation formula because it's self-correcting regardless of how tectonicEnergy/oceanDepth
  reshape the distribution — a post-hoc EXACT measurement rather than a fragile guess. Refreshes
  the `#sea`/`#seaV` sidebar slider via the existing `v()`/`lab()` globals (invariant 7), since
  `_suGenCommit()` calls `syncUI()` *before* `generate()`, so a mid-generate `state.seaLevel`
  change needs its own explicit DOM update to avoid a stale on-screen slider. Does **not** touch
  the height formula itself — invariant 8 (no re-added γC term) is respected; only the
  independent downstream land/ocean threshold changes. No effect when `world_structure.enabled`
  is false (Classic/default path), so bit-identity holds.
- **Re-measured post-fix** (same seed/resolution): land fraction now tracks each archetype's own
  `continentality` almost exactly — Earth-like 0.300, Supercontinent 0.601, Archipelago 0.150,
  Volcanic 0.050, Rift 0.401 (vs. their continentality params 0.30/0.60/0.15/0.05/0.40).
  Landmass-dominance also improved incidentally (Volcanic's largest-landmass share of total land
  84.0%→44.2%, Archipelago's 96.8%→81.6%) though fragmentation shape wasn't this fix's target.
- **Known scope cut, disclosed (not fixed this pass)**: landmass SHAPE/fragmentation still doesn't
  fully track `fragmentation`'s intended noise frequency — `buildPlates()` samples the smooth
  `continentalField` at only each plate's single centroid, discarding its fine multi-blob spatial
  structure, so achievable island count is capped by plate count (≤40), not by fragmentation's
  frequency. Archipelago (continentality 0.15, fragmentation 0.90) still concentrates most of its
  (now correctly small) land total in one dominant landmass rather than many similarly-sized
  islands. A real fix needs per-cell `continentalField` blending into the height formula's
  plate-base signal (or an equivalent), which risks brushing invariant 8's height-formula
  restriction — left as a candidate follow-up, not attempted here.
- **Tests**: 7 new smoke assertions (`R.v125` in `tests/perf/smoke_gen1.js`) — per-archetype land-
  fraction sane bounds (Volcanic/Archipelago below a threshold, Supercontinent above), cross-
  archetype land-fraction ordering (Volcanic < Archipelago < Earth-like < Supercontinent), land
  fraction tracks continentality within a wide band for every archetype, and the `#sea` slider DOM
  reflects the auto-derived `state.seaLevel` (not left stale).

### Asset scatter rules (v1.26)

Owner request: a "Nortantis-style raster asset scattering system". **Audit first — three of the
five requested items already existed**: `drawMapIcons` already drew raster pack sprites
(`ctx.drawImage(v.bmp,…)` via bottom-anchored `spriteDrawRect`, vector glyphs only a *fallback*),
already Y-sorted, already picked random variants; `placeMapIcons` already did spacing-rejection
placement; `_carPopulateIconGallery` already drew pack bitmaps, not SVG; pack import already
auto-assigned art to `PACK_ICON_SLOTS` via the manifest. The real gap was **per-asset control** —
the biome→asset mapping was hard-coded in `placeMapIcons`, so behaviour was fixed by which frozen
slot an asset occupied and nothing outside that list could scatter. Three design forks were put to
the owner (`AskUserQuestion`): Library-as-source-of-truth bridge, climate `BIOME_KEYS`, open
vocabulary via custom sets.

- **Rule layer (block 1)**: `defaultScatterRule()` / `presetScatterRule(slotKey)` /
  `normalizeScatterRule()` / `scatterRuleKey(slot,setName)` — the last is the ONE place the
  `'mountain'` vs `'custom::<set>::<slot>'` spelling is decided, so scatterer, renderer, brush and
  Library can't drift. `SCATTER_RULE_PRESETS` reproduces v1.25's hard-coded mapping exactly (the
  rule table generalises the old switch; it is not a new look). Rules key off the FROZEN
  `BIOME_INDEX` numbering (ocean 0, `BIOME_KEYS` in order) — deliberately not `CART_BIOMES`, which
  only exists where the user has painted. `assetRules` is a module global (never serialised —
  invariant 6; the authoritative copy lives in `assetlib/library.json`), `_scatterRulesGen` bumps
  on every change and is part of the `_mapIconsCache` key so an inspector edit re-scatters.
- **Scatterer**: `placeMapIconsRuled()` is reached ONLY via a new optional `opts.rules`;
  `placeMapIcons` keeps its v1.25 body verbatim and delegates, so the absence of rules is a
  guaranteed bit-identical fall-through (that guard is why it's a separate function, not
  interleaved branches). `opts.rules` is optional exactly like v1.20's `tempField`/`wetlandMask`,
  preserving the "pure primitive, no globals" contract `tests/test_tail.js` depends on. Two modes:
  **relief** (elevation-ranked candidates, blue-noise `spacing` rejection over one shared bucket
  grid, highest band first ⇒ mountains/hills mutually exclude as before) and **scatter** (jittered
  grid, biome/wetland predicate, density as keep-probability).
- **Renderer**: `placeMapIcons` also returns `items` — ONE Y-sorted list across all categories —
  and `drawMapIcons` walks it. This fixes a real occlusion bug: the old hills→trees→scatter→
  mountains order meant **category, not latitude, decided overlap**, so a mountain always painted
  over a tree standing in front of it. The four legacy arrays are still returned. Vector art moved
  verbatim into slot-keyed `drawIconGlyph()`; `iconVariantsFor()` unifies the flat icon table with
  custom sets; `pickWeightedVariant()` falls through to the exact `pickIconVariant` hash when no
  weights are set (so unweighted picks stay byte-identical).
- **Library→runtime bridge (blocks 3→1)**: the missing link the request didn't account for — block
  3's AssetDB is an *editing* surface that previously only reached the map via a project-zip
  export/re-import, because `drawMapIcons` reads block 1's `assetPack`, written only by
  `loadAssetPack()`. `AssetLibrary.syncToRuntime()` rasterises each item through the same
  `renderToCanvas()` the thumbnails use (canvas doubles as `bmp`; no PNG round-trip) and hands art
  + rules to `applyLibraryAssets()`. Inspector gains a **Procedural scattering** section
  (enable/mode/13-biome grid/min-max size/density/elevation band/wetland-only/per-variant weights)
  on `slot.rules`, rendered only for `famScatters()` families (feature icons + custom; settlement/
  trait/POI are placed by the civ layer from real data, so a density slider would be meaningless).
  `autopopulateScatterRules()` binds imported art on import without clobbering existing rules;
  custom-set assets start **disabled** (no defensible default biome ⇒ don't invent user intent).
- **Density brush (block 1/2)**: `_carIconBrush` + `_carIconBrushStamp()` — dart-throwing with
  blue-noise rejection against both existing and in-stroke icons, never into water, size drawn from
  the asset's OWN rule. Uses `Math.random`, not `hash()`, deliberately: a stroke is an authoring
  action persisted in `state.mapIcons`, so re-painting should add, not deterministically repeat.
  `_featureSprite`/`_customSprite` also honour variant weighting now.
- **Known scope cuts**: no `CART_BIOMES`/`CART_TERRAINS` painted-layer targeting (owner's choice);
  no slope/aspect/coast-distance rule terms (`_umSiteProfile` has them, unexposed); brush has no
  eraser or per-stroke undo; the `icons` hash scenario intentionally diverges from v1.25 (Y-sort
  order only — `field`/`temp`/`rain`/`flow` all identical).

### Scatter-system review fixes (v1.27)

Senior-review pass over v1.26. All six fixes live in code that only executes once scatter rules are
configured, so hash vs v1.26 is ALL IDENTICAL *including* `icons`. Worth reading before touching
`placeMapIconsRuled`, `normalizeScatterRule` or the Library bridge.

- **Predicate semantics**: `requireWetland` and `biomes` are ANDed in BOTH modes. v1.26's scatter
  branch let wetland *replace* the biome test while relief ANDed them, so ticking both in the
  inspector silently dropped the biome selection. Empty `biomes` still means "any land".
- **`normalizeScatterRule` is an untrusted-input boundary** — rules arrive from
  `assetlib/library.json` inside a user-supplied `.zip`. Every numeric field clamps through a local
  `num()`; `enabled`/`requireWetland` coerce to booleans; `elevMax` reorders if below `elevMin`.
  Two concrete v1.26 failure modes this closes: a `NaN` density made `keep >= Math.min(1,NaN)`
  false for every cell (icon on *every* land cell), and a `NaN` spacing collapsed the relief bucket
  grid to one bucket (O(1) neighbour test → O(n²)). **It copies into a fresh object** —
  `Object.assign(base,r)` returns `base`, so `out` and `base` aliased and each `base.<field>`
  fallback read the garbage it was replacing.
- **The bridge owns what it writes**: `syncToRuntime` tracks `_pushedIcons`/`_pushedCustom` and
  sends `dropIcons`/`dropCustom`, so deleting a Library asset retires its runtime art. v1.26
  `continue`d past empty slots and never cleared them, leaving deleted art scattering forever.
  Scoped to keys the Library wrote — imported-pack art it never touched is never collateral damage.
- **Scatter priority is specificity-ordered**, not insertion-ordered (the rule table is built by
  iterating an object, so v1.26's winner depended on the order the user added assets).
- **The brush caps darts per stamp** (`BRUSH_MAX_DARTS`); dart count scales with brush *area* and a
  stamp runs per `pointermove`, so max radius × max density asked for ~15k darts a frame.
- **Comment policy**: stale comments get removed (v1.27 dropped a `TREE_SLOT` header still calling
  sprite packs "a later, optional upgrade"), but historical *rationale* comments stay — notes like
  v0.61's "deliberately NOT an async function" are load-bearing regression prevention, not clutter.

### Dead-slot wiring: ground textures + traits (v1.28)

The v1.26 audit found 35 of the Asset Library's 71 non-custom slots had storage, an inspector card and
an export slot but **no consumer**. All now render. Everything here is inert without pack art, so the
default render is unchanged (hash vs v1.27 ALL IDENTICAL).

- **Biome (15) / Terrain (13) textures → the PAINTED Cartography layers.** `PACK_BIOME_SLOTS` /
  `PACK_TERRAIN_SLOTS` are index-aligned 1:1 with the frozen `CART_BIOMES` / `CART_TERRAINS`
  (invariant 13) — slot N is paint value N+1 — so art can't drift onto the wrong biome. Consumed by
  `_paintedTex()` at `surfaceColor`'s existing paint-tint step: it replaces the flat `CART_*_COLS`
  swatch at the same 0.60 weight and same pipeline position, so hillshade/relief still shows through.
  Wrapped, one texel per grid cell — identical addressing to the splat path's `sp()`.
- **These are TRUE COLOUR and the splat family is not.** Biome/terrain deliberately skip
  `finalizePackTexture`, whose per-channel `inv = 1/mean` makes the splat path render
  `materialColor × texel/mean` — that divides a texture's absolute hue out, so full-colour splat art
  never renders as painted. Storing no `inv` here is what makes the artist's colour land. Keep that
  asymmetry in mind before "unifying" the two paths.
- **`_paintedTex` writes into a shared scratch triple**, not a fresh array — it runs per pixel on the
  main render path. Safe only because `surfaceColor` consumes the biome result before the terrain
  call overwrites it; preserve that ordering.
- **Traits (7)** were dead in three places: the manifest importer handled only `settlement`/`poi`,
  there was no `_traitSprite`, and nothing ever drew traits despite the civ layer's comment claiming
  otherwise. Now `PACK_STRUCT_SLOTS.trait` + `_traitSprite` + `_civDrawTraitBadges` (capped row under
  the pin, glyph fallback, `'below'` labels offset clear). `administrative` was **appended** to
  `CIV_TRAITS` — append-only, since these keys are written into saves.
- **`_assetGen` is required in every render cache key.** `_lodRenderKey()` and the civ bake key had no
  asset-pack term, so pack art (which changes what a cell renders as without touching field/climate/
  paint) only appeared once something unrelated invalidated the key — the same bug class those keys
  already carry v0.86/v0.88 comments about. Bump `_assetGen` from anywhere pack art is installed,
  replaced or cleared.
- **Block 3 needed no changes** — its pack importer and exporter already routed
  `biomes`/`terrains`/`structures.trait` via each family's `section`/`sub`. The engine was the only
  missing half.

### Owner bug batch: rivers, zoom focus, LOD seams, 3D lakes (v1.29)

Eight reported bugs. The heightmap/climate pipeline is untouched — hash vs v1.28 is `field`/`temp`/
`rain`/`flow` **IDENTICAL in every scenario**; `rgba` differs and that delta is *proven* to be only
the river-way overlay (with `state.viz.riverWays=false` on both sides the canvas is byte-identical,
FNV `1404487302`). Three of the eight share one cause shape: a per-tile or per-polyline computation
each neighbour performs on a different, truncated view of the same shared data.

- **`traceRiverPolylines` returns a receiver chain, not a drawable path.** In world mode
  `buildRiverNetwork` wraps receivers (`nx=((nx%W)+W)%W`), so a river crossing the antimeridian has
  consecutive points at x≈W−0.5 then x≈0.5 and one `lineTo` strokes back across the whole map; and the
  walk only stops at ocean (`fld[i]<sea`), so it crosses inland lakes (which pool ABOVE sea level).
  New pure `splitRiverPolylines(polys,W,skip)` cuts a chain wherever the next point isn't reachable by
  a straight stroke. Applied at the RENDER and EXPORT sites only (`drawRiverWays`, GeoJSON) —
  `traceRiverPolylines` itself is deliberately unchanged so `carveRiverValleys` stays bit-identical.
  The lake predicate is not applied to the GeoJSON export: a lake reach is real hydrology.
- **A vector overlay's line width must be damped, not zoom-proportional.** `drawRiverWays` is drawn
  under two camera conventions that carry the zoom factor in opposite places — under LOD coordinates
  are reprojected into canvas px (no CSS scale), off LOD they are grid units and `.canvas-stack` is
  then CSS-scaled by `viewT.scale`. A single `baseW*zk` therefore grew the on-screen stroke 1:1 with
  zoom on BOTH. Now `base·√z` under LOD and `base/√z` off it — one law, on-screen ∝ `base·√z`,
  exactly `base` at zoom 1. Any future overlay width needs the same two-branch treatment.
- **`_lodZoomAt(cx,cy,k)` is the LOD camera's `zoomAt`.** The `if(_lodOn)` wheel/pinch branches used
  to scale `_lodZoom` only, so LOD always zoomed about the camera centre. `_lodCx = gx + regW'·(0.5−fx)`
  where gx is the world point under the cursor taken from the CURRENT `lodViewRect` (so the edge clamp
  is accounted for); at fx=0.5 it collapses to centre-zoom, which is why `lodZoomStep` (the buttons)
  needs no change.
- **The LOD tile seam was `renderBiomeTileRGBA` blurring the sea floor PER TILE.** Read the CHANGELOG
  and HANDOFF notes before touching tile rendering — two plausible theories (geometry registration,
  subpixel compositing) were measured and disproved first. A box blur clamps at the array edge, so
  neighbours smooth the shared boundary from opposite truncated neighbourhoods: identical height data
  in (shared-column MAD exactly 0), different colour out (RGB MAD 6.71 vs 0.3–0.5 interior). Now
  sourced from the world-wide coarse fields the main map already caches — new `sharedSeaFields()` over
  `_seaHCache`/`_seaShadeCache`, sampled at world coordinates like `tempField`. **Rule of thumb: any
  per-tile pass with a spatial neighbourhood (blur, SDF, AO) is a seam unless it is sampled from a
  world-wide field.** The remaining such passes (`aoB`/`crestB`/`coastB`/`riverB`/`biomeBD`) are all
  opt-in and already documented as per-tile decoration. Alongside: `edgeL/edgeR/edgeU/edgeD` replace
  the central-difference index CLAMP at every tile border (which rendered that column at half slope),
  and the tile destination rect is quantised to whole DEVICE pixels. Residue disclosed: the boundary
  still measures ~2× its local neighbourhood, consistent with the shared world column being drawn
  twice; closing that needs a one-pixel tile apron, i.e. a `pyramidTile`/atlas format change.
- **Every LOD camera move must call `scheduleLodRefine()`.** The v1.19 pan joystick and the zoom-reset
  button were the only two that didn't, which is the "correct resolution only renders when the user
  zoomed in/out" half of the report. It is debounced (240 ms, previous timer cleared), so calling it
  every frame of a continuous pan is free and fires once on settle.
- **3D water flattening is two separate problems.** `h < sea ? sea : h` (the GL shader's `hAt` via
  `u_flatSea`, and `drawSoft`'s own) can only ever catch the OCEAN. Inland lakes are handled by a CPU
  pre-pass instead: `_v3dHeightSource()` substitutes `_lakeFill[i]` for `wb[i]===2` cells, so no
  shader change is needed. It returns `field` ITSELF (no copy, no allocation) when flatten-sea or
  Show-lakes-as-water is off — the latter because flattening a lake in 3D while the 2D map paints it
  as terrain would contradict the drape, which takes its colour from that map. Because the flattening
  is baked into the height texture, both toggles must re-upload it (`V3D.uploadHeight()`), not just
  mark the frame dirty.
- **`_civLakeFlooded(x,y,wb)` is the civ layer's "is this really land" test.** The coarse water-body
  raster classifies whole cells, but v1.05 draws lake shorelines SUB-CELL, so a class-0 cell lower
  than the lake next door reads dry at map scale and is under water at zoom. Both `_civSnapLand`
  (placement) and `_civSnapPlacesToLand` (the reconcile pass) apply it.
- **Known scope cuts**: the seam residue above; base ship/terrain speeds and every other v1.23–v1.28
  cut are unchanged; all canvas/GPU/touch behaviour here (joystick, pinch, WebGL drape, the seam
  itself) is under this file's headless carve-out and still wants an on-device pass.

### Settlement suitability: one function (v1.30)

Answering an owner audit question ("are we using all the underlying layers?"). The answer was no, and
there were **two** scoring functions that disagreed — `buildSettlementSuitability` for the debug view/
export/seed list, `_civExtendedSuitability` for what auto-populate actually placed, with different
terms and different seed thresholds. Now one.

- **`buildSettlementSuitability(soil, water, carryingCap, fld, slopeN, W, H, sea, opts)` is the only
  scorer.** The richer terms arrive via `opts.ctx` (waterBodies/flow/riverOrder/coastSDF/resources/
  rain/flood/slope), so it stays a pure primitive — every input an argument — and is still callable
  with the original 8 arguments. **Without `ctx` it is byte-identical to v1.29** (asserted against a
  hand-written copy of the old formula); `currentSettlementSuitability()` always supplies one, so the
  full model is the app default. `SETTLE_SEED_THRESH` is the single advisory threshold.
- **CORE vs OPPORTUNITY is the calibration rule, and getting it wrong is silent.** Core terms exist at
  every land cell (carrying capacity, freshwater, slope, elevation band, soil×rain, buildability) and
  must sum to 1.0 — they set where the sigmoid's 0.5 pivot falls. Opportunity terms (coast, river,
  lake, minerals) are zero for most of the map and are ADDED on top. A first cut redistributed
  everything into one budget summing to 1 and the field collapsed — median 0.314→0.124, seeds above
  0.42 from 102 to ONE — because the average cell was stripped of weight on food and water and given
  weight on a coastline it does not have. Never spend core weight on a term that is usually zero.
- **Flood is a penalty, and it is not "avoid water".** Being near water is rewarded four separate ways
  (freshwater, coast, river, lake). The flood term says "do not build in the channel bottom", which is
  why real settlements sit at the floodplain EDGE. Measured effect on placement: mean floodplain
  exposure 0.617→0.437, share on high-flood ground 58%→28%.
- **`soil` used to be a declared parameter the body never read** — fertility reached the score only
  through carryingCap. It now drives a cropland term, soil × a RAINFALL optimum: deliberately not a
  second temperature bell, since carryingCap is already soil × temp × water, so rainfall is the only
  genuinely new agronomic signal available.
- **Pop density and Site Profile are deliberately NOT inputs.** `currentPopulationDensity()` is derived
  *from* carrying capacity, so feeding it back double-counts. `_umSiteProfile` is per-placed-settlement
  and describes a chosen site; its landform signals reach placement through the shared full-grid
  rasters (`currentSlopeField`/`currentFloodField`) instead.
- **`_civPlaceTrade(p)`** gives a settlement its OWN exports/imports (specialisation → hinterland →
  food surplus), measured against the same world mean `_civFactionAggregates` uses so town and faction
  are on one scale. Faction-level rows stay, labelled as such. Feeds nothing — display only.


### Pre-industrial resource grounding (v1.31)

Owner supplied `docs/research/settlement-resources.md` and asked for the tool to be updated with it.
Six sections are built in. Every change is a new resource key, a new optional `opts.*`, or civ-layer
(block 2) derivation/display, so the terrain pipeline never moves — **hash vs v1.30 is ALL IDENTICAL
in every scenario including `icons`**. Read the reference before touching resource or trade code.

- **Vocabulary 6 → 15, append-only** (invariant 13 — these keys name `.f32` exports and
  `resource_index.json`): lead, silver, clay, buildstone, flint, obsidian, gems, sulfur, alum, each
  keyed on a geological signal the engine already computed. No new pipeline stage.
- **Crustal abundance sets map FOOTPRINT, not magnitude.** `RESOURCE_ABUNDANCE_PPM` →
  `resourceScarcityCut` (log-compressed over the Au→Fe five-decade span onto a 0.02–0.45 land-fraction
  band) → `applyResourceScarcity`, which is **rank-based and can only thin, never invent**. Log not
  linear because the reference is explicit that crustal abundance is the *floor* of scarcity — ore
  bodies are clustered, so map frequency far exceeds crustal share. Applied to the nine NEW keys only;
  `opts.scarcityLegacy` extends it to the original six, which would rewrite every existing world.
- **`_civPlaceSmelting` — iron is gated by FUEL, not ore** (§10.2/§10.3: 6.7 kg charcoal per kg iron,
  ~1000 kg charcoal/ha/yr sustained coppice). Computes both budgets over the catchment and reports the
  binding one. Ore-rich/fuel-poor is a real state with a real trade signature (import charcoal, export
  raw ore) — the documented Elba case, and 2 of 3 iron settlements hit it at seed 12345.
- **`_civPlaceTrade` carries §9's 7-category checklist + §8's archetype + §6 + §7.** Archetype
  thresholds are **relative to the world mean, not absolute** — `rc.mean` is a windowed catchment
  mean, and peak-scale absolute cut-offs against a mean match essentially nothing (a first cut did
  exactly that). §7 tags each export with the reach navigable water actually allows: bulk stays
  `local` without water, luxuries travel regardless.
- **Density varies by subsistence mode (§10.7), total held.** `subsistenceModeAt`/`agrarianDensityKm2`
  replace the flat per-cell `AGRARIAN_MAX_KM2`; `currentAgrarianDensity` then **normalises per world so
  the land-integrated ceiling exactly equals v1.30's** (asserted to 0.1%). The reference's separate
  25–70% realized-vs-theoretical discount is deliberately NOT applied (owner's call) — it is a
  one-line change at that constant.
  - **Do not calibrate this by pinning one band.** A first cut set the scale so annual cultivation at
    K=1 read the old 200/km²; because almost no cell is annual cultivation, the world ceiling
    collapsed 13× and population 8.7×. The bands are relative across land uses and say nothing about
    this engine's K scale — normalise the integral, not a band.
- **Any table indexed by `CIV_RESOURCE_KEYS`/`RESOURCE_KEYS` must be BUILT from it.** Two frozen
  six-key literals survived until v1.31 and both failed silently: `mkResMap` (NaN-poisoned
  `worldMeanResource`, which the trade rule and archetype thresholds divide by) and
  `channelAtlasGroups` (nine fields would have vanished from the channel atlas). The `.f32` export was
  hand-listed too and had been missing **tin** since v0.105. NaN compares false, so none of it threw.
- **Known scope cuts**: §5 (soil from parent rock) duplicates `buildSoilFertility`; §10.5/§10.6
  (labour budgets, storage losses) need a labour model that does not exist; §10.4's seed-to-yield floor
  is defined and exposed but only reported, not wired into food surplus; archetype coverage is thin on
  any one seed since the rarer profiles need the specific geology they name.


### Food-shed population ceiling + one trade rule (v1.33)

Answering an owner audit ("are exports reported the same everywhere; are city populations correct; is
a food deficit automatically assumed importable"). Research: `docs/research/food-logistics.md`. Read it
before touching population or trade code.

- **One trade rule.** `_civResourceTradeBalance(mean, worldMean)` is the ONLY resource export/import
  threshold. The four reporting surfaces (Economy page, faction inspector, City Viewer panel — all via
  `_civFactionAggregates` — plus the settlement inspector via `_civPlaceTrade`) now agree by
  construction. v1.32 fixed the faction copy and left the settlement copy stale, whose comment claimed
  they matched. **Third instance of this shape** (v1.30 two suitability scorers, v1.32 two coastal
  tests): when two functions answer one question they WILL drift.
- **Bulk food barely moves overland.** `_civFoodDeliverable(d,mode) = 2^(−d/D)`, `D` = 160 km land /
  880 river / 8000 sea, from Diocletian's Price Edict ratios (road ≈ 40–56× sea, ≈ 5.5× river) and the
  grain-doubles-per-100-miles rule. This single curve reproduces the ~50 km land supply radius and the
  "cities >100k always sit on navigable water" pattern without special-casing either.
- **`_civFoodShed(p)` = local catchment + HINTERLAND + long-range import.** The hinterland term (the
  countryside integrated overland × `FOOD_MARKETED_FRACTION`) is the one that matters and the one a
  first cut omitted — counting only other settlements' spare surplus crushed every capital to its own
  catchment disc, because farmland between towns belonged to no catchment and fed nobody. A city is fed
  by its countryside; only exceptional cities import bulk grain from distant regions by sea.
- **`_civApplyFoodShedCeilings()` must iterate to a fixed point.** Capping a consumer frees surplus but
  capping a SUPPLIER removes supply someone else counted on; a two-pass version measurably left
  settlements over their sheds. Use `Math.floor` for the cap — `Math.round` can round up past the
  ceiling the pass just computed. It runs after placement AND roads (it reads other settlements'
  populations and needs road connectivity, so inside placement it would be circular).
- **A deficit is not automatically an import.** When nothing in reach can cover it, `food` is actively
  REMOVED from the import list and `foodUnsupported` set — the specialisation branch adds `food` for
  every mining/fishing/garrison town, so merely declining to add it would leave the false claim intact.
- **`FOOD_MARKETED_FRACTION = 0.30` is the one free parameter** and it governs how large cities may
  get. `FOOD_SHED_MIN_POP = 50` is a floor the pass won't cut below, so such a place legitimately sits
  above its shed — sustainability checks must allow for it.
- **Known scope cuts**: no storage/inter-annual buffering, no political extraction (Rome's grain dole
  was state logistics, not a market outcome), no return-cargo economics, roads gate reachability rather
  than discounting cost continuously.


### Hinterland surplus from soil + the 9:1 farmer ratio (v1.34)

Owner asked for farm/hinterland supply computed from range + soil fertility + historical farmer data,
warning explicitly that it must not "feed itself" or balloon populations. Research:
`docs/research/food-logistics.md` §6.

- **The anchor is `FARMERS_PER_URBANITE = 9`** — roughly nine medieval farmers freed enough surplus
  for one non-farming town dweller, ~90% of the population farming. That ratio is what pins
  urbanisation at the observed 10–15%. v1.33's `FOOD_MARKETED_FRACTION = 0.30` had no source and is
  gone.
- **`foodSurplusRatio(soil, refSoil)`** = `(yield − subsistence)/yield`, capped 0.35, yield from soil
  over the observed 470–1000 kg/ha range. **Marginal soil returns zero** — it feeds its own farmers
  and no city. That zero is the main brake on runaway city size; do not soften it.
- **THE CHAIN MUST STAY ACYCLIC**: terrain → carrying capacity → rural population → surplus → urban
  ceiling. Nothing downstream may feed back. Asserted by the three `v1.34 ACYCLIC` smoke checks (own
  population cannot change own supply; growth cannot inflate a neighbour; the pass only ever caps).
  Any future change here must keep those green.
- **Calibrate against the world's MEASURED median soil**, never an assumed 0.5 midpoint. Pinning to
  the yield-range midpoint collapsed urban share 13.8% → 0.86% and floored a capital at 50 with a
  zero food shed. Same self-correcting technique as v1.25's sea-level histogram and v1.31's density
  normalisation — **this is now the third time assuming a distribution has broken a calibration.**
- **Yield scales FROM ZERO.** Using `GRAIN_YIELD_MIN_KG_HA` as a floor gives barren ground a real
  surplus; 470–1000 is the range for land worth cultivating, not for all land.
- **A settlement only gets the SURPLUS of its own catchment**, not the whole ceiling — v1.33 let a
  town be its entire catchment population with nobody farming.
- Strict urbanisation-band verification lives in `tests/perf/probe_foodshed.js` on a freshly generated
  world; the smoke suite's world is too mutated by ~340 prior assertions to measure against.


### Water access must be expressible on the grid (v1.35)

Owner reported harbour towns with sea lanes reading "water access: none". Every settlement in the
reference world did. Three causes, one lesson.

- **A distance threshold below one cell width is unsatisfiable, not strict.** The chamfer DT and the
  river trace both quantise to whole cells, so the smallest non-zero distance is one cell. A
  hardcoded `coastDistKm < 3` against a 3.13 km cell can never fire. **`_umWaterReachKm()` (≥1.5
  cells) is now the floor for every water-adjacency test** — use it, never a bare km literal.
- **v1.32 broke `riverOrder` the same way** by gating it on `_umWaterNearKm()` (~2.1 km). It read 0
  for every settlement in the world, silently disabling navigability, food-shed mode and harbour
  validity. Fixing a too-large radius by making it too small is not a fix.
- **Consult the signals that already exist.** An attached `sea-lane` way is decisive; the route
  generator only draws one between water-reachable places. `_umSiteKindFromTerrain` is the same test
  the town layout is built from — if it says coastal, navigability MUST agree, or the engine draws a
  harbour for a settlement the card calls landlocked. That was the fifth occurrence of two functions
  answering one question.
- **`river` from the flow raster beats the traced polylines.** The raster is the hydrology; traced
  stems are a thinned derivative that can miss a channel.
- **Every verdict carries a `basis` string.** A bare "none" cannot be told from a broken threshold —
  that is precisely why this survived several versions.


### Real-km-aware relief and rivers (v1.60)

Owner: "when choosing a smaller region rivers dont become more visible (i think its a scaling
issue). I cant seem to find any rivers with the branching pattern or length you might expect...
check any and all information on river formation and how simulations/terrain programs
realistically generate them and apply them with proper scaling." Scope decided via
`AskUserQuestion`: fix everything, including the underlying terrain relief, not just the river
threshold. `docs/research/scale-invariant-terrain.md` (new) grounds the fix in Montgomery &
Dietrich (1988/1992) channel initiation and Horton/Strahler/Hack self-similar drainage density —
read it before touching `terrainDetailK`, `riverFlowThresh`, or the crater/volcano radius clamp.

- **Root cause, measured before any code changed.** (1) The relief pipeline
  (`fillWarpRows`/`fillHeteroRows`/`fillHeightRows`) samples fractal noise at a frequency fixed as a
  fraction of grid width, never a real km wavelength — a 50 km region and a 40,000 km world at the
  same resolution produce statistically identical relief (confirmed bit-identical with craters/
  volcanoes disabled). (2) Craters/volcanoes are the one place real km IS used (`radKm/cellKm`), and
  it had only floor clamps — measured largest crater radius reaching **2.8× the entire grid width**
  at a 50 km region. (3) The channel-initiation threshold (`GW*GH*0.0004`) is likewise a pure
  grid-cell fraction, independently reimplemented at ~18 call sites, ungrounded in any real km².
- **`terrainDetailK(gw,mapWidthKm)`** is the central mechanism — a one-sided
  `Math.min(16,Math.max(1,REF_CELLKM/cellKm))` anchored at `REF_CELLKM=800/2048`, the app's own
  literal untouched default (true for both Region and World mode). The same anchor-at-the-default,
  one-sided-clamp discipline `_V3D_RATIO0` (v0.67) already established for 3D exaggeration, now
  applied to relief-*generation* frequency: `heightParams().nf=5.0*terrainDetailK(...)` and
  `heteroParams().hf=1.5*terrainDetailK(...)`. `k===1` exactly at/above the reference cell size
  (world scale, or any region ≥800 km at ≤2048 resolution — the overwhelmingly common case), so both
  frequencies are bit-identical to v1.59 there. Warp frequency and `state.tect.blurR` are
  deliberately left grid-relative — disclosed scope cuts, not silent omissions.
- **`clampFeatureRadiusCells(radCells,gw,gh)`** caps a single crater/volcano at
  `FEATURE_RADIUS_MAX_FRAC=0.12` of the shorter grid axis — a universal correctness fix, not
  scale-gated (a crater covering the whole map is wrong at any resolution), so it can occasionally
  bind even at the literal default scale.
- **`riverFlowThresh(gw,gh) = gw*gh*0.0004/terrainDetailK(GW,state.mapWidthKm)`** consolidates ~18
  independent inline recomputations into one canonical function (the umpteenth instance of this
  file's own "two functions answering one question WILL drift" lesson) AND divides by the same
  `terrainDetailK` that raised the noise frequency. The division was added only after measurement
  showed it was needed: Stage B alone made a 50 km region's drainage network measurably *sparser*
  (channel cells 4233→3345, max Strahler order 4→3) — finer relief fragments the long contiguous
  downhill runs flow accumulation needs. Dividing by `terrainDetailK` recovered it (channel cells
  →**6001**, +42%; polylines 718→**1497**, +109%) while keeping the identical bit-identity guarantee
  at reference scale. The divisor always reads the world's own `GW`/`state.mapWidthKm` rather than
  the `gw`/`gh` passed in, so an LOD tile's own smaller grid still gets the world's real detail
  level, not a tile-local mis-estimate.
- **Bit-identity, disclosed precisely.** The standard `hash_gen1.js` battery shows a mismatch vs
  v1.59 at every scenario — this is the crater/volcano clamp alone (not scale-gated by design, and
  can fire at any resolution depending on the random roll, including the literal default). An
  isolated A/B with craters/volcanoes disabled proves `terrainDetailK`'s mechanism is bit-identical
  to v1.59 at the reference scale, exactly as designed. A deliberate, measured re-baseline — the
  same class as v1.36/v1.39/v1.46's placement fixes.
- **Two smoke assertions needed new fixtures, not new logic**, both root-caused to the crater/
  volcano clamp reshaping a specific hardcoded seed's terrain/geology: the v0.94 routing-fix
  regression's two coordinate pairs (re-found via the same independent-probe methodology against
  the current terrain) and the v1.31 §10.3 fuel-limited-settlement check (isolated onto its own
  dedicated fresh world inside a save/restore block, matching the v1.46/v1.58 test-isolation
  precedent, instead of depending on whatever world ~40 assertions of shared ambient state happened
  to leave behind).
- **Known scope cuts**: warp frequency and `state.tect.blurR` stay grid-relative (only the noise
  that actually shapes ridges/valleys/drainage divides changed); erosion kernels, coastal/glacial
  passes, `carveRiverValleys`, and fjord masking were all audited and confirmed already
  resolution-relative with no real-km dependence, so none needed changes; `TERRAIN_DETAIL_MAX_K=16`
  and `FEATURE_RADIUS_MAX_FRAC=0.12` are reasoned starting values confirmed against measurement, not
  independently historically calibrated.

### Civilization menu reorder: faction creation leads into world generation (v1.59)

Owner: "completely redesign and rethink the civilisation menu's under generate and make it a
bottom up system that populates on the map as it does at the moment... Refactor and Consolidate
the Generation → Civilization menu from the ground up putting the menu's in a logical order of
faction creation that leads up to the autopopulate (auto routes and settlements) function." Pure
civ-layer (block 2) HTML/DOM reorganization — no engine/UME change, no new mechanics; every id,
JS function, and handler is unchanged, only physical placement/grouping/labels moved. Hash vs
v1.58 ALL IDENTICAL. 1001 / 852 green.

- **`#civSubBar` reordered**: Generation moves from last to 2nd, right after Factions — **Factions
  → Generation → Settlements → Economy → Statistics** (was Factions → Settlements → Economy →
  Statistics → Generation, v1.55's ordering). v1.55 got faction *browsing* first but left the
  world-gen trigger buttons (Auto-populate/Generate Roads/Recalculate Territories) dead last,
  behind three post-generation report pages that read empty until Auto-populate has run. Factions
  stays the default landing tab. The tab click handler keys its `pages` map by `dataset.civsub`
  string, not DOM position, so the reorder needed **zero JS changes** — grep-confirmed no
  positional (`nth-child`/`children[n]`) indexing touches `#civSubBar`/`#civSubGeneration`
  anywhere in the file.
- **`#civSubGeneration` restructured into an explicit Step 1→2→3 sequence** (populate → connect →
  formalize control), replacing the old three `.sec` blocks + one catch-all "Advanced" `<details>`
  (a grab-bag that existed, per its own v1.16 comment, only because those controls "had no named
  slot" — never a deliberate grouping): **Step 1 · Populate settlements** (unchanged) → **Step 2 ·
  Generate roads** (moved up from after Territories — confirmed safe: `_civAutoRoutes()` never
  reads faction/territory state, `_civAutoPolity()` never reads `civWays`/journeys, so the reorder
  is purely narrative) → **Ways** (promoted out of Advanced, always-visible, directly under Step 2
  since `#civWayList` is that step's own output) → **Step 3 · Recalculate territories** →
  **Provinces** (promoted out of Advanced, stays after Step 3 on purpose — `_civGenerateProvinces()`
  bails empty until `civTerritory` is populated) → **Display** (the four map-styling sliders, now
  in their own collapsed accordion instead of sharing one with Provinces/Ways, which have nothing
  to do with each other besides also lacking a slot).
- **The Territory-paint brush radius (`civTerRadius`) moved out of Generation entirely** — it's a
  tool-brush parameter (`_civPaintTerritoryAt` reads the global `_civTerRadius`), not a generation
  setting. New contextual row `#civTerritoryToolRow`, inserted between `#civPoiTypeRow` and
  `#civWayDrawRow`, mirroring `civPoiTypeRow`'s own `_civSetTool`-driven `display:none`/`''`
  toggle idiom exactly (shown only while the Territory tool is armed). The pre-existing
  `civTerRadius`/`civTerRadiusV` input-listener wiring needed zero changes — `getElementById`-
  driven, doesn't care where the element lives in the DOM.
- **Tests**: 8 new smoke assertions (`R.v159`) — real DOM tab order; Generation's internal section
  order via a real tab click (Step 1→2→Ways→Step 3→Provinces→Display, Roads before Territories);
  `civTerRadius` relocated into `civTerritoryToolRow` and out of `#civSubGeneration`; a real
  click-path arming the Territory tool reveals the row and marks the button `.on`; the slider
  wiring survives the move; the old Advanced grab-bag is genuinely gone (`civWayList`/
  `civProvincesChk` no longer inside any `<details>`).
- **Known scope cuts**: none — pure reorganization of existing, working controls.

### Political fragmentation on a single landmass (v1.58)

Owner, on the v1.57 scope cut: "if there is only 1 continent it should lead to a division of the
continent, based on geography and industrial prowess (or at least do some research but I think
those are easy denominators to use)." `docs/research/political-fragmentation.md` (new) grounds it —
most of history's large landmasses hosted several simultaneous polities, split along exactly those
two axes (mountains/rivers/distance raising unification cost; an independent polity needing a
resource base large enough to support itself). Civ-layer only — no engine/UME change. Hash vs
v1.57 ALL IDENTICAL. 1001 / 852 green; 508 smoke green.

- **Root cause**: `_civIterativeAutoWorld` gave every candidate on a landmass the SAME faction id
  (`contFaction`, cycling per connected component), so any faction id past the landmass count got
  zero settlements — worst case a single continent where only faction 1 ever got anything (the
  owner-reported 27/2/0/0/0/0 split). True for any landmass count, not just one — a 1-continent
  world is the extreme case, not a special one.
- **`_civAssignLandmassFactions(candidates)` (new)**: `factionCount − L` spare faction ids (L =
  landmasses with candidates, only nonzero when there's real unused capacity) are apportioned by
  **highest-averages** (the Jefferson/Webster family of real seat-apportionment method) weighted by
  each landmass's summed settlement suitability — already the file's own unified geography+resource
  signal (v1.30's "one function" rule), reused as the "industrial prowess" denominator rather than
  re-derived. Extra seats become extra capitals, seeded by suitability + blue-noise spacing (v1.26's
  scatter idiom) so a rival capital is both economically strong and far enough from an existing one
  to be genuinely separate. Every other candidate joins its nearest capital.
- **The geography-respecting BORDER needs zero new code** — `_civAutoPolity` ("Recalculate
  Territories") already floods outward from every settlement's own faction through
  `buildTravelCost` (slope-squared cost), so two rival capitals on opposite sides of a mountain
  range naturally meet and settle near the ridge once territory is painted.
- **Byte-identical whenever `factionCount<=L`** (today's ordinary multi-continent case) — the
  apportionment loop only ever hands out ids the old cycling left unused; a landmass's PRIMARY id
  is assigned in the exact same order as before. A strict generalisation, not a special case.
  Measured on a real world (seed 12345, 6 factions, 2 landmasses): 27/2/0/0/0/0 (2 factions) →
  6/2/16/14/2/6 (all 6, 5 capitals spread proportional to each landmass's capacity).
- **A pre-existing v1.46 smoke assertion needed to become statistically honest.** It compared the
  coastal-preference pass ON vs OFF by independently re-running the whole stochastic multi-pass
  pipeline twice per seed across a fixed 3-seed sample — already riding cross-run RNG-cascade
  noise (the swap's settlement moves reshape the road network the downstream centrality-driven
  promote/demote passes read). v1.58 widens achievable capital count per landmass (1 → up to
  `factionCount`), which widens that pre-existing cascade enough to occasionally flip one seed —
  not the swap logic failing (it can only ever ADD port traits within one run). Widened to 8 seeds,
  changed to an aggregate "never net-worse across the sample" comparison — the same "small fixed
  sample is fragile to noise" lesson v1.56 already learned about this exact pipeline. `CIV_FACTIONS`
  also pinned for the test's duration (the v1.24 BUG-3 test-isolation pattern), since faction count
  now genuinely affects placement where it didn't before.
- **Known scope cut**: territory PAINTING is untouched — a world that skips "Recalculate
  Territories" after auto-populate shows the new faction split in the settlement list but not the
  map's territory-fill colouring, the same pre-existing two-button workflow as always.

### Factions pop-up + one editing surface per faction field (v1.57)

Owner, immediately after reviewing v1.55: "I'd also very much love it to be in a pop-up menu." The
same review had already surfaced, by inspection, a second defect: Government/Culture/Religion/Ag.
technology were editable in TWO places — an inline `<select>` per field in the v0.62/v1.07/v1.10/
v1.16/v1.54 quick-select pill row, AND the v1.55/v1.54 Faction Inspector drawer's own fields for the
same four values, with no sync between the two beyond both writing the same underlying array. Both
fixed in one pass, since the pop-up restructuring touched the same HTML region. Civ-layer (block 2)
only — no engine/UME change. Hash vs v1.56 ALL IDENTICAL. 1001 / 852 green.

- **`#civFactionsModal`** — same shell contract as `#cityViewerModal` (v1.18) / `#routeEditorModal`
  (v1.44): fixed-inset overlay, `display:none` until `.open`, own Escape handler, a `_cfmOpen`
  presence flag other guard sites check the same way `_cvCam`/`_reOpen` already do, added to
  `_overCanvasOverlay`'s scroll-fix list and `_sculptNavSync`'s joystick gate (z-index 72, after the
  City Viewer's 70 and Route Editor's 71). `_civOpenFactionsModal()`/`_civCloseFactionsModal()`
  refresh the overview/roster/inspector on every open, not just on Factions-tab entry — the same
  discipline `_civOpenRouteEditor`/`_civOpenCityViewer` already use, so content edited elsewhere
  (a settlement reassigned to a different faction from the map) is never stale on reopen.
- **What moved vs. what stayed.** World overview, the "All factions" roster, and the v1.55 detail
  drawer (unchanged slide-in-from-the-left, just re-scoped from the old sidebar `#civFactionsWrap`
  to the pop-up's own `#civFactionsStage`) moved into the modal. The quick-select pills stayed in
  the sidebar — they drive `_civActiveFaction` for the Territory-paint/Drop-settlement map tools,
  which needs the canvas visible, not covered by a pop-up. `_civRefreshActiveSubPage()`'s factions
  branch now closes the pop-up (not just the drawer inside it) on every tab re-entry — the v1.55
  "always land back on the simplified overview" rule extended one level up.
- **The dedup fix**: `_civBuildFactionPicker()` no longer builds the four per-pill selects — the
  pills' job is picking `_civActiveFaction`; editing a faction's attributes is the Inspector's job,
  reached via the pop-up, so each of those four fields has exactly one editing surface.
  Double-click-to-rename stays on the pill (a genuine map-authoring action, unlike the other four
  fields, and it writes the identical `civFactionNames` array the Inspector's own Name field does).
- **Two existing regression assertions tested the removed selects directly** (v1.07's `pickerSelects
  >= 6`, v1.10's `religionSelects >= 6`, both counted inside `#civFactionPicker`) — rewritten, not
  deleted: they now assert zero selects on the pill plus the Inspector's own selects (opened via the
  real `_civOpenFactionsModal()`/`_civRenderFactionInspector()` path) still list every culture/
  religion entry and still round-trip through sync.
- **Known scope cut, tracked in HANDOFF, NOT fixed this pass**: auto-populate assigns one faction
  per LANDMASS (`contFaction`, keyed on `contId`), not per settlement — found during the same
  review, reproduces identically on v1.54 (pre-dates this session), and reads as "settlements
  cluster onto one faction" on a world with few large landmasses. A placement-algorithm change, not
  a UI change.

### Water-constraint softening (v1.56)

Owner: "for water now it quickly gives a hard constraint. Whilst in reality people often drank from
streams/rivers/other smaller stops along a route — aside from literally carrying their own water
sources. Suggest an adjustment to reflect this instead of the hard warning." Researched, measured,
and presented as a two-part plan in the prior session; this session builds it after approval.
`docs/research/water-access-travel.md` (new). Hash vs v1.55 ALL IDENTICAL. 1001 / 852 / 496 green.

- **Root cause: `_jpStageDryKm` (the Journey Planner's "is there freshwater in reach" test) reused
  `flowThresh=GW*GH*0.0004`, the SAME constant used file-wide to decide whether a cell renders as
  part of the mapped river network.** That constant is not merely a rendering cutoff: at the
  default river-density, `buildRiverNetwork`'s own `channelThreshold(thresh,slopeN,1)` reduces to
  `thresh` exactly, independent of slope — so `flowThresh` IS the engine's own order-1
  channel-initiation bar. A travelling party historically needed a spring or minor stream, not a
  mapped river; the planner was conflating "renders on the map" with "a party can find a drink."
- **`JP_DRINKING_FLOW_DIVISOR=16`**, applied ONLY inside `_jpStageDryKm` (`drinkThresh =
  flowThresh/16`), grounded two ways: (1) Horton's laws (bifurcation ratio Rb≈3-5, already cited
  in `docs/research/natural-rivers.md` for the Min-stream-order slider) put a channel two Strahler
  orders below `flowThresh` at roughly Rb²≈9-36× less flow; (2) new `tests/perf/probe_water_gap.js`
  (samples 60 straight-line routes on a real generated world) measured the practical effect
  directly — 59/60 routes read "dry" at the old threshold (mean 74 km gap), 28/60 at ÷16 (mean
  12.4 km), squarely inside the theoretical band. `buildRiverNetwork`, the rendered river network,
  and every other `flowThresh` consumer are untouched, so `generate()`/`render()` stay
  bit-identical — this is a Journey-Planner-only (civ-layer) change.
- **The auto water-crossing tier (`JP_DESERT_WATER`/`_jpDesertTierForGap`) was gated on
  `isDesert`**, so a non-desert biome with a genuinely long dry stretch got only a flat,
  ungraduated 1.1× reserve and no speed adjustment at any severity — the same treatment for a
  half-day gap and a week-long one. The gate is removed for the **auto** path only (a measured-gap
  tier now resolves for any biome); the **explicit override dropdown stays desert-only**, since its
  labels ("Dense Oasis Route") are desert-narrative and the control is only ever shown once a
  journey includes a desert stage. The formula trace's "desert route" line is renamed "water
  crossing" and now prints whenever a tier resolved, any biome — not just when `isDesert`.
- **Net effect**: most routes now measure a short gap and get the "Dense Oasis"-tier treatment
  (1.10× reserve, a small speed *bonus*) instead of ever approaching `jpAssessResupply`'s hard "no
  party size fixes this" block — untouched, and still correct for a genuinely week-long waterless
  crossing, desert or otherwise.
- **A pre-existing v1.51 smoke assertion had to be made deterministic, not just re-passed.** It
  proved "the gap is measured from real hydrology, not a constant" by picking one arbitrary
  straight-line test route through the ambient (by-then ~500-assertions-mutated) smoke-suite world
  and relying on it to happen to show a dry stretch under the OLD, over-strict threshold — which
  this fix's own intended effect (far fewer routes read as dry at all) broke by design, not by
  accident. Replaced with a controlled synthetic-`flowField` scenario (one pass with no water
  anywhere near the route, one pass with abundant water along it) that proves the same claim with
  certainty instead of by chance.
- **Known scope cuts**: `jpAssessResupply`'s hard-block threshold/wording is untouched (fires less
  often, isn't loosened); sea/river water rules (`_jpAutoStageVessel`, `jpCalcWater`) are untouched
  — a land-stage-only change; the divisor is a reasoned mid-value in a theoretically- and
  empirically-grounded 9–36 band, not independently calibrated against a historical drainage-density
  figure for this engine's specific grid resolution.

### Faction-first Civilization menu (v1.55)

Owner: "I like the new civilization menu, implement it please in a logical fashion, maybe make it
scroll into the screen from the left. Only showing a simplified version at first (that for examples
only shows a global overview)" — approving and requesting real implementation of a faction-first
mockup/proposal from the prior session, which also delivered an audit finding: `CIV_CULTURES`
(highland/desert/riverlands/sylvan/maritime/common/imperial) has **zero mechanical effect on
settlement placement or faction territory** — naming-flavor only (feeds `_civSettleName`'s syllable
pool and a "plumbing only" UME `opts.culture` passthrough). Civ-layer (block 2) UI + one
`_civFactionAggregates()` extension; no engine/UME changes. Hash vs v1.54 ALL IDENTICAL. 1001 / 852 /
488 green.

- **Faction-first ordering.** `#civSubBar` reordered Factions→Settlements→Economy→Statistics→
  Generation (was Generation-first); `_civSubTab` now defaults to `'factions'` (was `'generation'`)
  — factions drive settlement sizing (ag. technology, v1.54) and territory, so they're the entry
  point, while Generation (one-off world-gen trigger buttons: Auto-populate/Recalculate Territories/
  Generate Roads) moves last.
- **Overview-first, drawer-on-demand.** `#civSubFactions` restructured into `#civFactionsWrap`
  (`position:relative;overflow:hidden`) holding two layers: an always-in-flow **global overview**
  (`#civFactionsOverview` — a new world-summary line via `_civRenderFactionsWorldOverview()`, the
  existing quick-select pills, and a richer roster list showing government/ag.-tech/population per
  faction) and a **detail drawer** (`#civFactionDrawer`, `.civ-drawer`) that slides in **from the
  left** over the overview when a roster row is clicked — the exact `transform:translateX(...);
  transition:transform .22s ease` idiom the mobile `<aside>` slide-in panel already uses (v0.80),
  mirrored to the opposite edge and scoped to this sub-page's own wrapper instead of the viewport.
  `_civOpenFactionDrawer()`/`_civCloseFactionDrawer()` toggle the `.open` class only — visibility
  never lives in `display:none/''` on the inspector host, so the slide has something to animate. A
  `← Back to overview` button (`.su-back`, the same textual convention the setup-gate's own back
  buttons use) closes it. `_civRefreshActiveSubPage()` closes the drawer on **every** entry into the
  Factions tab (not just the first ever visit), so switching away and back always lands on the
  simplified overview first, never mid-drill-down — the literal reading of "only showing a
  simplified version at first."
- **Territory Fit** (new, in the faction drawer): surfaces the prior session's audit finding
  honestly instead of quietly leaving it unaddressed. `_civFactionAggregates()`'s existing single
  `O(GW·GH)` pass (never a second full-grid scan — this function's own header rule) now also
  accumulates a per-faction terrain-mix — river/coastal/arid/forest/hills cell fractions of a
  faction's own territory — reusing `buildBiomeRaster()` (arid = desert+savanna+tropDry; forest =
  conifer+tempForest+tempRain+tropWet), the file-wide `flowThresh=GW*GH*0.0004` river-significance
  convention, `_civOceanDistField()`'s cached chamfer DT (oceanOnly, matching `_civIsCoastal`'s own
  convention) floored at 1.5 cells per the v1.35 "a sub-cell distance threshold is unsatisfiable, not
  strict" rule, and `_civPlaceDefensibility`'s existing mild-upland relative-elevation threshold
  (`r>0.35`) for "hills," since no dedicated biome key exists for it — plus a matching world-mean
  twin (`worldMeanTerrain`), same shape as the existing `worldMeanResource`.
  `_civCultureTerrainFit(cultureKey, terrainMix, worldMeanTerrain)` compares the five terrain-themed
  cultures against the WORLD mean (never an absolute cut — the same relative-margin discipline
  v1.30/v1.32/v1.37/v1.46 already established for this exact "compare to a fixed number vs. the
  world mean" mistake) and returns a match/typical/mismatch verdict; `common`/`imperial` are
  identity-flavored, not terrain-themed, so they get composition-only, **never a fabricated
  verdict** — the same "a verdict with no real signal behind it is worse than none" discipline as
  v1.35's `basis` field.
- **Pre-world guard, found during verification, not by inspection.** Making Factions the default
  tab surfaced a latent bug: `generate()`'s own wrapper calls `_civRenderPlaceEditor()` — which
  reaches `_civFactionAggregates()` via `_civRefreshActiveSubPage()` whenever the Factions tab is
  active — **before** the real `generate()` body runs, on every single (re)generate. Previously this
  branch was unreachable unless a user had manually opened Factions and then hit Regenerate;
  defaulting to Factions makes it run unconditionally, and it crashed inside `currentLithology()`'s
  `plateCrust()` (`plates[plateId[i]].base` on an empty `plates` array) — a real throw inside
  `generate()`, against invariant 12 ("generate() completes synchronously," which this file has
  always read as "never throws" too). Root-caused to the exact `plates=[]` / `field[]`-already-
  allocated-but-zeroed pre-tectonic-substrate state the file's own v0.106 tectonic-inversion comment
  already documents for imported DEMs. Fixed with an explicit `plates.length` guard at the top of
  `_civFactionAggregates()` returning a safe all-zero shape (deliberately not cached into
  `_civAgg`/`_civAggKey`, so the very next call after a real world exists falls through normally).
- **Tests**: 9 new smoke assertions (`R.v155`) — Factions is the default/first sub-tab (checked via
  the real click-handler path, not by reading ambient `_civSubTab` state left over from earlier
  blocks in the same long sequential smoke run); the drawer carries the slide-in class and starts
  closed; a row click opens it and Back closes it; re-clicking the Factions tab button always resets
  to the overview even with a faction still selected; the overview renders real content;
  `_civFactionAggregates()` exposes `terrainMix`/`worldMeanTerrain` with fractions in `[0,1]`;
  `common`/`imperial` get no fabricated Territory Fit verdict while riverlands gets a real one; the
  pre-world guard never throws and returns a safe zeroed shape when `plates` is emptied to simulate
  the pre-generate() state.
- **Known scope cuts**: Territory Fit is read-only (no placement bias added — a much larger,
  separate change the owner hasn't asked for); the roster row's summary line doesn't show Territory
  Fit at a glance (drawer-only); Settlements/Economy/Statistics sub-pages are unchanged (only their
  tab position moved).

### Agricultural technology as a per-faction axis (v1.54)

Owner: the flat 9:1 farmer:urbanite ratio "doesn't sit against a civilisation having mastered the
plow and sitting roughly at a level of industrial production, even so barely" — research requested
into how agricultural productivity actually scales, and how to wire it into auto-populate.
`docs/research/agricultural-productivity.md` (new) grounds the feature in the England agricultural-
labour-share series (Broadberry & Gardner 2013; CAMPOP): 9:1/~90% farming is a **pre-improvement**
baseline, not "mastered the plow" — by the time a society genuinely masters rotation/drainage/
selective breeding (England ~1700-1760) the ratio had already fallen to ~1:1; "barely industrial"
(steam threshing, first chemical fertilizer, England ~1800, pre-mass-import) sat at ~0.54:1. Hash
vs v1.53 ALL IDENTICAL. 1001 / 852 / 479 green.

- **Scope decided with the owner via `AskUserQuestion` before building**: per-faction (not one
  world-level setting), live-editable in the Faction Inspector (not setup-gate-only), re-read every
  `_civFoodShed` call rather than requiring a re-populate.
- **`AG_TECH_LEVELS`** (6 named rungs, Subsistence → Industrial, each carrying a `farmersPerUrbanite`
  calibrated from the research doc) + **`civFactionAgTech`** — a new per-faction parallel array,
  same convention as `civFactionCulture`/`civFactionReligion`/`civFactionGovernment` (append-only
  default, old-save-compatible rebuild-on-load, save-format field) — but unlike those three, this is
  explicitly **not pure flavor**: it's read by `foodSurplusRatio()`, disclosed as such everywhere.
- **`foodSurplusRatio(soil, refSoil, farmersPerUrbanite)`** gained a third argument, and fixing it
  properly surfaced two real formula bugs that only mattered once R (farmers per urbanite) could
  drop below ~2 — which the fixed 9:1 constant never did:
  1. **`1/R` is the wrong formula; `1/(R+1)` is.** Population balance (R farmers + 1 urbanite,
     uniform per-capita consumption, R yields must cover R+1 people) gives surplus fraction
     `1/(R+1)`, not `1/R`. The shipped `1/9≈0.1111` (vs. the derived `1/10=0.1`) was never wrong
     enough to notice at a fixed R=9, but `1/R` blows past 100% below R=2. **Pinned exactly** at the
     historical `FOOD_BASE_SURPLUS_RATIO` constant when `farmersPerUrbanite===FARMERS_PER_URBANITE`
     (every existing world's numbers untouched to the bit, asserted); corrected formula everywhere
     else.
  2. **`FOOD_SURPLUS_RATIO_MAX=0.35` is a pre-industrial ceiling, not a soil-quality ceiling —
     using it unscaled silently neutralised this entire feature, caught only by measuring a real
     settlement before shipping.** Early Industrial's/Industrial's own BASELINE (0.69/0.87 at
     median soil) already exceeds 0.35, so every cell at or above median saturated at the same flat
     cap as Traditional Agrarian's best-soil case — first measurement showed an "industrial"
     faction's food shed only ~0.5% bigger than a traditional one's, not the order-of-magnitude
     difference the ratio implies. Fixed: the cap now scales with the rung's own base ratio
     (`FOOD_RICH_SOIL_MULT≈3.15`, preserving the original best-soil-vs-median relationship), clamped
     at a new `FOOD_SURPLUS_RATIO_ABS_MAX=0.95`. Re-measured: Early Industrial now gives a real
     settlement **2.66×** Traditional Agrarian's food-shed capacity.
- **`_civFoodShed(p)`** resolves `_civFarmersPerUrbanite(p.faction)` once and threads it through all
  three `foodSurplusRatio` call sites — own-cell local capacity, the hinterland integral (both using
  `p`'s own faction — a settlement's immediate countryside is, in practice, its own territory, so a
  per-cell territory-raster lookup in that hot loop would be needless complexity for the same
  answer), and an exporting settlement `q`'s spare capacity (using `q.faction`, since a supplier's
  surplus depends on ITS OWN farmers, not the consumer's).
- **Deliberately does not touch yield-per-hectare, soil, or carrying capacity** — "one lever is
  enough" (research doc §4): `_civPlaceCatchmentCeiling` already represents the land's total food-
  output capacity in population-equivalent terms (calibrated against real historical density, itself
  a predominantly-agrarian mix); the tech-level ratio governs what SHARE of that fixed capacity must
  stay agricultural versus can be urban — exactly the real "agricultural labour share" metric this
  is calibrated from. Disclosed scope cut: no total-population-growth-from-industrialisation effect
  (better nutrition/medicine, urban migration pulls) — would need to touch the carrying-capacity
  chain, deliberately left alone this pass.
- **UI**: "Ag. technology" `<select>` in the Faction Inspector (`_civPopulateFactionEditor`,
  alongside Government/Culture/Religion, with a live hint line) + a matching compact dropdown in
  `_civBuildFactionPicker`'s per-faction pill row — same two-surfaces convention those three fields
  already use.
- **Known scope cuts**: no total-population-ceiling growth from industrialisation (see above); six
  discrete rungs, not a continuous slider (matches the World Structure archetype convention); the
  exact `farmersPerUrbanite` values are England-specific historical anchors — an illustrative curve,
  not a claim every fantasy world's agricultural history must mirror England's (the research doc
  also explains why later 19th-century England figures, confounded by grain imports, were NOT used
  to anchor the Industrial rung).

### Route drawing prioritizes existing infrastructure; a named per-stage transport advisory (v1.53)

Owner audit: "when a route has been selected each stage of the route has its own optimal
transportation method? And then when a route can use an existing way it prioritises the existing
way? (...two settlements with ports, a small strip of land in between won't get counted into the
route, but the connecting sea-way gets followed)." Travel times re-checked first (`probe_travel.js`
— clean, unchanged from v1.52). Both other claims were measured against a real generated+auto-
populated world (Playwright `page.evaluate`, this file's established audit discipline) before any
code changed. Hash vs v1.52 **ALL IDENTICAL** — `_civDijkstraPath`/`_civJoinDijkstraSegs` are only
reached from `_civCommitRoute`/`_civCommitWay`/`_jpRerouteForMode`, all explicit user actions never
called from `generate()` or auto-populate.

- **The "ride existing infrastructure" discount already existed and was dead code for the one mode
  that matters.** `_civDijkstraPath` has carried a comment since v0.6 claiming a route "follows the
  way instead of plotting its own direct line" via a land-way ×0.25 discount and a sea-lane
  `Math.min(cost,1.0)` cap. The land half works. The sea half doesn't: `_civCommitRoute` (the
  general Route tool) always pathfinds in `'mixed'` mode, where open water already costs
  `_CIV_SEA_COST=0.6` — strictly BELOW the 1.0 cap, so the cap never changed anything there (it only
  ever helped `'land'` mode, where water starts at Infinity and 1.0 makes it a ferry crossing).
  Measured on a real world: two port settlements with an existing 604 km sea lane between them
  instead drew a fresh 790 km route that was **97% overland** — the lane lost by ~3.5% of total
  path cost purely because it got zero infrastructure credit. Fixed to a real multiplicative
  discount (`cost[i]=isFinite(cost[i])?cost[i]*0.25:1.0`, symmetric with the land-way term, keeping
  `'land'` mode's Infinity→finite behaviour via the same ternary). Re-measured: the same route now
  follows the lane (601 km, 97% water, up from 3% before); two other candidate pairs improved from
  2%/13% geometric overlap with the existing way to 27%/42%. **Fourth time in this file a cost-grid
  "preference" used a `Math.min(cost,cap)` against a baseline already below the cap** — default to a
  multiplicative discount, not a capped min, unless a hard floor is genuinely the intent.
- **Per-stage land transport: the UI's own hint text overclaimed.** It said "Travel mode is picked
  per stage from its own terrain" — true for water stages (`_jpAutoStageVessel` substitutes on a
  blocked stage) but false for land: `_jpEffectiveStagePlan` plain-inherits `plan.transport`,
  confirmed by a synthetic Hills/Open-Plains route staying "Walking" on every stage with zero
  variation. Not an oversight — `_jpPlan`'s own comment already documents a silent per-stage
  land-transport swap being tried and explicitly rejected ("a larger party appearing to travel
  FASTER once one stage silently swapped Baggage Train for Walking mid-route"). The fix respects
  that decision rather than reversing it: `_jpBestLandTransportForStage(st,eff)` computes which
  `JP_LAND_TRANSPORTS` mode is fastest for one stage's own terrain (same equipment counts — "same
  gear, different marching order," not invented capacity), and `_jpRenderResults` surfaces it as a
  named, dismissable advisory ("⚡ Mounted Rider would be ~63% faster here…") with a one-click "Use
  here" button writing into the exact same `stageOverrides` mechanism the manual picker already
  uses — never applied automatically. `>10%` margin (same order of magnitude as v1.50's
  bottleneck-veto threshold) so numerical noise never nags. The hint text was rewritten to describe
  what the tool actually does. This is the same "advisory, not silent auto-apply" shape as v1.47's
  re-route button and v1.51's `_stageTrouble` fix-line convention — a pattern worth reusing before
  reaching for a silent default next time a "should the tool just do this automatically" question
  comes up.
- **Known scope cuts**: the advisory is land-only (water stages already have real substitution via
  `_jpAutoStageVessel`); it compares `JP_LAND_TRANSPORTS` modes only, not equipment counts (adding
  carts/animals is a separate, larger question); the sea-lane discount magnitude (×0.25) mirrors the
  land-way term rather than being independently calibrated — reasonable, not historically grounded.

### Season slider self-enable + the last four travel cuts + V1.915 snapping (v1.52)

Three owner requests in one pass: the Cartography "Season (render)" slider did nothing, the four
scope cuts v1.43/v1.49/v1.51 each deferred, and reintroducing V1.915's snap-to-place/way while
drawing. Hash vs v1.51 ALL IDENTICAL. Read this before touching `state.viz.season`,
`_jpPlan`'s rest/drift math, or `_civWayWaypoints`/`_civWaypoints`.

- **A slider that changes nothing is not "broken", it's INERT, and the difference matters for the
  fix.** `_seasonK` gates on `state.mode==='biome' && state.climate.seasons` — the second flag
  lives on a DIFFERENT tab (Generate→World) and defaults off. `bind()` listens for `'input'`, not
  `'change'` — the first smoke-test attempt at this dispatched the wrong event and silently
  measured the pre-fix frame. Fixed by making the slider self-enabling (turns its prerequisite on,
  never off) plus a status line (`_seasonSliderNote`) that says live/inert in words.
- **Rest days and calendar days are different quantities; report both, never blur them into one.**
  `jpRestDays` (§5's 1-in-3-to-5 cadence, `plan.days` unchanged) — this file's own past self blurred
  exactly this in v1.43 and it made that calibration hard to verify.
- **A stage's season is its MIDPOINT, not its start.** A first cut used start-day and a 17-day final
  stage beginning on day 90.8 kept the whole of Spring — a 108-day trip never crossed a season.
  `jpSeasonAt` + one pre-pass at uniform-season durations (the same circle-breaking bootstrap v1.51
  used for the desert tier).
- **The gate that already exists is the right gate.** No "Mediterranean sea" biome to key *Mare
  Clausum* on — but the water TYPE (Open Sea vs Coastal/Bay) is already the exact distinction the
  history draws. `jpSeaClosure`, sharing v1.51's `plan.seasonalClosures` control.
- **A cost model needs a unit this tool can actually claim.** `jpJourneyCost` prices in DAY-WAGES,
  not an invented currency — the land:river:sea RATIOS (0.055:0.011:0.002) follow Diocletian's
  Price Edict, this file's existing source for food-logistics ratios (v1.33); only the ratio is
  historically grounded, the absolute price level is the world owner's to set.
- **`_jpEnsurePlan(jn)` returns the SAME object every call — again.** v1.51's HANDOFF entry names
  this exact trap and it still cost a second smoke re-run here. Clone before diverging, every time.
- **V1.915 snapping reintroduced, not ported verbatim.** Gen1's `draw_way`/`route` tools pushed the
  raw grid cell with zero attraction — a real regression against V1.915's Route Editor. New
  `_civFindSnapTarget`/`_civSnapPoint` work in GRID space via `_civZoomPickR` (v1.23's own zoom
  compensation), not V1.915's screen-pixel math, because Gen1's tools already live in grid cells.
  Nearest-wins across places AND way curves, no place-vs-way preference — matching V1.915's own
  `findWaySnap` semantics. **A settlement-terminated road can legitimately sit closer to a test
  point than the settlement pin itself** (the road's own v1.02 endpoint snap put it there) — that's
  the mechanism working, not a bug; isolate `civWays` when testing place-snapping specifically, or
  the test will flap on which target happened to be nearer. Opt-out (`state.viz.snapWays`, default
  true) via two checkboxes that must stay in sync — the umpteenth two-surfaces-one-flag case.

### Constraints that were stated but never measured (v1.51)

Owner audit: "are max travel distances, travel-time calculations, dependencies and constraints
properly factored in and adjustable?" Answered by measurement — a sensitivity sweep over every
exposed control, plus a constraint census — not by reading. Hash vs v1.50 ALL IDENTICAL (civ-layer
only). Read this before touching any `JP_*` constraint.

- **The TIME model was already sound and is untouched.** Σ stage-days equals `plan.days` exactly;
  15 of 17 controls provably move the answer. The defects were all in the CONSTRAINT layer.
- **A requirement that is never compared against the thing it describes is a caption, not a
  constraint.** `jpAssessResupply` demanded a stop every 27 km on a 908 km route whose 4 settlements
  averaged 303 km apart, and nothing checked. Worse, the verdict said *"cannot be resupplied from
  settlements in reach"* while reading `resupply.feasible`, which is set **solely** by
  `totalMass > capacity` — it named settlements while measuring an overloaded pack. **Seventh
  occurrence of this shape** (v1.30/v1.33/v1.35/v1.38/v1.48/v1.50). `_jpResupplyReach` now walks the
  route's arc length and compares the worst settlement gap against `supplyDays × km/day`; the data
  had been in `plan.stops` since v1.44. It measures the FOOD range only — water is no longer a
  settlement question, and merging them would re-blur exactly what was wrong.
- **`supplyDays` was inert.** 2/7/20/45 all returned 16.17 d. The convergence loop divides the
  supplyDays-derived load back out (`next = baseDaily/lMod*pen`) and recomputed from a hardcoded
  `settlementDays = 7`. **When a control has a warning attached to it, check that it moves the
  number the warning is about.** Now the food interval IS `supplyDays`.
- **Water bound the range, and it was a constant.** Hardcoded 1.5 d for every non-desert stage while
  the world carries rivers, lakes and flow. `_jpStageDryKm` measures the longest waterless run;
  `jpCalcLand` converts it to days **at the stage's own speed inside the convergence loop**, so load
  correctly lengthens the gap. Reach radius floored at 1.5 cells (v1.35: sub-cell thresholds are
  unsatisfiable, not strict). Sea is not freshwater. `desertWater` defaults to `auto`.
- **"Over capacity" is a symptom, not a cause.** It means either too much cargo or a waterless
  stretch no party can carry water for — only the second is fixed by rerouting, so
  `jpAssessResupply` returns a `cause` and two different messages.
- **A term that only ever helps will run away.** Every extra person added `JP_HUMAN_PORTER`
  capacity and erased load penalty while `coordMod` floored at 0.76, so **100,000 people on a dirt
  track was the fastest configuration in the model** (18.07 km/day, same as 200 people, vs 10.70 for
  one). `jpColumnLengthKm`/`jpColumnFactor` add road capacity as a **damping term on the finished
  daily distance, never another speed multiplier** — passage time is subtracted from the day, it
  does not slow the pace, and Haste does not exempt it. 100k → 40 km column → floored → 6.33 km/day.
  Caravan scale is deliberately unaffected (30 people ⇒ 0.999); a 200-person party still beats a
  lone traveller carrying the same cargo, which is the carrying-capacity term working correctly.
- **Some constraints are binary and modelling them as "slow" is wrong.** A winter pass in a cold
  biome is closed (`jpSeasonalClosure`), gated on BOTH terrain and biome so a low temperate pass is
  unaffected, and overridable via `plan.seasonalClosures`.
- **A problem must be reported where it can be FIXED** (owner follow-up). A blocked stage used to be
  one line in the roll-up, nowhere near the controls that resolve it. `_stageTrouble(r)` classifies
  each stage (blocked / unsupportable / overloaded) and the per-stage override cards sort problems to
  the top, force-open, tint, print the engine's own reason, and **name the control that fixes it**.
  The fix line must not restate the reason — point at the control instead.
- **Cruise speed is the wrong number for a boat** (owner follow-up). What matters is cruise × the
  water's own sailing window × the fraction of cruise that water realises. `jpVesselDayKm` composes
  it and returns null exactly when `_jpVesselWaterBlock` refuses — one source of truth with the
  validator. Measured: Longship is fastest on every river (132 km/day on Calm River), Caravel at sea
  (157 on Open Sea); a Keelboat is river+sea but not open-sea rated; the fastest hull is **not** the
  highest cruise speed, which is the misconception the panel exists to correct.
- **Two bugs found only by verification, both introduced in this same version**: the auto desert tier
  was resolved AFTER `rawDaily`, so its speed penalty was dropped while its water reserve applied
  (the two halves of one setting disagreeing — this version's own defect class); and `waterGapDays`
  was recomputed at the TOP of the convergence loop, so a non-converging run returned a gap the
  displayed km/day could not reproduce. Both fixed; `waterGapDays === waterDaysAt(dailyKm)` is now an
  invariant of the return value.
- **Test trap worth remembering**: `_jpEnsurePlan(jn)` returns the SAME object every call, so two
  "plan variants" built from it are aliases and the second configuration silently wins for both.
  Clone before diverging — this cost three smoke re-runs.
- **Known scope cuts**: no rest-day/calendar tier split, uniform `plan.season` for a whole journey,
  no sea-closure (*Mare Clausum*/monsoon) analogue, no cost model — all pre-existing. New: per-terrain
  file counts are a fixed table, not a road-width field, and `JP_COLUMN_FLOOR = 0.35` is reasoned,
  not historically calibrated.

### Auto-selection audit + the bottleneck veto (v1.50)

Owner asked whether auto-selection/promotion actually fit each biome/terrain/weight. Audited in-page
across all 13 terrains × 12 biomes × 4 animals with every table cross-checked against the vocabulary
it indexes — not by reading. Hash vs v1.49 ALL IDENTICAL (civ-layer only).

- **Cleared**: zero dead table keys anywhere; full animal coverage in the desert/seasonal tables;
  both blocking sets genuinely consumed; all five promotion paths correct (notably: overloaded with
  auto-promote OFF *warns and stays Walking* rather than silently promoting).
- **A rule table and a data table that disagree is a bug unless the disagreement is written down.**
  `jpBestAnimalForContext` had rules for 8 of 13 terrains. Three of the five gaps are terrains where
  all four animals score identically (biome fallback is right there). The other two — **`Hills` and
  `Mountain Pass`** — rate mule 0.85 (joint best) and camel 0.50, so biome overrode terrain exactly
  where terrain discriminates most: a mountain pass in an arid biome picked a **camel, the worst of
  four, a 70% penalty**. Not a corner case — those two terrains are **29.8% of land route-km** on a
  real world (Hills alone 26.8%). Fixed; non-argmax combos 20 → 12.
- **`Forest Path` is the remaining 12 and disagrees with its table ON PURPOSE** (donkey is faster,
  mule carries 110 vs 80 kg ⇒ ~27% fewer animals, which is what the v1.48 fodder ceiling turns on).
  Now commented, so it reads as intent instead of being re-found as a bug every audit.
- **Bottleneck veto — a pack train is a WHOLE-JOURNEY commitment.** You cannot swap species halfway
  up a pass, so the binding constraint is the worst ground crossed, not the km-weighted average the
  old plurality vote used. When a stage is ≥20% off the best animal AND ≥10% of the route, the whole
  route switches to the total-time minimiser, and **says so by name** (terrain, km, penalty).
  Deliberately a veto, not a global re-optimisation: pure speed-optimisation would have silently
  flipped Forest Path mule→donkey. The thresholds separate real bottlenecks (camel on a pass, 41%)
  from mild preferences (mule on forest path, 11.8%). Symmetric — sand switches toward the camel.
- **Per-stage pack-animal override**: plumbing already existed (`_jpEffectiveStagePlan` merges
  `ov.animals`); only the control was missing. The handler translates a species pick into the
  head-count shape the effective plan already reads rather than adding a parallel field.
- **`jpAnimalTerrainMod` is now the one resolver** for "how fast is this animal here", called by both
  `jpCalcLand` and the route-fit comparison — the sixth time this file has had to collapse two
  functions answering one question.
- **Known scope cuts**: thresholds are reasoned against the shipped table, not historically
  calibrated; the veto picks ONE animal for the whole route (a genuine mixed train is what the
  per-stage override is for); species choice ignores capacity except via the Forest Path rule.

### Route Editor: the answer comes first, and says how sure it is (v1.49)

Owner-requested audit of the planner's layout and information density. Hash vs v1.48 ALL IDENTICAL
(blocks 3/4 byte-identical; 1/2 differ only in the version string and the civ-layer planner UI).

- **Measure the layout, don't eyeball it.** `#reResults` sat at **y=1295 in a 1000px viewport** —
  295px below the fold — because Results was a full-width block AFTER the 2-column row, whose height
  is set by the 909px party form; the Stops column opposite that form held 90px of content in a
  967px row, i.e. **~875px of dead space** with a 262px Results block that belonged in it.
- **`.re-col-out` is the output column and it STICKS.** Results + Stops moved into that gap;
  `position:sticky` keeps the answer on screen while the taller form scrolls, because the panel's
  real loop is "change a control, watch the number move". `align-self:flex-start` is mandatory — a
  stretched flex item cannot stick. Sticky is disabled on the ≤900px stacked layout. Re-measured:
  Results top **1295 → 314**, scroll height 1602 → 1226. Party column capped at 820px so inputs
  don't stretch on ultrawide.
- **Three pure readers over a finished plan** — no new modelling, no new state, separate functions
  (not inlined into the renderer) so they stay smoke-testable like `_jpVesselWaterBlock`:
  - **`_jpVerdict`** — favourable/moderate/strained/severe from signals the plan already carries
    (v1.48 load ratio + draft shortfall, v1.31 resupply feasibility, terrain/weather shares counted
    only when a real fraction of the route). **Always returns its `reasons` by name** — a verdict
    that can't say why is worse than none (v1.35's `basis` lesson one level up). It replaced a
    single hardcoded ternary on day count, which was the entire prior interpretive layer.
  - **`_jpConfidence`** — asymmetric band that WIDENS with duration (±3/+10% under a week →
    −15/+60% at season scale), because the per-stage model is a best case and its optimism grows
    with trip length. An honesty band on a point estimate, not a simulated distribution; says so.
  - **`_jpPackRange`** — the wagon-equation ceiling shown BEFORE the user crosses it (v1.48 only
    caught it after). **Computed from exactly the inputs v1.48's `fodderInfeasible` guard tests**,
    so the displayed number IS that guard's threshold — one source of truth, asserted by a smoke
    test that reproduces the guard arithmetic independently.
- **Canvas density must be judged against DISPLAYED width, not the internal backing.** The day-tick
  thinning first used `cv.width` (640) while the element renders at ~430px, so ticks could crowd on
  screen while the arithmetic said they were fine. Caught during verification.
- **Known scope cuts** (same audit, not attempted): no cost/price/wage/toll model at all, so a trade
  route never reports profit; `plan.season` is uniform for the whole journey (a 242-day trip is
  computed in one season); spoilage barely modelled; no return leg and no side-by-side plan
  comparison (v1.47's re-route replaces rather than compares).

### Pack-animal count: fodder-feedback divergence, reported honestly (v1.48)

Owner report: "250kg of cargo now necessitates roughly 213 mules." Root-caused with a numerical
simulation of the exact formula before writing any fix, and cross-checked against an owner-supplied
independent reference tool whose pack-animal math is line-for-line identical. Hash vs v1.47 ALL
IDENTICAL (civ-layer only, `jpAutoPickTransport`).

- **A fixed-point iteration that has no fixed point.** The pack-animal count solver iterates
  against a fodder cost that scales with the count itself (each animal carries its own fodder for
  the trip). A mule's 110 kg capacity against 5 kg/day fodder breaks even at 22 days with zero
  grazing — past that, every animal ADDED costs more capacity in its own fodder than it
  contributes, so the iteration diverges: no N solves the equation. The loop, capped at 6 steps,
  silently returned whatever the divergent series had reached — a large, plausible-looking number
  that isn't a real answer.
- **The reference tool has the identical unguarded loop** — this was never a version-to-version
  regression to bisect. What it DOES have is a separate "recursive supply collapse" advisory
  (multi-leg resupply feasibility) — evidence the intent was always to report infeasibility
  honestly, not to let a number run away.
- **Fix: detect it analytically, before iterating.** `perAnimalFodder=animalFood*supplyDays*
  fodderFrac; fodderInfeasible=fodderFrac>0 && perAnimalFodder>=A.cap`. When true, both the main
  solver and the wagon/cart draft-animal recompute (identical shape, identical risk) skip their
  divergent loops and fall back to the naive first estimate (cargo + human supplies, no animal
  fodder) — a bounded, honest floor. Returns `infeasible`/`warn` flags and a hint naming the real
  fix: fewer supply days, more grazing, or a resupply stop via the existing v1.44 Route Editor
  Stops feature — not more animals, which cannot solve this by construction.
- **Verified with the same simulation harness**: `supplyDays=200`/Partial grazing now reports
  count=18 flagged infeasible, not 191,454. Full grazing (`fodderFrac=0`) never trips the check —
  correct, since that path has a real fixed point.
- **Tests**: 5 new smoke assertions (`R.v148`) — a normal trip stays small/unflagged; a very long
  supply duration on identical cargo is flagged instead of exploding; the count stays bounded
  (<50); the hint names resupply, not more animals; full grazing never trips the check.
- **Known scope cut**: `supplyDays` still isn't automatically shortened at a passed Stop — the
  auto-pick solver treats it as one unbroken carry for the whole route. Threading resupply into the
  load solver itself is the same boundary v1.44 deliberately drew around Stops; left for later.

### Journey re-routing: mode-aware pathfinding (v1.47)

HANDOFF's "Sea routes are never chosen; travel mode cannot re-bias a route" — the last of the three
items tracked open after v1.44. Hash vs v1.46 ALL IDENTICAL (civ-layer only).

- **Re-reading the code before writing anything found the diagnosis was stated too broadly.** The
  multi-modal cost graph already existed: `_civDijkstraPath`'s `mode='water'`/`'mixed'` branches
  (`_civWaterCostGrid`/`_civMixedCostGrid`, both v0.94) already let the Route-drawing tool cross
  open water when cheaper, with rivers already carrying a real cost floor. The actual gap was
  narrower: `_jpDeriveStages` only SAMPLES an already-drawn `jn.pts` polyline, so switching
  Transport re-scored the same fixed line instead of re-pathing it.
- **`_jpModeForRoute(transport)`** — the one place `JP_TOP_MODES` maps onto `_civDijkstraPath`'s
  mode: Sea Faring→`'water'`, River Transport→`'mixed'` (no dedicated river-only domain exists;
  `'mixed'` prefers rivers via their cost floor without requiring them — disclosed, not claimed as a
  pure river solver), the three land transports→`undefined` (the land-only default branch).
- **`_jpRerouteForMode(jn)`** re-paths between the journey's own current start/end under that mode,
  replacing `jn.pts`/`jn.km`/`jn.brks` — no new pathfinding code, a bridge to the existing one.
- **`_civDijkstraPath` gained a `reachable` field, purely additive.** It always returned SOME path,
  even a straight line across genuinely impassable terrain, when the target was never actually
  reached — correct for `'mixed'` (nothing is truly unreachable there) but wrong for a `'water'`
  re-route between two inland settlements, which must honestly report "no route," not draw a ship
  through a continent. `reachable=(target===source)||(prev[target]>=0)`.
- **An explicit "🧭 Re-route for `<mode>`…" button, never silent.** A hand-drawn route is the
  user's own work — the v1.24 BUG-4 `confirm()` precedent. Decline leaves `jn.pts` untouched; an
  unreachable target alerts with the mode and reason and likewise leaves it untouched.
- **Tests**: 7 new smoke assertions (`R.v147`) covering `reachable`, the mode mapping, a successful
  land re-route, a correctly-failing sea re-route, button presence/labeling, and the confirm
  decline/accept paths.
- **Known scope cuts**: River Transport prefers rather than requires water; re-routing is
  point-to-point, not stop-preserving; no automatic re-route suggestion on mere infeasibility (the
  existing v1.44 per-stage vessel fallback covers that) — this is reached by explicit action only.

### Coastal settlement preference (v1.46)

HANDOFF's "Settlements with a port still sit inland" — v1.37 fixed coastal DETECTION, v1.40 tried
raising the coast weight in `buildSettlementSuitability` and reverted it (clusters seeds along the
coastline, the suppression radius then culls the excess, halving the settlement count for two extra
coastal sites — the v1.30 rule: a term that isn't ~zero almost everywhere is reweighting the whole
map, not expressing an exception). Hash vs v1.45 ALL IDENTICAL — civ-layer placement only.

- **A first cut ("swap in one coastal settlement per landmass if it has none") measured as a no-op**
  on the reference seed — both landmasses hosting settlements already had ≥1 port. "At least one" was
  never what the report meant; the gap is under-representation, not zero representation.
- **Shipped version: each landmass's coastal SHARE OF SETTLEMENTS must exceed its coastal SHARE OF
  LAND by `PORT_PREFERENCE_MULT` (3×)** — scales with the landmass's own geometry (a small island
  asks for little extra, a large continent proportionally more) rather than a flat count. Candidates
  come from re-running the SAME `findSettlementSeeds` primitive (same threshold, same suppression
  radius) over the SAME `suit` field, masked to ocean-shore range — genuine local maxima.
- **Bounded and landmass-scoped**: `suit`, the main suppression-radius picker, and every settlement
  outside the landmass being adjusted are untouched; each swap still needs `SETTLE_SEED_THRESH` and
  costs no more than the water-edge snap's own 0.60 tolerance — a mediocre coast stays unsettled.
- **`_civOceanDistField()`** — the OCEAN-only twin of `_civCoastDistField()` (which sources from ANY
  sub-sea-level cell, including lakes — wrong for a sea-lane-port test, per `_civIsCoastal`'s own
  `oceanOnly` convention).
- **A large repositioning runs before routing (the v1.39 ordering rule) and can cascade into the
  crossroads pass**, which reads final positions to decide trade-junction emergence — on the one
  tested seed where a swap fired with a big displacement, final settlement count moved 19→27. A real,
  disclosed side effect of moving a settlement before the road network exists (the water-edge snap
  already has this property, just usually smaller), not a bug.
- **Known scope cut**: `PORT_PREFERENCE_MULT=3` is a reasonable, un-tuned constant, not calibrated
  against a historical reference the way v1.34's 9:1 ratio was. Crossroads settlements are
  deliberately NOT re-biased coastward — they exist because a route junction is there (often inland
  at a ford/pass), and pulling them to the shore would defeat the reason they were placed.

### River deep-zoom fade: the second factor (v1.45)

Closes the "second factor... unidentified" item v1.41 left open (356→479 px recovery at zoom 32 —
"a real but PARTIAL recovery"). Found by ablation (an off-vs-on exact-pixel-diff probe at zoom
8/24/32/48, toggling `riverSinuosity`/`rdpSimplify`/`catmullRomSample` one at a time — all three
negligible) rather than by more staring at the render. Hash vs v1.44 **ALL IDENTICAL** in every
scenario — the fix sits entirely inside the opt-in deep-LOD-zoom `riverWays`-on branch of
`drawLODView`.

- **A glyph-sizing cap doesn't belong on a self-damping stroke law.** The river-ways call site
  computed `const zk=Math.min(8,GW/span)` before handing it to `drawRiverWays`'s `baseW*sqrt(zk)`
  width law (v1.29's own design, already self-limiting via the square root — never meant to need a
  ceiling). The cap was copied from `drawLODDebugOverlays`' SEPARATE local `zk`, which correctly
  caps GLYPH size past ~8×. But `zk` here is also, one line away, the exact same `GW/span` factor
  driving `px`/`py`'s geometry reprojection — uncapped, and still stretching past zoom 8. Capping
  only the width while the geometry keeps stretching makes the line read relatively THINNER the
  deeper you zoom: the reported symptom. v1.41's own de-emphasis fix addressed the alpha term, not
  this width term — both were independently fighting the same zoom range.
- **The fix is one line, isolated to the one call site**: `const zk=GW/span;` (no cap).
  `drawLODDebugOverlays`' own glyph `zk` is untouched — capping glyph size is still correct, it was
  only ever wrong to reuse that cap for a law that already damps itself.
- **Measured** (seed 12345/256px): zoom 8 unaffected (`Math.min(8,zk)===zk` already, hence the
  default/shallow-zoom render provably cannot change); zoom 32 3,928px → 7,020px (+79%).
- **Tests**: 3 new smoke assertions (`R.v145`) — captured `zk` at deep zoom now equals the real
  uncapped `GW/span`; captured `zk` at shallow zoom is unchanged; a world-agnostic pixel-diff
  comparing the live render against a monkeypatched reproduction of the old cap on the identical
  view (compares the fix to the old behavior, not to an absolute count, so it isn't sensitive to
  whatever world the smoke suite happens to be running).
- **Known scope cut**: the v1.29-disclosed per-tile seam residue and any further order-1
  de-emphasis-curve tuning are separate, still-open items.

### Route Editor: journey editing gets a full screen (v1.44)

Owner: "when clicking a route I wish it to open a full screen menu so we can properly make edits" —
route visual upper-left, stops/traveler options/carriage/season/weather editable, current weather
suggestion system kept in place. Hash vs v1.43 ALL IDENTICAL (block 2 only). 1001 / 852 / 390 green.

- **A bigger home, not a second implementation.** The party/results forms already existed, crammed
  into the Explore sidebar behind nested `<details>`. `_jpRenderPartyForm`/`_jpRenderResults`/
  `_civDrawProfile` were retargeted to ids inside the new `#routeEditorModal`, mirroring v1.18's City
  Viewer shell contract exactly (`.open` class, own Escape handler, added to `_overCanvasOverlay`'s
  scroll-fix list and `_sculptNavSync`'s joystick gate). The sidebar collapsed to a one-line summary
  + "Edit route…" button — no dead-but-harmless duplicate editing surface left behind.
- **A block-1 function must never assume a block-2 `let` has run** (this file's own recurring
  lesson): `_sculptNavSync` checks `#routeEditorModal`'s DOM class, not a JS flag, for the same
  reason it already does that for the City Viewer's `_cvCam`.
- **The route visual is a new bounded render, not a camera.** `_reDrawRouteMap` paints a static
  bbox crop from `currentCartBiome()`/`CART_BIOME_COLS` — real painted data, the same table the
  "bclass" debug view already reads — with the polyline and stop markers over it. No pan/zoom: a
  route is a path already visible in one crop, unlike a city.
- **Stops: one computation, not two.** `_jpPlan()` now calls `_civPassedSettlements(jn.pts)` exactly
  once and attaches a stable `_jpStopKey(s)` + `layoverDays` (`jn.layovers{}`); `_jpRenderResults`'s
  own duplicate call is gone. A planned rest/resupply day is additive on `totalDays`, deliberately
  NOT threaded into the load/resupply convergence loop — a stop is where the party resupplies, not
  a leg it carries extra supplies across.
- **Weather: the suggestion system is the untouched default, not replaced.** `plan.weatherOverride`
  defaults to `"auto"` (merged into every plan, including old saves, via `_jpEnsurePlan`'s existing
  pattern); `jpWeatherFactor` falls straight through to the pre-existing `jpWxWeighted` seasonal
  average when unset. A forced condition is additive — same convention as v1.30/v1.33/v1.38's
  "auto stays default, override is opt-in" precedent.
- **Two bugs only manual browser verification caught.** The modal's header summary and the Weather
  select's own hint text both went stale after a non-structural field change, because `_jpRefresh`
  only rebuilds the full party form on `data-structural="1"` fields. Neither is meaningfully
  assertable headlessly (the defect IS "the on-screen text doesn't update") — caught by screenshotting
  before/after a Storm override. Fixed by folding the summary into `_jpRenderResults` (runs on every
  refresh) and marking Weather `data-structural="1"`, the same convention Transport already uses.
- **Known scope cuts**: clicking a route's line on the map doesn't open the editor (only the sidebar
  card does — no polyline hit-testing was built); the route-map thumbnail doesn't handle an
  antimeridian-wrapping route (bbox-only); "stops" is rest days at existing waypoints, not path
  (re-routing) editing.

### Travel speed: measure the composition, not the table (v1.43)

Owner supplied `docs/research/travel-speeds.md` and reported the planner running ~37% long. The
report's §7 critiques the speed TABLES; measuring first moved the diagnosis somewhere it never
looked. Read the research before touching any `JP_*` constant.

- **The biggest error was the auto-derived INFRASTRUCTURE tier.** On a real world, 61% of a route's
  km tiered as **"Hostile / Dead Zone" (×0.50)** and no km ever reached "Stable Settlements" — mean
  **4.0 km/day**. `JP_INFRA_TIERS` wanted 8 settlements per 100 km as an ABSOLUTE count while the
  generator places ~30 towns for a whole world and never the villages that line a road. **Any
  threshold compared against generated `state.places` counts is a scale mismatch waiting to happen**
  — tiers are now multiples of the world's own measured density (`_jpInfraContext`), the fourth use
  of the v1.25/v1.31/v1.34 measure-don't-assume technique. Claimed territory floors a stage at
  Sparse; the bottom tier needs a real hostile signal; open sea is not tiered by LAND density.
  Measured 4.0 → **10.5 km/day**.
- **A rate needs a minimum sample.** One settlement beside a 40 km stage read 2.5 per 100 km and
  jumped the whole route to the top tier. `JP_INFRA_MIN_SAMPLE_KM` floors the denominator — the same
  class of bug as v1.35's sub-cell distance thresholds, one dimension up.
- **A single bucket cannot hold three modes.** "Baggage Train" was one 3.0 km/h constant for ox
  wagons (16-20 km/day), pack trains (40-56) and porters (15-22). `jpTrainPace` resolves the base
  from the slowest CARRIER — the report's §5.1 rule, using data the plan already had.
- **Check that a lookup table is actually reachable.** `JP_ANIMAL_TERRAIN_OVERRIDE` /
  `JP_ANIMAL_WEATHER_OVERRIDE` were gated on `mountKey`, resolved only for "Mounted Rider" — so a
  camel CARAVAN, the historically dominant desert configuration, got none of the camel affinities
  while a lone camel rider got all of them. Dead-by-gating, not dead-by-absence, so nothing threw.
- **A control must not apply where it has no meaning.** Sea distance was driven by the LAND hours/day
  slider, so a 14 h plan put a sheltered bay 3× over its band while an 8 h plan put open sea under
  its floor — one journey, opposite errors. `JP_WATER_WINDOW` (§3.3: a coastal hull anchors at
  nightfall, an open-water passage sails through it) owns the water axis; `JP_TERRAIN.sea` became the
  realised fraction of cruise speed. **v1.23 fixed the ORDERING of that row and left the magnitudes;
  fixing a rank order is not fixing a calibration.**
- **Assert the composed output, not the constant.** Two v1.23 smoke assertions tested raw
  `JP_TERRAIN.sea` values and would now fail a correct model, because the ordering moved into the
  window. They assert km/day now — which is what the owner's original report measured.
- **A bonus is not symmetric with a penalty.** `jpSurfaceGain` damps terrain modifiers ABOVE 1.0 for
  animal-paced modes (pavement barely speeds an ox — its gait is the ceiling) but never damps those
  below 1.0 (bad ground costs an animal at least as much as a walker).
- All 20 reference cases now sit inside their §8 bands (was 9/20); the report's own §9 sample journey
  reproduces at **242 days against its 244** (was 366).
- **Known scope cuts**: no rest-day / travel-day-vs-calendar tier split (§10's two-system split) — the
  planner reports one day count, calibrated to read as the calendar tier the historical records are;
  no seasonal gate (monsoon lock, closed passes are threshold effects with no state here); no
  political-toll or tropical-attrition term; no relay-courier mode. `JP_SHIPS` cruise speeds and
  `JP_ROUTE` wind/current rows are untouched.

### Land vs sea routing (v1.42)

The land MST (`_civHierarchicalNetwork`, all settlements) and the sea MST (`_civMstRoutes`, ports) were
built independently and never compared, so a road could track around a coastline between two towns
already linked by water. `_civPreferSeaRoutes` compares them on the Diocletian cost ratios and drops a
redundant road ONLY when it is not the sole overland link between its endpoints.

- **Journeys are USER-DRAWN** (`_jpDeriveStages` samples "the drawn route") — a route on screen that
  looks badly chosen is a generated `civWay`, not a journey. Diagnose road generation, not the planner.
- **Way point format is not uniform**: `_civMstRoutes` emits `[x,y]` arrays, other builders `{x,y}`
  objects. Assuming one silently yields NaN and a pass that does nothing.
- **Sea-lane endpoints sit offshore**, so they need a far more generous settlement-snap radius than
  land ways (which terminate exactly on their settlement since v1.02).

### Vector overlays must be zoom-aware (v1.41)

v0.96 de-emphasises order-1 rivers (0.4 alpha, 0.55× width) so thousands of trickles recede at world
scale. Correct there, wrong at deep zoom — under LOD the vector overlay is the ONLY river renderer
(`renderBiomeTileRGBA` never draws the network's water colour), so a faded headwater is an invisible
river, and at an 8-cell window the headwater IS the subject. The de-emphasis now fades with `zk`.
**Any world-scale legibility hack needs the same treatment**: check what it does when the feature it
de-emphasises is the only thing on screen.

Deep-zoom river pixels went 356 → 479 at zoom 32 — a real but PARTIAL recovery. Ruled out already:
the draw gate, the viewport cull, the baked-atlas path, the stroke width law; the geometry does reach
the renderer (15 polylines / 40 points in view at zoom 32). A second factor is still unidentified.

### Placement sees landmasses (v1.40)

`buildLandmassQuality` labels connected land components and scores each by log-area (against the
world's OWN largest) plus mean carrying capacity, feeding an `islet` PENALTY into suitability. Before
it, placement scored cells and could not tell a one-cell speck from a continent.

- **Relative to the world's largest landmass, never an absolute area** — an archipelago world is
  legitimately all small islands.
- **The penalty needs its knee (`ISLET_KNEE`).** A raw `1 − quality` is non-zero nearly everywhere and
  halved the settlement count. **Third occurrence of the v1.30 rule**: a term that is not ~zero almost
  everywhere is reweighting the whole map rather than expressing an exception. Check the land-mean of
  any new term before trusting it.
- Coastal PREFERENCE remains unsolved: raising the coast weight clusters seeds and the suppression
  radius culls them (29 → 12 for two extra coastal sites). Left at 0.14.

### Placement ordering (v1.39) — snap runs BEFORE routing

`_civSnapToWaterEdge` is enabled. **The rule: nothing may move a settlement after
`_civHierarchicalNetwork` has routed.** v1.36 snapped at the end of `_civIterativeAutoWorld` and every
way terminating at a moved settlement stopped short (broke v1.02 and v0.97); patching endpoints
afterwards did not fully restore either. The snap now runs before the first routing pass, and the
crossroads settlements are snapped before their own re-route. Measured: channel-bottom occupancy
6 → 1, no settlement in water, 65.5% on the water edge (lower than the 79.3% v1.36 measured with the
snap at the end — it nudges 5 settlements rather than 9 because the crossroads pass has not run yet).

### Placement: water edge + corridors — earlier context (v1.36)

Owner asked for settlements to sit on the bank/shore behind the floodplain, and for crossroads to
attract settlement. **Neither is on by default.** Read CHANGELOG v1.36 before picking this up.

- **`_civSnapToWaterEdge` works** (79.3% on the water edge vs 65.5%, flood-zone occupancy 6 → 1, mean
  river distance 16.3 → 3.6 km, settlement count unchanged) but is **gated behind
  `state.civ.waterEdgeSnap`** because it runs AFTER routing: moving a settlement leaves its ways
  stopping short, breaking v1.02 and starving the UME layout of primary streets (v0.97). **The fix is
  to reorder `_civIterativeAutoWorld` so placement finishes before routing begins** — patching
  endpoints afterwards was tried and did not fully restore either guarantee.
- **`buildRouteCorridors` is sound but ineffective at its current weight.** Terrain-derived (passes,
  fords, isthmuses = cheap ground with expensive flanks on BOTH sides) precisely so placement stays
  acyclic — roads come after settlements, so reading junctions would be circular. Field is sparse
  (land mean 0.038; a first cut at 0.233 halved the settlement count). But at `corridor:0.08`
  settlements sit at **0.72×** the land-average corridor value — it is not steering anything.
- **A measurement trap worth remembering**: an early 2.45× "corridor preference" was the SNAP's doing,
  not the corridor term's — fords are corridors, so moving settlements to water credited the wrong
  mechanism. Measure one change at a time; with the snap off the term reads 0.72×.


### Two panels, one settlement (v1.38)

The City Viewer's Economy section showed the FACTION's imports/exports while the settlement popup
showed the settlement's own — both correct for what they measured, but the viewer is a settlement
view, so the two contradicted each other about the same town. **A scope mismatch is as damaging as a
rule mismatch**: v1.33 unified the trade rule everywhere and still missed this, because the rule was
fine and the *subject* was wrong. The viewer now calls `_civPlaceTrade(p)` — literally the same call
the popup makes — and keeps the faction rows below, labelled. Asserted by rendering both panels and
comparing.

### Coastal detection + salt sourcing (v1.37)

- **`_umWaterReachKm()` must be used at EVERY water test.** v1.35 introduced it and fixed two of the
  three sites; `_umSiteKindFromTerrain` kept the old ~2.1 km near-radius, which rounds to one cell, so
  the coastal box was 3×3 and the world produced **zero** coastal settlements. When you add a water
  threshold, grep for the others.
- **`riverthrough` is an ESTUARY — sea AND river — so it grants SEA access.** It was reporting river
  only, which understates exactly the towns that trade most.
- **A "does this settlement have X" test against `rc.mean` must be relative to the world mean.** The
  trade checklist used an absolute `>0.25` against a windowed catchment mean, so nothing was ever met
  and all 29 settlements showed a critical gap. Fourth occurrence of this exact mistake (v1.31
  archetypes, v1.33 trade rule, v1.32 faction exports, this).
- **`_civSaltAccess`**: sea evaporation (any coast), rock salt/brine, or a salt lake. Salt was
  previously read only off the evaporite resource field, making it a universal unmet need. A
  settlement never imports salt it can produce.
- **Categories must test what they name.** "Fibre & dye" listed only `alum` — a dye mordant — so every
  settlement read as short of fibre. Wool and flax come from livestock and cropland.

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
tests/run.sh                        # newest Gen1 file: extract engine → node --check → 1016-assertion suite
tests/run.sh "Cartalith Gen1 v0.57.html"   # or any explicit target
tests/run_um.sh                     # newest Gen1 file: extract script block 4 → node --check → 852-assertion urban-morphology suite
node tests/perf/hash_gen1.js A.html B.html # Playwright A/B bit-identity battery (same-binary FNV hashes)
node tests/perf/perf_gen1.js               # timing harness (headless Chromium)
node tests/perf/probe_foodshed.js A.html    # clean-world food-shed / urbanisation checks
node tests/perf/probe_placement.js A.html   # clean-world settlement-placement checks
node tests/perf/probe_travel.js A.html      # Journey-Planner km/day vs travel-speeds.md §8 bands
node tests/perf/smoke_gen1.js A.html        # Playwright UI-chrome smoke (516 assertions: onboarding/layers/presets/phase + per-version regressions)
```

Stubs live in `tests/stub_head.js`; assertions in `tests/test_tail.js` — extend both when adding
pipeline stages or browser APIs. The suite covers the CPU paths of script block 1 only; blocks
2–3 and all GPU/Worker/canvas interaction need a browser pass. Script block 4 (urban morphology)
is pure/DOM-free like block 1, so it gets its own headless harness (`tests/run_um.sh` +
`tests/um_test_tail.js`, ported from `urban-morphology/tests/`) — but the block 2 adapter/renderer
that calls it is civ-layer code, so THAT half still needs `tests/perf/smoke_gen1.js`.

## Roadmap

See `docs/ROADMAP.md` and the plans/research under `docs/`. History: `CHANGELOG.md`.
