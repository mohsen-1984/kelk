// Stability sweep: import every PDF of a folder; report errors, timeouts and slow files.
//   node scripts/run-crash.js <dir> [kelk root] [timeout ms]
const fs = require('fs'), path = require('path');
const { chromium } = require('./env.js').req('playwright');
(async () => {
  const [dir, root = require('./env.js').KELK, tmo = '45000'] = process.argv.slice(2);
  const files = fs.readdirSync(dir).filter((f) => /\.pdf$/i.test(f)).sort();
  const browser = await chromium.launch();
  let page = null;
  const fresh = async () => { if (page) await page.close().catch(() => {}); page = await browser.newPage(); await page.goto('file://' + root + '/tools/pdf-lab.html'); };
  await fresh();
  const out = [];
  for (const f of files) {
    const buf = fs.readFileSync(path.join(dir, f));
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
  fs.writeFileSync(path.join(require('./env.js').LAB, 'out', 'crash-' + path.basename(root) + '-' + path.basename(dir) + '.json'), JSON.stringify(out, null, 1));
  const err = out.filter((x) => x.error), to = out.filter((x) => x.timeout);
  console.log('files', out.length, 'errors', err.length, 'timeouts', to.length, 'total s', Math.round(out.reduce((a, x) => a + (x.ms || 0), 0) / 1000));
  await browser.close();
})();
