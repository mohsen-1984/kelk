// Import real-world PDFs (real/*.pdf) with the original and the current importer; compare each with
// pdftotext's words (recall: share of its words found; order: LCS / its words). Writes out/real/<v>/<name>.md
//   node scripts/run-real.js [filter]
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { chromium } = require('./env.js').req('playwright');
const { words } = require('./score.js');
const LAB = path.join(__dirname, '..');
const VERSIONS = { orig: require('./env.js').ORIG || require('./env.js').KELK, new: require('./env.js').KELK };   // KELK_ORIG=… for a "before" column

const { lcs, norm } = require('./realwords.js');   // pdftotext's words, Arabic script folded

(async () => {
  const filter = process.argv[2] ? new RegExp(process.argv[2]) : null;
  const dir = process.env.DIR || path.join(LAB, 'real');
  const files = fs.readdirSync(dir).filter((f) => /\.pdf$/i.test(f) && (!filter || filter.test(f))).sort();
  const browser = await chromium.launch();
  const res = {};
  for (const [v, root] of Object.entries(VERSIONS)) {
    const page = await browser.newPage();
    await page.goto('file://' + root + '/tools/pdf-lab.html');
    fs.mkdirSync(path.join(LAB, 'out', 'real', v), { recursive: true });
    for (const f of files) {
      const b64 = fs.readFileSync(path.join(dir, f)).toString('base64');
      const t0 = Date.now();
      let timer;
      const r = await Promise.race([page.evaluate(async (b64) => {
        const bin = atob(b64), u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        try { const r = await PdfImporter.create({ images: 'drop' }).fromArrayBuffer(u.buffer); return { markdown: r.markdown, notes: r.notes }; }
        catch (e) { return { error: String(e && e.message || e) }; }
      }, b64), new Promise((ok) => { timer = setTimeout(() => ok({ error: 'timeout' }), 120000); })]);
      clearTimeout(timer);
      (res[f] = res[f] || {})[v] = Object.assign(r, { ms: Date.now() - t0 });
      if (r.markdown !== undefined) fs.writeFileSync(path.join(LAB, 'out', 'real', v, f.replace(/\.pdf$/i, '.md')), r.markdown);
    }
    await page.close();
  }
  await browser.close();
  console.log('file'.padEnd(30), 'ref', '  orig rec/ord ', '  new rec/ord ', 'ms');
  for (const f of files) {
    let ref = '';
    try { ref = cp.execFileSync('pdftotext', ['-enc', 'UTF-8', path.join(dir, f), '-'], { encoding: 'utf8' }); } catch (e) { /* none */ }
    const rw = norm(words(ref.replace(/-\n/g, '')));
    const cell = (x) => x.error ? ('ERR ' + x.error).slice(0, 14).padEnd(14) : (() => {
      const gw = norm(words(x.markdown));
      const bag = new Map(); gw.forEach((w) => bag.set(w, (bag.get(w) || 0) + 1));
      let hit = 0; rw.forEach((w) => { const n = bag.get(w) || 0; if (n) { hit++; bag.set(w, n - 1); } });
      return ((rw.length ? 100 * hit / rw.length : 100).toFixed(1).padStart(6) + ' ' + (100 * lcs(rw, gw)).toFixed(1).padStart(6) + ' ');
    })();
    console.log(f.slice(0, 30).padEnd(30), String(rw.length).padStart(5), cell(res[f].orig), cell(res[f].new), res[f].new.ms);
  }
})();
