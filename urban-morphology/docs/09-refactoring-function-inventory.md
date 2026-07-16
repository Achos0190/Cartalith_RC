# Refactoring inventory — every Urban Morphology function, and its Cartalith Gen1 disposition

**Purpose:** `docs/06-cartalith-integration-map.md` already answered *"is the information there?"*
(yes) and sketched the high-level architecture (`placeContext` adapter → `cityGen()` → a new
view). This document answers the next-level question: **for every function this project has
written, what happens to it on the day someone actually ports Urban Morphology into the Cartalith
Gen1 line** — reuse unchanged, rename, adapt, or discard because Gen1 already has it. Preparatory
only, per the project charter: **no Cartalith Gen1 file is touched by this document or by writing
it** — it is read-only reconnaissance against the current `Cartalith Gen1 v0.85.html` to keep the
plan grounded in the real file rather than in a stale mental model.

Scope: every one of the **115 top-level functions** in `Urban Morphology v0.1.html`'s two
`<script>` blocks (engine, lines 246-3171; app-shell, lines 3178-3917), organized by subsystem,
each with a one-line purpose and a **disposition** verdict. Cross-referenced against `docs/03`
(mechanism citations), `docs/07` (architecture), and `docs/08` (terrain-suitability field mapping,
the one piece of this project already written with Gen1's real field names in mind).

---

## 1. The one architectural fact that shapes everything below

**Cartalith Gen1 has no settlement-layout generator today.** Its civ layer (script block 2)
represents a settlement as a `place` record — `{name, x, y, kind, pop, faction, specialisation,
traits[], economicImportance, tradeVolume}` — a single point on the world map with metadata, per
`docs/06` §1.1. `CIV_SETTLEMENT_CLASSES` ranks it (hamlet…capital); `civWays` connects it to
neighbours at world scale. There is no street graph, no parcel, no building, anywhere in Gen1.

This means the port is **additive, not a replacement**: nothing in Gen1 currently does what
`buildParcels`/`buildBuildings`/`buildWall` do, so there is no existing Gen1 function these
compete with or need to reconcile against — they are new capability, not a rewrite of old
capability. The integration risk is entirely in the few places the two projects' *names* or
*concepts* collide (§2) and in threading a `placeContext` (docs/06 §4) through in place of Urban
Morphology's synthetic inputs — not in geometry or growth logic, essentially all of which is
self-contained and portable as-is.

## 2. Verified naming/concept collisions (checked directly against `Cartalith Gen1 v0.85.html`)

Confirmed by grepping the actual v0.85 file rather than assumed from memory:

| Urban Morphology name | Gen1 v0.85 has… | Verdict |
|---|---|---|
| `generate(seed,opts)` — the **city** generator entry point | `async function generate()` at line 2397 — the **world** (terrain/climate/erosion) generator entry point | **Real collision, must rename on port.** `docs/06` §4 already anticipated this, proposing `cityGen(placeContext)` — adopt that name (or `generateCity`), never bare `generate`. |
| `render()` — full SVG redraw of the city model | `function render(){scheduleRender();}` at line 6400 — the world-map redraw scheduler | **Real collision, must rename.** `renderCityView()` or similar; Gen1's own `render` is a thin trampoline into its own `scheduleRender`, so this is a true same-scope clash, not a coincidence across unrelated modules. |
| `mulberry32(a)` — the PRNG | `function mulberry32(a){...}` at line 1603, **verified byte-equivalent algorithm** (same magic constants `0x6D2B79F5`, `Math.imul` shifts; only whitespace differs) | **Not a conflict — reuse Gen1's own.** Drop Urban Morphology's copy entirely on port; the two were independently implementing the same public-domain algorithm. |
| `fnv1a(str)` + `stream(seed,label)` — the **labeled-substream** RNG (a named, independent sub-stream per pipeline stage, so touching one stage's randomness never perturbs another's output) | No equivalent. Gen1's own `hash(x,y,s)` (line 1604) is a **2D coordinate+seed** spatial hash for noise sampling (`vnoise`/`pvnoise`) — a different purpose (terrain noise, not stage-isolated determinism) | **Genuine, non-conflicting addition.** Port `fnv1a`/`stream` as-is; this is exactly the mechanism a `cityGen()` needs to keep e.g. `stream(seed,'games')` independent of `stream(seed,'anchors')`, which nothing in Gen1 currently provides. |
| `CULTURE_PROFILES` / "tradition" concept | **Does not exist.** `faction` in Gen1 is name + auto-colour only (`docs/06` §3.2, re-confirmed here: no `tradition` string anywhere in v0.85) | Confirms `docs/06`'s gap #2 is still open. The `traditionOf(place.faction)` mapping function docs/06 sketches does not exist yet on the Gen1 side; **this project's 19 `CULTURE_PROFILES` entries are the entire supply side of that mapping, ready to port unchanged.** |
| `V` (vector helpers), `polyArea`, `segInt`, `pointInPoly`, `distPtSeg`, `stadiumPoly`, `select`, `el`, `pd`, `pl`, `reg`, `applyVB`, `fitView`, `setupCamera`, `grow`, `regen` | No top-level collision found for any of these (checked directly) | Free to port under their current names, though several (`el`/`pd`/`pl`/`reg`/`select`) are generic enough to be worth namespacing (`cityEl`/`cityPd`/…) purely for readability in a 15k-line host file, not because of an actual clash. |

## 3. Complete function inventory

Disposition key — **REUSE**: port unchanged, no Gen1-side dependency; **RENAME**: port unchanged
except the identifier, to clear §2's collision; **ADAPT**: logic stays, but an input/output needs
to change shape to receive Gen1 data (`placeContext` etc.); **GEN1-HAS-IT**: do not port, point at
Gen1's own equivalent instead; **UI-REWIRE**: app-shell/DOM function whose *logic* has no Gen1
counterpart but whose *wiring* (element IDs, event listeners) has to be rebuilt against Gen1's own
panel/editor DOM rather than copied verbatim.

### 3.1 Determinism & geometry primitives (engine, culture-independent core)

| Function | Purpose | Disposition |
|---|---|---|
| `fnv1a` | string → 32-bit hash, seeds `stream()`'s sub-streams | REUSE |
| `mulberry32` | PRNG | GEN1-HAS-IT (byte-equivalent, §2) |
| `stream(seed,label)` | labeled independent RNG sub-stream (`.u/.range/.int/.pick/.norm/.logn/.chance`) | REUSE — no Gen1 equivalent |
| `V` (`add/sub/mul/len/dist/norm/dot/cross/lerp/rot90`) | 2D vector algebra | REUSE |
| `polyArea`, `polyCentroid` | shoelace area/centroid | REUSE |
| `pointInPoly` | ray-cast containment | REUSE |
| `segInt` | segment-segment intersection (the single primitive the whole "impossible intersection" audit discipline is built on) | REUSE |
| `distPtSeg` | point-to-segment distance | REUSE |
| `polySelfIntersects` | self-intersection check | REUSE |
| `chaikin` | corner-cutting curve smoothing | REUSE |
| `simplify` | Douglas-Peucker line simplification | REUSE |
| `ensureCCW` | winding-order normalization | REUSE |
| `insetPoly` | per-edge inward offset with miter joins | REUSE |
| `clipConvex` | Sutherland-Hodgman polygon clip | REUSE |

### 3.2 Planar street graph (core)

| Function | Purpose | Disposition |
|---|---|---|
| `makeGraph`, `gKey`, `gridCellsForSeg`, `indexEdge`, `unindexEdge`, `edgesNear` | spatial-hash-indexed graph + neighbor query (what every collision check in this project, including the new games-building placement, is built on) | REUSE |
| `addNode`, `nearestNode`, `rawEdge`, `splitEdge`, `attachPoint` | low-level graph mutation primitives | REUSE |
| `addStreet`, `addPolylineStreet` | the split-at-crossing planarity invariant — the single choke point that keeps the graph a proper planar subdivision no matter which growth model feeds it | REUSE — **this is the most important function to port intact**; grid/organic/radial/palimpsest all funnel through it |
| `extractFaces` | DCEL-style face extraction → blocks | REUSE |
| `edgeBetween` | edge lookup by endpoint pair | REUSE |
| `astar` | grid-based least-cost pathfinding (`buildPrimaries`' route engine) | REUSE |
| `ringCrossings`, `convexHull`, `densifyLoop`, `nearestIdx`, `polylineCrossings`, `cornerCut` | wall-ring geometry helpers (Naarden-trace construction) | REUSE |
| `_killEdge`, `pruneLargest`, `removeWaterCrossings` | graph cleanup (dead-edge removal, largest-connected-component pruning, water-crossing stub removal) | REUSE |

### 3.3 Site / environment

| Function | Purpose | Disposition |
|---|---|---|
| `buildSite` | **synthetic** site model (river/bay/coast/landlocked procedurally faked) | **ADAPT → replaced**, not ported. `docs/06` §3.1 already specs its Gen1 replacement, `siteFromTerrain(place, EF)`, reading `field`/`riverMask`/`flowField` instead of faking them. Every consumer downstream (`assignDistricts`, `buildBuildings`, …) reads the same `site.{kind,isWater,riverDist,slope,Wm,Hm,…}` shape either way — **only this one function's internals change**, confirmed by re-reading its full call signature here rather than assumed from docs/06's earlier summary. |
| `terrainSuitability(site,p)` | `[0,1]` slope×flood score (M-TER-1) | ADAPT — same formula, fed Gen1's real `flowField`/slope proxy per `docs/08` §3-4 instead of the synthetic site's analytic `height()`/`riverDist()`; `docs/08` already maps every field name needed |
| `townBank(site,anchors)` | shoreline point sampling along the built town (feeds chinampas, wall alignment) | REUSE once `site` is real |
| `distToLine` | point-to-polyline distance (harbour quay siting) | REUSE |

### 3.4 Culture profile system

| Function / data | Purpose | Disposition |
|---|---|---|
| `CULTURE_PROFILES` (19 entries) | the entire data-driven tradition registry: `planning`/`parcelPattern`/`buildingGrammar`/`defaultFaith`/`defaultCivic`/`markets`/`wallGates`/`orientation`/`civicAnchorLabel` + per-profile flags (`noWalls`, `chinampas`, `factory`, `householdMultiplier` where still used, `defaultWalls`) | REUSE unchanged — this **is** the `traditionOf(place.faction)` mapping's supply side docs/06 §3.2 asked for; Gen1-side work is only the *lookup* (faction → one of these 19 keys), not the profiles themselves |
| `resolveProfile(id)` | `CULTURE_PROFILES[id]\|\|.medieval` fallback | REUSE |
| `GAMES_SPEC` (18 keys: 16 non-empty + 2 empty — mesopotamian, venus; palimpsest has no entry of its own, inherited via a `profile.id==='palimpsest'` special-case lookup into `GAMES_SPEC.islamic` instead) | signature-games-building registry (kind/shape/siting/size/pop-gate/prov per culture) | REUSE unchanged |

### 3.5 Generation Rules (configurable parameters, docs/07 §3.4)

| Function | Purpose | Disposition |
|---|---|---|
| `DEFAULT_RULES` | ~17 externalized street/parcel-growth constants, grouped `street`/`parcels`/`palimpsest`/`meta` | REUSE |
| `cloneRules`, `resolveRules` | deep-clone / partial-merge against defaults | REUSE |
| `applyWildness`, `applyPlotChaos` | meta-slider → underlying-field derivation | REUSE |

### 3.6 Anchors, streets, growth

| Function | Purpose | Disposition |
|---|---|---|
| `placeAnchors` | sites the market anchor (flat, dry, above flood band, near the bridge/quay) | ADAPT — once `site` is real terrain, the scoring inputs (`slope`, `riverDist`) come from `siteFromTerrain`'s outputs instead of the synthetic analytic functions; logic unchanged |
| `buildPrimaries` | least-cost route engine (Tobler-slope-weighted `astar` grid) siting the primary street skeleton | ADAPT — **also** where `docs/06` §2's "primary-route endpoints from `civWays` links" plugs in, replacing the PoC's synthetic map-edge endpoints with real neighbour-settlement directions |
| `buildGridStreets` | one-act planned grid (Roman, and the Palimpsest founding act) | REUSE |
| `buildRadialStreets` | Venus's concentric-ring + radial-spoke growth | REUSE |
| `buildWaterway` | Venus's circular irrigation canal | REUSE |
| `buildPlaza` | market-square carving (widens the nearest primary edge) — **note for the games-building port**: the plaza polygon is not fully clear ground (docs/07 §3.8 finding: the original through-street still runs through it); anything sited off `plaza.poly` on the Gen1 side needs the same real-parcel check `buildGames`'s plaza-siting mode added, not just an edge-offset | REUSE (with that caveat carried forward) |
| `buildHarbour` | quay/piers/mole, harbour defence | ADAPT — `docs/06` §2 already notes `traits.port` + real terrain at `(x,y)` selects harbour presence/sub-type |
| `addRiverBridges` | bridge placement on a river-through site | REUSE |
| `grow` | the organic epoch-loop (densification + exploration, M-GRW-1) — the single largest function in the engine | REUSE |

### 3.7 Fortification

| Function | Purpose | Disposition |
|---|---|---|
| `buildWall` | curtain wall, gates, harbour integration | ADAPT — `docs/06` §3.3 flags the era signal (`civYear`) this needs, which doesn't exist as a wired input yet |
| `applyStarFort` | Naarden-trace bastioned enceinte | ADAPT — same era-signal dependency, plus `traits.fortified` gating already sketched in docs/06 §2 |
| `clearFortZone` | field-of-fire clearing (removes overlapping buildings/parcels/streets/clutter) | REUSE |

### 3.8 Palimpsest-specific encroachment (docs/03 M-PAL register)

| Function | Purpose | Disposition |
|---|---|---|
| `privatizeAlleys` | Islamic-family cul-de-sac encroachment (M-ISL-2) | REUSE |
| `lanePass` | oversized-block interior-lane subdivision, reused at a lower area floor for Palimpsest's burgage cycle (M-PAL-4) | REUSE |
| `narrowColonnades` | colonnaded-avenue-to-souk width narrowing (M-PAL-1) | REUSE |
| `dissolveWardWalls` | ward-wall dissolution, verified per-building (M-PAL-2) | REUSE |
| `growAlongFixedEdge` | post-disaster streets tracking a surviving fixed edge (M-PAL-3) | REUSE |

### 3.9 Blocks & parcels

| Function | Purpose | Disposition |
|---|---|---|
| `buildBlocks` | face-extraction → block polygons keyed to the plaza | REUSE |
| `insulaLots` | axis-aligned-bounding-box lot subdivision (`parcelPattern:'insula'`) — **documented as unsafe on non-rectangular blocks** (docs/07 §3.6); only Roman still uses it | REUSE, with that documented caveat still binding on the Gen1 side too |
| `buildParcels` | the per-profile parcel-pattern dispatcher (strip vs insula) + the population formula's `insulaParcels`/`householdMult` correction logic | REUSE — the two population bugs this project already found and fixed (docs/07 §3.6) are exactly the kind of thing to re-verify empirically again after the port, not assume still holds |
| `assignDistricts` | district classification (market/burgher/artisan/craftriver/harbour/suburb/agrarian) + `terrainSuitability` scoring | ADAPT (see §3.3 — same site-model swap, same consumers) |
| `bmap`, `rectPoly` | bilinear-patch parcel-quad helpers | REUSE |

### 3.10 Buildings

| Function | Purpose | Disposition |
|---|---|---|
| `buildBuildings` | the building-grammar dispatcher (burgage/domus-insula/courtyard-house/longhouse/roundhouse/venus-mixed) + the opt-in `terrainAware` gate | ADAPT — same site-model dependency as §3.3/3.9 |
| `_rectPts`, `_peristyle` | rectangle-corner and colonnade-column helpers for the domus/courtyard grammars | REUSE |

### 3.11 Civic, economic, religious buildings

| Function | Purpose | Disposition |
|---|---|---|
| `buildMarkets` | rank-scaled specialised market squares (M-AMEN-1) | ADAPT — `docs/06` §2 already notes `economicImportance`/`tradeVolume` as optional scaling multipliers |
| `buildCivic` | civic-hall style dispatcher (basilica/loggia/keep/dome/townhall/guildhall), the plaza-edge-attachment technique every later addition (games buildings) modelled itself on | REUSE |
| `buildFaithSites` | worship-rite dispatcher (church/temple/mosque/shrine/orthodox/none) | ADAPT — `docs/06` §2 notes `traits.religious`/`kind==='monastery'` as the extra-churches/cathedral driver |

### 3.12 Signature games/spectacle buildings (docs/03 M-GAMES, docs/07 §3.7-3.8 — the newest subsystem)

| Function | Purpose | Disposition |
|---|---|---|
| `ellipsePoly`, `orientedRect`, `stadiumPoly`, `ballcourtPoly` | the four reused shape primitives | REUSE |
| `gamesShapeAt` | shape dispatcher keyed on `spec.shape` | REUSE |
| `buildGames` | population-gated per-culture monument, plaza-adjacent or peripheral siting per `GAMES_SPEC` | REUSE — already parcel-safety-checked for the plaza-siting mode (docs/07 §3.8), the newest and most rigorously collision-tested function in the register |

### 3.13 Culture-specific detail layers

| Function | Purpose | Disposition |
|---|---|---|
| `buildChinampas` | Aztec raised-bed garden strips reclaimed from the shore | REUSE |
| `tagFactory` | Industrial mill-anchor re-tagging (reuses an already-placed building, never new geometry) | REUSE |
| `applyDecay` | the `ruined` toggle's decay pass (docs/03 M-PA) — profile-agnostic by design | REUSE |
| `buildDetails` | trees/wells/crosses/fences/bollards + the per-profile orchard-density/provenance boost (`gardenBoost`, docs/03 M-FARM register) — no longer contains the strip-field mechanism itself, which task #66 extracted into `stripFields` below | REUSE |
| `FARM_SPEC` (18 keys: 17 with a pattern + Aztec's `{pattern:'none'}`; Palimpsest has no entry of its own, inherited via the same `profile.id==='palimpsest'` special-case lookup pattern `GAMES_SPEC` already established, resolving to `FARM_SPEC.islamic`) | per-culture farmland/pasture registry (docs/03 M-FARM register, docs/07 §3.9) — task #66, landed after this document's first draft | REUSE unchanged |
| `crossesStreet` | shared street-crossing guard (spatial-hash `edgesNear()`+`segInt()`, the same technique `buildGames`' own `blocked()` already established) called from all seven farmland generators below — added after this register's own audit caught 1281 real crossings on first run, including 63 in the pre-existing `stripFields` mechanism alone | REUSE unchanged |
| `stripFields` / `gridFields` / `fanFields` / `basinFields` / `canalFields` / `terraceFields` / `ringFields` | the seven farmland shape-family generators `buildFarmland` dispatches across via `FARM_SPEC.pattern` — `gridFields` alone serves four big-regular and four small-irregular cultures via cell-size/jitter/alignment parameters rather than eight near-duplicate functions; `terraceFields` is the one pattern that queries `site.height`/`site.slope` directly (real terrain-following geometry, not a decorative shape) | REUSE unchanged — `terraceFields`' direct `site.height`/`site.slope` calls are exactly the shape `siteFromTerrain`'s replacement fields need to support (docs/06 §3.1), a live consumer of that interface beyond `terrainSuitability` |
| `buildFarmland` | per-profile farmland dispatcher (mirrors `buildGames`'s `GAMES_SPEC` lookup pattern exactly): resolves `FARM_SPEC`, computes a dominant-street-axis `dirHint` for non-cardinal grid alignments (a length-weighted circular mean over live primary edges), calls the matching generator | REUSE unchanged |

### 3.14 Metrics, generation entry point, export

| Function | Purpose | Disposition |
|---|---|---|
| `computeMetrics` | morphometric validation bands (deg3/deg4 share, meshedness, median frontage, …) | REUSE — becomes the city module's own regression suite, exactly as `docs/06` §4 anticipates ("the PoC's 194-assertion headless suite… become the city module's suite" — a direct quote from docs/06 as originally written; the suite has since grown to **1233 assertions**, docs/06's own count simply predates most of this project's later work) |
| `generate(seed,opts)` | **the pipeline orchestrator** — every function above, called in the fixed order documented in `docs/07` | **RENAME** to `cityGen(placeContext)` (§2) + **ADAPT** its opts object to unpack a `placeContext` (docs/06 §4) instead of raw `{seed,pop,epochs,walls,fortified,site,harbourDefence,faith,civicStyle,culture,rules,terrainAware,ruined}` |
| `hashModel(m)` | selective FNV hash over graph/blocks/parcels/buildings (civic/markets/games/details deliberately excluded — confirmed throughout docs/03's M-GAMES register write-up) — the cross-version neutrality mechanism | REUSE — becomes the city module's own determinism-regression tool, independent of whatever hashing (if any) Gen1's own EF pipeline uses for its `g-toggle round-trip` invariant |

### 3.15 App-shell: rendering, interaction, camera (DOM-dependent, not portable as-is)

| Function | Purpose | Disposition |
|---|---|---|
| `el`, `pd`, `pl` | SVG element/path-string builders | REUSE (trivial, no Gen1 dependency) |
| `reg` | inspector/evidence-ledger registration (the mechanism the whole "Evidence Ledger" UI panel is built on) | UI-REWIRE — the *concept* (auto-collect every `M-*` id referenced by a rendered object's `prov` string) is worth keeping, but the panel DOM it populates has to be rebuilt inside Gen1's own place-editor UI, not copied wholesale |
| `render` | full SVG redraw from `model` | **RENAME** (§2) + UI-REWIRE into whatever "City view" panel Gen1 grows |
| `polyAreaApp`, `distPtSegApp` | app-shell-local duplicates of `polyArea`/`distPtSeg` (the render layer avoids depending on the extractable engine block) | REUSE, or simply drop the duplication once engine and app-shell are no longer split for `tests/run.sh`'s extraction purposes |
| `roadChains` | groups road edges into continuous polylines for solid (non-segmented) rendering | REUSE |
| `attachInteraction`, `select` | click-to-inspect wiring | UI-REWIRE |
| `renderMetrics`, `renderLedger`, `renderLegend` | side-panel renderers (morphometrics, evidence ledger, map legend) | UI-REWIRE |

### 3.16 Generation Rules UI (docs/07 §3.4's panel)

| Function | Purpose | Disposition |
|---|---|---|
| `loadSavedRulesProfiles`, `saveSavedRulesProfiles` | `localStorage`-backed named rule-profile persistence | UI-REWIRE — Gen1 likely wants project-ZIP persistence instead of a separate `localStorage` key, the same `_alExportEntries`/`_alImportProject` pattern `docs/06` §3.4 already proposes for a cached city plan |
| `populateRulesProfileSelect`, `refreshRuleSliders`, `buildRulesDetailHTML`, `wireRuleSliders`, `renderRulesCompare` | slider panel CRUD + live comparison table | UI-REWIRE |
| `debouncedRegen` | 150ms-debounced regeneration trigger | REUSE (trivial) |

### 3.17 Camera & top-level wiring

| Function | Purpose | Disposition |
|---|---|---|
| `applyVB`, `fitView`, `setupCamera` | SVG viewBox pan/zoom | UI-REWIRE — Gen1 already has its own world-map camera; a city view needs its own equivalent, likely modelled on this one rather than sharing Gen1's world-scale camera state |
| `regen` | reads every form control, calls `generate()`/`cityGen()`, updates status text + `window.__UM_MODEL` (the headless-driver hook) | **RENAME + ADAPT** — becomes whatever wires the place-editor's "generate this city" button (docs/06 §4) to `cityGen(placeContext)` |

---

## 4. What this inventory changes about docs/06's picture

Nothing in §1-2 of `docs/06` needed correction — the parameter mapping and gap list both held up
against a direct re-read of `Cartalith Gen1 v0.85.html`. What this document adds:

1. **Two real naming collisions** (`generate`, `render`) that docs/06's architecture sketch implied
   but didn't spell out — now confirmed by direct grep, not assumption, with a specific rename
   recommendation for each.
2. **One free win**: `mulberry32` needs no porting at all — Gen1 already carries a byte-equivalent
   PRNG, so the eventual `cityGen()` can call Gen1's own copy rather than shipping a second one.
3. **Confirmation that the overwhelming majority of the ~123 functions are REUSE-as-is** — of the
   full inventory, only `buildSite` is a true replacement (swapped for `siteFromTerrain`), a
   double-digit handful are ADAPT (site-model consumers, era/faction/economy hooks docs/06 already
   flagged), and the rest of the non-app-shell functions port with zero logic changes. The
   "refactor is mostly wiring, not new data modelling" claim docs/06 opened with (§0) is, on this
   closer read, if anything an *understatement* of how much survives unchanged.
4. **The app-shell (§3.15-3.17, ~35 functions) is the one section that is genuinely NOT a port** —
   it's a rebuild against Gen1's own DOM/panel conventions, using Urban Morphology's app-shell only
   as a reference implementation of *what* each piece needs to do, not code to copy in.

## 5. Suggested migration phasing

Ordered so each phase has something independently testable before the next begins, the same
incremental discipline this project has held itself to throughout:

1. **Extract + rename.** Pull the engine block out verbatim (as `tests/run.sh` already does for
   headless testing), apply the two renames from §2 (`generate`→`cityGen`, `render`→
   `renderCityView`), drop the redundant `mulberry32`. Verify: the existing 1199-assertion suite
   still passes unchanged against the renamed file — a pure mechanical refactor, zero behavior
   change, should be provable by diffing `hashModel()` output before/after.
2. **Swap the site model.** Implement `siteFromTerrain(place, EF)` per docs/06 §3.1 /
   `docs/08-terrain-building-suitability.md`'s field mapping; point `placeAnchors`/
   `buildPrimaries`/`assignDistricts`/`buildBuildings`/`terrainSuitability` at it instead of the
   synthetic `buildSite`. Verify: generate the same seed against both a synthetic site and a real
   terrain crop chosen to resemble it (same river/coast/relief profile) and confirm the
   morphometric bands (`computeMetrics`) stay within the same acceptance ranges — this project's
   own validation-band discipline, reapplied one level up.
3. **Wire the `placeContext` adapter.** `pop`/`kind`/`traits`/`specialisation`/`faction` → the
   existing generator inputs, per the docs/06 §2 table verbatim. No new logic — every field this
   step needs already has a named home in `CULTURE_PROFILES`/`GAMES_SPEC`/the opts object.
4. **`traditionOf(place.faction)`.** The one genuinely new piece of *Gen1-side* logic this
   whole port needs — a mapping from faction to one of the 19 `CULTURE_PROFILES` keys. Everything
   downstream of that lookup already exists.
5. **Era signal + UI rewire.** The `civYear`-dependent wall/fort gating (docs/06 §3.3), then the
   app-shell's real rebuild (§3.15-3.17 above) — left last because it depends on nothing upstream
   being unstable, and because it's the only phase with no existing Urban Morphology test coverage
   to lean on (headless tests don't touch DOM), so it should get its own dedicated Playwright pass
   once Gen1-side, the same discipline `tests/browser_check.js` already applies here.

## 6. Open questions for whoever executes the port (not answered here — flagged, not guessed)

- **Lazy generation + caching** (docs/06 §3.4) — generate on zoom-in and cache per `place`, or
  precompute for every settlement at world-gen time? Affects whether `cityGen()` needs to be
  fast enough to run synchronously in the UI thread at the population sizes this project has
  tested (up to 16,000) — not measured against Gen1's actual performance budget here.
- **Where the fourth script block actually lives** — a genuine new block 4, or a lazy-loaded
  module fetched only when a settlement is opened? Docs/06 §4 floats both; this document doesn't
  pick one, since it's a Gen1-side packaging decision this project has no visibility into.
- **Task #66 (per-culture farmland) has since landed** — `FARM_SPEC`/`buildFarmland` and the seven
  shape-family generators are now in §3.13 above, all REUSE unchanged; this bullet is kept only as
  a record that the disposition above was re-checked against the actual shipped code, not assumed
  from this document's own first draft.
- **A real timing characteristic, found incidentally while shipping task #66, worth carrying into
  the "is `cityGen()` fast enough to run synchronously" question above**: this PoC's own synthetic
  `buildSite` makes `isWater`/`riverDist` an O(shoreline-length) linear scan, and river/bay/coast
  site generation was measured (before any task #66 code ran) at roughly 4-6x a landlocked site's
  wall-clock cost at the same population. Whether this carries over to Gen1's real terrain fields
  is genuinely unknown — `siteFromTerrain` (docs/06 §3.1) replaces this synthetic site with a real
  raster lookup, a different cost profile entirely — so this is a data point about the PoC's own
  current bottleneck, not a claim about the ported system, flagged rather than left undiscovered.
