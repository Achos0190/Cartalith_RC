# Skills for this project

Two things live here: skills **vendored into `skills/`** (ready to drop into a real
`.claude/skills/` directory) and skills **researched but not vendored** (linked, described,
and reasoned about, so a future session doesn't have to re-research them from scratch).
Everything below was checked via live web search in this session — not assumed from
training knowledge — including license status for anything actually copied into this repo.

## How Claude Code skills actually get installed

Per current research: a skill is a folder (its own directory name, containing a `SKILL.md`
with YAML frontmatter — `name`, `description`, optionally `license`/`argument-hint` — plus
the instruction body). Claude Code auto-detects and loads any skill folder placed in a
project's `.claude/skills/` directory; some skills also install via a marketplace/plugin
command. **This folder (`Porting to Godot/skills/`) is not itself a live `.claude/skills/`
directory** — per `DECISIONS.md` §8, code (and therefore the live skill-loading location)
lives in the new repository once porting begins. To activate any skill vendored here: copy
the relevant subfolder from `skills/` into the new repository's own `.claude/skills/`
directory (or into `Cartalith_RC`'s own `.claude/skills/` right now, if the owner wants
these active for continued HTML-file work too — nothing here is Godot-specific enough to
require waiting).

## Vendored (in `skills/`, ready to copy into a real `.claude/skills/`)

### `skills/ponytail/` — anti-over-engineering discipline

Explicitly requested. **[DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)**,
MIT licensed (verified — copyright notice preserved in the vendored copy's own `LICENSE`
file), a genuinely popular skill (99.5k★ per the marketplace listing found during research).
Core idea: climb a "ladder" before writing code — does this need to exist at all (YAGNI) →
does the codebase already have it → does the standard library → does a native platform
feature → does an already-installed dependency → can it be one line → only then write new
code. Independent benchmarking (cited by JetBrains' own review, found during research)
measured a real, if more modest than the vendor's own claim, effect: −15% code, −10.3% cost,
−11% time on a real repository.

**Why this fits this specific project well, not just generically**: it's close to a formal
version of a rule this project's own root `CLAUDE.md` already states ("Don't add features,
refactor, or introduce abstractions beyond what the task requires... Three similar lines is
better than a premature abstraction"). A ground-up rewrite is exactly the situation where
that discipline is easiest to forget — a blank Rust crate invites building out
speculative structure ("we'll need this later") that the original single-file JS engine
never had, precisely because *it* grew incrementally, one measured change at a time, per its
own `CLAUDE.md`. Ponytail is a reasonable guardrail against a fresh rewrite drifting from
that same discipline.

The vendored copy is the core `ponytail` skill only. The upstream repo also ships companion
skills (`ponytail-audit`, `ponytail-debt`, `ponytail-gain`, `ponytail-review`,
`ponytail-help`) and slash commands — not vendored here (smaller, more workflow-specific,
easy to pull in later from the same repo if wanted; not requested by name).

### `skills/rust-craft/` — general Rust craft, authored after studying the field

Original prose, written for this project after reading the Rust-skill sources the owner
supplied plus official Rust documentation. Not a copy of any of them — see
`skills/rust-craft/ATTRIBUTION.md` for exactly what was studied, what was adopted, what was
deliberately rejected, and which requested sources were unreachable.

Structure: a lean `SKILL.md` carrying the decisions made in every function (signatures,
borrowing, iterators, errors, types that make bugs unrepresentable, numbers, unsafe,
modules, docs, tests, the clippy/fmt/test loop), plus three reference files loaded only when
the subject comes up — `references/errors.md`, `references/async.md`,
`references/performance.md`.

**Written under two constraints the owner set.** Ponytail's ladder decided *what to
include*: a long skill about writing less code would refute itself, so the top-level file
carries only what you hit constantly and everything occasional moved to a reference.
Strunk and White decided *how to phrase it*: active voice, positive form, each rule's reason
in a clause rather than a paragraph, no prose defending a rule the reader can simply follow.

**Sources reachable and studied**: [leonardomso/rust-skills](https://github.com/leonardomso/rust-skills)
(MIT, 265 rules across 26 categories, current through Rust 1.96 / edition 2024 — the most
substantive source found, and the origin of this skill's framing that agents "clone to dodge
the borrow checker, `.unwrap()` everything, and reach for `Box<dyn Trait>` when `impl Trait`
would do"); [actionbook/rust-skills](https://github.com/actionbook/rust-skills) (MIT — source
of the edition-2024 / `rust-version = "1.85"` defaults; its mandatory-router architecture was
deliberately *not* adopted, since a gatekeeper skill adds a hop without adding knowledge);
[onsails/cc](https://github.com/onsails/cc) (MIT — source of the split-at-500-lines
heuristic; its own `SKILL.md` 404'd on direct fetch, so only the repo-level description
informed this).

**Sources requested but unreachable** — this session's network egress proxy blocks these
domains, so nothing from them is represented and no claim in the skill should be attributed
to them: `mcpmarket.com` (rust-best-practices, rust-development-workflow,
rust-developer-intelligence), `lib.rs/crates/claude-rust`, and
`lobehub.com/…/rust-development`. Also blocked: `composio.dev/content/top-claude-skills`,
the article the owner linked — its specific picks are therefore *not* reflected here. If you
want them covered, paste the list and they can be folded in; the skill is structured so a new
rule slots into an existing section rather than forcing a rewrite.

### `skills/godot-shell/` — Godot 4.x as a shell, authored after surveying five packs

Original prose. Covers only what this project touches: keeping logic out of
GDScript, showing a generated field as a texture (including the `update()` over
`create_from_image()` rule that governs regeneration performance), choosing a
renderer, `Control`-node UI, the scene tree's thread rules, and what to commit —
plus `references/export-pipeline.md` for the `.gdextension` manifest, the
editor-works-but-export-fails failure, and the Windows/Android builds.

**Godot 4.x only, stated in the description and enforced in the body.** Godot 4
replaced GDNative with GDExtension outright, so Godot 3 native-code guidance is
not dated — it describes an API that no longer exists.

**Why narrow rather than vendoring a pack**, per Ponytail's first rung: every
Godot pack surveyed teaches game development. This project has no physics bodies,
no animation graph, no navigation, no multiplayer, and no game loop. The full
survey — five packs, sizes, licences, and fit — is in
`skills/godot-shell/ATTRIBUTION.md`, along with which technical claims came from
where. The headline: **[jame581/GodotPrompter](https://github.com/jame581/GodotPrompter)**
(55 skills, MIT, Godot 4.3+) is the recommended companion, because it has
dedicated `gdextension` (godot-cpp *and* Rust), `export-pipeline`,
`mobile-development`, and `multithreading` skills. That overlaps this skill's
export reference honestly rather than quietly — if GodotPrompter covers it better
once installed, delete the reference file and keep the pointer.

### `skills/cartalith-porting-discipline/` — original, authored for this project

Not from an external source — written specifically to encode the decisions in
`DECISIONS.md`/`MVP_SCOPE.md`/`ARCHITECTURE.md`/`PARITY_TESTING.md` as an auto-triggering
skill, so a future session porting a function reflexively checks "which crate does this
belong in" and "does this have a golden-parity test" without needing to have the full
document set open. Read it once directly (`skills/cartalith-porting-discipline/SKILL.md`) to
confirm it actually reflects the current plan — update it if `ARCHITECTURE.md` or
`PARITY_TESTING.md` change, since a skill enforcing a stale rule is worse than no skill.

### `skills/cartalith-rust-conventions/` — original, deliberately small

The handful of rules where this project's constraints override ordinary Rust practice:
match the JS engine's float precision rather than improving on it, don't reorder float
operations without re-running parity tests, state a NaN policy anywhere floats are sorted
(JS comparison against NaN is `false`, Rust's `partial_cmp().unwrap()` panics), and keep
panics from crossing the gdext boundary where they can take down the Godot process.

**It was trimmed when `rust-craft` was written.** Its first draft also carried general Rust
advice — module size, doc comments, dependency hygiene, test structure — which now lives in
`rust-craft`. Leaving both copies would have been exactly the "two functions answering one
question, and they drift" failure this repo's own CHANGELOG documents hitting repeatedly, so
the general half was deleted rather than duplicated. What remains is only what would be
*wrong advice* on any other Rust project.

## Researched, not vendored — recommended for the owner to pull in directly

These are larger, or their license status wasn't confirmed, or both — copying them wholesale
into this repo without the owner reviewing the actual content first isn't appropriate.
Described here with real sourced findings so evaluating them later is a quick decision, not
a re-research project.

### Coding-quality skills

- **[Superpowers](https://github.com/search?q=superpowers+claude+code+skill)** — the
  largest, most-adopted community skill framework found (243,000+★ per the source cited
  during research, checked July 2026). A full methodology, not a single skill: plan-first
  design, test-driven development (RED-GREEN-REFACTOR), systematic debugging via
  root-cause analysis, git worktree management, subagent-driven development, and
  verification-before-completion. **Worth real evaluation** given how closely its stated
  principles (root-cause debugging, verify-before-done) already match this project's own
  measured-not-assumed discipline — but it's a large, multi-skill framework, not a single
  file, so pulling it in is a decision for whoever is about to do the actual coding, not
  something to vendor speculatively now.
- **Anthropic's own official skills repository** (Skill Creator + document-handling
  skills) — the canonical source for how a well-formed skill should be structured; worth
  consulting as a format reference if authoring more custom skills like
  `cartalith-porting-discipline` later.
- **Smaller, focused, single-purpose skills** turned up in the same research pass:
  `code-reviewer`, `git-commit-writer`, `readme-generator`, `pr-description-writer`,
  `changelog-generator`, `env-doctor`. None individually essential, but a
  `changelog-generator`-style skill could be worth adopting once the new repo's own
  `CHANGELOG.md` (per `ARCHITECTURE.md`'s proposed layout) is a real, growing file — it's
  exactly the kind of document this project's own existing HTML-file discipline treats as
  load-bearing, not decorative.

### Godot skill packs

Full survey with sizes, licences, and per-pack fit in
`skills/godot-shell/ATTRIBUTION.md`. In short:

- **[jame581/GodotPrompter](https://github.com/jame581/GodotPrompter)** (55 skills,
  MIT, Godot 4.3+ with 4.5/4.6/4.7 features) — **install this one.** Its
  `gdextension`, `export-pipeline`, `mobile-development`, and `multithreading`
  skills are exactly the four this project needs, and it is the only pack found
  whose GDExtension coverage names Rust explicitly.
- **[vl4dt/godot-skills](https://github.com/vl4dt/godot-skills)** (12 skills, MIT,
  Godot 4.7) — game-oriented; GDExtension only inside the C# skill.
- **[alexmeckes/godot-claude-skills](https://github.com/alexmeckes/godot-claude-skills)**
  (5 skills, MIT) — pairs with godot-mcp for live editor control; interesting if
  you adopt godot-mcp, off-target otherwise.
- **[Randroids-Dojo/Godot-Claude-Skills](https://github.com/Randroids-Dojo/Godot-Claude-Skills)**
  (MIT) — GdUnit4 testing, CI/CD, and web/desktop exports. Worth revisiting for
  CI; note it does not cover Android, the harder target here.
- **[sickn33/antigravity-awesome-skills](https://github.com/sickn33/antigravity-awesome-skills)**
  — an aggregator of 1,400+ skills. Its `godot-gdscript-patterns` is 41 lines
  pointing at a playbook, with no GDExtension, texture, or export coverage. See
  the licensing caution below.

### A caution about the aggregator

Both skills inspected from `sickn33/antigravity-awesome-skills` (`rust-pro`,
`godot-gdscript-patterns`) carry `source: community` and name **no original
author and no license**. That is an unknown, not a permission, so nothing was
copied from it into this repository. Its `rust-pro` (181 lines) also targets
"Rust 1.75+", behind the edition-2024 / 1.85 baseline `rust-craft` uses, and its
Godot skill is a thin pointer file.

Install from an aggregator if you find it convenient; trace a skill to its
original author and licence before vendoring it into a repository you own.

### UX/UI design skills

Given this project targets a real Android app (`.apk`) and a desktop app (`.exe`), and the
2D rendering work in Phase 1/3 (`ROADMAP.md`) will need real interface design (not just a
generation engine), these are worth a genuine look when UI work actually starts:

- **[nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)**
  — **the one the owner named.** MIT licensed, ~23k★ on GitHub (a separate skill directory
  lists it at 115k, so treat any single star count as approximate). Substantial and unusual
  in shape: not one `SKILL.md` but a generator — `src/ui-ux-pro-max/` holds CSV databases
  (84 UI styles, 192 color palettes, font pairings, 99 UX guidelines, 25 chart types, 161
  reasoning rules) plus Python scripts and templates, and a CLI installs platform-specific
  files built from them. Covers stack-specific guidance (React, Next.js, Tailwind),
  accessibility rules, and a pre-delivery checklist.

  **Not vendored, for a structural reason rather than a licensing one** (MIT would permit
  it): it installs itself. The documented path is `npx skills add
  nextlevelbuilder/ui-ux-pro-max-skill`, which generates the files for your platform from
  those CSVs. Hand-copying a generated snapshot into this docs folder would freeze a build
  artifact and cut it off from upstream updates — worse than running the installer in the
  new repo when UI work starts. Recommended as the **first UI/UX skill to install**, at
  Phase 3; its React/Next/Tailwind orientation is a partial fit at best for a Godot UI, so
  expect to use its design-reasoning and accessibility halves more than its stack-specific
  code output.
- **[szilu/ux-designer-skill](https://github.com/szilu/ux-designer-skill)** — comprehensive:
  a 297-line `SKILL.md` plus ~24 reference documents (~10,700 lines total) covering
  accessibility (WCAG 2.2 AA), visual/interaction design, forms, mobile UX, and design
  systems, synthesized from 19 cited sources (Nielsen Norman Group, WCAG 2.2, Material
  Design, Apple HIG). **Not vendored here** — genuinely large (~11k lines), and license
  status wasn't confirmed during research. If the owner wants it, clone it directly into the
  new repo's `.claude/skills/` rather than routing it through this docs folder.
- **[ceorkm/mobile-app-ui-design](https://github.com/ceorkm/mobile-app-ui-design)** —
  compact (~320 lines, ~2,100 words), specifically mobile-app-focused (thumb zone, 8-point
  spacing grid, 60/30/10 color rule, peak-end emotional design, patterns drawn from
  Airbnb/Duolingo/Spotify/Revolut/Phantom). Small enough it COULD reasonably be vendored,
  but **no LICENSE file was found in the repository during research** (a direct fetch
  returned 404) — copying its content wholesale without a confirmed permissive license isn't
  appropriate here. Genuinely worth the owner installing directly if they want it (it's
  public on GitHub, just not re-published into this repo without clearer licensing) — its
  content is summarized accurately above so the decision to pull it in doesn't require
  re-reading the whole thing first.
- **[phazurlabs/ux-ui-mastery ("Sumi")](https://github.com/phazurlabs/ux-ui-mastery)** — a
  much larger system (43 skills, 168 references, 37 commands, described as including an
  "anti-slop engine" and citation trail). Interesting for later, more UI-heavy phases; too
  large and unreviewed to vendor speculatively now.
- **[HermeticOrmus/LibreUIUX-Claude-Code](https://github.com/HermeticOrmus/LibreUIUX-Claude-Code)** —
  very large (70 plugins, 152 agents, 76 commands, 74 skills). Almost certainly overkill for
  this project's actual UI surface (a terrain viewer + minimal controls for MVP, per
  `MVP_SCOPE.md`) — noted for completeness, not recommended to install as-is.

**Recommendation, not a decision made unilaterally**: for the terrain-only MVP
(`MVP_SCOPE.md` point 11, "a minimal UI"), none of the UX/UI skills above are likely worth
the overhead yet — the MVP UI is explicitly minimal by design. Revisit at Phase 3
(`ROADMAP.md`, rendering polish). Install order if you want one: **UI/UX Pro Max** first (the
owner's own pick, MIT, installs itself via its CLI), `ux-designer-skill` after it if
accessibility and design-system rigor become real requirements, and the rest only if a
specific gap shows up.

One caveat worth stating plainly: every UI/UX skill found is written for web and mobile
stacks — React, Next.js, Tailwind, SwiftUI. **Godot's UI system is none of those.** Their
design *reasoning* (hierarchy, spacing rhythm, contrast, thumb zones, accessibility minimums)
transfers; their *code output* does not. Use them for judgement, not for snippets, and expect
to translate.

## What this means practically, right now

Nothing needs to happen with any of this until the new repository (`DECISIONS.md` §8)
actually exists. When it does, copy these four into its `.claude/skills/` as a first setup
step (alongside `TOOLCHAIN.md`'s own steps):

| Skill | Job |
|---|---|
| `ponytail` | whether to write it at all, and how little |
| `rust-craft` | how to write good Rust anywhere |
| `cartalith-rust-conventions` | the few rules where this project overrides ordinary Rust |
| `godot-shell` | Godot 4.x as the drawing and packaging layer |
| `cartalith-porting-discipline` | which crate it belongs in, and whether parity-verified |

They are deliberately non-overlapping, and each one's own description says which of the
others owns an adjacent question — so a session that loads one can find the right neighbour
instead of guessing or duplicating.

Then install **GodotPrompter** for the Godot depth this project will need beyond the shell
(GDExtension, export pipeline, mobile, multithreading), and add **UI/UX Pro Max** at Phase 3
when the interface stops being four controls.

Treat the "researched, not vendored" list above as a shopping list to revisit when each
item's own phase actually starts.
