// ESLint flat config. `npm run lint` = `eslint .`; the goal is 0 errors with every real-bug rule on.
//
// Kelk ships plain browser scripts loaded in order by index.html (no modules, no build step); they share globals.
// Each group below gets the environment it actually runs in, and the cross-file globals are listed explicitly:
// readonly; the file that defines one does not see it as a global (see "Cross-file globals").
// Not linted: inline <script> blocks in *.html (index.html, tests/*.html, tools/*.html — no HTML processor installed).
'use strict';

const js = require('@eslint/js');
const globals = require('globals');

// ---- Cross-file globals -------------------------------------------------------------------------------------------

// Only names that some file reads as a bare identifier are listed; a name reached only as window.<Name> or
// global.<Name> (MathJax, jspdf, turndownPluginGfm, PdfFonts, KelkSamples, KelkWebFonts in lib/, the *Error classes,
// KELK_PDF_CORPUS, IMPORT_CORPUS) needs no entry, and a bare use of it would then be reported.
// None is writable: every defining file assigns through window./global. or declares the name with a top-level
// `var`, and for that file the entry is switched off below.

// Vendor libraries (vendor/**, loaded by index.html or the test pages before Kelk's own scripts).
const VENDOR = {
  marked: 'readonly', // vendor/marked.umd.min_*.js
  DOMPurify: 'readonly', // vendor/purify.min_*.js
  hljs: 'readonly', // vendor/highlight.js/
  TurndownService: 'readonly', // vendor/turndown/turndown_*.js
  lucide: 'readonly', // vendor/lucide.min_*.js, or assets/icons.js (a Lucide subset with the same API)
  docx: 'readonly', // vendor/docx.index.iife.min_*.js
  JSZip: 'readonly', // vendor/jszip.min_*.js
  mammoth: 'readonly', // vendor/mammoth.browser.min_*.js
  pdfjsLib: 'readonly', // vendor/pdfjs/
  PptxGenJS: 'readonly', // vendor/pptxgen.min_*.js
  XLSX: 'readonly', // vendor/xlsx.full.min_*.js (SheetJS)
  Papa: 'readonly', // vendor/papaparse.min_*.js
};

// Kelk's own libraries (lib/*.js): each is a UMD-style IIFE that sets global.<Name> in the browser
// (module.exports under Node).
const KELK_LIB = {
  BidiCore: 'readonly',
  BidiView: 'readonly',
  BuilderBase: 'readonly',
  DocxBuilder: 'readonly',
  HtmlBuilder: 'readonly',
  ImageCore: 'readonly',
  MarkdownImporter: 'readonly',
  MathCore: 'readonly',
  PdfBuilder: 'readonly',
  PdfImporter: 'readonly',
  PptxBuilder: 'readonly',
  PreviewBuilder: 'readonly',
  WordHtmlBuilder: 'readonly',
  XlsxBuilder: 'readonly',
  SheetImporter: 'readonly',
  createMsoTemplate: 'readonly', // top-level `var` in lib/msOfficeWordHtmlTemplate.js
};

// The app namespace and the font data the page loads.
const KELK_APP = {
  Kelk: 'readonly', // scripts/*.js: (function (K) { … })(window.Kelk = window.Kelk || {})
  KelkWebFonts: 'readonly', // assets/fonts/embed/*.js: (window.KelkWebFonts = window.KelkWebFonts || {})[…]
};

// Test data used by the test pages (tests/*.html) and the lab's page callbacks.
const KELK_TEST_DATA = {
  MATH_CASES: 'readonly', // tests/math-cases.js: window.MATH_CASES = …
  CORPUS: 'readonly', // tests/test-corpus.js (top-level `var` there)
};

const BROWSER_SHARED = { ...VENDOR, ...KELK_LIB, ...KELK_APP };

// UMD files in lib/ and tests/ check `typeof module` / `typeof require` (Node) and `typeof define` (AMD) so they
// also load outside the page: these names are only used behind a typeof guard, so they are readonly there, never
// full Node globals.
const UMD = { module: 'readonly', require: 'readonly', define: 'readonly' };

// ---- Rules -------------------------------------------------------------------------------------------------------

// Shared adjustments to @eslint/js recommended. Every real-bug rule (no-undef, no-dupe-keys, no-unreachable,
// no-redeclare, no-func-assign, getter-return, no-const-assign, no-self-assign, …) stays an error.
const RULES = {
  // Callback parameters before a used one are positional (e.g. (_, i) => …), and a caught error is often
  // deliberately ignored; a truly unused local is still reported, as a warning (removing one is not this plan's job).
  'no-unused-vars': ['warn', { args: 'after-used', caughtErrors: 'none', ignoreRestSiblings: true }],
  // `try { … } catch (e) {}` is the codebase's idiom for "optional feature, ignore failure"; other empty blocks
  // stay reported.
  'no-empty': ['error', { allowEmptyCatch: true }],
  // `while ((m = re.exec(s)))` regex loops: an assignment in a condition is allowed only when parenthesised.
  'no-cond-assign': ['error', 'except-parens'],
  // The text code matches control characters (U+0000–U+001F in PDF text, XML sanitising) and Arabic/Persian
  // combining marks (harakat, ZWNJ, joiners) on purpose; these rules cannot tell that from a mistake.
  'no-control-regex': 'warn',
  'no-misleading-character-class': 'warn',
  // A redundant backslash in a regex or string is harmless and very common in the hand-written regexes.
  'no-useless-escape': 'warn',
  // Mostly the defensive `let x = null; try { x = await f(); } catch (e) { x = null; }` pattern; a warning keeps the
  // occasional value that really is computed and lost visible without failing the build.
  'no-useless-assignment': 'warn',
  // Literal zero-width characters (ZWSP, ZWNJ, ZWJ, LRM/RLM, BOM) inside a regex are what the Persian/Arabic text
  // code strips on purpose; anywhere else in the code they are still an error.
  'no-irregular-whitespace': ['error', { skipRegExps: true }],
};

module.exports = [
  // ---- Not linted -----------------------------------------------------------------------------------------------
  {
    ignores: [
      'node_modules/**',
      'vendor/**', // third-party libraries
      '**/*.min.js',
      '**/*.min_*.js',
      // Encoded font data (base64), no code.
      'lib/pdf-base64-ttf-fonts/**',
      'assets/fonts/embed/**',
      // Generated: regenerated by their build scripts, never edited by hand.
      'assets/icons.js',
      'docs/about-kelk-and-samples.js',
      'docs/slides-samples.js',
      'docs/excel-samples.js',
      'tests/pdf-lab/corpus.js',
      // PDF-lab outputs (LAB_OUT defaults to tests/pdf-lab/out) and private material (.gitignore).
      'tests/pdf-lab/out/**',
      'tests/pdf-lab/real/**',
      'private/**',
    ],
  },

  js.configs.recommended,
  { rules: RULES },

  // ---- Browser scripts: lib/, scripts/, the test data files -----------------------------------------------------
  {
    files: ['lib/**/*.js', 'scripts/**/*.js', 'tests/*.js', 'tools/pdfjs-polyfills.js'],
    ignores: ['tests/docx-validate.js', 'tests/run-slides-suite.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, ...BROWSER_SHARED, ...KELK_TEST_DATA, ...UMD },
    },
  },

  // The file that defines a shared name with a top-level `var` owns it: there it is a declaration, not a global
  // (otherwise no-redeclare reports the declaration against the global list above).
  { files: ['lib/msOfficeWordHtmlTemplate.js'], languageOptions: { globals: { createMsoTemplate: 'off' } } },
  { files: ['tests/test-corpus.js'], languageOptions: { globals: { CORPUS: 'off' } } },

  // The importer's stages stay split into one function per step (map in lib/pdfimport/README.md).
  { files: ['lib/pdfimport/**/*.js'], rules: { 'max-lines-per-function': ['error', { max: 150 }] } },

  // ---- Node CommonJS: build tools, PDF-lab scripts, this file ---------------------------------------------------
  // The lab scripts also pass callbacks to Playwright's page.evaluate()/waitForFunction(), which run inside Kelk's
  // page; those callbacks read the page's globals, so Kelk's globals and window/document are readonly there too.
  // Not the whole browser set: names like `name`, `status`, `close`, `event` would hide a typo in the Node code.
  {
    // tests/unit: Node's test runner + jsdom (the page's objects are reached through the jsdom window `w`)
    files: ['tools/*.js', 'eslint.config.js', 'tests/unit/**/*.js'],
    ignores: ['tools/pdfjs-polyfills.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { ...globals.node } },
  },
  {
    // tests/docx-validate.js and tests/golden/: Node scripts driving tests/builder-suite.html with Playwright,
    // like the lab's
    files: ['tests/pdf-lab/scripts/**/*.js', 'tests/docx-validate.js', 'tests/golden/**/*.js', 'tests/run-slides-suite.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        window: 'readonly',
        document: 'readonly',
        ...BROWSER_SHARED,
        ...KELK_TEST_DATA,
      },
    },
    rules: {
      // `(s.match(re) || [, fallback])[1]` deliberately mimics a match array whose index 0 is unused.
      'no-sparse-arrays': 'warn',
    },
  },
];
