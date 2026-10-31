// Tables real Persian files showed, rebuilt (round 6 of the 2.0 work):
//   chrome-card--receipt   a web receipt: a framed card (one stroked rectangle), rules between its rows and between
//                          label and value, none of their own at the card's edges; an amount in Persian digits with
//                          the Arabic thousands separator (٬, U+066C) — read as a letter, its groups had come back
//                          reversed («۷۳۹٬۹۰۰٬۶»)
//   lowriter--merged       a Word table (docx: the `docx` package) through LibreOffice: a title row merged over all
//                          columns, every cell drawn with its own borders, and a paragraph merged over three columns —
//                          their text had been sliced at the column positions
//   node scripts/make-tables-rtl.js
const { pdfPath } = require('./env.js');
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const { KELK, req } = require('./env.js');
const { chromium } = req('playwright');
const D = req('docx');
const LAB = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kelk-tab-'));
const WEB = 'file://' + KELK + '/assets/fonts/rastikerdar/webfonts/';
(async () => {
  // 1. the receipt card
  const rows = fs.readFileSync(path.join(LAB, 'corpus', 'receipt.md'), 'utf8').split('\n').filter((l) => /^\| /.test(l) && !/^\| ---/.test(l))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
  const html = `<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><style>
    @font-face{font-family:"Vazirmatn";src:url("${WEB}Vazirmatn[wght].woff2") format("woff2");font-weight:100 900}
    body{font:13px/1.6 "Vazirmatn";margin:0} .card{width:420px;margin:260px auto 0;border:1px solid #ccc;padding:20px 24px}
    .ok{text-align:center;color:#333;margin:0 0 18px} h3{font-size:15px;margin:22px 0 10px;border-top:1px solid #111;padding-top:14px}
    table{width:100%;border-collapse:collapse;border:1px solid #333} td{padding:6px 10px;border-bottom:1px solid #333} td:first-child{border-left:1px solid #333;width:38%}
    tr:last-child td{border-bottom:0}</style></head><body><div class="card"><p class="ok">پرداخت با موفقیت انجام شد</p><h3>جزئیات رسید</h3>
    <table>${rows.map((r) => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>').join('')}</table></div></body></html>`;
  const f = path.join(TMP, 'r.html'); fs.writeFileSync(f, html);
  const b = await chromium.launch(), page = await b.newPage();
  await page.goto('file://' + f); await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: pdfPath('chrome-card--receipt.pdf'), format: 'A5', printBackground: true });
  await b.close();
  // 2. the Word table with merged cells
  const md = fs.readFileSync(path.join(LAB, 'corpus', 'merged.md'), 'utf8').split('\n');
  const title = md[0].replace(/\*\*/g, '');
  const trs = md.filter((l) => /^\| /.test(l) && !/^\| ---/.test(l)).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
  // the note after the table («**توضیحات:** …»): in the Word table, its last row — the label, and the text merged over
  // the other three cells (the importer gives it back after the table: round 11, a table's closing note)
  const note = md.map((l) => l.match(/^\*\*(.+?)\*\* (.+)$/)).filter(Boolean).filter((m) => !/^\*\*/.test(m[2]))[0];
  if (note) trs.push([note[1], note[2], '', '']);
  const run = (t, bold) => new D.TextRun({ text: t, bold: !!bold, rightToLeft: true, font: 'Vazirmatn', size: 20 });
  const para = (t, bold) => new D.Paragraph({ children: [run(t, bold)], bidirectional: true, alignment: D.AlignmentType.START });
  const border = { style: D.BorderStyle.SINGLE, size: 4, color: '000000' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const cell = (t, span, bold, shade) => new D.TableCell({ children: [para(t, bold)], columnSpan: span || 1, borders, shading: shade ? { fill: 'D9E2F3', type: D.ShadingType.CLEAR, color: 'auto' } : undefined });
  const tableRows = [new D.TableRow({ children: [cell(title, 4, true, true)] })];
  trs.forEach((r, i) => {
    if (r[2] === '' && r[3] === '') tableRows.push(new D.TableRow({ children: [cell(r[0], 1, true), cell(r[1], 3)] }));
    else tableRows.push(new D.TableRow({ children: r.map((c) => cell(c, 1, i === 0)) }));
  });
  const doc = new D.Document({ sections: [{ properties: { page: { size: { orientation: D.PageOrientation.PORTRAIT } } },
    children: [new D.Table({ rows: tableRows, width: { size: 100, type: D.WidthType.PERCENTAGE }, visuallyRightToLeft: true })] }] });
  const docx = path.join(TMP, 'merged.docx');
  fs.writeFileSync(docx, await D.Packer.toBuffer(doc));
  cp.execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', TMP, docx], { stdio: 'ignore', timeout: 180000 });
  fs.renameSync(path.join(TMP, 'merged.pdf'), pdfPath('lowriter--merged.pdf'));
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log('chrome-card--receipt.pdf, lowriter--merged.pdf');
})();
