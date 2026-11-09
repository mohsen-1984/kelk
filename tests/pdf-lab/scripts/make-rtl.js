// The right-to-left corpus: corpus/fa-*.md and ar-*.md (Persian and Arabic documents of our own) through the
// producers the lab can run, so that RTL is tested as English is — same documents, many drawings:
//   chrome-rtl-plain-hf    Chromium, browser-default CSS, Vazirmatn, Chrome's header and footer
//   chrome-rtl-github-bg   Chromium, a GitHub-like sheet mirrored for RTL, Vazirmatn, backgrounds on, Letter
//   chrome-rtl-tagged      Chromium, the same sheet in Sahel, tagged (structure tree, outline), A4
//   wk-rtl                 wkhtmltopdf (Qt WebKit), Vazirmatn
//   lohtml-rtl             the HTML opened in LibreOffice Writer → PDF
//   kelk, kelkdocx-lo      Kelk's PdfBuilder; Kelk's DocxBuilder → LibreOffice Writer → PDF
//   node scripts/make-rtl.js [doc-prefix]
// Needs the Vazirmatn and Sahel TTFs installed for LibreOffice and wkhtmltopdf (assets/fonts/download/
// persian-fonts-ttf.zip into ~/.fonts); Chromium takes the web fonts from assets/fonts/.
const { pdfPath, fileUrl } = require('./env.js');
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const { KELK, req } = require('./env.js');
const { chromium } = req('playwright');
const marked = require(KELK + '/vendor/marked.umd.min_18.0.14.js');
const LAB = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kelk-rtl-'));
const only = process.argv[2];
const docs = fs.readdirSync(path.join(LAB, 'corpus')).filter((f) => /^(fa|ar)-[\w-]+\.md$/.test(f) && (!only || f.startsWith(only))).map((f) => f.replace(/\.md$/, ''));
const WEB = fileUrl(KELK + '/assets/fonts/rastikerdar/webfonts') + '/';
const FACES = `@font-face{font-family:"Vazirmatn";src:url("${WEB}Vazirmatn[wght].woff2") format("woff2");font-weight:100 900}
  @font-face{font-family:"Sahel";src:url("${WEB}Sahel-VF.woff2") format("woff2");font-weight:300 900}`;
const GH = (font) => `body{font:15px/1.7 "${font}",sans-serif;color:#1f2328;margin:0 auto;max-width:900px}
  h1,h2{border-bottom:1px solid #d1d9e0;padding-bottom:.3em} code{font:85% "DejaVu Sans Mono",monospace;background:#eff1f3;padding:.2em .4em;border-radius:6px}
  pre{background:#f6f8fa;padding:14px;border-radius:6px;direction:ltr;text-align:left} pre code{background:none;padding:0}
  table{border-collapse:collapse} th,td{border:1px solid #d1d9e0;padding:5px 12px} tr:nth-child(2n){background:#f6f8fa}
  blockquote{margin:0;padding:0 1em;color:#59636e;border-right:.25em solid #d1d9e0} a{color:#0969da;text-decoration:none}`;
const HEADER = `<div style="font-size:8px;width:100%;display:flex;justify-content:space-between;padding:0 0.4in;font-family:Arial"><span class="date"></span><span class="title"></span><span></span></div>`;
const FOOTER = `<div style="font-size:8px;width:100%;display:flex;justify-content:space-between;padding:0 0.4in;font-family:Arial"><span class="url"></span><span><span class="pageNumber"></span>/<span class="totalPages"></span></span></div>`;
const page = (md, css, lang) => `<!doctype html><html dir="rtl" lang="${lang}"><head><meta charset="utf-8"><title>${(md.match(/^# (.+)$/m) || [, ''])[1]}</title>` +
  `<style>${css}</style></head><body>${marked.parse(md)}</body></html>`;
const lo = (src, outName) => {
  const dir = path.join(TMP, 'lo'); fs.mkdirSync(dir, { recursive: true });
  cp.execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', dir, src], { stdio: 'ignore', timeout: 180000 });
  fs.renameSync(path.join(dir, path.basename(src).replace(/\.\w+$/, '.pdf')), pdfPath(outName));
};

(async () => {
  const browser = await chromium.launch(), p = await browser.newPage();
  const variants = [
    { id: 'rtl-plain-hf', css: FACES + 'body{font-family:"Vazirmatn",serif}', bg: false, hf: true, fmt: 'A4' },
    { id: 'rtl-github-bg', css: FACES + GH('Vazirmatn'), bg: true, hf: false, fmt: 'Letter' },
    { id: 'rtl-tagged', css: FACES + GH('Sahel'), bg: false, hf: true, fmt: 'A4', tagged: true }
  ];
  for (const d of docs) {
    const md = fs.readFileSync(path.join(LAB, 'corpus', d + '.md'), 'utf8'), lang = d.slice(0, 2);
    for (const v of variants) {
      const f = path.join(TMP, d + '-' + v.id + '.html');
      fs.writeFileSync(f, page(md, v.css, lang));
      await p.goto(fileUrl(f)); await p.evaluate(() => document.fonts.ready);
      await p.pdf({ path: pdfPath('chrome-' + v.id + '--' + d + '.pdf'), format: v.fmt, printBackground: v.bg, displayHeaderFooter: v.hf,
        headerTemplate: HEADER, footerTemplate: FOOTER, margin: { top: '0.4in', bottom: '0.4in', left: '0.4in', right: '0.4in' }, tagged: !!v.tagged, outline: !!v.tagged });
    }
    // wkhtmltopdf and LibreOffice: the installed fonts
    const sys = path.join(TMP, d + '-sys.html');
    fs.writeFileSync(sys, page(md, GH('Vazirmatn'), lang));
    cp.execFileSync('wkhtmltopdf', ['-q', '--enable-local-file-access', sys, pdfPath('wk-rtl--' + d + '.pdf')], { stdio: 'ignore' });
    lo(sys, 'lohtml-rtl--' + d + '.pdf');
    console.log(d, 'chrome × 3, wk, lohtml');
  }
  // Kelk's builders, in the test page (all libraries loaded)
  await p.goto(fileUrl(KELK + '/tests/builder-suite.html'));
  for (const d of docs) {
    const md = fs.readFileSync(path.join(LAB, 'corpus', d + '.md'), 'utf8');
    const out = await p.evaluate(async (md) => {
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
    fs.writeFileSync(pdfPath('kelk--' + d + '.pdf'), Buffer.from(out.pdf, 'base64'));
    const dx = path.join(TMP, d + '-kelk.docx');
    fs.writeFileSync(dx, Buffer.from(out.docx, 'base64'));
    lo(dx, 'kelkdocx-lo--' + d + '.pdf');
    console.log(d, 'kelk, kelkdocx-lo');
  }
  await browser.close();
  fs.rmSync(TMP, { recursive: true, force: true });
})();
