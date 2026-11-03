// The provenance profile (PdfImporter.provenance, PDFIMPORT.md §2a), tested two ways:
//   1. the pure function on the Info / XMP / fonts of producers the lab cannot make (Word, Quartz, a
//      desktop Chrome's User-Agent, InDesign, Distiller, Ghostscript over Word, an OCR layer …) — strings
//      taken from real files of those kinds
//   2. every PDF of pdf/ (and fuzz/dev when made) through the importer: the engine its file name promises, the
//      structure tree's trust, and the tree's headings against the source's
//   node scripts/profile.js [--all]      --all prints each lab file's whole profile
// Exit code 1 when an expectation fails.
const fs = require('fs'), path = require('path');
const { KELK, LAB, FUZZ, lab, req } = require('./env.js');
const PdfImporter = require(path.join(KELK, 'lib', 'PdfImporter.js'));
const P = PdfImporter.provenance;
const { structure } = require('./score.js');
let failed = 0;
const check = (name, got, want) => {
  const bad = Object.keys(want).filter((k) => {
    const g = k.split('.').reduce((o, x) => (o == null ? o : o[x]), got), w = want[k];
    return w instanceof RegExp ? !w.test(String(g)) : typeof w === 'function' ? !w(g) : g !== w;
  });
  if (bad.length) { failed++; console.log('✗', name.padEnd(44), bad.map((k) => k + ': got ' + JSON.stringify(k.split('.').reduce((o, x) => (o == null ? o : o[x]), got)) + ', want ' + want[k]).join('; ')); }
  else console.log('✓', name.padEnd(44), [got.engine, got.app, got.os.value ? got.os.value + ' ' + got.os.confidence : '-', got.path].join(' · '));
};

// ── 1. producers the lab cannot make ──────────────────────────────────
console.log('— the pure function, on producers from real files\n');
const CASES = [
  ['Chrome on Windows, Save as PDF', { producer: 'Skia/PDF m141', creator: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36' },
    { engine: 'skia', app: 'Chrome', 'os.value': 'windows', version: '141.0.0.0', path: 'export', hyphenates: false }],
  ['Edge on Windows', { producer: 'Skia/PDF m140', creator: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0' },
    { engine: 'skia', app: 'Edge', 'os.value': 'windows' }],
  ['Chrome on macOS', { producer: 'Skia/PDF m141', creator: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36' },
    { engine: 'skia', app: 'Chrome', 'os.value': 'macos' }],
  ['Chrome on Linux', { producer: 'Skia/PDF m141', creator: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36' },
    { engine: 'skia', 'os.value': 'linux' }],
  ['Google Docs', { producer: 'Skia/PDF m141 Google Docs Renderer', creator: '' }, { engine: 'skia', app: 'Google Docs', 'os.value': null }],
  ['Safari on macOS', { producer: 'macOS Version 14.5 (Build 23F79) Quartz PDFContext', creator: 'Safari' },
    { engine: 'quartz', app: 'Safari', 'os.value': 'macos', 'os.confidence': 0.95, hyphenates: false }],
  ['Word for Mac, Best for printing', { producer: 'macOS Version 15.1 (Build 24B83) Quartz PDFContext', creator: 'Microsoft® Word for Microsoft 365' },
    { engine: 'quartz', app: 'Word', 'os.value': 'macos' }],
  ['Safari on iPhone', { producer: 'iOS Version 18.1 (Build 22B83) Quartz PDFContext', creator: '' }, { engine: 'quartz', 'os.value': 'ios' }],
  ['Word on Windows, Save as PDF', { producer: 'Microsoft® Word for Microsoft 365', creator: 'Microsoft® Word for Microsoft 365', marked: true,
    fonts: ['BCDEEE+BNazanin', 'BCDFEE+Calibri', 'BCDGEE+Segoe UI Symbol'] },
    { engine: 'word', app: 'Word', path: 'export', 'os.value': 'windows', 'os.confidence': (c) => c < 0.6, hyphenates: false }],
  ['Excel 2019', { producer: 'Microsoft® Excel® 2019', creator: 'Microsoft® Excel® 2019' }, { engine: 'excel', app: 'Excel' }],
  ['Microsoft Print to PDF', { producer: 'Microsoft: Print To PDF', creator: 'Microsoft Word - report.docx' },
    { engine: 'gdi', path: 'print', 'os.value': 'windows', 'os.confidence': 0.95 }],
  ['LibreOffice Writer, DejaVu fonts', { producer: 'LibreOffice 24.2', creator: 'Writer', fonts: ['AAAAAA+DejaVuSans', 'BAAAAA+DejaVuSerif'] },
    { engine: 'libreoffice', app: 'Writer', 'os.value': 'linux', 'os.confidence': (c) => c <= 0.4 }],
  ['InDesign on a Mac', { producer: 'Adobe PDF Library 17.0', creator: 'Adobe InDesign 19.0 (Macintosh)' },
    { engine: 'indesign', 'os.value': 'macos', hyphenates: true }],
  ['Distiller on Windows', { producer: 'Acrobat Distiller 23.0 (Windows)', creator: 'PScript5.dll Version 5.2.2' },
    { engine: 'distiller', 'os.value': 'windows', path: 'print' }],
  ['Word through Acrobat PDFMaker', { producer: 'Adobe PDF Library 23.1.175', creator: 'Acrobat PDFMaker 23 for Word' }, { engine: 'distiller', app: 'Word' }],
  ['Word, then Ghostscript (ps2pdf)', { producer: 'GPL Ghostscript 10.02.1', creator: 'Microsoft® Word for Microsoft 365' },
    { engine: 'word', path: 'postprocessed', postprocessors: (a) => a.indexOf('Ghostscript') >= 0 }],
  ['Chrome, then iLovePDF', { producer: 'iLovePDF', creator: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36' },
    { engine: 'skia', app: 'Chrome', path: 'postprocessed', 'os.value': 'windows' }],
  ['pdfTeX', { producer: 'pdfTeX-1.40.26', creator: 'LaTeX with hyperref' }, { engine: 'tex', app: 'pdfTeX', hyphenates: true, 'os.value': null }],
  ['XeLaTeX (xdvipdfmx)', { producer: 'xdvipdfmx (20240305)', creator: 'LaTeX with hyperref' }, { engine: 'tex', app: 'xdvipdfmx' }],
  // (real files, October 2026: Firefox's "Save to PDF" now draws with Skia, Creator "Firefox"; cairo stays for GTK apps)
  ['Firefox (Skia)', { producer: 'Skia/PDF m149', creator: 'Firefox' }, { engine: 'skia', app: 'Firefox', 'os.value': null, hyphenates: false }],
  ['cairo (a GTK application, older Firefox)', { producer: 'cairo 1.18.0 (https://cairographics.org)', creator: 'Mozilla Firefox 131.0' }, { engine: 'cairo', app: 'Firefox', hyphenates: false }],
  ['Opera (an Android User-Agent)', { producer: 'Skia/PDF m152', creator: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36 OPR/92.0.0.0' },
    { engine: 'skia', app: 'Opera', 'os.value': 'android' }],
  ['Edge on Windows (a real file)', { producer: 'Skia/PDF m155', creator: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36 Edg/155.0.0.0' },
    { engine: 'skia', app: 'Edge', 'os.value': 'windows', version: '155.0.0.0' }],
  ['A Stripe invoice (no Info at all)', { producer: '', creator: '' }, { engine: 'unknown', app: null }],
  ['WPS Writer', { producer: 'WPS Writer', creator: 'WPS Writer' }, { engine: 'wps' }],
  ['A scan with an OCR layer', { producer: 'ABBYY FineReader PDF 16', creator: '', invisibleShare: 0.98 }, { engine: 'ocr', path: 'ocr' }],
  ['OCRmyPDF over a scanner', { producer: 'pikepdf 8.15.1', creator: 'ocrmypdf 16.0.4 / Tesseract OCR-PDF 5.3.4', invisibleShare: 0.97 }, { path: 'ocr' }],
  ['XMP only (Info stripped)', { producer: '', creator: '', xmp: '<x:xmpmeta><rdf:Description pdf:Producer="Skia/PDF m120" xmp:CreatorTool="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0"/></x:xmpmeta>' },
    { engine: 'skia' }],
  ['XMP history (Word, then Acrobat)', { producer: 'Adobe Acrobat Pro (64-bit) 24.2.0', creator: 'Microsoft® Word for Microsoft 365',
    xmp: '<stEvt:softwareAgent>Microsoft® Word for Microsoft 365</stEvt:softwareAgent><stEvt:softwareAgent>Adobe Acrobat Pro (64-bit) 24.2.0</stEvt:softwareAgent>' },
    { engine: 'word', path: 'postprocessed' }],
  ['A Mac font set, no other evidence', { producer: 'Unknown Writer 1.0', creator: '', fonts: ['ABCDEF+HelveticaNeue', 'ABCDEG+Menlo-Regular'] },
    { 'os.value': 'macos', 'os.confidence': 0.55 }],
  ['Nothing at all', { producer: '', creator: '' }, { engine: 'unknown', 'os.value': null, path: 'unknown', hyphenates: true }],
  // (the lab's real producers, pdf/real-producers: Office LTSC 2024 on Windows 11, November 2026 — make-real.ps1, make-real.js)
  ['Word 2024, Save as PDF', { producer: 'Microsoft® Word 2024', creator: 'Microsoft® Word 2024', marked: true }, { engine: 'word', app: 'Word', path: 'export' }],
  ['Excel LTSC, Save as PDF', { producer: 'Microsoft® Excel® LTSC', creator: 'Microsoft® Excel® LTSC' }, { engine: 'excel', app: 'Excel', path: 'export' }],
  ['PowerPoint 2024, Save as PDF', { producer: 'Microsoft® PowerPoint® 2024', creator: 'Microsoft® PowerPoint® 2024' }, { engine: 'powerpoint', app: 'PowerPoint', path: 'export' }],
  ['Microsoft Print to PDF (no Creator: Excel, PowerPoint)', { producer: 'Microsoft: Print To PDF', creator: '' },
    { engine: 'gdi', path: 'print', 'os.value': 'windows', 'os.confidence': 0.95 }],
  ['Edge headless (--print-to-pdf)', { producer: 'Skia/PDF m156', creator: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.0.0 Safari/537.36 Edg/156.0.0.0' },
    { engine: 'skia', app: 'Edge', 'os.value': 'windows', version: '156.0.0.0' }],
  ['Firefox 152 printing (WebDriver BiDi)', { producer: 'cairo 1.18.4 (https://cairographics.org)', creator: 'Mozilla Firefox 152.0.3' }, { engine: 'cairo', app: 'Firefox' }]
];
CASES.forEach(([name, m, want]) => check(name, P(m), want));

// ── 2. the lab's own PDFs, through the importer ───────────────────────
const PREFIX = [[/^calc--/, { engine: 'libreoffice', app: 'Calc' }], [/^impress--/, { engine: 'libreoffice', app: 'Impress' }],
  [/^(lowriter|kelkdocx-lo|pandoc-lo)--/, { engine: 'libreoffice', app: 'Writer' }], [/^lohtml--/, { engine: 'libreoffice' }],
  [/^chrome-|-chr--/, { engine: 'skia', path: 'export' }],
  [/^word2024-save--/, { engine: 'word', app: 'Word' }], [/^excel2024--/, { engine: 'excel', app: 'Excel' }], [/^ppt2024--/, { engine: 'powerpoint', app: 'PowerPoint' }],
  [/^msprint-/, { engine: 'gdi', path: 'print' }], [/^edge--/, { engine: 'skia', app: 'Edge' }], [/^firefox--/, { engine: 'cairo', app: 'Firefox' }], [/^wk-|-wk--/, { engine: 'qt', app: 'wkhtmltopdf' }], [/^kelk--/, { engine: 'jspdf' }], [/^ocr-tesseract--/, { engine: 'ocr', path: 'ocr' }]];
(async () => {
  const { chromium } = req('playwright');
  const browser = await chromium.launch(), page = await browser.newPage();
  await page.goto(lab);
  const dirs = [path.join(LAB, 'pdf')].concat(['dev'].map((s) => path.join(FUZZ, s)).filter((d) => fs.existsSync(d)));   // (never held-out: its files are not inspected)
  console.log('\n— the lab\'s PDFs through the importer (' + dirs.map((d) => path.relative(LAB, d)).join(', ') + ')\n');
  const tally = {}, headStats = [];
  for (const dir of dirs) {
    for (const { name: f, file } of require('./env.js').labPdfs(dir)) {
      const b64 = fs.readFileSync(file).toString('base64');
      const prof = await page.evaluate(async (b64) => {
        const bin = atob(b64), u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        try { const r = await PdfImporter.create({ images: 'drop' }).fromArrayBuffer(u.buffer); return Object.assign({}, r.profile, { _structure: r.structure }); } catch (e) { return { error: String(e) }; }
      }, b64);
      const rule = PREFIX.find(([re]) => re.test(f));
      const key = prof.error ? 'ERROR' : [prof.engine, prof.app, prof.os.value || '-', prof.path, prof.tagged.structTree ? 'struct' : 'nostruct'].join(' · ');
      tally[key] = (tally[key] || 0) + 1;
      if (prof.error) { failed++; console.log('✗', f, prof.error); continue; }
      if (rule) { const bad = Object.keys(rule[1]).filter((k) => prof[k] !== rule[1][k]);
        if (bad.length) { failed++; console.log('✗', f.padEnd(44), bad.map((k) => k + ': ' + prof[k] + ' ≠ ' + rule[1][k]).join('; ')); } }
      // the structure tree (PdfImporter._structure): trust as the audit expects, headings as the source has them
      const t = prof.tagged || {};
      const trustRule = /^calc--/.test(f) ? (x) => x < 0.05 : /^(chrome-tagged|kelkdocx-lo|pandoc-lo|lowriter|impress)--/.test(f) ? (x) => x >= 0.5 : !t.structTree ? (x) => x === 0 : null;
      if (trustRule && !trustRule(t.trust)) { failed++; console.log('✗', f.padEnd(44), 'trust ' + t.trust + ' (cover ' + t.cover + ', sem ' + t.sem + ')'); }
      const doc = (f.match(/--([\w-]+)\.pdf$/) || [])[1], src = doc && path.join(LAB, 'corpus', doc + '.md');
      if (prof._structure && src && fs.existsSync(src)) {
        // (case folded: a style may set headings in capitals, and the tree keeps the drawn text)
        const want = structure(fs.readFileSync(src, 'utf8').toLowerCase()).headings;
        const got = prof._structure.filter((e) => /^H[1-6]$/.test(e.role)).map((e) => e.level + ':' + e.text.toLowerCase());
        if (want.length && got.length) {
          const bag = new Map(); got.forEach((x) => bag.set(x, (bag.get(x) || 0) + 1));
          let hit = 0; want.forEach((x) => { const n = bag.get(x) || 0; if (n) { hit++; bag.set(x, n - 1); } });
          const pr = hit / got.length, rc = hit / want.length, f1 = pr + rc ? 2 * pr * rc / (pr + rc) : 0;
          headStats.push([f, f1]);
          if (/^chrome-tagged--/.test(f) && f1 < 0.99) { failed++; console.log('✗', f.padEnd(44), 'tree headings F1 ' + f1.toFixed(2)); }
        }
      }
      delete prof._structure;
      if (process.argv.includes('--all')) console.log(f.padEnd(44), JSON.stringify(prof));
    }
  }
  Object.keys(tally).sort().forEach((k) => console.log(String(tally[k]).padStart(4), ' ', k));
  if (headStats.length) {
    console.log('\n— the structure trees\' headings against the source\'s (level and text, F1)\n');
    const by = {}; headStats.forEach(([f, x]) => { const k = f.replace(/--.*$/, '').replace(/^fz\d+-/, 'fuzz-'); (by[k] = by[k] || []).push(x); });
    Object.keys(by).sort().forEach((k) => console.log('  ' + k.padEnd(20), String(by[k].length).padStart(4), 'files, mean', (100 * by[k].reduce((a, b) => a + b, 0) / by[k].length).toFixed(1)));
  }
  await browser.close();
  console.log(failed ? '\n' + failed + ' failed' : '\nall passed');
  process.exitCode = failed ? 1 : 0;
})();
