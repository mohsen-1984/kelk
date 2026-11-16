/**
 * The report expectations of the PDF lab (tests/pdf-lab/scripts/report-expect.js): what a lab file's import report
 * must say — a code it must or must not carry, a confidence it must stay under — with expectations of work not done
 * yet held as pending.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { checkExpect } = require('../pdf-lab/scripts/report-expect.js');

const rows = [
  { name: 'clean', conf: 0.99, findings: [] },
  { name: 'garbled', conf: 0.2, findings: ['garbledText'] },
  { name: 'missed', conf: 0.99, findings: [] },
  { name: 'wk-rtl--x', conf: 0.9, findings: ['garbledText'] },
  { name: 'crash', error: 'boom' }
];

test('report: a code a file must carry and a confidence it must stay under', function () {
  const r = checkExpect(rows, { files: { garbled: { has: ['garbledText'], confBelow: 0.5 }, missed: { has: ['garbledText'], confBelow: 0.5 } } });
  assert.equal(r.fails.length, 1);
  assert.match(r.fails[0], /missed lacks garbledText, confidence under 0\.5/);
});

test('report: a pending expectation does not fail, and is noted once it holds', function () {
  const r = checkExpect(rows, { files: { garbled: { has: ['garbledText'], pending: 'x' }, missed: { has: ['garbledText'], pending: 'x' } } });
  assert.deepEqual(r.fails, []);
  assert.equal(r.pending.length, 1);
  assert.match(r.notes[0], /garbled now holds/);
});

test('report: `not` is checked at once, pending or not', function () {
  const r = checkExpect(rows, { files: { garbled: { not: ['garbledText'], pending: 'x' } } });
  assert.equal(r.fails.length, 1);
});

test('report: a code no lab file may carry, but for the files that expect it and the excepted prefixes', function () {
  const r = checkExpect(rows, { never: ['garbledText'], neverExcept: ['wk-rtl--'], files: { garbled: { has: ['garbledText'] } } });
  assert.deepEqual(r.fails, []);
  assert.equal(checkExpect(rows, { never: ['garbledText'], files: {} }).fails.length, 2);
});

test('report: a crashed file and a file missing from the run are not this check\'s failures', function () {
  const r = checkExpect(rows, { files: { crash: { has: ['hiddenText'] }, absent: { has: ['hiddenText'] } } });
  assert.deepEqual(r.fails, []);
  assert.match(r.notes[0], /absent is not in this run/);
});
