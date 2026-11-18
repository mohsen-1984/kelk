// A ruled table whose row is cut by the page break (Chrome splits a row whose cells wrap): the row's first lines at the
// foot of one page, under no closing rule, the rest of its cells at the top of the next. Kelk dropped the part of the
// row above the break — the table on that page ended at its last rule — with no reason: the lab file of lostText (3.1).
// The text is our own. corpus/cut-row.md → pdf/en/chrome-cutrow--cut-row.pdf
//   node scripts/make-lost31.js [paragraphs]       (the number of paragraphs before the table: 3)
const { pdfPath, fileUrl, req } = require('./env.js');
const fs = require('fs'), path = require('path'), os = require('os');
const { chromium } = req('playwright');
const N = +(process.argv[2] || 3);
const P = [
  'The archive moves its reading room to the new building in the spring. The shelves are built, the lights are in, and the first boxes will go over in the second week of March.',
  'Each box is checked against the list before it leaves, given a new label with its shelf number, and signed for when it arrives. Damaged volumes go to the conservation team first.',
  'Readers who have booked a place on the days of the move will be offered another date. The catalogue shows the new shelf numbers as soon as each delivery has been checked.',
  'The table below gives the deliveries in order. A delivery that is late moves the ones after it by the same number of days.',
];
const ROWS = [
  ['1', '9 March', 'Ship logs', 'Forty boxes from the basement store, checked and labeled in February, with the pilot books of the same years', 'Ready'],
  ['2', '11 March', 'Maps', 'The harbor charts and the survey sheets, flat in their drawers', 'Ready'],
  ['3', '16 March', 'Letters', 'The harbor master\'s letters, in their original bundles', 'Waiting'],
];
(async () => {
  const b = await chromium.launch(), page = await b.newPage();
  const rows = ROWS.map((r) => '<tr>' + r.map((c) => `<td>${c}</td>`).join('') + '</tr>').join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font:12px/1.5 "Liberation Sans"} p{margin:0 0 10px} h1{font-size:18px;margin:0 0 12px}
    table{border-collapse:collapse;width:100%} td,th{border:1px solid #000;padding:3px 5px;vertical-align:top;text-align:left}
    </style></head><body><h1>Moving the reading room</h1>${P.slice(0, N).map((t) => `<p>${t}</p>`).join('')}<p>${P[3]}</p>
    <table><tr><th>No.</th><th>Date</th><th>Records</th><th>Contents</th><th>State</th></tr>${rows}</table>
    <p>The last delivery closes the move. The reading room opens again on the first Monday after it.</p></body></html>`;
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kelk-cutrow-')), 'p.html'); fs.writeFileSync(f, html);
  await page.goto(fileUrl(f));
  await page.pdf({ path: pdfPath('chrome-cutrow--cut-row.pdf'), width: '420px', height: '420px', margin: { top: '30px', bottom: '30px', left: '30px', right: '30px' } });
  await b.close();
  console.log('chrome-cutrow--cut-row.pdf');
})();
