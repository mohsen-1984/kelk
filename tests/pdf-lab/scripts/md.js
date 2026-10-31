// node md.js <kelk folder | lib/PdfImporter.js> <file.pdf> → markdown (that version of the importer: the core and its parts)
// IMAGES=1 keeps the pictures (each data: URI shortened to «data:…») — to see where they land among the text
const fs = require('fs');
const {chromium} = require('./env.js').req('playwright');
(async () => {
  const b = await chromium.launch(); const page = await b.newPage();
  await page.goto(require('./env.js').lab);
  for (const f of require('./env.js').importerFiles(process.argv[2])) await page.addScriptTag({ path: f });
  const r = await page.evaluate(async ([b64, keep]) => {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const x = await PdfImporter.create({images: keep ? 'markdown' : 'drop'}).fromArrayBuffer(u.buffer); return (x.markdown || x).replace(/\(data:[^)]*\)/g, '(data:…)');
  }, [fs.readFileSync(process.argv[3]).toString('base64'), !!process.env.IMAGES]);
  console.log(r); await b.close();
})();
