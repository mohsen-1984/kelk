// The answer keys written out as Kelk writes its Markdown by default (3.6, the owner's decision, 2026-11-24): the lab
// runs with the importer's own defaults — options.asciiNumbers and options.persianLetters on, as on the page — so a key
// holds ASCII digits and signs, and ی/ک in a Persian document. This passes a key through PdfImporter's own write-out
// (_writeOut): a Persian document told as the importer tells it (پ چ ژ گ, three or more, not lost among the
// Arabic-script letters), Urdu and Kurdish letters keeping ە and ھ, code — fenced blocks and inline code spans — left
// as it is.
//   node scripts/keys-writeout.js [--write] [file.md …]   (no file: every corpus/*.md and golden/*.md)
// Without --write it lists the keys that would change; a key script (make-*.js / .py) that writes a key passes it
// through writeOut() below, or this, so a key made again stays written out.
const fs = require('fs'), path = require('path');
global.PdfImporter = require('../../../lib/PdfImporter.js');

const UR_KU = /[ٹڈڑںےڕڵۆێ]/g;

/** a key's Markdown written out as Kelk 3.6 writes its own */
function writeOut(md) {
  const pe = (md.match(/[پچژگ]/g) || []).length, ar = (md.match(/[ؠ-يٮ-ۓ]/g) || []).length;
  const imp = PdfImporter.create({});
  imp._persianDoc = pe >= 3 && pe >= 0.003 * ar;
  imp._urduKurdish = (md.match(UR_KU) || []).length >= 3;
  const W = (s) => imp._writeOut(Array.from(s).map((ch) => ({ ch: ch }))).map((g) => g.ch).join('');
  let fence = null;
  return md.split('\n').map((line) => {
    const f = line.match(/^\s*(`{3,}|~{3,})/);
    if (f) { if (!fence) fence = f[1]; else if (f[1][0] === fence[0] && f[1].length >= fence.length) fence = null; return line; }
    if (fence) return line;
    return line.split(/(`+[^`]*`+)/).map((part) => (/^`/.test(part) ? part : W(part))).join('');
  }).join('\n');
}

if (require.main === module) {
  const lab = path.join(__dirname, '..'), args = process.argv.slice(2), write = args.includes('--write');
  let files = args.filter((a) => !a.startsWith('--'));
  if (!files.length) {
    files = [];
    for (const d of ['corpus', 'golden']) {
      fs.readdirSync(path.join(lab, d)).filter((f) => /\.md$/.test(f) && !/^readme/i.test(f)).sort().forEach((f) => files.push(path.join(lab, d, f)));
    }
  }
  let n = 0;
  files.forEach((f) => {
    const md = fs.readFileSync(f, 'utf8'), out = writeOut(md);
    if (out === md) return;
    n++;
    console.log((write ? 'written: ' : 'would change: ') + path.relative(lab, f));
    if (write) fs.writeFileSync(f, out);
  });
  console.log(n + ' of ' + files.length + ' keys ' + (write ? 'written out' : 'would change'));
}

module.exports = { writeOut: writeOut };
