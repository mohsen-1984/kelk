# Kelk — Contribute Log (کِلک)

![JavaScript](https://img.shields.io/badge/JavaScript-plain%20scripts%2C%20no%20build-F7DF1E?logo=javascript&logoColor=black)
![Runs from file://](https://img.shields.io/badge/Runs%20from-file%3A%2F%2F%20%2F%20GitHub%20Pages-1F6F5C)
![PDF.js](https://img.shields.io/badge/PDF.js-6.4.299-E44D26?logo=mozilla&logoColor=white)
![MathJax](https://img.shields.io/badge/MathJax-4.1.3-2E7D32)
![Tests](https://img.shields.io/badge/Tests-browser%20suites%20%2B%20Playwright%20PDF%20lab-2EAD33?logo=playwright&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

The contributor's handbook of **Kelk**, a Markdown ⇄ Word (DOCX, DOC), PDF and HTML converter that runs
**entirely in the browser** — no server, no upload, no build step, even offline from `file://`. It is
right-to-left first (Persian, Arabic, Hebrew, Urdu, Kurdish beside every left-to-right language), its interface
is in English, فارسی and العربية, and since 2.0-rc1 it also reads **PDF back into Markdown**. The user-facing
description is in the root [`README.md`](../README.md); this file is how the project is built, tested, planned
and recorded.

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Getting Started](#-getting-started)
- [Technology Stack & Languages](#-technology-stack--languages)
- [Software Architecture](#️-software-architecture)
- [Security Architecture](#-security-architecture)
- [Testing](#-testing)
- [Known Issues](#️-known-issues)
- [Plans](#-plans)
- [Change History](#-change-history)
- [License](#-license)

---

## 📖 Overview

| | |
|---|---|
| **What it is** | A static web page (`index.html` + `scripts/` + `styles/`) on top of a standalone JavaScript library (`lib/`): four builders with one API — `DocxBuilder`, `PdfBuilder`, `WordHtmlBuilder` (.doc / MHTML), `HtmlBuilder` — plus `PreviewBuilder`, `BidiCore`, `MathCore`, `MarkdownImporter` (.docx / HTML / rich paste → Markdown) and `PdfImporter` (.pdf → Markdown, on PDF.js). |
| **Backend** | None. Every conversion runs client-side; the page works from `file://`, from the release zip, or from any static host. |
| **Repository** | GitHub `mohsen-1984/Kelk` (being renamed from `mohsen-1984/kelk`; links in the root README and the Pages URL still read `kelk` until they are updated). Branch `main`; tags `v1.0`, `v1.5`. The 2.0-rc1 tree came in through [PR #1](https://github.com/mohsen-1984/Kelk/pull/1) from the fork branch `AliZarrabi/overhaul/2.0`, merged into `main` on 1405-08-10 (`db323e1`). Redesign work runs on branches `redesign/P<n>.<m>`. |
| **Published** | GitHub Pages `https://mohsen-1984.github.io/kelk/` (branch deploy of the whole repository) and a release zip `kelk_<version>.zip` made by hand. |
| **Users** | Anyone writing Markdown — notably for AI-model output — who needs Word or PDF, above all in Persian and Arabic; the import side gives AI models clean Markdown from Word, PDF and HTML. |
| **Size** | `lib/` ≈ 22.6k lines of JavaScript in 18 files (the PDF importer, `lib/PdfImporter.js` + `lib/pdfimport/`, ≈ 8.6k of them), `scripts/` ≈ 3.6k lines in 13 files; tree ≈ 50.6 MB (runtime ≈ 31.8, dev-only ≈ 18.8 — measured 1405-08-09); `vendor/` 16.75 MB (MathJax 11.17); the PDF lab's 144 PDFs 15.6 MB. |
| **Claude Code tooling** | `.claude/`: hooks (plan archiving, context-window warning, checkpoint/resume pointer), skills (`checkpoint`, `resume`, `ui-visual-check`), the master plan in `.claude/plans/` (completed plans move to `.claude/plans/archive/`). |

The master plan for 2.x is [`.claude/plans/Kelk-Redesign.md`](../.claude/plans/Kelk-Redesign.md); the library's own
documentation is [`lib/README.md`](../lib/README.md), with [`lib/LATEX.md`](../lib/LATEX.md) and
[`lib/PDFIMPORT.md`](../lib/PDFIMPORT.md) for the reasons behind formulas and PDF import.

---

## 🚀 Getting Started

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| **A current browser** | Chrome, Edge or Firefox | All the app needs. MathJax and PDF.js are wrapped to load from `file://`. |
| **Git** | any | `mohsen-1984/Kelk`, branch `main`. Text files are LF everywhere (`.gitattributes`); a working tree cloned before P0.1 needs one refresh on a clean tree: `git rm -r --cached -q . && git reset -q --hard`. |
| Node.js | 18+ (CI uses 22) | Only for the PDF lab and `tools/*.js`. There is **no `package.json`** yet (plan P0.4). |
| Playwright | 1.56.1 (the CI pin) + `pdf-lib` 1.17.1 | Installed **outside** the repository; `NODE_TOOLS` points at its `node_modules`. |
| Lab generators | LibreOffice (`soffice`), wkhtmltopdf, pandoc, Python 3 with openpyxl, python-pptx, fontTools, DejaVu fonts, qpdf, poppler-utils | Only to **remake** lab PDFs; importing and scoring need Node + Playwright only. |
| Python 3 | 3.10+, optional | `tools/build_pdf_fonts.py` (PDF fonts) and the Claude Code `ui-visual-check` skill (with Chrome or Edge). |
| Claude Code tooling | Git with `bash` (Git for Windows on Windows), Node.js ≥ 20 | The hooks in `.claude/settings.json` and `.githooks/`. Git is pointed at `.githooks` at the start of every Claude Code session; outside Claude Code run `git config core.hooksPath .githooks` once per clone. |
| GitHub CLI (`gh`) | optional | Reading CI runs and opening pull requests; `gh auth login` once per machine. |

> ⚠️ **Never run `gate.js --update` after a filtered run** (e.g. `run-import.js math`). The committed
> `baseline.json` held 2 of the 144 corpus files because of exactly that, and the gate passed without checking
> anything until P0.2 rebuilt it. Since P0.2 `--update` refuses a run that lacks any lab PDF (use `--partial`
> to merge a filtered run into an existing baseline), and `--baseline <file>` tries a candidate without touching
> `baseline.json`.

### Commands

```bash
# the app — nothing to install or build
start index.html                      # Windows; or open it in any browser, or serve the folder statically

# the browser test pages (open from file://)
start tests/index.html                # links to the suites below
start tests/builder-suite.html        # every corpus case through the four builders + preview parity + PDF round trip
start tests/pdf-import-suite.html     # PDFs you pick, scored against the corpus offline

# generated files
node tools/build-icons.js             # assets/icons.js (Lucide subset)
node tools/build-samples.js           # docs/about-kelk-and-samples.js from the three about documents
node tools/build-pdfjs.js             # PDF.js wrapped as classic scripts for file://
python tools/build_pdf_fonts.py       # lib/pdf-base64-ttf-fonts/pdf-font-*.js
```

### Running the PDF lab

The lab (`tests/pdf-lab/`) imports every lab PDF with `lib/PdfImporter.js` in headless Chromium, through
`tools/pdf-lab.html`, and scores the Markdown against its source. Full guide:
[`tests/pdf-lab/README.md`](../tests/pdf-lab/README.md).

```bash
# once, in a folder outside the repository
npm install playwright@1.56.1 pdf-lib@1.17.1 && npx playwright install chromium
export NODE_TOOLS=/path/to/that/folder/node_modules
export LAB_OUT=/path/outside/the/repo/lab-out     # results stay out of the working tree

node tests/pdf-lab/scripts/run-import.js           # the 144-PDF corpus (≈ 15 s)
node tests/pdf-lab/scripts/make-fuzz.js dev && node tests/pdf-lab/scripts/make-fuzz.js heldout
node tests/pdf-lab/scripts/run-fuzz.js dev         # style-fuzzed PDFs, dev split
node tests/pdf-lab/scripts/run-fuzz.js heldout     # held-out split — read as means only, never --show
node tests/pdf-lab/scripts/make-meta.js && node tests/pdf-lab/scripts/run-meta.js   # metamorphic net
node tests/pdf-lab/scripts/gate.js                 # compare with baseline.json (--against <dir> for a base run)
```

On Windows (notes from the review machine, plan §10): `env.js` falls back to a Linux `NODE_TOOLS` path, so set it;
`npx playwright install` resolved a different Playwright than the one installed and stalled twice — what worked was
installing `playwright@latest` and making directory junctions from the build number it asks for to the build on disk
(`mklink /J chromium_headless_shell-<wanted> chromium_headless_shell-<present>`, the same for `chromium-<wanted>`).
On a second machine (1405-08-10) `playwright@1.56.1` worked once the stalled install was finished by hand: run
`node_modules/.bin/playwright install chromium-headless-shell` from the tools folder (not `npx`); when it stalls,
stop it, delete `%LOCALAPPDATA%/ms-playwright/__dirlock`, unzip the downloaded
`playwright-download-chromium-headless-shell-win64-<build>.zip` (in `%TEMP%`) into
`ms-playwright/chromium_headless_shell-<build>` with Windows `tar -xf`, and create the empty marker files
`INSTALLATION_COMPLETE` and `DEPENDENCIES_VALIDATED` there. The headless shell is all the lab needs.
P0.3 removes the need for this.

---

## 🧰 Technology Stack & Languages

### Languages

| Language | Where |
|---|---|
| **JavaScript** (classic scripts, no modules, no bundler) | The app (`scripts/`, one namespace `window.Kelk`), the library (`lib/`), the tools (`tools/*.js`) and the lab's Node scripts (`tests/pdf-lab/scripts/`). No TypeScript. |
| **HTML** | `index.html`; the test pages in `tests/`; `tools/bidi-lab.html`, `tools/pdf-lab.html`, `tools/og-image.html`. |
| **CSS** | `styles/tokens.css`, `base.css`, `components.css`, `preview.css`; light and dark themes. |
| **Python 3** | `tools/build_pdf_fonts.py`; the lab's PDF generators (`make-*.py`, `rtl_pdf.py`). |
| YAML | `.github/workflows/pdf-lab.yml`. |
| Markdown | Docs, the about-and-samples documents (en / fa / ar), the lab corpus. |
| **UI languages** | English, Persian, Arabic — `scripts/i18n.js`; the about document opens in the interface language. |

### Libraries and tools

All vendored in `vendor/`, pinned by file name; licences in [`THIRD-PARTY-NOTICES.md`](../THIRD-PARTY-NOTICES.md).

| Area | Technology |
|---|---|
| Markdown → HTML | **marked** 18.0.14, sanitised by **DOMPurify** 3.4.16 |
| Code highlighting | **highlight.js** 11.12.0 (theme CSS 11.11.1) |
| HTML → Markdown | **Turndown** 7.2.4 + turndown-plugin-gfm 1.0.2; **mammoth** 1.12.3 for .docx |
| DOCX | **docx** 9.7.1 (`DocxBuilder`) |
| PDF out | **jsPDF** 4.2.1 with Kelk's own layout engine (`PdfBuilder`: bidi, Arabic shaping, marks, per-glyph fallback, emoji) |
| PDF in | **PDF.js** 6.4.299 (wrapped as classic scripts by `tools/build-pdfjs.js`), with its OpenJPEG and JBIG2 WebAssembly decoders |
| Formulas | **MathJax** 4.1.3 (TeX input, SVG output, New Computer Modern font, mhchem); `lib/MathCore.js` converts MathML ⇄ OMML itself (MIT) |
| Zip | **JSZip** 3.10.2 (multi-file and .zip import) |
| Icons | Lucide 1.48.0 (subset in `assets/icons.js`) |
| Fonts | Vazirmatn 33.003, Sahel 3.4.0, Vazir Code (Hack) 1.1.2, DejaVu Sans / Mono 2.37, Noto Emoji — web fonts in `assets/fonts/`, PDF fonts as base64 in `lib/pdf-base64-ttf-fonts/` |
| Test lab | Node + Playwright Chromium; generators driving LibreOffice, wkhtmltopdf, pandoc, python-pptx / openpyxl, qpdf |
| Delivery | GitHub Pages (branch deploy), a release zip made by hand, GitHub Actions for the lab |

---

## 🏗️ Software Architecture

### Big picture

```
Browser (file://, the release zip, or GitHub Pages)
 └─ index.html  ─ styles/ (tokens, base, components, preview)
     ├─ vendor/  marked, DOMPurify, highlight.js, Turndown(+gfm)            loaded at startup
     │           docx, jsPDF, mammoth, PDF.js, JSZip                        on first use (Kelk.libs.need)
     │           MathJax 4.1.3                                              with the first formula (MathCore)
     ├─ lib/     ImageCore · MathCore · BidiCore · BidiView
     │           BuilderBase ─┬─ WordHtmlBuilder (.doc)   ─ msOfficeWordHtmlTemplate
     │                        ├─ DocxBuilder (.docx)
     │                        ├─ PdfBuilder (.pdf)        ─ lib/pdf-base64-ttf-fonts/
     │                        └─ HtmlBuilder (.html) ─ PreviewBuilder (the live preview)
     │           MarkdownImporter (.docx / HTML / paste → MD)
     │           PdfImporter ─ pdfimport/ extract → lines → regions → order → blocks
     └─ scripts/ config → i18n, storage, ui, fonts-loader, names, images,
                 editor, preview, importer, exporter, settings → main        (window.Kelk)
```

### Repository layout

```
kelk/                     root: index.html  README.md  CHANGELOG.md  TODO.md  THIRD-PARTY-NOTICES.md  LICENSE  .gitignore
├─ scripts/  styles/      the page's code and styles
├─ lib/                   the library (+ pdfimport/, pdf-base64-ttf-fonts/, README.md, LATEX.md, PDFIMPORT.md)
├─ assets/                icons.js, og-image.png, fonts/ (web, embed, download zip)
├─ vendor/                third-party libraries, pinned by file name
├─ docs/                  about + samples (en / fa / ar), screenshots/, reports/, this ContributeLog.md
├─ tests/                 builder-suite.html, pdf-import-suite.html, math-*.html, corpora, pdf-lab/
├─ tools/                 bidi-lab.html, pdf-lab.html, build-*.js, build_pdf_fonts.py, og-image.html
├─ .github/workflows/     pdf-lab.yml
└─ .claude/               Claude Code: settings.json, hooks/, skills/, plans/ (+ archive/)
```

### Layers

| Layer | Location | Responsibility |
|---|---|---|
| Page shell | `index.html`, `scripts/main.js`, `ui.js`, `styles/` | Layout, top bar, panels, maximise, toasts, themes, startup. |
| Editor & preview | `scripts/editor.js`, `preview.js` | Markdown editing, debounced (250 ms) preview through `PreviewBuilder`, scroll sync. |
| Settings & storage | `scripts/settings.js`, `storage.js`, `config.js` | Settings pane (grouped by subject), defaults, one-shot migrations, `localStorage`. |
| Import / export | `scripts/importer.js`, `exporter.js`, `names.js`, `images.js` | File pickers, drop, multi-file and zip, progress dialog with Cancel, file naming, images in the text. |
| i18n | `scripts/i18n.js` | English, Persian, Arabic strings; direction of the interface. |
| Direction engine | `lib/BidiCore.js`, `BidiView.js` | Every direction decision — paragraphs, list items, cells, numbers and brackets in RTL text — for all outputs and the preview. |
| Builders | `lib/BuilderBase.js` + the four builders, `PreviewBuilder.js` | One fluent API (`create()`, `configure()`, `addFromHtml()`, `toBlob()`); shared table-style grid, ToC, header / footer. |
| Formulas & images | `lib/MathCore.js`, `ImageCore.js` | LaTeX detection, MathJax rendering, OMML ⇄ TeX; image loading and sizing. |
| Importers | `lib/MarkdownImporter.js`; `lib/PdfImporter.js` + `lib/pdfimport/` | .docx / HTML → Markdown; PDF → glyphs → lines → regions → reading order → blocks → Markdown. |
| Tests & lab | `tests/`, `tests/pdf-lab/`, `tools/pdf-lab.html` | Browser suites; the headless PDF lab with its gate. |

### Key design decisions

- **No build step, `file://` first.** Everything is a classic `<script>`; PDF.js is re-wrapped
  (`tools/build-pdfjs.js`) and MathJax is local so the page runs offline from a folder. Plan decision: dev tooling
  (package.json, lint, unit tests, CI) may be added, the shipped site stays plain scripts.
- **One direction engine.** `BidiCore` decides the direction of every block for all four outputs and the preview, so
  they agree; `tools/bidi-lab.html` shows every rule (it holds a hand-synced copy of the engine).
- **PdfBuilder draws its own pages** on jsPDF: Arabic-script shaping, mark positioning, per-glyph font fallback,
  formulas as vector paths, a ToC with page numbers; it writes each formula's LaTeX into the PDF (`/ActualText` +
  XMP) so `PdfImporter` gives it back exactly.
- **Preview = HTML export.** `PreviewBuilder` uses `HtmlBuilder`'s logic and stylesheet, and the builder suite checks
  the two give every block the same direction and every cell the same style.
- **PDF import is rule-based geometry**, not ML: ≈ 10k lines of traceable rules, each named after the producer that
  motivated it, documented in `lib/PDFIMPORT.md` and gated by the lab. The redesign keeps this core (structural
  changes, not a rewrite) and adds an optional ML second opinion (P6) and OCR (P7) as downloads.
- **Large libraries on first use** (`Kelk.libs.need` in `scripts/config.js`); the `lib/` builders and the importer
  themselves are still loaded at startup (plan P5.1).

---

## 🔐 Security Architecture

Kelk has no server, no account and no upload: documents never leave the browser. What the page does:

| Concern | Implementation | Location |
|---|---|---|
| Processing | Every conversion runs in the page; no network request is needed (fonts, MathJax and PDF.js are local). A user may reference a public image URL, which the browser then fetches. | `scripts/`, `lib/` |
| Rendering Markdown | marked → **DOMPurify** → preview; the config keeps `id` / `style` / `form` / `input` (see Known Issues). | `scripts/preview.js:18,159` |
| Custom header / footer HTML | Inserted into exports **without sanitising** (see Known Issues). | `scripts/exporter.js:109-116` |
| HTML export | `HtmlBuilder.toHtml` parses into a live element; `on*` attributes pass through (B4, see Known Issues). | `lib/HtmlBuilder.js:478-493` |
| Content Security Policy | **None.** Cheap to add: the page has no inline scripts or handlers (plan P1.2). | `index.html` |
| Browser storage | `localStorage`: settings, the document, images as base64 data URIs — no credentials. | `scripts/storage.js`, `scripts/images.js:38-46` |
| PDF parsing | PDF.js 6.4.299 on a fake worker in the main thread; encrypted PDFs with a user password give a message only. | `scripts/config.js:134` |
| Third-party code | Vendored and pinned by file name; no checksums, SBOM or Dependabot (plan P8.3). | `vendor/`, `THIRD-PARTY-NOTICES.md` |
| CI | `pdf-lab.yml` has no `permissions:`, no `concurrency:`, actions not SHA-pinned (plan P0.3). | `.github/workflows/pdf-lab.yml` |
| Private test data | The owner's real PDFs are never committed (each pattern is rebuilt with our own text); no private data found in the lab PDFs (1405-08-09). `tests/pdf-lab/real/` and `private/` are git-ignored (P0.1). | `tests/pdf-lab/` |
| Local tooling | `.claude/settings.local.json` (personal permissions) is git-ignored; none is kept in the repository. | `.gitignore` |

---

## 🧪 Testing

### Current state (measured 1405-08-09 on the review machine, Windows, Playwright Chromium; CI checked 1405-08-10)

| Check | Command | Result |
|---|---|---|
| PDF lab — corpus | `run-import.js` | **144 PDFs from 49 producer variants, 0 crashes, ≈ 15 s; mean total 95.7** (114 files ≥ 99, 19 < 90) — reproduces the CHANGELOG figure. Raw scores: [`docs/reports/corpus-run-1405-08-09.json`](reports/corpus-run-1405-08-09.json). |
| PDF lab — right-to-left | (same run) | **55 RTL files: mean total 90.1**, `rtl` column 92.9. Weakest producers `lohtml-rtl` 59.0, `wk-rtl` 61.2, `chrome-rtl-plain-hf` 81.4, `kelkdocx-lo` 88.7. |
| PDF lab — style fuzz | `run-fuzz.js dev` / `heldout` | **dev 96.0, held-out 94.6** (CHANGELOG 2.0-rc1, taken as the plan's baseline). The held-out set is English Chromium / wkhtmltopdf output only. |
| PDF lab — metamorphic net | `run-meta.js` | 12 transforms × 18 seeds (5 RTL). Losses it proves: `noToUnicode` −85, `trackLoose` −16.3, `tz85` −11.4, `trackTight` −4.8, `objstm` −1.0. |
| PDF lab — gate | `gate.js` | Since P0.2 (1405-08-10): `baseline.json` holds **all 144 corpus files** (55 with `rtl`), the clean run passes and a deliberate ZWNJ break fails 21 files; fuzz and meta in the baseline are still the review machine's (Chromium 153) until P0.3. Before: 2 of 144 files, "passed" while checking nothing. |
| CI | `.github/workflows/pdf-lab.yml` | Two runs, both **green and both meaningless**: the fork run (1405-08-09) had no base and fell back to the blind `baseline.json`; the `main` run (1405-08-10) compared against `4beee81` (1.5, no importer) and passed because every base / head step ends in `> /dev/null \|\| true`. |
| Builder suite | `tests/builder-suite.html` | 383 cases through the four builders, preview parity and a PDF round trip; DOCX / DOC "pass" whenever a blob is produced (no XML validation, no goldens). **Not in CI.** |
| Formulas | `tests/math-file.html`, `math-modes.html` | Browser pages, checked by eye; `math-roundtrip.js` never sets an exit code. |
| Lint / unit tests | — | **None**: no `package.json`, ESLint or unit tests yet (P0.4, P1.1). |

### Protocol for every change

From the plan (§4, §9); every sub-phase ends with a report and the owner's written approval.

1. Work on a branch `redesign/P<n>.<m>`; write the report in `docs/reports/P<n>.<m>-<slug>.md` (what changed; lab
   before / after: corpus mean, dev, held-out, meta per transform, `rtl`; open issues).
2. **Importer change:** `run-import.js`, `run-fuzz.js dev`, `run-fuzz.js heldout`, `run-meta.js`, then `gate.js`.
   Held-out is read as means only (`--show` never); `gate.js --update` only in the approval step. The Persian `rtl`
   column never goes below the baseline.
3. **Refactor:** `cmp.js` shows 0 changed Markdown files for the corpus and fuzz dev; the meta "same" count is unchanged.
4. **Builders / library:** `tests/builder-suite.html` all green; `roundtrip.js` for the PDF round trip.
5. **App:** open `index.html` from `file://` in English, Persian and Arabic, light and dark; for layout changes the
   `ui-visual-check` skill (`.claude/skills/`) measures overflow, clipping and contrast at standard sizes.
6. Stop for the owner's approval; on approval merge to `main`, update the tracker (plan §5) and add a Change History
   row here.

### Where tests should go next

- **Gate first** (P0.2): a full baseline of all 144 files with `rtl` per file, and `--update` refusing a partial run.
- **CI that can fail** (P0.3): no `|| true`, `pipefail`, logs in the artifact, round trip and crash smoke added.
- **Persian in the held-out net** (P2.1): `fa-article`, `fa-report`, `ar-article` and a new `fa-mixed` in the fuzz
  generator, RTL fonts, digits and tracking dimensions; ≥ 40 % RTL.
- **Metamorphic net** (P2.2): ≥ 20 transforms, "same" transforms asserted byte-identical.
- **Builders in CI** (P2.3): DOCX validated (OOXML XSD + LibreOffice conversion), golden snapshots in `tests/golden/`,
  MarkdownImporter unit tests. App unit tests in `tests/unit/` (Node + jsdom, P1.1).
- **Real producers and goldens** (P4): ≈ 40 PDFs from Word, Print to PDF, Excel, PowerPoint, Edge on the owner's
  machine; 50 hand-written golden Markdown files.

---

## ⚠️ Known Issues

Priority: 🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low · ✅ Resolved. Rows are ordered by priority within each
category; resolved rows come last, oldest first. Append new findings rather than rewriting rows.
Locations are relative to the repository root. Source: the review of 1405-08-09 (plan §2), unless a row says otherwise.

### 🧱 Build, release & CI

| Priority | Issue | Location | Suggestion |
|---|---|---|---|
| 🟠 High | **CI hides every failure**: base and head steps end in `> /dev/null \|\| true`; both runs so far are green without proving anything. | `.github/workflows/pdf-lab.yml:53-64` | P0.3: remove, `set -o pipefail`, `tee` logs into the artifact. |
| 🟠 High | `baseline.json` was made with Chromium 153 and Bitstream Type 1 fonts; CI has Playwright 1.56.1 (Chromium 141) and no such fonts, so the fuzz comparison on the no-base path is always skipped. | `tests/pdf-lab/baseline.json` | Rebuild the baseline in the CI environment (P0.2–P0.3). |
| 🟠 High | **Release zip made by hand**, no include list: a 2.0 zip would carry `tests/pdf-lab` (16 MB) and `.github/`. | — | P8.1: `tools/build-release.js` with an include list. |
| 🟠 High | README links `kelk_2.0.zip` under `releases/latest` → 404 (latest is v1.5; a prerelease is skipped by `latest`). | `README.md` | Link the tagged release (P8.1). |
| 🟡 Medium | Version strings in ≈ 8 places disagree (`2.0-rc1` / `2.0` / `1.0`). | `scripts/config.js:11` and ≈ 7 other places | P0.4: one `VERSION`, `tools/check-version.js` in CI. |
| 🟡 Medium | No `package.json`, lockfile, ESLint or Prettier. | root | P0.4 (tooling). |
| 🟡 Medium | The lab harness is Linux-only: `'/opt/npm-tools/node_modules'`, `'file://' + path` ×30, `fc-match`, `/usr/share/fonts`, `/` splits in `features.js`. On Windows (checked 1405-08-10): `make-meta.js` crashes at once without `qpdf` (`spawnSync qpdf ENOENT`, before making any file) — 7 of 12 transforms need it; `make-fuzz.js` silently draws the wkhtmltopdf share with Chromium when wkhtmltopdf is missing; without `fc-match` every font in the fuzz `env` is `null`. | `tests/pdf-lab/scripts/env.js`, `features.js`, `make-meta.js`, `make-fuzz.js` | P0.3: `url.pathToFileURL`, `require.resolve`, `path.sep`; `make-meta.js` skips the qpdf transforms with a note; `make-fuzz.js` prints the substitution. |
| 🟡 Medium | Pages is a Jekyll branch deploy of the whole repo: no `.nojekyll`, no cache-busting on `lib/`, `scripts/`, `styles/`. | — | P8.1: Pages through Actions with the release set and hashed URLs. |
| 🟡 Medium | Not in CI: the builder suite, `math-roundtrip.js`, struct / features / crash runs, lint, link check, a11y, bundle size, generated-files freshness. | `.github/workflows/` | P0.3, P2.3, P2.4. |
| ⚪ Low | Docs out of step: the lab described in four places, stale numbers ("106 PDFs", "27 producers"), metamorphic net stated as 15 seeds / 171 PDFs (actual 18 / 205), Noto Emoji version "—", hljs theme 11.11.1 vs JS 11.12.0; `PDFIMPORT.md` (155 KB) has no TOC. | `lib/PDFIMPORT.md`, `tests/pdf-lab/README.md`, `THIRD-PARTY-NOTICES.md` | P8.2: split the doc, generated TOC, `tools/check-docs.js`. |
| ⚪ Low | `run-real.js` ignores `LAB_OUT`. | `tests/pdf-lab/scripts/run-real.js` | Honour `LAB_OUT` like the other runners. |

### 🔒 Security

| Priority | Issue | Location | Suggestion |
|---|---|---|---|
| 🟠 High | Preview DOMPurify config keeps `id` / `style` / `form` / `input`: Markdown such as `<div id="toasts">` hijacks app elements and a `<style>` restyles the app. | `scripts/preview.js:18,159`, `scripts/ui.js:46,284` | P1.2: `SANITIZE_NAMED_PROPS`, forbid `form`, `input`, `button`, `textarea`, `select`, `style`. |
| 🟠 High | Custom header / footer HTML is never sanitised. | `scripts/exporter.js:109-116` | P1.2: sanitise it like the preview. |
| 🟠 High | **B4** — `HtmlBuilder.toHtml` parses into a live element; `on*` attributes pass through. | `lib/HtmlBuilder.js:478-493` | P1.2: `BidiCore.inertRoot`, strip `on*` / `javascript:`. |
| 🟡 Medium | No Content Security Policy. | `index.html` | P1.2: a `<meta>` CSP, tested on `file://` and Pages with MathJax and PDF.js; `rel="noopener noreferrer"` on every `target=_blank`. |
| 🟡 Medium | Supply chain: vendor files pinned by name only (`6.4.299` repeated ×8, the marked file name ×14), no checksums, SBOM or Dependabot; CI without `permissions:` and SHA-pinned actions. | `vendor/`, `.github/workflows/pdf-lab.yml` | P8.3 vendor manifest with hashes; P0.3 workflow hardening. |

### 📄 PDF import

| Priority | Issue | Location | Suggestion |
|---|---|---|---|
| 🟠 High | **The held-out set has no Persian**: five English documents, Chromium 3 : wkhtmltopdf 1. "dev 96.0 / held-out 94.6" says nothing about Persian, Word, LibreOffice, Prince or PowerPoint. | `tests/pdf-lab/scripts/make-fuzz.js:24` | P2.1 RTL fuzz corpus; P4.3 held-out protocol. |
| 🟠 High | **`fa-features` scores quote 0 on all four producers** (Kelk, Chrome plain, Chrome GitHub-style, Chrome tagged), each ≈ 85: the quote rule drops Persian nested quotes regardless of producer. TODO lists it as Kelk-only; the data says it is not. | `lib/pdfimport/` (quote rule) | P1.3: bisect rule by rule with `md.js`. |
| 🟠 High | LibreOffice-path RTL files: `brackets` 0 in every one (mirrored brackets — probably Vazirmatn's RTL bracket glyphs outside the cmap), lists 0–28, tables 0–42 (`lohtml-rtl` 59.0, `kelkdocx-lo` fa / ar 55–96). | `lib/pdfimport/extract.js`, `blocks.js` | Read brackets by outline; RTL list / table rules (P3, P4). |
| 🟡 Medium | wkhtmltopdf Persian: `zwnj` 0, `yehKaf` 53–68 — a broken ToUnicode in the PDF itself (`wk-rtl` 61.2). | `lib/pdfimport/extract.js` | Name the glyphs from the font's own cmap, as for Word's «ت → "». |
| 🟡 Medium | Chrome browser-default style loses `quote` and `code` in fa / ar while the text is perfect (`chrome-rtl-plain-hf--ar-article` 69.6 with `rtl` 100). | `lib/pdfimport/blocks.js` | Layout rules for unstyled RTL quotes and code. |
| 🟡 Medium | **Self-calibration is partial**: ≈ 390 size-relative thresholds beside ≈ 400 bare literals (6 pt, 12 pt, 1.1 em …); no threshold registry, no record of which rules fired, no confidence. The word-space rules are absolute (tz85 −11.4, trackLoose −16.3). | `lib/pdfimport/lines.js` (`lineWordGap` ≈ 241) and the other four files | P3.2 calibration object + registry + telemetry; P3.3 migration in metamorphic order. |
| 🟡 Medium | **Degradation measures but never repairs**: `r.quality` flags (`lostGlyphs`, `suspectSpaces`, `textInPictures`) have no fallback path; diagnostics reach the user as ≤ 4 transient toasts. | `lib/PdfImporter.js`, `scripts/importer.js:167-175` | P3.4 confidence and fallback ladder; P3.5 import report panel. |
| 🟡 Medium | Very long functions: `_pageBlocks` 910 lines, `_lines` 607, `_extractPage` 523, `_joinAcrossPages` 376, `_xyCut` 286, `_groupLines` 266. | `lib/pdfimport/order.js`, `lines.js`, `extract.js`, `blocks.js` | P3.1: split along the documented pipeline, `cmp.js` 0 diffs. |
| 🟡 Medium | No real Word / Excel / PowerPoint / Microsoft Print to PDF output in the lab — those producers are imitated glyph by glyph (risk: fitting the imitation). | `tests/pdf-lab/pdf/producers/` | P4.1: real-producer Persian corpus from the owner's Windows machine. |
| 🟡 Medium | The narrow-space → ZWNJ rule hurts wkhtmltopdf Persian: with it switched off, the three `wk-rtl--*` files gain `zwnj` 0 → 10–24 and `rtl` +3 to +7.5 (found by the P0.2 deliberate-break test, 1405-08-10). The Chrome zero-width-space rule (`extract.js:813`) and this one back each other up, so neither alone shows in the gate. | `lib/pdfimport/lines.js:489`, `extract.js:813` | Look at it with the wkhtmltopdf ToUnicode row above (P3.3 word-space batch). |
| ⚪ Low | Open import items of the backlog (rotated text, footnotes kept in place, rowspan, tables inside quotes, OCR …). | `TODO.md` → PDF import | Worked through the plan's phases; the full list stays in `TODO.md`. |

### 🧩 Application (`scripts/`, `index.html`, `styles/`)

| Priority | Issue | Location | Suggestion |
|---|---|---|---|
| 🟠 High | **Settings migrations run against fresh profiles**: the one-shot markers (`_auto`, `_vch`, `_vz`, `_auto2`, `_hfauto`, `_lh`) are not in the defaults, so a user's own choices get "migrated" on the next reload; the stored profile freezes old defaults; `settings.js` duplicates part of it. | `scripts/storage.js:54-114`, `config.js:36-66`, `settings.js:188-193` | P1.1: `schemaVersion`, store diffs only, one `migrate()`. |
| 🟠 High | **Exports can read stale preview HTML**: the preview renders 250 ms after typing, the exporter reads it at once. | `scripts/exporter.js:173`, `editor.js:120` | P1.1: `K.preview.flush()` before export. |
| 🟠 High | ≈ 1.93 MB of JS / CSS parsed at startup, 1.44 MB of it unminified `lib/` that only import / export needs. | `index.html:564-581` | P5.1: lazy-load builders and importer (≤ 0.6 MB). |
| 🟡 Medium | PDF.js on a fake worker (main thread); builders synchronous, so Cancel cannot interrupt an export. | `scripts/config.js:134`, `exporter.js:172-189` | P5.1 real Worker on http(s); later async builders. |
| 🟡 Medium | Images as base64 in `localStorage` (≈ 5 MB quota); no `storage` event, so two tabs overwrite each other; Clear cannot be undone. | `scripts/images.js:38-46`, `main.js:200-206` | P5.3 IndexedDB + recovery snapshots; P1.1 `storage` listener. |
| 🟡 Medium | Every render redoes marked + DOMPurify + hljs + MathJax; startup renders 3–4 times. | `scripts/preview.js:147-195` | Cache per block; render once at startup. |
| 🟡 Medium | `<html lang="fa" dir="rtl">` hard-coded → a wrong-language flash; Tab trap in the editor (WCAG 2.1.2); stats `aria-live` chatter. | `index.html:2,111`, `scripts/editor.js:142-146` | P1.4 boot script; P5.4 a11y. |
| 🟡 Medium | The Arabic UI gets the Persian word «جدول» and Persian dates. | `scripts/importer.js:20,146`, `exporter.js:114` | P1.4: through `K.i18n`, date locale by language. |
| ⚪ Low | ≈ 10 hard-coded English strings; 9 unused i18n keys; `vendor/lucide.min_1.48.0.js` (444 KB) and a duplicate hljs CSS shipped unused. | `scripts/`, `vendor/` | P1.4 `tools/check-i18n.js`; P5.1 drop the unused files. |
| ⚪ Low | Missing: PWA, print CSS, find / replace, snapshots, export presets, reorder before a multi-file join, outline navigation, auto theme. | — | P5.3–P5.4. |

### 📚 Builder libraries (`lib/`)

| Priority | Issue | Location | Suggestion |
|---|---|---|---|
| 🟠 High | **B1** — the Arabic shaping table maps U+0649 initial / medial to U+0488 / U+0489 (Cyrillic marks) instead of U+FBE8 / U+FBE9; gaps for U+0620, 063B–063F, 066E / F, 06D5, 06FA–FC. | `lib/PdfBuilder.js:293` | P1.3 with round-trip cases. |
| 🟠 High | **B2** — PDF tables ignore `rowspan` when assigning columns while `_tableStyleGrid` honours it → lines and text disagree. | `lib/PdfBuilder.js:2551-2577` | P1.3: reuse `_tableStyleGrid` occupancy. |
| 🟡 Medium | **B3** — a table row taller than a page overflows. | `lib/PdfBuilder.js:1710,2676` | P1.3: split or clamp with a note. |
| 🟡 Medium | **B5** — the builder suite never loads `dejavu-sans-mono`, so three cases pass on a fallback font. | `tests/builder-suite.html:48-52` | P1.3. |
| 🟡 Medium | **No shared intermediate model**: four builders each re-parse the HTML (≈ 8,050 LOC of renderers vs 2,485 shared); ≈ 150 LOC of helpers copied verbatim, `cssSafe` ×4, `_pagingLabels` ×4, ≈ 1,400 LOC of parallel per-feature code. | `lib/PdfBuilder.js:415-463` ≈ `DocxBuilder.js:308-358`, `WordHtmlBuilder.js:2111` | P5.2: `lib/DomUtil.js`, `walkBlocks`, goldens prove no output change. |
| 🟡 Medium | DocxBuilder relies on docx.js 9.7.1 internals inside silent try/catch; `markSectionRtl` runs only on detected RTL, not on `setDirection('rtl')`. | `lib/DocxBuilder.js:380,396,946` | Guard and test against the validator of P2.3. |
| 🟡 Medium | DOCX / DOC tests "pass" whenever a blob is produced; MarkdownImporter essentially untested; ≈ 11 empty `catch` blocks. | `tests/builder-suite.html`, `lib/` | P2.3. |
| ⚪ Low | **B6** two divergent `NAMED_COLORS` maps · **B7** blob URL revoked right after `click()` · **B8** dead data-URI regexp branch · `hasMix` declared twice. | `lib/BuilderBase.js`, `DocxBuilder.js`, `WordHtmlBuilder.js`, `MarkdownImporter.js:673`, `BidiCore.js:109,692` | P1.3. |
| ⚪ Low | `kelk:source` is never written, so the lossless Kelk → PDF → Kelk round trip waits (the importer already reads it). | `lib/PdfBuilder.js` | P5.5. |

### 🛠️ Claude Code tooling

No open issues.

<details>
<summary><strong>✅ Resolved</strong> (9) — click to expand</summary>

| Priority | Issue | Location | Suggestion |
|---|---|---|---|
| ✅ Resolved 1405-08-10 | **The whole 2.0 tree was uncommitted** (every earlier commit an "Add files via upload"), and `.github/` was untracked. | — | Committed as `d5409f1` on the fork branch `AliZarrabi/overhaul/2.0`; merged into `main` through PR #1 (`db323e1`). |
| ✅ Resolved 1405-08-10 | The plan lived in `docs/`, outside the plans folder the tooling archives from. | `docs/` | One English master plan, `.claude/plans/Kelk-Redesign.md`. |
| ✅ Resolved 1405-08-10 | The imported `.claude/` folder carried another project's report hooks and a hook for its HTML plan page. | `.claude/settings.json`, `.claude/hooks/` | Their registrations removed and the plan-page hook deleted. |
| ✅ Resolved 1405-08-10 | The imported `.claude/settings.local.json` came from another project, with that project’s plaintext credential and ≈ 350 permission rules. | `.claude/settings.local.json` | Deleted (and git-ignored); the owner was advised to change that password. |
| ✅ Resolved 1405-08-10 | `.claude/settings.json` registered two hooks that were not in `.claude/hooks/` (`todowrite-shim-watch.sh`, `precompact-guard.sh`), so they failed on every run. | `.claude/settings.json` | Entries removed; the context-warning hook already offers `/checkpoint`. |
| ✅ Resolved 1405-08-10 | No `.gitattributes` / `.editorconfig`; with `core.autocrlf=true` working trees were CRLF and one file was stored with CRLF line endings. | root, `lib/pdf-base64-ttf-fonts/NOTO-EMOJI-LICENSE-OFL.txt` | P0.1: `* text=auto eol=lf` plus `binary` rules, `.editorconfig` matching the tree's style, the file renormalised; corpus scores unchanged on an LF tree (Markdown output byte-identical). |
| ✅ Resolved 1405-08-10 | `tests/pdf-lab/real/` (the owner's private PDFs when present) was not git-ignored. | `.gitignore` | P0.1: `tests/pdf-lab/real/`, `private/` and `node_modules/` ignored. |
| ✅ Resolved 1405-08-10 | 144 binary PDFs (15.6 MB) entered `main`'s history as ordinary files with PR #1; storage was undecided (LFS, release asset or plain files). | `tests/pdf-lab/pdf/` | P0.1 decision: kept as ordinary files marked `binary`; history is not rewritten; revisit past 50 MB, > 10 MB of packed churn a year, or a single fixture > 10 MB. |
| ✅ Resolved 1405-08-10 | **The local gate was blind**: `baseline.json` held 2 of 144 corpus files (a filtered run written with `--update`), so 142 files were never gated — how the Persian regressions slipped through. | `tests/pdf-lab/baseline.json`, `tests/pdf-lab/scripts/gate.js` | P0.2: `--update` refuses a run lacking any lab PDF (`--partial` merges, `--baseline` tries a candidate); baseline rewritten with all 144 files (55 with `rtl`); switching off the ZWNJ rules now fails 21 files. |

</details>

---

## 📋 Plans

Defined plans only — one entry per plan file in `.claude/plans/`, grouped by status. A plan's phases and sub-phases
are tracked inside the plan itself, not here. When a plan's status line reads `**Status: COMPLETE (YYYY-MM-DD).**`,
a hook moves it to `.claude/plans/archive/` and repoints every link to it. Work that is not yet a plan stays in
[`TODO.md`](../TODO.md). **Date** is the plan's creation date and **Creator** the contributor who created it (Zarrabi or
Hasan Nejad); both are recorded at the top of the plan file.

**This list is generated** from the plan files after every Claude Code turn (`node .claude/scripts/contributelog.mjs fix`)
— title, `**Creator:**`/`**Created:**` line, `**Status:**` line and `**Summary:**` line; a status starting with
`PROPOSED` lists the plan as proposed, `COMPLETE` (or a file in `archive/`) as completed, anything else as active. Edit
the plan, not this list.

<!-- generated:plans -->
<details open>
<summary><strong>🚧 Active</strong> (1)</summary>

| Date | Plan | Creator | Why & What |
|---|---|---|---|
| 1405-08-09 | [Kelk 2.0 → 2.x Redesign Plan](../.claude/plans/Kelk-Redesign.md) | Zarrabi | **Status:** accepted by the project owner on 1405-08-09; execution started — P0.0, P0.1 and P0.2 approved 1405-08-10. Structural changes, not a rewrite: the rule-based PDF importer and its lab are the asset, and the weaknesses found in the review are fixable in place, each step gated by the lab. 8 phases / 31 sub-phases, ≈ 76 working days plus the owner's review — **P0** stabilise and commit · **P1** verified bugs · **P2** test-net completeness · **P3** importer structure, calibration, degradation · **P4** generalisation with real producers and golden-50 · **P5** app and libraries · **P6** optional ML second opinion · **P7** OCR for scans · **P8** release and docs. P0.1 Git hygiene approved 1405-08-10 (LF everywhere, lab PDFs kept as ordinary `binary` files). P0.2 approved 1405-08-10 (gate guarded, 144-file corpus baseline; fuzz and meta kept until P0.3 rebuilds them in CI). Next: **P0.3 CI first green run**. Progress tracker: §5. |

</details>

<details>
<summary><strong>🗓️ Proposed — not started</strong> (0)</summary>

No plan file is waiting.

</details>

<details>
<summary><strong>✅ Completed</strong> (0) — <code>.claude/plans/archive/</code></summary>

No plan has been completed yet.

</details>
<!-- /generated:plans -->

---


## 📜 Change History

Every completed task, **sorted chronologically (oldest first)** — new rows are appended at the bottom.

- **Date** is in the **Solar Hijri (Shamsi)** calendar, `YYYY-MM-DD` (1405-01-01 = 2026-03-21); every date in this
  file follows this rule, except dates inside URLs and file names.
- **Version** is the Kelk version the change shipped in: **1.0** (tag `v1.0`, CHANGELOG 1405-07-07) · **1.5** (tag
  `v1.5`, 1405-07-11) · **2.0-rc1** (CHANGELOG; untagged, `scripts/config.js` carries it).
- **Rows**: a change takes several consecutive rows with the same date — the lead session's own work, one row per
  agent (or inseparable agent group) and one for the person's effort. **Each description states only the work done** — never who did it (no
  “the person”, “lead session”, “agent”, names); the Contributor column carries the name.
- **Contributor** is one of the project's two members: **Zarrabi** (GitHub `AliZarrabi`) or **Hasan Nejad** (GitHub
  `mohsen-1984`), taken from the GitHub account the work was done under. Session and agent rows belong to the member
  who ran the session.
- **Commits**: every commit message begins with the contributor's name — `Zarrabi: …` or `Hasan Nejad: …` — and
  carries no co-author trailer.
- **Automation** (rules in [`CLAUDE.md`](../CLAUDE.md) → Automation): every commit must add its rows here — the
  `.githooks/pre-commit` hook refuses one that does not, and `.githooks/commit-msg` adds the name prefix and removes
  co-author lines (git is pointed at `.githooks` automatically at the start of each Claude Code session; elsewhere run
  `git config core.hooksPath .githooks` once). Workload figures come from `node .claude/scripts/workload.mjs`. The
  totals line below is generated — do not edit it.
- **Workload** is defined in the collapsible section below. `—` = no logs exist for that work, so no figure is
  recorded.

<details>
<summary><strong>⏱ How <em>Workload</em> is calculated</strong> (rules — click to expand)</summary>

*Portable section — the same text is used in every project, so figures are comparable across projects.*

**A. What is recorded**

1. **Workload** is all the time spent working on the project, in minutes: studying and investigating a problem,
   weighing options, reviewing and testing work, and implementing changes — not implementation alone. It has an
   **AI part** (Claude Code sessions and their agents) and a **human part** (the person, or anyone else working on the
   project); both are project work and both count in the totals. **Work on this log itself is not recorded** — measuring
   workload, writing or restructuring `docs/ContributeLog.md`, and its tooling (`contributelog.mjs`, `workload.mjs`); a
   commit that changes only those files needs no row.
2. **One row per contributor.** A change is recorded as several rows: one for the lead session's own work, one for
   each agent with an independent scope (one QA agent per design concept, one fix agent per area, …) and one for the
   person's effort.
3. Several agents share a row **only** when their work cannot be told apart from a business point of view — forks
   splitting one task, or a group of verifiers checking one list.
4. The **Contributor** column names the project member the row's work belongs to; the description states only the
   work itself, without naming the person, the session or an agent.
5. **Totals** — number of rows, overall minutes and hours, and the minutes and rows per contributor — sit at the end of the
   table (generated).

**B. AI time — from the session logs, reproducible**

6. Sources: the main session's log `~/.claude/projects/<project>/<session>.jsonl` and each agent's own log
   `~/.claude/projects/<project>/<session>/subagents/agent-<id>.jsonl`; every log is measured on its own.
7. In each log, the gaps *g* between consecutive events are added up:

   ```
   AI(row) = Σ over the row's logs  Σ over their gaps g  c(g)

            ⎧ g       if g ≤ 5 min                                  (working)
   c(g) =   ⎨ g       if g > 5 min while the log waits for a run it started itself —
            ⎪         a command, build, test suite or browser sweep — and the gap ends with that run's result
            ⎩ 5 min   any other longer gap: waiting for a person, a freeze or crash, a usage limit,
                      a session that exited, a run that never returned
   ```
8. **Parallel work adds up**: five agents working 20 minutes at the same time count 100 minutes, not 20.
9. **No double counting**: a session waiting for its agents counts at most 5 minutes per gap (the agents' time is in
   their own rows); a fork counts only its own events, not the history it copied from its parent.
10. A session that covers several changes is split at the commits that end each change.
11. A progress or expiry notice from a monitoring tool does not end a wait; only the run's own result does.

**C. Human time — proposed, then confirmed**

12. Only the time in which Claude **waits for the person** counts: after a question, or after a file or page was
    handed over for review — from the end of that turn to the person's next message (an answer to a question or a
    plan approval included).
13. It **never overlaps AI work**: any part of the interval during which an agent or a background task was still
    working is subtracted (a dev server left running for the person's own test does not count as working). Claude's
    own working time is never attributed to the person, and a stop caused by a usage limit or an expired sign-in is
    not a wait for the person.
14. Each interval counts at most **15 minutes**.
15. Claude **proposes** the figure and shows how it was derived; the person **confirms or adjusts** it; only the
    confirmed figure is final.
16. Extra work the person reports — done after an approval, between sessions or in parallel — is added as stated.

**D. Scope**

17. The rules apply to every project. Kelk's copy has no report-generation section and adds the Contributor column
    (owner's instructions, 1405-08-10).
18. A project that adopts them recomputes its whole history from the first row.
19. Every date is Solar Hijri (Shamsi), `YYYY-MM-DD`, in every table and document; Persian pages use Persian digits.

*This project:* Kelk adopted these rules on 1405-08-10 and its whole history is computed under them. Rows before the
review session of 1405-08-09 — versions 1.0 and 1.5, the "Add files via upload" commits and the development of
2.0-rc1 — have no session logs here; they are recorded without a measured figure (`—`, no logs).

</details>

| Date | Version | Contributor | Workload (min) | Change |
|---|---|---|--:|---|
| 1405-07-06 | 1.0 | Hasan Nejad | — | First upload of Kelk to GitHub through the web uploader (`a2a7075`, 87 files: the page, `lib/` builders, fonts, vendor libraries, `LICENSE`, `README.md`, `TODO.md`, `THIRD-PARTY-NOTICES.md`), then the README rewritten with an Arabic screenshot and the about documents extended (`05a4b08`, tag `v1.0`). No logs. |
| 1405-07-06 | 1.0 | Hasan Nejad | — | 1.0 follow-ups: import naming and settings in the page (`349d49d`: `importer.js`, `main.js`, `names.js`), MarkdownImporter extended and a PdfBuilder fix (`668d18c`, 1405-07-07, the CHANGELOG's 1.0 date); no logs. |
| 1405-07-11 | 1.5 | Hasan Nejad | — | Release 1.5 in four uploads (`184b4f7`, `8d9c534`, `0fdc3f6`, `94f0c31` = tag `v1.5`): LaTeX formulas with a local MathJax 4.1.3 (Word equations in .docx / .doc, vectors in PDF), table styles, code and quote colours, the regrouped Settings pane, `PreviewBuilder`, `CHANGELOG.md` started, samples §6.5, og-image, math screenshots and test pages; no logs. |
| 1405-07-14 | 1.5 | Hasan Nejad | — | Untagged follow-up (`e340112`): MarkdownImporter (+161 lines), DocxBuilder and WordHtmlBuilder changes, a new action in `main.js` with its strings and style, about documents touched; no logs. |
| 1405-07-18 | 1.5 | Hasan Nejad | — | README, icons, og-image and every screenshot refreshed (`adec97d`); no logs. |
| 1405-07-24 | 1.5 | Hasan Nejad | — | Downloadable Vazirmatn + Sahel TTF zip for Word, WordHtmlBuilder (+234) and DocxBuilder (+263) changes, settings, storage, exporter and i18n additions — 25 files (`4beee81`); no logs. |
| 1405-07-24 → 1405-08-09 | 2.0-rc1 | Hasan Nejad | — | Development of 2.0-rc1 outside git: the PDF importer (`lib/PdfImporter.js`, `lib/pdfimport/`, `lib/PDFIMPORT.md`), the PDF lab (`tests/pdf-lab/`: 144 PDFs from 49 producer variants, fuzz splits, metamorphic net, gate, CI workflow), formulas through PDF, multi-file and zip import, the progress dialog; committed in `d5409f1` below. No logs here. |
| 1405-08-09 | 1.5 | Zarrabi | 17 | Review of the 1.5 follow-up `4beee81`: read the Word-output changes, reported the findings and estimated PDF import at 1.5–2 weeks. |
| 1405-08-09 | 1.5 | Zarrabi | 25 | Reading the review's findings and estimate, then replacing the working tree with the 2.0-rc1 code. |
| 1405-08-09 | 2.0-rc1 | Zarrabi | 79 | Review & redesign plan: read the PDF importer and its lab against the three concepts set for the review (self-calibration, metamorphic testing, graceful degradation), the held-out question and the Persian regressions; ran the 144-PDF corpus on Windows (Playwright build workaround) — mean 95.7, RTL 90.1 — and found the blind gate (2 of 144 in `baseline.json`), the English-only held-out set and `fa-features` quote 0 on all four producers; merged the four reviews below; researched the PDF → Markdown landscape; settled the decisions (optional ML, OCR late, dev tooling only, one plan file, execution deferred); wrote the plan (now `.claude/plans/Kelk-Redesign.md`) and `docs/reports/corpus-run-1405-08-09.json`; committed the 2.0 tree with the workflow and the 144 lab PDFs as `d5409f1` "Kelk 2.0-rc1: PDF import, test lab, overhaul plan" (356 files) on the local branch that became the fork branch `AliZarrabi/overhaul/2.0`. |
| 1405-08-09 | 2.0-rc1 | Zarrabi | 11 | Review of the application layer: `index.html`, `scripts/*.js`, `styles/*.css` and the about documents — architecture and module coupling, the settings-migration bug, preview performance, main-thread blocking, sanitising, i18n and accessibility, with file:line evidence. |
| 1405-08-09 | 2.0-rc1 | Zarrabi | 20 | Review of the builder libraries: `lib/` without the PDF importer (BuilderBase, the four builders, PreviewBuilder, BidiCore / BidiView, MathCore, ImageCore, MarkdownImporter, `lib/README.md`, `LATEX.md`) and the builder test pages — duplication across builders, PdfBuilder shaping and bugs (B1–B8), test gaps. |
| 1405-08-09 | 2.0-rc1 | Zarrabi | 20 | Review of infrastructure, tooling, release and docs: the CI workflow, `tools/`, the lab harness mechanics (`env.js`, runners, `gate.js`, `baseline.json`, fuzz and meta generators), README / CHANGELOG / TODO / notices, assets, sizes, release and Pages, supply chain. |
| 1405-08-09 | 2.0-rc1 | Zarrabi | 5 | Designed the phased redesign plan (phases, sub-phases, acceptance criteria, efforts, dependencies) from the collected findings and the fixed decisions. |
| 1405-08-09 | 2.0-rc1 | Zarrabi | 1 | Answering the planning questions, reviewing and accepting the plan (waiting that overlapped other running work is not counted, rule 13). |
| 1405-08-09 → 1405-08-10 | 2.0-rc1 | Zarrabi | 14 | PR #1 preparation: wrote the PR description, saved it as `docs/reports/PR-overhaul-2.0.md` (never committed), and wrote the continuation prompt for a fresh session. |
| 1405-08-09 → 1405-08-10 | 2.0-rc1 | Zarrabi | 23 | Reviewing the push, the PR text and its file; pushing, opening PR #1 and merging it into `main` on 1405-08-10 (`db323e1`). |
| 1405-08-10 | 2.0-rc1 | Zarrabi | 10 | P0.1 preparation: read the plan, checked the repository state and inspected both CI runs (green, but one compared against the blind baseline and the other against 1.5 behind `\|\| true`); found that `overhaul/2.0` had already been merged into `main` through PR #1 and that the 144 lab PDFs are already in history as ordinary files (one CRLF file found); wrote the P0.1 checklist and the PDF-storage options, and asked about the branch, P0.0 and the CI artifact. |
| 1405-08-10 | 2.0-rc1 | Zarrabi | 20 | Reading the P0.1 findings and writing the next instructions. |
| 1405-08-10 | 2.0-rc1 | Zarrabi | 50 | Restructuring: plan moved to `.claude/plans/Kelk-Redesign.md` with "overhaul" → "redesign" throughout, its links repointed, P0.0 marked approved; the report-generation sections and other projects’ references removed from the docs and the `.claude/` configuration; the imported `.claude/` folder reviewed and configured (local settings with a foreign credential deleted, broken hook entries and build leftovers removed); `CLAUDE.md` with the permanent project rules; commit hooks for the contributor prefix without co-author lines; history rewritten without the co-author line (`d5409f1` → `8229e6d`, merge → `0a2b161`, force-pushed) and the fork branch deleted; GitHub CLI installed. Work on this log itself is not counted (rule 1). The rename of the repository and folder to Kelk is pending. |
| 1405-08-10 | 2.0-rc1 | Zarrabi | 33 | Reviewing each restructuring result, writing the next requests and answering the decisions. |
| 1405-08-10 | 2.0-rc1 | Zarrabi | 11 | Portability: rule that everything the work depends on is committed to the repository, the checklist rule moved into `CLAUDE.md`, commit attribution turned off in `.claude/settings.json`, `Claude-Session` lines stripped by the commit hook, the contributor recognised from the GitHub noreply address, machine prerequisites listed in Getting Started. |
| 1405-08-10 | 2.0-rc1 | Zarrabi | 3 | Research of the current documentation on cloud and Desktop sessions: which parts of the repository setup (`CLAUDE.md`, hooks, skills, settings) apply there and what differs. |
| 1405-08-10 | 2.0-rc1 | Zarrabi | 5 | Reviewing the portability changes and the findings on cloud sessions. |
| 1405-08-10 | 2.0-rc1 | Zarrabi | 4 | Checking the merge of PR #2 into `main` and writing the brief for continuing the plan in a new session. |
| 1405-08-10 | 2.0-rc1 | Zarrabi | 33 | P0.1 Git hygiene: checklist; `.gitattributes` (`* text=auto eol=lf`, `binary` rules), `.gitignore` (`tests/pdf-lab/real/`, `private/`, `node_modules/`), `.editorconfig` matched to the tree's style; the CRLF license file renormalised; working tree converted to LF and the corpus re-run (Markdown byte-identical); Known Issues, Windows lab note and refresh step updated; report `docs/reports/P0.1-git-hygiene.md`; PDF storage decision applied to the plan, tracker and lab README. |
| 1405-08-10 | 2.0-rc1 | Zarrabi | 14 | Lab setup on Windows: Playwright 1.56.1 (the CI pin) and pdf-lib installed outside the repository, the stalled Chromium headless-shell install completed by hand; corpus run before the change: 144 files, 95.73 / RTL 90.08, equal to the baseline. |
| 1405-08-10 | 2.0-rc1 | Zarrabi | 1 | Comparison of lab-PDF storage options (ordinary files, Git LFS, release asset): pack size, churn, CI and contributor cost, LFS quota; recommendation and revisit thresholds. |
| 1405-08-10 | 2.0-rc1 | Zarrabi | 2 | Fresh-clone acceptance test of P0.1: two clone variants checked for status, line endings, binary attributes and ignores; corpus run equal to the baseline in both. |
| 1405-08-10 | 2.0-rc1 | Zarrabi | 7 | Reviewing the P0.1 checklist and report, the Playwright question, and approving P0.1 with the PDF storage decision. |
| 1405-08-10 | 2.0-rc1 | Zarrabi | 14 | P0.2 Baseline rebuilt, gate guarded: checklist; candidate baselines tried with `--baseline`; fixes from the review of `gate.js` (`--partial` without a baseline refused, "no longer scored" failure, run-import naming, `--k=v`, exit 2); Known Issues (Windows harness gaps, ZWNJ rule on wkhtmltopdf Persian); report `docs/reports/P0.2-baseline-gate.md`; on approval `baseline.json` rewritten with all 144 corpus files (fuzz and meta kept), plan and tracker updated. |
| 1405-08-10 | 2.0-rc1 | Zarrabi | 2 | `gate.js`: `--update` refuses a run lacking any lab PDF, `--partial` merge, `--baseline <file>`, `--update --against` refused, fuzz and meta kept from the old baseline, one note for many missing files; README "The gate"; tested on fake runs. |
| 1405-08-10 | 2.0-rc1 | Zarrabi | 4 | Full lab run on Windows: corpus identical to the baseline (95.73 / RTL 90.08); fuzz dev 95.76 and held-out 93.88 (all-Chromium, substituted fonts); 5 of 12 metamorphic transforms (no `qpdf`), identical to the baseline. |
| 1405-08-10 | 2.0-rc1 | Zarrabi | 3 | Deliberate-break test: both ZWNJ rules switched off on a throwaway worktree — 21 files fail on right-to-left details, gate exit 1; the narrow-space rule found to hurt wkhtmltopdf Persian. |
| 1405-08-10 | 2.0-rc1 | Zarrabi | 2 | Review of the `gate.js` change: name matching, merge semantics, CI paths byte-identical; two defects found. |
| 1405-08-10 | 2.0-rc1 | Zarrabi | 9 | Reviewing the P0.2 report and approving the baseline choice. |

<!-- generated:totals -->
**Entries: 36 · Total: 442 min (7.37 hours) — Zarrabi 442 min (29 rows), Hasan Nejad — (7 rows, no logs).** (7 rows without logs carry no figure.)
<!-- /generated:totals -->

---

## 📄 License

**MIT** — [`LICENSE`](../LICENSE), © 2026 mohsen-1984 (`lib/` carries its own copy, [`lib/LICENSE`](../lib/LICENSE)).
The vendored libraries and fonts keep their own licences ([`THIRD-PARTY-NOTICES.md`](../THIRD-PARTY-NOTICES.md)).
Vazirmatn, Vazir Code and Sahel are the work of the late Saber Rastikerdar — in his memory.
