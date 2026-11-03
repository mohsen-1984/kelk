# Kelk redesign — hand-over after P4 (continue with P5)

*Written 1405-08-12 at the end of the session that ran P3.1–P4.3. Self-contained: a fresh Claude Code session on any
machine continues from here with no access to the earlier session. Part A is the prompt to paste; Part B is the
end-of-P4 report (what was done, results, decisions, CI, workload); Part C lists what is open.*

---

## Part A — Prompt for the next session

Paste everything between the lines into a new Claude Code session opened at the repository root (after
`git pull` on `main` and `npm ci`).

---

Continue the Kelk redesign plan (`.claude/plans/Kelk-Redesign.md`) with **Phase P5** (app and libraries):
P5.1 → P5.2 → P5.3 → P5.4 → P5.5, as written in plan §6 P5, each with its acceptance criteria.

**Where things stand (1405-08-12):** P0–P2 are approved and merged into `main`. **P3.1–P4.3** ran as one stacked
batch (`redesign/P3.1` from `main` → `P3.2` → … → `P4.3`), draft PRs #15–#17 and #19–#23, each based on the branch
below it; **merged only after the owner's written confirmation**, in stack order with merge commits after each one's
green checks (as PRs #8–#14 were). Read first: `CLAUDE.md`, `docs/ContributeLog.md`, the plan (§4 process rules, §5
tracker, §6 P5, the dependencies paragraph), this file (Part B is the state of every check, Part C the open items),
`docs/HELDOUT.md` and the eight P3–P4 reports in `docs/reports/` (format to follow).

**First, before P5.1:** if the PRs are not merged yet, ask whether they are approved; settle the owner items of
Part C that need an answer (they are questions, not tasks).

**P5 notes from P3–P4:**
- P5.1: the PDF importer already loads on demand (`libs.pdfimport` in `scripts/config.js`, P3.1); what is left is the
  four builders, `mathCore`, lucide and the duplicate hljs CSS, and pdf.js as a real Worker off `file://`. Startup
  is 1,330,719 bytes at the top of the P3–P4 stack (budget 1,990,000 — lower it with P5.1; target ≤ 0.6 MB).
- P5.2 is a no-output-change refactor of the builders: the P2.3 goldens (`npm run test:golden`, 365 snapshots) and
  `roundtrip.js` (529 cells, 3 known) prove it. The P3.3 CI run showed that the builder round trip catches importer
  changes the PDF lab does not — run both for any `lib/pdfimport/` change too.
- The PDF lab has four guards now: corpus (171 visible files), fuzz dev / held-out, the metamorphic net, golden-50,
  plus the held-out real documents as a mean (`run-import.js --real-heldout`). Held-out sets are read as means only;
  any opening is logged in `docs/reports/heldout-opened.log` (committed).

**Working method (same as P3–P4; the owner's standing instructions):**
- Every multi-step task starts with a TodoWrite checklist, one item per action, each marked done as it finishes.
- Branches stacked `redesign/P5.1` (from `main`, or from `redesign/P4.3` if P3–P4 are not merged yet) → `P5.2` → …;
  each sub-phase: its commits, its report `docs/reports/P5.x-<slug>.md`, its tracker row, Known Issues and Testing
  updated, its Change History rows.
- Parallel agents in their own worktrees (`isolation: "worktree"`) with self-contained briefs, told the exact commit
  to check out first; agents do not commit; the lead applies their diff (`git -C <worktree> add -A && git -C
  <worktree> diff --cached --binary`, then `git apply --3way`) and resolves conflicts. Merge up the stack after every
  change below the top (ContributeLog conflicts: union of rows, then `contributelog.mjs fix`).
- An independent reviewer agent per sub-phase gets the diff and the plan, not the implementer's conclusions; every
  finding is verified before it is applied.
- Importer changes: `run-import.js` (+ `--real-heldout`), `golden.js`, `run-fuzz.js dev` and `heldout`,
  `run-meta.js` (qpdf on `PATH`), then `gate.js`. `LAB_OUT` outside the repo. Never `gate.js --update` after a
  filtered run. New baselines on the CI runner (manual `pdf-lab.yml` run with `baseline` ticked).
- Every sub-phase ends with lint 0 errors, `check:version`, `check:i18n`, `check:size`, `check:a11y`, `npm test`,
  `test:golden`, `roundtrip.js`; CI `tooling`, `pdf-lab`, `builders`, `site` green on the PR.
- New npm devDependencies ≥ 14 days old; new CI tools pinned.
- Commit messages start with "Zarrabi: " (or the active contributor's name); no co-author or "Generated with" lines;
  never `--no-verify`. Change History descriptions state only the action. Shamsi dates. Generated parts of
  ContributeLog only through `node .claude/scripts/contributelog.mjs fix`.
- Workload: `node .claude/scripts/workload.mjs`, measured, never an agent's own estimate; one row per contributor (lead
  per sub-phase, each agent with its own scope — reviewers and writers included, the owner).
- The gh CLI token lacks pull-request rights: PRs and merges through the GitHub REST API with the stored git
  credential (`git credential fill`) and `curl`, with retries. Do not merge a PR or delete a branch before the owner's
  written confirmation.

Report and ask for confirmation at the end of P5 (or as the owner asks).

---

## Part B — End-of-P4 report (P3.1–P4.3)

All on 1405-08-12, this machine (Windows, Playwright 1.64.1 / Chromium 156, qpdf 11.9.0, no wkhtmltopdf — the fuzz's
wkhtmltopdf share drawn with Chromium). Held-out figures are means.

| Sub-phase | PR | Report | Result |
|---|---|---|---|
| P3.1 Split long functions | #15 | [P3.1-split.md](reports/P3.1-split.md) | the importer in `lib/pdfimport/` (8 parts), byte-identical; loaded on demand; Playwright 1.64.1; `commits` PR check; CI baseline for Chromium 156 |
| P3.2 Registry, calibration, telemetry | #16 | [P3.2-registry.md](reports/P3.2-registry.md) | 1,007 thresholds, 377 rules in `r.rules`, `r.calibration`; byte-identical |
| P3.3 Metamorphic order | #17 | [P3.3-metamorphic-order.md](reports/P3.3-metamorphic-order.md) | `/Rotate`, tracking, watermark, object-stream ActualText, scaled pages, no-ToUnicode fonts: meta "same" 133 → 185 / 199, fuzz dev 86.6 → 86.8, held-out 88.0; the plan's literal migrations measured and rejected |
| P3.4 Confidence & fallback ladder | #19 | [P3.4-ladder.md](reports/P3.4-ladder.md) | full → simplified → textContent → ocr; `mode`; `r.pages`, `r.report`; the textContent rung in logical RTL order; auto byte-identical; safe mode 97.8 / 97.5 |
| P3.5 Import report UI | #20 | [P3.5-import-report.md](reports/P3.5-import-report.md) | `#import-report` panel, every note code in fa / en / ar, axe passes |
| P4.1 Real-producer corpus | #21 | [P4.1-real-producers.md](reports/P4.1-real-producers.md) | 44 PDFs from Office 2024, Print to PDF, Edge, Chromium, Firefox; metadata stripped; corpus 144 → 188 (94.6) |
| P4.2 Golden-50 | #22 | [P4.2-golden-50.md](reports/P4.2-golden-50.md) | 50 goldens from the page, gated per file; 45 visible 92.7, held-out 5 86.0 |
| P4.3 Held-out protocol | #23 | [P4.3-heldout.md](reports/P4.3-heldout.md) | `docs/HELDOUT.md`; real held-out split by document (committed list), opened log in the repository, guarded lab tools; real held-out 84.5 |

**Whole lab at the top of the stack** (`redesign/P4.3`): corpus 171 visible files 95.6; real held-out 17 PDFs of
4 documents 84.5 (`rtl` column 83.1); goldens 92.7 / 86.0; fuzz dev 86.8, held-out 88.0; meta "same" 185 / 199,
0 unexpected; crash sweep 191 files, 0 errors; stress passed (276 pages, longest main-thread gap 0.5 s); gate passed.
Unit tests 187; lint 0 errors; startup 1,330,719 bytes.

**CI:** P3.1 and P3.2 green. P3.3's first run was red in the builder round trip (three short Kelk-built documents
lost their margins under the scaled-page rule); fixed on P3.3 and merged up (round trip 529 / 3 known, goldens
365 / 365, lab byte-identical). The `pdf-lab` run with `baseline` ticked on `redesign/P4.3` (41614394197) wrote the new
baseline, committed as `tests/pdf-lab/baseline.json`: corpus 171 visible 95.6, fuzz dev 86.0 / held-out 86.9, meta
185 / 199, real held-out 84.5, goldens 45 + held-out mean 86.0. Every PR (#15–#17, #19–#23) green.

**Review:** an independent reviewer per sub-phase; every finding verified and applied (each report's §3). Review
fixes were done by agents resumed after a checkpoint; their minutes are measured.

**Workload:** `node .claude/scripts/workload.mjs --since 4d10362` — every 1405-08-12 row measured (four P3.3 rows
first written from agents' estimates were corrected: 35 → 15, 50 → 16, 25 → 7, 15 → 5; the missing rows for the
goldens' writers and four reviews added). The owner's time: proposed by `workload.mjs`, ≈ 26 min (answering the
end-of-P2 questions) — to confirm.

---

## Part C — Open items

**For the owner (questions):**
1. Approve P3.1–P4.3 and the merge of PRs #15–#17, #19–#23 into `main`.
2. P3.3's scope: the plan's literal migrations were measured and rejected (none paid); no registry entry is switched
   to calibrated. Does P3.3 stand as done this way?
3. The Persian goldens (P4.2 acceptance): `word-memo` «باسمه‌تعالی» half-space, `word-plan`'s run-together title,
   the wkhtmltopdf clipped fragments «نده» / «حتاج» (left out), unlabelled letter heads, the sidebar menu left out.
4. B Nazanin's source in the prerequisites is given as the free "B" family (Borna Rayaneh) — confirm.
5. The person's minutes for P3–P4 (≈ 26 proposed).
6. PR #18 "Kelk 2.0" is open and not part of this stack — keep, close or rebase?
7. In full mode a page that could not be read has `mode: 'failed'` (beyond the contract's four modes; the panel shows
   it as "not read") — keep?

**Tasks:**
- From 1405-08-19: `"overrides": { "minimatch": "11.0.1" }` (npm advisories, Known Issues).
- Delete `wip/P4.2-goldens` once P4.2 is merged (its content is in P4.2).
- The textContent rung on wkhtmltopdf / Word files (one glyph per pdf.js item, no drawn spaces); `pagebg` −3.4,
  `band` −2.7, `noToUnicode` −46.1; the goldens' worst cases (LibreOffice HTML RTL lists and tables, bordered form
  boxes) — Known Issues.
- LibreOffice real-producer files (`lowriter--real-*`) could be made on CI.
