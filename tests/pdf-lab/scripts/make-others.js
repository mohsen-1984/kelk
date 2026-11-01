// More producers for corpus/*.md:
//   wk-github / wk-plain-hf   wkhtmltopdf (Qt WebKit), with its own header / footer in the second
//   kelk                       Kelk's PdfBuilder (jsPDF), defaults of the page
//   kelkdocx-lo                Kelk's DocxBuilder → LibreOffice Writer → PDF
//   pandoc-lo                  pandoc .docx (Word default styles) → LibreOffice → PDF
//   lohtml                     the HTML opened in LibreOffice Writer → PDF
//   node scripts/make-others.js [doc-prefix]
const { pdfPath } = require('./env.js');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { chromium } = require('./env.js').req('playwright');
const marked = require(require('./env.js').KELK + '/vendor/marked.umd.min_18.0.14.js');
const LAB = path.join(__dirname, '..'), TMP = path.join(LAB, 'scratch-pdf');
const only = process.argv[2];
const docs = fs.readdirSync(path.join(LAB, 'corpus')).filter((f) => /^(article|readme|report|features|symbols)\.md$/.test(f) && (!only || f.startsWith(only)));
const CSS_GH = 'body{font:15px/1.5 "Liberation Sans",Arial,sans-serif;color:#1f2328}code{font:85% "DejaVu Sans Mono",monospace;background:#eff1f3}pre{background:#f6f8fa;padding:12px}table{border-collapse:collapse}th,td{border:1px solid #d1d9e0;padding:5px 10px}blockquote{margin:0;padding:0 1em;color:#59636e;border-left:4px solid #d1d9e0}';
const html = (md, css, title) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${css}</style></head><body>${marked.parse(md)}</body></html>`;
const lo = (src, outName) => {
  const dir = path.join(TMP, 'lo'); fs.mkdirSync(dir, { recursive: true });
  cp.execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', dir, src], { stdio: 'ignore', timeout: 180000 });
  fs.renameSync(path.join(dir, path.basename(src).replace(/\.\w+$/, '.pdf')), pdfPath(outName));
};
(async () => {
  for (const f of docs) {
    const name = f.replace(/\.md$/, ''), md = fs.readFileSync(path.join(LAB, 'corpus', f), 'utf8');
    const title = (md.match(/^# (.+)$/m) || [, name])[1];
    // wkhtmltopdf
    fs.writeFileSync(path.join(TMP, name + '-gh.html'), html(md, CSS_GH, title));
    fs.writeFileSync(path.join(TMP, name + '-plain.html'), html(md, 'body{font-family:"Liberation Serif",serif}', title));
    cp.execFileSync('wkhtmltopdf', ['-q', path.join(TMP, name + '-gh.html'), pdfPath('wk-github--' + name + '.pdf')], { stdio: 'ignore' });
    cp.execFileSync('wkhtmltopdf', ['-q', '--header-left', '[title]', '--header-right', '[date]', '--footer-center', 'Page [page] of [topage]', '--header-line',
      path.join(TMP, name + '-plain.html'), pdfPath('wk-plain-hf--' + name + '.pdf')], { stdio: 'ignore' });
    // LibreOffice from HTML
    lo(path.join(TMP, name + '-gh.html'), 'lohtml--' + name + '.pdf');
    // pandoc docx → LibreOffice
    const pd = path.join(TMP, name + '-pandoc.docx');
    cp.execFileSync('pandoc', ['-f', 'gfm', '-t', 'docx', '-o', pd], { input: md });
    lo(pd, 'pandoc-lo--' + name + '.pdf');
    console.log(name);
  }
  // Kelk's builders, in the test page (all libraries loaded)
  const b = await chromium.launch(); const page = await b.newPage();
  await page.goto(require('./env.js').fileUrl(require('./env.js').KELK + '/tests/builder-suite.html'));
  for (const f of docs) {
    const name = f.replace(/\.md$/, ''), md = fs.readFileSync(path.join(LAB, 'corpus', f), 'utf8');
    const out = await page.evaluate(async (md) => {
      const h = DOMPurify.sanitize(marked.parse(md, { gfm: true }), { ADD_ATTR: ['target', 'dir', 'align'] });
      const res = {};
      for (const [k, B] of [['pdf', PdfBuilder], ['docx', DocxBuilder]]) {
        const bld = B.create();
        if (k === 'pdf') bld.registerFonts(window.PdfFonts || {});
        const blob = await bld.addFromHtml(h).toBlob();
        const u8 = new Uint8Array(await blob.arrayBuffer()); let s = '';
        for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
        res[k] = btoa(s);
      }
      return res;
    }, md);
    fs.writeFileSync(pdfPath('kelk--' + name + '.pdf'), Buffer.from(out.pdf, 'base64'));
    const dx = path.join(TMP, name + '-kelk.docx');
    fs.writeFileSync(dx, Buffer.from(out.docx, 'base64'));
    lo(dx, 'kelkdocx-lo--' + name + '.pdf');
    console.log('kelk', name);
  }
  await b.close();
})();
