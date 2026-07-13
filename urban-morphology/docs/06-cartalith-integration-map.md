# Phase 0 (extension) — Cartalith civ-layer → city-generator integration map

**Purpose:** preparation for refactoring the Urban Morphology generator into the Cartalith
Gen1 line. It answers: *what settlement parameters already exist in Cartalith's civilization
layer, and how do they feed a city generator?* Your intuition is right — **most of the
information needed to generate a city is already present**; the refactor is mostly wiring, not
new data modelling.

> **Version note (updated):** the newest Cartalith Gen1 file in the repo is now
> **`Cartalith Gen1 v0.85.html`** (this section originally referenced v0.61, the newest file at
> the time of writing — corrected here rather than left stale, since this document is exactly
> what the eventual port will be read against). The civilization layer is still **script
> block 2** (`CIV_*` vocabularies + `state.places`); block 1 is the terrain engine referenced in
> §1.2 below, now with the fuller field list `08-terrain-building-suitability.md` maps against.
> When the merge happens the new file follows the two-digit-minor rule. This project stays
> isolated until then.

---

## 1. What the civ layer already carries (v0.61, block 2)

### 1.1 The settlement (`place`) record
Each entry in `state.places` that is a settlement (`CIV_SETTLE_KEYS.has(kind)`) carries
(from `_civPopulatePlaceEditor` / `_civEnsurePlaceDefaults`):

| Field | Type / vocabulary | Meaning |
|---|---|---|
| `name` | string | settlement name |
| `x, y` | grid coords (GW×GH) | **position on the world map** → the real terrain/site |
| `kind` | `CIV_SETTLEMENT_CLASSES` | hamlet(0) · village(1) · town(2) · city(3) · capital(4) · monastery(1) · fortress(1) · university(3) · industrial(3) — the number is `rank` |
| `pop` | integer (step 500) | **population** |
| `faction` | index into `CIV_FACTIONS` | polity (name + colour; golden-angle auto-colour) |
| `specialisation` | `CIV_SPECIALISATIONS` | none · fishing · grain · pastoral · timber · mining · vineyard · trade_hub · monastic · garrison — the **one economic focus** |
| `economicImportance` | 0–1 | scales trade/prominence |
| `tradeVolume` | number | economy model output |
| `traits` | subset of `CIV_TRAITS` | fortified · mining · port · trade_hub · military · religious (badges; several allowed) |

### 1.2 Supporting vocabularies & world context
- **`CIV_WAY_TYPES`** — road hierarchy/quality: highway · regional · road · track · ancient ·
  sea-lane. **`civWays`** = the auto-generated inter-settlement network `[{pts,km,sea,name}]`;
  `_civConnectPlaceToNetwork(p)` links a place in.
- **`CIV_POI_TYPES` / `CIV_FEATURE_ICON_TYPES`** — ruins, shrines, peaks, forests, caves, etc.
  (hinterland context / landmarks).
- **The EF terrain engine (block 1)** under every place: `field` (height, [0,1], sea level 0.42),
  `riverMask`/`riverFloor` (nullable — every consumer must null-check), `flowField` (discharge
  accumulation — the real river network, a strictly richer hydrology signal than a single
  centerline), `tempField`/`rainField`, biome (`BIOME_KEYS`)/Köppen (`KOPPEN_KEYS`) — i.e. **the
  real site** (river? coast? hill? floodplain?) is derivable at `(x,y)`. Also present but not yet
  reused for buildability: `resistanceField`/`heterogeneityField` (from the tectonic substrate) —
  a plausible foundation-stability signal, flagged as a gap in
  `08-terrain-building-suitability.md` §4, not yet modelled by this project's own synthetic site.
- **`assetPack.structures.{settlement,poi}`** — per-class structure sprite slots (the icon/art
  side), keyed to the same `CIV_SETTLEMENT_CLASSES`/`CIV_POI_TYPES`.

---

## 2. Mapping — civ params → generator inputs

The PoC generator (`generate(seed, opts)`) currently takes `{seed, pop, epochs, walls,
fortified, site, harbourDefence}` and a synthetic site. Here is how each civ field drives it:

| Generator input (PoC) | Comes from (civ layer) | Notes |
|---|---|---|
| `pop` (M-DEN-1/2 → street length, radius) | `place.pop` | direct |
| settlement **rank / amenity ladder** (M-AMEN-1: markets, town hall, …) | `place.kind` rank | hamlet → 1 market, no wall; capital → full amenity set; `monastery`/`university`/`industrial` add a dominant anchor |
| `walls` | `traits.fortified` (or `kind==='fortress'`) | on when fortified |
| `fortified` (star fort) | `traits.fortified` **+ era ≥ ~1500 + rank ≥ town** | needs a period signal (see §3) |
| harbour present + `site` sub-type | `traits.port` **+ terrain at (x,y)** | port ⇒ build a harbour; river vs bay vs coast vs **river-through** read from the map, not stored |
| `harbourDefence` | `traits.fortified`+`port` (+ era) | chain/sea-wall/mole-fort per §M-HARB-4 |
| **industry siting** (docs/05 §4: mills, tanners, warehouses, kilns…) | `specialisation` + `traits.mining/trade_hub` | fishing→fish market & curing at the strand; grain→granaries + corn market + agrarian ring; timber→sawmills on the race; mining→mining-town form; trade_hub→extra markets + warehouses + exchange; monastic→monastery precinct/church; garrison→citadel/fortress |
| extra churches / cathedral | `traits.religious`, `kind==='monastery'`, high rank | M-DEN-8 parish scaling already keys off pop |
| citadel / garrison | `traits.military`, `kind==='fortress'` | a defensive anchor |
| **primary-route endpoints** (M-REG-1) | `civWays` links + `_civConnectPlaceToNetwork` | the approach roads should leave toward the **actual connected neighbours**, replacing the PoC's synthetic map-edge endpoints |
| **site model** (river/coast/relief/flood) | EF terrain at `(x,y)` | replaces `buildSite`'s synthetic geometry with the real map crop |
| **culture / tradition pack** | `faction` | needs a faction→tradition mapping (see §3) |
| market count / harbour size scaling | `economicImportance`, `tradeVolume` | optional multipliers on M-AMEN-1 |
| deterministic city seed | world seed ⊕ `place` id | matches the PoC's labeled-substream RNG (`stream(seed,label)`) |

**Conclusion:** rank, population, fortification, port, economy/industry, faction, position and
the inter-city road graph are all present. The generator's *inputs* are covered; the refactor
supplies the *intra-city* geometry (streets/parcels/buildings/walls/harbour) the civ layer
does not yet have.

---

## 3. Gaps to close for the refactor

Small, well-scoped additions — none are new research, just plumbing/decisions:

1. **Terrain → site sub-type reader.** A function `siteFromTerrain(place, EF) → {kind:
   river|riverthrough|bay|coast|inland, water lines, flood band, slope, defensible hill}`,
   replacing the PoC's synthetic `buildSite`. Reads `field`/`riverMask`/sea level around
   `(x,y)`. (River-*through* vs river-*crossing* = does the channel bisect the built extent.)
   The "flood band, slope" half of this reader is now worked through in
   `08-terrain-building-suitability.md`: a researched, designed, and *tested* `[0,1]`
   suitability score (slope × flood-proximity, McHarg-style overlay) already runs inside this
   PoC's own synthetic site (`par.suitability`, plus an opt-in `terrainAware` building gate).
   The reader above would compute the same two factors from `field`/`flowField` instead of the
   PoC's analytic `height()`/`riverDist()` and hand the identical score to the *unchanged*
   `assignDistricts`/`buildBuildings` consumers — only the site model swaps, not the consumers.
2. **Faction → tradition/culture pack.** Today `faction` is name+colour only. Add a per-faction
   (or per-region) `tradition` key selecting a morphology pack (medieval-NW-Europe, Roman/
   colonial grid, Islamic, Chinese, …). The PoC already anticipates "tradition packs"
   (`04-architecture-proposal.md` §7); this is the hook that chooses one.
3. **Period / era signal.** Curtain wall vs bastioned star fort, harbour-defence type, and
   amenity set are era-dependent. Derive from `civYear`/`civTimeline` or a project-level
   "tech/era" setting. (M-FOR-4: star forts only from ~1500.)
4. **City-plan storage.** A generated plan is large; generate **lazily on zoom-in** to a
   settlement, cache per place, and travel with the project ZIP like `assetPack`
   (`_alExportEntries`/`_alImportProject` is the established pattern). The plan is a function
   of `(worldSeed, placeId, place fields, terrain crop)`, so it is reproducible and need not
   be stored at all if determinism is exact (the PoC's `dtrig` plan, `04-…` §3, secures
   cross-engine identity).

---

## 4. Refactor architecture sketch

Keep the generator a **pure module** and slot it in as a new view — do **not** entangle it
with the EF pipeline:

```
Cartalith Gen1 (block 1 EF terrain) ─┐
Cartalith Gen1 (block 2 civ layer) ──┤  place record + civWays + terrain crop
                                     ▼
        placeContext = { seed = worldSeed ^ hash(placeId),
                         pop, rank, traits[], specialisation, economicImportance,
                         site  = siteFromTerrain(place, EF),      // §3.1
                         routes = civWays.linksAt(place),          // approach endpoints
                         culture = traditionOf(place.faction),     // §3.2
                         era    = eraOf(civYear) }                 // §3.3
                                     ▼
        cityGen(placeContext) → cityModel   // the PoC engine, unchanged in spirit
                                     ▼
        a new "City" view: click a settlement → render its SVG/canvas plan at high zoom
```

- **Determinism & tests carry over unchanged** — the PoC's 194-assertion headless suite and the
  `M-*` register become the city module's suite. Extract block 1 of `Urban Morphology v0.1.html`
  the same way `tests/run.sh` already does.
- **Isolation until merge:** per the charter, no cross-imports yet; when merged, the city
  module is a **fourth script block** (or a lazy-loaded module) beside EF / civ / asset-library,
  reading civ data through a thin adapter (the `placeContext` builder above) so the two stay
  decoupled.
- **UI:** the civ layer already has place selection, an editor, and a canvas overlay — the
  "generate this city" action is a button on the existing place editor (next to
  "🛤 Connect to road network"), and the plan renders into a zoomed view.

---

## 5. One-line answer to "is the information there?"

Yes: **`pop` + `kind`(rank) + `traits`(fortified/port/military/religious/mining) +
`specialisation` + `faction` + `(x,y)` on real terrain + `civWays` links** is enough to drive
the generator. The refactor adds a terrain→site reader, a faction→tradition mapping, and an era
signal, then calls the existing engine — the intra-city geometry is exactly what this PoC
already produces.
