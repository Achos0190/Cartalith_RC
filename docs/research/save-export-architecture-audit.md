# Save/export architecture audit — duplicate data & UI naming (Tiles & LOD / Atlas / Layers / World)

Owner-requested audit (2026-07-13): "the generated savefile/export seems convoluted/polluted... multiple
sources of source and display information competing for the same system resources... check the program
for double data under different names (like Tiles and LOD) and how Atlas and Layers and World is used."
Read-only pass — no code changed. Owner picked "show me the full audit first" + "backward compatibility
can break" for whenever a restructuring pass follows.

## Verdict

**Two different problems, worth separating:**

1. **The save file (`exportZip()`) genuinely writes overlapping map imagery from three independent code
   paths** for the same terrain — this is real, quantifiable bloat, and safe to trim (nothing else reads
   its own output back in; `loadZip()` never requires `map.png`/`tiles/*`/`layers/*.png` to exist).
2. **"Tiles & LOD" / "Atlas" / "Layers" / "World" is a genuine UI naming muddle**, but not a data
   *architecture* problem — "Atlas" is a subsection nested two levels inside "Tiles & LOD," not a sibling
   system, and "Layers" is a pure view-selector with no storage of its own. Fixing this is a markup/IA
   pass, not a data-model change, and doesn't touch the save format at all.

What is **not** duplication, despite looking like it at first glance: `biome_raster.bin` vs
`biome_baked.bin` are two *different classifiers* (see §4) for two different consumers, and
`heightmap.f32` vs `heightmap_rg16.bin` is a deliberate full-precision/portable-fallback pair (comment at
the write site says so explicitly). Flagging these so a restructuring pass doesn't "fix" something that
isn't broken.

---

## 1. What "World" / "Tiles & LOD" / "Atlas" / "Layers" actually are

Four different UI surfaces the owner named, mapped to what they actually control:

| Name (as seen in UI) | What it actually is | Where |
|---|---|---|
| **World** | The top-level Generate tab (`#genWorld`) — the whole simulation-parameter sidebar: Finalize, Geology, Hydrology (5 nested erosion-op accordions), Climate, Ecology, Manual Terrain, 3D view, **Tiles & LOD**. Not a data source itself — a container. | markup ~L744–1112 |
| **Tiles & LOD** | One `<details class="cat-acc">` accordion *inside* World, bundling **three unrelated concerns** under one label (see §2). | markup L1064–1112 |
| **Atlas** | A `<details class="acc">` **nested inside** Tiles & LOD (not a sibling / not top-level) — the persistent IndexedDB bake cache. Confusingly, the export code and several comments also call the *embedded pyramid data in the save file* "the atlas," so the word means "a UI accordion" and "a data blob" depending on context. | markup L1096–1106; code `atlas*` functions ~L7900–8250 |
| **Layers** (popover, canvas-side funnel icon) | A pure **view selector** for `state.debug` — proxies clicks to the hidden sidebar `#debugSeg`. Holds no data of its own; picking a layer just changes which field the *existing* renderer reads. Not part of the duplication problem. | markup ~L529–585 (`#layersFab`), wiring ~L9970+ |

**"Tiles & LOD" is the actual muddle** — it bundles three independently-useful, independently-triggered
features that happen to all involve "tiles" as a word, under one accordion (L1064–1112):

| Sub-feature | Trigger | Output | Travels with main save? |
|---|---|---|---|
| **Live preview** (`lodChk`/`lodAutoChk`/`zoomDetailR`) | Zooming in / checkbox | Nothing persisted — a rendering *mode* (`_lodOn`, `drawLODView()`) | N/A (not data) |
| **Atlas (IndexedDB bake)** (`lodBakeBtn`/`lodClearAtlasBtn`) | Manual "Bake" click, or "Bake ALL levels & finalize" | Chunks in browser IndexedDB, keyed by world | Yes — `atlasExportEntries()` embeds it (§3) |
| **Export tile grid** (`regionBtn`/`refineBtn`) | Manual "Refine & export" on a selected region | A **separate, standalone** `region_<seed>_<cols>x<rows>_<px>px.zip` download | **No** — own file, own `params.json`, never touches `exportZip()` |

None of these three needs the others to function. A UI pass could give each its own clearly-labeled
top-level disclosure (or split "Tiles & LOD" into "Live LOD view," "Atlas cache," "Region export") without
touching a single byte of the save format — pure markup/copy change, low risk.

---

## 2. The save file (`exportZip()`, L9212–9252): full inventory

Every entry the "File → Export .zip" button writes, grouped by what it actually is:

### 2a. Master data (single source of truth — keep as-is)
`params.json` (`serializeState()`), `heightmap.f32`, `temperature.f32`, `rainfall.f32`,
`volcanic_field.f32`, `impact_field.f32`, `tidal_range.f32`, `lithology_raster.bin` +
`lithology_index.json`, `soil_fertility.f32`, `water_access.f32`, 5× resource-potential `.f32`,
`carrying_capacity.f32`, `settlement_suitability.f32`, `population_density.f32`, `strahler_order.bin`,
`koppen_raster.bin` + `koppen_index.json` (seasons on). These are the only place this data lives; nothing
else in the export re-encodes them. **No overlap found here.**

### 2b. Deliberate portability/format fallbacks (not duplication — documented at the write site)
- `heightmap_rg16.bin` — 16-bit-packed portable fallback *alongside* `heightmap.f32`. Comment: "portable
  16-bit-packed height... `.f32` above stays the full-precision round-trip." Intentional pair, small
  (2 bytes/cell vs 4), keep.
- `biome_raster.bin`/`biome_index.json` vs `biome_baked.bin`/`terrain_baked.bin`/`cartalith_grid.json` —
  **see §4, not duplication**, different classifiers for different consumers.

### 2c. Genuine overlapping map imagery — three independent renders of the same terrain
This is the real bloat. All three exist purely so *something* opens the .zip and sees a picture without
decoding the raw arrays — but three different code paths do that job, unconditionally, every export:

| Entry | Built by | Resolution | Purpose (as commented) |
|---|---|---|---|
| `layers/biome.png`, `hillshade.png`, `temperature.png`, `rainfall.png` (4 files, L9242-9243) | `layerBytes(mode,debug)` → toggles `state.mode`/`state.debug`, calls `renderNow()`, reads the canvas | Fixed at whatever `#view` canvas size currently is | Quick raster reference for *specific* debug views, always all 4, always included |
| `map.png` **or** `tiles/*` + `tiles/index.json` (L9244-9245) | `bakeSingle(W)`/`bakeTiled(W)` — a **fresh, independent** per-pixel bake via `bakePixel()`, at the resolution the user picked in the Export form (`#bakeRes`, up to the tiled path for anything that won't fit as one canvas) | User-chosen (1K–16K+) | "The rendered map" — the actual usable full-res output |
| The embedded **Atlas pyramid** (L9246, `atlasExportEntries(true)`) | Whatever the user has baked via Tiles & LOD → Bake / Bake ALL levels — potentially **many** chunk PNGs across multiple LOD levels (0 to `state.lodMaxLevel`, default 8) | Per-chunk tile size (512–4096px, user-set) × however many levels/chunks are baked | The in-app LOD viewer's own cache, so re-opening the project has instant deep zoom |

All three are **unconditional** (`layers/*.png` and `map.png`/`tiles/*` always run; only the Atlas embed
is naturally empty if nothing was baked) — there is no "skip the redundant one" logic. A world with a
fully-baked 8-level atlas AND a 16K tiled `map.png`/`tiles/*` bake AND the 4 `layers/*.png` previews is
carrying the same visual information four times over at up to four different resolutions.

**Sizing intuition** (not measured — the harness has no way to generate a real multi-MB world and diff
zip sizes headlessly): `layers/*.png` are small (canvas-sized, typically well under 1MB combined) and
probably not worth optimizing away for their own sake. `map.png`/`tiles/*` and the Atlas pyramid are
where the real weight is — a fully-baked 8-level atlas on a large map can be many chunks × up to 4096px
each; a 16K `map.png` bake is tens of MB on its own. These two are the ones actually worth reconciling
(§5 options).

### 2d. Opt-in extras (already off by default — not part of the "convoluted by default" complaint)
- **Channel atlas** (`chanAtlasChk`, off by default) — `channelAtlasEntries()` packs affordance/resource/
  class fields into 8-bit RGB PNGs. Comment states explicitly: *"The full-precision .f32 / _raster.bin
  blobs remain the master copies"* — this is a self-declared, opt-in, lossy visual convenience layer, not
  silent duplication. Already correctly gated; not a target for restructuring.
- **Asset Library entries** (`window._alExportEntries()`) — imported textures/sprites, genuinely unique
  data, no overlap with anything above.

---

## 3. "Atlas" the word vs "atlas" the data — two things, one name

Worth naming explicitly since it's a likely source of the owner's "double data under different names"
read: the codebase uses **"atlas"** for two related-but-distinct things:

1. **The IndexedDB bake cache** (`_atlasBaked`, `atlasGet`/`atlasPut`, `atlasSyncWorld`) — lives in the
   browser, keyed by `worldKey()`, survives page reloads without ever touching a save file.
2. **The embedded pyramid entries inside `exportZip()`'s output** (`atlasExportEntries()` /
   `atlasImportEntries()`) — a *serialization* of (1) into the .zip so the project travels with its bakes.

These are the same underlying chunks at two different rest states (browser storage vs. zip bytes), not
two competing systems — but the shared name for "the IndexedDB thing," "the UI accordion for the
IndexedDB thing," and "the zip-embedded copy of the IndexedDB thing" is exactly the kind of naming
collision that reads as more systems than actually exist.

---

## 4. Why `biome_raster.bin` ≠ `biome_baked.bin` (flagged so it's not "fixed" by mistake)

Owner's own example callout. Traced both classifiers (L5122–5201):

- **`buildBiomeRaster()`** → `biome_raster.bin`: this engine's own 12-class **climate-only** vocabulary
  (`BIOME_KEYS`, water=0/13) — feeds wildlife, settlement suitability, carrying capacity internally.
  Pure function of temperature + rainfall + water body.
- **`buildCartBiome()`** → `biome_baked.bin` (RLE, `encodeBiomeRLE`): a **different, 15-class** vocabulary
  (`CART_BIOMES`) ported from the legacy `Cartalith_V1.914` editor's paint palette, with **elevation and
  slope overrides climate alone doesn't have** (Mountain Highland at r>0.62, Hills at r>0.40, Wetlands at
  high-moisture+flat+low, Coastal Lowland override, etc. — see the branch chain at L5146–5152). It also
  merges in hand-painted overrides (`paintBiome`) before encoding (exportZip L9229-9231) — something
  `biome_raster.bin` never does.

Different classification rules, different consumer (this app's internal affordance math vs. the
downstream Cartalith editor's paint layer), different on-disk format (raw Uint8 raster vs. RLE). **Not
duplication** — restructuring should leave this pair alone. Same reasoning applies to
`terrain_baked.bin`/`cartalith_grid.json` (no raw-terrain-index equivalent exists to compare against; it's
a single-purpose export for the same downstream editor).

---

## 5. Options for a restructuring pass (not yet built — owner to prioritize)

All of these are additive/subtractive to `exportZip()` only; none require a `loadZip()` change beyond
graceful-missing-file handling it already has (every `z['...']` read is already `if`-guarded). Owner
confirmed backward compatibility is not a blocker.

**A. Collapse the three-way map-imagery overlap (§2c) — biggest size win.**
Concretely: since the Atlas pyramid (when populated) already contains the full LOD-viewable render at
every baked level, `map.png`/`tiles/*` only earns its cost when *nothing* has been baked yet (i.e., it's
covering for an empty atlas). Options, not mutually exclusive:
  - A1. Skip `map.png`/`tiles/*` entirely when the Atlas has ≥1 baked chunk for this world (the atlas
    already carries an equivalent-or-better render); keep it as the fallback when the atlas is empty.
  - A2. Drop the 4 `layers/*.png` preview files by default, behind an opt-in checkbox next to Export
    (mirrors how the channel atlas is already opt-in) — they're the smallest piece but also the most
    purely decorative (nothing reads them back on import).
  - A3. Leave both, but make BOTH opt-in checkboxes in the Export form (current behavior: unconditional).

**B. Tiles & LOD → three clearly-separated sections.** Split the one `<details>` at L1064 into three
top-level ones ("Tiled LOD view," "Atlas cache," "Region export"), each with copy that doesn't reuse the
word "tile" for three different things. Zero data/format risk — pure markup + a `docs`/`CLAUDE.md` pass
so future sessions stop treating "Atlas" as a sibling of "Tiles & LOD" in their own mental model.

**C. Rename "atlas" occurrences for clarity** (§3) — e.g. keep "Atlas" for the UI accordion / IndexedDB
cache, call the zip-embedded copy "baked tiles" or similar in comments/manifests, so grep and code review
don't conflate "the cache" and "its serialization" as one thing.

No recommendation forced here — owner asked for the audit before deciding scope; A is the only one with
a real save-size payoff, B/C are pure clarity and can land independently/first since they carry no
compatibility risk at all.
