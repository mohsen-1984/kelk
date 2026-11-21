/**
 * OCR, line by line (lib/pdfimport/ocr.js, 3.4): the line finder on drawn pages (lines with their dots, a frame and a
 * table rule taken out), the post-correction, the gray conversion and the model's decoding; then Tesseract's core and
 * Persian model under Node — they load, and a line is read through the calls the importer makes (an empty line reads
 * as nothing). Reading real text is checked on the lab's scans (tests/pdf-lab/scripts/ocr-check.js, in Chromium).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

require('../../lib/PdfImporter.js');
const O = require('../../lib/pdfimport/ocr.js');
const VENDOR = path.resolve(__dirname, '..', '..', 'vendor', 'tesseract');

/** a white page w × h with black boxes [x0, y0, x1, y1] */
function draw(w, h, boxes) {
  const px = new Uint8Array(w * h).fill(255);
  boxes.forEach(function (b) {
    for (let y = b[1]; y < b[3]; y++) for (let x = b[0]; x < b[2]; x++) px[y * w + x] = 0;
  });
  return px;
}
/** a text line of words (ink 30 px tall) at y, with dots 6 px under it */
function line(y, x0, x1) {
  const out = [];
  for (let x = x0; x < x1; x += 40) out.push([x, y, x + 28, y + 30]);
  for (let x = x0 + 10; x < x1; x += 80) out.push([x, y + 36, x + 5, y + 41]);
  return out;
}

test('the line finder: one box a line, its dots with it, top to bottom', function () {
  const w = 800, h = 400;
  const px = draw(w, h, [].concat(line(40, 100, 700), line(110, 100, 700), line(180, 300, 700)));
  const pg = O.page(px, w, h);
  assert.equal(pg.boxes.length, 3, 'three lines, the dots under each joined to it');
  assert.ok(pg.boxes[0].y0 < pg.boxes[1].y0 && pg.boxes[1].y0 < pg.boxes[2].y0, 'top to bottom');
  pg.boxes.forEach(function (b, i) {
    assert.ok(b.y1 >= [41, 151, 221][i], 'the dots inside line ' + i);
    assert.ok(b.x1 - b.x0 <= w, 'within the page');
  });
  assert.ok(pg.boxes[2].x0 > 250, 'a short line keeps its own width');
  assert.equal(O.page(new Uint8Array(w * h).fill(255), w, h).boxes.length, 0, 'a blank page has no line');
});

test('the line finder: a frame and a table rule are taken out, the text between them stays', function () {
  const w = 800, h = 400;
  const frame = [[20, 10, 780, 14], [20, 386, 780, 390], [20, 10, 24, 390], [776, 10, 780, 390]];
  const rule = [[100, 90, 700, 92]];
  const px = draw(w, h, [].concat(frame, rule, line(40, 100, 700), line(150, 100, 700)));
  const pg = O.page(px, w, h);
  assert.equal(pg.boxes.length, 2, 'the frame and the rule are no lines');
  assert.equal(pg.clean[12 * w + 400], 255, 'the frame is white in the page Tesseract reads');
  assert.equal(pg.clean[91 * w + 400], 255, 'the rule too');
  assert.equal(pg.clean[45 * w + 105], 0, 'the text stays');
});

test('the line finder: a rule scanned askew (a row lower every 60 pixels) is taken out too', function () {
  const w = 1200, h = 300, boxes = [];
  for (let k = 0; k < 18; k++) boxes.push([50 + 60 * k, 200 + k, 110 + 60 * k, 201 + k]);
  const px = draw(w, h, [].concat(boxes, line(40, 100, 1100)));
  const pg = O.page(px, w, h);
  assert.equal(pg.boxes.length, 1, 'the askew rule leaves no line of specks');
  assert.equal(pg.clean[209 * w + 600], 255, 'the rule is white');
});

test('postCorrect: the comma Tesseract mistakes, ة where only ه makes a known word', function () {
  const vocab = new Set(['خانه', 'کتاب', 'هوا']);
  assert.equal(O.postCorrect('کتاب, خانه', vocab), 'کتاب، خانه');
  assert.equal(O.postCorrect('کتابء خانه', vocab), 'کتاب، خانه', 'a hamza ending a word after a joining letter');
  assert.equal(O.postCorrect('کتاب» خانه', vocab), 'کتاب، خانه', '» without «');
  assert.equal(O.postCorrect('«کتاب» خانه', vocab), '«کتاب» خانه', 'quotes kept');
  assert.equal(O.postCorrect('خانة کتاب', vocab), 'خانهٔ کتاب', '«هٔ» read «ة»');
  ['خانةٌ', 'خانهٌ', 'خانٌ'].forEach((w) => assert.equal(O.postCorrect(w + ' کتاب', vocab), 'خانهٔ کتاب', '«هٔ» read «' + w + '»'));
  assert.equal(O.postCorrect('کتابٌ', vocab), 'کتابٌ', 'no known word with «ه»: as it is');
  assert.equal(O.postCorrect('میزة', vocab), 'میزة', 'an unknown word keeps its ة');
  assert.equal(O.postCorrect('صلاة', vocab), 'صلاة', 'an unknown word keeps its ة');
  assert.equal(O.postCorrect('هواء', vocab), 'هوا،', 'a hamza after alef that makes no word');
  assert.equal(O.postCorrect('a, b', vocab), 'a, b', 'Latin untouched');
  assert.equal(O.postCorrect('یک\nدو, سه', null), 'یک\nدو، سه', 'line by line, no words given');
});

test('known: the words as the language model counts them, and how many it knows', function () {
  const vocab = new Set(['کتاب', 'خانهٔ', 'می', 'رود']);
  assert.deepEqual(O.known('کتابِ خانهٔ ما می‌رود', vocab), { words: 5, known: 4 }, 'short vowels off, ZWNJ splits, ٔ kept');
  assert.deepEqual(O.known('كتاب abc', vocab), { words: 1, known: 1 }, 'ک; Latin is no word');
  assert.deepEqual(O.known('', vocab), { words: 0, known: 0 });
});

test('gray and the model: pixels to one byte, base64 to bytes', function () {
  const g = O.gray(new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 0]), 3, 1);
  assert.deepEqual(Array.from(g), [0, 255, 255], 'black, white, transparent (paper)');
  assert.deepEqual(Array.from(O.model(Buffer.from([1, 2, 250]).toString('base64'))), [1, 2, 250]);
  assert.ok(O.otsu(draw(10, 10, [[0, 0, 5, 10]])) < 255, 'a threshold between ink and paper');
});

test('Tesseract under Node: the core and the Persian model load; a line is read through the importer\'s calls', async function () {
  const core = require(path.join(VENDOR, 'tesseract-core-simd-lstm_7.0.0.wasm.js'));
  const model = O.model(require(path.join(VENDOR, 'fas-best.js')));
  assert.ok(model.length > 3e6, 'the best model (3.3 MB)');
  const eng = await O.engine({ core: core, model: model, lang: 'fas' });
  const w = 300, h = 60, pg = { w: w, h: h, clean: new Uint8Array(w * h).fill(255), boxes: [{ x0: 0, y0: 0, x1: w, y1: h }] };
  const r = eng.line(pg, 0);
  assert.equal(r.text, '', 'a blank line reads as nothing');
  assert.ok(r.conf >= 0 && r.conf <= 1, 'a confidence 0–1');
  eng.end();
  eng.end();                                    // (twice: no harm)
});
