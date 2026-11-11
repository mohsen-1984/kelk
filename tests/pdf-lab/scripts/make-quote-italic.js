// corpus/fa-quote-italic.md as a Persian page from Chrome: paragraphs with a first-line indent and no space between
// them (`p { margin: 0; text-indent }`), quotes set in on both sides and in italic by the stylesheet
// (`blockquote { font-style: italic }`, the fuzz sets' `italic-indent`). Vazirmatn has no italic face: Chrome slants it,
// by its text matrix. One quote right after a numbered list, set in as far as the items' text — it had become the last
// item's text (PDFIMPORT.md §8.4 «A quote in italic»).   node scripts/make-quote-italic.js → pdf/rtl/chrome-quote-italic--fa-quote-italic.pdf
const { pdfPath, fileUrl } = require('./env.js');
const fs = require('fs'), path = require('path'), os = require('os');
const { chromium } = require('./env.js').req('playwright');
const KELK = require('./env.js').KELK, LAB = path.join(__dirname, '..');
const marked = require(KELK + '/vendor/marked.umd.min_18.0.14.js');
const WEB = fileUrl(KELK + '/assets/fonts/rastikerdar/webfonts') + '/';
(async () => {
  const md = fs.readFileSync(path.join(LAB, 'corpus', 'fa-quote-italic.md'), 'utf8');
  const css = `@font-face{font-family:"Vazirmatn";src:url("${WEB}Vazirmatn[wght].woff2") format("woff2");font-weight:100 900}
    body{font:11pt/1.6 "Vazirmatn",sans-serif;margin:0} h1,h2{line-height:1.2;margin:1em 0 .4em}
    p{margin:0;text-indent:1.5em} h1+p,h2+p{text-indent:0} blockquote{margin:0 2.5em .8em;font-style:italic}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kelk-quote-')), f = path.join(tmp, 'page.html');
  fs.writeFileSync(f, `<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>یادداشت‌ها</title><style>${css}</style></head><body>${marked.parse(md)}</body></html>`);
  const browser = await chromium.launch(), page = await browser.newPage();
  await page.goto(fileUrl(f)); await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: pdfPath('chrome-quote-italic--fa-quote-italic.pdf'), format: 'A4', margin: { top: '2cm', bottom: '2cm', left: '2cm', right: '2cm' } });
  await browser.close();
  console.log('pdf/rtl/chrome-quote-italic--fa-quote-italic.pdf');
})();
