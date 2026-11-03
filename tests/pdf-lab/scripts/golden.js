// The golden files (README, «Golden files»): golden/<name>.md is what a person typed from the pages of the lab PDF
// <name>.pdf — never the importer's output. Each PDF is imported as run-import.js does (tools/pdf-lab.html in
// Chromium), scored with score.js against its golden, and its structure compared (structdiff.js: heading tree,
// table shapes, list nesting).
//   node scripts/golden.js [filter] [--dir DIR]     DIR: another folder of goldens (default golden/); filter: a regexp on the name
// Writes LAB_OUT/golden/<name>.md (the importer's Markdown, pictures as short names) and LAB_OUT/golden/_scores.json:
//   { dir, lab, filter, n, errors, mean: { <metric>: …, edits }, rows: [ { name, ms, <score.js metrics>, struct } ] }
// (lab: the run read the lab's own golden/ folder; gate.js --update writes only such a run, unfiltered, or with --partial).
// A golden whose PDF is not in the lab (env.js labPdfs) is an error row; any error row exits 1.
// A golden on the PDF of a held-out document (heldout.js, env.js heldSplit, tests/pdf-lab/HELDOUT.md) is read as the held-out
// is: its import is scored, but no row, no name with a score and no Markdown of it is printed or written — only the
// mean of those files (_scores.json heldout: { n, errors, mean }), compared by gate.js as a mean; a filtered run leaves
// them out. summarise() and report() are pure (tests/unit/heldout.test.js checks that no held-out name gets out).
const fs = require('fs'), path = require('path');

const METRICS = ['recall', 'order', 'headings', 'lists', 'tables', 'code', 'quotes', 'total'];
const EXTRA = ['rtl', 'zwnj', 'yehKaf', 'digits', 'brackets'];

// the run's rows (named) and the held-out goldens' rows → _scores.json's content: the held-out ones as means only
function summarise({ rows, heldRows, dir, lab, filter }) {
  // the means: each metric over the files that have it; the structure edits over the scored files
  const ok = rows.filter((r) => !r.error), mean = {};
  METRICS.concat(EXTRA).forEach((k) => { const v = ok.map((r) => r[k]).filter((x) => typeof x === 'number'); if (v.length) mean[k] = +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(4); });
  ['headings', 'tables', 'lists'].forEach((k) => { if (ok.length) mean[k + 'Edits'] = +(ok.reduce((a, r) => a + r.struct[k].missing + r.struct[k].extra + r.struct[k].changed, 0) / ok.length).toFixed(2); });
  if (ok.length) mean.edits = +(ok.reduce((a, r) => a + r.struct.edits, 0) / ok.length).toFixed(2);
  // the held-out goldens: their means only (a crash counts 0 in the total, as in run-import.js --real-heldout)
  let heldout = null;
  if (heldRows.length) {
    const hok = heldRows.filter((r) => !r.error);
    const hm = (k) => { const v = heldRows.map((r) => (r.error ? (k === 'total' ? 0 : undefined) : r[k])).filter((x) => typeof x === 'number'); return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(4) : null; };
    heldout = { n: heldRows.length, errors: heldRows.length - hok.length,
                mean: { total: hm('total'), rtl: hm('rtl'), edits: hok.length ? +(hok.reduce((a, r) => a + r.struct.edits, 0) / hok.length).toFixed(2) : null } };
  }
  return { dir, lab, filter, n: rows.length, errors: rows.filter((r) => r.error).length, mean, rows, heldout };
}
// _scores.json's content → the lines printed (the held-out goldens: one line of means)
function report(out) {
  const { cell } = require('./structdiff.js');
  const lines = [], rows = out.rows, ok = rows.filter((r) => !r.error), mean = out.mean, heldout = out.heldout;
  const pct = (x) => typeof x === 'number' ? (100 * x).toFixed(1).padStart(5) : '  -  ';
  if (rows.length || heldout) {
    lines.push(['golden'.padEnd(40), 'words', 'order', ' head', ' list', ' tabl', ' code', 'quote', 'total', '  rtl', ' | heading tree'.padEnd(18), 'table shapes'.padEnd(16), 'list nesting'].join(' '));
    const line = (label, r, st) => lines.push([label.padEnd(40), pct(r.recall), pct(r.order), pct(r.headings), pct(r.lists), pct(r.tables), pct(r.code), pct(r.quotes), pct(r.total), pct(r.rtl), st].join(' '));
    rows.forEach((r) => {
      if (r.error) return lines.push([r.name.padEnd(40), 'ERROR', r.error].join(' '));
      line(r.name, r, ' | ' + cell(r.struct.headings).padEnd(16) + ' ' + cell(r.struct.tables).padEnd(16) + ' ' + cell(r.struct.lists) + '   ' + r.ms + 'ms');
    });
    if (ok.length) line('mean (' + ok.length + ' files)', mean, ' | edits per file: headings ' + mean.headingsEdits + ', tables ' + mean.tablesEdits + ', lists ' + mean.listsEdits + ' (all ' + mean.edits + ')');
    if (heldout) lines.push([('held-out (' + heldout.n + ' files)').padEnd(40), 'mean total ' + pct(heldout.mean.total).trim() + (heldout.mean.rtl === null ? '' : ' · rtl ' + pct(heldout.mean.rtl).trim()) +
      ' · structure edits per file ' + heldout.mean.edits + (heldout.errors ? ' · ' + heldout.errors + ' crash(es)' : '') + '   (means only — tests/pdf-lab/HELDOUT.md)'].join(' '));
    lines.push('\nstructure cells: golden/import count, −missing +extra ~changed (level, shape or depth) after aligning the two sequences');
  }
  return lines;
}
module.exports = { summarise, report };

async function main() {
  const { fileUrl, labPdfs, heldSplit, LAB, KELK, OUT, req } = require('./env.js');
  const { score } = require('./score.js');
  const { structDiff } = require('./structdiff.js');
  const args = process.argv.slice(2);
  const di = args.indexOf('--dir');
  if (di >= 0 && (!args[di + 1] || args[di + 1].startsWith('--'))) { console.error('--dir needs a folder'); process.exit(2); }
  const LAB_GOLDEN = path.join(LAB, 'golden');
  const DIR = di >= 0 ? path.resolve(args[di + 1]) : LAB_GOLDEN;
  const filterArg = args.filter((a, i) => !a.startsWith('--') && (di < 0 || i !== di + 1))[0] || null;
  const filter = filterArg ? new RegExp(filterArg) : null;
  const GOUT = path.join(OUT, 'golden');

  // the lab's golden/ may not exist yet (nothing to score); a folder named with --dir must
  if (!fs.existsSync(DIR) && di >= 0) { console.error('no folder ' + DIR); process.exit(2); }
  const goldens = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => /\.md$/i.test(f) && !/^readme\.md$/i.test(f)).map((f) => f.replace(/\.md$/i, '')).sort() : [];
  // the goldens of held-out documents (by the document in the name, as for the PDFs): one mean, and only in an
  // unfiltered run (a filter could leave a single file)
  const heldDocs = new Set(heldSplit().docs.heldout), docOf = require('./heldout.js').docOf;
  const held = { has: (n) => heldDocs.has(docOf(n)) };
  const names = goldens.filter((n) => (filter ? filter.test(n) && !held.has(n) : true));
  fs.mkdirSync(GOUT, { recursive: true });
  const where = {}; labPdfs().forEach((x) => { where[x.name.replace(/\.pdf$/i, '')] = x.file; });
  const rows = [], heldRows = [];
  if (!names.length) console.log('no golden files in ' + path.relative(process.cwd(), DIR) + (filter ? ' matching ' + filterArg : ''));
  else {
    const { chromium } = req('playwright');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(fileUrl(path.join(KELK, 'tools', 'pdf-lab.html')));
    for (const name of names) {
      const into = held.has(name) ? heldRows : rows;
      if (!where[name]) { into.push({ name, error: 'no PDF ' + name + '.pdf in the lab (pdf/)' }); continue; }
      const b64 = fs.readFileSync(where[name]).toString('base64');
      const t0 = Date.now();
      // the import of run-import.js: the same options, pictures kept as short names
      const r = await page.evaluate(async (b64) => {
        const bin = atob(b64), u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        try {
          const r = await PdfImporter.create({ images: 'markdown', onImage: (src, o) => 'img-' + o.page + '-' + o.index, asciiNumbers: false, persianLetters: false }).fromArrayBuffer(u.buffer);
          return { markdown: r.markdown };
        } catch (e) { return { error: e.stack || String(e) }; }
      }, b64);
      const ms = Date.now() - t0;
      if (r.error) { into.push({ name, error: r.error.split('\n')[0] }); if (into === rows) console.log(name, 'ERROR', r.error.slice(0, 300)); continue; }
      if (into === rows) fs.writeFileSync(path.join(GOUT, name + '.md'), r.markdown);
      // the pictures out before scoring, as run-import.js does (a golden has none)
      const md = r.markdown.replace(/!\[[^\]]*\]\(img-[\d-]+\)/g, '').replace(/\n[ \t]*\n([ \t]*\n)+/g, '\n\n');
      const want = fs.readFileSync(path.join(DIR, name + '.md'), 'utf8');
      const s = score(want, md), row = { name, ms };
      METRICS.concat(EXTRA, ['extra']).forEach((k) => { if (typeof s[k] === 'number') row[k] = +s[k].toFixed(4); });
      row.struct = structDiff(want, md);
      into.push(row);
    }
    if (errors.length) console.log('page errors:', errors.slice(0, 5));
    await browser.close();
  }

  const out = summarise({ rows, heldRows, dir: path.relative(LAB, DIR).split(path.sep).join('/') || '.', lab: DIR === LAB_GOLDEN, filter: filterArg });
  fs.writeFileSync(path.join(GOUT, '_scores.json'), JSON.stringify(out, null, 1));
  report(out).forEach((l) => console.log(l));
  console.log('written ' + path.relative(process.cwd(), path.join(GOUT, '_scores.json')));
  if (out.errors || (out.heldout && out.heldout.errors)) process.exitCode = 1;       // a crash or a golden without its PDF fails the run (the scores are the gate's)
}
if (require.main === module) main();
