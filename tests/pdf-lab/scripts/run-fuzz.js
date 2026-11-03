// Import and score the fuzzed PDFs of one split (made by make-fuzz.js), then read the scores per style value.
//   node scripts/run-fuzz.js [split] [--show]
// dev:     everything — the mean, the scores per style value, the weakest files by name.
// heldout: aggregates only (the mean and the scores per style value). The per-file results stay in memory: no
//          Markdown is written and _scores.json holds the summary alone (the means the gate compares), no row — so
//          nothing in LAB_OUT names a held-out file next to its score. Looking at a held-out file to write a rule
//          turns it into dev. --show prints the file names and per-file totals and writes the Markdown and rows as
//          dev does; it first appends a line (date, split, user, generator, seed base) to
//          tests/pdf-lab/heldout-opened.log and warns: the split must then be rotated (tests/pdf-lab/HELDOUT.md).
// Each run is compared with the previous one of the same split (_scores.prev.json): what moved — only when both read
// PDFs of the same generator and env (else a note).
const fs = require('fs'), path = require('path');
const { chromium } = require('./env.js').req('playwright');
const { score } = require('./score.js');
const { markupLoss } = require('./markup.js');
const { LAB, OUT, FUZZ, lab } = require('./env.js');

// rtl: right-to-left documents only, outside the total (score.js: ZWNJ, yeh / kaf, digits, brackets) — its mean is over
// the right-to-left files alone
const METRICS = ['recall', 'order', 'headings', 'lists', 'tables', 'code', 'quotes', 'total', 'rtl'];
const RTL_PARTS = ['zwnj', 'yehKaf', 'digits', 'brackets'];
const SHORT = { recall: 'words', order: 'order', headings: 'head', lists: 'list', tables: 'tabl', code: 'code', quotes: 'quote', total: 'total', rtl: 'rtl' };
const DIMS = ['dir', 'producer', 'doc', 'font', 'latinFont', 'size', 'leading', 'paper', 'margin', 'align', 'columns', 'headScale', 'headFont',
  'paragraph', 'quote', 'code', 'mono', 'inlineCode', 'table', 'list', 'headerFooter', 'headCase', 'tagged', 'digits', 'tracking'];
const TOTAL = METRICS.indexOf('total');
const pct = (x) => x === undefined || x === null || isNaN(x) ? '   - ' : (100 * x).toFixed(1).padStart(5);
const mean = (rows, k) => { const v = rows.map((r) => r[k]).filter((x) => typeof x === 'number'); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined; };

(async () => {
  const split = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'dev';
  const show = split === 'dev' || process.argv.includes('--show');
  const dir = path.join(FUZZ, split), res = path.join(OUT, 'fuzz-' + split);   // the PDFs; the results
  if (!fs.existsSync(path.join(dir, 'manifest.json'))) { console.error('no fuzz/' + split + '/manifest.json — run make-fuzz.js ' + split); process.exit(1); }
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  // a held-out split opened: written down before anything is printed (tests/pdf-lab/HELDOUT.md)
  if (show && split !== 'dev') {
    require('./heldout.js').logOpened({ split: 'fuzz:' + split + ' (run-fuzz.js --show)', generator: (manifest.env || {}).generator,
      base: manifest.base !== undefined ? manifest.base : manifest.samples.length ? Math.min(...manifest.samples.map((s) => s.seed)) : null });
  }
  const outDir = res; fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch(), page = await browser.newPage();
  await page.goto(lab);
  const rows = [];
  for (const s of manifest.samples) {
    const b64 = fs.readFileSync(path.join(dir, s.name + '.pdf')).toString('base64');
    const t0 = Date.now();
    const r = await page.evaluate(async (b64) => {
      const bin = atob(b64), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      try { const r = await PdfImporter.create({ images: 'drop', asciiNumbers: false, persianLetters: false }).fromArrayBuffer(u.buffer); return { markdown: r.markdown, html: r.html }; }
      catch (e) { return { error: String(e && e.stack || e) }; }
    }, b64);
    const row = { name: s.name, seed: s.seed, style: s, ms: Date.now() - t0 };   // the style apart: its `code` is not the score's
    if (r.error) { row.error = r.error.split('\n')[0]; row.total = 0; }
    else {
      if (show) fs.writeFileSync(path.join(outDir, s.name + '.md'), r.markdown);     // (held-out: in memory only)
      // case folded: a style may set headings in capitals (text-transform), which no PDF can undo
      // the source as printed: <name>.md beside the PDF when make-fuzz.js rewrote its digits, else corpus/<doc>.md
      const src = s.source ? path.join(dir, s.source) : path.join(LAB, 'corpus', s.doc + '.md');
      Object.assign(row, score(fs.readFileSync(src, 'utf8'), r.markdown, { fold: true }));
      row.markup = markupLoss(r.html, r.markdown).lost;
    }
    rows.push(row); process.stdout.write('.');
  }
  await browser.close();
  console.log('\n');

  const scoresPath = path.join(res, '_scores.json'), prevPath = path.join(res, '_scores.prev.json');
  const last = fs.existsSync(scoresPath) ? JSON.parse(fs.readFileSync(scoresPath, 'utf8')) : null;
  // (held-out without --show: an older run's rows are not carried on either)
  if (last) fs.writeFileSync(prevPath, JSON.stringify(show ? last : { summary: last.summary }, null, 1));
  // the previous run is compared only when it read the same PDFs (the same generator and env): another set's means
  // and files say nothing about a change of the importer
  const prev = last && JSON.stringify(last.summary.env || null) === JSON.stringify(manifest.env || null) ? last : null;
  const prevNote = last && !prev ? '(no change since the last run printed: it read PDFs of another generator or env — generator ' +
    ((last.summary.env || {}).generator || '?') + ' → ' + ((manifest.env || {}).generator || '?') + ')' : null;
  const summary = { split, at: new Date().toISOString(), n: rows.length, errors: rows.filter((r) => r.error).length, env: manifest.env || null, mean: {} };
  METRICS.concat(RTL_PARTS).forEach((k) => { summary.mean[k] = mean(rows, k); });
  // per direction (generator 4: a split holds left-to-right and right-to-left documents)
  const dirOf = (r) => r.style.dir || 'ltr';
  summary.byDir = {};
  [...new Set(rows.map(dirOf))].sort().forEach((d) => {
    const rs = rows.filter((r) => dirOf(r) === d), m = {};
    METRICS.concat(RTL_PARTS).forEach((k) => { const v = mean(rs, k); if (v !== undefined) m[k] = v; });
    summary.byDir[d] = { n: rs.length, mean: m };
  });
  // inline markup the Markdown lost, summed over the split (should be 0), and in how many files
  summary.markup = rows.reduce((a, r) => a + (r.markup || 0), 0); summary.markupFiles = rows.filter((r) => r.markup).length;
  // held-out without --show: the summary alone — no row names a file next to its score
  fs.writeFileSync(scoresPath, JSON.stringify(show ? { summary, rows } : { summary }, null, 1));

  // the mean, and its change since the last run
  console.log(('fuzz/' + split + ' — ' + rows.length + ' PDFs').padEnd(30), METRICS.map((k) => SHORT[k].padStart(5)).join(' '));
  console.log('mean'.padEnd(30), METRICS.map((k) => pct(summary.mean[k])).join(' '));
  if (prev) console.log('change since last run'.padEnd(30), METRICS.map((k) => {
    const d = summary.mean[k] - prev.summary.mean[k];
    return isNaN(d) ? '   - ' : ((d >= 0 ? '+' : '') + (100 * d).toFixed(1)).padStart(5);
  }).join(' '));
  if (prevNote) console.log(prevNote);
  Object.entries(summary.byDir).forEach(([d, x]) => console.log(('  ' + d + ' (' + x.n + ')').padEnd(30), METRICS.map((k) => pct(x.mean[k])).join(' ')));
  if (summary.byDir.rtl) console.log('  rtl details'.padEnd(30), RTL_PARTS.map((k) => k + ' ' + pct(summary.byDir.rtl.mean[k]).trim()).join(' · '));
  if (summary.errors) console.log('errors:', summary.errors);
  console.log('inline markup lost in the Markdown:', summary.markup, 'in', summary.markupFiles, 'file(s)');

  // per style value: where the importer is weak — the lowest mean total first, within each dimension
  console.log('\nper style value (n, mean of each metric) — the weakest value of each dimension first');
  const lines = [];
  DIMS.forEach((d) => {
    const vals = [...new Set(rows.map((r) => String(r.style[d])))];
    if (vals.length < 2) return;
    vals.map((v) => { const rs = rows.filter((r) => String(r.style[d]) === v); return { d, v, n: rs.length, m: METRICS.map((k) => mean(rs, k)) }; })
      .sort((a, b) => a.m[TOTAL] - b.m[TOTAL])
      .forEach((x, i) => lines.push((i ? '' : x.d).padEnd(13) + (x.v + ' (' + x.n + ')').padEnd(17) + x.m.map(pct).join(' ')));
  });
  console.log(''.padEnd(30), METRICS.map((k) => SHORT[k].padStart(5)).join(' '));
  lines.forEach((l) => console.log(l));

  // dev only: the weakest files and the change per file
  if (show) {
    console.log('\nweakest files');
    rows.slice().sort((a, b) => a.total - b.total).slice(0, 12).forEach((r) =>
      console.log(r.name.padEnd(30), METRICS.map((k) => pct(r[k])).join(' '), r.error ? 'ERROR ' + r.error : ''));
    if (prev) {
      const old = new Map((prev.rows || []).map((r) => [r.name, r]));
      const moved = rows.filter((r) => old.has(r.name) && Math.abs(r.total - old.get(r.name).total) > 0.001);
      if (moved.length) {
        console.log('\nfiles whose total moved');
        moved.sort((a, b) => (a.total - old.get(a.name).total) - (b.total - old.get(b.name).total)).forEach((r) =>
          console.log(r.name.padEnd(30), pct(old.get(r.name).total), '→', pct(r.total)));
      }
    }
  } else console.log('\n(held-out: file names hidden — --show prints them, and makes this split a dev set for whoever reads them)');
})();
