# Kelk library (`lib/`)

Markdown-rendered HTML to **.docx, .doc, .pdf and .html**, and Word/HTML back to Markdown —
entirely in the browser, with correct direction for right-to-left languages (Persian, Arabic,
Hebrew, Urdu, Kurdish …), for their mix with left-to-right text, and for purely left-to-right
documents. No server, no build step; plain scripts that also load from `file://`.

This file is for developers. The Kelk page (`../index.html`) is one client of this library;
nothing here depends on it.

## Files and load order

```text
vendor      docx (for .docx) · jsPDF (for .pdf) · mammoth + turndown (+ gfm) (for import)
fonts       pdf-base64-ttf-fonts/pdf-font-*.js        PDF fonts (window.PdfFonts)
lib         ImageCore.js        images: registered names, data URIs, URLs, SVG → PNG
            MathCore.js         LaTeX formulas: marked extension, MathJax 4 (local) → SVG / MathML, OMML ↔ TeX (see LATEX.md)
            BidiCore.js         every direction decision (document, blocks, runs), ToC, table widths
            BidiView.js         BidiCore's decisions applied to HTML in a browser (classes)
            msOfficeWordHtmlTemplate.js   styling defaults (createMsoTemplate.DEFAULTS)
            BuilderBase.js      the configuration surface shared by the builders
            WordHtmlBuilder.js  .doc  (MHTML, Microsoft Word only)
            DocxBuilder.js      .docx (Office Open XML, docx.js)
            PdfBuilder.js       .pdf  (own layout engine on jsPDF)
            HtmlBuilder.js      .html (standalone page, fonts and images embedded)
            PreviewBuilder.js   a live preview on HtmlBuilder's logic and stylesheet (after HtmlBuilder)
            MarkdownImporter.js .docx / HTML / pasted rich text → Markdown
```

Load them in that order with plain `<script>` tags. In Node the files `require` each other
(`module.exports`), but building a document needs a DOM.

## Quick start

```js
// the body: HTML from any Markdown renderer (marked, markdown-it …)
const html = marked.parse(markdown);

// .docx
const docx = await DocxBuilder.create()
    .configure({
        direction: 'auto',                                  // 'auto' | 'rtl' | 'ltr'
        page: { size: 'A4', orientation: 'portrait', margin: '20mm 15mm' },
        fonts: { bidi: 'B Nazanin', latin: 'Calibri', code: 'Consolas' },
        fontSizes: { bidi: 12, latin: 11.5, code: 10 },    // points
        header: { title: 'Report', edition: 'Draft' },
        footer: { author: 'Kelk', link: 'https://example.com' },
        toc: { levels: 2 },
        tableWidth: 'auto'
    })
    .addFromHtml(html)
    .toBlob();

// .pdf: the fonts are embedded, so they must be registered first
const pdf = await PdfBuilder.create()
    .registerFonts(window.PdfFonts)                         // pdf-font-*.js already loaded
    .configure({ fonts: { bidi: 'Vazirmatn', latin: 'Vazirmatn', code: 'Vazir Code Hack' } })
    .addFromHtml(html)
    .toBlob();

// .html: web fonts embedded as base64
const page = await HtmlBuilder.create()
    .registerWebFonts(window.KelkWebFonts)                  // { family: [{ weight, style, format, data }] }
    .configure({ fonts: { bidi: 'Vazirmatn', latin: 'Vazirmatn' } })
    .addFromHtml(html)
    .toHtml();                                              // or toBlob() / save('file.html')

// .doc
const doc = await WordHtmlBuilder.create().configure({ /* same keys */ }).addFromHtml(html).toBlob();
```

## One API for four builders (`BuilderBase`)

Every builder extends `BuilderBase`, so a call means the same thing — with the same validation —
in every output. `configure(options)` takes them all at once; an unknown key throws.

| `configure` key | setter | value |
|---|---|---|
| `direction` | `setDirection` | `'auto'` (first text block) · `'rtl'` · `'ltr'` |
| `page` | `setPage` | `{ size: 'A4'\|'A5'\|'A3'\|'Letter'\|'Legal'\|'17cm 24cm', orientation, margin, headerMargin, footerMargin }` |
| `fonts` | `setFonts` | `{ bidi, latin, code, latinFallback, codeFallback, bidiLanguage }` |
| `fontSizes` | `setFontSizes` | `{ bidi, latin, code }` — numbers are points |
| `header` | `setHeader` | `'text'` · `{ logo, logoHeight, title, edition }` · `{ html, title, dateLocale }` |
| `footer` | `setFooter` | `true` · `{ author, link, pagingLabels }` · `{ html, title, dateLocale }` |
| `headerFooterDirection` | `setHeaderFooterDirection` | `'auto'` (default) · `'rtl'` · `'ltr'` |
| `codeBlock` | `setCodeBlockOptions` | `{ showLanguage, fallbackLabel, nestedFrames, rtlFont: 'code'\|'document' }` |
| `toc` | `setToc` | `{ levels: 1–6, title }` · `null` |
| `tableWidth` | `setTableWidth` | `'auto'` (default: the content's width, up to 100%) · `'98%'` … |
| `images` | `registerImage` | `{ name: File \| Blob \| ArrayBuffer \| dataURI \| URL }` |
| `imageOptions` | `setImageOptions` | `{ baseUrl, svgScale, timeout }` |
| `template` | `setTemplateOptions` | any `createMsoTemplate.DEFAULTS` key (colors, spacing, list indents …) — e.g. code `codeBlockBg`, `codeHeaderBg`, `codeHeaderColor`, `codeBlockBorder`; quotes `quoteBorderColor`, `quoteBorderWidth`, `quoteBg` (`''`: no fill), `quoteTextColor` |
| `styles` | `setStyles` | builder-level overrides |
| `content` | `addFromHtml` | HTML string or element (copied, never modified) |

Custom header/footer HTML supports the fields `{page}`, `{pages}`, `{date}` and `{title}`, and
images by registered name (`<img src="logo">`). `setHeaderFooterCallback(fn)` gives full control
(each builder documents the callback's form).

Shared by all four: header/footer borders and columns (`BuilderBase.SHARED_DEFAULTS`), list
indents and spacing (template `listIndent`, `listIndentStep`, `listHanging`, `listItemSpaceAfter`),
column widths from the content (`BidiCore.tableColumnShares`), one body alignment for every
language (justify; a paragraph holding a long URL or path starts instead), and the table of
contents layout (after the opening H1: `<hr>`, contents, `<hr>`, an empty line).

## The builders

- **`DocxBuilder`** — `toBlob()`, `build()` (the docx.js `Document`). Real Word styles (Heading,
  Quote, List Paragraph, TOC Heading, toc 1–6); RTL documents get an RTL section.
- **`WordHtmlBuilder`** — `toBlob()` (.doc as MHTML: HTML, images and the header/footer part in
  one multipart file), `toMhtml()`, `toHtml()`. Free-form header/footer HTML. Microsoft Word only.
- **`PdfBuilder`** — `toBlob()`, `toDataUri()`, `save()`, `build()` (the jsPDF document).
  Arabic-script shaping, diacritic placement, BiDi reordering, per-glyph font fallback, page
  numbers, a table of contents with page numbers and links (two layout passes), bookmarks.
- **`HtmlBuilder`** — `toHtml()`, `toBlob()`, `save()`. Directions by `BidiView`, template
  styling, embedded fonts and images, `@page` print setup with page numbers where supported.

## Fonts

- **Word** files only *name* their fonts: they must be installed on the reader's computer.
- **PDF** fonts are embedded. Each `pdf-base64-ttf-fonts/pdf-font-*.js` adds one family to
  `window.PdfFonts` (Vazirmatn, Sahel, DejaVu Sans, DejaVu Sans Mono, Vazir Code Hack, Noto Emoji);
  `registerFonts(PdfFonts)` registers the loaded ones, and only the styles actually drawn are
  written into the PDF. You are not limited to these: any font — for text, emoji, code or any
  other role — can be prepared with `../tools/build_pdf_fonts.py` (subsetting,
  dehinting, oblique styles, mark anchors), **within the font owner's license**.
- **HTML** fonts are embedded as base64 `@font-face` rules from `registerWebFonts({ family: [...] })`;
  Kelk's page keeps them in `../assets/fonts/embed/*.js`. Any web font can be added the same way.

## Formulas: `MathCore`

> The whole story — every output, the importer, Word's undocumented HTML form of equations and
> the findings behind each decision — is in **[`LATEX.md`](LATEX.md)**.

LaTeX math as AI models and scientists write it — `$…$`, `\(…\)` inline; `$$…$$`, and
`\[…\]` on its own lines, for display. `marked.use(MathCore.markedExtension())` turns each
formula into an empty placeholder carrying its TeX (`<span class="kelk-math" data-tex="…">`);
BidiCore treats it as one left-to-right atom (`isMathAtom`). The engine is a local copy of
MathJax 4 (`vendor/mathjax_4.1.3/`, loaded on the first formula, no CDN, works from `file://`):

```js
marked.use(MathCore.markedExtension());
const rec = await MathCore.render('\\frac{a}{b}', true);   // { svg, mathml, width, height, depth, error }
await MathCore.typeset(element, { mode: 'svg' });          // or 'mathml'
```

`HtmlBuilder` writes formulas as SVG or MathML (`setMath({ mode })`). MathML is written for what
browsers draw (MathML Core: letter styles as Unicode math letters, primes, column alignment);
a formula they cannot draw (`\cancel`, `\boxed`, tags, table rules, wide accents and braces,
extensible arrows, mhchem) is written as SVG. `tests/math-modes.html` shows both, side by side.

The Word and PDF builders draw each formula as an image (`BuilderBase._mathToImages` →
`MathCore.toImages`: SVG at the size it has on a page, next to the body text), inline formulas
on the baseline and display formulas centered; tagged equations span the text column. `.docx`
and `.doc` write each formula as **Word's own equation** (in `.doc` inside Word's conditional
comments, with the picture for other readers, as Word's "Save as Web Page" writes it) (OMML from `MathCore.toOmml` — editable in Word,
drawn in Cambria Math); with `setMath({ word: 'image' })`, and always for mhchem (`\ce`), it
stores the SVG itself (sharp at any zoom in Word 2016+) with a PNG fallback; `.pdf` draws the
SVG's paths with jsPDF's own path operators (vector, sharp at any zoom — `svgToPdf` in
PdfBuilder); `.doc` uses the PNG ImageCore rasterizes (about 576 dpi). A formula with right-to-left `\text` carries
its font inside the image (`window.KelkWebFonts`, or `MathCore.configure({ fonts })`) and stays
PNG in `.docx` and `.pdf`. Inline, TeX sets nested fractions in script sizes (`\frac{\frac{a}{b}}{…}`
is small by design); `\dfrac` or `\displaystyle` gives full-size parts. Word lowers an inline picture twice as far as its run position says:
`BuilderBase.WORD_PICTURE_LOWER` (0.5) compensates. A TeX error is written as code.

`MarkdownImporter` keeps formulas: KaTeX (pasted from ChatGPT, Claude …), MathML with a TeX
annotation (Wikipedia), MathJax 4, Kelk's own HTML and formula pictures, and **Word's equations in
a .docx** (read from the zip before mammoth, `MathCore.ommlToTex`) come back as `$…$` / `$$…$$`.

## The preview: `PreviewBuilder`

`PreviewBuilder` is `HtmlBuilder` drawing into an element of an app page instead of a file: the
same directions, code frames, table widths and sides, formulas and document styles. `css(dir)` is
only the document's rules (no embedded fonts, page box or print rules); `decorate(root, { width,
fontSize, onCopy })` works in place and synchronously (code frames get copy buttons);
`typeset(root)` draws the formulas afterwards, in the export's mode (SVG or MathML). Take the HTML for the exports before `decorate`.

## Tables

Every builder sizes columns from the content (`BidiCore.tableColumnShares` — formulas and images
count as unbreakable words) and places tables the same way: `setTableWidth('auto' | 'NN%')` and
`setTableAlign('center' | 'text' | 'right' | 'left')`, where `text` is the document's own side. A
table in a list item or a quote stands at the start of that item or quote. In `.doc` the side is a
`<div align>` around the table (an `align` on the table is Word's "text wrapping: around").

`setTableStyle({ lines, fill, total, headerCenter, headerBold, headerColor, stripeColor, borderColor, borderWidth })` gives
every content table its lines, fills and bold — the same in all outputs. Two independent choices
and one switch:

| Option | Values |
|---|---|
| `lines` | `none`, `underline` (under the header), `horizontal`, `vertical`, `frame` (outer box), `grid` (default) |
| `fill` | `none`, `header`, `stripes` (even body rows), `header-stripes` (default) |
| `total` | `true`: the last row is bold, with a line above it |
| `headerCenter`, `headerBold` | the header row centered (a column's own alignment wins) and bold — both `true` by default |

Colors: `headerColor` (default: the template's `tableHeaderBg`, `#E4E9EF`), `stripeColor` (`#F5F7FA`),
`borderColor` (`#A9B5C4`); `borderWidth` in points (0.5). Every key is optional
(`BuilderBase.TABLE_STYLE_DEFAULTS`); an unknown key is an error. Text on a dark fill turns white.
A table whose only row is its header has no header: that row is styled as a body row.
`BuilderBase._tableStyleGrid(table)` resolves the style once per table — four kinds of row (header,
odd, even, last), a line between two rows drawn when either asks for it, start and end on the
table's own sides — and each builder only paints the result: inline cell styles in HTML and `.doc`,
cell borders and shading in `.docx` (direct formatting, no Word table style), lines and fills in
the PDF.

```js
builder.setTableStyle({ lines: 'horizontal', fill: 'none', total: true });          // a report table
builder.setTableStyle({ lines: 'grid', fill: 'header-stripes', headerColor: '#1F3864' });
```

## Direction: `BidiCore` and `BidiView`

`BidiCore` makes every direction decision for all outputs: the document direction (the first
text block), the direction of each block (paragraph, heading, list item, quote, table cell) and
the counter-direction runs inside a block (greedy run, bracket and quote guard, glued digits
"4k", formulas "∑ (i=1 → n)", a number joining the Persian phrase after it in LTR text, end
punctuation). `BidiView` applies the same decisions to HTML in a browser as `bd-*` classes
(`apply`, `clear`, `css`, `toAttributes`). `../tools/bidi-lab.html` shows every rule with test cases.

Tables: a table with any right-to-left letter keeps the document's direction (columns from the
right in a right-to-left document); a table without one is left-to-right as a whole. A cell
decides by its own letters, and a cell with no letter at all — digits of any script (`0-9`,
`٠-٩`, `۰-۹`), signs, symbols, an empty cell — takes its table's direction, so a column of
numbers lines up with its table in every case.

## Import: `MarkdownImporter`

```js
const imp = MarkdownImporter.create({ nestedTables: 'extract', images: 'markdown' });
const { markdown } = imp.fromHtml(html);                 // HTML or Word HTML
const r = await imp.fromDocx(arrayBuffer);               // r.markdown, r.messages (mammoth)
const md = imp.fromDataTransfer(event.clipboardData);    // null when there is no HTML
```

## Known limitations

- **Table of contents in Word** (.doc, .docx): Word computes the page numbers — right-click the
  table → Update Field → Update entire table (a .docx offers the update when it opens).
- **.docx bullets** are the builder's own list definitions (• filled, ○ hollow, ▪): they look
  like Word's, but Word's Bullet Library shows them as custom bullets.
- **.doc** (MHTML) opens in Microsoft Word only.
- **PDF:** no kerning (GPOS) and no marks on ligatures (MarkLigPos); internal `#anchor` links
  and `rowspan` are not drawn yet; images inside a line of text are left out.
- A DOM is required to build documents (browser, or a DOM implementation in Node).

## License

Code: see `../LICENSE`. Libraries and fonts keep their own licenses — see
`../THIRD-PARTY-NOTICES.md` and the license file next to each font.
