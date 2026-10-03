# Changelog

All notable changes to Kelk. Dates are those of the release tags.

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
- Tests: `tests/index.html` also checks that the preview and the HTML export give every block the
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
