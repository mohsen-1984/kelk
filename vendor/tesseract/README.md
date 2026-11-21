# Tesseract — OCR of scanned pages for Kelk

Tesseract OCR in WebAssembly, for reading a PDF page that is one picture (Kelk 3.4,
`lib/pdfimport/ocr.js`). Apache-2.0 (see `LICENSE`). Nothing here loads at startup: the importer
loads it the first time a page is read with OCR (`Kelk.libs.need('pdfocr')`).

| File | From | Defines |
|---|---|---|
| `tesseract-core-simd-lstm_7.0.0.wasm.js` | tesseract.js-core 7.0.0, `tesseract-core-simd-lstm.wasm.js` (tag `v7.0.0`, commit `acffef2`), unchanged; SHA-256 `c58b46a4…b447b38` | `window.TesseractCore` |
| `fas-best.js` | tessdata_best `fas.traineddata` (commit `e12c65a`), in base64 by `tools/vendor-ocr-model.js`; SHA-256 of the model `99e42096…448114df` | `KelkOcrModels.fas` |

Why these:

- **The core, not tesseract.js.** tesseract.js runs the core in a Worker and fetches its files;
  `file://` allows neither. The core's `.wasm.js` build carries its WebAssembly inside it (base64)
  and loads as a classic script; `lib/pdfimport/ocr.js` calls its `TessBaseAPI` directly, a line at
  a time, on the main thread.
- **The SIMD-LSTM build only.** The LSTM-only builds leave out the old engine, which the `best`
  models do not use. The relaxed-SIMD build aborts with a `best` model (it lacks `DotProductSSE`);
  the SIMD build runs in every browser Kelk supports (WebAssembly SIMD: Chrome 91, Firefox 89,
  Safari 16.4).
- **The `best` model.** Measured on 24 scan pages of our own text (our line finder, each line read
  as one raw line, then `postCorrect`): 0.78 % of the letters wrong, 3.6 % of the words; the `fast`
  model 1.11 % and 5.3 %, at about 1 s a page against 2.4 s.

Update:

```sh
# the core: https://github.com/naptha/tesseract.js-core, tag v<v>, file tesseract-core-simd-lstm.wasm.js
#   (jsDelivr: …/npm/tesseract.js-core@<v>/tesseract-core-simd-lstm.wasm.js) → tesseract-core-simd-lstm_<v>.wasm.js
# the model: https://github.com/tesseract-ocr/tessdata_best/raw/<commit>/fas.traineddata
node tools/vendor-ocr-model.js fas.traineddata <commit>
# then the file names in scripts/config.js (libs.pdfocr) and THIRD-PARTY-NOTICES.md
```
