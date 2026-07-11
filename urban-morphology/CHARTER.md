# Procedural Urban Morphology Generator
## Research-Driven Proof of Concept
### Project Charter v1.0

> Verbatim copy of the founding charter, kept in-repo as the reference document for all
> Phase 0 deliverables. The deliverables live in `docs/`.

---

# Mission

Develop a **stand-alone HTML5 application** that procedurally generates convincing historical city layouts using evidence-based computational methods.

The project is intentionally isolated from Cartalith.

Its purpose is to determine whether a browser-based procedural system can generate settlements whose spatial organization resembles real historical cities without relying on handcrafted templates.

The output is a **top-down editable SVG city plan**.

Nothing more.

No gameplay.

No simulation of citizens.

No economy.

No terrain generation.

No interiors.

The project succeeds if the resulting city appears to have **grown** rather than been **drawn**.

---

# Primary Question

The software must answer one question:

> **Can historical urban morphology emerge from constrained procedural growth rather than template placement?**

Everything else is secondary.

---

# Core Design Philosophy

The goal is **not** to recreate medieval Europe.

The goal is to reconstruct the **underlying processes** that produce historical urban form across civilizations.

The engine should separate:

- urban growth rules
- environmental constraints
- cultural preferences
- architectural grammar

The same core engine should eventually support multiple historical traditions by changing growth parameters rather than rewriting the simulation.

---

# Research First

Implementation **must not begin immediately.**

Before writing code, conduct a comprehensive literature review.

Research should determine which algorithms, measurements, and computational techniques best describe historical settlement formation.

The implementation should follow the evidence rather than preconceived design.

If research contradicts any assumption in this document, prefer the research.

---

# Research Objectives

Conduct a literature review covering the following disciplines.

---

## Urban Morphology

Investigate how settlements evolved.

Study examples from:

- Medieval Europe
- Roman cities
- Byzantine settlements
- Islamic cities
- Renaissance expansion
- Early modern towns
- Viking settlements
- Celtic settlements
- Mayan cities
- Aztec cities
- Inca settlements
- Ancient Egyptian settlements
- Classical Greek cities
- Mesopotamian cities
- Chinese imperial cities
- Japanese castle towns
- African trading cities
- Indigenous North American settlements
- Colonial settlements
- Frontier settlements
- Mining towns
- Harbour cities
- Bridge towns

Determine measurable characteristics that distinguish each urban tradition.

Identify both universal principles and civilization-specific patterns.

---

## Archaeology

Study archaeological reconstructions.

Extract quantitative observations including

- building density
- plot dimensions
- frontage width
- courtyard frequency
- road widths
- intersection spacing
- block size
- public square dimensions
- temple placement
- administrative districts

Whenever possible, record statistical distributions rather than averages.

---

## Historical Cartography

Study

- cadastral maps
- taxation maps
- estate maps
- archaeological plans
- military surveys
- excavation maps

Identify recurring geometric structures.

---

## Historical Geography

Investigate how geography influenced settlement placement.

Research

- rivers
- floodplains
- coastlines
- mountain passes
- valleys
- harbours
- trade routes
- agricultural land
- defensive terrain

Determine which factors consistently influenced settlement growth.

---

## Transport Geography

Study

- desire paths
- central-place theory
- accessibility
- gravity models
- network centrality
- pedestrian movement
- road hierarchy
- route optimisation
- bridge placement

Determine how transportation networks emerge naturally.

---

## GIS

Research

- topology
- polygon processing
- adjacency
- buffering
- snapping
- coordinate systems
- spatial indexing
- topology validation
- graph construction

---

## Computational Geometry

Evaluate

- Voronoi diagrams
- weighted Voronoi
- Delaunay triangulation
- constrained Delaunay
- straight skeletons
- medial axis
- recursive subdivision
- polygon clipping
- polygon offsetting
- graph embedding
- minimum spanning trees
- constrained graph optimisation

Determine where each algorithm belongs within the generation pipeline.

---

## Mathematics

Wherever possible, replace heuristics with measurable quantities.

Research

- graph theory
- network science
- computational topology
- stochastic growth
- spatial statistics
- fractal geometry
- optimisation
- procedural grammars
- probability distributions

Document which mathematical models best explain historical urban growth.

---

## Procedural Generation

Investigate

- agent-based systems
- cellular automata
- graph growth
- recursive subdivision
- L-systems
- Wave Function Collapse
- reaction-diffusion
- constraint propagation
- procedural grammars

For every algorithm document

- purpose
- strengths
- weaknesses
- computational complexity
- historical realism
- browser suitability

---

## Existing Software

Study both commercial and academic work.

Examples include

- Esri CityEngine
- Parish & Müller procedural cities
- Dwarf Fortress
- Songs of Syx
- Foundation
- Manor Lords
- Ostriv
- OpenStreetMap tooling
- historical GIS projects
- archaeological reconstruction software
- procedural city generation research

Do **not** copy implementations.

Instead identify successful principles and recurring solutions.

---

# Mathematical Foundation

Every numerical parameter should be justified.

Examples include

- frontage distributions
- parcel aspect ratios
- road angle distributions
- intersection degree
- building orientation
- road curvature
- accessibility metrics
- graph centrality
- block compactness
- density gradients
- courtyard frequency
- nearest-neighbour statistics
- settlement spacing
- clustering coefficients

For every numerical assumption document

- value
- units
- source
- confidence level
- justification

Avoid arbitrary constants whenever published measurements exist.

---

# Engineering Philosophy

The renderer never invents geometry.

Simulation creates geometry.

Rendering visualizes geometry.

The generator never asks

> "Where should I place a building?"

Instead it repeatedly asks

> "Why would a building exist here?"

Every visible feature should be traceable to one or more constraints.

---

# Scope

The proof of concept generates only

- roads
- city walls (optional)
- blocks
- parcels
- buildings
- districts
- simple urban clutter

No gameplay.

No NPCs.

No economy.

No combat.

No terrain simulation.

---

# Technical Constraints

- Single HTML file
- Pure JavaScript
- Pure SVG rendering
- Offline
- No frameworks
- No build process
- No external dependencies unless technically justified

---

# Output

Produce an editable SVG.

Every object remains selectable.

Objects include

- roads
- buildings
- parcels
- districts
- trees
- wells
- fences
- props

Every object should support metadata for future editing.

---

# Generation Pipeline

Seed

↓

Primary Roads

↓

Secondary Roads

↓

Urban Blocks

↓

Parcel Subdivision

↓

Building Footprints

↓

Architectural Grammar

↓

Detail Objects

↓

SVG Rendering

Each stage should be modular and independently replaceable.

---

# Determinism

Generation must be deterministic.

The same seed always produces identical output.

Each subsystem receives its own derived seed.

Changes to one subsystem should not invalidate the output of unrelated systems.

---

# Visual Goal

The prototype should resemble

- archaeological reconstructions
- cadastral surveys
- excavation plans
- historical town maps

rather than a stylized strategy game.

Readability and plausibility are more important than decoration.

---

# Deliverables

## Phase 0

- Literature review
- Algorithm survey
- Mathematical assumptions
- Architecture proposal

No implementation.

---

## Phase 1

- SVG renderer
- Seed system
- Camera
- Road generation

---

## Phase 2

- Urban blocks
- Parcel subdivision

---

## Phase 3

- Procedural building generation
- Architectural grammar

---

## Phase 4

- District generation
- Detail objects
- SVG export

---

# Acceptance Criteria

The project succeeds if independent observers conclude that

- streets appear to have evolved rather than been planned;
- blocks are irregular yet functional;
- parcels resemble historical property boundaries;
- building density varies plausibly;
- districts are visually identifiable;
- the city appears internally coherent rather than randomly assembled.

Every significant implementation decision should be supported by academic literature, historical evidence, established mathematical methods, or well-understood computational algorithms.

If an evidence-based solution exists, it should be preferred over an arbitrary heuristic.

The implementation should prioritize:

1. Historical plausibility
2. Algorithmic transparency
3. Determinism
4. Modularity
5. Computational efficiency
6. Future extensibility

The resulting proof of concept should demonstrate that convincing urban morphology can emerge from constrained procedural simulation and provide a foundation for future support of multiple historical and cultural urban traditions.
