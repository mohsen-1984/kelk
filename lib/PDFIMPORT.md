# PDF import in Kelk — how a PDF becomes Markdown again

This document explains how `PdfImporter` reads a PDF made by any program and gives back Markdown:
what it reads, in what order it decides things, what each PDF producer does that nobody writes down,
and how to test a change. It is for anyone who maintains `lib/PdfImporter.js`, or who has to read
PDFs anywhere else. `lib/README.md` has the API in a few lines; this file has the reasons.

A PDF has no paragraphs, lists or tables. It has glyphs at positions, lines and rectangles, and
sometimes a few hints (Unicode maps, marked content, a structure tree). Everything else is inferred.
Almost every rule below exists because one producer broke a simpler one — the producer is named in
the code comment next to the rule, and in §10.

---

## 1. The shape of the solution

```
PDF bytes ──pdf.js (classic scripts, main thread)──▶ per page: glyphs (operator list), paths, images, links
   │
   ├─ 0. Kelk's own source? (XMP kelk:source / an attached .md) ──▶ that Markdown, as is
   │
   ├─ 0.5 provenance  who made it, on what, by which path: engine, app, OS, post-processors (r.profile, §2a)
   ├─ 0.6 structure   the producer's structure tree onto the glyphs; how far it can be trusted (§2b; headings: §8.4)
   ├─ 1. extract      glyphs with positions, widths, fonts; rectangles, rules, small marks, vectors, images
   ├─    repair       Unicode for glyphs that have none (ActualText, GSUB, widths, symbol fonts, emoji layers)
   ├─ 2. fonts        regular / bold / italic / monospace per font
   ├─ 2.5 features    how the file is drawn: fonts, ToUnicode, spaces, scale, pictures, fills … (r.features, §2c)
   ├─ 3. lines        visual lines → segments (cut at column and cell gaps) → logical order (bidi)
   ├─ 3.5 furniture   what every page carries: running heads and feet, side panels, page numbers, logos (§6a)
   ├─ 4. regions      body metrics, ruled tables, boxes (code / quote), bars, rules, figures, list marks
   ├─    XY-cut       reading order: columns, rows of borderless tables, floats
   ├─ 5. blocks       headings, paragraphs, lists, quotes, code, tables; joined again across pages
   └─ 6. HTML         semantic HTML ──MarkdownImporter.fromHtml──▶ Markdown (the same cleaning as Word import)
```

Three decisions shape everything:

- **Glyphs, not text.** pdf.js's `getTextContent()` merges glyphs into strings by its own rules and
  loses what layout needs (each glyph's width, drawn vs undrawn spaces, the drawing order). It also
  applies **its own bidi** while it builds the strings, and mixed-direction lines (Persian with English,
  numbers, brackets) do not survive it. The importer walks the **operator list** itself, keeps one
  record per glyph, works in visual order, and turns lines into logical order last, by its own UBA (§6).
- **HTML, not Markdown, as the output of the layout.** The blocks become semantic HTML and go through
  `MarkdownImporter` — one place decides how a table, a nested list or a code block is written in
  Markdown, for PDF, Word and pasted HTML alike.
- **No producer switch.** The importer reads `Producer` / `Creator` (§2), but the rules are
  geometric: "a framed square filled white is a checkbox", not "if wkhtmltopdf then …". A producer name is a hint at most (hyphenation, §8.6; the numbers' bidi convention of InDesign and Kelk, §6 "Numbers in right-to-left text"). That is why a fix for one producer helps the next one
  that draws the same way.

### The files

| File | Role |
|---|---|
| `lib/PdfImporter.js` | the core: options, shared helpers (bidi, Arabic, font programs, provenance), the pipeline (`fromArrayBuffer`), the structure tree, Kelk's own source, Markdown |
| `lib/pdfimport/thresholds.js` | the threshold registry (`_t`), rule telemetry (`_fire` → `r.rules`; `options.debug` → `r.calibration`) |
| `lib/pdfimport/calibration.js` | `_calibrate`: the document's own measures (body size, leading, word / letter gaps, columns, tracking), frozen |
| `lib/pdfimport/extract.js` | 1. extraction and Unicode repairs, 2. fonts (§4, §5) |
| `lib/pdfimport/lines.js` | 3. lines, segments, logical order; 3.5 page furniture (§6, §6a) |
| `lib/pdfimport/regions.js` | 4. the page driver (`_layout`), ruled tables, code boxes, figures (§7) |
| `lib/pdfimport/ladder.js` | 4.9 each page's confidence and the fallback ladder (§7a) |
| `lib/pdfimport/order.js` | 4. reading order: XY-cut, rows of borderless tables (§8.1, §8.3) |
| `lib/pdfimport/blocks.js` | 5. blocks, structure-tree votes, joined across pages; 6. HTML (§8.2–§8.6, §9) |
| `lib/MarkdownImporter.js` | HTML → Markdown (turndown + GFM), shared with Word and paste import |
| `vendor/pdfjs/pdf_6.4.299.js`, `pdf.worker_6.4.299.js` | Mozilla pdf.js 6.4.299 as classic scripts (made by `tools/build-pdfjs.js`) |
| `vendor/pdfjs/wasm/*.js` | pdf.js's WebAssembly image decoders (JPEG 2000, JBIG2) as base64 scripts |
| `scripts/importer.js` | the page: open / drop a PDF, notes and messages, progress |
| `tools/pdf-lab.html` | a bare page with pdf.js + the importer, for headless tests |
| `tests/pdf-lab/` | the test harness: corpus, PDFs of it from many producers, scorer, tools (§11) |
| `tests/pdf-import-suite.html`, `tests/pdf-import-corpus.js`, `tests/pdf-lab/corpus.js` | a simpler scoring in a browser, for PDFs you pick — offline, from `file://` (`corpus.js` is the corpus as a script: `scripts/build-corpus-js.js`) |

The parts are plain scripts (no build step, `file://` has no ES modules): each adds its methods to
`PdfImporter.prototype` and takes the core's helpers from `PdfImporter._internal`. The split follows the
pipeline above, so a fix lands in the file of the layer that goes wrong (§11, "Find the layer first").
| `tests/builder-suite.html` | Kelk's own round trip: Markdown → PdfBuilder → PdfImporter |

---

## 2. pdf.js from `file://`

Kelk runs offline and from `file://`, so pdf.js cannot use a Worker file, `fetch()` or a CDN.

1. **Classic scripts, worker on the main thread.** pdf.js ships as ES modules. `tools/build-pdfjs.js`
   turns `pdf.mjs` and `pdf.worker.mjs` into scripts that define `window.pdfjsLib` and
   `window.pdfjsWorker`; with `pdfjsWorker` present, pdf.js runs its worker code in the page — no
   `new Worker()`, no CORS. Chrome blocks module scripts, Workers and `fetch()` from `file://`, so the
   wrapping is needed whatever the source: jsDelivr's `/+esm` build and the release zip's `pdf.mjs` are
   the same code. The legacy build was considered and dropped: the modern build plus a small polyfill
   file is smaller and needs no core-js. `tools/build-pdfjs.js` takes the minified files too
   (`pdf.min.mjs` → `pdf.min_<v>.js`); switching is `scripts/config.js` plus the sources comment in
   `index.html` (TODO).
2. **Polyfills, and how they fail.** `tools/pdfjs-polyfills.js` is prepended to both scripts; each
   built-in is defined only when missing (`Map` / `WeakMap` `getOrInsert[Computed]`, `Math.sumPrecise`,
   `Promise.withResolvers` / `try`, `Uint8Array.fromBase64` / `toBase64` / `toHex`,
   `ArrayBuffer.transferToFixedLength`, `Set` methods, `URL.parse`, `AbortSignal.any`, `Iterator`
   helpers). A missing one is **invisible in headless tests** — the test Chromium is always newer than
   the user's browser — and breaks every PDF at once (`this._intentStates.getOrInsertComputed is not a
   function`). Any pdf.js update must be tried in the oldest browser Kelk supports.
3. **Nothing fetched.** `getDocument` gets `useWorkerFetch: false`, `useSystemFonts: false`,
   `disableFontFace: true`, `isEvalSupported: false`, and a `BinaryDataFactory` that answers only
   wasm requests — from `vendor/pdfjs/wasm/<name>.js` (base64, `window.KelkPdfjsData`), loaded on the
   first image that needs a decoder. cMaps and standard font data are not needed for reading text
   positions.
4. **`fontExtraProperties: true`** keeps the font program data (`f.data`), the FontMatrix, `isType3Font`,
   `isMonospace`, bold / italic flags — the repairs of §4 need them.
5. **pdf.js may take over the buffer**: the importer keeps a copy (`this._raw`) for its own raw
   reading of objects (ActualText, XMP, embedded font files).
6. **Errors as codes**: `err.code` is `'password'` (a user password; the `password` option opens it),
   `'invalid'` or `'open'`, so the page can say it in the interface language.
7. **Metadata read once:** `Producer` + `Creator` (`r.producer`, kept as it was), `Language` (`r.lang`;
   Chrome / Edge write `en`, Word `fa` / `en`, LibreOffice `en-US`, headless Chrome nothing),
   `MarkInfo.Marked` (`r.tagged`), the outline, the page labels and the raw XMP — all of it read into
   the provenance profile (§2a). The structure tree and the outline are **not used for layout yet**
   (TODO).

8. **One page cannot sink the document.** A page whose extraction throws stays empty; one whose layout
   throws gives its lines as plain paragraphs, top to bottom (the words kept). Both are noted
   (`pageFailed`, `r.failedPages`) and the import goes on. A file pdf.js cannot open at all still rejects
   with its code.
9. **The thread is given back.** pdf.js runs its worker on the main thread (1.), so a long import held the
   interface: 145 pages blocked it for 3.1 s at once. `_yield()` returns to the event loop whenever the
   thread has been held 30 ms — between pages in extraction, in `_lines`, in the page layout, between
   fonts in the GSUB repair — and the Markdown step converts in chunks of top-level blocks (about 30 000
   characters of HTML; the blocks are independent in Markdown, and the lab checks the chunked result
   equals one call's, byte for byte). The longest hold on those 145 pages: 267 ms.
10. **Cancelling:** `options.signal` (an AbortSignal) is checked at every yield; an aborted import rejects
   with `err.code === 'aborted'` (the page says nothing then).
11. **Memory and double work:** each page's pdf.js caches are released (`page.cleanup()`) once its blocks
   are made; the text content (`getTextContent`) is no longer asked for at all — it was only counted, for
   the no-text note, and the glyphs count the same (145 pages: 8.1 → 7.7 s).

pdf.js is vendored **as released**: no patch of its own. Everything pdf.js does not give is read
from the raw file by the importer (§4).


## 2a. Provenance: who made the PDF

`_provenance()` (the pure function `PdfImporter.provenance`) gathers what a PDF says about where it
came from into one object, `r.profile`. It runs twice: from the file's own words when it is opened
(Info, XMP, page labels, MarkInfo), and again, completed, once the pages are read (the embedded fonts,
the share of invisible text, the share drawn in Type3 fonts, whether a structure tree reaches the
first pages). It decides nothing about layout — §1's "no producer switch" stands. It is evidence:

| Field | What it holds, and from where |
|---|---|
| `engine` | what drew the file: `skia`, `quartz`, `gdi`, `word`, `excel`, `powerpoint`, `libreoffice`, `wps`, `qt`, `jspdf`, `tex`, `indesign`, `distiller`, `cairo`, `weasyprint`, `prince`, `reportlab`, `fop`, `itext`, `ghostscript`, `ocr`, `unknown` |
| `app`, `version` | the application (Chrome, Edge, Safari, Word, Writer, Calc, wkhtmltopdf, Google Docs, pdfTeX …) |
| `os` | `{ value, confidence, evidence[] }` — see below |
| `path` | `export`, `print` (Print to PDF, Distiller), `postprocessed`, `ocr`, `unknown` |
| `postprocessors` | tools that rewrote the file after its maker: Ghostscript, iLovePDF, qpdf, pikepdf, Acrobat Pro, PDFium … |
| `tagged`, `outline`, `pageLabels`, `lang`, `pdfVersion` | what the producer wrote about structure |
| `text` | `invisible` (text drawn in render mode 3 / 7: an OCR layer over a scan), `type3` |
| `hyphenates` | does the maker hyphenate by itself (§8.6) — the one value a rule reads, as before |

**Creator before Producer.** Producer is often a library or a later tool; Creator is the application.
When Producer names a post-processor (Ghostscript, iLovePDF, Acrobat Pro) and Creator another maker,
the maker wins and the tool goes to `postprocessors`. The XMP's `pdf:Producer`, `xmp:CreatorTool` and
the `stEvt:softwareAgent` entries of `xmpMM:History` count the same — a file whose Info was stripped
still tells its maker there. "Adobe PDF Library" is no post-processor: it is InDesign's, Illustrator's
and PDFMaker's own Producer.

**The OS** matters less than the engine (Quartz on every Mac app, GDI behind Print to PDF), but it
picks the fonts and the shaping engine (DirectWrite, CoreText, HarfBuzz) — which is what decides
ToUnicode quality for Arabic script. It is read with a confidence:

| Evidence | Confidence |
|---|---|
| a desktop Chrome / Edge User-Agent in Creator (`Windows NT`, `Mac OS X`, `X11; Linux`, `Edg/`) | 0.95 |
| Quartz's `macOS Version …` / `iOS Version …`; Microsoft Print to PDF (Windows only) | 0.95 |
| the platform in a tool name: `InDesign 19.0 (Macintosh)`, `Distiller 23.0 (Windows)` | 0.9 |
| fonts that ship with one OS only (Segoe UI, Tahoma · SF, Helvetica Neue, Menlo, Geeza Pro · DejaVu, Ubuntu) | 0.4–0.55 |

Fonts are a hint only: Calibri or Cambria say Office (on any OS), LibreOffice ships DejaVu and
Liberation everywhere (its Linux hint is weaker still), and jsPDF / Kelk and TeX embed their own (no
hint at all). Headless Chromium writes "Chromium" as Creator, so the lab's PDFs show no User-Agent: the
desktop strings are tested on the pure function (`tests/pdf-lab/scripts/profile.js`, 27 cases taken
from real files — Word on Windows and on a Mac, Safari, Print to PDF, InDesign, Distiller, PDFMaker,
Ghostscript and iLovePDF over a maker, an OCR layer, XMP without Info …).

What it is for: the user's message ("made by Microsoft Print to PDF: its links are not in the file"),
the test matrix (which engine × OS × path a set of real files covers), and the priors of the steps to
come (the structure tree weighed by how much its producer is trusted). None of these is wired yet.


## 2b. The structure tree: read, measured, not yet used

A tagged PDF wraps its text in marked content (`BDC /P <</MCID 5>> … EMC`) and keeps a tree of
elements (`H2`, `LI`, `TD` …) whose leaves point at those MCIDs. `_structure()` puts the two together:

1. **Extraction** keeps, per glyph, the innermost MCID of the page's own marked content (`g.mcid`; a Form
   XObject's MCIDs belong to the form's StructParents and are left out) and whether it lies in an
   `/Artifact` (`g.artifact`: running heads, page numbers, decoration).
2. **Each page's tree** (`page.getStructTree()`, RoleMap applied by pdf.js; `Heading 1`-style names
   brought back to `H1`) maps MCID → element. A glyph in it gets `g.struct`: its element, and the
   nearest element that **names** something — a heading and its level, a list item and its list depth, a
   table cell with its row and column (counted through THead / TBody), code, a quote, a caption, a note.
   Leaves pointing at another page's content are not taken.
3. **Measured:** `cover` (the share of the text, artifacts aside, the tree reaches), `sem` (the share it
   names), and **`trust` = cover × min(1, sem / 0.05)** — reliability, not richness: a tree that names
   anything at all is as good as its reach (prose is `P`, rightly: Chrome's tree of a page of symbols names
   10 %, of a report 80 %), one that names nothing is worth nothing (LibreOffice Calc: tagged, one empty
   root, cover 1 %). The numbers go to `r.profile.tagged` (with the roles and the heading counts); the
   named elements and their text to `r.structure` (null for an untagged file).

What it showed at once (lab, October 2026): the trees' headings, level and text, against the sources'
— Chrome tagged 100, LibreOffice from .docx and pandoc 100, LibreOffice from HTML 92.6, the tagged fuzz
files 99.5 — where the importer's own headings on those same fuzz files score 93.3. That is the room the
next step has: the tree as a prior, weighed by `trust` — used for headings (§8.4) and tables (§8.3); lists
showed no room. Chrome's
trees name no quote and no code (they are `Div`), so those stay geometric.

---

## 2c. How the file is drawn: `r.features`

The profile (§2a) names the producer; producers are countless, and a new one is rarely new in what it
does. `_features()` describes the pages instead — the choices every producer makes, whatever its name —
once, after the repairs and before the layout. It is evidence only: no rule reads it.

| Group | What is measured |
|---|---|
| `text` | script (ltr / rtl / mixed); Arabic as presentation forms or plain letters; glyphs the file left without Unicode (`noToUnicode`, kept as `g.noMap` since the repairs clear `unmapped`) and those still lost; word spaces drawn as glyphs or left as gaps, the median word gap and letter gap in em; condensed type (`Tz`, `g.hs`), tracking (`Tc` in em, `g.track`); text invisible, turned, inside Form XObjects, over pictures, marked `/Artifact` |
| `fonts` | the share of characters per font kind: CID, TrueType, Type 1, Type 3; not embedded |
| `graphics` | fills, rules, vector parts and pictures per page, the largest picture's share of the page; transparency and soft masks, clips, pattern fills, forms, groups (counted during extraction, `page.stats`) |
| `structure`, `pages` | tagged and trusted (§2b), the outline; paper sizes and orientation, `/Rotate` |

`cells` lists the same as a few **axis=value** pairs (`spaces=gaps`, `arabic=letters`, `pictures=pageSize`,
`text=overPictures` …). `tests/pdf-lab/scripts/features.js` counts the lab's PDFs per cell — the
**coverage matrix** — and shows, for any other folder, the cells of each file no lab PDF has: the first
question about a new file is then not "have we seen this producer?" but "which ways of drawing has the lab
never tested?" — and the answer is the next lab PDF to make. At its first run (October 2026) the lab had no
PDF with ordinary pictures, landscape paper or pattern fills, and one with Arabic as plain letters; a user's
real files that came back poorly sat in exactly those cells.

## 2d. Self-diagnosis: `r.quality`

Some pages come back worse than their text layer allows, and the reader cannot tell which. After each
page's layout, `_pageQuality()` measures three cheap signs on the page's lines and blocks:

| Flag | Sign | Threshold |
|---|---|---|
| `lostGlyphs` | glyphs whose text could not be found (U+FFFD) | 5 or more, 2 % of the page's glyphs |
| `suspectSpaces` | words glued together: Arabic-script words of 12 letters or more (ZWNJ and marks not counted), Latin ones of 20 | 3 or more and 4 % of the words (Latin: 4 and 3 %) |
| `textInPictures` | text lying under a figure the importer cropped (the words may be in the picture only) | 20 glyphs or more, 10 % of the page's |

`r.quality` = `{ pages: [{ page, glyphs, lost, covered, words, glued, flags }], flags: { code: [pages] } }`;
each flag also becomes a note (`notes`, translated by the page with its pages listed). The thresholds were
set on the lab (no flag on its 106 PDFs but the one that is glued) and on a user's real files: the four
Prince letters with lost spaces, a PowerPoint export whose text lay 89 % under its pictures. It measures,
it does not repair: what is done with a flagged page is the fallback ladder's (§7a).

## 3. A PDF made by Kelk

`_kelkSource()` looks for Kelk's own Markdown first: an XMP packet with `<kelk:source>`, or an
attached `*.md` file. If one is there, it is returned unchanged (`r.source === 'kelk'`, note
`kelkSource`) — lossless. PdfBuilder does not write either yet (TODO); until it does, Kelk's PDFs
take the layout path like any other, and `tests/builder-suite.html` measures that path on every
test case (§11).

Writing the source is **last on purpose**: the importer is judged on PDFs from other programs, and a
lossless Kelk → Kelk path would hide layout bugs from the round trip. When PdfBuilder writes it, the
round trip must keep reading without it (the builder suite's PDF → MD column already reads "layout
only, no embedded source").

**Formulas** (round 27) are the exception, written now: their vectors cannot be read back as TeX by any
layout rule, so PdfBuilder keeps each formula's TeX in the file — a marked-content span with `/ActualText`
(`$…$` / `$$…$$`) round its drawing, and a map in the XMP (`kelk:math`: base64 of UTF-8 JSON `{ v: 1, math:
[{ p, x0, x1, y0, y1, b, d, t }] }` — page, box and baseline in PDF space, display, TeX; `_kelkMath`). The layout
path still runs; only the formulas come from the map (`_mathIn`, extract.js, before the font repairs): on each
page what is drawn inside a formula's box goes (its vector glyphs and rules, or the picture of a right-to-left
`\text`), and one glyph stands in its place — as wide as the box, on the baseline of the text beside it, in that
text's font and size (a display formula in the page's body font), carrying the TeX (`g.math`). Lines,
paragraphs, list items and table cells are built round it as round a word; the writer gives it back as Kelk's
placeholder (`<span class="kelk-math" data-tex>`), and the Markdown as `$…$` / `$$…$$`. An entry with nothing
drawn under it is skipped (a file whose pages were moved or merged after Kelk wrote it). Note `kelkMath`. Before
the map, a Kelk report with ten formulas read at 61 (words lost, formulas as pictures, lines as list items); now
100, and every case of `tests/math-cases.js` comes back exactly in English and Persian text
(`scripts/math-roundtrip.js`). Lab: `kelk--math`, `kelk--fa-math` (`make-math.js`).

---

## 4. Extraction and Unicode repairs

### What one glyph is

`{ ch, x, y, w, size, font, space, color, page, unmapped, mcid … }` — `x, y` the origin in page
space, `w` the advance in points, `size` the effective font size (matrix included). Widths come from
the font's widths times the size; for **Type3 fonts** the unit is the font's own FontMatrix, not
1/1000 — Chrome / Skia writes variable fonts (Inter, Segoe UI Variable) as Type3 with a matrix of
1/2048, and with 1/1000 every word ran together. Inside a **Form XObject** every glyph and path takes
the form's matrix (`paintFormXObjectBegin`) on top of the CTM: Chromium's PDF of Kelk pages came out at
half the coordinates without it.

**Page space is the page as a viewer shows it.** A page turned by `/Rotate` (Word's landscape page: portrait paper,
the content turned a quarter by `cm`, `/Rotate 90`; a page scanned upside down, `/Rotate 180`) is read in its
upright frame — user space through pdf.js's viewport, y up again, at the page's own origin (`_pageFrame`): the
operator walk starts with that frame as its CTM, the link rectangles and the page box go through it, and a page
rendered for a figure's crop or an OCR layer's ink maps upright points back (`_pageViewport`). Read in user space,
a quarter-turned page came out in columns of single letters and an upside-down one with every line reversed (meta
`rotate90` / `rotate180`: 0/24 → 24/24 byte-identical to their seeds). A page with no `/Rotate` is read as it is.

Spaces: a glyph is a space only when it maps to one (`code 32` is reused for other glyphs in subset
fonts — LibreOffice's "2": "20 square meters" became "0 square meters", which looks like a lost digit,
not a space problem); wkhtmltopdf draws a tab as the space glyph; Chrome / Skia map a ZWNJ to
U+0020 with zero advance (it becomes a ZWNJ again, not a space).

### Paths

Rectangles (filled or stroked), horizontal and vertical segments (`hsegs`, `vsegs`), small marks
(`small`: discs, squares, rounded squares — bullets and checkboxes), vector clusters (figures,
formulas drawn as paths) and images. Things worth knowing:

- Word draws every **cell border as a thin filled rectangle**; a thin rectangle is a rule.
- Microsoft Print to PDF (GDI) draws **many rectangles as sub-paths of one path**: the path is split
  and each rectangle classified on its own.
- Skia draws a **rounded corner as several curves**; a rounded square with straight sides is a
  browser checkbox (`rbox`) when every point lies on an edge or in a corner zone.
- **A thin frame band is two rules**: Prince draws CSS `inset` / `outset` cell borders as two L-shaped filled
  bands a cell, mitred at the corners (dark above and left, grey below and right) — no rectangle, no segment, and
  the ruled table came apart into lines. A filled polygon of straight sides whose area is that of a band under 2.2
  pt wide gives its outer edges, those along its box, as rules.
- **A thin straight filled shape is a rule, whatever its ends**: Firefox draws a collapsed table's outer
  borders as thin trapezoids, mitred at the corners — not rectangles, so not rules, and the table lost its
  outer columns and last row.
- **A fill with a pattern is a picture** (Skia paints an image as a rectangle filled with a tiling pattern:
  Firefox's encyclopedia thumbnails): from 12 pt each way it goes with the images, not the fills or boxes.
- **A dashed or dotted border is a rule**: Chrome fills each dash of a `dashed` / `dotted` border as a rectangle of
  its own. A run of four or more small marks of one size and colour on one line (20 pt long at least), each the
  next's neighbour by less than a few dash lengths — a dash long along its run (1.5 × its thickness) or a dot of
  1.6 pt at most — is one rule, and its marks are no bullets: the frame's left side stood beside every line of a
  dashed code block as a bullet, a list item a line, the code lost (fuzz dev: code +10, lists +6).
- **Turned glyphs** (a text matrix that is not upright: a web page's vertical side tab) are marked; they form
  lines only among themselves (§6), and are furniture in a side zone (§6a). Rotated text as such is not rebuilt.

### Glyphs with no Unicode — how they are found

pdf.js does not expose the ToUnicode map, so "no Unicode" is inferred per glyph:

- `unicode === ''`;
- a **composite font** (Identity-H CID) whose glyph came back as `String.fromCharCode(cid)` with the code
  in 0x100–0x2FF: pdf.js fell back to the CID as a code point. That is how an InDesign book's ligatures
  and small capitals read "Ŏśśŗśţ.ŏśř" — Latin Extended letters that were never in the text;
- a **Private Use Area** code in a **text** font: Adobe fonts give OpenType ligatures their own PUA code
  (AGaramond Pro: "Th" → U+E053). Symbol, icon and emoji fonts use the PUA on purpose, so they are
  excluded by name (emoji, symbol, wingding, webding, dingbat, awesome, icon, material, zapf, marlett);
- Adobe's PUA small capitals and old-style figures (U+F721–U+F77E) are mapped at once, `code − 0xF700`
  (U+F762 → "b": a typeset book's small-capital credit line);
- a CID code ≥ 0x300 read as the character of the same number is kept but marked a **guess**, checked
  against the embedded font later (Cambria Math's script-size variants).

What stays unknown after the repairs is **dropped**: a stray Latin Extended letter is worse than nothing.

### Glyphs with no Unicode — the repairs, in order

1. **`/ActualText`** of marked content (`BDC … EMC`). pdf.js keeps only the MCID, so the importer reads
   the page's raw content stream (`_rawIdx`, `_rawStream`, inflated with `DecompressionStream`), pairs
   the n-th `BDC` of the stream with the n-th `beginMarkedContentProps` of the operator list, and gives
   the text to the glyphs it covers. Chrome uses it for list numbers and the minus / dash signs of
   variable fonts. A page dictionary packed in an object stream (qpdf, Word for Microsoft 365) is found there
   (`_rawObjStms`): it was looked for among the plain objects only, and its ActualText went unread — list numbers
   restarted at 1, a dash and a mark were lost (the metamorphic `objstm` transform: Chrome's tagged files −14.6 and
   −3.0 → 0). Not read from other filters or encrypted files; when the BDC counts differ, nothing is changed.
2. **GSUB ligatures** (`_gsubRepair`): the embedded TrueType / OpenType font is read (cmap, post, GSUB, and
   for some rules glyf), a ligature glyph is traced back to its letters ("ﬁ" → "fi") — found through the
   FontDescriptor's `/FontName` → `/FontFile2` (pdf.js's font ids do not say which file). **One name can stand
   for two programs**: InDesign embeds Dana-Bold as a CID font and again as a WinAnsi one, and Chrome writes one
   BNazanin subset per run of text. The program is taken by the font's kind (a CID font's descriptor is the one
   a `/CIDFontType2` points to), and between two of one kind by the one whose cmap agrees with the font's text
   on most glyphs; a tie is no choice. (The first version took the first program by name: Dana-Regular's
   ToUnicode was checked against the WinAnsi subset's cmap, which "corrected" its digits.) A stream is
   inflated as far as its data goes, cut at its own `/Length`: B Mitra's font program in Microsoft Print to PDF
   has bytes after its end, and the browser's strict reader gave nothing — every repair of that font was off.
   A font with **no cmap** (a subset) is still read: its outlines serve the bracket and mark rules below.
   **Descriptors packed in object streams** (`/Type /ObjStm`: Word for Microsoft 365, qpdf, post-processors) are read
   too (`_rawObjStms`): the font programs themselves are streams and never inside them, but the descriptors that name
   them are, and a file that packed them found no program — every repair that reads one was skipped (a Persian list's
   brackets came back «)…(», a ZWNJ was lost; the metamorphic `objstm` transform: the Persian Word file −50 → 0).
   **A composite font with no ToUnicode at all** (`_gsubByCode`: every code read as the character of its own number,
   three codes at least and no more than one in fifty read otherwise; its codes its glyph ids — `_cidGlyphIds`, per
   font from its own CIDFont dictionary, packed or not: Identity or no map, or a CIDToGIDMap stream that maps every
   code it draws to itself; a font whose CIDs are the Unicode values, mapped to glyphs by a stream, is read by no
   program at all — its codes as glyph ids had turned a correct «Quarterly Report» into «nì~êíÉêäó oÉéçêí», and
   packed by qpdf the file-wide test before it saw no map: «nì~êíÉêäó=…») is named glyph by
   glyph from its program (`_gsubByCodeGlyph`): a ligature by its letters, a form by the glyph it replaces, then the
   cmap's character, the cmap's space a space where it has room — every glyph, not only the codes marked unmapped or
   guessed (a code under 0x100 read as itself is no character either: a Chrome subset's "Quarterly" came in as
   «4XDUWHUO», every word gap «�»). Of several programs under its name, the one whose advances are the font's
   widths on every code it draws (`_gsubByWidth`; two that name the glyphs otherwise are no choice): such a font
   has no text to agree with — Chrome writes one subset per run, Kelk one Vazirmatn per weight. A descriptor's name
   with `#20` in it (Kelk's `/Vazir#20Code#20Hack`) is decoded to find its program. The metamorphic `noToUnicode`
   transform: −81.0 → −46.1, 11 of 24 seeds exact (Chrome's TrueType subsets, Kelk, Word, PowerPoint, iText,
   Acrobat); what stays lost has no Unicode anywhere in the file — Chrome's Type 3 fonts (glyphs named `/g300`),
   LibreOffice's and Prince's subsets (symbol and Macintosh cmaps only, `post` 3), wkhtmltopdf's (no cmap).
   **A guessed glyph** (a CID read as the character of the same number) is resolved through the font's own
   names, in order:
   - its cmap, through the GSUB substitutions back to a base glyph (a swash form → its letter);
   - its **post table name** (`uniFE97`, `u1F600`, `uni0647.init`): Microsoft Print to PDF keeps a font's whole
     glyph set, its cmap only the characters typed, but the names stay;
   - **a joining form with no name at all** (a calligraphic font's ه initial, ح medial): the font's `init`,
     `medi`, `fina` lookups say which form a glyph is, and fonts lay their Arabic glyphs out in the order of the
     presentation forms block — so the named glyphs nearest it on either side, counted from, give its code;
     kept only when that code is the form the lookup makes, and both sides do not disagree;
   - else, **a guess in a block of Unicode no mapped text of the document uses, inside a word of another
     script** becomes U+FFFD (a salutation had Bengali গ ূ and Malayalam ൑ in it): the code was the glyph's number,
     not a character. A document all in guesses (CJK with no ToUnicode) keeps them.
3. **Widths and the document's own letter pairs** (`_repairUnmapped`), per font:
   - **ligatures**: a glyph between letters whose width is the sum of known letters' widths (fi, fl, ff,
     ffi, ffl, Th, st, ct …). Width alone cannot tell "fi" from "fl" — nearly the same width — so the
     document's own letter pairs (bigrams of its mapped text, and the letters around each occurrence)
     decide. A letter the font never shows alone (the T of a "Th" when its only T is in the ligature)
     gets a width estimated from Times proportions, scaled by the median ratio of the letters the font
     does show, and a looser tolerance (0.20 against 0.16);
   - **small capitals**: their codes are consecutive in the font (a.sc … z.sc), so one offset per cluster
     maps them all; the offset is scored by English letter frequency and hits on common words, and
     needs several distinct word hits and a clear margin over the second best. **A cluster of ten codes
     or fewer is old-style figures, not letters** — without that rule digits were "solved" into words.
4. **Symbol fonts**: Symbol, Zapf Dingbats, Wingdings / Wingdings 2 map to their signs (Word's
   bullet is Symbol U+F0B7; Word's list bullets in the private-use area, whatever font drew them). The
   font may be recognisable only by part of its name: InDesign embeds Zapf Dingbats as `Dingbats`, with
   its builtin encoding and no ToUnicode, and pdf.js returns ASCII ("k" for ❋). The standard Zapf
   encoding (0x21–0x7E) is a short table built from runs (`0x49–0x6B → U+2729…`, `0x6C → ●`, `0x6E → ■` …).
5. **Colour emoji drawn as layers** (Microsoft Print to PDF with Segoe UI Emoji): COLR v0 layers are
   stacked glyphs at one origin; the colour table of the embedded font gives the base glyph. When the
   base glyph has no cmap entry the emoji is cropped as an inline picture (`g.pic`).
6. **Chrome's list numbers** (`::marker` text in tabular digits with no ToUnicode): a `"1."`
   placeholder the list code renumbers.
7. **Modifier letters** sharing a glyph with quotes (Inter, Segoe UI): U+02EE → ”, U+02BC → ’.
8. **A control character as a glyph's text** (U+0000 …: a Stripe invoice's hyphens, colons and brackets in
   Inter, whose ToUnicode says `<0000>`) asks for the repairs like an unmapped glyph: its `/ActualText` first
   (the invoice wraps each in `/Span <</ActualText (-)>>` — pdftotext reads that, pdfminer does not), then the
   embedded font's own cmap (`g2u`).
8a. **U+FFFD as a ToUnicode entry** — the producer saying "no character" — in a simple font that maps its other
   ASCII codes to themselves (nine in ten on the page, ten at least, or all of them, four at least) is the code's
   own character. A book's table of contents from Adobe PDF Library (InDesign) draws its dot leaders with the
   body font's period, maps that one code to U+FFFD, and wraps the run in an `/ActualText` of a control character
   (U+0008: the tab the leader stood for): every entry's leader came back as a row of «�», and the entries ran
   into one paragraph (the leader rule, §8.2, looks for dots). Lab: `pdflib-book--book-front`.
9. **A ToUnicode that names a glyph otherwise than the font's own cmap — by a twin.** Word and Microsoft Print
   to PDF write the ToUnicode from the text typed, the embedded font's cmap names the glyph drawn; where they
   differ only as twins, the cmap's name wins (each case checked per glyph, nothing else changes):
   - **a mirrored bracket**: the ")" shape at the right end of «ماده (1)» named "(" — the logical character.
     Step 3 mirrors shapes on right-to-left levels; the logical name mirrored again read ")1(";
   - **an Arabic letter named by its base letter, while the cmap names its presentation form** (ﯽ ﮐ ﻢ …): the
     form says how the glyph joins — the ZWNJ repair (§6) reads a broken join from it, and Word draws no
     ZWNJ at all («تفاهمنامه», «همکاریها») — and which letter it is: GDI names the Persian yeh and kaf by the
     Arabic ي ك. A glyph the cmap names by a plain letter, in a font whose cmap has presentation forms, is
     that letter's **isolated** form (the base code maps to it), and a Persian font names one glyph by both
     ي and ی — the ی it is. Only the same letter or the yeh / kaf twins — and teh marbuta: Word names a ۀ
     glyph (the cmap's ﮥ) by ة, «نحوة» for «نحوۀ»;
   - **a digit named in one system by the ToUnicode and in another by the cmap**, the same value: Word names
     each digit glyph as it was first typed («4-۳», «12۳4۵»); the font's name gives one system. Not where the
     cmap names the glyph in every system (B Mitra's ۴ is 4, ٤ and ۴) and the ToUnicode names all the font's
     digits in one: Microsoft Print to PDF's «١٢/٣/٤» stays, it had become «12/3/4»;
   - **the rule for digits, in short: the character the file names is the character written.** Many Persian
     fonts (Dana, Iranian Sans, Vazirmatn, B Nazanin …) draw ASCII digits in Persian shapes: an ASCII code stays
     ASCII however it looks — the importer never turns it into Persian (or Arabic-Indic) digits by its shape —,
     and a Persian or Arabic-Indic code stays as it is. The one exception is the case above: a font whose
     ToUnicode names its digit glyphs in two systems at once (Word's «4-۳»), where the file itself is
     inconsistent and the font's own cmap decides between the two;
   - **a bracket the ToUnicode names by the other of its pair**: InDesign's Dana-Bold names the "(" glyph ")",
     Dana-Regular in the same file names it "(" — «)نمونه(». The **outline** decides (glyf, simple glyphs):
     a bracket whose ink at mid-height lies left of its middle looks like ( [ { < «, the other way like its
     mirror; the shape is what step 3 mirrors.
10. **What cannot be repaired is shown, not hidden**: a glyph still mapped to a control character
   (wkhtmltopdf's colour emoji) becomes U+FFFD in the output.

### Text drawn twice, text drawn over

- **A second text layer** laid exactly over the first (a web app's shadow or selection layer; Opera's PDF of
  claude.ai read "SSeettttiinnggss"): a second copy of a character at the same origin (0.3 pt) and size goes,
  before anything else reads the glyphs.
- **Fake bold** — each letter (and space) drawn again right after itself, a hair to the side: under 0.08 em and a
  quarter of its width, looking back two glyphs (a space and a letter drawn, then both again) — is one letter.
  PDFium prints Word's that way: a letterhead's «بسمه تعالی» read «ببسسممتتلل هه ععاایی». Its boldness is not
  kept (a bold letterhead line would read as a heading).
- **A calligraphic line** (lines.js): in a font whose box is over 2.2 em tall or whose name says so (Nastaliq,
  Shekasteh, Diwani, Thuluth — Word's IranNastaliq subset has a box of 1.1 em), Arabic-script letters of one size
  that touch — within half an em in height, an em across, in whatever order they are drawn — are one line, at
  their middle height. «بسمه تعالی» came apart into «بسمتل» over «ه عای»; Prince draws a line's words out of order
  and set the last «محمد» 6 pt up («محمد صلوات بر محمد و آل»); a cover title at 65 pt stacked its letters 24 pt.
  (Not an emoji font: its box is as tall.)
- **Text outside a small clip** (a box an eighth of the page or less: a Word text box in the margin, its heading's
  copy cut to nothing) is not shown and goes; a page's or column's clip does not count — the ends of overflowing
  code lines are still the reader's.
- **Text a later opaque fill covers** is hidden from the reader — the page under a dialog or a banner — and
  goes. Each glyph and each fill keeps its place in the drawing order; a fill hides only when it is fully
  opaque (`ca` 1, normal blending, no soft mask in force), drawn outside any group that defines a soft mask,
  and only where its clip lets it show (Skia fills a large rectangle under a narrower clip: `re W n`, then
  `re f`). The first version took a soft mask's own luminosity rectangles and a scroll fade for covers, and
  hid a whole visible sidebar; with masks and clips counted it hid exactly the title of the chat page behind
  claude.ai's settings dialog. **A banner shaped by a soft mask (rounded corners), or drawn as a filled path,
  covers too when it carries text of its own drawn after it** (a cookie banner, a dialog — a fade or a shadow
  carries none), at least 40 pt each way and 10 glyphs, and only inside its corners (an inset of 12 pt or 15 %):
  a web page's cookie banner had the card text under it read into its own lines. Its own text stays where it
  is drawn, between the page's blocks (moving it after the page broke the links and the lists around it).
  **Text drawn on a cover takes only a link lying on that cover** (the last cover drawn under it — a page's own
  background is one too): a home page's cookie banner, laid over a news card that is one link as a whole, gave
  each of its lines and buttons the card's address (`chrome-layers--banner`).
- **A guessed character** (no ToUnicode; the code taken for the character) in a Unicode block no mapped text
  uses is replaced by «�» only when it is a letter inside a word of another script — a guessed «—» between
  letters is the dash (an OCR layer's «legacy—mode»).
- **Text too small to read** — under 2 pt, on a page whose text is of a reading size (a median of 6 pt or
  more) — goes: a Word letterhead's 1-pt code in its logo, a printer's stamp. A page drawn small is left
  alone.
- **A watermark drawn as text** goes (`_watermark`, rule `extract.watermarkDropped`): a run of glyphs turned
  off the axes (more than 15° from 0 / 90 / 180 / 270), at least 1.5 × the page's upright body size, spanning
  40 % of the page's shorter side, and faint against what is behind it: a *neutral grey* (channels within 0.08
  of each other) shown at 60 % opacity or less, or light (every channel 0.7 or more, #b3b3b3 and lighter), with
  not half of its letters over a picture or a dark fill (luminance under 0.6) drawn before them. A page keeps its
  text: one with fewer than 20 upright body glyphs (a poster whose only words are on the diagonal) is left as it
  is. All are asked — what a designer sets on the diagonal is content: a white title on a dark band, a coloured
  heading at half opacity, a pastel line, a mid-grey (#999) chart label, a table's turned header or a side label
  (on an axis), a turned caption of the body's size, a black diagonal title, light grey upright text stay. What
  is dropped is told: note `watermarkDropped` in `r.notes`, its message naming the words and pages (the page
  record's `.watermark`). The metamorphic `stamp` (pdf-lib's diagonal «CONFIDENTIAL DRAFT», #999 at 30 %) read
  its letters into the lines and blocks they fell across (−32.7).

### Numbers in right-to-left text

**A space under ink** (rounds 21–22, `finishLine`). A word's last letter set apart by a space — «وضعی ت», «ورز ش‌شناسی»,
«نیرو ی», a date «08/ 02/ 1403» — came from spaces the reader never sees, two habits:
- **a space glyph under a glyph**: Acrobat's PDFMaker draws a space at the very origin of the letter before it, under it
  (the final sheen of «ورزش‌شناسی», with a ZWNJ); Word draws an isolated yeh after waw over a space of its own
  («نیروی»), a date's «/» over one. A space four fifths covered by the ink box of a glyph beside it — a letter of a
  right-to-left script, a digit or a separator — is gone. A symbol's box may run over a gap the reader does see
  (LibreOffice's «₿» from a fallback font, «₿ 0.25»): it does not count;
- **a segment of nothing**: PDFMaker sets a zero-width ZWNJ at each run's start, a text object of its own, its origin
  a hair inside the run's leftmost letter — in a right-to-left run, the word's last letter. As a segment of its own
  it was joined to its cell's text with a space, inside the word («وضعی ت»). A row of nothing drawn (spaces and
  zero-width ZWNJ, ZWJ) is no line.
A space the file draws with room of its own stays, as drawn (a word the page itself shows apart).

`bidiLevels` follows the Unicode algorithm's weak rules for numbers, on visual input. **W2**: a number whose
strong letter before it in the text (on a right-to-left line, the nearest one to its right; the search stops at
a gap wider than a word space — a table's next cell) is an Arabic-script letter is an Arabic number, and
Arabic-Indic digits always are; **W4**: a common separator (`, . : /`, ٬ ٫) joins two numbers of one kind, a sign
(`+ -`) only European ones; **W5**: a terminator (`% #` ٪ …) attaches to European numbers only. So «قاعدهٔ ۳-۲-۱»,
drawn «۱-۲-۳» left of the word by Chrome, Word and LibreOffice, reads «۳-۲-۱», and «۱۰٪» drawn with its sign
at the left reads «۱۰٪». The Arabic separators and percent sign are classed before the letters (they lie in
the Arabic block). InDesign's composer and Kelk's PdfBuilder set every number as a European one: the
provenance profile names them (`engine` `indesign`, `jspdf`), and their files are read so (`joinSigns`) — the
one place the importer reads a producer's name for layout, because no geometry can tell the two conventions
apart.

### Numbers and letters on the way out (settings)

The text is read as the file names it; two settings then write it out, both on by default, at the last step
(`_writeOut`, called by `_inline` — after the reading order, the tables and the scorer's view of the glyphs):

- **`asciiNumbers`** («numbers in ASCII»): Persian and Arabic-Indic digits (۰–۹, ٠–٩) become 0–9, and inside
  a number — between two digits — the Arabic thousands separator ٬ and the Arabic comma ، become `,`, the
  decimal separator ٫ becomes `.`; the percent sign ٪ beside a digit becomes `%`. Persian uses the same code
  points for all four, so there is nothing more to map. A comma between words stays «،», a separator not
  between digits stays, code (inline or a block) is never touched.
- **`persianLetters`** («Persian letters»): in a **Persian document** — three or more of the letters only
  Persian writes (پ چ ژ گ), at least 0.3 % of its Arabic-script letters — Arabic ي ك ى become ی ک ی. An
  Arabic document keeps its letters, and so does an Arabic quotation in a document that is not Persian.

Why these defaults: some producers name the Persian letters by the Arabic ones whatever was typed (GDI /
Microsoft Print to PDF's ToUnicode, some Word exports), and a document's numbers are easier to search, sort and
align in ASCII; the user who wants the file's own characters turns either setting off (Settings → Import). The
lab's scoring runs both off — it measures the reading, not the writing out (`scripts/writeout.js` checks the
writing out on its own).

### Shapes that lie

The repairs of step 3 read a lost ZWNJ from the shapes: a dual-joining letter drawn not joining forward, or the
next letter drawn not joining back, means a ZWNJ stood between them. That holds only where the font names its
glyphs truly. A PowerPoint export named them so that three initial forms stood in a row (ﺷ ﻣ ﻧ) and waw was
isolated after heh — and every such word got a ZWNJ («ه‌وشمند», «داوط‌لبان»). `_layout` counts, per font,
the touching pairs whose shapes contradict each other (one joins toward the other, which does not join
back); a font with three or more, over 5 % of its pairs, lies. Which way it lies matters. PowerPoint in Arial
draws a medial noon with the initial glyph and reh after meem with the isolated one: it lies only about joining
**back** (`_lyingBack`) — its forward join is still true, and a final yeh before a ZWNJ PowerPoint did not draw
shows it («شخصي‌سازي‌شده», «میشود» → «می‌شود»). There only the next letter's side is ignored; a letter of
such a font once seen not joining forward toward a letter drawn joining back to it (Arial's tah and zah: one glyph
for all their forms) says nothing forward either (`_fwdLies`). A font that lies about the forward join as well
(`_lyingForms`) is no witness at all. And anywhere, a next letter drawn joining back means the two joined,
whatever the first one's glyph says. One glyph named by several forms of its letter in the font's cmap (reh's
isolated and final) is read as the form that joins wherever any of them does.

### A ToUnicode one entry off

A legacy Persian font exported by PowerPoint (B Mitra) came with a ToUnicode built from its cmap but off by an
entry for a few glyphs: the space glyph named «ً», the «ً» glyph (no advance) named «ا», the final lam-alef «ﻼ»
named «ل». Most glyphs agree with the font's own cmap, so the whole-font check (`bogus`) misses it, and every word
gap read «ً», «السلام» read «السل‌م» (the lam that does not join forward took a ZWNJ). The embedded font's cmap
wins glyph by glyph where the glyph's advance agrees with it: the cmap's space with an advance of a tenth of an em
or more is a space; the cmap's mark with no advance is that mark; the cmap's lam-alef ligature (U+FEF5–FEFC) named
by one of its letters is both letters. Composite fonts read by glyph id only (§5). Lab: `make-slides-rtl.py`.

### A ToUnicode wrong for a few letters

A Word letter stamped by iText kept B Mitra's ToUnicode, wrong for a dozen glyphs while right for the rest: medial
lam named «ه», final noon «ج», medial heh «ا», final and medial yeh, medial sin, isolated ain and kheh named a
space — «عمه ات» for «عملیات», «ایج» for «این», «پ شرفت» for «پیشرفت». Where the font's own cmap agrees on most
of its Arabic letters (20 or more, four in five) and disagrees on a few, the few are the ToUnicode's mistakes and
the cmap's letter wins (twins aside — ي ی, ك ک, ة ۀ, and Arial's heh, which its cmap names ھ), for a glyph with an
advance (`arTrust` in `_gsubRepair`).

**Wrong throughout** (Kelk 2.2, `_gsubFormPairs`): a Word subset of a Persian font through another PDF program names
almost every Arabic glyph by a wrong letter or a mark («ثٝ» for «به») — the cmap disagrees on most letters, so the
rule above cannot tell which side is right, and the Latin text in the same font keeps the ToUnicode from being thrown
out whole (`_gsubBogus`). The font tells it itself when its cmap names its glyphs by their joining forms: read through
the cmap, touching letters on one baseline must fit — a letter that joins on to the next is followed by one joined to
(initial or medial, then medial or final), the others by one that is not. A wrong reading fits about half the time; a
right one on nearly every pair (92 % of 40 pairs or more, read either way: a producer may draw right-to-left words in
either order). Then the cmap names all its letters. Lab: `word-nitro--scrambled-fa` (a bilingual reader).

### Shapes by use

Where a font's glyphs are all named by their base letters (Prince's ToUnicode: «ه» for every form of heh, no
presentation forms in the cmap), the shapes say nothing — but the glyph numbers still differ by form. Per page,
each dual-joining letter's glyph is counted at word ends (nothing, a space or a gap after it in reading order) and
inside words (touching the next letter); a glyph at word ends as often as inside is a final or isolated form. The
same for word starts (after a space, a gap or a letter that never joins forward): an initial or isolated form. A
final form drawn touching the next letter, or an initial one touching the letter before, had a ZWNJ between them
the file did not draw. A Prince letter of two pages read no ZWNJ before; «توسعه‌های» in bold, used twice on the
page, is still too rare to count.

**Forms by glyph order** (`_formsByOrder`, before the lines). Use fails where a word is mostly written one way: a
letter whose final form stands before a ZWNJ more often than at a word's end («نقش‌ها» three times, «نقش» once)
counts as joining. But Prince's subsets keep the full font's glyph order, and a B font numbers a letter's forms one
after another, as the presentation forms run: isolated, final, initial, medial. Where a dual-joining letter shows
four codes in a row (a right-joining one two) and the widths agree — a tailed letter's isolated and final forms
wider than its initial and medial — on three letters or more, three in four, the codes are those forms, exactly.
Letters with fewer codes (the bold face of a subject line, a few words) are read by width against a letter of
the same skeleton whose forms are known — in the face itself or in its family's regular face, scaled (bold is
wider): beh with noon and yeh, jeem with hah, seen with sheen … A code read so says its forward join only, and is
named the final or the medial form with `g.formGuess` set: its back join is no evidence (not for «a next letter
drawn joining back joined», nor for the lying count); the by-use rule above still reads its letter. A font that
names its forms already (a cmap with presentation forms) is left alone.

**Forms by place** (round 19, before the width reading). A letter whose few codes stand in a row, in a face whose
glyph order is known (its own four-code runs, or its family's), is read first from where its codes stand: some
places allow only some forms whatever ZWNJ the file left undrawn — after a letter that joins nothing forward (alef,
dal, reh, waw …), a non-letter or a gap, no back join (isolated or initial); before a gap or a non-letter, no
forward join (isolated or final). An undrawn ZWNJ only breaks joins, so these hold. The codes keep the forms'
order; where every order-keeping choice that fits all of a code's places names it alike, the code is that form,
exactly. Heh, whose forms no width tells, is read so: a Prince letter's bold signature «برنامه‌ریزی» — the bold
face's three heh codes, «گروه» standing on the first (isolated) and «واحدها» on the last (unjoined back) — the
middle one is the final, and the ZWNJ shows.

**Forms by outline** (round 26, `_outlineJoins` in extract.js, `edges` in `sfntLigatures`; after order and place,
before width). A modern font's subset — its forms made by its GSUB, no presentation forms in its cmap, no glyph
names left, the codes in no order of forms — gives neither the order nor the widths (heh's final and initial forms
are as wide). Its outlines still tell: a joining stroke runs to the glyph's edge on the side it joins, at the
baseline. A code whose outline has a point within 0.02 em of its left edge, from 0.03 em under the baseline to 0.2
em over it, joins forward (the next letter is to its left); one at its right edge, back. A tail below the line —
reh, waw, an isolated ain's — touches no edge in that band. A simple font's code goes to its glyph by the
program's (3,0) cmap (U+F000 + code, as Prince writes it) or its (1,0) one; a composite font's code is the glyph
where the file has no CID → glyph map of its own. Checked against the page: no right-joining letter's code may
reach its left edge, and no code may join where it stands apart (a gap, a space or a non-letter on that side) — a
letter whose codes do is left to the other readings, and a font where a quarter of the letters do is read by none.
A Prince letter in such a font: the regular face, well used, showed its forms by use; the bold face of two short
lines, each with «توسعه‌های», read «توسعههای» — its outlines give it back. Lab: `prince-shapes--shapes-fa`
(`make-shapes-rtl.py`).

### Combining marks

Marks (U+0300–036F, Hebrew points, Arabic harakat …) are merged into their base glyph before
anything is sorted, so they keep their place when a right-to-left run is reversed. The host is the
glyph whose box holds the mark's centre, else the glyph drawn just before, else the nearest. Two
producer facts change that:

- **Kelk / jsPDF draw a zero-width Latin mark after the next glyph**, from that glyph's start ("e" ","
  then U+0301): its outline reaches back over the e. A zero-width Latin mark whose origin falls on a
  boundary between glyphs belongs to the letter that **ends** there.
- **LibreOffice draws "ế" as "ê" + an accent of no width and maps the accent to a letter** ("Tiếhng"):
  a zero-width letter right after an accented letter is dropped. (LibreOffice also reuses that first
  mapping for the plain glyph — "đây" reads "đấy" — and its subset fonts have no cmap to correct it.)

No space is ever written before a combining mark (a keycap's U+20E3 after "#").

**A mark of no advance is placed by its outline when the font is at hand** (glyf bounding box, `g.ink`):
fonts differ — GDI's shadda in a calligraphic font lies left of its origin, over the ی drawn before it
(«مّؤثر» for «مؤثّر»), in B Mitra to its right. Without the font, a zero-width mark is taken to lie a fifth
of an em right of its origin, as before. (Both outline rules read a glyph by its code: composite fonts only,
and not in a file with a CID → glyph map of its own.)

**An ornament font** (`_ornaments`): a font the document uses for one to three Latin letters and nothing else,
each as wide as an em (a letter is half that), in text of another script, draws pictures — the Nemad font's
heading ornament is typed "g". Its glyphs become pictures (`g.pic`), cropped like an emoji; `images: 'drop'` drops
them. Before, a Persian letter began with `# g`.

**«اﷲ»**: a font whose ﷲ glyph is only «لله» is drawn after an alef of its own, and the ligature's name
«الله» brings a second: «بسم االله». An alef right before ﷲ goes.

---

## 5. Fonts

`_classifyFonts` gives each font `bold`, `italic`, `mono` and a family:

- **From the name** first: `Bold`, `Black`, `Semibold`, `Italic`, `Oblique`; TeX names (`CMBX12`, `CMTI10`,
  `CMTT10`, cm-super's `EC…`).
- **Fonts named without a style** (Microsoft Print to PDF: `CIDFont+F1`, `F2` …): the embedded font
  program's own name table and OS/2 (weight, fsSelection, PANOSE for monospace).
- **jsPDF (Kelk) writes four styles under one name**: styles come from glyph widths and bounding
  boxes compared with the family's regular.
- **A variable font through Chromium** (round 26): Skia writes each instance it uses as Type 3 fonts of drawn
  glyphs, every one named «…-Regular» (Vazirmatn[wght] at 400, 700 and 800 on one page: the bold read as regular).
  The instances have subset tags of their own (`AAAAAA+`, `BAAAAA+` …; one instance can span several fonts under one
  tag, alike in width), and a heavier weight is wider: per family, the tag with the most text is the reference, and a
  tag whose letters are wider, character by character (the median of four or more), by 2 % or more is bold. A width or
  optical-size axis is not read so (at display sizes it narrows). Lab: `chrome-rtl-varfont--fa-weights`
  (`make-varfont.js`); the Chrome Persian corpus in Vazirmatn gained its bold too (`chrome-rtl-*`).
- **Monospace** from the pdf.js flag or the name — but **not** for an emoji or symbol font (all glyphs
  one width: NotoColorEmoji, OpenSymbol), and not for a font flagged fixed-pitch whose letters vary
  in width (LibreOffice flags Inter so), unless its name says monospace. A wrong monospace font turns
  a line into inline code.
- **A monospace document is not code**: when more than 60 % of the glyphs outside boxes are
  monospace (and there are more than 200), monospace is the body font (note `monoBody`) — a text
  file printed, a typewriter style.

The body size is the mode of the glyph sizes **of the long lines** (30 letters or more; all lines when
there are too few): a report whose tables, set smaller, outnumber its prose had taken the tables' size
for the body — its prose became "larger than the body", and its list numbers were dropped as a
heading's (lists +3 on the fuzz sets); the body family (§8.4) is the font family of the long
lines at body size.

---

## 6. Lines and segments

### Visual lines

Glyphs on one baseline (within 0.3 of the size) make a line. Then three kinds of small text join the
line they belong to:

- **raised or lowered marks** — a footnote mark, an index, a citation "[24]" that browsers raise
  further — next to the line's end or start, or inside its span in a word gap (LibreOffice's footnote
  mark after "vegetables."). A run of more than six glyphs on the **same** baseline is a subtitle, not a
  mark; only raised or lowered runs can be long. Afterwards, segments of one baseline that the mark had
  kept apart meet again: the baseline had been cut at the gap the raised glyphs left ("CSS,[15] |
  while others", an encyclopedia page);
- **badges**: a label of three letters or digits at most, in a **tight** small box (narrower than its
  ink + 2.5 em), on the baseline of larger text right after it — "01 Basics" (a cheat sheet). The
  width limit matters: Chrome's per-cell table backgrounds glued a number cell to the next cell
  ("14 3,210"). A badge's digits are never turned into super- or subscripts ("₁₇" was a bug);
- smaller digits raised or lowered beside a line (footnote marks) become ¹²³ / ₁₂₃.
Lines are later put in **logical order** by a small UBA (`_logical`): base direction from alignment,
else the letter majority — but **a document with no right-to-left letter or Arabic-Indic digit at all is
left to right throughout** (`_anyRtl`): no alignment or side makes it otherwise. Without that, a table
in the right column of a two-column page "sat at the start side" of a right-to-left page — its columns
reversed, "2026-10-01" read "-2026 10-01" — whenever the file had no `/Lang` to say `en` (untagged
Chrome writes none; the fuzz sets' paired test found it, lab README); brackets mirrored on right-to-left levels; code spans as left-to-right
isolates (Kelk, Word and browsers draw `<code>` that way); Arabic presentation forms back to letters
(NFKC); lost ZWNJs restored where the shapes show them. **The Arabic comma is a separator** (Unicode: CS),
not a letter: «12،500،000 ریال» is one number read left to right — taken for a right-to-left letter it
came out «000،500،12». And a visual order the algorithm cannot give — an Arabic comma against the digits at its
left, a space, then digits («2-9، 2-10», as InDesign sets a list of clause numbers) — was drawn left to right: it
stays one run (the algorithm would have put the comma at the other number's left). The ZWNJ, in detail:

- **restored** where a dual-joining letter does not join forward (its isolated or final form) and a letter
  follows, or the next letter does not join backward — read from the letters that meet at the join: Word
  names its lam-alef glyph «لا», and its first letter (a dual-joining lam) had put a ZWNJ after every
  lam-alef («اطلا‌عات»);
- **a drawn ZWNJ where it cannot be is dropped**: between two forms that join each other (Word draws it as a
  zero-width glyph at its origin, «پ‌یش» for «پیش‌بینی» — the shapes put it back after ش), or not between
  two letters (a space, a digit, Latin, the line's edge: there it shapes nothing). Between two letters it
  stays even where the shapes do not need it (Foxit's «نوآور‌ی»: the source's);
- **a space that leaves no room is a ZWNJ**: Firefox draws the ZWNJ as a space of full width whose neighbours
  touch («پراستفاده ترین» for «پراستفاده‌ترین») — a real space has its width of room. A ZWNJ found so tells
  that the file draws its ZWNJs: the «می / نمی» guess is off («می‌لادی» was a guess; «میلادی» is now among its
  exceptions too);
- **but a space whose own advance the next glyph follows is a space, however tight**: InDesign's justified
  Persian draws the letter before a space narrower than its width, so the space starts inside it and the next
  letter starts where the space ends — «تا‌پایان‌همین‌ماه» came out of a tight line. (Firefox's ZWNJ-space
  ends inside the next letter; this one does not.) The same chain keeps such a space when "a drawn space on
  top of letters" would drop it (that rule is for another run's space laid over a word): «ماده1-تعاریفکلی»
  read so, a whole contract's headings and bold terms glued. Not where the shapes join across the space (a
  final form left of an initial one: Chrome draws a space glyph over a join in a test word);
- **a narrow space is a ZWNJ only where its font's spaces are wider**: a calligraphic font's every space is
  0.04 em (GDI), and «با‌سلام‌و‌احترام» had a ZWNJ for each. Each font's usual space is its median;
- **kashidas** a justified line stretches its words with (Word's kashida justification, «بـا احتــرام»):
  two or more tatweels inside words on one line go — with the ZWNJ a gap beside one was read as —, and then every
  tatweel there that touches an Arabic letter (one beside a mark, «تبصــ», had stayed); a lone ـ may be meant and
  stays;
- **a zero-width glyph is sorted by its centre** and measures no gap: by its origin Word's ZWNJ fell on the
  far side of its neighbour («‌همنظور» for «به‌منظور»), and a gap measured from it cut words.

The signs of a name glued to the right end of a Latin run («C++», «C#», «Notepad++») are read with it, as
sentence punctuation is («Kelk?»): in a right-to-left line they came out «++Notepad».

### Word gaps from the line

A gap with no space glyph is a word break past a threshold the page sets: 0.14 em, or 0.45 em on a page
whose producer draws its spaces (kerning must not split words). Prince and InDesign do both on one page:
lines with space glyphs, and justified lines whose words are only placed — 0.21–0.25 em apart, letters 0.
The page counted as one that draws its spaces, and every word of those lines was glued (a letter's recall
against pdftotext 45–77). `lineWordGap()` gives such a line its own threshold: a line with no space glyph
inside it and twelve glyphs or more, whose gaps part in two — the letter gaps around the line's median, then
a jump of 0.07 em or more to three or more gaps of 0.1 em or more (under 1.2 em) — breaks words midway
between the two. A few ZWNJ gaps in a word are no such line; the ZWNJ-from-a-gap rule does not apply on it.
Four real letters from Prince: recall 45–77 → 91–94. `chrome-positioned` (`make-positioned.js`) is the lab's.

**Runs placed from their untracked widths**. A producer that moves each word to its place by `Td` and then
condenses (`Tz`) or tracks (`Tc`) the text — a tool applied after layout; the metamorphic `tz85` / `trackTight` /
`trackLoose` — leaves words that overlap or stand apart by their drift: «DesigningResilient», lines cut as columns.
`_calibrate` reads it (`tracking.drift`, per page `regions[p].drift`): at each place one run (one operator, or
operators drawn each at the last one's advance) ends and the next starts on its baseline, the gap is regressed on the
run's drift (how much longer its `Tz` / `Tc` made it); a slope under −0.5 over eight samples or more means the gaps
follow the drift. Then `_glyphRows` lays the runs out again untracked (step / Tz − Tc, width / Tz) before any gap
rule reads them — the page's own reading with thirty samples or more, else the document's. Invisible text (an OCR
layer stretched by `Tz` to the scan's words) gives no samples. Net: tz85 −9.2 → −0.1, trackTight −3.6 → 0.0,
trackLoose −12.2 → −0.8; corpus and fuzz unchanged (no file there has such runs).

**A justified line that draws its spaces.** Chrome draws a justified line's spaces at their own width and moves the
words apart; in a narrow column of letter-spaced type four gaps of 1.9 em were cut as columns. When every wide gap
of a line holds a drawn space, equal gaps (±15 %, three or more) are a justified line's (`justGap`); a table's gaps
vary with its cells' text.

**A line that draws no space on a page that does** — two text boxes of one slide, one drawn with its spaces and
one without — has words apart by gaps only: two gaps over 0.14 em on it, and the line is read as one that draws
none (its gaps were ZWNJs: «مرور‌کارهای‌هفته»). And on a page that draws its spaces, a gap as wide as its font's own
space (0.85 of it, between letters, digits or signs, no code font) is a space: PowerPoint draws a wrapped line's
space at the line's far end and leaves its room empty («وقتهمه»).

**A calligraphic font's gaps.** Word sets IranNastaliq with spaces 0.04 em wide — spaces all the same, by the font's
name, however few the title gives to count. Where a word ends in a letter that does not join forward and the next
one climbs over it, Word drew no space at all and left no room: a cover read «ابزارنوین». No geometry tells; the
document's own words do (`_calliGaps`, after the blocks): a calligraphic word the text in other fonts never uses,
which splits into two words that the text uses side by side, is those two words. And a ZWNJ inside a calligraphic word —
typed to shape the calligraphy (a Word letterhead's «آموزش‌ی») — goes where the text in other fonts uses the word
whole («آموزشی»); otherwise it stays («طرح‌نامه» on a plan's cover).

**A line ended with room left.** A line that ends a sentence (or opens a list with «:») with room left for the
next line's first word — measured to that line's own far end, not the column's — was broken by the writer: a new
paragraph, even at a line's pitch («… به ترتیب زیر عمل کند:» over «الف) …»), and whatever the next line's size (a
flyer's «… رها نکند.» at 11 pt over «وسایل لازم : …» at 13, its label at 11: the sizes did not tell). A centred line
under a full one that ends a sentence starts a paragraph too; and two centred lines, the upper with room on its two
sides for the lower one's first word, keep their line break («زمان حضور: …» over «محل حضور: …») — no wrap leaves
room.

A run in a font of its own that draws no space (a Latin run in a Persian slide, its own Arial subset) measures its
gaps by its neighbour's space, or the line's: «Open Data Kit 2», a third of an em apart, had read «OpenDataKit2».

**A glyph named ZWNJ that takes room is a space.** LibreOffice's subset fonts share one glyph between the
space and the ZWNJ, and its ToUnicode names it U+200C. A space's neighbours stand its width apart (0.27 em);
a ZWNJ's touch (the next letter is drawn at the ZWNJ's own x). pdftotext reads it so too.

### Cutting a line into segments

A baseline is cut where a column gutter or a table cell boundary runs through it. The rules, all
measured against the glyph size `hi`:

| Gap | Cut? |
|---|---|
| a drawn space fills it | no — a word gap, unless it is wider than 2.5 em (justified text stretches spaces: an encyclopedia page's first paragraph came out one word a line with a tighter limit) |
| a drawn space fills less than half of a gap wider than 1.1 em | the space does not explain it ("a cell's trailing space") |
| undrawn, wider than 1.1 em (or 6 pt) | yes, unless the line is justified (`justGap`: three gaps or more within ±15 % on the line, in a line that draws no spaces — Chrome / Edge draw none in justified text) |
| undrawn, between two digits, over 0.7 em | yes, a cell boundary (`digits`: "120   135") |
| undrawn, over 0.15 em, in a file that draws its spaces | a **cell gap** (`cellGap`) when the next cell's start (or its end, for right-aligned numbers) lines up on **two other rows** within 12 lines (`columnEdge`) — a bare HTML table is 3 pt apart; LibreOffice puts rows five lines apart |
| the size jumps (×1.6) | yes: a title and its subtitle on one baseline |

The cell-gap rule has exceptions learnt one by one: in a right-to-left line, the run after the gap ending at the
line's own end is no evidence (every flush-right line ends at the margin: a link and the bold word after it, a
word space apart, were cut as two cells beside a float); not after a list marker alone at the line's
start ("•", Word's Courier "o"); a monospace side is allowed (a code cell beside a text cell) when the
gap is over 0.3 em, and two monospace sides only on a line that also has text (a line all in code is
a code block's). Spaces are found both by position and by drawing order: **Quartz (macOS) sets a
space back into the comma before it**, and a position-only search took the gap for an undrawn one —
justified text came out as tables.

**Cells that touch** (`_streamColumns`: Calc with its narrow padding, no spaces drawn): over five
baselines or more, a vertical band no glyph touches, with ink on both sides in nearly every row and
no drawn space inside, is a column boundary — except when what stands left of it is a list marker
alone on most rows (a bullet list makes exactly such a band).

## 6a. Page furniture: what every page carries

A letterhead deeper than the band (a government letter's logo with its number, date, time and attachment fields, down
to 0.85 of the page) repeats lines below the top 12 %: deeper in (to 0.78, or above 0.22), a line is furniture only
when its very text stands at one place on every page.

What a page carries that is no part of its text — running heads and feet, a side panel (a company's name and
address down one side), page numbers, a letterhead, logos — is taken out in one pass (`_furniture`), **after
the lines are built and before anything measures the page**: the body size, the column's edges, the boxes and
the figures all see the page without it. Pages are read one by one (§4: one page that fails to be read is
reported and the others go on); this is the first step that looks across them, the second being the joins of
§9 (paragraphs, tables over pages).

**Where.** Furniture is looked for in the margin zones only: the top and bottom 12 % of the page, and the
outer quarter on either side. A line, a picture or a fill must lie wholly inside one.

**The evidence**, strongest first:

1. **The producer's own word**: text marked `/Artifact` in a tagged file (LibreOffice and Foxit mark their
   running heads and feet so; Chrome and Word do not). LibreOffice also marks a table's header row repeated
   at the top of a page as an artifact — that row is kept: a row of two cells or more, with rows under it
   (up to six lines below: LibreOffice's rows are far apart) whose cells start, end or are centred where its
   do. Dropped, the continued table had lost its columns (lab: two files −11 and −15 before the exception).
2. **The tree's silence**: a line of the top or bottom band that a trusted structure tree does not reach at
   all, and that stands more than two lines from the text it does reach (Chrome's printed date, title, URL
   and page number). The distance matters: an encyclopedia page from Edge opens a page with a reference's wrapped link,
   which the tree does not reach either.
3. **Repetition**: the same text on a quarter of the pages, two at least — in the top or bottom band at the
   same height (numbers normalised: "Page 3" repeats; running heads alternate sides, so the place across is
   free), in a side zone at the same place and with the exact text. Matched with a tolerance of 4 pt, not by
   buckets (Chrome draws a fixed panel's lines up to 3 pt apart from page to page), and **piece by piece** in
   the bands: a line is cut where its parts stand 1.5 em apart, and goes when every piece repeats — Edge's
   footer is one line «url 3/25» on some pages and two on others. The lines step 1–2 took out count too.
   Not repeated furniture: a table's row repeated at a page's top (a row of cells across a vertical rule;
   at the bottom margin there is no table to go on), a repeating cell next to text that does not repeat (in
   the bands), a side line with text near it on its baseline (a panel stands a gutter apart: a table's first
   cells — «P-» of a wrapped «P-105» — repeated at one place on two pages had gone), a side line of digits
   only shorter than five (a table's number cells).
4. **Page numbers**: a short line (five characters, no space) in the same band on many pages; and **a lone
   page number**, also on a one-page file or a blank verso, where repetition cannot show it: a bare number, a
   roman numeral, "Page 3 (of 9)", «۳/۱۷», «صفحه ۳ از ۹» alone as the first or last line, in its band,
   about 1.8 lines from the text — read in either order (a right-to-left line's glyphs are visual) and in
   any digits. It matters beyond tidiness: in a two-column LaTeX paper the centred page number sits in the
   gutter and splits it into two gaps narrower than a column gap — the columns were never found.
   Turned lines (a vertical side tab's letters, §4) are matched without the gutter test: they have no
   baseline to share. **A page number in a side margin** (a Word template's number in a circle halfway down
   the outer margin) counts when it is a bare number at one place (its centre: «5» and «12» in one circle)
   on three pages or more and **its value keeps one step from the page's own** on most of them — a table's
   last cells, «140» at one place on two pages, are numbers too, but not the page's. The pages whose number
   step 1 already took out count towards it.
5. **What is drawn**: pictures, vector parts and fills at the same place (to the point) on a quarter of the
   pages, in a margin zone, with no remaining text on them — logos, a side panel set in outlines (InDesign
   sets a letterhead's text as outlines: the importer cannot read it, and it must not make figures or
   fences), the panel's fill. Not rules (a table's borders at the top of each page carry its header row) and
   not thin fills.

**The head's and the foot's borders** (round 23): a rule across most of the page's width (six tenths) in the top or
bottom 15 %, at one height on a quarter of the pages, with no text of the page's own beyond it and no vertical rule
meeting it, goes — Word's header and footer borders stand 20–25 pt from their text, past the 12 pt cut below, and
came back as a thematic break at every page's join.

**The rules around a running head** go with it: a rule within 12 pt of a dropped head or foot, and a rule
whose meeting vertical rules all rise into the head (the bottom edge of the head's own frame: Foxit's
letterhead between its logos — it was a thematic break at every page's top). A rule that vertical rules meet
from below stays: a table can start just under the running head.

**Letter fields** (rounds 19–20, `_letterFields`, `_headChunks`). An office letter's head carries its number, date
and attachments («شماره:», «تاریخ:», «پیوست:», "Date:", "Ref.:"), and a letter of two pages or more draws them on every
page, where repetition takes them for a running head — but they are the letter's own, as much as its subject. Of the
lines repetition takes out of the first page's head (its top quarter: a side panel's lines lower down are not), when
two or more read as fields, the head is kept once (the other pages' copies go):
- **a field** is «label: value» on one line; or a label ending in «:» with its value beside it on its baseline (Word's
  letterhead is a table: «شماره نامه:» in one cell, «24816» a cell apart — joined into one line); or a bare value of a
  field's kind standing alone: a date («1403/06/12», «2024-05-13», «12 October 2026»), a number («451288», «12/3400/5678»,
  «NA/2026/0457», a number with a note in brackets after it), «دارد / ندارد», "2 pages". A value wrapped under itself (its far edge at one x, a line's pitch
  below: «451288 (نسخه» over «دوم)») is one value;
- **labels where there are none**: a letterhead printed as one picture behind each page has its labels in the
  picture, and a Prince letter writes only the values over it — a right-to-left letter's bare values (two kinds or
  more, each once, a date or a number among them) are given the labels its head shows: «تاریخ: 1403/06/12»,
  «شماره: 451288», «پیوست: ندارد»; a left-to-right letter's the English ones at the value's left, "Date:", "No.:",
  "Attachments:" (round 25b: a Latin letter's head had come back bare, or not at all);
- **the sender**: the head's other text — the office's name under the logo, its holder's title down the far side
  («معاون وزیر» / «و» / «رئیس اداره») — is the letter's too, and comes with it (a head with fields is a letter's, not
  a book's running head). Logos and pictures stay out (repeated pictures are furniture; text wins);
- **in its reading order, before the page's text** (`_headChunks`): the head's lines in chunks (one block's lines —
  their extents overlapping, two lines' height apart at most — joined into one paragraph, the line breaks dropped;
  each field a chunk of its own), the chunks in columns read across the head in the letter's direction (a
  right-to-left head from its right), each column top to bottom. Read row by row, the head had come out as
  «معاون … / شماره نامه / تاریخ نامه / سازمان … / رئیس …»; the head is not measured with the body.

Repetition reads a line's text without its invisible characters: a ZWNJ drawn on one page's field and not on the
others' (a priority «عادی») made it no repeat, and it stayed on every page. A one-page letter needs none of this: nothing
repeats, its head stays where it stands. Lab: `prince-letter--prince-table` (values over a picture, one wrapped),
`word-memo--memo-fa` (Word's head table, the sender, a ZWNJ on the last page), `itext-word--circular-fa`
(labelled fields in a deep letterhead), `chrome-template--template` (Date / Ref. in a header template).

**Not without evidence**: a letterhead printed on the first page only, in an untagged file, stays — nothing
tells it from a title (Word marks a "different first page" header as an artifact only when it tags the file).
Text too small to read (§4) goes wherever it stands.

---

**A header made as a table.** A table's header row repeated at the top of each page is no running head — but
its vertical rules go on down into the table's rows. Word's header tables («نسخه اول | title» in two bordered
cells) have rules that end with them in the margin: in the top band, a ruled line whose rules all end within
three lines of it is a running head (`headTable`). And a line with no ink on a running head's baseline (a lone
zero-width ZWNJ Word drew between the header's two runs) goes with it — in the top and bottom bands only: in
the body an inkless glyph is the end of a line. `chrome-headtable` (`make-headtable.js`) is the lab's.

## 7. Regions: what is drawn around the text

**Page borders** (round 21, `_pageBorders`, before anything reads the page's rules). Word's art border is a ring of
small tiles round the page, each filled and outlined, every 18 pt along each edge; a plain one is rules or bands. A
one-page flyer has no repetition to show it (§6a), and the tiles' outlines along the top and the bottom are vertical
rules at a steady pitch across the page: the ruled-table reading took the page for one table of 28 columns, every
line cut into them. What is drawn wholly beyond the text, more than 6 pt from it and within a tenth of the page
from its edge — rules, fills, vector parts, small shapes, pictures — goes, when such things run along most of each
of the four edges (seven tenths): a ring, not a rule over a page's first table, a web page's bands, or a bar under
its last line. Nor a table's outer rule (round 22): a rule beyond the text on which two rules or more of what is drawn
among the text end stays — a landscape page's table, its right edge a few points past its first column's cells and
inside the page's double frame, lost that column. The text's edge is taken 2 pt out. A rule drawn in pieces is one
rule (Kelk 2.2): Word draws a table's double frame cell by cell — the outer rule a piece a row, each row rule carried
on to it by a short piece of its own beyond the text. Pieces in line that touch make a run; a run a piece of which
lies among the text is no border, and a piece out there meets the rules among the text where they, or their runs,
end. Each piece still answers for itself: a payslip's page frame keeps the sides its table's rules meet, not those
beside its title box. Lab: `word-frame--frame-table-fa`.


`_metrics`: body size; the text column's edges are the 3rd and 97th percentiles of the body lines'
starts and ends. With few lines the margins are mirrored (a short left-aligned line must not define
the column) — the **left edge only when fewer than eight lines start there** (LibreOffice's HTML pages
have unequal margins; mirroring the left one made every line look indented), and **the right edge only
when fewer than eight right-to-left lines start there** (a Word letterhead's caption at the far left,
mirrored, pulled the right edge 37 pt out: every flush-right line of a Persian memo looked indented, and
its numbered clauses became nested quotes). And the right edge is mirrored only **from a left edge that two lines
or more show, or one left-to-right line starting there** (`regColMirrorSrcLines`): a slide's one right-to-left line
drawn past the page's left edge gave no left margin — the right edge stayed — but scaled to 80 % (the metamorphic
`scale80`) it gave one, and the right edge mirrored from it set every right-to-left line in: the slide's paragraphs
read as quotes. The left edge is mirrored from any right edge, one line's too: a short document's single line
or caption is all that shows its margin — required twice, «متن فارسی با setDirection.» alone in a left-to-right
document became the whole column and read backwards, and a borderless table under a one-line caption had its
columns merged (the builder round trip); one English line at the left margin, likewise, gives the right
edge (a right-to-left list item ending short of it split a tight list).

- **Running heads, feet, side panels, page numbers**: gone before this step (§6a) — the edges above are
  measured without them (a side panel's lines had counted in the text column's right edge).
- **Boxes** (filled or framed rectangles): **code** when the lines are (almost) all monospace, or a
  framed box without a bar that is largely monospace or has a label strip; else a **quote**. Word shades
  each line of a paragraph on its own and LibreOffice one rectangle per paragraph: fills of one colour
  and x-range that touch are merged first. A white fill counts only when framed. A box holds a line
  only when it holds the whole line. Not boxes:
  - **zebra rows**: equal-width bands at a steady pitch, each holding two cells or more side by side, are
    table rows — taller bands too, when their lines still stand side by side (a row whose cells wrap);
    and **cell backgrounds that touch side by side at one height are joined into one band first** (Chrome
    shades each cell on its own: a row of six rectangles), which is a row whatever its neighbours. The
    bands then serve twice: as **fences** in XY-cut (§8.1) and as **row bounds** in borderless tables
    (§8.3) — their text stays in the flow for the table finder (before this, every shaded
    row of a cheat sheet's table became a code block of its own);
  - **chips**: a small box around a few characters (a badge, an inline-code chip with other text on its
    baseline) is decoration; its text stays in the line;
  - **a figure's frame**: a picture or a drawing over 40 % of the box, a few lines (its caption) — an encyclopedia page's
    thumbnail —: the lines stay in the flow as a **caption** (a paragraph that runs over the page break past a
    caption at the foot of the page goes on, the caption after it, §9);
  - **cards**: a web page's framed section — a heading line of its own on top (bold, short, no full stop) or a
    picture over a tenth of it, three lines at least, one column of text (an infobox's label / value rows are a
    table's) —: the page's layout, no quote; its lines keep the card's own text column as their edges (its
    padding made every line look short against the page's: a paragraph a line), and XY-cut does not cut between
    two lines of one card a line's pitch apart;
  - **highlights**: a fill hugging one line — no frame, its sides within half an em of the text's, under
    1.5 lines tall (Word's highlight colour) — is the text's own background; a highlighted list item became
    a quote. (Looser, it took one-line quote boxes: quotes −4.7 on the fuzz sets);
  - **a table's title cell**: one line in a box as wide as a ruled table, right on top of it (Excel's merged,
    shaded first row) — its text stays in the flow, just above the table.
- **Nested boxes**: a box inside a quote box is a nested quote — but a quote that **shades each of its
  paragraphs** (Kelk's `.docx`) is no nest: only a box that holds another box is a nested quote's
  frame; a box with a twin at its x, or inside such a frame, is a paragraph's shading.
- **Bars** (a thin vertical rectangle or stroke with text just after it, along its height): a quote —
  or **code, when (almost) every line beside it is monospace** and no bar nests inside (the boxes' own
  test; a code block with a side bar is a common blog and docs style, and every one of them was a quote
  of inline code until the fuzz sets showed it: code +16, quotes +14 on dev, +10 / +7 held-out) —, unless a rule meets its end or a matching edge stands across the text (`corner`, `twin`: frames and
  cell borders), or text stands on both sides (a column rule). LibreOffice draws a quote's border
  **paragraph by paragraph**: bars at one x, a paragraph gap apart — or with a nested quote's bar
  further in bridging the gap — are joined first; inner bars become nested quotes.
- **Ruled tables** (`_tables`): segments that touch are clustered; a cluster with three x-edges and
  three y-edges or more is a grid; merged cells come from the rules that are missing (union-find over
  the grid); cell borders drawn cell by cell give the column boundaries. **A merged cell is a rectangle**:
  grid cells joined around a corner (a rule missing under the last row's first cell, the open space round
  a total boxed on its own under the table — Excel) are no span; read over their bounding box they took a
  neighbour's text a second time (a row number cell read as «9» + its row's title, beside that title), so they stay single
  cells. **A first row that is one cell across the whole table**, over rows that have cells of their own, is
  the table's title (Excel's merged title row): Markdown has no span — it is written before the table.
  **Other merged cells** (`_tableMerges`, Kelk 2.3; the owner's decisions): a cell merged over rows is
  repeated in each of its rows (left to its first row, the rows under it read as missing values) — not where
  the rows under it hold nothing else; a band over some columns above the header row, the header row's other
  cells merged down into it, is a paragraph over the table and those cells' text the header row's; a band over
  some columns between rows, the rest of its row empty, is a row of its own, its text bold in the table's first
  cell (it stood in the middle of the row). Lab: `word-merged--merged-cells-fa` 76.6 → 100.0.
  **Rows drawn without rules** (a payslip: one ruled band whose columns hold an item a line): a grid row whose
  cells hold three lines or more, at the same baselines from cell to cell, the two fullest about as many, is
  that many rows. Not wrapped text: a cell whose lines but the last fill its width (letters, not figures — a
  column of amounts is as wide on every line) keeps them; a Word table's cells wrap at one pitch in every column. (Over
  rows without cells it is nothing of the kind: a table drawn without vertical rules is one span a row.)
- **Horizontal rules**: a stroke or a thin band at least half the column wide, outside tables and boxes,
  not a link underline — and not a rule **along a row of cells** (above or below a header: pandoc's and
  booktabs' rules). The row may end short of the rule's right end by up to a column's pitch (its last
  cell runs on past its text). A rule right after a heading, or after another rule, is the heading's
  underline (an encyclopedia page draws one under each section heading, often twice) and is dropped. **A link
  underline** lies under the baseline of the text it spans, all that baseline's text taken together (a long
  URL is cut into several segments) — within 0.35 em, or 0.75 em when the next line follows at a plain line
  pitch (no room for a break there: Firefox sets its grey link underlines 0.6 em down) — and is measured by
  **the part its clip shows** (`seg.shown`): Firefox draws the underline as one long rule, off the page at
  both ends, clipped to the link; whole, it ran under the neighbouring text and cut a reference in three.
  The rule itself stays whole: the tables are found from the rules as drawn (clipped, the sides of Chrome's
  table row cut by the page break no longer met its top border). A rule always sorts on a row of its own: a frame's double bottom edge
  4 pt above a code line once sorted after it and cut the code block in two.
- **List marks**: small discs and squares near a line's start are bullets; a framed square (≥ 5 pt), a
  rounded square, or a square filled white with a stroke (≥ 6.5 pt: wkhtmltopdf) is a checkbox; a
  smaller shape inside it — or strokes spanning it, no rectangle — is its tick.
- **The page's own frame and background**: a box around 70 % of the page's lines (ten at least) is the page's
  frame — a card, a dialog of a web app — not a quote or code box, and its text stays in the flow; an image or
  vector part covering a third of the page with three lines of text or more inside it is the background, not a
  figure (as an item it bridged every gutter; it also lifted the lab's OCR page from 59 to 62, its scan being
  such a picture).
- **Column rules fence too** (§8.1): a vertical line five lines tall at least, outside ruled tables, along most
  of a region's height — a web app's sidebar border.
- **A label in capitals set in a monospace face** ("DATE", "CATEGORY": a word or three, alone on its line) is
  no code block.
- **A band past the text column on both sides** (a site's header or footer bar, edge to edge) is no quote.
- **A box the paper cuts** (it runs past the page's side: a mobile page wider than the paper) is what is left
  of a card: no quote, its lines measured by their own text.
- **Figures**: vector parts and images clustered; inside a line they are an inline image (a formula), parts on one row
  are one figure only when close (a gap under 3 em, no text in it) and rows stack only when one stands above
  the other (an article's picture and a sidebar's thumbnails at one height had made one figure across the
  page's gutter, and the page could not be cut into its columns),
  else a figure block (`onImage` can register the cropped picture).

---

### Pictures and text

**A picture that draws nothing** (round 22, `_hiddenPictures`): its soft mask transparent throughout — Word's empty
anchor picture, 43 × 57 pixels, black under an all-zero mask, by a booklet's quote — is no picture. Cropped from the
page it was a square of the paper's texture, and as an atom in the line it cut a word. Read where pdf.js decoded it,
drawn at 16 × 16; where it has not, it stays — no waiting for it (Kelk 2.2: the 300 ms wait for a picture not yet
decoded never got one, in the lab or on long Word files, and ran one after another — about 80 s on a 137-page book,
the import bar standing still at «Building lines»).

Text drawn on the page stays text. Slides exported to PDF and designed reports lay their words over
pictures — a title on a panel that is itself a PNG with a shadow, a cover's coloured band, a hero image
behind a slide's title — and set icons and decoration beside their paragraphs. The figure rules once
cropped such pictures with the words on them (the reader got the words twice, once as a picture), and
merged an icon, a dot grid and a title panel around a paragraph into one figure the size of the slide.
Three rules in `_pageBlocks` (with `_clusterFigures`):

- **A backdrop is no figure.** A raster picture with visible text over it (four glyphs or more whose lines
  have their middle in it) is the text's ground; drawn parts holding running text (a line over 40 % of their
  width, or three lines and 60 glyphs) too. A drawing's labels are short: it stays a figure (the lab's
  process diagram keeps its labels, `pic` 3.5). Page-size pictures behind three lines or more were already
  the page's background (`behind`).
- **No merge swallows text.** Two parts are not one figure when their joined box holds text lines that
  neither part held — in the clustering, in the rows side by side and in the stacking.
- **A picture no reader sees** is none (extract.js): drawn in a group whose opacity, with its parents', is 0.05 or
  less (a carousel's hidden slides at 0.002), shown a tenth or less through its clip, or a quarter or more under an
  opaque fill drawn after it (a cover, a rectangle, a solid shape — a title image half under a cookie banner).
- **Decoration is no figure.** A drawing of one colour holding no text that is a panel (one shape over 60 % of
  its box, over 3 em: a card's rounded background left alone on the next page), a shape near white (every
  channel 0xE6 or over), or an icon (four shapes or fewer, 2.5 em or less each way: a logo mark, a menu's bars).
  A web page printed with its pictures cropped six; one is a picture.
- **A figure is trimmed back from the text reaching into it** from a side: the side cut that leaves the fewest
  lines reaching in, then the most of the box; a box the text would cut below a quarter is left whole.

- **Text wins over pictures: a picture and words never share a Markdown line.** A part lying in a line's band
  is taken into that line only when it stands in the line's run of text (between its letters, or within an
  em and a half of its ends) — the icon beside a slide's paragraph and each row of its dot grid had been
  cropped into one of its lines, breaking it three times. A drawing so hosted stays inline (a formula, a drawn
  sign: they are read as text later); a raster one only holds its place — the line's other part, cut off at
  the picture's gap, is joined back — and `_picturesOut` (regions.js) moves it after its block (after a list,
  after the whole list), one space left where it stood. Table cells keep theirs.
- **A box drawn as a picture** on a line that holds box characters is «☐» as text, a space against the letters beside
  it (Word's picture is wider than its box, its clear part over the label: «تألیف☐»), and the segment the box ended
  is one line again with the one the picture's room had cut from it.
- **Dot grids are decoration** (`_dotLattice`): three columns and three rows or more of one small shape at
  one pitch each way, most points filled, no text among them — neither bullets (PowerPoint's grid beside a
  paragraph) nor figures; shapes within 0.6 pt of each other are one size (PowerPoint rounds a grid's discs to
  the half point: 4 and 4.5 pt — its last column had fallen out, and the grid's lower rows read as bullets of the
  paragraph beside it). **Pictures as bullets:** small square pictures, two or more at one x, each just
  before a line's start, are list marks (`list-style-image`, an icon before each item).

The lab keeps the pictures (as short names) and counts the Markdown lines that hold a picture and words
(`mix`, gated; the slides had 2 and 1, now 0) — `make-pictures.js` adds pages of pictures in the flow
(`inline`, `inline-fa`): an icon before and after a heading, a badge in a sentence, picture bullets, a float,
a dot grid in the margin.

`r.quality` counts what is left (`covered`, §2d); the lab's `pic` column is the share of a file's text under
a cropped figure, and the gate fails when it rises. The PDFs that showed it (`make-pictures.js`: slides in
English and Persian, a brochure, through Chromium and wkhtmltopdf) read with 4.7–14 % of their text under
figures before these rules, 0 after.

### An OCR layer

Text drawn invisible over a scan (`r.profile.path` `ocr`; `this._ocr`): one font, no bold, each line's size
from its letters' height, the bullets misread or lost. The layout rules meet it as they are, with three
additions:

- **Misread bullets** (`_ocrMarkers`): a lone `© ® ° o O 0 e • · * ◦ ○ ● ■ □ ▪ -` and a space before a letter,
  on a line set in an em and a half or more, is a list mark (Tesseract read Chrome's «◦» as «©» and «o»).
- **Lost bullets:** lines one under another at one indent — three or more, marked lines further in among
  them — each a new sentence (a capital first, no full stop before the next) are a list's items. A quote set
  in as far runs its sentences on; a list whose items end in full stops is left alone.
- **Headings without bold:** a short line alone, set an eighth or more over the body, no sentence, is a
  heading. A heading size only one heading has goes to the nearest size two or more have (within 15 %, on a tie
  the larger): a line with no descender measures small — «Lessons for other teams» 15 among its level's 17,
  while a title at 19 over sections at 17 stays a level of its own. The first heading keeps its size.
- **Lines mended first** (`_ocrRepair`, before anything measures them):
  - *code*: a row (the segments of one baseline) set under 93 % of the body whose words are wide for their
    letters (median 0.47 em a letter over four words of letters or more — a monospace pitch; prose reads
    0.3–0.42, and figures like «31h» are left out) or that holds two of `= ( ) [ ] { } " _ ; < >` is one line of
    monospace; a lone closing bracket after it goes with it. `_codeBlock` then writes its gaps as one space
    each and its indents to even counts (the OCR places words by their ink, a cell long or short);
  - *sizes*: within 15 % of the body are the body's (a list item at 10 pt among 11 split the list);
  - *bullets*: a row starting with a lone misread bullet is one line (a task list read as a table);
  - *gaps*: two long runs of prose on one baseline (12 glyphs each) at most 2.2 em apart are one line.
- **The scan read** (`_ocrInk`, before the lines are made): each page drawn at 2.5 ×, each word's pixels where its
  letters stand. *Bold*: the median run of dark pixels across a row, in em — a third over the page's usual (the
  word's end punctuation not). *Strike*: a row through the small letters' middle (0.18–0.42 em up) dark over nine
  tenths of the word without a break of more than a pixel. *Task boxes* (`_ocrBox`, from `_ocrMarkers`): where a
  misread bullet stands, or in the gap after it when the bullet came first, the share of dark pixels in the
  box's middle and on its sides; a run of items at one marker with one box that shows ticked is a task list.
  An empty box alone is too faint (Chrome's grey box) to tell from the gap after a bullet.
- **A line with no descender** (no g j p q y), alone on its row, six letters or more, no sentence's end, is read
  a fifth taller: Tesseract's size is its letters' box («Structure» 14 among its level's 17).
- **Columns align looser** (`columnAlign(…, loose)`): 3 and 5 pt in place of 1.5 and 2.5 — «3.» with its
  misread full stop.

The lab's `ocr-tesseract--article` read 62.3 → 90.8; `make-ocr.js` makes two more from the corpus
(`features` 61.8 → 92.1, `report` 83.7 → 91.5), kept to check the rules rather than write them. What is left is
mostly the OCR's own reading («65h» for «6.5 h»), and what only the scan shows: bold, a task box's tick, rules.

**Lists in table cells** (round 23, `_cellItems`). Markdown's cells hold no list: a cell whose lines open with a
marker — «•», «▪», «◦», Word's level-two «o» in Courier New, a Wingdings «§» — and a gap after it, two items or more,
keeps a line break before each item (`<br>`) and writes its marker «•»; a line without one is the item above
wrapped. Joined as prose, a Word plan's cell of eleven items came back as one line, every «o» inline code. A dash
«-» and an item's number — «1)», «(1», «2.»: a few touching glyphs with a bracket or a point, then the gap — are
markers too, kept as they are (not bold unless its text is too: a bold number before plain text reads «1) …», a bold title stays «**1) title**»; Kelk 2.3). A lone item on a cell's
first line is an item: the rest of a list cut by a page break — when the row cut by the break joins the row above
(`_joinTables`, its first cell empty on the new page), an item opening the rest goes on on a line of its own. A row
opened by an item's number alone, its text hanging after a gap, is no form row (`_formRows`): a cell's items
«1) title: …» in a column of their own were read as a form and left the table, each number a bold item of its own,
and the table's part on the next page was not joined to it. Lab: `word-longcells--long-cells-fa` (59.0 → 80.0).

### Forms

`_formRows` (order.js), before the ruled tables (a box with rules between its rows is no table of them): rows —
the segments of one baseline, 0.4 em — of two segments or more, one a label (a colon after at most 40 characters,
at the text's start), three such rows one under another (3 em apart at most), or two whose labels start at one
x (a header's «Date:», «Invoice number:»). Each row a run of pairs in reading order: a label opens a pair, the
segments after it to the next label are its value. A row of one value right over the next form row (within an
em) fills the empty pair beside it (an invoice set one number 6 pt above its label). Each pair a list item; the
run's rules are the frame's (no thematic breaks). Form rows in a box inside a ruled table's frame, over every line
of the table's own, come before the table (Kelk 2.2): the table's box begins under them — the two boxes one inside
the other, the XY-cut could not part them, and the pairs read after the table. Lab: `word-form--form-box-fa`.
**A header's title beside its pairs comes first** (`_formTitleFirst`, Kelk 2.3): a line set 1.3 times the body or
larger, apart from the pairs across, beside form rows whose top is over its own (their row within its height),
is read before them — its row key just over the highest pair's. An invoice's title in the middle of its header, its
date and number at the far side, the date's baseline a little higher: by height the title had come between the
two pairs. Lab: `chrome-form--form`, `--form-fa` (order 98 → 100). **A frame of fields is no quote** (order.js): every line in it a
bold «label: value» — or the wrap of the field above (round 26): a line under a field's line that filled the frame,
a line's pitch down, with no label of its own («هدف طرح: …» over two lines, its second under the label — the
frame had been read as a quote). Lab: `word-plan--plan-box-fa`. A section's **title band** — one short line in a fill or frame
as wide as most of the column, on top of a box, a table or form rows, or at the top of a frame holding form rows —
is a heading of its own (minor, kept without a larger heading above it), its line as wide as the band (beside a
header's narrow column of pairs the XY-cut had read the band first). A document whose glyphs are six in ten bold
has bold as its face (`_boldFace`): no `**` round every line. A **value's next lines** — a row of words under a
value of the row above, a line pitch down — go on with that value (a remark wrapped over a cell merged across the
row). A label's colon is not an address's («`https://`»). **The run must be drawn as a form**: rules or fills along it
or round it (a box, a ruled table, a band), or every label standing apart from its value («Date:» … its date) —
two columns of prose whose lines start «Latin: …», «Arrows: …» on one baseline had been read as pairs.

**Pictures as boxes:** a little picture (1.6 em or less, about square) on a line that has box characters (☐ ☑ ☒ □
■ ✓ ✗) is «☐», as text, in the nearest segment on its baseline, with the word gaps the page shows — a Word form's
unticked boxes from a symbol font it could not embed; cropped, each held a box and a neighbour's letters. A short
one-pair row (label ≤ 25 characters, value ≤ 60) goes on with a form but never starts one.

**A table's closing note** (`_tableNotes`, regions.js): the table's last rows, each one long text (60 characters
or more) alone in its row, or a short label (40 or fewer) and such a text, follow the table as a paragraph,
«label: text» — an invoice's payment instructions, a form's remark. A cell is **merged** over a column edge also
when a line's words run across that edge (`crossed`): Chrome breaks a merged cell's bottom border at every column,
which `ruleBreak` had read as cells. Lab: `chrome-form--form`, `--form-fa`
(`make-form.js`); a Persian Aspose.Words invoice read its values as headings and its pairs column by column.

## 7a. Confidence and the fallback ladder

After a page is laid out and diagnosed (§2d), `_ladder` (`lib/pdfimport/ladder.js`) gives it a **confidence**
`conf` (0–1) and decides the **mode** its blocks are given in. The confidence is one minus weighted signs
(`ladderConf`, pure): lost glyphs (U+FFFD, in full at 20 % of the page; weight 0.5), glued words (at 25 %; 0.3),
text under a cropped picture (0.1), glyphs whose letter a repair guessed (telemetry; 0.15), blocks the trusted
structure tree disagrees with (`_treeVote`, from 3 votes; 0.15), gaps between a letter gap and a word gap
(0.1–0.18 em with no space glyph: segment ambiguity; 0.1) and a document with fewer than 20 word-gap samples
(calibration falls back to the defaults; 0.05). Signs that cannot be read (`_ladSignals` throws) give no confidence:
`conf: null`, the page kept as laid out (simplified in safe mode), skipped by the summary's mean. The decision
(`ladderDecide`, pure), in order:

| Mode | When | What the page gets |
|---|---|---|
| `ocr` | no text at all (a caption, a page number left after the furniture is text) over a picture covering half the page or more | its pictures (the scan) and the note `ocrNeeded`; conf 0 — the hook for an OCR runtime (later) |
| `textContent` | its extraction or its lines failed; 20 % or more of its glyphs lost (`ladLostTextContent`) *and* pdf.js's text demonstrably fewer lost (`_ladTcBetter`: at most half their lost share, 80 % of their characters kept) | pdf.js's own text (`getTextContent()`), read as glyphs (below); note `pageTextOnly` |
| `simplified` | 20 % or more of its glyphs lost otherwise (pdf.js's text is where their letters came from and loses the same: 74 U+FFFD either way on `t3-glued--lost25`); `suspectSpaces` and `lostGlyphs` together; conf under `pageConfSimplified` (0.45); its layout failed; `safe` mode | headings and paragraphs only: a table's rows, a list's items and a quote's blocks become paragraphs (`_ladFlatten`); after a failed layout, the lines by size and gap (`_ladSimpleBlocks`); note `pageSimplified` (not in safe mode) |
| `full` | otherwise | the layout as it is |

**The textContent rung reads pdf.js's items as glyphs**, not as strings sorted by position (which gave «۱۴۰۳» →
«3041», «2024-05-12» → «12-05-2024», «(NAS)» → «)NAS(», a list item «مورد اول با Google Chrome» → «Google Chrome
اب ورد اولم .1», its ZWNJs lost, running heads kept). pdf.js puts each item's characters, gathered in drawing order,
through its own bidi (reordered by the levels, never mirrored); the same reordering run again at the item's base
level gives the drawing order back (`tcVisual`). Each item is spread over its width as glyphs, items on one
baseline a line (a word gap where they stand apart — a space of a space's width, so a table's next cell stays a
gap), and the importer's own bidi reads them (`_joinLines` → `_logical`: numbers, Latin, mirrored brackets;
`repairArabic`: ZWNJs from presentation forms, «می», the letters). A line's direction: its letters (two thirds), a
list number at its right end (`tcMarker`: right to left), its edge; a line opening with a list number starts a
paragraph, a short line set larger than the page's body is a heading. ZWNJs pdf.js drops are read back where the
corpus shows them (Chrome): whitespace opening an item against an Arabic letter (99 of 99), and two touching items
whose right letter — named by itself while the page names its initial and medial forms by presentation forms —
meets a letter that joins back only (27 of 27; without that evidence 28 ZWNJs and 41 joins: left alone).
Brackets named by their logical character (LibreOffice draws «)NAS(» so named) are paired and named as drawn
(`tcBrackets`); a number drawn «76%» as one item keeps its sign after it. Running heads, feet and page numbers go
(`_ladTcFurniture`): a band line whose text, numbers aside, a page around it (two before, two after — their own
pdf.js text) has at about its height, and a lone page number. On the 36 right-to-left corpus files with every
page's extraction failed (a forced run), the rung reads words 85.5 / order 84.9 / total 49.0 (before: 80.9 / 80.2 /
39.4): Chrome's files near their full-mode words (96–100), LibreOffice's 66–91, wkhtmltopdf's and Word's lowest
(their items single glyphs, their spaces undrawn; 55–85).

A rung that gives nothing goes a rung down; the last resort is `_pageFallback` (the lines as plain paragraphs,
`pageFailed`, `r.failedPages`). `options.mode` (or `hooks.mode` of `fromArrayBuffer`, which wins): `auto`
(default), `safe` (every page at least simplified — the app's "safe mode"), `full` (never demoted: the importer
as before the ladder, failures as `pageFailed`). `r.pages` = `[{ page, mode, conf }]`; `r.report` = `{ mode,
summary: { pages, full, simplified, textContent, ocr, failed, conf }, pages: [{ page, mode, conf, why }] (the pages not
in full; `why`: `lowConf`, `suspectSpaces`, `lostGlyphs`, `layoutFailed`, `extractFailed`, `noText`, `safeMode`;
a page given by the last resort has `failed: true` — in `r.pages` too, shown as not read — and `mode: 'simplified'`,
or `'failed'` in `full` mode, where nothing is simplified), flags: [{ code, pages }], notes: [{ code, pages? }] }`.
Only a valid `hooks.mode` overrides `options.mode`. A Kelk source import has the summary and every list empty (its
`kelkSource` stays in `r.notes`). Text the rung gives counts for the `noText` note.

The thresholds are fixed (votes, not geometry) and set on the lab: no page of the corpus (282 pages), fuzz dev or the
metamorphic net is demoted (lowest conf: corpus 0.92, dev 0.90, meta 0.655 — a noToUnicode page with glued words);
safe mode on the corpus keeps words 97.8 and order 97.5 (`run-import.js --mode safe`). Lab: `tests/pdf-lab/ladder/`
(`make-ladder.js`: a scan with no text → `ocr`; glued Type 3 words with one glyph in twelve lost → `simplified`,
one in four → `simplified` too, pdf.js's text losing the same) and the injected faults of `run-stress.js`; `run-crash.js`
sweeps `ladder/` too; `tests/unit/ladder.test.js` holds the rung's cases on real pdf.js items (`ladder-tc-items.js`).

## 8. Reading order and blocks

### 8.1 XY-cut

**A book's mirrored margins** (recto and verso): the document's span covers both kinds of page, so a page whose own
column is that measure moved to one side — flush with the document's edge there, 92 % of its span wide at least, two
lines or more at each of its edges and six in all — is cut and read by its own edges. Measured by the document's,
every line of a recto looked set in at the left and short at the right, and a biography's last lines became a quote.

`_xyCut` splits the page recursively: at **vertical gutters** when the parts really stand side by
side (most items of each have a neighbour at the same height in the next), else at the **horizontal
gap** that frees a region with columns. Learnt the hard way:

- **A vertical rule down 80 % of the region that no line's letters cross** (a sidebar's border: a web app's
  settings panel) splits it first, before any cut across — a picture inline in a line (a progress bar's crop)
  and a figure reaching 25 pt over it do not count. The panel's menu had been read row by row into the page.
- **A row whose cells start where the row beside it does goes with the table's run**, however narrow its
  gutter: an invoice's last label nearly touched its value column, and the row came out two headings.

- **A gutter fenced by a shaded row is a column gutter** (`fences`): a row band whose side stands in the
  gutter, within the region's height, says no table crosses it — two columns of zebra tables, or a table
  beside text, read as one table across the page without it. One side is enough.
- **A borderless table is not columns.** A region whose items share baselines and are short (four
  words or fewer, mostly) is *row structured* — it becomes a rows leaf (§8.3), not columns.
- **A gutter through table rows is no column**: when the narrower part's items each sit on the
  baseline of a short cell across the gutter (a table's last column only reaches past the text below it).
- **A table at the text's own line pitch** has no gap to cut at: a run of three baselines or more, each
  of short cells sharing gutters, is cut out (`baselineRun`) — but a list marker and its item are no
  two cells.
- **A slide's two columns of a few lines**: three items will do across a wide gutter (≥ 2 em) when one
  side is a column of text (two lines a line pitch apart) — a single "label … value" row is not.
- **A short last column** (the end of a LaTeX article) fails the side-by-side test, because the long
  column has few neighbours beside it. For exactly two parts a looser test applies: the short part has
  three items or more, 80 % of them beside the long one, and **the tops of both parts are aligned**
  (within 2 em). Top alignment is what tells "unbalanced columns" from "two columns, then full-width text
  below"; a gap-below test alone failed on a LaTeX and an HTML sample.
- **Best horizontal cut**: columns on one side only first, then **the largest column region**, then the widest
  gap. (The gap came before the region until a cheat sheet's page 2: its first row of sections all end at one
  height, leaving a gap across the three columns wider than the one under the page's header — the cut there read
  that row across, 10 · 13 · 16 before 11. A cut that frees the whole set of columns keeps them whole; fuzz
  sets: tables +1.5 / +1.0.)
  When no single cut frees a region with columns, the longest run of consecutive horizontal slabs that
  each hold side-by-side items is cut out on both sides (a borderless table between full-width text,
  inside a column); `baselineRun` is the finer version of that for rows at the text's own pitch.
- **Floats** (a figure or infobox beside text) are ordered before the lines beside them; lines beside a
  float end short without being a paragraph end (`beside`). The float's bottom margin counts too: a line
  below the caption whose start and end match the beside-line above it is beside as well — without it,
  three lines of encyclopedia text became three paragraphs.
- **Two short lines on one row at the column's two sides** (round 26), a quarter of the column apart at least,
  each under 45 % of it, the start one at the start edge: each goes with the lines above it. The far one comes first
  when the nearest line over it is its own (over it alone, nearer than any over the start one) — a signature's
  caption at the far side under the signer's name, the next table's title at the start side (a Word report): by x
  alone the title came between the name and its caption. (The owner's case read the two as one line; the lab's
  rebuild, drawn apart or as one line of spaces, already kept them apart — what it showed was the order.) Lab:
  `word-sides--sides-fa` (`make-sides-rtl.py`).
- **The sort must be a total order.** Mixing an exact comparison for one kind of item with the row
  tolerance for the others reshuffled a whole page (an encyclopedia's infobox moved). Give the odd item a key
  instead (rules: raised past the tolerance).

### 8.2 Paragraphs

- **A picture in the margin beside the text** (a portrait left of a biography's first lines, the lines set in to its
  edge): a line with a picture before it on its start side, three ems away at most, is set in by the picture — no
  quote (its lines were one), no outdent or far-start break when the text runs on under the picture at the margin
  (the paragraph had come apart there).
- **A line that opens with a bold label** — bold text of 30 characters or fewer ending in a colon, then text
  not bold — starts a line of its own in its paragraph (a box of fields: «موضوع طرح: …», «زبان طرح: …»).
- **A dash against its word** («-مدیر …», no space) is a list's mark too, before a letter (a minus is before a
  number); a lone bullet or dash a few points off its item (under 1.2 em: Prince's column cut) joins it again.
- **A centred block of short lines keeps its breaks** (`_groupLines`): two lines under 60 % of the column whose
  middles stand at one x (half an em) and whose widths differ by an em or more — a letter's signature, name over
  title — no wrap sets lines so. **A paragraph goes on with the list item above it** only when it is set in about as
  far as the item's text (its indent at most 60 pt past the item's): a signature at the other side, 330 pt in,
  had gone into the last item.

(A block's direction: its letters first, when one direction has two thirds of them; alignment only after — a
Persian line beside a float, flush with the float's side of its region, had been read left to right.)

`_groupLines`: a new paragraph at a style change, a gap over 1.3 × the leading, a marker, an indent
or outdent, a short previous line in justified text, or a **roomy** line (the next line's first word
would have fitted after it — no wrap) followed by a gap clearly over the leading. The leading is the
median line step of the region — but a step over 2.5 lines is never a leading (one-line paragraphs set
far apart), and a region much looser than the document's own wrap pitch takes that pitch. Three steps at least
make a leading; two will do (round 26) when they agree to 2 %, each under a line that fills the column (two wraps),
and the document has no wrap pitch of its own — a short page of two paragraphs that wrap once each, at a Persian
page's `line-height: 1.8`, came apart at each wrap under the default 1.4. A short line
that is not a paragraph end keeps a line break. "Clearly over the leading" is never under 1.1 × the leading
itself: it was capped at 1.75 lines, and under a leading of 1.79 (Chrome's `line-height: 1.75`) every roomy
line ended its paragraph. **A table of contents' line** — dot leaders (`....`, `……`, `____`, `· · ·`) running to
a page number at its end, in either visual order — is an entry of its own however close the next one, and is
never a heading, bold or large as its level may be set (a report's contents ran into one paragraph, then into
headings). Nor does it run on across a page break or a column's foot: a verso's last entry and the recto's first ran
together into one line («… 163 Access, Privacy …»).

Joining the lines: one space at a wrap (a space the line ended with is not doubled), none after a hyphen
before a letter or digit, and **none inside a link's address**: where both halves lie in links to one URL and
the two pieces joined (brackets and closing punctuation aside) are part of that URL — decoded, `%7E` as `~` —
the wrap is the browser's break inside the address («…/~notes/Top ics…»).

Rules learnt on a novel, reports and table notes:

- **A size change is no break where one line holds the other's size too**: a run in a smaller bold font that
  wraps makes the next line "smaller" by its count of glyphs, the rest of it at the paragraph's size — a
  letter's sentence was cut in two at «**عنوان یک طرح** / **ادامه عنوان …»**. (One of the two lines at body size.)

- **Re-indent**: a first-line indent after a **short** line starts a paragraph, even when that line was
  indented too — a novel's one-line dialogue paragraphs were merged by the dozen without it.
- **Outdent** after a short indented line ends an indented block — unless the lines are centred (a
  dedication was split).
- **Enumerated notes** ("(1) …", "(a) …", "[2] …", "* …", "† …") start a paragraph after a short line,
  or after a line that starts with the same kind of enumerator at the same start (three table notes had
  run together), or after a line that ends a sentence (a clause number does not wrap onto a line's start
  mid-sentence; a trailing ZWNJ or space after the stop is no text). **Numbered clauses** count too —
  «۳-1. …», «2.4) …»: a list's number cannot hold two levels, so they are paragraphs that keep their number
  (a Persian memo's clauses had run into one paragraph each). Read in logical order, with the start
  measured on the line's own side.
- **A line break is kept** when a line ends short of the column by more than 35 % of its width (or six
  em), in a column wider than 15 em, and the next line's first word would have fitted — never in a
  heading, beside a float, or after a line-end hyphen. **The column is the lines' own**: those that overlap
  the line across; a region that also holds a sidebar runs to the page's edge, and every line of the article
  beside it had looked short (a news page: a break at every line).
- **A bold line the next word would have fitted on, plain text under it** is a paragraph of its own: a clause's
  heading at body size, set with no space before its text (Word), had been the paragraph's first line.
- **A quote's lines**: two of them a wrap's pitch apart, or one sentence among them (five words or more); a
  column of short labels set apart (a side menu's items) is no quote — they had come out as quotes in quotes.

**Blocks joined again** (`_joinAcrossPages`, besides the page break):

- **a heading cut in two** by the reading order (a web page's title, its words far apart): the next heading of
  its size on the next line, starting where it starts, no sentence end between — one heading;
- **a strip of tabs or links on one baseline**, three short items or more read as a column each: one paragraph,
  its items parted by « · »;
- **a paragraph broken by a sidebar** read between its parts: the next paragraph in the same column, in lower
  case, every block between wholly outside that column (thumbnails included) — joined, and its lines below
  the sidebar that end at the column's edge lose their breaks;
- **a small label right over a larger heading** (a section's kicker «01 / THE BASICS», a contract's word on a
  tab), nothing between, read a level deeper than the heading it labels: a short bold paragraph, no heading.

**Paragraphs from the structure tree** (`_treeParagraphs`): consecutive paragraphs whose glyphs (90 % each)
belong to one block element of a trusted tree are one paragraph — lines that end short beside a float are no
paragraph ends (an encyclopedia article's lead beside its infobox, "Portable" / "Document" / "Format" a word a line). The
block is the nearest element that is not inline: Span, Strong, Em, Link, inline Code, Sub, Sup and NonStruct
("its content treated as its parent's", ISO 32000 — Edge wraps a paragraph's bold and links in it) are
transparent. Only joins; where the tree changes paragraph the geometry's breaks stand.

A table that goes on in the **next column** of the same page with its header row repeated (Chrome repeats
`<thead>` at a column break as at a page break) is one table, the repeat dropped; without a repeated
header two tables that follow one another stay two.

Paragraphs broken within a page are joined again (`_joinAcrossPages`): **column to column** (the last
line full, the next column starting higher up and to the right, in lower case — or a caseless script —; and
the column's foot or head holds text: three lines before, or two after — a letter's addressee and its
«فوری» mark at the other margin, two short lines side by side, are no columns), and **around a float**
("… in" [figure] [caption] "that …": the first part has no end punctuation, the second starts in lower
case).

### 8.3 Borderless tables (rows leaves)

`_rowsLeaf` groups lines by baseline and keeps the free x-intervals each row leaves; consecutive rows
whose free intervals still meet are one table, and the meeting intervals are its gutters. Details that
matter:

- **rows bounded by rules**: with no shaded bands, the rules between rows (a web table's thin separators,
  drawn cell by cell: pieces on one height that touch are one rule first) bound its rows — a row of cells two
  lines tall (a symbol over its name, dollars over toman) is one row. Only spans with a neighbour of nearly
  their height (25 %): a table's rows have one height, a heading and the next table's header row between two
  rules have none;
- **prose columns are no table**, however narrow and short their lines: when headings larger than the text
  stand in two of the columns, or most lines of each column (six lines or more) run to its far side, the
  region is columns — two A5 columns of short wrapped lines, lists and quotes shared their baselines and were
  read as a two-column table (a stray rule had hidden it: once the rule was read as a link underline, the page
  became a table);
- **the table's direction** is the page's when the table has letters of it anywhere (a price list of Latin
  symbols and numbers with a Persian «خرید» on a Persian page runs right to left), else its first row's;
- **a cell's lines top first** (by x, a right-aligned pair read «Alpha ALP»);
- **a header row set apart above its table** (a signature block: the parties' names over the names and titles
  of their signatories, two rows' height above): one row, as many cells, each over its column, within five
  lines — the table's first row (it had been a paragraph, its two names in left-to-right order);
- **a ruled table's title in two sizes** (a company's name over «payslip — month») is two paragraphs; and
  **rows between the title and the first row cut into every column**, merged across columns and holding
  «label: value» pairs (a payslip's block over its table, in columns of its own the grid's columns cut through;
  and a first row merged across the table holding two pairs or more — a box of them in the table's frame — is no
  title but such a block, Kelk 2.2: joined as a title its rows ran into one paragraph; a line of two pairs or more,
  drawn as one run with spaces at its tab stops, is cut between them where the widest gap between two colons is
  over an em; lab: `word-form--form-row-fa`),
  are text above the table: each pair a list item, row by row (a row from the start side), a line with no colon
  going on from the one above it in its column — one order with a form's rows (`_formRows`; the owner's decision,
  Kelk 2.3: before, each pair a paragraph, column by column; `word-form--form-row-fa` 88.0 → 100.0);
- **a shaded band across a gutter, with a line on its baseline at each side**, is a table's header row, and
  the region beside it is read as rows even with cells of up to eight words (a bare table's are four at most):
  the signature table at a contract's end — «مهر و امضای طرف اول | مهر و امضای طرف دوم» on grey, a bare row under
  it — had been cut into two columns and run into one paragraph;

- **the structure tree, when trusted and naming tables** (`_treeTables`, after the joins): a table block —
  or a **quote** whose text is all one Table element's (an encyclopedia's infobox, a framed box of label / value
  rows the geometry reads as a quote) — whose glyphs belong to one Table element (none placed elsewhere by the
  tree; up to 15 % it knows nothing of, such as a link address a print style adds after the link, go with their
  neighbours, every cell's run anchored by a placed glyph) takes the tree's rows and columns. Each geometric cell's
  glyphs are kept as they are (their spacing is the line builder's — rebuilding spaces from gaps put one
  inside "2026-10- 01" and before a code chip's comma), cut where they change tree cell, and pieces of one
  tree cell join with a space; consecutive blocks of one Table element are one table. A glyph the tree does
  not place would have no cell, so a table with one is left to the geometry. Left-to-right tables only.
  Measured first, on the tagged fuzz files of dev: the trees' cells 94 against the importer's 79 — lists
  showed no such room (93 against 92) and are not taken from the tree;
- shaded rows bound their rows: each band is a row, and so is the space between two bands (only between:
  above the first band stand the header and the first body row, below the last the region may run on —
  both edge guesses were tried and cost tables 1–10 points) — every line
  inside one belongs to that row, on whatever baseline (cells that wrap, single-line cells centred in a
  taller row); other lines are grouped by baseline;
- the first row (often a centred header) does not narrow the body's gutters, and a line that falls in
  a gutter goes to the column whose **body extent** is nearest (Kelk's centred "Name" once landed in an
  empty extra column);
- inside a line, a gap over half an em between letters is a free interval too (two cells that ran
  together: "Delta Supplies, Inc. Oslo");
- **a justified line is no row of cells**: justification stretches a line's word gaps alike — over half an em
  in a narrow column, where the line is cut into segments —, a table's gutters differ. A row across the leaf
  (its ends within 1.5 em of the leaf's) with three word gaps or more, all within 0.15 em of one width, is one
  line of text, its segments joined again (left apart, the strip rule read them as a menu, «· » between), unless
  a row of cells stands right beside it — a header row whose columns happen to stand evenly apart, over its
  body. Two lines of a justified two-column paragraph had come back as a table of five columns (fuzz dev:
  tables +3);
- **a header row closer than a column's gap**, right above a borderless table set at the text's line pitch
  (four short bold words over right-aligned numbers stand only 0.8 em apart, under the 0.9 em a column's
  gap needs): when none of its cells crosses the run's gutters, each holds five words at most and the first is
  no list marker, it is the table's first row — it had been cut off, its words read as headings;
- **a row whose cells wrap, its one-line cells in the middle** (a browser's `td` is `vertical-align: middle`):
  baselines closer than 0.9 of a line that fill no row alone but fill one together are one row, its first
  baseline's — «P- / Customer / M.», «At risk 850 790», «102 / portal / Okafor» had been three rows;
- **cells that wrap**: a lone line a line pitch below a row, inside one column, is the cell's next line;
  also a line a pitch **above** the next row when that row is empty in its column (a cell set in the
  middle of its row: LibreOffice's date on two lines) — and a run of such lines;
- `_gridTable` splits a line that crosses a gutter at its glyph gap inside the gutter, places lines by
  column (or by exact column edges from cell-by-cell rules, `_ruleColumns`), and joins wrapped lines to
  the nearest row that fills most columns;
- rows far apart (LibreOffice's HTML tables) come out as one table each: consecutive tables with the
  same gutters are joined.

### 8.4 Headings

**A field or a sentence is no heading.** A large bold line that is a field — a label without digits, a colon, a value
with a number or a list in it («زمان حضور: ساعت 6:30 …», «وسایل لازم : کفش مناسب، کلاه …» set large on a flyer) —
or that ends a sentence is emphasised text: a paragraph, its lines apart.

**A letter's invocation is no heading.** «بسمه تعالی», «باسمه تعالی», «بسم الله الرحمن الرحیم», «به نام خدا» set
large and centred over a letter, often in calligraphy, are a paragraph (a Word circular's came back as `#`); and
calligraphy draws «باسمه» and «تعالی» touching, where a ZWNJ was read: the two words get their space.

**A table's title is no heading.** A line «جدول 2- …», «Table 3: …» — the word, a number, then a dash, a colon,
a point or a space — right over or under a table is bold text, never `#`, whatever it looks like on the page — a title drawn plain is made
bold too: a document's outline lists its sections, not its tables (the owner's decision, Kelk 2.3; a Word report's
titles, set large and bold, came back as `#` and `##`). «جدول زیر …» (no number), a line «جدول …» away from any
table, and a sheet's title over its table (Excel's merged title row, a heading) that does not start «جدول N» or
«Table N» are untouched; a table's own merged title row or header band that does is bold too
(`word-titlerow--title-row-fa`). Lab: `word-longcells--long-cells-fa` 80.0 → 100.0, `word-merged--merged-cells-fa` 61.3 → 76.6;
`frame-table-fa` writes its title bold now.

**A heading starts at the column's start edge, or is centred.** Lines pushed to the far side — the start side's gap
a fifth of the column or more, and two fifths more than the far side's — are no heading whatever their face: a
letter's signature, name over title, bold and a size up at the left of a Persian page, stays bold text. (Not where
the document's long lines do not start at their start edge themselves: LibreOffice's HTML export sets a Persian
page's every line at the left — `_startFlush`, the share of long lines at their start edge, under 0.6.)

By size: three lines at most, larger than the body by 0.4 pt and bold, or 1.4 × the body size at least;
levels by distinct size, largest first. A bold line at body size (within 0.6 pt, measured on the sizes as drawn — the median of the line's letters against the
body's unrounded size, `_metrics.bodyExact` —, not their half points: an iText circular's bold caption 1.2 pt under its
9.6-pt body, scaled to 80 %, rounded to 9 against 9.5 and read as a heading), short, not ending in ":" or "." is a **minor heading** below the real ones — not
a piece of a line cut at two cell gaps or more (`rowCell`, lines.js: a borderless table's bold header row, round 26);
a short line at body size **in a heading font family** — one that larger headings use, that the body
does not, and that few body-size lines use — is a heading too, one level below the bold ones
(pandoc's level 4: Calibri italic over Cambria text).

**The structure tree first, when it can be trusted** (`_treeVote`, §2b). A group of lines the tree reaches
(80 % of each line's glyphs at least), in a tree of trust 0.5 or more **that names headings at all**:

- every line in one heading element → a heading, at the **tree's level** (H1–H6; `H` and `Title` carry
  none, and the size decides); a heading set wholly in italic loses the italic (the style's, not markup);
- the lines change between heading and text, or between two headings → the group is split there (the
  spacing ran a heading and its paragraph together);
- no line in a heading → the tree **vetoes the weak signs only**: a bold line at body size and a heading
  family make no heading, but a larger size still does.

Each limit is a lesson. A tree that names no heading (LibreOffice's PDF of a Word file whose headings are
styled paragraphs) called every heading "text", and its veto took them all. A tree can mistag a title as
`P` (LibreOffice from HTML does), and a size is stronger evidence than a tag that says nothing. On the
tagged fuzz files of dev the importer's headings rose from 93.3 to 96.8 (the trees' own: 99.5); untagged
files are read exactly as before.

### 8.5 Lists

A line opened by a clause's number and a dash («۳- …») or by a word and its number («مرحله 2: …», "Step 2: …") is a
line of its own (`ENUM`), not a list item: a list's number cannot hold it. A run of such lines set in from the
margin is no quote. A figure under a short line breaks no paragraph — a float wrapped by text stands beside it.

**A hanging indent is no new paragraph.** A clause «6- …» wrapped, its next line set in to where the clause's text
starts after its number (a Word list typed by hand), runs on: the first-line indent rule does not part them.

**A numbered title is no list of one.** A numbered line set all in bold, alone at its depth in its run of items, with
items set further in under it («2. درخواست از …:» over bullet items; its sibling «1. …» a paragraph over a lettered
sub-title) is a numbered section title: a paragraph, its number kept in its text; the items under it a list of
their own.

A dash at the start of a line is no item mark when the line is a paragraph's wrap: the line above runs full to the
far edge, starts where this one does, a line's pitch up, ends no sentence, and the paragraph is not itself an item
(a number range broken at its dash in a justified letter: «… شماره 451200» / «– 1403/06/12، …»). Items typed with
dashes, each a full justified line, stay a list: their first line is an item. **So is a typed bullet or box** a
sentence wrapped before — «… x³ + y³» / «· CO₂», «… ♦ ☐» / «☑ ☒» in a narrow column — when it stands a word space
from the next word (an item's typed bullet stands a tab or a wide gap from its text); the paragraph's first line may
be set in by its first-line indent. A line of no letters at all (symbols, numbers) reads in the page's direction:
read right to left in an English document, «· ₹ 5,400 · ₿ 0.25» put its last symbol first, and no rule saw its
bullet.

Markers: drawn dots and checkboxes (§7), typed bullets (•, ◦, ▪, –, Word's Courier "o", Symbol's
bullet), numbers (`1.`, `1)`, `a.`, roman; a bare number set off by a tab-wide gap — ReportLab), typed
checkboxes after the bullet (☐ ☑ — Word, Kelk's `.docx`). Levels by indent; ordered lists keep their
start number. **Right to left**, a bullet set off by a tab stands at the right of its text (Word's RTL
list): it is joined to the text on its left, and Word's Courier «o» there marks the second level — the
glyph itself is taken out (the «o» is Latin: a Latin start of the item, «o pip», read it into its own run,
«pip o»). **A Latin item of a right-to-left list** (a Persian encyclopedia page's external links:
«… (`https://…`) ▪») has its bullet at the right end of a line with no right-to-left letter, a gap before it,
on a right-to-left page or document (more Arabic-script letters than Latin ones, or its language): the item
is right to left, its text read left to right — as the browser set it —, and its wrapped lines go with it. A
list item's text never runs on left of its marker (right of it in right-to-left
text): a line that starts there ends the item — wkhtmltopdf's paragraph after a list was glued to the
last item. A list item's text column, line by line from its marker, is marked (`qcont`) so that its
wrapped lines are never taken for a quote.

### 8.6 Quotes, code, hyphens

**A bracket between bold glyphs.** A mark of punctuation that touches a bold glyph before it, a bold one after it
(across a space at most), set in another face — «۱» bold, «)» regular, «خدمات» bold — is of their run: it read
«**1**) **خدمات …**». Not one apart from both («**Format** (**PDF**)» keeps its bracket plain).

- **A quote's bar** stands at its lines' start: left of left-to-right lines, right of right-to-left ones. A
  vertical rule at their ragged end is the page's decoration (a Word template's rule down the margin beside
  the page number made every page of a Persian report begin with a quote).
- **Quotes by indentation** (browser-default `<blockquote>`, no bar, no box): a run of lines indented
  on both sides, none reaching the column's end, at body size — nested quotes indent further and are
  told apart by their x. A **shallow** indent (under 2.2 em: a first-line indent's) is a quote only when
  its lines but the last end within 8 % of the column of one another, as wrapped text does, and short of the
  edge the column's text reaches by half their indent at least (a quote set in by a shallow margin is set in on
  both sides) — a run of one-line paragraphs, each with its `text-indent`, ends anywhere, some at the edge (a page
  of symbols set so became a quote; the region can run wider than its lines, so the text's edge is measured).
  **A nested quote without a paragraph gap** (indented paragraphs, `margin: 0`): inside a quote found by
  indentation, lines set in 2 em further, one under the other, are a part of their own and nest — the inner
  quote's first line had run on from the outer one's; a line set in that runs to the quote's far side, the next
  one back at the quote's edge, is a first-line indent. **A quote set wholly in italic** (a stylesheet's
  `blockquote { font-style: italic }`) is italic by its style, not by markup: its words come back plain, as a
  heading's do. The lines **end** on their reading side's far end: the left in a right-to-left run (flush-right
  numbered items, ragged left, ending at the right edge "together" were a quote). A run whose every line is
  **centred** in the column is a centred title or verse, no quote. **One line** counts only when it is indented deeper than a first-line indent
  (2.2 em), fills half the column, is not centred, and has lines at the column's edge with a paragraph
  gap above and below. A quote's right edge is as far in as its left one, unless its lines run further.
- **Code blocks**: lines in a code box, or monospace paragraphs merged; blank lines from the minimum
  line pitch — and from the document's single pitch of code (`_codePitch`: monospace lines one under the other
  at one left edge, anywhere), when a block's every line is a blank line apart and its own smallest pitch is
  two lines; indentation and inner gaps as character cells; a one-line label on top (Kelk) or in its own
  bar (Word table) is the language; a line the block **wrapped** (no room for the next word, the rest at
  the block's left edge, a pitch below) is one line again — only then, since code lines legitimately end
  anywhere.
- **Hyphens at a line end** are kept or dropped by the document's own words (`_lex`: is "data-driven"
  or "datadriven" used elsewhere?), then by the producer: browsers and office suites do not hyphenate
  by themselves, so their line-end hyphen is real; TeX and InDesign do.
- **Inline styles that survive Markdown** (`_inline`): bold, italic and strike-through are written only where
  CommonMark's flanking rules let them through. A styled run with no letter or digit is plain (Word's bold
  full stop after a plain word, «بود**.**», was literal asterisks in the reader's text), and punctuation at a
  run's edge goes outside it where a letter or digit touches it there («x**.y**», «**y.**x»). The lab counts
  what still fails (`markup.js`: the HTML's `<strong>` `<em>` `<del>` `<code>` a CommonMark parser no longer
  finds in the Markdown), and the gate fails when it rises.

---

## 9. Across pages, and the ceilings

### Joining what a page break cut

`_joinAcrossPages` joins a block that ends a page to the one that starts the next: a code block, a
code block whose first line(s) stayed behind, quotes, a paragraph that runs on (lowercase start, no
end punctuation) — never a table of contents' entry, on either side of the break.

**Footnotes and endnotes.** Under Word's separator — a short rule (under 45 % of the measure, three ems at least)
with only lines 1.5 pt or more under the body's size below it on the page, the first within three ems — the lines are
notes (`L.note`): footnotes at a page's foot, endnotes after the text's end, anywhere down the last page. A note's mark
Word drew as a small picture before its line (no text: an English note in a Persian letter came back without its «¹») is that mark again,
the page's raised marks in the text giving it in reading order (a mark of several glyphs, «ⁱⁱ», is one; a note whose
mark is text uses up its own). Such a picture is no logo however often it repeats at one place (§6a), nor hidden
for its few pixels (a 2 × 2 image whose soft mask is the glyph). Each note opened by its mark is a paragraph of its
own. Raised small roman numerals — Word's endnote marks «i», «ii» — become ⁱ ᵛ ˣ (modifier letters: Unicode has no
superscript roman numerals). The blocks that close a page, set 1.5 pt or more under the body's size, each opened by its mark
(«¹ …», «2 …», «* …»), with body text above them on that page, are the page's notes. They are taken out before
the join: the paragraph before them is the one the page break cut, and it runs on to the next page past them (a Word
report's notes stood between its two halves, which were never joined). The notes come after the block they would
have interrupted, in their order; their marks stay in the text (§6: small raised digits become ¹²³). Markdown here
has no footnotes of its own (Kelk renders none), so they are paragraphs, not `[^1]`.

**A title page** (the first of several pages, up to twelve short blocks, pictures and rules, no running text, no
table): its largest heading is the title; a smaller line set as a heading after the cover's text has begun — a
report's «تهیه کننده: …», its holder's title in bold white on the cover's band — is the cover's text, a paragraph (it
came back `###` or `####`, a section with nothing in it). A subtitle set as a heading right under the title stays one. Tables:

- **down**: the same column count and the same gutters (borderless parts compared by their gutter
  intervals, which overlap; ruled ones by their rules) or the header row repeated — dropped;
- **a row cut by the break**: rows with an empty first cell at the top of the new page are the rest of
  the last row's cells;
- **over**: a wide sheet printed down, then over — the same rows at the same heights, more columns;
- **a part too small to show its columns** (a header and a row alone on a page; the last row alone on
  the next): its lines are cut at the gutters of the other part. A word cut by a column start, or a row
  filling too few cells, cancels it.

A rule at a page's edge right next to a box is the box's border cut by the break.

A line that starts at the column's edge under one that started far from it (more than 0.3 of the column in: the far
half of a form's row) begins a paragraph — a wrap starts where its paragraph does. A frame round form fields (every
line a bold «label: value») is no quote, by its box or by its indent; a rule whose ends meet uprights (a page border
of bands, a form's box) is a frame's edge, no thematic break.

A ruled table's last row alone at the top of the next page is a one-row ruled table there (`oneRow`: three cells or
more, one row of rules): it joins the table above by its rules, as any part does; one that joins nothing comes
back as paragraphs, its cells in order — a row of boxes is no table of its own. A cell's lines cut into pieces at a
justified line's wide gaps are one line again before its text is read, its glyphs in their order on the page
(Prince's Persian cells read their pieces left to right).

A slide deck (PowerPoint, Impress, Keynote by their producer) joins nothing across pages: each page is a slide,
and an agenda's last item, ending without a full stop, had run on into the next slide's title.

### What the PDF itself has lost (not bugs)

| Producer | What is gone |
|---|---|
| wkhtmltopdf | colour emoji: wrong ToUnicode and subset fonts with no cmap and no glyph names — pdftotext gets nothing either (shown as �) |
| LibreOffice (HTML import) | checkboxes of task lists; a nested numbered list printed with bullets |
| pandoc → .docx | nested quotes (one "Block Text" style for all levels); code languages |
| LibreOffice | "â" mapped as "ấ" when the glyph was first used in an accent cluster |
| Calc | numbers as formatted in the sheet ("7802.42", not the source's "7,802.42") |
| a fallback font with a wrong advance (₹, ₿ in LibreOffice) | the space after it (the glyph's box runs into the next) |
| Word | an endnote mark is "i" (lowercase roman by default) — correct, whatever the source said |

Open limits (rotated text, RTL details, OCR …) are listed in `TODO.md`.

---

## 10. The producers — a field guide

| Producer | How it draws, and what the importer does about it |
|---|---|
| **Chrome / Edge** (Skia) | Type3 for variable fonts (FontMatrix 1/2048; each instance under its own subset tag, all named «…-Regular»: the weight read from the widths, §5); Form XObjects with their own matrix; list numbers without ToUnicode (ActualText, placeholder); no spaces in justified text (`justGap`); bullets as discs, checkboxes as rounded squares; quotes as a side bar or a both-sides indent (default CSS); `<hr>` as a band; strikethrough as a rule through the letters; `<thead>` repeated on each page; cell borders drawn cell by cell; bare tables 3 pt apart; per-cell table backgrounds; ZWNJ as a zero-width space; headless Chrome writes no Language — tagged output (desktop Chrome, `tagged: true`) writes `/Lang`, a structure tree (headings with levels, lists, tables; no quote or code roles) and the outline, and is read exactly as the untagged file is. Encyclopedia pages: link underlines wider than half the column, heading underlines drawn twice, citations raised beyond the usual offset, right-hand floats (infobox, figures) with captions and a bottom margin |
| **Firefox** "Save to PDF" | Skia now (`Skia/PDF m149`, Creator `Firefox`) — not cairo, as was thought: the same engine as Chrome's. Firefox's own drawing: a ZWNJ as a full-width space with no room; a collapsed table's outer borders as mitred trapezoids; images as pattern fills; a link's trailing space drawn with the link |
| **Opera** | Skia; Creator an Android User-Agent (`Linux; Android 10; K … OPR/`); a web app's text can be drawn twice (a second layer). A mobile page on paper: fixed side tabs in turned text (drawn twice), a floating ad and a banner on every page, framed cards, a page cut at the paper's edge (the text beyond it is not shown, and not read) |
| **Stripe invoices** (no Info, no XMP) | Inter as CID fonts whose ToUnicode maps hyphens, colons, brackets to U+0000, each wrapped in `/ActualText` |
| **Call PDF** (webtopdf.com) | tagged; a web page with its cookie banner drawn over the content under a soft mask |
| **wkhtmltopdf** (Qt WebKit) | a tab drawn as the space; checkboxes as framed squares filled white with a stroked tick; quotes indented ~23 pt with paragraph gaps over 2.2 em; colour emoji lost (ToUnicode to control characters) |
| **LibreOffice Writer** | one shading rectangle per paragraph; quote borders per paragraph; code 32 reused in subset fonts; OpenSymbol bullets (flagged monospace); NotoColorEmoji flagged monospace, Inter flagged fixed-pitch; accent clusters mapped as one; HTML pages: asymmetric margins, table rows five lines apart, cells centred vertically, checkboxes dropped |
| **LibreOffice Calc** | cells that touch, no drawn spaces between cells, a space drawn between a right-aligned date and the next cell; print titles repeated; wide sheets down then over |
| **LibreOffice Impress** | slides as large pages; two content placeholders side by side |
| **Prince** (Persian letters with tables) | simple TrueType subsets of B fonts, one-byte codes, the ToUnicode naming base letters, the glyphs in the font's order (forms by order and by place, §4); a modern font's subset keeps no such order and no glyph names: forms by outline (§4); no ZWNJ drawn; the letterhead one picture behind each page, the head's values written over it on every page (letter fields, §6a); cell borders as inset / outset L-bands (§4 Paths); justified cells set tighter than their size; a table's last row alone on the next page |
| **iText** (stamping a Word export, Persian) | B Mitra's ToUnicode wrong for a dozen presentation forms, its cmap right (§4); a letterhead deeper than the top band on every page; clauses «مرحله N: …» set in; a diagram between a clause and the next article |
| **Microsoft PowerPoint** (Persian, Arial) | Arial as two or more CID subsets under one name (`ArialMT`, no subset prefix): the Persian text's with a cmap trimmed to the forms used, the Latin run's with its own; shapes that lie about joining back (§4); some ZWNJs drawn as zero-width glyphs, others not drawn; brackets named by the logical character; a slide's title in a rounded frame; dot grids of 4- and 4.5-pt discs beside the text |
| **Microsoft PowerPoint** (Persian, legacy fonts) | B Mitra / B Titr as CID TrueType subsets whose ToUnicode is one entry off for the space, «ً» and the final lam-alef (the cmap is right, §4); one text box drawn with space glyphs, the next without; a wrapped line's space drawn at its far end; agendas centred left of a picture; titles in IranNastaliq, or as pictures of text; links to attached files as UTF-8 bytes in the URI string |
| **pandoc → .docx → PDF** | headings in their own family (Calibri / Carlito over Cambria / Caladea), level 4 italic at body size; a rule under the header row and above / below the table, no vertical rules |
| **Microsoft Word "Save as PDF"** | cell borders as thin filled rectangles; each line of a shaded paragraph shaded on its own; Symbol / Wingdings / PUA bullets, a Courier "o" at level 2; a code block in a framed table whose label is a row; Persian ت mapped to `"` in its ToUnicode (TODO). **Persian** (§4 item 9, §6): the ToUnicode names base letters and logical brackets where the font's cmap names presentation forms and mirrored shapes; ZWNJ not drawn, or drawn as a zero-width glyph at its origin; lam-alef one glyph named «لا»; digits named in two systems; 1-pt text in a letterhead; numbered clauses «۳-1.» one per line; an RTL list's bullet a tab right of its text |
| **Microsoft Word → Microsoft Print to PDF** (Persian) | GDI's ToUnicode names the Persian yeh and kaf by the Arabic ي ك (the cmap's presentation forms say ی ک); ZWNJ glyphs next to spaces from the source |
| **Chrome** (Persian, tagged: a payslip) | one ruled band with an item per line in each column, no rules between the rows; a header block of label / value pairs inside the table's frame (TODO) |
| **Microsoft Excel → Microsoft Print to PDF** | the title row merged and shaded on top of the table; a total in a box of its own under it, the first column's cell above open at the bottom |
| **Foxit PDF Creator** (from Word) | a letterhead in a frame of its own (logos, separators, a rule under it) and a framed footer with the page number; ZWNJ drawn as zero-width glyphs; highlighted lines |
| **Microsoft Word for Microsoft 365** (Persian call for proposals) | header and footer borders as page-wide rules 20–25 pt from their text (§6a); table cells holding lists, Word's level-two «o» in Courier New (§7); a bold «۱)» with its bracket in the regular face |
| **Acrobat PDFMaker → Adobe PDF Library** (Persian booklet from Word) | a zero-width ZWNJ at each run's start, a text object of its own, inside the run's leftmost letter; a space glyph at the origin of the letter before it (§6 "A space under ink"); a page frame of double rules, a table near it; an empty picture under an all-zero soft mask (§7); the page's paper texture as a pattern; a hand-typed clause list with hanging indents |
| **Microsoft Word LTSC** (Persian flyer) | an art page border of 18-pt tiles, each outlined in strokes (§7 Page borders); the body in bold B fonts (bold as the face); a label at body size before a list set larger on one line; a date's «/» drawn over a space glyph; a framed box of text (a quote); a frame of «label: value» fields, one value wrapped under its label (fields, no quote: §7 Forms) |
| **Microsoft Word 2019** (Persian circular on a letterhead) | the letterhead in the page header, on every page: a table of the letter's fields (labels in a calligraphic font, values a cell apart), the office's name under its logo, its holder's title down the far side in three lines (letter fields, §6a); a ZWNJ typed in a calligraphic word; the invocation's two words drawn touching; footnotes at the page's foot; a signature's caption and the next table's title on one baseline at the column's two sides (§8.1) |
| **Microsoft Print to PDF** (GDI, Persian letter) | whole fonts, cmaps trimmed to the characters typed: a calligraphic font's swash glyphs known only by GSUB, post names and glyph order; spaces of 0.04 em; kashida justification as tatweel glyphs; a ﷲ glyph after an alef of its own; an ornament font (Nemad) typed as Latin letters; B Mitra's font stream with bytes after its end; marks placed left of their origin |
| **Microsoft Print to PDF** (GDI) | fonts named `CIDFont+F1`…; many rectangles in one path; COLR emoji as stacked layers with a trimmed cmap; links dropped; text sometimes as outlines — a sample had no font at all, every letter a path: no text layer, only OCR can help (note `noText` names the case) |
| **Pages / Quartz** (macOS) | MacRoman TrueType without ToUnicode; spaces set back into the preceding comma; justified text |
| **jsPDF / Kelk** | formulas as vectors with their TeX in an XMP map (§3); four styles under one font name; zero-width marks drawn after the next glyph; emoji through PUA codes of a remapped font (`loadEmojiMap`); can embed its own source (§3) |
| **pdflatex / XeLaTeX** | Computer Modern / cm-super names for styles; real hyphenation; math as glyphs (order inside a formula: TODO) |
| **OCR layers** (Tesseract, OCRmyPDF, ABBYY over a scan) | the text drawn invisible (render mode 3) over the page picture, one font, words placed where the OCR saw them: words come back well (the lab's Tesseract page: 97 %), structure poorly — bullets read as `©` / `o`, tables lost, every line one size class (`ocrLayer` note; the OCR phase, TODO) |
| **ReportLab** | the default numbered list has no dot: a bare number set off by a tab-wide gap is a list marker; `Preformatted` is unframed monospace (merged into one code block); a footer with title and page number on each page (running feet) |
| **Adobe PDF Library** (InDesign's export, a book) | a table of contents' dot leaders in the body font with the period mapped to U+FFFD and `/ActualText` U+0008 over each leader (§4, 8a); running heads and folios as `/Artifact /Pagination` (gone); mirrored margins, recto and verso (§8.1); a portrait floated left of a biography's first lines (§8.2) |
| **InDesign** | CID Type 0C / Identity-H fonts; ligatures and small capitals with no ToUnicode or in the Adobe PUA (§4); Zapf Dingbats embedded as `Dingbats` for section ornaments (❋ ❋ ❋); real hyphenation; long documents |
| **InDesign** (Persian, Mac: Adobe PDF Library) | Dana / Modam as CID TrueType subsets with no cmap or post; one face embedded twice under one name (CID and WinAnsi); justified, tracked lines whose space glyphs start inside the letter before them; the bold face's ToUnicode names the "(" glyph ")"; Dana's ASCII digits drawn in Persian shapes (the text stays ASCII); a fixed side panel and a running head on every page (§6a); a signature table with a shaded header row |

---

## 11. Testing

### Seven nets

1. **`tests/pdf-lab/`** (Node + Playwright, headless, a few seconds): 144 PDFs of 62 documents from 49
   producer variants (fifteen built glyph by glyph: `make-word-rtl.py`, a Persian memo with Word's habits, and
   `make-slides-rtl.py` and `make-deck-arial.py`, Persian decks with PowerPoint's, `make-plan-rtl.py`, a Prince letter
   and a Word plan's form, `make-itext-rtl.py`, a circular stamped by iText, `make-prince-table.py`, a Prince letter with a ruled table, `make-memo-rtl.py`, a circular on a Word letterhead, `make-book-toc.py`, a book's contents and "about" pages from Adobe PDF Library, `make-report-rtl.py`, a Word report with a cover band, footnotes and endnotes (and its twin in object streams), `make-flyer-rtl.py`, a flyer in an art page border, `make-acrobat-rtl.py`, a booklet's pages through Acrobat's PDFMaker, `make-cells-rtl.py`, a call with lists in its table's cells, `make-shapes-rtl.py`, a Prince letter in a font whose codes keep no order of forms, `make-sides-rtl.py`, a Word report with a signature's caption and a table's title on one baseline; a
   right-to-left corpus of Persian and Arabic documents through seven producers: `make-rtl.js`), grouped in
   `pdf/` by what they test — `en/` and `rtl/` (the two corpora through every producer we run), `office/`
   (sheets, a deck, Word files through LibreOffice), `pages/` (one layout problem each), `producers/` (the
   glyph-by-glyph imitations) —, scored
   against their source — words found, word order, headings, list items, table cells, code lines, quotes,
   and for right-to-left documents a column of their own (`rtl`: ZWNJ, yeh / kaf, digits, brackets). See its README for the corpus, the producers and the tools.
2. **`tests/builder-suite.html`** (`node tests/pdf-lab/scripts/roundtrip.js`): every Kelk test case
   through PdfBuilder and back — Kelk's own PDFs, right-to-left included (383 cases at the end of the
   English round).
3. **Real files** (`run-real.js`, `run-crash.js`): any folder — the user's own PDFs, the pdf.js test
   corpus (about a thousand files: a stability sweep found no importer crash and no timeout) — scored
   against pdftotext's words and compared with another version of the importer (`cmp.js`). Real files
   are a good regression set because each carries a different family of problems — kinds such as a page
   of tables, a multi-column cheat sheet, a typeset book (InDesign), an encyclopedia article from
   Chrome / Edge, Word and Excel exports, letters and forms in Persian, a file with no text at all (outlines).
   They are the user's own: they, their names and their text are not shipped nor named here. `snapshot.js`
   keeps such a set outside the repository (Markdown and signals per file, compared with an earlier run),
   and each problem one shows is rebuilt as a lab PDF of our own text (the producers table of the lab's
   README names which), so the lab, not the private set, is what the rules are checked against. `profile.js` checks the provenance profile: the
   pure function on 27 producers from real files, and the engine of every lab PDF. `struct.js` audits
   the structure trees of tagged PDFs (what they cover and what they say, lab README); `profile.js` also
   checks the importer's own reading of them (§2b): trust as expected, the trees' headings against the source.
4. **Style fuzzing** (`make-fuzz.js`, `run-fuzz.js`): the corpus documents in styles drawn from a seeded
   generator, in two splits — `dev` to work on, `heldout` read only as means. The first three nets show
   what the importer reads; this one shows whether a rule generalises. The corpus stood at 99–100 when
   the fuzz sets were first drawn: dev 83.5, held-out 87.2; after round 24 (its weak spots: lists, tables,
   quotes) dev 96.0, held-out 94.6. See the lab's README for the rule of the two splits.
5. **Stress** (`run-stress.js big.pdf small.pdf`): a long file (the lab's PDFs joined, 145 pages) — it must
   never hold the thread a second; injected faults (a page that throws in extraction, another in layout) —
   the import finishes with `pageFailed`; an abort — it rejects with `aborted`. In CI too.
6. **Metamorphic** (`make-meta.js`, `run-meta.js`): fifteen lab PDFs (every producer family, both
   directions) rewritten in ways that change the drawing and not the text — content at 80 %, a page at
   125 %, `/Rotate`, object streams, no tags, colours, a page background, a coloured band, condensed type
   (`Tz`), tight and loose tracking (`Tc`), and, as a stress, no ToUnicode at all. Each transform stands
   for many producers at once; per transform the net counts the files read exactly as their seed and the
   loss against the source. Its first run found what no corpus score had shown: condensed and tracked type
   lose 6–16 points (the word-space rules are absolute), object streams hide `/ActualText` (−55 on the
   Persian Word file), a page background costs a deck 35. In CI and the gate (a transform's mean −1, −3
   for the hard one).
7. **Coverage** (`features.js`, §2c): not a score — the lab's PDFs per `r.features` cell, and the cells of
   any other folder the lab lacks. It says which PDF to add next.

### How to change a rule

- **Find the layer first** (`dump.js`, `words.js`, `shapes.js`, `lines.js`): a wrong table is usually a
  wrong segment, a wrong quote a wrong column edge. Fix it where it goes wrong, not where it shows.
- **Look at the page** (render a strip of it) before calling something a bug: Kelk's accents read wrong
  everywhere, yet the page was right — the reading was wrong; Word's "i" read wrong, yet the PDF was right.
- **Ask pdftotext too** (`-layout`, `-bbox` for positions). When it gets the same wrong text, the PDF
  says it; that is a ceiling (§9), unless the font program can correct it — the missing "Th" was missing
  there too, which said the PDF had no mapping and the font itself had to be read.
- **Run all the nets after every change** (held-out only as means), then `scripts/gate.js`: it fails when
  a corpus file drops more than half a point or a fuzz mean more than one (lab README, "The gate"); raise
  the baseline with `--update` when the change is good, and compare outputs, not only scores (`cmp.js` on the real
  files): a rule that fixes one producer moved an encyclopedia's infobox, turned encyclopedia lines into
  headings, cut reference lists into quotes, broke an HTML page's columns (a relaxed column rule) and
  split a centred dedication (an outdent rule) — none of it showed in the corpus scores.
- **One small source, every producer.** A document of a few dozen lines (headings, a justified
  paragraph, bullets, numbers, ruled and borderless tables, a quote, code, a footnote) printed through
  every producer finds producer-specific bugs faster than long real files — that is what
  `tests/pdf-lab/corpus/` is.
- **Prefer a condition that names the drawing** ("a framed square filled white, ≥ 6.5 pt") over a
  threshold tuned on one file; write the producer in the comment.
- **Bisect a regression** by turning each new rule off in a copy of the importer (`md.js` takes any copy):
  it is quicker than reasoning about interactions.
- A score can be wrong too: check the reference before chasing the last points (a deck's bullets, an
  endnote's "i", composed vs decomposed accents — the scorer normalises to NFC).

---

## 12. Ideas not done

The list lives in `TODO.md` (PDF import). The larger ones: use the structure tree of tagged PDFs and
the outline to confirm headings; rebuild rotated text; OCR for scans (a separate
phase); PdfBuilder writing its own source and its formulas' LaTeX into the PDF, so that Kelk → Kelk is
lossless; then right-to-left, Persian and Arabic PDFs from other producers.

The order was deliberate: English PDFs first, until the behaviour was reliable, then bidi, Persian /
Arabic and their fonts. The rules are written to be direction-neutral (x0 / x1 mirrored, markers on
either side). Three rounds of real Persian files (Word, Print to PDF, Excel, Foxit, InDesign, browsers)
and the lab's right-to-left corpus (`make-rtl.js`, October 2026) now test them: Chrome and Kelk read the
Persian and Arabic documents right (the `rtl` column 98–100, totals 83–100 in Chrome's styled pages; the
browser-default style loses tables and quotes); the LibreOffice paths and wkhtmltopdf trail (TODO, "From the
right-to-left corpus"). (A first count had Chrome's Persian lists at 55–70: the scorer took ۀ and هٔ — one
letter, two encodings — for different words; it folds them now.)
