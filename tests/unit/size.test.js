/**
 * tools/check-size.js: which files count as startup bytes, and the exit code against the budget.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT } = require('./helpers');
const { startupFiles, cssImports, measure } = require('../../tools/check-size.js');

const TOOL = path.join(ROOT, 'tools', 'check-size.js');

test('startupFiles: script src and stylesheet links, in order; comments, inline scripts and other links skipped', function () {
  const html = [
    '<head><script src="scripts/boot.js"></script>',
    "<link rel='stylesheet' href='styles/a.css'>",
    '<link href="styles/b.css" rel="preload stylesheet" media="all">',
    '<link rel="icon" href="data:image/svg+xml,x"><link rel="canonical" href="https://x/">',
    '<!-- <script src="vendor/old.js"></script> <link rel="stylesheet" href="old.css"> -->',
    '<script>inline()</script><script type="application/json" id="d">{}</script></head>',
    '<body><SCRIPT defer SRC=lib/X.js></SCRIPT></body>'
  ].join('\n');
  assert.deepEqual(startupFiles(html), [
    { kind: 'js', href: 'scripts/boot.js' },
    { kind: 'css', href: 'styles/a.css' },
    { kind: 'css', href: 'styles/b.css' },
    { kind: 'js', href: 'lib/X.js' }
  ]);
});

test('cssImports: @import with and without url(), comments ignored', function () {
  assert.deepEqual(
    cssImports('/* @import "no.css"; */ @import "a.css"; @import url(b.css) screen; @import url(\'c.css\');'),
    ['a.css', 'b.css', 'c.css']
  );
});

test('measure: sizes, @import followed, a file counted once, remote and missing reported', function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kelk-size-'));
  fs.mkdirSync(path.join(dir, 'styles'));
  fs.writeFileSync(
    path.join(dir, 'index.html'),
    '<link rel="stylesheet" href="styles/a.css"><script src="x.js"></script><script src="x.js"></script>' +
      '<script src="https://cdn.example/y.js"></script><script src="gone.js"></script>'
  );
  fs.writeFileSync(path.join(dir, 'styles', 'a.css'), '@import "b.css";');
  fs.writeFileSync(path.join(dir, 'styles', 'b.css'), 'p{}');
  fs.writeFileSync(path.join(dir, 'x.js'), '12345');
  const r = measure(dir);
  assert.deepEqual(r.files, [
    { kind: 'css', file: 'styles/a.css', bytes: 16 },
    { kind: 'css', file: 'styles/b.css', bytes: 3 },
    { kind: 'js', file: 'x.js', bytes: 5 }
  ]);
  assert.deepEqual(r.remote, ['https://cdn.example/y.js']);
  assert.deepEqual(r.missing, ['gone.js']);
});

test('the repository: measured; a budget one byte under the total fails with exit 1, the total itself passes', function () {
  const ok = spawnSync(process.execPath, [TOOL, '--budget', '1e12'], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const total = Number(/startup JS \+ CSS: ([\d,]+) bytes/.exec(ok.stdout)[1].replace(/,/g, ''));
  assert.ok(total > 100000, 'index.html loads its scripts');
  const low = spawnSync(process.execPath, [TOOL, '--budget', String(total - 1)], { encoding: 'utf8' });
  assert.equal(low.status, 1, low.stdout);
  assert.match(low.stdout, /FAIL: .* > budget/);
  const exact = spawnSync(process.execPath, [TOOL, '--budget', String(total)], { encoding: 'utf8' });
  assert.equal(exact.status, 0, exact.stdout);
});
