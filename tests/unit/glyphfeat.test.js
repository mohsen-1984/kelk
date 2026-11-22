/**
 * Outline features (lib/pdfimport/glyphfeat.js) and the feature model they are counted into (lib/pdfimport/featmodel.js,
 * tools/build-featmodel.js) — Kelk 3.5's decipherment of fonts Kelk does not know. Pure: the fonts are read from the
 * repository's font zip.
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
const data = require(path.join(root, 'lib', 'pdfimport', 'featmodel.js'));
const JSZip = require(path.join(root, 'vendor', fs.readdirSync(path.join(root, 'vendor')).find((f) => /^jszip\.min_.*\.js$/.test(f))));

let zip = null;
async function face(name) {
  zip = zip || await JSZip.loadAsync(fs.readFileSync(path.join(root, 'assets', 'fonts', 'download', 'persian-fonts-ttf.zip')));
  const bytes = await zip.files[name].async('uint8array'), g2u = PdfImporter._internal.sfntLigatures(bytes).g2u, gid = {};
  Object.keys(g2u).forEach((g) => { if (!(g2u[g] in gid)) gid[g2u[g]] = +g; });
  return { f: G.font(bytes), gid };
}

test('glyphfeat: dots, joins, tall strokes, the kashida and holes, from a face\'s outlines alone', async function () {
  const { f, gid } = await face('vazirmatn/Vazirmatn-Regular.ttf');
  assert.equal(f.cff, false);
  const cx = G.context(f, Object.values(gid));
  assert.ok(cx.dot > 0);
  const e = (ch) => G.features(f, gid[ch], cx);
  assert.deepEqual([e('ب').above, e('ب').below], [0, 1]);
  assert.deepEqual([e('ت').above, e('ت').below], [2, 0]);
  assert.deepEqual([e('پ').above, e('پ').below], [0, 3]);
  assert.equal(e('ش').above, 3);
  assert.equal(e('ﺑ').left, true, 'an initial form joins forward: its outline reaches the left edge on the baseline');
  assert.equal(e('ب').left, false);
  assert.equal(e('ـ').kashida, true);
  assert.equal(e('ﻻ').tall, 2, 'lam-alef: two tall strokes');
  assert.equal(G.holes(f, gid['ه']), 1);
  assert.equal(G.holes(f, gid['ب']), 0);
  assert.deepEqual(G.features(f, gid[' '], cx), { blank: true });
});

test('featmodel: counted on the fonts Kelk ships only, a group a licence, summed when loaded', function () {
  assert.deepEqual(data.feats, Object.keys(G.FEATS));
  assert.deepEqual(data.groups.map((g) => g.name), ['ofl', 'borna-rayaneh']);
  const faces = [].concat(...data.groups.map((g) => g.faces));
  assert.equal(faces.length, 17);
  // the faces held out to test the reading are not in it
  ['BMITRABD.TTF', 'BTITRBD.TTF', 'BNAZANNO.TTF'].forEach((x) => assert.ok(faces.indexOf(x) < 0, x));
  assert.ok(!faces.some((x) => /dejavu|free|noto|liberation/i.test(x)));
  const m = G.model(data), n = (key) => data.groups.reduce((s, g) => s + (g.classes[key] ? g.classes[key][0] : 0), 0);
  assert.equal(m['ب|1'].n, n('ب|1'));
  assert.equal(m['ب|1'].c.b.reduce((a, b) => a + b, 0), m['ب|1'].n);
  assert.ok(G.logp(m, 'پ', false, { a: 0, b: 3, t: 1, d: 0, h: 0, k: 0, s: 0, w: 2 }) > G.logp(m, 'ت', false, { a: 0, b: 3, t: 1, d: 0, h: 0, k: 0, s: 0, w: 2 }));
  assert.equal(G.logp(m, 'no such letter', false, {}), null);
});

test('featmodel: a face it never saw (B Titr Bold) — the true letter among the five likeliest for most letters', async function () {
  const { f, gid } = await face('borna-rayaneh/BTITRBD.TTF');
  const m = G.model(data);
  const keys = Object.keys(gid).filter((c) => /^[ا-يپچژکگی]$/.test(c) && c !== 'ي');
  const cx = G.context(f, keys.map((c) => gid[c]));
  const rows = keys.map((c) => G.features(f, gid[c], cx)).filter((e) => !e.blank);
  const tops = rows.map((e) => e.bodyTop).sort((a, b) => a - b), H = tops[Math.floor(tops.length * 0.9)];
  const letters = [...new Set(Object.keys(m).filter((k) => k.endsWith('|0')).map((k) => k.slice(0, -2)).filter((l) => keys.indexOf(l) >= 0))];
  let top5 = 0;
  keys.forEach((c) => {
    const b = G.bins(G.features(f, gid[c], cx), H, G.holes(f, gid[c]), G.profile(f, gid[c]));
    const r = letters.map((l) => [l, G.logp(m, l, false, b)]).sort((x, y) => y[1] - x[1]).findIndex((x) => x[0] === c);
    if (r >= 0 && r < 5) top5++;
  });
  assert.ok(top5 / keys.length >= 0.6, top5 + ' of ' + keys.length);
});
