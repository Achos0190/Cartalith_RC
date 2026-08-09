# Cartalith Gen1 — engine changelog

Per-version log of the generator engine, **newest first**. Entries v0.037–v0.144 cover the
pre-merge `elevation_foundation` lineage (that engine is now script block 1 of the merged
`Cartalith Gen1 v*.html`); the Gen1 merged-file line continues above them.

Formatting note: these entries were written as working notes for agent sessions (they double as
the project's memory). Each one states what changed, why, the verification performed
(assertion counts, bit-identity claims at the pinned seed), and any browser passes still owed.

---

## Gen1 merged-file line

### v1.90 — Save files: DEFLATE-compress the project .zip; internal format unchanged

Owner: "simplify save files and find a way to optimise the internal formatting of the save files
and compression of the save files." Engine only (block 1: `zipStore`/`loadZip`), touching the
export/import path exclusively — never `generate()`/`renderNow()`. Hash vs v1.89 **ALL IDENTICAL**
(this changes only how bytes are packaged for storage, never any computed field).

- **Measured first, on a real exported project, not assumed.** A live-browser probe (real
  `generate()` + `_civIterativeAutoWorld` populated world, 1024px) broke down `exportZip()`'s own
  raw `.f32`/`.bin`/`.json` entries (excluding already-compressed PNG/atlas chunks): **71.24 MB
  total, and every byte of it was written completely uncompressed.** `zipStore` — this file's
  own zero-dependency ZIP writer — hardcoded compression method 0 (STORE) for every entry; the
  reader side (`unzipStore`) could only ever read STORE-format entries.
- **The infrastructure to fix this already existed, unused, for the main save path.** `unzipAny` (a
  central-directory-based reader supporting both STORE and DEFLATE, already shipped and used by
  `loadAssetPack`/the asset-pack importer) already handled compressed entries — `loadZip()` (the
  MAIN project-save loader) was the one place still hardcoded to the store-only `unzipStore`. And
  `CompressionStream`/`DecompressionStream` — the native, zero-dependency browser API this file's
  own `gzipBytes()` helper already used elsewhere (`docs/` region-tile export) — makes writing real
  DEFLATE compression a small, self-contained change, no new format, no new dependency.
- **Fix**: `zipStore` now DEFLATEs (`deflate-raw`, matching the ZIP spec's own method-8 format)
  each entry via `CompressionStream`, using it (method 8) only when the compressed result is
  genuinely smaller — otherwise falling back to STORE (method 0), byte-for-byte the v1.89 behavior.
  `.png`-named entries skip the attempt outright (already internally DEFLATE-compressed by the
  browser's own PNG encoder — attempting to recompress them is pure wasted CPU with no possible
  gain, and the fallback-if-not-smaller check would discard the attempt anyway). `zipStore` is now
  `async` (compression is stream-based) — every one of its 4 call sites was already inside an
  async function or event handler, so this needed no restructuring, only adding `await`
  (`ZipExporter.blob`/`.download` — the Asset Library's own thin wrapper around `zipStore` — became
  async too, and their two call sites needed the same). `loadZip()` moved from `unzipStore` to
  `unzipAny` — a strict superset (still reads every pre-v1.90 store-only save exactly as before;
  now also reads the new compressed format) — the ONE actual behavior-relevant code change on the
  read side.
- **Measured after, via the REAL production `exportZip()`/`loadZip()` functions, not a
  reimplementation.** A Playwright probe intercepted the real export (monkeypatching
  `URL.createObjectURL` to capture the Blob instead of letting it hit a download link), then fed it
  straight back through the real `loadZip()`: **field/temp/rain FNV hashes, settlement count and
  details, way count, label count, sea level, and seed all matched exactly** before vs. after —
  full round-trip fidelity, not just "the file got smaller." Same world, same settings: **26.35 MB
  (v1.89) → 12.11 MB (v1.90), a 54% reduction** for a genuine `exportZip()` call including the
  baked `map.png`. The isolated raw-entries-only measurement (excluding the PNG bake) showed an
  even larger 78.2% reduction (71.24 MB → 15.55 MB) — resource-potential `.f32` files (copper/tin/
  iron/gold/salt/…, mostly-zero rasters) compressed to as little as 0.4–10% of their raw size;
  heightmap/temperature (real, noisy generated data, not the idealized case) compressed more
  modestly, ~14%/16%.
- **A test-writing mistake caught and fixed before shipping, not shipped as a false claim.** A
  first cut of the new regression test asserted a smooth sine-wave-shaped float array would
  compress ">2x smaller" — it measured only ~9% (generic byte-level DEFLATE doesn't exploit float32
  mantissa continuity the way a format-aware codec would; smoothness in the mathematical sense
  isn't the same as byte-level redundancy). Replaced with a sparse, mostly-zero array — the actual
  shape of the resource-potential fields that drive the real measured win — and a threshold the
  measurement genuinely supports (>5x), rather than loosening the claim to fit a misleading
  synthetic case.
- **A second test bug, also caught by running the suite, not assumed correct because it looked
  right on paper**: an independent hand-rolled "pre-v1.90 STORE-only zip" backward-compatibility
  test initially omitted the central directory record's own trailing filename copy (a ZIP central-
  directory entry carries its OWN copy of the name, separate from the local header's) — `unzipAny`
  read a truncated/wrong filename as a result. Fixed by following the established, already-correct
  hand-rolled-zip pattern elsewhere in this exact test file (`v1.60`'s DEFLATE-entry test), which
  folds the trailing name directly into the central-directory byte array rather than concatenating
  it as a separate piece afterward.
- **"Simplify"**: the format itself is unchanged — same entries, same names, same semantic content;
  compression is purely a byte-level packaging change, not a redesign. A real, related redundancy
  was found (`exportRegionTiles`'s own pre-existing ad-hoc per-file `gzipBytes()`+`.gz`-suffix
  mechanism for its refined-tile `.bin` files, and the atlas-chunk export's identical pattern) but
  deliberately left alone — it's now largely superseded by `zipStore`'s own universal compression
  (redundant, not incorrect: a `.bin` file gzip-wrapped once is already near-incompressible, so
  `zipStore`'s own attempt on it correctly falls back to STORE, wasting a little CPU but nothing
  else), and removing it would touch a user-facing checkbox (`#refGzip`, "Compress heightmaps
  (gzip)") and a documented `.gz`-suffix naming convention external tooling may depend on — a
  narrower, separate, lower-value change than the save-file path this request was about.
- **Tests**: 10 new assertions in `tests/run.sh` (1031/1031) — compression ratio on realistic sparse
  data, DEFLATE (method 8) used for the compressible entry, STORE (method 0) both for `.png`
  (skipped by name) and for genuinely incompressible random data (attempted, correctly discarded),
  byte-identical round-trip for all four scenarios (compressible/incompressible/PNG/tiny), the exact
  `new Float32Array(bytes.buffer)` reinterpretation idiom `loadZip()` itself relies on reproducing
  the original values exactly, and backward-compatibility with a hand-rolled pre-v1.90 STORE-only
  zip. `tests/run_um.sh` 852/852 (block 4 untouched), `hash_gen1.js` ALL IDENTICAL, `smoke_gen1.js`
  matches the v1.89 baseline exactly (including the pre-existing `R.exportTrim` monkeypatch test,
  confirmed unaffected since it captures entry names synchronously before compression runs).
- **Known scope cuts**: no change to WHAT is saved (see "Simplify" above — a genuine content-level
  simplification, e.g. determining which fields are truly re-derivable from the seed alone and
  could be omitted rather than compressed, is a materially larger, higher-risk undertaking not
  attempted this pass); `exportRegionTiles`'s/the atlas exporter's own pre-existing ad-hoc gzip
  mechanisms are left in place, disclosed as now-largely-redundant rather than removed.

### v1.89 — Simulation-speed pass: erosion kernels' priority-flood heap, and a redundant per-iteration coefficient in stream-power incision

Owner: "Again search for optimisation in the simulation, rendering, LOD, and way/route/
PathFinding.js systems" (no separate PathFinding.js file exists — the in-file route/Dijkstra logic
is what's meant). Continuation of the v1.87 rendering-speed pass, this time targeting `generate()`
itself — the earlier `perf_gen1.js` baseline had already shown `carveRivers` (18s) and
`plates+stress`/`flexure` (6s/3s) dwarfing anything touched in v1.87 at 2048px. Engine only
(block 1). Hash vs v1.88 **ALL IDENTICAL**.

- **Measured, not assumed, at every step** — this pass shipped two real fixes and found one real
  regression that was caught and reverted before shipping, all via direct A/B measurement rather
  than trusting a CPU profile's self-time numbers (which turned out to be substantially distorted
  by sampling-profiler overhead on these specific hot loops — see below).
- **Fix 1: `streamPowerKernel`'s priority-flood heap** (the same `MinHeap` shape as `buildWaterBodies`
  — v1.87's own fix, applied here verbatim). This kernel runs **synchronously on the main thread
  inside `carveRiverValleys()`, i.e. on every default `generate()` call** (`state.carveRivers` is
  true by default), not just the manual Stream-power erosion button — so its own heap cost is paid
  on every regenerate. Same preallocated `Float32Array`/`Int32Array` storage, identical sift-up/
  sift-down comparisons, bit-identical output by construction (every cell enqueued at most once, a
  known upper bound `n=W·H`). `glacialKernel` (the manual Glacial-erosion button's own kernel, same
  self-contained shape per invariant 11) got the identical fix alongside it.
- **Fix 2: the implicit stream-power incision loop was recomputing an invariant every iteration.**
  `carveRiverValleys` runs this loop `P.iters` times (9 by default for its own lighter pass). Each
  iteration recomputed `C = Ki·dt·Math.pow(area[i],m)/L` per cell — but **every input to that
  expression (`P.resist`, `resist[i]`, `K`, `ck`, `rain[i]`, `area[i]`, `m`, `dt`, `rdist[i]`) is
  fixed before the loop even starts**; nothing inside the loop ever mutates any of them. The
  original was doing the identical `Math.pow()`-driven computation up to 9× more than necessary,
  per cell, across millions of cells. Precomputed once into a **`Float64Array`** (not `Float32Array`
  — `C` was a plain JS number, i.e. full float64 precision, in the original; caching it in a 32-bit
  array was tried first and correctly caught by `hash_gen1.js` as a real mismatch — `field`/`temp`/
  `rain` differed while `flow`/`rgba` coincidentally still agreed, which is exactly why the full
  scenario battery matters and not just one field). The genuinely iterative part of the loop
  (`fld[i]=(fld[i]+dt*U[i]+C*fld[r])/(1+C)`, which reads the *previous* iteration's `fld[r]`) is
  untouched — same formula, same operands, same order of operations, evaluated once instead of
  `P.iters` times. Measured (non-profiled, direct per-line timing): this loop was **~59% of
  `streamPowerKernel`'s own cost**, ahead of the priority-flood heap.
- **A real regression, found and reverted: `roadDijkstra`'s heap.** Same MinHeap shape again (used
  by `buildRoadNetwork`'s per-settlement Dijkstra, called from `_civHierarchicalNetwork`/"Generate
  Roads"), so the identical technique was tried here too — and **measured WORSE**, not better, on a
  realistic "Generate Roads" run (36 settlements): a preallocate-at-`n` version cost 453ms→551ms
  (-22%); a grow-from-small-capacity version cost 431ms→610ms (-41%, and with visibly increasing
  variance across repeated trials, consistent with GC pressure). Root cause: `roadDijkstra`
  allocates a **fresh heap per settlement** (called once per place, not once per whole run like the
  other three kernels) — the allocation/copy overhead of either typed-array strategy, repeated
  dozens of times per "Generate Roads" click, outweighed V8's own already-well-tuned growth
  strategy for a plain numeric array in this specific per-call-allocation usage pattern. **Reverted
  to the original plain-array heap**, with the measured numbers left in a code comment so this
  isn't re-attempted blind. This is the exact discipline the render-speed pass (v1.87) already
  established — ship what measurably helps, disclose and revert what doesn't, regardless of how
  "obviously" the same technique should transfer.
- **CPU profiling itself was measured to be misleading here, not just noisy.** An early CDP
  `Profiler`-based pass attributed `MinHeap.pop`/`streamPowerKernel` costs that implied a much
  larger win than a clean, non-profiled A/B (alternating fresh browser launches, `generate()`
  timed directly) actually showed — the profiler's own sampling overhead on these specific
  millions-of-iterations hot loops inflates their apparent self-time disproportionately. **Every
  number in this entry is from a direct wall-clock A/B, not a profiler self-time reading** — the
  profiler was used only to *locate* candidate hot spots, never to *quantify* the fix.
- **LOD and the per-pixel render loop were investigated and left untouched.** A profiled zoom/pan
  session under Tiled LOD showed `renderBiomeTileRGBA` dominated by the same `landColorCore`/
  `materialWeights`/`vnoise`/`fbm` machinery already investigated (and left alone) in v1.87 — no
  redundant computation found, the cost is the genuine price of the feature set. `fbm` itself is a
  standard, already-tight 6-octave noise function. `assignPlates` (Jump Flooding Algorithm) and
  `computeStress` were also read for the same MinHeap/redundant-Math.pow patterns that paid off
  elsewhere in this pass — neither showed one; JFA is already the efficient algorithm choice here,
  and `computeStress`'s per-cell allocation is a small, bounded array, not the same shape of
  defect. Not fixed, not attempted further — the `plates+stress`/`flexure` stages' remaining cost
  is disclosed as inherent CPU work, or GPU-offload territory (a much larger, riskier change, and
  this headless test environment's own SwiftShader software-GPU path makes "GPU vs CPU" timing
  comparisons here unreliable for judging real-device behavior — see CLAUDE.md's own existing
  caveat on `perf_gen1.js`'s GPU-adjacent numbers).
- **Net measured effect** (2048px, clean A/B, `carveRiverValleys`'s own `PERF.gen` stage time):
  streamPowerKernel heap fix alone ≈5% off `carveRivers`; heap fix + incision-loop hoist together
  ≈12% off `carveRivers`, ≈4–5% off total `generate()` wall time. Modest, not dramatic — the
  remaining cost is the genuine per-cell numerical work of a multi-pass implicit solver over
  millions of cells, the same "already-tight, no further redundant computation found" conclusion
  v1.87 reached for the render pixel loop.
- **Tests**: `tests/run.sh` 1021/1021 (invariant 11's own worker-kernel bit-identity re-derivation
  from `toString()` catches any kernel-shape regression), `tests/run_um.sh` 852/852 (block 4
  untouched), `hash_gen1.js` ALL IDENTICAL (5 scenarios), `smoke_gen1.js` matches the v1.88
  baseline. `roadDijkstra` has no dedicated bit-identity coverage in `test_tail.js` beyond a basic
  reachability smoke check, so its revert was verified directly: 5 hand-built scenarios (small
  random grid, the exact v0.70-documented uniform-cost stress case, world-wrap on, multi-source
  array input, and a larger grid) hashed identically against unmodified v1.88 both before AND after
  the revert.
- **Known scope cuts**: `dropletKernel`/`velocityErodeKernel` (the other two worker kernels) were
  read and show no MinHeap or comparable redundant-computation pattern — not touched. GPU-path
  timing (`GPU.blurArr`/`GPU.norm`/`GPU.temperature`, used by `gaussBlur`/`normalize()`/
  `computeTemperature()`) was traced as a real, measurable cost in an early profile
  (`gl.readPixels` synchronous GPU→CPU readback) but not investigated further — disclosed rather
  than acted on, since this environment's software-GPU (SwiftShader) numbers cannot be trusted to
  represent real-device GPU behavior, and any change to the GPU/CPU dispatch logic needs testing
  against an actual GPU this session cannot access.

### v1.88 — Settlement picking is weighted by how prominently a settlement actually draws, and respects its own visibility gate at every pick site

Owner: *"Settlements are clickable on any zoom level, making it hard to click a larger settlement
when you're zoomed out as it often means you click one of the smaller ones that are only visible
when zooming in."* Civ-layer only (block 2). Hash vs v1.87 **ALL IDENTICAL** — picking is
interactive-only and never reached from `generate()` or the render path.

- **Two distinct defects, both reproduced on v1.87 before any fix shipped.**
  1. **Every place-pick site was pure nearest-pixel.** `drawCivLayer` has always drawn a
     settlement's pin at `(4+klass.rank)*lsc` — rank 0 hamlet → 4, rank 5 metropolis → 9, a real,
     already-established visual-prominence signal — but none of the five pick sites consulted it.
     So a small settlement slightly closer to the click always beat a much larger one slightly
     farther away, which is precisely the reported symptom: at low zoom the big settlement is the
     one you can see and mean to click, while the small one may be drawn as a 2px dot (or, for an
     addon village, not drawn at all).
  2. **Only ONE of the five sites honoured the `villageAddon` visibility gate.** v1.68/v1.70 added
     that check to `_civSelectPlaceAt` alone; `_civDropPlace`'s select-near-existing, both
     `_civInfoAt` radii, and the right-click "nearest place" context menu never got it — so a
     village that `drawCivLayer` explicitly refuses to draw below `CIV_VILLAGE_ADDON_LOD` could
     still silently win a click at those sites. **The umpteenth instance of this file's own "several
     call sites answering one question WILL drift" lesson** (v1.30 two suitability scorers, v1.32
     two coastal tests, v1.33 two trade rules, v1.35 two water tests, v1.50 two animal resolvers…).
- **Fix: two shared helpers, applied at every site.** `_civPlacePickVisible(p)` mirrors the ONE
  case `drawCivLayer` fully skips drawing (a still-hidden `villageAddon`; every other kind still
  renders as a small dot below its own LOD threshold, so it stays a legitimate target — deliberately
  matching the v1.70 comment at that draw site rather than inventing a stricter rule).
  `_civPlacePickWeight(p)` returns `drawCivLayer`'s own pin-size formula verbatim (`4+klass.rank`,
  flat `5` for POIs, town fallback for an unknown kind — the same fallback every other kind-lookup
  in this file uses). Each pick site now scores candidates by `d²/w²` instead of raw `d²`.
- **The ABSOLUTE pick radius (v1.23's `_civZoomPickR`) is deliberately unchanged.** Candidates are
  still hard-filtered by exactly the same radius as before; only the tie-break *among* several
  in-range candidates is now prominence-weighted. A click near an isolated settlement with no
  competitor behaves identically to v1.87 — this widens nothing and can never make a settlement
  clickable that wasn't before.
- **`_civInfoAt`'s tight City-Viewer pin-hit re-test is deliberately NOT weighted** — unlike the
  four search loops, it re-tests the ALREADY-chosen best candidate against a fixed "is this a
  definite pin hit" radius. There is no competition there and no reference value to normalize a
  weight against, so weighting it would simply inflate a fixed radius. A first cut did exactly that
  (multiplying the radius by `w²`, up to an 81× area blow-up for a metropolis) and was caught and
  reverted before shipping.
- **Measured before and after, both directions.** On v1.87, a near-miss scenario (city at distance
  4, hamlet at distance 3 from the click — a realistic ~75%-of-the-distance gap, not an absurd one)
  picked the hamlet; on v1.88 it picks the city. A hidden addon village under a zoomed-out click
  was selected by `_civDropPlace` on v1.87; on v1.88 it is not. **And the guard against
  over-correcting**: an unambiguous click directly ON the small settlement still picks the small
  settlement — verified explicitly, because a blanket bias toward big settlements would be a
  different bug, not a fix.
- **Tests**: 6 new smoke assertions (`R.v188`) — the weight formula matches `drawCivLayer`'s own
  literal values; the near-miss now favors the bigger settlement at both `_civSelectPlaceAt` and the
  context-menu site; an obvious small-settlement click still picks it; a hidden addon is no longer
  picked by `_civDropPlace`; the same addon IS picked once zoomed past its reveal threshold (the
  gate is on visibility, not on addon-ness).
- **Known scope cuts**: the weight is the renderer's own pin *rank*, not population — two towns of
  the same `kind` but very different `pop` weigh identically, matching what is actually drawn (a
  population term would make picking disagree with the map). Label text is not a pick target (only
  pins are, unchanged). Way/route picking is untouched — the report was specifically about
  settlements.

### v1.87 — Rendering-speed pass: buildWaterBodies()'s priority-flood was paying for a dynamically-growing heap on every terrain edit

Owner: *"let's see if we can optimise the code again for rendering speed whilst we keep the fidelity
and detail."* Measured before touching anything, per this file's own discipline. Engine only (block
1, one function). Hash vs v1.86 **ALL IDENTICAL** across all 5 `hash_gen1.js` scenarios — this
changes only the CPU cost of a full render's prologue, never a single pixel of output.

- **Measured first**: `tests/perf/perf_gen1.js`'s render phase split flagged the "prologue" phase
  (everything a render does before the per-pixel colour loop starts) as costing nearly as much as the
  pixel loop itself — 118 / 357 / 1244 ms at 512 / 1024 / 2048 px, versus 141 / 450 / 1611 ms for the
  loop. A direct probe (invalidate each prologue sub-cache, time it in isolation) isolated the cause
  to one function: `currentWaterBodies()` (`buildWaterBodies` — the ocean/lake classification that
  drives lake shading and is rebuilt once per terrain change, i.e. every regenerate, sculpt commit,
  erosion op, or sea-level move) — 71 / 187 / 1053 ms of that same budget, growing worse than
  linearly with resolution (2.6×, then 5.6×, for a 4× pixel increase each step).
- **A CPU profile (CDP `Profiler`, real 2048px world, seed 12345), not a guess, found the actual
  cause.** `MinHeap.pop`/`.push` — the binary min-heap backing the function's Barnes-style
  priority-flood depression fill — accounted for ~53% of the function's own time (482 ms of ~1050 ms
  self+callees). The heap was backed by two plain, dynamically-growing JS arrays (`this.p=[]`,
  `this.v=[]`, grown via `.push()`/`.pop()`), even though every cell is enqueued **at most once**
  (`done[j]` guards every insert) — so the heap's maximum size, `n = W·H`, is known before the first
  push. A first hypothesis (the `nb`/`visit` neighbour-test closures being *reallocated on every one
  of up to `n` loop iterations*, feeding the GC) measured real but small (GC was only ~10 ms of the
  1050) — worth fixing regardless, but not the dominant cost.
- **Fix, both verified bit-identical by construction, not just by testing:**
  1. `MinHeap` now preallocates `Float32Array(n)`/`Int32Array(n)` (matching `filled`'s own Float32
     precision exactly — no additional rounding) instead of growing plain arrays, with an explicit
     `len` counter. The sift-up/sift-down comparison logic (`<=`/`<`, same tie-break order) is
     untouched — same push/pop sequence, same fill values, same final classification.
  2. The `nb` (below-sea flood fill) and `visit` (priority-flood neighbour relax) closures — each
     previously **redefined on every popped cell**, up to `n` times per call — are hoisted outside
     their loops. Each only ever needed one per-iteration value (`comp` for `nb`, `filled[i]` for
     `visit`, renamed `cur`), which nothing mutates between the read and the closure's use, so both
     become explicit parameters instead of captures — same values, same order, same output.
- **Verified three ways.** (1) `hash_gen1.js`: ALL IDENTICAL. (2) A direct probe hashing
  `currentWaterBodies()`'s own return array + its `fillOut` pooled-level output at 512/1024/2048:
  identical FNV hashes and identical land/lake cell-count sums before and after, at every resolution.
  (3) A controlled A/B (6 alternating fresh-page trials, cold cache, 2048px, same seed): **v1.86
  median 1005.7 ms → v1.87 median 844.3 ms, a real 16% reduction**, consistent across all 6 pairs —
  the official `perf_gen1.js` harness itself under-reported this (its own render-phase measurement
  runs immediately after twelve back-to-back `generate()` calls at three resolutions, adding enough
  background GC/scheduling noise at 2048px to mask the win; the isolated A/B removes that confound).
- **`MinHeap.pop`'s own cost barely moved** (~482 ms → ~505 ms in a repeat CPU profile) — the
  O(log n) sift-down comparisons are the heap's genuine algorithmic cost for ~2.68M cells at 2048px,
  not an implementation inefficiency; `push`/`visit`/`nb` all measurably dropped instead. A d-ary
  heap or a bucket/radix priority queue could plausibly cut the `log n` factor further, but either
  risks popping equal-priority cells (common — the `filled[j]=filled[i]+EPS` tie-break cascades
  through flat depressions) in a **different order** than the original binary heap, which would
  change which cells inherit which fill height and thus the final lake classification — a real
  bit-identity risk, not attempted this pass.
- **The per-pixel colour loop (`surfaceColor`/`materialWeights`/`landColorCore`) was profiled too
  and deliberately left untouched.** It is the single largest cost overall (1611 ms of the 2048px
  render's 2884 ms total) but a CPU profile found no redundant recomputation — every expensive call
  (`slopeAt`, `aspectFactor`, `curvatureAt`, `vnoise`, `bioJitter`, `shadeFactor2`, `vignetteAt`) is
  made exactly once per pixel already. The cost is the genuine price of the feature set (multi-octave
  noise jitter, two-pass canopy closure, aspect/curvature-adjusted moisture, fire disturbance —
  doc §2/§3/§7/§8/§11/§12), not a bug. Speeding it up further would mean either a lookup-table
  approximation of `Math.pow`/`Math.exp` calls (introduces quantization error against the owner's
  explicit "keep fidelity and detail" constraint) or restructuring `renderNow`'s per-pixel debug-view
  dispatch (a much larger, higher-regression-risk change for a self-time cost that string-literal
  comparisons in V8 make unlikely to be significant) — disclosed as a scope cut, not attempted.
- **Known scope cuts**: the heap-algorithm question above (a faster priority queue exists in
  principle but risks changing tie-break order); the pixel-loop question above; `smoothSeaH`/
  `seaShadeFrom` (the sea-floor blur feeding lake shading) showed a smaller, noisier prologue cost
  (4.8→134.8 ms across resolutions) that wasn't investigated this pass — its box-blur implementation
  already uses an O(1)-per-pixel sliding window, so it isn't obviously inefficient the way
  `buildWaterBodies` was.
- **Tests**: `tests/run.sh` 1021/1021 (4 new: a flat-bottom priority-flood tie-region regression pin
  — monotonic pooled fill, symmetric classification, and determinism of both classification AND fill
  levels under a multi-cell tie, the scenario a future heap-implementation change is most likely to
  break silently), `tests/run_um.sh` 852/852 (block 4 untouched), `hash_gen1.js` ALL IDENTICAL (5
  scenarios), `smoke_gen1.js` 661/663 — identical to the v1.86 baseline (the 2 failures are the
  pre-existing, environment-specific `v0.92`/`v0.87` canvas-sizing assertions, confirmed unrelated in
  the v1.85/v1.86 CHANGELOG entries).

### v1.86 — Bug hunt + optimization pass: climate re-simulation silently left settlement suitability, biome classification and several debug views on stale data

Owner: *"Can you bug hunt and do a optimisation pass."* An audit pass, not an owner-reported
symptom — found by systematically checking this file's own cached-field convention
(`_fieldGen`/`_climGen`-keyed, per `currentSlopeField`'s v1.17 comment and `_climGen`'s own module
comment) against every sibling cache, then confirmed by direct before/after reproduction on a real
generated world before any fix shipped. Engine only (block 1). Hash vs v1.85 **ALL IDENTICAL** —
every fix changes only *when* a derived cache recomputes, never the deterministic value it recomputes
to.

- **Root cause, the systemic version.** `computeFlow()`/`generate()` null a whole family of derived
  caches together — biome raster, lithology, soil, landform, resource potentials, carrying capacity,
  settlement suitability, wildlife, NPP, population density, wetlands — because all of them
  transitively read `tempField`/`rainField`/`flowField`/`field`. But **`computeTemperature()`** and
  **`simulateWeather()`** — independently reachable via a climate-slider drag (`recomputeClimate()`,
  live on every `'input'` event) or the standalone "Simulate weather" button — rewrite
  `tempField`/`rainField` **without ever going through `computeFlow()`/`generate()`**, so none of that
  family was invalidated. This is the *exact* defect class the sea-level slider's own handler already
  had to patch once (its own comment: *"owner report: the geological Resources view stayed stale...
  NOT invalidated on a sea change"*) — never extended to the climate sliders or the weather button.
- **Consequential, not cosmetic.** `currentFloodField()` feeds `buildSettlementSuitability`'s flood
  penalty **and** `_civSnapToWaterEdge` directly; `buildBiomeRaster()`/`currentCarryingCapacity()`
  feed icon scattering and settlement suitability's resource/food terms. The real-world workflow this
  breaks — generate terrain once, try a few climate configurations via "Simulate weather," then
  auto-populate settlements — silently placed settlements using the *first* configuration's data,
  regardless of which one the map was actually showing.
- **Two narrower cache-key bugs, same class.** `currentFloodField()`/`currentWindThrowField()` were
  keyed on `state.tect.seed` instead of `_fieldGen` (the file's own established convention — every
  neighboring cache, `currentSlopeField`/`currentRouteCorridors`/`currentLandmassQuality`, already
  uses it). A same-seed regenerate (sea level, tectonic sliders, world-structure archetype, or a
  sculpt/erosion edit) never changes `state.tect.seed`, so these two caches could silently serve
  terrain-shaped data from a *previous* landscape. `currentWindThrowField` additionally lacked
  `_climGen` in its key despite reading `tempField`/`rainField` directly.
- **Fix**: `computeTemperature()`/`simulateWeather()` each gained the SAME family-invalidation line
  `computeFlow()`/`generate()` already use (copied verbatim rather than hand-trimmed — an earlier,
  narrower attempt at this fix nearly shipped without `_landformF`/`_lithField`, both of which turned
  out to depend on `rainField` transitively; the verbatim, already-vetted list is safer than
  re-deriving it by inspection). `currentFloodField`/`currentWindThrowField`'s keys now read
  `_fieldGen`(`,_climGen` for the wind-throw one) instead of `state.tect.seed`.
- **Bundled, low-risk optimization**: `buildWindThrowField` (Wind-Throw-Risk debug view) now reuses
  the already-cached `buildBiomeRaster()` instead of independently re-running `classifyBiome()` per
  cell — removes redundant work and fixes a real disagreement it surfaced: a mountain lake (above sea
  level, so the old `vw<sea` guard didn't skip it, but classified as water by
  `currentWaterBodies()`) was misclassified via raw temp/rain as an ordinary forest/land biome instead
  of reading as water, disagreeing with the biome raster used everywhere else.
- **A caching approach considered and deliberately NOT taken**: adding a version-keyed cache to
  `currentWindField()`/`currentOceanField()` (the Wind/Ocean debug-view functions), the only
  `current*Field()`-style accessors in the file with *no* caching at all. Investigated because it
  looked like the same missing-cache pattern — but unlike their siblings, these two recompute their
  own `tSea` proxy **directly from live `state.climate`/`state.planet` values** (via
  `climEffectiveEquatorTemp()`), not from the cached `tempField` array, which is *why* they currently
  update instantly while dragging the axial-tilt/rotation sliders. A `_fieldGen`/`_climGen`-keyed
  cache would have **reintroduced** a staleness bug — losing that live reactivity until the next full
  climate recompute — trading one correctness bug for another. Left uncached; disclosed here instead
  of shipped as a plausible-looking regression.
- **Every fix verified by direct reproduction, not just static reasoning**: a Playwright probe
  confirmed, on v1.85, that a drastic climate swing (`equatorTemp` 30→5, `poleTemp` −25→−45) followed
  by `simulateWeather()` left `currentCarryingCapacity()`/`buildBiomeRaster()`/`currentWindThrowField()`
  completely unchanged; on v1.86 the identical scenario shows a real, substantial change in all three
  (carrying capacity summed 357.26→279.43 on the reference seed). A second probe confirmed
  `currentFloodField()` was frozen across a same-seed terrain edit (`computeFlow()`-triggering, the
  exact shape `sculptCommit()` uses) on v1.85 and correctly responds on v1.86.
- **Tests**: 1017/1017 `tests/run.sh` (bit-identical at defaults), 852/852 `tests/run_um.sh` (block 4
  untouched — this pass is entirely block 1), `hash_gen1.js` v1.85→v1.86 ALL IDENTICAL across every
  scenario, 7 new smoke assertions (`R.v186`) — each reproducing one of the direct-repro probes above
  as a permanent regression check, plus explicit "leaves no trace" restoration checks (mutating
  `state.climate`/`field[]` mid-suite without breaking a later, unrelated test — the exact
  test-isolation trap this same session's own v1.85 `R.v185` test hit once already and had to fix,
  deliberately avoided here from the start by never touching `GW`/`resW`/`allocate()`).
- **A second, unrelated finding surfaced only while verifying the new tests, not shipped as part of
  this fix: `computeFlow(true)` is not idempotent across two calls even when `field` ends up
  bit-identical before each one.** Discovered chasing a genuinely confusing smoke-suite failure (the
  pre-existing v1.78 "`refreshClimate()` is deterministic" check started failing only when the new
  `R.v186` test ran immediately before it) — root-caused, with a Playwright A/B, all the way down to
  `computeFlow`'s own accumulation/seeding, and confirmed to reproduce IDENTICALLY on unmodified
  v1.85 (so it predates this version, isn't a v1.86 regression, and isn't touched by any v1.84–v1.86
  fix). Measured directly: carve a depression into `field`, run `computeFlow(true)`, restore `field`
  to its exact prior bytes, run `computeFlow(true)` again — `flowField` differs by a mean of ~0.86
  per cell from a version that never had the depression carved at all, despite `field` itself
  measuring bit-identical before each call. **Not fixed this pass** (out of scope for a test-harness
  fix, and a real engine-level finding deserves its own dedicated look rather than a rushed
  drive-by) — `R.v186`'s own terrain-edit sub-test was rewritten to restore `field`/`flowField`
  directly via `.set()` instead of re-running `computeFlow()` to "undo" the edit, sidestepping the
  need for that idempotency rather than depending on it. Flagged in `docs/HANDOFF.md`'s Next/open
  section for a future pass — worth investigating given it implies a real sculpt-edit-then-undo in
  the live app could leave `flowField` (and everything downstream of it: rivers, settlement
  suitability, resources) subtly different from a "never touched" world, not just the debug-view
  staleness this version's main finding covers.
- **Known scope cuts**: the `currentWindField`/`currentOceanField` caching question (see above,
  deliberately deferred, not silently dropped); this pass covers block 1 (engine/climate caches)
  only — a civ-layer (block 2) or render-hot-path (LOD compositor, already extensively tuned in
  v0.93/v1.22/v1.74) audit was not attempted this pass, since the climate-cache finding was
  substantial enough on its own to verify thoroughly rather than spreading effort thin across
  multiple unrelated subsystems.

### v1.85 — Ocean heating grounded in axial tilt + rotation (a real solar-energy budget); confirms climate→rendering interconnection

Owner: *"For the climate modeling, now that water and wind are influenced by topology I want to make
sure this all interconnect to map rendering aswell. (so rainfall etc should be informed by it) we
also have sliders for gravity, axial tilt and how long days are on the world all these things inform
how much energy a sun sets in a world and how much it keeps (eg. The heating if the ocean and flow of
it are influenced) let's always assume a sun like star and quantify this in a simple way. All I want
is that the heating of the ocean and resulting ocean currents and subsequent wind are all based in
grounded values."* Engine (block 1). Full design/derivation/measurements:
`docs/research/solar-energy-budget.md`.

- **Part 1 (measurement, no code): confirmed the terrain-coupled wind/current work already reaches
  map rendering.** `simulateWeather()` — the actual rain-producing pass — calls `oceanSSTAnomaly()`
  (which calls `computeOceanCurrent()`, the v1.82 heat-driven-bend current field) *before* building
  its own wind field, and folds the SST anomaly into the sea temperature that drives `buildWind`'s
  pressure gradient. `docs/research/system-coupling-audit.md`'s documented "Loop 2," shipped since
  v0.067, reinforced (not newly built) by this session's own v1.77–v1.82 work.
- **Part 2 (the real gap): the base equator-pole temperature gradient — `tSea = poleTemp +
  (equatorTemp−poleTemp)·shape(lat)`, independently reimplemented at six JS call sites plus the GPU
  shader's `uEqT`/`uPoT` uniforms — was completely unconnected to `state.planet`'s gravity/axial-tilt/
  rotation sliders**, even though those sliders already drive real physics elsewhere
  (`circulationCells()`'s cell count, `buildWind`'s Coriolis term, `computeTemperature`'s g-scaled
  lapse rate, the seasonal declination shift). This is the value that actually sets the ocean's SST
  baseline feeding the loop confirmed in Part 1, so it's the correct, narrow target.
- **Axial tilt → `insolationContrastK()`**: the 2nd-order (Legendre P₂) energy-balance-model
  approximation of annual-mean insolation vs. latitude/obliquity (North & Coakley 1979). The
  equator-pole contrast coefficient `s2(ε)=3sin²ε−2` is negative for Earth-like tilt, crosses zero at
  the real, documented critical obliquity **ε=arccos(1/√3)≈54.7356°** (Rose, Cronin & Bitz 2017, *ApJ*
  846:28 — the tilt past which a planet's annual-mean insolation gradient reverses and poles receive
  more sun over a year than the equator), and is positive beyond it. Normalized to 1.0 at this file's
  own 23.4° Earth default. The UI's own tilt slider caps at 45°, short of the reversal — a real,
  meaningful, monotonic, correctly-signed adjustment (K≈1.31 at 0°, K≈0.33 at the 45° cap) across the
  slider's entire reachable range.
- **Rotation (day length) → `rotationContrastK()`**: a slower rotator's weaker Coriolis constraint
  permits more direct meridional overturning, transporting heat poleward more efficiently and
  flattening the gradient (the qualitative direction reported for slow planetary rotators in
  circulation studies, e.g. Merlis & Schneider 2010; the same direction already motivates
  `circulationCells()`'s "slow rotators collapse to one giant Hadley cell"). Reuses the SAME
  Ω=24/rotationHours already driving `circulationCells()` and `buildWind`'s Coriolis term — not a new,
  unrelated constant — raised to a small, disclosed, not-independently-fitted exponent (0.25).
- **Gravity deliberately gets no additional direct term.** Its established roles are already
  implemented (lapse rate Γ~g since G1; circulation-cell count/Coriolis strength via
  `circulationCells()`'s √g term) — a further direct gravity→ocean-heating link has no equally simple,
  equally citable closed form without inventing an atmosphere-composition model this tool doesn't
  have. Left alone and disclosed, not padded with an invented formula.
- **One function, seven call sites redirected**: `climEffectiveEquatorTemp()` centralizes
  `poleTemp + (equatorTemp−poleTemp)·insolationContrastK()·rotationContrastK()`; every one of the six
  duplicate `tSea`/`tSeaAt` formulas (`computeTemperature`, `oceanSSTAnomaly`, `simulateWeather`,
  `computeTempInto`, `currentWindField`, `currentOceanField`) plus the GPU shader's `uEqT` uniform now
  read it instead of raw `state.climate.equatorTemp` — one source of truth instead of this file's own
  repeatedly-diagnosed "N functions answering one question" drift. The GPU shader itself needed no
  GLSL change — it already computes `tSea` from its uniforms, so passing an already-scaled `uEqT`
  produces the identical grounded result.
- **Both multipliers are exactly 1.0 at Earth defaults (g=1, 24h, 23.4°) by construction** — the
  CLAUDE.md bit-identical invariant holds without a special-cased branch. Verified directly:
  `node tests/perf/hash_gen1.js v1.84 v1.85` → **ALL IDENTICAL** at defaults, across every scenario.
- **Measured live, end-to-end**, not just correct in isolation: a real `generate()`+`refreshClimate()`
  at max tilt (45°) drops mean tempField from 14.9°C (defaults) to −16.2°C, in the predicted
  direction and a magnitude consistent with the pure-function calculation; zero tilt raises it to
  29.2°C; slow rotation (96h) cools to 1.4°C, fast rotation (6h) warms to 34.1°C. `currents=true` vs
  `currents=false` at max tilt still shows the expected small SST-anomaly perturbation riding on top
  of the new, much larger grounded baseline — the pre-existing ocean-current toggle keeps working
  correctly on the new foundation.
- **Tests**: still 1017/1017 on `tests/run.sh` (bit-identical at defaults, confirmed by both the
  headless suite and a targeted `hash_gen1.js` A/B); 852/852 `tests/run_um.sh` (block 4 untouched); 6
  new smoke assertions (`R.v185`) — defaults-are-exactly-1, the critical-obliquity zero-crossing
  matches the documented value, tilt/rotation monotonicity across the UI's own slider ranges, and a
  live `generate()` divergence check.
- **Known scope cuts**: no new stellar-type slider (Sun-like/G-type assumed throughout, per the
  owner's own framing); no absolute top-of-atmosphere energy quantity (W/m², total absorbed power) is
  computed or exposed — this tool has no albedo-integral/atmosphere-composition model to make one
  meaningful, so the grounding is specifically the equator-pole insolation *contrast*, the one
  quantity the existing temperature model actually uses; gravity gets no new direct term (disclosed
  above); **not** bit-identical away from Earth defaults — any world with non-23.4° tilt or non-24h
  day now has a deliberately, measurably different temperature/rainfall/ocean-current baseline than
  v1.84 produced for the same seed, the same class of disclosed re-baseline as v1.36/v1.60.

### v1.84 — Journey Planner: water only counts as carried weight in arid biomes

Owner: *"For the travel planner I thimk water should only become an actual weight in arid
biomes/climates (when there is little rainfall or just little available water) for other journeys it
should technically not be counted. Water is usually abundant and always collectable in meaningful
quantities."* Civ-layer only (`jpCapacity`/`jpCalcLand`/`jpAutoPickTransport`/`_jpPlan`). Hash vs
v1.83 **ALL IDENTICAL** — the Journey Planner is interactive-only, never reached from `generate()`'s
own pipeline.

- **Root cause: humans already carried water everywhere, just less of it outside a desert.**
  `humanWaterCarryDays` was `biome?.desertLike ? min(supplyDays,4) : min(supplyDays,2)` at three
  independent call sites — a non-desert biome still silently carried 2 days of water as mass.
  Animals already had this right (`animalWaterCarryDays` was already `desertLike?...:0`) — humans
  never matched. `desertLike` (Hot Desert / Cold Desert-Badlands only, of 12 `JP_BIOMES`) is this
  file's existing, already-per-biome aridity signal — the natural gate for the new rule.
- **New shared helper, three duplicate sites redirected**: `jpHumanWaterCarryDays(biome,supplyDays)`
  returns `desertLike ? min(supplyDays,4) : 0`, called from `jpCapacity` and both
  `jpAutoPickTransport` branches (Walking, Baggage Train) instead of each reimplementing the same
  ternary — the exact "N functions answering one question" pattern this file's own CLAUDE.md flags
  repeatedly (v1.30/v1.32/v1.35/v1.72/v1.75).
- **`jpCalcLand`'s convergence-loop `waterNeeded` term is now `isDesert ? (...) : 0`** — outside a
  desert biome, water contributes zero mass to the load regardless of how severe the stage's own
  measured dry run (`dryKm`/`waterGapDays`) happens to be. This **reverts v1.56's "the AUTO
  water-crossing tier applies to any biome, not just desert" widening** back to desert-only, per this
  direct new owner instruction — a deliberate revision of a prior version's own design decision, the
  same class of change as v1.63's revision of v1.56's Small-Caravan bonus.
- **Consistency sweep, not just the headline term**: `jpAssessResupply`'s `dryKm`/`waterGapDays`
  arguments are gated to `0`/`Infinity` for a non-desert stage at all three call sites, so a
  non-desert overload can never be mislabeled `cause:'water'`; the hard-block message wording forks on
  `isDesert` ("Carrying enough water..." vs "Supplies for this stretch..."); the formula trace's water
  line now reads `assumed abundant in this biome — not counted as carried weight` for non-desert
  instead of a raw (and now-meaningless) dry-run distance; the Info panel's "Water" finding
  (`worstDry`) is filtered to `isDesert` stages only; and `_jpPlan`'s route-summary `waterL` total —
  which reads `cap.humanWaterRate` **directly**, not through the gated `cap.breakdown.humanWater` —
  gets its own explicit `isDesert` check, the one site that would have silently kept reporting a
  non-zero water figure for a non-desert stage otherwise.
- **`jpCalcWater` (sea/river vessels) is deliberately untouched** — a ship's hold mid-passage cannot
  detour to a stream the way a land party can, a genuinely different physical reality, so vessels keep
  carrying real potable water regardless of the land biomes they pass.
- **Desert-stage behavior is byte-identical to v1.83** throughout, by construction — every gated
  branch reduces to its old formula exactly when `isDesert===true`.
- **Tests**: 3 of `R.v156`'s 8 existing smoke assertions rewritten to assert the reverted, desert-only
  behavior instead of the widened one (the other 5 — the drinking-flow divisor, the explicit-override-
  stays-desert-only case, and the genuine-desert-stage regression checks — were already correct and
  untouched) + 8 new smoke assertions (`R.v184`) — zero water weight for a non-desert
  biome vs. real water for desert, capacity itself unaffected by biome, the animal-count solver still
  runs cleanly, the convergence loop's zero-water claim, the trace's "assumed abundant" wording, the
  desert trace staying real, and the route-summary `waterL` fix specifically.
- **Known scope cuts**: no new UI control — the change is a modeling-assumption revision, not a new
  toggle; `desertLike` (Hot Desert / Cold Desert-Badlands) remains the sole aridity signal — a
  biome-level rainfall/moisture threshold was considered and rejected as an unrequested, much larger
  redesign of `JP_BIOMES`.

### v1.83 — A Mounted Rider party's own mounts now carry saddlebag capacity

Owner pasted a real Journey Planner route with several `⛔ Carrying enough water for this stretch
pushes the load to...` blocks (up to 3659% over capacity) and one `⛔ Overloaded 167% of
capacity (500 kg carried vs 300 kg rated)` block, asking *"Can you see what needs fixing?"*
Civ-layer only (`jpCapacity`). Hash vs v1.82 **ALL IDENTICAL** — the Journey Planner is
interactive-only, never reached from `generate()`'s own pipeline.

- **Diagnosed, not assumed.** The reported 300 kg capacity is exactly `10 people ×
  JP_HUMAN_PORTER(30kg)` — a "Mounted Rider" party got **zero extra capacity credit from actually
  being mounted**, identical to a Walking party of the same size. The only way to credit a mount's
  own carrying capacity was to separately re-declare the SAME animal in the Animals section
  (`plan.animals`) — a convention that already existed but only implicitly, via the "Lone courier"
  preset's own shape (`transport:"Mounted Rider", mountAnimal:"horse", animals:{horse:1}`),
  never documented and never applied automatically for a hand-configured party.
- **A real horse can carry saddlebag cargo beyond the flat porter rate** — this is a genuine
  capacity-model gap, not the extreme-desert-crossing scenario v1.81 already scoped and correctly
  leaves blocked (foraging alone, capped ~50%, was never meant to rescue a >150%-over-capacity
  crossing; that ceiling, `JP_LOAD_INVALID_RATIO`, is untouched by this fix).
- **`jpCapacity` gains `mountCredit`**: for a `transport==="Mounted Rider"` party,
  `Math.max(0, people − plan.animals[mount]) × JP_ANIMALS[mount].cap × JP_MOUNT_SADDLEBAG_FRAC`
  (0.3, a reasoned estimate — rider + tack already claims most of a mount's real carrying margin,
  disclosed as un-sourced, the same class of constant as `PORT_PREFERENCE_MULT`/
  `FEATURE_RADIUS_MAX_FRAC` elsewhere in this file). The `max(0, people − declared)` term is what
  prevents double-counting: a rider whose mount is ALSO already declared as a full pack animal
  (the "Lone courier" preset's own shape) gets zero extra credit for that mount, since it's already
  earning the full `ac(mount)` pack-animal rate. A partial declaration (some riders' mounts
  declared, others not) blends both credits correctly.
- **Verified against all four shapes, not just the happy path**: the reported 10-rider case
  (300kg → 660kg, `mountCredit=360`); a Walking party of identical size/cargo (completely
  unaffected, still 300kg — the credit is Mounted-Rider-only); the "Lone courier" preset itself
  (`mountCredit=0`, capacity unchanged at 138kg — no double-count regression on the one existing
  configuration that already relied on the old convention); and a partial declaration (4 of 10
  horses also declared as pack animals: 4 full pack credits + 6 riders' worth of saddlebag credit,
  never 10 of either alone).
- **This does NOT rescue a genuinely extreme water-driven overload** — verified directly: a
  400 km waterless desert crossing for the same 10-rider party still correctly blocks with
  `⛔ Carrying enough water...`, just measured against the new, larger (660kg) capacity baseline.
  The fix helps a real capacity-model gap; it does not, and should not, make an unsurvivable
  crossing survivable.
- **A test-writing mistake caught before shipping, not after.** The first cut of the smoke
  assertion for the extreme-overload case passed plan fields directly on the object given to
  `_jpEnsurePlan(jn)`, which actually expects journey-level fields on `jn` and plan fields nested
  under `jn.plan` — the mismatch silently defaulted `transport` back to `"Walking"` (derived from
  `jn.sea`), so the test wasn't exercising a Mounted Rider party at all. Caught by directly
  inspecting the returned plan's `transport` field rather than trusting the assertion result;
  fixed by following the file's own established call convention (`_jpEnsurePlan(jn)` then
  `Object.assign(p, {...})`, the same pattern already used at several existing call sites).
- **Tests**: 6 new smoke assertions (`R.v183`) — the reported case's exact before/after capacity
  numbers; Walking-party non-interference; Lone-courier zero-double-count; partial-declaration
  blend arithmetic; the extreme-overload case still blocks with the water-specific message.
- **Known scope cuts**: `JP_MOUNT_SADDLEBAG_FRAC=0.3` is a reasoned estimate, not independently
  historically sourced; no UI change (no new field, no display line — the credit flows through
  purely via the existing `cap.capacity`/block messages); mount credit is Mounted-Rider-only —
  Baggage Train's own pack-animal accounting is untouched and was already correct.

### v1.82 — Ocean current direction becomes heat-driven, not just wind-derived; slower streak animation

Owner: *"For the ocean flow and heat distribution I think you should check how heat in an ocean
originates and how flow direction is dictated by it. At the moment it just seems to base itself
from right to left. (And slow down the arrows from the current animation speed by about 65%)."*
Engine only (block 1, `computeOceanCurrent` + `_windFxStep`). **Not** bit-identical at defaults —
a deliberate, measured re-baseline (same class as v1.36/v1.39/v1.46/v1.60/v1.78) because
`state.climate.currents` is `true` by default (v0.80) and the SST anomaly it computes feeds
`tempField`/`rainField` inside `refreshClimate()`, which downstream `carveRiverValleys()` carves
into `field` — so `field`/`flow` legitimately differ too, not just `temp`/`rain`/`rgba`. 1017 / 852
green; hash vs v1.81 diverges on every scenario; **isolated and proven scoped**: with
`state.climate.currents=false` on both sides, `field`/`temp`/`rain`/`flow` are ALL IDENTICAL —
confirming the divergence originates entirely inside the ocean-current pipeline and nowhere else.

- **Measured before designing anything.** A live-world probe (`probe_ocean_current.js`) sampling
  `currentOceanField()` at seed 12345/512px found the meridional (heat-carrying) current component
  was set SOLELY by Ekman-rotating the latitude-band wind — **zero dependence on where a cell sits
  within its own ocean basin**. In the equatorial trade band, 93.9% of ocean cells showed net
  poleward flow and only 4.7% equatorward; the measured SST anomaly ranged only −0.06 to 0.7 (a
  cold anomaly was essentially never present). This directly contradicts the file's own long-
  standing docstring claim ("poleward flow carries warm water... equatorward flow carries cold
  water... e.g. Benguela/Peru") — the mechanism to produce that two-limbed pattern never existed;
  only a uniform, latitude-band-wide drift did. That uniform zonal dominance, un-varying across an
  entire visible ocean, is exactly what reads as "just goes right to left."
- **Root cause: heat (SST) was a pure OUTPUT of current direction, never an input to it.**
  `oceanSSTAnomaly` derives its warm/cold sign from `computeOceanCurrent`'s own `v` component
  after the fact — nothing in the reverse direction (real basin-position-dependent heat transport)
  ever fed back into which way the current itself turns. Real subtropical gyres exist because
  wind-driven Sverdrup transport piles warm surface water against a basin's WESTERN edge;
  geostrophic balance turns that pile-up into a fast, narrow POLEWARD current (Gulf Stream/
  Kuroshio/Agulhas) — the actual physical mechanism that carries equatorial heat poleward. A
  basin's EASTERN edge instead sees persistent offshore Ekman transport draw cold water up from
  depth (the real Peru/Benguela/California/Canary upwelling systems), whose broader, slower
  geostrophic return flow runs EQUATORWARD.
- **Fix: a western/eastern-boundary bend inside `computeOceanCurrent`'s existing western-
  intensification pass**, reusing the EXACT west/east coastal-distance proximity weights the
  pre-existing speed boost already computes (`wBend`/`eBend`, peak at their own coast with open
  ocean beyond, ~0 everywhere else) — no new full-grid pass. `poleSign` is sampled directly against
  `latOf` per row (not assumed), so it holds under both World mode's north-pole-at-y=0 convention
  and a custom Region-mode `latN`/`latS` ordering. The bend adds `poleSign·bendK·(wBend−0.45·eBend)
  ·|v|` to the meridional component only — **the zonal (east-west) component is untouched by
  construction**, asserted directly. The eastern bend is deliberately weaker (0.45×) and more
  coast-hugging than the western one, matching how much narrower real eastern boundary currents
  are than western ones.
- **Re-measured, and the improvement is real but the right statistic matters.** A first assertion
  design checked whether the single COLDEST pixel got colder with the bend on — it got LESS
  extreme (−1.92 → −0.91 on the reference seed), which looks like a regression but isn't: the bend
  can partially cancel an already-extreme baseline value at one specific outlier cell without that
  being representative of the overall distribution. The robust, aggregate statistics tell the real
  story: mean-absolute SST anomaly across the whole ocean **0.204 → 0.511** (2.5×), and the
  fraction of ocean cells showing a genuine cold anomaly **4.5% → 19.2%** (4×) — a real,
  substantial two-sided signal where before there was almost none. Single-pixel extrema are noise;
  whole-ocean aggregates are the trend — the same "test the aggregate, not the outlier" lesson this
  file has learned before, applied here to a flow field instead of a placement score.
- **windFx particle speed** (owner: *"slow down the arrows... by about 65%"*): `_windFxStep`'s
  per-tick advection multiplier `0.9 → 0.315` (35% of the original rate), a direct, literal
  reading of the request. Verified against the REAL shipped function (not a reimplementation): rAF
  is intercepted so exactly one real `_windFxStep()` call can be driven and its actual displacement
  compared to what the old and new multipliers would each predict from the same sampled `(u,v)` —
  measured ratio 0.37 against a predicted 0.35 on a held-fixed field (the small residual is a
  second-order path-divergence effect of a slower particle sampling a shorter, more locally
  homogeneous stretch of flow, not a bug).
- **A test-isolation bug found and fixed during verification, not shipped as a false regression.**
  The new windFx-speed smoke assertion armed the Ocean debug view and started the particle loop
  directly (bypassing a real `#debugSeg` click, to control the step count precisely) but didn't
  restore `state.debug`/stop the loop afterward — leaking state into the pre-existing v1.78
  assertion block that runs later in the same sequential suite and asserts the canvas starts
  HIDDEN before it clicks anything. Fixed by resetting `state.debug='off'` and calling
  `_windFxSync()` at the end of the new block — the same "restore ambient state you changed"
  discipline this file's own CHANGELOG has hit before (v1.24 BUG-3, v1.78's fuel-limited-settlement
  fix).
- **Tests**: 12 new smoke assertions — the bend leaves `u` bit-identical (ablation via
  `computeOceanCurrent`'s own `opts.bendK`, the same on/off technique v1.46/v1.62 already use); the
  bend genuinely activates on a real fraction of this world's ocean cells; mean-absolute SST
  anomaly and cold-cell fraction both increase with the bend on; the windFx displacement ratio
  matches the new multiplier's prediction, not the old one's.
- **Known scope cuts**: `bendK=0.9`/the `0.45` eastern-weakening factor are reasoned estimates in
  the spirit of the file's existing `PORT_PREFERENCE_MULT`/`FEATURE_RADIUS_MAX_FRAC` class of
  un-tuned constants, not independently calibrated against a real gyre-strength figure; this is
  still a heuristic distance-to-coast proxy for western intensification (as the file's own v1.77
  docstring already discloses), not a solved beta-plane/Sverdrup model; thermohaline (deep, salinity
  -driven) circulation remains entirely out of scope, as it always has been — this is a surface,
  wind/heat-proxy current model throughout.

### v1.81 — Wildlife-informed foraging extends the water/food range, not just the food range

Owner: *"any journey is only factually limited by the longest distance one is able to travers
with the resources they can carry... This makes things like water and food less of a constraint
that creates an impossibility on a journey. Surplus the foraging along a route and how 'rich' a
route is... we already have fauna information and therefore a good idea about how foraging could
extend a route/travel distance (if you can hunt a deer you clearly get more calories than when
you're in a desert and have to hunt snakes and hope your portable dew trap gets you enough
water)."* Civ-layer only (`JP_BIOMES`, `jpForaging`, `_jpDeriveStages`, `jpCalcLand`). Hash vs
v1.80 **ALL IDENTICAL** (default/geoid/waves/ao/icons) — the Journey Planner is interactive-only,
never reached from `generate()`'s own pipeline.

- **Measured before designing anything, and the first hypothesis was only half right.** A broad
  sample across real routes/presets on two generated worlds (`probe_jp_impossible.js`/
  `probe_jp_impossible2.js`) found block rates dominated by legitimate terrain-legality (wheels on
  swamp) and a Foot-traveller preset whose own cargo exceeds its own rated capacity every stage —
  water was RARE in that broad sample, not the dominant cause the owner's report implied. But a
  TARGETED synthetic sweep (`probe_jp_drygap.js`, a well-provisioned 10-camel caravan) found the
  real cliff: past ~150-200 km of waterless desert, `jpAssessResupply`'s hard block fires with zero
  elasticity — 269%/387%/506% over capacity at 200/300/400 km, "no party departs," binary. A
  well-provisioned party crossing a genuinely rich biome had no lever to pull at all. Confirms the
  owner's report was about a real, if narrower-than-first-assumed, mechanism.
- **`jpForaging()` already reduced carried FOOD need and had for versions — but nothing analogous
  touched WATER, and the food term itself only read a flat per-biome-category constant, not the
  real per-region wildlife data `currentWildlife()` already computes** (species richness + trophic-
  cascade biomass from a real NPP model, memoized). Both gaps are exactly what the owner's own
  framing points at ("we already have fauna information"). Two genuine design forks, both put to
  the owner via `AskUserQuestion` before building: **(1)** extend the existing Foraging dropdown
  (chosen) over a new separate control or a fully-automatic mechanism; **(2)** wire in real
  `currentWildlife()` data (chosen) over refining the static per-biome table alone.
- **`JP_BIOMES` gains a new `waterForage` column**, deliberately much smaller than the existing
  `forage` column and steeply biome-dependent — true desert (Hot Desert 0.01, Cold Desert/Badlands
  0.02) is near-zero on purpose (a dew trap barely helps there, the owner's own example), wetlands/
  jungle are the richest (Wetlands 0.22, Tropical Jungle 0.20).
- **`_jpWildlifeForageMod(mx,my)`** (new, pure) samples `currentWildlife()`'s per-cell `regionId` →
  `region.richness` at a real stage coordinate and compares it to the WORLD's own mean richness —
  never an absolute richness cutoff. The same "compare to the world's own mean, never a fixed
  number" discipline this file has re-learned repeatedly (v1.25 sea-level histogram, v1.30/v1.31/
  v1.34/v1.37/v1.46/v1.55/v1.58 suitability/archetype/trade thresholds) — the ninth-plus occurrence.
  Defaults to `1.0` (no-op) whenever position or wildlife data is unavailable, clamped to
  `[0.5, 1.8]` so a richness outlier can't blow the food term up or down unreasonably.
- **`jpForaging(mode,biomeKey,terrain,season,people,mx,my)`** gained two optional trailing
  parameters (v1.20's `opts.tempField`/`opts.wetlandMask` precedent: an optional, gracefully-
  omittable trailing arg, never a required signature change) and now returns a `waterReduction`
  field alongside the existing `reduction`/`move`. The food term is multiplied by
  `_jpWildlifeForageMod` when a coordinate is supplied (a real richness signal replacing the flat
  table); the new water term uses `waterForage` directly (deliberately NOT modulated by wildlife
  richness — fauna abundance is a food proxy, not a water proxy; water access is already covered
  by real hydrology via `_jpStageDryKm`, this term covers only the small biome-climate residual
  beyond that). Both cap below 1.0 (food ≤0.95, water ≤0.50) — foraging reduces need, it never
  eliminates it.
- **`_jpDeriveStages`** now records each finalized stage's own midpoint map coordinate (`c.mx`/
  `c.my`) alongside the existing `dryKm`/`infra`, so `jpForaging` can sample the stage's ACTUAL
  fauna richness instead of only the flat per-biome table.
- **`jpCalcLand`'s convergence-loop water term** (`waterNeeded`) now multiplies by
  `(1 - forage.waterReduction)`, exactly mirroring how the food term already discounted
  `humanFoodNet`. The formula trace gained a line disclosing the offset ("foraging offsets NN% of
  carried water need") whenever it's non-trivial, matching this planner's existing
  show-your-work convention (v1.49's `_jpVerdict`/`_jpConfidence`, v1.51's `_stageTrouble`).
  `plan.foraging="None"` (the default, most common case) is an exact no-op — asserted bit-identical
  to pre-v1.81 regardless of position or wildlife data.
- **A real, disclosed finding: Active foraging's SPEED cost can outweigh its consumption benefit
  on a single, already-marginal carry stretch.** `JP_FORAGING['Active'].speedMod` slows travel,
  which — on a stage whose carry interval is capped by the stage's own duration rather than a
  shorter resupply stop — directly increases the one-time mass that must be carried, sometimes by
  more than the foraging discount saves. Measured directly (`probe_jp_forage_effect2.js`): in
  several tested scenarios, switching Foraging from None to Active INCREASED the load-ratio
  percentage rather than decreasing it. Re-ran the identical scenario against v1.80 (before any of
  this version's changes existed) and found the SAME qualitative pattern already present, at equal
  or worse magnitude (e.g. Tropical Jungle/150km: v1.80 delta +244pp vs. v1.81 delta +149pp) —
  proving this is a pre-existing characteristic of the speed/consumption tradeoff, not something
  introduced this version, and that this version's water-foraging term measurably IMPROVES the
  outcome in every comparable case without fully resolving the deeper tension. **Not fixed this
  pass** — retuning `JP_FORAGING` speed multipliers or the day-count/interval-capping logic is a
  materially larger, riskier change than what was asked for and confirmed via the two
  `AskUserQuestion` answers above (which were specifically about extending Foraging to cover water
  and using real wildlife data, not about retuning the pre-existing speed-cost model). Disclosed
  here rather than silently left for a future session to re-discover, per this file's own
  "never let a found-but-out-of-scope issue go unmentioned" discipline.
- **UI**: the Foraging dropdown label gained a `title` tooltip explaining it now reduces both
  carried food AND carried water, with the food term scaled by the world's own real fauna richness
  along the route and the water term a much smaller, steeply biome-dependent offset.
- **Tests**: 8 new smoke assertions (`R.v181`) — `waterForage` exists and true desert reads far
  smaller than a wet biome; `foraging="None"` is an exact no-op regardless of position; Active
  foraging genuinely reduces carried water need in a real biome; true desert's water offset is far
  smaller than a lush biome's; the water offset is deliberately smaller than the food offset; a
  real generated+auto-populated world was built and `currentWildlife()` is reachable; real route
  stages carry a real `mx`/`my`; the wildlife modifier is genuinely reachable end-to-end on a live
  world (not just in isolation) and produces varying, non-trivial values.
- **Two pre-existing, environmental smoke-suite failures observed during verification, confirmed
  unrelated.** `v0.92 follow-up fix: overview canvas is capped at 512px wide...` and `v0.87:
  LOD/atlas mode fills the viewport...` both failed on this run — but re-running the identical
  suite against UNMODIFIED v1.80 reproduces the exact same two failures, proving they are
  pre-existing environmental flakiness in this headless-Chromium harness (unrelated to any
  civ-layer or Journey Planner code, and touched by nothing in this version). Left alone —
  investigating flaky canvas-sizing assertions unrelated to foraging is out of scope for this pass;
  disclosed here rather than silently ignored.
- **Known scope cuts**: the Active-foraging speed/consumption tension above (found, not fixed);
  `waterForage` values are reasoned per-biome estimates in the spirit of the existing `forage`
  column, not independently historically sourced per biome; the wildlife richness modifier only
  scales the FOOD term, never water (a deliberate choice, not an oversight — see above); no UI
  surfaces the wildlife-informed modifier's actual value to the user (it's applied silently inside
  the calculation, same as the existing flat-table `forage` term always was).

### v1.80 — Wind/current streak animation never actually rendered (inline style vs. stylesheet)

Owner: "No animation in the flow layers." Engine only (block 1, `_windFxStart`). Hash vs v1.79 ALL
IDENTICAL — the bug lived entirely inside an interactive-only function never reached from
`generate()`.

- **Root cause, confirmed by real-screenshot frame-diffing before touching any code.** The v1.78
  streak feature's `_windFxStart()` set `windFxCanvas.style.display=''` expecting that to reveal
  the canvas — but the CSS rule `#windFxCanvas{...;display:none}` in the stylesheet ALREADY sets
  `display:none`, and clearing an element's *inline* style to `''` does not override a stylesheet
  rule, it just falls back to it. So the canvas box stayed 0×0 on screen every time, while the
  particle loop underneath ran completely correctly (spawned particles, advected them, no errors)
  — animating into an invisible element. Confirmed with a Playwright probe capturing 5 consecutive
  animation-frame screenshots: zero byte-diff across all of them pre-fix (`windFxCanvas box:
  {width:0, height:0, display:"none"}` even with `_windFxRunning:true`); after the fix, the same
  probe shows a correctly-sized box and ~90-95k bytes of diff per frame pair (particles genuinely
  moving), on both the Wind and Ocean views.
- **Fix**: `windFxCanvas.style.display='block'` — an explicit value, the same idiom every other
  CSS-default-hidden element in this file already uses to reveal itself (e.g. v0.67's
  `view3d.style.display='block'`).
- **The real test gap, not just the bug.** The v1.78 smoke assertion for this exact behaviour
  checked `cv.style.display !== 'none'` — the INLINE style, which read `''` after the buggy code,
  and `'' !== 'none'` is `true`, so the assertion passed while the animation was genuinely broken.
  Rewritten to check `getComputedStyle(cv).display`, the only property that actually reflects
  on-screen visibility — this is what should have caught the v1.78 bug and will catch a recurrence.
- **Tests**: no new assertion count change — the existing `R.v178fx` block (4 assertions) was
  corrected in place rather than duplicated, since it already covered exactly this behaviour and
  simply asked the wrong DOM question.
- **Known scope cuts**: none — a single, fully root-caused, fully verified display bug.

### v1.79 — Addon villages now cluster with nearby siblings (growing-forest connector rebuild)

Owner, mid-session right after the v1.78 climate work was requested: "the roads from the deeper
settlement layers dont connect to their nearest siblings and individually connect to the closest
big settlement. They probably just connected to the closest main road by the most efficient
route." Civ-layer only (`_civConnectVillageAddons`). Hash vs v1.78 **ALL IDENTICAL** (default/
geoid/waves/ao/icons) — this function is interactive-only, never reached from `generate()`'s own
pipeline.

- **Measured before writing any fix** (`probe_villageconn.js`, seed 31337/512px, 200 villages):
  v1.71–v1.78's target set was `places.filter(p=>!p.villageAddon)` — every village's search could
  ONLY terminate at a real settlement, never another village, exactly the reported behaviour. Mean
  connector length 21.8 km vs. mean nearest-SIBLING distance 14.0 km; **79.5%** of villages had a
  nearer sibling than the settlement they actually connected to; 33.5% had a sibling at under half
  that distance.
- **Three designs were weighed and put to the owner via `AskUserQuestion`** before building: (1) a
  single-shot Dijkstra seeded with both settlements AND villages as valid targets (simplest, but no
  guarantee a village cluster's chain ever reaches a real settlement); (2) tapping a connector into
  the nearest existing ROAD point instead of a settlement pin (shortest connectors, but reintroduces
  the exact v1.71 self-loop shape — a bare road junction isn't a graph vertex — and doesn't address
  the actual complaint, which is about siblings, not roads); (3) a genuine growing forest
  (Prim-style). **Growing forest chosen** — the only option that lets a village prefer a close
  sibling AND still guarantees every reachable village traces back to a real settlement through the
  tree.
- **Batched, not literal, Prim's algorithm.** True Prim's (attach the single globally-cheapest
  unconnected node each step — the same technique `_civHierarchicalNetwork`'s own Pass 1 already
  uses for the base road MST) needs one full-grid Dijkstra rerun PER VILLAGE, up to 200 — exactly
  the "full extra order of magnitude" v1.71's own comment already measured as too slow at this scale
  (removing 200 villages from the trunk network's per-place Dijkstra treatment was what took
  Generate Roads from 3919ms to 397ms in that pass). Instead, each round runs ONE shared
  multi-source Dijkstra from the current network (real settlements ∪ every village that has already
  joined), ranks every still-unconnected village by distance to THAT network, and attaches the
  cheapest batch before growing the source set and re-running. `BATCH=max(4, ⌈villages/25⌉)` keeps
  the round count roughly constant (~25) regardless of village count — an approximation of Prim's
  ordering (two villages attached in the SAME batch don't get to consider each other as targets
  until the next round) traded for a small, bounded Dijkstra-call count.
- **A village-to-village edge is still a PLACE-to-PLACE edge with two distinct indices**, so it
  doesn't reintroduce the v1.71 self-loop bug (`_civNetworkMetrics` only recognises PLACE-to-PLACE
  edges via `aIdx`/`bIdx`, with no concept of a bare road junction as a graph vertex — a village
  is a real place regardless of whether its neighbour is a settlement or another village).
- **Reachability is unchanged by construction.** Whether a village is reachable from the network
  depends only on grid connectivity, not on which cells happen to be sources — a village unreachable
  in round 1 stays unreachable in every later round too (adding more sources within the same
  reachable component can't open a new one), so `!ranked.length` correctly identifies a genuinely
  stranded remainder and stops, exactly like the old per-village `!isFinite(dist[ci])` check did.
- **The v1.64 "ride existing infrastructure" discount now also applies to a village's own
  newly-drawn track within the same pass** (not just pre-existing roads) — once a village's track is
  committed, a sibling processed in a LATER round can fork off that fresh track instead of cutting
  its own parallel line, reinforcing the "beads on a string, forking local lane" shape rather than
  independent parallel spurs. A `discounted` cell set (seeded from pre-existing ways, extended as
  each new track lands) guarantees the ×0.25 multiplier is applied exactly once per cell, never
  re-multiplied across rounds.
- **v1.76's point-ordering discipline is preserved unchanged**: the Dijkstra walk still builds `raw`
  in village→…→target order (no `.reverse()`), and the endpoint-pin snap works identically whether
  the target is a settlement or an already-joined village.
- **Re-measured after the fix** (same seed/scenario): mean connector length 21.8 km → **14.5 km**
  (now essentially matching the theoretical nearest-sibling floor); nearest-sibling-closer share
  79.5% → **36.5%**; sibling-under-half-distance share 33.5% → **2.5%**. A separate chain-integrity
  probe (`probe_villagechain.js`, 3 seeds) confirmed every reachable village's connector chain,
  followed through however many village-to-village hops, still lands on a real settlement — zero
  villages left networked only among themselves — and isolated-village counts matched v1.78 exactly
  on all 3 seeds (no reachability regression). Measured build-time overhead: +11–14% on
  `_civIterativeAutoWorld` at 200 villages (3.5s→4.0s at 512px, 9.4s→10.5s at 768px), the accepted
  cost of the batched rebuild versus a single Dijkstra pass.
- **Tests**: 5 new smoke assertions (`R.v179`) — connectors exist and were checked; at least one
  genuine village-to-village edge exists (the fix is actually exercised, not just theoretically
  possible); nearest-sibling-closer share is well below the pre-fix 79.5%; every village's chain
  reaches a real settlement (BFS over village-way adjacency); isolated-village count stays a rare
  landmass-reachability edge case, not a regression.
- **Known scope cuts**: `BATCH`'s formula is a reasoned bound on round count, not independently
  tuned against a "correct" cluster size; two villages landing in the same batch don't benefit from
  each other as targets until the following round (a one-round-delayed approximation of true Prim
  ordering, not a correctness issue); `_civAutoRoutes` ("Generate Roads" alone, without a full
  Auto-populate) still regenerates connectors from scratch each run, unchanged from v1.71–v1.78.

### v1.78 — Terrain coupling made unconditional + Layer-view fix + animated wind/current streaks

Owner, immediately after v1.77 shipped: "Wind and current should always be coupled to terrain
therefore the toggle is unneeded. Has the Layer view been updated accordingly? And can we also
have the animation as in the PoC" — three asks in one message. Engine only (script block 1).
**Not** bit-identical at defaults — a deliberate, measured re-baseline (same class as v1.36/
v1.39/v1.46/v1.60's placement/relief fixes), disclosed in full below.

- **The toggle is gone, not just defaulted on.** `state.climate.terrainWind` is deleted from the
  state literal entirely (not left as a dead always-true field); the sidebar checkbox, its
  `syncUI()` sync line, and its change-listener are all removed. `buildWind`'s terrain-deflection
  guard changed from `if(c.terrainWind && opts && opts.elev)` to `if(opts && opts.elev)` — the
  mechanism now runs whenever a caller supplies elevation, which every real call site
  (`simulateWeather`, `oceanSSTAnomaly`, and now the Layer views below) always does.
  `oceanSSTAnomaly` lost its `terrainOn` branch outright: it unconditionally builds the coarse
  elevation array and calls `computeOceanCurrent()`. `loadZip`'s v1.77 compat guard
  (`if(state.climate.terrainWind==null) state.climate.terrainWind=false;`) became
  `delete state.climate.terrainWind;`, so re-opening a v1.77 save cleans the stale field instead
  of reintroducing it. `deflectFlow`/`computeOceanCurrent` themselves (the v1.77 pure primitives)
  are untouched — only their call sites lost the conditional.
- **The Layer view question had a real answer: no, it hadn't.** `currentWindField()` and
  `currentOceanField()` — the data functions behind the Wind/Ocean debug overlays — were flagged
  in v1.77's own CHANGELOG entry as a disclosed scope cut ("not wired to the new terrain-deflected
  path... still show the pre-v1.77 latitude+SST-anomaly view"). Fixed now: `currentWindField()`
  builds the same coarse elevation array `simulateWeather` does and passes `{elev:elevC}` into
  `buildWind`, so the overlay shows the actual deflected wind. `currentOceanField()` goes further
  — it used to derive its "current" by zeroing the WIND vector outside ocean cells and calling
  that a current (the same shortcut v1.77's CHANGELOG flagged `oceanSSTAnomaly` as having had
  *before* that fix); it now calls the real `computeOceanCurrent()` and returns the genuine
  Ekman-rotated 2D field (`{u:cur.u, v:cur.v, sst, ocean:cur.ocean, WW, WH, maxSpeed, maxAnom}`).
  Asserted directly: the Ocean Layer view's current vectors are measurably distinct from a plain
  masked copy of the wind field on a live world (`R.v178`).
- **Animated streaks, ported from the PoC's own "Wind/Current — animated streaks" feature.** New
  `#windFxCanvas`, stacked in `.canvas-stack` alongside `#view`/`#civCanvas`/`#polyOverlay` so it
  inherits the same pan/zoom CSS transform off-LOD and gets its own reprojection
  (`_windFxProject`/`_windFxBounds`, matching `drawLODDebugOverlays`' own `px()/py()` idiom) under
  Tiled LOD, where that shared transform is identity. Particles (260 for wind, 200 for ocean —
  fewer, since only ocean cells are valid spawn points) sample the SAME `currentWindField()`/
  `currentOceanField()` the static Layer view now correctly renders, advect each frame, and redraw
  via `destination-out` compositing for a fading trail (the PoC's own technique). Lifecycle is
  self-contained: `_windFxSync()` — called from the debug-view segmented-button handler and once
  on initial load (for a save that reopens straight into Wind/Ocean) — starts the loop when
  `state.debug` is `'wind'`/`'ocean'` and stops it (hiding and clearing the canvas) otherwise; the
  running rAF loop itself re-checks `state.debug` every tick and self-terminates, so unlike the
  sculpt joystick's `_sculptNavSync` (which needs many external call sites for every camera/modal
  change) this needed only the one reliable trigger.
- **Bug found and fixed before shipping: switching Wind→Ocean mid-animation crashed.**
  `_windFxStart()`'s original guard (`if(_windFxRunning || !windFxCtx) return;`) skipped
  reinitialization whenever anything was already running, so switching the debug view while
  animating kept sampling the STALE field object — an ocean sampler (`_windFxOceanAt` →
  `bilC(field.ocean,...)`) reading a wind-shaped field with no `.ocean` property, a hard
  `TypeError` crash. Root-caused via a Playwright `pageerror` handler capturing the full stack
  (not just the message) rather than a plain page-load probe, which found nothing because the
  crash only manifests after a specific interaction sequence, not on load. Fixed with `_windFxKind`
  tracking: `_windFxStart()` now only no-ops when the SAME kind is already running, and
  `_windFxStep()` itself detects a kind change mid-loop, reinitializes, and explicitly reschedules
  (since `_windFxStart()` alone only schedules a rAF on a stopped→running transition, not a
  same-loop kind switch). Re-verified via the smoke suite's page-error listener across a real
  Wind→Ocean→off click sequence: zero errors.
- **A real, disclosed consequence: `field` itself now differs from v1.77 at defaults, not just
  `temp`/`rain`/`flow`.** `generate()`'s default pipeline runs `carveRiverValleys()` (gated on
  `state.carveRivers`, true by default), which carves the heightmap based on traced river
  polylines — themselves downstream of `flowField`, which is downstream of `rainField`. Since
  terrain-coupled wind now always runs and measurably changes rainfall patterns (v1.77's own
  CHANGELOG measured mean `rainField`/`tempField` deltas of 0.040/0.268 with the toggle on), the
  carved heightmap legitimately differs too — confirmed via `hash_gen1.js` showing `field`
  mismatches in every scenario (default/geoid/waves/ao/icons), not a subset. This is the correct,
  intended closed-loop consequence of "wind and current should always be coupled to terrain," not
  a regression — the same class of deliberate re-baseline this file's own CHANGELOG has shipped
  before (v1.36/v1.39/v1.46/v1.60).
- **Three test fixes, all pre-existing tests whose assumptions the now-always-on coupling broke —
  none touch app behavior:**
  - The "cold current produces a cooler, drier coast" assertion used a fixed `-0.1°C` threshold on
    the *propagated*, heavily-diluted (coastal-proximity blur + moisture-advection loop) anomaly —
    too strict once the always-on path's real seed-to-seed variance was actually exercised (a
    12-seed sweep measured deltas as small as -0.002°C on some seeds, a genuine, physically-real
    Sverdrup/Stommel western-intensification asymmetry, not a bug). Redesigned to check the RAW
    `oceanSSTAnomaly()` field directly (robust, threshold -0.003°C) plus a separate, magnitude-free
    "any negative propagated dT with dR<-1e-4" check for the land-level Benguela/Atacama signature
    — two attempts at a single fixed magnitude threshold (-0.03, then -0.005) were each tried and
    measured to still intermittently fail before landing on this design.
  - The "equatorial belt wetter than subtropical dry belt" assertion ran on an ambient random seed,
    which the now-always-on terrain deflection could occasionally push below its 1.2× ratio
    threshold for an unlucky world geometry (observed ratios as low as 1.10-1.12 on real runs).
    Pinned to seed 12345 (this project's own standard reference seed) with a proper save/restore of
    `state.tect.seed` — verified to reproduce ratio 2.68, comfortably robust.
  - A pre-existing (v1.60-era) test isolation block for "at least one settlement is genuinely
    fuel-limited" (v1.31 §10.3) saved/restored `mapWidthKm`/`seed`/`resW`/`places` around its own
    dedicated `generate()` call, but not `state.world_structure.enabled` — which an earlier,
    unrelated smoke block leaves `true`, driving `state.seaLevel` to 0.482 (via
    `applyWorldStructureSeaLevel()`) instead of the default 0.42 and perturbing tectonic params via
    `deriveFromWorldStructure()`, reshaping the pinned seed's geology enough to move every iron
    settlement off fuel-limited. Root-caused by instrumenting the real smoke run (not a fresh
    reproduction, which passed and gave no clue) to report `state.world_structure.enabled` at the
    point of failure. Added to the save/restore, forced `false` for the isolated measurement — the
    same "an 'isolated' test's isolation was itself incomplete" shape this file's own comments
    already document for this exact test at v1.24/v1.46/v1.58.
- **UI**: the "Terrain-coupled wind & currents" checkbox is removed; the "Ocean currents" section's
  hint text is rewritten to describe unconditional terrain coupling instead of a togglable option.
- **Tests**: `tests/stub_head.js` gained `windFxCanvas` to its headless canvas-stub allowlist
  (block-1 code now references it). `R.v177`'s smoke block is replaced by `R.v178` (checkbox/
  state-field removal, ridge localization re-proven via `null` vs. `{elev}` opts instead of a
  toggle A/B, World-mode seam continuity, `refreshClimate()` determinism, and the two Layer-view
  correctness checks) plus a new `R.v178fx` block (windFx canvas existence/default-hidden state,
  and start/stop/kind-switch behavior driven through real `#debugSeg` button clicks). 8 + 4 new
  smoke assertions.
- **Known scope cuts**: the PoC's fuller moisture/cloud/snowpack/seasonal-ITCZ system remains
  deferred exactly as v1.77 scoped it — this version only removes the toggle, fixes the Layer
  views, and adds the streak animation, none of which touch that boundary. Streak particle counts
  (260/200) and advection step (0.9) are carried over from the PoC's own values, not independently
  retuned.

### v1.77 — Terrain-coupled wind & ocean currents (middle scope)

Owner supplied a standalone PoC (`terrain_coupled_flow_poc_2.html`, not in this repo) demonstrating
terrain-deflected wind and wind-derived ocean currents, and asked for it ported into `buildWind`/
`applyOceanCurrents`. Scope narrowed via `AskUserQuestion` in a prior session: **middle scope** —
wind/current terrain-coupling and gyre/western-intensification behaviour only, explicitly deferring
the PoC's fuller moisture/cloud/snowpack/seasonal-ITCZ system — with two binding constraints: the
World-mode horizontal wrap must never show a seam, and the result must genuinely feed
`tempField`/`rainField`, not sit beside them as a decorative overlay. Queued behind the active
bug-hunt goal (v1.75/v1.76 shipped first per the owner's own sequencing instruction), then picked up
here. Engine only (script block 1). Opt-in via new `state.climate.terrainWind` (default **false**)
⇒ hash vs v1.76 **ALL IDENTICAL** (default/geoid/waves/ao/icons all pass).

- **Root-caused the CURRENT engine first, per this file's own working-rules discipline, before
  writing any new solver code.** `buildWind` was purely latitude-band circulation plus a
  temperature-driven pressure/Coriolis perturbation — genuinely elevation-aware only *indirectly*
  (via lapse-rate-derived temperature), never by literally redirecting the wind vector around a
  mountain. `oceanSSTAnomaly` (the function that has driven the "Ocean currents" checkbox, on by
  default since v0.80) had no distinct current field at all — it read `buildWind`'s own meridional
  wind component (`wy`) directly and called it a current, no Ekman rotation, no gyre structure, no
  coastline deflection. This is exactly the "missing correlation" the source PoC's own method notes
  flag — confirmed to genuinely exist in this codebase, not assumed.
- **`deflectFlow(u,v,block,WW,WH,wrapX,opts)`** (new pure primitive) — ports the PoC's `deflect()`:
  the component of flow pointing INTO a rising "blocking" field is reduced and redirected
  tangentially along the block's local contour, iterated with light blending so deflection
  propagates upstream of a ridge/coastline rather than only appearing on top of it (linearised
  hill-flow theory, Jackson & Hunt 1975). Gap/strait acceleration comes from the block field's own
  Laplacian — a cheap streamline-convergence proxy (Overland & Walter 1981 for gap winds; the same
  continuity argument accelerates ocean straits). Reuses this file's own `blurCoarse` for both the
  block-field presmoothing and the per-iteration flow blend — inherits its wrapX handling rather
  than duplicating it, so the World-mode seam constraint is satisfied by construction, not by a
  bolted-on special case.
- **`computeOceanCurrent(wx,wy,elevC,WW,WH,wrapX,sea,latOf,opts)`** (new pure primitive) — a real 2D
  current vector field: Ekman-rotates the (possibly terrain-deflected) wind ~25° right of wind in
  the N hemisphere, left in the S (Ekman 1905), runs it through `deflectFlow` again against a HARD
  coastline (impermeable, vs. wind's soft elevation ramp) plus continental-shelf friction (shallow
  water damps flow), then a western-intensification heuristic (subtropical gyres pile up transport
  on a basin's western edge — Sverdrup 1947 / Stommel 1948) via a wrap-aware west/east coast-
  distance scan — disclosed as a distance-to-coast proxy, not a solved beta-plane model, per the
  source PoC's own honest framing.
- **`buildWind` gained an `opts` parameter** (`{elev}` — a coarse elevation array); when
  `state.climate.terrainWind` is on AND a caller supplies `elev`, the finished wind vector is run
  through `deflectFlow` against a land/mountain blocking field plus an elevation-band damping term
  (thin high-altitude air slows near-surface flow). The early `return` that used to skip the rest of
  the function when `pressK<=0` was converted to an `if` guard so the new terrain step still runs
  even with pressure influence off — every pre-v1.77 call site omits `opts`, so this is a pure
  addition, not a behavioural change to the existing pressure/Coriolis path.
- **`oceanSSTAnomaly` now derives its anomaly from the REAL current's meridional component**
  (`computeOceanCurrent`) instead of the wind's raw `wy`, when the flag is on — closing the
  "missing correlation." `simulateWeather` (the actual rain-producing pass) threads its own
  already-computed coarse elevation array (`eh`) straight into `buildWind`'s new `opts.elev`, so
  wind genuinely bends around real terrain in the SAME pass that advects moisture and computes
  orographic rain — not a second, decorative computation.
- **Measured, not assumed, before shipping**: a synthetic north-south ridge (World mode, wrap on)
  shows a real, LOCALIZED deflection signature — mean per-cell wind-vector change near the ridge
  (dx<15 cells) is **3.7× the mean change far from it** (dx>60 cells), with the expected physical
  direction (speed drops approaching the ridge, tangential component rises) — not a uniform,
  domain-wide effect. A genuine `refreshClimate()` pass with the flag toggled shows non-trivial mean
  `rainField`/`tempField` deltas (0.040 / 0.268 respectively, seed 12345/256px) — proving the second
  binding constraint (feeds the simulation, not decorative). The World-mode seam (ridge kept away
  from x=0/x=WW-1, so the seam sits in flat terrain) shows **zero** discontinuity — a real wrap bug
  would show up there distinctly from the ridge's own legitimate flow-splitting at its crest, which
  was deliberately excluded from this measurement to avoid conflating the two.
- **One test-harness mistake caught before it became a false alarm**: an early probe pre-filled
  `wx`/`wy` with a synthetic uniform wind and called `buildWind` expecting it to be preserved —
  `buildWind` always computes its own latitude-band base from scratch, discarding any caller-
  supplied input, so the probe's "wind reversed across the whole domain" reading was just the
  correct equatorial trade-wind direction at that latitude, not a solver bug. Caught by directly
  diffing `buildWind`'s own off-vs-on output (the correct isolation technique) before concluding
  anything was wrong.
- **UI**: new "Terrain-coupled wind & currents" checkbox next to "Ocean currents" in the Climate
  panel, off by default, wired through the same `withBusy(...); refreshClimate(); render();`
  pattern every other climate checkbox already uses. Only meaningful with Ocean currents also on.
- **Tests**: 6 new smoke assertions (`R.v177`) — checkbox exists/defaults unchecked, state defaults
  false, near-ridge deflection measurably exceeds far-field (the localization proof), World-mode
  seam continuity, and non-trivial rain/temp deltas through a real `refreshClimate()` call (the
  "feeds the simulation" proof).
- **Known scope cuts** (disclosed, matching the owner-approved middle scope): the PoC's fuller
  moisture/cloud/snowpack cycle and seasonal ITCZ migration were explicitly deferred, not
  attempted. The debug-view-only functions `currentWindField`/`currentOceanField` (Wind/Ocean debug
  overlays) are **not** wired to the new terrain-deflected path — they still show the pre-v1.77
  latitude+SST-anomaly view even with the flag on; the real, load-bearing path
  (`simulateWeather`/`oceanSSTAnomaly`, which actually produce `rainField`/`tempField`) is the one
  that matters and is fully wired. The far-field diffusion characteristic (deflection reaches
  measurably, if diminishingly, beyond the immediate terrain feature) is inherited from the source
  PoC's own iteration/blur design — not independently re-tuned, since narrowing it further would be
  redesigning the approved reference algorithm rather than porting it. The western-intensification
  term is a distance-to-coast heuristic, not a solved beta-plane model, exactly as the source PoC
  itself discloses.

### v1.76 — Village connectors: an unnecessary `.reverse()`, not a terrain problem

Owner: *"let's check how ways are done for the recently added Villages (suitability-weighted,
road-biased) option. At the moment it seems like a loopy bundle of spaghetti which is not how
roads historically formed."* Root-caused by direct measurement — generating a real world (seed
31337/512px) with Villages on and inspecting the drawn geometry, cost, and terrain of the worst
offenders — before writing any fix, per this file's own working-rules discipline. Civ-layer only
(`_civConnectVillageAddons`). Hash vs v1.75 **ALL IDENTICAL** (village connectors are opt-in,
default off, and touch no field/temp/rain/flow data).

- **First hypothesis (terrain avoidance / the existing-way discount pulling routes off course) was
  wrong, and disproving it is what found the real bug.** Median circuity (path km ÷ straight-line
  km) across 199 connectors measured 2.62x, worst case 3.35x, with 54 connectors self-intersecting.
  Disabling the `_CIV_EXISTING_WAY_DISCOUNT` entirely only dropped the median to 2.21x — a
  meaningful but partial effect, not the explanation. The clincher: recomputing the WORST
  connector's own path cost from the exact cost grid `_civConnectVillageAddons` used showed it was
  **2.8x more expensive than the straight line** despite the straight line crossing near-flat
  terrain (height 0.58→0.63 over the whole route, no water, no cliff). A "shortest path" that costs
  3x more than a straight line on flat ground is not a shortest path — it's a bug.
- **Root cause: the Dijkstra `prev[]` walk already builds `raw` in VILLAGE→…→SOURCE order** (`cur`
  starts at the village's own cell and is pushed FIRST; the loop follows `prev[]` toward decreasing
  distance, so the settlement cell is necessarily pushed LAST) — exactly the `aIdx`(village)→
  `bIdx`(settlement) reading every consumer already assumes. The shipped code called an unnecessary
  `raw.reverse()` right after, flipping that to SOURCE-first/VILLAGE-last, and then overwrote the
  endpoints as if it hadn't — forcing index 0 (now the source end) to the village's own coordinate
  and the last index (now the village end) to the settlement's. That doesn't just mislabel the ends
  — it corrupts the entire drawn path. Tracing one captured raw path end to end: point 0 is the
  village (correct value, wrong position), point 1 lands almost exactly at the SETTLEMENT (the true
  second cell of the reversed, source-side walk), points 2 through N-2 retrace the ENTIRE real route
  backward, ending back almost exactly at the village's own position, and the final point jumps to
  the settlement again. A path that leaves home, appears at the destination, walks the whole way
  back near-home, then jumps to the destination a second time is exactly what "loopy bundle of
  spaghetti" looks like on screen — and exactly why it self-intersects.
- **`aIdx`/`bIdx` (what `_civNetworkMetrics` reads) were never wrong** — `cur` already held the
  correct source cell going into `settleAt.get(cur)`, independent of the array-order bug. Only the
  drawn GEOMETRY was corrupted, which is why the v1.71 smoke coverage never caught this: every
  connector still reported real, valid, non-isolated, correctly-paired endpoints.
- **Fix: delete the `raw.reverse()` call and leave the two endpoint overwrites exactly as
  originally written** (`raw[0]` ← village pin, `raw[raw.length-1]` ← settlement pin) — now correct
  because the walk was never out of order to begin with. Re-measured on the identical world: median
  circuity 1.12x, max 1.86x, zero self-intersecting connectors (down from 54/199).
- **First cut of the fix shipped, then a smoke-suite run caught it: swapping WHICH coordinate each
  overwrite targets (instead of removing the reverse) produces identical path geometry but writes it
  in SOURCE-first/VILLAGE-last order** — silently breaking the pre-existing v1.71
  `villageEndsMatchPin`/`settlementEndsMatchPin` checks, which assert `pts[0]` sits on the `aIdx`
  (village) pin. Caught by the full smoke run (605 passed, 1 failed) before shipping, not by
  inspection — a reminder that "the geometry is now correct" and "the codebase's own ordering
  convention is preserved" are different claims, and only re-running the suite catches a violation
  of the second. Re-verified after switching to the reverse-removal fix: 606/606.
- **Tests**: 3 new smoke assertions (`R.v176`) — connectors exist and were checked (the scenario is
  meaningful); max circuity stays under a generous 2.2x bound (was 3.35x); zero connectors
  self-intersect (was 54).
- **Known scope cuts**: none identified — the reported symptom had a single, fully-explained root
  cause. The broader "roads should share a trunk near the destination instead of 200 independently-
  computed spurs" aesthetic question (real road networks converge) was investigated as a secondary
  hypothesis but not pursued: with circuity now near-direct (1.12x median) and zero loops, the
  fan-in pattern (mean 5.85, max 16 connectors per settlement) reads as an ordinary spoke/star
  pattern, not spaghetti — the bug was the whole explanation.

### v1.75 — `_civAutoRoutes` stamped way indices from two different arrays

HANDOFF-flagged latent defect from the v1.72 bug hunt: *"`_civAutoRoutes` builds way `aIdx`/`bIdx`
against its filtered `settles` array while `_civIterativeAutoWorld`/`_civConnectVillageAddons` use
full-`state.places` indices. Divergent when a POI exists... Picking one canonical index base is a
wider refactor than a fix pass should take on speculatively."* Bug-hunt pass per the active goal;
civ-layer only. Hash battery vs v1.74 **ALL IDENTICAL** — pure index bookkeeping, no placement,
routing, or rendering logic changed.

- **Root cause**: `_civAutoRoutes` ("Generate Roads") builds `settles` — `state.places` filtered to
  exclude POIs and `villageAddon` places (v1.72 BUG-B's own fix) — and calls
  `_civHierarchicalNetwork(settles, …)` for the trunk MST. `_civHierarchicalNetwork` stamps every
  way's `aIdx`/`bIdx` as **positions in whatever `places` array it was called with** — here,
  `settles`. A few lines later, the same function calls `_civConnectVillageAddons(state.places, …)`
  for the village-connector ways, correctly using `state.places` (a village's own index only exists
  there). Both sets of ways land in the same `civWays` list carrying indices from two different
  bases — the exact "two functions/copies answering one question WILL drift" shape this file has
  hit repeatedly (v1.30/v1.33/v1.35/v1.37/v1.46/v1.53/v1.56/v1.60/v1.64…).
- **Confirmed latent, not live, before fixing.** `_civNetworkMetrics` — the sole reader of
  `aIdx`/`bIdx` — is only ever called from inside `_civIterativeAutoWorld` with its own
  internally-consistent `places`/`ways` pair, never on `_civAutoRoutes`'s output, so nothing
  misreads it today. But a `settles`-local index is frequently *also* a valid, *different*
  `state.places` index (whenever a POI or addon village sits earlier in `state.places` than the
  settlement a way's endpoint names), so a future reader — or a naive `state.places[w.aIdx]`
  lookup — gets a wrong-but-plausible-looking place, not a crash. Exactly the shape that survives
  several versions unnoticed, per this file's own v1.35/v1.72 precedent for that failure mode.
- **Fix**: a four-line remap in `_civAutoRoutes`, right after `landWays` is built and before
  `_civPreferSeaRoutes` runs — `settles.map(p=>state.places.indexOf(p))` builds the position map
  (element identity is shared between the two arrays, so `indexOf` finds the true global position),
  then every land way's `aIdx`/`bIdx` is remapped through it. `_civConnectVillageAddons`'s ways are
  untouched — they were already correct.
- **Tests**: 2 new smoke assertions (`R.v175`) — real `_civAutoRoutes()` run confirms it produces at
  least one land way with `aIdx`/`bIdx` set (the scenario is meaningful), then a deterministic
  reproduction: a POI inserted ahead of the settlements in `state.places` (so a `settles`-local
  index and the POI's own `state.places` index collide) confirms every land way's `aIdx`/`bIdx`
  resolves to a real, non-addon settlement — not the inserted POI — proving the remap and not just
  the absence of a crash.
- **Known scope cuts**: none — this is exactly the fix HANDOFF described, no wider index-base
  unification attempted (the HANDOFF entry's own "wider refactor" caveat still stands for
  `_civIterativeAutoWorld`'s internal consistency, which was never broken).

### v1.74 — Tiled LOD: a colorized tile is a static image, and one composite per frame

Owner: *"Keep hunting, particularly to smooth LOD tiling and detail rendering. repeated quick zoom
in-out actions cause a browser to freeze and become unresponsive."* Reproduced with real
`page.mouse.wheel` events on a populated 1024px world, then root-caused by instrumenting the actual
call counts before writing any fix. Two independent defects, **both in scheduling — neither in what
gets drawn**. Engine pipeline untouched; hash battery unaffected (LOD is opt-in, default off).

**Baseline (v1.73, seed 31337 / 800km / 1024px, two identical 64-tick wheel gestures):** worst rAF
frame **13,217 ms**, p99 8,880 ms, 35 frames over 500 ms; `drawLODView` 350 calls / 226,950 ms;
`renderBiomeTileRGBA` 491 calls / 243,382 ms, split **364 full tiles at ~609 ms each** and 127
overview rebuilds at ~171 ms. A 3-second gesture took **119 seconds** of wall time.

**Result (same probe, v1.74):**

| | v1.73 | v1.74 |
|---|---|---|
| worst rAF frame | 13,217 ms | **1,381 ms** (9.6×) |
| p99 frame | 8,880 ms | **983 ms** (9.0×) |
| `drawLODView` max / total | 13,192 / 226,950 ms | **1,077 / 41,514 ms** (12.2× / 5.5×) |
| tile colorizations | 364 (221,666 ms) | **64** (39,548 ms) |
| canvas-cache peak / cap | 24 / 24 (pinned) | **68 / 72** (working set fits) |
| repeat-gesture canvas misses | 200 | **15** |
| repeat-gesture colorization time | 135,364 ms | **14,832 ms** (9.1×) |

Two effects are honestly the other way and worth knowing: **frames over 500 ms rose 35 → 55**, and p95
293 → 658 ms, because the work is now *spread* across frames instead of concentrated into a few
catastrophic ones — that is the intended trade, not a regression. And a single 1024×655 colorization
measures ~618 ms on this headless swiftshader box, which is the floor for any frame that colorizes at
all: the budget cannot preempt mid-tile. Real GPU-backed hardware should be several times faster, but
that is an expectation, not something this harness demonstrates.

- **Defect 1 — the colorized-tile cache was undersized against its own source data.** The canvas key
  is `z/col/row/tileSize/baked|rk` and deliberately carries **no zoom or pan term**, so a tile's
  pixels are a pure function of its heightmap and `_lodRenderKey` — the same tile at zoom 4 and zoom
  8 is byte-identical. But the LRU kept 48 tile **heightmaps** (`_lodCacheMax`) and only 24 of their
  derived **canvases** (`LOD_TILE_CANVAS_MAX=24`), so zooming back onto a pyramid level whose source
  data we were *still holding* threw the pixels away and recomputed them identically. Measured **364
  misses against 2100 hits with the cache pinned at 24 the entire time**, for a sweep touching ~30
  distinct tiles — roughly 7 of every 8 colorizations were redundant, ≈222 s of the 243 s.
  - The sharpest evidence is the repeat-gesture pass: replaying the *identical* gesture, with
    `_lodRenderKey()` provably unchanged and every tile already colorized once, still ran **263 more
    colorizations costing 135,364 ms**. The correct count there is zero.
  - **Fix: `lodTileCanvasMax()` budgets by PIXELS, not entries**, so the cap tracks `_lodTile` —
    which the user can change, and at which a fixed entry count costs 16× more memory at 2048 than at
    512 — at one fixed memory ceiling.
  - **The budget is sized from a MEASURED working set, and getting that wrong cost a whole extra
    pass.** A first cut set it to 48 MPx, i.e. `_lodCacheMax` entries at the default tile, on my own
    back-of-envelope estimate of "~30 distinct tiles per sweep". Re-measuring found the truth:
    `probe_distinct.js` enumerates the gesture's own zoom trajectory analytically and reports **68
    distinct tiles** across the 5 pyramid levels it crosses, with up to **16 visible at once** (not
    the 4 a centred view shows — right after each level change the viewport straddles a tile boundary
    in both axes). 48 was still under the working set and still thrashed: the repeat pass measured
    155 colorizations. At **72 MPx** the cache peaks at 68 against a cap of 72 and repeat-gesture
    canvas misses drop 200 → **15**. Same lesson this file keeps relearning: *measure the
    distribution, don't assume it.*
- **Defect 2 — every high-frequency camera input called `renderNow()` INLINE, once per event.** The
  wheel handler, the pinch `touchmove`, the LOD pan `pointermove`, the v1.19 joystick loop and the
  sculpt-stroke `pointermove` each composited synchronously per event. A composite is an overview
  blit plus up to 9 tile colorizations plus the vector overlays, so once events arrived faster than a
  composite finished they queued on the main thread and the page stopped answering anything —
  **350 composites for 128 wheel ticks (2.7× over-render)** and a 13.2 s worst frame.
  - **Fix: `requestLodRender()` coalesces to one composite per animation frame.** Strictly a
    scheduling change — the frame that *is* drawn is pixel-identical; we simply stop drawing
    intermediate frames nobody sees, and the browser regains a yield point between them (which is
    what turns "unresponsive" into "chuggy but interactive"). `renderNow` is resolved lazily *inside*
    the rAF callback because blocks 1 and 2 both wrap and reassign it (the v1.24 reassignment-wrapper
    note) — capturing it would pin the unwrapped version and silently drop the civ layer.
  - Also routed through it: `lodZoomStep` and the zoom-reset button. Neither is high-frequency, but a
    doubling step lands on a whole new pyramid level where *every* tile is un-colorized — the worst
    unbudgeted case.
  - **The single largest surviving stall wasn't a camera-input handler at all.**
    `_lodScheduleOverviewRebuild`'s own `setTimeout(0)` completion callback carried its own inline
    `renderNow()` — fired **128 times** in one measured gesture, once per landed overview rebuild —
    and each one re-composited every un-cached visible tile in a single unbudgeted call. Coalescing
    the four input paths alone cut total colorization work 2.4× but left the worst frame unchanged at
    12.2 s, because this fifth call site was still reaching `drawLODView` with `_lodFrameBudget` null;
    routing it through `requestLodRender()` too is what actually moved the worst frame (11,162 ms →
    1,077 ms `drawLODView` max). Grep for every `renderNow()` call reachable from an LOD-camera-adjacent
    path before declaring a scheduling fix complete — an async completion callback is as much a
    high-frequency trigger as a `pointermove` if it fires once per rebuild during a fast gesture.
- **Per-frame colorization budget (`LOD_FRAME_BUDGET_MS = 12`), interactive path only.** Even with a
  right-sized cache, the first visit to a pyramid level must colorize its tiles, and 9 × 609 ms in one
  frame is still a multi-second block. `drawLODView` now stops colorizing once past the budget and
  lets the overview show through — exactly what the loop already does one line earlier for a tile
  whose *height data* isn't ready. The file already treated tile data as async/pooled/debounced while
  treating its colorization as mandatory-and-synchronous; that was an inconsistency, not a
  requirement. It **always colorizes at least one** tile (N tiles ⇒ N frames, guaranteed progress) and
  requests a follow-up frame whenever it skipped any.
  - Gated on `_lodFrameBudget`, which is set **only** around the rAF-driven render. A direct
    `renderNow()` — `generate()`, an export grab, the headless/smoke harnesses, and the two EXPLICIT
    refine paths ("Refine detail" and the `lodChk` auto-sharpen, both under `withBusy()` with a
    progress overlay) — still composites the whole view in one go, exactly as before.
  - The **debounced settle** refine (`scheduleLodRefine`) does go through the budgeted path:
    `refineVisibleTiles()` has just handed it a full viewport of brand-new, un-colorized tiles, so an
    unbudgeted composite there is the same multi-second stall merely relocated to the moment the user
    stops scrolling. Budgeted, the sharp tiles fade in over the next few frames instead.
- **Confirmed NOT the cause, so don't re-chase it:** v0.93's stretch-the-overview fast path is
  working correctly — `_lodOverviewStretchStreak` peaked at 1 against its cap of 4, so the
  synchronous overview rebuild was never the streak-cap fallback, and overview rebuilds were only
  127 calls at ~171 ms (21.7 s of 243 s). `pyramidTile` ran **0 times** during the gesture, so this
  was never tile *generation*. `sharedSeaFields()` is properly cached on `_fieldGen` +
  `sunAz|exag`. `refineVisibleTiles` returned in ~0 ms (async, correctly).
- **Tests**: 9 new smoke assertions (`R.v174`) — the cache cap equals `_lodCacheMax` at the default
  tile and tracks `_lodTile` in both directions with a floor; `_lodRenderKey` ignores zoom/pan but
  still reacts to a real visual change (sea level); 25 `requestLodRender()` calls in one tick draw
  nothing and then collapse to exactly one composite on the next frame; an interactive frame carries
  a positive budget and clears it afterwards; a direct `renderNow()` is unbudgeted.
- **Known scope cuts**: `LOD_TILE_CANVAS_MAX_PX = 48 MPx` and `LOD_FRAME_BUDGET_MS = 12` are reasoned
  values confirmed against measurement, not independently tuned across devices; the ~609 ms cost of a
  single 1024px `renderBiomeTileRGBA` is unchanged (this version stops running it redundantly and
  stops running many of them in one frame — it does not make one cheaper); the v1.29-disclosed
  per-tile seam residue is untouched. All of this is canvas/pointer behaviour under this file's own
  headless carve-out and still wants an on-device pass.

### v1.73 — Label collision reserved one box and drew in another (trait-badge clearance)

Continuation of the v1.72 bug hunt, widening past the village layer into the label renderer. Found by
reading the two halves of the label pipeline against each other, then confirmed by measurement.
Civ-layer only. Hash vs v1.72 **ALL IDENTICAL** (the civ overlay is a separate canvas; the hash
battery's scenarios have no placed settlements).

- **v1.28 added trait-badge clearance to the label DRAW path but never to v1.12's label-collision
  RESERVATION.** `_civDrawSettlementPin` pushes a `'below'` label down by `traitDrop` so it clears
  the trait badges under the pin; `drawCivLayer`'s candidate loop reserved the *undropped* box. So a
  below-placed label on a trait-bearing settlement painted up to `traitDrop` px outside the box it
  had claimed — straight through space a neighbouring label had legitimately reserved. Measured on
  the reference world (seed 31337): one such collision at deep zoom, and re-running the same
  placement with the corrected box eliminates it.
- **Fix: `_civTraitDrop(place,sz,sc)` is now the single definition**, read by the drawer (which paints
  at that offset) and by the collision pass (which reserves it). Only the `'below'` candidate moves,
  and it returns 0 for a trait-less place — so every other candidate, every trait-less settlement and
  every POI reserves byte-for-byte the box it did before. The umpteenth instance of this file's own
  "two functions answering one question WILL drift" rule, this time across a *draw/reserve* pair
  rather than two computations.
- **Tests**: 3 new smoke assertions on `_civTraitDrop` (zero without traits, positive with, matches
  v1.28's literal draw formula to the bit, scales with pin size so it stays correct at every zoom).
- **Investigated and ruled out, not shipped as findings** (recorded so a later pass doesn't re-chase
  them): the label *width* reservation is a character-count heuristic (`name.length*fsz*0.62`) rather
  than `measureText`, but measured **conservative on all 35 labels** (worst real/estimated ratio
  0.935 — it never under-reserves), so it is not a defect; `jn.stops` is dropped by the journey
  serialization whitelist but line 18939 already documents that nothing reads it back; `_civBakeKey`
  omits civ state by design because the civ layer is a separate overlay canvas; and the v1.71
  connectors, though faint, do render at their reveal zoom (measured 14,840 px across 199).

### v1.72 — Three v1.71 village-connector defects found by bug hunt (roads to invisible settlements)

A deliberate bug-hunt pass over the v1.68–v1.71 village layer. All three defects were **measured on a
real generated world before any fix** (`bughunt_v171.js`), and all three share one shape: the
`villageAddon` tag is the single thing separating a deep-zoom decorative connector from an ordinary
road, and three separate code paths didn't know about it. Civ-layer only. Hash vs v1.71 **ALL
IDENTICAL** (the layer is off by default, and the serialization change emits `undefined` — which
`JSON.stringify` omits — when no connector exists).

- **BUG-A (HIGH, rendering) — `villageAddon` was dropped from every way on save/load.**
  `_civSyncToState`/`_civSyncFromState` serialize ways through an explicit **field whitelist**, not a
  spread, so any property not named there is silently discarded. v1.71 added the flag to the way
  object and to the renderer's LOD gate, but not to the whitelist. Measured: 199 connectors → **0**
  after a round trip; the 199 ways survived as plain `'ancient'` and therefore drew from
  `CIV_LOD_ROAD.ancient=0.7` while their villages stayed hidden until `CIV_VILLAGE_ADDON_LOD=2.4`.
  **Reopening a saved project showed a web of ~199 roads leading to settlements that weren't there.**
  Places kept the flag (`serializeState` deep-clones `state` wholesale), and that asymmetry is exactly
  what made the defect visible rather than merely cosmetic. Fixed by adding `villageAddon` to both
  whitelists.
- **BUG-B (HIGH, rendering + correctness) — "Generate Roads" destroyed the connectors and then
  rebuilt the villages into the trunk network.** `_civAutoRoutes` opens with
  `civWays=priorManualWays.slice()`, keeping only `w.manual` — an auto-generated connector is not
  manual, so **all 199 were deleted**. It then passed every settlement-kind place to
  `_civHierarchicalNetwork`, and since `hamlet` is in `CIV_SETTLE_KEYS` the 200 addon villages were
  admitted as ordinary settlements: measured **226 ways touching a village at LOD 0 / 0.35 / 0.7**,
  i.e. fully visible at world zoom. Same roads-to-nowhere symptom as BUG-A, plus it defeated the
  entire deep-zoom design the layer exists for. Fixed in two parts: villages are excluded from the
  trunk `settles` list (they are an additive layer, not part of the settlement hierarchy), and the
  connectors are **regenerated** via `_civConnectVillageAddons` onto the freshly-built network rather
  than preserved — preserving them would keep geometry routed around roads that no longer exist, and
  v1.71's shared multi-source Dijkstra makes re-running it cheap. Re-measured: 199 connectors survive,
  **every** way touching a village sits at LOD 2.4, and no trunk way touches a village.
  - **Unintended but welcome: Generate Roads got ~10× faster with villages on — 3919 ms → 397 ms.**
    The trunk builder was running `2 × 235` full-grid Dijkstra searches over places that had no
    business being in the hierarchy; it now runs `2 × 35` plus one shared multi-source pass.
- **BUG-C (MEDIUM, usability) — the way list flooded with 199 unnamed connector cards.**
  `_civRenderWayList` builds a full DOM card (6 elements + handlers) per way and is **not**
  virtualized, unlike the v1.16 settlements table. Measured: **53 cards → 252 cards / 2016 DOM nodes**,
  burying the ~53 roads the user actually authored. `_CIV_VILLAGE_CAP=200` exists, by its own comment,
  precisely to "keep the editor list usable" for PLACES — the ways v1.71 added bypassed that same
  constraint. Fixed by grouping connectors under a collapsed `<details>` disclosure ("🏚 Village
  tracks (N)"), the file's own existing progressive-disclosure idiom. Top-level cards 252 → **54**
  (53 real + 1 disclosure); every connector stays fully reachable (rename/retype/focus/delete all
  still work), one click away. *Disclosed honestly: total DOM node count is essentially unchanged
  (2016 → 2019) since the cards are still constructed, just not at top level — the fix targets
  signal-to-noise, not allocation. Render cost was never the problem (8→13 ms).*
- **Tests**: 7 new smoke assertions (`R.v172`), one or two per bug, each asserting the *observable*
  regression (LOD ordering, trunk-network contamination, list density) rather than the internal flag.
- **Found but deliberately NOT fixed** (noted for a future pass, not silently dropped):
  `_civAutoRoutes` builds way `aIdx`/`bIdx` against its filtered `settles` array while
  `_civIterativeAutoWorld` and `_civConnectVillageAddons` build them against the full `state.places`
  array. With a POI present the two bases diverge. This is **latent, not user-visible**:
  `_civNetworkMetrics` — the only consumer that reads those indices — is called exclusively from
  inside `_civIterativeAutoWorld`, always with the full array. Fixing it means picking one canonical
  index base across both paths, which is a wider refactor than a bug-fix pass should take on
  speculatively (the v1.62 precedent: ablate and confirm a defect actually manifests before changing
  placement/indexing code).

### v1.71 — Addon villages are connected to the network by a low-tier "Ancient route"

Owner, immediately after v1.70 shipped: "the new settlements on the deeper level also need to be
connected. By a lower type road (ancient route for example) so it only shows when zoomed in." v1.70
added the villages themselves but never gave them any way — this closes that gap. Civ-layer only.
Hash vs v1.70 **ALL IDENTICAL** — the new pass only runs when `_civVillages` is on and villages were
actually added.

- **`_civConnectVillageAddons(places, villages, ways)`** connects every addon village to its nearest
  REAL SETTLEMENT with a new `type:'ancient'` way, tagged `villageAddon:true` so the renderer gates
  it on `CIV_VILLAGE_ADDON_LOD` (the same deep-zoom threshold the village's own pin already uses —
  see `_civWayLodMin`, factored out of `drawCivLayer`'s inline LOD ternary for exactly this) instead
  of the generic `CIV_LOD_ROAD.ancient=0.7` every other ancient-typed way keeps. The `_CIV_EXISTING_
  WAY_DISCOUNT` cost discount (v1.64) still applies en route, so a track prefers to run alongside a
  real road on its way to a settlement rather than cut its own parallel line — it just always
  terminates at an actual town.
- **First cut targeted the nearest existing WAY cell, not a settlement, and measured broken.** A
  spur stopping at a bare road junction reads well visually, but `_civNetworkMetrics` — the function
  every population/trade/betweenness figure in this app is built on — only ever recognises
  SETTLEMENT-to-SETTLEMENT edges (via `aIdx`/`bIdx`, or a nearest-place-to-endpoint coordinate
  fallback when either is missing). A junction is invisible to it as a graph vertex. For a SHORT spur
  (the common case — most villages are already road-biased at placement, v1.70), the fallback's
  nearest-place search for the far endpoint usually finds the VILLAGE ITSELF, producing an
  `aIdx===bIdx` self-loop the metrics function silently drops. Measured before the fix: 161/200
  connectors built, but **all 200 villages read `componentSize===1`** (isolated) regardless — the
  connector existed on the map and meant nothing to the simulation underneath it. Routing to the
  nearest settlement instead guarantees `aIdx`/`bIdx` always resolve to two distinct real places, so
  the metrics function's own direct branch picks up the edge correctly, by construction. Re-measured:
  199/200 connectors, and every one of them now reads as genuinely connected (non-isolated).
- **One shared multi-source Dijkstra pass, not one Dijkstra per village.** `_civHierarchicalNetwork`
  already runs one full-grid `roadDijkstra` per SETTLEMENT to build the base road MST (confirmed by
  reading it) — up to `_CIV_VILLAGE_CAP=200` villages on top of that would be a full extra order of
  magnitude of full-grid searches. `roadDijkstra` gained an additive multi-source form (v1.71): `sx`
  may now be an array of pre-computed cell indices, seeding every one at dist=0 in the same pass, so
  one call finds every village's nearest settlement — and the full path back to it — in the same
  asymptotic cost as ONE ordinary Dijkstra call. Every pre-v1.71 scalar call site is bit-identical
  (same single seed, same relaxation loop) — asserted directly.
- **Endpoints snap exactly onto both pins**, the same v1.02 precedent every other generated way
  follows: the village end is forced onto the village's own `{x,y}`, the settlement end onto the
  target settlement's — no "stops just short" gap.
- **Measured** (seed 31337, 800 km / 512 px, 200 addon villages): 199 connectors built (1 village
  genuinely unreachable — an isolated landmass fragment), all `type:'ancient'`, all correctly
  registered as non-isolated by `_civNetworkMetrics`. Toggling the layer off leaves zero
  `villageAddon`-tagged ways behind.
- **Tests**: 9 new smoke assertions — 3 deterministic unit tests (multi-source `roadDijkstra` matches
  the min of each source's own single-source distance at every cell; every scalar call stays
  byte-identical; `_civWayLodMin` overrides correctly for a `villageAddon` way and leaves a plain
  `ancient` way untouched) plus 6 live-world assertions (bounded non-empty batch, both endpoints snap
  exactly, LOD matches the village's own threshold, most villages connect, every connected village
  reads non-isolated, toggle-off leaves no connectors).
- **Known scope cuts**: no cap on connector length (a genuinely remote village earns a genuinely long
  ancient track, same as the base network's own uncapped MST edges); a village on a landmass with no
  real settlement at all gets no connector (nothing to connect to); village-to-village connections
  are not modelled — each addon village always spurs independently to its nearest real settlement,
  never to a neighbouring village, even when that would be a shorter path.

### v1.70 — Dense grid and roadside villages merged into one suitability-weighted, road-biased pass

Owner, immediately after v1.69 shipped: "can we mix the dense village function and the roadside
village function into something more nuanced? And only come into view when our zoom is at about 60%
zoomed in." Three designs were put to the owner via `AskUserQuestion`; the owner picked
**Suitability-weighted road bias**: "candidates still come from the suitability grid (like dense
mode — so good land gets covered everywhere, not just along roads), but a candidate's acceptance
odds rise the closer it is to a road, with a soft falloff rather than a hard cutoff... Replaces both
toggles with one." Civ-layer only. Hash vs v1.69 **ALL IDENTICAL** — the new toggle defaults off.

- **Root cause of "waay too populated" wasn't fixed by v1.68's opt-out — it was v0.76's own
  mechanism.** `villageMode` (dense grid) worked by tightening the suppression radius and lowering
  the seed threshold for `_civIterativeAutoWorld`'s BASE placement pass, so turning it on densified
  EVERY tier — capitals, cities, towns, villages, hamlets all at once — not just villages. v1.70
  removes `villageMode` from base placement entirely; base capital/city/town/village/hamlet
  placement is now byte-identical regardless of the new toggle (asserted live). Only the additive
  layer below responds to it, which is the actual fix, not just a coexistence option.
- **One unified additive pass, `_civSeedVillages(places, ways, rng, suit)`,** replaces both
  `_civIterativeAutoWorld`'s old `villageMode` branch and v1.68/v1.69's arc-length road-walk
  (`_civSeedRoadsideVillages`). Candidates come from `findSettlementSeeds(suit, GW, GH,
  {thresh:VILLAGE_SUIT_THRESH, suppR:spacing})` — dense mode's own full-map-coverage technique,
  reused rather than reinvented — at the same relaxed `VILLAGE_SUIT_THRESH=0.32` floor (renamed from
  v1.69's `ROADSIDE_VILLAGE_SUIT_THRESH`, same value). Below this floor a cell is never even a
  candidate, road or no road — "never appear on bad land regardless of road proximity" holds by
  construction, not by a runtime check.
- **`_civVillageAcceptProb(roadDist, suitScore, roadFalloff, suitLo, suitHi)`** — a new pure,
  independently unit-tested function — is the soft accept test replacing dense mode's old
  unconditional accept. `roadProb = exp(-roadDist/roadFalloff)` decays smoothly from 1 at a real road
  (found via the new `_civRoadProximityQuery`, a bucket-grid nearest-point query over resampled LAND
  way segments, the same shared bucket technique `_civSeedVillages` already uses for spacing
  rejection). `suitProb` ramps 0→1 between the relaxed floor and `SETTLE_SEED_THRESH=0.42` — land
  good enough that the strict, unconstrained base pass would have seeded it on its own, i.e.
  genuinely "great land." `accept = max(roadProb, suitProb)`: either signal alone can qualify a
  candidate (near a road on so-so land, OR great land far from any road — both explicitly requested),
  and they stack for a village that is both. `roadFalloff` reuses the existing `VILLAGE_SPACING_KM`
  spacing constant rather than inventing an independent decay tunable.
- **Zoom-reveal threshold bumped for "~60%."** `CIV_VILLAGE_ADDON_LOD=2.4` (was v1.68's
  `CIV_ROADSIDE_VILLAGE_LOD=2.0`, framed by the owner as "~50%"), scaled by the same 6/5 ratio the
  owner's new figure implies (`2.0×6/5=2.4`). Still comfortably past every existing `CIV_LOD_PLACE`
  tier; still no small-dot fallback below it, unlike every other settlement kind — the deep,
  deliberate reveal stays.
- **`p.roadsideVillage` renamed to `p.villageAddon`** throughout (the LOD gate in `drawCivLayer`, the
  pick-gate in `_civSelectPlaceAt`) — the tag no longer implies "road-anchored only," since a village
  can now land well off any road on sufficiently good land.
- **One checkbox, one flag.** `civVillageDensityChk`/`_civVillageDensity` (v0.76) and
  `civRoadsideVillagesChk`/`_civRoadsideVillages` (v1.68) are both gone, replaced by
  `civVillagesChk`/`_civVillages`. `_CIV_VILLAGE_CAP=200` is reused as the one additive-layer cap
  (was dense mode's overall-placement cap; `_CIV_ROADSIDE_VILLAGE_CAP=120` is retired).
- **Measured on a real generated world** (seed 31337, 800 km / 512 px): baseline 35 settlements;
  with the toggle on, 235 total (200 addon villages, hitting the cap). A direct comparison of the
  pure seeding function against the SAME base places/suitability/RNG seed — real roads vs. none —
  accepted 200 (capped) vs. 192 with no roads at all, and of the 200 accepted, 76% sit within the
  road-proximity search window (i.e. plausibly road-biased) while the remaining 24% got in purely on
  high suitability, off-road — both explicitly requested behaviors, both observed.
- **Tests**: the v0.76/v1.68/v1.69 village-mode smoke blocks (`R.village`, `R.villageToggle`,
  `R.roadsideVillages`, `R.roadsideVillagesToggle`) are retired and replaced by `R.villagesUnit`
  (5 deterministic assertions on `_civRoadProximityQuery`/`_civVillageAcceptProb` in isolation — the
  road/no-road/floor/great-land/soft-falloff claims proven exactly rather than statistically) and
  `R.villages`/`R.villagesToggle` (13 assertions: off-by-default, capped, real settlements, spacing,
  land, suit floor, base-tier-unaffected, toggle-off restores baseline, pick-gate, a comparative
  road-bias sanity check, checkbox wiring, regional-population estimate) — 18 new assertions in all.
- **Known scope cuts**: `roadFalloff`'s decay scale reuses `VILLAGE_SPACING_KM` rather than being
  independently calibrated; the comparative road-bias check uses a generous slack (`+5`) rather than
  a strict inequality, since a candidate's acceptance can shift which OTHER nearby candidate a
  spacing rejection blocks — a real but small effect, disclosed rather than asserted away; the ~60%
  zoom framing is a proportional bump of v1.68's own un-calibrated "~50%" constant, not independently
  measured against a literal percentage (same disclosed cut v1.68 carried).

### v1.69 — Roadside villages now also factor in settlement suitability

Owner, immediately after v1.68 shipped: "They should still also factor in settlement suitability."
v1.68's `_civSeedRoadsideVillages` walked the road network and blue-noise-spaced candidates against
existing settlements, but never consulted `currentSettlementSuitability()` — a candidate could land
on a genuinely poor site as long as it was spaced correctly and on dry land. Civ-layer only. Hash vs
v1.68 **ALL IDENTICAL** — the new toggle still defaults off, and the suitability field itself is
unchanged.

- **The `suit` field `_civIterativeAutoWorld` already computes at its own top-of-function
  `currentSettlementSuitability()` call is now threaded into `_civSeedRoadsideVillages(places, ways,
  rng, suit)`** rather than re-derived — the same "one field for view + placer" (v1.30) discipline
  every other placement pass already follows, so a roadside village's site quality can never
  disagree with what the rest of auto-populate scored the same cell.
- **At each arc-length step along a way, the function now searches a small local window
  (`searchR = round(spacing/3)` cells, so it scales with `VILLAGE_SPACING_KM` rather than being an
  independent constant) for the highest-suitability DRY cell that also blue-noise-fits the existing
  bucket grid**, instead of taking the raw interpolated point and only checking spacing + land. This
  replaces the old two-step "interpolate then `_civSnapLand`" dance (which never looked at
  suitability at all) with a single pass that is both more precise (chooses the best nearby site,
  not just the first dry one found) and simpler (no separate re-check after snapping, since the
  chosen cell is already guaranteed dry and spaced by construction).
- **A window with no cell clearing `ROADSIDE_VILLAGE_SUIT_THRESH=0.32` is skipped outright** — the
  road determines roughly where a village could be, suitability still decides whether that stretch
  is worth settling at all. `0.32` is deliberately the SAME relaxed threshold `villageMode` (dense
  grid) already uses, not a new number: a roadside village's rough position is already constrained
  by the road, so it's held to the same "still real, not the single best site in the region" bar
  dense mode accepts, not the stricter unconstrained 0.42 the normal pass uses.
- **The dry-land test is inlined from `_civSnapLand`'s own predicate** (land ≥ sea level, not a water
  body, not sub-cell lake-flooded) rather than calling `_civSnapLand` itself — needed because the
  function now evaluates dryness across a whole search window, not a single spiral-outward probe.
- **Measured on the same seed/resolution v1.68 was verified against**: 112 villages added (down from
  120 — some candidates that v1.68 would have force-placed on marginal ground are now correctly
  skipped), every one scoring ≥0.32 on the real suitability field (min 0.320, mean 0.428 — well above
  the floor, confirming the local search finds genuinely decent sites rather than barely-passing
  ones), spacing and land constraints unchanged from v1.68.
- **Tests**: 2 new smoke assertions, extending the existing `R.roadsideVillages` block rather than a
  new one (`allMeetSuitThreshold`, `meanSuitAboveThreshold`).
- **Known scope cuts**: unchanged from v1.68 (reveal threshold not independently calibrated against a
  literal percentage; `_civAutoRoutes` alone doesn't re-seed roadside villages; only the primary
  map-click pick site is zoom-gated).

### v1.68 — Roadside villages: a sparser alternative to the dense grid, revealed only at deep zoom

Owner: the existing "Dense village grid" option (v0.76) "sometimes feels waay to populated on the
map" — wants the function KEPT, but a sparser alternative for when it's off, with villages spaced
along the settlement generator's own routes instead of the suitability grid, and the whole additive
layer visible only once zoomed in "roughly 50%" (including their ways). Investigated the placement
pipeline and zoom conventions before building (`_civIterativeAutoWorld`'s routing order, the
`civWays` point-format inconsistency CLAUDE.md's v1.42 entry already warns about, the existing
`CIV_LOD_PLACE`/`CIV_LOD_ROAD` zoom-gate convention) and confirmed one design fork with the owner via
`AskUserQuestion` before writing any code: real, persisted settlements (chosen) vs. a purely
decorative render-time overlay. Civ-layer only (block 2). Hash vs v1.67 **ALL IDENTICAL** — the new
toggle defaults off, so `generate()`/`render()` are untouched by default.

- **`_civSeedRoadsideVillages(places, ways, rng)`** (new) walks every LAND way in the FINISHED
  network at `VILLAGE_SPACING_KM` (10 km — the same constant dense-village mode already uses, for a
  consistent feel) arc-length steps, blue-noise-rejecting each candidate against existing settlements
  AND previously accepted candidates via the same shared bucket-grid `fits`/`take` technique
  `placeMapIconsRuled`'s relief scatterer uses (v1.26) — just walking a polyline instead of scanning
  an area. Each accepted candidate is nudged onto dry land via `_civSnapLand` (the same primitive
  crossroads promotion already uses) and re-checked against the bucket grid after the nudge. Bounded
  at `_CIV_ROADSIDE_VILLAGE_CAP=120` (roughly half `_CIV_VILLAGE_CAP`, since these are ADDITIVE on
  top of whatever the normal pass already placed).
- **Must run AFTER routing is fully finished** — the same v1.39 rule this whole function already
  respects for `_civSnapToWaterEdge`. Called from `_civIterativeAutoWorld` right after the sea-routes
  block (every routing pass, including the crossroads re-route, is done by then) and BEFORE the
  final network-metrics/population pass, so new villages are swept up by exactly the same population/
  food-shed/faction-aggregate math every other hamlet gets — no bespoke formula needed. Gated on
  `_civRoadsideVillages && !villageMode` — has no effect while Dense village grid is checked,
  literally "when the dense option isn't active." Never called from `_civAutoRoutes` (the standalone
  "Generate Roads" button), which per v1.64 never touches `state.places` — extending it would break
  that established contract.
- **Deliberately does NOT get network-metrics edges (`aIdx`/`bIdx`) of its own** — these are minor
  roadside stops sitting ON an existing edge, not new junctions. Reading `_civNetworkMetrics` first
  confirmed it builds its own adjacency purely from way ENDPOINTS, so an interior-of-a-way village
  naturally scores as an isolated single-node component — the correct answer for what it is, no
  special-casing required.
- **Zoom-gated visibility reuses the file's OWN existing convention, not a new invented one.**
  Reading `drawCivLayer` found `CIV_LOD_PLACE`/`CIV_LOD_ROAD` are already compared directly against
  ONE raw zoom number (`zoom=_lodOn?_lodZoom:viewT.scale` — the Tiled-LOD viewer pins `viewT.scale`
  at 1 while `_lodOn`, per the file's own comment) for EITHER camera, unconverted — the two zoom
  variables already occupy the same conceptual role by construction. `CIV_ROADSIDE_VILLAGE_LOD=2.0`
  is a new threshold in that same family, deliberately deeper than every existing `CIV_LOD_PLACE`
  tier (hamlet's own 1.4 is the previous deepest) — a single tunable constant, not independently
  calibrated against a literal "50%" (there is no existing 0–100% zoom convention on the main map to
  calibrate against — disclosed, not silently invented). Below it, a roadside village's pin is fully
  hidden — unlike every other kind, it gets NO small-dot fallback, since the whole point of the
  additive layer is to stay out of the way until zoomed in.
- **"Including their ways" needed no extra code.** Every `CIV_LOD_ROAD` tier is already shallower
  (≤0.7) than `CIV_ROADSIDE_VILLAGE_LOD` (2.0), so a village's own supporting road segment is always
  already visible by the time the village itself reveals — satisfied by construction, not a new rule.
- **`_civZoomRaw()`** (new, factored out of `drawCivLayer`'s existing inline expression, bit-identical
  by construction) is reused by the new pick-gate in `_civSelectPlaceAt` — a roadside village below
  the reveal threshold can't be clicked on the map either (it's still reachable via the Settlements
  table at any zoom, since it's a real settlement).
- **UI**: a new "Roadside villages (space along routes)" checkbox next to the existing "Dense village
  grid" one, off by default, same wiring convention (`_civRoadsideVillages` transient module global,
  not serialized — mirrors `_civVillageDensity`'s own comment on invariant 6).
- **Verified on a real generated world** (not just read): 120 roadside villages added (hit the cap),
  every one a real named/populated/factioned hamlet, minimum inter-village and village-to-existing-
  settlement spacing exactly at the spacing floor, 100% on dry land, zero effect with Dense village
  grid on, exact baseline settlement count restored when the toggle is off, and the pick-gate
  correctly hides/reveals a village across the `CIV_ROADSIDE_VILLAGE_LOD` threshold.
- **Tests**: 9 new smoke assertions (`R.roadsideVillages`/`R.roadsideVillagesToggle`).
- **Known scope cuts**: the reveal threshold is one flat constant, not independently calibrated
  against a literal percentage (disclosed above); `_civAutoRoutes` (Generate Roads alone) doesn't
  re-seed roadside villages, only full Auto-populate does; only the primary map-click pick site
  (`_civSelectPlaceAt`) is zoom-gated — the Settlements table, right-click menu, and other place-pick
  tools reach roadside villages regardless of zoom (the table is the intended off-zoom access path).

### v1.67 — A water-driven convergence loop could return a physically absurd, unblocked stage

Owner pasted a full Journey Planner "Severe" verdict — an 18-month, 4253 km, 14-stage journey with
several stages reading 525%–1475% of carrying capacity, all showing the identical flat 0.450 load
multiplier and no hard block — ending with "Somehow it feels like it is way too long for travel
time." Root-caused with a direct reproduction of the report's own Stage 11 numbers
(`terrain:'Hills', infra:'Ruined Region', biome:'Hot Desert', dryKm:215, km:293.0,
transport:'Baggage Train', groupSize:2, hours:12, pace:'Forced March', cargoKg:200,
supplyDays:20, animals:{mule:1}, wagons:1`) before writing any fix. Civ-layer only (`jpCalcLand`).
Hash vs v1.66 **ALL IDENTICAL** — the fix only changes when a stage returns `blocked`, never any
generated field.

- **The gap v1.63 left open.** v1.63 (`JP_LOAD_INVALID_RATIO=1.50`) checks the UN-iterated `ratio0`
  — cargo plus a flat, non-iterating water estimate from `jpCapacity` — before the convergence loop
  runs, catching a stage that's hopeless from cargo alone. But the loop's OWN water term is measured
  each iteration from `dryKm ÷ the speed reached so far`: a real feedback loop (slower speed → more
  days to cross the gap → more water mass → more load → slower speed again) that is structurally
  unrelated to `ratio0` and can diverge far past it. `jpLoadPenalty` floors at a flat 0.45× for ANY
  ratio past 150%, so instead of failing to converge, the loop "converges" at a stable but physically
  absurd number and returns it as a real, computed, summed stage. Reproduced exactly: `ratio0` for
  the reported stage is 0.82 (read as fine), the loop's own converged `loadRatio` is 15.3 — the same
  defect class v1.63 already fixed for `ratio0`, recurring one level deeper for the term that check
  never saw.
- **Fix: check the SAME `JP_LOAD_INVALID_RATIO` cutoff on the post-loop `loadRatio`, not just
  `ratio0`.** One `if` added right after the convergence loop, before the final `waterGapDays`
  recompute. Consistent with every other hard block in this function (wheel/mount/season/`ratio0`):
  `_jpPlan`'s existing `blockedIdx` check already zeroes `plan.totalDays` for any single blocked
  stage — this closes the one gap where a water-driven-during-the-loop overload slipped past that
  net and got summed into the trip total instead.
- **Directly explains the report.** `_jpPlan` only sums `r.days` for non-blocked stages; the reported
  journey had several stages already flagged "resupply infeasible" internally (76/31/51/208 days
  each) while still contributing their absurd duration to the 18-month headline. With the fix, a
  stage this overloaded returns `blocked` and the whole plan reports "Impossible as configured"
  instead of a misleadingly precise total.
- **Fixing this surfaced 3 pre-existing v1.56 smoke assertions that were themselves accidentally
  overloaded** — the third occurrence of exactly the shape v1.63's own CHANGELOG entry already
  named ("test scenarios that were themselves accidentally overloaded"). The "severe non-desert dry
  gap" scenario used a synthetic 3000 km waterless run for a 4-person Walking party with zero pack
  animals — genuinely infeasible under ANY reserve multiplier (even the override plan's flat 1.1×,
  with no tier escalation at all, works out to ~75 days of carried water no configuration of this
  model can carry). Investigated whether more capacity could fix it first (it can't: in a non-desert
  biome, `JP_DESERT_ANIMAL_MOD`'s water discount never applies, so every animal's own water draw
  during a multi-day gap exceeds its pack capacity — adding animals makes a long dry crossing WORSE,
  the same divergent-fixed-point shape v1.48 already documented for fodder). Fixed by shrinking the
  scenario to a genuinely carriable 110 km (still clears the Sparse Wells tier and reads as a real,
  graduated slowdown — the actual claim the test exists to prove) and moving the "can it reach the
  deepest tier" check onto `_jpDesertTierForGap` directly, a pure function decoupled from whether any
  specific party could survive carrying that much water — a capacity question v1.63/v1.67 already
  own, not this labeling test's job. Also corrected a stale comment: an explicit (non-`'auto'`)
  `desertWater` override on a non-desert stage doesn't fall back to the auto tier as the old comment
  claimed — `jpCalcLand`'s override branch requires `isDesert` and its auto branch requires
  `_dwAuto`, so neither fires and the formula shows no water-crossing line at all.
- **Tests**: 5 new smoke assertions (`R.v167`) — the reported stage now blocks with a capacity-
  naming message; a genuinely fine stage is unaffected; the fix reuses the exact v1.63 constant (not
  a new magic number); a mixed-stage plan blocks the WHOLE total while the fine stage's own result
  stays a real computed number; `blockedIdx` correctly names the bad stage. Plus the 3 corrected
  v1.56 assertions above.
- **Known scope cuts**: the convergence loop's OTHER inputs (food, fodder) were already covered by
  v1.48's analogous fix for pack-animal count; this closes the water-specific instance for
  `jpCalcLand` itself. No change to the loop's iteration count, `jpLoadPenalty`'s curve, or any
  terrain/weather/infrastructure table.

### v1.66 — Per-stage pack-animal + vehicle fine-tuning, with a swap advisory

Owner: a 2-person party travels moderate climate for the first 2/3 of a route, then desert; they
want to swap their mule and cart for a camel with travois at the transition, "and a different
supply set-up. For now I cant make any such a finetunement." Investigated before building: the
water/food accounting was already correct and per-stage-aware — `jpCapacity` reads
`JP_ANIMALS[key].water`/`JP_DESERT_ANIMAL_MOD[key].water` fresh from each stage's OWN biome, so a
per-stage species override already got the right numbers. The real gaps were narrower: no
per-stage control for the VEHICLE (only `animalSpecies` had one, since v1.50), and nothing ever
suggested a swap — the existing auto-picker (`jpAutoPickTransport`) only ever picks one species
for the WHOLE route. Owner chose "auto-detect + advisory button" (same shape as v1.53's "faster
mode available") via `AskUserQuestion` before building. Civ-layer only. Hash vs v1.65 ALL
IDENTICAL.

- **`_jpBestPackageForStage(st,eff)`** — the species/vehicle twin of v1.53's
  `_jpBestLandTransportForStage`: same "measure, never silently apply" contract, tests a
  different axis (which animal + which vehicle a Baggage Train should use on THIS stage's own
  terrain/biome, not which of Walking/Mounted/Baggage-Train is fastest). Species comes from
  `jpBestAnimalForContext` — the SAME primitive `jpPickSpeciesForRoute` already uses internally
  per-stage, reused rather than reimplemented, so this can never disagree with the route-wide
  auto-picker's own scoring. Vehicle recommendation is deliberately narrow: only ever proposes
  travois when the current wheeled vehicle (cart/wagon) can't legally cross the terrain
  (`JP_WHEEL_BLOCKED`), or cart when the party is on travois but wheels are viable again (cart
  edges travois on speed per `JP_TRAIN_PACE`, 3.6 vs 3.4 km/h) — it never decides whether a
  vehicle should exist or sizes one from cargo, which stays `jpAutoPickTransport`'s job for the
  whole route. Gated `!isWater&&!bad`, matching `bestT`'s own precedent — a hard-blocked stage
  (e.g. a cart on wheel-blocked terrain) gets v1.65's quick-fix instead, not this advisory.
- **Per-stage Vehicle override** (`data-jps="vehicle"`, mirroring v1.50's "Pack animal" select
  exactly): None / Cart / Wagon / Travois / Sled, translating a type pick into the four flat
  `carts`/`wagons`/`travois`/`sleds` plan fields `jpCalcLand` already reads — `jpCanUseWheels`/
  `_jpEffectiveStagePlan`'s generic `Object.assign` merge needed zero engine changes, exactly like
  v1.65's code-only carts/wagons quick-fix proved works even without a dedicated control. "None"
  explicitly zeroes all four (distinct from "Inherit", which deletes the override).
- **"Use here"** on the new advisory writes species into the same `animals{}` shape the Pack
  animal select uses and vehicle into the same four fields the new Vehicle select uses — one
  click for what those two selects already do manually, matching v1.53's own "Use here" precedent.
- **Verified against the owner's literal scenario**: a two-stage journey (moderate → desert) with
  a 2-person mule+cart Baggage Train shows no advisory on the moderate stage, a "Camel" advisory
  on the desert stage (Desert Hardpack — wheel-viable, so species is the only axis that fires),
  and clicking it applies camel to ONLY that stage while the shared plan and the other stage stay
  mule. A separate scenario (cargo high enough to clear the 10% margin) confirmed the reverse
  vehicle-only direction: a party already on travois where wheels are viable again gets a
  "cart (was travois)" advisory with species correctly left alone.
- **Tests**: 8 new smoke assertions (`R.v166`), same `_jpDeriveStages` monkeypatch technique v1.65
  established, plus a direct-call check that the primitive declines outside its domain (non-
  Baggage-Train, no pack animals).
- **Known scope cuts, disclosed**: Mounted Rider's single mount species is not covered by the new
  advisory (only Baggage Train pack-animal swaps are — the owner's own example); sleds are
  reachable via the manual Vehicle select but not part of the automatic recommendation set (no
  clear "sled beats X" signal outside Snow/Ice, where `sledOnSnow` already gives it a speed
  bonus); the advisory doesn't resize a vehicle from cargo or decide whether one should exist at
  all — both remain `jpAutoPickTransport`'s whole-route job.

### v1.65 — Journey Planner: one-click auto-fix buttons for stage bugs

Owner: "when a stage gives a bug give a button to automate a fix." Extends the existing advisory-
button pattern (v1.53's "Use here" per-stage transport swap, v1.47's "Re-route for mode") to the
per-stage trouble cards `_jpRenderResults` already renders for a blocked stage. Civ-layer only
(`_jpRenderResults`'s local `_stageTrouble` closure + three new click handlers). Hash vs v1.64 ALL
IDENTICAL.

- **Only subcases with a single, deterministic, side-effect-free remedy get a button** — the same
  bar v1.53's "Use here" already set. A vessel swap (would need a "best hull for this stage's
  cargo" resolver that doesn't exist) and any cargo/party-size change (this planner has always
  treated as the user's own call, never silently computed — v1.48/v1.49's own "never applied
  automatically" precedent) stay text-only hints, unchanged. Three subcases qualified:
  - **A winter-closed pass** (`r.seasonal`): "🔧 Turn off seasonal closures" sets
    `plan.seasonalClosures=false` — the one fix that must act on the whole-plan flag, not a
    per-stage override (a season's closure isn't a property of one stage), so it also syncs the
    party form's own checkbox (`data-jp="seasonalClosures"`, otherwise stale — it lives outside
    `#reResults`) and re-renders via the same `_jpRefresh(false)` the checkbox's own handler uses.
  - **A mount-blocked stage or a Baggage-Train-without-pack-animals stage**: "🔧 Switch to
    Walking" — reuses `_civDijkstraPath`... no, reuses the *existing* `data-jps-quick-idx`/
    `data-jps-quick-mode` mechanism v1.53 already built for the "faster mode available" advisory,
    since both write the identical `stageOverrides[idx].transport` field. Zero new click-handler
    code needed for this branch.
  - **A wheel-vehicle-present block** ("Wheeled vehicles cannot traverse…", fires whenever
    carts/wagons>0 on wheel-blocked terrain regardless of transport): "🔧 Remove carts/wagons
    here" clears `stageOverrides[idx].carts`/`.wagons` — and *also* switches that stage's
    transport to Walking. The first cut clearing only carts/wagons was tested end-to-end (button
    click → re-plan → check the stage), not assumed, and failed: a Baggage-Train party with zero
    pack animals just traded this block for `jpCalcLand`'s OTHER wheel-adjacent message ("A
    baggage train cannot operate on X"). Walking with nothing to haul never hits either check, so
    it's the one combination guaranteed to actually clear the stage regardless of what else the
    party carries. `_jpEffectiveStagePlan` is a generic `Object.assign({},plan,ov)` merge, so a
    per-stage carts/wagons override works even though no dedicated UI select exposes it.
- **Every fix was verified by actually clicking the button**, not by reading the code and
  assuming it works — the wheel-vehicle case above is exactly the failure that verification
  caught. `_jpDeriveStages` is monkeypatched per test case (real terrain sampling can't reliably
  hit an exact terrain/biome/season combination) to force the precise blocked condition through
  the real `_jpPlan`/`_jpRenderResults` pipeline, then the rendered button is located and clicked
  for real, and the NEXT `_jpPlan()` call is checked for an actual unblock — the same "swap the
  primitive, verify the whole path, restore it" technique v1.51/v1.61 already use for
  hard-to-reach scenarios.
- **Tests**: 7 new smoke assertions (`R.v165`) — each of the three button types renders with the
  right label on the right blocked message, clicking it genuinely unblocks the stage (not just
  "a button appeared"), and a capacity/overload block still gets no button (the existing
  text-only-hint behavior is unchanged for the disclosed-scope-cut subcases).
- **Known scope cuts, disclosed**: no auto-fix for a vessel-rating/hold-overloaded water block
  (needs a "best hull for this cargo" resolver that doesn't exist yet) or for the two resupply-
  infeasible cases (water-out-of-reach, over-carrying-capacity) — both would require picking a
  cargo/party-size reduction, a decision this planner has consistently left to the user rather
  than silently computing (v1.48/v1.49/v1.53's own precedent). The general "Overloaded" (loadRatio
  >1.0 but still valid) advisory also stays text-only for the same reason.

### v1.64 — Auto-generated roads preserve and prefer manually-drawn ways

Owner: "on parts of routes and ways, when applicable always follow them as they are optimized."
Investigated before writing any fix, since the phrase was ambiguous across three candidate
mechanisms (the manual Route/Way drawing tools, the auto-generated road network, the Journey
Planner's stage derivation). Reading the code found the manual tools already had a real "ride
existing infrastructure" discount (v1.53); the AUTO-GENERATED network builder never did — and
worse, silently destroyed any manually-drawn way on every "Generate Roads" run. Civ-layer only
(`_civAutoRoutes`, `_civHierarchicalNetwork`, plus a shared-helper extraction from
`_civDijkstraPath`) — hash vs v1.63 **ALL IDENTICAL**.

- **`_civAutoRoutes()` ("Generate Roads") used to open with a flat `civWays=[]`**, discarding
  every manually-drawn way — road AND sea-lane — on every run, with no more standing than
  whatever got rebuilt from scratch. A user's own hand-authored infrastructure had zero
  persistence across the one button meant to fill in the REST of the network. Now the manual
  ways (`w.manual===true`, the same flag `_civCommitWay` already sets) are snapshotted before the
  rebuild and preserved in the final `civWays` list alongside the freshly-generated network — the
  same "preserve deliberate user work" precedent as v1.24 BUG-4's confirm() guards, except here
  the fix is to simply not destroy the data rather than asking permission to destroy it.
- **`_civHierarchicalNetwork` (the MST/degree-fill/shortcut builder both "Generate Roads" and the
  one-click "Auto World" use) had zero knowledge of pre-existing ways even where it wasn't
  destructive.** New optional `opts.existingWays`: cells along a supplied way get the same
  `_CIV_EXISTING_WAY_DISCOUNT=0.25` multiplicative cost reduction the manual Route/Way tools
  already apply (v1.53) — extracted into a shared helper (`_civMarkWaysOnGrid`/
  `_civMarkWayNeighborhood`) so the two mechanisms can't drift apart, the umpteenth instance of
  this file's own "two functions answering one question WILL drift" lesson
  (v1.30/v1.33/v1.35/v1.37/v1.46/v1.53...). `_civAutoRoutes` feeds its preserved manual LAND ways
  in as `opts.existingWays`; absent it (every other existing call site), the function is an exact
  no-op fall-through — the same "optional opts.\* addition" contract v1.20/v1.26 established.
- **Measured, not assumed.** On a settlement pair the base auto-network did NOT connect with a
  direct edge (a genuine detour case, not a trivial already-optimal geodesic), adding a manual way
  between them and re-running the network with `opts.existingWays` raised usage on the way's own
  cells from 30 to 134 and turned the previously-indirect pair into a direct edge — the discount
  measurably steers the network, not just theoretically applies.
- **Refactor safety**: `_civDijkstraPath`'s pre-existing discount logic was extracted to the
  shared helpers verbatim (same neighbourhood radius, same 0.25 constant, same civWays/`state.roads`
  handling) — bit-identical behaviour there, confirmed by the existing v1.53 smoke assertion
  (updated only because it string-matched the old inline literal `cost[i]*0.25:1.0`, which the
  extraction naturally rewrote to reference the shared constant — a fragile golden-string test,
  now a behavioural + constant-name check instead).
- **Tests**: 6 new smoke assertions (`R.v164`, isolated on a dedicated fresh world per the v1.24
  BUG-3/v1.46/v1.58/v1.60 test-isolation precedent) — the shared discount constant is 0.25 and
  used by both mechanisms; `opts.existingWays` measurably increases usage on the marked corridor;
  a previously-indirect settlement pair becomes direct; a manual land way survives Generate Roads;
  a manual sea-lane way survives it too; the auto-generated network still builds alongside the
  preserved manual ways (not replaced by them). 1016 / 852 green; hash battery ALL IDENTICAL; 537
  smoke green.
- **Known scope cuts, disclosed**: `_civMstRoutes` (the sea-lane MST used by both "Generate
  Roads" and "Auto World") is NOT threaded with the existing-ways discount or preservation logic
  this pass — a narrower, separate code path left for a future version if requested. The one-click
  "Auto World" pipeline (`_civIterativeAutoWorld`) also regenerates settlements from scratch each
  run, which would leave a preserved way's anchor points pointing at stale settlement positions —
  deliberately NOT extended there this pass (only the standalone "Generate Roads" button, which
  keeps existing settlements untouched, is a safe, unambiguous case for preservation). The Journey
  Planner's own stage derivation (`_jpDeriveStages`) was investigated and already samples whatever
  path the Route tool committed — since that path now more often follows existing infrastructure
  by construction (this fix + v1.53), no separate Journey-Planner-side change was needed.

### v1.63 — Journey Planner: an impossible load is finally flagged, not silently crawled at 45%; Small Caravan gets its own +20% back

Owner supplied a research prompt (`74285d8c-fixloadandcoordinationfactorsprompt.md`) diagnosing two
Journey Planner findings from a fresh audit of the load-penalty/coordination chain, plus three
lower-priority items to confirm and two to flag as unverified. Civ-layer only (`jpLoadPenalty`,
`jpCalcLand`, `JP_GROUP_CLASSES`) — hash vs v1.62 **ALL IDENTICAL**.

- **Finding 1 — `jpLoadPenalty`'s curve floored at a flat 0.45 for ANY ratio past 1.50, with no upper
  bound.** A stage checked against a badly-mismatched carrying capacity (e.g. pure human-porter
  capacity on a leg whose cargo was sized for a completely different stage of the same journey — a
  ship's hold, a wagon leg) at 22×-166× rated capacity got the identical "45% speed, keep going"
  verdict as one at 1.51×. No historical party departs at 22× capacity; it cannot depart at all, not
  "depart slowly." Per the doc's own instruction, the fix is NOT a new load curve (there is no sourced
  data for "how slow is 22× capacity") — it's recognizing the existing curve already has a top
  boundary. **`JP_LOAD_INVALID_RATIO=1.50`** reuses that boundary (where "Near immobile" already
  begins) as an invalidation cutoff: `jpCalcLand` now checks it against the UN-iterated `ratio0`
  (before the convergence loop, which only redistributes food/water — cargo, the term actually driving
  an extreme overload, never shrinks) and returns `blocked` above it, exactly the way
  `jpAssessResupply` already flags "over capacity" rather than silently computing a slow-but-valid
  number. Every graduated band at or below 1.50 (Well loaded → Near immobile) is untouched — a
  moderately overloaded stage still returns a real, merely-penalized speed.
- **Finding 2 — Small Caravan (≤10) carried a neutral `coordMod:1.00`.** v1.43 read
  `docs/research/travel-speeds.md` §5's "+15-25% advantage for a small unescorted party" as license to
  make that band the zero-point everything else is penalized against, rather than giving it the bonus
  §5 actually describes. The owner's follow-up asked for the literal reading: **`coordMod:1.00→1.20`**
  (mid-band of 1.15-1.25). Individual (solo travel, no coordination overhead to speed up from) and the
  three tiers above Small Caravan are explicitly unchanged — the doc was explicit this isn't asked to
  extend further.
- **Three items confirmed, not changed**: `JP_GRAZING`'s speedMod scale (None 1.00 > Partial 0.93 >
  Full 0.85) is correctly ordered — it prices grazing time DURING travel, not a reward for skipping
  fodder, so it decreases as more grazing happens on the move; `_jpDeriveStages`' sea-leg weather/biome
  linkage is intentional, not a bug; the sea-leg chain (`jpCalcWater`) was confirmed to need no changes
  and was left untouched per the doc's own instruction.
- **Two items flagged unverified in code comments, not changed**: `JP_TERRAIN.land["Snow / Ice"]`
  (0.55) and the Galleon's cruise speed in `JP_SHIPS` (13 km/h) — the doc could not source either
  against a reference and asked only for a disclosure comment, not a recalibration.
- **Fixing this surfaced a cascade of pre-existing smoke-test scenarios that were themselves
  accidentally overloaded** — synthetic Walking/zero-animal test plans inheriting a `cargoKg` sized
  for a different (animal-carried) baseline plan, now correctly caught by the new invalidation check
  where they previously just returned an unflagged, heavily-penalized number. Fixed by giving each
  scenario a baseline it can actually carry (matching the v1.49 fix's own precedent), not by loosening
  the new check.
- **Tests**: 7 new smoke assertions (`R.v163`) — Small Caravan's bonus lands in [1.15,1.25]; the other
  four tiers are byte-unchanged; the bonus is measurably present in the composed daily speed (A/B vs a
  neutral tier); `JP_LOAD_INVALID_RATIO` is exactly the curve's own existing 1.50 boundary; an extreme
  overload (22×-166×) is now blocked instead of silently computing 45%; a moderate overload (≤1.50×)
  still returns a valid, merely-penalized speed; `JP_GRAZING`'s scale is confirmed correctly ordered.
  1016 / 852 green; hash battery ALL IDENTICAL; 531 smoke green (up from 524 — 7 new plus fixes to
  pre-existing v1.43/v1.49/v1.51/v1.52/v1.56 scenarios the new check correctly started catching).
- **Known scope cuts**: no new load curve above 1.50× (the doc's own explicit instruction — the honest
  answer is "infeasible," not an invented number); Snow/Ice and Galleon speed stay unverified,
  disclosed in code comments rather than guessed at; the sea-leg chain is untouched by design.

### v1.62 — settlements no longer land on top of each other, even across opposing factions

Owner report: "settlements being created on top of each other even from oposing factions now."
Root-caused by ablation (disable one candidate mechanism at a time, re-measure) before writing any
fix, per this file's own working-rules discipline — not by inspection alone.

- **Root cause: the v1.46 coastal-preference swap never checked its target position against
  existing settlements.** `_civIterativeAutoWorld`'s coastal-swap pass relocates a landmass's worst
  non-port settlement onto a fresh coastal candidate (`best`, drawn from a separate
  `findSettlementSeeds` run over the coastal-masked suitability field). That candidate is spaced
  against the OTHER coastal candidates (via `findSettlementSeeds`'s own suppression radius) and
  checked against its own swap target's current position (the `<2` no-op guard) — but never against
  the OTHER settlements already standing on that landmass. `byLandmass` groups candidates by
  LANDMASS, not faction; since v1.58 let several factions share one landmass (spare faction seats
  seeding extra capitals), this pass could — and, per the ablation below, reliably did — drop one
  faction's settlement directly onto a rival's already-placed town.
- **Measured, not assumed**: an 8-seed sweep of a fresh `_civIterativeAutoWorld(3)` call found
  settlement pairs within 3 km of each other (several at literally 0 km) on 5 of 8 seeds, including
  a same-landmass CROSS-faction pair (a faction-2 town and a faction-3 hamlet at 0 km on seed
  55555, and a faction-6 capital landing on a faction-1 hamlet on seed 31337). Disabling
  `_civOceanDistField` (the v1.46 smoke test's own established technique for turning the coastal
  swap off) eliminated every overlap across all 8 seeds; disabling the water-edge snap instead did
  not — isolating the coastal swap as the sole cause before any code changed.
- **Fix**: the swap now rejects a candidate within `suppR` (the same suppression-radius value
  already computed earlier in this function and used by every other placement pass) of any OTHER
  settlement, falling through to try the next candidate. Four lines, civ-layer only — no engine/UME
  change. Hash vs v1.61 **ALL IDENTICAL** (placement-only fix, `generate()` untouched).
- **Re-measured post-fix**: 0 overlaps, 0 cross-faction overlaps, across all 8 sweep seeds.
  Settlement counts are essentially unchanged (a rejected swap simply leaves that settlement
  non-coastal or tries the next candidate, same as any other "candidate doesn't clear the bar" case
  this pass already handles).
- **Tests**: 3 new smoke assertions (`R.v162`) on 4 of the seeds the pre-fix ablation actually
  reproduced the bug on (dedicated fresh worlds, ambient state restored afterward, matching this
  file's own test-isolation precedent) — no two settlements within 3 km on any seed, no
  cross-faction overlaps, and settlements are still placed in normal numbers (the guard doesn't
  suppress placement outright). 1016 / 852 green; hash battery ALL IDENTICAL; 524 smoke green.
- **Known scope cut**: the crossroads-settlement snap and the all-settlement water-edge snap
  (`_civSnapToWaterEdge`, both v1.39) share the same "move without checking siblings" shape in
  principle, but the ablation showed neither actually produces overlaps in practice on the sample
  tested — left alone rather than fixed speculatively.

### v1.61 — LOD tile refinement: one bad tile can no longer take its neighbours down with it

Owner report (screenshot): a rectangular block of tiles under deep Tiled-LOD zoom, plain Biome view,
permanently stuck on the coarse/unshaded overview — no loading indicator, panning away and back never
fixed it, no baking involved. Investigated extensively before writing any fix: audited every LOD
camera-move path for a missing `scheduleLodRefine()` call (none found — the v1.29 fix already covers
pan/pinch/wheel/joystick/zoom-buttons), checked whether any v1.60 function (`terrainDetailK`/
`riverFlowThresh`) was missing from the Web Worker's function whitelist and would `ReferenceError`
inside a worker (it isn't — neither is called from `pyramidTile`'s dependency chain), ruled out stale
baked-atlas chunks (owner confirmed no baking), and attempted reproduction via Playwright — a single
deep-zoom jump, forced refine cycles, and an aggressive fast zoom+pan gesture sequence across 6 seeds —
without ever triggering a persistently-stuck tile. The exact trigger was not reproduced this session.

- **What the code audit DID find: a real, structural isolation gap.** `refineVisibleTiles()` dispatches
  missing tiles to a Web Worker pool (`GENPOOL.runTiles`) when available, falling back to a synchronous
  `pyramidTile()` loop on the main thread otherwise. Neither path isolated one tile's failure:
  - **Worker side**: the `stage==='tile'` handler looped `results.push(pyramidTile(...))` with no
    per-job try/catch. An uncaught throw inside a Worker's `onmessage` never calls `postMessage` — it
    fires `onerror` on the MAIN thread instead, which `_runTiles` turns into a full REJECTION of
    `GENPOOL.runTiles()`. Since jobs are round-robin split across however many workers exist
    (`i%nw`), that takes down every tile dispatched to the SAME worker, not just the bad one.
  - **Sync fallback**: `refineVisibleTiles()`'s own `for(const n of need)` loop called `pyramidTile()`
    directly with no per-iteration try/catch, so a throw there stopped the loop entirely — every tile
    still queued after the bad one in iteration order stayed uncached too.
  - **Both failures were silently swallowed** by `scheduleLodRefine()`'s outer `catch(_){}`, so nothing
    ever surfaced an error — matching the reported "no loading indicator, nothing visibly wrong except
    the stuck block" exactly, and matching "permanently stuck": since the same tile position is
    recomputed identically on every subsequent refine attempt, a deterministic failure fails forever.
- **Fix: isolate every tile's success/failure independently, in both paths, and log instead of
  swallow.** The worker's per-job loop now wraps each `pyramidTile(...)` call in its own try/catch,
  pushing `null` (already the existing skip-on-falsy convention at the call site) and collecting an
  `{z,col,row,msg}` error record instead of letting one job kill the batch. `_runTiles`'s `onmessage`
  now `console.warn`s any such records. `refineVisibleTiles()`'s sync loop gained the matching
  per-iteration try/catch + `console.warn`. A tile that fails is simply left uncached (exactly the
  existing "not yet refined" state — it shows the coarse overview and is retried on the next debounced
  settle) instead of blocking or crashing its siblings. `bakeVisibleTiles()`/`bakeAllTiles()` share the
  same latent shape but are out of scope this pass — the owner explicitly confirmed baking wasn't
  involved, and finalized-world baking failure modes deserve their own dedicated look rather than a
  drive-by fix bundled into an unrelated report.
- **Bit-identical to v1.60** (`hash_gen1.js` — ALL IDENTICAL): this is pure error-handling around calls
  that never throw on the happy path, so the return value is byte-for-byte unchanged whenever nothing
  fails.
- **Tests**: 5 new smoke assertions (`R.v161`) — force the sync path (disable `GENPOOL.usableForTiles`)
  and monkeypatch the global `pyramidTile` to throw for exactly one visible tile, twice in a row:
  confirms the scenario has multiple visible tiles (so a sibling-survival check means something), the
  bad tile stays uncached rather than crashing, its siblings still get cached, a warning is now logged,
  and a repeated failure on the same tile never escapes `refineVisibleTiles()` as an uncaught rejection.
  1016 / 852 green; hash battery ALL IDENTICAL; 521 smoke green.
- **Known scope cut, disclosed**: the root TRIGGER for the originally-reported stuck tile was not
  identified — this fix prevents it from ever manifesting as a permanent, silent, multi-tile block
  again, and (via the new `console.warn`) makes the underlying cause diagnosable the next time it
  fires, but the underlying "why did `pyramidTile` throw at all" question remains genuinely open. If
  it recurs, the browser console will now name the exact `z/col/row` and error message.

### v1.60 — Rivers/relief become real-km-aware: small regions get genuinely finer drainage detail

Owner: "when choosing a smaller region rivers dont become more visible (i think its a scaling
issue). I cant seem to find any rivers with the branching pattern or length you might expect...
check any and all information on river formation and how simulations/terrain programs
realistically generate them and apply them with proper scaling." Follow-up scope decision (via
`AskUserQuestion`): go all the way, including rescaling the underlying terrain relief, not just the
river-channel threshold. Root-caused by direct measurement before any code changed —
`docs/research/scale-invariant-terrain.md` (new) is the full grounding; read it before touching
`terrainDetailK`, `riverFlowThresh`, or the crater/volcano radius clamp.

- **Root cause, three findings.** (1) The relief pipeline (`fillWarpRows`/`fillHeteroRows`/
  `fillHeightRows`) samples fractal noise at a frequency defined as a fixed fraction of grid width —
  never a real km wavelength — so a 50 km region and a 40,000 km world at the same resolution
  produce statistically identical relief (confirmed: with craters/volcanoes disabled, field/flow
  hashes are bit-identical across a 40000/800/200/50 km `mapWidthKm` sweep). (2) Craters/volcanoes
  are the one place real km *is* used (`radKm/cellKm`), and it had only floor clamps — measured
  largest crater radius reaching **2.8× the entire grid width** at a 50 km region. (3) The
  channel-initiation threshold (`flowThresh=GW*GH*0.0004`) is likewise a pure grid-cell fraction,
  independently reimplemented at ~18 call sites, with zero real-km conversion — ungrounded in
  Montgomery & Dietrich's (1988/1992) real ~0.1–1 km² channel-initiation catchment area, already
  this repo's own cited source for the River-Density/Min-Stream-Order slope-area law.
- **Stage A — crater/volcano radius ceiling.** `clampFeatureRadiusCells(radCells,gw,gh)` caps a
  single feature at `FEATURE_RADIUS_MAX_FRAC=0.12` of the shorter grid axis, applied at
  `placeSizedVolcano`'s and `stampCraters`' radius sites. A universal correctness fix, not
  scale-gated — a crater covering the whole map is wrong at any resolution, and the clamp can
  occasionally bind even at the literal default scale when a large/rare roll would otherwise exceed
  it (measured: 44.8 → 19.7 cells at 800 km/`GW`=256).
- **Stage B — relief noise frequency becomes real-km-aware.** New `terrainDetailK(gw,mapWidthKm)`,
  anchored at `REF_CELLKM=800/2048` — the app's own literal untouched default (`mapWidthKm:800`,
  `resW:2048`, true for both Region and World mode) — the same anchor-at-the-default,
  one-sided-clamp discipline `_V3D_RATIO0` (v0.67) already established for 3D exaggeration, now
  applied to relief-*generation* frequency itself: `Math.min(16, Math.max(1, REF_CELLKM/cellKm))`.
  Threaded into exactly two constants: `heightParams().nf = 5.0*terrainDetailK(...)` (the height
  formula's own noise term) and `heteroParams().hf = 1.5*terrainDetailK(...)` (crustal
  heterogeneity, feeding the same height formula). The one-sided clamp means `k===1` exactly at or
  above the reference cell size — world scale, or any region ≥800 km at ≤2048 resolution, the
  overwhelmingly common case — so both frequencies are bit-identical to v1.59 there. Warp frequency
  and `state.tect.blurR` are deliberately untouched (disclosed scope cuts, §5 below). Costs zero
  extra compute — `fbm()`/`ridged()` are always 6 fixed octaves, and frequency is just a coordinate
  multiplier, not an extra sampling loop.
- **Stage C — one canonical channel threshold, extended once measurement called for it.** Step 1
  consolidated all ~18 inline `GW*GH*0.0004` recomputations into one `riverFlowThresh(gw,gh)` (a
  pure refactor, byte-identical to the old inline literal) — the umpteenth instance of this repo's
  own "two functions answering one question WILL drift" lesson (v1.30/v1.33/v1.35/v1.37/v1.46).
  Step 2 was planned as conditional, evaluated only after measuring Stage A+B — and the measurement
  found a real problem: at a 50 km region, finer relief alone made the drainage network **sparser**
  (channel cells 4233→3345, max Strahler order 4→3), because fragmenting terrain into smaller local
  bumps interrupts the long contiguous downhill runs flow accumulation needs. Rather than
  hand-deriving a Montgomery-Dietrich area constant (which back-of-envelope arithmetic showed could
  as easily produce a no-op as "declare the whole map a river"), `riverFlowThresh` now divides by
  the same `terrainDetailK` that raised the noise frequency: `gw*gh*0.0004/terrainDetailK(GW,
  state.mapWidthKm)` — keeping both knobs coherent and inheriting the identical bit-identity
  guarantee. Re-measured: channel cells 4233→**6001** (+42%, Strahler order recovered to 4),
  distinct polylines 718→**1497** (+109%) at 50 km. At a more realistic resolution (`GW`=1024),
  channel fraction rose **12×** at 100 km and **28×** at 25 km vs. the unchanged default.
- **Bit-identity story, disclosed precisely.** The standard `hash_gen1.js` battery (default/geoid/
  waves/ao/icons scenarios) shows a mismatch vs v1.59 — this is Stage A alone: an isolated A/B with
  craters/volcanoes disabled (removing Stage A's universal, non-scale-gated effect) proves Stage
  B/C's `terrainDetailK` mechanism is bit-identical to v1.59 at the reference scale, exactly as
  designed. Stage A is deliberately not scale-gated (a crater covering the whole map is wrong at any
  resolution) and can fire at any `mapWidthKm`/`resW` combination depending on the random crater/
  volcano roll — including, occasionally, the literal default scenario the hash battery tests. A
  deliberate, measured re-baseline, the same class as v1.36/v1.39/v1.46's placement fixes.
- **Two smoke-suite assertions needed new fixtures, not new logic** — both root-caused to Stage A's
  crater/volcano clamp legitimately reshaping specific hardcoded seeds' terrain/geology, verified by
  independent probe before touching the test:
  1. The v0.94 routing-fix regression test (`routingSeaShortcut`) hardcoded two pixel coordinate
     pairs at seed 424242/`GW`=1024 whose sea-shortcut route collapsed (waterFrac 0.35/0.50 → 0)
     once the clamp reshaped that seed's coastline near those exact pixels. Re-found via the same
     independent-probe methodology (scan coastal land-cell pairs, filter for a genuine water
     shortcut) against the current terrain; the routing FIX itself (`_civDijkstraPath`/mixed-mode
     cost) is untouched and civ-layer-blind to this version's engine changes.
  2. The v1.31 §10.3 "at least one settlement is genuinely fuel-limited" assertion measured whatever
     world happened to be ambient ~40 assertions deep into the smoke run (seed 55555, `GW`=512,
     `mapWidthKm`≈400 — a v1.11 submap-resample leftover) — a small, seed-specific statistical
     property Stage A's clamp legitimately moved to zero fuel-limited settlements at that exact
     seed. Isolated onto a dedicated fresh world (seed 12345, `GW`=256, `mapWidthKm`=800 — the same
     seed this feature's own CHANGELOG entry was originally verified against) inside a save/restore
     block matching v1.46/v1.58's own test-isolation precedent; confirmed "2+ of N iron settlements
     fuel-limited" reproduces on both v1.59 and v1.60 there, so the underlying mechanic is intact —
     only the fragile shared-ambient-state measurement was wrong.
- **Known scope cuts** (full detail in the research doc §5): warp frequency and
  `state.tect.blurR` stay grid-relative — only the height/heterogeneity noise that actually shapes
  ridges/valleys/drainage divides was made real-km-aware; erosion kernels, coastal/glacial passes,
  `carveRiverValleys`, and fjord masking were all audited and confirmed already resolution-relative
  with no real-km dependence, so none needed changes; `TERRAIN_DETAIL_MAX_K=16` and
  `FEATURE_RADIUS_MAX_FRAC=0.12` are reasoned starting values confirmed against the §4 measurements,
  not independently historically calibrated.
- **Tests**: 15 new headless assertions (`tests/test_tail.js`) covering `terrainDetailK` (at/above/
  below reference, cap), `heightParams().nf`/`heteroParams().hf` (legacy value at reference, rise
  below it), `clampFeatureRadiusCells` (no-op under ceiling, ceiling enforcement using the shorter
  axis), `riverFlowThresh` (matches the legacy formula at reference, drops below it for smaller
  regions), and a `buildLandformField` signature spot-check — **1016/1016** green. `tests/run_um.sh`
  (block 4, untouched) **852/852** green. `tests/perf/smoke_gen1.js` **516/516** green (514 + the 2
  fixtures above). `hash_gen1.js` shows the disclosed Stage-A-only mismatch at defaults; isolated
  A/B (craters/volcanoes off) confirms Stage B/C ALL IDENTICAL at the reference scale.

### v1.59 — Civilization menu reorder: faction creation leads into world generation

Owner: "I'd like you to completely redesign and rethink the civilisation menu's under generate and
make it a bottom up system that populates on the map as it does at the moment. So effectively:
Refactor and Consolidate the Generation → Civilization menu from the ground up putting the menu's
in a logical order of faction creation that leads up to the autopopulate (auto routes and
settlements) function." A pure civ-layer (block 2) HTML/DOM reorganization — no engine/UME change,
no new mechanics; every id, JS function, and handler is unchanged, only physical placement/
grouping/labels moved. Hash vs v1.58 **ALL IDENTICAL**. 1001 / 852 green; hash battery ALL
IDENTICAL; 516 smoke assertions green.

- **`#civSubBar` reordered**: `Generation` moves from last to 2nd position, directly after
  `Factions` — **Factions → Generation → Settlements → Economy → Statistics** (was Factions →
  Settlements → Economy → Statistics → Generation, v1.55's faction-first ordering). v1.55 got
  faction *browsing* first, but left the actual world-gen trigger buttons (Auto-populate, Generate
  Roads, Recalculate Territories) dead last, behind three post-generation report pages that read
  empty until Auto-populate has run — the tab order read as "browse, browse, browse, browse, then
  finally the button," not a workflow. Factions stays the default landing tab (`_civSubTab`
  unchanged, still `'factions'`) — you still start by defining who's in your world, but the very
  next tab is now "populate it." The tab click handler keys its `pages` map by `dataset.civsub`
  string, not DOM position, so **no JS change was needed** for the reorder — confirmed by a grep
  audit finding zero positional (`nth-child`/`children[n]`) indexing anywhere touching
  `#civSubBar`/`#civSubGeneration`.
- **`#civSubGeneration` restructured into an explicit Step 1→2→3 sequence** (populate → connect →
  formalize control), dissolving the old three-loosely-labeled-`.sec`-blocks-plus-one-catch-all-
  "Advanced"-`<details>` shape (a grab-bag that existed, per its own v1.16 comment, only because
  those controls "had no named slot in the 4-item Generation list" — never a deliberate grouping):
  1. **Step 1 · Populate settlements** — the existing Auto-populate-counts block, verbatim, sublabel
     reworded.
  2. **Step 2 · Generate roads** — the existing Roads block, moved up to directly follow Step 1
     (was after Territories). Confirmed safe by reading both functions: `_civAutoRoutes()` never
     reads faction/territory state, `_civAutoPolity()` never reads `civWays`/journeys — no
     dependency either direction, so the reorder is purely narrative.
  3. **Ways** — promoted out of "Advanced" to its own always-visible section directly under Step 2,
     since `#civWayList` is literally that step's own output.
  4. **Step 3 · Recalculate territories** — the existing Territories block, now after Ways.
  5. **Provinces** — promoted out of "Advanced", directly after Step 3. Not arbitrary:
     `_civGenerateProvinces()` bails to an empty result until `civTerritory` is populated, so
     Provinces can't move any earlier than this.
  6. **Display** — the four rendering sliders (icon/way scale, territory/way opacity), given their
     own collapsed `<details class="cat-acc">` instead of sharing one with Provinces/Ways, since
     they're pure map styling with nothing to do with generation.
- **The Territory-paint brush radius (`civTerRadius`) moved out of Generation entirely.** It was
  parked inside "Advanced → Provinces," but it's not a generation parameter — it's the brush radius
  for the *manual* Territory-paint tool (`_civPaintTerritoryAt` reads the global `_civTerRadius`).
  New contextual row `#civTerritoryToolRow`, inserted between the existing `#civPoiTypeRow` and
  `#civWayDrawRow`, mirroring `civPoiTypeRow`'s own pattern exactly (`display:none` by default,
  shown only while its tool is armed via the same `_civSetTool`-driven toggle idiom). The pre-
  existing `civTerRadius`/`civTerRadiusV` input-listener wiring in the init IIFE needed **zero
  changes** — it's `getElementById`-driven and doesn't care where the element lives in the DOM.
  Placing the new row between the POI row and the Way-draw row also means the three contextual/
  always-visible rows now read top-to-bottom in the same order as the tool-palette buttons above
  them (place_poi → territory → draw_way) — a free coherence win.
- **`#civSubFactions` is unchanged** — already well-designed (v1.55/v1.57) and already sits first.
- **Tests**: 8 new smoke assertions (`R.v159`) — real DOM tab order equals
  `['factions','generation','settlements','economy','statistics']`; Generation's internal section
  order (via the real Generation tab click) is Step 1 → Step 2 → Ways → Step 3 → Provinces →
  Display, with Generate Roads specifically before Recalculate Territories; `civTerRadius` no
  longer lives inside `#civSubGeneration`, only inside the new `civTerritoryToolRow`; a real
  click-path (arm the Territory tool via the palette) reveals the row and marks the button `.on`,
  arming Inspect hides it again; the slider wiring survives the move (a real `input` event still
  updates `_civTerRadius`/the readout); the old "Advanced" grab-bag is genuinely gone —
  `civWayList`/`civProvincesChk` are no longer inside any `<details>`, and the new Display
  accordion contains neither.
- **Known scope cuts**: none — this is a pure reorganization of existing, working controls; no
  functionality was added, removed, or changed.

### v1.58 — Political fragmentation on a single landmass

Owner, on the settlement-clustering finding v1.57 tracked but didn't fix: "I think its okay in the
base, but if there is only 1 continent it should lead to a division of the continent, based on
geography and industrial prowess (or at least do some research but I think those are easy
denominators to use)." `docs/research/political-fragmentation.md` (new) grounds the fix — most of
history's large landmasses hosted several simultaneous, often rival, polities (Warring States
China, the Indian subcontinent, classical Greece), split along the same two axes historically:
geography (mountains/rivers/distance raising the cost of unification) and economic base (an
independent polity needs a resource base large enough to support itself). Civ-layer (block 2)
only — no engine/UME change. Hash vs v1.57 **ALL IDENTICAL**. 1001 / 852 green; hash battery ALL
IDENTICAL; 508 smoke assertions green.

- **Root cause confirmed by measurement**: `_civIterativeAutoWorld` gave every candidate on a
  landmass the SAME faction id (`contFaction`, one per connected component, cycling if there were
  more landmasses than factions) — so any faction id past the landmass count got zero settlements,
  worst-case a single-continent world where only faction 1 ever got anything (the owner-reported
  27/2/0/0/0/0 split). True whether there was 1 landmass or several; a 1-continent world is just
  the extreme case, not a special one.
- **`_civAssignLandmassFactions(candidates)` (new)** replaces the flat per-landmass assignment.
  `factionCount - L` spare faction ids (only ever >0 when there's real unused capacity — L =
  landmasses with candidates) are apportioned by **highest-averages** (the Jefferson/Webster family
  of apportionment, the same family real seat allocation like the US House uses): repeatedly hand
  the next seat to whichever landmass has the highest `capacity/(seats+1)`, where capacity is that
  landmass's summed settlement suitability — already the file's own unified "land quality +
  resources" signal (v1.30's "one function" rule), reused rather than re-derived as the "industrial
  prowess" denominator. Extra seats become extra capitals, seeded by suitability + blue-noise
  spacing (the v1.26 asset-scatter idiom) so a rival capital is both economically strong and far
  enough from an existing one to be a genuinely separate centre — "geography and industrial
  prowess" restated as the two seeding criteria. Every other candidate on that landmass joins its
  nearest capital.
- **The fine, geography-respecting BORDER is left entirely to the existing `_civAutoPolity`
  ("Recalculate Territories") flood-fill** — zero changes needed there. It already floods outward
  from every settlement's own faction through `buildTravelCost` (a slope-squared cost field), so
  two rival capitals seeded on opposite sides of a mountain range naturally meet and stop near the
  ridge once territory is painted — the historical pattern, not a new mechanism.
- **A landmass's PRIMARY faction id is assigned in the exact same cycling order the old code
  used** — the apportionment loop only ever hands out ids the old code left unused
  (`L+1..factionCount`). When `factionCount<=L` (today's ordinary multi-continent case, which the
  owner explicitly called "okay in the base"), the loop never fires and output is **byte-identical**
  to the pre-fix code — verified directly (same seed, same faction count, identical `factionOf`/
  `capitalOf` down to the array). A strict generalisation, not a special-cased rewrite.
- **Measured on a real world** (seed 12345, 256px, 6 factions defined, 2 landmasses with
  settlements): before, 29 settlements split 27/2/0/0/0/0 (2 factions used); after, 46 settlements
  split 6/2/16/14/2/6 (all 6 factions used, 5 capitals spread across both landmasses in proportion
  to each landmass's own capacity). Settlement total legitimately rises too — more distinct
  capitals means more inter-capital trade-route junctions for the existing crossroads-emergence
  feedback loop to seed, a real and disclosed downstream effect, not a bug.
- **A pre-existing v1.46 smoke assertion needed to become statistically honest, not just
  re-passed.** It compared coastal-preference-pass-ON vs -OFF by independently re-running the
  entire stochastic multi-pass placement pipeline twice per seed across a FIXED sample of 3 seeds,
  asserting the ON run is never worse on any single seed. That comparison was already riding
  cross-run RNG-cascade noise (the swap pass's own settlement moves reshape the road network the
  downstream centrality-driven promote/demote passes read); v1.58 widens the achievable capital
  count per landmass (1 → up to `factionCount`), which widens that same pre-existing cascade enough
  that one seed, out of 3, occasionally showed the ON run in genuinely worse shape by chance alone
  — not the swap logic failing (it can only ever ADD port traits within a single run). Widened to 8
  seeds and changed to an aggregate ("never net-worse across the sample") comparison — the
  statistically honest version of the same claim, the same "small fixed sample is fragile to noise"
  lesson v1.56 already learned about this exact pipeline. Also pinned `CIV_FACTIONS` for the
  test's duration (the same test-isolation discipline v1.24's BUG-3 assertion needed), since
  faction count now genuinely affects placement where it didn't before.
- **Tests**: 5 new smoke assertions (`R.v158`) against `_civAssignLandmassFactions` directly with
  controlled synthetic candidate arrays (this file's own v1.56 "synthetic scenario over sampling
  the ambient world by chance" precedent) — byte-identical baseline when `factionCount<=L`; a
  single landmass with spare capacity uses every defined faction with one capital each; the
  richer of two landmasses earns more of the spare seats and the total matches `factionCount`
  exactly; a landmass never earns more capitals than it has candidates to seed them with — plus
  one real-world end-to-end check (fresh world, default faction roster, more than 1-2 factions now
  get settlements).
- **Known scope cuts**: the swap-pass's own `have<target` search doesn't reason about which
  specific non-capital settlement is "least essential to its own polity" — it just avoids every
  capital, same as before; territory PAINTING itself needed and got zero changes, so a world that
  never runs "Recalculate Territories" after auto-populate shows the new faction split in the
  settlement list/table but not yet in the map's territory-fill colouring, exactly as today's
  existing two-separate-buttons workflow already requires.

### v1.57 — Factions pop-up + one editing surface per faction field

Owner, immediately after reviewing the v1.55 faction-first redesign: "I'd also very much love it to
be in a pop-up menu." Building it surfaced a second, unrelated defect the same conversation had
already flagged by inspection: editing a faction's Government/Culture/Religion/Ag. technology
existed in **two places at once** — an inline `<select>` per field in the v0.62/v1.07/v1.10/v1.16/
v1.54 quick-select pill row, AND the v1.55/v1.54 Faction Inspector drawer's own fields for the exact
same four values, edited independently with no sync between the two DOM nodes beyond both writing
the same underlying array. Both fixed in one pass since the pop-up restructuring touched the same
HTML region. Hash vs v1.56 **ALL IDENTICAL** (civ-layer/UI only — no engine or UME touch). 1001 / 852
green; hash battery ALL IDENTICAL.

- **The pop-up: `#civFactionsModal`, the same shell contract as `#cityViewerModal` (v1.18) and
  `#routeEditorModal` (v1.44).** Fixed-inset overlay, `display:none` until `.open`, its own Escape
  handler, a `_cfmOpen` presence flag other guard sites check the same way `_cvCam`/`_reOpen`
  already do, added to `_overCanvasOverlay`'s scroll-fix list and `_sculptNavSync`'s joystick gate
  (z-index 72, after the City Viewer's 70 and Route Editor's 71 — the three are mutually exclusive
  in practice but the code never assumes that). `_civOpenFactionsModal()`/`_civCloseFactionsModal()`
  mirror `_civOpenRouteEditor`/`_civOpenCityViewer`'s own "refresh on every open, not just on tab
  entry" discipline, so content edited elsewhere (a settlement reassigned to a different faction
  from the map) is never stale when the pop-up is reopened without leaving the Civilization tab.
- **What moved vs. what stayed.** The world overview, the "All factions" roster, and the v1.55
  detail drawer (unchanged slide-in-from-the-left behaviour, just re-scoped from the old sidebar
  `#civFactionsWrap` to the pop-up's own `#civFactionsStage`) all moved into the modal. The
  quick-select pills stayed in the sidebar — they drive `_civActiveFaction`, the Territory-paint/
  Drop-settlement map tools' "paint/drop as" selection, which needs to stay visible and reachable
  while the canvas itself is on screen; a pop-up that covers the map would defeat that. `_civRefresh
  ActiveSubPage()`'s factions branch now closes the pop-up (not just the drawer inside it) on every
  re-entry to the tab — the v1.55 "always land back on the simplified overview" rule, extended one
  level up, so switching tabs away and back never leaves it hanging open over the sidebar.
- **The dedup fix: `_civBuildFactionPicker()` no longer builds the four per-pill selects.** The
  pills' job is picking `_civActiveFaction` for map authoring; editing a faction's own attributes is
  the Inspector's job, now reached via the pop-up — there is exactly one place each of those four
  fields can be changed. Double-click-to-rename stays on the pill (naming a faction while painting
  its territory is a genuine map-authoring action, unlike the other four attributes, and the
  Inspector's own Name field already writes the identical `civFactionNames` array either surface
  would produce).
- **Existing v1.07/v1.10 regression assertions tested the removed UI directly** (`pickerSelects >= 6`
  culture selects, `religionSelects >= 6` religion selects, both counted inside `#civFactionPicker`)
  — genuinely broken by this change, not a false alarm, so both were rewritten rather than deleted:
  they now assert the picker carries **zero** selects of any kind, and that the Faction Inspector's
  own `_civFeCul`/`_civFeRel` selects (opened via the real `_civOpenFactionsModal()`/
  `_civRenderFactionInspector()` path) still list every `CIV_CULTURES`/religion entry and still round
  -trip through `_civSyncToState`/`_civSyncFromState` unchanged.
- **Tests**: 7 new smoke assertions (`R.v157`) — the modal carries the shell class and starts closed;
  the sidebar launcher button opens it with real roster content rendered; `_overCanvasOverlay`
  recognizes it; Escape closes it; the close button closes it; re-entering the Factions tab with it
  left open always closes it; the pill row carries zero selects. Plus the two rewritten v1.07/v1.10
  assertions above.
- **Known scope cuts**: the settlement-clustering finding from the same review session (auto-populate
  assigns one faction per LANDMASS via `contFaction`, not per settlement, so a world with few
  landmasses can read as "favoring the first faction" when it's really "one polity per continent") is
  real, reproduces identically on v1.54 (pre-dating this session's work), and is tracked separately in
  `docs/HANDOFF.md` — a placement-algorithm change, not a UI change, and deliberately not bundled into
  this version.

### v1.56 — Water-constraint softening

Owner: "for water now it quickly gives a hard constraint. Whilst in reality people often drank from
streams/rivers/other smaller stops along a route — aside from literally carrying their own water
sources. Suggest an adjustment to reflect this instead of the hard warning." Researched, measured,
presented as a two-part plan, then approved and built. `docs/research/water-access-travel.md` (new).
Hash vs v1.55 **ALL IDENTICAL**. 1001 / 852 / 496 green.

- **Root cause: two different questions were sharing one threshold.** `_jpStageDryKm` (the Journey
  Planner's "is there freshwater in reach" test) tested `flowField[i] > flowThresh`, the SAME
  `GW*GH*0.0004` constant used file-wide to decide whether a cell renders as part of the mapped
  river network. That constant is not merely a rendering cutoff: at the default river-density,
  `buildRiverNetwork`'s own `channelThreshold(thresh,slopeN,1)` reduces to `thresh` exactly,
  independent of slope — so `flowThresh` IS the engine's own order-1 channel-initiation bar. A
  travelling party historically needed a spring or minor stream, not a mapped river; the planner was
  conflating "renders on the map" with "a party can find a drink."
- **`JP_DRINKING_FLOW_DIVISOR = 16`**, applied only inside `_jpStageDryKm` (`drinkThresh =
  flowThresh/16`) — grounded two ways, not guessed: (1) Horton's laws (bifurcation ratio Rb≈3-5,
  already cited in `docs/research/natural-rivers.md` for the Min-stream-order slider) put a channel
  two Strahler orders below `flowThresh` at roughly Rb²≈9-36× less flow; (2) `tests/perf/
  probe_water_gap.js` (new — samples 60 straight-line routes on a real generated world) measured the
  practical effect directly: at the old threshold 59/60 sampled routes read "dry" (mean 74 km gap);
  at ÷16 that drops to 28/60 (mean 12.4 km) — squarely inside the theoretical band. Scoped to this
  one function; `buildRiverNetwork`, the rendered river network, and every other `flowThresh`
  consumer are untouched, so `generate()`/`render()` stay bit-identical.
- **The auto water-crossing tier (`JP_DESERT_WATER`/`_jpDesertTierForGap`) was gated on `isDesert`**,
  so a non-desert biome with a genuinely long dry stretch got only a flat, ungraduated 1.1× reserve
  and no speed adjustment at all — the same treatment for a half-day gap and a week-long one. The
  gate is removed for the **auto** path only (a measured-gap tier now resolves for any biome); the
  **explicit override dropdown stays desert-only**, since its labels ("Dense Oasis Route") are
  desert-narrative and the control is only ever shown once a journey includes a desert stage. The
  formula trace's "desert route" line is renamed "water crossing" and now prints whenever a tier
  resolved, any biome — not just when `isDesert`.
- **Net effect**: most routes now measure a short gap and get the "Dense Oasis"-tier treatment
  (1.10× reserve, a small speed *bonus*) instead of ever approaching `jpAssessResupply`'s hard "no
  party size fixes this" block — which is untouched and still fires correctly for a genuinely
  week-long waterless crossing, desert or otherwise.
- **A pre-existing v1.51 smoke assertion had to be made deterministic, not just re-passed.** It
  asserted "the gap is measured from real hydrology, not a constant" by picking one arbitrary
  straight-line test route through the ambient (by-then ~500-assertions-mutated) smoke-suite world
  and hoping it happened to show a dry stretch under the old, over-strict threshold — which the
  fix's own intended effect (far fewer routes read as dry at all) broke by design, not by accident.
  Replaced with a controlled synthetic-`flowField` scenario (one pass with no water anywhere near
  the route, one pass with abundant water along it) that proves the same claim with certainty
  instead of by chance — arguably a stronger test of "responds to real hydrology" than the original.
- **Tests**: 8 new smoke assertions (`R.v156`) — the divisor constant exists and is wired in; a
  synthetic "minor stream" that fails the old mapped-river test now reads as freshwater; a
  non-desert biome gets the "water crossing" formula line; a severe non-desert dry gap is genuinely
  slower than no gap and names the matching tier (e.g. "Deep Desert Crossing"); the explicit
  override dropdown stays desert-only (a non-desert stage ignores it); a genuine desert stage's
  explicit-override and auto-tier behavior are both unchanged (regression).
- **Known scope cuts**: `jpAssessResupply`'s hard-block threshold/wording itself is untouched — the
  fix is that it fires far less often, not that the block was loosened; the sea-lane/river-transport
  water rules (`_jpAutoStageVessel`, `jpCalcWater`) are untouched, this is a land-stage-only change;
  `JP_DRINKING_FLOW_DIVISOR=16` is a reasoned mid-value in a theoretically- and empirically-grounded
  9–36 band, not independently calibrated against a historical drainage-density figure for this
  specific engine's grid resolution.

### v1.55 — Faction-first Civilization menu

Owner: "I like the new civilization menu, implement it please in a logical fashion, maybe make it
scroll into the screen from the left. Only showing a simplified version at first (that for examples
only shows a global overview)" — approving and requesting real implementation of the faction-first
mockup/proposal from the prior session (audit: faction culture had zero mechanical effect on
settlement placement — naming-flavor only). Civ-layer (block 2) UI + one `_civFactionAggregates()`
extension only. Hash vs v1.54 **ALL IDENTICAL**. 1001 / 852 / 488 green.

- **Faction-first ordering.** `#civSubBar` reordered to Factions → Settlements → Economy →
  Statistics → Generation (was Generation-first); `_civSubTab` now defaults to `'factions'` (was
  `'generation'`) — factions drive settlement sizing (ag. technology, v1.54) and territory, so
  they're the entry point, while Generation (one-off world-gen trigger buttons) moves last.
- **Overview-first, drawer-on-demand.** `#civSubFactions` is now `#civFactionsWrap`
  (`position:relative;overflow:hidden`) holding two layers: an always-in-flow **global overview**
  (new world-summary line + the existing quick-select pills + a richer roster list showing
  government/ag.-tech/population per faction) and a **detail drawer** (`#civFactionDrawer`,
  `.civ-drawer`) that slides in **from the left** over it when a roster row is clicked — the same
  `transform:translateX(...); transition:transform .22s ease` idiom the mobile `<aside>` panel
  already uses (mirrored to the opposite edge, scoped to this sub-page instead of the viewport).
  `_civRefreshActiveSubPage()` closes the drawer on every entry into the Factions tab, so switching
  away and back always lands on the simplified overview first, never mid-drill-down — the literal
  reading of "only showing a simplified version at first."
- **Territory Fit** (new, in the faction drawer): surfaces the prior session's audit finding
  honestly instead of quietly leaving it unaddressed. `_civFactionAggregates()`'s existing single
  `O(GW·GH)` pass (never a second full-grid scan — this function's own header rule) now also
  accumulates a per-faction terrain-mix (river/coastal/arid/forest/hills cell fractions, reusing
  `buildBiomeRaster()`, the file-wide `flowThresh=GW*GH*0.0004` river convention,
  `_civOceanDistField()`'s cached chamfer DT floored at 1.5 cells per the v1.35 sub-cell-threshold
  rule, and `_civPlaceDefensibility`'s existing mild-upland relative-elevation threshold for
  "hills," since no dedicated biome key exists for it) plus the matching world-mean twin.
  `_civCultureTerrainFit(cultureKey, terrainMix, worldMeanTerrain)` compares the five terrain-themed
  cultures (highland/desert/riverlands/sylvan/maritime) against the WORLD mean (never an absolute
  cut — the same relative-margin discipline v1.30/v1.32/v1.37/v1.46 already established) and returns
  a match/typical/mismatch verdict; `common`/`imperial` are identity-flavored, not terrain-themed, so
  they get composition-only, **never a fabricated verdict** (the same "a verdict with no real signal
  behind it is worse than none" discipline as v1.35's `basis` field).
- **Pre-world guard, found during verification, not by inspection.** Making Factions the default
  tab surfaced a latent bug: `generate()`'s own wrapper calls `_civRenderPlaceEditor()` — which
  reaches `_civFactionAggregates()` via `_civRefreshActiveSubPage()` whenever the Factions tab is
  active — **before** the real `generate()` body runs, on every single (re)generate. Previously this
  branch was dead unless a user had manually opened Factions and then hit Regenerate; defaulting to
  Factions makes it run unconditionally and it crashed inside `currentLithology()`'s `plateCrust()`
  (`plates[plateId[i]].base` on an empty `plates` array) — a real throw inside `generate()`, against
  this file's own "generate() completes synchronously, never throws" invariant. Root-caused to the
  exact `plates=[]` / `field[]`-already-allocated-but-zeroed pre-tectonic-substrate state the file's
  own v0.106 tectonic-inversion comment already documents for imported DEMs. Fixed with an explicit
  `plates.length` guard at the top of `_civFactionAggregates()` returning a safe all-zero shape
  (deliberately not cached, so the very next call after a real world exists falls through normally).
- **Tests**: 9 new smoke assertions (`R.v155`) — default/first sub-tab is Factions; the drawer
  carries the slide-in CSS class and starts closed; a row click opens it and Back closes it;
  re-entering the tab always resets to the overview even with a faction still selected; the overview
  renders real content; `_civFactionAggregates()` exposes `terrainMix`/`worldMeanTerrain` with
  fractions in `[0,1]`; `common`/`imperial` get no fabricated Territory Fit verdict while a
  terrain-themed culture (riverlands) gets a real one; the pre-world guard never throws and returns
  a safe zeroed shape when `plates` is emptied to simulate the pre-generate() state.
- **Known scope cuts**: Territory Fit is read-only (no placement bias added — that would be a much
  larger, separate change the owner hasn't asked for); the roster row's richer summary line doesn't
  yet show Territory Fit at a glance (only in the drawer) — a reasonable follow-up, not attempted
  this pass; Settlements/Economy/Statistics sub-pages are unchanged (only their tab position moved).

### v1.54 — Agricultural technology as a per-faction axis

Owner: the flat 9:1 farmer:urbanite ratio "doesn't sit against a civilisation having mastered
things like the plow and sitting roughly at a level of industrial production, even so barely" —
asked for research into how agricultural productivity actually slides across eras and how to wire
it into auto-populate. `docs/research/agricultural-productivity.md` (new) grounds the whole feature
in the England agricultural-labour-share series (Broadberry & Gardner 2013; CAMPOP): ~90% farming
(9:1) is a *pre-improvement* baseline, not "mastered the plow" — by the time a society genuinely
masters rotation/drainage/selective breeding (England ~1700–1760) agricultural share had already
fallen to 43–47% (~1:1), and "barely industrial" (steam threshing/reaper, first chemical
fertilizer, England ~1800, pre-mass-import) sat at 35% (~0.54:1). Hash vs v1.53 **ALL IDENTICAL**.
1001 / 852 / 479 green.

- **Scope, decided with the owner via `AskUserQuestion` before building**: per-faction (not one
  world-level setting — different peoples on the same map can sit at different rungs), live-editable
  in Generate → Civilization → Factions (not a setup-gate-only archetype), re-read every time
  `_civFoodShed` runs rather than requiring a re-populate.
- **`AG_TECH_LEVELS`** (6 named rungs, Subsistence → Industrial, each carrying a `farmersPerUrbanite`
  calibrated from the research doc) + **`civFactionAgTech`** — a new per-faction parallel array,
  same convention as `civFactionCulture`/`civFactionReligion`/`civFactionGovernment` (append-only
  default, old-save-compatible rebuild-on-load, save-format field). Unlike those three, this is
  explicitly **not pure flavor** — it's read by `foodSurplusRatio()`, so it's disclosed as such
  everywhere it's wired, and the compact faction-picker's new dropdown carries a title saying so.
- **`foodSurplusRatio(soil, refSoil, farmersPerUrbanite)`** gained a third argument. Two real
  formula bugs surfaced only once R (farmers per urbanite) could drop below ~2, which the fixed 9:1
  constant never did:
  1. **`1/R` is the wrong formula; `1/(R+1)` is.** Population balance — R farmers + 1 urbanite,
     uniform per-capita consumption, R farmer-yields must cover R+1 people — gives surplus fraction
     `1/(R+1)`, not `1/R`. The shipped `1/9≈0.1111` (vs. the derived `1/10=0.1`) was never wrong
     enough to notice at a fixed R=9, but `1/R` blows past 100% below R=2, which would make every
     industrial-tier rung nonsensical. **Pinned exactly** at the historical `FOOD_BASE_SURPLUS_RATIO`
     constant when `farmersPerUrbanite===FARMERS_PER_URBANITE`, so every existing world's numbers
     are untouched to the bit (asserted); the corrected formula is used for every other rung.
  2. **`FOOD_SURPLUS_RATIO_MAX=0.35` is a pre-industrial ceiling, not a soil-quality ceiling, and
     using it unscaled silently neutralised this entire feature on first measurement.** Early
     Industrial's/Industrial's *baseline* (0.69/0.87 at median soil) already exceeds 0.35, so every
     cell at or above median saturated at the SAME flat cap as Traditional Agrarian's own best-soil
     case — an industrial faction's food shed came out ~0.5% bigger than a traditional one's on a
     real test settlement, not the multi-fold difference the ratio implies. Caught only by measuring
     a real settlement before shipping, per this file's own discipline. Fixed: the cap now scales
     with `baseRatio` (`FOOD_RICH_SOIL_MULT≈3.15`, preserving the original best-soil-vs-median
     relationship), clamped at a new `FOOD_SURPLUS_RATIO_ABS_MAX=0.95` (a farm household always
     keeps something back). Re-measured: Early Industrial now gives a real settlement **2.66×**
     Traditional Agrarian's food-shed capacity — the order-of-magnitude shift the research predicts,
     not a rounding nudge.
- **`_civFoodShed(p)`** resolves `_civFarmersPerUrbanite(p.faction)` once per call and threads it
  through all three of its `foodSurplusRatio` call sites (own-cell local capacity, the hinterland
  integral, and an exporting settlement `q`'s spare — using `q.faction`, not `p.faction`, there,
  since a supplier's surplus depends on its OWN farmers). The hinterland loop deliberately uses the
  settlement's own faction throughout rather than a per-cell territory lookup — a settlement's
  immediate countryside is, in practice, its own territory, and a per-cell raster read in that hot
  loop would be needless complexity for the same answer.
- **Deliberately does NOT touch yield-per-hectare** (`grainYieldKgHa`/`GRAIN_YIELD_MIN/MAX_KG_HA`,
  soil, carrying capacity, or `currentAgrarianDensity`) — "one lever is enough" (§4 of the research
  doc): `_civPlaceCatchmentCeiling` already represents the land's total food-output capacity in
  population-equivalent terms, calibrated against real historical density (itself a predominantly-
  agrarian mix); the tech-level ratio governs what SHARE of that fixed capacity has to remain in
  agricultural labour versus what can be urban — precisely the real-world "agricultural labour
  share" metric this is calibrated from. Scope cut, disclosed: this models the urbanisation SPLIT of
  a fixed land-based population ceiling, not industrialisation's separate total-population-growth
  effect (better nutrition/medicine, urban migration pulls) — genuinely out of scope, would need to
  touch the carrying-capacity chain this version deliberately left alone.
- **UI**: an "Ag. technology" `<select>` in the Faction Inspector (`_civPopulateFactionEditor`,
  alongside Government/Culture/Religion, with a live hint line describing the rung) and a matching
  compact dropdown in `_civBuildFactionPicker`'s per-faction pill row — same two-surfaces convention
  those three fields already use.
- **Tests**: 8 new smoke assertions (`R.v154`) — the default rung reproduces the exact legacy
  constants to `1e-9` (both the baseline ratio and the cap), every faction defaults to Traditional
  Agrarian on a fresh/old-save world, the corrected `1/(R+1)` formula, an industrial rung gives
  substantially (not marginally) more surplus, low-R never exceeds the absolute cap or 100%, a real
  settlement's food shed changes substantially when its faction's tech level changes, and the
  Faction Inspector select exists/lists every level/writes through. `probe_foodshed.js` re-run
  clean on a fresh default world (14.29% urbanisation, still inside the pre-industrial 5–20% band).
- **Known scope cuts**: no total-population-ceiling growth from industrialisation (see above); the
  six rungs are a discrete ladder, not a continuous slider (matches the World Structure archetype
  convention already in this file); `AG_TECH_LEVELS`' exact `farmersPerUrbanite` values are England-
  specific historical anchors, presented as an illustrative curve, not a claim every fantasy world's
  agricultural history must mirror England's (see the research doc's own caveats, including why the
  later 19th-century England figures — confounded by grain imports — were NOT used to anchor the
  Industrial rung).

### v1.53 — Route drawing actually prefers existing infrastructure; a named per-stage transport advisory

Owner audit: "when a route has been selected each stage of the route has its own optimal
transportation method? And then when a route can use an existing way it prioritises the existing
way? (...two settlements with ports, a small strip of land in between won't get counted into the
route, but the connecting sea-way gets followed)." Travel times re-checked first (`probe_travel.js`
unchanged from v1.52 — still clean, not touched this pass). The other two claims were measured, not
assumed, against a real generated+auto-populated world before any fix. Hash vs v1.52 **ALL
IDENTICAL** (civ-layer, interactive-only — `_civDijkstraPath`/`_civJoinDijkstraSegs` are reached
only from `_civCommitRoute`/`_civCommitWay`/`_jpRerouteForMode`, none of which `generate()` or
auto-populate ever call). 1001 / 852 green.

**The "ride existing infrastructure" discount already existed and was dead code for the one mode
that matters.** `_civDijkstraPath` has carried a comment since v0.6 claiming a route "follows the
way instead of plotting its own direct line" via a land-way ×0.25 discount and a sea-lane
`Math.min(cost,1.0)` cap. The land half works. The sea half doesn't: `_civCommitRoute` (the general
Route tool) always pathfinds in `'mixed'` mode, where open water already costs `_CIV_SEA_COST=0.6`
— strictly BELOW the 1.0 cap, so `Math.min(cost,1.0)` never changed anything there. It only ever
helped `'land'` mode (where water starts at Infinity and 1.0 makes it a ferry crossing). Measured on
a real world: two port settlements with an existing 604 km sea lane between them instead drew a
fresh 790 km route that was **97% overland** — the lane lost by ~3.5% of total path cost purely
because it got zero infrastructure credit. Fix: the sea-lane branch is now a real multiplicative
discount (`cost[i]=isFinite(cost[i])?cost[i]*0.25:1.0`), symmetric with the land-way discount and
keeping `'land'` mode's Infinity→finite behaviour via the same ternary. Re-measured on the same
three sea-lane-connected settlement pairs: the worst case's fresh route went from 790 km/97% land to
601 km/97% water (now matching the lane's own composition); the other two improved from 2%/13%
geometric overlap with the existing lane to 27%/42%. **Fourth time in this file a cost-grid
"preference" discount used a `Math.min` cap against a baseline that was already below the cap** —
the next one written should default to a multiplicative discount unless a hard floor is genuinely
what's needed.

**Per-stage transport mode: the UI's own hint text overclaimed, and the honest fix is an advisory,
not a silent swap.** The Route Editor's per-stage panel said "Travel mode is picked per stage from
its own terrain" — true for water stages (vessel auto-substitutes on a blocked stage, `_jpAutoStageVessel`)
but false for land: `_jpEffectiveStagePlan` plain-inherits `plan.transport` for every land stage
unless the user sets a manual override. This is not an oversight — `_jpPlan`'s own comment already
documents why a silent per-stage land swap was tried and rejected ("a larger party appearing to
travel FASTER once one stage silently swapped Baggage Train for Walking mid-route"). Measured: a
synthetic route crossing Hills/Open Plains stayed "Walking" on every stage with zero variation,
confirming the hint text described behaviour the code didn't have. Fix keeps the no-silent-swap
decision intact and closes the gap the honest way: `_jpBestLandTransportForStage(st,eff)` computes
which `JP_LAND_TRANSPORTS` mode is fastest for one stage's own terrain (same equipment counts — it's
"same gear, different marching order," not invented capacity), and `_jpRenderResults` surfaces it as
a named, dismissable advisory ("⚡ Mounted Rider would be ~63% faster here…") with a "Use here"
button that writes into the exact same `stageOverrides` mechanism the manual picker already uses —
never applied automatically. Threshold >10% (same order of magnitude as v1.50's bottleneck-veto
margin) so a rounding-noise difference never nags. The hint text was rewritten to say what the tool
actually does. Verified: a Hills/Open-Plains Baggage-Train route surfaced "Mounted Rider ~63%/173%
faster" on both land stages; simulating the button click correctly set that stage's effective
transport and speed without touching the rest of the route.

### v1.52 — The Cartography season slider, the last four travel-planner cuts, and V1.915 snapping

Three owner requests: (1) "the climate slider currently does nothing to change the map", (2) the
four scope cuts v1.43/v1.49/v1.51 each deferred (rest days, season drift, sea closure, a cost
model), (3) "check travel times again vs. realistic sources" and "reintroduce snapping to
settlements/POI logic as in Cartalith V1.915". Hash vs v1.51 **ALL IDENTICAL**
(civ-layer only). 1001 / 852 / **464** green.

**The season slider was never broken — it was inert, and its prerequisite lived on a different
tab.** Measured before fixing: at shipped defaults, dragging "Season (render)" from −100 to +100
produced **one distinct render across all five positions**. `_seasonK` (the value the renderer
actually reads) is gated on `state.mode==='biome' && state.climate.seasons` — the second flag is
the "Seasons & Köppen climate" checkbox, which lives on Generate → **World**, defaults off, and is
mentioned only in a dense hint paragraph the slider's own row never referenced. Fixed by making the
slider self-enabling: dragging it to a non-zero value turns `state.climate.seasons` on (never off,
so it can't undo a choice), runs the one-off `refreshClimate()` seasonal-field computation, and
syncs the World-tab checkbox so the two surfaces can't disagree — the same two-places-one-answer
shape this file keeps having to close. A new status line (`_seasonSliderNote`) states in words
whether the current drag is live or, if the map view isn't Biome, genuinely inert and why — a
control that can fail silently is worse than one that says so. Verified via the real `input` event
(not `change` — `bind()` only listens for the former, which is what actually broke the first
attempt at this smoke test): 5/5 distinct renders post-fix.

**The four cuts.** All built from data the plan/world already carries, none of them touching the
speed composition v1.43 calibrated — `probe_travel.js` re-run clean: all 20 reference cases still
land inside their §8 bands, the §9 sample journey still reproduces at 242 vs 244 days.
- **Rest days**: the travel-day/calendar-day split (§10, §5's Andean caravan ethnoarchaeology — one
  rest day per three to five travel days on routes over ~6 days). `jpRestDays` returns the count
  and its own basis string; `plan.days` (Travel time) and `plan.restDays` are now reported
  separately and summed into `plan.totalDays` alongside layovers — never blurred into one number,
  since that blur was what made v1.43's own calibration hard to check in the first place.
- **Season drift**: `plan.season` was one value for the whole trip, so a year-long expedition was
  computed entirely in its departure season. `jpSeasonAt` walks the calendar in 91-day steps; each
  stage is assigned the season at its own **midpoint**, not its start — a first cut used start-day
  and a 17-day final stage beginning on day 90.8 kept the whole of Spring, so a 108-day journey
  never crossed into Summer at all. One pre-pass at uniform-season durations breaks the circle
  (season depends on elapsed days, elapsed days depend on speed, speed depends on season).
- **Sea closure**: the *Mare Clausum*/monsoon analogue v1.51 explicitly left open because the biome
  vocabulary has no "Mediterranean sea" to gate on. The gate that already exists is the water TYPE:
  `jpSeaClosure` shuts Open Sea/Rough Open Sea in Winter (unless `plan.seasonalClosures===false`,
  shared with v1.51's pass-closure control) while Sheltered Bay/Coastal Waters stay open — the same
  distinction the historical record draws between year-round cabotage and a shut open-water season.
- **Cost**: the planner never reported whether a trip was worth making. `jpJourneyCost` prices
  carriage/wages/crew/animal-and-vehicle upkeep/tolls/transshipment in **day-wages** (one day of
  unskilled labour) rather than an invented currency — the ratios between land/river/sea carriage
  (`JP_COST_PER_TKM`, 0.055/0.011/0.002) follow Diocletian's Price Edict, already this file's source
  for food-logistics ratios (v1.33); the absolute price level is left to the world's own owner. A
  cargo trip reports a break-even day-wages/tonne; a party-only trip still prices at a real total
  with `breakEvenPerTonne:null` rather than a fabricated number.
- **Two bugs found only by verification**, both introduced earlier in this same pass: the
  desert-tier auto path resolved before `waterDaysAt` existed to be called (a plain ordering bug,
  caught immediately by syntax); and a smoke test's `mk()` helper called `_jpEnsurePlan(jn)` —
  which returns the SAME object every time — so two cargo "variants" built from it were aliases and
  the second silently overwrote the first. v1.51's own HANDOFF entry names this exact trap; it cost
  a second re-run here for not re-reading it closely enough the first time.

**Found only by taking the verification screenshot**: `const VERSION='1.50'` (block 1, ~line 1978)
had drifted stale AGAIN — two versions after v1.30's own comment on that line warned about exactly
this ("was still reading 1.24 six versions later"). It is display/export metadata only, never
gated on anything hashed or tested, which is exactly why nothing in the suite ever catches it — the
header chip (`#verTag`) reads FROM this constant at load, silently overwriting the HTML span's own
correct hardcoded text, so the v1.51/v1.52 screenshots below were showing "v1.50" until this was
fixed. New smoke assertion derives the expected value from the target filename rather than a
hardcoded literal, so it stays a real check on every future version instead of becoming the next
thing that drifts unnoticed.

**V1.915 snapping, reintroduced.** Gen1's manual `draw_way`/`route` tools (`_civWayWaypoints`/
`_civWaypoints`) pushed the raw grid cell under the cursor with no attraction to anything — a
regression against V1.915's own Route Editor, which snapped a click within radius onto a place pin
or another way. New `_civFindSnapTarget`/`_civSnapPoint` (grid-space, zoom-compensated via v1.23's
own `_civZoomPickR` rather than V1.915's screen-pixel math, since Gen1's tools already work in grid
cells): checks every place (settlement or POI — either plausibly anchors a road) and the nearest
point on every existing way's polyline (civWays' flat `pts` arrays, not V1.915's node-object ways),
nearest-wins with no place-vs-way preference — the same semantics V1.915's own `findWaySnap` uses.
Opt-out via one `state.viz.snapWays` flag surfaced as two checkboxes (Way tool lives in
Generate→Civilization, Route tool in Explore — kept in sync on change, the fifth or sixth instance
of this file needing two UI surfaces to agree on one flag) rather than opt-in: a drawn way SHOULD
terminate on the settlement it serves by default, matching what v1.02's post-hoc endpoint-snap
already assumes for auto-generated roads. A live hover ring (`_civSnapHover`, redrawn only when the
target cell changes) previews where the next click will land, mirroring V1.915's `--pin-snap`
highlight. Verified against a real settlement-terminated road (isolated per-case, since a road
genuinely ending at a settlement can legitimately sit closer than the pin itself — that's "nearest
wins" working correctly, not a bug to route around) and via a real `draw_way` click through
`_civSetTool`.

### v1.51 — Constraints that were stated but never measured

Owner asked whether max travel distances, travel-time calculations, dependencies and constraints
are all properly factored in and adjustable. Audited by measurement — a sensitivity sweep over
every exposed control plus a constraint census — rather than by reading. Hash vs v1.50
**ALL IDENTICAL** (civ-layer only, blocks 1/3/4 untouched). 1001 / 852 / **446** green.

**What the audit cleared.** The TIME model is sound: Σ stage-days equals `plan.days` exactly
(53.8229 = 53.8229), and 15 of 17 exposed controls provably move the answer — pace 30.2–89.7 d,
weather 49.6–124.1 d, infrastructure 33.2–76.4 d, road quality 38.8–81.9 d, hours/day 39.1–105.3 d,
species camel 45.7 – horse 69.7 d. The existing hard blocks (wheels, mounts, vessel ratings, hold
overload) all fire correctly. What was NOT sound was the constraint layer: three of its inputs were
constants standing in for data the world already carries, and one control was inert.

- **THE finding — the resupply requirement was never compared with the map.** `jpAssessResupply`
  states "N resupply stops, every ~X km" from what the party can carry, and nothing checked it
  against the settlements the route passes. Measured on seed 12345: a **908 km route demanded a
  stop every 27 km while its 4 settlements averaged 303 km apart** — reported as a clean plan.
  Worse, `_jpVerdict`'s only line on the subject read *"N stage(s) cannot be resupplied from
  settlements in reach"* while being driven by `resupply.feasible`, set **solely** by
  `totalMass > capacity` — it named settlements while measuring an overloaded pack. New
  `_jpResupplyReach` walks the route's arc length, places every stop on it (endpoints included, a
  party leaves provisioned and arrives), and compares the worst gap against `supplyDays × the
  slowest land stage's km/day`. Now reports **longest gap 545 km vs 29 km carried, 18.9× short**.
  Seventh occurrence of this file's recurring shape: a threshold never compared against the thing
  it describes. The data had been sitting in `plan.stops` since v1.44.
  - Deliberately the FOOD/restock range only. Water stopped being a settlement question in this
    same version (below), and folding the two together would re-blur exactly what was wrong.

- **`supplyDays` was a dead control.** 2 / 7 / 20 / 45 days all returned 16.17 d, identical to
  three decimals. The convergence loop computes `next = baseDaily/lMod*pen`, dividing the
  `supplyDays`-derived load back out and recomputing from a hardcoded `settlementDays = 7`. So the
  field labelled "Supplies carried (days)" — with v1.49's wagon-equation warning attached to it —
  could not change the answer. The food interval is now `supplyDays` itself, so the label is true:
  what you carry is how far you can go between stops. (7 d and 20 d still coincide on some routes
  because `jpLoadPenalty` is a 5-step function, not a continuum — verified as real saturation, not
  a residual bug; the derived range still moves, 29 → 82 km.)

- **Water was a constant while the world carries full hydrology.** `waterGapDays` was hardcoded
  1.5 for every non-desert land stage, and the desert gap came from a manual dropdown that
  `_jpDeriveStages` never auto-derived. Engels' reconstruction of Alexander's logistics makes water,
  not food, the binding term on a pre-industrial column's range, so a constant here disabled the
  single most important constraint in the model. New `_jpStageDryKm` measures the longest run of
  route with no river or lake within a real watering detour (floored at 1.5 cells — v1.35's lesson:
  a threshold below one cell width is unsatisfiable, not strict; sea is not freshwater), and
  `jpCalcLand` converts it to days **at the stage's own speed, inside the existing convergence
  loop**, so a heavily-laden party correctly faces a longer gap in days than a fast one over
  identical ground. Measured 0–61 km dry runs → 0.5–4.9 d gaps across one route's stages.
  `desertWater` gains an `auto` default that picks its tier from that measurement.
  - `jpAssessResupply` now names the CAUSE. "Over capacity" is the symptom of two different
    problems — too much cargo, or a waterless stretch no party size can carry water for — and only
    the second is fixed by a route change, so they must be distinguishable.

- **Party size had no road-capacity term, and bigger parties were monotonically faster.** Measured
  on v1.50 at fixed cargo: 1 person 10.70 km/day, 200 people 18.07, and **100,000 people on a single
  dirt track also 18.07 — the fastest configuration in the model**, because porter capacity grows
  linearly with headcount and erases the load penalty while `coordMod` floors at 0.76. The missing
  physics is that a column can be no wider than the narrowest ground ahead of it and its tail cannot
  start until its head has cleared. New `jpColumnLengthKm` (people in ranks `files` abreast by
  terrain, animals and vehicles near single file) + `jpColumnFactor`, a **damping term on the
  finished daily distance, not another speed multiplier** — passage time is subtracted from the day,
  it does not slow the marching pace. Haste does not exempt it: a forced march does not widen a
  defile. Now 100k → 40 km of column → floored at 0.35 → **6.33 km/day**, against the Roman-army
  figure that a ~30-mile column cannot manage more than 6–8 miles a day. Caravan scale is untouched
  (30 people ⇒ colMod 0.999).
  - Note what was deliberately NOT changed: a 200-person party still beats a lone traveller carrying
    the same 900 kg. That is the carrying-capacity term and it is correct — the cargo genuinely needs
    carriers. The column term bounds the top end, it does not invert the middle.

- **A high pass in winter is now closed, not slow.** v1.50 modelled it as a 33% slowdown (2.78 vs
  4.14 km/day) and let the party through; `travel-speeds.md` §8 writes the mountain-pass
  expedition-average as "effectively 0 in closed season", and the Great St Bernard is shut from
  roughly late September to early June under up to 10 m of snow. `jpSeasonalClosure` blocks
  Mountain Pass / Mountain Trails in Mountain Highland / Tundra / Boreal Taiga in Winter — gated on
  BOTH terrain and a genuinely cold biome, so a low temperate pass is unaffected — and is
  overridable via a new `plan.seasonalClosures`, because a worldbuilder is entitled to a world whose
  passes stay open.

**Surfaced, not just computed.** Three new Results rows — Supply reach (longest settlement gap vs
carried range), Water (longest dry run and the gap in days), Column (road occupied and the share of
each day lost) — each carrying the measurement a user can check against the map rather than take on
trust, plus the column and water lines in the calculation trace.

**Owner follow-up, same version — a broken stage is shown where it can be FIXED.** Owner: *"when a
stage is impossible because it's overloaded or any other reason highlight the stage in the planner
view so a user can edit it."* A blocked stage previously produced one line in the roll-up, nowhere
near the controls that resolve it. `_stageTrouble(r)` classifies each stage as blocked /
unsupportable / overloaded from signals the plan already carries, and the per-stage override cards
now: sort problem stages to the top, force-open both the section and the bad card, tint them, print
the engine's own reason, and — the part that matters — **name the specific control that fixes it**
("Set Carts and Wagons to 0", "Override this stage's vessel below", "Change Season or turn off
seasonal closures"). The summary carries a "⛔ N need attention" badge so it is visible while
collapsed.

**Owner follow-up — vessel information.** Owner: *"for the boats/sea/river I'd like more information
on what is actually fast and sails where."* Cruise speed alone is actively misleading and the tables
say so: the number that matters is cruise × the water's own sailing window (v1.43's
`JP_WATER_WINDOW`) × the fraction of cruise that water realises, and nothing in the UI ever showed
it. New pure `jpVesselDayKm(ship,cat,terrain)` (returns null exactly when `_jpVesselWaterBlock`
refuses — one source of truth with the validator, the v1.23 rule) and `jpVesselMatrix()`. Two
panels: **"Vessels on this route"** ranks every hull on the route's own water legs with km/day, days
and hold, and prints the blocking reason for the ones that cannot make it; **"Vessel reference"** is
the full hull × water-type grid with the fastest hull per water highlighted. The fastest vessel is
genuinely not the same everywhere and is not the highest cruise speed — asserted, since that is the
misconception the panel exists to correct.

**Two bugs found by verification, not by reading** (both mine, introduced earlier in this same
version):
- The auto desert tier was resolved **after** `rawDaily`, so its speed penalty was silently dropped
  while its water reserve was applied — the two halves of one setting disagreeing, which is the exact
  defect class this version exists to fix. The circle (gap needs speed, speed needs the tier) is now
  broken with one pre-pass at the un-modified speed; one pass suffices because the tier is a 4-step
  ladder, not a continuum.
- `waterGapDays` was recomputed at the *top* of the convergence loop, so a run that exhausted its 12
  iterations returned a gap derived from the second-to-last speed — a number the displayed km/day
  could not reproduce. Recomputed once after the loop, making
  `waterGapDays === waterDaysAt(dailyKm)` an invariant of the return value on every path.
- A third was in the test rather than the code, and is worth recording because it cost three
  re-runs: `_jpEnsurePlan(jn)` returns the **same object** every call, so two "plan variants" built
  from it are aliases and the second configuration silently wins for both. Clone before diverging.

**Known scope cuts** (unchanged from v1.43/v1.49, still open): no rest-day / travel-day-vs-calendar
tier split; `plan.season` is uniform for a whole journey, so a 242-day trip is computed in one
season; no *Mare Clausum* / monsoon sea-closure analogue (the biome vocabulary has no
"Mediterranean sea" to gate on); no cost/price/toll model. New to this version: the column model
uses fixed per-terrain file counts rather than a real road-width field, and `JP_COLUMN_FLOOR = 0.35`
is a reasoned bound, not a historically calibrated constant.

### v1.50 — Auto-selection audit + the bottleneck veto

Owner asked whether auto-selection and promotion actually fit each biome/terrain/weight. Audited
systematically in-page (all 13 terrains × 12 biomes × 4 animals, every lookup table cross-checked
against the vocabulary it indexes) rather than by reading, because this file's recurring failure
mode is a table key that silently doesn't match (v1.31's frozen six-key literals, v1.43's
dead-by-gating overrides). Hash vs v1.49 **ALL IDENTICAL** — civ-layer only. 1001 / 852 / **427**
green.

**What the audit cleared.** Zero dead keys: every key in `JP_WHEEL_BLOCKED`, `JP_MOUNT_BLOCKED`,
both animal override tables, `JP_DESERT_ANIMAL_MOD`, `JP_SEASONAL_ANIMAL` and all 12 biomes'
`bestAnimals` resolves against the real vocabulary, all four animals have full desert + 4-season
coverage, and both blocking sets are genuinely consumed. All five promotion paths behave: a light
load stays Walking with no animals; overloaded with auto-promote OFF warns and stays Walking rather
than silently promoting; with it ON becomes a Baggage Train and actually assigns animals; Mounted
Rider sets a valid mount; a water transport handed to the land picker is refused. Wheels correctly
require EVERY land stage to permit them.

- **The defect: `Hills` and `Mountain Pass` had per-animal ratings but no selection rule.**
  `jpBestAnimalForContext` carried explicit rules for 8 of 13 terrains. Three of the five without
  one (`Paved Road`, `Dirt Track`, `Ruins / Debris`) score identically for all four animals, so
  falling through to the biome branch is correct there. The other two do not: mule is rated 0.85 on
  both — the joint best — while camel sits at 0.50 on Mountain Pass. So biome overrode terrain
  exactly where terrain discriminates most, and **a mountain pass inside an arid biome picked a
  CAMEL: the worst of the four animals there, a 70% speed penalty, chosen because the surrounding
  land was dry.** It reads as an oversight, not a decision — the two neighbouring mountain terrains
  both got rules, and mule's Mountain Pass rating was clearly set deliberately. Measured on a real
  world (28 settlement-to-settlement routes, seed 12345): **29.8% of all land route-km** falls on
  these two terrains, Hills being the single commonest land terrain at 26.8%. Fixed by giving both
  the same mule rule the neighbouring mountain terrains already had; non-argmax (terrain × biome)
  combinations fell 20 → 12.
- **`Forest Path` is the remaining 12, and it disagrees with its table ON PURPOSE.** The terrain
  row rates donkey higher (0.85 vs mule's 0.75), but a mule carries 110 kg to a donkey's 80, so a
  mule train moves the same cargo with ~27% fewer animals — which on a long carry is exactly what
  the v1.48 fodder ceiling turns on. Left as-is and now commented, because a rule contradicting its
  own data should be legible as intent rather than re-discovered as a bug every audit.
- **Bottleneck veto (owner request): one demanding stage now switches the WHOLE route's animal.**
  A pack train is a whole-journey commitment — you cannot swap species halfway up a pass — so the
  binding constraint is the worst ground crossed, not the average. The old km-weighted plurality
  vote missed that by construction: a route 80% plains / 20% mountain pass elected the plains
  animal, which then crawled the pass. Now, when a stage is both genuinely punishing for the
  elected animal (`JP_BOTTLENECK_PENALTY` = 20% off the best available) **and** a real share of the
  route (`JP_BOTTLENECK_MIN_SHARE` = 10%), the whole route switches to whichever animal minimises
  total route travel time.
  - **Chosen as a veto rather than a global re-optimisation on purpose.** Pure speed-optimisation
    would have silently flipped Forest Path mule→donkey, overturning the deliberate capacity call
    above. The two thresholds cleanly separate a real bottleneck from a mild preference on the
    shipped table: a camel on a mountain pass is 41% off the best (fires); a mule on a forest path
    is 11.8% off (does not).
  - **Never silent.** The switch is reported in the auto-pick hint naming both animals, the driving
    terrain, its km and the penalty — e.g. *"⛰ Route-wide switch: Camel → Mule for the Mountain Pass
    stretch"*, with the reason line *"mules are chosen for the whole route because of 100 km of
    Mountain Pass — a camel loses 41% of its pace there."* Verified symmetric: 150 km of Deep Sand
    switches a temperate route mule→camel the same way.
- **Per-stage pack-animal override.** The owner's requirement was that the new default stay
  overridable. The plumbing already existed — `_jpEffectiveStagePlan` has always merged
  `ov.animals` over `plan.animals` — only the control was missing, so Results → Per-stage overrides
  gains a Pack animal picker on land stages. The handler translates the species choice into the
  `animals{}` head-count shape the effective plan already reads (carrying the shared plan's
  head-count over, so a swap doesn't quietly drop the train's capacity to zero) rather than
  inventing a parallel override field.
- **`jpAnimalTerrainMod` extracted as the single resolver.** "How fast is this animal on this
  terrain?" was inline in `jpCalcLand`; the new route-fit comparison needed the same answer. Two
  functions answering one question have now drifted five separate times in this file (v1.30
  suitability, v1.33 trade rule, v1.35 water access, v1.38 trade scope, v1.48's own guard), so it is
  one function that both call — asserted by a smoke test reproducing the table independently.
- **Reason attribution fixed.** `reasonOf[key]` was overwritten by every stage voting for that key,
  so the hint showed whichever stage happened to be scored LAST, not the one that carried the vote —
  wrong on 8 of 28 sampled real routes. It now tracks the km-dominant contributing stage.
- **Tests**: 9 new smoke assertions (`R.v150`) — the extracted resolver matching the table exactly;
  Hills and Mountain Pass selecting mule; Forest Path being the *only* non-argmax terrain; the veto
  firing and naming its terrain; the veto being symmetric (sand switches toward the camel); a token
  stretch below the share floor NOT hijacking the route; a bottleneck-free route reporting no
  switch; Forest Path keeping its capacity-chosen mule through the new machinery; reason attribution
  following the km-dominant stage; and an empty land-stage list still answering.
- **Known scope cuts**: the two thresholds are reasoned against the shipped table, not calibrated
  against a historical reference the way v1.34's 9:1 ratio was; the veto picks one animal for the
  whole route (a genuine multi-species train, e.g. camels to the foothills then mules over the pass,
  is what the per-stage override is for, not something auto-selection composes); and species choice
  still ignores capacity except through the Forest Path rule — the count solver handles capacity
  afterwards.

### v1.49 — Route Editor: the answer comes first, and says how sure it is

Owner asked for an audit of the travel planner's layout and of where more information would be
welcome. The audit found a well-calibrated physical model (v1.43 speeds, v1.33/34 food logistics,
v1.48 load solver) presenting itself as bare numbers, below the fold, beside a column of empty
space. Hash vs v1.48 **ALL IDENTICAL** — script blocks 3 and 4 are byte-identical, and blocks 1/2
change only in the version string and the civ-layer planner UI. 1001 / 852 / **418** green.

**The layout finding, measured rather than eyeballed** (1600×1000 viewport, a real 369 km caravan):
`#reResults` had its top edge at **y=1295 in a 1000px viewport — 295px below the fold** — because
Results was a full-width block placed AFTER the two-column row, whose height is set by the 909px
party form. Meanwhile the Stops column beside that form held 90px of content in a 967px row, i.e.
**~875px of dead space directly opposite the inputs**, and the Results block that belonged there was
only 262px tall. You scrolled past every input to reach any answer.

- **Results (and Stops) moved into that column** as a new `.re-col-out`, which is `position:sticky`
  so the answer stays on screen while the taller form scrolls past — the panel's actual working
  loop is "change a control, watch the number move", which the old order made impossible.
  Re-measured: **Results top 1295px → 314px**, body scroll height 1602 → 1226, left-column content
  90px → 670px. `align-self:flex-start` is required for the stick (a stretched flex item can't).
  On the ≤900px stacked layout the sticky is disabled — pinning a block over the form it sits above
  is worse than not sticking.
- **The party column is capped at 820px** so a number input doesn't stretch a metre wide once the
  output column stopped absorbing the width, with the output column taking the slack instead.

**The information findings — three pure readers over the finished plan.** No new modelling, no new
persisted state, no engine changes; they only say out loud what the existing numbers already imply.
Kept as separate pure functions (not inlined into the renderer) so they stay smoke-testable, the
same shape `_jpVesselWaterBlock` already has.

- **`_jpVerdict(plan)`** — the synthesis the panel previously left entirely to the reader. The whole
  prior interpretive layer was one hardcoded ternary on day count. Levels favourable → moderate →
  strained → severe (blocked short-circuits), each driven by a signal the plan ALREADY carries:
  the v1.48 solver's worst-stage load ratio and draft shortfall, v1.31's per-stage resupply
  feasibility, and desert/mountain/storm shares counted only when they're a real fraction of the
  route rather than a token kilometre. **Every contributing signal is returned by name in
  `reasons`** — a verdict that can't say why it said that is worse than no verdict, because the user
  can't tell a real problem from a threshold quirk (v1.35's `basis` lesson, one level up).
- **`_jpConfidence(plan)`** — an honesty band on the day count, rendered directly under the figure
  it qualifies. The per-stage model is a best case: every day a travel day at the stage's own pace,
  no sick animal, no washed-out ford, no waiting on weather. The historical logistics literature is
  consistent that this optimism GROWS with duration, so the band is **asymmetric (downside always
  larger than upside) and widens with days** — ±3/+10% under a week out to −15/+60% at season scale,
  with the season-scale note stating plainly that the figure above is the optimistic bound, not the
  expected outcome. Deliberately NOT a simulated distribution, and says so in its tooltip.
- **`_jpPackRange(plan)`** — the wagon-equation ceiling, stated BEFORE the user configures past it.
  v1.48 catches the divergence but only after the fact; the threshold is knowable in advance and
  belongs beside the control that crosses it. Shown under "Supplies carried" as e.g. *"A mule can
  carry at most ~37 days of its own fodder at this grazing setting"*, escalating in colour as the
  setting approaches and then passes it. **Computed from exactly the inputs v1.48's own
  `fodderInfeasible` guard tests**, so the number displayed IS the threshold that guard fires at —
  one source of truth, not a second estimate of the same quantity (asserted by a smoke test that
  reproduces the guard's arithmetic independently and compares).
- **Day-tick thinning** (`_civDrawProfile`): ticks now thin to a ≥7px target spacing, and — the part
  that was initially wrong and got fixed during verification — the density is judged against the
  canvas's **displayed** width, not its internal 640px backing. Using the internal width let ticks
  crowd on screen while the arithmetic said they were comfortably apart. Labels itself `tick = N
  days` whenever N > 1; the exact per-day list stays in "Daily stages".
- **Tests**: 9 new smoke assertions (`R.v149`) — verdict shape/vocabulary/named-reasons; a
  deliberately overloaded party escalating AND citing the overload by name; the confidence band
  bracketing the estimate, being asymmetric, widening with duration, and null when blocked; the
  pack-range ceiling matching the v1.48 guard within 2%; full grazing reporting no ceiling; Results
  and Stops living in the sticky output column; Results rendering above the fold and no longer
  trailing the party form; and the verdict/band actually reaching the DOM.
- **Known scope cuts, disclosed** (from the same audit, deliberately not attempted here): there is
  still no cost/price/wage/toll model, so a trade route reports time and cargo but never profit;
  `plan.season` remains uniform for the whole journey, so a 242-day trip is computed in one season;
  spoilage is barely modelled; there is no return-leg/round-trip and no side-by-side plan
  comparison (the v1.47 re-route replaces rather than compares). These are the audit's Tier-2/3
  items and are larger than a UI pass.

### v1.48 — Pack-animal count: fodder-feedback divergence, reported honestly

Owner: "250kg of cargo now necessitates roughly 213 mules." Confirmed as a real defect, not a
misreading — root-caused with a numerical simulation of the exact formula before writing any fix,
and cross-checked against an owner-supplied independent reference tool (`Logistics_Planner_v1.html`,
not part of this repo) whose pack-animal math is line-for-line identical. Hash vs v1.47 **ALL
IDENTICAL** — civ-layer only (`jpAutoPickTransport`), no terrain/render path touched. 1001 / 852 /
**409** green.

- **Root cause: a fixed-point iteration with no fixed point.** `jpAutoPickTransport`'s pack-animal
  count solver iterates "how many mules do I need" against a fodder cost that itself scales with the
  count (each animal must carry its own fodder for the trip). A mule's 110 kg capacity against
  5 kg/day fodder breaks even at 22 days with zero grazing — past that, every animal ADDED costs
  more capacity in its own fodder than it contributes, so the iteration diverges: there is
  genuinely no N that solves the equation. The loop was hard-capped at 6 steps and silently
  returned whatever the divergent series had reached by then — a large, plausible-looking number
  that is not a real answer. Simulated numerically outside the app first (`sim_mule.js`): the same
  constants at `supplyDays=200` (default "Partial" grazing) already produced count=191,454;
  `supplyDays≈40–90` lands squarely in the "few hundred" range the report described.
- **The reference tool has the identical unguarded loop** (confirmed by direct comparison,
  line-for-line) — this was never a version-to-version regression to bisect. What the reference
  tool DOES have that this codebase didn't is a separate "recursive supply collapse" advisory
  (multi-leg resupply feasibility, a different code path) — evidence the intent was always to
  report infeasibility honestly, never to let a number run away.
- **Fix: detect the infeasibility analytically, before iterating, not by watching the loop fail
  to converge.** `perAnimalFodder=animalFood*supplyDays*fodderFrac; fodderInfeasible=fodderFrac>0
  && perAnimalFodder>=A.cap`. When true, BOTH the main solver and the wagon/cart draft-animal
  recompute (the same shape, same risk, one line-of-sight away) skip their divergent loops
  entirely and fall back to the naive first estimate (cargo + human supplies alone, ignoring
  animal fodder) — a bounded, honest floor, not a runaway guess. `jpAutoPickTransport` now returns
  `infeasible`/`warn` flags and a hint naming the actual fix: reduce supply days, allow more
  grazing, or add a resupply stop via the existing v1.44 Route Editor Stops feature — not more
  animals, which cannot solve this by construction.
- **Verified with the fix in place** (same simulation harness): `supplyDays=200`/Partial grazing
  now reports count=18 with `fodderInfeasible=true`, instead of 191,454. Full grazing
  (`fodderFrac=0`) never trips the check at any duration, since the animal isn't carrying its own
  fodder at all in that mode — correct, since that path has a real fixed point.
- **Tests**: 5 new smoke assertions (`R.v148`) — a normal short trip stays small and unflagged; a
  very long supply duration on the identical cargo is flagged `infeasible`+`warn` instead of
  exploding; the reported count stays bounded (<50, not hundreds); the hint text names resupply as
  the fix, not more animals; full grazing never trips the check however long the trip.
- **Known scope cut, disclosed**: this reports the infeasibility honestly but does not (yet) make
  `supplyDays` automatically shrink at a passed settlement — the v1.44 Stops/layover feature already
  lets a journey rest/resupply, but the auto-pick solver still treats `plan.supplyDays` as one
  unbroken carry for the whole route. Threading resupply stops into the load solver itself is a
  larger change (the same boundary v1.44's own CHANGELOG entry drew around Stops, deliberately not
  entangled with the load/resupply convergence loop) — left for a future pass if requested.

### v1.47 — Journey re-routing: mode-aware pathfinding for the Route Editor

HANDOFF's "Sea routes are never chosen; travel mode cannot re-bias a route" — the last of the
three items tracked as outstanding after v1.44. Hash vs v1.46 **ALL IDENTICAL** — civ-layer only
(block 2), no terrain/render path touched. 1001 / 852 / **404** green.

- **The multi-modal cost graph already existed — the diagnosis in HANDOFF was stated more broadly
  than the actual gap.** `_civDijkstraPath`'s `mode='water'`/`'mixed'` branches
  (`_civWaterCostGrid`/`_civMixedCostGrid`, both v0.94) already let the general Route-drawing tool
  cross open water when that's genuinely the cheaper option — land ways, sea lanes and navigable
  river reaches (a genuine cost floor via `_CIV_RIVER_COST_BASE`) were already one graph with one
  per-km cost model. Re-reading the code before writing anything, per this file's own discipline,
  found that HANDOFF's "needs a real multi-modal graph… not built" was already false.
- **The actual gap: `_jpDeriveStages` only ever SAMPLES an already-drawn `jn.pts` polyline.**
  Switching Transport in the Route Editor's party form re-scored the SAME fixed line instead of
  re-pathing it — a route hand-drawn as a land march, then switched to "Sea Faring," read as a ship
  sailing over dry land (reported blocked per land-stage classification) rather than a real sea
  route. Fixing this needed zero new pathfinding code, only a bridge from "mode changed" to "ask
  `_civDijkstraPath` for a fresh path" — which is exactly what was genuinely missing.
- **New `_jpModeForRoute(transport)`** — the one place `JP_TOP_MODES`' label strings map onto
  `_civDijkstraPath`'s mode parameter: `"Sea Faring"→'water'`, `"River Transport"→'mixed'` (no
  dedicated river-only domain exists — `'mixed'` gives real river cells a genuine cost floor below
  land, so it prefers a river without requiring one; disclosed as the closest honest fit, not a
  claimed pure-river solver), `"Walking"/"Mounted Rider"/"Baggage Train"→undefined` (the land-only
  default branch).
- **New `_jpRerouteForMode(jn)`** calls `_civDijkstraPath` between the journey's own current
  start/end points under the selected mode, replacing `jn.pts`/`jn.km`/`jn.brks` on success.
- **`_civDijkstraPath` gained a `reachable` field (purely additive — every existing caller,
  including `_civJoinDijkstraSegs`, is unaffected).** The function always returned SOME path, even
  a straight line cutting across genuinely impassable terrain, when Dijkstra never actually reached
  the target (`prev[target]` stays unset) — correct for the manual Route tool's `'mixed'` mode,
  where nothing is truly unreachable, but wrong for a `'water'` re-route between two inland
  settlements, which must honestly report "no route" rather than draw a ship sailing through a
  continent. `reachable=(target===source)||(prev[target]>=0)` distinguishes a genuine path from
  that fallback.
- **An explicit "🧭 Re-route for `<mode>`…" button, never a silent auto-reroute on dropdown
  change.** A hand-drawn route is the user's own work — same precedent as v1.24 BUG-4's `confirm()`
  additions on other destructive actions. `confirm()` before replacing; on decline, `jn.pts` is
  untouched; on an unreachable target, an `alert()` states which mode and that no route connects
  the endpoints, and `jn.pts` is likewise untouched.
- **Tests**: 7 new smoke assertions (`R.v147`) — `reachable` is `true` for a genuine short land hop;
  the mode mapping is correct for all five `JP_TOP_MODES`; a land re-route succeeds and genuinely
  replaces the path; a sea re-route between two inland points reports failure with a reason and
  never mutates `jn.pts`; the button exists and is labeled with the live transport mode; declining
  the confirm leaves the path untouched; accepting replaces it and refreshes the modal.
- **Known scope cuts, disclosed**: "River Transport" prefers rather than requires navigable water —
  a dedicated river-only cost domain would need a new grid, not built here. Re-routing is
  point-to-point (the journey's own start and end), not stop-preserving — a multi-stop route with
  waypoints re-routes end to end, not stop to stop. No automatic re-route suggestion when a mode is
  merely infeasible on the current path (the existing per-stage vessel fallback in `_jpPlan`, v1.44,
  already covers the common case of an unsuitable vessel pick); this feature is reached by explicit
  user action only.

### v1.46 — Coastal settlement preference

HANDOFF's "Settlements with a port still sit inland" — v1.37 fixed coastal DETECTION, v1.40 tried
raising `buildSettlementSuitability`'s coast weight and reverted it (clusters seeds along the
coastline, the suppression radius culls the excess, settlement count halved for two extra coastal
sites). Hash vs v1.45 **ALL IDENTICAL** in every scenario — this is civ-layer (block 2) placement
logic only, never touching `field`/`temp`/`rain`/render. 1001 / 852 / **397** green.

- **A first cut swapped in at most one coastal settlement per landmass, gated on the landmass having
  NONE at all — measured a no-op on the reference seed**, because both landmasses hosting settlements
  already cleared that bar. One port per landmass is not what "preference" means; the report is about
  under-representation, not zero representation. Diagnosed by instrumenting the pass directly rather
  than guessing — the debug counters showed `have>=target` immediately, not a thrown error.
- **The shipped version targets each landmass's own coastal SHARE OF SETTLEMENTS to exceed its
  coastal SHARE OF LAND by `PORT_PREFERENCE_MULT` (3×)** — a real preference (over-representation)
  that scales with the landmass's own geometry: a small island (already mostly coastal) asks for
  little extra, a large continent (mostly interior) asks for proportionally more, without demanding
  every settlement move to the shore. Candidate coastal sites are found by re-running the SAME
  `findSettlementSeeds` primitive the main pass already uses (same threshold, same suppression
  radius) over the SAME `suit` field, masked to land within ocean-shore range — genuine local maxima,
  not an invented "nearest shore" pick.
- **Bounded and landmass-scoped, so it cannot repeat v1.40's failure**: `suit`, the main greedy
  suppression-radius picker, and every settlement outside the landmass being adjusted are untouched;
  the settlement count AT THE POINT THIS PASS RUNS never changes (it only swaps WHERE existing
  settlements sit). Each swap still needs the candidate to clear `SETTLE_SEED_THRESH` like any other
  settlement site, and to cost no more than the SAME 0.60 suitability tolerance the existing
  water-edge snap already accepts for a "sea is genuinely near" nudge — a mediocre coast stays
  unsettled exactly like the rest of placement already works.
- **`_civOceanDistField()`** (new) — the OCEAN-only twin of the pre-existing `_civCoastDistField()`,
  which sources from ANY sub-sea-level cell including inland lakes (wrong for a "sea-lane port" test,
  matching `_civIsCoastal`'s own `oceanOnly` convention). Same cached chamfer-DT shape.
- **Measured** (5 seeds, seed 12345/256px resolution): 3 of 5 seeds unchanged (already saturated
  relative to the 3× target — a correct no-op, not a failure to fire); 1 seed +1 coastal settlement
  (35%→40%); 1 seed 0→1 coastal (a landmass with zero coastal representation before). No settlement
  ever placed in water; no duplicate positions.
- **A large repositioning runs BEFORE routing (same ordering rule v1.39 established) and therefore
  cascades into the crossroads pass**, which reads final settlement positions to decide where trade
  junctions emerge. On the one seed where the swap actually fired with a large displacement, final
  settlement count (after crossroads) moved from 19 to 27 — a real, disclosed side effect of moving a
  settlement's position before the road network exists, not a bug: the water-edge snap already has
  this property, just with smaller typical displacements. Count stayed identical on the other 4
  seeds, where either no swap fired or the swap distance was small.
- **Tests**: 4 new smoke assertions (`R.v146`) — `_civOceanDistField` matches `currentWaterBodies`'
  class-1 cells exactly; the pass never reduces coastal representation vs. a monkeypatched pre-fix
  baseline (`_civOceanDistField` forced to return null, which is exactly its own null guard) across
  several seeds; it demonstrably improves representation on at least one seed (not a dead no-op); it
  never places a settlement in water. Runs against the SAME seeds pattern used to develop the fix, in
  the browser rather than trusting the manual probe alone.
- **Known scope cut, disclosed**: `PORT_PREFERENCE_MULT=3` is a reasonable, un-tuned constant, not
  calibrated against a historical coastal-settlement-density reference (unlike e.g. v1.34's 9:1
  farmer ratio or v1.31's crustal abundance) — a future pass could ground it the same way if the
  current strength reads wrong on more worlds. Crossroads (trade-junction) settlements are
  deliberately NOT re-biased toward the coast — they exist because a route junction is there, and
  historically Christaller market towns are often inland at river fords/mountain passes; pulling them
  coastward would defeat the reason they were placed.

### v1.45 — River deep-zoom fade: the second factor

The v1.41 CHANGELOG entry left one open item: a genuine root-cause fix for deep-zoom river
de-emphasis (356→479 painted px at zoom 32, "a real but PARTIAL recovery... a second factor is
still unidentified"), with the draw gate, viewport cull, baked-atlas path, and stroke-width law
itself already ruled out. Found by ablation: a controlled probe (off-vs-on exact-pixel diff at
seed 12345/256px, zoom 8/24/32/48) toggled `riverSinuosity`, `rdpSimplify`, and `catmullRomSample`
one at a time — all three showed negligible effect — before landing on the real cause. Hash vs
v1.44 **ALL IDENTICAL** in every scenario (the fix sits entirely inside the opt-in, deep-LOD-zoom,
`riverWays`-on vector-overlay branch of `drawLODView`; the default off-LOD render, and even the
same code path at shallow zoom, cannot change).

- **Root cause: a glyph-sizing cap was copy-pasted onto a stroke-width law that didn't need one.**
  `drawLODView`'s river-ways call site computed `const zk=Math.min(8,GW/span);` before handing it
  to `drawRiverWays({px,py,inView,zk})`, which feeds v1.29's own `baseW*sqrt(zk)` stroke-width law
  — a law v1.29 *designed* to self-limit growth via the square root, never meant to need a hard
  ceiling on top. The `Math.min(8,...)` was lifted from `drawLODDebugOverlays`' own SEPARATE local
  `zk`, which caps glyph/marker sizes so they don't clutter the view past ~8×. That's the right
  call for a fixed-size glyph; it's the wrong call for a stroke law whose own math already damps
  growth, because `zk` isn't just a size input here — it's *also*, one line away, the exact same
  `GW/span` factor driving `px`/`py`'s geometry reprojection, which is NOT capped and keeps
  stretching the polyline's on-screen coordinates apart past zoom 8. Capping only the width while
  the geometry keeps stretching means the line reads relatively THINNER the deeper you go — exactly
  the reported "rivers fade out" symptom, and exactly why v1.41's own fix (fading order-1 rivers
  more gently at depth) only partially recovered it: that fix addressed the *alpha* term, not the
  *width* term, and both were fighting the same zoom range for different reasons.
- **The fix is one line**: `const zk=GW/span;` (no cap) at the river-ways call site only.
  `drawLODDebugOverlays`' own glyph-sizing `zk` is a separate local variable in a separate
  function and is untouched — capping glyph size at deep zoom is still the right call, it was only
  ever wrong to reuse that specific cap for a self-damping stroke law.
- **Measured** (seed 12345/256px, exact pixel diff, `riverWays` on vs off): zoom 8 unaffected
  (`Math.min(8,zk)===zk` already there, so this is why the default/shallow-zoom render provably
  cannot change); zoom 32 painted 3,928px capped → 7,020px uncapped (+79%); zoom 48 similarly
  recovers. This is the width law finally reflecting the same uncapped stretch factor the geometry
  reprojection was already using — not a new visual style, a consistency fix.
- **Tests**: 3 new smoke assertions (`R.v145` in `tests/perf/smoke_gen1.js`) — a deep-zoom capture
  confirming `drawRiverWays` now receives the real uncapped `GW/span` (not the old clamp); a
  shallow-zoom capture confirming that value is unchanged from before (`Math.min(8,zk)===zk` there
  already); and a world-agnostic exact-pixel-diff comparing the live uncapped render against a
  monkeypatched reproduction of the old `Math.min(8,...)` behavior on the identical view, asserting
  the fix paints meaningfully more river pixels at depth. Compares the fix to the old behavior
  rather than to an absolute pixel count, so it isn't sensitive to which world the smoke suite
  happens to be running against.
- **Known scope cut, disclosed**: this closes the "second factor" v1.41 flagged as unidentified,
  but per-tile seam residue (v1.29's own disclosed ~2× shared-boundary measurement) and any further
  legibility tuning of the order-1 de-emphasis curve itself are unrelated, still-open items — not
  touched here.

### v1.44 — Route Editor: journey editing gets a full screen

Owner: "when clicking a route I wish it to open a full screen menu so we can properly make edits.
(Having the route itself as a visual in the upper left corner. and change parameters such as stops,
traveler options, carriage, season and weather (with the current suggestion system kept in place)."
Hash vs v1.43 **ALL IDENTICAL** in every scenario (block 2 only — new modal shell + persisted plan
fields, no terrain/climate change). 1001 / 852 / **390** green.

- **Not a second implementation — a bigger home for the one that already existed.** The Journey
  Planner's party/results forms (transport, cargo, per-stage overrides, calculation trace) already
  existed, cramped into the Explore sidebar's `#civPlannerSec` behind nested `<details>`. `_jpRenderPartyForm`/
  `_jpRenderResults`/`_civDrawProfile` were retargeted from `#jpParty`/`#jpResults`/`#civProfileCv`
  to `#reParty`/`#reResults`/`#reProfileCv` inside a new `#routeEditorModal`, mirroring the v1.18 City
  Viewer's shell contract (`.open` class toggle, own Escape-to-close, added to `_overCanvasOverlay`'s
  scroll-fix list and `_sculptNavSync`'s joystick-hide gate — both via the same DOM-class-check
  pattern `_sculptNavSync` already uses for the City Viewer, since a block-1 function must never
  assume a block-2 `let` has run). The sidebar collapses to a `_jpPlan()`-sourced one-line summary
  (`#jpSummary`) + an "Edit route…" button; clicking a journey card now opens the modal directly
  instead of toggling an inline reveal.
- **The route visual (upper-left) is a new, bounded rendering surface** (`_reDrawRouteMap`): a static
  top-down crop of the route's bounding box, painted from `currentCartBiome()`/`CART_BIOME_COLS` —
  the same real painted-biome raster the "bclass" debug view already samples, never invented terrain
  — with the polyline, stop markers, and green/red start/end pins drawn over it. Deliberately static
  (no `_cvCam`-style pan/zoom): a route is a path already fully visible in one crop, unlike a city.
- **Stops**: `_jpPlan()` now computes `_civPassedSettlements(jn.pts)` exactly ONCE (previously
  `_jpRenderResults` had its own second call to the same function — the fifth-plus occurrence of
  this file's "two call sites answering one question" pattern) and attaches a stable `_jpStopKey(s)`
  plus `layoverDays` from the new `jn.layovers{}` map. A rest/resupply day count per stop is additive
  on top of travel time (`plan.totalDays = plan.days + plan.layoverDays`), deliberately NOT folded
  into the load/resupply convergence loop `jpCalcLand`/`jpCalcWater` run — a planned stop is where
  the party resupplies, not a leg it must carry extra supplies across.
- **Traveler options / Carriage**: pure relabeling of the existing "Travelling party" →
  "Traveler options" and "Animals & vehicles" → "Carriage" sections — zero logic change, matching
  the owner's own vocabulary.
- **Weather**: previously derived ONLY from `jpWxWeighted(biome,season)`'s probability-weighted
  average — no manual control existed. New `plan.weatherOverride` (default `"auto"`, merged into
  every plan including loaded pre-v1.44 saves via `_jpEnsurePlan`'s existing default-merge pattern)
  lets Auto stay exactly as before — `jpWeatherFactor` falls straight through to `jpWxWeighted` when
  unset — while a forced condition ("what if a storm hits") overrides it for every stage, still
  applying the pace animal's own weather affinity (`JP_ANIMAL_WEATHER_OVERRIDE`) on land. The
  formula trace labels which mode produced the number (`weighted Summer, ...` vs `forced: Storm`).
- **Season stays where it was** (a `<select>` next to the new Weather one) — only relocated, not
  changed.
- **Two bugs caught by manual browser verification, not the automated suites**: the modal's own
  header summary line (`#reSummary`) was written once at open time and never refreshed by
  `_jpRefresh`, so a Weather change silently left a stale "km/day" figure on screen; and the
  Weather `<select>`'s own explanatory hint ("Auto — weighted..." vs "Forced condition...") went
  stale the same way, since a non-structural field change doesn't rebuild the party form. Fixed by
  folding the summary into `_jpRenderResults` (which runs on every refresh) via a new
  `_reRenderSummary(jn,plan)`, and by marking the Weather `<select>` `data-structural="1"` — the
  same convention Transport already uses for exactly this reason. Screenshotted before and after to
  confirm both actually update now, since neither is meaningfully assertable from a headless
  Playwright `evaluate()` (the value is materially "does the text on screen change").
- **Known scope cuts**: clicking a route's LINE on the map does not open the editor (only the
  Journeys sidebar card does) — building zoom-aware polyline hit-testing wasn't part of this ask and
  the sidebar entry point already exists; the route-map thumbnail does not handle an antimeridian-
  wrapping route (bounding-box only, a documented edge case, not the common regional-route path);
  "stops" means rest/layover days at settlements the route already threads through, not waypoint
  (path) editing — the route's own shape stays whatever the Route tool drew.

### v1.43 — Journey Planner recalibrated against historical travel rates

Owner supplied `docs/research/travel-speeds.md` (an overland/maritime research report whose §7
evaluates this tool's own numbers) with: *"the current planner seems to roughly take 37% longer than
historically recorded. And compose a fix."* Measured before changing anything, per this file's own
discipline — and the measurement moved the diagnosis: the report's §7 critique is about the speed
TABLES, but the largest single error turned out to be somewhere it never looked. Hash vs v1.42
**ALL IDENTICAL** in every scenario (the whole change is block 2 planner code and data). 1001 / 852 /
381 green.

**What was measured first.** A probe calling `jpCalcLand`/`jpCalcWater` directly over 20 reference
cases against §8's bands, plus a second probe running the report's own §9 sample journey (8,423 km,
45% sea by dhow, 6-person merchant party) through the real calculators, plus a third generating a
world at seed 12345/512px and deriving stages along a real 830 km inter-settlement route.

- **The dominant defect was the auto-derived INFRASTRUCTURE tier, not a speed table.** On that real
  world, 61% of the route's km auto-tiered as **"Hostile / Dead Zone" (×0.50)**, 8% "Ruined Region",
  31% "Sparse", and **zero km ever reached "Stable Settlements"** — mean **4.0 km/day**. `JP_INFRA_TIERS`
  demanded 8 settlements per 100 km (one every 12.5 km) for its top tier, an ABSOLUTE count, while the
  generator places towns and cities — about 30 for an entire world — and never the villages and
  waystations that actually line a road. A scale mismatch, not a tuning error. Tiers are now
  **multiples of the world's own measured route density** (`_jpInfraContext`), the same self-correcting
  technique v1.25 used for sea level, v1.31 for density and v1.34 for soil. Three further rules:
  claimed faction territory floors a stage at "Sparse Settlements" (inhabited country is not
  wilderness); "Hostile / Dead Zone" now needs a real signal (ruins terrain / Ruined Wastes biome),
  never merely "no town within the pick radius"; and an open-sea leg is not tiered by LAND settlement
  density at all. A length floor (`JP_INFRA_MIN_SAMPLE_KM`) stops a 40 km stage beside one settlement
  reading as 2.5 per 100 km — you cannot measure a rate finer than the sample you have. Measured
  after: **4.0 → 10.5 km/day** on the same route, 61% "Stable Settlements" / 39% "Ruined Region", no
  spurious tier at either end.
- **"Baggage Train" was one 3.0 km/h bucket for three historically distinct configurations.** 3.0 × an
  8 h day is 24 km/day *before any modifier*, i.e. the unmodified best case already sat at the bottom
  of §8's 20-30 calendar band for a trade-road caravan, so every modifier below 1.0 pushed it under.
  New `jpTrainPace()` resolves the base from the train's slowest CARRIER — the report's own §5.1 rule
  — giving ox wagon 2.2, cart 3.6, travois 3.4, pack animal 4.8, porter 2.6 km/h.
- **The per-animal terrain and weather affinity tables were dead for anything but a lone rider.**
  `JP_ANIMAL_TERRAIN_OVERRIDE` / `JP_ANIMAL_WEATHER_OVERRIDE` were reachable only through `mountKey`,
  which is only resolved for "Mounted Rider" — so a single camel rider got the desert affinity while a
  ten-camel CARAVAN, the historically dominant desert configuration, got none: Deep Sand at the generic
  0.50 instead of camel's 0.85, a sandstorm at 0.40 instead of 0.70. `jpResolveMount` already means
  "the slowest animal present sets the column's pace", which is the right rule for a train too, so the
  pace-setter is now resolved whenever the party has animals. Not a one-sided buff — the same lookup
  gives a camel train 0.20 in marsh against the generic 0.40.
- **Sea distance was driven by the LAND hours/day slider.** §3.3's finding is that the three sea zones
  differ in daily sailing WINDOW as much as in speed (a coastal hull anchors at nightfall, an
  open-water passage sails through it), and the model had no window axis — so a 14 h plan put a
  sheltered bay at 120 km/day against its 25-40 band while an 8 h plan put open sea below its own
  floor: the same journey, opposite errors, from one control that should never have applied. New
  `JP_WATER_WINDOW` (bay 9 h, coastal 11 h, open sea 22 h, rivers 11-12 h) replaces `hours` for water
  stages, and `JP_TERRAIN.sea` becomes the fraction of the vessel's cruise speed actually realised
  (0.38 / 0.60 / 0.55 / 0.20). v1.23 fixed the ORDERING of these three and explicitly left the
  magnitudes alone; §7 measured the residue.
- **Land terrain ratios re-anchored to §8** ÷ the dirt-road midpoint: paved road 1.20 → **1.50** (§7:
  "too slow for a genuine Roman-equivalent paved road, by a wide margin"), rocky 0.60 → **0.50**,
  desert hardpack 0.65 → **0.80** (flat hard ground is no obstacle on foot, and the camel case is now
  carried by the override table). Mountain pass, forest trail and marsh already matched.
- **A surface bonus is damped for animal-paced modes** (`jpSurfaceGain`): pavement speeds a walker up a
  great deal but barely speeds an ox, whose gait is the ceiling — which is why §8's ox-wagon row is its
  tightest, highest-confidence band and does not rise on paved road, and why 66-103 km/day belongs to
  the relay courier (fresh horses), not to the pavement. Penalties below 1.0 are deliberately NOT
  damped: bad ground costs an animal at least as much as a walker.
- **§5's small-caravan rule was inverted.** The report recommends +15-25% travel-day for an unescorted
  party of ≤10; the old ladder gave a 6-person party a 0.97 *penalty*. Re-tiered so ≤10 is the
  reference (1.00) and the larger tiers carry the whole spread (1/0.88 ≈ +14% to 1/0.82 ≈ +22%), which
  inflates no base speed. §5's large-escorted-caravan case still reaches its ~41 km/day Hajj figure by
  BUYING infrastructure — the "Operational Waystations" tier.
- **Result.** All 20 reference cases land inside their §8 bands (was 9 of 20), and the report's own §9
  sample journey now reproduces at **242 days against its 244** (was 366, +50%). The owner's reported
  ~37% overshoot is resolved with room to spare on both sides.
- **Tests**: 12 new smoke assertions (`R.v143`) pinning composed km/day inside the §8 bands plus each
  structural rule. Two v1.23 assertions were re-expressed: they tested the raw `JP_TERRAIN.sea`
  multipliers, which no longer carry the ordering on their own (the window does), so they would have
  read Coastal 0.60 > Open 0.55 and failed a correct model. They now assert the composed km/day —
  which is what the owner's original 97-vs-82 report was about, and is invariant to where in the
  composition the physics lives.
- **Known scope cuts**: no rest-day / calendar-vs-travel-day tier split (§10's two-system architecture)
  — the planner reports one day count, now calibrated so it reads as the calendar-average tier the
  historical records themselves are; no seasonal gate (monsoon lock, closed mountain passes are a
  threshold effect §4 describes and this model has no state for); no political/toll friction or
  tropical attrition term; the relay-courier tier (cursus publicus, the Yam) is still not a separate
  mode. `JP_SHIPS` cruise speeds and `JP_ROUTE` wind/current rows are unchanged — the calibration
  moved the window, the surface ratios and the base land pace, not the vessels.

### v1.42 — Land and sea routes are finally compared

Owner: "land routes are sometimes still preferred where a sea route would be faster/more efficient",
with a screenshot of a road tracking around a coastline between two coastal towns. Hash vs v1.41
ALL IDENTICAL. 1001 / 852 / 369 green.

**First, a correction to my own earlier diagnosis.** I originally attributed this to the Journey
Planner. That was wrong: `_jpDeriveStages` samples *"the drawn route"* — journeys are user-drawn, not
auto-routed. The orange line in the screenshot is a generated **road** (`civWays`), so the defect is
in road generation.

**Root cause: the two networks are built independently and never compared.**
`_civHierarchicalNetwork` lays a land MST over EVERY settlement, then `_civMstRoutes(ports,true)` lays
a separate sea MST over the ports. Nothing asks whether a land edge is redundant because the same two
towns are already linked by water. As with the journey planner's surface map, it is not that land wins
a comparison — no comparison happens.

- **`_civPreferSeaRoutes`** compares them using the cost model already established for the food shed
  (Diocletian's Price Edict: road ≈ 40–56× sea, ≈ 5.5× river per unit distance). A land way duplicating
  a sea link is dropped when the water route is decisively cheaper (`SEA_PREFERENCE_MARGIN`).
- **It cannot orphan anyone.** A road is only dropped when removing it leaves both endpoints still
  reachable overland — i.e. it is not a bridge in the graph sense. That honours the owner's caveat that
  "if a sea or river way is still needed it should still do just that": local and inland traffic keeps
  a continuous road network.
- **Two silent no-ops found while verifying**, both of which would have shipped as a feature that
  quietly did nothing:
  1. Sea-lane endpoints sit **offshore** (the harbour approach, not the town square), so matching them
     with the tight radius that suits land ways found zero sea links.
  2. `_civMstRoutes` emits points as **`[x,y]` arrays** while other builders emit `{x,y}` objects —
     `pts[0].x` was `undefined`, producing NaN coordinates and no matches. The accessor now handles both.
  Before these, the pass reported 0 links examined; after, it correctly examines and judges them.
- **Measured** (seed 12345/256px): 1 land way examined as a sea-parallel candidate, 0 dropped — on this
  seed only 3 sea lanes exist among 29 settlements, so there is almost no redundancy to remove. The
  mechanism is verified to run and judge; worlds with more coastline are where it will bite.

## v1.41 — Deep-zoom rivers: reproduced, partially fixed

Owner: "rivers seem to disappear when zooming with LOD-tiling." Hash vs v1.40 ALL IDENTICAL (the
default un-zoomed render is untouched). 1001 / 852 / 369 green.

**Reproduced by measurement**, after two earlier probes failed to. Diffing the `#view` canvas with
`state.viz.riverWays` off vs on at seed 12345/256px:

| LOD zoom | 1 | 8 | 24 | 32 | 48 |
|---|---|---|---|---|---|
| river px (v1.40) | 20,334 | 14,926 | 3,337 | **356** | 238 |

The collapse is between zoom 24 and 32 — a cliff, not the gradual decline you would expect from
simply having less world on screen. And the geometry is genuinely there: at zoom 32 the view contains
**15 river polylines with 40 points**, versus 18 / 56 at zoom 24. The rivers are being drawn; they are
being drawn nearly invisibly.

**Cause: v0.96's anti-barcode de-emphasis.** Order-1 trickles draw at 0.4 alpha and 0.55× width so the
thousands of them recede into the raster water tint at world scale. That is right when the whole map
is on screen and wrong once you have zoomed into an 8-cell window, because at that scale the headwater
stream IS the subject — and under LOD the vector overlay is the **only** river renderer
(`renderBiomeTileRGBA` never draws the network's water colour), so a faded order-1 line means no
visible river at all. The de-emphasis now fades out with zoom: full strength at `zk=1`, gone by the
LOD cap. At `zk=1` the factors are exactly v0.96's, so the default render cannot change.

**Partially fixed, stated honestly.** Zoom 32: 356 → **479**; zoom 48: 238 → **421**; zoom 8:
14,926 → 15,875. That is roughly a 35% recovery at deep zoom, not a full one. The remaining shortfall
is not explained by the de-emphasis, and 15 polylines crossing a 512×328 canvas should paint more than
479 px — so there is a second factor still unidentified. What is now established and recorded: the
draw gate, the viewport cull, the baked-atlas path (85 tiles baked, zero difference) and the stroke
width law are all ruled out, and the geometry reaches the renderer.

### Still open

- **Sea routes are never chosen; travel mode cannot re-bias a route.** Diagnosed in full (see HANDOFF):
  `_jpRoadCells()` skips sea lanes outright so a sea route is never a candidate, and
  `_jpDeriveStages` classifies an already-fixed path so mode selection has nothing to act on. Fixing
  it needs a real multi-modal graph (land ways + sea lanes + navigable river reaches, each with a
  per-km cost) and re-pathing on mode change. Not built.
- **Coastal preference** — see v1.40: raising the coast weight halves the settlement count, so it was
  reverted; on seed 12345 settlements sit a median 127 km from the coast and are inland legitimately.

## v1.40 — Placement can finally tell an island from a speck

Owner: "some settlements are on the tiniest landmass instead of preferring the larger (richer)
island." Hash vs v1.39 ALL IDENTICAL. 1001 / 852 / 369 green.

- **Root cause: `buildSettlementSuitability` scored CELLS and had no concept of a body of land.** A
  one-cell islet whose own cell happened to score well beat a merely-decent cell on a large fertile
  island, because nothing in the formula knew the islet was an islet.
- **`buildLandmassQuality`** labels connected land components once (8-way, wrap-aware in world mode)
  and derives per cell how good the LANDMASS is — log-scaled area against the world's own largest,
  plus mean carrying capacity. **Relative, not absolute**: an archipelago world is legitimately all
  small islands, and an absolute area cut-off would depopulate it. Same self-calibrating discipline as
  the sea-level histogram, the density normalisation and the soil reference.
- **The penalty needed a knee.** A first cut used `1 − quality` directly, which is non-zero on nearly
  every cell — a broad reweighting rather than a sparse exception — and halved the settlement count
  (29 → 12). Anything on a landmass at or above `ISLET_KNEE` of the world's best now pays nothing.
  This is the third time the v1.30 rule has bitten (v1.36 corridors, v1.40 first cut): **a term that
  is not ~zero almost everywhere is reweighting the map, not expressing an exception.**
- **Measured** (seed 12345/256px): settlements on a landmass under 1% of the largest **→ 0**; smallest
  occupied landmass is now 22.5% of the largest; settlement count unchanged at 29; urbanisation
  14.29%; every settlement still within its food shed.

### Coastal preference — attempted, and honestly not improved on this seed

Raising the coast weight 0.14 → 0.20 was tried and reverted: it clusters seeds along the coastline,
the suppression radius then culls them, and the count halved (29 → 12) for a gain of two coastal
sites. Keying a longer water-edge snap on the `port` trait is a no-op (that trait is assigned later,
in the crossroads pass). The snap now reaches 2.5× further and tolerates a bigger suitability drop
when the SEA specifically is within range, which will help worlds where it is — but on seed 12345 the
coastal share is unchanged at 6 of 29, because settlements there sit a median **127 km** from the
coast. They are inland because the landmass is large, not because they were misplaced.

## v1.39 — Water-edge snap enabled (placement now runs before routing) + popup overflow

Owner prioritised the water-edge snap. The blocker was ordering, and the fix was to move the pass
rather than patch its consequences. Hash vs v1.38 ALL IDENTICAL. 1001 / 852 / 365 green.

- **`_civSnapToWaterEdge` is ON by default.** v1.36 ran it at the END of `_civIterativeAutoWorld`,
  after `_civHierarchicalNetwork` had already routed between the OLD positions — so moving a
  settlement left every way that terminated at it stopping short, breaking v1.02's "each way reaches
  its settlement" guarantee and starving the urban-morphology layout of the primary streets it builds
  around (v0.97). v1.36 tried to carry the endpoints across and it did not fully restore either.
  Running the snap **before the first routing pass** makes the problem not exist: routes are built
  against final positions. Both previously-failing assertions are green with the snap enabled.
- The crossroads settlements added later are snapped too, but **before their own re-route** — not
  snapping them left them the only unsnapped settlements in the world. Snapping anything after routing
  is what must never happen.
- **Measured** (seed 12345/256px): channel-bottom occupancy **6 → 1**, mean flood exposure 0.295 →
  0.247, no settlement in water, urbanisation 14.32% (still in band), every settlement within its food
  shed. **On-water-edge share is 65.5%, not the 79.3% v1.36 measured** with the snap running at the
  end over all 29 settlements — running earlier, before the crossroads pass exists, nudges 5 rather
  than 9. The ordering is now correct and the guarantees hold; the edge share is lower than the
  earlier (unshippable) configuration and is reported as measured rather than as the older figure.
- **Edit Settlement popup overflowed its own box.** The container was already capped at 82vw/80vh,
  but its CONTENT was not: the Connected-roads and Exports lines are long comma-separated runs with no
  break opportunity, so they forced a horizontal scrollbar and pushed height past the cap. Now wraps
  (`overflow-wrap:anywhere`), clips horizontally, and every child is `box-sizing:border-box` inside a
  `min(82vw,340px)` / `min(80vh,660px)` box.

### Reported but NOT addressed in this version

Stated plainly so they are not assumed done:

- **Rivers disappear when zooming under LOD tiling.** Not investigated.
- **Settlements still sit inland even with a port.** The snap improves flood placement but the
  underlying issue is that placement does not weight coastal sites strongly enough; v1.37 fixed
  *detection*, not *preference*.
- **Settlements seeded on tiny islets rather than the larger, richer landmass.** Placement has no
  landmass-size or landmass-quality term at all — it scores cells, not bodies of land.
- **Land routes chosen where a sea route would be faster, and travel-mode should re-bias the route.**
  Journey-planner work, untouched here.

## v1.38 — The City Viewer now reports the settlement's own trade, not its faction's

Owner: "exports and imports in the pop-up view are not the same when you press open city view — that
window doesn't seem to read from the same information." Correct. Hash vs v1.37 ALL IDENTICAL.
1001 / 852 / 365 green.

The two panels were measuring **different things**, both correctly:

- the settlement popup showed `_civPlaceTrade(p)` — the settlement's OWN balance of trade;
- the City Viewer's Economy section showed `_civFactionAggregates()` — its FACTION's.

Each was right for what it measured, but the City Viewer is a *settlement* view, so leading with the
faction's figures made two surfaces contradict each other about the same town. The v1.33 audit
unified the trade *rule* across every surface; it did not catch that this one was reporting a
different *scope*.

The viewer now leads with the settlement's own Exports/Imports — the identical `_civPlaceTrade` call
the popup makes, so the two cannot drift — plus the derivation basis, the food-deficit warning when
no route can supply it, and the salt source. The faction rows stay below as clearly labelled
context, which is what the extra space in that view is actually good for.

A smoke assertion now renders both panels and checks that every good the popup lists appears in the
viewer, so this specific divergence cannot come back.

## v1.37 — Coastal settlements exist again; salt is not a universal shortage

Two owner observations, both correct, both with the same root shape as earlier bugs. Hash vs v1.36
ALL IDENTICAL. 1001 / 852 / 363 green.

- **No coastal settlements at all.** `_umSiteKindFromTerrain` still measured its box with
  `_umWaterNearKm()` (~2.1 km). v1.35 established that every water test must be floored at ≥1.5 cells
  because a finer threshold is unsatisfiable on a quantised grid — and fixed the river gate and
  navigability, **but missed this one site**. At 3.13 km/cell the radius rounded to a single cell, so
  the coastal test only saw a 3×3 box and a settlement two cells from the shore read landlocked. The
  reference world produced **zero** `coast`/`bay` settlements. Now on `_umWaterReachKm()`.
- **An estuary was reporting river access, not sea.** `riverthrough` is the case where a settlement
  has BOTH sea and river in reach — the London/Hamburg/Bordeaux pattern, which is a *sea*-trading
  town. Combined with the above, the world went from **0 to 6 settlements with sea access**.
- **Salt was an unmet critical need for all 29 settlements.** The checklist only ever consulted the
  salt *resource* field (arid evaporite). Pre-industrial salt has three sources and only one is a
  deposit: sea evaporation (available to any coast — solar pans want dry summers, but boiling brine
  works anywhere with fuel, which is how north-western Europe made its salt), rock salt / brine
  springs, and salt lakes. New `_civSaltAccess(p)` covers all three, and a settlement never imports
  salt it can make itself.
- **Deeper cause behind the salt symptom: the checklist could never mark anything as met.** Its test
  was an absolute `> 0.25` against `rc.mean`, which is a windowed catchment MEAN — the same
  peak-scale-threshold-against-an-average mistake v1.31 fixed for archetype matching and v1.33 for the
  trade rule. Every category read as unmet for every settlement, so "critical gaps 29/29" carried no
  information. Now relative to the world mean. Gaps are differentiated: salt 23, fibre 26, luxury 20,
  husbandry 15, fuel 14, metals 12, ceramics 7, mean 4.0 of 7 categories.
- **Fibre was measuring the wrong thing** — the category listed only `alum`, which is a dye MORDANT,
  not fibre. Wool and flax come from livestock and cropland, both of which the engine models, so it
  now reads `_civPlacePastoralBalance`. Alum scarcity remains a real dye-trade dependency; it is not
  the same need as having something to spin.

## v1.36 — Water-edge placement + natural corridors: groundwork, NOT yet delivering

Owner asked for two placement behaviours: settlements near water should sit on the river bank or
coastline **behind the floodplain**, and crossroads should attract settlement. **Neither is enabled by
default in this version.** What ships is the machinery plus the measurements that show where it stands.
Read this before continuing the work. Hash vs v1.35 ALL IDENTICAL. 1001 / 852 / 359 green.

### What works, and is off

`_civSnapToWaterEdge` nudges a settlement onto the nearest bank or shore that is dry land, outside the
flood zone, and adjacent to water — bounded to ~12 km, never onto water, never into flood, and never
onto ground the suitability field rates >20% worse. On a clean world it does exactly what was asked:

| | v1.35 | with snap |
|---|---|---|
| on the water edge | 65.5% | **79.3%** |
| in the channel bottom | 6 | **1** |
| mean river distance | 16.3 km | **3.6 km** |
| settlements | 29 | 29 |

**It is gated off (`state.civ.waterEdgeSnap`)** because it runs AFTER route generation, so moving a
settlement leaves ways that terminated at it stopping short — breaking v1.02's "every way reaches its
settlement" guarantee and, downstream, leaving the urban-morphology layout with no primary streets to
build around (v0.97). Carrying the endpoints across did not fully restore either. The correct fix is
to run the snap **before** routing, which means reordering `_civIterativeAutoWorld`'s placement/routing
phases — a restructure, not a local change. Shipping it on by default would have traded a placement
improvement for broken roads.

### What does not work yet, and why the first measurement was misleading

`buildRouteCorridors` derives natural crossroads from terrain alone — passes, fords, isthmuses, all
sharing one signature: cheap ground with expensive flanks on **both** sides. Terrain-derived
deliberately, because roads are generated *after* settlements, so reading junctions from `civWays`
would make placement circular (the trap the food-shed work was built to avoid).

The field itself is sound: finite, zero at sea, land mean 0.038 (properly sparse — a first cut averaged
0.233, which is a broad lift rather than an opportunity term, and it halved the settlement count from
29 to 12).

**But at weight 0.08 it does not measurably move placement.** With the snap disabled, settlements sit
on corridor cells at **0.72× the land average** — slightly *avoiding* them. An earlier reading of
2.45× was an artifact: the snap was moving settlements to water edges, and fords are corridors, so the
snap's success was being credited to the corridor term. Raising the weight to 0.10 does shift
placement, but costs 21% of the settlement count (29 → 23), which is too blunt a trade.

The honest conclusion is that crossroads attraction needs the confounder removed first — get the snap
running before routing, then re-tune the corridor weight against a clean measurement.

### Also

- `tests/perf/probe_placement.js` — a clean-world placement probe. Placement outcomes can only be
  measured on settlements the current version actually placed, and the smoke suite's world has been
  resampled and extracted by ~350 earlier assertions, so its settlements predate the pass.
- Cross-block ordering bit again: the corridor field was first defined in block 2, but
  `buildSettlementSuitability` is block 1 and runs earlier. Affordance fields belong with the other
  `current*` fields.

## v1.35 — "Water access: none" for harbour towns

Owner report: the settlement information card sets water access to `none` even for a settlement with a
port, close to water, with sea ways connected. Measured: **all 29 settlements** in the reference world
reported `none`, including 4 the terrain classifies as `riverthrough`. Hash vs v1.34 ALL IDENTICAL.
1001 / 852 / 357 green.

Three compounding causes, all in `_civPlaceNavigability`:

- **Thresholds finer than a grid cell are unsatisfiable.** The coast test was a hardcoded
  `coastDistKm < 3`, but the chamfer distance transform quantises to whole cells, so the smallest
  non-zero distance for a land cell touching water IS one cell — 3.13 km at the reference resolution
  (measured minimum: 3.125), and ~7.8 km on a large world. The condition could never be true. New
  `_umWaterReachKm()` floors every water-adjacency test at 1.5 cells.
- **`riverOrder` was always 0 — a regression introduced in v1.32.** That version gated order/width on
  `riverDistKm <= _umWaterNearKm()` (~2.1 km), also below one cell, silently disabling every
  downstream consumer: the navigable-river branch, the stream fallback, food-shed transport mode and
  harbour validity. Now floored at the same `_umWaterReachKm()`.
- **Sea lanes and site kind were never consulted.** A `sea-lane` way attached to a settlement is
  decisive — the route generator only draws one between places it judged water-reachable — and
  `_umSiteKindFromTerrain` (coast/bay/riverthrough/river) is the same test the town layout is built
  from, so a settlement can be having a harbour drawn for it while the card says it has no water.
  **Fifth instance** of two functions answering one question and drifting.

Also: `river` from the site kind is now authoritative over the traced polylines. The flow raster is
the hydrology; the traced stems are a thinned derivative that can miss a channel the raster sees, and
requiring both to agree left one settlement reading `none` on a site the layout engine was building a
riverbank for.

Each verdict now carries a **basis** ("sea route", "coastal site", "river through town", "on the
coast", "navigable river", "headwater stream only", "no water in reach") shown in the card — a bare
`none` gave no way to distinguish a genuinely landlocked site from a broken threshold, which is why
this went unnoticed.

Measured: settlements disagreeing with the terrain **15 → 0**; settlements with a populated
`riverOrder` **0 → 14**; water-access kinds now 15 river / 14 none rather than 29 none.

## v1.34 — The hinterland surplus is derived, not a free parameter

Owner asked for the farm/hinterland supply to be computed from range + soil fertility + historical
farmer-to-urbanite data, with an explicit warning that the logic must not "start to feed itself" or
balloon populations. Research extended in `docs/research/food-logistics.md` §6. Terrain pipeline
untouched — **hash vs v1.33 ALL IDENTICAL including `icons`**. 1001 / 852 / 352 smoke green, plus a
new clean-world probe.

- **`FOOD_MARKETED_FRACTION = 0.30` is gone.** It had no source. The surplus is now anchored on the
  attested ratio — **~9 medieval farmers to free up enough surplus for 1 non-farming town dweller**,
  with ~90% of the population farming — which is precisely what caps pre-industrial urbanisation at
  the observed 10–15%.
- **Surplus varies with soil.** `foodSurplusRatio(soil, refSoil)` = `(yield − subsistence) / yield`,
  capped at 0.35, with yield from soil fertility over the observed 470–1000 kg/ha English range.
  **Marginal soil returns zero** — it feeds its own farmers and no city — which is the main brake on
  runaway growth.
- **Structural error corrected.** v1.33 gave a settlement the *whole* of its local catchment ceiling,
  which let a town be the entire population of its own catchment with nobody left farming. The
  catchment feeds farmers too, so the town now gets only the surplus. Same correction applied to what
  a distant supplier can spare.
- **Acyclicity is now asserted, not assumed.** The chain is terrain → carrying capacity → rural
  population → surplus → urban ceiling, one way. Three new smoke assertions prove a settlement's own
  population cannot change its own food supply, that growing one settlement cannot raise another's
  ceiling, and that the reconciliation pass is monotonically non-increasing.
- **Two calibration traps hit and measured** (both documented in the research note):
  - Pinning subsistence to the midpoint of the yield range assumes median soil = 0.5. This engine's
    soil does not sit there, so the cut-off landed above most of the map: urban share collapsed
    **13.8% → 0.86%** and a capital was floored at 50 with a food shed of zero. Now calibrated against
    the world's own measured median soil.
  - Using the yield minimum as a floor gave barren ground 470 kg/ha and therefore a surplus. 470–1000
    is the range for land worth cultivating; yield must scale from zero.
- **Parameter audit.** Every food figure is now asserted against the research note: 9:1 farmers,
  470–1000 kg/ha, 160 km cost-doubling by land, 5.5× river, 50× sea, 50 km local radius. Two
  independent grain-yield constants were found and unified (`GRAIN_KG_PER_HA_MEDIEVAL` was a lone 500
  while the food shed carried its own 470–1000 range) — **the fourth instance** of the duplicate-
  constant drift pattern in this file. `GRAIN_YIELD_RATIO_TYPICAL` corrected 3.5 → 4.34, the measured
  Sussex-manor figure.
- **New `tests/perf/probe_foodshed.js`.** The smoke suite's world has been mutated by ~340 prior
  assertions, so it is not a clean sample for an urbanisation measurement; the strict historical-band
  check runs on a freshly generated world instead. At seed 12345/256px: **urbanisation 13.98%**,
  median soil reproduces 1/9 exactly, marginal soil yields zero, rich soil caps at 0.35, and every
  settlement ends within its food shed.

## v1.33 — Export-reporting audit + the food-shed population ceiling

Owner asked three things: audit every surface that reports exports for agreement, check that city and
capital populations are computed correctly, and stop a food deficit being treated as an import when no
trade route could actually sustain the place. Research note: `docs/research/food-logistics.md`.
Terrain pipeline untouched — **hash vs v1.32 ALL IDENTICAL including `icons`**. 1001 / 852 / 344 green.

### The export audit

Four surfaces report exports: the Economy page, the faction inspector, the City Viewer info panel
(all three read `_civFactionAggregates`, so they agree by construction) and the settlement inspector
(`_civPlaceTrade`). **The settlement one disagreed.** v1.32 fixed the faction threshold from an
absolute `±0.15` margin to a world-mean ratio, but left `_civPlaceTrade`'s copy on the old absolute
rule — while its comment still claimed it used "the same world mean the faction rule uses". So a
settlement's inspector and the Economy page could contradict each other about the same world.

This is the **third** occurrence of one shape: v1.30 had two suitability scorers, v1.32 had two
coastal tests, this had two trade thresholds. The rule now lives in exactly one place
(`_civResourceTradeBalance`) and both callers use it.

### Population: settlements are now limited by what can actually feed them

The reported bug was real. `_civPlaceFoodSurplus` compared population to the settlement's own
catchment and, when short, reported "imports food" — with **no check that any food existed within
reach**. An inland capital could sit at 600,000 on ground supporting a fraction of that and be
labelled a healthy importer.

The governing constraint (Duncan-Jones, from Diocletian's Price Edict) is that bulk food barely moves
overland: road carriage cost roughly 40–56× sea and ~5.5× river, grain **doubled in price per ~160 km
of road**, the observed pre-industrial land supply radius was ~50 km, and cities above ~100,000
essentially always sat on navigable water. In his own words it was "often impossible to relieve inland
famines from stocks of grain elsewhere".

- **`_civFoodDeliverable(d, mode) = 2^(−d/D)`** with `D` = 160 km land / 880 km river / 8000 km sea.
  One formula reproduces the whole pattern: 50 km overland still delivers ~80%, 300 km delivers
  nothing, 800 km by sea is nearly free.
- **`_civFoodShed(p)`** = local catchment + **hinterland** (the countryside integrated overland, at
  `FOOD_MARKETED_FRACTION` — a peasant household ate most of what it grew) + **long-range import**
  (other settlements' genuine spare, via the cheapest mode both ends share). A first cut counted only
  other settlements' surplus and **crushed every capital to its own catchment disc**, because the
  farmland between towns belonged to nobody's catchment and so fed nobody. A city's grain hinterland
  *is* the countryside; only exceptional cities drew bulk grain from distant producing regions by sea.
- **Reach requires connection.** Past the 50 km local radius a supplier only counts if it shares
  navigable water or is road-connected (`_civRoadComponents`, union-find over way endpoints). A
  village 80 km away across trackless mountains is not a supplier.
- **`_civApplyFoodShedCeilings()`** caps every settlement at what its shed supports, running after
  placement and roads (it reads other settlements' populations, so inside placement it would be
  circular). **Iterates to a fixed point** — capping a supplier removes supply a consumer was counting
  on, and a two-pass version measurably left settlements still over their sheds.
- **A deficit is only an import when something can deliver it.** Otherwise `food` is actively
  *removed* from the import list and the settlement is flagged unsupported — the specialisation branch
  adds `food` for any mining/fishing/garrison town, so merely not-adding it would have reinstated the
  exact claim this change exists to stop.

Measured at seed 12345/256px: total settled population 123,185 → 81,873, largest settlement
52,589 → 25,669, and every settlement ends within its food shed.

### Notes

- `Math.floor`, not `Math.round`, for the cap: rounding up left settlements fractionally above a
  ceiling the pass had just computed, so it converged on a population it had itself declared
  unsustainable.
- `FOOD_SHED_MIN_POP` (50) is a floor the pass will not cut below — a settlement on ground supporting
  fewer is kept alive rather than deleted, so it legitimately sits above its shed. Callers judging
  sustainability must allow for it.
- **Free parameter, disclosed**: `FOOD_MARKETED_FRACTION = 0.30` is the one number with no direct
  source. It sets how large cities may get; pre-industrial urbanisation rates of 10–15% imply
  something of this order.
- **Not modelled**, deliberately: storage/inter-annual buffering, political extraction (Rome's grain
  dole was state logistics, not a market), return-cargo economics, and roads as a continuous cost
  discount rather than a reachability gate.

## v1.32 — Owner bug batch: overlay scroll, faction exports, Explore popup, phantom coastlines

Five owner-reported issues. Everything is UI-layer or civ-layer (block 2), so the terrain pipeline is
untouched — **hash vs v1.31 is ALL IDENTICAL in every scenario including `icons`**. 1001 headless /
852 UME / 335 smoke green.

- **Scrolling dead in the setup gate and while generating.** `#onboard` is a DOM child of
  `.canvas-wrap`, whose wheel handler calls `e.preventDefault()` unconditionally — so the gate card's
  own `overflow-y:auto` never received an event it was allowed to act on. Same for two-finger scroll
  via the pinch `touchmove` handler. New `_overCanvasOverlay(e)` returns early for any overlay layered
  over the canvas (gate, busy, credits, city viewer, asset modals, popovers), handing the gesture back
  to native scrolling.
- **Faction Exports permanently empty.** `_civFactionAggregates` used a fixed absolute margin —
  export if `territoryMean − worldMean > 0.15`. That was calibrated when every resource was common;
  after v1.31's crustal-abundance thinning most world means sit at 0.02–0.16, making the margin
  unreachable upward while it stayed reachable downward. Hence Exports "none" on every faction with
  Imports fully populated. Now compared as a **ratio** against the world mean (>1.35× exports,
  <0.65× imports), with a small absolute floor so a resource that is near-zero everywhere cannot
  divide-by-tiny into a spurious export. Same failure and same fix as v1.31's archetype thresholds.
- **Explore opened the settlement full-screen.** v1.18 wired Explore's Info tool to bypass the popup
  and drill straight into the full-viewport City Viewer. Per the owner, a pin hit now opens the SAME
  map-anchored popup Civilization mode uses — city-layout card on top, then the information pane, with
  the settlement's parameters editable exactly as under Generate → Civilization. The City Viewer is
  unchanged and still fully functional, reached on request via the popup's new "⤢ Open city view"
  button rather than by hijacking a tap.
- **A settlement 19.5 km inland rendered an attached coastline.** `_umSiteKindFromTerrain` decided
  coastal/bay/estuary by scanning `max(4, GW/128)` **grid cells** — on a large world a cell is several
  km, so that box reached tens of km and any settlement near-ish the sea came back `bay`. `buildSite`
  then faithfully drew a coastline inside a town box only 1.7 km across. The inspector was already
  contradicting itself on screen (`coast ~19.5 km`), because `_umSiteProfile` derives coast distance
  from a chamfer DT over the whole field and had the right answer all along. The radius is now derived
  from real km against the town's own footprint, so the two agree — the same "two functions, one
  question" shape as v1.30's duplicate suitability scorers.
- **Site Profile audit.** The same grid-cell-radius bug sat in the river search: a stem was accepted as
  "this settlement's river" within `GW/8` **cells**, which is how the inspector came to print
  `river ord 1 ~618.4 km`. Distance is now always reported honestly, but order and width are only
  filled in when a stem is genuinely within reach, and a river beyond a 25 km context radius is
  reported as no river at all. `buildableFrac` clamps its samples into the grid before reading slope —
  at coarse resolutions the whole town box can be sub-cell, so every sample rounded to the same cell
  and the fraction degenerated to the 0% the owner saw.
- **Cross-block regression caught during verification.** The first cut of the km thresholds declared
  `const UM_SITE_BOX_KM = Math.max(UME.SITE_WM, …)` at block-2 top level. `UME` lives in script block
  4, which executes *after* block 2, so this threw during block-2 evaluation and aborted the rest of
  the block (surfacing as `Cannot access '_umRevealedSet' before initialization`). Now computed
  lazily inside functions. This is exactly the cross-block rule CLAUDE.md already documents.
- **Flaky test fixed.** The bathymetry-variance assertion failed roughly 1 run in 3 on v1.30–v1.32
  alike, always with the two variances equal to two significant figures. It now guards on the seabed
  having meaningful relief to flatten and compares with a relative tolerance. Stable across repeated
  runs.
- **Known gap, disclosed**: the faction-export fix is verified by reading, not end-to-end. The smoke
  harness never generates faction territory (`territoryCells` stays 0), so every faction's resource
  means are 0 and the threshold cannot be exercised there. The assertion is explicitly vacuous in that
  case rather than passing on the unrelated `food` export — exercising it needs a world with real
  territory.

## v1.31 — Pre-industrial resource grounding (settlement-resources.md)

Owner supplied a reference document (`docs/research/settlement-resources.md`) on pre-industrial
settlement resources and asked for Cartalith to be updated with it. Six of its sections are now
built in. Everything is either a new opt-in `opts.*`, a new resource key, or civ-layer (block 2)
display/derivation, so the terrain pipeline is untouched: **hash vs v1.30 is ALL IDENTICAL in every
scenario, including `icons`.** 1001 headless / 852 UME / 326 smoke green.

- **§1–§4 — the resource vocabulary grew 6 → 15, append-only** (invariant 13; these keys name the
  `.f32` exports and `resource_index.json`). New: lead, silver, clay, buildstone, flint, obsidian,
  gems, sulfur, alum — every one keyed on a geological signal the engine already computed
  (lithology, boundary type, shear, crustal age, volcanism, flow, rain, biome), so no new pipeline
  stage was needed. Lead is limestone-hosted hydrothermal veining, silver is its argentiferous
  by-product, obsidian needs young silica-rich volcanism, gems are pegmatite (co-occurring with tin,
  as the reference notes) plus metamorphic contact zones.
- **§10.1 — deposits are thinned by crustal abundance.** `RESOURCE_ABUNDANCE_PPM` (Fe 50000 → Au
  0.005) drives `resourceScarcityCut`, which log-compresses the five-decade span onto a 0.02–0.45
  land-fraction occupancy band; `applyResourceScarcity` then keeps only that fraction of the
  strongest cells. **Rank-based, so it can only ever thin, never invent a deposit where the geology
  says none.** Log rather than linear because the reference is explicit that crustal abundance is
  *the floor of scarcity*, not deposit frequency — workable ore is clustered, so its map frequency
  is far higher than its crustal share (a linear map would put gold at 1e-7 of the map, i.e. absent).
  Applied to the nine NEW resources only: thinning the original six would silently rewrite every
  existing world's copper/tin/iron. `buildResourcePotentials` takes `opts.scarcityLegacy` if that is
  ever wanted.
- **§10.2/§10.3 — iron is gated by FUEL, not ore.** The reference's most interesting constraint and
  one nothing here modelled. `_civPlaceSmelting` computes both budgets over the settlement's own
  catchment — ore × 33% bloom recovery, and woodland × 1000 kg charcoal/ha/yr ÷ 6.7 kg charcoal per
  kg iron — and reports the binding one. At seed 12345/256px, **2 of the 3 iron-producing
  settlements come out fuel-limited, not ore-limited**, which is the documented Elba case; the
  attested historical response (move ore to fuel) shows up as a charcoal import rather than an iron
  export.
- **§9 — a 7-category trade-need checklist** (metals/salt/fibre/fuel/husbandry/ceramics/luxury), each
  carrying the severity the reference assigns. v1.30's `_civPlaceTrade` already did the mechanical
  half but emitted a flat list of resource keys, so "no iron" and "no dye" read as equally important.
- **§8 — composite settlement profiles**: bog-iron smithing, bronze-age hub, obsidian tool tradition,
  arid salt-and-textile, pastoral, generalist floodplain. **Thresholds are relative to the world
  mean, not absolute** — a first cut used peak-scale absolute cut-offs against what is actually a
  windowed catchment MEAN and matched almost nothing.
- **§6 — pastoral ↔ arable tension** (`_civPlacePastoralBalance`): pasture and cropland compete for
  the same catchment while manure is the only large-scale fertiliser available, so grazing land
  raises adjacent cropland yield. The uplift peaks at a pasture share near 45% and falls away either
  side — too little livestock means no manure, too much means the cropland it would have fertilised
  is gone.
- **§7 — navigability gates bulk trade.** Water carriage ran ~10–20× cheaper than overland, so each
  export is tagged with the reach it can actually achieve: bulk goods (grain, ore, stone, timber)
  without navigable water are `local` however much a settlement produces, while luxuries travel
  regardless. A bulk-only producer with no water is flagged `tradeIsolated`.
- **§10.7 — population density now varies by SUBSISTENCE MODE.** `AGRARIAN_MAX_KM2` was one flat
  number for every cell, so land use carried no information at all. Four bands now do (gathering 0–4
  → annual cultivation 64–256 people/km²). **Per the owner's explicit call, the reference's separate
  25–70% realized-vs-theoretical discount is NOT applied**: `currentAgrarianDensity` normalises per
  world so the land-integrated total is exactly v1.30's (1,326,919 at seed 12345/256px, asserted to
  0.1%). The distribution changes, the total does not. Applying the discount is a one-line change at
  that constant.
  - **Calibration warning worth reading before touching this.** A first cut pinned the scale so an
    annual-cultivation cell at K=1 read the old 200/km². That looks right and is badly wrong: almost
    no cell *is* annual cultivation, so the rest of the map fell to the lower bands and the world
    ceiling collapsed 13× (1,326,919 → 99,460), taking settled population down 8.7×. The bands
    describe relative productivity across land uses; pinning one of them to this engine's carrying-
    capacity scale says nothing about where the others land.
- **Two latent bugs found by probing, not by tests** (both silent — NaN compares false, so they
  simply matched nothing): `_civFactionAggregates`' `mkResMap` was a frozen six-key literal while its
  own loops iterate `CIV_RESOURCE_KEYS`, so every new key accumulated onto `undefined` and poisoned
  `worldMeanResource` (which the import/export rule and the archetype thresholds both divide by); and
  `channelAtlasGroups` hand-listed six resources across two RGB files, so nine fields would have
  dropped out of the channel atlas and its manifest entirely. Both are now generated from the
  vocabulary, and the atlas assertion checks the formula rather than a frozen group count. The `.f32`
  export was also hand-listed and had been silently missing **tin** since v0.105.
- **Measured effect on placement** (seed 12345/256px): settlements 18 → 29, total population
  122,342 → 123,185 (+0.7%), tier mix shifts toward more hamlets and cities as good farmland now
  genuinely outproduces marginal ground.
- **Known scope cuts**: §5 (soil formation from parent rock) and §10.5/§10.6 (labour budgets, storage
  losses) are not built — the first largely duplicates the existing `buildSoilFertility`, the second
  needs a labour model that does not exist. The grain seed-to-yield floor (§10.4) is defined and
  exposed but only reported, not yet wired into the food-surplus rows. Archetype coverage is thin on
  this seed (floodplain matches, the rarer profiles need the specific geology they name).

## v1.30 (2026-07-27)
Owner: *"can we also auto select/define export sources? And are we using all the underlying layers …
to define the best places for settlements as stated in Settlement Suitability?"* Audited before
building, and the audit changed the answer to both.

**Exports already existed** — `_civFactionAggregates` has always derived them by the same rule as
imports (territory-mean resource potential vs. the world mean, ±0.15, plus food from the surplus), and
they were already shown on the Economy page, the Faction editor and the City Viewer. The real gap was
that both were FACTION-level only, which is the right answer for a polity's balance of trade and the
wrong one for a town.

**The layer audit found three defects**, one of them a correctness problem:
1. There were **two** suitability functions and they disagreed. `buildSettlementSuitability` (block 1)
   backed the Settlement-suitability debug view, the `.f32` export and the seed list; a second, richer
   `_civExtendedSuitability` (block 2) was what auto-populate actually placed from — with different
   terms AND a different seed threshold (0.65 vs 0.42). **The gold dots you inspected were never the
   sites you got.**
2. **Flood was absent from placement entirely.** `currentFloodField()` was a debug view and a Site
   Profile field; nothing penalised seeding a town onto a floodplain.
3. `soil` was a declared parameter of `buildSettlementSuitability` that the body never read (fertility
   reached the score only transitively, through carrying capacity), and water was counted **twice** —
   `wW` and `wC` both read `water[i]`, so the "coast/trade" term was never a distinct signal.

- **One scoring function.** The extended terms moved into `buildSettlementSuitability` behind an
  optional `opts.ctx`, so it stays a pure primitive — every input an argument, nothing read from a
  global, still callable and headless-testable with the original 8 arguments. `_civExtendedSuitability`
  is deleted, and `currentSettlementSuitability()` (which always supplies the context) is what the view,
  the export, `findSettlementSeeds` and auto-populate all read. `SETTLE_SEED_THRESH` gives them one
  advisory threshold too. **Without a ctx the result is byte-identical to v1.29** — asserted directly
  against a hand-written copy of the old five-term formula — so the fall-through is a guarantee, not a
  hope.
- **The calibration is the interesting part, and the first cut of it was wrong.** Weights were
  initially redistributed across all terms so they summed to 1. Measured, that collapsed the field:
  median 0.314 → **0.124**, max 0.751 → **0.431**, and advisory seeds above 0.42 fell from 102 to
  **ONE** — because the average cell had been stripped of weight that used to sit on food and water
  and given weight on a coastline it does not have. The fix is a split the code now names explicitly:
  **CORE** terms exist at every land cell (carrying capacity, freshwater, slope, elevation band,
  soil×rain, buildability) and sum to 1.0, setting where the sigmoid's 0.5 pivot falls; **OPPORTUNITY**
  terms (coast, river, lake, minerals) are zero for most of the map and are ADDED on top rather than
  carved out. Post-fix: median 0.205, max 0.730, 59 seeds at 0.42 — the same order as v1.29's placer
  (85), lower by design because floodplains are now penalised.
- **Flood wired in as a penalty**, plus the slope×flood buildability composite the `siteprofile` debug
  view already drew — so that view is now a preview of a term that decides placement, not a
  description of a site after the fact. Note the term is *not* "avoid water": being near water is
  rewarded four separate ways. It is "do not build in the channel bottom", which is why real
  settlements sit at the floodplain edge.
- **`soil` finally does something.** It reaches the score through a cropland term, soil × a RAINFALL
  optimum — deliberately not a second temperature bell, since carryingCap is already soil × temp ×
  water, so rainfall is the one genuinely new agronomic signal.
- **Per-settlement imports/exports** (`_civPlaceTrade`): a settlement's own balance of trade from three
  sources in priority order — its v1.17 specialisation (whose primary good is an export outright, and
  which implies a food dependency for a mining/fishing/garrison town), its hinterland means against the
  same world mean the faction rule uses (so town and faction are on one scale), and its food surplus.
  Imports are filtered to goods a settlement actually consumes, so a hamlet is never reported as
  "importing gold", and a genuine surplus always beats an inferred need. Rendered in the Settlement
  Inspector next to the existing faction-level rows. Purely additive — feeds nothing.
- **Measured placement change** (seed 12345, 256px, auto-populate): mean floodplain exposure of placed
  settlements **0.617 → 0.437**, and the share sitting on high-flood ground (>0.6) **58% → 28%**. 9 of
  18 sites are unchanged.
- **Disclosed side effect, not tuned away**: settlement count rose 12 → 18 and the tier mix shifted
  toward hamlets (2 villages → 12 hamlets). Population is derived from carrying capacity, not from the
  suitability score, so this is not the score shrinking settlements — it is the model being consistent:
  sites pushed off floodplains onto drier ground have less fertile catchments and are legitimately
  smaller. That is a real tension (floodplains are simultaneously the best farmland and the worst
  foundations) and the flood weight is the dial for it; left at 0.14 pending a call on how hard it
  should bite.
- **`VERSION` was still reading `'1.24'`** six versions on. It is export/atlas metadata and is never
  gated on, so the drift was harmless — bumped to `'1.30'`.
- **Verification**: engine **1001/1001** (+9, incl. a direct byte-identity check of the no-ctx branch
  against the v1.29 formula), UME **852/852**, hash vs v1.29 **ALL IDENTICAL** (suitability never
  touches the terrain render), smoke **310/310** (+10).

### v1.29 (2026-07-27)
Eight owner-reported bugs in one pass, triaged against the code before anything was written. Three of
them (B2/B5/B7) turned out to share one shape of cause — a per-tile or per-polyline computation that
each neighbour performs on a different, truncated view of the same shared data.

Every heightmap/climate result is untouched: `hash_gen1.js` vs v1.28 reports `field`/`temp`/`rain`/
`flow` **IDENTICAL in every scenario**. `rgba` differs, and that difference is proven to be entirely
the river-way overlay the owner asked to change: with `state.viz.riverWays=false` on both sides the
rendered canvas is byte-identical (FNV `1404487302` on each). Engine suite 992/992, UME suite 852/852, smoke 300/300 (+12).

- **B1 — a long press on a slider popped the touch "copy" callout.** The suppression
  (`touch-action:none` + `-webkit-touch-callout:none` + `user-select:none`) was scoped to
  `.row input[type=range]`, but not every slider lives in a `.row`: the Asset Library's per-variant
  weight sliders (v1.26) and the templated one sit in plain flex wrappers. Widened to all
  `input[type=range]`, plus `.row label`/`.row .val` so dragging can't start a text selection either.
- **B2 — "Rivers as ways sometimes stretches left to right on the map."** `traceRiverPolylines` returns
  a RECEIVER CHAIN, and in world mode `buildRiverNetwork` routes receivers through
  `nx=((nx%W)+W)%W` — so a river crossing the antimeridian has consecutive points at x≈W−0.5 then
  x≈0.5, and one `lineTo` strokes back across the entire map. New pure `splitRiverPolylines(polys,W,
  skip)` cuts a chain wherever the next point isn't reachable by a straight stroke; applied in
  `drawRiverWays` and the GeoJSON river export. `traceRiverPolylines` itself is untouched, so
  `carveRiverValleys` is unaffected — and it was never affected anyway, since
  `enforceChannelDescent` stamps a disc per POINT and never interpolates between them, which is why
  this only ever showed as a rendering artifact.
- **B7a — "Some river-ways are drawn inside lakes"** is the same primitive. The receiver walk only
  stops at ocean (`fld[i]<sea`); an inland lake pools ABOVE sea level, so the chain is traced straight
  across the lake surface to the outflow. The river genuinely does enter and leave the lake — it just
  must not be stroked across the open water in between, so the lake cells become a split predicate
  (`currentWaterBodies()` class 2). Not applied to the GeoJSON export: a lake reach is real hydrology
  and belongs in exported geometry; only the unrepresentable seam jump is cut there.
- **B3 — river ways read as "relatively big lines instead of fine lines according to the zoom."** The
  stroke was fully terrain-proportional: `baseW*zk` under LOD, and off-LOD the whole `.canvas-stack`
  is CSS-scaled by `viewT.scale`, which multiplies the stroke identically. Either way on-screen width
  grew 1:1 with zoom, so an order-7 trunk at the `zk` cap of 8 stroked ~34 canvas px. Damped to
  √zoom — still thickening (a hairline over a carved valley reads wrong too), at 2.8× instead of 8×
  at full zoom. The two paths carry the zoom factor in opposite places, so each gets its own half of
  the same law (`base·√z` under LOD, `base/√z` off it); both are exactly `base` at zoom 1, so the
  default view is unchanged.
- **B4 — "Scrolling/pinching to zoom … uses the top left corner (maybe a LOD related thing?)."** It is
  exactly a LOD thing. Off LOD the wheel/pinch handlers call `zoomAt(clientX,clientY,k)`, which holds
  the point under the cursor; the `if(_lodOn)` branches only ever scaled `_lodZoom` and left
  `_lodCx/_lodCy` alone, so LOD always zoomed about the camera centre — which, with the view clamped
  against the world edge, reads as the map growing out of a corner. New `_lodZoomAt(cx,cy,k)` expresses
  `zoomAt`'s contract in the LOD camera's terms: with fx,fy the cursor's fraction across the canvas
  and gx,gy the world point under it (taken from the CURRENT `lodViewRect`, so the pre-zoom edge clamp
  is accounted for), `_lodCx = gx + regW'·(0.5 − fx)`. At fx=0.5 that collapses to the old
  centre-zoom, so the zoom buttons keep their behaviour. Wired into both the wheel and the pinch path.
- **B5 — "The LOD Tiling leaves noticable seams between tiles."** Root-caused by measurement, not
  inspection, and the first two theories were wrong: the tiles' HEIGHT data at a shared column is
  byte-identical (mean abs diff exactly 0), and quantising the destination rect changed nothing.
  The cause is `renderBiomeTileRGBA`'s sea-floor smoothing, which box-blurred each TILE (radius
  ≈ max(W,H)/48, two passes). A box blur clamps at the array edge, so the smoothed depth along a
  tile's border was computed from a truncated neighbourhood — and two adjacent tiles truncate opposite
  sides. Identical height in, different colour out: shared-column RGB differed by 6.7/255 against
  0.3–0.5 for ordinary neighbouring columns, and in the live composite that boundary column was the
  single largest colour discontinuity on screen (22.3 vs a 4.4 local mean, 5.05×). Since most of a map
  is ocean, that was the seam. Fixed by sourcing the smoothed bathymetry and its shade from the
  world-wide coarse fields the main map already builds and caches (new `sharedSeaFields()` over
  `_seaHCache`/`_seaShadeCache`), sampled at world coordinates exactly like `tempField`/`rainField` —
  which is also literally what v0.092's own goal ("ocean must match the main map's seas") asks for,
  is what the PNG bake path already did, and removes two full-tile box blurs from every refine.
  **Measured after: shared-column RGB MAD 6.71 → 0.04** (below the 0.3–0.6 interior), and in the live
  composite the boundary drops from 5.05× to ~2.2× its local neighbourhood and is no longer among the
  strongest columns on screen at any zoom tested (4/8/16). Two smaller contributors fixed alongside:
  every tile coloriser CLAMPED its central-difference index at the border, rendering that column at
  half its true slope (new `edgeL/edgeR/edgeU/edgeD` extrapolate the missing neighbour instead), and
  the destination rect is now quantised to whole DEVICE pixels so a tile's own antialiased edge can't
  partially cover the boundary pixel.
- **B5 — "…and the correct resolution only renders when the user zoomed in/out."** Every way of moving
  the LOD camera schedules a refine on settle — the drag's `pointerup`, the wheel, `touchend`, the
  zoom buttons, the LOD checkbox — except two: the v1.19 mobile pan joystick and the zoom-reset
  button. Probed and confirmed: after a joystick-style pan the cached-tile count stayed at 2 of 4 and
  the composite hash was unchanged 3 s later. Both now call `scheduleLodRefine()` (debounced at 240 ms,
  so calling it every pan frame fires exactly once after release).
- **B6 — "Lakes still tend to be splatted textures in the 3D view instead of flat surfaces such as the
  ocean."** The 3D drape's colour comes straight off the 2D map, so the lake was already tinted as
  water; what read as texture was the GEOMETRY. Both height paths flatten water with
  `h < sea ? sea : h` (the GL shader's `hAt` via `u_flatSea`, and `drawSoft`'s own), which by
  definition can only catch the OCEAN — an inland lake pools above sea level, so every ripple of the
  pre-flood terrain under it stayed in the mesh and lit up as relief. New `_v3dHeightSource()`
  substitutes each lake cell's real pooled surface from `_lakeFill` (v1.05, the same array the LOD
  tile renderer already floods shorelines with) — a CPU pre-pass, no shader change, and it returns
  `field` itself (no copy) whenever flattening or Show-lakes-as-water is off, so the non-flattened
  path is exactly what it was. Used by `uploadHeight`, `drawSoft` and `v3dWorldPos` (so a lakeside
  label still sits on the surface); both toggles now re-upload the height texture.
- **B7b — "villages dont tend to render correctly to the map and terrain/sea alignment."** The civ
  layer's land test says a cell is dry whenever its own water-body class is 0, but since v1.05 the LOD
  tile renderer draws the lake shoreline SUB-CELL, flooding any pixel whose amplified terrain lies
  below the adjacent lake's pooled surface. A pin in a class-0 cell that happens to sit lower than the
  lake next door therefore reads dry at map scale and is under water once you zoom in. New
  `_civLakeFlooded(x,y,wb)` applies the renderer's own predicate, and both `_civSnapLand` (placement)
  and `_civSnapPlacesToLand` (the reconcile pass) use it, so a settlement lands on ground that is dry
  at every zoom.
- **Tests**: 12 new smoke assertions (`R.v129` in `tests/perf/smoke_gen1.js`) — the callout
  suppression across every range input; seam-split and no-op cases for `splitRiverPolylines`; the
  damped width law on both camera paths and its identity at zoom 1; `_lodZoomAt` holding the world
  point under the cursor (and still centre-zooming when handed the centre); the joystick/zoom-reset
  refine wiring; adjacent tiles agreeing at their shared column; `_v3dHeightSource` flattening a real
  lake without touching `field` and returning `field` itself when either toggle is off; the lake
  split; and the flood-band cell no longer counting as dry land.
- **Known scope cuts / disclosed residue**: the LOD seam is reduced, not provably zero — the boundary
  column still measures ~2× its local neighbourhood, which is consistent with the shared world column
  being DRAWN TWICE (tile A's last and tile B's first are the same world position under
  `amplifyRegion`'s inclusive sampling), a one-pixel stutter rather than a hairline. Removing it needs
  tiles rendered with a one-pixel apron and cropped, which changes `pyramidTile`'s output shape and
  therefore the atlas format — deliberately out of scope for a bug batch. The other per-tile
  neighbourhood passes (`aoB`, `crestB`, `coastB`, `riverB`, `biomeBD`) have the same class of
  tile-local truncation but are all opt-in (default 0) and already documented as per-tile decoration.
  All canvas/GPU/touch behaviour here (joystick, pinch, WebGL drape, the visual seam itself) is under
  this project's headless carve-out and still wants an on-device pass.

### v1.28 (2026-07-26)
Owner: *"All the things that aren't 'live' I want you to wire them so they are."* The v1.26 asset audit
found 35 of the Asset Library's 71 non-custom slots had full storage, an inspector card and an export
slot but **no consumer** — art could be authored for them and would simply never appear. All 35 now
render. Every change is inert until a pack/Library actually supplies art, so `hash_gen1.js` vs v1.27 is
**ALL IDENTICAL** including `icons`.

- **Biome textures (15) + Terrain textures (13) — bound to the painted Cartography layers.** Neither
  family appeared in `PACK_TEX_SLOTS`, so nothing read them. New `PACK_BIOME_SLOTS`/
  `PACK_TERRAIN_SLOTS`, whose index order is 1:1 with the FROZEN `CART_BIOMES`/`CART_TERRAINS`
  vocabularies (invariant 13) — slot N is paint value N+1 — so a slot's meaning can't drift from the
  value that selects it. Manifest gains `biomes`/`terrains` sections (JSON and CSV), decode fills
  `assetPack.biomes`/`.terrains`, and `surfaceColor`'s existing paint-tint step samples the texture
  instead of the flat `CART_*_COLS` swatch when one is loaded — same 0.60 weight and same pipeline
  position, so hillshade/relief still shows through and a painted cell still isn't a flat sticker.
- **These two are sampled as TRUE COLOUR, deliberately unlike the splat family.** They skip
  `finalizePackTexture`, which stores a per-channel `inv = 1/mean` that the splat path uses to
  modulate a procedural ramp (`materialColor × texel/mean`) — correct there, but it divides a
  texture's absolute hue out, so full-colour splat art never renders as painted. Storing no `inv`
  for biome/terrain is what makes "full colour" mean what it says: the artist's colour is what lands.
- **Settlement traits (7) — the family that was dead in three separate places.** The pack manifest
  importer only ever handled `settlement`/`poi`, so trait art was skipped on import; there was no
  `_traitSprite`; and nothing drew traits on the map at all, despite the civ layer's own comment
  claiming they were "drawn beside the marker". Added all three: `trait` in `PACK_STRUCT_SLOTS` and
  the import loop, a `_traitSprite`, and `_civDrawTraitBadges` drawing a centred badge row under the
  pin (capped at 4 so a fully-traited settlement can't grow a strip wider than its own label, with a
  glyph fallback when there's no art). A `'below'` label is offset clear of the badges.
- **`administrative` was a real vocabulary gap, not a new invention.** The Asset Library reserved a
  trait slot for it and `_civNetworkMetrics` already pushes it onto high-centrality settlements, but
  `CIV_TRAITS` had no entry — so it could never be toggled in the editor or given art. **Appended**
  (never reordered; these keys are written into save files).
- **Cache-invalidation bug found while wiring (`_assetGen`).** `_lodRenderKey()` and the civ bake key
  include `_fieldGen`/`_climGen`/`_paintGen` but nothing about the asset pack — yet pack art changes
  what a cell *renders as* without touching field, climate or paint. So a freshly imported pack only
  appeared once some unrelated key component happened to change. This is exactly the bug class those
  two keys already carry comments about (the v0.86 climate-redraw and v0.88 sea-level fixes). New
  monotonic `_assetGen`, added to both keys and bumped on pack import, pack clear, and every Library
  bridge sync. **This also fixes the pre-existing splat-texture case, not just the new families.**
- **Library bridge extended.** `syncToRuntime` previously pushed only scatter families; it now also
  carries biome/terrain ground (via a 2D readback, since the renderer samples `data[]` rather than a
  bitmap) and settlement/trait/POI sprites, so Library edits reach the map with no pack round-trip.
  `applyLibraryAssets` merges these per-slot rather than wholesale, so a Library holding two biome
  textures can't wipe the other thirteen that came from an imported pack.
- **Block 3 needed no changes.** Its pack importer already parsed `biomes`/`terrains`/`structures.trait`,
  and its exporter already routed them correctly via each family's `section`/`sub` — confirming the
  Library was ready on both ends the whole time and the engine was the only missing half.
- **Visible default change, flagged:** settlements carrying traits now draw badges under their pin
  where previously they drew nothing. That's the point of the wiring (and the family's original
  documented intent), but it's the one change here that alters an existing map without any pack
  loaded. No toggle was added — say the word if it wants one.
- **Verified.** Engine `tests/run.sh` **992/992**, UME `tests/run_um.sh` **852/852** (both unchanged),
  `node tests/perf/hash_gen1.js` vs v1.27 **ALL IDENTICAL**, smoke **288/288** (+7). Behaviour was
  proved in a browser first: a magenta biome texture on a painted cell rendered `[166,51,155]` and a
  cyan terrain texture `[51,166,155]` — both the expected 60% blend of the true colour — against flat
  swatch baselines of `[77,106,74]`/`[113,113,103]`, with the flat fallback restored exactly on pack
  removal. One probe-side bug found and fixed during verification: writing a paint array directly
  without bumping `_paintGen` leaves the render cached, so the first run showed no tint at all — an
  artefact of the harness, not the app, but it is what surfaced the `_assetGen` gap.

### v1.27 (2026-07-26)
Owner: *"clean up the code, annotate each block with what it does, remove old comments and check for
bugs."* A senior-review pass over the v1.26 scatter system. Six real defects found by reading, plus a
seventh found by the verification probe. Every fix is inside the v1.26 rule/bridge/brush code, which
only executes once rules are configured — so `hash_gen1.js` vs v1.26 is **ALL IDENTICAL including
`icons`**, and the engine/UME suites are untouched.

- **FIX-1 (correctness) — wetland and biome were ORed in one mode and ANDed in the other.** In
  `placeMapIconsRuled`'s scatter branch, `requireWetland` *replaced* the biome test
  (`if(requireWetland){…} else if(!biomeOk)`), while the relief branch ANDed them. The inspector
  exposes both controls at once, so ticking "Wetland only" on a scatter asset silently discarded the
  user's entire biome selection. Both branches now AND. An empty biome list still means "any land",
  so the wetland presets are unaffected. Verified: a rule restricted to wetland **and** one biome now
  places 14 icons all satisfying both, against 17 for wetland-only — i.e. the biome term demonstrably
  filters instead of being ignored.
- **FIX-2 (robustness) — `normalizeScatterRule` did not reject non-finite input.** Rules load from
  `assetlib/library.json` inside a user-supplied project `.zip`, so this is an untrusted input
  boundary. The v1.26 code used `+x||fallback`, which mishandled two cases: a legitimate `0` fell
  through to the default (0 is falsy), and a non-numeric value produced `NaN` that then propagated.
  The `NaN` cases were not benign — a `NaN` density made `keep >= Math.min(1,NaN)` false for *every*
  cell, so one corrupt rule scattered an icon on every land cell; a `NaN` spacing collapsed the relief
  bucket grid to a single bucket, turning the O(1) neighbour test into an O(n²) scan. Every numeric
  field now goes through a clamping `num()` helper, with `enabled`/`requireWetland` coerced to real
  booleans, `elevMax` reordered if it is below `elevMin`, and `variantWeights` element-wise sanitised.
- **FIX-2b (found by the probe, not by reading) — the normalizer aliased its own defaults.**
  `Object.assign(base,r)` *mutates* `base` and returns it, so `out === base` and every
  `base.<field>` fallback read the very garbage it was meant to replace: `minSize:'x'` "defaulted"
  to `'x'`, and `maxSize` then went `NaN` via `Math.max('x',…)`. Fixed by copying into a fresh
  object. **This aliasing was present in v1.26 as well** — the v1.27 review only caught it because
  the probe asserted `Number.isFinite` on the normalised output rather than trusting the code.
- **FIX-3 (defence in depth) — a rule reaching the engine without normalisation could still collapse
  the spacing grid.** `spaceOf` now falls back on the *computed* value, so a direct caller or unit
  test passing `spacing:NaN` still yields a finite spacing.
- **FIX-4 (data correctness) — deleting a Library asset left its art live on the map.**
  `syncToRuntime` skipped empty slots with `continue`, so it never cleared what it had previously
  written; removing every variant of an asset left the old bitmaps scattering forever. The bridge now
  tracks the slots it owns (`_pushedIcons`/`_pushedCustom`) and passes `dropIcons`/`dropCustom` so
  `applyLibraryAssets` retires exactly those keys — imported-pack art for slots the Library never
  touched is never collateral damage. An emptied custom set is removed entirely.
- **FIX-5 (determinism) — scatter priority depended on rule insertion order.** The candidate list was
  iterated in whatever order the table happened to be built, and since the table is produced by
  iterating an object, two rules matching the same cell would swap winners depending on the sequence
  the user added them in. Now sorted most-specific-first (wetland-constrained outranks a biome list;
  fewest biomes wins; unrestricted "any land" is the last resort), so the result is a stable function
  of the rules themselves. Verified order-independent across both input permutations.
- **FIX-6 (performance) — the density brush had a cliff at maximum settings.** Dart count scales with
  brush *area*, so radius 60 at density 2.0 requested ~15k darts **per stamp**, and a stamp runs on
  every `pointermove`. Capped at 1500 darts; a dense fill is still reachable by dragging over the
  area again, which is how a brush is used. Measured 437 icons placed in 3 ms at the slider maxima.
- **Comment hygiene.** Removed one genuinely stale comment (the `TREE_SLOT` header still described
  sprite packs as *"a later, optional upgrade, B2/B3 asset tier"* — raster pack art has been the
  primary draw path for many versions and the vector glyphs are the fallback) and replaced it with
  an accurate description of what the lookup tables are for. Historical rationale comments were
  deliberately **kept**: entries like the `v0.61` "deliberately NOT an async function" note are the
  only thing preventing a previously-shipped regression from being reintroduced, and CLAUDE.md
  treats that archaeology as project memory rather than clutter.
- **Verified.** Engine `tests/run.sh` **992/992** (16 consecutive clean runs — see the flake note
  below), UME `tests/run_um.sh` **852/852**, `node tests/perf/hash_gen1.js` vs v1.26 **ALL IDENTICAL
  including `icons`** (these paths are inert until rules exist), smoke **281/281** (+7, one per fix).
- **Flake observed, not reproduced.** One engine run reported 991/1 before any behavioural change had
  been exercised; it did not reproduce across 16 subsequent runs of v1.27 or 3 of v1.26, and the
  v1.27 edits are unreachable from the headless suite (it never passes `opts.rules`). Recorded here
  rather than silently ignored — the harness prints failures as `FAIL - <name>` on **stderr**, which
  is worth knowing when grepping for them.

### v1.26 (2026-07-25)
Owner request: replace the cartography icons with a "rich, Nortantis-style raster asset scattering
system" — per-asset enable/disable, biome restriction, size/density/variant-weight rules in the
Asset Library inspector, a procedural scatterer, a manual density brush, and Y-sorted raster
rendering.

- **Investigated first; three of the five requested items already existed.** `drawMapIcons` has
  drawn **raster pack sprites** (`ctx.drawImage(v.bmp,…)` via bottom-anchored `spriteDrawRect`)
  since the pack system landed — the vector glyphs are only a *fallback* when a slot has no art, so
  the premise "replace my current SVG-based icons" did not hold. `placeMapIcons` already did
  spacing-rejection placement (a grid-bucket `fits()` radius test — Poisson-disk in all but name)
  and already Y-sorted, and `_carPopulateIconGallery` already drew pack bitmaps, not SVG. Pack
  import already auto-assigned art to the 10 frozen `PACK_ICON_SLOTS` via the manifest. What was
  genuinely missing was **per-asset control**: the biome→asset mapping was HARD-CODED in
  `placeMapIcons` (`bi===3||bi===4 ⇒ conifer`), so an asset's behaviour was fixed by which frozen
  slot it occupied, nothing was tunable, and no asset outside that list could scatter at all.
  Scope was therefore *extend*, not *replace* — three owner decisions taken via `AskUserQuestion`
  (Library-as-source-of-truth bridge; climate `BIOME_KEYS`; open vocabulary via custom sets).
- **D1 — ScatterRule data layer.** `defaultScatterRule()` (`enabled`, `mode`, `biomes[]`,
  `minSize`/`maxSize`, `density`, `spacing`, `elevMin`/`elevMax`, `requireWetland`,
  `variantWeights`), `scatterRuleKey()` (one place the `'mountain'` vs
  `'custom::<set>::<slot>'` spelling is decided), `normalizeScatterRule()` (merges partial/legacy
  rules onto defaults so an old save never yields `undefined` arithmetic), and
  `SCATTER_RULE_PRESETS` — presets that **reproduce v1.25's hard-coded behaviour exactly**, so the
  rule table is a generalisation of the old switch rather than a new look. Rules target the frozen
  climate `BIOME_KEYS`/`BIOME_INDEX` vocabulary (not `CART_BIOMES`, which only exists where the
  user has painted and would silently scatter nothing on a fresh map).
- **D3 — rule-driven scatterer.** New `placeMapIconsRuled()`, reached only when the caller passes
  `opts.rules`; `placeMapIcons` keeps its v1.25 body verbatim and simply delegates, so the absence
  of rules is a *guaranteed* bit-identical fall-through (that guard is why the new engine is a
  separate function rather than interleaved branches). Two modes: **relief** (elevation-ranked
  candidates accepted only outside a `spacing` radius, all relief rules sharing one bucket grid,
  highest band first — mountains and hills mutually exclude exactly as before) and **scatter**
  (deterministic jittered grid, biome/wetland predicate, density as keep-probability). `opts.rules`
  is an OPTIONAL addition exactly like v1.20's `tempField`/`wetlandMask`, so the "pure primitive,
  no globals" contract `tests/test_tail.js` relies on is preserved.
- **D5 — unified Y-sorted rendering.** `placeMapIcons` now also returns `items` — ONE Y-sorted draw
  list across every category — and `drawMapIcons` walks it. Previously the renderer ran
  hills → trees → scatter → mountains, so **category, not latitude, decided occlusion**: a mountain
  always painted over a tree standing south of (in front of) it. The four legacy arrays are still
  returned unchanged for existing consumers. Vector art was moved verbatim into a slot-keyed
  `drawIconGlyph()`; `iconVariantsFor()` unifies the flat icon table and custom sets so an
  arbitrary user asset renders through the identical path as a frozen slot.
- **D2 — inspector controls + the Library→runtime bridge.** The bridge was the missing link the
  request's framing didn't account for: script block 3's AssetDB is an *editing* surface whose art
  only reached the map by being exported into a project zip and re-imported as a pack, because
  `drawMapIcons` reads block 1's `assetPack`, which only `loadAssetPack()` ever wrote — so
  "enable/disable this asset for generation" had nothing to talk to. New
  `AssetLibrary.syncToRuntime()` rasterises each item through the same `renderToCanvas()` the
  thumbnails use (so the map shows exactly what the inspector preview shows; the canvas doubles as
  the `bmp`, no PNG round-trip) and hands art + rules to block 1's `applyLibraryAssets()`. A new
  **Procedural scattering** section in `#alInsp` (enable, mode, 13-biome checkbox grid, min/max
  size, density, elevation band, wetland-only, per-variant weight sliders) writes onto `slot.rules`
  and syncs immediately. Rules travel in `assetlib/library.json`; a pre-v1.26 project restores via
  `normalizeScatterRule()` onto its own preset, so it comes back looking as it did.
- **D4 — Cartography density brush.** New "Density brush" toggle + radius/density sliders beside
  the existing icon gallery. Dragging scatters the armed asset by dart-throwing with a blue-noise
  rejection radius tested against both existing and in-stroke icons, never into water, with size
  drawn from **the asset's own scatter rule** — so a hand-painted stand matches the procedurally
  scattered ones. Deliberately uses `Math.random`, not `hash()`: a brush stroke is an authoring
  action persisted in `state.mapIcons`, so re-painting a spot should add, not deterministically
  repeat. `_featureSprite`/`_customSprite` also now honour variant weighting, so a weight set in
  the Library applies whether an icon was scattered or hand-placed.
- **Autopopulation.** `autopopulateScatterRules()` binds each imported slot that carries art to its
  default biome behaviour on import, never clobbering an existing rule (so re-importing can't undo
  tuning). Custom-set assets default to **disabled** — an arbitrary user set has no defensible
  default biome, and silently scattering it would invent intent the user never expressed.
- **Verified.** Engine `tests/run.sh` **992/992** and UME `tests/run_um.sh` **852/852** unchanged;
  `node tests/perf/hash_gen1.js` vs v1.25 — `default`/`geoid`/`waves`/`ao` **ALL IDENTICAL**, the
  `icons` scenario **intentionally diverges** (its `field`/`temp`/`rain`/`flow` hashes are all
  identical and only `rgba` differs, confirming the change is purely the new Y-sort draw order, not
  any terrain change — the same expected-divergence pattern as v1.20). Smoke **274/274** (+8).
  Behaviour was proved in a real browser before being written as assertions: a biome-restricted
  rule placed 244/244 icons inside its biome and none in water; density scaled 581 → 3872 icons;
  relief spacing came back at exactly the requested 8.0 minimum; unweighted variant picks matched
  `pickIconVariant` byte-for-byte across 200 samples; and one brush stamp painted 10 correctly
  sized, spaced, on-land icons.
- **Known scope cuts.** Rules bind to climate biomes only — no `CART_BIOMES`/`CART_TERRAINS`
  (painted-layer) targeting, per the owner's own choice. Slope/aspect/coast-distance predicates
  from `_umSiteProfile` are not exposed as rule terms. The brush has no eraser (Delete on a
  selected icon still works) and no per-stroke undo beyond the existing icon-level editing.
  Settlement/trait/POI families deliberately get no scatter rules — those are placed by the civ
  layer from real settlement data.

### v1.25 (2026-07-25)
Owner report: *"When selecting the preset worldshapes like volcanic, archipelago or islands the
result isn't what is suggested."* Root-caused with a Playwright probe measuring actual land
fraction/landmass fragmentation across all six setup-gate World-Structure archetypes at a fixed
seed/resolution before writing any fix.

- **Root cause.** `deriveFromWorldStructure()` derives `state.tect.plates`/`vel`/`volc.count`/
  `tectonicGraph`/`foldIntensity`/`trenchDepth` from an archetype's bundle, but never touches
  `state.seaLevel` — an independent user slider (default 0.42) that stays wherever it was left,
  regardless of archetype. `normalize()` is a pure min-max stretch of `field`, also independent of
  continentality. Combined with the height formula's disproportionate orogeny contribution for
  exactly the low-continentality archetypes (Archipelago tectonicEnergy 0.80, Volcanic 0.90), the
  fixed sea level didn't land at the right threshold for those worlds' own height distributions.
  Measured in-browser at seed 12345/512px before any fix: **Archipelago (continentality 0.15)
  rendered 71.5% land; Volcanic (continentality 0.05) rendered 60.6% land** — both MORE land than
  plain Classic's 56.5%, the exact opposite of what those archetype names promise.
- **Fix** (`applyWorldStructureSeaLevel()`, gated on `state.world_structure.enabled`, called inside
  `generate()` right after `normalize()` + the volcanism/craters clamp, before
  `computeFlow()`/`refreshClimate()`/`carveRiverValleys()`). Reuses the same O(N) histogram-
  percentile technique `generateContinentalityField()` already uses to build the continentality
  field itself: measure the ACTUAL generated field's height histogram and set `state.seaLevel` to
  the threshold that yields exactly the archetype's promised `(1 − continentality)` ocean
  fraction — a post-hoc, exact, self-correcting measurement, chosen over a predictive pre-
  generation formula (which would need to correctly anticipate how tectonicEnergy/oceanDepth
  reshape the height distribution in advance, and would drift out of sync with the height formula
  over time). Clamped to `[0.05, 0.95]`; refreshes the `#sea`/`#seaV` sidebar slider via the
  existing `v()`/`lab()` globals so it doesn't read stale (`_suGenCommit()` calls `syncUI()`
  *before* `generate()`, so a mid-generate `state.seaLevel` change needs its own DOM update).
  Strictly a sea-level/land-ratio fix — does **not** touch the height formula itself (invariant 8:
  no re-added γC term), only the independent threshold used for downstream land/ocean
  classification. No effect when `world_structure.enabled` is false (the default/Classic path),
  preserving bit-identity.
- **Re-measured after the fix** (same seed/resolution): Earth-like 0.30 continentality → 30.0%
  land; Supercontinent 0.60 → 60.1%; Archipelago 0.15 → 15.0%; Volcanic 0.05 → 5.0%; Rift 0.40 →
  40.1% — land fraction now tracks each archetype's own continentality parameter almost exactly.
  Volcanic's dominant-landmass share also dropped from 84.0% to 44.2% of total land, and
  Archipelago's from 96.8% to 81.6% (a smaller, incidental improvement — shrinking the ocean
  fraction back down naturally leaves more room for the archetypes' own high `tectonicEnergy`/
  `hotspotDensity` to produce separate landmasses, without any direct fragmentation fix).
- **Known scope cut (disclosed, not fixed this pass):** landmass SHAPE/fragmentation still doesn't
  fully track the `fragmentation` parameter's intended noise frequency — `buildPlates()` samples
  the smooth `continentalField` at only each plate's single centroid, discarding its fine multi-
  blob spatial structure, so the true achievable "island count" is capped by plate count (≤40), not
  by fragmentation's frequency. Archipelago (continentality 0.15, fragmentation 0.90) still
  concentrates ~82% of its (now correctly small) land total in one dominant landmass rather than
  many comparably-sized islands. A real fix needs per-cell blending of `continentalField` into the
  height formula's plate-base signal (or an equivalent), which risks brushing up against invariant
  8's height-formula restriction — left as a candidate follow-up, not attempted here.
- **Verified.** Engine `tests/run.sh` 992/992 unchanged, UME `tests/run_um.sh` 852/852 unchanged
  (fix is entirely in block 1's `generate()`, gated off by default), `node tests/perf/hash_gen1.js`
  vs v1.24 **ALL IDENTICAL** (default/WS-disabled scenario, proving the gate is airtight), smoke
  `tests/perf/smoke_gen1.js` **+7 new assertions** (land fraction below/above sane thresholds per
  archetype, correct land-fraction ordering across archetypes, land fraction tracks continentality
  within a wide band for every archetype, and the sidebar sea-level slider DOM reflects the
  auto-derived value) on top of the existing suite, all green.

### v1.24 (2026-07-24)
An external QA report (headless jsdom harness + real-event dispatch against v1.21) — all 8 findings
verified real against the current file before fixing (line numbers had shifted; behavior hadn't).

- **BUG-1 (HIGH) — World Structure sliders were completely dead.** `segOn` is a `const` scoped
  inside `syncUI()`; the `wsp()` slider `change` handler (a separate top-level closure) called it
  anyway, throwing `ReferenceError: segOn is not defined` — after `archetype='custom'` was set but
  *before* `deriveFromWorldStructure()`/regeneration ran. Releasing any of the five sliders silently
  did nothing. Fixed by inlining the same toggle the archetype-button click handler already used
  directly, instead of calling the out-of-scope helper.
- **BUG-2 (HIGH, data loss) — Delete key while typing deleted the selected settlement.** The global
  keydown handler for Delete/Escape had no typing guard, unlike every sibling keydown listener (layer
  hotkeys, Ctrl+Z/space-pan, Shift+D). One stray `Delete` keypress while editing a place's Name/Pop/
  History field silently removed it — no confirm, no undo. Added the same `INPUT`/`TEXTAREA`/
  `SELECT`/`isContentEditable` guard the sibling handlers already use.
- **BUG-4 (MEDIUM, data loss) — inconsistent confirmation on destructive actions.** "Clear all
  labels", "Clear all icons", and the place-editor's "Delete place" button all mutated immediately
  with no confirm/undo, unlike the matching civ-tab clears (territory/roads/places) which already
  confirm with counts. Added matching `confirm()` calls to all three.
- **BUG-5 (MEDIUM) — no `beforeunload` guard anywhere.** Manual "File → Export .zip" is the only save
  path; an accidental refresh/close silently lost everything since the last export. New
  `_hasLiveWorld()` (setup gate hidden = a world exists) + a `beforeunload` listener. Deliberately
  NOT a fine-grained "dirty since export" flag — threading that through every mutation site (places/
  labels/icons/ways/journeys/factions/terrain sculpt/paint…) risks a missed spot silently failing to
  warn; a blanket "warn whenever a world exists" can never silently under-warn.
- **BUG-3 (MEDIUM) — busy overlay hid prematurely with queued operations.** `showBusy`/`hideBusy` had
  no nesting counter, so two ops queued via `withBusy`'s `_busyChain` (e.g. two quick slider changes)
  hid the overlay when the *first* finished while the second was still running — the user saw an idle
  app mid-generation. Added a `_busyDepth` counter as a pure internal-accounting change (every
  existing call site is already a balanced 1:1 pair, so nothing else needed to change), clamped at 0
  so a stray extra `hideBusy()` can never go negative and get "owed" a future hide.
- **BUG-6 (LOW) — dead asset-pack thumbnail gallery.** `renderPackInspector()` has always targeted
  `#packGrid`, which had real, unused CSS but no HTML host element — it silently no-op'd and a loaded
  pack's texture/icon thumbnails never rendered anywhere. Restored the missing `<div id="packGrid">`
  next to `#packInfo`.
- **BUG-7 (LOW) — unescaped user text in `innerHTML` content contexts.** Attribute contexts and the
  History textarea already escaped correctly, but several content-context sites didn't: a settlement/
  faction name containing `<` corrupted the row markup, and `<img src=x onerror=…>` executed. New
  shared `_escHtml()` helper (promoted from an existing local one-off), applied at the settlement/POI
  list row, both faction `<option>` dropdowns, the City Viewer header, and the virtual-scroll
  settlements table row (name + faction) — the confirmed content-interpolation sites of user-editable
  text, not an exhaustive file-wide sweep.
- **BUG-8 (LOW) — stuck Space-pan on focus loss.** `spaceDown` only cleared on `keyup`; an Alt-Tab
  while holding Space meant the browser never delivered that keyup, leaving the next left-drag
  panning instead of using the active tool. Added a `window` `blur` listener clearing `spaceDown`
  (and `_cam3dDrag`, the analogous 3D orbit/pan drag state).
- **Verified.** Engine `tests/run.sh` 992/992, UME `tests/run_um.sh` 852/852 (both unchanged — every
  fix is civ/UI-layer or a pure accounting/escaping change), `node tests/perf/hash_gen1.js` vs v1.23
  **ALL IDENTICAL**, smoke `tests/perf/smoke_gen1.js` **259/259** (+8, one per bug). Each fix was also
  spot-verified directly in a real browser (dispatched real `KeyboardEvent`s, stubbed `window.confirm`
  to decline, toggled `window` `blur`) before being written as a permanent assertion; one test-only
  bug was found and fixed during verification — the BUG-3 assertion needed to force a clean
  `_busyDepth=0` baseline, since an earlier `withBusy()`-queued op elsewhere in the long smoke run can
  still be in flight on its own timer when this block runs.
- **Non-issues from the report, confirmed and left alone**: duplicate `id="finalizeSec"` (the second
  is inside an HTML comment, not a real duplicate); the `generate`/`exportZip`/`loadZip`/`renderNow`
  reassignment-wrapper pattern (every call site resolves the wrapped global lazily, no stale
  reference); the `_sculptCtx.waterOut===_sculptCtx.waterOut` line (an intentional NaN check); modern
  API usage (`CompressionStream`/`OffscreenCanvas`/etc.) already consistently feature-detected.

### v1.23 (2026-07-24)
Two owner-reported issues: a map-interaction bug and a pair of travel/logistics (Journey Planner)
bugs.

- **Settlement clickable area now scales with zoom** (owner: *"when zooming in, the area that is
  clickable to view a settlement stays fixed and thusly becomes relatively bigger, making panning
  near impossible"*). The settlement/POI pins draw at a roughly constant on-screen size
  (`_civZoomK`), but the pick radii were flat GRID-space values (`GW/50`, `GW/35`) that never
  shrank — so zoomed in, the clickable target ballooned on screen and swallowed pan drags near a
  settlement. New `_civZoomPickR(gridR0)` divides the zoom-1 grid radius by the live zoom
  (`viewT.scale` off-LOD, clamped exactly like `_civZoomK`; `_lodZoom` under Tiled LOD), keeping
  the target a constant on-screen size; applied at all five place-pick sites (`_civSelectPlaceAt`,
  `_civDropPlace`, both `_civInfoAt` radii, and the right-click "nearest place" menu). At zoom 1 the
  radius is unchanged, so nothing regresses at the default view.
- **Journey Planner — Open Sea was slower than Coastal Waters** (owner: *"historically backwards"*).
  `JP_TERRAIN.sea` (the STRUCTURAL water-type modifier; wind/current is a SEPARATE axis in
  `JP_ROUTE.sea`) had Open Sea `0.85` < Coastal Waters `1.00` — and `1.00/0.85 ≈ 1.18` was exactly
  the reported 97/82 km-day ratio, confirming a systemic base-table sign error, not a one-off
  adverse-weather roll. Reordered so speed rises with distance from shore (pre-industrial coastal
  sailing hugged the coast and anchored at night; open-sea passages ran continuously): Sheltered Bay
  `0.95` < Coastal Waters `1.00` < Open Sea `1.20`, with Rough Open Sea `0.60` the weather-degraded
  outlier. Measured (Cog, 14 h, neutral wind): Open Sea went **113 → 159.6 km/day**, Coastal
  unchanged at 133. Land/river rows untouched.
- **Journey Planner — vessel autoselect vs. terrain validity consolidated to one source of truth**
  (owner: *"the autoselect assigns a vessel to a leg it isn't fit for, only caught downstream as an
  impossibility flag"*). The selector (`_jpVesselFits`) and the validator (`jpCalcWater`) each
  carried their OWN inline copy of the mode / open-sea-rating / `invalidWater` compatibility rules —
  two definitions free to drift. Both now call one shared `_jpVesselWaterBlock(ship,cat,terrain)`,
  so a vessel the autoselector is allowed to pick can never be one the validator later rejects,
  while the validator still fires for a genuinely infeasible manual/per-stage-override choice. The
  Dhow is left `openSea:true` — historically correct (Indian-Ocean monsoon dhows were genuine
  open-water traders), so the task's "dhow restricted from open sea" premise doesn't apply here; the
  fix is the structural consolidation that prevents the described select-then-reject class of bug for
  any genuinely coastal/river-only craft (Fishing Vessel, River Barge, River Galley, Keelboat).
- **Verified.** Engine `tests/run.sh` 992/992, UME `tests/run_um.sh` 852/852 (both unchanged — the
  edits are all civ/Journey-Planner, block 2), `node tests/perf/hash_gen1.js` vs v1.22 **ALL
  IDENTICAL** (JP tables and pick radii never touch the terrain raster), smoke
  `tests/perf/smoke_gen1.js` **251/251** (+8: Open Sea > Coastal; no residual sea-pair ordering bug;
  selector⟺validator agree for every vessel × water terrain; autoselect never flagged invalid; an
  autoselected Open Sea vessel passes the real `jpCalcWater`; a manual river-barge-on-open-sea is
  still blocked; the Dhow spot-check; and the settlement pick radius shrinking with zoom). An
  autoselection sweep across all nine water terrains showed zero invalid picks. Canvas/pointer
  interaction (the settlement pan-near-pin feel) — flagged for manual on-device confirmation per the
  headless carve-out.

### v1.22 (2026-07-21)
Three owner-reported items in one pass — two touch/joystick fixes and one LOD fidelity fix.

**Owner: "The joystick works in the opposite direction that we push, and on mobile/tablet i
think we should just have it in all views."** Plus: **"When using LOD pyramid tiling LOD0 seems
to be of poor resolution (even if we pick 1k/2k) and the individual sub division of tiles below
LOD0 should be tiles of 512px."**

- **Sculpt pan joystick direction fixed.** The v1.19 port of `Cartalith_V1.915.html`'s ANDROID
  NAV PAD dropped the source's velocity **negation** (`vx = -(dx/mag)*…`, whose comment reads
  "drag the knob right → reveal map to the right"), so pushing the stick moved the view the
  opposite way. Restoring that single sign in `_sculptNavSetKnob` fixes both pan-loop branches at
  once — push the stick right and the view now travels right (off-LOD `viewT.panX += _svx` and LOD
  `_lodCx -= _svx` already carry the opposite signs the two camera conventions need).
- **Joystick shown in all main-map views on touch.** Was gated to the Generate → Sculpt sub-tab
  (`_sculptEditorActive()`); now `_sculptNavSync` shows it on any touch device whenever the main
  map is the active surface (Generate/Explore/Cartography/Civilization), hidden only where a
  different camera owns the screen or there's nothing to pan: the setup gate (`#onboard`), the 3D
  view (`_view3dOn`), and the City Viewer modal. Re-synced from each of those transition points.
- **LOD0 resolution — supersampled compositor + finer base tiles.** The LOD viewer composited into
  the GW×GH `#view` canvas, so fully zoomed out the whole map mapped 1:1 into GW pixels (the coarse
  field resolution) and the pyramid's finer sub-tiles were downsampled straight back to GW, adding
  no visible detail before the display upscaled it. New `_lodRenderW()` supersamples the LOD
  backing canvas (2× the field width, hard-capped at 2560px so tablets stay smooth and big worlds
  never downsample), `lodViewRect` picks the pyramid level against that render width (so LOD0 now
  composes from 2×2 finer tiles instead of one coarse tile), and `drawLODView` maps its unchanged
  GW×GH draw math onto the larger backing via a context transform. `renderNow` restores `#view` to
  GW×GH on the non-LOD path (default render stays **byte-identical** — hash battery ALL IDENTICAL
  incl. every opt-in scenario), and `_v3dGrabColor` downscales the whole (possibly supersampled)
  canvas for the 3D drape instead of cropping its corner. `scheduleLodRefine` now sharpens on any
  settle (was gated to zoom > 1.05, which skipped the fully zoomed-out base).
- **Verified.** Engine `tests/run.sh` 992/992, UME `tests/run_um.sh` 852/852 (both unchanged),
  `node tests/perf/hash_gen1.js` vs v1.21 **ALL IDENTICAL** (default + geoid/waves/ao/icons — the
  changes are all opt-in LOD / touch-only paths), smoke `tests/perf/smoke_gen1.js` green.
  Browser-probed: LOD0 at a 1024px world now picks pyramid z=1 (4 sub-tiles, each 1024px = 2×
  procedural detail) into a 2048×1310 backing, rendering crisp fine rivers/coastlines where v1.21
  showed one upscaled coarse tile; the joystick shows in Generate → World (non-Sculpt) on a mobile
  UA, hides behind the setup gate and in 3D, and pushing right yields `_svx < 0` with `viewT.panX`
  decreasing (view travels right). Canvas/pointer/GPU interaction — flagged for manual on-device
  confirmation per CLAUDE.md's headless carve-out.

### v1.21 (2026-07-20)
**Owner: "I'd like zoom and pan buttons and an option for the viewer to zoom. That way it should
be easier to work accurately with larger resolution sheets."** Follow-up to a question about the
Asset Library's sprite-sheet slicer (`SpriteSheetImporter`, script block 3): no size cap exists on
upload, but the slicer's canvas always scaled the *entire* sheet down to fit a fixed box, so a
large/detailed sheet just shrank — there was no way to work at higher precision.

**Key finding that shaped the approach**: the slicer's canvas already sits inside
`.al-slice-cv-wrap`, which is CSS `overflow:auto` — that never used to trigger because `redraw()`
deliberately capped the canvas to always fit inside it. Lifting that cap when the user zooms in
makes the canvas larger than its container, and the **browser's own scrollbars/wheel-scroll/
touch-scroll pan it for free** — no custom camera system needed, unlike the main map's `viewT`/
`zoomAt` or the v1.18 City Viewer's `_cvCam`. This also meant `evToSrc(e)` (the function every
existing tool — cell select, grid-handle drag, the eyedropper — uses to convert a pointer event to
source-sheet coordinates) needed **zero changes**: `getBoundingClientRect()` already reflects the
canvas's current on-screen position, scrolled or not.

- **Zoom**: new `zoomMul` state (default 1, reset on each new sheet load), multiplying the
  existing fit-to-box scale. `−`/`+`/`Fit` buttons in a new small toolbar row, plus wheel-zoom-to-
  cursor (captures the source point under the cursor via the existing `evToSrc`, applies the zoom
  step, then adjusts the wrap's scroll offset so that point lands back under the cursor — the same
  trick the main map's `zoomAt()` does, just via scroll instead of a CSS transform). A live `NN%`
  readout. Capped so the canvas never exceeds ~6000px on either axis regardless of the sheet's
  aspect ratio (memory-bounded, not an arbitrary "native size" cutoff — sheets that are still hard
  to click precisely even at native resolution can zoom further).
- **Pan**: new 4th mode (`'pan'`, alongside `select`/`grid`/`pick`) in the existing mode-picker
  segmented control — "✋ Pan". A dedicated mode (not a modifier key) avoids any ambiguity with
  cell-click-select or grid-handle-drag. Pointerdown/move/up in this mode adjust the wrap's
  `scrollLeft`/`scrollTop` directly by the drag delta — mirrors the main map's own `panDrag` idiom,
  just targeting scroll instead of a transform. Native scrollbars/trackpad/two-finger-scroll still
  work in every mode as a fallback.
- `.al-slice-cv-wrap` dropped its flex centering (a flex container centering an item that
  overflows it is a known cross-browser quirk — the "before" overflow can end up unreachable by
  scroll); the canvas now sits in plain top-left block flow, which is also the more common
  raster-editor convention once you're zoomed in.

**Verification:** `tests/run.sh`/`tests/run_um.sh` **992/852, unchanged** (script blocks 1/4
untouched — this is entirely inside the block-3 `SpriteSheetImporter` object). `hash_gen1.js` vs
v1.20 — **ALL IDENTICAL including the `icons` scenario** (Asset Library UI change, zero effect on
map rendering, unlike v1.20's own intentional divergence there). `smoke_gen1.js` **243/243** (+7):
new coverage drives the tool purely through the DOM/real input exactly like an actual user, since
`SpriteSheetImporter` lives inside the Asset Library's own IIFE and is deliberately not exposed on
`window`; pan-drag and click-to-select assertions use real Playwright mouse events rather than
synthetic `dispatchEvent`-built `PointerEvent`s, since `canvas.setPointerCapture` requires a
genuinely browser-tracked pointer. Confirms: the zoom toolbar/Pan button exist once a sheet loads;
a sheet loads at a sane fit scale; Zoom In grows the canvas past the wrap (scrolling now applies)
and Fit restores it; a Pan-mode drag moves the wrap's scroll by the exact drag delta; **cell
click-to-select still hits the right cell at a non-fit zoom** (the real regression risk — proves
`evToSrc` genuinely needed no changes); wheel-zoom actually zooms in. Playwright-probed against a
synthetic 4096×2731 sheet (matching the dimensions of the reference sheet the owner shared
earlier) with screenshots confirming a zoomed-in view renders cleanly with the grid overlay, cell
labels, and selection highlight all correctly aligned.

### v1.20 (2026-07-20)
**Owner: "let's go up to 4/5 different possible tree types (and for other landscape types and
features) that can be placed at relatively random."** Follow-up to a walkthrough of the Asset
Library's coverage: the procedural map-icon system (`placeMapIcons`/`drawMapIcons`, opt-in via
`state.viz.icons`, default `false`) only ever distinguished two tree styles (conifer vs.
broadleaf) and placed nothing at all on grassland/steppe/desert/tundra. Scoped via
`AskUserQuestion` to the broadest option: 5 biome-conditioned tree kinds, new shrub/cactus/boulder
ground scatter for the biomes that got nothing before, mountain/hill procedural-fallback variety,
and every new kind made **both** auto-scattered (same mechanism as before) **and** manually
placeable via the Icon tool's "Feature icons" family — matching exactly how the original 4 already
worked.

**Biome → feature mapping** (frozen `BIOME_KEYS` index): `conifer`/`broadleaf` unchanged (boreal/
montane-conifer, temperate forest); new `rainforest` (temperate rainforest + tropical jungle, same
dense closed-canopy grid); new `savanna` (savanna + tropical dry, sparse — thinned via a per-cell
hash-probability keep test, same `hash()` the grid jitter already uses); new `wetland` (a real
terrain signal via `currentWetlandMask()`, not a climate bucket — checked FIRST, overriding
whatever forest/grass biome sits underneath a marsh pocket); new ground-scatter `shrub` (grass/
steppe/Mediterranean), `cactus` (warm desert), `boulder` (tundra, and cold desert — split by
`tempField` at 10°C when available). `placeMapIcons` stays the "pure primitive, no globals"
function the headless suite already relies on: the new `opts.tempField`/`opts.wetlandMask` fields
are strictly **optional** (omitted ⇒ desert always reads warm/cactus, no wetland override), so the
live caller passes the real `tempField`/`currentWetlandMask()` while a synthetic test can supply
its own small arrays.

**Mountains/hills** get variety in the **procedural fallback only** — pack art (`mountain`/`hill`
slots) is deliberately left unchanged/unconditioned on climate, to avoid schema churn; only the
zero-asset drawing gains a second look, using module globals `drawMapIcons` may read directly
(same precedent as its existing `assetPack` read): a snow cap below ~2°C (`tempField` already has
elevation lapse baked in, CLAUDE.md invariant 14 — no new computation) and a rockier hill outline
when `rainField` reads arid.

**Vocabulary growth** in the 3 lists that were already parallel: `PACK_ICON_SLOTS` (4→10),
`CIV_FEATURE_ICON_TYPES` (4→10, one new Unicode glyph each), and the Asset Library's own
`FAMILIES` reference table. `assets/make_sample_pack.py` gained 6 new procedural silhouette
generators (same stdlib noise/raster style as the existing `conifer()`/`broadleaf()`/`hill()`) and
`assets/sample_pack.zip` was regenerated (21 icon sprites across the 10 slots, up from 9).
`docs/ASSET_PACK_FORMAT.md`'s icon-slot table grew to match, with a note on the temperature/
wetland-driven refinement so pack authors understand why a desert cell might resolve to `cactus`
or `boulder`.

**Verification:** `tests/run.sh` **992/992** (+8: per-kind biome/wetland/temperature validity
checks against a 4-band synthetic fixture — tempForest/savanna/desert/tundra — plus a synthetic
wetland pocket and a hot/cold desert split, the `opts`-omitted fallback path, and the extended
determinism/flat-lowland/painter-order checks); `tests/run_um.sh` **852/852 unchanged** (script
block 4 untouched); `hash_gen1.js` vs v1.19 — **`default`/`geoid`/`waves`/`ao` ALL IDENTICAL**
(the feature lives entirely behind `state.viz.icons`, default `false`); the battery's `icons`
scenario (`state.viz.icons=true`) **intentionally diverges** for the first time — that is the
feature working, not a regression, exactly analogous to how `parchment`'s own "on → pixels change,
off → bit-identical" pair already distinguishes real effect from default neutrality.
`smoke_gen1.js` **236/236** (+5: the Feature-icons gallery now lists 10 tiles; a new kind arms and
places through the real UI exactly like the original 4; the placed icon draws without throwing;
every new key has a glyph fallback; `PACK_ICON_SLOTS` count). Playwright-probed: the regenerated
sample pack imports cleanly with zero warnings and all 10 icon slots decode; fixed-seed (12345,
whole-world/1024px) screenshots with the icons toggle on show varied canopy shapes across a
world with real biome diversity (confirmed via `buildBiomeRaster()` counts spanning all 12 land
biome keys).

### v1.19 (2026-07-20)
**Owner: "in generate - sculpt I have one small caveat. On mobile/android/ios when I need to drag
the screen I'll paint at the same time. Can we put a small graphic joystick in the bottom right
corner just as the cartalith v1.915 has."** A single-finger drag over the canvas is captured as a
sculpt stroke (`sculptPointerDown`), so on touch there was no gesture left to pan the map with
while painting — Gen1's existing `#panBtn` ✋ TOGGLE (in `#zoomOverlay`) forces a binary choice
(pan mode OR paint mode) rather than letting both coexist. `Cartalith_V1.915.html`'s own
"ANDROID NAV PAD" already solved exactly this in the pre-merge editor: a small always-available
stick that drives continuous camera pan via a `requestAnimationFrame` loop, off the paintable
canvas entirely. Ported (never edited the source file, per the "kept as reference" rule) as a new
`#sculptNavpad` control, stacked directly above `#zoomOverlay` in the same bottom-right corner
column (touch-only, shown only while `_sculptEditorActive()`).

Simplified from V1.915's full nav pad (zoom bar + stick) to just the stick — Gen1 already has
dedicated `+`/`−` zoom buttons in `#zoomOverlay`, so duplicating a zoom slider would be redundant;
"small graphic joystick" per the owner's own phrasing. The pan mechanics
(`_sculptNavSetKnob`/`_sculptNavPanLoop`/`_sculptNavResetKnob`: `MAX_OFFSET`/`DEAD_ZONE`/
`MAX_SPEED` knob-to-velocity mapping, rAF loop, pointer capture on the stick) are a direct port of
V1.915's own functions. The loop drives whichever camera is actually active — `viewT.panX/panY`
off-LOD, `_lodCx/_lodCy` under Tiled LOD — branching on `_lodOn` exactly like the existing
`panDrag`/`_lodPan` drag handlers already do, so a joystick nudge pans identically to a real drag,
just relocated off the canvas. Visibility (`_sculptNavSync`, gated on the existing `isMobile`
constant AND `_sculptEditorActive()`) is re-synced from every place the Sculpt sub-tab's active
state can change: the top Generate/Explore tab switch, the `#genSubBar` sub-tab switch, and
`applyFinalizedUI` (finalizing forces read-only, which also turns off `_sculptEditorActive()`).

**Verification:** `tests/run.sh` **984/984 unchanged** and `tests/run_um.sh` **852/852 unchanged**
(script blocks 1 and 4 untouched — this is entirely script-block-1 UI/CSS, alongside the existing
sculpt pointer-capture code); `hash_gen1.js` vs v1.18 **ALL IDENTICAL** (the joystick is inert,
touch-only UI chrome — the default map render path is untouched); `smoke_gen1.js` **231/231**
(+8: joystick DOM present; hidden on a non-touch browser even with Sculpt active — an explicit
regression guard against it leaking onto desktop; off-LOD knob deflection pans `viewT.panX` the
same direction a real drag would, verified after zooming in past the cover-scale clamp floor;
releasing the knob actually stops the continuous-pan rAF loop; a sub-dead-zone nudge doesn't pan at
all; knob travel clamps to `MAX_OFFSET` and recenters on release — parsed from the knob's
Chromium-reserialized `transform` numerically rather than by exact string match; under Tiled LOD
the same stick drives `_lodCx`/`_lodCy` instead; cycling Sculpt/Generate tabs re-syncs visibility
without throwing). Fixed-seed, mobile-viewport (Android UA + touch emulation) screenshots confirm
placement: the stick sits cleanly above `#zoomOverlay`, clear of `#scaleBar`, and shows the accent-
colored knob + `.dragging` state on a push. Real touch-drag gesture feel (as opposed to the
pan/knob mechanics, which the suite exercises directly) is flagged for a manual device pass per
the project's own GPU/Worker/canvas-interaction carve-out.

### v1.18 (2026-07-20)
**Owner: "introducing a detailed interactive city view accessible from Explore mode"** (part 2 of a
larger religion+city-viewer request; per the owner's own prioritization the City Viewer shipped
first, extending the existing UME engine rather than a new one, reusing existing LOD/cache/
viewport-cull patterns rather than new generic infrastructure — religion editing is a separate,
later effort, untouched here). Research (three parallel codebase passes + direct spot-checks)
established the decisive fact that reframed the whole feature: **`UME.cityGen`'s model already
carries almost everything the spec asked a city's form to depend on** — named districts
(`assignDistricts`), real growth-stage history (`wall.history`/`parcel.age`/edge `.epoch`), and a
full civic/religious/economic building roster (`churches`/`markets`/`civic`/`games`/`details`) —
but **neither existing renderer ever drew any of it** (`_umDrawLayout`'s on-map crossfade and
`_umDrawLayoutPreview`'s popup thumbnail both stop at water→blocks→streets→wall→bridges→buildings).
Second finding: Explore mode's "Info" tool (`_civInfoAt`) only ever filled a plain terrain/nearest-
settlement text sidebar (`#civInfoPanel`) — it never drew a city; the existing rich preview popup is
a Civilization-mode (world-building) tool reached via the Inspect tool, matching the owner's own
framing exactly ("Explore Mode... instead of only displaying basic settlement information"). **Net
effect: this shipped almost entirely as a civ-layer (script block 2) rendering/camera/UI project —
zero new `UME.cityGen` capability, zero new `opts.*`, UME engine suite untouched.**

**Entry point**: `_civInfoAt`'s settlement search gained a tight pin-hit companion test (reusing
`_civSelectPlaceAt`'s own pick radius) — a genuine hit on a settlement with a valid (non-open-water)
model opens the new City Viewer **instead of** the plain sidebar summary; a miss (empty terrain, or
a bare-water pin) falls through to exactly the old behavior. The Civilization-mode editor
(`_civOpenPlacePopup`) is completely untouched — a separate, deliberately preserved workflow.

**City Viewer shell**: new full-viewport modal (`#cityViewerModal`, canvas + docked info panel +
close button) with its own lightweight pan/zoom camera (`_cvCam={panX,panY,scale}`) mirroring the
main map's `viewT`/`zoomAt`/`panDrag` math conventions but fully self-contained — it never reads or
writes the main map's own camera state. Opens via the existing `_umModelForNow` (synchronous,
cache-backed since v1.00) and fits the initial view to the same built-mass bounding box
`_umDrawLayoutPreview` already computes.

**LOD-tiered draw pipeline** (`_cvDrawCity`): starts from `_umDrawLayoutPreview`'s exact layer stack,
generalized to an arbitrary camera, then reveals data no renderer has ever drawn, gated purely by
camera scale (draw-time only — the whole model, including civic/religious/clutter data, is already
generated in one `UME.cityGen()` call regardless of the viewer, so there is no new generation-
laziness machinery, only a draw-time reveal): parcel district fills + gates + plaza outline at the
"city" tier (a genuinely new draw pass — only `blocks` were ever filled before), courtyard-building
distinction at "neighbourhood," and civic/religious/market/clutter glyphs — wells, crosses, cranes,
spoil heaps, drying racks, log booms, garden trees, fences, named markets, the civic hall, churches/
temples, and games/monuments — at "max" detail, each viewport-culled via the exact bbox-with-margin
idiom `drawCivLayer` already uses for settlements (no new spatial index). Per-detail label jitter is
deterministic via the existing global `hash(x,y,seed)` primitive (the UME engine's own `stream`/
`fnv1a` pair lives inside its isolated IIFE and isn't reachable from the civ layer).

**City Information Panel** (`_civPopulateCityViewerInfo`): seven sections — General/Economy/
Infrastructure/Military/Religion/Demographics/History — sourcing exclusively data already confirmed
to exist (`_umSiteProfile`, `_civFactionAggregates()`, the seven `_civPlace*` primitives, the
model's own `wall.history`/`markets`/`churches`/`metrics`). Faction-level figures (culture/
government/religion/power/trade) are explicitly labeled "(faction-level)"; anything genuinely not
simulated — per-settlement religious diffusion, a structured war/siege/plague timeline, literacy/
wealth distribution — gets an honest "not yet modeled" note instead of a fabricated value, the same
discipline v1.16/v1.17 already established. An "✏️ Edit settlement" button opens the existing
Civilization-mode editor rather than a new city-layout editor — deep procedural edits (rename a
district, place a monument at an exact spot, edit an individual road/bridge in the generated fabric)
would need a whole new persisted per-city edit-overlay data model and are explicitly out of scope,
documented in HANDOFF's Next/open section, alongside two other spec items not modeled: literal
contour-terracing of mountain-town street layout and a distinct "pilgrimage city" archetype with
ceremonial roads (both are genuinely new engine capabilities, not data the model already has).

**Verification:** `tests/run.sh` **984/984 unchanged** (block 1 untouched); `tests/run_um.sh`
**852/852 unchanged** (block 4/UME untouched — zero new `opts.*`); `hash_gen1.js` vs v1.17 **ALL
IDENTICAL** (the viewer only ever renders inside its own new modal, opened by explicit action);
`smoke_gen1.js` **223/223** (+7: empty-terrain click leaves the plain sidebar + viewer closed
exactly as before — a hard regression guard; a genuine settlement-pin click opens the viewer instead
of the summary; all 7 info-panel sections render real data including the honest "not modeled" notes;
the camera zooms and LOD tiers reveal different canvas content as scale crosses a threshold; the
Edit button reaches the existing Civilization-mode popup; both close paths — × and Escape — work and
clear camera state; the Civilization-mode editor itself is provably byte-for-byte unaffected).
Fixed-seed (12345, 200km/1024px) screenshots: the viewer's fit-to-built-mass overview and its max-
detail tier (visible market/church/well glyphs, all sourced from that settlement's own real model).

### v1.17 (2026-07-20)
**Owner: "Settlement Generation Audit & Refactor... make settlements emerge naturally from the world's geography instead of appearing as generic procedural stamps... A settlement is not an independent object. It is the visible consequence of: terrain, hydrology, transport, resources, economy, political function, historical growth. The renderer should never invent geography. Every visible feature must be justified by the underlying simulation."** Delivered as the owner's explicitly requested sequence: a full architectural audit FIRST (`docs/research/settlement-generation-audit.md` — 25 subsystems classified Physically-correct / Simplified-but-acceptable / Decorative / Incorrect / Redundant / Missing, with line references and a prioritized weakness list), then phased implementation S1–S7. Every new engine capability is keyed on a NEW `opts.*` being present (the v0.98 guard pattern), so the synthetic path — and with it the headless UME suite's golden hashes — stays **byte-identical**, and everything downstream of `UME.cityGen` renders only under the opt-in `urbanLayouts` toggle + the tap-popup, so the default map render is **bit-identical to v1.16** (hash battery ALL IDENTICAL).

**The audit's decisive finding: the engine modeled water but not land.** v0.98 made the town's water real; nothing ever did the same for relief — `buildSite` invented 3 seeded random Gaussian hills, and that fake `height()`/`slope()` drove street route costs, market siting, bridgePt="flattest approach", `grow()`'s slope>0.34 street rejection, and `terrainSuitability`. Second finding: **no generated settlement had a function** — `p.specialisation` was never assigned by auto-populate (the only write site was the manual editor dropdown), so the owner's classification-by-function had no data to act on and v1.16's Economy pages read defaults.

**S1 — Site Profile** (block 2; "no rendering before this profile exists"). `_umSiteProfile(p)`: a cached per-settlement object (Map keyed `x,y,_fieldGen,_civAggGen`, cap 64) assembled ENTIRELY from existing primitives — elevation/slope/aspect/local-relief/visibility (`slopeAt`/`gradAt`/`curvatureAt`), coast distance (new module-cached `_civCoastDistField()` chamfer DT over the sea mask), river order/width/confluence/distance (`_riverNet` + `traceRiverPolylines` via new `_civRiverPolylines()` cache), floodplain (`currentFloodField()` — the documented valley-width proxy), roads (`_civPlaceConnectedRoads`), resources (`currentResourcePotentials` point + hinterland disc max), biome/temp/rain, carrying K, defensibility, buildable-area fraction. Surfaced as a read-only "Site" line in the Settlement Inspector. Also fixed the **model-cache water-fingerprint collision** (wet-cell COUNT + vertex COUNT could collide across distinct coastlines → one cached layout served for both): `_umCacheKey` now FNV-1a-hashes a position-sensitive stride sample of the mask bytes, plus (S3) a quantized fingerprint of the terrain raster.

**S2 — Functional classification.** Auto-populate now derives `p.specialisation` from the Site Profile via `_civDeriveSpecialisation` — priority rules (fortress→garrison, monastery→monastic, trade_hub trait→trade_hub) then a scored argmax over fishing/mining/timber/grain/pastoral/vineyard with a 0.30 floor ('none' = honestly no economic pull, never a fabricated economy), deterministic via the pass rng, `==null`-guarded so hand-set values are never clobbered (additive to saves — the field already persisted). The **`mining` trait was re-keyed off real ore** (hinterland-disc max of copper/tin/iron/gold/salt > 0.5 via `currentResourcePotentials`) replacing the elevation>0.55 proxy the audit flagged. `civFactionCulture` now passes through to `opts.culture` (UME's `resolveProfile` falls back to 'medieval' — data plumbing, not per-culture morphology yet, stated in the audit).

**S3 — Real terrain into the engine** (the core fix). `_umTerrainCtx(p)` — the land twin of `_umWaterCtx`: a 22 m-cell local raster of the real `field` over the town box, bilinearly sampled (the v0.99 sub-cell convention), passed as `opts.terrain`. `buildSite`'s `height()` bilinears over that raster when present (synthetic hills skipped; raw field units keep the engine's slope×900 calibration); every downstream consumer needed zero changes since they already read `site.height/slope`. `opts.terrainAware` enabled on this path, so building suitability now excludes genuinely steep/flooded parcels. On a coarse world grid the box is honestly near-flat ⇒ a flat-site town, not invented relief. A/B verified in-browser: layouts differ with vs. without real terrain wherever in-box relief ≥0.005; flat sites identical. Also fixed a **latent v1.16 crash**: a real riverPath clipped to the box can be exactly 2 points, and `addRiverBridges` read `site.river[i+1]` past the end (silently swallowed by `_umModelFor`'s try/catch as a never-landing model) — `if(n<3)return` guard.

**S4 — Wall justification + terrain-aware ring.** `_umWallSpec(p)` replaces the boolean tier test with a **none|ditch|palisade|stone ladder** (engine's own bastioned upgrade unchanged): fortress always stone (fixing the audit's unwalled-fortress paradox), garrison-spec ≥palisade, rank≥3 stone, towns stone only with wealth/age/threat (else palisade), fortified villages palisade/ditch, defensible-terrain villages ditch, **most hamlets/villages honestly unwalled**; `p.umWalls` override still wins (true→stone, false→none). The spec threads through `opts.wallStyle` → `grow()` → `buildWall` → `wallState.style`, and both renderers draw palisade (thin brown line + post dots) and ditch (double earth-tone line) visibly lighter than stone. **Terrain-aware ring**: after `builtMassHull`, wall vertices deflect (±30/±60 m, relief-relative scoring — minGain=0.015·relief, cost=3.3e-4·relief per metre, gated on relief≥0.01) toward genuinely higher real ground; the emergent finding (verified by in-page candidate sampling) is that real-terrain-driven growth already places the hull on high ground, so deflection fires exactly when displacement pays — proven via a controlled synthetic-ridge unit test through the public API (ridge: 7 vertices deflect; flat: 0) and exported as the `wallState.terrainDeflected` diagnostic.

**S5 — Bridge & harbour validity.** `_umWaterCtx` now exports `riverOrder` (the Strahler order it already read) and `seaLakeCells` (open-water cells counted BEFORE the river band is stamped, so a stream can't fake open water). With real water, `addRiverBridges`' two decorative auto-spans are gone; new `detectRiverCrossings(site,g)` runs on the FINAL street graph (after `removeWaterCrossings`, `privatizeAlleys` AND `clearFortZone` — the passes that can kill an edge) and records every surviving road×centerline intersection (segInt, ~80 m dedup) as `site.bridges` — **the crossing road IS the bridge** — while a through-town whose river has no crossing road keeps a **ford** at the flattest-bank point instead. `buildHarbour` gained the navigability gate: sea/lake (seaLakeCells≥40) or river order ≥3, plus a cliff-shore rejection (`site.slope(H.pt)>0.5`); failing settlements build no quay/piers/mole and stamp `site.harbourInvalid='unnavigable'|'cliff'` for the diagnostics. Renderers draw bridge decks (only where recorded) and a stippled ford band. Fixed-seed 200 km/1024 px verification: 16 bridges across 15 towns — every one on the centerline with a live road crossing there; 4 of 5 through-towns had no crossing road and all 4 got fords; 13 harbours kept (all navigability-justified), **26 stream "harbours" correctly suppressed**, zero stream ports.

**S6 — Economic districts & details.** `_umPlaceContext` passes `opts.economy={specialisation, oreBearing}` (oreBearing = real direction of the strongest hinterland deposit, rotated into the layout frame; economy null when specialisation is 'none' — no invented economy). `assignDistricts` adds bounded function overrides on top of the radial base, each keyed on the same physical predicates the base pass uses: mining→`oreyard` at the periphery facing the ore bearing (scale-relative fallback for hamlets), fishing→`fishery` along the waterfront, timber→`sawyard` on the bank (periphery fallback — logs come by road in dry country), grain→`granary` by the market (always builds its store), trade_hub→`warehouse` rows along the primaries (sharing the harbour district's deep gable-fronted store grammar), pastoral→outer suburbs become paddocks. Working-yard building grammar (one long shed + open ground) for the yards; per-economy details (spoil heaps, drying racks, log booms) placed inside the assigned districts; both renderers tint economy-district buildings so the function reads on the map. Specialisation joined the model cache key (an editor change invalidates the cached layout). Verified: 36/38 economy towns carry their district (the 2 without are zero-parcel models), zero cross-economy leakage, zero phantom districts on no-economy towns.

**S7 — Diagnostic overlays.** (a) New **Site profile** debug raster view (`siteprofile`, block 1, full established pattern: #debugSeg button + main-renderer branch + legend + `renderDebugTile` mirror + LAYER_GROUPS entry + new cached `currentSlopeField()`): green = flat/dry buildable, red = steep, blue = flood-prone — the Site Profile's slope+flood components as a map layer. (b) New **Settlement diagnostics** vector overlay (block 2, `state.viz.civDiagnostics`, default off, checkbox beside the urban-layouts toggle): per in-view settlement, the exact SITE_WM×SITE_HM footprint box the layout engine builds in, plus a fact card — specialisation, wall spec, river order/distance (or coast distance), and bridge/ford/harbour validity read from the cached layout model (the peek scans the ≤24-entry LRU by seed prefix and NEVER builds a context or triggers generation; ~0.8 ms per civ-layer draw, capped at 60 cards/frame). Everything drawn is derived simulation data.

**Verification:** `tests/run_um.sh` **852/852** (831 + 21 new: additive-opts byte-identity, wallStyle threading, synthetic-terrain determinism + load-bearing A/B + deflection diagnostic, synthetic real-water harbour gate (order-2 rejected/order-5 passes), bridge-on-centerline, one-bank ford fallback, economy districts/details + guard + determinism); `tests/run.sh` **984/984** (block 1 gained only the siteprofile view + `currentSlopeField`); `hash_gen1.js` v1.16 vs v1.17 **ALL IDENTICAL** (default/geoid/waves/ao/icons); `smoke_gen1.js` **216/216** (+5: specialisation on auto-populate, wall-spec ladder, economy→warehouse in-browser, siteprofile view wired, diagnostics overlay draws); fixed-seed screenshots (siteprofile view, diagnostics overlay, ford/palisade/economy towns). Save compatibility: all new place fields (`specialisation` already existed) and `state.viz.civDiagnostics` are additive with load-time defaults.

### v1.16 (2026-07-19)
**Owner: "redesigning the Civilization interface of Cartalith Gen1. This is a UI and data architecture refactor, not a rewrite of the underlying simulation... expose the existing data in a far more structured, scalable, and maintainable manner... generation tools at the top, followed by faction administration, settlement management, and world statistics."** Full research → plan → phased build (P0 data layer through P7 cleanup/ship), approved in Plan Mode before any code changed. `#genCiv` reorganized from a flat Peoples/Settlements/Polity/Infrastructure `<details>`-accordion stack into **Generation → Factions → Settlements → Economy → Statistics** sub-pages, exactly the hierarchy requested. All work in script block 2 (civ/politics layer) + HTML markup around `#genCiv`; script blocks 1/3/4 (engine, asset library, urban-morphology) untouched throughout every phase.

**P0 — data layer** (no UI wiring yet). `_civFactionAggregates()`: the one `O(GW·GH + nPlaces)` cached pass, gated on `[_civAggGen,_civTerrGen,_fieldGen,faction count]` (rebuild only when that key changes), modeled directly on the pre-existing `_civRegionalPopulation()`'s single-grid-loop-plus-places-loop shape. Per faction: population (Σ settlement `.pop` — deliberately NOT the density-integral regional ceiling `_civRegionalPopulation` itself computes, which is kept separate as `foodProductionCapacity` so "Population" reads as actual settled people and "Food production" reads as the land's agrarian capacity), territory km², food surplus (capacity − population), trade/tax income, capital (derived: highest-pop settlement with `kind∈{capital,metropolis}`, else highest-pop of any kind — no new override field, the existing `kind` vocabulary already answers this), a 5-way power breakdown (military/economic/political/cultural/religious + a derived overall mean — every formula spelled out as concrete weighted-normalized terms, explicitly labeled "derived, not simulated" in the UI, never presented as a hidden simulated stat), imports/exports/strategic resources (territory-mean `currentResourcePotentials()` vs. world mean, ±0.15 threshold), and a per-sector production tally (`sectorOutput`: fishing/agriculture/livestock/forestry/mining bucketed from `CIV_SPECIALISATIONS`, everything else folding into `craft` — the one field with no direct backing signal, reused the exact `pop*(0.4+0.6*economicImportance)` weighting the codebase's own `tradeVolume` formula already established, labeled "(approximate)"). Deliberately never re-runs `_civNetworkMetrics`' Brandes betweenness — faction economic/political numbers consume the *persisted* `economicImportance`/`tradeVolume` from the last Auto-Populate/Generate-Roads run (an accepted staleness tradeoff if the owner hand-edits places without re-running those). Seven settlement-level `_civPlace*` functions (Prosperity/Food-surplus/Defensibility/Connected-roads/Connected-rivers/Resource-context) are thin, cheap, on-demand wrappers around primitives that already existed in the file — `_umInferWalls`, `_umSiteKindFromTerrain`, `buildSettlementSuitability`'s defensibility term (`D=max(0,1-4|r-0.35|)`), `currentResourcePotentials()`'s cached full-map Float32Arrays, `_civCatchmentDensityMean` — never a new full-grid pass, called only for rows/inspectors actually rendered. New `civFactionGovernment` parallel array (`CIV_GOVERNMENTS`, 9 types: None/Chiefdom/Tribal Confederacy/Monarchy/Oligarchy/Republic/Theocracy/Empire/City-State) follows the *exact* v1.07 naming-culture / v1.10 state-religion convention — push/pop in `_civAddFaction`/`_civRemoveFaction`, a picker alongside the existing culture/religion selects, `factionGovernment` round-tripping through `_civSyncToState`/`_civSyncFromState` with the same old-save-compatible rebuild-on-short-array fallback. New `_civFactionBannerCanvas(fid,sizePx)`: a small deterministic per-faction shield (6 fixed geometric glyphs by `fid%6`, faction's own colour) — pure rendering, cached, no new persisted bytes, no image-upload system. Verified via a direct Playwright probe against a seeded auto-populated world: faction population sum matches an independent `state.places` sum exactly, territory km² matches an independent cell-count, every numeric field finite, the cache returns the identical object when unchanged and rebuilds on `_civAggGen` bump, all seven settlement functions in-range with no errors.

**P1/P2 — sub-tab shell + Generation page.** New `#civSubBar` (5 buttons, mirroring `#genSubBar`'s own click-handler pattern) + 5 panels. `civPoiTypeRow` and the manual way-drawing controls (type select + Commit-way button) promoted above the bar, always visible regardless of active sub-page, since they belong to the top-level tool palette's Place-POI/Draw-way tools, not any one sub-page. Generation page: pure cut/paste of Auto-Populate's full block, `civAutoPolityBtn`/`civClearTerrBtn` (relabeled "Auto-polity"→"Recalculate Territories"), `civAutoRoutesBtn`/`civClearRoadsBtn` (relabeled "Auto-routes"→"Generate Roads") — same ids/handlers, zero logic change, only the visible label text differs. `civGenProvincesBtn`/territory-radius/icon-and-way-scale sliders/territory-and-way-opacity sliders/way list parked under a secondary "Advanced" `<details>` (no named slot in the owner's 4-item Generation list). Verified: sub-tab bar shows exactly one panel at a time; A/B behavioral-parity probe drove the relocated buttons and confirmed identical `state.places`/`civTerritory`/`civWays` output to calling the underlying functions directly.

**P3 — Settlement Inspector extension.** `_civPopulatePlaceEditor` (still the existing map-anchored popup via `_civOpenPlacePopup()` — not a new component) gains a read-only "Derived" block: Prosperity (`0.4·economicImportance + 0.35·norm(tradeVolume/pop) + 0.25·catchmentHeadroom`), Food surplus/deficit, Defensibility, Connected roads (scans `civWays` for an endpoint within the same `eps=max(1,GW/250)` `_umRouteEnds` already uses — O(ways), not O(places²)), Connected rivers (`_umSiteKindFromTerrain` reuse), Nearby strategic resources — plus a "🎯 Focus camera" button (`_civMoveViewTo`, reused verbatim). All existing editable fields/handlers (Name/Category/Type/Pop/Faction/Economy/Traits/Age/Walls/History/Delete) untouched. Verified: every derived value in the rendered HTML cross-checked against calling the same pure function independently; rename/delete/focus-camera all still work.

**P4 — Factions page.** The existing compact pill picker (`civFactionPicker`, still driving `_civActiveFaction` for the Territory-paint/Drop-settlement map tools — deliberately kept separate from Faction Inspector *browsing*, since painting-as and inspecting are different actions that shouldn't share one selection) stays at the top, unchanged. Below it, a new richer faction list (swatch/name/government pill/population/territory summary per row) — clicking opens `_civPopulateFactionEditor` inline: editable Name/Government/Culture/Religion (writing to the same parallel-array state the pills use — either surface can edit a faction), read-only Capital (with a focus-camera link)/Population/Territory/5-way Power breakdown/Food production/Tax+Trade income/Imports+Exports/Strategic resources/Craft production/a "Diplomatic relations — not yet implemented" placeholder row, plus a lazy-loaded settlement sublist (`<details>` `toggle` gated on `det.dataset.builtGen===String(_civAggGen)` — nothing renders until first expansion, and re-expanding an unchanged faction rebuilds nothing). A thin shared dispatcher `_civPopulateEntityInspector(host,kind,entity,rowRefs)` routes to the settlement or faction populate function — not a mechanical merge (their editable fields differ too much for that to remove duplication rather than relocate it), just a shared convention. Verified: zero sublist DOM children before first expansion, correct population after; re-toggling an unchanged faction is a **DOM node-identity no-op** (same element, same innerHTML) confirmed via direct comparison; government/name edits round-trip into the same state the pills read; the old picker is untouched and still present.

**P5 — Settlements page: virtual-scrolling table.** Search + faction/type/economic-role filters + population range + 7 sort keys (Population/Prosperity/Importance/Economy/Age/Distance-from-selected-or-center/Military-value) over a new `state.civTableFilter` (transient, not persisted — deliberately kept separate from `state.mapFilter`, a semantically different "off-list for map rendering" shape). `_stRebuildFiltered()` runs the filter+sort chain over the full settlement subset once per explicit change (debounced ~120ms on text/number inputs, immediate on selects) — cheap O(n log n) plus a bounded per-row cost (Prosperity/Connected-roads reuse the same small-radius primitives P3 established); `_stUpdateVisible()` never recomputes anything, it only positions/repatches a **fixed-size recycled row pool** (`ST_ROW_H=28px`, `+6` overscan) via `transform:translateY`, sized to the viewport, never to the settlement count. Row click reuses the exact `_civSelectedPlace=p; _civMoveViewTo(...); _civOpenPlacePopup();` precedent the old sidebar list established, including feeding `_civSelectedRowRefs={nameSpan}` to the popup so a Name-field keystroke live-patches the visible row without a table rebuild (mirroring the old list's own "if(sel) rowRefs={nameSpan}" convention — required reordering `_civRenderPlaceEditor()` so the active sub-page rebuilds *before* the inspector opens, so the fresh row ref exists in time). POIs excluded from the table per spec, reachable via a "Show POIs instead" toggle reusing the untouched `_civRenderPoiList`. Old `_civRenderSettlementList()` (superseded — its DOM target `#civSettlementList` no longer exists) and `#civSettlementCount` deleted outright in the same phase's cleanup pass, all 3 call sites updated, zero remaining references confirmed by grep. **Stress-verified** by injecting 4,000 synthetic settlements into a live world: DOM row count stayed ~21-28 regardless of the 4,000 total (virtual scrolling confirmed working, not just present), rendered rows at multiple scroll offsets spot-checked against `_stFiltered[N]`, faction-filter and population-sort results cross-checked against independent recomputation, search correctness confirmed, row click opened the identical popup a map click would.

**P6 — Economy + Statistics pages.** Both render *exclusively* from `_civFactionAggregates()` plus a few trivial extra tallies (way km split by type, settlement-tier counts via the existing `kind` vocabulary, mean Prosperity over all settlements) — no separate computation path, gated by a central `_civRefreshActiveSubPage()` so neither page costs anything while a different sub-tab is open (verified: switching to Generation and back left the Economy DOM byte-identical to before the switch — no eager re-render). Economy: world totals (Agriculture/Livestock/Fishing/Forestry/Mining/Craft/Trade/Tax/Food-surplus/Strategic-resources) plus a per-faction card ("why each faction prospers or struggles" — Trade/Tax/Craft%/Food/Exports/Imports/Strategic-resources). Statistics: world summary (Total population/Settlements/Cities/Towns/Villages/Fortifications/Religious-sites/Road-length/River-ports/Trade-routes/Average-prosperity/Economic-output/Food-surplus, all labeled where derived) plus a compact per-faction population/settlement-count row. Verified: every displayed world and per-faction number cross-checked against an independent recomputation in the probe script (population/settlement-tier counts/road km/trade routes/river ports all matched exactly).

**P7 — cleanup + full regression + docs.** Deleted the now-fully-dead `_civRenderSettlementList()` function and its 3 call sites (its only DOM target was retired in P5; every call site null-checked safely as a no-op in the interim, but per the project's own "delete what's certain to be unused" rule it's gone now, not left as dead weight). One pre-existing smoke assertion ("Civilization → Polity no longer duplicates the timeline/simulate controls") checked for a `<details>` literally named "Polity" via its `<summary>` text — that section no longer exists after the redesign folded its content into Generation → Territories, so the check now verifies the underlying invariant (no `#civTlYear`/`#civSimulateBtn` anywhere inside `#genCiv`) against the whole subtree instead of a name-specific lookup, which is actually more robust to future renames.

**Verification (full battery, every phase):** engine `tests/run.sh` **984/984** unchanged throughout (script block 1 never touched); `tests/run_um.sh` **831/831** unchanged throughout (script block 4 never touched); `hash_gen1.js` vs v1.15 **ALL IDENTICAL** at every single phase checkpoint (P0 through P7 — nothing in this entire redesign touches any render path, by construction); `smoke_gen1.js` **211/211** (one pre-existing assertion updated for the "Polity" rename per above, net assertion count unchanged — every new behavior was instead verified via dedicated standalone Playwright probe scripts per phase, described above, rather than folded into the permanent suite file). No new full-grid simulation pass was added anywhere; no existing object IDs/save-format fields were broken; old saves load with the deterministic per-index Government default exactly like culture/religion already do.

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
