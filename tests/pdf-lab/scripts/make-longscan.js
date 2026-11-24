// A long scanned book of our own text, for measuring the app on large scans (3.7): the lab's 300 dpi scans
// (pdf/rtl/scan-300--*.pdf, made by make-scans.js) joined in name order, again and again, up to PAGES pages.
//   node scripts/make-longscan.js [pages] [out.pdf]      (default: 290 pages, out/longscan.pdf)
// Each page is one 1-bit picture and no text, as a scanner writes it. The file is made when needed and never
// committed (about 6 MB); the same pages in the same order every time, with fixed dates and no personal metadata.
// Measured by run-longscan.js.
const fs = require('fs'), path = require('path');
const { LAB, OUT, req } = require('./env.js');
const { PDFDocument } = req('pdf-lib');

(async () => {
  const pages = +(process.argv[2] || 290);
  const out = path.resolve(process.argv[3] || path.join(OUT, 'longscan.pdf'));
  const dir = path.join(LAB, 'pdf', 'rtl');
  const srcs = fs.readdirSync(dir).filter((f) => /^scan-300--.*\.pdf$/.test(f)).sort();
  if (!srcs.length) throw new Error('no scan-300--*.pdf in ' + dir + ': run make-scans.js first');
  const docs = [];
  for (const f of srcs) docs.push(await PDFDocument.load(fs.readFileSync(path.join(dir, f))));
  const book = await PDFDocument.create();
  let n = 0;
  while (n < pages) {
    for (const d of docs) {
      const idx = d.getPageIndices().slice(0, pages - n);
      if (!idx.length) break;
      (await book.copyPages(d, idx)).forEach((p) => book.addPage(p));
      n += idx.length;
    }
  }
  const when = new Date('2026-01-01T00:00:00Z');
  book.setTitle('Kelk lab: a long scan of our own text');
  book.setProducer('Kelk pdf-lab make-longscan.js'); book.setCreator('Kelk pdf-lab');
  book.setCreationDate(when); book.setModificationDate(when);
  fs.writeFileSync(out, await book.save({ useObjectStreams: false }));
  console.log(out + ': ' + n + ' pages from ' + srcs.length + ' lab scans, ' + (fs.statSync(out).size / 1048576).toFixed(1) + ' MB');
})().catch((e) => { console.error(e); process.exit(1); });
