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

> **Reading note (post-launch simplification, §3.10 below):** §§3.1–3.9 narrate the historical
> development of this architecture across the tool's original 19-profile roster. That roster has
> since been culled to 2 (medieval + Venus) — §3.10 documents why and what changed. The narrative
> below is left intact as engineering history (the schema decisions, the reused-primitive
> discipline, and the bugs found and fixed all remain accurate and instructive), but a profile it
> names may no longer be selectable in the shipped app; treat culture names in §§3.1–3.9 as
> historical illustrations of the pattern, not a current feature list.

### 3.1 Schema fields added while shipping profiles 3–8 (Islamic → Mesopotamian)

Each addition generalizes a mechanism first proven on Roman/Islamic rather than special-casing a
single profile — the recurring discipline of this architecture:

- **`wallGates.scheme`** grew beyond `'organic'`/`'castrum'`: `'bab'` (Islamic — compass-quadrant
  naming keyed to the wall centroid, Arabic proper nouns), `'cardinal'` (originally Chinese/Aztec/
  Greek/Egyptian — plain North/South/East/West, keyed to the grid maximus axes; every one of those
  profiles, plus the later Colonial, has since converted to organic growth and reads gates through
  `'compass'` instead, §3.6 below — `'cardinal'` remains implemented but is not selected by any
  shipped profile today), `'compass'` (Viking/Celtic/Mesopotamian originally, joined by Chinese/
  Greek/Egyptian/Colonial/Industrial post-conversion — the same plain compass naming as `'cardinal'`
  but keyed to the wall centroid instead of a grid axis, for organic-growth profiles with no maximus
  to key off), `'byzantine'` (a distinct string whose only job is to block the bastioned trace; no
  dedicated naming pass). Every scheme string other than `'organic'` blocks the anachronistic
  gunpowder-era trace italienne regardless of the fortified checkbox — the single anachronism guard
  added in Phase 1 now does double, triple, quadruple duty unmodified.
- **`householdMultiplier`** (default 1): generalizes the Roman insula-occupancy fix (M-ROM-7) into
  a per-profile multiplier applied to every built parcel, for traditions whose typical lot is
  bigger than medieval's baseline (fewer, bigger lots per hectare ⇒ fewer discrete households at
  the same street length). Chinese, Aztec, Greek, Egyptian and (later) Colonial all converged on the
  identical value **2.9** while they used grid+insula platting — evidence the correction tracked the
  *insula lot-size mechanism*, not the culture, which cuts the other way too: §3.6 below records how
  the value stopped applying, and was removed, the moment each of those five profiles converted to
  organic growth on ordinary strip parcels.
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

Profiles 9–17 (Maya → Industrial) shipped without needing any further schema growth — every one
of them resolved to `'organic'` or `'grid'` plus a combination of fields already listed above
(`noWalls` picked up two more independently-reasoned cases: Frontier's no-fortification-tradition
and Industrial's defence-obsolete-by-this-era; `factory` is the only genuinely new Industrial-only
flag, read in exactly one function, `tagFactory()`). Post-Apocalyptic originally shipped as an
18th profile reusing Industrial's stock plus a profile-only `ruined` flag gating `applyDecay()` —
later generalized (docs/03 M-PA register) into a plain `opts.ruined` toggle available over any
culture, once it became clear `applyDecay()` never actually read `profile` at all: collapse is a
state a settlement can be found in, not a tradition with its own street plan, so it no longer has
a dedicated profile entry. The 19th profile, **The Venus Project**, is the first addition since
Roman's grid to need a structurally new *growth model* rather than a new flag:

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
- **`waterway`** (Venus only): opts into `buildWaterway()`, a circular irrigation-canal ring in the
  same spirit as the Aztec chinampas — the one genuinely new infrastructure detail for this profile.
  Drawn at a radius beyond the outermost built ring, i.e. entirely outside the street network's
  reach, so — like the chinampas before it — it can never overlap a building or parcel **by
  construction**, not merely by a runtime check.
- **`'dome'` civic style**: the first civic hall that isn't a rectangle re-skin — a circular drum
  (reusing the roundhouse's polygon technique again) with a colonnade ring and a dome marker,
  standing in for Fresco's Center for Resource Management.

### 3.3 Revising Venus after user feedback: fusion over literal reconstruction

The first Venus cut (§3.2 above) over-literalized Fresco's plans: two bare rings, `markets:false`,
`defaultFaith:'none'`, `noWalls:true`, and a `uniformHousing` flag collapsing every parcel to one
building kind. Direct user feedback ("a lot looks European," and specifically on Venus: "at the
spokes there are often... circular buildings... concentric circles for roads at regular intervals...
roads in between seem to cross... need for amenities and logistics... mix it with medieval Europe
and Asian/Japanese styles... keep the medieval wall and star fort ideas") drove a substantial rework,
documented here because it changes several of the fields above and the underlying schema decisions:

- **`uniformHousing` removed, replaced by `buildingGrammar:'venus-mixed'`** (docs/03 M-VEN-5): a
  genuinely new grammar (not a flag on `'domus-insula'`) that dispatches per parcel by distance-from-
  hub — circular pavilions in the inner band, logistics warehouses in the outer band, and a seeded
  blend of modular apartment / Asian courtyard house / Japanese machiya through the residential
  rings. This is the first building grammar that mixes *multiple* building kinds within one profile
  rather than picking one kind (or an isDomus-style binary split) for the whole town.
- **More rings, plus cross-spokes** (`buildRadialStreets` reworked): 5 concentric rings (was 2) plus
  12 intermediate cross-spokes spanning the outer band, matching the user's "concentric circles at
  regular intervals... roads in between seem to cross" description of Fresco's actual renders more
  closely. A denser mesh packs far more buildable frontage into the same radius, so the built radius
  was tuned down to compensate — realized population would otherwise have reached 160-240% of
  target for the identical settings that used to realize ~85-115%.
- **`markets:true`** (was `false`): the brief explicitly asked for amenity/logistics richness: this
  now reuses the ordinary market-scaling mechanism unchanged, alongside the outer logistics ring.
- **`noWalls`/`defaultWalls:false`** (was a forced-off `noWalls` case): walls and the star fort are
  now a genuine optional toggle reusing the medieval wall/fort machinery unchanged
  (`wallGates.scheme:'organic'`, so the anachronism guard permits the trace) — unwalled by default,
  but a real choice. This is the first profile whose UI wiring sets a *default* checkbox state
  (`profile.defaultWalls`) on culture-select rather than forcing behavior in the engine.
- **The waterway becomes the fort's wet moat** (`applyStarFort`'s new `opts.wetMoat` parameter):
  when fortified, the irrigation canal feeds a wet ditch around the bastions even on a landlocked
  site (`canalFed`), and the separate decorative ring is suppressed so it doesn't render twice.
- **A real bug found while re-enabling walls, directly on-topic for this project's standing
  "impossible intersection" discipline**: `buildRadialStreets`' original `land()` check validated
  only a spoke's two *endpoints* before drawing it — a straight spoke can have both endpoints on dry
  ground and still clip through open water in between (the market anchor sits close to the river by
  design, so several of 12 evenly-spaced spokes pass near-tangent to the bank). Confirmed
  empirically: 4 of 12 spokes on a river site crossed real water despite both endpoints testing dry.
  Fixed by sampling 12 points along each spoke's *entire length* (`landSeg()`) rather than just its
  endpoints — the same "check the whole footprint, not one point" principle already applied to
  wet-parcel/building checks elsewhere in this register, now extended to street-segment validity.
  A second, smaller finding from the same debugging pass: only edges tagged `cls:'primary'` ever
  receive a gate from `buildWall`'s gate-placement loop — the original spokes were all `'street'`-
  class, so a fortified Venus town could end up with **zero land gates** at all. Fixed by tagging
  only the 12 primary spokes `'primary'` (rings and cross-spokes stay `'street'`, and cross-spokes
  now stop one ring short of the boundary so they never need a gate in the first place).

### 3.4 Generation Rules: configurable parameters instead of hardcoded constants

Every profile from Roman onward customizes behavior through new `CultureProfile` *fields* — but the
arithmetic those fields feed into (branch-angle jitter, exploration decay, segment-length
distribution, frontage/depth variance, subdivision caps…) remained hardcoded literals inside
`grow()`/`buildParcels()`/`privatizeAlleys()`. That's fine for adding a new civilization, but it
means no one can dial "how organic vs. planned" or "how chaotic the parcels are" without editing
engine code. `GenerationRules` (`DEFAULT_RULES`, `resolveRules`, `cloneRules`,
`applyWildness`/`applyPlotChaos`) externalizes those literals as a user-configurable, still-typed
parameter object, orthogonal to `CultureProfile`:

- **`DEFAULT_RULES`** groups every externalized value under `street` (14 fields — jitter, exploration
  share/decay/floor, segment-length median/variance, pierce chance, junction-angle limit, market
  gradient decay, parallel-street spacing, dead-end bias, bridgehead distance/probability),
  `parcels` (frontage/depth variance, subdivision cap), `palimpsest` (§3.5 below), and `meta`
  (`wildness`, `plotChaos` — UI sliders only, read by no engine code path). Every value reproduces
  the literal it replaces exactly, so `generate()` with no `rules` option is **byte-identical** to
  every prior version — the same cross-version neutrality discipline this project already holds
  itself to for profiles, now proven by a dedicated test (`generate()` with no `rules` key hashes
  identically to `generate()` with an explicit `resolveRules()` default).
- **`resolveRules(partial)`** clones `DEFAULT_RULES` and `Object.assign`s each group present in
  `partial` onto the matching clone group — a caller can override one field in one group without
  reconstructing the rest. **`cloneRules(r)`** is a plain JSON round-trip: deep and fully independent,
  which matters because `resolveRules` and the meta-slider functions below all mutate their return
  value in place — if `resolveRules` ever returned a reference into `DEFAULT_RULES` instead of a
  fresh clone, the *first* `applyWildness` call anywhere in the app would permanently corrupt the
  engine's own defaults for the rest of the session. (Guarded by a dedicated regression test.)
- **`applyWildness(rules, w)` / `applyPlotChaos(rules, c)`** are UI-side compound sliders, `w,c∈[0,2]`,
  `1.0` = baseline: a single number derives several underlying fields via clamped formulas — e.g.
  `branchAngleJitter = clamp(0.26·w, 0.15, 0.70)`, while `pierceChance` is derived *inversely*
  (`clamp(0.10·(2−w), 0, 0.15)`: a wilder town relies less on deliberately piercing through
  obstacles, more on organic wandering around them). These functions are a convenience layer only —
  they compute values into the same `street`/`parcels` fields `generate()` already reads, never a
  separate code path, so the individual fields remain the single source of truth.
- **The Rules panel** (`#rulesBox`, HTML app-shell block): a profile selector (Default / 5 built-in
  presets / any locally-saved profile), CRUD buttons (New/Duplicate/Rename/Save/Delete/Reset) backed
  by `localStorage['um_rules_profiles_v1']`, JSON export (Blob + temporary download anchor) and
  import (`FileReader`), per-parameter sliders for all 17 `street`/`parcels` fields, the two
  meta-sliders, and a live comparison table (current vs. default: nodes/dead-ends/block size/parcel
  count/street density/parcel size, highlighting any metric that differs by more than 8%). Every
  slider `input` event triggers a 150 ms-debounced call to the existing `regen()` — reusing the
  already-fast (30–200 ms) full generation+render pipeline rather than building a separate
  lightweight preview renderer, since debouncing alone keeps the UI responsive while dragging.
- **Five built-in presets** span the wildness/chaos spectrum documented below; each is a partial
  object resolved through `resolveRules`, so a preset only needs to state the fields it actually
  wants to move:

  | Preset | wildness | plotChaos | Character |
  |---|---|---|---|
  | Planned Grid | 0.2 | 0.2 | Minimal jitter, low pierce-chance ceiling raised, tight parallel spacing — a rigid module. |
  | Classical Town | 0.55 | 0.5 | A humanized grid: noticeably more regular than Organic Medieval, still far from rigid. |
  | Organic Medieval | 1.3 | 1.1 | The engine's own historical default character, slightly exaggerated. |
  | Medina | 1.4 | 1.8 | High dead-end bias, zero deliberate piercing, the highest subdivision cap — a dense, maze-like fabric. |
  | Wild Frontier | 1.9 | 1.0 | Maximum exploration and segment-length variance, long/likely bridgeheads — sprawling and improvisational. |

### 3.5 Palimpsest: a fourth planning mode — founded once, never re-planned

`'organic'`, `'grid'`, and `'radial'` each model a city whose plan is consistent with its whole
history: it either grows organically from the start, or it is planned once and stays legible as
that plan forever. Aleppo and Damascus (Sauvaget 1934/1941) show a genuinely different pattern: a
Hellenistic/Roman colonia **founded once** on a cardo/decumanus grid — exactly the Roman profile's
own founding act — that was **never formally re-planned**, yet transformed almost beyond
recognition over the following centuries as the grid was encroached on, subdivided, and partially
fossilized in place. `planning:'palimpsest'` models the *process*, not just a final shape: it calls
`buildGridStreets` unchanged for the founding act (byte-for-byte the same function Roman uses), then
runs four small "encroachment" sub-passes per epoch, each keyed to `rules.palimpsest` rather than to
`grow()`'s organic exploration:

- **`narrowColonnades` (M-PAL-1)** shrinks a colonnaded avenue's drawn width toward a footpath floor
  (1.8 m) as encroachment pressure rises, but only ever touches `e.w` — the alignment (`e.a`/`e.b`)
  never moves. This is a deliberate, load-bearing safety property, not an incidental one: since
  block-insetting reads edge width at the moment blocks are computed, narrowing a width can only
  ever shrink the drawn road *casing*, never move a centerline or a junction, so this sub-pass
  cannot introduce a new road/wall or road/building intersection **by construction** — mirroring
  Damascus's Via Recta, walkable on the same alignment two thousand years after it stopped being a
  colonnaded Roman street.
- **`dissolveWardWalls` (M-PAL-2)** flags interior residential blocks with a founding enclosure (a
  Chang'an-style *lifang* ward wall), a fraction already dissolved by this snapshot (Skinner 1977's
  Tang-to-Song "medieval urban revolution," when Chinese ward systems broke down). This is a pure
  data/render pass — like the `ruined` toggle's `applyDecay()` (docs/03 M-PA), it runs once
  *after* buildings exist and never adds, removes, or moves a street or parcel vertex, so it cannot
  affect topology. It also could not be made safe by construction alone: a per-edge outward offset
  is fine at a convex block corner but proved unreliable at a reflex (concave) vertex — blocks
  reshaped by `growAlongFixedEdge` are not always clean rectangles, and mitering a corner outward at
  a concave vertex needs a full sign-aware corner solve that this project's own audit found unsafe in
  practice (early attempts logged tens of thousands of building/wall-segment overlaps). The shipped
  version instead **verifies then rejects**: each candidate wall segment is checked against every
  real building in that specific block, and silently dropped (not drawn) if it crosses one —
  correctness by verification, the same discipline already used for this project's wet-parcel and
  bowtie-quad guards, now applied to a rendering feature instead of a growth one.
- **`growAlongFixedEdge` (M-PAL-3)** grows a handful of secondary streets that track the site's
  shoreline/riverbank directly, rather than the founding grid's orientation — the Kaifeng
  post-flood HGIS finding that new streets after a disaster followed the surviving canals, not the
  original plan. A no-op by construction on a landlocked site (there is no fixed edge to grow
  along). **Found only by generating output and inspecting it, not by construction** — three
  compounding bugs made this pass a complete no-op on every site and seed until fixed: (1) its own
  land-safety margin (`riverDist > riverW/2+6`) was *stricter* than the offset `townBank` itself
  places points at (`riverW/2+5` river-side, ~5 m flat on a bay/coast shore), so every candidate
  failed the land check by construction; (2) candidate bank points were drawn uniformly from the
  *entire* map perimeter, so a typical pick landed far from the built town, `attachPoint`'s snap
  radius missed every existing node, and the resulting floating component was deleted by
  `pruneLargest` moments later — candidates are now restricted to bank points within the same 520 m
  radius the other M-PAL passes already use; (3) a bay/coast shoreline is sampled far more finely
  than a river's, so most adjacent-point segments were shorter than the old 20 m minimum-length
  floor and were discarded before the land check ever ran (floor lowered to 8 m). Because the
  underlying mechanism is legitimately probabilistic per generation — Jacobs (2009): encroachment
  began at different times/rates in different cities, so not every generated town needs to show
  every M-PAL feature to the same degree — this is tested in aggregate across many seeds/sites, not
  asserted for every single generation.
- **`lanePass` reused at increased intensity (M-PAL-4)**: the existing "oversized block gets an
  interior back lane" mechanism (previously a fixed 12,000 m² area floor) already *is* Conzen's
  (1960) burgage-cycle pseudo-street pattern — it just needed a tunable threshold instead of one
  hardcoded for every profile. Palimpsest re-runs it with a lower floor scaled by
  `rules.palimpsest.subdivisionPressure`, so blocks too small for the universal pass still fragment
  further as the fabric matures, standing in for the strip-parcel pattern's existing age-driven
  grant-then-subdivide cycle running through "several plot-cycles."

**Housing and gates read the mature identity the plan ended at, not the one it started from**:
`buildingGrammar:'courtyard-house'` (reusing the Islamic/Chinese courtyard grammar) and
`wallGates:{scheme:'bab'}` (the same Arabic gate-naming Islamic uses) — a Palimpsest town founded as
a Roman colonia is walled and inhabited like the Islamic-period city it became, not the one it was
laid out as. This has one more consequence, worth stating explicitly since it is easy to expect the
opposite: **never a bastioned trace**, however large the requested population — `fortified` only
ever becomes true when `profile.wallGates.scheme==='organic'` (the anachronism guard, §2), and `bab`
is not on that list, exactly like Islamic. A city that ends at a mature Islamic-period identity
would not also carry a Renaissance-era European star fort.

**Population/extent calibration** follows the same finding as Venus (§3.3): a strip-parcel pattern
on a grid-founded network packs more buildable frontage into a given radius than Roman's own insula
parcels do at the same extent, so `buildGridStreets`'s founding radius is scaled to 62% of the
organic pack's target radius (tuned empirically the same way Venus's ring radius was — 100% and 55%
both missed before landing on 62%) — realization runs roughly 70–150% of target across the five
site kinds at the same settings, a comparable spread to Venus's own ~47–112%, for the same reason: a
non-organic plan interacts with a bisecting river or open coastline very differently than the
organic pack does.

### 3.6 Revising six profiles after user feedback: grid → organic, except Roman

Direct user feedback asked a specific historical question — of every profile whose plan is a square
raster, where in that culture's own development did it build *without* one, before or after the
raster template was in use? — and then asked for exactly that non-raster version to replace the
raster one, Roman excepted. Six profiles (Chinese, Aztec, Greek, Egyptian, Colonial, Industrial)
converted `planning:'grid'`→`'organic'`; Roman is the one profile in the register that keeps its
grid, unchanged and separately verified byte-identical (hash-compared across 4 seeds × 5 sites with
`fortified:true`, 0 mismatches) since the conversion touches only the six profile objects, never the
shared grid/organic growth mechanisms both still call. Full per-profile historical sourcing (Tang
Chang'an→Song Kaifeng; Tenochtitlan's chinampa periphery; Athens vs. Hippodamian colonies; Amarna's
Main City vs. its Workmen's Village; Zacatecas/Potosí vs. the 1573 Laws of the Indies; Manchester vs.
Lowell, MA) lives in docs/03 §K/L/O/P/U/W, each profile's own revision scope note, and the README —
this section records the mechanism-level, cross-profile consequences instead of repeating them:

- **Three fields changed together, not just `planning`**: each profile also flipped
  `parcelPattern:'insula'`→`'strip'` and `wallGates.scheme:'cardinal'`→`'compass'` in the same edit,
  pre-empting two bugs rather than discovering them empirically afterward. `insulaLots()` subdivides
  a block's axis-aligned bounding box (documented in its own comment as relying on grid blocks being
  rectangles, the same finding Venus's §3.2 safety note already made) — feeding it an organically-
  grown, non-rectangular block would silently overhang lots into the street. And the `'cardinal'`
  gate scheme requires a gate within ~10 units of the wall centroid's own x or y axis (a true grid-
  maximus alignment) — an organic-growth wall has no such axis, so every converted profile now reads
  gates through `'compass'` (centroid-angle naming) instead, the same scheme Viking/Celtic/
  Mesopotamian already used. `'cardinal'` remains implemented in the engine (unremoved, since Roman's
  own `'castrum'` scheme and the anachronism guard are independent of it) but is no longer selected by
  any shipped profile.
- **`householdMultiplier` removed from five of the six, found empirically, not assumed**: Chinese,
  Aztec, Greek, Egyptian and Colonial had shared the identical `householdMultiplier:2.9` (§3.1) while
  they used grid+insula platting. Testing population realization immediately after the planning-mode
  flip (before any other adjustment) showed the multiplier, still in place, over-realized 296–315% of
  target — the value tracked *insula's* fewer/bigger lots, not the culture or the building grammar, so
  leaving it on ordinary strip-platted lots massively overcounted households. Removed from all five;
  confirmed this alone brought every one back to a healthy ~102–109%. This corrects §3.1's original
  claim that the multiplier "transfers unchanged" across profiles — it doesn't; it tracks
  `parcelPattern`, and is documented as removed in docs/03 M-CHN-4/M-AZT-4/M-GRK-3/M-EGY-3 and the
  M-COL revision note.
- **Industrial needed a second, independent fix**: Industrial never had `householdMultiplier` — its
  population instead ran through the hardcoded 4× multi-storey-tenement correction in `generate()`'s
  pop formula (`buildingGrammar==='domus-insula'` ⇒ every `'insula block'`-kind building counts 4
  households), original to Roman (M-ROM-7) and, until this revision, **ungated on `parcelPattern`
  entirely**. Left as-is after Industrial's conversion to strip parcels, it over-realized 412% —
  strip platting produces far more, smaller parcels per hectare than insula did, and the flat 4×
  multiplier was never designed to apply per-parcel at that density. Fixed by adding
  `profile.parcelPattern==='insula'` to the formula's `insulaParcels` gate, bringing Industrial to
  ~109% through ordinary strip density instead (the 4× correction no longer fires for it at all).
  Verified this added condition changes nothing for Roman — the only other `domus-insula` profile,
  still on `'insula'` parcels — via the same byte-identical hash comparison noted above.
- **Safety audit re-run across the conversion**: the standing profile-agnostic wall-crossing/wet-
  building/wet-parcel audit (§2) ran across the six converted profiles × 5 site kinds × 2 fortified
  states × 4 seeds (240 combinations) after both population fixes — 0 failures on all three checks,
  confirming the parcel-pattern change closed the `insulaLots()` risk above rather than merely
  avoiding it by luck.

### 3.7 Signature games/spectacle buildings: a population-gated monument array, all 19 profiles

Direct user feedback, given alongside §3.6's grid-to-organic conversion: every culture should get
its own "signature game building" — the Colosseum/Circus-Maximus pairing named as the motivating
example — not just the six profiles touched above. `buildGames()` (docs/03 M-GAMES register) adds
`model.games`, an array (usually one entry, sometimes two, sometimes empty) alongside the existing
`model.civic`/`model.markets`, populated per culture from a new `GAMES_SPEC` table rather than by
teaching the engine a 17th shape:

- **Four geometry primitives cover all sixteen non-empty entries**: `ellipsePoly` (the roundhouse/
  dome regular-polygon-for-a-circle technique, M-CEL-2/M-VEN-2, with independent x/y radii for a
  near-circular arena), `orientedRect` (a rectangle closure identical in spirit to `buildCivic`'s own
  local `rect()`, just parameterized by an explicit direction vector instead of a plaza edge),
  `stadiumPoly` (a discorectangle — straight sides plus a semicircular cap at each end — for anything
  raced around a turn: circus, hippodrome, racetrack) and `ballcourtPoly` (an "I"/dogbone polygon —
  narrow alley, wide end-zones — for the Mesoamerican ballcourt type). The latter two were added in a
  shape-accuracy revision after a first cut used a plain ellipse for all of them; still no bespoke
  per-culture shape code, just two more reused primitives alongside the original two.
- **Two siting modes, not one — added after a placement-accuracy revision (§3.8 below)**:
  `'peripheral'` (beyond the town's own realized extent — the farthest of any parcel, building or
  wall-ring vertex from the market anchor — retried at another bearing/radius on any water/street/
  monument collision, safe from overlapping real parcels *by construction*) and `'plaza'` (an
  expanding ring search centred on the plaza, starting just outside its own footprint, additionally
  checked against every real parcel since this zone is *not* safe by construction the way the
  periphery is). A doomed candidate under either mode is retried elsewhere; an empty result — no
  safe site found in the search budget — is accepted as honest, exactly as `buildCivic` already
  returns `null` under its own population gate; nothing is ever forced in.
- **Two profiles honestly get nothing**: Mesopotamian (wrestling/boxing attested only in temple/
  palace courtyards, no purpose-built venue — the same "documented no-fit, not a gap" treatment
  already given to Inca's `markets:false`) and Venus (a modern hypothetical with no historical
  building to cite; Fresco's own designs distribute recreation through the rings rather than
  concentrating it in one monument, which is itself the honest answer, not an omission).
- **Palimpsest inherits rather than invents**: resolved to Islamic's own `GAMES_SPEC` entry (the
  maidan) at build time, the same "inherits whichever mature identity it actually builds" reasoning
  already applied to its `buildingGrammar`/`wallGates.scheme` (§3.5) — a real per-profile lookup
  keyed on `profile.id==='palimpsest'`, not a copy-pasted table row.
- **Roman is the one profile with two monuments, not one** — both the amphitheatre and the circus
  are independently well-attested (and both, per §3.8's research, genuinely peripheral for a
  provincial colonia specifically), and the circus carries a higher population gate (6000 vs the
  otherwise-universal 3000) as the rarer, grander undertaking of the pair. This is also the
  register's live test of the mutual-overlap check: with two searches run back to back for the same
  culture, the second (circus) must route around the first (amphitheatre) rather than risk landing
  on top of it.
- **Not hashed, by the same reasoning as `civic`/`markets`**: `hashModel()` never touches
  `model.games`, so this entire register is structurally incapable of affecting the cross-version
  neutrality every other addition in this project is held to — confirmed by the pre-existing full
  suite passing unchanged before this feature's own dedicated tests were added on top.

### 3.8 Revising games buildings after direct review: historical placement and shape accuracy

Direct review of the shipped feature — "stuff for entertainment isn't in the city, check historical
placement and make the shape more theoretically correct" — caught two real problems in §3.7's first
cut, both found by generating output and actually looking at it, not assumed correct from the
mechanism's own description:

- **Every entry was sited peripherally, reasoning only from collision safety.** The `'peripheral'`
  search is safe *by construction* (a candidate beyond the town's own realized extent cannot overlap
  any real parcel, the same guarantee the Aztec chinampas/Venus waterway already rely on), which is
  why the first cut used it universally — but safety and historical accuracy are different
  questions, and nobody had separately checked the second one. A dedicated research pass (docs/03
  M-GAMES register, full source list) found 10 of the 16 non-empty entries were genuinely
  intramural, immediately beside the main square or palace complex: Islamic (Naqsh-e Jahan is
  Isfahan's own centre), Byzantine (the Hippodrome adjoined the Great Palace), Chinese, Aztec,
  Egyptian, Maya, Inca (literally the centre of Cusco's main plaza), Japanese, Colonial, and — a genuine
  surprise given how thoroughly medieval tournaments are associated with dedicated palace
  tiltyards — ordinary-town jousting too (Damen 2016: staged directly in the marketplace; Whitehall/
  Hampton Court were the palace-specific exception). Only Roman (both monuments — a provincial
  colonia's amphitheatre/circus were typically extramural even though Rome's own were not), Viking,
  Celtic, Greek, Frontier and Industrial confirmed out as genuinely peripheral.
- **The first fix attempted was itself unsafe, found only by testing it.** The obvious fix — site
  the ten reclassified entries on the plaza's far edge, mirroring how `buildCivic` already attaches
  to the plaza's near edge — failed on every single candidate, on every edge, for every plaza-sited
  profile tested. `buildPlaza` forms the market square by widening an *existing* through-street
  (`buildPrimaries`' own nearest-primary-edge-to-market), and that original edge keeps running live
  down the new square's middle — the plaza polygon was never actually clear ground the way it looks.
  `buildCivic` happens not to trip over this (its own offset from the plaza edge is small enough to
  usually dodge it, and it was never checked for this failure mode), but a fixed-edge attachment for
  a bigger, more varied set of shapes could not assume the same luck. Confirmed by adding temporary
  instrumentation and observing the actual `segInt` hits against the surviving through-street, not by
  further reasoning about the geometry in the abstract.
- **The shipped fix**: an expanding-ring search centred on the plaza (or the market anchor, on a
  profile with no plaza) — starting just outside the plaza's own footprint and widening across four
  radius tiers, the same "candidate, check, retry elsewhere" discipline as the peripheral search —
  additionally checked against every real parcel (a cheap bounding-circle pre-filter over a
  precomputed per-parcel centroid+radius, then a full edge-crossing/containment check only for the
  few candidates that survive the filter), since this zone is not safe by construction the way the
  far periphery is. Falls back to the original peripheral search if the ring search exhausts its
  budget. Re-verified across all 19 profiles at multiple sites/seeds: plaza-sited entries now land
  60-90 m from the plaza centre (inside the walls) versus 600-720 m for the confirmed-peripheral
  ones — a real, measured separation, not just a label on the data.
- **Shape accuracy**: `stadiumPoly` (discorectangle) replaced a plain ellipse for the circus,
  hippodrome and racetrack — the straight sides are the genuinely distinguishing feature of a track
  raced around a turn that a smooth ellipse elides. `ballcourtPoly` (an actual narrow-alley/wide-
  end-zone "I" polygon) replaced a plain elongated ellipse for the Aztec/Maya ballcourts, matching
  the "I" shape this register's own `prov` text had described in words since the first cut but never
  actually modelled in the geometry until this revision.

### 3.9 Per-culture farmland/pasture: closing the last generic-prop gap

Direct user feedback, given while §3.8's games-building placement fix was still being verified:
"Should also see for pastures and fields I suppose for the farms" — flagging that, unlike every
building type by this point, the hinterland around every single culture's town was rendered with
the exact same generic mechanism (medieval-style selion strips plus scattered orchards), the one
remaining spot where 18 of 19 profiles were still a reskinned medieval village rather than their
own tradition. `buildFarmland()` (docs/03 M-FARM register) closes this gap the same way §3.7 closed
it for civic monuments: a spec table (`FARM_SPEC`) dispatched per profile, not a bespoke mechanism
per culture.

- **A dedicated research pass, same discipline as M-GAMES**: real web search per culture, a named
  source or an honest "shares the baseline pattern" verdict where the record does not support a
  distinctive one (docs/03 M-FARM register, full source list). Confirmed the existing selion-strip
  mechanism is already Medieval's own correct baseline, needing no change beyond extraction into a
  shared `stripFields()` function.
- **Seven shape families, not nineteen bespoke mechanisms**: `stripFields` (the pre-existing
  baseline, now parametrised with an optional `pastureShare`/`pastureFar` ramp), `gridFields` (one
  lattice-scan generator serving both the large regular cadastral grids — Roman centuriation,
  Colonial hacienda grants, Frontier's PLSS sections, Industrial's parliamentary enclosure — and the
  small irregular ones — Celtic field system, Chinese weitian polders, Mayan raised-field platforms,
  Japanese paddy grid — purely by varying cell size/jitter/alignment, since it is genuinely the same
  algorithm at a different scale rather than four near-duplicates), `fanFields` (Islamic/Palimpsest's
  qanat oasis fan, wedges radiating from a mother-well outlet on the dry side of town), `basinFields`
  (Egyptian Nile flood-basins, a handful of chaikin-smoothed organic blobs offset from the riverbank),
  `canalFields` (Mesopotamian canal long-lots, perpendicular strips off the river — the same
  perpendicular-offset technique `buildChinampas` already uses on the water side, mirrored onto dry
  land), `terraceFields` (Inca andenes) and `ringFields` (Venus's own concentric ring-farming bands,
  a design choice rather than a historical claim, echoing the Garden City diagram).
- **A real terrain-responsive mechanism, not a decorative arc**: `terraceFields` resamples this
  engine's own `site.height`/`site.slope` fields (already load-bearing for M-TER-1's building-
  suitability score) at every terrace step, so the contour direction genuinely bends with the local
  gradient rather than being drawn as a fixed shape. This is the first farmland pattern in this
  register to be terrain-*aware* rather than terrain-*agnostic*.
- **A genuinely new, testable detail kind**: `kind:'pasture'`, rendered with its own `.pasture` CSS
  (a muted grazing-green, distinct from `.field`'s cultivated gold) rather than a re-tinted copy of
  the same polygon kind — directly answering the "pastures **and** fields" half of the request that
  the first pass at this register had not yet addressed (only fields/orchards existed until this
  point). Present via `pastureShare` (an intermixed per-cell chance — Roman, Celtic, Frontier) or
  `pastureFar` (a chance ramping up with distance from town — Byzantine, Viking — modelling the
  outer pasture/outfield zone each source itself describes as a coarser ring-level distinction, not
  a new parcel shape).
- **A self-caught category error, not applied**: the research turned up a real, well-sourced,
  high-confidence Greek geometric pattern — the colonial chora grid (kleroi), e.g. Chersonesos's
  ~10,000 ha divided into ~400 lots — but that grid was laid out at a **new colony's founding**,
  the exact anachronism M-GRK-1 already excludes, since the Greek profile deliberately models
  organic, centuries-old Athens, never re-planned, specifically because Hippodamian grid-planning
  was a documented innovation for new colonial foundations, not retrofitted onto existing cities
  (§3.6-adjacent reasoning, carried from the original grid-to-organic conversion). Applying a
  colony-founding grid here would reintroduce the very error that conversion corrected. Kept on the
  unchanged baseline strip pattern instead, with an olive-grove orchard-density boost (Attica's
  iconic cash crop) standing in for the geometric signature this profile cannot honestly claim —
  caught during this register's own design phase, before any code was written, not after.
- **Graceful degradation over an empty result**: Mesopotamian's canal long-lots need a real
  watercourse to run perpendicular from; on a landlocked site, `canalFields` falls back to the
  baseline `stripFields` mechanism rather than producing no farmland at all. Egyptian's flood-basins
  and Mayan's wetland-gated raised fields have no such fallback — a landlocked/dry site honestly
  gets none, since there is no flood or wetland for either pattern to represent.
- **Aztec is the one deliberate non-entry**: `buildChinampas` (M-AZT-2) already is that culture's
  farmland signature; a second, generic field layer over a lake-city would double up rather than
  add detail, so `FARM_SPEC.aztec` is `{pattern:'none'}` and `buildFarmland` returns `[]` for it
  immediately.
- **Palimpsest inherits, again**: resolved to Islamic's own `FARM_SPEC` entry (the qanat fan) at
  build time, the same per-profile lookup pattern as its games building/gates/housing (§3.5, §3.7).
- **A real directional bug found and fixed before this shipped**: `fanFields`' first cut located
  "away from the water" using the river polyline's own geometric middle index
  (`site.river[len/2]`) as a stand-in for "the nearby riverbank," reasoning that the vector from
  the market to that sample point, negated, would point inland. This works only when the market
  happens to sit near that one array index; for a market placed farther along the river (this
  engine's own `placeAnchors` allows the market anywhere along a wide arc around the bridge point,
  not just near the river's geometric centre), the sampled point can be nowhere near the actual
  nearest bank, giving a direction that points nowhere near "away from water" — caught by reviewing
  this feature's own test data rather than assumed correct: Islamic and Palimpsest (the only two
  `'fan'`-pattern cultures) produced **zero** fields on ordinary river-site generation, not a subtly
  wrong count, for a market sited 80% of the way across the map while the sampled index corresponded
  to the geometric 50% mark — the resulting origin landed at `x>Wm`, off the map entirely, so every
  candidate failed its own bounds check. Fixed by computing the gradient of `site.riverDist`
  directly at the market's own position (the same finite-difference gradient technique
  `buildChinampas` already uses for its own opposite "into water" direction, just without the final
  negation), plus clamping the computed origin to stay on-map regardless of magnitude as a second,
  independent safety margin. Re-verified across 8 seeds × 2 cultures × 5 site kinds (80
  combinations) with zero recurrences after the fix.
- **A real performance bug found and fixed before this shipped**: the first cut of `gridFields`
  scanned every lattice point in a fixed square span with no bound on how many candidates it
  examined — fine for the large-cell cultures (Roman, Frontier, Colonial, Industrial), but a
  small-cell culture (Mayan's 14-20-unit cells, say) on a large town could put **tens of thousands**
  of candidates inside the scan span, and both `site.isWater` and the `urban` closure (a
  `pointInPoly` check against a potentially many-vertexed wall/bastion ring) cost O(shoreline/ring
  length) per call — found by timing the full headless suite, which is normally a multi-minute run
  on this engine already (river/coastal site generation was already the slow path before this
  feature, confirmed by timing the pre-existing code unchanged) but had clearly regressed further.
  Fixed with a hard budget on *examined* candidates (1200), independent of the pre-existing budget
  on *accepted* ones — bounding the worst case regardless of acceptance rate, without changing
  normal-case output (a typical town still fills its accepted-cell cap comfortably within that
  budget). Found by direct timing measurement across every culture/site combination, not assumed
  fast from the mechanism's own description — the same "generate output and measure it" discipline
  this project holds itself to everywhere else.
- **A real collision bug, and the biggest one, caught by this register's own dedicated audit
  test before this shipped**: every farmland generator (all seven, plus the pre-existing baseline
  `stripFields` this register only extracted, never rewrote) checked candidates against `isWater`
  and `urban`, but never against the live street graph itself. This is not a hypothetical: the
  exterior hinterland a generator scans is not free of streets — primary routes reach well past
  the walled/urban core toward neighbouring settlements (M-REG-1) — so a candidate happily outside
  `urban()` can still land squarely on top of one. The audit added alongside this register (105
  culture/site/seed combinations covering every pattern family) failed on first run: **1281**
  street-crossings and 34 water-overlaps, not a handful of edge cases. Running the identical audit
  against Medieval alone — using the exact `stripFields` logic unchanged from before this register
  existed — still found 63 crossings, confirming this was a latent gap in the pre-existing
  mechanism itself, simply never checked before (fields were invisible until the prior fix, and no
  test had ever looked at field-vs-street collision). Fixed with one shared `crossesStreet(g,poly)`
  helper, reusing the exact spatial-hash `edgesNear()`+`segInt()` technique `buildGames`' own
  `blocked()` already established, called from every generator (`gridFields`, `fanFields`,
  `basinFields`, `terraceFields` and `ringFields` all gained a `g` parameter for this; `stripFields`
  and `canalFields` already had it). The residual 34 water-overlaps traced to two narrower, distinct
  gaps found the same way: `canalFields` checked only its strip's far endpoint for water, missing
  that a curving river (worst on the `riverthrough` site kind) can dip back into a strip's middle
  even when both ends are dry — fixed by adding the same near/mid/far three-point check
  `stripFields` already used for exactly this reason, which itself was still missing a check on its
  *own* near point (`q1`), the last 2 of the 34 — added too. Re-verified: 0 water-overlaps, 0
  street-crossings across the full 105-combination audit after all three fixes landed together.
- **A fourth bug, found only after the browser screenshots were actually looked at**: even with
  every audit at 0/0, a manual visual pass (this project's own stated discipline for anything the
  headless suite can't fully cover) turned up Mesopotamian producing **zero** canal fields on an
  ordinary `riverthrough` generation at the exact seed used for every other screenshot. Direct
  reproduction and instrumentation traced it to `canalFields`' near-bank offset: a fixed 14-unit
  constant, which cleared a plain `river` site's channel (half-width up to 12) but not a
  `riverthrough` channel (half-width up to 15, since through-rivers are generated wider) — so the
  strip's own near point sometimes still sat inside the water, silently rejecting every single
  candidate rather than just some of them (16 water-rejects out of 16 survivors in the traced run).
  Fixed by deriving the offset from `site.riverW` itself (`riverW/2 + 4` clearance) instead of a
  constant untied to the actual channel width. Re-verified across 8 seeds × 2 river-like site kinds
  with zero recurrences, plus a dedicated regression assertion added to the suite (which the prior,
  purely-geometric audit could not have caught on its own, since a poly can be internally
  consistent, non-crossing and non-overlapping while simply never getting generated at all —
  exactly why the visual pass still matters even after every automated check is green).
- **Not hashed, by the same reasoning as `civic`/`markets`/`games`**: `hashModel()` never touches
  `model.details`, so this entire register is structurally incapable of affecting the cross-version
  neutrality every other addition in this project is held to.

### 3.10 Post-launch simplification: culling to two structurally-distinct profiles

After §§3.1–3.9 shipped the full 19-profile roster (17 historical cultures + Venus + Palimpsest),
a review of every profile's actual rendered output — not just its data/prov text — found that most
of the 17 historical, organic-planning cultures produced towns that read as visually near-identical
to the medieval baseline at the level this tool actually draws: same accretive street tangle, same
burgage-style parcel comb, same building massing, differing mainly in prov-text citations and a few
detail-layer flourishes (a games building, a field pattern) that don't register as a distinct *city
shape* at a glance. This is a rendering/visual-distinctiveness finding, not a defect in the
underlying research — every M-* citation these profiles carried remains valid and citable (recovered
from git history if ever needed again) — but it meant shipping 19 selectable cultures that mostly
looked like 2.

**Decision (user-directed):** delete the 17 near-identical profiles entirely — not archive behind a
flag, not de-emphasize, actually remove the data rows, the dedicated functions they alone called,
and the tests/docs sections describing them. Keep exactly two:

- **medieval**, rebranded in its display name to **"Organic Growth (Medieval Western European)"**
  — framing it as the general organic-planning pattern (which is what it always was) rather than one
  culture among 18 near-equivalent others. The internal `id:'medieval'` is unchanged (it remains the
  Phase-1 neutrality anchor and the fallback `resolveProfile()` resolves any unknown/removed culture
  id to), and its own generation behaviour is otherwise untouched, aside from one small addition
  (below).
- **venus** (`planning:'radial'`) — kept because its concentric-ring/radial-spoke growth model is
  *structurally* distinct from organic accretion, not just differently labelled. Softened per direct
  feedback that its perfectly mathematical circles read as too mechanically exact against every
  other profile's noisy, accretive streets (the one artificial-looking thing on the map) — see
  below.

**What was removed** (docs/03's per-culture register sections H–W and Z retain nothing but an
archival pointer; the full text is in git history):

- `CULTURE_PROFILES` entries, `GAMES_SPEC` entries, and `FARM_SPEC` entries for all 17: Roman,
  Islamic, Byzantine, Chinese, Aztec, Viking, Celtic, Greek, Egyptian, Mesopotamian, Mayan, Inca,
  Japanese, Colonial, Frontier, Industrial, Palimpsest.
- Dedicated functions with no other caller once those profiles were gone: `buildGridStreets` (the
  planned-grid street layout §3.2 describes), the whole Palimpsest growth block (`narrowColonnades`,
  `dissolveWardWalls`, `growAlongFixedEdge`, §3.5), `buildChinampas` (Aztec's lake-city gardens),
  `tagFactory` (Industrial's mill anchor), `insulaLots` (Roman's bounding-box parcel method), the
  `domus-insula`/`courtyard-house`/`longhouse`/`roundhouse` building-grammar branches in
  `buildBuildings`, the `castrum`/`bab`/`compass` wall-gate-scheme relabel blocks (plus a
  pre-existing dead `cardinal` block, orphaned even earlier by §3.6's grid→organic conversion), and
  five of the M-FARM register's seven pattern generators (`gridFields`, `fanFields`, `basinFields`,
  `canalFields`, `terraceFields`, §3.9) along with `ellipsePoly`/`stadiumPoly`/`ballcourtPoly`
  (M-GAMES register, §3.7–3.8).
- The `insulaParcels`/`householdMultiplier` population-correction scaffolding (only relevant to
  `domus-insula`-grammar profiles, all gone), 19→2 test blocks in `tests/test_tail.js` and
  `tests/browser_check.js`, and the culture `<select>` dropdown's 17 now-invalid options.
- Data-driven dispatch tables that survive with zero current entries for the removed keys — e.g.
  `FARM_SPEC`'s `pattern` dispatch, `GAMES_SPEC`'s per-culture array, `parcelPattern`'s
  `'strip'`/`'insula'` branch in `buildParcels` — are kept generic rather than hardcoded to exactly
  2 profiles, so a 3rd/4th profile addition is a new table row (and, if its geometry is genuinely
  novel, one new pattern function), not an engine change; this is the same "a new civilization is a
  new table row" principle §1 already established, just proven again in reverse by how cleanly the
  removal came apart along the same seams.

**What changed for the two survivors:**

- **Medieval** gained a `pastureShare`/`pastureFar` on its `FARM_SPEC` entry. Before this pass,
  medieval's own baseline `stripFields` never produced the `pasture` detail kind — only the
  now-removed Byzantine/Viking entries exercised it — so without this addition, a genuinely new
  feature from §3.9 (the `pasture` kind, its own CSS class and legend chip) would have shipped
  unreachable in the final 2-profile app. A modest common-pasture share, more prevalent farther from
  the town, stands in for the open-field system's communally-grazed fallow shift and true
  common/waste land at the village margins — well-attested for medieval England independent of this
  project's own research, not an invented justification for keeping the mechanism alive.
- **Venus**'s `buildRadialStreets` gained a seeded low-frequency wobble: each concentric ring's
  radius is perturbed by a two-term summed sine (±5.5%, phase drifting per ring index the way real
  tree-ring eccentricity does), and both the primary and cross spoke angles get a small jitter
  (±0.045 rad) around their otherwise-even spacing. The spokes themselves stay geometrically
  straight lines (not bent), so the radial skeleton — hub, concentric rings, spokes — is still
  immediately legible; only the perfect-compass look is lost. Verified directly (not just by the
  headless suite passing): ring-tagged street edges on a sample generation show 8–10% peak-to-peak
  radius spread within each nominal ring, consistent with the ±5.5% design amplitude, confirming the
  softening is genuinely active rather than a no-op. `buildWaterway` (the decorative irrigation
  ring, M-VEN-3) was deliberately left un-wobbled — out of scope for a change framed around the
  radial *street* growth mode specifically; revisit if the un-softened waterway starts to look
  inconsistent against the now-organic ring streets it encircles.

**Explicitly deferred, not attempted in this pass (both per direct user instruction):**

- **Successive city walls → ring roads.** ~~The historical mechanic where a growing settlement
  outgrows its wall... explicitly held for a future pass, not designed or implemented here.~~
  **Implemented in a later pass — see §3.11.** Raised during this review, picked up once the user
  explicitly asked for it (tied to settlement age, population growth, and a carrying-capacity
  placeholder ready for a real Cartalith integration).
- **Scale-up to 40–200 settlements.** The user flagged that today's per-building and per-road-segment
  detail model — real for a single settlement — becomes far too complex and expensive to hold for a
  regional view of many settlements at once. No redesign was attempted here; this is a note for
  whenever that scale is actually reached, in the same spirit as this document's own §7 (explicitly
  deferred, not silently dropped). Worth considering when the time comes: a level-of-detail scheme
  where only a focused/selected settlement renders full per-building fidelity while others render as
  a schematic footprint or a handful of aggregate stats; whether `model.details`/`model.buildings`
  need to become lazily-generated rather than always-materialized; and whether the existing
  `hashModel()` neutrality discipline needs a regional-scale equivalent.

### 3.11 Successive wall generations: implementation (picks up the §3.10 deferral)

Picked up on explicit user request, with three requirements: tie it to **settlement age**, tie age
to **population growth** ("age and population growth go hand in hand"), and tie growth to **local
resources/carrying capacity** — using simple placeholder values since Cartalith owns the real
resource/carrying-capacity system, but built **ready for integration** with it. Scope: **organic
(medieval) growth only**, opt-in via a new `wallGenerations` toggle (default off). Venus's radial
branch lays every ring/spoke in one shot with no epoch loop to hang repeatable expansion on, so the
toggle is simply never read there — inert by construction, not by a special-case guard (verified:
`wallGenerations:true`/`false` produce byte-identical `hashModel()` output on Venus).

**What §3.10 flagged as needed, and how each was resolved:**

- *"Multiple wall generations coexisting in the model at once (current `wallState` assumes a single
  active ring)."* Resolved additively: `model.wall` (`wallState`) keeps its exact pre-existing
  meaning — the active/current/outermost wall — so all 5 of its non-`grow` consumers
  (`applyStarFort`, `clearFortZone`, `assignDistricts`, `buildFarmland`, `buildGames`) needed zero
  changes; they already only ever run after the epoch loop finishes, so they only ever see whatever
  `wallState` holds at that point, which is still "the wall" by construction. History is purely
  additive: `wallState.history` (array of prior generations, each snapshotting the same shape
  `wallState` itself has) and `wallState.generation` (1-based counter of the active generation).
- *"The demolition-to-road conversion needing new render/data handling (a wall segment becoming a
  street-class edge is not something any existing mechanism does)."* Resolved with a genuinely new
  edge class, `ringroad`, rather than reusing `street` — it gets its own CSS fill colour, its own
  slot in the road-class draw order/label lookup, and (at 7.5m) a width matching/exceeding a
  primary road, since real ring boulevards built on demolished fortifications (Vienna's
  Ringstrasse, Paris's Grands Boulevards on the Fermiers-Généraux wall) were characteristically
  wide. The road itself is laid through the exact same `addPolylineStreet`/`addStreet` primitive
  every other street in this engine already uses, so it snaps into the existing network with no new
  graph machinery.
- *"Interaction with the existing gate-placement and field-of-fire-clearing logic for whichever
  wall generation is currently 'active.'"* Turned out to need **no special-casing at all**, verified
  rather than assumed: a new (superseding) wall's hull is always computed from the current,
  larger built-mass extent and re-inflated with `buildWall`'s own existing growth-reserve
  logic, so it geometrically contains the ring road it just superseded. `clearFortZone`'s clear
  band is defined as *outside* the active ring (`!pointInPoly(p,ring) && distToLine(...)`), so an
  interior ring road is never in it; `removeWaterCrossings` (which already generically removes any
  non-primary/non-quay edge with ≥2-of-9 sampled points in water) cleanly trims the rare case where
  a spans-water generation's old water-gate crossing has no bridge, with no new logic. Confirmed by
  a dedicated safety audit (same `pointInPoly`/`segInt` technique the file's other standing audits
  use): across a 5-seed × 4-site sweep, ring-road edges never genuinely sit in water and never cross
  the active wall away from a gate.

**Trigger, mechanically:** the first circuit still rises at the same fixed epoch M-GRW-2 always
used (`max(3, floor(epochs·0.6))`). From then on, each epoch compares a shared
`builtMassHull(site,anchors,g)` helper's area (extracted from `buildWall`'s own hull-of-built-nodes
computation — a pure refactor, `buildWall`'s own output is byte-identical before/after) against the
active wall's enclosed area; crossing `rules.settlement.wallGenerationThreshold` (default 0.8, per
M-GRW-2's own "≥~80%") supersedes the wall, up to `rules.settlement.maxWallGenerations` (default 3,
per M-GRW-2's "1–3 typical"). Self-limiting with no extra cooldown: a freshly-built wall's own
growth-reserve inflation keeps the ratio well under threshold immediately after every supersession.
Swept across an 11-seed × 4-epoch-count × 4-population-level grid while validating this: every
combination reached the generation cap, so this is a robust mechanism across this engine's normal
parameter range, not a lucky seed.

**Age ↔ population ↔ carrying capacity:** rather than touching the final population formula
(`pop = built-parcels × 5.2`, left untouched so existing realized-population tolerances hold), the
existing frontier-radius ramp inside `grow()` — `maxR = maxRF·(0.38+0.62·ep/epochs)`, linear — is
replaced (toggle-on only) by `maxR = maxRF·ccFactor·(0.38+0.62·logisticRamp(ep/epochs))`: the same
floor/ceiling, but age maps through a normalized logistic curve instead of a straight line (slow
while young, faster once established, tapering as it matures), and the whole ramp is scaled by
`ccFactor`, a placeholder carrying-capacity multiplier. Verified live: zeroing
`rules.settlement.carryingCapacityWeight` (which pins `ccFactor` to 1, isolating the ramp-shape
change alone) measurably changes realized population vs. the full-weight default on the same
seed/site — the mechanism visibly does something, not just documented intent.

**Cartalith integration contract.** The entire carrying-capacity hook is one pure function:

```js
// current PoC body — samples this engine's own M-TER-1 terrainSuitability() in a ring around
// the market and averages it into one factor
function estimateCarryingCapacity(site, anchors, maxRF) { /* -> a single number in ~[0.3, 1.0] */ }
```

Signature and contract to preserve on a real port: `(site, anchors, maxRF) -> a single number in
roughly [0.3, 1.0]` (never a hard 0 — a site this engine already generated a market on is buildable
by construction). There is exactly **one call site** (inside `grow()`, computed once per
generation, not per-epoch), and every downstream consumer — the frontier-radius ramp, and by
extension the wall-generation trigger that reads the same realized extent — already treats the
result as "whatever this returns." A real Cartalith port replacing the sampled-terrain-suitability
body with an actual resource/carrying-capacity query is the **entire** integration; no other file,
call site, or downstream mechanic needs to change.

**New tunables** (`DEFAULT_RULES.settlement`, a 4th top-level rules group — `resolveRules`/
`cloneRules` needed zero changes, since they already iterate `Object.keys` generically):
`wallGenerationThreshold` (0.8), `maxWallGenerations` (3), `carryingCapacityWeight` (1.0, `0` fully
disables the placeholder's effect). All three are also wired into the Generation Rules UI panel
(`RULE_PARAM_SPECS`) the same way every other tunable already is.

## 4. Roman planned-colony morphology — archived (was: quantified M-ROM register)

This section quantified the Roman profile's grid layout, insula dimensions, forum siting, castrum
gate scheme, and orientation signature. The Roman profile itself was removed in the post-launch
simplification pass (§3.10); the full quantified table is recoverable from git history if a future
grid-planned profile addition wants to reuse it. `docs/03-mathematical-assumptions.md`'s own M-ROM
section carries the same archival pointer.

## 5. Environment-first pipeline (audit against the requested order)

Requested: `Environment → Settlement Site → Transportation → Economic Nodes → Urban Growth →
Architecture → Rendering`. The existing `generate()` is audited against this order:

| Requested stage | Existing call(s) | Verdict |
|---|---|---|
| Environment | `buildSite` | Already first. ✓ |
| Settlement Site | `placeAnchors` | Already second — anchor placement is site-conditioned. ✓ |
| Transportation | `buildPrimaries`, `grow` (streets) | Already precedes buildings. Venus's `planning:'radial'` branches to `buildRadialStreets` in the same slot; a since-removed planned-grid profile once branched to `buildGridStreets` here, per §3.10. ✓ (profile-branched, not reordered) |
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
