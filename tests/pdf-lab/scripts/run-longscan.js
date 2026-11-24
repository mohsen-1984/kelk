// Kelk on a long scan, as a user meets it in the app (3.7): index.html from file:// in Chromium, Settings as stored
// (Scanned pages: «Ask», the default), the file given to the page's file input.
//   node scripts/run-longscan.js [file.pdf] [first-range] [second-range] [out.json]
//   (defaults: out/longscan.pdf from make-longscan.js, «1-3», «4-5», out/longscan.json)
// It measures, in order:
//   import    the time from the file's choice to its text in the editor; how often pdf.js drew a page (render) and
//             read its operators (getOperatorList) — a page drawn twice is decoded twice; the renderer's memory at its
//             height (Linux: ps, as run-stress.js) and the JS heap after; what the report panel says (its head line,
//             whether it holds «Read with OCR», whether it says the document is too large to keep)
//   ocr1      «Read with OCR» on the first range, through the report's own field and button: the time, the pages
//             drawn again, the memory
//   ocr2      the same with the second range (3.6: the first range's pages come from the session's cache)
//   reload    the page reloaded: whether the text came back, how many of its pictures the browser kept
// Not a gate (an import of ~300 scanned pages takes about a minute): the numbers go into a PR's text, before and after.
const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./env.js').req('playwright');
const { KELK, OUT, fileUrl } = require('./env.js');

const rss = () => { try { const v = +execSync("ps -eo rss,args | grep -- '--type=renderer' | grep -v grep | sort -n | tail -1 | awk '{print $1}'").toString().trim(); return v ? Math.round(v / 1024) : null; } catch (e) { return null; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const src = path.resolve(process.argv[2] || path.join(OUT, 'longscan.pdf'));
  const r1 = process.argv[3] || '1-3', r2 = process.argv[4] || '4-5';
  const dst = path.resolve(process.argv[5] || path.join(OUT, 'longscan.json'));
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const ctx = await b.newContext();
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(fileUrl(KELK + '/index.html'));
  await page.waitForFunction(() => window.Kelk && Kelk.editor && Kelk.importer && Kelk.libs, null, { timeout: 30000 });
  // pdf.js counted: every page's render and getOperatorList, through getDocument
  await page.evaluate(async () => {
    await Kelk.libs.need('pdfjs');
    const lib = window.pdfjsLib, get = lib.getDocument.bind(lib);
    window.__count = { render: 0, ops: 0 };
    const wrapPage = (pg) => {
      const r = pg.render.bind(pg), o = pg.getOperatorList.bind(pg);
      pg.render = function () { window.__count.render++; return r.apply(null, arguments); };
      pg.getOperatorList = function () { window.__count.ops++; return o.apply(null, arguments); };
      return pg;
    };
    const getDocument = function () {
      const task = get.apply(null, arguments), p = task.promise;
      task.promise = p.then((doc) => { const gp = doc.getPage.bind(doc); doc.getPage = (n) => gp(n).then(wrapPage); return doc; });
      return task;
    };
    try { lib.getDocument = getDocument; } catch (e) { /* frozen */ }
    if (lib.getDocument !== getDocument) window.pdfjsLib = Object.assign(Object.create(Object.getPrototypeOf(lib)), lib, { getDocument: getDocument });
    Kelk.editor.set('');
  });
  // the renderer's memory, sampled while a step runs
  const watched = async (fn) => {
    let on = true, peak = null;
    const w = (async () => { while (on) { const v = rss(); if (v !== null) peak = Math.max(peak || 0, v); await sleep(250); } })();
    const t0 = Date.now();
    try { await fn(); } finally { on = false; await w; }
    return { ms: Date.now() - t0, peakMB: peak };
  };
  const done = (before) => page.waitForFunction((b) => Kelk.editor.value() !== b && Kelk.editor.value().length > 0 &&
    !(document.getElementById('task') || {}).open, before, { timeout: 30 * 60000, polling: 250 });
  const counts = () => page.evaluate(() => { const c = Object.assign({}, window.__count); window.__count.render = 0; window.__count.ops = 0; return c; });
  const panel = () => page.evaluate(() => {
    const box = document.getElementById('import-report'), q = (id) => document.getElementById(id);
    const vis = (x) => !!x && !x.hidden && !x.closest('[hidden]');
    return {
      shown: !!box && !box.hidden,
      head: (q('import-report-brief') || {}).textContent || '',
      ocrOffered: vis(q('report-ocr')),
      safeOffered: vis(q('report-safe')),
      tooLarge: !!(Kelk.images && Kelk.images.stored && !Kelk.images.stored()),        // (the report's one line, 3.6)
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null
    };
  });
  const result = { file: path.basename(src), bytes: fs.statSync(src).size, at: new Date().toISOString() };

  // 1. the import
  const m1 = await watched(async () => {
    await (await page.$('input[type=file]')).setInputFiles(src);
    await done('');
  });
  await sleep(500);
  result.import = Object.assign(m1, await counts(), await panel(), { chars: await page.evaluate(() => Kelk.editor.value().length) });
  console.log('import ', JSON.stringify(result.import));

  // 2–3. «Read with OCR» on two ranges, through the report's field and button
  const ocr = async (range) => {
    const before = await page.evaluate(() => Kelk.editor.value());
    const vis = await page.evaluate(() => { const x = document.getElementById('report-ocr'); return !!x && !x.hidden; });
    if (!vis) return { skipped: 'no «Read with OCR» in the report' };
    const m = await watched(async () => {
      await page.evaluate((r) => {
        const box = document.getElementById('import-report');
        if (box.classList.contains('collapsed')) document.getElementById('import-report-toggle').click();
        document.getElementById('report-ocr-pages').value = r;
        document.getElementById('report-ocr').click();
      }, range);
      await done(before);
    });
    await sleep(500);
    return Object.assign({ range: range }, m, await counts(), await panel());
  };
  result.ocr1 = await ocr(r1); console.log('ocr1   ', JSON.stringify(result.ocr1));
  result.ocr2 = await ocr(r2); console.log('ocr2   ', JSON.stringify(result.ocr2));

  // 4. reload: the text and its pictures, as the browser kept them
  const names = await page.evaluate(() => (Kelk.editor.value().match(/!\[[^\]]*\]\(([^)\s]+)/g) || []).map((s) => s.replace(/^.*\(/, '')));
  await page.reload();
  await page.waitForFunction(() => window.Kelk && Kelk.editor && Kelk.images, null, { timeout: 30000 });
  await sleep(1000);
  result.reload = await page.evaluate((ns) => {
    const text = Kelk.editor.value(), uniq = Array.from(new Set(ns));
    const kept = uniq.filter((n) => { try { return !!Kelk.images.get(decodeURI(n)) || !!Kelk.images.get(n); } catch (e) { return false; } }).length;
    return { textBack: text.length > 0, pictures: uniq.length, picturesKept: kept };
  }, names);
  console.log('reload ', JSON.stringify(result.reload));
  result.errors = errs;
  if (errs.length) console.log('errors ', errs.slice(0, 3).join(' | '));
  fs.writeFileSync(dst, JSON.stringify(result, null, 2));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
