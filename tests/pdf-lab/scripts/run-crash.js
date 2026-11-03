// Stability sweep: import every PDF under a folder (subfolders too; default: the lab's pdf/ and ladder/ — the files
// the fallback ladder must demote, lib/pdfimport/ladder.js); report errors,
// timeouts and slow files. Exit 1 on any error or timeout (CI); files over 25 MB are skipped, slow ones only listed.
//   node scripts/run-crash.js [dir] [kelk root] [timeout ms]
const fs = require('fs'), path = require('path');
const env = require('./env.js');
const { chromium } = env.req('playwright');
(async () => {
  const [dirArg, root = env.KELK, tmo = '45000'] = process.argv.slice(2);
  const dir = dirArg || path.join(env.LAB, 'pdf');
  const files = dirArg ? env.labPdfs(dirArg) : env.labPdfs(dir).concat(env.labPdfs(path.join(env.LAB, 'ladder')));
  if (!files.length) throw new Error('no PDFs under ' + dir);
  const browser = await chromium.launch();
  let page = null;
  const fresh = async () => { if (page) await page.close().catch(() => {}); page = await browser.newPage(); await page.goto(env.fileUrl(root + '/tools/pdf-lab.html')); };
  await fresh();
  const out = [];
  for (const { name: f, file } of files) {
    const buf = fs.readFileSync(file);
    if (buf.length > 25e6) { out.push({ f, skip: 'big' }); continue; }
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
    out.push(Object.assign({ f, ms }, r));
    if (r.timeout || /evaluate:/.test(r.error || '')) await fresh();
    if (r.error || r.timeout || ms > 8000) console.log(f, ms + 'ms', r.timeout ? 'TIMEOUT' : '', r.error || '', r.stack || '');
  }
  fs.writeFileSync(path.join(env.OUT, 'crash-' + path.basename(root) + '-' + path.basename(dir) + '.json'), JSON.stringify(out, null, 1));
  const err = out.filter((x) => x.error), to = out.filter((x) => x.timeout);
  console.log('files', out.length, 'errors', err.length, 'timeouts', to.length, 'total s', Math.round(out.reduce((a, x) => a + (x.ms || 0), 0) / 1000));
  if (err.length || to.length) process.exitCode = 1;
  await browser.close();
})().catch((e) => { console.error(e); process.exitCode = 1; process.exit(); });
