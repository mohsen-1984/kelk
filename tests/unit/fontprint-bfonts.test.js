/**
 * Fontprints against the lab's files in the B fonts ((c) Borna Rayaneh, lib/pdf-base64-ttf-fonts/borna-rayaneh/NOTICE.txt):
 * the subset a file embeds is found again in the table, whatever the file's ToUnicode or codes say, and the character
 * the table gives each glyph is the one the font's own cmap gives it.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.join(__dirname, '..', '..');
const PdfImporter = require(path.join(root, 'lib', 'PdfImporter.js'));
require(path.join(root, 'lib', 'pdfimport', 'fontprint.js'));
const F = PdfImporter._fontprint;
const data = require(path.join(root, 'lib', 'pdfimport', 'fontprints.js'));

/** the TrueType programs a lab file of ours embeds (rtl_pdf2.py's plain objects): { BaseFont: bytes } */
function embedded(name) {
  const pdf = fs.readFileSync(path.join(root, 'tests', 'pdf-lab', 'pdf', 'producers', name)), s = pdf.toString('latin1'), out = {};
  const re = /\/FontName \/([^ ]+) [^>]*\/FontFile2 (\d+) 0 R/g;
  let m;
  while ((m = re.exec(s))) {
    const at = s.indexOf('\n' + m[2] + ' 0 obj\n'), len = +/\/Length (\d+)/.exec(s.slice(at, at + 200))[1], st = s.indexOf('stream\n', at) + 7;
    out[m[1]] = new Uint8Array(zlib.inflateSync(pdf.subarray(st, st + len)));
  }
  return out;
}
const nfkc = (t) => t.normalize('NFKC');

test('fontprints: a Word file whose ToUnicode is wrong — its B Mitra subsets are known glyph for glyph', function () {
  const fonts = embedded('word-bfonts--tounicode-fa.pdf');
  [['BCDFEE+BMitraBold', 'B Mitra', 'Bold'], ['BCDGEE+BMitra', 'B Mitra', 'Regular'], ['BCDEEE+BTitrBold', 'B Titr', 'Bold']].forEach(function (c) {
    const bytes = fonts[c[0]], hs = F.hashes(bytes), m = F.match(hs, data, c[0]);
    assert.equal(m.family + ' ' + m.face, c[1] + ' ' + c[2]);
    assert.ok(m.known >= m.of - 1, c[0] + ': ' + m.known + ' of ' + m.of);        // (all but .notdef's box)
    // … and each glyph's character is the one the subset's own cmap gives it
    const own = PdfImporter._internal.sfntLigatures(bytes).g2u;
    let checked = 0;
    // (or one of the others that name the same glyph: ك and ک are one outline here)
    Object.keys(m.text).forEach(function (g) {
      if (!own[g]) return;
      checked++;
      assert.ok(nfkc(m.text[g][0]) === nfkc(own[g]) || m.text[g][1].indexOf(nfkc(own[g])) >= 0, 'glyph ' + g + ': «' + m.text[g].join('» «') + '» against «' + own[g] + '»');
    });
    assert.ok(checked > 20, c[0] + ': ' + checked + ' glyphs checked');
  });
});

test('fontprints: a print driver\'s renumbered fonts — nothing names their letters, the outlines do', function () {
  const fonts = embedded('driver-print--renumbered-fa.pdf');
  [['AAAAAA+BTitrBold,Bold', 'B Titr', 'Bold'], ['AAAAAB+BNazaninBold,Bold', 'B Nazanin', 'Bold']].forEach(function (c) {
    const bytes = fonts[c[0]], m = F.match(F.hashes(bytes), data, c[0]);
    assert.equal(m.family + ' ' + m.face, c[1] + ' ' + c[2]);
    assert.ok(m.known >= m.of - 1, c[0] + ': ' + m.known + ' of ' + m.of);
    assert.deepEqual(PdfImporter._internal.sfntLigatures(bytes).g2u, {});          // the program names no character
    const letters = Object.keys(m.text).map((g) => nfkc(m.text[g][0])).join('');
    ['ب', 'ک', 'ا', 'ی'].forEach((ch) => assert.ok(letters.indexOf(ch) >= 0, c[0] + ' lacks ' + ch));
  });
});

test('fontprints: the six B faces are in the table', function () {
  ['B Mitra|Regular', 'B Mitra|Bold', 'B Nazanin|Regular', 'B Nazanin|Bold', 'B Nazanin Outline|Regular', 'B Titr|Bold'].forEach(function (k) {
    const f = data.faces.find((x) => x.family + '|' + x.face === k);
    assert.ok(f && f.src === 'kelk' && f.prints.split(' ').length > 150, k);
  });
});
