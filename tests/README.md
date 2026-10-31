# tests/

Kelk test suites and corpora.  Open the `.html` pages from `file://` (or a local server) in a browser.

| File | What it does |
|---|---|
| **index.html** | Start page: links to the four test pages below. |
| **builder-suite.html** | Main test runner for the **builders** (DocxBuilder, WordHtmlBuilder, PdfBuilder, HtmlBuilder). Runs every case from `test-corpus.js` and the `about-kelk-and-samples` documents through all four output formats, checks direction consistency (BidiView vs BidiCore) and preview/export parity (PreviewBuilder vs HtmlBuilder), and does a PDF round-trip (PdfBuilder → PdfImporter → word comparison). Loads all library scripts and vendor dependencies inline. |
| **test-corpus.js** | Builder test corpus — `var CORPUS = [...]`: each entry is a markdown document (with optional `setup`, `cells`) that exercises a specific feature (RTL, tables, lists, code, quotes, styles, edge cases). Used by `builder-suite.html` (and through it by `pdf-lab/scripts/roundtrip.js`). |
| **pdf-import-suite.html** | Test runner for the **PDF importer** (PdfImporter) only — the .docx / .html / rich-paste importer (MarkdownImporter) is exercised by `builder-suite.html` and `math-file.html`. Accepts user-selected PDF files (e.g. from `pdf-lab/pdf/`), imports each, and scores the recovered Markdown against the matching corpus document when the file name ends with `--<doc>.pdf` — offline, from `file://` (the corpus comes from `pdf-lab/corpus.js`). Shows producer detection, tagged/language metadata, and per-structure scores. |
| **pdf-import-corpus.js** | PDF import floors — producer families, score thresholds, case overrides, and corpus document names. Used by `pdf-import-suite.html`, with the documents of `pdf-lab/corpus.js` (generated from `pdf-lab/corpus/*.md` by `pdf-lab/scripts/build-corpus-js.js`). Defines `IMPORT_CORPUS` with helpers: `detectProducer()`, `thresholdsFor()`, `corpusDocOf()`. |
| **math-cases.js** | LaTeX formula test vectors — `window.MATH_CASES = [...]`: each entry is `[group, name, tex, display]`. Used by `math-file.html` and `math-modes.html`. |
| **math-file.html** | Renders every `math-cases.js` formula through MathCore → marked → PdfBuilder/HtmlBuilder and shows the result. |
| **pdf-lab/** | The PDF import lab: a corpus, the PDFs 49 producer variants made of it, the scorer and inspection tools (Node + Playwright). See [`pdf-lab/README.md`](pdf-lab/README.md). |
| **math-modes.html** | Side-by-side comparison of MathCore rendering in inline vs display mode for every formula case. |

## Relationships

```
builder-suite.html ─── loads ──→ test-corpus.js
                   ─── loads ──→ about-kelk-and-samples.js (docs/)
                   ─── uses  ──→ all builders + PdfImporter (round-trip column)

pdf-import-suite.html ─── loads ──→ pdf-import-corpus.js, pdf-lab/corpus.js
                      ─── uses  ──→ PdfImporter (+ MarkdownImporter for its Markdown)

math-file.html     ─── loads ──→ math-cases.js
math-modes.html    ─── loads ──→ math-cases.js
```

## Automation

- `pdf-lab/scripts/roundtrip.js` — runs `builder-suite.html` headlessly in Playwright and reports the round-trip scores.
- `pdf-lab/scripts/run-import.js` — runs PdfImporter on every `pdf-lab/pdf/*.pdf` via Playwright and scores against `pdf-lab/corpus/*.md`. The PDF lab — corpus, producers, scores, inspection tools — is described in [`pdf-lab/README.md`](pdf-lab/README.md); the importer itself in [`../lib/PDFIMPORT.md`](../lib/PDFIMPORT.md).
