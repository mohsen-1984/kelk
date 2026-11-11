/**
 * The imported file's information in the import report (scripts/fileinfo.js, 2.7): what the file says, as it says it
 * (dates only laid out), and what Kelk infers in a group of its own, labelled a guess — the operating system only when
 * the file itself names it, never from the fonts. The module in Node (its zip reader on the lab's own .docx / .xlsx),
 * then an HTML import through the app: the report panel shows the information closed, and nothing for a bare file.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { appWindow, ROOT } = require('./helpers');

const FI = require('../../scripts/fileinfo.js');
const { provenance } = require('../../lib/PdfImporter.js');

// the module's words, English, as Kelk.i18n.t would give them
globalThis.Kelk = {
  i18n: {
    t: function (key) {
      let s = FI.STRINGS.en[key] || key;
      for (let i = 1; i < arguments.length; i++) s = s.replace('{' + (i - 1) + '}', arguments[i]);
      return s;
    }
  }
};
const rows = (info) => Object.fromEntries(info.said.map((r) => [r[0], r[1]]));
const guesses = (info) => Object.fromEntries(info.guess.map((r) => [r[0], r[1]]));

test('dates are laid out, never converted; only the parts the file gives', function () {
  assert.equal(FI._date("D:20261111093000+03'30'"), '2026-11-11 09:30:00 +03:30');
  assert.equal(FI._date('D:20261111093000Z'), '2026-11-11 09:30:00 UTC');
  assert.equal(FI._date("D:20261111093000-05'00"), '2026-11-11 09:30:00 -05:00');
  assert.equal(FI._date('D:2026'), '2026');
  assert.equal(FI._date('D:20261111'), '2026-11-11');
  assert.equal(FI._date('2026-11-11T06:00:00Z'), '2026-11-11 06:00:00 UTC');
  assert.equal(FI._date('2026-11-11T09:30:00.120+03:30'), '2026-11-11 09:30:00 +03:30');
  assert.equal(FI._date('last Tuesday'), 'last Tuesday');
});

test('page size in millimetres, a paper name when it is one', function () {
  assert.equal(FI._pageSize([595.28, 841.89]), '210 × 297 mm (A4)');
  assert.equal(FI._pageSize([792, 612]), '279 × 216 mm (Letter)');
  assert.equal(FI._pageSize([500, 500]), '176 × 176 mm');
  assert.equal(FI._pageSize(null), null);
});

test('a PDF: the file’s words, then the guesses; the OS only when the file names it', function () {
  const info = {
    title: 'گزارش',
    author: null,
    creator: 'Microsoft® Word 2024',
    producer: 'Microsoft® Word 2024',
    creatorTool: 'Microsoft® Word 2024',
    created: "D:20261103100649+03'30'",
    pdfVersion: '1.7',
    pages: 3,
    pageSize: [595.28, 841.89],
    lang: 'fa-IR',
    tagged: true,
    outline: 0,
    pageLabels: false,
    encrypted: false,
    fonts: ['BNazanin', 'Calibri *'],
    history: []
  };
  // Word, the OS only from the fonts: no OS row
  let r = FI.fromPdf({
    info: info,
    profile: provenance({ producer: info.producer, creator: info.creator, fonts: ['ABCDEF+Segoe UI Symbol'] })
  });
  let said = rows(r);
  assert.equal(said.fi_title, 'گزارش');
  assert.equal(said.fi_creator, 'Microsoft® Word 2024');
  assert.equal(said.fi_creatorTool, undefined, 'the XMP tool only when it says something else');
  assert.equal(said.fi_created, '2026-11-03 10:06:49 +03:30');
  assert.equal(said.fi_pageSize, '210 × 297 mm (A4)');
  assert.equal(said.fi_author, undefined, 'no row for what the file does not say');
  assert.equal(said.fi_encrypted, undefined);
  assert.deepEqual(said.fi_tagged, { t: 'fi_yes', args: [] });
  const g = guesses(r);
  assert.equal(g.fi_maker, 'Word');
  assert.equal(g.fi_os, undefined, 'no OS from the fonts');
  const text = FI.lines(r).join('\n');
  assert.match(text, /Fonts: BNazanin, Calibri \* — \* not embedded/);
  assert.match(text, /Kelk’s reading \(a guess: not written in the file\)/);
  assert.match(
    text,
    /Production path: exported directly \(Save as PDF\) \(evidence: from the application and producer names in the file\)/
  );
  // Chrome on Windows: the User-Agent names it
  r = FI.fromPdf({
    info: { pages: 1 },
    profile: provenance({
      producer: 'Skia/PDF m141',
      creator: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0.0.0 Safari/537.36'
    })
  });
  assert.equal(guesses(r).fi_os, 'Windows');
  assert.match(
    FI.lines(r).join('\n'),
    /Operating system: Windows \(evidence: the browser’s User-Agent in the file: Windows NT 10\.0; Win64; x64\)/
  );
  // Microsoft Print to PDF
  r = FI.fromPdf({ info: { pages: 1 }, profile: provenance({ producer: 'Microsoft: Print To PDF', creator: '' }) });
  assert.match(
    FI.lines(r).join('\n'),
    /Operating system: Windows \(evidence: Microsoft Print to PDF exists on Windows only\)/
  );
  // nothing known: nothing to show
  assert.equal(FI.any(FI.fromPdf({ info: {}, profile: {} })), false);
});

test('a .docx and an .xlsx: docProps through the module’s own zip reader', async function () {
  const lab = path.join(ROOT, 'tests', 'pdf-lab', 'corpus');
  const docx = await FI.fromOffice(fs.readFileSync(path.join(lab, 'real-src', 'real-report-fa.docx')));
  const d = rows(docx);
  assert.equal(d.fi_app, 'Microsoft Office Word (16.0000)');
  assert.equal(d.fi_template, 'Normal.dotm');
  assert.match(d.fi_created, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$/);
  const xlsx = await FI.fromOffice(fs.readFileSync(path.join(lab, 'xl-wide.xlsx')));
  assert.match(rows(xlsx).fi_app, /Openpyxl/);
  assert.equal(FI.any(await FI.fromOffice(new Uint8Array(40))), false, 'not a zip: nothing');
});

test('an HTML file: its title, generator and language', function () {
  const info = FI.fromHtml(
    '<html lang="fa"><head><meta charset="utf-8"><title>گزارش &amp; نمونه</title>' +
      '<meta content="Kelk 2.6" name="generator"><meta name=author content=\'Kelk\'></head></html>'
  );
  assert.deepEqual(rows(info), {
    fi_title: 'گزارش & نمونه',
    fi_author: 'Kelk',
    fi_generator: 'Kelk 2.6',
    fi_lang: 'fa'
  });
  assert.equal(FI.any(FI.fromHtml('<p>no head</p>')), false);
});

test('an HTML import shows its information in the report panel, closed; a bare one shows no panel', async function () {
  const { window: w, errors } = await appWindow({
    'kelk.ui': JSON.stringify({ lang: 'en', sampleSeen: true }),
    'kelk.content': '# T'
  });
  const K = w.Kelk;
  const html =
    '<html lang="en"><head><title>A page</title><meta name="generator" content="Kelk 2.6"></head><body><p>Hi</p></body></html>';
  await K.importer.fromFile(new w.File([html], 'page.html', { type: 'text/html' }));
  const box = w.document.getElementById('import-report');
  assert.equal(box.hidden, false, 'the panel shows');
  assert.equal(w.document.querySelector('#import-report-title span').textContent, 'Import report');
  const d = box.querySelector('details.report-info');
  assert.ok(d, 'the file information');
  assert.equal(d.open, false, 'closed by default');
  assert.match(d.textContent, /TitleA page/);
  assert.match(d.textContent, /GeneratorKelk 2\.6/);
  assert.match(K.ui.report.text(), /- Generator: Kelk 2\.6/);
  await K.importer.fromFile(new w.File(['<p>Only a paragraph</p>'], 'bare.html', { type: 'text/html' }));
  assert.equal(box.hidden, true, 'nothing to show: no panel');
  assert.deepEqual(errors, []);
  w.close();
});
