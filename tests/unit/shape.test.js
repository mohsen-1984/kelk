/**
 * Glyph shapes (lib/pdfimport/shape.js): a glyph known by how it looks, against the shapes of the fonts Kelk ships
 * (lib/pdfimport/shapes.js). Pure: the fonts are read from the repository's font zip.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const PdfImporter = require(path.join(root, 'lib', 'PdfImporter.js'));
require(path.join(root, 'lib', 'pdfimport', 'fontprint.js'));
require(path.join(root, 'lib', 'pdfimport', 'shape.js'));
const S = PdfImporter._shape;
const faces = S.expand(require(path.join(root, 'lib', 'pdfimport', 'shapes.js')));
const JSZip = require(path.join(root, 'vendor', fs.readdirSync(path.join(root, 'vendor')).find((f) => /^jszip\.min_.*\.js$/.test(f))));

async function font(name) {
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(root, 'assets', 'fonts', 'download', 'persian-fonts-ttf.zip')));
  return zip.files[name].async('uint8array');
}
// one letter whatever its code: ي ى ی and ك ک are one outline in these fonts
const fold = (t) => t.normalize('NFKC').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک');
const ARABIC = /^(?:[؀-ۿ]|لا|[!-@[-`{-~«»–—])$/, LATIN = /^[!-~«»–—]$/;

test('shape: a glyph packed and unpacked keeps its grid, box and dots', async function () {
  const bytes = await font('vazirmatn/Vazirmatn-Regular.ttf'), sh = S.glyphs(bytes);
  const g = Object.keys(sh)[40], a = sh[g], b = S.unpack(S.pack(a));
  assert.equal(S.pack(a).length, S.pack(b).length);
  for (let k = 0; k < a.grid.length; k++) assert.ok(Math.abs(a.grid[k] - b.grid[k]) <= 1 / 30 + 1e-6, 'cell ' + k);
  for (let k = 0; k < 5; k++) assert.ok(Math.abs(a.geo[k] - b.geo[k]) <= 1 / 32 + 1e-6, 'box ' + k);
  assert.deepEqual(b.dots, a.dots);
  assert.equal(S.distance(b, b), 0);
  assert.equal(S.pack(b), S.pack(a));
});

test('shape: a face Kelk ships — the characters its cmap and GSUB give, the forms of a letter kept apart', async function () {
  const f = S.face(await font('vazirmatn/Vazirmatn-Regular.ttf'));
  assert.deepEqual([f.family, f.face], ['Vazirmatn', 'Regular']);
  const texts = f.shapes.map((r) => r[1]);
  ['A', 'z', '7', 'ب', 'پ', 'ی', 'لا', '،'].forEach((c) => assert.ok(texts.indexOf(c) >= 0, c));
  assert.ok(texts.filter((t) => t === 'ب').length >= 4, 'the four forms of ب');
  assert.ok(texts.every((t) => !/[ﭐ-﷿ﹰ-ﻼـ]/.test(t)), 'a form is named by its letter');
  assert.ok(texts.every((t) => !/[\u0679-\u067D\u067F-\u0685\u0687-\u0697\u0699-\u06A8\u00A1-\u00AA]/.test(t)), 'no rare letter or Latin-1 sign');
});

test('shape: the table — each face read again from its font gives the same records', async function () {
  const f = S.face(await font('sahel/Sahel-Bold.ttf')), row = faces.find((x) => x.family === f.family && x.face === f.face);
  assert.ok(row, 'Sahel Bold is in shapes.js');
  assert.deepEqual(row.shapes.map((r) => r[0] + r[1]), f.shapes.map((r) => r[0] + r[1]));
});

test('shape: a glyph is found again among its own face', function () {
  const own = faces.find((x) => x.family === 'Vazirmatn' && x.face === 'Regular');
  own.shapes.forEach((r) => {
    const top = S.rank(S.unpack(r[0]), [own], 50);
    assert.equal(top[0][1], 0, r[1]);
    assert.ok(top.filter((x) => x[1] === 0).some((x) => x[0] === r[1]), r[1]);
  });
});

test('shape: each family against the others — the letters a typeface Kelk does not know would show', function () {
  // a family left out is a typeface Kelk does not know: its glyphs ranked against the other families' shapes, within
  // their script. Floors under what the table gives (Arabic script ~95 % first, ~99 % in the first three; Latin ~81 %
  // and ~91 %: O and 0, l and I are one shape in a sans), so a change that makes them worse is seen
  [['arabic', /^(?:[ء-ی]|لا)$/, ARABIC, 0.9, 0.97], ['latin', /^[A-Za-z0-9]$/, LATIN, 0.75, 0.85]].forEach(function (c) {
    let n = 0, t1 = 0, t3 = 0;
    faces.forEach((f) => {
      const others = faces.filter((x) => x.family !== f.family);
      f.shapes.forEach((r) => {
        if (!c[1].test(r[1])) return;
        const got = S.rank(S.unpack(r[0]), others, 3, c[2]).map((x) => fold(x[0]));
        n++;
        if (got[0] === fold(r[1])) t1++;
        if (got.indexOf(fold(r[1])) >= 0) t3++;
      });
    });
    assert.ok(n > 500, c[0] + ': ' + n + ' glyphs');
    assert.ok(t1 / n >= c[3], c[0] + ' first: ' + (100 * t1 / n).toFixed(1) + ' %');
    assert.ok(t3 / n >= c[4], c[0] + ' first three: ' + (100 * t3 / n).toFixed(1) + ' %');
  });
});
