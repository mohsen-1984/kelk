// The metamorphic net (made by make-meta.js): import every seed and every transformed copy, and see what the
// transform changed. Per transform: how many files came back byte-identical to their seed's Markdown ("same"),
// the mean total against the corpus source, and its change from the seeds' own ("Δ") — the loss the transform
// alone caused. The worst files of each transform follow, so a fragile rule shows where it is.
//   node scripts/run-meta.js [transform-filter]
// Results: out/meta/<transform>/<seed>.md and out/meta/_scores.json (read by gate.js).
const { pdfPath } = require('./env.js');
const fs = require('fs'), path = require('path');
const { chromium } = require('./env.js').req('playwright');
const { score } = require('./score.js');
const { LAB, OUT, lab } = require('./env.js');
const META = path.resolve(process.env.LAB_META || path.join(LAB, 'meta'));

(async () => {
  const filter = process.argv[2] ? new RegExp(process.argv[2]) : null;
  if (!fs.existsSync(path.join(META, 'manifest.json'))) { console.error('no meta/manifest.json — run make-meta.js'); process.exit(1); }
  const manifest = JSON.parse(fs.readFileSync(path.join(META, 'manifest.json'), 'utf8'));
  const res = path.join(OUT, 'meta'); fs.mkdirSync(res, { recursive: true });
  const browser = await chromium.launch(), page = await browser.newPage();
  await page.goto(lab);
  const imp = async (file) => page.evaluate(async (b64) => {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    try { const r = await PdfImporter.create({ images: 'drop', asciiNumbers: false, persianLetters: false }).fromArrayBuffer(u.buffer); return { markdown: r.markdown }; }
    catch (e) { return { error: String(e && e.message || e) }; }
  }, fs.readFileSync(file).toString('base64'));
  const src = (doc) => fs.readFileSync(path.join(LAB, 'corpus', doc + '.md'), 'utf8');

  const seeds = {};
  for (const s of manifest.seeds) {
    const r = await imp(pdfPath(s + '.pdf'));
    seeds[s] = { markdown: r.markdown || '', total: r.error ? 0 : score(src(s.split('--')[1]), r.markdown).total };
    process.stdout.write('s');
  }
  const rows = [];
  for (const f of manifest.files) {
    if (filter && !filter.test(f.transform)) continue;
    const r = await imp(path.join(META, f.transform, f.seed + '.pdf'));
    const row = { transform: f.transform, seed: f.seed };
    if (r.error) Object.assign(row, { error: r.error, total: 0, same: false });
    else {
      fs.mkdirSync(path.join(res, f.transform), { recursive: true });
      fs.writeFileSync(path.join(res, f.transform, f.seed + '.md'), r.markdown);
      const sc = score(src(f.doc), r.markdown);
      Object.assign(row, { total: sc.total, recall: sc.recall, same: r.markdown === seeds[f.seed].markdown });
    }
    row.delta = row.total - seeds[f.seed].total;
    rows.push(row); process.stdout.write(row.error ? 'x' : '.');
  }
  await browser.close();
  console.log('\n');

  const summary = {};
  const pct = (x) => (100 * x).toFixed(1);
  console.log('transform     kind  files  same   total      Δ   worst (Δ)');
  for (const [t, spec] of Object.entries(manifest.transforms)) {
    const rs = rows.filter((r) => r.transform === t);
    if (!rs.length) continue;
    const m = (k) => rs.reduce((a, r) => a + r[k], 0) / rs.length;
    summary[t] = { kind: spec.kind, n: rs.length, same: rs.filter((r) => r.same).length, total: m('total'), delta: m('delta'), errors: rs.filter((r) => r.error).length };
    const worst = rs.filter((r) => r.delta < -0.0005).sort((a, b) => a.delta - b.delta).slice(0, 3)
      .map((r) => r.seed.replace(/--.*/, '') + '/' + r.seed.split('--')[1] + ' ' + (r.error ? 'ERROR' : pct(r.delta)));
    console.log(t.padEnd(13), spec.kind.padEnd(5), String(rs.length).padStart(5), String(summary[t].same).padStart(5),
      pct(summary[t].total).padStart(7), pct(summary[t].delta).padStart(6), ' ', worst.join(', '));
  }
  const all = Object.values(summary);
  console.log('\nseeds: mean total ' + pct(Object.values(seeds).reduce((a, s) => a + s.total, 0) / Object.keys(seeds).length) +
    ' · every transform: same ' + all.reduce((a, s) => a + s.same, 0) + ' of ' + all.reduce((a, s) => a + s.n, 0) + ' files');
  fs.writeFileSync(path.join(res, '_scores.json'), JSON.stringify({ at: new Date().toISOString(), generator: manifest.generator, env: manifest.env, summary, rows }, null, 1));
})();
