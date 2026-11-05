/**
 * Merged cells in Markdown (lib/pdfimport/regions.js _tableMerges; Settings → Import → Cells merged over rows):
 * a cell merged over rows is repeated in each of its rows ('repeat', the default) or left to its first row
 * ('empty'); a cell merged over columns is written once either way. The HTML / Word path is tested in
 * markdown-importer.test.js.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PdfImporter = require('../../lib/PdfImporter.js');
require('../../lib/pdfimport/thresholds.js');
require('../../lib/pdfimport/regions.js');

const line = (t) => ({ page: 1, text: t, glyphs: [] });
const texts = (grid) => grid.map((row) => row.map((c) => c.map((L) => L.text).join(' ')));

/** A 4 × 3 table, x order (LTR): a header row; «x» merged over rows 1–2 in column 0; «pq» over rows 2–3 and columns 1–2. */
function table() {
  const grid = [
    [[line('A')], [line('B')], [line('C')]],
    [[line('x')], [line('b1')], [line('c1')]],
    [[], [line('pq')], []],
    [[line('a3')], [], []]
  ];
  const regions = [
    { r0: 1, r1: 2, c0: 0, c1: 0 },
    { r0: 2, r1: 3, c0: 1, c1: 2 }
  ];
  const cellRegion = (r, c) => regions.find((g) => r >= g.r0 && r <= g.r1 && c >= g.c0 && c <= g.c1) || { r0: r, r1: r, c0: c, c1: c };
  return { grid, cellRegion };
}

function run(mergedRows) {
  const imp = PdfImporter.create(mergedRows ? { mergedRows } : {});
  imp._fire = function () {};
  const { grid, cellRegion } = table();
  imp._tableMerges(grid, 4, 3, false, cellRegion);
  return texts(grid);
}

test('repeat (the default): a cell merged over rows is in each of its rows; over columns, written once', function () {
  assert.deepEqual(run(), [
    ['A', 'B', 'C'],
    ['x', 'b1', 'c1'],
    ['x', 'pq', ''],
    ['a3', 'pq', '']
  ]);
  assert.deepEqual(run('repeat'), run());
});

test('empty: a cell merged over rows stays in its first row only; over columns, written once', function () {
  assert.deepEqual(run('empty'), [
    ['A', 'B', 'C'],
    ['x', 'b1', 'c1'],
    ['', 'pq', ''],
    ['a3', '', '']
  ]);
});
