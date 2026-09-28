# Kelk — کِلک

**Markdown to Word, PDF and HTML — right-to-left first, entirely in your browser.**
Write or paste Markdown (an AI model's answer, notes, a report), see it, and export it as
**DOCX, PDF, DOC or HTML**; or bring a Word file or a web page back to Markdown.
Made first for Persian, and for every right-to-left language — Arabic, Hebrew, Urdu, Kurdish — and
their mix with left-to-right text; just as good for purely left-to-right documents.
Interface in English, Persian and Arabic.

[فارسی ↓](#fa)

![Kelk in English](docs/screenshots/kelk-en.png)

## Why

- **Markdown is how AI writes**, but raw Markdown is hard to read and awkward to send. Kelk hides
  the syntax and delivers the formats everyone opens, edits and shares.
- **Right-to-left text done right**: the direction of every paragraph, list item, quote and table
  cell; numbers, brackets, formulas and English words inside Persian or Arabic keep their order.
- **The way back**: .docx, HTML and rich text pasted from Word or the web become clean Markdown —
  fewer tokens and better structure for a model.
- **Private**: nothing leaves your browser. No server, no account, no installation.

## Outputs

| Format | Best for | Fonts |
|---|---|---|
| **PDF** | sending, sharing, printing — the easiest | embedded |
| **DOCX** | editing in Word (real Word styles) | must be installed on the reader's computer |
| **DOC** (MHTML) | a completely free-form header/footer; Microsoft Word only | must be installed |
| **HTML** | one standalone page: fonts, styles and images inside | embedded |
| **MD** | the text itself | — |

Also: a table of contents (with page numbers in the PDF), structured or custom header and footer
with a logo, automatic title and edition, Persian/Arabic/Latin fonts chosen apart for PDF and Word,
code blocks in Vazir Code, images dropped or pasted into the text.

![A PDF made by Kelk](docs/screenshots/kelk-pdf.png)

## Use it

- **Online:** open the published page (GitHub Pages).
- **On your computer:** download `kelk_1.0.zip`, unpack it and open `index.html` — it works offline,
  straight from `file://`, for personal use or inside a company network.
- **On your own host:** upload the folder to any static web host.

The about/guide document opens on the first visit (the book button reloads it), in the interface
language: [English](docs/about-kelk-and-samples.en.md) ·
[فارسی](docs/about-kelk-and-samples.fa.md) · [العربية](docs/about-kelk-and-samples.ar.md).

## For developers

`lib/` is a standalone library — four builders with one API (`WordHtmlBuilder`, `DocxBuilder`,
`PdfBuilder`, `HtmlBuilder`), `BidiCore` for every direction decision and `MarkdownImporter` for
the way back. See **[`lib/README.md`](lib/README.md)**.

```js
const pdf = await PdfBuilder.create()
    .registerFonts(window.PdfFonts)
    .configure({ fonts: { bidi: 'Vazirmatn', latin: 'Vazirmatn' }, toc: { levels: 2 } })
    .addFromHtml(marked.parse(markdown))
    .toBlob();
```

```text
index.html     the page            scripts/, styles/   the page's code (namespace window.Kelk)
lib/           the library         assets/             icons (generated) and web fonts
vendor/        third-party libraries (pinned versions; sources listed in index.html)
docs/          about + guide + samples (fa / en / ar) and screenshots
tests/         index.html — every test case through the four builders, in the browser
tools/         bidi-lab.html (every direction rule, with cases) · build_pdf_fonts.py (PDF fonts)
               build-icons.js · build-samples.js (Node)
```

## Credits and license

Kelk's code is under the **MIT License** ([`LICENSE`](LICENSE)). Libraries and fonts keep their
own licenses: [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
Vazirmatn, Vazir Code and Sahel are the work of the late
[Saber Rastikerdar](https://github.com/rastikerdar) — in his memory.

---

<a id="fa"></a>
<div dir="rtl">

## کِلک — فارسی

**مارک‌داون به Word، PDF و HTML؛ راست‌به‌چپ، کاملاً در مرورگر شما.**
مارک‌داون را بنویسید یا بچسبانید (پاسخ یک مدل هوش مصنوعی، یادداشت، گزارش)، ببینید و به
**DOCX، PDF، DOC یا HTML** خروجی بگیرید؛ یا فایل Word و صفحهٔ وب را به مارک‌داون برگردانید.
کِلک برای فارسی ساخته شده، برای همهٔ زبان‌های راست‌به‌چپ و آمیختهٔ آن‌ها با متن لاتین کار می‌کند
و برای سندهای کاملاً چپ‌به‌راست هم به همان خوبی. رابط کاربری به فارسی، انگلیسی و عربی است.

![کِلک به فارسی](docs/screenshots/kelk-fa.png)

### چرا کِلک؟

- **مدل‌ها به مارک‌داون می‌نویسند**، ولی متن خام مارک‌داون برای خواندن و فرستادن مناسب نیست. کِلک نحو آن را پنهان می‌کند و قالب‌هایی تحویل می‌دهد که همه باز می‌کنند، ویرایش می‌کنند و می‌فرستند.
- **راست‌به‌چپ درست:** جهت هر پاراگراف، آیتم فهرست، نقل‌قول و سلول جدول؛ عددها، پرانتزها، فرمول‌ها و واژه‌های انگلیسی میان متن فارسی یا عربی ترتیبشان را حفظ می‌کنند.
- **مسیر برعکس:** فایل docx، صفحهٔ HTML و متن کپی‌شده از Word یا وب به مارک‌داون تمیز تبدیل می‌شود؛ توکن کمتر و ساختار روشن‌تر برای مدل.
- **حریم خصوصی:** هیچ داده‌ای از مرورگر شما بیرون نمی‌رود؛ نه سرور، نه حساب کاربری، نه نصب.

### خروجی‌ها

- **PDF:** برای ارسال، اشتراک و چاپ؛ راحت‌ترین گزینه، با قلم‌های درون فایل.
- **DOCX:** برای ویرایش در Word، با سبک‌های واقعی Word؛ قلم‌ها باید روی رایانهٔ خواننده نصب باشند.
- **DOC** (MHTML): سربرگ و پانویس کاملاً آزاد؛ فقط Microsoft Word.
- **HTML:** یک صفحهٔ مستقل با قلم‌ها، سبک‌ها و تصویرهای درون فایل.

### استفاده

- **برخط:** صفحهٔ منتشرشده (GitHub Pages) را باز کنید.
- **روی رایانه:** `kelk_1.0.zip` را دریافت کنید، باز کنید و `index.html` را باز کنید؛ بدون اینترنت و مستقیم از `file://` کار می‌کند، برای استفادهٔ شخصی یا در شبکهٔ داخلی شرکت.
- **روی میزبان خودتان:** پوشه را روی هر میزبان وب ایستا بارگذاری کنید.

سند «معرفی و راهنما» در اولین بازدید به زبان رابط کاربری باز می‌شود و با دکمهٔ کتاب دوباره بارگذاری می‌شود.

### قدردانی و مجوز

کد کِلک با **مجوز MIT** منتشر شده است. کتابخانه‌ها و قلم‌ها مجوز خودشان را دارند (`THIRD-PARTY-NOTICES.md`).
Vazirmatn، Vazir Code و Sahel کار زنده‌یاد [صابر راستی‌کردار](https://github.com/rastikerdar) است؛ یادش گرامی.

</div>
