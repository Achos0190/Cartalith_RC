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
| M-BLD-8 | Place of worship by **rite** | the religious anchor is **not only a church** — selectable per culture: **Christian church** (cross-plan, chancel east); **classical Roman/Greek temple** (colonnaded cella on a **podium**, **frontal steps** to the forum, oriented to its surroundings not east); **shrine** (a small cella); **mosque** (prayer hall on the **qibla** + courtyard **sahn** + **minaret**). Civic hall likewise selectable: **town hall + belfry** / **Roman basilica** (hall + apse + colonnade) / **guild loggia** / none | – | [Roman temple](https://en.wikipedia.org/wiki/Roman_temple) (podium, frontal steps, deep portico); mosque form (hypostyle hall + sahn + minaret); Hakim 1986; docs/05 §2.1 | H (forms) | The generator reconstructs *processes across civilizations* (charter), so the cult building is a tradition-pack parameter, not a fixed Christian church; Islamic governance being non-monumental is why the civic hall can be "none". |

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
| M-FOR-6a | Wet-ditch **feasibility** | a wet moat is only built where a **water body is within reach** (~≤ 175 m of the trace, and low enough to feed by gravity); an inland/hilltop fort gets a **dry ditch** | m | Dutch-system rationale (Low Countries' high water table); [Star forts](https://en.wikipedia.org/wiki/Bastion_fort) | H (principle) / M (metres) | You cannot flood a moat with no water to draw from, nor pump it uphill — so the wet/dry choice is a site fact, not a style. |
| M-FOR-8 | The trace is a **closed** polygon; **few gates** | unlike a town wall (which follows the bank and leaves the water side open, M-FOR-5), a bastioned enceinte is a **compact, closed** trace with a full angled bastion at **every** corner and a curtain on **every** side — the water frontage gets bastions and a moat too, fed by the river/sea itself, not a plain wall. The number of **land gates is capped small** (2–3) regardless of how many roads approach; **Naarden's hexagon (6 bastions) has only 2 gates** — every other approach was historically re-routed to converge on one of them | – | [Naarden](https://www.vestingmuseum.nl/en/naarden/) (6 bastions, 2 gates); Vauban's magistral polygon (closed by construction) | H | A besieged town wants the fewest possible breaches in its curtain to defend and garrison; consolidating approaches onto 2–3 causeway-gates (each swept by a ravelin and the flanking bastions) is the entire point of the funnel — it is also what stops every incidental road crossing from punching an undefended gap through the wall. |

## I. Harbour protection & amenities (M-HARB, M-AMEN)

| ID | Quantity | Value | Units | Source | Conf. | Justification |
|----|----------|-------|-------|--------|-------|---------------|
| M-HARB-4 | Harbour defence (selectable) | a harbour outside the town wall is protected by one of: **chain & mouth towers** (a chain raised between two towers across the entrance), an **enclosing sea wall with a water-gate**, or a **mole-head fort/tower**; or left **unprotected** | – | Vitruvius; [Defensive harbour chains](https://www.ancientportsantiques.com/ancient-port-structures/defensive-chains/) (Kyrenia, Golden Horn, Marseille); [Fortifications of Rhodes](https://en.wikipedia.org/wiki/Fortifications_of_Rhodes) (Hospitaller moles); [Medieval fortification](https://en.wikipedia.org/wiki/Medieval_fortification) (14th-c. enclosed harbours + water-gates) | H | Harbours had to stay open to shipping yet be closeable against raiders; the chain/water-gate/mole-fort repertoire solved this without cordoning the quay. Auto-choice: chain for river/bay ports, mole-fort for open coasts, sea-wall for a river-through city. |
| M-AMEN-1 | Market squares & civic hall by rank | market squares **multiply and specialise** with population: 1 general market < 1,500; **+ shambles** ≥ 1,500; **+ fish & corn** ≥ 3,500; **+ cloth** ≥ 8,000; **+ cattle** (at a gate) ≥ 14,000. A **town hall/guildhall** on the market appears once a place is a chartered town (≥ ~1,500) | persons | Masschaele 1997 (multiple markets; King's Lynn's two); [Market square](https://en.wikipedia.org/wiki/Market_square); communal town hall (§2.3, M-ADMIN); docs/05 §2.2–2.3, §5.1 | M (thresholds) / H (ordering) | The seat of an empire and a village differ vastly in the services they carry; specialised markets and a civic hall are rank markers that switch on as demand crosses each threshold. |
| M-SITE-1 | River **through** the town | a large river may **bisect** the settlement — both banks built, several bridges, and the wall **encloses both banks** with **water-gates** where the river passes under it (Paris, Florence, London) | – | town-plan corpus; §1.1 #23; M-FOR-5 | H | A town that outgrew one bank spans the river; the wall then crosses the water rather than stopping at it. |
| M-SITE-2 | **Landlocked** (no water) | a completely dry inland site: **no river, sea or harbour**; land routes converge from all sides; the wall is a **full curtain** all round; a fort's ditch is necessarily **dry** (M-FOR-6a) | – | inland market-town corpus; central-place theory (M-REG-1) | H | Not every settlement sits on water — many market towns are purely inland route-junctions; the generator must not assume a water frontage. |
| M-AMEN-2 | **Hamlet** scale (no central functions) | a hamlet (≲ 100–600 inhabitants) is a **handful of houses at a crossroads or along a lane** — **no church, market, town hall or wall**; street length floored low so it stays a small cluster, not a town | persons | [Nucleated village / hamlet](https://en.wikipedia.org/wiki/Nucleated_village); [Hamlet (Britannica)](https://www.britannica.com/topic/hamlet-settlement) | H | "Unlike villages, hamlets do not have churches, town halls or any administrative or central building" — so below the village threshold the central-place functions are all absent (contrast M-AMEN-1). |
| M-AMEN-3 | Civic hall **size** by rank, not just presence | M-AMEN-1 governs whether a civic hall exists; this governs how big it is once it does: every `buildCivic` style's base footprint (basilica/loggia/keep/townhall/dome) is multiplied by `1 + 0.9·log10(pop/1500)/log10(20000/1500)`, i.e. 1.0x at the pop:1500 gate up to ~1.9x at the pop:20000 cap | persons | qualitative principle is well-attested (a market town's modest hall vs. a great city's — Bruges' Cloth Hall, Siena's Palazzo Pubblico — are not remotely the same scale of building); the specific log-curve and 1.9x ceiling are a PoC convention | H (principle) / L (curve/ceiling, tuned not measured, same honesty flag as M-FOR-4's threshold) | Found by direct comparison, not assumed: before this entry, civic-hall footprints (128-432 m²) overlapped the largest ordinary house footprint on a generous burgher/market parcel (up to ~250 m², via the courtyard-mansion branch), so a "monumental" building could read as barely bigger than a rich neighbour's house, and identically-sized regardless of whether the town had 1,500 or 20,000 people. Base dimensions were also raised (e.g. keep 18-24×14-18 -> 26-36×20-26) so the floor alone already clears every house size before the rank multiplier is even applied. |

## G. Growth dynamics (M-GRW)

| ID | Quantity | Value | Units | Source | Conf. | Justification |
|----|----------|-------|-------|--------|-------|---------------|
| M-GRW-1 | Densification : exploration mix | early epochs ~50:50 → late ~90:10 | ratio | [Strano et al. 2012](https://www.nature.com/articles/srep00296) | H (trend) / M (numbers) | Per-epoch budget split between infill candidates and frontier candidates. |
| M-GRW-2 | Growth episodes | population logistic; wall circuits built when built-up ≥ ~80% of enclosed area; successive circuits (1–3 typical for towns that persist) | – | walled-city histories (Florence, Cologne circuits; Kostof 1992) | M | Quantized growth: episodes visible as plan-unit seams — a key "grown" tell. Implemented via the opt-in `wallGenerations` toggle (default off; docs/07 §3.11): see M-GRW-2a/2b for the specific proxies the PoC uses to operationalize "≥~80% of enclosed area" and to tie growth pacing to age/population/carrying-capacity. |
| M-GRW-2a | Wall-generation trigger (PoC proxy for "≥80% of enclosed area") | each epoch (once past the same epoch-3ish minimum-substance floor M-GRW-2 already used for the first circuit), the built-mass hull — `builtMassHull`: convex hull of degree≥2, non-water nodes within reach of the market, cut at the 85th-percentile distance, the SAME construction `buildWall` itself already used to size the first circuit — is recomputed and its area compared against the currently ACTIVE wall's enclosed area; crossing `wallGenerationThreshold` (default 0.8) supersedes the wall (old ring → `ringroad`, new bigger ring raised in its place), up to `maxWallGenerations` (default 3) | ratio | reuses `buildWall`'s own pre-existing hull-of-built-nodes construction (§ M-NET-9) as the area proxy, rather than inventing a second measure | M (the 80% / 1–3-generations citation itself) / L (the specific hull-ratio proxy is a PoC convention, tuned not measured — same honesty flag as M-FOR-4's threshold) | Self-limiting with no extra cooldown needed: `buildWall` always inflates a freshly-built ring with ~10%+16m growth reserve, so the ratio drops well back below threshold immediately after every supersession — verified directly (generation reliably advances to the `maxWallGenerations` cap across an 11-seed × 4-epoch-count × 4-population-level sweep, never overshoots it). |
| M-GRW-2b | Growth pacing: age ↔ population ↔ carrying-capacity (PoC placeholder) | with `wallGenerations` on, the frontier-radius ramp inside `grow()` — normally linear, `maxRF·(0.38+0.62·ep/epochs)` — becomes `maxRF·ccFactor·(0.38+0.62·logisticRamp(ep/epochs))`: same floor/ceiling, but age maps through a normalized logistic curve (slow while young, faster once established, tapering as it matures) instead of a straight line, and the whole ramp is scaled by `ccFactor`, a `[0.3,1.0]` placeholder from `estimateCarryingCapacity(site,anchors,maxRF)` — which samples this engine's own already-computed M-TER-1 `terrainSuitability()` at points around the market and averages it, rather than inventing a parallel scoring system | ratio | age/population-growth coupling is the user's own explicit design request; the logistic-curve shape and the terrain-suitability-average proxy for carrying capacity are PoC conventions | M (age↔population coupling as a design principle) / L (the specific logistic steepness and the terrain-suitability proxy for carrying capacity, explicitly a stand-in — Cartalith owns the real resource/carrying-capacity model) | Verified live, not inert: zeroing `carryingCapacityWeight` (which pins `ccFactor` to 1) measurably raises realized population vs. the full-weight default on the same seed (9,766 vs. 9,303 at one tested seed/pop/epoch combination) — the mechanism visibly does something, not just documented intent. Integration contract for a real Cartalith port: `estimateCarryingCapacity` keeps its exact signature and `~[0.3,1.0]` contract; only its body needs replacing (docs/07 §3.11). |
| M-GRW-3 | Backbone persistence | high-centrality streets survive across all epochs (no deletion/rerouting) | invariant | Strano et al. 2012 | H | Engine invariant: primary roads immutable once laid; later stages may only widen/encroach. |
| M-GRW-4 | Maturation drift | node relaxation ≤ 0.5 m/epoch, planned-plat nodes pinned for first 2 epochs | m/epoch | L — bounded operator justified by lit. review §3 (fossilization) | L | Small; exists to break surveyor-perfection where history did; magnitude to calibrate visually then freeze. |
| M-GRW-5 | Pre-urban field fabric | radial strip fields off approach roads: width LogN(35, 0.5) m, depth 150–400 m (furlong-scale) | m | open-field metrology (furlong ≈ 201 m; selion widths) | M | Fossilization source for later street alignments (lit. review §3, item 5). |

## Archived: 17 per-culture registers removed in the post-launch simplification pass

Sections **H–W** (M-ROM, M-ISL, M-BYZ, M-CHN, M-AZT, M-VIK, M-CEL, M-GRK, M-EGY, M-MES, M-MAY,
M-INC, M-JPN, M-COL, M-FRO, M-IND) and **Z** (M-PAL) previously registered here — one per culture
profile — are removed as of this pass (docs/07 §3.10). The underlying research was not wrong: a
wider review found the rendered output of these 17 organic-planning cultures near-indistinguishable
from the medieval baseline at the level this tool actually draws, a rendering/visual-distinctiveness
problem rather than a defect in the citations themselves. The full register text remains recoverable
from git history (any commit before this pass, or the PR that introduced this change) if a future
profile addition wants to reuse or re-verify it. Only **Y** (Venus, a structurally distinct radial
planning mode) survives as a second profile alongside the medieval baseline.

## X. Ruined (post-apocalyptic): a state, not a civilization (M-PA)

Originally shipped as its own "Post-Apocalyptic" culture profile that just reused Industrial's
grid/housing stock and forced its one new mechanism, `applyDecay()`, on. `applyDecay()` was
always profile-agnostic — it reads only `parcels`/`buildings`, never `profile` — so gating it on
a dedicated culture rather than a plain toggle was an unnecessary coupling: a collapsed settlement
is a **state** any civilization's town can be found in (a ruined Roman colonia, a ruined Aztec
lake-city, a ruined medieval town), not a tradition of its own with its own street plan and
building grammar. `opts.ruined` (default off) now applies `applyDecay()` over whichever culture is
selected, the same additive/opt-in discipline as `GenerationRules`/`terrainAware`.

| ID | Quantity | Value | Units | Source | Conf. | Justification |
|----|----------|-------|-------|--------|-------|---------------|
| M-PA-1 | Decay pass (data/render-only) | a seeded ~35-45% of an already-built parcel stock (and its buildings) is flagged `ruined` post-generation: abandoned and excluded from the population head-count, but geometrically untouched — no vertex is moved, added, or removed | – | Internal design decision, informed by shrinking-city/urban-decline research (see below) rather than fiction | H (as a deliberate scope boundary) | `applyDecay()`'s central discipline: an actual physical-rubble model — a wall breached somewhere other than a gate, a road blocked mid-span — would be **exactly** the "impossible intersection" this project's standing audit checks against every profile for. Modelling ruin as a pure data/style overlay on top of already-validated geometry means this toggle can never introduce one, by construction, rather than by getting lucky, **regardless of which culture it's layered over** — the same safety property held when it was profile-locked, now proven across several cultures rather than one. Full physical ruin modelling (breached walls, blocked streets, reclaimed blocks) is explicitly deferred as future work, not attempted here. |
| M-PA-2 | Collapse is a real, general phenomenon, not a fictional trope tied to one city type | depopulation/shrinking-city research documents real settlements of every era and tradition losing a substantial share of their built stock to abandonment (e.g. Vorkuta's collapse from ~250,000 residents) | – | [Shrinking cities: rethinking landscape in depopulating urban contexts](https://www.tandfonline.com/doi/full/10.1080/01426397.2017.1372167); [Visualizing and Understanding Shrinking Cities research](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9517118/) | M | Originally cited to justify Post-Apocalyptic's specific choice of Industrial's stock as "the city type imagined to have fallen"; now grounds the more general claim that abandonment is a real, cross-cultural phenomenon that can plausibly befall *any* settlement type in this register, not just a 19th/20th-century industrial one — supporting the toggle's generalization rather than one profile's specific framing. |

Scope note: population realization with the toggle on (~55-65% of an equivalent un-ruined
baseline at the same settings, for whichever culture is selected) is *intentionally* low — a
test asserts it is substantially below the un-ruined baseline for several different cultures, not
within the usual 85-120% realization band, precisely because that gap is the mechanism working as
designed, not a regression. A second test confirms ruination is orthogonal to the underlying
culture's own rules: a ruined medieval town can still get a full bastioned trace on request, and a
ruined Industrial town still never gets a wall at all — the toggle changes only who's still living
there, never what the selected culture would otherwise build or forbid.

## Y. The Venus Project morphology (M-VEN)

Revised after user feedback on the first version: the initial cut over-literalized Fresco's plans as
a sparse two-ring city with no amenities, no fortification option and a forced-uniform housing stock.
The current version is a deliberate **fusion** — Fresco's circular-city structure, kept much denser
(more concentric rings, crossing cross-spokes) and mixed with medieval-European amenity/logistics
richness and Asian/Japanese residential typologies — rather than a literal reconstruction.

| ID | Quantity | Value | Units | Source | Conf. | Justification |
|----|----------|-------|-------|--------|-------|---------------|
| M-VEN-1 | Circular city, several concentric rings + radial + cross spokes | Jacque Fresco's Venus Project envisions circular cities: a central hub, then concentric rings — office/research, a green belt, residential, an agricultural belt with a circular irrigation waterway, an outer recreation belt — connected by radial roads, replacing the linear/gridded city entirely | – | [Circular Cities — The Venus Project](https://www.thevenusproject.com/resource-based-economy/environment/circular-city/); [Cities Of The Future — The Venus Project](https://www.thevenusproject.com/multimedia/cities-of-the-future/); [Design in The Venus Project — Land8](https://land8.com/design-in-the-venus-project/) | H (principle) / L (this engine schematically collapses six described zones onto a hub ring + 5 built rings + an unbuilt fringe, noted honestly rather than modelling every zone as distinct infrastructure) | A genuinely new second planning mode (`planning:'radial'`), not a re-skin of the organic model — several concentric ring streets (not just two) connected by 12 primary radial spokes plus 12 intermediate cross-spokes in the outer band, each ring a regular polygon standing in for a circle, leaning on the core engine's unchanged planar-face block detector — only the layout rule differs (docs/07 §2). A denser ring/spoke mesh packs far more buildable frontage into a given radius, so the built radius is scaled down accordingly (a denser mesh needs a smaller footprint for the same target population, not a bigger one). Distance-based district assignment (`assignDistricts`, already keyed to distance from the market anchor with no cardinal-direction assumption) reads this as concentric zones with no code changes at all. Only the 12 primary spokes are tagged `cls:'primary'` (the only edges meant to reach the wall boundary and need a gate); cross-spokes deliberately stop one ring short of the residential ring so they never become through-route candidates at all. Post-launch simplification pass (docs/07 §3.10): the rings and spokes now carry a seeded low-frequency wobble so the radial skeleton reads as hand-drawn rather than compass-drawn, consistent with this tool's own hand-drawn-cadastral aesthetic. |
| M-VEN-2 | Center for Resource Management | a central hub housing the cybernated system that coordinates resource management, education, health and communications — the city's one civic anchor, architecturally a dome | – | [Center for Resource Management — The Venus Project](https://www.thevenusproject.com/center-for-resource-management/); Circular Cities (above) | M | New `'dome'` civic style: a circular drum (a regular polygon standing in for a circle, not the rectangular `rect()` helper used by every other civic style) with a ring of columns and a dome marker — the one civic hall style that isn't a rectangle re-skin. |
| M-VEN-3 | Circular irrigation waterway / wet moat | a circular waterway surrounds the agricultural belt for irrigation, drawing on and returning to it | – | Circular Cities (above) | M (principle) / L (placement radius and width are a schematic PoC convention, not a sourced figure) | The one genuinely new infrastructure detail for this profile: a closed, fully-circular ring — capped to the map's extent so it always closes cleanly rather than terminating in a straight clipped edge — drawn beyond the outermost built ring's radius, entirely outside the street network's reach, so it can never overlap a building or parcel **by construction**. When the star fort is built, this same canal supplies the fort's wet moat around the bastions even on a landlocked site (`applyStarFort`'s `opts.wetMoat`), and the separate decorative ring is suppressed to avoid rendering a duplicate; otherwise it stands alone outside the (optional) curtain wall. |
| M-VEN-4 | Resource-based, secular economy (no currency, no religion) | a resource-based economy provides all goods and services without money, credit, barter or debt; Fresco envisioned a science-based social system without money, politics or religion | – | [Resource-Based Economy — The Venus Project](https://www.thevenusproject.com/resource-based-economy/); [The Venus Project — Wikipedia](https://en.wikipedia.org/wiki/The_Venus_Project); [Jacque Fresco — Wikipedia](https://en.wikipedia.org/wiki/Jacque_Fresco) | H (no currency/religion) / L (amenity richness is a deliberate fusion choice, see M-VEN-5) | `defaultFaith:'none'` (no religious institution) reuses an existing mechanism unchanged. Per user direction, `markets` is now **true** — the brief explicitly asked for amenity and logistics richness rather than a stripped-down marketless reading, so this profile keeps market/amenity squares like the medieval pack, treated as a deliberate design fusion rather than a literal claim about Fresco's cashless economy. |
| M-VEN-5 | Deliberate fusion: medieval-European amenities + Asian/Japanese residential fabric | not a Fresco citation — an explicit user-directed design choice to mix the circular-city structure with the lived-in richness of medieval-European towns and Asian/Japanese residential typologies, rather than a sparse, uniform reconstruction | – | User design direction (this register entry documents a design decision, not a historical source) | — (declared design choice) | New `buildingGrammar:'venus-mixed'`: circular **pavilions** cluster at the hub/inner rings (regular polygons standing in for a circle); the outermost ring carries logistics **warehouses**; the residential rings blend the standardized **modular apartment** with an Asian-influenced **courtyard house** and a Japanese **machiya** rowhouse, seeded per parcel so the fabric reads as genuinely mixed rather than a single repeated block. Fully self-contained within `buildBuildings`' `venus-mixed` branch — it does not call into any other culture's building-grammar branch, so it was unaffected when the post-launch simplification pass (docs/07 §3.10) removed the others. Replaces the original `uniformHousing` flag (a single collapsed grammar) entirely. |

Scope note (fortification): walls and the star fort are now a genuine optional toggle reusing the medieval wall/fort machinery unchanged (`wallGates.scheme:'organic'`, so the anachronism guard permits the bastioned trace) — unwalled by default (`defaultWalls:false`, the UI unchecks the wall box on selecting this profile) but a real choice, not a forced-off `noWalls` case. Fixing a real bug found while re-enabling this: a straight radial spoke can have both endpoints on dry land and still clip through open water in between (checking only endpoints missed this) — a genuine "impossible intersection," since a plain street can't cross a river with no bridge. Fixed by sampling 12 points along each spoke's full length before drawing it, not just its two endpoints, matching the same "check the whole footprint, not just one point" discipline already used for wet-parcel/building checks elsewhere in this register.

Scope note (population): realization varies more by site kind for this profile than any other (~47-112% of target across the five site kinds at the same settings) because a circular plan interacts very differently with a bisecting river or an open coastline than an organic or rectilinear plan does — an honest, explicable geometric interaction, not a tuning bug.

## Terrain / building suitability (M-TER) — see `08-terrain-building-suitability.md`

Cartalith-port groundwork, not a civilization profile: a first, deliberately small terrain-
awareness layer, prototyped and tested entirely inside this project's own synthetic site model.
Preparatory only — no Cartalith Gen1 file is touched by this register entry or its implementation.

| ID | Quantity | Value | Units | Source | Conf. | Justification |
|----|----------|-------|-------|--------|-------|---------------|
| M-TER-1 | Two-factor terrain-suitability score | `terrainSuitability(site,p) = slopeScore(p) × floodScore(p)` — a Gaussian slope falloff (reusing the existing `slope()` proxy, M-REG-5) multiplied by a linear flood-margin ramp (reusing the existing `riverW/2+30` flood-band margin already load-bearing in `placeAnchors`/`buildWall`) | – ([0,1] score) | Slope bands: [UpCodes Site Grading](https://up.codes/s/site-grading); [Laguna Hills Hillside Development Standards](https://www.codepublishing.com/CA/LagunaHills/html/LagunaHills09/LagunaHills0950.html) (0-2% ideal, 4-8% preferred, 15%+ costs rise, 25%+ often prohibited). Riparian setback: [Stream Buffers and Setbacks — Colorado](https://planningforhazards.colorado.gov/stream-buffers-and-setbacks) (typical 25-300 ft, ~100 ft baseline). Combining method: McHarg 1969, *Design with Nature* (overlay analysis) | M (qualitative bands + overlay method) / L (the specific numeric thresholds are a schematic mapping onto this engine's own analytic proxies, not a literal unit conversion — flagged the same as every other schematic-but-motivated PoC constant, e.g. M-VEN-3) | Multiplicative, not additive, by design: a flood-prone flat is still bad because it floods regardless of slope, and a dry steep slope is still bad because it's steep regardless of flood risk — either factor alone can drag the score down, so neither can cancel the other out. Always computed and attached to every parcel (`par.suitability`, `assignDistricts`) for every profile; `hashModel()` does not hash it, so this is provably incapable of affecting the cross-version neutrality every other addition in this register is held to. |
| M-TER-2 | Opt-in terrain-aware building gate | `opts.terrainAware` (default `false`): a parcel scoring below 0.5 is left unbuilt (`par.empty=true`, `par.unsuitable=true`) — the same "bare ground" outcome already used for undersized/agrarian-paddock parcels | – (threshold on the M-TER-1 score) | Threshold derived from M-TER-1's own reference points (§2 of `08-…`), not tuned to a target percentage | L (a first, deliberately simple gate — build/don't-build only, no graded response; `08-…` §5 lists this as a natural next step, not attempted here) | The same additive/opt-in discipline as `GenerationRules` (docs/07 §3.4): `generate()` with `terrainAware` omitted is byte-identical to every prior version (dedicated hash-comparison test, plus the full pre-existing suite passing unchanged). Effect size varies honestly by site kind (~0-6% of parcels at pop 7000, landlocked sites showing zero effect because there is no flood factor and this engine's hills don't get steep enough within a typical settlement radius to cross the threshold) rather than being forced uniform. |

## AA. Signature games/spectacle buildings (M-GAMES register) — see docs/07 §3.7

A population-gated monument (`buildGames()`), reusing an oriented-rectangle closure in the same
spirit as `buildCivic`'s own local `rect()`, and originally also a discorectangle ("stadium shape")
and an "I"/dogbone polygon for other traditions — no new geometry beyond these reused/added
primitives, only new data (`GAMES_SPEC`). Each entry also carries a **siting** mode, `'plaza'`
(adjacent to the town's own market square, inside the walls) or `'peripheral'` (beyond the built-up
area).

**Archived (post-launch simplification, docs/07 §3.10):** M-GAMES-2 through M-GAMES-16 (one entry
per removed culture, plus the discorectangle/dogbone shape primitives and the Mesopotamian/
Palimpsest scope notes and the multi-culture placement-revision research) are removed as of this
pass; recoverable from git history if a future profile addition wants them. Only the medieval and
Venus entries below survive.

| ID | Quantity | Value | Siting | Source | Conf. | Justification |
|----|----------|-------|--------|--------|-------|---------------|
| M-GAMES-1 | Medieval tiltyard | rectangle ~3:1 | plaza | [Tiltyard – Wikipedia](https://en.wikipedia.org/wiki/Tiltyard) (Hampton Court/Whitehall/Kenilworth); Damen 2016 (*Urban History* 43(1), Brussels tournaments) | H | For an ordinary town (not a royal palace), tournaments were staged directly in the marketplace (Brussels' Grote Markt, also Lille/Cambrai) — dedicated palace tiltyards were the exception, not the norm. |

Scope note (no entry: Venus): Venus is a modern hypothetical with no historical building to cite;
Fresco's own designs distribute recreation through the circular city's rings rather than
concentrating it in one monument — itself a documented Venus Project design principle, so "no
single games building" is Venus's own honest answer, not an oversight.

Scope note (siting mechanism, general): a doomed candidate — of either siting mode — is retried at
another bearing/radius rather than forced in, and an empty result (no safe site found within the
search budget) is accepted as honest, exactly as `buildCivic` already returns `null` under its own
population gate. `hashModel()` does not hash `model.games` (the same reason `model.civic`/
`model.markets` aren't hashed either), so this register cannot affect cross-version neutrality.

---

## BB. Per-culture farmland/pasture (M-FARM register) — see docs/07 §3.9

Until this register, every culture's hinterland was rendered with the exact same generic
mechanism: medieval-style selion strips along the approach roads, plus scattered orchards on
agrarian-fringe parcels. A dedicated research pass — the same discipline as the M-GAMES register
(§AA above): a real source per culture, or an honest "shares the baseline pattern" verdict where
the record does not support a distinctive one — found a genuinely distinct field-division geometry
for most of the original 19 profiles, dispatched via `FARM_SPEC` to one of seven shape families
rather than a bespoke function per culture.

**Archived (post-launch simplification, docs/07 §3.10):** M-FARM-2 through M-FARM-17 (one entry per
removed culture) and the `gridFields`/`fanFields`/`basinFields`/`canalFields`/`terraceFields` shape
families they used are removed as of this pass; recoverable from git history if a future profile
addition wants them. Only medieval's baseline strips and Venus's ring bands survive, via
`stripFields`/`ringFields`.

| ID | Culture | Pattern | Source | Conf. | Justification |
|----|---------|---------|--------|-------|---------------|
| M-FARM-1 | Medieval | Selion strips (M-GRW-5) + a common-pasture share, more prevalent farther from town | — (pre-existing baseline strip mechanism; pasture share added this pass) | H | The baseline strip fabric is unchanged from before this register existed. The pasture share, added during the post-launch simplification pass so this register's pasture mechanism (previously exercised by the now-removed Byzantine/Viking entries) stays reachable, stands in for the open-field system's communally-grazed fallow shift and true common/waste land at the village margins. |
| M-FARM-18 | Venus | Ring-farming bands: concentric cultivation belts beyond the built rings | Ebenezer Howard, Garden City concentric-ring diagram (1898) | N/A (design choice) | No historical culture applies; a deliberate design choice echoing the Garden City diagram Fresco's own circular-city brief already draws on for other amenities in this profile. |

Scope note (pasture): a genuinely new detail kind (`kind:'pasture'`), rendered distinctly from a
cultivated field (`.pasture` CSS, a muted grazing-green rather than `.field`'s cultivated gold), not
just a differently-shaded copy of the same thing. Present wherever `FARM_SPEC` flags a
`pastureShare`/`pastureFar` (medieval, added this pass) or built into the pattern generator itself
(Venus's `ringFields`) — a per-cell/per-band probability, not a per-generation guarantee, the same
"aggregate across seeds" discipline already used elsewhere in this project for legitimately
probabilistic effects.

Scope note (never affects cross-version neutrality): `hashModel()` does not hash `model.details`
(the same reason `model.games`/`model.civic`/`model.markets` aren't hashed either), so this
register cannot affect cross-version neutrality regardless of how its output varies.

Scope note (collision audit, historical): the register's own dedicated test, when it covered all 19
profiles, initially failed with 1281 street-crossings and 34 water-overlaps across the full
culture/site/seed matrix — not sited by `isWater`/`urban` alone being insufficient, but by every
generator (the pre-existing `stripFields` baseline included) never checking the live street graph
at all. Fixed with a shared `crossesStreet(g,poly)` helper reusing `buildGames`' own
`edgesNear()`+`segInt()` technique, still load-bearing for the two patterns that survive this pass.

---

## Usage contract

1. Code cites entries by ID in a comment at the point of use (`// M-PAR-1`).
2. Changing a value = changing this file (PR-reviewable), never an inline edit.
3. `L` entries carry `TODO(M-…)` in code and are listed in the validation harness as
   "unverified"; Phase 1–2 exit criteria include shrinking the L set.
4. Validation harness acceptance bands come from the bracketed ranges here; a generated
   city failing its tradition's bands fails CI.
