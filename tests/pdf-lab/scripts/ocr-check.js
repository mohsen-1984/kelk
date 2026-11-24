// The OCR engine on the lab's scanned pages (Kelk 3.4): each pdf/rtl/scan-* PDF imported with options.ocr 'read'
// (tools/pdf-lab.html in Chromium, from file://; the engine loaded beside lib/ as the importer's default does), its
// Markdown's letters and words against corpus/<doc>.md — CER and WER after one normalisation of both (NFKC, ی and ک,
// digits, no marks or tatweel, ZWNJ a space) —, the time a page, the report's OCR list, and that the progress names
// every line. Then the Cancel: an import aborted at its first OCR line must stop within one line.
//   node scripts/ocr-check.js [filter]
// Not part of the gate (its expectations, expect.json ocrRead, are the release's next step); prints a few lines.
const fs = require('fs'), path = require('path');
const { fileUrl } = require('./env.js');
const { chromium } = require('./env.js').req('playwright');
const LAB = path.join(__dirname, '..'), KELK = require('./env.js').KELK;

const DIG = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
const norm = (s) => s.normalize('NFKC').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[۰-۹٠-٩]/g, (d) => DIG[d])
  .replace(/[ً-ٰٟـ]/g, '').replace(/‌/g, ' ').replace(/\s+/g, ' ').trim();
const lev = (a, b) => {
  if (a.length < b.length) [a, b] = [b, a];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0)));
    prev = cur;
  }
  return prev[b.length];
};
// (the Markdown's marks are not letters: headings', lists', emphasis)
const plain = (md) => md.replace(/^#+\s*/gm, '').replace(/^\s*[-*+]\s+/gm, '').replace(/[*_`>|]/g, ' ');

(async () => {
  const filter = process.argv[2] ? new RegExp(process.argv[2]) : null;
  const dir = path.join(LAB, 'pdf', 'rtl');
  const files = fs.readdirSync(dir).filter((f) => /^scan-.*\.pdf$/.test(f) && (!filter || filter.test(f))).sort();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(fileUrl(KELK + '/tools/pdf-lab.html'));
  let tc = 0, te = 0, wc = 0, we = 0, pages = 0, ms = 0;
  for (const f of files) {
    const b64 = fs.readFileSync(path.join(dir, f)).toString('base64');
    const r = await page.evaluate(async ({ b64 }) => {
      const bin = atob(b64), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const stages = [];
      const t0 = performance.now();
      const r = await PdfImporter.create({ images: 'drop', ocr: 'read' })
        .fromArrayBuffer(u.buffer, { onStage: (s, d, n, a) => { if (/^ocr/.test(s)) stages.push([s, d, n, a]); } });
      return { md: r.markdown, ms: performance.now() - t0, ocr: r.report.ocr, notes: r.report.notes.map((x) => x.code), stages };
    }, { b64 });
    const doc = f.match(/--([\w-]+)\.pdf$/)[1];
    const want = norm(plain(fs.readFileSync(path.join(LAB, 'corpus', doc + '.md'), 'utf8'))), got = norm(plain(r.md));
    const c = lev([...want], [...got]), w = lev(want.split(' '), got.split(' '));
    const lines = r.ocr.reduce((n, p) => n + p.lines, 0);
    // (every line named: one 'ocr' step a line, and one at each page's end)
    const named = r.stages.filter((s) => s[0] === 'ocr' && s[3] && s[3][1] <= s[3][2]).length >= lines;
    tc += want.length; te += c; wc += want.split(' ').length; we += w; pages += r.ocr.length; ms += r.ms;
    console.log(f.padEnd(34), 'pages', r.ocr.length, 'lines', String(lines).padStart(3), 'conf', r.ocr.map((p) => p.conf).join('/'),
      'CER', (100 * c / want.length).toFixed(2) + '%', 'WER', (100 * w / want.split(' ').length).toFixed(1) + '%',
      (r.ms / 1000 / Math.max(1, r.ocr.length)).toFixed(1) + ' s/page', named ? 'steps named' : 'STEPS NOT NAMED',
      r.ocr.some((p) => p.notes.length) ? 'notes ' + r.ocr.map((p) => p.notes.join('+') || '-').join('/') : '',
      r.notes.filter((n) => /^ocr/.test(n)).join(' '));
  }
  if (files.length) console.log('all'.padEnd(34), 'pages', pages, 'CER', (100 * te / tc).toFixed(2) + '%', 'WER', (100 * we / wc).toFixed(1) + '%', (ms / 1000 / pages).toFixed(1) + ' s/page');
  // the Cancel: aborted when the first line is named; the lines read after it counted (at most one)
  if (files.length) {
    const b64 = fs.readFileSync(path.join(dir, files[0])).toString('base64');
    const r = await page.evaluate(async ({ b64 }) => {
      const bin = atob(b64), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const ac = new AbortController();
      let after = 0, at = null;
      try {
        await PdfImporter.create({ images: 'drop', ocr: 'read', signal: ac.signal }).fromArrayBuffer(u.buffer, {
          onStage: (s, d, n, a) => { if (s !== 'ocr' || !a) return; if (at) after++; else { at = a; ac.abort(); } }
        });
        return { stopped: false };
      } catch (e) { return { stopped: e.code === 'aborted', after: after }; }
    }, { b64 });
    console.log('cancel at the first line:', r.stopped ? 'stopped, ' + r.after + ' line(s) named after it' : 'NOT STOPPED');
  }
  await browser.close();
})();
