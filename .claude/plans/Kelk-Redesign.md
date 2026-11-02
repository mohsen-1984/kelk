# Kelk 2.0 → 2.x Redesign Plan

**Creator:** Zarrabi · **Created:** 1405-08-09
**Summary:** Structural changes, not a rewrite: the rule-based PDF importer and its lab are the asset, and the weaknesses found in the review are fixable in place, each step gated by the lab. 8 phases / 31 sub-phases, ≈ 76 working days plus the owner's review — **P0** stabilise and commit · **P1** verified bugs · **P2** test-net completeness · **P3** importer structure, calibration, degradation · **P4** generalisation with real producers and golden-50 · **P5** app and libraries · **P6** optional ML second opinion · **P7** OCR for scans · **P8** release and docs. P0.1 Git hygiene approved 1405-08-10 (LF everywhere, lab PDFs kept as ordinary `binary` files). P0.2 approved 1405-08-10 (gate guarded, 144-file corpus baseline; fuzz and meta kept until P0.3 rebuilds them in CI). P0.3 approved 1405-08-10 (CI green and a deliberate ZWNJ break turns it red); its last step done 1405-08-11: the fuzz and meta parts of `baseline.json` rebuilt on the CI runner (manual run 41391608314 with `baseline` ticked; Chromium 141, wkhtmltopdf 0.12.6, qpdf 11.9.0; corpus unchanged), so CI's fallback path compares fuzz too. P0.4 approved 1405-08-11 (`package.json` + lockfile with exact pins, ESLint 0 errors, Prettier configured without reformatting, `tools/check-version.js` — one source `K.config.version` — and lint in CI `tooling.yml`, green runs 41421784781 / 41421784696). P0.1–P0.4 merged into `main` 1405-08-11 (PRs #3–#6, merge commits; `main` at `cbacc0a`). P1.1 Storage & export correctness approved 1405-08-11 and merged into `main` (PR #7, merge commit `fc2fd52`; profile stored as differences with `schemaVersion` and one `migrate()`, `K.preview.flush()` before every export, a `storage` listener for two tabs, first unit tests in `tests/unit/`; `main` green after the merge: tooling 41494645319, pdf-lab 41494645572, Pages 41494644682). **P1.2–P2.4** run next as one stacked batch (branches `redesign/P1.2` → … → `redesign/P2.4`, one PR each), reported together at the end of P2. Progress tracker: §5.

*Master plan, `.claude/plans/Kelk-Redesign.md`. Dates are Solar Hijri `YYYY-MM-DD`.
Written 1405-08-09 (2026-10-31) from a full review of the 2.0-rc1 tree; raw corpus scores of that day:
[`docs/reports/corpus-run-1405-08-09.json`](../../docs/reports/corpus-run-1405-08-09.json).*

**Status: accepted by the project owner on 1405-08-09; execution started — P0.0, P0.1, P0.2 and P0.3 approved 1405-08-10, P0.4 and P1.1 approved 1405-08-11.** Work continues on another machine —
everything needed to resume is in this file. Nothing in the repository has been changed by the review.

---

## 1. Context

Kelk is a client-side (file://-capable, no build step) Markdown ⇄ DOCX/DOC/PDF/HTML converter with Persian/Arabic-first
bidi and a fa/en/ar interface. 2.0-rc1 adds **PDF import**: ≈10,400 lines in `lib/PdfImporter.js` +
`lib/pdfimport/{extract,lines,regions,order,blocks}.js`, a 155 KB design document (`lib/PDFIMPORT.md`) and a test lab
(`tests/pdf-lab/`: 144 PDFs from 49 producer variants, style-fuzz dev/held-out splits, a metamorphic net, a gate with
`baseline.json`, a CI workflow). At review time the whole 2.0 tree was **uncommitted** and the CI workflow had never run.

The owner asked for (a) a review of the PDF import against three concepts — self-calibration, metamorphic testing,
graceful degradation — plus the generalisation gap / held-out question and the observed Persian regressions; (b) a
whole-project redesign plan in phases and sub-phases, **each sub-phase ending with a report and the owner's explicit
approval**; (c) a progress tracker; (d) researched feature proposals; (e) the plan saved in the project.

Decisions taken by the owner during planning:

| Question | Decision |
|---|---|
| In-browser ML layout model | **Yes, optional download** — rules stay the default; model fetched/cached only when enabled |
| OCR for scanned PDFs | **Yes, as a late phase** (P7) |
| Tooling | **Dev tooling only** (package.json, ESLint/Prettier, unit tests, CI); the shipped site stays plain scripts loadable from `file://` |
| Plan file | **One English file**: `.claude/plans/Kelk-Redesign.md` |
| Start | Plan accepted; **execution deferred** until the owner says go |

---

## 2. Findings

### 2.1 PDF import — the three concepts and the generalisation gap

1. **The held-out set has no Persian.** `tests/pdf-lab/scripts/make-fuzz.js:24` `DOCS = ['article','features','readme','report','symbols']` — five English documents; producers Chromium 3 : wkhtmltopdf 1. "dev 96.0 / held-out 94.6" measures *style* generalisation of English Chromium output only. It says nothing about Persian, Word, LibreOffice, Prince, PowerPoint.
2. **The local gate is blind.** `tests/pdf-lab/baseline.json` `corpus` holds **2 of 144** files (`kelk--math`, `kelk--fa-math`). `gate.js:87` iterates `Object.keys(base.corpus)`, so 142 files only produce a "new file" note; `--update` has no guard against a filtered run (`run-import.js math` + `--update` is the likely cause). CI (`--against base`) would catch regressions, but CI never ran. **This is how Persian regressions slipped through.** Confirmed live on 1405-08-09: the gate printed 144 "new file" notes and "passed".
3. **The metamorphic net exists and is good** (`make-meta.js`: 12 transforms × 18 seeds, 5 RTL; docs mis-state 15/171 — actual 18/205). It already proves brittleness the corpus cannot: tz85 −11.4, trackLoose −16.3, trackTight −4.8, objstm −1.0, noToUnicode −85. The design doc admits "the word-space rules are absolute".
4. **Self-calibration is partial.** Document-level: body size = mode of long-line sizes; column edges = 3rd/97th percentiles; per-font median space width; per-line bimodal gap split (`lineWordGap`, `lines.js` ≈241); leading = median line step. But a rough count gives ≈390 size-relative thresholds vs ≈400 bare literals (incl. absolute pt: 6 pt, 12 pt, 1.1 em fixed…). There is no threshold registry, no record of which rules fired, no confidence value.
5. **Graceful degradation**: `r.quality` (flags `lostGlyphs`, `suspectSpaces`, `textInPictures`) *measures but never repairs* (PDFIMPORT.md §2d). Page isolation, `pageFailed`, abort exist. No fallback path (simplified layout → plain text → OCR). Diagnostics reach the user as ≤ 4 transient toasts (`scripts/importer.js:167-175`).
6. **Code shape**: six files; `_pageBlocks` 910 lines (order.js), `_lines` 607 (lines.js), `_extractPage` 523 (extract.js), `_joinAcrossPages` 376 (blocks.js), `_xyCut` 286, `_groupLines` 266. Rules are inline closures whose comments name the producer that motivated them — valuable knowledge, hard to audit.
7. **Real files**: < 100 private user PDFs, each pattern rebuilt glyph-by-glyph in `pdf/producers/` (risk: fitting the imitation, not the producer). The lab has **no real Word / Excel / PowerPoint / Microsoft Print to PDF output**. No public Persian PDF→Markdown corpus exists (research: *Persian Pixel* = OCR images only; *KITAB-Bench* = Arabic).
8. **Corpus run, 1405-08-09, this reviewer's Windows machine** (Playwright Chromium, 144 PDFs, 0 crashes, ≈15 s):
   - Mean total **95.7** (114 files ≥ 99, 19 files < 90) — reproduces the CHANGELOG's figure.
   - RTL files (55): mean total **90.1**, `rtl` column 92.9.
   - Weakest producers: `lohtml-rtl` 59.0, `wk-rtl` 61.2, `chrome-rtl-plain-hf` 81.4, `kelkdocx-lo` 88.7 (its fa/ar files 55–96).
   - RTL failure modes: `brackets` **0** in every LibreOffice-path RTL file (mirrored brackets — TODO already suspects Vazirmatn's RTL bracket glyphs outside the cmap), lists 0–28 and tables 0–42 there; wkhtmltopdf `zwnj` 0 and `yehKaf` 53–68 (broken ToUnicode in the PDF itself); Chrome browser-default style loses `quote` (0) and `code` in fa/ar while the text is perfect (`chrome-rtl-plain-hf--ar-article` 69.6 with `rtl` 100 — a layout loss, not a text loss).
   - **Regression-shaped pattern:** `fa-features` scores **quote 0 on all four producers** (Kelk, Chrome plain, Chrome GitHub-style, Chrome tagged), each at 85 ± 1. Same document, same metric, every producer → the quote rule drops Persian nested quotes regardless of producer. TODO.md lists "Kelk's own: fa-features 85 (its quotes)" as Kelk-only; the data says it is not. **First thing to bisect in P1.**
   - Full per-file table: Appendix A; raw JSON: `docs/reports/corpus-run-1405-08-09.json`.

### 2.2 Application layer (`scripts/`, `index.html`, `styles/`)

- **high** Settings migrations run against fresh/reset profiles: the one-shot markers (`_auto`, `_vch`, `_vz`, `_auto2`, `_hfauto`, `_lh`) are not in the defaults, so a user's deliberate choices get "migrated" on the next reload (`scripts/storage.js:54-114`, `config.js:36-66`); the stored profile is the full merge of defaults (freezes old defaults); `settings.js:188-193` duplicates part of the migration.
- **high** Exports read stale preview HTML: render is debounced 250 ms, `exporter.js:173` reads `K.preview.html()` immediately (`editor.js:120`).
- **high** Preview DOMPurify config keeps `id`/`style`/`form`/`input` → Markdown such as `<div id="toasts">` hijacks app elements and `<style>` restyles the app (`preview.js:18,159`; `ui.js:46,284`); custom header/footer HTML is never sanitised (`exporter.js:109-116`); no CSP.
- **high** ≈1.93 MB JS/CSS parsed at startup, 1.44 MB unminified `lib/` including import/export code only needed on use (`index.html:564-581`; `K.libs.need` covers vendor libraries only).
- med: pdf.js fake worker on the main thread (`config.js:134`); builders synchronous (Cancel cannot interrupt, `exporter.js:172-189`); images as base64 in localStorage (≈5 MB quota, `images.js:38-46`); no `storage` event (two tabs clobber each other); every render redoes marked + DOMPurify + hljs + MathJax (`preview.js:147-195`), startup renders 3–4×; Clear is unrecoverable (`main.js:200-206`); `<html lang="fa" dir="rtl">` hard-coded → wrong-language flash; Tab trap in the editor (WCAG 2.1.2, `editor.js:142-146`); stats `aria-live` chatter (`index.html:111`); Arabic UI gets Persian "جدول" and Persian dates (`importer.js:20,146`, `exporter.js:114`); ≈10 hard-coded English strings; 9 unused i18n keys; `vendor/lucide.min_1.48.0.js` (444 KB) and a duplicate hljs CSS shipped unused.
- Missing: PWA manifest/service worker, print CSS, find/replace, snapshots/recovery, export presets, reorder before multi-file join, outline navigation, auto theme.
- Longest functions: `main.start` ≈210 lines, `settings.init` 138.

### 2.3 Builder libraries (`lib/`)

- Bugs: **B1** Arabic shaping table maps U+0649 initial/medial to U+0488/0489 (Cyrillic marks) instead of FBE8/FBE9 (`PdfBuilder.js:293`); **B2** PDF tables ignore rowspan when assigning columns (`:2551-2577`) while `_tableStyleGrid` honours it → lines and text disagree; B3 a row taller than a page overflows (`:1710, 2676`); **B4** `HtmlBuilder.toHtml` parses into a live element, `on*` attributes pass through (`HtmlBuilder.js:478-493`); B5 the builder suite never loads dejavu-sans-mono → three cases pass on a fallback (`tests/builder-suite.html:48-52`); B6 two divergent `NAMED_COLORS` maps; B7 blob URL revoked right after `click()` (Docx/Word); B8 dead data-URI regexp branch (`MarkdownImporter.js:673`).
- **No shared intermediate model**: four builders each re-parse and walk the HTML (≈8,050 LOC renderers vs 2,485 shared). ≈150 LOC of helpers copied verbatim (`PdfBuilder.js:415-463` ≈ `DocxBuilder.js:308-358`), `cssSafe` ×4, `_hljsPalette` ×2 (regex-parse their own CSS), `_pagingLabels` ×4, `_resolveImages` copied into `WordHtmlBuilder.js:2111`; ≈1,400 LOC of parallel per-feature code (code block ≈450, quote ≈420, ToC ≈180). Table width: PDF measures with real fonts, the others use a character-count heuristic — the README's "same shares in every output" is approximate. `resolveTableWidth` defaults (98 % / 20 %) ≠ `SHARED_DEFAULTS` (auto / 50 %).
- PdfBuilder: heuristic bidi (not a full UBA), own shaping table with gaps (U+0620, 063B–063F, 066E/F, 06D5, 06FA–FC), fully synchronous, layout runs twice with a ToC, `cutWord` quadratic, every font added to every document, formula SVG rasterised at 3× though vectors are drawn, **`kelk:source` never written** (lossless Kelk→Kelk round trip is still a TODO), jsPDF private internals used.
- DocxBuilder walks docx.js 9.7.1 internals inside silent try/catch (`markNormalDefault:380`, `markSectionRtl:396`, ToC field runs; `run.root[0] =` at `:946` unguarded); `markSectionRtl` runs on detected RTL only, not on forced `setDirection('rtl')`. WordHtmlBuilder: post-serialisation string replaces, hard-coded `file:///C:/document`, dead non-browser path.
- MathCore converter solid; render cache unbounded; RTL `\text` embeds ≈148 KB of font per formula. MarkdownImporter: own zip reader (JSZip vendored but unused), `HR_TOKEN` leaks as text inside cells/lists, per-instance `_preMath` state, mammoth style map tied to Kelk's own style names.
- Tests: DOCX/DOC "pass" whenever a blob is produced; no XML validation, no golden files; MarkdownImporter essentially untested; builders not in CI; ≈11 empty `catch` blocks; `hasMix` declared twice (`BidiCore.js:109, 692`); stale doc comments (legacy setters documented but gone, `DocxBuilder.js:136`).

### 2.4 Infrastructure, release, docs

- Sizes: tree 50.6 MB (runtime ≈31.8, dev-only ≈18.8); `vendor/` 16.75 MB (MathJax 11.17, of which 9.5 MB dynamic newcm font files; pdf.js 3.44); `lib/` 11.33 MB (PDF fonts 9.77, noto-emoji alone 4.98); `tests/pdf-lab/pdf` 15.57 MB / 144 PDFs; `.git` pack 17.35 MiB, 11 commits all "Add files via upload"; the v1.5 zip (15.35 MB) is the whole folder incl. tests/tools.
- **high** Release zip made by hand, no include list → a 2.0 zip would carry `tests/pdf-lab` (16 MB) and `.github/`.
- **high** README links `kelk_2.0.zip` under `releases/latest` → 404 (latest is v1.5; a prerelease is skipped by `latest`).
- **high** CI never ran; `.github/` untracked; base/head steps end in `> /dev/null || true` (`pdf-lab.yml:53-64`) so every failure is hidden.
- **high** `baseline.json` environment (Chromium 153, Bitstream Type1 `.pfb` fonts) can never match CI (Playwright 1.56.1 = Chromium 141; no pfb package in apt) → the fuzz comparison is always skipped on the no-base path.
- **high** 144 binary PDFs about to enter git history (`lfs: false` in the workflow).
- med: version strings in ≈8 places disagree (`2.0-rc1` / `2.0` / `1.0`); git remote `AliZarrabi/kelk` vs docs `mohsen-1984/kelk`; Pages = Jekyll branch deploy of the whole repo, no `.nojekyll`, no cache-busting on `lib/`, `scripts/`, `styles/` (max-age 600); no package.json / lockfile / eslint / prettier / editorconfig / `.gitattributes` (autocrlf warnings; a CRLF corpus `.md` would shift scores); harness Linux-only (`'/opt/npm-tools/node_modules'`, `'file://' + path` ×30, `fc-match`, hard-coded `/usr/share/fonts`, `/` splits in `features.js`); `tests/pdf-lab/real/` not gitignored (private PDFs could be committed); `run-real.js` ignores `LAB_OUT`; not in CI: builder suite, `math-roundtrip.js` (never sets an exit code), struct/features/run-crash, lint, link check, a11y, bundle size, generated-files freshness, Pages deploy, release zip; no `permissions:` / `concurrency:` / SHA-pinned actions / cache.
- Docs: `PDFIMPORT.md` has no TOC, the lab is described in four places, stale numbers ("106 PDFs", "27 producers" vs 31, Noto Emoji version "—", hljs theme 11.11.1 vs JS 11.12.0); no CONTRIBUTING / ARCHITECTURE / SECURITY / RELEASING; README's three languages out of step; `tools/bidi-lab.html` holds a verbatim copy of BidiCore/BidiView kept in sync by hand.
- Supply chain: vendor pinned by filename only (`6.4.299` repeated ×8, the marked filename ×14); no checksums / SBOM / Dependabot; no CSP (cheap to add: zero inline scripts or handlers); DOMPurify present and used.
- Private data: none found in the lab PDFs (creators are the generators'; emails `example.org`).

### 2.5 Landscape (web research, Oct 2026)

PDF→Markdown leaders are ML pipelines: MinerU 2.5 / PaddleOCR-VL (vision-language, GPU, OmniDocBench ≈ 90–96), Marker (pipeline, GPL), Docling (IBM, MIT: RT-DETR layout model + TableFormer), pymupdf4llm / pdfplumber (heuristic peers of Kelk — e.g. pdf_oxide's adaptive gutter = 4 × the 25th-percentile gap). Browser-feasible ML: YOLOv10-DocLayNet ONNX via Transformers.js / onnxruntime-web (tens of MB); PaddleOCR.js (Arabic models exist); tesseract.js `fas` best-data. Benchmarks: OmniDocBench (edit distance + TEDS), DocLayNet; KITAB-Bench (Arabic); Persian has only OCR image datasets (Persian Pixel, SUT). Metamorphic testing of document parsers: 2026 arXiv audits and the `wobbly` package (reference-free relations). **Kelk's niche — offline browser, RTL-first, editable Word output, a lab with a metamorphic net — has no direct competitor; its rule-based core is comparable to pymupdf4llm but far better instrumented.**

Sources: [Marker/Docling/MinerU comparison](https://themenonlab.blog/blog/best-open-source-pdf-to-markdown-tools-2026) · [independent 9-tool benchmark](https://github.com/pdfmarkdownapp/pdf-to-markdown-benchmark) · [OmniDocBench (CVPR 2025)](https://arxiv.org/abs/2412.07626v2) · [DocLayNet](https://arxiv.org/pdf/2206.01062) · [PaddleOCR-VL](https://arxiv.org/pdf/2510.14528) · [MinerU 2.5](https://arxiv.org/pdf/2509.22186) · [Docling technical report](https://arxiv.org/html/2501.17887v1) · [YOLOv10-DocLayNet ONNX](https://huggingface.co/Oblix/yolov10m-doclaynet_ONNX_document-layout-analysis) · [PaddleOCR.js browser deployment](https://www.paddleocr.ai/latest/en/version3.x/deployment/browser.html) · [ppu-paddle-ocr (Arabic models)](https://cdn.jsdelivr.net/npm/ppu-paddle-ocr@5.1.1/README.md) · [Persian Pixel OCR dataset](https://huggingface.co/papers/2607.20385) · [KITAB-Bench](https://www.alphaxiv.org/benchmarks/mbzuai/kitab-bench) · [parser structural-vulnerability audit](https://arxiv.org/pdf/2605.19309) · [format-robustness metamorphic study](https://arxiv.org/pdf/2607.27648) · [wobbly](https://pypi.org/project/wobbly/) · [pdf_oxide reading-order heuristics](https://pdf.oxide.fyi/docs/guides/reading-order)

---

## 3. Recommendation: structural changes, not a rewrite

The asset is ≈10k lines of producer knowledge encoded as traceable geometric rules plus a seven-net lab that no rewrite could reproduce without re-learning the same anecdotes; corpus 95.7 (97–100 for English), held-out 94.6. The verified weaknesses — blind gate, English-only held-out, ≈400 bare literals, 900-line functions, measure-only quality, release hygiene — are all fixable in place, each step gated by the lab (`cmp.js` byte-identical for refactors; dev ↑ and held-out not ↓ for rule changes). A rewrite would discard the knowledge and the tests' calibration to it.

---

## 4. Process rules (every sub-phase)

- Before a sub-phase starts: a TodoWrite checklist, one item per action, each marked done as it finishes.
- Branch `redesign/P<n>.<m>`; `main` is touched only by the merge after approval. Report in `docs/reports/P<n>.<m>-<slug>.md`: what changed; lab before/after (corpus mean, dev, held-out, meta per transform, `rtl`); open issues. **Stop until the owner approves in writing.** Merge to `main` on approval; update the tracker (§5).
- Every importer change runs `run-import.js`, `run-fuzz.js dev|heldout`, `run-meta.js`, then `gate.js`; held-out is read as means only (`--show` never used); `gate.js --update` only in the approval step.
- A Change History row in [`docs/ContributeLog.md`](../../docs/ContributeLog.md) at each approval (project workload rules).

---

## 5. Progress tracker

Status: `todo` → `doing` → `report` (report written, waiting) → `approved` | `blocked (reason)`.

| Phase | Sub-phase | Status | Started | Finished | Lab after (corpus / dev / held-out / rtl) | Approval |
|---|---|---|---|---|---|---|
| — | Review & plan | approved | 1405-08-09 | 1405-08-09 | 95.7 / 96.0 / 94.6 / 92.9 (baseline) | ☑ owner, 1405-08-09 |
| P0 | P0.0 Plan files into project | approved | 1405-08-09 | 1405-08-10 | — (no code change) | ☑ owner, 1405-08-10 |
| P0 | P0.1 Git hygiene | approved | 1405-08-10 | 1405-08-10 | 95.7 / — / — / 92.9 (corpus only; no importer change) | ☑ owner, 1405-08-10 |
| P0 | P0.2 Baseline rebuilt, gate guarded | approved | 1405-08-10 | 1405-08-10 | 95.7 / 95.8* / 93.9* / 92.9 (*Windows, no wkhtmltopdf: not comparable; baseline keeps 96.0 / 94.6) | ☑ owner, 1405-08-10 |
| P0 | P0.3 CI first green run | approved | 1405-08-10 | 1405-08-10 | 95.7 / 96.0 / 94.6 / 92.9 (CI runner; fuzz and meta of `baseline.json` rebuilt on the runner 1405-08-11, run 41391608314) | ☑ owner, 1405-08-10 |
| P0 | P0.4 Dev tooling, single version | approved | 1405-08-11 | 1405-08-11 | 95.7 / 96.0 / 94.6 / 92.9 (CI 41421784696, no importer change; lint 0 errors, 24 version checks agree) | ☑ owner, 1405-08-11 |
| P1 | P1.1 Storage & export correctness | approved | 1405-08-11 | 1405-08-11 | — (no `lib/` change; unit tests 23 / 23, lint 0 errors) — [`docs/reports/P1.1-storage-export.md`](../../docs/reports/P1.1-storage-export.md); merged as PR #7 (`fc2fd52`) | ☑ owner, 1405-08-11 |
| P1 | P1.2 Security hardening | report | 1405-08-11 | 1405-08-11 | — (no importer change; unit tests 28 / 28, lint 0 errors, builder suite unchanged) — [`docs/reports/P1.2-security.md`](../../docs/reports/P1.2-security.md) | ☐ |
| P1 | P1.3 Builder bugs B1–B8 | report | 1405-08-11 | 1405-08-11 | 96.2 / 95.8* / 93.9* / 92.9 (*local Windows, +0.0 against the base; corpus 95.7 → 96.2 by the five fa quote files) — [`docs/reports/P1.3-builder-bugs.md`](../../docs/reports/P1.3-builder-bugs.md) | ☐ |
| P1 | P1.4 i18n & small app bugs | report | 1405-08-11 | 1405-08-11 | — (no `lib/` change; check-i18n 0 / 0, unit tests 60 / 60 on the stack) — [`docs/reports/P1.4-i18n.md`](../../docs/reports/P1.4-i18n.md) | ☐ |
| P2 | P2.1 RTL fuzz corpus | report | 1405-08-11 | 1405-08-11 | — / 86.0 / 86.9 / — (generator 4, 44 % RTL, CI run 41507779260; generator 3 was 96.0 / 94.6, English only) — [`docs/reports/P2.1-rtl-fuzz.md`](../../docs/reports/P2.1-rtl-fuzz.md) | ☐ |
| P2 | P2.2 Metamorphic net extended | report | 1405-08-11 | 1405-08-11 | meta: 20 transforms × 24 seeds, 133 / 199 "same" exact, 66 listed with floors (CI run 41509321814; `rotate90` / `rotate180` −82 / −83: `/Rotate` not applied) — [`docs/reports/P2.2-meta-net.md`](../../docs/reports/P2.2-meta-net.md) | ☐ |
| P2 | P2.3 Builders in CI, DOCX validation, goldens | todo | | | | ☐ |
| P2 | P2.4 Site quality jobs | todo | | | | ☐ |
| P3 | P3.1 Split long functions | todo | | | | ☐ |
| P3 | P3.2 Calibration, threshold registry, telemetry | todo | | | | ☐ |
| P3 | P3.3 Literal migration (metamorphic order) | todo | | | | ☐ |
| P3 | P3.4 Confidence & fallback ladder | todo | | | | ☐ |
| P3 | P3.5 Import report UI | todo | | | | ☐ |
| P4 | P4.1 Real-producer Persian corpus | todo | | | | ☐ |
| P4 | P4.2 Golden-50 | todo | | | | ☐ |
| P4 | P4.3 Held-out protocol & rotation | todo | | | | ☐ |
| P5 | P5.1 Lazy-load builders/importer | todo | | | | ☐ |
| P5 | P5.2 Shared DomUtil, seed of an IR | todo | | | | ☐ |
| P5 | P5.3 IndexedDB + recovery snapshots | todo | | | | ☐ |
| P5 | P5.4 PWA, print, theme, a11y, find/replace | todo | | | | ☐ |
| P5 | P5.5 kelk:source lossless round trip | todo | | | | ☐ |
| P6 | P6.1 ML runtime on demand | todo | | | | ☐ |
| P6 | P6.2 ML vote integration | todo | | | | ☐ |
| P7 | P7.1 OCR runtime | todo | | | | ☐ |
| P7 | P7.2 OCR in report & ladder | todo | | | | ☐ |
| P8 | P8.1 Release script & Pages deploy | todo | | | | ☐ |
| P8 | P8.2 Docs split & project docs | todo | | | | ☐ |
| P8 | P8.3 Vendor manifest & supply chain | todo | | | | ☐ |
| P8 | P8.4 CHANGELOG 2.0 final & tag | todo | | | | ☐ |

**Merge note, 1405-08-11:** the stacked P0 branches merged into `main`, one pull request each with a merge commit:
P0.1 [PR #3](https://github.com/mohsen-1984/kelk/pull/3) (`0cd3945`), P0.2 [PR #4](https://github.com/mohsen-1984/kelk/pull/4) (`538130b`), P0.3 [PR #5](https://github.com/mohsen-1984/kelk/pull/5) (`527865e`), P0.4 [PR #6](https://github.com/mohsen-1984/kelk/pull/6) (`cbacc0a`, `main`'s head after the merges). Each PR's checks were green before its merge (pdf-lab 41452472229, 41453184728, 41453948942, 41454969643; tooling 41454969155); `main` after the last merge: tooling 41455923159 green, pdf-lab 41455922949 green, head against the base: corpus 95.7 → 95.7, fuzz dev 96.0 and held-out 94.6 +0.0, meta equal. The branches `redesign/P0.0-setup` … `P0.4` were deleted afterwards.

**Merge note, 1405-08-11 (P1.1):** [PR #7](https://github.com/mohsen-1984/kelk/pull/7) (`redesign/P1.1` → `main`) merged with merge commit `fc2fd52` after its green checks (tooling 41471461805, pdf-lab 41471461751); `main` after the merge: tooling 41494645319, pdf-lab 41494645572 and Pages 41494644682 green. The branch `redesign/P1.1` is kept until the end of P2 and deleted with the P1.2–P2.4 branches.

---

## 6. Phases

Effort figures are working days and include the report; the owner's review time is extra. Dependencies: P0 → everything; P2.1–2.2 before P3.3 (the migration order comes from the extended net); P3.4 before P3.5, P6.2, P7; P2.3 goldens before P5.2; P4.1 can run in parallel with P3; P6/P7 are optional and deferrable; P8.1 last. Total ≈ 76 days, 8 phases / 31 sub-phases.

### P0 — Stabilise and commit (≈ 4 d)

**P0.0 Plan file into the project** — write this file; README pointer; Change History row. *Accept:* files exist; tracker row approved. ½ d. → report & approval.

**P0.1 Git hygiene** — `.gitattributes` (`* text=auto eol=lf`; `*.pdf *.zip *.woff* *.png *.docx *.xlsx *.pptx binary`), `.gitignore` (+ `tests/pdf-lab/real/`, `private/`, `node_modules/`), `.editorconfig`; lab PDFs (15.6 MB): **decided 1405-08-10 — kept as ordinary files marked `binary`** (already in history, never changed since; LFS or a release asset would not shrink history; revisit past 50 MB or heavy churn — `docs/reports/P0.1-git-hygiene.md` §5); commit the 2.0 tree on branch `redesign/2.0` (already done: the 2.0 tree reached `main` through PR #1, merged 1405-08-10). *Accept:* clean `git status`; `git ls-files | grep real/` empty; a fresh clone runs `run-import.js`. 1 d. → report & approval.

**P0.2 Baseline rebuilt, gate guarded** — `gate.js --update` refuses when the corpus count < `labPdfs().length` unless `--partial`; full run → `baseline.json` with all 144 files + `rtl` per file; gate `rtl` per file (TOL 0.5) like total. *Accept:* `Object.keys(base.corpus).length === 144`; disabling the ZWNJ rule locally fails the gate. ½ d. → report & approval.

**P0.3 CI first green run** — remove `> /dev/null || true` (`pdf-lab.yml:53-64`), `set -o pipefail`, `tee` logs to the artifact; `permissions: contents: read`, `concurrency`, SHA-pinned actions, npm cache; rebuild the fuzz and meta parts of `baseline.json` in the CI environment (P0.2 kept the review machine's, Chromium 153); `make-meta.js` skips the qpdf transforms with a note instead of crashing, `make-fuzz.js` prints a wkhtmltopdf substitution; add `roundtrip.js`, `math-roundtrip.js` (set `process.exitCode`), `run-crash.js` smoke; Windows-friendly harness: `fileUrl()` on `url.pathToFileURL` in `env.js` replacing `'file://' + path` ×30, `NODE_TOOLS` via `require.resolve`, `fc-match` optional, `path.sep`-safe splits in `features.js`. *Accept:* green run on the branch, artifact uploaded, a deliberate rule break turns red. 1½ d. → report & approval. *Done 1405-08-10:* green run 41333786984; the two-line ZWNJ break failed at the gate only (run 41333855809, 40 failures); *done 1405-08-11:* the fuzz and meta parts of `baseline.json` rebuilt on the CI runner — manual run 41391608314 with `baseline` ticked, its `baseline-candidate` artifact committed (corpus identical, 144 files; fuzz env Chromium 141.0.7390.37 + wkhtmltopdf 0.12.6, meta env qpdf 11.9.0) — `docs/reports/P0.3-ci-green.md` §5.

**P0.4 Dev tooling and single version** — `package.json` (devDependencies: playwright pinned to the version CI uses, pdf-lib, eslint, prettier, the DOCX validator of P2.3), `package-lock.json`; `eslint.config.js` (script globals `Kelk`, `PdfImporter`, …), `.prettierrc`; `VERSION` single source in `scripts/config.js`; `tools/check-version.js` in CI. *Accept:* `npm run lint` 0 errors; one version string. 1 d. → report & approval. *Done 1405-08-11:* lint 0 errors (109 warnings), 24 version checks against `K.config.version`, CI `tooling.yml` green (41421784781) and the lab on `npm ci` green (41421784696) — `docs/reports/P0.4-dev-tooling.md`.

### P1 — Fix verified bugs (≈ 6 d)

**P1.1 Storage & export correctness** — `schemaVersion` in defaults, store only diffs, one `migrate(profile)` used by `storage.js:54-114`, `config.js:36-66`, `settings.js:188-193`; `K.preview.flush()` (cancels the 250 ms debounce) before `exporter.js:173` reads HTML; `storage` event listener for two-tab sync. *Accept:* unit tests (`tests/unit/`, Node + jsdom): a fresh profile has no migration side effects; an export after a keystroke contains it. 1½ d. → report & approval.

**P1.2 Security hardening** — DOMPurify `SANITIZE_NAMED_PROPS: true`, `FORBID_TAGS: ['form','input','button','textarea','select','style']` (`preview.js:18`); sanitise header/footer HTML (`exporter.js:109-116`); `HtmlBuilder.toHtml` via `BidiCore.inertRoot` + strip `on*`/`javascript:`; `<meta http-equiv="Content-Security-Policy">` (`script-src 'self'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: blob:`, `worker-src 'self' blob:`) tested on `file://` and Pages with MathJax and pdf.js; `rel="noopener noreferrer"` on every `target=_blank`. *Accept:* a hostile Markdown test (`<div id="toasts">`, `<style>`, `<img onerror>`) leaves the app intact; all exports work. 1½ d. → report & approval.

**P1.3 Builder bugs B1–B8** — U+0649 → FBE8/FBE9 and the shaping gaps; rowspan column assignment reusing `_tableStyleGrid` occupancy; row taller than a page split or clamped with a note; load dejavu-sans-mono in the suite; one `NAMED_COLORS` in `BuilderBase`; delayed blob revoke; dead regexp; `hasMix` duplicate. **Also bisect the `fa-features` quote-0 pattern** (§2.1 finding 8) with `md.js` on a copy of the importer, rule by rule. *Accept:* 383 suite cases + new rowspan / U+0649 round-trip cases pass; `fa-features` quote ≥ 90 on all four producers or a documented reason. 2½ d. → report & approval.

**P1.4 i18n & small app bugs** — Arabic table/date words via `K.i18n` (`importer.js:20,146`, `exporter.js:114`, `dateLocale` by language); the ≈10 hard-coded strings; `tools/check-i18n.js` (missing/unused keys) in CI; `lang` / `dir` / theme bootstrap before first paint (`scripts/boot.js`, allowed by CSP). *Accept:* check-i18n 0/0; Arabic UI screenshot review. 1 d. → report & approval.

### P2 — Test-net completeness (≈ 7 d)

**P2.1 RTL fuzz corpus** — `make-fuzz.js` `DOCS` += `fa-article`, `fa-report`, `ar-article`, a new `fa-mixed` (Persian with English terms, numbers, brackets — the `rtl` column's targets); dimensions `dir` (rtl for fa/ar), RTL body fonts (Vazirmatn, Sahel, Noto Naskh Arabic), `digits` (ASCII / Persian), `tracking` (CSS `letter-spacing` — a real-producer replacement for the synthetic Tc/Tz guards); `GENERATOR = 4`; `run-fuzz.js` prints the `rtl` column and per-`dir` means. *Accept:* 100 + 100 PDFs redrawn, ≥ 40 % RTL; new baseline recorded (generator 3 numbers kept in the report); CI runs it. 2 d. → report & approval.

**P2.2 Metamorphic net extended** — `SEEDS` += 6 RTL (word-print memo, pptx-rtl, prince-shapes-fa, itext circular, acrobat booklet, chrome-fa-links); `TRANSFORMS` += `fontSubst`, `letterSpace` (generator-side CSS), `pageSize` (A4 → Letter reflow, "near"), `hfInject` (pdf-lib stamp, "same" after furniture), `rotate180`, `cropbox` ("same"), `renderMode` (Tr 3 invisible layer, "same"), `stamp` (watermark, "near"); "same" transforms become a byte-identical Markdown assertion gated in `run-meta.js`; reference-free relations (word multiset equal under "same", heading count monotone under `untag`, block count ± 1 under "near"). *Accept:* ≥ 20 transforms; all "same" exact; per-transform deltas listed (they are P3.3's priority order). 2 d. → report & approval.

**P2.3 Builders in CI, DOCX validation, goldens** — `tests/docx-validate.js` (JSZip + OOXML XSD via `xmllint` **and** LibreOffice headless `--convert-to pdf` → non-empty); golden Markdown/HTML snapshots in `tests/golden/` with `--update`; MarkdownImporter unit tests (HR_TOKEN inside cells/lists, zip reader, mammoth map); corpus cases for rowspan, `#links`, images, custom header/footer, `setToc`, page breaks. *Accept:* CI job `builders` green; a golden diff fails the job. 2 d. → report & approval.

**P2.4 Site quality jobs** — `site.yml`: eslint; `lychee` link check on `*.md` and `index.html`; axe-core on `index.html` (fa/en/ar) via Playwright; `tools/check-size.js` startup budget (≤ current 1.93 MB, lowered in P5.1); generated-files freshness (`assets/icons.js`, `docs/about-kelk-and-samples.js`, `tests/pdf-lab/corpus.js` regenerated + `git diff --exit-code`). *Accept:* all green; budget file committed. 1 d. → report & approval.

### P3 — Importer structure, calibration, degradation (≈ 18 d — the core)

**P3.1 Split the long functions along the documented pipeline** — `order.js::_pageBlocks` (910) → `_pbRows`, `_pbFloats`, `_pbColumns`, `_pbTablesBorderless`, `_pbOrder`; `lines.js::_lines` (607) → `_visualLines`, `_segments` (hosts `lineWordGap`, `letterGap`, `bulletLead`, `mixedLine`), `_logicalOrder`; `extract.js::_extractPage` (523) → `_opGlyphs`, `_opPaths`, `_opImages`, `_unicodeRepair`; `blocks.js::_joinAcrossPages` (376) → `_joinParagraphs`, `_joinTables`, `_joinLists`; then `_xyCut`, `_groupLines`. Extract with explicit parameter objects, never shared mutable locals; one function per step, `run-import.js` + `cmp.js` → zero Markdown diffs. `lib/pdfimport/README.md` function map; lint `max-lines-per-function: 150` in `pdfimport/`. *Accept:* `cmp.js` 0 changed files for corpus and fuzz dev; meta "same" count unchanged. 5 d. → report & approval.

**P3.2 Calibration object, threshold registry, rule telemetry** —
- `lib/pdfimport/calibration.js`: `_calibrate(doc)` after extraction → frozen `Calibration`
  `{ body: {size, leading, font}, fonts: {[name]: {spaceW, letterGap, xHeight, hasSpaceGlyph}}, gaps: {wordEm, letterEm, bimodal}, steps: {leading, paraGap}, columns: {edges, gutter}, tracking: {tz, tc}, regions: {[page]: overrides} }` passed as `pl.cal` to every stage (`_layout` in `regions.js` already builds `pl`).
- `lib/pdfimport/thresholds.js`: registry `T = { wordGapEm: {def: 0.45, unit: 'em', calib: c => c.gaps.wordEm, minSamples, used: [...]}, checkboxMinPt: {def: 6.5, unit: 'pt', fixed: true}, … }`; access via `this._t('wordGapEm', pl)`; `?debug` dumps resolved values to `r.calibration`.
- Telemetry: `this._fire('ruleName', page)` → `r.rules`; `tests/pdf-lab/scripts/rules.js` prints fired/dead rules per PDF (`out/_rules.json`), gated as a note when a rule that fired on a corpus file stops firing.
- Defaults = the current literals → lab byte-identical in this step.
*Accept:* `cmp.js` 0 diffs; `r.calibration`, `r.rules` present; ≥ 60 thresholds registered. 4 d. → report & approval.

**P3.3 Literal migration in metamorphic order** — (1) word-space rules (`lines._segments` 0.45 em page rule; `lineWordGap` 0.04 / 0.1 / 0.07 / 1.2) → `cal.gaps` with tracking correction (`tz`, `tc`) — the tz85 / trackLoose / trackTight losses; (2) leading and paragraph-gap literals in `blocks.js` / `order.js` → `cal.steps`; (3) heading-size thresholds → `cal.body.size`; (4) absolute pt → em of `cal.body.size` where the drawing is text-relative, kept fixed where it is physical (checkbox 6.5 pt). Each batch runs the whole lab + meta; accepted only if dev ↑ or =, held-out not ↓, the transform ↑, corpus per file within the gate; `minSamples` fallback to defaults on short documents. *Accept:* tz85 / trackTight / trackLoose each ≥ −2 (from −11 / −5 / −16); objstm ActualText read; ≥ 200 of ≈ 400 literals registered; held-out ≥ its generator-4 baseline (P2.1; 94.6 was the generator-3, English-only figure and is no longer comparable); RTL fuzz ≥ its P2.1 baseline. 5 d. → report & approval.

**P3.4 Confidence and fallback ladder** — `b.conf` per block (0–1 from telemetry, `_treeVote` agreement, calibration sample size, `_pageQuality` flags, segment ambiguity); `pl.conf` per page; ladder in `regions.js::_layout`: `full` → `simplified` (headings/paragraphs only; tables, lists, quotes off) when `pl.conf < T.pageConfSimplified` or `suspectSpaces` + `lostGlyphs` → `textContent` (pdf.js `getTextContent()`, bidi via BidiCore, paragraphs by y-gap) when `lost ≥ 20 %` → `ocr` hook (P7; until then a note + page image). `opts.mode: 'auto' | 'safe' | 'full'` (`safe` = simplified for every page — the UI's "safe mode"); `r.pages[i].{mode, conf}`, structured `r.report`. Lab PDFs that must demote: `make-ocr.js` output, a glued-spaces Type 3 file. *Accept:* all 144 corpus pages stay `full`; `run-stress.js` injected faults yield `simplified` / `textContent` instead of `pageFailed` where possible; `safe` mode on the corpus ≥ 70 words / order. 3 d. → report & approval.

**P3.5 Import report UI** — replace the toasts of `scripts/importer.js:167-175` with `K.ui.report(r.report)`: a dismissible panel (`#import-report`) listing per-page mode / confidence, flags with page lists, notes (`printNoLinks`, `ocrLayer`, `pageFailed`), buttons "Re-import in safe mode" and "Copy report"; fa/en/ar; `role="region"`, focus management, no `aria-live` spam. *Accept:* every `r.notes` code has a row; axe passes; RTL layout checked. 1½ d. → report & approval.

### P4 — Generalisation (≈ 8 d incl. owner time)

**P4.1 Real-producer Persian corpus from the owner's Windows machine** — author 8 own CC0 documents (Persian memo, mixed fa/en report with tables, Arabic letter, Excel sheet with and without borders, PowerPoint deck, English readme) in `tests/pdf-lab/corpus/real-src/`; print each through Word "Save as PDF", Microsoft Print to PDF, Edge, Chrome, Firefox, Excel export, PowerPoint export, LibreOffice (≈ 40 PDFs → `pdf/real-producers/`); `features.js` fills the thin cells; `profile.js` producer table += Word 365, MS Print to PDF, Edge; closes TODO's "Producers still to test". *Accept:* ≥ 35 new PDFs scored; coverage matrix has no empty cell for {Word, Excel, PowerPoint} × {rtl, ltr}; baseline updated. 3 d (1 owner day). → report & approval.

**P4.2 Golden-50** — 20 fa / 10 ar / 20 en PDFs across producer families; `tests/pdf-lab/golden/<name>.md` written by hand from the page (never from the importer's output); `scripts/golden.js` (score.js + a structure diff: heading tree, table shapes, list nesting) → `out/golden/_scores.json`; gate −0.5 per golden file. *Accept:* 50 goldens gated; the 10 worst listed with cause. 3 d (owner checks the Persian ones). → report & approval.

**P4.3 Held-out protocol with rotation** — `docs/HELDOUT.md`: held-out seeds rotate every 6 months or whenever a held-out file was opened (`run-fuzz.js heldout --show` logs to `out/heldout-opened.log`, checked in every report); `make-fuzz.js` held-out base bumps by 100000 at rotation; the P4.1 real producers split 70/30 by document (the 30 % never opened, means only); `snapshot.js` on private real files with `--against` as a third, reference-free guard. *Accept:* protocol documented; real held-out mean gated (TOL 1). 1 d. → report & approval.

### P5 — App and libraries (≈ 12 d)

**P5.1 Lazy-load builders and importer** — `scripts/config.js` `libs` += `pdfBuilder`, `docxBuilder`, `wordHtmlBuilder`, `htmlBuilder`, `pdfImporter` (+ `lib/pdfimport/*.js`, PDF fonts), `mathCore`; `await K.libs.need(...)` in `exporter.js` / `importer.js`; `index.html:564-581` trimmed; drop lucide and the duplicate hljs CSS; pdf.js as a real Worker when not `file://` (`config.js:134`). *Accept:* startup JS ≤ 0.6 MB (`check-size.js`); every import/export works from `file://` and Pages; builder suite green. 2 d. → report & approval.

**P5.2 Shared DomUtil, seed of an intermediate model** — `lib/DomUtil.js` (`textNodes`, `normalizeWhitespace`, `trimEdges`, `isInlineNode`, `hasContent`, `splitOnBr`, `wrapInline`, `cssSafe`, `pagingLabels`, `resolveImages`, `hljsPalette`) used by all four builders; unify `resolveTableWidth` defaults with `SHARED_DEFAULTS`; `BuilderBase.walkBlocks(html, visitor)` iterator used first by code-block and quote rendering. Scope stop: no output change — the P2.3 goldens prove it. *Accept:* golden diff 0; ≥ 800 LOC removed from `lib/`; suite green. 3 d. → report & approval.

**P5.3 IndexedDB and recovery snapshots** — content and images as Blobs in IndexedDB (`images.js:38-46` base64 → Blob), settings stay in localStorage; `K.storage.snapshot()` ring of 20 autosaves (on import, before Clear, every 5 min when dirty) with a "Restore" list in Settings; migration from localStorage on first run via `schemaVersion`. *Accept:* unit tests; 20 MB of images import without a quota error; Clear → Restore returns the text. 2 d. → report & approval.

**P5.4 PWA, print CSS, auto theme, a11y, find/replace** — `manifest.webmanifest`, `sw.js` (cache-first, versioned precache list generated by the release script; registered on http(s) only); `styles/print.css`; `prefers-color-scheme` auto theme; Tab-trap fix (`editor.js:142-146`: Esc releases, Ctrl+M toggles indent-with-Tab); stats `aria-live` removed with a manual announce; `scripts/find.js` find/replace bar (regex option, RTL-safe highlighting via `BidiView`). *Accept:* Lighthouse "installable"; axe 0 serious; find/replace unit tests. 3 d. → report & approval.

**P5.5 kelk:source lossless round trip** — `PdfBuilder` writes XMP `kelk:source` (deflate + base64, plus `kelk:version`) and an attached `source.md`; `PdfImporter` step 0 already reads both; option "embed source" default on; 2 MB cap. *Accept:* `roundtrip.js` byte-identical on all 383 cases. 1½ d. → report & approval.

### P6 — Optional ML second opinion (≈ 8 d)

**P6.1 Model runtime on demand** — `config.js` `libs.onnx` (onnxruntime-web WASM ≈ 10 MB) + `yolov10-doclaynet` ONNX (≈ 20–40 MB) as `libs.layoutModel`, fetched from a release asset with a hash check (vendor manifest, P8.3), cached in Cache Storage; Settings toggle "layout model (download N MB)"; `lib/pdfimport/ml.js` renders each page with pdf.js at 1024 px, runs the model, returns boxes `{class, conf}`. *Accept:* works on http(s); on `file://` the toggle explains why it is unavailable; import time per page measured. 3 d. → report & approval.

**P6.2 Vote integration and measurement** — `_mlVote(lines)` beside `_treeVote` in `blocks.js`, the same trust pattern (`r.profile.ml.trust` from agreement with the geometry on each page); used for headings / tables / figures only where `b.conf < 0.6`; `run-import.js --ml` lab mode (onnxruntime-node) → `out/ml/_scores.json`. *Accept:* the lab with `--ml` ≥ the lab without on every column including `rtl`, else the feature stays off by default (restrict to tables / figures if RTL is poor — DocLayNet is Latin-heavy); per-class precision on golden-50 in the report. 5 d. → report & approval.

### P7 — OCR for scans (≈ 7 d)

**P7.1 OCR runtime** — tesseract.js `fas` / `ara` / `eng` best-data as on-demand downloads with hashes (PaddleOCR.js Arabic model evaluated as an alternative in the report); `lib/pdfimport/ocr.js` renders the page, recognises, returns words with boxes → fed to `extract.js` as glyph records (`ocr: true`) so lines / regions / blocks run unchanged; triggered by `noText`, the P3.4 ladder, or the user. *Accept:* `make-ocr.js` lab set (corpus pages fa/en/ar at 200 / 300 dpi, 2° skew) words ≥ 85 en, ≥ 70 fa; never runs when a text layer exists unless asked. 4 d. → report & approval.

**P7.2 OCR in the report and ladder** — report rows "page N recognised (conf 0.82)"; list of low-confidence words; option to keep the page image beside the text. *Accept:* fa/ar UI review; a11y. 1½ d. → report & approval.

### P8 — Release and docs (≈ 6 d)

**P8.1 Release script and Pages deploy** — `tools/build-release.js`: explicit include list (no `tests/`, `.github/`, dev `tools/`, lucide; MathJax newcm pruned to the ranges used ≈ −7 MB), version stamping, `?v=<hash>` cache-busting on `lib/` / `scripts/` / `styles/`, `.nojekyll`, SHA-256 of the zip; Pages via Actions (`upload-pages-artifact` / `deploy-pages`) with only the release set; README links → `releases/tag/v2.0`. *Accept:* zip ≤ 12 MB; Pages serves hashed assets; links resolve. 2 d. → report & approval.

**P8.2 Docs split and project docs** — `lib/PDFIMPORT.md` → `docs/pdfimport/00-overview.md … 12-ideas.md` with a generated TOC (`tools/build-docs-toc.js`), numbers refreshed from `features.js` / `profile.js` output; `CONTRIBUTING.md` (how to run the lab, the held-out rule, the approval process), `ARCHITECTURE.md` (app vs `lib/` vs vendor, load order, lazy loading), `SECURITY.md`, `RELEASING.md`; README fa/en/ar aligned; `tools/bidi-lab.html` loads `lib/BidiCore.js` instead of a copy; `tools/check-docs.js` for stale numbers. *Accept:* link check green; stale-number check green. 2 d. → report & approval.

**P8.3 Vendor manifest and supply chain** — `vendor/manifest.json` (name, version, sha256, licence, source URL), `tools/check-vendor.js` in CI (hash mismatch fails; newer npm versions reported); hljs JS/CSS versions aligned; Dependabot for devDependencies; CycloneDX SBOM in the release. *Accept:* CI fails on a hash mismatch. 1 d. → report & approval.

**P8.4 CHANGELOG 2.0 final and tag** — final lab table (corpus, dev, held-out, RTL fuzz, meta, golden-50, real held-out); `v2.0.0` tag; zip attached; tracker closed. ½ d. → report & approval.

---

## 7. New features (purpose → method → phase)

| Feature | Purpose | Method | Phase |
|---|---|---|---|
| Import report panel | persistent per-page diagnostics instead of four transient toasts | structured `r.report` → `K.ui.report` panel | P3.5 |
| Safe-mode import | predictable paragraph-only output on hard files | `opts.mode: 'safe'` → ladder rung `simplified` | P3.4 |
| Self-calibrating thresholds | fewer brittle literals; debuggable | `Calibration` object + threshold registry + `r.calibration` | P3.2–3.3 |
| Rule telemetry | see which rules fired; find dead rules | `_fire()` → `r.rules`, `scripts/rules.js` | P3.2 |
| Recovery snapshots | Clear or a crash never loses text | IndexedDB ring of 20 autosaves + Restore list | P5.3 |
| PWA offline install | one-click install; offline on Pages | manifest + service worker with versioned precache | P5.4 |
| Find/replace | editor basics | `scripts/find.js`, RTL-safe highlighting | P5.4 |
| kelk:source round trip | lossless Kelk → PDF → Kelk | XMP `kelk:source` + attached `source.md` | P5.5 |
| ML second opinion (optional) | catch headings/tables the geometry misses | DocLayNet ONNX vote via `_mlVote`, on-demand download | P6 |
| OCR for scans (optional) | read scanned PDFs | tesseract.js fas/ara/eng on demand | P7 |

Infrastructure items that behave like features: settings schema versioning (P1.1), DOCX validation in CI (P2.3), vendor manifest with hashes (P8.3).

---

## 8. Critical files

- Importer: `lib/pdfimport/lines.js` (`lineWordGap` ≈ 241 — first literals to calibrate; `_lines` split), `regions.js` (`_layout` driver; `_pageQuality` ≈ 227 — where Calibration and the ladder hook in), `blocks.js` (`_treeVote` ≈ 148 — trust pattern reused for confidence and `_mlVote`; `_joinAcrossPages`), `order.js` (`_pageBlocks`, `_xyCut`), `lib/PdfImporter.js` (`fromArrayBuffer`, `_pageQuality`, `_qualityNotes`).
- Lab: `tests/pdf-lab/scripts/gate.js`, `make-fuzz.js` (`DOCS` :24, `GENERATOR` :22), `make-meta.js` (`SEEDS` :16), `env.js`, `score.js`, `snapshot.js`, `features.js`, `baseline.json`.
- App: `scripts/config.js` (`libs` :129, `VERSION`), `storage.js`, `exporter.js`, `preview.js`, `importer.js`, `editor.js`, `index.html`.
- Libraries: `lib/PdfBuilder.js`, `DocxBuilder.js`, `HtmlBuilder.js`, `WordHtmlBuilder.js`, `BuilderBase.js`, `BidiCore.js`.
- Infra: `.github/workflows/pdf-lab.yml` (+ new `site.yml`, `release.yml`), `tools/build-release.js` (new), `package.json` (new).

## 9. Verification (end to end)

- Importer: `node tests/pdf-lab/scripts/run-import.js && run-fuzz.js dev && run-fuzz.js heldout && run-meta.js && gate.js` — gate passes; refactors prove 0 diffs with `cmp.js`; the Persian `rtl` column never below baseline.
- Builders: `roundtrip.js`, `math-roundtrip.js`, `docx-validate.js`, golden snapshots in CI.
- App: unit tests (storage, find), axe, Lighthouse PWA, bundle budget, manual fa/en/ar review from `file://` and Pages.
- Release: the zip from `build-release.js` opened offline; README links resolve; `check-version.js` green.

## 10. Running the lab on Windows (notes from the review machine)

- The repo has no `package.json`; `env.js` falls back to a Linux path for `NODE_TOOLS`. Install Playwright in a folder outside the repo and point `NODE_TOOLS` at its `node_modules`; send results outside the repo with `LAB_OUT`. (Since P0.4, 1405-08-11: `package.json` exists and `npm ci` at the root is enough; `NODE_TOOLS` stays an option.)
- `npx playwright install` resolved a *different* Playwright than the one installed and twice stalled at 0 MB; what worked: install `playwright@latest`, then make directory junctions so the build number it asks for maps to the complete build already on disk (`mklink /J chromium_headless_shell-<wanted> chromium_headless_shell-<present>`, same for `chromium-<wanted>`). P0.3 removes the need for this by fixing `env.js` and adding `package.json`.
- Never run `gate.js --update` after a filtered run (P0.2 adds the guard).

---

## Appendix A — Corpus run, 1405-08-09 (144 files; columns as `run-import.js` prints them, `-` = not applicable)

| file | words | order | head | list | tabl | code | quote | total | rtl | lnk |
|---|---|---|---|---|---|---|---|---|---|---|
| acrobat-word--booklet-fa | 100.0 | 100.0 | 100.0 | - | 100.0 | 100.0 | - | 100.0 | 100.0 | - |
| calc--orders | 86.0 | 86.0 | - | - | 86.0 | 100.0 | - | 89.5 | - | - |
| calc--survey | 100.0 | 100.0 | - | - | 100.0 | 100.0 | - | 100.0 | - | - |
| calc--xl-border-black | 100.0 | 100.0 | - | - | 100.0 | 100.0 | - | 100.0 | - | - |
| calc--xl-border-none | 100.0 | 100.0 | - | - | 100.0 | 100.0 | - | 100.0 | - | - |
| calc--xl-border-white | 100.0 | 100.0 | - | - | 100.0 | 100.0 | - | 100.0 | - | - |
| calc--xl-long | 100.0 | 100.0 | - | - | 100.0 | 100.0 | - | 100.0 | - | - |
| calc--xl-multi | 100.0 | 100.0 | - | - | 100.0 | 100.0 | - | 100.0 | - | - |
| calc--xl-plain | 100.0 | 100.0 | - | - | 100.0 | 100.0 | - | 100.0 | - | - |
| calc--xl-sales | 100.0 | 100.0 | 100.0 | - | 100.0 | 100.0 | - | 100.0 | - | - |
| calc--xl-wide | 100.0 | 100.0 | - | - | 100.0 | 100.0 | - | 100.0 | - | - |
| chrome-blog-bg--article | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 |
| chrome-blog-bg--features | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 |
| chrome-blog-bg--readme | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | - |
| chrome-blog-bg--report | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | - |
| chrome-blog-bg--symbols | 100.0 | 100.0 | 100.0 | - | - | 100.0 | - | 100.0 | - | - |
| chrome-card--receipt | 100.0 | 100.0 | 100.0 | - | 100.0 | 100.0 | - | 100.0 | 100.0 | - |
| chrome-fa-links--fa-links | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | 100.0 | 100.0 | 100.0 |
| chrome-float-tagged--infobox | 100.0 | 100.0 | 100.0 | - | 100.0 | 100.0 | - | 100.0 | - | 100.0 |
| chrome-form--form-fa | 100.0 | 99.0 | 100.0 | 95.7 | 100.0 | 100.0 | - | 99.1 | 100.0 | 100.0 |
| chrome-form--form | 100.0 | 98.9 | 100.0 | 95.7 | 100.0 | 100.0 | - | 99.1 | - | 100.0 |
| chrome-github-bg--article | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 |
| chrome-github-bg--features | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 |
| chrome-github-bg--readme | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | - |
| chrome-github-bg--report | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | - |
| chrome-github-bg--symbols | 100.0 | 100.0 | 100.0 | - | - | 100.0 | - | 100.0 | - | - |
| chrome-github-nobg-hf--article | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 |
| chrome-github-nobg-hf--features | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 |
| chrome-github-nobg-hf--readme | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | - |
| chrome-github-nobg-hf--report | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | - |
| chrome-github-nobg-hf--symbols | 100.0 | 100.0 | 100.0 | - | - | 100.0 | - | 100.0 | - | - |
| chrome-headtable--fa-report | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | 100.0 | - |
| chrome-headtable--report | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | - |
| chrome-layers--banner | 100.0 | 100.0 | 100.0 | - | - | 100.0 | - | 100.0 | - | 100.0 |
| chrome-layers--overlay | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | 100.0 | - | - |
| chrome-layout--layout-columns | 100.0 | 100.0 | 100.0 | - | - | 100.0 | - | 100.0 | - | - |
| chrome-layout--layout-figure | 100.0 | 96.1 | 100.0 | - | - | 100.0 | - | 99.0 | - | - |
| chrome-layout--layout-sidebar | 100.0 | 100.0 | 100.0 | - | - | 100.0 | - | 100.0 | - | - |
| chrome-letterhead--letter-ltr | 100.0 | 100.0 | - | - | - | 100.0 | - | 100.0 | - | - |
| chrome-mono--monobody | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | 100.0 | - | - |
| chrome-pictures--brochure | 100.0 | 100.0 | 100.0 | - | - | 100.0 | - | 100.0 | - | - |
| chrome-pictures--inline-fa | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | 100.0 | 100.0 | - |
| chrome-pictures--inline | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | 100.0 | - | - |
| chrome-pictures--slides-fa | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | 100.0 | 100.0 | - |
| chrome-pictures--slides | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | 100.0 | - | - |
| chrome-plain-hf--article | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 |
| chrome-plain-hf--features | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 |
| chrome-plain-hf--readme | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | - |
| chrome-plain-hf--report | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | - |
| chrome-plain-hf--symbols | 100.0 | 100.0 | 100.0 | - | - | 100.0 | - | 100.0 | - | - |
| chrome-positioned--positioned | 100.0 | 100.0 | 100.0 | - | - | 100.0 | - | 100.0 | 100.0 | - |
| chrome-rtl-github-bg--ar-article | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 |
| chrome-rtl-github-bg--fa-article | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 |
| chrome-rtl-github-bg--fa-features | 100.0 | 100.0 | 92.3 | 100.0 | 100.0 | 100.0 | **0.0** | 84.6 | 100.0 | 0.0 |
| chrome-rtl-github-bg--fa-report | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | 100.0 | - |
| chrome-rtl-plain-hf--ar-article | 100.0 | 100.0 | 100.0 | 87.5 | **0.0** | 100.0 | **0.0** | 69.6 | 100.0 | 100.0 |
| chrome-rtl-plain-hf--fa-article | 99.5 | 99.0 | 100.0 | 100.0 | 100.0 | **0.0** | **0.0** | 71.2 | 100.0 | 100.0 |
| chrome-rtl-plain-hf--fa-features | 100.0 | 100.0 | 92.3 | 100.0 | 100.0 | 100.0 | **0.0** | 84.6 | 100.0 | 0.0 |
| chrome-rtl-plain-hf--fa-report | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | 100.0 | - |
| chrome-rtl-tagged--ar-article | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 |
| chrome-rtl-tagged--fa-article | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 |
| chrome-rtl-tagged--fa-features | 100.0 | 97.1 | 100.0 | 100.0 | 100.0 | 100.0 | **0.0** | 85.3 | 100.0 | 0.0 |
| chrome-rtl-tagged--fa-report | 99.8 | 99.8 | 88.9 | 100.0 | 100.0 | 100.0 | - | 98.1 | 99.8 | - |
| chrome-rtl-varfont--fa-weights | 100.0 | 100.0 | 100.0 | - | - | 100.0 | - | 100.0 | 100.0 | - |
| chrome-tagged--article | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 |
| chrome-tagged--features | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 |
| chrome-tagged--readme | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | - |
| chrome-tagged--report | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | - |
| chrome-tagged--symbols | 100.0 | 100.0 | 100.0 | - | - | 100.0 | - | 100.0 | - | - |
| chrome-template--template | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | - |
| chrome-web-rtl--web-rtl | 100.0 | 100.0 | 100.0 | - | 100.0 | 100.0 | - | 100.0 | 100.0 | - |
| impress--deck | 100.0 | 100.0 | 100.0 | 85.7 | 100.0 | 100.0 | - | 97.6 | - | - |
| itext-word--circular-fa | 100.0 | 100.0 | 100.0 | - | - | 100.0 | - | 100.0 | 100.0 | - |
| kelk--ar-article | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 |
| kelk--article | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 |
| kelk--fa-article | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 75.0 | 100.0 | 96.4 | 100.0 | 100.0 |
| kelk--fa-features | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | **0.0** | 85.7 | 100.0 | 66.7 |
| kelk--fa-math | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | 100.0 | 100.0 | - |
| kelk--fa-report | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | 100.0 | - |
| kelk--features | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 |
| kelk--math | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | - |
| kelk--readme | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | - |
| kelk--report | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | - |
| kelk--symbols | 99.7 | 99.7 | 100.0 | - | - | 100.0 | - | 99.8 | - | - |
| kelkdocx-lo--ar-article | 78.2 | 78.2 | 80.0 | 15.4 | 36.8 | 100.0 | 0.0 | 55.5 | 58.7 | 0.0 |
| kelkdocx-lo--article | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 |
| kelkdocx-lo--fa-article | 98.5 | 97.9 | 100.0 | 80.0 | 95.0 | 100.0 | 100.0 | 95.9 | 74.4 | 100.0 |
| kelkdocx-lo--fa-features | 96.8 | 93.6 | 100.0 | 27.6 | 42.4 | 100.0 | 0.0 | 65.8 | 72.5 | 66.7 |
| kelkdocx-lo--fa-report | 99.0 | 98.6 | 100.0 | 0.0 | 92.6 | 100.0 | - | 81.7 | 73.3 | - |
| kelkdocx-lo--features | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 |
| kelkdocx-lo--readme | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | - |
| kelkdocx-lo--report | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | - |
| kelkdocx-lo--symbols | 98.4 | 98.4 | 100.0 | - | - | 100.0 | - | 99.2 | - | - |
| lohtml--article | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 |
| lohtml--features | 98.5 | 98.5 | 100.0 | 62.5 | 100.0 | 100.0 | 100.0 | 94.2 | - | 100.0 |
| lohtml--readme | 99.2 | 99.2 | 100.0 | 71.4 | 100.0 | 100.0 | - | 95.0 | - | - |
| lohtml--report | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | - |
| lohtml--symbols | 99.7 | 99.7 | 100.0 | - | - | 100.0 | - | 99.8 | - | - |
| lohtml-rtl--ar-article | 77.1 | 76.6 | 100.0 | 0.0 | 2.9 | 100.0 | 0.0 | 51.0 | 57.7 | 0.0 |
| lohtml-rtl--fa-article | 99.0 | 99.0 | 100.0 | 0.0 | 0.0 | 75.0 | 0.0 | 53.3 | 73.3 | 100.0 |
| lohtml-rtl--fa-features | 95.0 | 95.0 | 100.0 | 0.0 | 93.3 | 100.0 | 0.0 | 69.0 | 73.6 | 66.7 |
| lohtml-rtl--fa-report | 93.9 | 93.0 | 88.9 | 0.0 | 1.6 | 100.0 | - | 62.9 | 71.8 | - |
| lowriter--merged | 100.0 | 100.0 | - | - | 100.0 | 100.0 | - | 100.0 | 100.0 | - |
| lowriter--word-rich | 96.9 | 96.9 | 100.0 | - | 100.0 | 100.0 | - | 98.8 | - | - |
| lowriter--word-tables | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | - |
| ocr-tesseract--article | 97.3 | 97.3 | 100.0 | 100.0 | 70.0 | 71.4 | 100.0 | 90.8 | - | 0.0 |
| ocr-tesseract--features | 99.3 | 99.3 | 100.0 | 100.0 | 95.0 | 100.0 | 100.0 | 99.1 | - | 100.0 |
| ocr-tesseract--report | 97.5 | 97.5 | 100.0 | 100.0 | 54.2 | 100.0 | - | 91.5 | - | - |
| pandoc-lo--article | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 |
| pandoc-lo--features | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 0.0 | 85.7 | - | 100.0 |
| pandoc-lo--readme | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | - |
| pandoc-lo--report | 98.7 | 98.7 | 100.0 | 100.0 | 97.5 | 100.0 | - | 99.1 | - | - |
| pandoc-lo--symbols | 98.1 | 98.1 | 100.0 | - | - | 100.0 | - | 99.1 | - | - |
| pdflib-book--book-front | 100.0 | 100.0 | 100.0 | - | - | 100.0 | - | 100.0 | - | - |
| pptx-arial--deck-arial | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | 100.0 | 100.0 | - |
| pptx-rtl--slides-rtl | 100.0 | 100.0 | 100.0 | - | - | 100.0 | - | 100.0 | 100.0 | - |
| prince-letter--letter-dash | 100.0 | 100.0 | - | 100.0 | - | 100.0 | - | 100.0 | 100.0 | - |
| prince-letter--prince-table | 100.0 | 100.0 | - | - | 100.0 | 100.0 | - | 100.0 | 100.0 | - |
| prince-shapes--shapes-fa | 100.0 | 100.0 | - | - | - | 100.0 | - | 100.0 | 100.0 | - |
| wk-github--article | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 |
| wk-github--features | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 0.0 |
| wk-github--readme | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | - |
| wk-github--report | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | - |
| wk-github--symbols | 92.4 | 92.4 | 100.0 | - | - | 100.0 | - | 96.2 | - | - |
| wk-pictures--brochure | 100.0 | 100.0 | 100.0 | - | - | 100.0 | - | 100.0 | - | - |
| wk-pictures--inline | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | 100.0 | - | - |
| wk-plain-hf--article | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 |
| wk-plain-hf--features | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 0.0 |
| wk-plain-hf--readme | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | - |
| wk-plain-hf--report | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | - |
| wk-plain-hf--symbols | 92.4 | 92.4 | 100.0 | - | - | 100.0 | - | 96.2 | - | - |
| wk-rtl--ar-article | 85.1 | 85.1 | 40.0 | 37.5 | 93.8 | 100.0 | 0.0 | 63.1 | 78.9 | 0.0 |
| wk-rtl--fa-article | 71.5 | 71.3 | 28.6 | 11.8 | 85.0 | 100.0 | 0.0 | 52.6 | 54.7 | 0.0 |
| wk-rtl--fa-features | 74.3 | 73.9 | 42.9 | 33.3 | 80.0 | 100.0 | 0.0 | 57.8 | 53.8 | 0.0 |
| wk-rtl--fa-report | 88.7 | 88.7 | 60.0 | 0.0 | 90.5 | 100.0 | - | 71.3 | 66.8 | - |
| word-cells--cells-fa | 100.0 | 100.0 | 100.0 | - | 100.0 | 100.0 | - | 100.0 | 100.0 | - |
| word-flyer--flyer-fa | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | - | 100.0 | 100.0 | - |
| word-memo--memo-fa | 100.0 | 100.0 | - | 100.0 | - | 100.0 | - | 100.0 | 100.0 | - |
| word-plan--plan-box-fa | 100.0 | 100.0 | - | - | - | 100.0 | - | 100.0 | 100.0 | - |
| word-plan--plan-fa | 100.0 | 100.0 | 100.0 | - | - | 100.0 | - | 100.0 | 100.0 | - |
| word-print--word-rtl | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | - | 100.0 | 100.0 | - |
| word-report--report-fa | 100.0 | 100.0 | 100.0 | - | - | 100.0 | - | 100.0 | 100.0 | - |
| word-sides--sides-fa | 100.0 | 100.0 | 100.0 | - | 100.0 | 100.0 | - | 100.0 | 100.0 | - |
| word365-report--report-fa | 100.0 | 100.0 | 100.0 | - | - | 100.0 | - | 100.0 | 100.0 | - |

Gate output on this run against the committed `baseline.json`: 142 × "corpus: new file …", fuzz and meta "not run", **passed** — i.e. nothing was actually checked (finding 2).
