// Kelk itself, headless (index.html in Chromium, from file://): a PDF imported as the app imports it (Settings → Import
// as stored, pictures as registered images), and/or Markdown exported to PDF as the app exports it (its fonts
// loaded on demand, its settings). The owner's round trip, end to end:
//   node scripts/kelk-app.js import <file.pdf> <out.md>      the app's import → Markdown
//   node scripts/kelk-app.js pdf <file.md> <out.pdf>         the app's PDF export
//   node scripts/kelk-app.js trip <file.pdf> <out-prefix>    both: <prefix>.md and <prefix>.pdf
const fs = require('fs'), path = require('path');
const { chromium } = require('./env.js').req('playwright');
const KELK = require('./env.js').KELK;
(async () => {
  const [mode, src, dst] = process.argv.slice(2);
  const b = await chromium.launch(), page = await b.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto('file://' + KELK + '/index.html');
  await page.waitForFunction(() => window.Kelk && Kelk.editor && Kelk.exporter, null, { timeout: 30000 });
  let md = mode === 'pdf' ? fs.readFileSync(src, 'utf8') : null;
  if (mode === 'import' || mode === 'trip') {
    await page.evaluate(() => Kelk.editor.set(''));          // (the app opens on its sample document)
    const input = await page.$('input[type=file]');
    await input.setInputFiles(src);
    await page.waitForFunction(() => Kelk.editor.value().length > 0, null, { timeout: 120000 });
    await page.waitForTimeout(500);
    md = await page.evaluate(() => Kelk.editor.value());
    fs.writeFileSync(mode === 'trip' ? dst + '.md' : dst, md);
  }
  if (mode === 'pdf' || mode === 'trip') {
    const b64 = await page.evaluate(async (text) => {
      Kelk.editor.set(text); Kelk.preview.render();
      await Promise.all([Kelk.libs.need('jspdf'), Kelk.fonts.forPdf(text)]);
      const blob = await Kelk.exporter._configure(PdfBuilder.create(), 'pdf').addFromHtml(Kelk.preview.html()).toBlob();
      const u = new Uint8Array(await blob.arrayBuffer()); let s = '';
      for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      return btoa(s);
    }, md);
    fs.writeFileSync(mode === 'trip' ? dst + '.pdf' : dst, Buffer.from(b64, 'base64'));
  }
  if (errs.length) console.log('page errors:', errs.slice(0, 3));
  await b.close();
})();
