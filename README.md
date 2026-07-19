# Disclaimer

I'm gonna be straight-up with all of you. This has been created entirely with the aid of Claude and other LLM's. I've tried my best to direct the whole thing in academically grounded information and tried to make sure that where it used work from others it would credit where credit is due. 

# Cartalith Gen1

A single-file HTML worldbuilding tool: procedural planet generation (tectonics → climate →
erosion → biomes), a cartographic civ/politics layer, and a built-in asset library — all in one
zero-dependency HTML file.

## Use it

Open the newest **`Cartalith Gen1 v*.html`** (currently **`Cartalith Gen1 v1.14.html`**) in a
modern browser. It works straight from `file://`; a local HTTP server is optional (enables a few
extras like multicore worker pools on some browsers) and nothing breaks without it.

Older versions (`v0.57`, `v0.6`) are kept for reference and are never edited in place — every
release is a new file. **Version naming uses a two-digit minor from v0.61 on** (v0.61, v0.62, …
v0.70): naive version sort compares the minor numerically, so a `v0.7` would sort *before*
`v0.61` and break "pick the newest file" tooling.

## Repository layout

| Path | What it is |
|------|------------|
| `Cartalith Gen1 v1.14.html` | **The tool.** Current version |
| `Cartalith Gen1 v0.57/v0.6/v0.61…v1.13.html` | Previous versions (kept, frozen) |
| `Cartalith_V1.915.html` | The pre-merge map editor, kept as a reference implementation |
| `urban-morphology/` | Standalone procedural city-layout PoC; its engine was ported into Gen1's 4th script block (v0.95) — kept as reference, never edited |
| `assets/` | CC0 sample asset pack + its generator script |
| `docs/` | Handoff, roadmap, design plans, research reports |
| `tests/` | Headless verification suite (engine + urban-morphology) + Playwright perf/bit-identity harness |
| `legacy/` | Historical merge tooling — non-functional here, provenance only |
| `CHANGELOG.md` | Per-version engine log (v0.037 → current) |
| `CLAUDE.md` | Architecture, invariants, and working rules (agent-session entry point) |

There is **no build step**: the Gen1 file is the source of truth and is edited directly.
The scripts in `legacy/` are the abandoned merge strategies that produced the first unified
file; their inputs are not in this repository (see `legacy/README.md`).

## Verify

```bash
tests/run.sh                                 # newest Gen1 file → 911-assertion headless suite
tests/run.sh "Cartalith Gen1 v0.57.html"     # explicit target
node tests/perf/hash_gen1.js A.html B.html   # A/B bit-identity battery (Playwright)
```

The headless suite covers the generator engine's CPU paths. GPU, Web Worker, and canvas
interaction changes need a manual browser pass.

## License

Apache 2.0 — see `LICENSE`.
