/**
 * scripts/sheets.js (the Excel view): which pasted text is CSV or tab-separated — the paste event decides on it.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sheets = require('../../scripts/sheets.js');

test('a paste is CSV when 2+ records have the same separator count (quotes and their line breaks respected)', function () {
  assert.equal(sheets.looksLikeCsv('a,b\n1,2'), true);
  assert.equal(sheets.looksLikeCsv('a\tb\r\n1\t2\r\n3\t4\r\n'), true);                // Excel, Google Sheets: tabs
  assert.equal(sheets.looksLikeCsv('a;b;c\n1;"x;y";3'), true);
  assert.equal(sheets.looksLikeCsv('City,Code\nTehran,"two\nlines"\n'), true);
});

test('not CSV: one line, prose, a Markdown table, uneven records', function () {
  assert.equal(sheets.looksLikeCsv('one line, only'), false);
  assert.equal(sheets.looksLikeCsv('Hello, world.\nThis is text'), false);
  assert.equal(sheets.looksLikeCsv('| a | b |\n|-|-|\n| 1 | 2 |'), false);
  assert.equal(sheets.looksLikeCsv('x,y\n1,2,3'), false);
});
