/**
 * The held-out protocol (plan P4.3, tests/pdf-lab/scripts/heldout.js, env.js heldSplit / openHeld, docs/HELDOUT.md):
 * the split by document over the whole lab, its stability, the guard of the file-by-file tools, the opened-log line,
 * the Shamsi date, and golden.js keeping held-out goldens nameless. Names, hashes and means only — no per-file score.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// env.js makes LAB_OUT when loaded: a folder of the test's own
process.env.LAB_OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'kelk-heldout-out-'));
const H = require('../pdf-lab/scripts/heldout.js');
const env = require('../pdf-lab/scripts/env.js');

const PINNED = ['real-deck-fa', 'real-letter-ar', 'real-memo-fa', 'real-report-fa'];
// the 13 documents of P4.1's real-producer PDFs
const DOCS = ['real-deck-en', 'real-deck-fa', 'real-letter-ar', 'real-memo-fa', 'real-readme-en', 'real-report-fa', 'real-sheet-borders-fa',
  'real-sheet-plain-fa', 'word-rich', 'word-tables', 'xl-border-black', 'xl-border-none', 'xl-border-white'];
// names whose hash falls below (or above) the share, found deterministically
const named = (below, n) => { const out = []; for (let i = 0; out.length < n; i++) { const d = 'new-doc-' + i; if ((H.docHash(d) < H.REAL_SHARE) === below) out.push(d); } return out; };

test('P4.3: docOf takes the document after the producer; a name without -- is no document', function () {
  assert.equal(H.docOf('edge--real-memo-fa.pdf'), 'real-memo-fa');
  assert.equal(H.docOf('msprint-word--word-rich'), 'word-rich');
  assert.equal(H.docOf(path.join('pdf', 'real-producers', 'word2024-save--real-report-fa.PDF')), 'real-report-fa');
  assert.equal(H.docOf('a--b--c.pdf'), 'b--c');
  assert.equal(H.docOf('plain.pdf'), null);
  assert.equal(H.docOf('real-memo-fa'), null);
});

test('P4.3: docHash is fixed, in [0, 1), and changes with the salt', function () {
  const h = H.docHash('real-memo-fa');
  assert.equal(h, H.docHash('real-memo-fa'));
  assert.ok(h >= 0 && h < 1);
  assert.notEqual(H.docHash('real-memo-fa', 'other-salt'), h);
});

test('P4.3: the held-out documents are committed (HELD_DOCS), at least REAL_MIN of them stay held out', function () {
  assert.deepEqual(H.HELD_DOCS.slice().sort(), PINNED);
  assert.ok(H.HELD_DOCS.filter((d) => !H.REAL_OPENED.includes(d)).length >= H.REAL_MIN);
  assert.deepEqual(H.HELD_DOCS.filter((d) => H.REAL_OPENED.includes(d)), [], 'an opened document is taken out of HELD_DOCS');
});

test('P4.3: the split is by document, deterministic, independent of order and duplicates', function () {
  const a = H.splitDocs(DOCS), b = H.splitDocs(DOCS.slice().reverse().concat(DOCS, [null]));
  assert.deepEqual(a, b);
  assert.deepEqual(a.heldout, PINNED);
  assert.equal(a.heldout.length + a.dev.length, DOCS.length);
  DOCS.filter((d) => H.docHash(d) < H.REAL_SHARE).forEach((d) => assert.ok(a.heldout.includes(d), d));
});

test('P4.3: adding documents never moves a held one, nor a dev one — below or above the threshold', function () {
  const before = H.splitDocs(DOCS);
  const below = named(true, 6), above = named(false, 6);
  const after = H.splitDocs(DOCS.concat(below, above));
  before.heldout.forEach((d) => assert.ok(after.heldout.includes(d), d + ' stays held out'));
  before.dev.forEach((d) => assert.ok(after.dev.includes(d), d + ' stays dev'));
  below.forEach((d) => assert.ok(after.heldout.includes(d), d));
  above.forEach((d) => assert.ok(after.dev.includes(d), d));
  // even with a share that holds nothing new, the committed list stays held out (no fill, no eviction)
  assert.deepEqual(H.splitDocs(DOCS.concat(below), { share: 0 }).heldout, PINNED);
});

test('P4.3: an opened document moves to dev; no dev document is moved in to refill the held-out side', function () {
  const s = H.splitDocs(DOCS, { opened: ['real-memo-fa'], held: PINNED.filter((d) => d !== 'real-memo-fa') });
  assert.ok(s.dev.includes('real-memo-fa'));
  assert.deepEqual(s.heldout, PINNED.filter((d) => d !== 'real-memo-fa'));
  // opened wins over the list and over the hash
  assert.ok(H.splitDocs(DOCS, { opened: ['real-memo-fa'] }).dev.includes('real-memo-fa'));
  // only a NEW document refills it (by its hash)
  const nu = named(true, 1)[0];
  assert.deepEqual(H.splitDocs(DOCS.concat([nu]), { opened: ['real-memo-fa'] }).heldout, PINNED.filter((d) => d !== 'real-memo-fa').concat([nu]).sort());
});

test('P4.3: splitLab holds out every PDF of a held-out document wherever it lies; names without -- are not documents', function () {
  const pdfs = [['real-producers', 'edge--real-memo-fa.pdf'], ['real-producers', 'chrome--word-rich.pdf'], ['rtl', 'kelk--real-memo-fa.pdf'],
    ['producers', 'word16-x--real-letter-ar.pdf'], ['en', 'real-memo-fa.pdf'], ['en', 'chrome--article.pdf']]
    .map(([g, n]) => ({ name: n, file: path.join('/lab', g, n) }));
  const s = H.splitLab(pdfs, (n) => /^(edge|chrome)--(real|word)-/.test(n));
  assert.deepEqual(s.heldout.map((x) => x.name), ['edge--real-memo-fa.pdf', 'kelk--real-memo-fa.pdf', 'word16-x--real-letter-ar.pdf']);
  assert.deepEqual(s.dev.map((x) => x.name), ['chrome--word-rich.pdf']);
  assert.deepEqual(s.docs.heldout, PINNED);           // the committed list, whether or not a real-producer PDF of it is there
});

test('P4.3: the split of the real lab is pinned — a document changing sides must be a visible decision (docs/HELDOUT.md)', function () {
  const s = env.heldSplit();
  if (!s.heldout.length) return;                       // a checkout without the lab PDFs
  assert.deepEqual(s.docs.heldout, PINNED);
  // a document the hash rule holds out must be in the committed list (added in the change that brings it)
  assert.deepEqual(s.docs.heldout.filter((d) => !H.HELD_DOCS.includes(d)), []);
  // every lab PDF of a held-out document is held out, in any folder
  const held = new Set(s.heldout.map((x) => x.name));
  env.labPdfs().forEach((x) => assert.equal(held.has(x.name), PINNED.includes(H.docOf(x.name)), x.name));
  assert.equal(s.heldout.length, 17);
  assert.deepEqual(s.docs.dev, DOCS.filter((d) => !PINNED.includes(d)));
});

test('P4.3: openHeld logs a held-out fuzz file once and each held-out document once, and lets the rest pass', function () {
  const logged = [], orig = H.logOpened;
  H.logOpened = (o) => { logged.push(o.split); };
  try {
    const fz = path.join(env.FUZZ, 'heldout', 'fuzz-0001.pdf');
    assert.equal(env.isFuzzHeld(fz), true);
    assert.equal(env.isFuzzHeld(path.join(env.FUZZ, 'dev', 'fuzz-0001.pdf')), false);
    assert.equal(env.isFuzzHeld(path.join(env.OUT, 'fuzz-heldout', 'x.md')), true);
    const got = env.openHeld([fz, path.join(env.FUZZ, 'heldout', 'fuzz-0002.pdf'), '/x/edge--real-memo-fa.pdf', '/y/chrome--real-memo-fa.pdf',
      '/z/word16-x--real-letter-ar.md', '/x/chrome--word-rich.pdf', '/x/plain.pdf'], 'test');
    assert.equal(got.length, 5);
    assert.deepEqual(logged, ['fuzz:heldout (test)', 'real:real-memo-fa (test)', 'real:real-letter-ar (test)']);
    logged.length = 0;
    assert.deepEqual(env.openHeld(['/x/chrome--word-rich.pdf', path.join(env.FUZZ, 'dev', 'a.pdf')], 'test'), []);
    assert.deepEqual(logged, []);
  } finally { H.logOpened = orig; }
});

test('P4.3: golden.js hides held-out goldens (no row, no name in output or _scores.json)', function () {
  const G = require('../pdf-lab/scripts/golden.js');
  const struct = { edits: 1, headings: { missing: 0, extra: 0, changed: 0 }, tables: { missing: 0, extra: 0, changed: 0 }, lists: { missing: 0, extra: 1, changed: 0 } };
  const rows = [{ name: 'chrome--word-rich', ms: 5, total: 0.9, recall: 0.9, struct }];
  const heldRows = [{ name: 'edge--real-letter-ar', ms: 5, total: 0.8, rtl: 0.7, struct }, { name: 'edge--real-memo-fa', error: 'boom edge--real-memo-fa' }];
  const out = G.summarise({ rows, heldRows, dir: 'golden', lab: true, filter: null });
  const text = JSON.stringify(out) + '\n' + G.report(out).join('\n');
  ['real-letter-ar', 'real-memo-fa', 'boom'].forEach((s) => assert.ok(!text.includes(s), s + ' leaked'));
  assert.ok(text.includes('chrome--word-rich'));
  assert.deepEqual(out.rows.map((r) => r.name), ['chrome--word-rich']);
  assert.deepEqual(out.heldout, { n: 2, errors: 1, mean: { total: 0.4, rtl: 0.7, edits: 1 } });
});

test('P4.3: the Shamsi date and the opened-log line', function () {
  assert.equal(H.shamsi(new Date('2026-11-03T12:00:00Z')), '1405-08-12');
  assert.equal(H.shamsi(new Date('2026-03-21T12:00:00Z')), '1405-01-01');
  assert.equal(H.openedLine({ date: '1405-08-12', split: 'fuzz:heldout', user: 'Zarrabi', generator: 4, base: 100001 }),
    '1405-08-12\tfuzz:heldout\tZarrabi\tgenerator 4\tseed base 100001\n');
  assert.equal(H.openedLine({ date: '1405-08-12', split: 'real:x', user: 'u' }), '1405-08-12\treal:x\tu\tgenerator ?\tseed base -\n');
});

test('P4.3: the opened log lives in the repository (docs/reports); logOpened appends to it, openedLines reads it', function () {
  assert.equal(path.relative(path.join(__dirname, '..', '..'), H.OPENED_LOG).split(path.sep).join('/'), 'docs/reports/heldout-opened.log');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kelk-heldout-')), file = path.join(dir, 'reports', 'heldout-opened.log');
  const err = console.error;
  console.error = function () {};
  try {
    H.logOpened({ split: 'fuzz:heldout', generator: 4, base: 100001, user: 'a' }, file);
    H.logOpened({ split: 'fuzz:heldout', generator: 4, base: 100001, user: 'b' }, file);
  } finally { console.error = err; }
  const lines = H.openedLines(file);
  assert.equal(lines.length, 2);
  assert.match(lines[1], /^\d{4}-\d{2}-\d{2}\tfuzz:heldout\tb\tgenerator 4\tseed base 100001$/);
  assert.deepEqual(H.openedLines(path.join(dir, 'none.log')), []);
  fs.rmSync(dir, { recursive: true, force: true });
});
