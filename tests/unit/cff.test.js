/**
 * CFF programs (lib/pdfimport/cff.js): the outlines of a bare CFF font program, read from the lab's own CFF files
 * (tests/pdf-lab/scripts/make-cff33.py). Pure: the programs are taken out of the PDFs with zlib.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.join(__dirname, '..', '..');
const PdfImporter = require(path.join(root, 'lib', 'PdfImporter.js'));
require(path.join(root, 'lib', 'pdfimport', 'cff.js'));
require(path.join(root, 'lib', 'pdfimport', 'fontprint.js'));
const C = PdfImporter._cff;

/** a lab PDF's FontFile3 programs, in file order: [{ subtype, bytes }] (its streams are Flate, as the generator writes) */
function programs(name) {
  const s = fs.readFileSync(path.join(root, 'tests', 'pdf-lab', 'pdf', 'producers', name + '.pdf'), 'latin1');
  const re = /<< \/Length (\d+) \/Filter \/FlateDecode \/Subtype \/(Type1C|CIDFontType0C) >>\nstream\n/g, out = [];
  let m;
  while ((m = re.exec(s))) {
    const at = m.index + m[0].length;
    out.push({ subtype: m[2], bytes: new Uint8Array(zlib.inflateSync(Buffer.from(s.slice(at, at + +m[1]), 'latin1'))) });
  }
  return out;
}
// the keys with an outline, .notdef (key 0) left out
const drawn = function (F) { const k = []; for (let i = 1; i < F.n; i++) if (F.contours(i).length) k.push(i); return k; };

test('cff: a CID-keyed program is read by CID — the charset, not Identity, maps a CID to its glyph', function () {
  const p = programs('distiller-cff--cff-cid-fa').find((x) => x.subtype === 'CIDFontType0C');
  assert.ok(C.is(p.bytes));
  const F = C.font(p.bytes), keys = drawn(F);
  assert.equal(F.cid, true);
  assert.equal(F.upm, 1000);
  assert.ok(keys.length > 10 && keys.every((k) => k > 100), 'the keys are the source font\'s glyph ids, not 1, 2, 3 …');
  assert.ok(keys.every((k) => F.adv(k) > 0));
});

test('cff: a plain program — 2048 units an em, nested local and global subroutines, the built-in encoding', function () {
  const F = C.font(programs('distiller-cff--cff-type1c-fa')[1].bytes), keys = drawn(F);
  assert.equal(F.cid, false);
  assert.equal(F.upm, 2048);
  assert.equal(keys.length, F.n - 2, 'every glyph but .notdef and the space has an outline drawn through its subroutines');
  assert.equal(F.c2g[33], 1, 'the renumbered codes from 33 reach their glyphs');
  // a glyph of two contours: the first from a local subroutine, the second from the global one it calls
  assert.ok(keys.some((k) => F.contours(k).length >= 2));
});

test('cff: standard glyph names name their characters (g2u); the curves are cut into lines for the shapes', function () {
  const p = programs('distiller-cff--cff-cid-fa').find((x) => x.subtype === 'Type1C');
  const F = C.font(p.bytes), m = PdfImporter._internal.sfntLigatures(p.bytes);
  assert.ok(Object.values(F.g2u).includes('0') && Object.values(F.g2u).includes('/'));
  assert.ok(Object.keys(m.dig).length >= 5, 'the digits are known as digits');
  const k = drawn(F)[0];
  assert.ok(F.polygons(k)[0].every((pt) => pt[2] === 1), 'polygons: on-curve points only');
  assert.ok(F.polygons(k)[0].length >= F.contours(k)[0].filter((pt) => pt[2]).length);
});

test('cff: fontprint.js reads a CFF program\'s outlines through cff.js; a TrueType program is not taken for one', function () {
  const p = programs('prince-cff--cff-zwnj-fa')[0];
  const o = PdfImporter._fontprint.outlines(p.bytes);
  assert.equal(o.cff, true);
  assert.ok(Object.keys(PdfImporter._fontprint.hashes(p.bytes)).length > 20);
  assert.ok(Object.keys(PdfImporter._fontprint.roughs(p.bytes)).length > 20);
  const tt = new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(C.is(tt), false);
  assert.equal(C.font(tt), null);
});
