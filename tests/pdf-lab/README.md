# tests/pdf-lab/ — the PDF import test harness

A corpus of documents, the PDFs other programs make of them, and the scripts that import those PDFs
with `lib/PdfImporter.js` and score the result against the source. It runs headless (Node +
Playwright's Chromium, from `file://`, through `tools/pdf-lab.html`): the whole corpus in a few
seconds, so it can be run after every change. The why of the importer is in
[`lib/PDFIMPORT.md`](../../lib/PDFIMPORT.md); this file is how to use the lab.

```text
corpus/    the sources: Markdown documents and the office files (.docx, .xlsx, .csv, .pptx) — each with
           the Markdown it should come back as
pdf/       the PDFs made from them: <producer>--<doc>.pdf (144 files), in five folders by what they test:
             en/         the English corpus through every producer we run (60)
             rtl/        the right-to-left corpus through the same producers (30)
             office/     the office files — sheets, a deck, Word documents — through LibreOffice (13)
             pages/      one document a layout problem: web layouts, layers, forms, templates, pictures, a letterhead (24)
             producers/  producers we cannot run here, imitated glyph by glyph: Word, PowerPoint, Prince,
                         iText, Acrobat, Adobe PDF Library (17)
           A file's folder follows from its name (scripts/env.js: pdfGroup); generators write through
           pdfPath(name) and the runners walk every folder (labPdfs), so names stay unique across folders
           and a filter matches as before
scripts/   generators, the importer runs, the scorer, inspection tools
out/       (made when run) the imported Markdown / HTML and _scores.json
fuzz/      (made when run) style-fuzzed PDFs: dev/ and heldout/, each with its manifest.json
           (their results go to out/fuzz-dev/, out/fuzz-heldout/)
meta/      (made when run) the metamorphic net: meta/<transform>/<seed>.pdf and manifest.json
           (results in out/meta/)
baseline.json  the scores the gate compares with (scripts/gate.js --update writes it)
```

## Requirements

Node 18+, the `playwright` package (Chromium) and, for `make-docx.js`, `docx`. Installed next to the
scripts, or in the folder `NODE_TOOLS=…` names. The generators also need what they drive: LibreOffice
(`soffice`), wkhtmltopdf, pandoc, Python 3 with openpyxl and python-pptx, fontTools and the DejaVu fonts
(`make-word-rtl.py`). The importer
runs and the tools need none of those — only Node and Playwright.

`scripts/env.js` finds Kelk three folders up; `KELK=/path/to/kelk` tests another copy.

## The corpus

| Document | What it exercises |
|---|---|
| `article.md` | prose, emphasis, nested list, numbered list, quote, code block, table with right-aligned numbers, rule, link |
| `features.md` | lists in lists (bullets in numbers in bullets), a list starting at 5, nested quote, a long URL that wraps, a wide table split over pages, a task list, a level-4 heading |
| `readme.md` | a project README: code blocks, a table whose cells hold inline code, a task list, nested numbered list |
| `report.md` | two tables, one of 40 rows over three pages (repeated header or not), numbers right-aligned, a numbered list |
| `symbols.md` | emoji of every kind (single, text-default, skin tones, ZWJ families, flags, keycaps), box drawing, math signs, currencies, super/subscripts, Latin with diacritics, Vietnamese, combining marks, no-break and thin spaces |
| `monobody.md` | a document set wholly in a monospace font (a text file printed) — plain text, not code |
| `layout-*.md` | web pages with real layouts: a sidebar, two columns, a floated figure (made by `make-layouts.py`) |
| `word-tables.docx`, `word-rich.docx` | Word files: ruled and borderless tables, mixed text; header / footer, footnote, endnote, highlight, a drawn process diagram (`make-docx.js`, `add-diagram.py`) |
| `xl-*.xlsx`, `orders.csv`, `survey.csv` | sheets as people print them: no borders, black borders, white borders, long (repeated print titles), wide (printed down then over), several sheets, a sales report (`make-xlsx.py`, `make-more.py`) |
| `template.md` | a service agreement — `make-template.js` prints it in a company template (its date and reference fields first: the header template's, kept once) |
| `web-rtl.md` | a Persian web page — `make-web-rtl.js` prints it with what a site carries on every page |
| `word-rtl.md` | a Persian memo with a table — the Markdown `make-word-rtl.py` writes with its PDF |
| `slides-rtl.md` | a three-slide Persian deck: a title, two paragraphs (one drawn without space glyphs), an agenda, a link to an attached file — the Markdown `make-slides-rtl.py` writes with its PDF |
| `deck-arial.md` | a three-slide Persian deck in Arial: a title box, a justified paragraph beside a dot grid with ZWNJs drawn and not, a Latin run, a bracketed word; a slide whose only text is its framed title; a list beside the grid — the Markdown `make-deck-arial.py` writes with its PDF |
| `letter-dash.md`, `plan-fa.md` | a Persian letter (a justified paragraph with a number range broken at its dash, a copy list of dash items) and a research plan's form (a cover in a border of bands with a calligraphic title, framed field boxes, a row of options with box pictures) — the Markdown `make-plan-rtl.py` writes with their PDFs |
| `circular-fa.md` | a three-page Persian circular: a deep letterhead on every page (its number, date and time fields come back once, from page 1), justified paragraphs, articles with «مرحله N:» clauses, a diagram and its caption — the Markdown `make-itext-rtl.py` writes with its PDF |
| `cells-fa.md` | a Persian call for proposals: a ruled table whose middle column's cells hold lists (an item a line, one wrapped), bold numbered titles in the first column, a running head and foot with their border rules — the Markdown `make-cells-rtl.py` writes with its PDF |
| `booklet-fa.md` | two pages of a Persian booklet: a quote, a heading, clauses (one wrapped with a hanging indent), a line with «نیروی», a framed table — the Markdown `make-acrobat-rtl.py` writes with its PDF |
| `flyer-fa.md` | a one-page Persian flyer in an art page border: a title, bullet items, a note, a label-and-list line set larger, two centred field lines, a date drawn with spaces under its slashes — the Markdown `make-flyer-rtl.py` writes with its PDF |
| `memo-fa.md` | a three-page Persian circular on a Word letterhead: the fields, the office's name and its holder's title in the head (kept once, in reading order), an invocation in calligraphy, a numbered title over bullet items — the Markdown `make-memo-rtl.py` writes with its PDF |
| `prince-table.md` | a Persian letter with a ruled three-column table over two pages and a signature at the far side, its head's date, number and attachments labelled — the Markdown `make-prince-table.py` writes with its PDF |
| `book-front.md` | four pages of a book's front matter: a table of contents over a verso and a recto with dot leaders at three depths (chapter entries and the last one bold), two "about" pages with a portrait beside a biography's first lines, the text running on under it — the Markdown `make-book-toc.py` writes with its PDF |
| `report-fa.md` | a three-page Persian report: a cover with the title, subtitle and a bold «تهیه کننده: …» line in white on a coloured band; paragraphs with footnote and endnote marks (endnotes at the end, a footnote on the last page too), the page's last paragraph running on to the next page past the two notes at its foot; a signature at the far side — the Markdown `make-report-rtl.py` writes with its PDF (kept by hand in `corpus/`) |
| `math.md`, `fa-math.md` | formulas in a short report (English) and in Persian text: inline ones between words, display ones alone (a fraction under a root, `cases`), in list items and table cells, money that stays text («from $5 to $10») — `make-math.js` prints them with Kelk's PdfBuilder; the files are their own expected Markdown |
| `plan-box-fa.md` | a Word form's framed boxes of bold «label: value» fields, one value a sentence long wrapped over two lines (its second line under the label), then a short field — the third file of `make-plan-rtl.py` |
| `sides-fa.md` | a Persian Word report: a justified paragraph, a signer's name centred at the far side, its caption on one baseline with the next table's title at the start side (one line of glyphs, a run of spaces between), a ruled table — the Markdown `make-sides-rtl.py` writes with its PDF |
| `shapes-fa.md` | a Persian letter in a modern font as Prince prints it: two paragraphs in the regular face, two bold lines each with «توسعه‌های», no ZWNJ drawn — the Markdown `make-shapes-rtl.py` writes with its PDF |
| `fa-weights.md` | a short Persian page in Vazirmatn[wght] at 400, 700 and 800: a title, a section heading, bold words, a bold label, two paragraphs wrapping once each at `line-height: 1.8` — the Markdown `make-varfont.js` writes with its PDF |
| `letter-ltr.md` | an English letter of two pages: an office's name and three bare head values (a date with its month's name, a reference «NA/2026/0457», «2 pages») in the page header of both pages, nine paragraphs, a signature — the Markdown `make-letter-ltr.js` must give back (kept by hand in `corpus/`) |
| `deck.pptx` | a four-slide deck: title, bullets with a second level, a table, two columns (`make-more.py`) |
| `slides.md`, `slides-fa.md`, `brochure.md` | pages with pictures (`make-pictures.js`): the text of slides and of a two-page brochure |
| `form.md`, `form-fa.md` | an invoice: a header of pairs, boxed sections of «label: value» pairs under title bands, a remark wrapped over three lines with an address in it, a ruled goods table closed by a note merged over its last row (`make-form.js`) |
| `banner.md` | a news card and a cookie banner over it (`make-overlay.js`) |
| `inline.md`, `inline-fa.md` | pictures in the lines of text (`make-pictures.js`): an icon before and after a heading, a badge in a sentence, a list with picture bullets, a float, a dot grid in the margin |
| `fa-article.md`, `fa-features.md`, `fa-report.md`, `ar-article.md` | the right-to-left corpus (`make-rtl.js`): Persian prose with ZWNJ words, English terms, ASCII and Persian digits, brackets and «guillemets»; nested and numbered lists, a task list, nested quotes, code with a Persian comment, tables (one of 35 rows over pages); Arabic with ي ك ة, a few harakat and Arabic-Indic digits |

## The producers

| Prefix | Made by | Notes |
|---|---|---|
| `chrome-plain-hf` | Chromium (Skia) "Save as PDF", browser-default CSS, header and footer on | the same engine as Chrome and Edge |
| `chrome-github-bg`, `chrome-github-nobg-hf`, `chrome-blog-bg` | Chromium with a GitHub-like or a blog stylesheet, background graphics on or off | quote bars, code boxes, table shading |
| `chrome-tagged` | `chrome-github-nobg-hf` with a structure tree and an outline (`tagged`, `outline`: what desktop Chrome writes) | its Markdown must equal its untagged twin's — tagging alone must not move the importer |
| `chrome-layout`, `chrome-mono` | Chromium: the layout pages; the monospace document | |
| `chrome-float-tagged` | `infobox.md` as an encyclopedia prints from Chrome / Edge (`make-infobox.js`, tagged): a framed table floated beside a squeezed paragraph | the table and the paragraph from the structure tree |
| `chrome-form` | `make-form.js`: the invoices in Chromium, landscape, every word bold; pairs in one run or apart, an empty value, a value raised 6 pt, rules between rows; a wrapped remark; a table note in a colspan cell | pairs one per item, bands as headings, the note after the table (r9: 45 and 48) |
| `chrome-layers--banner` | `make-overlay.js`: a news card that is one link as a whole, a cookie banner over its lower part with its own heading, text, link and button | the banner keeps its own link only (the previous importer gave it the card's: `lnk` 33) |
| `chrome-layers` | `overlay.md` as a web app prints it (`make-overlay.js`): in a framed card, its text drawn twice, a paragraph under an opaque panel | the visible text only, each word once |
| `wk-github`, `wk-plain-hf` | wkhtmltopdf (Qt WebKit), its own header / footer in the second | checkboxes as drawn boxes, colour emoji with broken ToUnicode |
| `lohtml` | the HTML opened in LibreOffice Writer → PDF | quote borders per paragraph, rows far apart, asymmetric margins |
| `kelkdocx-lo` | Kelk's DocxBuilder → LibreOffice Writer → PDF | shaded quote paragraphs, Word bullets |
| `pandoc-lo` | pandoc .docx (Word default styles) → LibreOffice → PDF | headings in their own font family, booktabs-like tables |
| `lowriter` | the two Word samples → LibreOffice Writer → PDF | |
| `calc` | the sheets → LibreOffice Calc → PDF | cells that touch, print titles, wide sheets |
| `impress` | the deck → LibreOffice Impress → PDF | |
| `kelk` | Kelk's own PdfBuilder (jsPDF) | without the embedded source: the layout path; formulas from the TeX map PdfBuilder writes (`kelk--math`, `kelk--fa-math`: 61 and 64 before it, 100 now) |
| `chrome-template` | `template.md` in a company template (`make-template.js`): a side panel (name, address, a grey fill) fixed to every page, a logo (SVG) and a reference in the top margin, a footer line — Chrome's header and footer templates | the body and the date / reference fields once (round 19); the previous importer 86 (the panel came out as a quote on each page) |
| `chrome-web-rtl` | `web-rtl.md` as a Persian site prints (`make-web-rtl.js`): side tabs in turned text and a floating ad fixed to every page; sections in framed cards (a bold heading line); a price table whose rows are separated by rules drawn cell by cell, each cell two lines tall | the previous importer 67 |
| `word-print` | `make-word-rtl.py`: a PDF built glyph by glyph (also a calligraphic «بسمه تعالی» on a slope in a 2.7-em-tall font, in fake bold — every glyph drawn twice 0.32 pt apart) (fontTools, DejaVu Sans subsets) with the habits of Microsoft Word and Print to PDF in Persian — ToUnicode names base letters, Arabic yeh / kaf, logical brackets and Persian digits where the font's cmap says presentation forms, mirrored shapes and ASCII; ZWNJ lost or drawn misplaced; 1-pt text and a far-left letterhead; framed running head and foot; numbered clauses; a highlight; an RTL list with Courier «o»; kashidas stretching a justified line; an amount parted by Arabic commas; a table with a title cell and an open corner | the old importer read it at 30 |
| `pptx-rtl` | `make-slides-rtl.py`: a deck built glyph by glyph (fontTools, DejaVu Sans subsets, 16:9 pages) with PowerPoint's habits with a legacy Persian font — a ToUnicode one entry off for the space («ً»), «ً» («ا») and the final lam-alef («ل»); one paragraph with no space glyphs over one with them; a wrapped line's space drawn at its far end; an agenda centred left of a picture panel, its last item without a full stop; a link whose URI is UTF-8 bytes | the old importer read it at 37 |
| `pptx-arial` | `make-deck-arial.py`: a deck built glyph by glyph (DejaVu Sans as three subsets under one name, 16:9) with PowerPoint's habits in Arial — shapes that lie about joining back (medial as initial, a right-joining letter isolated after a joiner, tah one glyph), ZWNJs drawn as zero-width glyphs and not drawn, Arabic yeh; a Latin run in its own subset with no space glyphs, brackets named logically; a dot grid of 4- and 4.5-pt discs; a framed title alone on a slide | the old importer read it at 56 |
| `prince-letter`, `word-plan` | `make-plan-rtl.py`: a letter as Prince justifies it — a line that opens «– 1403/06/12،», dash-typed copy items — and a plan's form as Word prints it: a page border of filled bands, a title in a font named Nastaliq (spaces 0.04 em, two words drawn touching), boxes of bold «label: value» fields, ☑ in the font and ☐ as pictures wider than their box, a row's halves a run of spaces apart | the old importer read them at 95 and 47 |
| `itext-word` | `make-itext-rtl.py` (with `rtl_pdf.py`): a Word export stamped by iText — the body font's ToUnicode wrong for five presentation forms (lam, noon, yeh, heh) while its cmap is right; a letterhead at 0.87 of the page on every page; clause lines set in; a picture between a clause and the next article; a «…:» line with room left over «الف) …» | the old importer read it at 51 |
| `word-cells` | `make-cells-rtl.py` (with `rtl_pdf.py`): page-wide head and foot border rules 25 and 20 pt from their text on both pages; cells of items opened by «o» in a font named CourierNewPSMT, a gap after it, a long item wrapped under its text; «1)» bold with its bracket in the regular face | the previous importer: `---` at the pages' join, every «o» inline code, a cell's items on one line |
| `acrobat-word` | `make-acrobat-rtl.py` (with `rtl_pdf.py`, its ghost picture): PDFMaker's zero-width ZWNJ at each cell run's start, a hair inside its leftmost letter; a space glyph under the final sheen of «ورزش‌شناسی» and under the isolated yeh of «نیروی»; an empty picture under an all-zero soft mask by the quote; a double page frame, the table's right rule 8 pt past its cells near it; a clause's hanging indent | the previous importer lost the table to the page-border rule and parted the clause |
| `word-flyer` | `make-flyer-rtl.py` (with `rtl_pdf.py`): Word's art page border — 18-pt tiles round the page, each filled, outlined in four strokes, a small square in it —; a note ending a sentence at 11 pt over a line whose label is at 11 and its list at 13; two centred 13-pt field lines; a date with a space glyph under each «/» | the old importer 99.2 (the page one table cell; the owner's flyer came apart into 28 columns) |
| `word-memo` | `make-memo-rtl.py` (with `rtl_pdf.py`): Word's letterhead in the page header on every page — a table of fields (labels in a font named Nastaliq, values a cell apart), the office's name under a logo picture with a ZWNJ typed in it, its holder's title in three lines down the right; the last page's priority value drawn with a ZWNJ; the invocation's words touching; «2. …:» in bold over bullet items set in | the old importer read it at 82.8 |
| `prince-letter` (table) | `make-prince-table.py`: Prince's simple TrueType subsets (one-byte codes, the font's glyph order, base letters in the ToUnicode, no ZWNJ drawn) in a regular and a bold face; cell borders as inset / outset L-bands; justified cells set tighter than their size; the table's last row on page 2; a signature centred at the left, its bold heh three codes only; the letterhead one picture behind each page, the head's values over it on both pages (round 19) | the old importer read it at 56 (round 18's at 94); its number wrapped under itself (round 20) |
| `pdflib-book` | `make-book-toc.py`: Adobe PDF Library's habits in a typeset book — the contents over two pages (the verso filled to its foot, its last entry and the recto's first each a line), their dot leaders in the body font with the period mapped to U+FFFD and an `/ActualText` U+0008 over each leader, one entry in a bold face used for it alone; running head and folios as `/Artifact /Pagination`; rectos with mirrored margins (the measure 18 pt right of the contents page's); a picture at the margin beside a biography's first lines, justified text running on under it | the leaders as dots, an entry a line; the biographies one paragraph each, no quote |
| `word-report`, `word365-report` | `make-report-rtl.py` (with `rtl_pdf.py`): Word's report habits — a cover band with a bold white line a size over the body under the title; footnote marks small and raised after a word, the notes at the page's foot under a short rule at the start side, set at 9 pt and opened by their marks, one mark drawn as a small picture (at one place on two pages); endnotes on the last page under their rule, raised roman marks «i», «ii»; a bracketed Persian phrase, its brackets named logically; the twin `word365-report` the same file with its dictionaries in object streams (qpdf), as Word for Microsoft 365 writes; the page's last paragraph cut by the page break, its last line full; a signature bold and a size up at the far side | the cover's line no heading; the notes after the paragraph they would have cut, that paragraph whole |
| `word-plan` (box) | `make-plan-rtl.py`: a frame of bold fields as Word prints it, one value wrapped under its label | the previous importer read the frame as a quote (75) |
| `word-sides` | `make-sides-rtl.py` (with `rtl_pdf.py`): a signature's caption at the far side and the next table's title at the start side, one baseline, one line of glyphs with spaces across the gap; the signer's name over the caption | the previous importer put the title between the name and its caption (96.7 order) |
| `prince-shapes` | `make-shapes-rtl.py`: Prince's simple TrueType subsets (one-byte codes, base letters in the ToUnicode, no ZWNJ drawn) of a font whose codes keep no order of forms (shuffled, no glyph names — a modern font, its forms from GSUB); the regular face used enough to learn by use, the bold face for two lines only | the previous importer read «توسعههای» (98.5) |
| `chrome-rtl-varfont` | `make-varfont.js`: Chromium with Vazirmatn[wght] from `assets/fonts`: Skia's Type 3 fonts, one subset tag per instance, every one named `Vazirmatn-Regular` | the previous importer read no bold, no headings below the title (91.7) |
| `chrome-rtl-plain-hf`, `chrome-rtl-github-bg`, `chrome-rtl-tagged` | the right-to-left corpus through Chromium: browser-default CSS in Vazirmatn with header and footer; a GitHub-like sheet mirrored for RTL with backgrounds; the same in Sahel, tagged (`make-rtl.js`) | |
| `wk-rtl`, `lohtml-rtl` | the same through wkhtmltopdf, and the HTML opened in LibreOffice Writer (installed Vazirmatn) | wkhtmltopdf's Persian fonts carry a broken ToUnicode (pdftotext loses letters too) |
| `kelk`, `kelkdocx-lo` (fa-, ar-) | the right-to-left documents through Kelk's PdfBuilder, and Kelk's DocxBuilder → LibreOffice | |
| `chrome-pictures--inline*`, `wk-pictures--inline` | `make-pictures.js`: the inline pages in Chromium (English, Persian) and wkhtmltopdf | text wins: no Markdown line holds a picture and words (`mix`); the r7 importer split the paragraph at the badge and lost the list |
| `chrome-pictures`, `wk-pictures` | `make-pictures.js`: slides (English and Persian: a raster background, a title over a raster panel, an icon and a dot grid beside a paragraph, a photo with its caption beside a list, decorative pills) and a brochure (a logo, a cover band with text over it, a chart with its caption) — every picture a raster drawn on a canvas | the text must stay text: before the picture rules 4.7–14 % of it lay under cropped figures (`pic`) |
| `chrome-positioned` | `make-positioned.js`: a Persian letter whose long paragraphs have their words placed by gaps (0.22 em, no space glyph: spans with `<wbr>`) while the page's other lines draw their spaces — as Prince and InDesign set justified lines | the previous importer glued those lines (38) |
| `chrome-headtable` | `make-headtable.js`: the report (English and Persian) under a running head made as a two-cell bordered table in the top margin, its long table over pages with its header row repeated | the head goes, the table stays one (the previous importer 88: the head read as table rows) |
| `chrome-letterhead` | `make-letter-ltr.js`: an English letter whose head (Chromium's header template) repeats on both pages with bare values, their labels the paper's | the head once, first, its values labelled «Date», «No.», «Attachments» |
| `chrome-card--receipt`, `lowriter--merged` | `make-tables-rtl.js`: a Persian web receipt (a framed card, rules between rows and between label and value, an amount with ٬ separators); a Word table (docx) through LibreOffice with a merged title row and a paragraph merged over three columns (its last row: since round 11 a closing note, given back after the table), every cell with its own borders | the previous importer 70.8 and 73.4 (no table found; merged cells sliced) |
| `chrome-fa-links` | `make-links.js`: a Persian article's back matter as a Firefox print of a Persian encyclopedia page has it — contents with dot leaders (bold, a line apart), a Persian reference and Latin ones in one numbered list (numbers on both sides), links wrapped mid-address, a link underline drawn long and clipped to the link, Latin items of a right-to-left list with «▪» at their right end, a page number in a circle halfway down the margin and a rule down it |
| `ocr-tesseract` | `make-ocr.js`: `chrome-plain-hf--article`, `--features`, `--report` printed to images (`pdftoppm -r 200 -gray`), then `tesseract … pdf` | an OCR layer over a scan: one font, no bold, sizes from letter heights, bullets misread. The rules were written on the article (62 → 91); features and report check them (62 → 92, 84 → 92) |

Not in the lab (no program here to make them): Microsoft Word "Save as PDF", Microsoft Print to PDF,
Excel's own export, Prince / WeasyPrint, InDesign — Word's and Print to PDF's habits in Persian are
imitated by `word-print` (above), from what the user's real files showed. Real files of those kinds were tested by hand; add
them to `pdf/` with a `--<doc>` suffix to score them, or to any folder for `run-real.js`.

## Running it

```sh
node scripts/run-import.js [filter]   # import pdf/*/*.pdf, score against corpus/<doc>.md, write out/
node scripts/roundtrip.js             # Kelk's own round trip: tests/builder-suite.html, md → PDF → md
node scripts/math-roundtrip.js        # formulas through Kelk and back: every case of tests/math-cases.js, en and fa (76 checks)
DIR=folder node scripts/run-real.js   # any PDFs: words found (recall) and their order, against pdftotext
node scripts/run-crash.js folder      # stability: every PDF of a folder; errors, timeouts, slow files
node scripts/run-stress.js big.pdf small.pdf   # a long file (thread held < 1 s), injected faults, an abort
node scripts/cmp.js A B dir…             # two versions of the importer (a Kelk folder or its lib/PdfImporter.js): what changed
node scripts/snapshot.js pdfs/ snap/ [--against older/]   # a regression set of real (private) PDFs: Markdown + signals, compared
node scripts/writeout.js                 # the import settings that write the text out (digits, ٬ ٫ ٪ ،, ي/ك): checks of _writeOut
node scripts/make-meta.js && node scripts/run-meta.js     # the metamorphic net
node scripts/features.js [folder…]        # the coverage matrix, and the cells other files add
```

A file `<producer>--<doc>.pdf` is scored against `corpus/<doc>.md`. The scores (`scripts/score.js`):

| Column | Meaning |
|---|---|
| `words` | recall: the share of the source's words found (NFC, punctuation and Markdown marks ignored) |
| `order` | the longest common subsequence of the words, over the source's words |
| `head` | headings, with their level (F1) |
| `list` | list items, with ordered / bullet, task / checked and depth (F1) |
| `tabl` | table cells by row and column (F1), times the ratio of table counts (one table cut in two scores less) |
| `code` | code block lines (F1) |
| `quote` | quotes, nested markers included (F1) |
| `total` | the mean of the columns that apply (`-` = the document has none of it) |
| `pic` | the share of the file's text lying under a figure the importer cropped (`r.quality`); a drawing's own labels count (the process diagram of `word-rich`: 3.5). Outside the total; the gate fails when it rises |
| `lnk` | links, outside the total: each `[words](address)` of the source (a bare address counts as a link to itself) found as such, F1. The gate fails a file whose links drop |
| `mix`, `figs` | the Markdown lines that hold a picture and words (text wins over pictures: should be 0; the gate fails when it rises), and the pictures in the file. The run keeps the pictures as short names (`![](img-<page>-<n>)` in `out/`) and takes them out before scoring |
| `rtl` | right-to-left documents only, outside the total: of the source's words with a ZWNJ, a yeh or kaf, a digit, the share found exactly as written, and of its bracketed spans the share found the right way round — the mean of the four (`zwnj`, `yehKaf`, `digits`, `brackets` in `_scores.json`). The gate holds it per file as it holds the total |

Where the scores stood at the end of the English round (October 2026): Chrome / Edge, Calc, Kelk and
LibreOffice from .docx 99–100; wkhtmltopdf 99.2 (its colour emoji are lost in the PDF itself);
LibreOffice from HTML 97.7 (it drops checkboxes and turns a nested numbered list into bullets);
pandoc 96.8 (it flattens nested quotes into the .docx); Impress 97.6. What is left below 100 is, case
by case, written down in `lib/PDFIMPORT.md` §9.

The right-to-left corpus at its first run (October 2026): Kelk 85–100 (rtl 99–100), Chrome 67–100 (rtl
98–100; styled pages 83–100, the browser-default style loses tables and quotes), LibreOffice from
.docx 40–89 and from HTML 51–69 (rtl about 70: word spaces read as ZWNJ, brackets mirrored), wkhtmltopdf
47–69 (its fonts' ToUnicode is broken). These are the next rounds' work (TODO).

## Style fuzzing: dev and held-out

The corpus scores say how well the importer reads *these* PDFs — the ones its rules were written on.
They say little about the next PDF: in October 2026 the corpus stood at 99–100 while the same
documents through the same Chromium, in styles nobody had tuned on, scored in the low 80s. The fuzz
sets measure that gap.

```sh
node scripts/make-fuzz.js dev        # 100 PDFs: fuzz/dev/      (seeds 1–100)
node scripts/make-fuzz.js heldout    # 100 PDFs: fuzz/heldout/  (seeds 100001–100100)
node scripts/run-fuzz.js dev         # mean, scores per style value, weakest files, what moved
node scripts/run-fuzz.js heldout     # mean and scores per style value only
```

Each sample is one corpus document (round robin, so every document is equally present) printed in a
style drawn from a seeded generator: producer (Chromium 3 : wkhtmltopdf 1), body font (8 families),
size (9–13 pt), leading, paper (A4, Letter, A5), margins, left or justified, one or two columns,
heading scale and family, spaced or indented paragraphs, five quote styles, five code-block styles,
code font, inline-code chips, five table styles, list indent, Chrome's header / footer, headings in
capitals or not, tagged or not (a structure tree, an outline and `/Lang`). In two columns, tables and code
are set smaller and break only words that cannot fit, as a real two-column document's do. The style of every file is in
`manifest.json`, with its `env`: the generator's version (`GENERATOR` in `make-fuzz.js` — raise it when
a dimension or a style changes, since every seed then draws another PDF), the Chromium and wkhtmltopdf
versions and the font files. A new dimension is drawn last, so the earlier ones keep their values per
seed. The PDFs are not shipped — 20 seconds make them again.

**The rule of the two splits.** `dev` is for work: open its files, read its Markdown, write rules from
what you see. `heldout` is for judgement: only its means and its per-value table are read
(`run-fuzz.js heldout` hides file names; `--show` prints them). A rule written after looking at a
held-out file has turned that split into a second dev set, and nothing measures generalisation any more
— then draw a new held-out split with other seeds. A change is good when dev improves **and**
held-out does not drop.

**Reading the table.** Per dimension, the weakest value comes first: that is where to look next (in
`dev`). A metric of 0 where the source has none of the thing (`quote` 0 for `symbols`) is a false
positive — the importer made a quote that is not there. Each run is compared with the previous one of
the same split (`out/fuzz-<split>/_scores.prev.json`). The fuzz sets are scored **case-folded**
(`score(src, got, { fold: true })`): a style may set headings in capitals (`headCase: upper`), which no
PDF can undo; the corpus is scored as it is.

Where it stood at the start (October 2026, 100 + 100 PDFs): dev 83.5, held-out 87.2 (the corpus:
99–100). Generator 2 (headings in capitals, tagged files) with the right-to-left fix below: dev 83.7,
held-out 87.4; with headings from the structure tree 84.0 / 87.4; with code beside a bar read as code
88.3 / 90.0. Generator 3 (two-column content fits its column: a table wider than the column had been
cut at the page edge, its last column never drawn — a loss in the PDF, not the importer's): 89.3 / 89.9;
with zebra rows as fences and row bounds 89.9 / 90.3; with tables joined across columns and the body
size from running text 90.4 / 90.8; with tagged tables from the structure tree 90.6 / 90.7. Weak in both splits alike: two columns (total about 62; tables 8–29), code blocks drawn with a
side bar (74–78: taken for quotes), quotes in general (52–60, false quotes included). Before round 24: 91.1 / 91.8.
Round 24 (the weak columns — lists, tables, quotes): dashed borders as rules, typed bullets of a wrapped sentence,
shallow indents and nested quotes without a gap, italic quotes plain, justified lines no table, a header row
closer than a column's gap, wrapped rows with centred cells: dev 96.0 (lists 85.3 → 97.0, tables 84.3 → 88.8,
quotes 82.9 → 89.7, code 85.1 → 95.7), held-out 94.6 (every column up or equal); the corpus unchanged, file by
file. Still weak in both: two columns (held-out 78: tables 53, lists 69) and A5 paper — tables that cross a page
or a column break inside a wrapped row.

**A paired test.** `--tagged=all` / `--tagged=none` force one value of `tagged` on every Chromium file:
the same styles with and without a structure tree, in folders of their own (such a set is no dev or
held-out split):

```sh
LAB_FUZZ=/tmp/p/none node scripts/make-fuzz.js dev --tagged=none && LAB_FUZZ=/tmp/p/none LAB_OUT=/tmp/p/out-none node scripts/run-fuzz.js dev
LAB_FUZZ=/tmp/p/all  node scripts/make-fuzz.js dev --tagged=all  && LAB_FUZZ=/tmp/p/all  LAB_OUT=/tmp/p/out-all  node scripts/run-fuzz.js dev
for f in /tmp/p/out-none/fuzz-dev/*.md; do cmp -s "$f" /tmp/p/out-all/fuzz-dev/$(basename "$f") || echo "$f"; done
```

The first run of it (October 2026) found 7 of 100 files read differently. Six were one bug: with no
`/Lang` (untagged Chrome writes none, tagged Chrome writes `en`) a table in the right column of a
two-column page was taken for right-to-left — its columns reversed, "2026-10-01" read "-2026 10-01" — in
an English document. Fixed (PDFIMPORT.md §6); one file is left: flags and keycaps drawn through the emoji
font's supplementary private-use codes, which only the tagged file's `/ActualText` names (TODO).

## Metamorphic testing: `make-meta.js`, `run-meta.js`

The corpus and the fuzz sets ask "is this PDF read right?". The metamorphic net asks "does the reading
survive a change that should not matter?" — and needs no new document for it. Fifteen seeds (one or two lab
PDFs of every producer family, Persian ones included) are rewritten by twelve transforms (`pdf-lib` for the
page level, qpdf's QDF form for the operators):

| Transform | Kind | What changes |
|---|---|---|
| `scale80`, `scale125` | same | content at 80 % on the same paper (a "fit to page" print); page and content at 125 % |
| `rotate90` | same | `/Rotate 90` |
| `objstm` | same | object streams and recompression (qpdf, as post-processors do) |
| `untag` | same | structure tree and MarkInfo removed (tagged seeds only) |
| `color`, `pagebg`, `band` | near | dark fills turned dark blue; a light fill under the page; a coloured band behind its top third |
| `tz85`, `trackTight`, `trackLoose` | near | type condensed to 85 % (`Tz`); letters 0.04 em closer, 0.08 em apart (`Tc`) |
| `noToUnicode` | hard | every ToUnicode map removed: the repairs must read the fonts |

```sh
node scripts/make-meta.js     # 171 PDFs in meta/, seconds (pdf-lib, qpdf with fix-qdf)
node scripts/run-meta.js      # per transform: files read exactly as their seed, mean total, Δ from the seeds, the worst
```

"same" transforms should give back the seed's Markdown byte for byte, "near" ones nearly, "hard" ones are
measured only. Where it stood at its first run (October 2026, seeds 99.8): rotate, untag and colour fully
invariant; scale80 −1.0, scale125 −0.3; objstm −4.6 (`/ActualText` inside object streams is not read: the
Persian Word file −55); pagebg −3.4, band −2.6 (a deck −35); **tz85 −13.5, trackTight −5.7, trackLoose −16.2**
(set where each run stands, these three open gaps no real producer leaves for the producers that place every
run by its own position — LibreOffice, pandoc —; their losses are largely the transform's: kept as regression
guards, to be replaced by a tracking dimension in the fuzz generator, TODO); noToUnicode 14.7. The gate holds each
transform's mean (−1 point; −3 for `noToUnicode`); CI makes the PDFs once and runs both importers on them.

## Coverage: `features.js`

`r.features` (PDFIMPORT.md §2c) describes how a PDF is drawn as axis=value cells — fonts, ToUnicode, Arabic
forms or letters, spaces drawn or as gaps, condensed or tracked type, text over pictures or in forms, fills,
rules, pictures, transparency, tags, paper. `features.js` counts the lab's PDFs (and the metamorphic ones)
per cell; given other folders, it prints each file's cells that no lab PDF has, and the thin ones (one or two
files). A real file that reads poorly usually sits in such a cell: that names the lab PDF to make next.

```sh
node scripts/features.js                    # the matrix
node scripts/features.js ~/private-pdfs     # … and each private file's new and thin cells (names printed, never written)
node scripts/features.js --json file.pdf    # one file's whole r.features
```

## Structure trees: `struct.js`

`node scripts/struct.js [dir|file …] [--tree N]` audits the structure trees as pdf.js gives them to the
importer: the roles, the headings and their levels, **cover** (the share of the text inside marked
content the tree points to), **sem** (the share whose nearest tagged ancestor is a heading, a list, a
table, code, a quote, a caption … — not P, Span or Div) and **art** (text marked `/Artifact`). Where the
lab's producers stood (October 2026):

| Producer | Tagged | cover | sem | What the tree holds |
|---|---|---|---|---|
| Chromium, `tagged: true` | yes | 93 | 47 | H1–H4 with levels, L / LI, Table / TR / TH / TD, Link; **no** BlockQuote or Code (Div) |
| LibreOffice Writer (from .docx, pandoc, HTML) | yes | 100 | 50–58 | headings with levels, lists with Lbl / LBody, tables, Figure, Link, Note; from HTML also **BlockQuote and Code** |
| LibreOffice Impress | yes | 100 | 93 | H (no level), lists, tables |
| LibreOffice Calc | yes | 1 | 0 | one empty root: tagged, and no help at all |
| headless Chromium (default), wkhtmltopdf, jsPDF / Kelk | no | – | – | |

A tree is worth what it covers and what it says: Calc's is complete in name only. The importer measures
the same (`r.profile.tagged.trust`, PDFIMPORT.md §2b), and `profile.js` checks it: trust as expected per
producer, and the trees' headings against the source's (Chrome tagged 100, LibreOffice 93–100, the tagged
fuzz files of dev 99.5 — the importer's own headings on those: 93.3). That is the trust
weight of the next step (TODO: the structure tree as a prior).

## The gate

`scripts/gate.js` reads the results of the runs (it runs nothing) and fails — exit code 1 — when a
change made the importer worse:

| What | Fails when |
|---|---|
| corpus | a file crashes, or its total drops more than 0.5 point, or its right-to-left details (`rtl`) drop more than 0.5 point, or it is no longer scored (its `corpus/<doc>.md` missing or renamed) |
| fuzz `dev`, `heldout` | a PDF crashes, or the split's **mean** total drops more than 1 point |
| inline markup (`mkup`) | bold, italic, strike or inline code the importer wrote in HTML that a CommonMark parser no longer finds in its Markdown (`markup.js`: «بود**.**» stays literal asterisks) — any rise, on a corpus file or summed over a fuzz split; it should stay 0 |

A metric that drops while the total holds (headings −3, tables +3) is printed as a note, not failed.
The fuzz splits are gated on their means only: per file would read held-out files one by one, and the
groups per style value are too small (fewer than 15 files in most) to tell a change from noise.

```sh
node scripts/run-import.js && node scripts/run-fuzz.js dev && node scripts/run-fuzz.js heldout && node scripts/run-meta.js
node scripts/gate.js                       # against baseline.json
node scripts/gate.js --update              # this run becomes the baseline (refused if the gate fails)
node scripts/gate.js --update --partial    # a filtered run: its files merged into the baseline, the others kept
node scripts/gate.js --baseline cand.json  # read (and with --update write) cand.json instead of baseline.json
```

**What `--update` refuses.** A run that lacks lab PDFs (every PDF under `pdf/`, compared by name): a
filtered `run-import.js math` written as the whole baseline would leave every other file ungated. The
gate prints how many files the run holds against the lab and the first missing names; run
`run-import.js` without a filter, or add `--partial` to merge only this run's files into an existing baseline
(`--partial` with no baseline to merge into is refused). `--update` with
`--against` is refused too (the comparison would be with another run, not with the baseline being
written). A fuzz split or the meta part this run lacks (no wkhtmltopdf or qpdf on the machine) is kept
from the old baseline, and the gate says which. A corpus file scored in the baseline that is no longer
scored (no crash) fails: its source Markdown is gone, so nothing gates it any more.

**Two ways to compare.** Against `baseline.json` (local work): the corpus PDFs are files, so their
scores hold anywhere; the fuzz PDFs are drawn by the local Chromium and fonts, so their stored means are
compared only when the manifest's `env` (Chromium, wkhtmltopdf, the font files) matches the
baseline's — otherwise the gate says so and skips them. Against another run (`--against DIR`): two
importers on the very same PDFs, which needs no such care. `LAB_OUT=…` sends a run's results to
another folder and `KELK=…` picks the importer, so

```sh
KELK=/path/to/old-kelk LAB_OUT=/tmp/old node scripts/run-import.js   # (and run-fuzz.js dev / heldout)
node scripts/gate.js --against /tmp/old
```

is the old version and the new one on the same files. That is what CI does
(`.github/workflows/pdf-lab.yml`): on every push or pull request that touches the importer, pdf.js or
the lab, the commit before and this one, on fuzz PDFs drawn once on the runner. Raise the baseline
(`--update`) when a change is good — dev up, held-out not down — so the next change is held to it.

`tests/pdf-import-corpus.js` keeps its fixed floors for the browser suite (`tests/pdf-import-suite.html`, PDFs
you pick); the lab's gate is the baseline instead — it rises with the scores, the floors do not.

## Private real files: `snapshot.js`

Real PDFs a user sends are kept out of the repository — the files, and their names too. They still make
the best regression set, so `snapshot.js` keeps one outside it: every PDF of a folder (subfolders too) is
imported, its Markdown written (pictures shortened to a hash), and a few signals measured with no source to
score against — pdftotext's words found and their order, **glued** (Arabic-script words of 12 letters or more
per thousand words, beside pdftotext's own figure: lost spaces show here), pictures, U+FFFD, and the counts of
headings, list items, tables, cells, code blocks and quotes. With `--against` an earlier snapshot, each file is
`same` or shows its changed lines and the signals that moved:

```sh
node scripts/snapshot.js ~/private-pdfs ~/snap/before            # once, before a change
node scripts/snapshot.js ~/private-pdfs ~/snap/after --against ~/snap/before
```

Each problem such a file shows is then rebuilt as a lab PDF of our own (`make-*.js`, like `word-print`),
so that it is tested in public from then on.

## Inspection tools

When a score drops, look at what the importer saw, layer by layer:

| Script | Shows |
|---|---|
| `dump.js file.pdf page [from] [n]` | the raw glyphs of a page: character, code point, x, y, width, size, font, space, unmapped |
| `words.js file.pdf page yTop yBottom` | per baseline, the runs of glyphs (split at gaps over ¼ em), monospace marked, drawn spaces counted |
| `shapes.js file.pdf page yFrom yTo` | small marks (bullets, checkboxes and their ticks), images, vector parts, rectangles with colours |
| `lines.js file.pdf yMin yMax` | the lines (segments) handed to the layout: page, y, x-range, size, bold share, `cell` flag, marker, monospace share |
| `kelk-app.js import|pdf|trip …` | Kelk itself, headless (index.html): a PDF imported as the app imports it, Markdown exported to PDF as the app exports it (its settings, fonts loaded on demand), or both — the owner's round trip end to end |
| `md.js <kelk folder or lib/PdfImporter.js> file.pdf` | the Markdown of one file with a given version of the importer (its core and `lib/pdfimport/` parts); `IMAGES=1` keeps the pictures (shortened) to show where they land |
| `dbg.js file.pdf "<js>"` | runs JavaScript in the page after the import (`r` is the result) |

To see inside a step, copy the importer (`lib/PdfImporter.js` and `lib/pdfimport/`, the folder layout kept),
put a `console.log` in the part of the layer you are looking at, and load the copy — `md.js` and `cmp.js` take
the copied `PdfImporter.js` (or the folder above its `lib/`) and add the core and its parts after
`tools/pdf-lab.html` (`env.js`'s `importerFiles`). Rendering a strip
of a page (`pdftoppm -f N -l N -r 200 -x … -y … -W … -H … -png`) settles what the PDF really shows.

## Regenerating the PDFs

The PDFs are ordinary git files marked `binary` (no LFS; decision of 1405-08-10, `docs/reports/P0.1-git-hygiene.md`).
Every regeneration writes a whole new binary (creation dates and IDs are not pinned), and the old one stays in history
for good — so commit a regenerated PDF only when its content changed, and pin timestamps where a producer allows it.

```sh
python3 scripts/make-xlsx.py && python3 scripts/make-more.py && python3 scripts/make-layouts.py
node scripts/make-docx.js && python3 scripts/add-diagram.py
node scripts/make-chrome.js           # chrome-*
node scripts/make-overlay.js && node scripts/make-infobox.js   # chrome-layers, chrome-float-tagged
python3 scripts/make-word-rtl.py      # word-print (and corpus/word-rtl.md)
python3 scripts/make-slides-rtl.py    # pptx-rtl (and corpus/slides-rtl.md)
python3 scripts/make-deck-arial.py    # pptx-arial (and corpus/deck-arial.md)
python3 scripts/make-plan-rtl.py      # prince-letter, word-plan ×2 (and corpus/letter-dash.md, plan-fa.md, plan-box-fa.md)
python3 scripts/make-sides-rtl.py     # word-sides--sides-fa (and corpus/sides-fa.md)
python3 scripts/make-shapes-rtl.py    # prince-shapes--shapes-fa (and corpus/shapes-fa.md)
python3 scripts/make-itext-rtl.py     # itext-word (and corpus/circular-fa.md)
python3 scripts/make-prince-table.py  # prince-letter--prince-table (and corpus/prince-table.md)
python3 scripts/make-memo-rtl.py      # word-memo--memo-fa (and corpus/memo-fa.md)
python3 scripts/make-flyer-rtl.py     # word-flyer--flyer-fa (and corpus/flyer-fa.md)
python3 scripts/make-acrobat-rtl.py   # acrobat-word--booklet-fa (and corpus/booklet-fa.md)
python3 scripts/make-cells-rtl.py     # word-cells--cells-fa (and corpus/cells-fa.md)
python3 scripts/make-book-toc.py      # pdflib-book--book-front (corpus/book-front.md is kept by hand)
python3 scripts/make-report-rtl.py    # word-report--report-fa and word365-report--report-fa (qpdf; corpus/report-fa.md is kept by hand)
node scripts/make-letter-ltr.js        # chrome-letterhead--letter-ltr (corpus/letter-ltr.md is kept by hand)
node scripts/make-varfont.js          # chrome-rtl-varfont--fa-weights (and corpus/fa-weights.md)
node scripts/make-math.js             # kelk--math, kelk--fa-math (from corpus/math.md, fa-math.md)
node scripts/make-template.js         # chrome-template
node scripts/make-web-rtl.js          # chrome-web-rtl
node scripts/make-others.js           # wk-*, kelk, kelkdocx-lo, pandoc-lo, lohtml
node scripts/make-pictures.js         # chrome-pictures--*, wk-pictures--brochure
node scripts/make-positioned.js && node scripts/make-headtable.js   # chrome-positioned, chrome-headtable--*
node scripts/make-tables-rtl.js       # chrome-card--receipt, lowriter--merged
node scripts/make-links.js            # chrome-fa-links--fa-links
node scripts/make-rtl.js              # the right-to-left corpus: chrome-rtl-*, wk-rtl, lohtml-rtl, kelk / kelkdocx-lo of fa-*, ar-*
                                      # (first: unzip assets/fonts/download/vazirmatn-sahel-ttf.zip into ~/.fonts)
# lowriter, calc, impress: LibreOffice straight from the office files, then renamed <prefix>--<doc>.pdf
soffice --headless --convert-to pdf --outdir /tmp/lo corpus/word-*.docx corpus/xl-*.xlsx corpus/*.csv corpus/deck.pptx
```

The PDFs in `pdf/` are kept so the lab runs without those programs; a new version of a producer can
change them (keep the old ones to compare).
