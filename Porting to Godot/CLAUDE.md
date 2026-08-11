# Porting to Godot — directory instructions

This file is scoped to the `Porting to Godot/` folder — it supplements, and does not
replace, the repository root's own `CLAUDE.md` (which governs `Cartalith Gen1 v*.html`
itself and is unrelated to this effort except as the source material being ported).

**This folder is documentation and reference material only.** No Rust or Godot project
lives here, and none should be created here — per `DECISIONS.md` §8, the actual Rust/Godot
project source belongs in a **new, separate repository**, created once porting work
actually begins.

## Read `README.md` first, always

`README.md` in this folder is the real entry point — decision summary table, reading order
for every other document, and the working discipline that applies to any session doing port
work. This `CLAUDE.md` exists only to make sure `README.md` (and the constraints below) load
automatically; it is not a substitute for reading `README.md` and `DECISIONS.md` in full
before doing anything substantive.

## Hard constraints for any session working in this folder

- **Do not write Rust or Godot project files here.** If porting work is actually starting,
  the first step is creating the new repository per `ARCHITECTURE.md`'s proposed layout —
  not adding `Cargo.toml`/`project.godot` files inside `Cartalith_RC`.
- **Do not edit `reference/Cartalith Gen1 v2.10.html`.** It is a frozen snapshot — the exact
  version every other document in this folder (`MVP_SCOPE.md`, `SAVEFILE_COMPAT.md`,
  `reference/FUNCTION_INDEX.md`) was written against. If the live file in the repository
  root has moved to a newer version, that's expected and fine — but don't overwrite this
  frozen copy without deliberately re-freezing a new one AND regenerating
  `FUNCTION_INDEX.md` to match (see that file's own header for the regeneration note), so
  the two never silently drift apart.
- **Do not silently deviate from the decisions in `DECISIONS.md`.** If something in there
  looks wrong once real porting work starts, that's a real possibility — architecture
  decided before any code exists sometimes needs revision — but raise it with the owner and
  update `DECISIONS.md` with the new reasoning, the same way the HTML project's own
  `CHANGELOG.md` discloses every deliberate re-baseline rather than changing behavior
  quietly.
- **This folder's docs are allowed to go stale — flag it when they do.** Godot versions,
  `gdext` maturity, crate ecosystem specifics (`TOOLCHAIN.md`, `REFERENCES.md`) will age.
  Re-verify before trusting a version number or a "current status" claim written here,
  exactly as those documents themselves say.

## What's in this folder

| Path | What it is |
|---|---|
| `README.md` | Start here — decisions summary + reading order |
| `DECISIONS.md` | Every major choice and why, in order made |
| `MVP_SCOPE.md` | Precise terrain-only MVP boundary + success criteria |
| `ARCHITECTURE.md` | Rust↔Godot split, per-subsystem crate layout |
| `SAVEFILE_COMPAT.md` | The HTML app's `.zip` save format, verified against the live code |
| `PARITY_TESTING.md` | Golden-value testing strategy vs. the JS engine |
| `REFERENCES.md` | Researched, sourced external libraries/projects worth using |
| `TOOLCHAIN.md` | Exact setup steps before writing any Rust/Godot code |
| `ROADMAP.md` | Rough phases beyond the MVP |
| `SKILLS.md` | Which Claude Code skills are vendored here, which are recommended-not-vendored, and why |
| `skills/ponytail/` | Vendored anti-over-engineering skill (MIT, see `SKILLS.md`) |
| `skills/rust-craft/` | General Rust craft — signatures, borrowing, errors, types, tests, plus references on errors/async/performance |
| `skills/cartalith-rust-conventions/` | Only the Rust rules this project overrides (float parity, NaN policy, gdext panic boundary) |
| `skills/cartalith-porting-discipline/` | Original skill encoding this port's own working rules |
| `reference/Cartalith Gen1 v2.10.html` | Frozen snapshot this whole folder is built against |
| `reference/FUNCTION_INDEX.md` | Mechanically-generated name→line index of every top-level function in that snapshot |

## If you're here to actually start porting

1. Read `README.md`, `DECISIONS.md`, `MVP_SCOPE.md`, `ARCHITECTURE.md` in that order.
2. Confirm the frozen `reference/` snapshot is still the current HTML version — if the repo
   root has a newer `Cartalith Gen1 v*.html`, decide with the owner whether to re-freeze
   before starting (a newer version may have fixed something relevant, per that project's
   own extensive per-version CHANGELOG).
3. Follow `TOOLCHAIN.md`'s Phase 0 walking-skeleton steps in a **new repository** before
   porting any real engine logic.
4. Copy `skills/ponytail/` and `skills/cartalith-porting-discipline/` into that new
   repository's own `.claude/skills/` directory as part of its own initial setup.
