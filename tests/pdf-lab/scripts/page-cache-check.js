// «Read with OCR» on new pages only (3.7, options.pageCache): a multi-page lab scan imported as the app does it — first
// with its scanned pages left as pictures, then read with OCR range by range, the file's caches kept between the runs
// (pageCache: the scanned pages as read; ocrCache: the pages OCR read) — must give the same Markdown, byte for byte, as
// one import that reads the same pages with OCR and no cache. And the later runs must not read a page again (pdf.js's
// getOperatorList) unless OCR reads it for the first time.
//   node scripts/page-cache-check.js [file.pdf …]      (default: three lab scans — three pages under a running head,
//   two plain pages, a page with a drawing)
// Exit 1 on a difference. Part of CI's lab job.
const fs = require('fs'), path = require('path');
const env = require('./env.js');
const { chromium } = env.req('playwright');

const FILES = process.argv.slice(2).length ? process.argv.slice(2) :
  ['scan-300--scan-heads-fa.pdf', 'scan-300--scan-plain-fa.pdf', 'scan-300--scan-picture-fa.pdf'].map((f) => path.join(env.LAB, 'pdf', 'rtl', f));

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const page = await b.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(env.lab);
  for (const f of env.importerFiles(env.KELK)) await page.addScriptTag({ path: f });
  let bad = 0;
  for (const file of FILES) {
    const r = await page.evaluate(async (b64) => {
      const bin = atob(b64), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      // pdf.js's operator lists counted, page by page (a page read is a page decoded)
      const lib = window.pdfjsLib, get = lib.getDocument.bind(lib);
      let reads = [];
      const counted = function () {
        const task = get.apply(null, arguments), p = task.promise;
        task.promise = p.then(function (doc) {
          const gp = doc.getPage.bind(doc);
          doc.getPage = function (n) { return gp(n).then(function (pg) { const o = pg.getOperatorList.bind(pg); pg.getOperatorList = function () { reads.push(n); return o.apply(null, arguments); }; return pg; }); };
          return doc;
        });
        return task;
      };
      try { lib.getDocument = counted; } catch (e) { /* frozen */ }
      if (lib.getDocument !== counted) window.pdfjsLib = Object.assign(Object.create(Object.getPrototypeOf(lib)), lib, { getDocument: counted });
      const opts = { images: 'markdown', onImage: function (src, o) { return 'img-' + o.page + '-' + o.index; } };
      const run = async function (o) { reads = []; const x = await PdfImporter.create(Object.assign({}, opts, o)).fromArrayBuffer(u8.slice().buffer); return { md: x.markdown, reads: reads.slice() }; };
      const task = pdfjsLib.getDocument({ data: u8.slice() }), n = (await task.promise).numPages;
      await task.destroy();
      const pages = new Map(), cache = new Map(), out = { n: n, steps: [] };
      // the app's way: pictures first, then ranges, each run adding to the pages read before
      out.steps.push(Object.assign({ what: 'pictures' }, await run({ pageCache: pages })));
      const ranges = n >= 3 ? [[1], [1, 2, 3]] : [[1], Array.from({ length: n }, (_, i) => i + 1)];
      for (const rg of ranges) out.steps.push(Object.assign({ what: 'ocr ' + rg.join(',') }, await run({ ocr: 'read', ocrPages: rg, ocrCache: cache, pageCache: pages })));
      // one import, no cache
      const whole = await run({ ocr: 'read', ocrPages: ranges[ranges.length - 1] });
      out.same = out.steps[out.steps.length - 1].md === whole.md;
      out.wholeLen = whole.md.length;
      out.cached = pages.size;
      return out;
    }, fs.readFileSync(file).toString('base64'));
    const name = path.basename(file);
    const [pics, first, last] = r.steps;
    // pictures: every page read once; the first range: only page 1 read again; the second: only its pages after 1
    const all = Array.from({ length: r.n }, (_, i) => i + 1);
    const want = [all.join(','), '1', (r.n >= 3 ? [2, 3] : all.slice(1)).join(',')];
    const got = [pics.reads, first.reads, last.reads].map((x) => Array.from(new Set(x)).sort((a, c) => a - c).join(','));
    const readsOk = got.every((g, k) => g === want[k]);
    const ok = r.same && readsOk && r.cached === r.n;
    if (!ok) bad++;
    console.log((ok ? 'ok   ' : 'FAIL ') + name + ': ' + r.n + ' pages, ' + r.cached + ' cached; pages read per run ' + got.map((g) => '[' + g + ']').join(' ') +
      (readsOk ? '' : ' (want ' + want.map((g) => '[' + g + ']').join(' ') + ')') + '; Markdown ' + (r.same ? 'the same as one import' : 'DIFFERS from one import') + ' (' + r.wholeLen + ' chars)');
  }
  if (errs.length) { console.log('page errors: ' + errs.slice(0, 3).join(' | ')); bad++; }
  await b.close();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
