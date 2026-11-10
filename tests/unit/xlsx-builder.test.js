/**
 * XlsxBuilder (lib/XlsxBuilder.js): Markdown tables → sheets (names, cells, numbers), the .xlsx after the polish step
 * (styles, right-to-left view, frozen header, filter, print setup, links), the CSV files and the preview.
 * The vendored marked, SheetJS and JSZip are used as they are.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const V = (f) => path.join(__dirname, '..', '..', 'vendor', f);
const marked = require(V('marked.umd.min_18.0.14.js'));
const JSZip = require(V('jszip.min_3.10.2.js'));
const XLSX = require(V('xlsx.full.min_0.20.3.js'));
const XlsxBuilder = require('../../lib/XlsxBuilder.js');

const MD = [
  '# Report', '',
  '## فروش ۱۴۰۴', '',
  '| شهر | تعداد | کد | پیوند |', '|---|---|---|---|',
  '| مشهد | 1200 | 0012 | [سایت](https://example.com) |',
  '| تهران<br>مرکز | 3.5 | 12345678901234567 | **x** |', '',
  '**Staff:**', '',
  '| Name | Age |', '|-|-|', '| Ann | 31 |', '| Bob \\| Jr | 40 |', '',
  '```md', '| not | a table |', '|-|-|', '```'
].join('\n');

const build = (excel, more) => XlsxBuilder.create().configure(Object.assign({ excel: excel || {} }, more || {})).addFromMarkdown(MD, { marked });
const read = async (b) => {
  const blob = await b.toBlob({ XLSX, JSZip });
  const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));
  return { zip, wb: XLSX.read(Buffer.from(await blob.arrayBuffer()), { type: 'buffer' }), xml: (p) => zip.file(p).async('string') };
};

test('every table is a sheet, named by the heading or bold line above it; code blocks are not tables', function () {
  const s = build().sheets();
  assert.deepEqual(s.map((x) => x.name), ['فروش ۱۴۰۴', 'Staff']);
  assert.deepEqual(s.map((x) => [x.rows.length, x.cols]), [[2, 4], [2, 2]]);
  assert.equal(s[1].rows[1][0].v, 'Bob | Jr');               // an escaped bar
  assert.equal(s[0].rows[1][0].v, 'تهران\nمرکز');             // <br> → a line break
  assert.equal(s[0].rows[1][3].v, 'x');                      // marks dropped
  assert.equal(s[0].rows[0][3].link, 'https://example.com'); // a cell that is one link keeps its target
});

test('names: legal, unique without case, a fallback for a table without one', function () {
  const b = XlsxBuilder.create().addFromMarkdown('| a |\n|-|\n| 1 |\n\n## A/B: [x]\n\n| a |\n|-|\n| 1 |\n\n## a/b: [x]\n\n| a |\n|-|\n| 2 |', { marked });
  assert.deepEqual(b.sheets().map((x) => x.name), ['Table 1', 'A B x', 'a b x-2']);
  assert.equal(XlsxBuilder._cleanSheet('History', 'S'), 'S');
  assert.equal(XlsxBuilder._cleanSheet("'quoted'", 'S'), 'quoted');
  assert.equal(XlsxBuilder._cleanSheet('x'.repeat(40)).length, 31);
});

test('numbers: digits become numbers; leading zeros, more than 15 digits and a leading + stay text', function () {
  const c = XlsxBuilder._coerce;
  assert.equal(c('1200'), 1200);
  assert.equal(c('-3.5'), -3.5);
  assert.equal(c('0012'), '0012');
  assert.equal(c('0012', false), 12);
  assert.equal(c('12345678901234567'), '12345678901234567');
  assert.equal(c('+98'), '+98');
  assert.equal(c('۱۲'), '۱۲');
  assert.equal(XlsxBuilder._cellClass('۱۴۰۴/۰۸/۱۲'), 'num');
  assert.equal(XlsxBuilder._cellClass('مشهد 2'), 'fa');
  assert.equal(XlsxBuilder._cellClass('Ann'), 'en');
});

test('the workbook: values, a right-to-left Persian sheet, header style, frozen row, filter, print setup', async function () {
  const { wb, xml } = await read(build());
  assert.deepEqual(wb.SheetNames, ['فروش ۱۴۰۴', 'Staff']);
  const ws = wb.Sheets[wb.SheetNames[0]];
  assert.equal(ws.B2.v, 1200);
  assert.equal(ws.C2.v, '0012');
  assert.equal(ws.D2.l.Target, 'https://example.com');
  assert.equal(ws.E2.v, ' ');                                // the spacer column
  const s1 = await xml('xl/worksheets/sheet1.xml'), s2 = await xml('xl/worksheets/sheet2.xml');
  assert.match(s1, /<sheetView rightToLeft="1" tabSelected="1"/);
  assert.doesNotMatch(s2, /rightToLeft/);
  assert.match(s1, /state="frozen"/);
  assert.match(s1, /<autoFilter ref="A1:D3"/);
  assert.match(s1, /<conditionalFormatting sqref="A2:D3">/);
  assert.match(s1, /<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"\/>/);
  assert.match(s1, /<printOptions horizontalCentered="1"\/>/);
  const styles = await xml('xl/styles.xml');
  assert.match(styles, /<name val="B Nazanin"\/><family val="2"\/><charset val="178"\/>/);
  assert.match(styles, /<name val="Calibri"\/>/);
  assert.match(styles, /<fgColor rgb="FFE4E9EF"\/>/);       // Kelk's header fill
  const book = await xml('xl/workbook.xml');
  assert.match(book, /_xlnm\.Print_Titles/);
});

test('settings reach the file: fonts, no stripes, landscape, one sheet for every table', async function () {
  const b = build({ stripes: false, orientation: 'landscape', sheets: 'one', headerBorder: 'none' },
    { fonts: { bidi: 'Vazirmatn', latin: 'Arial' }, title: 'All' });
  const p = b.plans();
  assert.equal(p.length, 1);
  assert.deepEqual(p[0].roles.slice(0, 5), ['title', 'head', 'body', 'body', 'gap']);
  const { wb, xml } = await read(b);
  assert.deepEqual(wb.SheetNames, ['All']);
  const s1 = await xml('xl/worksheets/sheet1.xml');
  assert.doesNotMatch(s1, /conditionalFormatting/);
  assert.doesNotMatch(s1, /autoFilter|state="frozen"/);
  assert.match(s1, /orientation="landscape"/);
  const styles = await xml('xl/styles.xml');
  assert.match(styles, /Vazirmatn/);
  assert.doesNotMatch(styles, /B Nazanin|charset val="178"/);
});

test('CSV: one file per sheet, quoted where needed, BOM, ASCII digits in the names', function () {
  const f = build().toCsvFiles();
  assert.deepEqual(f.map((x) => x.name), ['فروش 1404.csv', 'Staff.csv']);
  assert.equal(f[0].text[0], '\uFEFF');
  assert.match(f[0].text, /"تهران\nمرکز",3.5,12345678901234567,x\r\n/);
  assert.match(f[1].text, /Bob \| Jr,40/);
  const semi = build({ csvSeparator: ';', csvBom: false }).toCsvFiles()[1].text;
  assert.equal(semi.split('\r\n')[0], 'Name;Age');
});

test('the preview: a block per sheet, the first rows, a note for the rest', function () {
  const b = XlsxBuilder.create().addFromMarkdown('| n |\n|-|\n' + Array.from({ length: 30 }, (_, i) => '| ' + i + ' |').join('\n'), { marked });
  const html = XlsxBuilder.previewHtml(b.plans(), { rows: 20, more: (n) => n + ' more' });
  assert.equal((html.match(/<section class="kx-sheet"/g) || []).length, 1);
  assert.equal((html.match(/<tr class="b/g) || []).length, 20);
  assert.match(html, /10 more/);
  assert.match(html, /<thead><tr><th class="kx-rn">1<\/th>/);
});

test('configure: an unknown key throws', function () {
  assert.throws(() => XlsxBuilder.create().configure({ nope: 1 }), /unknown option/);
  assert.throws(() => XlsxBuilder.create().configure({ excel: { nope: 1 } }), /unknown excel option/);
});
