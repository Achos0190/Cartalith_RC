# Blockiness at LOD 6–8: where the detail goes

**Question (owner, 2026-09-17):** *"From LOD 6 to 8 there still is blockyness in the rendering.
Maybe we should shift how we treat the heightmap gradient. At deeper LOD's rebase the lightest and
darkest colors as the extremes and fill in the gradient in between to get the finer heightmap
detail. Can you research what my intent is and what it would cost."*

Research only — **nothing was built.** All figures measured on `Cartalith v2.52 DCC test.html`,
seed 12345, region, 800 km, 1024 px, 512 px tiles. Scripts under the session scratchpad; the
measurements are reproduced below in full so the conclusions can be checked without them.

---

## 1. The intent, restated precisely

The proposal is a **local contrast stretch**: at deep zoom, map the colour ramp's endpoints onto the
*visible* height range instead of the world's, so a tile spanning a few metres uses the whole ramp
rather than a sliver of it.

**Follow-up (same day):** *"Then this would also allow for a finer pixel density in the heightmap."*
It does — and that turns out to be the stronger half of the idea, because the heightmap's **stored**
precision has a hard floor the colour analysis never reaches. That is §6, and §6.1 shows the two
cannot be scheduled apart.

That is a real and correctly-identified defect. In `renderBiomeTileRGBA` the height term is

```js
const r = (h - sl) / denom;      // sl = state.seaLevel, denom = 1 - seaLevel
```

— **globally** normalised: sea level → 0, world peak → 1. `renderHeightTileRGBA` is worse, being a
pure global ramp (`hypso(v)`) with nothing else in it.

## 2. It is real, and it is worse than the report suggests

A genuine lowland plain, z=8, 3.13 km across, 512 px:

| | |
|---|---|
| height span across the whole tile | **3.8 m** |
| that span as a fraction of global `[sea,1]` | **0.1%** |
| distinct colours on a 512 px scanline, **Height view** | **1** |
| longest identical run | **512 px — the entire row** |
| distinct colours, same row, **Biome view** | 32 (longest run 75 px) |

**One colour across the whole row.** Not banding — a solid plate. That is the report.

**It is specific to flat ground, and that is the clue.** The same measurement on the steepest land
cell in the same world:

| z | km across | span (m) | Δr as % of global | Height view colours | Biome view colours |
|---|---|---|---|---|---|
| 4 | 50.00 | 3979.6 | 99.5% | 7 252 | 8 504 |
| 6 | 12.50 | 2751.7 | 68.8% | 14 050 | 14 302 |
| 8 | 3.13 | 2148.5 | 53.7% | 13 004 | 18 991 |

A steep tile at z=8 still spans **half the world's height range** and renders **18 991** distinct
colours with no help at all. Deep zoom is not the variable. **Flatness is.**

## 3. There are THREE floors, and the proposal addresses the second

*(Two were found from the original question; the third — the atlas's height encoding — came out of
the owner's follow-up and is §6. It is the one that turns out to gate the others.)*

### 3.1 The data is flat because the gate makes it flat

Both `amplifyRegion` and `addZoomDetail` multiply every added octave by

```js
relief = Math.min(1, Math.hypot(gx, gy) * 8)     // gradient of the COARSE field
```

On that lowland plain the coarse gradient is `1.78e-5`, so **`relief = 0.0001`**:

| | ungated ceiling | after the gate |
|---|---|---|
| `amplifyRegion` detail | ±827.6 m | **±0.12 m** |
| `addZoomDetail` ladder | ±1183.5 m | **±0.17 m** |

**The gate removes 100.0% of every synthetic octave on this tile.** The 3.8 m the tile does span is
the interpolated coarse field and nothing else. High-frequency energy measures **2.45e-4** on the
flat tile against **2.40e-3** on the steep one — an order of magnitude, in the data, before any
colour is chosen.

The gate is deliberate (`amplifyRegion`'s own comment: *"flat plains/oceans stay smooth"*) and its
purpose is sound — ungated, it would put mountains on the abyssal plain. But it keys roughness on
**coarse gradient alone**, and a floodplain is not smooth at 3 km just because it is level.

### 3.2 And what little is there cannot be seen

Δr = 0.001 of the global range. In the Biome view, `r` reaches colour through:

| site | use of `r` | effect over Δr = 0.001 |
|---|---|---|
| `grassCol` | `d = 1 - r*0.16` | 0.016% brightness — **0.04 of one 8-bit level** |
| `rockCol` | `if (r > 0.82)` | constant |
| `sandCol` | — | ignores `r` |
| `materialWeights` | `smoothstep(0.7,0.95,r)`, `smoothstep(0.08,0,r)` | constant outside those bands |

So between r = 0.08 and r = 0.7 — most of the inhabited world — **`r` is inert.** Measured
directly: `renderBiomeTileRGBA` on that tile with hillshade neutralised returns **exactly 1 distinct
colour**. Every bit of variation in the Biome view at deep zoom is hillshade.

## 4. What the proposal would buy, and what it would break

Rebasing the ramp to the tile's own `[min,max]`, measured on the same tile:

| | |
|---|---|
| distinct colours, shipped global ramp | 2 |
| distinct colours, rebased | **630** |
| **upside** | **×315** |

Enormous. And it fails on two counts as stated.

### 4.1 Seams — fatal, and measured

A per-tile min/max is a reduction over the tile's own contents, so two neighbours derive **different
mappings from the same data.** Measured at the shared column between this tile and its east
neighbour (spans 3.8 m and 10.6 m):

| | max channel jump at the shared column |
|---|---|
| shipped global ramp | **0.0 / 255** |
| per-tile rebase | **142.4 / 255** |

More than half the colour range, at **every tile boundary in the world**. This is v1.29's rule
(*any per-tile pass with a spatial neighbourhood is a seam unless it is sampled from a world-wide
field*) one step further out: not a neighbourhood, a whole-tile reduction.

### 4.2 `r` carries absolute meaning at ~10 call sites

Rebasing changes what `r` *means*, and roughly ten sites read it as an absolute elevation. On a
plain whose true `r` never exceeds **0.4098**:

| threshold | what it selects | pixels that would wrongly cross it |
|---|---|---|
| `r > 0.70` | rock (`materialWeights`) | **5.0%** |
| `r > 0.82` | `ROCK_SCREE` (`rockCol`) | **2.8%** |
| `r < 0.08` | mangrove (`materialWeights`) | **3.8%** |

Scree and mangrove painted onto a lowland plain.

*(Methodology note, because it nearly produced a wrong answer: the first cut of this probe took the
flattest land cell outright and got a high **plateau** at true r = 0.91, where the rock thresholds
already fire legitimately. Its "65% would cross rock" measured nothing. The site selector now
constrains true r to 0.15–0.55.)*

## 5. The finding that reorders the work

**Hillshade is already local and already unbounded in dynamic range.** It is computed from finite
differences within the tile, scaled by `tileShadeExag`, which since v2.25 *increases* exaggeration
as a tile covers fewer coarse cells. It does not care what the global height range is.

Which means: **if the data had detail, the Biome view would already show it — with no colour change
at all.** That is exactly what the steep tile demonstrates (18 991 colours, ungated, unaided).

So the proposal treats the cause that matters *less*. Worse, fixing contrast alone would stretch
3.8 m of nearly-smooth Catmull-Rom interpolation across the full ramp — magnifying the **upsampling
surface** by 315×. Smooth billowing blobs instead of a flat plate is not obviously an improvement.

**Order the work: data first (§7A), storage with or before contrast (§7C), contrast last (§7B).**
See §6.1 — the storage floor must be lifted no later than B. **§7C now does that with
one already-allocated byte**, which is why it is the cheapest item on this list, not a gating one.

### 5.1 The figure

`docs/images/lod7_contrast_compare.png` — one fixed 6.25 km world rect at LOD 7, 512 px, seed 12345,
region, 800 km, 1024 px. **Four rungs, one tile**, each removing one floor:

| | what it is |
|---|---|
| **A** | 16-bit — what a baked chunk held before v2.53 |
| **B** | 24-bit — **v2.53, shipped** (§7C) |
| **C** | + relief gate floored at 0.006 (§7A, proposed) |
| **D** | + Height-view contrast rebase (§7B, proposed) |

**The storage axis is not simulated.** A and B round-trip the tile through the file's own
`packHeight16`/`unpackHeight16` and `packHeight24`/`unpackHeight24` — literally what `atlasPut`
writes and `atlasGet` returns. Only the relief gate is patched, and it is patched to read a runtime
global so `__RELIEF_FLOOR=0` reproduces the shipped build exactly; that is what makes A and B
controls rather than a second implementation. Reproduce with:

```
node tests/perf/probe_lod7compare.js "Cartalith v2.54 DCC test.html" out.png
```

**LOWLAND PLAIN** — 12 524 distinct source heights over **5.92 m** of relief (17 246 over 9.52 m
once the gate is floored). Storage step 0.1052 m → **4.111e-4 m**, 256× finer.

| | A 16-bit | B 24-bit | C + relief floor | D + contrast |
|---|---|---|---|---|
| source heights kept | **58** of 12 524 | **12 524** of 12 524 | 17 246 of 17 246 | 17 246 of 17 246 |
| Biome — colours / longest identical run | 101 / **35 px** | 102 / **35 px** | 99 / **20 px** | 99 / 20 px |
| Height — colours / longest identical run | **1 / 512 px** | **1 / 512 px** | 5 / 23 px | **104 / 5 px** |

**STEEP CONTROL** — 165 111 distinct source heights over 2160.21 m, the same ladder:

| | A 16-bit | B 24-bit | C + relief floor | D + contrast |
|---|---|---|---|---|
| source heights kept | 19 310 | 163 325 | 163 322 | 163 322 |
| Biome — colours / run | 441 / 7 px | 434 / 7 px | 434 / 7 px | 434 / 7 px |
| Height — colours / run | 433 / 5 px | 433 / 5 px | 433 / 5 px | 417 / 5 px |

Read it as four claims:

1. **B is the whole of v2.53 and the Height view does not move at all.** 24-bit storage recovers
   every distinct height the source has — 58 → 12 524, a 216× gain, exactly what §7C measured — and
   the plain is **still one colour across 512 px**. Storage was never what made the plain
   unreadable; it was destroying data that was already invisible. **A fix that recovers the data and
   changes nothing on screen is still the right fix** (nothing downstream can use data the format
   threw away), but it must not be reported as having addressed the report. §7C's own closing line
   says this in words; this is the picture of it.
2. **C is where the plain stops being a plate.** Flooring the relief gate is the only rung that adds
   amplitude rather than fidelity — 5.92 m → 9.52 m — and the Height run collapses 512 px → 23 px.
   It is also the only rung the **Biome** view feels (35 px → 20 px), because that colour comes from
   `materialWeights`/`landColorCore` reading the gradient, not from the hypsometric ramp.
3. **D is Height-view only, and it keeps the tint honest.** 5 → 104 colours. The hypsometric colour
   still comes from the TRUE elevation (rAbs) and only luminance is stretched locally (rLocal), so a
   floodplain still reads as a floodplain. A naive full-ramp rebase was rendered first and put
   **snow and scree on a floodplain at true r=0.41** — §4.2's threshold breakage, photographed. In
   the Biome row D is byte-identical to C, for the §6.1 reason: the rebase cannot be simulated there
   without touching `landColorCore`.
4. **The steep control holds, with one measured cost.** A→B is a real fidelity gain there too
   (19 310 → 163 325 levels) with no visible change, and the relief floor is inert (163 325 →
   163 322, three levels, because the gate only binds where the gradient is near zero and almost
   nothing on that tile is). The one debit is D: Height colours 433 → **417** (−3.7%), the luminance
   stretch saturating at the extremes of a tile already spanning 2160 m. Small, real, disclosed —
   `LOCAL_K` is a tunable and 0.7 was not calibrated against the steep case.

## 6. A third floor: the atlas stores height on a GLOBAL ladder

*(Added after the owner's follow-up: "then this would also allow for a finer pixel density in the
heightmap." It does, and this is the strongest form of the argument.)*

`packHeight16` is `q = Math.round(v * 65535)` over the **global** `[0,1]`, and `bakeVisibleTiles`
stores that `rg16` beside the PNG, so a baked chunk's height returns through `unpackHeight16`. The
step is therefore fixed at **`metersPerUnit / 65535` = 0.1052 m**, however little a tile spans.

Measured against a real `atlasEncodeChunk` → `atlasDecodeChunk` round trip, centre scanline:

| site | z | span (m) | height levels raw → baked | longest flat run raw → baked |
|---|---|---|---|---|
| **plain** | 6 | 23.4 | 505 → **113** | 1 → **16 px** |
| **plain** | 7 | 5.9 | 461 → **33** | 2 → **47 px** |
| **plain** | 8 | 3.8 | 461 → **27** | 3 → **116 px** |
| steep | 8 | 2148.5 | 512 → 481 | 1 → 2 px |

**Baking a lowland tile at z=8 destroys 94% of its height levels and turns 3-pixel variation into
116-pixel terraces.** The steep tile loses essentially nothing. Flatness, once again — and this
happens at exactly the levels the report names, because the bake depth picker reaches LOD 6.

Per-chunk scale+offset — the ordinary quantised-mesh trick — costs the same 16 bits:

| | step |
|---|---|
| 16 bits over the global range | **0.1052 m** |
| 16 bits over this tile's own 3.8 m | **5.82e-5 m** |
| | **≈1800× finer, for zero extra storage** |

### 6.1 Which makes the two rebases ONE change, not two

The terracing is invisible today because the colour ramp is coarser than the quantisation — §4's
2 colours cannot show 27 height levels. Fix the contrast and it stops being masked. Measured, with
the ramp rebased to the tile's own range:

| | distinct colours / row | longest identical run |
|---|---|---|
| raw float32 tile | **233** | **9 px** |
| after the atlas bake | **27** | **116 px** |

**So a contrast fix applied to baked tiles trades a flat plate for a 116-pixel staircase**, and
banding is more objectionable than flatness. The height encoding must be rebased **with, or before,**
the colour — they are not independent options to schedule separately.

Note also what this does *not* touch: the interactive `_lodCache` holds `pyramidTile`'s Float32
output directly, so an **unbaked** deep zoom never sees this floor. It appears only once a region is
baked, which is worth knowing when reproducing the report.

## 7. Cost

### A. Floor the relief gate — small, and the one worth doing first

Give land above sea level a non-zero minimum roughness instead of gating purely on coarse gradient.
One expression in two functions (`amplifyRegion`, `addZoomDetail`) plus a named constant.

- **Re-baselines** every LOD tile and every baked atlas chunk. `field` is untouched, so
  `hash_gen1.js` stays ALL IDENTICAL — the same isolation v2.47 had.
- **Risk:** over-roughening genuine playa, ice sheet and abyssal plain. The floor has to be keyed on
  something that distinguishes them; coarse gradient is exactly what fails here, so a bare
  `Math.max(floor, relief)` is the lazy version and needs measuring against ocean and ice before it
  ships.
- **Verify:** the probe in §3.1 — gated vs ungated octave amplitude, plus seam Δ unchanged at 0.
- **Estimate: half a day.**

### B. Seam-safe local contrast — medium-large, and only after A

Not per-tile min/max. The seam-free shape is the one this file already uses three times
(`sharedSeaFields` v1.29, `riverFieldTile` v2.40, the v2.52 stamp registry): **a world-wide field,
sampled per pixel.**

- Compute a local-relief field once on the coarse grid (max−min over a radius, or a low-pass of
  |∇|), cache it behind a `currentLocalReliefField()` accessor — the `currentSlopeField()` idiom,
  ~7 wiring sites per v1.17's `siteprofile` precedent.
- Sample it **bilinearly** per tile pixel. Two neighbours then evaluate the same continuous function
  at the same world point, so **seam Δ = 0 by construction**, not by blending.
- **Split `r` in two.** `rAbs` keeps every threshold; a new `rLocal` drives continuous shading only.
  This needs a real audit of all ~10 call sites — `materialWeights` ×2, `rockCol`, `grassCol`,
  `sandCol`, the geology exposure `smoothstep(0.5,0.8,r)`, the two strata `Math.sin(r*90)` /
  `Math.sin(r*160)` terms, and `landColorCore`'s `r > 0` guards — classifying each as absolute or
  continuous. Getting one wrong is silent: it paints the wrong material and nothing throws.
- **`landColorCore` already takes 24 arguments.** Adding a 25th is worth weighing against passing a
  small context object; that is a design decision, not a detail.
- **Worker boundary:** anything the tile path reaches must be in `GENPOOL`'s **named function list**.
  A miss is a `ReferenceError` inside the Worker, which v1.61's per-tile isolation turns into a
  **silently skipped tile** — the hazard v2.47 and v2.52 both had to handle explicitly.
- **Re-baselines** tiles and atlas chunks again.
- **Verify:** seam Δ exactly 0 between real adjacent tiles; threshold breakage exactly 0%; the
  §4 upside preserved.
- **Estimate: two to three days.**

### C. Widen the stored word to 24 bits — one byte that is already allocated ✅ BUILT (v2.53)

**Superseded the per-chunk scale+offset design.** Owner asked "and we can't move to 32bit for
example?", which turned out to be the better question. Measured on the same plain tile as §5.1
(5.92 m span, 167 936 px, **12 524 distinct source heights**):

| encoding | step | distinct levels that survive |
|---|---|---|
| 16-bit over the global range (shipped) | 0.1052 m | **58** |
| 24-bit over the global range | 4.111e-4 m | **12 524 — all of them** |
| 32-bit over the global range | 2.4e-6 m | **12 524 — not one more** |
| 16-bit over the chunk's own range | 9.03e-5 m | 12 524 |

**The 32nd bit encodes information `field` never had.** `field` is a `Float32Array`, f32 carries a
24-bit mantissa, and the measured f32 ULP at the top of that tile is **4.110665157e-4 m** against
24-bit fixed-point's **4.110665402e-4 m** — equal to seven figures. That is not a coincidence; it is
the same 24 bits. Above 24, the container stops being the limit and the source becomes it.

**And the byte is already there, already written, already stored.** `packHeight16` emits
`out[i*4+2]=0; out[i*4+3]=255;` — four bytes per pixel, two carrying height, one a constant zero.
`atlasEncodeChunk` hands that `Uint8Array` straight to IndexedDB by structured clone, so **there is
no PNG and no compression in the height path** (the PNG stored beside it is the biome visual). A
baked 1024² chunk already spends 4.19 MB and wastes half of it. Using byte 2 costs **nothing**.

- **Use B, not A.** Byte 3 is equally free here and equally unused, but alpha is the channel that
  breaks the moment anything routes this through a canvas — `putImageData`/`toDataURL` premultiply.
  24 bits is sufficient and keeps that hazard permanently off the table.
- **This removes C's coupling to B.** The per-chunk scale+offset existed only to work around a word
  too narrow for the range it spans. Widen the word and the per-chunk `min`/`span` pair, the record
  version negotiation, and §6.1's "C is not optional if B ships" all dissolve. **Prefer this.**
- **Three format surfaces, and the name goes wrong.** `atlasEncodeChunk`/`atlasDecodeChunk` is
  internal and `rec.ver` is already stamped, so old chunks can branch on it or simply re-bake. The
  other two are published: `exportRegionTiles` writes `tiles/refined_{r}_{c}_rg16.bin`, and
  `loadZip` reads `heightmap_rg16.bin`. `buildTileManifest` already carries a *"height encoding"*
  field, which is the hook for declaring the scheme rather than inferring it — but `rg16` stops
  being an accurate name, and it appears in `SAVEFILE_COMPAT.md`. The save entry is a *fallback*
  beside the full-precision `.f32`, so leaving that one at 16 bits is defensible.
- **Verify:** the table above, regenerated after the change — baked levels must equal raw levels,
  and the longest flat run on a plain must stay at 1–3 px.
- **Estimate: half a day for the atlas; the format naming is the part to decide, not the code.**
- **Shipped in v2.53.** Verified through the real `atlasPut`/`atlasGet` path, not a reimplementation:
  the plain tile's 12 524 distinct heights now all survive a bake (58 on v2.52), max error 0 on that
  tile. `tests/perf/probe_hgt24.js`, 10 assertions, 2 of which fail on v2.52. The save fallback
  `heightmap_rg16.bin` was deliberately left at 16-bit. See `CHANGELOG.md` v2.53.

### D. Do not do

**Per-tile min/max normalisation of the COLOUR ramp**, in any form — 142.4/255 seams, and it
re-baselines nothing usefully that B does not do without them. Note the asymmetry: per-chunk
normalisation of the stored HEIGHT (C) is fine, because the chunk carries its own `min`/`span` and
the decoder reverses it exactly — the value is restored, not re-mapped, so no seam can arise.

## 8. Stated, not established

- **Which view the report came from.** The Height/Relief view measures 1 colour; Biome measures 32.
  The fix ordering above is right either way, but if the owner is in Biome view then A is worth
  *much* more than B, and if in Height view they are closer to equal.
- **Whether a real floodplain at 3 km should be rougher than 3.8 m.** I believe it should — metre-
  scale channels, levees and terraces are ordinary — but that is an assertion here, not sourced.
  Section A's constant needs a real figure before it is calibrated rather than chosen.
- **Ocean and ice were not measured.** Only land sites were sampled, so A's risk of over-roughening
  them is reasoned, not quantified.
