// node cmp.js A B dir…  (A, B: a Kelk folder or its lib/PdfImporter.js — that version's core and parts) → per file: blocks that differ (quotes, tables, code counts) + line diff size
const fs = require('fs'), path = require('path');
const {chromium} = require('./env.js').req('playwright');
(async () => {
  const [A, B, ...dirs] = process.argv.slice(2);
  const files = dirs.flatMap((d) => require('./env.js').labPdfs(d).map((x) => x.file));
  require('./env.js').openHeld(files, 'cmp.js');        // held-out files opened: logged (tests/pdf-lab/HELDOUT.md)
  const b = await chromium.launch();
  const run = async (lib, file) => {
    const page = await b.newPage();
    await page.goto(require('./env.js').lab);
    for (const f of require('./env.js').importerFiles(lib)) await page.addScriptTag({ path: f });
    const r = await page.evaluate(async (b64) => {
      const bin = atob(b64), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      try { const x = await PdfImporter.create({ images: 'drop', asciiNumbers: false, persianLetters: false }).fromArrayBuffer(u.buffer); return x.markdown || ''; } catch (e) { return 'ERROR ' + e; }
    }, fs.readFileSync(file).toString('base64')).catch((e) => 'ERROR ' + e);
    await page.close(); return r;
  };
  const OUT = process.env.OUT;
  for (const f of files) {
    if (fs.statSync(f).size > 3e6) continue;
    const a = await run(A, f), c = await run(B, f);
    if (a === c) continue;
    const st = (m) => ({ q: (m.match(/^>/gm) || []).length, t: (m.match(/^\|/gm) || []).length, c: (m.match(/^```/gm) || []).length, hr: (m.match(/^---$/gm) || []).length });
    const sa = st(a), sc = st(c);
    console.log(path.basename(f).padEnd(45), 'quote', sa.q + '→' + sc.q, 'table', sa.t + '→' + sc.t, 'code', sa.c + '→' + sc.c, 'hr', sa.hr + '→' + sc.hr);
    if (OUT) { fs.writeFileSync(path.join(OUT, path.basename(f) + '.a.md'), a); fs.writeFileSync(path.join(OUT, path.basename(f) + '.b.md'), c); }
  }
  await b.close();
})();
