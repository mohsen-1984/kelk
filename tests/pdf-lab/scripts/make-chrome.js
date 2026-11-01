// Render corpus/*.md (and corpus/*.html) to PDF with Chromium (Skia — same engine as Chrome's "Save as PDF").
// Variants: CSS style × background graphics × Chrome's header/footer × paper.
const { pdfPath } = require('./env.js');
const fs = require('fs'), path = require('path');
const { chromium } = require('./env.js').req('playwright');
const marked = require(require('./env.js').KELK + '/vendor/marked.umd.min_18.0.14.js');
const LAB = path.join(__dirname, '..');

const CSS = {
  // GitHub-like rendering (code boxes, ruled tables, grey quote bar)
  github: `body{font:16px/1.5 -apple-system,"Segoe UI","Liberation Sans",Arial,sans-serif;color:#1f2328;max-width:980px;margin:0 auto;padding:0 8px}
    h1,h2{border-bottom:1px solid #d1d9e0;padding-bottom:.3em} code{font:85% "DejaVu Sans Mono",monospace;background:#eff1f3;padding:.2em .4em;border-radius:6px}
    pre{background:#f6f8fa;padding:16px;border-radius:6px} pre code{background:none;padding:0;font-size:85%}
    table{border-collapse:collapse} th,td{border:1px solid #d1d9e0;padding:6px 13px} tr:nth-child(2n){background:#f6f8fa}
    blockquote{margin:0;padding:0 1em;color:#59636e;border-left:.25em solid #d1d9e0} hr{border:0;height:.25em;background:#d1d9e0}
    a{color:#0969da;text-decoration:none}`,
  // browser defaults only (a bare page): borderless tables, indented quotes
  plain: `body{font-family:"Liberation Serif",serif}`,
  // a typical blog theme: serif body, sans headings, quote in italics with a bar, zebra table without vertical rules
  blog: `body{font:17px/1.7 Georgia,"DejaVu Serif",serif;color:#222;max-width:720px;margin:auto}
    h1,h2,h3{font-family:"Liberation Sans",Arial,sans-serif} h1{font-size:2.4em}
    pre{background:#272822;color:#f8f8f2;padding:14px;border-radius:4px;font-size:13px}
    code{font-family:"DejaVu Sans Mono",monospace;font-size:.9em}
    blockquote{font-style:italic;border-left:4px solid #e0a000;margin:1em 0;padding:.2em 1em;background:#fff8e6}
    table{border-collapse:collapse;width:100%} th{border-bottom:2px solid #333;text-align:left} td{border-bottom:1px solid #ddd;padding:4px 8px}
    a{color:#c0392b}`
};

const HEADER = `<div style="font-size:8px;width:100%;display:flex;justify-content:space-between;padding:0 0.4in;font-family:Arial"><span class="date"></span><span class="title"></span><span></span></div>`;
const FOOTER = `<div style="font-size:8px;width:100%;display:flex;justify-content:space-between;padding:0 0.4in;font-family:Arial"><span class="url"></span><span><span class="pageNumber"></span>/<span class="totalPages"></span></span></div>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const only = process.argv[2];
  // the documents the Chrome variants are made of (the others are office files' sources or layout pages);
  // `node make-chrome.js <doc> [variant]` makes one document, in one variant if named
  const CHROME_DOCS = ['article', 'features', 'readme', 'report', 'symbols'];
  const docs = fs.readdirSync(path.join(LAB, 'corpus')).filter((f) => /\.md$/.test(f) && CHROME_DOCS.indexOf(f.replace(/\.md$/, '')) >= 0 && (!only || f.startsWith(only)));
  const variants = [
    { id: 'github-bg', css: 'github', bg: true, hf: false, fmt: 'Letter' },
    { id: 'github-nobg-hf', css: 'github', bg: false, hf: true, fmt: 'A4' },   // Chrome's defaults: no backgrounds, header/footer on
    { id: 'plain-hf', css: 'plain', bg: false, hf: true, fmt: 'Letter' },
    { id: 'blog-bg', css: 'blog', bg: true, hf: false, fmt: 'A4' },
    // the same as github-nobg-hf, tagged (a structure tree and an outline, as desktop Chrome writes them):
    // scored against its untagged twin, it shows whether tagging alone moves the importer (it should not)
    { id: 'tagged', css: 'github', bg: false, hf: true, fmt: 'A4', tagged: true }
  ];
  for (const f of docs) {
    const md = fs.readFileSync(path.join(LAB, 'corpus', f), 'utf8');
    const body = marked.parse(md);
    const title = (md.match(/^# (.+)$/m) || [, f])[1];
    for (const v of variants.filter((x) => !process.argv[3] || x.id === process.argv[3])) {
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${CSS[v.css]}</style></head><body>${body}</body></html>`;
      await page.goto('about:blank');
      await page.setContent(html);
      const out = pdfPath(`chrome-${v.id}--${f.replace(/\.md$/, '')}.pdf`);
      await page.pdf({ path: out, format: v.fmt, printBackground: v.bg, displayHeaderFooter: v.hf,
        headerTemplate: HEADER, footerTemplate: FOOTER, margin: { top: '0.4in', bottom: '0.4in', left: '0.4in', right: '0.4in' },
        tagged: !!v.tagged, outline: !!v.tagged });
      console.log(path.basename(out));
    }
  }
  await browser.close();
})();
// pages with their own layout: scratch-pdf/layout-*.html → pdf/chrome-layout--layout-*.pdf (Chrome's defaults)
(async () => {
  await new Promise((r) => setTimeout(r, 4000));
  const b = await chromium.launch(); const page = await b.newPage();
  for (const f of fs.readdirSync(path.join(LAB, 'scratch-pdf')).filter((f) => /^layout-.*\.html$/.test(f))) {
    await page.goto('file://' + path.join(LAB, 'scratch-pdf', f));
    const out = pdfPath('chrome-layout--' + f.replace(/\.html$/, '') + '.pdf');
    await page.pdf({ path: out, format: 'A4', printBackground: false, displayHeaderFooter: true, headerTemplate: HEADER, footerTemplate: FOOTER, margin: { top: '0.4in', bottom: '0.4in', left: '0.4in', right: '0.4in' } });
    console.log(path.basename(out));
  }
  await b.close();
})();
