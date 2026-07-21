# Cartalith Gen1

> **New session? Read `docs/HANDOFF.md` first** — current state, next task, how to verify.

Single-file HTML worldbuilding tool. **The main deliverable is the newest
`Cartalith Gen1 v*.html`** (currently **v1.22**) — a zero-dependency HTML/JS/CSS application,
designed to open via `file://` (a local HTTP server is an accepted fallback for Workers/WASM
threads; `file://` must degrade gracefully, never break).

| File | Role |
|------|------|
| `Cartalith Gen1 v1.22.html` | **Current** unified tool (~23.9k lines, 4 script blocks — see architecture below) |
| `Cartalith Gen1 v0.57/v0.6/v0.61…v1.21.html` | Previous Gen1 versions (kept; never edit in place) |
| `Cartalith_V1.915.html` | Pre-merge cartographic editor, kept as reference (routes, settlements, paint grid, politics, journey planner) |
| `urban-morphology/Urban Morphology v0.1.html` | Standalone procedural city-layout PoC, kept as reference — its engine was ported into Gen1's 4th script block (v0.95); the PoC file itself is never edited |
| `fractal-geology/Fractal Geology Painter v0.1.html` | Standalone stamp-based terrain-sculpt PoC, kept as reference — its engine was ported into Gen1's Generate → Sculpt sub-tab (v1.15); the PoC file itself is never edited |
| `assets/sample_pack.zip` + `make_sample_pack.py` | Reference CC0 asset pack + its generator (in-app importer) |
| `docs/` | HANDOFF, roadmap, plans, `docs/research/` reports, `docs/SCULPT_EDITOR_INTEGRATION_PLAN.md` |
| `tests/` | Headless verification harness (`run.sh`, stubs, 992-assertion suite; `run_um.sh`, 852-assertion urban-morphology suite) + `tests/perf/` Playwright A/B + UI-smoke harnesses |
| `legacy/` | Historical merge tooling — **non-functional here** (inputs absent); see `legacy/README.md` |
| `CHANGELOG.md` | Per-version engine log (v0.037 → current), moved out of this file |

## Working rules

- Finish one thing before starting the next. Confirm design before building.
- **New version = new file** (`Cartalith Gen1 v0.XX.html`); don't edit old versions in place.
- **Version naming: two-digit minor from v0.61 on** (v0.61, v0.62, … v0.70). `sort -V` compares
  the minor numerically, so `v0.7` would sort *before* `v0.61` — the `tests/run.sh` default and
  any "pick newest" logic depend on the two-digit convention.
- **After any change to the engine (script block 1): run `tests/run.sh`.** A change is not done
  until it passes (992 assertions green). Script block 4 changes likewise require `tests/run_um.sh`
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
tests/run.sh                        # newest Gen1 file: extract engine → node --check → 992-assertion suite
tests/run.sh "Cartalith Gen1 v0.57.html"   # or any explicit target
tests/run_um.sh                     # newest Gen1 file: extract script block 4 → node --check → 852-assertion urban-morphology suite
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
