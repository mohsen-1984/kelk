// Words positioned by gaps, no space glyph between them — as Prince and InDesign set some lines (a justified
// line: each word placed, 0.2–0.25 em apart) while the page's other lines draw their spaces. A page-wide rule
// for files that draw their spaces (a word break needs 0.45 em) glued every word of such lines.
//   corpus/positioned.md → pdf/chrome-positioned--positioned.pdf (Chromium: the positioned paragraphs are spans
//   with a margin and <wbr> between them — no space in the text, a break opportunity all the same)
const { pdfPath, fileUrl } = require('./env.js');
const fs = require('fs'), path = require('path'), os = require('os');
const { KELK, req } = require('./env.js');
const { chromium } = req('playwright');
const LAB = path.join(__dirname, '..');
const WEB = fileUrl(KELK + '/assets/fonts/rastikerdar/webfonts') + '/';
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
(async () => {
  const L = fs.readFileSync(path.join(LAB, 'corpus', 'positioned.md'), 'utf8').split('\n').filter((l) => l.trim());
  const placed = (t) => t.split(' ').map((w) => '<span class="w">' + esc(w) + '</span>').join('<wbr>');
  // the first paragraph and the English one: words placed; the others plain text with spaces (enough of them that
  // the page counts as one that draws its spaces, as the letter that showed it did)
  const body = L.map((l, i) => i === 0 ? '<h1>' + esc(l.slice(2)) + '</h1>' : (l.startsWith('احتراماً') || /^[A-Z]/.test(l)) ? '<p class="j"' + (/^[A-Z]/.test(l) ? ' dir="ltr"' : '') + '>' + placed(l) + '</p>' : '<p>' + esc(l) + '</p>').join('\n');
  const html = `<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><style>
    @font-face{font-family:"Vazirmatn";src:url("${WEB}Vazirmatn[wght].woff2") format("woff2");font-weight:100 900}
    body{font:15px/2 "Vazirmatn";margin:0 auto;max-width:640px} h1{font-size:18px} .w{margin-inline-end:.22em}
    .j{text-align:justify}</style></head><body>${body}</body></html>`;
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kelk-pos-')), 'p.html'); fs.writeFileSync(f, html);
  const b = await chromium.launch(), page = await b.newPage();
  await page.goto(fileUrl(f)); await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: pdfPath('chrome-positioned--positioned.pdf'), format: 'A4', margin: { top: '0.6in', bottom: '0.6in', left: '0.6in', right: '0.6in' } });
  await b.close(); console.log('chrome-positioned--positioned.pdf');
})();
