# tools/

Build scripts and development utilities.  None of these ship to the end user — they generate or transform files that do.

| File | What it does |
|---|---|
| **build-pdfjs.js** | Converts the ES-module PDF.js build (`pdf.mjs` + `pdf.worker.mjs`) into classic `<script>`-loadable files under `vendor/pdfjs/`, prepending `pdfjs-polyfills.js`. This lets the PDF importer work offline and from `file://`. |
| **pdfjs-polyfills.js** | Polyfills for recent JS built-ins that PDF.js uses (e.g. `Map.prototype.getOrInsertComputed`). Prepended by `build-pdfjs.js` to each output script; only defines what the browser lacks. |
| **build-icons.js** | Extracts only the Lucide icons Kelk actually uses and writes them to `assets/icons.js`, instead of shipping the full Lucide library. Run after adding a new icon reference. |
| **build-samples.js** | Reads `docs/about-kelk-and-samples.<lang>.md` and `docs/slides-sample.<lang>.md` and generates `docs/about-kelk-and-samples.js` (`KelkSamples`) and `docs/slides-samples.js` (`KelkSlideSamples`, the Slides view's sample) — the data the test suites and the main page load. |
| **build_pdf_fonts.py** | Python (fontTools) script that subsets TTF fonts and writes `lib/pdf-base64-ttf-fonts/pdf-font-*.js` files for PdfBuilder (jsPDF VFS format). |
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

pdf-lab.html ← used by tests/pdf-lab/scripts/*.js
```
