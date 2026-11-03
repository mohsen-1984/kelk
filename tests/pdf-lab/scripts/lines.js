// node lines.js file.pdf ymin ymax → lines given to the XY-cut (all pages), with flags
const fs = require('fs');
const {chromium} = require('./env.js').req('playwright');
require('./env.js').openHeld([process.argv[2]], 'lines.js');     // a held-out file opened: logged (tests/pdf-lab/HELDOUT.md)
(async () => {
  const b = await chromium.launch(); const page = await b.newPage();
  await page.goto(require('./env.js').lab);
  const r = await page.evaluate(async ([b64, y0, y1]) => {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const imp = PdfImporter.create({images:'drop'}); const o = imp._xyCut; const out = [];
    imp._xyCut = function (items) { items.forEach(function (it) { if (it.line && it.line.y >= y0 && it.line.y <= y1) { const L = it.line; out.push('p' + L.page + ' y=' + L.y.toFixed(1) + ' [' + L.x0.toFixed(1) + ',' + L.x1.toFixed(1) + '] size=' + L.size.toFixed(1) + ' bold=' + (L.boldShare || 0).toFixed(2) + ' cell=' + !!L.cell + ' marker=' + JSON.stringify(L.marker || null).slice(0, 60) + ' mono=' + (L.monoShare || 0).toFixed(2) + ' ' + L.glyphs.map(function (g) { return g.ch; }).join('').slice(0, 50)); } }); return o.apply(this, arguments); };
    await imp.fromArrayBuffer(u.buffer); return out;
  }, [fs.readFileSync(process.argv[2]).toString('base64'), +process.argv[3], +process.argv[4]]);
  console.log(r.join('\n')); await b.close();
})();
