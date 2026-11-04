/**
 * Builder cleanups (B6–B8): one named-color table for every builder, downloads that revoke their
 * blob URL only after a delay, and the importer's URI filter without its dead data: branch.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const LIB = path.join(ROOT, 'lib');
const BuilderBase = require('../../lib/BuilderBase.js');
const BidiCore = require('../../lib/BidiCore.js');

// ── B6: one NAMED_COLORS ────────────────────────────────────────────────────

test('B6: BuilderBase.NAMED_COLORS holds the 148 CSS named colors plus windowtext', function () {
  const C = BuilderBase.NAMED_COLORS;
  assert.equal(Object.keys(C).length, 149);
  assert.ok(Object.isFrozen(C));
  Object.keys(C).forEach(function (k) {
    assert.match(C[k], /^[0-9A-F]{6}$/, k);
  });
  // every name one of the old copies knew, with the value it had (DocxBuilder, PdfBuilder, BidiCore)
  const OLD = {
    black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', darkgreen: '006400',
    navy: '000080', maroon: '800000', orange: 'FFA500', yellow: 'FFFF00', gray: '808080', grey: '808080',
    silver: 'C0C0C0', purple: '800080', teal: '008080', darkred: '8B0000', darkblue: '00008B',
    lightgray: 'D3D3D3', lightgrey: 'D3D3D3', windowtext: '000000'
  };
  Object.keys(OLD).forEach(function (k) {
    assert.equal(C[k], OLD[k], k);
  });
});

test('B6: BuilderBase.colorHex reads names, #rgb, #rrggbb and rgb(); anything else is null', function () {
  const hex = BuilderBase.colorHex;
  assert.equal(hex('RebeccaPurple'), '663399');
  assert.equal(hex(' cornflowerblue '), '6495ED');
  assert.equal(hex('#abc'), 'AABBCC');
  assert.equal(hex('#C07030'), 'C07030');
  assert.equal(hex('rgb(255, 0, 128)'), 'FF0080');
  assert.equal(hex('rgba(255, 0, 128, 1)'), 'FF0080');
  assert.equal(hex('rgb(10 20 30)'), '0A141E');
  ['', null, undefined, 'auto', 'transparent', 'nocolor', '#12', 'toString', 'constructor'].forEach(function (v) {
    assert.equal(hex(v), null, String(v));
  });
});

test('B6: colorHex: a fully transparent color is no color; partial alpha is composited over white', function () {
  const hex = BuilderBase.colorHex;
  // alpha 0 in every syntax → null (DOCX: Word 'auto' / no fill; PDF: no fill), never black
  ['rgba(0,0,0,0)', 'rgba(0, 0, 0, 0.0)', 'rgb(0 0 0 / 0)', 'rgb(0 0 0 / 0%)', 'rgba(255,255,255,0)',
    '#0000', '#00000000', 'transparent', 'TRANSPARENT'].forEach(function (v) {
    assert.equal(hex(v), null, v);
  });
  // partial alpha: c·a + 255·(1 − a), the color the page shows on white
  assert.equal(hex('rgba(0, 0, 0, .05)'), 'F2F2F2');
  assert.equal(hex('rgba(0,0,0,0.5)'), '808080');
  assert.equal(hex('rgb(0 0 0 / 50%)'), '808080');
  assert.equal(hex('rgba(1 2 300 / .5)'), '8081FF');
  assert.equal(hex('#ff000080'), 'FF7F7F');
  assert.equal(hex('#f008'), 'FF7777');
  // alpha 1 (or more) and no alpha are the color itself
  assert.equal(hex('rgba(18, 52, 86, 1)'), '123456');
  assert.equal(hex('rgba(18, 52, 86, 2)'), '123456');
  assert.equal(hex('rgba(18, 52, 86, 100%)'), '123456');
  assert.equal(hex('#123456ff'), '123456');
});

test('B6: BidiCore.cssColorHex reads the same table (no copy of its own)', function () {
  ['teal', 'rebeccapurple', 'lightgrey', '#0f0', 'rgb(1,2,3)', 'bogus'].forEach(function (v) {
    assert.equal(BidiCore.cssColorHex(v), BuilderBase.colorHex(v), v);
  });
});

test('B6: no file in lib/ but BuilderBase.js carries a named-color table', function () {
  // a color table is recognised by its entries: a name of the table followed by a hex value
  const entry = /\b(darkgreen|cornflowerblue|silver|maroon)\s*:\s*'#?[0-9a-f]{6}'/i;
  const withTable = fs.readdirSync(LIB).filter(function (f) {
    return /\.js$/.test(f) && entry.test(fs.readFileSync(path.join(LIB, f), 'utf8'));
  });
  assert.deepEqual(withTable, ['BuilderBase.js']);
});

// ── B7: delayed revoke ──────────────────────────────────────────────────────

/** A jsdom document and stubbed blob URLs for one test; returns the log of calls. */
function downloadEnv(t) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const log = [];
  let n = 0;
  dom.window.HTMLAnchorElement.prototype.click = function () {
    log.push(['click', this.download, this.isConnected]);
  };
  t.mock.method(URL, 'createObjectURL', function () {
    const url = 'blob:kelk/' + ++n;
    log.push(['create', url]);
    return url;
  });
  t.mock.method(URL, 'revokeObjectURL', function (url) {
    log.push(['revoke', url]);
  });
  const prev = global.document;
  global.document = dom.window.document;
  t.after(function () {
    global.document = prev;
  });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  return { log: log, document: dom.window.document };
}

test('B7: BuilderBase.downloadBlob clicks a connected link and revokes its URL only after the delay', function (t) {
  const env = downloadEnv(t);
  const url = BuilderBase.downloadBlob(new Blob(['x']), 'a.docx');
  assert.deepEqual(env.log, [['create', url], ['click', 'a.docx', true]]);
  assert.equal(env.document.querySelectorAll('a').length, 0, 'the link is removed');
  t.mock.timers.tick(BuilderBase.REVOKE_DELAY - 1);
  assert.equal(env.log.length, 2, 'not revoked before the delay');
  t.mock.timers.tick(1);
  assert.deepEqual(env.log[2], ['revoke', url]);
  assert.ok(BuilderBase.REVOKE_DELAY >= 1000);
});

[
  ['DocxBuilder', 'document.docx'],
  ['WordHtmlBuilder', 'document.doc'],
  ['HtmlBuilder', 'document.html']
].forEach(function (c) {
  test('B7: ' + c[0] + '.save downloads through the delayed revoke', async function (t) {
    const Builder = require('../../lib/' + c[0] + '.js')[c[0]];
    const env = downloadEnv(t);
    const self = {
      toBlob: async function () {
        return new Blob(['x']);
      }
    };
    const ret = await Builder.prototype.save.call(self);
    assert.equal(ret, self, 'save() returns the builder');
    assert.deepEqual(env.log.map(function (e) { return e[0]; }), ['create', 'click']);
    assert.equal(env.log[1][1], c[1]);
    t.mock.timers.tick(BuilderBase.REVOKE_DELAY);
    assert.deepEqual(env.log.map(function (e) { return e[0]; }), ['create', 'click', 'revoke']);
  });
});

test('B7: no download helper in lib/ revokes its URL synchronously after click()', function () {
  fs.readdirSync(LIB).filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) {
    const src = fs.readFileSync(path.join(LIB, f), 'utf8');
    assert.doesNotMatch(src, /\.click\(\);[^]{0,120}?\n\s*URL\.revokeObjectURL\(/, f);
  });
});

// ── B8: the importer's URI filter ───────────────────────────────────────────

test('B8: MarkdownImporter keeps data: images, drops data: links and javascript:', function () {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
  const w = dom.window;
  w.eval(fs.readFileSync(path.join(ROOT, 'vendor/purify.min_3.4.16.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(LIB, 'MarkdownImporter.js'), 'utf8'));
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  const doc = new w.DOMParser().parseFromString('<p><img src="' + png + '" alt="i"><a href="' + png + '">d</a>'
    + '<a href="javascript:alert(1)">j</a><a href="https://example.org/">h</a><a href="#n">n</a></p>', 'text/html');
  w.MarkdownImporter.create()._sanitize(doc);
  assert.equal(doc.querySelector('img').getAttribute('src'), png);
  const hrefs = Array.from(doc.querySelectorAll('a')).map(function (a) { return a.getAttribute('href'); });
  assert.deepEqual(hrefs, [null, null, 'https://example.org/', '#n']);
  assert.doesNotMatch(fs.readFileSync(path.join(LIB, 'MarkdownImporter.js'), 'utf8'), /ALLOWED_URI_REGEXP:[^\n]*data:/);
});
