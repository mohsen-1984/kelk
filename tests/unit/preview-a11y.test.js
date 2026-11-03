/**
 * The preview pane's accessibility additions (plan P2.4, scripts/preview.js a11y()): task checkboxes named in
 * tight and loose lists, a tab stop only on a code block that really overflows, and none of it in what the
 * builders get (Kelk.preview.html) or in Copy (Kelk.preview.copyAll).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { appWindow } = require('./helpers');

const MD = [
  '# T',
  '',
  '- [ ] first loose item',
  '',
  '- [x] second loose item',
  '',
  'Tight:',
  '',
  '- [ ] tight one',
  '- [x] tight two',
  '  - [ ] nested',
  '',
  '```',
  'a very long line of code that is much wider than the box it is shown in, so it scrolls',
  '```',
  '',
  '```',
  'short',
  '```',
  ''
].join('\n');
const OPENED = { 'kelk.ui': JSON.stringify({ lang: 'en', sampleSeen: true }), 'kelk.content': MD };

test('task checkboxes are named, only an overflowing code block is a tab stop, Copy carries neither', async function () {
  const { window: w, errors } = await appWindow(OPENED);
  const K = w.Kelk;
  // no layout in jsdom: a block's content is 8 px per character, every box 300 px wide
  const P = w.HTMLElement.prototype;
  Object.defineProperty(P, 'scrollWidth', {
    configurable: true,
    get: function () {
      return /^(PRE|CODE)$/.test(this.tagName) ? this.textContent.length * 8 : 0;
    }
  });
  Object.defineProperty(P, 'clientWidth', {
    configurable: true,
    get: function () {
      return /^(PRE|CODE)$/.test(this.tagName) ? 300 : 0;
    }
  });
  K.preview.render();
  const box = w.document.getElementById('preview');

  const names = Array.from(box.querySelectorAll('input[type="checkbox"]')).map(function (i) {
    return i.parentNode.tagName + ':' + i.getAttribute('aria-label');
  });
  assert.deepEqual(names, ['P:first loose item', 'P:second loose item', 'LI:tight one', 'LI:tight two', 'LI:nested']);

  const pres = Array.from(box.querySelectorAll('pre'));
  assert.equal(pres.length, 2);
  const stop = function (pre) {
    return [pre].concat(Array.from(pre.querySelectorAll('code'))).filter(function (el) {
      return el.getAttribute('tabindex') === '0';
    }).length;
  };
  assert.equal(stop(pres[0]), 1, 'the long block: one tab stop');
  assert.equal(stop(pres[1]), 0, 'the short block: none');

  assert.ok(!/aria-label|tabindex|data-kelk-a11y/.test(K.preview.html()), 'not in the builders’ HTML');

  let copied = null;
  w.ClipboardItem = function (items) {
    this.items = items;
  };
  Object.defineProperty(w.navigator, 'clipboard', {
    configurable: true,
    value: {
      write: function (list) {
        copied = list[0].items['text/html'];
        return Promise.resolve();
      }
    }
  });
  await K.preview.copyAll();
  assert.ok(copied, 'Copy wrote HTML');
  const html = await copied.text();
  assert.ok(html.includes('first loose item'), 'the document is in it');
  assert.ok(!/aria-label|tabindex|data-kelk-a11y/.test(html), 'Copy carries none of the pane’s additions');
  assert.ok(box.querySelector('input[aria-label]'), 'the pane keeps them');
  assert.deepEqual(errors, []);
  w.close();
});
