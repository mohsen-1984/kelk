// The gate: did a change make the importer worse? Exit code 1 when it did.
//
//   node scripts/gate.js                     compare this run (out/) with baseline.json
//   node scripts/gate.js --against DIR       compare with another run on the same PDFs (DIR = its LAB_OUT)
//   node scripts/gate.js --update [--force]  write baseline.json from this run (refused when the gate fails)
//
// What it reads — the results of the runs, it runs nothing itself:
//   out/_scores.json                         run-import.js (the corpus)
//   out/fuzz-dev/_scores.json, fuzz-heldout  run-fuzz.js dev | heldout
//   out/meta/_scores.json                    run-meta.js (the metamorphic net)
//
// What fails:
//   corpus  a file that crashes, or whose total drops more than TOL_FILE (one file is enough: the corpus
//           files are few and each stands for a producer)
//   pic     the share of a file's text lying under a figure the importer cropped (r.quality) rising: text stays text
//   mix     Markdown lines holding a picture and words (run-import.js) rising: text wins over pictures
//   links   the links found with their words and address (run-import.js) dropping, per file
//   markup  inline markup the Markdown lost (markup.js: bold, italic, strike, code a CommonMark parser no longer
//           finds) rising — on any corpus file, or summed over a fuzz split. A count; it should be 0
//   fuzz    a crash, or the split's mean total dropping more than TOL_MEAN. Means only — per file
//           would read held-out files one by one, and per style value the groups are too small to
//           tell a change from noise (fewer than 15 files in most)
//   meta    a crash, or a transform's mean total dropping more than TOL_MEAN (TOL_HARD for the 'hard' ones,
//           which take information away and swing more); fewer files read "same" as their seed is a note
// A drop in one metric while the total holds (headings −3, tables +3) is printed, not failed: it is
// worth a look, not a block.
//
// Stored fuzz scores are compared only when the PDFs came from the same environment (Chromium,
// wkhtmltopdf, fonts — the manifest's env): another browser draws other PDFs, and its scores say nothing
// about the importer. Then the gate says so and skips the fuzz part; --against (two importers on the
// very same PDFs) needs no such care — that is what CI uses.
const fs = require('fs'), path = require('path');
const { LAB, OUT } = require('./env.js');

const TOL_FILE = 0.005, TOL_MEAN = 0.010, TOL_HARD = 0.030;      // 0.5, 1 and 3 points of 100
const METRICS = ['recall', 'order', 'headings', 'lists', 'tables', 'code', 'quotes', 'total'];
const CORPUS_EXTRA = ['rtl', 'zwnj', 'yehKaf', 'digits', 'brackets'];   // right-to-left details (score.js), corpus only
const LINKS = 'links';                                             // links found with their address (run-import.js), corpus only
const SHORT = { recall: 'words', order: 'order', headings: 'head', lists: 'list', tables: 'tabl', code: 'code', quotes: 'quote', total: 'total' };
const BASELINE = path.join(LAB, 'baseline.json');
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i < 0 ? null : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const p1 = (x) => typeof x === 'number' ? (100 * x).toFixed(1) : '-';
const d1 = (x) => (x >= 0 ? '+' : '') + (100 * x).toFixed(1);
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };

// one run, from its output folder, in the baseline's shape
function load(dir) {
  const corpus = read(path.join(dir, '_scores.json'));
  const run = { corpus: null, fuzz: {} };
  if (corpus) {
    run.corpus = {};
    corpus.forEach((r) => {
      const o = { error: r.error || null, markup: r.markup || 0 };
      if (typeof r.pic === 'number') o.pic = r.pic;
      if (typeof r.mix === 'number') o.mix = r.mix;
      METRICS.concat(CORPUS_EXTRA, [LINKS]).forEach((k) => { if (typeof r[k] === 'number') o[k] = +r[k].toFixed(4); });
      run.corpus[r.name] = o;
    });
  }
  ['dev', 'heldout'].forEach((split) => {
    const f = read(path.join(dir, 'fuzz-' + split, '_scores.json'));
    if (!f) return;
    const mean = {}; METRICS.forEach((k) => { if (typeof f.summary.mean[k] === 'number') mean[k] = +f.summary.mean[k].toFixed(4); });
    run.fuzz[split] = { n: f.summary.n, errors: f.summary.errors, env: f.summary.env, mean, markup: f.summary.markup || 0,
                        // per file, for --against on dev only (never printed for held-out)
                        files: split === 'dev' ? Object.fromEntries(f.rows.map((r) => [r.name, +(r.total || 0).toFixed(4)])) : undefined };
  });
  const meta = read(path.join(dir, 'meta', '_scores.json'));
  if (meta) run.meta = { generator: meta.generator, env: meta.env, transforms: Object.fromEntries(Object.entries(meta.summary).map(([t, x]) =>
    [t, { kind: x.kind, n: x.n, same: x.same, errors: x.errors, total: +x.total.toFixed(4), delta: +x.delta.toFixed(4) }])) };
  return run;
}
const sameEnv = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);

const cur = load(OUT);
const against = opt('--against');
const base = against ? load(path.resolve(String(against))) : read(BASELINE);
const fails = [], notes = [];

if (!cur.corpus) { console.error('no ' + path.relative(process.cwd(), path.join(OUT, '_scores.json')) + ' — run scripts/run-import.js first'); process.exit(2); }
if (!base) notes.push(against ? 'nothing to compare with in ' + against : 'no baseline.json yet — write one with --update');

// ── the corpus: file by file ───────────────────────────────────────────
if (base && base.corpus) {
  const dropped = [], rose = [], metricMoves = [];
  Object.keys(base.corpus).forEach((name) => {
    const b = base.corpus[name], c = cur.corpus[name];
    if (!c) { notes.push('corpus: ' + name + ' is gone from this run (filtered? deleted?)'); return; }
    if (c.error && !b.error) { fails.push('corpus: ' + name + ' crashes — ' + c.error); return; }
    if (typeof b.total !== 'number' || typeof c.total !== 'number') return;
    const d = c.total - b.total;
    if (d < -TOL_FILE) dropped.push([name, b.total, c.total]);
    // the right-to-left details hold on their own: a ZWNJ or a yeh lost while the total holds is still a loss
    if (typeof b.rtl === 'number' && typeof c.rtl === 'number' && c.rtl - b.rtl < -TOL_FILE)
      fails.push('corpus: ' + name + ' right-to-left details ' + p1(b.rtl) + ' → ' + p1(c.rtl) + ' (' +
        CORPUS_EXTRA.slice(1).filter((k) => typeof b[k] === 'number' && typeof c[k] === 'number' && c[k] < b[k]).map((k) => k + ' ' + p1(b[k]) + '→' + p1(c[k])).join(', ') + ')');
    else if (d > TOL_FILE) rose.push([name, b.total, c.total]);
    // links hold on their own too (outside the total): a link given to the wrong words is a loss the words do not show
    if (typeof b.links === 'number' && typeof c.links === 'number' && c.links - b.links < -TOL_FILE)
      fails.push('corpus: ' + name + ' links ' + p1(b.links) + ' → ' + p1(c.links));
    METRICS.slice(0, -1).forEach((k) => {
      if (typeof b[k] === 'number' && typeof c[k] === 'number' && c[k] - b[k] < -0.02 && d >= -TOL_FILE) metricMoves.push(name + ' ' + SHORT[k] + ' ' + p1(b[k]) + ' → ' + p1(c[k]));
    });
  });
  Object.keys(cur.corpus).filter((n) => !base.corpus[n]).forEach((n) => notes.push('corpus: new file ' + n + ' (' + p1(cur.corpus[n].total) + ')'));
  dropped.forEach(([n, b, c]) => fails.push('corpus: ' + n + ' ' + p1(b) + ' → ' + p1(c)));
  Object.keys(cur.corpus).forEach((n) => {
    const b = base.corpus[n], c = cur.corpus[n];
    if ((c.mix || 0) > ((b && b.mix) || 0)) fails.push('corpus: ' + n + ' lines with a picture and words ' + ((b && b.mix) || 0) + ' → ' + c.mix + ' (text wins over pictures)');
    if (b && typeof b.pic === 'number' && (c.pic || 0) > b.pic + 0.005) fails.push('corpus: ' + n + ' text under a cropped figure ' + p1((b && b.pic) || 0) + ' → ' + p1(c.pic) + ' (text must stay text)');
    if ((c.markup || 0) > ((b && b.markup) || 0)) fails.push('corpus: ' + n + ' loses inline markup in its Markdown: ' + ((b && b.markup) || 0) + ' → ' + c.markup);
  });
  if (rose.length) notes.push('corpus, better: ' + rose.map(([n, b, c]) => n + ' ' + p1(b) + ' → ' + p1(c)).join(', '));
  if (metricMoves.length) notes.push('corpus, one metric down while the total holds: ' + metricMoves.join('; '));
}
Object.keys(cur.corpus).forEach((n) => { if (cur.corpus[n].error && !(base && base.corpus && base.corpus[n] && base.corpus[n].error)) {
  if (!fails.some((f) => f.indexOf(n) >= 0)) fails.push('corpus: ' + n + ' crashes — ' + cur.corpus[n].error);
} });

// ── the fuzz splits: means only ────────────────────────────────────────
const fuzzRows = [];
['dev', 'heldout'].forEach((split) => {
  const c = cur.fuzz[split], b = base && base.fuzz && base.fuzz[split];
  if (!c) { notes.push('fuzz/' + split + ': not run (scripts/run-fuzz.js ' + split + ')'); return; }
  if (c.errors) fails.push('fuzz/' + split + ': ' + c.errors + ' PDF(s) crash');
  if (!b) { fuzzRows.push([split, null, c.mean]); return; }
  if (!against && !sameEnv(b.env, c.env)) {
    notes.push('fuzz/' + split + ': its PDFs come from another environment than the baseline\'s (Chromium ' +
      ((b.env || {}).chromium || '?') + ' → ' + ((c.env || {}).chromium || '?') + ', or wkhtmltopdf / fonts) — not compared; ' +
      'use --against with a run of the old importer on these PDFs, or --update on the old version first');
    fuzzRows.push([split, null, c.mean]); return;
  }
  if (b.n !== c.n) notes.push('fuzz/' + split + ': ' + b.n + ' PDFs then, ' + c.n + ' now — the means are of different sets');
  fuzzRows.push([split, b.mean, c.mean]);
  const d = c.mean.total - b.mean.total;
  if (d < -TOL_MEAN) fails.push('fuzz/' + split + ': mean ' + p1(b.mean.total) + ' → ' + p1(c.mean.total));
  if ((c.markup || 0) > (b.markup || 0)) fails.push('fuzz/' + split + ': inline markup lost in the Markdown ' + (b.markup || 0) + ' → ' + c.markup);
  // dev, two runs on the same PDFs: which files moved most (held-out stays a mean)
  if (split === 'dev' && b.files && c.files) {
    const moved = Object.keys(c.files).filter((n) => n in b.files).map((n) => [n, c.files[n] - b.files[n]]).filter((x) => Math.abs(x[1]) > 0.05)
      .sort((x, y) => x[1] - y[1]);
    if (moved.length) notes.push('fuzz/dev, files that moved over 5 points: ' + moved.slice(0, 10).map(([n, x]) => n + ' ' + d1(x)).join(', ') + (moved.length > 10 ? ' …' : ''));
  }
});

// ── the metamorphic net: per transform ─────────────────────────────────
const metaRows = [];
if (!cur.meta) notes.push('meta: not run (scripts/make-meta.js, then run-meta.js)');
else {
  const bm = base && base.meta;
  const comparable = bm && (against || (bm.generator === cur.meta.generator && sameEnv(bm.env, cur.meta.env)));
  if (bm && !comparable) notes.push('meta: made by another generator or qpdf / pdf-lib than the baseline\'s — not compared');
  Object.entries(cur.meta.transforms).forEach(([t, c]) => {
    const b = comparable && bm.transforms[t];
    metaRows.push([t, b, c]);
    if (c.errors && !(b && b.errors >= c.errors)) fails.push('meta/' + t + ': ' + c.errors + ' PDF(s) crash');
    if (!b) return;
    const tol = c.kind === 'hard' ? TOL_HARD : TOL_MEAN;
    if (c.total - b.total < -tol) fails.push('meta/' + t + ': mean ' + p1(b.total) + ' → ' + p1(c.total));
    if (c.same < b.same) notes.push('meta/' + t + ': ' + b.same + ' → ' + c.same + ' files read as their seed');
  });
}

// ── report ─────────────────────────────────────────────────────────────
const cm = (run) => { const v = Object.values(run.corpus || {}).map((r) => r.total).filter((x) => typeof x === 'number'); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined; };
console.log('gate: this run (' + path.relative(process.cwd(), OUT) + ') against ' + (against ? path.relative(process.cwd(), path.resolve(String(against))) : 'baseline.json') + '\n');
console.log(''.padEnd(22), METRICS.map((k) => SHORT[k].padStart(6)).join(''));
if (base && base.corpus) console.log('corpus mean'.padEnd(22), ''.padStart(6 * 7), (p1(cm(base)) + ' → ' + p1(cm(cur))).padStart(6));
fuzzRows.forEach(([split, b, c]) => {
  console.log(('fuzz/' + split).padEnd(22), METRICS.map((k) => p1(c[k]).padStart(6)).join(''));
  if (b) console.log('  change'.padEnd(22), METRICS.map((k) => (typeof b[k] === 'number' && typeof c[k] === 'number' ? d1(c[k] - b[k]) : '-').padStart(6)).join(''));
});
if (metaRows.length) {
  console.log('\nmeta (transform: same as the seed · mean total · Δ from the seeds)');
  metaRows.forEach(([t, b, c]) => console.log('  ' + t.padEnd(12), (c.same + '/' + c.n).padStart(6), p1(c.total).padStart(6), d1(c.delta).padStart(6),
    b ? '  (was ' + b.same + '/' + b.n + ' ' + p1(b.total) + ')' : ''));
}
const mk = (run) => run && run.corpus ? Object.values(run.corpus).reduce((a, r) => a + (r.markup || 0), 0) : '-';
console.log('inline markup lost'.padEnd(22), 'corpus', mk(cur), 'files' + (base ? ' (was ' + mk(base) + ')' : ''),
  ...['dev', 'heldout'].filter((s) => cur.fuzz[s]).map((s) => '· ' + s + ' ' + cur.fuzz[s].markup + (base && base.fuzz && base.fuzz[s] ? ' (was ' + (base.fuzz[s].markup || 0) + ')' : '')));
if (notes.length) { console.log('\nnotes'); notes.forEach((n) => console.log('  · ' + n)); }
if (fails.length) { console.log('\nFAILED (tolerance: ' + p1(TOL_FILE) + ' per corpus file, ' + p1(TOL_MEAN) + ' per fuzz or meta mean, ' + p1(TOL_HARD) + ' per hard transform)'); fails.forEach((f) => console.log('  ✗ ' + f)); }
else console.log('\npassed');

// ── --update: this run becomes the baseline ────────────────────────────
if (opt('--update')) {
  if (fails.length && !opt('--force')) { console.log('\nbaseline.json not written: the gate failed (--force writes it anyway)'); process.exit(1); }
  const out = { written: new Date().toISOString(), note: 'scripts/gate.js --update; the fuzz means hold only for their env', corpus: cur.corpus, fuzz: {} };
  Object.keys(cur.fuzz).forEach((s) => { out.fuzz[s] = Object.assign({}, cur.fuzz[s]); delete out.fuzz[s].files; });
  if (cur.meta) out.meta = cur.meta;
  fs.writeFileSync(BASELINE, JSON.stringify(out, null, 1) + '\n');
  console.log('\nbaseline.json written');
}
process.exitCode = fails.length ? 1 : 0;
