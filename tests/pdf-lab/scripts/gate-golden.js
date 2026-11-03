// The golden part of the gate (gate.js; README «Golden files»): a pure comparison of this run's golden files with the
// compared side, file by file as the corpus. No I/O — gate.js reads the runs and prints; tests/unit/gate-golden.test.js.
//
//   compareGolden(cur, goldenBase, { other, hasBase }) → { fails, notes }
//     cur         this run's golden section: { lab, filter, files: { name: { error, total, <metric>…, edits } } } (or null: not run)
//     goldenBase  the compared side's files ({ name: { total, … } }), or null when it has none
//     other       how the compared side is named in the messages (baseline.json, the other run)
//     hasBase     a compared side exists at all (a baseline / --against run), with or without golden results
//
// Fails: a golden file that crashes (or lost its PDF) where the compared side did not; a total down more than
// TOL_GOLDEN; a golden file of the compared side missing from an unfiltered run of the lab's own golden/ folder (as
// the corpus: a file no longer scored is not gated any more — deleting a golden on purpose takes a new baseline).
// Notes: a new golden file; one missing from a filtered run or from a --dir run; a total up; one metric down more
// than 2 points while the total holds; a structure diff that grew.
const TOL_GOLDEN = 0.005;                                         // 0.5 point, per golden file
const METRICS = ['recall', 'order', 'headings', 'lists', 'tables', 'code', 'quotes', 'total'];
const SHORT = { recall: 'words', order: 'order', headings: 'head', lists: 'list', tables: 'tabl', code: 'code', quotes: 'quote', total: 'total' };
const p1 = (x) => typeof x === 'number' ? (100 * x).toFixed(1) : '-';

function compareGolden(cur, goldenBase, opts) {
  const o = opts || {}, other = o.other || 'baseline.json', fails = [], notes = [];
  if (!cur) { notes.push('golden: not run (scripts/golden.js)'); return { fails, notes }; }
  const files = cur.files || {};
  if (!cur.lab) notes.push('golden: this run read another folder than golden/ — compared by name all the same');
  if (o.hasBase && !goldenBase && Object.keys(files).length) notes.push('golden: ' + other + ' has no golden results — not compared');
  const gb = goldenBase || {}, moves = [], rose = [];
  Object.entries(files).forEach(([n, c]) => {
    const b = gb[n];
    if (c.error) { if (!(b && b.error)) fails.push('golden: ' + n + ' — ' + c.error); return; }
    if (!goldenBase) return;
    if (!b) { notes.push('golden: new file ' + n + ' (' + p1(c.total) + ')'); return; }
    if (typeof b.total !== 'number' || typeof c.total !== 'number') return;
    const d = c.total - b.total;
    if (d < -TOL_GOLDEN) fails.push('golden: ' + n + ' ' + p1(b.total) + ' → ' + p1(c.total));
    else {
      if (d > TOL_GOLDEN) rose.push(n + ' ' + p1(b.total) + ' → ' + p1(c.total));
      METRICS.slice(0, -1).forEach((k) => { if (typeof b[k] === 'number' && typeof c[k] === 'number' && c[k] - b[k] < -0.02) moves.push(n + ' ' + SHORT[k] + ' ' + p1(b[k]) + ' → ' + p1(c[k])); });
    }
    if (typeof b.edits === 'number' && typeof c.edits === 'number' && c.edits > b.edits) moves.push(n + ' structure edits ' + b.edits + ' → ' + c.edits);
  });
  if (goldenBase) {
    const gone = Object.keys(gb).filter((n) => !files[n]);
    const list = gone.slice(0, 10).join(', ') + (gone.length > 10 ? ' …' : '');
    if (gone.length && cur.lab && !cur.filter) fails.push('golden: ' + gone.length + ' file(s) of ' + other + ' no longer scored (golden/<name>.md missing or renamed?): ' + list);
    else if (gone.length) notes.push('golden: ' + gone.length + ' file(s) of ' + other + ' not in this run' + (cur.filter ? ' (filtered: ' + cur.filter + ')' : ' (another folder than golden/)') + ': ' + list);
  }
  if (rose.length) notes.push('golden, better: ' + rose.join(', '));
  if (moves.length) notes.push('golden, one metric down (or the structure diff up) while the total holds: ' + moves.join('; '));
  return { fails, notes };
}

module.exports = { compareGolden, TOL_GOLDEN };
