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
| Headless suite (determinism, road validity, topology, statistical bands, culture profiles) | `tests/run.sh` (247 assertions) |
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
civilizations 3–18).

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
- **Chinese Imperial (walled capital)** — the Kaogongji tradition: a square/rectangular walled
  capital on a strict cardinal grid, the palace at the geometric centre facing south. Reuses
  the Roman profile's grid-growth machinery and the Islamic profile's universal courtyard-house
  (siheyuan) grammar wholesale — proving those two mechanisms generalize beyond the traditions
  they were built for, not just Rome/the medina — with plain cardinal gate names (North/South/
  East/West Gate, M-CHN-3) and a household-size correction for the siheyuan's typically larger,
  extended-family compound (M-CHN-4). No specialised markets; never a bastioned trace.
- **Aztec (lake-city, Tenochtitlan-style)** — reuses the Roman grid and the Islamic/Chinese
  courtyard-house grammar for the causeway framework and housing, but adds a genuinely new
  infrastructure layer: **chinampas** — narrow (~2.5–4 m) raised-bed garden strips reclaimed
  from the lake shallows along the town's own shoreline, canals between them (M-AZT-2). No
  European-style wall (the lake, causeways and their removable bridges were the defence,
  M-AZT-3 — forced off regardless of the walls checkbox); no civic hall (temple-state
  governance seated in the sacred precinct itself).
- Switching the civilization selector resets the worship rite / civic-hall style to that
  profile's defaults (still overridable) and regenerates — for Roman this is a real morphology
  change (organic → grid), not just a re-skin, per the profile's `planning` field.

An **Evidence Ledger** panel lists every `M-*`/`M-ROM-*` register id actually load-bearing for
the currently generated town (collected from every object's provenance as it's drawn), formalizing
the assumptions register as in-app, queryable data rather than only a markdown file.

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
