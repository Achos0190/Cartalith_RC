# Phase 0 — Algorithm Survey

**Project:** Procedural Urban Morphology Generator (see `../CHARTER.md`)
**Status:** Phase 0 deliverable 2 of 4. No implementation.

Every algorithm the charter names is scored on the charter's six axes — **purpose,
strengths, weaknesses, computational complexity, historical realism, browser suitability** —
plus a **verdict** stating where (or whether) it belongs in the pipeline. `n` = entity count
at the relevant stage. "Browser suitability" assumes the charter constraints: single HTML
file, no dependencies, no build step, synchronous main-thread generation at PoC scale
(≤ ~3·10³ parcels typical, ~10⁴ hard target).

Verdict legend: **CORE** (pipeline component) · **SUPPORT** (internal utility) ·
**VALIDATE** (used to measure output, not generate it) · **REJECT** (documented, excluded).

---

## Part I — Growth & placement algorithms

### 1. Constrained graph growth (priority-queue frontier + legalization)

The mechanism underneath Parish & Müller's "extended L-system"
([2001](https://cgl.ethz.ch/Downloads/Publications/Papers/2001/p_Par01.pdf)) and Kelly's
Citygen: candidate road segments are proposed from a frontier queue by **global goals**
(follow route attractor, keep district grid direction, seek frontage demand) and repaired by
**local constraints** (snap endpoint to node/edge within tolerance, extend to nearest
intersection, reject water/steep/too-acute).

- **Purpose:** primary and secondary street growth; the temporal driver of the whole engine.
- **Strengths:** directly implements the empirically observed processes — densification +
  exploration ([Strano 2012](https://www.nature.com/articles/srep00296)), local cost
  minimization ([Barthélemy & Flammini 2008](https://arxiv.org/abs/0708.4360)),
  near-perpendicular attachment; incremental (grows per epoch); every segment is traceable
  to the rule that proposed it (charter's transparency requirement).
- **Weaknesses:** rule tuning is empirical; naive snapping creates slivers (needs a strict
  tolerance regime); global street-pattern statistics are emergent, so acceptance must be
  measured, not assumed.
- **Complexity:** O(k log k) queue operations for k segments; each legalization is a local
  spatial query, O(1) with a grid index. Trivial at 10³–10⁴ segments.
- **Historical realism:** the strongest of any surveyed growth method (§ 5, § 8–9 of the
  literature review).
- **Browser suitability:** excellent — plain JS, no allocation pressure, deterministic.
- **Verdict: CORE** (Stage R2 "secondary/accretive streets"; also drives extramural ribbons).

### 2. Cost-field least-cost paths (Dijkstra/A*) with trail reinforcement

- **Purpose:** pre-urban route scaffold: paths between external route endpoints, ford/bridge,
  harbour, and the market anchor over the site cost field (Tobler slope kernel M-REG-5,
  water/flood penalties); reinforcement discount where paths overlap (Helbing-style
  convergence, [Helbing et al. 1997](https://pubmed.ncbi.nlm.nih.gov/9214501/)).
- **Strengths:** produces the convergence funnels, gentle curvature, and shared approaches
  seen in real route networks; needs no tuning beyond the cost kernel; deterministic.
- **Weaknesses:** grid-graph paths show lattice artifacts — needs 16-neighbourhood +
  post-smoothing (chord-tolerance simplification); full Helbing PDE is overkill.
- **Complexity:** A* on an m-cell raster O(m log m); site rasters are small (≤ 512²).
- **Historical realism:** high — matches desire-path evidence and route geography.
- **Browser suitability:** excellent.
- **Verdict: CORE** (Stage R1 "primary roads"), with the reinforcement loop simplified to
  sequential routing with overlap discounts (full active-walker sim: REJECT, unneeded).

### 3. Tensor-field street synthesis (Chen et al. 2008)

- **Purpose:** planned street systems: grids aligned to axis/coast/slope, radial systems
  ([Chen et al. 2008](https://www.sci.utah.edu/~chengu/street_sig08/street_sig08.pdf)).
- **Strengths:** clean control of orientation regimes (cardinal cosmology, shore-normal
  herringbone); smooth basis-field blending; hyperstreamline tracing gives well-spaced
  streets.
- **Weaknesses:** heavier machinery (field design, degenerate points, streamline seeding &
  spacing control); overkill when the planned unit is a simple rectangular plat.
- **Complexity:** field evaluation O(1)/sample; tracing O(total length / step).
- **Historical realism:** high for planned traditions; wrong tool for accretive fabric.
- **Verdict: SUPPORT, deferred.** Phase 1 implements planned plats as explicit rectangular
  frames (evidence shows historical plats *were* simple rectangles — Timgad, Kahun, Indies);
  the tensor formulation is the documented upgrade path for curved planned systems
  (baroque diagonals, contour-following colonial grids).

### 4. Agent-based settlement simulation

- **Purpose:** literal settlers/builders choosing locations (Emilien et al.
  [2012](https://inria.hal.science/hal-00694525) is the scored-field variant).
- **Strengths:** maximal narrative traceability; naturally incremental.
- **Weaknesses:** stochastic path-dependence makes statistical control hard; per-agent
  micro-decisions are *not* better evidenced than their aggregate (we have measurements of
  outcomes, not of medieval decision protocols); slow convergence; determinism fragile under
  reordering.
- **Complexity:** O(agents × steps × query).
- **Historical realism:** conceptually appealing, empirically unanchored at micro level.
- **Verdict: REJECT as core**, but its **scored-candidate essence survives**: every growth
  step in Alg. 1 scores discrete candidates on evidence-derived fields (access, water
  distance, frontage availability) — agents without the agents.

### 5. Cellular automata (urban-growth CA, SLEUTH family)

- **Purpose:** raster land-state transitions (rural→urban), densification dynamics.
- **Strengths:** simple, well studied in urban-growth modelling; good at frontier textures.
- **Weaknesses:** raster output fundamentally mismatched to vector plots/streets; realistic
  CA needs the street network as an input anyway; calibration data are modern.
- **Complexity:** O(cells × epochs).
- **Historical realism:** moderate for extent, none for parcel geometry.
- **Verdict: REJECT for geometry; VALIDATE-adjacent** idea retained: the *densification
  schedule* (which blocks densify per epoch) is computed on the parcel graph with
  CA-like neighbour rules (M-GRW-1/2), but on vector entities, not raster cells.

### 6. L-systems (formal grammar rewriting)

- **Purpose:** historically, road growth (Parish & Müller framed their system this way).
- **Strengths:** compact recursive description of branching.
- **Weaknesses:** the formalism adds nothing once global goals/local constraints dominate —
  P&M's own successors dropped it ([Kelly & McCabe 2006](https://arrow.tudublin.ie/itbj/vol7/iss2/5/)
  and the [phiresky survey](https://phiresky.github.io/procedural-cities/) both note the
  system degenerates to a growth queue); string-rewriting obscures geometric state.
- **Verdict: REJECT** (subsumed by Alg. 1).

### 7. Wave Function Collapse / constraint-tile solving

- **Purpose:** tile assembly under adjacency constraints.
- **Strengths:** superb for texture-like discrete domains with local consistency.
- **Weaknesses:** urban fabric's constraints are *global and continuous* (access to network,
  series platting, area conservation); WFC on tiles yields template-flavoured output — the
  exact failure the charter defines itself against; contradiction restarts break determinism
  discipline.
- **Complexity:** roughly O(tiles × states) with backtracking spikes.
- **Historical realism:** low for layout; fine for garnish.
- **Verdict: REJECT for core.** Optional future garnish (field/garden textures) only.

### 8. Reaction-diffusion

- **Purpose:** continuous pattern fields (spots/stripes).
- **Weaknesses:** no historical mechanism maps to it; output needs heavy vectorization;
  parameters are pure aesthetics — the arbitrary-constant trap the charter forbids.
- **Verdict: REJECT.**

### 9. Procedural (shape) grammars — CGA/split-grammar subset

- **Purpose:** building footprints/masses from parcels (Wonka 2003; Müller 2006); top-down
  needs only the footprint/mass/roof subset.
- **Strengths:** exactly matches the evidence structure — vernacular types are rule systems
  conditioned on plot shape (Caniggia, lit. review §1); tiny rule sets per tradition;
  deterministic; traceable (each op names its rule).
- **Weaknesses:** grammar authoring is manual; overreach into façade detail is wasted in
  top-down SVG.
- **Complexity:** O(ops) per building, trivial.
- **Historical realism:** high (types from excavation modules, M-PAR-6/M-BLD-*).
- **Verdict: CORE** (Stage B2 "architectural grammar"): ops = inset, frontage-align, wing,
  courtyard-carve, outbuilding, roof (via Alg. 14).

---

## Part II — Computational geometry

### 10. Planar arrangement + face extraction (DCEL/half-edge)

- **Purpose:** streets → blocks (faces of the planar street graph).
- **Strengths:** the definitional operation; gives adjacency for free (block↔street edges).
- **Weaknesses:** must be robust to near-degenerate input — mitigated by upstream snap
  discipline (integer coords, tolerance ε, no near-parallel slivers).
- **Complexity:** face walk O(E); with grid-indexed intersection insertion O(E log E)-ish.
- **Browser suitability:** fine; few hundred lines of careful JS.
- **Verdict: CORE** (Stage K1 "blocks").

### 11. Polygon offsetting (inward buffer)

- **Purpose:** block face → buildable block polygon (shrink by half street width per edge,
  widths vary by street class); also wall-berm and plaza insets.
- **Strengths:** variable per-edge offset naturally encodes the street-width hierarchy.
- **Weaknesses:** classic robustness trap (self-intersections at reflex vertices); needs
  miter limits + result cleaning by the Boolean kernel (Alg. 13).
- **Complexity:** O(v log v) per polygon.
- **Verdict: CORE** (inside Stage K1). Straight-skeleton-based offsetting (Alg. 14) is the
  fallback for pathological cases.

### 12. Voronoi / weighted Voronoi / Delaunay / constrained Delaunay

- **Purpose:** proximity partitions and triangulations.
- **Strengths:** right tool for *catchment* questions: ward/parish allocation around
  anchors; compound catchments in dispersed low-density mode (Maya/Celtic families);
  Delaunay as neighbour graph for anchor spacing checks (Clark–Evans, M-REG-2).
- **Weaknesses:** as a *block generator* it produces the recognizably wrong "soap bubble"
  fabric (blocks must come from streets — lit. review § 9 on ward-first generators);
  robust CDT is significant code better avoided until needed.
- **Complexity:** O(n log n).
- **Verdict: SUPPORT** (dispersed-mode catchments, district partitions, spacing stats).
  Bowyer–Watson Delaunay is sufficient; full CDT deferred.

### 13. Polygon clipping / Boolean ops (integer, Vatti/Martinez family)

- **Purpose:** the geometry kernel: intersection/difference/union for parcels∩blocks,
  wall∩fabric, flood-band exclusion, footprint validity.
- **Strengths:** one robust kernel retires the majority of geometric failure modes; integer
  (fixed-point mm) coordinates give exact, deterministic predicates.
- **Weaknesses:** the hardest single component to write correctly from scratch (the one
  place where the charter's "no dependencies unless technically justified" clause is
  genuinely tested — decision in architecture proposal § 5: self-written, integer-snapped,
  convex-biased fast paths, ~500 LOC budget).
- **Complexity:** O((n+k) log n), k = intersections.
- **Verdict: CORE SUPPORT** (used by Stages K1, P1, B1, W1).

### 14. Straight skeleton (+ weighted variants)

- **Purpose:** (a) strip subdivision of irregular blocks — α-strips parallel to frontage at
  plot depth, then transverse cuts (the Vanegas et al. "skeleton mode"); (b) roof ridge
  lines from footprints for the top-down roof rendering (Aichholzer & Aurenhammer 1996;
  Felkel & Obdržálek 1998; Laycock & Day 2003;
  [weighted skeletons](https://www.sciencedirect.com/science/article/pii/S0010448517301240)).
- **Strengths:** reproduces exactly the cadastral strip-series geometry (lit. review §3);
  roofs for free; mitered offsets as a robustness fallback for Alg. 11.
- **Weaknesses:** notoriously fiddly to implement robustly for arbitrary polygons —
  mitigated by scope: our inputs are cleaned, simple, mostly convex-ish polygons of ≤ ~40
  vertices; event-queue implementation with integer coordinates + epsilon policy; OBB
  subdivision (Alg. 15) is the guaranteed fallback whenever the skeleton degenerates.
- **Complexity:** practical implementations O(n² ) worst case at our sizes — irrelevant for
  n ≤ 40.
- **Historical realism:** high (this *is* how burgage/strip fabrics are shaped).
- **Verdict: CORE** (Stage P1 organic mode; Stage B2 roofs), with mandatory OBB fallback.

### 15. OBB recursive subdivision

- **Purpose:** planned-mode parcel splitting: cut perpendicular to the oriented bounding
  box's long axis, recurse until target area, snap cuts to frontage
  ([Vanegas et al. 2012](https://www.cs.purdue.edu/cgvlab/papers/aliaga/eg2012.pdf)).
- **Strengths:** simple, fast, robust on anything; matches surveyed quarters (Roman/colonial
  per-strigas platting) where plots were halved and quartered by rope-and-groma.
- **Weaknesses:** left raw it produces suspiciously even fabrics — needs the register's
  width jitter and the subdivision-history model (M-PAR-1) to look historical.
- **Complexity:** O(p log p) for p parcels.
- **Verdict: CORE** (Stage P1 planned mode; universal fallback).

### 16. Medial axis

- **Purpose:** centerline extraction (plaza proportions, block "depth" diagnostics).
- **Weaknesses:** exact medial axis of polygons is parabolic-arc territory; approximating
  via Voronoi of boundary samples is enough for diagnostics.
- **Verdict: SUPPORT (approximate form only), deferred** — Alg. 14 covers the needs.

### 17. Minimum spanning trees / proximity graphs (Gabriel, RNG)

- **Purpose:** candidate topology between anchors/settlement seeds before routing; spacing
  diagnostics.
- **Strengths:** β-skeleton family brackets observed pre-planned route networks between MST
  (too sparse) and Delaunay (too dense); trivial to compute at our n.
- **Verdict: SUPPORT** (Stage R1 candidate edges; the router (Alg. 2) realizes them).

### 18. Constrained graph optimisation (global)

- **Purpose:** e.g., globally optimal street networks under length/detour budgets.
- **Weaknesses:** history did not globally optimize; sequential local optimization is both
  cheaper and *more* faithful (lit. review § 8). Global solvers also fight determinism and
  transparency.
- **Verdict: REJECT** (retain local, per-step optimization only).

### 19. Graph embedding / force-directed relaxation

- **Purpose:** node position relaxation (junction spacing, removing surveyor-straight
  artifacts by ε-perturbation with edge-length constraints).
- **Strengths:** cheap "aging" operator: a single constrained Laplacian-smoothing pass with
  boundary pinning reproduces the gentle drift of maintained-but-unplanned streets.
- **Weaknesses:** must be bounded (a few cm/m per epoch) or it erases planned signatures.
- **Verdict: SUPPORT** (Stage R3 "maturation" deformation; strictly bounded, per-epoch).

---

## Part III — Measurement algorithms (validation only)

| Metric | Algorithm | Register / source |
|---|---|---|
| Junction degree mix, dead-end share | direct graph census | M-NET-1/2 |
| Orientation entropy H_θ, order φ | bearing histogram (36 bins) | M-NET-7, [Boeing 2019](https://arxiv.org/abs/1808.00600) |
| Block area tail, shape-factor fingerprint | log-log rank fit; Φ = A/A_circumcircle conditional histogram | M-BLK-1/2, [Louf & Barthélemy 2014](https://arxiv.org/abs/1410.2094) |
| Frontage distribution | KS distance to register target | M-PAR-1 |
| Betweenness/closeness (space-syntax proxy) | Brandes O(VE) on segment graph | M-NET-10; also *input* to district stage |
| Circuity | route/crow-fly ratio over sampled pairs | M-NET-6 |
| Density gradient b | exponential fit of built area vs r | M-DEN-3 |
| Fabric fractal dimension | box-counting on built mask | lit. review § 8 (soft) |
| Clark–Evans R (dispersed modes) | nearest-neighbour census | M-REG-2 |

These run headless in the test harness (architecture proposal § 8) and in-app as the
"morphometrics panel", making the charter's acceptance criteria *measurable*.

---

## Part IV — Pipeline placement summary

| Charter stage | Chosen algorithm(s) | Rejected alternatives |
|---|---|---|
| Site & anchors (added by evidence, §11 of lit. review) | parametric site model; anchor scoring on fields; proximity-graph candidates (17) | full terrain sim; agents (4) |
| Primary roads | least-cost paths + reinforcement (2) | straight connectors; full Helbing PDE |
| Secondary roads | constrained graph growth (1); rectangular plats now, tensor fields later (3) | L-system formalism (6); WFC (7); global optimization (18) |
| Urban blocks | DCEL face extraction (10) + per-edge inward offset (11, 13) | Voronoi blocks (12) |
| Parcel subdivision | skeleton strip mode (14) + OBB mode (15), per tradition/district; series platting contract | per-parcel independent sampling |
| Building footprints | parcel-conditioned shape grammar (9) | WFC (7), reaction-diffusion (8) |
| Architectural grammar | footprint/mass/roof grammar ops (9) + skeleton roofs (14) | façade-level CGA (out of scope) |
| Districts | centrality + anchor fields → rule allocation (space-syntax rationale); Voronoi wards where walled (12) | painted districts; CA raster (5) |
| Detail objects | rule-scored deterministic sampling (Poisson-disk w/ seeded RNG within constraints) | free random scatter |
| Maturation (added) | bounded relaxation (19); subdivision/encroachment operators per epoch | none |
| SVG rendering | direct serialization of model (renderer invents nothing) | — |
