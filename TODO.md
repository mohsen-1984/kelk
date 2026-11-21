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
its rows (with `repeat`, below) and written once across its columns (`pq` in `table-rowspan-colspan`); a band over the header is a
paragraph over the table; a band between rows is a row of its own, bold in its first cell (`_tableMerges`). The row
behaviour is a setting, Settings → Import → *Cells merged over rows*: `empty` (first row only, as 2.2 did; the
default again since 3.1, the owner's decision of 2026-11-18) | `repeat` (the default from 2.3 to 3.0); column spans are written once either way; the same for Word, HTML and PDF import
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

**Standing rules from 2.6** (the owner's decisions; done — `CHANGELOG.md` 2.6):

- Excel is a third view. Each Markdown table is a sheet, named by the heading or bold line above it; every CSV or XLSX
  import, and a CSV paste in the Excel view, becomes Markdown in the editor — one `##` heading and one table per sheet
  (`<br>` a line break in a cell, `\|` a bar) — so the three flows share one pipeline. Cells pasted as an HTML table
  in the Excel view get a «Table N» heading too.
- XLSX has fonts of its own, on by default (B Nazanin, Calibri): Excel cannot embed fonts, and the view says so. SheetJS
  writes the workbook, loaded on demand; `lib/XlsxBuilder.js` styles it (the standalone page's polish step).
- An XLSX comes in on its own only (never from a zip); a zip with CSVs and documents: the user picks one kind. Merged
  cells follow Settings → Import. More than 100,000 cells is refused (measured: 50 ms a key at 100,000 cells, 90 ms
  and 4.5 s to load at 200,000; the textarea's own cost).
- Wide tables in the preview (the document and the Excel view) behave like fenced code: no wrapping before a real line
  break, scrolling sideways in their own block (`kelk-wide`: the columns' longest words do not fit the pane).
- Each view has its own sample (about, slides, excel). Settings → Excel's words load with the Excel module.

**Standing rules from 2.7** (the owner's decisions; done — `CHANGELOG.md` 2.7):

- No generic progress anywhere in Kelk: every task, import or export, names the step under way, in fa / en / ar
  (`Kelk.ui.steps`; `Kelk.ui.task` refuses an empty step); the page repaints before a long step that holds it.
- The imported file's information (PDF, DOCX, XLSX, HTML) sits in the import report, collapsed, shown only when there
  is something to show; what the file says, as written, apart from what Kelk infers (labelled a guess, with its
  evidence); the operating system only when the file names it, never from the fonts. A button copies it as GFM
  tables. The report stays open `reportOpenMs` (5 s) after an import.
- Kelk writes what the PDF says: a numbered badge that draws only «1» comes back «## 1 title», no period added.
- New lab files are ours, made by a script, with no personal metadata (author, company, user names).
- Excel: header rows and the other rows wrap separately (`excel.wrapHead` all, `excel.wrap` none by default); any RTL
  cell still makes the whole sheet RTL (2.6), so each sample keeps an all-English sheet to show one left to right.

**Standing rules from 2.8** (the owner's decisions; done — `CHANGELOG.md` 2.8):

- Every report panel has one copy button, *Copy report*, the same in each: the whole report as Markdown (findings a
  list, pages and file information GFM tables). The «no tables» message has none.
- Scroll sync applies only side by side; in one column it is ignored, the setting kept.
- Code that only some users need loads on first use, from file:// too (`Kelk.libs.need`, script tags): the export
  builders, the slides deck with PptxBuilder; the step is named while it loads. HtmlBuilder and the Word template stay
  at startup (the preview is built on them).

**Standing rules from 2.9** (the owner's decisions; done — `CHANGELOG.md` 2.9):

- Real samples the owner shows stay private: never a file, its name, its text or its content in the repository,
  a commit, a pull request or this file. Each problem gets a lab file of our own, made by a script.
- Fontprints, not a rule per font: a glyph is known by its outline's hash (`lib/pdfimport/fontprints.js`). Fonts the
  owner supplies enter as hashes only. The B fonts' fontprints are in commits of their own, and no face is written
  over a B face (a family taken out takes no other face's records).
- The font arbiter: where a file's map is sound, only a glyph named as another kind of character takes the face's
  (a bracket read «م», a comma read as a stop); where the map is not the font's, every glyph the face knows does. A
  digit the file names stays; ي / ی and ك / ک stay the file's (no outline tells them apart).
- The judge reports, it does not rewrite: `garbledText` names the fonts and pages; the Markdown stays.
- Hidden text is shown, never dropped unsaid: one quote at the end (default), in place, or left out (Settings →
  Hidden text in a PDF); its note in the document's language (the trusted text, a Persian or Arabic `/Lang`, the
  interface). Never an OCR layer.
- GitHub alerts come out in every export: a bold label in the quote's language; the preview and HTML draw them as
  GitHub does.
- A number with its period or closing bracket, or a bullet, typed against the item's word starts an item, as with a
  space; a number and a dash («1- …») is a paragraph. Markdown writes every ordered item «1.».
- `---` in Markdown is a horizontal rule, never a page separator.

**Standing rules from 3.0** (the owner's decisions; done — `CHANGELOG.md` 3.0):

- One release per session; a change that makes another lab file worse is dropped, not tuned around; each importer PR
  reports the lab; a lab expectation that looks wrong is flagged, not changed (the working agreements, 2026-11-17).
- A chapter's number badge stays «## 1 title»: no period the PDF does not have (2026-11-11).
- «label: value» lines are paragraphs of their own, everywhere; the pieces the field rule splits off keep their
  joined paragraph's direction and are no heading.
- A band over some of a table's columns is a column group: in the header, written once, the cells beside it repeated
  under it; a band over all columns is the table's title.
- A bracket pair of Latin content drawn after a Latin word stays the golden `rtl-basic`'s reading
  («(Business Process) BPMS») when the glyphs cannot tell.
- A drawing with short labels is one picture, its labels in the alt text; a mail's print head is its subject in bold,
  then its sender and date.

**Standing rules from 3.1** (the owner's decisions; done — `CHANGELOG.md` 3.1): `lostText` fires only for text a
step drops with no known reason — what a step drops on purpose (page furniture, pictures, page borders, a table's
header row repeated on the next page) is not lost text, at most a plain count, never a warning. Cells merged over rows
come in their first row only by default (`mergedRows: 'empty'`, page and libraries alike; `repeat` stays a choice).
ASCII numbers and Persian letters apply to every import and rich paste, not to typed text, an opened .md file or
code. A PDF, like an XLSX, does not come in from a zip. A lab expectation that a fix makes untrue (`wk-rtl--fa-article`
no longer garbled) is turned around only with the owner's approval. The app zip holds the app, its three sample
documents, README.md, LICENSE and the notices; the with-pdf-lab zip is the whole tree, CLAUDE.md with it.

**Standing rules from 3.2** (the owner's decisions; done — `CHANGELOG.md` 3.2): a font Kelk does not know, which the
file does not name, is read by the shapes of its glyphs against the fonts Kelk ships, only when the reading reads as
language, and reported «recovered, approximate» (`fontApprox`) — never marked in the Markdown; Settings → Import →
*Fonts Kelk does not know*, «Read approximately» by default. The shape data (300 KB) loads only when a PDF has such a
font, never at startup, from file:// too. The reading's limits and the shapes' weights are set on the fonts Kelk ships
only (`tools/calibrate-shapes.js`), never on the lab files; the lab files whose text a reading must find stay out of
`letterstats.js` (`MEASURED` in `tools/build-letterstats.js`). `driver-print--unreadable-fa` must always report garbled
text. A lab font's shapes never enter `shapes.js` (FreeSerif, Liberation Serif: the answers). The B fonts' shapes stay
removable in one commit, as their fontprints.

**Standing rules from 3.3** (the owner's decisions; done — `CHANGELOG.md` 3.3): bare CFF programs (FontFile3
`/Type1C`, `/CIDFontType0C`) are read by `lib/pdfimport/cff.js` — a CID-keyed font by CID, its charset mapping CIDs
to glyphs; a CFF font no reading recovers is always reported garbled (`distiller-cff--cff-unreadable-fa`), never
passed off as text. DejaVu Serif's TTFs are a build input of `shapes.js` only (its ASCII letters), out of the app
zip; the Latin limits stayed (0.04, 0.10). Word's ت named «"»: the font's own cmap wins over an ASCII sign as over a
wrong letter. A ToUnicode value of tatweels and one letter is the letter. In a Persian text ي ك ى become ی ک ی and ە ھ
become ه, in every import — Arabic keeps ى, a text with Urdu or Kurdish letters keeps ە and ھ. The text of 3.3's lab
files stays out of `letterstats.js` and of `calibrate-shapes.js`'s letter pairs for good. The lab's generators write
TrueType programs with a fixed date (`rtl_pdf.fixed`).

**3.5 — candidates** (after 3.4's OCR; the owner, 2026-11-21): **the closest reference family first** — pick the
reference family nearest the unknown font, then rank within it, to win back the sans Latin acceptance the serif
shapes cost («The serif shapes and the sans Latin readings» below).

**3.4 — OCR on demand** (the owner, 2026-11-21; split approved: lab → engine → import → release). Decisions:
Tesseract (tesseract.js-core 7.0.0, its SIMD-LSTM build — never the relaxed-SIMD one, which aborts with the `best`
models — called directly, not through tesseract.js's worker, which `file://` cannot load), not PaddleOCR; the `fas`
`best` model only, a script loaded only when OCR runs, from `file://` too, never at startup; our own line finding,
each line read alone (psm 13), then post-correction with the language model's word list (`tools/lm/lm.json`, its
`file://` copy `lib/pdfimport/lm-fa.js`, also never at startup); Persian only, and only pages that are one picture;
Settings → Import → *Scanned pages*: «Ask» (the default: the report offers «Read with OCR»), «Read with OCR», «Leave as
pictures»; OCR runs on the main thread, so it has a Cancel button and a page range and yields between lines; the app
zip grows by the core and the model (about 8 MB). OCR votes for decipherment stay for 3.5.

1. **Lab** (`pdf/3.4-lab`): `make-scans.js` — `scan-300--scan-plain-fa`, `--scan-framed-fa`, `--scan-headings-fa`,
   `scan-150--scan-low-fa`, our own text, in no text the language model counted (pending `ocrRead` in
   `expect.json`); the language model and its builder `tools/build-lm.js` (the corpora never in the repository).
2. **Engine** (`pdf/3.4-ocr-engine`): the core and the model vendored; `lib/pdfimport/ocr.js` (the spike's
   `ocr-lines.js`: Otsu, frames and rules out, lines found, psm 13, `postCorrect`); unit tests. With it, as the owner
   asked (2026-11-21), the importer's side: `options.ocr` `'read'` (default `'picture'`, as before) reads the `ocr`
   rung's pages after the layout, a line at a time, in the import's own progress steps (`ocrLoad`, `ocr` named by page
   and line) and Cancel; the report's own OCR category (pages, the share of known words, notes); `o.ocr` of the app's
   PDF import. Lab scans (`ocr-check.js`): CER 1.1 %, WER 3.2 %, about 1 s a page.
3. **Import** (`pdf/3.4-ocr-import`): Settings → Import → *Scanned pages* (Ask, Read with OCR, Leave as pictures);
   the report's «Read with OCR» with a page range (a re-import of the same bytes, `ocrPages`); the lab with OCR on and
   `ocrRead` real; the askew frame and «هٔ» fixes (lab scans: CER 0.21 %, WER 1.0 %); line sizes from the ink, so
   headings are found; no line a few pixels high (a real scan's 1-pixel rows took Tesseract up to 100 s each). A real
   scan of about 300 pages, run outside the repository: nearly every page read, 0.83 of the words known on average, a
   tenth of the pages under 0.7 (lowConf), about 2.6 s a page.
   Open: `corpus/scan-headings-fa.md` has level-2 headings and no level 1, the importer gives level 1 (asked of the
   owner, PR 3); the whole real scan crashed the headless browser's tab in 2 of 5 runs before its layout ended, with or
   without OCR and with 3.3's importer too, its JavaScript heap staying under 100 MB — to look into (memory outside
   the heap: pdf.js's JBIG2 decoder?).
4. **Release** (`release/3.4`).

**A session of its own: real Arabic PDFs and Arabic fonts** (the owner's request, 2026-11-18) — «Left from 3.1» below.

**Not placed in a release yet** (moved out of 2.8's scope, 2026-11-11):

- **Left from 3.2** (2026-11-19):
  - **Short fonts alone** (`word-cover--glyph-index-fa`, stays reported garbled: the owner's decision, 2026-11-19): two lines of seven letters in a font Kelk does not know, no
    other font of the page read — under 20 letters the pairs say nothing (on the fonts Kelk ships, a wrong reading of
    30 letters passes one time in eight). Another sign is needed: the OCR phase's votes (proposed for 3.4).
  - FreeSerif's alef read «أ» in a few words («أن»): a hamza's small part weighs little (`W_DOTS`, set on the fonts
    Kelk ships); not tuned on the lab file.
- **Left from 3.3** (2026-11-21):
  - **The serif shapes and the sans Latin readings** (measured on the fonts Kelk ships): with DejaVu Serif among the
    references, a Vazirmatn page playing an unknown Latin font is accepted less often — 9 → 5 of 12 at 30 letters, 12 → 3
    at 150 and 12 → 3 at 600 (reported garbled, never read wrong; wrong readings still accepted 0 %). The idea to win it
    back is a 3.5 candidate above.
  - **IranNastaliq is still reported garbled after the tatweel fix** (seen in a real Word file): its tatweels are gone,
    but the judge still doubts the font. Find out what it objects to — the Nastaliq title's spacing, words drawn
    touching, or its letters — before changing anything.
  - **The Persian letters folding has unit tests only** (`tests/unit/write-out.test.js`): no real file with ە, ھ or ى
    in a Persian text has been seen yet; check it on the first one.
  - **CFF, not read yet**: a CFF table inside an OpenType program (FontFile3 `/OpenType`); a plain CFF font whose codes
    the PDF's `/Encoding /Differences` remaps; seac accents.
  - **Word's ت in a short font**: a bold title's font has too few letters for the cmap rule and keeps «"اریخچه»
    (`word-save--teh-fa`); real quotes around a Latin word in a right-to-left line come back «Ketabnama""».
  - **A real file with CID-keyed CFF fonts imports about twice as slowly** (its body fonts now read by their shapes),
    and its report's confidence is lower: the fonts it cannot read are reported now, where 3.2 passed garbage through.
- **A shape's scale and split subsets** (3.3): a shape is measured against the median height of its program's
  glyphs, so a font whose digits and marks sit in another subset (Distiller's) reads a little differently from the
  same font whole — FreeSerif's alef read «أ» throughout `distiller-cff--cff-cid-fa`, in a few words of
  `unknown-serif-fa`. Not tuned on the lab files.
- **Many subsets of one font** (2026-11-21): one font embedded as dozens of subsets (a
  subset a page or a section), each with little text. A reading that has to learn a font from its own text (3.2's
  shapes, a later decipherment) does worse and takes longer on each alone; subsets that share outlines are one font
  and can be read together.
- **Left from 3.1** (2026-11-18):
  - **A table row cut by the page break is dropped** (Chrome splits a ruled table's row whose cells wrap: its first
    lines at a page's foot under no closing rule, the rest on the next page; both parts are lost). Found by
    `lostText`; the lab file `chrome-cutrow--cut-row` must report it until the fix, then its expectation is turned
    around with the owner's approval.
  - **wkhtmltopdf's ZWNJs** (`zwnj` 0 in `wk-rtl--fa-*`): a space laid over the letter before it, the next letter
    ending where that letter starts, the letters drawn joined across it (Qt shapes through the ZWNJ). Read as a ZWNJ
    and kept, `wk-rtl--fa-article` 58 → 76 and `--fa-brackets` 78 → 97, but the golden held-out mean fell 86.0 →
    84.8: dropped under agreement 12, another sign is needed.
  - **wkhtmltopdf's lines run together** (`wk-rtl--fa-article`): two lines' glyphs interleaved — a layout matter.
  - A blank glyph of no advance in a renumbered font read as a ZWNJ after a letter that never joins («بر‌گ»): no lab
    file shows it (a renumbered B Nazanin Bold came back right) — a lab file first, from a real case.
    3.2's approximate reading reads a glyph with no outline and no advance the same way (`_fontApprox`): the same lab
    file would test both.
  - **Real Arabic PDFs and Arabic fonts** (the owner's request, 2026-11-18; a session of its own, 2026-11-21): check PDF import against several real
    Arabic PDFs, made with Arabic fonts by several programs — a session of its own with the owner's samples (they
    stay private: synthetic lab files for each problem found).
- **Left from 3.0** (ideas dropped under agreement 12; another sign is needed for each):
  - a bold line right under a list item, at the list's pitch, as a label (bold text), not a minor heading
    (`word-labels--labels-fa`, 88.0) — it took a real `#### Small print` for one in seven *features* files;
  - a bracket pair of Latin content belonging to the Latin run on its left («Web (Web Writing)», `word-lines--heads-fa`
    99.8) — `rtl-basic`'s reading wins when the glyphs cannot tell;
  - a bar chart drawn of rules and bars as one picture (`word-report--chart-fa`, 80.0) — it took
    `wk-github--report`'s «## Project status» and its progress bars for one;
  - smaller: a table's outer double rules come out «---» around it (`word-report--span-header-fa`); the mail's rule
    under its subtitle is lost; a page whose largest heading is an `h2` comes back `#`.

- **Right-to-left borderless tables, what is left** (2.8 fixed the tables at the text's own pitch: fuzz `none` right
  to left 45.6 → 73.6): `zebra` right to left (≈ 52) — wider tables whose cells wrap onto two or three lines
  (`fz42-chr--fa-report`) and two-column pages (`fz23`, `fz53`, `fz62`); a short page (under 20 prose gaps) is never
  measured as drawing its spaces, and its borderless table's header row breaks off as headings.
- **The stress check's margin** (CI's *lab*, `run-stress.js`: never hold the page a second at once): 836 ms on CI
  (2.7 and 2.8), against the 1,000 ms limit. What is left is one page's own layout (one call of `_layoutPage` or
  `_toHtml`) and the lines' and furniture steps: look for the step that holds the page rather than leave files out.
  Found (2026-11-17): the second CI measured with the larger lab was no step of the importer — it starts before the
  first page is read: pdf.js reads the file's structure on the main thread under `file://`, in one piece, a second
  for the 22 MB the lab's files make together. `run-stress.js` now counts the opening apart (limit 3 s) and the
  importer's steps keep their second (a breath was added after `_toHtml`). To lift the opening itself: pdf.js in a
  worker where the page's origin allows one.

- **Digits and form boxes** (moved from 2.7): Persian digits that share a glyph with Arabic-Indic ones come back
  Arabic-Indic; bordered form boxes as tables.
- **Export progress inside the builders** (from 2.7's progress item): DocxBuilder, PdfBuilder, HtmlBuilder and
  WordHtmlBuilder build in one synchronous run, so during «building the document» the step name shows but the bar
  stands still. A moving bar needs the builders to yield between parts (sections, pages; PdfBuilder's two layout
  passes with a table of contents) and report them, as the slides build does.

**High**

- PDF import, right to left: RTL fuzz files score well below English ones (RTL ≈ 77–81 against LTR ≈ 92–93; tables
  and quotes weakest, then `zwnj` — see `CHANGELOG.md` 2.7 for what is done); Chrome's
  browser-default style loses quotes and code in fa / ar while the text is right
- PDF import: wkhtmltopdf Persian, its ZWNJs and lines — «Left from 3.1» above
- Release: GitHub Pages served from the app's set (`tools/build-release.sh`) rather than from the whole repository
  (no `.nojekyll`, no cache-busting today)

**Medium**

- PDF import: put the calibrated thresholds to use (1,007 registered, none switched to calibrated yet); fonts with no
  ToUnicode at all (3.2 reads a renumbered TrueType program by its shapes; CFF and Type 3 programs not yet — CFF
  in 3.3); Persian digits that share a glyph with Arabic-Indic ones come back Arabic-Indic; bordered form boxes
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
- OCR for scanned PDFs (tesseract.js, Persian / Arabic / English), on demand — proposed for 3.4 (top of this file)

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
- Scanned PDFs: optional OCR (tesseract.js, Persian traineddata) as a separate phase — proposed for 3.4
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

- Word "Save as PDF" maps Persian ت to `"` in its ToUnicode («م"ن» for متن) — fix from the font's own cmap (3.3; lab file `word-save--teh-fa`)
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
- wkhtmltopdf with Vazirmatn: a broken ToUnicode (letters named «4», «@»; pdftotext loses them too) — done in 3.1
  (the font known by its advances and contours). Left: ZWNJ lost; runs interleaved in a line («Left from 3.1» above)
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
- Low: wide tables in DOCX, PDF and the HTML export are still squeezed to the page width (a column narrower than
  its longest word breaks it letter by letter). A fix: a landscape page, or a smaller font, for a table whose
  columns do not fit (the preview scrolls them instead, 2.6).

### Other

- Arabic texts (interface and about document) to be read by a native speaker

**Not the importer**

- Characters a document font lacks and no fallback has (Word's symbol fonts in the private-use area, U+F0xx, typed
  or pasted): a map to Unicode at the builders too (the importer maps them already)
