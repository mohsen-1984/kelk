// A running head made as a table of its own — two bordered cells in the top margin («version | title», as Word's
// header tables are) — over a report whose long table goes on over pages with its header row repeated. The head
// must go (its rules end with it in the margin); the table's repeated header row must stay one table (its rules
// go on down into its rows). corpus/report.md and fa-report.md → pdf/chrome-headtable--{report,fa-report}.pdf
const { pdfPath } = require('./env.js');
const fs = require('fs'), path = require('path'), os = require('os');
const { KELK, req } = require('./env.js');
const { chromium } = req('playwright');
const marked = require(KELK + '/vendor/marked.umd.min_18.0.14.js');
const LAB = path.join(__dirname, '..');
const WEB = 'file://' + KELK + '/assets/fonts/rastikerdar/webfonts/';
(async () => {
  const b = await chromium.launch(), page = await b.newPage();
  for (const [doc, rtl] of [['report', false], ['fa-report', true]]) {
    const md = fs.readFileSync(path.join(LAB, 'corpus', doc + '.md'), 'utf8');
    const font = rtl ? 'Vazirmatn' : 'Liberation Sans';
    const html = `<!doctype html><html dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>
      @font-face{font-family:"Vazirmatn";src:url("${WEB}Vazirmatn[wght].woff2") format("woff2");font-weight:100 900}
      body{font:14px/1.6 "${font}"} table{border-collapse:collapse} th,td{border:1px solid #888;padding:3px 8px} thead{display:table-header-group}
      </style></head><body>${marked.parse(md)}</body></html>`;
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kelk-ht-')), 'p.html'); fs.writeFileSync(f, html);
    await page.goto('file://' + f); await page.evaluate(() => document.fonts.ready);
    const cell = 'border:0.6px solid #555;padding:2px 8px;font-size:9px;font-family:' + (rtl ? 'Vazirmatn' : 'Arial');
    const head = `<table dir="${rtl ? 'rtl' : 'ltr'}" style="width:100%;margin:0 0.5in;border-collapse:collapse"><tr><td style="${cell};width:75%">${rtl ? 'گزارش پیشرفت پروژه‌ها — نسخهٔ داخلی' : 'Quarterly operations report — internal'}</td><td style="${cell}">${rtl ? 'نسخهٔ اول' : 'Version 1'}</td></tr></table>`;
    await page.pdf({ path: pdfPath('chrome-headtable--' + doc + '.pdf'), format: 'A4', displayHeaderFooter: true, headerTemplate: head,
      footerTemplate: '<div style="font-size:8px;width:100%;text-align:center"><span class="pageNumber"></span></div>', margin: { top: '0.9in', bottom: '0.6in', left: '0.5in', right: '0.5in' } });
    console.log('chrome-headtable--' + doc + '.pdf');
  }
  await b.close();
})();
