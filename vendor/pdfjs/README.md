# PDF.js — classic-script build for Kelk

Mozilla PDF.js 6.4.299 (generic build), Apache-2.0 (see `LICENSE`). Made by
`tools/build-pdfjs.js` from the release zip; the code is not changed, only wrapped:

| File | From | Defines |
|---|---|---|
| `pdf_6.4.299.js` | `build/pdf.mjs` | `window.pdfjsLib` |
| `pdf.worker_6.4.299.js` | `build/pdf.worker.mjs` | `window.pdfjsWorker` |
| `wasm/openjpeg.wasm.js` | `web/wasm/openjpeg.wasm` (base64) | `KelkPdfjsData['openjpeg.wasm']` — JPEG 2000 images |
| `wasm/jbig2.wasm.js` | `web/wasm/jbig2.wasm` (base64) | `KelkPdfjsData['jbig2.wasm']` — JBIG2 / CCITT images |

Why: browsers load neither ES modules (`.mjs`) nor Workers from `file://`, and fetch nothing
there. As classic scripts the files load anywhere; with `window.pdfjsWorker` present, PDF.js runs
its worker code on the main thread ("fake worker"). The PDF is passed as bytes
(`getDocument({ data })`), and `PdfImporter` hands PDF.js the decoders through its own
`BinaryDataFactory`, loading a decoder script only when an image needs it. Kelk loads PDF.js on
the first PDF import (`Kelk.libs.need('pdfjs')`).

Polyfills: the generic build calls the newest built-ins directly (`Map.prototype.getOrInsertComputed`,
`Math.sumPrecise`, iterator helpers …). `tools/pdfjs-polyfills.js` is put in front of both files and
defines each one only where the browser lacks it, so a browser a few versions old still works.

Not used: the decoders' pure-JS fallbacks (`*_nowasm_fallback.js` — PDF.js loads them with
`import()`, which `file://` refuses), `qcms` (ICC colour; colours stay uncorrected), `cmaps/` and
`standard_fonts/` (only needed to draw non-embedded or CJK fonts in cropped figures).

Update:

```sh
# https://github.com/mozilla/pdf.js/releases/download/v<v>/pdfjs-<v>-dist.zip  (unzip)
node tools/build-pdfjs.js build/pdf.mjs build/pdf.worker.mjs web/wasm
# jsDelivr works too: …/pdfjs-dist@<v>/build/pdf.min.mjs, …/build/pdf.worker.min.mjs, …/wasm/
# then the file names in scripts/config.js (libs.pdfjs) and the sources comment in index.html
```
