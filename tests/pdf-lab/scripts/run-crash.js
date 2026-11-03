// Stability sweep: import every PDF under a folder (subfolders too; default: the lab's pdf/ and ladder/ — the files
// the fallback ladder must demote, lib/pdfimport/ladder.js); report errors,
// timeouts and slow files. Exit 1 on any error or timeout (CI); files over 25 MB are skipped, slow ones only listed.
//   node scripts/run-crash.js [dir] [kelk root] [timeout ms] [--show-held]
// Held-out files (fuzz/heldout, the PDFs of a held-out real document: env.js, tests/pdf-lab/HELDOUT.md) are imported like the
// others but kept nameless: in the totals, their crashes, timeouts and slow imports as counts only, no row of theirs
// in crash-*.json. --show-held prints and writes them by name — and logs the opening (env.js openHeld).
const fs = require('fs'), path = require('path');
const env = require('./env.js');
const { chromium } = env.req('playwright');
(async () => {
  const argv = process.argv.slice(2), showHeld = argv.includes('--show-held');
  const [dirArg, root = env.KELK, tmo = '45000'] = argv.filter((a) => a !== '--show-held');
  const dir = dirArg || path.join(env.LAB, 'pdf');
  const files = dirArg ? env.labPdfs(dirArg) : env.labPdfs(dir).concat(env.labPdfs(path.join(env.LAB, 'ladder')));
  if (!files.length) throw new Error('no PDFs under ' + dir);
  const heldDocs = new Set(env.heldSplit().docs.heldout), docOf = require('./heldout.js').docOf;
  const isHeld = (x) => env.isFuzzHeld(x.file) || heldDocs.has(docOf(x.name));
  if (showHeld) env.openHeld(files.filter(isHeld).map((x) => x.file), 'run-crash.js --show-held');
  const hidden = { n: 0, errors: 0, timeouts: 0, slow: 0, big: 0, ms: 0 };
  const browser = await chromium.launch();
  let page = null;
  const fresh = async () => { if (page) await page.close().catch(() => {}); page = await browser.newPage(); await page.goto(env.fileUrl(root + '/tools/pdf-lab.html')); };
  await fresh();
  const out = [];
  for (const x of files) {
    const { name: f, file } = x, anon = !showHeld && isHeld(x);
    const buf = fs.readFileSync(file);
    if (buf.length > 25e6) { if (anon) hidden.big++; else out.push({ f, skip: 'big' }); continue; }
    const t0 = Date.now();
    let timer;
    const r = await Promise.race([
      page.evaluate(async (b64) => {
        const bin = atob(b64), u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        try { const r = await PdfImporter.create({ images: 'drop', maxPages: 60 }).fromArrayBuffer(u.buffer); return { n: r.markdown.length, notes: r.notes }; }
        catch (e) { return { error: String(e && e.message || e).slice(0, 160), stack: String(e && e.stack || '').split('\n').slice(1, 3).join(' | ').slice(0, 300) }; }
      }, buf.toString('base64')).catch((e) => ({ error: 'evaluate: ' + e.message.slice(0, 120) })),
      new Promise((ok) => { timer = setTimeout(() => ok({ timeout: true }), +tmo); })
    ]);
    clearTimeout(timer);
    const ms = Date.now() - t0;
    if (r.timeout || /evaluate:/.test(r.error || '')) await fresh();
    if (anon) {
      hidden.n++; hidden.ms += ms;
      if (r.error) hidden.errors++;
      if (r.timeout) hidden.timeouts++;
      if (ms > 8000) hidden.slow++;
      continue;
    }
    out.push(Object.assign({ f, ms }, r));
    if (r.error || r.timeout || ms > 8000) console.log(f, ms + 'ms', r.timeout ? 'TIMEOUT' : '', r.error || '', r.stack || '');
  }
  fs.writeFileSync(path.join(env.OUT, 'crash-' + path.basename(root) + '-' + path.basename(dir) + '.json'), JSON.stringify(out, null, 1));
  const err = out.filter((x) => x.error), to = out.filter((x) => x.timeout);
  console.log('files', out.length + hidden.n + hidden.big, 'errors', err.length + hidden.errors, 'timeouts', to.length + hidden.timeouts,
    'total s', Math.round((out.reduce((a, x) => a + (x.ms || 0), 0) + hidden.ms) / 1000));
  if (hidden.n || hidden.big) console.log('  of which held out (nameless, tests/pdf-lab/HELDOUT.md): ' + (hidden.n + hidden.big) + ' files, ' + hidden.errors + ' errors, ' +
    hidden.timeouts + ' timeouts, ' + hidden.slow + ' slow' + (hidden.big ? ', ' + hidden.big + ' skipped (big)' : '') +
    (hidden.errors || hidden.timeouts ? ' — --show-held names them, and logs the opening' : ''));
  if (err.length || to.length || hidden.errors || hidden.timeouts) process.exitCode = 1;
  await browser.close();
})().catch((e) => { console.error(e); process.exitCode = 1; process.exit(); });
