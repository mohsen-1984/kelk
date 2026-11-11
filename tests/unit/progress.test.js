/**
 * Named progress (the rule since 2.7: no generic progress in Kelk). Every progress state names the step under way:
 * Kelk.ui.steps turns a step into its bar and its words, Kelk.ui.task refuses a state without them (and says so in
 * the console when its window opens with none), and the imports and exports the app runs here name a step in every
 * state they show. A static scan keeps an empty step out of the scripts.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { appWindow, ROOT } = require('./helpers');

const OPENED = {
  'kelk.ui': JSON.stringify({ lang: 'en', sampleSeen: true }),
  'kelk.content': '# Title\n\nText.'
};
const NO_STEP = /must name its step/;

/** console.error of the window, caught: the guard's messages */
function catchErrors(w) {
  const seen = [];
  w.console.error = function () {
    seen.push(Array.prototype.join.call(arguments, ' '));
  };
  return seen;
}

/** Every task's progress states, recorded: [{ label, detail }] (Kelk.ui.task wrapped, its api's progress too). */
function recordTasks(K) {
  const states = [];
  const task = K.ui.task.bind(K.ui);
  K.ui.task = function (label, fn, o) {
    return task(
      label,
      function (t) {
        const progress = t.progress;
        t.progress = function (done, total, detail) {
          states.push({ label: label, detail: detail });
          return progress.apply(t, arguments);
        };
        return fn(t);
      },
      o
    );
  };
  return states;
}

test('Kelk.ui.steps: shares fill the bar, a counted step reads the item under way, args fill the words', async function () {
  const { window: w } = await appWindow(OPENED);
  const K = w.Kelk;
  const got = [];
  const t = {
    progress: function (done, total, detail) {
      got.push([done, total, detail]);
    }
  };
  const step = K.ui.steps(t, { a: 1, b: 3 }, { a: 'imp_file', b: 'taskPage', c: 'imp_list' }, 'b');
  step('a', 0, 1);
  step('a', 0, 1); // the same state twice: shown once
  step('b', 0, 4);
  step('b', 2, 4);
  step('b', 4, 4);
  step('c', 0, 1); // not in W: nothing
  assert.deepEqual(got, [
    [0, 1000, 'Reading the file…'],
    [250, 1000, 'Page 1 of 4'],
    [625, 1000, 'Page 3 of 4'],
    [1000, 1000, 'Page 4 of 4']
  ]);
  const e = K.ui.steps(t, { embed: 1 }, { embed: 'exp_embed' });
  e('embed', 0, 1, ['Vazirmatn']);
  assert.equal(got[got.length - 1][2], 'Embedding the fonts: Vazirmatn…');
  w.close();
});

test('Kelk.ui.task: a progress state without its step is refused, the last step stays', async function () {
  const { window: w } = await appWindow(OPENED);
  const K = w.Kelk;
  const errors = catchErrors(w);
  await K.ui.task('Work', async function (t) {
    t.progress(1, 2, 'Step one');
    t.progress(2, 2, '');
    t.progress(2, 2);
  });
  assert.equal(errors.filter((m) => NO_STEP.test(m)).length, 2);
  assert.equal(w.document.getElementById('task-detail').textContent, 'Step one');
  w.close();
});

test('Kelk.ui.task: its window opening with no step named is said in the console', async function () {
  const { window: w } = await appWindow(OPENED);
  const K = w.Kelk;
  const errors = catchErrors(w);
  const wait = (ms) => new Promise((r) => w.setTimeout(r, ms));
  await K.ui.task('Silent', () => wait(40), { delay: 0 });
  assert.equal(errors.filter((m) => NO_STEP.test(m)).length, 1);
  await K.ui.task(
    'Named',
    async function (t) {
      t.progress(0, 1, 'Step one');
      await wait(40);
    },
    { delay: 0 }
  );
  assert.equal(errors.filter((m) => NO_STEP.test(m)).length, 1, 'a named task opens without a message');
  w.close();
});

test('Kelk.ui.bar: a step named before the quiet window opens is shown when it opens', async function () {
  const { window: w } = await appWindow(OPENED);
  const K = w.Kelk;
  const errors = catchErrors(w);
  const bar = K.ui.bar();
  bar.progress(10, 100, 'Reading the formulas…');
  bar.start('Building the slides preview', true);
  assert.equal(w.document.getElementById('task-detail').textContent, 'Reading the formulas…');
  bar.end();
  assert.deepEqual(errors, []);
  w.close();
});

test('exports and imports name a step in every state they show', async function () {
  const { window: w, errors: scriptErrors } = await appWindow(OPENED);
  const K = w.Kelk;
  const errors = catchErrors(w);
  const states = recordTasks(K);
  K.ui.download = function () {};
  K.fonts.forHtml = function () {
    return Promise.resolve([]); // the base64 web fonts are not needed here
  };
  for (const kind of ['html', 'doc']) {
    const before = states.length;
    await K.exporter.run(kind, null);
    const mine = states.slice(before);
    assert.ok(mine.length, kind + ': its steps are shown');
    assert.ok(
      mine.every((s) => s.detail && s.detail.trim()),
      kind + ': ' + JSON.stringify(mine)
    );
  }
  const files = [
    new w.File(['# Imported\n\nFrom a file.'], 'note.md', {
      type: 'text/markdown'
    }),
    new w.File(['<h1>Page</h1><p>From HTML.</p>'], 'page.html', {
      type: 'text/html'
    })
  ];
  for (const f of files) {
    const before = states.length;
    await K.importer.fromFiles([f]);
    const mine = states.slice(before);
    assert.ok(mine.length, f.name + ': its steps are shown');
    assert.ok(
      mine.every((s) => s.detail && s.detail.trim()),
      f.name + ': ' + JSON.stringify(mine)
    );
  }
  assert.deepEqual(
    errors.filter((m) => NO_STEP.test(m)),
    []
  );
  assert.deepEqual(scriptErrors, []);
  w.close();
});

test('no script shows a progress state without its step', function () {
  const dir = path.join(ROOT, 'scripts');
  const bad = [];
  fs.readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .forEach(function (f) {
      fs.readFileSync(path.join(dir, f), 'utf8')
        .split('\n')
        .forEach(function (line, i) {
          // .progress(done, total) with no words, or with empty ones
          if (/\.progress\(\s*[^,()]+,\s*[^,()]+\s*\)|\.progress\([^)]*,\s*(''|""|``)\s*\)/.test(line))
            bad.push(f + ':' + (i + 1));
        });
    });
  assert.deepEqual(bad, []);
});
