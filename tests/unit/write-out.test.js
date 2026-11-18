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
