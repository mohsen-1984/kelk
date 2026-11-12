// A right-to-left borderless table at the text's own pitch (2.8; TODO.md, «Right-to-left borderless tables»):
//   chrome-rtl-rows--fa-rows   a Persian page in Chromium, 11 pt type at line height 1.15, a table with no borders, its cells
//                              1 px by 6 px of padding, no gap above or below it wider than a line's; its first column
//                              «left»-aligned (GFM :---) and its numbers right-aligned (---:), so in a right-to-left
//                              table the two meet at their shared side, only the padding apart (12 px, 9 pt) — under a
//                              column's gutter (0.9 em, 9.9 pt). The previous importer kept the table and the paragraph under it in one
//                              region and gave the rows back as paragraphs, its header bold with «·» between the cells.
//   node scripts/make-rows-rtl.js
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const { KELK, req, pdfPath, fileUrl } = require('./env.js');
const { chromium } = req('playwright');
const marked = require(KELK + '/vendor/marked.umd.min_18.0.14.js');
const LAB = path.join(__dirname, '..');
// Vazirmatn's static Regular and Bold (the font zip): the variable font's bold instance is not named bold in the PDF
const FONT_ZIP = path.join(KELK, 'assets', 'fonts', 'download', 'persian-fonts-ttf.zip');
(async () => {
  const md = fs.readFileSync(path.join(LAB, 'corpus', 'fa-rows.md'), 'utf8');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kelk-rows-')), f = path.join(tmp, 'rows.html');
  cp.execFileSync('unzip', ['-q', '-o', FONT_ZIP, 'vazirmatn/Vazirmatn-Regular.ttf', 'vazirmatn/Vazirmatn-Bold.ttf', '-d', tmp]);
  const font = (w, file) => `@font-face{font-family:"Vazirmatn";src:url("${fileUrl(path.join(tmp, 'vazirmatn', file))}") format("truetype");font-weight:${w}}`;
  const html = `<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>fa-rows</title><style>
    ${font(400, 'Vazirmatn-Regular.ttf')} ${font(700, 'Vazirmatn-Bold.ttf')}
    body{font:11pt/1.15 "Vazirmatn";margin:0} h1{font-size:18pt} h2{font-size:15pt}
    p{margin:0} table{border-collapse:collapse} th,td{padding:1px 6px}</style></head><body>${marked.parse(md)}</body></html>`;
  fs.writeFileSync(f, html);
  const b = await chromium.launch(), page = await b.newPage();
  await page.goto(fileUrl(f)); await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: pdfPath('chrome-rtl-rows--fa-rows.pdf'), format: 'A4', margin: { top: '2cm', bottom: '2cm', left: '2.5cm', right: '2.5cm' } });
  await b.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('chrome-rtl-rows--fa-rows.pdf');
})();
