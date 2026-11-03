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
| **Repository** | GitHub `mohsen-1984/Kelk` (being renamed from `mohsen-1984/kelk`; links in the root README and the Pages URL still read `kelk` until they are updated). Branch `main`; tags `v1.0`, `v1.5`. The 2.0-rc1 tree came in through [PR #1](https://github.com/mohsen-1984/Kelk/pull/1) from the fork branch `AliZarrabi/overhaul/2.0`, merged into `main` on 1405-08-10 (`db323e1`). Redesign work runs on branches `redesign/P<n>.<m>`, each merged into `main` through a pull request with a merge commit after its approval (P0.1–P0.4: PRs #3–#6, 1405-08-11). |
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
| Node.js | 22.22.2+ / 24.15+ / 26+ for the dev tooling (`engines` in `package.json` since P3.1: jsdom 30 is the narrowest of the dev dependencies, ESLint 10 needs 20.19+ / 22.13+ / 24+); 20+ for the lab alone (Playwright 1.64; CI uses 22) | Only for the dev tooling, the unit tests, the PDF lab and `tools/*.js`. Since P0.4 `package.json` pins the dev tools (Playwright, pdf-lib, ESLint, Prettier, JSZip; jsdom since P1.1); `npm ci` at the root installs them. |
| Playwright | 1.64.1 (the lockfile pin since P3.1; Chromium 156.0.8078.4, build 1248) + `pdf-lib` 1.17.1 | `npm ci` at the root installs it (or install it outside the repository and point `NODE_TOOLS` at its `node_modules`); then `npx playwright install chromium`. Where `cdn.playwright.dev` refuses the download (HTTP 403 "not available in your location"), take the same build from Google's Chrome-for-Testing host and unpack it into Playwright's cache: `https://storage.googleapis.com/chrome-for-testing-public/<version>/win64/chrome-win64.zip` → `%LOCALAPPDATA%\ms-playwright\chromium-<build>\` and `…/chrome-headless-shell-win64.zip` → `…\chromium_headless_shell-<build>\`, plus an empty `INSTALLATION_COMPLETE` file in each (version and build are the ones `npx playwright install` prints). A failed `playwright install` also deletes the browsers no installed Playwright uses. |
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

# dev checks (after `npm ci` at the root; tooling.yml, builders.yml and site.yml run these in CI)
npm run lint                          # ESLint, 0 errors expected
npm run check:version                 # every version string against K.config.version
npm test                              # tests/unit: storage, exports, two tabs, security, i18n, builders (Node + jsdom)
npm run check:i18n                    # interface strings: missing / unused keys in fa, en, ar
npm run test:builders                 # the builder suite headless (roundtrip.js)
npm run check:links                   # lychee 0.24.2 on the PATH: relative links and anchors in *.md and index.html
npm run check:fresh                   # regenerate the three generated files, then git diff --exit-code
npm run check:a11y                    # axe-core on index.html, fa / en / ar × light / dark (Playwright)
npm run check:size                    # startup JS + CSS against tools/size-budget.json
npm run test:golden                   # golden snapshots (tests/golden/); test:golden:update rewrites them — review the git diff
npm run test:docx                     # DOCX: package + OOXML XSD (xmllint) + LibreOffice → PDF; --no-xmllint / --no-soffice without the tools
node tests/unit/csp-browser.js        # the CSP in Chromium on file:// and http (Playwright; not in CI)

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
# once, at the repository root (package.json pins the versions; node_modules/ is git-ignored)
npm ci && npx playwright install chromium
# or, as before, in a folder outside the repository, then NODE_TOOLS as below
npm install playwright@1.64.1 pdf-lib@1.17.1 && npx playwright install chromium
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
P0.3 made the harness itself platform-neutral (1405-08-10); since P0.4 (1405-08-11) `package.json` pins Playwright
(1.56.1, 1.64.1 since P3.1) and the scripts find the root `node_modules` without `NODE_TOOLS`. The browser download itself is unchanged, so
the workaround above still applies when `npx playwright install` stalls (and the Chrome-for-Testing download in Prerequisites when the CDN refuses it).

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
| Settings & storage | `scripts/settings.js`, `storage.js`, `config.js` | Settings pane (grouped by subject), defaults, `localStorage` holding only the differences from the defaults; the profile carries `schemaVersion` and one `K.store.migrate()` brings an older one up to it; other tabs followed through the `storage` event (`main.js`). |
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
| Rendering Markdown | marked → **DOMPurify** → preview: `SANITIZE_NAMED_PROPS` (ids prefixed `user-content-`), `form` / `input` / `button` / `textarea` / `select` / `style` forbidden, task-list checkboxes rebuilt disabled, `rel="noopener noreferrer"` on links with a `target` (P1.2). | `scripts/preview.js` |
| Custom header / footer HTML | Sanitised by `K.preview.sanitize` after its fields are filled (P1.2). | `scripts/exporter.js` |
| HTML export | `HtmlBuilder.toHtml` parses into an inert document and `HtmlBuilder.defang` removes scripts, embedded pages, `on*`, `srcdoc` and script URLs (P1.2). | `lib/HtmlBuilder.js` |
| Content Security Policy | A `<meta>` CSP: `script-src 'self' 'wasm-unsafe-eval'` (no inline script anywhere; WebAssembly for pdf.js's image decoders), `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: blob: https: http:` (remote images in Markdown), `worker-src 'self' blob:`, `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`; measured on `file://` and http (P1.2, `tests/unit/csp-browser.js`). | `index.html` |
| Browser storage | `localStorage`: settings, the document, images as base64 data URIs — no credentials. | `scripts/storage.js`, `scripts/images.js:38-46` |
| PDF parsing | PDF.js 6.4.299 on a fake worker in the main thread; encrypted PDFs with a user password give a message only. | `scripts/config.js:134` |
| Third-party code | Vendored and pinned by file name; no checksums, SBOM or Dependabot (plan P8.3). | `vendor/`, `THIRD-PARTY-NOTICES.md` |
| CI | `pdf-lab.yml` runs with `permissions: contents: read`, a `concurrency:` group and actions pinned to commit SHAs (P0.3, 1405-08-10). | `.github/workflows/pdf-lab.yml` |
| Private test data | The owner's real PDFs are never committed (each pattern is rebuilt with our own text); no private data found in the lab PDFs (1405-08-09). `tests/pdf-lab/real/` and `private/` are git-ignored (P0.1). | `tests/pdf-lab/` |
| Local tooling | `.claude/settings.local.json` (personal permissions) is git-ignored; none is kept in the repository. | `.gitignore` |

---

## 🧪 Testing

### Current state (measured 1405-08-09 on the review machine, Windows, Playwright Chromium; CI green run 41333786984 on 1405-08-10)

| Check | Command | Result |
|---|---|---|
| PDF lab — corpus | `run-import.js` | **144 PDFs from 49 producer variants, 0 crashes, ≈ 15 s; mean total 95.7** (114 files ≥ 99, 19 < 90) — reproduces the CHANGELOG figure. Raw scores: [`docs/reports/corpus-run-1405-08-09.json`](reports/corpus-run-1405-08-09.json). |
| PDF lab — right-to-left | (same run) | **55 RTL files: mean total 90.1**, `rtl` column 92.9. Weakest producers `lohtml-rtl` 59.0, `wk-rtl` 61.2, `chrome-rtl-plain-hf` 81.4, `kelkdocx-lo` 88.7. |
| PDF lab — style fuzz | `run-fuzz.js dev` / `heldout` | Since P2.1 (1405-08-11), **generator 4**: 100 dev + 100 held-out PDFs, 9 documents (4 RTL: `fa-article`, `fa-report`, `ar-article`, `fa-mixed`; 44 % RTL), Chromium 3 : wkhtmltopdf 1, dimensions + `dir`, RTL fonts (Vazirmatn, Sahel, Noto Naskh Arabic), `latinFont`, `digits` (`ascii` / `native` / `asis`), `tracking`; per-direction means and the `rtl` column printed, stored and gated (TOL 1). CI baseline (run 41507779260): **dev 86.0, held-out 86.9** (means only); LTR 93.0 / 91.9, RTL 77.1 / 80.6, `rtl` column 85.0 / 85.8. Generator 3 (English only, before): dev 96.0, held-out 94.6 — not comparable. |
| PDF lab — metamorphic net | `make-meta.js`, `run-meta.js` | Since P2.2 (1405-08-11): **24 seeds (11 RTL) × 20 transforms** (9 same, 9 near, 2 hard), 404 PDFs; "same" transforms asserted byte-identical (`run-meta.js` exits 1 outside `KNOWN`, under a listed floor, or on a crash; `make-meta.js` exits 1 on a file it cannot make); reference-free relations (word multiset, heading count, block count) stored. CI baseline (run 41509321814): 133 of 199 "same" files exact, 66 listed with floors. Largest losses: `rotate180` −83.0, `rotate90` −82.4, `noToUnicode` −81.0, `stamp` −32.7, `trackLoose` −12.2, `tz85` −9.2 — P3.3's order. Before: 12 transforms × 18 seeds, no assertion. |
| PDF lab — gate | `gate.js` | Since P0.2 (1405-08-10): `baseline.json` holds **all 144 corpus files** (55 with `rtl`), the clean run passes and a deliberate ZWNJ break fails 21 files; since 1405-08-11 its fuzz and meta parts come from the CI runner (run 41391608314: Chromium 141.0.7390.37, wkhtmltopdf 0.12.6, qpdf 11.9.0), so CI's fallback path compares fuzz too (until then the review machine's Chromium 153, never compared). Before: 2 of 144 files, "passed" while checking nothing. |
| CI | `.github/workflows/pdf-lab.yml` | Since P0.3 (1405-08-10) failures fail the job (no `\|\| true`, `bash -euo pipefail`, logs in the artifact); without a base commit the gate falls back to `baseline.json` and says so in the step summary. Green run 41333786984 (`f6ea8e9`): corpus 95.7, fuzz dev 96.0, held-out 94.6 (means only), all 12 metamorphic transforms equal to the baseline, round trip ok (2 known cells), math 76 / 76, crash sweep 144 files / 0 errors, gate passed. The deliberate break (both ZWNJ rules off, run 41333855809) is **red** at the gate only: 40 failures (21 `rtl`, 19 total). Before: two green runs that proved nothing (`> /dev/null \|\| true`). |
| Builder suite | `tests/builder-suite.html`, headless `roundtrip.js` | Since P1.3 (1405-08-11): **70 cases, 473 cells pass, 3 known red** (`latex-formulas` / `-mathml` order 84.4 %, `shaping-no-forms-uncovered`); cases may carry `exact` (the PDF → MD cell needs 100 %) and `pdfCheck` (geometry on the PDF read with pdf.js). DOCX / DOC "pass" whenever a blob is produced (no XML validation, no goldens). In CI since P2.3 (`builders.yml`, and `roundtrip.js` in `pdf-lab.yml`). |
| Formulas | `tests/math-file.html`, `math-modes.html`, `math-roundtrip.js` | Browser pages, checked by eye; since P0.3 `math-roundtrip.js` exits 1 on a failed case (76 / 76 pass, 1405-08-10) and `roundtrip.js` on a red builder-suite cell outside its two-entry allow-list (404 pass). |
| Lint | `npm run lint` (`eslint.config.js`) | Since P0.4 (1405-08-11): **0 errors, 109 warnings** (107 since P1.4) (`no-useless-escape` 42, `no-unused-vars` 32, `no-useless-assignment` 18, `no-misleading-character-class` 7, `no-control-regex` 6, `no-sparse-arrays` 4); CI workflow `tooling.yml` on every push and PR. Prettier is configured (`.prettierrc`) but the tree is not formatted, so `npm run format:check` is not in CI. |
| Version | `npm run check:version` (`tools/check-version.js`) | 24 places checked against `K.config.version` (`scripts/config.js`): `package.json` (semver form), CHANGELOG heading, `BuilderBase.version`, the `lib/` headers and README download (release form `2.0`), `PdfImporter` its own `1.0`; in `tooling.yml`. |
| Commit messages | `npm run check:commits -- <base> <head>` (`tools/check-commits.js`) | Since P3.1 (1405-08-12): every commit of base..head, merges included, starts with `<Name>: ` for a name in `.claude/contributors.json` and carries no Claude co-author / "Generated with" / `Claude-Session` line (the rules `.githooks/commit-msg` applies locally); the commits of `origin/main~10..origin/main` pass. Job `commits` in `tooling.yml` on every pull request. |
| Unit tests | `npm test` (`tests/unit/`, Node's test runner + jsdom) | Since P1.1 (1405-08-11): **23 tests**, all pass — `storage.test.js` (14: a fresh profile keeps its choices across reloads, only differences stored, legacy profiles with and without markers, the ui/profile split, settings files, a newer schema read and written by an older tab, page settings) and `app.test.js` (9: `index.html` with all its scripts in jsdom — an HTML / MD export right after a keystroke contains it, the title follows a new first heading, the last keystrokes saved on `pagehide`, a second tab follows text, settings, images, logo, the file name, theme and layout, unsaved typing kept, a cleared storage written back, a settings file and Reset / Undo through the Settings pane). On the code before P1.1, 16 of the first 19 fail. Since P1.2: **31 tests** — `security.test.js` (8: hostile Markdown leaves the app's elements, styles and toasts intact; task-list checkboxes kept, other inputs removed; HTML / MD exports of hostile Markdown carry no script, handler or `javascript:`; custom header / footer sanitised; `HtmlBuilder.toHtml` writes no `on*` / script URL and does not parse into the app's document; `<a name>`, image maps and `<area>` follow the prefix; DOCX bookmark names stay distinct; `defang` removes SVG animation and XML `data:` links), the first 5 failing on the code before P1.2. Since P3.1: **106 tests** — `check-commits.test.js` (4: the contributor names from `.claude/contributors.json`, `<Name>: ` subjects including merge commits, ten bad subject forms, Claude co-author / "Generated with" / `Claude-Session` lines). Since P2.4: **102 tests** — `size.test.js` (4), `bidiview.test.js` (4), `preview-a11y.test.js` (1). Since P2.3: **93 tests** — `markdown-importer.test.js` (13: horizontal rules in cells, lists and text, a cell's own line breaks kept, the zip reader, the mammoth style map) and `docx-validate.test.js` (5: Markup Compatibility, xmllint confirmation per part, pictures). Since P1.4: **75 tests** — `i18n.test.js` (25: the table word and header dates in ar / fa / en, the strings once hard-coded follow the language, `boot.js` stored, first-visit, old-profile, throwing-storage and inherited-name cases and its place in `<head>` after the CSP, check-i18n exit codes, comments, template and non-literal keys). Since P1.3: **50 tests** — `shaping.test.js` (9: U+0649 forms, joining types from Unicode, the forms table complete for U+0620–077F, a letter joins only on the sides whose forms exist) and `builders.test.js` (10: one named-colour table, delayed revoke for the three `save()`s, the importer's URI filter). In `tooling.yml`. |
| Interface strings | `npm run check:i18n` (`tools/check-i18n.js`) | Since P1.4 (1405-08-11): fa / en / ar — missing, unused, placeholder-mismatched and non-literal keys (comments skipped; dynamic keys only from a documented allow-list); 278 keys, 0 / 0 / 0 / 0; in `tooling.yml`. |
| DOCX validation | `npm run test:docx` (`tests/docx-validate.js`) | Since P2.3 (1405-08-11): every corpus .docx (74) — package checks, 1,294 XML parts against ECMA-376 Transitional (`tests/ooxml-xsd/`, xmllint), every `word/media` picture decodable, content types checked; LibreOffice `--convert-to pdf` one process per file (exit 0, a new PDF over 1 KB, retried); empty allow-list (it found MathCore's duplicate `m:strikeBLTR`). In `builders.yml`. |
| Goldens | `npm run test:golden` (`tests/golden/run.js`, `--update` to rewrite) | Since P2.3 (1405-08-11): 73 cases × 5 snapshots (HTML export, DOCX XML, DOC parts, PDF → MD, DOCX → MD), normalised (random ids, dates, pictures as size + hash, fonts as hashes, the widths of right-to-left formulas, which Linux measures differently); shared sections checked against their hashes, `--update` all or nothing; deterministic across runs, time zones and locales; a difference prints a unified diff and fails `builders.yml`. Written after P1.3's builder fixes. |
| Links | `npm run check:links` (lychee 0.24.2, `lychee.toml`) | Since P2.4 (1405-08-11): every `*.md` and `index.html`, relative links and anchors offline (165 links, 0 errors); external URLs weekly and on a manual `online` run; exclusions with reasons. In `site.yml`. |
| Generated files | `npm run check:fresh` | Since P2.4: `assets/icons.js`, `docs/about-kelk-and-samples.js`, `tests/pdf-lab/corpus.js` regenerated, then `git diff --exit-code`; deterministic. In `site.yml`. |
| Accessibility | `npm run check:a11y` (`tools/check-a11y.js`, axe-core 4.14.0) | Since P2.4: WCAG 2.0 / 2.1 A + AA on `index.html` in fa / en / ar × light / dark, settings open and each dialog; 0 serious / critical, empty `tools/a11y-allow.json`; each run also fails on a page error, a wrong `lang` / `dir` / theme or a preview that did not render, and waits for every formula; 71 before the fixes. In `site.yml`. |
| Startup size | `npm run check:size` (`tools/check-size.js`) | Since P2.4: JS + CSS `index.html` loads at startup, 1,985,290 bytes in 43 files; budget 1,990,000 (`tools/size-budget.json`). In `site.yml`. |
| CSP (browser) | `node tests/unit/csp-browser.js` (Playwright) | Since P1.2 (1405-08-11): `file://` and `http://localhost` in Chromium 141 — 0 violations, an inline probe refused, MathJax, PDF / DOCX / DOC / HTML / MD exports and a PDF.js import all work. Not in CI. |
| Unit tests | `npm test` (`tests/unit/`, Node's test runner + jsdom) | Since P1.1 (1405-08-11): **23 tests**, all pass — `storage.test.js` (14: a fresh profile keeps its choices across reloads, only differences stored, legacy profiles with and without markers, the ui/profile split, settings files, a newer schema read and written by an older tab, page settings) and `app.test.js` (9: `index.html` with all its scripts in jsdom — an HTML / MD export right after a keystroke contains it, the title follows a new first heading, the last keystrokes saved on `pagehide`, a second tab follows text, settings, images, logo, the file name, theme and layout, unsaved typing kept, a cleared storage written back, a settings file and Reset / Undo through the Settings pane). On the code before P1.1, 16 of the first 19 fail. Since P1.2: **31 tests** — `security.test.js` (8: hostile Markdown leaves the app's elements, styles and toasts intact; task-list checkboxes kept, other inputs removed; HTML / MD exports of hostile Markdown carry no script, handler or `javascript:`; custom header / footer sanitised; `HtmlBuilder.toHtml` writes no `on*` / script URL and does not parse into the app's document; `<a name>`, image maps and `<area>` follow the prefix; DOCX bookmark names stay distinct; `defang` removes SVG animation and XML `data:` links), the first 5 failing on the code before P1.2. In `tooling.yml`. |
| CSP (browser) | `node tests/unit/csp-browser.js` (Playwright) | Since P1.2 (1405-08-11): `file://` and `http://localhost` in Chromium 141 — 0 violations, an inline probe refused, MathJax, PDF / DOCX / DOC / HTML / MD exports, a PDF.js import and its WebAssembly image decoders (JPEG 2000, JBIG2) all work. Not in CI. |

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

- **Gate first** (P0.2, done 1405-08-10): a full baseline of all 144 files with `rtl` per file, and `--update` refusing a partial run.
- **CI that can fail** (P0.3, done 1405-08-10): no `|| true`, `pipefail`, logs in the artifact, round trip and crash smoke added.
- **Persian in the held-out net** (P2.1): `fa-article`, `fa-report`, `ar-article` and a new `fa-mixed` in the fuzz
  generator, RTL fonts, digits and tracking dimensions; ≥ 40 % RTL.
- **Metamorphic net** (P2.2): ≥ 20 transforms, "same" transforms asserted byte-identical.
- **Builders in CI** (P2.3): DOCX validated (OOXML XSD + LibreOffice conversion), golden snapshots in `tests/golden/`,
  MarkdownImporter unit tests. App unit tests: `tests/unit/` exists since P1.1 (Node + jsdom; `appWindow()` in `helpers.js` loads the whole page) — new app fixes add their case there.
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
| 🟠 High | **Release zip made by hand**, no include list: a 2.0 zip would carry `tests/pdf-lab` (16 MB) and `.github/`. | — | P8.1: `tools/build-release.js` with an include list. |
| 🟠 High | README links `kelk_2.0.zip` under `releases/latest` → 404 (latest is v1.5; a prerelease is skipped by `latest`). | `README.md` | Link the tagged release (P8.1). |
| 🟡 Medium | Pages is a Jekyll branch deploy of the whole repo: no `.nojekyll`, no cache-busting on `lib/`, `scripts/`, `styles/`. | — | P8.1: Pages through Actions with the release set and hashed URLs. |
| ⚪ Low | Docs out of step: the lab described in four places, stale numbers ("106 PDFs", "27 producers"), metamorphic net stated as 15 seeds / 171 PDFs (actual 18 / 205), Noto Emoji version "—", hljs theme 11.11.1 vs JS 11.12.0; `PDFIMPORT.md` (155 KB) has no TOC. | `lib/PDFIMPORT.md`, `tests/pdf-lab/README.md`, `THIRD-PARTY-NOTICES.md` | P8.2: split the doc, generated TOC, `tools/check-docs.js`. |
| ⚪ Low | `npm audit`: 5 moderate advisories, all minimatch 10.2.6 inside ESLint 10 (GHSA-g3hv-75wg-m249, fixed only in 11.0.1+; dev tooling only, not shipped). No 10.x backport; ESLint 10.14 and @eslint/config-array 0.23.5 still require minimatch ^10, and 11.0.1 is younger than the 14-day rule (P3.1, 1405-08-12). | `package.json` | From 1405-08-19: `"overrides": { "minimatch": "11.0.1" }`, then `npm run lint` (a major past ESLint's range) and `npm audit` → 0. |
| ⚪ Low | `run-real.js` ignores `LAB_OUT`. | `tests/pdf-lab/scripts/run-real.js` | Honour `LAB_OUT` like the other runners. |
| ⚪ Low | `builders.yml` pins `libxml2-utils` and `libreoffice-writer-nogui` to their `noble-updates` versions; Ubuntu drops a superseded version, so the install step fails until the pin is bumped (it prints `apt-cache policy`) (P2.3, 1405-08-11). | `.github/workflows/builders.yml` | Bump the two `env:` values when it happens. |
| ⚪ Low | `.claude/skills/*/README.md` describe the skills' home repository: 15 links (`dist/` zips, sibling skills, that repository's README and `tools/`) do not resolve here; excluded in `lychee.toml` (P2.4, 1405-08-11). | `.claude/skills/` | Rewrite the READMEs for this repository, then drop the exclusion. |

### 🔒 Security

| Priority | Issue | Location | Suggestion |
|---|---|---|---|
| 🟡 Medium | Supply chain: vendor files pinned by name only (`6.4.299` repeated ×8, the marked file name ×14), no checksums, SBOM or Dependabot. (The CI workflow got `permissions:` and SHA-pinned actions in P0.3, 1405-08-10.) | `vendor/` | P8.3 vendor manifest with hashes. |
| 🟡 Medium | An inline `style` in Markdown can still overlay the preview pane (`position:fixed`; it stays inside the pane in Chromium) and fake content there; no script runs (found in P1.2, 1405-08-11). | `scripts/preview.js` | Drop `position` / `z-index` in a preview-only DOMPurify hook. |
| ⚪ Low | Builders other than HtmlBuilder still parse HTML into the live page (`BuilderBase.js:535`, `WordHtmlBuilder.js:610,738,743,1276`, `MathCore.js:511`); only matters for library use with unsanitised HTML — the app sanitises first (P1.2, 1405-08-11). | `lib/` | `BidiCore.inertRoot` as in B4 (P5.2). |
| ⚪ Low | The CSP is measured in Chromium only; `frame-ancestors` cannot be set by a `<meta>` (Pages sends no headers); the HTML export carries no CSP of its own; `csp-browser.js` is not in CI (P1.2, 1405-08-11). | `index.html`, `tests/unit/csp-browser.js` | A Firefox run; a `script-src 'none'` meta in the HTML export; a Chromium step in CI (P2.4). |

### 📄 PDF import

| Priority | Issue | Location | Suggestion |
|---|---|---|---|
| 🟠 High | LibreOffice-path RTL files: `brackets` 0 in every one (mirrored brackets — probably Vazirmatn's RTL bracket glyphs outside the cmap), lists 0–28, tables 0–42 (`lohtml-rtl` 59.0, `kelkdocx-lo` fa / ar 55–96). | `lib/pdfimport/extract.js`, `blocks.js` | Read brackets by outline; RTL list / table rules (P3, P4). |
| 🟡 Medium | wkhtmltopdf Persian: `zwnj` 0, `yehKaf` 53–68 — a broken ToUnicode in the PDF itself (`wk-rtl` 61.2). | `lib/pdfimport/extract.js` | Name the glyphs from the font's own cmap, as for Word's «ت → "». |
| 🟡 Medium | Chrome browser-default style loses `quote` and `code` in fa / ar while the text is perfect (`chrome-rtl-plain-hf--ar-article` 69.6 with `rtl` 100). | `lib/pdfimport/blocks.js` | Layout rules for unstyled RTL quotes and code. |
| 🟡 Medium | **Self-calibration is partial**: ≈ 390 size-relative thresholds beside ≈ 400 bare literals (6 pt, 12 pt, 1.1 em …); no threshold registry, no record of which rules fired, no confidence. The word-space rules are absolute (tz85 −11.4, trackLoose −16.3). | `lib/pdfimport/lines.js` (`lineWordGap` ≈ 241) and the other four files | P3.2 calibration object + registry + telemetry; P3.3 migration in metamorphic order. |
| 🟡 Medium | **Degradation measures but never repairs**: `r.quality` flags (`lostGlyphs`, `suspectSpaces`, `textInPictures`) have no fallback path; diagnostics reach the user as ≤ 4 transient toasts. | `lib/PdfImporter.js`, `scripts/importer.js:167-175` | P3.4 confidence and fallback ladder; P3.5 import report panel. |
| 🟡 Medium | Very long functions: `_pageBlocks` 910 lines, `_lines` 607, `_extractPage` 523, `_joinAcrossPages` 376, `_xyCut` 286, `_groupLines` 266. | `lib/pdfimport/order.js`, `lines.js`, `extract.js`, `blocks.js` | P3.1: split along the documented pipeline, `cmp.js` 0 diffs. |
| 🟡 Medium | No real Word / Excel / PowerPoint / Microsoft Print to PDF output in the lab — those producers are imitated glyph by glyph (risk: fitting the imitation). | `tests/pdf-lab/pdf/producers/` | P4.1: real-producer Persian corpus from the owner's Windows machine. |
| 🟡 Medium | The narrow-space → ZWNJ rule hurts wkhtmltopdf Persian: with it switched off, the three `wk-rtl--*` files gain `zwnj` 0 → 10–24 and `rtl` +3 to +7.5 (found by the P0.2 deliberate-break test, 1405-08-10). The Chrome zero-width-space rule (`extract.js:813`) and this one back each other up, so neither alone shows in the gate. | `lib/pdfimport/lines.js:489`, `extract.js:813` | Look at it with the wkhtmltopdf ToUnicode row above (P3.3 word-space batch). |
| ⚪ Low | Open import items of the backlog (rotated text, footnotes kept in place, rowspan, tables inside quotes, OCR …). | `TODO.md` → PDF import | Worked through the plan's phases; the full list stays in `TODO.md`. |
| 🟡 Medium | **RTL fuzz files score well below English ones** (generator 4, CI: RTL 77.1 dev / 80.6 held-out against LTR 93.0 / 91.9; tables 64 / 74, quotes 61 / 61 on RTL files; `rtl` column 85.0 / 85.8, `zwnj` weakest) and CSS `letter-spacing: loose` costs ≈ 15 points on English files (P2.1, 1405-08-11). | `lib/pdfimport/` | P3.3 (calibration, word-space batch first); the RTL fuzz baseline is P3.3's floor. |
| 🟡 Medium | Persian digits whose glyph is shared with the Arabic-Indic one (Times New Roman, Tahoma map ۱ and ١ to one glyph) come back as Arabic-Indic: the PDF's text is right (P2.1, 1405-08-11). | `lib/pdfimport/extract.js` | Prefer the document's own digit script when a glyph maps to both (P3). |
| ⚪ Low | Not verified whether wkhtmltopdf 0.12.6 honours the fuzz styles' `unicode-range` / `local()` faces (Latin in the RTL font, Noto Naskh not loaded in the ≈ 11 wkhtmltopdf RTL files per split) (P2.1, 1405-08-11). | `tests/pdf-lab/scripts/make-fuzz.js` | Read the font list of one `fz…-wk--fa-*.pdf` from a CI run. |
| 🟠 High | **The importer does not apply a page's `/Rotate`**: content drawn turned and set upright by `/Rotate` (Word landscape pages, upside-down scans) reads as turned text — meta `rotate90` −82.4, `rotate180` −83.0 on all 24 seeds (P2.2, 1405-08-11). | `lib/pdfimport/extract.js`, `lib/PdfImporter.js` | Apply the page rotation to the text matrix (P3.3, first in the metamorphic order). |
| 🟡 Medium | Found by the extended metamorphic net (P2.2, 1405-08-11): a diagonal watermark is read into the text (`stamp` −32.7); thresholds in points break under scaling (`scale80`: pptx-rtl −20, iText −8.3; drawn check boxes −5) and a scaled footer leaves the 12 % furniture band; `/ActualText` and list numbers lost when tags sit in object streams (`objstm` −14.6 / −3.0); an invisible copy plus fake bold doubles letters (`renderMode` −7.5); text outside the CropBox kept on one-page files; a one-page untagged Chrome header and footer stay as text. | `lib/pdfimport/` | P3.3 in the net's order; each file listed in `run-meta.js` `KNOWN` with its floor. |

### 🧩 Application (`scripts/`, `index.html`, `styles/`)

| Priority | Issue | Location | Suggestion |
|---|---|---|---|
| 🟠 High | ≈ 1.93 MB of JS / CSS parsed at startup, 1.44 MB of it unminified `lib/` that only import / export needs. | `index.html:564-581` | P5.1: lazy-load builders and importer (≤ 0.6 MB). |
| 🟡 Medium | PDF.js on a fake worker (main thread); builders synchronous, so Cancel cannot interrupt an export. | `scripts/config.js:134`, `exporter.js:172-189` | P5.1 real Worker on http(s); later async builders. |
| 🟡 Medium | Images as base64 in `localStorage` (≈ 5 MB quota); Clear survives only in the page's Undo history, not a reload. | `scripts/images.js`, `main.js:200-206` | P5.3 IndexedDB + recovery snapshots. |
| 🟡 Medium | Every render redoes marked + DOMPurify + hljs + MathJax; startup renders 3–4 times. | `scripts/preview.js:147-195` | Cache per block; render once at startup. |
| 🟡 Medium | Tab trap in the editor (WCAG 2.1.2); stats `aria-live` chatter. (The wrong-language flash: resolved in P1.4.) | `scripts/editor.js:142-146`, `index.html:111` | P5.4 a11y. |
| ⚪ Low | Missing: PWA, print CSS, find / replace, snapshots, export presets, reorder before a multi-file join, outline navigation, auto theme. | — | P5.3–P5.4. |
| ⚪ Low | Two tabs (since P1.1, 1405-08-11): two tabs typing within the same 600 ms autosave pause — the later save wins, and the other tab takes it once idle; a tab of an older Kelk version keeps a newer profile's other values but cannot read the ones it does not know. | `scripts/main.js` (storage listener), `editor.js` (`external`), `storage.js` (`set`) | P5.3 with IndexedDB and snapshots, if it matters in use. |
| ⚪ Low | `vendor/lucide.min_1.48.0.js` (444 KB) and a duplicate hljs CSS shipped unused. | `vendor/` | P5.1: drop them. |
| ⚪ Low | The stored side / stack layout is applied only after the scripts load (a class on `#workspace` in `<body>`), so it can flash (P1.4, 1405-08-11). | `scripts/main.js` | Set it from `boot.js` on `<html>` with a CSS rule, if it shows. |
| 🟡 Medium | Startup JS + CSS is 1.98 MB (1,985,290 bytes; budget 1,990,000 in `tools/size-budget.json`), above the plan's 1.93 MB measured at `585b0fb` (P2.4, 1405-08-11). | `index.html`, `tools/size-budget.json` | P5.1 lazy loading; the budget stops growth until then. |
| ⚪ Low | The HTML export's code keyword colour `#d73a49` on `#fcfcfc` is 4.45:1 (below AA): the export keeps HtmlBuilder's document colours (P2.4, 1405-08-11). (Wide display formulas: made keyboard-reachable in the P2.4 review fixes.) | `lib/HtmlBuilder.js` | P5.4. |
| ✅ Resolved 1405-08-11 | Found by P2.4: 71 serious / critical axe findings in the preview (code colours below 4.5:1 in both themes, unnamed task checkboxes, scrolling code blocks out of keyboard reach) and an empty link left by BidiView after a Latin link in RTL text (preview and HTML export). | `styles/preview.css`, `scripts/preview.js`, `lib/BidiView.js` | P2.4: fixed; `npm run check:a11y` 0 outside the allow-list in fa / en / ar × light / dark. |

### 📚 Builder libraries (`lib/`)

| Priority | Issue | Location | Suggestion |
|---|---|---|---|
| 🟡 Medium | **No shared intermediate model**: four builders each re-parse the HTML (≈ 8,050 LOC of renderers vs 2,485 shared); ≈ 150 LOC of helpers copied verbatim, `cssSafe` ×4, `_pagingLabels` ×4, ≈ 1,400 LOC of parallel per-feature code. | `lib/PdfBuilder.js:415-463` ≈ `DocxBuilder.js:308-358`, `WordHtmlBuilder.js:2111` | P5.2: `lib/DomUtil.js`, `walkBlocks`, goldens prove no output change. |
| 🟡 Medium | DocxBuilder relies on docx.js 9.7.1 internals inside silent try/catch; `markSectionRtl` runs only on detected RTL, not on `setDirection('rtl')`. | `lib/DocxBuilder.js:380,396,946` | Guard and test against the validator of P2.3. |
| ⚪ Low | `kelk:source` is never written, so the lossless Kelk → PDF → Kelk round trip waits (the importer already reads it). | `lib/PdfBuilder.js` | P5.5. |
| ⚪ Low | ؠ ػ ؼ ؾ ؿ ۺ ۻ ۼ (U+0620, 063B, 063C, 063E, 063F, 06FA–06FC) have no glyph in any bundled PDF font: not drawn, lost on a round trip (`shaping-no-forms-uncovered`, a known red cell in `roundtrip.js`). A single text line taller than a page in a table cell still overflows (warning only). (P1.3, 1405-08-11) | `lib/pdf-base64-ttf-fonts/`, `lib/PdfBuilder.js` | A fallback font when needed. |
| ✅ Resolved 1405-08-11 | Found by P2.3: a horizontal rule from a .docx leaked as `⟦KHR⟧` in lists and running text and broke a GFM table when inside a cell; MathCore wrote `m:strikeBLTR` twice for `\cancelto` (invalid OOXML). | `lib/MarkdownImporter.js`, `lib/MathCore.js` | P2.3: a rule in a cell becomes a line break, in a list it moves into the item before, inside text it is dropped; each strike flag written once in schema order. |
| ⚪ Low | DocxBuilder drops page breaks (the PDF breaks, HTML and DOC keep the CSS); internal links in a .docx come back from the importer as `#bm_<id>` and through a PDF are lost; a ToC read back from a PDF runs titles and page numbers together (P2.3, 1405-08-11). | `lib/DocxBuilder.js`, `lib/MarkdownImporter.js`, `lib/pdfimport/` | Seen in the goldens; P5.2 / P3. |
| ⚪ Low | LibreOffice 24.2.7 on Linux (headless) aborts (exit 134, `SfxBaseModel::impl_store … 0xc10`) while writing the PDF of the two corpus documents with a Word ToC field (`toc-ltr`, `toc-rtl`); both pass the OOXML schemas and LibreOffice 24.2.7.2 on Windows converts them; listed in `SOFFICE_KNOWN` in `tests/docx-validate.js` (P2.3, 1405-08-11). | `tests/docx-validate.js`, `lib/DocxBuilder.js` (ToC field) | Recheck when the LibreOffice pin moves; open the file in Word to rule out a DocxBuilder fault. |

### 🛠️ Claude Code tooling

No open issues.

<details>
<summary><strong>✅ Resolved</strong> (33) — click to expand</summary>

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
| ✅ Resolved 1405-08-10 | The lab harness was Linux-only (`'/opt/npm-tools/node_modules'`, `'file://' + path` ×30, `/usr/share/fonts`, `/` splits in `features.js`); on Windows `make-meta.js` crashed without `qpdf` and `make-fuzz.js` silently drew the wkhtmltopdf share with Chromium. | `tests/pdf-lab/scripts/` | P0.3: `env.fileUrl()` on `url.pathToFileURL`, `req()` with a clear install message, `features.js` labels built with `/`, a `dejavu()` font lookup in the Python generators; `make-meta.js` skips the qpdf transforms with a note, `make-fuzz.js` prints the substitution. Corpus, fuzz and meta outputs byte-identical. The generators still need their producers (LibreOffice, wkhtmltopdf, pandoc …) on `PATH`. |
| ✅ Resolved 1405-08-10 | **CI hid every failure**: base and head steps ended in `> /dev/null \|\| true`; both runs until then were green without proving anything. | `.github/workflows/pdf-lab.yml:53-64` | P0.3: workflow rewritten — no `\|\| true`, every step under `bash -euo pipefail` with its log teed into the artifact, head steps fail the job, round-trip / math / crash steps added. Green run 41333786984 (`f6ea8e9`); the same commit with both ZWNJ rules off (run 41333855809) failed at the gate with 40 failures (21 `rtl`, 19 total). |
| ✅ Resolved 1405-08-11 | `baseline.json` was made with Chromium 153 and Bitstream Type 1 fonts; CI has Playwright 1.56.1 (Chromium 141) and no such fonts, so the fuzz comparison on the no-base path is always skipped. | `tests/pdf-lab/baseline.json` | P0.3 approval step: fuzz and meta rebuilt on the CI runner (manual run 41391608314 with `baseline` ticked) and its `baseline-candidate` committed — fuzz env Chromium 141.0.7390.37 + wkhtmltopdf 0.12.6 (the runner does resolve the Bitstream `.pfb` fonts), meta qpdf 11.9.0, corpus identical (144 files). The fallback path now compares fuzz. |
| ✅ Resolved 1405-08-11 | Version strings in ≈ 8 places disagree (`2.0-rc1` / `2.0` / `1.0`). | `scripts/config.js:11` and ≈ 7 other places | P0.4: `K.config.version` is the one source; the "disagreement" is three fixed forms (full `2.0-rc1`, npm `2.0.0-rc1`, release `2.0` in the `lib/` headers and the download name) plus PdfImporter's own `1.0`. `tools/check-version.js` checks all 24 places (CI `tooling.yml`); the app sets `BuilderBase.version` from the config at load. |
| ✅ Resolved 1405-08-11 | No `package.json`, lockfile, ESLint or Prettier. | root | P0.4: `package.json` + `package-lock.json` (exact pins: Playwright 1.56.1, pdf-lib 1.17.1, ESLint 10.13.0, Prettier 3.9.10, JSZip 3.10.2), `eslint.config.js` (0 errors), `.prettierrc` / `.prettierignore` matching `.editorconfig` (the tree is not reformatted); CI installs with `npm ci`. |
| ✅ Resolved 1405-08-11 | **Settings migrations ran against fresh profiles**: the one-shot markers (`_auto`, `_vch`, `_vz`, `_auto2`, `_hfauto`, `_lh`) were not in the defaults, so a fresh profile's own choices (DejaVu Sans Mono, Sahel, 98 %, `rtl`, 110 %, Calibri, an emptied title or edition) were "migrated" on the next reload; the stored profile was the whole merge of the defaults (old defaults frozen); `settings.js` repeated part of it for settings files. | `scripts/storage.js`, `config.js`, `settings.js` | P1.1: `schemaVersion: 1` in `K.config.defaults`; profile and page settings stored as their differences from the defaults; one `K.store.migrate()` for the stored profile at load, a settings file and Undo of Reset — its steps run only below schemaVersion 1, the markers are dropped. `tests/unit/storage.test.js`. |
| ✅ Resolved 1405-08-11 | **Exports could read stale preview HTML**: the preview renders 250 ms after typing, the exporter read it at once (the last keystroke, a changed first heading in the file name, were missing). | `scripts/exporter.js`, `editor.js`, `preview.js` | P1.1: one preview timer (`K.preview.renderSoon`), `K.preview.flush()` before every export and Copy. `tests/unit/app.test.js`. |
| ✅ Resolved 1405-08-11 | No `storage` event: a second tab wrote back the text it showed before, and its next image save dropped the other tab's images; the last keystrokes of the 600 ms autosave pause were lost when the tab closed. | `scripts/main.js`, `editor.js`, `images.js` | P1.1: a `storage` listener — text taken as one Undo step unless this tab holds unsaved typing, images merged, profile, logo and page settings (language, theme, layout, the imported file's name) followed, a cleared storage written back from this tab; autosave written on `pagehide` and when the tab hides. `tests/unit/app.test.js`. |
| ✅ Resolved 1405-08-11 | Preview DOMPurify config kept `id` / `style` / `form` / `input`: Markdown such as `<div id="toasts">` hijacked app elements and a `<style>` restyled the app. | `scripts/preview.js` | P1.2: `SANITIZE_NAMED_PROPS` (ids become `user-content-…`, the document's own `#links` follow), `FORBID_TAGS` `form` `input` `button` `textarea` `select` `style`; task-list checkboxes rebuilt disabled; `tests/unit/security.test.js`. |
| ✅ Resolved 1405-08-11 | Custom header / footer HTML was never sanitised. | `scripts/exporter.js` | P1.2: through `K.preview.sanitize` after the fields are filled; the shipped fa / en / ar samples come out unchanged. |
| ✅ Resolved 1405-08-11 | **B4** — `HtmlBuilder.toHtml` parsed into a live element; `on*` attributes passed through. | `lib/HtmlBuilder.js` | P1.2: an inert document (`BidiCore.inertRoot`) and `HtmlBuilder.defang` (scripts, embedded pages, `on*`, `srcdoc`, script URLs); an ordinary HTML export is byte-identical. |
| ✅ Resolved 1405-08-11 | **B1** — the Arabic shaping table mapped U+0649 initial / medial to U+0488 / U+0489 (Cyrillic marks); letters without presentation forms (U+0620, 063B–063F, 066E / F, 06D5, 06FA–FC, also ڵ ۂ ۄ ۮ ۯ) did not join their neighbours. | `lib/PdfBuilder.js` | P1.3: FBE8 / FBE9; joining types from Unicode `ArabicShaping.txt`; letters with no forms (none exist in Unicode for them) keep their glyph and are joined. `tests/unit/shaping.test.js`; round-trip case `shaping-alef-maksura` 61.5 % → 100 %. |
| ✅ Resolved 1405-08-11 | **B2** — PDF tables ignored `rowspan` when assigning columns, so text disagreed with the lines. | `lib/PdfBuilder.js`, `BuilderBase.js` | P1.3: columns from `_tableStyleGrid` (now returning `cols`); spanning cells drawn once at their rows' height; joined rows kept together. Cases `table-rowspan-ltr` / `-colspan` / `-rtl` with a PDF geometry check (`pdfCheck`). |
| ✅ Resolved 1405-08-11 | **B3** — a table row taller than a page overflowed. | `lib/PdfBuilder.js` | P1.3: the row (or rowspan group) is split, each cell at its own last line that fits (a row edge if one is near), cells closed, header repeated; `rowspan="0"` spans to the end of its section. Cases `table-tall-row`, `table-tall-rowspan-rtl`, `table-tall-misaligned`, `table-rowspan-zero`. |
| ✅ Resolved 1405-08-11 | **B5** — the builder suite never loaded `dejavu-sans-mono`, so three cases passed on a fallback font. | `tests/builder-suite.html` | P1.3: both font files loaded; `code-mono`, `code-mono-docfont`, `nested-fence-frames` now embed DejaVu Sans Mono (before: Courier) and pass. |
| ✅ Resolved 1405-08-11 | **B6** three divergent named-colour tables (DocxBuilder 19, PdfBuilder 14, BidiCore 20 names) · **B7** blob URL revoked right after `click()` (DOCX, DOC) · **B8** dead `data:image` branch in `ALLOWED_URI_REGEXP` · `hasMix` declared twice. | `lib/BuilderBase.js`, `DocxBuilder.js`, `WordHtmlBuilder.js`, `MarkdownImporter.js` | P1.3: one `BuilderBase.NAMED_COLORS` (148 CSS names + `windowtext`) via `BuilderBase.colorHex` (PDF / DOCX also read `rgb()` and every name now); `BuilderBase.downloadBlob` revokes after 4 s; the branch removed (it could never match); `hasMix` single since P0.4. `tests/unit/builders.test.js`. |
| ✅ Resolved 1405-08-11 | **`fa-features` scored quote 0 on all four producers** (Kelk, Chrome plain, GitHub-style, tagged; totals ≈ 85). | `tests/pdf-lab/scripts/score.js`, `lib/pdfimport/order.js`, `blocks.js` | P1.3, two causes: the scorer kept a soft line break's `>` inside a nested quote's key (no import could match; `softJoin`, no score of the old importer moves) and the nested-quote rules assumed left-to-right text (inner box / bar side, depth by x0, list continuation through a heading, quote gap below Vazirmatn's leading). Quote 100 on all four (totals 100 / 98.9 / 98.9 / 100), `chrome-rtl-plain-hf--fa-article` 71.2 → 85.5; corpus 95.7 → 96.2, `rtl` unchanged, fuzz +0.0. |
| ✅ Resolved 1405-08-11 | The Arabic UI got "Table" in nested-table references (the row said «جدول»; the code chose `fa ? 'جدول' : 'Table'`) and Persian dates in custom headers. | `scripts/importer.js`, `exporter.js` | P1.4: `K.i18n.t('tableLabel')`; `K.i18n.dateLocale(dir)` — RTL in the Arabic UI `ar-u-nu-latn`, other RTL `fa-IR-u-nu-latn`, LTR `en-GB`. `tests/unit/i18n.test.js`. |
| ✅ Resolved 1405-08-11 | ≈ 10 hard-coded English strings; 9 unused i18n keys. | `scripts/` | P1.4: 9 strings through `K.i18n` (table word, size unit, language group label, load errors, page-list separator, logo `alt`), 9 keys removed; `tools/check-i18n.js` (`npm run check:i18n`: 278 keys × 3, 0 missing / 0 unused / 0 placeholder mismatches) in `tooling.yml`. |
| ✅ Resolved 1405-08-11 | Wrong-language / theme flash: `<html lang="fa" dir="rtl">` hard-coded, the stored language and theme applied only after ≈ 40 scripts. | `index.html`, `scripts/boot.js` | P1.4: `scripts/boot.js` early in `<head>` (external, allowed by the CSP) sets `lang` / `dir` / `data-theme` from `kelk.ui` before first paint; checked at `<body>` creation in fa / en / ar, light / dark. |
| ✅ Resolved 1405-08-11 | No Content Security Policy; `target=_blank` links without `rel`. | `index.html` | P1.2: a `<meta>` CSP (`script-src 'self' 'wasm-unsafe-eval'`; `style-src 'self' 'unsafe-inline'`; `img-src 'self' data: blob: https: http:`; `worker-src 'self' blob:`; `object-src 'none'`; `base-uri 'self'`; `form-action 'none'`): 0 violations on `file://` and `http://localhost` in Chromium 141 with MathJax, PDF.js and all five exports (`tests/unit/csp-browser.js`); `rel="noopener noreferrer"` on every link with a `target`. |
| ✅ Resolved 1405-08-11 | **The held-out set had no Persian**: five English documents; "dev 96.0 / held-out 94.6" said nothing about Persian. | `tests/pdf-lab/scripts/make-fuzz.js` | P2.1: generator 4 adds `fa-article`, `fa-report`, `ar-article` and a new `fa-mixed` (44 % RTL in each split), RTL fonts, `digits`, `tracking`; per-direction and `rtl` means stored and gated; baseline from the CI runner (run 41507779260): dev 86.0 / held-out 86.9, RTL files 77.1 / 80.6. |
| ✅ Resolved 1405-08-11 | DOCX / DOC tests "passed" whenever a blob was produced; MarkdownImporter essentially untested. | `tests/`, `lib/` | P2.3: every .docx validated against the ECMA-376 Transitional schemas (xmllint) and converted by LibreOffice; goldens for HTML, DOCX XML, DOC, PDF → MD and DOCX → MD of every corpus case; 11 MarkdownImporter unit tests; all in CI `builders.yml`. (The ≈ 11 empty `catch` blocks remain.) |
| ✅ Resolved 1405-08-11 | Not in CI: the builder suite, link check, a11y, bundle size, generated-files freshness. | `.github/workflows/` | P2.3 `builders.yml` (builder suite, DOCX validation, goldens); P2.4 `site.yml` (lychee links, axe-core fa / en / ar, startup size budget, generated-files freshness). Struct / features runs stay manual. |

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
| 1405-08-09 | [Kelk 2.0 → 2.x Redesign Plan](../.claude/plans/Kelk-Redesign.md) | Zarrabi | **Status:** accepted by the project owner on 1405-08-09; execution started — P0.0, P0.1, P0.2 and P0.3 approved 1405-08-10, P0.4, P1.1 and P1.2–P2.4 approved 1405-08-11 (P1.2–P2.4 merged 1405-08-12). Structural changes, not a rewrite: the rule-based PDF importer and its lab are the asset, and the weaknesses found in the review are fixable in place, each step gated by the lab. 8 phases / 31 sub-phases, ≈ 76 working days plus the owner's review — **P0** stabilise and commit · **P1** verified bugs · **P2** test-net completeness · **P3** importer structure, calibration, degradation · **P4** generalisation with real producers and golden-50 · **P5** app and libraries · **P6** optional ML second opinion · **P7** OCR for scans · **P8** release and docs. P0.1 Git hygiene approved 1405-08-10 (LF everywhere, lab PDFs kept as ordinary `binary` files). P0.2 approved 1405-08-10 (gate guarded, 144-file corpus baseline; fuzz and meta kept until P0.3 rebuilds them in CI). P0.3 approved 1405-08-10 (CI green and a deliberate ZWNJ break turns it red); its last step done 1405-08-11: the fuzz and meta parts of `baseline.json` rebuilt on the CI runner (manual run 41391608314 with `baseline` ticked; Chromium 141, wkhtmltopdf 0.12.6, qpdf 11.9.0; corpus unchanged), so CI's fallback path compares fuzz too. P0.4 approved 1405-08-11 (`package.json` + lockfile with exact pins, ESLint 0 errors, Prettier configured without reformatting, `tools/check-version.js` — one source `K.config.version` — and lint in CI `tooling.yml`, green runs 41421784781 / 41421784696). P0.1–P0.4 merged into `main` 1405-08-11 (PRs #3–#6, merge commits; `main` at `cbacc0a`). P1.1 Storage & export correctness approved 1405-08-11 and merged into `main` (PR #7, merge commit `fc2fd52`; profile stored as differences with `schemaVersion` and one `migrate()`, `K.preview.flush()` before every export, a `storage` listener for two tabs, first unit tests in `tests/unit/`; `main` green after the merge: tooling 41494645319, pdf-lab 41494645572, Pages 41494644682). **P1.2–P2.4** ran as one stacked batch (parallel agents, an independent review per sub-phase), approved 1405-08-11 and merged 1405-08-12 (PRs #8–#14, `main` at `bef9b24`, all CI green): CSP and sanitising, builder bugs B1–B8 and the `fa-features` quotes (corpus 95.7 → 96.2), i18n and `boot.js`, a generator-4 fuzz with 44 % RTL (dev 86.0 / held-out 86.9), a 20-transform metamorphic net (the importer ignores `/Rotate`: −82 / −83, first in P3.3), DOCX validation and goldens in CI (`builders.yml`), site quality jobs (`site.yml`). **Next: P3** — hand-over and prompt in `docs/Kelk-Redesign-Continue-P3.md`. Progress tracker: §5. |

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
| 1405-08-10 | 2.0-rc1 | Zarrabi | 21 | P0.3 CI first green run, first part: checklist; scope of the harness, script and workflow changes; integration and local checks of the three changes (corpus, fuzz and meta outputs byte-identical, round-trip 404 pass with the two-cell allow-list, math 76 / 76, crash smoke 144 files); fixes from the review; Known Issues (Linux-only harness resolved) and Testing figures; GitHub CLI sign-in checked; first commit and push for the CI run. |
| 1405-08-10 | 2.0-rc1 | Zarrabi | 6 | Platform-neutral lab harness: `env.fileUrl()` on `url.pathToFileURL` replacing `'file://' + path`, `req()` with an install message, `features.js` labels, `dejavu()` font lookup in the Python generators; `make-meta.js` skips the qpdf transforms with a note, `make-fuzz.js` prints the wkhtmltopdf substitution. |
| 1405-08-10 | 2.0-rc1 | Zarrabi | 5 | Exit codes for the CI smoke scripts: `roundtrip.js` with an allow-list of known red cells, `math-roundtrip.js` failing on a failed case, `run-crash.js` searching subfolders and writing to `LAB_OUT`. |
| 1405-08-10 | 2.0-rc1 | Zarrabi | 5 | CI workflow `pdf-lab.yml` rewritten: no `\|\| true`, `bash -euo pipefail`, logs into the artifact, `contents: read`, concurrency, SHA-pinned actions, npm and Playwright cache, round-trip, math and crash steps, gate fallback with a step summary, `baseline` dispatch input producing a baseline candidate; actionlint clean. |
| 1405-08-10 | 2.0-rc1 | Zarrabi | 5 | Review of the P0.3 diff before the push: harness, smoke scripts and workflow. |
| 1405-08-10 → 1405-08-11 | 2.0-rc1 | Zarrabi | 38 | P0.3 CI first green run, second part: green run 41333786984 watched (artifact and logs read, round-trip allow-list unchanged on Linux); deliberate ZWNJ break pushed on a temporary branch, run 41333855809 red at the gate only (40 failures), branch deleted; the earlier `main` run read as a reproducibility check; report `docs/reports/P0.3-ci-green.md`; on approval the plan, tracker and Known Issues updated; the manual baseline run refused by the token (HTTP 403, `actions=write`), the cause traced and the docs set to show it as still to do. |
| 1405-08-10 | 2.0-rc1 | Zarrabi | 1 | P0.3 approval in the plan and the report: tracker row, Summary, Status, done note, report status and acceptance. |
| 1405-08-10 | 2.0-rc1 | Zarrabi | 2 | P0.3 approval in Known Issues and Testing: "CI hides every failure" resolved, the "Not in CI" and supply-chain rows trimmed, the gate, CI and security rows given the green and red run figures. |
| 1405-08-10 | 2.0-rc1 | Zarrabi | 2 | P0.3 first part: questions and decisions before the CI rewrite (`f6ea8e9`). |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 18 | P0.3 last step, baseline rebuilt on the CI runner: manual `pdf-lab.yml` run 41391608314 with `baseline` ticked started through the GitHub API and watched to green; `baseline-candidate` checked (corpus identical, 144 files, every per-file entry equal; fuzz env Chromium 141.0.7390.37 + wkhtmltopdf 0.12.6; meta env qpdf 11.9.0) and committed as `tests/pdf-lab/baseline.json`; Node.js LTS installed on the second machine; plan Summary, tracker and §6 note, the P0.3 report, Known Issues (Chromium-153 baseline resolved) and the Testing gate row updated. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 17 | P0.3 CI check after the baseline commit: push run 41393422460 compared with the base commit (fuzz +0.0); manual run 41394135108 on the fallback path compared fuzz dev and held-out against the new baseline (+0.0, gate passed); the two run ids added to the P0.3 report. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 15 | Reviewing the P0.3 result and approving it; asking for P0.4 with parallel work. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 19 | P0.4 Dev tooling, single version: checklist and split of the work; `package.json` with exact pins (each ≥ 2 weeks old) and `package-lock.json`; integration (lint 0 errors, 24 version checks); review findings applied (`engines` to ESLint 10's range, match counts in `check-version.js`, HTML exclusion stated); ContributeLog prerequisites, lab setup, Testing and Known Issues; plan tracker; report `docs/reports/P0.4-dev-tooling.md`. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 2 | Version inventory and single source: 24 places in three forms plus PdfImporter's own `1.0`; `tools/check-version.js`; `BuilderBase.version` set from `K.config.version` at load. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 5 | `eslint.config.js`: file groups, explicit readonly cross-file globals, rule options with reasons; 0 errors, 109 warnings; the duplicate `hasMix` in `lib/BidiCore.js` removed. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 12 | `.prettierrc` / `.prettierignore` measured against the existing style (no reformatting); `pdf-lab.yml` on `npm ci` with lockfile-keyed caches; new `tooling.yml` (lint and version check on every push and PR); lab README install section; actionlint clean. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 5 | Review of the P0.4 diff: `npm ci` on Linux with npm 10 and 11, base-run module lookup, 15 mutations of the version check, load order of the version sync, the `hasMix` removal, lint coverage. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 9 | P0.4 first CI runs checked and recorded: `tooling` 41421784781 and `pdf-lab` 41421784696 green on `npm ci` (lint 0 errors, 24 version checks, Chromium 141.0.7390.37 from the lockfile, fuzz compared +0.0); the `minimatch` advisory in ESLint's dependencies assessed; a hand-over prompt for the next session. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 1 | P0.4 approval in the plan and the report: tracker row, Summary, Status, done note, report status and approval step; the lab-install rule in `CLAUDE.md` relaxed to `npm ci` at the root. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 30 | Instructions for merging the P0 branches and starting P1.1; choosing one pull request per sub-phase and approving the deletion of the merged branches. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 14 | P0 branches merged into `main`: `main` checked unchanged since the P0.1 base; PRs #3–#6 opened through the GitHub API (the CLI token lacked pull-request rights), each merged with a merge commit after its green checks (pdf-lab 41452472229, 41453184728, 41453948942, 41454969643; tooling 41454969155); `main`'s run 41455922949 green against the base (corpus 95.7 → 95.7, fuzz +0.0, meta equal); local `main` refreshed (`npm ci`, lint 0 errors, 24 version checks); the five merged branches deleted; merge note in the plan. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 31 | P1.1 Storage & export correctness: `schemaVersion` in the defaults, profile and page settings stored as differences, one `K.store.migrate()` for load, settings files and Undo; `K.preview.renderSoon` / `flush()` before every export and Copy; autosave on `pagehide`; a `storage` listener (text as one Undo step, images, profile, logo, language, theme, layout, the export name, cleared storage written back); `tests/unit/` with jsdom 30.1.3 (deps resolved ≥ 14 days old), 23 tests (16 of the first 19 fail on the old code), `npm test` in `tooling.yml`; review findings applied; report `docs/reports/P1.1-storage-export.md`, Known Issues, Testing and the plan updated. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 3 | Review of the P1.1 diff: storage diff/merge and migration paths, timers, the storage listener, callers in `scripts/`, i18n wording; three faults confirmed with a jsdom probe (stale export name in a second tab, cleared storage emptying the text, an older tab dropping a newer profile's values). |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 2 | P1.1 first CI push: `tooling` run 41471258802 red at the unit-test step — Node 22's test runner does not take a folder; `npm test` changed to the glob `tests/unit/*.test.js`. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 3 | P1.1 CI on PR #7 checked and recorded in the report: `tooling` 41471461805 / 41471453294 (lint 0 errors, 24 version checks, 23 / 23 unit tests on Node 22) and `pdf-lab` 41471461751 / 41471453284 (head against `main`: corpus 95.7 → 95.7, fuzz +0.0, meta equal, gate passed). |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 12 | P1.1 merged into `main`: PR #7 merged with merge commit `fc2fd52` after its green checks; `main`'s runs after the merge checked green (tooling 41494645319, pdf-lab 41494645572, Pages 41494644682). |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 3 | Approving P1.1 and instructions for P1.2–P2.4 as one stacked batch with parallel work, reported once at the end of P2. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 3 | P1.1 approval recorded on `redesign/P1.2`: tracker row, Summary, Status, PR #7 merge note in the plan; the P1.1 report's status. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 17 | P1.2–P2.2 started as parallel work: checklist; self-contained briefs for P1.2, P1.3 (shaping, tables, cleanups, `fa-features` bisect), P1.4, P2.1 and P2.2, each in its own worktree; P1.2 integrated on `redesign/P1.2`; Known Issues, Security Architecture, Testing and the tracker updated; `.claude/worktrees/` ignored by git and ESLint. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 14 | P1.2 Security hardening: DOMPurify `SANITIZE_NAMED_PROPS` and `FORBID_TAGS` with task-list checkboxes kept; header / footer HTML sanitised; `HtmlBuilder.toHtml` through an inert document with `defang` (B4); CSP `<meta>` measured on `file://` and http with MathJax, PDF.js and every export; `rel="noopener noreferrer"`; 5 unit tests and a browser CSP check; report `docs/reports/P1.2-security.md`. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 4 | P1.3 joined on `redesign/P1.3`: four parts applied (two corpus conflicts resolved), `BidiCore` RTL letter range widened (U+0620–063F, 066E / F, 06EE / F, 06FF); unit tests, lint, version, the builder suite headless and the full lab (corpus, fuzz dev and held-out, meta, gate against `baseline.json` and against the base) run in parallel; report `docs/reports/P1.3-builder-bugs.md`, Known Issues, Testing and the tracker. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 13 | P1.3 B1 Arabic shaping: U+0649 initial / medial to FBE8 / FBE9; joining types from Unicode `ArabicShaping.txt`; letters without presentation forms joined by their neighbours; fonts' character maps checked; three round-trip cases with an `exact` flag, 7 unit tests. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 14 | P1.3 B2 / B3 PDF tables: columns from the `_tableStyleGrid` occupancy, spanning cells drawn once, rows taller than a page split with closed cells and the header repeated; five table cases with a PDF geometry check; pages rendered and inspected. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 7 | P1.3 B5–B8: DejaVu Sans Mono loaded in the builder suite; one named-colour table in `BuilderBase`; delayed blob revoke in one helper; the dead data-URI branch removed; 10 unit tests. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 12 | P1.3 `fa-features` quote bisect on a copy of the importer: the scorer's nested-quote key and four left-to-right assumptions in the quote rules found and fixed; full lab base against head on the same PDFs. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 1 | P1.4 stacked on `redesign/P1.3`: applied over P1.2's `index.html`, `exporter.js` and `preview.js` (CSP `<meta>` kept before `boot.js`); unit tests 60 / 60, lint, version, check-i18n and the CSP browser check with `boot.js` on `file://` and http; report figures for the stack, Known Issues, Testing, Commands and the tracker. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 14 | P1.4 i18n and small app bugs: Arabic table word and date locale through `K.i18n`; 9 hard-coded strings moved and 9 unused keys removed; `tools/check-i18n.js` with an npm script and a CI step; `scripts/boot.js` setting language, direction and theme before first paint; size unit order fixed; 15 unit tests; fa / en / ar screenshot review; report `docs/reports/P1.4-i18n.md`. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 5 | Review of the P1.2 diff: sanitiser bypasses, ids and names after the prefix in every export, the CSP against pdf.js, MathJax and fonts, `defang` in library use; the WebAssembly block reproduced with a probe. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 16 | P1.2 review findings verified and applied: `'wasm-unsafe-eval'` for pdf.js's JPEG 2000 / JBIG2 decoders with a WebAssembly step in the CSP browser check; `<a name>`, image maps and `<area>` following the `user-content-` prefix; DOCX bookmark names without the prefix; `defang` removing SVG animation and XML `data:` links; 3 unit tests; report §4, Known Issues and Testing; the work stopped by a usage limit resumed. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 15 | Review of the P1.3 diff: the scorer change, the RTL quote rules against mixed-direction quotes, the table split, shaping, the colour consolidation and the wider RTL letter range, each probed against the old code; the lab and the builder suite rerun. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 10 | P1.3 review fix in the importer: a quote's direction taken from its outer level's own first line (English quote with a Persian nested quote and the reverse both 100), quote blocks merged only within one direction; full lab on the same PDFs. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 15 | P1.3 review fix in the PDF tables: each cell broken at its own last fitting line, `rowspan="0"` to the end of its section across PDF and DOCX, a stricter geometry check and two cases. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 14 | P1.3 review fixes in shaping and colours: letters with only some presentation forms joined only on those sides; transparent colours as no fill and partial alpha blended over white; PdfBuilder on `BuilderBase.colorHex`; unit tests. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 13 | P1.3 review findings handed out, the three fixes joined on `redesign/P1.3`, unit tests, lint, the builder suite and the full lab rerun (corpus 96.2, `rtl` 92.9, fuzz +0.0, gate passed); report §4, figures, Known Issues and Testing; P1.2 merged in; P2.1, P2.2 and P1.4 reviews read and their fixes handed out; the plan's P3.3 held-out target noted as a generator-3 figure. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 30 | Review of the P1.4 diff: the nine removed keys searched across the tree, a browser sweep of fa / en / ar with every pane, dialog and toast, `boot.js` against stored, broken and old profiles, the date locale received by every exporter, and the checker's blind spots probed. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 12 | P1.4 review fixes: `check-i18n` skips comments, reads template keys and fails non-literal keys outside a documented allow-list (PDF note keys written out in full); placeholder messages per language; `boot.js` and `i18n.apply` safe against inherited names, unknown themes and old profiles; 10 tests; report §4. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 6 | P1.3 merged into `redesign/P1.4`; the P1.4 review fixes joined; unit tests 75 / 75, check-i18n, lint and the CSP browser check; Testing rows; P1.4 pushed with its pull request. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 20 | P2.1 RTL fuzz corpus: `make-fuzz.js` generator 4 — `fa-article`, `fa-report`, `ar-article` and a new `fa-mixed` document, dimensions `dir`, RTL fonts (Vazirmatn, Sahel, Noto Naskh Arabic), `digits`, `tracking`; 44 % RTL in each split; `run-fuzz.js` per-direction and `rtl` means; the gate keeps generators apart; report `docs/reports/P2.1-rtl-fuzz.md`. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 52 | P2.2 Metamorphic net extended: 24 seeds (six RTL added) × 20 transforms (`fontSubst`, `letterSpace`, `pageSize`, `hfInject`, `rotate180`, `cropbox`, `renderMode`, `stamp` added; rotations as turned content made upright by `/Rotate`, slug text outside the CropBox); "same" transforms asserted byte-identical in `run-meta.js` with a per-file allow-list carrying floors; reference-free relations; the gate versioned per transform; `make-meta.js` failing on a file it cannot make; qpdf pinned; review findings applied; report `docs/reports/P2.2-meta-net.md`. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 8 | Review of the P2.2 diff: the transforms against what they claim, the byte-identical assertion and its allow-list, the relations, the gate's notes against real regressions, determinism and the CI run; the report's figures reproduced. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 10 | Review of the P2.1 diff: held-out leakage, determinism of the draw, digit rewriting against the scored source, RTL mirroring, the gate across generators, the RTL share and the workflow change; the font tables of the RTL fonts read. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 9 | P2.1 review fixes: per-direction and `rtl` means stored and gated, RTL faces limited by `unicode-range` so `latinFont` applies, digits attached to Latin words kept, `digits: asis`, run comparisons only within one env, the Noto font hashed in the env, code blocks not mirrored; report §4. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 7 | P2.1 baseline on the CI runner: manual `pdf-lab.yml` run 41507779260 with `baseline` ticked, its candidate checked (generator 4, 44 RTL per split, Noto hashed, meta identical, corpus differing only by P1.3's gains) and its fuzz part written into `baseline.json`; report §3 / §5, Known Issues, Testing, the tracker and the plan's P3.3 held-out target; P2.2 joined on `redesign/P2.2` (workflow apt lines combined). |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 51 | P2.3 Builders in CI, DOCX validation, goldens: `tests/docx-validate.js` (package, ECMA-376 Transitional schemas through xmllint, LibreOffice conversion), golden snapshots in `tests/golden/` for five outputs of every corpus case with `--update`, 11 MarkdownImporter unit tests, corpus cases for links, images, header / footer, ToC and page breaks; workflow `builders.yml` with pinned tools; the horizontal-rule leak in the importer and MathCore's duplicate strike flag fixed; report `docs/reports/P2.3-builders-ci.md`. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 4 | P2.3 joined on `redesign/P2.3`: schemas kept byte for byte (`-text`) so their hashes hold, goldens rewritten after P1.3's builder fixes (only the two newest cases were missing), unit tests, lint, goldens and DOCX checks run; Known Issues, Testing, Commands and the tracker. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 28 | P2.4 links, generated files and the workflow: `site.yml` with four independent jobs; lychee 0.24.2 pinned by SHA-256 with `lychee.toml` (offline on push, online weekly); three broken links fixed; `check:fresh` for the three generated files with `build-samples.js` sorted for Linux; actionlint clean. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 32 | P2.4 accessibility and size checks: `tools/check-a11y.js` (axe-core 4.14.0, fa / en / ar × light / dark, dialogs) with an allow-list; preview fixes for code contrast, task checkbox names and scrolling code blocks; BidiView's empty link removed; `tools/check-size.js` with a committed budget; 6 unit tests. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 3 | P2.4 joined on `redesign/P2.4` (package scripts merged, lockfile installed), the size budget set on the whole stack (1,982,706 → 1,990,000 bytes), every check rerun (unit tests 92, a11y, size, freshness, CSP, goldens); report `docs/reports/P2.4-site-quality.md`, Known Issues, Testing, Commands and the tracker. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 2 | P2.2 meta baseline on the CI runner: manual `pdf-lab.yml` run 41509321814 with `baseline` ticked (qpdf pin held, 0 unexpected "same" files on Linux), its candidate checked and its meta part written into `baseline.json`; report §5, Known Issues (the `/Rotate` finding and the net's other losses), Testing and the tracker. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 4 | P2.2 – P2.4 pushed with pull requests #12 – #14; first CI runs read: `site.yml` links red on the golden snapshots (recorded `.docx` read-backs with `#bm_` links) — `tests/golden/expected/` excluded in `lychee.toml`; `builders.yml` red on LibreOffice (7 files without a PDF) and two Persian-formula goldens measured differently on Linux, handed back for a fix. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 9 | Review of the P2.4 diff: `site.yml` failure paths and pinning, each lychee exclusion removed in turn, the accessibility check against a broken page and a lost theme, the size definition against what a returning and a first visit load, freshness against crashing generators, the preview fixes in loose lists, links and Copy. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 6 | P2.4 review fix in the link check: emoji-headed anchors remapped to their file instead of skipped, so a missing file with such an anchor is an error. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 16 | P2.4 review fixes in the accessibility check and the preview: a run fails on a page error, a wrong language, direction or theme, or an unrendered preview, and waits for every formula; loose-list checkboxes named; BidiView's empty shell with an id removed; tab stops only on blocks that overflow (wide formulas too, allow-list emptied); preview-only attributes kept out of Copy; 3 tests; report §4. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 12 | P2.3 and P2.4 reviews read and their findings handed out; the P2.4 fixes joined on `redesign/P2.4`; unit tests 95, Known Issues and Testing. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 13 | Review of the P2.3 diff: goldens against a damaged picture, a tampered shared section, stray files and a partial update; the importer change on ordinary cells; the validator against a silent xmllint, Markup Compatibility tricks and a stale PDF; the workflow's version check. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 20 | P2.3 first CI run and review fixes: LibreOffice one process per file with retries and exit status (7 files lost after a crash in one call); right-to-left formula widths measured differently on Linux normalised in the goldens; pictures kept as size and hash, a second picture; only the rule's `<br>` dropped in cells; xmllint per-part confirmation, Markup Compatibility errors, shared-file hashes, all-or-nothing `--update`, `docProps/` in the goldens; 7 tests; report §4 / §5. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 18 | P2.3 fixes joined on `redesign/P2.3` (unit tests 93, goldens equal, lint) and merged up into `redesign/P2.4`; the branches pushed for the second CI run. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 8 | P2.3 and P2.4 second CI runs read: goldens green on Ubuntu, LibreOffice 74 / 76 with an abort on the two ToC documents — a known-abort list (`SOFFICE_KNOWN`) added to `docx-validate.js` with its reason, report §5 and Known Issues; CI run ids of every pull request collected; the workload of every row checked against the logs. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 35 | P2.3 first CI run and review fixes, continued: LibreOffice 24.2.7 for Windows unpacked to reproduce the Linux failure, the right-to-left formula measurement traced to platform text layout, the validator's Markup Compatibility, picture and xmllint checks with 5 unit tests, all-or-nothing `--update`, the report's counts. |
| 1405-08-11 | 2.0-rc1 | Zarrabi | 2 | Review of the P1.2 diff, continued: the bookmark and overlay probes and the report's statements checked. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 10 | P1.2–P2.4 merged into `main`: PRs #8–#14 merged in stack order with merge commits after each one's green checks (`5d23e3f` … `bef9b24`); `main`'s runs after the last merge read (tooling, pdf-lab, builders, site, Pages green); the seven reports' status and CI sections, the tracker (approved), the plan's Summary, Status and a merge note; hand-over `docs/Kelk-Redesign-Continue-P3.md` with the prompt for P3, the end-of-P2 report, the workload and the open items. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 22 | Settling the end-of-P2 open items and preparing P3.1: the merged `redesign/*` branches deleted (remote and local), Playwright 1.56.1 → 1.64.1 (Chromium 156; the CDN download refused here, the same build taken from Google's Chrome-for-Testing host, the workaround in Prerequisites), the base lab of `main` on this machine (corpus, fuzz 100 + 100, meta 13 of 20 transforms), briefs for the five splits. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 28 | P3.1 splits integrated and checked together: `cmp.js` 0 changed files on the corpus, fuzz dev and meta, `run-import.js` / `run-fuzz.js` / `run-meta.js` and the gate against the base run passed, meta "same" counts unchanged; `max-lines-per-function: 150` for `lib/pdfimport/` in `eslint.config.js`; `engines` and the commit check joined with the Playwright upgrade. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 17 | P3.1 split of `order.js`: `_pageBlocks` (915 lines → 30) into 21 steps (`_pbCellShading` … `_pbFloats`, `_pbOrder`, `_pbMergeBlocks`), `_xyCut` into `_xyTests` / `_xyRegions`, `_rowsLeaf` with `_rowSpans`; Markdown byte-identical on corpus, fuzz dev and meta. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 20 | P3.1 split of `lines.js`: `_lines` (600 → 8) into `_glyphRows`, `_visualLines`, `_segments` (with `lineWordGap`, `letterGap`, `bulletLead`, `mixedLine`), `_cellEdges`, `_joinSegments`, `_finishRows` (`_wordSpaces`, `_kashidas`, `_raisedDigits`, `_codeRuns`); `_furniture` into four steps; byte-identical. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 20 | P3.1 split of `extract.js`: `_extractPage` (499 → 43) into an operator walk over one state object (`_opState`, `_opGlyphs`, `_opPaths`, `_opImages`, `_opShape`, …) and the passes after it (`_unicodeRepair`, `_hideCovered`, `_codeRepair`, `_dashedRules`, `_tinyText`); `_gsubRepair`, `_formsByOrder`, `_repairUnmapped` split; byte-identical. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 15 | P3.1 split of `blocks.js`: `_joinAcrossPages` (374 → 10) into `_joinPrepare`, `_joinStream` (`_joinPageBreak`, `_joinTables`, …), `_joinLineRuns`, `_joinParagraphs`, `_oneRowTables`; `_groupLines` into `_quoteRuns`, `_lineBreaks`, `_lineMarker`; `_textBlocks` with `_quoteBlock`; byte-identical. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 18 | P3.1 split of `regions.js`: `_layout` (216 → 22) into document signals, page lines, shapes, lexicon, body metrics, families, pitches and `_layoutPage` / `_pageFallback`; `_tableBlock` (213 → 48) into six steps; draft function map of `lib/pdfimport/`; byte-identical. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 4 | Commit-message check for pull requests: `tools/check-commits.js` (contributor prefix from `.claude/contributors.json`, no Claude attribution lines) with 4 unit tests and job `commits` in `tooling.yml`; `engines` narrowed to jsdom 30's range (Node 22.22.2+ / 24.15+ / 26+); the 5 npm advisories checked — no fix 14 days old yet (minimatch 11.0.1 from 1405-08-19). |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 26 | Answering the end-of-P2 questions (branches, advisories and engines, `pagesLinks`, the PR check, size budget, workload) and the size-budget question of P3.2 (proposed). |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 2 | P3.1 function map `lib/pdfimport/README.md`: every one of the 159 methods of the five parts in pipeline order with its callers and its step, step functions under their caller; checked against the files' method lists; pointer in `lib/README.md`. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 13 | P3.2 groundwork: `lib/pdfimport/thresholds.js` (registry `PdfImporter._thresholds`, `_t()` returning the default until an entry is switched to calibrated with `minSamples`, `_fire()` / `r.rules`, `r.calibration` with `debug`), `lib/pdfimport/calibration.js` (`_calibrate()` → frozen body / fonts / gaps / steps / columns / tracking / regions with sample counts), `tests/pdf-lab/scripts/rules.js` and a gate note for rules that stop firing, `_rules.json` from `run-import.js`, both files in every load list; 7 unit tests. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 22 | P3.2 registry and telemetry in `extract.js`: 144 thresholds (`ext…`, 2 fixed) at 146 call sites, the operator walk reading them once per page (`_opConsts`); 66 rules (35 fire on the corpus); `/ActualText` of pages whose dictionary sits in an object stream found unread (`_pageMarkedTexts` / `_rawBody`); byte-identical. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 24 | P3.2 registry and telemetry in `lines.js`: 193 thresholds (`lin…`) and the 7 word-gap seeds at 210 call sites, read once per method; 55 rules (48 fire on the corpus); byte-identical. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 20 | P3.2 registry and telemetry in `regions.js`: 112 thresholds (`reg…`) and the body / spacing seeds at 125 call sites; 41 rules (32 fire on the corpus); byte-identical. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 29 | P3.2 registry and telemetry in `order.js`: 377 thresholds (`ord…`, 5 fixed rendering levels) at 400 call sites, three long steps reading theirs through one object each; 109 rules (82 fire on the corpus); byte-identical. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 23 | P3.2 registry and telemetry in `blocks.js`: 165 thresholds (`blk…`, 5 fixed votes and shares) at 176 call sites; 94 rules (67 fire on the corpus), the paragraph-break reasons counted; byte-identical. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 10 | P3.2 parts joined: the five files' registries together (1,007 thresholds, 16 fixed; every name read is defined), seed references corrected, lint 0 errors. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 8 | PDF importer loaded on demand (the importer part of P5.1, taken forward in P3.1 because the split alone took startup to 2,006,240 bytes, over the 1,990,000 budget): `libs.pdfimport` in `scripts/config.js` loads `lib/PdfImporter.js` and its parts with `<script>` tags on the first PDF import, after pdf.js; `K.libs.need` counts a several-file library as loaded only when all its files ran and finishes a half-done load; 3 unit tests; PDF import under the CSP on `file://` and http checked. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 15 | P3.3 `/ActualText` of pages whose dictionary sits in an object stream: `_pageMarkedTexts` falls back to `_rawObjStms()`; list numbers, a dash and a lost mark come back; meta `objstm` 22/24 → 24/24 exact (its two `KNOWN` entries removed); corpus and fuzz byte-identical. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 25 | P3.3 diagonal watermark: `extract.js _watermark` drops a run turned off the axes, ≥ 1.5 × the body, faint (opacity ≤ 0.6 or light grey) and spanning ≥ 40 % of the page; turned angle and alpha recorded per glyph; 6 thresholds; unit tests; meta `stamp` 0/24 → 24/24 exact (−32.7 → 0.0); corpus and fuzz byte-identical. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 35 | P3.3 a page's `/Rotate` applied: `extract.js _pageFrame` builds the upright view from pdf.js's viewport (y up, at the page's origin) and the operator walk starts in it, so glyphs, paths, clips, images, link rectangles and the page box come out upright; figure crops and the OCR ink read through `_pageViewport`; 8 unit tests (0 / 90 / 180 / 270); meta `rotate90` and `rotate180` 0/24 → 24/24 exact (−82.4 / −83.0 → 0.0), their 48 `KNOWN` entries removed; corpus and fuzz byte-identical. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 50 | P3.3 composite fonts with no ToUnicode named from their programs: `_gsubByCode` finds a font whose codes read as their own numbers (Identity map), `_gsubByWidth` picks among programs of one name by their advance widths, `_gsubNamed` decodes `#20` in a font name, `_gsubByCodeGlyph` names every glyph (ligature letters, GSUB forms, cmap; the space glyph a real space); 4 unit tests; meta `noToUnicode` −81.0 → −46.1, 11 of 24 seeds exact (the rest carry no Unicode at all: Chrome Type 3, LibreOffice / Prince / wkhtmltopdf subsets); corpus and fuzz byte-identical. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 25 | Review of the P3.2 diff: the full import result compared on corpus, fuzz dev, held-out and meta (0 differ); every `_t` read put back as its default and compared token by token with the base (617 hunks exact, 194 read); names against their methods, units, registry mechanics, calibration statistics against the importer's own body and leading, timing (+3–4 %), the lazy loader with two imports at once, `rules.js` and the gate note. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 8 | P3.2 review findings applied: `rules.js` finds rule names chosen by a ternary (344 → 377), `r.rules` also on Kelk's own-source path, a line as ctx resolves to its page (not its list number) with a unit test, the registry header says extraction entries cannot calibrate, the function map lists the registry, calibration and the new helpers; calibration findings (the word-gap seed, body and leading against the importer's own) handed to P3.3. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 20 | P3.3 steps, headings, points against the scaled nets: margins mirrored only from a side that two or more lines show (`regColMirrorSrcLines`; a slide line past the page edge mirrored 40 pt into every right-to-left line at 80 %) and the bold-line-at-body test on sizes as drawn (`_metrics.bodyExact`) — meta `scale80` 18/24 → 20/24 exact (−1.4 → −0.2), two `KNOWN` entries removed; measured and rejected: every text-relative pt entry × body (one corpus file broke), leading from `cal.steps` (paragraph pitch taken as leading on 6 files), nine heading steps × body (below the half-point rounding of sizes); `pagesLinks` removed (always empty; links come from `_allLinks`); unit tests; corpus and fuzz byte-identical. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 20 | P3.3 word spaces under tracking: a text run placed from its untracked width is laid out again (`calibration.js untrack`, drift of the run ends regressed on the drawn gaps, on at slope < −0.5 with ≥ 8 samples, per page from 30; invisible OCR text left out), and a justified line that draws its spaces at normal width counts three or more equal gaps as justification (`justGap`); the word-gap seed no longer calibrates from the letter/word midpoint, nulls fall back; measured and rejected: a calibrated `wordGapBareEm` (dev −0.2); unit tests; meta `tz85` −9.2 → −0.1, `trackTight` −3.6 → 0.0, `trackLoose` −12.2 → −0.8, fuzz dev 86.6 → 86.8, held-out 88.0 = , corpus byte-identical. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 24 | The stress run's 19–27 s main-thread block found and removed: `_formsByWidth` listed every font's ids once per candidate font (cubic in fonts — 52 s under Chromium 141, whose long-task observer never reported it, 27 s under 156), now once; `_gsubBogus` scanned every page once per font, now groups the glyphs by font once; `run-stress.js` adds a heartbeat (longest gap between 50 ms ticks) so the check no longer depends on the browser's observer; big file 48 → 18 s, longest task 453 ms; byte-identical on corpus, fuzz dev and meta. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 12 | P3.1 report `docs/reports/P3.1-split.md`: the splits per file, the items carried in the sub-phase (Playwright, lazy loading, the stress block, engines, the commit check), the stress finding, the lab, the review findings and their verdicts, CI and the open items. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 10 | P3.2 report `docs/reports/P3.2-registry.md`: the registry, calibration and telemetry, the 1,007 entries and 377 rules by part, the rules that never fire on the corpus, the lab, the review findings and where each went. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 6 | P3.1 baseline rebuilt on the CI runner for Playwright 1.64.1 (manual `pdf-lab` run 41593890106 with `baseline` ticked, its `baseline-candidate` committed whole): corpus 95.72 → 96.22 (P1.3's five files, written at last), fuzz and meta in the Chromium 156 environment — dev 85.98 → 85.91, held-out 86.91 → 86.89 with the same importer (the browser's drawing), meta Chromium 141 → 156. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 21 | P3.4 confidence and fallback ladder: `lib/pdfimport/ladder.js` — a page confidence from lost and guessed glyphs, glued words, text under a cropped picture, the structure tree's disagreement, ambiguous gaps and too few gap samples, and the rung (full → simplified → textContent from pdf.js's text → ocr note) with 19 fixed thresholds; a failed extraction or layout goes a rung down instead of `pageFailed`; `mode: auto \| safe \| full`; `r.pages` and `r.report` (the contract the report panel reads); three lab PDFs that must demote (`tests/pdf-lab/ladder/`, `make-ladder.js`) checked by `run-stress.js`; unit tests; auto mode byte-identical on corpus and fuzz dev, no corpus page demoted; safe mode on the corpus: words 97.8, order 97.5. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 15 | P3.5 import report panel: the PDF import's note toasts replaced by `#import-report` (`scripts/report.js`) — a summary of pages per mode and confidence, findings with page lists, the pages not read in full with why, "Re-import in safe mode" (the bytes kept) and "Copy report"; `Kelk.importReport.fromResult` reads `r.report` or builds it from the older fields; shown only when there is something to report; `role="region"`, focus in and back, Escape, no live-region chatter; 31 strings in fa / en / ar; `check:a11y` opens it in fa / en / ar × light / dark; screenshots `docs/reports/P3.5/`; 8 unit tests. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 6 | P3.4 and P3.5 joined on their stacked branches: the stress heartbeat kept beside the ladder checks in `run-stress.js`, stress run, unit tests 148, i18n, size, version and a11y checked. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 38 | P4.1 real-producer corpus: 8 own CC0 documents (Persian memo, mixed Persian / English report with tables, Arabic letter, English readme, two sheets with and without borders, a Persian and an English deck) made with Word, Excel and PowerPoint 2024 through COM (`make-real.ps1`) and as HTML (`make-real.js`), exported through Word / Excel / PowerPoint Save as PDF, Microsoft Print to PDF, Edge 156, Chromium 156 and Firefox 152 — 44 PDFs in `pdf/real-producers/` with hand-written references `corpus/real-*.md`, plus the lab's `word-*` and `xl-border-*` office files through the same Office paths; `profile.js` producer table, `features.js` application × direction table (no empty cell for Word / Excel / PowerPoint × rtl / ltr); the default printer and Office's numeral and separator settings restored after each run. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 4 | P4.1 joined on its stacked branch and run through the whole lab: corpus 144 → 188 files (mean 96.2 → 94.6 with the new files), fuzz and meta unchanged, gate passed. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 5 | P4.2 golden tooling: `golden.js` scores each `golden/<name>.md` against its PDF with `score.js` plus a structure diff (heading levels, table shapes, list depths aligned by fewest edits; `structdiff.js`) into `out/golden/_scores.json`; a `golden` part in `gate.js` (a file −0.5 or a crash fails, new files noted, `--update` on full runs only); CI runs it for head and base; README «Golden files»; 5 unit tests. |
| 1405-08-12 | 2.0-rc1 | Zarrabi | 8 | P4.2 joined: the 50 goldens and the tooling on their stacked branch; first run: mean 93.2 over 50 files, 0.7 structure edits per file; the ten worst read with their causes (LibreOffice HTML right-to-left lists, borderless tables and indent-only quotes; Arabic text lost through LibreOffice from DOCX; wkhtmltopdf lines clipped at the page edge; Tahoma's heh and digits; an unruled table; a Print to PDF title and lam-alef). |

<!-- generated:totals -->
**Entries: 144 · Total: 2010 min (33.50 hours) — Zarrabi 2010 min (137 rows), Hasan Nejad — (7 rows, no logs).** (7 rows without logs carry no figure.)
<!-- /generated:totals -->

---

## 📄 License

**MIT** — [`LICENSE`](../LICENSE), © 2026 mohsen-1984 (`lib/` carries its own copy, [`lib/LICENSE`](../lib/LICENSE)).
The vendored libraries and fonts keep their own licences ([`THIRD-PARTY-NOTICES.md`](../THIRD-PARTY-NOTICES.md)).
Vazirmatn, Vazir Code and Sahel are the work of the late Saber Rastikerdar — in his memory.
