/**
 * The importer's watermark rule (plan P3.3, lib/pdfimport/extract.js _watermark) on synthetic glyphs in the walk's shape.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PdfImporter = require('../../lib/PdfImporter.js');
require('../../lib/pdfimport/thresholds.js');
require('../../lib/pdfimport/extract.js');

const VIEW = [0, 0, 595, 842];

// a body of upright 10-pt text
function body() {
  const out = [];
  for (let l = 0; l < 20; l++) for (let i = 0; i < 40; i++) out.push({ ch: 'a', x: 72 + i * 5.5, y: 760 - l * 14, w: 5, size: 10, color: '#000000', space: false });
  return out;
}
// a run of turned glyphs from (x, y) at the angle (degrees), size pt, extra fields on each
function turned(text, x, y, deg, size, extra) {
  const r = deg * Math.PI / 180, adv = 0.7 * size, out = [];
  for (let i = 0; i < text.length; i++) {
    out.push(Object.assign({ ch: text[i], x: x + i * adv * Math.cos(r), y: y + i * adv * Math.sin(r), w: adv, size: size, rot: true, turn: deg,
      color: '#000000', space: text[i] === ' ' }, extra));
  }
  return out;
}
function run(glyphs) {
  const imp = PdfImporter.create(), fired = [];
  imp._fire = function (name) { fired.push(name); };
  const st = { glyphs: glyphs, view: VIEW };
  imp._watermark(st);
  return { glyphs: st.glyphs, fired: fired };
}

test('P3.3: a diagonal, large, faint run across the page is dropped (opacity or a light grey)', function () {
  const b = body();
  const r = run(b.concat(turned('CONFIDENTIAL DRAFT', 60, 120, 54.7, 60, { color: '#999999', alpha: 0.3 })));
  assert.equal(r.glyphs.length, b.length);
  assert.deepEqual(r.fired, ['extract.watermarkDropped']);
  const r2 = run(body().concat(turned('DRAFT COPY ONLY', 60, 120, 45, 60, { color: '#c8c8c8' })));
  assert.equal(r2.glyphs.length, b.length);
});

test('P3.3: turned text that is no watermark stays', function () {
  const n = body().length;
  // a side label at 90° (a table's turned header), large and faint: on an axis
  assert.equal(run(body().concat(turned('SIDE LABEL OF THE PAGE', 40, 100, 90, 40, { alpha: 0.3 }))).glyphs.length, n + 22);
  // diagonal and faint, but of the body's size (a turned caption)
  assert.equal(run(body().concat(turned('a small turned caption here', 60, 120, 45, 10, { alpha: 0.3 }))).glyphs.length, n + 27);
  // diagonal and large, but black and opaque (a design's title)
  assert.equal(run(body().concat(turned('CONFIDENTIAL DRAFT', 60, 120, 45, 60, {}))).glyphs.length, n + 18);
  // diagonal, large and faint, but short (a corner seal, not across the page)
  assert.equal(run(body().concat(turned('OK', 60, 120, 45, 40, { alpha: 0.3 }))).glyphs.length, n + 2);
  // light grey upright text: not turned
  const grey = body().map(function (g) { return Object.assign({}, g, { color: '#aaaaaa', alpha: 0.4 }); });
  assert.equal(run(grey).glyphs.length, n);
});
