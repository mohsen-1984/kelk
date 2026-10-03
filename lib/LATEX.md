# Formulas in Kelk — how LaTeX travels to four formats and back

This document explains how Kelk handles LaTeX formulas: what the parts are, how each output
format draws them, how Word equations come back into Markdown, and — most usefully — the
things we found out on the way that are not written down anywhere else. It is meant for anyone
who maintains `lib/`, or who wants to reuse its ideas.

`lib/README.md` has the short version of the API; this file has the reasons.

---

## 1. The shape of the solution

```
Markdown ──marked + MathCore.markedExtension()──▶ HTML with empty placeholders
                                                   <span class="kelk-math" data-tex="…">
                    ┌──────────────┬───────────────┼────────────────┬──────────────┐
            preview = HtmlBuilder       Word builders     PdfBuilder    MarkdownImporter
                SVG or MathML              OMML equations,   vector paths      (the way back)
                                              picture fallback   (PNG for RTL)
```

Everything hangs on one decision: **a formula is an empty placeholder that carries its TeX**
(`data-tex`, plus `data-display="inline|block"`). Nothing is rendered while the Markdown is
parsed. Each consumer renders the TeX itself, in the form it needs, as late as possible.

Why empty? Because the rest of Kelk is text-driven. BidiCore decides directions from letters,
column widths come from text lengths, whitespace is trimmed at block edges. A placeholder with
no text is invisible to all of that — until the code that knows it is a formula asks for it
(`BidiCore.isMathAtom`, `data-width` in table sizing, `trimEdges` treating images as content).

### The files

| File | Role |
|---|---|
| `MathCore.js` | Everything about formulas: the marked extension, loading MathJax, TeX → SVG / MathML / image, MathML → MathML Core, MathML → OMML, OMML → Word's HTML form, OMML → TeX |
| `vendor/mathjax_4.1.3/` | A pruned local MathJax 4: `startup.js`, `core.js`, TeX input and its extensions, SVG output, `ui/safe`, the New Computer Modern font (SVG data) and the mhchem font extension |
| `BuilderBase.js` | `_mathToImages()` — the shared step the Word and PDF builders run before resolving images |
| `HtmlBuilder.js` | `MathCore.typeset()` in SVG or MathML mode |
| `DocxBuilder.js` / `WordHtmlBuilder.js` | Word equations (OMML), pictures as fallback |
| `PdfBuilder.js` | `svgToPdf()`: MathJax's SVG drawn with jsPDF's path operators |
| `MarkdownImporter.js` | KaTeX / MathML / MathJax / Kelk HTML and Word equations back to `$…$` |

---

## 2. Recognizing formulas in Markdown

`MathCore.markedExtension()` adds a block and an inline tokenizer to marked.

| Written | Meaning |
|---|---|
| `$…$`, `\(…\)` | inline |
| `$$…$$` on its own lines, or inside a paragraph | display |
| `\[…\]` on its own lines | display |

Decisions and why:

- **The Pandoc dollar rule.** A `$` opens a formula only if no space follows it, and closes one
  only if no space precedes it and no digit follows it. "from $5 to $10" stays money.
- **`\[…\]` only on its own lines.** Inline, `\[1\]` is a common way to write escaped brackets
  (citations), and Markdown already means that.
- **A blank line ends a formula.** A stray `$$` must not swallow the rest of the document.
- **Tokenizers run before marked's own ones.** That is what keeps `_` from becoming emphasis and
  `\(` from being eaten as an escape. Code spans and fenced code are never read: marked has
  already consumed them when our tokenizer would see a `$` inside.

---

## 3. The engine: MathJax 4 from `file://`

Kelk must run offline and straight from `file://`, with no CDN. That shaped the engine choice.

**MathJax 4 over MathJax 3 and KaTeX.** KaTeX is lighter but has no SVG output, and SVG is what
the PDF (vectors) and the images (Word, `.doc`) are made from. MathJax gives SVG and MathML from
one engine, so every output starts from the same layout.

Things that matter when MathJax 4 runs from `file://`:

1. **Do not load the combined `tex-svg.js`.** It includes the accessibility tools (speech,
   enrichment), which read their data with `fetch()` — and `fetch()` from `file://` fails, even
   with every option turned off. Load `startup.js` and name the components:
   `loader.load: ['input/tex', 'output/svg', 'ui/safe']`.
2. **Point the font path at the local copy.** In v4 the fonts are separate packages, loaded in
   pieces (dynamic ranges) on first use. `loader.paths.fonts = '[mathjax]/fonts'` makes every
   piece local. The loader uses classic `<script>` tags, which `file://` allows.
3. **mhchem needs its own font extension** (`@mathjax/mathjax-mhchem-font-extension`), and so do
   `bbm`, `bboldx` and `dsfont`. Kelk ships only mhchem's; the others fail locally, never over
   the network.
4. **Renders are asynchronous.** With fonts in pieces, use `tex2svgPromise` / `tex2mmlPromise`.
   MathCore queues renders one at a time (see §4) and caches the result per TeX.
5. **Turn off inline line breaking** (`svg.linebreaks.inline = false`). v4 otherwise splits a
   long inline formula into several `<svg>` pieces — and code that takes the first `<svg>` shows
   only "E" of `E = mc^2`.
6. **`fontCache: 'none'`.** Every SVG then draws its own glyphs as `<path>`s, with no `<use>` into
   a shared `<defs>`. A formula taken out of the page — into a PDF, an image, a Word file — stays
   complete.
7. **`ui/safe`** keeps `\href{javascript:…}` from producing live links in exported HTML.

`tests/math-file.html` checks all of this from `file://`, and fails loudly on a network request.

---

## 4. `MathCore.render()` — one formula, every form

`render(tex, display, { textFont })` returns:

| Field | What |
|---|---|
| `svg` | a **self-contained** SVG (see below), sized in ex |
| `mathml` | MathJax's full MathML 3 (for converters) |
| `mathmlCore` | the same, rewritten for browsers — or `null` (§6) |
| `width`, `height`, `depth` | in em; depth = below the baseline |
| `exPerEm` | MathJax's ex/em ratio, for sizing images (§7) |
| `full`, `fullEm` | a tagged equation spans the line (§7) |
| `error` | the TeX error, `''` when none |

### Making the SVG self-contained

MathJax's SVG relies on a stylesheet MathJax adds to the page. Out of the page, some parts would
draw wrong or not at all. `selfContain()` writes those rules as attributes: error colors, table
rule widths, frames, dashes, link colors. Two lessons from that:

- **Serialize as XML, not HTML.** `outerHTML` writes a no-break space as `&nbsp;` — an HTML entity
  that is invalid XML. `\text{if }` (MathJax turns the trailing space into U+00A0) then made an SVG
  that no image decoder would open. Use `XMLSerializer`.
- **Only the root SVG and table cells may overflow.** Setting `overflow: visible` on every nested
  `<svg>` looked harmless and broke every stretched glyph: MathJax draws a long bar or arrow as a
  large glyph clipped by a nested viewport. Without the clip, `\overline` and `\xleftarrow` reach
  outside their box.

### Right-to-left text inside a formula

MathJax's fonts have no Persian or Arabic letters. Rendered naively, `\text{دقت برابر}` becomes
two separately positioned `<text>` runs in left-to-right order — the words swap places. MathCore
renders any formula containing RTL letters with `mtextInheritFont` switched on and the document
font as `family`: the text is then **one** `<text>` element, measured in the right font, and the
browser shapes it and orders it correctly. Two details:

- The text is wrapped in RLI…PDI (U+2067/U+2069) so it is one isolated right-to-left run, and
  spaces at its ends are moved **outside** the isolate — inside, a trailing space is drawn on the
  wrong side ("اگرx").
- Because `mtextInheritFont` is global in MathJax, renders are queued, never concurrent.

---

## 5. Preview and HTML export

The preview (`PreviewBuilder`) and `HtmlBuilder` call `MathCore.typeset(root, { mode })` with the
same mode — `setMath({ mode })`, in Kelk the setting *Preview / HTML → Formulas* — so the preview
shows a formula as the `.html` export will. MathJax is loaded on the first formula only.

- **SVG** (default): the same drawing as every other output; sized in ex, so it scales with the
  text around it.
- **MathML**: selectable, lighter — see §6.
- The placeholder keeps its `data-tex` after rendering, so Kelk's own HTML can be imported back.
- `typeset` writes `data-width` (em) on the placeholder: table column widths count formulas
  (`BidiCore.cellLines` treats a formula as one unbreakable word of that width).

A TeX error is shown as the TeX itself in red monospace, with the message as a tooltip — MathJax's
own error box measured its text in one font and drew it in another, and overlapped its neighbors.

---

## 6. MathML for browsers: MathML Core

Browsers do not draw MathML 3; they draw **MathML Core**, a subset (Chromium, Firefox and Safari
alike). MathJax writes full MathML, so `toCore()` rewrites what it can and gives up on the rest:

| Rewritten | How |
|---|---|
| `mathvariant` (`\mathbb`, `\mathcal`, `\mathbf` …) | Unicode Mathematical Alphanumeric Symbols (with the Letterlike holes: ℝ ℂ ℋ ℛ …); CSS for mtext |
| primes (`f'`) | `msup(f, ′)` → `mrow(f, ′)` — the prime glyph is already raised |
| `columnalign` / `columnspacing` | CSS `text-align` and padding on each `mtd` |

| Drawn as SVG instead | Why |
|---|---|
| `menclose` (`\cancel`, `\boxed`) | not in MathML Core |
| `mlabeledtr` (`\tag`) | not in MathML Core |
| table rules (`array` with `|`) | not in MathML Core |
| relative `mpadded` (`+0.8em`, `2width`) | Core takes plain lengths only; `\xrightarrow` uses them |
| wide accents and braces over a group | horizontal stretching needs the operator dictionary and a MATH font |
| mhchem | its arrows are private-use glyphs of its own font |

The decision is per formula: an HTML page in MathML mode can hold a few SVG formulas, each marked
with `data-math-svg` naming the reason. `tests/math-modes.html` shows 38 constructs side by side.

---

## 7. Word and PDF: from SVG to a placed image

`BuilderBase._mathToImages()` runs before `_resolveImages()` in the Word and PDF builders and calls
`MathCore.toImages()`: every placeholder becomes

```html
<img class="kelk-math-img" src="data:image/svg+xml;base64,…" width="…" height="…"
     data-depth="…" data-display="inline|block" data-omml="…">
```

inside `<p class="kelk-math-block">` for display formulas. From then on a formula is an image, and
ImageCore rasterizes it like any SVG when a PNG is needed.

**Size.** On a page MathJax sizes a formula in ex, so its size follows the x-height of the text
around it, not the font size. For Vazirmatn that makes formulas about 1.2× the em-based size.
`toImage()` measures the text font's x-height (`exRatio`) and applies the same factor, so a formula
in Word or PDF is the size it has in the preview.

**Sharpness.** The SVG is declared at 2× its display size and ImageCore rasterizes at 3×: about
576 dpi.

**Right-to-left `\text`.** An image cannot use the page's fonts. The font (from `KelkWebFonts`) is
embedded in the SVG as an `@font-face` data URI. Such a formula stays a PNG in `.docx` and `.pdf`.

**Tagged equations.** MathJax draws `\tag{1}` as a 100%-wide SVG with the number positioned in
percent. As an image that is 0×0. `toImage()` gives it the text column's width and a viewBox whose
units match the text size — the number lands at the end of the line.

---

## 8. `.docx`: Word equations

With `setMath({ word: 'native' })` (the default), each formula is **Word's own equation**:
`MathCore.toOmml()` converts MathJax's MathML to OMML, and DocxBuilder inserts it with docx.js's
`ImportedXmlComponent.fromXmlString(xml).root[0]` — the wrapper element must be unwrapped, or the
document gets an `<undefined>` element. The picture is only for what OMML cannot show (mhchem).

The converter maps: fractions (`noBar` for `\binom`), radicals, scripts, n-ary operators **with
their operand** (the next sibling becomes `m:e`), stretchy delimiters (`\left…\right`, `cases` as a
brace with an open end), matrices with column alignment (`right left` pairs kept tight), accents
(to combining characters), bars, braces (`m:groupChr`), arrows with labels (a stretching
`m:groupChr` — Word's own way), boxes and strikes (`m:borderBox`), letter styles (`m:scr`,
`m:sty`), color (`w:color` in the run).

### Things Word and docx.js do that are not documented

- **docx.js drops whitespace-only text.** Its XML import trims space-only text nodes, so a run
  holding a thin space (`\,`, `\ `) arrives empty — and Word shows `x^2dx`. Every space-only run
  gets a zero-width space (U+200B) appended; the importer strips it again.
- **Word lowers an inline picture twice as far as its run position says.** Measured on Word's own
  rendering: with `w:position` = −12 half-points (6 pt) the picture went down 16 px, i.e. 12 pt.
  The `.doc` form (`mso-text-raise`) behaves the same. `BuilderBase.WORD_PICTURE_LOWER = 0.5`
  compensates; LibreOffice ignores the lowering, which is why this never showed there.
- **A cell holding only a formula was empty.** The DocxBuilder check "has this group any content?"
  looked at text only. Images (and so formulas as images) now count.
- **The space before an inline formula vanished.** Block-edge trimming treated the text before a
  formula as the block's last text. It now stops at an image.

---

## 9. `.doc` (MHTML): Word's undocumented HTML form of equations

The `.doc` output is HTML read by Word. How Word stores an equation in HTML is not documented; we
took it from a page Word itself saved ("Save as Web Page"). An equation is a pair:

```html
<!--[if gte msEquation 12]><m:oMathPara><m:oMath>
  <i style='mso-bidi-font-style:normal'><span style='font-family:"Cambria Math",serif'><m:r>x</m:r></span></i>
  <span style='font-family:"Cambria Math",serif'><m:r><m:rPr><m:sty m:val="p"/></m:rPr>=</m:r></span>
  …
</m:oMath></m:oMathPara><![endif]--><![if !msEquation]><img …><![endif]>
```

- The `m:` elements are OMML, but in the namespace `http://schemas.microsoft.com/office/2004/12/omml`
  declared on `<html>` (Kelk's template already has it, and `m:mathPr` in `w:WordDocument`).
- **The run's text sits directly inside `<m:r>`** — there is no `<m:t>` — and the run is wrapped in
  HTML: a Cambria Math `<span>`, and `<i>` for an italic letter. `m:rPr` comes first inside `m:r`.
- The first comment is what Word reads; the downlevel-revealed `<![if !msEquation]>` is the picture
  every other reader shows.
- `<![if …]>` is not valid in a DOM. WordHtmlBuilder puts a marker comment in the DOM and swaps in
  the real markup after serialization (`_mathSlot`).

`MathCore.ommlToWordHtml()` turns the `.docx` OMML into this form, so both Word outputs share one
converter.

### Pictures in `.doc` (image mode, mhchem)

- **Spaces around a picture:** Word's BiDi moves the ordinary space next to an image to one side,
  gluing the formula to the next word. The spaces are moved **into** the picture's run as no-break
  spaces, one on each side — symmetric, so any reordering keeps one on each side.
- **Lowering:** `<span style="mso-text-raise:-Xpt">` around the picture (Word's run position).
  Adding CSS `position:relative;top` as well lowered it twice.
- **Display formulas are never lowered**, and the check must not depend on a class that a later
  step renames (a bug we had: the paragraph class became `MsoNormal` before the check ran).

---

## 10. PDF: vectors

`PdfBuilder` draws each formula's SVG with jsPDF's own operators (`svgToPdf`), so formulas stay
sharp at any zoom. MathJax's SVG with `fontCache: 'none'` holds only a handful of element types:

| SVG | PDF |
|---|---|
| `<g transform>` | a matrix stack (translate, scale, matrix, rotate, skew) |
| `<path d>` | `doc.path()` with M, L, C (Q, T, S, H, V converted; relative forms resolved) |
| `<rect>` | fraction bars, frames |
| `<line>` | table rules (stroke width scaled with the matrix) |
| nested `<svg>` | viewBox + preserveAspectRatio → matrix, **clipped** to its viewport (stretched glyphs) |
| `fill` / `stroke` / `color` | colors, `currentColor`, dashes |

A formula with `<text>` (right-to-left `\text`) is drawn as its PNG: jsPDF would not shape it.

Inline images (formulas, but also any inline image) are **atoms of the line**: the line grows to
hold them while the text keeps its baseline (`line.baseOff`), and a formula stands on the baseline
lowered by its depth. Display formulas are centered.

---

## 11. The way back: `MarkdownImporter`

Formulas are kept aside as tokens (`⟦KMATHn⟧`, letters only, so neither DOMPurify nor turndown
touches them) and written back as `$…$` / `$$…$$` at the end. Sources:

| Source | Where the TeX is |
|---|---|
| KaTeX (ChatGPT, Claude … pasted as rich text) | `<annotation encoding="application/x-tex">` |
| MathML (Wikipedia) | the TeX annotation, or `alttext` (`{\displaystyle …}` unwrapped) |
| MathJax 4 pages | `data-latex` |
| Kelk's HTML | `.kelk-math[data-tex]` |
| a Kelk formula picture | its `alt` (the TeX) |
| **Word equations in a `.docx`** | OMML, read from the zip before mammoth (below) |

The tokens must be placed **before** sanitizing: DOMPurify removes `semantics` and `annotation`
by design (`KEEP_CONTENT` would then leave the TeX as visible text — the formula twice).

### Word equations from `.docx`

mammoth drops OMML. The importer opens the `.docx` itself first: a small zip reader
(`DecompressionStream('deflate-raw')`), replaces each `m:oMathPara` / `m:oMath` in
`word/document.xml` with a run holding a token, writes the zip back (that entry stored, every other
entry copied byte for byte) and gives mammoth the result. `MathCore.ommlToTex()` converts the
equations — both Kelk's and what Word writes itself (`m:eqArr`, `m:func`, `m:box`, `m:sPre`, math
italic letters, symbols to commands). Matrices in brackets come back as `pmatrix` / `bmatrix`, a
brace with an open end as `cases`, `right left` column pairs as `aligned`, a trailing "(1)" as
`\tag{1}`.

`tests/math-file.html` renders every case through TeX → OMML → TeX and checks that it still parses.

---

## 12. Tests

| Page | What |
|---|---|
| `tests/math-file.html` | MathJax from `file://` with no network; MathCore render checks; OMML well-formedness; OMML → TeX round trip; importer sources |
| `tests/math-modes.html` | 38 constructs, SVG and MathML side by side, with the reasons for every SVG fallback |
| `tests/index.html` | all builders × the corpus, including `latex-formulas` in both HTML modes |

---

## 13. Known limits and ideas

- mhchem is a picture in Word and in MathML mode (private-use arrow glyphs); mapping them to
  Unicode arrows would make chemistry native too.
- Right-to-left `\text` is a PNG in PDF and in `.docx` image mode.
- `$$…$$` in the middle of a paragraph stays inline in Word and PDF.
- OMML ↔ TeX loses table rules (`array` with `|`), `\color`, `\label` / `\ref`.
- The MathJax folder is about 12 MB; unused font ranges (Braille, Cherokee …) could be pruned.
