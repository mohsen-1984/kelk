// A designed Persian booklet as Chromium prints it (Kelk 2.3's cases, from a real file's habits; our own text):
//   · a table of contents: a number badge, the title, dot leaders drawn as a dashed rule, no page number — it came
//     back as a level-6 heading a line, each number a bold paragraph after its title (not a numbered list)
//   · a chapter's head: a number badge beside the title, a small coloured subtitle under it — the badge a bold
//     paragraph before the title, the title a bold paragraph on one page and a heading on the next, levels jumping
//   · a drop cap: the paragraph's first letter large, beside its first lines — «ب یشتر» for «بیشتر», and the whole
//     paragraph bold
//   · a callout: a tinted box, a small icon and a bold label over its text — the icon read as a task's checkbox
//     («- [ ] …»)
//   · a formula drawn as three boxes with «+» and «=» between them, each box a word and its English gloss — each word
//     a level-6 heading, «+» and «=» level-3 headings
//   · two cards side by side, each a bold title over its text — the titles level-6 headings
// The Markdown that must come back is corpus/booklet-cards-fa.md.
//   node scripts/make-booklet.js        → pdf/pages/chrome-booklet--booklet-cards-fa.pdf
const { pdfPath, fileUrl } = require('./env.js');
const fs = require('fs'), path = require('path'), os = require('os');
const { req } = require('./env.js');
const { chromium } = req('playwright');
const FONT = path.join(__dirname, '..', '..', '..', 'assets', 'fonts', 'rastikerdar', 'webfonts', 'Vazirmatn[wght].woff2');
const toc = ['چرا عادت‌ها ماندگارند؟', 'سه قدمِ ساختنِ یک عادت', 'وقتی عادت می‌شکند'];
const css = `@font-face{font-family:V;src:url("${fileUrl(FONT)}") format("woff2");font-weight:100 900}
  body{font:13px/1.9 V;direction:rtl;background:#faf8f3;color:#222;margin:0}
  .page{padding:40px 48px;page-break-after:always}
  h1.toc{font-size:22px;margin:0 0 18px}
  .row{display:flex;align-items:center;gap:10px;margin:0 0 12px}
  .badge{display:inline-flex;width:26px;height:26px;border-radius:6px;background:#1f2a44;color:#fff;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex:none}
  .row .badge{background:#f6e7b8;color:#333}
  .lead{flex:1;border-bottom:1px dashed #c9b98a;height:0;margin-top:6px}
  .head{display:flex;align-items:center;gap:12px}
  .head h2{font-size:20px;margin:0}
  .sub{color:#c58a12;font-size:11px;font-weight:700;margin:4px 0 18px}
  .cap::first-letter{float:right;font-size:44px;line-height:1;font-weight:800;margin:4px 0 0 8px}
  .callout{background:#e9edf6;border-radius:8px;padding:12px 16px;margin:16px 0}
  .callout b{display:block;font-size:12px}
  .icon{display:inline-block;width:10px;height:10px;border:1.5px solid #6a7bb0;border-radius:3px;margin-left:6px;vertical-align:middle}
  .formula{display:flex;align-items:center;justify-content:center;gap:14px;margin:18px 0}
  .box{border-radius:8px;padding:8px 18px;text-align:center;color:#fff;font-weight:700;line-height:1.4}
  .box small{display:block;font-weight:400;font-size:10px}
  .op{font-size:22px;font-weight:700}
  .cards{display:flex;gap:16px;margin:16px 0}
  .card{flex:1;border-radius:8px;padding:12px 14px;background:#fbefd5}
  .card+.card{background:#f6dcdc}
  .card b{display:block;color:#a33}`;
const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><style>${css}</style></head><body>
<div class="page"><h1 class="toc">فهرست</h1>
${toc.map((t, k) => `<div class="row"><span class="badge">${k + 1}</span><span>${t}</span><span class="lead"></span></div>`).join('')}</div>
<div class="page"><div class="head"><span class="badge">1</span><h2>چرا عادت‌ها ماندگارند؟</h2></div>
<div class="sub">پیش از هر روشی، باید بدانیم عادت چیست</div>
<p class="cap">بیشترِ کارهایی که هر روز می‌کنیم را بی‌آنکه فکر کنیم انجام می‌دهیم. مغز برای اینکه انرژی کمتری خرج کند، کارهای تکراری را به عادت تبدیل می‌کند و دیگر برای هر کدام تصمیم تازه‌ای نمی‌گیرد.</p>
<p>عادت خوب و بد برای مغز فرقی ندارد. هر دو همان راه را می‌روند: یک نشانه، یک کار و یک پاداش.</p>
<div class="callout"><b><span class="icon"></span>نکته</b>عادت را نمی‌شود پاک کرد؛ فقط می‌شود کارِ میانه‌اش را با کار دیگری عوض کرد.</div></div>
<div class="page"><div class="head"><span class="badge">2</span><h2>سه قدمِ ساختنِ یک عادت</h2></div>
<div class="sub">نشانه، کار، پاداش</div>
<p>هر عادتی از سه قدم ساخته می‌شود که پشتِ سر هم می‌آیند:</p>
<div class="formula"><div class="box" style="background:#1f2a44">نشانه<small>cue</small></div><span class="op">+</span>
<div class="box" style="background:#e3a21a">کار<small>routine</small></div><span class="op">=</span>
<div class="box" style="background:#c0503f">عادت<small>habit</small></div></div>
<div class="cards"><div class="card"><b>نشانه بدونِ پاداش</b>کار را چند بار انجام می‌دهی و چون چیزی به دست نمی‌آوری، رهایش می‌کنی.</div>
<div class="card"><b>پاداش بدونِ نشانه</b>کار را دوست داری، ولی چیزی یادت نمی‌اندازد که سراغش بروی.</div></div>
<p>پس برای ساختنِ عادت، هر سه قدم را با هم بچین.</p></div>
</body></html>`;
(async () => {
  const b = await chromium.launch(), page = await b.newPage();
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kelk-bk-')), 'p.html'); fs.writeFileSync(f, html);
  await page.goto(fileUrl(f)); await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: pdfPath('chrome-booklet--booklet-cards-fa.pdf'), width: '148mm', height: '210mm', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
  await b.close();
  fs.writeFileSync(path.join(__dirname, '..', 'corpus', 'booklet-cards-fa.md'), `# فهرست

1.  چرا عادت‌ها ماندگارند؟
2.  سه قدمِ ساختنِ یک عادت
3.  وقتی عادت می‌شکند

## 1. چرا عادت‌ها ماندگارند؟

**پیش از هر روشی، باید بدانیم عادت چیست**

بیشترِ کارهایی که هر روز می‌کنیم را بی‌آنکه فکر کنیم انجام می‌دهیم. مغز برای اینکه انرژی کمتری خرج کند، کارهای تکراری را به عادت تبدیل می‌کند و دیگر برای هر کدام تصمیم تازه‌ای نمی‌گیرد.

عادت خوب و بد برای مغز فرقی ندارد. هر دو همان راه را می‌روند: یک نشانه، یک کار و یک پاداش.

> **نکته**
>
> عادت را نمی‌شود پاک کرد؛ فقط می‌شود کارِ میانه‌اش را با کار دیگری عوض کرد.

## 2. سه قدمِ ساختنِ یک عادت

**نشانه، کار، پاداش**

هر عادتی از سه قدم ساخته می‌شود که پشتِ سر هم می‌آیند:

**نشانه** (cue) + **کار** (routine) = **عادت** (habit)

**نشانه بدونِ پاداش**

کار را چند بار انجام می‌دهی و چون چیزی به دست نمی‌آوری، رهایش می‌کنی.

**پاداش بدونِ نشانه**

کار را دوست داری، ولی چیزی یادت نمی‌اندازد که سراغش بروی.

پس برای ساختنِ عادت، هر سه قدم را با هم بچین.
`);
  console.log('chrome-booklet--booklet-cards-fa.pdf, corpus/booklet-cards-fa.md');
})();
