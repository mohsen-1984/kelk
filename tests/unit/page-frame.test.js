/**
 * A page turned by /Rotate is read in its upright frame (plan P3.3, lib/pdfimport/extract.js _pageFrame /
 * _pageViewport): on a mock page whose getViewport is pdf.js's PageViewport arithmetic.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PdfImporter = require('../../lib/PdfImporter.js');
require('../../lib/pdfimport/thresholds.js');
require('../../lib/pdfimport/extract.js');

const proto = PdfImporter.prototype;
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

// pdf.js's PageViewport (src/display/display_utils.js), for a rotation that is a multiple of 90
function viewport(viewBox, scale, rotation) {
  const cx = (viewBox[2] + viewBox[0]) / 2, cy = (viewBox[3] + viewBox[1]) / 2;
  const r = { 0: [1, 0, 0, -1], 90: [0, 1, 1, 0], 180: [-1, 0, 0, 1], 270: [0, -1, -1, 0] }[rotation];
  const [a, b, c, d] = r;
  let ox, oy, width, height;
  if (a === 0) { ox = Math.abs(cy - viewBox[1]) * scale; oy = Math.abs(cx - viewBox[0]) * scale; width = (viewBox[3] - viewBox[1]) * scale; height = (viewBox[2] - viewBox[0]) * scale; }
  else { ox = Math.abs(cx - viewBox[0]) * scale; oy = Math.abs(cy - viewBox[1]) * scale; width = (viewBox[2] - viewBox[0]) * scale; height = (viewBox[3] - viewBox[1]) * scale; }
  const transform = [a * scale, b * scale, c * scale, d * scale, ox - a * scale * cx - c * scale * cy, oy - b * scale * cx - d * scale * cy];
  return { width: width, height: height, transform: transform, convertToViewportPoint(x, y) { return apply(transform, x, y); } };
}
function mockPage(view, rotate) {
  return { view: view, rotate: rotate, getViewport(o) { return viewport(view, o.scale, (o.rotation === undefined ? rotate : o.rotation) % 360); } };
}

// an upright page W × H, its content turned the way make-meta.js turnPage does (and its inverse for 270)
const W = 595, H = 842;
const turned = {
  90: { box: [0, 0, H, W], user: (x, y) => [H - y, x] },
  180: { box: [0, 0, W, H], user: (x, y) => [W - x, H - y] },
  270: { box: [0, 0, H, W], user: (x, y) => [y, W - x] }
};

test('an unturned page has no frame (read as it is)', () => {
  assert.equal(proto._pageFrame(mockPage([0, 0, W, H], 0)), null);
  assert.equal(proto._pageFrame(mockPage([0, 0, W, H], undefined)), null);
});

for (const deg of [90, 180, 270]) {
  test('/Rotate ' + deg + ': the frame gives back the upright page', () => {
    const t = turned[deg], f = proto._pageFrame(mockPage(t.box, deg));
    assert.deepEqual(f.view, [0, 0, W, H]);
    for (const [x, y] of [[0, 0], [72, 760], [W, H], [300, 10]]) {
      const u = t.user(x, y), p = apply(f.m, u[0], u[1]);
      assert.ok(Math.abs(p[0] - x) < 1e-9 && Math.abs(p[1] - y) < 1e-9, deg + ': ' + [x, y] + ' → ' + p);
      const back = apply(f.inv, x, y);
      assert.ok(Math.abs(back[0] - u[0]) < 1e-9 && Math.abs(back[1] - u[1]) < 1e-9);
    }
  });

  test('/Rotate ' + deg + ': a render maps an upright point where the viewer shows it', () => {
    const t = turned[deg], page = mockPage(t.box, deg), p = { page: page, frame: proto._pageFrame(page) };
    const vp = proto._pageViewport(p, 2);
    // the top left corner of the upright page is the canvas's origin; its bottom right, the far corner
    assert.deepEqual(vp.convertToViewportPoint(0, H).map((v) => Math.round(v * 1e9) / 1e9), [0, 0]);
    assert.deepEqual(vp.convertToViewportPoint(W, 0).map((v) => Math.round(v * 1e9) / 1e9), [2 * W, 2 * H]);
  });
}

test('an unturned page renders through its own viewport, unchanged', () => {
  const page = mockPage([10, 20, 10 + W, 20 + H], 0), p = { page: page, frame: null };
  assert.deepEqual(proto._pageViewport(p, 1).convertToViewportPoint(10, 20 + H), [0, 0]);
});
