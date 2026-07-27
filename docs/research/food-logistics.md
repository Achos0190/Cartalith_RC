# Pre-industrial food logistics and the urban population ceiling

Research note for Cartalith Gen1 v1.33. Written to answer a specific owner question: *are city and
capital populations calculated correctly, and is a food deficit being automatically treated as an
import when no trade route could actually sustain it?*

The short answer was **no** — v1.32 and earlier assumed any deficit could be covered by trade, with no
check that the food physically existed within reach. This note is the basis for the fix.

## 1. The governing constraint

Pre-industrial bulk food movement was dominated by transport cost, not production. The canonical
quantitative source is **Diocletian's Edict on Maximum Prices (301 AD)**, from which several scholars
have derived road : river : sea cost ratios:

| Source | road : river : sea |
|---|---|
| Duncan-Jones (1982) | 1 : 4.9 : 56 |
| Deman (1987) | 1 : 5.8 : 39 |
| Scheidel (2014) | 1 : 5–10 : 52 |

The three disagree on detail and agree on magnitude: **water carriage is roughly an order of magnitude
cheaper than road, and sea roughly 40–56× cheaper.** Cartalith uses a mid-range **1 : 5.5 : 50**.

The consequence, in Duncan-Jones' own words, is the design rule:

> *"despite the existence of a comprehensive network of trunk roads, land transport remained so costly
> and inefficient that it was often impossible to relieve inland famines from stocks of grain
> elsewhere."*

An inland settlement in deficit does **not** get to import its way out. That is the behaviour being
corrected.

## 2. Quantitative anchors

- **Grain roughly doubles in price per ~100 miles (~160 km) of overland carriage.** This is the single
  most useful number for a decay model: it converts distance directly into how much of a shipment is
  economically "lost".
- **Bulk/perishable agricultural supply by land was limited to roughly a 50 km radius.** Small towns
  drew almost everything from the immediately surrounding countryside; only large centres built
  elaborate longer-range supply systems, and those overwhelmingly used water.
- **Cities above ~100,000 were scarce, and those that existed sat at the nexus of maritime and land
  trade networks.** Rome, Constantinople, and the great river cities are the pattern; a landlocked
  inland city of that size essentially does not occur.
- Medieval London c. 1300 consumed >1 million bushels of grain and up to 100,000 tons of wood a year —
  a useful sanity check that a large city's demand is a regional, not local, draw.

## 3. The model Cartalith implements

**Deliverable fraction.** A source settlement at distance *d* from the consumer, shipping by mode *m*,
can economically deliver

```
frac(d, m) = 2 ^ ( − d / D_m )
```

where `D_m` is the distance over which cost doubles: **land 160 km**, **river 880 km** (160 × 5.5),
**sea 8000 km** (160 × 50). This is the price-doubling rule applied directly, and it reproduces the
observed pattern for free — at 50 km overland a source still delivers ~80% of its surplus; at 300 km
it delivers ~27%; at 800 km, ~3%. By sea, 800 km costs almost nothing.

**Mode selection.** The cheapest mode available to *both* ends: sea if both are coastal, river if both
sit on navigable water, otherwise land. This is why a coastal capital can be fed from across the map
while an inland one of the same size starves.

**Supportable population.**

```
supported = ownCatchmentCeiling + Σ over reachable sources ( theirExportableSurplus × frac(d, mode) )
```

A settlement whose population exceeds `supported` is **over its food-shed ceiling** — it is not a
trading hub, it is a place that could not have grown that large.

**Connectivity.** Beyond the local land radius a source only counts if it is genuinely reachable —
connected by road, or sharing navigable water. "Directly connected settlements in a reasonable
distance", as the owner put it. A settlement 40 km away across trackless mountains is not a supplier.

## 4. What this deliberately does not model

- **Storage and inter-annual buffering.** Granaries smoothed bad years; this is a steady-state model.
- **Political extraction.** Rome's grain dole was a state logistics operation, not a market outcome.
  A powerful faction could in principle out-source its own food-shed; that needs a state-capacity
  model which does not exist here.
- **Return-cargo economics.** Shipping is cheaper when a vessel has cargo both ways; ignored.
- **Roads as cost multipliers.** A real road network reduces effective land cost. Cartalith uses road
  connectivity as a gate (reachable / not) rather than as a continuous discount.

## 5. Sources

- Duncan-Jones, *The Economy of the Roman Empire: Quantitative Studies* (1982) — the 1 : 4.9 : 56 ratio
  and the "impossible to relieve inland famines" conclusion.
- Scheidel, *The shape of the Roman world: modelling imperial connectivity* (ORBIS working paper).
- Campbell et al., *A Medieval Capital and its Grain Supply: Agrarian Production and Distribution in
  the London Region c. 1300*; Galloway, *Feeding the City: Medieval London and its Agrarian
  Hinterland*.
- Bruce Lloyd / *Geography of Transport Systems*, ch. 1.3, on the ~50 km pre-mechanised supply radius
  and the maritime-nexus condition for cities above 100,000.
