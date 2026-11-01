// Words of a real PDF against pdftotext's (no source Markdown exists): recall (share of pdftotext's words
// found) and order (LCS over its words). Shared by run-real.js and snapshot.js.
// Arabic script is folded on both sides, so that pdftotext's habits do not count as misses: it writes
// lam-alef as «ال» from the ligature's visual order, keeps bidi marks, drops ZWNJ; and the importer's yeh /
// kaf and digits may be the Persian ones where the ToUnicode said Arabic or ASCII.
const cp = require('child_process');
const { words } = require('./score.js');

function lcs(src, got) {
  const n = src.length, m = got.length, band = Math.max(300, Math.abs(n - m) + 300);
  let prev = new Map(), best = 0;
  for (let i = 1; i <= n; i++) {
    const cur = new Map(), c = Math.round(i * m / Math.max(n, 1));
    for (let j = Math.max(1, c - band); j <= Math.min(m, c + band); j++) {
      const v = src[i - 1] === got[j - 1] ? (prev.get(j - 1) || 0) + 1 : Math.max(prev.get(j) || 0, cur.get(j - 1) || 0);
      cur.set(j, v); if (v > best) best = v;
    }
    prev = cur;
  }
  return n ? best / n : 1;
}
const fold = (w) => w.normalize('NFKC').replace(/[‪-‮‎‏‌]/g, '').replace(/لا/g, 'ال').replace(/[ً-ْ]/g, '')
  .replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/ة/g, 'ۀ').replace(/[۰-۹]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x6C0))
  .replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x630));
const norm = (ws) => ws.map((w) => fold(w.toLowerCase())).filter((w) => w);

/** pdftotext's text of a file ('' when it fails) */
function pdftotext(file) {
  try { return cp.execFileSync('pdftotext', ['-enc', 'UTF-8', file, '-'], { encoding: 'utf8', maxBuffer: 1 << 28 }); } catch (e) { return ''; }
}
/** { ref, recall, order } of a Markdown against pdftotext's words of the file */
function against(refText, markdown) {
  // (the importer writes numbers in ASCII by default: «۶٬۹۰۰» is «6,900», split the same way)
  const seps = (t) => t.replace(/٬/g, ',').replace(/٫/g, '.').replace(/٪/g, '%');
  const rw = norm(words(seps(refText.replace(/-\n/g, ''))));
  const gw = norm(words(seps(markdown)));
  const bag = new Map(); gw.forEach((w) => bag.set(w, (bag.get(w) || 0) + 1));
  let hit = 0; rw.forEach((w) => { const n = bag.get(w) || 0; if (n) { hit++; bag.set(w, n - 1); } });
  return { ref: rw.length, recall: rw.length ? hit / rw.length : 1, order: lcs(rw, gw) };
}
module.exports = { lcs, fold, norm, pdftotext, against };
