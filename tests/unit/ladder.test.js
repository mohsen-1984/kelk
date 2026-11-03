/**
 * The page confidence and the fallback ladder's decision (plan P3.4, lib/pdfimport/ladder.js): both pure.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PdfImporter = require('../../lib/PdfImporter.js');
require('../../lib/pdfimport/thresholds.js');
require('../../lib/pdfimport/ladder.js');

const L = PdfImporter._ladder;
const K = {};
L.names.forEach(function (n) { K[n] = PdfImporter._thresholds[n].def; });
// a clean page: many glyphs and words, nothing lost or glued, enough samples
const clean = function (o) { return Object.assign({ glyphs: 1000, lost: 0, words: 150, glued: 0, covered: 0, guessed: 0, treeVotes: 0, treeAgree: 0, gaps: 150, ambig: 0, samples: 100, flags: [], picShare: 0 }, o || {}); };

test('P3.4: the thresholds the ladder reads are registered, fixed', function () {
  L.names.forEach(function (n) { assert.ok(PdfImporter._thresholds[n], n); assert.equal(PdfImporter._thresholds[n].fixed, true, n); });
  assert.equal(K.pageConfSimplified, 0.45);
  assert.equal(K.ladLostTextContent, 0.2);
});

test('P3.4: ladderConf — 1 for a clean page, each sign lowers it by at most its weight, clamped to 0–1', function () {
  assert.equal(L.conf(clean(), K), 1);
  assert.equal(L.conf({}, K), 1);                                   // no text, no signs
  // lost glyphs: in full at a fifth of the page, half of that half the weight
  assert.equal(L.conf(clean({ lost: 200 }), K), +(1 - K.ladWLost).toFixed(3));
  assert.equal(L.conf(clean({ lost: 100 }), K), +(1 - K.ladWLost / 2).toFixed(3));
  assert.equal(L.conf(clean({ lost: 900 }), K), +(1 - K.ladWLost).toFixed(3));      // saturates
  assert.equal(L.conf(clean({ glued: 150 }), K), +(1 - K.ladWGlued).toFixed(3));
  // the tree's word only from ladTreeMinVotes blocks on
  assert.equal(L.conf(clean({ treeVotes: 2, treeAgree: 0 }), K), 1);
  assert.equal(L.conf(clean({ treeVotes: 4, treeAgree: 2 }), K), +(1 - K.ladWTree / 2).toFixed(3));
  // a short document: a little less sure (never under the threshold by that alone)
  assert.equal(L.conf(clean({ samples: 0 }), K), +(1 - K.ladWSamples).toFixed(3));
  assert.equal(L.conf(clean({ samples: null }), K), 1);
  assert.ok(L.conf(clean({ samples: 0, ambig: 150, guessed: 1000, covered: 1000 }), K) > K.pageConfSimplified);
  // everything wrong at once: 0, not below
  assert.equal(L.conf(clean({ lost: 1000, glued: 150, covered: 1000, guessed: 1000, treeVotes: 9, treeAgree: 0, ambig: 150, samples: 0 }), K), 0);
});

test('P3.4: ladderDecide — full, simplified, textContent, ocr, and the failures', function () {
  const D = function (s, mode) { return L.decide(s, L.conf(s, K), mode || 'auto', K); };
  assert.deepEqual(D(clean()), { mode: 'full', why: [] });
  assert.deepEqual(D(clean(), 'safe'), { mode: 'simplified', why: ['safeMode'] });
  // glued words and lost glyphs flagged together: simplified
  assert.deepEqual(D(clean({ lost: 30, flags: ['lostGlyphs', 'suspectSpaces'] })), { mode: 'simplified', why: ['suspectSpaces', 'lostGlyphs'] });
  assert.equal(D(clean({ flags: ['suspectSpaces'] })).mode, 'full');           // one flag alone is no reason
  // a fifth of the glyphs lost: pdf.js's own text
  assert.deepEqual(D(clean({ lost: 200, flags: ['lostGlyphs'] })), { mode: 'textContent', why: ['lostGlyphs'] });
  assert.equal(D(clean({ lost: 199 })).mode, 'full');
  // low confidence: simplified
  assert.deepEqual(L.decide(clean(), 0.3, 'auto', K), { mode: 'simplified', why: ['lowConf'] });
  // no text over a picture of the page: OCR; a blank page stays full
  assert.deepEqual(D({ glyphs: 0, picShare: 0.95 }), { mode: 'ocr', why: ['noText'] });
  assert.deepEqual(D({ glyphs: 0, picShare: 0.95 }, 'safe'), { mode: 'ocr', why: ['noText'] });
  assert.equal(D({ glyphs: 0, picShare: 0 }).mode, 'full');
  // failures go a rung down in auto and safe; 'full' never demotes (the caller's last resort, as before the ladder)
  assert.deepEqual(D(clean({ failed: 'layout' })), { mode: 'simplified', why: ['layoutFailed'] });
  assert.deepEqual(D(clean({ failed: 'extract' }), 'safe'), { mode: 'textContent', why: ['extractFailed'] });
  assert.deepEqual(D(clean({ failed: 'lines' })), { mode: 'textContent', why: ['layoutFailed'] });
  assert.deepEqual(D(clean({ failed: 'layout', lost: 900, flags: ['lostGlyphs', 'suspectSpaces'] }), 'full'), { mode: 'full', why: [] });
});
