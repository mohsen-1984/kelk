/**
 * SheetImporter (lib/SheetImporter.js): CSV (encoding, separator), XLSX (shown values, Kelk's spacer column) and
 * Markdown tables that read back as the same cells (XlsxBuilder.findTables). The vendored PapaParse, SheetJS,
 * marked and JSZip are used as they are.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const V = (f) => path.join(__dirname, '..', '..', 'vendor', f);
const Papa = require(V('papaparse.min_5.7.0.js'));
const XLSX = require(V('xlsx.full.min_0.20.3.js'));
const marked = require(V('marked.umd.min_18.0.14.js'));
const JSZip = require(V('jszip.min_3.10.2.js'));
const SheetImporter = require('../../lib/SheetImporter.js');
const XlsxBuilder = require('../../lib/XlsxBuilder.js');

const bytes = (s) => new TextEncoder().encode(s);

test('CSV: UTF-8 with a BOM, the separator guessed, quoted line breaks, empty rows around the data dropped', function () {
  const r = SheetImporter.readCsv(bytes('﻿نام;مبلغ\r\nعلی;"1\n2"\r\n;\r\n'), { Papa });
  assert.equal(r.encoding, 'utf-8');
  assert.equal(r.separator, ';');
  assert.deepEqual(r.rows, [['نام', 'مبلغ'], ['علی', '1\n2']]);
  assert.equal(r.error, null);
});

test('CSV: Persian Excel\'s «CSV (Comma delimited)» — Windows-1256, no BOM, CRLF; its Arabic ي becomes ی', function () {
  // نام,شهر,کد / پژمان گلچين,يزد,0012 / سپيده,کرمان,0045 — as Persian Windows writes them (ی saved as ي)
  const hex = 'e4c7e32cd4e5d12c98cf0d0a818ee3c7e42090e18dede42cedd2cf2c303031320d0ad381edcfe52c98d1e3c7e42c303034350d0a';
  const r = SheetImporter.readCsv(Buffer.from(hex, 'hex'), { Papa });
  assert.equal(r.encoding, 'windows-1256');
  assert.equal(r.separator, ',');
  assert.deepEqual(r.rows, [['نام', 'شهر', 'کد'], ['پژمان گلچین', 'یزد', '0012'], ['سپیده', 'کرمان', '0045']]);
  assert.deepEqual(SheetImporter.readCsv(Buffer.from(hex, 'hex'), { Papa, persianLetters: false }).rows[1][1], 'يزد');
});

test('CSV: a short Windows-1256 text that happens to be valid UTF-8 (سپ = D3 81) is still Windows-1256', function () {
  assert.equal(SheetImporter.sniffEncoding(new Uint8Array([0xD3, 0x81, 0x2C, 0x31])), 'windows-1256');
  assert.equal(SheetImporter.sniffEncoding(bytes('naïve,café')), 'utf-8');
  assert.equal(SheetImporter.sniffEncoding(bytes('Москва,1')), 'utf-8');
});

test('CSV: Windows-1256 when the bytes are not UTF-8; an empty file says so', function () {
  const r = SheetImporter.readCsv(new Uint8Array([0xE3, 0xD4, 0xE5, 0xCF, 0x2C, 0x31]), { Papa });
  assert.equal(r.encoding, 'windows-1256');
  assert.deepEqual(r.rows, [['مشهد', '1']]);
  assert.equal(SheetImporter.readCsv(bytes(' \n'), { Papa }).error, 'empty');
});

test('Markdown: a heading and a table per sheet; the cells read back as they were', function () {
  const rows = [['a|b', 'x_y', '$5', '*n*'], ['line\none', '<b>', '&amp;', ' padded '], ['\\path', 'file_name', '', '']];
  const md = SheetImporter.toMarkdown([{ name: 'One', rows }, { name: 'Empty', rows: [] }]);
  assert.match(md, /^## One\n\n\| a\\\|b \| x_y \| \\\$5 \| \\\*n\\\* \|\n\| --- \|/);
  assert.match(md, /line<br>one/);
  assert.match(md, /file_name/);                          // an underscore inside a word stays as it is
  assert.doesNotMatch(md, /Empty/);
  const t = XlsxBuilder.findTables(md, { marked })[0];
  assert.equal(t.name, 'One');
  assert.deepEqual([t.header.map((c) => c.v)].concat(t.rows.map((r) => r.map((c) => c.v))),
    rows.map((r) => r.map((v) => v.trim())));
});

test('XLSX: Kelk\'s own workbook reads back without its spacer column', async function () {
  const b = XlsxBuilder.create().addFromMarkdown('## S\n\n| a | b |\n|-|-|\n| 1 | 0012 |\n', { marked });
  const blob = await b.toBlob({ XLSX, JSZip });
  const book = SheetImporter.readXlsx(new Uint8Array(await blob.arrayBuffer()), { XLSX });
  assert.deepEqual(book, [{ name: 'S', rows: [['a', 'b'], ['1', '0012']], hidden: false }]);
});

test('XLSX: cells merged over rows repeat in each row (or not: mergedRows empty); across columns, written once', function () {
  const ws = XLSX.utils.aoa_to_sheet([['Group', 'Item', 'Note'], ['A', '1', 'wide'], ['', '2', ''], ['B', '3', '']]);
  ws['!merges'] = [{ s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }, { s: { r: 1, c: 2 }, e: { r: 1, c: 3 } }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'M');
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  assert.deepEqual(SheetImporter.readXlsx(bytes, { XLSX })[0].rows,
    [['Group', 'Item', 'Note'], ['A', '1', 'wide'], ['A', '2', ''], ['B', '3', '']]);
  assert.deepEqual(SheetImporter.readXlsx(bytes, { XLSX, mergedRows: 'empty' })[0].rows[2], ['', '2', '']);
});

test('size: rows under the header, columns, cells', function () {
  assert.deepEqual(SheetImporter.size([['a', 'b'], ['1'], ['2', '3']]), { rows: 2, cols: 2, cells: 6 });
});
