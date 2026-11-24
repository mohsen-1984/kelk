/**
 * The PDF import report: Kelk.importReport.fromResult (PdfImporter's result → the import report contract, with
 * or without r.report), the panel Kelk.ui.report (a row for every code, in fa / en / ar; its buttons; the focus),
 * and the import that opens it instead of toasts.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const helpers = require('./helpers');
/** the app's page, with scripts/ocrreport.js in it as a PDF import loads it (its words: the sample's OCR notes) */
async function appWindow(state) {
  const r = await helpers.appWindow(state);
  ocrUi(r.window);
  return r;
}
const SAMPLE = require('../../tools/report-sample.js');

const LIB = path.resolve(__dirname, '..', '..', 'lib');
/** the sample's pages as the panel takes them: a page that failed has the mode 'failed' */
const SAMPLE_PAGES = SAMPLE.pages.map(function (p) {
  return { page: p.page, mode: p.failed ? 'failed' : p.mode, conf: p.conf, why: p.why };
});

/**
 * Every r.notes code the importer can emit: each `_note('code'` of lib/ (*.js), and the codes of the two calls that
 * compute theirs — the quality flags (PdfImporter#_qualityNotes, its TEXT table) and the ladder's page notes
 * (ladder.js, its NOTE table). Another computed `_note(` fails here, to be taught to this function. Plus codes a
 * pending importer change adds (watermarkDropped).
 */
function libNoteCodes() {
  const files = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.js$/.test(e.name)) files.push(p);
    });
  })(LIB);
  const codes = new Set(['watermarkDropped']),
    computed = [];
  files.forEach(function (f) {
    const src = fs.readFileSync(f, 'utf8'),
      rel = path.relative(LIB, f).replace(/\\/g, '/');
    for (const m of src.matchAll(/\b_note\(\s*([^,)]*)/g)) {
      const arg = m[1].trim();
      const lit = /^'(\w+)'$/.exec(arg);
      if (lit) codes.add(lit[1]);
      else if (!(rel === 'PdfImporter.js' && /^code$/.test(arg) && /_note\(code, text, pages\)\s*\{/.test(src.slice(m.index, m.index + 40))))
        computed.push(rel + ': _note(' + arg);
    }
  });
  const known = { 'PdfImporter.js: _note(code': 'quality', 'pdfimport/ladder.js: _note(NOTE[0]': 'ladder' };
  computed.forEach(function (c) {
    assert.ok(Object.prototype.hasOwnProperty.call(known, c), 'a computed note code the test does not know: ' + c);
  });
  const imp = fs.readFileSync(path.join(LIB, 'PdfImporter.js'), 'utf8');
  const q = /_qualityNotes\(\)\s*\{[\s\S]*?const TEXT = \{([\s\S]*?)\};/.exec(imp);
  assert.ok(q, 'PdfImporter#_qualityNotes: its TEXT table');
  for (const m of q[1].matchAll(/^\s*(\w+):/gm)) codes.add(m[1]);
  const lad = fs.readFileSync(path.join(LIB, 'pdfimport', 'ladder.js'), 'utf8');
  const n = /const NOTE = \{([\s\S]*?)\}\[rec\.mode\]/.exec(lad);
  assert.ok(n, 'ladder.js: its NOTE table');
  for (const m of n[1].matchAll(/\w+:\s*\['(\w+)'/g)) codes.add(m[1]);
  return Array.from(codes).sort();
}

const OPENED = { 'kelk.ui': JSON.stringify({ lang: 'en', sampleSeen: true }), 'kelk.content': '# Title\n\nText.' };
const clone = function (o) {
  return JSON.parse(JSON.stringify(o));
};

/** scripts/ocrreport.js in the page, as Kelk.libs.need('ocrreport') loads it with the PDF importer (3.4) */
const OCR_UI = fs.readFileSync(path.resolve(__dirname, '..', '..', 'scripts', 'ocrreport.js'), 'utf8');
function ocrUi(w) {
  if (!w.Kelk.ocrReport) w.eval(OCR_UI);
  return w.Kelk.ocrReport;
}

/** A PdfImporter stand-in: create(opts) and fromArrayBuffer(buf, hooks) recorded, `result` returned. */
function fakePdf(w, result) {
  const calls = [];
  w.Kelk.libs.need = function (name) {
    if (name === 'ocrreport') ocrUi(w);
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
    summary: { pages: 4, full: 3, simplified: 0, textContent: 0, ocr: 0, scan: 0, failed: 1, conf: null },
    pages: [],
    flags: [{ code: 'suspectSpaces', pages: [2, 4] }],
    ocr: [],
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
  assert.deepEqual(clone(rep.pages), SAMPLE_PAGES, 'a page that failed is not shown as simplified');
  assert.deepEqual(clone(rep.flags), SAMPLE.flags);
  assert.deepEqual(clone(rep.notes), SAMPLE.notes, 'the report wins over the older fields');
  assert.deepEqual(clone(rep.ocr), SAMPLE.ocr, 'the pages read with OCR: a list of their own');
  // OCR alone is worth a panel; a report from before 3.4 has an empty list
  assert.equal(R.worth(R.fromResult({ report: { summary: { pages: 1, ocr: 1 }, pages: [{ page: 1, mode: 'ocr', conf: 0.9, why: ['noText'] }], ocr: [{ page: 1, conf: 0.9, lines: 3, notes: [] }], notes: [] } })), true);
  assert.deepEqual(clone(R.fromResult({ report: { pages: [], notes: [] } }).ocr), []);
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
  // the informational notes alone open no panel; with a finding they are listed (after it)
  assert.equal(R.worth(R.fromResult({ notes: ['kelkMath', 'monoBody', 'kelkSource'] })), false, 'quiet notes');
  assert.equal(R.worth(R.fromResult({ notes: ['kelkMath', 'printNoLinks'] })), true);
  assert.equal(R.worth(R.fromResult({ notes: ['someNewCode'] })), true, 'a code without words is shown');
  // a failed page in the older fields (r.pages + r.failedPages): 'failed' too
  const old = R.fromResult({ pages: [{ page: 1, mode: 'full', conf: 1 }, { page: 2, mode: 'simplified', conf: 0 }], failedPages: [2] });
  assert.deepEqual(clone(old.pages), [{ page: 2, mode: 'failed', conf: 0, why: [] }]);
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
  const R = w.Kelk.importReport, OCR = ocrUi(w);
  const modes = new Set(SAMPLE_PAGES.map((p) => p.mode));
  Object.keys(R.MODE_KEYS)
    .filter((m) => m !== 'full')
    .forEach((m) => assert.ok(modes.has(m), 'mode ' + m));
  R.MODES.forEach((m) => assert.ok(Object.prototype.hasOwnProperty.call(R.MODE_KEYS, m), 'a label for mode ' + m));
  const why = new Set([].concat(...SAMPLE.pages.map((p) => p.why)));
  Object.keys(R.WHY).forEach((k) => assert.ok(why.has(k), 'why ' + k));
  const ocrNotes = new Set([].concat(...SAMPLE.ocr.map((x) => x.notes)));
  Object.keys(OCR.NOTES).forEach((k) => assert.ok(ocrNotes.has(k), 'OCR note ' + k));
  ['noLines', 'lowConf', 'failed'].forEach((k) => assert.ok(Object.prototype.hasOwnProperty.call(OCR.NOTES, k), 'the contract’s OCR note ' + k + ' is translated'));
  ['lowConf', 'suspectSpaces', 'lostGlyphs', 'layoutFailed', 'extractFailed', 'noText', 'safeMode'].forEach((k) =>
    assert.ok(Object.prototype.hasOwnProperty.call(R.WHY, k), 'the contract’s why ' + k + ' is translated')
  );
  assert.deepEqual(SAMPLE.flags.map((f) => f.code).sort(), Object.keys(R.FLAGS).sort());
  assert.deepEqual(SAMPLE.notes.map((n) => n.code).sort(), Object.keys(R.NOTES).sort());
  // every r.notes code the importer emits (each `_note(` of lib/) has words: a note or a quality flag
  const codes = libNoteCodes();
  ['noText', 'pageLimit', 'figureFailed', 'kelkSource', 'printNoLinks', 'ocrLayer', 'pageFailed', 'kelkMath', 'monoBody'].forEach((k) =>
    assert.ok(codes.includes(k), 'the grep finds ' + k)
  );
  codes.forEach((k) =>
    assert.ok(
      Object.prototype.hasOwnProperty.call(R.NOTES, k) || Object.prototype.hasOwnProperty.call(R.FLAGS, k),
      'note ' + k + ' (lib/) has no words in scripts/report.js'
    )
  );
  const strings = w.Kelk.i18n._strings;
  Object.keys(R.NOTES).forEach((k) =>
    ['fa', 'en', 'ar'].forEach((l) => assert.ok(strings[l][R.NOTES[k].key], l + ' ' + R.NOTES[k].key))
  );
  Object.keys(OCR.NOTES).forEach((k) =>
    ['fa', 'en', 'ar'].forEach((l) => assert.ok(strings[l][OCR.NOTES[k]], l + ' ' + OCR.NOTES[k]))
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
    ocrUi(w);                                       // (with the PDF importer: the report's OCR section)
    assert.equal(K.ui.report(clone(SAMPLE), { name: 'sample.pdf', onSafe: function () {} }), true);
    assert.equal(box.hidden, false);
    // (the pages read with OCR are in their own table, not in the pages not read in full)
    const byOcr = (p) => SAMPLE.ocr.some((x) => x.page === p.page);
    // (one row a page, but consecutive pages alike are one: the sample's scanned pages 16–18, 3.6)
    const pageRows = box.querySelectorAll('.report-pages:not(.report-ocr) tbody tr');
    assert.equal(pageRows.length, SAMPLE.pages.filter((p) => !byOcr(p)).length - 2);
    const scanRow = Array.from(pageRows).find((r) => r.getAttribute('data-mode') === 'scan');
    assert.equal(scanRow.querySelector('th').textContent, '\u206616–18\u2069', 'pages 16 to 18 in one row');
    assert.ok(scanRow.textContent.includes('—'), 'a page not read has no confidence');
    // the pages read with OCR: a table of their own, each page with its confidence and its notes
    const ocrRows = box.querySelectorAll('.report-ocr tbody tr');
    assert.equal(ocrRows.length, SAMPLE.ocr.length);
    assert.equal(box.querySelector('.report-ocr caption').textContent, K.i18n.t('rep_ocrHead'));
    SAMPLE.ocr.forEach(function (x, i) {
      assert.equal(ocrRows[i].querySelector('th').textContent, String(x.page));
      x.notes.forEach(function (n) { assert.ok(ocrRows[i].textContent.includes(K.i18n.t(K.ocrReport.NOTES[n])), 'OCR note ' + n); });
    });
    assert.ok(K.ui.report.text().includes('**' + K.i18n.t('rep_ocrHead') + '**'), 'the OCR table in Copy report');
    const lost = box.querySelector('.report-pages tbody tr[data-mode="failed"]');
    assert.ok(lost, 'the failed page has a row of its own mode');
    assert.equal(lost.querySelector('.mode').textContent, K.i18n.t('rep_mode_failed'));
    assert.notEqual(K.i18n.t('rep_mode_failed'), K.i18n.t('rep_mode_simplified'));
    // the safe-mode explanation is visible text the button points to, not only a tooltip
    const hint = d.getElementById('report-safe-hint');
    assert.equal(hint.hidden, false);
    assert.equal(hint.textContent, K.i18n.t('rep_safeHint'));
    assert.equal(d.getElementById('report-safe').getAttribute('aria-describedby'), 'report-safe-hint');
    // the copied text: the language's list separator
    assert.ok(K.ui.report.text().includes(K.i18n.t('rep_why_lowConf') + K.i18n.t('listSep')), 'listSep in Copy report');
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

  // Copy report: the report as Markdown on the clipboard (2.8), a toast
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
  assert.ok(copied && copied.startsWith('## ' + K.i18n.t('rep_title') + '\n'), 'the title first, a heading');
  assert.match(copied, /^### a\.pdf$/m, 'the file, a heading');
  assert.match(copied, /^\*\*Findings\*\*\n\n- /m, 'the findings, a list');
  const head = ['rep_colPage', 'rep_colMode', 'rep_colConf', 'rep_colWhy'].map((k) => K.i18n.t(k));
  assert.ok(copied.includes('| ' + head.join(' | ') + ' |\n| --- | --- | --- | --- |\n'), 'the pages, a GFM table');
  assert.match(copied, /^\| 3 \| simplified \| 41% \| low confidence, missing word spaces \|$/m);
  assert.doesNotMatch(copied, /\n{3}/, 'one blank line between blocks');
  assert.ok(copied.includes(K.i18n.t('pdf_printNoLinks')));
  assert.doesNotMatch(copied, /<|\b(rep|pdf)_\w+/, 'Markdown, no HTML, no keys');
  assert.ok(toasts(w).some((t) => t.includes(K.i18n.t('copied'))));
  // a custom view (the Excel summary): Copy report copies its copy(); without one, no Copy report (2.8)
  const view = { icon: 'sheet', title: () => 'Sheets', brief: () => '1 sheet', body: function (el) { el.textContent = 'x'; }, buttons: [] };
  K.ui.report.custom(Object.assign({ copy: () => '## Sheets\n\n| # | Sheet |\n| --- | --- |\n| 1 | A \\| B |\n' }, view));
  assert.equal(d.getElementById('report-copy').hidden, false, 'a view with copy(): Copy report');
  d.getElementById('report-copy').click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(copied, '## Sheets\n\n| # | Sheet |\n| --- | --- |\n| 1 | A \\| B |\n');
  K.ui.report.custom(view);
  assert.equal(d.getElementById('report-copy').hidden, true, 'no copy(): no Copy report');
  K.ui.report.close();
  assert.equal(K.importReport.gfmTable(['a', 'b'], [['x|y', 'line\nbreak']]).join('\n'), '| a | b |\n| --- | --- |\n| x\\|y | line break |');

  // Re-import in safe mode: its action runs, the panel closes; a report that ran in safe mode has no button
  let safe = 0;
  K.ui.report(clone(SAMPLE), { name: 'a.pdf', onSafe: () => safe++ });
  d.getElementById('report-safe').click();
  assert.equal(safe, 1);
  assert.equal(box.hidden, true);
  K.ui.report(Object.assign(clone(SAMPLE), { mode: 'safe' }), { name: 'a.pdf', onSafe: () => safe++ });
  assert.equal(d.getElementById('report-safe').hidden, true);
  assert.ok(box.textContent.includes(K.i18n.t('rep_safeMode')));
  // a clean report: shown too (every PDF import has one), in the calm color, with no safe-mode button
  assert.equal(K.ui.report({ mode: 'auto', summary: { pages: 2, full: 2 }, pages: [], flags: [], notes: [] }, { name: 'a.pdf', onSafe: () => safe++ }), true);
  assert.equal(box.hidden, false);
  assert.ok(box.classList.contains('clean'), 'the calm color');
  assert.equal(d.getElementById('report-safe').hidden, true, 'nothing safe mode would do better');
  assert.equal(d.getElementById('report-safe-hint').hidden, true, 'no hint without the button');
  K.ui.report.close();
  assert.equal(box.hidden, true);
  // a panel that closes by itself (a clean import) with the focus inside: the focus goes back, not to <body>
  from.focus();
  K.ui.report(clone(SAMPLE), { name: 'a.pdf' });
  d.getElementById('report-copy').focus();
  K.ui.report(null);
  assert.equal(box.hidden, true);
  assert.equal(d.activeElement, from, 'a self-closing panel gives the focus back');
  // the focus elsewhere: left where it is
  K.ui.report(clone(SAMPLE), { name: 'a.pdf' });
  d.getElementById('editor').focus();
  K.ui.report(null);
  assert.equal(d.activeElement, d.getElementById('editor'));
  // one page: its own words (en: "1 page", not "1 pages")
  K.ui.report({ mode: 'auto', summary: { pages: 1, full: 0, simplified: 1 }, pages: [{ page: 1, mode: 'simplified', conf: 0.5, why: ['lowConf'] }], flags: [], notes: [] });
  assert.ok(box.querySelector('.report-summary').textContent.startsWith('1 page') && !box.querySelector('.report-summary').textContent.startsWith('1 pages'));
  K.ui.report.close();
  // release (a new import starts): the safe-mode action goes, the report stays
  let kept = 0;
  K.ui.report(clone(SAMPLE), { name: 'a.pdf', onSafe: () => kept++ });
  d.getElementById('report-safe').focus();
  K.ui.report.release();
  assert.equal(box.hidden, false);
  assert.equal(d.getElementById('report-safe').hidden, true);
  assert.equal(d.activeElement, box, 'the focus stays in the panel');
  K.ui.report.close();
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
  assert.equal(await K.ui._tasks, undefined, 'the task queue holds no result (no text, no PDF bytes)');
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
  assert.equal(box.hidden, false, 'a clean import has its report too: the same panel for every PDF');
  assert.ok(box.classList.contains('clean'));
  assert.equal(d.getElementById('import-report-name').textContent, 'clean.pdf');
  assert.equal(d.getElementById('report-safe').hidden, true);
  assert.deepEqual(errors, []);
  w.close();
});

test('the report follows its document (Clear hides it, Undo brings it back collapsed, Redo hides it); it collapses after config.reportOpenMs; its toggle opens it', async function () {
  const { window: w, errors } = await appWindow(OPENED);
  const K = w.Kelk,
    d = w.document,
    box = d.getElementById('import-report'),
    tg = d.getElementById('import-report-toggle');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  K.config.reportOpenMs = 30;
  K.editor.set('# Imported\n', 'a.pdf');
  K.ui.report(clone(SAMPLE), { name: 'a.pdf' });
  assert.equal(box.hidden, false);
  assert.ok(!box.classList.contains('collapsed'), 'open at first');
  assert.equal(tg.getAttribute('aria-expanded'), 'true');
  await wait(90);
  assert.ok(box.classList.contains('collapsed'), 'collapsed after reportOpenMs');
  assert.equal(tg.getAttribute('aria-expanded'), 'false');
  assert.ok(d.getElementById('import-report-brief').textContent.length > 3, 'the summary in its head');
  tg.click();
  assert.ok(!box.classList.contains('collapsed'), 'the toggle opens it');
  await wait(90);
  assert.ok(!box.classList.contains('collapsed'), 'opened by hand: it stays open');
  tg.click();
  assert.ok(box.classList.contains('collapsed'), 'and collapses it again');
  K.editor.set('', '');
  assert.equal(box.hidden, true, 'Clear (another document): hidden');
  K.editor.undo();
  assert.equal(K.editor.value(), '# Imported\n');
  assert.equal(box.hidden, false, 'Undo back to its document: shown again');
  assert.ok(box.classList.contains('collapsed'), 'collapsed');
  K.editor.redo();
  assert.equal(box.hidden, true, 'Redo: hidden again');
  K.editor.undo();
  assert.equal(box.hidden, false);
  K.ui.report.close();
  K.editor.redo();
  K.editor.undo();
  assert.equal(box.hidden, true, 'closed with its ×: gone for good');
  K.config.reportOpenMs = 0;
  K.ui.report(clone(SAMPLE), { name: 'a.pdf' });
  await wait(60);
  assert.ok(!box.classList.contains('collapsed'), 'reportOpenMs 0: stays open');
  assert.deepEqual(errors, []);
  w.close();
});

test('Read with OCR: the range, the pages it asks for, the setting (Ask, Read with OCR, Leave as pictures)', async function () {
  const { window: w, errors } = await appWindow(OPENED);
  try {
    const K = w.Kelk,
      d = w.document,
      R = ocrUi(w);
    // the range: typed as «1-3, 7» (Persian or Arabic digits, dashes, spaces), only the pages that need OCR
    assert.equal(R.rangeText([1, 2, 3, 7, 9, 10]), '1-3, 7, 9-10');
    assert.deepEqual(Array.from(R.rangePages('1-3, 7', [1, 2, 3, 5, 7])), [1, 2, 3, 7]);
    assert.deepEqual(Array.from(R.rangePages('۲ – ۳،٥', [1, 2, 3, 5])), [2, 3, 5]);
    assert.equal(R.rangePages('4', [1, 2]), null, 'no page that needs OCR');
    assert.equal(R.rangePages('3-1', [1, 2, 3]), null);
    assert.equal(R.rangePages('a', [1]), null);
    const scan = function (opts) {
      const read = opts.ocr === 'read';
      return {
        markdown: read ? 'متن\n' : '![](p1)\n',
        notes: [],
        messages: [],
        report: {
          mode: 'auto',
          summary: { pages: 3, full: 1, ocr: 2 },
          pages: [{ page: 2, mode: 'ocr', conf: read ? 0.9 : 0, why: ['noText'] }, { page: 3, mode: 'ocr', conf: 0, why: ['noText'] }],
          flags: [],
          ocr: read ? [{ page: 2, conf: 0.9, lines: 20, notes: [] }] : [],
          notes: read ? [{ code: 'ocrNeeded', pages: [3] }] : [{ code: 'ocrNeeded', pages: [2, 3] }]
        }
      };
    };
    // Ask (the default): pictures, and the report offers OCR for pages 2 and 3
    let calls = fakePdf(w, scan);
    await K.importer.fromFile(pdfFile(w));
    assert.equal(calls[0].opts.ocr, undefined, 'Ask: the pages stay pictures');
    assert.equal(typeof calls[0].opts.loadOcr, 'function');
    const btn = d.getElementById('report-ocr'),
      range = d.getElementById('report-ocr-pages');
    assert.equal(btn.hidden, false);
    assert.equal(d.getElementById('report-ocr-field').hidden, false);
    assert.equal(range.value, '2-3');
    range.value = '9';
    btn.click();
    assert.equal(calls.length, 1, 'an invalid range reads nothing');
    assert.ok(toasts(w).some((x) => x.includes('2-3')), 'and says which pages can be read');
    range.value = '2';
    btn.click();
    for (let i = 0; i < 50 && calls.length < 2; i++) await new Promise((r) => setTimeout(r, 10));
    assert.equal(calls.length, 2);
    assert.equal(calls[1].opts.ocr, 'read');
    assert.deepEqual(Array.from(calls[1].opts.ocrPages), [2]);
    assert.deepEqual(calls[1].bytes, calls[0].bytes, 'the same file bytes');
    for (let i = 0; i < 50 && K.editor.value() !== 'متن\n'; i++) await new Promise((r) => setTimeout(r, 10));
    assert.equal(K.editor.value(), 'متن\n');
    assert.equal(d.querySelectorAll('.report-ocr tbody tr').length, 1, 'the page read, in its own table');
    assert.equal(btn.hidden, false, 'page 3 can still be read');
    assert.equal(range.value, '3');
    // Read with OCR: every such page read at once; Leave as pictures: no button
    K.store.setUi('importer', Object.assign({}, K.store.getUi('importer'), { scannedPages: 'read' }));
    calls = fakePdf(w, scan);
    await K.importer.fromFile(pdfFile(w));
    assert.equal(calls[0].opts.ocr, 'read');
    assert.equal(calls[0].opts.ocrPages, undefined, 'every page');
    K.store.setUi('importer', Object.assign({}, K.store.getUi('importer'), { scannedPages: 'leave' }));
    calls = fakePdf(w, scan);
    await K.importer.fromFile(pdfFile(w));
    assert.equal(calls[0].opts.ocr, undefined);
    assert.equal(btn.hidden, true, 'Leave as pictures: no button');
    assert.ok(d.querySelector('[data-code="ocrNeeded"]'), 'the note still says so');
    assert.deepEqual(errors, []);
  } finally {
    w.close();                                      // (a failure leaves no window open: the run would not end)
  }
});
