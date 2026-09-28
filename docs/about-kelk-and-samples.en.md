# Kelk: from Markdown to a finished document — about and guide

This document does three things at once: it introduces Kelk, it is the guide to using it, and it is a test sample of everything Kelk can do. Every section can be seen in the preview and exported to all four formats; what you see in Word, Acrobat or a browser should be what you see here.

> 💡 **How to:** the book button in the Markdown panel reloads this document at any time, so feel free to edit it.

---

## 1. What is Kelk?

### 1.1 The name

**Kelk** (کِلک) is Persian for the reed pen — the pen of Persian calligraphy, and in classical poetry simply "the pen". Kelk is a pen for documents: it takes text as it is written today and makes a document that is correct, readable and familiar — including when the text runs right to left.

### 1.2 The anchor: Markdown, the common language of people and models

For a few years now, AI models have been used for far more than a quick question and answer: reports and drafts, summaries and analyses, teaching material, technical documentation, work inside organizations. Much of that work ends up as a **document**, and the language the models write in is Markdown: `#` for a heading, `**` for bold, lines of `|---|` for a table.

Even a simple question and answer can be kept that way: paste the model's answer, get a tidy document back.

### 1.3 Convergence: from raw text to a familiar document

Markdown was made for writing, not for sending. To most readers the raw text is strange: many people do not know that `**` means bold, `#` a heading, or what table the `|---|` lines build. **And they do not need to.** Most people know nothing about HTML, yet they open web pages many times a day — the browser hides the complexity. Kelk does the same for documents: it takes the Markdown syntax out of sight and delivers the formats everyone opens, edits and shares.

This is what usually gets sent:

```markdown
#### Weekly report — گزارش هفتگی
- **Status:** done ✓
- **Next:** review in *Word*

| Stage | Progress |
|---|---:|
| Design | 80% |
| Build | 35% |
```

and this is the same text, converted:

#### Weekly report — گزارش هفتگی

- **Status:** done ✓
- **Next:** review in *Word*

| Stage | Progress |
|---|---:|
| Design | 80% |
| Build | 35% |

Right-to-left text adds one more difficulty: **bidirectional text (BiDi)**. When English sits next to Persian, Arabic or Hebrew, numbers and words swap places, brackets flip, the final full stop jumps to the other end of the line, and lists and tables take the wrong direction. Kelk decides the direction of every paragraph, table cell and list item on its own, isolates the words that run the other way, and builds the document with real Word styles, so it stays editable.

Kelk was made first for Persian, and it works for every right-to-left language — Arabic, Hebrew, Urdu, Kurdish — and their mix with left-to-right text; it is just as good for purely left-to-right documents: English, French, German, Spanish, Greek, Russian and the rest.

### 1.4 The way back: from a document to Markdown

The road runs both ways. Kelk turns a Word file (.docx), an HTML page, or text copied from Word or the web into clean Markdown. Models answer in Markdown, and they read it best too: structured text without Word's formatting costs far fewer tokens, keeps headings, lists and tables, and is understood more precisely. The circle closes: document to Markdown, Markdown to the model, the model's answer back to a document.

> 💡 **How to:** drop a .docx or .html file on the Markdown panel, or pick it with the Import button. Rich text pasted from Word or a web page becomes Markdown by itself; paste plain text with `Ctrl+Shift+V`. After a conversion the MD button at the bottom of the panel turns solid, to save the Markdown.

---

## 2. Quick start

1. **Text:** write or paste Markdown, or import an md, docx or html file. Images can be dropped or pasted into the text too.
2. **Preview:** what the exports get, with the same directions.
3. **Settings:** open with the button at the side of the panel; the two buttons at its top expand or collapse all sections.
4. **File name:** change it in the name box under the preview before downloading. It starts as the imported file's name, the document title or the opening words; the export button sets the extension.
5. **Export:** press DOCX, PDF, DOC or HTML.

> 💡 **How to:** shortcuts — `Ctrl+S` saves the Markdown, `Ctrl+Enter` exports DOCX, `Ctrl+Shift+Enter` exports PDF, `F1` lists them all. Side-by-side or single-column layout and the light or dark theme are in the top bar.

### 2.1 Markdown and images

Kelk supports **GitHub Flavored Markdown** in full ([GFM spec](https://github.github.com/gfm/)): headings, nested and numbered lists, task lists, tables with column alignment, strikethrough, inline code and fenced code with a language, quotes, links and autolinks. Plain HTML inside the text is accepted too.

**Images** go into the text three ways:

- **Drop or paste** an image into the Markdown panel: Kelk registers it under a short name and inserts `![name](name)`; the image is kept in this browser and embedded in all four outputs.
- **A web address:** `![description](https://example.com/picture.png)`.
- **The logo:** in the Logo section of Settings, and in the text as `![logo](logo)`.

> ⚠️ **An image address must be reachable by this page:** a public web URL — not a local path (such as `C:\pictures\a.png`) and not a link behind a login or inside a private network. For pictures on your computer, drop them into the panel.

---

## 3. Outputs and import

| Format | Best for | Fonts | Note |
|---|---|---|---|
| **PDF** | sending, sharing, printing — the easiest | inside the file | looks the same everywhere |
| **DOCX** | editing in Word | must be installed | real Word styles; recommended for editing |
| **DOC** (MHTML) | a completely free header/footer | must be installed | Microsoft Word only |
| **HTML** | a standalone page for the web or an archive | inside the file | opens offline |
| **MD** | the text itself, to edit later or give a model | — | the MD button in the text panel |

- **PDF** comes from Kelk's own layout engine: Arabic-script shaping, diacritics, a table of contents with page numbers, and fonts embedded in the file. To simply send a document, PDF is the easiest.
- **DOCX** is a standard Word document. If the document will be edited, DOCX is the better choice.
- **DOC** is an MHTML file: a multipart format (like an .mht file or an e-mail) that keeps the document's HTML, its images and the header/footer part together in one file. Its custom header and footer allow more than the others, because free HTML is accepted. The file can be opened in a text editor such as VS Code and reviewed like HTML — not recommended for everyday users, only for those who know HTML and the structure of Microsoft Office documents.
- **HTML** is a standalone file: fonts, styles and images are inside it, so it opens offline and looks the same on any computer. Printed (from Chrome, for example) it gets page numbers.

> ⚠️ **DOC works with Microsoft Word only.** Save it as .docx (Save As) the first time it is opened.

> 💡 **How to:** with "Table of contents" on in Settings, Word computes the page numbers itself: in DOC and DOCX right-click the table → Update Field → Update entire table. DOCX also offers the update when it opens. In the PDF the numbers are there from the start.

---

## 4. Settings worth knowing

- **Title and edition** are automatic: the title comes from the first H1 or the opening words, the edition is "Draft". Change them or leave them empty on purpose; ↺ brings the automatic value back.
- **Header and footer:** structured (logo, title, edition; author and page numbers), simple, or custom HTML that starts from a sample.
- **Table of contents:** after the document title, with the heading levels you choose (H1, H1–H2, H1–H3).
- **Typography:** the PDF and page fonts are separate from the Word fonts. PDF and HTML carry their fonts and need nothing installed; a Word file only names its fonts, so they must be installed on the reader's computer.
- **Table width:** automatic (as the content needs, up to 100%) or a fixed share; column widths always follow the content.
- **Code:** the code font is Vazir Code, made for code with Persian and Arabic in it, which keeps the columns aligned.
- **Arabic:** Vazirmatn, the default font, covers Arabic too; Arabic fonts such as Cairo, Amiri or Noto Naskh Arabic can be prepared for the PDF (see *For developers*), and in Word any installed Arabic font works.

> 💡 **How to:** this document has numbered headings — turn on "Table of contents" in the Document section of Settings and export a PDF.

Everything happens in your browser: no text is sent to any server, and settings are kept in this browser only.

---

## 5. Offline, in-house, hosted

Kelk is a plain page; it needs no server and no installation:

- **On your computer:** download the zip package, unpack it and open `index.html`; it works offline, straight from `file://`, for personal use or inside a company network.
- **On a host:** upload the same folder to any static web host (GitHub Pages, an intranet web server).

---

## 6. Feature gallery

This section puts the hard cases side by side, to be checked in all four outputs.

### 6.1 Paragraphs and direction

#### A long English paragraph

This long English paragraph checks line breaking, word spacing and justification over several consecutive lines. Imagine a 48-page report of 12,500 words and 35 tables, drafted partly by a language model and partly by colleagues. Terms such as API, JSON and Word Style, versions like 2.4.1 and sizes like 4k or 3.5GHz appear again and again, and a Persian phrase such as «سند آماده» or a word like پیش‌نویس must keep its own right-to-left order without disturbing the sentence around it.

#### A long Persian paragraph — پاراگراف فارسی

در این پاراگراف فارسی، واژه‌هایی مانند API، JSON و Word Style، نسخه‌هایی مانند 2.4.1 و اندازه‌هایی مانند 4k و 3.5GHz میان متن می‌آیند و نباید ترتیب جمله را به هم بزنند. نیم‌فاصله‌ها در «می‌شود» و «پیش‌نویس» نباید جدا شوند و گیومه‌ها باید درست قرینه شوند.

#### Mixed lines

English text that ends with a Persian word پایان.

The CEO Message + Executive Summary draft (3 صفحه تا بازخورد) goes out first — the number is read with the Persian phrase.

Chapter 3 صفحه اول — here the 3 belongs to «Chapter» and stays with it.

The file «گزارش-نهایی.pdf» was 4.2 MB (compressed: 1.1 MB).

Numbers and signs: 45% growth, 3/4 done, -15 degrees, +20 points, 1,234.56 rials, 14:30.

### 6.2 Many scripts

**Persian — فارسی:** کِلک متن مارک‌داون را به سند Word و PDF تبدیل می‌کند.

**Arabic — العربية:** هٰذِهِ الأَدَاةُ تُحَوِّلُ نُصُوصَ «مارك داون» إِلَى مُسْتَنَدَاتِ Word وَ PDF، وَتَدْعَمُ الحَرَكَاتِ وَالأَرْقَامَ مِثْلَ 2026.

**Hebrew — עברית:** שלום עולם! זהו טקסט בעברית עם המספר 2026 ושם באנגלית Kelk. בְּרֵאשִׁית בָּרָא אֱלֹהִים (עם ניקוד).

**Urdu — اردو:** یہ ایک مثال ہے، جس میں انگریزی لفظ Kelk اور عدد 2026 بھی ہیں۔

**Left-to-right only:** French — « guillemets », œuvre, naïveté, 18 h 30 ; German — Größe, Übung, Straße; Spanish — ¿Dónde está? ¡Qué bien!; Greek — Καλημέρα κόσμε; Russian — Привет, мир.

**Mixed line:** Hello سلام مرحبا שלום Γειά Bonjour Hola Hallo — six languages in one line.

### 6.3 Digits: three shapes, one system

Latin, Arabic and Persian digits are three shapes of **one** system, the Hindu–Arabic numeral system; only the symbols differ:

| Shape | Digits | Name | Unicode |
|---|---|---|---|
| Latin | 0123456789 | Western Arabic numerals | U+0030–0039 (ASCII) |
| Arabic | ٠١٢٣٤٥٦٧٨٩ | Eastern Arabic (Arabic-Indic) | U+0660–0669 |
| Persian | ۰۱۲۳۴۵۶۷۸۹ | Extended Arabic-Indic | U+06F0–06F9 |

The Persian digits are a variant of the Eastern family with code points of their own; Persian ۴ ۵ ۶ are shaped differently from Arabic ٤ ٥ ٦. The family has more members, such as the Devanagari (U+0966–096F) and Bengali digits. All three shapes in one line: 2026, ٢٠٢٦, ۲۰۲۶; and 1,234.5 = ١٬٢٣٤٫٥ = ۱٬۲۳۴٫۵.

In the PDF each shape is drawn with a font that has it: Vazirmatn, the default, has all three.

### 6.4 Math with Greek letters

- Circle area: A = π r²
- Euler's identity: e^(iπ) + 1 = 0
- Sum: ∑ (i=1 → n) i = n(n+1)/2
- Integral: ∫₀^∞ e^(−x²) dx = √π / 2
- In Persian — مجموع: ∑ (i=1 → n) i = n(n+1)/2
- Sets: A ∩ B ⊆ A ∪ B, x ∈ ℝ, ∀ε > 0 ∃δ > 0

### 6.5 Symbols and emoji

A browser finds another font by itself when a character is missing, and Word on Windows draws emoji with Segoe UI Emoji. A PDF has no such help: every character must come from a font embedded in the file. So Kelk embeds two helper fonts: DejaVu Sans for text symbols and Noto Emoji for emoji (monochrome in the PDF).

Status: ✓ done → next, ✗ failed, ☐ open, ☑ closed, ★ starred, ⚠ warning, ← ↑ ↓ ↔, ① ② ③, ░▒▓█.

Emoji: 👍 👍🏽 👨‍👩‍👧 🏳️‍🌈 🇮🇷 🇩🇪 1️⃣ in English text, and 😀 🚀 ✅ در متن فارسی.

**Bold ✓ 😀**, *italic ✓ 😀*, ***both ✓ 😀***.

### 6.6 Tables

| Right (---:) | Center (:---:) | Left (:---) | Default (---) |
|---:|:---:|:---|---|
| English text | English text | English text | English text |
| متن فارسی | متن فارسی | متن فارسی | متن فارسی |
| 1,234,567 | 1,234,567 | 1,234,567 | 1,234,567 |

| # | Output | Description |
|---|---|---|
| 1 | DOCX | A standard Word document with real styles: headings, quotes, multi-level lists and tables; header and footer with logo, title, edition and page numbers. This cell is long on purpose, to check wrapping inside a cell. |
| 2 | PDF | موتور چیدمان خود کِلک: شکل‌دهی حروف، حرکت‌گذاری و قلم‌های جاسازی‌شده. |
| 3 | HTML | One standalone file. |

### 6.7 Lists

- The first item is written long on purpose, to check line breaking inside a list item: the second and third lines must align with the text, not with the bullet.
- مورد دوم فارسی است و علامت و تورفتگی آن سمت راست است.
  - English sub-item under a Persian item
  - زیرمورد فارسی
    1. level three, one
    2. سطح سوم، دو
- Third item with 4k and ✓

1. Write the text
2. متن را در کِلک بچسبانید
   1. Check the preview
   2. خروجی بگیرید
3. Send the document

- [x] Draft with a model
- [x] پیش‌نمایش را ببینید
- [ ] Review in Word

### 6.8 Quotes

> This is an English quote with a Persian phrase «سند آماده» inside it.

> نقل‌قول فارسی در سند انگلیسی: پیش از فرستادن، سند را یک بار باز کنید.

> A quote with a list:
> - item one
> - مورد دوم
>
> > A nested quote with **bold text** and `inline code`.

### 6.9 Code

Inline code in English text: `value = 2`, and in Persian `متغیر = 1`.

```js
// A comment in English — توضیح فارسی: جمع دو عدد
function add(a, b) {
  const msg = "سلام دنیا";
  return a + b;
}
```

```
┌──────┬────────┐
│ key  │ 42     │
├──────┼────────┤
│ name │ مقدار  │
└──────┴────────┘
```

````md
Documentation with a nested code block:

```python
def greet(name):
    return f"Hello {name}"
```
````

### 6.10 Images and links

![Kelk logo — نشان کِلک][kelk-logo]

Links: [CommonMark](https://commonmark.org) and [GitHub Flavored Markdown](https://github.github.com/gfm/).

---

## 7. For developers

Kelk's core, the `lib` folder, is a standalone library that works in any web project without this page: four builders with one shared API — `WordHtmlBuilder` (.doc), `DocxBuilder` (.docx), `PdfBuilder` (.pdf) and `HtmlBuilder` (.html) — plus `BidiCore` (every direction decision) and `MarkdownImporter` (the way back).

```js
const blob = await PdfBuilder.create()
    .registerFonts(window.PdfFonts)
    .configure({ fonts: { bidi: 'Vazirmatn', latin: 'Vazirmatn' }, toc: { levels: 2 } })
    .addFromHtml(html)
    .toBlob();
```

- **Fonts:** the PDF is not limited to the fonts that come with Kelk — for text, emoji, code or any other role, any font can be prepared with `tools/build_pdf_fonts.py`, as long as its owner's license allows it. Web fonts for the HTML output are added the same way (one base64 file).
- **Details:** load order, every builder's API and more in `lib/README.md`.

---

## 8. What to check

- **Direction:** mixed paragraphs, numbers and brackets, nested Persian and English lists, tables and quotes look in all four outputs as in the preview.
- **Word:** the styles (Heading, Quote, List Paragraph, TOC) appear in the style gallery, and the table of contents stays right-to-left in right-to-left documents after "Update entire table".
- **PDF:** text can be selected and searched in Acrobat, diacritics sit on their letters, and the table of contents links work.
- **HTML:** the file opens the same way offline and on another computer.

---

## 9. In memory of Saber Rastikerdar

Three of Kelk's fonts — Vazirmatn, Vazir Code and Sahel — are the work of the late [Saber Rastikerdar](https://github.com/rastikerdar), whose free and open fonts have made Persian text readable on the web, in software and in documents for years. May his memory be honoured.

End of document. ✓

[kelk-logo]: data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNDAgODAiIHdpZHRoPSIyNDAiIGhlaWdodD0iODAiPjxyZWN0IHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgcng9IjE4IiBmaWxsPSIjMWY2ZjVjIi8+PHBhdGggZD0iTTIyIDYwIEw1MiAyMCBMNjIgMjggTDMyIDY4IFoiIGZpbGw9IiNmZmYiLz48cGF0aCBkPSJNMjIgNjAgTDE3IDcyIEwzMiA2OCBaIiBmaWxsPSIjZmZmIiBvcGFjaXR5PSIuNyIvPjx0ZXh0IHg9IjEwMCIgeT0iNTIiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjM0IiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjMWY2ZjVjIj5LZWxrPC90ZXh0Pjwvc3ZnPgo=
