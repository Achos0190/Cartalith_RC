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

## 3. There are TWO causes, and the proposal addresses the second

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

**Order the work: data first, contrast second.**

## 6. Cost

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

### C. Do not do

**Per-tile min/max normalisation**, in any form — 142.4/255 seams, and it re-baselines nothing
usefully that B does not do without them.

## 7. Stated, not established

- **Which view the report came from.** The Height/Relief view measures 1 colour; Biome measures 32.
  The fix ordering above is right either way, but if the owner is in Biome view then A is worth
  *much* more than B, and if in Height view they are closer to equal.
- **Whether a real floodplain at 3 km should be rougher than 3.8 m.** I believe it should — metre-
  scale channels, levees and terraces are ordinary — but that is an assertion here, not sourced.
  Section A's constant needs a real figure before it is calibrated rather than chosen.
- **Ocean and ice were not measured.** Only land sites were sampled, so A's risk of over-roughening
  them is reasoned, not quantified.
