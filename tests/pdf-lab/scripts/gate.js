// The gate: did a change make the importer worse? Exit code 1 when it did.
//
//   node scripts/gate.js                     compare this run (out/) with baseline.json
//   node scripts/gate.js --against DIR       compare with another run on the same PDFs (DIR = its LAB_OUT)
//   node scripts/gate.js --update [--force]  write baseline.json from this run (refused when the gate fails, when
//                                            the run lacks lab PDFs, or with --against)
//   node scripts/gate.js --update --partial  merge this run's files into baseline.json (a filtered run), the rest kept
//   node scripts/gate.js --baseline FILE ... read and write FILE instead of baseline.json (a candidate baseline)
// A fuzz split or the meta part this run lacks (no wkhtmltopdf / qpdf here) is kept from the old baseline; so is a
// meta transform this run lacks, when the old baseline holds it with its own records (generator 3 on).
//
// What it reads — the results of the runs, it runs nothing itself:
//   out/_scores.json                         run-import.js (the corpus)
//   out/fuzz-dev/_scores.json, fuzz-heldout  run-fuzz.js dev | heldout
//   out/meta/_scores.json                    run-meta.js (the metamorphic net)
//   out/golden/_scores.json                  golden.js (the golden files: golden/<name>.md typed from the page)
//
// What fails:
//   corpus  a file that crashes, or whose total drops more than TOL_FILE (one file is enough: the corpus
//           files are few and each stands for a producer)
//   pic     the share of a file's text lying under a figure the importer cropped (r.quality) rising: text stays text
//   mix     Markdown lines holding a picture and words (run-import.js) rising: text wins over pictures
//   links   the links found with their words and address (run-import.js) dropping, per file
//   markup  inline markup the Markdown lost (markup.js: bold, italic, strike, code a CommonMark parser no longer
//           finds) rising — on any corpus file, or summed over a fuzz split. A count; it should be 0
//   fuzz    a crash, or the split's mean total dropping more than TOL_MEAN — and so each direction's (ltr, rtl) mean
//           total and the rtl column's mean over the right-to-left files (an old baseline without them: a note). Means only — per file
//           would read held-out files one by one, and per style value the groups are too small to
//           tell a change from noise (fewer than 15 files in most)
//   golden  a golden file that crashes (or lost its PDF), or whose total drops more than TOL_GOLDEN against the
//           compared side (baseline.json's golden section, or --against's golden/_scores.json); a new golden file, one
//           gone from a filtered or --dir run, a structure diff that grew (structdiff.js edits) or one metric down while the total holds: notes.
//           --update writes the section only from a run of the lab's own golden/ folder holding every golden file
//           (else refused, as the corpus; --partial merges the run's files)
//   rules   (a note, never a failure) a rule that fired on a corpus file and no longer does on it (rules.js,
//           out/_rules.json; the baseline keeps each file's fired rules from --update)
//   meta    a crash; a file of a "same" transform not byte-identical to its reference outside run-meta.js KNOWN (or
//           listed but under its floor, or crashing); a "same" file the compared side has and this run lacks;
//           or a transform's mean total, over the seeds both runs have, dropping more than TOL_MEAN (TOL_HARD
//           for the 'hard' ones, which take information away and swing more) — compared only with a baseline
//           entry of the same transform version and env (a new or changed transform is a note); fewer files
//           read "same" as their reference, or a reference-free relation broken more often, is a note
// A drop in one metric while the total holds (headings −3, tables +3) is printed, not failed: it is
// worth a look, not a block.
//
// Stored fuzz scores are compared only when the PDFs came from the same generator and environment
// (make-fuzz.js GENERATOR, Chromium, wkhtmltopdf, fonts — the manifest's env): another generator or browser
// draws other PDFs, and its scores say nothing about the importer. Then the gate says so and skips the fuzz
// part; --against (two importers on the very same PDFs) needs no such care — that is what CI uses.
const fs = require('fs'), path = require('path');
const { LAB, OUT, labPdfs } = require('./env.js');
const rulesLib = require('./rules.js');

const TOL_FILE = 0.005, TOL_MEAN = 0.010, TOL_HARD = 0.030;      // 0.5, 1 and 3 points of 100
const { compareGolden, TOL_GOLDEN } = require('./gate-golden.js');   // 0.5 point, per golden file (the golden part, pure)
const METRICS = ['recall', 'order', 'headings', 'lists', 'tables', 'code', 'quotes', 'total'];
const CORPUS_EXTRA = ['rtl', 'zwnj', 'yehKaf', 'digits', 'brackets'];   // right-to-left details (score.js), corpus only
const LINKS = 'links';                                             // links found with their address (run-import.js), corpus only
const SHORT = { recall: 'words', order: 'order', headings: 'head', lists: 'list', tables: 'tabl', code: 'code', quotes: 'quote', total: 'total' };
const args = process.argv.slice(2);
const opt = (k) => { const eq = args.find((x) => x.startsWith(k + '=')); if (eq) return eq.slice(k.length + 1) || true; const i = args.indexOf(k); return i < 0 ? null : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
if (opt('--baseline') === true) { console.error('--baseline needs a file'); process.exit(2); }
const BASELINE = opt('--baseline') ? path.resolve(String(opt('--baseline'))) : path.join(LAB, 'baseline.json');
const BNAME = opt('--baseline') ? path.relative(process.cwd(), BASELINE) : 'baseline.json';
// written from another run, the baseline would hold what that comparison said, not this run against it
if (opt('--update') && opt('--against')) { console.error('--update with --against refused: the gate would compare with another run, not with the ' + BNAME + ' being written'); process.exit(2); }
const p1 = (x) => typeof x === 'number' ? (100 * x).toFixed(1) : '-';
const d1 = (x) => (x >= 0 ? '+' : '') + (100 * x).toFixed(1);
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };

// one run, from its output folder, in the baseline's shape
function load(dir) {
  const corpus = read(path.join(dir, '_scores.json'));
  const run = { corpus: null, fuzz: {}, rules: rulesLib.fired(dir) };
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
    const means = (m) => { const o = {}; METRICS.concat(CORPUS_EXTRA).forEach((k) => { if (m && typeof m[k] === 'number') o[k] = +m[k].toFixed(4); }); return o; };
    const mean = means(f.summary.mean);
    // per direction (generator 4: ltr / rtl files), each with its mean total and, for rtl, the rtl column and its parts
    const byDir = f.summary.byDir ? Object.fromEntries(Object.entries(f.summary.byDir).map(([d, x]) => [d, { n: x.n, mean: means(x.mean) }])) : undefined;
    run.fuzz[split] = { n: f.summary.n, errors: f.summary.errors, env: f.summary.env, mean, byDir, markup: f.summary.markup || 0,
                        // per file, for --against on dev only (never printed for held-out)
                        files: split === 'dev' ? Object.fromEntries(f.rows.map((r) => [r.name, +(r.total || 0).toFixed(4)])) : undefined };
  });
  // meta, per transform: its own version (v), the env its files depend on, the total of every seed (the means of
  // two runs are compared over the seeds both have), the seeds read exactly, the "same" files outside the known
  // exceptions (run-meta.js), the reference-free relation's count
  const meta = read(path.join(dir, 'meta', '_scores.json'));
  if (meta) run.meta = { generator: meta.generator, env: meta.env, transforms: Object.fromEntries(Object.entries(meta.summary).map(([t, x]) =>
    [t, { kind: x.kind, via: x.via, v: x.v, env: x.env, n: x.n, same: x.same, errors: x.errors, unexpected: x.unexpected || 0, relation: x.relation,
          // (the mean of the stored per-seed totals, as the comparison takes it: both figures rounded alike)
          total: x.files ? Object.values(x.files).reduce((a, v) => a + v, 0) / Object.values(x.files).length : +x.total.toFixed(4),
          delta: +x.delta.toFixed(4), files: x.files,
          exact: (meta.rows || []).filter((r) => r.transform === t && r.same).map((r) => r.seed) }])) };
  // the golden files, per file as the corpus (golden.js): lab = it read the lab's golden/ folder, filter = a filtered run
  const golden = read(path.join(dir, 'golden', '_scores.json'));
  if (golden) {
    run.golden = { lab: !!golden.lab, filter: golden.filter || null, files: {} };
    (golden.rows || []).forEach((r) => {
      const o = { error: r.error || null };
      METRICS.concat(CORPUS_EXTRA).forEach((k) => { if (typeof r[k] === 'number') o[k] = +r[k].toFixed(4); });
      if (r.struct) o.edits = r.struct.edits;
      run.golden.files[r.name] = o;
    });
  }
  return run;
}
const sameEnv = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);

const cur = load(OUT);
const against = opt('--against');
const base = against ? load(path.resolve(String(against))) : read(BASELINE);
const fails = [], notes = [];

if (!cur.corpus) { console.error('no ' + path.relative(process.cwd(), path.join(OUT, '_scores.json')) + ' — run scripts/run-import.js first'); process.exit(2); }
if (!base) notes.push(against ? 'nothing to compare with in ' + against : 'no ' + BNAME + ' yet — write one with --update');

// ── the corpus: file by file ───────────────────────────────────────────
if (base && base.corpus) {
  const dropped = [], rose = [], metricMoves = [], gone = [];
  Object.keys(base.corpus).forEach((name) => {
    const b = base.corpus[name], c = cur.corpus[name];
    if (!c) { gone.push(name); return; }
    if (c.error && !b.error) { fails.push('corpus: ' + name + ' crashes — ' + c.error); return; }
    // scored then, not now (no crash): its corpus/<doc>.md is gone or the file's --doc changed — the file is no longer gated
    if (typeof b.total === 'number' && typeof c.total !== 'number' && !c.error) fails.push('corpus: ' + name + ' is no longer scored (corpus/<doc>.md missing or renamed?)');
    if (typeof b.total !== 'number' || typeof c.total !== 'number') return;
    const d = c.total - b.total;
    if (d < -TOL_FILE) dropped.push([name, b.total, c.total]);
    // the right-to-left details hold on their own: a ZWNJ or a yeh lost while the total holds is still a loss
    if (typeof b.rtl === 'number' && typeof c.rtl === 'number' && c.rtl - b.rtl < -TOL_FILE) {
      const why = CORPUS_EXTRA.slice(1).filter((k) => typeof b[k] === 'number' && typeof c[k] === 'number' && c[k] < b[k]).map((k) => k + ' ' + p1(b[k]) + '→' + p1(c[k])).join(', ');
      fails.push('corpus: ' + name + ' right-to-left details ' + p1(b.rtl) + ' → ' + p1(c.rtl) + (why ? ' (' + why + ')' : ''));
    } else if (d > TOL_FILE) rose.push([name, b.total, c.total]);
    // links hold on their own too (outside the total): a link given to the wrong words is a loss the words do not show
    if (typeof b.links === 'number' && typeof c.links === 'number' && c.links - b.links < -TOL_FILE)
      fails.push('corpus: ' + name + ' links ' + p1(b.links) + ' → ' + p1(c.links));
    METRICS.slice(0, -1).forEach((k) => {
      if (typeof b[k] === 'number' && typeof c[k] === 'number' && c[k] - b[k] < -0.02 && d >= -TOL_FILE) metricMoves.push(name + ' ' + SHORT[k] + ' ' + p1(b[k]) + ' → ' + p1(c[k]));
    });
  });
  if (gone.length > 5) notes.push('corpus: ' + gone.length + ' baseline files not in this run — filtered run? (' + gone.slice(0, 5).join(', ') + ' …)');
  else gone.forEach((n) => notes.push('corpus: ' + n + ' is gone from this run (filtered? deleted?)'));
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

// ── rule telemetry: a rule that fired on a corpus file and no longer does — a note ──
const lostRules = rulesLib.lost(base && base.rules, cur.rules);
if (lostRules.length) notes.push('rules: fired on a corpus file before, not now (scripts/rules.js --against): ' +
  lostRules.slice(0, 10).map(([n, rs]) => n + ' ' + rs.join(', ')).join('; ') + (lostRules.length > 10 ? ' … (' + lostRules.length + ' files)' : ''));

// ── the fuzz splits: means only ────────────────────────────────────────
const fuzzRows = [], dirRows = [];
['dev', 'heldout'].forEach((split) => {
  const c = cur.fuzz[split], b = base && base.fuzz && base.fuzz[split];
  if (!c) { notes.push('fuzz/' + split + ': not run (scripts/run-fuzz.js ' + split + ')'); return; }
  if (c.errors) fails.push('fuzz/' + split + ': ' + c.errors + ' PDF(s) crash');
  if (!b) { fuzzRows.push([split, null, c.mean]); return; }
  // another generator (make-fuzz.js GENERATOR: other documents, other dimensions) draws other PDFs from the same
  // seeds, whatever the browser: its means are of another set — said first, as it is the usual cause after a lab change
  const bg = (b.env || {}).generator, cg = (c.env || {}).generator;
  // with --against the two runs read the same fuzz folder, so the same manifest; another env there means two sets
  if (against && !sameEnv(b.env, c.env)) {
    notes.push('fuzz/' + split + ': the two runs read different fuzz PDFs (env or generator ' + (bg === undefined ? '?' : bg) + ' → ' + (cg === undefined ? '?' : cg) + ') — not compared');
    fuzzRows.push([split, null, c.mean]); return;
  }
  if (!against && bg !== cg) {
    notes.push('fuzz/' + split + ': drawn by generator ' + (cg === undefined ? '?' : cg) + ', the baseline\'s by generator ' + (bg === undefined ? '?' : bg) +
      ' — another set of PDFs, not compared; the baseline\'s fuzz part is rebuilt with --update (on the CI runner: a manual run with "baseline")');
    fuzzRows.push([split, null, c.mean]); return;
  }
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
  // per direction and the rtl column: a loss on the right-to-left files alone barely moves the split's mean (44 of 100
  // files: 2 points there ≈ 0.9 on the mean), so each direction's mean total and the rtl column are held on their own
  if (c.byDir && !b.byDir) notes.push('fuzz/' + split + ': the baseline has no per-direction means (written before they were stored) — ltr / rtl and the rtl column not gated; --update writes them');
  else if (c.byDir) {
    Object.entries(c.byDir).forEach(([dir, cd]) => {
      const bd = b.byDir[dir];
      if (!bd) { notes.push('fuzz/' + split + ' ' + dir + ': not in the baseline — not gated'); return; }
      dirRows.push([split, dir, bd, cd]);
      if (bd.n !== cd.n) notes.push('fuzz/' + split + ' ' + dir + ': ' + bd.n + ' PDFs then, ' + cd.n + ' now');
      if (typeof bd.mean.total === 'number' && cd.mean.total - bd.mean.total < -TOL_MEAN) fails.push('fuzz/' + split + ' ' + dir + ': mean ' + p1(bd.mean.total) + ' → ' + p1(cd.mean.total));
      if (typeof bd.mean.rtl === 'number' && typeof cd.mean.rtl === 'number') {
        if (cd.mean.rtl - bd.mean.rtl < -TOL_MEAN) fails.push('fuzz/' + split + ' ' + dir + ': rtl column ' + p1(bd.mean.rtl) + ' → ' + p1(cd.mean.rtl));
        // its parts: a note, as the corpus's metrics are
        const why = CORPUS_EXTRA.slice(1).filter((k) => typeof bd.mean[k] === 'number' && typeof cd.mean[k] === 'number' && cd.mean[k] - bd.mean[k] < -0.02);
        if (why.length) notes.push('fuzz/' + split + ' ' + dir + ', rtl parts down: ' + why.map((k) => k + ' ' + p1(bd.mean[k]) + '→' + p1(cd.mean[k])).join(', '));
      }
    });
  }
  // dev, two runs on the same PDFs: which files moved most (held-out stays a mean)
  if (split === 'dev' && b.files && c.files) {
    const moved = Object.keys(c.files).filter((n) => n in b.files).map((n) => [n, c.files[n] - b.files[n]]).filter((x) => Math.abs(x[1]) > 0.05)
      .sort((x, y) => x[1] - y[1]);
    if (moved.length) notes.push('fuzz/dev, files that moved over 5 points: ' + moved.slice(0, 10).map(([n, x]) => n + ' ' + d1(x)).join(', ') + (moved.length > 10 ? ' …' : ''));
  }
});

// ── the metamorphic net: per transform ─────────────────────────────────
// Each transform is compared on its own, and only with a baseline entry that drew the same files: the same
// transform version (v) and the same env for what it depends on (pdf-lib; qpdf; Chromium and the platform for the
// generator side) — against another run (--against: the very same PDFs) the env needs no check. The means are taken
// over the seeds both have, so a seed added to SEEDS does not read as a change. A transform the baseline lacks (new),
// or one it holds without these records (written before generator 3), is a note: not compared, never a failure.
const metaRows = [];
if (!cur.meta) notes.push('meta: not run (scripts/make-meta.js, then run-meta.js)');
else {
  const bm = base && base.meta, uncompared = {}, other = against ? 'the other run' : BNAME;
  if (base && !bm) notes.push('meta: ' + other + ' has no meta results — not compared');
  const skip = (why, t) => { (uncompared[why] = uncompared[why] || []).push(t); };
  const mean = (files, seeds) => seeds.reduce((a, s) => a + files[s], 0) / seeds.length;
  Object.entries(cur.meta.transforms).forEach(([t, c]) => {
    const b0 = bm && bm.transforms && bm.transforms[t];
    let cmp = null;
    if (!bm) { /* nothing to compare with: noted */ }
    else if (!b0) skip('new transform, not in ' + other, t);
    else if (!b0.files || b0.v === undefined) skip(other + ' holds it without per-transform records (version, env, per-seed totals: generator ' + (bm.generator || '?') + ')', t);
    else if (!against && b0.v !== c.v) skip('transform changed (v' + b0.v + ' → v' + c.v + ')', t);
    else if (!against && !sameEnv(b0.env, c.env)) skip('drawn with another ' + Object.keys(c.env || {}).join(' / ') + ' (' + JSON.stringify(b0.env) + ' → ' + JSON.stringify(c.env) + ')', t);
    else {
      const both = Object.keys(c.files || {}).filter((s) => s in b0.files);
      const added = Object.keys(c.files || {}).filter((s) => !(s in b0.files)), gone = Object.keys(b0.files).filter((s) => !(s in (c.files || {})));
      if (!both.length) skip('no seed in common with ' + other, t);
      else {
        cmp = { n: both.length, total: mean(b0.files, both), cur: mean(c.files, both), same: (b0.exact || []).filter((s) => both.includes(s)).length,
                curSame: (c.exact || []).filter((s) => both.includes(s)).length };
        if (added.length || gone.length) notes.push('meta/' + t + ': compared over the ' + both.length + ' seeds both runs have' +
          (added.length ? ' (new: ' + added.join(', ') + ')' : '') + (gone.length ? ' (gone: ' + gone.join(', ') + ')' : ''));
      }
      // a "same" file the other side has and this run lacks: make-meta.js could not make it, or a seed left SEEDS —
      // either way the assertion no longer covers it (a seed taken out on purpose: rebuild the baseline)
      if (c.kind === 'same' && gone.length) fails.push('meta/' + t + ': ' + gone.length + ' "same" file(s) in ' + other + ' missing from this run: ' + gone.join(', '));
    }
    metaRows.push([t, cmp, c]);
    if (c.errors && !(b0 && cmp && b0.errors >= c.errors)) fails.push('meta/' + t + ': ' + c.errors + ' PDF(s) crash');
    // the "same" assertion (run-meta.js): a file outside the known exceptions not byte-identical to its reference
    if (c.unexpected) fails.push('meta/' + t + ': ' + c.unexpected + ' file(s) of a "same" transform not byte-identical to their reference — outside run-meta.js KNOWN, under their floor, or crashing');
    if (!cmp) return;
    const tol = c.kind === 'hard' ? TOL_HARD : TOL_MEAN;
    if (cmp.cur - cmp.total < -tol) fails.push('meta/' + t + ': mean ' + p1(cmp.total) + ' → ' + p1(cmp.cur) + (cmp.n !== c.n ? ' (over the ' + cmp.n + ' seeds in common)' : ''));
    if (cmp.curSame < cmp.same) notes.push('meta/' + t + ': ' + cmp.same + ' → ' + cmp.curSame + ' files read as their reference');
    Object.keys(c.relation || {}).forEach((rk) => {
      if (b0.relation && b0.relation[rk] !== undefined && c.relation[rk] > b0.relation[rk] && cmp.n === c.n) notes.push('meta/' + t + ': ' + rk + ' ' + b0.relation[rk] + ' → ' + c.relation[rk]);
    });
  });
  if (bm && bm.transforms) Object.keys(bm.transforms).filter((t) => !cur.meta.transforms[t]).forEach((t) => skip('in ' + other + ', not in this run (a tool missing here? make-meta.js says which)', t));
  Object.entries(uncompared).forEach(([why, ts]) => notes.push('meta: not compared — ' + why + ': ' + ts.join(', ')));
}

// ── the golden files: file by file ─────────────────────────────────────
// the compared side: --against's golden/_scores.json, or baseline.json's golden section ({ name: { total, … } })
const goldenBase = base ? (against ? base.golden && base.golden.files : base.golden) : null;
{
  const g = compareGolden(cur.golden, goldenBase, { other: against ? 'the other run' : BNAME, hasBase: !!base });
  fails.push(...g.fails); notes.push(...g.notes);
}

// ── report ─────────────────────────────────────────────────────────────
const cm = (run) => { const v = Object.values(run.corpus || {}).map((r) => r.total).filter((x) => typeof x === 'number'); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined; };
console.log('gate: this run (' + path.relative(process.cwd(), OUT) + ') against ' + (against ? path.relative(process.cwd(), path.resolve(String(against))) : BNAME) + '\n');
console.log(''.padEnd(22), METRICS.map((k) => SHORT[k].padStart(6)).join(''));
if (base && base.corpus) console.log('corpus mean'.padEnd(22), ''.padStart(6 * 7), (p1(cm(base)) + ' → ' + p1(cm(cur))).padStart(6));
if (cur.golden) {
  // this run's mean, and both sides' over the files both scored (a new golden file does not move it)
  const gt = (files, names) => { const v = names.map((n) => files[n] && files[n].total).filter((x) => typeof x === 'number'); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined; };
  const mine = Object.keys(cur.golden.files).filter((n) => typeof cur.golden.files[n].total === 'number'), both = goldenBase ? mine.filter((n) => goldenBase[n] && typeof goldenBase[n].total === 'number') : [];
  console.log(('golden mean (' + mine.length + ')').padEnd(22), ''.padStart(6 * 7), p1(gt(cur.golden.files, mine)).padStart(6),
    both.length ? '  (' + p1(gt(goldenBase, both)) + ' → ' + p1(gt(cur.golden.files, both)) + ' over the ' + both.length + ' both have)' : '');
}
fuzzRows.forEach(([split, b, c]) => {
  console.log(('fuzz/' + split).padEnd(22), METRICS.map((k) => p1(c[k]).padStart(6)).join(''));
  if (b) console.log('  change'.padEnd(22), METRICS.map((k) => (typeof b[k] === 'number' && typeof c[k] === 'number' ? d1(c[k] - b[k]) : '-').padStart(6)).join(''));
  // per direction: the mean total and the rtl column, with their change where the baseline has them
  Object.entries(cur.fuzz[split].byDir || {}).forEach(([dir, cd]) => {
    const row = dirRows.find((x) => x[0] === split && x[1] === dir), bd = row && row[2];
    const ch = (k) => bd && typeof bd.mean[k] === 'number' && typeof cd.mean[k] === 'number' ? ' (' + d1(cd.mean[k] - bd.mean[k]) + ')' : '';
    console.log(('  ' + dir + ' (' + cd.n + ')').padEnd(22), 'total ' + p1(cd.mean.total) + ch('total') + (typeof cd.mean.rtl === 'number' ? ' · rtl column ' + p1(cd.mean.rtl) + ch('rtl') : ''));
  });
});
if (metaRows.length) {
  console.log('\nmeta (transform: same as the reference · mean total · Δ from the references)');
  metaRows.forEach(([t, b, c]) => console.log('  ' + t.padEnd(12), (c.same + '/' + c.n).padStart(6), p1(c.total).padStart(6), d1(c.delta).padStart(6),
    b ? '  (was ' + b.same + '/' + b.n + ' ' + p1(b.total) + (b.n !== c.n ? ', now ' + b.curSame + '/' + b.n + ' ' + p1(b.cur) + ' on those seeds' : '') + ')' : ''));
}
const mk = (run) => run && run.corpus ? Object.values(run.corpus).reduce((a, r) => a + (r.markup || 0), 0) : '-';
console.log('inline markup lost'.padEnd(22), 'corpus', mk(cur), 'files' + (base ? ' (was ' + mk(base) + ')' : ''),
  ...['dev', 'heldout'].filter((s) => cur.fuzz[s]).map((s) => '· ' + s + ' ' + cur.fuzz[s].markup + (base && base.fuzz && base.fuzz[s] ? ' (was ' + (base.fuzz[s].markup || 0) + ')' : '')));
if (notes.length) { console.log('\nnotes'); notes.forEach((n) => console.log('  · ' + n)); }
if (fails.length) { console.log('\nFAILED (tolerance: ' + p1(TOL_FILE) + ' per corpus file, ' + p1(TOL_GOLDEN) + ' per golden file, ' + p1(TOL_MEAN) + ' per fuzz or meta mean, ' + p1(TOL_HARD) + ' per hard transform)'); fails.forEach((f) => console.log('  ✗ ' + f)); }
else console.log('\npassed');

// ── --update: this run becomes the baseline ────────────────────────────
if (opt('--update')) {
  const partial = !!opt('--partial');
  if (fails.length && !opt('--force')) { console.log('\n' + BNAME + ' not written: the gate failed (--force writes it anyway)'); process.exit(1); }
  // a filtered run written as the whole baseline leaves the other files ungated: by name, against every lab PDF
  const lab = labPdfs().map((x) => x.name.replace(/\.pdf$/, '')), missing = lab.filter((n) => !cur.corpus[n]);   // as run-import.js names them
  if (missing.length && !partial) {
    console.log('\n' + BNAME + ' not written: this run holds ' + Object.keys(cur.corpus).length + ' corpus files, the lab ' + lab.length +
      ' — missing ' + missing.slice(0, 10).join(', ') + (missing.length > 10 ? ' … (' + missing.length + ')' : '') +
      '\n  run scripts/run-import.js without a filter, or add --partial to merge these files into the baseline');
    process.exit(1);
  }
  const old = read(BASELINE) || {};
  if (partial && !old.corpus) { console.log('\n' + BNAME + ' not written: --partial needs an existing baseline to merge into — run an unfiltered --update first'); process.exit(1); }
  const out = { written: new Date().toISOString(), note: 'scripts/gate.js --update; the fuzz means hold only for their env',
                corpus: partial ? Object.assign({}, old.corpus || {}, cur.corpus) : cur.corpus, fuzz: {} };
  Object.keys(cur.fuzz).forEach((s) => { out.fuzz[s] = Object.assign({}, cur.fuzz[s]); delete out.fuzz[s].files; });
  // each corpus file's fired rules (a run without _rules.json keeps the old ones)
  if (cur.rules) out.rules = partial ? Object.assign({}, old.rules || {}, cur.rules) : cur.rules; else if (old.rules) out.rules = old.rules;
  // parts this run lacks (no wkhtmltopdf / qpdf here) stay as they were
  const kept = [];
  ['dev', 'heldout'].forEach((s) => { if (!out.fuzz[s] && old.fuzz && old.fuzz[s]) { out.fuzz[s] = old.fuzz[s]; kept.push('fuzz/' + s); } });
  // meta per transform: one this run lacks (its tool missing here) stays as it was, when it carries its own records
  if (cur.meta) {
    out.meta = Object.assign({}, cur.meta, { transforms: Object.assign({}, cur.meta.transforms) });
    Object.entries((old.meta && old.meta.transforms) || {}).forEach(([t, x]) => {
      if (!out.meta.transforms[t] && x.files && x.v !== undefined) { out.meta.transforms[t] = x; kept.push('meta/' + t); }
    });
  } else if (old.meta) { out.meta = old.meta; kept.push('meta'); }
  // golden: as the corpus — only a run of the lab's own golden/ folder holding every golden file is written whole;
  // --partial merges a filtered run's files; a run without golden.js keeps the old section
  if (cur.golden) {
    const gdir = path.join(LAB, 'golden');
    const all = fs.existsSync(gdir) ? fs.readdirSync(gdir).filter((f) => /\.md$/i.test(f) && !/^readme\.md$/i.test(f)).map((f) => f.replace(/\.md$/i, '')) : [];
    const gmissing = all.filter((n) => !cur.golden.files[n]);
    if (!cur.golden.lab) { console.log('\n' + BNAME + ' not written: the golden run read another folder than golden/ (golden.js --dir) — run it on the lab\'s own'); process.exit(1); }
    if (gmissing.length && !partial) {
      console.log('\n' + BNAME + ' not written: this run holds ' + Object.keys(cur.golden.files).length + ' golden files, golden/ ' + all.length +
        ' — missing ' + gmissing.slice(0, 10).join(', ') + (gmissing.length > 10 ? ' … (' + gmissing.length + ')' : '') +
        '\n  run scripts/golden.js without a filter, or add --partial to merge these files into the baseline');
      process.exit(1);
    }
    out.golden = partial ? Object.assign({}, old.golden || {}, cur.golden.files) : cur.golden.files;
  } else if (old.golden) { out.golden = old.golden; kept.push('golden'); }
  fs.writeFileSync(BASELINE, JSON.stringify(out, null, 1) + '\n');
  if (partial) console.log('\nmerged ' + Object.keys(cur.corpus).length + ' corpus file(s) into ' + Object.keys(old.corpus || {}).length + ' (' +
    Object.keys(cur.corpus).filter((n) => !(old.corpus || {})[n]).length + ' new): ' + Object.keys(out.corpus).length + ' in all');
  if (kept.length) console.log('kept from the old baseline (not in this run): ' + kept.join(', '));
  console.log('\n' + BNAME + ' written');
}
process.exitCode = fails.length ? 1 : 0;
