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

test('alerts: the marker becomes a bold label, by the quote\'s language', function () {
  assert.equal(A('<blockquote>\n<p>[!WARNING]<br><strong>متن پنهان</strong>: این بخش متنی است</p>\n</blockquote>'),
    '<blockquote>\n<p><strong>هشدار</strong><br><strong>متن پنهان</strong>: این بخش متنی است</p>\n</blockquote>');
  assert.equal(A('<blockquote><p>[!NOTE]\nA short note.</p></blockquote>'), '<blockquote><p><strong>Note</strong><br>A short note.</p></blockquote>');
  assert.equal(A('<blockquote dir="rtl"><p>[!TIP]<br/>هذا نص عربي قصير</p></blockquote>'), '<blockquote dir="rtl"><p><strong>نصيحة</strong><br>هذا نص عربي قصير</p></blockquote>');
  assert.equal(A('<blockquote><p>[!caution]</p><p>Two paragraphs.</p></blockquote>'), '<blockquote><p><strong>Caution</strong></p><p>Two paragraphs.</p></blockquote>');
});

test('alerts: each quote by its own text; what is no alert stays', function () {
  const two = A('<blockquote><p>[!IMPORTANT]<br>English first.</p></blockquote><p>between</p><blockquote><p>[!IMPORTANT]<br>سپس فارسی</p></blockquote>');
  assert.ok(two.indexOf('<strong>Important</strong><br>English first.') > 0 && two.indexOf('<strong>مهم</strong><br>سپس فارسی') > 0, two);
  ['<p>plain [!NOTE] in a paragraph</p>', '<blockquote><p>a quote, then [!NOTE]</p></blockquote>', '<blockquote><p>[!UNKNOWN]<br>x</p></blockquote>', '<pre><code>&gt; [!NOTE]</code></pre>', '', '<p>no marker at all</p>']
    .forEach(function (h) { assert.equal(A(h), h); });
});

test('alerts: the builders take them in addFromHtml — but the slides, which read the marker themselves', function () {
  assert.equal(PptxBuilder.OWN_ALERTS, true);
  assert.equal(BuilderBase.OWN_ALERTS, undefined);
});
