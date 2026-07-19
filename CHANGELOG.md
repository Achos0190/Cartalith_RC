# Cartalith Gen1 — engine changelog

Per-version log of the generator engine, **newest first**. Entries v0.037–v0.144 cover the
pre-merge `elevation_foundation` lineage (that engine is now script block 1 of the merged
`Cartalith Gen1 v*.html`); the Gen1 merged-file line continues above them.

Formatting note: these entries were written as working notes for agent sessions (they double as
the project's memory). Each one states what changed, why, the verification performed
(assertion counts, bit-identity claims at the pinned seed), and any browser passes still owed.

---

## Gen1 merged-file line

### v1.15 (2026-07-19)
**Owner: "integrate this sculpting tool and replace the one that's already in cartalith v1.14. Follow the planning doc and do the integration with the menu setup for the proof of concept as a 1-to-1 refractor."** Full port of `fractal-geology/Fractal Geology Painter v0.1.html`'s stamp-based, non-destructive terrain sculptor into Gen1 per `docs/SCULPT_EDITOR_INTEGRATION_PLAN.md`, **replacing the old "Manual Terrain" accordion** (plotline feature brush + direct paint) entirely. Main's own earlier P0 attempt at this port had been silently overwritten by a later merge (a filename collision), so this was a from-scratch build against the locked plan.

**New 4th Generate sub-tab, "Sculpt"** (`data-gsub="sculpt"`, `#genSculpt`), preserving the tested 2-position top-level tab invariant. **Stamp-based, non-destructive:** paint geological intent (a stroke or a tap) — a 13-entry feature registry (`SCULPT_FEATURES`: mountains/hills/ridge/plateau/cliff/canyon/valley/river/lake/basin/coastline/volcano/freehand, consolidating the PoC's 11 + the retired plotline's 7 + the retired direct-paint's 9) composites a fractal-edge-warped coverage mask (`edgeChar`/`edgeFreqMul` per feature — coastlines/lakes ragged and low-frequency, ridgelines tight and high-frequency) into a **session-scoped DRAFT stack** (`sculptStamps[]`) that never touches `field`, previewed as a translucent outline overlay (off-LOD on `#polyOverlay`; reprojected onto `vctx` from `drawLODView`'s own tail under Tiled LOD, following the same convention `drawRiverWays`/`drawLODDebugOverlays` use) — with its own cheap JSON-snapshot undo/redo independent of the field-level undo stack. **Commit** (`sculptCommit()`) bakes the whole stack into `field` in one pass, then: re-clamps any pre-existing locked river channel a non-river stamp may have raised back to its floor (`enforceRiverChannels()` — the same precedent `carveRiverValleys()` follows), carves+locks new River stamps (`enforceChannelDescent`, same monotonic-descent primitive the retired plotline river tool used), deposits Lake stamps into `lakeMask` (the same array the retired direct-paint Water tool used, so `buildWaterBodies`'s `forceLake` path classifies them as lake regardless of natural pooling), then one `computeFlow(true); refreshClimate();`, one `pushUndo()`, and one `renderNow()` — the map and any open debug/resource view redraw with post-commit data in the same frame. Brush size is stored in **grid cells** (matching the retired brush's own `state.radius` convention), not screen pixels, so its real-world km footprint — shown live in the UI ("≈ X km radius — stays this real-world size at any zoom") — is independent of zoom; pointer capture goes through `evtToGridLOD` uniformly (off-LOD and Tiled-LOD), the same LOD-aware convention the rest of the file already uses for hit-testing.

**New noise/geometry primitives** (script block 1): `sculptFbm`/`sculptRidged`/`sculptBillow` — parametrized wrappers on this engine's own `vnoise()`/`hash()` (shares the base noise primitive with tectonics/erosion), deliberately NOT a reuse of the engine's hardcoded 6-octave/0.5-persistence/2.0-lacunarity `fbm()`/`ridged()` (every sculpt feature needs all three as independent sliders) and NOT the PoC's own standalone classic-Perlin `makeNoise()`; `sculptNearestOnStroke` (closest point on a polyline — distance/signed-distance/arclength/tangent — whose 1-point degenerate case collapses to plain radial distance, letting Freehand's tap-once Mesa/Volcano sub-modes reuse the same geometry as every drag-stroke feature); `sculptStampRadius`/`sculptStampBBox`/`sculptApplyStamp` (the PoC's dirty-rect compositor, unchanged in shape — a stamp only ever touches its own padded bounding box).

**Two real bugs found and fixed via the new test coverage** (below), both in `sculptCommit()`'s river hook: (1) `enforceChannelDescent` has always taken `[x,y]` array-pairs (see `carveRiverValleys`'s own conversion comment for `traceRiverPolylines`' `{x,y}` output), but the river hook passed `st.pts` — `{x,y}` objects — directly, so `pts[k][0]`/`pts[k][1]` silently evaluated to `undefined|0 === 0` and every river stamp carved a tiny disc at grid cell (0,0) instead of along the drawn stroke. Fixed by converting `st.pts.map(p=>[p.x,p.y])` before the call. (2) `sculptCommit()` baked arbitrary non-river stamps (Mountains, Plateau, …) that can raise terrain over an already-locked river channel (from an earlier commit or `generate()`'s own `carveRiverValleys()`) without ever re-clamping it, unlike `carveRiverValleys()` itself (erosion pass → `enforceRiverChannels()` → new carve+lock) — added the same `enforceRiverChannels()` call before this batch's own river carving.

**Old code retired:** the whole "Manual Terrain" HTML accordion; `applyFeatureAlongCurve`/`sculpt()`/`depositWater()`/`renderSculptRegion()`/`brushHeight`/`editTileAt`/`lodEditBegin`/`lodUndo`/`lodPick`/`applyFeatureToLOD`/`renderGuideOverlay`/old `renderBrushCursor`/`clearBrushCursor`/`endPaintStroke`; `guidePts`/`guideRaw`/`guideDrawMode`/`guideCapturing`/`featType`/`featRadius`/`featStrength`/`STAMP_BRUSHES`/`STROKE_BRUSHES`/`_manualTerrainEnabled`/`_manualTerrainActive`/`painting`/`_prevGx`/`_prevGy`/`_lodEdit`/`_lodEditing`/`_lodUndo` and their UI wiring (including two call sites — the invalidation blocks in `generate()`/`centerLandmasses()`/`inferTectonics()` — that referenced the now-removed `_lodUndo`, and three UI-sync lines wiring nonexistent `#brad`/`#bstr`/`#brushSeg` elements, both of which would have thrown at load). Kept (shared infrastructure, not manual-terrain-specific): `enforceChannelDescent`/`enforceRiverChannels`/`carveRiverValleys`, `_lodEdits`(Map)/`composeEditInto`/`composeTileEdits` (the unrelated Tiled-LOD tile-refinement/atlas-baking system), `rdpSimplify`/`catmullRomSample` (still used by `drawRiverWays` and the new sculpt code), `clearBrushCursor`'s call sites (rewired to the new `sculptClearOverlay()`, since the two functions were byte-identical — Cartography's own paint-mode disarm still needed the canvas cleared).

**Verification:** engine `tests/run.sh` **984/984** (923 prior + ~35 new sculpt-engine assertions − ~35 retired plotline/brush/LOD-edit assertions whose subjects no longer exist; noise determinism/range, `sculptNearestOnStroke` geometry incl. the 1-point degenerate case, 13-feature registry shape, `sculptStampRadius`/`sculptStampBBox`, all 13 features' `sculptApplyStamp` output on synthetic grids — finite/[0,1]-bounded/bbox-local/reproducible — hidden-stamp no-op, Freehand's dedicated smooth blur pass, River/Lake water-output + the `waterOnly` dry-run, the fractal edge-warp actually perturbing the footprint, and a live-world draft→commit→undo/discard sequence including the two bugs above); `tests/run_um.sh` **831/831** (script block 4 untouched); `hash_gen1.js` vs v1.14 **ALL IDENTICAL** (no stamps committed by default ⇒ neutral; the accordion removal is DOM-only); `smoke_gen1.js` **211/211** (+8: the 4th sub-tab bar entry, tab mechanics, non-destructive draft, commit's field-change+renderNow+undo-push+stack-clear, Ctrl+Z revert, LOD-mode overlay drawing without throwing, and the km-radius readout tracking brush size). Playwright-probed screenshots confirm the Sculpt tab's palette/presets/sliders/stamp panel, a painted mountain range visible pre-commit as an overlay only, and the same range baked into the rendered terrain post-commit.

### v1.14 (2026-07-19)
**Owner: "there seems a multitude of rivers drawn everytime and in close proximity, almost as if two
different engines are trying to achieve the very same thing (and in a rather poor unnatural looking
way at that)."** Confirmed and root-caused: the report was literal — two separate river renderers
were both drawing the same network on top of each other.

**Root cause.** `surfaceColor()`'s per-pixel raster blend (Strahler/Rosgen width + Beer–Lambert depth,
sampling `_riverNet.intensity`/`depth` directly off the cell grid) and `drawRiverWays()`'s vector
overlay (Catmull-Rom-sampled, sinuosity-jittered spline strokes over the same `_riverNet`) have BOTH
rendered on the main (non-LOD) Biome view since v0.94 — the v0.94 comment literally said "on top of
the existing raster water blend, both render." The vector path's smoothing and its perpendicular
sinuosity jitter (added for visual appeal) deliberately wanders off the raster's exact cell-centerline,
so at anything but dead-center of a wide trunk the two visibly diverge into what reads as a second,
parallel river running alongside the first — worst on terrain with many closely-spaced channels,
exactly the "close proximity... unnatural" complaint. (Under Tiled LOD this pair never existed — the
LOD tile renderer never replicated the fine raster blend in the first place, per its own v0.94 comment
— so this was specifically a main-canvas/non-LOD-zoom artifact.)

**Fix.** `surfaceColor()`'s raster network blend now skips itself whenever `state.viz.riverWays` is on,
matching the precedent the Strahler debug view already established (vector-only, no raster blend
underneath). `riverWays` off keeps the exact pre-v1.14 raster-only render (byte-identical at that
setting — the gate simply guards the existing branch, doesn't touch its body). `riverWays` on (the
default since v0.94) is now vector-only — one river renderer, not two.

**What this does NOT fix (flagged, not built):** a separate, deeper pattern — closely-spaced, near-
parallel single-order channels on certain uniformly-sloped terrain (visually a fine hatch/comb texture)
— showed up in BOTH the raster-only and vector-only renders during investigation, so it isn't a
render-duplication artifact; it's the underlying drainage network itself being dense there (a
flow-routing/channel-threshold question, `docs/research/natural-rivers.md` territory, not a rendering
fix). `state.viz.minRiverOrder` already exists to thin it per-map; a root-cause fix (if wanted) would
be a separate, engine-level pass.

**Verification:** engine `tests/run.sh` **923/923** (`field`/`temp`/`rain`/`flow` hashes identical to
v1.13 — this change is `vctx`-only, no engine data touched); `tests/run_um.sh` **831/831**; `hash_gen1.js`
vs v1.13 shows the INTENDED rgba differences at default settings (riverWays defaults true, so this is a
default-rendering bug fix, not a neutral opt-in change — same category as v1.01/v1.04/etc.); `smoke_gen1.js`
**204/204** (+1: `surfaceColor` at an identical river cell now differs between `riverWays` on/off, proving
the skip-branch is live). Playwright-probed A/B screenshots on an inland trunk-river reach confirm the
fine secondary raster hachure that used to show through/around the bold vector strokes is gone.

### v1.13 (2026-07-19)
**Owner: "3 fixes: the current label system doesn't provide visual results anymore. And the zoom — I should also be able to zoom out to a point that the full width of the map stays in the viewer, currently the furthest zoom-out uses the map height as max view, forcing a user to drag left and right to see everything. When zooming, the clickable information on the map seems to keep its coord to the original zoom level, it doesn't adapt."** Three post-borrow-list bug fixes, all civ/UI layer — engine block 1 untouched.

**#1 — Region/area name labels stopped drawing.** The occupancy-grid collision system (v0.148) treats settlement auto-labels and user-authored region names as equal citizens of one shared grid, and v1.12's multi-candidate settlement placement added *more* boxes to that grid — enough that, on a busy map, the region label's cell was always already claimed by a settlement label, so `drawCivLayer`'s §4 collision test (`if(!lblTest(...)) continue;`) skipped it entirely (owner-reproduced: 0 of 2 region labels drew). Fix: region names are **deliberate cartography** and now take precedence. A pre-pass before the settlement loop reserves each region label's occupancy box (so settlement auto-labels *yield* to the user's names), and §4 draws the region labels **unconditionally** — no collision skip, which also means the selected/just-placed label can never erase itself. Settlement labels still collision-test against each other and against the (now-reserved) region boxes.

**#2 — Zoom-out floored at COVER, not FIT.** The fill-mode floor (v1.01) was `_viewCoverScale()` = `max(availW/natW, availH/natH)`, i.e. the *larger* ratio — it fills the viewport but the map's other axis overflows, so at maximum zoom-out one dimension (here the width, on the region-mode 1.56:1 map in a wider viewport) ran off-screen and forced left/right dragging. New `_viewFitScale()` = `min(availW/natW, availH/natH)` is the scale at which the **whole** map fits (letterbox on the overflow axis). The zoom-out floor in `zoomAt` and `_viewClampFill` is now the fit scale; when the map fits an axis with slack, that axis is **centred** so the letterbox band is symmetric and the map can't be lost off-edge. The **default/reset** view still *fills* (cover) via the new `_viewFill()` — routed through the zoom-reset button, post-generate/import commits, resize, and load — so the initial look is unchanged (no letterbox bands); only deliberate zoom-out past cover now reveals the full map.

**#3 — Clickable info kept the un-zoomed coordinate under LOD.** Zooming in auto-enters the tiled-LOD viewer (`state.lodAuto`), where the canvas shows only `lodViewRect()`'s sub-window — but the left-click civ-tool handler (`view` `pointerdown`) still mapped clicks with plain `evtToGrid`, which assumes the whole `GW×GH` world fills the canvas, landing every click on the wrong world cell (measured ~260 grid cells off at deep zoom). Switched the handler — and the territory-paint `pointermove` — to the LOD-aware `evtToGridLOD` (the same inverse the v0.91 info/wildlife clicks and the v0.95 right-click menu already use; falls back to `evtToGrid` off LOD). So Info/Inspect/Place/POI/Territory/Route/Way all read the correct cell at any zoom.

All three are civ-layer (`civCtx`) / view-transform / input-mapping changes; none touch `field`/`temp`/`rain`/`flow` or the terrain canvas (`vctx`), so cross-version bit-identity holds by construction.

**Verification:** engine `tests/run.sh` **923/923**; `tests/run_um.sh` **831/831**; `hash_gen1.js` A/B vs v1.12 **ALL IDENTICAL**; `smoke_gen1.js` **203/203** (+3: region label draws through a packed occupancy grid; zoom-out floor fits the whole map width AND height where cover overflowed; a deep-LOD left-click reaches `_civInfoAt` with the correct settlement cell while the plain mapping is far off). Fixed-seed Playwright screenshots confirm region labels rendering at the filled default and the whole map — both edges — visible at maximum zoom-out. Canvas pan/zoom *feel* over a real gesture is browser-only (not headless-testable) and was checked manually.

### v1.12 (2026-07-19)
**Owner: "implement the top 6 borrow list from the research."** Sixth and last: `docs/research/azgaar-comparative-analysis.md` §4's #6 pick, label placement + per-layer style editors — "FMG's label engine and restyle-everything panels are the editor-maturity bar." Completes the borrow-list.

**Label placement.** Settlement/POI name labels had exactly one candidate slot (fixed above the pin) since v0.148's occupancy-grid collision system shipped — a lower-priority label whose spot was already claimed was silently dropped, never offered anywhere else. `drawCivLayer`'s placement loop now tries **above → below → right → left** (in that priority order — "above" first reproduces the exact pre-v1.12 pixels whenever it's free, the overwhelming common case) before giving up, via new `lblTestBox`/`lblMarkBox` helpers (explicit `[x0,y0,x1,y1]` screen bounds, sharing the same occupancy grid as the existing point-based `lblTest`/`lblMark` the region-name-label system still uses unchanged). `_civDrawSettlementPin`/`_civDrawPoiPin` gain an `opts.labelPos` parameter (default `'above'`, so every pre-v1.12 call site not yet passing it draws identically) selecting which side of the pin the text renders on. Measured on a deliberately brutal test (five same-tier cities, long names, packed 8 grid units apart in a line — far tighter than any of their label widths): the pre-v1.12 system showed **1 of 5** labels; v1.12 shows **2 of 5** (the second rescued via `below`), with the rest correctly still dropped (the packing is tight enough that no side has room left) rather than overlapping.

**Per-layer style editors.** Two new sliders (Settlements panel, "Layer style"): **Territory fill opacity** (`state.viz.territoryOpacity`, default `130/255` — the exact previously-hardcoded alpha) and **Way opacity** (`state.viz.wayOpacity`, default `1`) restyle those two layers independently of each other, alongside the existing settlement-icon/way-width scale sliders. Both fold into the SAME per-pixel render passes those layers already used (the territory raster-blit's cache key, the ways loop's existing per-condition `globalAlpha`) — no new draw passes, defaults reproduce prior pixels exactly.

Neither change touches `field`/`temp`/`rain`/`flow`/the main terrain canvas (`vctx`) — all civ-layer (`civCtx`) rendering, so bit-identity holds by construction regardless of the specific pixel changes at non-default settings.

**Verification:** engine `tests/run.sh` **923/923**; `tests/run_um.sh` **831/831**; `hash_gen1.js` A/B vs v1.11 **ALL IDENTICAL**; `smoke_gen1.js` **200/200** (+2: the packed-cities rescue case, both opacity sliders present and each producing a real pixel diff). Playwright-probed A/B against v1.11 on the identical packed-cities scenario: v1.11 shows 1/5 labels (`positions:[null]`), v1.12 shows 2/5 (`positions:['above','below']`) — the concrete, measured improvement.

**All 6 items from the Azgaar comparative analysis borrow-list are now shipped** (v1.07–v1.12): culture-flavored naming, setup-gate archetype presets, GeoJSON/GIS export, province tier + religions, submap/resample UX, label placement + per-layer style editors.

### v1.11 (2026-07-19)
**Owner: "implement the top 6 borrow list from the research."** Fifth of six: `docs/research/azgaar-comparative-analysis.md` §4's #5 pick, submap/resample UX — "framing the existing amplification/LOD machinery as an explicit 'carve this region into its own higher-resolution map' tool."

Cartalith already had every piece: `amplifyRegion()` (seamless world-space heightmap upsampling), a region-select drag tool, and a "Region export" tiled-.zip pipeline (Generate → World → Region export) — but it only ever produced *files*, never a live world to keep working in. Added **Extract as new world**, a new button in that same panel: reuses the identical selected region + `amplifyRegion()`, but instead of packing tiles into a download it replaces the live world with the amplified region and hands off to the existing Import-heightmap calibrate→`inferTectonics()` pipeline — no new world-construction path invented. Deliberately skips `normalize()` (unlike the raw-pixel-luminance `loadImage()` path): the amplified data is already real, meaningful elevation in the parent world's `[0,1]` space, and renormalizing would rescale it to fill 0..1 and corrupt the very sea-level/relative-height continuity the whole point of "resample this region" is supposed to preserve. The new world's `mapWidthKm` is computed from the selection's true fraction of the parent width (a smaller region reads as a *higher-resolution close-up*, not a rescaled copy) and prefills the calibrate step. Civilization data (settlements/roads/territory/provinces) is cleared on extraction — it's positioned/scaled for the old extent, and clearing is honest (matches a fresh Import-heightmap world) rather than risking a subtly-wrong coordinate remap; a `confirm()` warns the owner to export first if they want to keep it.

**Verification:** engine `tests/run.sh` **923/923**; `tests/run_um.sh` **831/831**; `hash_gen1.js` A/B vs v1.10 **ALL IDENTICAL**; `smoke_gen1.js` **198/198** (+5: confirm() dialog + correct target resolution, real-world scale preserved in both state and the prefilled calibrate field, amplified field stays finite and un-renormalized, civ data cleared, committing calibrate infers a valid tectonic substrate on the new world). Playwright-probed end-to-end on a real generated+populated world: a quarter-map region (256×164 of 512×328) extracted at 1024px target produced a 1024×656 world at exactly half the parent's km-width (400 of 800), with a fully valid post-inference field.

### v1.10 (2026-07-18)
**Owner: "implement the top 6 borrow list from the research."** Fourth of six: `docs/research/azgaar-comparative-analysis.md` §4's #4 pick, province tier + religions layer, after FMG's "mid-tier region between faction and settlement" (provinces) and its optional religions spread-model layer.

**Provinces.** New `civProvince` raster (`Uint16Array(GW*GH)`, parallel to `civTerritory`) subdivides each faction's territory one level finer. `_civGenerateProvinces()` (a "Generate provinces" button next to the faction picker, on-demand rather than automatic on every territory edit) seeds one province per city-tier+ settlement (rank ≥3: city/capital/metropolis/university/industrial) belonging to that faction — a settlement-seeded Voronoi partition restricted to cells the seed's OWN faction already owns, so a province can never cross a territory boundary. A faction with only towns/villages falls back to its single biggest settlement, so any faction that owns territory gets ≥1 named province. Rendering (opt-in `state.viz.provinces`, default off) folds a small deterministic per-province lightness jitter into the *same* per-pixel territory-blit pass `drawCivLayer` already had (cheap, no second draw call, reuses the existing scratch-canvas cache keyed now on `_civProvGen` too). `civProvince`/`CIV_PROVINCES` are deliberately **not persisted** — pure-derived from territory+settlements, so saving them would just be redundant bytes that go stale the moment territory changes; a loaded project regenerates them on demand instead.

**Religions.** Scoped down to a per-**faction** categorical "state religion" attribute (`civFactionReligion`, a fixed 8-entry pantheon list `CIV_RELIGIONS`) rather than FMG's full General/Organized/Cult spread simulation — the research doc itself flags this half as "if wanted," and a second full spatial spread system is out of proportion for one item in a 6-item list. Mirrors the v1.07 naming-culture picker exactly: a `<select>` next to each faction pill, persisted through the same `state.civ` sync as `civFactionCulture`.

**GeoJSON export** (extending v1.09): a new `province` layer, sharing the same boundary-tracer/hole-nesting helper (`_geoMaskOutlineCoords`, factored out of `_geoTerritoryFeature`) — verified to exactly tile the parent territory (combined province area == territory area). Territory features also gain a `religion` property.

**Verification:** engine `tests/run.sh` **923/923**; `tests/run_um.sh` **831/831**; `hash_gen1.js` A/B vs v1.09 **ALL IDENTICAL**; `smoke_gen1.js` **193/193** (+5: city+ seeding vs. single-province fallback, no cross-faction leakage, real pixel diff on toggle, exported provinces tile their territory exactly, religion picker + persistence). Playwright-probed on synthetic two-faction worlds: 2 provinces from 2 city-tier seeds + 1 fallback province from a lone village, zero cross-faction leakage, GeoJSON province area ratio to territory = 1.0000 (both the isolated single-faction case and the two-faction combined case).

### v1.09 (2026-07-18)
**Owner: "implement the top 6 borrow list from the research."** Third of six: `docs/research/azgaar-comparative-analysis.md` §4's #3 pick, GeoJSON/GIS export, after Azgaar's FMG JSON/GeoJSON export "opens the same downstream-pipeline door." Adds **Export GeoJSON** next to Export .zip in the File ▾ menu: settlements, POIs, roads/sea-routes (`civWays`), rivers (Strahler order ≥2, via the existing `traceRiverPolylines`), and faction territory outlines as one `.geojson` FeatureCollection, each feature tagged with a `layer` property (`settlement`/`poi`/`way`/`river`/`territory`) for easy filtering in a GIS tool.

Coordinates are **local planar kilometres** (east, north), not real-world WGS84 longitude/latitude — RFC 7946 assumes WGS84, but a procedurally generated fantasy world has no true georeference (the same pragmatic call Azgaar's FMG makes for its own export). North is up (Y flipped from the grid's row-major Y-down convention) so the export displays right-side-up in a standard viewer; a top-level `properties.note` documents this in the file itself.

Territory outlines are the one genuinely new algorithm: `_geoTraceMaskRings` walks a faction's `civTerritory` cell mask into closed boundary rings via oriented cell-edge tracing (a "staircase" outline, not marching-squares sub-cell interpolation — territory is already a per-cell raster, so that's the honest shape), classifies each ring outer-shell vs. hole by shoelace sign, and nests holes into their smallest enclosing shell by point-in-ring + area to build correct `MultiPolygon` geometry (an enclave/lake inside a faction's territory renders as an actual hole, not a spurious extra polygon). Doesn't disambiguate the rare checkerboard pinch-point (two diagonal cells in the mask, the other two not) — an accepted simplification for a nice-to-have GIS export, not a core rendering path. Lives in script block 1 (engine) rather than beside the civ-layer data it reads, since it's only ever called from a menu click long after script block 2 has run — the same deferred cross-block reference `exportZip` already uses for the Asset Library's `window._alExportEntries`.

**Verification:** engine `tests/run.sh` **923/923**; `tests/run_um.sh` **831/831**; `hash_gen1.js` A/B vs v1.08 **ALL IDENTICAL**; `smoke_gen1.js` **188/188** (+2: exported FeatureCollection has settlements/ways/rivers + the coordinate-system note, territory outline is a `MultiPolygon` whose shoelace area matches the painted cell area within 0.1%). Node-isolated unit tests of the boundary-tracing algorithm (solid square, donut with a hole, two disjoint blobs, empty mask) all pass exact cell-area and shell/hole classification checks. Playwright-probed end-to-end on a real generated+auto-populated+territory-painted world: 225 features (40 settlements, 56 ways, 128 rivers, 1 territory `MultiPolygon`), territory area ratio to painted cells = 1.000.

### v1.08 (2026-07-18)
**Owner: "implement the top 6 borrow list from the research."** Second of six: `docs/research/azgaar-comparative-analysis.md` §4's #2 pick, setup-gate world archetype presets, after Azgaar's FMG heightmap templates ("one-click parameter bundles on the new-world screen"). Turns out Cartalith already had the underlying system — `ARCHETYPES` (earth/supercontinent/archipelago/volcanic/rift) and `state.world_structure`'s continentality-field steering, exposed post-generate in the sidebar's Generate → World → World Structure panel — it just wasn't reachable until AFTER a world already existed, buried behind an "Enable continental steering" checkbox the owner would have to already know about.

Added a **World shape** preset row to the setup gate's generate form (`#suArchSeg`): Classic (default, selected — `world_structure` disabled, bit-identical to pre-v1.08) plus Earth-like / Pangaea / Archipelago / Volcanic Isles / Rift Valleys, reusing the exact same `ARCHETYPES` data the sidebar panel already had. Picking a preset sets `state.world_structure.archetype`/`.enabled` and calls the existing `deriveFromWorldStructure()` (invariant 5: only from a UI handler, never inside `generate()`) before the upcoming `_suGenCommit` → `generate()` runs. Classic restores true defaults (14 plates, `tectonicGraph` off, etc.) exactly, not just `enabled=false`, so bouncing between presets and landing back on Classic reproduces the untouched default world. `_setupOpen('generate')` reflects the current selection if the gate is reopened.

**Verification:** engine `tests/run.sh` **923/923**; `tests/run_um.sh` **831/831**; `hash_gen1.js` A/B vs v1.07 **ALL IDENTICAL** (the hash harness calls `generate()` directly, never touching the gate DOM — structurally unaffected regardless); `smoke_gen1.js` **186/186** (+3: preset row exists with Classic default-selected, picking Pangaea enables `world_structure` + derives orogeny before commit, picking Classic after an archetype restores true defaults). Playwright-probed end-to-end: the untouched default path (no button clicked) and an explicit Classic click produce an **identical field hash**; Pangaea and Archipelago each produce a materially different world from Classic and from each other.

### v1.07 (2026-07-18)
**Owner: "implement the top 6 borrow list from the research."** First of six: `docs/research/azgaar-comparative-analysis.md` §4's #1 pick, culture-flavored naming, after Azgaar's FMG per-culture namesbases making "regions feel distinct at zero simulation cost." Cartalith's `_civSettleName` was a single global syllable/suffix generator — every faction's towns sounded the same.

Added seven **naming cultures** (`CIV_CULTURES`): `common` (the original `_SYL`/`_SFX` pool, verbatim), `imperial` (Latinate — Aurelium, Novaica), `highland` (harsh consonant clusters — Kragdunhold), `desert` (guttural — Qirashabad), `riverlands` (soft, watery — Avenmereford), `sylvan` (elvish, apostrophed), `maritime` (Norse-flavored — Bjorvikholm). A new parallel array `civFactionCulture` assigns each faction a culture, deterministically defaulted per faction index (`_civDefaultCulture`) so the six built-in factions read distinctly with zero setup; a naming-culture `<select>` next to each faction pill (`_civBuildFactionPicker`) lets the owner reassign it. `_civSettleName(rng,faction)` now looks up the settlement's own faction's culture before drawing syllables — both auto-populate call sites (`_civIterativeAutoWorld`'s suitability seeding and its crossroads-promotion pass) pass `faction` through. The settlement editor (`_civPopulatePlaceEditor`) gains a 🎲 button next to the Name field that re-rolls a name from the settlement's own faction culture, mirroring FMG's "regenerate burg name." `civFactionCulture` round-trips through the same `state.civ` sync (`_civSyncToState`/`_civSyncFromState`) that already carries `civFactionNames`, with old-save/no-field compatibility (missing ⇒ rebuilt from the deterministic per-index default) and extend/trim in lockstep with `CIV_FACTIONS` growth/shrink.

Settlement naming isn't part of the `hash_gen1.js` bit-identity battery (field/temp/rain/flow/render only) — free to change without touching cross-version neutrality; verified `ALL IDENTICAL` regardless.

**Verification:** engine `tests/run.sh` **923/923**; `tests/run_um.sh` **831/831**; `hash_gen1.js` A/B vs v1.06 **ALL IDENTICAL**; `smoke_gen1.js` **183/183** (+4: per-faction culture picker present, a culture-pinned faction's names adhere to that culture's suffix pool >90% of draws, the editor's 🎲 re-rolls from the settlement's own faction culture, `civFactionCulture` round-trips through sync). Playwright-probed end-to-end on a real generated+auto-populated world: six factions pinned to six distinct cultures produce visibly distinct settlement names (Imperial: Novarcica, Auraurium; Highland: Kragandward, Dagrhurnridge; Desert: Ashqirspan, Bahrharmarch).

### v1.06 (2026-07-18)
**Owner: "maybe we should have the seed box back, and the random option there also."** The setup gate's
generate form gains a **World seed** row: a Seed number input (`#suSeedN`, prefilled with the current
boot-random seed when the step opens) + a **🎲 Random** button that rolls a new value into the box
(applied on Generate). `_suGenCommit` applies the typed seed to `state.tect.seed` before generating
(blank = roll a fresh random one, the pre-v1.06 behaviour); the sidebar `#seedN` stays in sync via the
existing `syncUI()`. The same seed + size + extent now reproduces the same world from the very first
generate — previously the seed was only reachable in the sidebar AFTER a world existed, so the initial
world was always irreproducible.

Playwright-verified end-to-end: the same typed seed across two fresh boots produces an **identical
field hash**; the dice rolls a different seed → different world; the sidebar seed matches. Side effect:
`smoke_gen1.js` now seeds its boot world (31337) through this input, which also de-flakes the suite's
previously random-world assertions.

**Verification:** engine `tests/run.sh` **923/923**; `tests/run_um.sh` **831/831**; `hash_gen1.js` A/B
vs v1.05 **ALL IDENTICAL** (the harness bypasses the gate; at defaults the gate applies the same
boot-random seed as before); `smoke_gen1.js` **179/179** (+1: seed box exists, 🎲 rolls, typed seed
drives `state.tect.seed`).

### v1.05 (2026-07-18)
**Owner: "the blocky water" — #96, "square lakes when LOD zooming" (deferred since v0.96, now fixed).**
Above-sea lakes were classified per coarse grid cell (`currentWaterBodies()===2`) and both sub-cell
renderers — `renderBiomeTileRGBA` (LOD tiles/overview) and `bakePixel` (exports) — stamped whole cells
via a NEAREST-cell test per pixel, so a lake magnified past the grid resolution read as axis-aligned
blue squares with razor-straight right-angle edges.

- **`buildWaterBodies` optionally exports its pooled fill level** (`opts.fillOut` — the priority-flood
  `filled` raster, i.e. the lake's water-surface height per cell). Optional out-param; the return
  contract and every existing caller are untouched. `currentWaterBodies()` captures it into a new
  module cache `_lakeFill` with the same lifetime as `_waterBody`.
- **Sub-cell lake test in both samplers**: deep inside the lake (all 4 surrounding coarse cells lake)
  a pixel is water outright; on the boundary band a pixel is water where the tile's own (amplified)
  terrain lies BELOW the pooled lake surface — the tile is flooded to the pool level, so the shore is
  the curve where the visible terrain rises out of the water — AND inside a bilinear lake-membership
  band (`fq>0.35`), which cuts a smooth marching-squares-style curve where the shelf is too flat for
  the terrain test to shape (without it, flat shelves degenerated to straight window-limit edges).
  Water-brush/flat lakes (nothing pooled: `fill−bed ≤ lakeDepth`) keep their painted cell shape via a
  nearest-cell fallback, as does any path where `_lakeFill` is absent.
- **The BASE per-cell map loop is untouched** — at 1 cell = 1 pixel there is nothing to subsample, and
  this keeps the default render bit-identical (hash battery ALL IDENTICAL, no cross-version-neutrality
  exception needed; only LOD tiles/overview and bakes change, which is the point).

**Probe note (affects reproducibility of every earlier browser probe):** the setup gate has NO seed
input — `state.tect.seed` is the real seed and boots randomized, so all earlier "seed 54869" Playwright
probes were actually random worlds. The lake probe now sets `state.tect.seed` directly; the A/B above is
a true same-world comparison (identical 710-cell lake in both versions, view on its eastern shore:
v1.04 = hard right-angle squares → v1.05 = smooth terrain-following shoreline).

**Verification:** engine `tests/run.sh` **923/923**; `tests/run_um.sh` **831/831**; `hash_gen1.js` A/B
vs v1.04 **ALL IDENTICAL** (base loop untouched); `smoke_gen1.js` **178/178**. Same-world screenshot
pair confirms the fix at a 6 km LOD span.

### v1.04 (2026-07-18)
**Owner: "harbour length + needle" (continuing the v1.03 screenshot batch).** Root cause of the extreme
wall "needles next to lines of water" found and fixed: `buildWall`'s one-bank branch walks `townBank`
between the two landArc→bank projection points, and on REAL water `site.river`/the shoreline is the real
polyline spanning the WHOLE ~2.4 km town box — a noisy land classification could project the endpoints
far apart along the bank, so the water-following wall ran kilometres along the river/shore (measured:
a 2,210 m water wall on the flood scenario). The v1.03 hull cap can't catch this (the needle is the
BANK walk, not the hull), and the same structure reads as the "weirdly long harbour" since it hugs the
waterline. Fix: if the bank walk is disproportionate to the town (arc length > max(1.6 × landArc, 500 m)),
the classification was degenerate — drop the water-following wall and fall back to the plain smooth
curtain around the (v1.03 aspect-capped) hull. Guarded on `usesRealWater` ⇒ the synthetic UME suite is
byte-identical. Flood probe: max water-wall 2,210 m → 0 (degenerate walks culled; proportionate ones
kept), median ring aspect 1.1.

**Verification:** engine `tests/run.sh` **923/923**; `tests/run_um.sh` **831/831**; `hash_gen1.js` A/B
vs v1.03 **ALL IDENTICAL**; `smoke_gen1.js` **178/178**.

### v1.03 (2026-07-18)
**Owner (9 screenshots, v1.01): "harbours not placed correctly, layouts off; a place said to be in water
but zoom reveals an island; weirdly long harbours next to lines of water; square lakes when LOD zooming."**
Two targeted settlement-layout fixes (the third — square lakes at LOD — is the pre-existing tile-renderer
resolution limit, still deferred).

- **Island/coastal towns no longer wrongly suppressed** (`_umWaterCtx`). The v1.00 "mostly water" bail
  keyed on the WHOLE ~1.7 km box's water fraction (>0.72), so a settlement on a small island read as
  "in open water" and showed **no** town layout, even though it sits on land. Since v1.01 snaps every
  settlement onto land, the right question is whether there's buildable land RIGHT AROUND the settlement,
  not how much distant box is sea: the bail now measures the water fraction only in a ~260 m disc centred
  on the settlement, and fires (bare pin) only if that disc is >90% water (a genuine mid-open-water pin).
  An island/coast/estuary town has land under and beside it, so it builds a (small) town on that land.
  Probe: rescued island settlements render a real town (137 buildings on the flooded-island test), no
  false bails; the disc test spares true mid-water pins.
- **Coastal/port enceinte no longer stretches into a thin sliver** (`builtMassHull`). On REAL water, if
  the built-mass hull is pathologically elongated (a needle strung along the shore/river, e.g. the owner's
  "weirdly long harbours next to lines of water"), it's now compressed along its long axis to a max ~2.4:1
  aspect (anisotropic scale about the centroid). The common real-water wall is ~1.3:1 and passes through
  untouched; only extreme cases engage. Guarded on `usesRealWater` ⇒ the synthetic UME suite is
  byte-identical. Flood-scenario probe: worst wall aspect 2.5 → 2.2 (median 1.5 unchanged). NOTE: the
  owner's most-extreme needles couldn't be reproduced on local seeds, so this is a general safeguard that
  bounds any elongation (a hull of aspect 10 becomes ≤2.4) pending on-device confirmation; the long
  HARBOUR-quay extent along the shore is a separate follow-up.

**Verification:** engine `tests/run.sh` **923/923** (block 1 untouched); `tests/run_um.sh` **831/831**
(both fixes guarded ⇒ synthetic path byte-identical); `hash_gen1.js` A/B vs v1.02 **ALL IDENTICAL**
(opt-in layout path only); `smoke_gen1.js` **178/178**.

### v1.02 (2026-07-18)
**Owner: "sometimes ways don't connect — they stop just short of a location."** The land network
(`_civHierarchicalNetwork`) consolidates shared corridors by claiming routing-grid cells busiest-first,
so an edge whose near-settlement cells were already claimed by a THROUGH road starts its visible run a
routing-cell or two out — at a downsampled cell CENTRE offset from the pin — and the road visibly stops
short of the settlement. The v0.92 substitution only fixed the run that reached the edge's OWN endpoint
cell; this adds a post-pass that pulls any way endpoint still landing near its edge's settlement
(`aIdx`/`bIdx`) exactly onto the pin. The threshold scales with the downsample (offset = routing cells ×
1/sc) and with the claimed-corridor depth, bounded to ~45% of the ~`GW/30` inter-settlement spacing so
it can never reach a neighbouring place, and it only ever snaps to the way's own two settlements — so a
terminal near its settlement is always the right target and interior junction runs (far from any pin)
never match. Sea routes already anchored their endpoints exactly (`_civMstRoutes`), so they were fine.

**Verification:** engine `tests/run.sh` **923/923** (block 1 untouched); `tests/run_um.sh` **831/831**
(block 4 untouched); `hash_gen1.js` A/B vs v1.01 **ALL IDENTICAL** (way endpoints aren't part of the
render buffers); `smoke_gen1.js` **178/178** (+1: every land way reaches its own settlement exactly,
0 "stops just short" endpoints). Probe across 8 seeds: **20 → 0** stop-short endpoints.

### v1.01 (2026-07-18)
**Owner: "settlements should not be in water — research the fix and implement; also continue the
outstanding points [coastal wall over-enclosure, full-display canvas]."** Three items.

- **Settlements never stand in water — root cause fixed (`_civSnapPlacesToLand`).** Research finding:
  every PLACEMENT path already refuses water (`_civSnapLand` checks sea + `currentWaterBodies()` lakes;
  `_civDropPlace` refuses wet cells; the crossroads-promotion pass snaps to land), but nothing ever
  RE-VALIDATED existing pins when the terrain changed underneath them — erosion, a sea-level
  recalibration, the Water brush, or an imported save could leave a settlement standing in the new
  water (the owner's "renders inside a lake" screenshot). New reconcile pass: any settlement now on
  water (sea OR lake) snaps to the nearest dry cell, dragging its connected way endpoints along (the
  v0.92 "endpoint equals the settlement coordinate" invariant that road-locking depends on). Runs once
  per terrain generation — keyed on `_fieldGen` + sea level, the same staleness pattern as the UM model
  cache — from the civ draw path, plus a safety net at the end of auto-populate. POIs are deliberately
  exempt (a lighthouse/shipwreck on water is legitimate). Probe-verified: 40 settlements placed, 0 wet;
  raising the sea floods 17; one redraw later 0 wet and the sampled way endpoint followed its settlement.
- **Coastal wall no longer stretches along the approach roads (`builtMassHull`).** The injected
  real-road primaries (v0.97, ~55 m resample) carry many bare degree-2 vertices that are polyline
  geometry, not built town — counting them as "built mass" inflated the enceinte over empty land. On the
  injected-paths graph (new `g._fromPaths` tag set by `buildPrimariesFromPaths`), a vertex whose live
  edges are ALL primary must be a real junction (degree ≥3) to count; a vertex where any town street/lane
  attaches still counts. The synthetic path never sets the tag ⇒ UME suite byte-identical. Browser-
  verified: the wall now hugs the built fabric (was a kite of empty land).
- **Fill mode — the map always uses the full display area (owner: portrait phone letterboxed the map
  with "big unused areas above and below").** The minimum zoom is now the COVER scale instead of the
  letterbox FIT: the map fills the viewport and you pan to reach the cropped part (standard map-app
  behaviour). One clamp inside `applyView()` catches every input path (wheel/pinch zoom, drag/two-finger
  pan, move-to, reset — they all funnel through it); `zoomAt`'s floor is the cover scale so pinch-out
  stops at "filled"; pan is clamped so no background band can be exposed; re-clamped on window
  resize/rotation; `_lodFitCanvas` letterbox-fit becomes letterbox-COVER for Tiled-LOD mode. Input
  mapping is untouched by construction — `evtToGrid` & friends are transform-invariant via
  `getBoundingClientRect`, and LOD input reads the full element box even when the wrap clips it.
  (Subtlety worth recording: the clamp must measure the stack rect against the LAST-APPLIED transform
  (`_viewApplied`), not the pending `viewT` values — using the pending pan made the bounds drift with
  the very pan being clamped, so it never bound.) Playwright-verified on a portrait 720×1420 viewport:
  initial view covers (scale floor 4.09), 12× zoom-out holds coverage, a ±4000 px pan clamps back to
  zero gap, a centre-click maps to an in-bounds grid cell, LOD mode covers, no page errors.

**Verification:** engine `tests/run.sh` **923/923**; `tests/run_um.sh` **831/831** (`_fromPaths` guard
holds — synthetic path byte-identical); `hash_gen1.js` A/B vs v1.00 **ALL IDENTICAL** (CSS-transform-only
view changes never touch the render buffers; settlement snap is a no-op at defaults with no places);
`smoke_gen1.js` **177/177**. Manual browser pass still owed for real-device touch feel (pinch/rotate).

### v1.00 (2026-07-18)
**Owner: "a harbor sits at a coastline or actual river with the city right next to it on land; no roads
passing over water that come from it"; "when tapping a city in explore mode I want a popup with the city
layout — a zoom in that shows it closer"; "[a settlement] renders inside a lake."** Continues the
seamless region↔settlement work with four settlement-layout fixes plus a new explore-mode feature. All
of it is on the opt-in (`state.viz.urbanLayouts`, default off) / popup paths, so default render stays
bit-identical to v0.99 (`hash_gen1.js` ALL IDENTICAL).

- **No town roads over open water** (`removeWaterCrossings`, UME engine). The base pass exempted
  `primary` edges as presumed bridges — only safe for the synthetic single-channel site. With REAL map
  water, a primary can run out over the sea or make an extra unbridged river crossing. v1.00 adds a
  real-water pass that culls any primary/street edge crossing open water away from the ONE designated
  bridge (`site.bridgePt`); `pruneLargest` then drops fabric this orphans on the far bank (a town that
  never bridged its water is one-sided on land, not floating). Quay stays exempt. Guarded on
  `usesRealWater` ⇒ the synthetic path (headless UME suite) is byte-identical. This also removes the
  far-bank/water junctions that inflated the coastal wall, so the enceinte hugs the built mass tighter.
- **The town builds on land, not in the water** (`generate()` market nudge). The nudge that moves the
  market off water when the box centre is wet now searches ring-by-ring across the WHOLE box (was capped
  at 340 m), so a settlement on the edge of a large water body still lands its centre on the real shore.
- **A settlement sitting in open water shows no floating town** (`_umWaterCtx` `mostlyWater` + `_umModelFor`
  bail). If a settlement's town box is mostly water (a lake / mid-sea placement — no shore to build on),
  `_umModelFor` keeps the bare pin instead of rendering a town in the water. Coastal/estuary towns (water
  on one side, empirically well under half the box) are unaffected.
- **Tap a settlement in explore → its city layout, zoomed in** (`_umModelForNow` + `_umDrawLayoutPreview`
  + `_civOpenPlacePopup`). The settlement editor popup now leads with a fit-to-box render of the town's
  own generated layout (walls/streets/blocks/buildings/water), fitted to the BUILT MASS so approach roads
  run off the frame and the town fills the card. The model is fetched/generated synchronously on tap
  (cached), independent of the map-wide toggle. POIs and in-water settlements show none.

**Test:** the v0.95 deep-zoom crossfade smoke assertion picked the arbitrary FIRST settlement, which under
v1.00 may legitimately be one that renders no layout (in-water); it now picks the first settlement whose
model actually renders (via `_umModelForNow`), matching the new contract.

**Still flagged (not blocking):** the coastal wall is tighter but still sized from the street-graph hull,
so it can over-enclose along an arterial in some cases (a deeper growth/hull change). The map canvas does
not yet fill a portrait/mobile display (it letterboxes a landscape map — a core view/projection change
that needs interactive mobile verification; scoped separately).

**Verification:** engine `tests/run.sh` **923/923**; `tests/run_um.sh` **831/831** (synthetic-water path
byte-identical); `hash_gen1.js` A/B vs v0.99 **ALL IDENTICAL** (feature default-off); `smoke_gen1.js`
**177/177** with the robust settlement pick (an unrelated v0.73 routing-gravity assertion flakes on the
unseeded smoke world, same class as the occasional engine "splat" flake — passes on re-run). Browser-
verified on seed 54869 (512px): river/estuary/coastal towns build fully on land with no roads over water;
the settlement popup shows a zoomed town-layout card.

### v0.99 (2026-07-17)
**Owner: "Continue" (Stage 3 of the seamless refactor — coastal polish).** Two contained, safe
improvements to the real-water settlement layouts shipped in v0.98, both on the opt-in
(`state.viz.urbanLayouts`, default off) path so render bit-identity to v0.98 holds at defaults.

- **Smooth local coastline (`_umWaterCtx`, civ adapter).** The town's local water mask classified
  each 22 m cell by the NEAREST grid cell's height; at a coarse 512 px region ~70 mask cells collapse
  onto one grid cell, so the whole ~1.7 km box read as a single blocky, axis-aligned land/water value
  — the owner's "solid block instead of smooth borders according to where it is located on the
  heightmap." v0.99 samples the height field **bilinearly** at each mask cell, so the sea/below-sea
  threshold crosses the box smoothly and the local coastline follows the real heightmap gradient with
  sub-grid-cell detail (a smooth curve, not a rectangle). Discrete labelled lakes
  (`currentWaterBodies()===2`) aren't interpolable, so they keep the nearest-cell test. Adapter-only
  (never touches the UME engine block) ⇒ the UME suite and default render are unaffected by construction.
- **Coast orientation fix (`townBank`, UME engine).** The wall's water-following bank offset hardcoded
  `y−5` — "the town is landward (north)" — which is only right for the synthetic west→east shoreline.
  A REAL sea/lake can lie on any side, so on an E/W/S-facing coast the offset pushed the wall the wrong
  way. Fixed to offset toward the actual land (the market side), exactly as the river branch does.
  **Guarded on `site.usesRealWater`**, so the synthetic path (the headless UME suite) keeps the
  byte-identical `y−5` offset.

**Still rough (flagged, carried forward):** on a coastal town the enceinte is sized from the street
graph's built-mass hull (`builtMassHull`), which folds in bare junctions along the arterial roads that
enter the town — so the wall can enclose a wedge of empty land beyond the actual built fabric (the
built mass sits in the seaward corner while the wall stretches inland along a road). This is a
pre-existing property of sizing the wall from junctions rather than blocks (blocks don't exist yet when
`buildWall` runs inside `grow()`), present since v0.97's `primaryPaths`; it is NOT introduced here.
Constraining the wall to the built fabric is a growth/hull redesign, left as the next coastal pass.
Also unchanged: "river through the town" still reads best at 1K/2K (a 512 px box is ~one grid cell).

**Verification:** engine `tests/run.sh` **923/923**; `tests/run_um.sh` **831/831** (synthetic-water
path byte-identical — the `townBank` guard holds); `hash_gen1.js` A/B vs v0.98 **ALL IDENTICAL**
(feature default-off); `smoke_gen1.js` **177/177**. Browser-verified on seed 54869 (512px): a
pure-coastal walled town (bay, pop ~5k) now sits on the real headland behind a **smooth curved
coastline** instead of a blocky block; a river-through estuary town builds entirely on land with the
map's water running through it.

### v0.98 (2026-07-17)
**Owner (screenshots, seed 54869): "sea, rivers, lake logic is all but correct" + "refactor them ...
to get a seamless whole ... same for rivers and lakes."** Stage 2 of the seamless region↔settlement
refactor (Stage 1, v0.97, was roads): the town's WATER is now the map's water. Where v0.95/v0.96
gave `buildSite` a synthetic river/coast merely oriented to match, v0.98 feeds it the real map water
so the town builds around the actual river/sea/lake instead of a wrong synthetic one.

- **`_umWaterCtx(p)`** (civ adapter): packages the real water near a settlement into the layout's
  local box frame (orient=0, referenced to the box centre C). Two parts: (a) the nearest real river
  centerline (`traceRiverPolylines`' nearest stem, resolution-aware search radius — at a coarse 512px
  region the whole ~1.7 km town box is barely one grid cell), giving `buildSite` a real
  bridge/bank/quay; (b) a coarse local raster of ALL real water over the box (sea + lakes below sea
  level, with the river band stamped in) plus its distance transform, so `isWater`/`riverDist`
  reflect the real coastline and the town never builds in the sea. Builds `_riverNet` itself if a
  render hasn't yet.
- **`buildSite(seed,Wm,Hm,kind,opts)`**: when `opts.water` is supplied, `isWater`/`riverDist` come
  from the mask/DT; `river` is the real centerline (bridge/bank/quay derive from it) or, for a purely
  coastal town, a shoreline extracted from the mask; the synthetic water fill is dropped for coasts
  (the real sea is already drawn on the map). The whole synthetic path (no `opts.water` — the headless
  UME suite) is untouched and bit-identical.
- **`generate()`**: with real water, pins the market onto the box centre C (= the settlement's real
  position = the town centre, on land near the water), nudging off water if C falls in the
  channel/sea — so the town's water and roads both land pixel-for-pixel on the map. `orient` is forced
  to 0 on the real-water path (the v0.96 rotation was only a workaround for the synthetic river).
- The site-kind classifier still runs, but the ACTUAL water now comes from `_umWaterCtx`: a town
  whose nearest river is a couple of grid cells away (genuinely not through it at this resolution)
  correctly gets NO synthetic river, and a coastal town builds on the real headland with the sea
  around it.

**Known follow-up (flagged, not blocking):** coastal-town wall/harbour AESTHETICS are rough — the
market-nudge onto a peninsula can give a pointed wall and some warehouse sprawl past it; and at 512px
the town box being ~one grid cell makes "river running through the town" rare (higher resolutions —
1K/2K — put multiple cells in the box and read much better). The water LOGIC is correct (matches the
map); the polish is a next pass.

**Verification:** engine `tests/run.sh` **923/923**; `tests/run_um.sh` **831/831** (no-water path
bit-identical); `hash_gen1.js` A/B vs v0.97 **ALL IDENTICAL** (feature default-off); `smoke_gen1.js`
**177/177**. Browser-verified on the owner's seed 54869: a coastal town builds on the real headland
(sea respected, not overlapped); a town whose river is 2.8 km off correctly draws no wrong river.

### v0.97 (2026-07-17)
**Owner: "build the city around the roads that connect the settlements instead of connecting the
roads to the ones generated by the settlements" + "refactor them ... to get a seamless whole."**
Stage 1 of a staged, owner-approved refactor toward a seamless region↔settlement whole (Stage 2 =
rivers, Stage 3 = lakes/coast). Where v0.95/v0.96 generated the town's own roads and then *aligned*
them to the map's roads (close, but two separate parallel lines), v0.97 makes the real
inter-settlement roads that reach a settlement BE the town's arterial skeleton — the town is grown
around them, so the through-road literally becomes the high street: it enters at a gate, runs
through the town, and exits at the far gate, one continuous road at every zoom. Historically true
(towns accreted along the road that predated them) and seamless by construction.

- **`buildPrimariesFromPaths(seed,site,anchors,g,paths)`** (UME engine): the new primary-road
  builder. Instead of `buildPrimaries` synthesising least-cost paths from bearings, it takes the
  real roads (as metre-offset polylines in the layout's local frame), translates them onto the
  market anchor, clips to the site box, and adds them as primary streets. `grow()`/`buildBlocks`/
  `buildWall` (gates where primaries cross the wall) read them as the primary network unchanged.
  `generate()` uses it when `opts.primaryPaths` is supplied, else falls back to `buildPrimaries`
  (so the headless UME suite path — no primaryPaths — is untouched).
- **`_umPrimaryPaths(p,orient)`** (civ adapter): builds those paths from the `civWays` reaching the
  settlement. The one subtlety that took a debugging pass: civWay vertices are **kilometres** apart
  (a road spans the whole region), so a raw vertex list gave the ~1.7 km town box almost no points
  — the injected primaries came out as 2-point ~250 m stubs, the built mass landed entirely on the
  far river bank, and the wall never formed (`builtMassHull` needs ≥8 junctions on the market's
  bank; it was getting 0). Fixed by **resampling the road by arc length** (~55 m steps) from the
  settlement outward before transforming — the in-box run is then dense enough to be a real primary.
  The grid→local transform is the exact inverse of `_umDrawLayout`'s, so an injected road drawn back
  overlays the map road pixel-for-pixel. Verified: with the fix a walled town builds 476 near-bank
  junctions (was 0), a wall ring, and primaries reaching ~1.3 km — on par with the synthetic build.
- Internal streets/lanes/parcels stay the engine's own procedural growth (per the owner's earlier
  "other roads from the settlement generator can persist"). `primaryPaths` folded into
  `_umPlaceContext` + the model cache key; falls back to the v0.96 aligned-bearings behaviour when a
  settlement has no connected roads.

**Verification:** engine `tests/run.sh` **923/923** (block-1 untouched); `tests/run_um.sh`
**831/831** (fallback path bit-identical); `hash_gen1.js` A/B vs v0.96 **ALL IDENTICAL** (the
feature is default-off — no impact on the main render); `smoke_gen1.js` **175 → 177** (+2 guards:
the town built around real roads still forms a wall + full-extent primaries, and the paths are
densely resampled not raw vertices). Browser-verified with fixed-seed screenshots: the map road runs
straight through a walled town, entering/exiting at gates, town fabric grown around it.

### v0.96 (2026-07-17)
**Owner live-QA on v0.95's urban morphology, plus two map-render asks.** A batch of fixes and
refinements from the owner testing v0.95 in-browser. All urban-morphology changes stay opt-in
(`state.viz.urbanLayouts` still default off); the two river changes are intentional default-render
adjustments (like v0.94's rivers-as-ways), so the engine fields stay bit-identical and only `rgba`
moves in the hash battery.

**Urban morphology fixes:**
- **Right-click a settlement works again under deep zoom** (owner: "right clicking a settlement
  doesnt work anymore" — which also made the Age/Fortifications fields unreachable). The viewport
  context menu used `evtToGrid`, which maps wrong while Tiled LOD is on (the canvas shows only
  `lodViewRect()`'s sub-rectangle) — exactly the zoom where the layouts appear. Switched to the
  LOD-aware `evtToGridLOD` (the same fix v0.91 gave click-to-info). The editor (and its Age/Walls
  rows) is reachable again.
- **Town roads now lock to the map's roads** (owner: layouts "dont align/connect"). Root cause: a
  single road edge is split into several runs that ALL inherit the same `aIdx`/`bIdx`, but only the
  run truly reaching the settlement has its endpoint snapped to the settlement coordinate — the
  interior runs start at a junction. `_umRouteEnds` matched on `aIdx`/`bIdx`, so it pulled approach
  bearings from those junctions and the town's primaries pointed the wrong way. It now matches on
  the way endpoint COORDINATE being at the settlement, and takes a stable bearing over a minimum
  walk-out distance. Verified: on a fixed seed the town's primary-road bearings (25°, −164°, −179°)
  match the real connected-road bearings (24°, −162°, −174°) to within a few degrees.
- **Layout aligned to real terrain** (owner: landlocked towns still drew a river, river towns'
  rivers didn't meet the map river). New `_umTerrainOrient`: `buildSite` always grows its river
  west→east in a local frame; this computes the rotation that lines that local frame up with the
  real terrain — the river axis from a PCA of the nearby high-flow cells, or (coastal) the mean
  sub-sea direction, or 0 (landlocked). `_umRouteEnds` pre-rotates the road bearings by −orient and
  `_umDrawLayout` rotates the whole drawing back by +orient, so the town's own river/coast runs the
  same way as the map's water AND the roads still exit toward the real neighbours. Landlocked towns
  (classified from terrain) get no water at all.
- **City wall goes around the town again** (owner: "the city wall is a mess and doesnt go around a
  city"). The renderer drew `landArc` as an OPEN path — but for a landlocked town `landArc` IS the
  full ring, so it showed a gap. Now draws the CLOSED containment ring (`wall.ring`), or the closed
  star-fort trace for bastioned towns, with spurs and gate markers, at a floored line width so it
  reads at any zoom.
- **Fortifications / Age toggles now repaint** (owner: "toggling on or off nothing happens"). An
  Age/Walls edit changes `_umPlaceContext`'s inputs (so the cached model misses and regenerates),
  but nothing kicked a redraw to run that path — both handlers now call `drawCivLayerAuto()`.
- **Layouts are opaque at full zoom** (owner: "settlements still look see-trough instead of
  opaque"). The block/building/water fills were <1 alpha, so terrain showed through even at full
  crossfade. Fills are now solid colours (crossfade handled solely by the layer `globalAlpha`);
  streets draw casing-then-fill so the network reads as continuous roads.
- **Harbour scales with the port's size** (owner: "the bigger a settlement if its port city the
  bigger its harbor"). New `_umHarbourScale(pop,site)` — quay length, pier count and mole grow with
  a gentle power (~0.4) of population (waterfront ~ throughput ~ trade, sub-linear), clamped 0.6–3×,
  threaded into `buildHarbour` (default 1 ⇒ bit-identical to the source PoC, so the UME suite path
  is unchanged).

**Map-render asks:**
- **Rivers redrawn in the settlement's water-blue, and de-"barcoded"** (owner: liked the settlement
  river style, wanted it global; also "river density is very high ... almost a barcode style
  look"). `drawRiverWays`' old hsl ramp swept cyan→GREEN→orange with order, so mid-order rivers
  rendered green and read as hatching, not water; and it stroked every one of the ~5,000 order-1
  trickles → a dense barcode. Now: a straight water-blue that only deepens with order (matching the
  settlement layout's river), and the vector ways start at order 2 (order-1 stays in the raster
  water tint underneath), so only real rivers draw as clean blue lines. The "Min stream order"
  Style slider still raises the floor.

**Deferred / known limitation:** the owner also reported blocky water borders at deep LOD zoom
("solid block instead of smooth borders according to the heightmap"). This is the coarse working
field (512px) being magnified past its resolution at the land/water threshold — the same class as
v0.92's blocky-lakes work, and pre-existing (not introduced by the urban-morphology feature). A
proper fix needs procedural sub-cell coast detail in the refined tiles (the fragile LOD tile
renderer), so it's scoped as a focused follow-up rather than risked in this batch.

**Verification:** engine `tests/run.sh` **923/923** (block-1 pipeline unchanged — the only block-1
edit is `drawRiverWays`, pure canvas render, not in the headless path); `tests/run_um.sh`
**831/831** (harbour scaling bit-identical at default opts); `smoke_gen1.js` **173/173**;
`hash_gen1.js` A/B vs v0.95 shows the engine fields (field/temp/rain/flow) identical with `rgba`
differing at biome configs by design (the river restyle). Browser-verified with fixed-seed
screenshots: opaque walled towns with roads entering through gates and the river running through
aligned to the map river; global rivers clean blue, no green barcode.

### v0.95 (2026-07-17)
**Owner request: "There is an urban Morphology proof of concept in a subfolder. I want you to
think about how you will refractor the code into cartalith and upgrade the settlement menus with
the additional information. The main idea is that when the zoom goes deep enough the current
symbol/circle gets faded out and the settlement lay-out becomes apparent and it's roads lock to
the route's that the program already generates. (just the main in roads, other roads from the
settlement generator can persist) I want a separate toggle to start settlement generation. In a
map wife base but also, in the settlement specific menu toggles for the settlement age and
fortifications. Base settlement age and size should be inferred by the already made. Population
size."**

`urban-morphology/Urban Morphology v0.1.html` is a standalone, deliberately-isolated PoC: a pure,
DOM-free procedural historical-city-layout generator (streets → blocks → parcels → buildings →
walls/fortifications → districts → detail, ~88 headlessly-testable functions returning one plain
model object), with its own 801-assertion suite and purpose-written integration docs
(`docs/06-cartalith-integration-map.md`, `docs/09-refactoring-function-inventory.md`). This
version ports it in as Gen1's **new 4th `<script>` block** (`UME`, ~2.6k lines, namespaced IIFE —
CLAUDE.md's "three sequential script blocks" architecture note is now four), and builds the civ-
layer bridge/renderer requested on top of it — all opt-in, default off, so cross-version
neutrality holds throughout.

**Port** — the engine's own `mulberry32` was dropped in favor of Gen1's byte-identical copy
(verified same constant/algorithm; JS scoping resolves it at runtime in the browser without a
duplicate definition), `generate` was renamed `cityGen` at the export boundary to avoid ambiguity
with Gen1's own `generate()`, and a single surgical hook (`if(opts.routeEnds&&opts.routeEnds.
length)site.routeEnds=opts.routeEnds;`, right after `buildSite()`) was added so the host app can
override the PoC's synthetic map-edge approach-road endpoints with real ones — the one
integration point the docs flagged as needing a bridge, and the whole mechanism the road-locking
requirement needed. `UM-ENGINE-START`/`UM-ENGINE-END` comment markers carry over so
`tests/run_um.sh` can extract the block from the merged file exactly like the PoC's own harness
extracted it from the standalone one.

**`_umPlaceContext(p)` adapter** (civ layer, script block 2) bridges an existing settlement to
`UME.cityGen`'s inputs: **pop** clamped to the PoC's domain; **age** (`p.umAge`, else inferred —
`clamp(round(60+240·log10(max(1,pop)/100)),30,1000)`, pop 100→60y / 1k→~300y / 10k→~540y) with
`wallGenerations:true` so age genuinely paces successive wall rings; **walls** (`p.umWalls`, else
inferred true for the `fortified` trait or tier rank ≥2 — town and up); **fortified** (star fort)
from the `fortified` trait, gated by the PoC's own pop≥2500 anachronism check; **site kind**
(`_umSiteKindFromTerrain`) classified from real terrain (field/flowField near `p`, sea level) into
river/riverthrough/bay/coast/landlocked — deliberately scoped to TYPE only, not full site
geometry: the PoC's `buildSite` derives its river curve/bridge/harbour placement from its own
synthetic `isWater`/`height` functions, so swapping only some of those out would produce an
internally-inconsistent site (a bridge on a synthetic river a real `isWater()` disagrees with);
full terrain-sourced site geometry is deferred, flagged below. **`routeEnds`** — the road-locking
requirement — built from `civWays` actually connected to `p` (`aIdx`/`bIdx` match against the
settlement-filtered places array, `_civNetworkMetrics`'s own resolution pattern, plus endpoint-
snap fallback for manual ways), turned into approach bearings that `buildPrimaries`' A* grows the
town's main roads from — so a generated town's PRIMARY roads lock onto the region's real route
network while its internal streets/lanes stay the engine's own procedural growth, exactly the
split the owner asked for.

**Rendering — pin/layout crossfade at deep zoom.** New §2.5 in `drawCivLayer`, drawn before §3
Places so pins/labels stay visually on top while both are partially visible. Gated on real km via
`lodSpanKm()` (not raw `_lodZoom`, whose numeric meaning scales with map size): fade begins at a
24 km view span, full layout / pin fully faded at 10 km. `_umDrawLayout` maps the generated
model's meters (relative to `model.anchors.market`, the town's own generated centre) onto the
settlement's real grid position and draws water/blocks/wall(or bastioned fort)/streets(by class,
primary widest)/buildings as `civCtx` vector fills/strokes — a simplified pass vs. the PoC's SVG
layer stack (parcels and fine clutter — trees/wells/crosses — deferred, flagged below). A
settlement's pin only fades once ITS OWN model is actually ready to draw (`_umRevealedSet`, keyed
per-frame) — generation is queued/async, so a settlement mid-generation keeps its full pin rather
than leaving a bare gap. Verified visually via fixed-seed Playwright screenshots at 40/20/14/6 km
spans: pin only → faint street web bleeding through a faded pin → full walled-town layout with
blocks/buildings and connected region roads visibly running into the settlement, with no console
errors at any step.

**Generation, caching, invalidation.** `_umModelFor(p)` builds `_umPlaceContext`, runs
`UME.cityGen`, and caches the result in a module `Map` keyed on every input that affects the
layout (seed/pop/age/walls/fortified/site/routeEnds) — an editor change or a road-network rebuild
simply produces a different key next call, so a stale entry is never touched again rather than
needing explicit invalidation wiring; cache clears wholesale on world regen (`_fieldGen`). At
most one settlement's model is generated per frame (`_umScheduleGenStep`, mirrors the
`_lodScheduleOverviewRebuild` deferred-work precedent) so a zoom-in over a cluster never freezes a
frame; a cache miss returns `null` immediately (renderer keeps showing the pin, not a stall) and
triggers a background `renderNow()` once the model lands. Never serialized (transient/
deterministic from inputs, Invariant 6).

**UI.** Map-wide toggle (`state.viz.urbanLayouts`, **default off**) — "Generate settlement
layouts (urban morphology)" — in Civilization → Settlements next to the metropolis-tier checkbox;
`loadZip`'s viz-defaults `Object.assign` carries the `false` default forward for old saves the
same way every other opt-in viz flag does. Settlement popup (`_civPopulatePlaceEditor`) gains
**Age (years)** (number input, placeholder shows the live inferred value, blank = auto → `p.
umAge`) and **Fortifications** (checkbox, `indeterminate` while unset = inferred, a click commits
an explicit override → `p.umWalls`) — both default `null` via `_civEnsurePlaceDefaults`, both new
nullable fields round-trip automatically through the existing whole-object `state.places`
serialization (no whitelist to touch).

**Verification.** Engine (script block 1) untouched ⇒ `tests/run.sh` **923/923** unaffected. New
`tests/run_um.sh` + `tests/um_test_tail.js` (ported from `urban-morphology/tests/`, `.generate(`
calls mechanically renamed to `.cityGen(`, extraction script adapted to pull script block 4 from
the merged file and prepend a standalone `mulberry32` copy so the extracted module has no
unresolved global) — **831/831** passed. `hash_gen1.js` A/B against v0.94: **ALL IDENTICAL**
(toggle defaults off). `smoke_gen1.js` **165 → 173** (+8: toggle default-off + wiring, a real
civ-canvas pixel difference once enabled at deep zoom, pin-fade gating on the model actually being
ready, popup Age/Fortifications fields exist, editing Age changes the cache key and clearing it
back to blank restores the auto key, layout generation is deterministic for identical inputs) —
**173/173** passed. All four batteries green in one pass; docs/CLAUDE.md/README updated for the
new four-script-block architecture.

**Deferred** (documented, not built this pass): faction→culture/tradition mapping (the PoC ships
2 culture profiles; culture is fixed to `'medieval'` for now); `estimateCarryingCapacity`'s
placeholder body, compatible but not swapped for Cartalith's real capacity field; an era signal
(`civYear`) driving wall-vs-star-fort epochs over time; trimming a region way's visual overlap
where it enters a revealed layout (v1 just draws the layout on top); full terrain-sourced site
GEOMETRY (river polyline/height field/bridge-harbour placement) beyond the current real-terrain
site-TYPE classification; the PoC's parcels layer and fine detail objects (trees/wells/market
crosses/cranes/bollards) in the canvas renderer, simplified out of the v1 pass for per-frame cost.

### v0.94 (2026-07-16)
**Owner /goal: "go on with the 4th proposal [colorization loop restructuring], draw rivers as ways
as in the legacy cartalith app, and make route planning take sea-faring routes into account — at
the moment ... it opts to only use land based routes [even] when a split or partial [route] by sea
or river is possible."** Three pieces of work, each independently verified.

**Part 1 — colorization-loop restructuring, revisited with a narrower scope.** v0.93 deferred this
proposal outright; this pass re-scoped it per the two independent risks identified then. Fresh
research (full call-site trace) **proved** `renderBiomeTileRGBA`'s RGBA output is never retained
past its synchronous call anywhere in the codebase (always `putImageData`/`.set()`-copied or
pixel-read immediately), so pooling its scratch buffers is provably alias-safe — but the same
research measured tile-buffer allocation at 2-3 orders of magnitude cheaper than the ~651ms
per-pixel compute loop it sits inside, so pooling was **evaluated and skipped as not worth the
risk for a sub-1% gain**. Two changes shipped instead: (a) `sampleArr` row-hoisting —
`sampleArrRowPrep(fy)`/`sampleArrRow(a,fx,prep)` eliminate the row-only part of `sampleArr`'s
bilinear math (clamp/y0/y1/ty/row-offsets) being recomputed on every one of the 3 unconditional
per-pixel calls in `renderBiomeTileRGBA`'s hot loop — proven bit-identical (a pure function of `fy`
alone, no reordering of the actual data-blend arithmetic) and confirmed via the `--full` 35-config
hash battery, ALL IDENTICAL. (b) Palette-function scratch-ification (`snowCol`/`rockCol`/etc.,
next on the project's own performance-audit roadmap) was **designed, then also deferred** — it
surfaced a genuine nested-call aliasing hazard (`grassCol` calls `ramp3` twice before consuming
either result; a single shared scratch buffer would silently corrupt the second call's color into
the first), which needs a proper multi-slot design rather than a rushed single-buffer one. Engine
bit-identical to v0.93 hotfix at defaults; headless **923** unchanged.

**Part 2 — rivers drawn as ways, as in the legacy Cartalith editor.** `Cartalith_V1.915.html` drew
every travel network (river/road/rail/sea) as one shared stroked-polyline "way" abstraction; Gen1
instead renders rivers as a per-pixel raster blend (`surfaceColor` sampling `_riverNet.intensity`/
`depth`), with true vector strokes existing only inside the opt-in Strahler debug view. That
existing spline pipeline (`traceRiverPolylines`→`rdpSimplify`→`catmullRomSample`→`riverSinuosity`,
previously duplicated verbatim between the main-canvas and LOD debug-overlay code) is now factored
into one shared `drawRiverWays(riverNet, reproj)` — `reproj=null` on the main canvas, `{px,py,
inView,zk}` under Tiled LOD — and exposed as a new **"Draw rivers as ways"** checkbox
(`state.viz.riverWays`) next to the existing "Show rivers" toggle. **Per owner decision this pass:
overlays on top of** the existing raster water blend (both render — not a replacement) and **is
the new default (ON)** for fresh worlds, a deliberate default-render change (`loadZip` back-compat
guard keeps pre-v0.94 saves on the old raster-only look, same pattern as v0.80's ocean-currents
flip). Also closes a pre-existing gap as a side effect: the default Tiled-LOD Biome view never
showed the river network's water color at any zoom (only a decorative bank-tint SDF) — the vector
overlay reads correctly at any zoom regardless of that raster limitation. Rendering-only (no
engine/field change) ⇒ headless **923** unchanged, `field`/`temp`/`rain`/`flow` hashes identical in
every hash-battery config; `rgba` differs at every biome-mode config by design (confirmed via a
targeted A/B forcing `riverWays:false` on v0.94, which reproduces v0.93's default hash exactly —
proving nothing else in the render path changed). Smoke **159 → 163** (checkbox reflects the new
default; toggling it produces a real pixel difference on both the main canvas and under Tiled LOD).

**Part 3 — sea/river-aware route planning.** Root-caused via full code trace (not guessed):
`_civMixedCostGrid` — the one function deciding both the interactive Route tool's path and every
journey — had three real defects. (1) `_CIV_WATER_COST=1.5` was tuned *above* typical flat land
(`buildTravelCost`'s ≈1.0 baseline); the v0.73 comment says so explicitly ("stays above flat-land
... so land is still the default on comparable distance") — backwards relative to what the journey
planner's own speed model already believes (a Cog is 2.5× a walker's base speed; `JP_SHIPS`/
`JP_LAND_TRANSPORTS`). (2) Land cost here was plain slope-only `buildTravelCost`, ignoring the
biome-friction table `_civEnhancedTravelCost` already uses for the auto-network builder — under-
costing land on top of over-costing sea. (3) Real flowing rivers carried **no cost information at
all** in this grid — a river crossed exactly like dry ground. Fixed by rebalancing water to
`_CIV_SEA_COST=0.6` (now genuinely cheaper than flat land, matching the ~2-2.5× real speed
advantage), sharing `_civEnhancedTravelCost`'s biome-penalty table for land cells, and adding
`_CIV_RIVER_COST_BASE=0.85` (order-scaled, taken as a floor against local land cost so a river
never makes a cell more expensive, only potentially cheaper) for cells with real discharge (same
`flowThresh` convention used elsewhere). **Scoped to the interactive Route tool / journey planner
only** (per owner decision) — the auto-generated world road network (`_civHierarchicalNetwork`/
`_civMstRoutes`) stays two disjoint land-only/water-only passes, flagged as a possible follow-up,
not touched this pass. Verified via an independent Playwright A/B (not guessed): on a fixed seed/
resolution, six coastal point-pairs whose land-only route requires a real detour around the
coastline were run through `_civDijkstraPath(...,'mixed')` on both v0.93 and this build — every
pair showed equal-or-higher water usage on v0.94, two dramatically so (5–6% water on v0.93,
committing an essentially all-land route, → 35–50% water on v0.94, a genuine partial sea shortcut,
on the *identical* start/end points). Civ layer only (block 2), no engine/field change ⇒ headless
unaffected by construction; two new smoke-suite regression assertions lock in the two most dramatic
pairs against a fixed threshold. Smoke **163 → 165**.

### v0.93 hotfix (2026-07-16)
**Owner live-testing report: "On part of lakes, the edges are blocky/pixilated again. Also the
generated LOD tiles don't seem to be cached."** Root-caused via a headless repro (not guessed):
optimization #1's progressive overview (stretch + defer, above) has no problem with a single big
zoom jump — that case is exactly what it's built for and stays fast — but a **real continuous zoom
gesture** (many rapid ticks with no pause between them, unlike the single-jump-then-wait scenario
the shipped verification exercised) lets every tick's `_lodScheduleOverviewRebuild` call supersede
the previous tick's still-pending one before any of them land. `_lodOverviewPrev` then stays pinned
at whatever view it was last successfully rebuilt at while each subsequent tick stretches it
further — confirmed visually with an 8-tick, 15ms-spaced headless repro: the overview ended up
stretched ~5x past its last real capture, a heavily blocky/checkerboarded frame exactly matching
the report. (Tile refinement itself was never actually broken — `_lodCache` populates correctly the
moment input pauses, verified separately; "tiles don't seem cached" was the same overview
staleness making every frame during a fast gesture look unrefined.)
- **First attempt (rejected before shipping)**: cap the stretch *ratio* of any single frame. This
  broke the ALREADY-SHIPPED `R.lodProgressiveOverview` regression test — a single big jump (e.g.
  whole-map to a deep zoom in one tick) legitimately needs a large one-time stretch, and capping
  ratio blocked exactly the case opt #1 exists to keep fast, not just the runaway-burst case.
- **Shipped fix**: bound *consecutive un-landed stretches* instead of stretch magnitude.
  `_lodOverviewStretchStreak` counts stretch-only frames since the last overview actually finished
  rebuilding (real rebuild, sync or the deferred async one, resets it to 0); once the streak hits
  `LOD_OV_STRETCH_STREAK_CAP=4`, `drawLODView()` forces a synchronous resync (same ~100-130ms cost
  the v0.92 512px cap already proved acceptable) instead of stretching further. A lone big jump
  still takes the fast path (streak 0→1); only a genuine multi-tick burst gets throttled into
  periodic resyncs. Two new smoke-suite regression guards (streak stays bounded after an 8-tick
  synchronous burst; the overview genuinely resyncs at least once mid-burst, not stuck on the
  original capture) alongside the pre-existing single-jump guard — all three green together.
  `_lodOn`-gated only; render battery **ALL IDENTICAL to v0.92**, headless **923** unchanged, smoke
  **157 → 159**.

### v0.93 (2026-07-16)
**Owner /goal: "make the proposed optimisations in a new version, keep a focus on graphic fidelity
(no pixelated views or blockyness when zooming in on terrain)."** Three LOD-render/tile-pipeline
performance optimizations, all additive/opt-in on the LOD path — no engine changes; render battery
**ALL IDENTICAL to v0.92**; headless **923** unchanged; Playwright UI smoke **157/157** (+3 new
regression assertions on top of v0.92's suite, mirroring the pattern each of the three optimizations
below already established for its own opt-in fast path).

**#1 — progressive (non-blocking) overview rebuild on zoom.** Every zoom step used to synchronously
rebuild the LOD overview backdrop from scratch — even when a perfectly good previous overview already
existed to approximate the new view from — reintroducing the ~940–1200ms stall v0.92 had just fixed
for the *first* build. `drawLODView()` now branches three ways: an exact-viewport pan reuses the
cached overview via a translate-blit (unchanged from v0.92); a **zoom/pan change against a matching
render key** (`_lodRenderKey()` — content/style state, not viewport) stretches the cached overview
canvas immediately (near-instant, <30ms) and schedules the real rebuild via a new
`_lodScheduleOverviewRebuild()` on a deferred `setTimeout(...,0)`, re-checking `_fieldGen`/`GW`/`GH`
before applying results so a regenerate or resize mid-flight can't land stale data; anything else
(first build, or a style/content change — `_lodRenderKey()` differs) falls through to the original
synchronous v0.92 rebuild. `_lodBuildTileRGBA()` extracted from `drawLODView()` so both the
synchronous and deferred paths build the same tile-colorization closures from current state, fixing
an early `dbg is not defined` regression caught via console-warning capture (a naive timing-only test
missed it, since `drawLODView()` silently falls back to `_lodOn=false` on error).
*Fidelity note: the stretched placeholder is a **soft-scaled preview of the same coarse overview**
used since v0.92's 512px-cap fix — never a blocky/quantized frame — and the deferred rebuild lands the
correct sharp result well under a second later.*

**#2 — GENPOOL extended to tile refinement (`refineVisibleTiles`).** GENPOOL (the multicore Worker
pool already used for `generate()`'s heavy row-split fills) gains a second, task-parallel dispatch
mode: `runTiles(coarse,cW,cH,jobs)`/`_runTiles(...)`, round-robining independent
`{z,col,row,tileSize,opts}` tile jobs one-per-worker (vs. the existing row-split `run()`, which splits
one big job across workers). `refineVisibleTiles()` (now `async`) batches pool-eligible tiles through
`GENPOOL.runTiles` instead of computing every visible tile sequentially on the main thread — measured
**~3.1× faster** (243ms pool vs. 760ms sync-fallback for 4 tiles), bit-identical output, guarded by
`_lodGen` so a regenerate mid-flight discards stale results. A **cold-Worker JIT penalty** was found
during profiling (~20× slower on a fresh Worker's first call, interpreted vs. TurboFan-compiled) and
fixed with a `GENPOOL.warmup()` step at `init()` that dispatches one throwaway job per worker before
marking the pool `usable`, so production usage never pays it. (A red herring along the way: an
apparent 10×+ slowdown under headless/SwiftShader traced to canvas-GPU readback contention delaying
`onmessage` delivery on the main thread, not a pool defect — confirmed by an isolated no-canvas-
activity test completing in ~315ms.) The three pre-existing call sites (`lodChk` checkbox, "Refine"
button, `scheduleLodRefine`'s debounce) now `await` the async function; headless call sites are
unaffected since `GENPOOL.usable` is permanently `false` there (no `Worker` global), so the function
always takes its synchronous fallback body with no `await` reached.

**#3 — parallel atlas baking (`bakeVisibleTiles`/`bakeAllTiles`).** Both now batch each pyramid
level's not-yet-cached, pool-eligible tiles through `GENPOOL.runTiles` before the (unchanged,
still-sequential) PNG-encode/IndexedDB-write loop, instead of computing every tile's terrain data on
the main thread first. `bakeAllTiles`'s per-level batching preserves the exact `done`/`onP`/already-
baked-skip progress-callback order via a two-pass structure (build a level array with `{skip:true}`
placeholders in the original row-major order, batch-dispatch the `need` subset, then iterate again
doing the encode/write + progress callback exactly as before). Measured **~25% faster** for a 3-level
bake (21 tiles) once isolated from a same-page-first-call measurement artifact (an initial single-shot
test showed the pool *slower* — traced to whichever path ran first in a fresh page paying extra
per-shape JIT warm-up on the main thread's `tilePngBytes`/`atlasPut` call sites; a fair alternating
sync/pool/sync/pool measurement showed a stable, repeatable ~12.0–12.2s pool vs. ~15.9–16.1s sync),
correctness confirmed by identical baked-chunk sets both ways.

**#5 — lazy seasonal field allocation.** `tempJulField`/`tempJanField`/`rainJulField`/`rainJanField`
(4 × `GW×GH` Float32Arrays) used to be allocated unconditionally in `allocate()` even though seasons
default off. Now `null` until `computeSeasons()`'s first real call, which allocates them on demand;
every consumer already gated its reads behind `state.climate.seasons`/`_seasonK`/an explicit
`computeSeasons()` call (invariant 4's null-check pattern), so this is a pure allocation-timing change
— confirmed bit-identical (923 headless, hash battery ALL IDENTICAL).

**Evaluated, not shipped:** a 4th proposal (restructuring `renderBiomeTileRGBA`'s per-pixel
colorization loop — hoisting per-row-constant math, pooling scratch buffers) was scoped and then
dropped: pooling the tile-render scratch/output buffers risks aliasing with cached tile data (a
correctness bug that would manifest as exactly the visual corruption this version's fidelity mandate
exists to prevent), and hoisting math out of `sampleArr`'s per-pixel calls risks floating-point
reordering that the cross-version bit-identity invariant doesn't tolerate. Left for a future version
with a narrower, independently-verifiable scope.

**Fidelity verification** (owner's explicit requirement): fixed-seed (424242) Playwright screenshots
at whole-map overview, immediately after a deep zoom step (stretched placeholder), after settling
(pooled-refined tiles), and at the LOD zoom cap (~1km scale) — all show smooth, continuously-textured
terrain with no blocky/quantized artifacts; a canvas pixel-diff between the immediate and settled
frames confirms real (non-trivial, ~14% of pixels, subtle magnitude) detail improvement from
refinement rather than a no-op.

### v0.92 (2026-07-13)
**Owner /goal: "carry out the reported fixes [from the save-export architecture audit], then analyze
why the program is so slow when zooming in even when tiles are baked."** Followed same-day by an owner
bug report on the resulting fix ("aspect ratio goes weird... lakes are blocky/pixilated again on their
edges" — Part 3 below). Three pieces of work. No engine changes; render battery **ALL IDENTICAL to
v0.91** (every change is entirely inside `_lodOn`-gated `drawLODView()`, never the default render
path); headless **923** unchanged; Playwright UI smoke **137 → 146**.

**Part 1 — the audit's fixes (`docs/research/save-export-architecture-audit.md` §5), scoped by the
owner as "show me the audit first" → "carry out the reported fixes," compatibility break accepted:**
- **§5A1 — skip the redundant flat bake for a finalized world.** `exportZip()` used to unconditionally
  bake a fresh `map.png`/`tiles/*` from scratch on every export, even when the Atlas pyramid
  (`bakeAllTiles`, triggered by "Bake ALL levels & finalize world") already covers the whole map at
  every baked level — three independent renders of the same terrain, the exact "double data" the
  audit flagged. `state.finalized` is a precise, already-existing signal for "the atlas is complete"
  (it's only ever set true *after* `bakeAllTiles` finishes without throwing), so the flat bake is now
  skipped whenever it's true, leaving the chunked atlas as the sole map imagery for that export
  (documented in the export hint text and `README.txt`). Non-finalized exports are unchanged.
- **§5A2 — layer preview PNGs are opt-in.** The 4 `layers/*.png` reference images (biome/hillshade/
  temperature/rainfall) baked unconditionally on every export even though nothing reads them back on
  `Load project .zip` — now behind a new **"Layer preview PNGs"** checkbox next to Export, same footing
  as the existing opt-in channel atlas.
- **§5B/§5C — "Tiles & LOD" split into three labeled sections.** The one accordion that bundled the
  live zoom renderer, the Atlas bake cache, and the standalone region-export flow under one label (a
  likely source of the "double data under different names" read, since "Atlas" was nested two levels
  inside "Tiles & LOD" rather than being its own thing) is now three top-level sections: **Tiled LOD
  view**, **Atlas cache** (with the chunk-debug overlay nested inside it, where it actually belongs —
  it visualizes atlas bake state), and **Region export**. Every element id is unchanged from the old
  combined accordion, so no click/input handler changed — pure markup + copy.
- Verified: a real `exportZip()` call (entries captured via a monkey-patched `zipStore()`, not a
  download round-trip) confirms `map.png` present/absent exactly as expected for non-finalized/
  finalized worlds and `layers/*.png` present only when the new checkbox is ticked; the three new
  section labels exist and every pre-existing element id still resolves.

**Part 2 — "why is zooming in slow even when tiles are baked" (the deeper question, investigated with
real profiling, not guesswork):**
- **Root cause, found via `performance.now()` instrumentation in a real headless-Chromium pass**: the
  TILE overlay layer (the sharp, refined/baked detail — `drawLODView()` step 2) correctly serves from
  the Atlas when baked, exactly as intended. But it draws *on top of* an "instant overview" backdrop
  (step 1) that is rebuilt from scratch on **every** frame that isn't an exact pan-reuse hit — which
  includes every single zoom-level change, always — via the same expensive per-pixel colorization
  pipeline used for real tiles, run over the **entire `GW×GH` canvas** (not just the small visible tile
  area). Measured at a modest 1024px-wide world: 287ms resampling (`amplifyRegion`) + 651ms full-canvas
  colorization (`renderBiomeTileRGBA`) ≈ **940ms per zoom step** — and this backdrop is built straight
  from `field`, never consulting `_atlasBaked`/`_atlasImg` at all, so **baking made no measurable
  difference** to it (a baked-vs-unbaked A/B at the same zoom level: ~1101ms vs ~739ms cold, both far
  above the ~1ms warm/cached case — same order of magnitude either way). This directly explains the
  owner's report: the atlas *is* being retrieved correctly for the sharp layer, but the dominant cost
  users actually feel while zooming was never atlas-eligible work at all.
- **Fix**: since the overview is already explicitly documented as deliberately low-fidelity ("the
  coarse world... upscaled with **NO** procedural detail" — real detail comes from the tile overlay
  drawn on top of it), render it at a quarter resolution in each dimension (`amplifyRegion`/
  `composeTileEdits`/the color pass all already take independent output-resolution params — no
  signature changes needed) and let `drawImage`'s own bitmap scaling stretch it to fill the canvas,
  exactly like the tile overlay already stretches its own tile canvases to their screen rects. Cuts
  the backdrop's pixel count (and thus its cost, which scales with it) by ~16×.
- **Measured result**: the same profiling pass, same world, post-fix: a full `drawLODView()` call for
  an overview rebuild dropped from **655ms → 53ms** (12.3×); the isolated "overview-only, tile canvases
  and atlas still warm" case (the truest measure of what a mid-zoom-gesture frame actually pays) went
  **1186ms → 71ms (16.6×)**. A visual regression check (screenshots of the same deep-zoom, un-refined
  coastal spot before/after) confirmed the character of the backdrop — soft, blob-textured, already
  "no procedural detail" by design — is unchanged; the downscale doesn't look meaningfully different
  from the pre-fix full-resolution interpolation at that same fidelity level, since both were already
  coarse placeholders standing in until the sharp tile overlay covers the same ground.
- Zero effect on the default (non-LOD) render path or bit-identity — the whole fix lives inside
  `drawLODView()`, reached only when `_lodOn`. Verified with a permanent smoke-suite regression guard
  (an isolated overview-rebuild timing assertion, thresholded well below the old ~940-1200ms baseline)
  plus the full existing LOD/atlas/opacity/click-info suite, all green.

**Part 3 — follow-up owner bug report, same day: "Aspect ratio goes weird when using the Tiled LOD
view and the lakes are blocky/pixilated again on their edges."** The Part 2 fix above shipped a flat
`/4` downscale for the overview backdrop; this traded too much quality for the perf win.
- **Diagnosis, via fixed-seed screenshot A/B (not guesswork)**: a Playwright probe generated the same
  world (`state.tect.seed` pinned) at the pre-fix full resolution, the shipped `/4`, and intermediate
  ratios, then cropped identical world-coordinates across each render. Small lakes — anything that
  isn't the ocean coastline — get **no sub-pixel smoothing at all**: `buildCoastSDF` only distance-
  transforms the sea-level threshold (`fld[i]<sea`), so a lake sitting above sea level (a crater lake,
  an inland basin) is a hard per-pixel classification. At full resolution that hard edge is invisible
  (each step is one native pixel). At `/4` a lake that spans 8–12 native pixels collapses to 2–3 source
  samples before `drawImage` stretches it back out 4×, turning an invisible single-pixel stair-step
  into a visibly faceted diamond/blob. The "aspect ratio weird" wording is the same artifact described
  differently — a round shape's *local* aspect gets mangled by the quantization — not a canvas/CSS
  distortion (canvas width/height, CSS rect, and `lodViewRect()` aspect ratios all measured ~1.56
  consistently across every zoom level tested, so the *global* aspect ratio was never actually wrong).
- **Why a gentler ratio isn't the fix**: doubling to `/2` restores near-full-res lake quality at a
  1024px world (~110-125ms, still comfortably fast) — but a *ratio's* output pixel count (what the
  render cost is actually proportional to) grows with the world, so the same `/2` at a 2048px world
  regresses back to ~420-440ms, reproducing the original "slow when zooming" complaint at any working
  resolution above the one it was tuned against.
- **Fix**: replace the ratio with a **fixed 512px target output width** — `ovScale=min(1,
  512/GW)`, `OVW/OVH = round(GW·ovScale), round(GH·ovScale)`. This decouples the overview's cost from
  the world's resolution entirely (output pixel count is now bounded, not proportional): measured
  **~100-130ms at both 1024px and 2048px** working resolutions (vs. ~940-1200ms pre-Part-2 and
  ~420-440ms for the rejected flat-`/2` alternative at 2048px), while a world already ≤512px wide gets
  **zero downscale** — full quality at effectively no extra cost, since it was already cheap. Aspect
  ratio is preserved exactly (both dimensions scaled by the identical factor).
- Same fixed-seed screenshot comparison confirmed the 512px-cap overview is visually close to the
  full-resolution original — lake shapes stay round, coastlines stay smooth — matching the flat-`/2`
  quality bar while holding the flat-`/4`'s bounded-cost property at any resolution.
- New smoke-suite regression guards: the overview canvas is asserted to be exactly 512px wide (not
  256px, the old `/4` value) at the existing 1024px test world, and its aspect ratio is asserted to
  match `GW/GH`. Existing perf/bit-identity/headless batteries unaffected (all green).

**Part 4 — same-day second follow-up: "Graphic fidelity seems to have degraded also."** Part 3 fixed
lake/coastline blockiness, but a broader complaint remained: the terrain itself looked softer/blurrier
than before, not just at small water features.
- **Diagnosis**: comparing v0.91 (full-resolution overview) against v0.92 (Part 3's 512px-cap overview)
  at a *whole-map* zoom — the worst case, since the fixed 512px budget must represent the entire world
  at that zoom — showed a real, visible loss of fine surface grain (screenshots: v0.91's mottled
  micro-texture reads as a coarser, blotchier pattern in v0.92). This looked like an inherent cost of
  any resolution cap... until testing whether the app's own existing "sharpen after a beat" mechanism
  was actually firing. It wasn't, for one specific entry point.
- **Root cause**: `drawLODView()`'s coarse "instant overview" (Part 2/3, above) was never meant to be
  the *only* thing on screen for long — a second layer, the sharp per-tile renderer
  (`renderBiomeTileRGBA`, run through `refineVisibleTiles()`), is supposed to draw over it once the
  user settles on a view, via a `scheduleLodRefine()` call (240ms debounce) wired into every interaction
  that changes the LOD viewport: wheel-zoom, pan release, the +/− zoom buttons, and the auto-enter-LOD-
  on-zoom path. Verified this mechanism genuinely restores full sharpness once triggered (a controlled
  before/after screenshot of the identical view, before vs. after calling `refineVisibleTiles()`, shows
  a stark difference — crisp per-pixel terrain detail appears). But the **`lodChk` checkbox's own
  `change` handler never called it** — enabling "Tiled LOD view" by ticking the box (with no subsequent
  pan/zoom) left the user on the coarse overview *indefinitely*, since nothing ever scheduled the
  sharpen pass for that initial view. This gap has existed since the LOD feature shipped, but was
  invisible pre-v0.92: the un-refined overview used to be full native resolution (fine on its own), so
  never refining it looked identical to refining it. Part 2/3's resolution cap is what finally exposed
  the gap — now the two states visibly differ, and the checkbox's initial view was stuck in the worse
  one.
- **Fix**: the `lodChk` change handler now calls `withBusy('sharpening view…', ()=>{ refineVisibleTiles();
  renderNow(); })` immediately when checked — the same busy-overlay pattern the explicit "Refine" button
  already uses for this exact operation, run once immediately (not the 240ms debounce the continuous
  wheel/pan gestures use, since a checkbox click isn't a stream of events to coalesce). The deferred
  callback re-checks `_lodOn` before doing any work, guarding against the box having been unchecked
  again before the ~20ms+-deferred `withBusy` chain actually runs.
- Cost: refining+rendering a whole-map z=0 tile is a one-time, resolution-dependent hit (profiled at
  ~660ms at 1024px, ~2.7s at 2048px, on this test machine) — the same cost that already happened
  silently on a user's first pan/zoom nudge; this fix only moves it earlier and adds a busy indicator,
  it doesn't add new cost. Subsequent views of the same area are served from cache as before.
- Verified with a real `.click()` on the checkbox (not a synthetic `_lodOn=true` assignment) confirming
  the visible tile is populated in the refine cache with no further gesture, plus a screenshot showing
  full sharpness immediately after the click. New smoke-suite regression guard added (148th assertion);
  full battery green (923 headless, bit-identity ALL IDENTICAL, 148/148 smoke).

### v0.91 (2026-07-13)
**Owner request (/goal): "…how in explore the timeline should work. Currently it works, bit rather
clunky."** Chosen direction from an `AskUserQuestion` pass: **"one home, real time-scale."** No engine
changes; render battery **ALL IDENTICAL to v0.90**, headless **923** unchanged (block 1 untouched —
script-block-2 civ-UI change only), Playwright UI smoke **123 → 130**.
- **One home.** Timeline authoring (Add year + era pills), scrubbing (the year slider + Animate
  playback) and the v0.85 collapse/recovery simulator used to be split across two tabs: the controls
  lived in Generate → Civilization → Polity, while Explore → Timeline (behind the filter funnel) held
  only a second, synced *read* slider. Running a simulation meant switching to Polity, configuring and
  clicking Simulate, then switching back to Explore to scrub the result. All three now live in one
  place — Explore → Timeline — with Simulate tucked behind its own `<details>` disclosure so the
  common add/scrub/filter path stays uncluttered. Civilization → Polity keeps only territory painting
  (Auto-polity/Clear territory, unrelated to the timeline) and points to Explore in its hint text. The
  old duplicate slider (`#civTlSlider`/`#civTlSliderRow`) is gone — `#explTimelineSlider` is the only
  one now. Every element kept its id (`civTlYear`, `civTlAddYearBtn`, `civTimelinePanel`, `civSim*`),
  so the physical move only touched markup — none of the click/input handlers changed.
- **Real time-scale.** `_civWireYearSlider()` used to set `slider.max = sortedSnapshots.length-1` and
  `slider.value = <array index of the current year>` — an index range, not a year range, so three
  recorded years at 500 BC / 1200 AD / 1250 AD rendered as three evenly-spaced ticks regardless of the
  1700-year gap vs. the 50-year gap between them. Now `slider.min`/`slider.max`/`slider.value` are the
  actual recorded years, and a `<datalist id="explTimelineTicks">` (one `<option>` per snapshot,
  `list="explTimelineTicks"` on the slider) gives the browser's native tick marks at their true
  proportional positions — visually confirmed via Playwright screenshot at 3× device scale: two ticks
  cluster near one end for two close years, two cluster near the other end for another close pair, with
  a long empty span between, exactly matching the underlying year gaps. There's still no interpolation
  model between snapshots (each is a discrete territory/places/ways state), so dragging **snaps to the
  nearest recorded year** on release of the pointer (found via linear scan over the sorted snapshot
  list) — only the position-to-year *mapping* changed, not the discrete-history semantics. The
  `_civTlDragSrc` guard (prevents `_civBuildTimelineUI()`'s rebuild from resetting `slider.value` mid-
  drag) is retained even with only one slider now, since the same async-rebuild race is still possible
  from Simulate or Add-year running while a drag is in progress.
- **Gating fix, not just a move.** The Explore Timeline `<details>` used to hide itself entirely until
  `civTimeline.length > 0` — which would have made it impossible to *start* authoring from Explore
  (there's no way to add the first year from a section that's hidden until a year exists). It's now
  always open/visible; only the slider+playback row (`#explTimelineSliderRow`) is gated on
  `civTimeline.length > 1` (nothing to scrub between below that), matching the old Polity-side slider
  row's gating threshold exactly.
- Verification: smoke assertions cover the single-home consolidation (old slider gone, Add
  year/pills/Simulate all found inside `#explTimelineSection`, Polity no longer duplicates them), the
  slider-row visibility gate at 1 vs. 2+ recorded years, the real year-value min/max (not a `0..count-1`
  index), the datalist tick years, and nearest-year snapping in both directions on drag. Browser-
  verified via Playwright: the merged popover layout (Add year → pills → slider → filters → Simulate
  disclosure) screenshotted in both collapsed and Simulate-expanded states, and the proportional tick
  spacing screenshotted at 3× zoom on a slider with two clustered-then-distant year pairs.

**Same-day follow-up fixes (owner reports)**, Playwright UI smoke **130 → 136**:
- **"I dont see the timeline menu in explore"** — the first cut above put Timeline behind the filter
  funnel's collapsed popover, alongside Polity/Settlements/Roads. That reads as a *filter* control, not
  the primary editing surface it had just become, and was easy to miss entirely — especially since the
  section stayed collapsed by default. Moved out to `#explTimelineSection`, a plain always-visible
  `.sec` in the Explore sidebar with its own `<h2>Timeline</h2>`, same footing as Info/Journeys below
  it — no funnel click, no `<details>` to expand. The filter funnel keeps only the genuine layer-
  visibility filters (Polity/Settlements/Roads).
- **"the layer views arent responding to opacity anymore"** — a real regression from this session's
  own v0.89 work: generalizing `drawLODView()` to tile *every* debug view (previously only lith/soil/
  water did) means `renderNow()`'s LOD early-return now fires unconditionally, before the opacity-blend
  code below it ever runs — so the opacity slider went silently inert for all ~29 debug views whenever
  Tiled LOD was on (previously most views fell through to the un-tiled path, which does blend). Fixed
  by threading the same blend (`base + (debug−base)×alpha`) into the LOD tile path itself: `drawLODView`
  now renders the ordinary base tile (`renderBiomeTileRGBA`/`renderHeightTileRGBA` — the same functions
  already used for `dbg==='off'`) alongside the affordance tile and blends them per-pixel, skipped
  entirely at alpha=1 (default) for zero added cost. `_lodRenderKey()` gained `state.debugOpacity` so
  the tile/overview caches actually invalidate when the slider moves (else the view would've stayed
  frozen at whichever alpha rendered first — the same class of bug the v0.86 climate-redraw and v0.88
  scale-bar fixes closed).
- **"the settlement/wildlife ones arent clickable for their information anymore"** — a pre-existing gap
  explicitly flagged as a known follow-up in the v0.89 CHANGELOG entry, now fixed: the settle/wildlife
  click-to-inspect handlers were gated `!_lodOn` outright because `evtToGrid()` assumes the canvas
  always shows the full `GW×GH` world, which is only true off LOD. New `evtToGridLOD(e)` — the inverse
  of v0.90's `_civPlaceScreenPos` forward projection, reprojecting through `lodViewRect()`'s sub-region
  instead of the whole world when `_lodOn` — replaces the outright block, so the click handlers now work
  under Tiled LOD instead of being disabled by it.
- All three verified with real Playwright interaction (not just DOM presence): a dispatched click at the
  marker's actual LOD screen position opens `#settleInfo`/`#wildInfo`, and the same debug view at 100%
  vs. 30% opacity paints measurably different pixels while `_lodOn`. Render battery still **ALL
  IDENTICAL to v0.90** (the opacity blend is skipped at the default alpha=1; the click fix changes event
  handling only, never pixels); headless **923** unchanged — these are canvas-interaction/LOD-render
  fixes, invariant #3 in `CLAUDE.md` (cannot be verified headlessly).

**Second same-day follow-up (owner reports)**, Playwright UI smoke **136 → 137**:
- **"Roads and ways seem to nearly miss settlements when zooming in... clipping to settlements seem
  slightly off"** — root cause: `_civSmoothPath()` (the shared Catmull-Rom smoothing chokepoint every
  way builder routes through) called `Math.round()` on **every** point of the finished polyline,
  including its own first/last point — up to half a grid cell of drift, imperceptible at normal zoom but,
  amplified by Tiled LOD (one grid cell can span many screen pixels deep in), visibly leaves the road
  short of the settlement pin (which is drawn at its exact, usually-fractional, coordinate). Fixed by
  restoring full precision at just each run's own endpoints after rounding (interior points stay
  rounded — their precision was never load-bearing). `_civHierarchicalNetwork()` (the auto-route/auto-
  populate network builder) had a second, compounding source: its raw path points are downsampled
  routing-grid cell centers, not the settlement's own coordinate — fixed by substituting the real place
  coordinate in for the true first/last run of each edge (interior junction-to-junction runs are left
  alone, since they legitimately meet at a shared junction, not a settlement, and must keep their
  corridor-consolidated position so shared strokes still line up). `_civConnectPlaceToNetwork()`'s
  "no network yet, spur to the nearest other settlement" fallback got the matching fix. Verified two
  ways: a whole-world probe (auto-populate + auto-routes) shows the median way-endpoint-to-nearest-
  settlement distance drop to exactly 0; a controlled probe (two real, fractional-coordinate settlements,
  builders called directly) confirms both `_civHierarchicalNetwork` and `_civMstRoutes` now land exactly
  on the input coordinate (0.0 grid cells, was up to ~1). Civ layer (block 2) only — headless **923**
  unchanged, render battery **ALL IDENTICAL to v0.90** (way geometry isn't part of the render battery).
- **"[Clear places] leaves the routes"** — `civWays`/`civJourneys` carry no settlement-id reference (just
  polylines/plans), so deleting the settlements they connect doesn't error, it just leaves roads drawn to
  nowhere. `civClearPlacesBtn` (renamed **"Clear places & routes"**) now clears `civWays`/`civJourneys`
  too, mirroring `civClearRoadsBtn`'s own clear — one click removes settlements **and** their routes, the
  same "destroys everything, confirm-gated when non-empty" pattern as the other two Clear buttons.

### v0.90 (2026-07-12)
**Owner request: "editing a settlement should open a pop-up in the viewscreen with the settlement
properties and information."** No engine changes; render battery **ALL IDENTICAL to v0.89**, headless
**923** unchanged (block 1 untouched — this is a script-block-2 civ-UI change), Playwright UI smoke
**120 → 123**.
- **Settlement/POI editor moved from the sidebar into a floating map pop-up.** Previously, selecting a
  place rendered its full edit form into the sidebar-pinned `#inspectorBody` (v0.65 §4.7) — a fixed
  panel you had to keep in view. Now `_civRenderInspector()`'s place branch opens `#placeEditPopup`
  instead: a floating card anchored at the place's own on-screen position, mirroring the existing
  `showSettleInfo`/`showWildInfo` popup idiom but editable (reuses `_civPopulatePlaceEditor`'s field-
  building/wiring completely unchanged — only the host element moved). Labels/icons are untouched, still
  the sidebar-pinned inspector (out of scope for this pass; the shared single-selection dispatcher just
  now branches to a different host per selection type).
- **New `_civPlaceScreenPos(gx,gy)`** — world-grid → viewport-client-px projection, so the popup follows
  the place regardless of *how* it was selected (map click, sidebar list, right-click menu — all the
  existing `_civSelectedPlace=` call sites work unchanged) without threading click coordinates through
  each one. Handles both the normal `viewT` CSS-transform pan/zoom and `_lodOn` (reusing v0.89's
  `lodViewRect()`-based projection). Caught a real math bug during testing: the first draft subtracted
  `panX`/`panY` to recover the untransformed origin and then forgot to add them back — since they cancel
  algebraically, the fix is simply `r.left + contentX*scale` (no need to touch pan at all; that
  complexity is only needed by `_civMoveViewTo`'s *inverse* problem of solving for pan, which this
  function does not do).
- **Sidebar list stays, per the owner's chosen option.** The "All settlements"/"All POIs" lists keep
  browsing/deleting; their row-click and "✎ Edit" button now call `_civMoveViewTo(p.x,p.y)` (already
  existed as the "📍 Move viewer here" button's handler) before selecting, so the popup opens already
  centered and visible instead of wherever the view last happened to be.
- **Popup lifecycle**: the × button (and clicking empty map with the Inspect tool, which already set
  `_civSelectedPlace=null` unconditionally) closes it; selecting a label/icon or the delete action close
  it too (dispatcher-level, so every existing `_civSelectedPlace=` call site inherits this for free); a
  tab switch (Generate ↔ Explore) now also dismisses it, mirroring how switching the debug-view segment
  already dismisses `#settleInfo`/`#wildInfo`.
- Verification: smoke assertions cover popup-opens-in-map-not-sidebar, on-screen positioning after both
  map-click and list-select (with the actual pan/zoom asserted), live model + row-summary patching while
  typing (the `_civSelectedRowRefs` live-patch plumbing, preserved end to end), label/icon selection
  closing the place popup and vice versa, and the × close button. Also hardened a fragile v0.89 smoke
  assertion found along the way ("LOD tile shows internal pixel variance") that could spuriously fail on
  a random world where a debug view's field happens to be locally uniform in the zoomed patch (not a bug,
  just bad luck of the seed) — replaced with a robust check that the zoomed-in render actually *differs*
  from the whole-map render for the same debug view (the real invariant the original bug violated).
  Browser-verified: dark and light theme, both interaction paths (map click, list "✎ Edit"), and the LOD
  positioning branch, via Playwright screenshots.

### v0.89 (2026-07-12)
**Owner report: "tiled LOD info-layers don't scale properly."** No engine simulation changes; render
battery **ALL IDENTICAL to v0.88**, headless **917 → 923**, Playwright UI smoke **117 → 120**.
- **Root cause.** `drawLODView()` only tiled `state.debug` ∈ {off, lith, soil, water} (v0.109's affordance
  follow-up); every other debug/info layer (temperature, rainfall, Köppen, resources, wildlife, population
  density, tectonics, wind/ocean, rivers, …  — ~26 views) fell through to `renderNow`'s full un-zoomed
  GW×GH pixel loop while the canvas stayed CSS-sized/fitted for the current LOD zoom (`_lodFitCanvas`,
  v0.87) — so switching to e.g. Temperature while zoomed in just stretched the *entire world* into the
  zoomed viewport instead of showing the zoomed slice.
- **Fix — every debug view now tiles.** `renderAffordanceTileRGBA` (the v0.109 lith/soil/water tile
  colourizer) is generalized to cover all ~29 non-'off' `state.debug` values: each tile pixel samples the
  live coarse field at its world coordinate (bilinear via `sampleArr`/`bilC` for continuous fields —
  temperature, rainfall, stress, orogeny, geoid, tides, resources, carrying capacity, population
  density, wind/ocean coarse grids, flow accumulation, wind velo…; nearest for categorical class/id arrays
  — plate id, boundary type, lithology, landform, Cartalith biome/terrain, Köppen code, wildlife region id)
  and applies the EXACT color formula the main map already uses for that view, so a tile at any zoom
  reproduces what the main map would show for that slice. Relief-lit views (landform/fjord/wildlife/velo/
  strahler "dim terrain") get a new `tileShade()` — the same hillshade math as `shadeFactor`, but computed
  from the tile's own amplified local heightmap (like `renderBiomeTileRGBA`'s hillshade), so they stay
  properly detailed at any zoom instead of using the coarse native-grid gradient. New `debugTileContext(dbg)`
  builds whichever precomputed field(s) a view needs ONCE per `drawLODView()` call (not per tile), so
  expensive derived fields (flow accumulation via `computeFlow(true)`, the wind/ocean coarse-grid solves)
  are computed at the same frequency the main map already pays per render — no new perf cost.
- **Vector overlays reproject too (owner: "everything, overlays included").** New `drawLODDebugOverlays(v,
  dbg, ctx)` reprojects the main map's screen-space debug overlays onto the current LOD view rect: wind/
  ocean current arrows, plate-drift arrows, the T1 boundary-graph polylines + junction nodes, Strahler
  river splines (via the existing `traceRiverPolylines`/spline pipeline), and the settlement-suitability/
  wildlife advisory markers. Line/glyph sizes scale with the view's zoom factor `zk=min(8,GW/span)` (capped
  — past ~8× the underlying coarse fields have no more genuine detail, so growing glyphs further would just
  clutter the view) so strokes stay proportionate to the terrain the way tile-baked features already do;
  point markers use the same civIconScale-style "roughly constant on-screen size" convention. Off-view
  elements are culled before any canvas work.
- **Follow-on fixes found while generalizing the path.** The two `drawCivLayer`/civ-bake-cache gates that
  windowed the settlement/way/territory overlay to match the *old* 4-value tiled set now simplify to a
  plain `_lodOn` check (every debug view tiles now, so the civ layer always windows to match). The LOD
  early-return was missing `updateLegend()` (pure `state.debug`→DOM, cheap) — pre-existing even for lith/
  soil/water, far more noticeable now that every layer tiles; added alongside the existing `updateScaleBar()`.
- **Known, unchanged limitation (not a regression).** Click-to-inspect for the Settlement and Wildlife
  advisory markers stays gated to non-LOD (`!_lodOn`), exactly as before — `evtToGrid()` has no LOD-zoom
  awareness (it maps a click as a fraction of the full GW×GH grid, ignoring `_lodZoom`/`_lodCx`/`_lodCy`),
  so naively enabling the click handler would hit-test against the wrong world coordinates while zoomed.
  The markers now render correctly at any LOD zoom; wiring their click-to-inspect popups to a LOD-aware
  coordinate conversion is flagged as a follow-up, not attempted here.
- Verification: extended `renderAffordanceTileRGBA`'s existing lith/soil/water headless test to loop over
  all ~27 remaining `which` values (finite + opaque + deterministic), plus spot-checks against exact
  main-map water-cell colours for koppen/landform/windthrow and a temp-has-no-water-branch parity check.
  New smoke assertion drives 12 representative debug views while `_lodOn` and asserts `renderNow` never
  reaches the full pixel loop (`PERF.counters.renderPixelLoop` unchanged), the reprojected overlays throw
  no canvas errors, and the resulting tiles show real pixel variance (not a blank/solid stretch — the
  visual symptom of the old bug). Browser-verified via screenshots: Temperature/Resources/Wind/Boundary-
  type/Strahler all correctly zoomed with matching legends and properly-scaled overlays.

### v0.88 (2026-07-12)
**Two owner-reported items: deep-zoom scale + one-button save/restore.** No engine simulation changes;
render battery **ALL IDENTICAL to v0.87**, headless **911 → 917**, Playwright UI smoke **113 → 117**.
- **LOD zoom capped too shallow (fix).** Owner: "highest zoom stops at a scale of 20km, I'd like to drop
  down lower 5km even." Root cause was two-fold: (1) `_lodZoom` was clamped to a fixed ×64 in all three
  zoom-input sites (button step, wheel, pinch) — the reachable real-world view span (`mapWidthKm/zoom`)
  therefore depended entirely on the map's width, and never reached a tight close-up on anything but small
  maps; (2) `updateScaleBar()` divided the *full* `state.mapWidthKm` by the canvas's on-screen width even
  while LOD-zoomed in — LOD's own zoom is an in-canvas transform (`_lodZoom`), not the CSS `viewT.scale`
  the bar's formula assumed, so the bar read a **frozen** distance that never shrank as you zoomed in (the
  reported "stuck at 20km" reading). Fixed with two small pure helpers: `lodMaxZoom()` scales the cap to
  `mapWidthKm/5` (floor 64, so small/default maps keep at least the old headroom) used at all three zoom
  sites; `lodSpanKm()` returns the real-world width actually on screen (`mapWidthKm/_lodZoom` while LOD is
  on, full width otherwise), now feeding `updateScaleBar()`. Render/engine untouched (browser-chrome only).
  Probe: default 800 km map now reaches a 5 km span (max zoom 160×) with the scale bar shrinking from
  50 km → 200 m across the zoom range (previously frozen). +4 headless + 2 smoke assertions.
- **Export/Import take the atlas separately (fix, owner request).** Owner: "Cartalith makes a save file of
  everything the user did and used (asset pack included) and exports it… a separate assetpack import
  [belongs] in the respective assetpack menu." `exportZip()`/`loadZip()` already unconditionally embedded/
  restored the baked LOD atlas and the asset library alongside every other field — but a standalone
  **Export atlas…**/**Import atlas…** action pair *also* existed (header File menu + Tiles & LOD sidebar),
  plus an **Embed baked atlas** checkbox that made the atlas embed optional, undermining "one export = the
  whole world." Retired all three: removed `atlasImportBtn` (header), `atlasExportBtn` (Tiles & LOD →
  Atlas), their file input, and the now-dead `exportAtlasZip()`/`importAtlasZip()` browser shells (the pure
  `atlasExportEntries`/`atlasImportEntries` cores stay — `exportZip`/`loadZip` call them directly,
  unconditionally). **File → Load project .zip**/**Export .zip** are now the sole 100%-round-trip actions.
  The dedicated asset-pack-only import/export pair stays exactly where the owner wants it — the Assets
  Library's own **Import pack…**/**Export pack .zip** (`#alImportPackBtn`/`#alExportBtn`), untouched. UI/
  wiring-only; hint text in both the File menu and the Atlas accordion rewritten to describe the new
  one-button model. +2 smoke assertions (buttons gone; Assets-Library pair still present).

### v0.87 (2026-07-11)
**Two owner-reported UI items.** No engine changes; render battery **ALL IDENTICAL to v0.86**, headless
**911** unchanged, Playwright UI smoke **111 → 113**.
- **LOD/atlas viewport regression (fix).** In LOD/atlas mode the CSS transform is identity (LOD does its
  own in-canvas zoom/pan), which left the `#view` canvas at its intrinsic GW×GH size — a small tile in a
  big viewport (owner: "the viewport restricts again to the initial World px size instead of full screen").
  Added `_lodFitCanvas()`: when `_lodOn`, letterbox-fit the canvas element to the `.canvas-wrap` content box
  (fills the viewport, preserves aspect); cleared back to intrinsic + the `viewT` CSS-transform path when LOD
  is off. Transparent to LOD input — `evtToGrid` and the LOD pan capture both read `view.getBoundingClientRect()`,
  so a larger on-screen canvas needs no mapping change. Called from `applyView()` and on window resize.
  Display-only ⇒ render bit-identical (probe: LOD canvas 514×330 → 920×589 in a 956×804 wrap).
- **Import + Export consolidated into one "File ▾" header menu (owner request).** The two `.dropdown-wrap`
  containers (Import ▾ / Export ▾) merged into a single `#fileMenu` with an **Import** section (the five
  action buttons) and an **Export** section (the image/project form). Every element id is unchanged
  (loadBtn/inferTectBtn/loadZipBtn/packBtn/atlasImportBtn + bakeRes/bakeTiles/chanAtlasChk/embedAtlasChk/
  exportBtn/bakeProgRow) so all wiring is untouched. Close behavior preserved per-section: the single-shot
  Import rows (and Export .zip) close the menu on click; clicks inside the Export form don't (so ticking a
  checkbox doesn't dismiss it). CSS `#exportMenu` rules retargeted to `#fileMenu` (incl. the v0.86 mobile
  viewport-pin). +2 smoke assertions (both sections present; form-click keeps it open).

### v0.86 (2026-07-11)
**Seven owner-reported fixes/additions** — UI/UX bug-fixes plus two new header utilities. No engine
(block 1) simulation changes at defaults; render battery **ALL IDENTICAL to v0.85**, headless **909 →
911**, Playwright UI smoke **103 → 111**.
- **Climate redraw regression (fix).** "Simulate weather" (and any climate recompute) rewrites
  `rainField`/`tempField`/`koppenField` but does NOT bump `_fieldGen`, and the render bake-cache key
  (`_civBakeKey`) plus the LOD render key (`_lodRenderKey`) only keyed on `_fieldGen`/`state.viz`/… — so
  the cached bitmap was reused and the map only refreshed when an *unrelated* `state.viz` change (e.g.
  Min stream order) happened to change the key. Added a monotonic **`_climGen`** counter, bumped in
  `computeTemperature`/`simulateWeather`/`applyClimateMoistureCorrectors`/`applyOceanCurrents` (and via
  the internal weather calls, `computeSeasons`), and included it in both cache keys. Same climate ⇒ same
  key ⇒ bit-identity preserved (verified).
- **Mobile: can't return to the map from Assets (fix).** The only exit was a phase tab, which on mobile
  lives inside the off-canvas sidebar drawer — no visible control in Assets mode. The header 🎨 button is
  now a proper **toggle** (relabels to "← Map", marked `.on`) with an explicit `_carExitAssetsMode`;
  always visible on every screen size. The phase-tab route out still works and keeps the button in sync.
- **Mobile: Export dropdown clipped (fix).** The 300px header dropdown anchored `right:0` pushed ~10px
  off the left edge on a ~390px screen. On `max-width:860px` the `.dropdown-wrap .dropdown` menus now pin
  to the VIEWPORT (`left:8px;right:8px`, height-capped, own scroll). Scoped to header dropdown-wraps, so
  the on-canvas Layers popover is untouched.
- **Debug-layer legends + popover scroll containment.** Audited all 31 Layers-popover views — every one
  already renders a non-empty, visible legend (now locked by a smoke assertion). Real fix: the popover
  lives inside `.canvas-wrap`, whose wheel handler `preventDefault()`s to zoom the map — so scrolling the
  layer list zoomed the map underneath. Added a `stopPropagation` wheel guard on the popover; native list
  scroll runs, the map no longer zooms.
- **Credits & academic-principles menu (new).** A header **ⓘ** button opens a scrim-backed modal with
  three sections: programming/code sources studied (studied-not-copied — LanLou123, SebLague, weigert,
  RiverBuilder, Premože & Ashikhmin, the V1.915 editor), academic principles in terrain/tectonics/climate
  (plate tectonics, flexure/isostasy, Braun & Willett stream power, Strahler ordering, Leopold & Maddock
  hydraulic geometry, Mei et al. velocity erosion, Köppen–Geiger), and civilization/population (NPP
  carrying capacity, Christaller/Lösch central places, Brandes betweenness + Albert–Jeong–Barabási
  robustness, Zipf/Ravenstein gravity migration, Verhulst logistic growth, Benedictow/Cline/Wickham
  collapse). Escape / backdrop / ✕ close it. Static reference text — no state.
- **Light theme switch (new, ported from Cartalith V1.915).** V1.915's editor had an Auto/Dark/AMOLED/
  **Light** theme selector; Gen1 was dark-only. Added a header **☀/🌙 toggle** that sets
  `:root[data-theme="light"]` (parchment palette overriding the 10 base palette vars) and persists to
  `localStorage['cartalith_theme']`. Restyles UI chrome + the map-viewport matte only — the MAP canvas is
  JS-drawn (`surfaceColor`/`hypso` ramps), so switching themes never touches a map pixel (bit-identity
  intact). Stub gained `document.documentElement` + `removeAttribute` for headless coverage.
- **Geological Resources layer: stale on sea change + exposed-land-only (fix).** Owner report: raising/
  lowering the sea slider didn't update the Resources view, and it only mapped terrain above water. Two
  causes: (1) the sea-level handler invalidated the water-body/biome caches (v0.70) but NOT the affordance/
  civ derived caches, so `currentResourcePotentials()` (and its siblings — water access, soil, landforms,
  fjords, carrying capacity, settlement suitability, pop density, wildlife) served a cached field built at
  the old coastline. The handler now nulls the whole derived set — the SAME group generate()/computeFlow
  clear — so each re-derives on its next view. (2) `buildResourcePotentials` skipped every submerged cell
  (`if(fld[i]<sea) continue`), blanking resources under water and shifting the map as the sea moved.
  Geological potential (porphyry copper at a subduction margin, orogenic gold on a transform fault, BIF in
  a shield) is a property of the BEDROCK — present whether the cell is above or below sea level — so it's
  now computed over the **full map**, sea-level-independent for the tectonic/lithologic resources (the
  surface-formed evaporite/bog-iron branches keep a lowland term, clamped ≥0 so submerged cells read as
  base level). +2 headless assertions (submerged margin still carries copper; bedrock copper unchanged by
  submerging a cell). Default render is dbg='off' so resources aren't built there ⇒ bit-identity intact.

### v0.85 (2026-07-10)
**Mechanistic collapse/recovery timeline simulator** (owner: "I think it should be possible to model how such
a collapse would play out. What settlements fall first how people migrate etc… research the mathematics in
regards to population mechanics… how to use this new function in regards to the timeline"). Builds on v0.81's
capacity-grounded populations and v0.82's phase-scaled recovery: instead of an instant before/after snapshot,
this runs a **year-stepped simulation** — per-settlement stress → excess mortality + out-migration (or logistic
regrowth), gravity-model redistribution of migrants, tier demotion/abandonment — and writes ONE `civTimeline`
entry per step, so the result scrubs through the *existing* timeline slider exactly like manually-authored
history. New research doc `docs/research/collapse-timeline-dynamics.md` (Albert/Jeong/Barabási 2000 network
robustness, Zipf 1946/Ravenstein 1885 gravity migration, Benedictow 2004 Black Death mortality calibration,
Cline 2014/Wickham 2005 collapse-character sourcing). Civ layer (block 2) only — no engine (block 1) changes;
render battery ALL IDENTICAL to v0.84, headless **909** unchanged, smoke **86 → 98**.

- **Pure simulation core**, all new, all deterministic (no RNG consumed anywhere in the model):
  `_civProximityAdjacency`/`_civBetweennessFromAdjacency` (a standalone Brandes-betweenness proximity graph,
  rebuilt fresh each step so it never goes stale across settlement removals, unlike the rendered `ways`);
  `_civSettlementStress` (per-settlement stress in [0,1] from trade-dependency loss vs. a t=0 baseline,
  density/connectivity exposure, and undefended-violence exposure, weighted by a **character**: trade/disease/
  conflict/mixed — each fails settlements in a different order, sourced per doc §2); `_civMortalityMigrationRates`
  (stress×severity → excess-mortality and out-migration fractions, capped at doc-derived ceilings — 15%/yr
  mortality ceiling backs out of the Black Death's ~45% toll over ~4 years); `_civGravityMigrate` (Zipf/
  Ravenstein gravity model: survivors redistribute to reachable settlements ∝ attractiveness/distance^1.5,
  headroom-capped, system-wide overflow becomes unplaced transit/diaspora loss — mass-conserving);
  `_civCollapseStep`/`_civRecoveryGrowthStep` (one `stepYears`-long jump: collapse applies mortality+migration
  then re-derives each survivor's tier, demoting a shrunken city into a fortified ruin-village or abandoning it
  outright below the v0.82 floor; recovery compounds Verhulst logistic regrowth toward each settlement's own
  local catchment ceiling, clearing `ruins` on promotion back into an exchange tier); `_civSimulateTimeline`
  (orchestrator — runs `steps` collapse-or-recovery steps from a starting `places` array, returns one
  `{places, stats}` snapshot per step; tracks the t=0 baseline betweenness by each place's stable `tid`).
- **UI**: new "Simulate collapse / recovery" section under Civilization → Polity, right below the existing
  timeline (mode select, character select, severity/regrowth-rate sliders, start year + duration/step-years
  fields, a Simulate button, and a result summary reporting deaths/migrants/failed settlements). Wired by the
  new impure `_civRunCollapseSimulation()`, which reads `state.places`, runs the pure orchestrator, and writes
  the resulting snapshots into `civTimeline` — **never touching `state.places`/`civWays`**, the same rule every
  other timeline write already follows (territory/ways carry forward unchanged from the nearest prior entry;
  collapse doesn't redraw political borders, that stays an authored layer).
- Verify: browser-confirmed end to end on a real auto-populated world — Simulate wrote the expected number of
  timeline entries, the year pills/slider picked them up with no new rendering code, and the settlement/ways
  editors were untouched throughout. Smoke suite grew 86 → 98 (pure-function correctness: hub betweenness,
  character-dependent stress ordering, mortality/migration monotonicity+ceilings, gravity-migration mass
  conservation + distance decay, collapse-step determinism + population reduction, recovery logistic growth,
  multi-step trajectory monotonicity; UI: mode-toggle row visibility, live slider labels, civTimeline writes,
  and the state.places/civWays-untouched invariant).
- **Post-ship audit pass (same day)** — a skeptical re-review of the simulator found and fixed five defects:
  (1) the t=0 baseline-centrality map was built by pairing the *failure-filtered* settlement array against
  *unfiltered* betweenness indices — any step-0 failure silently misattributed every later settlement's
  baseline; `_civCollapseStep` now returns `normBByTid` keyed over the INPUT settlements. (2) mortality/
  migration rates are **annual** (doc §4's Black Death calibration) but were applied once per step regardless
  of step length — a 10-year step ran an order of magnitude milder than documented; the step now compounds
  `(1−m)^stepYears`, mirroring the recovery stepper (doc §4 updated with the compounding form). (3) gravity
  overflow at a saturated destination was dropped as diaspora loss even while other destinations had headroom,
  deviating from doc §5's "system-wide overflow" definition — allocation now re-offers the clipped remainder
  over bounded passes. (4) simulating onto an EMPTY timeline conjured a phantom year-0 era via
  `civSnapshotSave(civYear)` — the exact bug civAddYear's v0.62 guard fixed; same guard applied. (5) simulated
  years landing on existing (authored) timeline entries were overwritten silently — now confirm()-gated like
  every other destructive action. Plus comment-honesty fixes (the "pure" claims now state the GW/state.world
  reads). Smoke **98 → 103** (compounding, baseline-map contract, overflow re-flow, phantom-year guard,
  overwrite confirm); render battery still ALL IDENTICAL to v0.84, headless 909 unchanged.

### v0.84 (2026-07-10)
**Fix: restore the "Vertical" sublabel above Sea level/Peak altitude** (owner report: "the option for sea
level should have stayed where it was"). v0.83 removed the Map width row from the sidebar's Scale &
calibration section as requested, but its edit also deleted the **"Vertical" sublabel-grp heading** that sat
above Sea level/Peak altitude — an overreach: only the "Horizontal" heading (which introduced the now-removed
Map width row) should have gone. Sea level's control itself never moved position; only its section label was
briefly missing. Pure markup restore; render battery ALL IDENTICAL to v0.83, headless **909**, smoke **86**
unchanged.

### v0.83 (2026-07-10)
**Map width input removed from the Generate → World sidebar — creation-time only** (owner request). Since
v0.70, the sidebar carried a *disabled, read-only* copy of the map width (`#mapw`, "shown for reference"
alongside a distance-reference legend) next to the real, editable input in the setup gate (`#suWidth`/
`#suWidth2`). The owner asked to drop the duplicate entirely: map scale is now visible/settable in exactly
one place — the New-world/Import setup gate — never in the sidebar. Pure UI markup + dead-handler removal;
**render battery ALL IDENTICAL to v0.82**, headless **909** unchanged, smoke **86** (2 assertions updated for
the removed elements, none added — no new behavior, just less UI).

- Removed the "Horizontal · fixed at creation" sublabel, the `#mapw` row, and its `#calLegend` reference
  legend from the sidebar's **Scale & calibration** section; kept the km/mi unit toggle (still governs the
  Peak-altitude field's display unit and the on-canvas scale bar) and Sea level / Peak altitude. Rewrote the
  section hint to drop the now-nonexistent row.
- Removed the now-unreachable `bind('mapw', …)` handler (would have thrown on load — `bind()` doesn't
  null-check, unlike `v()`/`lab()`) and the `if(el.id==='mapw') return` exemption in the finalize-lock loop
  (dead once the id no longer exists). Trimmed `_sidebarScaleSync()` to peak-only; `renderDistLegend()` is
  still used by the setup gate's own legend, untouched.
- `state.mapWidthKm` is unchanged in meaning — still set once by `_suGenCommit`/`_suCalCommit` at creation/
  import and read everywhere the engine already read it (cellKm scaling, routing, settlement catchments,
  the v0.81/v0.82 population model, exports). Nothing about *how* the value is used changed, only *where*
  it can be entered.
- Verify: browser-confirmed the sidebar section renders cleanly with no orphaned controls; smoke updated —
  `#mapw` no longer exists, `#suWidth`/`#suWidth2` still do, and `state.mapWidthKm` survives a `generate()`
  call unchanged (no live sidebar control can write it).

### v0.82 (2026-07-10)
**Post-collapse recovery model** (owner: "start it too" — `docs/research/settlement-emergence.md` §5–6). Builds
on v0.81's capacity-grounded populations: auto-populate can now model a world rebuilding **after a demographic
collapse**, running *below* the ecological ceiling. Civ layer (block 2) only; render battery ALL IDENTICAL to
v0.81, headless **909**, smoke **84 → 86**. Default = **Stable** ⇒ auto-populate byte-identical.

- **Recovery-phase selector** under Civilization (`_civRecoveryPhase`, transient): Stable · I Survival ·
  II Subsistence · III Regional · IV Mature. Each scales settlement populations by a phase fraction
  (`_CIV_RECOVERY_FRAC`: <10% · 10–30% · 30–70% · 70%+).
- **Labour-shortage tier demotion** — the doc's key mechanic. New pure `_civApplyRecovery(places, phase, rng)`
  + `_civTierForPopulation(pop)` (population→tier by the doc's §3.1 bands, floors in `_CIV_TIER_FLOOR`). When a
  nucleus is scaled below the labour its tier needs, it **demotes to the tier its surviving population
  supports** — a former city surviving only as a village. A demoted **urban** site keeps its people clustered
  in the defensible ruins → gains a `fortified` trait + `p.ruins` (a fortified settlement inside the ruins).
- **Sparse survival nodes** — in Survival/Subsistence, tiny inland nodes with no water/ruin anchor are
  abandoned; survivors cluster on water (ports) and ruins.
- Browser-verified across all five phases on one fixed world: Stable 93k pop / full hierarchy / 0 ruins →
  Survival 5.8k (6%, cities gone, 13 fortified ruins, 41→22 settlements) → Subsistence 17% → Regional 45%
  (cities returning) → Mature 81%. Exactly the doc's Phase I–IV trajectory. Two new smoke assertions (pure
  demotion + integration: Survival total ≪ Stable, with ruins).
- **Deferred (documented follow-ups):** ruin-reuse *placement value* (biasing new settlements toward existing
  ruins/water/infrastructure, not just re-scoring the placed set), and surplus-gated *growth* over time.

### v0.81 (2026-07-10)
**Capacity-grounded, map-size-dependent, automatic settlement populations** (owner design doc +
`docs/research/settlement-emergence.md`). Auto-populate no longer assigns population from a fixed per-tier base
× suitability — a settlement's population is now the **energy-system model**: what its catchment land can
sustain and what the transport network lets it concentrate. Civ layer (block 2) only; render battery ALL
IDENTICAL to v0.80, headless **909**, smoke **83 → 84**.

- **Research decision (option 1 vs 2).** The owner asked which of "catchment × centrality" vs "capacity-first,
  derive tier" is more realistic. Neither pure form is: the doc's §9 prescribes capacity-first, but §3 is
  explicit that a town/city "is not the productive unit — it is the exchange node," so a pure capacity model
  misplaces cities. **Applied the synthesis:** capacity-grounded populations as the base, split by economic
  role — **productive tiers (hamlet/village)** from local catchment carrying capacity; **exchange tiers
  (town/city/capital/metropolis)** additionally draw a centrality-weighted share of a regional urban pool.
- **Grounded in the land + map scale.** A cell's agrarian density = `carryingCapacity(K) × AGRARIAN_MAX_KM2`
  (200/km² fertile-valley ceiling; prime land ≈120/km², marginal ≈30/km² — the doc's environment table). A
  settlement's population integrates that over its per-tier catchment (real km², `_CIV_CATCHMENT_KM2`) × a
  surplus/nucleation fraction × trade concentration, so it **depends on the set map size** and the actual land.
  New pure `_civSettlementPopulation` / `_civCatchmentDensityMean` / `_civAgrarianRegionalTotal`; constants
  `_CIV_SURPLUS_FRACTION` / `_CIV_TRADE_K` / `_CIV_URBAN_SHARE=0.09` / `_CIV_POP_CAP` (per-tier ceilings keep
  the hierarchy on huge maps). Browser-calibrated: at 400/800/2000 km the tiers land in the doc's bands and
  scale strongly with map size (capital ≈5.5k→9.7k→imperial cities 60–140k; villages/hamlets stable).
- **Automatic, not a button.** The regional-population estimate is now a **base calculation** run at the end of
  auto-populate (map-size-dependent), replacing the v0.76 user-triggered "Estimate" button. The Civilization
  panel readout auto-updates: e.g. *"Land sustains ≈ 1.66 M over 191 k km² (agrarian carrying capacity).
  Placed settlements hold ≈ 130 k (7.8% nucleated)."*
- **Foundation for the post-collapse recovery model** (owner: "start it too") committed in the research doc
  (Phase I–IV, ruin-reuse settlement value, labour-shortage caps, surplus-gated growth) — implementation is the
  v0.82+ workstream, resting on these capacity-grounded populations.
- Verify: block-2, render battery ALL IDENTICAL; two new smoke assertions (readout auto-fills on populate with
  no button; capacity-grounded pops all positive). Browser-calibrated across three map sizes.

### v0.80 (2026-07-10)
**Quality-default + persistence fixes, and a mobile header fix** (owner: "apply all fixes and optimisation;
check the UX/UI on mobile"). Three independent changes; headless **909**, smoke **83** (both unchanged).

- **Ocean currents ON by default** (`state.climate.currents` false → **true**). Currents are cheap
  (integrated into the weather sim's SST before `buildWind`) and add real coastal-climate realism —
  warm/wet western-boundary coasts (Gulf Stream), cool/dry eastern-boundary coasts (Benguela→Atacama).
  Browser-verified the flip has effect (rain differs on ~61k cells vs off) and the checkbox reflects the new
  default. Like `carveRivers` in v0.145 this is an intentional default flip: **the default render is no longer
  bit-identical to v0.79** — turning currents off reproduces the prior output. `loadZip` keeps its
  `currents==null ? false` guard, so **pre-v0.80 saves load exactly as saved** (only brand-new worlds get
  currents on). Deliberately did **not** default-on **albedo** (forces the CPU temperature path — a perf
  regression, counter to "optimisation") or **seasons** (heaviest pass + changes annual→seasonal field
  meaning); both stay one-click opt-in.
- **LOD per-tile sculpt-edit persistence** (fixes the analysis gap: un-baked `_lodEdits` were lost on
  save unless baked into the atlas first). New `_lodEditsSyncToState`/`FromState` serialise each edit as the
  **sparse (index,value) cells that differ from the deterministic procedural base** (+ z/col/row/ts); on load
  the field regenerates identically from the seed, so `pyramidTile` reconstructs the same base and the deltas
  re-apply — no bulky Float32 arrays in the ZIP, and **nothing written when there are no edits** (save-format
  unchanged for the common case). Chained onto the already civ/paint-wrapped `exportZip`/`loadZip`;
  try/catch skips any tile that can't reconstruct (edit lost gracefully, never a crash). Browser-verified a
  single-cell edit round-trips exactly.
- **Mobile header fix** (≤860px). The header was ~123px tall and pushed **Export ▾ off-screen (unreachable)**
  on a ~390px phone: the `#undoMem` step-count status wasn't hidden (it wrapped to 5 lines) and the action
  buttons couldn't wrap. Fixed in the mobile media query: `header{flex-wrap:wrap}` so Import/Export/Assets
  wrap to a second reachable row, `header #undoMem{display:none}` (id-scoped, beats the base `.tag` rule),
  and `header h1{white-space:nowrap;font-size:12px}`. Header **123px → 80px**, no clipped buttons, no
  horizontal overflow. The rest of the mobile UX audited sound at true device-width: slide-in sidebar drawer,
  no `aside` overflow (338/338 at 390px), enlarged touch targets, 16px inputs (no iOS zoom-on-focus).

### v0.79 (2026-07-10)
**Deep-zoom oxbow-lake pockets** — closes the last flagged river-morphology deferral (the v0.72 note:
"oxbow cut-off geometry, deferred — needs true centerline curvature tracking"). Engine (script block 1),
opt-in (rides the Burn-rivers toggle, like the rest of `featureDetailPass`), **never in `generate()`/the
default render** ⇒ render battery ALL IDENTICAL to v0.78. Headless **903 → 909** (+6).

- An abandoned meander loop leaves a crescent water pocket *beside* — not in — the active trunk channel.
  True cut-off geometry needs vector centerline-curvature tracking, which isn't available per LOD tile; v0.79
  ships the seam-safe LOD approximation. `featureDetailPass` gains an oxbow term, revealed only at **z≥9**
  (`zo` ramps 0→1 across z9..z10) so **z≤8 output is byte-identical to v0.78** even at absurd depths: a rare
  ridged-noise blob field (`oxbowDepth`/`oxbowFreq`/`oxbowThr`), gated to the floodplain **band** beside
  order≥3 channels (`band=fp·(1−fp)·4` — peaks mid-floodplain, zero at the channel edge and the valley rim),
  carved to a shallow water pocket.
- Seam-safe by construction: a pure function of WORLD coordinates (+seed) reading the same coarse
  order/distance LUT as the valley/tributary passes, so adjacent tiles agree on shared edges (**seam Δ=0**,
  asserted exactly). Carve-only, bounded by the shared sea−0.06 floor; deep ocean is never raised.
- Verify: six headless assertions — z≤8 byte-identical (oxbows gated off at z=8), z9 adds floodplain carving
  beyond the rest of the pass (isolated by toggling `oxbowDepth`), seam Δ=0 at z9, deterministic,
  floor-respecting, deep-ocean-safe. **Browser pass owed** (like v0.71/v0.72 deep-zoom morphology): the
  oxbow pockets at z9–z10 on a real floodplain, and perf of the extra noise sample on 1024² tiles.

### v0.78 (2026-07-10)
**Transport transfer/handling overhead in the journey planner** — the settlement-density §5c deferral (the
"pathfinding for routes" strand). Civ layer (script block 2) only, **engine bit-identical to v0.77** (render
battery ALL IDENTICAL; headless **903** unchanged; journeys are transient, never in the render battery).
Smoke **81 → 83**.

- Wiseman, Ortman & Bulik 2024 [A] show that **transshipments** ("cost points" — every land↔water
  mode-change forces a load/unload) add cost *independent of distance*: ~5% each, **compounding**, so a dozen
  transfers ≈ 80% overhead before any distance cost. A route with many way-transitions should cost more than
  its length implies.
- New pure `_civTransshipments(stages)` (counts land↔water mode-changes) + `_civTransferOverhead(n, per)`
  (`(1+per)^n − 1`, `CIV_TRANSSHIP_COST=0.05` [A]). `_jpPlan` now carries `transshipments`,
  `transferOverhead` (fractional cost), and `handlingDays` (`JP_TRANSSHIP_DAYS=0.5` per transfer) — additive
  fields; the distance-based travel `days` is **unchanged** (a time model isn't conflated with a cost model).
  The journey inspector shows a **Transfers** row ("N transshipments · +X% handling cost · +Y d") only when
  the route actually changes mode. Browser: a 95%-water port-to-port route → 1 transshipment (+5%, +0.5 d);
  multi-leg routes compound.
- Verify: two deterministic Playwright smoke assertions on the pure helpers (mode-change counting 0/1/2/4;
  overhead compounding `1.05^n − 1`, monotone, 0 at n=0). Browser-verified end-to-end on a real
  water-crossing journey.
- **Still deferred (search-blocked this session):** the Mediterranean-scrub residual calibration
  (settlement-density §9 Q5) — `shrub` stays at 0.95 (already reasoned) rather than take an unsourced number;
  it needs a Roman-demography source pass (Scheidel/Frier), which the web search couldn't reach this session.

### v0.77 (2026-07-10)
**Wetlands/marshes carrying capacity** — the settlement-density §2b deferral, and the first density track
that touches the **engine** (script block 1, headless-testable). Two vocabularies never agreed on wetlands:
`buildBiomeRaster` (the 13-entry climate raster fed to `buildCarryingCapacity`) has no wetlands class, while
Wetlands/Marshes lives only in `buildCartBiome`'s 15-entry `CART_BIOMES`, from a moisture+flatness override.
v0.77 exposes that same detector to the K pipeline so a wet, flat, low cell finally carries its own density
story. Opt-in (rides the existing **Biome carrying-capacity** toggle) ⇒ **default field + render bit-identical
to v0.76** (render battery ALL IDENTICAL). Headless **897 → 903** (+6), smoke **79 → 81** (+2).

- New pure `buildWetlandMask()` (+ cached `currentWetlandMask()`) uses the **exact** condition
  `buildCartBiome` uses for its Wetlands class (`M>0.62 && r<0.18 && sn<1.0`, on land) — smoke asserts the
  mask agrees cell-for-cell with `buildCartBiome()===Wetlands`, so the two pipelines share one definition.
- `buildCarryingCapacity(…,opts)` gains `opts.wetMask`: a wetland cell overrides its underlying climate
  biome's residual with `WETLAND_DENSITY_RESIDUAL=0.70` [D] (between grass 0.90 and tropWet 0.55 — productive
  fish/rice/waterfowl land, but malaria/flood friction, rainforest-paradox logic via a different disease
  vector). `estimateRegionalDensityKm2(…,wetMask)` uses `WETLAND_INTENSIFY_ELIGIBLE=0.95` [D] (managed
  wetlands / raised fields / chinampas / rice = the historical water-managed intensification story, ≈ Maya's
  tropWet 0.90 / Nile's desert 1.0) to raise the water-gated ceiling.
- **Bit-identity preserved**: `wetMask` is passed only when the biome-K correction is on (`_biomeK`, default
  off); omitting it, or `biomeK:0`, is byte-identical (headless asserts both). `_wetlandMask` is invalidated
  in lockstep with `_carryCapField` at every field/flow-change cache-clear site.
- Verify: headless calibration — `WETLAND_*` constants in band, wetMask+`biomeK:0` byte-identical, wetland
  residual (0.70) lowers K vs. a tempForest (1.0) cell under `biomeK:1`, wetland intensification raises the
  ceiling in `estimateRegionalDensityKm2`, and no-`wetMask`-arg ≡ null. Browser smoke: mask agreement + the
  residual biting under biomeK.

### v0.76 (2026-07-10)
**Dense village-grid placement mode + regional-population estimate** — the settlement-density §6/§3
deferral. Civ layer (script block 2) only, **engine bit-identical to v0.75** (render battery ALL
IDENTICAL; headless **897** unchanged). Both additions opt-in/read-only ⇒ **auto-populate byte-identical
when off**. Smoke **75 → 79**.

- **Dense village grid** (`_civVillageDensity`, default off). v0.69 landed the `suppressionRadiusCells`
  helper but left it unwired; §6 flagged that `_civIterativeAutoWorld`'s default suppression (~market-town
  ~36 km spacing) places nothing at the true ~10 km village catchment (Vita-Finzi & Higgs 1970). This mode
  (checkbox under Civilization, applied only when the tier-count fields are blank) tightens the seed
  suppression radius to `suppressionRadiusCells(VILLAGE_SPACING_KM, GW, state.mapWidthKm)` and raises the
  cap to `_CIV_VILLAGE_CAP=200` — a ~3–4× denser hamlet/village scatter (browser: 40 → 200 pins on a 1024
  region). Bounded at 200 because §6 notes an unbounded 10 km grid implies ~3,800 pins, which the
  per-settlement editor list can't stay usable at.
- **Regional-population estimate** (`_civRegionalPopulation()` + "Estimate regional population" button).
  The density doc's recommended alternative to placing thousands of hamlets: integrate the persons/km²
  field (`estimateRegionalDensityKm2` via `currentPopulationDensity`, already the **Pop density** layer)
  over all land for a real total, plus per-faction totals over the painted territory raster. Reflects the
  Biome carrying-capacity toggle. Uniform cellKm² (the engine-wide cellKm idiom; world-mode polar
  foreshortening approximated as elsewhere). Read-only — never touches `generate()`/render. Browser: a
  1200 km region modeled ~254k people over ~190k km² (~1.33/km², a plausible low-agrarian average).
- Verify: block-2, four new Playwright smoke assertions — dense mode places strictly more than the default
  and stays ≤ the 200 cap; default-off + checkbox toggle; `_civRegionalPopulation` returns a positive total
  over positive land area; the estimate button fills its readout. Browser-verified (dense grid renders +
  connects without breakage).

### v0.75 (2026-07-10)
**Imperial-seat (metropolis) tier** — the first of the settlement-density research deferrals
(`docs/research/settlement-density.md` §5). Civ layer (script block 2) only, **engine bit-identical to
v0.74** (render battery ALL IDENTICAL; headless **897** unchanged). Opt-in ⇒ **auto-populate output
byte-identical when off**. Smoke **72 → 75**.

- The current five tiers (hamlet…capital) cap out at Early-Bronze-Age urbanism (~100–130 ha ≈ 15,000
  people at 150/ha, validated against the Lawrence et al. 2016 era-ceilings in v0.69). There was no tier
  for genuinely imperial capitals — Nineveh (750 ha), Baghdad/Samarra (≥280,000). v0.75 adds a rare
  **Metropolis ★** class above Capital (`CIV_SETTLEMENT_CLASSES` rank 5; also in `CIV_LOD_PLACE`,
  `tierRankDraw`, `minDeg`, the map-filter list, and the editor kind dropdown).
- **Placement follows the sourced ceiling-breaking rule, not raw population.** Lawrence et al.'s thesis is
  that post-2000 BC growth is driven by administrative/taxation capacity, not local farmland — exactly what
  betweenness centrality (trade-through) and polity size proxy for. New pure `_civSelectMetropolises(places,
  metricByPlace, maxBtwF, opts)` promotes a **capital** that is both a dominant trade hub (normalised
  betweenness ≥ 0.85) *and* the seat of a large polity (its faction holds ≥ 6 settlements). Rare by
  construction: ranked by centrality, ≤ 1 per faction, ≤ 3 total. Metropolis base population 45,000 (≈300 ha,
  territorial-kingdom scale), scaled by the existing centrality/component multipliers — reaching the
  Nineveh/Baghdad register on dominant hubs (browser probe: a whole-world seed placed one at ~133k).
- **Gated** behind a "Imperial-seat tier (metropolis ★)" checkbox under Civilization (`_civMetropolis`,
  default off). Skipped when the user fixes tier counts (explicit quotas hold). Off ⇒ the promotion pass
  never runs ⇒ auto-populate is byte-identical to v0.74. Frozen pack-slot vocabularies untouched (a
  metropolis with no pack sprite falls back to the procedural ★ pin — no save-format surface added).
- Verify: block-2, so covered by three new Playwright smoke assertions — a deterministic synthetic-polity
  test of `_civSelectMetropolises` (promotes the dominant large-polity capital; rejects low-betweenness and
  small-polity capitals; respects the per-faction/global caps), the class definition, and the default-off +
  checkbox-toggle wiring. Browser-verified end-to-end (metropolis placed + rendered on a whole-world seed).

### v0.74 (2026-07-10)
**Finalize control promoted to the top of Generate → World** (owner request: the "Bake ALL levels & finalize
world" button was buried two disclosures deep — inside *Tiles & LOD → Atlas*, both collapsed by default — so
committing a world to the cartographic Atlas phase meant hunting for it). Pure UI markup relocation, **engine
bit-identical to v0.73** (render battery ALL IDENTICAL; headless **897** unchanged). Smoke **71 → 72**.

- A new **Finalize world** section (`#finalizeSec`) is now the **first block** of Generate → World, directly
  under the (hidden-until-finalized) banner and above Geology. It hosts the bake-depth picker and the
  **🔒 Bake ALL levels & finalize world** / **🔓 Un-finalize** buttons — the finalize button is the first
  button you meet in the sub-tab, no longer behind a collapsed accordion.
- The moved elements keep their v0.62 ids (`bakeAllDepthRow` / `bakeAllDepth` / `bakeAllBtn` / `unfinalizeBtn`),
  so all handler wiring and the `applyFinalizedUI()` show/hide/disable logic are unchanged — the relocation is
  DOM-position only.
- Per-view baking stays where it belongs: **Bake visible tiles**, **Clear atlas**, **Export atlas…** and the
  chunk-debug overlay remain under *Tiles & LOD → Atlas*; that section's hint now points up to the promoted
  finalize control. The finalized-world banner, the header phase chip tooltip, and the "generation is locked"
  alert were re-worded to say *"the top of Generate → World"* instead of the old *"Tiles & LOD → Atlas"* path.
- Verify: markup-only, so headless **897** and the A/B render battery (ALL IDENTICAL vs v0.73) are unaffected;
  one new Playwright smoke assertion confirms the bake button is the first `<button>` in `#genWorld`, sits in
  `#finalizeSec`, is not nested in any `<details>`, and that the depth picker travelled with it.

### v0.73 (2026-07-10)
**Economic land/sea routing + settlement-waypoint pathfinding** (owner report: routes ignored a cheaper/more
direct sea leg and bypassed settlements they passed rather than stopping at them). Civ layer (script block 2)
only — **engine bit-identical to v0.72** (render battery ALL IDENTICAL; headless **897** unchanged). Both the
interactive Route tool and the auto-generated network improved (owner chose *both* + *soft-attract, capped
detour*). Smoke **68 → 71**; verified in-browser (routing probe + before/after screenshot).

- **Settlement gravity** (`_civApplySettlementGravity`) — a capped, radius-limited cost discount (centre ×0.5,
  fading to ×1 at ~RW/80 routing cells) around every settlement, applied to the Route-tool grid
  (`_civDijkstraPath`) and both passes of the auto network (`_civHierarchicalNetwork`). A least-cost path now
  bends **through** settlements near its corridor (they become practical stops/stages) instead of bypassing
  them. Soft + capped by construction: only finite (traversable) cells are discounted — gravity never carves a
  water crossing — and the bounded disc means a path bends toward a nearby settlement but never takes a large
  detour for a far one.
- **Economic land-vs-sea** — the Route tool's mixed grid water cost dropped 2.2 → **1.5** (`_CIV_WATER_COST`):
  still above flat land (so land is the default on comparable distance) but low enough that Dijkstra takes a
  water leg when the land route is >~1.5× longer — "if the sea route is more direct, take it". A committed
  route that turns out mostly water is auto-flagged a **sea voyage** (`_civPathWaterFrac` ≥ 0.5) so the planner
  picks a real vessel instead of the land itinerary.
- **Sea-network augmentation** (`_civMstRoutes`) — the port sea-lane MST (a tree) left neighbouring coastal
  towns linked only via a long spine detour; each port now also gets a direct lane to its nearest sea-reachable
  port (when within the MST's own longest hop), so short coastal hops are direct without meshing the map.
- **Passed-settlement stops** (`_civPassedSettlements`) — the ordered settlements a route threads through are
  surfaced in the journey planner as a **Stops** row (origin → intermediate stops → destination), computed live
  from the path (works for loaded routes too; not serialised — derived/transient).
- Verify: `_civApplySettlementGravity`/`_civPathWaterFrac`/`_civPassedSettlements` are block-2 (not in the
  headless engine suite); covered by three new Playwright smoke assertions — a deterministic **injection** test
  (a settlement placed a few cells off a real corridor pulls the path toward it, detour capped), the economic
  sea crossing, and settlement count. Also fixed a pre-existing **flaky** v0.72 smoke assertion (z8-vs-z7 tiles
  compared different extents on an unseeded world → now a deterministic same-extent morphology-on-vs-off check).

### v0.72 (2026-07-10)
**Deep-zoom river morphology — dendritic tributaries + local incision (the river-lod brief's LOD10+ tier).**
Extends v0.71's `featureDetailPass` with the last tractable JS items from `docs/research/river-lod-brief.md`
("LOD10+ … floodplains, meanders, tributaries, local incision"; meanders shipped in v0.71). **Engine
bit-identical to v0.71** (render battery ALL IDENTICAL — the whole pass is opt-in behind the Burn-rivers
toggle and never runs in `generate()`/default render); headless **890 → 897** (7 new assertions); smoke
**67 → 68**.

- **Local incision** (z≥8): the trunk thalweg cuts deeper into its own bed as zoom deepens — a small extra
  deepening (`incisionK` default 0.004) applied where the valley cross-section is strong (`t>0.45`), ramped by
  `zt = clamp((z−7)/3)` (0 at z7 → 1 at z10+).
- **Dendritic tributaries** (z≥8): a ridged value-noise creek network (`ridge = 1−|2·fbm−1|`, thresholded),
  **catchment-gated** to (and only within) a trunk channel's valley influence (`Rt = 2.5 + order`, wider than
  the channel itself) and **land-only** (`v>sea`). The noise is a pure function of WORLD coords (+seed) and the
  catchment gate reads the same coarse Strahler LUT, so adjacent tiles agree along shared edges — **seam Δ=0
  asserted** (including with the z≥7 meander wobble active). Carve-only; the shared sea−0.06 floor clamp bounds
  every cut, so deep ocean is never raised and no cell is over-carved (asserted).
- Strictly gated above the pinned tier: at z≤7 the outputs are byte-identical to v0.71 even when
  `tribDepth`/`incisionK` are forced absurdly high (`zt=0` kills the pass) — asserted, so the z≤7 refine paths
  are provably untouched. New opt knobs (`incisionK`, `tribDepth`, `tribFreq`, `tribThr`, all defaulted) thread
  through `lodTileOpts`.
- Still deferred (documented): oxbow cut-off geometry (needs true centerline curvature tracking, not a scalar
  field carve) and the full Rust/WASM engine port (owner decision: JS-first). With tributaries + local incision
  in, the brief's JS-side render tiers (LOD4→LOD10+) are complete.

### v0.71 (2026-07-10)
**Zoom-dependent feature rendering** (the owner's "features render according to zoom/scale" goal +
`docs/research/river-lod-brief.md` / the render half of `rust-wasm-lod-brief.md`) — three stages in one
version. **Engine bit-identical to v0.70** (render battery ALL IDENTICAL; every new path is opt-in/additive);
headless **864 → 888** (24 new assertions); smoke **65 → 67**.

- **Persistent feature registry** (`buildFeatureRegistry` + cached `currentFeatures`, invalidated with
  `_riverNet`): rivers become objects — Strahler polyline geometry, source/mouth, discharge, hydrology-derived
  width, length-km — plus fjord components (mask ≥0.35, area/strength), canyon components (order≥2 channels
  with ≥0.045 bank relief in a 5×5), and suppressed-maxima peaks. Query API per the brief: `featuresNear`,
  `riversInRect`, `featureSummary`. Exported as `features.json` (features survive baking). "A river is not a
  pixel" — every zoom now has the same persistent objects to render from.
- **GIS-style LOD render caches** (`drawLODView`): the LOD view used to re-run the per-pixel tile renderer for
  every visible tile on every pointermove. Now (a) a per-tile canvas LRU (`_lodTileCanvasCache`, keyed on
  tile + `_lodRenderKey` = fieldGen/paintGen/lodGen/editGen/mode/debug/sea/style) makes pan/zoom a set of
  `drawImage()`s, and (b) the fullscreen coarse overview — the most expensive per-frame render — is reused
  shifted during same-zoom pans and re-rendered exactly on the debounced settle. `_lodEditGen` bumps on every
  tile-edit mutation so caches never serve stale edits. Rendering functions untouched ⇒ identical pixels,
  just computed once.
- **Per-zoom feature morphology** (`featureDetailPass`, threaded through `lodTileOpts` → `pyramidTile` behind
  the existing Burn-rivers toggle): deeper zoom reveals STRUCTURED detail generated from the feature data, not
  amplified noise — river valley cross-sections from z≥4 (parabolic shoulder, width/depth ∝ Strahler order,
  deepening with zoom), fjord wall steepening from z≥3 (shallow shelf under the fjord mask carves toward the
  sea−0.06 floor; land and deep ocean untouched), canyon floor incision from z≥4. Seam-safe (all carves are
  coarse-grid lookups at world coords, the burnChannels idiom — seam Δ=0 asserted); strictly opt-in (no grids
  in opts ⇒ tile byte-identical, so every suite-pinned refine path is unchanged). Caught during testing: the
  first floor-clamp implementation RAISED deep ocean to sea−0.06 — rewritten so the floor only limits carving,
  never lifts terrain (asserted: deep ocean below the floor is never raised or carved).
- Also: a first-cut **meander wobble** at z≥7 — the valley centerline wanders via a deterministic wave that
  is a pure function of world coords (seam Δ=0 asserted), amplitude <1 coarse cell. Deferred from the brief
  (documented): oxbow geometry, micro-tributary synthesis beyond the existing `addZoomDetail`/`tileErode`,
  and the full Rust/WASM engine port (owner decision: JS-first).

### v0.70 (2026-07-10)
**Bug-fix batch (imported heightmaps, sea-level render, plate count) + map-scale locked at creation.**
Engine generation path untouched — **bit-identical to v0.69** (render battery ALL IDENTICAL); headless **864**;
smoke **61 → 65**. All four bugs were reproduced in a real browser (Playwright) before fixing and re-verified.

- **`roadDijkstra` crash on imported worlds (`RangeError: Invalid array length`).** The pathfinder is a lazy
  min-heap but `dist` was **Float32** while priorities/`nd` were **Float64** — on the very uniform cost grid an
  imported heightmap produces (no rivers to break symmetry; costs all ≈1.0003) many Float64 `nd` fall just
  below the Float32 `dist[j]` yet round to the *same* Float32, so `nd<dist[j]` stays true, the distance never
  actually changes, and the cell is re-pushed until the heap array overflows 2³² (measured 50M+ pushes on a
  92 160-cell grid). Fix: a precision-independent `visited` (source-finalization) array — each cell relaxes out
  exactly once ⇒ pushes ≤ 8·V. The shortest-path tree is unchanged, so all road/route output is bit-identical.
  (Auto-populate on an imported world went from crashing after ~127 s to succeeding in ~4 s.)
- **Imported worlds had no rivers/discharge.** `inferTectonics` reconstructed the tectonic substrate but never
  ran `computeFlow`, so `flowField` stayed all-zero — no river network, no discharge, degenerate settlement
  suitability, and the uniform cost grid that tripped the crash above. Fix: `inferTectonics` now ends with
  `refreshClimate(); enforceRiverChannels(); computeFlow(true)` (generate()'s climate → flow(discharge) order),
  so an imported world behaves like a generated one for every downstream layer.
- **~900 Voronoi plates on import.** `pickPlateSeeds` defaulted to `W·H/3000` (≈895 at 2K). Capped at 40
  (matching the procedural Plates slider max) — faster infer, readable plate map.
- **Sea level didn't update the coastline.** The rendered-bitmap cache key (`_civBakeKey`) omitted
  `state.seaLevel`, so dragging the sea slider (which moves `isWater = v<seaLevel`) reused the stale bitmap;
  the shoreline only moved when LOD tiles re-baked on zoom. Fix: `state.seaLevel` added to the key (+ the
  water-body/biome-raster caches cleared on the slider). Same output at a given sea level ⇒ bit-identical.
- **Map scale locked at creation.** Map width is a creation-time decision (set in the setup gate) — rescaling
  it mid-project would silently change every distance, grade, route length and settlement spacing. `#mapw` is
  now disabled in the sidebar (exempt from the finalize-lock's blanket re-enable) with the legend reference-only;
  the km/mi toggle stays (display-only). Zoom/scale-dependent *feature* rendering (fjords/rivers/canyons at
  different zooms) is the separate LOD track, queued next.

### v0.69 (2026-07-07)
**Settlement density — sourced carrying-capacity + regional population** (`docs/research/settlement-density.md`,
a fully-cited audit that replaced invented civ numbers with calibrated ones). All pure/CPU-path additions;
**engine bit-identical to v0.68** (render battery ALL IDENTICAL — the biome term defaults off, the density
field is additive and never runs in `generate()`); headless **852 → 864** (12 calibration assertions);
`tests/perf/smoke_gen1.js` **59 → 61**.

- **Forager floor** — `foragerFloorKm2(nppDryMatter)` (Zhu et al. 2021 regression after Tallavaara 2018 [A]).
  Converts `buildNPP`'s g-dry-matter to the gC basis the regression assumes (×0.45 — load-bearing; omitting it
  is 10× high). Calibrated: NPP 0 → ~0.030/km², 3000 g DM → ~0.58/km² (both asserted headlessly).
- **Biome-residual carrying capacity** — `BIOME_DENSITY_RESIDUAL[13]` (indexed to `BIOME_KEYS`) folded into
  `buildCarryingCapacity` behind `opts.biomeK` (**default 0 ⇒ byte-identical**; asserted). Captures only the
  residual soil/temp/water miss: the rainforest paradox (tropWet 0.55 — pathogen suppression [A]) and
  arid/cold survival friction. An opt-in "Biome carrying-capacity" checkbox (Civilization) flips it and
  re-derives K / suitability / density.
- **Regional population density** — `estimateRegionalDensityKm2` + `BIOME_INTENSIFY_ELIGIBLE[13]` + ceilings
  `RAINFED_CEILING_KM2=45` [B, Low Countries c.1500] / `INTENSIVE_CEILING_KM2=165` [A, Classic Maya lidar].
  Forager floor + a water-gated agrarian ceiling. Anchors reproduced (temperate prime cell ~81/km², Maya
  floodplain ~92/km²; asserted). Surfaced as the new **"Pop density"** debug view (log heat ramp + sourced
  legend) and a `population_density.f32` export entry. Never feeds K (kept a pure [0,1] affordance).
- **Scale-anchored spacing helper** — `suppressionRadiusCells(spacingKm,GW,mapWidthKm)` + `VILLAGE_SPACING_KM=10`
  [A, Vita-Finzi & Higgs] / `MARKET_TOWN_SPACING_KM=25`. Helper only — `_civIterativeAutoWorld` keeps its
  current ~market-town default so auto-populate stays bit-identical; a village-density mode is a v0.70 candidate.
- Source briefs committed to `docs/research/` (settlement-density, river-lod-brief, rust-wasm-lod-brief) for
  the roadmap. Deferred (flagged): metropolis/imperial tier, village-density placement mode, Wetlands/Marshes
  carrying capacity, Mediterranean-scrub calibration.

### v0.68 (2026-07-07)
**Fix: sidebar was live during the setup gate (looked like broken sea/climate/weather).** v0.67's hard
gate modal (`#onboard`) lives inside `.canvas-wrap`, so it only covers the canvas — the sidebar (`aside`,
a sibling) stayed interactive. Before committing a world there is no field, so the Generate→World sliders
(sea level, climate, weather) acted on an empty grid and appeared broken (they worked fine post-commit —
verified: sea 0.42→0.60, equator-temp moved tempField, weather sim moved rainField). Fix: a
`body.setup-gated` class (added in `_setupOpen`, removed in `_setupHide`) applies
`aside{pointer-events:none;opacity:.4}` so the sidebar is visibly locked until a world is committed or a
project/heightmap is loaded. Engine untouched — **bit-identical to v0.67** (render battery ALL IDENTICAL);
headless **852**; smoke **57 → 59** (added: sidebar locked while gated, unlocked after commit). Also
corrected the header chip that read v0.65 in v0.66 (v0.67 already fixed it; noted here for the record).

### v0.67 (2026-07-07)
**Setup gate + scale/height calibration.** The app no longer auto-generates a world on load and then
overlays a once-per-browser card (the `cartalith_onboarded` flag suppressed that card forever after the
first click — why it "didn't load on opening"). Instead a **hard setup gate** blocks the canvas until the
user commits base settings. **Engine bit-identical to v0.66** (render battery ALL IDENTICAL; a default
commit reproduces peakM=4000/width=800; checksums unbroken back to v0.62); headless **852 green** (the
gate is browser-only — see below); `tests/perf/smoke_gen1.js` rewritten to drive the gate, **50 → 57**
assertions.

- **Boot gating.** Browser boot allocates buffers, renders the empty field, and opens the gate — no
  `generate()` until commit. Headless (no `indexedDB` — the stub harness) keeps the old
  `withBusy('generating…',generate)` path verbatim, so the 852-suite environment and FNV bit-identity are
  byte-unchanged. `generate()` stays the sole generation path either way.
- **Setup gate** (`_setupOpen(mode)`, three modes over the old `#onboard` modal): **intro** (Generate /
  Load project / Import — no Skip, mandatory); **generate** (working resolution, map extent,
  center-landmasses, scale & calibration with a km/mi toggle + distance legend, peak altitude, then
  **Generate/Commit**); **calibrate** (shown after a heightmap loads — scale + peak, then **Commit** which
  auto-runs the existing `inferTectonics()` so climate/biomes/lithology/resources get a substrate). Forms
  share one canonical working object (km + m); commit mirrors the sidebar segs + `syncUI()` then runs
  `generate()` once (center-landmasses runs right after, awaited).
- **Units** (`_units` km|mi, localStorage pref — not serialized, invariant 6). Display-only conversions
  (km↔mi, m↔ft) on the setup forms, the scale bar, and a new sidebar **Scale & calibration** parity block
  (units toggle + legend). Canonical storage stays km + metres ⇒ default 'km' is byte-identical.
- **Peak auto-suggest** `suggestPeakM(w)=round(8849·(1−e^(−w/1330)))` — real max relief grows sub-linearly
  and saturates near Everest, so a 100 km region tops ~640 m while a whole planet caps at ~8 849 m (not
  40 000× taller). Passes through 800 km → 4000 m (default preserved). Fills the peak field as width
  changes; user override sticks.
- **Scale-aware 3D** (`_v3dEffExag()`): the drape's vertical exaggeration is now
  `view3d.exag · (reliefRatio / RATIO0)` where `reliefRatio = metresPerUnit / mapWidthMetres` and RATIO0 is
  the default's ratio — so the default look is bit-identical, whole-world maps auto-flatten (~20× less
  spiky) and small maps show a touch more relief. Used for both the shader uniform and 3D label anchoring.
  2D render (separate `state.exag`) untouched.
- Fixes: the header version chip read **v0.65** in v0.66 (missed bump) — corrected to v0.67 here.
- Browser pass owed: the scale-aware 3D feel region↔whole-world, the live units toggle, and the
  import→calibrate→infer flow with a real DEM file.

### v0.66 (2026-07-06)
**IA correction — the Generate branch menu is restored.** v0.64's Stage-2 re-homing (retiring the
Generate sub-tab bar and moving Civilization + Cartography into Explore) followed the research
proposal's §3 but contradicted the owner's intended information architecture ("Under Generate -
Civilization: …", "Explore - Timeline"); the owner flagged the loss of the startup menu and
directed the correction. **Engine bit-identical to v0.65** (render battery ALL IDENTICAL,
checksums unbroken back through v0.62); headless **852 green**; `tests/perf/smoke_gen1.js`
rewritten for the corrected IA, **41 → 50** assertions, all green.
`docs/research/ui-ux-upgrade.md` §Status now carries a prominent correction note superseding §3's
re-homing so future sessions don't re-apply it.

- **Generate = authoring, three categorical branches.** `#genSubBar` (World | Civilization |
  Cartography) is back at the top of the Generate panel; `#genCiv` (Tools, Peoples/Factions,
  Settlements, Polity, Infrastructure) and `#genCarto` (Tools, Region names, Manual icons, Paint
  brush, Map view, Map style) re-wrap the sections that v0.64 had moved into Explore — pure DOM
  moves, every element id unchanged, so all handler/syncUI wiring held without edits. The restored
  gsub handler toggles the three sub-panels, resets the tool to Inspect (which since v0.64 also
  commits in-progress ways/routes and disarms label/icon/paint), and explicitly disarms the Paint
  brush when leaving Cartography (paint arms without changing `_civTool`, so the tool reset alone
  can be skipped by its equality guard — the one non-obvious bit).
- **Explore = planning/reading.** The Explore panel returns to its v0.63 shape plus the unified
  tooling: an Info · Route palette (entering Explore auto-arms Info — Inspect is an authoring tool
  and lives in the Generate branches), ✓ Commit route, the Info readout, Journeys and the Journey
  planner; the filter funnel + twinned timeline stay on the canvas.
- **Tool palette split per branch, one state machine.** Civ: Inspect·Settlement·POI·Territory·Way;
  Carto: Inspect·Label·Icon; Explore: Info·Route. All buttons keep `[data-civtool]`, so the
  existing auto-wiring and `_civSetTool`'s all-buttons highlight sweep handle the duplicate
  Inspect buttons for free; mutual exclusion holds across branches and tabs. The tab handler now
  arms `info` on entering Explore / `inspect` on entering Generate, with an equality guard because
  `_civSetTool` treats a repeated same-tool call as toggle-off (a double tab-click would have
  flipped Info→Inspect).
- **Pinned Selection inspector re-homed** under the sub-tab bar, shared by the Civilization and
  Cartography branches (hidden on World — and, sitting outside `#genWorld`, exempt from the
  finalize lock by construction). The viewport right-click "✎ Edit" now first reveals the owning
  branch via `_civRevealBranch('civ')` — clicking the real tab/sub-tab buttons so every side
  effect runs — then selects, since editing must land somewhere visible from any tab.
- **Paint brush re-gated to Generate → Cartography** (`_activeTab==='generate' && _genSubTab==='carto'`),
  matching where its arming checkbox lives (was gated on the Explore tab in v0.64/v0.65).
- **Fixes bundled:** the finalize lock's blanket disable had locked the **Un-finalize button
  itself** since v0.62 (`#unfinalizeBtn` is inside `#genWorld`) — now exempted alongside
  `#genV3dSec`; the active phase sub-tab label was invisible (v0.64's generic `button.on` accent
  fill painted amber-on-amber — `.subtab.on` now forces `background:transparent`); three stale
  "Edit → Tiles & LOD" path strings updated to "Generate → World → Tiles & LOD"; the stale
  "Places & roads (Edit tab)" sentence dropped from the Infrastructure hint.
- Browser pass owed: the restored branch flow end-to-end (sub-tab switching mid-draw, paint
  disarm feel, ctx-menu branch reveal), plus the passes already listed under v0.65.

### v0.65 (2026-07-06)
UI/UX overhaul — closes out the scope cuts v0.64 made deliberately ("lite" inspector, no
Assets/Export header move). **Engine bit-identical to v0.64** (FIELD/TEMP/RAIN/FLOW FNV checksums
byte-equal at seed 12345/256px, unbroken back through v0.62); headless suite **852 green**
(UI-only batch); `tests/perf/smoke_gen1.js` grew **27 → 41** assertions, all green.
`docs/research/ui-ux-upgrade.md` §Status now shows every stage genuinely complete.

- **§4.7 — the pinned inspector now hosts the FULL edit form.** `_civRenderSettlementList`/
  `_civRenderPoiList`/`_civRenderLabelList` no longer build a per-row `editHost` div; they only
  render the row + selection highlight and, if the row is selected, hand its `{nameSpan,popSpan}`
  to a new module-level `_civSelectedRowRefs`. `_civRenderInspector` (in `#inspectorBody`) reads
  `_civSelectedPlace`/`_civSelectedLabel`/`_iconSelected` and calls the SAME `_civPopulatePlaceEditor`/
  `_civPopulateLabelEditor`/`_carPopulateIconEditor` functions the inline editors used to call —
  pointed at the one stable inspector host instead of a per-row div — so the live-row-summary-patch
  optimization survives the move (no full list rebuild per keystroke). Extended to a **third**
  selection group: the Placed-Icons list's per-instance editor (`_iconSelected`) now also lives in
  the inspector, with `_civRenderPlaceEditor`/`_civRenderLabelEditor`/`_carRenderIconEditor` each
  enforcing that selecting their own kind clears the other two — single selection across all three
  groups. Caught mid-refactor: the label list's delete button only called `_civRenderLabelList()`,
  never the full `_civRenderLabelEditor()` refresh, so deleting the selected label used to leave a
  stale editor on screen — fixed as part of the same pass. Every "expand its editor directly
  underneath" hint string (3 sections) updated to point at the pinned Selection panel.
- **§4.10 — per-layer hotkeys.** `LAYER_HOTKEYS` maps 7 of the most-reached-for Layers-popover
  views to bare-key shortcuts (`0`=Off, `B`=Biomes, `T`=Terrain, `F`=Flow, `S`=Settlement,
  `W`=Wildlife, `R`=Resources) — deliberately scoped to the curated Explore subset rather than all
  29 debug views, since forcing collision-free mnemonics onto rarely-used diagnostics (Flow vs
  Flood both wanting "F") wasn't worth the awkward picks. Badge shown per item in the popover;
  global `keydown` listener guarded against typing focus and modifier keys, active whenever the
  Layers FAB itself is reachable (Generate/Explore), mirroring the existing Shift+D resource-overlay
  shortcut's reach.
- **Assets/Export promoted to header-level utilities** — the tab bar is now a genuine
  **two-position phase switch** (Generate ⇄ Explore only), matching §3's Forge/Atlas description
  directly instead of mixing phases with utilities. Export moved into a header dropdown
  (`#exportWrap`/`#exportMenu`, same ids as the old sidebar panel so `exportZip()`'s wiring is
  untouched) that — unlike Import ▾'s one-shot action list — stays open across internal clicks
  (it's a form: image size + 3 checkboxes), closing on outside-click, Escape, or pressing Export
  itself. Assets became a plain header button (`_carEnterAssetsMode`) that directly performs the
  same full-viewport Asset-Library takeover the old `tp==='assets'` tab branch did; exiting needed
  no new code at all — the existing tab-click handler's canvas-wrap/assetLibrary swap already
  recomputed `on=(tp==='assets')` on every Generate/Explore click, which is now permanently false,
  so clicking either phase tab unconditionally restores the canvas. Verified `_activeTab` is never
  compared against `'assets'`/`'export'` anywhere else in the file before making this change.

Browser pass owed: the relocated inspector's feel end-to-end (especially the icon-instance
editor sharing the panel), the hotkeys in daily use, and the header Export/Assets controls.

### v0.64 (2026-07-06)
UI/UX overhaul completed — implements every remaining stage of `docs/research/ui-ux-upgrade.md`
that v0.63 deferred as "higher-risk IA surgery". **Engine bit-identical to v0.63** (FIELD/TEMP/
RAIN/FLOW FNV checksums byte-equal at seed 12345/256px, unbroken back through v0.62); headless
suite **852 green** (unchanged — this batch is UI-only, no new engine assertions); the Playwright
UI-smoke harness (`tests/perf/smoke_gen1.js`) grew **12 → 27** assertions, all green.

- **Stage 2 — full information-architecture re-homing.** The Edit tab is retired: its "Tiles &
  LOD" section moved into Generate → World (new cat-acc, same ids); "Undo" moved into the header
  (§4.8, below); "Places & roads (terrain)" — `#placeChk`/`#roadsBtn`/`#clearRoadsBtn`/
  `#clearPlacesBtn` — is retired outright per the proposal ("keep the engine functions, remove
  the duplicate UI"). This closes a real landmine: that section's `state.places` array was
  **shared** with Civilization's settlements/POIs (kind-less entries render as small dots,
  `_civDropPlace`/`_civDropPOI` entries always carry a `kind`), so its silent, unconfirmed "Clear
  places" could wipe user-placed settlements as a side effect. The Generate sub-tab bar
  (World/Civilization/Cartography) is also retired — Generate is World-only now — and
  Civilization + Cartography move wholesale into Explore (all ids/content unchanged, pure
  container move). Consequential fixes threaded through the tab-switch handler: the
  freehand-sculpt cancel-on-leave now keys off `_activeTab!=='generate'` (was the retired Edit
  tab); the Cartography paint-brush pointer gate keys off `_activeTab==='explore'` (was the
  retired `_genSubTab==='carto'`, which would otherwise have permanently blocked painting — no
  code path sets `_genSubTab` away from `'world'` anymore); `_gpuApplyTabOverride`'s GPU-suspend
  heuristic changed from "which sub-tab is open" to "is the paint/icon tool actually armed"
  (`_paintMode||_iconPlaceMode`) — arguably tighter than before, since GPU now stays available
  while a user is just managing settlements in Explore.
- **§4.5 — unified tool palette.** One 9-button `.seg` at the top of Explore — Inspect, Info,
  Settlement, POI, Label, Icon, Territory, Way, Route — replaces the formerly-scattered
  originals (Settlements' `#civToolSeg`, Polity's "Paint territory", Infrastructure's "Draw way",
  the old Explore Tools row's Route/Info). Every button reuses the existing `[data-civtool]`
  auto-wiring (`document.querySelectorAll('[data-civtool]').forEach(...)`), so adding Label/Icon
  required no new click-wiring — only `_civSetTool`'s body grew to fold them in. Label and Icon
  were previously a **separate, not-fully-exclusive** checkbox/gallery system
  (`_labelMode`/`_iconPlaceMode`/`_carIconArmed` via `_carDisarmOtherTools`) that never disarmed,
  or got disarmed by, the `_civTool` system — picking "Route" while "Add labels" was checked
  left both active. `_civSetTool` now also disarms Paint (Cartography's separate brush) on any
  civtool pick, and arming Paint disarms `_civTool` in turn (careful ordering: the paint checkbox
  handler must call `_civSetTool('inspect')` *before* setting `_paintMode=true`, since
  `_civSetTool` unconditionally disarms paint — reversed order was a self-defeating loop caught
  by the browser smoke test). Icon's family-picker + gallery become the tool's **contextual
  options** (`#carIconContextSec`, Dungeondraft/Wonderdraft pattern) — hidden until Icon is the
  active tool, with an idle hint shown otherwise. `_carDisarmOtherTools` simplified to just
  icon/paint (place and label no longer need branches there).
- **§4.7 — pinned selection inspector (scoped "lite").** A `#inspector` card pinned atop Explore
  (`_civRenderInspector`, hooked into the existing `_civRenderPlaceEditor`/`_civRenderLabelEditor`
  refresh points) shows a live name/type/population summary of the selected settlement, POI or
  label. The full edit form (name/history/population/traits) deliberately stays inline in the
  settlement/POI/label lists — v0.62's expand-in-place design — rather than being relocated here;
  that's a separate, larger refactor of `_civRenderSettlementList`/`_civRenderPoiList`/
  `_civRenderLabelList`, deferred (see the proposal's updated §Status).
- **§4.8 — header undo + danger accents.** `#undoBtn`/`#undoMem` moved from the retired Edit tab
  into the header, always visible, same ids so `pushUndo()`/`undoLast()`/`updateUndoUI()` wiring
  is untouched. The existing `.al-danger` class (previously Asset-Library-only) is now applied
  consistently to 8 one-click destructive Clear buttons; the three the proposal named by name
  (Clear territory / Clear ways & journeys / Clear places) additionally gained a
  confirm-when-non-empty guard — **none had any confirmation before**, unlike `#reseedBtn`'s
  existing `confirmRegenerate()`. Skipped when the corresponding data is already empty, so a
  fresh map's Clear buttons stay instant.
- Not in scope (documented in the proposal's §Status): promoting Assets/Export to header-level
  utilities (separable from the phase-journey confusion this pass targeted); further reduction
  of the Layers popover's 29 debug views (grouping already shipped in v0.63).

Browser pass owed: the whole reorganized Explore flow end-to-end, the tool palette's feel in
practice (especially Icon's contextual gallery and Way/Route's always-visible commit rows), the
pinned inspector, and Undo/Tiles & LOD in their new locations.

### v0.63 (2026-07-06)
UI/UX upgrade — implements the shippable, engine-safe stages of `docs/research/ui-ux-upgrade.md`.
**Engine bit-identical to v0.62 at defaults** (FIELD/TEMP/RAIN/FLOW FNV checksums byte-equal at
seed 12345/256px); every change is DOM/CSS/handler chrome over existing `state`/`state.viz` keys —
no engine or renderer touch. Headless suite **852 green** (848 + 4 preset assertions); a new
Playwright UI smoke harness (`tests/perf/smoke_gen1.js`) proves the chrome in a real browser
(12/12). Shipped:
- **§4.4 Map-style presets** — a preset `.seg` (Default · Antique · Ink · Watercolor · Print) at the
  top of Map style; each preset is an *absolute* bundle of `state.viz` writes (managed render keys
  reset to 0/false, then overrides applied), so **Default reproduces the base look bit-identically**.
  Editing any Map-style control flips the row to "Custom". Headless-asserted pure + key-scoped.
- **§4.3 Progressive disclosure** — the ~29-control Map style folds into two `<details class="adv">`
  accordions (Rendering / Painter NPR) under the preset row; Tectonics' physical-coupling dials
  (flexure/heterogeneity/resistance) likewise fold into Advanced. Collapsed by default; defaults
  unchanged.
- **§4.2 Layers popover** — the 30-button `#debugSeg` picker is re-housed into a canvas FAB popover
  (◇, top-left) with a **grouped, full-name** radio list (Base/Climate/Tectonics/Hydrology/Surface/
  Civilization), a 3-item most-recently-used pin row, and an opacity slider. It's a pure re-housing:
  the popover is *built from* the (now hidden) `#debugSeg` buttons and proxies clicks to them, so
  every existing `seg('debugSeg',…)` handler + `syncUI()` reflection is reused. In the finalized
  (Atlas) phase it shows only a curated user-facing subset.
- **§3 phase signal** — building on v0.62's `state.finalized`: finalizing now also tints the shell
  chrome (Unity play-mode convention) and shows a header "✓ Atlas — world finalized" chip, so the
  frozen-simulation state is unmissable. `applyFinalizedUI` drives it; no new serialized field.
- **§4.9 onboarding** — a first-run empty-state card (Generate / Load / Import + a Forge▸Finalize▸
  Atlas diagram), dismissed forever via a `localStorage` flag. Never shown headlessly.
- **§4.10 small fixes** — corrected the stale Export hint ("Explore → Atlas tab" → "Edit tab"),
  widened the sidebar to 360px at ≥1440px viewports (canvas stays first).

**Deferred to a follow-up** (higher-risk IA surgery, better isolated): Stage 2 full information-
architecture re-homing (retire the Edit tab, move Civilization/Cartography under an Explore phase,
Tiles+Undo under Generate), §4.5 the merged tool-first Explore palette, and §4.7 the pinned
selection inspector. These touch large amounts of cross-block civ wiring and want their own pass;
tracked in `docs/research/ui-ux-upgrade.md` §Status. Browser pass owed: preset aesthetics, Layers
popover feel on touch, onboarding copy.

### v0.62 (2026-07-06)
Civilization-layer UX batch + the finalize milestone (user request). **Engine bit-identical to
v0.61 at defaults** (FIELD/TEMP/RAIN/FLOW FNV checksums byte-equal at seed 12345/256px; suite
848/848 green). (1) **Polity section**: the Generate → Civilization *Economy* and *Politics*
sections merged into one **Polity** section (territory painting + politics timeline together;
every element id unchanged), and the faction picker now includes an **∅ Unclaimed** pill (index
0) — paint with it to erase territory. (2) **Timeline slider fixed + twinned**: `civAddYear` no
longer conjures a phantom "0 AD" era when the timeline is empty (the live state is captured
under the year actually being added); a new **year slider in Polity** (`#civTlSlider`) mirrors
the Explore → Timeline slider through shared `_civWireYearSlider` wiring, and a `_civTlDragSrc`
guard stops the mid-drag rebuild from resetting the thumb (the broken-drag bug — every `oninput`
rebuilt the slider's own value/max). (3) **Settlement/POI editing**: places gain a persistent
free-text **History** field (settlements *and* POIs, saved via `state.places`); POIs get their
own **"All POIs" collapsible list** (`#civPoiList`, the settlement list's twin with the same
expand-in-place editor); and a **right-click context menu** on the viewport (edit/move-to/delete
nearest place, drop settlement/POI at the cursor, info readout) — right button now belongs
exclusively to the menu (`e.button` guards on the sculpt/civ handlers). (4) **Bake ALL levels &
finalize**: `bakeAllTiles(maxZ)` bakes the entire LOD pyramid 0..depth (depth select 2–5, 21–1365
tiles, skip-if-baked so re-runs fill gaps) into the IndexedDB atlas, then **finalizes the world**
— `state.finalized` (persisted; legacy saves merge false) locks every Generate → World control
(3D-view dials exempt), banners the panel, and guards `generate()` / `confirmRegenerate()` /
`_manualTerrainActive()` so nothing regenerates under the baked atlas; the app drops into the
tiled-LOD view and behaves as a cartographic viewer/editor (settlements/labels/icons/territory/
routes/timeline stay live). Un-finalize reverses the lock. Headless-proven: finalized
`generate()` leaves the field byte-identical; un-finalize regenerates. Also shipped:
`docs/research/ui-ux-upgrade.md` — the researched UI/UX upgrade proposal (phase-based IA,
layers popover, progressive disclosure, inspector/context-menu patterns; staged rollout).
Browser pass owed: Polity section flow, both timeline sliders + drag feel, POI list + history
editor, context menu, the full bake + finalize→viewer flow.

### v0.61 (2026-07-06)
Restores the v0.135 sync-`generate()` contract that v0.6 broke. v0.6 extracted the tectonic
prefix of `generate()` into `async buildTectonicSubstrate()` (a good refactor — `loadZip` replays
it to reconstruct the tectonic substrate from the saved seed at zero file cost) but made
`generate()` `await` it unconditionally, so every call yielded to the microtask queue even when
no worker pool was engaged. Unawaited callers — the headless suite, per the documented invariant
"when no pool is engaged NO `await` is reached" — read half-generated state (flat `rainField`,
empty biomes): 32 suite failures plus a hard crash that aborted ~200 further assertions.
`buildTectonicSubstrate` is now a regular function returning `false` synchronously on the
no-pool path (or a Promise resolving to `true` on the pool path); `generate()` awaits only a
Promise. Proven: suite back to **848/848 green**, FIELD/TEMP/RAIN/FLOW FNV checksums
byte-identical to v0.6-awaited at seed 12345/256px, and the unawaited-`generate()` probe shows
rain fully computed synchronously again. Also in this release batch (repo, not the HTML file):
the settlement-seed test no longer crashes the suite when seeds are empty; `tests/run.sh`
defaults to the newest `Cartalith Gen1 v*.html`; dead merge tooling moved to `legacy/`;
docs rewritten for this repository.

### v0.6
Adds the 3D drape view (`_view3dOn`, orbit/pinch camera, `view3d` viz params), the
`buildTectonicSubstrate()` extraction consumed by `loadZip` for exact tectonic-substrate replay
from the saved seed, a `renderNow(rect)` terrain-brush region fast path, paint-generation cache
invalidation (`_paintGen`), and volcanic/impact field persistence in project saves. Introduced
the sync-contract regression fixed in v0.61.

### v0.57
First Gen1 version in this repository; the merged single file (generator engine + civ/politics
layer + asset library) as hand-evolved from the `build_gen1.py` true-merge output.
Passes the full headless suite (848 assertions) clean.

---

## Pre-merge `elevation_foundation` lineage

Since v0.144 (three user-reported fixes): **(1) structured-orogeny steep/sudden angles** — diagnosed headlessly (graph-on raised the heightmap |2nd-difference| "kink" metric ≈6× over graph-off; `orogenyField` peaked at |U|≈1.25 with ~15k sharp-kink cells). Cause: the per-type Gaussian profiles are smooth individually but the **`|max|` margin combine + crest-wiggle + narrow Gaussians** leave creases. Fix: **`smoothOrogeny(U,W,H,blurR,wrap)`** — a light separable box blur (radius `≈blurR·0.16`≈3) applied to the **finished** orogeny field in `generate()` + the Orog preview (the raw `buildOrogenyField` kernel + its acceptance tests are untouched, so it's test-safe). Cuts the graph-on field kink metric **2.10e-2→4.75e-3** (−77%, back near the 3.39e-3 graph-off baseline) for ~3% peak loss. Graph off (default) ⇒ orogenyField null ⇒ skipped ⇒ **bit-identical to v0.143**; graph-on output changes by design. **(2) Import-once bug** — the heightmap file input (`#file`) was the only importer missing `e.target.value=''` after load, so re-selecting never fired `change`; added it (now matches `#zipFile`/`#packFile`). Plus a **Generate/New-seed confirm guard**: a module `_imported` flag (set in `loadImage`/`loadZip`, cleared by `generate()`) makes the destructive **Generate world / New seed** buttons `confirm()` before discarding an imported/edited map (`confirmRegenerate()`; fresh procedural worlds need no prompt). **(3) Touch sliders** — on touch screens a long-press raised the native selection/callout ("share") menu that swallowed the drag; added `touch-action:none; -webkit-user-select:none; user-select:none; -webkit-touch-callout:none` to `.row input[type=range]` (+ callout/user-select on `.row`/`.val`). UI/CSS-only ⇒ generate/render unaffected. **Default (graph off) bit-identical to v0.143** (FIELD/TEMP/RAIN/RENDER cmp-clean at seed 12345/256px). 821 assertions green (+3 smoothOrogeny: reduces-kink/preserves-peak/deterministic). Browser pass owed: the gentler orogeny relief, re-import + the Generate confirm, and slider responsiveness on a touch device.

Since v0.143 (`docs/research/wildlife-layer.md`, user request — a per-**ecoregion** wildlife layer): **ecological fauna determination from terrain + biome.** Pure primitives (amplifyRegion mold): **`buildNPP`** (Miami model — `min(NPP_T,NPP_P)` from `tempField`+`rainField·maxRainMm`, 0 over ocean), **`buildTRI`** (Riley 1999 terrain ruggedness), **`buildEcoregions`** (connected components of `buildCartBiome` — 4-neighbour, x-wrap in world mode — dropping regions below `minArea`, returning a contiguous `regionId` raster + per-region aggregates: area, mean NPP/TRI/water/K, latitude, ridge/valley fractions via TPI, coastal flag, x-wrap-aware centroid), **`regionRichness`** (`S = c·Aᶻ·E^0.7·(1+kH·TRIn)·latF` — species-area MacArthur&Wilson + energy Wright + heterogeneity Stein + latitude Rosenzweig; z=0.15 flat / 0.25 rugged), **`assignWildlife`** (Lindeman 10% trophic cascade `herb→pred 0.01·plant→scav` + Kleiber `70·M^0.75` per-capita demand → per-species **population estimates**; predators dropped without a herbivore base; ridge/coastal-gated species). **Earth-analogue species rosters** (`WILD_ROSTERS`, frozen-ish, keyed by the 15 Cartalith biomes; each entry `[name,guild,massKg,gate?]`) + 14 functional `WILD_GUILDS`. Surfaced exactly like the v0.110 settlement layer: a **Wildlife debug view** (ecoregions tan→green by richness over hillshade + clickable centroid markers), a `#wildInfo` popup (`showWildInfo`, the `#settleInfo` twin) with the region's NPP/ruggedness/guild+species/population breakdown, and a **`wildlife_regions.json`** export (`kind:'cartalith-wildlife'`). Caches `_wildlife`/`_nppField`/`_triField` cleared alongside `_settleSuitField`; built lazily only when the view is open / export runs ⇒ **generate() + default render bit-identical to v0.142** (FIELD/TEMP/RAIN/RENDER cmp-clean at seed 12345/256px; 70 ecoregions on a default region world). 818 assertions green (+14: NPP Miami/ocean-zero/warm-wet>cold-dry/determinism, TRI non-negative/determinism, ecoregion id-range/biome-match/minArea, richness range, guild+population sanity, ridge-gating, orchestrator determinism). Browser pass owed: the Wildlife view colours, marker click → popup, exported JSON in a consumer.

Since v0.142 (user report — "mountains don't render with a smooth slope"; deliberate render change): **smoother mountain-slope texture grain.** Diagnosis (headless transect + per-channel jitter probe): the heightmap geometry is smooth (Δ≈0.008/cell, tiny 2nd-differences) and the multi-scale hillshade is smooth too (Δ≈0.004); the roughness came entirely from the **high-frequency colour-texture noise `nHi = vnoise(x*0.45,…,23)`** — a near-Nyquist ~2-cell *white noise* (mean |Δ|≈0.14/cell) that drives the material **palette-ramp position `t`** (weight 0.5) and the micro-hillshade, so mountain slopes (worst on rock, whose ramp is high-contrast) read as grainy/non-smooth. It was also **resolution-dependent** (per-cell frequency → grain gets finer at 2K/4K, the same class of bug as the v0.068 sea grain). Fix: all three `nHi` call sites (`surfaceColor` screen, `renderBiomeTileRGBA` tile in world coords, `bakePixel`) changed `vnoise(·*0.45,·,23)` → **`vnoise(·*96/GW,·,23)`** — map-relative (resolution-independent, constant at any resolution) and lower frequency (~5-cell coherent grain instead of ~2-cell white noise), cutting the palette-ramp grain ~3× (flank mean |Δlum|/cell 5.42→3.54 at 512) while keeping texture character. `nLow`/`bioJitter` untouched. **FIELD/TEMP/RAIN bit-identical to v0.141** (generate never calls these render fns; checksums byte-equal at seed 12345/256px), default RENDER changes by design (`4016246093→4233712952`). 804 assertions green. The smoothing strength is one tunable constant (96/GW; lower = smoother) — needs a browser eyeball to confirm the look.

Since v0.141 (user request — remove the Blueprint style): the **Blueprint (cyanotype) Painter NPR style is deleted** — the Style-tab slider row + hint clause, the `landColorCore` render block (v0.131 `bpK`), the `state.viz.blueprint` default, the `loadZip` merge default (now `delete state.viz.blueprint` strips the stale key from legacy saves), and the `blueprintR` bind handler. The other ten Painter styles (contours/ink/hachure/watercolor/cel/crosshatch/stipple/sepia/risograph/pointillism) are untouched. Blueprint was default-0 (off) so removal is a **no-op at defaults ⇒ bit-identical to v0.140** (FIELD/TEMP/RAIN/RENDER cmp-clean at seed 12345/256px). 804 assertions green (−3: the blueprint-specific NPR tests removed).

Since v0.140 (`docs/research/natural-rivers.md` R3b — natural-rivers follow-up, deliberate render change): **D∞-informed river receivers.** `buildRiverNetwork`'s receiver selection was pure D8 steepest-descent (the 45°/90° staircase the user reported). It now routes toward the **continuous downslope aspect** (Tarboton 1997): among strictly-downhill neighbours it picks the one best aligned with the gradient aspect (`atan2(−gy,−gx)`), facet weight `(0.5+0.5·cos Δθ)·drop`, with a steepest-descent fallback for degenerate aspect. The network stays a **single-receiver tree** (required for Strahler order + polyline tracing) — a single-receiver projection of D∞; chains stay strictly descending ⇒ no cycles (asserted). **`flowField`/accumulation are untouched** (the heavier change the doc defers — so erosion coupling is unaffected). Because `recv`→`order`→`intensity` feeds the default biome river overlay, this **deliberately changes the default RENDER** (like v0.111): **FIELD/TEMP/RAIN bit-identical to v0.139** (generate never calls `buildRiverNetwork`; checksums byte-equal at seed 12345/256px), RENDER hash shifts by design (`1362460047→4016246093`). 807 assertions green (+2: receiver tree strictly descending, routing deterministic). River-overlay/Strahler aesthetics need a browser pass.

Since v0.139 (`docs/research/natural-rivers.md` R5 + biome-overlay min-order — natural-rivers follow-ups, default-safe): two render-only river tweaks, both **bit-identical to v0.138 at defaults** (FIELD/TEMP/RAIN/RENDER cmp-clean at seed 12345/256px). (1) **R5 Flow-view log-floor**: the Flow debug view faded `a=log(1+flow)/logMax` so sub-channel trickles still showed; now a log-floor at the channel-initiation area (`flowFloor=log(1+GW·GH·0.0004)/logMax`) remaps `a→(a−floor)/(1−floor)` so trickles fade out and the Flow web matches the Strahler channel set. Debug-view-only (default `debug='off'` ⇒ untouched). (2) **Biome-overlay min stream order**: `buildRiverNetwork` now also returns **`omax`** (the Strahler order of the widest contributing channel cell, stamped per disc cell alongside `intensity`/`depth` — existing fields unchanged ⇒ default bit-identical), and the biome map's river overlay honours the existing **Min stream order** slider via `omax[i]≥k` (default `k=1` ⇒ `omax` never consulted ⇒ bit-identical). 807 assertions green (+3: `omax` present, nonzero⇔intensity>0 & bounded by max order, min-order filter thins monotonically). Note: the "LOD cluster" follow-ups (lakes in LOD tiles, SDF river/biome in tiles, bake-back of LOD edits) were found **already shipped** in v0.103/0.097/0.134 — only cross-tile seam editing (browser-only) remains open.

Since v0.138 (user request — "combine CBiome and Biome, then set everything ready for the merge"; bridge-prep only, host file stays the elevation foundation): **unified biome view + Cartalith-loadable paint-grid export.** (1) **Biome views combined**: the climate-only **bclass** ("Biomes") and the Cartalith-palette **cbiome** ("CBiome") debug views are merged into a single **"Biomes"** view (`dbg==='bclass'`, cbiome button/branch/legend deleted) that renders **`buildCartBiome()` on the 15-entry `CART_BIOMES` palette** — the merge target (climate classification + elevation overrides + lake/ocean), so the canonical biome representation is now the editor's paint grid. (2) **Merge bridge**: `encodeBiomeRLE`/`decodeBiomeRLE` are **ported verbatim from `Cartalith_V1.914`** (the 3-byte `value,lo,hi` run codec, >65535 split), and `exportZip` now emits **`biome_baked.bin`** = `encodeBiomeRLE(buildCartBiome())`, **`terrain_baked.bin`** = `encodeBiomeRLE(buildCartTerrain())`, and **`cartalith_grid.json`** (`cartalithGridManifest`: kind/encoding/`widthCells=GW`/`heightCells=GH`/cellSize/mapWidthKm + the frozen `CART_BIOMES`/`CART_TERRAINS` index vocabularies) — directly loadable through Cartalith's `decodeBiomeRLE` into a row-major `grid.data` (0 = unpainted, 1-based index). Both `buildCart*` grids stay debug-derived (never auto-run in `generate()`); the existing `biome_raster.bin` (tool's own 0=ocean/1–13 indexing) is unchanged as the affordance master. **Bit-identical to v0.137** (FIELD/TEMP/RAIN/RENDER cmp-clean at seed 12345/256px — the change is a debug-view fold + export additions). 802 assertions green (+11: RLE round-trip incl. zeros/multi-run/>65535-split/empty + 3-byte wire format, `buildCartBiome`/`buildCartTerrain`→RLE→decode bit-identical (editor-loadable) + index ranges, `cartalithGridManifest` kind/dims/15+13 vocab). The merge contract (`docs/UNIFIED_TOOL_PLAN.md`) is now proven end-to-end on the data layer; remaining merge work is the host-shell build (Cartalith + `Gen.*` engine module) + the `GW×GH→widthCells×heightCells` resample on import. Browser pass owed: the unified Biomes view look; a real Cartalith load of an exported `biome_baked.bin`.

Since v0.137 (`docs/research/natural-rivers.md` — user report: Strahler/Flow rivers read as "straight lines… unnatural, and the sheer amount overwhelming"): **natural-river render pass R1+R2+R3a+R4.** All render/extraction-only — `generate()` field/temp/rain **bit-identical to v0.136** (FNV checksums byte-equal at seed 12345/256px) and the default biome render byte-identical (the new behaviour is opt-in via two default-neutral sliders + lives only in the Strahler/Flow debug views). **R1 — slope-area channel threshold** (Montgomery & Dietrich): `buildRiverNetwork`'s flat `flow>W·H·0.0004` test becomes a slope-area rule via the pure **`channelThreshold(baseThresh,slopeN,density)` = `(base/density)·(1+8·slopeN)^−|ln density|`** — steep ground channelizes with less area; **EXACTLY identity at `density===1`** (`|ln 1|=0 ⇒ pow(·,0)=1`, asserted for any slope ⇒ default network bit-identical), with a **"River density"** Style slider (`state.viz.riverDensity`, default 1×). `buildRiverNetwork` now also returns `recv`+`slope`. **R2 — min stream-order display filter** (`state.viz.minRiverOrder`, default 1=all): a **"Min stream order"** slider thins the Flow + Strahler views to cells with Strahler order ≥ k (Horton–Strahler generalization — kills the "too many"); default 1 ⇒ views unchanged. **R3a — vectorise + spline-smooth** the Strahler view: pure **`traceRiverPolylines(order,recv,W,H,minOrder)`** walks the D8 receiver chains into ordered, non-overlapping polylines (visited-mask tree; main stems first), which the renderer `rdpSimplify`→`catmullRomSample`→strokes on `vctx` (order-scaled width/hue) **instead of the per-cell 45° staircase** — the Strahler pixel branch is now dim-terrain-only. **R4 — order/slope-scaled sinuosity**: pure **`riverSinuosity(samples,amp,wavelen,seed)`** perturbs the spline perpendicular by an `fbm` wave, amplitude **`riverSinuAmp(order,slopeN)`=`(0.6+0.5(order−1))/(1+6·slopeN)`** (straight mountain headwaters, meandering lowland trunks; Kinoshita-ish). 791 assertions green (+24: channelThreshold identity-at-1/slope-direction/density-direction, network density=1 bit-identical + density monotonicity + recv/slope present, traceRiverPolylines geometry/minOrder-filter/determinism, riverSinuosity endpoints-fixed/longer-path/amp=0-noop/determinism, riverSinuAmp ↑order ↓slope). The Flow view min-order requires the network (built lazily when k>1). Biome-overlay min-order, full D∞ receivers (R3b), and the Flow-view log-floor (R5) remain documented follow-ups. River aesthetics (smooth/sinuous Strahler view, density slider feel) need a browser pass.

Since v0.136 (user bug report — "odd banding in the heightmap": horizontal/vertical stripes in the biome view after rapidly dragging terrain sliders in region mode, gone after a single whole-world regenerate): **concurrency-serialize `withBusy` ops — fixes a race introduced by v0.135's async `generate()`.** v0.135 made `generate()` async (to await the worker pool); `withBusy` fired each slider change on a `setTimeout` that `await`ed it, so two rapid changes could start a **second `generate()` while the first was still awaiting the pool** — both then mutated the shared `field`/`warpX`/… arrays concurrently and clobbered each other's per-worker `onmessage` handlers, corrupting whole row-chunks (the stripes). The old **sync** `generate()` couldn't overlap (each ran to completion first); a single world-mode regenerate has no overlap, hence "switching to world fixed it." Fix: `withBusy` now **chains** (`_busyChain`) so every busy op runs to completion before the next starts — restoring the implicit serialization — and **`GENPOOL.run` serializes internally** (`_q` chain, defense-in-depth) so the shared worker handlers can never be clobbered by overlapping runs. The heightmap math was never wrong — purely a scheduling race. Headless is unaffected (tests call `generate()` directly, never `withBusy`/the pool) → **bit-identical to v0.135/v0.134** (field/temp hashes byte-equal). 767 assertions green. The serialization is browser-only — flagged for browser confirmation that the banding is gone.

Since v0.135 (`docs/research/compute-offload-audit.md` — user: "offload every step to multicore CPU or GPU, GPU preferred"): **multicore `generate()` noise loops via a self-validating Web-Worker pool.** The audit found most safely-offloadable compute is **already** offloaded (GPU: `gaussBlur`→stress/flexure/baseField, `normalize`, `computeTemperature`, thermal/diffuse/coastal; Workers: all four erosion kernels) and that the big remaining `generate()` cost is **procedural noise** (`computeWarp`/`computeHeterogeneity`/height-formula) — which **can't go on GPU** (it can't reproduce the CPU integer-hash noise → would fail the GPU self-validation and self-disable) but **can** go multicore. The three loops are extracted into pure row-range fills **`fillWarpRows`/`fillHeteroRows`/`fillHeightRows`** (only dependency: the pure noise fns; an `rb` row-base offsets indexing so the SAME fn fills a full array (rb=0) or a worker's row slice (rb=y0)). **`GENPOOL`** stringifies those exact fns (`.toString()`, Invariant 11) into a blob-URL worker pool (`navigator.hardwareConcurrency`, capped 8); `generate()` is now **async** and, when `GENPOOL.usableFor(GW·GH)` (≥262144 cells) is true, `await`s the pool for each of the three stages, else runs the sync fill. **Safe by construction, GPU-style:** the pool only sets `usable=true` after `validate()` proves its output is **bit-identical** to the sync fill on a probe grid — any missing Worker support / build error / mismatch ⇒ `usable=false` ⇒ the sync path (unchanged). No `SharedArrayBuffer` (file:// has no COOP/COEP) → each worker gets **copies** of its input row-slices and transfers its output slice back, stitched on the main thread. `withBusy` now `await`s `fn`. **Crucially, when no pool is engaged NO `await` is reached, so `generate()` completes synchronously** — the headless suite + every existing caller are unchanged. Verified **bit-identical to v0.134** (field/temp hashes byte-equal at seed 12345/128px). 767 assertions green (+10: the three fills rebuild from `toString` with module globals shadowed and are bit-identical to the in-module fills incl. world+ridged + null-warp paths; row-slice with `rb`=y0 matches the full array — proving worker stitch correctness; GENPOOL inert headless). The worker pool itself can't run headless — **flagged for browser verification** (it self-validates, so worst case is "no speedup," never wrong output). Multicore status shows in the Shift+D resource overlay.

Since v0.134 (`docs/research/multiscale-detail-editing.md` Stages 2 **and** 3 — the multi-scale "detail surfaces on zoom" workstream is now feature-complete): **mip-consistent world-anchored edit store + feature brushes into the detail layer.** **Stage 3**: the plotline feature brushes (mountainRange/river/canyon/escarpment/…) now stamp into the **detail layer at the current zoom** when `_lodOn` — `applyFeatureToLOD(curve,ft,R,str,seed)` remaps the drawn curve from canvas coords → world coords (and scales the radius by the view's world-per-screen ratio so on-screen brush size is zoom-independent), then per visible tile (skipping baked) maps the curve to tile px and runs the existing tested `applyFeatureAlongCurve` on the tile's Stage-2 delta (base+eb). So a delta/fjord drawn at z=6 is stored at z=6 resolution and surfaces (area-averaged) in the world view, resolving its fine shape only on zoom-in. The `featApplyBtn` handler routes to it when zoomed (else the legacy coarse-`field` path; `pushUndo` only on the coarse path). `applyFeatureToLOD` is pure data (no canvas) → **headless-tested** (stamps ≥1 tile, nonzero finite delta, carries `eb`/`base`, deterministic). **Stage 2**: v0.075's per-tile edits were keyed by the *current view level*, so detail painted at z=7 vanished at z=3 (lookup missed) and vice-versa — detail didn't "surface on zoom," it appeared/disappeared. Now an edit stores its procedural **`base` snapshot + world-coord bounds `eb`** alongside `data`, making it a **world-anchored DELTA (`data−base`)** that resamples to any view level. New pure **`composeEditInto(out,tw,th,tb,e)`** (headless-tested) resamples that delta into a target tile: **nearest** when same/finer res (a same-level edit reproduces exactly, no blur), **area-average** when coarser (a fjord painted at z=7 reads as a faithful small notch at z=3 — present, mass-preserved, never an alias spike, never absent). **`composeTileEdits`** wraps it over the `_lodEdits` store (skips edits under baked coverage — the baked image is authoritative). `drawLODView` composes **all** overlapping edit-deltas into both the instant overview (so painted detail always shows, even un-refined) and each refined tile (full-res); `bakeVisibleTiles` flattens the composed tile into the atlas PNG and clears the now-permanent same-level edits; an edit's frozen `base` reconstructs its refined tile if the LRU cache evicts the procedural copy. **Off (no edits / LOD off) ⇒ LOD view + default render bit-identical to v0.133** (`composeTileEdits` returns the input array untouched when nothing overlaps; `generate()` never touches the LOD path). 757 assertions green (+12: compose same-res exact / coarse area-averaged notch present-but-damped / fine up-resolves / non-overlap untouched / additive+clamped; applyFeatureToLOD stamps tiles / nonzero finite delta / carries eb+base / deterministic). The interaction (zoom-aware feature stamping, drawLODView compositing, atlas bake-flatten) is browser-only — flagged for manual verification.

Since v0.133 (`docs/research/multiscale-detail-editing.md` Stage 1 of 3 — user picked the full multi-scale "detail surfaces on zoom" vision): **detail-amount slider + zoom-aware unified brush + auto-LOD on zoom.** Three browser-facing pieces, all gated so the **default render path stays bit-identical to v0.132** (the changes only fire on the LOD/zoom path or via the new opts). (1) **Zoom detail** (`state.viz.zoomDetail`, slider 0×–3×, default **1× → bit-identical**; legacy saves merge `zoomDetail:1`): threaded into `addZoomDetail` as `opts.zoomDetailK` scaling the on-zoom octave amplitude (`amp=baseAmp*0.6*zk`) — higher = more pronounced fractal relief emerges the deeper you zoom; `zoomDetailK=1`/omitted reproduces v0.126 exactly (asserted), and the seam-Δ=0 invariant holds at any `zoomDetailK` (asserted). A single **`lodTileOpts()`** now sources the procedural-tile opts for refine + auto-refine-on-edit so tiles stay consistent however built. (2) **Zoom-aware unified brush**: in LOD mode a Sculpt-tab brush now edits tiles non-destructively *by default* (the LOD pointerdown routes to `editTileAt` when `_activeTab==='sculpt' && !panMode && !spaceDown`, no separate "Edit LOD tiles" step), and **`editTileAt` auto-refines the touched tile** (`pyramidTile`+cache, except beneath a baked chunk) so the brush "just works" at any zoom instead of requiring a manual Refine first. (3) **Auto-detail on zoom** (`state.lodAuto`, default true; legacy saves merge true): a `lodAutoChk` toggle + `enterLodFromView()` — zooming in past `LOD_AUTO_SCALE=2.2` on the main map (wheel, `deltaY<0`, debug off) drops into the tiled-LOD viewer seeded at the cursor's world position and the reached zoom (`resetView()` clears the CSS transform; LOD owns zoom/pan), so finer relief surfaces on zoom-in with no mode toggling. 745 assertions green (+3: zoomDetailK=1 bit-identical, >1 adds relief, seam-Δ=0 preserved). The interaction (auto-enter, unified brush, auto-refine-on-edit) is browser-only — flagged for manual verification. Stage 2 (mip-consistent edit store fixing the level-locked `_lodEdits`) and Stage 3 (feature brushes → detail layer) follow.

Since v0.132 (user request — "coastal waves on a slider for how far they move outward"): **wave-reach slider.** `state.viz.waveDist` (slider 0.25×–3×, default **1× → bit-identical**; legacy saves merge `waveDist:1`) multiplies the foam-contour offshore band `WAVE_BAND` (`Math.max(8,GW/40)·waveDist`) in the renderNow water block — higher = foam reaches further out to sea, lower = a tight shoreline fringe. `WAVE_PER` (crest spacing) is untouched, so only the *extent* changes, not the ripple frequency. Render-only, water-only (gated on `wavesOn && vw<seaLevel`, same as v0.051), main biome map only (bakes/tiles unaffected). A "Wave reach" Style→Overlays slider + syncUI. Off / 1× ⇒ **bit-identical to v0.131** (water foam at 1× byte-identical to the legacy band; land untouched). 742 assertions green (+2: 2× extends foam to more offshore cells, 1× bit-identical to legacy). Also shipped: `docs/research/multiscale-detail-editing.md` — research + a staged plan for the bigger "detail surfaces on zoom, low-res never shreds" ask (Cartalith already has the LOD/atlas bones; the gaps are the destructive macro brush + level-locked `_lodEdits`).

Since v0.131 (user request — "add more styles"): **four new Painter (NPR) styles.** All follow the v0.129 gating pattern (land-only `r>0`, shared `px,py` grid coords, default 0 → bit-identical, seamless across screen/bakes/tiles). **Blueprint** (`state.viz.blueprint`): cyanotype/blueprint print — desaturates to luminance, adds a `vnoise` grain film, maps dark→navy (20,35,110) / bright→near-white (240,243,255) for a technical-drawing look. **Sepia** (`state.viz.sepia`): antique aged-map toning — classic sepia matrix `[0.393,0.769,0.189; 0.349,0.686,0.168; 0.272,0.534,0.131]` blended by strength (warm ochre/brown desaturation). **Risograph** (`state.viz.risograph`): duotone screen-print — maps luminance to shadow-indigo (15,25,85) → highlight-amber (245,205,130), with a `sin(px)·sin(py)` halftone-dot overlay for the screen-print feel. **Pointillism** (`state.viz.pointillism`): Seurat-style coloured-dot field — two `vnoise` scales (large ~4px, medium ~1.4px) shift R/B channels independently per dot cell, creating visible warm/cool dot patches. Off ⇒ **bit-identical to v0.130** (FIELD/TEMP/RENDER cmp-clean). 740 assertions green (+11: each style modulates/changes/stays-finite, off⇒bit-identical, blueprint leans blue, sepia R≥B, pointillism spatially varies; water r≤0 untouched by all styles). Browser pass owed: the four styles' look + tile/bake parity.

Since v0.130 (user request — "research other optimisations"): **cache `buildBiomeRaster()`.** Audit found the v0.117-class hot-loop closures are fully eliminated; the clearest remaining waste was `buildBiomeRaster()` — **uncached** and recomputed (a full GW·GH classification) **several times per render** when stylized icons + SDF-biome bands + per-settlement-seed info are active. It depends only on `currentWaterBodies()` (already cached) + `tempField`/`rainField` — exactly the same invalidation as the existing `_lithField` cache — so a module-level **`_biomeRaster`** cache (cleared everywhere `_waterBody` is: `computeFlow`, `generate`, `centerLandmasses`, the Water brush) is safe and **bit-identical**. Now the raster is built once and reused across the icon/SDF/settlement consumers within a render. 729 assertions green (biome-raster + deposited-lake tests confirm the cache returns correct output); FIELD/TEMP/RENDER cmp-clean vs v0.129.

Since v0.129 (user request — "bring different painting styles to the tool"): **three new hand-drawn map styles** added to the Painter (NPR) group, each its own intensity slider, default **0 → off → bit-identical** (legacy saves merge `cel:0, crosshatch:0, stipple:0`). All live in the same gated tail of `landColorCore` (land-only, evaluated in shared grid coords ⇒ seamless across screen/bakes/tiles like the v0.108 styles). **Cel / toon** (`state.viz.cel`): posterizes the lit colour into flat quantized bands (blended by strength) — a cartoon/cel look. **Engraving (cross-hatch)** (`state.viz.crosshatch`): antique cross-hatching whose **number of hatch directions grows as the cell darkens** (1 dir past dark 0.22, +diagonal past 0.42, +vertical past 0.62) — a copperplate/woodcut feel. **Stipple (pen)** (`state.viz.stipple`): pen dot-density shading — darker regions pass more `vnoise` dots (denser stipple). Off ⇒ **bit-identical to v0.128** (FIELD/TEMP/RENDER cmp-clean). 729 assertions green (+6: cel posterizes, crosshatch hatches dark cells, stipple finite; each off ⇒ bit-identical). Browser pass owed: the three styles' look (they stack with contours/ink/hachure/watercolor).

Since v0.128 (user request — "much like Cartalith I want everything saved"): **designated places + their road network now persist in the project save.** Moved the v0.127 `_places`/`_roadNet` module globals into **`state.places`/`state.roads`** — `serializeState()` already serializes the whole `state` (`JSON.parse(JSON.stringify(state))`) and `loadZip` already `Object.assign`s it back, so places + roads round-trip through `params.json` automatically (legacy saves merge `places:[]`/`roads:null`). Only the **`_placeMode`** click-tool toggle stays a transient module global (invariant 6 — transient UI is never serialized). The road overlay + place-click + build/clear ops all read/write `state.*` now; load → renderNow draws the restored places/roads. Heightmap edits (sculpt, fjords, erosion) were already saved via `heightmap.f32`, so with places/roads added the project is fully round-trippable. Empty by default ⇒ **bit-identical to v0.127** (FIELD/TEMP/RENDER cmp-clean). 723 assertions green (+1: places+roads survive serialize→parse→merge). Browser pass owed: drop places + Connect roads → save → reload → they reappear.

Since v0.127 (user request — geodesic roads between created places, "akin to Cartalith's vertex lines", **only between designated/active places**): **terrain-aware least-cost road network.** Opt-in/transient overlay ⇒ **bit-identical to v0.126** (FIELD/TEMP/RENDER cmp-clean). Pure core: **`buildTravelCost(fld,W,H,sea,opts)`** → per-cell traversal cost (`1 + slopeK·slope²`; **water = Infinity / impassable** so roads never cross the sea); **`roadDijkstra(cost,W,H,sx,sy,wrap)`** → single-source 8-neighbour Dijkstra (own binary heap; diagonal ×√2; X-wrap in world mode) returning `{dist,prev}`; **`buildRoadNetwork(places,cost,W,H,opts)`** → a **minimum spanning tree** over the **designated** places (P single-source Dijkstra runs → pairwise cost-distances → Prim), reconstructing each MST edge's path from the predecessor tree — places on separate landmasses get **no road** (infinite cost-distance), so the network can be a forest. Roads hug valleys/passes (slope²) and follow the terrain like Cartalith routes. Browser: a **Places & roads** section — an **Add places** click tool (`_placeMode`: click the map to drop/remove a place into `_places`), **Connect roads** (`buildRoadsOp` downsamples the cost grid to ≤384px for fast pathfinding, builds the network, scales paths back), **Clear roads / Clear places**; `drawRoadsOverlay` strokes the casing+road polylines + place markers on `vctx`. `_places`/`_roadNet`/`_placeMode` are transient (invariant 6). 722 assertions green (+7: travel-cost water-impassable/slope-ordered, Dijkstra reachability, MST N−1 edges/contiguous paths/sea-barrier-no-road/determinism). Browser pass owed: drop places, Connect roads → terrain-following routes.

Since v0.126 (user reports — atlas zoom "detail doesn't get more intricate" + "Center landmasses leaves a straight line"): **two LOD/op fixes, both LOD-/op-only ⇒ default bit-identical to v0.125** (FIELD/TEMP/RENDER cmp-clean). (1) **Progressive zoom detail**: `amplifyRegion` added detail at a *fixed* coarse-space frequency, so the fbm ran out of octaves at high zoom and went smooth. New pure **`addZoomDetail(data,W,H,coarse,cW,cH,bounds,z,opts)`** (called in `pyramidTile` after `refineTile`) adds `z−zBase` extra finer octaves (each 2× freq, ~0.6× amp), **sampled in shared coarse coords with a coarse-relief taper** — so deeper zoom = more intricate relief while adjacent same-level tiles stay **seam-Δ=0 exactly** (asserted at z=6) and oceans/flats stay smooth (zBase=2). (2) **Center-landmasses seam line**: the world is only approximately periodic in X (Invariant 9: wrap-delta <0.12); the X-shift moved that original edge seam into the interior (≈ column GW−off) where it read as a straight vertical line. New wrap-aware **`featherSeamX(arr,W,H,col,halfW)`** box-smooths a few columns at the relocated seam (field/temp/rain/geoid) to dissolve it. 715 assertions green (+5: addZoomDetail no-op≤zBase / more-detail-deeper / determinism / high-z seam-Δ=0; featherSeamX smooths a step). Browser pass owed: zoom the atlas (detail should keep resolving) + Center landmasses (no line).

Since v0.125 (user report — "I'm missing biomes such as tropical rainforests"): **a "Biomes" classified debug view.** Diagnosis: tropical rainforest *is* generated (~8% of land on a default world) and `forestCol` already gives it a distinct saturated green (`WOOD_TROP`); the gap was that the main map renders a continuous *material mix* (no per-biome legend) and the default Region (5–55°N) is mostly mid-latitude, so the tropics are a thin southern band. Added a **`bclass`** debug view that paints each land cell with its native `classifyBiome` colour (the 12 frozen `BIOME` classes, incl. **Tropical rainforest** `[30,92,48]`) over hillshade, with a legend — so every biome is explicitly visible and locatable (the legend notes Whole-world / a tropical latitude band shows more). Debug-only ⇒ **bit-identical to v0.124** (FIELD/TEMP/RENDER cmp-clean). 710 assertions green. Browser pass owed: the Biomes view + confirm tropical bands at low latitude.

Since v0.124 (user request — tidy the UI toward the natural workflow: generation → base settings → painting → saving → coloring): **sidebar reorganized, DOM-move only ⇒ bit-identical to v0.123** (FIELD/TEMP/RENDER cmp-clean; all controls keep their IDs/handlers). Two high-value UX fixes from a workflow audit: (1) the primary **Generate world / New seed** buttons were buried inside the *Tectonics* section — promoted to the **top of "Source & resolution"** so the first thing you see is "make a world" (extent + resolution right below). (2) **Tiles & LOD** (an output/saving concern) sat 2nd from the top, interrupting the generation cascade — **moved down next to "Export image & project"** so all output/saving lives together at the bottom. The Terrain-tab order is now Source/Generate → Planet → Scale → World Structure → Tectonics → Volcanism → Climate → Weather → Erosion → Glacial → Coastal → Map view → Tiles & LOD → Export — a clean generate → base-settings → modify → view → save flow (sculpt/feature brushes stay in the Sculpt tab, visuals in the Style tab). 710 assertions green (UI not headlessly testable; pipeline untouched). Browser pass owed: eyeball the new section flow.

Since v0.123 (user bug report — "fjords aren't drawing on the map, the zones show in the debug view"): **the fjord carve was too weak to drown cells below sea.** The mask is a product of three [0,1] factors, so most fjord-zone cells have *moderate* mask (~0.1–0.2); `carveFjords` scaled both the target depth (`sea−overDeep·m`) **and** the carve weight by mask magnitude, so moderate-mask coastal valley floors barely reached sea level (only ~264 of ~9000 candidate cells actually drowned ⇒ invisible). Fix: carve toward a **fixed overdeepened sub-sea bed** (`target=sea−overDeep`, overDeep 0.16) with a gentler weight `min(1, mask/0.25)`, so even moderate-mask corridors drown into **visible inlets** (~1200+ newly sub-sea cells on a cold-coast world, drops up to ~0.65) while ridges (concave check) stay as steep walls. Carve-op only ⇒ **bit-identical to v0.122** (FIELD/TEMP/RENDER cmp-clean; never auto-runs). 710 assertions green (drowns-valley / never-raises / low-mask-untouched / deterministic all hold). Browser pass owed: run **Carve fjords** on a cold steep granite coast → visible narrow inlets.

Since v0.122 (user bug report — tiled-LOD/atlas zoom "can't pan, stuck at working resolution"): **two LOD interaction fixes** (browser-only handlers ⇒ FIELD/TEMP/RENDER bit-identical to v0.121). (1) **Pan was broken by the ✋ pan button**: the LOD `pointerdown` guard required `!panMode`, so toggling the pan button bailed the LOD handler while the regular `viewT` pan does nothing in LOD mode (`applyView` forces the CSS transform to identity). Guard relaxed to `_lodOn && !guideDrawMode` so drag-to-pan always works. (2) **Zoom "stuck at working resolution"**: added **`scheduleLodRefine()`** — a 240 ms-debounced auto-refine of the visible tiles after navigation settles (wheel/+−/pinch/pan-end), zoomed-in only, visible+cached tiles only, so detail streams in as you zoom/pan (the Refine button still forces an immediate refine). 710 assertions green (interaction-only; browser pass owed).

Since v0.121 (user request — "Better terrain" Phase 2 of 3: fault-block / Basin-and-Range): **repetitive horst-graben fault blocks** in the rift profile. `buildOrogenyField`'s `rift` branch gained an opt-in **parallel sawtooth** across the extension axis (the perpendicular signed distance `de`, which is constant along strike ⇒ ridges run parallel to the rift): an exponential block-tilt `exp(−2.4·frac)−0.36` (sharp footwall scarp at the fault, gradual hanging-wall down-tilt) over characteristic block width `blockW=0.55·blurR`, confined by a Gaussian envelope to the rift zone. Gated on `opts.faultBlockK` (0 ⇒ **bit-identical** to the v0.120 single-graben rift, asserted) ← `state.tect.faultBlock` (default 0.6) + a **Fault blocks** Tectonics slider (legacy saves merge it). Because the whole orogeny field only builds when **Structured orogeny** is on (default off), the **default world stays bit-identical to v0.120** (FIELD/TEMP/RENDER cmp-clean) — only graph-on rifts gain the Basin-and-Range structure. 710 assertions green (+3: faultBlockK=0 bit-identical, >0 changes profile, adds ≥3 parallel ridge/valley alternations). Refs: Stewart 1978, Wernicke 1985. Phase 3 (discrete island-arc stratovolcano cones) next. Browser pass owed: enable Structured orogeny on a rift archetype → parallel ranges.

Since v0.120 (user request — "Better terrain", `docs/research/better-terrain.md` Phase 1 of 3): **fjords — constrained glacial-coastal incision.** Most of the spec's Sections 2–3 (island arcs, rift grabens, trenches, subduction polarity) already exist in the T0–T5 tectonic-feature graph; the genuine gap was *constrained* glacial coastal carving. New opt-in op (never auto-runs ⇒ **bit-identical to v0.119**, FIELD/TEMP/RENDER cmp-clean). `LITH_COMPETENCE[]` (crystalline competence by `LITH_KEYS`). Pure **`buildFjordMask(fld,tempC,lith,coastD,W,H,sea,opts)`** → Float32 [0,1] = **I_glacial** (paleoclimate-adjusted cold-but-not-frozen thermal band on `tempField`) × **H_relief** (neighbourhood max−min relief — rugged coastal mountains adjacent, high even at a flat valley floor between steep walls) × **B_crystalline** (lithological competence) × coastal-fringe falloff — nonzero only on cold·rugged·hard-rock coastal land (never tropical/flat/weak-rock). Pure **`carveFjords(fld,mask,…)`** overdeepens pre-existing coastal **valley floors** below sea level (drowned U-valleys) while leaving ridges high → steep fjord walls (only-deepens; low-mask cells byte-untouched). `carveFjordsOp()` + a **Carve fjords** button (Glacial panel) + a **Fjord** debug view (the probability mask). Refs: Holtedahl 1993, Montgomery 2001, Benn & Evans 2014. 707 assertions green (+9: mask finite/range, fires-on-cold-granite, zero-tropical, sed-suppressed, interior-zero; carve never-raises/drowns-valley/low-mask-untouched/deterministic). Phases 2–3 (Basin-and-Range anisotropic sawtooth; discrete island-arc stratovolcano cones) are planned follow-ups. Browser pass owed: fjords on a cold steep granite coast + the mask view.

Since v0.119 (user request — fix the "island sliver" x-seam split): **Center landmasses.** World mode is a **cylinder** (wraps in X/longitude only; Y is pole-to-pole latitude → temperature and never wraps), so a continent straddling the x=0/x=GW seam shows as slivers on both edges. Pure **`bestEmptyColumn(fld,geo,W,H,sea)`** finds the meridian with the least land; pure **`shiftGridX(arr,W,H,off)`** circular-shifts a grid array in X (rows/Y untouched; works on any typed array). **`centerLandmasses()`** (world-mode-only button under Map extent; alerts in region mode) shifts **every** grid array by the same offset — terrain, climate (incl. seasonal temp/rain + Köppen), all tectonic proxies, geoid/tide/orogeny, `plateId`/`boundaryMask`/`boundaryType`, `riverMask`/`riverFloor` — plus relabels plate centroids in X, then clears every derived/render cache and re-renders. Because longitude origin is arbitrary on a cylinder, the uniform X-shift is a consistent **relabel** (the seam moves into open ocean; no climate/latitude corruption — Y is deliberately never shifted, unlike the naive 2-axis version). Not wired into the field-only undo (it shifts many arrays) — regenerate reverts; re-bake the atlas after centering. New op, never auto-runs ⇒ **bit-identical to v0.118** (FIELD/TEMP/RENDER cmp-clean). 698 assertions green (+6: bestEmptyColumn finds empty meridian, shiftGridX identity/round-trip/row-sum-preserved/emptiest-to-col-0/Int16). Browser pass owed: the button on a seam-split world.

Since v0.118 (user request — save/export + LOD UX): three changes, all **bit-identical at defaults to v0.117** (UI/export/import/opt-in only; FIELD/TEMP/RENDER cmp-clean). (1) **Atlas embedded in the project .zip**: `exportZip()` now appends this world's baked atlas chunks (via the existing `atlasExportEntries(true)` → `World/…` + `World/atlas.json`, gzipped) so the IndexedDB LOD/atlas **travels with the project**; `loadZip()` detects `ATLAS_MANIFEST` and restores them via `atlasImportEntries(z)` then recomputes `_worldKey`+`atlasSyncWorld()` so they reload **without re-baking**. Gated on a default-on **"Embed baked atlas"** export checkbox (`embedAtlasChk`); no baked chunks ⇒ no-op. (2) **User-selectable LOD depth**: `state.lodMaxLevel` (default 8 = the previous hardcoded cap) + a **"LOD levels"** select in Tiles & LOD; threaded into `lodViewRect`'s `pyramidLevelForZoom(...,state.lodMaxLevel)` so the viewer/atlas refine+bake honour it (legacy saves merge 8). (3) **Map-extent (Region / Whole world) toggle moved up** from "Climate & biomes" into the top **"Source & resolution"** section so the foundational region/world choice comes first (the latitude band stays in Climate; the `extentSeg` handler is unchanged — DOM move only). 692 assertions green. Browser pass owed: atlas embed/restore round-trip through a real IDB, the LOD-levels effect, the relocated toggle.

Since v0.117 (user request — high-resolution optimization, "check proposals before applying"): **`distanceToBoundary` hot-loop optimization.** Audited the proposed loop optimizations against the code: (D1) the index/closure optimization is valid — `distanceToBoundary` was the one distance-transform still using a per-cell `id=(x,y)=>y*GW+x` **closure** (millions of calls at 4K/8K) while the codebase's other transform `chamferDist` was already written in the direct-index style. Rewrote both passes with an **idx increment + relative offset neighbours** (no closure, no per-cell `y*GW` recompute), matching `chamferDist`. (D2) replacing `Math.min`/`Math.max` with manual branches was **declined**: V8 compiles 2-arg `Math.min` to an intrinsic, the codebase's own optimized `chamferDist` keeps `Math.min`, and branch-min introduces NaN/−0 edge differences — kept `Math.min` for consistency + safety. **Bit-identical to v0.116** (same scan order, same `Math.min`, same `1.4142` chamfer literal → FIELD/TEMP/RENDER cmp-clean). 692 assertions green. Note: loop micro-opts cut generate() time + GC at high res, but the dominant 4K/8K **tab-crash** cause is *memory* (≈20 `GW·GH` Float32Arrays → ~5 GB at 8K) — the tiled-LOD/atlas path is the real high-res answer (never allocates a full 8K canvas).

Since v0.116 (user request — naming-consistency audit, "sea vs ocean" across categories): **canonical water naming enforced.** The largest connected water body was labelled inconsistently — the **CTerrain debug legend said "sea"** while the **CBiome legend said "ocean"** for the same deep-blue body, and `buildWaterBodies` used "sea"/`seaComp` internally — even though every externally-visible label (biome key 0 `ocean`, `biome_index.json`/`koppen_index.json` manifests, `CART_BIOMES` "Ocean / Deep Water", the settlement export) was already **"ocean"**. Adopted one convention engine-wide: **"sea level"** = the elevation datum / water line (`seaLevel`, "mean sea level" — unchanged); **"ocean"** = the largest connected water body (water-body class 1, biome index 0); **"lake"** = enclosed inland water (class 2, incl. inland seas). Fixed the outliers: CTerrain legend "sea"→"ocean"; `buildWaterBodies` doc + `seaComp`→`oceanComp` + class comments; `buildBiomeRaster` comment; added a convention note on `buildWaterBodies`. Comment/legend/local-var only ⇒ **bit-identical to v0.115** (FIELD/TEMP/RENDER cmp-clean; legend is DOM, not canvas). 692 assertions green.

Since v0.115 (river overhaul — **Pillar 4 finalized + legacy river-render system removed**): two things, both **bit-identical at defaults to v0.114** (FIELD/TEMP/RENDER cross-version cmp-clean — the removed paths were never on the default render). (1) **Pillar 4 (Provenance) done**: a single consolidated **ATTRIBUTION** comment block at the top of the `<script>` indexes every river-overhaul source in one discoverable place (the per-solver `@architecture/@physics/@credits` headers stay) — "algorithms studied, no code copied," pointing to `docs/research/river-overhaul.md`. (2) **Old river system removed**: the pre-overhaul flat-blue river rendering is gone — deleted the `state.viz.smoothRivers` toggle (UI checkbox + state default + loadZip merge now `delete`s the stale key + syncUI + handler), the **legacy per-cell `flow>thresh` flat-blue overlay branch** in `surfaceColor` (the network is the only river renderer now), the dead write-only **`_riverField`** global (every consumer already read `_riverNet.intensity`; removed from the decl, `computeFlow` clear, render prologue, and the transient-array list), and the vestigial **`buildRiverField`** delegating wrapper (no in-engine caller; tests repointed to `buildRiverNetwork(...).intensity`). The river overlay block is now simply `if(state.showRivers && _riverNet)` → Strahler/Rosgen widths + Beer–Lambert depth water. 692 assertions green (river-overlay property tests migrated to the network; the minor-streams test now toggles `_riverNet`). **The 4-pillar river overhaul (P1 macro-topology · P2 velocity erosion · P3 optical water · P4 provenance) is complete and the superseded system is removed.**

Since v0.114 (river overhaul follow-up — worker-ify the Pillar-2 velocity op): **the velocity-field hydraulic-erosion op now runs off the main thread**, like droplet/stream/glacial. **`velocityErodeKernel` is now fully self-contained (worker-ready, Invariant 11)** — the pure `_bilin`/`centrifugalShear` helpers are **inlined inside the kernel** (module-level copies stay for the sync path + tests, the same deliberate duplication as the stream/glacial routing), so `toString()` carries everything. New **`velocityEroseAsync()`** is a dedicated blob-URL runner (the velocity op needs to transfer **extra** buffers back — field **plus** `vx`/`vy`/`water` for the Velocity view + Pillar-3 flow-map — so it has its own runner rather than the generic `runErosionWorker`); it copies field+rain in, runs the kernel off-thread with progress %, transfers the four buffers back, and **falls back to the sync `velocityErode()`** when Workers are missing or error. `veloFinish()` (the `enforceRiverChannels`→`computeFlow(true)`→`refreshClimate`→`renderNow` tail) is shared by both paths. The **Velocity erode** button now calls `velocityEroseAsync()`. **Invariant 11 now covers all four kernels** (droplet/stream/glacial/velocity) — the suite rebuilds `velocityErodeKernel` from source with `_bilin`/`centrifugalShear` (and all module globals) shadowed and asserts bit-identical output + progress callbacks. **`generate()`/render bit-identical to v0.113** (FIELD/TEMP/RENDER cross-version cmp-clean; the op never auto-runs and the kernel math is unchanged). 692 assertions green (+4: velocity kernel rebuilds/finite-changed/bit-identical/progress). The worker path itself can't run headless — verify in a browser (run Velocity erode, confirm progress % + parity with the sync result).

Since v0.113 (user request — river overhaul **Pillar 3 of 4: Optical Realism / water shading — the 4-pillar overhaul is now feature-complete**; `docs/research/river-overhaul.md`): **Beer–Lambert depth water shading (default, static) + an opt-in flow-map animation.** (1) **Depth shading** replaces the flat-blue river overlay by default ⇒ **`field`/`temp` bit-identical to v0.112, RENDER changes by design** (FIELD/TEMP cross-version cmp-clean). Pure **`waterShade(bed,depth,sed,Kd)`** = Beer–Lambert `I=I₀·e^(−Kd·depth)`: shallow reaches transmit the bed colour (revealed riverbed), deep trunks absorb to a turbid scatter colour whose hue shifts blue→green/brown with sediment load; applied in `surfaceColor`'s river block using the Pillar-1 `_riverNet.depth` (sediment ∝ depth, `RIVER_KD=5`). (2) **Flow-map animation** (opt-in, browser-only, perf-capped to ≤400k cells, default off ⇒ never runs): pure **`flowMapPhases(t,period)`** = two phase-shifted streams blended by a triangle crossfade (seamless, non-stretching travel); a `requestAnimationFrame` loop (`startWaterAnim`/`stopWaterAnim`/`waterAnimFrame`) draws a travelling shimmer over river cells on the `polyOverlay` canvas, flowing along `_veloVx/_veloVy` (Pillar 2) or the downhill gradient. `state.viz.waterAnim` (legacy saves merge it) + a Style→Overlays "Animate water (flow map)" toggle. Attribution (Pillar 4): Premože & Ashikhmin (Stanford, "Rendering Natural Waters") — algorithms studied, no code copied. 688 assertions green (+8: waterShade bed-at-0/deep-absorb/Beer–Lambert-monotone/sediment-hue, flowMapPhases weights-sum-1/phases-range/seamless/crossfade). **River overhaul P1–P3 complete** (P1 Strahler/Rosgen render, P2 velocity-field erosion op, P3 water shading; P4 provenance threaded throughout). Worker-ifying the P2 op + the live animation aesthetics are the browser follow-ups.

Since v0.112 (user request — river overhaul **Pillar 2 of 4: Micro-Physics / velocity-field hydraulic erosion**; `docs/research/river-overhaul.md`): **a NEW velocity-field (momentum) erosion op — the proven droplet/stream/glacial worker kernels and Invariant 11 stay untouched, and it never auto-runs ⇒ `generate()`/render bit-identical to v0.111** (FIELD/TEMP/RENDER cross-version cmp-clean). **`velocityErodeKernel(fld,rain,W,H,P,onProgress)`** is a grid (virtual-pipes, Mei et al. 2007 / LanLou123) shallow-water hydraulic-erosion kernel (self-contained but for the pure `_bilin`/`centrifugalShear` helpers; mutates `fld` in place, returns `{water,vx,vy}`): per iter — rain input → virtual-pipe flux (scaled so outflow ≤ available water ⇒ **emergent lake pooling** at closed basins, sea cells are open sinks, border reflective) → water update + flux→velocity → **semi-Lagrangian momentum advection** `v_new=v_old(x−v_old·Δt)+g·∇` (+ sediment advection) → **capacity erode/deposit** (SebLague/Beyer) with a **centrifugal outer-bank bias** (`centrifugalShear` throws extra shear to the outer bank of a bend, deposits on the inner ⇒ meanders/oxbows) → evaporation; every write clamped (Invariant 2 holds), suspended load settled at the end. Flux acceleration scales with planet **g** (gravity workstream). `velocityErode()` sync wrapper runs it on the live `field` then `enforceRiverChannels`→`computeFlow(true)`→`refreshClimate`→`renderNow` (no isostatic rebound — it's a full sim); stores `_veloVx/_veloVy/_veloWater` (cleared on regenerate) for a **Velocity** debug view (hue=direction, brightness=speed) + Pillar 3. New **Velocity (momentum)** Erosion accordion (Iterations/Strength/Meander sliders, `state.velo`, legacy saves merge it). Worker-ification is a follow-up (sync for now, like several ops were initially). Attribution (Pillar 4) in the header: LanLou123/Webgl-Erosion, Mei et al. 2007, SebLague/Hydraulic-Erosion, Beyer 2015, weigert/SimpleHydrology — algorithms studied, no code copied. 680 assertions green (+11: centrifugalShear straight/turn/opposite/magnitude, kernel finite/velocity/incision/pooling/determinism/meander-bias). **Pillar 3 next** (Beer–Lambert depth shading + flow-map animation, consuming the river `depth` field + `_veloVx/Vy`). Browser pass owed: meander/oxbow emergence + Velocity-view aesthetics.

Since v0.111 (user request — river-system overhaul, **Pillar 1 of 4: Macro-Topology / drainage networks**; `docs/research/river-overhaul.md`): **Strahler stream-order hierarchy + Rosgen-inspired channel geometry, replacing the uniform discharge-width river render by default.** This is the first version that **deliberately changes the default RENDER** (the user chose "replace by default" over opt-in) — **`field`/`temp`/`rain` stay bit-identical to v0.110** (FIELD/TEMP cross-version cmp-clean; the heightmap and climate are untouched), only the river *look* changes (RENDER hash shifts by design; carving remains in the erosion ops, which Pillar 2 will extend). Pure primitives (amplifyRegion mold, headless-tested): **`strahlerFromReceivers(recv,flow,chan,n)`** — the Strahler (1957) solver: process channel cells upstream→downstream (ascending flow ⇒ donors resolve before receivers), a cell with no channel donors is order 1, else it takes the max donor order +1 only when that max is shared by ≥2 donors; **`buildRiverNetwork(fld,flow,W,H,sea,opts)`** → `{order:Int16, intensity:Float32[0,1], depth:Float32[0,1]}` — steepest-descent D8 receivers + channel mask (`flow>thresh`, above sea), Strahler order, then **Rosgen-inspired** cross-sections stamped (confluence-blended via max-combine, so order steps by ≤1 ⇒ no width spikes): half-width grows with discharge **and** Strahler order, narrows on steep ground (`slopeFac=1/(1+5·slopeN)` → low-order mountain streams steep+narrow, high-order lowland trunks wide+deep); `depth` (deeper trunks/lowlands) is staged for Pillar 3's Beer–Lambert shading. `buildRiverField` now **delegates** to `buildRiverNetwork(...).intensity` (existing callers/tests transparently get Strahler widths); `_riverNet` caches `{order,intensity,depth}` (cleared in `computeFlow`). A **Strahler** debug view (hue ramp by order over dim terrain) + legend, and a `strahler_order.bin` (Uint8) export. Attribution (Pillar 4): Pasternack-Lab/RiverBuilder (UC Davis), Genevaux et al. 2013, Galin et al. 2019, Strahler 1957, Leopold & Maddock 1953 — algorithms studied, no code copied. 669 assertions green (+9: Strahler Y-confluence/≥2-equal-donor/unequal-tributary, network finite/range/order≥1/ocean-empty/determinism, Rosgen steeper⇒narrower). **Pillars 2–4 follow** (velocity-field momentum erosion as a NEW op; Beer–Lambert depth shading + flow-map animation; provenance threaded throughout). Browser pass owed: the new river look + Strahler view aesthetics.

Since v0.110 (user request — debug-layer visibility + clickable settlement seeds, prep for the Cartalith integration): **two render/UI features, both bit-identical to v0.109 at defaults** (FIELD/TEMP/RENDER cross-version cmp-clean). (1) **Debug-layer opacity** (`state.debugOpacity`, default 1; legacy saves merge it): a "Layer opacity" slider in the Debug-overlay accordion blends ANY active debug overlay over the base biome/relief map so terrain reads underneath. In the renderNow pixel loop, after the debug branch sets `r,g,b`, `if(dbg!=='off' && _dbgAlpha<1)` mixes toward `debugBaseColor(x,y,i,vw)` — a new helper mirroring the mode branches (gray/shade/biome→`isWater?seaColor:surfaceColor`/hypso). `_dbgAlpha=1` ⇒ the block is skipped ⇒ unchanged. (2) **Clickable settlement seeds**: the Settlement debug view's advisory gold dots are now clickable — `_settleSeeds` promoted to a module global (set in renderNow when `dbg==='settle'`), a `view` `click` handler hit-tests the nearest seed in transform-invariant grid coords and opens a fixed-position `#settleInfo` popup. **`settlementSeedInfo(x,y)`** (reads live fields) returns the per-site "why": score, soil/water/carrying-capacity fundamentals, biome + lithology, a coastal-trade flag, and the **hinterland resource potentials** (neighbourhood-max over the 6 ores, ≥0.35, sorted) + a human summary string. The same data is exported as **`settlement_seeds.json`** (`kind:'cartalith-settlement-seeds'`) in `exportZip` — the prep layer the Cartalith integration will consume. 660 assertions green (+9: settlementSeedInfo fields/score-range/sorted-resources/valid-keys/labels/determinism, debugBaseColor finite RGB, export payload shape). Browser pass owed: opacity-blend legibility + the click popup placement/aesthetics.

Since v0.109 (`docs/AFFORDANCE_FIELD_PLAN.md`, Phase A LOD follow-up): **affordance debug fields + multi-sun hillshade now render in the LOD/atlas tiles** (previously main-map + export only). Two pieces, both **bit-identical at defaults to v0.108** (FIELD/TEMP/RENDER cross-version cmp-clean — `renderBiomeTileRGBA` isn't on the default `renderNow` path, multi-sun is off by default, and the LOD gate only fires when `_lodOn`). (1) **Multi-sun in tiles**: the v0.104 D1 blend was factored into a pure **`multiSunFromNormal(nx,ny,nz)`** (`multiSunShade` now calls it — proven bit-identical via an in-suite equality check); `renderBiomeTileRGBA`'s macro hillshade uses it when `state.viz.multiSun` is on (off ⇒ single-source ⇒ unchanged), so a tiled LOD/region view matches the main map's softer 4-light relief. (2) **Lith/Soil/Water in LOD**: the renderNow LOD gate (was `dbg==='off'`) now also admits the `lith`/`soil`/`water` debug views, and `drawLODView` routes them to a new pure **`renderAffordanceTileRGBA(tile,W,H,bounds,which)`** — it samples the **coarse** affordance field (`currentLithology`/`currentSoil`/`currentWaterAccess`, which carry no high-freq detail) at the tile's world coords and applies the **same colormap as the main-map debug path** (lith = nearest `LITH_COLS[index]`, soil = pale→green ramp, water = tan→blue ramp; the tile heightmap supplies only the land/water mask) — so the affordance views are now zoomable through the tiled viewer. 651 assertions green (+13: `multiSunFromNormal` range/floor + `multiSunShade` equality, biome-tile multi-sun on≠off + finite/opaque, affordance tile finite/opaque + water-cell colours + land lith matches `LITH_COLS` + determinism). Browser pass owed: multi-sun tiled relief + the three affordance views at LOD zoom.

Since v0.108 (`docs/AFFORDANCE_FIELD_PLAN.md`, Phase D — "The Painter" NPR; D1 multi-sun already shipped in v0.104): **four opt-in hand-drawn map styles, each its own intensity slider.** All live in a single gated block at the **tail of `landColorCore`** (operating on the post-hillshade/haze `lit` colour, **land-only** `r>0`), so they flow to **screen (`surfaceColor`), PNG bakes (`bakePixel`) and LOD/region tiles (`renderBiomeTileRGBA`) identically** and stay **seamless across tiles** (evaluated in shared grid-coordinate `px,py` space, the R3/R4 convention). Every slider 0 ⇒ block skipped ⇒ **bit-identical to v0.107** (FIELD/TEMP/RENDER cross-version cmp-clean; `state.viz.{contours,ink,hachure,watercolor}` default 0, legacy saves merge them). **Contour veins** (`state.viz.contours`): constant-(map)-width elevation isolines — `d=|r/iv−round|·iv`, band half-width `max(iv·0.04, slope·0.5)` tracks slope, every 5th an index line (×1.4 darker). **Ink linework** (`ink`): pen outline on strong landform edges = `min(1,|curv|·55·wob)·min(1,slope·6)` with an `fbm` hand-drawn weight wobble, darkening past a 0.18 threshold. **Hachure** (`hachure`): downslope hatching — needs the gradient (new optional `gx,gy` params on `landColorCore`, computed per render path only when `hachure>0` via the new pure **`gradAt(x,y)`** on the main map, sampled neighbours in `bakePixel`, and tile-px ∇ rescaled to coarse units in `renderBiomeTileRGBA`); stripes `sin(u·freq)` along the contour direction (`u=px·(−gy/gl)+py·(gx/gl)`), slope-weighted, denser on steeper ground; no-op when `gx=gy=0` (asserted). **Watercolor** (`watercolor`): pigment pooling (`fbm`) + paper granulation (`vnoise`) wash × curvature-driven edge "blooms". A new Style-tab **"Painter (NPR)"** group with the four sliders (the `bind`/`v`/`lab` idiom). 638 assertions green (+11: each style darkens/modulates when on + off⇒bit-identical, hachure gradient-gated + hatches steep slopes, all-four r≤0 untouched, finite/in-range). Browser pass owed: the four styles' aesthetics + tile/bake parity at zoom.

Since v0.107 (`docs/AFFORDANCE_FIELD_PLAN.md`, Phase C — multi-channel RGBA atlasing export): **pack the affordance/resource/class fields into a handful of 8-bit RGB PNGs + a decode manifest, instead of ~11 separate single-field blobs.** Opt-in **"Channel atlas"** export checkbox (`#chanAtlasChk`, default off ⇒ `exportZip` output unchanged; `generate()`/render **bit-identical to v0.106**, FIELD/TEMP/RENDER cross-version cmp-clean). Pure cores (amplifyRegion mold, headless-tested): **`packRGB8(specs,n)`** / **`unpackRGB8(rgba,n,kinds)`** — pack up to 3 fields into R/G/B with **alpha forced to 255** (deliberately avoids the canvas premultiplied-alpha round-trip corruption that a data-carrying alpha channel would cause); per-channel `kind` is `'unit'` ([0,1]→`round(clamp01·255)`, ≤1/255 round-trip) or `'index'` (categorical raster, raw clamp, exact). **`channelAtlasGroups()`** → the 5-PNG plan (`habitat`=soil/water/carrying-capacity, `settlement`, `resources_a`=copper/tin/iron, `resources_b`=gold/salt/timber, `classes`=biome/lithology/köppen indices). **`channelAtlasManifest(groups)`** → schema-1 `{kind:'cartalith-channel-atlas', encoding:'rgb8', files:[{file,width,height,channels:{r,g,b:{key,name,kind,range,manifest}}}]}`. Browser shell: **`rgbaToPngBytes(rgba,w,h)`** (OffscreenCanvas/canvas → PNG, null headless) + **`channelAtlasEntries()`** (PNGs + `atlas/index.json`), wired into `exportZip` behind the checkbox; the full-precision `.f32`/`_raster.bin` blobs **stay** as the master copies (atlas is the compact, viewable, GPU-samplable convenience layer). 627 assertions green (+12: pack/unpack unit-≤1/255 + index-exact + alpha-255 + null-channel, `_chanEnc` clamps, 5-group plan + all-6-resources coverage + GW·GH lengths, manifest kind/encoding/dims/per-channel-range, determinism). Browser pass owed: confirm the atlas PNGs decode correctly (canvas round-trip) and the manifest channel map reads sensibly in a consumer.

Since v0.106 (`docs/AFFORDANCE_FIELD_PLAN.md`, Phase B — tectonic inversion for imported heightmaps): **reconstruct proxy plates + tectonic fields from an imported DEM's morphology, re-enabling the whole affordance stack for imported terrain.** An imported heightmap (`loadImage`/`loadZip`) arrives with `field[]` but every tectonic proxy zeroed (`allocate()`) and `plates=[]`, so lithology/resources/settlement + the Tect/Lith/Resources debug views & exports read zeros for any real-world DEM. **`inferTectonics()`** (opt-in orchestrator — an **"Infer tectonics from heightmap"** Import-menu button, enabled via `_canInvert` after import; **never called from `generate()`**) reconstructs them, deterministic from the heightmap alone (no RNG/seed). Mountains/rifts mark plate **boundaries**, cratonic plains & ocean basins mark **interiors** → seed plates in low-relief interiors, partition by the existing **`assignPlates()`** JFA Voronoi (boundaries fall on the relief belts), classify crust from elevation, synthesise stress **directly from relief** (velocity inversion is ill-posed). Four pure primitives (amplifyRegion mold, headless-tested): **`buildReliefField(fld,W,H,opts)`** (blurred gradient-magnitude boundary-probability); **`pickPlateSeeds(relief,W,H,opts)`** (lowest-relief cell per aspect-preserving grid cell → interior-biased, even coverage); **`classifyPlateCrust(fld,plateId,nPlates,W,H,sea)`** (mean-elevation → `base` sign, |base|∈[0.55,1] like `buildPlates`); **`reconstructBoundaryStress(fld,plateId,base,relief,W,H,sea,opts)`** (the novel core — structurally parallel to `computeStress`, **reusing `classifyBoundary`** + `gaussBlur`: normal stress `C` = relief magnitude × sign of "updip" (boundary elevation vs the `gaussBlur` regional trend) → convergent on belts / divergent in troughs; shear `S` = along-strike gradient → transpression; `|max|`-normalised) + **`stampVolcanicArcs(boundaryType,W,H,opts)`** (`chamferDist` decay from subduction/arc cells → lights up `buildLithology`'s andesite branch). The orchestrator then runs the **forward downstream stages verbatim** — `distanceToBoundary()`→`ageField`, `computeHeterogeneity()`, `computeResistance()`, `computeFlexure()`, blurred `baseField` — and clears the affordance/graph caches. Leaves `field` untouched (only tectonic/derived layers). After inference, the existing **Tect/Lith/Soil/Water/Resources/Carry Cap/Settlement** views + affordance exports populate for the imported map (no new views). **Bit-identical at defaults to v0.105** (FIELD/TEMP/RENDER cross-version `cmp`-clean at seed 12345/256px — inversion never runs in `generate()`). **615 assertions green** (+23: relief high-on-ridge/determinism, seeds-in-low-relief/determinism, crust ocean-vs-continent, boundary-stress convergent-belt/divergent-trough/mask-at-edge/valid-types/determinism, volcanic-arc decay/empty-zero, payoff: inferTectonics → multi-plate + boundaries + ≥3 lithology types + finite resources + deterministic plateId). Browser pass owed: import a real DEM → *Infer tectonics* → Tect graph follows the mountain belts, Lith/Resources views populate sensibly.

Since v0.105 (`docs/AFFORDANCE_FIELD_PLAN.md`, Phase A step 2): **resource/ore potentials + carrying capacity + settlement suitability.** Six pure resource scalars `[0,1]` — **`buildResourcePotentials(lith,boundaryType,shearField,flowField,biome,fld,rain,age,W,H,sea)`** → `{copper,tin,iron,gold,salt,timber}`: copper = chamfer decay from subduction/arcOO × lith amplifier; tin = old granite (0.70)/metamorphic skarn (0.45); iron = craton BIF (0.65)/bog iron in wet shale (0.55); gold = transform fault+shear (up to 1.0)/sheared granite/old shield background; salt = arid lowland limestone/sandstone (up to 0.90); timber = closed-canopy biomes (rain-scaled 0.40–1.0). **`buildCarryingCapacity`** → `K = soil × tempBell(18°C) × (0.25+0.75·water)`. **`buildSettlementSuitability`** → `P = σ(6·(Z−0.5))` where `Z = 0.35·K + 0.25·W + 0.15·A + 0.10·D + 0.15·C` (accessibility/defensibility/coast-trade). **`findSettlementSeeds`** → greedy local-max with suppression radius (advisory only, never auto-placed). Cached `_resourcePots/_carryCapField/_settleSuitField` cleared each `generate()`/`computeFlow()`; lazy `currentResource/currentCarryCap/currentSettleSuit`. Three new **Resources/Carry Cap/Settlement** debug views (Settlement: warm heatmap + `vctx` gold-dot seed overlay). Seven new exports (`copper/iron/gold/salt/timber_potential.f32`, `carrying_capacity.f32`, `settlement_suitability.f32` + `resource_index.json`). All debug/export-only ⇒ **bit-identical at defaults to v0.104** (FIELD/TEMP/RAIN/RENDER cmp-clean). **592 assertions green** (+37). Browser pass owed: resource/carry/settle debug-view legibility, advisory seed-dot overlay aesthetics.

Since v0.104 (`docs/AFFORDANCE_FIELD_PLAN.md`, Phase A step 1 — the Affordance Field Foundation / AGFK "state layer"): **lithology + soil fertility + water-access raster fields, plus multi-sun hillshade.** First of the civilization-stack workstream (the docs' Module III) — pure raster map-algebra, all debug-view + export only ⇒ **generate()/default render bit-identical to v0.103** (FIELD/TEMP/RAIN/RENDER cross-version `cmp`-clean at a pinned seed). Three pure primitives (amplifyRegion mold): **`buildLithology(fld,age,hetero,volc,crust,resist,rain,W,H,sea,opts)`** → Uint8 rock type from the engine's tectonic proxies (oceanic crust→basalt, volcanic→andesite, hard old basement→granite shield vs young→metamorphic, sedimentary lowlands→limestone/sandstone/shale by moisture; frozen append-only `LITH_KEYS` + `LITH_WEATHER` lookup + `lithIndexManifest`); **`buildSoilFertility(lith,temp,rain,slopeN,age,W,H,opts)`** → `[0,1]` pedological `S = climateBell·moisture·lithWeather·slopeShed·time` (Jenny 1941; `slopeN=slopeAt·W` resolution-independent); **`buildWaterAccess(flowField,fld,W,H,sea,opts)`** → `[0,1]` exponential decay from rivers+coast (reuses `chamferDist`; water cells=1). Cached in `_lithField/_soilField/_waterField` (cleared each `generate()`/`computeFlow()`), built lazily by `currentLithology/currentSoil/currentWaterAccess` for three new **Lith/Soil/Water** `#debugSeg` views (+ `updateLegend` entries) and exported as `lithology_raster.bin`/`lithology_index.json` + `soil_fertility.f32` + `water_access.f32`. **Multi-sun** (Painter D1, the first slice of the NPR phase): `multiSunShade(x,y)` blends primary sun (sunAz, 45°) 0.40 + fill (sunAz+90°, 35°) 0.30 + zenith 0.20 + ambient floor 0.10 (Kennelly & Kimerling) → softer relief, no black voids; gated on `state.viz.multiSun` (default off; a Style-tab checkbox; legacy saves merge it) via `macroShade()` in `surfaceColor` + `buildGridFields` (bakes match) — off ⇒ single-source `shadeFactor` ⇒ bit-identical. 555 assertions green (+22: lithology valid-index/oceanic-basalt/volcanic-andesite/determinism, soil range/↑rain/↓slope/determinism, water-access on-river=1/decay/determinism, manifest coverage, multi-sun in-[0,1]/ambient-floor≥0.10/render-changes/off-bit-identical). Follow-ups (Phase A step 2, v0.105–0.106): resource/ore potentials → carrying capacity → settlement-suitability `P_settle`; lithology/soil/water in LOD tiles + multi-sun in tiles; debug-view + relief aesthetics need a browser pass.

Since v0.103 (sea/lake distinction + biome-coverage completion — user request): **water bodies + the missing Cartalith biomes.** Pure **`buildWaterBodies(fld,W,H,sea,opts)`** (amplifyRegion mold) returns a Uint8 per cell — 0 land, 1 **sea** (the largest connected below-sea component, world-wrap aware), 2 **lake** = (a) any *other* below-sea component (enclosed inland sea) **plus** (b) above-sea **depressions that pool water** via a self-contained priority-flood fill (`depth>lakeDepth`, default 0.004), **moisture-gated** (`rain≥lakeRain`, default 0.22) so arid basins stay dry as salt flats. `_waterBody` cache cleared each `generate()`/`computeFlow()`. **`'lake'` is appended to the FROZEN `BIOME_KEYS` as index 13** (append-only; `BIOME.lake` added; `classifyBiome` never returns it) — so `buildBiomeRaster` now emits **0 = open sea, 13 = lake, 1–12 = climate** (a deliberate refinement of the old "0 = all water" — the `biome_index.json` manifest documents it for Cartalith). **CBiome gaps filled**: `buildCartBiome` now reaches **Coastal Lowland (1)** (`r<0.05`), **Wetlands/Marshes (4)** (wet+low+flat), **Cold Desert/Badlands (9)** (`desert` key split by `T<10`), and **Lake (14)/Ocean (15)** via water bodies — so the auto-fill now covers **13/15** Cartalith biomes (only fantasy *Ruined Wastes* unreached). `buildCartTerrain` maps **all water (sea+lake) → 0**; the **Terrain** debug view paints lakes a lighter blue than sea. **Bit-identical at defaults to v0.102** (FIELD/TEMP/RENDER cross-version `cmp`-clean — `buildBiomeRaster` only runs on the opt-in icons/SDF/export paths, never the default render). 527 assertions green (+13: water-body sea-is-largest/enclosed-lake/depression-lake/moisture-gate/determinism, raster 0⇔sea·13⇔lake, manifest lake@13, CBiome/CTerrain water mapping). Follow-ups: lakes in LOD tiles (`renderBiomeTileRGBA` classifies inline, no water bodies yet); icons-on/SDF-biomes-on now reflect lakes (improvement, not bit-identical for those opt-in paths); lake thresholds + the new biome look need a browser pass.

Since v0.102 (Cartalith terrain layer, debug-only — user request): **a second auto-filled Cartalith paint grid — TERRAIN ("surface underfoot" for travel, parallel to v0.078's CBiome).** `CART_TERRAINS`/`CART_TERRAIN_COLS` port Cartalith_V1.914's frozen 13-entry `TERRAINS` storage order + hex colours (1-based; 0 = ocean/unpainted). **`buildCartTerrain()`** auto-classifies each land cell from **slope + elevation + temperature + moisture** (`sn=slopeAt(x,y)·GW` ⇒ resolution-independent): Snow/Ice (T<−2) → Mountain Trails/Pass (r>0.68, steep/not) → Rocky (sn>2.5) → Hills (r>0.42 or sn>1) → Swamp/Marsh (wet+low+flat) → Deep Sand/Desert Hardpack (hot+dry) → coastal Deep Sand beach → Open Plains default. The four **human-made surfaces (Paved Road/Dirt Track/Forest Path/Ruins) never auto-generate** (asserted); only the 9 natural ones do. `_cartTerrain` cache cleared each `generate()` (next to `_cartBiome`); rendered as a new **Terrain** `#debugSeg` button (`currentCartTerrain`, ocean shown as deep-water blue) + a legend entry. **Debug-only/render-only ⇒ generate() + default render bit-identical to v0.101** (the new view never builds or draws unless selected). 519 assertions green (+5: 0..13 range, ocean→0/land-always-painted, no human-made surfaces, determinism, opaque render). Terrain-classification aesthetics need a browser pass.

Since v0.101 (loading messages + resource overlay — user request): **witty/ironic loading messages + Shift+D debug overlay; UI-only ⇒ bit-identical to v0.100** (514 assertions green). The `.busy` overlay became a two-line display (`#busyWit` amber headline + `#busyLabel` dim functional label). **`LOAD_MSGS`** (module global object) holds 9 named pools (init/height/tectonics/erosion/hydrology/climate/render/optimization/validation) plus `rare` (~30 messages, 12% chance) and `xrare` (~27 easter-eggs, 4% chance). **`pickLoadingMsg(hint)`** picks from the hinted pool with last-message dedup (6 retries). **`_LABEL_HINT`** maps functional labels (e.g. `'eroding…'→'erosion'`) to pool keys. **`showBusy(label)`** replaces all former `busy.textContent=…; busy.style.display='flex'` call sites (workers update `busyLabel.textContent` directly for progress %). **`hideBusy()`** replaces `busy.style.display='none'`. **Resource overlay** (`#resOverlay`, top-right): toggled by **Shift+D**; shows resolution + MP, Float32Array memory in MB, GPU mode (R32F/RGBA32F/off), IDB + Worker availability, LOD state, active opt-in features (OrogT/Seasons/Currents/Geoid/Tides/AlbFB/DynLith), last-pass ms + device. `updateResOverlay()` is called after every `renderNow()` via a thin wrapper (only writes to DOM when visible). No pipeline functions touched.

Since v0.100 (GUI overhaul — user request): **simplified, more dynamic sidebar; no pipeline change ⇒ bit-identical to v0.099** (field/temp/`renderNow` hashes byte-identical, cross-version verified). Three pain points addressed. **(1) Import menu**: a header **`Import ▾`** dropdown (`#importMenuBtn`/`#importMenu`, single capture-phase outside-click close) gathers the four scattered import triggers — Load heightmap (`#loadBtn`), Load project .zip (`#loadZipBtn`), Import asset pack (`#packBtn`), Import atlas (`#atlasImportBtn`) — all keeping their IDs/handlers (moved DOM only); the hidden file inputs (`#file`/`#zipFile`/`#packFile`/`#atlasFile`) are centralized in `<header>`. **(2) Tiles section**: all LOD/tiling/atlas/region-refine controls extracted from the old "Source" into one dedicated **Tiles & LOD** section — *Live preview* (Tiled-LOD toggle, tile-size, Refine, burn/micro), *Export tile grid* (cols×rows, size, gzip + **`#lodShowGrid`** "Show tile borders" + a **live size estimate** `#tileSizeEst` via pure `updateTileSizeEst()` = `tiles·(ts²·2·gz + ts²·4)` bytes), with Atlas + Chunk-debug as collapsed `<details class="acc">` accordions. **`drawExportTileGrid()`** (module global `_showExportGrid`, default false) strokes the cols×rows export grid on `vctx` in `renderNow` (gated `_showExportGrid && !_lodOn`, after icons) — a dashed preview of how Refine & export will split the map. **(3) Deadweight/structure**: the two Calibrate sections merged into one **Scale & calibration**; **Performance** folded into Source; the dense **Erosion** section's five sub-ops wrapped in `<details>` accordions (Droplet open, rest collapsed); the **View** section renamed **Map view** with the 18-button debug picker in a collapsed **Debug overlay** accordion; **Save & export** slimmed to **Export image & project** (region-refine moved to Tiles, Load .zip moved to Import menu); Style tab gained *Rendering*/*Overlays* group labels. All HTML/CSS + 3 small JS additions (dropdown toggle, size estimate, grid overlay) — no pipeline functions touched. 514 assertions green (UI not headlessly testable; pipeline unchanged). Browser pass owed: dropdown/menu behaviour, the tile-border preview + live size estimate, accordion ergonomics.

Since v0.099 (GPU memory): **R32F GPU texture migration.** The WebGL2 compute path already used **RGBA32F** full-float ping-pong textures (`EXT_color_buffer_float` required at init) — so this is a **4× texture memory/bandwidth win** (16→4 B/px), not a precision change. `GPU.init` now probes R32F color-renderability (`_probeR32F`: a 2×2 `R32F` FBO completeness check) and, when it passes, `_mkTex`/`_tempTex` allocate `R32F`/`RED` and `_up`/`_down` use single-channel `Float32Array(w·h)` (`gl.RED`); otherwise the proven `RGBA32F`/`RGBA` path stays. **No fragment-shader changes** — all 8 shaders already read/write only `.r`, so the format is transparent to GLSL. Safety: if the R32F round-trip `_selfTest` fails, init falls back to RGBA32F before disabling the GPU (so a flaky R32F driver never costs the whole GPU path); the status line reports `R32F ·` / `RGBA32F ·`. **CPU paths untouched** — the headless stub has no WebGL2 context, so every GPU op already runs its CPU fallback; 514 assertions green and field/temp/render byte-identical to v0.098. **The GPU R32F path itself can't be tested headlessly — needs a manual browser pass** (toggle GPU, run thermal/diffuse/blur/temp/coastal, confirm parity + the R32F status tag). Completes the "finish everything except the merge" push (SDF polish v0.097 · physical tails v0.098 · R32F v0.099).

Since v0.098 (`docs/research/physical-model-tails.md`): **physical-model tails — G4 tidal sedimentation, L4 dynamic lithology, disturbance debug views.** All opt-in/gated/debug-only ⇒ default generate + render **bit-identical to v0.097** (field/temp/land-render hashes byte-identical). **G4** (completes the gravity workstream): pure **`applyTidalSedimentation(fld,tide,sea,W,H,opts)`** accretes mudflats in the intertidal band (submerged cells with depth<tidal-range) toward sea level — `accr=min(sea−h,k·tr·(1−depth/tr))`; opt-in **Tidal flats (G4)** erosion button (`tidalFlats`, requires Tides on, never auto-runs). **L4**: pure **`recomputeResistanceAfterErosion(resist,pre,post,W,H,opts)`** raises `resistanceField` toward a basement max ∝ exhumed column (`+k·(pre−post)`), called in `eroFinish`/`evolveCoupled` only when **`state.tect.dynamicLithology`** (default false → resistance untouched → bit-identical; legacy saves merge it) → differential erosion (benches/inselbergs) over repeated Evolve. **Disturbance**: two read-only hazard debug views (currentWindField/Tide idiom, never serialized) — **`buildWindThrowField`** (wind×canopy[closed-canopy biomes 3/4/5/6/12]×slope, null over ocean) + **`buildFloodField`** (TWI+discharge+base-level proximity), with `currentWindThrowField`/`currentFloodField` caches, **Wind-throw**/**Flood** `#debugSeg` buttons + legend; default `off` ⇒ neither built ⇒ render unchanged. 514 assertions green (+15). Browser pass owed: tidal-flat shape, exhumation benches, hazard-overlay legibility.

Since v0.097 (`docs/research/sdf-control-fields.md`, finishes the SDF deferred work): **SDF in bakes + LOD tiles, sub-pixel coastline AA, JFA Euclidean backend.** (1) The coast/river tints + biome `ecoK` were factored into shared helpers **`applyCoastRiverSDFv`/`sdfEcoKv`** called by **both** `surfaceColor` (screen) **and** `bakePixel` (PNG export), with the SDF fields now also built in `buildGridFields` → **bakes match the screen**. (2) `renderBiomeTileRGBA` reconstructs **river + biome SDFs locally per tile** (river from coarse `flowField` sampled at world coords; biome from a per-tile raster classified at the sampled climate) → bands + ecotones at constant world width at any zoom, alongside the existing local coast SDF. (3) **Sub-pixel land/water AA**: when the coast SDF is on, the biome renderer blends sea↔land over a `smoothstep(-0.6,0.6,_coastSDF)` band instead of the hard `isWater` step. (4) **`jfaDist(seedMask,W,H)`** — true-Euclidean Jump Flooding (Rong & Tan 2006; generalized from the `assignPlates` plate-Voronoi JFA); `buildCoastSDF/buildRiverSDF/buildBiomeBoundaryDist` take `opts.euclid` and the visual consumers use it (chamfer stays the builder default + the wave-field path; the 1-√2 chamfer over-estimates Euclidean by ≤8.24%). **All four render-only/opt-in ⇒ off bit-identical to v0.096** (main-map land-render, `bakePixel`, AND LOD tile-render hashes all byte-identical at defaults). 500 assertions green (+9: jfaDist exact-Euclidean/seed-0/line-offset/determinism/≤chamfer/within-8%; SDF-euclid sign + magnitude). Browser pass owed: baked-SDF parity, tile river/biome bands, AA coastline, JFA-vs-chamfer aesthetics.

Since v0.096 (`docs/research/sdf-control-fields.md`): **signed distance fields as geometric control fields (coast + rivers + biomes).** Generalizes the unsigned `computeCoastDistance` chamfer into reusable **pure** primitives — **`chamferDist(srcMask,W,H)`** (the shared two-pass engine), **`buildCoastSDF(fld,W,H,sea)`** (signed: <0 inland, 0 at shore, >0 offshore — one field, both sides), **`buildRiverSDF(flow,W,H,opts)`** (signed channel distance from the `flow>thresh` mask), **`buildBiomeBoundaryDist(biome,W,H)`** (ecotone half-width = distance to nearest differing-biome cell). All **render-only, opt-in, off ⇒ bit-identical** (main-map land-render hash AND LOD tile-render hash both byte-identical to v0.095 at defaults — the engine keeps the binary mask for physics; SDF is pure visual reconstruction). Consumers, gated on three Style sliders (`state.viz.sdfCoast/sdfRivers/sdfBiomes`, default 0; legacy saves merge them): **B2** coast → distance-banded shore-sand + coastal-plain tint at constant *world-relative* width (bands in 256px-equiv cells, `S=GW/256`, so they read the same at any resolution); **B3** river → bank/wetland/floodplain margins from one SDF; **B4** `landColorCore` gained a trailing **`ecoK`** param (default 1 ⇒ bit-identical) that widens the climate jitter near biome boundaries for distance-proportional ecotones; **B5** reverse-mipmap coastlines — `renderBiomeTileRGBA` computes a **local** coast SDF from the tile's own heightmap (like the local AO/crest passes) and applies the coast bands in world units, so the coastline holds a constant real-world width at every zoom (seam-safe via shared tile-boundary heights). Chamfer is "good enough" (≤1-cell anisotropy); **JFA** (`assignPlates`) is the noted Euclidean-precision upgrade path. SDF tints are screen-only (like the river/minor-channel overlays) ⇒ `bakePixel` stays bit-identical. 491 assertions green (+18: SDF sign/zero-at-coast/monotonic/determinism for all three builders, uniform-biome no-boundary, live consumer fires near-shore + restores off). Browser pass owed: the coast/river/biome aesthetics + LOD-zoom constant-width coastlines. Deferred: river/biome SDF in LOD tiles, SDF in PNG bakes, sub-pixel land/water AA.

Since v0.095 (`docs/research/multiscale-rivers.md` Phases 2–3 — **the multi-scale river workstream is now feature-complete**): **per-tile micro-erosion + delta channel sharpening.** Two pure, self-contained additions on top of v0.094's `burnChannels`, both LOD-only (never touch the base `field`). **Phase 2 — `tileMicroErodeKernel(fld,W,H,P,fixed)`** (no module globals, worker-ready) runs a small droplet pass on an amplified tile to add natural terracing/meanders inside burned channels; the `fixed` Uint8Array pins the **border ring** so the tile edge stays byte-identical to its neighbours' (**seam-Δ=0 preserved**). `tileErode(tile,W,H,opts)` is the thin wrapper that builds the border mask + default droplet params; behind a new **"Micro-erode tiles"** LOD toggle (`_lodMicroErode`, default off, slower). **Phase 3 — `sharpDelta(tile,W,H,coarseFlow,cW,cH,bounds,sea,opts)`** finds **coarse-flow local maxima** (the dominant distributary channels, Bolla Pittaluga 70/30 winners; the local-max test runs in **coarse-cell space** so it's identical for any tile covering that cell → seam-safe) and carves them an extra `sharpK` deeper **only in the delta zone** (`tile<sea+zoneH`), giving distinct channel-vs-floodplain contrast; rides the existing **"Burn river channels"** toggle. Both wired into `pyramidTile` (sharpDelta after `burnChannels` in the `opts.coarseFlow` block; `tileErode` when `opts.microErode`). **Off ⇒ bit-identical to v0.094** (field+temp checksums identical, cross-version verified — the new ops only fire on the LOD refine path, never in `generate()`). 473 assertions green (+12: border-pin/seam safety, interior change, finiteness, determinism, tiny-tile no-op; sharpDelta zero-flow no-op, deepens local-max, delta-zone gate, never-raises, floor clamp, seam-Δ). Browser check: toggle both → micro-eroded carved channels + distinct distributaries at high zoom.

Since v0.094 (`docs/research/multiscale-rivers.md` Phase 1): **AGREE-style river channel burning into LOD tiles.** Pure `burnChannels(tile, W, H, coarseFlow, cW, cH, bounds, sea, opts)` (after `refineTile`/`amplifyRegion`) samples the coarse `flowField` bilinearly at each tile pixel, computes hydraulic-geometry width (`W ∝ Q^0.5`, Lacey 1930) and burn depth (∝ discharge), and stamps a parabolic cross-section groove into the amplified tile — so rivers that were blurry smears at z=3–4 resolve into crisp carved valleys at high zoom. Applied in `pyramidTile` when `opts.coarseFlow` is provided; wired to a **"Burn river channels"** toggle in the Tiled LOD panel (default off → `_lodBurnRivers=false` → bit-identical to v0.093). Never touches the base `field` — LOD-only. Research foundation: Leopold-Maddock hydraulic geometry, Hellweger & Maidment AGREE stream-burning, Houdini multi-scale erosion cascade. 461 assertions green (+6: zero-flow no-op, high-flow depression, far-cell unchanged, never raises, floor limit, seam-Δ). Phase 2 (per-tile micro-erosion) and Phase 3 (delta bifurcation) deferred. Browser check: toggle "Burn river channels" → rivers become crisp carved valleys at high zoom; delta fans resolve into multiple channels.

Since v0.093 (user bug report — debug legend doesn't always update): **`updateLegend()` now covers all 16 debug views.** Four views were missing entries — `oro`, `geoid`, `tides`, and `cbiome` — so switching to them left the legend showing the biome/hypso fallback text from the previous view. Added legend entries: `oro` uses `divColor` swatches (warm = mountain belt / uplift, neutral = no signal, cool = trench / basin / graben + "requires Structured orogeny" note); `geoid` uses `divColor` swatches (warm = geoid bulge above mean, cool = depression below mean); `tides` shows `[235,170,30]` → large range / shelf and `[20,70,150]` → small range / open ocean; `cbiome` lists 6 representative Cartalith biome swatches from `CART_BIOME_COLS`. **UI-only (no logic, no field change): bit-identical to v0.092.** 455 assertions green.

Since v0.092 (user bug reports — LOD/sculpt/overlay polish; render-only + handler-only): **(1) freehand sculpt is gated to the Sculpt tab** — a new `_activeTab` (set by the tab handler, default `'terrain'`) gates the canvas `pointerdown`/`pointermove` sculpt path so dragging in the Terrain/Style tabs no longer edits the heightmap (the long-standing "dragging sculpts everywhere" bug); leaving the Sculpt tab cancels any in-progress stroke. **(2) LOD ocean matches the main map** — `renderBiomeTileRGBA` now smooths the tile's sea floor (box-blur, radius ≈ tilePx/48) and hillshades **that** smoothed bathymetry (mirroring `smoothSeaH`/`seaShadeFrom`), with resolution-independent water grain (`vnoise(wx·25.6/GW,…)`, the v0.068 frequency) — killing the "pixelated ocean in Tiled LOD" report; the land/water mask still reads the raw tile so coasts stay crisp. **(3) chunk-debug overlay is legible** — bolder grid strokes + stronger colour tint + faint child-quadrant guide lines so the tiling structure reads even when one chunk fills the view (zoom in / raise working resolution to subdivide further). **Main-map render bit-identical to v0.091** (field/temp/`bakePixel` byte-identical — the tile renderer is LOD/export-only, never `renderNow`'s `bakePixel` path); the LOD-tile ocean change + overlays + sculpt-gating are browser-verified. Audited headless: all coupling loops (L1/L2/L3/L6), the tiling engine (seam Δ=0, pyramid, atlas round-trip), and a new save→serialize→default-merge round-trip for every v0.086–0.092 param all green. 455 assertions.

Since v0.091 (`docs/research/system-coupling-audit.md` §6, L6 — **the last of the audit's prioritised coupling loops**): **cryosphere ↔ climate ice-albedo feedback.** `state.climate.albedo` (slider, default **0 → off → bit-identical**; legacy saves merge it). Pure **`applyCryosphereAlbedo(temp,k)`** runs a damped fixed-point `T = base − k·ALB_COOL·ice(T)` (`ALB_COOL=9°C`, `ice=smoothstep(1,−6,T)`, 6 passes at 0.5 damping → stable) so ice cover cools further → grows more ice: polar caps and high massifs darken/cool and broaden. Called at the tail of `computeTemperature` (no-op when `albedo=0`); the **GPU temperature path is bypassed when `albedo>0`** (like the geoid), so the feedback stays on the CPU `tempField`. An **Ice albedo** Climate slider (`cparam`, live like lapse rate). **Off ⇒ bit-identical to v0.090** (field/temp/`bakePixel` byte-identical, cross-version verified). 451 assertions green (k=0 no-op, cools cold cells / spares warm, scales with strength, deterministic; engine: cools polar cells, never warms, finite). Albedo aesthetics need a browser pass.

Since v0.090 (`docs/research/tectonic-feature-graph.md` T5 — **the tectonic-feature-graph workstream T0–T5 is now complete**): **orogeny tuning + archetype hooks.** `buildOrogenyField` gained `opts.foldK` (collision fold-ripple amplitude; default **0.16**) and `opts.trenchK` (subduction/arc trench-depth scale; default **1.0**) — both reproduce the v0.089 kernel bit-exactly when omitted (asserted). `state.tect.foldIntensity`/`trenchDepth` (default 1.0; legacy saves merge them) drive two **Tectonics** sliders, threaded as `foldK:0.16·foldIntensity, trenchK:trenchDepth` from `generate()` + the Orog preview. **Archetype wiring**: `deriveFromWorldStructure()` now turns on `tectonicGraph` and maps `foldIntensity=0.6+tectonicEnergy` / `trenchDepth=0.7+0.8·oceanDepth` from the active archetype's params (more energy → stronger folding, deeper oceans → deeper trenches). Per invariant 5 this only fires from the WS handlers, so the **default (WS-disabled) world stays bit-identical** — and graph-on with default sliders also reproduces v0.089 exactly (both asserted via the `cmp` harness). 442 assertions green (default/explicit foldK·trenchK parity, fold ripple ↑ with foldK, trench depth ↑ with trenchK, archetype mapping). Mountain aesthetics need a browser pass.

Since v0.089 (`docs/research/terrain-rendering-enhancement.md` R4 — **the R-series rendering framework is now complete, R1–R4**): **ridged-noise elevation-weighted relief detail.** Pure **`ridgedFbm(x,y,oct,s)`** = the engine's ridged multifractal with a configurable octave count (`ridgedFbm(…,6,…)` is bit-identical to the legacy `ridged()`, asserted; `ridged()` itself untouched so the `amplifyRegion` generation path stays byte-stable). A gated **Ridged relief** Style slider (`state.viz.ridgedRelief`, default **0 → off → bit-identical**; legacy saves merge it) adds a folded-crease brightness modulation in `landColorCore` from `ridgedFbm` at world coords (seamless across tiles, §8), weighted by **H² (=r²)** so it concentrates in the highlands and never contaminates lowlands (framework §2 `R_weighted=R·H²`). **Off ⇒ bit-identical to v0.088** (field/temp/`bakePixel` byte-identical with deterministic rain, cross-version verified). 436 assertions green (`ridgedFbm` range/determinism/octave-count/legacy-match; relief gated, highland changes, H²-gated lowland untouched). Ridged-relief aesthetics need a browser pass.

Since v0.088 (`docs/research/terrain-rendering-enhancement.md` R3): **procedural texture synthesis + minor-channel flow lines** — two opt-in Style sliders, both default **0 → off → bit-identical** (legacy saves merge `texture:0, minorStreams:0`). **Surface texture** (`state.viz.texture`): a three-frequency `fbm` colour modulation `C·(1+0.1·T)` (1:4:16 frequency stack, framework §7) inside `landColorCore`, evaluated in **world coords** (`px,py`) so tiled outputs stay seamless (§8) and bakes/tiles inherit it via the shared `landColorCore`. **Minor channels** (`state.viz.minorStreams`): subtle blue-grey threads for low-accumulation cells in the band below the trunk river threshold (`0.05·thresh … thresh`, framework §4) — a screen overlay in `surfaceColor` like the trunk rivers (not baked, matching the existing river-overlay behaviour). **Off ⇒ bit-identical to v0.087** (field/temp/`bakePixel` byte-identical with deterministic rain, cross-version verified). 429 assertions green (texture gated/modulates/deterministic/spatially-varying; minor channels gated/blue-grey band). Texture grain + channel legibility need a browser pass.

Since v0.087 (`docs/research/terrain-rendering-enhancement.md` R2): **ridge crest enhancement + slope-material refinement** — two opt-in Style sliders, both default **0 → off → bit-identical** (legacy saves merge `crest:0, rockSlope:0`). **Ridge crests** (`state.viz.crest`): pure **`buildCrestField(fld,W,H,sea,sx,sy)`** flags convex (Laplacian<0) ∩ steep cells, strength = convexity × **`G^1.5`** slope weight (the framework §3 rock-weight exponent realised as the crest's slope term; §6 convex detection); `sx,sy` = coarse-cells-per-sample (1 on the main map ⇒ exact, `cx,cy` on amplified tiles) so the slope/curvature scale is sampling-independent. Built into `_crestField` in the `renderNow` prologue + `buildGridFields` (biome map only, geoid-adjusted, null when off), applied as thin bright sunlit-rock strokes via **`applyCrest(c,s)`** in `surfaceColor`/`bakePixel`/`renderBiomeTileRGBA` (tile path computes a local crest). **Slope rock** (`state.viz.rockSlope`): a gated `G^1.5`-weighted rock recolour tint inside `landColorCore` *after* the material mix (leaves the Σ=1 `materialWeights` untouched; tiles inherit it for free). **Off ⇒ bit-identical to v0.086** (field/temp/`bakePixel` byte-identical with deterministic rain, cross-version verified). 423 assertions green (crest fires on convex shoulders / ignores concave+flat / land-only / deterministic / sx,sy-scaled; applyCrest brighten+clamp; slope-rock gated). Crest/rock aesthetics need a browser pass.

Since v0.086 (`docs/ATLAS_ARCHITECTURE.md` Phase 4): **portable atlas export/import** — the per-browser IndexedDB atlas now round-trips to a self-contained `World/` ZIP and back. Pure cores (headless-tested): **`atlasChunkFile(z,col,row,ext)`** (path `World/LOD{z}/{z}_{col}_{row}.{bin|bin.gz|png}`) and **`buildAtlasManifest(wk,chunks,opts)`** (schema-1 `{kind:'cartalith-atlas', worldKey, version, tileSize, count, params, chunks:[{z,col,row,w,h,bin,png,gzip}]}`). The two halves are shim-tested: **`atlasExportEntries(wantGzip)`** gathers every baked chunk for `_worldKey` from IDB (`atlasKeysForWorld`+`atlasGet`) → rg16 bin (gzip via `gzipBytes` when available) + visual PNG (from the stored `Blob`) + `World/atlas.json` (carrying `serializeState()` params); **`atlasImportEntries(zip)`** reads a `unzipAny` archive, gunzips/decodes each chunk, `atlasPut`s it under the manifest's worldKey, repopulates `_atlasBaked` when it matches the current world, and writes an explicit meta record. Browser shells `exportAtlasZip()`/`importAtlasZip(file)` + **Export atlas… / Import atlas…** buttons. Import to a non-current world lands in IDB and surfaces on the next matching `generate()` via `atlasSyncWorld`. **Pure additions + UI ⇒ bit-identical to v0.085** (field/temp byte-identical cross-version). 412 assertions green (chunk-file naming, manifest fields, full IDB→ZIP→IDB round-trip with ≤1-LSB height + meta). Download/file-picker DOM needs a browser pass.

Since v0.085 (user request — heightmap brushes belong only in the Sculpt tab): **unified sculpting brush.** Two disconnected brush selectors existed — the **Sculpt tab**'s 8-mode `brushSeg` (raise/lower/smooth/cliff/ridge/canyon/mesa/volcano on the base `field`, via `sculpt()`) and a weaker 3-mode `lodBrushSeg` (raise/lower/smooth on amplified LOD tiles, via `brushHeight`, its own `_lodBrush` state). v0.085 **deletes `lodBrushSeg`/`_lodBrush`** and upgrades `brushHeight(data,w,h,cx,cy,r,strength,mode,opts)` to the **full 8-mode sculpt-quality kernel** (same falloff `(1−dN)^1.6` and per-mode formulas as `sculpt()`; `opts={nx,ny,centerH}` carry stroke normal for cliff/ridge/canyon + stamp reference height for mesa). `editTileAt` now drives the **shared `state.brush`** (no `*0.5` strength fudge — the `0.02·strength` coefficient matches `sculpt()`), computes a per-stroke normal from `_lodPrevGx/_lodPrevGy` (mirroring `sculpt()`'s `_prevGx`), and the LOD `pointermove` skips `STAMP_BRUSHES` (mesa/volcano stamp once per tap). The LOD **Edit tiles** checkbox (`lodEditChk`) **moves from the Terrain tab to the Sculpt tab** (renamed "Edit LOD tiles") so every heightmap-modifying control lives in one place; its handler is unchanged (`getElementById`). `brushHeight` stays a **pure primitive** (no globals; `opts` defaults to `{}`; unknown mode → raise for back-compat). **`generate()` bit-identical to v0.084** (field+temp byte-identical cross-version; rain's pre-existing `Math.random()` nondeterminism is unrelated). 400 assertions green (8-mode brushHeight: volcano cone / mesa max-semantics / ridge crest / canyon cut / cliff two-sided / omitted-mode raise; existing tile-edit + undo unchanged). LOD-edit interaction needs a browser pass.

Since v0.084 (`docs/research/terrain-rendering-enhancement.md` R1): **ambient occlusion** — the depth cue the framework's §5 calls out (the engine already does multi-scale hillshade via `landColorCore`'s 0.40·macro+0.40·meso+0.20·micro blend; AO was the genuine gap). `state.viz.ao` (slider, default **0 → off → bit-identical**; legacy saves merge `ao:0`). Pure `buildAOField(src,k)` box-blurs the (geoid-adjusted) heightmap to a broad neighbourhood mean and sets a per-cell multiplier `aoMul(H̄_broad−H, k)=1−k·clamp01((H̄−H)·AO_GAIN)` clamped to `[1−AO_MAX,1]` — a cell sitting below its surroundings (basin/valley) darkens; ridges stay at 1 (no blow-out). `landColorCore` gained a trailing `ao` param (default 1 ⇒ unchanged) multiplied into the final colour; `surfaceColor`/`bakePixel` pass `_aoField` (built in the `renderNow` prologue + `buildGridFields`, **biome map only**, null when off), and `renderBiomeTileRGBA` computes a **local** AO from the tile's own heightmap (reusing `boxH`/`boxV`). A **Style → Ambient occlusion** slider. **Off ⇒ bit-identical to v0.083** (field/temp/rain/`bakePixel` byte-identical, cross-version `cmp`-clean). 394 assertions green (aoMul darkens valleys / spares ridges / scales with strength / clamps; AO darkens-only and is identity when off). AO aesthetics need a browser pass.

Since v0.083 (`docs/ATLAS_ARCHITECTURE.md`, Atlas — Phase 3): **biome-coloured LOD/atlas tiles.** Tiles previously rendered relief-only (`renderHeightTileRGBA` = hypso + hillshade). New **`renderBiomeTileRGBA(tile,W,H,bounds)`** reuses the on-screen **`landColorCore`** material render: height + slope + macro/meso **hillshade come from the tile's own amplified heightmap**; temperature/moisture/flow/aspect/curvature are **sampled from the coarse climate fields at the tile's world coordinates** (`bounds` = the coarse-coord rect the tile covers); noise + vignette + splat UV use world coords so adjacent tiles stay seamless and match the main map. Slope is rescaled to coarse-cell units (`/(2·cx)`) so `materialWeights` thresholds behave exactly as on the main map. It's a pure RGBA compute (like `renderHeightTileRGBA`) → **headless-tested**. **`drawLODView` picks the renderer by `state.mode`** — **Biome** → `renderBiomeTileRGBA`, **Relief (hypso)** → the height ramp — so the existing View toggle now drives the LOD/atlas tile look (no new UI); `_splatK` is set in the LOD prologue so pack textures splat into tiles too. `tilePngBytes` gained an optional `bounds` arg → the **atlas bake PNG** (`bakeVisibleTiles`) and **region-export PNGs** (`exportRegionTiles`, per-tile sub-bounds) now store the biome visual when in Biome mode. **Default render untouched** (the change only affects the LOD view + explicit bakes/exports, all gated behind `_lodOn`/user action) ⇒ **bit-identical to v0.082** (field/temp/rain/`bakePixel` byte-identical, cross-version `cmp`-clean). 387 assertions green (biome tile finite/opaque/deterministic, differs from relief, ocean-blue vs land). LOD biome tiles need a browser pass.

Since v0.082 (`docs/ATLAS_ARCHITECTURE.md`, Atlas — Phase 2b): **cross-session atlas persistence + status + metadata.** v0.081 only discovered baked chunks by baking *this session*; now `generate()` (which runs at startup) fires **`atlasSyncWorld()`** — a fire-and-forget IDB query (`atlasKeysForWorld(wk)` via the `world` index `getAllKeys`) that repopulates `_atlasBaked` from IndexedDB for the current `_worldKey`, so bakes survive a page reload / regenerate (same seed+params ⇒ the chunks render straight from the atlas, no Refine). It re-checks `wk===_worldKey` after each await so a fast world-switch can't repopulate a stale set. A per-world **metadata record** (`atlasMetaRec`/`atlasMetaKey` = `'meta:'+wk`, **no `worldKey` field** so the `world` index excludes it from chunk queries; `atlasPutMeta`/`atlasGetMeta`) round-trips `{ts,ver,chunks,time}` — written after `bakeVisibleTiles`, read in sync, deleted by clear; it powers an **`#atlasStat` status line** (`updateAtlasStatus`: "Atlas: N chunks baked (this world)" / "empty" / "— (no IndexedDB)"). `atlasClearWorld` refactored to `atlasKeysForWorld`+per-key `atlasDelete`(+meta) (cursor-free → shimmable). `_atlasMeta` is transient (never serialized). **Verification**: a test-only in-memory IndexedDB shim (`__makeIDBShim` in `tests/stub_head.js`, **not** auto-installed → default suite + cmp stay on the genuine no-IDB path) drives a full headless round-trip (put 3 chunks + meta → `atlasKeysForWorld` excludes meta → `atlasGet`/`atlasGetMeta` round-trip → `atlasSyncWorld` rediscovers across a simulated fresh session → `atlasClearWorld` wipes chunks+meta). **Off / no-IDB ⇒ bit-identical to v0.081** (field/temp/rain/render byte-identical, cross-version `cmp`-clean; `atlasSyncWorld` is async with no field/render effect). 381 assertions green. IDB persistence/status UI need a browser pass.

Since v0.081 (`docs/ATLAS_ARCHITECTURE.md`, Hierarchical Reverse-Refinement Atlas — Phase 2a): **IndexedDB-backed chunk baking + images-override generation.** The Phase-1 `_atlasBaked` stub Set is now wired to a real **IndexedDB store** (`cartalith_atlas`/`atlas`, keyPath `key`, `world` index) holding baked chunks (16-bit `rg16` height + visual PNG `Blob`). Pure cores (headless-tested): **`worldKey()`** = FNV-1a hex hash over the render-affecting state subset (`GW,GH,world,seaLevel,peakM,tect,world_structure,volc,crater,planet,climate,erosion,stream`) — the atlas namespace; **`atlasKeyStr(wk,ts,z,col,row)`**/`atlasChunkKey(z,col,row,ts)` (worldKey-namespaced, distinct from the `_lodGen`-keyed `_lodCache`); **`atlasEncodeChunk`/`atlasDecodeChunk`** (reuse `packHeight16`/`unpackHeight16`, round-trip ≤1 LSB); **`bakedCover(z,col,row)`** (walks the `chunkParent` chain → true if the chunk or any ancestor is baked). Browser-only, feature-detected (`typeof indexedDB==='undefined'` → no-op): `atlasOpen`/`atlasPut`/`atlasGet`/`atlasClearWorld`, `atlasLoadImg` (lazy decode into the transient `_atlasImg` draw cache, never serialized), and `bakeVisibleTiles()` (renders the visible LOD tiles → IDB, marks `_atlasBaked` only so the next paint exercises the real read-from-IDB path). **Render rule** (`drawLODView`): a baked chunk is served from the atlas (image authoritative); `refineVisibleTiles` skips any tile where `bakedCover` is true (no refinement beneath baked). `chunkState` reads the new atlas key. `generate()` recomputes `_worldKey` and clears the atlas only when the world changes (same params ⇒ bakes survive the regenerate); cross-session/IDB rediscovery on generate is Phase 2b. New **Bake / Clear atlas** buttons in the Source/LOD panel. **Off / no-IDB ⇒ bit-identical to v0.080** (field/temp/rain/render byte-identical, cross-version `cmp`-clean). 369 assertions green. IDB/canvas/bake flow need a browser pass.

Since v0.080 (user bug report — LOD mode broke zoom and terrain painting): **LOD interaction fix + UI tidy.** (1) **Bug fix**: the normal sculpt `pointerdown`/`pointermove` handlers were missing `_lodOn` guards, so clicking in LOD mode both sculpted the hidden main `field` and fired the LOD pan/edit handler. The wheel and pinch-zoom also called `zoomAt`/`viewT` without checking `_lodOn`, but `applyView` forces `transform=none` while LOD is on → silently corrupt `viewT.scale`. Fixes: sculpt `pointerdown`/`pointermove` gain `if(_lodOn)return;`; the wheel handler routes to continuous `_lodZoom` scaling when `_lodOn`; the pinch `touchmove` routes to LOD pan+zoom when `_lodOn`; the `lodChk` change handler defensively clears `painting`/`panDrag` on toggle. The +/− zoom buttons already gated correctly. (2) **UI tidy**: `showRivers`, `smoothRivers`, and `sharpBiomes` checkboxes were misplaced in the *Glacial erosion* panel. They are moved to the *Style* tab (where all map-visual toggles live); the glacial hint no longer mentions rivers. All controls remain wired by `getElementById` — no JS changes. Handler/markup-only ⇒ default render bit-identical to v0.079. 357 assertions green.

Since v0.079 (`docs/ATLAS_ARCHITECTURE.md`, Hierarchical Reverse-Refinement Atlas — Phase 1): the LOD pyramid is now a **quadtree of chunks** with an explicit **lifecycle**. Pure helpers `chunkParent`/`chunkChildren` (addressing), `chunkColorHash` (stable per-chunk colour), and `chunkState(z,col,row)` → **Unexplored → Generated (`_lodCache`) → Edited (`_lodEdits`) → Baked (`_atlasBaked`)** with the atlas authoritative (`_atlasBaked` is a stub Set until Phase 2 IndexedDB baking). A chunk-debug overlay on the LOD view (toggles **Grid** / **Colors** / **Labels**): per-level coloured grid, hash chunk colours, tile labels (LOD/coords/parent/state). Overlay is browser-only + gated (LOD view + a toggle) ⇒ default render bit-identical to v0.078. 357 assertions green (parent↔children round-trip, colour determinism, lifecycle precedence baked>edited>cached>unexplored).

Since v0.078 (user request — biome-paint PoC + sharper biomes): two things. (1) **Cartalith biome-paint, auto-filled** (proof of concept, debug-view only): the editor's frozen 15-biome palette (`CART_BIOMES`/`CART_BIOME_COLS`, ported from `Cartalith_V1.914.html`) is auto-filled from this tool's classification — `buildCartBiome()` maps each cell via `ELEV_TO_CART` (the 12 climate biomes → a Cartalith index) with elevation overrides (ocean→15, high→Mountain(8)/Hills(13)) — and shown as a new **CBiome** debug view (`currentCartBiome` cached, cleared each `generate()`). So a generated world hands the editor a ready paint grid instead of a blank canvas. (2) **Sharper biomes**: the ecotone-jitter noise was a single world-frequency octave, so biome detail stayed the same coarseness at every resolution. `bioJitter()` adds a finer 2nd octave (≈150 cycles) gated on `state.viz.sharpBiomes` (default true; a "Sharper biome detail" checkbox) → finer, resolution-revealing biome boundaries. **Off ⇒ bit-identical to v0.077** (asserted: legacy single-octave reproduced exactly); CBiome is debug-only. 348 assertions green. Sharper-biome aesthetics + the PoC palette need a browser.

Since v0.077 (river carving interplay, user request — second half of the river pass): **brushed rivers as entrenched drainage seeds.** Two problems: a brushed river could run uphill (no flow), and erosion deposition refilled it. `enforceChannelDescent(fld,W,H,pts,sea,halfW)` (pure) walks the ordered downstream curve and carves a channel whose centreline **descends monotonically** (cutting through rises, floor-limited at sea−0.06) so the river actually reaches its outlet and MFD drainage routes through it. The river brush then locks the carved cells into `riverMask`/`riverFloor`; `enforceRiverChannels()` (called in `eroFinish`, `evolveCoupled`, `depositSediment`) clamps masked cells back to their floor so deposition/rebound/deltas never bury them. `riverMask` clears each `generate()`; no locked rivers ⇒ enforcement is a no-op ⇒ bit-identical to v0.076. 342 assertions green (monotonic descent cuts through rising terrain, entrenchment clamps refill, non-river cells untouched, no-op when empty).

Since v0.076 (river rendering quality pass, user request — "rivers", rendering first): **discharge-widened smooth rivers.** The biome map's river overlay was a blocky 1-cell `flow>thresh` blue blend (thread-thin, dotted at 2K). `buildRiverField(flow, fld, W, H, sea)` (pure) stamps each river cell a soft disc of half-width ∝ discharge (`0.7+mag²·3.2` cells, `mag=log(flow/thresh)/log(0.05·N)`), max-combined → smooth, widening rivers (trunk wide, tributaries thin) that the renderer blends as blue. Built lazily into `_riverField` in the renderNow prologue, cleared in `computeFlow` (flow changed ⇒ stale). Gated on `state.viz.smoothRivers` (default **true**; a "Smooth widening rivers" checkbox; off ⇒ the legacy per-cell overlay). **Render-only: field/temp/rain bit-identical to v0.075, ocean pixels untouched, only land river-overlay pixels change** (6590/29289 land). 336 assertions green (trunk wider than tributary, ocean has no rivers, finite, deterministic). Vector polyline strokes + carving interplay are the next river steps.

Since v0.075 (`docs/LOD_PYRAMID_PLAN.md` Stage 3): **per-tile editing.** Pure `brushHeight(data,w,h,cx,cy,r,strength,mode)` (squared-falloff raise/lower/smooth, clamped, outside-radius untouched). `lodPick(gx,gy)` maps a canvas grid coord → the tile under it + local pixel coords (LOD nav state). Edits live in a persistent `_lodEdits` map (keyed like the cache) so the **procedural base stays reproducible** — `editTileAt` copies the procedural tile in on first touch, `drawLODView` prefers `_lodEdits`, and **Refine never overwrites** them. Tile-aware undo (`_lodUndo` snapshot per stroke; Ctrl-Z routes to `lodUndo` while editing). An **Edit tiles** toggle + Raise/Lower/Smooth brush (reusing the Sculpt size/strength); LOD pointer drag edits when on, pans when off. `_lodEdits`/`_lodUndo` clear each `generate()`. Off ⇒ bit-identical to v0.074. 332 assertions green (brush ops, pick mapping, edit persists through re-refine, undo reverts). Export bake-back of edits + cross-tile seam editing are flagged follow-ups; the interaction needs a browser.

Since v0.074 (user request — overview-then-refine, not on-the-fly): the LOD view now shows the **coarse overview instantly** (`amplifyRegion` with `detailAmp:0` → upscaled coarse, no procedural work) and a **Refine detail** button (`refineVisibleTiles`) amplifies the finer tiles for the CURRENT view on demand, caching them; `drawLODView` overlays only **already-generated** tiles (cache-only — zero work on navigate). So the user finetunes the overview first, then commits procedural detail where asked (re-press after zooming further). `lodViewRect`/`visibleTileKeys` are the pure helpers. Off ⇒ bit-identical to v0.073. 322 assertions green. The compositor + refine flow still need a browser pass.

Since v0.073 (`docs/LOD_PYRAMID_PLAN.md` Stage 2): the **tiled LOD viewer**. Engine (headless-tested): bounded LRU `_lodCache`, `tilesInView` (col/row span overlapping a world rect at level z), `collectVisibleTiles` (cached tile generation for a view). Compositor (browser-only, `drawLODView`): self-contained LOD navigation — `_lodZoom`/`_lodCx`/`_lodCy` are its OWN zoom/center and `applyView` forces the CSS transform to identity while on, so it never fights `viewT`; it renders only the visible region's tiles (`pyramidTile`→`renderHeightTileRGBA`→`drawImage`) into the view canvas, diving into amplified detail without ever allocating an 8K canvas. Gated on `_lodOn` (a **Tiled LOD** checkbox + 512/1K/2K/4K tile-size selector in the Source panel; the +/− zoom buttons and canvas drag repurpose to LOD zoom/pan while on) → off ⇒ `renderNow` bit-identical to v0.072. `_lodGen`/`lodCacheClear()` invalidate tiles each `generate()`; `drawLODView` try/catches to a clean fallback (headless: `ImageData`/`drawImage` unsupported → disables itself, normal path resumes). 317 assertions green. **Stage 3 (per-tile editing) is next; the compositor + interaction need a browser pass.**

Since v0.072 (`docs/LOD_PYRAMID_PLAN.md` Stage 1, user request — tiled LOD instead of an 8K working canvas that crashes browsers): the **pure pyramid core.** `pyramidTile(coarse,cW,cH,z,col,row,tileSize,opts)` = `refineTile` over the FULL world with 2^z×2^z tiles (so it inherits amplifyRegion's seam-Δ=0 and cross-level consistency); `pyramidDims(z)`, `pyramidTileBounds` (world rect a tile covers, for culling/manifest), `pyramidLevelForZoom(scale,baseW,tileSize,maxLevel)` (the "reverse mipmap" level picker). Per-tile px follows the world aspect via `tileDims`. Headless-tested (same-level seam Δ=0 exactly, addressing, level-for-zoom monotonic, determinism); pure addition ⇒ generate() bit-identical to v0.071. 313 assertions green. **Stage 2 (bounded LRU cache + live tiled viewer compositing on `viewT`) and Stage 3 (per-tile editing) are the browser-bound follow-ups; export still bakes the full 8K+ picture tile-by-tile via the existing `bakeTiled`.**

Since v0.071 (user bug — "sea great at 512, ok at 1K, terrible at 2K"): **the actual root cause was a resolution-unaware warp cache.** `computeWarp`'s cache hit keyed only on seed + warp amount, NOT resolution — so clicking a different resolution button (which auto-generates with the same seed) returned the STALE-sized `warpX`/`warpY`; the height loop and `computeHeterogeneity` then read `warpX[i]` past its end → `undefined` → **NaN across 75–94% of the map** on every res switch. The earlier water-shader work (v0.063/65/68) only ran on fresh generates (clean), which is why it never fixed it. One-line fix: the cache hit now also requires `warpX.length===GW*GH`. Switching 512→1K→2K now yields 0 NaN (was 0/502784/2516992). Fresh generate is unchanged ⇒ bit-identical to v0.070. 304 assertions green (new resolution-switch NaN regression test). **Suspected fix for the long-running "bad sea at high res" reports — needs a browser confirm by switching resolutions.**

Since v0.070 (`docs/research/gravity-influence.md` Stage G3): **moons & tides.** `state.planet.tides={enabled:false,k2,moons:[{massRel,distRel,phase}]}` (default off ⇒ bit-identical to v0.069, asserted). Pure `tidalForcing(moons)=Σ massRel/distRel³`; `computeTideField` turns the equilibrium forcing (`0.04·k2·forcing/g`) into a spatial **spring tidal-range field** amplified in shallow shelf seas (Green's law `depth^−¼`) and funnelled near coasts — marking intertidal flats & coastal hazard/wandering-flood zones. `tideField` is null while off (geoidField idiom); `refreshTides()` rebuilds it in `generate()` + on tide-param change. A **Tides debug view** (`currentTideField`, previews even while off) + an intertidal mudflat overlay on the biome map + `tidal_range.f32` export accompany it. Range scales with moon mass, 1/dist³ and 1/g, and is larger near coasts (all asserted). 300 assertions green. G2 geoid + G3 tides complete the gravity workstream (G4 tidal sedimentation deferred). Tidal-overlay aesthetics need a browser.

Since v0.069 (`docs/research/system-coupling-audit.md` §3, third coupling loop): **mass-conserving sediment routing.** `routeSediment(fld, disch, supply, W, H, opts)` is a pure primitive — routes a per-cell sediment `supply` (the column an erosion pass removed) down the steepest-descent drainage network and deposits it where transport capacity (∝ discharge·slope) drops below the load: floodplains in low-slope reaches, deltas/shelves building toward sea level at river mouths, pooling in closed sinks. **Conserves mass exactly** (every unit deposits on-grid or pools; non-world ⇒ nothing exits — asserted Σdeposit = Σsupply to 1e-3). Wired as the opt-in **Sediment fill** erosion button (`depositSediment()`: stream-power carve → route the eroded mass → redeposit, instead of broad isostatic rebound). New op, never auto-runs ⇒ generate() bit-identical to v0.068. 289 assertions green (exact conservation, deltas below sea, determinism). **All three audit loops the user prioritised (L1 climate↔erosion, L2 currents→winds, L3 sediment) are now shipped.**

Since v0.068 (user: ocean still pixelated at 2K, fine at 512/1K + request for higher res): **resolution-independent water grain + 4K/8K options.** The water `nLow` noise used a per-cell frequency (`x·0.05`), so at 2K it was 4× finer-grained than at 512 (the "pixelated at 2K" report). Now `vnoise(x·25.6/GW,…)` → a fixed ~25.6 wavelengths across the map at every resolution (identical to the old look at 512). `smoothSeaH` radius nudged `GW/256→GW/200`. **Render-only, water-only** (field/temp/rain bit-identical to v0.067, land byte-identical). New **4096 / 8192** buttons in the working-resolution picker (generic `GW·GH` path; memory-heavy — 8K needs several GB, flagged in the UI hint and for a browser run). 282 assertions green.

Since v0.067 (`docs/research/system-coupling-audit.md` §2, second coupling loop): **ocean currents ↔ atmosphere.** The audit found `applyOceanCurrents` ran *after* `simulateWeather` and only post-tinted temp/rain. `oceanSSTAnomaly(WW,WH,wrapX,step)` is extracted (the wind-driven warm/cold SST field, shared with `applyOceanCurrents`); `simulateWeather` now folds it into the **sea temperature `tc` before `buildWind`** (gated on `state.climate.currents`), so warm currents → lower pressure + more evaporation → wetter downwind, cold currents → drier — currents steer winds & rainfall, not just colour. `applyOceanCurrents` still adds the visible `tempField` anomaly afterwards. Off (default) ⇒ bit-identical to v0.066. 282 assertions green (SST anomaly warm+cold, **winds measurably change when the anomaly is injected**, currents reshape rainfall, deterministic).

Since v0.066 (`docs/research/system-coupling-audit.md` §1, first of the Earth-system coupling loops): **climate ↔ erosion coupled evolution.** `evolveCoupled(cycles, onCycle)` runs N cycles of *stream-power carve (0.6× iters) → `isostaticRebound` → `computeFlow(true)` → `refreshClimate`* — so the rainfall driving each cycle's incision reflects the orography the previous cycle built (rain shadows + drainage migrate with topography, the loop the audit found was only a single user-triggered step). New opt-in op (Erosion panel **Evolve** button + `state.stream.cycles` slider, default 5; legacy saves merge `cycles:5`) → **`generate()` bit-identical to v0.065** (field/temp/rain/render `cmp`-clean; never auto-runs). 277 assertions green (carves terrain, rainfall re-evolves with it, channels incise, deterministic). The worker-ified per-cycle path is a browser follow-up; the sync loop is what's tested.

Since v0.065 (water-quality follow-up to v0.063): **shade the smoothed sea floor.** v0.063 smoothed the *depth* the water colour reads but the water hillshade still came from `shadeFactor(x,y)` (the raw, bumpy seabed) — that residual per-cell shading kept the seas reading "busy" at 2K. `seaShadeFrom(H)` computes the hillshade from the **smoothed** bathymetry (`_seaShade`, built next to `_seaH` in the `renderNow` prologue + `buildGridFields`); `seaColor`/`bakePixel` pass `_seaShade` to `seaColorCore`. With the inputs now smooth, the shader constants were **restored to v0.015's** (`tex *5`, `sh2=0.82+0.18·sh`) so the seas reproduce the old look (broad depth-zone relief, no seabed bumps) while coastlines stay crisp (mask still raw field). **Render-only, water-only: field/temp/rain bit-identical to v0.064, land 0/29289 pixels changed, water 100%.** 271 assertions green (`_seaShade` finite; smoothed-sea hillshade flatter than raw). Sea aesthetics still want a final browser eyeball.

Since v0.064 (`docs/research/tectonic-feature-graph.md` T4): **transform faults** — the last boundary type. `buildOrogenyField` now takes `opts.shear` (the `shearField`) and `opts.convTypes` extended to `[collision,subductionOC,arcOO,rift,transform]` (T_TRA, `RADS[T_TRA]=2·blurR`). Per polyline it also accumulates `shAmp` (mean |shear|) and `shSig` (signed mean shear → sense); a margin is now kept if **either** normal stress **or** shear is non-negligible (`amp<1e-4 && shAmp<1e-4` skip). The transform profile (San Andreas / Dead Sea / Alpine Fault) is amplitude-scaled by **shear, not normal stress** (`Amp=shAmp`): a linear fault valley `−0.55·G(d,0,0.45·blurR)` + a transpressional **pressure ridge offset laterally by `ro=λ·S` (`λ=1.2·blurR`, doc §5)** `+0.32·G(d,ro,…)` + a releasing-bend depression `−0.12·G(d,−ro,…)` on the opposite side. So no-shear ⇒ zero (asserted), the ridge **reverses side with shear sign** and its offset **scales with |shear|** (both asserted), depth scales with shear amplitude. `generate()`/`currentOrogenyField` pass `shear:shearField`. The T0–T3 profiles are untouched (collision/sub/arc/rift still use `Amp=amp`). 269 assertions green. Off ⇒ bit-identical to v0.063. **The tectonic-feature-graph workstream T0–T4 is now feature-complete** (T5 = archetype wiring + sliders, optional). Transform-valley aesthetics need a browser.

Since v0.063 (user bug report — seas read "blocky"/unsharp at 2K vs the old 512 default): **smoothed-bathymetry water shading** (render-only). The water shader (`seaColorCore`, ramps, `seaColor`) was byte-identical to v0.015 — the seas only looked worse because the depth band + seabed hillshade resolve per-cell bathymetry noise, which is far busier at 2048 than at 512. Fix: `smoothSeaH(src)` (two separable `boxH`/`boxV` passes, radius `≈GW/256` so smoothing tracks resolution) flattens the sea floor into broad shelf/deep/abyss zones; `_seaH` (module global) is built in the `renderNow` prologue **only for `mode==='biome'` mapView** (Relief mode keeps its height ramp) and in `buildGridFields` for bakes. `seaColor`/`bakePixel` read `_seaH` for the depth while the **land/water mask still uses the raw field** (coastlines stay crisp). `seaColorCore` grain softened (`*5→*2.2`) and seabed hillshade gentled (`0.82+0.18→0.92+0.08`). **Render-only: field/temp/rain bit-identical to v0.062, land pixels byte-identical, only water pixels change** (asserted: land 0/29289 changed, water 100%). 262 assertions green. Sea aesthetics need a browser.

Since v0.062 (`docs/research/tectonic-feature-graph.md` T3): **boundary-type features** — `buildOrogenyField` now takes a `crust` array (raw per-cell `plates[].base`, `plateCrust()`) and stamps a **per-type signed profile** selected by the T0 matrix (`opts.convTypes=[collision,subductionOC,arcOO,rift]`), each radius-limited (collision 3.3·blurR … rift 1.85·blurR; cells beyond exactly 0): **collision** = the v0.061 multi-ridge kernel × phase-locked fold ripple `(1+0.16cos(2πd/d₁))` (deepens intermontane cols, intensity constant so amplitude stays **linear in stress**) + low plateau + foreland-basin depression beyond the craton flank; **subductionOC** = ocean-side trench −0.9A + Andean arc +0.75A; **arcOO** = trench −0.85A + island arc +0.6A + backarc basin −0.22A; **rift** = axial graben −0.45A + uplifted shoulders +0.28A, layered on top of the kept divergent stress; **transform** untouched (T4). Trench/arc orientation comes from a per-polyline **majority vote** over `crust` sampled ±3 cells along the normal (`oceanSign`), so the trench always sits on the oceanic side (asserted, incl. flipping when the crust input flips). Combined by **|max|** (signed) across margins. The height swap is unchanged (`T = oro ? oro[i]+min(stress,0) : stress`); the Orog debug view now uses `divColor` (uplift warm / trench·basin·graben cool). 258 assertions green (trench-on-ocean-side + flip, island-arc both signs, rift graben-below-shoulders, foreland basin, linearity, beyond-radius 0, gate round-trip). Off ⇒ bit-identical to v0.061. T4 (transform offsets) is next. Landform aesthetics need a browser.

Since v0.061 (`docs/research/tectonic-feature-graph.md` T2): **opt-in graph-driven orogeny** — `state.tect.tectonicGraph` (default false → bit-identical to v0.060, asserted incl. the in-suite off→on→off round-trip; legacy saves merge the default in `loadZip`). **`buildOrogenyField(polylines, stress, W, H, opts)`** is pure (amplifyRegion mold; only pure `fbm`; convergent type ids via `opts.convTypes`): for each **convergent** polyline (collision/subductionOC/arcOO — rift & transform deliberately untouched until T3/T4) it computes a per-cell signed distance `sd` (nearest-segment scan in per-segment windows, `mark`-stamped arrays for O(1) clears) and stamps the doc's multi-ridge kernel `U(d)=A·e^(−d²/σ₁²)+0.5A·e^(−(d−d₁)²/σ₂²)+0.3A·e^(−(d+d₁)²/σ₂²)` (σ₁=0.42·blurR, d₁=blurR, σ₂=0.30·blurR; `/\/\` not `/\`), amplitude = mean |stress| along the margin (linear in stress, asserted), with fbm crest-position wobble + 0.75–1.25 along-strike vigor; **max-combined** across margins, cells beyond `RAD=d₁+3σ₂` exactly 0. In `generate()` the height loop swaps the stress term: `T = oro ? oro[i]+min(stress,0) : stress` — **convergent blobs replaced by structured belts, divergent (negative) stress kept verbatim**. `orogenyField` is null while off (continentalField idiom); an **Orog debug view** (`currentOrogenyField`, `_oroPrev` cache cleared per `generate()`) previews the would-be uplift even while the gate is off. Acceptance test from the research doc: synthetic convergent margin → ≥3 parallel ridges with cols <75% of peaks + asymmetric flanks (≈1.5:1). 253 assertions green. Mountain aesthetics need a browser (Orog view + gate on, then erode).

Since v0.060 (`docs/research/tectonic-feature-graph.md` T1): the **boundary polyline graph** — vectorises the per-cell `boundaryMask` so T2+ can grow features *along* each margin (arc-length parameterised, per-segment type). **`thinMask(mask,W,H)`** (Zhang–Suen) reduces the up-to-2-cell-thick mask to a 1-px skeleton; **`traceBoundaries(mask,W,H)`** walks it into polylines — chains run between **nodes** (degree≠2: endpoints deg-1, junctions deg-3+), pure loops (all deg-2) traced separately — returning `{polylines:[{pts,length,closed,curvature}], nodes}` (`curvature` = total turning / arc-length). Both are **pure + headless-testable** (amplifyRegion mold). `currentBoundaryGraph()` builds it from the live `boundaryMask`, tags each polyline with its **dominant `boundaryType`** (T0 majority vote, ignoring none=0), and **caches** in `_boundaryGraph` (cleared each `generate()`, built lazily only when the **Tect debug view** is open). World-wrap is deliberately ignored (a margin crossing the x-seam splits in two — documented refinement). The Tect view overlays the traced graph (stroked polylines + white junction dots) over the T0 per-cell colouring. **Data/overlay-only → render bit-identical to v0.059** (default view never builds or draws the graph). 239 assertions green (straight-line/diamond-ring/T-junction geometry, determinism, thinning, real-world length sanity + typing + cache invalidation). Overlay legibility needs a browser.

Since v0.059 (`docs/ASSET_PACK_FORMAT.md`, B2 texture splatting): pack ground textures blend into the biome render. `state.viz.splat` (slider, default 0.7; **only acts when a pack with textures is loaded** → no-pack render bit-identical to v0.058, asserted). A module global `_splatK` is set in the `renderNow` prologue (`assetPack && texAny && mapView && mode==='biome'` ? splat : 0) and in `buildGridFields` (so PNG bakes splat consistently with the on-screen map; no pack ⇒ 0 ⇒ unchanged). In `landColorCore`, a single post-mix block (after all `add()` calls — the procedural mix is byte-untouched, `_splatK=0` skips it) does a **tint-ratio splat**: per textured slot `tinted_c = tex_c·inv_c·rampCol_c` (texture deviation-from-its-own-mean, re-coloured by the existing climate ramp so temperature/moisture tinting survives at any strength), accumulated weighted by `materialWeights`, then `col = mix(col, texCol/cov, _splatK·cov)`. UV = one texel per cell, nearest, wrapped. The parchment slot, when a pack supplies it, replaces the procedural paper grain with sampled luminance. 222 assertions green (splat changes land only, ocean untouched, 0-strength + no-pack both bit-identical). Texture-pack aesthetics need a browser.

Since v0.058 (`docs/research/tectonic-feature-graph.md` T0): the first phase of the tectonic-feature-graph workstream — **shear field + boundary-type matrix**, data-only (nothing downstream consumes them yet → bit-identical to v0.057, asserted). `computeStress` now also computes the **tangential shear** `S=(vA−vB)·t` per boundary pair (`t=n⊥`) into `shearField` (blurred at `blurR`, |max|-normalized like stress) and classifies every boundary cell via the pure **`classifyBoundary(oceanA, oceanB, C, S)`** matrix — shear-dominant (`|S|>1.5|C|`) → `transform`; convergent splits by crust (`plates[].base<0`=oceanic): C–C `collision`, O–C `subductionOC`, O–O `arcOO`; divergent → `rift`. A cell touching several plates takes its **strongest-interacting pair** (max |C|+|S|). `BTYPE`/`BTYPE_KEYS` are a **frozen order** (none=0…transform=5); `boundaryType` (Uint8) is nonzero only on boundary cells (asserted). A **Tect debug view** + legend shows the five classes. `shearField`/`boundaryType` are allocated in `allocate()` (Invariant 2 applies). T1 (boundary polyline graph) → T2 (orogenic uplift kernel, gated behind `state.tect.tectonicGraph`) are next.

Since v0.057 (user request): an **Ocean-currents debug view** + a two-row debug-view picker. `currentOceanField()` (read-only; mirrors `applyOceanCurrents`' coarse setup — `buildWind` → wind-driven surface flow + the warm/cold SST anomaly, masked to ocean cells) feeds a per-pixel warm(orange)/cold(blue) SST map plus coarse flow-arrow glyphs over water (reusing the wind-arrow idiom). The `#debugSeg` picker became a `.seg.grid` (6-col CSS grid → two tidy rows now that there are 12 views). Render-only → bit-identical to v0.056 (field/temp/rain/render `cmp`-clean). 205 assertions green. Arrow/colour legibility = browser check.

Since v0.056 (`docs/ASSET_PACK_FORMAT.md`): a third **Style** sidebar tab + in-app **asset-pack import**. The "Map style" block (parchment/icons/waves) moved from View into `#stylePanel`, joined by a **Scale bar** toggle (`state.viz.scaleBar`, default true → `updateScaleBar` early-returns hidden when off) and an **Asset pack** section (Import/Clear + thumbnail inspector). Importer: pure, headless-testable core — `parsePackCsv`/`parsePackManifest` (JSON wins over CSV; frozen slot vocab `PACK_TEX_SLOTS` grass/rock/sand/snow/wetland/canopy/parchment + `PACK_ICON_SLOTS` mountain/hill/tree_conifer/tree_broadleaf; unknown slots → warnings; missing files dropped), `pickIconVariant(x,y,seed,n)` (deterministic, breaks repetition), `spriteDrawRect` (bottom-center anchor), `finalizePackTexture` (per-channel inv-mean for v0.057 splat). Browser shell: `unzipAny` (central-directory reader handling STORED **and** DEFLATED entries via `DecompressionStream`, so OS-zipped packs work; `unzipStore` untouched), `loadAssetPack`/`clearAssetPack`/`renderPackInspector`. `assetPack` is a **module global, never serialized** (invariant 6). `drawMapIcons(ctx,icons,W,seed)` draws pack sprites when a slot has variants, else the procedural glyph (trees route by `conifer`). `assets/make_sample_pack.py` emits `assets/sample_pack.zip` (**ZIP_STORED** so `unzipStore`/headless read it) — 7 tileable 256px textures + 9 alpha icons + `pack.json`/`pack.csv`/`CREDITS.md`. 201 assertions green; field/temp/rain/render bit-identical to v0.055 (no pack ⇒ inert). Import UX / sprite aesthetics / deflated-zip import need a browser.

Since v0.055 (region-export UX, user request): the region-refine export takes an explicit **cols × rows** tile grid + **per-tile resolution** instead of a fixed N×N square. `refineTile(...,col,row,tileW,tileH,opts)` now takes separate tile dims; new pure `tileDims(sel,cols,rows,ts)` sets the longer coarse edge = ts px and scales the shorter to the tile's true coarse aspect, so the assembled `cols·tileW × rows·tileH` image **always preserves the selection's shape** (algebraically `=sel.w/sel.h` for any cols/rows — no squish on non-square selections; asserted). `exportRegionTiles(sel,cols,rows,ts,gzip,onP)`, `tilePngBytes(tile,tw,th)` and the manifest (`tileW/tileH` fields) all carry non-square dims; seams stay Δ=0 for non-square tiles (asserted). UI: `refCols`/`refRows` number inputs replace the `refGrid` select. 176 assertions green; `generate()` + render bit-identical to v0.054 (export-only change).

Since v0.054 (`docs/research/gravity-influence.md` Stage G2): opt-in **geoid sea-level field** — `state.planet.geoid={enabled,amp}` (default off → bit-identical to v0.053, asserted; legacy saves merge the default in `loadZip`). Sea level becomes a *field*, not a number: a cell is ocean iff `field[i] < seaLevel + geoidField[i]`. **`buildGeoid(W,H,opts)`** is pure (only pure `fbm`/`hash`): J2 rotational bulge (`rotK·(cos²lat − 2/3)`, `rotK = (24/rotationHours)²·radiusRel/g`), low-degree lon/lat harmonics, and low-frequency `fbm` "mantle" noise — summed, then **shifted to zero-mean and scaled so peak |offset| = amp** (seam-blended in world mode). `geoidField` stays **null while off** so every consumer's `−(geoidField?…:0)` collapses away (Invariant: null-check geoidField everywhere, like warpX). `refreshGeoid()` rebuilds it on res/seed/planet change; `geoAt(i)` is the 0-safe accessor. Local sea level threads through the water mask, `computeTemperature` ocean SST, climate `fieldC`, erosion effective-height, and the renderer (`surfaceColor`/`seaColor` take an effective-height arg; waves/icons use a geoid-adjusted field). A **Geoid debug view** (`currentGeoidPreview`, shows the field even while the toggle is off) + `geoidChk`/`geoidAmp` UI. GPU temperature falls back to CPU while the geoid is on (not in the shader). 172 assertions green (J2 equator-bulge, zero-mean, peak=amp, determinism).

Since v0.053 (`docs/WORLD_REGIONAL_TILING_PLAN.md` Stages 2+4, browser wiring): region-refine export. **Select region** (Save & export section) arms a drag-rectangle mode on the map (`regionSelMode`/`regionSel` — transient, exclusive with `guideDrawMode`, dashed overlay on `polyOverlay`); `normRegion()` (pure) orders/clamps/min-sizes the corners. **Refine & export** runs `exportRegionTiles(sel, grid, ts, gzip, onP)`: one tile at a time (memory discipline — never the whole region live), each `refineTile` → `packHeight16` → optional **gzip via native `CompressionStream`** (`gzipBytes`/`gunzipBytes`, null→store fallback; fflate stays a documented upgrade) → optional visual PNG via `renderHeightTileRGBA` (hypso×hillshade from the tile's own heightmap) through **OffscreenCanvas when available** (else canvas; null headless) → schema-2 manifest with per-tile coarse bounds → stored ZIP `region_<seed>_<g>x<g>_<ts>px.zip` (+ `params.json`). The binary path runs headless end-to-end: the suite decodes an exported tile (gunzip→unpack) and matches a direct `refineTile` ≤1 LSB. Bit-identical to v0.052 at defaults. Drag UX, PNG layer, and a real 4×4@4096 (16k) memory run need a browser.

Since v0.052 (`docs/WORLD_REGIONAL_TILING_PLAN.md` Stages 3–5): the pure tiling core (verifiable like v0.044's `amplifyRegion`; OffscreenCanvas per-tile render, fflate and region-select UI are the browser follow-up). **`refineTile(src, srcW, srcH, region, cols, rows, col, row, tileSize, opts)`** splits a coarse sub-region into a cols×rows grid — each tile's coarse sub-bounds overlap its neighbour by exactly one coarse column/row (the shared seam line) so adjacent tiles are **seam-Δ=0 exactly** (asserted across a full 3×2 split, both axes; tile(0,0) matches a direct `amplifyRegion`). **`packHeight16`/`unpackHeight16`** = portable 16-bit height ↔ R+G byte packing (`H=R·256+G`, round-trip ≤1 LSB ≈7.6e-6; clamps out-of-range); wired into `exportZip` as `heightmap_rg16.bin` (the `.f32` stays the full-precision path) and `loadZip` reads it as a fallback. **`buildTileManifest`** = manifest v2 (`schema:2`, worldSeed/world, height encoding, compression, per-tile records with coarse bounds when refining a region) — a superset of the old flat `index` so existing consumers keep working; now emitted by `bakeTiled` as `tiles/index.json`. All pure → bit-identical to v0.051 (`generate()` field + RGBA `cmp`-clean). The per-tile worker render path and fflate compression need a browser check.

Since v0.051 (`docs/BIOME_AND_VISUALS_PLAN.md` Part B, B4): `state.viz.waves` (default false → bit-identical to v0.050, field+RGBA). `computeCoastDistance(fld, W, H, sea)` is a pure two-pass chamfer distance transform (land=0 source, ocean=distance-in-cells; world-wrap deliberately ignored — subtle decoration). The renderer turns it into concentric foam contours (`sin(cd/per)^3`, brighter near shore, faded into deep water) modulating **water cells only** — asserted that land pixels stay byte-identical when waves toggle. `WAVE_BAND≈GW/40`, `WAVE_PER≈GW/180`. Gated on the same `mapView` (dbg off + biome/hypso) as parchment/icons; off → the transform is skipped. Render-only; bakes/exports unchanged. Vector spline-traced coastlines (the other half of B4) remain an optional follow-up. Wave aesthetics need a browser check.

Since v0.050 (`docs/BIOME_AND_VISUALS_PLAN.md` Part B, zero-asset tier): `state.viz = {parchment, icons}` (defaults 0/false → field **and** rendered RGBA proven bit-identical to v0.049; legacy saves merge these defaults in `loadZip`). **B1 parchment**: per-pixel two-octave `vnoise` paper-fibre grain multiplied into the biome/relief render modes plus a warm tint, gated on `pk>0` so the default path skips the branch. **B3 stylized icons**: `placeMapIcons(fld, biome, W, H, opts)` is a pure primitive (amplifyRegion mold; only pure `hash` from module scope) — land-relative elevation thresholds (mountain ≥0.58, hill 0.53–0.58 — Nortantis-style, **algorithm studied only, AGPL code not copied**), greedy largest-first acceptance with grid-bucketed spacing (big peaks claim the spine), forest stipple via deterministic jittered grid on closed-canopy biome classes (frozen indices 3,4,5,6,12), all lists painter-sorted north→south. `drawMapIcons(ctx, icons, W)` draws procedural vector glyphs (peaked mountain + shaded east flank, hill arcs, conifer/broadleaf trees) over the composited raster like the plate arrows — works with zero assets; sprite packs are the later optional B2/B3 asset tier. Render-view only: PNG bakes and layer exports unchanged (flagged follow-up). Glyph aesthetics need a browser check.

Since v0.049 (`docs/research/engine-optimization.md` W0b): stream-power and glacial carve join droplet erosion off the main thread. Both ops were refactored into **self-contained kernels** — `streamPowerKernel(fld, stress, resist, rain, W, H, P, onProgress)` and `glacialKernel(fld, temp, W, H, P, onProgress)` — that take every input as an argument (read-only fields + a packed `P` of state/planet params) and **inline their own MinHeap + priority-flood routing** (the routing block is deliberately duplicated into each kernel, not shared, so each can be stringified into a blob-URL Worker; **Invariant 11 now covers all three kernels** — the suite rebuilds each from `toString()` with module globals shadowed and asserts bit-identical output). `streamPowerErode()`/`glacialErode()` (sync) and `streamPowerEroseAsync()`/`glacialEroseAsync()` (worker) call the *same* kernel; `runErosionWorker(key, kernelFn, bodyJs, buildPayload, syncFn, finishFn, label)` is the generic blob-URL runner mirroring `erodeAsync`'s contract (copied-in buffers, transferred-back field, sync fallback when Workers are missing/error). One shared `_eroBusy` lock serialises all three heightmap-mutating ops. The main-thread tail (`eroFinish` = `isostaticRebound` → `computeFlow(true)` → `refreshClimate` → `renderNow`) stays off-worker. Pooled `mbuf/ibuf/ubuf` routing (`computeFlowRouting`) is gone — the kernels own routing now. **Proven bit-identical to v0.047** (seed 12345, 256px: stream-power and glacial outputs `cmp`-clean) — pure responsiveness win, no constraint change. The worker paths themselves can't run headless — verify in a browser after touching them.

Since v0.048 (`docs/research/map-painting-ux.md`): the waypoint "Polyline sculpt (GPU)" is **replaced** by plotline feature brushes — draw a freehand guide stroke (`guideDrawMode`; raw points → `rdpSimplify` at ~1 screen px → `catmullRomSample`), pick one of 7 features, Apply. `applyFeatureAlongCurve(fld, W, H, curve, feature, radius, strength, seed, opts)` is a pure-ish testable primitive (amplifyRegion mold; only pure `fbm`/`ridged` from module scope): a **distance-field stamp** — per-cell min distance d, arc-length u, side sign; one write per cell (sampling-density independent); cells beyond radius bit-untouched (asserted). Features: mountainRange (crest-jittered ridged relief), hills, ridge, plateau (mesa max-semantics, never lowers), escarpment (side-signed scarp), canyon, river (width/depth grow downstream u 0→1, floor-limited at sea−0.06, skips water). The GPU polyline path (`_fsPoly`/`GPU.polyline`) was deleted with the waypoint UI. Pan/zoom: one shared `viewT={scale,panX,panY}` transform on `.canvas-stack` — **mobile keeps its button overlay** (mobile-only gate + ✋ pan toggle + two-finger pinch/pan), **desktop adds** wheel-zoom-to-cursor (ctrl = trackpad pinch), middle-drag and space-drag pan; `evtToGrid` is transform-invariant (post-transform rect). Dynamic `#scaleBar` (1/2/5×10ⁿ km from `state.mapWidthKm` ÷ post-transform canvas width; refreshed in `renderNow`/`applyView`/resize). Ctrl/Cmd-Z → `undoLast()` (input-guarded). `generate()` proven bit-identical to v0.047 (cmp field/temp/rain). Stroke capture, pan/zoom, and the scale bar are browser-only — manual verification.

Since v0.047: a **Wind** debug view visualises the W1 prevailing-wind field — `currentWindField()` (read-only; rebuilds the coarse `tc` like `simulateWeather` then calls `buildWind` at decl=0) feeds a per-pixel hue=bearing/brightness=speed map plus coarse arrow glyphs (reusing the plate-arrow `vctx` idiom). Render-only → bit-identical to v0.046.

Since v0.046 (user bug report — ridges instead of rivers): `streamPowerErode` rewritten — **MFD drainage** (Freeman 1991, slope^1.1-weighted spread to all lower neighbours; kills the straight 45° D8 channel artefact), **steepest-descent receivers** on the sink-filled surface, an **anti-ridge deposition clamp** (a channel cell can never be raised above its own pre-incision uplifted surface — this was the relief-inversion bug: routed-in upstream sediment overfilled channels), and **uplift normalised + default 0** (the button carves rivers; uplift is opt-in orogeny). Regression-tested: channels must net-incise downward and sit below their neighbours. The sidebar follows the planetary-formation cascade: Source → Planet → Calibrate → World Structure → Tectonics → Volcanism → Climate → Weather → Erosion → Glacial → Coastal → View → Save/Performance.

Since v0.045 (W3.5): opt-in `climate.currents` adds wind-driven ocean surface currents — `applyOceanCurrents()` (coarse grid) transports heat meridionally (poleward flow → warm SST anomaly → mild wet coasts; equatorward flow → cold SST → cool fog-dry coasts, Benguela/Peru→Atacama), shifting ocean `tempField` and nearby coastal temp/rain. Runs after the moisture correctors, before `computeSeasons`. Off → bit-identical to v0.044.

Since v0.044 (`docs/WORLD_REGIONAL_TILING_PLAN.md` Stage 3): `amplifyRegion(src, srcW, srcH, region, outW, outH, opts)` is a **pure, worker-ready** primitive (no globals) — upsamples a coarse sub-region (preserves continents/ranges) + adds world-space high-frequency `fbm` detail tapered by local relief and faded out underwater. Because both terms are pure functions of the shared coarse coordinate, adjacent tiles are **seam-Δ=0 exactly** (proven in tests). This is the verifiable core of the world→regional→16k tiling pipeline; the tiled-export/OffscreenCanvas/fflate wiring is the browser-bound follow-up.

Since v0.043 (`docs/research/weather-model-v2.md` W3): opt-in seasons via `climate.seasons` (default off → bit-identical). `simulateWeather(iters, decl)` / `buildWind(...,decl)` shift the thermal equator & circulation bands by solar declination; `computeSeasons()` builds `tempJul/JanField`, `rainJul/JanField`, and a `koppenField` (Köppen–Geiger, `classifyKoppen` from seasonal temp extremes + summer/winter precip, normalized rain→mm via `climate.maxRainMm` default 3000). `KOPPEN_KEYS` is a **frozen 30-code list** (Af…EF); a 'Köppen' debug view and `koppen_raster.bin`/`koppen_index.json` export accompany it. Only the `axialTiltDeg` planet param drives the spread.

Since v0.042 (`docs/BIOME_AND_VISUALS_PLAN.md` Part A): `buildBiomeRaster()` emits one Uint8 biome index per cell (0 = ocean, then a **frozen append-only order** `ice…tropWet` = 1…12) via `classifyBiome`; `exportZip()` adds `biome_raster.bin` + `biome_index.json` (decode manifest) for the Cartalith handoff. Index order is save-format-stable — never renumber `BIOME_KEYS`.

Since v0.041 (W0): droplet erosion lives in **`dropletKernel(fld, rain, W, H, P, onProgress)` — a deliberately self-contained function (no module globals)** that is stringified into a blob-URL Web Worker by `erodeAsync()` (UI path: copies field/rain in, transfers result back, progress %, sync fallback when Workers are unavailable or error). The sync `erode()` calls the same kernel — proven bit-identical to v0.040. **Invariant 11: `dropletKernel` must stay self-contained** — the suite rebuilds it from `toString()` with all module globals shadowed and asserts bit-identical output. Thermal pass, rebound, flow and climate refresh stay on the main thread (`erodeFinish`). The worker path itself can't run headless — verify in a browser after touching it.

Since v0.040 (W2): ocean evaporation is bulk-aerodynamic when `climate.bulkEvap` (default true) — `E = Ce·U·(qs−q)`, wind speeds it up, saturation deficit caps it. The ITCZ/dry-belt corrector is scaled by `climate.zonalK` (default **0.5**; the W1 bands make most of the zonal structure emergent — measured equator max, 25–40° dry dip, wet westerlies with the corrector fully off — the corrector only sharpens contrast that 2-D advection can't reach without vertical subsidence). Legacy saves load as `zonalK:1, bulkEvap:false` — bit-identical to v0.039.

Since v0.039 (`docs/research/weather-model-v2.md` W1): `buildWind(wx,wy,WW,WH,step,tc)` builds a per-coarse-cell wind field — latitude-band circulation with cell count from `circulationCells()` (≈ `3·√((24/rotationHours)·radiusRel/√g)`, Earth = 3) plus a pressure-gradient perturbation (P′ ∝ −T, geostrophic with `|f|` floored at 0.25, downgradient within ~±15° of the equator, magnitude normalised to 0.8·step at `climate.pressK=1`, total capped at 1.8·step for semi-Lagrangian stability). Region mode defaults to `climate.windMode:'auto'`; `'manual'` + `windDir` is the legacy override. **Legacy saves load as `windMode:'manual', pressK:0`, which is bit-identical to v0.038** (proven cross-version). Region border inflow now wets any border cell whose wind points inward.

Since v0.038 (`docs/research/gravity-influence.md` G1): `state.planet = {g, rotationHours, axialTiltDeg, radiusRel}`. Gravity hooks: stream-power K ×g, droplet acceleration ×g, glacial abrasion ×g, temperature lapse ×g (CPU **and** GPU `uLapse` uniform — keep in lockstep), crater radius ×g^−0.22, coastal waveStr ×1/g (via temporary `state.coastal` swap so GPU and CPU paths match). Talus is deliberately g-independent. **Invariant 10: Earth defaults (g=1) must reproduce the previous version bit-exactly** (asserted in tests via g-toggle round-trip). `axialTiltDeg` has no effect yet — reserved for seasons (W3).

Since v0.037, erosion ops (`erode`, `streamPowerErode`, `glacialErode`) also: spawn droplets ∝ precipitation, apply `isostaticRebound(pre)` (~80% of broad eroded column returns as uplift, England & Molnar 1990), and refresh with `computeFlow(true)`.
