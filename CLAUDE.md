# Cartalith Gen1

> **New session? Read `docs/HANDOFF.md` first** — current state, next task, how to verify.

Single-file HTML worldbuilding tool. **The main deliverable is the newest
`Cartalith Gen1 v*.html`** (currently **v2.22**) — a zero-dependency HTML/JS/CSS application,
designed to open via `file://` (a local HTTP server is an accepted fallback for Workers/WASM
threads; `file://` must degrade gracefully, never break).

| File | Role |
|------|------|
| `Cartalith Gen1 v2.22.html` | **Current** unified tool (~30.6k lines, 4 script blocks — see architecture below) |
| `Cartalith Gen1 v0.57/v0.6/v0.61…v2.21.html` | Previous Gen1 versions (kept; never edit in place) |
| `Cartalith v2.58 DCC test.html` | **The DCC shell line's current head, not a mainline version.** Owner: *"only render it when we zoom... And only do that for rivers that are actually big. Rhine, Amazon, yellow river. And do the same for smaller rivers as we do ways for the smaller cities... Attest your own research adversarially."* The research refuted two of the request's own premises and one of my own claims; what shipped is the part that survived. **River SELECTION had no scale term anywhere** — `riverRenderPolys()`'s cache key is `_fieldGen|GWxGH|minO`, no zoom and no `mapWidthKm` — while river DRAWING (Catmull-Rom, v2.25's real-width crossover, v2.40's in-tile resolution) has been mature for versions. The ladder the request asked to mirror is itself scale-blind: `CIV_LOD_PLACE.hamlet=1.4` puts a hamlet on screen at a **28 571 km** view on a 40 000 km world. The gate is **`len*_z`, the stem's own length in SCREEN PIXELS** — `mapWidthKm`-free by construction, since `_z` is screen-px-per-grid-cell in BOTH camera conventions. `RIVER_MIN_SCREEN_PX=20` sits inside the **13.08-490.6 px** band real stylesheets use (I first cited OpenMapTiles' 26.165 px as verified and had **extrapolated two rows of its table rather than read it** — the probe asserts the band, not the number). **Töpfer & Pillewizer is REFUTED for hydrography** (predicts 49% flowline retention 1:24k->1:100k; USGS measured **10-11%**), and **Strahler cannot carry these tiers** — max order **4** at world extent, **2** at the default, against 8-12 for a real Amazon. Length is the gate, and it is legitimate only because the geometry changed: `traceRiverPolylines` returns FRAGMENTS whose length ANTI-correlates with importance (rho **0.207**, top-100-by-length vs top-100-by-flow overlap **2%**, median length 141 km by flow against 1 341 km by length). `buildMainStems` accumulates drainage area over `net.recv` **itself** by Kahn's algorithm and keeps the largest tributary at each confluence — rho **0.207 -> 0.963**. Two defects in my own first cut: ranking `net.recv` chains by `flowField` (**two different trees**, exactly as v2.41 recorded — stems died after 5-10 steps at flow 163 405), and a raw `Math.hypot` charging a wrapped receiver a full map width (longest 'stem' **41 097 km = 2 104 cells on a 2 048-cell grid**, and since the gate RANKS on length every seam-crossing river was promoted to the top). Longest stem now **4 879 km** (Amazon 6 400). The spline's own geometry was GW-keyed with no zoom term — **111 km** control points and a **1 000 km** meander wavelength at 40 000 km, constant at every zoom; `step`/`eps` divide by `_z` (**bit-identical to v2.57 at `_z=1` at GW 1024/2048/4096**, refining **2.844 -> 0.356 -> 0.044**) and `wl` is real-km (`RIVER_MEANDER_WL_KM=20`, **reproducing `GW/40` exactly at the app default extent**). **Eighth occurrence of the real-km defect.** `drawRiverWays` also re-traced the whole network every call (**32 ms**) while `riverRenderPolys` cached the identical work; `mainRiverStems()` uses the same key. Ladder at 20 px, LOD 0-8: **975/2531/4426/6087/7215/7456/7456/7456/7456** — monotone, 13.1% disclosed at world scale, **saturated by LOD 5**, which refutes the request's own "LOD 7/8" premise. **`state.hydro.integrate` stays DEFAULT OFF and is load-bearing** (longest stem 1 799 km off vs 4 879 km on) — flipping it re-baselines every world, so it is disclosed, not changed. `hash_gen1.js` vs v2.57 **ALL IDENTICAL**. Verify with `tests/perf/probe_riverscale.js` (17 assertions). |
| `Cartalith v2.57 DCC test.html` | Previous DCC-line file. Owner, on a 40 000 km world: *"tell me what geometric patterns you see. And I literally mean shapes and how they translate to the water."* Measured before any fix: the coast did not merely CORRELATE with the plate polygons — the pure Voronoi partition `plates[plateId[i]].base>=0` (no blur, no noise, no erosion) reproduced the land mask at **IoU 0.813 / 89.5% agreement**, and locally-straight coast ran parallel to the nearest plate-boundary segment at mean |cos| **0.968** against a 0.648 shuffle null. The pathway is **`baseField`, not `ageField`** — term sd base **0.2524** against the ageField-modulated noise amplitude's **0.0232**, a factor of **10.9**. So the whole coastline is the zero-crossing of a blur of a piecewise-CONSTANT Voronoi map, and the one radius that decides how far noise can push it off the polygon had never been named: **`PLATE_BASE_BLUR_K` 0.35 -> 0.18** in `plateBaseBlurR()`. **SWEPT, not reasoned** — a first reading argued a WIDER ramp would help and was wrong. K 0.35/0.25/0.18/0.112 at 40 000 km: straight **49.3/43.3/36.9/29.0%**, dimension **1.032/1.061/1.074/1.092**, IoU **.812/.781/.747/.721**. 0.25 costs nothing but is invisible at the app default; **0.112 lands exactly on the `max(2,…)` floor**, where the knob stops responding to `blurR` — v2.49's defect one version later. Second, independent: **`carveRiverValleys` inherited a DETECTION ease.** `riverCoarseEase` answers "does a stream EXIST" (v1.101); it says nothing about whether the grid can hold its VALLEY. At 40 000 km it pinned at its cap of 16, took the channel threshold **209.7 -> 13.1** and cut **8.1x** more trench — and since `enforceChannelDescent` floors every carve point at `sea-0.06`, a headwater reaching the coast floods and leaves a **39 km one-cell bristle**: **21.3%** of the coastline (12.8% at 800 km; **1.5%** with the carve off). `carveFlowThresh()` multiplies the ease back out (v1.101's own `_jpStageDryKm` idiom); `opts.flowThresh` absent ⇒ `riverFlowThresh(W,H)` exactly. Net vs v2.56 at 40 000 km: straight **42.5->36.9%**, D **1.059->1.074**, IoU **0.813->0.747**, bristles **21.3->14.9%**. **A deliberate re-baseline** — `hash_gen1.js` vs v2.56 diverges everywhere, and **with `PLATE_BASE_BLUR_K` restored to 0.35 the app default is BIT-IDENTICAL** (FNV 2783047521). Verify with `tests/perf/probe_coastgeom.js` (17 assertions; hard-errors on v2.56). |
| `Cartalith v2.56 DCC test.html` | Previous DCC-line file. Eight full-grid fields were rebuilt on EVERY render, keyed on nothing. The block carried v0.6's own comment saying so — *"no generation-keyed cache of their own (unlike `_seaHCache`) — they unconditionally rebuild every render call whenever their slider is on"* — and nobody had costed it. Measured at 1024px with those sliders on: **one render spent 9407 ms rebuilding them against 1219 ms of actual pixels** (`buildCoastSDF` 3123, `buildRiverSDF` 3078, `buildSVFField` 1886, `buildBiomeBoundaryDist` 1679, shadows 322, AO 157, crest 52, coastD 44), with **nothing they read changed** — so dragging one of those sliders cost **~12 s per drag step**, and so did a pan, a zoom or any civ edit missing the bake cache. **11 720 ms -> 1 444 ms, 8.1x.** The fix is the cache pattern sitting FOUR LINES ABOVE them (`_seaHCache`/`_seaShadeCache`), generalised into a six-line `renderFieldCached(name,key,build)`; no builder was touched and no mechanism invented. **Every input must be in the key, and the key is assembled at the CALL SITE** so a builder that gains a parameter has to name it where it is passed: `_fieldGen` covers field/flow/geoid + `GW`/`GH`, `_climGen` the biome raster's climate, and slider value / `sunAz` / `seaLevel` / **which array `effFld` resolved to** are explicit. **One entry per name**, so the cache is bounded by the name list and a return to an old key REBUILDS rather than resurrecting a stale array. **A cache that never invalidates passes a "nothing rebuilt" test perfectly**, so the probe asserts the EXACT rebuild set per input — `_fieldGen` -> all eight is the contract, not a stampede. At defaults the prologue is **0.1 ms** and the pixel loop is **94% of the render**; v1.87/v1.92 both profiled that loop clean, so the only lever left there trades fidelity. `hash_gen1.js` vs v2.55 **ALL IDENTICAL**. Verify with `tests/perf/probe_renderfields.js` (22 assertions; hard-errors on v2.55). |
| `Cartalith v2.55 DCC test.html` | Previous DCC-line file. The deep-zoom plain stops being flat. v2.53 recovered the DATA and changed nothing on screen — correctly, because storage was the THIRD floor. Measured on one real LOD-7 plain tile: the relief gate `min(1,hypot(gx,gy)*8)` removed **100.0%** of every synthetic octave, and the Height view's GLOBAL hypsometric ramp painted it **one colour across 512 px**. **A**: `SUBCELL_RELIEF_M=3.0` m converted through `metersPerUnit()` by `subcellReliefFloor()` — a REAL-METRE quantity, because keying it on cells or normalised height is the v1.60/v2.05/v2.07/v2.49/v2.51 defect a sixth time (the resulting 7.250e-3 is **not** portable). Applied inside the `max`, above the underwater fade, so it is land-only by construction; crosses the worker boundary as a **SCALAR** (`opts.reliefFloor`) so it adds no name to the pool's stringified list, where a miss is a silently skipped tile. Span **5.92 m -> 10.58 m**, distinct heights **12 524 -> 18 638**; steep tile worst pixel **0.056% of its own span**, deep ocean **0 m**. **B**: `renderHeightTileRGBA` rebases the ramp on a **WORLD-WIDE** local-relief field (`buildLocalReliefField`, separable two-pass min/max, wraps in X only in world mode) — a per-tile ramp was built, measured **142.4/255 at every boundary** and rejected (v1.29). **The stretch is ADDITIVE IN SHADING SPACE and the multiplicative form was a real defect that shipped first**: `s*=1+k*(t-0.5)` reaches 1.35 and `c[ch]*s` CLAMPS in the `Uint8ClampedArray` — **a HUE shift, not a brightness one**. `shL=clamp01(sh+k*(t-0.5))` bounds `s` to `[0.4,1]` so no channel can clamp. The tint stays ABSOLUTE (`hypso` reads true elevation); `localContrastK` fades to 0 between 40 m and 400 m, so the steep control is byte-identical on every rung. **Biome is deliberately excluded** — all ~10 consumers of `r` there were audited and all but `grassCol` are ABSOLUTE thresholds, so rebasing puts rock on a lowland plain; Biome gets part A through hillshade instead (run 35 px -> 20 px). Height view **6 -> 133 colours, run 22 -> 6 px**. A deliberate re-baseline of **LOD tiles and baked atlas chunks** (a stale atlas wants a re-bake), never `field` — `hash_gen1.js` vs v2.54 **ALL IDENTICAL**. Verify with `tests/perf/probe_reliefloor.js` (19 assertions; hard-errors on v2.54). |
| `Cartalith v2.54 DCC test.html` | Previous DCC-line file. The generation-parameter dump reads back IN — paste one and press **⤓ Apply pasted settings** to rebuild that world. The import could not be built honestly without fixing the export: measured against the live state, the dump whose caption promised *"for reproducing this exact world"* was missing **27 generation-affecting values** — **`passes`** (v2.17) and **`hydro`** (v2.41) entirely, **16 of `climate`'s 22 fields** (the line hand-picked six), and **five scalars** (`world`/`resW`/`mapWidthKm`/`seaLevel`/`peakM`) that lived only in the prose line, where `seaLevel` was rounded to a whole percent (0.4235 → 0.42, enough to move the coastline). **v2.48 had spotted `passes` alone.** The fix is **ONE list with TWO consumers** — `GEN_PARAM_BLOCKS`/`GEN_PARAM_SCALARS`, emitted by `generationInfoText()` and consumed by `parseGenerationInfo()` — not a longer hand-list, since v1.72 BUG-A / v2.45 is exactly how this drifted. `parseGenerationInfo(text, ref)` is **pure** and takes its reference state as an argument; a paste is **untrusted input** (v1.27), so every value is type-matched and finite-checked and everything refused is **reported by path**, never silently dropped. **Recursion is bounded by the REFERENCE, not the input.** Ordering follows `#resSeg`/`#extentSeg` — extent before `GH` (v2.37), snapshot/rescale only when the grid moves (v2.44); `deriveFromWorldStructure()` is deliberately NOT called (invariant 5 — it would overwrite the imported `tect`). Verified by **rebuilding**: world A's dump, applied over a different world B through the real button, returns `field` **bit-identical**, while a **v2.53-shaped dump fails to** — that control is what makes it evidence. `hash_gen1.js` vs v2.53 ALL IDENTICAL. Verify with `tests/perf/probe_geninfo.js` (21 assertions). |
| `Cartalith v2.53 DCC test.html` | Previous DCC-line file. The stored height word widens to 24 bits, using a byte that was already allocated, already written and already stored. `packHeight16` emitted `out[i*4+2]=0; out[i*4+3]=255;` — four bytes per pixel, two carrying height, one a constant zero — and `atlasEncodeChunk` hands that `Uint8Array` straight to IndexedDB by structured clone, so **there is no PNG and no compression in the height path** (the PNG beside it is the biome visual). A baked 1024² chunk already spent 4.19 MB and threw half away. Measured on a real LOD-7 plain tile (5.92 m span, 167 936 px, **12 524 distinct source heights**): 16-bit global recovers **58**, 24-bit recovers **all 12 524**, 32-bit recovers **12 524 — not one more**, because `field` is a `Float32Array` and f32 carries a 24-bit mantissa (measured ULP 4.110665157e-4 m vs the 24-bit step's 4.110665402e-4 m — seven figures, the same 24 bits). **Alpha is deliberately NOT a data channel** — equally free here, but premultiplication corrupts it through any canvas. **Encoding is decided by FIELD PRESENCE (`hgt24` vs `rg16`), never inferred from the bytes**: a genuinely flat tile has a constant low byte, so content cannot discriminate, and that is exactly the tile this fix is for. Old atlases keep decoding (one ternary, no forced re-bake — a depth-6 bake is 5461 tiles). Five surfaces moved; `exportRegionTiles` now writes `tiles/refined_{r}_{c}_rgb24.bin` with `heightEncoding:'rgb24'`, and the atlas-ZIP manifest gained a per-chunk `enc` (absent ⇒ 16). The save fallback `heightmap_rg16.bin` stays 16-bit on purpose — it sits beside the full-precision `.f32`. **This retires the per-chunk scale+offset design** the research had recommended. `hash_gen1.js` vs v2.52 ALL IDENTICAL. Verify with `tests/perf/probe_hgt24.js` (10 assertions; 2 fail on v2.52). |
| `Cartalith v2.52 DCC test.html` | Previous DCC-line file. A sub-cell crater RESOLVES in the tile instead of staying the floor's smear — the thing v2.50 was the prerequisite for. Legal under v2.40's rule because the sub-cell truth is DATA: a crater is a continuous profile in `t=d/R` the coarse grid merely SAMPLED, and below the draw floor v2.50 established exactly what it holds instead — the profile at `R=floor` with the amplitude scaled by `(r/floor)^2`. **The correctness question is double-counting**, so the tile REMOVES that smear (the same call, negated amplitude) before drawing the crater at its own radius. **As `r -> floor`, `sc -> 1` and the two calls cancel**, so the pass fades to exactly nothing where the coarse grid starts resolving the feature — no blend, nothing to tune. `craterAddAt`/`volcanoAddAt` are ONE profile, called by the stamp too, and they WRITE term by term because `arr[i]+=a; arr[i]+=b` is not `arr[i]+=(a+b)` — a helper returning a value would have re-baselined `field`. Measured v2.40's way (fixed world rect, `tileSize` 64->1024): **3 -> 702 changed px while the area in WORLD units holds at 11.20/11.09/10.97/10.99 cells²**, peak Δ converging 1.4e-2 -> 8.3e-2. **The tile worker pool stringifies a NAMED LIST**, so all three functions AND the record layout (generated from the constants, never retyped) had to cross it or v1.61's isolation turns a `ReferenceError` into a silently skipped tile. Registry is a flat `Float64Array`, 117 records at 40 000 km and **3 at the app default** (worst tile Δ 3.1e-3). Seam Δ **0.00e+0**. `hash_gen1.js` vs v2.51 ALL IDENTICAL. Verify with `tests/perf/probe_cratertile.js` (16 assertions; 2 fail on v2.51). |
| `Cartalith v2.51 DCC test.html` | Previous DCC-line file. A crater's depth belongs to its DIAMETER, not to the grid. The old law was `depth=min(0.4,0.02+radCells*0.004)` — normalised height keyed on radius in CELLS — so one 10 km crater measured **1550 m at 200 km, 491 m at 800 km, 194 m at 5 000 km, 145 m at 40 000 km**: the v1.60/v2.05/v2.07/v2.49 real-km defect in the depth law, the one place v2.50 deliberately did not follow it. Replaced by **Pike 1977** — simple `d=0.196 D^1.010` (a flat **1:5**), complex shallowing as `D^0.301` (**1:11** at 10 km, **1:91** at 200 km). The published complex branch does NOT meet the simple one (383 m vs 635 m at the transition, a **1.66x step**), so it keeps its exponent and is re-anchored on the simple branch's own value — continuity asserted at 634.3/634.6 m. The transition diameter scales as **1/g** (Melosh 1989; Moon 19.4 km vs Earth 3.2 km is 6.06x against g's 6.05x), so the one free parameter is fixed by a checkable relation. **Pike's `d` is rim crest to floor and this stamp draws `1.25*depth` crest-to-floor**, so `CRATER_RIM_FLOOR_K` divides that out and the assertion measures a REAL stamp (D 3.1 km -> 613 m drawn against 620 m wanted; D 31.3 km -> 1260/1260). **A deliberate re-baseline** — mean crater depth at the app default moves **194 m -> 558 m (x2.87)**; `hash_gen1.js` vs v2.50 diverges everywhere, and **with craters+volcanoes OFF on both sides it is ALL IDENTICAL**. The moved coastline then caught an older bug: **`landmassKey` gave two landmasses in one 8-cell block the same key, name and RENAME entry** (measured: two islets, 68 km² and 20 km², both `lm:8,19,777`) — colliders now refine to a finer block while the largest keeps the coarse key, so saved renames still resolve. Verify with `tests/perf/probe_craterdepth.js` (15 assertions; 3 fail on v2.50). |
| `Cartalith v2.50 DCC test.html` | Previous DCC-line file. **A floor that INFLATES is not a bound.** `stampOneCrater`'s `R=Math.max(1.5,radCells)` and `stampOneVolcano`'s `R=Math.max(2,radCells)` widen the FOOTPRINT and leave the AMPLITUDE alone, so a feature smaller than one cell is drawn at the floor's full depth/height — and **v1.60's comment, still sitting above `clampFeatureRadiusCells`, claims those floors "handle the world-scale vanishing-to-sub-pixel case"** (the v2.37 expired-comment shape, third occurrence). Measured at 40 000 km/1024px: **98/100 craters floored**, a 6 km crater drawn 58.6 km wide removing **381.5x** its own material, **96.9% of the crater depth the engine wrote was the floor's**; volcanoes **99.8%** floored, p50 drawn **78.1 km against a true 8 km at FULL real height** (height is keyed on `heightM`, so nothing damped it). Monotonic in cell size: depth kept x0.999 / x0.282 / x0.031 at 800 / 5 000 / 40 000 km. **The floor stays** — `t=d/R` makes `R=0` a `0/0` — and the AMPLITUDE is scaled by the AREA ratio `(r/floor)^2`, which conserves the integrated material **exactly**: both profiles integrate to amplitude x R^2, measured on the real stamps as volcano `vol/r^2` = 0.267774/0.267782/0.267783/0.267783 and crater `vol/(depth(r)*r^2)` = 1.44015/1.44080/1.44082/1.44081. `impactField`/`volcanicField` are area-weighted too, or the fix is half-done. **A deliberate re-baseline** — `hash_gen1.js` vs v2.49 diverges everywhere because the battery runs at 512px (43/100 floored) — but **craters+volcanoes OFF on both sides is ALL IDENTICAL**, and at the app's own default the whole crater depth budget moves **0.13%**. Verify with `tests/perf/probe_craterscale.js` (15 assertions; 2 fail on v2.49). |
| `Cartalith v2.49 DCC test.html` | Previous DCC-line file. Owner, on a 40 000 km world: rivers read as uniform lines. **Two clamps, stacked**, neither an LOD problem. (1) `riverWidthScaleK` shared `1/TERRAIN_DETAIL_MAX_K` as its lower bound, so the real-km family **stopped responding to real km at mapWidthKm 12 800** — an Earth-sized map wanted 0.02 and got 0.0625, sitting 3.1× past the ceiling with nothing saying so. The shared cap is **asymmetric in its harm**: small maps it correctly stops exaggerating, large maps it holds too WIDE. (2) `halfW` floors at 0.5 cells, and the largest value the formula can produce at that `widthK` is **0.3656** — so every channel of every order clamped and `halfw[]` was uniformly 0.5: a **39.06 km band for the trunk and the trickle alike**, four times the Amazon. Now 0.079/0.158/0.251/0.265 km by Strahler order. Safe because the floor is **dead weight on the raster** — `r=ceil(halfW)=1` for any halfW in (0,1), so only `d=0` passes and `t=1` regardless (verified at 0.04/0.12/0.366/0.5/0.9: one cell, t=1, every time) — so the stamp keeps the floor and `halfw[]` carries the true width to `drawRiverWays`' v2.25 crossover and `riverFieldTile`'s v2.40 zoom resolution, **both built for this and both receiving a constant**. `hash_gen1.js` ALL IDENTICAL at the default; above 12 800 km `field` moves, via v2.30's `carveChannelPath` deriving its RESAMPLE STEP from `halfW`. Verify with `tests/perf/probe_riverwidth.js` (11 assertions; 4 fail on v2.48). |
| `Cartalith v2.48 DCC test.html` | Previous DCC-line file. Owner, on a 40 000 km world: *"still unnatural geometric shapes"* — **not an LOD defect**, the straight edges were already in the coarse `field`. `distanceToBoundary()` was a two-pass 3x3 **chamfer**, whose error is DIRECTIONAL: **0.00% at 0°/45°/90°, +8.15% at 22.5°/67.5°**, so its level sets are **octagons with flat facets**. That field is `ageField`, which the height formula spends as the **noise amplitude** (`rug = exp(-age*(1+ageInf*6))`) and which also feeds `resistanceField` — so terrain roughness and erosion both inherited octagons, and the world grew facets whose edges can only run at 0/45/90/135°. Diagnosed from the DATA: exactly-collinear coastline runs existed **only** in those four directions. Plate boundaries were tested and **refuted**. Same function also failed to wrap in X, so the seam column read **251 against a true 5** and held 63 of 173 straight cells. Replaced by `euclideanDist` (Felzenszwalb & Huttenlocher, separable, O(n), **exact**): anisotropy **8.15% → 0.00%**, straight coastline 2.52% → **1.75%**, longest interior run 37 → **19**, seam column 63 → **18**, and what remains is now **2x enriched on real plate boundaries** (rift margins genuinely are straight). **A deliberate re-baseline** — `hash_gen1.js` vs v2.47 diverges everywhere; saved `.zip` projects keep their terrain. Verify with `tests/perf/probe_platedt.js` (8 assertions; 5 fail on v2.47). |
| `Cartalith v2.47 DCC test.html` | Previous DCC-line file. Owner: *"I want the output at whatever zoom to be most natural looking."* Two defects in the one height path every LOD tile takes. (1) `amplifyRegion`/`addZoomDetail` reconstructed the coarse height **bilinearly**, which is exactly linear inside a coarse cell and kinked across every boundary — and all three tile renderers hillshade from finite differences, so the surface was a mesh of flat facets with a crease between each pair. Measured second difference **3040× higher on a boundary than inside a cell**, the interior reading float noise because bilinear has no curvature there at all; `sampleC1` (Catmull-Rom, **interpolating** — exact at coarse nodes, max |Δ| = 0) takes it to **1.51×**. (2) `fbm` is SIX internal octaves at lacunarity 2, so the ladder added content far above the tile's own sampling rate, where it can only alias and re-randomises whenever the grid moves. `detailBandWeight`/`fbmBand` fade an unresolvable octave toward **its own mean** (Quilez, never toward zero, or the terrain sinks): half-pixel shift stability **−52.8%** on a large world (`detailFreq` 16), and **unchanged at the default**, which is correct — nothing there is unrepresentable. `extra=min(6,z−zBase)` is gone, so the level counter no longer changes a world point's height; v0.126's own assertion held the sampling fixed and raised only z, i.e. it asserted the defect. Seams stay **exactly 0**. `hash_gen1.js` vs v2.46 ALL IDENTICAL. Verify with `tests/perf/probe_lodsurface.js` (12 assertions; 7 fail on v2.46). |
| `Cartalith v2.46 DCC test.html` | Previous DCC-line file. Owner: *"it seems the button for the asset manager has gone."* It had not — v2.24 filed the Asset Library under "program scope" and moved `#assetsHeaderBtn` into the cog's Settings window, so it was in the DOM, correctly wired, and **never visible**: a real click cannot land on it (`page.click` times out with `element is not visible` on v2.45, which is the report exactly). `_carEnterAssetsMode` already relabels that button `← Map`, adds `.on` and sets `aria-pressed` — it was built for a header slot — so hiding it broke the way IN while leaving the way OUT, and v2.24 added `#assetsBackBtn` to stand in for the half it had hidden: **v1.57's one-control-two-surfaces defect**. The toggle moves back to the header, the stand-in is retired, and the now-empty Settings section becomes the button's own `title`. The cog rule is sound and the Library is simply not program scope — it is a MODE you enter, taking the whole stage. Markup + CSS only; `hash_gen1.js` vs v2.45 ALL IDENTICAL. Verify with `tests/perf/probe_assetsbtn.js` (14 assertions; 8 fail on v2.45). |
| `Cartalith v2.45 DCC test.html` | Previous DCC-line file. v2.44 rescaled a resolution/extent change's vectors and disclosed the per-cell rasters as a known line. Measuring what that line covered found it wider than stated: 512→1024 took painted territory from **96 659 cells to 0**, both timeline years to **0**, the year cursor 100→0, and faction 1's culture/religion/government/ag-tech from `maritime/sunCult/republic/earlyIndustrial` to **`imperial/none/monarchy/traditionalAgrarian`** — because `_civSyncFromState` rebuilds each of those four **from a default whenever its field is missing** and the civ `generate()` wrapper had just emptied `state.civ`. `civFactionNames` survived only because its line has no `else`, and that asymmetry is what kept the rest invisible; **v1.54 makes `factionAgTech` drive `foodSurplusRatio`**, so the change silently reverted that lever (v1.54 measured the gap at 2.66x). The v1.72 BUG-A shape a third time, so the snapshot no longer names a field list — it captures **the whole of `state.civ`**, i.e. `_civSyncToState`'s own output, plus its own `GW`/`GH` so the restore derives the scale itself. `_rescaleCellPairs` resamples the sparse `[cellIndex, factionId, …]` encoding **INVERSELY** (walk the new grid, read the old cell beneath it) — forward leaves a solid border at quarter density when the grid grows — and **nearest-neighbour is the only correct filter**, since interpolating two faction ids invents a third. Measured: territory 96 659→385 804 cells at an unchanged 0.575 of the map, centroid drift 0.0006; region→world holds the FRACTION while the count falls 95 482→74 525. `hash_gen1.js` vs v2.44 ALL IDENTICAL. Verify with `tests/perf/probe_worldreset.js` (35 assertions; 11 fail on v2.44). |
| `Cartalith v2.44 DCC test.html` | Previous DCC-line file. v2.43 fixed ONE of five world-construction paths. Audited the rest by measurement: there are **five `allocate()` sites** (`generate()`, `loadZip()`, `loadImage()`, the region extract, `resSeg`/`extentSeg`) — v2.43's note saying three was wrong. **`loadImage()` had the identical defect**: importing a heightmap into a finalized world produced a fresh map that arrived locked (153/153 controls, Layers 8 of 34) — and `#loadBtn` carries no `[data-genlock]`, so it is reachable — while keeping the previous world's settlements, roads, journeys, territory, paint, undo stack and atlas association, with `flowSum 0`. **The resolution buttons were worse**: coordinates are in GRID units and nothing rescaled them, so 512→1024 moved a settlement from 68.8% across the map to 34.4%, **and all 90 roads were destroyed** (the civ `generate()` wrapper clears `civWays`/`civJourneys`/`civTerritory` **unconditionally**, under a comment claiming a `_imported` guard **the code has never had** — the v2.37 expired-comment shape). Owner chose RESCALE: the handlers snapshot before, scale per axis, restore after. Also: the reset is now ONE function (`resetNewWorldState`) instead of a copy per site; `loadZip` clears the sculpt draft + `_setupSkipped` (session globals `Object.assign` can never reach); the extract's paint rasters no longer stay at the OLD grid size (**167 936 against a 671 744-cell world**); `generate()` clears the stale `civProvince` and region marquee. `hash_gen1.js` vs v2.43 ALL IDENTICAL. Verify with `tests/perf/probe_worldreset.js` (21 assertions; 17 fail on v2.43). |
| `Cartalith v2.43 DCC test.html` | Previous DCC-line file. Owner: an extracted region *"can't modify terrain or change generation settings nor do I have the layers available"*. **Three symptoms, one signature — `state.finalized`** — and "Extract as new world" was the one world-construction path that never cleared it, so a brand-new world INHERITED the parent's finalize lock: **152/153 `[data-genlock]` controls disabled, the Layers popover cut to `LAYER_EXPLORE_SUBSET`'s 8 of 34, `_sculptEditorActive()` false, and `generate()` refusing with a bare `console.warn`** nobody can see. The save then carried `finalized:true`, so reopening it was locked too. The claim is also false on its face — finalized means the baked Atlas covers the whole map, and `worldKey()` had just changed (`af077385 -> c6db7d48`), so `exportZip()`'s `skippedFlatBake=!!state.finalized` wrote **a 15.1 MB zip with no `map.png` and no `tiles/`**. Fixed with the two lines `generate()`/`loadZip()` already use on a worldKey change, plus `clearUndoHistory()` (v2.12's rule — GW/GH just changed) and `computeFlow(true)` (the world had **zero hydrology** until the calibrate gate was committed, `flowSum 0 -> 7 454 176`). Second defect: **`_treeRead` refuses a heightmap-less tree (§6.4) and the FLAT reader did not**, so `region_*.zip` — params.json plus tiles, no heightmap — loaded "successfully" and left `field` as `allocate()` zeroed it (**landFrac 0.74 -> 0, no alert**). `hash_gen1.js` vs v2.42 ALL IDENTICAL. Verify with `tests/perf/probe_regionworld.js` (20 assertions; 12 fail on v2.42). |
| `Cartalith v2.42 DCC test.html` | Previous DCC-line file. The other half of v1.52's link. That version wired the Season (render) slider to turn the "Seasons & Köppen climate" checkbox ON, because a slider whose prerequisite lives on a different tab reads as broken. **The reverse was never wired and had the identical defect**: `computeSeasons()` writes only `tempJul`/`tempJan`/`rainJul`/`rainJan`/`koppenField` and restores the annual `rainField`, so ticking the box computed everything and then drew a map **byte-identical to the unticked one** — proven inside one build (annual FNV `3576384877`, seasons-on-at-annual FNV `3576384877`, the ticked render `3105258300`). The checkbox now also opens the blend it just made available, under v1.52's own two rules: **only ever ON, and only from `annual`** — an existing Jan/Jul choice survives, and unticking leaves the slider alone so re-ticking restores the user's value, not the default. `SEASON_LINK_DEFAULT=1.0` is full July deliberately: a half-strength blend on a temperate world can still read as "nothing happened", the exact complaint v1.52 answered. The map-view half of `_seasonK`'s gate is NOT forced — `_seasonSliderNote()` already reports "needs the Biome map view", and switching the user's View is a bigger claim than revealing a render option. `hash_gen1.js` vs v2.41 ALL IDENTICAL. Verify with `tests/perf/probe_seasonlink.js` (16 assertions; 7 fail on v2.41). |
| `Cartalith v2.41 DCC test.html` | Previous DCC-line file. Rivers reach the sea, and build land where they arrive. Two flags in `state.hydro`, **both default off** (the `state.passes` convention), so `hash_gen1.js` vs v2.40 is ALL IDENTICAL. **`computeFlow` accumulated on the RAW `field` with no depression filling, so every local pit terminated accumulation — measured 66.5% of land draining into an interior pit, the biggest channel cell's receiver a pit ~391 m ABOVE sea level, and not one order-3 outlet across five seed/resolution/extent combinations.** `buildRoutingSurface` is a Barnes priority-flood with an EPSILON TILT (a plain fill leaves a flat basin, and the receiver search needs `drop>0` strictly, so a flat terminates exactly as the pit did); it never touches `field`. Threaded through `buildRiverNetwork` too, because that built its OWN receiver tree on the raw field — so the traced network and the accumulation described different objects. Measured **66.5% pit -> 0.0%**, outlet Strahler 2 -> 3. Deltas: `routeSediment`'s sub-sea branch was an ASYMPTOTE (`(sea-h)*0.5`, one visit per cell, so it could never cross into land), and the only mouth process in the engine (`coastalPass`'s estuary branch) SUBTRACTS height. `opts.prograde` is a per-cell allowance set from `R = Qr/Qs,max` (Nienhuis 2015), pivoted on the world's own R distribution so ~10% of mouths land river-dominated (Nienhuis 2020's 80/10/10). Verify with `tests/perf/probe_deltas.js` (18 assertions; v2.40 hard-errors on the missing state block). |
| `Cartalith v2.40 DCC test.html` | Previous DCC-line file. The river is drawn INSIDE the tile now. `waterShade` has exactly one call site (`surfaceColor`), which `renderBiomeTileRGBA` cannot reach — so v2.39 gave LOD a stroked cartographic SYMBOL, not water. `riverFieldTile()` re-evaluates `buildRiverNetwork`'s OWN falloff (`intensity = amp*(1-dist/halfW)`, i.e. a signed distance function that merely happened to be sampled on the coarse grid) from the traced centreline at the TILE's resolution, so refinement **resolves** the river rather than inventing it. Measured: one fixed world rect colorized at 64/128/256/512/1024 px yields 121 -> 30 898 px<sup>2</sup> of channel while its area in WORLD units holds at 77-81 cells<sup>2</sup>. Width grows 1:1 with zoom because `halfW` is in GRID CELLS and the tile converts once by `1/cx`; `RIVER_TILE_MIN_PX` is the symbol floor beneath the crossover, applied as a `max`. **v2.39's `||` REVERTS** — its premise ("LOD has no raster copy, so nothing can double-draw") is false the moment the tile draws. `bakePixel` was blind the same way, so an exported `map.png` carries rivers too. `hash_gen1.js` vs v2.39 ALL IDENTICAL. Verify with `tests/perf/probe_rivertile.js` (21 assertions; 6 fail on v2.39, which then hard-errors on the missing function). |
| `Cartalith v2.39 DCC test.html` | Previous DCC-line file. Rivers were invisible under Tiled LOD at defaults. **`surfaceColor` — where the Beer-Lambert river blend lives — is structurally unreachable under LOD**: `_lodBuildTileRGBA` selects `renderBiomeTileRGBA`, which calls `landColorCore` DIRECTLY. Proven, not argued — colorizing one tile with `_riverNet` nulled is byte-identical (FNV `262842011` both ways). So `drawLODView`'s vector overlay is the ONLY river renderer LOD has, and it was gated on `state.viz.riverWays` — which **v2.29 flipped to false**, rightly for the off-LOD report it answered, silently removing LOD's only renderer. Measured: river-vs-land blue contrast **28.27 off-LOD against 10.95 under LOD**, that residual matching the main map with the network nulled (10.96) to 0.01 — the water colour was **100% gone**, only `carveRiverValleys`' groove left. Fix is one gate, widened with `||` so it is a strict SUPERSET. `hash_gen1.js` vs v2.38 ALL IDENTICAL (it never sets `_lodOn`). Verify with `tests/perf/probe_lodrivers.js` (13 assertions; 4 fail on v2.38, by exactly 0.00). |
| `Cartalith v2.38 DCC test.html` | Previous DCC-line file. Auto-populate is a synchronous **11.2 s** main-thread pass and it ran as a bare `onclick=()=>_civAutoWorld()` — no overlay, no disabled button, nothing. So the tab froze in silence and the owner reported it as *"auto populate doesn't seem to work"*: it worked, it just never said so. **`withBusy` had ZERO call sites in the whole of block 2**, though block 1 declares it at top level and the civ layer could always reach it. Wrapped at all three long civ buttons. This does NOT make them quicker, and the profile says why a wrap is the honest fix: **`roadDijkstra` is 77% of the time (8 593 ms, 326 full-grid runs)** across four `_civHierarchicalNetwork` rebuilds, and the routing grid is already capped at 384x192 **regardless of world resolution** — so a 4K world costs the same as a 512 one and the driver is settlement count, not the map. `hash_gen1.js` vs v2.37 ALL IDENTICAL. Verify with `tests/perf/probe_civbusy.js` (11 assertions; 5 fail on v2.37). |
| `Cartalith v2.37 DCC test.html` | Previous DCC-line file. The carve was laying trenches ACROSS THE ANTIMERIDIAN, below sea level, and they rendered as water — the owner's "near horizontal lines". `carveRiverValleys` consumed a raw wrapped receiver chain; v1.29 exempted it *in a comment* because `enforceChannelDescent` "never interpolates", and **v2.30 destroyed that premise** by inserting `carveChannelPath`, which resamples the seam jump into a dense sweep. The descent ladder then bottoms out at `sea−0.06` for the rest of the traverse. Measured: **28 of 11 802 chains carried 22.7% of the entire carve**, pinning 24 830 cells at the floor in 30 horizontal runs of 100+ cells. Fix is ONE line — the third call site of `splitRiverPolylines`. Channel cells **59 481 → 71 654**: the trenches were drowning real rivers. Also fixes `_suGenCommit` computing `GH` before assigning `state.world`. `hash_gen1.js` vs v2.36 ALL IDENTICAL (region mode cannot wrap). Verify with `tests/perf/probe_seamcarve.js` (8 assertions; 3 fail on v2.36). |
| `Cartalith v2.36 DCC test.html` | Previous DCC-line file. The collision belt is a STACK of thrust sheets, not one Gaussian ridge: ONE shared long-wavelength bend keeps the sheets parallel while each sheet's deviation is a fraction of SPACING, so a sheet can never close the gap to its neighbour. `orogenyWidthScaleK` gives the belt a fixed REAL width (exactly 1 at the 800 km default, so default terrain is unchanged). Also fixes a **v2.35 defect**: the forward-preferring walk skipped same-group cells, so the pure-loop pass retraced chains — 2.86 points per distinct skeleton cell against v2.34's 1.45, traced length 1.75x the boundary-cell count against the suite's own <2x bound, which v2.35 passed partly by luck. Now 1.23x. Himalaya-width anchoring was built, measured (0.57→0.93 of stations) and **REVERTED** — it draws a 550 km belt against a 161 km margin, aspect 0.29. **Aspect is bound by MARGIN LENGTH, not belt width.** `hash_gen1.js` vs v2.35 ALL IDENTICAL. Verify with `tests/perf/probe_orogeny.js` (12 assertions). |
| `Cartalith v2.35 DCC test.html` | Previous DCC-line file. A collision margin was being cut at STAIRCASES, not at triple junctions. `thinMask` is Zhang-Suen, so the skeleton is 8-CONNECTED; `traceBoundaries` set `deg` to the raw 8-neighbour count, and a plain diagonal staircase gives an interior cell 3-4 neighbours — so `isNode` fired along straight segments. Measured **1040 "junctions" on a 14-plate world, only 77 of them at a real plate triple point**, against a planar graph's own ~2n−4 ≈ 24. The predicate is the **crossing number** now (0→1 transitions around the ring = distinct neighbour groups), which `thinMask` already computes as its own `A`. Longest collision margin **88.9 → 161.0 / 91.5 → 288.0 / 57.7 → 226.4 km**; junctions 1040 → 23. The walk changed with it — see the section below. `hash_gen1.js` vs v2.34 ALL IDENTICAL. Verify with `tests/perf/probe_margins.js "Cartalith v2.35 DCC test.html"` (21 assertions; 4 fail on v2.34). |
| `Cartalith v2.34 DCC test.html` | Previous DCC-line file. The land SURFACE multiplier is a SPEED from **`JP_TERRAIN.land`** — the Journey Planner's own travel-speeds.md-grounded table — read through `buildCartTerrain()`'s classification, the exact classifier `_jpDeriveStages` runs. It replaces v1.95's `_civBiomeFriction`, which measurement condemned: it charged **Open Plains 1.418 and Rocky Terrain 1.373**, inverted on the map's largest distinction, with a spread of only 1.10–1.45 against this table's 2.11–2.37. **This is the half with the leverage** — Planner hours −3.8% to −21.0% across seeds and modes, with path km and cumulative climb falling too. `hash_gen1.js` vs v2.33 ALL IDENTICAL. Verify with `tests/perf/probe_landsurface.js "Cartalith v2.34 DCC test.html"` (19 assertions). |
| `Cartalith v2.33 DCC test.html` | Previous DCC-line file. Land routing costs TIME: `_civTravelHours` is the one land model (in hours/cell on level ground), replacing three that disagreed — the Way tool, village tracks and the sea-lane MST's land branch had been routing on slope alone. Slope moved to `roadDijkstra`'s `edgeCost` hook as a bidirectional Tobler curve on signed rise/run. **It does not make routes quicker** (+0.1% land / +0.4% mixed, same pairs) and the changelog explains why in measured terms: p50 grade is 1.20%, where Tobler is ×1.001. Step one of two — see below. |
| `Cartalith v2.32 DCC test.html` | Previous DCC-line file. `gaussBlur` no longer routes through `GPU.blurArr`: the two are the same box-blur algorithm, but the CPU one carries a running sum (O(N), radius-free) where the shader scans the kernel (O(N·pr)) and then pays a synchronous `readPixels` — measured **2.1x–21.7x slower at every size and radius**, and `readPixels` was 24.2% of a 1024px `generate()`. **generate() 5919 → 3894 ms at 1024px (−34%)**; flexure 599 → 49 ms. A quantified re-baseline (float32 noise between two implementations of one algorithm; worst cell moves ~1.6 m at default peakM) — the headless suite is bit-identical because it has no WebGL2. Verify with `tests/perf/probe_blur.js "Cartalith v2.32 DCC test.html"` (7 assertions; 2 fail on v2.31). |
| `Cartalith v2.31 DCC test.html` | Previous DCC-line file. `#domainRail` moved inside `#dockWrap`: on a phone the four WORLD/CIVIL/CARTO/EXPLORE buttons are the sticky head of the hamburger drawer instead of a 44px band above the map (which the map gets back — 550px→594px at 390×760), while desktop geometry is unchanged because the bands are arranged by CSS `order`, not DOM order. Markup + CSS only; `hash_gen1.js` vs v2.30 ALL IDENTICAL. Verify with `tests/perf/probe_domainrail.js "Cartalith v2.31 DCC test.html" "Cartalith v2.30 DCC test.html"` (23 assertions; 6 fail on v2.30). |
| `Cartalith v2.30 DCC test.html` | Previous DCC-line file. The carve follows a river instead of a receiver chain: `carveChannelPath()` resamples each traced polyline finer than the channel it is cutting (v2.29's order-1 `halfW=0.8` kept only the centre cell, so a diagonal step broke the trench — only **64.3%** of the drainage had any trench under it, now **97.1%**) and meanders it on coarse control points at `CARVE_SINU_K=8`. Also fixes two latent defects found while measuring it: `riverSinuAmp`'s slope denominator (`RIVER_SINU_SLOPE_K`) and `enforceChannelDescent`'s per-point `drop` silently setting the gradient (`CHANNEL_DROP_PER_CELL`/`CARVE_GRADIENT_K`). Verify with `tests/perf/probe_carve.js "Cartalith v2.30 DCC test.html"` (10 assertions; the coverage guard fails on v2.29). |
| `Cartalith v2.29 DCC test.html` | Previous DCC-line file. Rivers are rendered INTO the terrain again: `state.viz.riverWays` defaults OFF (it is an either/or with the terrain-blended raster river — on means the stroked line is the only river renderer), and `CARVE_STRENGTH_K=8` multiplies the incision K inside `carveRiverValleys()` only, calibrated so the carve reaches 3.08x the un-carved surface's relief energy — matching the 3.16x measured from `elevation_foundation_v0.015`. A deliberate, isolated re-baseline: with the carve off on both sides, `hash_gen1.js` vs v2.28 is byte-identical on field/temp/rain/flow/rgba. Verify with `tests/perf/probe_carve.js "Cartalith v2.29 DCC test.html"` (7 assertions; 4 fail on v2.28). |
| `Cartalith v2.28 DCC test.html` | Previous DCC-line file — the cog window's two faults: v2.27 plus the cog window's two faults: `.set-shell` still sized in `vh` (the one box v2.27's `dvh` pass missed) and `#settingsModal` centring a shell that can overflow, which put the head — and the only ✕ — off the TOP where no scroll reaches it. `align-items:flex-start` + `margin:auto` + `overflow:auto`, a sticky head, and a 44px ✕ on mobile. `hash_gen1.js` vs v2.27 ALL IDENTICAL. Verify with `tests/perf/probe_cogmodal.js "Cartalith v2.28 DCC test.html"` (33 assertions; 18 fail on v2.27). |
| `Cartalith v2.27 DCC test.html` | Earlier DCC-line file — five owner-reported SHELL fixes: `#extentSeg`/`#resSeg` moved back out of the document bar into Geology → Extent & resolution; Search · Undo · Redo · File · cog collapsed onto one header row with symbol Undo/Redo and an emoji cog; the mobile domain rail no longer paints over the drawer it opens; a View-mode click clears an obscuring debug layer; and `vh`/`%` → `100dvh` (+ a measured `--canvas-top`) so nothing sits behind a phone address bar. `hash_gen1.js` vs v2.26 ALL IDENTICAL. Verify with `tests/perf/probe_shellui.js "Cartalith v2.27 DCC test.html"` (19 assertions). |
| `Cartalith v2.26 DCC test.html` | Previous DCC-line file — the SAVE FORMAT: `exportZip()` now writes the `SAVEFILE_COMPAT.md` project TREE (`project.json` + `rasters/` + `entities/` + `history/` + `annotations/`), not the flat layout. v2.11 had built the READER and left the writer; this is the other half. Reads both layouts still. `hash_gen1.js` vs v2.25 ALL IDENTICAL. Verify with `tests/perf/probe_savetree.js "Cartalith v2.26 DCC test.html" "Cartalith v2.25 DCC test.html"` (35 assertions). |
| `Cartalith v2.25 DCC test.html` | Previous DCC-line file — three render fixes: rivers switch from a cartographic symbol to their REAL width past the crossover (`buildRiverNetwork` returns `halfw`), the lake split test became sub-cell, and the LOD tile hillshade is normalised to the tile's own scale. Still writes the flat save layout. |
| `Cartalith v2.24 DCC test.html` | Previous DCC-line file — the GUI FRAME replacement: app bar + cog, document bar, conditional tool rail, vertical domain rail (WORLD·CIVIL·CARTO·EXPLORE), left dock 372 (tools + domain body), right dock 304 (**the information pane** — Properties + the Info readout; Layers stays on the map), status bar, and a Settings window holding every program-scope option. Bit-identical render path vs v2.22. |
| `Cartalith v2.23 DCC test.html` | The theme layer alone, kept. Every DCC-line file is deliberately named without `Gen1`: `tests/run.sh` globs `Cartalith Gen1 v*.html` and takes the last by version sort, so a `Gen1 v2.2x` name would have made an experiment the suite's default target. |
| `PORT_ONLY_FEATURES.md` | What the Rust/Godot native port has that this app does not — pulled in from `Cartalith_GDT`, three of its rows corrected here against the real file. The back-port source list. |
| `Cartalith_V1.915.html` | Pre-merge cartographic editor, kept as reference (routes, settlements, paint grid, politics, journey planner) |
| `urban-morphology/Urban Morphology v0.1.html` | Standalone procedural city-layout PoC, kept as reference — its engine was ported into Gen1's 4th script block (v0.95); the PoC file itself is never edited |
| `fractal-geology/Fractal Geology Painter v0.1.html` | Standalone stamp-based terrain-sculpt PoC, kept as reference — its engine was ported into Gen1's Generate → Sculpt sub-tab (v1.15); the PoC file itself is never edited |
| `assets/sample_pack.zip` + `make_sample_pack.py` | Reference CC0 asset pack + its generator (in-app importer) |
| `docs/` | HANDOFF, roadmap, plans, `docs/research/` reports (incl. `settlement-resources.md`, `food-logistics.md`, `travel-speeds.md`, `agricultural-productivity.md`, `water-access-travel.md`, `political-fragmentation.md`), `docs/SCULPT_EDITOR_INTEGRATION_PLAN.md` |
| `tests/` | Headless verification harness (`run.sh`, stubs, 1262-assertion suite; `run_um.sh`, 852-assertion urban-morphology suite) + `tests/perf/` Playwright A/B + UI-smoke harnesses |
| `legacy/` | Historical merge tooling — **non-functional here** (inputs absent); see `legacy/README.md` |
| `CHANGELOG.md` | Per-version engine log (v0.037 → current), moved out of this file |

## Working rules

- Finish one thing before starting the next. Confirm design before building.
- **New version = new file** (`Cartalith Gen1 v0.XX.html`); don't edit old versions in place.
- **Version naming: two-digit minor from v0.61 on** (v0.61, v0.62, … v0.70). `sort -V` compares
  the minor numerically, so `v0.7` would sort *before* `v0.61` — the `tests/run.sh` default and
  any "pick newest" logic depend on the two-digit convention.
- **After any change to the engine (script block 1): run `tests/run.sh`.** A change is not done
  until it passes (1244 assertions green). Script block 4 changes likewise require `tests/run_um.sh`
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


### Ocean current coastal deflection widened + LOD bake depth 6 (v2.10)

Two owner-reported items from one message. Engine-only (`computeOceanCurrent`'s `deflectFlow`
call) for the first; pure additive markup for the second. Hash vs v2.09 diverges at the default
(`currents:true`) — isolated: with `currents=false` on both sides (pinned-seed A/B), `field`/
`temp`/`rain`/`flow` are byte-identical, same as v1.82's own precedent.

- **Ocean current "bumping into shore" instead of curving.** Root-caused by measurement (synthetic
  straight coastline + uniform onshore wind, swept through `deflectFlow`) before any fix. NOT the
  debug-view arrow spacing (ruled out first, a real but different effect) — the owner's follow-up
  confirmed the actual field itself runs straight in. Cause: `computeOceanCurrent` passed
  `blockBlur:1` to `deflectFlow`, so the coastline gradient that TRIGGERS redirection is only
  non-negligible in the ~1-2 cells touching the coast — measured: the onshore component stays
  within a few percent of its raw undeflected value from open water down to ~4 cells out, then
  snaps to near-zero in the final few cells. Not a curve — a last-instant correction. Fix:
  `blockBlur:1`→`6`, a ONE-TIME (not per-iteration) cost widening the gradient's reach so cells
  further out start sensing the coast earlier. Swept 1/4/6/8: far-field (no land nearby) stays
  bit-identical across every value — the widened blur never smears the open ocean, only the
  near-coast band — and the improvement plateaus by 6. `buildWind`'s own separate `deflectFlow`
  call (terrain wind, different tuning) untouched. Verified: mid-approach tangential:onshore ratio
  0.49→0.79; at-coast flow now genuinely tangential-dominant; curve is monotonic (no overshoot).
  4 new unit tests, `tests/run.sh` 1070/1070, `tests/run_um.sh` 852/852.
- **LOD bake depth 6.** The `#bakeAllDepth` picker topped out at LOD 0–5 even though the handler
  already clamped to `Math.min(8,...)` (matching `state.lodMaxLevel`'s own ceiling) — level 6 was
  reachable by the code, just not offered. Added `<option value="6">LOD 0–6 · 5461 tiles
  (huge!)</option>` (Σ4^z, z=0..6, matching the existing options' own tile-count convention). No
  other change; hash unaffected (markup outside any `<script>` block).
- **Known scope cuts**: `blockBlur:6` is measured/disclosed, not independently sourced against a
  real shelf width; the Ocean debug view's own coarse arrow-sampling grid (the ruled-out first
  hypothesis) is unchanged and can still miss the (now wider) coastal band between sample points
  at extreme map scales — a separate, disclosed display-only limitation.

### A river fragment is not a river (v2.58, DCC-line file only)

Owner: *"What if we draw a river with a catmull-rom line and only render it when we zoom to LOD 7/8
when a map is 40 or 20000km. And only do that for rivers that are actually big. Rhine, Amazon, yellow
river. And do the same for smaller rivers as we do ways for the smaller cities... Attest your own
research adversarially."* **Vector-overlay only** — `hash_gen1.js` vs v2.57 is **ALL IDENTICAL**,
`tests/run.sh` 1280/0; verification is `tests/perf/probe_riverscale.js` (17 assertions).

- **The half that was missing was SELECTION, and it had no scale term anywhere in the file.**
  `riverRenderPolys()`'s cache key is `_fieldGen|GWxGH|minO` — no zoom, no `mapWidthKm` — so a 50 km
  region and a 40 000 km world chose the same set of rivers. The drawing half asked for
  (Catmull-Rom, the v2.25 real-width crossover, v2.40's in-tile resolution) was **already built**,
  refining a set nothing had selected. **Check which half of a request already exists before building
  the whole of it.**
- **The ladder this was asked to mirror is itself the defect.** `CIV_LOD_PLACE` is raw zoom, so
  `hamlet: 1.4` puts a hamlet on screen at a **28 571 km** view on a 40 000 km world. Copying that
  convention reproduces the bug one subsystem over. The gate is **`len*_z` — SCREEN PIXELS** — which
  needs no `mapWidthKm` term at all, because `_z` is screen-px-per-grid-cell in BOTH camera
  conventions (canvas px under LOD, `viewT.scale` off it) so one expression covers both.
- **`RIVER_MIN_SCREEN_PX = 20`, and the source I first gave for it was partly my own fabrication.** I
  claimed to have independently verified OpenMapTiles' 26.165 px waterway constant and had
  **extrapolated two rows of its table from the halving sequence rather than reading it**; the real
  table spans **13.08 px to 490.6 px**, and the z9=z10 equality I read as design intent is an
  arithmetic identity. The probe asserts the **band**, not the number.
- **Töpfer & Pillewizer's Radical Law is REFUTED for hydrography — do not quote it here.** It predicts
  49% flowline retention from 1:24k to 1:100k against USGS's measured **10-11%**. My first derivation
  of it was wrong twice over: wrong reading (fixed-sheet vs per-ground-area) and wrong law.
- **Strahler order cannot express the named tiers.** Max order measured **4** at world extent and
  **2** at the app default (3 with `hydro.integrate`), against 8-12 for a real Amazon or Rhine — at
  most four buckets, three of them headwaters. **Assert what a vocabulary can hold before keying a
  ladder on it.**
- **`traceRiverPolylines` returns FRAGMENTS, and fragment length ANTI-correlates with importance.**
  rho(length, drainage area) **0.207**; top-100-by-length vs top-100-by-flow overlap **2%**; median
  length 141 km by flow against 1 341 km by length. A length gate over fragments selects the wrong
  rivers, so the fix is a new GEOMETRY, not a new threshold.
- **`buildMainStems` must accumulate on the CHANNEL tree.** A first cut ranked `net.recv` chains by
  `flowField` and produced stems dying after 5-10 steps while the flow raster read 163 405 at their
  head — because `net.recv` (aspect-projected, channel cells only) and `flowField` (D8, all cells)
  **are two different trees**, exactly as v2.41 recorded. Kahn's algorithm over `net.recv` itself,
  largest tributary kept at each confluence: rho **0.207 -> 0.963**.
- **A wrapped receiver charges a full map width, and the gate RANKS on that number.** The same cut
  measured a longest stem of **41 097 km = 2 104 cells on a 2 048-cell grid** — one seam jump plus 56
  real cells — so every antimeridian-crossing river was promoted to the top of the ladder.
  `dx -= Math.round(dx/W)*W` (v1.29/v2.37, third site). Longest stem **4 879 km**; the probe asserts
  no step exceeds 1.414 cells.
- **The spline geometry was GW-keyed with no zoom term, so it never refined.** `step`/`eps`/`wl` were
  `GW/360`, `GW/900`, `GW/40` — a **111 km** control-point spacing and a **1 000 km** meander
  wavelength at 40 000 km, at every zoom. `step`/`eps` divide by `_z`, **bit-identical to v2.57 at
  `_z=1` at GW 1024/2048/4096** and refining **2.844 -> 0.356 -> 0.044**; `wl` is real km
  (`RIVER_MEANDER_WL_KM = 20`), which **reproduces `GW/40` exactly at the app's own default extent**,
  so the default meander is unchanged by construction. **Eighth occurrence of
  v1.60/v2.05/v2.07/v2.49/v2.51/v2.55/v2.57.**
- **`drawRiverWays` re-traced the whole network every call** (32 ms at world extent: 11.1 trace+split,
  20.6 spline over 9 395 stems) while `riverRenderPolys` cached the identical work four hundred lines
  away. `mainRiverStems()` uses that same key, Min-stream-order included (7456 -> 1112 -> 7456).
- **The ladder saturates at LOD 5, refuting the request's own "LOD 7/8" premise.** Stems visible at
  20 px, LOD 0-8: **975 / 2531 / 4426 / 6087 / 7215 / 7456 / 7456 / 7456 / 7456** — monotone (zooming
  in only ever ADDS), 13.1% disclosed at world scale, everything on screen two levels before LOD 7. So
  LOD 7/8 is where the spline RESOLVES, not where selection happens.
- **`state.hydro.integrate` stays DEFAULT OFF and is load-bearing for this ladder.** Without it 66.5%
  of land drains into an interior pit (v2.41), so stems terminate early: longest **1 799 km** off
  against **4 879 km** on. Flipping it re-baselines every world from every seed, so it is disclosed
  rather than changed — an owner decision.
- **20 000 km and 40 000 km are the same measurement.** `riverCoarseEase` saturates at
  `mapWidthKm = 12 800` (v2.49's finding from the other side), so both extents the request named share
  one channel-initiation threshold. Both were run; there is only one set of numbers to quote.

### The coastline WAS the plate polygon (v2.57, DCC-line file only)

Owner, on a 40 000 km world: *"tell me what geometric patterns you see. And I literally mean shapes
and how they translate to the water."* **A deliberate re-baseline of every world generated from a
seed** (owner's explicit choice); verification is `tests/perf/probe_coastgeom.js` (17 assertions,
which hard-error on v2.56) plus `tests/run.sh` 1280/0.

- **Measure the SURROGATE, not the correlation.** The decisive number was not "the coast is near a
  plate boundary" (v2.48 already had that, 1.8-2.0x) — it was that the pure Voronoi partition
  `plates[plateId[i]].base >= 0`, with no blur, no noise and no erosion, **reproduces the land mask
  at IoU 0.813**. A 2x enrichment in a 7% subset is a correlation; a mask that reproduces 89.5% of
  the answer is the thing itself.
- **The pathway is `baseField`, and the plausible one was `ageField`.** Straight Voronoi edge ->
  linear-ramp EDT -> straight iso-age bands -> straight noise-amplitude bands is REAL and carries
  the smallest term in the height formula: sd **0.2524** against **0.0232**, a factor of 10.9.
  `grad(base)` and `grad(age)` are both perpendicular to the same boundary, so **correlation alone
  cannot separate them** — the term-magnitude decomposition and the surrogate mask can.
- **A box blur's boundary gradient scales as 1/radius, so one un-named radius set the whole look.**
  `PLATE_BASE_BLUR_K` in `plateBaseBlurR() = max(2, blurR*K)`, at both sites that build `baseField`.
- **SWEEP a sign you cannot derive.** A first reading argued a WIDER ramp lets the noise wander
  further; it is wrong, because widening also moves where the contour sits and gives it a
  better-conditioned place to track the polygon from. The sweep is monotone in both directions and
  is asserted as such, so the shipped value sits on a curve, not a cliff.
- **Refuse a value on a constraint, not on taste.** 0.112 lands exactly on the `max(2,…)` floor at
  the shipped `blurR=18`, so the knob would stop responding to `blurR` at and below its own default
  — **v2.49's "a scale relationship that stops scaling", one version later.**
- **A re-baseline that is invisible at the default extent is not worth its cost.** 0.25 is the last
  value that costs nothing anywhere, and it moves the app default's coastline dimension 1.034 ->
  1.038. 0.18 is the smallest value that changes it visibly (straight 67.6 -> 58.2) and it beats
  v2.56 on EVERY axis at 40 000 km at once.
- **A DETECTION threshold is not a CARVE threshold.** `riverCoarseEase` answers "does this stream
  EXIST" (v1.101, and it does: 34% -> 96% of land within reach of a river). It says nothing about
  whether the grid can hold that stream's VALLEY, and `carveRiverValleys` cuts a real trench into
  `field`. **v1.101 had already split a third consumer out for exactly this reason**
  (`_jpDrinkingCoarseEase`); the carve was a fourth and nobody split it.
- **The comb is that ease meeting a floor.** `enforceChannelDescent` floors every carve point at
  `sea-0.06`, so an order-1 headwater reaching the coast is cut BELOW sea level and floods, and the
  land between two adjacent floodings is left as a **one-cell bristle 39 km wide** — 21.3% of the
  coastline, against 12.8% at 800 km and 1.5% with the carve off.
- **Measure each half against its OWN off-state inside ONE build** (v2.39/v2.42/v2.55): restoring
  `PLATE_BASE_BLUR_K` to 0.35 makes the app default bit-identical to v2.56, which is what proves the
  whole-battery divergence is the blur and nothing else; `riverCoarseEase` is 1.0 at and below
  800 km, so the carve fix is a no-op at the default by construction. Both asserted.
- **v2.48's straightness metric is a BAD DETECTOR and must not be quoted again.** Its 4-direction
  collinear-run test reads **0.00%** for genuine chamfer octagons and **12.83%** for genuine
  Euclidean circles — it moves backwards — and reports 7.28% where a direction-agnostic PCA test
  reports **42.48%** on the same data, being structurally blind to a facet at an arbitrary angle.
- **REFUTED, so they are not re-chased**: the coast is NOT lattice-locked (period-45 harmonic
  **R4 = 0.0255** against **0.0247** for literal Euclidean circles and **0.7824** for literal chamfer
  octagons — v2.48's exact-EDT fix holds); the slivers are NOT triangular islands (6 land
  components, one holding 98.4% of land; filaments 1 cell wide with no taper, global axial R 0.247);
  the tan coast band is an ELEVATION band (`beachT = smoothstep(0.03,0,r)*0.6`, under 120 m) whose
  uniform offset is grid quantisation — median 2 cells at BOTH 39.06 and 0.78 km/cell; and **none of
  it is a scale defect** — PCA straightness is 42.5% at 40 000 km against **62.1%** at the app
  default. It is more LEGIBLE at 40 000 km, where one 32-cell facet spans 1 250 km instead of 25.
- **Disclosed, not fixed**: the coastline reaches dimension **1.074** against a real coastline's
  ~1.25, so this narrows the gap without closing it — the remaining lever is the noise amplitude
  (`beta`), a larger tuning question. `chamferDist()` and `_civCoastDistField`/`_civOceanDistField`
  still carry v2.48's 8% anisotropy; they feed placement, not terrain height.

### A comment that says a cost exists is not a measurement of it (v2.56, DCC-line file only)

Owner: *"check the code using the ponytail skill and see if we can speedup rendering time."*
`hash_gen1.js` vs v2.55 **ALL IDENTICAL**; verification is `tests/perf/probe_renderfields.js`
(22 assertions, which hard-error on v2.55) plus 4 headless.

- **The defect was documented, in place, for fifty versions.** v0.6 wrote *"R1/R2/R5/SDF fields
  below have no generation-keyed cache of their own (unlike `_seaHCache`) — they unconditionally
  rebuild every render call whenever their slider is on"* directly above the block. It was accurate
  and nobody attached a number to it. **9407 ms of one render, against 1219 ms of pixels.** When a
  comment names a cost, cost it.
- **Profile the path the USER takes, then the one underneath it.** `renderNow()` measures ~1 ms
  because the civ bake cache returns a hit (v1.92 measured exactly this and correctly stopped
  there). The 550 ms in `perf_gen1.js` is the cache-MISS render, and it is reached through
  `_civBakeRN`. A profile that only ever sees the hit concludes there is nothing to fix.
- **The fix already existed four lines above the bug.** `_seaHCache` keys on `_fieldGen`,
  `_seaShadeCache` on `state.sunAz+'|'+state.exag`. `renderFieldCached` is six lines generalising
  that; the eight call sites each gained one wrapper. Look up the file before writing a mechanism.
- **Assemble the key at the CALL SITE, never inside the helper.** A builder that later gains a
  parameter then has to name it exactly where it is passed. `_fieldGen` covers field, flow AND
  geoid (the geoid setter's own `_fieldGen++` exists for this), `_climGen` the biome raster's
  climate; slider value, `sunAz`, `seaLevel` and **which array `effFld` resolved to** are explicit.
- **One entry per name bounds the cache without an eviction policy** — and makes a return to an old
  key rebuild rather than resurrect a stale array. Asserted, because the lazy alternative is an
  unbounded map wearing a helper's clothes.
- **A cache that never invalidates passes "nothing was rebuilt" perfectly.** So assert the EXACT
  rebuild set per input, not that something was reused: `state.viz.ao` -> `{ao}`, `state.seaLevel`
  -> `{coastD,coastSDF,crest}`, `_climGen` -> `{biomeBD}`, **`_fieldGen` -> all eight**. Under-
  invalidation is a stale render; over-invalidation is the bug being fixed; both must fail.
- **A `_fieldGen` bump rebuilding everything is the CONTRACT, not a stampede** — my own first
  assertion called it one and was wrong (third self-inflicted probe failure this session). Every one
  of the eight is derived from the field.
- **`const` inside a function is not visible to a top-level helper.** The first cut closed over
  `_rfKeyBase` and threw `ReferenceError` on the first render.
- **What is NOT worth touching, measured rather than assumed**: at defaults the prologue is
  **0.1 ms** (all eight sliders off) and the per-pixel colour loop is **94%** of the render, rising
  to 97% with them on. v1.87 and v1.92 each profiled that loop and found no redundant computation;
  the only remaining lever is a LUT approximation, which trades the fidelity the owner has twice
  asked to keep. `carveRivers` (1717 ms of `generate()`) is real `streamPowerKernel` work (v2.32).

### Two floors on a deep-zoom plain, and neither is storage (v2.55, DCC-line file only)

Owner: *"improve the current 24bit one with the new heightmap LOD system"* -> *"(with this I mean
implementing C and D)"*. `hash_gen1.js` vs v2.54 **ALL IDENTICAL**; verification is
`tests/perf/probe_reliefloor.js` (19 assertions, which hard-error on v2.54) plus 14 headless.

- **THREE floors flattened that tile and v2.53 fixed the third.** Measured on one real LOD-7 plain
  tile: the relief gate removed **100.0%** of every synthetic octave (generation), the global
  hypsometric ramp gave **1 colour / 512 px** (display), and 16-bit storage kept 58 of 12 524
  heights. **Fixing any one alone still leaves a plate**, which is why A and B ship together —
  v2.53's own closing line already said storage "does not create data or make it visible."
- **A physical floor is keyed in METRES and converted once.** `SUBCELL_RELIEF_M = 3.0` through
  `subcellReliefFloor(detailAmp, metersPerUnit())`. **Keying it on cells or normalised height is the
  v1.60/v2.05/v2.07/v2.49/v2.51 defect a sixth time**; the resulting 7.250e-3 is a value, not a
  constant to copy. Inside the `max`, above the underwater fade — land-only by construction rather
  than by a second test, and deep ocean measures **0 m**.
- **Cross the worker boundary with a SCALAR when you can.** `opts.reliefFloor` adds no name to the
  pool's stringified function list, where a miss is a `ReferenceError` that v1.61's isolation turns
  into a **silently skipped tile**. `poolExtrasFree` names five opt-in extras and no scalar, so
  eligibility is unaffected — asserted, not assumed.
- **A rebased ramp must read a WORLD-WIDE field.** The per-tile min/max version was built, measured
  **142.4/255 at every boundary** and rejected — v1.29's rule, and §7D of the research doc says "do
  not do" in those words. `buildLocalReliefField` is separable, cached on
  `[GW,GH,_fieldGen,state.world,radius]`, and wraps in X only in world mode; the contrast factor at
  a shared column differs by **exactly 0**.
- **An 8-bit clamp is a HUE shift, not a brightness one.** The multiplicative stretch
  `s *= 1 + k*(t-0.5)` reaches 1.35 and `c[ch]*s` clamps per channel in the `Uint8ClampedArray`.
  `shL = clamp01(sh + k*(t-0.5))` moves the stretch into shading space and bounds `s` to the band's
  own `[0.4,1]`, so no channel can clamp at all. **Assert it on a real render**: no channel exceeds
  its own unshaded `hypso` value — the multiplicative form fails that immediately.
- **A single-channel ratio at low brightness is ill-conditioned.** The first replacement assertion
  failed at 1.875/255 with nothing wrong, because it compared one channel of two independent 8-bit
  renders. Use a least-squares scalar fit (measured 1.155/255).
- **The Biome view is excluded by AUDIT, not by scope.** All ~10 consumers of `r` there were
  classified and all but `grassCol`'s `d = 1 - r*0.16` are ABSOLUTE thresholds — rock
  `smoothstep(0.7,0.95,r)`, mangrove `smoothstep(0.08,0,r)`, `r>0.82` scree, geology
  `smoothstep(0.5,0.8,r)`, the `sin(r*90)` strata, three `r>0` land guards. Rebasing `r` there puts
  rock on a lowland plain. Biome gets part A through hillshade instead (run 35 px -> 20 px).
- **Measure each half against its OWN off-state inside one build** (v2.39/v2.42): omit
  `opts.reliefFloor`; reassign the shipped `localContrastK` to `()=>0`. `bounds` omitted still means
  v2.54's exact arithmetic, so the function is bit-identical off the LOD path by construction.
- **Regenerating a figure against shipped code can RETIRE a disclosure.**
  `docs/images/lod7_contrast_compare.png`'s C and D rungs were simulations, and D's used the
  multiplicative form — so the published figure described arithmetic the build does not use. The
  simulated steep control had reported a real −3.7% colour debit; the shipped code measures
  **433 / 5 px, identical to A**, because `localContrastK` is 0 at 2160 m and the additive form
  cannot clamp. **Every rung is shipped code now**, and the generator throws on a pre-v2.55 file
  rather than quietly drawing four rungs that are really two.
- **Re-baselines LOD tiles AND baked atlas chunks**, never `field` — which is why the battery is
  ALL IDENTICAL (it also never enables tiled LOD). A stale IndexedDB atlas keeps decoding and holds
  the old pixels, so it wants a re-bake; the flat `map.png` bake goes through `bakePixel` per pixel
  and is unchanged.
- **`tests/run.sh`'s default target throws, and has since the v2.24 fork.** v2.53/v2.54 named
  `packHeight24`/`atlasChunkHeight`/`GEN_PARAM_BLOCKS` unguarded, which is v2.32's own rule —
  *"it reads as 'no output', not as a failure."* All four regions are `typeof`-guarded now and v2.52
  runs again, but **`Cartalith Gen1 v2.22.html` still throws** on `carveChannelPath` and a tail of
  DCC-only names behind it. Pass a DCC file explicitly. Closing it properly is a fork-wide decision.

### The parameter dump reads back in (v2.54, DCC-line file only)

Owner: *"we have a text output for all current settings... can we do the same for import."* The
import could not be built honestly without fixing the export. `hash_gen1.js` vs v2.53 **ALL
IDENTICAL**; verification is `tests/perf/probe_geninfo.js` (21 assertions) plus 18 headless.

- **The dump's own caption promised reproduction and was false in three ways** — measured, not
  eyeballed: **27 generation-affecting values** missing or unreadable. `passes` and `hydro` blocks
  entirely, **16 of `climate`'s 22 fields** (the line hand-picked six), and five scalars that lived
  only in prose, where **`seaLevel` was rounded to a whole percent**. **Check what a caption
  PROMISES, not only what it prints** (v2.43's rule, on a different artefact).
- **ONE list, TWO consumers.** `GEN_PARAM_BLOCKS`/`GEN_PARAM_SCALARS` are emitted by the writer and
  consumed by the reader, so a block added later cannot land in one and not the other. A longer
  hand-list would have been the same defect again — **v1.72 BUG-A / v2.45: an explicit field list
  drops what it does not name.**
- **A paste is an UNTRUSTED-INPUT boundary** (v1.27). Type-matched against the reference,
  finite-checked, and **everything refused is reported BY PATH** — a NaN reaching `state.tect.plates`
  would not throw, it would quietly produce a broken world, and a setting that appears accepted and
  does nothing is indistinguishable from a broken one.
- **Recursion is bounded by the REFERENCE, not the input** — `genParamMerge` descends only where the
  reference itself holds an object, so a pathologically nested paste cannot outrun the real state.
- **Ordering is `#resSeg`/`#extentSeg`'s, not a new one**: extent assigned before `GH` is computed
  (`gridH()` reads the module global — **v2.37**), and the snapshot/rescale path only when the grid
  actually moves, or every GRID-unit coordinate lands wrong (**v2.44**).
- **`deriveFromWorldStructure()` must NOT be called here.** Invariant 5 forbids it outside the
  checkbox/archetype handlers, and it would **overwrite the imported `tect` with a re-derivation** —
  the dump already carries the derived values.
- **Verify by REBUILDING, with a control that must fail.** World A's dump applied over a different
  world B, through the real button, returns `field` bit-identical; the same round trip through a
  **v2.53-shaped dump does not**. Without that second half the probe would only prove the code runs.
- **Assert the click LANDS** (v2.46). It failed first and was diagnosed rather than assumed:
  `elementFromPoint` returned `#obGenerate`, because the setup gate (z-index 90) sits above the
  Settings modal (74) and the probe had generated through `evaluate()`, which never clears it. The
  app's own flow cannot reach the cog while the gate is up — the harness's gap, not a layering bug.
- **Scope is the owner's own boundary**: generation parameters only. Sculpt stamps, paint,
  settlements, ways, labels and icons are deliberately not in the lists — that is `exportZip()`'s
  job, and the panel says so.

### The height word widens to 24 bits (v2.53, DCC-line file only)

Owner: *"And we can't move to 32bit for example?"*, then *"let's mutate to 24bits."* The better
question — it superseded the per-chunk scale+offset design the research had recommended, and made
the fix free. `hash_gen1.js` vs v2.52 **ALL IDENTICAL**; verification is `tests/perf/probe_hgt24.js`
(10 assertions, 2 of which fail on v2.52) plus 11 headless.

- **The byte was already there.** `packHeight16` wrote `out[i*4+2]=0; out[i*4+3]=255;` and
  `atlasEncodeChunk` hands the `Uint8Array` straight to IndexedDB by structured clone — **no PNG, no
  compression anywhere in the height path** (the PNG beside it is the biome visual). Every baked
  1024² chunk already spent 4.19 MB and wasted half. **Check what a format already allocates before
  costing a widening.**
- **24 is where the container stops being the limit and the SOURCE becomes it.** `field` is a
  `Float32Array`; f32 carries a 24-bit mantissa. Measured on one real LOD-7 plain tile (12 524
  distinct source heights): 16-bit recovers **58**, 24-bit **all 12 524**, 32-bit **12 524 — not one
  more**. f32 ULP 4.110665157e-4 m against the 24-bit step's 4.110665402e-4 m: seven figures, the
  same 24 bits. **Do not widen past the precision the source actually carries.**
- **Alpha is deliberately NOT a data channel.** Byte 3 is equally free and equally unused, and it is
  the one premultiplication corrupts through `putImageData`/`toDataURL`. 24 bits is sufficient, so
  the hazard stays off the table instead of becoming a comment someone must keep honouring.
- **Encoding is decided by FIELD PRESENCE (`hgt24` vs `rg16`), never inferred from the bytes.**
  `atlasChunkHeight(rec)` is the one place that decides. Byte-inspection would have been wrong on
  exactly the tiles this fix exists for — **a genuinely flat tile has a constant low byte**, so
  content cannot discriminate 16 from 24. Both the suite and the probe assert the all-flat case.
- **Old atlases keep decoding; nothing is invalidated.** A depth-6 bake is 5461 tiles, so
  compatibility is one ternary rather than a forced re-bake. `packHeight16`/`unpackHeight16` **stay**
  — they read every existing chunk and any legacy `heightmap_rg16.bin`, and a reader/writer pair must
  not be half-deleted (v2.26).
- **Five surfaces, and the `rg16` NAME was the real cost.** Encode/decode, the two bake `atlasPut`
  sites, the atlas-ZIP round trip (which copies the payload opaquely, so `buildAtlasManifest` gained
  a per-chunk `enc` — absent ⇒ 16, so a pre-v2.53 archive still imports), and `exportRegionTiles`,
  now `tiles/refined_{r}_{c}_rgb24.bin` with `heightEncoding:'rgb24'`. A downstream reader honouring
  that manifest field keeps working; one ignoring it **fails loudly on the filename** instead of
  silently misreading.
- **The save fallback stays 16-bit on purpose.** `heightmap_rg16.bin` is a portable fallback beside
  the full-precision `heightmap.f32`, and this app never writes it (§15.2 forbids it in a tree).
- **Both new assertions that failed first were mine, not the app's**: a level-count bound 24 bits
  cannot meet because it saturates at the number of distinct *inputs*, and an f32-ULP probe that
  measured the binade **above** 1.0 (spacing 2^-23) rather than the one below (2^-24) — a factor of
  two, and the one the 24-bit grid matches.
- **Does NOT fix the other two floors, and must not be read as if it did**: the plain still carries
  5.92 m of relief (the gate) and still paints one colour in the Height view (the global ramp).
  Storage stops destroying data; it does not create data or make it visible.

### A sub-cell crater resolves IN the tile (v2.52, DCC-line file only)

Owner: *"Move forward with the tile refinement."* The thing v2.50 was the prerequisite for.
`hash_gen1.js` vs v2.51 **ALL IDENTICAL**; verification is `tests/perf/probe_cratertile.js`
(16 assertions, 2 of which fail immediately on v2.51) plus 15 headless.

- **The sub-cell truth is DATA, which is what makes this legal under v2.40's rule.** A crater is a
  continuous profile in `t = d/R` with a known centre, radius and amplitude; the coarse grid merely
  SAMPLED it. v2.50 established exactly what it holds below the draw floor — that profile at
  `R = floor`, amplitude scaled by `(r/floor)^2` — so the tile is re-evaluating a function, not
  inventing a feature.
- **The correctness question is double-counting, not resolution.** The coarse field already carries
  the smear and `amplifyRegion` upsamples it, so the tile REMOVES it (the same call, negated
  amplitude) before drawing the crater at its own radius.
- **And that is why the crossover is silent.** As `r -> floor`, `sc -> 1` and the two calls become
  the same profile with opposite signs, so the pass fades to EXACTLY nothing where the coarse grid
  starts resolving the feature. No blend, no threshold, nothing to tune — asserted for a crater and
  a volcano alike. Above the floor there is no registry entry at all.
- **ONE profile, and the refactor had to be bit-identical to earn it.** `craterAddAt` /
  `volcanoAddAt` are the profile and the stamps call them. They WRITE into the array term by term
  in the caller's own order, because `arr[i]+=a; arr[i]+=b` is not `arr[i]+=(a+b)` in float — a
  helper that returned a value would have silently re-baselined `field`, and the hash battery is
  what confirms it did not.
- **Measure by holding the WORLD rect fixed and varying tile resolution** (v2.40's own technique).
  `tileSize` 64 -> 1024 on one 40 000 km tile: changed pixels **3 -> 702** while the changed area in
  WORLD units holds at **11.20 / 11.09 / 10.97 / 10.99 cells²**, peak Δ converging 1.4e-2 -> 8.3e-2
  on the crater's own true depth. **Constant world area IS the proof.**
- **The tile worker pool stringifies a NAMED LIST, and a miss is SILENT.** `featureFieldTile`,
  `craterAddAt` and `volcanoAddAt` all had to cross it, or the pooled path throws `ReferenceError`
  inside the Worker and v1.61's isolation turns that into a skipped tile. The record layout crosses
  too and is **generated** from the module constants, never retyped — a retyped copy would mis-read
  every stamp instead of failing. `poolExtrasFree` is a WHITELIST of five opt-in extras, so adding
  `featureStamps` to `opts` correctly keeps the batch pool-eligible, which is exactly why the names
  were needed.
- **Seam-free for v1.29's reason**: no spatial neighbourhood, a pixel depends only on its own world
  coordinate and the world-wide registry, and that coordinate uses `addZoomDetail`'s literal
  expression. Real adjacent tiles agree at **Δ = 0.00e+0**.
- **The registry is flat and bounded** — a `Float64Array` of ten-slot records so the pool clones one
  buffer, capped at `FEATURE_TILE_MAX` keeping the LARGEST when it binds. 117 records at 40 000 km,
  **3 at the app default**, where the worst tile moves 3.1e-3 of the height range: the pass earns
  its place on large maps and is nearly inert on small ones.
- **What is NOT drawn**: the physical model produces ~1 040 000 craters at 40 000 km and stamps
  3 000. The rest were never given positions, so drawing them would be inventing — v2.40's rule from
  the other side.
- **Disclosed, not fixed**: a project opened from a `.zip` has no registry (`loadZip` restores
  `field` rather than re-stamping), so its tiles refine nothing — the correct degradation, since
  subtracting a smear from a field that may not contain it is worse than leaving it. The smear is
  subtracted as WRITTEN while the coarse field has since been eroded and carved; the residual is
  bounded at both ends (~1e-5 of the range where it matters, cancelled at the crossover) but is not
  zero. Everything taking a TILE gets the refinement (LOD cache, refine loop, region-tile export,
  baked atlas — all four call `pyramidTile`), but the flat `map.png` bake reads the coarse field per
  pixel through `bakePixel` and does not, so an exported flat image still carries the smear.

### A crater's depth belongs to its diameter (v2.51, DCC-line file only)

Owner: *"And adopt a depth to diameter ratio for craters."* v2.50 measured this and left it as the
owner's call because it is a look decision, not a scale fix. **A deliberate re-baseline of every
world generated from a seed**; `hash_gen1.js` vs v2.50 diverges everywhere, and with craters +
volcanoes OFF on both sides it is ALL IDENTICAL. Verification is `tests/perf/probe_craterdepth.js`
(15 assertions, 3 of which fail immediately on v2.50) plus 12 headless.

- **`depth = min(0.4, 0.02 + radCells*0.004)` keyed a normalised HEIGHT on a radius in CELLS**, so
  the same crater got shallower every time the map got wider: one 10 km crater measured **1550 m at
  200 km, 491 m at 800 km, 194 m at 5 000 km, 145 m at 40 000 km**. The v1.60 / v2.05 / v2.07 /
  v2.49 real-km defect once more, in the depth law rather than the radius.
- **Pike 1977, both branches**: simple `d = 0.196 D^1.010` km (a flat **1:5**), complex shallowing
  as `D^0.301` (**1:11** at 10 km, **1:34** at 50 km, **1:91** at 200 km). Measured on the shipped
  function, not quoted from the paper.
- **The published complex branch does NOT meet the simple one, and a generator cannot have that.**
  383 m against 635 m at the transition — a **1.66x step**, i.e. two craters of near-identical size
  coming out two-thirds different. It is an artefact of fitting two populations. Keep the EXPONENT
  (the physics) and re-anchor the branch on the simple one's own value at the transition;
  continuity is asserted, 634.3 m vs 634.6 m across it.
- **The one free parameter is fixed by a relation, not chosen.** The transition diameter scales as
  **1/g** (Melosh 1989): Moon 19.4 km, Earth 3.2 km, and `g_earth/g_moon = 6.05` against
  `19.4/3.2 = 6.06`. This file already carries `state.planet.g`, so a low-gravity world gets its
  wider simple-crater regime for free.
- **Measure what the stamp DRAWS, not what the formula says.** Pike's `d` is rim crest to floor;
  this stamp's floor is `-depth` and its rim crest `+0.25*depth`, so it draws `1.25*depth`
  crest-to-floor and would have overshot by a quarter. `CRATER_RIM_FLOOR_K` divides it out and the
  assertion measures a real stamp on a real world (**D 3.1 km -> 613 m drawn against 620 m wanted;
  D 31.3 km -> 1260/1260**).
- **State the size of a re-baseline.** Mean crater depth at the app's own default moves **194 m ->
  558 m (x2.87, worst x3.2)**; at 40 000 km, x3.98. Rim height and the central peak are fractions
  of `depth`, so they scale with it; the `0.4` ceiling is untouched and still essentially never
  binds.
- **A moved coastline exposed an older bug, and the suite caught it.** `landmassKey` quantises a
  centroid to an 8-cell block (v2.20's reason: a name must survive a small sculpt edit), and **two
  landmasses in one block therefore shared a key, a generated NAME and an entry in
  `state.landmassNames` — so renaming one renamed the other.** Measured: two distinct islets,
  68 km² and 20 km², both `lm:8,19,777`. The block stays; a COLLIDING entry refines to 4/2/1 cells
  until it stands alone, and **the LARGEST member of a colliding group keeps the coarse key**, so
  the dominant landmass's identity and any rename already saved against it are untouched. A world
  with no collision keeps every v2.20 key exactly, asserted.
- **Disclosed, not fixed**: the crater RIM height is still a flat 0.25 of depth rather than the ~4%
  of diameter the literature gives (159 m against ~120 m at D=3 km — the right order, not
  calibrated); the `large`/`basin` flags are still absolute km rather than the g-scaled transition
  diameter this version introduces; `stampOneVolcano` was already real-metre keyed and is untouched.

### A floor that INFLATES is not a bound (v2.50, DCC-line file only)

The crater/volcano half of the zoom work, and the finding is not what that item assumed: a sub-cell
crater is not MISSING from the coarse field and waiting to be refined, it is **manufactured** there at
up to 380x its own size. Refining it would have faithfully upscaled a feature that should not be
visible. Verification is `tests/perf/probe_craterscale.js` (15 assertions, 2 of which fail
immediately on v2.49) plus 9 headless.

- **v1.60's own comment claims the floors handle this case, and it is false — the v2.37 shape, third
  occurrence.** Directly above `clampFeatureRadiusCells` it says only a CEILING is needed because
  *"the existing `Math.max(...)` floors already handle the opposite, world-scale
  vanishing-to-sub-pixel case."* They widen the FOOTPRINT and leave the AMPLITUDE alone. **A floor
  that inflates is the opposite of a bound**, which is v2.49's own lesson about the shared
  `TERRAIN_DETAIL_MAX_K` cap, arriving from the other direction.
- **Measured, legacy path, seed 12345, 100 craters**: floored 3 / 16 / 43 / 94 / **98** of 100 at
  800 km/2048px, 800/1024, 800/512, 5 000/1024, 40 000/1024 — depth budget kept x0.9987 / x0.9542 /
  x0.8125 / x0.2823 / **x0.0312**. At world extent **96.9% of the crater material was the floor's**.
  Monotonic in cell size, not a cliff at one extent.
- **The volcano half is starker because nothing damped it.** `H` is `(heightM/state.peakM)*...`, keyed
  on real metres and so completely independent of how many cells the cone spans. 99.8% floored at
  40 000 km, p50 drawn **78.1 km across against a true 8 km at full height**. At the app default that
  floor binds on **0%** of volcanoes — which is exactly why it survived.
- **The floor stays; the amplitude is corrected.** Both stamps compute `t = d/R`, so `R = 0` is
  `0/0`, and the loop must touch a cell or a sub-cell feature writes nothing at all. Check what a
  guard is guarding before removing it (v2.49, again). `subCellStampScale(r,floor)` is `1` at and
  above the floor, `(r/floor)^2` below.
- **The AREA ratio is the conserving one, and it is asserted on the real stamps rather than on the
  formula.** Both profiles integrate to amplitude x R^2 (`depth*(1-t^2)` gives `depth*pi*R^2/2`;
  `H*(1-t)^p` is the same family). A volcano's height is r-independent, so its material must come out
  exactly proportional to `r^2` with no step at the floor — 0.267774 / 0.267782 / 0.267783 /
  0.267783. A crater's depth law carries its own `r` term, so the invariant is
  `vol/(depth(r)*r^2)` — 1.44015 / 1.44080 / 1.44082 / 1.44081. **State the crater invariant that
  way deliberately**: it shows the conservation is exact and the whole residual is the depth law's.
- **`impactField` and `volcanicField` are area-weighted too.** Both are `max(existing,(1-t)*...)`
  markers; leaving them would have let a crater covering 0.6% of one cell claim full impact intensity
  over nine. They feed resource potentials, so those move — disclosed, not incidental.
- **Isolate a re-baseline or the claim is unfalsifiable.** `hash_gen1.js` diverges in every scenario
  because the battery runs at 512px, where 43 of 100 craters are floored. **With craters AND
  volcanoes off on both sides it is ALL IDENTICAL** — that is what proves the divergence is this and
  nothing else. At the app's own default the crater depth budget moves **0.13%** (3 of 100, worst
  175.7 -> 152.7 m) and `volcanicField` is byte-identical.
- **Disclosed, measured, deliberately NOT fixed**: `depth = min(0.4, 0.02 + radCells*0.004)` keys
  crater depth on radius **in CELLS**, so one 10 km crater is **141 m deep at 40 000 km against 491 m
  at 200 km**, and 0.07x-0.25x of a simple crater's ~1:5 depth-to-diameter. The v1.60/v2.07/v2.49
  real-km defect again, in the depth law rather than the radius — and fixing it makes craters
  **4-14x deeper at EVERY extent including the default**, which is a look decision, not a scale fix.
- **Also disclosed**: the physical model produces **1 040 000** craters at 40 000 km and stamps
  **3 000**, and **16.4%** of the full population survives wear — so ~167 000 real craters are dropped
  by the stamping ceiling, not "already lost to erosion" as its own note implies. They were never
  given positions, so drawing them at tile resolution is **inventing, not refining** (v2.40's rule).
  Tile-resolution crater refinement is still unbuilt; this version is the prerequisite it needed.

### A scale relationship that stops scaling (v2.49, DCC-line file only)

Owner, on a 40 000 km world: rivers read as uniform lines at every zoom. **Two clamps, stacked**, and
neither is an LOD problem — no tile refinement can recover width information the generator never
produced. `hash_gen1.js` vs v2.48 ALL IDENTICAL at the default; verification is
`tests/perf/probe_riverwidth.js` (11 assertions, 4 of which fail on v2.48) plus 3 headless.

- **The real-km family saturates at mapWidthKm 12 800 and nothing said so.** `riverWidthScaleK` shared
  `1/TERRAIN_DETAIL_MAX_K` as its lower bound, so at 40 000 km it wanted 0.02 and returned 0.0625 —
  an Earth-sized map sitting **3.1x beyond the point where "real-km-aware" became "constant"**. **The
  shared cap is asymmetric in its harm**: on the small-map side it correctly stops a river being
  exaggerated into a band of cells; on the large-map side it holds the channel too WIDE, i.e. the
  opposite of bounding. `RIVER_WIDTH_MIN_K` is its own constant now. **`orogenyWidthScaleK` has the
  same saturation and was deliberately NOT touched** — different subsystem, own calibration (v2.36).
- **The floor cannot be zero, and that is why one exists.** Both consumers divide by the width —
  `buildRiverNetwork`'s `t = 1 - d/halfW` and `enforceChannelDescent`'s `t = d/halfW` — so `halfW = 0`
  is `0/0` and a NaN in the field. Check what a guard is guarding before removing it.
- **Every river on the planet was ONE width.** `halfW` floors at 0.5 cells, and with `widthK` stuck at
  0.0625 the largest value the formula can produce (order 6, max discharge, max `slopeFac`) is
  **0.3656** — so every channel of every order clamped and `halfw[]` was uniformly 0.5: a **39.06 km
  band** for the trunk and the trickle alike, four times the Amazon. Now 0.079 / 0.158 / 0.251 /
  0.265 km by Strahler order.
- **The floor is dead weight on the RASTER, which is what makes this a renderer fix.**
  `r = ceil(halfW)` is 1 for any `halfW` in (0,1), so the only distances in reach are 0, 1 and sqrt(2);
  only `d = 0` passes; and there `t = 1` regardless. Verified by reproducing the loop at 0.04 / 0.12 /
  0.366 / 0.5 / 0.9 — one cell, t=1, every time. So the stamp keeps the floored value and `halfw[]`
  carries the true width to the only two things that read it: `drawRiverWays`' v2.25 crossover and
  `riverFieldTile`'s v2.40 zoom resolution — **both built to do exactly what was asked, both receiving
  a constant.**
- **A width parameter that also sets a sampling rate is not a width parameter only.** Above 12 800 km
  `field` does move, and a first reading of this change said it would not: the carve's own `halfW`
  stays sub-cell so its stamp is identical, **but v2.30's `carveChannelPath` takes `halfW` and derives
  its RESAMPLE STEP from it** (`step = min(0.5, halfW*0.5)`), changing the point count and hence the
  enforced `drop`. Grep every consumer of a constant before claiming bit-identity.
- **Observed, not tuned**: `slopeFac = 1/(1+5*|grad|*W)` suppresses the final width ~11x on this world,
  which is why the trunk lands at 1.6 km rather than an Amazon's 5 km. Physically the right direction
  (mountain streams narrow, lowland rivers wide) with no evidence of mis-calibration, so it is left
  alone rather than tuned to make one number look better.

### A distance transform's error is DIRECTIONAL (v2.48, DCC-line file only)

Owner, on a 40 000 km world at deep LOD zoom: *"still unnatural geometric shapes."* **Not an LOD
defect** — the straight edges were already in the coarse `field`, so v2.47's C¹ reconstruction could
not touch them. **A deliberate re-baseline of every world generated from a seed** (owner's explicit
choice); `hash_gen1.js` vs v2.47 diverges on `field`/`temp`/`rain`/`flow`/`rgba` in every scenario.
Verification is `tests/perf/probe_platedt.js` (8 assertions, 5 of which fail on v2.47) plus 7 headless.

- **Measure the DIRECTION of a transform's error, not its magnitude.** `distanceToBoundary()` was a
  two-pass 3x3 chamfer: error **0.00% at 0°, 45° and 90°, +8.15% at 22.5° and 67.5°**. That is not
  noise — its level sets are **octagons with flat facets**, and a mean error would have read as a
  harmless few percent. `docs/images/plate_dt_octagons.png` vs `plate_dt_circles.png`.
- **That field is `ageField`, and the height formula spends it as the NOISE AMPLITUDE** —
  `rug = exp(-age*(1+ageInf*6))`, then `B*N*(0.25+0.75*rug)`. So terrain ROUGHNESS inherited the
  octagons and the world grew facets whose edges can only run at 0/45/90/135°. It also feeds
  `resistanceField`, so the same octagons steered erosion. **Before trusting a scalar field, ask what
  spends it.**
- **Diagnose from the DATA, not the render.** The decisive first measurement was run-lengths of
  exactly-collinear coastline cells in the coarse `field`: long runs existed **only** in V, H and the
  two diagonals, never between. That is a chamfer's fingerprint, and it ruled the LOD layer out in one
  step. Plate boundaries were tested and **refuted** (straight cells near one 2.3% vs 3.2% for
  ordinary coast — no correlation).
- **A defect can be present always and legible only at one scale.** Sea level landed at 0.7455, so
  `metersPerUnit = peakM/(1-seaLevel) = 34 770` against the default's 5 000 — ~7x amplification — and
  at 40 000 km one facet spanning 20 cells is 780 km. **Do not conclude "not reproducible at the
  defaults" means "not a bug".**
- **The same function did not wrap in X.** In world mode the seam column believed it was maximally far
  from every plate boundary: **251 against a true 5**, and that one column held 63 of the world's 173
  straight coastline cells. Region mode must NOT wrap and still doesn't — the probe asserts both.
- **`euclideanDist` is exact (Felzenszwalb & Huttenlocher 2012), separable and O(n)** — the same cost
  class as the chamfer, ~2x its constant (320 → 660 ms at 4K, once per `generate()`). Exact means
  there is no residual anisotropy left to tune. `_EDT_INF = 1e18` is squared and `sqrt(1e18) = 1e9`,
  which preserves the old "unreachable" sentinel so both callers' `dRaw[i] < 1e8` still works.
- **What is left is now the RIGHT straightness.** Straight cells near a plate boundary went from
  9.8% vs 8.0% (uncorrelated — the artefact) to **15.6% vs 7.8%** (twice enriched). A straight coast
  on a rift margin is real geology; a straight coast at 45° to the grid is not.
- **Still chamfers, deliberately untouched**: `chamferDist()` and the civ layer's
  `_civCoastDistField`/`_civOceanDistField` carry the same 8% anisotropy. They feed coast-distance
  tests and placement, not terrain height, so nothing renders it — but the octagons are in them.
- **`generationInfoText()` omits `state.passes`**, so the owner's paste could not reproduce their
  world exactly (−25 074 m against their −25 921 m). The button's own promise is "for reproducing this
  exact world". Not fixed here.

### Refinement reconstructs the surface; it does not facet it (v2.47, DCC-line file only)

Owner: *"I want the output at whatever zoom to be most natural looking."* Two defects in the one
height path every LOD tile takes. `hash_gen1.js` vs v2.46 ALL IDENTICAL (neither function is
reachable from the default render); verification is `tests/perf/probe_lodsurface.js` (12 assertions,
7 of which fail on v2.46) plus 5 headless ones.

- **Bilinear is C⁰ and all three tile renderers DIFFERENTIATE it.** `amplifyRegion`/`addZoomDetail`
  reconstructed the coarse height bilinearly, which is exactly linear inside a coarse cell and kinked
  across every boundary — so the surface is a mesh of flat facets with a crease between each pair.
  Measured second difference: **3040× higher on a boundary than inside a cell**, and the interior
  reads float noise (7e-17 on the raw array) because bilinear has **no curvature there at all**. That
  is the "blocky when I zoom" report. `sampleC1` (Catmull-Rom) takes it to **1.51×**.
- **The filter must be INTERPOLATING, or it stops being reconstruction.** Catmull-Rom reproduces the
  coarse field exactly at coarse nodes (asserted, max |Δ| = 0), which is what makes this legal under
  v2.40's rule rather than a different surface. It overshoots the local cell range on 1.0% of samples,
  worst 1.2e-3 (~6 m at the default 5000 m/unit) — bounded, and the existing `[0,1]` clamp still holds.
- **`fbm` is SIX internal octaves at lacunarity 2**, so its content reaches 32× its nominal frequency
  and the ladder multiplies that again. Above the tile's sampling rate it can only alias, and aliased
  noise **re-randomises when the sampling grid moves** — that is a surface that boils as you pan.
  `detailBandWeight` fades an octave out approaching two tile pixels; measured half-pixel shift
  stability on a large world (`detailFreq` 16, v2.05's real-km scaling): **−52.8%**.
- **Fade an unresolvable octave toward ITS OWN MEAN, never toward zero** (Quilez's band-limiting
  rule). Toward zero leaves a DC shift and the terrain sinks.
- **The default world measures UNCHANGED and that is the right answer.** At `detailFreq` 1 nothing in
  the ladder is above the tile's sampling rate, so there is nothing to remove. The band-limit earns
  its place on large maps only. Do not read that as a weak result and "strengthen" the cutoff.
- **The level counter is no longer an input.** `extra = min(6, z-zBase)` made one world point a
  different height at z=3 and z=5 — adding terms, not resolution. v0.126's own assertion held `W`,
  `H` and `b` fixed and raised only `z`, i.e. **it asserted the defect**; its replacement asserts the
  contract and fails on v2.46 both ways — at a fixed sampling the level no longer moves the height,
  and refining the sampling reveals more (on v2.46 a 4×-finer sampling measures **less**, 5.77e-3 →
  5.70e-3, because unresolvable noise merely re-randomises).
- **Seams stay EXACTLY 0** — both samplers are pure functions of the world coordinate reading the full
  `src`, so `refineTile`'s shared-edge coordinate lands on the identical value from either neighbour.
  A wider stencil does not change that; blending would have.
- **The tile worker pool stringifies a NAMED LIST**, so a helper reached from `amplifyRegion` but
  absent from that list is a `ReferenceError` inside the Worker — which v1.61's per-tile isolation
  turns into a **silently skipped tile**. `tests/run.sh` exports `ENGINE_SRC_PATH` so the suite can
  check the list by name, and fails loudly if the harness stops providing it. **Add any new
  refinement helper to that list in the same edit.**
- **Scope**: `opts.legacyFilter`/`opts.legacyBands` restore the old arithmetic verbatim (that is how
  the comparisons are measured inside one build). `ridged` keeps the unbanded path — its octave mean
  is not 0.5, so fading toward 0.5 would bias it, and `lodTileOpts` never sets it. `burnChannels`,
  `featureDetailPass` and `tileErode` have their own samplers, all opt-in, untouched. This
  re-baselines **LOD tiles and baked atlas chunks**, never `field`.

### A control the cog hides is a control a click cannot reach (v2.46, DCC-line file only)

Owner: *"it seems the button for the asset manager has gone."* It had not — v2.24 moved
`#assetsHeaderBtn` into the cog's Settings window, so it was in the DOM, correctly wired, and never
visible. Markup + CSS only; `hash_gen1.js` vs v2.45 ALL IDENTICAL; verification is
`tests/perf/probe_assetsbtn.js` (14 assertions, 8 of which fail on v2.45).

- **Assert that a real click LANDS, not that a class name is right.** On v2.45 every DOM query about
  this button passes — it exists, it is wired, its label is correct — and `page.click` times out with
  `element is not visible`. That timeout is the whole report. (v2.15's lesson one step further:
  asserting a class name is not asserting visibility; asserting visibility is not asserting
  reachability.)
- **v2.24 split one toggle into two half-controls.** `_carEnterAssetsMode` already relabels the button
  `← Map`, adds `.on` and sets `aria-pressed` — it was built for a header slot. Hiding it broke the way
  IN and left the way OUT, so v2.24 added `#assetsBackBtn` to stand in for the half it had hidden.
  **v1.57's one-control-two-surfaces defect.** The toggle moves back; the stand-in is retired.
- **"The cog owns program scope" is right, and the Library is not program scope.** Everything else
  v2.24 put there (GPU, Tiled LOD, Atlas cache, Region export, autosave, 3D view, theme, the parameter
  dump) is a setting. The Asset Library is a MODE you enter — it takes the whole stage, hides the docks
  and the rail, and replaces the map. Nothing else in this app is reached from behind a cog.

### The rasters move with the grid too (v2.45, DCC-line file only)

v2.44 rescaled the vectors on a resolution/extent change and disclosed the rest as a line: per-cell
rasters "do not [survive] and are recovered from Recalculate Territories". Owner: *"Now fix the
territory and timeline rasters too."* Measuring what that line covered found it was wider than
stated. `hash_gen1.js` vs v2.44 ALL IDENTICAL; verification is `tests/perf/probe_worldreset.js`
(35 assertions, 11 of which fail on v2.44).

- **The disclosure named the rasters and missed the faction metadata, which is the half with teeth.**
  Measured 512 -> 1024: territory 96 659 cells -> **0**, both timeline years -> **0**, the year
  cursor 100 -> 0, and faction 1's culture/religion/government/ag-tech
  `maritime/sunCult/republic/earlyIndustrial` -> **`imperial/none/monarchy/traditionalAgrarian`**.
  `_civSyncFromState` rebuilds each of those four **from a default whenever its field is missing**,
  and the civ `generate()` wrapper had just emptied `state.civ`. `civFactionNames` survived only
  because its own line has no `else` — that asymmetry is what kept the rest invisible. **v1.54 makes
  `factionAgTech` drive `foodSurplusRatio`**, so a resolution change silently reverted that lever —
  v1.54's own measurement of the Early-Industrial-vs-Traditional gap is 2.66x on a settlement's food shed.
- **An explicit field list drops what it does not name — v1.72 BUG-A, third occurrence.** v2.44's
  snapshot listed places/labels/icons/ways/journeys and everything lost above is something that list
  never mentioned. The fix is NOT a longer list: `worldContentSnapshot()` captures **the whole of
  `state.civ`**, i.e. `_civSyncToState`'s own output — the serializer `exportZip` already trusts —
  so a field it gains later rides along for free.
- **The snapshot carries its own `GW`/`GH` and the restore derives the scale from them.**
  `restoreWorldContentScaled(snap)` takes one argument now; a call site can no longer hand it the
  wrong factors.
- **Resample INVERSELY.** Territory and each timeline entry's history are sparse
  `[cellIndex, factionId, ...]` pairs, so every index is a statement about the grid that made it.
  `_rescaleCellPairs` walks the NEW grid and reads the old cell beneath each new one. The forward
  direction is the trap: at 512 -> 1024 one old cell becomes four new ones and a forward map fills
  one of them, so **a solid faction border comes back at quarter density**.
- **Nearest-neighbour is the only correct filter here.** A faction id is a LABEL, not a quantity —
  interpolating between two of them invents a third faction along every border.
- **A timeline entry is a whole frozen world, not just a raster.** Its own `places` and `ways` carry
  grid coordinates, and `_civYearDiff` compares them by `tid` across years, so an entry left at the
  old scale draws its ghosts in the wrong place. Same `_rescalePt` as the live vectors.
- **Fraction is the invariant under an extent change; COUNT is not.** region -> world takes the grid
  from 167 936 cells to 131 072, so territory measured 95 482 -> 74 525 cells at an unchanged 0.5686
  of the map. That is why the scale is applied per axis.
- **Range alone does not prove a remap** — a copied index list is still in range on a LARGER grid.
  Assert both: every index in range AND the maximum grew with the grid (167 618 -> 670 085 of
  670 720).
- **`_jpStopKey` embeds the settlement's GRID coordinates** (`name|kind|x.toFixed(1),y.toFixed(1)`),
  and `jn.layovers` is keyed by it — so rescaling a settlement detaches every planned rest day from
  its stop. Measured on v2.44: the stop stays on the route, the 3 days stay stored, and nothing joins
  them, so it reads as no layover rather than as an error. Remap with **the same function that made
  the key**, read either side of each place's rescale — never re-derive the format.
- **`_civYearDiff`'s cache is keyed on `civYear` alone**, so it survives a restore that puts the
  cursor back on the same year while holding references to the entries just replaced — and the ghost
  overlay draws from `prevEntry.places[].x` / `prevEntry.ways[].pts`. `_civSyncFromState` invalidates
  it now, which fixes the same shape on `loadZip`.
- **Still not carried, deliberately**: the Cartography paint rasters. `generate()` has dropped those
  since v0.146 because a hand-painted terrain override does not survive a terrain rebuild, and a
  resolution change genuinely rebuilds the terrain. Territory is political, not terrain-derived,
  which is the distinction. `civProvince` is not carried either — it is pure-derived from territory
  and `state.places`, so it regenerates from the restored territory.

### The other four construction paths (v2.44, DCC-line file only)

v2.43 fixed one path and its own note said there were three. **There are five `allocate()` sites** —
`generate()`, `loadZip()`, `loadImage()`, the region extract, and `resSeg`/`extentSeg`. Audited by
measurement. `hash_gen1.js` vs v2.43 ALL IDENTICAL; verification is `tests/perf/probe_worldreset.js`
(21 assertions, 17 of which fail on v2.43).

- **`loadImage()` had the identical v2.43 defect and is reachable while finalized.** `#loadBtn` and
  `#file` carry no `[data-genlock]`, so Import heightmap works on a finalized world — and the path
  reset nothing. Measured: `finalized` survived (**153/153 locked, Layers 8 of 34**) along with the
  previous world's settlements, roads, journeys, territory, paint, undo stack and atlas key, at
  `flowSum 0`. An imported heightmap is a DIFFERENT PLANET; it may keep none of that.
- **The reset is one function now.** Three call sites had each grown a partial copy and each was
  missing a different subset — the shape this file has paid for repeatedly. `generate()` deliberately
  keeps its own inline copy: it is the reference, it is the hottest path, and it must NOT call
  `setFinalized(false)` (its own finalized guard returns before that point by design).
- **Coordinates are in GRID units, so a resolution change moved everything.** 512→1024 took a
  settlement from 68.8% across the map to **34.4%**, the label from 25% to 12.5% — all 43 settlements
  into the top-left quadrant — **and all 90 roads were destroyed outright.** Owner chose rescale:
  snapshot before, scale **per axis** (an extent switch also changes the aspect, 1.56:1 vs 2:1, so
  one factor would be wrong), restore after. Vectors rescale exactly; per-cell RASTERS (territory,
  timeline history, paint) do not and are recovered from "Recalculate Territories" — a disclosed line,
  not an omission.
- **A comment claimed a guard the code has never had.** The civ `generate()` wrapper opens `// Only
  clear if _imported flag is false (fresh procedural world)` and then clears `civWays`/`civJourneys`/
  `civTerritory`/`civTimeline` **unconditionally** — which is why a resolution change deleted every
  road while keeping the settlements, an inconsistent half-clear nobody had reason to look at. The
  v2.37 lesson again. The clear itself is left alone (for a real reseed, roads crossing new geography
  would be wrong); the resolution handlers snapshot around it.
- **Two session globals live outside `state`, so no `state` reset can reach them.** `loadZip`'s v2.11
  civ reset is correct and was verified not to be the problem — a first reading of the audit called
  it a leak and that was **a poisoned fixture**: `generate()` deliberately keeps settlements, so the
  "clean" export had already captured the ghost. Re-measured in isolation, four variants, all clean.
  What genuinely survived was the sculpt DRAFT stack and `_setupSkipped`, whose v2.15 contract is
  "gate hidden ⟺ a world exists".
- **Measure with REAL data before believing an audit.** Hand-injecting `civWays` and re-reading it
  showed ways surviving `generate()`; building a real 47-settlement world through
  `_civIterativeAutoWorld` showed all 81 destroyed. The synthetic fixture bypassed the block-2 sync
  that does the destroying.

### A new world must not inherit the old world's state (v2.43, DCC-line file only)

Owner, on a region exported as a new map: *"I can't modify terrain or change generation settings nor
do I have the layers available."* Three symptoms, **one** signature. `hash_gen1.js` vs v2.42 ALL
IDENTICAL; verification is `tests/perf/probe_regionworld.js` (20 assertions, 12 of which fail on v2.42).

- **`state.finalized` is a property of a WORLD, and "Extract as new world" builds a new one.** It was
  the only world-construction path that never cleared it — `generate()` and `loadZip()` both do.
  Extracting from a finalized parent therefore produced a fresh world that arrived locked. Measured:
  **152/153 `[data-genlock]` controls disabled, Layers 8 of 34** (`buildLayersPopover` filters to
  `LAYER_EXPLORE_SUBSET` when finalized), `_sculptEditorActive()` false, and `generate()` returning
  early with a bare `console.warn('generate() blocked: world is finalized')` — **silence at the UI**.
  `params.json` carries `finalized`, so every save made from that world reopened locked.
- **Diagnose the SIGNATURE before the feature.** Nothing in the region path sets `finalized`;
  `setFinalized(true)` has exactly one caller (the bake-all button). Toggling it on an ordinary world
  reproduced all three reported symptoms exactly, which is what identified the inherited flag rather
  than anything about region extraction.
- **A false `finalized` is not just a lock, it is a CLAIM** — "the baked Atlas covers the whole map at
  every level". `worldKey()` had just changed (`af077385 -> c6db7d48`), so the parent's atlas covered
  none of the new world, and `exportZip()` believed the claim anyway: `skippedFlatBake =
  !!state.finalized` wrote **15.1 MB with no `map.png` and no `tiles/`**. Check what a flag PROMISES,
  not only what it disables.
- **The extracted world had no hydrology at all until the calibrate gate was committed.**
  `allocate()` zeroes `flowField` and the handler refilled only climate, yet it calls `renderNow()` —
  so it presented a finished world with `flowSum` **0**, and every flow-derived layer (rivers,
  Strahler, wetness, resources, suitability) read empty. `inferTectonics()`'s v0.70 tail already ends
  `refreshClimate(); enforceRiverChannels(); computeFlow(true)` for exactly this reason on the import
  path. Now 7 454 176. **`state.mapWidthKm` must be assigned BEFORE that flow pass** — `riverFlowThresh()`
  divides by `riverCoarseEase(state.mapWidthKm)` (v1.101), so computing flow first sizes the
  channel-initiation threshold for the parent's extent.
- **`_treeRead` refuses a heightmap-less tree (§6.4); the FLAT reader did not.** `SAVEFILE_COMPAT.md`
  §6.1 makes the heightmap one of the two entries a conforming archive MUST carry, and the tree path
  has thrown since v2.11 — but a flat `params.json` with no raster loaded "successfully" and left
  `field` as `allocate()` zeroed it: **landFrac 0.74 -> 0, every control live, no alert.** The
  confusable archive is this app's own `region_*.zip` (params.json + tiles, by design not a project).
  **Ninth occurrence of two readers answering one question, and only one of them was checking.**
- **Throw before the state reset.** `loadZip`'s own catch promises "whatever was on screen is
  untouched"; the guard sits immediately after `pk` resolves, above the `state.civ={...}` clear, so
  that promise holds — asserted by comparing the field sum across a refusal.

### A control that computes everything and then shows nothing (v2.42, DCC-line file only)

Owner: *"make the seasons checkbox turn on the season slider too."* One `if`; the lesson is that v1.52
fixed exactly half of a two-sided link and the other half went unnoticed for ninety versions.
`hash_gen1.js` vs v2.41 ALL IDENTICAL; verification is `tests/perf/probe_seasonlink.js`.

- **Ticking "Seasons & Köppen climate" produced a byte-identical map, and that is by design one layer
  down.** `computeSeasons()` writes `tempJulField`/`tempJanField`/`rainJulField`/`rainJanField`/
  `koppenField` and **restores the annual `rainField`** (v0.93's own "the default annual path is
  untouched" guarantee). So the box allocates the data and the slider displays it, and with the
  slider at `annual` the box is a control that runs a heavy pass to change nothing on screen.
- **Prove inertness against the SAME build's own baseline, never an absolute.** Annual render A ->
  tick -> B -> force `state.viz.season=0` and re-render -> C. `A===C` (FNV `3576384877` both) is what
  establishes the defect; `B!==A` is what establishes the fix. On v2.41 `B===A` exactly. The v2.39
  lesson, reused: an absolute threshold passes on the broken build.
- **v1.52 already wrote the rules for this direction, and they hold unchanged**: only ever turns the
  other control ON, and only when it is still at its neutral value. So a Jan 40% blend survives a
  tick, and unticking does NOT reset the slider — the blend goes inert, `_seasonSliderNote()` says so
  in words, and re-ticking restores the user's own value rather than the default.
- **`SEASON_LINK_DEFAULT=1.0` is full July on purpose.** The point of the link is that ticking the box
  SHOWS you what you enabled; a partial blend on a temperate world can still read as "nothing
  happened", which is the complaint v1.52 existed to answer. It is a render blend, so one drag undoes
  it.
- **The map-view half of the gate is deliberately not forced.** `_seasonK` needs BOTH
  `state.climate.seasons` and `state.mode==='biome'`. Switching the user's chosen View out from under
  them is a bigger claim than revealing a render option, and the note already names that prerequisite
  — so the probe asserts `state.mode` is untouched.

### Rivers must reach the sea before they can build anything (v2.41, DCC-line file only)

Owner: *"it seems no river deltas are generated."* True — and the cause sat two layers above deltas.
`state.hydro={integrate,deltas}`, both default off, so `hash_gen1.js` vs v2.40 is ALL IDENTICAL and
`tests/run.sh` is untouched. Verification is `tests/perf/probe_deltas.js`.

- **`computeFlow` accumulated on the RAW `field` with no depression filling, so every local pit
  terminated accumulation.** Measured: **66.5% of land drained into an interior pit**; the single
  largest channel cell's receiver was a pit ~391 m ABOVE sea level; the largest flow reaching the sea
  was six times smaller than the largest on land; the drainage was 732 separate basins with a median
  of 3 channel cells. Max Strahler 2-3 world-wide, and **not one order-3 outlet across five
  seed/resolution/extent combinations.** A delta is a trunk-river landform and there were no trunk
  rivers — so "no deltas" was a symptom, and the same defect silently distorts everything keyed on
  river order (placement, water access, navigability, food-shed mode).
- **A plain priority-flood is not enough — it needs the EPSILON TILT.** Filling leaves a basin
  perfectly flat, and the receiver search requires `drop > 0` strictly, so a flat basin terminates
  accumulation exactly as the pit did. Each cell is raised to `max(own, neighbour + eps)`.
- **It never touches `field`.** The terrain keeps its pits; only routing sees them filled. That is
  what keeps lakes lakes — `buildWaterBodies` still classifies from the real surface, and a river now
  flows THROUGH a lake to its outflow instead of stopping dead in it.
- **`buildRiverNetwork` builds its OWN receiver tree, and it was still on the raw field.** Filling
  `computeFlow` alone moved accumulation and left the TRACED network unchanged — the two describe
  different objects, which is itself the defect. `opts.routeOn` threads one surface through both;
  `slopeF` deliberately keeps the REAL gradient, because it feeds `channelThreshold`, a statement
  about ground steepness rather than about where water goes. Absent ⇒ `rf===fld` ⇒ bit-identical.
- **Measure the terminus, not a flow ratio.** A max-flow-reaching-the-sea ratio reads 28.5% before and
  14.4% after, which looks like a regression and is not: in region mode the largest basin often exits
  via a **map edge**, a legitimate outlet, so the ratio measures the crop. Walking every land cell's
  receiver chain to its terminus gives the real answer — **pit 66.5% -> 0.0%**, sea-draining land
  x1.47, outlet Strahler 2 -> 3.
- **`routeSediment` could not build land however much sediment it was given.** Its sub-sea branch is
  `dep = min(load, (sea-h)*0.5)` and each cell is visited exactly once, so it closes at most half its
  own depth — an asymptote at sea level. Measured with the real carve supply: 45 612 sub-sea cells
  raised, 53 crossed sea level, **all 53 of them `recv<0` sinks pooling, not progradation**.
- **And the one river-mouth process in the engine runs the wrong way.** `coastalPass`'s estuary branch
  SUBTRACTS height at a major river's mouth (712 of 720 gate-matching cells lowered, mean -3.59 m per
  pass) — that builds a drowned valley, the opposite landform. It is also default-off, so the shipped
  engine had **no** mouth process in either direction. Land fraction around the 40 biggest outlets vs
  ordinary coast: +0.113 at r=4. The river just stopped at the shore.
- **Sediment is over-supplied ~60x, so the design problem is over-correction.** Routing the carve's
  whole eroded column builds ~11 900 km2 of new land — about 160 Mississippi deltas.
  `DELTA_DELIVERY_RATIO=0.10` sits inside the literature's 0.05-0.30 basin delivery-ratio band, and
  `isostaticRebound` already consumes that same column as uplift, so routing all of it would
  double-count regardless.
- **The wave term MUST carry a swell floor.** A naive onshore-wind projection gives **63% of mouths
  zero wave energy** — on a fixed wind field most coastline is a lee shore — which would make 63% of
  mouths river-dominated, the exact over-correction above. Real oceans get far-field swell regardless
  of local wind, so the floor is the physical term, not a fudge.
- **Pivot on the world's own R distribution, never an absolute cutoff** — the fourth time this file
  has had to (v1.25 sea level, v1.31 density, v1.34 food). The pivot is the R at the
  `DELTA_RIVER_SHARE` quantile, so ~10% of mouths land river-dominated whatever the world's discharge
  scale, matching Nienhuis et al. 2020's measured 80/10/10 over ~11 000 real deltas. Measured here:
  13 of 177 mouths, 330 km2 of new land, 78%+ of it within 14 cells of a mouth.
- **`opts.prograde` omitted ⇒ the exact former arithmetic**, so `depositSediment()`'s button is
  bit-identical by construction (the v1.98 `edgeCost` discipline), asserted directly.
- **Distributaries ride v2.40's single geometry set.** They carry per-vertex width from the same
  Leopold-Maddock `W ∝ Q^0.5` split the engine already uses, so they enter `riverRenderPolys` and BOTH
  the tile renderer and the vector overlay draw them with no second code path.
- **Disclosed, not implied**: the branch COUNT is driven by R, but the branch GEOMETRY is a fan over
  the real deposited lobe, not Edmonds & Slingerland's depth-over-bar bifurcation — that needs mouth-bar
  bathymetry this pass does not compute. No tide axis (Galloway's third leg) — `computeTideField` is
  default-off. `coastalPass`'s wrong-direction estuary branch and its own hardcoded
  `GW*GH*0.001` gate (2.5x the canonical `riverFlowThresh`) are left alone.

### Refinement adds resolution; it does not invent (v2.40, DCC-line file only)

Owner: *"a river goes from a line to an actual carved feature as you zoom in from a global map down to a
scale of meters"*, and the binding rule — *"refining the LOD doesn't mean we're making something new,
we're adding resolution."* `hash_gen1.js` vs v2.39 ALL IDENTICAL; verification is
`tests/perf/probe_rivertile.js`.

- **The river's sub-cell truth ALREADY EXISTS AS DATA, and that is what makes this legal.**
  `buildRiverNetwork` stamps `intensity[j] = amp*(1-dist/halfW)` and `depth[j] = d01*(1-dist/halfW)` —
  a LINEAR FALLOFF FROM THE CENTRELINE, i.e. a signed distance function that merely happened to be
  evaluated on the coarse grid. `traceRiverPolylines` returns that centreline as continuous geometry and
  `halfw` its real half-width, so the identical function evaluates at ANY resolution. The tile is not
  guessing what the coarse stamp meant; it re-evaluates the function the stamp was a low-resolution
  SAMPLE of. **Bilinearly sampling `intensity[]`/`depth[]` instead is the trap** — it is the "derive
  rivers from raster imagery" the owner's `river-lod-brief.md` forbids by name, and it gets blurrier at
  every level, never sharper.
- **The peak values are read off the CENTRELINE CELL, where dist=0 so t=1** — there `intensity[i]` IS
  `amp` and `depth[i]` IS `d01`. No formula is duplicated and there is no second width model to drift
  from `buildRiverNetwork`'s. Eighth occurrence of the "two functions answering one question" shape.
- **Measure resolution-vs-invention by holding the WORLD rect fixed and varying tile resolution.** One
  rect at 64/128/256/512/1024 px: channel area 121 -> 30 898 px<sup>2</sup> while its area in world units
  holds at 79.9 / 80.8 / 78.0 / 77.2 / 77.4 cells<sup>2</sup>. Constant world area IS the proof; a
  synthesizing pass would drift.
- **Width grows 1:1 with zoom for free**, because `halfW` is in GRID CELLS and the tile converts once by
  `1/cx` — the tile pixels per coarse cell `renderBiomeTileRGBA` already computes, which doubles every
  pyramid level. The symbol-to-true-scale crossover therefore lands at a DIFFERENT level for every
  river, which is correct: openstreetmap-carto derives the same crossover from the rendering pixel
  (`WHERE way_area > 1*!pixel_width!*!pixel_height!`) rather than picking a zoom, and its own ladder is
  `k^0.41` against this file's `baseW*sqrt(zoom)` = `k^0.50` — same family, within 20%. Do not retune it.
- **`RIVER_TILE_MIN_PX` does not bind where you would first test it.** At 64 px over a tenth of the map
  an order-3 trunk is already ~2 px wide — that is the crossover working, not the floor. Test the floor
  where it binds: the whole map in one coarse tile, where even the widest channel is sub-pixel.
- **v2.39's `||` REVERTS, and that is the point rather than a regression.** Its note said the v1.14
  double-draw hazard was "a property of the OFF-LOD per-pixel path ONLY" because LOD had no raster copy.
  True then; **false the moment the tile draws**. So `riverFieldTile`'s gate is `surfaceColor`'s own
  condition character for character, `drawLODView` goes back to the plain `riverWays` flag, and the two
  paths finally agree in both modes — which is what v2.39's disclosed scope cut asked for.
- **Seam-free by construction, not by luck.** v1.29's rule is that a per-tile pass with a spatial
  NEIGHBOURHOOD is a seam unless sampled from a world-wide field. This pass has NO neighbourhood: a
  pixel depends only on its own world position and the world-wide polyline set. Asserted directly —
  adjacent tiles agree on their shared column to <0.02.
- **`applyRiverWater` is the one blend**, shared by `surfaceColor`, `renderBiomeTileRGBA` and both bake
  loops. `bakePixel` is per-PIXEL with no tile bounds, so the bake evaluates the field once per strip or
  tile and blends after it returns, rather than growing a second river model.
- **An absolute blue-contrast threshold passes on a build that draws no river.** Carved valleys plus
  `landColorCore`'s TWI wetness term already make channel cells 21.2 bluer than the land around them in
  a bake with `showRivers` off. Key every river assertion to a DELTA against the same build's own
  suppressed baseline — the v2.39 lesson, which cost a probe that passed on v2.38.
- **Disclosed, not fixed**: `renderHeightTileRGBA` (the Relief/Height view) is still river-blind — it is
  an elevation ramp, not a biome view, so water colour there is a separate design question. The channel
  is still only as sharp as `field` carries it: `carveRiverValleys`' groove is upsampled by
  `amplifyRegion` and then roughened by `addZoomDetail`, and re-asserting the carve at tile resolution
  (re-pointing `burnChannels` off the polyline instead of bilinear coarse `mag`, whose `widthK` is a
  radius in TILE PIXELS and so collapses from 6.0 coarse cells at z=0 to 0.023 at z=8) is the LOD6
  "banks and valley" rung, not built here.

### The LOD path never calls surfaceColor, so it never had a river (v2.39, DCC-line file only)

Owner: *"When using LOD tiling the rivers seem to disappear."* They did — completely. One gate is the
fix; the lesson is that a flag's justification can be true in one render path and meaningless in
another. `hash_gen1.js` vs v2.38 ALL IDENTICAL; verification is `tests/perf/probe_lodrivers.js`.

- **`surfaceColor` is where the river water colour lives, and the LOD path cannot reach it.**
  `waterShade` — the Beer-Lambert blend — has **exactly one call site in the whole file**, inside
  `surfaceColor`. `_lodBuildTileRGBA` selects `renderBiomeTileRGBA`, which calls `landColorCore`
  **directly**, bypassing the wrapper. **Proven by nulling `_riverNet` and re-colorizing one tile:
  byte-identical, FNV `262842011` both ways.** `renderHeightTileRGBA` and `bakePixel` are blind the
  same way. Do not re-argue this from the `sdfRivers` default — that SDF is a decorative bank tint
  and is not the mechanism.
- **So `state.viz.riverWays` is an EITHER/OR off-LOD and a plain ON/OFF under LOD.** v1.14 added
  that flag to stop the raster blend and the spline drawing one network as two parallel rivers —
  a hazard of the per-pixel path ONLY. Under LOD there is no raster copy, so nothing can
  double-draw. **v2.29 flipped the default to false correctly for off-LOD and removed LOD's only
  renderer in the same edit.** Third occurrence of the v2.37 shape: a gate reused where its premise
  does not hold. **When you change a flag's default, grep every call site that reads it and re-derive
  whether its reason still applies there.**
- **The gate is widened with `||`, never replaced.** `((riverWays) || state.showRivers)` is a strict
  superset — the riverWays-on case still draws exactly as before, so nothing is taken away.
  **Do NOT instead default `riverWays` true**: `surfaceColor`'s branch is gated
  `!(state.viz&&state.viz.riverWays)`, so that re-suppresses the off-LOD raster river and reinstates
  the very report v2.29 answered.
- **A contrast threshold measures TERRAIN, not water, and will pass on the broken build.** Carved
  valleys plus `landColorCore`'s TWI wetness term already make river cells **25.48 (z4) / 42.91
  (z8)** bluer than the land around them with no water drawn at all — a first cut asserted
  `contrast > 14` and passed on v2.38. Key the assertion to a **delta against the same build's own
  overlay-suppressed baseline**: that gain is **exactly 0.00** on v2.38 and 22.8 / 20.3 here. Assert
  the mechanism too — `drawRiverWays` call count is 0 against 5.
- **Disclosed, not fixed**: LOD now draws the cartographic SYMBOL (v1.29's sqrt-z-damped stroke with
  v2.25's real-width floor) where off-LOD draws the terrain-blended `waterShade`, so the two views
  render rivers in different STYLES rather than matching pixel-for-pixel. Matching them means
  porting the `_riverNet.intensity`/`depth` blend into `renderBiomeTileRGBA` sampled at world
  coords — which re-baselines every cached tile AND every baked atlas chunk, and needs
  `_lodRenderKey()` to gain a `state.showRivers` term. **`bakePixel` is still river-blind, so an
  exported `map.png` has no river water either** — the same root cause, a separate fix.

### A long operation that says nothing reads as a broken one (v2.38, DCC-line file only)

Owner: *"Auto populate doesn't seem to work"*, then *"Yeah it's long"*. It was never broken — it is a
synchronous **11.2 s** main-thread pass that gave the click no acknowledgement of any kind.
`hash_gen1.js` vs v2.37 ALL IDENTICAL; verification is `tests/perf/probe_civbusy.js`.

- **`withBusy` had ZERO call sites in the entire civ layer.** Block 1 declares it at top level and
  block 2 shares that scope, so it was always reachable — the probe asserts `typeof withBusy` on
  v2.37 too, and it passes there. Auto-populate, Generate roads and Recalculate territories were all
  bare `onclick=()=>fn()`. **Before adding a progress mechanism, check whether the file already has
  one and the layer simply never called it.**
- **`withBusy`'s 20 ms `setTimeout` is the load-bearing part**, not the overlay: it lets the browser
  PAINT before the blocking work starts. `showBusy()` alone on the same tick paints nothing, because
  the pass never yields. The `finally{hideBusy()}` is what keeps `_busyDepth` balanced (v1.24 BUG-3).
- **This does not make anything quicker and must not be read as if it had.** Profiled:
  **`roadDijkstra` is 8 593 ms of 11 190 (77%), over 326 full-grid runs** — `2 x settlements`
  Dijkstras per `_civHierarchicalNetwork`, and that runs **four** times (three
  `_civIterativeAutoWorld` passes plus the crossroads re-route), each rebuilding the whole network
  from scratch. Everything else is noise: suitability 1 854 ms, food-shed 217 ms, seeds 24 ms,
  `_civNetworkMetrics` 7 ms.
- **The cost does NOT scale with world resolution.** `_civRoutingGrid` is `Math.min(GW,384)`, so it
  is 384x192 at every world size — a 4K world costs what a 512 one does. The driver is settlement
  count. Do not chase this by lowering the resolution, and do not blame a big map for it.
- **Refuted as a cheap win**: v2.33's per-edge `edgeCost` closure is a real 44% overhead on each
  Dijkstra (26 ms vs 18 ms with it null), but it is only ~2.6 s of the 11 and removing it deletes the
  Tobler slope model. Inlining it is bit-identical but buys 23%, not an order of magnitude.
- **A real speedup is a routing REDESIGN, not a wrap** — the all-pairs matrix the Prim MST consumes
  could come from one multi-source Voronoi Dijkstra instead of n per-settlement ones, and the
  intermediate passes could settle tiers on a cheaper distance proxy. Both **change the generated
  road network**, i.e. re-baseline every existing world, so neither is bundled into a fix for a
  report about feedback. Owner's call.

### The carve trenched across the antimeridian (v2.37, DCC-line file only)

Owner: *"the river rendering... generates near horizontal lines."* One line fixes it; the lesson is
in why it survived six versions. `hash_gen1.js` vs v2.36 ALL IDENTICAL; verification is
`tests/perf/probe_seamcarve.js`.

- **A comment recording WHY something is safe is load-bearing, and it can expire.** v1.29 exempted
  the carve from `splitRiverPolylines` and wrote the reason down: `enforceChannelDescent` "stamps a
  disc per POINT and never interpolates between them". True in v1.29. **v2.30 inserted
  `carveChannelPath` between the trace and the stamp**, which resamples through `catmullRomSample` —
  and nobody re-read the exemption it invalidated. **When you add interpolation to a path, grep for
  every comment that claims that path does not interpolate.**
- **The damage is not the number of bad polylines, it is how many POINTS each lays down.** 28 of
  11 802 chains wrapped — 0.23% of the geometry carrying **22.7% of the whole carve's points**. A
  previous count of "2 of 9884" measured the POST-carve network and concluded it was negligible. The
  wrapping chains only exist BEFORE the carve consumes them.
- **Match the detector to what the bug writes.** The carve writes seam cells to a FLAT ABSOLUTE
  `sea−0.06`. Searching for cells *depressed relative to their neighbours* cannot find a flat floor —
  it found 45-cell runs where searching for cells *at* that value finds 355.
- **Every harness ran in the one mode that cannot reproduce it.** `probe_carve.js` sets
  `state.world=false`; `hash_gen1.js` never sets `state.world`. Seed 12345 has ZERO seam-crossing
  rivers even in world mode — so the battery seed itself was blind. **A field hash would not have
  caught this**, and would have gone red for innocent reasons a dozen times first.
- **Assert the MECHANISM as well as the symptom**: `no carve path spans more than half the map`
  fails even if the floor clamp is later changed. And key a run-length assertion on what the bug
  writes — keyed on `riverMask` it PASSED on a build with 13 058 floor cells.
- **Refuted, do not re-chase**: the east receiver bias is the TERRAIN, not the routing rule (plain
  D8 reproduces the same 2.022 ratio, and the bias is unchanged by the fix while every line goes);
  the resample-step underflow is real but contributes **0%** of the artefact (implemented, measured
  byte-identical) and costs v2.30's trench coverage 0.9049 → 0.8858.
- **`gridH()` reads the module global `state.world`**, so anything computing `GH` must assign the
  extent FIRST. `_suGenCommit` had the two lines the wrong way round and gave world maps the region
  aspect (1024×655 instead of 1024×512).

### The collision belt is a stack of thrust sheets (v2.36, DCC-line file only)

Owner, on the two halves v2.35 left open: **"Together."** `hash_gen1.js` vs v2.35 ALL IDENTICAL
(collision geometry is reachable only under `state.tect.tectonicGraph`, default off); verification is
`tests/perf/probe_orogeny.js`.

- **What makes it a belt and not four parallel lines: ONE bend shared by every sheet, and per-sheet
  deviation expressed as a fraction of SPACING** — never of belt width, or a sheet closes the gap to
  its neighbour and the stack collapses back into a single ridge.
- **Calibrate on a PER-STATION crest count, never a mean cross-section.** Each sheet's crest wanders
  independently, so a mean smears them back into one hump and undercounts ridges.
- **Whether a cross-section reads as separate ranges is set by sheet spacing IN CELLS**, and that is
  a resolution limit rather than a tuning knob: 0.86-0.96 of stations carry the full stack at 35.3
  cells, 0.50-0.57 at 17.7, 0.07-0.18 at 8.8. **Five hypotheses were tested against it and refuted**
  — `smoothOrogeny` (its blur HELPS), the fold-ripple period, the shared crest jitter (removing it
  is worse), `aj` stacking on `vig`, and per-group walk starts (a measured no-op). Do not re-chase.
- **ASPECT IS BOUND BY MARGIN LENGTH, NOT BELT WIDTH.** Anchoring the belt at a real orogen width
  (125 km half-width) fixes sheet resolution outright (0.57 -> 0.93) and was still REVERTED: it draws
  550 km of belt against a 161 km margin, 69% of an 800 km map, aspect 0.29. At the default extent a
  Himalaya's proportions and its internal structure are not simultaneously available — a real
  Himalaya is 2400 km long, three times the whole map.
- **A v2.35 defect fixed here**: the forward-preferring step skips a same-group diagonal and leaves
  it UNVISITED, so the pure-loop pass walks a second polyline retracing the chain (81 of 121
  polylines came from that pass). The walk claims the skipped cell now. Costs 7.6% of skeleton cells
  as emitted geometry and takes seed 31337's longest margin 288 -> 224 km.
- **Rewrite a metric only after verifying the claim it tests.** `T5 higher fold intensity` measured
  `max-min` above an absolute cutoff, which is dominated by peak height and runs BACKWARDS for a
  stack (1.179/1.072/1.010). Col depth was confirmed monotonic (0.475/0.546/0.596) BEFORE the metric
  was touched. A fold ripple at ~one sheet sigma manufactures false crests — keep it incommensurate
  with the stack (`0.80*spacing`).

### A margin was cut at staircases, not at triple junctions (v2.35, DCC-line file only)

Owner: the Himalaya *"is a formidable mountain range. Not simply one line of mountains"*, then
*"go after margin length next."* This lengthens the margins a belt sits on; it does NOT touch the
belt profile. `hash_gen1.js` vs v2.34 ALL IDENTICAL; verification is `tests/perf/probe_margins.js`
(21 assertions, 4 of which fail on v2.34).

- **`thinMask` is Zhang-Suen, so the skeleton is 8-CONNECTED, and a raw 8-neighbour count is not a
  branch count.** A diagonal staircase gives an interior cell 3-4 neighbours in only 2 groups, so
  the old `deg !== 2` test cut chains along straight segments. The correct test is the **crossing
  number** — 0→1 transitions around the ring — which `thinMask` already computes as its own `A`,
  one function above. Ring `[0,0,0,1,1,0,1,1]`: raw 4, crossing 2.
- **Check a detector's output against what the topology can actually contain.** 1040 junctions on a
  14-plate world, where a planar graph has ~2n−4 ≈ 24 — and only 77 of the 1040 sat at a real plate
  triple point. That ratio is what condemned the predicate, not the rendered result.
- **The WALK must change with the predicate.** Under the crossing number an interior cell can still
  have 4 neighbours in 2 groups, so `nbrs[0]` can step back into the group just left and spin
  forever. Prefer a neighbour NOT 8-adjacent to the previous cell, orthogonal first, with a `W*H`
  cap. **A spinning walk looks exactly like a slow one** — two probes hung before idle CPU gave it
  away. The probe asserts both invariants directly: max step 1, and no walk reaching the cap.
- **The owner's own other option is refuted by the code, and saying so is part of the answer.**
  `currentBoundaryGraph` assigns type by majority vote AFTER tracing, so along-strike hysteresis in
  the classifier can never split a chain. Stitching nearly-collinear fragments was measured first
  (89→148 / 91→192 / 58→120 km) and beaten by the predicate fix on every seed; it still composes.
- **Stated, not banked**: total collision km rises far more than the longest margin does
  (340→984, 432→1599, 899→3607), because a longer chain's majority vote also RECLASSIFIES
  fragments. The type mix moved, and that is not separately verified. Aspect reaches ~1.9:1 /
  3.5:1 / 2.7:1 against the belt's ~83 km span — against ~7:1 for the Himalaya.
- **v2.35 WAS A PHONE FREEZE, and v2.36 fixes it**: the spinning walk reached the `W*H` cap and
  built a 524 290-point polyline that orogeny then stamped along — `buildOrogenyField` measured
  **93 885 ms** on v2.35 against 6 307 on v2.34 and 1 878 on v2.36, at World/1024/20000 km.
- **A belt that vanishes is not scale-invariance.** `orogenyWidthScaleK` put the belt at 2.14 cells
  at mapWidthKm 20000 — structured orogeny rendering nothing at world extent. `OROGEN_BELT_MIN_CELLS`
  (8) floors it, so invariance holds to ~5000 km then clamps. **The sheet stack still needs ~35 cells
  of spacing, so at world extent the belt is honestly one ridge again.**
- **Still open**: belt WIDTH is `blurR` in grid cells and never reads `mapWidthKm`, so it does not
  scale with map extent — the v1.60 / v2.05 / v2.07 defect shape, in the one subsystem those passes
  never reached.

### The land surface is a SPEED, from the Planner's own table (v2.34, DCC-line file only)

Step two of the owner's routing ask. v2.33 was step one and made routes no quicker; this is the
half with the leverage. `hash_gen1.js` vs v2.33 ALL IDENTICAL; verification is
`tests/perf/probe_landsurface.js` (19 assertions).

- **A multiplier that barely varies cannot steer anything, and `_civBiomeFriction` was worse than
  flat — it was INVERTED.** Measured over the routing grid: Open Plains 1.418, Rocky Terrain 1.373.
  It keys on climate vegetation, so a bare rocky mountain reads cheap and a forested plain reads
  dear. Spread 1.10 / 1.39 / 1.45 against `JP_TERRAIN.land`'s 2.11 / 2.37 / 2.37. **Check the
  spread of any new cost term before trusting it** — the sibling of v1.30's "check the land-mean".
- **`CART_TERRAINS` and `JP_TERRAIN.land` are the same thirteen names**, so `_civSurfaceSpeed` maps
  1:1 by name with nothing invented between. `hours = flatHours / speed` composes with v2.33's
  per-edge Tobler exactly as `jpCalcLand` composes its own answer, so the router minimises
  literally the quantity the Planner reports.
- **The grade double-count is real and small, and it is measured**: Tobler charges ×1.001–×1.068 on
  the slope-derived classes against the ×1.43–×2.22 the table asks. Grade is the rise BETWEEN two
  routing cells; the class is the roughness WITHIN one, and a routing cell aggregates several
  full-res cells.
- **`buildCartTerrain` can never emit four of its thirteen classes**, and `'Forest Path'` is the one
  NATURAL omission — so the Planner calls flat woodland "Open Plains", 0.95, faster than Hills. A
  branch fixing that was built and **reverted**: `'Forest Path'` is in `JP_WHEEL_BLOCKED`, so
  emitting it hard-blocks every cart and wagon crossing woodland — a claim that set makes about a
  hand-painted NARROW CUT PATH, not ordinary forest. **The headless suite's own v0.102 assertion is
  what surfaced it.** A Planner decision, flagged in both files, not bundled into a routing fix.
- **So the router prices forest itself, from the same table's `Forest Path` entry, by `min` — the
  slowest surface binds, NEVER a product.** 0.50 × 0.75 is a number nothing supports, and a rocky
  forested slope is slow because of the rock. It moves only the 3.5–15.9% of land that is flat AND
  wooded, which is exactly where trees are the constraint.
- **Two tests for one question, again**: the old `dfld<sea+0.06 && flow>thresh*8` swamp proxy is
  gone — `'Swamp / Marsh'` is already a class, at 0.40, and it is the one the Planner reads.
- **Measure the objective you changed, not the one you changed last time.** v2.33's A/B priced
  Tobler-grade hours only; for a surface change that is the wrong referee. Scored on the Planner's
  own composite (both sides against the identical, unchanged terrain grid): −3.8% / −4.2% /
  −13.9% / −21.0%, 61 pairs quicker to 11 slower, **with km and climb falling too**.

### Land routing costs TIME — and slope is not the binding term (v2.33, DCC-line file only)

`docs/research/routing-audit.md`'s P1 item 5, deferred since v1.98. **Read the last bullet before
building on this.**

- **Three land cost functions were live** and which you got depended on how the road was made: the
  auto network had the full terrain model, the Route tool a partial one, and the **Way tool, village
  tracks and the sea-lane MST's land branch had slope and nothing else**. `_civTravelHours` is the
  one model now, in **hours per routing cell on level ground**. `buildTravelCost` stays for the debug
  view and `_civAutoPolity` — a control flood is not a road.
- **`1 + 50·sl²` took `sl` in field units per cell**, so one hillside scored differently at 512 and
  2048 and no number was ever comparable with the Journey Planner's hours.
- **Slope belongs on the EDGE, not the cell** — it is the only place a direction exists. Tobler on
  signed rise/run (**not** degrees, **not** percent — F-2's documented misuse), **averaged over both
  directions** because a road is bidirectional and a Prim MST is undirected (v1.98's own resolution).
- **The per-cell array stays the carrier, and that is load-bearing**: settlement gravity, the ×0.25
  existing-way discount and the usage-count reuse pass all multiply `cost[i]` in place and keep
  working untouched — a multiplier on hours is a speed multiplier. Any future term must preserve that.
- **Fords and bridges are additive HOURS**, not added cost. A crossing is a wait.
- **It changed almost nothing, and the reason is measured**: p50 grade on the routing grid is 1.20%,
  p90 5.77%, p99 14.66% — Tobler gives ×1.001, ×1.043, ×1.42 there, while the non-slope terms span
  ×0.55–×1.8. **Slope was never binding, for either formula.** Refuted along the way: the routing
  grid is NOT washing grades out (2.08 km cells reproduce the full-res distribution).
- **`'land'` vs `'mixed'` is not a fair model comparison** — mixed may cross water, so the domains
  differ. An earlier claim of mine that "the routers disagree by 71%" conflated the two; the honest
  comparison is same-mode across versions.
- **The leverage is in the terms that were never measured** — `_civBiomeFriction` 1.0–1.6, swamp 1.8,
  river 0.65, reuse 0.55 are invented multipliers. Step two is to source them from **`JP_TERRAIN.land`**
  (travel-speeds.md-grounded) via the classifier `_jpDeriveStages` already runs. **`JP_BIOMES` is not
  that table** — it has water/forage/grazing/weather and no speed.

### gaussBlur's CPU path is the FAST path, not a fallback (v2.32, DCC-line file only)

Owner: *"are there any performance or rendering upgrades or gains to be made?"* Found by profiling.
**`generate()` 5919 → 3894 ms at 1024px (−34%)**; 2057 → 1631 at 512px, 20153 → 13758 at 2048px. Verification is
`tests/perf/probe_blur.js` (7 assertions, 2 of which fail on v2.31) plus 4 headless ones.
**`tests/run.sh`'s assertion TOTAL is not constant** — three clean runs reported 1175/1175/1174
passed with zero failures, so at least one `check()` is reached conditionally on ambient state.
Quote the suite as "0 failed", not as a count, until that is tracked down.

- **`gaussBlur` and `GPU.blurArr` are one algorithm, not two** — three separable box-blur passes at
  `pr=round(r/1.6)`, agreeing to 1.2e-7. They are not one COMPLEXITY: `boxH`/`boxV` carry a running
  sum (O(N), radius free — 36 ms at 1024 whether pr is 4 or 40) while the shader scans the whole
  2·pr+1 kernel (O(N·pr)) and then blocks on `readPixels`. Measured **2.1x–21.7x** in the CPU's
  favour at every size and radius, **widening with radius**. That shape is algorithmic; more cores
  move the constant, not the exponent. **Do not "restore" the GPU route without re-running the
  probe on the hardware you are claiming it for.**
- **Only the five full-grid callers ever took it**, and they are the expensive ones: `stressField`,
  `shearField`, the flexural blur at `blurR*3` (the file's largest radius), `baseField`, and
  `isostaticRebound` inside `carveRiverValleys()`. `readPixels` was **24.2%** of a 1024px generate.
- **A startup timing calibration is the wrong fix and was rejected.** The blur feeds `stressField`
  and flexure, so picking the path by measurement would make the terrain depend on how busy the
  machine was at load — one seed, two worlds, on one computer. `GAUSS_BLUR_GPU` is a fixed flag.
- **The re-baseline is quantified, not waved at**: with WebGL2 up the world moves by max 2.31e-4 on
  `field` (mean 8.03e-8 — below float32 resolution). Elevation scale is `metersPerUnit() =
  state.peakM/(1-seaLevel)`, **not** a fixed span — at the defaults that is 6897 m/unit, so the worst
  cell moves ≈1.6 m. The
  **headless suite is bit-identical**, having no WebGL2, which is what confirms only this route
  changed.
- **An assertion naming a NEW top-level constant breaks `tests/run.sh` for every older target.**
  `check('…', GAUSS_BLUR_GPU === false)` is a `ReferenceError` on any file predating it, which kills
  the run before it prints a summary — it reads as "no output", not as a failure. Guard with
  `typeof`; put the guard that must FAIL on the old build in a `tests/perf/` probe instead. **Run
  `tests/run.sh` against an older file before adding one.**
- **`tests/stub_head.js` returns `null` for any `getContext` but `'2d'`** — the headless suite has
  no WebGL2 at all, so it never took the shader route and cannot see any of this. That is also the
  proof that a sporadic `world seam avg delta` failure seen once on this build is not from here:
  both versions run byte-identical code under that harness. It is the **second** `test_tail.js`
  assertion found deciding on an unpinned ambient seed (with v2.25's SST one) — the seam block
  generates on whatever seed ~630 earlier assertions left behind. v2.25's prescription (an aggregate
  over PINNED seeds) applies to both, as one deliberate pass; do not loosen either threshold.
- Measured and NOT acted on: `carveRivers` is still the largest stage (38.5%) and is real
  `streamPowerKernel` work; the interactive render path is already fully cached (20 `renderNow()`
  calls = 7 ms); and **v2.29/v2.30 did not make the carve slower** — 1774 ms on v2.31 vs 2085 ms on
  v2.28, with v2.30's 2.4x extra carve points costing 5 ms.

### The domain rail is the phone drawer's head (v2.31, DCC-line file only)

Owner: *"on a phone screen it's scarce real estate."* `#domainRail` moved INSIDE `#dockWrap`.
`hash_gen1.js` vs v2.30 ALL IDENTICAL; verification is `tests/perf/probe_domainrail.js`
(23 assertions, 6 of them fail on v2.30).

- **One set of buttons that MOVES, never a second set that appears on small screens** — that is
  v1.57's one-control-two-surfaces defect. Every id, handler and `data-domain` literal is untouched,
  so `_setDomain`/`_applyDomainUI`/`_findPanelOwners` needed no change.
- **On desktop the bands are arranged by CSS `order`, not DOM order**, because `.dockwrap` is
  `display:contents` there and each band is an ordinary `.stage` flex item. The four declarations
  (`dock-left:-1`, `domain-rail:0`, `canvas-wrap:1`, `dock-right:2`) reproduce the measured v2.30
  layout exactly — dock-left 0–372 | rail 372–412 | canvas | dock-right. **Any future band added to
  `.dockwrap` needs an `order`**, or it lands after the canvas.
- At ≤860px the rail takes `order:-2` (beating `.dock-left`'s `-1`) and `position:sticky;top:0`.
  Map top 184px → 140px, height 550px → 594px at 390×760.
- **v2.27's rail-over-drawer z-index conflict is gone by construction** — the rail is now inside the
  drawer. The sheet's `z-index:32` still matters only against the scrim (25) and dropdowns (40).
- **A 44px row stacking a glyph over a label is a clipping risk**, and a class-name assertion would
  never see it. The probe measures both boxes against the row's own rect.

### The carve follows a river, not a receiver chain (v2.30, DCC-line file only)

Owner: the lines *"seem rather straight, not the natural curvy/pronged sense you see in reality"*,
then **"B+D"** off a five-way visual ladder. Verification is `tests/perf/probe_carve.js` (10
assertions; the coverage guard fails on v2.29) plus 10 unit assertions in `tests/test_tail.js`.

- **`traceRiverPolylines` returns a receiver chain, and a chain is not drawable OR carvable
  geometry.** `drawRiverWays` already ran `rdpSimplify` → `catmullRomSample` → `riverSinuosity` on
  the identical polyline; `carveRiverValleys` handed the raw chain straight to
  `enforceChannelDescent`. `carveChannelPath()` is now the one place that conversion happens.
- **D8 is not the defect and replacing it buys little.** `buildRiverNetwork` already routes by the
  CONTINUOUS aspect (R3b, a single-receiver projection of D∞); what is left is only that the
  receiver is one of eight lattice neighbours, which a spline removes. Velocity erosion (1.076 →
  1.108 for ~1.8x the generate time) and warp 0.45→1.00 (1.097, thinner network) were both measured
  and are poor value. **Do not re-chase them.**
- **`enforceChannelDescent` stamps a disc per point and NEVER interpolates.** So the resample must
  be finer than the channel, and it must not be `drawRiverWays`' `GW/360` — at 2.8 cells the carve
  comes out as a dotted line of pits and measures *worse* than the raw chain (4 068 cells vs 6 960).
  Assert the invariant directly: no gap between consecutive points wider than `halfW`.
- **Its `drop` is PER POINT, so the resample step silently sets the channel gradient.** Halving the
  step doubled every river's enforced descent, which cost 29.2% of the traced network against
  v2.29's 13.7%. `CHANNEL_DROP_PER_CELL` is named and the carve scales it by its own step;
  `CARVE_GRADIENT_K=2` then re-applies the steeper gradient **deliberately**. The Sculpt editor's
  hand-drawn River stamp keeps the plain default — a person places those points.
- **`riverSinuAmp` was a no-op and had been since R4.** It divides by `1+6*slopeN` as if slopeN were
  a 0..1 grade; `net.slope` is `hypot(grad)*W`, median 1.74 at GW=1024, so the median amplitude was
  **0.081 cells**. Fixed at source (`RIVER_SINU_SLOPE_K`), not by adding a second function.
- **`fbm` sampled at the carving step is jitter, not a meander.** Its top octaves vary fully between
  points 0.4 cells apart, separating neighbours by up to 1.74 cells — re-opening the gaps the
  resample exists to close. Perturb `CARVE_MEANDER_CTRL_PER_WAVE=8` control points per wavelength,
  then spline through them at the carving step.
- **`CARVE_SINU_K=8` is a calibration with a hard ceiling.** At 8x, 86.5% of the trench is still a
  real drainage line after the closing `computeFlow()`; at 20x that falls to 73.4% and the trench
  wanders off the water. A real meander belt comes from lateral migration across a floodplain, not
  from displacing a drainage path.
- **The network thins and that is understood, not a bug**: a flatter carved floor raises
  `channelThreshold`, so marginal headwaters leave the detected mask (−24.1% of traced extent). The
  probe bounds it. Measure **extent**, never polyline count — a carve that joins two runs into one
  changes the count without losing any river.

### Rivers must be carved, not only drawn (v2.29, DCC-line file only)

Owner: *"the only rivers I'm getting are drawn lines, nothing that is rendered into terrain."*
`tests/perf/probe_carve.js` (7 assertions, 4 of them fail on v2.28) is the verification.

- **`state.viz.riverWays` is an EITHER/OR, not an addition.** The per-pixel branch is gated
  `!(state.viz && state.viz.riverWays)`, so the stroked line ON means the terrain-blended raster
  river is OFF. It shipped `true` (and `checked`) for fresh worlds, which IS the report. Both
  default `false` now. A save without the field has always loaded `false` — that asymmetry is why
  an older project looked right and a new world did not.
- **Do not re-chase these three.** Frozen flow routing, MFD-vs-D8 drainage area, and restoring
  `stream.uplift` were each measured against the shipped kernel and each REFUTED: re-routing and D8
  both come out *smoother*, and uplift builds ridges (84,928 cells raised) while cutting the traced
  network from 899 polylines to 696. The difference from v0.015 is scale, not structure — its carve
  moves ~100x more terrain from the same algorithm.
- **`CARVE_STRENGTH_K` multiplies `state.stream.k` inside `carveRiverValleys()` and nowhere else.**
  The manual Stream-power button, `evolveCoupled` and the erosion worker keep the raw slider. 8x is
  calibrated, not chosen: it is where this pass reaches 3.08x the un-carved surface's Laplacian
  energy, against v0.015's own measured 3.16x. **Raising `P.iters` buys the same energy at ~2x the
  time** — strength is the cheap lever. 16x overshoots to 4.99x and costs 14% of the polylines.
- **Widening the polyline carve is refuted — the stamp is the inner CHANNEL.**
  `enforceChannelDescent` stamps a disc of radius `halfW` around every point of ~840 polylines, so
  area grows as `halfW²` over thousands of headwaters: x1.5 carves 18% of the map, x3 carves **96%**,
  and mean valley relief only moves +16% / +57%. Order-weighting is no better. The erosion pass is
  what broadens a valley, exactly as the function's own comment says.
- **`eroSettle` is rebound AND the river clamp, and the old assertion conflated them.** Whether an
  ambient world holds a locked channel cell sitting above its floor is luck — v2.29's deeper carve
  produced exactly two of 6666. Test the rebound claim with the lock cleared, then raise a locked
  cell on purpose and assert the clamp fires.

### A flex container must never centre an item that can overflow it (v2.28, DCC-line file only)

Owner: the cog window *"falls out of view as soon as we open it"*, ✕ *"barely accessible"*. CSS only; `hash_gen1.js` vs v2.27 ALL IDENTICAL. `tests/perf/probe_cogmodal.js` — 33 assertions, **18 of them fail on v2.27**.

- **Centring splits overflow across BOTH edges, and the top half cannot be scrolled to.** `#settingsModal` was `align-items:center`, so an over-tall shell put the head — which carries the only way out — off the top. Measured on v2.27: `top = −129px`, and the modal was not a scroll container at all. **This file already paid for this once: v1.21, `.al-slice-cv-wrap`.** The fix is the same — do not centre; use `align-items:flex-start` + `margin:auto`, which centres identically while keeping the top edge reachable, plus `overflow:auto`. The head is `position:sticky`.
- **`vh` again, in the box v2.27 missed.** `.set-shell{height:100vh}` at ≤860px and `min(680px,90vh)` on the desktop rule. Same remedy as v2.27's three boxes: `dvh`, `vh` first as the fallback, and `#settingsModal` itself gains `height:100dvh`. **When you fix `vh` anywhere, grep for the rest.**
- **The ✕ was 34×26** — under every touch minimum, and the only exit from a full-screen sheet. 44×44 at ≤860px only.
- **`getComputedStyle().margin` returns the USED value**, so `margin:auto` reads back as resolved pixels (`110px 210px`), never `auto`. Assert the outcome (equal gap above and below), not the mechanism.

### Shell fixes: one header row, the sidebar's own controls, and `dvh` (v2.27, DCC-line file only)

Five owner reports, all shell. `hash_gen1.js` vs v2.26 ALL IDENTICAL; verification is
`tests/perf/probe_shellui.js` (19 assertions), since every claim here is a rendered geometry or a real
click.

- **`vh` and `%` resolve against the LARGE viewport — the one with the phone's address bar retracted.**
  Three separate reports ("layers don't all show", "the list isn't scrollable", "the last items are
  hidden behind the address bar") were this one fact: `html,body{height:100%}`, `.dockwrap`'s mobile
  sheet, and the Layers popover's `max-height:72vh`. **Write `100dvh`, and leave the `vh`/`%`
  declaration FIRST as the fallback.** The list itself was never short — it renders all 34 entries, one
  per `#debugSeg` button.
- **A popover positioned inside the map cannot be capped as a fraction of the viewport.**
  `_syncChromeTop()` publishes **`--canvas-top`** (the measured top of `.canvas-wrap`) and the cap is
  `calc(100dvh - var(--canvas-top,120px) - 54px)`. Measuring the band is also the only version correct
  on both layouts — the domain rail is a column on desktop and a 44px row at ≤860px.
- **The mobile `.dockwrap` sheet must out-stack the domain rail** (32 vs the rail's 31, both below the
  dropdown layer at 40). Invisible on desktop, where `.dockwrap` is `display:contents` and the rail has
  no `z-index` — which is why the rail painted over the drawer it opens for three versions.
- **A control is INERT, not broken, when its prerequisite is off** (v1.52's rule, second occurrence).
  Every View mode always drove `state.mode` — four distinct render hashes, measured before any fix — but
  `state.debug` paints over the base view. A View click therefore clears the layer; **never the
  reverse.** It clears it through **`_setLayer('off')`**, which clicks the real `#debugSeg` button so
  one handler still owns the state change, the popup dismissals, the wind-streak sync, the render and
  the popover rebuild. A first cut called a `_syncLayersList` that does not exist, where the `typeof`
  guard would have made the line a permanent silent no-op.
- **`#extentSeg`/`#resSeg` are back in `#genWorld` and were MOVED, not copied** — two segments writing
  one `state.world`/`state.resW` is v1.57's one-control-two-surfaces defect. No JS changed, by v2.24's
  design: `_stampGenLock()` stamps `[data-genlock]` by ID, never by containment, and both handlers
  already call `confirmRegenerate()` themselves.
- **`header{flex-wrap:nowrap}` is desktop-only in effect** — the ≤860px rule's own `flex-wrap:wrap`
  stays, because a phone header SHOULD wrap rather than be squeezed to nothing. `#undoMem` keeps its id
  and `updateUndoUI()` still writes it; it is `hidden`, with its live text mirrored onto the Undo
  button's tooltip. A symbol-only button carries the word in BOTH `title` and `aria-label`.

### The save file is the project TREE (v2.26, DCC-line file only)

Owner: *"Update the saving structure to match the GDT spec."* `SAVEFILE_COMPAT.md` §1 (=
`DECISIONS.md` §7h) is one sentence: **readers accept both layouts, writers produce only the tree.**
v2.11 built the reader — it is the "second independent implementation" that spec's own §1.2 records,
and eleven of its defects were fixed because of it — and its header ends *"exportZip() below is
untouched."* So this app accepted the tree and still SAVED the flat layout for fifteen versions.
`hash_gen1.js` vs v2.25 ALL IDENTICAL; nothing here is reachable from `generate()`/`renderNow()`.

- **`_treeWriteEntries()` is the exact inverse of `_treeRead`, member for member, and lives beside
  it.** A reader/writer pair is the "two functions answering one question" shape this file has paid
  for seven times, with a longer feedback loop: nothing catches a mismatch until someone reopens a
  save. **Change one, change the other, in the same edit.**
- **§9.3's `from`/`to` index `entities/settlements.json`'s ARRAY; this app's `aIdx`/`bIdx` index
  `state.places`, which also holds POIs.** Writing `aIdx` through repoints every road — the v1.75 /
  v2.18 "one list, two index bases" defect, which never throws because a wrong-but-plausible index
  is an ordinary answer. `_twSettleIndex` is the remap; an endpoint that is not a settlement drops
  the road rather than repointing it. **Test it by forcing the bases apart** (POIs inserted AHEAD of
  the settlements) and checking roads still join the same settlements BY NAME.
- **The tree has no POI slot, and stripping `places` from `params.json` deletes them.** Measured:
  a round trip took 20 places to 18 before this was caught. §9.1's `kind` is a closed six-tier
  settlement set, §15.1 forbids inventing a settlement from a point that is not one, and a named
  editable POI is not an §11 annotation. They ride in `reference.pois` (§13.1's stated home for a
  payload one vocabulary has and the other does not) and `_treeRead` appends them **after** the
  settlements — the one order that cannot disturb the indices.
- **Four things are deliberately NOT written**: `heightmap_rg16.bin` (§15.2 — MUST NOT be in a tree;
  `packHeight16` stays, the atlas still uses it), the grid inside `params.json` (§13.1 — it lives in
  `project.json` and only there), `appearance.json` (the reader already declines to READ it, so
  writing it would give one look two homes), and `entities/provinces.json` of this app's own
  derivation (§9.4 — a re-deriving implementation MUST NOT overwrite the author's province names).
- **The downstream entries still ride along and that is conformant** — §6.1 calls everything past
  the minimal two "optional enrichment", §6.3 makes a reader ignore what it does not recognise. That
  is what lets the save format change without breaking `biome_baked.bin`/`cartalith_grid.json`.
- **Verification is `tests/perf/probe_savetree.js`, not a smoke block.** Every assertion needs a real
  `exportZip()`→`loadZip()` round trip, and the backward-compatibility half needs TWO builds open at
  once; `smoke_gen1.js` runs one page against one file and crashes near its end here (v1.100). It
  drives the SHIPPED `exportZip()` by capturing the Blob handed to `URL.createObjectURL` (v1.90's
  technique), never a reimplementation.

### Rivers: symbol vs. real width, and the sub-cell shoreline (v2.25, DCC-line file only)

Owner: rivers *"don't seem to scale when we zoom in. They tend to stay lines (and broken at that)"*,
then *"I think it's a regression from one of the very first versions... Somewhere I asked to change
the algorithm and it broke."* Both symptoms bisected to **v1.29** — correct on the owner's own
recollection. `field`/`temp`/`rain`/`flow` IDENTICAL; the `rgba` delta is proven to be only the river
overlay (`riverWays=false` ⇒ byte-identical, FNV `4270251260`).

- **`buildRiverNetwork` now RETURNS its channel half-width (`halfw`), and that is the only width
  model.** It always computed `halfW` — hydraulic geometry, real-km-aware since v2.07 — and threw it
  away after stamping `intensity`/`depth`/`omax`, so `drawRiverWays` had nothing to compare its pen
  against and v1.29's own boundary condition (*"until the channel is wide enough to draw as a
  polygon"*) could never fire. **Never re-derive `halfW`'s formula at a renderer** — that is the
  "two functions answering one question" trap this file has already paid for seven times.
- **The stroke is `max(symbol, real)` — a FLOOR.** The symbol still wins at world scale, so v1.29's
  requested thinning is intact: measured 0% of polylines floored at zoom 1 (off-LOD *and* LOD), 1% at
  zk=8, 100% at zk=32. Past the crossover the river grows 1:1 with zoom instead of √z.
- **The real width converts once per camera convention, like the symbol.** v1.29's two branches carry
  the zoom factor in opposite places: under LOD coords are canvas px (1 grid cell = `zk` px ⇒
  `2·halfW·zk`), off LOD they are grid units and CSS scales after (⇒ `2·halfW`). Any future width term
  needs the same two-branch treatment.
- **A cell-granular water test against a sub-cell shoreline shatters the line.**
  `splitRiverPolylines`' lake predicate read `_waterBody[i]===2` per cell while lake shorelines draw
  sub-cell (v1.05), and every run left under 2 points is dropped: **517 polylines / 5910 points → 393
  / 3931**, a third of the network, with each survivor stopping a cell short of the water. Now tests
  whether the pooled surface genuinely stands above the terrain under the point
  (`_lakeFill[i] − sampleArr(field,p.x,p.y) > 0.004`, this file's own "nothing pooled here" epsilon).
  Recovers 404 / 4163. Same mismatch `_civLakeFlooded` fixes for placement — **grep for the other
  cell-granular water tests before adding one.**

### LOD tile passes must be told how many pixels a coarse cell spans (v2.25)

- **`tileShadeExag(bounds, W)` scales hillshade exaggeration by `(W−1)/bounds.w`.** All three tile
  renderers hillshaded with a bare `state.exag` while the main map uses `state.exag/s` and
  `renderBiomeTileRGBA` normalises its *material* slope by `cx`/`cy` one line later — the shading term
  was the lone un-normalised pass, so relief flattened exactly where the LOD viewer exists to show it.
  Clamped at 1 (never *reduces* exaggeration); **bounds omitted ⇒ v2.24's value exactly**. Shaded-pixel
  share at z=4: 22.4% → 36.1%; z=0 identical. The native port found the same gap independently at
  `lod_bridge.rs:420`.
- **Two plausible LOD fixes were refuted by their own measurement — do not re-chase them.**
  Raising `lodDetailFreqK` measures 3.7× more Laplacian energy but the octaves land ABOVE the tile's
  Nyquist limit from z=4 up (freq=4 ⇒ 8, 16 at z=4; 8/16/32/64 at z=6) — that is aliasing, not detail.
  And scaling `burnChannels`' `widthK` (a radius in TILE PIXELS, so 6.0 coarse cells at z=0 down to
  0.023 at z=8) costs **17× the time for a 0.3-point change in burned area**, because `mag` is
  bilinearly interpolated coarse flow: **the `mag ≥ thresh` band already scales with zoom on its own**
  (1.35% burned at z=0 → 7.48% at z=8) and `widthK` only feathers the rim. `featureDetailPass` is
  already correct — coarse-cell units throughout — so a burn-flag split frees nothing.

### A flaky suite assertion, disclosed not fixed (v2.25)

`tests/test_tail.js`'s **`SST anomaly has warm + cold cells`** runs on an unpinned ambient seed and
demands a single cell past ±0.01. Measured on **untouched v2.22**: 9/10 seeds pass, seed 8080 fails
outright (min −0.0016), seed 2 is marginal (−0.0124). The cold side is the fragile one, matching the
documented Sverdrup/Stommel asymmetry. It is the single-outlier shape v1.82's entry says to replace
with an aggregate — left alone rather than loosened inside an unrelated rendering version. **If this
goes red, re-run before believing it.**

### The DCC editor frame (v2.24, DCC-line file only)

**`Cartalith v2.24 DCC test.html` replaces v0.65's header + single 324px `<aside>` with the native
port's editor frame.** Mainline `Cartalith Gen1 v2.22.html` still carries the old shell — this
section describes the DCC line only. `hash_gen1.js` vs v2.22 is ALL IDENTICAL in every scenario.

- **`_domain` is the ONE writable navigation variable.** `_activeTab`/`_genSubTab` are DERIVED from
  it by `_syncLegacyTabVars()` and must never be assigned directly — they each had exactly one
  writer (the two deleted bars) and ~8 readers, every one a guard that fails CLOSED and silently.
  `_setDomain`/`_setGenSubTab`/`_setActiveTab`/`_setSculptCategory` are the navigation API;
  `_applyDomainUI()` does all the DOM work, reading state rather than the clicked button.
- **Sculpt is a CATEGORY inside WORLD, not a domain** (`_sculptCategoryOpen`). No rail token can
  encode it, and `_sculptEditorActive()` is the master switch for the whole sculpt input pipeline.
- **The finalize lock is `[data-genlock]`, never DOM containment.** `_stampGenLock()` stamps it.
  Any control hoisted out of `#genWorld` needs the attribute AND its own `confirmRegenerate()` —
  `#resSeg` calls `allocate()` before `generate()`'s guard can refuse.
- **Domain bodies keep INLINE `style.display`.** `_civSubPageVisible()` reads `#genCiv`'s inline
  display exactly (v1.96); a class-based hide makes it return true unconditionally and restores the
  686 ms-per-generate hidden aggregate pass.
- **Any band that can resize the viewport needs `_scheduleViewportRefit()`.** There was no
  `ResizeObserver` in this file before v2.24; one observes `.canvas-wrap`. The window listeners stay
  (DPR, orientation).
- **`.dockwrap` holds ONLY the docks.** `display:contents` on desktop, the fixed mobile sheet at
  ≤860px. Nesting `.canvas-wrap` inside it is invisible on desktop and puts the map in the drawer
  on a phone.
- **`:not()` contributes its argument's specificity.** The theme layer's button allowlist is wrapped
  in `:where()` for exactly this reason — unwrapped it read (0,4,1) and silently killed the whole
  `.seg` border system, including `#debugSeg`'s 6-column grid, for the life of v2.23.
- **The cog owns program scope; File owns document scope.** GPU, Tiled LOD, Atlas cache, Region
  export, autosave/snapshots, 3D view, theme, Asset Library and the generation-parameter dump are
  in `#settingsModal`; import/export stay in File. Search can open the window.

### Physical crater model (v2.22)

**`state.crater.physical`, default off.** The legacy path picks an absolute `count` and three
hardcoded size buckets, so a 50 km region and a 40,000 km world get the same hundred impacts.

- Count = rate per Mkm² per Myr × real area × surface age. Size from `N(>D) ∝ D^−1.8` (bounded
  Pareto, inverse transform). Wear from exposure time against `τ ∝ D`.
- **The count SATURATES with age — do not "fix" that.** Production is linear in age while
  obliteration removes in proportion to the standing population, so an old surface settles at fewer,
  larger, more degraded craters. Measured 90 / 102 / 78 at 500 / 3000 / 6000 Myr, median diameter
  1.00 → 1.53 km. That is the terrestrial record.
- **Anchor the rate on the SURVIVING population, never on production** — a first cut anchored
  production at 100 and stamped only 19. The headless test pins the production identity
  (`rate × area × age`), not a tuned number, so re-anchoring cannot silently invalidate it.
- The stamping ceiling raises the smallest diameter kept (closed-form inverse of the size law),
  never a random thinning.
- The checkbox CHOOSES which pair `stampCraters` reads; `count`/`age` stay saved and are disabled,
  not cleared.

### Multi-good supply matching (v2.21)

**`_civResourceSupply(p)` answers "where would each import actually come from".** v1.33 built this
match for food alone; `_civGoodReach` classified every other export and nothing read it.

- **Reuses v1.33's machinery — do not add a second distance law.** `_civFoodMode` /
  `_civFoodConnected` / `_civFoodDeliverable` are the mode, the road gate and the curve.
- **The only addition is VALUE DENSITY**: `_civGoodDeliverable` divides the distance by a class
  multiplier (bulk 1, general 3, luxury 20) and calls the same curve — the same law with a longer
  half-distance. A bulk good is therefore bit-identical to the food answer; asserted.
- **An unlisted good falls to `general`**, never to bulk, so a new resource key behaves sensibly
  before anyone classifies it.
- **It depends on v2.18.** Before that fix `_civFoodConnected` refused every overland supplier past
  50 km, so this match would have reported almost nothing and looked deliberate.
- **`_civTradeNetwork()` is one cached pass** — calling `_civPlaceTrade` per candidate per good is
  quadratic over a 235-settlement world.
- Display-only: it feeds no population or economy figure, so the v1.34 ACYCLIC rule is intact.

### Landmasses as named entities (v2.20)

**`buildLandmassIndex` is pure; `currentLandmasses()` is the cached live accessor.** Detection was
never the gap — `buildLandmassQuality` (v1.40) already labelled and ranked every component. This
adds identity: a name, a stable key, an extent.

- **`landmassKind` is a share of the world's own LAND**, never km². An archipelago world honestly
  has no continent; do not add a "promote the biggest" fallback.
- **`landmassKey` is POSITIONAL (centroid quantised to 8 cells + the seed), never the component
  index** — those renumber on any coastline change, so an index-keyed rename would reshuffle after
  a sculpt edit. `state.landmassNames` stores only user renames, keyed that way.
- **World mode needs the CIRCULAR centroid.** A landmass straddling the antimeridian has cells at
  x≈0 and x≈W−1; a plain mean puts its label in mid-ocean. The bbox stays raw and carries `wraps`.
- **No outline is traced** — the coastline is already what the renderer draws.
- The map layer is `state.viz.landmassLabels`, default off, drawn beneath user labels and
  settlements (a continent is the ground, it never wins a collision against a town).

### Military manpower (v2.19)

**`civManpowerModel(inp)` is PURE and is the whole model**; `_civFactionManpowerAll()` gathers the
real inputs. Ported from the owner's specification (verbatim in the native port's
`MILITARY_MANPOWER_SCOPE.md` §1) — read it before touching any `MANPOWER_*` constant.

- **The two worked examples in that specification are the calibration target and both reproduce to
  the unit.** `tests/perf/probe_manpower.js` pins every figure. Do not retune a constant without
  re-running it: those numbers are the only external check this model has.
- **Four outputs, never one.** Standing / field / emergency / duration differ radically and the
  force-by-duration ladder is what makes them comparable.
- **Technology is not the driver** — it sets the labour ratio only. The era is an OUTPUT of the
  labour ratio split by state capacity, never a lookup on the ag-tech key.
- **Era bands are shares of the CITIZEN population**, per the owner's ruling. Both bases are shown;
  nothing is clamped into a band. `MANPOWER_CITIZEN_MODERNISATION` is written as
  `CEILING − min(share)` on purpose, so editing the lowest row without editing it fails loudly.
- **Unknown government keys read as `chiefdom` in BOTH tables, for opposite reasons**: it denies an
  unclassifiable state an imperial treasury, and it gives it a HIGH citizen fraction, which makes a
  share of that body smaller and so cannot flatter it into a band.
- **`MANPOWER_ROAD_REFERENCE = 10`, not the ~40 a Roman road inventory suggests** — this file's way
  network is inter-settlement trunk roads only, so it is not comparable to a road inventory.
- **Derived and stored nowhere.** Nothing manpower-shaped reaches the save format; asserted.
- The state-capacity splits inside each labour-ratio band are FITTED to the eight faction
  assignments the specification publishes, not stated by it. The probe checks all eight.

### Road connectivity: check the ARRAY and the POINT SHAPE (v2.18)

**`_civRoadComponents()`/`_civRoadConnected()` returned "not connected" for every pair from v1.33
until v2.18**, so v1.33's long-range overland food import was never reachable. Two stacked defects:

- **`state.ways` is never assigned anywhere in this file.** The live array is `civWays`. Grep before
  reading a `state.*` collection — this one had two other readers, and the other already guarded it
  with the `civWays` fallback.
- **Way points are not uniformly shaped**: `_civMstRoutes`/`_civHierarchicalNetwork` emit `[x,y]`
  ARRAYS, other builders `{x,y}` objects (v1.42 documented this). Reading `.x` gives undefined →
  NaN → every comparison false → a pass that silently does nothing.
- **Neither threw.** "Not connected" is an ordinary answer, which is why it survived versions. Any
  predicate whose false branch is unremarkable needs a test that a TRUE case really is true — here,
  that two settlements joined by a real road read as connected (`tests/perf/probe_roadconnect.js`).
- Sea lanes are excluded: this answers "is there a ROAD", and `_civFoodConnected` only asks it for
  land-mode supply.

### Erosion passes as generation parameters (v2.17)

**`state.passes={velocity,glacial,coastal,hillslope}`, all false by default.** Velocity erosion,
glacial carving, coastal processes and hillslope diffusion used to be buttons you press *after*
generation, so an eroded world could not be reproduced from its seed. `generate()` now runs them.

- **The split is `*Pass()` (field mutation) vs. the button wrapper (mutation + the interactive tail
  `computeFlow(true); refreshClimate(); renderNow()`).** `generate()` calls the SAME `*Pass()` the
  button does. Do not add a generation-side copy of a kernel's parameters — each pass reads its own
  existing sliders (`state.velo` / `state.glacial` / `state.coastal` / `state.erosion`).
- **`eroSettle(pre)` is the physics half of `eroFinish(pre)`** (rebound + exhumation hardening +
  `enforceRiverChannels`); `eroFinish` = `eroSettle` + the tail. `enforceRiverChannels` early-returns
  unless a river was brushed, and `generate()` clears `riverMask` at its top, so it no-ops there.
- **Fixed order: velocity → glacial → coastal → hillslope**, matching the panels' own hints
  ("erode first, then glaciate"; diffusion "softens cliffs… between fluvial passes"). Fixed order is
  what makes a saved pass set reproduce its world — do not make it configurable without replacing
  that guarantee.
- **Staged after climate, before `carveRiverValleys()`** — velocity reads `rainField`, glacial
  `tempField`, coastal `flowField`. `runGenerationPasses()` returns whether anything ran so
  `generate()` re-derives once, in its own order (`refreshClimate()` then `computeFlow(true)`). The
  button path re-derives the other way round; pre-existing, deliberately untouched.
- **`coastalPass()` must restore `state.coastal`** — it swaps in a gravity-scaled copy for the GPU
  path and restores in a `finally`. At g = 1 a broken restore is invisible; test at g ≠ 1.
- Live verification is `tests/perf/probe_passes.js` — the checkboxes, `syncUI()`, and `generate()`
  itself are all browser-only.

### CSS tokens: use the canonical names (v2.16)

**The palette is `--bg --panel --panel2 --line --ink --dim --faint --accent --accent2 --warn`.**
`--border`/`--muted`/`--fg`/`--text`/`--bg2`/`--panel-darker` were used 105+ times and defined
nowhere; they are now aliases in `:root`, but new code should use the canonical names.

- **A `var()` with no fallback does not degrade gracefully — it invalidates the whole declaration**
  at computed-value time, so the property takes its INITIAL value (`border-color` → `currentColor`).
  That is why inactive tabs rendered transparent with a bright text-coloured border for versions
  without anyone noticing. **Always write `var(--x,fallback)` for anything not in the list above.**
- `--preview-al` looks undefined and is fine — it is always written with a fallback.

### Unified search + dismissible setup gate (v2.15)

- **The control index is SCRAPED from the DOM** (`label[for]` → its input), never hand-maintained —
  a control added later is searchable for free. **Panel ownership is derivable, not mapped**:
  `data-gsub="carto"`→`#genCarto`, `data-civsub="generation"`→`#civSubGeneration`. An entry whose
  panel does not resolve is dropped, so a broken convention degrades to "found but no tab switch".
- **A class added without a CSS rule is invisible** — `.find-hit` shipped that way for one edit.
  Same shape as v1.80's `windFxCanvas`. **Asserting a class name is not asserting visibility.**
- **`_hasLiveWorld()`'s contract is "gate hidden ⟺ a world exists", and `beforeunload` AND autosave
  both read it.** A dismissible gate must therefore NOT satisfy it (`_setupSkipped`), or an empty
  app warns on close and autosaves a blank world. `generate()` clears the flag.
- **`typeof x` on a `let` in its temporal dead zone THROWS** — it cannot guard a forward reference.
  Declare a cross-block flag `var`, beside its reader. (v1.24 BUG-1's shape, caught pre-ship.)

### Ponytail pass — and how to run a dead-code sweep here (v2.14)

- **A reference sweep MUST include `tests/perf/*.js`, not just the two headless tails.** Scanning
  only `test_tail.js`/`um_test_tail.js` reports `grainKgPerHaMedieval` and
  `CHARCOAL_KG_PER_HA_YR_MAX` as dead; both are asserted in `smoke_gen1.js`. v1.93's note calling
  them deliberately-kept is CORRECT — this pass nearly deleted them before checking.
- **The file is already clean.** 1128 functions and 3115 `const`/`let` declarations; exactly one
  dead (`flowC`, removed). Do not go looking for cruft that is not there.
- **Most repeated code here is mandatory and must stay**: the `MinHeap` and `D8` copies exist
  because invariant 11 requires self-contained worker kernels; the D8 loop headers are the hottest
  loops in the file (v1.92); the GL `texParameteri` pairs are untestable headlessly.
- **A control that is not reflected in `syncUI()` will go stale on load.** v2.12's autosave
  controls were set at boot only, so a loaded project left the checkbox and the running timer on
  the previous values. Every control belongs in `syncUI()`'s tail.
- **Comment rule, refined**: v1.27's "rationale comments stay" is about CONSTRAINTS — what breaks
  if you change this. Narrative (how the bug was found, what the first cut got wrong) belongs in
  `CHANGELOG.md`, not at the call site.

### Corridor/travel-cost views + wall towers (v2.13)

Second `PORT_ONLY_FEATURES.md` track. Hash vs v2.11 ALL IDENTICAL (both views opt-in; towers only
under `urbanLayouts`/City Viewer).

- **`buildRouteCorridors` and `buildTravelCost` were already computed and already consumed — only
  never drawn.** Making them views added no computation: `currentTravelCost()` just mirrors
  `currentRouteCorridors()`'s existing cache idiom. Seven wiring sites, exactly v1.17's
  `siteprofile` pattern. **Before writing a new field, check whether the one you want is already
  being computed as an internal scoring input.**
- Debug-view normalisers are FIXED, not per-world: the same colour must mean the same value across
  worlds, unlike the self-calibrating scales v1.25/v1.31/v1.34 use for simulation.
- `_umWallTowers` spaces towers in SCREEN space, not model metres — the wall ring is finely
  sampled, so per-vertex drawing alone smears once zoomed out.
- **Three items skipped with reasons, not effort**: a flow wetness halo duplicates R5's existing
  `state.viz.wetness`; local contrast is a spatial-neighbourhood pass and v1.29's seam rule makes
  it not-cheap; a neatline has no canvas overlay stage to join (the scale bar is DOM) and a CSS
  border would never reach the baked `map.png`.

### Persistence: redo, autosave snapshots, failed-open recovery (v2.12)

First build off `PORT_ONLY_FEATURES.md` (the native port's own list of what it has that this file
doesn't, pulled into this repo this session). Hash vs v2.11 **ALL IDENTICAL** — nothing here is
reachable from `generate()`/`renderNow()`.

- **`loadZip()` reads back exactly SIX of `exportZip()`'s ~30 entries** (`params.json`,
  `heightmap.f32`, `temperature.f32`, `rainfall.f32`, `volcanic_field.f32`, `impact_field.f32`).
  Everything else is write-only, for downstream tools. **This is the fact autosave is built on** —
  a restorable snapshot is those six, so it needs no bake and no atlas embed and is cheap enough
  for a timer (112 ms / 1.5 MB at 512px; 436 ms / 6 MB at 1024px). `loadZip()` takes anything with
  `.arrayBuffer()`, so a Blob from IndexedDB restores through the identical proven path. A suite
  assertion pins the entry names to that list, so a future seventh reader cannot silently drop one.
- **"Has the world changed" is a CONTENT fingerprint over the whole field and whole serialized
  state — never a dirty flag, and never a sampled one.** v1.24 BUG-5 rejected dirty-tracking
  because one missed mutation site fails silently; the first cut here strided the field by 997 and
  reintroduced exactly that (a small sculpt stroke fell between samples). A full pass is ~3M ops
  against a timer measured in minutes. **Third time this file has learned that an optimisation
  which samples instead of measuring hides a correctness hole.**
- **`pushUndo()` is only ever called by the manual edit ops — never by `generate()`** — so a
  snapshot belongs to exactly one world, and the stacks were never cleared. Two real bugs,
  reproduced on v2.11 before fixing: undo after a regenerate overwrote the new world's terrain
  with the old world's, and after a resolution DECREASE `field.set()` threw `RangeError` outright.
  `clearUndoHistory()` runs from `generate()` and `loadZip()` now.
- **`sculptRedo` (v1.15) is draft-scoped and is NOT the field-level redo** — different stack,
  different thing, as its own comment says. `Ctrl+Shift+Z` was reserved at field level and inert;
  it is redo now, matching the sculpt editor's shift convention rather than adding a `Ctrl+Y`.
- **Known scope cuts**: no browsable undo-history list (`MAX_UNDO` is still 5, and each step is a
  full `field` copy — a deeper stack is a memory decision); no cross-session "recent projects"
  beyond the snapshot list (a browser has no project path to remember); snapshots live only in
  this browser's IndexedDB — a crash/tab-close guard, not a replacement for `Export .zip`.

### LOD/bake terrain checkerboard from coarse-cell-quantized curvature (v2.09)

Owner: "Terrain rendering/Painting is quickly blockey/pixilated especially when zooming in with
LOD." Root-caused by direct measurement (real screenshots + instrumented render pipeline) before
any fix, confirmed PRE-EXISTING (reproduces on v2.04, before this session's own v2.05–v2.08 LOD
work) — a separate, older bug. Engine only (`renderBiomeTileRGBA`/`bakePixel`'s call sites). Hash
vs v2.08 ALL IDENTICAL — neither function is on the default render path.

- **Ruled out in order, by measurement**: `addZoomDetail` (disabled — checkerboard unchanged); the
  raw amplified height buffer (sampled per-pixel — smooth, no periodic signature); temp/rain fields
  and the `nHi` grain noise (all smooth). Geometrically isolated the pattern to WITHIN a single
  1024px pyramid tile (only ~2 real tiles span the reproduction view, but ~10 checkerboard squares
  are visible), ruling out tile-seam/compositing causes too.
- **Root cause**: `curvatureAt(x,y)`/`aspectFactor(x,y)` are written for the main map's own
  per-pixel loop (called with exact integer coarse coordinates — correct there).
  `renderBiomeTileRGBA` (interactive LOD tiles) and `bakePixel` (refined-tile export) instead call
  them as `curvatureAt(Math.round(wx),Math.round(wy))` on a FINE, fractional coordinate — every
  pixel rounding to the same coarse cell reads the identical value, a hard step at each cell
  boundary, while height/temperature/hillshade stay continuous. Invisible at normal zoom (many
  screen pixels already share one coarse cell); a stark checkerboard once LOD zooms in far enough
  that one coarse cell spans many pixels — and `materialWeights`' `curvNorm=clamp01(|curv|*300)`
  turns the quantization into a large wet/dry material swing at every boundary.
- **Fix**: `curvatureAtF`/`aspectFactorF`, continuous siblings that bilinear-sample `field` via the
  existing `sampleArr` at the fractional coordinate instead of rounding first — bit-identical to
  the originals at any exact integer coordinate (asserted), so the main map's own untouched
  per-pixel render stays byte-for-byte identical. Both call sites now pass `wx,wy`/`gx,gy` straight
  through, no rounding.
- **Verified visually**: real before/after screenshots at the reproduction zoom (32×/64×) — the
  checkerboard is gone, replaced by smooth shading matching the already-smooth underlying data.
- **Tests**: 4 new unit assertions — integer-coordinate bit-identity for both functions; a live
  reproduction proving the OLD `Math.round(...)` expression is piecewise-constant across a real
  coarse-cell boundary while the new function varies smoothly across the identical span; a
  source-inspection check that the two production call sites actually use the fix. `tests/run.sh`
  1066/1066 (+4), `tests/run_um.sh` 852/852, hash ALL IDENTICAL.
- **Known scope cuts**: the main map's own per-pixel `curvatureAt`/`aspectFactor` calls (exact
  integer coords) were correct and untouched; no broader sweep for the same
  `Math.round(fractional-coord)` defect shape elsewhere in the tile/bake pipeline was attempted —
  only the two confirmed, reproduced call sites were fixed.

### LOD full zoom-out was cover-cropped on mobile, with no escape valve (v2.08)

Owner: "When using LOD the window on mobile doesn't allow a full zoom out anymore." Root-caused by
direct measurement (a Playwright mobile-viewport probe) before touching code. Civ/UI-layer only
(`_lodFitCanvas`/`requestLodRender`). Hash vs v2.07 ALL IDENTICAL — pure CSS display sizing, never
reaches `generate()`/`renderNow()`'s pixel output.

- **The camera was never broken** — `_lodZoom` correctly floors at exactly `1` through every
  zoom-out path (buttons, wheel, a real synthetic pinch gesture), ruling out `enterLodFromView`'s
  own `Math.max(1.5,...)` entry floor (only sets the STARTING zoom on wheel auto-entry) as the
  cause.
- **The real defect: `_lodFitCanvas()` always displays the canvas in CSS "cover" mode, at ANY
  zoom.** Cover (v1.01, correct for genuinely zoomed-in navigation — the v0.87 bug it fixed) crops
  the canvas to the viewport's own aspect with no letterboxing, so "fully zoomed out" still showed
  only a cropped slice of the world. Measured: a 390×844 (mobile) viewport cropped **~68% of the
  map's width** even at `_lodZoom=1`; a 1400×900 (desktop) viewport cropped only ~15% — same bug,
  far less visible on a wide window, hence "on mobile."
- **The off-LOD camera already has an escape valve LOD never got.** `_viewClampFill`'s v1.13 fit-
  scale zoom floor lets a user keep zooming out off-LOD until the whole map genuinely fits
  (letterboxed) — measured directly on the same narrow viewport. In LOD mode `_lodZoom` is
  HARD-floored at `1`, so there was no "zoom out further" to ever trigger an equivalent fit state —
  a permanent, unescapable crop once the floor was reached, not a broken control.
- **Fix**: letterbox-FIT exactly at the zoom floor (`_lodZoom<=1.0001`), cover above it (v0.87's
  case, untouched). `_lodFitCanvas()` was only ever called from `applyView()`, but every zoom-only
  path (`lodZoomStep`/`_lodZoomAt`, i.e. every button/wheel/pinch) calls `requestLodRender()`
  directly and never `applyView()` — so it now also runs at the top of `requestLodRender()`
  (guarded on `_lodOn`), or the fix would silently never apply on a pure zoom step.
- **Verified**: the mobile probe confirms the fix (370×237px inside a 390×761 wrap — no crop,
  correctly letterboxed) and confirms the on-screen `⟳` reset button alone re-fits at the floor
  with no resize, proving the `requestLodRender()` wiring (not just `applyView()`) is what fixes
  it. `tests/run.sh` 1062/1062 (unchanged), `tests/run_um.sh` 852/852, hash ALL IDENTICAL, 5 new
  smoke assertions (`R.v208`) reproducing the bug through the real DOM/camera at a portrait
  viewport.
- **Known scope cuts**: the fit/cover switch is a discrete change exactly at the floor (nothing
  below `_lodZoom=1` to blend through); cover geometry above the floor is otherwise unchanged.
  Canvas/touch interaction stays under this file's own headless carve-out for on-device
  confirmation.

### River channel width made real-km-aware (v2.07)

Owner: "check the scaling from the base... when setting the width of the map to 1/5/10/100 km etc
scales all features accordingly. So that a river becomes a bigger feature progressively." Engine
only (`buildRiverNetwork`/`carveRiverValleys`). Hash vs v2.06 ALL IDENTICAL at the app's own default
(mapWidthKm=800, any resolution — including `hash_gen1.js`'s own 512px "default" scenario).

- **Root cause**: `buildRiverNetwork`'s channel half-width and `carveRiverValleys`' valley-carve
  half-width are both expressed and CAPPED purely in grid cells — no `cellKm`/`mapWidthKm`
  reference anywhere. The same channel always occupies the same fraction of the map regardless of
  its real km — v1.60's defect, in a subsystem `terrainDetailK`/`riverCoarseEase`/`lodDetailFreqK`
  never reached (they ease generation/detection FREQUENCY, never a channel's rendered/carved WIDTH).
  Measured: a fixed world's channel held at 85 cells across 1/5/10 km — never "bigger."
- **`riverWidthScaleK(mapWidthKm)`** — the fifth `terrainDetailK` family sibling, sharing its
  `TERRAIN_DETAIL_MAX_K` cap by the same shared-constant convention. Unlike every ONE-SIDED sibling,
  width eases BOTH ways (`min(16,max(1/16,800/mapWidthKm))`) — a pure km↔cell conversion has no
  reason to favor one direction. `mapWidthKm` alone, never blended with `gw` — the same
  `riverCoarseEase`-established low-res-test-preview trap applies. No-op at the literal default.
- **Wired at both width computations**: `buildRiverNetwork`'s render half-width and
  `carveRiverValleys`' carve half-width each multiply through it, with their existing cell caps (9
  and 4) scaled by the SAME factor so the cap-to-raw ratio — and reference-scale behavior — holds
  exactly. Two call sites, not unified — their formulas/caps were already independently tuned.
- **Verified**: an isolated live sweep (one fixed world, only `state.mapWidthKm` varied) confirmed
  the footprint pins at the 16x cap across 1/5/10km while its real-km extent grows proportionally;
  new unit tests cover the standalone function plus a synthetic single-trunk-valley
  `buildRiverNetwork` call proving the wiring itself.
- **Known scope cuts**: `burnChannels`' Tiled-LOD channel-burn width and `drawRiverWays`' vector-
  overlay stroke (a deliberate v1.29 scale-invariant cartographic symbol) are untouched — both
  opt-in, off by default, lower-traffic than the two default-on paths this fix covers. Point
  features (craters/volcanoes/settlements) were already real-km-aware since v1.60. Base relief
  shape at extreme sub-~12.5km-cell scales stays at `terrainDetailK`'s own pre-existing cap.

### LOD tile cache: shallow zoom levels are pinned, never evicted (v2.06)

Owner: "Zooming out seems to rerender all tiles. Which it shouldn't do as zoomed out tiles had
already been rendered before. They should be stored and recalled." Engine only. Hash vs v2.05 ALL
IDENTICAL — LOD is opt-in/off by default; this changes only *when* a tile is reused, never its
pixels.

- **Measured before fixing**: a wide view rendered, then a deep-zoom dive PANNING across a real
  swath of the map (enough distinct tiles to exceed the ~72-tile canvas budget), then a return to
  the exact original wide view — 3 of the original 10 tiles needed full recolorization. A narrower
  "zoom in/out at one fixed spot" reproduction showed near-perfect caching, isolating the defect to
  genuine exploration exceeding the LRU pools' budget (both `_lodCache` and `_lodTileCanvasCache`
  are plain LRU, with no notion that some tiles are worth more to keep).
- **Fix is not a bigger cap** (no finite budget survives unbounded exploration) — shallow pyramid
  levels are cheap and FEW (z=0..2 is 1+4+16=21 tiles) and are exactly what "zoom all the way back
  out" returns to. `_lodCachePinned`/`_lodTileCanvasPinned` hold them OUTSIDE the LRU pool, never
  evicted; the deep-zoom pool is otherwise unchanged.
- **`lodPinMaxZ()`** scales the pinned depth down as `_lodTile` grows (reserves ≤30% of the SAME
  per-tile-size budget `lodTileCanvasMax()` draws from) — z≤2 at the default 1024px tile, z≤1 at
  2048px, z≤0 at 4096px (where the whole pool floors at 6 tiles) — so pinning can never itself
  blow the budget it sits beside, the same "budget by pixels" discipline v1.74 established.
- **`pyramidTile`'s own return already carries `z`**, so `lodCachePut` needs no key/call-site
  change; a `<canvas>` has no `.z`, so `_lodTileCacheSet`'s one call site passes `v.z` explicitly.
- **`lodCacheClear()` clears both pinned pools too** — unlike the LRU pools (self-bound via
  eviction), a pinned entry never evicts, so leaving it uncleared would leak stale-world tiles
  every regenerate.
- **Re-measured**: the return-to-wide-view step now needs zero recolorizations (was 3).
- **Tests**: 1055/1055 (+9, two pre-existing LOD-cache assertions updated to sum both pools), 852/
  852, hash ALL IDENTICAL, 2 new smoke assertions, independently verified through the real
  `drawLODView()`/`renderNow()` pipeline before trusting the full suite.
- **Known scope cuts**: the deep-zoom LRU pool remains exploration-budget-limited by design (this
  fix protects only the cheap shallow levels); `_lodCacheMax` (the data pool's flat 48 cap) isn't
  pixel-budgeted like the canvas pool — pre-existing, doesn't gate this fix's correctness since the
  canvas pool already gates whether a re-visit needs real work.

### LOD zoom-detail pipeline made real-km-aware (v2.05)

Owner, pasting a screenshot of blocky terrain under the `LOD6 12,38/par 6,19/cached` debug label:
"There is still a certain pixilated quality to the map when we zoom. The graphics should be finer
than that." Engine only (`amplifyRegion`/`addZoomDetail`/`lodTileOpts`). Hash vs v2.04 ALL
IDENTICAL at the default; a deliberate, measured re-baseline above `mapWidthKm=800`, same class as
v1.60/v1.101.

- **Root cause, found by reading the source before writing any fix**: neither `amplifyRegion` (the
  per-tile refine pass) nor `addZoomDetail` (v0.126's extra fractal octaves as LOD depth increases)
  reference `cellKm`/`mapWidthKm`/`terrainDetailK` anywhere — their added-noise frequency
  ("cycles per coarse cell") has always defaulted to a flat `1.0`. The exact v1.60 defect, in a
  DIFFERENT subsystem `terrainDetailK` never reached: that fix only eases the BASE field (one-
  sided, does nothing for world-scale maps by design), while the LOD viewer's entire purpose is
  synthesizing texture finer than the base grid can show — precisely what a huge-`cellKm` world
  needs and never got. At 800km/2048px, one noise cycle per coarse cell is a ~390m wavelength; at
  the reported 20,000km world it's ~9.8km — 25x coarser, reading as smooth/blocky patches once
  zoomed in past that.
- **`lodDetailFreqK(mapWidthKm)`** — the fourth sibling of `terrainDetailK`→`riverCoarseEase`→
  `_jpDrinkingCoarseEase`, same formula as `riverCoarseEase`, kept as its own named function (a
  future retune of one must not silently retune the others). Keyed on `mapWidthKm` alone, never
  blended with `gw` — `riverCoarseEase`'s own CHANGELOG already found blending `gw` re-baselines
  this file's low-res test previews. Capped at `TERRAIN_DETAIL_MAX_K`; no-op at the literal
  default.
- **One-line wire-up**: `lodTileOpts()` (the declared single source of truth for procedural-tile
  opts) gained `detailFreq: lodDetailFreqK(state.mapWidthKm)` — both consumers already read
  `opts.detailFreq` with a `1.0` fallback, so nothing else changed.
- **Measured, not assumed**: reproduced the owner's world shape; the same coarse field/seed/tile
  location compared against the pre-fix flat `detailFreq:1` showed ~10.5x more high-frequency
  energy (discrete-Laplacian proxy) post-fix. A real screenshot at matching Tiled-LOD z=6
  coordinates confirmed visibly finer grain — after catching and fixing a test-site trap: the
  world's single highest point sits on a locally flat summit plateau (relief≈0.008), where the
  amplitude taper suppresses added detail regardless of frequency; a nearby sloped point
  (relief≈0.32) was the correct site.
- **Tests**: 1046/1046 (+8), 852/852, hash ALL IDENTICAL at default.
- **Known scope cuts**: the v1.29-disclosed per-tile seam residue and the v1.22 supersample-backing
  mechanism are separate, untouched pieces of overall LOD render quality; `detailAmp` (amplitude,
  not frequency) is unchanged.

### Per-stage Journey Planner overrides expanded to the full travel-option set (v2.04)

Owner: "Per stage override should be the full travel options. Per stage a lot can change." Before
this version, `stageOverrides[idx]` only had a UI for six fields (Travel mode/Group size/Cargo/
Pace/Pack animal/Vehicle) even though `_jpEffectiveStagePlan`'s generic `Object.assign` merge
already threads EVERY plan field through to `jpCalcLand`/`jpCalcWater`/`jpCapacity` per stage with
zero plumbing changes — confirmed by reading every consumer before adding a single row. Civ-layer
only (`_jpRenderResults`). Hash vs v2.03 ALL IDENTICAL — UI-only, the merge mechanism was already
load-bearing.

- **Ten new rows, exactly matching what each stage's own calculator reads.** Every category:
  Weather, Carry food (tri-state select — the underlying field is a boolean, and a stage override
  needs a third "inherit" state a checkbox can't express), Road/water quality, Infrastructure.
  Land-only (`jpCalcWater` reads none of these): Hours/day, Supplies carried, Grazing, Foraging,
  Mount (shown only once the stage's own resolved transport is "Mounted Rider"), Desert water
  (gated on the STAGE's own biome, not the whole-route `plan.hasDesert` flag the party form uses).
- **`routeCond`'s options are stage-category-aware.** The party form's own "Road quality" control
  only ever lists `JP_ROUTE.land`'s keys — safe there because `_jpDeriveStages` validates a
  land-only choice against the real stage category before applying it. A per-stage control has no
  such net (`_jpPlan`'s pre-pass writes `ov.routeCond` onto the stage unconditionally), so this
  keys the option list off `JP_ROUTE[s.cat]` directly — a sea stage offers wind/current bands, a
  river stage Downstream/Upstream, a land stage the road table.
- **Two fields deliberately excluded, disclosed not silent**: `seasonalClosures` (a property of
  the pass, not the stage — v1.65's own reasoning) and `restCadence`/`seasonDrift`/`autoPromote`
  (whole-journey aggregates `_jpPlan` reads once over the summed day count — a per-stage override
  would be silently inert). Animal/vehicle head-counts stay at the existing species/type-swap
  granularity (v1.50/v1.66) rather than gaining separate raw-count fields.
- **A real test bug caught before shipping**: per-stage cards are trouble-sorted (v1.51's
  `_stageOrder`), so a check that grabs "the first `[data-jps="X"]`" without scoping by
  `data-jps-idx` can silently exercise the wrong stage — the first draft of this version's own
  verification probe did exactly that, producing three false failures, fixed by scoping every
  check to `[data-jps-idx="0"]` rather than touching any product code.
- **Verified via two isolated Playwright probes** (22 land-stage + 15 sea-stage assertions) before
  trusting the full smoke suite: every row's presence/absence gates correctly; Carry-food's
  tri-state round-trips to a real boolean and back; an Hours/Weather override measurably changes
  the real computed speed, not just stored inertly; a sea stage's quality list is provably
  `JP_ROUTE.sea`'s keys, never `.land`'s.
- **Tests**: 1038/1038, 852/852, hash ALL IDENTICAL, 11 new smoke assertions (`R.v204`).
- **Known scope cuts**: raw animal/vehicle head-count overrides; no per-stage
  `seasonalClosures`/`restCadence`/`seasonDrift`/`autoPromote` (disclosed as structurally inert at
  stage granularity).

### Generation info button relocated beside the persistent readout panel (v2.03)

Owner, pasting a screenshot of the always-visible `#readout` summary in the sidebar: "I want the
generation info button here." Pure DOM relocation (block 1 HTML), no engine/civ-layer logic
touched. Hash vs v1.102 ALL IDENTICAL in every scenario. Owner also asked the version to jump
straight to v2.03 for this release — a naming choice with no behavioral significance.

- **The v1.101 ℹ️ Info button (`#genInfoSec`) lived inside `#genWorld`**, one of three mutually-
  exclusive tab panels (`#genWorld`/`#explorePanel`/`#assetsPanel`), so it vanished whenever the
  Explore or Asset-Library tab was active. `#readout` is a sibling `.sec` rendered AFTER all three
  panel divs close, still inside `<aside>` — genuinely always visible regardless of the active tab,
  exactly the persistent panel the owner's screenshot pointed at.
- **Fix**: the whole `#genInfoSec` block moved into the same `.sec` that holds `#readout`, directly
  below it. Every element id (`genInfoBtn`/`genInfoPanel`/`genInfoText`/`genInfoCopyBtn`/
  `genInfoCopyStatus`) is unchanged, so `generationInfoText()` and its `getElementById`-driven
  event-listener block needed zero code changes — only the markup's DOM position moved.
- **Verified via an isolated Playwright probe** before trusting the change in the full smoke suite:
  the button/panel resolve inside the same `.sec` as `#readout`, sit outside all three tab panels,
  the panel opens with real generation-parameter text on click, and — the actual point of the
  move — the button stays visible/clickable while the Explore tab is active, which it never did
  before.
- **Tests**: `tests/run.sh` 1038/1038 (unchanged — no engine code touched), `tests/run_um.sh`
  852/852 (block 4 untouched), hash ALL IDENTICAL. The existing `R.v101` smoke block (button
  id/behavior) needed no changes since only its DOM ancestor moved.
- **Known scope cuts**: none.

### Lakes were silently misclassified as rivers in the Journey Planner (v1.102)

Owner: "Pathfinding and routes seem to make mistakes with lakes?" Root-caused by reproduction on a
real generated lake before writing any fix. Civ-layer only (`_jpDeriveStages`). Hash vs v1.101 ALL
IDENTICAL.

- **Root cause**: `CART_BIOMES` correctly distinguishes Lake (index 14) from Ocean (index 15), but
  `_jpDeriveStages` only ever gave the ocean branch real treatment — every Lake cell was
  unconditionally `cat:'river'`/`terrain:"Calm River"` regardless of size. Reproduced on a real
  world: a lake crossing measured 172.8m gain / 183.6m loss over an 85.9km stretch — a lake bed is
  physically flat, so that's DEM sampling noise across the lake surface being read by
  `_jpRiverCondition` (net elevation change ÷ distance) as a real downhill current, which can just
  as easily net out past the Strong Downstream/Upstream threshold on a different crossing,
  fabricating a fast current on a genuinely still body of water. A pond and a Great-Lakes-scale
  crossing got identical treatment — the calmest river terrain, and river-only vessel eligibility (a
  real open-water hull crossing a big lake incorrectly read as ineligible; a pure river barge
  incorrectly read as fine for any lake, however vast).
- **Fix**: `nearestLandDist` (the ocean branch's own "distance to nearest dry land" measurement) is
  factored out and reused for lake cells. A small, near-shore lake (`d<=2`, the same cutoff
  "Sheltered Bay" already uses) stays river-like, unchanged. A lake wide enough that its middle sits
  genuinely far from either shore gets the SAME open-water treatment the ocean branch already has:
  Coastal Waters/Open Sea terrain (existing table entries, no new lake-specific vocabulary),
  `cat:'sea'` vessel eligibility, and `_jpSeaCondition`'s wind-driven condition instead of the
  noise-prone gradient one. Wind is a real atmospheric field and blows over lakes same as sea; the
  ocean-current term correctly reads ~0 over a lake (`currentOceanField()` is masked to real ocean
  cells) — an honest omission, not a regression, since this model never claimed lake currents.
- **Verified on a controlled synthetic lake** (a real world with `_cartBiome`/`field` hand-overridden
  to carve exact-size lake bodies — sweeping seeds for a specific width is slow and
  non-deterministic): a 3-cell-wide lake stays fully river-classified; a 30×31-cell lake produces a
  genuine `cat:'sea'` middle section reaching "Open Sea" at its centre, the same distance rule the
  untouched ocean branch uses; a real ocean crossing is provably unaffected.
- **Tests**: 5 new smoke assertions (`R.v102`), independently verified via isolated reproduction
  (this environment's own pre-existing `smoke_gen1.js` crash, disclosed in v1.100, is unrelated).
  1038/1038, 852/852, hash ALL IDENTICAL.
- **Known scope cuts**: no dedicated "Lake" JP category — reusing the sea vocabulary avoids a
  second, drifting copy of the terrain/route/vessel tables; the `d<=2` cutoff is the same value the
  ocean branch already committed to, not independently recalibrated; the underlying DEM-noise
  characteristic is pre-existing terrain generation, untouched — this only stops the Journey Planner
  from mis-reading it as a real current. A second lake-adjacent question — whether the auto-generated
  sea-lane network should ever connect settlements across a lake — was checked and found to be a
  deliberate, already-documented design choice ("lakes are a separate unconnected body"), not a bug.

### River/water detection eased for large-scale maps; a Generate → World troubleshooting info button (v1.101)

Owner report immediately after v1.100 shipped: a Journey Planner stage on a 40,000km-wide, 2048px
world (19.53 km/cell) read hundreds of km with zero water in reach. Reproduced the world's exact
scale and measured real hydrology density before writing any fix. Hash vs v1.100 ALL IDENTICAL at
the app's own default (mapWidthKm=800, any resolution) — a deliberate, measured re-baseline above
that, same class as v1.60's own terrainDetailK cut.

- **Root cause**: `riverFlowThresh` (v1.60's canonical river-significance cutoff) is keyed on
  `terrainDetailK`, which only ever eases the FINE side of the scale (a region smaller than the
  reference gets more relief/drainage detail) — a map COARSER than the reference (world scale, or
  any large region) sits flat at k=1 by design, so the threshold never loosens for a big map the way
  it tightens for a small one. Measured: only ~34% of land (16% in desert biome) sat within the
  Journey Planner's own water-reach radius of a detected river/lake on the reported world — not
  because the geography is that dry, but because a real minor stream's catchment can never
  accumulate the same flat cell-count threshold calibrated for an 800km reference region.
- **Fix A (engine): `riverCoarseEase`**, a companion to `terrainDetailK` that eases the COARSE side
  — a SEPARATE function (not folded into `terrainDetailK` itself, which also drives relief NOISE
  FREQUENCY — easing that for large worlds would flatten their terrain, an unrelated side effect),
  only divides into `riverFlowThresh`. **Deliberately keyed on `mapWidthKm` alone, never blended
  with `gw`** the way `terrainDetailK`'s own `cellKm` is — a first cut reused `cellKm` and measured
  a real regression: this file's own test/perf harnesses overwhelmingly render below 2048px while
  leaving `mapWidthKm` at its 800 default (`hash_gen1.js`'s whole battery runs at 512px), which
  `cellKm` alone can't distinguish from a genuinely large world. Keying on `cellKm` re-baselined the
  entire low-resolution test suite (two real `test_tail.js` failures traced to it) before the
  redesign to `mapWidthKm` alone fixed both without touching either test. No-op at/below the app's
  literal default mapWidthKm=800 at ANY resolution; capped at the same `TERRAIN_DETAIL_MAX_K`.
- **Fix B (Journey Planner only): `_jpDrinkingCoarseEase`**, uncapped past the cartographic cap —
  that cap exists for the MAP's own reason (don't clutter a rendered world with faint rivers), which
  has nothing to do with whether a thirsty party can find a spring. Measured on the reported world's
  own worst-case contiguous dry stretch (664 km through Cold Desert / Badlands, 50x past the
  cartographic cap's break point): Fix A's world-AVERAGE improvement didn't help this one stage,
  since the whole 664 km sits inside a single contiguous dry run either way. Implemented by
  "swapping" `flowThresh`'s already-capped ease for the uncapped one inside `_jpStageDryKm`
  (multiply out `riverCoarseEase`, divide back in `_jpDrinkingCoarseEase`) — avoids double-applying
  the shared portion, no new parameters needed.
- **Measured net effect**: drinkable-land fraction 34%→96% (16%→95% desert); the reported worst-case
  874km stage for a 10-Mounted-Rider party with zero pack animals dropped from **3742%→698%** of
  capacity — still correctly flags this specific, genuinely extreme configuration rather than
  over-correcting to never block at all.
- **New: Generate → World "ℹ️ Info" button**, directly motivated by this investigation — the
  on-screen `#readout` panel wasn't enough to reproduce the reported world exactly (several tect/
  erosion sliders it never showed). `generationInfoText()` leads with the same on-screen fields then
  a `JSON.stringify` dump of every generation-affecting state block (tect/volc/crater/erosion/
  stream/glacial/coastal/planet/world_structure) — a full field list, not hand-picked, so a future
  slider is automatically included. Copies via `navigator.clipboard`, falling back to
  `execCommand('copy')`, falling back to a manually-selectable `<textarea>` — must degrade
  gracefully on `file://`, where Clipboard API availability isn't guaranteed.
- **Tests**: 7 new engine unit assertions (`test_tail.js`, `tests/run.sh` now 1038/1038); 11 new
  smoke assertions (`R.v101`) for the JP easing and the info button's full lifecycle, independently
  verified via isolated Playwright reproduction (this environment's pre-existing `smoke_gen1.js`
  crash, disclosed in v1.100, reproduces identically here — confirmed unrelated by checking it fires
  at the same position regardless of what test code follows). `run_um.sh` 852/852 (block 4
  untouched). `hash_gen1.js` ALL IDENTICAL at the default battery; a direct field-hash A/B at
  mapWidthKm=12,800 confirms the expected divergence there.
- **Known scope cuts**: `JP_DRINKING_COARSE_MAX=64` and `riverCoarseEase`'s shared cap magnitude are
  reasoned, not independently calibrated; the info button's dump covers geology/climate generation
  parameters, not a full save-state export (`exportZip()` already does that).

### Journey Planner stage-blocking audit: a real remedy gap fixed, two other suspects cleared by measurement (v1.100)

Owner asked to fix, together, three things flagged by a Journey Planner audit: frequent stage
blocking, whether the route-drawing cost model over-prefers water, and whether settlement gravity
ever produces pathologically bad detours. Civ-layer only. Hash vs v1.99 ALL IDENTICAL.

- **Real fix: `_stageTrouble` missed 2 of `_jpVesselWaterBlock`'s 4 verdicts.** "Cannot operate on
  rivers/lakes"/"the open sea" (a MODE mismatch, not a rating shortfall) and "No vessel selected"
  matched neither pre-existing regex (no hyphenated "open-sea", no "navigate"), so both fell to the
  fully generic catch-all. Both mean the party cannot make this water leg at all — the one case
  where re-routing the WHOLE journey land-only is a genuine, deterministic fix. `_jpRerouteForMode`
  gained an optional `forceMode` param (omitted = identical pre-v1.100 behaviour) so a new
  confirm()-gated "🔧 Re-route journey, land-only" button can force land even when the journey's
  overall Transport is still Sea Faring/River Transport for the rest of the trip. The land-side
  capacity hard-blocks (v1.63/v1.67) already name their own remedy in `r.blocked`; they now point at
  the controls instead of the generic line, same as the sibling water-resupply case — no button,
  per the existing v1.48/v1.49 "cargo/party-size stays the user's own call" precedent.
- **Test-authoring trap found while verifying it**: a mocked water stage with the wrong vessel set
  at the PLAN level never blocks — `_jpPlan`'s own v1.53 graceful per-stage fallback silently
  substitutes a working vessel whenever a water stage's block has no EXPLICIT per-stage override,
  and a shared-plan vessel doesn't count as one. Fixed the test (`stageOverrides[idx].vessel`), not
  the (correctly working) fallback.
- **Suspect #1 (sea-cost model), re-verified and cleared.** A first comparison (mixed-mode vs.
  `mode='land'`) suggested `_CIV_SEA_COST=0.6` pulls routes into the ocean for near-zero benefit.
  Re-run against a FAIR baseline — `_civMixedCostGrid`'s own land-cost formula (biome friction +
  river discount) with water forced to Infinity, instead of `_civLandCostGrid`'s plain slope-only
  cost — the same routes are typically within ±2% of the achievable land route, a third show a real
  ~6–7% water advantage, and many of the highest-water-fraction cases have no land alternative at
  all (genuinely separate landmasses). Sweeping the constant 0.6→1.1 didn't change the outcome — the
  preference is friction-driven, not a coin-flip artefact. No change shipped; recalibrating a model
  that measures out as reasonably grounded would itself have been the "guess-and-ship" this file's
  CHANGELOG repeatedly warns against.
- **Suspect #2 (settlement gravity + the existing-way discount), also cleared.** Direct A/B (real vs.
  a neutralized control) measured worst circuity 1.57×, up to ~20% longer than neutral — bounded,
  matching v0.73's "soft + capped" design and v1.64's explicit "always follow existing
  infrastructure" request. One methodology trap along the way: clearing `civWays`/`state.roads`
  entirely to build the "neutral" control also strips the v1.53/v1.99 documented ferry-crossing
  exception, so several seeds' farthest pairs read as "unreachable" once the ferry was removed —
  not a gravity/discount effect. Re-run against ferry-independent pairs.
- **A real, unrelated bug caught by the smoke suite's own v1.52 assertion during verification**:
  this file shipped with the JS `VERSION` const still reading `'1.99'` — the THIRD recurrence of
  this exact drift (v1.30, v1.52, now this). Fixed; a real single-source-of-truth fix is disclosed
  as a follow-up, not folded into this bump.
- **Known environmental note, not a regression**: the full `smoke_gen1.js` run (700+ assertions)
  crashes the headless Chromium page near its own end in this execution environment — reproduced
  identically against an unmodified v1.99 with a no-op stub in place of this version's own new test
  block, confirming it predates this change. The new assertions were independently verified via
  direct, isolated Playwright reproduction instead. `tests/run.sh` (1031/1031), `tests/run_um.sh`
  (852/852), and `hash_gen1.js` (ALL IDENTICAL) all ran clean.
- **Known scope cuts**: the vessel-rating-shortfall messages ("not rated for open-sea conditions",
  "cannot navigate X") keep their pre-existing vessel-swap-only fix text (a different hull might
  sail this exact water fine) — land-only reroute is mentioned but doesn't get its own button there;
  the `VERSION` triple-drift's real fix (one source of truth) is disclosed, not built, this pass.

### Routing geometry can cut a corner across forbidden terrain; a ferry exception found along the way (v1.99)

A live Journey-Planner audit (real world, land+sea routes, checked against
`docs/research/travel-speeds.md`) found land-mode routes reading partly as ocean and vice versa.
Civ-layer only (`_civSmoothPath` + its five callers). Hash vs v1.98 ALL IDENTICAL.

- **Root cause: `_civRoutingGrid`'s downsampled coarse cell can read "passable" while other
  full-res pixels inside it are the forbidden terrain, AND `catmullRomSample`'s Catmull-Rom spline
  is not guaranteed to stay within its own control points' convex hull** — reproduces even at 1:1
  resolution (no downsampling), so it's the spline, not merely the downsample. `_jpDeriveStages`
  correctly classifies the resulting phantom stage; the stage itself shouldn't exist. Either
  hard-blocks a fine journey with a confusing hold/porter-capacity message, or silently succeeds
  with a nonsensical leg (a solo walker "crossing" 230 km of open water, no warning).
- **`_civTerrainValidTest(kind)` + `_civNearestValidPt`** — a full-resolution repair pass inside
  `_civSmoothPath` itself (new optional `isValid` param): any smoothed point failing the FULL-res
  version of its own cost grid's passability test snaps to the nearest cell that passes (bounded
  expanding-box search, mirrors the existing `snapFinite` idiom). Wired at every 'land'/'water'
  caller (`_civDijkstraPath`, `_civMstRoutes`, `_civHierarchicalNetwork`,
  `_civConnectPlaceToNetwork`, `_civConnectVillageAddons`); 'mixed' mode is exempt by design
  (`_civMixedCostGrid` allows crossing water when cheaper — no forbidden terrain to repair).
- **A first cut of the fix was itself wrong, caught by measuring before AND after.** Water-fraction
  went UP (2%→32%) on one route after the naive repair. Cause: `_civDijkstraPath`'s own land-mode
  cost grid already has a documented exception (v1.53) — an existing sea-lane way is a traversable
  "ferry crossing" even in land mode. The naive fix didn't know that and "fixed" a real 77-point
  ferry leg back onto dry land (measured: all 77 within 2.83 px of the actual lane). New
  `opts.allowSeaLanes`, wired ONLY at `_civDijkstraPath`'s land branch — the one cost-grid builder
  with this exception (every other land-only caller has none, confirmed by reading them).
- **`_civJoinDijkstraSegs` gained `unreachableLegs`; `_civCommitWay` now warns** (non-blocking, way
  still commits — a hand-placed waypoint is the user's own work) instead of silently drawing a
  straight line through forbidden terrain when no real path connects two Way waypoints — the one
  `_civDijkstraPath` caller besides `_jpRerouteForMode` (v1.47, already correct) that never checked
  `.reachable`.
- **The audit's third finding (solo-walker paved-road speed) was a comparison error, not a bug** —
  measured 43.3-50.3 km/day against travel-speeds.md §8's CALENDAR-AVERAGE column (30-40); the
  correct column for this tool's `dailyKm` (v1.52: explicitly the travel-day figure, rest days
  added separately) is TRAVEL-DAY (40-50) — the measured figures fit, 0.3 over at the very top. No
  code change.
- **Verified**: live A/B, 7 seeds, 25,652 land-mode path points — 0 genuinely-bad (excl. ferry)
  after the fix; auto-network/sea-lane-MST/village connectors (no ferry exception, strict standard)
  also clean. Two residual "bad" points in one seed traced to a SETTLEMENT'S OWN PIN sitting on a
  water-classified cell — a placement question, correctly untouched (caller endpoints are never
  moved by the repair pass). Hash ALL IDENTICAL, 1031/1031, 852/852, smoke +16.

### Sea-lane geometry from round-trip time (v1.98)

Second half of the routing-audit work (U4+U5). Closes its P1 sea-current/wind rows. Hash vs v1.97
ALL IDENTICAL — sea lanes are civ-layer, never touched by `generate()`.

- **`roadDijkstra` gained an optional trailing `edgeCost(i,j,dx,dy)`.** Every cost model here was
  `cost(cell)`; currents/wind/flow are `cost(from → to)`. The loop already computed a per-edge step,
  so this was one seam. **Omitting it takes the identical arithmetic path** — bit-identical by
  construction, asserted by diffing the whole `dist` array against a null-callback run.
- **`_civSeaTimeEdgeCost` replaces the flat `cost=1` per ocean cell.** Sea lanes were pure
  shortest-distance and the v1.77–v1.82 vector fields had zero influence on geometry. Now each edge
  is priced by sailing time (rig polar vs local TWA + along-track current). The coarse fields are
  resampled onto the routing grid ONCE — they are deliberately uncached (v1.86).
- **A Prim MST is UNDIRECTED, so an asymmetric cost has no well-defined tree.** Rather than invent a
  tie-break, each edge costs the MEAN of its two directional times. That is the right objective
  anyway: a permanent lane is sailed both ways. Symmetric by construction ⇒ MST valid, deterministic
  (asserted). It is NOT a no-op — the polar is non-linear, so an along-wind lane (broad reach one
  way, beat the other) has a worse round trip than a cross-wind lane that reaches both ways.
- **`_CIV_LANE_TACK_FLOOR`**: polar 0 means "cannot sail this angle directly", not "cannot get
  there". Without it an upwind edge costs Infinity and reads as impassable ocean.
- **The obvious aggregate test was too weak to report.** Mean sailing quality across whole worlds'
  lanes moved +0.35% — noise, because a world has only ~1–6 lanes with fixed port endpoints. The
  real evidence is the controlled comparison on the same water under the same metric: **36 better,
  0 worse**, up to 15.3% faster, accepting up to 24% longer paths. Audit Test D passing.
- **Deliberate re-baseline**: regenerated sea-lane geometry differs from v1.97 (verified it moves on
  every seed). Land routing untouched (`edgeCost` null for `isSea=false`).

### Water route conditions derived from the real fields (v1.97)

First build off `docs/research/routing-audit.md` — closes its two **P0** rows. Owner picked scope
U1+U2+U3 (then U4+U5) with auto-derived + manual override, via `AskUserQuestion`. Journey-Planner
only; hash vs v1.96 ALL IDENTICAL.

- **`_jpDeriveStages` hardcoded `routeCond="Neutral"` for EVERY water stage.** So
  `JP_ROUTE.river`'s Downstream/Upstream bands and `JP_ROUTE.sea`'s "Favorable Wind & Current"
  existed in the tables but were unreachable by derivation, and **A→B always cost what B→A cost**.
  The data was already computed and never consulted.
- **U1 river**: the chunker already accumulates `gain`/`loss` in metres, so `(loss-gain)/km` is a
  free signed gradient. **U2 sea**: `_jpSeaCondition` samples `currentOceanField()`/
  `currentWindField()` — resolved ONCE per route and only when a sea stage exists, because they are
  deliberately uncached (v1.86, so the debug views track the tilt/rotation sliders live).
  `twa = acos(-(Ŵ·t̂))` — the fields emit FLOW vectors in `pts`' own grid frame, so no conversion.
- **U3 `jpSailFactor`**: speed is NOT monotonic in wind angle — zero in the no-go zone, peak on a
  broad reach, lower again dead downwind. This is why the audit rejected the brief's own
  `V_eff = V_vessel + V_current + V_wind`: wind acts THROUGH the rig.
- **A rig's `neutral`/`span` are DERIVED from its own polar points, never written down.** A first
  cut used one flat 0.80 for all rigs — that sits near a SQUARE rig's best value, so an average
  heading read as adverse and **"Strong Headwind" was ~50% of all sampled passages**. The band must
  mean "favourable FOR THIS VESSEL"; rig-vs-rig comparison belongs in the speed table.
- **River thresholds are absolute (8/35 m/km), NOT world-relative** — unlike v1.34's food
  calibration. "Does this current help or hinder" is a property of the reach; normalising per world
  would make the same river read differently depending on its neighbours. First cut was 0.8/4.0
  against a measured p50 of 9.6–32.8 — an order of magnitude out.
- **Measured** (4 seeds × ~400 passages, both directions, n=1408): all five bands reachable
  (35/27/17/11/11%), **directional asymmetry 100%**. The residual bimodality is deliberately NOT
  tuned away — a square-rigger either has the wind or it does not, which is why historical
  square-rig trade ran seasonal and one-way.
- **Scope**: changes reported TIME, not route GEOMETRY. Sea lanes are still pathfound over a
  uniform-cost water grid — that is U4+U5 (`edgeCost` hook + directional lanes), the agreed next
  version, and it will be a deliberate re-baseline of generated lane geometry.

### A full-grid faction-aggregate pass ran on every generate(), into a hidden panel (v1.96)

Owner: "check for optimisation. However small every ms I'll take it. Without degrading the fidelity
of the data." Measure-first CPU profile over v1.95. **Root-causes the OPEN item v1.92 logged and
could not explain** (`buildResourcePotentials` self-time inside a PLAIN `generate()`). Hash vs v1.95
ALL IDENTICAL — nothing about *what* is computed changed, only *when* and *whether*.

- **`_civSubTab` defaults to `'factions'` (v1.55), and `generate()`'s civ wrapper calls
  `_civRenderPlaceEditor()` → `_civRefreshActiveSubPage()` BEFORE `_origGenerate`.** The Factions
  branch reaches `_civFactionAggregates()`, which unconditionally builds
  `currentResourcePotentials()`/`currentPopulationDensity()`/`buildBiomeRaster()`/
  `_civOceanDistField()` plus a full `GW·GH × CIV_RESOURCE_KEYS` accumulation — against the world
  about to be destroyed, into a panel that is `display:none`, with every filled cache nulled moments
  later by `generate()` itself. **686 ms per generate() at 1024px, with zero settlements and zero
  territory to aggregate.**
- **`_civSubPageVisible()` reads `#genCiv`'s inline `style.display`** — the exact property
  `#genSubBar`'s handler toggles — so the check is exact and costs no `getComputedStyle`/layout
  flush (it sits on the per-place-mutation path). Paired with a **refresh-on-reveal** in that
  handler, which also fixes real pre-existing staleness: it never refreshed on open, so the
  hidden-panel render was the only thing keeping the page current.
- **A visibility gate must not swallow state resets, and "it only renders" is a claim to verify,
  not assume.** The first cut put the gate at the top of `_civRefreshActiveSubPage()`, with that
  reasoning written into the comment as fact. False — the Factions branch opens with
  `_civCloseFactionsModal()`/`_civCloseFactionDrawer()`, and **`#civFactionsModal` is a
  full-viewport overlay OUTSIDE `#genCiv`**, so it can be open while the panel is hidden. v1.55/
  v1.57's tab-re-entry assertions went red (683/4 vs the 685/2 baseline). Those resets are now
  unconditional above the gate.
- **`computeFlow()` read the module-global `state.world` INSIDE its D8 neighbour loop** (~21M
  lookups at 2048px, twice per generate). Hoisted — pure read-motion, same class as v1.92's D8
  `Math.hypot` hoist in this very loop. Every other D8 loop was checked; this was the only one.
- **Measured**: alternating-order A/B, fresh page/cold cache per trial, 1024px — `generate()`
  median **8227 ms → 7830 ms (−4.8%)**; the clean trials (3-5, after a concurrent `run.sh` stopped
  competing for CPU) are tight and non-overlapping at ≈ **−430 ms**.
- **Deliberately not touched**: `flexure` (3816 ms) is one `gaussBlur` → `GPU.blurArr`, i.e.
  SwiftShader `readPixels` — v1.89's documented needs-a-real-device item; the per-pixel colour loop
  (v1.87 profiled clean, only lever left is a fidelity-trading LUT); `computeResistance`'s per-cell
  `plates[…].base` deref (51.5 ms, and flattening turns an out-of-range throw into a silent NaN).

### Duplicate-logic sweep: seven "two functions answering one question" instances consolidated (v1.95)

Owner asked for an audit of functions that should be standard-on or merged into one, then "Fix all
7" of a dedicated agent sweep's findings — this file's own recurring lesson (v1.30 on), hit again.
Civ-layer only. Hash vs v1.94 ALL IDENTICAL. 1031/1031, 852/852, 685/687 smoke (2 known
pre-existing environmental failures).

- **`_civEnhancedTravelCost` vs `_civMixedCostGrid` — the one that had ALREADY drifted.** Shared
  biome-friction table extracted (`_civBiomeFriction`, bit-identical). The river-discount formulas
  were a live bug: `_civMixedCostGrid`'s comment claimed to mirror `_civEnhancedTravelCost`'s curve
  "for consistency" while using a different, ungated formula. New `_civNavigableRiverDiscount(order)`
  is the one curve both use now — `_civEnhancedTravelCost`'s output is unaffected (0 of 41,984
  test-grid cells differ), `_civMixedCostGrid` changes on 12.4% of cells (mean cost +7.8%): order-1/2
  streams no longer get an artificial floor-discount, only genuinely navigable (order≥3) rivers do.
  The only one of the seven with a measured, disclosed behavior change.
- **`_civSettlementPopulation` vs `_civPlaceCatchmentCeiling`** — the latter's own comment admitted
  copying the former's formula. New shared `_civCatchmentPop(x,y,kind,K)`; verified the two now
  provably derive from the identical core across all 18 test-world settlements.
- **Journey Planner water rate + animal carry-days**, duplicated 4× and 2× — new
  `jpHumanWaterRate(biome)`/`jpAnimalWaterCarryDays(biome,supplyDays)`, siblings to v1.84's
  `jpHumanWaterCarryDays` (which fixed the adjacent carry-duration duplication but left these two).
- **Mild-upland defensibility term**, independently written at 3 sites (`buildSettlementSuitability`,
  `_civPlaceDefensibility`, `_umWallSpec`) — new `_civTerrainRuggednessD(r)` in block 1.
  `_umWallSpec` still can't call `_civPlaceDefensibility` (real recursion), but can share the raw term.
- **Base population-by-kind**, hardcoded at 3 sites with inconsistent `metropolis` coverage — new
  named `_CIV_BASE_POP_BY_KIND`/`_civBasePopForKind(kind)`.
- **A "0.60 coastal tolerance"** hardcoded at 2 sites with a comment wrongly claiming it matched
  `_civSnapToWaterEdge`'s default (actually 0.80) — new named `SETTLE_COAST_SWAP_TOLERANCE`.
- **Catchment-radius-in-cells conversion**, independently written at 5 sites — new
  `_civCatchmentRadiusRaw`/`_civCatchmentRadiusCells`.

Every fix verified directly (a probe reproducing the shared function against a hand-copy of the OLD
formula, plus full-grid diffs of the two cost functions' own output) rather than assumed bit-identical
from a small diff.

### Grain-yield wiring: connecting v1.31's orphaned formula surfaced a real overshoot bug (v1.94)

Owner: "Let's build in the grainyield part and all that it connects to." v1.31 shipped
`grainYieldRatio()`/`GRAIN_YIELD_RATIO_FLOOR`/`GRAIN_YIELD_RATIO_TYPICAL`/`GRAIN_SEED_KG_PER_HA`
grounded in `docs/research/settlement-resources.md` §10.4 but never called them — v1.93's dead-code
audit re-found the same orphaned code and correctly left it alone (v1.31's own CHANGELOG already
disclosed it as a deliberate scope cut, "exposed but only reported, not wired into food surplus").
This version does the wiring. Civ-layer display only. Hash vs v1.93 ALL IDENTICAL (a pure on-demand
read, never reached from `generate()`/`renderNow()`).

- **The wiring surfaced a real formula bug that had been invisible for lack of any caller.**
  `grainYieldRatio(K)`'s original formula reached `TYPICAL` at K=0.3 and kept climbing to a flat
  **5.68** (31% past the documented historical maximum of 4.34) for any K≥0.6. Fixed to a plain
  linear interpolation over K's own [0,1] range, matching the clamp convention its siblings
  `subsistenceModeAt`/`agrarianDensityKm2` already use.
- **`_civPlaceGrainYield(p)`** (new `_civPlace*` primitive, same thin on-demand idiom as
  `_civPlaceDefensibility`) samples `currentCarryingCapacity()` at the settlement's own cell and
  returns `{ratio, floor, deficit, kgPerHa}` — explicitly reported, not simulated, feeding no
  population/food-shed math (preserves the v1.34 ACYCLIC-chain rule).
- **One shared display function, both surfaces.** `_civFormatPlaceInsp(p)` already feeds BOTH the
  Settlement Inspector popup and the City Viewer's General section (the latter inlines the same
  call) — wiring it there once satisfies "all that it connects to" with no second display path.
- **Deliberately not derived from `grainYieldKgHa(soil)`** — its absolute kg/ha scale was calibrated
  for a different purpose (v1.34 population/food-shed modeling) than `GRAIN_SEED_KG_PER_HA`'s own
  historical basis; dividing one by the other would silently invent ratios up to 16.67.
- **Known scope cuts**: not surfaced in the Settlements table or Economy/Statistics pages
  (per-settlement granularity matches the `_civPlaceDefensibility`/`_civPlaceFoodSurplus`
  precedent); no world-relative self-calibration of the K→ratio curve — judged unnecessary since
  this is a zero-stakes display value, not a simulation input.

### Code streamlining: dead-code sweep + one real bug found along the way (v1.93)

Owner: "Can we make the very code itself more streamlined? This by removing unnecessary bits or
things that are double? Beware to not lose functionality!" A mechanical zero-reference sweep (every
top-level `function`/`const` declaration checked against `\bname\b` occurrences across all 4 blocks
AND both headless test suites), not a rewrite. Hash vs v1.92 ALL IDENTICAL — removed code was never
called.

- **Seven dead functions/subsystems removed**, each superseded by something else that does its
  job: `_civPopulateEntityInspector` (its two dispatch targets are called directly elsewhere);
  `computeRainfall()` (superseded by `simulateWeather()`); the `dirty`/`invalidate()`/
  `flushDirty()` dependency-graph layer (superseded by direct calls + `_fieldGen`/`_climGen`
  counters everywhere — only `dirty.render`/`scheduleRender()` was ever live, kept, `dirty` narrowed
  to `{render:false}`); `clearScratch()` (the `mbuf`/`ibuf`/`ubuf` pool already self-manages growth);
  `view3dSync()` (its body is duplicated inline at `enter3D()`, the only place that needed it);
  `_origRenderNow` (an abandoned capture — the real renderNow-wrap-for-the-perf-overlay wiring
  exists under a different name, `_renderNow_orig`, ~3700 lines later); `polylineCrossings` (UME
  engine, block 4 — a thin `segInt` wrapper nothing in the ported engine calls, not in UME's own
  `_test:{}` exposure either). Three unused data constants also removed (`ORGANIC`, `LANDFORM_KEYS`,
  `SCULPT_GLOBAL_KEYS`) — each checked against its sibling (materials palette / `LANDFORM_COLS` /
  `SCULPT_GLOBAL_DEF`) to confirm only the name/label half was orphaned, not the data it labels.
- **One real bug found and FIXED, not removed**: `resource_index.json` was documented (a v1.31-era
  comment stated as fact that "these keys are written into `resource_index.json`") but never
  actually pushed into `exportZip()`'s entries — unlike its siblings `biome_index.json`/
  `lithology_index.json`, which are. Wired `resourceIndexManifest()` in, matching the existing
  pattern exactly. Verified via a real export probe: the entry now exists with all 15 resource keys.
- **Deliberately left alone**: `grainYieldRatio()`/`GRAIN_YIELD_RATIO_*` — also zero-caller, but
  v1.31's own CHANGELOG already discloses this as an intentional, accepted scope cut ("exposed but
  only reported, not wired into food surplus"), not accidental cruft. Every function only called by
  the test suites (`featuresNear`, `collectVisibleTiles`, `chunkChildren`, `unpackRGB8`,
  `grainKgPerHaMedieval`, etc.) was left untouched — deliberately-kept, tested pure primitives.
- 1031/1031, 852/852, hash ALL IDENTICAL, smoke matches the v1.92 baseline exactly (no new
  assertions needed — removed code was unexercised by design, and the export fix is covered by the
  existing `exportZip()` round-trip surface). Net ~60 fewer lines, same behavior, one silent gap
  closed.

### Generation-chain speed pass: D8-neighbour Math.hypot hoist + assignPlates flattening (v1.92)

Owner: "Check the full génération chain and rendering chain function by function and see if we can
optimise." A genuine function-by-function CPU-profile audit (CDP Profiler self-time + direct
wall-clock A/B, not repeating v1.87/v1.89's already-covered ground). Engine only. Hash vs v1.91 ALL
IDENTICAL — both fixes are pure access-pattern/hoisting changes, never a reformulation.

- **`Math.hypot(dx,dy)` was recomputed fresh on every (cell, neighbour) pair across 7 D8-loop sites
  in 4 functions** (`streamPowerKernel` ×4, `glacialKernel` ×1, `computeFlow` ×1 — run twice per
  default `generate()` — and `buildRiverNetwork` ×1) even though `dx,dy∈{-1,0,1}` only ever produces
  2 distinct values. Fixed with a 9-entry lookup (`D8[(dy+1)*3+(dx+1)]`) built once per call via the
  SAME `Math.hypot` call the inline version used — a pure hoist, bit-identical by construction. Kept
  local (not a module global) inside the two worker kernels to preserve invariant 11's
  self-containment requirement. Every OTHER `Math.hypot(dx,dy)`-shaped call site in the file was
  checked and correctly left alone (droplet/velocity kernels, brush radii, settlement distances all
  pass genuinely varying dx,dy).
- **`assignPlates()`'s JFA Voronoi rasterisation dereferenced `plates[p].x`/`.y` (object property
  access) inside its innermost loop** (per-cell × up to 8 neighbours × log2(dim) JFA passes).
  Hoisted into flat `Float64Array`s (`PX`/`PY`) built once at function entry; `plates` itself and
  every other reader elsewhere in the file is untouched.
- **Measured via direct wall-clock A/B** (this file's own v1.87/v1.89 methodology — profiler
  self-time alone is known to overstate real impact): `generate()` total at 2048px
  **39438.8ms → 33912.8ms median (−14.0%)**, non-overlapping trial distributions; `assignPlates()`
  alone **3489.6ms → 3185.0ms median (−8.7%)**, also non-overlapping.
- **Render chain audited, no fix shipped**: a CPU profile of the hot-cache `renderNow()`/
  `drawCivLayer()` interactive path (30 calls on a real 41-settlement/71-way world) measured under
  1ms/call at 1024px — already well within budget, no redundant computation found; the per-pixel
  colour loop was re-confirmed clean, matching v1.87's own conclusion.
- **Considered, not pursued** (logged in HANDOFF's "Next / open"): GPU `readPixels` cost (still the
  single largest self-time line item, still not actionable in this SwiftShader-only environment per
  v1.89's own disclosure); a small (~500ms at 2048px) `buildResourcePotentials` cost inside
  `generate()`'s own trailing render whose trigger wasn't tracked down this pass.
- 1031/1031, 852/852, hash ALL IDENTICAL, smoke suite matches the v1.91 baseline (no new assertions
  — a performance-only change has nothing new to assert beyond existing bit-identity coverage).

### Asset pack persistence + the Splat-texture Library bridge (v1.91)

Owner: "Make sure all shown functions in saving and loading assets are functional. And that saving
a map saves everything ways, settlements, assetpack, painting everything." Audited every save/load
surface first — ways/settlements/painting were already correctly round-tripped (`_civSyncToState`/
`_civSyncFromState`, `state.cartoPaint`), reconfirmed live. The asset pack was not: `loadAssetPack()`
(the header's "Import asset pack…" button) only ever wrote the runtime `assetPack` global directly,
never touching the Asset Library's own `AssetDB` — the one thing `_alExportEntries`/
`_alImportProject` actually persist (invariant 6: `assetPack` is never serialized directly). A live
`exportZip()`→`loadZip()` probe confirmed total, silent loss: 10 icon/7 texture slots before export,
`null` after reload. Fixed with a new `window._alImportPackZip` bridge (mirrors the existing
`_alExportEntries`/`_alImportProject` cross-block convention) that re-decodes the same pack bytes
through the Library's own `AssetImporter.importPackZip()` right after `loadAssetPack()` sets
`assetPack` — `assetPack` itself untouched, only `AssetDB` gains the mirrored items so the next save
captures them. Testing that fix surfaced three more real bugs in the pre-existing v1.26/v1.28
Library→runtime bridge (`syncToRuntime()`/`applyLibraryAssets()`): the "Splat channels" (`textures`)
family was never wired in at all (only biomes/terrains/structures/scatter-icons were, v1.28's own
"EVERY family" pass missed the one family that predates it) — ground-material art from the Library
reached the map only via a full pack export→re-import loop; `assetPack.texAny` (the gate every splat
render call site checks, `_splatK=(assetPack&&assetPack.texAny)?...:0`) was never set by the bridge
even once the fix above restored the texture slots — data present, invisible; and pack
name/author/license attribution never traveled through, so a Library-restored pack read as the
generic "Asset Library" default. All three fixed in `syncToRuntime()`/`applyLibraryAssets()`. A
fifth, smaller gap found reading the two importers side by side: the Asset Library's OWN "Import
pack" button never called `syncToRuntime()` (every other way art enters the Library pushes to the
map immediately; this one needed a separate "Apply to map" click) — fixed, confirmed via a real
`page.setInputFiles()` drive of the actual file input, not a direct function call.
`syncToRuntime()` now also refreshes the pack-inspector thumbnails/icon-paint pickers itself.
Disclosed residual: a texture round-tripped through the Library gets resampled to that family's
fixed 512×512 canvas if it wasn't already that size (confirmed: a 256×256 sample-pack texture became
512×512 post-reload, `inv` unchanged to four significant figures — same content, not corruption; a
pre-existing property of `renderToCanvas(item,fam.size,fam.opaque)` biomes/terrains have had since
v1.28, inherited rather than introduced by the new `textures` branch). Hash vs v1.90
ALL IDENTICAL (default render untouched; every fix is reachable only once a pack is imported). 1031/
1031, 852/852, 7 new smoke assertions (`R.v191`) exercising the direct-import mirror, the
Library-only rebuild path, `texAny`, and pack metadata via the real `exportZip()`/`loadZip()`
mechanics.

### Save files: DEFLATE-compress the project .zip (v1.90)

Owner: "simplify save files and find a way to optimise the internal formatting of the save files
and compression of the save files." `zipStore` (this file's zero-dependency ZIP writer) hardcoded
STORE (no compression) for every entry — measured on a real populated world: 71.24 MB of raw
`.f32`/`.bin`/`.json` entries, zero compression. `unzipAny` (already shipped, used by
`loadAssetPack`) already read both STORE and DEFLATE via the central directory; only `loadZip()`
was still hardcoded to the store-only `unzipStore`. Fixed by DEFLATE-compressing each entry via the
native `CompressionStream('deflate-raw')` (falling back to STORE when compression doesn't actually
shrink the entry, or for `.png` names — already internally compressed, skip the wasted attempt),
making `zipStore` async (every call site was already inside an async context), and switching
`loadZip()` from `unzipStore` to `unzipAny` (a strict superset — every pre-v1.90 save still reads
correctly). Verified via the REAL `exportZip()`/`loadZip()` functions (Blob captured by
monkeypatching `URL.createObjectURL`, not a reimplementation): field/temp/rain hashes, settlement/
way/label counts, sea level, and seed all matched exactly after a full round-trip; same world, same
settings, file size 26.35 MB → 12.11 MB (54% smaller) including the baked map.png; the isolated
raw-entries measurement showed 78.2% (resource-potential fields, mostly-zero rasters, compressed to
0.4-10% of raw size). Two test-writing mistakes caught and fixed before shipping: a synthetic
"smooth" compression-ratio test assumed sine-wave data compresses >2x (measured only ~9% — generic
DEFLATE isn't float32-mantissa-aware; replaced with a sparse mostly-zero array, the actual shape
that drives the real win); a hand-rolled backward-compatibility test's central directory record
omitted its own trailing filename copy (ZIP central-directory entries carry a SEPARATE copy of the
name from the local header's) — fixed by following this file's own pre-existing correct pattern.
Hash vs v1.89 ALL IDENTICAL (export/import format only, never `generate()`/`renderNow()`). Format
itself is unchanged (same entries/names/content) — a genuine content-level simplification (removing
truly re-derivable data) was considered out of scope; `exportRegionTiles`'s own pre-existing ad-hoc
per-file gzip mechanism is now largely redundant but deliberately left alone (a user-facing
checkbox + documented `.gz` naming convention, lower value to touch than the main save path this
request was about).

### Simulation-speed pass: erosion kernels' priority-flood heap (v1.89)

Owner: "Again search for optimisation in the simulation, rendering, LOD, and way/route/
PathFinding.js systems" — continuation of v1.87's render pass, targeting `generate()` itself
(`carveRivers` was 18s, `plates+stress`/`flexure` 6s/3s at 2048px, dwarfing anything v1.87 touched).
Engine only. Hash vs v1.88 ALL IDENTICAL. Two real fixes, one real regression found and reverted —
all verified by direct A/B wall-clock measurement, since a CPU profile of these specific hot loops
turned out to meaningfully overstate the win. `streamPowerKernel` (runs synchronously inside
`carveRiverValleys()` on every default `generate()` call, not just the manual erosion button) and
`glacialKernel` got the same preallocated-typed-array `MinHeap` fix as `buildWaterBodies` (v1.87).
`streamPowerKernel`'s own implicit-incision loop was also recomputing a per-cell coefficient
(`Math.pow`-driven) on every one of `P.iters` passes even though every input to it is fixed before
the loop starts — hoisted into a **`Float64Array`** (not Float32 — the original was full-precision
JS numbers; a first cut cached into Float32 and was correctly caught as a real mismatch by
`hash_gen1.js`). Net: ~12% off `carveRivers`, ~4-5% off total `generate()` at 2048px. The SAME fix
applied to `roadDijkstra` (per-settlement road-network Dijkstra) measured WORSE, not better — up to
-41% on a 36-settlement "Generate Roads" run — because that function allocates a fresh heap PER
SETTLEMENT, so typed-array allocation/copy overhead dozens of times per run outweighed V8's own
already-tuned plain-array growth; reverted, with the measured numbers left in a comment. LOD
(profiled zoom/pan session) and the per-pixel render loop were re-investigated and found already
tight (same conclusion as v1.87 — no redundant computation, cost is inherent to the feature set).
`assignPlates`/`computeStress` read for the same defect patterns, found clean. GPU-path timing
(`gl.readPixels` synchronous readback in `gaussBlur`/`normalize()`/`computeTemperature()`) measured
as a real cost but not investigated further — disclosed rather than acted on, since this headless
test environment's SwiftShader software-GPU numbers can't represent real-device GPU behavior.

### Settlement pick priority + visibility-gate consistency (v1.88)

Owner: "Settlements are clickable on any zoom level, making it hard to click a larger settlement
when you're zoomed out as it often means you click one of the smaller ones that are only visible
when zooming in." Civ-layer only. Hash vs v1.87 ALL IDENTICAL (interactive-only). Two defects, both
present at all five place-pick sites (`_civSelectPlaceAt`, `_civDropPlace`'s select-near-existing,
both `_civInfoAt` radii, the right-click context menu — the umpteenth "several call sites answering
one question WILL drift" instance): (1) every site did pure nearest-pixel with no regard for how
prominently `drawCivLayer` actually draws a settlement (`(4+klass.rank)*lsc`, rank 0 hamlet → 4,
rank 5 metropolis → 9) — a small, close pin could out-compete a much bigger one only slightly
farther away; (2) only `_civSelectPlaceAt` respected the `villageAddon` visibility gate (v1.68/
v1.70) — a village `drawCivLayer` refuses to draw below `CIV_VILLAGE_ADDON_LOD` could still be
picked at the other four sites. Fixed with two shared helpers — `_civPlacePickVisible(p)` (mirrors
the one case fully hidden: a still-hidden `villageAddon`) and `_civPlacePickWeight(p)` (mirrors
`drawCivLayer`'s own pin-size formula verbatim) — applied at every site by ranking candidates on
`d²/w²` instead of raw `d²`. The absolute pick radius (v1.23's `_civZoomPickR`) is unchanged — only
the tie-break among in-range candidates shifted, so an isolated settlement's click behavior is
untouched. `_civInfoAt`'s tight City-Viewer pin-hit re-test is deliberately left unweighted (it
re-tests an already-chosen candidate, not a competition — a first cut weighted it too, blowing up
the radius up to 81× for a metropolis, caught and reverted before shipping). Verified directly
against unmodified v1.87 in both directions: a realistic near-miss (city farther but bigger) picked
the hamlet on v1.87, the city on v1.88; a hidden addon under a zoomed-out click was selected by
`_civDropPlace` on v1.87, not on v1.88; an unambiguous click directly on a small settlement still
picks it on both (guards against over-correcting into a blanket big-settlement bias). 6 new smoke
assertions (`R.v188`).

### Rendering-speed pass: buildWaterBodies()'s priority-flood heap (v1.87)

Owner: "let's see if we can optimise the code again for rendering speed whilst we keep the fidelity
and detail." Measured first via `tests/perf/perf_gen1.js`'s render phase split, which showed the
render "prologue" (everything before the per-pixel colour loop) costing nearly as much as the pixel
loop itself at large resolutions. A CPU profile (CDP `Profiler`, real 2048px world) isolated it to
`buildWaterBodies()` (the ocean/lake classification behind `currentWaterBodies()`, rebuilt once per
terrain change) — specifically its `MinHeap` (Barnes-style priority-flood depression fill), backed by
two dynamically-growing plain JS arrays even though every cell is enqueued at most once (a known
upper bound `n=W·H`). Fixed by preallocating `Float32Array`/`Int32Array` heap storage (same sift-up/
sift-down comparison logic, so push/pop order and every filled value stay bit-identical) and hoisting
two neighbour-test closures (`nb`/`visit`) that were being reallocated on every one of up to `n` loop
iterations. Verified three ways: `hash_gen1.js` ALL IDENTICAL; a direct hash/sum comparison of
`buildWaterBodies`'s own output arrays at 512/1024/2048px; and a controlled 6-trial A/B (fresh page,
cold cache, alternating versions) measuring a real 16% reduction at 2048px (median 1006ms→844ms) —
the official `perf_gen1.js` harness itself under-reported this because its render-phase measurement
runs immediately after twelve back-to-back `generate()` calls, adding enough background noise at
2048px to mask the win. The per-pixel colour loop (`surfaceColor`/`materialWeights`/`landColorCore`)
— the single largest render cost overall — was profiled too and left untouched: no redundant
recomputation found, the cost is the genuine price of the existing feature set (multi-octave noise
jitter, two-pass canopy closure), and further speedup would need either a LUT approximation (violates
the "keep fidelity and detail" constraint) or a larger, higher-risk dispatch restructuring. `MinHeap`
itself keeps its exact O(n log n) comparison structure — a faster heap variant was considered and
rejected: it risks popping equal-priority cells in a different order than the original binary heap,
which would change the fill-height tie-break cascade and thus the final lake classification.

### Bug hunt + optimization pass: climate re-simulation silently left settlement suitability stale (v1.86)

Owner: "Can you bug hunt and do a optimisation pass." An audit pass — found via static analysis
against this file's own `_fieldGen`/`_climGen` cache convention, confirmed by direct before/after
reproduction before any fix shipped. Engine only. Hash vs v1.85 ALL IDENTICAL (fixes only *when*
caches recompute, never their deterministic value).

- **Root cause**: `computeFlow()`/`generate()` null a derived-cache family together (biome raster,
  soil, lithology, landform, resources, carrying capacity, settlement suitability, wildlife, NPP,
  population density, wetlands) since all transitively read temp/rain/flow/field. But
  `computeTemperature()`/`simulateWeather()` — reachable independently via a climate-slider drag or
  the "Simulate weather" button — rewrite temp/rain WITHOUT going through computeFlow/generate, so
  none of that family invalidated. Same defect class the sea-level slider's handler already had to
  patch once (its own comment: "owner report: the geological Resources view stayed stale... NOT
  invalidated on a sea change") — never extended to climate.
- **Consequential**: `currentFloodField()` feeds `buildSettlementSuitability`'s flood penalty AND
  `_civSnapToWaterEdge` directly. The real workflow this breaks: generate once, try several climate
  configs via "Simulate weather," auto-populate — settlements silently used the FIRST config's data.
- **Two narrower, same-class bugs**: `currentFloodField`/`currentWindThrowField` were keyed on
  `state.tect.seed` instead of `_fieldGen` (every sibling cache already uses it) — a same-seed
  regenerate or sculpt/erosion edit never invalidated them.
- **Fix**: `computeTemperature()`/`simulateWeather()` gained the SAME family-invalidation line
  computeFlow/generate already use, copied verbatim (a narrower hand-picked list nearly shipped
  missing `_landformF`/`_lithField`, both transitively rain-dependent). The two cache keys switched
  to `_fieldGen`(`,_climGen` for wind-throw).
- **Bundled optimization**: `buildWindThrowField` reuses the cached `buildBiomeRaster()` instead of
  re-running `classifyBiome()` per cell — also fixes a real mountain-lake misclassification.
- **Considered, not done**: caching `currentWindField()`/`currentOceanField()` (the only
  `current*Field()` accessors with zero caching) — but they recompute their `tSea` proxy directly
  from live state (via `climEffectiveEquatorTemp()`), which is WHY they update instantly while
  dragging tilt/rotation sliders; a version-keyed cache would have reintroduced staleness there,
  trading one bug for another. Left uncached, disclosed rather than shipped as a plausible regression.
- **A second, unrelated finding, surfaced only while verifying the new tests, NOT fixed this pass**:
  `computeFlow(true)` is not idempotent across two calls even when `field` ends up bit-identical
  before each — carve a depression, `computeFlow(true)`, restore `field` to its exact prior bytes,
  `computeFlow(true)` again, and `flowField` differs by a mean ~0.86/cell from a version that was
  never touched. Confirmed to reproduce identically on unmodified v1.85 (predates this version, not
  a regression). `R.v186`'s own terrain-edit test was rewritten to restore `field`/`flowField`
  directly via `.set()` rather than depend on this. See HANDOFF's Next/open for the full note.
- **Verified by direct reproduction**: a probe confirmed carrying capacity/biome raster/wind-throw
  were frozen on v1.85 across a drastic climate swing + re-simulation, and correctly respond on
  v1.86 (357.26→279.43 summed carrying capacity on the reference seed); a second probe confirmed the
  flood field was frozen across a same-seed terrain edit on v1.85 and responds on v1.86.
- **Tests**: 1017/1017, 852/852, hash ALL IDENTICAL, 7 new smoke assertions (`R.v186`).
- **Known scope cuts**: the wind/ocean-field caching question (disclosed above); this pass covers
  block 1 engine/climate caches only — civ-layer and render-hot-path audits not attempted, since this
  finding was substantial enough to verify thoroughly rather than spread effort across subsystems.

### Ocean heating grounded in axial tilt + rotation; confirms climate→rendering interconnection (v1.85)

Owner: "gravity, axial tilt and how long days are on the world all these things inform how much
energy a sun sets in a world and how much it keeps (eg. the heating of the ocean and flow of it are
influenced) let's always assume a sun like star and quantify this in a simple way. All I want is that
the heating of the ocean and resulting ocean currents and subsequent wind are all based in grounded
values." Also asked to confirm the terrain-coupled wind/current work reaches map rendering. Engine
only. Full derivation/measurements: `docs/research/solar-energy-budget.md`.

- **Part 1 (measurement, no code): confirmed.** `simulateWeather()` calls `oceanSSTAnomaly()` (which
  calls `computeOceanCurrent()`) *before* building its own wind field, folding the SST anomaly into
  the sea temperature that drives `buildWind`'s pressure gradient — `system-coupling-audit.md`'s
  documented "Loop 2," shipped since v0.067, reinforced (not newly built) by v1.77–v1.82.
- **Part 2, the real gap**: the base equator-pole gradient (`tSea=poleTemp+(equatorTemp-poleTemp)
  ·shape(lat)`, duplicated at six JS sites + the GPU shader's `uEqT`/`uPoT`) was completely
  disconnected from `state.planet`'s gravity/tilt/rotation sliders, even though those sliders already
  drive `circulationCells()`, `buildWind`'s Coriolis term, and the g-scaled lapse rate elsewhere.
- **Axial tilt → `insolationContrastK()`**: 2nd-order (P₂) energy-balance-model obliquity term (North
  & Coakley 1979). Contrast coefficient `s2(ε)=3sin²ε−2`, zero at the real critical obliquity
  `ε=arccos(1/√3)≈54.7356°` (Rose, Cronin & Bitz 2017 — the documented annual-mean insolation
  reversal point), normalized to 1.0 at this file's 23.4° default. The UI's 45° tilt cap stays short
  of the reversal — a real, monotonic, correctly-signed effect across the whole slider range.
- **Rotation → `rotationContrastK()`**: slower rotation → weaker Coriolis constraint → more efficient
  poleward heat transport → flatter gradient (qualitative GCM result). Reuses the SAME
  Ω=24/rotationHours already in `circulationCells()`, raised to a small disclosed exponent (0.25).
- **Gravity deliberately gets no new term** — its established roles (lapse rate ~g, circulation-cell
  count) are already implemented; no equally simple, citable closed form exists for a further direct
  gravity→ocean-heating link without inventing an atmosphere model. Disclosed scope cut.
- **One function, seven call sites**: `climEffectiveEquatorTemp()` centralizes both multipliers; every
  duplicate `tSea` formula (CPU + GPU shader) now reads it instead of raw `equatorTemp` — one source
  of truth, not another instance of this file's own recurring duplication drift.
- **Bit-identical at Earth defaults by construction** (both multipliers = 1.0 exactly there) —
  confirmed via `hash_gen1.js` v1.84→v1.85 ALL IDENTICAL. Measured live (real `generate()`+
  `refreshClimate()`): max tilt (45°) drops mean tempField 14.9°C→−16.2°C; zero tilt raises it to
  29.2°C; slow rotation (96h) cools to 1.4°C, fast (6h) warms to 34.1°C — all in the predicted
  direction, confirming the wiring is live end-to-end, not just correct in isolation.
- **Tests**: 1017/1017 (`run.sh`, bit-identical at defaults), 852/852 (`run_um.sh`, block 4
  untouched), 6 new smoke assertions (`R.v185`).
- **Known scope cuts**: no stellar-type slider (Sun-like assumed); no absolute W/m² energy quantity —
  the grounding is specifically the equator-pole insolation *contrast*, the one quantity this file's
  temperature model actually uses; not bit-identical away from Earth defaults (deliberate, disclosed).

### Journey Planner: water only counts as carried weight in arid biomes (v1.84)

Owner: "water should only become an actual weight in arid biomes/climates... for other journeys it
should technically not be counted. Water is usually abundant and always collectable in meaningful
quantities." Civ-layer only (`jpCapacity`/`jpCalcLand`/`jpAutoPickTransport`/`_jpPlan`). Hash vs v1.83
ALL IDENTICAL (JP is interactive-only).

- **Root cause**: `humanWaterCarryDays` was `desertLike?min(supplyDays,4):min(supplyDays,2)` at three
  duplicate call sites — a non-desert biome still silently carried 2 days of water as mass. Animals
  already had this right (`0` for non-desert) — humans never matched.
- **New shared helper `jpHumanWaterCarryDays(biome,supplyDays)`** (`desertLike?min(supplyDays,4):0`)
  redirects `jpCapacity` and both `jpAutoPickTransport` branches — one function, not three drifting
  copies.
- **`jpCalcLand`'s convergence-loop `waterNeeded` term is now `isDesert?(...):0`**, and this
  **reverts v1.56's "auto water-crossing tier applies to any biome" widening** back to desert-only, a
  deliberate revision of a prior version's own design decision per this direct new instruction.
- **Consistency sweep**: `jpAssessResupply`'s `dryKm`/`waterGapDays` args gated to `0`/`Infinity` for
  non-desert (so an overload can never be mislabeled `cause:'water'`); hard-block wording forks on
  `isDesert`; the formula trace reads "assumed abundant in this biome — not counted as carried
  weight" for non-desert; the Info panel's "Water" finding filters to desert stages; and `_jpPlan`'s
  `waterL` route-summary total — which reads `cap.humanWaterRate` **directly**, bypassing the gated
  `cap.breakdown.humanWater` — gets its own explicit `isDesert` check, the one site that would have
  silently kept reporting non-zero water for a non-desert stage otherwise.
- **`jpCalcWater` (sea/river vessels) deliberately untouched** — a ship can't detour to a stream
  mid-passage the way a land party can; genuinely different physical reality.
- **Tests**: `R.v156` rewritten to assert the reverted (desert-only) behavior instead of the widened
  one; 8 new smoke assertions (`R.v184`).
- **Known scope cuts**: no new UI control (a modeling-assumption revision, not a toggle); `desertLike`
  remains the sole aridity signal.

### A Mounted Rider party's own mounts now carry saddlebag capacity (v1.83)

Owner pasted a real route with several `⛔ Carrying enough water...` blocks (up to 3659% over)
and one `⛔ Overloaded 167%...` block: "Can you see what needs fixing?" Civ-layer only
(`jpCapacity`). Hash vs v1.82 ALL IDENTICAL (JP is interactive-only).

- **Diagnosed**: reported capacity was exactly `people*JP_HUMAN_PORTER` — a "Mounted Rider" party
  got zero extra capacity from being mounted, identical to Walking, unless the SAME mounts were
  ALSO manually re-declared as pack animals (the "Lone courier" preset's own undocumented
  convention).
- **`jpCapacity` gains `mountCredit`**: `max(0, people − plan.animals[mount]) × JP_ANIMALS[mount]
  .cap × JP_MOUNT_SADDLEBAG_FRAC(0.3)` — the `max(0, ...)` term prevents double-counting a mount
  already declared as a full pack animal.
- **Verified all four shapes**: reported case 300kg→660kg; Walking party unaffected; Lone courier
  preset unchanged (zero extra credit); partial declaration blends both credit types correctly.
- **Does not rescue a genuine extreme overload** — a 400km waterless-desert crossing for the same
  party still correctly blocks, verified directly against the new capacity baseline.
- **Tests**: 6 new smoke assertions. One test-writing mistake caught before shipping: the first
  assertion passed plan fields directly on `_jpEnsurePlan`'s argument instead of nesting them
  under `.plan` per the file's own call convention — silently defaulted transport back to
  Walking, caught by inspecting the returned plan directly.
- **Known scope cuts**: `JP_MOUNT_SADDLEBAG_FRAC` is a reasoned, not independently sourced,
  estimate; no UI change (flows through existing capacity/block messages); Baggage Train's own
  pack-animal accounting is untouched.

### Ocean current direction becomes heat-driven, not just wind-derived (v1.82)

Owner: "check how heat in an ocean originates and how flow direction is dictated by it. At the
moment it just seems to base itself from right to left. (And slow down the arrows... by about
65%)." Engine only (`computeOceanCurrent`, `_windFxStep`). Not bit-identical at defaults
(`currents:true` by default feeds `field`/`temp`/`rain`/`flow` via `carveRiverValleys`) —
deliberate, measured re-baseline; isolated: with `currents=false` on both sides, hash is ALL
IDENTICAL.

- **Measured first**: the meridional current component was set solely by Ekman-rotating the
  latitude-band wind, with zero basin-position dependence — ~94% of the equatorial trade band
  showed net-poleward flow, cold anomaly nearly absent (min -0.06), contradicting the file's own
  docstring (western boundary = warm poleward, eastern = cold equatorward).
- **`computeOceanCurrent` gained a western/eastern-boundary bend**, reusing the exact west/east
  coastal-distance weights the existing speed boost already computes — poleward on a basin's
  western edge (Sverdrup pile-up → Gulf Stream-style current), equatorward (weaker, 0.45×, more
  coast-hugging) on its eastern edge (Ekman upwelling → Peru/Benguela-style current). `poleSign`
  sampled per-row against `latOf`, not assumed. Zonal (`u`) component untouched by construction.
- **A single-pixel min/max test was tried and rejected** — the bend can locally cancel an
  already-extreme baseline value at one outlier cell (measured: coldest pixel went LESS extreme).
  Robust aggregates tell the real story: mean-absolute SST anomaly 0.204→0.511 (2.5×), cold-anomaly
  cell fraction 4.5%→19.2% (4×) — test the aggregate, not the outlier.
- **windFx speed**: `_windFxStep`'s advection multiplier `0.9→0.315` (35% of original, a literal
  reading of "slow down by 65%"). Verified against the real shipped function via rAF interception,
  not a reimplementation.
- **Tests**: 12 new smoke assertions. One test-isolation bug found and fixed during verification
  (the new windFx test left `state.debug`/the particle loop live, breaking a later pre-existing
  v1.78 assertion) — restored ambient state, the same discipline this file's CHANGELOG has hit
  before.
- **Known scope cuts**: `bendK`/eastern-weakening factor are reasoned, not independently
  calibrated; still a heuristic distance-to-coast proxy for western intensification, not a solved
  Sverdrup model; thermohaline circulation stays out of scope.

### Wildlife-informed foraging: a real water-range lever, not just food (v1.81)

Owner: "any journey is only factually limited by the longest distance one is able to travers with
the resources they can carry... we already have fauna information and therefore a good idea about
how foraging could extend a route/travel distance (if you can hunt a deer you clearly get more
calories than when you're in a desert and have to hunt snakes and hope your portable dew trap gets
you enough water)." Civ-layer only (`JP_BIOMES`, `jpForaging`, `_jpDeriveStages`, `jpCalcLand`).
Hash vs v1.80 ALL IDENTICAL — the Journey Planner is interactive-only, never reached from
`generate()`.

- **Measured before designing, and the first hypothesis was only half right.** A broad sample
  across real routes/presets found block rates dominated by terrain-legality and a Foot-traveller
  preset bug, water rare (`probe_jp_impossible.js`/`probe_jp_impossible2.js`). A TARGETED synthetic
  sweep (`probe_jp_drygap.js`, a well-provisioned camel caravan) found the real cliff: past
  ~150-200 km of waterless desert, `jpAssessResupply` blocks with zero elasticity — 269%-506% over
  capacity, binary, no lever to pull even for a rich biome.
- **`jpForaging()` already discounted carried FOOD and had for versions; nothing analogous touched
  WATER, and the food term only read a flat per-biome constant, not the real per-region wildlife
  data `currentWildlife()` already computes.** Two design forks put to the owner via
  `AskUserQuestion` before building: extend the existing Foraging dropdown (chosen, not a new
  control) and wire in real `currentWildlife()` data (chosen, not the static table alone).
- **`JP_BIOMES.waterForage`** (new column, much smaller than `forage`, steeply biome-dependent):
  true desert near-zero (Hot Desert 0.01), wetlands/jungle richest (0.22/0.20).
- **`_jpWildlifeForageMod(mx,my)`** samples `currentWildlife()`'s per-cell region richness and
  compares it to the WORLD's own mean — never an absolute cutoff, this file's own repeatedly
  re-learned discipline (v1.25/v1.30/v1.31/v1.34/v1.37/v1.46/v1.55/v1.58). No-ops to `1.0` when
  data/position is unavailable; clamped `[0.5,1.8]`.
- **`jpForaging` gained optional trailing `mx,my`** (v1.20's optional-trailing-arg precedent) and
  returns a new `waterReduction`. Food is scaled by real wildlife richness when a coordinate is
  supplied; water uses `waterForage` directly, deliberately NOT wildlife-modulated (fauna is a food
  proxy, not a water proxy — water access is already covered by real hydrology via
  `_jpStageDryKm`; this only covers the small biome-climate residual beyond that). `_jpDeriveStages`
  now records each stage's own midpoint coordinate so foraging can sample it.
  `plan.foraging="None"` is an exact no-op, asserted bit-identical to pre-v1.81.
- **A real, disclosed finding, not fixed this pass: Active foraging's SPEED cost can outweigh its
  consumption benefit on a single already-marginal carry stretch.** Measured directly, then
  re-measured identically against unmodified v1.80 to confirm this pre-dates this version, not
  introduced by it — this version's water term measurably improves the outcome without resolving
  the deeper tension. Retuning `JP_FORAGING` speed multipliers is a materially larger change than
  what was asked; disclosed rather than silently left for rediscovery.
- **Tests**: 8 new smoke assertions (`R.v181`). Two pre-existing, environmental smoke-suite
  failures (`v0.92`/`v0.87` canvas-sizing assertions) observed during verification — confirmed
  unrelated by reproducing them identically against unmodified v1.80.
- **Known scope cuts**: the Active-foraging speed/consumption tension above; `waterForage` values
  are reasoned estimates, not independently historically sourced; wildlife richness scales only the
  food term, never water.

### Wind/current streak animation never actually rendered (v1.80)

Owner: "No animation in the flow layers." Confirmed via real-screenshot frame-diffing before
touching code: `_windFxStart()` set `windFxCanvas.style.display=''` to reveal the canvas, but the
CSS rule `#windFxCanvas{...;display:none}` already sets that — clearing an INLINE style to `''`
falls back to the stylesheet, it doesn't override it, so the canvas box stayed 0×0 while the
particle loop ran perfectly underneath (spawned/advected particles, zero errors) into an invisible
element. Fix: explicit `display='block'`, the idiom every other CSS-default-hidden element here
already uses (v0.67's `view3d.style.display='block'`). The v1.78 smoke assertion for this exact
path checked `cv.style.display !== 'none'` — the inline value, `''`, which is `!== 'none'` and so
passed despite the real bug; rewritten to `getComputedStyle(cv).display`, the only thing that
reflects actual visibility. Hash vs v1.79 ALL IDENTICAL (interactive-only).

### Addon villages cluster with nearby siblings, not just the closest big settlement (v1.79)

Owner, mid-session: *"the roads from the deeper settlement layers dont connect to their nearest
siblings and individually connect to the closest big settlement. They probably just connected to
the closest main road by the most efficient route."* Civ-layer only (`_civConnectVillageAddons`).
Hash vs v1.78 ALL IDENTICAL (interactive-only, never reached from `generate()`).

- **Measured before fixing** (`probe_villageconn.js`, seed 31337/512px): v1.71-v1.78's target set
  was `places.filter(p=>!p.villageAddon)` — a village's search could ONLY terminate at a real
  settlement, never another village. Mean connector 21.8 km vs. mean nearest-sibling distance
  14.0 km; 79.5% of villages had a nearer sibling than the settlement they actually connected to.
- **Three designs put to the owner via `AskUserQuestion`**: single-shot Dijkstra with villages as
  extra valid targets (simplest, no connectivity guarantee); tap into the nearest existing road
  point (shortest, but reintroduces the v1.71 self-loop shape and doesn't address siblings at all);
  a genuine growing forest (Prim-style). **Growing forest chosen** — the only one that lets a
  village prefer a close sibling while still guaranteeing every reachable village traces back to a
  real settlement through the tree.
- **Batched Prim, not literal Prim.** True Prim's (one full-grid Dijkstra rerun per village, up to
  200) is exactly the "full extra order of magnitude" v1.71's own comment already measured as too
  slow (removing 200 villages from the trunk network's per-place Dijkstra treatment took Generate
  Roads from 3919ms to 397ms). Instead each round runs ONE shared multi-source Dijkstra from the
  current network (settlements ∪ already-joined villages), ranks unconnected villages by distance
  to it, and attaches the cheapest `BATCH=max(4,⌈villages/25⌉)` before regrowing — round count stays
  roughly constant (~25) regardless of village count, at the cost of two villages in the SAME batch
  not considering each other as targets until the next round.
- **A village-to-village edge is still a PLACE-to-PLACE edge with two distinct indices** — doesn't
  reintroduce the v1.71 self-loop bug. Reachability is unchanged by construction: grid connectivity
  doesn't depend on which cells are sources, so a village unreachable in round 1 stays unreachable
  in every later round, and the existing "leave it isolated" behaviour is preserved exactly.
- **The v1.64 existing-infrastructure discount now also covers a village's own freshly-drawn track
  within the same pass** — a sibling processed in a later round can fork off an earlier round's
  track instead of cutting its own parallel line. A `discounted` cell set guarantees the ×0.25
  multiplier applies exactly once per cell across rounds.
- **Re-measured**: mean connector 21.8→14.5 km (now near the nearest-sibling floor);
  nearest-sibling-closer share 79.5%→36.5%; sibling-under-half-distance 33.5%→2.5%. A separate chain
  probe (3 seeds) confirmed every reachable village still traces back to a real settlement — zero
  clusters networked only among themselves — with isolated-village counts matching v1.78 exactly.
  Build-time overhead +11-14% on `_civIterativeAutoWorld` at 200 villages.
- **Tests**: 5 new smoke assertions (`R.v179`).
- **Known scope cuts**: `BATCH`'s formula bounds round count, not independently tuned against a
  "correct" cluster size; `_civAutoRoutes` alone still regenerates connectors from scratch each run,
  unchanged from v1.71-v1.78.

### Terrain coupling made unconditional + Layer-view fix + animated streaks (v1.78)

Owner, immediately after v1.77 shipped: *"Wind and current should always be coupled to terrain
therefore the toggle is unneeded. Has the Layer view been updated accordingly? And can we also
have the animation as in the PoC"* — three asks. Engine only (script block 1). **Not**
bit-identical at defaults — a deliberate, measured re-baseline (same class as v1.36/v1.39/v1.46/
v1.60's placement/relief fixes). 1017 / 852 green; 618 smoke green; hash diverges on
`field`/`temp`/`rain`/`flow`/`rgba` in every scenario, disclosed below as intended.

- **The toggle is gone, not defaulted true.** `state.climate.terrainWind` is deleted from the
  state literal; the sidebar checkbox, its `syncUI()` line, and its change-listener are all
  removed. `buildWind`'s guard changed from `if(c.terrainWind && opts && opts.elev)` to
  `if(opts && opts.elev)`; `oceanSSTAnomaly` lost its `terrainOn` branch outright — both now run
  unconditionally wherever a caller supplies elevation, which every real call site always does.
  `loadZip`'s v1.77 compat guard became `delete state.climate.terrainWind;`, cleaning the stale
  field from a reopened v1.77 save instead of reintroducing it.
- **The Layer-view question had a real answer: no.** v1.77's own CHANGELOG entry disclosed
  `currentWindField()`/`currentOceanField()` (the Wind/Ocean debug overlays) as unwired — they
  still showed the pre-v1.77 view even with the flag on. Fixed: `currentWindField()` now threads
  a coarse elevation array into `buildWind` like every other real call site.
  `currentOceanField()` goes further — it used to derive its "current" by zeroing the WIND vector
  outside ocean cells (the exact shortcut v1.77 fixed for `oceanSSTAnomaly` but left standing
  here); it now calls the real `computeOceanCurrent()` and returns the genuine Ekman-rotated 2D
  field. Asserted: the Ocean Layer view's vectors are measurably distinct from a masked copy of
  the wind field on a live world.
- **Animated streaks, ported from the PoC's own feature.** New `#windFxCanvas`, stacked in
  `.canvas-stack` so it inherits the shared pan/zoom transform off-LOD and gets its own
  reprojection (`_windFxProject`/`_windFxBounds`, the same `px()/py()` idiom
  `drawLODDebugOverlays` already uses) under Tiled LOD, where that transform is identity.
  Particles (260 wind / 200 ocean) sample the SAME `currentWindField()`/`currentOceanField()` the
  fixed Layer view now correctly renders, advect each frame, and redraw via `destination-out`
  compositing for a fading trail (the PoC's own technique). `_windFxSync()` — called from the
  debug-view segmented-button handler and once on initial load — starts the loop when
  `state.debug` is `'wind'`/`'ocean'` and stops it otherwise; the running rAF loop re-checks
  `state.debug` every tick and self-terminates, so unlike the sculpt joystick's `_sculptNavSync`
  (many external call sites) this needed only the one reliable trigger.
- **Bug found and fixed before shipping: Wind→Ocean mid-animation crashed.** `_windFxStart()`'s
  original guard (`if(_windFxRunning || !windFxCtx) return;`) skipped reinitialization whenever
  anything was already running, so switching the debug view while animating kept sampling the
  STALE field object — an ocean sampler reading a wind-shaped field with no `.ocean`, a hard
  crash. Root-caused via a Playwright `pageerror` handler capturing the full stack (a plain
  page-load probe found nothing — the crash needs a specific interaction, not just a load).
  Fixed with `_windFxKind` tracking: `_windFxStart()` only no-ops on a same-kind restart, and
  `_windFxStep()` itself detects a mid-loop kind change, reinitializes, and explicitly
  reschedules.
- **A real, disclosed consequence: `field` itself now differs from v1.77, not just
  `temp`/`rain`/`flow`.** `generate()`'s default pipeline runs `carveRiverValleys()` (gated on
  `state.carveRivers`, true by default) against traced river polylines, downstream of `flowField`,
  downstream of `rainField` — which the now-always-on coupling measurably changes (v1.77 itself
  measured mean rain/temp deltas of 0.040/0.268 with the flag on). The carved heightmap
  legitimately differs too. Confirmed via `hash_gen1.js`: `field` mismatches in every scenario,
  not a subset — the correct closed-loop consequence of "always coupled," not a regression, same
  class as v1.36/v1.39/v1.46/v1.60's own deliberate re-baselines.
- **Three test fixes, none touching app behavior** — all pre-existing tests whose assumptions the
  now-always-on coupling broke: the cold-current assertion's fixed `-0.1°C` propagated-anomaly
  threshold was too strict once real seed-to-seed variance was actually exercised (a real,
  physical Sverdrup/Stommel asymmetry, not a bug) — redesigned to check the raw
  `oceanSSTAnomaly()` field directly (`-0.003°C`) plus a magnitude-free land-level sign check; the
  zonal-rain-belt-ratio assertion ran on an ambient random seed the coupling could occasionally
  push below its 1.2× threshold — pinned to reference seed 12345 (ratio 2.68, robust); and a
  v1.60-era isolated fuel-limited-settlement test saved/restored `mapWidthKm`/`seed`/`resW`/
  `places` but not `state.world_structure.enabled` — left `true` by an earlier unrelated smoke
  block, driving `seaLevel` to 0.482 instead of 0.42 and reshaping the pinned seed's geology
  enough to move every iron settlement off fuel-limited. Root-caused by instrumenting the real
  smoke run (a fresh reproduction passed and gave no clue). Added to the save/restore.
- **UI**: the "Terrain-coupled wind & currents" checkbox is removed; "Ocean currents"' hint text
  now describes unconditional coupling.
- **Tests**: `tests/stub_head.js` gained `windFxCanvas` to its headless canvas allowlist. `R.v177`
  replaced by `R.v178` (removal/Layer-view checks) + new `R.v178fx` (canvas lifecycle via real
  `#debugSeg` clicks) — 8 + 4 new smoke assertions.
- **Known scope cuts**: the PoC's fuller moisture/cloud/snowpack/seasonal-ITCZ system remains
  deferred exactly as v1.77 scoped it. Streak particle counts (260/200) and advection step (0.9)
  are carried over from the PoC's own values, not independently retuned.

### Terrain-coupled wind & ocean currents, ported from the owner's PoC (v1.77)

Owner: *"let's do the climate engine port."* The go-ahead for work scoped in a prior session (via
`AskUserQuestion`) against an owner-supplied standalone PoC (`terrain_coupled_flow_poc_2.html`, not
in this repo) demonstrating a terrain-deflection wind solver plus Ekman-rotated ocean currents on a
flat, non-wrapping grid. Scoped to the **middle option**: wind/current terrain-coupling and
gyre/western-intensification behaviour, explicitly deferring the PoC's fuller moisture/cloud/
snowpack/seasonal-ITCZ system. Two binding owner constraints carried over from the scoping session:
the world's X-wrap (`state.world`) must stay correct, and the new mechanic must genuinely feed
rain/climate, not sit decoratively beside it ("this addition should inform the current
simulation"). Opt-in (`state.climate.terrainWind`, default `false`) — bit-identical at defaults.
1016 / 852 green; hash ALL IDENTICAL at defaults; +6 smoke assertions.

- **Root cause, confirmed by reading the existing pipeline before porting anything.** `buildWind`
  had no direct terrain-blocking mechanism at all — wind blew straight through mountains, reacting
  only to temperature (itself only indirectly elevation-aware via lapse rate). `oceanSSTAnomaly`
  derived its sign/magnitude by reading `buildWind`'s own meridional component `wy` directly, as if
  it were an ocean current — no Ekman rotation, no distinct 2D current field, no gyre structure.
  Both gaps are exactly what the PoC's own method notes describe as missing from a naive
  wind-only model — the port target was real, not assumed.
- **Two new pure primitives**, both placed just before `circulationCells()`/`buildWind`:
  - **`deflectFlow(u0,v0,block0,WW,WH,wrapX,opts)`** — generic terrain deflection. Damps the
    "into-block" component of flow and redirects it tangentially along the local block-field
    contour, iterated with blending (0.7/0.3, matching the PoC); gap/strait acceleration comes from
    the block field's own Laplacian (a pinch between two blocked cells speeds flow up, the real
    venturi-like effect a strait produces). Reuses the file's existing wrap-aware `blurCoarse`
    (which mutates its input in place) for both block-field presmoothing and per-iteration flow
    blending, rather than re-implementing smoothing — inherits its wrap correctness for free.
  - **`computeOceanCurrent(wx,wy,elevC,WW,WH,wrapX,sea,latOf,opts)`** — Ekman-rotated current (25°
    rotation, hemisphere-sign-dependent) run through the SAME `deflectFlow` against a hard
    coastline, plus continental-shelf friction and a western-intensification heuristic. **The PoC's
    own western-intensification scan is not wrap-aware** — its demo domain never wraps, so it just
    walks west/east from each cell. Rewritten here using a two-pass priming technique for `westDist`
    plus modulo-indexed `eastDist` scanning, so a World-mode current field has no seam.
- **Wired into the pipeline that actually produces rain, not bolted on beside it.** `buildWind`
  gained an optional `opts` parameter: its early-return guard became a non-early-return so a new,
  separate `terrainWind` block can still run even when the pressure-gradient term is off. When
  `state.climate.terrainWind` is true and `opts.elev` is supplied, it builds a land/mountain block
  field from real elevation, runs `deflectFlow` against it, then blends the deflected wind back in
  damped by height (gentle slopes barely redirect wind; real peaks redirect it fully).
  `oceanSSTAnomaly` and `simulateWeather` — the latter is the ACTUAL rain-producing pass
  (semi-Lagrangian moisture advection along wind, orographic lift from real height gradients
  upwind) — both now thread real elevation through to `buildWind`/`computeOceanCurrent` instead of
  the old `wy`-as-current-proxy shortcut, so a real `refreshClimate()` pass with the toggle on
  measurably changes `rainField`/`tempField`, not just a debug-view field.
- **Measured before shipping, not assumed correct because it compiled.** Near-ridge deflection
  measured 3.7x the far-field effect on the same synthetic ridge (proves the mechanism is
  LOCALIZED to terrain, not a global reweighting — the same v1.30 "a term that isn't ~zero almost
  everywhere is reweighting the whole map" check, applied here to a flow field instead of a
  suitability score). World-mode wrap-seam diff measured exactly zero, with the test ridge kept off
  the seam — the first version of this test placed the ridge AT the seam, where legitimate
  flow-splitting at a ridge peak produced a nonzero diff that could have been misread as a wrap bug;
  moving the ridge into the domain interior isolates the real question. A real `refreshClimate()`
  pass measured mean `rainField`/`tempField` deltas of 0.040/0.268 between the toggle off and on —
  proof the "must feed the simulation" constraint holds, not merely that the code path executes.
- **A test-harness mistake, caught and disclosed rather than shipped as a false alarm.** An early
  probe pre-filled `wx`/`wy` with a synthetic uniform wind before calling `buildWind`, expecting the
  function to preserve/build on it. `buildWind` always computes its own latitude-band base wind from
  scratch and OVERWRITES whatever was pre-filled — so the apparent "wind reversal" the probe first
  measured was just the physically-correct trade-wind direction at that latitude (band 0 near the
  equator carries `zx=-1`), not a defect in `deflectFlow`. Confirmed by testing `deflectFlow` in
  total isolation (correct, small, localized deflection in both wrap and non-wrap modes) and by
  diffing `buildWind`'s own off-vs-on output directly — the correct isolation technique when a
  function is known to overwrite its own inputs.
- **UI**: new "Terrain-coupled wind & currents" checkbox beside the existing "Ocean currents"
  toggle, wired through `syncUI()` and a change listener mirroring the `currents` checkbox's own
  `withBusy('updating climate…', …)` pattern. `loadZip` gained the matching compat-guard default.
- **Known scope cuts, disclosed**: the PoC's fuller moisture/cloud/snowpack/seasonal-ITCZ-migration
  system remains deferred, per the original scoping decision — this port is wind/current
  terrain-coupling and gyre/western-intensification only. `currentWindField()`/`currentOceanField()`
  (the existing debug-view functions) are deliberately left unwired to the new mechanism — they
  still show the pre-existing fields, not the terrain-coupled ones. Far-field diffusion behaviour is
  inherited unmodified from the PoC's own design. Western intensification is the PoC's own
  heuristic scan, not a solved geostrophic model.

### Village connectors: an unnecessary `.reverse()`, not a terrain problem (v1.76)

Owner: *"let's check how ways are done for the recently added Villages (suitability-weighted,
road-biased) option. At the moment it seems like a loopy bundle of spaghetti which is not how
roads historically formed."* Root-caused by generating a real world (seed 31337/512px) with
Villages on and measuring the drawn geometry, cost, and terrain of the worst offenders before
writing any fix. Civ-layer only (`_civConnectVillageAddons`). Hash vs v1.75 ALL IDENTICAL.

- **The terrain-avoidance hypothesis was wrong, and disproving it found the real bug.** Median
  connector circuity (path km ÷ straight-line km) measured 2.62x, worst 3.35x, 54/199 self-
  intersecting. Disabling `_CIV_EXISTING_WAY_DISCOUNT` only dropped the median to 2.21x — partial,
  not the explanation. The clincher: the worst connector's own path cost, recomputed from the exact
  cost grid Dijkstra used, was **2.8x more expensive than the straight line** despite the straight
  line crossing near-flat terrain (height 0.58→0.63, no water, no cliff). A "shortest path" costing
  3x a straight line on flat ground isn't a shortest path — it's a bug.
- **Root cause: the Dijkstra `prev[]` walk already builds `raw` in VILLAGE→…→SOURCE order** (`cur`
  starts at the village's cell, pushed first; the loop follows `prev[]` toward decreasing distance,
  so the settlement is pushed last) — exactly the `aIdx`(village)→`bIdx`(settlement) order every
  consumer already assumes. The shipped code called an unnecessary `raw.reverse()` right after,
  flipping to SOURCE-first/VILLAGE-last, then overwrote the endpoints as if it hadn't — `raw[0]`
  (now the source end) forced to the village pin, `raw[raw.length-1]` (now the village end) to the
  settlement pin. That corrupts the whole path, not just its labels: it leaves the village, jumps
  near the settlement (the true second cell of the reversed, source-side walk), retraces the entire
  real route backward almost to the village, then jumps to the settlement again. That's the loop,
  and why it self-intersects.
- **`aIdx`/`bIdx` were never wrong** — `cur` already held the correct source cell going into
  `settleAt.get(cur)`, independent of array order. Only the drawn geometry was corrupted, which is
  why v1.71's own `villageEndsMatchPin`/`settlementEndsMatchPin` smoke checks never caught it: every
  connector still reported real, valid, correctly-paired endpoints.
- **Fix: delete `raw.reverse()`, leave the two endpoint overwrites exactly as written** (`raw[0]` ←
  village pin, `raw[raw.length-1]` ← settlement pin — correct once the walk isn't reordered).
  Re-measured: median circuity 1.12x, max 1.86x, zero self-intersecting connectors.
- **First cut shipped the wrong half of this fix**: swapping which coordinate each overwrite
  targets (instead of removing the reverse) produces identical path geometry but writes it in
  SOURCE-first/VILLAGE-last order, silently breaking v1.71's own `pts[0]`-is-the-village convention
  that `villageEndsMatchPin`/`settlementEndsMatchPin` assert. Caught by the full smoke run (605/606
  passed) before shipping — "the geometry is correct" and "the codebase's own point-ordering
  convention is preserved" are different claims, and only re-running the suite catches a violation
  of the second.
- **Tests**: 3 new smoke assertions (`R.v176`) — connectors exist and were checked; max circuity
  under a generous 2.2x bound; zero self-intersections.
- **Known scope cuts**: none — the reported symptom had one fully-explained root cause. The
  "roads should share a trunk near the destination" aesthetic question was investigated as a
  secondary hypothesis but not pursued: with circuity near-direct and zero loops, the fan-in
  pattern (mean 5.85, max 16 per settlement) reads as an ordinary spoke pattern, not spaghetti.

### `_civAutoRoutes` stamped way indices from two different arrays (v1.75)

Bug-hunt pass per the active goal, closing a HANDOFF-flagged latent defect from the v1.72 pass:
*"`_civAutoRoutes` builds way `aIdx`/`bIdx` against its filtered `settles` array while
`_civIterativeAutoWorld`/`_civConnectVillageAddons` use full-`state.places` indices... Picking one
canonical index base is a wider refactor than a fix pass should take on speculatively."* Civ-layer
only. Hash vs v1.74 ALL IDENTICAL — pure index bookkeeping.

- **`_civHierarchicalNetwork` stamps `aIdx`/`bIdx` as positions in whatever `places` array it's
  called with.** `_civAutoRoutes` ("Generate Roads") calls it with `settles` (`state.places`
  filtered to exclude POIs and `villageAddon` places, per v1.72 BUG-B) for the trunk MST, then calls
  `_civConnectVillageAddons(state.places, …)` — correctly, since a village's own index only exists
  there — for the connector ways. Both sets land in the same `civWays` list carrying indices from
  two different bases.
- **Confirmed latent, not live, before fixing.** `_civNetworkMetrics`, the sole `aIdx`/`bIdx`
  reader, is only ever called from inside `_civIterativeAutoWorld` with its own internally-
  consistent `places`/`ways` pair — never on `_civAutoRoutes`'s output. But a `settles`-local index
  is frequently *also* a valid, *different* `state.places` index, so a future or naive
  `state.places[w.aIdx]` reader gets a wrong-but-plausible place, not a crash — the same failure
  shape v1.35/v1.72 already document surviving several versions unnoticed.
- **Fix**: a four-line remap in `_civAutoRoutes`, right after `landWays` is built —
  `settles.map(p=>state.places.indexOf(p))` (element identity is shared between the two arrays) —
  applied to every land way's `aIdx`/`bIdx` before `_civPreferSeaRoutes` runs.
  `_civConnectVillageAddons`'s own ways are untouched; they were already correct.
- **Tests**: 2 new smoke assertions (`R.v175`), the second forcing the two index bases to collide —
  a POI inserted ahead of the settlements in `state.places` — and confirming every land way's
  `aIdx`/`bIdx` resolves to a real, non-addon settlement, not the inserted POI.
- **Known scope cuts**: none — this is exactly the HANDOFF-described fix, no wider index-base
  unification attempted.

### A colorized LOD tile is a static image; one composite per frame (v1.74)

Owner: "repeated quick zoom in-out actions cause a browser to freeze and become unresponsive."
Measured before fixing (real wheel events, populated 1024px world): worst rAF frame **13.2 s**, 35
frames over 500 ms, `renderBiomeTileRGBA` 491 calls / 243 s. Two scheduling defects; nothing about
WHAT is drawn changed. **Rule: a tile's pixels are a pure function of its heightmap and
`_lodRenderKey` — the canvas key `z/col/row/tileSize/baked|rk` carries NO zoom or pan term, so the
same tile at zoom 4 and zoom 8 is byte-identical. Any re-colorization is eviction, never
invalidation.**

**Result: worst frame 13.2 s → 1.4 s (9.6×); repeat-gesture colorizations 263 → 72, canvas misses
200 → 15.** A single 1024×655 colorization still costs ~618 ms on this headless box (the floor for
any frame that colorizes at all — the budget can't preempt mid-tile).

- **The derived-pixel cache must not be smaller than the source-data cache it derives from, AND its
  size must come from measurement, not an estimate.** We kept 48 tile heightmaps (`_lodCacheMax`)
  and only 24 canvases, so zooming back onto a level whose data we still held threw its pixels away:
  **364 misses / 2100 hits, pinned at the cap**, for a working set my own back-of-envelope guessed at
  ~30 tiles. `lodTileCanvasMax()` budgets by **pixels** (`LOD_TILE_CANVAS_MAX_PX`) so the cap tracks
  `_lodTile` — but a first cut at 48 MPx (= `_lodCacheMax` entries at the default tile) STILL
  thrashed, because `probe_distinct.js`'s analytic sweep of the gesture's own zoom trajectory found
  the real working set is **68 distinct tiles**, up to **16 visible at once** (not the 4 a centred
  view shows — right after a level change the viewport straddles a tile boundary in both axes). At
  72 MPx the cache peaks at 68/72 and repeat-gesture misses drop 200→15. The decisive measurement
  either way is the repeat pass: replaying the identical gesture with `_lodRenderKey()` unchanged,
  the correct colorization count is zero.
- **A high-frequency input handler must never composite inline.** Wheel/pinch/pan-drag/joystick/
  sculpt-stroke each called `renderNow()` per event — 350 composites for 128 wheel ticks. `requestLodRender()`
  coalesces to one per animation frame; the drawn frame is pixel-identical, and the yield between
  frames is what turns "unresponsive" into "chuggy but interactive". **Resolve `renderNow` lazily
  INSIDE the rAF callback** — blocks 1 and 2 both wrap and reassign it (v1.24), so capturing it drops
  the civ layer.
- **The single largest surviving stall was not a pointer/wheel handler at all.**
  `_lodScheduleOverviewRebuild`'s own async completion callback (`setTimeout(0)`) carried its own
  inline `renderNow()`, firing 128 times in one gesture. Coalescing every INPUT handler (above) cut
  total colorization work 2.4× but left the worst frame unchanged at 12.2 s until this fifth call
  site was routed through `requestLodRender()` too — that is what actually dropped `drawLODView`'s
  max from 11,162 ms to 1,077 ms. **Grep every `renderNow()` reachable from an LOD-camera-adjacent
  path before declaring a scheduling fix complete** — an async completion callback that fires once
  per landed rebuild during a fast gesture is as much a high-frequency trigger as a `pointermove`.
- **`_lodFrameBudget` (12 ms) is set ONLY around the rAF-driven render**, so `drawLODView`'s
  per-frame colorization cap applies to interactive navigation only; a direct `renderNow()`
  (`generate()`, an export grab, the harnesses, the two `withBusy()` refine buttons) still
  composites the whole view. It always colorizes ≥1 tile so N tiles converge in N frames, and
  requests a follow-up frame when it defers. The debounced settle refine IS budgeted — it hands the
  compositor a full viewport of fresh un-colorized tiles, so unbudgeted it is the same stall merely
  relocated to the moment the user stops scrolling.
- **Ruled out by measurement, don't re-chase**: v0.93's stretch fast path works (streak peaked at 1
  of 4); overview rebuilds were only 127 calls / 21.7 s of 243 s; `pyramidTile` ran **0 times** (not
  tile generation); `sharedSeaFields()` is properly cached.

### Label collision: reserved one box, drew in another (v1.73)

Bug-hunt continuation past the village layer. **`_civTraitDrop()` is the single definition of the
trait-badge clearance under a pin — the label DRAWER and the label-COLLISION pass must both read it.**
v1.28 added the drop to `_civDrawSettlementPin` (so a 'below' label clears the badges) but not to
v1.12's candidate-box reservation in `drawCivLayer`, so such a label painted outside its own reserved
box and through a neighbour's. Only the 'below' candidate moves; the helper returns 0 for a
trait-less place, so everything else reserves exactly what it did before. Measured: one real overlap
at deep zoom on the reference world, gone after the fix. A draw/reserve pair is just another way for
"two functions answering one question" to drift.

Ruled out during the same hunt (don't re-chase): the label WIDTH heuristic
(`name.length*fsz*0.62`) is conservative — measured never under-reserving across 35 labels (worst
ratio 0.935); `jn.stops` is dropped on save but nothing reads it back (documented at its own site);
`_civBakeKey` omits civ state deliberately (separate overlay canvas).

### Bug hunt: three v1.71 connector defects, all one missing tag (v1.72)

Deliberate bug-hunt pass over the v1.68–v1.71 village layer; all three measured on a real world
before fixing. Civ-layer only. Hash vs v1.71 ALL IDENTICAL. **The lesson: `villageAddon` is the ONE
thing separating a deep-zoom decorative connector from an ordinary road — grep for it before
touching any way code.**

- **A serialization whitelist silently drops what it doesn't name.** `_civSyncToState`/
  `_civSyncFromState` list way fields explicitly rather than spreading, so v1.71's `villageAddon`
  vanished on save. 199 connectors → 0 on reload, surviving as plain `'ancient'` at
  `CIV_LOD_ROAD.ancient=0.7` while their villages stayed hidden to `2.4` — **a web of roads to
  invisible settlements in any reopened project.** Places kept the flag (`serializeState` deep-clones
  `state` wholesale); that asymmetry is what made it visible. Both whitelists now carry the field.
- **"Generate Roads" both destroyed and re-created the problem.** `_civAutoRoutes` keeps only
  `w.manual`, so every auto connector was deleted; it then fed the villages themselves to
  `_civHierarchicalNetwork` (because `hamlet` ∈ `CIV_SETTLE_KEYS`), yielding 226 village-touching ways
  at LOD 0/0.35/0.7. Villages are now excluded from the trunk `settles` list, and connectors are
  **regenerated** via `_civConnectVillageAddons` onto the new network (preserving them would keep
  geometry hugging roads that no longer exist). **Side effect: 3919 ms → 397 ms**, since the trunk
  builder no longer runs 2×235 full-grid Dijkstras over places that never belonged in the hierarchy.
- **`_civRenderWayList` is not virtualized** (unlike the v1.16 settlements table) — 199 unnamed auto
  connectors buried the ~53 authored roads (252 cards / 2016 nodes). Connectors now sit in a collapsed
  `<details>`; top-level cards 252 → 54, all still reachable. Node count is unchanged by design — the
  fix is signal-to-noise, not allocation.
- **Latent, deliberately unfixed**: `_civAutoRoutes` builds way `aIdx`/`bIdx` against its filtered
  `settles` array while `_civIterativeAutoWorld`/`_civConnectVillageAddons` use full-`state.places`
  indices. Divergent when a POI exists, but `_civNetworkMetrics` (the only reader) is called solely
  from inside `_civIterativeAutoWorld` with the full array, so nothing currently misreads it. Picking
  one canonical index base is a wider refactor than a fix pass should take on speculatively (v1.62's
  ablate-then-fix precedent).
- Tests: 7 new smoke assertions (`R.v172`), each asserting the observable regression (LOD ordering,
  trunk contamination, list density) rather than the internal flag.

### Addon villages connected by a low-tier "Ancient route" (v1.71)

Owner, immediately after v1.70 shipped: "the new settlements... also need to be connected. By a
lower type road (ancient route for example) so it only shows when zoomed in." Civ-layer only. Hash
vs v1.70 ALL IDENTICAL.

- **`_civConnectVillageAddons`** connects every addon village to its nearest REAL SETTLEMENT with a
  `type:'ancient'`, `villageAddon:true` way, gated on `CIV_VILLAGE_ADDON_LOD` via `_civWayLodMin`
  (factored out of `drawCivLayer`'s inline LOD ternary) — the road reveals together with its
  village, not at the generic ancient-road threshold (0.7) every other way of that type keeps.
- **First cut targeted the nearest existing WAY cell (a T-junction), not a settlement, and measured
  broken**: `_civNetworkMetrics` only recognises settlement-to-settlement edges; a short spur's far
  endpoint fell back to nearest-place-by-coordinate, which usually found the VILLAGE ITSELF — an
  `aIdx===bIdx` self-loop silently dropped. All 200 villages read isolated despite 161 having a
  drawn connector. Routing to the nearest SETTLEMENT instead guarantees valid, distinct `aIdx`/
  `bIdx`, fixing it by construction — the existing-infrastructure cost discount still makes the
  track prefer to run alongside a road en route, it just always terminates at a real town.
- **`roadDijkstra` gained an additive multi-source form**: `sx` may be an array of cell indices,
  seeding all at dist=0 in one pass — connects every village to its nearest settlement in ONE
  full-grid search instead of one per village (`_civHierarchicalNetwork` already tolerates
  one-Dijkstra-per-settlement at this scale; up to 200 villages would have been a full extra order
  of magnitude). Every pre-v1.71 scalar call site is bit-identical (same seed, same loop).
- Measured (seed 31337, 800km/512px, 200 villages): 199 connectors, 1 genuinely unreachable island
  fragment, every connected village correctly non-isolated post-fix (was 200/200 isolated pre-fix).
- Tests: 9 new smoke assertions (3 deterministic unit, 6 live-world).

### Dense grid and roadside villages merged into one suitability-weighted, road-biased pass (v1.70)

Owner, immediately after v1.69 shipped: "mix the dense village function and the roadside village
function into something more nuanced? And only come into view when our zoom is at about 60% zoomed
in." Owner picked **Suitability-weighted road bias** via `AskUserQuestion`. Civ-layer only. Hash vs
v1.69 ALL IDENTICAL.

- **v0.76's `villageMode` is removed from BASE placement entirely** — it used to tighten suppression/
  threshold for the whole `_civIterativeAutoWorld` seed pass, densifying every tier at once, which
  was the actual cause of "waay too populated," not something the v1.68 opt-out fixed. Base capital/
  city/town/village/hamlet placement is now byte-identical regardless of the new toggle.
- **`_civSeedVillages(places, ways, rng, suit)`** replaces both `villageMode` and v1.68/v1.69's
  `_civSeedRoadsideVillages`. Candidates: `findSettlementSeeds(suit, GW, GH,
  {thresh:VILLAGE_SUIT_THRESH, suppR:spacing})` — dense mode's full-map-coverage technique, at the
  same relaxed `VILLAGE_SUIT_THRESH=0.32` floor (renamed from `ROADSIDE_VILLAGE_SUIT_THRESH`). Below
  the floor a cell is never a candidate at all — road proximity cannot bypass it.
- **`_civVillageAcceptProb(roadDist, suitScore, roadFalloff, suitLo, suitHi)`** — new pure, unit-
  tested function — is the soft accept test. `roadProb=exp(-roadDist/roadFalloff)` decays smoothly
  from 1 at a road (found via `_civRoadProximityQuery`, a bucket-grid nearest-point query over
  resampled land-way segments); `suitProb` ramps 0→1 between the floor and `SETTLE_SEED_THRESH=0.42`
  ("great land" — good enough the strict unconstrained pass would seed it unaided). `accept =
  max(roadProb, suitProb)` — either alone qualifies, both stack. `roadFalloff` reuses
  `VILLAGE_SPACING_KM` rather than a new tunable.
- **`CIV_VILLAGE_ADDON_LOD=2.4`** (was v1.68's `CIV_ROADSIDE_VILLAGE_LOD=2.0`, "~50%"), scaled by the
  6/5 ratio the "~60%" ask implies. `p.roadsideVillage` renamed `p.villageAddon` (no longer
  road-only).
- **One checkbox, one flag**: `civVillagesChk`/`_civVillages` replaces `civVillageDensityChk`/
  `_civVillageDensity` and `civRoadsideVillagesChk`/`_civRoadsideVillages`. `_CIV_VILLAGE_CAP=200`
  is the one additive-layer cap (`_CIV_ROADSIDE_VILLAGE_CAP` retired).
- Measured (seed 31337, 800km/512px): baseline 35 settlements → 235 with the toggle on (200 addon
  villages, hit the cap). Direct pure-function comparison, same base/suit/RNG seed: 200 accepted with
  real roads vs. 192 with none; of the 200, 76% sit within the road-proximity search window, the
  rest got in on high suitability alone, off-road.
- Tests: 18 new smoke assertions — 5 deterministic unit tests of the two new pure primitives
  (`R.villagesUnit`) plus 13 live-world/toggle assertions (`R.villages`/`R.villagesToggle`),
  replacing the retired v0.76/v1.68/v1.69 village-mode blocks outright.

### Roadside villages now also factor in settlement suitability (v1.69)

Owner, immediately after v1.68 shipped: "They should still also factor in settlement suitability."
v1.68's seeding pass walked the road network and spaced candidates against existing settlements, but
never consulted `currentSettlementSuitability()`. Civ-layer only. Hash vs v1.68 ALL IDENTICAL.

- `_civSeedRoadsideVillages` now takes the SAME `suit` field `_civIterativeAutoWorld` already
  computed at its own top of function, threaded in rather than re-derived (v1.30's "one field for
  view + placer" discipline).
- At each arc-length step, instead of taking the raw interpolated point, it searches a small local
  window (`round(spacing/3)` cells) for the highest-suitability dry cell that still blue-noise-fits
  the bucket grid — replacing the old "interpolate then `_civSnapLand`" two-step with one pass that's
  both more precise and simpler.
- A window with no cell clearing `ROADSIDE_VILLAGE_SUIT_THRESH=0.32` is skipped outright — the SAME
  relaxed threshold `villageMode` already uses, not a new number, since the candidate's rough
  position is already constrained by the road.
- Measured: 112 villages added (down from 120 — marginal-ground candidates v1.68 would have
  force-placed are now correctly skipped), min score 0.320, mean 0.428 — well above the floor.
- Tests: 2 new smoke assertions extending the existing `R.roadsideVillages` block.

### Roadside villages: a sparser alternative to the dense grid, revealed only at deep zoom (v1.68)

Owner: the existing "Dense village grid" option (v0.76) "sometimes feels waay to populated on the
map" — keep it, but add a sparser alternative for when it's off, villages spaced along the
settlement generator's own routes instead of the suitability grid, visible only once zoomed in
roughly halfway toward a close view (including their ways). Investigated the placement pipeline and
existing zoom conventions before building, then confirmed the persistence-model fork with the owner
via `AskUserQuestion` (real settlements chosen over a decorative overlay). Civ-layer only. Hash vs
v1.67 ALL IDENTICAL — the new toggle defaults off.

- **`_civSeedRoadsideVillages(places, ways, rng)`** walks every land way at `VILLAGE_SPACING_KM`
  (10 km, the same constant dense mode uses) arc-length steps, blue-noise-rejecting each candidate
  against existing settlements and prior candidates via the same bucket-grid technique v1.26's
  scatter engine uses. Runs from `_civIterativeAutoWorld` AFTER routing is fully finished (the v1.39
  rule) and BEFORE the population/food-shed pass, so new villages are real hamlets swept up by the
  same math every other settlement gets — no bespoke formula. Gated on
  `_civRoadsideVillages && !villageMode` — no effect while Dense village grid is checked. Never
  called from `_civAutoRoutes`, which per v1.64 never touches `state.places`.
- **No network-metrics edges of their own** — `_civNetworkMetrics` builds adjacency purely from way
  endpoints, so an interior-of-a-way village naturally scores as an isolated component, which is
  correct for what it is.
- **Zoom-gating reuses the file's own existing convention.** `drawCivLayer` already compares
  `CIV_LOD_PLACE`/`CIV_LOD_ROAD` directly against one raw zoom number
  (`zoom=_lodOn?_lodZoom:viewT.scale`) for either camera, unconverted. `CIV_ROADSIDE_VILLAGE_LOD=2.0`
  is a new threshold in that same family, deeper than every existing tier (hamlet's own 1.4 was the
  previous deepest) — a single tunable constant, since there is no existing 0–100% zoom convention on
  the main map to calibrate a literal "50%" against (disclosed, not invented). Below it a roadside
  village's pin is fully hidden — no small-dot fallback, unlike every other kind. Every
  `CIV_LOD_ROAD` tier is already shallower than this threshold, so "including their ways" needed no
  extra code — a village's own road segment is always already visible by the time it reveals.
- **`_civZoomRaw()`** (factored out of `drawCivLayer`'s existing inline expression, bit-identical)
  gates the map-click pick site (`_civSelectPlaceAt`) too — a hidden roadside village can't be
  clicked on the map, though it's still reachable via the Settlements table at any zoom.
- **Verified on a real generated world**: 120 villages added (hit the cap), all real named/
  populated/factioned hamlets, spacing floor respected both among themselves and against existing
  settlements, 100% on dry land, zero effect with Dense mode on, exact baseline restored when off,
  pick-gate correctly hides/reveals across the threshold.
- **Tests**: 9 new smoke assertions.
- **Known scope cuts**: the reveal threshold isn't independently calibrated against a literal
  percentage; `_civAutoRoutes` alone doesn't re-seed roadside villages; only the primary map-click
  pick site is zoom-gated (the Settlements table is the intended off-zoom access path).

### A water-driven convergence loop could return a physically absurd, unblocked stage (v1.67)

Owner pasted a full Journey Planner "Severe" verdict — an 18-month, 4253 km, 14-stage journey with
several stages at 525%–1475% of carrying capacity, all showing the identical flat 0.450 load
multiplier and no hard block — ending with "Somehow it feels like it is way too long for travel
time." Root-caused by directly reproducing the report's own Stage 11 numbers before writing any
fix. Civ-layer only (`jpCalcLand`). Hash vs v1.66 ALL IDENTICAL.

- **v1.63's `JP_LOAD_INVALID_RATIO` check only ever saw `ratio0`** — cargo plus a flat, non-
  iterating water estimate — computed BEFORE the convergence loop runs. The loop's own water term
  is measured each iteration from `dryKm ÷ the speed reached so far`: slower speed → more days to
  cross the gap → more water mass → more load → slower speed, a real feedback loop unrelated to
  `ratio0`. `jpLoadPenalty` floors at a flat 0.45× past 150%, so instead of failing to converge the
  loop "converges" at a stable but physically absurd number and returns it as a real, summed stage.
  Reproduced exactly: the reported stage's `ratio0` is 0.82 (read as fine), the loop's own
  converged `loadRatio` is 15.3.
- **Fix: the SAME `JP_LOAD_INVALID_RATIO` cutoff is now also checked on the post-loop
  `loadRatio`**, right after the convergence loop. Consistent with every other hard block in this
  function — `_jpPlan`'s existing `blockedIdx` check already zeroes `plan.totalDays` for any one
  blocked stage; this closes the gap where a water-driven overload could slip past that net and get
  summed into the trip total instead of flagging "Impossible as configured".
- **Directly explains the report**: `_jpPlan` only sums days for non-blocked stages, so several
  already-known-infeasible stages (76/31/51/208 days each) were still contributing their absurd
  duration to the 18-month headline instead of hard-blocking the plan.
- **Fixing this surfaced 3 pre-existing v1.56 smoke assertions that were themselves accidentally
  overloaded** — the same shape v1.63's own CHANGELOG entry already named. A synthetic 3000 km
  waterless gap for a 4-person Walking party with zero animals is genuinely infeasible under ANY
  reserve multiplier, even a flat 1.1× with no tier escalation. Investigated whether more capacity
  fixes it first (it doesn't: in a non-desert biome an animal's own water draw during a multi-day
  gap always exceeds its pack capacity, so adding animals makes a long dry crossing WORSE — the
  same divergent-fixed-point shape v1.48 documented for fodder). Fixed by shrinking the test
  scenario to a genuinely carriable 110 km and moving the "can the tier ladder reach Deep Desert
  Crossing" check onto `_jpDesertTierForGap` directly — a pure function decoupled from whether any
  party could survive carrying that much water, which is a capacity question v1.63/v1.67 already
  own.
- **Tests**: 5 new smoke assertions (`R.v167`) plus the 3 corrected v1.56 assertions above.
- **Known scope cuts**: no change to the loop's iteration count, `jpLoadPenalty`'s curve, or any
  terrain/weather/infrastructure table — only the missing post-loop capacity check.

### Per-stage pack-animal + vehicle fine-tuning, with a swap advisory (v1.66)

Owner: a 2-person party travels moderate climate for 2/3 of a route then desert, wanting to swap
mule+cart for camel+travois at the transition — "For now I cant make any such a finetunement."
Investigated first: the water/food math was already species- and per-stage-correct (`jpCapacity`
reads `JP_ANIMALS[k]`/`JP_DESERT_ANIMAL_MOD[k]` fresh per stage's own biome); the real gaps were
no per-stage vehicle control and no auto-detected advisory. Owner picked "auto-detect + advisory
button" via `AskUserQuestion`. Civ-layer only. Hash vs v1.65 ALL IDENTICAL.

- `_jpBestPackageForStage` — species/vehicle twin of v1.53's `_jpBestLandTransportForStage`.
  Species from `jpBestAnimalForContext` (same primitive the route-wide auto-picker already uses
  internally); vehicle recommendation only ever proposes travois when the current wheeled vehicle
  can't cross the terrain, or cart when travois is used but wheels are viable again.
- New per-stage Vehicle override (None/Cart/Wagon/Travois/Sled), mirroring v1.50's Pack animal
  select — translates into the same four flat plan fields `jpCalcLand` already reads.
- "Use here" on the advisory writes species + vehicle together in one click.
- Verified against the owner's literal scenario: moderate stage gets no advisory, desert stage
  recommends camel, clicking it changes only that stage — shared plan and other stages stay mule.
- **Tests**: 8 new smoke assertions (`R.v166`).
- **Known scope cuts**: Mounted Rider's mount species not covered (Baggage Train only, per the
  owner's example); sleds are manually selectable but not part of the auto-recommendation; vehicle
  sizing/existence decisions stay `jpAutoPickTransport`'s whole-route job.

### Journey Planner: one-click auto-fix buttons for stage bugs (v1.65)

Owner: "when a stage gives a bug give a button to automate a fix." Extends v1.53's "Use here"/
v1.47's "Re-route" advisory-button pattern to the per-stage trouble cards in `_jpRenderResults`.
Civ-layer only. Hash vs v1.64 ALL IDENTICAL.

- Only subcases with a single, deterministic, side-effect-free remedy get a button: a winter-
  closed pass ("🔧 Turn off seasonal closures" — sets `plan.seasonalClosures=false`, syncs the
  party-form checkbox), a mount-blocked/baggage-train-without-animals stage ("🔧 Switch to
  Walking" — reuses v1.53's existing `stageOverrides[idx].transport` mechanism verbatim), and a
  wheel-vehicle-present block ("🔧 Remove carts/wagons here" — clears per-stage carts/wagons AND
  switches to Walking, since clearing carts alone just trades one wheel-block message for
  another).
- A vessel swap and any cargo/party-size change stay text-only hints — this planner has always
  treated those as the user's own call, never silently computed (v1.48/v1.49's precedent).
- Every fix was verified by actually clicking the rendered button and checking the stage
  unblocked on the next `_jpPlan()` call, not assumed from reading the code — the wheel-vehicle
  case's first cut (clear carts/wagons only) failed exactly this check and was corrected before
  shipping.
- **Tests**: 7 new smoke assertions (`R.v165`), monkeypatching `_jpDeriveStages` to force exact
  blocked terrain/biome/season combinations through the real render pipeline.

### Auto-generated roads preserve and prefer manually-drawn ways (v1.64)

Owner: "on parts of routes and ways, when applicable always follow them as they are optimized."
Investigated before writing any fix — the phrase was ambiguous across three candidate mechanisms
(manual Route/Way tools, the auto-generated network, Journey Planner stage derivation). The manual
tools already had a real discount (v1.53); the auto-generated network never did, and also silently
destroyed manual ways on every run. Civ-layer only. Hash vs v1.63 ALL IDENTICAL.

- **`_civAutoRoutes()` ("Generate Roads") opened with a flat `civWays=[]`**, discarding every
  manually-drawn way (road AND sea-lane) on every run. Now manual ways (`w.manual===true`) are
  snapshotted before the rebuild and preserved in the final list alongside the fresh network — the
  v1.24 BUG-4 "preserve deliberate user work" precedent, applied by simply not destroying the data.
- **`_civHierarchicalNetwork` had zero knowledge of pre-existing ways even where it wasn't
  destructive.** New optional `opts.existingWays` applies the same `_CIV_EXISTING_WAY_DISCOUNT=0.25`
  multiplicative cost reduction the manual tools already use (v1.53), extracted into a shared helper
  (`_civMarkWaysOnGrid`) so the two mechanisms can't drift apart — the umpteenth instance of this
  file's "two functions answering one question WILL drift" lesson. `_civAutoRoutes` feeds its
  preserved manual LAND ways in; every other call site omits it and is an exact no-op fall-through.
- **Measured**: a settlement pair the base network did NOT connect directly, after adding a manual
  way between them and re-running with `opts.existingWays`, went from 30 to 134 usage-count on the
  way's own cells and became a direct edge.
- **Known scope cuts**: `_civMstRoutes` (sea-lane MST) not threaded with this — narrower, separate
  code path, left for later. `_civIterativeAutoWorld` ("Auto World") also regenerates settlements
  from scratch each run, which would leave a preserved way's anchors pointing at stale positions —
  deliberately not extended there; only the standalone "Generate Roads" button (settlements
  untouched) is a safe, unambiguous preservation case. The Journey Planner's `_jpDeriveStages`
  already samples whatever the Route tool committed, which now follows infrastructure more by
  construction — no separate JP-side change needed.

### Journey Planner: a load-penalty ceiling, and Small Caravan's own bonus restored (v1.63)

Owner supplied a research prompt diagnosing two findings from a fresh audit of the load-penalty/
coordination chain, plus three lower-priority confirmations and two unverified-value flags. Civ-layer
only (`jpLoadPenalty`, `jpCalcLand`, `JP_GROUP_CLASSES`). Hash vs v1.62 ALL IDENTICAL.

- **`jpLoadPenalty`'s curve floored at a flat 0.45 for ANY ratio past 1.50, with no upper bound** — a
  stage at 22×-166× rated capacity (a genuine mismatch, e.g. a leg checked against pure human-porter
  capacity while carrying cargo sized for a different leg of the same journey) read identically to one
  at 1.51×: "keep going at 45%." No historical party departs at 22× capacity. Per the doc's own
  instruction, the fix is not a new load curve (no sourced data exists for "how slow is 22×") — it's
  recognizing the existing curve already has a top boundary. **`JP_LOAD_INVALID_RATIO=1.50`** reuses
  that boundary as an invalidation cutoff, checked on the UN-iterated `ratio0` (before the convergence
  loop, which only redistributes food/water — cargo, the term actually driving an extreme overload,
  never shrinks), the same way `jpAssessResupply` already flags "over capacity" instead of silently
  computing a slow-but-valid number. Every graduated band at or below 1.50 is untouched.
- **Small Caravan (≤10) carried a neutral `coordMod:1.00`.** v1.43 read travel-speeds.md §5's
  "+15-25% advantage for a small unescorted party" as license to make that band the zero-point other
  tiers are penalized against, rather than giving it the bonus §5 describes. Set to **1.20** (mid-band
  of 1.15-1.25) per the owner's literal reading. Individual and the three tiers above Small Caravan are
  explicitly unchanged — not asked to extend further.
- **Confirmed, not changed**: `JP_GRAZING`'s speedMod scale is correctly ordered (prices grazing time
  during travel, not a fodder-skipping reward); `_jpDeriveStages`' sea-leg weather/biome linkage is
  intentional; `jpCalcWater` needs no changes, confirmed and left untouched per the doc's instruction.
- **Flagged unverified, not changed**: `JP_TERRAIN.land["Snow / Ice"]` (0.55) and the Galleon's cruise
  speed in `JP_SHIPS` (13 km/h) — the doc could not source either; a code comment discloses this
  rather than guessing at a recalibration.
- **Fixing this surfaced a cascade of pre-existing smoke-test scenarios that were themselves
  accidentally overloaded** — synthetic Walking/zero-animal plans inheriting a `cargoKg` sized for a
  different (animal-carried) baseline, now correctly caught where they previously returned an
  unflagged, heavily-penalized number. Fixed by giving each scenario a baseline it can actually carry
  (the v1.49 fix's own precedent), not by loosening the new check. One instance (a 45/60-day
  `supplyDays` sweep under Partial grazing) needed camels rather than more mules — under Partial
  grazing a mule's own fodder for that long (5 kg/day × days × 0.5) exceeds its 110 kg capacity, so
  adding mules made a long trip WORSE, the same divergent-fixed-point shape v1.48 already documented
  for the pack-animal solver; camels break even at that duration (6 kg/day fodder vs. 300 kg capacity).
- **Known scope cuts**: no new load curve above 1.50× (the doc's own explicit instruction); Snow/Ice
  and Galleon speed stay unverified, disclosed rather than guessed; the sea-leg chain is untouched.

### Settlement overlap: the coastal-preference swap never checked its target (v1.62)

Owner report: "settlements being created on top of each other even from oposing factions now."
Root-caused by ablation (disable one candidate mechanism at a time, re-measure — not by inspection
alone) before writing any fix.

- **The v1.46 coastal-preference swap relocates a landmass's worst non-port settlement onto a fresh
  coastal candidate, and never checked that candidate against the settlements ALREADY standing on
  that landmass.** The candidate is spaced against the OTHER coastal candidates (via
  `findSettlementSeeds`'s own suppression radius) and against its own swap target's CURRENT position
  (a `<2`-cell no-op guard) — but nothing else. `byLandmass` groups by LANDMASS, not faction; since
  v1.58 let several factions share one landmass, this could — and measurably did — drop one
  faction's settlement directly onto a rival's already-placed town.
- **Measured before fixing**: an 8-seed sweep of a fresh `_civIterativeAutoWorld(3)` found
  settlement pairs within 3 km (several at literally 0 km) on 5 of 8 seeds, including cross-faction
  pairs (a faction-2 town + faction-3 hamlet at 0 km; a faction-6 capital landing on a faction-1
  hamlet). Disabling `_civOceanDistField` (the v1.46 smoke test's own established technique for
  turning the swap off) eliminated every overlap across all 8 seeds; disabling the water-edge snap
  did not — isolating the coastal swap as the sole cause before any code changed.
- **Fix**: reject a swap candidate within `suppR` (already computed earlier in the same function,
  the same value every other placement pass in it uses) of any OTHER settlement, falling through to
  try the next candidate. Four lines, civ-layer only. Hash vs v1.61 ALL IDENTICAL.
- **Known scope cut**: the crossroads-settlement snap and the all-settlement water-edge snap
  (`_civSnapToWaterEdge`, both v1.39) share the same "move without checking siblings" shape in
  principle, but the ablation showed neither produces overlaps in practice on the sample tested —
  left alone rather than fixed speculatively.

### LOD tile refinement: per-tile failure isolation (v1.61)

Owner report (screenshot): a rectangular block of Tiled-LOD tiles permanently stuck on the coarse/
unshaded overview — deep zoom, plain Biome view, no bake involved, panning away and back never fixed
it. Investigated thoroughly before writing any fix (see CHANGELOG for the full audit trail: every LOD
camera-move path checked for a missing `scheduleLodRefine()` call, every v1.60 function checked against
the Worker's function whitelist, baking ruled out by the owner directly, reproduction attempted via
Playwright across 6 seeds with forced refine cycles and an aggressive fast zoom/pan gesture sequence) —
the exact trigger was never reproduced, but the audit found a real structural gap worth fixing
regardless of what specifically triggers it.

- **`refineVisibleTiles()` has two paths to compute a missing tile — a Web Worker pool
  (`GENPOOL.runTiles`) and a synchronous main-thread fallback — and neither isolated one tile's
  failure from its neighbours.** Worker side: the `stage==='tile'` per-job loop had no try/catch, so an
  uncaught throw never reaches `postMessage` — it fires the main thread's `onerror` instead, which
  rejects the ENTIRE batch dispatched to that worker (jobs are round-robin split across however many
  workers exist, so several tiles die together). Sync side: the fallback loop had the same gap — no
  per-iteration try/catch, so a throw stopped it partway through `need`, leaving every tile queued
  after the bad one uncached too. Both failures were silently swallowed by `scheduleLodRefine()`'s
  outer `catch(_){}` — nothing ever surfaced an error, matching the report's "no loading indicator,
  nothing visibly wrong except the stuck block" exactly. And since the same tile position recomputes
  identically every time, a deterministic failure fails forever — matching "permanently stuck."
- **Fix: isolate every tile independently in both paths, and log instead of swallow.** The worker's
  per-job loop wraps each `pyramidTile(...)` call in its own try/catch, pushing `null` (the existing
  skip-on-falsy convention at the call site already handles this) and collecting an error record;
  `_runTiles`'s `onmessage` now `console.warn`s them. `refineVisibleTiles()`'s sync loop gained the
  matching per-iteration try/catch + warn. A failed tile is simply left uncached — the ordinary
  "not yet refined" state, shown as the coarse overview and retried on the next debounced settle —
  instead of blocking or crashing its siblings.
- **`bakeVisibleTiles()`/`bakeAllTiles()` share the identical latent shape and are deliberately left
  alone this pass** — the owner confirmed baking wasn't involved in the report, and a finalized-world
  baking failure is a different enough failure mode (silently missing atlas chunks in output meant to
  be permanent) to deserve its own dedicated look rather than a drive-by bundled into an unrelated fix.
- **Bit-identical to v1.60** — pure error-handling around calls that never throw on the happy path, so
  the return value is byte-for-byte unchanged whenever nothing fails.
- **Tests**: 5 new smoke assertions (`R.v161`) force the sync path (`GENPOOL.usableForTiles=()=>false`)
  and monkeypatch the global `pyramidTile` to throw for exactly one visible tile, twice in a row —
  confirming multiple tiles are genuinely in view (so sibling-survival means something), the bad tile
  stays uncached rather than crashing, siblings still get cached, a warning is now logged, and a
  repeated failure never escapes `refineVisibleTiles()` as an uncaught rejection.
- **Known scope cut, disclosed**: the root TRIGGER for the originally-reported stuck tile was not
  identified. This fix prevents it from ever manifesting as a silent, permanent, multi-tile block
  again, and the new `console.warn` makes the underlying cause diagnosable if it recurs — naming the
  exact `z/col/row` and error message — but the "why did `pyramidTile` throw at all" question is
  genuinely still open.

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
runoff — `computeFlow(true)` seeds cells with mean-normalised rain) → erosion passes
(v2.17 `state.passes`, all off by default) → `carveRiverValleys()` → render. Canonical stage
order rationale: `docs/research/pipeline-order-audit.md`.

Erosion ops (droplet/stream-power/glacial/velocity) run in blob-URL Web Workers built by
stringifying self-contained kernels, with sync fallbacks; `evolveCoupled` runs the
climate↔erosion loop; `routeSediment` is mass-conserving. Renderer: per-pixel material mixture
via `materialWeights` (Σ=1), multi-scale hillshade, opt-in NPR styles, LOD/atlas tile pyramid
(IndexedDB-backed baking), Strahler/Rosgen river network. Export/import: `exportZip()`/`loadZip()`
— `params.json` + f32 fields + PNG layers + Cartalith-loadable `biome_baked.bin`/
`terrain_baked.bin`/`cartalith_grid.json` (+ optional atlas/asset-library entries).

`state.planet` (`g`, `rotationHours`, `axialTiltDeg`, `radiusRel`) grounds several real physics
channels, all normalized to a no-op at Earth defaults (g=1, 24h, 23.4°): `circulationCells()`'s
Hadley/Ferrel/Polar band count (`N_c=√(ΩR/√(gH))`), `buildWind`'s Coriolis term (`Ω=24/rotationHours`),
`computeTemperature`'s g-scaled lapse rate, the seasonal declination shift, and — v1.85 —
`climEffectiveEquatorTemp()`'s axial-tilt (`insolationContrastK`, a 2nd-order EBM obliquity term) and
rotation (`rotationContrastK`) scaling of the equator-pole temperature *contrast* that seeds ocean SST
(`oceanSSTAnomaly`/`computeOceanCurrent`) and, through it, wind. See `docs/research/gravity-influence.md`
and `docs/research/solar-energy-budget.md`.

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
tests/run.sh                        # newest Gen1 file: extract engine → node --check → the suite. NOTE: the default target is the newest `Cartalith Gen1 v*.html` (v2.22), which THROWS — the suite has tracked the DCC line since the v2.24 fork. Pass a DCC file explicitly.
tests/run.sh "Cartalith v2.56 DCC test.html"   # 1280 assertions, 0 failed (exports ENGINE_SRC_PATH for the v2.47 worker-list check)
tests/run.sh "Cartalith Gen1 v0.57.html"   # or any explicit target
tests/run_um.sh                     # newest Gen1 file: extract script block 4 → node --check → 852-assertion urban-morphology suite
node tests/perf/hash_gen1.js A.html B.html # Playwright A/B bit-identity battery (same-binary FNV hashes)
node tests/perf/perf_gen1.js               # timing harness (headless Chromium)
node tests/perf/probe_foodshed.js A.html    # clean-world food-shed / urbanisation checks
node tests/perf/probe_placement.js A.html   # clean-world settlement-placement checks
node tests/perf/probe_travel.js A.html      # Journey-Planner km/day vs travel-speeds.md §8 bands
node tests/perf/probe_passes.js A.html      # v2.17 generation passes: the DOM/syncUI half + generate() itself
node tests/perf/probe_roadconnect.js A.html # v2.18 road connectivity: a real road must read as connected
node tests/perf/probe_manpower.js A.html    # v2.19 military manpower incl. the spec's two worked examples
node tests/perf/probe_landmass.js A.html    # v2.20 landmass names, the map layer, rename + the search fix
node tests/perf/probe_trade.js A.html       # v2.21 multi-good supply matching + the value-density curve
node tests/perf/probe_craters.js A.html     # v2.22 physical crater model: controls, saturation, size shift
node tests/perf/probe_savetree.js A.html B.html  # v2.26 save tree: conformance, round trip, and B.html's flat save still opening
node tests/perf/probe_shellui.js A.html    # v2.27 shell: sidebar segments, header row, rail z-order, View-mode layer clear, dvh
node tests/perf/probe_cogmodal.js A.html   # v2.28 cog window: dvh, no centre-clip, sticky head, 44px close
node tests/perf/probe_blur.js A.html       # v2.32 gaussBlur: the CPU path is the fast one (needs a real browser — the headless suite has no WebGL2)
node tests/perf/probe_domainrail.js A.html [B.html]  # v2.31 domain rail: drawer head on a phone, unchanged on desktop
node tests/perf/probe_landsurface.js A.html # v2.34 land surface: one sourced speed table, forest binds by min, Rocky > Plains
node tests/perf/probe_margins.js A.html [seeds] # v2.35 boundary margins: crossing-number junctions, chain length, 8-connected walk
node tests/perf/probe_orogeny.js A.html      # v2.36 orogenic belt: thrust-sheet stack, real-km width, the stamping-cost cap
node tests/perf/probe_riverscale.js A.html # v2.58 river SELECTION must scale: whole main stems (not fragments), an on-screen-px gate, and a spline that refines with zoom
node tests/perf/probe_coastgeom.js A.html B.html # v2.57 the coastline must stop being the plate polygon and the carve must stop combing it (B.html is the pre-fix control; each half measured against its own off-state)
node tests/perf/probe_renderfields.js A.html # v2.56 the render prologue caches: nothing rebuilds on a repeat render, and each input rebuilds EXACTLY the fields that read it
node tests/perf/probe_reliefloor.js A.html # v2.55 the deep-zoom plain: the relief floor is real-metre keyed, the contrast rebase is seam-free and cannot clamp a channel (both measured against their own off-state inside ONE build)
node tests/perf/probe_geninfo.js A.html # v2.54 the parameter dump must REBUILD the world it describes (round trip vs a v2.53-shaped control)
node tests/perf/probe_hgt24.js A.html [B.html] # v2.53 the baked atlas must lose NO distinct height (real atlasPut/atlasGet; B.html is the lossy control)
node tests/perf/probe_heightbits.js A.html # v2.53 how many bits the height word needs: 24 and 32 recover the same levels, because f32's mantissa is 24 bits
node tests/perf/probe_lod7compare.js A.html out.png # deep-zoom contrast figure: 16-bit -> 24-bit -> relief floor -> local contrast on one LOD-7 tile. EVERY rung is shipped code (figure generator, not assertions) — needs v2.55+
node tests/perf/probe_cratertile.js A.html # v2.52 a sub-cell crater resolves IN the tile (world-unit area constant across 5 tile resolutions)
node tests/perf/probe_craterdepth.js A.html # v2.51 crater depth from real DIAMETER (Pike 1977), scale-invariant across map extent
node tests/perf/probe_craterscale.js A.html # v2.50 a sub-cell crater/volcano must not be inflated to the grid (area-ratio amplitude, volume conserved)
node tests/perf/probe_riverwidth.js A.html # v2.49 river width follows discharge; real-km scaling keeps working past 12 800 km
node tests/perf/probe_platedt.js A.html   # v2.48 plate-age distance transform: exact, isotropic, wrap-aware (the octagon fix)
node tests/perf/probe_lodsurface.js A.html # v2.47 LOD height refinement: the C1 crease test, band-limited detail, seams still exactly 0
node tests/perf/probe_assetsbtn.js A.html  # v2.46 the Asset Library toggle is a visible, one-click header control (asserts a real click LANDS)
node tests/perf/probe_worldreset.js A.html  # v2.44/v2.45 all five world-construction paths: no inherited state; a resolution change rescales rather than abandons, rasters and faction metadata included
node tests/perf/probe_regionworld.js A.html # v2.43 Extract-as-new-world must not inherit `finalized`; the flat reader must refuse a heightmap-less archive
node tests/perf/probe_seasonlink.js A.html # v2.42 the Seasons checkbox must open the render blend it enables (keyed to the build's own annual baseline)
node tests/perf/probe_deltas.js A.html     # v2.41 integrated drainage (pit fraction -> 0) + river deltas (the 80/10/10 split, bounded lobes)
node tests/perf/probe_rivertile.js A.html  # v2.40 the river must live IN the tile and RESOLVE with zoom (world-unit area constant across 5 tile resolutions)
node tests/perf/probe_lodrivers.js A.html  # v2.39 rivers must be visible under Tiled LOD at DEFAULTS (delta vs the build's own overlay-suppressed baseline)
node tests/perf/probe_civbusy.js A.html    # v2.38 the long civ ops must acknowledge the click (they are not made quicker)
node tests/perf/probe_seamcarve.js A.html [seed] # v2.37 the carve must not trench across the antimeridian (WORLD mode; seed 21811 wraps, 12345 does not)
node tests/perf/probe_carve.js A.html      # v2.29/v2.30 river carve: ways default off, incision strength, network cost, trench-vs-drainage coverage
node tests/perf/smoke_gen1.js A.html        # Playwright UI-chrome smoke (524 assertions: onboarding/layers/presets/phase + per-version regressions)
```

Stubs live in `tests/stub_head.js`; assertions in `tests/test_tail.js` — extend both when adding
pipeline stages or browser APIs. The suite covers the CPU paths of script block 1 only; blocks
2–3 and all GPU/Worker/canvas interaction need a browser pass. Script block 4 (urban morphology)
is pure/DOM-free like block 1, so it gets its own headless harness (`tests/run_um.sh` +
`tests/um_test_tail.js`, ported from `urban-morphology/tests/`) — but the block 2 adapter/renderer
that calls it is civ-layer code, so THAT half still needs `tests/perf/smoke_gen1.js`.

## Roadmap

See `docs/ROADMAP.md` and the plans/research under `docs/`. History: `CHANGELOG.md`.
