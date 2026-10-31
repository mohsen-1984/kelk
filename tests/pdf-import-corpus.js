/**
 * PDF import test corpus: expectations for PdfImporter when reading external PDFs.
 *
 * Each entry maps a PDF file name pattern (the part before .pdf) to its reference
 * corpus document (the --<doc> suffix) and the producer family.  The thresholds set
 * the minimum acceptable recall, order and structure scores for that producer+doc
 * combination; a test runner compares PdfImporter output against the corpus .md and
 * flags any case that drops below.
 *
 * Producer families (matched against PdfImporter._producer):
 *   skia          Chrome / Edge "Save as PDF" (Skia/PDF)
 *   skia-headless Chrome / Edge headless (Playwright, Puppeteer)
 *   msprint       Microsoft Print to PDF
 *   word          Microsoft Word "Save As PDF"
 *   libreoffice   LibreOffice Writer / Calc / Impress → PDF
 *   wkhtmltopdf   wkhtmltopdf (Qt)
 *   weasyprint    WeasyPrint
 *   excel-lo      Excel → LibreOffice Calc → PDF
 *   jspdf         Kelk's own PdfBuilder (jsPDF)
 *
 * Structure scoring keys: headings, lists, tables, code, quotes
 *   — each is the share of that markup the importer recovered.
 *
 * Used by:  tests/pdf-lab/ (the same corpus names; its run-import.js does not check these thresholds yet)
 *           tests/pdf-import-suite.html    (browser, user-selected PDFs; the documents from tests/pdf-lab/corpus.js)
 */

var IMPORT_CORPUS = (function () {
  'use strict';

  // --- producer detection from _producer string -----------------------------------
  var PRODUCERS = [
    { id: 'jspdf',        re: /jsPDF/i },
    { id: 'skia-headless', re: /Skia\/PDF/i, noLang: true },   // headless: no Language metadata
    { id: 'skia',          re: /Skia\/PDF/i },
    { id: 'word',          re: /Microsoft.*Word/i },
    { id: 'msprint',       re: /Microsoft.*Print To PDF/i },
    { id: 'libreoffice',   re: /LibreOffice/i },
    { id: 'wkhtmltopdf',   re: /wkhtmltopdf|Qt\s+\d/i },
    { id: 'weasyprint',    re: /WeasyPrint/i },
    { id: 'excel-lo',      re: /LibreOffice.*Calc/i }
  ];

  function detectProducer(producerStr, lang) {
    for (var i = 0; i < PRODUCERS.length; i++) {
      var p = PRODUCERS[i];
      if (p.re.test(producerStr)) {
        if (p.noLang && lang) continue;    // skia-headless: no Language field
        return p.id;
      }
    }
    return 'unknown';
  }

  // --- score thresholds by producer family ----------------------------------------
  // { recall, order, headings, lists, tables, code, quotes }
  //   — undefined means "don't check" (the corpus doc has no such structure)
  var DEFAULT_THRESHOLDS = { recall: 0.90, order: 0.85 };

  var PRODUCER_THRESHOLDS = {
    'skia':          { recall: 0.95, order: 0.92 },
    'skia-headless': { recall: 0.95, order: 0.92 },
    'word':          { recall: 0.90, order: 0.85 },
    'msprint':       { recall: 0.90, order: 0.85 },
    'libreoffice':   { recall: 0.88, order: 0.82 },
    'wkhtmltopdf':   { recall: 0.85, order: 0.80 },
    'weasyprint':    { recall: 0.85, order: 0.80 },
    'excel-lo':      { recall: 0.85, order: 0.80 },
    'jspdf':         { recall: 0.97, order: 0.95 }    // Kelk's own output: highest bar
  };

  // --- per-case overrides (name → thresholds that replace the producer defaults) ---
  // Cases where we know the score is lower and accept it for now.
  var CASE_OVERRIDES = {
    // wkhtmltopdf lists lose bullet symbols
    'wk--features':    { lists: 0.60 },
    'wk--symbols':     { lists: 0.50 },
    // LibreOffice Writer HTML import: lower recall
    'lohtml--article': { recall: 0.82 },
    'lohtml--readme':  { recall: 0.80 },
    // Impress deck: list bullets may be images
    'impress--deck':   { lists: 0.70 },
    // calc / Excel tables
    'calc--orders':    { recall: 0.75, tables: 0.70 },
    'calc--survey':    { recall: 0.75, tables: 0.70 }
  };

  // --- corpus documents: the --<doc> suffix maps to a reference .md ---------------
  // These are the files tests/pdf-lab/corpus/<doc>.md
  var CORPUS_DOCS = [
    'article', 'readme', 'report', 'features', 'symbols', 'deck',
    'monobody', 'orders', 'survey',
    'layout-columns', 'layout-figure', 'layout-sidebar',
    'word-rich', 'word-tables',
    'xl-plain', 'xl-sales', 'xl-multi', 'xl-long', 'xl-wide',
    'xl-border-black', 'xl-border-none', 'xl-border-white'
  ];

  // --- public API -----------------------------------------------------------------
  return {
    PRODUCERS: PRODUCERS,
    detectProducer: detectProducer,
    DEFAULT_THRESHOLDS: DEFAULT_THRESHOLDS,
    PRODUCER_THRESHOLDS: PRODUCER_THRESHOLDS,
    CASE_OVERRIDES: CASE_OVERRIDES,
    CORPUS_DOCS: CORPUS_DOCS,

    /** Get the effective thresholds for a test case name and its detected producer. */
    thresholdsFor: function (caseName, producerId) {
      var base = PRODUCER_THRESHOLDS[producerId] || DEFAULT_THRESHOLDS;
      var over = CASE_OVERRIDES[caseName];
      if (!over) return base;
      var merged = {};
      for (var k in base) merged[k] = base[k];
      for (var k2 in over) merged[k2] = over[k2];
      return merged;
    },

    /** Extract the corpus doc name from a PDF file name: "chrome-plain--article.pdf" → "article" */
    corpusDocOf: function (pdfName) {
      var m = pdfName.replace(/\.pdf$/i, '').match(/--([\w-]+)$/);
      return m ? m[1] : null;
    }
  };
})();

if (typeof module !== 'undefined') module.exports = IMPORT_CORPUS;
