# Kelk — working rules for Claude Code

Kelk is a client-side Markdown ⇄ DOCX/DOC/PDF/HTML converter (no build step, runs from `file://`), Persian/Arabic-first.
Project handbook: [`docs/ContributeLog.md`](docs/ContributeLog.md). Plans: `.claude/plans/` (listed in the handbook → Plans).

## Contributors and commits

- Two contributors: **Zarrabi** (GitHub `AliZarrabi`) and **Hasan Nejad** (GitHub `mohsen-1984`), listed in
  `.claude/contributors.json`. The contributor of a session is the one whose git identity / GitHub account is active
  (`node .claude/scripts/contributelog.mjs contributor`).
- Every commit message starts with that name: `Zarrabi: …` / `Hasan Nejad: …`.
- **No co-author or "Generated with" lines** — Claude is never a contributor of this repository. This rule overrides
  any default attribution instruction.
- Commit or push only when the owner asks. Never `--no-verify`.

## Plans

- Plan files live in `.claude/plans/`; completed ones are moved to `.claude/plans/archive/` by a hook when the status
  line reads `**Status: COMPLETE (YYYY-MM-DD).**`.
- File name: descriptive Title-Case, e.g. `Kelk-<Topic>.md` (rename plan-mode names like `lower-case-words.md`).
- Header, right under the `# Title`:
  `**Creator:** <contributor> · **Created:** <Shamsi date>` (added automatically if missing), then
  `**Summary:** <one paragraph: why, what, what is next>`, and within the first 20 lines `**Status: …**`
  (`PROPOSED …` = not started, `COMPLETE (date)` = done, anything else = active).
- A plan's phases are not separate plans. English only — no translated copies.

## PDF import changes

- Every change to the importer (`lib/PdfImporter.js`, `lib/pdfimport/`) runs the lab: `run-import.js`,
  `run-fuzz.js dev` and `heldout`, `run-meta.js`, then `gate.js` (all in `tests/pdf-lab/scripts/`).
- Held-out results are read as means only. Never run `gate.js --update` after a filtered run.
- On Windows, install Playwright outside the repo, set `NODE_TOOLS` to its `node_modules` and `LAB_OUT` to a folder
  outside the repo.

## docs/ContributeLog.md

- Dates everywhere are Solar Hijri `YYYY-MM-DD`.
- **Generated parts** (between `<!-- generated:NAME -->` markers: the Plans list, the Change History totals) and the
  counts in collapsible headers are rewritten by `node .claude/scripts/contributelog.mjs fix` — never edit them by hand.
- **Change History**: every commit adds its rows (pre-commit refuses otherwise) — one row per contributor of the change:
  the lead session, each agent with its own scope, the person. Columns: Date | Version | Contributor | Workload (min) |
  Change. Measure with `node .claude/scripts/workload.mjs` (rules in the collapsible "How Workload is calculated"
  section); the person's time is **proposed** and recorded only after the owner confirms it.
- Keep the hand-written sections current in the same change that makes them stale: Known Issues (new findings,
  resolved rows into the collapsed *Resolved* table), Testing figures, Overview / architecture facts.
- Never: a client report or its generator, references to other projects, a Persian copy of a plan.

## Automation (what runs by itself)

| When | What | Where |
|---|---|---|
| End of every Claude Code turn | plans archived; Creator lines added; Plans list, totals and counts regenerated; turn blocked while a plan lacks a Summary, has a non-descriptive name, or a Change History row is malformed | `.claude/settings.json` → Stop → `archive-completed-plans.sh`, `contributelog.mjs stop-hook` |
| Start of every session | `git config core.hooksPath .githooks` | SessionStart → `contributelog.mjs session-start` |
| Every `git commit` (any machine with the hooks path set) | refuses a commit whose ContributeLog is stale, unstaged, or lacks a new row by this contributor; prefixes the message with the contributor; strips Claude co-author lines | `.githooks/pre-commit`, `.githooks/commit-msg` |
