# MVP scope: terrain-only

This is the precise boundary for the first milestone. If something isn't listed under
**In scope**, assume it's out until `ROADMAP.md` says otherwise — don't creep scope by
"just also" porting something adjacent because it looked easy while you were in that part
of the code.

## In scope: the full procedural terrain pipeline

Maps directly onto script block 1 of `Cartalith Gen1 v*.html` (see the root `CLAUDE.md`'s
"Engine (block 1) essentials" section — read the live file for the actual implementation,
this list is the map, not the territory). Pipeline order, per that document:

```
continentality field
  → buildTectonicSubstrate()
      warp → plates → stress → flexure → base blur + age → heterogeneity → resistance → orogeny
  → height formula
  → normalize
  → volcanism + craters
  → flow(area)                    [initial flow accumulation]
  → climate                       [temperature + rainfall/wind simulation]
  → flow(discharge)               [rivers accumulate runoff]
  → erosion                       [droplet / stream-power / thermal — see note below]
  → hydrology / river network extraction
```

Concretely, in scope:

1. **Tectonic substrate generation** — plate assignment (Voronoi/JFA-style, matching
   `assignPlates()`), boundary stress, flexure, terrane age, heterogeneity, resistance,
   orogeny. Deterministic from a seed.
2. **Height formula** — combining the tectonic substrate into a base heightmap.
   Reproduce the actual formula from the JS engine; do not "improve" it (see `DECISIONS.md`
   §7 — this needs to be golden-parity-testable, not a fresh interpretation).
3. **Normalization** — min-max stretch to `[0,1]`.
4. **Volcanism and craters** — the point-feature placement/carving passes (`volc.count`,
   `crater.count` in the existing state schema).
5. **World-structure archetypes**, if reasonably in reach — the preset continentality/
   fragmentation/tectonic-energy bundles (Earth-like, Supercontinent, Archipelago,
   Volcanic, Rift, Islands) and the sea-level auto-anchoring fix that makes them behave as
   advertised (see the HTML project's own v1.25 CHANGELOG entry for why this one is
   trickier than it looks — sea level is NOT simply derived from continentality without a
   histogram-based re-anchoring step).
6. **Climate simulation** — temperature (latitude + lapse rate + axial tilt/rotation
   grounding, see the root `CLAUDE.md`'s `state.planet` paragraph), wind, and rainfall.
   Ocean-current terrain coupling (`computeOceanCurrent`/`deflectFlow`, the subject of this
   repo's own v1.77–v1.82 and v2.10 work) is a reasonable stretch goal for MVP but not a
   hard requirement — flag explicitly in the port's own docs if it's deferred, don't quietly
   drop it.
7. **Erosion** — the droplet/stream-power/thermal erosion kernels. In the JS engine these
   run in Web Workers for parallelism; the natural Rust equivalent is `rayon` or
   `std::thread` — this is a real architectural decision to make explicitly, not default
   into, when this stage is actually ported (document the choice and why in the new repo's
   own changelog when it happens).
8. **Hydrology / river network** — flow accumulation, Strahler ordering, river polyline
   tracing, and the real-km-aware channel width scaling (this repo's own v2.07 work) — a
   river should visibly scale with map width the same way it does in the current app.
9. **Sea level** — the `state.seaLevel` slider/threshold and its interaction with
   world-structure archetypes (see point 5).
10. **Basic 2D rendering** — a colored map view (biome/elevation-tinted, hillshaded) good
    enough to visually verify what was generated. This does NOT need the JS engine's full
    rendering sophistication (multi-octave grain, NPR styles, splat textures, LOD
    tile pyramid) — a straightforward heightmap-to-color-to-texture path is enough for MVP.
    LOD/tiling for huge worlds is explicitly a later phase (see `ROADMAP.md`).
11. **A minimal UI** — enough controls to set a seed, resolution, and map width, and trigger
    generation. Does not need to match the existing app's sidebar/tab layout.
12. **Loading the HTML app's `.zip` save files** — the port must be able to open a save
    file exported by `Cartalith Gen1 v*.html` (`File → Export .zip`) and reproduce/display
    the terrain fields (height/temp/rain/flow) it contains. See `SAVEFILE_COMPAT.md` for the
    full scope of this — MVP requires **reading** an existing save's terrain data, not
    writing a new save the HTML app can re-open (round-trip write compatibility is a later
    phase, see `ROADMAP.md`). This is also a second, complementary source of golden test
    data alongside the extraction process in `PARITY_TESTING.md` — a real exported save
    IS golden data.

## Explicitly out of scope for MVP

- **Civilization/politics layer** — factions, settlements, provinces, religions,
  governments, trade, journey planner. (Script block 2 of the HTML app.)
- **Asset Library** — the sprite/texture pack import/management system. (Script block 3.)
- **Urban morphology engine** — procedural city street layouts. (Script block 4.)
- **Sculpt editor** — manual terrain painting/stamping.
- **3D terrain view** — see `DECISIONS.md` §4.
- **LOD tile pyramid / deep-zoom rendering** — the existing app's whole tiled-LOD system
  for exploring huge worlds at high detail. MVP renders at whatever resolution is generated,
  no reverse-mipmap tiling.
- **Writing new save files, and every export format other than reading the HTML app's own
  terrain data** — GeoJSON export, PNG tile export, writing a NEW `.zip` the HTML app could
  re-open, and any other persistence format are all later concerns. The one save/load
  capability that IS in scope — reading terrain data out of an existing HTML-app `.zip` —
  is scoped precisely in point 12 above and `SAVEFILE_COMPAT.md`; do not read that as a
  general "add save/load" license.
- **NPR rendering styles, parchment/ink/watercolor/etc. filters, splat texturing.**
- **Multi-resolution baking, atlas export.**

## Success criteria — what "done" looks like

The terrain-only MVP is complete when **all** of the following are true:

1. Given a fixed seed, resolution, and map-width-km, the Rust engine produces a heightmap
   (and temperature/rainfall/flow fields) that match golden data extracted from the JS
   engine at the same seed, within the tolerance defined in `PARITY_TESTING.md`.
2. The generated world renders as a recognizable, correctly-colored 2D map inside the Godot
   application (land/water distinction, elevation-appropriate biome coloring, visible rivers,
   at minimum).
3. The application **builds and runs as a Windows `.exe`** produced by this session, and the
   owner has confirmed it actually runs on a real Windows machine.
4. The application **builds and exports as an Android `.apk`** produced by this session,
   and the owner has confirmed it actually installs and runs on a real Android device.
5. World-width scaling (map-width-km) demonstrably affects generated feature scale the same
   way it does in the current JS app (rivers, relief detail) — not because it was
   separately re-implemented, but because the golden-parity discipline in point 1 already
   forces it to.
6. A short changelog-style writeup exists (in the new repository once it's created)
   describing what was ported, what was verified how, and what's explicitly deferred —
   matching this project's own documentation discipline, not a silent "it's done."
7. The application can **open a real `.zip` file exported from `Cartalith Gen1 v*.html`**
   and render that save's own terrain — confirmed by comparing what's displayed against
   what the HTML app itself shows for the same file, not just "it didn't crash." See
   `SAVEFILE_COMPAT.md`.

Point 3 and 4 are genuinely gated on the owner's own hardware per `DECISIONS.md` §5 — the
cloud session can confirm the builds succeed and pass headless checks, but "confirmed to run
on real hardware" is not something this session can self-certify.
