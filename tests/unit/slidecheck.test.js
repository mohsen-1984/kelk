/**
 * The slide-format check (scripts/slidecheck.js): lenient — the slides samples and short decks pass; a text with
 * no ## heading, one long slide, mostly overlong slides or a long opening before the first slide does not.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { check, LIMIT } = require('../../scripts/slidecheck.js');

const doc = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'docs', f), 'utf8');
const words = (n) => Array.from({ length: n }, (_, i) => 'word' + i).join(' ');
const codes = (r) => r.findings.map((f) => f.code);

test('the slides samples pass, in every language', function () {
  ['fa', 'en', 'ar'].forEach(function (l) {
    const r = check(doc('slides-sample.' + l + '.md'));
    assert.ok(r.ok, l + ': ' + JSON.stringify(r.findings));
    assert.ok(r.slides > 10);
  });
});

test('the about document (a document, not a deck) does not pass', function () {
  ['fa', 'en', 'ar'].forEach(function (l) { assert.equal(check(doc('about-kelk-and-samples.' + l + '.md')).ok, false, l); });
});

test('a short deck passes; front matter, comments and code are not prose', function () {
  const md = '---\ntitle: T\n---\n# Deck\n\nSubtitle\n\n## One\n\n<!-- layout: cards -->\n- **A** — a\n- **B** — b\n\n## Two\n\n```js\n' +
    words(400).replace(/ /g, '\n') + '\n```\n';
  const r = check(md);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.slides, 2);
});

test('a ## inside fenced code is no slide', function () {
  const r = check('Some text.\n\n```md\n## Not a slide\n```\n');
  assert.equal(r.slides, 0);
  assert.deepEqual(codes(r), ['noSlides']);
});

test('no ## heading: not in slide format', function () {
  const r = check('# Report\n\n' + words(50));
  assert.equal(r.ok, false);
  assert.deepEqual(codes(r), ['noSlides']);
});

test('one slide holding a long text: not in slide format', function () {
  const r = check('## Only\n\n' + words(LIMIT.oneSlideWords + 1));
  assert.equal(r.ok, false);
  assert.deepEqual(codes(r), ['oneSlide']);
});

test('lenient: one overlong slide among several is a note, most of them is a failure', function () {
  const one = check('## A\n\n' + words(LIMIT.slideWords + 10) + '\n\n## B\n\nx\n\n## C\n\ny\n');
  assert.ok(one.ok);
  assert.deepEqual(codes(one), ['longSlides']);
  assert.equal(one.findings[0].fail, false);
  const most = check('## A\n\n' + words(300) + '\n\n## B\n\n' + words(300) + '\n\n## C\n\ny\n');
  assert.equal(most.ok, false);
  assert.deepEqual([most.findings[0].n, most.findings[0].of], [2, 3]);
});

test('a long opening before the first slide: not in slide format', function () {
  const r = check('# Title\n\n' + words(LIMIT.introWords + 100) + '\n\n## A\n\nx\n\n## B\n\ny\n');
  assert.equal(r.ok, false);
  assert.deepEqual(codes(r), ['longIntro']);
});

test('before a PPTX export: a text that fits exports; one that no longer does shows the report, which can export anyway', async function () {
  const sc = require('../../scripts/slidecheck.js');
  const shown = [];
  let text = '# Deck\n\n## One\n\n- a\n\n## Two\n\n- b\n';
  globalThis.Kelk = {
    editor: { value: () => text },
    i18n: { t: (k) => k },
    ui: { report: { custom: (v) => { shown.push(v); }, close: () => {} } }
  };
  try {
    assert.equal(await sc.beforeExport(() => {}), true);
    assert.equal(shown.length, 0);
    text = '# Report\n\n' + words(400) + '\n';
    let anyway = 0;
    assert.equal(await sc.beforeExport(() => { anyway++; }), false);
    assert.equal(shown.length, 1);
    assert.equal(shown[0].brief(), 'sc_exportBrief');
    assert.equal(shown[0].buttons[0].label(), 'sc_exportAnyway');
    shown[0].buttons[0].run();
    assert.equal(anyway, 1);
  } finally { delete globalThis.Kelk; }
});
