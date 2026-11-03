// Stress: one big PDF and injected faults, through the importer in Chromium.
//   node scripts/run-stress.js big.pdf [small.pdf]      (big.pdf: e.g. qpdf --empty --pages pdf/*.pdf -- big.pdf)
// Exit code 1 when one of the expectations below fails.
// big:    total time, and the longest the main thread was held (PerformanceObserver 'longtask', and a timer
//         heartbeat's longest gap) — a page that
//         keeps the thread for seconds freezes Kelk's interface
// faults: a page that throws in extraction, another in layout — the import must finish with the other pages, not
//         reject: in auto mode the fallback ladder (lib/pdfimport/ladder.js) gives the first as pdf.js's text
//         ('textContent') and the second simplified, with no 'pageFailed'; in 'full' mode both are 'pageFailed' as
//         before the ladder; an AbortSignal must stop it with err.code 'aborted'
// ladder: the files of tests/pdf-lab/ladder/ (scripts/make-ladder.js) given in the mode each must be demoted to —
//         a scan with no text 'ocr', glued words with lost glyphs 'simplified', a quarter of them lost 'simplified' too
//         (pdf.js's text, the glyphs' source, loses the same: taken only where it loses demonstrably fewer)
const fs = require('fs');
const path = require('path');
const { lab, req, LAB } = require('./env.js');
(async () => {
  const { chromium } = req('playwright');
  const browser = await chromium.launch(), page = await browser.newPage();
  await page.goto(lab);
  const run = (file, mode, ladder) => page.evaluate(async ({ b64, mode, ladder }) => {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const longs = [];
    const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => longs.push(e.duration)));
    po.observe({ type: 'longtask', buffered: false });
    // (and a heartbeat — the longest wait between two 50 ms timer ticks: Chromium 141's observer reported no long
    // task for a 52 s synchronous step that Chromium 156's reports; the heartbeat sees it in both)
    let beat = performance.now(), gap = 0;
    const hb = setInterval(() => { const n = performance.now(); gap = Math.max(gap, n - beat); beat = n; }, 50);
    const P = PdfImporter.prototype, ex = P._extractPage, pb = P._pageBlocks;
    if (mode === 'faults' || mode === 'faults-full') {
      P._extractPage = function (doc, num) { if (num === 2) throw new Error('injected: extraction of page 2'); return ex.apply(this, arguments); };
      P._pageBlocks = function (pl) { if (pl.p.num === 3) throw new Error('injected: layout of page 3'); return pb.apply(this, arguments); };
    }
    const ac = new AbortController();
    if (mode === 'abort') setTimeout(() => ac.abort(), 300);
    const t0 = performance.now(); let out;
    try {
      const r = await PdfImporter.create({ images: 'drop', signal: ac.signal, mode: ladder || 'auto' }).fromArrayBuffer(u.buffer, { onProgress: () => {} });
      out = { ok: true, chars: r.markdown.length, notes: r.notes, messages: r.messages.filter((m) => /page/i.test(m)).slice(0, 3),
              modes: (r.pages || []).map((p) => p.mode), failed: r.failedPages, report: r.report };
    } catch (e) { out = { ok: false, code: e.code || null, error: String(e.message || e).slice(0, 120) }; }
    out.ms = Math.round(performance.now() - t0);
    await new Promise((r) => setTimeout(r, 50)); po.disconnect(); clearInterval(hb);
    P._extractPage = ex; P._pageBlocks = pb;
    out.longest = Math.round(Math.max(0, ...longs)); out.longTasks = longs.length; out.heartbeatGap = Math.round(gap);
    return out;
  }, { b64: fs.readFileSync(file).toString('base64'), mode, ladder });
  const big = process.argv[2], small = process.argv[3] || big;
  const b = await run(big, 'plain'), f = await run(small, 'faults'), ff = await run(small, 'faults-full', 'full'), a = await run(big, 'abort');
  const brief = (x) => JSON.stringify(Object.assign({}, x, { report: x.report ? { summary: x.report.summary, pages: x.report.pages } : undefined }));
  console.log('big     ', brief(b));
  console.log('faults  ', brief(f));
  console.log('faults (mode full)', brief(ff));
  console.log('abort   ', JSON.stringify(a));
  // the ladder's own files: every page in the mode named (tests/pdf-lab/ladder/, made by scripts/make-ladder.js)
  const LADDER = { 'scan--article.pdf': 'ocr', 't3-glued--lost.pdf': 'simplified', 't3-glued--lost25.pdf': 'simplified' };
  const lad = {};
  for (const n of Object.keys(LADDER)) {
    const file = path.join(LAB, 'ladder', n);
    lad[n] = fs.existsSync(file) ? await run(file, 'plain') : { ok: false, error: 'missing: run scripts/make-ladder.js' };
    console.log('ladder  ', n.padEnd(22), JSON.stringify({ ok: lad[n].ok, modes: lad[n].modes, notes: lad[n].notes, error: lad[n].error }));
  }
  // what must hold: the big file imports and never holds the thread a second; the faults leave a note and the
  // other pages; an abort rejects with its code (when the file takes longer than the 300 ms before it)
  const fails = [];
  if (!b.ok) fails.push('big: ' + b.error);
  if (b.longest > 1000) fails.push('big: the main thread held ' + b.longest + ' ms at once');
  else if (b.heartbeatGap > 1000) fails.push('big: the main thread held ' + b.heartbeatGap + ' ms at once (heartbeat; no long task reported)');
  // (pages 2 and 3 of the small file: its extraction fault read as pdf.js's text, its layout fault simplified)
  if (!f.ok) fails.push('faults: ' + f.error);
  else {
    if (f.modes[1] !== 'textContent') fails.push('faults: page 2 (extraction) given as ' + f.modes[1] + ', not textContent');
    if (f.modes[2] !== 'simplified') fails.push('faults: page 3 (layout) given as ' + f.modes[2] + ', not simplified');
    if (f.notes.indexOf('pageFailed') >= 0) fails.push('faults: a pageFailed note where the ladder could give the page');
  }
  if (!ff.ok || ff.notes.indexOf('pageFailed') < 0 || String(ff.failed) !== '2,3') fails.push('faults (mode full): ' + (ff.error || 'not pageFailed on pages 2 and 3 (' + ff.failed + ')'));
  Object.keys(LADDER).forEach((n) => {
    const x = lad[n];
    if (!x.ok) fails.push('ladder ' + n + ': ' + x.error);
    else if (!x.modes.length || x.modes.some((m) => m !== LADDER[n])) fails.push('ladder ' + n + ': ' + x.modes.join(',') + ', not ' + LADDER[n]);
  });
  if (b.ms > 600 && a.code !== 'aborted') fails.push('abort: not aborted (' + (a.code || a.ok) + ')');
  console.log(fails.length ? '\nFAILED\n  ' + fails.join('\n  ') : '\npassed');
  process.exitCode = fails.length ? 1 : 0;
  await browser.close();
})();
