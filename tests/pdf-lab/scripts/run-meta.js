// The metamorphic net (made by make-meta.js): import every seed and every transformed copy, and see what the
// transform changed. Per transform: how many files came back byte-identical to their reference's Markdown
// ("same"), the mean total against the corpus source, and its change from the references' own ("Δ") — the loss
// the transform alone caused. The reference is the seed PDF, or for a generator-side transform the control
// make-meta.js drew the same way without the change. The worst files of each transform follow, so a fragile rule
// shows where it is; then the transforms ordered by Δ (the order to work through them in).
//   node scripts/run-meta.js [transform-filter]
// Results: out/meta/<transform>/<seed>.md and out/meta/_scores.json (read by gate.js).
//
// The "same" assertion: a transform of kind 'same' must give back its reference's Markdown byte for byte. A file
// that does not fails the run (exit code 1) unless it is listed in KNOWN below — an importer finding, kept visible
// until it is fixed — and even then it fails when it crashes or its total falls more than FLOOR_TOL under the total
// measured when it was listed (a known exception may not get worse unseen). A listed file that reads exactly again
// is a note: take it off the list.
// Reference-free relations (no corpus source needed), printed per transform and kept in _scores.json:
//   same   the multiset of words equals the reference's (implied by byte identity; for a known exception it tells
//          a lost or doubled word from a moved one)
//   untag  also: the heading count does not rise (tags removed take information away; they never add a heading)
//   near   the block count (paragraphs, headings, lists… — Markdown parts between blank lines) within ± 1
const { pdfPath } = require('./env.js');
const fs = require('fs'), path = require('path');
const { chromium } = require('./env.js').req('playwright');
const { score } = require('./score.js');
const { LAB, OUT, lab } = require('./env.js');
const META = path.resolve(process.env.LAB_META || path.join(LAB, 'meta'));

// Known exceptions to the "same" assertion: transform → seed → [total measured when listed (points of 100), Δ from
// the reference, reason]. The floor is that total − FLOOR_TOL. Measured with qpdf 11.9.0, pdf-lib 1.17.1, Playwright
// 1.56.1's Chromium (1405-08-11). Each is an importer finding (the transform was checked to be right first: cropbox and
// renderMode render pixel for pixel as their seed); the importer works through them. (rotate90 / rotate180, listed on every
// seed until the importer read a page through its /Rotate, read exactly.)
const FLOOR_TOL = 1.0;
const SLUG = 'a one-page document: the slug\'s job and plate lines, outside the CropBox, are read as text (several pages drop them as repeated furniture; nothing drops text outside the visible box)';
const KNOWN = {
  scale80: {
    'wk-github--readme': [95.0, -5.0, "the task list's drawn check boxes are no longer recognised at 0.8 × their size («[x]» lost): an absolute size"],
    'word-print--word-rtl': [100.0, 0.0, "the footer «صفحه 1 از 2» and its rule, moved inwards with the content, fall outside the 12 % band: kept as text"],
    'chrome-rtl-tagged--ar-article': [100.0, 0.0, "Chrome's printed header and footer (title, date, «1/1»), moved inwards, leave the band the tree rule looks in: kept as text"],
    'word-memo--memo-fa': [99.5, -0.5, "the memo's field block (پیوست / فوریت) read in another order: label and value swapped across lines"]
  },
  scale125: {
    'wk-github--readme': [95.0, -5.0, "as scale80: the drawn check boxes at 1.25 × their size are not recognised"]
  },
  untag: {
    'chrome-rtl-tagged--ar-article': [100.0, 0.0, "one page: without the structure tree, Chrome's printed header and footer have no evidence left (no repetition) and stay as text"]
  },
  cropbox: {
    'chrome-layout--layout-columns': [100.0, 0.0, SLUG],
    'chrome-template--template': [100.0, 0.0, SLUG],
    'calc--xl-sales': [100.0, 0.0, SLUG],
    'word-memo--memo-fa': [100.0, 0.0, SLUG],
    'prince-shapes--shapes-fa': [100.0, 0.0, SLUG],
    'itext-word--circular-fa': [100.0, 0.0, SLUG]
  },
  renderMode: {
    'word-print--word-rtl': [99.7, -0.3, "fake bold (each letter drawn twice, a hair apart) plus the invisible copy: four glyphs per letter, the copy rule keeps two («ببسسمم»)"],
    'itext-word--circular-fa': [92.5, -7.5, "«ی» read twice in places («عملییاتیی»): as with fake bold, a copy of a glyph the copy rule had already merged once survives"]
  }
};

// a transform's environment, the part its files depend on (gate.js compares it with the baseline's)
const envOf = (via, env) => via === 'qpdf' ? { qpdf: env.qpdf, qpdfPkg: env.qpdfPkg || null } : via === 'chromium' ? { chromium: env.chromium, platform: env.platform } : { pdfLib: env.pdfLib };
// the reference-free measures of one Markdown
const fenced = (md) => md.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, (m) => m.replace(/^#/gm, '\\#').replace(/\n\s*\n/g, '\n'));
function measures(md) {
  const words = new Map();
  (md.match(/[\p{L}\p{M}\p{N}\u200C]+/gu) || []).forEach((w) => words.set(w, (words.get(w) || 0) + 1));
  const f = fenced(md);
  return { words, headings: (f.match(/^#{1,6}\s/gm) || []).length, blocks: f.split(/\n\s*\n/).filter((b) => b.trim()).length };
}
const sameWords = (a, b) => a.size === b.size && [...a].every(([w, n]) => b.get(w) === n);

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

  // the references: the seeds, and the controls of the generator side (key: the seed, or the control's path)
  const refs = {};
  const reference = async (key, file, doc) => {
    if (refs[key]) return refs[key];
    const r = await imp(file);
    refs[key] = { markdown: r.markdown || '', error: r.error || null, total: r.error ? 0 : score(src(doc), r.markdown).total };
    refs[key].m = measures(refs[key].markdown);
    // (kept beside the transformed ones, to diff: out/meta/_ref/<seed>.md, out/meta/_ref/_control/<seed>.md)
    const md = path.join(res, '_ref', key.replace(/\.pdf$/, '') + '.md');
    fs.mkdirSync(path.dirname(md), { recursive: true }); fs.writeFileSync(md, refs[key].markdown);
    process.stdout.write('s');
    return refs[key];
  };
  for (const s of manifest.seeds) await reference(s, pdfPath(s + '.pdf'), s.split('--')[1]);
  const rows = [];
  for (const f of manifest.files) {
    if (filter && !filter.test(f.transform)) continue;
    const ref = f.ref ? await reference(f.ref, path.join(META, f.ref), f.doc) : refs[f.seed];
    const r = await imp(path.join(META, f.transform, f.seed + '.pdf'));
    const row = { transform: f.transform, seed: f.seed };
    if (f.ref) row.ref = f.ref;
    if (r.error) Object.assign(row, { error: r.error, total: 0, same: false });
    else {
      fs.mkdirSync(path.join(res, f.transform), { recursive: true });
      fs.writeFileSync(path.join(res, f.transform, f.seed + '.md'), r.markdown);
      const sc = score(src(f.doc), r.markdown), m = measures(r.markdown);
      Object.assign(row, { total: sc.total, recall: sc.recall, same: r.markdown === ref.markdown, words: sameWords(m.words, ref.m.words),
        headings: [ref.m.headings, m.headings], blocks: [ref.m.blocks, m.blocks] });
    }
    row.delta = row.total - ref.total;
    rows.push(row); process.stdout.write(row.error ? 'x' : '.');
  }
  await browser.close();
  console.log('\n');

  const summary = {}, unexpected = [], exceptions = [], stale = [];
  const pct = (x) => (100 * x).toFixed(1), sgn = (x) => (x >= 0 ? '+' : '') + pct(x);
  console.log('transform     kind  via       files  same   total      Δ  relation          worst (Δ)');
  for (const [t, spec] of Object.entries(manifest.transforms)) {
    const rs = rows.filter((r) => r.transform === t);
    if (!rs.length) continue;
    const m = (k) => rs.reduce((a, r) => a + r[k], 0) / rs.length;
    const ok = rs.filter((r) => !r.error);
    // the relation that holds for this kind, as the number of files that break it
    const rel = {};
    if (spec.kind === 'same') rel['words≠'] = ok.filter((r) => !r.words).length;
    if (t === 'untag') rel['heads↑'] = ok.filter((r) => r.headings[1] > r.headings[0]).length;
    if (spec.kind === 'near') rel['blocks±>1'] = ok.filter((r) => Math.abs(r.blocks[1] - r.blocks[0]) > 1).length;
    summary[t] = { kind: spec.kind, via: spec.via || null, v: spec.v || 1, env: envOf(spec.via, manifest.env), n: rs.length,
      same: rs.filter((r) => r.same).length, total: m('total'), delta: m('delta'), errors: rs.filter((r) => r.error).length,
      relation: rel, files: Object.fromEntries(rs.map((r) => [r.seed, +r.total.toFixed(4)])) };
    if (spec.kind === 'same') {
      const known = KNOWN[t] || {};
      let un = 0, ex = 0;
      rs.forEach((r) => {
        const k = known[r.seed];
        if (r.same && !r.error) { if (k) stale.push(r); return; }
        // not exact: listed, it holds while it neither crashes nor falls under its floor
        if (!k) { r.why = r.error ? 'crashes' : 'not listed'; unexpected.push(r); un++; return; }
        if (r.error) { r.why = 'listed, but crashes'; unexpected.push(r); un++; return; }
        if (k[0] === null || 100 * r.total < k[0] - FLOOR_TOL) { r.why = k[0] === null ? 'listed without a measured total' : 'listed, but under its floor ' + (k[0] - FLOOR_TOL).toFixed(1); unexpected.push(r); un++; return; }
        exceptions.push(r); ex++;
      });
      summary[t].unexpected = un; summary[t].exceptions = ex;
    }
    const worst = rs.filter((r) => r.delta < -0.0005).sort((a, b) => a.delta - b.delta).slice(0, 3)
      .map((r) => r.seed.replace(/--.*/, '') + '/' + r.seed.split('--')[1] + ' ' + (r.error ? 'ERROR' : pct(r.delta)));
    console.log(t.padEnd(13), spec.kind.padEnd(5), String(spec.via || '').padEnd(8), String(rs.length).padStart(5), String(summary[t].same).padStart(5),
      pct(summary[t].total).padStart(7), pct(summary[t].delta).padStart(6), ' ', Object.entries(rel).map(([k, v]) => k + ' ' + v).join(', ').padEnd(16), worst.join(', '));
  }
  const all = Object.values(summary);
  const refList = Object.values(refs);
  console.log('\nreferences: mean total ' + pct(refList.reduce((a, s) => a + s.total, 0) / refList.length) + ' (' + manifest.seeds.length + ' seeds' +
    (refList.length > manifest.seeds.length ? ', ' + (refList.length - manifest.seeds.length) + ' controls' : '') + ')' +
    ' · every transform: same ' + all.reduce((a, s) => a + s.same, 0) + ' of ' + all.reduce((a, s) => a + s.n, 0) + ' files');
  Object.entries(manifest.skipped || {}).forEach(([t, why]) => console.log('not made: ' + t + ' — ' + why));

  // ── the "same" assertion ──
  console.log('\n"same" transforms, byte for byte: ' + all.filter((s) => s.kind === 'same').reduce((a, s) => a + s.same, 0) + ' of ' +
    all.filter((s) => s.kind === 'same').reduce((a, s) => a + s.n, 0) + ' files exact; ' + exceptions.length + ' known exception(s), ' + unexpected.length + ' unexpected');
  exceptions.forEach((r) => { const k = KNOWN[r.transform][r.seed];
    console.log('  ~ ' + r.transform + ' ' + r.seed + ' total ' + pct(r.total) + ' (floor ' + (k[0] - FLOOR_TOL).toFixed(1) + ') Δ ' + sgn(r.delta) + (r.words ? '' : ', words differ') + '  — ' + k[2]); });
  stale.forEach((r) => console.log('  ✓ ' + r.transform + ' ' + r.seed + ' reads exactly now — take it off KNOWN in run-meta.js'));
  unexpected.forEach((r) => console.log('  ✗ ' + r.transform + ' ' + r.seed + ' — ' + r.why + (r.error ? ': ' + r.error : ': total ' + pct(r.total) + ', Δ ' + sgn(r.delta) + (r.words ? ', the same words' : ', words differ'))));

  // ── the order to work through them in: the largest loss first ──
  const order = Object.entries(summary).filter(([, s]) => s.delta < -0.0005).sort((a, b) => a[1].delta - b[1].delta);
  if (order.length) console.log('\nby loss: ' + order.map(([t, s]) => t + ' ' + pct(s.delta)).join(' · '));

  fs.writeFileSync(path.join(res, '_scores.json'), JSON.stringify({ at: new Date().toISOString(), generator: manifest.generator, env: manifest.env,
    skipped: manifest.skipped || {}, summary, assertion: { unexpected: unexpected.map((r) => r.transform + '/' + r.seed), exceptions: exceptions.map((r) => r.transform + '/' + r.seed),
      stale: stale.map((r) => r.transform + '/' + r.seed) }, rows }, null, 1));
  if (unexpected.length) { console.log('\nFAILED: ' + unexpected.length + ' file(s) of a "same" transform read otherwise than their reference, outside KNOWN or under their floor'); process.exitCode = 1; }
})();
