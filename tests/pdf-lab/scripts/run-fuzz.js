// Import and score the fuzzed PDFs of one split (made by make-fuzz.js), then read the scores per style value.
//   node scripts/run-fuzz.js [split] [--show]
// dev:     everything — the mean, the scores per style value, the weakest files by name.
// heldout: aggregates only (the mean and the scores per style value); file names and their Markdown
//          stay unread unless --show is given. Looking at a held-out file to write a rule turns it into dev.
// Each run is compared with the previous one of the same split (_scores.prev.json): what moved.
const fs = require('fs'), path = require('path');
const { chromium } = require('./env.js').req('playwright');
const { score } = require('./score.js');
const { markupLoss } = require('./markup.js');
const { LAB, OUT, FUZZ, lab } = require('./env.js');

const METRICS = ['recall', 'order', 'headings', 'lists', 'tables', 'code', 'quotes', 'total'];
const SHORT = { recall: 'words', order: 'order', headings: 'head', lists: 'list', tables: 'tabl', code: 'code', quotes: 'quote', total: 'total' };
const DIMS = ['producer', 'doc', 'font', 'size', 'leading', 'paper', 'margin', 'align', 'columns', 'headScale', 'headFont',
  'paragraph', 'quote', 'code', 'mono', 'inlineCode', 'table', 'list', 'headerFooter', 'headCase', 'tagged'];
const pct = (x) => x === undefined || x === null || isNaN(x) ? '   - ' : (100 * x).toFixed(1).padStart(5);
const mean = (rows, k) => { const v = rows.map((r) => r[k]).filter((x) => typeof x === 'number'); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined; };

(async () => {
  const split = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'dev';
  const show = split === 'dev' || process.argv.includes('--show');
  const dir = path.join(FUZZ, split), res = path.join(OUT, 'fuzz-' + split);   // the PDFs; the results
  if (!fs.existsSync(path.join(dir, 'manifest.json'))) { console.error('no fuzz/' + split + '/manifest.json — run make-fuzz.js ' + split); process.exit(1); }
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
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
      fs.writeFileSync(path.join(outDir, s.name + '.md'), r.markdown);
      // case folded: a style may set headings in capitals (text-transform), which no PDF can undo
      Object.assign(row, score(fs.readFileSync(path.join(LAB, 'corpus', s.doc + '.md'), 'utf8'), r.markdown, { fold: true }));
      row.markup = markupLoss(r.html, r.markdown).lost;
    }
    rows.push(row); process.stdout.write('.');
  }
  await browser.close();
  console.log('\n');

  const scoresPath = path.join(res, '_scores.json'), prevPath = path.join(res, '_scores.prev.json');
  const prev = fs.existsSync(scoresPath) ? JSON.parse(fs.readFileSync(scoresPath, 'utf8')) : null;
  if (prev) fs.writeFileSync(prevPath, JSON.stringify(prev, null, 1));
  const summary = { split, at: new Date().toISOString(), n: rows.length, errors: rows.filter((r) => r.error).length, env: manifest.env || null, mean: {} };
  METRICS.forEach((k) => { summary.mean[k] = mean(rows, k); });
  // inline markup the Markdown lost, summed over the split (should be 0), and in how many files
  summary.markup = rows.reduce((a, r) => a + (r.markup || 0), 0); summary.markupFiles = rows.filter((r) => r.markup).length;
  fs.writeFileSync(scoresPath, JSON.stringify({ summary, rows }, null, 1));

  // the mean, and its change since the last run
  console.log(('fuzz/' + split + ' — ' + rows.length + ' PDFs').padEnd(30), METRICS.map((k) => SHORT[k].padStart(5)).join(' '));
  console.log('mean'.padEnd(30), METRICS.map((k) => pct(summary.mean[k])).join(' '));
  if (prev) console.log('change since last run'.padEnd(30), METRICS.map((k) => {
    const d = summary.mean[k] - prev.summary.mean[k];
    return isNaN(d) ? '   - ' : ((d >= 0 ? '+' : '') + (100 * d).toFixed(1)).padStart(5);
  }).join(' '));
  if (summary.errors) console.log('errors:', summary.errors);
  console.log('inline markup lost in the Markdown:', summary.markup, 'in', summary.markupFiles, 'file(s)');

  // per style value: where the importer is weak — the lowest mean total first, within each dimension
  console.log('\nper style value (n, mean of each metric) — the weakest value of each dimension first');
  const lines = [];
  DIMS.forEach((d) => {
    const vals = [...new Set(rows.map((r) => String(r.style[d])))];
    if (vals.length < 2) return;
    vals.map((v) => { const rs = rows.filter((r) => String(r.style[d]) === v); return { d, v, n: rs.length, m: METRICS.map((k) => mean(rs, k)) }; })
      .sort((a, b) => a.m[7] - b.m[7])
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
      const old = new Map(prev.rows.map((r) => [r.name, r]));
      const moved = rows.filter((r) => old.has(r.name) && Math.abs(r.total - old.get(r.name).total) > 0.001);
      if (moved.length) {
        console.log('\nfiles whose total moved');
        moved.sort((a, b) => (a.total - old.get(a.name).total) - (b.total - old.get(b.name).total)).forEach((r) =>
          console.log(r.name.padEnd(30), pct(old.get(r.name).total), '→', pct(r.total)));
      }
    }
  } else console.log('\n(held-out: file names hidden — --show prints them, and makes this split a dev set for whoever reads them)');
})();
