# Cartalith Gen1 — Session Hand-off

**Read this first.** Start-here guide for a new session. Pairs with `CLAUDE.md` (architecture +
invariants + working rules) and `CHANGELOG.md` (per-version history).

## Where we are

- Repo **`Achos0190/Cartalith_RC`**. This repository was seeded as a single snapshot upload
  ("Add files via upload") — the pre-merge development history (the `elevation_foundation`
  v0.036–v0.144 lineage, its branches and PRs) lives in the older `cartalith-gen1` repository
  and in `CHANGELOG.md` here, not in this repo's git log.
- **Current tool file: `Cartalith Gen1 v0.89.html`.** One self-contained HTML file, three
  script blocks (generator engine / civ-politics layer / asset library). The merge is DONE —
  there is no build step; the file is hand-evolved. New version = new file, two-digit minor
  (v0.90 next). Older `v0.57`/`v0.6`/`v0.61`–`v0.88` are kept and never edited.
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

1. `tests/run.sh` must pass — the full assertion suite (923 as of v0.89), CPU paths of the engine block. Extend
   `tests/test_tail.js` when adding a stage; stubs in `tests/stub_head.js`.
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

- **Queued next (owner, 2026-07-12): settlement interface + Explore timeline rework.** The owner's own
  words: "think about the settlement interface for generation and how in explore the timeline should
  work. Currently it works, bit rather clunky. Editing a settlement should open a pop-up menu in the
  viewscreen with the settlement properties and information." This is a design/UX pass, not a bug fix —
  per the working rules ("confirm design before building"), start by exploring the current settlement
  editor (pinned inspector, §4.7) and the Explore→Timeline UI, then propose a design before implementing.
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
