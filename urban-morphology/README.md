# Procedural Urban Morphology Generator

Research-driven proof of concept: can historical urban morphology **emerge from constrained
procedural growth** rather than template placement? Founding charter: [`CHARTER.md`](CHARTER.md).

**This project is intentionally isolated from Cartalith.** No code, data, or invariants are
shared in either direction; only development *conventions* (single-file HTML, headless test
harness, keyed assumption register) are reused.

## Status

**Phase 0 complete — research only, no implementation** (as the charter mandates).

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
