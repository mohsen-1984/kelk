#!/usr/bin/env node
/**
 * Build lib/pdfimport/featmodel.js — the feature model of the decipherment (Kelk 3.5): how often each outline feature
 * (lib/pdfimport/glyphfeat.js) comes with each letter and form, counted on the fonts Kelk ships only.
 *   node tools/build-featmodel.js     (`npm run check:fresh` runs it: the file must equal what its sources give)
 *
 * Calibration faces, from assets/fonts/download/persian-fonts-ttf.zip: every weight of Vazirmatn (9) and Sahel (5), and
 * B Nazanin, B Nazanin Bold and B Mitra. Each glyph the face's cmap gives a letter, a presentation form, a Persian digit
 * or one of the marks below is a sample: its letter (the form's letter after NFKC; ي ى → ی, ك → ک), whether that form
 * joins forward (initial, medial, the tatweel), its features.
 *
 * Never read here: any lab file or its fonts, and the faces held out to test the reading — B Mitra Bold (the same family
 * as a calibration face: reported apart), B Titr Bold, B Nazanin Outline, DejaVu Sans and every font Kelk does not ship.
 *
 * The counts are written per group of faces — «ofl» (Vazirmatn, Sahel) and «borna-rayaneh» (the B fonts, (c) Borna
 * Rayaneh, no published license: lib/pdf-base64-ttf-fonts/borna-rayaneh/NOTICE.txt) — and summed when loaded, so the B
 * fonts leave this file with them in one commit (their group, and their names below). Counts only, never a font.
 */
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
require(path.join(root, 'lib', 'PdfImporter.js'));
require(path.join(root, 'lib', 'pdfimport', 'cff.js'));
require(path.join(root, 'lib', 'pdfimport', 'fontprint.js'));
const G = require(path.join(root, 'lib', 'pdfimport', 'glyphfeat.js'));
const JSZip = require(path.join(root, 'vendor', fs.readdirSync(path.join(root, 'vendor')).find((f) => /^jszip\.min_.*\.js$/.test(f))));
const OUT = path.join(root, 'lib', 'pdfimport', 'featmodel.js');

const WEIGHTS = ['Thin', 'ExtraLight', 'Light', 'Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold', 'Black'];
const GROUPS = [
  { name: 'ofl', faces: WEIGHTS.map((w) => 'vazirmatn/Vazirmatn-' + w + '.ttf')
      .concat(['sahel/Sahel.ttf', 'sahel/Sahel-Light.ttf', 'sahel/Sahel-SemiBold.ttf', 'sahel/Sahel-Bold.ttf', 'sahel/Sahel-Black.ttf']) },
  // the B fonts, (c) Borna Rayaneh: their counts only, removed with them in one commit
  { name: 'borna-rayaneh', faces: ['borna-rayaneh/BNAZANIN.TTF', 'borna-rayaneh/BNAZNNBD.TTF', 'borna-rayaneh/BMITRA.TTF'] }
];

// The Arabic presentation forms and their kinds (1 isolated, 2 final, 3 initial, 4 medial), from the Unicode
// Character Database's decompositions: a run's first code point, then one kind a code point
const FORMS = 'FB50:12123412341234123412341234123412341234123412341234121212121212123412341234123412123412123412341212 FBD3:1' +
  '23412121211212121234341212121212121231231234111111111111111111111111111111111111111111111111111111111111111111' +
  '11111111111111111111111111111111112222222222222222222222222222222222222222222222222223333333333333333333333333' +
  '33333333333333333333333333333333333333333333333444444444444444444444411111111111111111111111111112222222222222' +
  '22222222222222233333334444444421 FD50:3233333323223322332323223223232232332223222223222223223233323333 FD92:33' +
  '3322322223222222222222222222222233223232222222233322 FDF0:1111111111 FE70:1 FE72:1 FE74:1 FE76:141414141411212' +
  '12121234121234121234123412341234123412121212123412341234123412341234123412341234123412341234123412341234121212' +
  '3412121212';
const KIND = new Map();
FORMS.split(' ').forEach((run) => { const [h, ks] = run.split(':'); const cp = parseInt(h, 16); [...ks].forEach((k, i) => KIND.set(cp + i, +k)); });
const MARKS = [0x60C, 0x61F, 0x2E, 0x3A, 0x28, 0x29, 0x2D, 0x21];
const base = (cp) => String.fromCodePoint(cp).normalize('NFKC').replace(/[يى]/g, 'ی').replace('ك', 'ک');

/** a TrueType program's best Unicode cmap (3,1 or 3,10, else the first): code point → glyph id */
function cmap(d) {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength), n = v.getUint16(4);
  let C;
  for (let k = 0; k < n; k++) { const o = 12 + 16 * k; if (String.fromCharCode(d[o], d[o + 1], d[o + 2], d[o + 3]) === 'cmap') C = v.getUint32(o + 8); }
  const subs = [];
  for (let i = 0, m = v.getUint16(C + 2); i < m; i++) subs.push({ p: v.getUint16(C + 4 + 8 * i), e: v.getUint16(C + 6 + 8 * i), o: C + v.getUint32(C + 8 + 8 * i) });
  const pick = subs.find((s) => s.p === 3 && s.e === 1) || subs.find((s) => s.p === 3 && s.e === 10) || subs[0];
  const map = new Map(), o = pick.o, fmt = v.getUint16(o);
  if (fmt === 4) {
    const seg = v.getUint16(o + 6) / 2, ends = o + 14, starts = ends + 2 * seg + 2, deltas = starts + 2 * seg, ranges = deltas + 2 * seg;
    for (let s = 0; s < seg; s++) {
      const end = v.getUint16(ends + 2 * s), start = v.getUint16(starts + 2 * s), delta = v.getInt16(deltas + 2 * s), ro = v.getUint16(ranges + 2 * s);
      for (let c = start; c <= end && c !== 0xFFFF; c++) {
        let g;
        if (!ro) g = (c + delta) & 0xFFFF;
        else { g = v.getUint16(ranges + 2 * s + ro + 2 * (c - start)); if (g) g = (g + delta) & 0xFFFF; }
        if (g) map.set(c, g);
      }
    }
  } else if (fmt === 12) {
    for (let i = 0, ng = v.getUint32(o + 12); i < ng; i++) {
      const a = v.getUint32(o + 16 + 12 * i), b = v.getUint32(o + 20 + 12 * i), g = v.getUint32(o + 24 + 12 * i);
      for (let c = a; c <= b; c++) map.set(c, g + c - a);
    }
  }
  return map;
}

/** one face's samples (the spike's calibrate.js, on Kelk's outline reader) */
function samples(bytes, name) {
  const f = G.font(bytes), cm = cmap(bytes);
  const cps = [...cm.keys()].sort((a, b) => a - b).filter((cp) => KIND.has(cp) || (cp >= 0x621 && cp <= 0x6CC) || (cp >= 0x6F0 && cp <= 0x6F9) || MARKS.includes(cp));
  const cx = G.context(f, cps.map((cp) => cm.get(cp)));
  const rows = cps.map((cp) => ({ cp, g: cm.get(cp), e: G.features(f, cm.get(cp), cx) })).filter((r) => !r.e.blank);
  const tops = rows.map((r) => r.e.bodyTop).sort((a, b) => a - b), H = tops[Math.floor(tops.length * 0.9)];
  const out = [];
  rows.forEach(({ cp, g, e }) => {
    const k = KIND.get(cp) || 1, b = base(cp);                      // (a base letter draws its isolated form)
    if (b.length > 2) return;
    out.push({ font: name, letter: b, fwd: k === 3 || k === 4 || cp === 0x640, e, H, holes: G.holes(f, g), pr: G.profile(f, g) });
  });
  return out;
}

(async () => {
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(root, 'assets', 'fonts', 'download', 'persian-fonts-ttf.zip')));
  const keys = Object.keys(G.FEATS), groups = [];
  let all = [];
  for (const grp of GROUPS) {
    let s = [];
    for (const name of grp.faces) {
      if (!zip.files[name]) { console.error('not in the font zip: ' + name); process.exit(1); }
      s = s.concat(samples(await zip.files[name].async('uint8array'), name));
    }
    all = all.concat(s);
    const m = G.build(s), classes = {};
    Object.keys(m).sort().forEach((key) => { classes[key] = [m[key].n].concat(...keys.map((k) => m[key].c[k])); });
    groups.push({ name: grp.name, faces: grp.faces.map((f) => f.split('/').pop()), classes });
  }
  // the forward-join detector against the forms (the spike measured 0.983 on its calibration fonts)
  const ar = all.filter((s) => /[ء-ی]/.test(s.letter) && s.letter.length === 1);
  const agree = ar.filter((s) => s.e.left === s.fwd).length / ar.length;
  const src = '/**\n * Kelk — the feature model of the decipherment (lib/pdfimport/featmodel.js): generated by tools/build-featmodel.js; do\n' +
    ' * not edit by hand. Per group of faces Kelk ships, for each letter and form («letter|1»: it joins forward), the number of\n' +
    ' * glyphs and how many of them fall in each bin of each feature (feats, in order; lib/pdfimport/glyphfeat.js). Counts\n' +
    ' * only: no font is in this file. Loaded on demand, with the decipherment.\n */\n' +
    '(function (global) {\n    const data = ' + JSON.stringify({ v: 1, feats: keys, groups }) +
    ';\n    if (typeof module !== \'undefined\' && module.exports) module.exports = data;\n    else global.KelkPdfFeatModel = data;\n' +
    '})(typeof window !== \'undefined\' ? window : globalThis);\n';
  fs.writeFileSync(OUT, src);
  console.log('lib/pdfimport/featmodel.js:', all.length, 'glyph samples from', GROUPS.reduce((n, g) => n + g.faces.length, 0), 'faces,',
    Object.keys(G.model({ v: 1, feats: keys, groups })).length, 'letter/form classes, forward-join agreement', agree.toFixed(3) + ',', fs.statSync(OUT).size, 'bytes');
})();
