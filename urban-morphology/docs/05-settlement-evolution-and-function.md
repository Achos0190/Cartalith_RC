# Phase 0 (extension) — Settlement Evolution & Functional Geography

**Project:** Procedural Urban Morphology Generator (see `../CHARTER.md`)
**Purpose:** the *functional* companion to `01-literature-review.md`. Where 01 asked how the
physical fabric (streets, plots, blocks) is generated, this report asks **why each function
sits where it does, and in what order functions appear as a place grows** — harbours,
centres, markets, administration, quarters, industry, and amenities. It closes with a
**synthesis** proposing concrete engine rules (new `M-*` register entries) so these can be
generated for reasons, not painted.

**Method note (important, honest):** this document was written during a window when the
session's live web-search quota was exhausted. Citations are therefore limited to (a) sources
already web-verified earlier in this project (URLs given), and (b) **standard scholarly works
cited by author/title/year** — all real, widely held references, but not re-fetched here.
Every quantitative claim carries a confidence grade (**H/M/L**, as in
`03-mathematical-assumptions.md`); figures that need precise re-verification are marked **L**
or "‡ verify". A follow-up pass should re-confirm the numbers against primary sources when
search is available. Nothing here is invented data — where a number is an inference or a
convention it says so.

---

## 0. The one-sentence thesis

> A settlement is a **machine for reducing the cost of exchange** (of goods, people,
> information, worship, and protection); every function locates where it minimises its own
> access cost subject to the constraints of water, defence, nuisance, and status, and new
> functions switch on as rising population and connectivity push demand past each function's
> **threshold**.

This is the through-line: **site → access → nuisance → status → threshold.** The rest is
detail and numbers.

---

## 1. Site selection & strategic resources — access vs. defence, quantified

Pre-industrial settlement location is dominated by a small number of physical pulls, in
rough priority order (Pirenne 1925; Hohenberg & Lees, *The Making of Urban Europe*, 1985;
Kostof, *The City Shaped*, 1991; and lit. review §4):

1. **Reliable water** (potable) — a binding constraint, not a preference.
2. **Break-of-bulk / crossing** — where transport changes mode or is forced to converge:
   fords, bridgeheads, harbours, portages, heads of navigation, mountain-pass feet.
3. **Defensibility** — hill spurs, meander necks, islands, promontories.
4. **Productive hinterland** — workable soils, pasture, timber, minerals.

The central tension is **access ⟷ defence**: the best trading site (open, low, on the water)
is the worst defensive site, and vice-versa. Historically this is resolved in three moves,
all generatable:

- **Split the functions vertically**: a defensible **citadel/castle/acropolis on the height**
  + an **open trading town (the *bourg*/*portus*/lower town) below**. Athens (acropolis +
  agora), medieval *château + bourg*, Edinburgh (castle rock + Grassmarket), Salzburg,
  countless "upper town / lower town" pairs. (Kostof 1992; Saalman, *Medieval Cities*, 1968.)
- **Wall the trading town later** once it is rich enough to afford it (M-GRW-2).
- **Accept a compromise site** — the first bridgeable point upstream of a river mouth is the
  classic optimum: far enough inland to bridge and defend, tidal enough to reach by ship
  (London, Newcastle, Bordeaux). (Standard historical-geography result; **H**.)

### 1.1 Harbour siting — quantified (proposed register: M-HARB)

Harbours are the sharpest case of the access/defence trade-off. Siting drivers, in order:

| Driver | Rule | Conf. |
|---|---|---|
| **Shelter** | Lee of the prevailing wind and swell; a bay head, a river mouth, or behind a spit/island. Open coasts must **build** shelter (a mole/breakwater — see M-FOR / harbour stage). | **H** (principle) |
| **Depth & holding** | Enough draft at the quay for the era's ships (medieval cogs draft ~2–3 m; classical galleys less) and good holding ground for anchors in the roadstead. | **M** |
| **Defensibility of the mouth** | A **narrow mouth** that can be closed by a **chain** between two towers/moles (Constantinople's Golden Horn, medieval Marseille, Dubrovnik) — the harbour is *closed*, not *walled off*; the town wall meets the water at towers flanking the entrance. | **H** (pattern) |
| **Break-of-bulk placement** | The **market sits just behind the quay** (goods change mode → are stored → are sold); warehouses take the **deepest plots at the water**; the customs/weigh house sits at the quay head. | **H** |
| **Relation to the citadel** | The castle/citadel commands the harbour from a height at one end, so it can fire on both the roadstead and the town (the "citadel-over-port" pattern: Corfu, Acre, La Rochelle, Havana's Morro). | **M** |

**Quantities (all ‡ verify — orders of magnitude):**
- Quay frontage per berth ≈ **the ship's length + ~20–30 %** working room; medieval cog
  ~24 m → ~30 m of quay per berthed vessel (**L**).
- A pre-industrial working port's active quay rarely exceeds **a few hundred metres**;
  beyond that, trade spreads to beaches, tidal hards, and lighters (**L**).
- Prevailing-wind exposure: quays orient to put the **loading face in the lee**; open-water
  fetch at the mouth is minimised (**M**, qualitative).

**Engine implication:** the harbour stage already does most of this (quay behind the market,
warehouses deepest, mole only on open coasts). *Add:* a **prevailing-wind vector** to the
site model (below), align the harbour mouth to its lee, and place the **customs/weigh house**
as an anchor at the quay head (M-HARB-3).

### 1.2 Bridges, fords, springs, defensive ground

- **Bridgeheads** funnel routes (bridge-town family, lit. review §1.1 #23): expect a
  widened **market street at the bridge approach**, a **bridge chapel/toll**, and **twin
  nuclei** on the two banks of asymmetric size.
- **Springs/wells** fix the earliest nucleus; holy wells become **cult sites** (a chapel over
  the spring) — an amenity that predates the market.
- **Defensive ground** deforms streets to **contour-parallel** switchbacks and puts the
  **strongpoint at the most inaccessible point** (spur tip, motte), with the town clinging
  to the approach (lit. review §4).

---

## 2. The city centre — how it was shaped and regarded

Across cultures the centre is where the **highest-order functions cluster because they serve
the whole settlement and command the best access** (space-syntax integration, M-NET-10). But
*which* functions define the centre, and how it is symbolically regarded, differs sharply by
tradition. This is the single most legible cultural signature of a plan.

### 2.1 The centre as a *bundle* of institutions

| Tradition | Centre = | Symbolic reading | Conf. |
|---|---|---|---|
| **Medieval Europe** | **Market square + parish/cathedral church + town hall/guildhall**, often as a triangle around one or adjacent squares | The town's *liberty* — market right + civic self-government + salvation, all visible together | **H** |
| **Roman** | **Forum** at the cardo/decumanus crossing: basilica (law), curia (senate), temples, market (macellum) | The res publica; civic + sacred + legal fused | **H** |
| **Islamic** | **Friday (congregational) mosque + the principal suq around it**; the ruler's palace often *separate* (a citadel) | Piety + commerce; deliberate absence of a monumental civic "town hall" (governance is personal/legal, via qadi & muhtasib, not a building) | **H** (Hakim 1986; Abu-Lughod 1987) |
| **Chinese imperial** | **Palace/administrative city on the N–S axis**; markets are *dedicated wards*, classically **"front court, back market" (前朝后市)** — audience hall to the south, markets to the north | Cosmic order: the ruler faces south, the city is a diagram of the cosmos (Wheatley, *Pivot of the Four Quarters*, 1971; Wright 1977) | **H** |
| **Mesoamerican** | **Ceremonial precinct** (temple-pyramids + plaza + ballcourt) at the axis; the market a huge separate plaza (Tlatelolco) | Sacred-astronomical centre; commerce vast but spatially distinct | **M** |
| **Colonial Iberian** | **Plaza mayor** ringed by church, cabildo (town hall), and merchant arcades (Laws of the Indies) | State-planned civic-religious core, proportioned by statute | **H** (verified: [HUD transl.](https://www.huduser.gov/portal/sites/default/files/pdf/The-Laws-of-the-Indies.pdf)) |
| **Greek** | **Agora** (open civic/market void) below the **acropolis** (sacred/defensive) | Civic life (agora) separated from cult+refuge (acropolis) | **H** |

**Generative takeaway:** the centre is an **anchor bundle** placed at the network's most
integrated point, and the *composition* of the bundle is a tradition-pack parameter. The
engine already seeds a market + churches; the missing high-order anchors are **town
hall/guildhall, cathedral, citadel/palace, custom house** (§8).

### 2.2 How many market squares? — market multiplication with growth

A key quantitative question. The pattern (Masschaele 1994 on English markets; Braudel vol. 1;
Kostof 1992):

- A small town has **one general market** — usually a **widened street or a triangular/
  rectangular place** (the market-place, M-DEN-6).
- As it grows, the single market **specialises and multiplies**: distinct **corn, fish,
  meat (shambles), cloth, cattle, hay/straw, wood, poultry** markets, each on its own
  street or square, because different goods need different handling (live animals vs. fish
  on ice vs. cloth under cover). (**H** as a pattern; exact counts vary.)
- **Covered market buildings** appear at higher order: the **market hall / cloth hall /
  corn exchange / guild hall** (a roofed upper storey for the town, open ground floor for
  trade) — a threshold amenity (§6).
- **Encroachment**: permanent stalls in the market square petrify into **island blocks**
  (the "market colonisation" seen on cadastral maps; M-DEN-6, lit. review §3).

**Proposed thresholds (market count vs. population; ‡ verify, M/L):**

| Population | Markets |
|---|---|
| < 1,000 | 1 general market (widened street) |
| 1,000–3,000 | 1 market square + a shambles (meat) split off |
| 3,000–8,000 | + separate fish, corn, cloth markets; a market hall |
| > 8,000 | + cattle/hay market at a gate, specialised exchanges |

### 2.3 City administration — where and when it appeared

Civic government becoming **architecturally visible** is a datable, threshold phenomenon and a
strong marker of a town's *rank*:

- **Europe:** the **communal movement** (11th–13th c.) produced the **town hall / hôtel de
  ville / Rathaus / palazzo comunale / broletto**, almost always **on or beside the market
  square**, frequently with a **belfry/clock tower** (the commune's voice and time) and a
  **market loggia** below (Pevsner, *A History of Building Types*, 1976; **H** for the
  pattern, 12th–13th c. **H**). The **guildhall(s)** of the merchant/craft guilds sit near
  the market too.
- **Islamic:** no monumental town hall; authority is the **ruler's citadel** (separate) plus
  the **market inspector (muhtasib)** and **qadi (judge)** operating in the mosque/suq — so
  "administration" is legal and personal, not a civic building (Hakim 1986; **H**).
- **Chinese imperial:** the **yamen** (magistrate's walled compound) is the administrative
  node, placed by the axial/cosmological plan, not by the market (Wright 1977; **H**).
- **Colonial:** the **cabildo / town hall on the plaza mayor** by statute (**H**).

**Takeaway:** a **town hall anchor** appears at a population/charter threshold (§6), placed on
the market square in the European pack, in the citadel in others.

---

## 3. Quarters & functional zoning — which quarter where, and why

Pre-industrial zoning is **not** legislated land-use (that is 20th-c.); it is the emergent
outcome of four sorting forces (Sjoberg, *The Preindustrial City*, 1960; Vance,
*The Continuing City*, 1990; Kostof 1992):

1. **Status gradient — élite *in*, poor *out*.** This is the **inverse of the modern city**:
   in the pre-industrial city the **centre is the most prestigious** (near cathedral, market,
   power), and **status falls with distance to the edge and the extramural suburbs**
   (Sjoberg's central thesis; **H**). Only with industrialisation does the centre hollow out.
2. **Nuisance gradient — noxious trades *downwind & downstream & extramural*** (§5).
3. **Occupational clustering — same trade on one street** (agglomeration + guild regulation +
   shared infrastructure). Preserved in **toponymy**: *Shambles* (butchers), *Ironmonger
   Lane*, *Tanner/Barker Street*, *Fleshmarket*, *Coppergate* (cup-makers, York),
   *Saddler/Cordwainer/Weaver* streets; Islamic suqs named by trade; Chinese *hang* (trade
   rows). (**H** as a pattern.)
4. **Affinity clustering — ethnic/religious/foreign-merchant quarters** (below).

### 3.1 The quarter map (European archetype, generalisable)

| Quarter | Where | Why | Conf. |
|---|---|---|---|
| **Market / mercantile core** | Centre, highest integration | Access; commerce clusters on the most-integrated frontages (M-NET-10) | **H** |
| **Patrician / burgher houses** | Prime streets adjoining the market | Status = proximity to power & trade | **H** |
| **Cathedral/minster close** | Central, often its own walled precinct | Ecclesiastical liberty; a town within the town | **H** |
| **Castle / citadel + its bailey** | Commanding height or one wall angle | Defence + overawe the town | **H** |
| **Artisan streets** | Radiating from the core, by trade | Agglomeration + guild rule | **H** |
| **Riverside noxious trades** | On the river, **downstream** | Water supply + effluent disposal (§5) | **H** |
| **Jewry / ethnic quarter** | Often **by the castle** (royal protection) or a defined street; later ghettos enforced | Protection + affinity + (later) segregation | **M–H** |
| **Foreign-merchant "factories"** | At the **port/quay** — the *Steelyard* (Hansa, London), *fondaco* (Venice), *funduq* | Trade + control of aliens + break-of-bulk | **H** |
| **Friaries** | Deliberately in the **poor, crowded suburbs** | Mendicant mission to the urban poor (13th c.+) | **H** |
| **Monastic precincts** | Large walled tracts, often at an edge | Land + seclusion; predate or shape the town | **H** |
| **Hospitals / almshouses / leper houses** | **At or outside the gates**, on approach roads | Care of travellers/sick + contagion kept out (leprosaria always extramural) | **H** |
| **Suburbs (faubourgs)** | Ribbon along roads outside gates | Overspill, cheaper land, noxious/space-hungry trades, inns | **H** |

### 3.2 Cross-cultural variants

- **Islamic**: the residential quarters (*hara/mahalla*) are **cul-de-sac clusters, often by
  kin/ethnicity/religion**, each semi-autonomous with its own gate, mosque, oven, hammam,
  and fountain — a **cellular** city (Hakim 1986; Abu-Lughod 1987; **H**). Trades ranked in
  the suq by **cleanliness/holiness**: booksellers, perfumers, candlemakers near the mosque;
  cloth in covered *qaysariyya*; **tanners, dyers, potters, smiths at the periphery/gates**
  (**H**).
- **Chinese imperial**: the **walled-ward (fang/li) system** — the whole residential city
  divided into gated wards closed at night, with markets confined to **designated market
  wards** (Chang'an's east & west markets) until the Song relaxation dissolved the ward walls
  and let commerce spill onto the streets (Twitchett; Wright 1977; **H**).
- **Japanese castle town (jōkamachi)**: **class zoning by decree** — samurai quarters ring
  the castle, **chōnin (merchant/artisan) streets by trade** below, a **temple belt
  (teramachi)** at the edges as an outer defensive screen (**H**, lit. review §1.1 #16).

---

## 4. Industry location logic — the "why there" for each component

The heart of the user's question. Every pre-industrial industry has a **dominant siting
driver**; get the driver right and the quarter places itself. Drivers, with the industries
they govern:

### 4.1 Water **power** (a point resource on moving water)
Mills need a **head** of water (a fall). They line **mill-races/leats** tapped off a river
above the town and returned below, or sit on the bridge itself (**bridge mills**), or on
**tidal mill-ponds** at estuaries.
- Sequence of mill uses (as technology arrives): **grain (ubiquitous, Roman+)** → **fulling
  (cloth, 12th–13th c. NW Europe)** → **later: paper, sawing, iron-slitting, ore-stamping,
  bellows for blast furnaces** (Holt, *Mills of Medieval England*, 1988; Langdon, *Mills in
  the Medieval Economy*, 2004; Reynolds, *Stronger than a Hundred Men*, 1983).
- **Quantity:** Domesday England (1086) records **~6,000 watermills for ~3,000 settlements**
  — on the order of **~2 mills per mill-bearing vill**, i.e. mills are *dense* on suitable
  streams (Holt 1988; **H** for the ~6,000 figure). Spacing on a river is set by the head
  each mill consumes — practically **a few hundred metres to ~1 km** between mills on a
  modest stream (‡ verify; **L**).
- **Windmills** (12th c.+) go on **high, exposed ground** — hills, town ramparts, the windward
  edge — appearing where water power is lacking (fenland, dry uplands) (**H**).

### 4.2 Water **supply & effluent** (industries that consume clean water and produce foul)
Located **on the river, downstream of the town**, so they draw water and discharge waste
below the drinking/washing reaches (Chant & Goodman, *Pre-industrial Cities and Technology*,
1999; **H** as a pattern):
- **Tanneries & tawyers** (soaking hides in lime & tannin — notoriously foul), **dyers &
  fullers** (dye-vats, urine, fuller's earth), **parchment-makers, skinners**,
  **slaughterhouses/shambles** (blood & offal to the river), **breweries & dyehouses**
  (need clean water in), **paper mills** (rag + clean water).
- These form the classic **riverside craft quarter** the engine already models (`craftriver`);
  the refinement is **downstream-of-centre**, not just "on the river".

### 4.3 **Fire risk & smoke** (industries with furnaces/kilns)
Kept at the **edge or extramural and downwind**, often by ordinance after fires:
- **Smiths, farriers, foundries, bell-founders, potters, tilers, brick-kilns, lime-kilns,
  glasshouses, bakehouses, soap-boilers, brewers' coppers.** Potteries and kilns cluster
  **outside the walls** near clay + fuel; smithies concentrate on a **"Smith Street"** but
  the heaviest metalworking (foundries) edges outward. (**H** as a pattern; specific
  ordinances vary.)

### 4.4 **Smell / nuisance** (the wind rule)
The **prevailing wind** sorts the foulest trades to the **downwind side** of town. In
**westerly-wind Europe that is the *east* side** — a genuine, if debated, contributor to the
enduring "**poor/industrial East End vs. affluent West End**" pattern of many NW-European
cities (London, Paris's historic distinctions, etc.). Roots are pre-industrial (tanneries,
slaughter, smoke) and are massively amplified by 19th-c. coal (**M**; the wind mechanism is
sound, its explanatory weight is debated — mark **M**, not H).
- Trades sorted downwind: **tanning, tallow/soap, glue, slaughter, smoke-producing kilns,
  and (later) the industrial quarter proper.**

### 4.5 **Raw material at the source** (resource towns)
The town *is* at the resource; layout is subordinate to it:
- **Mining towns** (metal, coal): **ribbon along the seam/valley**, T-junctions to the pit
  heads, extreme boom growth, weak platting (lit. review §1.1 #21).
- **Quarry towns, salt towns (the "-wich" places: brine + evaporation), charcoal/iron in
  wooded uplands, potteries on clay + coal** ("the Potteries"), **glass on sand + wood.**
- **Fishing towns**: net-drying racks, curing/smoking sheds, and the **fish market at the
  strand** — the whole waterfront is the industry.

### 4.6 **Transport / break-of-bulk** (industries of movement & storage)
Cluster at the **points where transport changes mode**:
- **Warehouses & merchant houses at the quay** (deepest plots, gable to the water — the
  warehouse grammar the engine builds); **custom house & weigh-house (tron)** at the quay
  head or market; **staple halls** (wool, cloth) near the centre; **inns, stables,
  carriers' yards, smithies at the gates** (where road traffic breaks); **fairs on
  extramural commons** (periodic, space-hungry). (**H** as a pattern.)

### 4.7 Summary — the industry-siting field (proposed M-IND)
Each industry is placed by a weighted score over site fields:

| Industry | Dominant field(s) | Sits | Conf. |
|---|---|---|---|
| Grain/fulling/paper mills | water head | on races above→below town, on bridge | **H** |
| Windmills | wind exposure, elevation | high windward edge/rampart | **H** |
| Tanning/dyeing/slaughter/brewing | clean-water-in + effluent-out | riverside **downstream** | **H** |
| Smithing/founding/pottery/kilns | fire risk, fuel, clay | edge/extramural, "Smith St" for light smiths | **H** |
| Tallow/soap/glue (stench) | downwind | downwind edge (east in westerlies) | **M** |
| Warehousing/shipping | break-of-bulk | quay (deepest plots) | **H** |
| Inns/carriers/farriers | road break-of-bulk | at the gates | **H** |
| Weaving/cloth finishing | agglomeration + water (fulling) | artisan streets + riverside fullers | **H** |
| Mining/quarry/salt | raw material | at the resource, ribbon form | **H** |

---

## 5. Growth & thresholds — amenities as functions of population & connectivity

This is the **central-place logic applied to a single settlement over time**: each function
has a **threshold** (minimum demand to be viable) and a **range** (distance people travel for
it). As population and connectivity rise, thresholds are crossed **in a fairly consistent
order**, and the settlement climbs the urban hierarchy (Christaller 1933; Hohenberg & Lees
1985; Braudel vol. 1; Pevsner 1976). This ordering is the most directly useful thing for the
engine: **amenities should switch on at population/connectivity thresholds and be placed by
their access logic.**

### 5.1 The amenity ladder (population thresholds; ‡ verify — mostly M/L)

Threshold populations are **order-of-magnitude conventions** synthesised from central-place
studies and urban history, **not** precise measurements — graded accordingly.

| Rank | Population (order of mag.) | Functions that switch on | Placement logic | Conf. |
|---|---|---|---|---|
| Hamlet | < 100 | well/spring; wayside chapel/cross | at water; on the road | **M** |
| Village | 100–500 | parish **church**; **mill**; **tavern/alehouse**; smithy | church central; mill on stream; smithy on road | **M** |
| Market village | 500–1,500 | **market** (charter); a few **shops/craftsmen**; **manor/hall**; maybe a **bridge chapel** | market at the crossing; the "central place" is born | **M** |
| Small town | 1,500–4,000 | **town hall/guildhall**; **second parish**; **grammar school**; **inns** at gates; **almshouse/hospital** at a gate; **shambles** splits off; first **walls** | civic on the market; hospital extramural; walls enclose the core | **M** |
| Town | 4,000–10,000 | **friary/friaries** in the suburbs; **specialised markets** (fish/corn/cloth); **market/cloth hall**; **weigh-house**; **piped conduit**/public **fountains**; **multiple parishes**; **guild halls** | mendicants to poor suburbs; conduits from a spring to market; parishes tile the town (M-DEN-8) | **M** |
| City | 10,000–40,000 | **cathedral / minster** (see); **castle/citadel**; **hospital(s)**; **university/studium** (rare); **bourse/exchange**; **printing** (post-1450); **custom house**; paved & (later) lit main streets; **theatre/playhouse** | high-order anchors at the integrated core or their own precincts; exchange by the market | **M–H** (ordering H, thresholds M) |
| Metropolis | > 40,000 | multiple cathedrals/great churches; permanent **fairs**→**exchanges**; **arsenal/dockyard** (ports); **mint**; embassies/foreign nations' houses; pleasure gardens; the full apparatus | specialised precincts; waterfront arsenal; state quarter | **M** |

The **order** (well → church → market → civic → specialised markets/halls → high-order
sacred/financial/educational) is **more robust (H)** than the exact population bands (**M/L**).

### 5.2 Connectivity thresholds (not just population)

Population is not the only trigger — **a change in connectivity** switches functions on even
at a modest size (Hohenberg & Lees's "network system" vs. "central-place system"; **H** for
the distinction):

| Connectivity event | Unlocks |
|---|---|
| Gains a **bridge/ford** | bridge chapel & toll; market street on the approach; carriers/inns |
| Gains a **navigable quay/harbour** | warehouses; custom & weigh house; foreign-merchant factory; shipbuilding; fish market |
| Gains a **market charter** | the market place, market cross, market hall; periodic → daily trade |
| Gains an **annual fair charter** | extramural fair ground; seasonal booths; long-distance trade |
| Sits on a **major road junction / staple** | inns, staple hall, exchange; over-represented for its size |
| Becomes a **see (bishopric)** | cathedral + close + bishop's palace + attendant clergy quarter |
| Becomes an **administrative capital** | palace/citadel/yamen; officials' quarter; over-built civic core |

A **small port or bridge town punches above its population weight** in amenities — the engine
should let connectivity (harbour present, bridge present, number of external routes) raise the
effective amenity rank, not just raw population.

### 5.3 Infrastructure amenities (the "urban transition" markers)

Physical amenities that appear with size/wealth and are strong period/rank signals (Chant &
Goodman 1999; Pevsner 1976; **M**): **public wells → piped conduits & fountains** (a spring
tapped and led to cisterns at the market, M-DEN-7); **paved streets** (main streets first);
**public latrines & common sewers/covered drains**; **quays & embankments**; **street
lighting** (late, early-modern); **clock/bell tower**; **weigh-house, tron, pillory & stocks
on the market**; **town gates with lodges**; **conduit houses & horse-pools**.

---

## 6. Cross-cultural synthesis table

Condensed "who put what where" (deepening lit. review §1.1 on the functional axis):

| Tradition | Centre bundle | Markets | Administration | Élite | Noxious/industry | Foreigners |
|---|---|---|---|---|---|---|
| Medieval Europe | market + church + town hall | 1 → many specialised | town hall/guildhall on market | central, by market/cathedral | riverside downstream; kilns extramural; friaries in poor suburbs | merchant "factories" at quay/Steelyard |
| Roman | forum (basilica+curia+temples+macellum) | macellum + fora | curia on forum | central *domūs*; insulae for poor | fullonicae, potteries at edge; extramural cemeteries | — |
| Islamic | Friday mosque + suq | suq ranked by cleanliness | qadi/muhtasib (no civic hall); ruler in citadel | cellular quarters by kin/faith | tanners/dyers/potters at gates | funduq/wikala for merchants |
| Chinese imperial | palace-city on axis; "front court, back market" | designated market wards (E & W) | yamen by axial plan | by rank near the axis | crafts in wards; noxious to edges | segregated foreign wards |
| Mesoamerican | temple-precinct + plaza | huge separate market plaza (Tlatelolco) | palace by precinct | near precinct | craft barrios (e.g. Teotihuacan) | ethnic barrios (Oaxaca barrio) |
| Japanese jōkamachi | castle | merchant streets by trade | castle + samurai quarter | samurai ring the castle | temple belt + noxious at edge | — |
| Colonial Iberian | plaza mayor (church+cabildo+arcades) | plaza + specialised plazas | cabildo on plaza | solares nearest the plaza | trades & castas to the periphery | — |

---

## 7. What this means for the engine — proposed rules (register additions)

The report converts to a set of **fields** and **thresholds** the engine can evaluate. These
are *proposals* for a future phase (kept out of the in-use register `03` until built), grouped
as new `M-*` families. Each names the **field(s)** it scores on and its **trigger**.

### 7.1 Two cheap additions to the *site model* enable most of this
1. **Prevailing-wind vector** `w` (per seed, biased to regional westerlies): downwind = the
   nuisance direction. Enables M-IND wind sorting and the east/west status split.
2. **Along-water gradient** (which way is *downstream* on a river, or alongshore): enables
   "noxious **downstream** of centre", not merely "on the water".
3. (Already present: centrality/integration proxy = distance-to-market; water distance;
   slope; gate positions; harbour.)

### 7.2 Proposed register families

| Family | Governs | Key fields | Trigger |
|---|---|---|---|
| **M-HARB** (harbour) | mouth orientation, quay length, custom/weigh house, chain-towers, citadel-over-port | wind lee, depth proxy, break-of-bulk, defence height | site = bay/coast/river-port |
| **M-ADMIN** (centre bundle) | town hall/guildhall, cathedral/see, citadel/palace, staple/exchange | max integration; on/adjoining market; own precinct for cathedral/citadel | population & charter thresholds (§5) |
| **M-DIST** (quarters) | status gradient (élite in/poor out), Jewry by castle, friaries in suburbs, foreign factory at quay, cathedral close, monastic precinct | integration, distance-to-centre, gate proximity, water | present from platting; refine per pack |
| **M-IND** (industry siting) | the §4.7 table: mills on races, tanners downstream, kilns/smiths at edge, stench downwind, warehouses at quay, inns at gates | water-head, water-downstream, wind, fire-edge, break-of-bulk | industry unlocked by threshold/connectivity |
| **M-AMEN** (amenities & thresholds) | the §5.1 ladder + §5.2 connectivity unlocks + §5.3 infrastructure | population rank, connectivity (bridge/quay/routes/charter), placement per amenity | crossing a threshold |

### 7.3 Concrete near-term engine features this unlocks (in charter phase order)
- **Prevailing-wind + downstream vectors** in the site model (tiny; unblocks the rest).
- **Anchor bundle at the centre**: add **town hall** (on the market) and **cathedral/citadel**
  (own precinct) as anchors, gated by population (§5.1) — extends the existing market+church
  anchoring.
- **Industry placement pass** after districts: score the §4.7 industries onto parcels by their
  fields → tanners/dyers riverside-downstream, smiths/kilns at the edge, mills on the race,
  warehouses at the quay (already), inns at the gates, windmill on the windward rampart.
- **Amenity emergence by threshold**: drive the existing "how big is this town" control (pop)
  and connectivity (has-bridge, has-harbour, #routes) through the §5.1–5.2 ladder so wells,
  market halls, guild/town hall, hospitals-at-gates, friaries-in-suburbs, conduits, and
  specialised markets **appear in order** as size/connectivity rise — the literal
  visualisation of "amenities that grew as population and connection grew."
- **Status gradient** already implicit (density/centrality); make it explicit in districts
  (patrician near centre, poor to the edge and downwind).

---

## 8. Confidence & open questions (honesty ledger)

- **Robust (H):** the sorting *logic* (access/nuisance/status/threshold); centre bundles per
  culture; the amenity **ordering**; industry **drivers**; harbour break-of-bulk; ward/quarter
  systems; élite-centre inversion (Sjoberg).
- **Medium (M):** specific **population thresholds** for amenities; the wind→east-end weight;
  market-count bands; mill spacing.
- **Low / verify (L, ‡):** the exact numeric thresholds and metrology (quay length per berth,
  mills per km, threshold populations to the nearest thousand). These need a web-verification
  pass (rate-limited at time of writing) against: Masschaele 1994 (markets), Holt 1988 /
  Langdon 2004 (mills), Christaller 1933 & later CPT threshold tables, Pevsner 1976 (building
  types & dates), Hohenberg & Lees 1985 (network vs central-place), and regional gazetteers.

### Sources
Web-verified earlier in this project (URLs): [Laws of the Indies (HUD)](https://www.huduser.gov/portal/sites/default/files/pdf/The-Laws-of-the-Indies.pdf) ·
[Central place theory](https://www.britannica.com/money/central-place-theory) ·
[Strano et al. 2012 (road-network growth)](https://www.nature.com/articles/srep00296) ·
[Chang'an overview](https://en.shaanxi.gov.cn/as/hac/hos/201704/t20170428_1595612_wap.html) ·
[Cesaretti et al. 2016 (densities)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5051806/) ·
[Isendahl & Smith 2013 (low-density urbanism)](https://www.sciencedirect.com/science/article/abs/pii/S0264275112001382).

Standard scholarly references (by author/title/year — not re-fetched here):
Pirenne, *Medieval Cities* (1925) · Sjoberg, *The Preindustrial City* (1960) · Mumford,
*The City in History* (1961) · Wheatley, *The Pivot of the Four Quarters* (1971) · Kostof,
*The City Shaped* (1991) & *The City Assembled* (1992) · Hohenberg & Lees, *The Making of
Urban Europe 1000–1994* (1985) · Braudel, *Civilization and Capitalism* vol. 1 (1979) ·
Hakim, *Arabic-Islamic Cities* (1986) · Abu-Lughod, "The Islamic City" (1987) · Wright,
"The Cosmology of the Chinese City" (1977) · Masschaele, "The Multiplicity of Medieval
Markets Reconsidered" (1994) · Holt, *The Mills of Medieval England* (1988) · Langdon,
*Mills in the Medieval Economy* (2004) · Reynolds, *Stronger than a Hundred Men* (1983) ·
Pevsner, *A History of Building Types* (1976) · Chant & Goodman, *Pre-industrial Cities and
Technology* (1999) · Vance, *The Continuing City* (1990) · Saalman, *Medieval Cities* (1968) ·
Lilley, *Urban Life in the Middle Ages* (2002) · Conzen, *Alnwick* (1960) · Beresford,
*New Towns of the Middle Ages* (1967) · Christaller, *Central Places in Southern Germany*
(1933/1966).
