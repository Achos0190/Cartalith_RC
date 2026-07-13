# 08 — Terrain / building-suitability groundwork (Cartalith-port preparation)

**Purpose:** preliminary research + a working, tested prototype for a question raised directly
about the eventual Cartalith Gen1 refactor: *when this generator sits on real terrain instead of
a synthetic site, what decides whether a given patch of ground gets built on at all?* Per
direction, this is **preparatory work only** — nothing here touches Cartalith Gen1; the prototype
lives entirely inside `Urban Morphology v0.1.html`'s own synthetic site model, in the same spirit
as `06-cartalith-integration-map.md`'s existing gap list (§3 item 1 there already anticipated a
"flood band, slope" reader — this document is that gap, worked through and load-bearing).

---

## 1. Research: what makes ground unsuitable for a building, and by how much

Two independent, well-documented physical constraints on where settlement can build at all,
each with a real regulatory/engineering literature behind it (not settlement-pattern research,
which the earlier phases already cover — this is about the *ground*, not the *plan*):

### 1.1 Slope / gradient

| Band | Real-world guidance | Source |
|---|---|---|
| 0–2% | Flat; favoured for large-scale construction, minimal earthwork | General site-development guidance ([UpCodes: Site Grading](https://up.codes/s/site-grading)) |
| 4–8% | Preferred range for residential development | Site-development guidance (above) |
| ≥15% | Building costs start to rise (grading, retaining, drainage engineering); many jurisdictions' hillside-development ordinances apply extra review from here | [Laguna Hills Hillside Development Standards](https://www.codepublishing.com/CA/LagunaHills/html/LagunaHills09/LagunaHills0950.html) |
| ≥25% | Commonly the hard cutoff — no grading or building permitted at all in many hillside ordinances | Hillside development ordinances (above); [IBC 2018 §1804.4 Site grading](https://codes.iccsafe.org/s/IBC2018/chapter-18-soils-and-foundations/IBC2018-Ch18-Sec1804.4) |

### 1.2 Flood / hydrological setback

Riparian/floodplain setback ordinances regulate a no-build buffer measured from a watercourse's
edge, sized to reduce flood damage and preserve the channel's own flood-conveyance capacity:

| Quantity | Value | Source |
|---|---|---|
| Typical fixed riparian setback | 25–300 ft (≈8–90 m), commonly ~100 ft (≈30 m) as a single-figure baseline; often extended to the 100-year FEMA floodplain boundary or wetland edge where mapped | [Stream Buffers and Setbacks — Colorado](https://planningforhazards.colorado.gov/stream-buffers-and-setbacks); [Riparian Setbacks — Chagrin River Watershed Partners](https://crwp.org/riparian-setbacks/) |

### 1.3 The combining method: McHarg's overlay analysis

Multi-criteria land-suitability analysis — independently scoring several physical constraints and
combining them into one suitability surface — traces to Ian McHarg's *Design with Nature* (1969):
map each constraint on its own transparent layer (shaded light-to-dark, high-to-low suitability),
superimpose them, and read off the combined result. This is the direct intellectual precedent for
§2's design (a slope layer and a hydrology layer, combined into one score) and for the same
technique's modern descendant, GIS-based weighted-overlay/multi-criteria decision analysis.

Confidence: the qualitative bands and the overlay method are well-established (H); the *exact*
numeric thresholds used in §2 are a schematic mapping onto this engine's own analytic proxies, not
a literal unit conversion (L) — flagged the same way this project already flags every other
schematic-but-motivated constant (e.g. `docs/03` M-VEN-3).

---

## 2. Design: a two-factor suitability score

```
terrainSuitability(site, p) = slopeScore(p) × floodScore(p)
```

- **`slopeScore`** reuses this engine's existing `site.slope(p)` proxy unchanged — the same value
  already load-bearing for route costs (`docs/03` M-REG-5, Tobler's hiking function). A Gaussian
  falloff `exp(-(s²)/(2·0.3²))` was chosen after sampling `slope()`'s own empirical distribution
  near a settlement core across all five site kinds (typical range ≈0.05–0.5 in this engine's
  units, occasional coastline-`isWater()`-step outliers up to ~4, clipped at 1 before scoring): the
  0.3 half-scale roughly aligns this proxy's "cost-rises" knee with the real-world ~15%-grade
  reference band in §1.1, without claiming a literal percentage equivalence the underlying proxy
  was never designed to support.
- **`floodScore`** reuses the flood-band margin *already* load-bearing elsewhere in this file —
  `riverW/2 + 30` (the same constant `placeAnchors` uses to site the market above the flood band,
  and `buildWall`'s wet-ditch feed reasons about) — rather than inventing a new one. `30 m` plus a
  half-channel-width sits comfortably inside the real-world 8–90 m+ riparian-setback range (§1.2).
  Linear ramp from 0 (in the water) to 1 (at or beyond the margin).
- **Multiplicative, not additive**: a flood-prone flat is still bad because it floods regardless of
  how flat it is; a dry steep slope is still bad because it's steep regardless of flood risk.
  Either factor alone should be able to drag the combined score down — an additive/averaged
  combination would let a perfect score on one factor mask a terrible score on the other, which is
  physically wrong for a hard constraint like "the ground floods" or "the ground is a cliff."

Register: **M-TER-1** (the score itself, always computed) and **M-TER-2** (the opt-in building
gate, §3) — added to `docs/03-mathematical-assumptions.md`.

---

## 3. Prototype: what's actually built and tested in Urban Morphology

Two-layer design, mirroring the additive/opt-in discipline `GenerationRules` already established
(`docs/07` §3.4) — a change of this kind earns its way into the codebase by being provably
incapable of altering any existing behavior unless explicitly asked to:

1. **`terrainSuitability(site,p)`** (engine, new top-level function) computes the score above.
   **`assignDistricts()`** attaches it to every parcel as `par.suitability`, unconditionally, for
   every profile and every generation — pure new *data*, never read by any existing decision.
   `hashModel()` does not hash it, so this cannot be caught by (or break) the cross-version
   neutrality this project already holds every addition to. Visible in the inspector on any
   parcel click ("terrain suitability: NN%").
2. **`opts.terrainAware`** (boolean, default `false`/omitted) is the separate switch that lets the
   score actually *do* something: in `buildBuildings()`, a parcel scoring below 0.5 is left
   unbuilt (`par.empty = true; par.unsuitable = true`) — the same "left as bare ground" outcome
   the engine already uses for undersized or agrarian-paddock parcels, not a new rendering path.
   0.5 is the threshold at which *either* factor alone, at its own "moderate concern" reference
   point from §1 (slope ≈ the 15%-grade-equivalent reference scores ≈0.61 alone; flood-margin
   distance at half the setback scores 0.5 alone), can already pull a parcel below the bar — a
   principled reading of "either constraint alone should be able to disqualify a site," not a
   number tuned to produce a particular demo effect. A new "terrain-aware placement
   (experimental)" checkbox in the UI (off by default) wires this through `regen()`.

### Neutrality

`generate()` with `terrainAware` omitted is **byte-identical** to every prior version: verified
both by a dedicated hash-comparison test and by the full pre-existing 1090-assertion suite passing
unchanged after this addition (no assertion needed to change).

### Effect size (empirical, `terrainAware:true`, pop 7000, 5 seeds per site kind)

| Site kind | Parcels left unbuilt | Buildings, off → on |
|---|---|---|
| river | ~1.8% | 5085 → 4962 |
| riverthrough | ~1.8% | 6520 → 6392 |
| bay | ~2.9% | 6451 → 6270 |
| coast | ~6.0% | 3912 → 3693 |
| landlocked | 0% | 6591 → 6591 (unchanged) |

Landlocked genuinely shows no effect at this threshold, honestly, not by omission: with no water
at all, `floodScore` is always 1, so suitability there is slope alone — and this engine's analytic
hill model doesn't generate slopes steep enough within a typical settlement radius to cross the
threshold, on any of the seeds sampled. This mirrors how population realization varies by site
kind for Venus/Palimpsest (`docs/03`) rather than holding uniformly across every site — an honest,
explicable geometric interaction, not a bug.

### Test coverage (`tests/test_tail.js`, "Terrain/building-suitability groundwork")

Every parcel across multiple profiles/sites carries a finite `[0,1]` score; the neutrality
hash-match; suitability measurably correlates with distance from water (independent check against
the model's own exposed `site.river`, not an internal hook); `terrainAware:true` is deterministic
and reports itself back on the model; it never *increases* building count on any sampled
combination (it can only exclude, never add) and does measurably reduce it on some; and — the
same "verify, don't just trust construction" discipline this project applies everywhere else —
`terrainAware:true` is explicitly checked to introduce zero wet-building failures, even though
removing geometry can't logically create a new water intersection.

---

## 4. Mapping onto the real Cartalith Gen1 fields (for the future port)

`06-cartalith-integration-map.md` §1.2/§3 already named the target: *"the EF terrain engine (block
1) under every place: `field` (height), `riverMask`/rivers, sea level, `tempField`/`rainField`,
biome."* That description predates the current Gen1 version; the actual field set (per Gen1's own
architecture doc) is richer and maps directly onto the two factors above, plus a third this
prototype does not yet model:

| This prototype (synthetic) | Cartalith Gen1 field | Notes |
|---|---|---|
| `site.slope(p)` — analytic finite-difference proxy | `field` (heightmap, [0,1], sea level 0.42) — the same finite-difference-of-height approach applies directly, at the world grid's own resolution, using real terrain instead of three Gaussian hills | Gen1 already computes hillshade from `field`; a `slope` derivation is the same math, just not yet exposed as a standalone per-cell "buildability" signal |
| `site.riverDist(p)` / `isWater(p)` | `flowField` (discharge accumulation — the actual river network) + `field` relative to sea level (0.42) + `riverMask`/`riverFloor` (nullable, per `CLAUDE.md`'s own invariant #4) | Gen1's flow accumulation is a strictly better hydrology signal than this prototype's single analytic centerline — a real river network's flood risk varies with discharge, not just distance from a fixed line |
| *(not modeled here)* | `resistanceField` / `heterogeneityField` (from the tectonic substrate, `buildTectonicSubstrate()`) | A genuine third factor worth adding at port time: bedrock vs. weathered/heterogeneous terrain is a real foundation-stability signal Gen1 already computes for erosion, not yet reused for buildability — flagged here as a gap, not attempted |

The refactor implication for `06`'s own gap #1 (*"a function `siteFromTerrain(place, EF) →
{..., flood band, slope, defensible hill}`"*) is now concrete: that reader would compute exactly
`slopeScore`/`floodScore` (§2) directly from `field`/`flowField` at the settlement's world
coordinates, in place of this file's synthetic `height()`/`riverDist()`, and hand the same
`[0,1]` score to an unchanged `assignDistricts`/`buildBuildings`. The *engine-side* consumption
(assignDistricts attaches it, buildBuildings optionally gates on it) needs no change at all —
only the *site model* that feeds it needs to swap from synthetic to real, which is exactly the
"wiring, not new data modelling" framing `06` already concluded with for every other input.

*(Version note, corrected from `06`'s now-stale reference: the current Gen1 file is
**`Cartalith Gen1 v0.85.html`**, not v0.61 — the civ layer is still script block 2, per `CLAUDE.md`.)*

---

## 5. What this explicitly does not do

- **No Cartalith Gen1 file was read, edited, or otherwise touched.** Everything above is
  groundwork validated entirely inside `Urban Morphology v0.1.html`'s own synthetic site.
  Sections 1–3 are load-bearing (researched, designed, implemented, tested); §4 is a mapping
  exercise onto field *names* already documented elsewhere, not new Cartalith code.
- **No foundation/soil-bearing-capacity factor** — flagged in §4 as the natural third factor once
  real terrain (and Gen1's `resistanceField`/`heterogeneityField`) is available; this engine's
  synthetic site has no analogous "geology" to model against today.
- **No aspect/solar-orientation factor** — a real siting consideration in the literature, but a
  softer preference than a hard buildability constraint, and out of scope for a first pass.
- **No terrain-driven building *kind/size* variation** (e.g. smaller structures on marginal
  ground rather than a binary build/don't-build) — the prototype's gate is deliberately the
  simplest version of the idea that's still genuinely testable; a graded response is a natural
  next step, not attempted here to keep this change's blast radius small and easy to verify.
