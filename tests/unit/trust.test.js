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

test('hidden text: the block is the one the lab expects — one quote, the pieces code blocks in it', function () {
  const fa = T.hiddenMd('fa', [
    { page: 1, why: 'off', text: 'lab hidden line: this text is drawn above the page' },
    { page: 1, why: 'white', text: 'این جمله سفید روی سفید نوشته شده است.' },
    { page: 1, why: 'tiny', text: 'lab hidden line: this text is drawn at half a point' },
    { page: 1, why: 'invisible', text: 'این جمله با حالت نامریی نوشته شده است.' }]);
  assert.ok(corpus('hidden-fa.md').endsWith(fa), fa);
  const en = T.hiddenMd('en', [{ page: 1, why: 'off', text: 'id000000 lab print driver - unregistered copy' }]);
  assert.ok(corpus('renumbered-en.md').endsWith(en), en);
  assert.match(T.hiddenMd('ar', [{ page: 2, why: 'white', text: 'x' }]), /^> \[!WARNING\]\n> \*\*\u0646\u0635 \u0645\u062E\u0641\u064A \(hidden text\)\*\*[^\n]+\n>\n> \u0627\u0644\u0635\u0641\u062D\u0629 2 \u2014 \u0623\u0628\u064A\u0636 \u0639\u0644\u0649 \u0623\u0628\u064A\u0636:\n>\n> ```text\n> x\n> ```\n$/);
  assert.equal(T.hiddenMd('xx', [{ page: 1, why: 'off', text: 'x' }]), T.hiddenMd('en', [{ page: 1, why: 'off', text: 'x' }]));
});

test('hidden text: a piece holding backticks gets a longer fence', function () {
  const md = T.hiddenMd('en', [{ page: 1, why: 'off', text: 'a ``` b' }]);
  assert.ok(md.indexOf('\n> ````text\n> a ``` b\n> ````\n') > 0, md);
});

test('hidden text: every line of a piece stays behind the quote\'s mark and inside the fence', function () {
  const md = T.hiddenMd('en', [{ page: 1, why: 'off', text: 'first\n\n[a link](https://example.org) ![x](y)\n# not a heading' }]);
  assert.ok(md.split('\n').slice(0, -1).every(function (l) { return l === '>' || l.indexOf('> ') === 0; }), md);
  assert.ok(md.indexOf('> ```text\n> first\n>\n> [a link](https://example.org) ![x](y)\n> # not a heading\n> ```\n') > 0, md);
});

test('the note\'s language: the trusted text, then a Persian or Arabic /Lang, then the interface, then English', function () {
  const P = PdfImporter.prototype || Object.getPrototypeOf(PdfImporter.create({}));
  const page = function (text, font) { return { glyphs: run(text, font) }; };
  const lang = function (o, pages) { return P._noteLang.call(Object.assign({ options: {}, _lang: '', _garbled: null }, o), pages); };
  assert.equal(lang({}, [page(FA, 'a')]), 'fa');
  assert.equal(lang({ options: { uiLang: 'fa' } }, [page('The reading club met every week. '.repeat(8), 'a')]), 'en', 'the document, not the interface');
  // every font garbled: its letters say nothing
  const gibberish = [page('qzx wvk jjq xzq '.repeat(20), 'bad')], bad = { _garbled: { why: { bad: ['la.unseen'] } } };
  assert.equal(lang(Object.assign({ options: { uiLang: 'fa' } }, bad), gibberish), 'fa', 'the interface');
  assert.equal(lang(Object.assign({ _lang: 'ar-SA', options: { uiLang: 'fa' } }, bad), gibberish), 'ar', 'a declared Arabic');
  assert.equal(lang(Object.assign({ _lang: 'en-US', options: { uiLang: 'fa' } }, bad), gibberish), 'fa', 'a declared English is a default');
  assert.equal(lang(bad, gibberish), 'en');
  assert.equal(lang({}, [page('\u0633\u0644\u0627\u0645 \u0628\u0631 \u0634\u0645\u0627', 'a')]), 'ar', 'a few letters still tell when nothing else does');
});

// ---- the font arbiter -------------------------------------------------------------------------------------------
const P = PdfImporter.prototype;
/** an importer with one font read: glyph id = code, each glyph with an outline, the face naming them as `face` says */
function arbiter(face, read) {
  const hs = {}, text = {};
  Object.keys(face).forEach(function (g) { hs[g] = 'h' + g; if (face[g]) text[g] = Array.isArray(face[g]) ? face[g] : [face[g]]; });
  const imp = Object.create(P);
  imp._arb = { read: { f: read }, font: { f: { m: { family: 'Lab', face: 'Regular', text: text }, hs: hs, name: 'LabFont', gid: function (c) { return +c; } } }, mode: {} };
  imp._arbiter = {}; imp._fire = function () {};
  return imp;
}
const letters = 'ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی';

test('arbiter: a sound map keeps the file\'s names but for a glyph named as another kind of character', function () {
  const face = {}, read = {};
  Array.from(letters).forEach(function (c, i) { face[i + 1] = c; read[i + 1] = {}; read[i + 1][c] = 5; });
  face[40] = '('; read[40] = { '\u0645': 3 };                     // a bracket the file names as a letter
  face[41] = ','; read[41] = { '.': 2 };                     // a comma named as a stop
  face[42] = '7'; read[42] = { '3': 2 };                     // a digit the file names: stays
  face[43] = ['\u06CC', '\u064A']; read[43] = { '\u064A': 4 };            // one outline, two letters: the file's word stands
  face[44] = '\u06D5'; read[44] = { '\u0647': 4 };                    // a letter for a letter: stays
  const imp = arbiter(face, read);
  assert.equal(imp._arbiterDecide('f'), 'few');
  imp._arb.mode.f = 'few';
  const gl = [40, 41, 42, 43, 44, 1].map(function (c) { return { font: 'f', cid: c, ch: Object.keys(read[c])[0], w: 5 }; });
  imp._arbiterApply(gl, 1);
  assert.deepEqual(gl.map(function (g) { return g.ch; }), ['(', ',', '3', '\u064A', '\u0647', '\u0627']);
  assert.equal(imp._arbiter.f.changed, 2);
  assert.equal(imp._arbiter.f.all, false);
});

test('arbiter: a map that is not the font\'s gives way to the face on every glyph it knows; a blank glyph is a space', function () {
  const face = {}, read = {};
  Array.from(letters).forEach(function (c, i) { face[i + 1] = c; read[i + 1] = {}; read[i + 1][String.fromCharCode(0xC0 + i)] = 5; });
  const imp = arbiter(face, read);
  assert.equal(imp._arbiterDecide('f'), 'all');
  imp._arb.mode.f = 'all';
  delete imp._arb.font.f.hs[90];                              // glyph 90: no outline
  const gl = [{ font: 'f', cid: 2, ch: '\u00C1', w: 5, unmapped: true }, { font: 'f', cid: 90, ch: '\uFFFD', w: 3 }, { font: 'f', cid: 90, ch: '\uFFFD', w: 0 }, { font: 'f', cid: 3, ch: ' ', space: true, w: 4 }];
  imp._arbiterApply(gl, 1);
  assert.deepEqual(gl.map(function (g) { return g.ch; }), ['\u0628', ' ', '\u200C', '\u067E']);
  assert.deepEqual(gl.map(function (g) { return !!g.space; }), [false, true, false, false]);
  assert.equal(gl[0].unmapped, false);
});

test('arbiter: too few glyphs, or a face that knows too few of them, decide nothing', function () {
  const few = arbiter({ 1: '\u0627', 2: '\u0628', 3: '\u067E' }, { 1: { 'x': 1 }, 2: { 'y': 1 }, 3: { 'z': 1 } });
  assert.equal(few._arbiterDecide('f'), null);
  const face = {}, read = {};
  Array.from(letters).forEach(function (c, i) { face[i + 1] = i < 10 ? c : null; read[i + 1] = {}; read[i + 1][c] = 1; });
  assert.equal(arbiter(face, read)._arbiterDecide('f'), null, 'known by a third of its outlines: not this face');
});

test('arbiter: the same character — folded, of the shared outline, or the mirror bracket', function () {
  assert.ok(P._arbiterSame('\u064A', ['\u06CC']));
  assert.ok(P._arbiterSame('\uFEFB', ['\u0644\u0627']));
  assert.ok(P._arbiterSame('\u0664', ['4', '\u0664\u06F4']));
  assert.ok(P._arbiterSame('(', [')']));
  assert.ok(!P._arbiterSame('\u0645', ['(']));
  assert.ok(!P._arbiterFew(' ', '\u064D'), 'a blank where the face has a mark stays');
  assert.ok(P._arbiterFew(':', '\u0651'), 'a sign where the face has a mark is the mark');
  assert.ok(!P._arbiterFew('\u200C', '\u0645'));
  assert.ok(!P._arbiterFew('-', '\u2010') && !P._arbiterFew('\u2010', '-'), 'signs beyond ASCII stay');
});


test('judge: a font too small to judge alone, its letters mostly accented Latin, in a Persian document', function () {
  const j = T.judge([run(FA, 'body'), run('\u0152\u0153\u0154 \u0155\u0156\u0157 \u0158\u0159', 'title'), run('\u00DD\u00D9\u00DD\u00DA', 'year'), run('\u00C9ditions Gallimard', 'name')]);
  assert.equal(j.body.garbled, false);
  assert.deepEqual([j.title.garbled, j.title.why], [true, ['foreign']]);
  assert.deepEqual([j.year.garbled, j.year.why], [true, ['foreign']]);
  assert.equal(j.name.garbled, false, 'a French name: one accented letter among plain ones');
  const en = T.judge([run(EN, 'body'), run('\u0152\u0153\u0154 \u0155\u0156\u0157 \u0158\u0159', 'title')]);
  assert.equal(en.title.garbled, false, 'in a Latin document an accented word may be a language');
});

test('arbiter: a glyph that draws nothing, named by a control character, is a space', function () {
  const imp = Object.create(P);
  imp._arb = { read: {}, font: { f: { m: null, hs: { 5: 'h5' }, name: 'X', gid: function (c) { return +c; } } }, mode: {} };
  imp._arbiter = {}; imp._fire = function () {};
  const gl = [{ font: 'f', cid: 3, ch: '\u0003', w: 3 }, { font: 'f', cid: 5, ch: '\u0003', w: 3 }, { font: 'f', cid: 4, ch: '\u0003', w: 0 }, { font: 'g', cid: 3, ch: '\u0003', w: 3 }];
  imp._arbiterBlank(gl, 1);
  assert.deepEqual(gl.map(function (g) { return g.ch; }), [' ', '\u0003', '\u0003', '\u0003'], 'only a blank glyph with an advance, in a font whose program is read');
  assert.equal(gl[0].space, true);
});
