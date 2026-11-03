// PDFs the fallback ladder must demote (lib/pdfimport/ladder.js, plan P3.4) — not corpus files: they live in
// tests/pdf-lab/ladder/ (no corpus/<doc>.md scores them; run-stress.js checks the mode each page is given in).
//   node scripts/make-ladder.js
//   ladder/scan--article.pdf     the page images make-ocr.js reads (chrome-plain-hf--article.pdf rendered, here by
//                                pdf.js in Chromium at 2×, since pdftoppm is not everywhere), with no text layer:
//                                every page → 'ocr' (a note, the picture kept)
//   ladder/t3-glued--lost.pdf    a Type 3 font of drawn boxes whose ToUnicode maps one code in twelve to U+FFFD, set
//                                with no word spaces (the words glued): suspectSpaces + lostGlyphs → 'simplified'
//   ladder/t3-glued--lost25.pdf  the same with one code in four lost: lost ≥ 20 % → 'simplified' (why lostGlyphs).
//                                pdf.js's text was tried and kept nothing more — the glyphs' letters come from it, its
//                                U+FFFD are theirs (74 either way) —, so it is not taken: textContent only where it
//                                shows demonstrably fewer lost (ladder.js _ladTcBetter), or where extraction failed
const { req, lab, LAB } = require('./env.js');
const fs = require('fs'), path = require('path');
const { PDFDocument } = req('pdf-lib');
const OUT = path.join(LAB, 'ladder');
fs.mkdirSync(OUT, { recursive: true });

// a raw PDF from its objects (1-based, as strings or { dict, stream }), with its xref
function rawPdf(objs) {
  let s = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const off = [];
  objs.forEach((o, i) => {
    off.push(Buffer.byteLength(s, 'latin1'));
    s += (i + 1) + ' 0 obj\n' + (typeof o === 'string' ? o : o.dict.replace('>>$', '/Length ' + Buffer.byteLength(o.stream, 'latin1') + ' >>') + '\nstream\n' + o.stream + '\nendstream') + '\nendobj\n';
  });
  const x = Buffer.byteLength(s, 'latin1');
  s += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + off.map((n) => String(n).padStart(10, '0') + ' 00000 n \n').join('');
  s += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF\n';
  return Buffer.from(s, 'latin1');
}

// the Type 3 file: letters a–z at codes 97–122, each drawn as a box; the lost codes 128–153 draw the same boxes and
// map to U+FFFD (a producer that could not name them). `every`: one letter in `every` set at its lost code
function t3Glued(every) {
  const TEXT = ['thequickbrownfoxjumpsoverthelazydogandkeepsrunning', 'everywordofthislineisgluedtothenextwithnospaceatall',
    'areaderseesboxesandamachinereadsnowordsbutonelongrun', 'thispageisaglyphsoupthatnolayoutrulecanreadwell',
    'tablesandlistsandquotesarenotwhatitholdsonlyletters', 'theladdergivesitsimplifiedorasplaintextfrompdfjs'];
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const names = [];
  for (let k = 0; k < 26; k++) { names.push('/' + letters[k]); }
  for (let k = 0; k < 26; k++) { names.push('/L' + letters[k]); }
  // objects: 1 catalog, 2 pages, 3 page, 4 content, 5 font, 6 tounicode, 7.. procs
  const box = { stream: '500 0 40 0 460 520 d1\n40 0 420 520 re f' };
  const charProcs = names.map((n, i) => n + ' ' + (7 + i) + ' 0 R').join(' ');
  const diff = '[97 ' + names.slice(0, 26).join(' ') + ' 128 ' + names.slice(26).join(' ') + ']';
  let bf = '';
  for (let k = 0; k < 26; k++) bf += '<' + (97 + k).toString(16) + '> <00' + (97 + k).toString(16) + '>\n';
  for (let k = 0; k < 26; k++) bf += '<' + (128 + k).toString(16) + '> <FFFD>\n';
  const cmap = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n' +
    '/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<00> <FF>\nendcodespacerange\n52 beginbfchar\n' + bf + 'endbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend';
  let n = 0;
  const lines = TEXT.map((t) => Array.from(t).map((c) => { n++; const code = c.charCodeAt(0); return n % every === 0 ? code - 97 + 128 : code; }));
  const esc = (codes) => codes.map((c) => '\\' + c.toString(8).padStart(3, '0')).join('');
  let content = 'BT\n/F1 11 Tf\n';
  lines.forEach((codes, i) => { content += '1 0 0 1 56 ' + (760 - i * 16) + ' Tm\n(' + esc(codes) + ') Tj\n'; });
  content += 'ET';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    { dict: '<< >>$', stream: content },
    '<< /Type /Font /Subtype /Type3 /FontBBox [0 0 500 520] /FontMatrix [0.001 0 0 0.001 0 0] /CharProcs << ' + charProcs + ' >> ' +
      '/Encoding << /Type /Encoding /Differences ' + diff + ' >> /FirstChar 97 /LastChar 153 /Widths [' + Array(57).fill(500).join(' ') + '] /ToUnicode 6 0 R /Resources << >> >>',
    { dict: '<< >>$', stream: cmap }
  ];
  names.forEach(() => objs.push({ dict: '<< >>$', stream: box.stream }));
  return rawPdf(objs);
}

(async () => {
  fs.writeFileSync(path.join(OUT, 't3-glued--lost.pdf'), t3Glued(12));
  fs.writeFileSync(path.join(OUT, 't3-glued--lost25.pdf'), t3Glued(4));
  // the scan: each page of the Chromium article rendered by pdf.js (tools/pdf-lab.html) and set as a picture alone
  const { chromium } = req('playwright');
  const b = await chromium.launch(), page = await b.newPage();
  await page.goto(lab);
  const src = path.join(LAB, 'pdf', 'en', 'chrome-plain-hf--article.pdf');
  const pngs = await page.evaluate(async (b64) => {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const doc = await pdfjsLib.getDocument({ data: u, isEvalSupported: false }).promise, out = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i), vp = p.getViewport({ scale: 2 });
      const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
      const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
      await p.render({ canvasContext: cx, viewport: vp, canvas: cv }).promise;
      out.push({ w: vp.width / 2, h: vp.height / 2, png: cv.toDataURL('image/png').split(',')[1] });
    }
    return out;
  }, fs.readFileSync(src).toString('base64'));
  await b.close();
  const pdf = await PDFDocument.create();
  for (const p of pngs) {
    const img = await pdf.embedPng(Buffer.from(p.png, 'base64'));
    pdf.addPage([p.w, p.h]).drawImage(img, { x: 0, y: 0, width: p.w, height: p.h });
  }
  pdf.setProducer('kelk make-ladder.js (scan)'); pdf.setCreationDate(new Date(0)); pdf.setModificationDate(new Date(0));
  fs.writeFileSync(path.join(OUT, 'scan--article.pdf'), await pdf.save({ useObjectStreams: false }));
  console.log('ladder/: t3-glued--lost.pdf, t3-glued--lost25.pdf, scan--article.pdf (' + pngs.length + ' pages)');
})();
