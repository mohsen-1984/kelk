/**
 * GitHub's alerts in the exports (lib/BuilderBase.js alertLabels): the marker line of `> [!WARNING] …` becomes a bold
 * label in the quote's language — never raw «[!WARNING]» text; HTML without an alert is not touched.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const BuilderBase = require(path.join(__dirname, '..', '..', 'lib', 'BuilderBase.js'));
const PptxBuilder = require(path.join(__dirname, '..', '..', 'lib', 'PptxBuilder.js'));
const A = BuilderBase.alertLabels;

const T = (label) => '<strong class="alert-title">' + label + '</strong>';
test('alerts: the marker becomes a bold label, by the quote\'s language, and the quote is marked', function () {
  assert.equal(A('<blockquote>\n<p>[!WARNING]<br><strong>متن پنهان</strong>: این بخش متنی است</p>\n</blockquote>'),
    '<blockquote class="alert alert-warning">\n<p>' + T('هشدار') + '<br><strong>متن پنهان</strong>: این بخش متنی است</p>\n</blockquote>');
  assert.equal(A('<blockquote><p>[!NOTE]\nA short note.</p></blockquote>'), '<blockquote class="alert alert-note"><p>' + T('Note') + '<br>A short note.</p></blockquote>');
  assert.equal(A('<blockquote dir="rtl"><p>[!TIP]<br/>هذا نص عربي قصير</p></blockquote>'), '<blockquote class="alert alert-tip" dir="rtl"><p>' + T('نصيحة') + '<br>هذا نص عربي قصير</p></blockquote>');
  assert.equal(A('<blockquote><p>[!caution]</p><p>Two paragraphs.</p></blockquote>'), '<blockquote class="alert alert-caution"><p>' + T('Caution') + '</p><p>Two paragraphs.</p></blockquote>');
  assert.equal(A('<blockquote class="q"><p>[!NOTE]<br>x y</p></blockquote>'), '<blockquote class="alert alert-note q"><p>' + T('Note') + '<br>x y</p></blockquote>');
});

test('alerts: the label\'s language is the first paragraph\'s, whatever a code block in the quote holds', function () {
  const h = A('<blockquote><p>[!WARNING]<br><strong>متن پنهان</strong>: این بخش متنی است که دیده نمی‌شود</p><p>صفحهٔ 1:</p><pre><code class="language-text">a long hidden line in English, far longer than the note above it, with many Latin letters</code></pre></blockquote>');
  assert.ok(h.indexOf(T('هشدار')) > 0, h);
  assert.equal(A(h), h, 'a second pass changes nothing');
});

test('alerts: each quote by its own text; what is no alert stays', function () {
  const two = A('<blockquote><p>[!IMPORTANT]<br>English first.</p></blockquote><p>between</p><blockquote><p>[!IMPORTANT]<br>سپس فارسی</p></blockquote>');
  assert.ok(two.indexOf(T('Important') + '<br>English first.') > 0 && two.indexOf(T('مهم') + '<br>سپس فارسی') > 0, two);
  ['<p>plain [!NOTE] in a paragraph</p>', '<blockquote><p>a quote, then [!NOTE]</p></blockquote>', '<blockquote><p>[!UNKNOWN]<br>x</p></blockquote>', '<pre><code>&gt; [!NOTE]</code></pre>', '', '<p>no marker at all</p>']
    .forEach(function (h) { assert.equal(A(h), h); });
});

test('alerts: the builders take them in addFromHtml — but the slides, which read the marker themselves', function () {
  assert.equal(PptxBuilder.OWN_ALERTS, true);
  assert.equal(BuilderBase.OWN_ALERTS, undefined);
});
