/**
 * MarkdownImporter.writeOut (lib/MarkdownImporter.js): numbers and letters written out in every import and rich paste
 * (Word, HTML) as PDF import does — digits of any system as ASCII, ي ك ى as Persian in a Persian text; code untouched.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const MarkdownImporter = require('../../lib/MarkdownImporter.js');

test('writeOut: digits, separators in a number, Persian letters in a Persian text', function () {
  assert.equal(MarkdownImporter.writeOut('گزارش ۱۲٬۵۰۰ ريال، ۲۵٪ و ۳٫۵ در كتاب', {}), 'گزارش 12,500 ریال، 25% و 3.5 در کتاب');
  // (an Arabic text — no پ چ ژ گ — keeps its ي and ك; its digits become ASCII)
  assert.equal(MarkdownImporter.writeOut('مدينة ١٢ كتاب', {}), 'مدينة 12 كتاب');
});

test('writeOut: code is left as it is, fenced or inline', function () {
  const md = 'گ `كد ۱۲` ۱۲\n\n```\nيك ۱۲\n```\n\n~~~js\n۳\n~~~\nپايان ٤';
  assert.equal(MarkdownImporter.writeOut(md, {}), 'گ `كد ۱۲` 12\n\n```\nيك ۱۲\n```\n\n~~~js\n۳\n~~~\nپایان 4');
});

test('writeOut: each setting off on its own', function () {
  assert.equal(MarkdownImporter.writeOut('گ ۱۲ ي', { asciiNumbers: false }), 'گ ۱۲ ی');
  assert.equal(MarkdownImporter.writeOut('گ ۱۲ ي', { persianLetters: false }), 'گ 12 ي');
  assert.equal(MarkdownImporter.writeOut('گ ۱۲ ي', { asciiNumbers: false, persianLetters: false }), 'گ ۱۲ ي');
});

// ە ھ ى → ه ه ی in a Persian text (3.3, the owner's decision): a face's first character for a glyph a Persian heh or
// yeh shares with them (fontprints, shapes) must not reach the text; Arabic keeps its ى, Urdu and Kurdish their ە ھ
test('writeOut: ە ھ ى become ه ه ی in a Persian text only — Arabic keeps ى, Urdu and Kurdish keep ە ھ', function () {
  assert.equal(MarkdownImporter.writeOut('باشگاه محلە براى ھمە', {}), 'باشگاه محله برای همه');
  assert.equal(MarkdownImporter.writeOut('مستشفى المدينة الكبرى', {}), 'مستشفى المدينة الكبرى');
  assert.equal(MarkdownImporter.writeOut('پاکستان میں بھائی ہے اور گھر', {}), 'پاکستان میں بھائی ہے اور گھر');
  assert.equal(MarkdownImporter.writeOut('گوندەکە ڕێگای ھەیە', {}), 'گوندەکە ڕێگای ھەیە');
  assert.equal(MarkdownImporter.writeOut('باشگاه محلە', { persianLetters: false }), 'باشگاه محلە');
});

test('the same rule in PDF import (PdfImporter._writeOut) and in sheets (SheetImporter)', function () {
  const PdfImporter = require('../../lib/PdfImporter.js'), SheetImporter = require('../../lib/SheetImporter.js');
  const run = function (text, persian, urduKurdish) {
    const imp = PdfImporter.create({});
    imp._persianDoc = persian; imp._urduKurdish = urduKurdish;
    return imp._writeOut(Array.from(text).map(function (ch) { return { ch: ch }; })).map(function (g) { return g.ch; }).join('');
  };
  assert.equal(run('محلە براى ھمە', true, false), 'محله برای همه');           // a Persian page folds
  assert.equal(run('مستشفى الكبرى', false, false), 'مستشفى الكبرى');          // an Arabic page keeps ى
  assert.equal(run('بھائی گھر', true, true), 'بھائی گھر');                    // an Urdu page keeps ھ
  assert.deepEqual(SheetImporter.writeOut([['باشگاه', 'محلە'], ['براى', 'ھمە']], {}), [['باشگاه', 'محله'], ['برای', 'همه']]);
  assert.equal(SheetImporter.persianLetters('گوندەکە ڕێگای'), 'گوندەکە ڕێگای');
});
