/**
 * The PDF import report (plan P3.5): Kelk.importReport.fromResult (PdfImporter's result → the P3.4 contract, with
 * or without r.report), the panel Kelk.ui.report (a row for every code, in fa / en / ar; its buttons; the focus),
 * and the import that opens it instead of toasts.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { appWindow } = require('./helpers');
const SAMPLE = require('../../tools/report-sample.js');

const OPENED = { 'kelk.ui': JSON.stringify({ lang: 'en', sampleSeen: true }), 'kelk.content': '# Title\n\nText.' };
const clone = function (o) {
  return JSON.parse(JSON.stringify(o));
};

/** A PdfImporter stand-in: create(opts) and fromArrayBuffer(buf, hooks) recorded, `result` returned. */
function fakePdf(w, result) {
  const calls = [];
  w.Kelk.libs.need = function (name) {
    if (name === 'pdfimport') {
      w.PdfImporter = {
        create: function (opts) {
          const call = { opts: opts };
          calls.push(call);
          return {
            fromArrayBuffer: function (buf, hooks) {
              call.bytes = Array.from(new Uint8Array(buf));
              call.hooks = hooks;
              return Promise.resolve(typeof result === 'function' ? result(opts) : result);
            }
          };
        }
      };
    }
    return Promise.resolve();
  };
  return calls;
}

const pdfFile = function (w, name) {
  return new w.File(['%PDF-1.7 kelk'], name || 'doc.pdf', { type: 'application/pdf' });
};
const toasts = function (w) {
  return Array.from(w.document.querySelectorAll('#toasts .toast')).map(function (t) {
    return t.textContent;
  });
};

test('fromResult: a result without r.report → the contract, from r.notes, r.quality.flags and r.failedPages', async function () {
  const { window: w } = await appWindow(OPENED);
  const R = w.Kelk.importReport;
  const rep = R.fromResult({
    notes: ['printNoLinks', 'suspectSpaces', 'pageFailed', 'printNoLinks'],
    quality: { pages: [{ page: 1 }, { page: 2 }, { page: 4 }], flags: { suspectSpaces: [4, 2, 2] } },
    failedPages: [3]
  });
  assert.deepEqual(clone(rep), {
    mode: 'full',
    summary: { pages: 4, full: 3, simplified: 0, textContent: 0, ocr: 0, failed: 1, conf: null },
    pages: [],
    flags: [{ code: 'suspectSpaces', pages: [2, 4] }],
    // a flag is shown once (as a flag), a code once, pageFailed with its pages
    notes: [{ code: 'printNoLinks' }, { code: 'pageFailed', pages: [3] }]
  });
  assert.equal(R.worth(rep), true);
  // per-page modes (r.pages) without r.report: the pages not read in full, the mean confidence
  const per = R.fromResult({
    pages: [
      { page: 1, mode: 'full', conf: 0.9 },
      { page: 2, mode: 'textContent', conf: 0.3 }
    ],
    notes: []
  });
  assert.deepEqual(clone(per.pages), [{ page: 2, mode: 'textContent', conf: 0.3, why: [] }]);
  assert.equal(per.summary.textContent, 1);
  assert.equal(Math.round(per.summary.conf * 100), 60);
  w.close();
});

test('fromResult: r.report is taken (normalised); clean imports and a Kelk source are not worth a panel', async function () {
  const { window: w } = await appWindow(OPENED);
  const R = w.Kelk.importReport;
  const rep = R.fromResult({ report: clone(SAMPLE), notes: ['noText'], failedPages: [99] });
  assert.equal(rep.mode, 'auto');
  assert.deepEqual(clone(rep.summary), SAMPLE.summary);
  assert.deepEqual(clone(rep.pages), SAMPLE.pages);
  assert.deepEqual(clone(rep.flags), SAMPLE.flags);
  assert.deepEqual(clone(rep.notes), SAMPLE.notes, 'the report wins over the older fields');
  // a report with gaps: lists always there, a 'full' page and a flag repeated as a note left out
  const thin = R.fromResult({
    report: {
      mode: 'safe',
      pages: [{ page: 1, mode: 'full', conf: 1 }],
      notes: [{ code: 'lostGlyphs' }],
      flags: [{ code: 'lostGlyphs', pages: [1] }]
    }
  });
  assert.deepEqual(clone(thin.pages), []);
  assert.deepEqual(clone(thin.notes), []);
  assert.equal(thin.summary.pages, 0);
  assert.equal(
    R.worth(R.fromResult({ notes: [], quality: { pages: [{ page: 1 }], flags: {} }, failedPages: [] })),
    false,
    'clean'
  );
  assert.equal(R.worth(R.fromResult({ source: 'kelk', notes: ['kelkSource'] })), false, 'Kelk source');
  assert.equal(
    R.worth(
      R.fromResult({
        source: 'kelk',
        report: { mode: 'auto', summary: { pages: 3, full: 3 }, pages: [], flags: [], notes: [] }
      })
    ),
    false
  );
  assert.equal(R.worth(R.fromResult({})), false, 'an empty result');
  w.close();
});

test('the sample report holds every mode, why, flag and note code the panel knows', async function () {
  const { window: w } = await appWindow(OPENED);
  const R = w.Kelk.importReport;
  const modes = new Set(SAMPLE.pages.map((p) => p.mode));
  R.MODES.filter((m) => m !== 'full').forEach((m) => assert.ok(modes.has(m), 'mode ' + m));
  const why = new Set([].concat(...SAMPLE.pages.map((p) => p.why)));
  Object.keys(R.WHY).forEach((k) => assert.ok(why.has(k), 'why ' + k));
  ['lowConf', 'suspectSpaces', 'lostGlyphs', 'layoutFailed', 'extractFailed', 'noText', 'safeMode'].forEach((k) =>
    assert.ok(Object.prototype.hasOwnProperty.call(R.WHY, k), 'the contract’s why ' + k + ' is translated')
  );
  assert.deepEqual(SAMPLE.flags.map((f) => f.code).sort(), Object.keys(R.FLAGS).sort());
  assert.deepEqual(SAMPLE.notes.map((n) => n.code).sort(), Object.keys(R.NOTES).sort());
  // every r.notes code PdfImporter names (lib/PdfImporter.js) has a row
  ['noText', 'pageLimit', 'figureFailed', 'kelkSource', 'printNoLinks', 'ocrLayer', 'pageFailed'].forEach((k) =>
    assert.ok(Object.prototype.hasOwnProperty.call(R.NOTES, k), 'note ' + k)
  );
  w.close();
});

for (const lang of ['fa', 'en', 'ar']) {
  test('the panel shows a row for every page and code of the sample, translated (' + lang + ')', async function () {
    const { window: w, errors } = await appWindow({
      'kelk.ui': JSON.stringify({ lang: lang, sampleSeen: true }),
      'kelk.content': 'x'
    });
    const K = w.Kelk,
      d = w.document;
    const box = d.getElementById('import-report');
    assert.equal(box.hidden, true, 'hidden at startup');
    assert.equal(box.getAttribute('role'), 'region');
    assert.ok(d.getElementById(box.getAttribute('aria-labelledby')).textContent.trim(), 'an accessible name');
    assert.equal(box.querySelector('[aria-live]'), null, 'no live region of its own');
    assert.equal(K.ui.report(clone(SAMPLE), { name: 'sample.pdf', onSafe: function () {} }), true);
    assert.equal(box.hidden, false);
    assert.equal(box.querySelectorAll('.report-pages tbody tr').length, SAMPLE.pages.length);
    SAMPLE.flags.concat(SAMPLE.notes).forEach(function (f) {
      const li = box.querySelector('.report-findings [data-code="' + f.code + '"]');
      assert.ok(li, 'a row for ' + f.code);
      assert.ok(li.textContent.length > 10);
      if (f.pages) assert.ok(li.textContent.includes(String(f.pages[0])), f.code + ' names its pages');
    });
    const text = box.textContent;
    assert.doesNotMatch(text, /\b(rep|pdf)_\w+/, 'no key shown as it is');
    SAMPLE.pages.forEach(function (p) {
      p.why.forEach(function (k) {
        assert.ok(text.includes(K.i18n.t(K.importReport.WHY[k])), 'why ' + k);
      });
    });
    assert.equal(d.getElementById('report-safe').hidden, false);
    assert.equal(d.getElementById('import-report-name').textContent, 'sample.pdf');
    // the language switch: the panel's words again
    const before = text;
    K.i18n.apply(lang === 'en' ? 'fa' : 'en');
    K.ui.report.refresh();
    assert.notEqual(box.textContent, before);
    assert.deepEqual(errors, []);
    w.close();
  });
}

test('the panel: focus in on open, back on close (×, Escape); Copy report; Re-import in safe mode', async function () {
  const { window: w, errors } = await appWindow(OPENED);
  const K = w.Kelk,
    d = w.document;
  const box = d.getElementById('import-report');
  const from = d.getElementById('btn-import');
  from.focus();
  K.ui.report(clone(SAMPLE), { name: 'a.pdf' });
  assert.equal(d.activeElement, box, 'the focus moves to the panel');
  assert.equal(d.getElementById('report-safe').hidden, true, 'no safe-mode button without an action');
  box.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(box.hidden, true, 'Escape closes');
  assert.equal(d.activeElement, from, 'the focus goes back');

  K.ui.report(clone(SAMPLE), { name: 'a.pdf' });
  d.getElementById('import-report-close').focus();
  d.getElementById('import-report-close').click();
  assert.equal(box.hidden, true);
  assert.equal(d.activeElement, from, '× : the focus goes back');

  // Copy report: the plain text on the clipboard, a toast
  let copied = null;
  Object.defineProperty(w.navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: function (s) {
        copied = s;
        return Promise.resolve();
      }
    }
  });
  K.ui.report(clone(SAMPLE), { name: 'a.pdf' });
  d.getElementById('report-copy').click();
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(copied && copied.startsWith(K.i18n.t('rep_title') + '\n'), 'the title first');
  assert.match(copied, /a\.pdf/);
  assert.match(copied, /- Page 3: simplified, 41% — low confidence, missing word spaces/);
  assert.ok(copied.includes(K.i18n.t('pdf_printNoLinks')));
  assert.doesNotMatch(copied, /<|\b(rep|pdf)_\w+/, 'plain text, no keys');
  assert.ok(toasts(w).some((t) => t.includes(K.i18n.t('copied'))));

  // Re-import in safe mode: its action runs, the panel closes; a report that ran in safe mode has no button
  let safe = 0;
  K.ui.report(clone(SAMPLE), { name: 'a.pdf', onSafe: () => safe++ });
  d.getElementById('report-safe').click();
  assert.equal(safe, 1);
  assert.equal(box.hidden, true);
  K.ui.report(Object.assign(clone(SAMPLE), { mode: 'safe' }), { name: 'a.pdf', onSafe: () => safe++ });
  assert.equal(d.getElementById('report-safe').hidden, true);
  assert.ok(box.textContent.includes(K.i18n.t('rep_safeMode')));
  // nothing to tell: no panel (and an open one closes)
  assert.equal(K.ui.report({ mode: 'auto', summary: { pages: 2, full: 2 }, pages: [], flags: [], notes: [] }), false);
  assert.equal(box.hidden, true);
  assert.deepEqual(errors, []);
  w.close();
});

test('a PDF import opens the report instead of toasts; Re-import in safe mode re-reads the same bytes', async function () {
  const { window: w, errors } = await appWindow(OPENED);
  const K = w.Kelk,
    d = w.document;
  const calls = fakePdf(w, function (opts) {
    return opts.mode === 'safe'
      ? {
          markdown: '# Safe\n',
          notes: [],
          messages: [],
          report: {
            mode: 'safe',
            summary: { pages: 2, full: 0, simplified: 2 },
            pages: [
              { page: 1, mode: 'simplified', conf: 0.5, why: ['safeMode'] },
              { page: 2, mode: 'simplified', conf: 0.5, why: ['safeMode'] }
            ],
            flags: [],
            notes: []
          }
        }
      : {
          markdown: '# Full\n',
          notes: ['printNoLinks', 'suspectSpaces'],
          messages: [],
          quality: { pages: [{ page: 1 }, { page: 2 }], flags: { suspectSpaces: [2] } },
          failedPages: []
        };
  });
  await K.importer.fromFile(pdfFile(w));
  assert.equal(K.editor.value(), '# Full\n');
  const box = d.getElementById('import-report');
  assert.equal(box.hidden, false, 'the panel is open');
  assert.equal(d.activeElement, box);
  assert.ok(box.querySelector('[data-code="printNoLinks"]') && box.querySelector('[data-code="suspectSpaces"]'));
  const shown = toasts(w);
  assert.ok(
    !shown.some((t) => t.includes(K.i18n.t('pdf_printNoLinks')) || t.includes('Word spaces')),
    'no note toasts: ' + shown
  );
  assert.equal(calls[0].opts.mode, undefined, 'the importer’s own default mode');

  d.getElementById('report-safe').click();
  await new Promise((r) => setTimeout(r, 20));
  for (let i = 0; i < 50 && calls.length < 2; i++) await new Promise((r) => setTimeout(r, 10));
  await K.ui._tasks;
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(calls.length, 2);
  assert.equal(calls[1].opts.mode, 'safe');
  assert.equal(calls[1].hooks.mode, 'safe');
  assert.deepEqual(calls[1].bytes, calls[0].bytes, 'the same file bytes');
  assert.equal(K.editor.value(), '# Safe\n');
  assert.equal(box.hidden, false, 'the safe import has its own report');
  assert.equal(d.getElementById('report-safe').hidden, true);

  // a clean import: the old report goes, nothing new shows
  fakePdf(w, {
    markdown: '# Clean\n',
    notes: [],
    messages: [],
    quality: { pages: [{ page: 1 }], flags: {} },
    failedPages: []
  });
  await K.importer.fromFile(pdfFile(w, 'clean.pdf'));
  assert.equal(K.editor.value(), '# Clean\n');
  assert.equal(box.hidden, true);
  assert.deepEqual(errors, []);
  w.close();
});
