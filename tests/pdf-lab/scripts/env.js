// Paths and modules for the PDF lab scripts. Kelk's root is three folders up (tests/pdf-lab/scripts);
// set KELK=… to test another copy, KELK_ORIG=… for run-real.js's "before" column, and NODE_TOOLS=… for a
// node_modules folder that holds playwright / docx when they are not installed next to the scripts.
const path = require('path');
const KELK = path.resolve(process.env.KELK || path.join(__dirname, '..', '..', '..'));
const LAB = path.resolve(__dirname, '..');
// a module from next to the scripts, else NODE_TOOLS, else /opt/npm-tools/node_modules (the Linux lab box) when it exists
function req(name) {
  try { return require(name); } catch (e) { /* not installed next to the scripts */ }
  const dirs = [process.env.NODE_TOOLS, '/opt/npm-tools/node_modules'].filter((d, i) => d && (i === 0 || require('fs').existsSync(d)));
  for (const d of dirs) {
    try { return require(path.join(d, name)); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
  }
  throw new Error('cannot load ' + name + (dirs.length ? ' (looked in ' + dirs.join(', ') + ')' : '') +
    ': run `npm ci` in the repository root (package.json), or install it in a folder outside the repository and set NODE_TOOLS to its node_modules');
}
// LAB_OUT=… puts the results elsewhere (the gate compares two output folders: two versions of the importer on
// the same PDFs); LAB_FUZZ=… reads the fuzzed PDFs from another folder
const OUT = path.resolve(process.env.LAB_OUT || path.join(LAB, 'out'));
const FUZZ = path.resolve(process.env.LAB_FUZZ || path.join(LAB, 'fuzz'));
require('fs').mkdirSync(OUT, { recursive: true });
// The script files of one version of the importer, in load order: a Kelk folder, its lib/ folder, or its
// lib/PdfImporter.js — the core, then the parts in lib/pdfimport/ (an older single-file version has none).
function importerFiles(where) {
  const fs = require('fs');
  let core = path.resolve(where);
  if (fs.statSync(core).isDirectory()) core = fs.existsSync(path.join(core, 'lib', 'PdfImporter.js')) ? path.join(core, 'lib', 'PdfImporter.js') : path.join(core, 'PdfImporter.js');
  const dir = path.join(path.dirname(core), 'pdfimport');
  const parts = ['thresholds', 'calibration', 'extract', 'lines', 'regions', 'ladder', 'order', 'blocks'].map((p) => path.join(dir, p + '.js')).filter((f) => fs.existsSync(f));
  return [core].concat(parts);
}

// pdf/ is grouped by what a file tests (README, «The producers»); a file's group follows from its name, so a
// generator writes through pdfPath(name) and a runner lists them all with labPdfs() — names stay unique across groups
//   en/         the English corpus through every producer we can run (browsers, wkhtmltopdf, LibreOffice, pandoc, Kelk, OCR)
//   rtl/        the right-to-left corpus through the same producers
//   office/     the office files (sheets, a deck, Word documents) through LibreOffice
//   pages/      single documents made for one layout problem (web layouts, layers, forms, templates, pictures, cards)
//   producers/  producers we cannot run here, imitated glyph by glyph (Word, PowerPoint, Prince, iText, Acrobat, Adobe PDF Library)
//   real-producers/  the real programs on Windows: Word, Excel, PowerPoint 2024 (Save as PDF), Microsoft Print to PDF, Edge,
//               Chrome, Firefox — our own documents (corpus/real-*) and the lab's office files (make-real.ps1, make-real.js)
const PDF_GROUPS = [
  ['real-producers', /^(word2024-save|msprint-(word|excel|ppt)|excel2024|ppt2024|edge|chrome|firefox)--/],
  ['producers', /^(word\d*-|pptx-|prince-|itext-|acrobat-|pdflib-)/],
  ['office', /^(calc--|impress--|lowriter--word-)/],
  ['pages', /^(chrome-(layout|layers|template|web-rtl|headtable|positioned|float-tagged|pictures|card|fa-links|form|letterhead)--|wk-pictures--|lowriter--merged)/],
  ['rtl', /^(chrome-rtl-|wk-rtl--|lohtml-rtl--)|--(fa|ar)-/],
  ['en', /./]
];
function pdfGroup(name) { return PDF_GROUPS.find(([, re]) => re.test(path.basename(name)))[0]; }
function pdfPath(name) {
  const dir = path.join(LAB, 'pdf', pdfGroup(name));
  require('fs').mkdirSync(dir, { recursive: true });
  return path.join(dir, path.basename(name));
}
// every PDF under a folder (default: the lab's pdf/), sorted by file name: [{ name: 'x--doc.pdf', file: full path }]
function labPdfs(root) {
  const fs = require('fs');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : /\.pdf$/i.test(e.name) ? [path.join(d, e.name)] : []);
  return walk(root || path.join(LAB, 'pdf')).map((f) => ({ name: path.basename(f), file: f })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}
// a file:// URL for a local path on any platform ('file://' + path breaks on Windows drive letters and spaces)
const fileUrl = (f) => require('url').pathToFileURL(path.resolve(f)).href;
module.exports = { pdfPath, pdfGroup, labPdfs, importerFiles, fileUrl, KELK, LAB, OUT, FUZZ, ORIG: process.env.KELK_ORIG || null, req, lab: fileUrl(path.join(KELK, 'tools', 'pdf-lab.html')) };
