// A Persian article's back matter, as encyclopedias print it — the patterns of a Firefox print of a Persian
// encyclopedia article, rebuilt in Chromium with our own text:
//   · a table of contents: bold entries, dot leaders to a page number, a line's pitch apart (they ran together into
//     one paragraph, and were read as headings);
//   · references: a Persian one first, its number on the right, then Latin ones set left to right, their numbers on
//     the left (the second item was read as a nested list under the first);
//   · references with links whose text is the address, wrapped mid-address (a space was put into the address);
//   · a link's underline drawn long and clipped to the link, a little under the baseline (whole, it ran under the
//     neighbouring text and was read as a rule between paragraphs, cutting a reference);
//   · external links: Latin items of a right-to-left list, the «▪» marker at their right end (no list; each wrapped
//     line a paragraph of its own, read right to left);
//   · a page number in a circle halfway down the left margin, on every page (it stayed in the text), and a rule
//     down that margin (in the file that showed it, the rule made every page begin with a quote; here the rule
//     repeats on every page and goes as furniture first — the bar's own guard is kept by the private set).
//   corpus/fa-links.md → pdf/chrome-fa-links--fa-links.pdf
const { pdfPath } = require('./env.js');
const fs = require('fs'), path = require('path'), os = require('os');
const { KELK, req } = require('./env.js');
const { chromium } = req('playwright');
const LAB = path.join(__dirname, '..');
const WEB = 'file://' + KELK + '/assets/fonts/rastikerdar/webfonts/';

const toc = [['فصل اول: درآمد', '۱'], ['فصل دوم: منابع', '۲'], ['فصل سوم: پیوند به بیرون', '۳']];
const dots = '.'.repeat(60);
const U1 = 'https://example.org/history/numerals/indian-numerals-and-their-spread-to-the-west.html';
const U2 = 'https://archive.example.net/web/20070929/history-of-counting/indian-numerals-full-text.html';
const U3 = 'https://numbers.example.com/articles/2003/06/the-evolution-of-numbers-and-numerals.html';
const U4 = 'https://maths.example.edu/topics/hindu-arabic-numerals-in-medieval-europe.html';
const refs = [
  'فرهنگ اسلام در غرب، جلد یکم، صفحهٔ ۲۲۴.',
  'Ifrah, Georges. 1999. The Universal History of Numbers, Wiley.',
  `Smith, John and Mary Brown. 2000. <a href="${U1}">Indian Numerals (<span class="u">${U1}</span>)</a>`,
  `Archived copy of the history of counting systems: <a class="ul" href="${U2}">full text</a> retrieved in June 2019 from the archive.`,
];
const ext = [
  `<a href="${U3}">The Evolution of Numbers (<span class="u">${U3}</span>)</a>`,
  `<a href="${U4}">Hindu-Arabic numerals in medieval Europe (<span class="u">${U4}</span>)</a>`,
];
const pages = [
  `<h1>عددنویسی هندی-عربی</h1>
   <h2>فهرست</h2>
   ${toc.map(([t, n]) => `<p class="toc"><b>${t} ${dots} ${n}</b></p>`).join('\n')}
   <p>عددنویسی هندی-عربی دستگاهی برای نوشتن عددهاست که در هند پدید آمد و از راه سرزمین‌های اسلامی به اروپا رسید. این دستگاه بر پایهٔ ده رقم و ارزش مکانی است و امروز در بیشتر کشورهای جهان به کار می‌رود.</p>
   <p>در این نوشته، پیشینهٔ این دستگاه و راه رسیدن آن به اروپا به کوتاهی بازگفته می‌شود و در پایان، منابع و پیوندهای بیرونی برای خواندن بیشتر آمده است.</p>`,
  `<h2>منابع</h2>
   <p>فهرست زیر منابعی است که در نوشتن این مقاله به کار رفته‌اند. نشانی‌های اینترنتی همان‌گونه که در زمان نوشتن در دسترس بودند آورده شده‌اند و برخی از آن‌ها از بایگانی وب برداشته شده‌اند.</p>
   <ol>${refs.map((r, i) => i ? `<li dir="ltr">${r}</li>` : `<li>${r}</li>`).join('')}</ol>`,
  `<h2>پیوند به بیرون</h2>
   <p>پیوندهای زیر به نوشته‌هایی بیرون از این دانشنامه می‌رسند. محتوای آن‌ها زیر نظر این دانشنامه نیست و ممکن است با گذشت زمان دگرگون شود یا از دسترس بیرون برود.</p>
   <ul class="ext">${ext.map((r) => `<li><span dir="ltr">${r}</span></li>`).join('')}</ul>`,
];
const md = ['# عددنویسی هندی-عربی', '## فهرست', ...toc.map(([t, n]) => `**${t} ${dots} ${n}**`),
  'عددنویسی هندی-عربی دستگاهی برای نوشتن عددهاست که در هند پدید آمد و از راه سرزمین‌های اسلامی به اروپا رسید. این دستگاه بر پایهٔ ده رقم و ارزش مکانی است و امروز در بیشتر کشورهای جهان به کار می‌رود.',
  'در این نوشته، پیشینهٔ این دستگاه و راه رسیدن آن به اروپا به کوتاهی بازگفته می‌شود و در پایان، منابع و پیوندهای بیرونی برای خواندن بیشتر آمده است.',
  '## منابع',
  'فهرست زیر منابعی است که در نوشتن این مقاله به کار رفته‌اند. نشانی‌های اینترنتی همان‌گونه که در زمان نوشتن در دسترس بودند آورده شده‌اند و برخی از آن‌ها از بایگانی وب برداشته شده‌اند.',
  ['1. فرهنگ اسلام در غرب، جلد یکم، صفحهٔ ۲۲۴.', '2. Ifrah, Georges. 1999. The Universal History of Numbers, Wiley.',
   `3. Smith, John and Mary Brown. 2000. [Indian Numerals (${U1})](${U1})`,
   `4. Archived copy of the history of counting systems: [full text](${U2}) retrieved in June 2019 from the archive.`].join('\n'),
  '## پیوند به بیرون',
  'پیوندهای زیر به نوشته‌هایی بیرون از این دانشنامه می‌رسند. محتوای آن‌ها زیر نظر این دانشنامه نیست و ممکن است با گذشت زمان دگرگون شود یا از دسترس بیرون برود.',
  [`- [The Evolution of Numbers (${U3})](${U3})`, `- [Hindu-Arabic numerals in medieval Europe (${U4})](${U4})`].join('\n'),
].join('\n\n') + '\n';

(async () => {
  const html = `<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><style>
    @font-face{font-family:"Vazirmatn";src:url("${WEB}Vazirmatn[wght].woff2") format("woff2");font-weight:100 900}
    @page{size:A4;margin:0}
    body{margin:0;font:14px/1.75 "Vazirmatn"}
    .page{position:relative;height:296mm;box-sizing:border-box;padding:22mm 24mm 22mm 34mm;page-break-after:always;overflow:hidden}
    .rule{position:absolute;left:28mm;top:0;height:120mm;width:0;border-left:0.8px solid #000}
    .num{position:absolute;left:6mm;top:150mm;width:9mm;height:9mm;border:1px solid #000;border-radius:50%;text-align:center;line-height:9mm;font-weight:700}
    h1{font-size:22px} h2{font-size:20px;margin:1.2em 0 .4em}
    .toc{margin:0;line-height:1.75;white-space:nowrap;overflow:hidden}
    a{color:#0645ad;text-decoration:none} .u{word-break:break-all}
    ol li{line-height:1.5;margin-bottom:.3em}
    a.ul{position:relative;display:inline-block;overflow:hidden;vertical-align:top;line-height:1.5}
    a.ul::after{content:"";position:absolute;left:-400px;right:-400px;top:calc(1.5em - 2px);height:0.5px;background:#aaa}
    ul.ext{list-style:none;padding:0 1.5em 0 0} ul.ext li{line-height:1.5;margin-bottom:.6em}
    ul.ext li::before{content:"\\25AA";float:right;margin-right:-1.2em}
  </style></head><body>${pages.map((p, i) => `<div class="page"><div class="rule"></div><div class="num">${i + 1}</div>${p}</div>`).join('')}</body></html>`;
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kelk-links-')), 'p.html'); fs.writeFileSync(f, html);
  const b = await chromium.launch(), page = await b.newPage();
  await page.goto('file://' + f); await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: pdfPath('chrome-fa-links--fa-links.pdf'), preferCSSPageSize: true, printBackground: true });
  await b.close();
  fs.writeFileSync(path.join(LAB, 'corpus', 'fa-links.md'), md);
  console.log('chrome-fa-links--fa-links.pdf, corpus/fa-links.md');
})();
