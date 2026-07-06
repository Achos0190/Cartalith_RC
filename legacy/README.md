# legacy/ — historical merge tooling (non-functional in this repo)

These files document how the three standalone tools (elevation foundation, Cartalith editor,
asset-pack compiler) were merged into the single **Cartalith Gen1** file. They are kept for
provenance only — **none of them can run here**, because their inputs were superseded and are
not part of this repository:

- `elevation_foundation_v0.144.html` — the pre-merge generator (absent; its engine lives on as
  script block 1 of the Gen1 file)
- `asset_pack_compiler.html` — the standalone asset compiler (absent; rebuilt as the Asset
  Library, script block 3 of the Gen1 file)

`Cartalith_V1.915.html` (the pre-merge editor) is still at the repo root as a reference
implementation.

## The three merge strategies, in order

1. **iframe srcdoc shell** — `build_rc.js` + `rc_shell.html` + `rc_bridge.js` (+ `verify_rc.js`,
   and `build_gen3.py`, a patched variant). Each unmodified tool was escaped into a
   `<script type="text/html">` carrier and rendered via `iframe.srcdoc`, with a postMessage
   bridge. Abandoned: srcdoc iframes break Web Workers / WebGL2 / IndexedDB under `file://`.
2. **Shadow-DOM mounts** — `build_gen4.py` + `gen1_harness.js` (+ `verify_gen4.js`,
   `proxy_test.js`). Each tool mounted into its own shadow root in ONE document, with
   `window`/`document` proxied per tool. Same-origin, so Workers/WebGL2/IDB worked. Abandoned
   in favour of a real merge.
3. **True merge** — `build_gen1.py` produced the first genuinely unified file. From there the
   merged file was hand-evolved (v0.57 → v0.6 → v0.61 …) and is now the **source of truth**;
   no build step reproduces it.

If you are looking for the current tool, it is the newest `Cartalith Gen1 v*.html` at the repo
root. See the root `README.md` and `CLAUDE.md`.
