# Procedural Urban Morphology Generator

Research-driven proof of concept: can historical urban morphology **emerge from constrained
procedural growth** rather than template placement? Founding charter: [`CHARTER.md`](CHARTER.md).

**This project is intentionally isolated from Cartalith.** No code, data, or invariants are
shared in either direction; only development *conventions* (single-file HTML, headless test
harness, keyed assumption register) are reused.

## Status

**Phase 0 complete (research) + working proof of concept (Phases 1–4) + Phase 1 of the
post-PoC expansion: a Core Engine / Culture Profile architecture split, all in v0.1 — since
simplified from 19 to 2 culture profiles after a rendering-distinctiveness review (docs/07 §3.10).**

| Artifact | File |
|---|---|
| **The app** — open in any browser via `file://` | [`Urban Morphology v0.1.html`](Urban%20Morphology%20v0.1.html) |
| Headless suite (determinism, road validity, topology, statistical bands, culture profiles) | `tests/run.sh` (801 assertions) |
| Browser driver (screenshots + inspector click-tests, incl. both surviving profiles) | `tests/browser_check.js` |

**Research (`docs/`):** `01-literature-review.md` · `02-algorithm-survey.md` ·
`03-mathematical-assumptions.md` (keyed `M-*` register, incl. `M-ROM-*`) ·
`04-architecture-proposal.md` ·
**`05-settlement-evolution-and-function.md`** — functional geography: how
harbours/centres/markets/administration/quarters/industry are *sited*, and in what order
amenities switch on as population and connectivity grow ·
**`06-cartalith-integration-map.md`** — maps the Cartalith Gen1 civ-layer settlement
parameters (kind/pop/traits/specialisation/faction/civWays) onto this generator's inputs, with
the gaps to close for a future refactor into the Cartalith line ·
**`07-culture-architecture.md`** — the Core Engine / Culture Profile split: which of the
engine's ~123 functions are culture-independent vs. tradition-supplied, the `CultureProfile`
data schema, and (§3.10) the post-launch simplification pass that culled the roster from 19
profiles to 2 after a rendering-distinctiveness review, including what's explicitly held for a
future pass (successive-wall-generations/ring-roads) and documented but not attempted
(scale-prep for 40–200 settlements at once) ·
**`08-terrain-building-suitability.md`** — Cartalith-port groundwork: real-world slope/flood-
setback research, a two-factor McHarg-style suitability score, and its mapping onto Cartalith
Gen1's actual terrain fields for the eventual refactor ·
**`09-refactoring-function-inventory.md`** — the complete function-by-function port plan: every
one of the ~123 engine functions (plus the ~35 app-shell ones) tagged reuse/rename/adapt/discard
against a direct read of `Cartalith Gen1 v0.85.html`, two verified naming collisions
(`generate`/`render`), one free win (`mulberry32` already exists in Gen1, byte-equivalent), and a
six-phase migration order.

### Civilization profiles (selectable in-app)

**Post-launch simplification (docs/07 §3.10):** the original 19-profile roster is culled to 2 as
of this pass. A review of every profile's actual rendered output — not just its citations — found
that most of the 17 historical, organic-planning cultures produced towns reading as visually
near-identical to the medieval baseline at the level this tool actually draws: same accretive
street tangle, same burgage-style parcel comb, same building massing. A rendering/visual-
distinctiveness finding, not a defect in the underlying research — every citation those profiles
carried remains valid and is recoverable from git history — but it meant shipping 19 selectable
cultures that mostly looked like 2. Deleted entirely (data rows, dedicated functions, tests, docs
sections, not just hidden): Roman, Islamic, Byzantine, Chinese Imperial, Aztec, Viking, Celtic,
Ancient Greek, Ancient Egyptian, Mesopotamian, Maya, Inca, Japanese Castle Town, Colonial,
Frontier, Industrial, Levantine Palimpsest. Kept:

- **Organic Growth (Medieval Western European)** (default) — the original PoC pack, framed as the
  general organic-planning pattern rather than one culture among 18 near-equivalent others:
  epoch-looped organic streets, series-platted burgage strip parcels, a parish church per few
  thousand souls, market squares that specialise with rank. Gained a modest common-pasture share
  (more prevalent farther from town) in this pass — well-attested for the medieval open-field
  system's communally-grazed fallow shift independent of this project's own reasons for adding it,
  which was to keep the `pasture` detail kind (added for the per-culture farmland register, below)
  reachable now that the two cultures that used to exercise it are gone.
- **The Venus Project (resource-based circular city)** — Jacque Fresco's circular-city concept,
  kept because its radial *growth model* is structurally distinct from organic accretion, not just
  differently labelled: several concentric ring streets at regular intervals plus radial and
  intermediate cross-spokes, converging on a domed central hub (the Center for Resource
  Management). Deliberately mixed, per earlier direct design feedback, with medieval-European
  amenity/logistics richness and Asian/Japanese residential typologies rather than reconstructed as
  a sparse, uniform circle: circular pavilions cluster at the hub/inner rings, the residential rings
  blend the standardized modular apartment with an Asian-influenced courtyard house and a Japanese
  machiya rowhouse, market squares scale with rank, and the outermost ring carries logistics
  warehouses. No religious buildings (Fresco's explicitly secular social vision). Walls and the
  bastioned star fort are a genuine optional toggle reusing the medieval fortification machinery
  unchanged — unwalled by default, but not forced off; when fortified, the circular irrigation
  waterway supplies the fort's wet moat (even on a landlocked site) instead of standing alone
  outside the curtain (M-VEN register). **Softened in this pass**: the perfectly mathematical
  concentric rings read as too mechanically exact against every other profile's noisy, accretive
  streets — the one artificial-looking thing on the map — so the rings and both spoke sets now
  carry a seeded low-frequency wobble (±5.5% ring-radius perturbation, phase drifting per ring like
  tree-ring eccentricity; ±0.045 rad spoke-angle jitter), keeping the radial skeleton legible while
  losing the compass-drawn look.
- Switching the civilization selector resets the worship rite / civic-hall style to that
  profile's defaults (still overridable) and regenerates.
- Adding a 3rd/4th profile back is architecturally a new `CULTURE_PROFILES`/`GAMES_SPEC`/
  `FARM_SPEC` table row, not an engine change — the dispatch tables stayed generic through this
  cull specifically so that remains true (docs/07 §1, §3.10).

### Signature games/spectacle buildings (docs/03 M-GAMES register, docs/07 §3.7-3.8)

A population-gated monument (`model.games`), dispatched per profile via `GAMES_SPEC`. Medieval gets
a **tiltyard**, plaza-sited (tournaments were staged in the town's own marketplace, not a dedicated
palace tiltyard, for an ordinary town) — the one remaining reused geometry technique is a plain
oriented-rectangle closure in the spirit of `buildCivic`'s own `rect()`. Venus honestly gets none —
its own design already distributes recreation through its rings rather than centralizing it in one
monument. **Archived (post-launch simplification, docs/07 §3.10):** the other 16 profiles' entries
(Roman's amphitheatre+circus, Islamic's maidan, and 14 more — plus the discorectangle/"stadium
shape" and "I"/dogbone shape primitives their entries used, and the historical-placement research
that found 10 of them genuinely intramural) are removed with their profiles; recoverable from git
history. `hashModel()` never hashes `model.games`, so none of this can affect cross-version
neutrality.

### Per-culture farmland/pasture (docs/03 M-FARM register, docs/07 §3.9)

The hinterland around a town, dispatched per profile (`model.details`, via `buildFarmland()`/
`FARM_SPEC`) rather than the same generic strip everywhere. Medieval keeps its pre-existing selion
strips (the original, correct baseline), now with a modest common-pasture share added in the
post-launch simplification pass (more prevalent farther from town, standing in for the open-field
system's communally-grazed fallow shift). Venus gets **ring-farming bands** — concentric
cultivation belts beyond the built rings, a design choice echoing the Garden City diagram rather
than a historical claim (no historical culture applies to a resource-based circular city).
**Archived (post-launch simplification, docs/07 §3.10):** the other 16 profiles' field patterns
(Roman centuriation, Islamic/Palimpsest's qanat fan, Byzantine's concentric zonation, and 13 more)
and the five shape-family generators (`gridFields`/`fanFields`/`basinFields`/`canalFields`/
`terraceFields`) that produced them are removed with their profiles; recoverable from git history.

A genuinely new `pasture` detail kind (its own `.pasture` CSS, distinct from a cultivated field's
gold) answers the "pastures *and* fields" half of an earlier request that only fields/orchards had
covered. Four real bugs were found and fixed while this register covered all 19 profiles, all by
reviewing the feature's own test data rather than assuming success — including the headline one: a
dedicated 105-combination audit initially failed with 1281 street-crossings and 34 water-overlaps,
tracing to every generator (the pre-existing baseline `stripFields` mechanism included) never
checking candidates against the live street graph, fixed with one shared `crossesStreet()` helper
now still load-bearing for the two generators that survive this pass. `hashModel()` never hashes
`model.details`, so none of this can affect cross-version neutrality.

### Generation Rules (configurable parameters, not hardcoded constants)

The **Generation Rules** panel externalizes ~17 street/parcel-growth constants that used to be
inline literals in `grow()`/`buildParcels()`/`privatizeAlleys()` as user-configurable sliders,
orthogonal to the civilization profile: branch-angle jitter, exploration share/decay, segment-length
distribution, dead-end bias, subdivision cap, and more (docs/07 §3.4). `generate()` with no `rules`
option remains byte-identical to every prior version — this is additive, not a behavior change.
Two meta-sliders, **Wildness** and **Plot Chaos** (0–2, 1.0 = baseline), each derive several of
those individual fields from one number, so a user can dial "how organic vs. planned" or "how
chaotic the parcels are" without touching 17 sliders directly. Five built-in presets (Planned Grid,
Classical Town, Organic Medieval, Medina, Wild Frontier) span that spectrum; profiles can be
created/duplicated/renamed/saved/deleted (persisted to `localStorage`) or exported/imported as
JSON. Every slider change triggers a debounced live-preview regeneration, and a comparison table
shows the current town's morphometrics against the default profile's, highlighting anything that
differs by more than 8%.

An **Evidence Ledger** panel lists every `M-*` register id actually load-bearing for the currently
generated town (collected from every object's provenance as it's drawn), formalizing the
assumptions register as in-app, queryable data rather than only a markdown file.

### Ruined (post-apocalyptic): a toggle, not a civilization (docs/03 M-PA)

Collapse is a **state** any settlement can be found in, not a tradition with its own street plan —
originally shipped as a dedicated "Post-Apocalyptic" profile that just reused another culture's
grid and forced its one mechanism on, `applyDecay()` was always profile-agnostic (it never
actually read `profile`), so it's now a plain **"ruined (post-apocalyptic)"** checkbox, off by
default, layered over *any* selected culture. A seeded ~35–45% of the built stock is flagged
ruined and excluded from the population count, but never moved or removed — a deliberate choice,
since an actual breached-wall/blocked-road model would be exactly the kind of "impossible
intersection" this project's standing audit checks against everywhere else (M-PA-1). Ruination is
orthogonal to the underlying culture's own rules: a ruined medieval town can still raise a full
bastioned trace on request, and a ruined Venus town still defaults to unwalled per its own profile
default.

### Terrain / building-suitability groundwork (Cartalith-port preparation, docs/08)

Preliminary, tested groundwork for a future Cartalith Gen1 port — nothing here touches Cartalith
itself. Every parcel now carries a `[0,1]` terrain-suitability score (`terrainSuitability()`,
inspectable on any parcel click), combining this engine's existing slope proxy with distance from
the existing flood-band margin via McHarg's (1969) overlay-analysis method — either factor alone
can drag the score down. Purely informational by default (`hashModel()` doesn't hash it, so this
cannot affect cross-version neutrality); an opt-in **"terrain-aware placement (experimental)"**
checkbox lets the worst-scoring parcels (both too steep and too flood-prone, threshold derived
from real-world construction-suitability slope bands and riparian-setback standards) go unbuilt
instead, the same "bare ground" outcome already used for undersized or agrarian-paddock parcels.
See `docs/08-terrain-building-suitability.md` for the research, the design, and the mapping onto
Cartalith Gen1's actual terrain fields (`field`, `flowField`, `resistanceField`) for when the
actual port happens.

The v0.1 app generates a deterministic medieval-pack town from a seed: site (river crossing,
bay harbour, or open coast) → anchors → least-cost primary routes over a slope/water cost
field → epoch-looped street growth (densification + exploration, T-junction attachment,
spacing rules) → planar-face blocks → series-platted strip parcels → grammar buildings
(main range / rear wings / courtyards / quayside warehouses, straight-ridge roofs) → derived
districts (incl. harbour quarter) → optional wall + gates → churches (parish count scales
with population, M-DEN-8) → wells/trees/fences/strip-fields.

**Site & harbour:** river crossing, **river-through-town** (bisecting, both banks built,
several bridges, wall spanning both with water-gates), bay harbour, open coast (mole), and
**landlocked** (no water at all — a full curtain wall, dry fort ditch, land routes on every
side); quay + back-street + piers + crane, warehouse grammar. **Harbour defence is
selectable** — chain & mouth towers / enclosing sea wall + water-gate / mole-head fort /
unprotected — so a harbour outside the walls is still defended per the historical repertoire.
**Hamlets** (≲ 600) generate as a small crossroads cluster with no church, market or wall
(M-AMEN-2); the **religious building is optional** (a "none" rite).
**Amenities scale with rank:** market squares multiply and specialise (shambles → fish/corn →
cloth → cattle) and a town-hall/guildhall appears once a place is a chartered town — a village
and an imperial seat differ visibly in the services they carry (M-AMEN-1).
**Rite is selectable (M-BLD-8):** the place of worship can be a Christian **church** (cross-plan),
a classical **temple** (colonnaded cella on a podium with frontal steps, Roman/Greek), a
**shrine**, or a **mosque** (prayer hall + courtyard + minaret); and the civic hall a **town
hall + belfry**, a Roman **basilica** (hall + apse + colonnade), a **guild loggia**, or none
(auto picks by rite — e.g. a mosque town has no monumental town hall).
**Walls & fortification (M-FOR, M-NET-9):** the curtain follows the water's edge along the
bank rather than bulging around it, dips a spur into the water at each end, leaves the
harbour mouth open, and crosses the water only once the town grew across both banks.
An optional **star fort** (bastioned trace italienne — angled bastions, curtains at musket
range, ditch, ravelins, glacis) is available for decent-size towns (≥ ~2,500; never a
hamlet), reflecting the c.1500 artillery-fortification revolution.
**Controls:** seed, site type, target population (M-DEN-1/2), growth epochs, optional city
wall, optional star fort.

Every object is selectable; the inspector shows what it is, its measurements, and the rule +
register entry that produced it. A live morphometrics panel checks the grown fabric against
the historical bands of the assumptions register.

Verify: `cd urban-morphology && tests/run.sh` (Node only), then
`node tests/browser_check.js` (headless Chromium, writes screenshots).

| Deliverable | File |
|---|---|
| Literature review (all charter disciplines, 23 traditions) | [`docs/01-literature-review.md`](docs/01-literature-review.md) |
| Algorithm survey (per-algorithm scoring + pipeline verdicts) | [`docs/02-algorithm-survey.md`](docs/02-algorithm-survey.md) |
| Mathematical assumptions register (keyed `M-…` entries: value/units/source/confidence/justification) | [`docs/03-mathematical-assumptions.md`](docs/03-mathematical-assumptions.md) |
| Architecture proposal (growth-loop engine, determinism design, tradition packs, test harness, phase plan) | [`docs/04-architecture-proposal.md`](docs/04-architecture-proposal.md) |

## Phase 0 findings in one paragraph

The evidence says historical fabric = **(planned frames + accretive growth) × time**: most
"organic-looking" towns were founded as planned plats that matured, and traditions differ in
*parameters* (plot metrology, street-width law, courtyard share, dead-end tolerance,
orientation cosmology), not in kind. The proposed engine is therefore a deterministic,
epoch-looped pipeline — site → anchors → routes → street growth → blocks → series-platted
parcels → grammar-built buildings → derived districts → maturation — whose growth rules come
from measured urban statistics (junction mix, block-area `P(A)∼A⁻²` tail, orientation
entropy, frontage distributions) and whose acceptance is *statistical*, checked headlessly
against the assumptions register. Two maximally different tradition packs (accretive
medieval vs surveyed Roman/colonial) ship first; passing both packs' acceptance bands is the
affirmative answer to the charter's primary question.

## Next (Phase 1, upon approval)

SVG renderer + seed system + camera + road generation (site, anchors, primary routes,
street growth), with the headless determinism/statistics harness from day one — see
architecture proposal §10 for exit criteria.
