/**
 * The structure diff of the golden files (tests/pdf-lab/scripts/structdiff.js): heading tree, table
 * shapes, list nesting — pure functions on Markdown.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { shape, align, structDiff, cell } = require('../pdf-lab/scripts/structdiff.js');

test('shape reads the heading levels, the table shapes and the list depths in order', function () {
  const md = [
    '# Title', '', 'Text.', '', '## One', '', '| a | b | c |', '|---|---|---|', '| 1 | 2 | 3 |', '| 4 | 5 | 6 |', '',
    '- top', '  - inner', '    1. deeper', '- top again', '', '### Two', '', '| x | y |', '|---|---|', '| 1 | 2 |', '',
    '> ## Quoted heading', '>', '> - quoted item'
  ].join('\n');
  const s = shape(md);
  assert.deepEqual(s.headings, [1, 2, 3, 2]);
  assert.deepEqual(s.tables, ['3x3', '2x2']);
  assert.deepEqual(s.lists, [0, 1, 2, 0, 0]);
});

test('shape of an empty or plain text is three empty sequences', function () {
  assert.deepEqual(shape(''), { headings: [], tables: [], lists: [] });
  assert.deepEqual(shape('Just a paragraph.\n\nAnd another.'), { headings: [], tables: [], lists: [] });
  assert.deepEqual(shape(undefined), { headings: [], tables: [], lists: [] });
});

test('align counts the fewest edits — missing, extra, changed', function () {
  assert.deepEqual(align([1, 2, 2], [1, 2, 2]), { same: 3, missing: 0, extra: 0, changed: 0 });
  assert.deepEqual(align([1, 2, 3, 2], [1, 2, 2]), { same: 3, missing: 1, extra: 0, changed: 0 });
  assert.deepEqual(align([1, 2], [1, 2, 2, 3]), { same: 2, missing: 0, extra: 2, changed: 0 });
  // a level shift is one changed, not a missing and an extra
  assert.deepEqual(align([1, 2, 2], [1, 3, 2]), { same: 2, missing: 0, extra: 0, changed: 1 });
  assert.deepEqual(align([], [1]), { same: 0, missing: 0, extra: 1, changed: 0 });
  assert.deepEqual(align([1], []), { same: 0, missing: 1, extra: 0, changed: 0 });
  assert.deepEqual(align([], []), { same: 0, missing: 0, extra: 0, changed: 0 });
  assert.deepEqual(align(['3x2', '2x2'], ['3x2', '4x2']), { same: 1, missing: 0, extra: 0, changed: 1 });
});

test('structDiff — the same document is 0 edits; each kind of loss counts in its part', function () {
  const golden = '# A\n\n## B\n\n| h | i |\n|---|---|\n| 1 | 2 |\n\n- x\n  - y\n- z\n\n## C\n';
  const same = structDiff(golden, golden);
  assert.equal(same.edits, 0);
  assert.deepEqual(same.headings, { want: 3, got: 3, missing: 0, extra: 0, changed: 0 });
  assert.deepEqual(same.tables, { want: 1, got: 1, missing: 0, extra: 0, changed: 0 });
  assert.deepEqual(same.lists, { want: 3, got: 3, missing: 0, extra: 0, changed: 0 });

  // the import: a heading one level down, the table lost a row, the nested item flattened, the last heading gone
  const got = '# A\n\n### B\n\n| h | i |\n|---|---|\n\n- x\n- y\n- z\n';
  const d = structDiff(golden, got);
  assert.deepEqual(d.headings, { want: 3, got: 2, missing: 1, extra: 0, changed: 1 });
  assert.deepEqual(d.tables, { want: 1, got: 1, missing: 0, extra: 0, changed: 1 });
  assert.deepEqual(d.lists, { want: 3, got: 3, missing: 0, extra: 0, changed: 1 });
  assert.equal(d.edits, 4);

  // a table cut in two: one changed and one extra; a list drawn as paragraphs: every item missing
  const cut = structDiff('| a |\n|---|\n| 1 |\n| 2 |\n\n- p\n- q\n', '| a |\n|---|\n| 1 |\n\nx\n\n| 2 |\n|---|\n\np\n\nq\n');
  assert.deepEqual(cut.tables, { want: 1, got: 2, missing: 0, extra: 1, changed: 1 });
  assert.deepEqual(cut.lists, { want: 2, got: 0, missing: 2, extra: 0, changed: 0 });
});

test('cell prints a part as want/got −missing +extra ~changed, «-» when neither side has any', function () {
  assert.equal(cell({ want: 0, got: 0, missing: 0, extra: 0, changed: 0 }), '-');
  assert.equal(cell(undefined), '-');
  assert.equal(cell({ want: 6, got: 6, missing: 0, extra: 0, changed: 0 }), '6/6');
  assert.equal(cell({ want: 12, got: 13, missing: 1, extra: 2, changed: 3 }), '12/13 −1 +2 ~3');
});
