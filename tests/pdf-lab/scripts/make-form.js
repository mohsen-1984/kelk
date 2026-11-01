// A form: an invoice as an accounting system prints it (the pattern of a Persian Aspose.Words invoice, rebuilt with
// our own data, Persian and English), landscape A4, every word bold:
//   · a header — the title in the middle, «label: value» pairs at the far side, label and value apart
//   · boxed sections, each under a shaded title band as wide as the box: rows of «label: value» pairs side by side
//     (three to a row; some in one run, some with the value set apart), an empty value, a value set 5 pt above its
//     label's baseline, rules between the rows
//   · a remark whose value runs over three lines in its own row, an address inside it (its «https:» is no label)
//   · a pair whose value is a row of choices, «☑» ticked in the font and «☐» drawn as little pictures (a Word form's
//     checkbox from a symbol font it could not embed) — they come back as «☐», not as crops of a box and a letter
//   · a ruled goods table under its own band (a title over a table stays a paragraph, as Excel's does), closed by a
//     note in one cell merged over its last row — it must follow the table as a paragraph
// The pairs must come back one per item, row by row in reading order; the bands as headings, the table as a table.
// The r9 importer read values as headings and the pairs column by column, every line in ** **.
//   node scripts/make-form.js     → pdf/chrome-form--form-fa.pdf, pdf/chrome-form--form.pdf
const { pdfPath } = require('./env.js');
const fs = require('fs'), path = require('path'), os = require('os');
const { KELK, req } = require('./env.js');
const { chromium } = req('playwright');
const LAB = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kelk-form-'));
const WEB = 'file://' + KELK + '/assets/fonts/rastikerdar/webfonts/';
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
// «☐» as a picture: a canvas drawn in the page, then an <img> of itself (a raster in the PDF)
const BOX = `document.querySelectorAll('canvas.box').forEach(function(c){var g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);
  g.strokeStyle='#000';g.lineWidth=2;g.strokeRect(3,3,c.width-6,c.height-6);var i=new Image();i.src=c.toDataURL('image/png');i.style.cssText=c.style.cssText;c.replaceWith(i);});`;
const boxes = (t) => esc(t).replace(/☐/g, '<canvas class="box" width="26" height="26" style="width:11px;height:11px;vertical-align:-1px"></canvas>');

function build(md, rtl) {
  const L = md.split('\n'), title = L[0].slice(2);
  const sections = []; let cur = { name: null, pairs: [], table: [] };
  L.slice(1).forEach((l) => {
    if (l.startsWith('## ')) { sections.push(cur); cur = { name: l.slice(3), pairs: [], table: [] }; }
    else if (l.trim() && !/^[-|#]/.test(l) && cur.table.length) cur.note = l.trim();                                 // the note closing the table
    else if (l.trim() && !/^[-|#]/.test(l)) { sections.push(cur); cur = { name: l.trim(), pairs: [], table: [] }; }   // the table's title
    else if (l.startsWith('- ')) { const k = l.indexOf(':'); cur.pairs.push([l.slice(2, k + 1), l.slice(k + 1).trim()]); }
    else if (l.startsWith('| ') && !/^\| ---/.test(l)) cur.table.push(l.split('|').slice(1, -1).map((c) => c.trim()));
  });
  sections.push(cur);
  const head = sections.shift();
  // a pair: in one run, or label and value apart (every second one); the third pair of a box raised
  const pair = (p, k) => p[1].length > 80 ? `<div class="long"><span class="pr">${esc(p[0])}</span><span class="lv">${esc(p[1]).replace(/(https?:\/\/\S+)/, '<a href="$1">$1</a>')}</span></div>` : k === 2 ? `<span class="pr">${esc(p[0])}</span><span class="v up">${esc(p[1])}</span>`
    : k % 2 ? `<span class="pr">${esc(p[0])}</span><span class="v">${boxes(p[1])}</span>` : `<span class="pr">${esc(p[0])} ${boxes(p[1])}</span>`;
  const box = (s) => {
    if (s.table.length) return `<div class="box"><div class="band">${esc(s.name)}</div><table>${s.table.map((r, i) => '<tr>' + r.map((c) => (i ? '<td>' : '<th>') + esc(c) + (i ? '</td>' : '</th>')).join('') + '</tr>').join('')}${s.note ? '<tr><td class="note" colspan="' + s.table[0].length + '">' + esc(s.note) + '</td></tr>' : ''}</table></div>`;
    // three pairs to a row; a long value (a remark) a row of its own
    const rows = []; let cur = [];
    s.pairs.forEach((p) => { if (p[1].length > 80) { if (cur.length) rows.push(cur); rows.push([p]); cur = []; } else { cur.push(p); if (cur.length === 3) { rows.push(cur); cur = []; } } });
    if (cur.length) rows.push(cur);
    let k = 0;
    return `<div class="box"><div class="band">${esc(s.name)}</div>${rows.map((r) => '<div class="row">' + r.map((p) => '<div class="c">' + pair(p, k++) + '</div>').join('') + '</div>').join('')}</div>`;
  };
  return `<!doctype html><html dir="${rtl ? 'rtl' : 'ltr'}" lang="${rtl ? 'fa' : 'en'}"><head><meta charset="utf-8"><style>
    @font-face{font-family:"Vazirmatn";src:url("${WEB}Vazirmatn[wght].woff2") format("woff2");font-weight:100 900}
    @page{size:A4 landscape;margin:0} body{margin:36px 50px;font:700 11px/1.5 ${rtl ? '"Vazirmatn"' : '"Liberation Sans",Arial'};color:#111}
    .head{position:relative;height:70px} .head h1{position:absolute;${rtl ? 'right' : 'left'}:330px;top:12px;margin:0;font-size:17px}
    .meta{position:absolute;${rtl ? 'left' : 'right'}:40px;top:6px} .meta div{height:20px} .meta .pr{display:inline-block;width:110px} 
    .box{border:1px solid #000;margin-top:14px} .band{background:#bfbfbf;text-align:center;padding:3px 0;border-bottom:1px solid #000}
    .row{display:flex;border-bottom:1px solid #000;padding:5px 10px} .row:last-child{border-bottom:0} .c{flex:1}
    .v{margin-${rtl ? 'right' : 'left'}:60px} .up{position:relative;top:-6px}
    table{width:100%;border-collapse:collapse} td,th{border:1px solid #000;padding:4px 6px;text-align:center} td.note{text-align:${rtl ? 'right' : 'left'}} a{color:inherit}
    .long{display:flex} .long .pr{width:130px;flex:none} .long .lv{flex:1}
  </style></head><body><div class="head"><h1>${esc(title)}</h1><div class="meta">${head.pairs.map((p) => '<div><span class="pr">' + esc(p[0]) + '</span><span>' + esc(p[1]) + '</span></div>').join('')}</div></div>
  ${sections.map(box).join('')}<script>${BOX}</script></body></html>`;
}

(async () => {
  const b = await chromium.launch(), page = await b.newPage();
  for (const [doc, rtl] of [['form-fa', true], ['form', false]]) {
    const f = path.join(TMP, doc + '.html');
    fs.writeFileSync(f, build(fs.readFileSync(path.join(LAB, 'corpus', doc + '.md'), 'utf8'), rtl));
    await page.goto('file://' + f); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(200);
    await page.pdf({ path: pdfPath('chrome-form--' + doc + '.pdf'), preferCSSPageSize: true, printBackground: true });
    console.log('pdf/chrome-form--' + doc + '.pdf');
  }
  await b.close(); fs.rmSync(TMP, { recursive: true, force: true });
})();
