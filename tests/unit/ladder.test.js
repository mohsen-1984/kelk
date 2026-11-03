/**
 * The page confidence and the fallback ladder's decision (lib/pdfimport/ladder.js): both pure.
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

test('the thresholds the ladder reads are registered, fixed', function () {
  L.names.forEach(function (n) { assert.ok(PdfImporter._thresholds[n], n); assert.equal(PdfImporter._thresholds[n].fixed, true, n); });
  assert.equal(K.pageConfSimplified, 0.45);
  assert.equal(K.ladLostTextContent, 0.2);
});

test('ladderConf — 1 for a clean page, each sign lowers it by at most its weight, clamped to 0–1', function () {
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

test('ladderDecide — full, simplified, textContent, ocr, and the failures', function () {
  const D = function (s, mode) { return L.decide(s, L.conf(s, K), mode || 'auto', K); };
  assert.deepEqual(D(clean()), { mode: 'full', why: [] });
  assert.deepEqual(D(clean(), 'safe'), { mode: 'simplified', why: ['safeMode'] });
  // glued words and lost glyphs flagged together: simplified
  assert.deepEqual(D(clean({ lost: 30, flags: ['lostGlyphs', 'suspectSpaces'] })), { mode: 'simplified', why: ['suspectSpaces', 'lostGlyphs'] });
  assert.equal(D(clean({ flags: ['suspectSpaces'] })).mode, 'full');           // one flag alone is no reason
  // a fifth of the glyphs lost: simplified — pdf.js's own text only where the caller finds it lost fewer (tryText)
  assert.deepEqual(D(clean({ lost: 200, flags: ['lostGlyphs'] })), { mode: 'simplified', why: ['lostGlyphs'], tryText: true });
  assert.equal(D(clean({ lost: 199 })).mode, 'full');
  // low confidence: simplified
  assert.deepEqual(L.decide(clean(), 0.3, 'auto', K), { mode: 'simplified', why: ['lowConf'] });
  // no text over a picture of the page: OCR; a blank page stays full
  assert.deepEqual(D({ glyphs: 0, picShare: 0.95 }), { mode: 'ocr', why: ['noText'] });
  assert.deepEqual(D({ glyphs: 0, picShare: 0.95 }, 'safe'), { mode: 'ocr', why: ['noText'] });
  assert.equal(D({ glyphs: 0, picShare: 0 }).mode, 'full');
  // a caption or a page number under the picture is text: no OCR
  assert.equal(D({ glyphs: 8, picShare: 0.95, words: 2 }).mode, 'full');
  assert.equal(D({ glyphs: 2, picShare: 0.95, words: 1 }).mode, 'full');
  // failures go a rung down in auto and safe; 'full' never demotes (the caller's last resort, as before the ladder)
  assert.deepEqual(D(clean({ failed: 'layout' })), { mode: 'simplified', why: ['layoutFailed'] });
  assert.deepEqual(D(clean({ failed: 'extract' }), 'safe'), { mode: 'textContent', why: ['extractFailed'] });
  assert.deepEqual(D(clean({ failed: 'lines' })), { mode: 'textContent', why: ['layoutFailed'] });
  assert.deepEqual(D(clean({ failed: 'layout', lost: 900, flags: ['lostGlyphs', 'suspectSpaces'] }), 'full'), { mode: 'full', why: [] });
});

// ── the textContent rung, the report ──────────────────────────────────────────────
['calibration', 'extract', 'lines', 'regions', 'order', 'blocks'].forEach(function (p) { require('../../lib/pdfimport/' + p + '.js'); });
const ITEMS = require('./ladder-tc-items.js');

// a pdf.js page of these items ([str, dir, x, y, size, width], y up as in the PDF; the viewport turns it down)
function fakePage(items, h) {
  const H = h || 842;
  return {
    getTextContent: async function () { return { items: items.map(function (x) { return { str: x[0], dir: x[1], transform: [x[4], 0, 0, x[4], x[2], x[3]], width: x[5] }; }) }; },
    getViewport: function () { return { height: H, width: 595, convertToViewportPoint: function (x, y) { return [x, H - y]; } }; }
  };
}
// a block's text, its digits in ASCII (the importer writes them so later, in _toHtml)
const text = function (b) {
  return b.glyphs.map(function (g) { return g.ch || ''; }).join('')
    .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x660); }).replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x6F0); });
};
const importer = function (producer) {
  const imp = PdfImporter.create({ images: 'drop' });
  imp._producer = producer === undefined ? 'Skia/PDF m141' : producer;
  imp.messages = []; imp.notes = [];
  return imp;
};
const pageOf = function (n, items) { return { p: { num: n, page: fakePage(items), view: [0, 0, 595, 842] }, lines: [] }; };
const rung = async function (items) {
  const imp = importer(), pl = pageOf(1, items);
  imp._ladPls = [pl];
  return imp._ladTextContent(pl);
};

test('tcVisual — pdf.js\'s reordering of an item, run again, gives the drawn order back', function () {
  assert.equal(L.tcVisual('12-05-2024', 'ltr'), '12-05-2024');                     // nothing right to left: as it was
  assert.equal(L.tcVisual('زارش', 'rtl'), 'شراز');                                  // as drawn, left to right
  // a Latin run in a right-to-left item keeps its order; the brackets come back as drawn (pdf.js does not mirror)
  assert.equal(L.tcVisual('دیسک )NAS( در', 'rtl'), 'رد (NAS) کسید');
});

test('tcMarker and tcBrackets', function () {
  const G = function (s) { return Array.from(s).map(function (c) { return c === ' ' ? { ch: ' ', space: true } : { ch: c }; }); };
  assert.equal(L.tcMarker(G('Google Chrome اب .1')), 'right');
  assert.equal(L.tcMarker(G('1. Item one')), 'left');
  assert.equal(L.tcMarker(G('الف 100')), null);                                    // a number alone is no marker
  assert.equal(L.tcMarker(G('.1')), null);                                         // nor a line of the marker only
  assert.equal(L.tcBrackets(G('x )NAS( y (ok)')).map(function (g) { return g.ch; }).join(''), 'x (NAS) y (ok)');
});

test('the textContent rung reads right-to-left lines in logical order (the review\'s cases, Chrome)', async function () {
  const out = await rung(ITEMS.MIXED), t = out.map(text);
  assert.equal(out[0].type, 'heading');
  assert.equal(t[0], 'گزارش سال 1403');                                             // not «3041»
  assert.equal(t[1].indexOf('نرم‌افزار Kelk Markdown Converter'), 0, t[1]);     // its ZWNJ kept
  assert.ok(t[1].indexOf('تاریخ 2024-05-12') > 0, 'the date as written, not 12-05-2024: ' + t[1]);
  assert.ok(/ و 12[%٪] سریع‌تر/.test(t[1]), 'the percentage as written, not 21%; «سریع‌تر» with its ZWNJ: ' + t[1]);
  assert.equal(out[1].dir, 'rtl');
  assert.equal(t[2], '1. مورد اول با Google Chrome');                               // the list item, right to left
  assert.equal(out[2].dir, 'rtl');
  out.forEach(function (b) { assert.equal(b.textContent, true); });
});

test('mirrored brackets and guillemets the right way round', async function () {
  const t = (await rung(ITEMS.ARTICLE)).map(text).join('\n');
  assert.ok(t.indexOf('(NAS)') > 0, t);
  assert.ok(t.indexOf('«کامل»') > 0, t);
});

test('running heads, feet and page numbers go — repeated on the pages around, or a lone number', async function () {
  const page = function (n) {
    return [['Backup notes 10/21/26, 1:04 PM', 'ltr', 28.8, 822.6, 6, 80], ['Body text of page ' + n + ' that stays.', 'ltr', 72, 700, 12, 200],
      ['file:///tmp/a.html ' + n + '/2', 'ltr', 28.8, 16.4, 6, 90]];
  };
  const imp = importer(), pls = [pageOf(1, page(1)), pageOf(2, page(2))];
  imp._ladPls = pls;
  assert.deepEqual((await imp._ladTextContent(pls[1])).map(text), ['Body text of page 2 that stays.']);
  // one page alone: a lone page number at its foot goes, its head stays (no evidence)
  const one = importer(), pl = pageOf(1, [['Head of a letter', 'ltr', 72, 822, 8, 60], ['Body text.', 'ltr', 72, 700, 12, 60], ['3', 'ltr', 297, 20, 10, 6]]);
  one._ladPls = [pl];
  assert.deepEqual((await one._ladTextContent(pl)).map(text), ['Head of a letter', 'Body text.']);
});

test('the report — failed pages, an unknown confidence, a Kelk source', function () {
  const rep = function (mode, recs, notes, kelk) {
    const imp = PdfImporter.create({ mode: mode });
    imp._pageModes = recs; imp.notes = notes || []; imp._notePages = {};
    return imp._ladReport({}, recs.length || 3, kelk);
  };
  const recs = function () { return [{ page: 1, mode: 'full', conf: 0.9, why: [] }, { page: 2, mode: 'failed', conf: 0, why: ['extractFailed'] }, { page: 3, mode: 'full', conf: null, why: [] }]; };
  const a = rep('auto', recs());
  assert.deepEqual(a.pages[1], { page: 2, mode: 'simplified', conf: 0, failed: true });
  assert.equal(a.pages[0].failed, undefined);
  assert.equal(a.report.summary.failed, 1);
  assert.equal(a.report.summary.conf, 0.45);                                        // (0.9 + 0) / 2: the unknown skipped
  assert.equal(a.report.pages[0].failed, true);
  const f = rep('full', recs());
  assert.equal(f.pages[1].mode, 'failed');                                          // 'full' mode simplifies nothing
  assert.equal(f.report.pages[0].mode, 'failed');
  assert.equal(rep('auto', [{ page: 1, mode: 'full', conf: null, why: [] }]).report.summary.conf, null);   // not 1
  const k = rep('auto', [], ['kelkSource'], true);                                  // the summary, every list empty
  assert.deepEqual(k.report.notes, []);
  assert.deepEqual(k.pages, []);
  assert.equal(k.report.summary.full, 3);
});

test('only a valid hooks.mode overrides options.mode', function () {
  const imp = PdfImporter.create({ mode: 'safe' });
  imp._runMode = 'Safe'; assert.equal(imp._ladMode(), 'safe');
  imp._runMode = 'full'; assert.equal(imp._ladMode(), 'full');
  imp._runMode = undefined; assert.equal(imp._ladMode(), 'safe');
});

test('pdf.js\'s text taken for lost glyphs only where it lost demonstrably fewer', function () {
  const imp = PdfImporter.create();
  const blk = function (s) { return [{ type: 'p', glyphs: Array.from(s).map(function (c) { return c === ' ' ? { ch: ' ', space: true } : { ch: c }; }) }]; };
  const sig = { glyphs: 100, lost: 25 };
  assert.equal(imp._ladTcBetter(blk('a�cd'.repeat(25)), sig), false);          // the same quarter lost
  assert.equal(imp._ladTcBetter(blk('abcd'.repeat(25)), sig), true);                 // none lost
  assert.equal(imp._ladTcBetter(blk('abcd'.repeat(10)), sig), false);                // too little of it kept
});
