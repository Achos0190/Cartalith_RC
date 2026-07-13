# 07 — Core Engine / Culture Profile architecture (Phase 1 of the post-PoC expansion)

Scope decision (confirmed with the requester): **architecture-first**. Refactor the engine into a
culture-independent core plus swappable culture profiles, reorder the pipeline to be explicit
about environmental determinism, and formalize the evidence ledger/explainability that already
exists informally as the `M-*` register + inspector `prov` strings. Ship with **two** profiles —
the existing Medieval Western European pack (unchanged output) and a new Roman planned-colony
pack, chosen as the "maximally different" second pack exactly as the original charter's Phase 0
chose "accretive medieval vs. surveyed Roman/colonial" as its two acceptance packs. The remaining
16 civilizations, phased historical growth, negative space, infrastructure layer, graph-theory/
Space Syntax metrics, settlement hierarchy, and the validation panel are later phases — not
attempted here, so as not to ship a shallow, undertested pass across ten subsystems at once.

## 1. Why a Core/Culture split, and what pattern it follows

Procedural city-generation systems are surveyed as falling into a few families — generative
grammar, simulation-based (agents/cellular automata), tensor-field, stochastic, data-driven, and
inverse PCG — and recent architectures increasingly **disentangle spatial-layout simulation from
content/style generation** explicitly: CityGenAgent (2026) separates a "Block Program" (spatial
layout control) from a "Building Program" (architectural composition), and CityX (2024) runs a
plugin protocol over a shared layout so different asset styles snap onto the same generated
blocks. This engine already had an implicit version of that seam (engine block vs. rendering
block in the Cartalith-derived file convention this project's charter reuses); Phase 1 makes it
explicit and *queryable* inside this one engine: a **Core Engine** that only knows about growth,
connectivity, accessibility, density, environment and graph evolution, and a **Culture Profile**
— a plain data object — that supplies everything about *how a given tradition builds*, without
the core engine ever branching on "if medieval / if roman."

Sources: [Procedural city generation beyond game development](https://www.researchgate.net/publication/328944888_Procedural_city_generation_beyond_game_development)
(taxonomy of generation families); [CityGenAgent (2026)](https://arxiv.org/html/2602.05362v2)
(Block Program / Building Program disentanglement); [CityX (2024)](https://arxiv.org/abs/2407.17572)
(plugin protocol over a shared layout).

## 2. Function inventory: Core vs. Culture-specific (audit of the existing ~1,700-line engine)

| Layer | Functions | Notes |
|---|---|---|
| **Core — determinism** | `fnv1a`, `mulberry32`, `stream` | Untouched; every profile uses the same labeled-substream RNG discipline. |
| **Core — geometry kernel** | `V.*`, `polyArea`, `polyCentroid`, `pointInPoly`, `segInt`, `distPtSeg`, `polySelfIntersects`, `chaikin`, `simplify`, `ensureCCW`, `insetPoly`, `clipConvex`, `convexHull`, `densifyLoop`, `nearestIdx`, `polylineCrossings`, `cornerCut` | Pure math; no culture ever touches these. |
| **Core — graph engine** | `makeGraph`, `gKey`, `gridCellsForSeg`, `indexEdge`, `unindexEdge`, `edgesNear`, `addNode`, `nearestNode`, `rawEdge`, `splitEdge`, `attachPoint`, `addStreet`, `addPolylineStreet`, `extractFaces`, `edgeBetween`, `astar`, `ringCrossings` | The planar graph + DCEL face extraction + A* costing is tradition-agnostic: a grid and an organic tangle are both just graphs. |
| **Core — environment/site** | `buildSite`, `distToLine`, `townBank` | Physical site facts (terrain, water, slope) precede any settlement choice — reused verbatim by every profile (this *is* the "Environment first" pipeline step). |
| **Profile-selected — growth model** | `placeAnchors`, `buildPrimaries`, `grow`, `lanePass` | **The single biggest culture fork.** Medieval = epoch-looped organic accretion (densify + explore + T-junction attach) over a least-cost field. A **planned grid** tradition (Roman, and — noted for a later phase — Aztec canal cities) does not grow this way at all: it lays a regular module first. Phase 1 adds `buildGridStreets` as the Roman alternative to `buildPrimaries`+`grow`'s organic street-laying, selected by `profile.planning`. |
| **Core (reused by both)** | `buildBlocks`, `computeMetrics`, `buildHarbour`, `addRiverBridges`, `removeWaterCrossings`, `pruneLargest`, `_killEdge` | Face extraction, harbour/bridge placement against the site, and metrics are geometric/environmental, not cultural — both profiles route through them unchanged. |
| **Profile-supplied — parcel metrology** | `buildParcels` | Medieval = series-platted strip parcels (bisector edge-cells, narrow frontage). Roman = insula subdivision (rectangular lot grid within each grid block). Selected by `profile.parcelPattern`. |
| **Profile-supplied — building grammar** | `buildBuildings` | Medieval = main range + rear wings + courtyard, straight-ridge roofs. Roman = atrium/peristyle domus for the wealthy insulae + multi-storey apartment-block massing for the rest (§4). |
| **Already profile-shaped (reused, extended)** | `buildFaithSites`, `buildCivic` | These *already* branch on `faith`/`civicStyle` (church/temple/shrine/mosque; townhall/basilica/loggia/none) — Phase 0's worship-rite work anticipated exactly this pattern. The Roman profile simply defaults `faith:'temple'`, `civicStyle:'basilica'` and reuses the existing geometry as-is. |
| **Profile-supplied — market/administration** | `buildMarkets` | Medieval = specialised market squares that multiply with rank (M-AMEN-1). Roman civic commerce concentrates in the **forum** itself (macellum where present); Phase 1 keeps `buildMarkets` medieval-only (gated by `profile.markets`) rather than inventing a Roman macellum grammar this phase — flagged as a stub, not silently reused. |
| **Profile-supplied — fortification typology** | `buildWall`, `applyStarFort`, `clearFortZone` | Medieval/early-modern = bank-following curtain or bastioned trace italienne (M-FOR-*). Roman = rectangular-ish castrum-derived enceinte with **4 named gates** (porta praetoria/decumana/principalis dextra/sinistra) astride the cardo/decumanus maximus. Phase 1 adds the Roman gate-naming and rectangular proportion as data on the profile; the underlying wall-drawing machinery (ring, gates, field-of-fire clearing) is reused unchanged. |
| **Core — rendering primitives** | `el`, `pd`, `pl`, `reg`, `roadChains`, `polyAreaApp`, `distPtSegApp` | Unchanged; styling differences (e.g. different building-fill hatching per culture) are a later-phase concern, out of scope here. |
| **Core — orchestration** | `generate()` | Becomes the one place that reads `opts.culture`, resolves the `CultureProfile`, and branches the **growth model only** (organic vs. grid) — everything downstream (blocks → parcels → buildings → districts → amenities → wall → details) stays a single call chain parameterized by the resolved profile object, not by scattered `if` checks. |

This inventory is the concrete answer to charter requirement 1 ("the core engine should remain
unchanged when adding new cultures") — the table's "Core" rows are the engine's invariant surface;
everything a future 3rd/4th profile needs is confined to the "Profile-supplied" rows.

## 3. The `CultureProfile` schema

```js
{
  id:'medieval', name:'Medieval Western European',
  planning:'organic',        // 'organic' (epoch-grown) | 'grid' (planned module, laid once)
  parcelPattern:'strip',     // 'strip' (series-platted burgage) | 'insula' (rectangular lot grid)
  buildingGrammar:'burgage', // key into buildBuildings' grammar switch
  defaultFaith:'church', defaultCivic:'auto',
  markets:true,              // specialised market-square scaling (M-AMEN-1) applies
  wallGates:{ scheme:'organic' },   // gate naming/placement scheme
  orientation:'terrain',     // 'terrain' (river/market-led, organic) | 'cardinal'/'ritual' (grid)
  civicAnchorLabel:'market', // what placeAnchors' central anchor is called/sited as
}
```

The Roman profile:

```js
{
  id:'roman', name:'Roman (planned colonia)',
  planning:'grid', parcelPattern:'insula', buildingGrammar:'domus-insula',
  defaultFaith:'temple', defaultCivic:'basilica',
  markets:false,             // forum civic complex substitutes; macellum grammar is a later-phase stub
  wallGates:{ scheme:'castrum' },   // porta praetoria/decumana/principalis dextra/sinistra
  orientation:'cardinal',
  civicAnchorLabel:'forum',
}
```

`generate()` resolves `CULTURE_PROFILES[opts.culture||'medieval']` once, and every downstream
function that used to hard-code medieval behaviour now reads its choice off the resolved profile
object passed down the call chain — never a global, never a second hidden branch.

### 3.1 Schema fields added while shipping profiles 3–8 (Islamic → Mesopotamian)

Each addition generalizes a mechanism first proven on Roman/Islamic rather than special-casing a
single profile — the recurring discipline of this architecture:

- **`wallGates.scheme`** grew beyond `'organic'`/`'castrum'`: `'bab'` (Islamic — compass-quadrant
  naming keyed to the wall centroid, Arabic proper nouns), `'cardinal'` (Chinese/Aztec/Greek/
  Egyptian — plain North/South/East/West, keyed to the grid maximus axes), `'compass'`
  (Viking/Celtic/Mesopotamian — the same plain compass naming as `'cardinal'` but keyed to the
  wall centroid instead of a grid axis, for organic-growth profiles with no maximus to key off),
  `'byzantine'` (a distinct string whose only job is to block the bastioned trace; no dedicated
  naming pass). Every scheme string other than `'organic'` blocks the anachronistic gunpowder-era
  trace italienne regardless of the fortified checkbox — the single anachronism guard added in
  Phase 1 now does double, triple, quadruple duty unmodified.
- **`householdMultiplier`** (default 1): generalizes the Roman insula-occupancy fix (M-ROM-7) into
  a per-profile multiplier applied to every built parcel, for traditions whose typical lot is
  bigger than medieval's baseline (fewer, bigger lots per hectare ⇒ fewer discrete households at
  the same street length). Chinese, Aztec, Greek and Egyptian all converge on the identical value
  **2.9**, empirically tuned once and then confirmed to transfer unchanged to every later profile
  sharing the same grid+insula+courtyard-house combination — strong evidence the correction tracks
  the *mechanism*, not the culture.
- **`noWalls`** (Aztec only): forces `walls=false` regardless of the UI checkbox, for a lake-city
  whose defence was the lake/causeways/removable bridges, not a curtain.
- **`chinampas`** (Aztec only): opts into `buildChinampas()`, the one genuinely new infrastructure
  layer added in this batch (reclaimed garden strips grown into the water along the shoreline).
- **`deadEndBias`** (Islamic only): fraction of minor street edges `privatizeAlleys()` closes into
  cul-de-sacs post-construction (never a bridge edge — BFS-verified reachable-without-it before
  closing), modelling the historical encroachment process without ever deleting building frontage.

None of these fields touch the core engine's geometry kernel, graph, or environment/site code —
each is read only inside the specific function whose behaviour it's meant to vary, confirming the
Core/Culture split still holds after five additional profiles.

### 3.2 A third planning mode, and the fields added through the rest of the roster

Profiles 9–18 (Maya → Post-Apocalyptic) shipped without needing any further schema growth — every
one of them resolved to `'organic'` or `'grid'` plus a combination of fields already listed above
(`noWalls` picked up two more independently-reasoned cases: Frontier's no-fortification-tradition
and Industrial's defence-obsolete-by-this-era; `factory`/`ruined` are the only genuinely new
Industrial/Post-Apocalyptic-only flags, both read in exactly one function each, `tagFactory()` and
`applyDecay()`). The 19th profile, **The Venus Project**, is the first addition since Roman's grid
to need a structurally new *growth model* rather than a new flag:

- **`planning:'radial'`**: a third mode alongside `'organic'`/`'grid'` — concentric ring streets
  connected by radial spokes to a central hub (`buildRadialStreets()`), rather than an accreted
  tangle or a rectilinear module. Reuses the roundhouse building grammar's regular-polygon-for-a-
  circle technique (docs/03 M-CEL-2) at city scale for each ring, and — critically — needed *no
  change at all* to the core engine's planar-face block detector or to `assignDistricts()` (already
  keyed to distance-from-anchor with no cardinal-direction assumption, so it reads the rings as
  concentric zones for free) or to the epoch/grid dispatch pattern beyond one more `else if` arm.
  This is the strongest evidence yet for the Core/Culture split's central claim: a fundamentally
  different city *shape* was addable by supplying a different street-layout function and nothing
  else downstream.
- **A parcelPattern/buildingGrammar safety finding worth recording**: `insulaLots()` (the
  `'insula'` parcel pattern) subdivides a block's **axis-aligned bounding box**, documented in its
  own comment as relying on grid blocks being rectangles — it does not validate lot corners against
  the true block polygon. Feeding it a curved wedge-shaped ring block would silently produce lots
  overhanging into the street or an adjacent wedge, exactly the kind of impossible intersection
  this project's standing audit exists to catch. Venus therefore pairs `planning:'radial'` with
  `parcelPattern:'strip'` instead — the bisector-based method is shape-aware (it works from each
  block vertex's own bisector, ray-cast-capped against the *true* opposite boundary) and already
  carries the wet-corner and bowtie-quad guards fixed earlier in this project. `buildingGrammar` is
  independent of `parcelPattern` by design, so `'domus-insula'` still works unchanged on strip
  parcels — a combination no earlier profile happened to need, but the schema supported it with no
  code changes, confirming those two fields really were orthogonal all along.
- **`uniformHousing`** (Venus only): forces the domus/insula split's `isDomus` decision to `false`
  unconditionally, so every parcel gets the standardized modular-apartment building rather than an
  elite/mass split — modelling a moneyless, automation-based economy with no housing hierarchy.
  Caught one real population bug during development: the pop-count formula applies a **4x**
  occupancy multiplier to any parcel whose building kind is `'insula block'`, correctly reflecting
  Rome's actual multi-storey tenement (M-ROM-7) — but `uniformHousing` puts *every* parcel in that
  bucket, so the unmodified formula quadruple-counted the entire town (a first pass realized
  180-550% of target population). Fixed by excluding `uniformHousing` profiles from that multiplier
  entirely (`insulaParcels` stays `null`), since Venus's uniform building isn't specified as a
  multi-storey tenement — the correct modelling choice, not just a numeric patch.
- **`waterway`** (Venus only): opts into `buildWaterway()`, a circular irrigation-canal ring in the
  same spirit as the Aztec chinampas — the one genuinely new infrastructure detail for this profile.
  Drawn at a radius beyond the outermost built ring, i.e. entirely outside the street network's
  reach, so — like the chinampas before it — it can never overlap a building or parcel **by
  construction**, not merely by a runtime check (verified empirically: 0 crossings across 30 seed x
  site combinations).
- **`'dome'` civic style**: the first civic hall that isn't a rectangle re-skin — a circular drum
  (reusing the roundhouse's polygon technique again) with a colonnade ring and a dome marker,
  standing in for Fresco's Center for Resource Management.

## 4. Roman planned-colony morphology — quantified (M-ROM register)

| Quantity | Value | Source |
|---|---|---|
| Grid layout | two principal streets, **cardo maximus** (N–S) and **decumanus maximus** (E–W), intersecting at/near the **forum**; minor cardines/decumani at regular spacing fill in the rest of the grid | [Roman city planning](https://www.theartnewbie.com/blog/rome/roman-city-planning); [Quadralectic: Roman grid towns](https://quadralectics.wordpress.com/4-representation/4-1-form/4-1-3-design-in-city-building/4-1-3-4-the-grid-model/4-1-3-4-3-the-roman-grid-towns/) |
| Minor grid spacing | minor cardines ≈ **50–60 m** apart | Roman city planning (above) |
| Insula size | typically **~80–120 m along the decumanus by ~30–50 m along the cardo** in major centres (Rome/Ostia); roughly 3×1 *actus* | [Insula (Roman city) — Wikipedia](https://en.wikipedia.org/wiki/Insula_(Roman_city)) |
| Insula building | multi-storey **apartment block** (the *insula* building proper): ~300–400 m² footprint, ~15–20 m tall (3–5 storeys); wealthier lots instead carry a **domus** (atrium + peristyle courtyard house) | [Insula (building) — Wikipedia](https://en.wikipedia.org/wiki/Insula_(building)); [Missed History: Roman insulae](https://www.missedhistory.com/article/roman-insulae-ancient-apartment-buildings) |
| Forum siting | at or immediately adjacent to the cardo/decumanus maximus crossing, ringed by the principal civic buildings (basilica, temple, curia) | [Roman city planning](https://www.theartnewbie.com/blog/rome/roman-city-planning) |
| Castrum-derived gates | four gates on the military-camp-derived plan: **porta praetoria** (front), **porta decumana** (rear), **porta principalis dextra/sinistra** (flanks, astride the via principalis) | [Castra — Wikipedia](https://en.wikipedia.org/wiki/Castra); [UNRV: Castrum](https://www.unrv.com/military/castrum.php) |
| Camp/colony proportions | a legionary castrum ran roughly **500 × 400 m** with rounded corners; a civilian colonia derived from the same module is typically smaller and squarer | Castra — Wikipedia |
| Orientation | many colonial foundations show deliberate **cardinal or ritual/augural** alignment (solstice-aligned in some cases), contrasting with the organic pack's terrain/market-led orientation — this is a **testable statistical signature**: the Roman pack should show materially lower street-orientation entropy than the medieval pack (M-NET-1-family metric, reused, not reinvented) | [Roman towns oriented to sunrise/sunset on solstices (ResearchGate)](https://www.researchgate.net/publication/314577238_Roman_Towns_Oriented_to_Sunrise_and_Sunset_on_Solstices) |

Register entries to add to `docs/03-mathematical-assumptions.md` under a new "M-ROM" section:
`M-ROM-1` (grid + minor spacing), `M-ROM-2` (insula dimensions), `M-ROM-3` (insula/domus building
form), `M-ROM-4` (forum siting), `M-ROM-5` (castrum gate scheme), `M-ROM-6` (orientation /
statistical signature) — added alongside the implementation in the next commit so the register
and the code land together, per this project's own discipline.

## 5. Environment-first pipeline (audit against the requested order)

Requested: `Environment → Settlement Site → Transportation → Economic Nodes → Urban Growth →
Architecture → Rendering`. The existing `generate()` is audited against this order:

| Requested stage | Existing call(s) | Verdict |
|---|---|---|
| Environment | `buildSite` | Already first. ✓ |
| Settlement Site | `placeAnchors` | Already second — anchor placement is site-conditioned. ✓ |
| Transportation | `buildPrimaries`, `grow` (streets) | Already precedes buildings. For the grid profile this becomes `buildGridStreets`, same slot. ✓ (profile-branched, not reordered) |
| Economic Nodes | `buildPlaza`, `buildHarbour`, `buildMarkets`, `buildCivic` | **Currently interleaved with growth/buildings rather than a distinct stage** — `buildPlaza`/`buildHarbour` run before `grow`, but `buildMarkets`/`buildCivic` run after `buildBuildings`. This is a real ordering gap: economic/civic anchor *sites* are chosen early (correctly informing growth), but the *buildings* that occupy them are built in the amenity pass at the end, which is fine (a market building depends on final parcels) — so no code move is needed, just documentation of the distinction between siting a node (early) and building on it (late, after the fabric exists to build into). |
| Urban Growth | `buildBlocks`, `buildParcels`, `assignDistricts` | Unchanged order. ✓ |
| Architecture | `buildBuildings`, `buildFaithSites`, `buildMarkets`, `buildCivic`, `buildDetails` | Unchanged order. ✓ |
| Rendering | `render()` (app-shell block) | Unchanged, already a separate script block. ✓ |

**Conclusion:** the pipeline was already environment-first in spirite; the one clarification
worth making explicit in code comments is the early-site/late-build split for economic nodes. No
functional reordering is required — the gap was documentation, not sequencing, so `generate()`'s
call order is preserved (avoiding a needless neutrality risk) and instead is now header-commented
by pipeline stage.

## 6. Evidence ledger / explainability (formalizing what already exists)

The `M-*` register (`docs/03-mathematical-assumptions.md`) and every object's `prov` string
already implement most of Charter requirements 9–10 informally. Phase 1 formalizes rather than
replaces this:

- `UME._registerMeta` (new): a small in-engine table mapping the `M-*`/rule identifiers already
  embedded in `prov` strings to `{source, confidence}`, queryable from the UI — the same content
  as `docs/03` re-expressed as data so the running app can show it, not just the markdown file.
- The inspector's existing `prov` field already carries "created because → rule → register
  reference" prose; Phase 1 leaves that mechanism as-is (it satisfies the requirement) and adds
  an **Evidence Ledger panel** (Analysis section) that lists every `M-*`/`M-ROM-*` id referenced
  by the *currently generated* town, so a user can see which register entries are load-bearing for
  the town in front of them, in one place, rather than hunting through individual inspector
  clicks.

## 7. What Phase 1 does **not** do (explicitly deferred, not silently dropped)

Phased historical growth (foundation → disaster → rebuild reshaping geometry), negative space as
first-class objects beyond what already exists (churchyards/commons/cleared fort zones already
model *some* of this), the infrastructure layer (mills/cisterns/aqueducts/quarries), graph-theory
metrics beyond the existing M-NET family (betweenness/closeness/visibility graphs/Space Syntax),
settlement-hierarchy presets beyond the existing population-driven amenity scaling, the
validation/diagnostics panel beyond the existing morphometrics-vs-bands panel, and civilizations
3–18 are all **later phases**, per the confirmed architecture-first scope. Building the two-profile
skeleton correctly now is what makes each of those a data addition later rather than another
engine rewrite.
