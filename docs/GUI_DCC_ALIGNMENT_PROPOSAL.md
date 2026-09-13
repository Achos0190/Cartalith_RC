# Bringing the Gen1 HTML UI in line with the native port's DCC shell

> **Status: a proposal.** No code in `Cartalith Gen1 v2.15.html` was changed to write
> it. Every claim about either codebase below was checked by opening the file; the
> symbol or element id that was read is named inline so a reader can re-check it
> rather than trust this document. Where the port's own design documents contradict
> each other, §6 says so instead of picking a winner silently.
>
> Target file: `Cartalith Gen1 v2.15.html` (32 059 lines; four `<script>` blocks, one
> `<style>` block at lines 7–508, body markup 510–2109).
> Design source: `/home/user/Cartalith_GDT` (the Rust/Godot port repository).

---

## 0 · Which port document is actually the authority

The brief's reading list is partly superseded. `Cartalith_GDT/CLAUDE.md` warns that
its own documents go stale and that *"a document's claim about itself is a claim, not
evidence"*, so this section establishes the ranking before anything is derived from
it. Verified by listing `design/` and reading each import's own README.

| Rank | Document | Date | What it governs | Verified by |
|---|---|---|---|---|
| **1** | `design/dcc-environment-2026-08-31/spec/00`–`06` (6 files, ~370 KB) | 2026-08-31 | **Everything: frame, tokens, rail, menus, docks, bars, phone.** Six specification passes over the two newest prototypes | `spec/00-REPLACEMENT-PLAN.md` opens with the owner instruction *"Replace the current GUI, do not upgrade. Fully replace."* |
| **1** | `design/dcc-environment-2026-08-31/Cartalith DCC Environment.dc.html` + `Cartalith Android.dc.html` | 2026-08-31 | The canvases the specs above were read from | `design/dcc-environment-2026-08-31/README.md` |
| 2 | `DCC_SHELL_SPEC.md` | 2026-08-19, patched to 2026-08-24 | Control-by-control detail **not** restated by rank 1 (§2 menus, §4.5 tool semantics, §12 iconography) | its own top-of-file supersession notices |
| 3 | `UI_SHELL_DESIGN.md` | 2026-08-18 | The *rule set* — the governing split, disclosure grammar, "drawn not borrowed" | file header |
| 4 | `DESIGN_HANDOFF.md` | undated | Onboarding narrative. **Its structural facts are stale — see §6** | read in full |
| 5 | `DCC_CONTROL_INDEX.md`, `GUI_GAP_REGISTER.md` | 2026-08-18 → 2026-08-29 | History and per-control provenance, explicitly *"history, not status"* | `GUI_GAP_REGISTER.md` line 3 |

**Consequence for this proposal:** the frame geometry, token values and domain tree
used below come from `spec/01-frame-and-tokens.md` and `spec/02-rail-and-domains.md`,
**not** from `DCC_SHELL_SPEC.md` §1 or `DESIGN_HANDOFF.md` §4/§7, both of which are
one or two revisions behind (§6).

---

## 1 · What the DCC shell actually is

### 1.1 Owner rulings (binding, not negotiable)

Each is quoted verbatim in the port repo; each is dated; none is a proposal.

| Ruling | Date | Where |
|---|---|---|
| *"Replace the current GUI and replace it in full by the DCC version including all it's wiring and functionality."* | 2026-08-18 | `DCC_SHELL_SCOPE.md`, "THE HOLD IS LIFTED" |
| *"In essence always follow the newer design or use the design principles from the DCC versions to fill in gaps."* → **the newer canvas wins; where none exists, derive from the DCC vocabulary; an owner decision is newer than any canvas** | 2026-08-25 | `DCC_SHELL_SCOPE.md`, "WHICH CANVAS WINS" |
| *"Infra can be dropped as a name and can be absorbed by civil"* … *"And render into carto."* — five domains → **three** | 2026-08-20 | `DCC_SHELL_SPEC.md` top-of-file notice |
| *"Infra gets absorbed by civil and render by Carto."* (re-affirmed) | 2026-08-31 | `spec/00-REPLACEMENT-PLAN.md` §1.1 |
| *"the vault menu can be shoved into data"* — no top-level Vault menu | 2026-08-24 | `DCC_SHELL_SPEC.md` top-of-file notice |
| *"Replace the current GUI, do not upgrade. Fully replace."* | 2026-08-31 | `spec/00-REPLACEMENT-PLAN.md` line 3 |

### 1.2 The governing split (`UI_SHELL_DESIGN.md`, the rule set)

> **The top bar is about the program, the map is about the world.** A control that
> changes the world belongs to a workspace; a control that changes the program
> belongs to a menu.

Consequences the rule set states explicitly, all of which bear on the HTML app:

- **Seven menus, program scope only**: File · Edit · Assets · Data · Preferences ·
  Window · Help. There is **no Generate, Simulate, Render or View menu** — those are
  workspaces on the domain rail.
- **GPU acceleration, render quality, tiled LOD and the atlas cache are *program*
  settings** and live under Preferences, *"not beside the terrain sliders they used
  to sit next to."*
- **Five disclosure levels, never six**: L1 domain → L2 ▾ category → L3 § section →
  L4 › group → L5 + advanced. *"A sixth level means the L2 category is wrong."*
- **Dependency order beats menu order.** The generation pipeline is sorted by what
  informs what and *"is never re-sorted alphabetically or by frequency of use."*
- **Non-destructive by default.** Sculpt/paint/style produce drafts; nothing reaches
  the heightfield until an explicit Commit; **no presentation control ever marks a
  generation stage stale.**
- **Drawn, not borrowed.** *"No emoji."* Every glyph is a 16×16 inline SVG,
  `fill:none; stroke:currentColor; stroke-width:1.2`, round caps, **one weight only**.
  Text symbols stay text — `▾ ▸ ‹ › ⌄ ● ○ ☑ ☐ ✓ ✕ ＋ ⌫ ↶ ↷ ▶ ⏸ ☰ ▤ ⋯ 🔒`.
- **No fills on panels: regions are separated by hairlines only. Radius 0 everywhere.**

### 1.3 Frame geometry — the six regions

From `spec/01-frame-and-tokens.md` §3.1. Composition is **flex column**, not grid.
Region 4 is the only flexible child.

| # | Region | Height | Condition | Border |
|---|---|---|---|---|
| 1 | Menu bar | `--menuH` 36 | always | `border-bottom: 1px var(--hair)` |
| 2 | **Horizontal tool rail** | `--tbH` 40 | only when the armed tool is sculpt/freehand/biome/measure | `border-bottom` |
| 3 | **Tool-options bar** | `--tbH` 40 | always | `border-bottom` |
| 4 | **Middle band** | `flex:1; min-height:0` | always | none |
| 5 | Timeline | collapsed `calc(--sbH - 2px)`, expanded auto | conditional | `border-top` |
| 6 | Status bar | `--sbH` 26 | conditional (`showSB`, default on) | `border-top` |
| — | Toast layer | absolute, `pointer-events:none`, z 90 | always | — |

Region 4's children, left → right (`spec/01` §3.6):

| Child | Width | Notes |
|---|---|---|
| (a) Domain rail | `--railW` 40 | 3 vertical cells `WORLD · CIVIL · CARTO`; active = `color:var(--acc)` + `background:var(--wash)` + `box-shadow: inset -2px 0 var(--acc)` |
| (b) Rail-expansion column | 200 (literal, no touch override) | 3 headers + 10 nodes; `railExp` default **false** |
| (c) **Left dock** | `--ldW` 372 | header → optional a/b switch → **TOOLS block** → scrolling body |
| (d) collapsed left strip | `--railW` 40 | `›` + vertical label |
| (e) Viewport | `flex:1; min-width:0` | never scrolls |
| (f) **Right dock** | `--rdW` 304 | header **mirrored** (close `›` first, title right-aligned) |
| (g) collapsed right strip | `--railW` 40 | label in `var(--acc)`, unlike the left strip's `var(--dim)` |

Four frames, not three: `w1920` (base) · `w1366` (`--ldW:330 --rdW:280 --pop:280`) ·
`tabL 2560` · `tabP 1600×2560` (both touch, all 17 metric tokens replaced). Phone is a
separate shell (`spec/06-phone.md`, 412 dp reference).

### 1.4 The three domains and their ten nodes

`spec/02-rail-and-domains.md` §3, and the mode→dock mapping in its §4:

| Domain | Node | mode | Left-dock block |
|---|---|---|---|
| WORLD | Generation pipeline | `a` | ten-stage accordion |
| | Sculpt | `b` | `GEOLOGICAL FEATURE` + presets + brush params |
| CIVIL | Landmarks | `landmarks` | placement, crowding, radii, class chips, funnel |
| | Factions & settlements | `factions` | `FACTIONS` list, `civPlaces` |
| | Ways & routes | `infra` | `WAYS · {count}`, way rows |
| | Journey planner | `planner` | route header, plan groups, stages |
| CARTO | Layers & style / Labels / Icons / Terrain appearance | `''` ×4 | two blocks, **both always** |

> `spec/02` §3a flags CARTO's four nodes as carrying no mode and asks the owner
> whether they select four panels or collapse to one (`spec/00` §5 item 2, still
> open). Until that is answered, CARTO's node split is a **proposal**, not a ruling.

### 1.5 Token set (`spec/01` §2.1)

Dark, 21 colour tokens + 17 metric tokens. The ones that matter for a port:

```
--sur #0d0e0f   --pan #121314   --ins #191c1e
--ink #e8ebec   --body #c8cbcd  --sec #a9adb0
--dim #8d9296   --faint #6f7478 --dis #5f6468
--acc #e0a34a   --accH #f0bd72  --accInk #141005
--hair rgba(255,255,255,.10)    /* structural: region + dock borders  */
--div  rgba(255,255,255,.07)    /* in-panel: list rules, menu seps    */
--bor  rgba(255,255,255,.16)    /* outline of anything that FLOATS    */
--wash rgba(224,163,74,.09)     --wash2 rgba(224,163,74,.16)
--good #6fae7d  --block #c96a5a --water #6a9bc4
--shadow 0 14px 34px rgba(0,0,0,.55)
```

`DESIGN_HANDOFF.md` §3 states the load-bearing part: *"`line` at .10 and `border` at
.16 are different values and the difference is load-bearing. Drawing both at .10 is
why the shell's chips once read as suggestions rather than as edges."*

Type: UI in Helvetica Neue / system sans at `--fs` 11.5; **all numeric readouts, codes,
shortcuts and section labels in IBM Plex Mono** at `--m0` 10.5 / `--m1` 10 / `--m2` 9,
letter-spacing .12–.26 em.

### 1.6 What the design does **not** have behind it

`DCC_SHELL_SPEC.md`'s own top-of-file corrections, all verified against v2.15:

1. **§5.1's "Run stage *n*" / "Run *n* → 10" / "stale from *n*" describe a capability
   that exists nowhere.** Verified here: `tparam()` (v2.15 line 13648) is
   ```js
   el.addEventListener('change',()=>{ apply(+el.value); withBusy('generating…',generate); });
   ```
   — every generation slider re-runs the whole of `generate()` on release. There is no
   staleness to surface. **Do not draw the ✓/●/○ stage dots or a stale-from readout in
   the HTML app**; they would be exactly the "control with nothing behind it" that
   `DESIGN_HANDOFF.md` §9.1 calls a defect.
2. §5.2's Brush shape / Stroke & grid / Actions blocks *"have no engine behind them and
   are not in the reference either."* Confirmed independently by
   `PORT_ONLY_FEATURES.md` line 134.
3. §12's own text-symbol premise is partly false: IBM Plex Mono is missing
   **✕ ● ○ ▾ ▸ ▶ ＋** (checked against the font's cmap by the port). Relevant here only
   if the HTML app were to ship Plex — which it cannot (§5).

---

## 2 · Gap table — current HTML element → DCC equivalent → verdict

Every `#id` in the left column was confirmed present in `Cartalith Gen1 v2.15.html`.
Verdicts: **aligned** · **rename** (cosmetic/relabel only) · **restructure** (move or
regroup existing wired controls) · **missing** (no surface; the engine half may exist) ·
**n/a** (Godot-shell-specific; see §5).

### 2.1 Frame regions

| Current | DCC equivalent | Verdict |
|---|---|---|
| `<header>` — wordmark, `#verTag`, `#phaseChip`, `#findInput`, `#undoBtn`/`#redoBtn`/`#undoMem`, `#fileMenuBtn`+`#fileMenu`, `#assetsHeaderBtn`, `#themeToggleBtn`, `#creditsBtn` | Region 1, menu bar (7 menus + `↶ ↷` + spacer + world label + `◐` theme) | **restructure** — the region exists and holds roughly the right *kinds* of thing; only File is a menu. Undo/redo/theme already sit in the DCC's own positions |
| — | Region 2, horizontal tool rail (`SCULPT`/`PAINT`/`MEASURE` switch + brush params) | **missing**. Its content exists as the `Brush & noise` accordion inside `#genSculpt` |
| — | Region 3, tool-options bar | **missing**. Its content exists as three sidebar rows: `#civPoiTypeRow`, `#civTerritoryToolRow`, `#civWayDrawRow` |
| `.stage` (`display:flex`, line 22) | Region 4, middle band (`flex:1; min-height:0`) | **aligned** |
| `#genSubBar` (`World/Civilization/Cartography/Sculpt`) + `#tabBar` (`Generate/Explore`) | (a) domain rail, 3 vertical cells | **restructure** — see §3, stage 3 |
| `#civSubBar` (5 civ pages) | (b) rail-expansion column, 10 nodes | **restructure** |
| `<aside>` — `width:324px` (360 ≥1440px), `border-left`, **on the right** | (c) left dock, `--ldW` 372, on the **left** | **restructure** — the side is wrong; the width is close |
| `.canvas-wrap` / `.canvas-stack` | (e) viewport | **aligned** |
| `#inspector` + `#civInfoPanel` + `#readout` + `#genSculpt`'s `Stamp stack` | (f) right dock, contexts Sample / Layers / Stamp stack / Settlement / Faction / Route | **restructure** — all four content sources exist, all four live inside the one `<aside>` |
| `#explTimelineSection` (inside `#explorePanel`) | Region 5, timeline band | **restructure** |
| — | Region 6, status bar (`statusMsg` accent · `statusMid` · `statusKeys`) | **missing**. Every input exists: `PERF.genTotal`/`PERF.render`, `_lodZoom`, `state.finalized`, `#undoMem`'s text, `#autosaveChk` |
| `#busy` overlay + `alert()` | Toast layer (2 600 ms, max 3 stacked) | **missing** (busy overlay is a modal scrim, not a toast) |

### 2.2 Tool palette (`DCC_SHELL_SPEC.md` §4.5, `spec/01` §3.6c)

The DCC palette is **one TOOLS block at the head of every left dock**: four global
icon buttons, a divider, then the domain's own pills. v2.15 has **three separate
palettes** — `#civToolPalette`, `#cartoToolPalette`, `#explToolPalette` — each
repeating its own `[data-civtool="inspect"]` button. They stay in sync only because
`_civSetTool` (v2.15 line 27527) does
`document.querySelectorAll('[data-civtool]').forEach(b=>b.classList.toggle('on',…))`.

| DCC tool | Key | Current | Verdict |
|---|---|---|---|
| Inspect | V | `[data-civtool="inspect"]` ×2 | **restructure** (merge the three palettes) |
| **Measure** | M | *nothing* — grepped; zero hits for a measure tool | **missing** (`PORT_ONLY_FEATURES.md` line 81 lists it as port-only) |
| **Region select** | R | `regionSelMode` / `#regionBtn` "Select region", buried in the `Region export` accordion of `#genWorld` | **restructure** — fully backed, wrong home |
| Pan / zoom | Space, MMB | `#panBtn` in `#zoomOverlay` + `spaceDown` | **rename** (it belongs in the palette, permanently `--dis`) |
| WORLD · Sculpt / Freehand | F | `#sculptFeatureSeg` (13 features, freehand among them) | **restructure** — not a `[data-civtool]` |
| WORLD · **Biome paint** | B | `#carPaintChk`, in the **Cartography** branch | **restructure** — DCC §4.5.2: *"Biome paint edits world data, so it belongs to WORLD, not to Cartography … The controls port unchanged; only the home moves."* |
| CIVIL · Settlement / POI / Territory / Way | S P T W | `place` / `place_poi` / `territory` / `draw_way` | **aligned** |
| CIVIL · Route | ⇧R | `route` (in `#explToolPalette`) | **restructure** (moves domain) |
| CARTO · Label / Icon | L I | `label` / `icon` | **aligned** |

> **Hotkey collision, and it is real.** The DCC assigns `V M R` (global) and
> `B F` / `S P T W` / `L I` (per domain) to *tools*. v2.15 assigns `B T F S W R` to
> *debug layers* (`LAYER_HOTKEYS`, line 14412) — **six of the seven letters clash**,
> and the layer listener fires on the same `keydown` path. Any stage that adopts DCC
> tool hotkeys must move the layer hotkeys to the DCC's own digit badges `1`–`8`
> first, or the two systems will fight silently. The layer listener already carries
> the `INPUT/TEXTAREA/SELECT/isContentEditable` typing guard this file's v1.24 BUG-2
> established, and it bails on any modifier — so DCC's `⇧R` (Route) is safe and only
> the six unmodified letters are at stake. The guard is not the issue; the letters are.

### 2.3 Menus (`DCC_SHELL_SPEC.md` §2)

| DCC menu | Current home | Verdict |
|---|---|---|
| **File** — New world…, Open, Save, Save as, Autosave, Revert, Close | `#fileMenu`: `#loadBtn` `#inferTectBtn` `#loadZipBtn` `#autosaveChk`/`#autosaveMins`/`#autosaveKeep`/`#snapNowBtn`/`#snapList` `#packBtn` + the whole Export block | **restructure** — File is over-full: import-pack belongs under Assets, the export block under Data |
| **Edit** — Undo, Redo, history, find | `#undoBtn` `#redoBtn` `#undoMem` (header); `#findInput` (header, v2.15) | **restructure** — no Edit menu; the controls are already at menu-bar level |
| **Assets** ⧉ | `#assetsHeaderBtn` → full-viewport `#assetLibrary`; `#alSlicerBtn`; `#packBtn` | **restructure** — the window already exists and already behaves as `⧉` |
| **Data** ⧉ (the Data Manager) | `#fileMenu`'s Export section (`#bakeRes` `#bakeTiles` `#chanAtlasChk` `#layersPreviewChk` `#exportBtn` `#exportGeoBtn`) + the `Region export` accordion | **restructure** |
| **Preferences** ▸ Graphics / Performance / Tiles & LOD | `#genV3dSec` "3D view", "Tiled LOD view", "Atlas cache", "Chunk debug overlay" — all `<details class="cat-acc">` **inside `#genWorld`** | **restructure** — the single highest-value, lowest-risk IA move in the whole proposal (§3 stage 6) |
| **Window** — layout toggles, reset layout | *nothing* | **missing** |
| **Help** — credits, shortcuts, diagnostic report | `#creditsBtn` modal; `#genInfoBtn`/`#genInfoPanel` (generation dump) | **restructure** |

### 2.4 Viewport furniture (`spec/01` §3.6e)

| DCC | Current | Verdict |
|---|---|---|
| Layers button, top-left cluster `top:10 left:10` | `#layersFab` at `top:10px; left:54px` (`#explFilterFab` occupies `left:10px`) | **rename/reposition** |
| `{{vpContext}}` chip beside it (active stage / draft state) | — | **missing** |
| Top-right chip `equirect · zoom 100% · {{vpField}}` | `#resOverlay` is a **debug/perf** panel (grid, MB, GPU, LOD, timings), `display:none` by default | **missing** — the data exists (`GW`, `GH`, `_lodZoom`, `state.world`, `state.debug`) |
| Scale bar, **bottom-left** `left:12px` | `#scaleBar` at `bottom:10px; **right:64px**` | **rename/reposition** |
| Cursor coords, bottom-right `— · —` | *nothing*; grepped for a hover readout, none exists | **missing** |
| Cross-section strip, 168 px, `SECTION A → B` | only `#reProfileCv` inside `#routeEditorModal` | **missing** (depends on Measure) |
| Brush ring with radius/strength label | `sculptRenderCursor()` on `#polyOverlay` | **aligned** |
| `#viewDimSeg` 2D/3D pill, top-centre | no DCC equivalent — `spec/00` §2 lists the 3D viewport as **deferred** in the port | **n/a**, keep (§5) |
| `#zoomOverlay`, `#sculptNavpad` | phone/tablet furniture; the DCC phone shell has its own | **keep** (§5) |

### 2.5 Disclosure depth

Current deepest World chain: `Generate` (tab) → `World` (`data-gsub`) → `Geology`
(`details.cat-acc`) → `Tectonics` (`.sec h2`) → `Physical coupling fields`
(`details.adv`) = **five levels**, matching the grammar exactly.

But DCC's L1 is the **domain**, and the HTML app spends L1 on a *phase* (Generate /
Explore) and L2 on the domain. So the app is one level deeper than the grammar at
every point, and the Civilization branch — `Generate → Civilization → #civSubBar →
.sec → details` — is already at five with a modal (`#civFactionsModal`) opening a
sixth surface beyond it. **Collapsing the Generate/Explore phase tab is what brings
the app back inside five levels**, and it is the same collapse the three-domain merge
implies.

### 2.6 Scale of the surface

Measured over the `<aside>` (v2.15 lines 884–2063, 1 180 lines): **59** `.sec`,
**14** `details.cat-acc` + **11** `details.acc` + **3** `details.adv`, **21** `<h2>`,
**20** `.sublabel`, **124** range sliders, **43** checkboxes, **15** selects,
**154** buttons. Pictographic emoji: **43** occurrences in markup, **191** file-wide.

---

## 3 · Staged migration plan

Rules this repository imposes, from its own `CLAUDE.md`:

- **New version = new file** (`Cartalith Gen1 v2.NN.html`); never edit an old one.
- `tests/run.sh` (1097) and `tests/run_um.sh` (852) must stay green.
- The render hash must stay bit-identical unless a re-baseline is deliberate.

**Two structural facts make most of this cheap.** First, `tests/run.sh` extracts only
`re.findall(r'<script>(.*?)</script>', html, re.S)[0]` — the first script block — so
**markup and CSS changes cannot affect the 1097-assertion suite at all**, and
`run_um.sh` reads block 4 between its `<!-- UM-ENGINE-START/END -->` markers. Second,
the map canvas is painted by JS ramps, not CSS: the file's own v0.86 comment states
*"switching light/dark never touches a single map pixel."* **So any stage that is CSS
+ markup only is bit-identical by construction.**

The exposure is therefore entirely in `tests/perf/smoke_gen1.js`. Four assertions
depend on DOM *position*, and every stage below names the ones it touches:

| Assertion | What it pins |
|---|---|
| `R.subTabs` (smoke line 1620) | `#genSubBar .subtab` **dataset order** `[world, civ, carto, sculpt]` |
| `R.v159` (5933–5975) | `#civSubBar` tab order; `#civSubGeneration`'s child order (`Step 1`, `Step 2`, `Ways`, `Step 3`, `Provinces`, `Display`); `#civTerritoryToolRow` positioned between `#civPoiTypeRow` and `#civWayDrawRow` and before `#civSubBar` |
| `R.v203` (8089–8110) | `#genInfoBtn` shares a `.sec` with `#readout`, is **inside `<aside>`**, and is outside `#genWorld`/`#explorePanel`/`#assetsPanel` |
| `R.sidebarLocked` / `R.sidebarUnlocked` (37, 90) | `getComputedStyle(document.querySelector('aside')).pointerEvents` under `body.setup-gated` |
| `R.metro` (6998) | `classGlyph === '★'` — **map symbology, not chrome; a glyph pass must not touch `CIV_SETTLE_CLASSES`** |

Ordering below is by value-per-risk. Each stage is one version and ships alone.

---

### Stage 1 — Tokens, hairlines, radius, mono numerics · **CSS only**

**Touches:** the `<style>` block only. **Markup: none. JS: none.**
**Tests:** 1097 ✓ 852 ✓ hash ALL IDENTICAL by construction.
**Risk: negligible.** Highest value of any stage — every later stage inherits it.

What it does:

1. Replace `:root`'s 12 variables with the DCC 21 + 17. Current values are
   *close* (`--accent:#d9a45b` vs `--acc:#e0a34a`) but not the same palette, and the
   current set collapses three distinct DCC roles onto one `--line`.
2. **Fix four genuinely undefined custom properties.** Audited by extracting every
   `--name:` declaration and every `var(--name)` in the style block:
   `--muted` (4 CSS uses + ~10 inline `style="color:var(--muted)"` attributes),
   `--border` (2 CSS + several inline), `--fg`, `--bg2` are **used and never
   defined**. The consequence is visible on the most prominent control in the app:
   ```css
   .tab{ background:var(--bg2); color:var(--fg); border:1px solid var(--border); … }
   ```
   `var(--bg2)` is a guaranteed-invalid substitution, so `background-color` falls to
   `initial` (transparent) rather than to `button{background:var(--panel2)}`, and
   `border-color` falls to `currentColor`. The inactive phase tabs have been rendering
   as transparent outlines for as long as that rule has existed.
   (`--preview-al` is the one apparent exception and is fine — JS sets it at
   line 28083 and every use carries a `,#0c0e13` fallback.)
3. `border-radius:0` throughout. Current file uses 4/5/6/7/8/12 px radii and
   `999px` pills; DCC is **radius 0 on desktop and tablet**, with `999px` kept only
   for segmented-option pills and toasts.
4. Retire panel fills in favour of hairlines: `.sec{border-bottom:1px solid var(--div)}`
   and region borders at `--hair`.
5. Numerics to mono. `.row .val`, `.readout`, `.pill`, `.sec h2`, `#scaleBar` and the
   section captions all move to `--mono` at 9/10/10.5 px with the DCC letter-spacing.
   **Keep the existing `--mono` stack** — IBM Plex Mono is a Google-Fonts webfont and
   cannot be loaded on `file://` (§5).
6. Light theme: replace the parchment palette at `:root[data-theme="light"]` with
   `spec/01` §2.3's 21-token override.

A deliberate departure worth disclosing in the version's own note: the DCC accent on
light is `#a4650f`, the file currently uses `#b07f3f`.

---

### Stage 2 — The six-region frame + status bar · markup + small JS

**Touches:** `<style>`, body markup, ~40 lines of new block-1 JS.
**Tests:** 1097 ✓ (block-1 additions use `getElementById`, which `tests/stub_head.js`
auto-vivifies for any id; it returns `null`/`[]` for `querySelector`/`querySelectorAll`,
so avoid those in new block-1 code). 852 ✓. Hash unaffected.
**At risk:** `R.v203.insideAside` — if `#readout`/`#genInfoBtn` move to the status bar,
that assertion fails. **Leave them in the dock and put a *separate* summary in the
status bar.**

1. `body` becomes the six-region flex column: `header` → (rail, deferred to stage 5) →
   `.stage` → `#timelineBar` (stage 7) → `#statusBar`.
2. **Put the dock on the left.** One declaration: `aside{order:-1}` on `.stage`'s flex
   container, plus `border-left` → `border-right` and the mobile drawer's
   `right:0`/`translateX(102%)` → `left:0`/`translateX(-102%)`. No DOM move, so
   `R.v203`'s `aside.contains(btn)` and `R.sidebarLocked`'s `querySelector('aside')`
   both still hold.
3. Widen to `--ldW` 372 (from 324), with the `w1366` density at 330 and a
   `@media (min-width:2000px)` tablet band at 400 replacing the current
   `@media (min-width:1440px){aside{width:360px}}`.
4. **New `#statusBar`** — 26 px, `border-top:1px solid var(--hair)`, mono 9 px, three
   fields. `statusMsg` in `--acc`, built in the DCC's own priority order
   (`spec/01` §3.8) from state that already exists:
   `state.finalized` → `finalized — generation locked · atlas L0–L{depth} baked`;
   `sculptStamps.length` → `draft — N stamps uncommitted`;
   else `world ready · seed {state.tect.seed} · {GW}×{GH}`.
   `statusMid` in `--dis`: `last pass {GPU.lastMs} ms · render {PERF.render.total} ms ·
   autosave {on/off}`. `statusKeys` in `--faint`: the live modifier hints.
   Everything it reads is already computed by `updateReadout()` and `updateResOverlay()`.

---

### Stage 3 — Three domains on a vertical rail · JS wiring

**Touches:** markup + the two tab handlers (v2.15 lines 13783 and 13822).
**This is the risky stage** — the port's own `spec/00` §3 says the same of its rail fold.
**At risk:** `R.subTabs` (dataset order) and, indirectly, `R.v159`.

The mapping is unusually clean, and that is the argument for doing it:

| DCC domain · node | Current container | Change |
|---|---|---|
| WORLD · Generation pipeline (`a`) | `#genWorld` | none |
| WORLD · Sculpt (`b`) | `#genSculpt` | becomes WORLD's `b` mode, not a peer tab |
| CIVIL · Factions & settlements | `#civSubFactions` + `#civSubSettlements` | none |
| CIVIL · Ways & routes | `#civSubGeneration`'s Step 2/Ways + `#civWayList` | none |
| CIVIL · Journey planner | `#explorePanel`'s planner + `#routeEditorModal` | re-parent |
| CIVIL · Landmarks | — | **not present in this app** (`PORT_ONLY_FEATURES.md` line 49: *"The legacy 'landmark' is only a hand-placed POI icon"*). Omit the node rather than draw it empty |
| CARTO · Layers & style / Labels / Icons / Terrain appearance | `#genCarto`'s Map view + Map style; `#carLabelList`; `#carIconList`; Rendering–advanced + NPR | regroup (but see §1.4's open question) |

How to do it without breaking `R.subTabs`: **keep the four `#genSubBar .subtab`
buttons, their `data-gsub` values and their DOM order exactly as they are**, and
restyle the container as a 40 px vertical rail
(`writing-mode:vertical-rl; transform:rotate(180deg)`). Add `#tabBar`'s Explore
content as a CIVIL node rather than a peer phase. The handler already keys off
`b.dataset.gsub` and toggles by element id — never by position — so relocation is safe;
this is the same property v1.59 and v2.03 relied on.

**Sculpt as a mode, not a domain**, needs the a/b pill (`spec/01` §3.6c) in the dock
header; `data-gsub="sculpt"` stays as its underlying value so `R.subTabs` and the
`#genSubBar [data-gsub="sculpt"]` clicks at smoke lines 2868 and 3067 keep working.

---

### Stage 4 — One TOOLS block · JS

Merge `#civToolPalette`, `#cartoToolPalette` and `#explToolPalette` into a single
block at the head of the dock: four global icon buttons (Inspect · Measure ·
Region select · Pan), a `1px` divider, then the active domain's pills. `_civSetTool`
already drives every `[data-civtool]` in the document, so a merged palette needs no
state-machine change.

Two promotions with engine behind them and no new capability required:

- **Region select** — `regionSelMode` and `#regionBtn` exist; give them
  `data-civtool="region"` and lift them out of the `Region export` accordion.
- **Pan** — `#panBtn`'s handler (line 14729) already toggles `panMode`; show it in
  the palette as a permanently-`--dis` reminder, per `spec/01` §3.6c.

**Measure is the one genuinely new tool** and should be its own version, after this one.

**At risk:** `R.v159` checks `#civToolPalette [data-civtool="territory"]` and
`[data-civtool="inspect"]` by selector — keep the `#civToolPalette` id on the merged
block and both queries still resolve.

---

### Stage 5 — Tool-options bar (region 3) · markup + JS

A 40 px row under the menu bar: context label in `--acc` → parameters → `flex:1`
spacer → commit/discard. Populate it by **moving the three contextual rows that
already exist and are already `_civSetTool`-gated** — `#civPoiTypeRow`,
`#civTerritoryToolRow`, `#civWayDrawRow` — plus `#sculptFeatureSeg`/`#sculptPresetSeg`
when a sculpt tool is armed, and `#civCommitRouteBtn` / the sculpt Commit/Discard pair
as the trailing actions.

**At risk:** `R.v159`'s `terRowIsRowSiblingBeforeBar` asserts `#civTerritoryToolRow`
sits between `#civPoiTypeRow` and `#civWayDrawRow` **and before `#civSubBar`**. Moving
all three together, in the same relative order, into a container that still precedes
`#civSubBar` in document order satisfies it; moving one alone does not.

---

### Stage 6 — Preferences: program settings leave the generation dock · markup only

`UI_SHELL_DESIGN.md` is explicit that *"GPU acceleration, multi-GPU dispatch, render
quality, lighting defaults, tiled LOD and the atlas cache are program settings and
live under Preferences, not beside the terrain sliders they used to sit next to."*

In v2.15 the accordions `3D view` (`#genV3dSec`), `Tiled LOD view`, `Atlas cache` and
`Chunk debug overlay` sit inside `#genWorld`, between `Ecology` and `Region export`.
Moving those four `<details class="cat-acc">` blocks into a Preferences menu panel is
**pure markup relocation** — every id, every handler, every `syncUI()` reflection is
untouched, exactly the v2.03 precedent. Lowest-risk restructure in the set, and it
removes four non-stages from a dependency-ordered pipeline.

Note the one control that must **not** move: `#finalizeSec` / `#bakeAllBtn` /
`#unfinalizeBtn` is a world-state action, not a program setting; DCC keeps
`🔒 Bake ALL & finalize` in the pipeline's own tool-options context.

---

### Stage 7 — Timeline band (region 5) · markup + JS

Relocate `#explTimelineSection` from `#explorePanel` into a bottom band: collapsed
24 px (`TIMELINE · YEAR N · ▴ expand`), expanded auto with transport, speed pills,
scrub and the six simulation-layer toggles. `spec/01` §3.7 gives every metric.

Disclose the gap honestly: v2.15 has **Add year** and **Simulate collapse/recovery**,
not a play/pause transport over a year range. Draw the transport controls
**disabled with their reason visible** (`DESIGN_HANDOFF.md` §9.1) or omit them —
never enabled and inert.

---

### Stage 8 — Measure tool + cross-section strip · JS

The one stage that is new engine surface rather than relocation. `PORT_ONLY_FEATURES.md`
line 81 describes the port's version: distance, bearing, area, radius, cross-section
and vertical difference, wrap-aware, on the map's km-per-cell scale. The HTML app has
`state.mapWidthKm`/`GW` (so `cellKm` is free), `#scaleBar`'s own formatter, and a
working profile renderer in `_civDrawProfile`/`#reProfileCv` to model the 168 px
section strip on. Everything else — the point list, the segment table, the overlay —
is new.

---

### Stage 9 — Glyph pass · markup + JS strings

`UI_SHELL_DESIGN.md`: *"No emoji."* Measured: **43** pictographic characters in the
markup, **191** file-wide. Text symbols (`→ ✓ ✕ ← ↔ ☰ ↩ ↪ ☐ ⌂ ▸ ▾`) are explicitly
allowed and stay. The genuinely pictographic set in markup is small and enumerable:
`🎲`(3) `🔒`(3) `🌍`(2) `📋`(2) `🔍`(2) `🎨` `🌙` `📂` `🗻` `🛤` `🔓`.

Replace each with a 16×16 inline SVG at `stroke-width:1.2`, `stroke:currentColor`,
`fill:none` — the file already does exactly this twice (`.funnel-glyph` and the
`#layersBtn` three-sheets mark), so the idiom is established, not invented.

**Two things a glyph pass must not touch**, both verified:

- `CIV_SETTLE_CLASSES` (v2.15 line 15450, `{key:'metropolis', …, glyph:'★', rank:5}`)
  — this is **map symbology painted into `civCtx`**, not UI chrome, and
  `smoke_gen1.js` line 6998 asserts `classGlyph === '★'`.
- Quick-fix button *text*, which the smoke suite matches by regex
  (`/Turn off seasonal closures/`, line 6304). Dropping the `🔧` prefix is safe;
  rewording is not.

Can be pulled forward to any position — it is independent of every other stage.

---

## 4 · Concrete sketches for stage 1

Real selectors from `Cartalith Gen1 v2.15.html`. Replacements for the block at
lines 8–14 and the rules named beside each.

### 4.1 `:root` — replacing lines 8–14

```css
:root{
  /* ── DCC dark, from Cartalith_GDT/design/dcc-environment-2026-08-31/spec/01 §2.1 ── */
  --sur:#0d0e0f; --pan:#121314; --ins:#191c1e;
  --ink:#e8ebec; --body:#c8cbcd; --sec-ink:#a9adb0;   /* NB: --sec collides with .sec */
  --dim:#8d9296; --faint:#6f7478; --dis:#5f6468;
  --acc:#e0a34a; --accH:#f0bd72; --accInk:#141005;
  --hair:rgba(255,255,255,.10);   /* structural: region + dock borders          */
  --div:rgba(255,255,255,.07);    /* in-panel: list rules, .sec separators      */
  --bor:rgba(255,255,255,.16);    /* outline of anything that FLOATS            */
  --wash:rgba(224,163,74,.09); --wash2:rgba(224,163,74,.16);
  --good:#6fae7d; --block:#c96a5a; --water:#6a9bc4;
  --shadow:0 14px 34px rgba(0,0,0,.55);

  /* metrics — w1920 column of spec/01 §2.2 */
  --fs:11.5px; --m0:10.5px; --m1:10px; --m2:9px;
  --menuH:36px; --tbH:40px; --railW:40px;
  --ctl:24px; --btnH:28px; --rowH:28px; --tool:30px;
  --ldW:372px; --rdW:304px; --sbH:26px; --pad:14px; --pop:300px;

  /* ── back-compat aliases: 500+ existing declarations use these names.
        Keeping them is what makes stage 1 a pure CSS change.            ── */
  --bg:var(--sur); --panel:var(--pan); --panel2:var(--ins);
  --line:var(--hair);
  --warn:var(--block); --accent:var(--acc); --accent2:var(--water);

  /* ── the four that were USED and never DEFINED (see §3 stage 1) ── */
  --muted:var(--dim); --border:var(--bor); --fg:var(--body); --bg2:var(--ins);

  --mono:ui-monospace,"SF Mono","Cascadia Code",Menlo,Consolas,monospace;
  --sans:ui-sans-serif,-apple-system,"Segoe UI",sans-serif;
}
```

The alias block is the load-bearing trick: `--line`, `--panel`, `--panel2`, `--accent`
appear in 66 / 15 / 22 / 54 declarations respectively, and redefining them as aliases
re-skins all of them without editing one rule.

### 4.2 Hairlines, radius, fills — amending existing rules

```css
/* line 17 — was: font-size:13px */
body{ background:var(--sur); color:var(--body); font-family:var(--sans);
      font-size:var(--fs); line-height:1.45; }

/* line 18 — header becomes region 1 at the DCC height, padding literal 10px per spec §3.3 */
header{ height:var(--menuH); padding:0 10px; gap:2px;
        border-bottom:1px solid var(--hair); background:transparent; }

/* line 132 — the dock. Side flip is stage 2; the fill/edge is stage 1. */
aside{ width:var(--ldW); background:var(--pan);
       border-left:1px solid var(--hair); }

/* line 136 — sections are separated by a hairline, never by a fill */
.sec{ padding:12px var(--pad); border-bottom:1px solid var(--div); }
.sec h2{ font-family:var(--mono); font-size:var(--m2);
         letter-spacing:.2em; text-transform:uppercase;
         color:var(--faint); margin:0 0 10px; }        /* was color:var(--accent) */

/* radius 0 everywhere on desktop; pills keep 999px */
button, select, input[type=text], input[type=number], input[type=search],
.dropdown, .legend, #scaleBar, .place-edit-popup, .settle-info,
.map-filter-fab .funnel-btn, .seg{ border-radius:0; }
.pill{ border-radius:999px; }

/* line 158 — base button, DCC control geometry */
button{ background:var(--ins); border:1px solid var(--bor); color:var(--body);
        min-height:var(--btnH); padding:5px 11px; font-size:var(--fs); }
button:hover{ background:var(--wash); }
button.on{ background:var(--acc); border-color:var(--acc); color:var(--accInk); }

/* line 214 — the phase tabs, whose three undefined vars are now defined above */
.tab{ background:var(--ins); color:var(--sec-ink); border:1px solid var(--bor);
      font-family:var(--mono); font-size:var(--m1); letter-spacing:.14em; }
.tab.on{ background:var(--acc); color:var(--accInk); border-color:var(--acc); }

/* line 149 + 166 — every numeric readout in mono, per §1.5 */
.row .val{ font-family:var(--mono); font-size:var(--m1); color:var(--ink); }
.readout { font-family:var(--mono); font-size:var(--m1); color:var(--dim); }
.readout .big{ color:var(--acc); font-size:26px; letter-spacing:.02em; }  /* the one hero readout */

/* anything that FLOATS uses --bor + --shadow, never --hair */
.dropdown, .place-edit-popup, .settle-info,
.map-filter-fab .dropdown{ border:1px solid var(--bor); box-shadow:var(--shadow);
                           background:var(--pan); }
```

### 4.3 Status bar — the stage-2 markup, placed after `</div><!--.stage-->`

```html
<div id="statusBar">
  <span id="sbMsg"></span>
  <span style="flex:1"></span>
  <span id="sbMid"></span>
  <span id="sbKeys"></span>
</div>
```

```css
#statusBar{ height:var(--sbH); flex:none; display:flex; align-items:center;
            gap:18px; padding:0 var(--pad);
            border-top:1px solid var(--hair);
            font:var(--m2) var(--mono); }
#sbMsg { color:var(--acc);   letter-spacing:.06em; }
#sbMid { color:var(--dis);  }
#sbKeys{ color:var(--faint); }
```

Its updater belongs in block 1 beside `updateReadout()` (line 9906) and, per this
repo's own v2.14 rule — *"a control that is not reflected in `syncUI()` will go stale
on load"* — must also be called from `syncUI()`'s tail. All three strings read state
that already exists; none of them needs a new computation.

### 4.4 Domain rail — the stage-3 restyle of `#genSubBar`

No markup change beyond moving the container; the four buttons, their `data-gsub`
values and their order are preserved so `R.subTabs` still passes.

```css
#genSubBar{ width:var(--railW); flex:none; display:flex; flex-direction:column;
            border-right:1px solid var(--hair); gap:0; }
#genSubBar .subtab{
  flex:1; max-height:112px; display:grid; place-items:center;
  writing-mode:vertical-rl; transform:rotate(180deg);
  font-family:var(--mono); font-size:var(--m1); letter-spacing:.26em;
  color:var(--dim); background:transparent; border:0; box-shadow:none; }
#genSubBar .subtab.on{
  color:var(--acc); background:var(--wash);
  box-shadow:inset -2px 0 var(--acc); }     /* spec/01 §3.6a, exact */
```

---

## 5 · What NOT to port, and why

| Not ported | Reason |
|---|---|
| **IBM Plex Mono as a webfont** | The app must open over `file://` with zero dependencies. `<link href="fonts.googleapis.com">` fails offline and adds a network dependency the file has never had. Keep `--mono`'s system stack and take the DCC *sizes and letter-spacing*, which is where most of the character lives. The port's own §12 note — Plex is missing **✕ ● ○ ▾ ▸ ▶ ＋** — is a second reason not to chase it. |
| **The ten-stage `✓ / ● / ○` state dots, "Run stage n", "Run n → 10", stale-from readout** | `DCC_SHELL_SPEC.md`'s own correction 2 says this *"describes a capability that exists nowhere — not in this engine, not in the reference app being ported."* Confirmed in v2.15: `tparam()` calls `generate()` on every slider release, so nothing is ever stale. Drawing them would be the defect `DESIGN_HANDOFF.md` §9.1 names. |
| **Brush shapes, falloff curves beyond `smoothstep`, stroke & grid, flip/rotate/flatten** | `DCC_SHELL_SPEC.md` correction 3 and `PORT_ONLY_FEATURES.md` line 134: no engine behind them in either codebase. New design work, not a port gap. |
| **Storage locations, Recent worlds, Save/Save as, Revert, Close project** | A browser has no project path to remember. `CLAUDE.md`'s own v2.12 note already records this: *"no cross-session 'recent projects' … a browser has no project path to remember."* `#loadZipBtn` / `#exportBtn` plus v2.12's IndexedDB autosave snapshots are the browser-native equivalent and are better than a fabricated path list. |
| **Native "Open project" / "Select folder" gallery modals** (two artboards in `Cartalith DCC Shell.dc.html`) | They exist to replace the OS tree-view picker. The browser's `<input type="file">` — already wired as `#zipFile` / `#file` / `#packFile` — *is* the platform picker, with drag-drop and recents the page cannot see. Re-implementing it in HTML would be strictly worse. |
| **Rebindable keyboard shortcuts, `⌘N`-style accelerators in menu rows** | `PORT_ONLY_FEATURES.md` line 79. A page cannot claim `⌘N`/`⌘W`/`⌘O` — the browser owns them. Show the shortcuts the app *can* honour (`⌃K`, `Ctrl+Z`, `Ctrl+Shift+Z`, `Esc`, `Space`, and the layer hotkeys in `LAYER_HOTKEYS`) and omit the rest rather than print keystrokes that do nothing. |
| **The layers popover's `1`–`8` digit hotkey badges** | The DCC popover (`spec/01` §3.6e, and the `DCC shell 1920` artboard) groups eight layers under SURFACE / TERRAIN FIELDS / CLIMATE with digit badges `1`–`8`. v2.15 uses **letters**: `LAYER_HOTKEYS = {off:'0', bclass:'B', cterrain:'T', flow:'F', settle:'S', wildlife:'W', rsrc:'R'}` (line 14412) over a 34-button `#debugSeg`, plus a `_layerMRU` list the DCC has no equivalent of. **Adopting the DCC's digits is not optional cosmetics — it resolves a real collision** (§2.2 note below). Keep the app's own grouping and MRU; change only the badges. |
| **`72vh` menu-popover clamp** | `spec/01` §3.3 flags it: *"`72vh` is measured against the real browser viewport, not the artboard — a Godot build must clamp to the shell height instead."* In a browser it is correct as written; this is one place the HTML app is the *easier* target. |
| **`content-box` sizing with borders adding to token heights** | `spec/01` §3 notes the prototype has no `box-sizing` reset, so each region's 1 px border adds to its height. This file has `*{box-sizing:border-box}` at line 15 and should keep it; treat the DCC heights as border-box and accept a 1–2 px difference per band. |
| **The 3D viewport being absent** | `DESIGN_HANDOFF.md` §8 lists a 3D viewport under *"what does not exist and cannot be drawn as though it does"* — but the HTML app has had one since v0.6 (`#view3d`, `#viewDimSeg`, the WebGL2 drape). **Keep it.** The design's silence is a port limitation, not a design decision. |
| **`#zoomOverlay`, `#sculptNavpad`, `#panelToggle`, the mobile slide-in drawer** | Browser-specific touch furniture with no Godot counterpart. The DCC phone shell (`spec/06-phone.md`, 412 dp, 28/56/64/20) is a *separate* shell for a native app; this file's `@media (max-width:860px)` drawer is the browser's answer to the same problem and already works. Restyle to the tokens; do not restructure. |
| **Toast layer** | Optional. The file's `#busy` overlay plus `confirm()`/`alert()` cover the same ground, and `CLAUDE.md`'s v1.24 BUG-4 established `confirm()` with a count as this app's destructive-action convention. A toast layer is a nice-to-have, not an alignment gap. |
| **Multi-selection, clipboard, cut/copy/paste** | `DESIGN_HANDOFF.md` §8: *"a clipboard model for cut/copy/paste, multi-selection of any entity"* do not exist in the port either. Both codebases are single-selection (`_civSelectedPlace`). |

---

## 6 · Contradictions and stale claims found in the GDT design documents

Each was verified by opening the file named, not inferred from another document.

1. **`DESIGN_HANDOFF.md` §2 says `DCC_SHELL_SPEC.md` *"Lives in the owner's Claude
   Design project, not this repo."*** It is at the repository root, 61 446 bytes.
   (`ANDROID_UI_SPEC.md`, listed beside it, genuinely is absent — so half the row
   is right.)

2. **`DESIGN_HANDOFF.md` §7 says *"Five domains on the rail … `WORLD · CIVIL · INFRA ·
   CARTO · RENDER`"*, and §11 lists `shell/workspaces/` as *"The five domains."***
   The owner cut this to **three** on 2026-08-20 and re-affirmed it on 2026-08-31.
   `UI_SHELL_DESIGN.md`'s own governing-split table carries the same stale five
   (*"World, Civilization, Infrastructure, Cartography, Render"*). The brief calls
   `DESIGN_HANDOFF.md` the densest source; on this point it is the wrong one.

3. **`DESIGN_HANDOFF.md` §2 names `design/android-2026-08-30/Cartalith Android.dc.html`
   as *"The current phone design."*** `design/dcc-environment-2026-08-31/` contains a
   newer `Cartalith Android.dc.html` imported one day later, and its own README says
   the two prototypes there *"specify the shell frame and its information
   architecture."* Under the owner's own "the newer canvas wins" rule the 08-30 import
   is the stale party. §2 does not mention the 08-31 directory at all.

4. **`DCC_SHELL_SPEC.md` §1's frame table was never updated to match its own §13.**
   §13 opens with a boxed *"⚠️ THE PHONE COLUMN BELOW IS SUPERSEDED"* and gives
   28/56/64/20 dp at 412, while §1 — eight hundred lines above it — still tabulates
   `Phone 393`, `app bar 52 px`, `Domain rail 44 px collapsed only`. Both are in one
   file and they disagree. The 2026-08-31 token table supersedes §1's *desktop* column
   too: `--menuH` 36 (not 34), `--tbH` 40 (not 34), `--rdW` 304 (not 284–340).

5. **The 2026-08-31 node tree and Menu Structure v3's category lists are different
   information architectures, and nothing reconciles them.** `DCC_SHELL_SPEC.md`'s
   top-of-file notice names v3 (2026-08-24) as superseding its §3, giving **9/14/10**
   flat L2 categories. `design/dcc-environment-2026-08-31/README.md` and
   `spec/02-rail-and-domains.md` §3 give **2/4/4** nodes under three headers. Both
   claim the same region. Under "the newer canvas wins", 08-31 should win — but
   `DCC_SHELL_SPEC.md` still points readers at v3, because it was last edited a week
   earlier. **This is the one conflict a builder cannot resolve from the documents
   alone**, and §1.4 of this proposal follows the newer tree only because the owner's
   own rule says to.

6. **`DCC_SHELL_SPEC.md`'s mockup table lists nine screens plus a rule card;
   `DCC_CONTROL_INDEX.md` corrects that to *"**ten** screens, not the nine the spec's
   own table lists."* Both are now wrong** — extracting `data-screen-label` from
   `design/Cartalith DCC Shell.dc.html` yields **twelve** artboards, the two extras
   being `Open project dialog 1920` and `Select folder dialog 1920`.

7. **`UI_SHELL_DESIGN.md` cites `MENU_STRUCTURE.md` for *"the full tree"*.** No such
   file exists at the repository root or under `docs/`. The nearest live document is
   `design/cartalith-menu-structure.md` (2026-08-17), which is itself superseded — it
   still describes a `WORLD · EDIT · ANALYSIS · SIMULATION · CARTOGRAPHIC · DEBUG`
   mode bar and a four-group navigator that no later canvas draws.

8. **`spec/00-REPLACEMENT-PLAN.md` carries four `UNSPECIFIED` items that are still
   open**, one of which bears directly on §1.4 above: *"CARTO's four nodes all carry an
   empty `mode`. Do `Layers & style`, `Labels`, `Icons` and `Terrain appearance` select
   four distinct dock panels, or collapse to one? The design gives four rows and one
   destination."* Any HTML implementation of CARTO's node list inherits that question.

9. **Minor, and the spec flags it itself:** the 08-31 desktop prototype still carries
   `hint-placeholder-count="5"` on the rail while its `doms` array is three —
   `spec/01` §3.6a calls it *"the fossil of the five-domain rail."*

### What I could not verify

- The Godot side. `cartalith-native/godot-project/shell/dcc_theme.gd` and its siblings
  are cited throughout as the source of the resolved tokens; this proposal takes the
  token values from `spec/01-frame-and-tokens.md`, which reads them from the
  prototype's own markup, and did not open the `.gd` files.
- Whether `Cartalith_GDT`'s root `Cartalith Gen1 v2.11.html` matches that repository's
  reference freeze at v2.10 — `Cartalith_GDT/CLAUDE.md` flags the drift itself and
  says it is unresolved.

---

## 7 · One-paragraph recommendation

Do stage 1 and stage 6 first, in either order. Stage 1 is CSS-only and cannot break a
test; stage 6 is markup-only relocation of four accordions whose ids and handlers never
move, and it is the one change that fixes a genuine IA error (program settings sitting
inside a dependency-ordered generation pipeline) rather than a cosmetic one. Together
they will make the app read as the DCC shell from across a room, at essentially zero
risk to 1097/852/hash. Stage 3 — the three-domain rail — is where the real value is and
where the real risk is; it should be its own version, with `R.subTabs` and `R.v159`
re-read before the first line is written, and it should not begin until the port answers
`spec/00` §5's open question about CARTO's four nodes.
