/**
 * The importer's threshold registry and rule telemetry (plan P3.2, lib/pdfimport/thresholds.js).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PdfImporter = require('../../lib/PdfImporter.js');
require('../../lib/pdfimport/thresholds.js');

const T = PdfImporter._thresholds;

test('P3.2: every entry is frozen, with a numeric def, a unit and its uses; a name defined twice throws', function () {
  assert.throws(function () { PdfImporter._defineThresholds({ wordGapEm: { def: 1, unit: 'em', used: ['x'] } }); }, /defined twice/);
  assert.throws(function () { PdfImporter._defineThresholds({ zzNoUnit: { def: 1, used: ['x'] } }); }, /needs def, unit and used/);
  Object.keys(T).forEach(function (k) {
    const e = T[k];
    assert.ok(Object.isFrozen(e), k);
    assert.equal(typeof e.def, 'number', k);
    assert.equal(typeof e.unit, 'string', k);
    assert.ok(Array.isArray(e.used) && e.used.length > 0, k);
    if (e.calib) assert.equal(typeof e.calib, 'function', k);
  });
  assert.equal(T.wordGapEm.def, 0.45);
  assert.equal(T.checkboxMinPt.def, 6.5);
  assert.equal(T.checkboxMinPt.fixed, true);
});

test('P3.2: _t returns def, with or without a calibration; an unknown name throws', function () {
  const imp = PdfImporter.create();
  const cal = { gaps: { wordEm: 0.3, letterEm: 0.02, n: 500 }, body: { size: 11, n: 4000 } };
  Object.keys(T).forEach(function (k) {
    assert.equal(imp._t(k), T[k].def, k);
    assert.equal(imp._t(k, { cal: cal, p: { num: 1 } }), T[k].def, k + ' (recorded, not applied)');
  });
  imp._cal = cal;
  assert.equal(imp._t('wordGapEm', { p: { num: 2 } }), 0.45);
  assert.throws(function () { imp._t('wordGapEM'); }, /unknown threshold "wordGapEM"/);
  assert.throws(function () { imp._t('nope', { cal: cal }); }, /unknown threshold/);
});

test('P3.2: _fire counts per rule with its pages; _rulesFinish writes r.rules, and r.calibration with debug', function () {
  const imp = PdfImporter.create();
  imp._rulesStart();
  imp._fire('a.rule', 2);
  imp._fire('a.rule', { p: { num: 1 } });
  imp._fire('a.rule', { num: 2 });
  imp._fire('b.rule');
  const r = imp._rulesFinish({});
  assert.deepEqual(r.rules, { 'a.rule': { count: 3, pages: [1, 2] }, 'b.rule': { count: 1, pages: [] } });
  assert.equal(r.calibration, undefined);
  // a new import starts again
  imp._rulesStart();
  assert.deepEqual(imp._rulesFinish({}).rules, {});

  const dbg = PdfImporter.create({ debug: true });
  dbg._cal = Object.freeze({ body: Object.freeze({ size: 11, n: 10 }) });
  const d = dbg._rulesFinish({});
  assert.deepEqual(d.rules, {});
  assert.equal(d.calibration.body.size, 11);
  assert.equal(Object.keys(d.calibration.thresholds).length, Object.keys(T).length);
  assert.deepEqual(d.calibration.thresholds.wordGapEm, { value: 0.45, def: 0.45, unit: 'em', from: 'def' });
  assert.equal(d.calibration.thresholds.checkboxMinPt.from, 'fixed');
});

test('P3.2: a line as ctx resolves to its page, not its list number', function () {
  const imp = PdfImporter.create();
  PdfImporter._defineThresholds({ zzPageProbe: { def: 1, unit: 'em', used: ['test'], on: true, calib: function (c, page) { return page; }, n: function () { return 99; } } });
  imp._cal = { regions: {} };
  assert.equal(imp._t('zzPageProbe', { num: 1, page: 2 }), 2);
  assert.equal(imp._t('zzPageProbe', { p: { num: 3 } }), 3);
  assert.equal(imp._t('zzPageProbe', { num: 4 }), 4);
});
