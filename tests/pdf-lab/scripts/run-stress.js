// Stress: one big PDF and injected faults, through the importer in Chromium.
//   node scripts/run-stress.js big.pdf [small.pdf [scan.pdf]]      (big.pdf: e.g. qpdf --empty --pages pdf/*.pdf -- big.pdf;
//                                       scan.pdf: e.g. the scans of pdf/rtl/scan-300--*.pdf joined eight times)
// Exit code 1 when one of the expectations below fails.
// big:    total time, and the longest the main thread was held (PerformanceObserver 'longtask', and a timer
//         heartbeat's longest gap) — a page that
//         keeps the thread for seconds freezes Kelk's interface. Opening the file is counted apart (`open`: the long
//         tasks before the first page is read): pdf.js reads the file's structure on the main thread under file://,
//         in one piece and in proportion to its size — a second for the 22 MB the lab's files make together — and
//         no step of the importer can break it; its limit is its own (3 s), so the lab can grow
// faults: a page that throws in extraction, another in layout — the import must finish with the other pages, not
//         reject: in auto mode the fallback ladder (lib/pdfimport/ladder.js) gives the first as pdf.js's text
//         ('textContent') and the second simplified, with no 'pageFailed'; in 'full' mode both are 'pageFailed' as
//         before the ladder; an AbortSignal must stop it with err.code 'aborted'
// scan:   a long scan (the third argument: e.g. the lab's scans joined several times by qpdf, our own text), its pages
//         cut as pictures as the app does: the renderer's memory at its height (Linux: ps), under SCAN_MB — pdf.js's
//         caches of each page go once it is read, else every page's decoded scan stayed until its layout (a
//         291-page scanned book: 5.3 GB; 3.6)
// ladder: the files of tests/pdf-lab/ladder/ (scripts/make-ladder.js) given in the mode each must be demoted to —
//         a scan with no text 'scan' (OCR not run: kept as its picture, 3.6), glued words with lost glyphs 'simplified', a quarter of them lost 'simplified' too
//         (pdf.js's text, the glyphs' source, loses the same: taken only where it loses demonstrably fewer)
const fs = require('fs');
const path = require('path');
const { lab, req, LAB } = require('./env.js');
const { execSync } = require('child_process');
const SCAN_MB = 1500;
// the renderer's resident memory in MB (Linux; null elsewhere): the largest renderer process
const rss = () => { try { const v = +execSync("ps -eo rss,args | grep -- '--type=renderer' | grep -v grep | sort -n | tail -1 | awk '{print $1}'").toString().trim(); return v ? Math.round(v / 1024) : null; } catch (e) { return null; } };
(async () => {
  const { chromium } = req('playwright');
  const browser = await chromium.launch(), page = await browser.newPage();
  await page.goto(lab);
  const run = (file, mode, ladder) => page.evaluate(async ({ b64, mode, ladder }) => {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const longs = [];
    const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => longs.push([e.startTime, e.duration])));
    po.observe({ type: 'longtask', buffered: false });
    // (and a heartbeat — the longest wait between two 50 ms timer ticks: Chromium 141's observer reported no long
    // task for a 52 s synchronous step that Chromium 156's reports; the heartbeat sees it in both)
    let beat = performance.now(), gap = 0, first = Infinity;                       // first: when the first page is read
    const hb = setInterval(() => { const n = performance.now(); if (beat >= first) gap = Math.max(gap, n - beat); beat = n; }, 50);
    const P = PdfImporter.prototype, ex = P._extractPage, pb = P._pageBlocks;
    P._extractPage = function () { if (first === Infinity) first = performance.now(); return ex.apply(this, arguments); };
    if (mode === 'faults' || mode === 'faults-full') {
      P._extractPage = function (doc, num) { if (first === Infinity) first = performance.now(); if (num === 2) throw new Error('injected: extraction of page 2'); return ex.apply(this, arguments); };
      P._pageBlocks = function (pl) { if (pl.p.num === 3) throw new Error('injected: layout of page 3'); return pb.apply(this, arguments); };
    }
    const ac = new AbortController();
    if (mode === 'abort') setTimeout(() => ac.abort(), 300);
    const t0 = performance.now(); let out;
    try {
      const r = await PdfImporter.create(Object.assign({ images: 'drop', signal: ac.signal, mode: ladder || 'auto' }, mode === 'scan' ? { images: 'markdown', onImage: () => 'img' } : {})).fromArrayBuffer(u.buffer, { onProgress: () => {} });
      out = { ok: true, chars: r.markdown.length, notes: r.notes, messages: r.messages.filter((m) => /page/i.test(m)).slice(0, 3),
              modes: (r.pages || []).map((p) => p.mode), failed: r.failedPages, report: r.report };
    } catch (e) { out = { ok: false, code: e.code || null, error: String(e.message || e).slice(0, 120) }; }
    out.ms = Math.round(performance.now() - t0);
    await new Promise((r) => setTimeout(r, 50)); po.disconnect(); clearInterval(hb);
    P._extractPage = ex; P._pageBlocks = pb;
    // (a task that starts before the first page is read is the file's opening)
    out.longest = Math.round(Math.max(0, ...longs.filter((e) => e[0] + 1 >= first).map((e) => e[1])));
    out.open = Math.round(Math.max(0, ...longs.filter((e) => e[0] + 1 < first).map((e) => e[1])));
    out.longTasks = longs.length; out.heartbeatGap = Math.round(gap);
    return out;
  }, { b64: fs.readFileSync(file).toString('base64'), mode, ladder });
  // a long scan, first: the renderer's memory sampled while it imports (first, in a renderer nothing else has used —
  // after the big file the renderer keeps what that took, 2.5 GB on CI's runner)
  let sc = null;
  if (process.argv[4]) {
    let peak = null, on = true;
    const watch = (async () => { while (on) { const v = rss(); if (v !== null) peak = Math.max(peak || 0, v); await new Promise((r) => setTimeout(r, 250)); } })();
    sc = await run(process.argv[4], 'scan'); on = false; await watch;
    sc.peakMB = peak;
    console.log('scan    ', JSON.stringify({ ok: sc.ok, pages: (sc.modes || []).length, ms: sc.ms, peakMB: sc.peakMB, error: sc.error }));
  }
  const big = process.argv[2], small = process.argv[3] || big;
  const b = await run(big, 'plain'), f = await run(small, 'faults'), ff = await run(small, 'faults-full', 'full'), a = await run(big, 'abort');
  const brief = (x) => JSON.stringify(Object.assign({}, x, { report: x.report ? { summary: x.report.summary, pages: x.report.pages } : undefined }));
  console.log('big     ', brief(b));
  console.log('faults  ', brief(f));
  console.log('faults (mode full)', brief(ff));
  console.log('abort   ', JSON.stringify(a));
  // the ladder's own files: every page in the mode named (tests/pdf-lab/ladder/, made by scripts/make-ladder.js)
  const LADDER = { 'scan--article.pdf': 'scan', 't3-glued--lost.pdf': 'simplified', 't3-glued--lost25.pdf': 'simplified' };
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
  else if (b.open > 3000) fails.push('big: opening the file held the main thread ' + b.open + ' ms at once');
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
  if (sc && !sc.ok) fails.push('scan: ' + sc.error);
  else if (sc && sc.peakMB !== null && sc.peakMB > SCAN_MB) fails.push('scan: the renderer held ' + sc.peakMB + ' MB at its height (at most ' + SCAN_MB + ')');
  if (b.ms > 600 && a.code !== 'aborted') fails.push('abort: not aborted (' + (a.code || a.ok) + ')');
  console.log(fails.length ? '\nFAILED\n  ' + fails.join('\n  ') : '\npassed');
  process.exitCode = fails.length ? 1 : 0;
  await browser.close();
})();
