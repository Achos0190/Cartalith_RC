# Procedural Urban Morphology Generator

Research-driven proof of concept: can historical urban morphology **emerge from constrained
procedural growth** rather than template placement? Founding charter: [`CHARTER.md`](CHARTER.md).

**This project is intentionally isolated from Cartalith.** No code, data, or invariants are
shared in either direction; only development *conventions* (single-file HTML, headless test
harness, keyed assumption register) are reused.

## Status

**Phase 0 complete (research) + working proof of concept (Phases 1–4 in v0.1).**

| Artifact | File |
|---|---|
| **The app** — open in any browser via `file://` | [`Urban Morphology v0.1.html`](Urban%20Morphology%20v0.1.html) |
| Headless suite (determinism, road validity, topology, statistical bands) | `tests/run.sh` (110 assertions) |
| Browser driver (screenshots + inspector click-tests) | `tests/browser_check.js` |

The v0.1 app generates a deterministic medieval-pack town from a seed: site (river crossing,
bay harbour, or open coast) → anchors → least-cost primary routes over a slope/water cost
field → epoch-looped street growth (densification + exploration, T-junction attachment,
spacing rules) → planar-face blocks → series-platted strip parcels → grammar buildings
(main range / rear wings / courtyards / quayside warehouses, straight-ridge roofs) → derived
districts (incl. harbour quarter) → optional wall + gates → churches (parish count scales
with population, M-DEN-8) → wells/trees/fences/strip-fields.

**Site & harbour:** river ports (quay downstream of the bridge), bay harbours (natural
shelter), open coasts (breakwater mole); quay + back-street + piers + crane, with warehouse
grammar on the quay.
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
