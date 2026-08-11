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

### `skills/cartalith-porting-discipline/` — original, authored for this project

Not from an external source — written specifically to encode the decisions in
`DECISIONS.md`/`MVP_SCOPE.md`/`ARCHITECTURE.md`/`PARITY_TESTING.md` as an auto-triggering
skill, so a future session porting a function reflexively checks "which crate does this
belong in" and "does this have a golden-parity test" without needing to have the full
document set open. Read it once directly (`skills/cartalith-porting-discipline/SKILL.md`) to
confirm it actually reflects the current plan — update it if `ARCHITECTURE.md` or
`PARITY_TESTING.md` change, since a skill enforcing a stale rule is worse than no skill.

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

### UX/UI design skills

Given this project targets a real Android app (`.apk`) and a desktop app (`.exe`), and the
2D rendering work in Phase 1/3 (`ROADMAP.md`) will need real interface design (not just a
generation engine), these are worth a genuine look when UI work actually starts:

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
(`ROADMAP.md`, rendering polish), where `mobile-app-ui-design` (compact, Android-relevant)
is the most proportionate first pick, with `ux-designer-skill` as the deeper option if
accessibility/design-system rigor becomes a real requirement.

## What this means practically, right now

Nothing needs to happen with any of this until the new repository (`DECISIONS.md` §8)
actually exists. When it does: copy `skills/ponytail/` and
`skills/cartalith-porting-discipline/` into its `.claude/skills/` directory as a first
setup step (alongside the toolchain steps in `TOOLCHAIN.md`), and treat the "researched, not
vendored" list above as a shopping list to revisit at the point each item's own relevant
phase actually starts.
