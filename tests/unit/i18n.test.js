/**
 * The interface languages: the Arabic interface writes Arabic words and dates into what it makes,
 * the strings once hard-coded in scripts/ follow the language, scripts/boot.js sets <html lang dir> and the
 * theme before the first paint, and tools/check-i18n.js reports missing / unused keys by its exit code.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { JSDOM } = require('jsdom');
const { ROOT, ORIGIN, appWindow } = require('./helpers');

const ui = function (o) {
  return JSON.stringify(Object.assign({ sampleSeen: true }, o));
};

/** A file with nested tables, imported through Kelk.importer: the text it gives. */
async function importNested(w) {
  const html =
    '<table><tr><td>a</td><td><table><tr><td>inner</td></tr></table></td></tr></table>';
  await w.Kelk.importer.fromFile(new w.File([html], 'nested.html', { type: 'text/html' }));
  return w.Kelk.editor.value();
}

for (const [lang, word, other] of [
  ['ar', 'جدول', 'Table'],
  ['en', 'Table', 'جدول'],
  ['fa', 'جدول', 'Table']
]) {
  test(lang + ' interface: a nested table is referred to as «' + word + '»', async function () {
    const { window: w, errors } = await appWindow({ 'kelk.ui': ui({ lang: lang, importer: { nestedTables: 'extract' } }) });
    const md = await importNested(w);
    assert.ok(md.includes('↳ ' + word + ' '), md);
    assert.ok(!md.includes('↳ ' + other + ' '), md);
    assert.deepEqual(errors, []);
  });
}

/** today's date as BidiCore.hfDate writes it for a locale */
const today = function (loc) {
  return new Intl.DateTimeFormat(loc, { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());
};

for (const [lang, loc, not] of [
  ['ar', 'ar-u-nu-latn', 'fa-IR-u-nu-latn'],
  ['fa', 'fa-IR-u-nu-latn', 'ar-u-nu-latn'],
  ['en', 'fa-IR-u-nu-latn', 'ar-u-nu-latn'] // an RTL header in the English interface: Persian, as its page/of words
]) {
  test(lang + ' interface: {date} of an RTL custom header is in ' + loc, async function () {
    const settings = {
      schemaVersion: 1,
      headerFooter: { mode: 'custom', direction: 'rtl', header: '<p>D:{date}</p>', footer: '<p>{page}</p>' }
    };
    const { window: w, errors } = await appWindow({
      'kelk.ui': ui({ lang: lang }),
      'kelk.settings': JSON.stringify(settings),
      'kelk.content': '# عنوان\n\nمتن.'
    });
    w.Kelk.fonts.forHtml = function () {
      return Promise.resolve([]);
    };
    const page = await w.Kelk.exporter._htmlPage();
    assert.ok(page.includes(today(loc)), 'the date in ' + loc);
    assert.ok(!page.includes(today(not)), 'not in ' + not);
    assert.deepEqual(errors, []);
  });
}

test('LTR custom header: {date} in English whatever the interface', async function () {
  const settings = {
    schemaVersion: 1,
    headerFooter: { mode: 'custom', direction: 'ltr', header: '<p>D:{date}</p>', footer: '' }
  };
  const { window: w } = await appWindow({ 'kelk.ui': ui({ lang: 'ar' }), 'kelk.settings': JSON.stringify(settings), 'kelk.content': '# T\n\nx' });
  w.Kelk.fonts.forHtml = function () {
    return Promise.resolve([]);
  };
  assert.ok((await w.Kelk.exporter._htmlPage()).includes(today('en-GB')));
});

test('Arabic interface: the strings once hard-coded follow the language', async function () {
  const { window: w, errors } = await appWindow({ 'kelk.ui': ui({ lang: 'ar' }), 'kelk.content': 'abc' });
  const K = w.Kelk, d = w.document;
  assert.match(d.getElementById('st-size').textContent, /^0\.0 كيلوبايت$/);
  assert.equal(d.getElementById('lang-switch').getAttribute('aria-label'), 'اللغة');
  assert.equal(K.ui.pageList([1, 2, 5]), '1، 2، 5');
  await assert.rejects(K.ui.loadScript('vendor/missing.js'), { message: 'تعذّر تحميل «vendor/missing.js»' });
  assert.equal(d.querySelector('#logo-thumb').textContent, 'لا شعار');
  // switching to English relabels them
  d.querySelector('#lang-switch button[lang="en"]').click();
  await new Promise(function (r) {
    setTimeout(r, 50);
  });
  assert.equal(K.i18n.lang, 'en');
  assert.equal(d.getElementById('st-size').textContent, '0.0 KB');
  assert.equal(d.getElementById('lang-switch').getAttribute('aria-label'), 'Language');
  assert.equal(K.ui.pageList([1, 2, 5]), '1, 2, 5');
  // the one error expected: jsdom reports the missing script loaded above
  assert.deepEqual(
    errors.filter(function (e) {
      return !/missing\.js/.test(e.message);
    }),
    []
  );
});

// ---- scripts/boot.js ------------------------------------------------------------------------------------------

/** boot.js alone, on a page that says lang="fa" dir="rtl" (as index.html does without scripts). */
function boot(stored, languages, timeZone, throwing) {
  const dom = new JSDOM('<!doctype html><html lang="fa" dir="rtl"><head></head><body></body></html>', {
    url: ORIGIN,
    runScripts: 'outside-only'
  });
  const w = dom.window;
  Object.keys(stored || {}).forEach(function (k) {
    w.localStorage.setItem(k, stored[k]);
  });
  // blocked site data: reading window.localStorage throws (a SecurityError in browsers)
  if (throwing) Object.defineProperty(w, 'localStorage', { get: function () { throw new Error('SecurityError'); } });
  Object.defineProperty(w.navigator, 'languages', { value: languages || ['en-US'] });
  w.Intl = {
    DateTimeFormat: function () {
      return { resolvedOptions: () => ({ timeZone: timeZone || 'Europe/London' }) };
    }
  };
  w.eval(fs.readFileSync(path.join(ROOT, 'scripts/boot.js'), 'utf8'));
  const r = w.document.documentElement;
  return { lang: r.lang, dir: r.dir, theme: r.getAttribute('data-theme'), boot: w.Kelk.boot };
}

test('boot.js: the stored language and theme on <html>', function () {
  assert.deepEqual(
    (({ lang, dir, theme }) => ({ lang, dir, theme }))(boot({ 'kelk.ui': ui({ lang: 'ar', theme: 'dark' }) })),
    { lang: 'ar', dir: 'rtl', theme: 'dark' }
  );
  assert.deepEqual(
    (({ lang, dir, theme }) => ({ lang, dir, theme }))(boot({ 'kelk.ui': ui({ lang: 'en' }) }, ['fa-IR'])),
    { lang: 'en', dir: 'ltr', theme: 'light' }
  );
  assert.equal(boot({ 'kelk.ui': ui({ lang: 'xx' }) }).lang, 'fa', 'an unknown stored language: Persian, as i18n.apply');
});

test('boot.js: first visit — the browser language, light theme', function () {
  assert.equal(boot({}, ['en-US']).dir, 'ltr');
  assert.equal(boot({}, ['ar-EG', 'en']).lang, 'ar');
  assert.equal(boot({}, ['de', 'fa']).lang, 'fa');
  assert.equal(boot({}, ['en-US'], 'Asia/Tehran').lang, 'fa');
  assert.equal(boot({}, ['en-US']).theme, 'light');
  assert.equal(boot({ 'kelk.ui': '{broken' }, ['en-GB']).lang, 'en', 'an unreadable store is a first visit');
});

test('index.html loads boot.js in <head> before the stylesheets, as an external script', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const head = html.slice(0, html.indexOf('</head>'));
  const at = head.indexOf('<script src="scripts/boot.js"></script>');
  assert.ok(at > 0, 'in <head>');
  assert.ok(at < head.indexOf('<link rel="stylesheet"'), 'before the first stylesheet');
});

test('the app starts in the stored language that boot.js set (Arabic, dark)', async function () {
  const { window: w, errors } = await appWindow({ 'kelk.ui': ui({ lang: 'ar', theme: 'dark' }) });
  const r = w.document.documentElement;
  assert.equal(w.Kelk.boot.lang, 'ar');
  assert.equal(w.Kelk.i18n.lang, 'ar');
  assert.equal(r.lang, 'ar');
  assert.equal(r.dir, 'rtl');
  assert.equal(r.getAttribute('data-theme'), 'dark');
  assert.deepEqual(errors, []);
});

// ---- tools/check-i18n.js --------------------------------------------------------------------------------------

function checkI18n(root) {
  const args = [path.join(ROOT, 'tools/check-i18n.js')];
  if (root) args.push('--root', root);
  return spawnSync(process.execPath, args, { encoding: 'utf8' });
}

/**
 * A copy of index.html and scripts/; `edit` changes scripts/i18n.js, or, as an object, any file:
 * { 'scripts/ui.js': fn, 'index.html': fn }.
 */
function tree(edit) {
  const edits = typeof edit === 'function' ? { 'scripts/i18n.js': edit } : edit || {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kelk-i18n-'));
  fs.mkdirSync(path.join(dir, 'scripts'));
  const files = ['index.html'].concat(
    fs.readdirSync(path.join(ROOT, 'scripts')).map(function (f) {
      return 'scripts/' + f;
    })
  );
  files.forEach(function (f) {
    let src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (edits[f]) src = edits[f](src);
    fs.writeFileSync(path.join(dir, f), src);
  });
  return dir;
}

/** check-i18n on a changed copy of the tree: { status, stdout }. */
function checkEdited(edit) {
  const dir = tree(edit);
  try {
    return checkI18n(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('check-i18n: exit 0 on the tree (0 missing, 0 unused)', function () {
  const r = checkI18n();
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /0 missing, 0 unused, 0 placeholder mismatches/);
});

test('check-i18n: exit 1 for a missing, an unused and a placeholder-mismatched key', function () {
  const dir = tree(function (s) {
    return s
      .replace("tableLabel: 'Table',", "tableLabel: 'Table', zzOnlyEnglish: 'x',")
      .replace("sizeKb: '{0} KB',", "sizeKb: 'KB',");
  });
  try {
    const r = checkI18n(dir);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /MISSING +zzOnlyEnglish — not in fa, ar/);
    assert.match(r.stdout, /UNUSED +zzOnlyEnglish/);
    assert.match(r.stdout, /PLACEHOLDER +sizeKb/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('check-i18n: exit 1 for a key the page uses that no language has; 2 when the tables cannot be read', function () {
  const dir = tree();
  try {
    fs.appendFileSync(path.join(dir, 'scripts', 'ui.js'), "\nKelk.i18n.t('zzNowhere');\n");
    const r = checkI18n(dir);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /MISSING +zzNowhere — used in scripts\/ui\.js:\d+, in no language/);
    fs.writeFileSync(path.join(dir, 'scripts', 'i18n.js'), 'window.Kelk = {};');
    assert.equal(checkI18n(dir).status, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- review findings ----------------------------------------------------------------------------

test('boot.js: a storage that throws on access is a first visit, and the page still gets lang/dir/theme', function () {
  const r = boot({ 'kelk.ui': ui({ lang: 'en' }) }, ['ar-EG'], null, true);
  assert.deepEqual([r.lang, r.dir, r.theme], ['ar', 'rtl', 'light']);
});

test('boot.js: an inherited name is not a language, an unknown theme is light', function () {
  const r = boot({ 'kelk.ui': ui({ lang: 'toString', theme: 'blue' }) });
  assert.deepEqual([r.lang, r.dir, r.theme], ['fa', 'rtl', 'light']);
  assert.equal(boot({ 'kelk.ui': ui({ lang: '__proto__' }) }).dir, 'rtl');
});

test('the app agrees with boot.js on a "toString" language and an unknown theme', async function () {
  const { window: w, errors } = await appWindow({ 'kelk.ui': ui({ lang: 'toString', theme: 'blue' }) });
  const r = w.document.documentElement;
  assert.equal(w.Kelk.i18n.lang, 'fa');
  assert.equal(r.getAttribute('data-theme'), 'light', 'Kelk.ui.theme: not the raw "blue"');
  assert.equal(w.Kelk.boot.theme, 'light');
  assert.deepEqual(errors, []);
});

test("boot.js: an old profile's kelk.settings.ui gives lang and theme, over kelk.ui as storage.js load() merges them", function () {
  const old = JSON.stringify({ ui: { lang: 'ar', theme: 'dark' } });
  assert.deepEqual(
    (({ lang, dir, theme }) => ({ lang, dir, theme }))(boot({ 'kelk.settings': old }, ['en-US'])),
    { lang: 'ar', dir: 'rtl', theme: 'dark' }
  );
  assert.equal(boot({ 'kelk.settings': old, 'kelk.ui': ui({ lang: 'en' }) }).lang, 'ar');
  assert.equal(boot({ 'kelk.settings': JSON.stringify({ ui: { theme: 'dark' } }), 'kelk.ui': ui({ lang: 'en' }) }).lang, 'en');
  assert.equal(boot({ 'kelk.settings': '{"ui":"x"}', 'kelk.ui': ui({ lang: 'en' }) }).lang, 'en', 'a broken ui entry is ignored');
});

test('the app starts where boot.js did for an old profile (kelk.settings.ui moved by load())', async function () {
  const { window: w, errors } = await appWindow({ 'kelk.settings': JSON.stringify({ ui: { lang: 'ar', theme: 'dark' } }) });
  const r = w.document.documentElement;
  assert.equal(w.Kelk.boot.lang, 'ar');
  assert.equal(w.Kelk.i18n.lang, 'ar');
  assert.equal(r.getAttribute('data-theme'), 'dark');
  assert.deepEqual(errors, []);
});

test('index.html: the CSP <meta> comes before boot.js (a policy applies only to what follows it)', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const csp = html.indexOf('http-equiv="Content-Security-Policy"');
  assert.ok(csp > 0, 'the CSP meta is there');
  assert.ok(csp < html.indexOf('<script src="scripts/boot.js"></script>'));
  assert.ok(!/<script>/.test(html.slice(0, html.indexOf('</head>'))), 'no inline script in <head>');
});

test('check-i18n: a use inside a comment does not count (JS line and block comments, HTML)', function () {
  let r = checkEdited({
    'scripts/settings.js': (s) => s.replace("img.alt = K.i18n.t('logoAlt');", "img.alt = ''; // K.i18n.t('logoAlt')"),
    'scripts/main.js': (s) =>
      s.replace("box.setAttribute('aria-label', K.i18n.t('languageGroup'));", "/* K.i18n.t('languageGroup') */"),
    'index.html': (s) =>
      s.replace('<span data-i18n="footerOffline"></span>', '<!-- <span data-i18n="footerOffline"></span> -->')
  });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /UNUSED +logoAlt/);
  assert.match(r.stdout, /UNUSED +languageGroup/);
  assert.match(r.stdout, /UNUSED +footerOffline/);
  // quotes and slashes inside strings and regular expressions start no comment
  r = checkEdited({
    'scripts/settings.js': (s) =>
      s.replace("img.alt = K.i18n.t('logoAlt');", "const zz1 = '//', zz2 = /\\/*'/; img.alt = K.i18n.t('logoAlt');")
  });
  assert.equal(r.status, 0, r.stdout);
});

test('check-i18n: a template literal is a key; a variable or an expression is NONLITERAL', function () {
  let r = checkEdited({ 'scripts/ui.js': (s) => s + '\nKelk.i18n.t(`zzTypo`);\n' });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /MISSING +zzTypo — used in scripts\/ui\.js:\d+, in no language/);
  r = checkEdited({ 'scripts/ui.js': (s) => s + '\nKelk.i18n.t(`listSep`);\n' });
  assert.equal(r.status, 0, 'a known key as a template literal: ' + r.stdout);
  r = checkEdited({
    'scripts/ui.js': (s) => s + "\nconst kk = 'zzViaVar'; Kelk.i18n.t(kk); Kelk.i18n.t(`a${kk}`); Kelk.i18n.t('pdf_' + kk);\n"
  });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /NONLITERAL +scripts\/ui\.js:\d+ t\(kk\)/);
  assert.match(r.stdout, /NONLITERAL +scripts\/ui\.js:\d+ t\(`a\$\{kk\}`\)/);
  assert.match(r.stdout, /NONLITERAL +scripts\/ui\.js:\d+ t\('pdf_' \+ kk\)/, 'pdf_ is allowed in importer.js and report.js only');
});

test('check-i18n: a pdf_ key counts only where report.js writes it in full', function () {
  const r = checkEdited({
    // the table entry gone, the suffix still written elsewhere in the file
    'scripts/report.js': (s) => s.replace("ocrLayer: { key: 'pdf_ocrLayer' },", '') + "\nconst zzSuffix = 'ocrLayer';\n"
  });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /UNUSED +pdf_ocrLayer/);
  assert.doesNotMatch(r.stdout, /NONLITERAL/, 'report.js may compute pdf_ and rep_ keys');
});

test('check-i18n: PLACEHOLDER names each language with its own placeholders', function () {
  const r = checkEdited(function (s) {
    return s
      .replace("tableLabel: 'Table',", "tableLabel: 'Table', zzPh: 'a {0}',")
      .replace("libFailed: 'تعذّر تحميل «{0}»',", "libFailed: 'تعذّر تحميل «{0}»', zzPh: 'b',");
  });
  assert.match(r.stdout, /MISSING +zzPh — not in fa/);
  assert.match(r.stdout, /PLACEHOLDER +zzPh — en \{0\}, ar -$/m);
});
