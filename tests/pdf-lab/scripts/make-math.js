// Kelk's own PDFs of documents with formulas (round 27): corpus/math.md (English) and corpus/fa-math.md (Persian),
// each through PdfBuilder as the app does it (marked with MathCore's extension, formulas drawn as vectors). The
// importer must give the formulas back as `$…$` / `$$…$$`, exactly — PdfBuilder writes each formula's TeX into the
// file (lib/PDFIMPORT.md §3). The corpus files are their own expected Markdown.
//   node scripts/make-math.js      → pdf/en/kelk--math.pdf, pdf/rtl/kelk--fa-math.pdf
const { pdfPath, KELK, fileUrl } = require('./env.js');
const fs = require('fs'), path = require('path');
const { chromium } = require('./env.js').req('playwright');
const LAB = path.join(__dirname, '..');
(async () => {
  const b = await chromium.launch(); const page = await b.newPage();
  page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 300)));
  await page.goto(fileUrl(KELK + '/tests/builder-suite.html'));
  for (const name of ['math', 'fa-math']) {
    const md = fs.readFileSync(path.join(LAB, 'corpus', name + '.md'), 'utf8');
    const pdf = await page.evaluate(async (md) => {
      const h = DOMPurify.sanitize(marked.parse(md, { gfm: true }), { ADD_ATTR: ['target', 'dir', 'align', 'data-tex', 'data-display'] });
      const bld = PdfBuilder.create();
      bld.registerFonts(window.PdfFonts || {});
      const blob = await bld.addFromHtml(h).toBlob();
      const u8 = new Uint8Array(await blob.arrayBuffer()); let s = '';
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return btoa(s);
    }, md);
    fs.writeFileSync(pdfPath('kelk--' + name + '.pdf'), Buffer.from(pdf, 'base64'));
    console.log('kelk--' + name + '.pdf');
  }
  await b.close();
})();
