# Phase 0 — Literature Review

**Project:** Procedural Urban Morphology Generator (see `../CHARTER.md`)
**Status:** Phase 0 deliverable 1 of 4. No implementation.
**Companions:** `02-algorithm-survey.md` (algorithms), `03-mathematical-assumptions.md`
(numerical register, entries cited here as `M-…`), `04-architecture-proposal.md` (design).

This review answers the charter's research objectives discipline by discipline, then closes
with (a) universal principles, (b) civilization-specific patterns, and (c) points where the
evidence **contradicts** the charter — which, per the charter, wins.

---

## 1. Urban morphology (the discipline)

Urban morphology is an established field with its own analytic vocabulary; the generator
should *speak this vocabulary* rather than invent one.

**Conzenian town-plan analysis.** M.R.G. Conzen's study of Alnwick (Conzen 1960,
*Alnwick, Northumberland: a study in town-plan analysis*) decomposed every town plan into
three element complexes — **streets** (the street system), **plots** (the plot pattern:
parcels grouped in *plot series* along street frontages), and **buildings** (block plans) —
and showed towns are mosaics of **plan units**: internally consistent regions laid out in one
episode under one rule system, joined at **seams**. Two Conzenian processes matter directly
to a generator:

- the **burgage cycle**: a plot is granted; the frontage is built first; rear-plot buildings
  accrete over decades until a *climax* coverage; later clearance may reset it. Plot coverage
  is therefore a function of plot age, not a constant
  ([burgageplots.info](https://www.burgageplots.info/), Conzen 1960).
- **plot metamorphosis**: plots subdivide (frontage halving) and amalgamate over time, so a
  mature frontage-width distribution is *derived from* an initial regular platting plus a
  stochastic subdivision history — not sampled directly. Conzen measured Alnwick properties
  still clustering at ~28 ft and simple fractions/multiples of it centuries after platting
  ([Alnwick Civic Society](https://alnwickcivicsociety.org.uk/2020/09/11/rods-poles-and-perches/)).

**Kostof's process taxonomy.** Spiro Kostof (*The City Shaped*, 1991; *The City Assembled*,
1992) organizes urban form by generating process: "organic" accretion, the grid, the
diagram/ideal city, the grand manner, and the skyline — and stresses that most real cities
are **composites of planned instants and unplanned maturation**. Kostof explicitly warns
against the "organic = unplanned" fallacy: most medieval towns were *founded* (bastides, new
towns, plantation burghs) and then *matured* organically.

**Italian school (Caniggia/Muratori).** Process typology: building types evolve in lockstep
with plot types; base types (row house on strip plot) precede special types (palazzo,
church) which are made by plot amalgamation. Useful as the evidence basis for the
architectural-grammar stage: building footprint grammar is *conditioned on parcel shape and
age*, not free-standing.

**Space syntax (Hillier & Hanson 1984; Hillier et al. 1993).** Configuration of the street
network alone predicts pedestrian movement ("natural movement"); the syntactic measure
*integration* (a normalized closeness) correlates with observed movement, frequently with
r² in the 0.6–0.8 band in dense historic grids
([Hillier, Penn, Hanson, Grajewski, Xu 1993](https://journals.sagepub.com/doi/10.1068/b200029);
[overview](https://www.mdpi.com/2071-1050/13/6/3394)). Consequence for the generator: **land
value, commercial use, and density can be *derived* from network centrality** rather than
painted — the charter's "why would a building exist here?" has a literal computable answer.

### 1.1 Measurable characteristics by tradition

The charter lists 23 traditions. Studied individually (sources per row; quantitative values
are registered with confidence levels in `03-mathematical-assumptions.md`), they collapse
into a small number of **process families** distinguished by measurable signatures. This is
the central empirical result of the review: *traditions differ in parameters, not in kind* —
exactly the premise the charter needs to be true for one engine to serve many traditions.

Signature legend: **deg₄** share of 4-way junctions among true intersections; **DE** dead-end
share of intersections; **H_θ** street-bearing orientation entropy (low = one grid);
**court** courtyard-house share; blocks/plots as registered in `03-…`.

| # | Tradition | Family | Distinguishing measurable signature |
|---|-----------|--------|--------------------------------------|
| 1 | Medieval Europe | accretive + planned plantations | deg₄ 10–25%, DE 10–20%, H_θ high; strip plots 1:3–1:10, frontages 4–15 m (M-PAR-1/2); market as widened street or triangular green; wall circuits in rings |
| 2 | Roman | surveyed grid | deg₄ > 60%, H_θ minimal; insulae 1×1 to 1×4 actus (M-BLK-3); cardo/decumanus hierarchy; forum ~1 insula at crossing |
| 3 | Byzantine | inherited grid, organic overwrite | Roman grid signatures decaying: porticoed *plateiai* persist as spines, minor grid dissolves toward DE 20%+; churches replace fora as anchors |
| 4 | Islamic (Arab-Mediterranean core) | accretive under legal code | DE 30–50% (highest of all families), deepest street-width hierarchy ending in 1.8–2 m culs-de-sac (M-NET-8); court > 80%; suq ordered by trade adjacency to mosque |
| 5 | Renaissance expansion | geometric overlay | straight cut-throughs & star forts over medieval fabric; H_θ bimodal (two superposed systems); plazas as proportioned rooms |
| 6 | Early modern towns | densification | little new street topology; plot coverage & storey growth; burgage-cycle climax (M-BLD-6) |
| 7 | Viking | linear emporium | single shore-parallel street + perpendicular narrow plots to water; plot frontages ~5–8 m (Coppergate/Hedeby, M-PAR-7); no wall early, semicircular rampart late |
| 8 | Celtic (oppida) | enclosed dispersed | massive enclosure (murus gallicus) around *low-density* farmstead clusters; no street grid; density an order below Mediterranean towns |
| 9 | Maya | low-density agrarian | dispersed plazuela clusters 10–30 p/ha (M-DEN-4); causeways (sacbeob) radial between plaza-temple nodes; no continuous street wall |
| 10 | Aztec | planned lacustrine grid | Tenochtitlan: canal+street dual grid over chinampas; ceremonial precinct at axis crossing; grid modules set by chinampa plots |
| 11 | Inca | modular kancha grid | Ollantaytambo: 4×7 street grid; block = 2 kancha compounds; kancha = 3–4 one-room buildings (~4×6 m) around court, one gate (M-PAR-6) ([Wikipedia](https://en.wikipedia.org/wiki/Ollantaytambo)) |
| 12 | Ancient Egyptian | state orthogonal + organic tells | planned worker towns (Kahun, Deir el-Medina, Amarna WV: 70×70 m walled, 72 row-houses ~5×10 m, M-PAR-6) beside organically accreted tell towns ([Amarna WV](https://en.wikipedia.org/wiki/Workmen%27s_Village,_Amarna)) |
| 13 | Classical Greek | Hippodamian per-strigas | blocks ~35×47 m (Priene) to 35×86 m (Olynthus, 2×5 houses of ~17.2 m, M-BLK-3); equal-plot ideology; agora = void of n blocks; grid ignores slope (stepped streets) |
| 14 | Mesopotamian | organic tell | irregular blocks, DE high, courtyard houses wall-to-wall; temple/ziggurat precinct walled separately; density high, streets 1.5–3 m |
| 15 | Chinese imperial | cosmological megagrid | Chang'an: 108 walled wards (fang) 27–94 ha, avenues 25–150 m (M-BLK-3, M-NET-8); strict N-S axiality; markets as dedicated wards ([Shaanxi](https://en.shaanxi.gov.cn/as/hac/hos/201704/t20170428_1595612_wap.html)) |
| 16 | Japanese castle town (jōkamachi) | defensive class zoning | castle-centric rings: samurai quarters ringward, chōnin (trades) streets by occupation, temple belt (teramachi) at edges; deliberate T-offsets, doglegs & culs-de-sac for defense ([Jōkamachi](https://en.wikipedia.org/wiki/J%C5%8Dkamachi)) |
| 17 | African trading cities | compound accretive | Sahel (Djenné, Timbuktu): courtyard compounds, organic lanes; Swahili stone towns (Lamu): dense labyrinth, DE high; Great Zimbabwe: dry-stone enclosure rings, low-density interior |
| 18 | Indigenous North American | ceremonial / agglomerated | Cahokia: plaza-and-mound axial precinct, dispersed residential; Puebloan: single agglomerated room-block "building = town"; palisaded longhouse villages: few very large structures |
| 19 | Colonial (Iberian) | statute grid | Laws of the Indies 1573: plaza 1:1.5 ratio, ≥200×300 ft, streets from plaza mid-sides + corners, corners to the winds (M-DEN-6) ([HUD translation](https://www.huduser.gov/portal/sites/default/files/pdf/The-Laws-of-the-Indies.pdf)) |
| 20 | Frontier settlements | speculative instant grid | platted grid preceding population; occupancy gradient from landing/station; wide statute streets (1–1.5 chains) |
| 21 | Mining towns | resource-linear | ribbon along seam/valley road; T-junctions to workings; extreme growth-rate spikes, low plat discipline, later grid overlay if town persists |
| 22 | Harbour cities | shore-normal herringbone | quay-parallel spine + dense perpendicular alleys to water; warehouses = deepest plots at quay; plot frontage narrowest of any family |
| 23 | Bridge towns | convergence funnel | routes converge on bridgehead; market street = widened approach; twin nuclei on both banks with asymmetric sizes |

**Family reduction.** Rows collapse into five generative processes, each an engine *mode*
(mixable per district and per era): **(A) accretive growth** along routes (1, 3, 4, 6, 14,
17, 21, 22, 23); **(B) surveyed instant plat** (2, 12-planned, 13, 15, 19, 20, and the
planted subset of 1); **(C) modular compound repetition** (10, 11, 12, 18-Pueblo — the unit
is a walled compound, not a plot); **(D) low-density ceremonial/agrarian dispersal** (8, 9,
18-Cahokia); **(E) defensive-hierarchical zoning overlay** (5, 16 — a rule layer over A/B).
This is the evidence base for the charter's "one engine, many traditions" philosophy.

---

## 2. Archaeology

What excavation reports contribute is *measured distributions* — the register
(`03-mathematical-assumptions.md`) is largely built from them. Highlights:

- **Plot metrology is real and survives.** Burgage plots were laid out in perches (1 perch =
  16.5 ft = 5.03 m); grants of 2–3 perch frontages are documented across English and Scottish
  burghs, with the Stratford-upon-Avon foundation (1196) specifying 3.5 × 12 perches
  (~17.6 × 60.4 m) (Beresford, *New Towns of the Middle Ages*, 1967;
  [PSAS burgage survey](http://journals.socantscot.org/index.php/psas/article/download/9724/9691);
  [burgageplots.info](https://www.burgageplots.info/a-planned-approach)). Conzen's Alnwick
  measurements show century-scale persistence with subdivision into halves/quarters.
- **Row-house quanta.** Olynthus: ~17.2 m square houses, ten per 35×86 m block; Amarna
  Workmen's Village: 5×10 m tripartite row-houses; Deir el-Medina: four-room strip houses;
  Coppergate (York): long narrow fenced tenements with combined dwelling/workshop use
  ([YAT](https://her.york.gov.uk/Monument/MYO5075)). Vernacular dwellings cluster tightly
  around a culture-specific footprint module — a strong argument for sampling *house modules*
  per tradition and deriving plots from them in planned modes.
- **Intramural population density** in compact pre-industrial towns: ~100–200 persons/ha
  (medieval European average ≈150 p/ha with core/periphery gradient ≈200→75; Islamic cities
  conventionally 150, garden cities 75)
  ([Cesaretti et al. 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC5051806/); Chandler-based
  conventions). Maya low-density urbanism sits an order of magnitude lower
  ([Isendahl & Smith 2013](https://www.sciencedirect.com/science/article/abs/pii/S0264275112001382)).
- **Public-building placement follows rules, not chance**: forum at cardo/decumanus crossing;
  mosque at the network's most integrated core with suq gradient by trade cleanliness; parish
  churches spaced by served population; temples on axis (China, Mesoamerica) or acropolis
  (Greece). These become *anchor placement rules* (§ 6 of the architecture proposal).

---

## 3. Historical cartography

Cadastral and survey maps (Napoleonic cadastres, Ordnance Survey town plans at 1:500,
Islamic waqf surveys, Japanese castle-town maps, Sanborn-type insurance plans) show
recurring geometric structures the output must reproduce:

1. **Plot series**: runs of quasi-parallel boundaries perpendicular to a frontage, drifting
   in orientation as the street curves — the visual signature of strip subdivision.
2. **Seams**: discordant boundary directions where two plan units meet; often preserved as
   back lanes, kinks, or slivers.
3. **Back-lane doubling**: service lanes parallel to market streets at plot-depth distance.
4. **Encroachment**: market squares nibbled by permanent stalls becoming buildings (island
   blocks in squares); streets narrowing where fronts advanced.
5. **Fossilized features**: town walls surviving as ring streets after demolition; field
   boundaries (ridge-and-furrow strips, centuriation) captured as street alignments when the
   town expands over them — i.e., **the pre-urban cadastre constrains later streets**.

Item 5 is architecturally important: the generator needs a faint *rural parcel fabric* around
the town so growth has something to fossilize; this is cheap (radial-strip fields around
routes) and produces the single most convincing "grown" tell known from map evidence.

---

## 4. Historical geography (site and situation)

Consistent, generator-usable placement factors (each becomes a term in the site/anchor scoring
described in the architecture proposal):

- **Water first**: reliable potable water (river, springs, wells) bounds pre-modern town
  location; riverside towns align main streets parallel to the river with perpendicular
  water lanes.
- **Crossing points**: fords/bridgeheads concentrate routes (bridge towns above); the first
  bridgeable point upstream from a river mouth is a classic city site.
- **Break-of-bulk**: harbours, portages, heads of navigation, mountain-pass feet — places
  where cargo changes mode — generate markets and warehousing.
- **Defense**: hill spurs, meander cores, islands; defensive sites trade access for security
  and show characteristic deformation (streets contour-parallel, switchbacks).
- **Flood avoidance**: settlement hugs the terrace edge above the floodplain; the floodplain
  stays as meadow/garden — a sharp, mappable land-use boundary.
- **Aspect & agriculture**: villages prefer sunny, drained slopes near workable soils.

The charter forbids terrain *simulation*; these factors reduce to a small parametric **site
model** (water polylines, floodable band, slope proxy, route entry bearings) — inputs, not
simulation (see architecture proposal § 4).

---

## 5. Transport geography

- **Desire paths / trail systems**: Helbing, Keltsch & Molnár
  ([Nature 388:47, 1997](https://pubmed.ncbi.nlm.nih.gov/9214501/);
  [active-walker model](https://arxiv.org/abs/cond-mat/9806097)) show trail networks emerge
  from a reinforcement loop (use → comfort → more use) and converge to compromises between
  directness and existing-trail attraction. This justifies generating pre-urban routes as
  *cost-field least-cost paths with reinforcement*, not straight lines.
- **Walking cost**: Tobler's hiking function gives walking speed vs slope (max ~6 km/h on
  slight downhill, halving around ±10–15% grades) — the standard slope-aware cost kernel
  (M-REG-5).
- **Travel budgets**: Marchetti's constant (~1 h/day round-trip budget; Marchetti 1994)
  caps the practical radius of a walking city at roughly 2–2.5 km — matching observed
  pre-industrial city extents and Clark-gradient steepness (M-REG-4, M-DEN-3).
- **Central-place theory**: Christaller (1933) — service centers space regularly; southern
  Germany system with market-town spacing ~12 km scaling by √3 up to 36/62/108 km
  ([overview](https://www.britannica.com/money/central-place-theory)). Empirical tests
  (Dacey 1962, via Clark–Evans nearest-neighbour R) find only weak regularity at low tiers
  (M-REG-1/2). For a single-town PoC this sets *context* (where routes go, how big the town
  plausibly is), not geometry.
- **Gravity models**: interaction ∝ P₁P₂/d² — background justification for route importance
  weights on the site model's external destinations.
- **Network centrality**: betweenness ("choice") identifies through-movement streets =
  commercial spines; closeness/integration identifies centers. Strano et al.
  ([Sci. Rep. 2:296, 2012](https://www.nature.com/articles/srep00296)) show empirically that
  the **high-centrality backbone is stable over centuries** while densification fills around
  it — a hard invariant for the growth engine (never rewrite the backbone; M-GRW-3), and
  that growth = **densification + exploration** with new segments attaching to the existing
  network at near-right angles (M-NET-3, M-GRW-1).
- **Bridge placement**: minimize crossing width/depth subject to approach grades; bridges are
  singular funnels — expect market widening at the bridgehead and asymmetric twin nuclei.

---

## 6. GIS

Established GIS practice supplies the *correctness vocabulary* the tool must obey (detailed
choices in the algorithm survey §§ 10–13 and architecture proposal § 5):

- **Planar topology**: the street network must be an explicit planar graph (nodes at every
  intersection); blocks are its faces. Arc-node + face model ≈ a DCEL/half-edge structure.
- **Polygon validity** (OGC simple-features rules): no self-intersection, closed rings,
  consistent winding — required for downstream offsetting/subdivision to be robust.
- **Snapping & tolerance**: all geometry on a fixed-precision grid (integer millimeters) with
  a single global snap tolerance; "almost touching" is the primary source of topology bugs.
- **Buffering/offsetting**: streets get carriageway width by buffering centerlines; blocks
  are faces shrunk by half street widths (miter-limited offset).
- **Spatial indexing**: uniform grid buckets suffice at PoC scale (≤ ~10⁴ segments).
- **Topology validation as tests**: area conservation (Σ parcels ≈ block), no orphan parcels
  without frontage (unless flagged backland), no overlapping footprints — machine-checkable
  invariants (architecture proposal § 8).

---

## 7. Computational geometry

Full per-algorithm survey with verdicts in `02-algorithm-survey.md`; conclusions:

- **DCEL face extraction** turns the road graph into blocks — the only structural choice.
- **Straight skeleton** (Aichholzer & Aurenhammer 1996; Felkel & Obdržálek 1998) is the
  evidence-backed tool for two jobs: strip-parcel subdivision of irregular blocks (α-strips
  along frontage, per Vanegas et al. 2012) and hip/gable **roof generation** from footprints
  (Laycock & Day 2003; [weighted variants](https://www.sciencedirect.com/science/article/pii/S0010448517301240)).
- **OBB recursive subdivision** is the planned-mode parcel splitter (Vanegas et al. 2012).
- **Voronoi/Delaunay**: supporting roles (ward partitions around anchors, dispersed-mode
  compound catchments, medial-axis approximation), not the primary block generator — real
  blocks come from streets, not from seeds.
- **Polygon clipping/offsetting**: one robust integer-coordinate Boolean/offset kernel
  (Clipper-style, Vatti/Martinez family) is the single most load-bearing geometric component.

---

## 8. Mathematics

Models with direct empirical support for historical urban fabrics:

- **Street networks are planar graphs with tight statistical regularities**: mean node degree
  ~2.5–3.2; organic patterns are T-junction dominated; meshedness α ≈ 0.09–0.26 across 20
  world cities (Cardillo et al. 2006; Buhl et al. 2006) (M-NET-1/5).
- **Block-area distribution**: P(A) ~ A^(−2) tail, universal across 131 cities; cities are
  distinguished by the *conditional shape distribution given area* — the "fingerprint"
  ([Louf & Barthélemy 2014](https://arxiv.org/abs/1410.2094)). This gives the single
  sharpest acceptance test for generated fabrics (M-BLK-1/2).
- **Street-bearing entropy** separates planned from organic fabrics quantitatively
  ([Boeing 2019](https://arxiv.org/abs/1808.00600)) (M-NET-7).
- **Local-optimization growth models reproduce observed patterns**: connecting new centers to
  the existing network by locally minimal cost yields realistic patterns and the empirical
  exponents ([Barthélemy & Flammini 2008, PRL 100:138702](https://arxiv.org/abs/0708.4360));
  with the Strano results this is the strongest justification for the chosen growth engine.
- **Negative-exponential density gradient**: ρ(r) = ρ₀e^(−br) (Clark 1951) — with walking-city
  b set by the Marchetti radius (M-DEN-3).
- **Fractal geometry**: built-up areas show D ≈ 1.4–1.9 (Batty & Longley, *Fractal Cities*,
  1994); useful as a soft acceptance metric for the growth frontier, not as a generator.
- **Distributions**: frontages/areas are right-skewed — log-normal (multiplicative
  subdivision naturally produces this; consistent with subdivision history §1) with
  power-law block tails; use truncated log-normals in the register rather than means
  (charter requirement).
- **Stochastic geometry caution**: Poisson/random placement fails every observed statistic —
  randomness enters only through *choice among constrained candidates*, never free placement.

---

## 9. Procedural generation (prior art)

Survey with verdicts per algorithm in `02-algorithm-survey.md`. Key precedents:

- **Parish & Müller 2001** ([CityEngine lineage](https://cgl.ethz.ch/Downloads/Publications/Papers/2001/p_Par01.pdf)):
  roads as a growth frontier with **global goals + local constraints** (snap to nearby node,
  extend to meet, prune illegal), then blocks → lots → buildings. The mechanism (priority
  queue + legalization rules) is the right skeleton; the "L-system" formalism is incidental
  (acknowledged in later literature, e.g. [Kelly & McCabe 2006](https://arrow.tudublin.ie/itbj/vol7/iss2/5/)).
- **Chen, Esch, Wonka, Müller, Zhang 2008** ([tensor-field streets](https://www.sci.utah.edu/~chengu/street_sig08/street_sig08.pdf)):
  streets as streamlines of an editable tensor field — the clean mechanism for *planned*
  grids aligned to water/slope/axis constraints.
- **Vanegas et al. 2012** ([parcels](https://www.cs.purdue.edu/cgvlab/papers/aliaga/eg2012.pdf)):
  the two canonical parcel subdivision modes (strip/skeleton vs OBB recursion) — directly
  matches the historical dichotomy (burgage strips vs surveyed quarters).
- **Emilien et al. 2012** ([villages](https://inria.hal.science/hal-00694525)): interest-map
  scored seed placement with road↔settlement feedback and open shape grammars — the closest
  academic precedent to this project's growth mode at village scale.
- **Müller et al. 2006 / Wonka et al. 2003** (CGA shape grammar / split grammars): the
  architectural-grammar formalism; we need only its footprint/mass subset for top-down SVG.
- **Games**: *Manor Lords* implements literal burgage-plot strips along player roads
  (strip subdivision live in a shipped game); *Dwarf Fortress* & *Songs of Syx* demonstrate
  layered site history; *Townscaper* shows irregular-quad relaxation aesthetics; **Watabou's
  Medieval Fantasy City Generator** ([itch.io](https://watabou.itch.io/medieval-fantasy-city-generator))
  is the reference browser artifact — visually strong, but ward-first (Voronoi-partition
  then decorate), i.e., the *template side of the charter's dichotomy*; its known failure
  modes (unconvincing street topology, uniform wards) are precisely what a growth-first
  engine must beat.
- **Archaeological reconstruction practice**: CityEngine CGA used for Rome Reborn (Dylla et
  al. 2008) and Pompeii — procedural methods are already accepted in archaeology when rules
  are sourced; strengthens the "rules from evidence" methodology.
- **Measurement tooling**: OSMnx ([Boeing](https://geoffboeing.com/publications/urban-spatial-order-entropy/))
  and momepy define the *metrics vocabulary* (segment length, entropy, block stats) the
  validation harness should mirror.

---

## 10. Universal principles vs civilization-specific patterns

**Universal (engine core, tradition-independent):**

1. Streets precede plots; plots precede buildings (documented in every family; also the
   charter pipeline order).
2. Access is conserved: every plot reaches the network; every building reaches its plot
   frontage. (The rare exceptions — backland infill — are themselves rule-governed.)
3. Growth = stable backbone + densification + frontier exploration (Strano; Conzen).
4. New connections locally minimize cost and attach near-perpendicular (Barthélemy-Flammini;
   Strano).
5. Plot fabrics arise from *series platting + subdivision history*, giving log-normal widths
   and P(A)~A^(−2) block tails (Conzen; Louf-Barthélemy).
6. Density and land value decay from centers of accessibility (Clark; space syntax).
7. Institutions anchor and deform the fabric (forum/mosque/church/castle/market rules).
8. Walls quantize growth into episodes; gates pin the primary road frame (ubiquitous in
   walled families).
9. Prior fabrics fossilize: routes, field boundaries and walls constrain successors (§3).

**Civilization-specific (parameter packs, not code):** orientation regime (cardinal
cosmology vs terrain-following vs solar), plot module and aspect, courtyard share, dead-end
tolerance (privacy law), street-width hierarchy and its legal minima, wall/gate policy,
anchor types and their placement rules, plaza geometry, planned-vs-accretive mix per era,
low-density dispersal option. The measured values live in `03-mathematical-assumptions.md`;
the architecture proposal § 7 defines the "tradition pack" schema that carries them.

---

## 11. Where the evidence contradicts the charter (research wins)

1. **"Grown, not drawn" is a false dichotomy for most historical cities.** Bastides, burghs,
   Greek colonies, Roman coloniae, Chinese capitals, Indies towns — enormous swaths of
   historical fabric were *drawn in an afternoon* and then grew for centuries. The correct
   objective is: **planned frames and organic growth are both processes in one time-stepped
   engine, and "looks grown" comes from maturation applied to either.** The acceptance
   question becomes measurable (match the statistical signatures of historical fabrics)
   rather than ideological.
2. **The charter's linear pipeline needs anchors and feedback.** Markets, gates, bridges,
   and temples shape *primary* roads (evidence §§ 2, 5), so anchor seeding must precede road
   growth, and the pipeline must iterate per growth epoch (roads→plots→buildings each
   epoch), not run once. Stage modularity is preserved; the driver loops.
3. **Parcels must be generated in series, not individually.** Cadastral evidence (§3) shows
   runs of parallel boundaries from batch platting; per-parcel independent generation
   produces visibly wrong fabrics. This constrains the parcel module's contract (operate on
   frontage runs).
4. **Two of the charter's candidate algorithms fail the evidence test for core use** —
   Wave Function Collapse and reaction-diffusion (reasons in `02-algorithm-survey.md`); they
   are documented, scored, and excluded from the core rather than silently dropped.
5. **"No terrain generation" needs one refinement**: a parametric *site model* (water lines,
   flood band, slope proxy, route bearings) is indispensable (§4) and is treated as input
   context, not terrain simulation.

---

## 12. Primary sources cited

Books (standard references, no URL): Conzen 1960; Kostof 1991/1992; Hillier & Hanson 1984;
Beresford 1967; Batty & Longley 1994; Christaller 1933; Hakim, *Arabic-Islamic Cities*, 1986;
Marchetti 1994 (*Technol. Forecast. Soc. Change* 47); Clark 1951 (*J. R. Stat. Soc. A* 114).

Online/verified:
[Parish & Müller 2001](https://cgl.ethz.ch/Downloads/Publications/Papers/2001/p_Par01.pdf) ·
[Chen et al. 2008](https://www.sci.utah.edu/~chengu/street_sig08/street_sig08.pdf) ·
[Vanegas et al. 2012](https://www.cs.purdue.edu/cgvlab/papers/aliaga/eg2012.pdf) ·
[Emilien et al. 2012](https://inria.hal.science/hal-00694525) ·
[Kelly & McCabe 2006](https://arrow.tudublin.ie/itbj/vol7/iss2/5/) ·
[Louf & Barthélemy 2014](https://arxiv.org/abs/1410.2094) ·
[Strano et al. 2012](https://www.nature.com/articles/srep00296) ·
[Barthélemy & Flammini 2008](https://arxiv.org/abs/0708.4360) ·
[Boeing 2019](https://arxiv.org/abs/1808.00600) ·
[Hillier et al. 1993](https://journals.sagepub.com/doi/10.1068/b200029) ·
[Helbing et al. 1997](https://pubmed.ncbi.nlm.nih.gov/9214501/) ·
[Cesaretti et al. 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC5051806/) ·
[Isendahl & Smith 2013](https://www.sciencedirect.com/science/article/abs/pii/S0264275112001382) ·
[Laws of the Indies (HUD transl.)](https://www.huduser.gov/portal/sites/default/files/pdf/The-Laws-of-the-Indies.pdf) ·
[PSAS Scottish burgage survey](http://journals.socantscot.org/index.php/psas/article/download/9724/9691) ·
[Alnwick Civic Society on perches](https://alnwickcivicsociety.org.uk/2020/09/11/rods-poles-and-perches/) ·
[burgageplots.info](https://www.burgageplots.info/) ·
[Coppergate HER record](https://her.york.gov.uk/Monument/MYO5075) ·
[Chang'an overview](https://en.shaanxi.gov.cn/as/hac/hos/201704/t20170428_1595612_wap.html) ·
[Jōkamachi](https://en.wikipedia.org/wiki/J%C5%8Dkamachi) ·
[Ollantaytambo](https://en.wikipedia.org/wiki/Ollantaytambo) ·
[Amarna Workmen's Village](https://en.wikipedia.org/wiki/Workmen%27s_Village,_Amarna) ·
[Weighted straight skeletons for roofs](https://www.sciencedirect.com/science/article/pii/S0010448517301240) ·
[Central place theory](https://www.britannica.com/money/central-place-theory) ·
[Clark–Evans statistic](https://onlinelibrary.wiley.com/doi/10.1111/gean.12284) ·
[Medieval demography (Leiden)](https://www.universiteitleiden.nl/en/research/research-projects/archaeology/ranking-the-towns) ·
[Watabou MFCG](https://watabou.itch.io/medieval-fantasy-city-generator)
