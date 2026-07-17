# Cartalith Gen1 — Session Hand-off

**Read this first.** Start-here guide for a new session. Pairs with `CLAUDE.md` (architecture +
invariants + working rules) and `CHANGELOG.md` (per-version history).

## Where we are

- Repo **`Achos0190/Cartalith_RC`**. This repository was seeded as a single snapshot upload
  ("Add files via upload") — the pre-merge development history (the `elevation_foundation`
  v0.036–v0.144 lineage, its branches and PRs) lives in the older `cartalith-gen1` repository
  and in `CHANGELOG.md` here, not in this repo's git log.
- **Current tool file: `Cartalith Gen1 v0.95.html`.** One self-contained HTML file, four
  script blocks (generator engine / civ-politics layer / asset library / urban-morphology
  engine, new in v0.95 — see CLAUDE.md's "Merged-file architecture"). The merge is DONE —
  there is no build step; the file is hand-evolved. New version = new file, two-digit minor
  (v0.96 next). Older `v0.57`/`v0.6`/`v0.61`–`v0.94` are kept and never edited.
- **v0.95 — owner request: refactor the `urban-morphology/` proof-of-concept (a standalone
  procedural city-layout generator) into Cartalith, with a deep-zoom reveal (settlement pin fades
  into its generated street layout, main roads locked to the region's own route network), a
  map-wide opt-in toggle, and settlement-popup Age/Fortifications controls inferred from
  population/tier by default.** Shipped as a new 4th `<script>` block (the PoC's pure, DOM-free
  engine, `UME.cityGen`) plus a civ-layer adapter/renderer on top of it, all opt-in
  (`state.viz.urbanLayouts`, default off) so render bit-identity to v0.94 holds at defaults
  (`hash_gen1.js` ALL IDENTICAL). Full detail — the `_umPlaceContext` adapter's age/wall
  inference and real-terrain site classification, the `routeEnds` road-locking hook, the
  `lodSpanKm()`-gated pin/layout crossfade renderer, the per-settlement generation cache/queue,
  and the popup fields — is in the CHANGELOG v0.95 entry (long, this was a full subsystem port).
  Verified: engine `tests/run.sh` **923/923** unaffected (script block 1 untouched); new
  `tests/run_um.sh` (ported PoC suite against the embedded block) **831/831**; `hash_gen1.js`
  A/B vs v0.94 **ALL IDENTICAL**; `smoke_gen1.js` **165 → 173** (+8 v0.95 assertions), **173/173**;
  fixed-seed Playwright screenshots confirm the crossfade reads correctly at 40/20/14/6 km spans
  (faint street web bleeding through a faded pin at mid-zoom → full walled-town layout with
  region roads visibly continuing into the settlement at deep zoom). **Deferred** (see CHANGELOG
  for the full list): faction→culture mapping (culture fixed to `'medieval'`), full terrain-
  sourced site geometry (currently type-classification only, not the river curve/bridge/harbour
  placement), the PoC's parcels layer + fine detail objects (trees/wells/crosses/etc.) in the
  canvas renderer, an era signal driving wall-vs-star-fort epochs over time.
- **v0.94 — owner /goal: "go on with the 4th proposal [colorization loop restructuring], draw
  rivers as ways as in the legacy cartalith app, and make route planning take sea-faring routes
  into account... when a split or partial [route] by sea or river is possible it opts to only use
  land based routes."** Three parts, plan confirmed with the owner beforehand (river-ways overlays
  on top of the raster blend and becomes the new default-ON; routing fix scoped to the interactive
  Route tool/journey planner, not the auto-network builder). (1) **Colorization-loop
  restructuring, re-scoped narrower.** v0.93 deferred this outright; fresh research proved buffer
  pooling is alias-safe (the RGBA output is never retained past its synchronous call anywhere) but
  showed allocation is 2-3 orders of magnitude cheaper than the per-pixel compute loop it sits
  inside, so pooling was evaluated and skipped as not worth it. Shipped instead: `sampleArr`
  row-hoisting (`sampleArrRowPrep`/`sampleArrRow`, eliminates redundant per-pixel recomputation of
  the row-only part of the bilinear sample, proven bit-identical, confirmed via the `--full`
  35-config hash battery). Palette-function scratch-ification (the project's own next roadmap
  item) was designed, then also deferred — it surfaced a genuine nested-call aliasing hazard
  (`grassCol` calls `ramp3` twice before consuming either result) that needs a proper multi-slot
  design, not a rushed single-buffer one. (2) **Rivers as ways.** The legacy `Cartalith_V1.915.html`
  drew every travel network (river/road/rail/sea) as one shared stroked-polyline "way"; Gen1 instead
  rendered rivers as a per-pixel raster blend, with true vector strokes existing only inside the
  opt-in Strahler debug view. That existing spline pipeline (previously duplicated between the
  main-canvas and LOD debug-overlay code) is now factored into one shared `drawRiverWays()` and
  exposed as a new default-on **"Draw rivers as ways"** checkbox, overlaid on top of the existing
  raster water blend on both the main canvas and Tiled LOD — a deliberate default-render change
  (`loadZip` back-compat guard keeps old saves on the old look, same pattern as v0.80's ocean-
  currents flip), verified via a targeted A/B (forcing `riverWays:false` reproduces v0.93's hash
  exactly, proving nothing else changed). Also closes a pre-existing LOD gap where the default
  Tiled-LOD Biome view never showed the river network's color at any zoom. (3) **Sea/river-aware
  routing.** Root-caused `_civMixedCostGrid` (the one function deciding both the Route tool's path
  and every journey): water cost (1.5) was tuned *above* flat land, backwards from the journey
  planner's own ~2.5× sea-speed model; land cost ignored biome friction other cost grids already
  use; real rivers carried zero cost information. Fixed by rebalancing water below land
  (`_CIV_SEA_COST=0.6`), sharing the biome-penalty table, and adding real river costing
  (`_CIV_RIVER_COST_BASE=0.85`, order-scaled, floor-only so a river never makes a cell worse).
  Scoped to the interactive tool only, per owner decision — the auto-generated world road network
  stays untouched, flagged as a possible follow-up. Verified via an independent Playwright A/B on
  six coastal detour-prone point pairs: v0.93 committed 5-6% water (essentially all-land) on two of
  them, v0.94 committed 35-50% water on the identical pairs — every pair showed equal-or-higher
  water usage. Render battery: `field`/`temp`/`rain`/`flow` identical everywhere (no engine change
  anywhere in this version); `rgba` differs at biome-mode configs by design (river-ways default).
  Headless **923** unchanged throughout; smoke **159 → 165** (6 new assertions across all three
  parts). Same-day, before v0.94: a **v0.93 hotfix** shipped first (live-testing report: lake edges
  blocky again, LOD tiles seemingly uncached) — see the v0.93 hotfix entry below for the full
  root-cause (a rapid continuous-zoom gesture let the progressive-overview stretch placeholder
  compound staleness without bound) and fix (`_lodOverviewStretchStreak`, bounding consecutive
  un-landed stretches instead of any single stretch's ratio, after a first ratio-cap attempt broke
  the legitimate single-big-jump case).
- **v0.93 — owner /goal: "make the proposed optimisations in a new version, keep a focus on
  graphic fidelity (no pixelated views or blockyness when zooming in on terrain)."** A prior
  session (on request) had produced a ranked list of 6 LOD-render/tile-pipeline optimization
  proposals (the engine's `generate()` stages were excluded from consideration — the bit-identity
  invariants make that path too risky to touch for speed alone). This version implements 3 of the
  6, all opt-in on the LOD path — render battery **ALL IDENTICAL to v0.92**, headless **923**
  unchanged, smoke **157/157** (+3 new assertions): (1) **progressive overview rebuild** — a zoom
  step with a previous overview in hand now stretches it and returns in <30ms instead of blocking
  on a full synchronous rebuild, with the real rebuild deferred to a background pass
  (`_lodScheduleOverviewRebuild`) guarded by `_fieldGen`/render-key checks against a regenerate
  landing mid-flight; (2) **GENPOOL extended to tile refinement** — a new task-parallel
  `runTiles()` dispatch mode (vs. the existing row-split `run()`) lets `refineVisibleTiles()`
  compute pool-eligible tiles across cores instead of one-by-one on the main thread (~3.1× faster,
  bit-identical output); found and fixed a genuine cold-Worker JIT cliff (~20× penalty on a
  fresh Worker's first call) with a `GENPOOL.warmup()` step at init; (3) **parallel atlas baking**
  — `bakeVisibleTiles()`/`bakeAllTiles()` batch each pyramid level's tile compute through the same
  pool before the still-sequential PNG-encode/write loop (~25% faster for a multi-level bake). A
  4th proposal (`renderBiomeTileRGBA` colorization-loop restructuring) was scoped, then
  deliberately **not shipped** — pooling its scratch/output buffers risks aliasing with cached
  tile data (a correctness bug that would manifest as exactly the visual corruption the owner's
  fidelity mandate exists to prevent) and per-pixel `sampleArr` hoisting risks floating-point
  reordering the bit-identity invariant doesn't tolerate; left for a future version with a
  narrower, independently-verifiable scope. A 5th, lower-risk proposal (lazy seasonal-field
  allocation — `tempJul/tempJan/rainJul/rainJan` now allocate on `computeSeasons()`'s first real
  call instead of unconditionally in `allocate()`, since seasons default off) shipped alongside the
  three LOD ones. **Fidelity explicitly verified** per the owner's stated concern: fixed-seed
  (424242) Playwright screenshots at overview / immediate-post-zoom (stretched placeholder) /
  settled (pooled-refined) / LOD zoom-cap (~1km scale) all show smooth, continuously-textured
  terrain, no blocky/quantized artifacts; a canvas pixel-diff confirmed refinement genuinely adds
  detail (not a no-op) rather than just being fast. See CHANGELOG for full profiling numbers,
  including two debugging arcs (a headless/SwiftShader canvas-GPU-contention red herring during
  pool profiling, and a same-page-first-call measurement artifact during bake-pool profiling) that
  turned out not to be real defects once isolated.
- **v0.92 — owner /goal: "carry out the [save-export audit's] reported fixes, then analyze why
  the program is so slow when zooming in even when tiles are baked"**, followed same-day by a
  bug report on the resulting fix (render battery ALL IDENTICAL to v0.91, headless **923**
  unchanged, smoke **137 → 148**). Four parts:
  (1) **audit fixes** (`docs/research/save-export-architecture-audit.md` §5, compatibility break
  accepted per owner): `exportZip()` now skips the redundant `map.png`/`tiles/*` flat bake when
  `state.finalized` (the Atlas pyramid already covers the whole map at every baked level — a
  precise signal, only ever true after `bakeAllTiles` finishes clean); the 4 `layers/*.png`
  preview PNGs are now opt-in (a new checkbox, same footing as the existing channel-atlas
  checkbox) instead of unconditional; the "Tiles & LOD" accordion (which buried "Atlas" two
  levels deep and bundled three unrelated features under one label) is split into three
  top-level sections — **Tiled LOD view** / **Atlas cache** / **Region export** — same element
  ids throughout, markup-only. (2) **the deeper question, root-caused with real profiling**: the
  reported "slow when zooming even with tiles baked" was real, but not the mechanism the owner
  suspected — the sharp TILE overlay correctly serves from the atlas when baked, but it draws on
  top of an "instant overview" backdrop that's rebuilt from scratch (full `GW×GH` canvas, the same
  expensive per-pixel colorization used for real tiles) on every zoom-level change, *always*,
  because it's built straight from `field` and never consults the atlas at all — measured **~940ms
  per zoom step at a modest 1024px world, unaffected by bake state** (baked vs. unbaked timings
  were the same order of magnitude). Since that backdrop is already documented as deliberately
  low-fidelity ("NO procedural detail"), rendering it at quarter resolution and letting the canvas
  stretch it (no signature changes needed — the resample/colorize functions already take
  independent output-resolution params) cut a full overview rebuild from **655ms → 53ms (12.3×)**,
  and the isolated backdrop-only cost (tile canvases + atlas already warm — the truest measure of
  a mid-zoom-gesture frame) from **1186ms → 71ms (16.6×)**. Visually verified unchanged character
  (screenshots of the same deep-zoom unrefined spot, before/after) since the backdrop was already
  a coarse placeholder standing in until the sharp tile overlay covers the same ground. Locked in
  with a permanent smoke-suite timing regression guard. See `CHANGELOG.md` for the full profiling
  numbers and reasoning. (3) **Follow-up bug report — "aspect ratio goes weird ... lakes are
  blocky/pixilated again on their edges."** The quarter-res downscale from part (2) starved small
  lakes (no `_coastSDF` smoothing — that only covers the ocean's sea-level threshold) of source
  samples: an 8-12px lake shrinks to 2-3px, and the 4× upscale turns an invisible native-res
  stair-step into a visibly faceted blob. "Aspect ratio weird" is the same artifact described
  differently — a round shape's *local* aspect getting mangled, not a canvas/CSS distortion (every
  measured aspect ratio checked out at ~1.56 consistently). A flat `/2` ratio fixes quality at
  1024px but re-regresses to ~420-440ms at 2048px, since a ratio's cost scales with the world.
  Fixed instead with a **512px fixed target output width** (`ovScale=min(1,512/GW)`), which bounds
  the overview's cost independent of world resolution (~100-130ms measured at both 1024px and
  2048px) while spending full resolution on worlds already ≤512px wide. Verified with fixed-seed
  screenshot A/Bs (lake shapes back to round, matching full-res) and two new smoke-suite
  regression guards (overview canvas width == 512px at the 1024px test world; aspect preserved).
  (4) **Second same-day follow-up — "Graphic fidelity seems to have degraded also."** The 512px
  cap fixed lakes/coastlines, but a broader softness remained at whole-map zoom (screenshots: v0.91's
  fine surface grain reads as a coarser blotch pattern in v0.92). Root cause wasn't the cap itself —
  every OTHER way into LOD (wheel-zoom, pan release, zoom buttons, auto-enter-on-zoom) already
  schedules `refineVisibleTiles()` after a 240ms settle, which draws a full-detail sharp tile over
  the coarse overview; a controlled before/after screenshot confirmed this genuinely restores full
  sharpness once triggered. But the **`lodChk` checkbox's own change handler never triggered it** —
  ticking "Tiled LOD view" and just looking left the user on the coarse overview indefinitely. This
  gap always existed but was invisible pre-v0.92 (the un-refined overview used to be full native
  resolution already); the resolution cap above is what finally exposed it. Fixed by having the
  checkbox call `withBusy('sharpening view…', refineVisibleTiles+renderNow)` immediately when
  checked (same pattern the explicit "Refine" button already uses), guarded by a re-check of
  `_lodOn` inside the deferred callback so a since-unchecked box can't race it. Verified with a real
  `.click()` on the checkbox confirming the visible tile populates with no further gesture. One new
  smoke-suite regression guard. Full battery green (923 headless, bit-identity ALL IDENTICAL,
  148/148 smoke).
- **v0.91 — owner /goal: "…how in explore the timeline should work. Currently it works, bit
  rather clunky"** (no engine changes — script block 2 civ-UI only; render battery ALL IDENTICAL
  to v0.90, headless **923** unchanged, smoke **123 → 130**): the second half of the v0.90 /goal
  request. Chosen direction (`AskUserQuestion`): **"one home, real time-scale."** (1) **One
  home** — timeline authoring (Add year + pills), scrubbing (slider + Animate) and the v0.85
  collapse/recovery simulator, previously split across Civilization → Polity (the controls) and
  Explore → Timeline (a second, synced read-only slider), now all live in Explore → Timeline;
  Simulate sits behind its own nested `<details>` so the common path stays uncluttered. Every
  moved element kept its id, so only markup moved — click/input handlers are untouched. The old
  duplicate slider (`#civTlSlider`) is retired; `#explTimelineSlider` is the only one now.
  (2) **Real time-scale** — `_civWireYearSlider()` used `slider.max = snapshotCount-1` and
  `slider.value = <array index>`, so uneven year gaps rendered as evenly-spaced ticks. Now
  `min`/`max`/`value` are the actual recorded years, with a `<datalist>` giving proportional tick
  marks (screenshot-verified at 3× zoom); dragging still snaps to the nearest recorded year
  (no interpolation model between discrete snapshots exists). (3) Fixed a latent gating bug while
  moving the markup: the Explore Timeline section used to hide itself until `civTimeline.length>0`,
  which would have made it impossible to add the *first* year from Explore — it's now always
  visible, only the slider+playback row gates on `length>1`.
  **Same-day follow-up (owner reports, live QA on the shipped v0.91)**, smoke **130 → 136**:
  (a) *"I dont see the timeline menu in explore"* — the first cut buried Timeline inside the filter
  funnel's collapsed popover alongside Polity/Settlements/Roads, which reads as a filter, not an
  editing surface, and was genuinely easy to miss. Moved to `#explTimelineSection`, a plain
  always-visible `.sec` with its own `<h2>`, same footing as Info/Journeys — no funnel click needed.
  (b) *"layer views arent responding to opacity anymore"* — a real regression from this session's own
  v0.89 work: generalizing `drawLODView()` to tile every debug view means `renderNow()`'s LOD early-
  return now always fires before the opacity-blend code, so the slider went inert under Tiled LOD for
  all ~29 views. Fixed by blending the affordance tile against the ordinary base tile
  (`renderBiomeTileRGBA`/`renderHeightTileRGBA`) inside `drawLODView()` itself, skipped at alpha=1 for
  zero added cost; `_lodRenderKey()` gained `debugOpacity` so the tile caches invalidate when the
  slider moves. (c) *"settlement/wildlife ones arent clickable...anymore"* — a gap explicitly flagged
  as a known follow-up in the v0.89 CHANGELOG: click-to-inspect was gated `!_lodOn` outright since
  `evtToGrid()` assumes the canvas shows the full world, untrue under LOD. New `evtToGridLOD(e)` (the
  inverse of v0.90's `_civPlaceScreenPos`) replaces the block with a correct reprojection. All three
  Playwright-verified via real interaction (dispatched clicks, opacity pixel-diff), render battery
  still ALL IDENTICAL to v0.90, headless 923 unchanged (canvas-interaction/LOD-render fixes — CLAUDE.md
  invariant #3, not headlessly testable).
  **Second same-day follow-up**, smoke **136 → 137**: (d) *"roads nearly miss settlements when zooming
  in"* — `_civSmoothPath()` (every way builder's shared smoothing chokepoint) `Math.round()`ed its own
  first/last point along with every interior point, up to half a grid cell of drift that Tiled LOD
  amplifies into a visible gap between a road and the pin it's meant to reach. Fixed by restoring full
  precision at each run's own endpoints post-round; `_civHierarchicalNetwork()` (the primary auto-
  route/auto-populate builder) had a second, compounding source — its raw points are downsampled
  routing-grid cell centers, not the settlement's real coordinate — fixed by substituting the true
  place coordinate in for each edge's actual first/last run (interior junction-to-junction runs are
  untouched, on purpose — they meet at a shared junction, not a settlement). Verified via a controlled
  probe (two real settlements, fractional coordinates, builders called directly): endpoint distance
  0.0 grid cells post-fix (was up to ~1). (e) *"[Clear places] leaves the routes"* — `civWays`/
  `civJourneys` carry no settlement-id, so deleting settlements left orphaned roads. `civClearPlacesBtn`
  (now labeled "Clear places & routes") clears both, mirroring `civClearRoadsBtn`. Civ layer (block 2)
  only; headless 923 unchanged, render battery ALL IDENTICAL to v0.90 (way geometry isn't in the
  battery).
- **v0.90 — owner request: "editing a settlement should open a pop-up in the viewscreen with the
  settlement properties and information"** (no engine changes — script block 2 civ-UI only; render
  battery ALL IDENTICAL to v0.89, headless **923** unchanged, smoke **120 → 123**): the settlement/POI
  editor moved out of the sidebar-pinned `#inspectorBody` (v0.65) into a floating `#placeEditPopup`
  anchored at the place's own screen position — the `showSettleInfo`/`showWildInfo` popup idiom, made
  editable, reusing `_civPopulatePlaceEditor`'s field logic unchanged. New `_civPlaceScreenPos(gx,gy)`
  projects world coords → screen px (both normal pan/zoom and `_lodOn`) so the popup opens correctly
  regardless of how the place was selected. Per the owner's chosen option, the sidebar "All settlements"/
  "All POIs" lists stay for browsing — their row-click/Edit button now calls `_civMoveViewTo` first (the
  existing "📍 Move viewer here" handler) so the popup opens already centered. Labels/icons are unchanged
  (still the sidebar inspector). Next queued: the Explore timeline rework (see "Next / open" below).
- **v0.89 — owner report: "tiled LOD info-layers don't scale properly"** (no engine changes; render
  battery ALL IDENTICAL to v0.88, headless **917 → 923**, smoke **117 → 120**): root cause was
  `drawLODView()` only tiling `state.debug` ∈ {off, lith, soil, water} — every other debug/info view
  (~26 of them: temp/rain/koppen/resources/wildlife/popdensity/tectonics/wind/ocean/rivers/…) fell through
  to the full un-zoomed `renderNow` pixel loop while the canvas stayed CSS-fitted for the current LOD zoom,
  so switching to e.g. Temperature while zoomed just stretched the whole world into the zoomed box.
  `renderAffordanceTileRGBA` is now generalized to cover every non-'off' debug value (samples the live
  coarse field at world coords — bilinear for continuous, nearest for categorical — and applies the exact
  main-map colour formula); new `debugTileContext(dbg)` builds precomputed fields once per render (not per
  tile); new `tileShade()` gives relief-lit views a tile-local hillshade. Per the owner's explicit "yes,
  overlays too": new `drawLODDebugOverlays()` reprojects wind/ocean arrows, plate-drift arrows, the T1
  boundary graph, Strahler river splines, and settle/wildlife markers onto the current LOD view rect, with
  zoom-scaled (capped at 8×) line/glyph sizes. Known non-regression: Settlement/Wildlife click-to-inspect
  stays `!_lodOn`-gated (pre-existing — `evtToGrid()` has no LOD-zoom awareness); flagged as a follow-up.
- **v0.88 — two owner-reported items** (no engine changes; render battery ALL IDENTICAL to v0.87,
  headless **911 → 917**, smoke **113 → 117**): (1) **LOD zoom capped too shallow** ("highest zoom stops
  at 20km, want 5km") — the ×64 zoom cap was fixed regardless of map width, and `updateScaleBar()` divided
  by the *full* map width even while LOD-zoomed in (the bar's reading never actually changed as you zoomed,
  reading as "stuck"). New `lodMaxZoom()` (scales to `mapWidthKm/5`, floor 64) replaces the ×64 cap at all
  three zoom sites (button/wheel/pinch); new `lodSpanKm()` (the real on-screen width — `mapWidthKm/_lodZoom`
  while LOD is on) now feeds the scale bar. (2) **Export/Import took the atlas separately** — retired the
  standalone **Export atlas…**/**Import atlas…** action pair (header + Tiles & LOD sidebar) and the
  **Embed baked atlas** checkbox; `exportZip()`/`loadZip()` already unconditionally embed/restore the atlas
  + asset library, so **File → Export .zip**/**Load project .zip** are now the sole 100%-round-trip actions.
  The Assets Library's own **Import pack…**/**Export pack .zip** stays as the dedicated asset-pack-only
  pair, per the owner's ask. Both items UI/browser-chrome only ⇒ bit-identical render.
- **v0.87 — two owner-reported UI items** (no engine changes; render battery ALL IDENTICAL to v0.86,
  headless **911** unchanged, smoke **111 → 113**): (1) **LOD/atlas viewport regression** — in LOD mode the
  CSS transform is identity, so the canvas sat at its intrinsic GW×GH size (small tile in a big viewport).
  New `_lodFitCanvas()` letterbox-fits the `#view` element to the `.canvas-wrap` content box while `_lodOn`
  (cleared on exit); transparent to LOD input since `evtToGrid`/LOD-pan read `getBoundingClientRect()`;
  called from `applyView()` + window resize. (2) **Import + Export merged into one "File ▾" header menu**
  (`#fileMenu`, Import section + Export form) — all element ids unchanged so wiring is untouched; the
  `#exportMenu` CSS retargeted to `#fileMenu`; single-shot Import rows + Export .zip close the menu, form
  clicks don't.
- **v0.86 — seven owner-reported fixes/additions** (no engine-simulation changes; render battery ALL
  IDENTICAL to v0.85, headless **909 → 911**, smoke **103 → 111**): (1) **climate redraw** — added a
  `_climGen` counter (bumped by the climate field-writers) to `_civBakeKey`/`_lodRenderKey`, so "Simulate
  weather" repaints instead of serving a stale bitmap; (2) **mobile Assets exit** — the header 🎨 button is
  now a toggle ("← Map", `_carExitAssetsMode`), always visible; (3) **mobile Export dropdown** — pinned to
  the viewport at ≤860px so it no longer clips off-screen; (4) **Layers-popover scroll** — `stopPropagation`
  on the popover's wheel so scrolling the list no longer zooms the map under it (all 31 views already have
  legends — now smoke-locked); (5) **Credits & academic-principles modal** (header ⓘ) — code sources
  studied + the tectonics/climate/civ academic principles, all cited; (6) **Light theme switch** (header
  ☀/🌙, ported from V1.915's Light theme) via `:root[data-theme="light"]` + localStorage, UI-chrome only so
  the map canvas is untouched; (7) **geological Resources layer** — the sea-level handler now invalidates
  the whole affordance/civ derived-cache set (was stale on sea change), and `buildResourcePotentials`
  computes over the **full map** (bedrock potential exists below sea too) instead of masking to exposed
  land. Bit-identity preserved throughout (all changes are UI/off-default-render or debug-view-only).
- **v0.85 — mechanistic collapse/recovery timeline simulator** (owner: "research the mathematics in regards
  to population mechanics (survival and migration rates…) and how to use this new function in regards to the
  timeline"). New `docs/research/collapse-timeline-dynamics.md` (network-robustness/gravity-migration/
  Black-Death-mortality-calibration sourcing) backs a year-stepped simulation: per-settlement stress (trade-
  dependency loss / density-connectivity exposure / undefended-violence exposure, weighted by a **character**
  — trade/disease/conflict/mixed, each fails settlements in a different order) drives mortality + out-migration
  each step; a Zipf/Ravenstein **gravity model** redistributes survivors to reachable settlements (headroom-
  capped, overflow = unplaced diaspora loss); shrunken nuclei demote/abandon past the v0.82 tier floors; a
  **recovery** mode instead compounds logistic regrowth toward each settlement's own catchment ceiling. All
  new functions are pure and deterministic (`_civProximityAdjacency`/`_civBetweennessFromAdjacency`/
  `_civSettlementStress`/`_civMortalityMigrationRates`/`_civGravityMigrate`/`_civCollapseStep`/
  `_civRecoveryGrowthStep`/`_civSimulateTimeline`); the impure `_civRunCollapseSimulation()` wiring reads
  `state.places`, runs the simulation, and writes **one `civTimeline` entry per step** — the *existing*
  timeline slider/pills scrub through simulated history with no new rendering code, since the entries are
  shaped exactly like `civAddYear`'s. New "Simulate collapse / recovery" UI under Civilization → Polity (mode/
  character/severity or regrowth-rate/start-year/duration-per-step + a Simulate button + a stats summary).
  **Never touches `state.places`/`civWays`** — same rule every other timeline write follows. Civ layer (block
  2) only; render battery ALL IDENTICAL to v0.84, headless **909** unchanged, smoke **86 → 98** (pure-function
  correctness + UI wiring, all via Playwright since these are block-2 functions the headless suite can't see).
  Browser-verified end to end on a real auto-populated world (screenshots: panel, configured run, post-
  simulate timeline pills/slider, Explore tab) — 0 console errors, correct entry count and stats. **Deferred**
  (doc §8): new-settlement founding from refugee overflow, true travel-cost distance (currently straight-line
  ×cellKm), regrowth-phase migration (recovery mode is currently single-settlement logistic only, no
  redistribution).
- **v0.85 audit pass (same day)** — five defects found and fixed in a post-ship review of the simulator:
  baseline-centrality map misaligned after any step-0 settlement failure (now `normBByTid` over INPUT
  settlements); annual rates applied once per multi-year step (now compounded `(1−m)^stepYears`, matching the
  recovery stepper and doc §4's Black Death calibration — collapses at default 10-yr steps are now an order of
  magnitude stronger and correctly calibrated); gravity overflow dropped at saturated destinations instead of
  re-flowing to open headroom (doc §5 semantics restored via bounded multi-pass allocation); phantom year-0
  era when simulating onto an empty timeline (civAddYear's v0.62 guard applied); silent overwrite of authored
  timeline years (now confirm()-gated). Smoke **98 → 103**; render battery still ALL IDENTICAL to v0.84,
  headless 909 unchanged. CHANGELOG has the full per-defect detail. NOTE for future sessions: block-2 (civ
  layer) functions are **not reachable from `tests/run.sh`** (it extracts script block 1 only) — put their
  assertions in `tests/perf/smoke_gen1.js`, and don't trust a green 909 to say anything about civ-layer code.
- **v0.84 — fix: restored the "Vertical" sublabel over Sea level/Peak** (owner report). v0.83's Map-width
  removal over-deleted a section heading unrelated to the ask. Pure markup restore; render battery ALL
  IDENTICAL, headless 909, smoke 86 unchanged.
- **Settlement-editor "disappeared" report — investigated, not reproduced.** Tested four realistic flows on
  v0.84 (direct `_civSelectedPlace` API, simulated canvas click via the Inspect tool, right-click "Edit"
  context-menu item from both the Civilization and Explore tabs) — all correctly open the pinned inspector
  editor with 0 console/page errors. Full smoke suite (86/86, including inspector-visibility assertions)
  green. **Next session: get exact repro steps from the owner** (which tab/tool, what preceded it — e.g. did
  it follow running Auto-populate with Recovery phase set, or a save/load, or a specific settlement count)
  before changing anything — no fix was applied since no failure could be triggered.
- **v0.83 — map width removed from the Generate → World sidebar; setup-gate-only** (owner request). Since
  v0.70 the sidebar carried a disabled, read-only `#mapw` copy ("shown for reference") duplicating the real
  editable width input in the setup gate. Removed the duplicate row + its reference legend entirely — map
  scale is now set in exactly one place (New-world/Import gate). Pure UI + dead-handler cleanup (removed the
  unreachable `bind('mapw',…)` that would have thrown, and the now-moot finalize-lock exemption); render
  battery ALL IDENTICAL to v0.82, headless **909**, smoke **86** (2 assertions updated for the removed
  elements). `state.mapWidthKm` semantics/usage sites unchanged — only where it can be entered changed.
- **v0.82 — post-collapse recovery model** (owner: "start it too"; `docs/research/settlement-emergence.md`
  §5–6). Auto-populate can model a world rebuilding after a demographic collapse, below the ecological ceiling.
  Recovery-phase selector under Civilization (`_civRecoveryPhase`: Stable · I Survival · II Subsistence · III
  Regional · IV Mature). Pure `_civApplyRecovery` scales populations by a phase fraction and applies the doc's
  **labour-shortage demotion** — a nucleus scaled below its tier floor drops to the tier its people support
  (former city → village), and a demoted urban site becomes a **fortified settlement in its ruins** (`p.ruins`
  + `fortified` trait); Survival/Subsistence abandon tiny unanchored nodes. Default Stable ⇒ auto-populate
  byte-identical; render battery ALL IDENTICAL, headless **909**, smoke **84 → 86**. Browser-verified the full
  Phase I–IV trajectory (Stable 93k → Survival 6% + ruins → … → Mature 81%). **Deferred follow-ups**: ruin-reuse
  *placement* bias (not just re-scoring the placed set) and surplus-gated *growth over time*.
- **v0.81 — capacity-grounded, map-size-dependent, automatic settlement populations** (owner design doc →
  `docs/research/settlement-emergence.md`). Auto-populate now derives population from the **energy-system
  model**: a settlement's population is what its catchment land sustains (carrying capacity K × the agrarian
  ceiling `AGRARIAN_MAX_KM2=200`, over per-tier real-km² catchments → **depends on map size**) plus, for
  exchange tiers (town/city/capital/metropolis), a centrality-weighted share of a regional urban pool
  (`_CIV_URBAN_SHARE=0.09`) — the option-1-vs-2 **synthesis** (capacity-first base + exchange-node
  concentration; the doc's §3 "a city is the exchange node"). Per-tier `_CIV_CATCHMENT_KM2` /
  `_CIV_SURPLUS_FRACTION` / `_CIV_TRADE_K` / `_CIV_POP_CAP`. The regional total is a **base calculation** run
  at the end of auto-populate (the v0.76 "Estimate" button is retired; the readout auto-updates). Civ layer
  only, render battery ALL IDENTICAL, headless **909**, smoke **83 → 84**. Browser-calibrated at 400/800/2000
  km (tiers in-band, scale with map size). **Next: v0.82 post-collapse recovery model** (Phase I–IV,
  ruin-reuse, labour caps, surplus-gated growth) — owner asked to start it; foundation is these
  capacity-grounded populations.
- **v0.80 — quality-default + persistence fixes + mobile header fix** (owner: "apply all fixes and
  optimisation; check the UX/UI on mobile"). Headless **909**, smoke **83**. (1) **Ocean currents ON by
  default** (`climate.currents` false→true) — cheap, integrated, adds warm/cold coastal-climate realism.
  Like `carveRivers` (v0.145) this is an intentional default flip: **default render no longer bit-identical
  to v0.79** (currents-off reproduces it); `loadZip`'s `==null?false` guard keeps pre-v0.80 saves exact.
  Albedo/seasons stay opt-in (albedo forces the CPU temp path; seasons is heaviest + changes annual→seasonal
  field meaning) — deliberately NOT flipped, to avoid a perf regression. (2) **LOD sculpt-edit persistence** —
  `_lodEdits` now save as sparse (index,value) deltas over the deterministic procedural base (reconstructed
  via `pyramidTile` on load); closes the "un-baked tile edits lost on save" gap. Nothing written when there
  are no edits. (3) **Mobile header fix** (≤860px): header was ~123px tall with **Export ▾ off-screen** on a
  ~390px phone — fixed with `flex-wrap` (buttons wrap to a reachable second row), `#undoMem` hidden, compact
  one-line `h1`; header **123→80px**, no clipped buttons/overflow. Rest of the mobile UX audited sound
  (slide-in drawer, no `aside` overflow, enlarged touch targets, 16px inputs). Browser-verified all three;
  the one rare headless flake is a pre-existing `Math.random()` noise test (test_tail.js:1707), not currents
  (deterministic per seed).
- **v0.79 — deep-zoom oxbow-lake pockets** — closes the last flagged river-morphology deferral (v0.72's
  "oxbow cut-off geometry, needs centerline curvature tracking"). Engine (block 1), opt-in (Burn-rivers
  toggle), never in `generate()`/default render ⇒ **render battery ALL IDENTICAL to v0.78**, headless
  **903 → 909**. `featureDetailPass` gains an oxbow term revealed only at **z≥9** (`zo` ramps across z9..z10;
  z≤8 byte-identical): a rare ridged-noise blob field gated to the floodplain band beside order≥3 channels,
  carved to a shallow water pocket. Seam Δ=0 (pure world-coord noise + shared LUT), carve-only, floor-bounded.
  True cut-off geometry (vector centerline tracking) still out of scope per LOD tile; this is the seam-safe
  LOD approximation. **Browser pass owed**: the pockets at z9–z10 on a real floodplain; noise-sample perf.
- **Settlement-density research deferrals — COMPLETE** (`docs/research/settlement-density.md`).
  v0.75 (metropolis §5) · v0.76 (village density §6 + regional-pop estimate §3) · v0.77 (wetlands
  carrying-capacity §2b) · v0.78 (transport transfer-overhead §5c) all shipped, each opt-in / default
  bit-identical. The last item — the **Mediterranean-scrub residual calibration** (§9 Q5) — is now resolved
  by a sourced follow-up: the Roman-Italy anchor (Beloch ~15–20/km²; Frier Latin West ~17/km²; Hin 2013)
  **confirms** `shrub`'s existing residual 0.95 + intensify 0.40 (dense but rain-fed Mediterranean dry-farming),
  so no code change was warranted — the doc's §9/§2a/References were updated with the citation instead of
  changing a well-calibrated number. All five §9 open questions are closed.
- **v0.78 — transport transfer/handling overhead** (settlement-density §5c, the "pathfinding for routes"
  strand). Civ layer (block 2) only, **engine bit-identical to v0.77** (headless **903**, render battery ALL
  IDENTICAL — journeys are transient, never in the battery), smoke **81 → 83**. Wiseman et al. 2024:
  transshipments (land↔water mode-changes) add ~5% cost each, compounding, independent of distance. New pure
  `_civTransshipments()` / `_civTransferOverhead()`; `_jpPlan` carries `transshipments` / `transferOverhead`
  / `handlingDays` (additive — travel `days` unchanged), and the journey inspector shows a **Transfers** row
  when the route changes mode (browser: a 95%-water port route → 1 transshipment, +5%, +0.5 d). **Browser
  pass owed**: the Transfers row on multi-leg land↔sea itineraries; whether 0.5 d/transfer feels right.
- **v0.77 — wetlands/marshes carrying capacity** (settlement-density §2b) — first density track to touch
  the **engine** (block 1, headless-testable). `buildBiomeRaster` (fed to K) had no wetlands class; Wetlands
  lived only in `buildCartBiome`'s `CART_BIOMES`. New pure `buildWetlandMask()` uses the exact same
  moisture+flatness+low condition, so the two pipelines finally agree (smoke asserts cell-for-cell match).
  `buildCarryingCapacity(opts.wetMask)` overrides a wetland cell's residual with `WETLAND_DENSITY_RESIDUAL=0.70`
  (productive but malaria/flood friction); `estimateRegionalDensityKm2(wetMask)` uses
  `WETLAND_INTENSIFY_ELIGIBLE=0.95` (managed-wetland/raised-field intensification). Rides the **Biome
  carrying-capacity** toggle (`_biomeK`, default off) ⇒ **default field + render bit-identical to v0.76**;
  headless **897 → 903**, smoke **79 → 81**. `_wetlandMask` invalidated in lockstep with `_carryCapField`.
- **v0.76 — dense village-grid placement mode + regional-population estimate** (settlement-density §6/§3).
  Civ layer (block 2) only, **engine bit-identical to v0.75** (headless **897**, render battery ALL
  IDENTICAL), smoke **75 → 79**. (1) **Dense village grid** (`_civVillageDensity`, checkbox, default off):
  wires the v0.69 `suppressionRadiusCells(VILLAGE_SPACING_KM,…)` helper into `_civIterativeAutoWorld` (when
  tier counts are blank) — seeds at the ~10 km site-catchment spacing instead of ~market-town, ~3–4× denser,
  capped at `_CIV_VILLAGE_CAP=200` pins (browser: 40 → 200). (2) **Regional-population estimate**
  (`_civRegionalPopulation()` + button): integrates the persons/km² field over land (+ per-faction over
  painted territory) for real totals without a pin per hamlet (browser: ~254k over ~190k km², ~1.33/km²).
  Both opt-in/read-only ⇒ auto-populate byte-identical when off. **Browser pass owed**: does the 200-pin cap
  feel right, and are the estimate's absolute numbers sensible across biome-K on/off?
- **v0.75 — imperial-seat (metropolis) tier** (settlement-density §5). Civ layer (block 2) only,
  **engine bit-identical to v0.74** (headless **897**, render battery ALL IDENTICAL), smoke **72 → 75**.
  Adds a rare **Metropolis ★** class above Capital, placed by the sourced ceiling-breaking rule (Lawrence
  et al. 2016: post-2000 BC growth = administrative/taxation capacity, proxied by betweenness centrality ×
  polity size). New pure `_civSelectMetropolises()` promotes a capital with normalised betweenness ≥ 0.85
  that is also the seat of a ≥6-settlement faction; ≤1/faction, ≤3 total; base pop 45,000, scaled by the
  existing centrality multipliers (browser probe: ~133k on a dominant hub). Gated behind the
  "Imperial-seat tier" checkbox (`_civMetropolis`, default off ⇒ auto-populate byte-identical; skipped when
  tier counts are fixed). Frozen pack-slot vocabs untouched (procedural ★ fallback). **Browser pass owed**:
  metropolis feel across seed variety — is one imperial seat per large polity the right rate, and is base
  pop 45,000 / the betweenness threshold 0.85 tuned to taste?
- **v0.74 — "Bake all levels & finalize world" promoted to the top of Generate → World** (owner
  request). The finalize button was buried two collapsed disclosures deep (*Tiles & LOD → Atlas*),
  so committing a world to the Atlas phase meant hunting for it. A new **Finalize world** section
  (`#finalizeSec`) is now the first block of Generate → World (above Geology), hosting the bake-depth
  picker + **🔒 Bake ALL levels & finalize world** / **🔓 Un-finalize** buttons. Pure DOM-position
  relocation: the moved elements keep their v0.62 ids (`bakeAllDepthRow`/`bakeAllDepth`/`bakeAllBtn`/
  `unfinalizeBtn`) so `applyFinalizedUI()` and every handler are unchanged; per-view bake / clear /
  export stay under *Tiles & LOD → Atlas*. Banner/chip/alert text re-pointed to "the top of Generate →
  World". **Engine bit-identical to v0.73** (render battery ALL IDENTICAL; headless **897** unchanged),
  smoke **71 → 72** (+1 asserting the bake button is the first `<button>` in `#genWorld`, in
  `#finalizeSec`, not behind a `<details>`). Verified in-browser (screenshot).
- **v0.73 — economic land/sea routing + settlement-waypoint pathfinding** (owner report: routes
  ignored a cheaper/more-direct sea leg and bypassed settlements they passed instead of stopping).
  Civ layer (block 2) only, **engine bit-identical to v0.72** (headless **897** unchanged), smoke
  **68 → 71**. Owner chose *both* systems + *soft-attract, capped detour*. (1) **Settlement gravity**
  (`_civApplySettlementGravity`) — a capped, radius-limited (~RW/80) cost discount around every
  settlement, applied to the Route-tool grid (`_civDijkstraPath`) and both auto-network passes
  (`_civHierarchicalNetwork`); a least-cost path now bends *through* settlements near its corridor
  (they become stops) but never detours far, and — only finite cells discounted — never carves water.
  (2) **Economic sea** — mixed-grid water cost 2.2 → **1.5** (`_CIV_WATER_COST`) so a >~1.5× land
  detour loses to the sea leg; a mostly-water committed route auto-flags a sea voyage
  (`_civPathWaterFrac`≥0.5) so the planner picks a vessel. (3) **Sea-net augmentation** — each port
  also gets a direct lane to its nearest sea-reachable port (not just the MST spine). (4) **Stops**
  row in the journey planner (`_civPassedSettlements`, derived/transient, not serialised).
  Verified in-browser (routing probe + before/after screenshot); smoke uses a deterministic
  settlement-*injection* gravity test. **Browser pass owed**: feel of the auto-network on varied
  worlds (are the coastal roads vs sea lanes sensible?), and tuning of `_CIV_WATER_COST`/gravity
  strength to taste.
- **v0.72 — deep-zoom river morphology (tributaries + local incision).** Finishes the river-lod
  brief's LOD10+ tier by extending `featureDetailPass` (z≥8, behind the Burn-rivers toggle): the trunk
  thalweg locally incises deeper with zoom, and a **dendritic tributary creek network** (ridged
  value-noise, catchment-gated to a trunk channel's valley influence `Rt=2.5+order`, land-only) reveals
  itself. The noise is a pure function of world coords + the coarse Strahler LUT, so **seam Δ=0** (even
  with the z≥7 meander wobble on); carve-only under the sea−0.06 floor (deep ocean never raised).
  Strictly gated above z=7 (`zt=clamp((z−7)/3)`) — z≤7 output is byte-identical to v0.71 even with the
  depths forced high. Engine bit-identical to v0.71 (opt-in; never in `generate()`), headless **890 →
  897** (+7), smoke **67 → 68**. Deferred: oxbow cut-off geometry (needs true centerline curvature
  tracking) and the Rust/WASM port (JS-first per owner). **Browser pass owed**: the tributary network
  and incision at z8–z10 on a real world; perf of the ridged-noise pass on 1024² tiles at deep zoom.
- **v0.71 — zoom-dependent feature rendering** (owner goal + the river-lod / rust-lod render briefs),
  three stages in one version, engine bit-identical to v0.70, headless **890** (+26), smoke **67**:
  (1) **persistent feature registry** — rivers as objects (Strahler polylines, discharge, hydrology
  width, length), fjord/canyon components, peaks; `featuresNear`/`riversInRect`/`featureSummary`
  query API; `features.json` export (features survive baking); cached as `_featureReg`, invalidated
  with `_riverNet`. (2) **LOD render caches** — per-tile canvas LRU keyed on `_lodRenderKey` +
  pan-reuse of the coarse overview; `_lodEditGen` guards edits; pixels identical, computed once.
  (3) **`featureDetailPass`** — zoom-revealed morphology on refined tiles behind the Burn-rivers
  toggle: river valley cross-sections ∝ Strahler order (z≥4), fjord wall steepening (z≥3), canyon
  incision (z≥4), meander wobble (z≥7, deterministic world-coord wave); seam-safe, opt-in (no
  grids ⇒ byte-identical), floor never raises terrain. Tributaries + local incision landed in v0.72;
  still deferred (briefs): oxbows, Rust port (JS-first per owner).
  **Browser pass owed**: LOD pan/zoom feel with the caches, the revealed valleys/fjords/canyons at
  deep zoom on a real world, cache memory pressure on 8K worlds.
- **v0.70 — bug-fix batch + map-scale locked at creation.** Four owner-reported bugs, each reproduced
  in a real browser before fixing (see `tests/perf/` probes), engine bit-identical to v0.69, headless
  **864**, smoke **61 → 65**: (1) **`roadDijkstra` crash on imported heightmaps** — `dist` was Float32 but
  priorities Float64, so the uniform imported cost grid re-pushed cells until the heap overflowed 2³²; fixed
  with a `visited` source-finalization array (output-identical, auto-populate 127 s→4 s). (2) **imported
  worlds had no rivers** — `inferTectonics` never ran `computeFlow`; now does climate→flow so `flowField`
  populates. (3) **~900 plates on import** — `pickPlateSeeds` capped at 40. (4) **sea level didn't move the
  coastline** — `_civBakeKey` omitted `state.seaLevel`, so the cached bitmap was reused; added it. Plus **map
  width locked** in the sidebar (`#mapw` disabled, exempt from the finalize re-enable) — set at creation in
  the gate. **Next track: zoom/scale-dependent feature rendering** (fjords/rivers/canyons/mountains by zoom)
  — the owner's larger ask, overlapping the river-LOD + LOD-perf roadmap; research/plan queued (task).
- **v0.69 — settlement density (sourced).** First of the three research-doc tracks the owner
  supplied (`docs/research/settlement-density.md`; river-lod + rust-wasm briefs also committed for
  later tracks, JS-first, Rust deferred). Pure/CPU-path additions, **engine bit-identical to v0.68**
  (biome term defaults off; density field additive, never in `generate()`); headless **864** (+12
  calibration), smoke **61**. Added: `foragerFloorKm2` (NPP→forager density), biome-residual
  `buildCarryingCapacity` behind `opts.biomeK` (default 0 = byte-identical; opt-in checkbox flips
  `_biomeK`), `estimateRegionalDensityKm2` (persons/km², water-gated agrarian ceiling) surfaced as
  the **"Pop density"** debug view + `population_density.f32` export, and `suppressionRadiusCells`
  spacing helper (not yet wired into placement). Deferred v0.70 candidates: metropolis tier,
  village-density placement mode, Wetlands carrying-capacity, Mediterranean-scrub calibration.
  Roadmap after density: JS LOD/renderer perf refactor → river-as-feature LOD → (later) Rust/WASM.
- **v0.68 — fix: sidebar was live during the v0.67 setup gate.** The gate modal lives inside
  `.canvas-wrap` so it only covered the canvas; the sidebar (a sibling `aside`) stayed clickable,
  and its Generate→World sliders (sea/climate/weather) acted on the empty pre-commit field — the
  "sea level/climate/weather seem broken" report. The committed sim was verified fine. Fix:
  `body.setup-gated` (toggled in `_setupOpen`/`_setupHide`) dims + `pointer-events:none` the
  sidebar until a world is committed/loaded. Engine bit-identical; headless **852**; smoke **59**.
- **v0.67 — setup gate + scale/height calibration.** The app no longer auto-generates on load;
  a **hard setup gate** blocks the canvas until the user commits base settings (the old
  once-per-browser `cartalith_onboarded` flag — why the card "didn't load on opening" for
  returning users — is retired). Boot: browser allocates + renders empty + opens the gate;
  **headless (no indexedDB) keeps the old auto-generate path verbatim**, so 852 + bit-identity
  are byte-unchanged. Gate (`_setupOpen`): intro (Generate/Load/Import, no Skip) → generate form
  (resolution, extent, center, scale & calibration with **km/mi** toggle + distance legend, peak)
  → **Commit** runs `generate()` once; heightmap Import → calibrate form → **Commit** auto-runs
  `inferTectonics()`. **Peak auto-suggest** `suggestPeakM(w)=round(8849·(1−e^(−w/1330)))` (800→4000
  preserved, caps ~Everest). **Scale-aware 3D** `_v3dEffExag()` normalizes the drape exaggeration
  by the true relief:width ratio (default look bit-identical; whole-world auto-flattens). Units are
  a localStorage pref (km + m canonical). Engine bit-identical to v0.66; headless **852**; smoke
  **50 → 57**. Also fixed the header chip that read v0.65 in v0.66. Browser pass owed: 3D feel
  across scales, live units toggle, import→infer with a real DEM.
- **v0.66 — IA CORRECTION (owner-directed): the Generate branch menu is restored.** v0.64 had
  retired the Generate sub-tab bar and moved Civilization + Cartography into Explore, following
  the research proposal's §3 — but contradicting the owner's intended IA. The shipped structure
  is now: **Generate** (authoring) = sub-tabs **World | Civilization | Cartography**, with the
  pinned Selection inspector under the sub-tab bar shared by Civ+Carto, and the tool palette
  split per branch (Civ: Inspect·Settlement·POI·Territory·Way; Carto: Inspect·Label·Icon) —
  all buttons drive the one `_civSetTool` machine; **Explore** (planning) = Info·Route tools,
  Journeys, Journey planner, canvas filter funnel + timeline. Entering Explore auto-arms Info.
  Paint re-gated to Generate→Cartography. Bundled fixes: Un-finalize button no longer disabled
  by the finalize lock (bug since v0.62); active sub-tab label no longer amber-on-amber; stale
  "Edit →" path strings updated. Engine bit-identical to v0.65 (checksums unbroken to v0.62);
  headless **852 green**; smoke suite rewritten for the corrected IA, **41 → 50** green.
  **`docs/research/ui-ux-upgrade.md` §Status carries a correction note superseding §3's
  re-homing — do NOT re-apply "Civilization and Cartography live in Explore".**
- **v0.65 — UI/UX overhaul, the remaining scope cuts closed out.** Engine bit-identical to v0.64
  (checksums byte-equal all the way back to v0.62; headless **852 green** throughout);
  `tests/perf/smoke_gen1.js` grew **27 → 41** Playwright assertions. `docs/research/ui-ux-upgrade.md`
  §Status now shows every stage genuinely complete, not just scoped-down. (1) **Full pinned
  inspector**: the settlement/POI/label edit forms (name/kind/pop/history/…) now render IN the
  pinned inspector itself, not inline in the lists — `_civRenderSettlementList`/`_civRenderPoiList`/
  `_civRenderLabelList` only render rows + selection highlight now; `_civSelectedRowRefs` preserves
  the old inline version's live-row-patching optimization (no full list rebuild per keystroke) by
  handing the currently-selected row's DOM refs to whichever editor the inspector renders. Extended
  to a third group, the Placed-Icons list's own per-instance editor, so selection is single across
  all three (place/label/icon instance) — picking one clears the others. Caught and fixed a stale
  bug along the way: the label list's delete handler only refreshed the label list itself, leaving
  a deleted label's editor stuck on screen. (2) **Per-layer hotkeys** (§4.10): bare-key shortcuts
  (B/T/F/S/W/R/0) for the Layers popover's most-reached-for views, badge shown in the popover,
  guarded against firing while typing in any input. (3) **Assets/Export promoted to header
  utilities**: the tab bar is now a genuine two-position Forge/Atlas phase switch (just Generate +
  Explore) — Export became a header dropdown (`#exportWrap`, mirrors Import ▾ but stays open across
  internal clicks since it's a form, not a one-shot action list) and Assets became a plain header
  button (`_carEnterAssetsMode`) that enters the same full-viewport Asset Library takeover as
  before; exiting is automatic (clicking Generate/Explore always restores the canvas — no `_activeTab`
  changes were needed since Assets/Export never touched that variable's only two remaining
  consumers). Browser pass owed: the relocated inspector's feel end-to-end, the hotkeys in daily
  use, and the header Export/Assets controls.
- **v0.64 — UI/UX overhaul completed** (the stages v0.63 deferred). Engine bit-identical to
  v0.63 (checksums byte-equal all the way back to v0.62; headless **852 green** throughout);
  `tests/perf/smoke_gen1.js` grew **12 → 27** Playwright assertions. Highlights: **Edit tab +
  Generate sub-tab bar retired** (Generate is World-only; Tiles & LOD moved into Generate →
  World; Undo moved to the header; Civilization + Cartography moved wholesale into Explore);
  **"Places & roads (terrain)" retired outright** (engine functions kept, UI gone — it shared
  `state.places` with civ settlements, so its "Clear places" could silently wipe them, a real
  landmine now closed); a unified 9-button tool palette replaces every scattered `data-civtool`
  control, with Label + Icon newly folded into `_civTool`; a lightweight pinned selection
  inspector (later made "full" in v0.65); danger accents + confirm-when-non-empty on 3 destructive
  Clear buttons that had none before.
- **v0.62 — civ-layer UX batch + finalize milestone (user request).** Engine bit-identical to
  v0.61 at defaults (checksums byte-equal; 848/848 green). (1) Economy+Politics merged into one
  **Polity** section + an **∅ Unclaimed** faction pill (paint to erase territory). (2) Timeline
  slider fixed (phantom "0 AD" era on first Add-year killed; mid-drag rebuild no longer resets
  the thumb via `_civTlDragSrc`) and **twinned** — `#civTlSlider` in Polity + the Explore slider
  share `_civWireYearSlider`. (3) Places gain a persistent **History** field; POIs get their own
  collapsible list (`#civPoiList`, expand-in-place editor like settlements); **right-click
  context menu** on the viewport (edit/move/delete nearest, drop settlement/POI, info) with
  `e.button` guards so the right button never sculpts/drops. (4) **Bake ALL levels & finalize**:
  `bakeAllTiles(depth)` bakes the whole LOD pyramid (select 2–5) into the atlas, then
  `state.finalized` locks Generate → World (3D dials exempt), banners the panel, and guards
  `generate()`/`confirmRegenerate()`/`_manualTerrainActive()` — the project becomes a
  cartographic LOD viewer/editor; un-finalize reverses. Headless-proven: finalized `generate()`
  is a byte-exact no-op. Also: `docs/research/ui-ux-upgrade.md` (researched UI/UX proposal,
  phase-based IA / layers popover / disclosure / inspector patterns, staged rollout).
  **Browser pass owed**: Polity flow, slider drag feel in both places, POI list + History
  editor, context menu, full bake → finalize → viewer flow.
- **v0.61 — sync-`generate()` contract restored (repo review fix).** v0.6's
  `async buildTectonicSubstrate()` refactor made `generate()` await unconditionally, breaking
  the v0.135 invariant that `generate()` completes synchronously when no worker pool is engaged.
  Headless fallout: flat `rainField` for unawaited callers → 32 suite failures + a crash that
  aborted ~200 assertions. Fixed by making `buildTectonicSubstrate` return `false` synchronously
  on the no-pool path (Promise only on the pool path); `generate()` awaits only a Promise.
  Proven: suite **848/848 green**; FIELD/TEMP/RAIN/FLOW FNV checksums bit-identical to
  v0.6-awaited at seed 12345/256px. Now **Invariant 12** in `CLAUDE.md`.
- Same batch (repo hygiene): settlement-seed test no longer hard-crashes the suite on an empty
  seed list; `tests/run.sh` defaults to the newest Gen1 file (exec bit restored); dead merge
  tooling swept into `legacy/` (see `legacy/README.md`); `CLAUDE.md` slimmed to architecture +
  invariants with the 108-entry version log moved to `CHANGELOG.md`; real `README.md`.
- **Browser passes owed** (headless can't see these — accumulate from recent versions):
  the v0.6 3D drape view (orbit/pinch camera, drape re-upload), the `renderNow(rect)` brush
  fast path feel, worker progress/parity for the erosion ops, GPU R32F path, LOD/atlas
  interaction, plus the visual passes listed in recent `CHANGELOG.md` entries.

## How to verify (the discipline we hold)

1. `tests/run.sh` must pass — the full assertion suite (923 as of v0.89, unchanged through v0.95), CPU paths of the engine block. Extend
   `tests/test_tail.js` when adding a stage; stubs in `tests/stub_head.js`. Script block 4 (urban
   morphology, v0.95+) is pure/DOM-free like block 1 and gets its own harness, `tests/run_um.sh`
   (831 assertions, ported from `urban-morphology/tests/`) — but the civ-layer adapter/renderer
   that calls it is block 2, so that half still needs `tests/perf/smoke_gen1.js`.
2. **Cross-version neutrality**: any additive/opt-in change must be proven byte-identical to the
   prior version at defaults — FNV checksums of field/temp/rain (and render where applicable) at
   seed 12345, 256px, region mode. `tests/perf/hash_gen1.js` is the Playwright A/B battery for
   render-path changes.
3. GPU shaders, Web Worker glue, and canvas interaction (zoom/pan/paint/3D) **cannot be verified
   headlessly** — implement, then flag explicitly for a manual browser pass.
4. Commit messages end with the session URL line (see existing commits). Push to the work
   branch; create a draft PR; ask the user if they want it watched.

## Key invariants (full list in CLAUDE.md)

- Don't renumber frozen vocabularies (`BIOME_KEYS`, `KOPPEN_KEYS`, `BTYPE_KEYS`, `LITH_KEYS`,
  `CART_BIOMES`/`CART_TERRAINS`) — save-format stability.
- Worker kernels stay self-contained (rebuilt from `toString()` in the suite — Invariant 11).
- `generate()` completes synchronously when no pool is engaged (Invariant 12 — the v0.6 lesson).
- Nullable fields (`geoidField`, `tideField`, `continentalField`, `orogenyField`, `warpX/Y`,
  `riverMask`) — every consumer null-checks.
- Keep CPU and GPU lapse (`uLapse`) in lockstep.
- World-seam invariant (avg wrap delta < 0.12) is seed-dependent — don't tighten it.

## Next / open

- **Urban morphology (v0.95) — the requested feature is fully shipped; several scope cuts are
  documented, not forgotten.** Faction→culture/tradition mapping (the PoC ships 2 culture
  profiles; every settlement currently generates as `'medieval'` — worth revisiting once/if
  factions carry a culture concept of their own). Full terrain-sourced site GEOMETRY: the port
  currently classifies real terrain into a site TYPE (river/riverthrough/bay/coast/landlocked)
  but the river curve/bridge/harbour placement stays the PoC's own self-consistent synthetic
  generation (mixing synthetic geometry with real `isWater()` was judged unsafe without a full
  redesign — see the CHANGELOG v0.95 entry's reasoning). The PoC's parcels layer and fine detail
  objects (trees/wells/market crosses/cranes/bollards) aren't drawn in the canvas renderer yet
  (kept out of v1 for per-frame draw cost — blocks/walls/streets/buildings are). No era signal
  (`civYear`) drives wall-vs-star-fort epochs over simulated time yet. None of these were asked
  for explicitly; pick up only if the owner wants deeper fidelity.
- **LOD/render performance optimizations — 4 of 6 originally-proposed shipped across v0.93/v0.94**
  (progressive overview rebuild, pooled tile refine, pooled atlas bake, `sampleArr` row-hoisting —
  see the v0.93/v0.94 entries and CHANGELOG for full detail). **Explicitly deferred, not
  forgotten:** (a) palette-function scratch-ification (`snowCol`/`rockCol`/etc.) — designed in
  v0.94, surfaced a genuine nested-call aliasing hazard (`grassCol` calls `ramp3` twice before
  consuming either result — a shared single scratch buffer would silently corrupt colors); needs a
  proper multi-slot scratch design, not a rushed single-buffer one. This is the project's own
  next performance-audit-roadmap item, still open. (b) A 6th proposal from the original list was
  never detailed in this thread — re-derive or ask the owner if further LOD/render perf work is
  wanted. Neither is a known bug or regression.
- **Rivers-as-ways (v0.94) — shipped as an overlay + new default, auto-network builder untouched.**
  `drawRiverWays()` is reusable as-is if a future version wants it wired into more places (e.g. an
  export/print map style). Not queued as follow-up unless requested.
- **Sea/river-aware routing (v0.94) — scoped to the interactive Route tool/journey planner by
  owner decision.** The auto-generated world road network (`_civHierarchicalNetwork`+
  `_civMstRoutes`, used by auto-populate) is still architecturally two disjoint land-only/water-only
  Dijkstra passes and cannot produce a single mixed route between arbitrary settlements — a real,
  separate limitation from the one fixed this version, flagged in the v0.94 research but explicitly
  out of scope. Candidate for a future version if the owner wants the auto-generated network to
  also route mixed land+sea+river.
- **Save/export architecture restructuring — SHIPPED in v0.92.** `docs/research/save-export-architecture-
  audit.md` (read-only audit, 2026-07-13) found the real bloat was `exportZip()` writing overlapping map
  imagery from three independent code paths for the same terrain, and a separate, lower-risk naming/IA
  muddle in "Tiles & LOD" burying "Atlas" two levels deep. Owner's /goal ("carry out the reported fixes")
  shipped both: the audit's §5A (skip the redundant flat bake for a finalized world; make the 4
  `layers/*.png` previews opt-in) and §5B/C (split into Tiled LOD view / Atlas cache / Region export). See
  the v0.92 CHANGELOG entry for the full list. `biome_raster.bin` vs `biome_baked.bin` (the owner's own
  "double data" example) is intentionally **not** touched — the audit found they're two genuinely
  different classifiers for two different consumers, not duplication. Nothing queued from this thread.
- **LOD zoom performance — root-caused and fixed in v0.92, then quality-corrected same day.** Same
  /goal, second half: "why is zooming in slow even when tiles are baked." Real answer (found via
  `performance.now()` profiling, not guesswork): the sharp tile overlay *does* correctly serve from the
  atlas when baked — the actual bottleneck was the "instant overview" backdrop underneath it, rebuilt at
  full `GW×GH` resolution through the same expensive per-pixel colorizer on every zoom step, never
  consulting the atlas at all (~940ms/step measured, identical whether baked or not). First fix rendered
  that backdrop at a flat quarter resolution (12.3-16.6× faster) — but this starved small lakes (no
  `_coastSDF` smoothing outside the ocean coastline) of samples, reported back same-day as "lakes are
  blocky/pixilated again" + "aspect ratio goes weird" (the same artifact, described two ways). Replaced
  the flat ratio with a **512px fixed target output width**, which bounds the overview's cost
  independent of world resolution (~100-130ms at both 1024px and 2048px, vs. the rejected flat-`/2`
  alternative's ~420-440ms at 2048px) while giving small worlds full resolution. A same-day second
  report ("graphic fidelity seems to have degraded also") traced to a *pre-existing* gap the cap
  exposed rather than caused: the `lodChk` checkbox never scheduled the sharpen-on-settle pass every
  other LOD entry point already gets, so ticking it and just looking left the user on the coarse
  overview indefinitely. Fixed by triggering that pass immediately on checkbox-check. All three fixes
  locked in with permanent smoke-suite regression guards (timing + overview-canvas-size/aspect +
  checkbox-triggers-refine). Nothing queued — if the owner reports zooming still feels slow after this,
  the next place to look is the TILE overlay's own per-tile colorization cost (not yet profiled in
  isolation) or the debug-overlay vector drawing pass (`drawLODDebugOverlays`), not the overview
  backdrop these fixes already addressed.
- **The owner's 2026-07-12 /goal (settlement pop-up + Explore timeline rework) is now fully shipped**
  across v0.90 (settlement editor → map pop-up) and v0.91 (timeline: one home, real time-scale — see
  above). No queued follow-up on either; nothing else outstanding from that request.
- The queued work tracked at the end of the pre-merge era (browser passes above) plus whatever
  the user asks next. Check `docs/ROADMAP.md` for the long arcs; recent `CHANGELOG.md` entries
  state per-feature follow-ups (e.g. cross-tile seam editing is the one genuinely open LOD item).
- **Zoom/scale feature-rendering track (owner goal) is now JS-complete** through v0.72: registry
  (v0.71) → LOD render caches (v0.71) → per-zoom morphology valleys/fjords/canyons/meanders (v0.71) →
  tributaries + local incision (v0.72). What remains is explicitly deferred and needs a decision:
  **oxbow cut-offs** (a scalar-field carve can't do them — needs true centerline curvature tracking on
  the river polylines) and the **Rust/WASM engine port** (owner chose JS-first). A full browser pass on
  the deep-zoom morphology (does it read as rivers/fjords/canyons to the eye, and is the ridged-noise
  tributary pass fast enough on 1024² tiles at z8–z10) is owed before calling the visual side done.
