/**
 * Fontprints (lib/pdfimport/fontprint.js): a glyph known by the hash of its outline, and the table of them per face
 * (lib/pdfimport/fontprints.js). Pure: the fonts are read from the repository's font zip.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const PdfImporter = require(path.join(root, 'lib', 'PdfImporter.js'));
require(path.join(root, 'lib', 'pdfimport', 'fontprint.js'));
const F = PdfImporter._fontprint;
const data = require(path.join(root, 'lib', 'pdfimport', 'fontprints.js'));
const JSZip = require(path.join(root, 'vendor', fs.readdirSync(path.join(root, 'vendor')).find((f) => /^jszip\.min_.*\.js$/.test(f))));

let zip = null;
async function font(name) {
  zip = zip || await JSZip.loadAsync(fs.readFileSync(path.join(root, 'assets', 'fonts', 'download', 'persian-fonts-ttf.zip')));
  return zip.files[name].async('uint8array');
}

test('fontprint: a face of the font zip — its names, its fontprints, the characters its cmap and GSUB give', async function () {
  const bytes = await font('vazirmatn/Vazirmatn-Regular.ttf');
  const nm = F.names(bytes);
  assert.deepEqual([nm.family, nm.face], ['Vazirmatn', 'Regular']);
  assert.ok(/^Version /.test(nm.version), nm.version);
  const hs = F.hashes(bytes), f = F.face(bytes);
  assert.ok(Object.keys(hs).length > 1000);
  assert.ok(Object.keys(hs).every((g) => /^[A-Za-z0-9_-]{8}$/.test(hs[g])));
  assert.equal(f.glyphs, Object.keys(hs).length);
  const texts = f.prints.map((p) => p[1]);
  ['ب', 'پ', 'گ', 'A', '(', '5'].forEach((c) => assert.ok(texts.indexOf(c) >= 0, c));
  // the joining forms of beh — glyphs the cmap does not name, reached through the GSUB — carry the letter too
  assert.ok(texts.filter((c) => c.normalize('NFKC') === 'ب').length >= 3);
  assert.equal(new Set(f.prints.map((p) => p[0])).size, f.prints.length);
});

test('fontprint: the same bytes give the same fontprints; another weight gives others', async function () {
  const a = F.hashes(await font('vazirmatn/Vazirmatn-Regular.ttf')), b = F.hashes(await font('vazirmatn/Vazirmatn-Regular.ttf'));
  const c = F.hashes(await font('vazirmatn/Vazirmatn-Bold.ttf'));
  assert.deepEqual(a, b);
  const shared = Object.keys(a).filter((g) => a[g] === c[g]).length;
  assert.ok(shared < Object.keys(a).length / 10, shared + ' glyphs with one fontprint in two weights');
});

test('fontprint: pack and unpack, with and without the others', function () {
  const prints = [['AAAAAAAA', 'ب', ''], ['BBBBBBBB', 'ی', 'يى'], ['CCCCCCCC', 'لا', ''], ['DDDDDDDD', '4', '٤۴']];
  const s = F.pack(prints);
  assert.equal(s, 'AAAAAAAAب BBBBBBBBی\tيى CCCCCCCCلا DDDDDDDD4\t٤۴');
  assert.deepEqual(F.unpack(s), { AAAAAAAA: ['ب', ''], BBBBBBBB: ['ی', 'يى'], CCCCCCCC: ['لا', ''], DDDDDDDD: ['4', '٤۴'] });
  assert.deepEqual(F.unpack(''), {});
});

test('fontprint: match — the face that knows most of a font\'s glyphs, and what it says of each', function () {
  const d = { faces: [{ family: 'One', face: 'Regular', prints: 'AAAAAAAAب' }, { family: 'Two', face: 'Bold', prints: 'AAAAAAAAب BBBBBBBBی\tي' }] };
  const m = F.match({ 3: 'AAAAAAAA', 7: 'BBBBBBBB', 9: 'ZZZZZZZZ' }, d);
  assert.equal(m.family + ' ' + m.face, 'Two Bold');
  assert.equal(m.known, 2);
  assert.equal(m.of, 3);
  assert.deepEqual(m.text, { 3: ['ب', ''], 7: ['ی', 'ي'] });
  assert.equal(F.match({ 1: 'ZZZZZZZZ' }, d), null);
  // a tie: the first face, unless the file's font name holds the other's family
  const tie = { faces: [{ family: '2 Mitra', face: 'Bold', prints: 'AAAAAAAAب' }, { family: 'B Mitra', face: 'Bold', prints: 'AAAAAAAAب' }] };
  assert.equal(F.match({ 3: 'AAAAAAAA' }, tie).family, '2 Mitra');
  assert.equal(F.match({ 3: 'AAAAAAAA' }, tie, 'BCDFEE+BMitraBold').family, 'B Mitra');
});

test('fontprint: rough prints — a record with no character makes the glyph unknown; one character is known', function () {
  assert.equal(F.pack([['AAAAAAAA', '', '']]), 'AAAAAAAA\t');
  assert.deepEqual(F.unpack('AAAAAAAA\t'), { AAAAAAAA: ['', ''] });
  const d = { faces: [{ family: 'One', face: 'Regular', prints: 'XXXXXXXXا', rough: 'AAAAAAAAب BBBBBBBB\t CCCCCCCCپ' }] };
  // a glyph's probed prints: one character found (ب); one that finds a print of two characters (unknown); two characters (unknown)
  const m = F.matchRough({ 3: ['AAAAAAAA', 'ZZZZZZZZ'], 4: ['BBBBBBBB', 'AAAAAAAA'], 5: ['AAAAAAAA', 'CCCCCCCC'] }, d);
  assert.equal(m.rough, true);
  assert.equal(m.known, 1);
  assert.deepEqual(m.text, { 3: ['ب', ''] });
});

test('fontprint: a font whose outlines wkhtmltopdf rebuilt (Qt) is found by its rough prints, not its fontprints', async function () {
  // the lab's wkhtmltopdf file: its Vazirmatn subset, every curve written again
  const pdf = fs.readFileSync(path.join(root, 'tests', 'pdf-lab', 'pdf', 'rtl', 'wk-rtl--fa-article.pdf')).toString('latin1');
  const desc = /\/FontName\s*\/[A-Z]{6}\+Vazirmatn-Regular[^>]*?\/FontFile2\s+(\d+)\s+0\s+R/.exec(pdf);
  assert.ok(desc);
  const obj = new RegExp('\\n' + desc[1] + ' 0 obj\\s*<<[\\s\\S]*?>>\\s*stream\\r?\\n').exec(pdf);
  const start = obj.index + obj[0].length, end = pdf.indexOf('endstream', start);
  const bytes = new Uint8Array(require('zlib').inflateSync(Buffer.from(pdf.slice(start, end), 'latin1'), { finishFlush: require('zlib').constants.Z_SYNC_FLUSH }));
  const hs = F.hashes(bytes), exact = F.match(hs, data, 'Vazirmatn-Regular');
  assert.ok(!exact || exact.known < 0.2 * Object.keys(hs).length, exact && exact.known + ' of ' + Object.keys(hs).length);
  const rough = F.matchRough(F.roughs(bytes, true), data, 'Vazirmatn-Regular');
  assert.equal(rough.family + ' ' + rough.face, 'Vazirmatn Regular');
  assert.ok(rough.known >= 0.9 * Object.keys(hs).length, rough.known + ' of ' + Object.keys(hs).length);
});

test('fontprints.js: the file is what its writer writes, and no fontprint names two characters', function () {
  const file = fs.readFileSync(path.join(root, 'lib', 'pdfimport', 'fontprints.js'), 'utf8');
  assert.equal(F.source(F.expand(data)), file);
  assert.equal(data.v, F.V);
  const where = {}, digit = (c) => c.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x6F0));
  data.faces.forEach(function (f) {
    assert.ok(f.family && f.face && (f.src === 'kelk' || f.src === 'supplied'), JSON.stringify([f.family, f.face, f.src]));
    if (f.base) assert.ok(data.faces.some((b) => b.family + '|' + b.face === f.base && !b.base), f.family + ': its base is in the file, and not based itself');
    const t = F.table(f, data.faces);
    Object.keys(t).forEach(function (h) {
      // (digits of one value are one character: one outline draws ۴ ٤ 4)
      const c = digit(t[h][0].normalize('NFKC'));
      assert.ok(!where[h] || where[h] === c, h + ' names «' + where[h] + '» and «' + c + '»');
      where[h] = c;
    });
  });
});

test('fontprints.js: the repository\'s OFL faces are in it, as the fonts give them', async function () {
  for (const name of ['vazirmatn/Vazirmatn-Bold.ttf', 'sahel/Sahel.ttf']) {
    const f = F.face(await font(name));
    const kept = data.faces.find((x) => x.family === f.family && x.face === f.face);
    assert.ok(kept, name);
    assert.equal(kept.src, 'kelk');
    assert.equal(kept.prints, F.pack(f.prints));
  }
});

test('fontprints: a face that shares most outlines with another is written over it, and read back whole', function () {
  const ten = 'AAAAAAAAب BBBBBBBBپ CCCCCCCCت DDDDDDDDث FFFFFFFFح GGGGGGGGخ HHHHHHHHد IIIIIIIIذ JJJJJJJJر KKKKKKKKز';
  const a = { family: 'B Lab', face: 'Bold', src: 'kelk', glyphs: 10, prints: ten };
  const b = { family: '2 Lab', face: 'Bold', src: 'supplied', glyphs: 11, prints: ten + ' EEEEEEEEج' };
  const c = { family: 'Other', face: 'Bold', src: 'supplied', glyphs: 2, prints: 'AAAAAAAAب ZZZZZZZZچ' };
  const text = F.source([b, c, a]);
  const d = new Function('module', text + '; return module.exports;')({ exports: {} });
  // («2 Lab» comes first in the file's order: the base; «B Lab» is written over it and can leave the file alone)
  const two = d.faces.find((f) => f.family === '2 Lab'), bl = d.faces.find((f) => f.family === 'B Lab');
  assert.ok(!two.base);
  assert.equal(bl.base, '2 Lab|Bold');
  assert.equal(bl.prints, '');
  assert.ok(!d.faces.find((f) => f.family === 'Other').base, 'half its outlines shared: written whole');
  assert.equal(Object.keys(F.table(bl, d.faces)).length, 11, 'the base\'s records: a face may be read with a few more than it has');
  assert.equal(F.expand(d).find((f) => f.family === 'B Lab').prints.split(' ').length, 11);
  assert.equal(F.source(F.expand(d)), text, 'read back whole and written again: the same file');
  assert.equal(F.match({ 1: 'EEEEEEEE', 2: 'AAAAAAAA' }, d, 'ABCDEF+BLab-Bold').family, 'B Lab', 'a tie: the file\'s font name');
});
