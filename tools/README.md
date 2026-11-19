# tools/

Build scripts and development utilities.  None of these ship to the end user — they generate or transform files that do.

| File | What it does |
|---|---|
| **build-pdfjs.js** | Converts the ES-module PDF.js build (`pdf.mjs` + `pdf.worker.mjs`) into classic `<script>`-loadable files under `vendor/pdfjs/`, prepending `pdfjs-polyfills.js`. This lets the PDF importer work offline and from `file://`. |
| **pdfjs-polyfills.js** | Polyfills for recent JS built-ins that PDF.js uses (e.g. `Map.prototype.getOrInsertComputed`). Prepended by `build-pdfjs.js` to each output script; only defines what the browser lacks. |
| **build-icons.js** | Extracts only the Lucide icons Kelk actually uses and writes them to `assets/icons.js`, instead of shipping the full Lucide library. Run after adding a new icon reference. |
| **build-samples.js** | Reads `docs/about-kelk-and-samples.<lang>.md` and `docs/slides-sample.<lang>.md` and generates `docs/about-kelk-and-samples.js` (`KelkSamples`) and `docs/slides-samples.js` (`KelkSlideSamples`, the Slides view's sample) — the data the test suites and the main page load. |
| **build_pdf_fonts.py** | Python (fontTools) script that subsets TTF fonts and writes `lib/pdf-base64-ttf-fonts/pdf-font-*.js` files for PdfBuilder (jsPDF VFS format). |
| **build-letterstats.js** | Writes `lib/pdfimport/letterstats.js`: the letter pairs of our own text by language (the lab's expected Markdown, the READMEs, `docs/`), which the PDF importer's judge reads (`lib/pdfimport/trust.js`). `npm run check:fresh` runs it: a new corpus file changes it — but for the lab's files in fonts Kelk does not know, whose text the approximate reading must find (left out, so their answer does not help it). |
| **build-fontprints.js** | Writes `lib/pdfimport/fontprints.js`: the fontprints (outline hashes, `lib/pdfimport/fontprint.js`) of the fonts in `assets/fonts/download/persian-fonts-ttf.zip`; the faces marked `supplied` in the file are kept. `--add <folder>` adds every `.ttf` under a folder as supplied faces (fonts that are not in the repository: only hashes are written; two versions of one face in one run are both kept, named by their version). A face that shares most of its fontprints with another is written over it (`base`). `npm run check:fresh` runs it. |
| **fontprints.html** | The same without a shell: drop `.ttf` files on the page, download the new `fontprints.js`, put it in `lib/pdfimport/`. Works from `file://`; nothing leaves the page. |
| **calibrate-shapes.js** | Sets the limits of the approximate reading of a font Kelk does not know (`trustApprox*` in `lib/pdfimport/trust.js`, `LAMBDA` in `lib/pdfimport/shape.js`) on the fonts Kelk ships only: each family draws our `docs/` text and is read against the others; prints the right letters and the measures for the right fonts, a shuffled font and a font of bars (`--accept` shows what given limits take). Writes nothing. |
| **build-shapes.js** | Writes `lib/pdfimport/shapes.js`: the glyph shapes (`lib/pdfimport/shape.js`) of the fonts Kelk ships — Vazirmatn, Sahel and the B fonts from `assets/fonts/download/persian-fonts-ttf.zip`, DejaVu Sans from its PdfBuilder font file — for reading a font Kelk does not know (3.2). `npm run check:fresh` runs it. |
| **pdf-lab.html** | Minimal HTML page that loads PDF.js and PdfImporter for headless (Playwright) testing. Used by the scripts of `tests/pdf-lab/` (`run-import.js`, `dump.js`, the inspection tools) — not a user-facing tool. |
| **bidi-lab.html** | Interactive BiDi playground: paste or type mixed RTL/LTR text and see BidiCore + BidiView direction decisions in real time. A development/debugging tool. |
| **og-image.html** | Source page for `assets/og-image.png` (the Open Graph / social-media link preview). Screenshot this at 1200 × 630 px after visual changes. |

## Relationships

```
build-pdfjs.js ──→ vendor/pdfjs/pdf_*.js, vendor/pdfjs/pdf.worker_*.js
    uses pdfjs-polyfills.js (prepended to each output)

build-icons.js ──→ assets/icons.js

build-samples.js ──→ docs/about-kelk-and-samples.js, docs/slides-samples.js
    reads docs/about-kelk-and-samples.*.md, docs/slides-sample.*.md

build_pdf_fonts.py ──→ lib/pdf-base64-ttf-fonts/pdf-font-*.js

build-fontprints.js, fontprints.html ──→ lib/pdfimport/fontprints.js
    use lib/PdfImporter.js and lib/pdfimport/fontprint.js

build-shapes.js ──→ lib/pdfimport/shapes.js
    uses lib/PdfImporter.js, lib/pdfimport/fontprint.js and lib/pdfimport/shape.js

pdf-lab.html ← used by tests/pdf-lab/scripts/*.js
```
