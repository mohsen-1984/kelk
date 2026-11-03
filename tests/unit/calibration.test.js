/**
 * The importer's calibration (plan P3.2, lib/pdfimport/calibration.js) on synthetic pages in _extractPage's shape.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PdfImporter = require('../../lib/PdfImporter.js');
require('../../lib/pdfimport/thresholds.js');
require('../../lib/pdfimport/calibration.js');

const SIZE = 10, W = 5;          // body glyphs 10 pt, 5 pt wide

// a line of words at y, from x0: letters 0.5 pt apart (0.05 em), words parted by a space glyph (3 pt) or a bare gap
function line(out, words, x0, y, opts) {
  let x = x0;
  words.forEach(function (n, wi) {
    if (wi) {
      if (opts.spaces) { out.push({ ch: ' ', x: x, y: y, w: 3, size: SIZE, font: 'F1', space: true }); x += 3; }
      else x += 3 - 0.5;
    }
    for (let i = 0; i < n; i++) {
      out.push(Object.assign({ ch: 'a', x: x, y: y, w: W, size: opts.size || SIZE, font: opts.font || 'F1', space: false }, opts.extra || {}));
      x += W + 0.5;
    }
  });
}
function page(num, opts) {
  const glyphs = [];
  line(glyphs, [4], 72, 760, { size: 16, font: 'F2' });                  // a heading
  let y = 730;
  for (let para = 0; para < 3; para++) {
    for (let l = 0; l < 5; l++) { line(glyphs, [5, 3, 6, 4, 5, 2, 4], 72, y, opts); y -= 14; }   // leading 14 pt
    y -= 10;                                                             // a paragraph gap: 24 pt baseline to baseline
  }
  return { num: num, view: [0, 0, 595, 842], glyphs: glyphs, rects: [], links: [], fonts: {} };
}

test('P3.2: calibrate finds the body size, font, leading, paragraph gap, word and letter gaps', function () {
  const pages = [page(1, { spaces: true }), page(2, { spaces: true })];
  const before = JSON.stringify(pages);
  const c = PdfImporter.prototype._calibrate(pages, { F1: { name: 'Body-Regular' }, F2: { name: 'Head-Bold' } });
  assert.equal(JSON.stringify(pages), before, 'pages untouched');
  assert.equal(c.body.size, 10);
  assert.equal(c.body.font, 'F1');
  assert.equal(c.body.name, 'Body-Regular');
  assert.equal(c.body.n, 2 * 15 * 29);
  assert.equal(c.steps.leading, 14);
  assert.equal(c.steps.paraGap, 24);
  assert.ok(Math.abs(c.gaps.letterEm - 0.05) < 0.011, 'letter ' + c.gaps.letterEm);
  assert.ok(Math.abs(c.gaps.wordEm - 0.35) < 0.011, 'word ' + c.gaps.wordEm);     // 0.5 + 3 pt across the space glyph
  assert.equal(c.gaps.bimodal, false);
  assert.equal(c.gaps.spaced, 1);
  assert.equal(c.fonts.F1.hasSpaceGlyph, true);
  assert.ok(Math.abs(c.fonts.F1.spaceW - 0.3) < 1e-9);
  assert.equal(c.fonts.F2.hasSpaceGlyph, false);
  assert.deepEqual(c.columns.edges, [72]);
  assert.equal(c.columns.gutter, null);
  assert.equal(c.tracking.tz, 1);
  assert.equal(c.tracking.tc, 0);
  assert.equal(c.regions[1].size, 10);
});

test('P3.2: words set by gaps alone part the gaps in two (bimodal); Tz and Tc are read from the glyphs', function () {
  const c = PdfImporter.prototype._calibrate([page(1, { spaces: false, extra: { hs: 0.85, track: 0.02 } })], {});
  assert.ok(Math.abs(c.gaps.letterEm - 0.05) < 0.011);
  assert.ok(Math.abs(c.gaps.wordEm - 0.3) < 0.011, 'word ' + c.gaps.wordEm);
  assert.equal(c.gaps.bimodal, true);
  assert.equal(c.gaps.spaced, 0);
  assert.ok(c.gaps.n >= 90);
  assert.equal(c.tracking.tz, 0.85);
  assert.equal(c.tracking.tc, 0.02);
  assert.ok(c.tracking.tzShare > 0.9);
});

test('P3.2: two columns give two edges and a gutter; the result is frozen all the way down', function () {
  const glyphs = [];
  for (let l = 0; l < 10; l++) {
    line(glyphs, [5, 4, 6], 72, 700 - 14 * l, { spaces: true });
    line(glyphs, [5, 4, 6], 320, 700 - 14 * l, { spaces: true });
  }
  const c = PdfImporter.prototype._calibrate([{ num: 1, glyphs: glyphs, fonts: {} }], {});
  assert.deepEqual(c.columns.edges, [72, 320]);
  assert.ok(c.columns.gutter > 100);
  assert.ok(Object.isFrozen(c) && Object.isFrozen(c.body) && Object.isFrozen(c.columns.edges) && Object.isFrozen(c.regions[1]));
  assert.throws(function () { 'use strict'; c.body.size = 3; }, TypeError);
});

test('P3.2: an empty document calibrates to defaults with n = 0', function () {
  const c = PdfImporter.prototype._calibrate([{ num: 1, glyphs: [], fonts: {} }], {});
  assert.equal(c.body.size, 10);
  assert.equal(c.body.n, 0);
  assert.equal(c.gaps.wordEm, null);
  assert.equal(c.gaps.n, 0);
  assert.equal(c.steps.leading, null);
});

test('P3.3: the word-gap midpoint (wordGapBareEm, off) needs bimodal gaps with both peaks known; wordGapEm has none', function () {
  const mid = PdfImporter._thresholds.wordGapBareEm.calib;
  assert.ok(Math.abs(mid({ gaps: { letterEm: 0.08, wordEm: 0.36, bimodal: true, n: 50 } }) - 0.22) < 1e-9);
  assert.ok(Number.isNaN(mid({ gaps: { letterEm: null, wordEm: 0.3, bimodal: true, n: 50 } })), 'a null letter gap is no 0');
  assert.ok(Number.isNaN(mid({ gaps: { letterEm: 0.08, wordEm: 0.36, bimodal: false, n: 50 } })), 'not bimodal');
  assert.equal(PdfImporter._thresholds.wordGapEm.calib, undefined);
  const imp = PdfImporter.create();
  assert.equal(imp._t('wordGapBareEm', { cal: { gaps: { letterEm: 0.08, wordEm: 0.36, bimodal: true, n: 50 } }, p: { num: 1 } }), 0.14, 'not switched on');
});

// P3.3: words placed one by one (one operator each, seq), each at its untracked place, their letters then set with
// Tc (track, em) and / or Tz (hs): the drawn advance is (w + Tc)·Tz
function placedWords(track, hs, rtl) {
  const glyphs = [], words = [5, 3, 6, 4, 2, 7];
  let seq = 0;
  for (let l = 0; l < 6; l++) {
    const y = 700 - 14 * l, runs = [];
    let x = 72;
    words.forEach(function (n) {
      seq++;
      const at = x, run = [];
      for (let i = 0; i < n; i++) {
        run.push({ ch: 'a', x: at + i * (W + track * SIZE) * hs, y: y, w: W * hs, size: SIZE, font: 'F1', space: false, seq: seq,
                   hs: hs === 1 ? undefined : hs, track: track || undefined });
      }
      runs.push(run);
      x += n * W + 3;            // the untracked layout: a 3 pt gap between words
    });
    (rtl ? runs.reverse() : runs).forEach(function (r) { r.forEach(function (g) { glyphs.push(g); }); });   // rtl: drawn right to left
  }
  return glyphs;
}

test('P3.3: untrack lays a run out again without its Tz and Tc; untracked glyphs stay where they are', function () {
  const { untrack } = PdfImporter._calibrationInternal;
  const gs = placedWords(0.08, 0.85, false), U = untrack(gs);
  assert.equal(U.start[0], 0);
  assert.equal(U.start[4], 0);
  assert.equal(U.start[5], 5, 'a new operator not at the advance: a new run');
  for (let i = 0; i < 5; i++) {
    assert.ok(Math.abs(U.x[i] - (72 + i * W)) < 1e-9, 'x ' + i);
    assert.ok(Math.abs(U.w[i] - W) < 1e-9);
  }
  const plain = placedWords(0, 1, false), P = untrack(plain);
  plain.forEach(function (g, i) { assert.equal(P.x[i], g.x); assert.equal(P.w[i], g.w); });
  // (two operators, the second drawn where the first one's advance left off: one run)
  const chain = [{ x: 10, y: 0, w: 5, size: 10, seq: 1, track: 0.1 }, { x: 16, y: 0, w: 5, size: 10, seq: 2, track: 0.1 }];
  assert.equal(untrack(chain).start[1], 0);
  assert.ok(Math.abs(untrack(chain).x[1] - 15) < 1e-9);
});

test('P3.3: words placed from their untracked widths show as drift (Tc, Tz, right to left); a tracked layout does not', function () {
  const pg = function (glyphs) { return [{ num: 1, glyphs: glyphs, fonts: {} }]; };
  const cases = { loose: placedWords(0.08, 1), tight: placedWords(-0.04, 1), tz: placedWords(0, 0.85), rtl: placedWords(0.08, 1, true) };
  Object.keys(cases).forEach(function (k) {
    const c = PdfImporter.prototype._calibrate(pg(cases[k]), {});
    assert.equal(c.tracking.drift.on, true, k + ' ' + JSON.stringify(c.tracking.drift));
    assert.ok(c.tracking.drift.slope < -0.9, k);
    assert.equal(c.regions[1].drift.on, true);
  });
  // the same words laid out tracked (each word placed after the last one's drawn advance): no drift
  const gs = [];
  let seq = 0;
  for (let l = 0; l < 6; l++) {
    let x = 72;
    [5, 3, 6, 4, 2, 7].forEach(function (n) {
      seq++;
      for (let i = 0; i < n; i++) { gs.push({ ch: 'a', x: x, y: 700 - 14 * l, w: W, size: SIZE, font: 'F1', space: false, seq: seq, track: 0.08 }); x += W + 0.8; }
      x += 3;
    });
  }
  const c = PdfImporter.prototype._calibrate(pg(gs), {});
  assert.equal(c.tracking.drift.on, false, JSON.stringify(c.tracking.drift));
  // nothing tracked: no samples
  assert.equal(PdfImporter.prototype._calibrate(pg(placedWords(0, 1)), {}).tracking.drift.n, 0);
});
