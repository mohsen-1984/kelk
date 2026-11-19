/**
 * Build lib/pdfimport/shapes.js — the glyph shapes (lib/pdfimport/shape.js) of the fonts Kelk ships, so the PDF importer
 * can guess a glyph of a font it does not know by the glyphs it looks most like (Kelk 3.2).
 *   node tools/build-shapes.js        (`npm run check:fresh` runs it: the file must equal what its sources give)
 * Sources: the regular and bold faces of Vazirmatn and Sahel, the B fonts (B Nazanin, B Mitra, B Titr; their notice:
 * lib/pdf-base64-ttf-fonts/borna-rayaneh/NOTICE.txt) — assets/fonts/download/persian-fonts-ttf.zip — and DejaVu Sans
 * for Latin (lib/pdf-base64-ttf-fonts/pdf-font-dejavu-sans.js). Only shapes and characters are written, never a font.
 * The fonts the owner supplied that are not in the repository (the "2" series) are not among them: they enter as
 * fontprints only.
 */
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const PdfImporter = require(path.join(root, 'lib', 'PdfImporter.js'));
require(path.join(root, 'lib', 'pdfimport', 'fontprint.js'));
require(path.join(root, 'lib', 'pdfimport', 'shape.js'));
const JSZip = require(path.join(root, 'vendor', fs.readdirSync(path.join(root, 'vendor')).find((f) => /^jszip\.min_.*\.js$/.test(f))));
const S = PdfImporter._shape, OUT = path.join(root, 'lib', 'pdfimport', 'shapes.js');

// the faces, in the order they are written (the zip's file names)
const ZIPPED = ['vazirmatn/Vazirmatn-Regular.ttf', 'vazirmatn/Vazirmatn-Bold.ttf', 'sahel/Sahel.ttf', 'sahel/Sahel-Bold.ttf',
  // the B fonts, (c) Borna Rayaneh, no published license (lib/pdf-base64-ttf-fonts/borna-rayaneh/NOTICE.txt): their shapes
  // only, as their fontprints — removed with them in one commit
  'borna-rayaneh/BNAZANIN.TTF', 'borna-rayaneh/BNAZNNBD.TTF', 'borna-rayaneh/BMITRA.TTF', 'borna-rayaneh/BMITRABD.TTF', 'borna-rayaneh/BTITRBD.TTF'];

/** a pdf-font-*.js file's styles as TrueType programs (the file sets PdfFonts.<family> = { styles: { <style>: { data } } }) */
function pdfFont(file, styles) {
  const PdfFonts = {};
  new Function('PdfFonts', 'window', 'globalThis', fs.readFileSync(file, 'utf8'))(PdfFonts, { PdfFonts }, { PdfFonts });
  const fam = Object.values(PdfFonts)[0];
  return styles.map((st) => new Uint8Array(Buffer.from(fam.styles[st].data, 'base64')));
}

(async () => {
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(root, 'assets', 'fonts', 'download', 'persian-fonts-ttf.zip')));
  const faces = [];
  for (const name of ZIPPED) {
    if (!zip.files[name]) { console.error('not in the font zip: ' + name); process.exit(1); }
    faces.push(S.face(await zip.files[name].async('uint8array')));
  }
  pdfFont(path.join(root, 'lib', 'pdf-base64-ttf-fonts', 'pdf-font-dejavu-sans.js'), ['normal', 'bold']).forEach((b) => faces.push(S.face(b)));
  const bad = faces.filter((f) => !f.family || !f.shapes.length);
  if (bad.length) { console.error('a font without a family name or without TrueType outlines'); process.exit(1); }
  fs.writeFileSync(OUT, S.source(faces));
  console.log('lib/pdfimport/shapes.js:', faces.length, 'faces,', faces.reduce((n, f) => n + f.shapes.length, 0), 'shapes,', fs.statSync(OUT).size, 'bytes');
})();
