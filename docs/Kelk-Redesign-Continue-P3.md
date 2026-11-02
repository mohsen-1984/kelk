# Kelk redesign — hand-over after P2 (continue with P3)

*Written 1405-08-12 at the end of the session that ran P1.2–P2.4. Self-contained: a fresh Claude Code session on any
machine continues from here with no access to the earlier session. Part A is the prompt to paste; Part B is the
end-of-P2 report (what was done, results, decisions, CI, workload); Part C lists what is open.*

---

## Part A — Prompt for the next session

Paste everything between the lines into a new Claude Code session opened at the repository root (after
`git pull` on `main` and `npm ci`).

---

Continue the Kelk redesign plan (`.claude/plans/Kelk-Redesign.md`) with **Phase P3** (importer structure,
calibration, degradation): P3.1 → P3.2 → P3.3 → P3.4 → P3.5, as written in plan §6 P3, each with its acceptance
criteria.

**Where things stand (1405-08-12):** P0, P1 (P1.1–P1.4) and P2 (P2.1–P2.4) are approved and merged into `main`
(PRs #3–#14; P1.2–P2.4 as PRs #8–#14, merge commits `5d23e3f` … `bef9b24`). Read first: `CLAUDE.md`,
`docs/ContributeLog.md`, the plan (§4 process rules, §5 tracker and merge notes, §6 P3, the dependencies paragraph),
`docs/Kelk-Redesign-Continue-P3.md` (this file — Part B is the state of every check, Part C the open items) and the
seven P1.2–P2.4 reports in `docs/reports/` (format to follow).

**First, before P3.1:** settle the owner items of Part C that need an answer (they are questions, not tasks), and
record P1.2–P2.4's approval rows if the owner corrects any workload figure.

**P3 notes from P2:**
- P3.1 (split long functions) is a pure refactor: `cmp.js` 0 changed Markdown files for corpus and fuzz dev, meta
  "same" count unchanged — the extended net (P2.2) now asserts the "same" transforms byte for byte, with a per-file
  allow-list (`KNOWN` in `tests/pdf-lab/scripts/run-meta.js`) carrying floors.
- P3.3's order comes from the metamorphic net (CI baseline, run 41509321814): `rotate180` −83.0, `rotate90` −82.4
  (**the importer does not apply a page's `/Rotate`** — first), `noToUnicode` −81.0, `stamp` −32.7, `trackLoose`
  −12.2, `tz85` −9.2, `trackTight` −3.6, `pagebg` −3.3, `band` −2.7, `scale80` −1.4, `objstm` −0.7.
- P3.3's floors are the generator-4 fuzz baseline (P2.1, CI run 41507779260): **dev 86.0, held-out 86.9** (means
  only), RTL files 77.1 / 80.6, `rtl` column 85.0 / 85.8. The old "held-out ≥ 94.6" was a generator-3, English-only
  figure; the plan already says so.
- The corpus part of `tests/pdf-lab/baseline.json` is still the 1405-08-10 one: P1.3 raised five files (corpus mean
  95.7 → 96.2). Rewrite it with `gate.js --update` on a **full** run as the first lab step of P3 (or in P3.1's
  approval step), never after a filtered run.

**Working method (same as P2; the owner's standing instructions):**
- Every multi-step task starts with a TodoWrite checklist, one item per action, each marked done as it finishes.
- Branches stacked `redesign/P3.1` (from `main`) → `P3.2` → …; each sub-phase: its commits, its report
  `docs/reports/P3.x-<slug>.md`, its tracker row, Known Issues and Testing updated, its Change History rows.
- Parallel agents in their own worktrees (`isolation: "worktree"`) with self-contained briefs (plan text, files owned,
  acceptance checks, rules). Note: a worktree starts at the repository's default branch — tell each agent the exact
  commit to check out first. Agents do not commit; the lead applies their diff (`git -C <worktree> add -A &&
  git -C <worktree> diff --cached --binary`), and resolves conflicts.
- An independent reviewer agent per sub-phase gets the diff and the plan, not the implementer's conclusions; every
  finding is verified before it is applied.
- Importer changes: `run-import.js`, `run-fuzz.js dev` and `heldout`, `run-meta.js`, then `gate.js` (parallel
  background runs). `LAB_OUT` outside the repo. Held-out as means only. Never `gate.js --update` after a filtered
  run. New fuzz / meta baselines are built on the CI runner (manual `pdf-lab.yml` run with `baseline` ticked); commit
  only the part of the candidate that the sub-phase owns.
- Every sub-phase ends with lint 0 errors, `check:version`, `check:i18n`, `npm test` (new tests in `tests/unit/`),
  `test:golden`, and the lab green where the rules require it. CI: `tooling`, `pdf-lab`, `builders`, `site` green on
  the PR.
- New npm devDependencies ≥ 14 days old (`npm install --before=<today − 14 days> --save-exact`); new CI tools
  pinned.
- Commit messages start with "Zarrabi: " (or the active contributor's name); no co-author or "Generated with" lines;
  never `--no-verify`. Descriptions in the log state only the action. Shamsi dates. Generated parts of
  ContributeLog only through `node .claude/scripts/contributelog.mjs fix`.
- The gh CLI token lacks pull-request rights: open PRs and merge through the GitHub REST API with the stored git
  credential (`git credential fill`), with retries (the network drops connections). Do not merge a PR or delete a
  branch before the owner's written confirmation.
- Workload: `node .claude/scripts/workload.mjs`; one row per contributor (lead per sub-phase, each agent with its own
  scope, the owner); the owner's time is proposed with its derivation.

Report and ask for confirmation at the end of P3 (or as the owner asks).

---

## Part B — End-of-P2 report (P1.2–P2.4)

All seven sub-phases were run in one stacked batch on 1405-08-11, approved by the owner the same day ("merge all
branches to the main") and merged 1405-08-12 in stack order, each after its PR's checks were green.

| Sub-phase | PR | Merge commit | Report |
|---|---|---|---|
| P1.2 Security hardening | [#8](https://github.com/mohsen-1984/kelk/pull/8) | `5d23e3f` | [`reports/P1.2-security.md`](reports/P1.2-security.md) |
| P1.3 Builder bugs B1–B8 | [#9](https://github.com/mohsen-1984/kelk/pull/9) | `548a92e` | [`reports/P1.3-builder-bugs.md`](reports/P1.3-builder-bugs.md) |
| P1.4 i18n & small app bugs | [#10](https://github.com/mohsen-1984/kelk/pull/10) | `9a96317` | [`reports/P1.4-i18n.md`](reports/P1.4-i18n.md) |
| P2.1 RTL fuzz corpus | [#11](https://github.com/mohsen-1984/kelk/pull/11) | `ea7f0ae` | [`reports/P2.1-rtl-fuzz.md`](reports/P2.1-rtl-fuzz.md) |
| P2.2 Metamorphic net extended | [#12](https://github.com/mohsen-1984/kelk/pull/12) | `338d55a` | [`reports/P2.2-meta-net.md`](reports/P2.2-meta-net.md) |
| P2.3 Builders in CI, DOCX validation, goldens | [#13](https://github.com/mohsen-1984/kelk/pull/13) | `b522932` | [`reports/P2.3-builders-ci.md`](reports/P2.3-builders-ci.md) |
| P2.4 Site quality jobs | [#14](https://github.com/mohsen-1984/kelk/pull/14) | `bef9b24` | [`reports/P2.4-site-quality.md`](reports/P2.4-site-quality.md) |

`main` after the last merge: see the plan's §5 merge note (run ids of `tooling`, `pdf-lab`, `builders`, `site`,
Pages).

### P1.2 Security hardening
- **Changed:** DOMPurify `SANITIZE_NAMED_PROPS` (ids → `user-content-…`; in-document links, `<a name>`, image maps
  and `<area>` follow) and `FORBID_TAGS` form controls + `<style>` (task-list checkboxes rebuilt disabled); custom
  header / footer HTML through the same sanitiser; **B4** `HtmlBuilder.toHtml` in an inert document with `defang`;
  a CSP `<meta>` (`script-src 'self' 'wasm-unsafe-eval'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data:
  blob: https: http:`, `worker-src 'self' blob:`, `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`);
  `rel="noopener noreferrer"` on every link with a target; DOCX bookmark names without the prefix.
- **Acceptance:** met — hostile Markdown (`<div id="toasts">`, `<style>`, `<img onerror>`, forms, `javascript:`)
  leaves the app intact; all five exports and a PDF import work under the CSP on `file://` and http
  (`tests/unit/csp-browser.js`, also pdf.js's WebAssembly image decoders).
- **Review:** 1 high (the CSP blocked WebAssembly → scanned PDFs would lose pictures; fixed with
  `'wasm-unsafe-eval'`), 6 low (names, bookmarks, `<area>`, `defang` of SVG animation and XML `data:`, report
  wording, tests) — all applied.
- **Decisions:** `img-src` also `https: http:` (remote images in Markdown); three extra directives; one sanitiser;
  prefixed ids kept in exports; `'wasm-unsafe-eval'` allows WebAssembly only, not `eval`.
- **CI:** `tooling` 41504144589 green.

### P1.3 Builder bugs B1–B8 and the `fa-features` bisect
- **Changed:** **B1** U+0649 → FBE8 / FBE9, joining types from Unicode `ArabicShaping.txt`, letters joined only on
  sides whose forms exist; **B2** rowspan columns from `_tableStyleGrid`; **B3** rows taller than a page split per
  cell line (`rowspan="0"` to the end of its section); **B5** DejaVu Sans Mono in the suite; **B6** one
  `NAMED_COLORS` (`BuilderBase.colorHex`, transparent → no fill, partial alpha over white); **B7** delayed revoke;
  **B8** dead regexp; `BidiCore` RTL letter range widened; `fa-features`: the scorer's nested-quote key
  (`softJoin`) and the RTL quote rules (direction from the outer level).
- **Acceptance:** met — `fa-features` quote 0 → **100** on all four producers; suite 473 pass / 3 known red;
  50 unit tests. One case red by design: eight Arabic letters have no glyph in any bundled PDF font.
- **Lab (CI, head vs base on the same PDFs):** corpus **95.7 → 96.2**, `rtl` unchanged (92.9), fuzz dev 96.0 /
  held-out 94.6 **+0.0**, meta equal, gate passed (`pdf-lab` 41506445247).
- **Review:** 2 medium (mixed-direction nested quotes mirrored; B3 split with mixed line pitches), 6 low — all
  applied, lab rerun identical.
- **Decisions:** B3 split rather than clamp; fixes made by the hand that wrote each part; the corpus baseline is
  rewritten in an approval step, not as a side effect.

### P1.4 i18n & small app bugs
- **Changed:** Arabic table word and date locale via `K.i18n`; 9 hard-coded strings moved, 9 unused keys removed;
  `tools/check-i18n.js` (missing / unused / placeholder / non-literal keys, comments skipped) in `tooling.yml`;
  `scripts/boot.js` sets `lang` / `dir` / theme before first paint (also for old profiles).
- **Acceptance:** met — check-i18n 0 / 0 / 0 / 0; Arabic UI screenshot review (`docs/reports/P1.4/`).
- **Review:** 6 low (checker blind spots, placeholder message, inherited names, unknown theme, old profiles, tests)
  — all applied.
- **CI:** `tooling` 41507555350, `pdf-lab` 41507555352 green.

### P2.1 RTL fuzz corpus
- **Changed:** `make-fuzz.js` generator 4 — `fa-article`, `fa-report`, `ar-article`, new `fa-mixed`; `dir`, RTL fonts
  (Vazirmatn, Sahel, Noto Naskh Arabic; `unicode-range` so `latinFont` applies), `digits` (`ascii` / `native` /
  `asis`), `tracking`; per-direction and `rtl` means printed, stored and gated.
- **Acceptance:** met — 100 + 100 PDFs, **44 % RTL**; baseline built on the CI runner (run 41507779260): **dev 86.0,
  held-out 86.9**; LTR 93.0 / 91.9, RTL 77.1 / 80.6 (generator 3 kept in the report: 96.0 / 94.6).
- **Review:** 3 medium (RTL means not stored, `latinFont` without effect, plan target), 5 low — all applied.
- **Decisions:** only the fuzz part of the candidate committed; `fonts-noto-core` not pinned (version could not be
  fixed reliably) — its file hash is in the env instead.

### P2.2 Metamorphic net extended
- **Changed:** 24 seeds (six RTL added) × **20 transforms** (`fontSubst`, `letterSpace`, `pageSize`, `hfInject`,
  `rotate180`, `cropbox`, `renderMode`, `stamp` added; rotations as turned content set upright by `/Rotate`);
  "same" transforms asserted byte-identical in `run-meta.js` with a per-file `KNOWN` list carrying floors;
  reference-free relations; gate versioned per transform; qpdf pinned (`11.9.0-1.1build1`).
- **Acceptance:** ≥ 20 transforms ✅; per-transform deltas listed ✅; **"all same exact" not met for 7 transforms**
  (133 / 199 files exact, 66 listed with floors) — the causes are importer findings for P3.3, above all **`/Rotate`
  not applied** (−82 / −83). Baseline from the CI runner (run 41509321814).
- **Review:** 3 medium (exceptions without floors, rotations that could not fail, silent make failures), 5 low — all
  applied.

### P2.3 Builders in CI, DOCX validation, goldens
- **Changed:** `tests/docx-validate.js` (package, 1,328 parts against ECMA-376 Transitional with xmllint,
  pictures decodable, LibreOffice one process per file); golden snapshots of five outputs (HTML, DOCX XML, DOC,
  PDF → MD, DOCX → MD) for 73 cases with `--update` (all or nothing; shared sections hashed); 13 MarkdownImporter
  tests; new workflow `builders.yml`. Found and fixed: the horizontal-rule token leaking from `.docx` imports,
  MathCore's duplicate `m:strikeBLTR`.
- **Acceptance:** met — job `builders` green (41521254320), a golden diff fails it. LibreOffice 24.2.7 on Linux
  aborts on the two ToC documents (schema-valid; Windows converts them): listed in `SOFFICE_KNOWN` with the reason.
- **Review:** 3 medium (a damaged picture passed, the importer change touched all table cells, CI unproven),
  9 low — all applied; two CI rounds (LibreOffice per file; right-to-left formula widths that Linux measures
  differently, normalised in the goldens).

### P2.4 Site quality jobs
- **Changed:** `site.yml` — `links` (lychee 0.24.2, SHA-256 checked; offline on push, online weekly), `freshness`
  (three generated files), `a11y` (axe-core 4.14.0, fa / en / ar × light / dark, dialogs; fails on page errors, wrong
  lang / dir / theme, an unrendered preview), `size` (startup budget); 71 serious / critical a11y findings fixed in
  the preview, BidiView's empty link.
- **Acceptance:** met, with one figure above the plan: startup size **1,985,290 bytes, budget 1,990,000**, not ≤
  1.93 MB (the app grew by P1.1–P2.4; P5.1 lowers it). ESLint stays in `tooling.yml` (not duplicated).
- **Review:** 1 high (links red on the golden snapshots — fixed), 2 medium (a11y check could pass on a broken page;
  loose-list checkboxes), 5 low — all applied; allow-list now empty.
- **CI:** `site` 41521263215 green (first run 41510527318 red at `links` only).

### Workload (Change History) and the owner's time

Measured with `node .claude/scripts/workload.mjs` (rules in ContributeLog → "How Workload is calculated"); every
row's figure is in `docs/ContributeLog.md`, 1405-08-11 / 1405-08-12. Totals for this batch (minutes):

| Contributor | Minutes |
|---|---|
| Lead session (all sub-phases: briefs, integration, merges, log, CI) | ≈ 135 |
| P1.2 implementation + review | 14 + 7 |
| P1.3 four parts (shaping 28, tables 29, cleanups 7, bisect 22) + review 15 | 101 |
| P1.4 implementation + review | 26 + 30 |
| P2.1 implementation + review | 29 + 10 |
| P2.2 implementation + review | 52 + 8 |
| P2.3 implementation (incl. two CI rounds) + review | 106 + 13 |
| P2.4 two parts (links / freshness 33, a11y / size 48) + review 9 | 90 |
| **Owner (proposed)** | **3** |

**The owner's time — proposed 3 min, derivation (rules 12–15):** only the time Claude waited for the owner counts,
capped at 15 min per interval, minus any part during which agent or background work was running.
1. Writing the P1.2–P2.4 instructions (21:34:38 → 21:37:34, before the session started): 2.9 min → **3**
   (recorded 1405-08-11 as "Approving P1.1 and instructions for P1.2–P2.4").
2. "continue please" after the usage limit: the wait was a usage limit, not a question or a hand-over → **0**.
3. "merge all branches…" and "add the end-of-P2 report to the prompt": sent while agents were working (the whole
   interval overlapped AI work) → **0**.

Recorded as proposed; the owner corrects any figure they disagree with (rule 15, the owner's instruction).

---

## Part C — Open items

**Owner items (questions to settle):**
1. **Delete the merged branches?** `redesign/P1.1` … `redesign/P2.4` (eight branches) are merged and still exist on
   GitHub and locally. The original instruction was to delete them after confirmation; the confirmation said
   "merge" only, so they were kept. Say "delete" to remove them.
2. Rename the repository to **Kelk**.
3. A GitHub check for the "`<Contributor>: `" commit prefix on pull requests.
4. The **5 moderate npm advisories** (minimatch inside ESLint 10, dev only).
5. Lint warnings: `lib/pdfimport/blocks.js` `pagesLinks` assigned but never used in `_toHtml` (now line 1251; links
   possibly lost in the HTML output — an importer change, P3); `scripts/ui.js:287` `shown` was fixed in P1.4
   (107 warnings remain, 0 errors).
6. `package.json` `engines` (`^20.19 || ^22.13 || >=24`) versus jsdom's Node range (22.22.2+ / 24.15+ / 26+).
7. Startup size budget 1,990,000 bytes above the plan's 1.93 MB (P2.4 decision; P5.1 lowers it).
8. Workload figures above, the owner's 3 min included, for confirmation or correction.

**Technical items carried into P3+ (all in `docs/ContributeLog.md` → Known Issues):**
- 🟠 The importer does not apply `/Rotate` (meta −82 / −83) — P3.3 first.
- 🟡 RTL fuzz files score well below English ones (RTL 77 / 81 vs LTR 93 / 92); `letter-spacing: loose` −15.
- 🟡 Persian digits sharing a glyph with Arabic-Indic come back as Arabic-Indic.
- 🟡 Watermark letters read into the text; point-sized thresholds under scaling; `/ActualText` in object streams;
  doubled letters under an invisible copy; text outside the CropBox on one-page files.
- 🟡 An inline `style` can overlay the preview pane (no script runs).
- ⚪ Eight Arabic letters without a glyph in any bundled PDF font; LibreOffice 24.2.7 (Linux) aborting on the ToC
  documents; DocxBuilder drops page breaks; `.docx` internal links come back as `#bm_<id>`; skills' READMEs with
  15 dead links; `builders.yml` apt pins need a bump when Ubuntu supersedes them; wkhtmltopdf and `unicode-range`
  unverified.
- The corpus part of `baseline.json` waits for a full `gate.js --update` (P1.3's gains).
