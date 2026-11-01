// An English letter of two pages whose head carries its date, reference number and attachments as bare values — their
// labels printed in the letterhead's paper (here: left out), the values in the page header on every page, as an office's
// letter template does. A Latin letter's bare values had stayed bare (labels were given to right-to-left letters only);
// a date that names its month («12 October 2026») was no date. corpus/letter-ltr.md → pdf/pages/chrome-letterhead--letter-ltr.pdf
const { pdfPath } = require('./env.js');
const fs = require('fs'), path = require('path'), os = require('os');
const { req } = require('./env.js');
const { chromium } = req('playwright');
const LAB = path.join(__dirname, '..');
const P = [
  'Thank you for your letter about the transfer of the harbour records to the city archive. We have now reviewed the list you sent and agree that the ship logs, the pilot books and the harbour master\'s letters from the years before the new quay was built belong together and should move as one collection.',
  'Before the transfer, each box will be checked against the list, cleaned and given a new label with its shelf number. Damaged volumes will be set aside for the conservation team, who will decide whether they can be handled by readers or should be copied first. We expect this work to take about six weeks.',
  'The reading room will close for two days while the boxes are moved. Readers who have booked a place on those days will be offered another date, and the catalogue will show the new shelf numbers as soon as each box is in place. Copies of the most used volumes will stay available in the reading room throughout.',
  'We would be grateful if your office could name one person to answer questions from our staff during the move, and to sign the receipt for each delivery. A draft receipt and the schedule of deliveries are enclosed with this letter.',
  'Once the collection is in place, we will hold a short visit for your staff to see the new storage and the reading room. We will write again with a date once the last delivery has been checked.',
  'Please let us know if any part of the list has changed since you sent it, or if some boxes need to stay with your office for a while longer. We can adjust the schedule of deliveries without difficulty at this stage.',
];
(async () => {
  const b = await chromium.launch(), page = await b.newPage();
  const body = P.concat(P, P.slice(0, 2)).map((t) => `<p>${t}</p>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font:12px/1.6 "Liberation Serif"} p{margin:0 0 10px} .sig{margin-top:28px}
    </style></head><body><p>Dear Ms Rahimi,</p>${body}<p>With best regards,</p><p class="sig"><b>Helen Morrow</b><br>Head of Records</p></body></html>`;
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kelk-lt-')), 'p.html'); fs.writeFileSync(f, html);
  await page.goto('file://' + f);
  // the head: the office's name at the left; at the right three bare values, one under the other (their labels are
  // the paper's, not the text's)
  const head = `<div style="width:100%;margin:0 0.75in;display:flex;justify-content:space-between;font-family:'Liberation Serif'">
    <div style="font-size:15px"><b>Northwind Archive Services</b><div style="font-size:10px">Records Office</div></div>
    <div style="font-size:10px;line-height:1.5;text-align:left">12 October 2026<br>NA/2026/0457<br>2 pages</div></div>`;
  await page.pdf({ path: pdfPath('chrome-letterhead--letter-ltr.pdf'), format: 'A4', displayHeaderFooter: true, headerTemplate: head,
    footerTemplate: '<div style="font-size:8px;width:100%;text-align:center"><span class="pageNumber"></span></div>',
    margin: { top: '1.3in', bottom: '0.8in', left: '0.75in', right: '0.75in' } });
  await b.close();
  console.log('chrome-letterhead--letter-ltr.pdf');
})();
