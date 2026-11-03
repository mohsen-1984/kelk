# Changelog

All notable changes to Kelk. Dates are those of the release tags.

## [Unreleased]

## [2.0] — 2026-11-03

The third release. Kelk reads **PDF** — a PDF becomes Markdown again — and writes a fifth output, **PowerPoint**:
the Markdown on screen becomes an editable .pptx deck. Both in the browser, offline. The libraries in `lib/` are
2.0; the new `PdfImporter` and `PptxBuilder` are 1.0 (the slide convention: `lib/SLIDES.md`).

PDF import, where it stands: a lab of 188 PDFs — 144 from our generators (96.2 on average), 44 from Word, Excel,
PowerPoint, Microsoft Print to PDF, Edge, Chrome and Firefox on Windows — reads at 95.6 on the 171 open files (84.5 on
the 17 held out);
style-fuzzed PDFs in English, Persian and Arabic at 86.8 (held out 88.0), right-to-left ones the weaker side. Also
weak: Persian PDFs from wkhtmltopdf and LibreOffice's HTML import, borderless two-column tables, turned text,
formulas from other programs; a scan needs an OCR layer. How it
works and its limits: `lib/PDFIMPORT.md`.

### Added — slides (PowerPoint)

- **Document | Slides** above the preview shows the same text as slides, with each slide's layout and
  warnings and its speaker notes. **PPTX** sits in the export bar (Ctrl+Alt+Enter); **Present** (F5)
  shows the slides full screen.
- **The convention:** the first `#` is the title slide, later `#`s are numbered section slides and the
  last one is the closing slide. Every `##` is a slide, a `<!-- … -->` comment holds its speaker notes,
  `> [!NOTE]` and the other GitHub alerts are callouts, and front matter sets the title, footer,
  direction, theme and size.
- **Layouts from the content:** cards, steps, stats, statement, quote, columns, a picture beside a list,
  and an agenda made from the sections. `<!-- layout: … -->` chooses one by name, and **timelines** are
  horizontal or vertical, with one date highlighted.
- **Diagrams as PowerPoint shapes:** process (chevrons), cycle, pyramid, funnel, hierarchy (from a
  nested list), matrix and Venn. All of them stay editable.
- **Native charts from tables:** `<!-- chart: column -->` before a table makes a column, bar, line,
  area, pie, doughnut or radar chart (stacked, percent, labels). Edit Data opens the chart's sheet.
- **Icons:** any Lucide name (`:rocket:`) or an emoji before an item's label.
- **Right to left:** the slides are mirrored and each paragraph takes its direction from BidiCore.
  Persian and Arabic text and English text each get their own font and language. Table columns and
  chart categories start on the right.
- **Text that fits:** text is measured and shrunk down to 70%. A long list or table continues on the
  next slide, and the preview marks any text that still overflows.
- Titles go into real title placeholders, so the outline view and accessibility tools work. Code stays
  colored and editable under its language label (as in Word and PDF), and pictures keep their size.
- **Formulas are PowerPoint's own equations** (OMML), display and inline, editable in PowerPoint's
  equation editor as in the Word output. Programs that do not read them show the formula's picture.
- **Sections:** each `#` also starts a PowerPoint section, so the slide sorter groups the slides.
- **The deck's identity:** `logo:` puts a logo on the title, section and closing slides and at the end of
  every title row, like a letterhead; without one, the document's logo (Header and footer) is used.
  `tagline:` adds a brand line to the title and closing slides, `classification:` a badge («Internal»,
  «محرمانه») on every slide, `contact:` a line on the closing slide. Settings → Slides: logo on every slide,
  the cover only, or none.
- **Bullets and title marks:** the list bullet (• ○ ▪ ❖ ➢ ✓ ❑ –) and the mark beside titles (steps, bar,
  none — each theme has its own) are settings, or `bullet:` and `decoration:` in the front matter.
- **A deck's front matter is its default, and Settings override it:** a `theme:` (or colors, bullet, title
  mark, aspect, footer) written into the deck shows in Settings → Slides as the deck's value; picking
  another one there changes this deck at once, for this document only — the settings kept for other decks
  stay as they were. A note under the theme lists what the deck brings and what was changed, with a link
  back to the deck's own values; another document starts from its own front matter again.
- A `statement` directive on a slide with a chart no longer drops the chart: the layout follows the
  content, with a warning.
- **Title slide:** a picture under the first `#` (an SVG logo too) stands over the title, and
  `presenter:` in the front matter adds “Presenter: …” in the deck's language.
- **Ten themes** with general names: Modern Emerald, Scholarly Blue, Corporate Blue, Tech Dark (dark
  slides), Tech Warm, Minimal Mono, Ocean Teal, Sunset Coral, Forest Green and Royal Purple. Text on every
  fill is white or black according to the fill's luminance.
- **Right to left in PowerPoint:** each run is split by script, decided over the whole paragraph. Spaces,
  «», brackets and dashes take the side they belong to (`(ML)`, `فارسی — English`, `فارسی - 2024`), and
  digits stay Latin. Every run states its direction (`a:rtl`) and every paragraph keeps one set of
  paragraph properties. Speaker notes are right to left, line by line, in the deck's fonts; the theme's
  complex-script font is the bidi font, so charts are no longer drawn in Times New Roman. A list mixing
  Persian and English items keeps the deck's direction.
- **Settings → Slides** comes after the Word group. Its heading stands out in the Slides view, and a note
  says which other settings reach the slides. It sets the theme, two colors, light or dark title slides,
  16:9 or 4:3, text size, timeline direction, footer, slide and section numbers, PowerPoint sections, speaker notes,
  automatic layouts, and long slides split. A button copies the convention as a prompt for AI models,
  with its rules for nesting.
- **A light preview:** the first two slides are drawn at once and the rest as they scroll into view. In
  the Slides view the hidden document is drawn only when an export needs it. Pictures and icons are
  read once.
- **Slides sample:** “AI literacy” (generative, general-purpose AI) in fa, en and ar, 33 slides that use
  every layout, both charts, every diagram, Lucide icons and emoji, an SVG logo and a presenter, code,
  display and inline formulas, a quote, callouts and speaker notes. It opens with the sample button in the Slides view. A sample written for the other
  view is swapped when the view changes, with a toast; Undo brings the text back.
- **Word fonts in PowerPoint:** the Word fonts set in Settings (complex scripts and Latin) are the deck's
  fonts too — they were read from the wrong place and the deck stayed in Vazirmatn. The slides preview
  redraws when they change.
- **File names:** the exports take the name of the file on screen — an imported file or the sample
  (`slides-sample.fa.pptx`), also after a reload of a text an older version stored.

### Added — PDF import

- **Import a .pdf** like a .docx or .html: drop it on the Markdown panel or pick it with Import.
- **Text and direction:** words, spaces and lines rebuilt from where each glyph is drawn; the direction of every
  paragraph, cell and list item from its own letters; numbers in the order the page shows them.
- **Persian and Arabic:** wrong character maps (ToUnicode) repaired against the font itself; ZWNJs the file never
  drew put back; Arabic ي ك and digits written as Persian and ASCII (two settings, on by default).
- **Structure:** headings, lists, quotes, code, tables (ruled, borderless, merged cells, across pages), links,
  footnotes and endnotes, tables of contents, forms, letter heads.
- **Pages:** running heads and footers, page numbers, borders and banners left out; columns and sidebars read in
  order; pictures kept as pictures and text over them kept as text.
- **Producers:** Word, Microsoft Print to PDF, Excel, PowerPoint, LibreOffice, Chrome, Edge, Firefox, Opera,
  Prince, iText, Acrobat, InDesign, wkhtmltopdf, pandoc, LaTeX, ReportLab, OCR layers.
- **It says what may be wrong:** pages with unreadable characters, words run together or text under a picture;
  scans, password-protected and damaged files — in the interface's three languages.

- **An import report** instead of toasts: page by page, what was read in full, what may be wrong (characters a font
  could not name, words run together, text under a picture) and how the page was read. A PDF that was not read well
  can be imported again in **safe mode** (headings and paragraphs only).
- Pages set upright by the PDF's own rotation (Word landscape pages, upside-down pages) are read upright; a diagonal
  watermark stays out of the text; text and its `/ActualText` are read from compressed object streams too.
- The importer loads on the first PDF import (the page starts lighter).

### Added — formulas through PDF

- PdfBuilder writes each formula's LaTeX into the PDF (an `/ActualText` span and an XMP map); PdfImporter gives it
  back exactly as `$…$` / `$$…$$`. `setMath({ source: false })` turns it off.

### Added — import and export in the app

- **Several files at once, and .zip:** picked or dropped together, they become one document in name order (numbers
  in numeric order), each after a separator chosen in Settings (its name and a rule, a rule, or a blank line). A
  zip's md, txt, html, docx and pdf files are imported, and its images found by the paths the text gives them
  (JSZip, loaded on the first zip).
- **The order of several files:** before they are imported, a window lists them with the icon of their kind (md,
  txt, html, docx, pdf), in name order — drag them or move them with the arrows, leave some out; files that cannot
  be converted, or are too large, are listed apart with the reason.
- **A progress dialog** while a file is imported or made: the page waits, a PDF shows its pages going by, and
  Cancel stops it.
- **The MD file keeps its images:** pictures the text names (dropped, pasted, or from a PDF) go into the file as
  data URIs at its end, and come back as pictures when it is imported again.
- **Each new line is a new line** (Settings → Text, on by default): the lines of a paragraph keep their breaks in
  the preview and every output, as chat apps show a model's answer; off is GFM's standard soft break.
- Settings: the largest file to import (10, 20 — the new default —, 40 or 60 MB); line spacing 0.8 and 0.9.
- PDF, .docx and HTML carry their properties: title, author, and Kelk as the creator.

### Changed

- The exports are named after the imported file (or the about document's file), also after a reload; a click on
  a file name copies it.
- The copy button of the Markdown sits by the MD button.
- The app's title and texts say the way back too: Markdown to Word, PDF and HTML — and back; the editor's hint and
  the drop area name .pdf.
- About and samples (fa, en, ar): PDF import, and **cleaning up a Word document** — a .docx imported and exported
  again comes back with its direction, alignment, styles and tables made uniform.
- Messages of an import come once, grouped by kind with a count.

### Fixed

- PDF: the space between text and a formula or image at a block's edge was lost.
- PDF: shapes that are emoji by default (⚪ ⚫ ⬛ ⬜ ◽ ◾) are drawn as text unless FE0F asks for the emoji.
- Markdown import: a line break is written as a backslash, so it survives (a letter's address lines had run
  into one).
- `tools/bidi-lab.html` is in step with `lib/` again.
- Scroll sync: dragging the preview's scrollbar fast no longer makes the two panes answer each other (the thumb
  shook and lagged).
- The empty preview's hint takes the interface's direction, not the last document's.
- .doc export no longer has the page try to load its picture parts (`document_files/…` errors in the console).
- Markdown import: a `|` in a table cell is escaped (`\|`); it had split the cell, and the table was no table.
- Dark theme: scrollbars and form controls in their dark version (they were white).

### Quality and security

- **Safer preview and exports:** a Content Security Policy for the page; Markdown can no longer take over the app's
  own elements or restyle it (ids prefixed, `<style>`, forms and inputs removed); the custom header and footer HTML is
  sanitized; the HTML export strips scripts, `on…` handlers and embedded pages.
- **Settings keep what you chose:** the stored profile holds only what differs from the defaults, with a schema
  version — old migrations no longer overwrite a choice made on purpose; two tabs no longer undo each other's text
  and images.
- **An export right after typing** has the last keystroke in it (the preview's pending render is drawn first).
- PDF output: ى (U+0649) joins with its proper initial and medial forms (it was drawn as a Cyrillic mark); letters
  without presentation forms join their neighbors; a table row taller than a page no longer runs off it; one table
  of named colors for every builder; a download's link is kept long enough for every browser.
- PDF import: nested Persian quotes come back as quotes (they were lost in every producer).
- Arabic interface: Arabic words and dates in the documents it makes (they were Persian); the interface language and
  theme are set before the first paint (no flash of the wrong language).
- Accessibility: code colors with enough contrast in both themes, named task checkboxes, scrolling code blocks and wide
  formulas reachable by keyboard.

### Documentation and tests

- `lib/PDFIMPORT.md`: how the importer works, a field guide to the producers, what a PDF itself loses.
- `tests/pdf-lab/`: the import lab (Node + Playwright) — corpus, generators, scorer, style fuzzing in English, Persian
  and Arabic, a metamorphic net of 20 transforms × 24 seeds (185 of 199 unchanged files read exactly the same), a gate
  against regressions, PDFs from real producers on Windows, hand-written reference Markdown (golden files) and a
  held-out protocol (`tests/pdf-lab/HELDOUT.md`). Inside, the importer is split into one function per step, with
  one registry of its 1,007 thresholds and a calibration of each document (`lib/pdfimport/README.md`).
- Continuous integration on GitHub (`.github/workflows/`): the lab and its gate, the four builders against golden
  snapshots, every .docx checked against the OOXML schemas and opened by LibreOffice, unit tests, lint, links,
  accessibility (axe) in fa / en / ar, a startup size budget, generated files kept fresh, one version string.
- `tests/pdf-import-suite.html` (was `import-suite.html`): PDFs you pick, scored in the browser, offline.
- `tests/slides-suite.html` runs the slide cases and samples and reads each .pptx back.

### Third-party

- Added: PDF.js 6.4.299 (Apache-2.0) with its OpenJPEG and JBIG2 decoders (BSD), wrapped as classic scripts by
  `tools/build-pdfjs.js` so it runs from `file://`; JSZip 3.10.2 (MIT, for .zip import); PptxGenJS 4.0.1 (MIT, for .pptx).

## [1.5] — 2026-10-03

The second release. Highlights: **LaTeX formulas** in the preview and all four outputs — as real,
editable **Word equations** in `.docx` and `.doc`, as **vectors** in PDF — and Word equations back to
LaTeX on import; **table styles** (lines × fill, three colors, a total row) and **code and quote
colors**, the same in every output; a regrouped **Settings** pane; a **PreviewBuilder**, so the
preview and the HTML export share one logic and one stylesheet.

### Added — formulas (LaTeX)

- `lib/MathCore.js` (new): formulas as AI models and scientific texts write them — inline `$…$` and
  `\(…\)`, display `$$…$$` and `\[…\]` on their own lines. The Pandoc dollar rule keeps amounts such as
  "$5 and $10" as money; code spans and code blocks are never read.
- Local **MathJax 4.1.3** (`vendor/mathjax_4.1.3/`, Apache-2.0): TeX input and extensions, SVG output,
  `ui/safe`, the New Computer Modern font and the mhchem font extension — loaded on the first formula,
  no CDN, works from `file://` in Chrome, Edge and Firefox.
- **Preview:** formulas drawn as SVG; right-to-left `\text{…}` (Persian, Arabic) in the document font,
  as one correctly ordered run.
- **Preview** and **HTML export** draw formulas the same way: SVG (default, the same drawing as the other outputs) or native **MathML**
  (selectable, lighter) — adapted to MathML Core (letter styles as Unicode math letters, primes,
  column alignment); a formula browsers cannot draw (`\cancel`, `\boxed`, tags, table rules, wide
  accents and braces, extensible arrows, mhchem) is written as SVG.
- **`.docx`:** each formula is Word's own, editable equation (MathML → OMML, `MathCore.toOmml`,
  own converter, MIT); mhchem stays a picture (SVG with a PNG fallback, sharp at any zoom in Word 2016+).
- **`.doc` (MHTML):** Word equations too, in the form Word itself writes in HTML (OMML inside
  `<!--[if gte msEquation 12]>`, with the picture for other readers).
- **PDF:** formulas as **vector paths** (MathJax SVG drawn with jsPDF's path operators); right-to-left
  `\text` as a high-resolution PNG. Any inline image — formula or not — is now an atom of the line:
  the line grows around it and the text keeps its baseline.
- Inline formulas sit on the text baseline in every output; display formulas are centered; numbered
  equations (`\tag`) span the text column; in the preview and HTML a display formula wider than its
  column shrinks to fit.
- **Import:** formulas come back as `$…$` / `$$…$$` from KaTeX (text pasted from ChatGPT, Claude …),
  MathML with a TeX annotation (Wikipedia), MathJax 4 pages, Kelk's own HTML and formula pictures —
  and **Word equations in a `.docx`** (read from the zip before mammoth, `MathCore.ommlToTex`).
- Settings → **Formulas**, in two parts: *Preview & HTML* (SVG / MathML) and *Word (.docx / .doc)*
  (Word equations — editable / pictures — as in the preview).
- Samples: new section **6.5 LaTeX formulas** in the three about documents (fa, en, ar) —
  an introduction, a ready-to-copy prompt that asks language models for LaTeX in Kelk's format,
  and three real problems (probability and linear algebra; the Haber process; training a classifier)
  with formulas in paragraphs, lists, quotes and table cells.
- `lib/LATEX.md` (new, English): how formulas travel to every format and back, and the findings
  behind each decision (MathJax 4 from `file://`, MathML Core, Word's HTML form of equations …).
- Tests: `tests/builder-suite.html` also checks that the preview and the HTML export give every block the
  same direction and every table cell the same style, and that the `table-dir-*` cases put every cell
  in its stated direction; `table-style-*`, `colors-code-quote` and edge cases (only a table, a
  one-row table, a single line, inline code with RTL text, code in a list item) in the corpus;
  `tests/math-file.html` (MathJax from `file://` with no network, render checks, OMML
  well-formedness, TeX → OMML → TeX round trip, importer sources), `tests/math-modes.html`
  (38 constructs, SVG and MathML side by side), and formula documents in the builder corpus.

### Added — tables

- Settings → **Tables** group: table width (moved from Page) and **table alignment** — center,
  with the text (the document's side), right, left. A table in a list item or a quote always stands
  at the start of that item or quote. The same rule in the preview, HTML, PDF, `.docx` and `.doc`.
- **Table style**: *lines* (none, under the header, horizontal, vertical, outer frame, grid) ×
  *fill* (none, colored header, zebra stripes, colored header + stripes), three colors (header,
  stripes, lines), *center the header row* and *bold header row* (both on; a column's own Markdown
  alignment `:---` `:---:` `---:` always wins), and *last row is a total* (bold, a line above it).
  Default: grid, colored header and stripes in blue-gray (`#E4E9EF`, `#F5F7FA`, lines `#A9B5C4`).
  Colors a style does not use are dimmed; one ↺ restores the whole style; text on a dark fill
  turns white.
- A table whose only row is its header — a one-row Markdown table, or a one-row table imported
  from Word or HTML (GFM makes its first row the header) — has no header: the row is styled as a
  body row, and Word does not repeat it as a header row.
- One model for every output — `BuilderBase.setTableStyle({ lines, fill, total, headerCenter,
  headerBold, headerColor, stripeColor, borderColor, borderWidth })`; `_tableStyleGrid` resolves each cell's four lines once
  (a line between two rows is drawn when either asks for it; start and end are the table's own
  sides) and the builders only paint: inline cell styles in HTML and `.doc`, cell borders and shading
  in `.docx` (direct formatting, no Word table style), lines and fills in the PDF.
- Column widths from the content in the **preview** too (the same shares as the outputs); formulas
  and images count with their real width.

### Added — code and quotes

- Settings → **Code** → colors: background, language bar (its text turns light on a dark bar),
  frame. Settings → **Quotes** (new group): bar color and width (thin / medium / thick), **fill**
  and text color. One ↺ per group.
- **Quote fill** in every output (new template option `quoteBg`): Quote style shading in `.docx`
  (and the cell of a quote table), the Quote style and quote table in `.doc`, a fill laid **under**
  the text in the PDF (also across page breaks).
- New defaults: code background `#FCFCFC`, language bar `#E7F1EE`, frame `0.75pt #D4D0C8`; quote
  bar `#1F6F5C`, fill `#F6F9F8`. In the preview and HTML, code blocks have 6 px corners and the
  quote box rounds its end corners; the language bar has a line under it.

### Added — interface

- `lib/PreviewBuilder.js` (new): the preview drawn with HtmlBuilder's logic and stylesheet — the same
  directions, code frames, table widths and sides, formulas and table of contents as the HTML export;
  code frames in the preview take the export's style and keep their copy buttons.
- **Maximize** button on the editor and the preview: the other panel and Settings step aside; the
  same button or Esc restores (replaces the editor's close button).
- **Settings regrouped** by subject: Document (with the document direction and the table of
  contents) · Text · Code · Quotes · Tables · Formulas · Page & header (with the logo) · Word (its
  fonts and "Preview with the Word fonts") · App settings. Settings of one output sit in that
  output's group; the Text group links to the Word group.
- **App settings** moved from a dialog into the last group of the Settings pane (only its heading
  tinted); the top-bar button is gone.
- Every setting that reaches the preview redraws it at once (`SCOPES` in `scripts/settings.js`;
  typing after a short pause) — the table of contents, code size and fonts included.
- **Dark theme**: the preview shows the document's colors (tables, code, quotes, table of contents)
  in a dark version of the same hues, with dark-theme syntax colors; the exports keep the chosen
  colors.
- **Clear & paste** button next to Paste: the clipboard becomes the document (after a confirmation).
- **Copy** button in the editor panel (the Markdown as it is).
- Export buttons ordered DOCX, PDF, HTML, DOC (DOCX primary, PDF soft accent, HTML and DOC secondary).
- `<head>`: charset first, one description, canonical URL, theme color, **Open Graph** and
  **Twitter card** link previews with `assets/og-image.png` (1200×630).

### Changed

- Table lines are 0.5 pt in every output (Word and HTML drew 1 pt); `pdf.tableBorder` is gone
  (`setTableStyle` sets the lines). Template defaults follow the new look (`tableHeaderBg`, code and
  quote colors).
- A table cell **without letters** — digits of any script (`0-9`, `٠-٩`, `۰-۹`), signs, symbols, an
  empty cell — takes its table's direction, in every table and document (before: only ASCII-digit
  cells, and only in right-to-left tables). `NUMBERS_ONLY_PATTERN` knows Arabic-Indic and Persian
  digits.
- `setToc({ title })` takes one text or `{ rtl, ltr }`; the builder picks the one of the document's
  direction.
- "Preview with the Word fonts" reaches the preview's stylesheet, not only the editor.
- American spelling throughout (interface, docs, comments).

- End-of-block punctuation after a final English word in a right-to-left paragraph: the colon joins
  the period (`endPunctuation: ['.', ':']`) — "… معماری Transformer:" now ends on the left like
  a sentence; `?` and `!` stay with the English phrase ("are you ready?", "surprise!").
- Task-list checkboxes are ☐ / ☑ characters in `.doc` too (shared `taskMarks` in BuilderBase);
  no form control, no security warning in Word.
- `.docx` inline code uses a named character style (**Inline Code**), and the importer brings inline
  code and Kelk's code frames (with their language) back as backticks and fenced blocks.
- Column-width estimate: Arabic-script letters and bold header cells count a little wider.
- README (en / fa / ar): LaTeX formulas, table styles, maximize, Clear & paste; new screenshots of the
  interface and of formulas (`docs/screenshots/kelk-math-{en,fa,ar}.png`). Download links point to
  `kelk_1.5.zip`.
- Samples: section 4 follows the regrouped settings; the tables section introduces the table style.
- Version 1.5 in every `lib/` file, `config.js` and `tools/bidi-lab.html` (whose inlined engine was
  synchronised with `lib/`).

### Fixed

- Inline code with right-to-left text and brackets (`![نام](نام)` in a Persian sentence) lost its
  order in PDF and Word: an RTL run inside code no longer spans a bracket (as UBA's bracket rule
  does in a browser), and Word gets the code inside an LTR embedding (`BidiCore.codeForWord`; the
  importer removes those marks again).
- `.html` export: a code block inside a list item was split, its language bar caught by the item's
  text (code frames are now made after the directions, as in the preview).
- `.docx` / `.doc`: a filled left-to-right quote left a white gap between its bar and its fill. Word
  positions a paragraph's shading by the border spacing of the opposite side, so the side opposite
  the bar now has a hairline in the fill's color with spacing equal to the bar's; quotes stay
  paragraphs in the Quote style. In `.docx` quotes drawn as a table (lists, tables, nested quotes
  inside), the bar is a cell border without spacing, so the cell fill reaches it.

- The table of contents (and code size, Latin font …) did not redraw the preview until another
  setting changed.
- The table of contents kept the previous document's title language when the interface language
  switched with the about document open.
- The preview fitted tables before the web fonts arrived (a cell could wrap); it now redraws once
  they are in, and whenever the pane's width changes.
- Settings opened at the rail's width from a maximized panel.

- `.docx`: a table cell (or list item) holding only an image or a formula was left empty.
- `.docx`: the space before an inline formula or image was dropped.
- `.docx`: thin spaces inside equations (`\,`, `\ `) were lost (docx.js trims whitespace-only runs).
- `.doc`: tables in list items were stretched to 98% — the template's `table.MsoNormalTable`
  width overrode them; the 98% now belongs to the header/footer table only.
- `.doc`: a counter-direction quote and code frames were positioned with `align` on the table, which
  Word reads as "text wrapping: around" (the table floated into the paragraph before);
  a `<div align>` around them now, as Word writes it.
- `.doc`: an inline picture's neighbouring space was moved to one side by Word's BiDi (a formula glued
  to the next word); display pictures were lowered and clipped.
- Word (`.docx` and `.doc`): inline pictures were lowered twice as far as asked — Word applies a
  picture's run position twice (`BuilderBase.WORD_PICTURE_LOWER` compensates).
- HTML export: a table's width ignored formulas, which could overflow their column; nested tables in
  lists and quotes were crushed.
- Preview: a short first column could be squeezed by a long one beside it.

### Third-party

- Added: MathJax 4.1.3, its New Computer Modern font and mhchem font extension (Apache-2.0).
- Considered and not used: svg2pdf.js (Kelk draws the vectors itself), mathml2omml (LGPL; Kelk has
  its own MIT converter).

## [1.0] — 2026-09-29

- Markdown (GFM) → Word `.docx`, Word `.doc` (MHTML), PDF and standalone HTML — and Word / HTML /
  `.docx` back to Markdown — entirely client-side, offline, from `file://`.
- Right-to-left first (Persian, Arabic, Hebrew, Urdu …) with every left-to-right language: one
  direction engine (`BidiCore`) for all outputs and the preview (`BidiView`).
- PDF with its own layout engine on jsPDF: BiDi, Arabic shaping, mark positioning, per-glyph font
  fallback, emoji; embedded fonts (Vazirmatn, Sahel, DejaVu, Vazir Code Hack, Noto Emoji).
- Header and footer (automatic or custom HTML), logo, table of contents, page size and margins, code
  frames with language labels, images in every output.
- Interface in Persian, English and Arabic; light and dark themes; about document and samples.
- `lib/` as a standalone library (`BuilderBase` API for all builders), MIT license.
