// PDFs with an OCR layer: a Chromium PDF printed to page images (pdftoppm -r 200 -gray), read back by Tesseract
// into a PDF of the scans with its invisible text over them — what a scanner's "searchable PDF" holds. The layout
// rules meet one font, no bold, sizes from letter heights and words placed by their ink (PDFIMPORT.md §7, "An OCR
// layer"). Needs pdftoppm and tesseract (eng).
//   node scripts/make-ocr.js [doc …]     default: article features report → pdf/ocr-tesseract--<doc>.pdf
//   (from pdf/chrome-plain-hf--<doc>.pdf; article is the one the OCR rules were written on, features and report check them)
const { pdfPath } = require('./env.js');
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const LAB = path.join(__dirname, '..');
const docs = process.argv.slice(2).length ? process.argv.slice(2) : ['article', 'features', 'report'];
for (const doc of docs) {
  const src = pdfPath('chrome-plain-hf--' + doc + '.pdf');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kelk-ocr-'));
  cp.execFileSync('pdftoppm', ['-r', '200', '-gray', '-png', src, path.join(tmp, 'p')]);
  const pages = fs.readdirSync(tmp).filter((f) => /\.png$/.test(f)).sort().map((f) => path.join(tmp, f));
  fs.writeFileSync(path.join(tmp, 'list.txt'), pages.join('\n') + '\n');
  cp.execFileSync('tesseract', [path.join(tmp, 'list.txt'), path.join(tmp, 'out'), '-l', 'eng', 'pdf'], { stdio: 'ignore' });
  fs.copyFileSync(path.join(tmp, 'out.pdf'), pdfPath('ocr-tesseract--' + doc + '.pdf'));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(doc, pages.length + ' pages');
}
