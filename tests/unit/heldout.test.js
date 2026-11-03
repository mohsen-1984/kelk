/**
 * The held-out protocol's pure parts (plan P4.3, tests/pdf-lab/scripts/heldout.js, docs/HELDOUT.md): the
 * real-producer split by document, the opened-log line, the Shamsi date.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const H = require('../pdf-lab/scripts/heldout.js');

// the 13 documents of P4.1's real-producer PDFs
const DOCS = ['real-deck-en', 'real-deck-fa', 'real-letter-ar', 'real-memo-fa', 'real-readme-en', 'real-report-fa', 'real-sheet-borders-fa',
  'real-sheet-plain-fa', 'word-rich', 'word-tables', 'xl-border-black', 'xl-border-none', 'xl-border-white'];

test('P4.3: docOf takes the document after the producer, with or without .pdf or a folder', function () {
  assert.equal(H.docOf('edge--real-memo-fa.pdf'), 'real-memo-fa');
  assert.equal(H.docOf('msprint-word--word-rich'), 'word-rich');
  assert.equal(H.docOf(path.join('pdf', 'real-producers', 'word2024-save--real-report-fa.PDF')), 'real-report-fa');
  assert.equal(H.docOf('a--b--c.pdf'), 'b--c');
  assert.equal(H.docOf('plain.pdf'), 'plain');
});

test('P4.3: docHash is fixed, in [0, 1), and changes with the salt', function () {
  const h = H.docHash('real-memo-fa');
  assert.equal(h, H.docHash('real-memo-fa'));
  assert.ok(h >= 0 && h < 1);
  assert.notEqual(H.docHash('real-memo-fa', 'other-salt'), h);
});

test('P4.3: the split is by document, deterministic, independent of order and duplicates, and holds out at least 4', function () {
  const a = H.splitDocs(DOCS), b = H.splitDocs(DOCS.slice().reverse().concat(DOCS));
  assert.deepEqual(a, b);
  assert.ok(a.heldout.length >= H.REAL_MIN);
  assert.equal(a.heldout.length + a.dev.length, DOCS.length);
  assert.deepEqual(a.heldout.filter((d) => a.dev.includes(d)), []);
  // below the threshold is always held out
  DOCS.filter((d) => H.docHash(d) < H.REAL_SHARE).forEach((d) => assert.ok(a.heldout.includes(d), d));
});

test('P4.3: the current split is pinned — a document changing sides must be a visible decision (docs/HELDOUT.md)', function () {
  assert.deepEqual(H.splitDocs(DOCS).heldout, ['real-deck-fa', 'real-letter-ar', 'real-memo-fa', 'real-report-fa']);
});

test('P4.3: a document added later keeps the others on their sides when it falls above the threshold', function () {
  const before = H.splitDocs(DOCS);
  // a name whose hash is above the share: found deterministically
  let extra = null;
  for (let i = 0; !extra; i++) if (H.docHash('new-doc-' + i) >= H.REAL_SHARE) extra = 'new-doc-' + i;
  const after = H.splitDocs(DOCS.concat([extra]));
  assert.deepEqual(after.heldout, before.heldout);
  assert.ok(after.dev.includes(extra));
});

test('P4.3: an opened document goes to dev; the minimum fills from the lowest hashes; share and min are options', function () {
  const opened = H.splitDocs(DOCS, { opened: ['real-memo-fa'] });
  assert.ok(opened.dev.includes('real-memo-fa'));
  assert.ok(!opened.heldout.includes('real-memo-fa'));
  assert.ok(opened.heldout.length >= H.REAL_MIN);
  assert.deepEqual(H.splitDocs(DOCS, { share: 0, min: 0 }).heldout, []);
  assert.equal(H.splitDocs(DOCS, { share: 1 }).dev.length, 0);
  assert.equal(H.splitDocs(['a', 'b'], { share: 0 }).heldout.length, 2);     // min capped by the documents there are
});

test('P4.3: splitRealPdfs keeps all PDFs of a document on one side and leaves other groups alone', function () {
  const producers = ['edge', 'chrome', 'firefox', 'msprint-word', 'word2024-save'];
  const pdfs = DOCS.flatMap((d) => producers.map((p) => ({ name: p + '--' + d + '.pdf', file: '/x/' + p + '--' + d + '.pdf' })))
    .concat([{ name: 'chrome--article.pdf', file: '/y' }]);
  const s = H.splitRealPdfs(pdfs, (n) => n !== 'chrome--article.pdf');
  assert.equal(s.heldout.length + s.dev.length, pdfs.length - 1);
  DOCS.forEach((d) => {
    const sides = new Set(s.heldout.filter((x) => H.docOf(x.name) === d).length ? ['h'] : []);
    if (s.dev.some((x) => H.docOf(x.name) === d)) sides.add('d');
    assert.equal(sides.size, 1, d);
  });
  assert.ok(!s.heldout.concat(s.dev).some((x) => x.name === 'chrome--article.pdf'));
});

test('P4.3: the Shamsi date and the opened-log line', function () {
  assert.equal(H.shamsi(new Date('2026-11-03T12:00:00Z')), '1405-08-12');
  assert.equal(H.shamsi(new Date('2026-03-21T12:00:00Z')), '1405-01-01');
  assert.equal(H.openedLine({ date: '1405-08-12', split: 'fuzz:heldout', user: 'Zarrabi', generator: 4, base: 100001 }),
    '1405-08-12\tfuzz:heldout\tZarrabi\tgenerator 4\tseed base 100001\n');
  assert.equal(H.openedLine({ date: '1405-08-12', split: 'real:x', user: 'u' }), '1405-08-12\treal:x\tu\tgenerator ?\tseed base -\n');
});

test('P4.3: logOpened appends to <out>/heldout-opened.log', function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kelk-heldout-'));
  const err = console.error;
  console.error = function () {};
  try {
    H.logOpened(dir, { split: 'fuzz:heldout', generator: 4, base: 100001, user: 'a' });
    H.logOpened(dir, { split: 'fuzz:heldout', generator: 4, base: 100001, user: 'b' });
  } finally { console.error = err; }
  const lines = fs.readFileSync(path.join(dir, 'heldout-opened.log'), 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[1], /^\d{4}-\d{2}-\d{2}\tfuzz:heldout\tb\tgenerator 4\tseed base 100001$/);
  fs.rmSync(dir, { recursive: true, force: true });
});
