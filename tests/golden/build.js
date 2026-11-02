/**
 * The builders in a real browser, case by case (shared by tests/golden/run.js and tests/docx-validate.js).
 *
 * Opens tests/builder-suite.html in headless Chromium (Playwright) — it loads every vendor library, font, Kelk
 * library and tests/test-corpus.js in the app's order — adds mammoth (for the .docx → Markdown import) and builds
 * each case the way the suite does: the Markdown through marked + MathCore + DOMPurify, the builder configured with
 * the suite's fonts, then the case's own setup(builder). Nothing is clicked: the suite's own run is not started.
 *
 *   const s = await openSuite();               // { page, names, close() }
 *   const out = await buildCase(s.page, 'rtl-basic', ['html', 'docx', 'doc', 'pdf', 'docx-md']);
 *   // out.html (string), out.docx (base64), out.doc (MHTML text), out.pdfMd (Markdown), out.docxMd (Markdown)
 */
'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const MAMMOTH = 'vendor/mammoth.browser.min_1.12.3.js';

async function openSuite() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  await page.goto(pathToFileURL(path.join(ROOT, 'tests', 'builder-suite.html')).href);
  await page.addScriptTag({ path: path.join(ROOT, MAMMOTH) });
  // The page has no @font-face, so a measurement in the document font (MathCore.exRatio: a formula's size in ex)
  // would read the system's serif fallback — Times New Roman on Windows, another font on Linux. The bundled web
  // fonts (assets/fonts/embed: Vazirmatn, Vazir Code Hack, DejaVu Sans Mono) are added as faces first, as in the
  // app, so every machine measures the same font file.
  await page.evaluate(async () => {
    const fonts = window.KelkWebFonts || {};
    for (const family of Object.keys(fonts)) {
      for (const f of fonts[family]) {
        const face = new window.FontFace(family, 'url(data:font/' + (f.format || 'woff2') + ';base64,' + f.data + ')', {
          weight: f.weight || 'normal',
          style: f.style || 'normal'
        });
        document.fonts.add(await face.load());
      }
    }
  });
  const names = await page.evaluate(() =>
    CORPUS.map((c) => c.name).concat(Object.keys(window.KelkSamples || {}).map((l) => 'about-kelk-and-samples.' + l))
  );
  return { page, names, errors, close: () => browser.close() };
}

/**
 * One case through the requested outputs, inside the page.
 * kinds: 'html' (HtmlBuilder.toHtml), 'docx' (DocxBuilder → base64), 'doc' (WordHtmlBuilder.toMhtml),
 * 'pdf' (PdfBuilder → PdfImporter, layout only → Markdown), 'docx-md' (the .docx read back by MarkdownImporter).
 * Each output that throws gives { error } in its place.
 */
async function buildCase(page, name, kinds) {
  return page.evaluate(
    async ({ name, kinds }) => {
      const FONTS = { bidi: 'Vazirmatn', latin: 'Vazirmatn', code: 'Vazir Code Hack' };
      let c = CORPUS.find((x) => x.name === name);
      if (!c && name.indexOf('about-kelk-and-samples.') === 0) c = { name, md: window.KelkSamples[name.split('.').pop()].markdown };
      if (!c) throw new Error('no case ' + name);
      if (window.MathCore && !window.__goldenMath) {
        marked.use(MathCore.markedExtension());
        window.__goldenMath = true;
      }
      const h = c.html || marked.parse(c.md, { gfm: true });
      const html = DOMPurify.sanitize(h, { ADD_ATTR: ['target', 'dir', 'align'] });
      const make = (B, kind) => {
        const b = B.create();
        if (kind === 'pdf') b.registerFonts(window.PdfFonts || {});
        if (kind === 'html') b.registerWebFonts(window.KelkWebFonts || {});
        b.configure({ fonts: FONTS, toc: null });
        if (c.setup) c.setup(b);
        return b.addFromHtml(html);
      };
      const b64 = async (blob) => {
        const u8 = new Uint8Array(await blob.arrayBuffer());
        let s = '';
        for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
        return btoa(s);
      };
      const out = {};
      const attempt = async (key, fn) => {
        try {
          out[key] = await fn();
        } catch (e) {
          out[key] = { error: String((e && e.stack) || e).slice(0, 600) };
        }
      };
      let docxBlob = null;
      if (kinds.includes('html')) await attempt('html', () => make(HtmlBuilder, 'html').toHtml());
      if (kinds.includes('docx') || kinds.includes('docx-md')) {
        await attempt('docx', async () => {
          docxBlob = await make(DocxBuilder, 'docx').toBlob();
          return b64(docxBlob);
        });
      }
      if (kinds.includes('docx-md') && docxBlob) {
        await attempt('docxMd', async () => {
          const r = await MarkdownImporter.create().fromDocx(await docxBlob.arrayBuffer());
          return r.markdown;
        });
      }
      if (kinds.includes('doc')) await attempt('doc', () => make(WordHtmlBuilder, 'doc').toMhtml());
      if (kinds.includes('pdf')) {
        await attempt('pdfMd', async () => {
          const blob = await make(PdfBuilder, 'pdf').toBlob();
          const r = await PdfImporter.create({ images: 'drop', asciiNumbers: false, persianLetters: false }).fromArrayBuffer(
            await blob.arrayBuffer()
          );
          return r.markdown;
        });
      }
      return out;
    },
    { name, kinds }
  );
}

module.exports = { ROOT, openSuite, buildCase };
