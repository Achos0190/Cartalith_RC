# Reading the HTML app's save files (`.zip`)

Scope: **MVP needs to READ an existing HTML-app `.zip` save and reproduce its terrain data.**
Writing a new save, or any other export format, is out of scope for MVP (`MVP_SCOPE.md`
points 12 and the "explicitly out of scope" list). Everything below was verified by reading
the actual `exportZip()`/`zipStore()`/`serializeState()`/`f32bytes()` functions in
`Cartalith Gen1 v2.10.html` directly (the current version as of this document — check the
root `CLAUDE.md`'s file table for whichever is current when this is actually implemented;
the format has been stable since v1.90 per the compression note below, but re-verify against
the live file rather than trusting this document blindly).

## It's a standard ZIP file — use the `zip` crate, don't hand-roll a parser

`zipStore()` (the writer) produces a genuinely standard PKZIP archive: local file headers
(`PK\x03\x04`), a central directory (`PK\x01\x02`), and an end-of-central-directory record
(`PK\x05\x06`), with standard CRC32 and standard compression method codes (`0` = STORE,
`8` = DEFLATE — raw deflate, matching what `CompressionStream('deflate-raw')` produces).
Nothing about this is a custom/nonstandard format. **The Rust [`zip`
crate](https://docs.rs/zip) (see `REFERENCES.md`) should read these files directly with no
custom parsing needed** — a real time-saver worth confirming early (open a real exported
`.zip` with the `zip` crate as one of the very first things `cartalith-io` does, before
building anything more elaborate on top).

Per the root `CHANGELOG.md`'s v1.90 entry, DEFLATE compression was added then (previously
STORE-only); the entry format itself (names/content) was unchanged by that version, and
every pre-v1.90 save still reads correctly through the same reader — so a `.zip` from any
reasonably recent HTML app version should Just Work through the standard `zip` crate too, as
long as it correctly handles both STORE and DEFLATE methods (the default `zip` crate build
does).

## The entries that matter for MVP

From reading `exportZip()` directly, a save `.zip` contains many entries (biome rasters,
resource-potential fields, settlement seeds, wildlife regions, an optional baked atlas, an
optional Asset Library payload, etc.) — **almost all of that is civ-layer/UI-layer output
that's out of MVP scope.** The entries that matter for a terrain-only reader:

| Entry | Contents | Format |
|---|---|---|
| `params.json` | `{ v: <engine version string>, GW: <width in cells>, GH: <height in cells>, state: <deep clone of the app's entire state object> }` | UTF-8 JSON |
| `heightmap.f32` | The raw heightmap, `GW*GH` values, row-major (`index = y*GW + x`) | Raw little-endian `f32`, no header — see below |
| `temperature.f32` | Temperature field, same layout, °C | Raw little-endian `f32` |
| `rainfall.f32` | Rainfall field, same layout, `[0,1]`-ish range | Raw little-endian `f32` |
| `volcanic_field.f32` | Volcanism stamp byproduct — only meaningful if craters/volcanoes are in the reproduction scope | Raw little-endian `f32` |
| `impact_field.f32` | Crater stamp byproduct, same caveat | Raw little-endian `f32` |
| `strahler_order.bin` | River network Strahler order, `GW*GH`, `0` = non-channel | Raw `u8` |

Everything else in a real export (`biome_raster.bin`, `lithology_raster.bin`,
`soil_fertility.f32`, `*_potential.f32` resource fields, `settlement_seeds.json`,
`wildlife_regions.json`, `koppen_raster.bin`, the atlas/Asset-Library payloads, `map.png`,
`README.txt`) exists in a real save and can be safely ignored by the MVP reader — either
skip unknown entries, or explicitly enumerate the ones read and ignore the rest. **Do not
error out on unrecognized entries** — a real save will always have more in it than the MVP
reads, and that's expected, not a corruption signal.

## `.f32` files are the simplest possible format: no header, native byte dump

`f32bytes(a)` (the writer) is literally `new Uint8Array(a.buffer.slice(0, a.length*4))` — the
raw bytes of a JS `Float32Array`, which is little-endian IEEE-754 on every real-world
platform. So a `heightmap.f32` entry is exactly `GW*GH*4` bytes, `GW*GH` little-endian
`f32` values, row-major, **no header, no length prefix, nothing else**. In Rust, once the
entry's raw bytes are extracted from the ZIP, this is a straight
`bytemuck::cast_slice::<u8, f32>(&bytes)` (mind alignment — the `zip` crate reader gives you
a `Vec<u8>`, which is allocator-aligned but not guaranteed `f32`-aligned; safer to construct
via `f32::from_le_bytes` in a loop, or copy into a fresh `Vec<f32>`, rather than assuming a
zero-copy cast is sound) or an explicit
`bytes.chunks_exact(4).map(|c| f32::from_le_bytes(c.try_into().unwrap())).collect()`.

## `params.json` gives you `GW`, `GH`, and everything needed to re-derive the world

`serializeState()` (the writer) is `{ v: VERSION, GW, GH, state: JSON.parse(JSON.stringify(state)) }`
— a full deep clone of the app's entire state object, which is large (every generation
parameter: `tect`, `volc`, `crater`, `climate`, `erosion`, `stream`, `glacial`, `coastal`,
`planet`, `world_structure`, `seed`, `mapWidthKm`, `seaLevel`, plus a lot of civ/UI-layer
state that's out of MVP scope). **For MVP, `cartalith-io` does not need to deserialize this
whole object into a fully-typed Rust struct.** Two reasonable approaches, either is fine to
start:
1. Parse as a generic `serde_json::Value` and pull out just the fields the terrain-only MVP
   actually needs (`GW`, `GH`, `state.tect.seed`, `state.mapWidthKm`, `state.seaLevel`, and
   whichever generation parameters the ported pipeline stages actually read).
2. Define a Rust struct with `#[serde(default)]` on every field you don't care about yet,
   growing it to cover more of `state` as more of the port happens (civ layer, etc.) —
   this is the more future-proof option and worth doing once the shape stabilizes, but
   starting with option 1 to unblock MVP is reasonable.

Either way: **read the real, current `serializeState()`/`state` object in the live HTML
file when implementing this**, don't rely on the field list summarized here staying
complete — `state` has grown substantially across the HTML project's ~210+ versions and
this document is not an exhaustive schema.

## What "reads a save" means for MVP, concretely

Given a real `.zip` exported by the HTML app: `cartalith-io` extracts `GW`/`GH`/seed/
map-width-km/sea-level from `params.json`, and the raw `heightmap.f32`/`temperature.f32`/
`rainfall.f32` arrays directly (no regeneration needed — the save already has the
generated fields). Godot then renders those fields exactly the way it renders a freshly
`generate()`'d world. This is actually **simpler** than the golden-parity generation path in
`PARITY_TESTING.md`, since there's no pipeline to re-run — it's closer to the golden-data
loading that testing path already needs, which is why `MVP_SCOPE.md` calls this "a second,
complementary source of golden test data": a real exported save doubles as a golden fixture
almost for free once this reader exists.

## Explicitly deferred (do not build now)

- **Writing a save.** Even just writing `heightmap.f32`/`temperature.f32`/`rainfall.f32` +
  a minimal `params.json` in the same format (which the HTML app could then re-open) is a
  reasonable near-future goal, but is NOT MVP scope — confirm with the owner before spending
  time on it.
- **Reading anything civ-layer/UI-layer** (settlements, factions, territory, ways,
  labels, icons, the Asset Library payload). None of that exists in the Rust port yet
  (`MVP_SCOPE.md`'s exclusions) — there's nothing to deserialize it INTO.
- **Round-tripping a save that was itself produced by loading an older HTML-app version**
  (i.e. `params.json` reflecting one of the many historical compat-shim defaults
  `loadZip()`'s own JS applies when opening an old save). MVP only needs to read a save
  produced by the current HTML app version.
