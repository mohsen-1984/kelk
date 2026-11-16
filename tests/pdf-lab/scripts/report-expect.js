// What the import report must say of a lab file (expect.json), checked against a run's rows (run-import.js writes each
// file's confidence and finding codes into _scores.json). A corpus score reads the Markdown; this reads the report:
// a garbled file must be reported garbled, a clean one must not, hidden text must be found.
//   node scripts/report-expect.js            # the rows of out/_scores.json (LAB_OUT) against expect.json; exit 1 on a failure
// expect.json: { never: [codes], neverExcept: [name prefixes], files: { <name>: { has, not, confBelow, pending } } }
//   never       codes no lab file may carry unless its entry lists them under `has` (or its name starts with a neverExcept prefix)
//   has / not   codes the file's report must / must not carry; confBelow: the report's confidence must be under it
//   pending     the work that will make `has` and `confBelow` true (a release item's name): until then they are
//               printed as pending, not failed — and noted once they hold, so the mark is taken off. `not` and `never`
//               are checked at once.
// The gate (gate.js) runs the same check on the head run's rows.
'use strict';
const fs = require('fs'), path = require('path');

function checkExpect(rows, expect) {
  const fails = [], pending = [], notes = [];
  const files = (expect && expect.files) || {}, never = (expect && expect.never) || [], except = (expect && expect.neverExcept) || [];
  const byName = {};
  (rows || []).forEach((r) => { byName[r.name] = r; });
  (rows || []).forEach((r) => {
    if (r.error || !Array.isArray(r.findings)) return;
    const e = files[r.name] || {};
    if (except.some((p) => r.name.indexOf(p) === 0)) return;
    never.filter((c) => r.findings.indexOf(c) >= 0 && (e.has || []).indexOf(c) < 0)
      .forEach((c) => fails.push('report: ' + r.name + ' is reported ' + c + ' (no lab file may be, unless expect.json says so)'));
  });
  Object.keys(files).sort().forEach((name) => {
    const e = files[name], r = byName[name];
    if (!r) { notes.push('report: ' + name + ' is not in this run (filtered?)'); return; }
    if (r.error || !Array.isArray(r.findings)) return;                  // (a crash is the corpus part's failure)
    (e.not || []).filter((c) => r.findings.indexOf(c) >= 0).forEach((c) => fails.push('report: ' + name + ' is reported ' + c));
    const missing = (e.has || []).filter((c) => r.findings.indexOf(c) < 0);
    if (typeof e.confBelow === 'number' && !(typeof r.conf === 'number' && r.conf < e.confBelow)) missing.push('confidence under ' + e.confBelow + ' (it is ' + r.conf + ')');
    if (!missing.length) { if (e.pending && ((e.has || []).length || typeof e.confBelow === 'number')) notes.push('report: ' + name + ' now holds — take its pending mark («' + e.pending + '») off'); return; }
    (e.pending ? pending : fails).push('report: ' + name + ' lacks ' + missing.join(', ') + (e.pending ? ' — pending: ' + e.pending : ''));
  });
  return { fails, pending, notes };
}

module.exports = { checkExpect };

if (require.main === module) {
  const { LAB, OUT } = require('./env.js');
  const rows = JSON.parse(fs.readFileSync(path.join(OUT, '_scores.json'), 'utf8'));
  const r = checkExpect(rows, JSON.parse(fs.readFileSync(path.join(LAB, 'expect.json'), 'utf8')));
  r.notes.forEach((n) => console.log('  · ' + n));
  r.pending.forEach((n) => console.log('  … ' + n));
  r.fails.forEach((n) => console.log('  ✗ ' + n));
  console.log(r.fails.length ? 'FAILED' : 'report expectations hold (' + r.pending.length + ' pending)');
  process.exitCode = r.fails.length ? 1 : 0;
}
