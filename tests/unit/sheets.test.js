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

test('a rich paste\'s tables without a heading get «## Table N», numbered after the text\'s own tables', function () {
  global.marked = require('../../vendor/marked.umd.min_18.0.14.js');
  global.XlsxBuilder = require('../../lib/XlsxBuilder.js');
  const kelk = { editor: { value: () => '## Old\n\n| a |\n|-|\n| 1 |\n' }, i18n: { t: (k) => ({ xs_table: 'Table' })[k] || k } };
  global.Kelk = kelk;                      // scripts/sheets.js reads Kelk from the global object (no window in Node)
  const sh = require('../../scripts/sheets.js');
  const out = sh.headTables('| x | y |\n| --- | --- |\n| 1 | 2 |\n\nText\n\n**Named:**\n\n| p |\n|-|\n| q |\n\n| r |\n|:-:|\n| s |\n');
  assert.equal(out, '## Table 2\n\n| x | y |\n| --- | --- |\n| 1 | 2 |\n\nText\n\n**Named:**\n\n| p |\n|-|\n| q |\n\n## Table 4\n\n| r |\n|:-:|\n| s |\n');
});
