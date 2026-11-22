/**
 * The decipherment of a font Kelk does not know (lib/pdfimport/decipher.js, Kelk 3.5): the language model, the pooling
 * of subsets, and a reading of a whole text from glyph ids alone. Pure: the font is read from the repository's font zip
 * (a face Kelk ships, renumbered here — the mechanics, not the accuracy: the lab measures that on fonts Kelk does not know).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const PdfImporter = require(path.join(root, 'lib', 'PdfImporter.js'));
require(path.join(root, 'lib', 'pdfimport', 'cff.js'));
require(path.join(root, 'lib', 'pdfimport', 'fontprint.js'));
const G = require(path.join(root, 'lib', 'pdfimport', 'glyphfeat.js'));
const D = require(path.join(root, 'lib', 'pdfimport', 'decipher.js'));
require(path.join(root, 'lib', 'pdfimport', 'lm-fa.js'));
const model = G.model(require(path.join(root, 'lib', 'pdfimport', 'featmodel.js')));
const JSZip = require(path.join(root, 'vendor', fs.readdirSync(path.join(root, 'vendor')).find((f) => /^jszip\.min_.*\.js$/.test(f))));

const TEXT = 'در شهر ما یک باغ بزرگ هست که مردم هر روز صبح در آن راه می‌روند و با هم حرف می‌زنند. کنار باغ کتابخانه‌ای ' +
  'کوچک ساخته‌اند که کودکان پس از مدرسه در آن کتاب می‌خوانند و نقاشی می‌کشند. شهرداری قرار است سال آینده درختان ' +
  'تازه‌ای در باغ بکارد و چند نیمکت برای پیرمردها و پیرزن‌ها بگذارد. همسایه‌ها هم گفته‌اند که در آب دادن به درختان ' +
  'کمک می‌کنند تا باغ در تابستان سبز بماند.';

/** the text drawn in a face: each word's letters as their joining forms' glyph ids, a line's words right to left */
async function draw(name) {
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(root, 'assets', 'fonts', 'download', 'persian-fonts-ttf.zip')));
  const bytes = await zip.files[name].async('uint8array'), g2u = PdfImporter._internal.sfntLigatures(bytes).g2u, PF = PdfImporter._internal.PF;
  const gid = {}; Object.keys(g2u).forEach((g) => { if (!(g2u[g] in gid)) gid[g2u[g]] = +g; });
  const FORMS = {}; Object.keys(PF).forEach((c) => { (FORMS[PF[c][0]] = FORMS[PF[c][0]] || [])[PF[c][1]] = c; });
  const DUAL = PdfImporter._internal.DUAL, truth = new Map(), counts = new Map(), seqs = [];
  const words = TEXT.replace(/[.،]/g, '').split(' ');
  for (let i = 0; i < words.length; i += 8) {
    const seq = [];
    words.slice(i, i + 8).forEach((w, k) => {
      if (k) seq.push(null);
      const ls = Array.from(w), out = [];
      ls.forEach((c, j) => {
        if (c === '‌') return;
        const prev = ls[j - 1] && ls[j - 1] !== '‌' && DUAL.test(ls[j - 1]) && FORMS[ls[j - 1]];
        const next = ls[j + 1] && ls[j + 1] !== '‌' && FORMS[ls[j + 1]] && DUAL.test(c);
        const f = FORMS[c] ? FORMS[c][prev && next ? 3 : prev ? 1 : next ? 2 : 0] || c : c;
        const g = gid[f] !== undefined ? gid[f] : gid[c];
        truth.set(g, c); counts.set(g, (counts.get(g) || 0) + 1); out.push(g);
      });
      seq.push(...out);
    });
    seqs.push(seq.reverse());                                      // (drawn left to right: the line's last letter first)
  }
  return { f: G.font(bytes), usage: { counts, seqs }, truth };
}

test('decipher: the language model scores a Persian word above its letters scrambled', function () {
  const L = D.lm(PdfImporter._lmFa);
  assert.ok(L.wordLp('کتاب') > L.wordLp('بتاک') + 3);
  assert.ok(L.wordLp('مدرسه') > L.wordLp('سدرمه'));
  assert.equal(D.lm(PdfImporter._lmFa), L, 'built once');
});

test('decipher: subsets that share enough outlines are one font, the others stay apart', function () {
  const u = (ks) => ({ counts: new Map(ks.map((k) => [k, 1])), seqs: [ks] });
  const groups = D.pool([
    { id: 'a', hs: { 1: 'x1', 2: 'x2', 3: 'x3', 4: 'x4' }, usage: u([1, 2, 3, 4]) },
    { id: 'b', hs: { 7: 'x1', 8: 'x2', 9: 'x3' }, usage: u([7, 8, 9]) },
    { id: 'c', hs: { 1: 'y1', 2: 'y2', 3: 'y3' }, usage: u([1, 2, 3]) }
  ]);
  assert.equal(groups.length, 2);
  const ab = groups.find((g) => g.ids.length === 2);
  assert.deepEqual(ab.ids.sort(), ['a', 'b']);
  assert.equal(ab.key('a', 1), ab.key('b', 7), 'one outline, one glyph of the pooled font');
  assert.notEqual(ab.key('a', 4), ab.key('b', 9));
});

test('decipher: a renumbered face read from its glyph ids alone, its verdict from its own signals', async function () {
  const { f, usage, truth } = await draw('vazirmatn/Vazirmatn-Medium.ttf');
  const P = D.prepare(f, usage, model);
  assert.equal(P.hollow, false);
  assert.ok(D.joinShare(f, usage) >= 0.3, 'Arabic script: its glyphs join forward');
  let ticks = 0;
  const r = await D.run({ symbols: P.symbols, words: P.words, lm: D.lm(PdfImporter._lmFa), model, lexicon: null, tick: () => { ticks++; } });
  let ok = 0, n = 0;
  usage.counts.forEach((c, g) => { n += c; if (r.map.get(g) === truth.get(g)) ok += c; });
  assert.ok(ok / n >= 0.95, (100 * ok / n).toFixed(1) + ' % of the letters');
  assert.equal(r.verdict, 'read');
  assert.ok(ticks > 0, 'the search lets the page breathe (and Cancel in)');
});
