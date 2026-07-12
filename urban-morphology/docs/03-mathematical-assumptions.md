# Phase 0 — Mathematical Assumptions Register

**Project:** Procedural Urban Morphology Generator (see `../CHARTER.md`)
**Status:** Phase 0 deliverable 3 of 4. No implementation.

This is the project's single source of numerical truth. **Implementation code must not
contain a magic number that isn't keyed here.** Each entry: value, units, source,
confidence, justification (charter requirement). Distributions are given instead of
averages wherever the evidence supports them.

**Confidence scale**
- **H** — published measurement/statute, or replicated across multiple independent studies.
- **M** — well-attested in the literature but ranges vary by site; usable, expect tuning.
- **L** — plausible inference or convention; flagged for verification during Phases 1–2
  validation. L-entries are permitted in code only with a `TODO(M-…)` marker.

**Distribution notation** — `LogN(median, σln)` log-normal by median and log-σ;
`U(a,b)` uniform; `Pow(τ, min, max)` truncated power law with density ∝ x^−τ;
values in brackets `[a–b]` are acceptance ranges, not samplers.

---

## A. Regional context & routes (M-REG)

| ID | Quantity | Value | Units | Source | Conf. | Justification |
|----|----------|-------|-------|--------|-------|---------------|
| M-REG-1 | Market-town spacing, lowest orders | 7–12 (village→market tier); higher tiers ×√3: 21, 36, 62, 108 | km | Christaller 1933; [overview](https://www.britannica.com/money/central-place-theory) | M | Sets plausible external-route destinations & town size class; only the lowest tier affects a single-town scene. |
| M-REG-2 | Clark–Evans R for settlement dispersal | dispersed compounds ≥ 1.3; market towns ≈ 1.0–1.4 (weak regularity, Dacey 1962) | – (R∈[0, 2.15]) | [Clark–Evans lineage](https://onlinelibrary.wiley.com/doi/10.1111/gean.12284) | M | Acceptance range for low-density modes; R≈1 (random) is a *failure* for planned dispersal, R→2.15 a failure for organic. |
| M-REG-3 | City-size rank distribution | Zipf exponent ≈ 1 | – | Auerbach 1913; Zipf 1949 | H | Context only (region size ↔ town rank); not used in geometry. |
| M-REG-4 | Walking-city radius cap | ≤ 2.0–2.5 (practical), built core mostly ≤ 1.0 | km | Marchetti 1994 (~1 h/day budget); walking 4–5 km/h | H | Hard sanity bound on generated extent; drives density gradient M-DEN-3. |
| M-REG-5 | Walking speed vs slope (route cost kernel) | W = 6·exp(−3.5·|S+0.05|) | km/h; S = grade (dh/dx) | Tobler 1993 hiking function | H | Standard slope-aware cost for least-cost primary routes; asymmetric optimum at −5% grade. |
| M-REG-6 | River-crossing route premium | crossing cost ≈ ford depth/width penalty; bridges collapse it to ~1 street-segment cost | – | transport-geography consensus (lit. review §5) | M | Why routes funnel at bridges; exact penalty calibrated in Phase 1 against funnel formation. |

## B. Street network (M-NET)

| ID | Quantity | Value | Units | Source | Conf. | Justification |
|----|----------|-------|-------|--------|-------|---------------|
| M-NET-1 | Node degree mix, organic fabrics | mean degree 2.5–3.2; of true intersections: 3-way 70–90%, 4-way 10–25%. Planned grids: 4-way > 60% | – | [Boeing 2019](https://arxiv.org/abs/1808.00600); Cardillo et al. 2006; Buhl et al. 2006 | H | The sharpest planned/organic discriminator; growth rules must *emerge* into these bands (validation, not prescription). |
| M-NET-2 | Dead-end share of nodes | planned cores < 5%; European organic 10–20%; Islamic-law fabrics 30–50%; jōkamachi elevated (deliberate) | % | Boeing 2019 (moderns); Hakim 1986 qualitative; morphometric studies of Cairo/Tunis | M (H for ordering, M for Islamic band) | Privacy law (fina, darb) actively produces culs-de-sac; band to be sharpened against digitized historic plans in Phase 2. |
| M-NET-3 | New-segment attachment angle | peaked at 90°, σ ≈ 15° | degrees | [Strano et al. 2012](https://www.nature.com/articles/srep00296) | H | Empirical growth law; candidate scoring penalizes acute attachments. |
| M-NET-4 | Street segment length (node-to-node) | organic cores LogN(45, 0.6), bulk 20–120; planned plats: block modulus (see M-BLK-3) | m | OSMnx-style censuses of historic cores; Boeing 2019 medians | M | Drives frontier step length; medieval cores are short-segment; acceptance by KS against LogN. |
| M-NET-5 | Meshedness α = (E−V+1)/(2V−5) | 0.09–0.26 organic; → 0.35+ strong grids | – | Buhl et al. 2006; Cardillo et al. 2006 | H | Loop-formation target: growth must close loops (not stay a tree, α≈0) without gridding everything. |
| M-NET-6 | Circuity (network/Euclid dist.) | 1.1–1.6 sampled-pair average; per-segment chord ratio ≤ ~1.2 | – | Boeing 2019; route-choice literature | M | Bounds curvature injection: bent enough to read organic, never maze-like. |
| M-NET-7 | Orientation entropy H_θ (36 bins) | single grid → ~1.6–2.7 bits; organic → ~3.2–3.58 (max ln₂36 ≈ 5.17 uniform over 360°, 3.58 over 180° folding) | bits | [Boeing 2019](https://arxiv.org/abs/1808.00600) | M (H for discrimination power) | Per-tradition acceptance bands; folded bearings (0–180°). |
| M-NET-8 | Street widths by class & tradition | see width table below | m | statutes & excavation (below) | H (statutes) / M (vernacular) | Widths are the most legible tradition signal in plan. |
| M-NET-9 | Wall & gates | gates 2–6 for towns ≤ ~5k pop; wall hugs built extent + 10–25% growth reserve; gate positions = primary-road crossings | count, % | walled-town corpus (Kostof 1992; bastide/burgh plans) | M | Gates pin the road frame (M-GRW-3); reserve explains intramural gardens on old maps. |
| M-NET-10 | Movement ∝ centrality | integration/closeness vs movement r² ≈ 0.6–0.8 in dense grids | – | [Hillier et al. 1993](https://journals.sagepub.com/doi/10.1068/b200029) | H | License to *derive* commercial frontage & density from computed centrality. |

**M-NET-8 width table** (carriageway/clear width, m):

| Tradition | Main/market | Standard street | Lane | Cul-de-sac / min | Source | Conf. |
|---|---|---|---|---|---|---|
| Medieval Italian statute (Siena Costituto) | ~5.8 (10 braccia) | ~3.5 (6 braccia) | 2–3 | – | [Designing Buildings history](https://www.designingbuildings.co.uk/wiki/The%20history%20of%20the%20dimensions%20and%20design%20of%20roads,%20streets%20and%20carriageways) | H |
| Medieval NW Europe (vernacular) | 6–10 market, tapering | 3–6 | 1.5–3 | – | town-plan corpus (Conzen school) | M |
| Islamic law minimum | – | ≥ 3.23–3.5 (7 cubits, two laden camels) | – | ~1.8–2 (4 cubits, darb) | Hakim 1986 | H |
| Roman | 6–12 (decumanus max.); Twelve Tables min 2.45 straight / 4.9 curves | 4–6 | 2.4–4.5 (Pompeii) | – | Twelve Tables; Pompeii/Timgad surveys ([Timgad](https://socks-studio.com/2017/06/21/a-perfect-grid-the-roman-town-of-timgad-the-african-pompeii/)) | H |
| Greek (Hippodamian) | 5.6–7.4 plateiai | 3–4.5 stenopoi | – | – | Priene/Olynthus reports ([survey](https://mitp-arch.mitpress.mit.edu/pub/jgsnbvk7)) | M |
| Chang'an (Tang) | 100–150 axial avenues | 20–25 minimum grid | intra-ward lanes ~2–3 | – | [Chang'an](https://en.shaanxi.gov.cn/as/hac/hos/201704/t20170428_1595612_wap.html) | H (avenues) / L (ward lanes) |
| Laws of the Indies | plaza-fed principal streets "wide" in cold, "narrow" in hot climates; practice ~10–14 varas (8.4–11.7 m) | ~8–10 | – | – | [HUD transl.](https://www.huduser.gov/portal/sites/default/files/pdf/The-Laws-of-the-Indies.pdf), ord. 115–117 | H (rule) / M (m values) |

## C. Blocks (M-BLK)

| ID | Quantity | Value | Units | Source | Conf. | Justification |
|----|----------|-------|-------|--------|-------|---------------|
| M-BLK-1 | Block-area distribution | Pow(τ≈2) tail over ~10² –10⁵; organic town bulk 10³–2·10⁴ | m² | [Louf & Barthélemy 2014](https://arxiv.org/abs/1410.2094) | H | Universal fingerprint; primary acceptance statistic. |
| M-BLK-2 | Block shape factor Φ = A/A_circumcircle | organic: broad, mode ~0.4–0.6; grids: tight mode ~0.5–0.7 at fixed aspect | – | Louf & Barthélemy 2014 | M | Conditional Φ|A histogram = city fingerprint; per-tradition bands calibrated in Phase 2. |
| M-BLK-3 | Planned block moduli | Timgad 21×21 (70 Rft); Pompeii 35–45 × 80–110; Carthage 35.3×141 (1×4 actus, actus = 35.5 m); Olynthus 35.4×86.3 (2×5 houses); Priene ~35.4×47.2; Chang'an fang 500–1000 per side (27–94 ha); Kyoto chō ~120×120 | m | [Timgad](https://socks-studio.com/2017/06/21/a-perfect-grid-the-roman-town-of-timgad-the-african-pompeii/); [Roman planning](https://mitp-arch.mitpress.mit.edu/pub/s1g1tf3w/release/1); [Olynthus](https://mitp-arch.mitpress.mit.edu/pub/jgsnbvk7); [Chang'an](https://en.shaanxi.gov.cn/as/hac/hos/201704/t20170428_1595612_wap.html) | H (excavated) / M (Kyoto) | Planned-mode plats sample from the tradition's documented modulus, jittered ≤ 2% (survey error). |
| M-BLK-4 | Block depth vs plot depth | accretive block depth ≈ 2 × plot depth (+ optional back lane 1.5–3 m) | m | cadastral corpus (lit. review §3) | M | Back-to-back strip plots define block depth; deeper blocks spawn backland infill. |

## D. Parcels (M-PAR)

| ID | Quantity | Value | Units | Source | Conf. | Justification |
|----|----------|-------|-------|--------|-------|---------------|
| M-PAR-1 | Burgage frontage | initial grants 2–3 perches = 10.1–15.1 m (1 perch = 5.03 m); mature fabric LogN(6.5, 0.45), bulk 3.3–15; Alnwick mode ≈ 8.5 m (28 ft) & fractions | m | Beresford 1967; [PSAS burgh survey](http://journals.socantscot.org/index.php/psas/article/download/9724/9691); [Alnwick perches](https://alnwickcivicsociety.org.uk/2020/09/11/rods-poles-and-perches/) | H (grants) / M (mature LogN params) | Mature widths are *generated* by grant + subdivision history (halves/quarters, p_split per epoch ≈ 0.1–0.2), not sampled — reproduces observed fraction-clustering. |
| M-PAR-2 | Burgage depth & aspect | documented grant: 3.5×12 perches ≈ 17.6×60.4 (Stratford 1196); range 40–120 deep; aspect 1:3–1:10 | m | Beresford 1967 | H (Stratford) / M (range) | Strip depth = block half-depth; ratio drives the visual "comb" signature. |
| M-PAR-3 | Parcel area, compact organic towns | LogN(300, 0.7), bulk 80–1500 | m² | derived: M-PAR-1 × M-PAR-2; consistent w/ cadastral samples | M | Derived, so marked M; validated against digitized cadastres in Phase 2. |
| M-PAR-4 | Frontage orientation | > 80% of street-fronting parcels have long axis within 15° of frontage normal | %, degrees | cadastral corpus (lit. review §3) | M | Series-platting contract; violation = template-flavoured output. |
| M-PAR-5 | Ground coverage (GSI) by ring | core 0.5–0.7; mid 0.35–0.55; edge 0.15–0.35; increases with plot age (burgage cycle) | – | Berghauser Pont & Haupt, *Spacematrix* 2010 (historic cores); Conzen 1960 | M | Coverage is f(centrality, age) — never a constant. |
| M-PAR-6 | Excavated house/compound modules | Olynthus house 17.2×17.2 (≈295 m²); Amarna WV row-house 5×10; Deir el-Medina strip house ~4–5 × 15–20; Inca kancha unit bldgs ~4×6, 3–4 per court; Chinese siheyuan bay (jian) ~3.3–3.6 wide | m | excavation reports ([Amarna](https://en.wikipedia.org/wiki/Workmen%27s_Village,_Amarna); [Ollantaytambo](https://en.wikipedia.org/wiki/Ollantaytambo); Olynthus via [survey](https://mitp-arch.mitpress.mit.edu/pub/jgsnbvk7)) | H | Planned modes generate plots from house modules (bottom-up), accretive modes generate houses from plots (top-down). |
| M-PAR-7 | Viking waterfront plots | long narrow fenced tenements, frontage ≈ 5–8, running back from street/shore | m | Coppergate excavations ([YAT/HER](https://her.york.gov.uk/Monument/MYO5075)); Hedeby plot fences | M (frontage numbers) / H (pattern) | Emporium mode: single spine, shore-normal strips. |
| M-PAR-8 | Backland access rule | parcel without street frontage is invalid unless (a) reached by ≤ 1.8–2 m access way, or (b) flagged backland (rear of burgage cycle) | m | Hakim 1986 (darb min); Conzen 1960 | H (rule) / M (threshold) | Topology validation invariant; generates the alley/court texture of mature fabrics. |

## E. Buildings (M-BLD)

| ID | Quantity | Value | Units | Source | Conf. | Justification |
|----|----------|-------|-------|--------|-------|---------------|
| M-BLD-1 | Setback on commercial frontage | 0 (build-to line); residential-only traditions may hold 1–3 | m | universal in compact traditions (Kostof 1992) | H | Zero-setback frontages are why blocks read as solid ribbons on historic maps. |
| M-BLD-2 | House footprint depth (row types) | 8–15 main range; total built depth grows with age via rear wings | m | vernacular corpus; Caniggia types | M | Main-range depth bounded by roof span (timber ~6–8 m clear) → deep buildings are L/U compositions, not solid slabs. |
| M-BLD-3 | Courtyard-house share | Islamic/Mesopotamian/Chinese/Inca/Greek-oikos: 70–95%; NW-European row fabric: < 20% | % | Hakim 1986; excavation corpus (M-PAR-6) | M (H for ordering) | The single strongest architectural tradition discriminator in top-down view. |
| M-BLD-4 | Orientation regime | street-aligned (accretive); cardinal ±3° (Chinese imperial, Kahun); 15.5° E of N (Teotihuacan); solar-quadrant variants | degrees | [Teotihuacan alignment](https://digitalcommons.usf.edu/kip_articles/8240/); Chang'an; Kahun plans | H | Orientation is cosmology in planned modes and pragmatism in accretive modes — must be a per-tradition enum, not a float to tune. |
| M-BLD-5 | Party-wall vs gap | row fabrics: party walls (gap 0); dispersed/compound: gaps ≥ 0.6–1 (eaves + fire path) | m | vernacular building codes (e.g., medieval fire ordinances) | M | Controls whether block frontage renders as continuous ribbon or beaded row. |
| M-BLD-6 | Burgage-cycle coverage trajectory | frontage range first; rear coverage +5–10 %/generation to climax ~70–85% of plot, then possible clearance | %/epoch | Conzen 1960 ([burgage cycle](https://www.burgageplots.info/)) | M | Age-dependent infill = the "grown" look; climax then clearance gives believable variety between neighbouring plots. |
| M-BLD-7 | Roof geometry | ridge = straight skeleton of footprint; gable vs hip per tradition; eaves overhang 0.3–0.8 | m | Laycock & Day 2003; [weighted skeletons](https://www.sciencedirect.com/science/article/pii/S0010448517301240) | H (method) | Method choice, registered so the renderer stays free of invented geometry. |

## F. Density, districts, public space (M-DEN)

| ID | Quantity | Value | Units | Source | Conf. | Justification |
|----|----------|-------|-------|--------|-------|---------------|
| M-DEN-1 | Intramural population density | compact pre-industrial: 100–200 (typ. ≈150); core→edge ≈ 200→75; Islamic convention 150 (75 garden cities) | persons/ha | [Cesaretti et al. 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC5051806/); Chandler conventions | H (band) | Converts target population → built extent; the top-level "how big is this town" control. |
| M-DEN-2 | Household size → dwellings | 4.5–6 persons/household → 20–40 dwellings/ha | –, dwellings/ha | pre-industrial demography (Leiden ranking-the-towns; Laslett) | M | Demand model: population increment → dwelling count per epoch. |
| M-DEN-3 | Density gradient | ρ(r) = ρ₀·e^(−br); b such that ρ(R_wall)/ρ₀ ≈ 0.4–0.6, R from M-REG-4/M-DEN-1 | 1/km | Clark 1951 (form); parameters derived | H (form) / M (b) | Walking-city gradients are steep; b is derived, not free. |
| M-DEN-4 | Low-density agrarian mode | 10–30 persons/ha; residential clusters (plazuelas) of 2–6 structures; cluster spacing ~50–150 m | persons/ha, m | [Isendahl & Smith 2013](https://www.sciencedirect.com/science/article/abs/pii/S0264275112001382); Maya demography corpus | M (L for cluster spacing) | Enables Maya/Celtic/Cahokia family; spacing flagged for Phase 2 verification. |
| M-DEN-5 | Occupational clustering | same-trade runs of 3–10 shops on named streets; noxious trades (tanning, kilns) at water/edge; clean trades adjacent to temple/mosque/market | count | suq ordering (Hakim 1986); jōkamachi trade districts ([Jōkamachi](https://en.wikipedia.org/wiki/J%C5%8Dkamachi)); European guild streets | M | District stage allocates trades by adjacency rules, not paint. |
| M-DEN-6 | Plaza dimensions | Laws of the Indies: ratio 1:1.5, min 61×91 (200×300 ft), recommended 122×183; European market places typically 0.3–1.5 ha, often widened-street form; Greek agora ≈ 1–2 blocks void | m, ha | [HUD transl.](https://www.huduser.gov/portal/sites/default/files/pdf/The-Laws-of-the-Indies.pdf) ord. 112–113; market-town corpus | H (Indies) / M (European band) | Plazas are subtractive (blocks withheld) in planned modes, additive (street widening) in accretive modes. |
| M-DEN-7 | Wells/fountains | ~1 public water point per 200–400 residents; placed in squares/junction bulges | count | L — convention from municipal-water histories | L | Placeholder pending a quantified source; drives detail-object stage; TODO(M-DEN-7). |
| M-DEN-8 | Religious-site service size | parish ~200–800 households (medieval Europe); mosque within 300–500 m walk in Islamic fabric | households, m | parish-formation literature; Friday-mosque spacing studies | L/M | Anchor spawn rule per population increment; refine in Phase 2. |

## H. Fortification (M-FOR)

Bastioned fortification is an optional, later fortification epoch (the *trace italienne*),
distinct from the medieval curtain wall (M-NET-9). The curtain wall itself is refined here to
follow the water's edge.

| ID | Quantity | Value | Units | Source | Conf. | Justification |
|----|----------|-------|-------|--------|-------|---------------|
| M-FOR-1 | Bastion form | angled bastion: two faces + two flanks, salient projecting ~34–42 m beyond the curtain, flanks set back ~18 m and raised ~13 m | m | [Bastion fort (Wikipedia)](https://en.wikipedia.org/wiki/Bastion_fort); Vauban's magistral geometry ([Nexus NJ](https://link.springer.com/article/10.1007/s00004-014-0205-9)) | H (form) / M (our metres) | Faces and flanks sweep the adjacent curtains with flanking fire, eliminating the dead ground round-towers left; the arrowhead shape comes from projecting fire-lines off adjacent flanks. |
| M-FOR-2 | Curtain length between bastions | ≈ 200–260 m (within effective musket range so adjacent bastions cover one another) | m | Vauban's polygon method; musket-range rationale (Bastion fort) | H (principle) / M (value) | Bastion spacing is set by the range of the flanking weapon; too long a curtain leaves its middle uncovered. |
| M-FOR-3 | Outworks | wide ditch (counterscarp ~22 m out); detached triangular **ravelins** in front of each curtain; **glacis** crest ~50 m out | m | Bastion fort; Vauban system ([Vauban sites](https://sites-vauban.org/en/resources/history-bastioned-fortification)) | H (kinds) / M (metres) | Low thick ramparts + wide ditch + ravelins + a glacis (from the 1520s) hide the wall from horizontal artillery and deny point-blank fire. |
| M-FOR-4 | When / for whom | from **c.1500** (Pisa 1500 earthwork vs. French siege guns); costly state works built only for **strategically important towns**, never hamlets → require a decent size (PoC threshold ~2,500 inhabitants) | year, persons | [Bastion fort](https://en.wikipedia.org/wiki/Bastion_fort); [ACOUP fortification IV](https://acoup.blog/2021/12/17/collections-fortification-part-iv-french-guns-and-italian-lines/) | H (date/rationale) / L (exact threshold) | The 1494 French invasion of Italy showed mobile siege artillery shatter high medieval walls; the response was expensive and reserved for important places, so a hamlet never received one. Threshold is a PoC convention — TODO(M-FOR-4). |
| M-FOR-5 | Wall at the water | the enceinte follows the **bank/shoreline** at the water, does not bulge around it, dips a short **spur into the water** at each end (deny walking round at the waterline), leaves the **harbour mouth open**, and **crosses the water only once the town has grown across it** | – | town-plan corpus; harbour/bridge-town families (lit. review §1.1 #22–23, §4) | M | Walls hug the natural water barrier rather than duplicating it inland; sea-gates/chains closed harbours rather than solid walls (the harbour was not cordoned); a river inside the walls appears only when both banks were built up. |
| M-FOR-6 | Wet ditch & water defences (late-stage / **Old Dutch System**) | where water is at hand the ditch is **flooded (a wet moat)**, **doubled** into two concentric moats on larger works (**Naarden**: 6 bastions, 6 ravelins, double moats, 1675–85); **ravelins become islands** in the moat; a **covered way** rings the ditch; approaches cross on **narrow causeways** to the gates (a deliberate funnel under flanking fire); the broader system used **inundation** — controlled flooding ~40–50 cm deep, too deep to wade, too shallow to sail | m, cm | [Naarden / Dutch Fortress Museum](https://www.vestingmuseum.nl/en/naarden/); [Dutch Water Defence Lines (UNESCO)](https://whc.unesco.org/en/list/759/); [Ravelin](https://en.wikipedia.org/wiki/Ravelin) | H (features) / M (our metres) | A wet moat defeats escalade and mining and cannot be filled by the besieger; the Low Countries' high water table made wet ditches and inundation the signature of the Dutch systems; the causeway funnels the assault into the bastions' killing ground. |
| M-FOR-7 | Cleared field of fire (**glacis / esplanade**) | **no building, street or tree** stands within the fort's glacis (or a town wall's rampart strip): the ground is deliberately swept clear so defenders keep an unobstructed field of fire; existing fabric in the footprint is **demolished** | m | [Glacis (Vauban glossary)](https://sites-vauban.org/en/resources/glossary/glacis); bastion-fort corpus | H | The glacis exists precisely to deny cover to attackers; historically houses inside the esplanade were cleared by ordinance. In the engine this is also what prevents the wall/fort geometry from overlapping roads and houses. |

## G. Growth dynamics (M-GRW)

| ID | Quantity | Value | Units | Source | Conf. | Justification |
|----|----------|-------|-------|--------|-------|---------------|
| M-GRW-1 | Densification : exploration mix | early epochs ~50:50 → late ~90:10 | ratio | [Strano et al. 2012](https://www.nature.com/articles/srep00296) | H (trend) / M (numbers) | Per-epoch budget split between infill candidates and frontier candidates. |
| M-GRW-2 | Growth episodes | population logistic; wall circuits built when built-up ≥ ~80% of enclosed area; successive circuits (1–3 typical for towns that persist) | – | walled-city histories (Florence, Cologne circuits; Kostof 1992) | M | Quantized growth: episodes visible as plan-unit seams — a key "grown" tell. |
| M-GRW-3 | Backbone persistence | high-centrality streets survive across all epochs (no deletion/rerouting) | invariant | Strano et al. 2012 | H | Engine invariant: primary roads immutable once laid; later stages may only widen/encroach. |
| M-GRW-4 | Maturation drift | node relaxation ≤ 0.5 m/epoch, planned-plat nodes pinned for first 2 epochs | m/epoch | L — bounded operator justified by lit. review §3 (fossilization) | L | Small; exists to break surveyor-perfection where history did; magnitude to calibrate visually then freeze. |
| M-GRW-5 | Pre-urban field fabric | radial strip fields off approach roads: width LogN(35, 0.5) m, depth 150–400 m (furlong-scale) | m | open-field metrology (furlong ≈ 201 m; selion widths) | M | Fossilization source for later street alignments (lit. review §3, item 5). |

---

## Usage contract

1. Code cites entries by ID in a comment at the point of use (`// M-PAR-1`).
2. Changing a value = changing this file (PR-reviewable), never an inline edit.
3. `L` entries carry `TODO(M-…)` in code and are listed in the validation harness as
   "unverified"; Phase 1–2 exit criteria include shrinking the L set.
4. Validation harness acceptance bands come from the bracketed ranges here; a generated
   city failing its tradition's bands fails CI.
