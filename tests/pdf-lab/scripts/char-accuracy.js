// The character accuracy of an import: the imported Markdown (out/<name>.md) against the document it should come back
// as (corpus/<doc>.md), letters and digits only (no Markdown marks, spaces or signs; Arabic-script letters folded as
// the judge folds them), as 1 − the edit distance over the expected letters. Run run-import.js first.
//   node scripts/char-accuracy.js [filter]      (default: the lab's files in fonts Kelk does not know)
'use strict';
const fs = require('fs'), path = require('path');
const LAB = path.join(__dirname, '..'), OUT = require('./env.js').OUT;
const filter = new RegExp(process.argv[2] || 'unknown-serif|unreadable|renumbered-en|glyph-index-fa');
const norm = (t) => t.normalize('NFKC').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[ً-ٰٟـ]/g, '')
  .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6F0)).replace(/[^\p{L}\p{N}]/gu, '');
function edit(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
fs.readdirSync(OUT).filter((f) => /--.*\.md$/.test(f) && filter.test(f)).sort().forEach((f) => {
  const doc = f.replace(/^.*?--/, ''), want = path.join(LAB, 'corpus', doc);
  if (!fs.existsSync(want)) return;
  const a = Array.from(norm(fs.readFileSync(want, 'utf8'))), b = Array.from(norm(fs.readFileSync(path.join(OUT, f), 'utf8')));
  const acc = Math.max(0, 1 - edit(a, b) / a.length);
  console.log(f.replace(/\.md$/, '').padEnd(40), 'letters', String(a.length).padStart(5), '· character accuracy', (100 * acc).toFixed(1) + ' %');
});
