/**
 * The body size and the text column of regions.js _bodyMetrics (plan P3.3): the unrounded body size, and margins
 * mirrored only from a side that lines show (the right edge: from two lines at the left, or one left-to-right line
 * starting there; the left edge from any right edge).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PdfImporter = require('../../lib/PdfImporter.js');
require('../../lib/pdfimport/thresholds.js');
require('../../lib/pdfimport/calibration.js');
require('../../lib/pdfimport/extract.js');
require('../../lib/pdfimport/lines.js');
require('../../lib/pdfimport/regions.js');

// a line of n letters of one size from x0 (5 pt a letter); rtl: its letters strong right to left
function line(x0, n, size, rtl) {
  const glyphs = [];
  for (let i = 0; i < n; i++) glyphs.push({ ch: 'a', x: x0 + 5 * i, w: 5, size: size, space: false });
  return { glyphs: glyphs, size: Math.round(size * 2) / 2, x0: x0, x1: x0 + 5 * n, strong: rtl ? { R: n, L: 0 } : { R: 0, L: n } };
}
const run = function (lines, view) {
  const imp = PdfImporter.create();
  const body = imp._bodyMetrics([{ lines: lines }], [{ view: view || [0, 0, 720, 405] }]);
  return { body: body, m: imp._metrics };
};

test('P3.3: _metrics.bodyExact is the body size as drawn, the rounded one is kept as body', function () {
  const lines = [];
  for (let k = 0; k < 12; k++) lines.push(line(72, 40, 9.6));
  const r = run(lines, [0, 0, 595, 842]);
  assert.equal(r.body, 9.5);
  assert.equal(r.m.bodyExact, 9.6);
});

test('P3.3: a margin is mirrored only from a side two lines or more show', function () {
  // a slide: one line starting at 40, four right-to-left lines ending at 616, a centred agenda
  const lines = [line(40, 40, 14.5, true)];
  for (let k = 0; k < 4; k++) lines.push(line(416, 40, 14.5, true));
  for (let k = 0; k < 5; k++) lines.push(line(200, 24, 14.5, true));
  const r = run(lines);
  assert.equal(r.m.right, 616, 'the right edge is not mirrored from a left edge one line shows');
  // the left edge shown by two lines: the right edge mirrored from its margin
  lines.push(line(40, 30, 14.5, true));
  assert.equal(run(lines).m.right, 680);
});

test('P3.3 fix: one left-to-right line starting at the left margin gives the right edge its mirror', function () {
  // the builder's «images» case: an English paragraph at 43, one right-to-left list item ending at 526 (its mark
  // beyond); without the mirror the item set the column's right edge and the list read as a loose one, split
  const lines = [line(43, 16, 11.5), line(406, 24, 11.5, true), line(245, 23, 11.5)];
  assert.equal(run(lines, [0, 0, 595, 842]).m.right, 552);
  // the slide's case stays: its one line at the left margin is right to left (there, its ragged end)
  const slide = [line(40, 40, 14.5, true)];
  for (let k = 0; k < 4; k++) slide.push(line(416, 40, 14.5, true));
  assert.equal(run(slide).m.right, 616);
});

test('P3.3 fix: the left edge is mirrored from the right one even when a single line shows it', function () {
  // «متن فارسی با setDirection.» in a left-to-right document: its only line, flush right at 552 — not the whole column
  assert.equal(run([line(422, 26, 11.5)], [0, 0, 595, 842]).m.left, 43);
  // a borderless table under a one-line right-to-left caption: its LTR cells at 175 are not the column's left edge
  const lines = [line(493, 12, 11.5, true), line(175, 6, 11.5), line(175, 5, 11.5), line(175, 6, 11.5), line(390, 6, 11.5)];
  assert.equal(run(lines, [0, 0, 595, 842]).m.left, 42);
});
