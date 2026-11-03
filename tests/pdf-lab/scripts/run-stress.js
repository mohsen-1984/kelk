// Stress: one big PDF and injected faults, through the importer in Chromium.
//   node scripts/run-stress.js big.pdf [small.pdf]      (big.pdf: e.g. qpdf --empty --pages pdf/*.pdf -- big.pdf)
// Exit code 1 when one of the expectations below fails.
// big:    total time, and the longest the main thread was held (PerformanceObserver 'longtask', and a timer
//         heartbeat's longest gap) — a page that
//         keeps the thread for seconds freezes Kelk's interface
// faults: a page that throws in extraction, another in layout — the import must finish with the other pages
//         and a 'pageFailed' note, not reject; an AbortSignal must stop it with err.code 'aborted'
const fs = require('fs');
const { lab, req } = require('./env.js');
(async () => {
  const { chromium } = req('playwright');
  const browser = await chromium.launch(), page = await browser.newPage();
  await page.goto(lab);
  const run = (file, mode) => page.evaluate(async ({ b64, mode }) => {
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
    if (mode === 'faults') {
      P._extractPage = function (doc, num) { if (num === 2) throw new Error('injected: extraction of page 2'); return ex.apply(this, arguments); };
      P._pageBlocks = function (pl) { if (pl.p.num === 3) throw new Error('injected: layout of page 3'); return pb.apply(this, arguments); };
    }
    const ac = new AbortController();
    if (mode === 'abort') setTimeout(() => ac.abort(), 300);
    const t0 = performance.now(); let out;
    try {
      const r = await PdfImporter.create({ images: 'drop', signal: ac.signal }).fromArrayBuffer(u.buffer, { onProgress: () => {} });
      out = { ok: true, chars: r.markdown.length, notes: r.notes, messages: r.messages.filter((m) => /page/i.test(m)).slice(0, 3) };
    } catch (e) { out = { ok: false, code: e.code || null, error: String(e.message || e).slice(0, 120) }; }
    out.ms = Math.round(performance.now() - t0);
    await new Promise((r) => setTimeout(r, 50)); po.disconnect(); clearInterval(hb);
    P._extractPage = ex; P._pageBlocks = pb;
    out.longest = Math.round(Math.max(0, ...longs)); out.longTasks = longs.length; out.heartbeatGap = Math.round(gap);
    return out;
  }, { b64: fs.readFileSync(file).toString('base64'), mode });
  const big = process.argv[2], small = process.argv[3] || big;
  const b = await run(big, 'plain'), f = await run(small, 'faults'), a = await run(big, 'abort');
  console.log('big     ', JSON.stringify(b));
  console.log('faults  ', JSON.stringify(f));
  console.log('abort   ', JSON.stringify(a));
  // what must hold: the big file imports and never holds the thread a second; the faults leave a note and the
  // other pages; an abort rejects with its code (when the file takes longer than the 300 ms before it)
  const fails = [];
  if (!b.ok) fails.push('big: ' + b.error);
  if (b.longest > 1000) fails.push('big: the main thread held ' + b.longest + ' ms at once');
  else if (b.heartbeatGap > 1000) fails.push('big: the main thread held ' + b.heartbeatGap + ' ms at once (heartbeat; no long task reported)');
  if (!f.ok || f.notes.indexOf('pageFailed') < 0) fails.push('faults: ' + (f.error || 'no pageFailed note'));
  if (b.ms > 600 && a.code !== 'aborted') fails.push('abort: not aborted (' + (a.code || a.ok) + ')');
  console.log(fails.length ? '\nFAILED\n  ' + fails.join('\n  ') : '\npassed');
  process.exitCode = fails.length ? 1 : 0;
  await browser.close();
})();
