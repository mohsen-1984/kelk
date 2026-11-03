# Slides: Markdown → PowerPoint (`PptxBuilder`)

`PptxBuilder` turns plain GitHub Flavored Markdown into an **editable PowerPoint deck** (.pptx), in the
browser. It reads the same HTML as the other builders (marked's output, MathCore placeholders), so a
document needs no second format: a slide convention on top of GFM decides where slides begin and how
each is laid out. Everything here stays valid GFM — on GitHub the file reads as an ordinary document.

Why Markdown and not HTML: AI models write Markdown cleanly and consistently, the file reads without a
converter, and its few block types are exactly what slides need. Free HTML (positions, flex, grid,
gradients) has no faithful PowerPoint equivalent; a fixed vocabulary does.

## 1. Where slides begin

| Markdown | Slide |
|---|---|
| front matter `---` … `---` at the very top | the deck's settings (§5) |
| the first `#` | the **title slide**; the paragraphs under it are its subtitle lines; a picture under it (`![Logo](…)`, an SVG too) is its **logo**, over the title |
| a later `#` | a **section slide** (numbered 01, 02 …) and a **PowerPoint section** (the slide sorter groups by it); the **last** `#` of the deck is the closing slide |
| `##` | a **content slide**; the heading is its title |
| `###` | a column heading (two or three of them make columns) |
| `---` between slides | not needed, and ignored |

## 2. What goes on a slide

| Markdown | On the slide |
|---|---|
| paragraphs, lists (2 levels), numbered lists | text; numbers stay Latin digits; bullets on the side of the text's direction |
| `- **Label** — detail` | a **lead item**: cards, steps, stats, timelines and diagrams are built from them (`—`, `–`, `-`, `:` all separate) |
| `- :rocket: **Label** — detail` | an **icon** before the label: any [Lucide](https://lucide.dev/icons) name, drawn white in a colored circle (a picture) |
| `- 🚀 **Label** — detail` | an **emoji** instead of an icon (text: PowerPoint draws it in color) |
| a table | a native table; header row in the primary color; in a right-to-left deck the first column on the right |
| `<!-- chart: column -->` right before a table | a **native chart** (§4) |
| `![description](url)` | a picture; next to a list it stands beside the text; `placeholder` (or an address that cannot be read) draws an image frame with the description |
| `> quote` | a quote slide when alone; a line starting with `—` is the speaker; a quote nested in it (`> >`) is shown as a muted inner quote — one level reads best |
| `> [!NOTE]` … (`TIP`, `IMPORTANT`, `WARNING`, `CAUTION`) | a **callout** at the bottom of the slide (GitHub alerts); one per slide |
| fenced code | a code box under its language (`python`, as the Word and PDF outputs label it), colored by highlight.js — as colored text runs, still editable; fences written inside a longer fence stay text; a block whose lines start in Persian or Arabic (a prompt) is right to left |
| code or a table inside a list item | left out, with a warning — put it after the list |
| `$$ … $$`, `$…$` | **PowerPoint's own equation** (OMML, editable in PowerPoint's equation editor), as in the Word output; programs that do not know them (LibreOffice, PowerPoint 2007) show the formula's picture — or, inline, its TeX. mhchem (`\ce{}`) stays a picture, or TeX inline (a warning says so) |
| `<!-- … -->` | **speaker notes** (any comment that is not a directive; several are joined) |

## 3. Layouts

Without a directive the layout follows the content (`autoLayout`, on by default):

| Content | Layout |
|---|---|
| one short paragraph alone (≤ 160 characters) | `statement` — large, centered |
| a quote alone | `quote` |
| two or three `###` | `columns` |
| a numbered list of lead items (2–6) | `steps` |
| lead items that all have sub-items or icons (2–6) | `cards` |
| one picture or chart with a list or paragraphs | `image` — picture at the end side |
| lead items with icons | rows of icon, label and detail |
| anything else | `bullets` — the text flows; a long list or table continues on the next slide (`split`) |

A **directive** — a comment whose first word is `layout`, `slide`, `chart` or `diagram`, followed by a
colon — chooses explicitly. Flags are bare words, options `key=value`:

```markdown
## How it grew
<!-- layout: timeline vertical highlight=3 -->
```

| `layout:` | From | Options |
|---|---|---|
| `bullets` | anything | — |
| `statement` | paragraphs | — |
| `cards` | lead items (sub-items, icons) | `cols=N` |
| `steps` | a list of lead items | — |
| `stats` | lead items whose label holds a number → big tiles; the rest beside them | `row`, `column` |
| `timeline` | lead items: label = date (first word large), detail = event; a paragraph after it is a caption | `horizontal`, `vertical`, `highlight=N` — automatic: vertical above 6 items or with long text (`slides.timeline` sets the default) |
| `agenda` | a list — or **nothing**: then the section titles (`#`) that follow, numbered | — |
| `columns` (`two-column`, `three-column`) | `###` headings, or the blocks split evenly | `cols=N` |
| `process` | lead items → chevrons with the detail under them | `vertical` |
| `cycle` | lead items around a circle, arrows from each to the next; details listed beside | — |
| `pyramid`, `funnel` | lead items, top first; details beside each level | — |
| `hierarchy` (`org`, `tree`) | a nested list → a tree (up to 4 levels) | — |
| `matrix` | four lead items, or four `###` | — |
| `venn` | two or three lead items; a paragraph after the list is what they share | — |
| `quote`, `image`, `table`, `chart` | as their names say | `image`: `full`, `start` |

A `statement` or `quote` directive on a slide that also holds a chart, table, list or picture would leave
them out: the layout then follows the content, with a warning.

`diagram: NAME` is the same as `layout: NAME`. An unknown name, or a misspelled directive (`layot:`),
gives a warning instead of becoming a note.

`slide:` — `bg=dark|light|soft|primary|accent|#RRGGBB`, `hidden` (kept in the file, skipped in the
show), `number=off`, `footer=off`.

## 4. Charts

```markdown
<!-- chart: column labels -->

| Model | Parameters (billions) |
|---|---|
| GPT-2 | 1.5 |
| GPT-3 | 175 |
```

The first column holds the categories, every other column with numbers is a series (its header the
series' name). Numbers may have separators, `%`, and Persian or Arabic-Indic digits. Types: `column`,
`bar` (horizontal), `line`, `area`, `pie`, `doughnut`, `radar`; flags `stacked`, `percent`, `labels`;
`title="…"`. The chart is PowerPoint's own (Edit Data opens its sheet in Excel). In a right-to-left
deck the first category stands on the right and horizontal bars grow to the left.

## 5. Front matter and settings

```markdown
---
title: AI Literacy
footer: AI literacy | a Kelk slides sample
dir: ltr
theme: corporate-blue
aspect: 16:9
presenter: …
tagline: …
classification: Internal
contact: hello@example.com
logo: https://… (or a data URI)
date: …
---
```

`title` (the file's title and the default footer), `footer` (`''` for none), `dir` (`rtl` | `ltr`;
otherwise from the text, BidiCore), `theme`, `primary` / `accent` (`#RRGGBB`), `aspect` (`16:9` | `4:3`),
`presenter` (a line "Presenter: …" on the title slide, the label in the deck's language — ارائه‌دهنده,
المقدِّم), `author` and `date` (a line under it), `tagline` (the brand line at the foot of the title and
closing slides), `logo` (a picture: on the title, section and closing slides, and at the end of every
title row, as a letterhead), `classification` (a small badge — «Internal», «محرمانه» — on every slide),
`contact` (a line on the closing slide), `bullet` (`•` `○` `▪` `❖` `➢` `✓` `❑` `–`, or disc, circle, square,
diamond, arrow, check, box, dash) and `decoration` (`steps` | `bar` | `none`: the mark beside the titles and
on the title slides; each theme has its own). The deck's own settings win over the builder's. In Kelk
they are the deck's defaults: Settings → Slides shows them, and a value picked there overrides them for
that document only.

`configure({ slides: { … } })`:

| Option | Default | |
|---|---|---|
| `theme` | `'modern-emerald'` | `modern-emerald`, `scholarly-blue`, `corporate-blue`, `tech-dark` (dark slides), `tech-warm`, `minimal-mono`, `ocean-teal`, `sunset-coral`, `forest-green`, `royal-purple` — 1.0's first names still work (`kelk`, `pasargad`, `ocean`, `graphite`) |
| `primary`, `accent` | `null` | `'#RRGGBB'` over the theme's |
| `titleStyle` | `'dark'` | title and section slides `dark` or `light` |
| `aspect` | `'16:9'` | or `'4:3'` |
| `size` | `'medium'` | body text `small`, `medium`, `large` |
| `minScale` | `0.7` | text shrinks to this before a warning |
| `numbers`, `sectionNumbers`, `notes` | `true` | slide numbers, 01/02 on sections, notes in the file |
| `decoration` | `'auto'` | `steps`, `bar`, `none` — `auto`: the theme's (Scholarly Blue and Forest Green: steps; Minimal Mono: none; the others: bar) |
| `bullet` | `'•'` | the list bullet (a second level takes `–` or `•`); a symbol other than • – is drawn in Segoe UI Symbol |
| `logo`, `logoSrc` | `'all'`, `null` | where the logo goes (`all`, `cover`, `none`); `logoSrc`: a logo when the deck names none |
| `sections` | `true` | PowerPoint sections: the slides before the first section under the deck's title, then one for each `#` |
| `codeLanguage` | `true` | the language over a code block (`configure({ codeBlock: { showLanguage, fallbackLabel } })` as for the other builders) |
| `equations` | `true` | formulas as PowerPoint equations (`false`: pictures only) |
| `footer` | `null` | `null` → the deck's title; `''` → none |
| `autoLayout`, `split` | `true` | layouts from the content; long lists (`maxBullets` 7 lines) and tables (`maxRows` 8) continue |
| `timeline` | `'auto'` | `horizontal`, `vertical` |
| `labels` | by language | `{ rtl: { continued, image, agenda, part, presenter, intro }, ar: {…}, ltr: {…} }` — `ar` for an Arabic deck |
| `icons` | — | `function (name) → the inner markup of a 24×24 SVG` (Kelk passes Lucide; without it `:name:` icons warn) |

Fonts come from `fonts` (`bidi`, `latin`, `code`) as for Word: PowerPoint names fonts, so they must be
installed where the deck is shown. Each run is split by script, so Persian/Arabic text takes the bidi
font and English the Latin font, each with its own language tag.

## 6. API

```js
const { html, meta } = PptxBuilder.markdownToHtml(md);      // front matter, marked (global), comments kept
const b = PptxBuilder.create()
    .configure({ fonts: { bidi: 'Vazirmatn', latin: 'Calibri', code: 'Consolas' },
                 slides: { theme: 'scholarly-blue', icons: name => lucideInnerSvg(name) } })
    .addFromHtml(html).setDeck(meta);

const model = await b.model();                              // the laid-out deck
el.innerHTML = PptxBuilder.previewHtml(model, { notesLabel: 'Speaker notes' });
PptxBuilder.markOverflow(el);                               // indexes of slides whose text overflows
const blob = await b.toBlob(model);                         // or toArrayBuffer(), toPptx() (PptxGenJS)
```

`addFromMarkdown(md)` does the first two steps at once. A sanitizer between marked and the builder
must keep `data-kelk-comment` (DOMPurify keeps `data-*` by default). `model.slides[i]`: `layout`,
`warn` (`{ code, arg }`, codes in `PptxBuilder.WARNINGS`), `notes`, `shapes`. Static:
`THEMES`, `LAYOUTS`, `CHARTS`, `frontMatter`, `protectComments`, `previewCss`.

**One model, two renderings.** Every slide is laid out once into positioned shapes (inches on a
10 × 5.625 or 10 × 7.5 slide, written left to right and mirrored for a right-to-left deck); the preview
and the .pptx are both drawn from it. Text is measured on a canvas in the bidi font and shrunk to fit.
Titles sit in real title placeholders (slide masters `KELK_TITLE`, `KELK_SECTION`, `KELK_CONTENT`).

## 7. Direction (BiDi) in PowerPoint

PowerPoint decides direction by run, not by paragraph alone: a neutral character (space, «», brackets,
dashes) inside an English (`en-US`) run is laid out left to right, and digits inside a Persian run are
drawn as Persian digits. So every run is split by script before it is written:

- right-to-left letters → the bidi font, the text's language (`fa-IR`, `ar-SA`, `he-IL`);
- Latin letters, and digits right after them (`GPT-3`, `Windows 11`) → the Latin font, `en-US`;
- other digits (with `. , : /` between them) → `en-US`, so they stay Latin digits;
- neutrals between two letters of one script join them (`Edit Data`, `text-to-image`); elsewhere they
  take the paragraph's side, so «Edit Data», (Histories) and `2012–2017` keep their places.

The classes are decided over the whole paragraph, so a bracket at the end of a bold run sees the
letters of the next one; a neutral piece takes its side's language (the paragraph's on the right-to-left
side). Each run also says its direction as PowerPoint stores it (`<a:rtl val="1"/>`), and each paragraph
keeps one `pPr` (PptxGenJS writes one per run). The theme's complex-script fonts are the bidi font, so
chart text and a new text box are not drawn in Times New Roman.

Speaker notes get the same treatment: each line is a paragraph with its own direction and alignment, in
the deck's fonts. Inline code keeps its text as one left-to-right run. A list keeps one direction — its
items' when they agree, the deck's when they are mixed.

## 8. The preview

`previewHtml(model, { eager: 2 })` draws the first two slides and leaves the others as empty boxes of the
right size (`data-lazy`); `previewSlide(model, i)` draws one when it comes into view (Kelk uses an
IntersectionObserver). `markOverflow(el)` accepts the whole preview or one `.kelk-slide`.

## 9. Limits

- Equations are drawn by PowerPoint (Cambria Math): their width can differ a little from the preview's.
- No animations or transitions; no speaker-notes formatting (plain text).
- Fonts are named, not embedded (PowerPoint's rule); the preview uses the page's fonts.
- Picture addresses must be readable by the page: a data URI, a registered name (Kelk's dropped and
  pasted images), or a URL that allows CORS.
- Text that still does not fit at `minScale` overflows — the preview marks it, a warning names it.

For AI models, Kelk's Settings → Slides copies this convention as a short English prompt.
