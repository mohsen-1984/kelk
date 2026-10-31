// corpus/infobox.md as an encyclopedia prints from Chrome / Edge (tagged): its table floated right in a framed box (an
// infobox: label / value rows), the first paragraph squeezed beside it a few words a line, starting in bold and a
// link. The geometry reads the box as a quote and the squeezed lines as paragraphs; the structure tree says
// Table and P (PDFIMPORT.md §8.3, §8.2).   node scripts/make-infobox.js → pdf/chrome-float-tagged--infobox.pdf
const { pdfPath } = require('./env.js');
const fs = require('fs'), path = require('path');
const { chromium } = require('./env.js').req('playwright');
const KELK = require('./env.js').KELK, LAB = path.join(__dirname, '..');
const marked = require(KELK + '/vendor/marked.umd.min_18.0.14.js');
(async () => {
  const body = marked.parse(fs.readFileSync(path.join(LAB, 'corpus', 'infobox.md'), 'utf8'));
  const css = `body{font:12pt/1.5 "Liberation Sans",sans-serif;margin:0}
    table{float:right;width:72%;margin:0 0 1em 1em;border:1px solid #a2a9b1;background:#f8f9fa;border-collapse:collapse}
    th,td{text-align:left;padding:2px 6px} th{background:#ccd}`;
  const browser = await chromium.launch(), page = await browser.newPage();
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`);
  await page.pdf({ path: pdfPath('chrome-float-tagged--infobox.pdf'), format: 'A4', printBackground: true, tagged: true, outline: true,
    margin: { top: '2cm', bottom: '2cm', left: '2cm', right: '2cm' } });
  await browser.close();
  console.log('pdf/chrome-float-tagged--infobox.pdf');
})();
