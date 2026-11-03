/**
 * Kelk.store (scripts/storage.js): the export profile is stored as its differences from the defaults with a
 * schemaVersion, and one migrate() serves the stored profile, a settings file and Undo — so a fresh profile
 * has no migration side effects (plan P1.1).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { storageWindow, dump } = require('./helpers');

const reload = function (w) {
  return storageWindow(dump(w));
};
const stored = function (w, key) {
  return JSON.parse(w.localStorage.getItem('kelk.' + key));
};
const plain = function (v) {
  return JSON.parse(JSON.stringify(v));
};

// values the old one-shot migrations rewrote: each was an old default, and each is a legitimate choice today
const CHOICES = {
  'code.font': 'DejaVu Sans Mono',
  'fonts.bidi': 'Sahel',
  'page.tableWidth': '98%',
  'fonts.wordLatin': 'Calibri',
  'fonts.wordBidi': '',
  'headerFooter.direction': 'rtl',
  'text.lineHeight': '110%',
  'document.title': '',
  'document.edition': '',
  'headerFooter.header': '',
  'headerFooter.footer': ''
};

test('a fresh profile keeps deliberate choices across reloads (no migration side effects)', function () {
  let w = storageWindow();
  Object.keys(CHOICES).forEach(function (p) {
    w.Kelk.store.set(p, CHOICES[p]);
  });
  for (let i = 0; i < 2; i++) {
    w = reload(w);
    Object.keys(CHOICES).forEach(function (p) {
      assert.equal(w.Kelk.store.get(p), CHOICES[p], p + ' after reload ' + (i + 1));
    });
  }
});

test('an untouched fresh profile stores nothing', function () {
  let w = storageWindow();
  w = reload(w);
  assert.equal(w.localStorage.getItem('kelk.settings'), null);
  assert.deepEqual(plain(w.Kelk.store.settings()), plain(w.Kelk.config.defaults));
});

test('only the differences from the defaults are stored, with schemaVersion', function () {
  const w = storageWindow();
  w.Kelk.store.set('page.size', 'Letter');
  w.Kelk.store.set('code.size', 9);
  assert.deepEqual(stored(w, 'settings'), { page: { size: 'Letter' }, code: { size: 9 }, schemaVersion: 1 });
  w.Kelk.store.set('page.size', 'A4'); // back to the default: gone from the store
  assert.deepEqual(stored(w, 'settings'), { code: { size: 9 }, schemaVersion: 1 });
});

test('a changed default reaches every value the user never set', function () {
  let w = storageWindow();
  w.Kelk.store.set('page.size', 'Letter');
  const next = dump(w);
  w = storageWindow(next);
  w.Kelk.config.defaults.page.margin = '25mm'; // a later version's default
  assert.equal(w.Kelk.store.get('page.margin'), '25mm');
  assert.equal(w.Kelk.store.get('page.size'), 'Letter');
});

test('Reset drops the stored profile; Undo stores it back as differences', function () {
  const w = storageWindow();
  w.Kelk.store.set('fonts.bidi', 'Sahel');
  const before = JSON.stringify(w.Kelk.store.settings());
  w.Kelk.store.resetSettings();
  assert.equal(w.Kelk.store.get('fonts.bidi'), 'Vazirmatn');
  w.Kelk.store.replaceSettings(JSON.parse(before));
  assert.deepEqual(stored(w, 'settings'), { fonts: { bidi: 'Sahel' }, schemaVersion: 1 });
});

// a profile stored by a version before schemaVersion: the whole merge of that day's defaults, no markers
const LEGACY = {
  document: { title: '', edition: '', author: 'A', link: '' },
  headerFooter: { mode: 'simple', direction: 'rtl', header: '', footer: '' },
  fonts: { content: 'Sahel', latin: 'Vazirmatn', wordBidi: '', wordLatin: 'Calibri', bidiSize: 12, latinSize: 11.5 },
  text: { align: 'justify', lineHeight: '110%', breaks: true },
  page: { size: 'A4', orientation: 'portrait', margin: '20mm 15mm', tableWidth: '98%' },
  code: { showLanguage: true, font: 'DejaVu Sans Mono', size: 10 }
};

test('a legacy profile is migrated as before, once, and stored as differences', function () {
  const w = storageWindow({ 'kelk.settings': JSON.stringify(LEGACY) });
  const s = w.Kelk.store.settings();
  assert.equal(s.document.title, null);
  assert.equal(s.document.edition, null);
  assert.equal(s.headerFooter.header, null);
  assert.equal(s.headerFooter.direction, 'auto');
  assert.equal(s.fonts.bidi, 'Vazirmatn'); // fonts.content → bidi, then Sahel → Vazirmatn
  assert.equal(s.fonts.content, undefined);
  assert.equal(s.fonts.wordBidi, null);
  assert.equal(s.fonts.wordLatin, null);
  assert.equal(s.text.lineHeight, '');
  assert.equal(s.page.tableWidth, 'auto');
  assert.equal(s.code.font, 'Vazir Code Hack');
  assert.equal(s.document.author, 'A');
  assert.deepEqual(stored(w, 'settings'), { document: { author: 'A' }, schemaVersion: 1 });
  // the same choices made again now are kept
  w.Kelk.store.set('code.font', 'DejaVu Sans Mono');
  assert.equal(reload(w).Kelk.store.get('code.font'), 'DejaVu Sans Mono');
});

test('a legacy profile the old code had already migrated (markers) keeps its values', function () {
  const p = {
    _auto: 1,
    _vch: 1,
    _vz: 1,
    _auto2: 1,
    _hfauto: 1,
    _lh: 1,
    document: { title: '' },
    code: { font: 'DejaVu Sans Mono' },
    fonts: { bidi: 'Sahel', wordLatin: 'Calibri' },
    page: { tableWidth: '98%' },
    headerFooter: { direction: 'rtl' },
    text: { lineHeight: '110%' }
  };
  const w = storageWindow({ 'kelk.settings': JSON.stringify(p) });
  const s = w.Kelk.store.settings();
  assert.equal(s.document.title, '');
  assert.equal(s.code.font, 'DejaVu Sans Mono');
  assert.equal(s.fonts.bidi, 'Sahel');
  assert.equal(s.fonts.wordLatin, 'Calibri');
  assert.equal(s.page.tableWidth, '98%');
  assert.equal(s.headerFooter.direction, 'rtl');
  assert.equal(s.text.lineHeight, '110%');
  const st = stored(w, 'settings');
  ['_auto', '_vch', '_vz', '_auto2', '_hfauto', '_lh'].forEach(function (m) {
    assert.equal(st[m], undefined, m + ' dropped');
  });
  assert.equal(st.schemaVersion, 1);
});

test('settings saved before the ui/profile split: the page parts move to kelk.ui', function () {
  const p = { ui: { layout: 'stack' }, importer: { richPaste: false }, page: { size: 'Letter' } };
  const w = storageWindow({ 'kelk.settings': JSON.stringify(p) });
  assert.equal(w.Kelk.store.getUi('layout'), 'stack');
  assert.equal(w.Kelk.store.getUi('importer.richPaste'), false);
  assert.equal(w.Kelk.store.getUi('importer.maxMB'), '20'); // the rest of importer from the defaults
  const st = stored(w, 'settings');
  assert.equal(st.ui, undefined);
  assert.equal(st.importer, undefined);
  assert.equal(w.Kelk.store.get('page.size'), 'Letter');
});

test('a settings file goes through the same migrate()', function () {
  const w = storageWindow();
  // a file from before automatic values: '' meant "not set"
  w.Kelk.store.replaceSettings({
    document: { title: '' },
    ui: { layout: 'stack' },
    code: { font: 'DejaVu Sans Mono' }
  });
  assert.equal(w.Kelk.store.get('document.title'), null);
  assert.equal(w.Kelk.store.get('code.font'), 'Vazir Code Hack');
  assert.equal(stored(w, 'settings').ui, undefined);
  // a file of this version: values as they are
  w.Kelk.store.replaceSettings({ schemaVersion: 1, document: { title: '' }, code: { font: 'DejaVu Sans Mono' } });
  assert.equal(w.Kelk.store.get('document.title'), '');
  assert.equal(w.Kelk.store.get('code.font'), 'DejaVu Sans Mono');
});

test('migrate() is pure and brings any input to the current schema', function () {
  const w = storageWindow();
  const input = JSON.parse(JSON.stringify(LEGACY));
  const out = w.Kelk.store.migrate(input);
  assert.deepEqual(input, LEGACY, 'input unchanged');
  assert.equal(out.schemaVersion, 1);
  assert.deepEqual(plain(w.Kelk.store.migrate(null)), { schemaVersion: 1 });
  assert.deepEqual(plain(w.Kelk.store.migrate({ schemaVersion: 1, code: { font: 'DejaVu Sans Mono' } })), {
    schemaVersion: 1,
    code: { font: 'DejaVu Sans Mono' }
  });
});

test('a profile of a newer schema (another tab of a later version) is read as it is', function () {
  const w = storageWindow({
    'kelk.settings': JSON.stringify({ schemaVersion: 7, code: { font: 'DejaVu Sans Mono' } })
  });
  assert.equal(w.Kelk.store.get('code.font'), 'DejaVu Sans Mono');
  assert.equal(stored(w, 'settings').schemaVersion, 7);
});

test('page behavior is stored as differences too', function () {
  const w = storageWindow({ 'kelk.ui': JSON.stringify({ lang: 'fa', layout: 'side', scrollSync: true }) });
  assert.deepEqual(stored(w, 'ui'), { lang: 'fa' }, 'a full stored ui is reduced at load');
  w.Kelk.store.setUi('layout', 'stack');
  assert.deepEqual(stored(w, 'ui'), { lang: 'fa', layout: 'stack' });
  w.Kelk.store.setUi('layout', 'side');
  w.Kelk.store.setUi('lang', '');
  assert.equal(w.localStorage.getItem('kelk.ui'), null);
});

test('a returned profile is a copy: changing it never changes the defaults', function () {
  const w = storageWindow();
  w.Kelk.store.settings().page.size = 'Letter';
  w.Kelk.store.set('code.size', 9).page.size = 'B5';
  assert.equal(w.Kelk.config.defaults.page.size, 'A4');
});

test('a tab of an older version writes one value into a newer profile, keeping the rest', function () {
  const newer = { schemaVersion: 2, page: { size: 'A4' }, code: { font: 'DejaVu Sans Mono' } };
  const w = storageWindow({ 'kelk.settings': JSON.stringify(newer) });
  w.Kelk.store.set('code.size', 9);
  assert.deepEqual(stored(w, 'settings'), {
    schemaVersion: 2,
    page: { size: 'A4' },
    code: { font: 'DejaVu Sans Mono', size: 9 }
  });
});
