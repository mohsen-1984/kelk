// Shapes PdfImporter extracts from one page, in a y range: small marks (bullets, checkboxes), images, vector parts, rectangles.
//   node scripts/shapes.js file.pdf page yFrom yTo
const fs = require('fs');
const { chromium } = require('./env.js').req('playwright');
(async () => {
  const [file, pg, y0, y1] = process.argv.slice(2);
  require('./env.js').openHeld([file], 'shapes.js');    // a held-out file opened: logged (docs/HELDOUT.md)
  const browser = await chromium.launch(); const page = await browser.newPage();
  await page.goto(require('./env.js').lab);
  const out = await page.evaluate(async ([b64, pg, y0, y1]) => {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const doc = await pdfjsLib.getDocument({ data: u, isEvalSupported: false, verbosity: 0 }).promise;
    const imp = PdfImporter.create(); imp.messages = []; imp.notes = [];
    const p = await imp._extractPage(doc, +pg);
    const r = (v) => Math.round(v * 10) / 10;
    const inY = (q) => q.y1 >= +y0 && q.y0 <= +y1;
    return { small: p.small.filter(inY).map((q) => JSON.stringify(Object.fromEntries(Object.entries(q).map(([k, v]) => [k, typeof v === 'number' ? r(v) : v])))), images: p.images.filter(inY).map((q) => JSON.stringify({ x0: r(q.x0), x1: r(q.x1), y0: r(q.y0), y1: r(q.y1), w: q.width, h: q.height })), vectors: (p.vectors || []).filter(inY).map((q) => JSON.stringify(Object.fromEntries(Object.entries(q).filter(([k]) => /^[xy][01]$|fill|stroke|n/.test(k)).map(([k, v]) => [k, typeof v === 'number' ? r(v) : v])))), rects: p.rects.filter(inY).map((q) => [r(q.x0), r(q.x1), r(q.y0), r(q.y1), q.stroked ? 'S' : 'F', JSON.stringify(q.color), q.vis ? 'vis ' + [r(q.vis.x0), r(q.vis.x1), r(q.vis.y0), r(q.vis.y1)].join(' ') : ''].join(' ')),
      vsegs: (p.vsegs || []).filter((q) => q.y1 >= +y0 && q.y0 <= +y1).map((q) => [r(q.x), r(q.y0), r(q.y1), JSON.stringify(q.color), q.filled ? 'filled' : ''].join(' ')),
      hsegs: (p.hsegs || []).filter((q) => q.y >= +y0 && q.y <= +y1).map((q) => [r(q.x0), r(q.x1), r(q.y), JSON.stringify(q.color)].join(' ')) };
  }, [fs.readFileSync(file).toString('base64'), pg, y0, y1]);
  for (const k of Object.keys(out)) { console.log(k.toUpperCase(), out[k].length); out[k].slice(0, 30).forEach((x) => console.log('  ', x)); }
  await browser.close();
})();
