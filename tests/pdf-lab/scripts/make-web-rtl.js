// corpus/web-rtl.md as a Persian web page prints from Chrome (right to left): what a site carries on every page —
// side tabs whose text is turned (writing-mode), fixed to both edges, and a floating ad box — around the content:
// sections in framed cards (a bold heading line, paragraphs), and a price table whose rows are separated by a
// rule drawn cell by cell, each cell two lines tall (symbol over name, dollars over toman).
// The Markdown that must come back is corpus/web-rtl.md: the content only.
//   node scripts/make-web-rtl.js        → pdf/chrome-web-rtl--web-rtl.pdf
const { pdfPath } = require('./env.js');
const fs = require('fs'), path = require('path');
const { chromium } = require('./env.js').req('playwright');
const LAB = path.join(__dirname, '..');
(async () => {
  const md = fs.readFileSync(path.join(LAB, 'corpus', 'web-rtl.md'), 'utf8');
  const blocks = md.split(/\n\n+/);
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  let html = '', card = null;
  const close = () => { if (card) { html += '<div class="card"><b>' + esc(card.head) + '</b>' + card.ps.map((p) => '<p>' + esc(p) + '</p>').join('') + '</div>'; card = null; } };
  blocks.forEach((b) => {
    b = b.trim();
    if (/^# /.test(b)) { close(); html += '<h1>' + esc(b.slice(2)) + '</h1>'; }
    else if (/^## /.test(b)) { close(); html += '<h2>' + esc(b.slice(3)) + '</h2>'; }
    else if (/:\*\*$/.test(b)) { close(); card = { head: b.replace(/\*\*/g, ''), ps: [] }; }
    else if (/^\|/.test(b)) {
      close();
      const rows = b.split('\n').filter((l) => !/^\|-/.test(l)).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
      html += '<table><tr>' + rows[0].map((c) => '<th>' + esc(c) + '</th>').join('') + '</tr>' + rows.slice(1).map((r) => '<tr>' +
        r.map((c, k) => {
          // two lines in a cell: the name under the symbol, the toman price under the dollar price
          const two = (k === 1 || k === 2) && c.indexOf(' ') > 0 ? '<b>' + esc(c.split(' ')[0]) + '</b><br><small>' + esc(c.split(' ').slice(1).join(' ')) + '</small>' : esc(c);
          return '<td>' + two + '</td>';
        }).join('') + '</tr>').join('') + '</table>';
    }
    else if (card) card.ps.push(b);
    else html += '<p>' + esc(b) + '</p>';
  });
  close();
  const css = `@page{size:A4;margin:60px 0 60px 0}
    body{margin:0;font:12pt/1.7 "DejaVu Sans",sans-serif;color:#222;direction:rtl}
    main{margin:0 90px 0 90px} h2{break-before:page}
    .card{border:1px solid #d8dee6;border-radius:12px;padding:10px 18px;margin:18px 0}
    .card b{display:block;color:#123}
    table{border-collapse:collapse;width:100%} th{text-align:right;font-weight:normal;color:#666;border-bottom:1px solid #e2e8f0;padding:6px}
    td{border-bottom:1px solid #e2e8f0;padding:8px 6px;vertical-align:middle;line-height:1.3} small{color:#777}
    .tab{position:fixed;top:300px;width:28px;height:110px;border:1px solid #ddd;border-radius:8px;background:#fff;
      writing-mode:vertical-rl;font-size:10pt;color:#c33;text-align:center;line-height:28px}
    .tl{left:4px} .tr{right:4px}
    .ad{position:fixed;bottom:20px;right:4px;width:120px;border:1px solid #ccc;background:#fafafa;font-size:9pt;padding:6px;line-height:1.5}`;
  const page = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><style>${css}</style></head><body>
    <div class="tab tl">فال روزانه</div><div class="tab tr">فال ابجد</div>
    <div class="ad">برای هر گیمر، از هر دنیا و هر ژانر در فروشگاه نمونه</div>
    <main>${html}</main></body></html>`;
  const browser = await chromium.launch(), p = await browser.newPage();
  await p.setContent(page);
  await p.pdf({ path: pdfPath('chrome-web-rtl--web-rtl.pdf'), preferCSSPageSize: true, printBackground: true });
  await browser.close();
  console.log('pdf/chrome-web-rtl--web-rtl.pdf');
})();
