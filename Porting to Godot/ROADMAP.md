# Roadmap

Rough, high-level, deliberately not over-planned — per `DECISIONS.md`, the owner asked for a
sketch of what comes after the MVP, not detailed specs for phases that are far off. Each
phase below gets its own real planning pass (its own scope doc, the same way `MVP_SCOPE.md`
exists for Phase 1) when it's actually about to start, informed by whatever was actually
learned porting the previous phase.

## Phase 0 — Walking skeleton (toolchain proof, no engine logic)

Not terrain generation yet — proving the `gdext`+Godot+Rust toolchain genuinely builds and
runs on all three targets (Godot editor, Windows export, Android export) with trivial
placeholder content (a triangle, a colored rectangle, a button that prints something). See
`TOOLCHAIN.md`'s "Suggested install-order sanity check" for the concrete steps. **Android
export is the highest-risk step** (`REFERENCES.md`'s flagged `gdext` maturity caveat) —
surface any real trouble here to the owner immediately rather than discovering it deep into
Phase 1.

## Phase 1 — Terrain-only MVP (current focus)

Full scope in `MVP_SCOPE.md`. The complete procedural terrain pipeline (tectonics → height →
climate → erosion → hydrology/rivers), golden-value verified against the JS engine
(`PARITY_TESTING.md`), rendered as a basic 2D map, able to read an existing HTML-app save
file (`SAVEFILE_COMPAT.md`), running as a real Windows `.exe` and Android `.apk` confirmed
on the owner's own hardware.

## Phase 2 — Civilization/politics layer (rough sketch)

Ports the equivalent of the HTML app's script block 2: factions, settlements
(placement/suitability — a real, non-trivial subsystem in the JS engine per this repo's own
v1.30/v1.95 history of consolidating duplicate suitability logic), territory, roads/routes,
provinces, and the basic economy/trade model. A new `cartalith-civ` crate (per
`ARCHITECTURE.md`'s "adding a subsystem" pattern), depending on `cartalith-engine`'s terrain
output but not modifying it. Likely needs its own golden-parity data set, extracted the same
way as Phase 1's (`PARITY_TESTING.md`), since settlement placement/suitability scoring is
exactly the kind of subtly-tuned system (soil × rainfall optimum, flood penalty, coastal
preference, etc. — see the root `CHANGELOG.md`'s "Settlement suitability: one function"
v1.30 entry) that's easy to silently get wrong in a fresh rewrite. The Journey Planner
(travel-time/route-condition modeling) is a large, largely self-contained sub-effort within
this phase — possibly its own later sub-phase rather than bundled with the core civ layer.

## Phase 3 — Rendering polish + 3D view

Brings back the 3D terrain-drape view deferred in `DECISIONS.md` §4. This is where
`REFERENCES.md`'s Godot terrain plugins (`Terrain3D`, `godot_heightmap_plugin`) get a real
evaluation pass — either as a dependency this project builds on, or purely as design
reference for a Godot-4-idiomatic clipmap/LOD terrain renderer. Also a natural point to
revisit 2D rendering fidelity (multi-octave grain, hillshading quality, NPR styles if
still wanted) beyond MVP's "basic and correct" bar.

## Phase 4 — Asset Library

The sprite/texture pack import and management system (HTML app's script block 3). Lower
priority than civ/rendering unless custom art becomes a nearer-term goal — flag with the
owner before starting this phase, since it may make more sense after Phase 3's rendering
work establishes what art actually needs to plug into.

## Phase 5 — Urban morphology engine

The procedural city-street-layout generator (HTML app's script block 4 — deliberately its
own self-contained, DOM-free engine in the JS codebase, which is a good sign this ports
cleanly into its own `cartalith-urban` crate later, depending on `cartalith-civ` for the
settlement context it needs).

## Ongoing, not a phase: LOD / large-world support

The HTML app's tiled-LOD deep-zoom system (excluded from MVP per `MVP_SCOPE.md`) matters
more as world sizes grow. Godot's own terrain plugins (Phase 3) may make a from-scratch
LOD-pyramid port unnecessary for the 3D case; the 2D case may need its own solution
eventually if huge maps (the kind of 20,000km worlds this repo's own recent
v2.05–v2.09 work was fixing rendering bugs for) turn out to be a real use case for the
native app too. Not scheduled into a specific phase — revisit once a concrete need shows up
rather than building it speculatively.

## Explicitly not roadmapped yet

Save-file **writing** (`SAVEFILE_COMPAT.md`'s deferred section), any store distribution work
(`DECISIONS.md` §6), a possible future WASM/browser target sharing `cartalith-engine`
(`DECISIONS.md` §2's stated benefit of the Rust choice, but never committed to as actual
work) — these are options this architecture keeps open, not commitments. Raise with the
owner if/when they become relevant rather than assuming they're implicitly scheduled.
