// Test corpus: each case = { name, md, setup? } ; setup(builder) customizes.
var CORPUS = [
  { name: 'rtl-basic', md:
`# عنوان اصلی سند

این یک پاراگراف فارسی ساده است که **بخش پررنگ** و *بخش مورب* دارد.

پشتیبانی از 4k و 3.5GHz و USB3 در متن فارسی.

نام سامانه BPMS (Business Process) است و «JAM» هم هست.

این جمله با یک کلمه انگلیسی تمام می‌شود Future.

This paragraph is purely English, with a Persian comma، here.

## بخش دوم
متن اول<br>متن دوم بعد از شکست خط
` },

  { name: 'ltr-basic', md:
`# Document Title

A plain English paragraph with **bold** and *italic* and \`inline code\`.

Second paragraph with a [link](https://example.com/page) and org's name.

| Name | Value |
|------|------:|
| alpha | 1,234 |
| beta | 98.6% |
` },

  { name: 'mixed-lists', md:
`- مورد اول فهرست
- Second item in English
  - زیرمورد فارسی
  - English sub item
    1. شماره یک
    2. number two
- مورد سوم با 4k

1. English only
2. Still English
   - nested bullet

3. Loose item paragraph one

   Loose item paragraph two

- [ ] task open
- [x] task done
` },

  { name: 'tables', md:
`| نام | مقدار | توضیح |
|:---|:---:|---:|
| الف | 1,234 | متن فارسی |
| ب | 98.6% | English note |
| ج | 2024-01-15 | ترکیبی BPMS |

| Col A | Col B |
|-------|-------|
| a1 | b1 |

| Col C | Col D |
|-------|-------|
| c1 | d1 |
` },

  { name: 'quotes', md:
`> نقل‌قول ساده فارسی در یک پاراگراف.

> نقل‌قول دوم بلافاصله بعد.

> This is an English quote in an RTL doc.

> نقل‌قول پیچیده با فهرست:
> - مورد یک
> - مورد دو
>
> > نقل‌قول تودرتو
>
> پاراگراف پایانی.

> خط اول
> خط دوم در همان پاراگراف
>
> پاراگراف دوم نقل‌قول
` },

  { name: 'code', md:
`متن پیش از کد.

\`\`\`js
function test(a, b) {
	// توضیح فارسی
	return a + b; // sum
}
\`\`\`

---

متن پس از کد با \`code\` درون خط.
` },

  { name: 'starts-with-table', md:
`| x | y |
|---|---|
| 1 | 2 |

پایان.
` },

  { name: 'header-footer-structured', md: `متن ساده.`,
    setup: function (b) {
      b.setHeader({ logo: 'لوگو', title: 'عنوان سند', edition: 'نسخه 1' })
       .setFooter({ author: 'مرکز فناوری اطلاعات', link: 'https://example.com',
                    pagingLabels: { page: 'صفحه', from: 'از' } });
    } },

  { name: 'header-footer-simple-ltr', md: `Plain text.`,
    setup: function (b) {
      b.setHeader('Simple Title').setFooter(true)
       .setFonts({ bidi: 'Vazirmatn' }).setFontSizes({ latin: 11, bidi: 12 })
       .setPage({ size: 'A4', orientation: 'landscape', margin: '2cm' });
    } },

  { name: 'forced-ltr-on-rtl', md: `متن فارسی با setDirection.`,
    setup: function (b) { b.setDirection('ltr'); } }
];
if (typeof module !== 'undefined') module.exports = CORPUS;
CORPUS.push(
  { name: 'stress-ltr-doc-rtl-quote', md:
`An English document.

> نقل‌قول فارسی در سند انگلیسی with English words.

| A | B |
|---|---|
| متن | 12 |
| text | 34 |

- item with Persian comma، only
  - nested English
` },
  { name: 'stress-nested', md:
`- مورد با پاراگراف

  English paragraph inside RTL item.

  > quote inside list item

- second

> ## Heading in quote
> متن و (parenthesis with English) و "quoted English" پایان.
> - list in quote with 4-bit and 1,000mAh
`,
    setup: function (b) { b.setStyles({ endPunctuation: ['.', '?', '!'] }); } }
);
CORPUS.push(
  { name: 'adjacent-boxes', md:
`> **محدودیت‌های گزارش:**
> - برخی مطالعات محدود بودند
> - گزارش‌های ناقص

> **پیشنهاد برای ادامه‌ی پژوهش:**
> برای دستیابی به نتایج بهتر

| الف | ب |
|---|---|
| 1 | 2 |

> نقل‌قول ساده پس از جدول

\`\`\`
code one
\`\`\`

\`\`\`
code two
\`\`\`

| x | y |
|---|---|
| 3 | 4 |

> چند پاراگراف در یک نقل‌قول
>
> پاراگراف دوم همان نقل‌قول
` },
  { name: 'mixed-dir-quote', md:
`متن سند.

> نکته مهم: ارزیابی باید مطابق با استانداردهای تعیین شده انجام شود.
> Important note: Evaluation must be performed according to defined standards.
` }
);
CORPUS.push({ name: 'mixed-dir-quote-br', html:
'<p>متن سند.</p><blockquote>\n<p>نکته مهم: ارزیابی باید مطابق با استانداردهای تعیین شده انجام شود.<br>Important note: Evaluation must be performed according to defined standards.</p>\n</blockquote>' });
CORPUS.push(
  { name: 'hf-ltrdoc-default', md: `An English technical report.`,
    setup: function (b) {
      b.setHeader({ logo: 'لوگو', title: 'گزارش فنی ایزو 2000 ISO 2000', edition: 'v1.2' })
       .setFooter({ author: 'مرکز فناوری اطلاعات', link: 'https://example.com' });
    } },
  { name: 'hf-ltrdoc-ltr', md: `An English technical report.`,
    setup: function (b) {
      b.setHeaderFooterDirection('ltr')
       .setHeader({ logo: 'Logo', title: 'Technical Report ISO 2000', edition: 'v1.2' })
       .setFooter({ author: 'IT Center', link: 'https://example.com' });
    } },
  { name: 'hf-simple-default', md: `Plain English.`,
    setup: function (b) { b.setHeader('ISO 2000 Title').setFooter(true); } }
);

CORPUS.push({ name: 'nested-code', md: `متن آغاز.

\`\`\`\`md
نمونهٔ مستندات:

\`\`\`js
let a = 1;
\`\`\`
\`\`\`\`

> نقل‌قول با کد:
>
> \`\`\`js
> const x = 2;
> \`\`\`
>
> > نقل‌قول تودرتو با کد:
> >
> > \`\`\`
> > nested();
> > \`\`\`

1. گام اول با کد:

   \`\`\`bash
   npm install
   \`\`\`

   - زیرمورد با کد:

     \`\`\`
     deep();
     \`\`\`

2. گام دوم

- مورد فهرست
  > نقل‌قول در فهرست
  >
  > \`\`\`
  > inList();
  > \`\`\`

پایان.
` });
CORPUS.push({ name: 'list-boxes', md:
`1. گام با جدول:

   | الف | ب |
   |---|---|
   | 1 | 2 |

2. گام با نقل‌قول ساده:

   > نقل‌قول ساده در فهرست

3. English step

   \`\`\`
   ltr();
   \`\`\`
` });
(function(){
  var W = function(lang, cls, body){ return '<div class="code-block-wrapper"><div class="code-block-header"><span class="code-lang">'+lang+'</span><button class="code-copy-btn" type="button"><svg viewBox="0 0 24 24"><rect width="14" height="14"></rect></svg> <span>Copy</span></button></div><pre><code class="'+cls+'" dir="ltr">'+body+'</code></pre></div>'; };
  var JS = '<span class="hljs-keyword">function</span> <span class="hljs-title function_">sayHello</span>(<span class="hljs-params">name</span>) {\n  <span class="hljs-variable language_">console</span>.<span class="hljs-title function_">log</span>(<span class="hljs-string">`سلام <span class="hljs-subst">${name}</span>!`</span>);\n  <span class="hljs-keyword">return</span> <span class="hljs-literal">true</span>;\n}\n\n<span class="hljs-comment">// این یک تابع برای نمایش پیام سلام است</span>\n<span class="hljs-keyword">const</span> result = <span class="hljs-title function_">sayHello</span>(<span class="hljs-string">"علی"</span>);';
  var body =
    '<p>متن پیش از کد.</p>' + W('javascript', 'hljs language-javascript', JS) +
    '<pre><code class="language-c++">int main() { return 0; }\n</code></pre>' +
    '<pre><code class="language-plaintext">plain text\n</code></pre>' +
    '<pre><code>no class\n</code></pre>' +
    W('sql', 'hljs', 'SELECT 1;') +
    '<blockquote><p>نقل‌قول فارسی با کد:</p>' + W('bash', 'hljs language-bash', 'npm install') + '</blockquote>' +
    '<ul><li><p>مورد فارسی با کد</p>' + W('python', 'hljs language-python', 'print(1)') + '</li></ul>';
  CORPUS.push({ name: 'code-labels', html: body });
  CORPUS.push({ name: 'code-labels-off', html: body, setup: function (b) { b.setCodeBlockOptions({ showLanguage: false }); } });
  CORPUS.push({ name: 'code-labels-nofallback', html: body, setup: function (b) { b.setCodeBlockOptions({ fallbackLabel: '' }); } });
})();

CORPUS.push({ name: 'loose-ltr-list-in-rtl', html: `<p>یک پاراگراف فارسی در سند.</p>
<h3>1.2 Current shipped solution ("Mode 1" below)</h3>
<p>Implemented and working today in <code dir="ltr">App.converter</code>:</p>
<ul>
<li><p><strong><code dir="ltr">protectProblematicTables(root)</code></strong> — runs on the parsed DOM <em>before</em><br><code dir="ltr">cleanTableCells</code>, and flags a table when<br><code dir="ltr">table.rows.length === 0</code>. Each flagged table is replaced <strong>in the DOM</strong></p>
<p><strong>Why a plain text token:</strong> the sanitized DOM is later serialized to a string<br>unchanged, every time.</p>
<div class="code-block-wrapper"><div class="code-block-header"><span class="code-lang">code</span><button class="code-copy-btn" type="button"><span>Copy</span></button></div><pre><code class="hljs sql" dir="ltr"><span class="hljs-operator">&gt;</span> ⚠️ This table could not be converted
</code></pre></div></li>
<li><strong><code dir="ltr">convertBlockByBlock(html, turndownService)</code></strong> — last-resort safety net.<br>If the single call throws.
</li>
</ul>
<p>This document specifies a <strong>new, opt-in alternative</strong> to the raw-HTML<br>fallback.</p>
` });
CORPUS.push({ name: 'english-led-quote', html:
'<p>متن فارسی سند.</p><blockquote>\n<p>I\'ll send you 6 Persian sentences with «شد» and «می‌شود» and my English translation of each.<br>Focus only on: the passive structure (be + past participle), the correct past participle form, and whether <em>by</em> is needed.<br>For each: show my English, then the natural English, then explain the difference in Persian in one line.<br>Don\'t translate before I try.</p>\n</blockquote>' });
CORPUS.push({ name: 'symbol-fallback', md:
`# نمادها ✓ و ⚠️

وضعیت: ✓ انجام شد → مرحله بعد، ⚠️ هشدار، ☐ باز و ☑ بسته.

Status: ✓ done → next step, ⚠️ warning, ☐ open, ★ rated, ∑ ≠ ≤ α β.

**پررنگ ✓ bold ✓** و *مورب ✓ italic ✓* و \`کد ✓ code →\`.

- ✓ مورد تأییدشده
- ✗ مورد ردشده
- ⚠ مورد هشدار (با پرانتز ✓)

| وضعیت | نماد |
|---|---|
| انجام | ✓ |
| هشدار | ⚠️ |

\`\`\`
status = "✓ ok" → next
\`\`\`
`,
  setup: function (b) { b.setHeader({ logo: '✓', title: 'گزارش ✓ → نهایی', edition: 'v1 ⚠' }).setFooter(true); } });
CORPUS.push({ name: 'emoji', md:
`# ایموجی 🧭 و پنجره 🪟

متن فارسی با ایموجی 😀 و سه ایموجی پشت‌سرهم 😀🪟🧭 در میان متن، و ⚠️ هشدار و ⚠ متنی و ⚠︎ اجباری متنی.

English text with 😀, 🪟, 🧭, ⚠️ vs ⚠, ✏️ vs ✏, ☑️ vs ☑, ✓ and ✅ ❌ ⭐ ⚡.

Sequences: 👍🏽 👍 🇮🇷 🇩🇪 👨‍👩‍👧 1️⃣ 1⃣ #️⃣ 👁️‍🗨️ 👁‍🗨 ❤️‍🔥 🏴󠁧󠁢󠁥󠁮󠁧󠁿 unknown 🪟‍🧭.

Text stays text: © 2024 ™ #1 *note* 12:30 and a private-use char \uE000 here.

**پررنگ 😀** و *مورب 😀* و \`کد 😀 code\`.

- 😀 مورد اول
- مورد دوم 🇮🇷

| ستون | ایموجی |
|---|---|
| یک | 👍🏽 |
| two | 🧭🪟 |
`,
  setup: function (b) { b.setHeader({ logo: '🧭', title: 'گزارش 😀 ✓', edition: 'v1 ⚠️' }).setFooter(true); } });
CORPUS.push({ name: 'hebrew', md:
`متن فارسی سند با یک کلمهٔ عبری שלום در میان.

שלום עולם, זהו משפט בעברית עם מספר 2024 ושם English Name.

בְּרֵאשִׁית בָּרָא אֱלֹהִים (עם ניקוד).

| עמודה | ستون | Column |
|---|---|---|
| טקסט | متن | text |

> ציטוט בעברית בתוך מסמך פרסי.

- פריט ברשימה
- مورد فارسی
` });
CORPUS.push({ name: 'hebrew-ltr-doc', md:
`An English document with a Hebrew word שלום inside.

שלום עולם — a Hebrew-led line in an English document.
` });
CORPUS.push({ name: 'multiscript', md:
`سند فارسی با زبان‌های دیگر:

Привет, мир! Это русский текст.

Γειά σου Κόσμε, ελληνικό κείμενο.

Tiếng Việt có dấu: Xin chào thế giới.

Բարեւ աշխարհ — հայերեն.

გამარჯობა მსოფლიო — ქართული.

Zażółć gęślą jaźń — Polish, and 2×3 = 6.
` });
(function(){
  var md = '# کد با فونت هم‌عرض\n\n```js\n// توضیح فارسی: جمع دو عدد\nfunction add(a, b) {   // جمع\n  return a + b;        // خروجی\n}\nconst msg = "سلام دنیا";\n```\n\n```\n┌──────┬──────┐\n│ نام  │ مقدار │\n├──────┼──────┤\n│ key  │ 42   │\n└──────┴──────┘\n```\n\nکد درون‌خطی `متغیر = 1` و `value = 2` در متن.\n';
  CORPUS.push({ name: 'code-mono', md: md, setup: function (b) { b.setFonts({ code: 'DejaVu Sans Mono' }); } });
  CORPUS.push({ name: 'code-mono-docfont', md: md, setup: function (b) { b.setFonts({ code: 'DejaVu Sans Mono' }).setCodeBlockOptions({ rtlFont: 'document' }); } });
})();

CORPUS.push({ name: 'lists-direction', md: "# آزمون قواعد جهت فهرست\n\nاین سند عمداً فارسی است تا جهت سند RTL تشخیص داده شود.\n\n## مورد 1: متن زیرفهرست در تصمیم آیتم والد حساب می‌شود\n\nفهرست الف — آیتم انگلیسی با زیرآیتم فارسی (رفتار فعلی: آیتم دوم RTL می‌ماند):\n\n- مورد اول فارسی\n- Second item in English\n  - زیرمورد فارسی\n  - زیرمورد دوم\n- مورد سوم فارسی\n\nفهرست ب — همان ساختار، ولی زیرآیتم‌ها انگلیسی (کنترل: آیتم دوم LTR می‌شود):\n\n- مورد اول فارسی\n- Second item in English\n  - English sub item\n  - Another sub item\n- مورد سوم فارسی\n\nفهرست ج — فهرست شماره‌دار با آیتم انگلیسی که زیرفهرست مختلط دارد:\n\n1. گام نخست\n2. Configure the server\n   1. نصب بسته‌ها\n   2. Restart the service\n3. گام پایانی\n\n## مورد 2: یک ویرگول فارسی کل فهرست را RTL حساب می‌کند\n\nفهرست د — تمام انگلیسی (کنترل: کل درخت LTR، علامت‌ها سمت چپ):\n\n- Budget\n- 1,250,000\n- 2024 - 2025\n- Total\n\nفهرست هـ — همان فهرست، فقط یک ویرگول فارسی در آیتم اول (رفتار فعلی: آیتم‌های عددی RTL می‌شوند):\n\n- Budget، approved\n- 1,250,000\n- 2024 - 2025\n- Total\n\nفهرست و — به‌جای ویرگول، نقطه‌ویرگول و علامت سؤال فارسی:\n\n- Is it ready؟\n- 42\n- Done؛ closed\n" });
CORPUS.push({ name: 'box-edges', md: "متن آغاز.\n\n1. گام با کد در پایان:\n\n   ```\n   code in list\n   ```\n\n| الف | ب |\n|---|---|\n| 1 | 2 |\n\n- مورد با نقل‌قول در پایان\n\n  > نقل‌قول درون فهرست\n\n```\ncode after list\n```\n\n- مورد اول\n  - زیرمورد با کد:\n\n    ```\n    nested code\n    ```\n\n> نقل‌قول بلافاصله پس از فهرست تودرتو\n\n1. مورد با جدول:\n\n   | x | y |\n   |---|---|\n   | 3 | 4 |\n\n2. مورد دوم با کد:\n\n   ```\n   second\n   ```\n\nپایان.\n" });
CORPUS.push({ name: 'harakat', md: "زبانِ تازه را با زبانی که بلدی بشناس\n\n*زبانِ تازه را با زبانی که بلدی بشناس*\n\n**مُحَمَّدٌ رَسُولُ اللَّهِ و رَبِّ العالَمِین**\n\n***بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِیمِ***\n\nבְּרֵאשִׁית בָּרָא אֱלֹהִים\n", setup: function (b) { b.setFonts({ bidi: 'Sahel', latin: 'Sahel' }); } });
CORPUS.push({ name: 'nested-fence-frames', md: "متن آغاز.\n\n````md\nنمونهٔ مستندات:\n\n```js\nlet a = 1;\n```\n\nو یک بلوک دیگر:\n\n~~~~markdown\n# عنوان\n```py\nx = 1\n```\n~~~~\n````\n\nپایان.\n", setup: function (b) { b.setFonts({ code: 'DejaVu Sans Mono' }); } });
// LaTeX formulas: every case of math-cases.js (inline and display) inside Persian and English prose
(function () {
  if (typeof MATH_CASES === 'undefined') return;
  var md = '# فرمول‌ها — Formulas\n\n';
  MATH_CASES.forEach(function (c, i) {
    md += (i % 2 ? 'Case ' + (i + 1) + ' (' + c[1] + '): ' : 'مورد ' + (i + 1) + ' (' + c[1] + '): ') +
      (c[3] ? '\n\n$$\n' + c[2] + '\n$$\n\n' : '$' + c[2] + '$ پایان.\n\n');
  });
  CORPUS.push({ name: 'latex-formulas', md: md });
  CORPUS.push({ name: 'latex-formulas-mathml', md: md, setup: function (b) { b.setMath({ mode: 'mathml' }); } });
})();

// table styles (BuilderBase.setTableStyle): every lines option, every fill, the total row,
// dark and custom colors — an RTL table and an LTR table in RTL text in each case
(function () {
  const md = `جدول نمونه:

| ردیف | نام | مقدار |
|---|---|---:|
| 1 | آلفا | 1,234 |
| 2 | بتا | 98.6% |
| 3 | گاما | 42 |
| جمع | | 1,383 |

| Name | Value |
|------|------:|
| alpha | 1 |
| beta | 2 |
| Total | 3 |
`;
  [
    ['default', { }],                                                             // underline + header-stripes
    ['grid-header', { lines: 'grid', fill: 'header' }],
    ['grid-header-stripes', { lines: 'grid', fill: 'header-stripes' }],
    ['frame-header', { lines: 'frame', fill: 'header' }],
    ['underline-none-total', { lines: 'underline', fill: 'none', total: true }],
    ['horizontal-none-total', { lines: 'horizontal', fill: 'none', total: true }],
    ['vertical-stripes', { lines: 'vertical', fill: 'stripes' }],
    ['none-header-stripes-dark', { lines: 'none', fill: 'header-stripes', headerColor: '#1F3864', stripeColor: '#DDEBF7' }],
    ['grid-header-red-lines', { lines: 'grid', fill: 'header', headerColor: '#FCE4D6', borderColor: '#C00000', borderWidth: 1 }]
  ].forEach(function (c) {
    CORPUS.push({ name: 'table-style-' + c[0], md: md, setup: function (b) { b.setTableStyle(c[1]); } });
  });
})();

// code and quote colors (Settings → Code / Quotes: template options) — a dark language bar
CORPUS.push({ name: 'colors-code-quote', md:
`متن پیش از کد:

\`\`\`python
def total(rows):
    return sum(r["value"] for r in rows)   # جمع مقادیر
\`\`\`

> نقل‌قول با نوار ضخیم و رنگ دیگر.
>
> - با یک فهرست
> - و مورد دوم

> A left-to-right quote in the same style.
`, setup: function (b) {
  b.setTemplateOptions({ codeBlockBg: '#F7F9FC', codeHeaderBg: '#2F3B52', codeHeaderColor: '#E8E8E8',
                         codeBlockBorder: '1px solid #2F3B52', quoteBorderColor: '#2F5496', quoteBorderWidth: '5pt', quoteTextColor: '#1F3864' });
} });

// table cell directions (c.cells: every td/th in document order). A cell without letters — digits of
// any script, signs, empty — takes its table's direction; letters decide every other cell.
CORPUS.push({ name: 'table-dir-rtl-doc', md:
`ارقام در سه نوع جدول:

| شکل | ارقام | نام انگلیسی | یونیکد |
|---|---|---|---|
| لاتین | 0123456789 | Western Arabic numerals | U+0030–0039 (همان ASCII) |
| عربی | ٠١٢٣٤٥٦٧٨٩ | Eastern Arabic (Arabic-Indic) | U+0660–0669 |
| فارسی | ۰۱۲۳۴۵۶۷۸۹ | Extended Arabic-Indic | U+06F0–06F9 |

| ردیف | مبلغ | تاریخ |
|---|---:|---|
| 1 | ۱٬۲۳۴ | ۱۴۰۵/۰۷/۰۹ |
| 2 | 98.6% | — |

| Item | Value | Date |
|---|---:|---|
| alpha | ۱۲ | 2026-10-01 |
| beta | 1,234 | |
`, cells: [
  'rtl', 'rtl', 'rtl', 'rtl',
  'rtl', 'rtl', 'ltr', 'ltr',       // "U+0030–0039 (همان ASCII)": LTR-led, mostly Latin letters
  'rtl', 'rtl', 'ltr', 'ltr',
  'rtl', 'rtl', 'ltr', 'ltr',
  'rtl', 'rtl', 'rtl',  'rtl', 'rtl', 'rtl',  'rtl', 'rtl', 'rtl',
  'ltr', 'ltr', 'ltr',  'ltr', 'ltr', 'ltr',  'ltr', 'ltr', 'ltr'
] });
CORPUS.push({ name: 'table-dir-ltr-doc', md:
`Digits in an English document:

| Name | نام | Amount |
|---|---|---:|
| alpha | آلفا | ۱۲ |
| 12 | ۱۲ | 3.5% |

| Item | Value |
|---|---:|
| one | 1 |
`, cells: [
  'ltr', 'rtl', 'ltr',
  'ltr', 'rtl', 'ltr',
  'ltr', 'ltr', 'ltr',
  'ltr', 'ltr',  'ltr', 'ltr'
] });

// edge documents: only a table; a header-only (one-row) table — styled as a body row, no
// repeated header; a single line; inline code with RTL text and brackets (Word, PDF); a code
// block inside a list item (one frame in the .html export)
CORPUS.push({ name: 'only-table', md: '| نام | مقدار |\n|---|---:|\n| آلفا | 12 |\n| بتا | 3.5 |\n' });
CORPUS.push({ name: 'one-row-table', md: 'جدول یک‌سطری:\n\n| فقط | یک | سطر |\n|---|:---:|---|\n\n| One | row | only |\n|---|---|---|\n' });
CORPUS.push({ name: 'single-line', md: 'فقط یک سطر.' });
CORPUS.push({ name: 'code-span-rtl', md: 'تصویر را با `![نام](نام)` در متن می‌گذارد؛ نیز `(متن)` و `f({ a: \'متن فارسی\' })`.\n\nEnglish with `![name](نام)` too.\n' });
CORPUS.push({ name: 'code-in-list-item', md: '- مورد ششم:\n  ```javascript\n  // کد درون لیست\n  const array = [1, 2, 3];\n  ```\n' });

// ── P1.3 (bug B1): Arabic shaping round trip ─────────────────────────────────────────────────────
// Markdown → PDF → PdfImporter → the same words, exactly (`exact`: the PDF → MD cell needs 100% recall
// and order). Each letter in its four positions around beh: alone, final, initial, medial. U+0649 has
// presentation forms (FEEF FEF0 FBE8 FBE9); the other letters have none in Unicode: they keep their
// nominal glyph and their neighbours still join them. «covered»: a bundled font has the glyph
// (Vazirmatn: 063D 066E 066F 06D5); «uncovered»: no bundled font draws it (0620 063B 063C 063E 063F 06FA-06FC),
// so those letters are lost in the PDF whatever the shaping — red, listed in roundtrip.js KNOWN.
(function () {
  var L = function (cp) { return String.fromCharCode(cp); }, BEH = L(0x0628), NL = String.fromCharCode(10);
  var positions = function (cp) { var x = L(cp); return [x, BEH + x, x + BEH, BEH + x + BEH].join(' '); };
  // one paragraph per letter, no Latin label: each letter's shapes are checked alone (ؠ ػ-ؿ ٮ ٯ are strong RTL letters
  // in BidiCore since P1.3 — they had been placed as neutrals next to Latin text — but a label would still test the
  // bidi run order, not the shaping)
  var lines = function (cps) { return cps.map(positions).join(NL + NL); };
  var amk = L(0x0649);
  CORPUS.push({ name: 'shaping-alef-maksura', exact: true, md: '# ' + amk + BEH + amk + NL + NL + lines([0x0649]) + NL + NL +
    'ذهب موسى إلى المستشفى حتى المساء ' + amk + BEH + amk + BEH + ' ' + amk + amk + amk + NL });
  CORPUS.push({ name: 'shaping-no-forms-covered', exact: true, md: lines([0x063D, 0x066E, 0x066F, 0x06D5]) + NL });
  CORPUS.push({ name: 'shaping-no-forms-uncovered', exact: true, md: lines([0x0620, 0x063B, 0x063C, 0x063E, 0x063F, 0x06FA, 0x06FB, 0x06FC]) + NL });
})();

// ── P1.3b: PDF tables — rowspan (B2) and rows taller than a page (B3) ──────────────────────────
// Each cell holds one marker; `pdfCheck` (run by builder-suite.html on the PDF, pages read with
// pdf.js) asserts that every body marker of a column starts at the same x as the others of that
// column — the left edge in a left-to-right table, the right edge in a right-to-left one — so text
// sits in the column its lines are drawn for. The tall-row cases assert the row is split across
// pages: more than one page, every marker found, no text in a page's top or bottom margin, no page
// left half empty before the last.
(function () {
  /** markers (cell text) → expected column; side: the edge cells start at ('left' | 'right') */
  function columnCheck(side, cols) {
    return function (pages) {
      const at = {};
      pages.forEach(function (p) {
        p.items.forEach(function (it) { const t = it.str.trim(); if (cols[t] !== undefined && !at[t]) at[t] = it; });
      });
      const errs = [], edge = {};
      Object.keys(cols).forEach(function (m) {
        const it = at[m];
        if (!it) { errs.push(m + ' not found'); return; }
        const x = side === 'left' ? it.x : it.x + it.w;
        (edge[cols[m]] = edge[cols[m]] || []).push({ m: m, x: x });
      });
      const firsts = [];
      Object.keys(edge).forEach(function (k) {
        const xs = edge[k], x0 = xs[0].x;
        xs.forEach(function (e) { if (Math.abs(e.x - x0) > 1.5) errs.push(e.m + ' at ' + e.x.toFixed(1) + ', column ' + k + ' at ' + x0.toFixed(1)); });
        firsts.push(x0);
      });
      firsts.sort(function (a, z) { return a - z; });
      for (let i = 1; i < firsts.length; i++) if (firsts[i] - firsts[i - 1] < 5) errs.push('two columns start at the same x');
      return errs;
    };
  }
  /**
   * a table split across pages: more than one page, every marker found, all text inside the page's
   * margins (no baseline in the 1.8 cm bottom / top margin, 45 pt allowing for descenders), and every
   * page but the last filled down to its last 100 pt (a split never leaves half a page empty)
   */
  function splitCheck(markers) {
    const M = 45, FULL = 100 + 51;
    return function (pages) {
      const errs = [], seen = {};
      if (pages.length < 2) errs.push('one page: the tall row was not split');
      pages.forEach(function (p, i) {
        let low = p.height;
        p.items.forEach(function (it) {
          seen[it.str.trim()] = true;
          if (!it.str.trim()) return;
          low = Math.min(low, it.y);
          if (it.y < M || it.y > p.height - M) errs.push('page ' + (i + 1) + ': "' + it.str.slice(0, 20) + '" in the margin or off the page (y ' + it.y.toFixed(0) + ')');
        });
        if (i < pages.length - 1 && low > FULL) errs.push('page ' + (i + 1) + ' ends early (lowest text at y ' + low.toFixed(0) + ')');
      });
      markers.forEach(function (m) { if (!seen[m]) errs.push(m + ' not found'); });
      return errs.slice(0, 6);
    };
  }

  // rowspan in the first column (xa) and the last (xd); cells below them pushed along
  CORPUS.push({ name: 'table-rowspan-ltr', html: `<p>A table with cells joined across rows.</p>
<table>
<thead><tr><th>Col A</th><th>Col B</th><th>Col C</th><th>Col D</th></tr></thead>
<tbody>
<tr><td rowspan="2">xa</td><td>b1</td><td>c1</td><td>d1</td></tr>
<tr><td>b2</td><td>c2</td><td>d2</td></tr>
<tr><td>a3</td><td rowspan="3">xb</td><td>c3</td><td rowspan="2">xd</td></tr>
<tr><td>a4</td><td>c4</td></tr>
<tr><td>a5</td><td>c5</td><td>d5</td></tr>
</tbody>
</table>
<p>After the table.</p>`,
  pdfCheck: columnCheck('left', { xa: 0, a3: 0, a4: 0, a5: 0, b1: 1, b2: 1, xb: 1, c1: 2, c2: 2, c3: 2, c4: 2, c5: 2, d1: 3, d2: 3, xd: 3, d5: 3 }) });

  // rowspan + colspan: one cell over two rows and two columns; a tall spanning cell (its rows grow)
  CORPUS.push({ name: 'table-rowspan-colspan', html: `<p>Spans in both directions.</p>
<table>
<thead><tr><th>One</th><th>Two</th><th>Three</th><th>Four</th></tr></thead>
<tbody>
<tr><td rowspan="2" colspan="2">pq</td><td>c1</td><td>d1</td></tr>
<tr><td>c2</td><td>d2</td></tr>
<tr><td>a3</td><td>b3</td><td colspan="2">cd</td></tr>
<tr><td>a4</td><td rowspan="2">bz<br>second line<br>third line<br>fourth line<br>fifth line</td><td>c4</td><td>d4</td></tr>
<tr><td>a5</td><td>c5</td><td>d5</td></tr>
</tbody>
</table>`,
  pdfCheck: columnCheck('left', { pq: 0, a3: 0, a4: 0, a5: 0, b3: 1, bz: 1, c1: 2, c2: 2, cd: 2, c4: 2, c5: 2, d1: 3, d2: 3, d4: 3, d5: 3 }) });

  // a right-to-left table: rowspan in its first column (on the right) and its last (on the left)
  CORPUS.push({ name: 'table-rowspan-rtl', html: `<p>جدولی فارسی که خانه‌هایش در چند سطر به هم پیوسته‌اند.</p>
<table>
<thead><tr><th>ستون یک</th><th>ستون دو</th><th>ستون سه</th></tr></thead>
<tbody>
<tr><td rowspan="2">۱۱</td><td>۱۲</td><td rowspan="3">۱۳</td></tr>
<tr><td>۲۲</td></tr>
<tr><td>۳۱</td><td>۳۲</td></tr>
<tr><td>۴۱</td><td>۴۲</td><td>۴۳</td></tr>
</tbody>
</table>
<p>پس از جدول.</p>`,
  pdfCheck: columnCheck('right', { '۱۱': 0, '۳۱': 0, '۴۱': 0, '۱۲': 1, '۲۲': 1, '۳۲': 1, '۴۲': 1, '۱۳': 2, '۴۳': 2 }) });

  // a row taller than a page (B3): split between its lines; the header repeats on the next page
  const many = function (n, word) { return Array.from({ length: n }, function (x, i) { return word + ' ' + (i + 1); }).join('<br>'); };
  CORPUS.push({ name: 'table-tall-row', html: `<p>A table row taller than a page.</p>
<table>
<thead><tr><th>Item</th><th>Notes</th></tr></thead>
<tbody>
<tr><td>first</td><td>short</td></tr>
<tr><td>tallrow</td><td>${many(90, 'line')}<br>lastline</td></tr>
<tr><td>after</td><td>end</td></tr>
</tbody>
</table>
<p>After the table.</p>`, pdfCheck: splitCheck(['first', 'tallrow', 'lastline', 'after', 'end']) });

  // a rowspan group taller than a page in a right-to-left table: split between its rows
  CORPUS.push({ name: 'table-tall-rowspan-rtl', html: `<p>جدولی با گروهی از سطرها که از یک صفحه بلندتر است.</p>
<table>
<thead><tr><th>بخش</th><th>شرح</th></tr></thead>
<tbody>
<tr><td rowspan="3">گروه</td><td>${many(30, 'سطر')}</td></tr>
<tr><td>${many(30, 'بند')}</td></tr>
<tr><td>${many(30, 'خط')}</td></tr>
<tr><td>پایان</td><td>آخر</td></tr>
</tbody>
</table>`, pdfCheck: splitCheck([]) });

  // a tall row whose cells have different line pitches (text in one column, a 17 px image on every line
  // of the other): no break falls between lines of both, so each cell breaks at its own last fitting line.
  // The picture column holds no words between its first and last line, so the round trip's word order
  // reads the text column alone (two worded columns split over pages read back page by page).
  const dot = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  CORPUS.push({ name: 'table-tall-misaligned', html: `<p>A tall row whose columns have different line heights.</p>
<table>
<thead><tr><th>Text</th><th>Pictures</th></tr></thead>
<tbody>
<tr><td>${many(80, 'plain')}</td><td>imgtop<br>${Array.from({ length: 60 }, function () { return '<img src="' + dot + '" width="10" height="17" alt="">'; }).join('<br>')}<br>imgend</td></tr>
<tr><td>after</td><td>z</td></tr>
</tbody>
</table>`, pdfCheck: splitCheck(['imgtop', 'imgend', 'after']) });

  // rowspan="0": the cell spans to the end of its section (HTML), so the cells below it move along
  CORPUS.push({ name: 'table-rowspan-zero', html: `<p>A cell spanning to the end of its section.</p>
<table>
<thead><tr><th>Left</th><th>Right</th></tr></thead>
<tbody>
<tr><td rowspan="0">zz</td><td>r1</td></tr>
<tr><td>r2</td></tr>
<tr><td>r3</td></tr>
</tbody>
</table>`, pdfCheck: columnCheck('left', { zz: 0, r1: 1, r2: 1, r3: 1 }) });
})();
