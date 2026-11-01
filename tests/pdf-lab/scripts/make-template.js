// corpus/template.md in a company template, as Chrome prints it: elements fixed to the page (position: fixed)
// are drawn on every page — a side panel with the company's name and address on a grey fill, a logo (an SVG:
// vector parts) and the date and reference in the top margin, a footer line in the bottom one (header and footer templates). The body runs over three
// pages beside the panel. The Markdown that must come back is corpus/template.md: the body, and the date and reference
// fields once (a letter's head fields are its own, PDFIMPORT.md §6a) — the body is what follows them.
//   node scripts/make-template.js        → pdf/chrome-template--template.pdf
const { pdfPath } = require('./env.js');
const fs = require('fs'), path = require('path');
const { chromium } = require('./env.js').req('playwright');
const KELK = require('./env.js').KELK, LAB = path.join(__dirname, '..');
const marked = require(KELK + '/vendor/marked.umd.min_18.0.14.js');
(async () => {
  const md = fs.readFileSync(path.join(LAB, 'corpus', 'template.md'), 'utf8');
  const body = marked.parse(md.slice(md.indexOf('# ')));                 // (the head's fields are the header template's)
  const css = `@page{size:A4;margin:120px 0 80px 0}
    body{margin:0;font:11pt/1.55 "Liberation Sans",sans-serif;color:#222}
    .panel{position:fixed;top:0;right:0;bottom:0;width:150px;background:#ececec;padding:180px 16px 0;box-sizing:border-box;
      font:10pt/1.4 "Liberation Sans",sans-serif;color:#1d6b8f}
    .panel b{display:block;font-size:12pt;margin-bottom:6px}
    .addr{position:absolute;bottom:90px;left:16px;right:16px}
    main{margin:0 200px 0 60px}
    table{border-collapse:collapse} th,td{border:1px solid #999;padding:3px 8px;text-align:left}`;
  const logo = `<svg style="position:absolute;top:24px;right:35px;width:80px;height:80px" viewBox="0 0 80 80"><circle cx="28" cy="30" r="20" fill="#1d6b8f"/><circle cx="52" cy="30" r="20" fill="none" stroke="#e8702a" stroke-width="8"/>
    <rect x="10" y="58" width="60" height="12" rx="6" fill="#1d6b8f"/></svg>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${css}</style></head><body>
    <div class="panel"><b>Archive Search Ltd</b>Private company<br>Registered no. 17870<br>Tax id 14009493278
      <div class="addr">Science Park, Building 5<br>Floor 3, Unit 531<br>Postcode 37491<br>Tel. 025-3355-7715</div></div>
    <main>${body}</main></body></html>`;
  const browser = await chromium.launch(), page = await browser.newPage();
  await page.setContent(html);
  // (the logo, the date and reference, the footer line: in the page's margins, on every page — Chrome's header
  // and footer templates, as a template's running head and foot)
  const headerTemplate = `<div style="position:relative;width:100%;height:110px;font:9pt 'Liberation Sans',sans-serif;color:#555;-webkit-print-color-adjust:exact">
    <div style="position:absolute;top:30px;left:60px">Date: 2026-10-08<br>Ref.: 4050716001</div>${logo}</div>`;
  const footerTemplate = `<div style="width:100%;font:8.5pt 'Liberation Sans',sans-serif;color:#777;padding:0 0 20px 60px">Archive Search Ltd · confidential · archive-search.example</div>`;
  await page.pdf({ path: pdfPath('chrome-template--template.pdf'), preferCSSPageSize: true, printBackground: true,
    displayHeaderFooter: true, headerTemplate, footerTemplate });
  await browser.close();
  console.log('pdf/chrome-template--template.pdf');
})();
