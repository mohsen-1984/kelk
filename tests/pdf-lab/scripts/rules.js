// Rule telemetry (plan P3.2): which layout rules fired on which PDF, and which never fire.
//
//   node scripts/rules.js                   per PDF of this run (out/_rules.json): the rules that fired (× count, pages)
//   node scripts/rules.js --against DIR     … and the rules that fired on a file in DIR (another run's LAB_OUT) but not now
//   node scripts/rules.js --quiet           only the summary: dead rules, and the lost ones with --against
// out/_rules.json is written by run-import.js: { "<file>": r.rules } with r.rules = { rule: { count, pages } }
// (lib/pdfimport/thresholds.js _fire / _rulesFinish). "Dead": named by a this._fire('…') call in lib/ but fired on
// no file of the run. gate.js uses lost() for its note (never a failure).
const fs = require('fs'), path = require('path');
const { OUT, KELK } = require('./env.js');

const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
// { file: [rule, …] } of a run's _rules.json (null when the run has none)
function fired(dir) {
  const x = read(path.join(dir, '_rules.json'));
  return x ? Object.fromEntries(Object.entries(x).map(([n, r]) => [n, Object.keys(r || {}).sort()])) : null;
}
// the rules a file fired in base (same shape as fired()) and no longer in cur; files cur lacks are skipped
function lost(base, cur) {
  if (!base || !cur) return [];
  return Object.keys(base).filter((n) => cur[n]).map((n) => [n, base[n].filter((r) => !cur[n].includes(r))]).filter((x) => x[1].length);
}
// every rule name a _fire('…') call in the importer's source names
function sourceRules(kelk) {
  const lib = path.join(kelk || KELK, 'lib'), dir = path.join(lib, 'pdfimport'), names = new Set();
  const files = [path.join(lib, 'PdfImporter.js')].concat(fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.js$/.test(f)).map((f) => path.join(dir, f)) : []);
  files.forEach((f) => { for (const m of fs.readFileSync(f, 'utf8').matchAll(/_fire\(\s*'([^']+)'/g)) names.add(m[1]); });
  return Array.from(names).sort();
}

if (require.main === module) {
  const args = process.argv.slice(2), i = args.indexOf('--against'), quiet = args.includes('--quiet');
  const raw = read(path.join(OUT, '_rules.json'));
  if (!raw) { console.error('no ' + path.join(OUT, '_rules.json') + ' — run scripts/run-import.js first'); process.exit(2); }
  const any = new Set();
  Object.keys(raw).sort().forEach((n) => {
    const rs = Object.entries(raw[n] || {});
    rs.forEach(([r]) => any.add(r));
    if (!quiet) console.log(n.padEnd(46), rs.length ? rs.map(([r, x]) => r + '×' + x.count + (x.pages.length ? ' p' + x.pages.join(',') : '')).join('  ') : '-');
  });
  const all = sourceRules(), dead = all.filter((r) => !any.has(r));
  console.log('\n' + Object.keys(raw).length + ' file(s), ' + all.length + ' rule(s) in lib/, ' + any.size + ' fired, dead: ' + (dead.join(', ') || 'none'));
  if (i >= 0) {
    const dir = path.resolve(args[i + 1] || '.'), was = fired(dir);
    if (!was) { console.error('no _rules.json in ' + dir); process.exit(2); }
    const l = lost(was, fired(OUT));
    console.log('fired in ' + path.relative(process.cwd(), dir) + ', not now: ' + (l.length ? '' : 'none'));
    l.forEach(([n, rs]) => console.log('  ' + n.padEnd(44), rs.join(', ')));
  }
}
module.exports = { fired, lost, sourceRules };
