// A Persian page set in a variable font (round 26): Vazirmatn[wght] (the one in assets/fonts) at weights 400, 700 and
// 800, printed by Chromium. Skia writes each weight of a variable font as a Type 3 font of drawn glyphs — no
// FontDescriptor weight, no «Bold» in its name — so a [wght] font's bold read as regular: the heading and the bold
// words came back plain. corpus/fa-weights.md → pdf/rtl/chrome-rtl-varfont--fa-weights.pdf
const { pdfPath, req, KELK, fileUrl } = require('./env.js');
const fs = require('fs'), path = require('path'), os = require('os');
const { chromium } = req('playwright');
const LAB = path.join(__dirname, '..');
const FONT = fileUrl(path.join(KELK, 'assets', 'fonts', 'rastikerdar', 'webfonts', 'Vazirmatn[wght].woff2')).replace(/\[/g, '%5B').replace(/\]/g, '%5D');
const MD = `# گزارش کوتاه طرح

این گزارش وضعیت **کارهای انجام‌شده** در سه ماه گذشته را نشان می‌دهد و برای همه واحدها فرستاده می‌شود.

## برنامه دوره بعد

در دوره بعد، **آزمون نسخه نخست** و تهیه راهنمای کاربران انجام خواهد شد. هر واحد باید نظر خود را تا پایان ماه بفرستد.

**یادآوری:** نشست بعدی در هفته نخست ماه آینده برگزار می‌شود.
`;
(async () => {
  const b = await chromium.launch(), page = await b.newPage();
  const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><style>
    @font-face{font-family:VazirVF;src:url("${FONT}") format("woff2");font-weight:100 900}
    body{font:15px/1.8 VazirVF;margin:0} h1{font-size:26px;font-weight:800;margin:0 0 14px} h2{font-size:20px;font-weight:700;margin:22px 0 10px}
    p{margin:0 0 12px} strong{font-weight:700}
    </style></head><body>
    <h1>گزارش کوتاه طرح</h1>
    <p>این گزارش وضعیت <strong>کارهای انجام‌شده</strong> در سه ماه گذشته را نشان می‌دهد و برای همه واحدها فرستاده می‌شود.</p>
    <h2>برنامه دوره بعد</h2>
    <p>در دوره بعد، <strong>آزمون نسخه نخست</strong> و تهیه راهنمای کاربران انجام خواهد شد. هر واحد باید نظر خود را تا پایان ماه بفرستد.</p>
    <p><strong>یادآوری:</strong> نشست بعدی در هفته نخست ماه آینده برگزار می‌شود.</p>
    </body></html>`;
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kelk-vf-')), 'p.html'); fs.writeFileSync(f, html);
  await page.goto(fileUrl(f)); await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: pdfPath('chrome-rtl-varfont--fa-weights.pdf'), format: 'A4', margin: { top: '1in', bottom: '1in', left: '1in', right: '1in' } });
  await b.close();
  fs.writeFileSync(path.join(LAB, 'corpus', 'fa-weights.md'), MD);
  console.log('pdf/rtl/chrome-rtl-varfont--fa-weights.pdf');
})();
