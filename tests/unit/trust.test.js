/**
 * Can the text be trusted (lib/pdfimport/trust.js): the judge — is a font's text language? — and the hidden-text
 * block. Pure: glyph runs made here, the lab's expected Markdown for the block's words.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const PdfImporter = require(path.join(root, 'lib', 'PdfImporter.js'));
['thresholds', 'letterstats', 'trust'].forEach(function (p) { require(path.join(root, 'lib', 'pdfimport', p + '.js')); });
const T = PdfImporter._trust;
const corpus = (name) => fs.readFileSync(path.join(root, 'tests', 'pdf-lab', 'corpus', name), 'utf8');

/** a text as one run of glyphs in one font (a space glyph between words) */
function run(text, font, page) {
  return Array.from(text).map(function (c) { return c === ' ' ? { ch: ' ', space: true, font: font, page: page || 1 } : { ch: c, font: font, page: page || 1 }; });
}
const FA = corpus('faces-fa.md').replace(/[#*>`]/g, ' ').replace(/\s+/g, ' ').trim();
const EN = corpus('renumbered-en.md').split('> [!WARNING]')[0].replace(/[#*>`]/g, ' ').replace(/\s+/g, ' ').trim();

test('judge: our own Persian and English read as language', function () {
  const j = T.judge([run(FA, 'f1'), run(EN, 'f2')]);
  assert.equal(j.f1.garbled, false, JSON.stringify(j.f1.ar));
  assert.equal(j.f2.garbled, false, JSON.stringify(j.f2.la));
  assert.ok(j.f1.ar.letters > 500 && j.f2.la.letters > 400);
  assert.ok(j.f1.ar.unseen < 0.02 && j.f2.la.unseen < 0.02);
});

test('judge: letters named wrong — pairs no language writes, words split into letters', function () {
  // every second letter named by another (a wrong ToUnicode), and by a space
  const other = 'جتسدفمزنهاو';
  let k = 0;
  const wrong = Array.from(FA).map(function (c) { return /[\u0621-\u06CC]/.test(c) && (k++ % 2) ? other[k % other.length] : c; }).join('');
  let n = 0;
  const split = Array.from(FA).map(function (c) { return /[\u0621-\u06CC]/.test(c) && (n++ % 3 === 0) ? ' ' : c; }).join('');
  const j = T.judge([run(wrong, 'a'), run(split, 'b')]);
  assert.ok(j.a.garbled && j.a.why.indexOf('pairs') >= 0, JSON.stringify(j.a));
  assert.ok(j.b.garbled && j.b.why.indexOf('letters') >= 0, JSON.stringify(j.b));
});

test('judge: codes read as Latin-1, and as ASCII signs', function () {
  // Persian drawn through codes 33… read as characters: Latin-1 signs inside every word
  const latin1 = Array.from(FA).map(function (c) { return c === ' ' ? ' ' : String.fromCharCode(0xA1 + (c.charCodeAt(0) % 90)); }).join('');
  const ascii = Array.from(EN).map(function (c) { return c === ' ' ? ' ' : String.fromCharCode(33 + (c.charCodeAt(0) % 40)); }).join('');
  const j = T.judge([run(latin1, 'a'), run(ascii, 'b')]);
  assert.ok(j.a.garbled && j.a.why.indexOf('latin1') >= 0, JSON.stringify(j.a));
  // signs alone are no verdict (a font of figures is odd too): odd, for the caller to hold against the font's program
  assert.equal(j.b.odd, true);
  assert.equal(j.b.garbled, false);
});

test('judge: too little text is not judged; code and math are not prose; a word goes to the font that draws most of it', function () {
  assert.equal(T.judge([run('\u062C\u062C\u062C \u062C\u062C\u062C \u062C\u062C\u062C', 'a')]).a.garbled, false);
  const code = run(FA, 'a').map(function (g) { return Object.assign({ mono: true }, g); });
  assert.deepEqual(T.judge([code]), {});
  const mixed = run(FA, 'a'); mixed[1].font = 'b';
  assert.deepEqual(Object.keys(T.judge([mixed])), ['a']);
  assert.deepEqual(T.judge([run(FA, 'a', 3).concat(run(' ' + FA, 'a', 4))]).a.pages, [3, 4]);
});

test('hidden text: the block is the one the lab expects, in the page\'s language', function () {
  const fa = T.hiddenMd('fa', [
    { page: 1, why: 'off', text: 'lab hidden line: this text is drawn above the page' },
    { page: 1, why: 'white', text: 'این جمله سفید روی سفید نوشته شده است.' },
    { page: 1, why: 'tiny', text: 'lab hidden line: this text is drawn at half a point' },
    { page: 1, why: 'invisible', text: 'این جمله با حالت نامریی نوشته شده است.' }]);
  assert.ok(corpus('hidden-fa.md').endsWith(fa), fa);
  const en = T.hiddenMd('en', [{ page: 1, why: 'off', text: 'id000000 lab print driver - unregistered copy' }]);
  assert.ok(corpus('renumbered-en.md').endsWith(en), en);
  assert.match(T.hiddenMd('ar', [{ page: 2, why: 'white', text: 'x' }]), /^> \[!WARNING\]\n> \*\*\u0646\u0635 \u0645\u062E\u0641\u064A \(hidden text\)\*\*[^\n]+\n\n\u0627\u0644\u0635\u0641\u062D\u0629 2 \u2014 \u0623\u0628\u064A\u0636 \u0639\u0644\u0649 \u0623\u0628\u064A\u0636:\n\n```text\nx\n```\n$/);
  assert.equal(T.hiddenMd('xx', [{ page: 1, why: 'off', text: 'x' }]), T.hiddenMd('en', [{ page: 1, why: 'off', text: 'x' }]));
});

test('hidden text: a piece holding backticks gets a longer fence', function () {
  const md = T.hiddenMd('en', [{ page: 1, why: 'off', text: 'a ``` b' }]);
  assert.ok(md.indexOf('\n````text\na ``` b\n````\n') > 0, md);
});
