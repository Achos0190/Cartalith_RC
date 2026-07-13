# Procedural Urban Morphology Generator

Research-driven proof of concept: can historical urban morphology **emerge from constrained
procedural growth** rather than template placement? Founding charter: [`CHARTER.md`](CHARTER.md).

**This project is intentionally isolated from Cartalith.** No code, data, or invariants are
shared in either direction; only development *conventions* (single-file HTML, headless test
harness, keyed assumption register) are reused.

## Status

**Phase 0 complete (research) + working proof of concept (Phases 1–4) + Phase 1 of the
post-PoC expansion: a Core Engine / Culture Profile architecture split, all in v0.1.**

| Artifact | File |
|---|---|
| **The app** — open in any browser via `file://` | [`Urban Morphology v0.1.html`](Urban%20Morphology%20v0.1.html) |
| Headless suite (determinism, road validity, topology, statistical bands, culture profiles) | `tests/run.sh` (1176 assertions) |
| Browser driver (screenshots + inspector click-tests, incl. the Roman colonia) | `tests/browser_check.js` |

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
engine's ~70 functions are culture-independent vs. tradition-supplied, the `CultureProfile`
data schema, the Roman colonia's quantified morphology, and what's explicitly deferred to
later phases (phased historical growth, negative space, infrastructure layer, Space
Syntax/graph-theory metrics, settlement hierarchy, a profile-aware validation panel, and
civilizations 3–18) ·
**`08-terrain-building-suitability.md`** — Cartalith-port groundwork: real-world slope/flood-
setback research, a two-factor McHarg-style suitability score, and its mapping onto Cartalith
Gen1's actual terrain fields for the eventual refactor.

### Civilization profiles (selectable in-app)

- **Medieval Western European** (default) — the original PoC pack below, unchanged.
- **Roman (planned colonia)** — a *fundamentally different growth model*, not a re-skin: a
  regular grid laid in one act (cardo maximus × decumanus maximus crossing at the forum, minor
  cardines/decumani at ~50–60 m, M-ROM-1), insula blocks cut into a lot grid rather than
  medieval strip-platting (M-ROM-2/3), domus (atrium + peristyle courtyard) for the
  market/burgher elite vs. dense multi-storey **insula** apartment blocks for everyone else,
  a classical **temple** + **basilica** by default (reusing the existing worship-rite/civic-hall
  machinery unchanged), no specialised market squares (the forum substitutes), a castrum-scheme
  wall with the four traditional named gates (*porta praetoria/decumana/principalis
  dextra/sinistra*) — and **never** a gunpowder-era bastioned trace, however requested, since
  that fortification revolution postdates Rome by over a millennium. Statistically distinct
  from the medieval pack in a testable way: its street grid is overwhelmingly axis-aligned
  (M-ROM-6), unlike the organic pack's all-angle tangle — the morphometrics panel shows the
  medieval-calibrated bands for reference only when a non-medieval profile is active, rather
  than mis-marking a legitimately different morphology as a failure.
- **Islamic (traditional medina)** — organic growth like the medieval pack, but the
  congregational mosque anchors a souk that radiates the trade hierarchy outward (most
  esteemed trades nearest the mosque, reusing the existing mosque-rite geometry and
  market-anchor siting unchanged); residential quarters are privacy-oriented **courtyard
  houses** universal across social classes (not just the elite, unlike Roman's domus/insula
  split); a documented **encroachment** mechanism privatizes a share of through-lanes into
  cul-de-sacs after the fabric is fully built (so no dwelling frontage is lost — only through
  *access* is closed), giving a materially higher, testable dead-end share than the medieval
  pack (M-ISL-2); no monumental civic building (the existing faith→civic auto-pick already got
  this right); gates named by compass quadrant (*Bab ash-Sharq* etc., M-ISL-4); never a
  bastioned trace (same anachronism guard as Roman).
- **Byzantine** — organic growth as the medieval pack (an existing Roman-founded city's plan
  continuing to accrete, not a re-plan), but the rite is the mature Middle Byzantine
  **cross-in-square** church — a domed naos on four columns, narthex, apsed bema (M-BYZ-1) —
  with the civic hall reusing the Roman-derived basilica; the specialised-market economy is
  kept (unlike Roman/Islamic); never a bastioned trace (the Byzantine millennium ends in 1453,
  at the dawn of that revolution).
- **Chinese Imperial (Song-dynasty commercial city)** — Tang Chang'an was the Kaogongji tradition
  made real: a square/rectangular walled capital on a strict cardinal grid. That system broke
  down through the Tang-to-Song transition (the "medieval urban revolution," Skinner 1977 — the
  same source already load-bearing for Levantine Palimpsest's M-PAL-2): Song cities like Kaifeng
  shed the walled-ward grid as commerce spilled into the street. This profile now models that
  organic, post-transition city (M-CHN-1) rather than the earlier planned ideal, reusing the
  medieval pack's own organic growth and the Islamic profile's universal courtyard-house
  (siheyuan) grammar wholesale; compass-quadrant gate names (M-CHN-3); markets are now a real
  institution, matching the Song relaxation of state market control. No bastioned trace.
- **Aztec (lake-city, Tenochtitlan-style)** — the sacred precinct and four main causeways had a
  real cardinal order, but the residential *calpulli* districts built out over the chinampas grew
  organically across roughly two centuries of land reclamation (1325–1521) — the strict grid
  popularly associated with the site is largely the *post*-conquest Spanish rebuild (Mexico
  City), not the Mexica city itself (M-AZT-1). This profile now models that organic residential
  growth (reusing the medieval pack's own organic mechanics) rather than a uniform grid, while
  keeping a genuinely new infrastructure layer: **chinampas** — narrow (~2.5–4 m) raised-bed
  garden strips reclaimed from the lake shallows along the town's own shoreline, canals between
  them (M-AZT-2). No European-style wall (the lake, causeways and their removable bridges were
  the defence, M-AZT-3 — forced off regardless of the walls checkbox); no civic hall (temple-state
  governance seated in the sacred precinct itself).
- **Viking (Hedeby/Birka-style)** — organic growth like the medieval pack, but housing is a
  new **longhouse** grammar (a single ~10–20 m timber hall per parcel, M-VIK-1) rather than any
  multi-range building; no civic hall (communal decisions were made at the open-air **þing**,
  not a building); gates named by plain compass quadrant via a new generic `'compass'` scheme;
  never a bastioned trace (the Viking Age ends c. 1050).
- **Celtic (Iron Age oppidum)** — organic growth with a new **roundhouse** grammar — the first
  building shape that isn't a rectangle re-skin, a circular polygon sized to the parcel
  (M-CEL-2); the curtain wall stands in for a timber-laced *murus gallicus* rampart; no civic
  hall; compass-quadrant gates (shared `'compass'` scheme with Viking); never a bastioned trace.
- **Ancient Greek (Archaic/Classical polis)** — most Greek poleis were never gridded at all:
  Athens itself, the paradigm case, grew organically for centuries, explicitly contrasted by
  ancient and modern writers with Hippodamus of Miletus's regular grid — a Classical-era
  innovation applied to *new* colonial foundations (Miletus rebuilt 479 BC, Priene, Rhodes)
  rather than retrofitted onto existing cities (M-GRK-1). This profile models that older, far
  more common organic polis; the Mediterranean courtyard house shared with Rome/Islam; the
  agora's civic function is modelled as a colonnaded **stoa** (the existing loggia geometry)
  rather than the anachronistic Roman basilica (M-GRK-2).
- **Ancient Egyptian (Amarna's Main City)** — at Amarna itself, under the same pharaoh, the
  state-built Workmen's Village was a rigid planned grid of 72 houses — but the much larger Main
  City next door, where most of the population actually lived, grew with "a surprising lack of
  direction," organic and unplanned by comparison (M-EGY-1). This profile now models that Main
  City instead of the small planned enclave: standardized courtyard housing, temple-state
  governance (no civic hall, no independent markets); the temple rite stands in for pylon-form
  Egyptian temple architecture, a documented simplification (M-EGY-2).
- **Mesopotamian (Sumerian/Babylonian city)** — the one Bronze/Iron Age Near Eastern profile
  modelled as **organic** growth rather than a planned grid (Ur/Nineveh's dense, winding-laned
  fabric around a walled temple-palace citadel, M-MES-1); the well-attested Mesopotamian
  courtyard house; the temple rite stands in for the stepped mudbrick ziggurat (M-MES-2);
  temple-palace governance (no civic hall, no independent markets).
- **Maya (Classic-period city-state)** — dispersed, organically-grown plaza groups on a
  cardinal/astronomically-aligned axis (M-MAY-1); the courtyard-house grammar stands in for the
  "plazuela group" household cluster (M-MAY-2); unlike the temple-redistribution profiles above,
  keeps markets (Tikal/Chunchucmil marketplace archaeology, M-MAY-3); uniquely, defensive walls
  stay a genuine optional toggle rather than forced on or off, since circuits were
  regional/period-specific rather than universal.
- **Inca (Andean imperial city)** — built from the **kancha**, a walled courtyard enclosure of
  single-room buildings — a direct architectural match for the existing courtyard-house grammar,
  not a stand-in (M-INC-1); terrain-led organic growth reflecting the Andes' terraced
  mountainside sites rather than a flat grid; uniquely in this register, a well-documented
  **no-market, no-currency** redistributive economy (M-INC-2).
- **Japanese Castle Town (jokamachi)** — organic, deliberately winding streets radiating from
  the daimyo's castle; merchant *machiya* townhouses reuse the medieval **burgage** grammar
  directly, a genuine cross-cultural parallel (M-JPN-2); a new civic style, the **castle keep**
  (*tenshu*), reuses the existing basilica/townhall render path — an inset roofline and
  corner-turret markers — rather than new tiered-roof geometry (M-JPN-3).
- **Colonial (Spanish American mining boomtown)** — Philip II's 1573 Laws of the Indies codified
  a plaza-mayor grid template for new civil foundations, but many settlements never followed it:
  mining boomtowns like Zacatecas (founded 1546, decades earlier) and Potosí grew spontaneously
  around a strike site, following ravine/hillside topography rather than a grid, and often stayed
  that way even after 1573 (M-COL-1). This profile now models that organic mining-town growth;
  housing is the Mediterranean-derived colonial patio house (M-COL-2); the church rite marks this
  as the first organic profile built under Christian rather than classical/temple-state auspices.
- **Frontier (American Old West boomtown)** — unplanned, terrain-led main-street growth; the
  narrow-frontage burgage grammar stands in for the iconic false-front wooden storefront
  (M-FRO-2); never fortified at all — a third, distinct reasoning for the `noWalls` mechanism
  (Aztec: alternative defence; Frontier: no defence tradition, M-FRO-3).
- **Industrial (Manchester-style mill town)** — grid planning was one choice among several for
  19th-century industrialization, not a universal feature of it: Manchester, the archetypal
  industrial city, grew almost entirely without formal planning — chaotic, market-driven
  expansion around mills and canals — in sharp contrast to deliberately platted American company
  towns like Lowell, MA (M-IND-3). This profile now models Manchester's more common organic
  pattern, reusing the Roman **domus-insula** grammar unchanged: the tenement/mill-owner-villa
  split maps directly onto the historical insula-block/domus divide (M-IND-1); the one new
  mechanism, `tagFactory()`, re-tags the town's own largest warehouse/insula-class building as
  its factory/mill anchor with a chimney marker (M-IND-2).
- **The Venus Project (resource-based circular city)** — Jacque Fresco's circular-city concept,
  the first genuinely new *growth model* since the grid: several concentric ring streets at regular
  intervals plus radial and intermediate cross-spokes, converging on a domed central hub (the
  Center for Resource Management), reusing the roundhouse's polygon-for-a-circle technique at city
  scale. Deliberately mixed, per direct design feedback, with medieval-European amenity/logistics
  richness and Asian/Japanese residential typologies rather than reconstructed as a sparse, uniform
  circle: circular pavilions cluster at the hub/inner rings, the residential rings blend the
  standardized modular apartment with an Asian-influenced courtyard house and a Japanese machiya
  rowhouse, market squares scale with rank, and the outermost ring carries logistics warehouses. No
  religious buildings (Fresco's explicitly secular social vision). Walls and the bastioned star fort
  are a genuine optional toggle reusing the medieval fortification machinery unchanged — unwalled
  by default, but not forced off; when fortified, the circular irrigation waterway supplies the
  fort's wet moat (even on a landlocked site) instead of standing alone outside the curtain
  (M-VEN register).
- **Levantine Palimpsest (Aleppo/Damascus, grid-to-souk)** — a fourth planning mode,
  `planning:'palimpsest'`: a Hellenistic/Roman colonia grid (`buildGridStreets`, unchanged —
  literally the Roman profile's own founding act) founded once and never re-planned, but
  organically transformed over centuries by four small encroachment sub-passes instead of
  organic growth's exploration: colonnaded avenues progressively narrow into an enclosed souk
  (road width only, never the centerline — Sauvaget's Damascus/Aleppo studies, M-PAL-1);
  interior residential wards carry a founding enclosure, a share of which has already dissolved
  by this snapshot (Skinner's Tang-to-Song "medieval urban revolution," M-PAL-2, a pure
  data/render pass, verified against every real building rather than trusted by construction);
  secondary streets grow along the shoreline rather than the founding grid's orientation where
  the site has one (Kaifeng's post-flood HGIS pattern, M-PAL-3); and the existing back-lane
  mechanism recurs at increasing density as the fabric matures (Conzen's burgage cycle,
  M-PAL-4). Housing and gates read the mature Islamic-period identity the plan ended at
  (courtyard houses, Bab-scheme gate names), not the Roman one it started from. Encroachment
  intensity is a tunable per-profile parameter (`rules.palimpsest`), not a fixed universal curve,
  since real cities encroached at different times and rates (Jacobs 2009, M-PAL-5); never a
  bastioned trace, however large the requested population (same anachronism guard as Roman/
  Islamic — `bab` is not on the `scheme:'organic'` allowlist that alone unlocks it).
- Switching the civilization selector resets the worship rite / civic-hall style to that
  profile's defaults (still overridable) and regenerates — for Roman this is a real morphology
  change (organic → grid), not just a re-skin, per the profile's `planning` field.

### Signature games/spectacle buildings (docs/03 M-GAMES register, docs/07 §3.7)

A population-gated monument (`model.games`) for every profile — the Colosseum/Circus Maximus
pairing named as the motivating example — reusing only two existing geometry techniques (the
roundhouse/dome regular-polygon ellipse and an oriented-rectangle closure in the spirit of
`buildCivic`'s own `rect()`), never a bespoke per-culture shape: Medieval **tiltyard** ·
Roman **amphitheatre + circus** (the one profile with two, both independently well-attested) ·
Islamic **maidan** · Byzantine **hippodrome** · Chinese **cuju/polo ground** · Aztec **tlachtli
ballcourt** · Viking **knattleikr field** (weakest evidence in the register, flagged rather than
invented) · Celtic **Tailteann assembly ground** · Greek **stadion** · Egyptian **Heb-Sed court** ·
Maya **pitz ballcourt** · Inca **ushnu platform** (honestly ceremonial, not a games building — no
true sport architecture is attested for the Inca) · Japanese **sumo grounds** · Colonial
**bullring** (a flagged anachronism — real rings postdate this profile's setting by two centuries)
· Frontier **racetrack** · Industrial **cricket ground** (Manchester's own Old Trafford, 1857).
Mesopotamian and Venus honestly get none — no purpose-built venue is attested for the former, and
the latter's own design already distributes recreation through its rings rather than centralizing
it — and Palimpsest inherits Islamic's maidan rather than a bespoke entry, the same "mature
identity" reasoning its housing/gates already follow. Every candidate is sited beyond the town's
own realized extent and validated against map bounds, water, the live street graph and every
already-placed monument before being accepted; a doomed candidate is retried elsewhere rather than
forced in, and `hashModel()` never hashes `model.games`, so the feature cannot affect cross-version
neutrality.

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

An **Evidence Ledger** panel lists every `M-*`/`M-ROM-*` register id actually load-bearing for
the currently generated town (collected from every object's provenance as it's drawn), formalizing
the assumptions register as in-app, queryable data rather than only a markdown file.

### Ruined (post-apocalyptic): a toggle, not a civilization (docs/03 M-PA)

Collapse is a **state** any settlement can be found in, not a tradition with its own street plan —
originally shipped as a dedicated "Post-Apocalyptic" profile that just reused Industrial's grid
and forced its one mechanism on, `applyDecay()` was always profile-agnostic (it never actually
read `profile`), so it's now a plain **"ruined (post-apocalyptic)"** checkbox, off by default,
layered over *any* selected culture. A seeded ~35–45% of the built stock is flagged ruined and
excluded from the population count, but never moved or removed — a deliberate choice, since an
actual breached-wall/blocked-road model would be exactly the kind of "impossible intersection"
this project's standing audit checks against everywhere else (M-PA-1). Ruination is orthogonal to
the underlying culture's own rules: a ruined medieval town can still raise a full bastioned trace
on request, and a ruined Industrial town still never gets a wall at all.

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
