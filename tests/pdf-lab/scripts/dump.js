// Dump the raw glyphs PdfImporter extracts from one page: node scripts/dump.js file.pdf [page] [from] [n]
const fs = require('fs'), path = require('path');
const { chromium } = require('./env.js').req('playwright');
const { KELK, fileUrl } = require('./env.js');
(async () => {
  const [file, pg = '1', from = '0', n = '80'] = process.argv.slice(2);
  require('./env.js').openHeld([file], 'dump.js');      // a held-out file opened: logged (tests/pdf-lab/HELDOUT.md)
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(fileUrl(KELK + '/tools/pdf-lab.html'));
  const b64 = fs.readFileSync(file).toString('base64');
  const out = await page.evaluate(async ([b64, pg, from, n]) => {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const doc = await pdfjsLib.getDocument({ data: u, fontExtraProperties: true, isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
    const imp = PdfImporter.create();
    imp.messages = []; imp.notes = [];
    const p = await imp._extractPage(doc, +pg);
    const fonts = {};
    Object.keys(p.fonts).forEach((k) => { const f = p.fonts[k]; fonts[k] = f ? { name: f.name, mono: f.isMonospace, type: f.type, bbox: f.bbox, missing: f.missingFile } : null; });
    return { fonts, n: p.glyphs.length, rects: p.rects.length, hsegs: p.hsegs.length, vsegs: p.vsegs.length, small: p.small.length, vectors: p.vectors.length, images: p.images.length,
      glyphs: p.glyphs.slice(+from, +from + +n).map((g) => [JSON.stringify(g.ch)+"("+Array.from(g.ch).map(c=>c.codePointAt(0).toString(16)).join(",")+")", +g.x.toFixed(2), +g.y.toFixed(2), +g.w.toFixed(2), +g.size.toFixed(1), g.font, g.space ? 'S' : '', g.unmapped ? "U"+g.cid : "c"+g.cid].join(' ')) };
  }, [b64, pg, from, n]);
  console.log(JSON.stringify(out.fonts, null, 0));
  console.log('glyphs', out.n, 'rects', out.rects, 'h', out.hsegs, 'v', out.vsegs, 'small', out.small, 'vec', out.vectors, 'img', out.images);
  out.glyphs.forEach((g) => console.log(g));
  await browser.close();
})();
