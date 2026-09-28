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
            BidiCore.js         every direction decision (document, blocks, runs), ToC, table widths
            BidiView.js         BidiCore's decisions applied to HTML in a browser (classes)
            msOfficeWordHtmlTemplate.js   styling defaults (createMsoTemplate.DEFAULTS)
            BuilderBase.js      the configuration surface shared by the builders
            WordHtmlBuilder.js  .doc  (MHTML, Microsoft Word only)
            DocxBuilder.js      .docx (Office Open XML, docx.js)
            PdfBuilder.js       .pdf  (own layout engine on jsPDF)
            HtmlBuilder.js      .html (standalone page, fonts and images embedded)
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
| `template` | `setTemplateOptions` | any `createMsoTemplate.DEFAULTS` key (colors, spacing, list indents …) |
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

## Direction: `BidiCore` and `BidiView`

`BidiCore` makes every direction decision for all outputs: the document direction (the first
text block), the direction of each block (paragraph, heading, list item, quote, table cell) and
the counter-direction runs inside a block (greedy run, bracket and quote guard, glued digits
"4k", formulas "∑ (i=1 → n)", a number joining the Persian phrase after it in LTR text, end
punctuation). `BidiView` applies the same decisions to HTML in a browser as `bd-*` classes
(`apply`, `clear`, `css`, `toAttributes`). `../tools/bidi-lab.html` shows every rule with test cases.

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
