/**
 * The repair of fonts with no ToUnicode (lib/pdfimport/extract.js, _gsubRepair steps 0, 1 and 6a): which fonts read
 * as their own codes, which program a name finds, which of several programs fits the widths, and one glyph named.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PdfImporter = require('../../lib/PdfImporter.js');
require('../../lib/pdfimport/thresholds.js');
require('../../lib/pdfimport/calibration.js');
require('../../lib/pdfimport/extract.js');

const imp = PdfImporter.create();
imp._fire = function () {};
const font = { composite: true };
const glyph = (cid, ch, o) => Object.assign({ font: 'f', cid: cid, ch: ch === undefined ? String.fromCharCode(cid) : ch, w: 5, size: 10, gw: 500 }, o || {});
const page = (gs) => [{ glyphs: gs, fonts: { f: font } }];

test('step 0: a composite font whose every code reads as itself has no ToUnicode; one read otherwise has one', function () {
  const want = { f: { font: font } };
  assert.deepEqual(imp._gsubByCode(page([glyph(54), glyph(381), glyph(569), glyph(3, '‌')]), want), { f: true });
  assert.deepEqual(imp._gsubByCode(page([glyph(54), glyph(381), glyph(569), glyph(40, 'Q')]), want), {});
  assert.deepEqual(imp._gsubByCode(page([glyph(54), glyph(381)]), want), {}, 'two codes are no evidence');
  assert.deepEqual(imp._gsubByCode(page([glyph(54), glyph(381), glyph(569)]), { f: { font: { composite: false } } }), {}, 'a simple font is not read by glyph id');
});

test('step 1: a name with #20 in its descriptor finds its program; two decoded alike find none', function () {
  const files = { 'Vazir#20Code#20Hack': ['a'], Vazirmatn: ['b'] };
  assert.deepEqual(imp._gsubNamed(files, 'Vazirmatn'), ['b']);
  assert.deepEqual(imp._gsubNamed(files, 'VazirCodeHack'), ['a']);
  assert.deepEqual(imp._gsubNamed({ 'A#20B': ['a'], 'A#20#20B': ['b'] }, 'AB'), []);
  assert.deepEqual(imp._gsubNamed(files, 'Other'), []);
});

test('step 1: of several programs, the one whose advances are the widths; two that name the glyphs otherwise are no choice', function () {
  const prog = (adv, g2u) => ({ adv: (g) => (g in adv ? adv[g] : null), g2u: g2u });
  const gs = page([glyph(10, undefined, { gw: 500 }), glyph(11, undefined, { gw: 250 })]);
  const thin = prog({ 10: 0.45, 11: 0.2 }, { 10: 'a', 11: 'b' }), right = prog({ 10: 0.5, 11: 0.25 }, { 10: 'a', 11: 'b' });
  assert.equal(imp._gsubByWidth(gs, 'f', [thin, right]), right);
  assert.equal(imp._gsubByWidth(gs, 'f', [thin]), null);
  const twin = prog({ 10: 0.5, 11: 0.25 }, { 10: 'a', 11: 'b' }), other = prog({ 10: 0.5, 11: 0.25 }, { 10: 'x', 11: 'b' });
  assert.equal(imp._gsubByWidth(gs, 'f', [right, twin]), right, 'alike: either');
  assert.equal(imp._gsubByWidth(gs, 'f', [right, other]), null);
  assert.equal(imp._gsubByWidth(gs, 'f', [prog({ 10: 0.5, 11: 0.25 }, { 10: 'a' })]), null, 'a code the program does not name');
});

test('step 6a: a glyph named by its ligature, its form\'s base glyph, its cmap; the cmap\'s space is a space when it has room', function () {
  const m = { 7: 'fi' };
  Object.defineProperty(m, 'g2u', { value: { 3: ' ', 20: 'ب', 54: 'S' } });
  Object.defineProperty(m, 'base', { value: { 300: 20 } });
  const c = { space: 0.1, p: null };
  const run = (g) => [imp._gsubByCodeGlyph(g, m, c), g.ch, !!g.space];
  assert.deepEqual(run(glyph(7)), [true, 'fi', false]);
  assert.deepEqual(run(glyph(300, undefined, { guess: true })), [true, 'ب', false]);
  assert.deepEqual(run(glyph(54)), [true, 'S', false]);
  assert.deepEqual(run(glyph(3, '\u0003', { w: 3 })), [true, ' ', true]);
  assert.deepEqual(run(glyph(3, '\u0003', { w: 0 })), [false, '\u0003', false], 'a space of no room stays');
  assert.deepEqual(run(glyph(3, '‌')), [false, '‌', false], 'the walk\'s ZWNJ stays');
  assert.deepEqual(run(glyph(99)), [false, 'c', false], 'a glyph the program does not name stays');
});

// (review of rv33's cid-unicode.pdf — CIDs are the Unicode values, a CIDToGIDMap stream, no ToUnicode — plain and packed)
function rawFile(dict, packed, table) {
  const x = PdfImporter.create();
  x._fire = function () {};
  const obj = '5 0 obj\n' + dict + '\nendobj\n', str = packed ? '1 0 obj\n<< /Type /ObjStm /N 1 /First 4 >>\nstream\n...\nendstream\nendobj\n' : obj;
  const R = { str: str, idx: packed ? { '1 0': 7 } : { '5 0': 7 } };
  x._rawIdx = function () { return R; };
  x._rawObjStms = async function () { return packed ? { '5 0': dict } : {}; };
  x._rawStream = async function (ref) { return ref === '7 0' ? table : null; };
  return x;
}
test('a composite font\'s codes are glyph ids by its own CIDToGIDMap, plain or in an object stream', async function () {
  const W = '/W [' + Array.from({ length: 224 }, function (_, i) { return (32 + i) + ' [556]'; }).join(' ') + ']';   // (past 1200 characters)
  const uni = new Uint8Array(512); [81, 117, 32].forEach(function (u) { uni[2 * u + 1] = u === 32 ? 3 : u - 29; });      // CID = Unicode → glyph
  const ident = new Uint8Array(512); for (let c = 0; c < 256; c++) ident[2 * c + 1] = c;
  const fonts = { f: { composite: true, name: 'ArialMT' } }, gs = [{ glyphs: [glyph(81, 'Q'), glyph(117, 'u'), glyph(32, ' ')], fonts: fonts }];
  const dict = (map) => '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /ArialMT /DW 1000 ' + W + map + ' >>';
  for (const packed of [false, true]) {
    assert.deepEqual(await rawFile(dict(' /CIDToGIDMap 7 0 R'), packed, uni)._cidGlyphIds(gs, fonts), { f: false }, packed ? 'packed' : 'plain');
    assert.deepEqual(await rawFile(dict(' /CIDToGIDMap 7 0 R'), packed, ident)._cidGlyphIds(gs, fonts), { f: true }, 'a stream that maps each code to itself');
    assert.deepEqual(await rawFile(dict(' /CIDToGIDMap /Identity'), packed, null)._cidGlyphIds(gs, fonts), { f: true });
    assert.deepEqual(await rawFile(dict(''), packed, null)._cidGlyphIds(gs, fonts), { f: true }, 'no map: Identity');
  }
  // (the guard of step 0: a font whose codes are no glyph ids is not read by its codes)
  assert.deepEqual(imp._gsubByCode(page([glyph(54), glyph(381), glyph(569)]), { f: { font: font } }, { f: false }), {});
});
