# TODO

Status of the client-side document toolkit in `lib/` (Markdown/HTML → .doc / .docx / .pdf,
RTL-first) and of the web page that presents it. Last updated: 2026-09-26. Version 1.0 everywhere until the first release (no changelog before it).

## lib/ — current state

| File | Version | Role |
|---|---|---|
| `BidiCore.js` | 1.0 | Shared engine: direction plan, BiDi isolates (UBA rule for code), RTL/LTR letter classes (Arabic script, Hebrew, Syriac …; Latin, Greek, Cyrillic …), nested-fence detection, header/footer HTML model, CSS helpers |
| `BidiView.js` | 1.0 | Browser adapter of BidiCore (preview, HTML export): the same document/block/run decisions as the builders, applied as classes (`bd-*`); level indents for mixed lists, inline code as isolate; `clear()`, `toAttributes()` for the clipboard |
| `ImageCore.js` | 1.0 | Image resolver: registered names, data URIs, http(s), relative paths; SVG → PNG (3×); PNG/JPEG kept byte for byte |
| `msOfficeWordHtmlTemplate.js` | 1.0 | `createMsoTemplate` + frozen `DEFAULTS`, single source of styling |
| `BuilderBase.js` | 1.0 | The configuration surface of all builders (setters, validation, `configure()`, images, content); `PAGE_SIZES`, `DEFAULT_PAGING_LABELS` |
| `HtmlBuilder.js` | 1.0 | Standalone `.html`: BidiView directions, template styling, embedded web fonts and images, header/footer, `@page` print setup with page numbers |
| `WordHtmlBuilder.js` | 1.0 | `.doc` as MHTML (images embedded, header/footer in their own part); `toHtml()` kept for debugging |
| `DocxBuilder.js` | 1.0 | `.docx` via docx.js 9.7.1 |
| `PdfBuilder.js` | 1.0 | `.pdf` via jsPDF 4.2.1: own layout engine, BiDi, Arabic shaping, GPOS mark anchors, per-glyph font fallback, PUA emoji |
| `MarkdownImporter.js` | 1.0 | Word / HTML / .docx → Markdown in one pipeline (mammoth, DOMPurify once, Word lists, nested tables extract/html, turndown) |
| `pdf-base64-ttf-fonts/` | — | Vazirmatn, Sahel, DejaVu Sans, DejaVu Sans Mono, Noto Emoji — four styles each, licenses beside them; `tools/build_pdf_fonts.py` rebuilds them reproducibly |

Load order: `docx / jspdf → pdf-font-*.js → ImageCore.js → BidiCore.js → BidiView.js → msOfficeWordHtmlTemplate.js → BuilderBase.js → builders`.

Removed before 1.0: `DocxBuilder.setFont / setMargins / setPageSize` (use `setFonts`, `setFontSizes`, `setPage`).

`tools/bidi-lab.html` — BiDi Lab 1.0, standalone: `lib/BidiCore.js` + `lib/BidiView.js` inlined verbatim (copy them again after any change to either).

### Done (latest rounds)

- Custom header/footer from an HTML subset in all three builders: tables, per-side borders, background, padding, images; fields `{page}` `{pages}` `{date}` `{title}`; BiDi applied; PDF body moves below a tall header.
- Real images in all outputs (web URL with CORS, relative path when served, data URI, registered name / uploaded file); header logo as a real image; `.doc` → MHTML.
- Lists: each item decided by its own text; decimal numbering at every level; spacer after a list that ends with a box.
- Code: UBA direction inside code, DejaVu Sans Mono with Persian kept, `rtlFont: 'code' | 'document'`, frames for fenced blocks written inside a code block.
- GPOS mark attachment in PDF (harakat, Hebrew points); oblique fonts fixed (lsb, double slant).
- RTL detection for all BMP RTL scripts (Hebrew …), strong-LTR class for Latin/Greek/Cyrillic/Armenian/Georgian.

Open items: see the roadmap below.

### Known limitations (by design)

- Box-drawing tables inside code with Persian between the columns show reversed, as UBA (and Word, VS Code, GitHub) does.
- `.docx`: docx.js gives hyperlinks random ids — byte comparisons of `.docx` output differ run to run.
- Copy/search of emoji in the PDF gives Private Use Area code points; no colour emoji.
- A web page cannot read `file://` paths: local images must be uploaded (registered) instead.

## Web page (index.html) — Kelk

`index.html` + `styles/` + `scripts/` (config, i18n, storage, ui, fonts-loader, names, images,
editor, preview, importer, exporter, settings, main), namespace `window.Kelk`, fa/en, light/dark.

Done (2026-09-26):

- Layout: side by side or single column (top bar), editor panel collapses to a rail (side layout);
  panel icons mirrored per direction (`.flip-rtl`); one-screen page on wide screens, scroll sync.
- MD button in the editor bar (soft; primary after a Word/HTML/rich-paste conversion until saved).
- Name box: editable stem, read-only extension that follows the export button; default stem =
  imported file → title → first H1 → first words (as Word) → "document". No date suffix.
- Title and edition as automatic values: title placeholder from the first H1 / first words;
  edition "پیش‌نویس" / "Draft" by the header/footer direction (typed value kept, ↺ restores).
- Typography: PDF & page fonts (shipped: Sahel, Vazirmatn, DejaVu Sans for Latin) apart from Word
  fonts (any name, datalist, "not installed" note); sizes for Complex scripts / Latin / code;
  optional preview with the Word fonts. Code: font for PDF & page, font for Word, size.
- Settings split: `kelk.ui` (page) and `kelk.settings` (export profile, backup/reset);
  Import options, scroll sync and backup in the App settings dialog.
- Logo: drop and paste, full thumbnail on white. Images dropped/pasted into the editor are
  registered (`![name](name)`), kept in localStorage when there is room, shown in the preview.
- About + guide + samples, one document per interface language (`docs/about-kelk-and-samples.fa.md` / `.en.md`, built into `about-kelk-and-samples.js` by `tools/build-samples.js`), loaded on the first visit and from the editor bar.
- `lib/README.md` for developers (English). Word fonts automatic by interface language (fa: B Nazanin / Calibri, en: Arial / Calibri); table width default auto; export buttons describe their use.
- HTML export embeds its fonts (`assets/fonts/embed/*.js`, loaded on demand) and highlight colours.
- Shortcuts: Ctrl+S → MD, Ctrl+Enter → DOCX, Ctrl+Shift+Enter → PDF.
- Settings → Document: table of contents (levels H1 / H1–H2 / H1–H3). Settings → Page: table width (auto, 100%, 98%, 90%, 75%, 50%).
- Code font: Vazir Code Hack (PDF, page, HTML) — lam-alef (U+FEF5–FEFC) added as composites for jsPDF; list items 1.5pt apart; Word ToC styles (TOC Heading, toc 1–6) in .doc and .docx; .doc ToC inside Word's Table of Contents content control (w:Sdt → "Update Table"), .docx entries RTL with dotted tab and PAGEREF; RTL documents get an RTL section (sectPr w:bidi), so Word builds updated ToC entries RTL.
- Title, edition and custom header/footer are automatic values (title: first H1 or opening words, never ending
  on a small function word, … when shortened; edition: Draft; header/footer: a sample) — editable, deliberately
  emptiable, ↺ restores. HtmlBuilder: Word-like header/footer tables and nested-fence frames.
- Editor and preview titles muted; expand/collapse-all buttons as a close pair. First visit: language from the
  locale (any Persian in the browser's languages, or an Iranian/Afghan time zone → Persian), light theme
  (the system's dark preference is ignored until the dark styles are tuned).
- Editor footer: stats at one edge, MD at the other. Settings pane: expand all / collapse all; closed on
  the first visit, groups collapsed.
- Fixes: autosave warns when storage is full, Shift flag reset on blur, DOMPurify default URI rules,
  placeholder direction in RTL, unused font-face CSS removed.

## Roadmap to the first release

| # | Task | Notes |
|---|---|---|
| 1 | ✅ Preview direction with the browser's BiDi | Done: `lib/BidiView.js` in the preview and the HTML export; builders get the HTML without its classes (.docx identical, .doc lost the stray `dir="auto"`); rich copy writes `dir` attributes; `tools/bidi-lab.html` |
| 2 | ✅ Formulas, document direction, LTR-document rules | Done in BidiCore (all outputs + preview): formula rule (a math operator before the first Latin letter starts the run: `∑ (i=1 → n) i = n(n+1)/2`), balance-cut runs rescanned; `detectDirection` = the first text block (tables only as fallback) instead of "any RTL character"; mirror rules for an LTR document (Persian paragraph / cell / quote paragraph → RTL); BidiView now uses BidiCore directly |
| 3 | ✅ Shared configuration + API clean-up + `HtmlBuilder` | Done: `BuilderBase` (one surface, `configure()`), duplicated setters removed from the builders (.doc/.docx output byte-identical), legacy DocxBuilder aliases removed; `HtmlBuilder` replaces the page's own HTML export |
| 4 | ✅ Lazy-load vendor libraries | Done: docx, jsPDF and mammoth load on first use (`Kelk.libs.need`); Lucide replaced by `assets/icons.js` (35 icons, 7 KB, `tools/build-icons.js`). Scripts loaded with the page: ~2.9 MB → ~0.23 MB. jsPDF min build in place (vendor updated: marked 18.0.14, DOMPurify 3.4.16, highlight.js 11.12.0, mammoth 1.12.3, Lucide 1.48.0; sources listed in index.html) |
| 5 | ✅ Test in Word / Acrobat and the browsers | Done by the author; the feedback went into #6 |
| 6 | ✅ Feedback of #5 | List indents and spacing, justify, header/footer defaults, cell alignment, column and table widths, table of contents (Word content control, RTL entries), Vazir Code Hack, guessed code labels, a number joining the Persian phrase after it in LTR text |
| 7 | ✅ Licenses, README, tests | `LICENSE` (MIT), `THIRD-PARTY-NOTICES.md`, README (en + fa) with screenshots, `lib/README.md`, `tests/index.html` (+ `tests/test-corpus.js`), `tools/build_pdf_fonts.py`; Arabic interface and about document |
| 8 | Author e-mail → the repository's address; `config.repoUrl` | Author line in the 7 lib/ headers (BidiCore, BidiView, BuilderBase, WordHtmlBuilder, DocxBuilder, PdfBuilder, HtmlBuilder) |

After the release: GPOS kerning and marks on ligatures (MarkLigPos); PDF `#anchor` links, rowspan.

## Release (GitHub)

- README (English + Persian), screenshots, live demo on GitHub Pages
- Licenses: code (e.g. MIT), fonts (OFL, Bitstream Vera/Arev) listed in one place
- Browser test page that runs the corpus and downloads the three outputs (no Python needed)
