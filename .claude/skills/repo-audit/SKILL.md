---
name: repo-audit
description: Use when asked to check, scan, audit or review the Somewhere repo for inconsistencies, contradictions, stale text, bad conventions or rule violations, and report findings (without changing anything unless asked).
---

# Repo audit for Somewhere

Goal: find everything in the repo that contradicts itself, breaks a rule in `CLAUDE.md`, is out of date, or won't scale, and **report it**. Do not change any file unless the user explicitly asks for fixes.

## 1. Read everything first

Read in full, don't skim: `CLAUDE.md`, `AGENTS.md`, `README.md`, every file in `docs/`, `.claude/skills/*/SKILL.md`, root `package.json`, `pnpm-workspace.yaml`, `biome.json`, `.gitignore`, `.github/workflows/*`, every `package.json` and `tsconfig.json` under `apps/` and `packages/`, `apps/web/public/assets/catalog.json`, `apps/web/public/assets/palette.json`, `scripts/*`, and all source files (excluding `node_modules`, `dist`).

Also check `git status` and `git log --oneline -5` (uncommitted work, unpushed commits).

## 2. Run the checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm palette:check  # validates palette.json and checks palette.png is up to date; writes nothing
```

Record any failure as a finding (with the exact error).

## 3. Checklist

### Rules vs docs

- Every hard rule in `CLAUDE.md` matches what `docs/` says: tile zoom and size, axes (x east, z south), region projection formula, global seeding, `TileSource` and sources by phase, decisions keyed by type-qualified OSM ID, asset catalog, palette by name, scalability rule, testing rules, approved libraries.
- The folder layout in `CLAUDE.md` matches `docs/03-architecture.md`.
- Data types in `docs/03-architecture.md` agree with the rules (stored data uses lat/lon, OSM IDs or bearings; never local x/z).
- MVP scope in `CLAUDE.md` matches `docs/02-mvp.md`, `docs/12-roadmap.md` and the art-style skill's scope reminder.

### Rules vs code

- Folders and package names match the layout (`@somewhere/web`, `@somewhere/world`).
- `packages/world` never imports `three`, `@dimforge/rapier3d-compat` or DOM APIs; its tsconfig `lib` excludes DOM.
- Only `apps/web/src/render` imports `three`; only `src/physics` and `src/player` import Rapier.
- No `Math.random()`, `Date.now()` or `new Date()` in generation code; seeds come from global values.
- No hard-coded `.glb` file names in generator, decision or AI code (assets go through the catalog selector).
- No hard-coded hex colours in generator or render code where a palette name should be used.
- Every module in `packages/world` has a `*.test.ts` next to it; no `test/` folders; no tests calling the network.
- `--passWithNoTests` is gone once world tests exist.
- Only approved libraries for their jobs; every dependency listed in `docs/10-tech-stack.md`.

### Data files

- `catalog.json`: valid, every `file` exists, IDs unique and lowercase-dotted, every entry has source + licence, no deleted IDs (only `deprecated`).
- Every `.glb` in `apps/web/public/assets/` has a catalog entry.
- `palette.json`: valid and `palette.png` + `docs/palette-preview.html` up to date (`pnpm palette:check` passes). Never run `pnpm palette` during an audit: it rewrites files.
- Every `pal:<name>` material used by models exists in `palette.json`; palette variants only use known names.

### Plan and docs vs docs
- Build order in `docs/02-mvp.md` matches the MVP subset in `docs/04-pipeline.md` and the "done when".
- MVP scope agrees across `CLAUDE.md`, `02-mvp.md`, `04-pipeline.md`, `08-missing-data.md` and `12-roadmap.md` (nothing in one doc's MVP that another excludes).
- The AI order in `docs/06-decisions-and-ai.md` matches the phases in `docs/12-roadmap.md`.
- The data plan by phase in `docs/05-data-sources.md` matches `CLAUDE.md` hard rule 4, `docs/10-tech-stack.md` and the roadmap's launch section.
- `docs/10-tech-stack.md` "When" columns match when the roadmap introduces each tool.
- Every roadmap phase's prerequisites come before it (e.g. photo profiles need kit pieces and a profiles table first).
- Each concept is described the same way everywhere it appears (e.g. whether something is generated or a model; where coordinates are converted; freshness intervals).
- Everything the docs say is in the palette or catalog actually exists there (e.g. surface colours listed in `docs/07-assets.md`).

### Configs and tooling

- Root scripts, CI steps (`lint`, `typecheck`, `test`, `build`), `packageManager` pnpm version and Node version agree.
- No `package-lock.json` or `yarn.lock`; lockfile committed.
- Biome is the only linter/formatter; `.vscode` settings match.

### Stale or leftover text

- Status lines (`CLAUDE.md`, `docs/README.md`) match reality.
- No references to removed things (deleted folders or files, superseded decisions, old names).
- Doc numbering and links all resolve; table of contents matches the files.
- Empty folders or skill folders without a `SKILL.md`.

### Scalability (hard rule 11)

- Any shortcut without a swappable interface, or without its scalable replacement named in the docs.
- Anything that would break at many players, worldwide coverage, or on the server.

## 4. Report

Report in chat, most important first, grouped like this:

1. **Fix before more code** (contradictions or violations that would make the next code wrong)
2. **Gaps** (missing pieces the rules require)
3. **Out of date** (stale text, leftovers)
4. **Small convention issues**
5. **Checked and fine** (one short line listing what passed)

For each finding: what's wrong, where (file and line or section), and why it matters, in one or two plain sentences. Number the findings so the user can say "fix 1–5, skip 7".

End by asking which findings to fix. Don't fix anything until the user says which.
