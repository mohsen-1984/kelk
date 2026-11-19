// How well the glyph shapes (lib/pdfimport/shape.js, data lib/pdfimport/shapes.js) name the glyphs of the lab's fonts
// Kelk does not know: each embedded font of a lab file of ours, each glyph ranked against the shapes of the fonts Kelk
// ships, the right character found from the font the file was made with (its fontprints: the subset keeps each
// outline). The script is taken first, by the vote of every glyph's nearest character; then each glyph is ranked
// within it. Glyph by glyph (each glyph once) and letter by letter (each glyph as often as the page draws it).
// A tool of the shape work, not a gate: the fonts must be installed (make-unknown32.py's: FREEFONT, LIBERATION).
//   node scripts/shape-accuracy.js [--misses]
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const root = path.join(__dirname, '..', '..', '..');
const PdfImporter = require(path.join(root, 'lib', 'PdfImporter.js'));
require(path.join(root, 'lib', 'pdfimport', 'fontprint.js'));
require(path.join(root, 'lib', 'pdfimport', 'shape.js'));
const S = PdfImporter._shape, F = PdfImporter._fontprint;
const faces = S.expand(require(path.join(root, 'lib', 'pdfimport', 'shapes.js')));
const misses = process.argv.includes('--misses');

const find = (env, dirs, name) => [process.env[env]].concat(dirs).map((d) => d && path.join(d, name)).find((f) => f && fs.existsSync(f));
const FREE = ['/usr/share/fonts/truetype/freefont', '/usr/share/fonts/gnu-free', '/usr/share/fonts/TTF'];
const LIB = ['/usr/share/fonts/truetype/liberation', '/usr/share/fonts/truetype/liberation2', '/usr/share/fonts/liberation', '/usr/share/fonts/TTF'];
// the lab files and the fonts they were made with, by the embedded font's name
const FILES = {
  'driver-print--unknown-serif-fa.pdf': { 'AAAAAA+DemoSerif,Bold': find('FREEFONT', FREE, 'FreeSerifBold.ttf'), 'AAAAAB+DemoSerif': find('FREEFONT', FREE, 'FreeSerif.ttf') },
  'driver-print--unknown-serif-en.pdf': { 'AAAAAC+DemoBook,Bold': find('LIBERATION', LIB, 'LiberationSerif-Bold.ttf'), 'AAAAAD+DemoBook': find('LIBERATION', LIB, 'LiberationSerif-Regular.ttf') },
};
// the same letter whatever the code (one outline draws them; the importer's settings choose later)
const fold = (t) => t.normalize('NFKC').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
  .replace(/[٠-٩]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x90));
const SCRIPTS = { arabic: /^(?:[؀-ۿ]|لا|[!-@[-`{-~«»–—])$/, latin: /^[!-~«»–—]$/ };

/** our lab PDFs' TrueType programs (plain objects, one Flate stream each) and how often each code is drawn */
function embedded(file) {
  const pdf = fs.readFileSync(file), s = pdf.toString('latin1'), out = {};
  const stream = (n) => {
    const at = s.indexOf('\n' + n + ' 0 obj\n'), len = +/\/Length (\d+)/.exec(s.slice(at, at + 200))[1], st = s.indexOf('stream\n', at) + 7;
    return zlib.inflateSync(pdf.subarray(st, st + len));
  };
  const re = /\/FontName \/([^ ]+) [^>]*\/FontFile2 (\d+) 0 R/g;
  let m;
  while ((m = re.exec(s))) out[m[1]] = { bytes: new Uint8Array(stream(m[2])), uses: {} };
  // each content stream: «/<res> <size> Tf … <hex> Tj»; the resource names map to fonts in the page's /Font dictionary
  const res = {};
  const fre = /\/(\w+) (\d+) 0 R/g, fonts = /\/Font << ([^>]*) >>/.exec(s);
  while (fonts && (m = fre.exec(fonts[1]))) {
    const at = s.indexOf('\n' + m[2] + ' 0 obj\n'), base = /\/BaseFont \/([^ ]+)/.exec(s.slice(at, at + 400));
    if (base) res[m[1]] = base[1];
  }
  const cre = /\/Contents (\d+) 0 R/g;
  while ((m = cre.exec(s))) {
    const text = stream(m[1]).toString('latin1'), tre = /\/(\w+) [\d.]+ Tf [^<]*<([0-9A-F]+)> Tj/g;
    let t;
    while ((t = tre.exec(text))) { const f = out[res[t[1]]]; if (f) f.uses[parseInt(t[2], 16)] = (f.uses[parseInt(t[2], 16)] || 0) + 1; }
  }
  return out;
}

/** a renumbered font's (1,0) cmap: code → glyph id */
function codes(d) {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength), n = v.getUint16(4), out = {};
  let cmap = -1;
  for (let k = 0; k < n; k++) if (String.fromCharCode(d[12 + 16 * k], d[13 + 16 * k], d[14 + 16 * k], d[15 + 16 * k]) === 'cmap') cmap = v.getUint32(20 + 16 * k);
  const sub = cmap + v.getUint32(cmap + 8);
  if (v.getUint16(sub) !== 6) return out;
  const first = v.getUint16(sub + 6), cnt = v.getUint16(sub + 8);
  for (let k = 0; k < cnt; k++) out[first + k] = v.getUint16(sub + 10 + 2 * k);
  return out;
}

/** the original font's fontprint → its character (through its GSUB, as for the reference faces) */
function truth(file) {
  const d = new Uint8Array(fs.readFileSync(file)), m = PdfImporter._internal.sfntLigatures(d), hs = F.hashes(d), out = {};
  const text = (g, depth) => m.g2u[g] || m[g] || (depth < 4 && m.base[g] !== undefined ? text(m.base[g], depth + 1) : '');
  Object.keys(hs).forEach((g) => { const t = text(+g, 0).replace(/ـ/g, ''); if (t && !out[hs[g]]) out[hs[g]] = fold(t); });
  return out;
}

let missing = 0;
Object.keys(FILES).forEach((name) => {
  const fonts = embedded(path.join(__dirname, '..', 'pdf', 'producers', name));
  Object.keys(FILES[name]).forEach((ps) => {
    const src = FILES[name][ps], f = fonts[ps];
    if (!src || !f) { console.log(name, ps, src ? 'not in the file' : 'its font is not installed'); missing++; return; }
    const want = truth(src), hs = F.hashes(f.bytes), sh = S.glyphs(f.bytes), cmap = codes(f.bytes);
    const rows = [];
    Object.keys(cmap).forEach((code) => {
      const g = cmap[code], t = want[hs[g]];
      if (!sh[g] || !t || !/\S/.test(t)) return;
      rows.push({ t, sh: sh[g], uses: f.uses[code] || 0 });
    });
    const votes = {};
    rows.forEach((r) => { const top = S.rank(r.sh, faces, 1)[0][0]; Object.keys(SCRIPTS).forEach((k) => { if (SCRIPTS[k].test(top) && /[^!-@[-`{-~]/.test(top)) votes[k] = (votes[k] || 0) + 1; }); });
    const script = (votes.arabic || 0) > (votes.latin || 0) ? 'arabic' : 'latin';
    let n = 0, t1 = 0, t3 = 0, u = 0, u1 = 0, u3 = 0;
    const bad = [];
    rows.forEach((r) => {
      const got = S.rank(r.sh, faces, 3, SCRIPTS[script]).map((x) => fold(x[0]));
      n++; u += r.uses;
      if (got[0] === r.t) { t1++; u1 += r.uses; } else bad.push(r.t + '→' + got[0]);
      if (got.indexOf(r.t) >= 0) { t3++; u3 += r.uses; }
    });
    const pc = (a, b) => (100 * a / b).toFixed(1);
    console.log(name.replace(/\.pdf$/, ''), ps.replace(/^\w+\+/, ''), '(' + script + ')', 'glyphs', n, 'top-1', pc(t1, n), 'top-3', pc(t3, n),
      '· letters', u, 'top-1', pc(u1, u), 'top-3', pc(u3, u));
    if (misses) console.log('  ', bad.join(' '));
  });
});
if (missing) process.exitCode = 1;
