/**
 * lib/BidiView.js (plan P2.4, found by tools/check-a11y.js): isolating a Latin link at the end of a right-to-left
 * sentence left an empty <a href> shell beside the isolate — a link with no name (axe link-name).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { ROOT } = require('./helpers');

function view(html) {
  const dom = new JSDOM('<div id="r">' + html + '</div>', { runScripts: 'outside-only' });
  const w = dom.window;
  w.eval(fs.readFileSync(path.join(ROOT, 'lib', 'BidiCore.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(ROOT, 'lib', 'BidiView.js'), 'utf8'));
  const root = w.document.getElementById('r');
  w.BidiView.apply(root, { dir: 'rtl' });
  return root;
}

test('a Latin link ending an RTL sentence: isolated whole, no empty link left', function () {
  const root = view(
    '<p>پیوند در متن فارسی: <a href="https://github.github.com/gfm/">GitHub Flavored Markdown</a>.</p>'
  );
  const links = Array.from(root.querySelectorAll('a'));
  assert.equal(links.length, 1, root.innerHTML);
  assert.equal(links[0].textContent, 'GitHub Flavored Markdown');
  assert.ok(links[0].closest('.bd-iso-ltr'), root.innerHTML);
});

test('an empty anchor target (<a id>) is kept', function () {
  const root = view('<p>متن <a id="here"></a>GitHub Flavored Markdown.</p>');
  assert.ok(root.querySelector('a#here'), root.innerHTML);
});
