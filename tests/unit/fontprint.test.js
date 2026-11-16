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
  assert.deepEqual(F.names(bytes), { family: 'Vazirmatn', face: 'Regular' });
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

test('fontprints.js: the file is what its writer writes, and no fontprint names two characters', function () {
  const file = fs.readFileSync(path.join(root, 'lib', 'pdfimport', 'fontprints.js'), 'utf8');
  assert.equal(F.source(data.faces), file);
  assert.equal(data.v, F.V);
  const where = {};
  data.faces.forEach(function (f) {
    assert.ok(f.family && f.face && (f.src === 'kelk' || f.src === 'supplied'), JSON.stringify([f.family, f.face, f.src]));
    const t = F.unpack(f.prints);
    Object.keys(t).forEach(function (h) {
      const c = t[h][0].normalize('NFKC');
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
