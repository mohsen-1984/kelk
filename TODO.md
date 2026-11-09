# TODO

Open work and backlog only — what is done lives in the code, `lib/README.md`, `lib/LATEX.md`,
`lib/PDFIMPORT.md` and the release notes (`CHANGELOG.md`: 2.0, the first with the PDF import).

## Next — priorities after 2.0

From the review of the 2.0 tree. Done and in 2.0: CI and the lab's gate, security, storage, builder bugs, i18n, the
importer split into steps with a threshold registry and calibration, the fallback ladder and the import report,
page rotation and watermarks, real Word / Excel / PowerPoint / Print to PDF files in the lab, golden files and a
held-out protocol (`tests/pdf-lab/HELDOUT.md`).

**Standing rules from 2.3** (the owner's decisions; done — `CHANGELOG.md` 2.3): any «جدول N» / «Table N» title next
to a table is bold, whatever it looks like in the PDF (`_tableTitles`); Excel's merged title row is the sheet's title
and stays a heading, unless it starts «جدول N» or «Table N». Merged cells: a value merged over rows is repeated down
its rows and written once across its columns (`pq` in `table-rowspan-colspan`); a band over the header is a
paragraph over the table; a band between rows is a row of its own, bold in its first cell (`_tableMerges`). The row
behaviour is a setting, Settings → Import → *Cells merged over rows*: `repeat` (default) | `empty` (first row only,
as 2.2 did); column spans are written once either way; the same for Word, HTML and PDF import
(`importer.mergedRows`). A form's pairs are list items, row by row, everywhere (`_formRows`, `_tablePreamble`).

**Standing rules from 2.4** (the owner's decisions; done — `CHANGELOG.md` 2.4): the export buttons follow the view
(DOCX, PDF, HTML, DOC in the document view; PPTX alone in Slides); switching to Slides checks the text leniently and
stays a document, with a report, when it is plainly not in slide format (2.5: a paste or an import while in Slides
is checked too and switches to the document; editing never switches the view; a PPTX export checks again and
offers to export anyway); slides work shows its progress in one progress
window across the app (the preview's after 300 ms, not modal, taking no focus from the editor).

**Standing rules from 2.5** (the owner's decisions; done — `CHANGELOG.md` 2.5):

- Settings → Fonts («فونت (قلم)») holds every font setting. One choice serves the preview and every output
  (`Kelk.settings.fontsFor(kind)`); `fonts.wordOwn` gives DOCX, DOC and PPTX fonts of their own, the only place
  for a typed font, with a red «not installed» note (`Kelk.fonts.installed`: the system font, CSS `local()`).
  Vazirmatn is the default in every interface language. The Latin list is Calibri, Arial, Tahoma, Times New
  Roman, or '' (the text font's own letters); a text font without Latin letters (`config.fontsNoLatin`) takes
  Times New Roman, DejaVu Sans in the PDF.
- `fonts.embed` (on by default): a DOCX or PPTX carries the fonts it uses that Kelk ships, regular and bold
  (`Kelk.fonts.embed`, `lib/FontEmbed.js`): DOCX obfuscated (§17.8.1), PPTX Embedded OpenType 0x00020001,
  uncompressed ([MS-OI29500] §2.1.1134). The B fonts are named with charset 178 (`config.fontCharset`).
- The B fonts are in two commits, «The B fonts: B Nazanin, B Mitra, B Titr» and «The B fonts: their sources, the
  publisher's website, their character set», each listing its files and references; removing them means reverting
  both, the later first. Their files: `lib/pdf-base64-ttf-fonts/borna-rayaneh/` (TTFs, `NOTICE.txt`,
  `pdf-font-b-*.js`) and `borna-rayaneh/` in `assets/fonts/download/persian-fonts-ttf.zip`.
- Every pull request targets `main`; the request to publish comes only after the release PR is merged.

**2.6 — Excel** (the owner's decision of 2026-11-09): the standalone CSV / Markdown ⇄ XLSX page merged into Kelk, in
three pull requests, one release:

1. **Markdown → XLSX**: `lib/XlsxBuilder.js` (each table a sheet, named by the heading or bold line above it; the page's
   Persian formatting step, `polish`), a third view, **Excel**, with its own preview (one block per sheet with its
   name, rows and columns; the first 20 rows by default, Settings → Excel; wide sheets scroll inside the table, header
   row fixed; touch scrolling both ways), the export buttons of the view (XLSX, CSV zip), Settings → Excel (its header
   tinted in the Excel view, like Slides), the switch check (a text without tables stays where it is, with a report).
   Fonts stay in Settings → Fonts: XLSX has fonts of its own, on by default — B Nazanin for Persian, Calibri for
   Latin — since Excel cannot embed fonts (the view says so); DOCX and PPTX keep the shared font.
   SheetJS writes the workbook (as the page did: tested), loaded on demand only; Tabulator is not taken.
2. **Import**: CSV; a single XLSX (XLSX files inside a zip are ignored); a zip of CSVs, ordered like MD files, the
   dialog showing each sheet's rows, columns, encoding and separator; a zip with CSV and MD files: the user picks
   one kind, the other files are listed as ignored. Every import becomes Markdown in the editor: one `##` heading and
   one table per sheet (`<br>` for a line break in a cell, `\|` for a bar). The import report's summary table for
   the three flows. Largest import: **100,000 cells** (measured in PR 1, Chrome, a 10-column table, the Excel view:
   at 100,000 cells (1 MB) a key takes about 50 ms and putting the text in the editor about 1 s; at 200,000 (2 MB)
   about 90 ms and 4.5 s, the browser's textarea itself taking most of it); a larger file is refused with a message.
3. **Docs**: About Kelk and samples — an Excel section, the three flows as its subsections (from the page's «what this
   page is for»); og-image.html and a new og-image.png; lib/README; the README in three languages; screenshots.

**2.7 — the slides view on demand, then PDF import from real files** (moved from 2.6, the owner's decision of
2026-11-09).

**The slides view on demand** (moved from 2.5, the owner's decision of 2026-11-09): PptxBuilder (170 KB) and
`scripts/slides.js` (30 KB) load with the page, though a user who writes documents never needs them; load them on
the first switch to Slides (and for a PPTX export, the Slides settings' theme lists, a deck sample), as the PDF
importer is (`config.libs`, `Kelk.libs.need`). Already on demand: PptxGenJS and JSZip (`libs.pptx`), the slide
check (`scripts/slidecheck.js`), the icon set. Still at startup: `lib/PptxBuilder.js` (`scripts/settings.js` reads
its theme lists to fill Settings → Slides) and `scripts/slides.js` (the view toggle, the export hooks). Its startup
bytes come back to the budget.

**PDF import, from real files.** Each case is reproduced by a lab PDF of our own (failing on purpose until
fixed: its score is the case's measure), in this order.

1. **Numbers in Persian report fonts** — B Nazanin, B Mitra and B Titr: a report's amounts read «3.004» (the file's
   text has a period between the thousands; the page shows a comma-like mark): **to examine** whether these fonts
   draw «.» as a thousands separator — a reader takes «3.004» for three and a bit. The three fonts come into the
   repository with 2.5 (item 1); the owner attaches a sample PDF when the item starts, and a lab file of our own
   follows from it
2. **A designed booklet** (designed documents from browsers: heading, box and figure rules shared by every Chromium
   file in the lab) — **lab:** `chrome-booklet--booklet-cards-fa` (45.4). Cards, badges and coloured boxes:
   - a table of contents — a number badge, the title, dot leaders drawn as a dashed rule, no page number — comes
     back as headings or a table with each number a bold paragraph after its title; expected a numbered list
   - a chapter's head — a number badge beside the title, a small coloured subtitle under it: the badge a bold
     paragraph before the title, the title a bold paragraph on one page and a heading on the next, the levels
     jumping (`####` then `######`); expected «## 1. title» on every chapter, the subtitle bold under it
   - a drop cap (the first letter large, beside the first lines) splits the first word («ب یشتر») and the paragraph
   - a callout — a tinted box, a small square icon and a bold label over its text — comes back as a task item
     («- [ ] **label** …»): the icon read as a checkbox; expected a quote with its bold label
   - a formula drawn as boxes with «+» and «=» between them, each box a word and its English gloss: each word a
     heading, «+» and «=» headings; expected one line, «**نشانه** (cue) + **کار** (routine) = **عادت** (habit)»
   - two cards side by side, each a bold title over its text, become a two-column table (or headings): expected
     each card's title in bold over its text, the start side first
   Risk: high (the size and box rules decide headings and quotes for every web page in the lab)

**High (2.1)**

- PDF import, right to left: RTL fuzz files score well below English ones (RTL ≈ 77–81 against LTR ≈ 92–93; tables
  and quotes weakest, then `zwnj`); LibreOffice-path RTL files lose brackets (mirrored), lists and tables; Chrome's
  browser-default style loses quotes and code in fa / ar while the text is right
- PDF import: wkhtmltopdf Persian (`zwnj` 0, `yehKaf` 53–68 — a broken ToUnicode in the file); the narrow-space → ZWNJ
  rule hurts those files
- Startup: the builders (≈ 1.3 MB with PowerPoint) load before the first paint — load them on first use, as the
  importer already is; drop the unused `vendor/lucide.min_1.48.0.js` and the duplicate highlight.js stylesheet
- Release: GitHub Pages served from the app's set (`tools/build-release.sh`) rather than from the whole repository
  (no `.nojekyll`, no cache-busting today)

**Medium (2.2)**

- PDF import: put the calibrated thresholds to use (1,007 registered, none switched to calibrated yet); fonts with no
  ToUnicode at all; Persian digits that share a glyph with Arabic-Indic ones come back Arabic-Indic; bordered form boxes
  as tables
- Text kept safe: images and text in IndexedDB instead of `localStorage` (≈ 5 MB), and recovery snapshots (Clear and a
  crash can be undone after a reload)
- Accessibility and editor: Tab no longer traps the keyboard in the editor; quieter statistics for screen readers;
  find / replace; print stylesheet; automatic theme from the system
- Speed: the preview redoes every step on each render (cache per block); PDF.js on a real worker over http(s)
- Builders: shared helpers in one place (≈ 150 lines copied between builders, ≈ 1,400 lines of parallel per-feature
  code); DocxBuilder relies on docx.js internals
- Security: an inline `style` (`position: fixed`) can still overlay the preview pane; vendor files with checksums
- Docs: `lib/PDFIMPORT.md` (155 KB) split with a table of contents; the lab described in one place

**Optional, later**

- A layout model as an optional download (http(s) only, never from `file://`), as a second opinion on headings and tables
- OCR for scanned PDFs (tesseract.js, Persian / Arabic / English), on demand

## Backlog

### Formulas

- mhchem arrows (private-use glyphs) → Unicode arrows: chemistry as native MathML and Word equations
- Right-to-left `\text` as vectors (PDF) and inside Word equations (today a PNG)
- Inline `$$…$$` inside a paragraph as a centered block in Word and PDF (today inline)
- Preview "copy": the formulas' TeX in the plain-text flavor
- Equations pasted from Word (rich HTML: OMML in `<!--[if gte msEquation 12]>`) → `$…$` (`ommlToTex` already reads Word's HTML form)
- OMML ↔ TeX: `\color`, `\binom` as a delimiter, table rules (array `|`), `\label` / `\ref`
- MathJax 4 size (1.5.1): prune unused font ranges (Braille, Cherokee …) from `vendor/mathjax_4.1.3` (~12 MB; about half the zip)
- Large documents: typeset formulas lazily (visible first) in the preview

### PDF

- GPOS kerning; marks on ligatures (MarkLigPos)
- `#anchor` links inside the document
- `rowspan` in tables

### PDF import (`lib/PdfImporter.js` and its parts in `lib/pdfimport/`; how it works: `lib/PDFIMPORT.md`; tests: `tests/pdf-lab/`, `tests/builder-suite.html`)

English PDFs from other programs: done for Chromium / Edge, wkhtmltopdf, LibreOffice (Writer, Calc, Impress,
HTML), pandoc, Kelk (corpus scores 97–100; what is left is lost in the PDFs themselves — `lib/PDFIMPORT.md` §9).

**Producers still to test** (files needed — none of these programs runs in the build environment)

- A Word file with real SmartArt (the lab's `.docx` holds a drawn diagram instead), through Word "Save as PDF" and
  Microsoft Print to PDF
- ~~Word "Save as PDF" and Microsoft Print to PDF of `corpus/word-*.docx`; Excel's own export and Microsoft Print to
  PDF of `corpus/xl-border-*.xlsx`~~ — done: `tests/pdf-lab/pdf/real-producers/`
  (`word2024-save--`, `msprint-word--`, `excel2024--`, `msprint-excel--`, made by `scripts/make-real.ps1`), with
  PowerPoint, Edge, Chromium and Firefox and the lab's own `corpus/real-*` documents
- WeasyPrint (the free alternative to Prince): `pip install weasyprint`, then the corpus's HTML through it
  (PyPI was blocked in the build session); Prince itself if a licence is at hand

**Layout**

- Provenance profile (`r.profile`, `PDFIMPORT.md` §2a): done; the user sees `printNoLinks` and `ocrLayer` notes
- Tagged PDFs in the lab and `scripts/struct.js` (structure trees audited): done. Chrome's trees cover 93 % of the text,
  LibreOffice's 100 %, Calc's 1 % (an empty root); quote and code roles only from LibreOffice's HTML import
- The structure tree read and measured (`_structure`, `g.struct`, `r.structure`, trust; `PDFIMPORT.md` §2b): done. Its
  headings match the source at 99.5 on the tagged fuzz files, the importer's own at 93.3 — the room for the next item
- The structure tree for headings (`_treeVote`, `PDFIMPORT.md` §8.4): done (tagged fuzz dev 93.3 → 96.8; the tree
  itself 99.5 — the rest of the gap: groups the tree reaches below 80 %?)
- From the tree, done: tables (`_treeTables`). Lists: no room measured (tree 93, importer 92). Left: tagged tables the
  geometry did not make a table block at all (text the tree calls cells, read as paragraphs), right-to-left tables
- The outline (read into `_outline`): headings of untagged files that carry bookmarks (Word, LaTeX hyperref) — titles
  matched to lines, levels from the outline's depth. Not built: the lab has no untagged file with bookmarks and its
  untagged headings stand at 98; measure on real Word files first
- Text beside a float, first lines (untagged files): one word a line beside a float — tagged files are joined by the
  tree now (an encyclopedia page from Edge)
- Floats beside text: a caption that runs beside the text below its figure can interleave with it
- A paragraph split by a float (table, footnote) between the end of one column and the next is not joined again
- Footnotes stay where they are on the page (after the text of that page), not collected at the end
- Rotated text (90°, vertical table headers): lines are not rebuilt
- Tables / code inside quotes (today lifted out of the quote); quote inside a list (nested quotes: done for
  bars, boxes and indentation)
- Bare HTML tables (no CSS) whose cells hold inline code: partly — a code cell beside a text cell is cut
  when the gap is a third of an em (LibreOffice's HTML tables); Chrome's bare tables with touching code
  chips not tested
- One-line paragraphs set about 2.4 lines apart, with too few wrapped lines to learn the leading (Kelk's
  symbols page): a line that nearly fills the column joins the next paragraph
- A fallback font with a wrong advance width (₹, ₿ in LibreOffice PDFs) runs into the next glyph: the space
  after it is lost; narrow and no-break spaces (U+202F, U+00A0) come back as plain spaces
- Formulas (LaTeX math drawn as glyphs or vectors): reading order inside a formula
- Inline code with letters the code font lacks (Persian in Courier) splits the code span

**From real files** (the user's own PDFs — English, Persian and mixed, a little under a hundred, from Word, Print to
PDF, Excel, Foxit, InDesign, Acrobat, Prince, iText, PowerPoint, Chrome, Edge, Firefox, Opera, web-to-PDF services,
ReportLab and others — read to an acceptable level. They are private: neither kept nor named here. Each pattern one
showed is rebuilt in the lab with our own text, and the lab is what the rules are checked against.)

- **Product owner: more real PDFs when they come.** Each problem is reported with the PDF and what is wrong (what the
  page shows, what came out), one issue at a time, and fixed in its own round with a lab PDF of our own for it
- Arabic ي ك and Arabic-Indic digits in a Persian document: decided — two import settings, on by default
  (numbers in ASCII; Persian letters in a Persian document), PDFIMPORT.md «Numbers and letters on the way out»
- Rebuilt in the lab, done (their open remainders are under «Left from real files» below): invoices and forms
  (`chrome-form--form`, `--form-fa`); Persian decks from PowerPoint (`pptx-rtl--slides-rtl`, `pptx-arial--deck-arial`);
  Prince letters (`prince-letter--letter-dash`, `--prince-table`); a Word plan's form (`word-plan--plan-fa`); an
  iText-stamped circular (`itext-word--circular-fa`); a circular on a Word letterhead (`word-memo--memo-fa`); a Word
  flyer in an art border (`word-flyer--flyer-fa`); an Acrobat PDFMaker booklet (`acrobat-word--booklet-fa`); a Word
  call with lists in its cells (`word-cells--cells-fa`); a field box with a wrapped value (`word-plan--plan-box-fa`), a
  caption and a title on one baseline (`word-sides--sides-fa`), a Prince letter in a modern font
  (`prince-shapes--shapes-fa`), a variable font through Chromium (`chrome-rtl-varfont--fa-weights`); an encyclopedia's back matter from Firefox
  (`chrome-fa-links--fa-links`); a floated infobox (`chrome-float-tagged`); a Word / Print to PDF memo (`word-print`)
- Limits the PDFs themselves set (no change planned): a mobile page wider than the paper is cut at its edge (the
  text beyond is not in the file); fonts that draw ASCII digits in Persian shapes keep ASCII (§4, the digit
  rule); a ZWNJ the source put where no shape needs it is kept; a list in a table cell is written «•» and `<br>`
  (Markdown has no list in a table)
- Left open, general (no lab file fails on it any more):
  - a cookie banner or dialog over a page: the text under it is hidden now, its own text stays between the
    page's blocks, under the links drawn beneath it
  - an untagged letterhead on the first page only is kept (no evidence tells it from a title); a watermark
    (rotated text across the page) is not looked for; a side panel that alternates sides on even and odd
    pages is not matched
  - fonts whose cmap has no presentation forms: a lost ZWNJ is read from the outlines where the font is an embedded
    TrueType program (round 26); not from CFF or Type 3 glyphs, nor without the program (the «می/نمی» rule covers the
    commonest case)
  - guessed glyphs with no name outside the presentation-forms order (a calligraphic font's ligatures) come out
    U+FFFD
  - recall against pdftotext for Arabic script (`run-real.js`) stays rough in word order inside mixed lines
- Decided in the rounds, kept as they are: a sheet's merged title row is a level-1 heading; a letter's mark at the
  other margin of its first line is read after the lines at the start side (reading order); `Medium` weights
  count as bold

**Text layer**

- Emoji drawn through supplementary private-use codes (U+F0000–U+10FFFF; Chrome's flags and keycaps with Noto Color
  Emoji): not taken for unmapped (only the BMP private-use area is), so they come out as those codes; the tagged
  file's `/ActualText` names them — trace them back through the font's GSUB as ligatures are
- Microsoft Print to PDF drops link annotations (links come back as plain text); a colour emoji whose
  embedded font has lost its cmap entry comes back as an inline image
- `/ActualText` is read from page content streams stored as plain or Flate objects; inside object streams,
  other filters or encrypted files it is not (the guesses for list numbers and minus signs remain)
- Text drawn as outlines (Microsoft Print to PDF can do this): no text layer — needs the OCR phase
- Scanned PDFs: optional OCR (tesseract.js, Persian traineddata) as a separate phase
- PDFs that already carry an OCR layer (lab `ocr-tesseract--article` 90.8, `--features` 99.1, `--report` 91.5): what is left is mostly the
  OCR's own misreadings (a struck word is misread under its strike). From the scan, still not read: italic (a
  slant), inline code (a monospace word in prose), a thematic break (a rule), an empty task list (an empty box
  is too faint to tell from a gap — a list needs one ticked box); the page's running foot read into a table
  (report). Features is no longer a check file: its rules were written on it

**Left from real files** (round 25b: every item says where it can be worked on — **lab:** a lab PDF holds it; **lab to
make:** the pattern is clear enough to rebuild without the file; **needs a sample:** the real file is gone and the
pattern cannot be rebuilt faithfully from the note alone — the owner re-uploads one, a lab PDF is made from it, then it
is fixed; **decided / limit:** kept as it is)

- Headings and titles
  - a banner's title lines at two heading levels (`##` over two lines, the larger line `#`, a kicker line between them
    a paragraph) — **needs a sample** (a Word flyer's banner)
  - slides: a cover's two titles (Persian and English) both `#`; a section title `##` under the cover's `#`; one role at
    different levels from slide to slide; a label line and the bold item under it as one paragraph with a `\` break —
    **needs a sample** (PowerPoint decks; `pptx-rtl`, `pptx-arial` hold other habits)
  - a home page printed by a web-to-PDF service (Type 3 fonts, no weight in their names): titles at 1.33 × the body no
    headings, a display sentence over three lines as three paragraphs, a card's label row out of its table, a button as
    a list item — **needs a sample**
  - titles drawn as pictures of text, or set in calligraphy on slides — **limit** (OCR only, the optional phase)
- Letters and forms
  - a letter's head matched across pages piece by piece only in the 12 % band (a field one page draws as one line and
    the others as two, deeper in) — **needs a sample**
  - a head with two dates or two numbers stays bare — **decided** (which date is which cannot be told)
  - a form's «label: value» box holding a sentence-long value over two lines — **lab:** `word-plan--plan-box-fa` (round
    26: the box was read as a quote; fields now)
  - two lines on one baseline at the page's two sides run together (a signature caption and the next table's title) —
    **lab:** `word-sides--sides-fa` (round 26: the rebuild, drawn apart or as one line of spaces, keeps them apart; it
    showed the order — the title came between the signer's name and the caption — fixed). That they ran together in the
    owner's file is not reproduced — **needs a sample** if it shows again
  - a title over a ruled table stays a paragraph (Excel's title cell rule); a header's title between its pairs may read
    after the first pair — **lab:** `chrome-form--form`, `--form-fa` (order 98)
  - a framed box at a page's foot reads as a quote — **needs a sample**
- Words and letters
  - a ZWNJ glyph's room read as a word gap inside a word (a space before «ه‌…») — **needs a sample** (which Word font)
  - a ZWNJ the file draws after a letter that joins nothing, a space drawn inside a word, a word drawn broken (a final
    form before an isolated alef) — **decided** (kept as drawn)
  - a ZWNJ in a font used for a few words only (bold, twice on a page) — **lab:** `prince-shapes--shapes-fa` (round 26:
    forms by outline, TrueType programs). The same in a CFF program (`FontFile3`: its outlines are not read) — **needs a
    sample**
  - a calligraphic title whose touching words appear nowhere else in the document (no witness) — **needs a sample**
  - a cover title in a decorative font loses letters — **limit** (pdftotext too)
  - word gaps under loose tracking — **lab:** the metamorphic `trackLoose` transform (7 of 18 files, −16)
  - a variable font's weight is not read (a `[wght]` font's bold reads regular) — **lab:**
    `chrome-rtl-varfont--fa-weights` (round 26: Skia's Type 3 instances told apart by width); italic of a variable font
    (a `slnt` / `ital` axis) is not read — **needs a sample**
- Pages
  - a cover drawn as one full-page picture, its title as text under it — **decided** (round 25a2: the text is read, the
    cover's own words)
  - a nine-column table exported to a portrait page wraps every cell — **limit** (the Markdown carries no orientation)
- An encyclopedia printed from Firefox: a reference mixing Persian and Latin in one wrapped item in a scrambled order;
  a Latin item of a right-to-left list found only on a right-to-left page; the margin rule's quote guard —
  **lab:** `chrome-fa-links` (the back matter; the guard itself is not reached there) — the rest **needs a sample**

**Lab PDFs to make** (the corpus's gaps: the **lab to make** items above, and the cells the coverage matrix finds empty)

- From the right-to-left backlog: Word's ToUnicode «ت → "»; a Hebrew Word file's brackets; full harakat on ligatures;
  nested numbered lists mixing directions
- From the coverage matrix: landscape paper, pattern fills, Arabic as plain letters, text over a page-size picture,
  an untagged file with bookmarks (the outline), rotated text (a watermark, vertical table heads)
- In the fuzz generator: a tracking dimension (CSS `letter-spacing`, `font-stretch`) to replace `tz85` / `trackTight` /
  `trackLoose`

**Kelk ↔ Kelk**

- PdfBuilder writes its Markdown source (XMP `kelk:source` or an attached `.md`), with a setting — the
  importer already reads both and returns them losslessly; PdfBuilder does not write them yet

**Next phase: right to left** (Persian, Arabic, Hebrew PDFs from other programs — fonts, ToUnicode repairs,
mixed-direction lists and tables)

- Word "Save as PDF" maps Persian ت to `"` in its ToUnicode («م"ن» for متن) — fix from the font's own cmap
  (as done for Microsoft Print to PDF); a Persian Excel sheet (Microsoft Print to PDF) repeats a merged
  cell's text in its last row
- A Hebrew Word PDF reads its brackets mirrored the wrong way ("15)ב()4(")
- Arabic with full harakat: marks on ligatures (ﷲ) can land on the wrong letter (the zero-width mark rule
  of `PDFIMPORT.md` §4 is limited to Latin marks so far)
- Nested numbered lists mixing directions: levels can be off by one

**From the right-to-left corpus** (`make-rtl.js`, `chrome-rtl-*`, `wk-rtl`, `lohtml-rtl`, `kelk`, `kelkdocx-lo`)

- LibreOffice (from .docx and from HTML): brackets mirrored (`brackets` 0 — probably Vazirmatn's RTL bracket
  glyphs, outside the cmap: read them by their outline), a nested numbered list read as a table, list markers
  as text. (Word spaces named ZWNJ: done)
- LibreOffice HTML tables whose cells stand a word space apart (0.25 em): cells run together, and inside them W2
  reads a number after the next cell's word (`lohtml-rtl--fa-report`: «%42»)
- **Decide: Kelk's PdfBuilder and bidi rule W2.** Kelk sets a number after Persian text as a European one
  («بند 2-6» drawn «2-6», «8%» with its sign at its right), where Word, Chrome and LibreOffice follow the
  Unicode algorithm (drawn «6-2», «%8»). The importer reads each as its producer meant (the provenance names
  Kelk), but Kelk's PDFs show a reader some numbers otherwise than Word would
- A heading only 1.2 × the body (18 / 15 px, bold) is read as a paragraph (`chrome-positioned`)
- Chrome, browser-default style: tables and quotes lost in Persian and Arabic (the styled pages 83–100)
- A slide's paragraph whose last line ends short is split before it (`slides-fa`)
- wkhtmltopdf with Vazirmatn: a broken ToUnicode (letters named «4», «@»; pdftotext loses them too) — the
  font's own cmap could name them, as for Word's «ت → "»; ZWNJ lost; runs interleaved in a line
- Kelk's own: `fa-features` 85 (its quotes)

**From the metamorphic net and the coverage matrix** (round 2 of the 2.0 work; `run-meta.js`, `features.js`)

- Condensed and tracked type: the transforms `tz85`, `trackTight`, `trackLoose` set `Tz` / `Tc` where each run
  stands, so for producers that place every run by its own position (LibreOffice, pandoc) they open gaps no
  real producer leaves (a bold word and its comma, an italic word and its sentence) — much of their −5 to −16
  is the transform's. Replace them by a tracking dimension in the fuzz generator (CSS `letter-spacing`,
  `font-stretch`: Chrome lays the type out itself); keep them meanwhile as regression guards. (Word gaps from
  the line's own gaps, the Prince / InDesign family: done)
- Object streams: font descriptors inside them are read (round 25a2: the Persian Word file −50 → 0). Left: a tagged
  Chrome file −15 under `objstm` (its structure tree or `/ActualText`)
- A page background (`pagebg`: the deck −35, wkhtmltopdf's readme −15) and a coloured band (`band`)
- `scale80`: Chrome's report −10 — a threshold in points somewhere
- Cells no lab PDF has: landscape paper, pattern fills; one file only with Arabic as plain letters and
  with text over a page-size picture — make lab PDFs for them (pictures: `make-pictures.js`, done)
- Slides from PowerPoint (a real file): a gradient bar beside a paragraph reads as a quote bar. (Blank decorative
  shapes, one colour: done) (The ZWNJ inside words, «ه‌وشمند»; dot grids: done)
- Pictures: a picture in a table cell stays in its row (a row is one Markdown line — text wins there too?);
  a lone colour emoji kept only as a picture stays inline (it stands for a character)
- The scorer does not see a paragraph split in two (words and order hold): the inline badge's split scored 100
- A calligraphic (Nastaliq) line «بسمه تعالی» comes back in pieces and out of order (Prince letters) — PDFium's
  sloped and fake-bold run: done

**Infrastructure**

- Style fuzzing (`tests/pdf-lab/scripts/make-fuzz.js`, `run-fuzz.js`): done — dev 83.5, held-out 87.2 at the
  start. Next: more producers in the generator (LibreOffice from the same HTML)
- The gate (`scripts/gate.js`, `baseline.json`, `.github/workflows/pdf-lab.yml`): done; the workflow has not run
  on GitHub yet — check its first run (apt fonts, Playwright install)
- Two columns, done: a table continued in the next column (header repeated) is joined; lists in narrow columns
  (the body size). Left: the rows at a table's ends (above the first band, below the last) have no bound — two
  guesses were measured and dropped; small headings (1.15 em) beside a table's rows are taken into its row region;
  code wrapped by `pre-wrap` in a narrow column breaks into separate code blocks
- From real files (round 25b): a Latin letter's head — its bare date, reference and attachments labelled «Date», «No.»,
  «Attachments»; a date that names its month; a reference opening with letters: done (lab `chrome-letterhead--letter-ltr`)
- From real files (round 25a2): a Word letter's notes (one mark drawn as a picture), a cover's band line, a list's
  brackets in a file of object streams: done. Left: a cover drawn as one full-page picture with its title as text
  under it — the text is read though the reader sees only the picture (kept: it is the cover's own words)
- From real files (round 25a): footnotes collected after the paragraph they would have cut, a title page's second
  heading a paragraph — done (lab `word-report--report-fa`). Left: a note that runs on to the next page's foot; notes
  under no separator and with no mark of their own. (A signature bold and a size up reads as bold text, in the lab and
  in a real Word letter, round 25a2: the old case that read as a heading is not reproduced)
- From real files (round 24b): a typeset book's contents — the leaders, an entry a line, a portrait beside a biography:
  done. Left: the contents' depths (entries set in at three levels) come back as flat paragraphs; a leader's
  `/ActualText` of a control character (the tab it was) is not read as a tab
- Fuzz weak spots (round 24): lists, tables, quotes done (dev 91.1 → 96.0, held-out 91.8 → 94.6). Left, measured on
  dev: a two-column page's tables (held-out 53) — a zebra table cut by the column break, a wrapped row cut by a page
  break («P-» / «124» on two pages); a justified line that cannot stretch a long address (a URL and «so» at the
  far side) read as a row of two cells with the paragraph's next line; code boxes split in two columns; a page of
  emoji lines in wkhtmltopdf read as a quote
- Weak in both fuzz splits (earlier): two columns — shaded rows are no longer quotes, tables stay in their column;
  false quotes in documents that have none (fewer now). Done: a code block with a side bar read as a quote; one-line
  paragraphs with a first-line indent read as a quote

- Robustness (`_yield`, page isolation, `signal`, `page.cleanup`, no `getTextContent`, Markdown in chunks): done. A Cancel
  button while a file is read or made: done (the task dialog). Next: the GSUB repair's raw index
  (`_rawIdx`) is one pass over the whole file — the last hold of a quarter second on long files
- The round trip (`scripts/roundtrip.js`) in the workflow and the gate too
- Minified PDF.js: build `vendor/pdfjs/pdf.min_<v>.js` / `pdf.worker.min_<v>.js` from jsDelivr's
  `build/pdf.min.mjs` and `build/pdf.worker.min.mjs` with `tools/build-pdfjs.js`, then switch `scripts/config.js`
- Encrypted PDFs with a user password: a message only (`password` option exists, no prompt in the page)

### Slides (`lib/PptxBuilder.js`; convention: `lib/SLIDES.md`; tests: `tests/slides-suite.html`)

- Equations (`a14:m`) checked in more PowerPoint versions (Mac, the web) and with \text{…} in Persian
- Transitions and simple builds (one bullet at a time): written into the slide XML after PptxGenJS
- Speaker notes with formatting (bold, lists), and notes per callout
- Pictures as backgrounds (`slide: image=…`, a dark veil under the title)
- More chart options: axis titles, a secondary axis, scatter with numeric X
- Import: .pptx → Markdown in the same convention (titles, lists, tables, notes)
- The slide preview drawn with the Word fonts when installed (now: the page's fonts)

### Excel (`lib/XlsxBuilder.js`)

- Low: write XLSX without SheetJS (its ~950 KB load on the first XLSX export): the polish step already rewrites the
  sheets' views, columns and styles; the cells, shared strings and links are a small writer of our own on JSZip.
  SheetJS would then load only to read an XLSX.

### Other

- Arabic texts (interface and about document) to be read by a native speaker

**Not the importer**

- Characters a document font lacks and no fallback has (Word's symbol fonts in the private-use area, U+F0xx, typed
  or pasted): a map to Unicode at the builders too (the importer maps them already)
