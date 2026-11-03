/**
 * The app in jsdom (index.html with all its scripts): an export right after a keystroke contains it
 * (Kelk.preview.flush), the last keystrokes are saved when the page hides, and a second tab follows what
 * another tab saved instead of writing back what it showed before (the storage event) — plan P1.1.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { appWindow } = require('./helpers');

const START = '# Title\n\nFirst paragraph.';
const OPENED = { 'kelk.ui': JSON.stringify({ lang: 'en', sampleSeen: true }), 'kelk.content': START };

/** Type at the end of the editor as a user does: the value changes, then an input event. */
function type(w, text) {
  const area = w.document.getElementById('editor');
  area.value += text;
  area.dispatchEvent(new w.InputEvent('input', { inputType: 'insertText', data: text }));
}

/** Kelk.exporter.run with the download caught: resolves to the file's text. */
async function exportText(w, kind) {
  const K = w.Kelk;
  let file = null;
  K.ui.download = function (data) {
    file = data;
  };
  K.fonts.forHtml = function () {
    return Promise.resolve([]); // the base64 web fonts are not needed to see the text
  };
  await K.exporter.run(kind, null);
  assert.ok(file, kind + ': a file was made');
  return typeof file === 'string' ? file : await file.text();
}

/** Another tab saved `key`: the store changes and this window gets the storage event. */
function fromOtherTab(w, key, value) {
  w.localStorage.setItem(key, value);
  w.dispatchEvent(new w.StorageEvent('storage', { key: key, newValue: value, storageArea: w.localStorage }));
}

test('an export right after a keystroke contains it', async function () {
  const { window: w, errors } = await appWindow(OPENED);
  const K = w.Kelk;
  assert.equal(K.editor.value(), START);
  type(w, '\n\nTyped just now.');
  assert.ok(!K.preview.html().includes('Typed just now'), 'the preview waits for the typing pause');
  const html = await exportText(w, 'html');
  assert.ok(html.includes('Typed just now'), 'HTML export has the last keystroke');
  type(w, ' And more.');
  const md = await exportText(w, 'md');
  assert.ok(md.includes('And more.'), 'MD export has it');
  assert.deepEqual(errors, []);
  w.close();
});

test('a changed first heading names the export at once', async function () {
  const { window: w } = await appWindow(OPENED);
  const area = w.document.getElementById('editor');
  area.value = '# Fresh name\n\nText.';
  area.dispatchEvent(new w.InputEvent('input', { inputType: 'insertText' }));
  w.Kelk.preview.flush();
  assert.equal(w.Kelk.names.title(), 'Fresh name');
  w.close();
});

test('the last keystrokes are saved when the page hides', async function () {
  const { window: w } = await appWindow(OPENED);
  type(w, ' Last words.');
  assert.equal(w.localStorage.getItem('kelk.content'), START, 'autosave still waiting');
  w.dispatchEvent(new w.Event('pagehide'));
  assert.equal(w.localStorage.getItem('kelk.content'), START + ' Last words.');
  w.close();
});

test('a second tab follows the text another tab saved (one Undo step)', async function () {
  const { window: w, errors } = await appWindow(OPENED);
  const K = w.Kelk;
  const other = '# Title\n\nWritten in the other tab.';
  fromOtherTab(w, 'kelk.content', other);
  assert.equal(K.editor.value(), other);
  assert.ok(K.preview.html().includes('Written in the other tab'));
  assert.equal(w.localStorage.getItem('kelk.content'), other, 'nothing written back');
  K.editor.undo();
  assert.equal(K.editor.value(), START);
  assert.deepEqual(errors, []);
  w.close();
});

test('typing not saved yet is kept, and saved after the other tab', async function () {
  const { window: w } = await appWindow(OPENED);
  const K = w.Kelk;
  type(w, ' Mine.');
  fromOtherTab(w, 'kelk.content', 'Theirs.');
  assert.equal(K.editor.value(), START + ' Mine.');
  w.dispatchEvent(new w.Event('pagehide'));
  assert.equal(w.localStorage.getItem('kelk.content'), START + ' Mine.');
  w.close();
});

test('a second tab follows settings, images and the logo another tab saved', async function () {
  const { window: w } = await appWindow(OPENED);
  const K = w.Kelk;
  fromOtherTab(w, 'kelk.settings', JSON.stringify({ schemaVersion: 1, page: { size: 'Letter' } }));
  assert.equal(w.document.querySelector('[data-setting="page.size"]').value, 'Letter');
  // this tab sets another value: the other tab's choice stays (per-key writes on the stored profile)
  K.store.set('code.size', 9);
  assert.equal(K.store.get('page.size'), 'Letter');

  const png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  fromOtherTab(w, 'kelk.images', JSON.stringify({ pic: png }));
  assert.equal(K.images.get('pic'), png);

  fromOtherTab(w, 'kelk.logo', png);
  assert.ok(w.document.querySelector('#logo-thumb img'), 'logo shown');
  w.close();
});

test('a second tab follows the imported file name and the page settings', async function () {
  const { window: w } = await appWindow(
    Object.assign({}, OPENED, { 'kelk.ui': JSON.stringify({ lang: 'en', sampleSeen: true, sourceName: 'old.docx' }) })
  );
  const K = w.Kelk;
  assert.equal(K.names.stem(), 'old');
  // the other tab imported new-report.docx: its ui (the file's name) is written before its text
  fromOtherTab(
    w,
    'kelk.ui',
    JSON.stringify({ lang: 'en', sampleSeen: true, sourceName: 'new-report.docx', theme: 'dark', layout: 'stack' })
  );
  fromOtherTab(w, 'kelk.content', '# Report\n\nImported.');
  assert.equal(K.names.stem(), 'new-report');
  assert.equal(w.document.documentElement.getAttribute('data-theme'), 'dark');
  assert.ok(w.document.getElementById('workspace').classList.contains('stack'));
  w.close();
});

test('storage cleared elsewhere: this tab writes its text back instead of emptying', async function () {
  const { window: w } = await appWindow(OPENED);
  const K = w.Kelk;
  w.localStorage.clear();
  w.dispatchEvent(new w.StorageEvent('storage', { key: null, storageArea: w.localStorage }));
  assert.equal(K.editor.value(), START);
  assert.equal(w.localStorage.getItem('kelk.content'), START);
  w.close();
});

test('a settings file from before schemaVersion, through the Settings pane, is migrated', async function () {
  const { window: w } = await appWindow(OPENED);
  const K = w.Kelk;
  const input = w.document.getElementById('set-import-file');
  const json = JSON.stringify({
    app: 'kelk',
    settings: { document: { title: '' }, code: { font: 'DejaVu Sans Mono' }, ui: { layout: 'stack' } }
  });
  Object.defineProperty(input, 'files', {
    value: [new w.File([json], 'kelk-settings.json', { type: 'application/json' })]
  });
  input.dispatchEvent(new w.Event('change'));
  await new Promise(function (r) {
    setTimeout(r, 50);
  });
  assert.equal(K.store.get('document.title'), null);
  assert.equal(K.store.get('code.font'), 'Vazir Code Hack');
  assert.equal(JSON.parse(w.localStorage.getItem('kelk.settings')).ui, undefined);
  // Reset, then its Undo (the toast's action) brings the profile back
  K.store.set('page.size', 'Letter');
  w.document.getElementById('set-reset').click();
  assert.equal(K.store.get('page.size'), 'A4');
  w.document.querySelector('#toasts button, .toast button').click();
  assert.equal(K.store.get('page.size'), 'Letter');
  w.close();
});

// The PDF importer is not part of the startup (plan P3.2 / P5.1): Kelk.libs.need('pdfimport') loads
// lib/PdfImporter.js and lib/pdfimport/*.js, in order, on the first PDF import.

test('the PDF importer is not loaded at startup; its loader lists the core and PdfImporter.PARTS in order', async function () {
  const { window: w, errors } = await appWindow(OPENED);
  assert.equal(w.PdfImporter, undefined, 'no PdfImporter before the first PDF import');
  assert.equal(w.document.querySelector('script[src*="PdfImporter"], script[src*="pdfimport/"]'), null);
  const PARTS = require('../../lib/PdfImporter.js').PARTS;
  assert.deepEqual(
    Array.from(w.Kelk.config.libs.pdfimport.src),
    ['lib/PdfImporter.js'].concat(
      PARTS.map(function (p) {
        return 'lib/pdfimport/' + p + '.js';
      })
    )
  );
  assert.deepEqual(errors, []);
  w.close();
});

test('a PDF import loads pdf.js, then the importer, before PdfImporter.create', async function () {
  const { window: w, errors } = await appWindow(OPENED);
  const K = w.Kelk;
  const calls = [];
  K.libs.need = function (name) {
    calls.push('need ' + name);
    if (name === 'pdfimport') {
      w.PdfImporter = {
        create: function () {
          calls.push('create');
          return {
            fromArrayBuffer: function () {
              return Promise.resolve({ markdown: '# From the PDF\n', notes: [], messages: [] });
            }
          };
        }
      };
    }
    return Promise.resolve();
  };
  await K.importer.fromFile(new w.File(['%PDF-1.7'], 'doc.pdf', { type: 'application/pdf' }));
  assert.deepEqual(calls, ['need pdfjs', 'need pdfimport', 'create']);
  assert.equal(K.editor.value(), '# From the PDF\n');
  assert.deepEqual(errors, []);
  w.close();
});

test('Kelk.libs.need("pdfimport") loads each file once, in order; a load that failed half way is finished next time', async function () {
  const { window: w, errors } = await appWindow(OPENED);
  const K = w.Kelk;
  const real = K.ui.loadScript;
  let failOnce = 'lib/pdfimport/order.js';
  K.ui.loadScript = function (src) {
    if (src === failOnce) {
      failOnce = null;
      return Promise.reject(new Error('offline'));
    }
    return real(src);
  };
  await assert.rejects(K.libs.need('pdfimport'), /offline/);
  assert.equal(typeof w.PdfImporter, 'function', 'the core ran');
  assert.equal(typeof w.PdfImporter.prototype._lines, 'function', 'the parts before the failure ran');
  const P = await K.libs.need('pdfimport');
  assert.equal(P, w.PdfImporter);
  const appended = function () {
    return Array.from(w.document.querySelectorAll('script[src]'))
      .map(function (s) {
        return s.getAttribute('src');
      })
      .filter(function (s) {
        return /PdfImporter|pdfimport\//.test(s);
      });
  };
  assert.deepEqual(appended(), Array.from(K.config.libs.pdfimport.src), 'each file appended once, in order');
  await K.libs.need('pdfimport');
  assert.deepEqual(appended(), Array.from(K.config.libs.pdfimport.src), 'a later call loads nothing');
  assert.deepEqual(errors, []);
  w.close();
});
