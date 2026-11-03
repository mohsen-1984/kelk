// per-baseline runs of glyphs (split at gaps > 0.25em), with mono flag: node words.js file.pdf page yTop yBot
const fs = require('fs');
const { chromium } = require('./env.js').req('playwright');
(async () => {
  const [file, pg, yt, yb] = process.argv.slice(2);
  require('./env.js').openHeld([file], 'words.js');     // a held-out file opened: logged (tests/pdf-lab/HELDOUT.md)
  const browser = await chromium.launch(); const page = await browser.newPage();
  await page.goto(require('./env.js').lab);
  const out = await page.evaluate(async ([b64, pg, yt, yb]) => {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const doc = await pdfjsLib.getDocument({ data: u, fontExtraProperties: true, isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
    const imp = PdfImporter.create(); imp.messages = []; imp.notes = [];
    const p = await imp._extractPage(doc, +pg);
    const gs = p.glyphs.filter((g) => g.y <= +yt && g.y >= +yb).sort((a, b) => b.y - a.y || a.x - b.x);
    const rows = []; gs.forEach((g) => { let r = rows.find((r) => Math.abs(r.y - g.y) < 0.3 * g.size); if (!r) rows.push(r = { y: g.y, gs: [] }); r.gs.push(g); });
    return rows.map((r) => { r.gs.sort((a, b) => a.x - b.x); const runs = []; let cur = null, last = null;
      r.gs.forEach((g) => { const mono = p.fonts[g.font] && p.fonts[g.font].isMonospace;
        if (g.space) { if (cur) cur.sp = (cur.sp || 0) + 1; return; }
        if (!cur || g.x - (last.x + last.w) > 0.25 * g.size || mono !== cur.mono) { cur = { x0: g.x, t: '', mono: mono, sp: 0 }; runs.push(cur); }
        cur.t += g.ch; cur.x1 = g.x + g.w; last = g; });
      return 'y=' + r.y.toFixed(1) + '  ' + runs.map((q) => (q.mono ? 'M' : '') + '[' + q.x0.toFixed(1) + '-' + q.x1.toFixed(1) + (q.sp ? ' s' + q.sp : '') + ']' + q.t).join('  '); });
  }, [fs.readFileSync(file).toString('base64'), pg, yt, yb]);
  console.log(out.join('\n')); await browser.close();
})();
