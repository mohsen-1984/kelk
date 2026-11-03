/**
 * The golden part of the gate (tests/pdf-lab/scripts/gate-golden.js): file by file against the compared
 * side — a crash or a drop over 0.5 point fails, a golden file missing from an unfiltered run fails, missing from a
 * filtered run or new is a note.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { compareGolden, TOL_GOLDEN } = require('../pdf-lab/scripts/gate-golden.js');

const run = (files, extra) => Object.assign({ lab: true, filter: null, files }, extra || {});
const base = { a: { error: null, total: 0.9, recall: 0.95, edits: 1 }, b: { error: null, total: 0.8, recall: 0.9, edits: 2 } };

test('gate: the same scores pass with no failure', function () {
  const r = compareGolden(run({ a: { total: 0.9, recall: 0.95, edits: 1 }, b: { total: 0.8, recall: 0.9, edits: 2 } }), base);
  assert.deepEqual(r.fails, []);
});

test('gate: a golden file that crashes (or lost its PDF) fails', function () {
  const r = compareGolden(run({ a: { error: 'no PDF a.pdf in the lab (pdf/)' }, b: { total: 0.8 } }), base);
  assert.equal(r.fails.length, 1);
  assert.match(r.fails[0], /golden: a — no PDF/);
  // without a compared side a crash fails all the same
  assert.equal(compareGolden(run({ a: { error: 'boom' } }), null).fails.length, 1);
});

test('gate: a total down more than 0.5 point fails; down by less is not a failure', function () {
  const down = compareGolden(run({ a: { total: 0.9 - TOL_GOLDEN - 0.001 }, b: { total: 0.8 } }), base);
  assert.equal(down.fails.length, 1);
  assert.match(down.fails[0], /golden: a 90\.0 → 89\.4/);
  const slight = compareGolden(run({ a: { total: 0.9 - TOL_GOLDEN + 0.001 }, b: { total: 0.8 } }), base);
  assert.deepEqual(slight.fails, []);
});

test('gate: a golden file missing from an unfiltered run of golden/ fails', function () {
  const r = compareGolden(run({ a: { total: 0.9 } }), base);
  assert.equal(r.fails.length, 1);
  assert.match(r.fails[0], /1 file\(s\) of baseline\.json no longer scored.*: b$/);
});

test('gate: a golden file missing from a filtered run, or from a --dir run, is a note', function () {
  const filtered = compareGolden(run({ a: { total: 0.9 } }, { filter: '^a' }), base);
  assert.deepEqual(filtered.fails, []);
  assert.ok(filtered.notes.some((n) => /not in this run \(filtered: \^a\): b/.test(n)));
  const other = compareGolden(run({ a: { total: 0.9 } }, { lab: false }), base);
  assert.deepEqual(other.fails, []);
  assert.ok(other.notes.some((n) => /not in this run/.test(n)));
});

test('gate: a new golden file is a note', function () {
  const r = compareGolden(run({ a: { total: 0.9 }, b: { total: 0.8 }, c: { total: 0.7 } }), base);
  assert.deepEqual(r.fails, []);
  assert.ok(r.notes.includes('golden: new file c (70.0)'));
});

test('gate: one metric down or the structure diff up while the total holds is a note', function () {
  const r = compareGolden(run({ a: { total: 0.9, recall: 0.9, edits: 3 }, b: { total: 0.8, recall: 0.9, edits: 2 } }), base);
  assert.deepEqual(r.fails, []);
  const n = r.notes.find((x) => /one metric down/.test(x));
  assert.match(n, /a words 95\.0 → 90\.0/);
  assert.match(n, /a structure edits 1 → 3/);
});

test('gate: not run, or a compared side without golden results, are notes', function () {
  assert.deepEqual(compareGolden(null, base), { fails: [], notes: ['golden: not run (scripts/golden.js)'] });
  const r = compareGolden(run({ a: { total: 0.9 } }), null, { hasBase: true, other: 'the other run' });
  assert.deepEqual(r.fails, []);
  assert.ok(r.notes.includes('golden: the other run has no golden results — not compared'));
});
