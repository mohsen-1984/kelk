// Import every pdf/*.pdf with Kelk's PdfImporter (tools/pdf-lab.html in Chromium, from file://),
// write out/<name>.md, and score it against corpus/<doc>.md when the file name says which (…--<doc>.pdf).
//   node scripts/run-import.js [filter]
const { pdfPath } = require('./env.js');
const fs = require('fs'), path = require('path');
const { chromium } = require('./env.js').req('playwright');
const { score } = require('./score.js');
const { markupLoss } = require('./markup.js');
const LAB = path.join(__dirname, '..');
const KELK = require('./env.js').KELK, OUT = require('./env.js').OUT;

(async () => {
  const filter = process.argv[2] ? new RegExp(process.argv[2]) : null;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('file://' + KELK + '/tools/pdf-lab.html');
  // (each file read where it is: a name the groups would place elsewhere is still found)
  const where = {}; require('./env.js').labPdfs().forEach((x) => { where[x.name] = x.file; });
  const files = Object.keys(where).sort().filter((f) => !filter || filter.test(f));
  const rows = [];
  for (const f of files) {
    const b64 = fs.readFileSync(where[f]).toString('base64');
    const t0 = Date.now();
    const r = await page.evaluate(async (b64) => {
      const bin = atob(b64), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      try {
        // pictures kept, each as a short name (the crops themselves are not scored, where they land is)
        const r = await PdfImporter.create({ images: 'markdown', onImage: (src, o) => 'img-' + o.page + '-' + o.index, asciiNumbers: false, persianLetters: false }).fromArrayBuffer(u.buffer);
        const q = (r.quality && r.quality.pages) || [];
        const cov = q.reduce((a, x) => [a[0] + x.covered, a[1] + x.glyphs], [0, 0]);
        return { markdown: r.markdown, html: r.html, messages: r.messages, pic: cov[1] ? cov[0] / cov[1] : 0 };
      } catch (e) { return { error: e.stack || String(e) }; }
    }, b64);
    const ms = Date.now() - t0;
    const name = f.replace(/\.pdf$/, '');
    if (r.error) { rows.push({ name, error: r.error.split('\n')[0] }); console.log(name, 'ERROR', r.error.slice(0, 300)); continue; }
    // text wins over pictures: a Markdown line holding a picture and words is counted (mix, should be 0); the
    // pictures are taken out before scoring — the corpus Markdown has none
    const IMG = /!\[[^\]]*\]\(img-[\d-]+\)/g;
    const lines = r.markdown.split('\n');
    const figs = lines.reduce((n, l) => n + (l.match(IMG) || []).length, 0);
    const mix = lines.filter((l) => /!\[[^\]]*\]\(img-/.test(l) && l.replace(IMG, '').replace(/^[\s>|*+-]*(\d+[.)])?/, '').replace(/[\s|]/g, '') !== '').length;
    const md = r.markdown.replace(IMG, '').replace(/\n[ \t]*\n([ \t]*\n)+/g, '\n\n');
    fs.writeFileSync(path.join(OUT, name + '.md'), r.markdown); fs.writeFileSync(path.join(OUT, name + '.html'), r.html || '');
    const m = name.match(/--([\w-]+)$/);
    const src = m && path.join(LAB, 'corpus', m[1] + '.md');
    const row = { name, ms };
    if (src && fs.existsSync(src)) {
      const want = fs.readFileSync(src, 'utf8');
      Object.assign(row, score(want, md));
      // links, outside the total: each [words](address) of the source found as such (F1) — the scorer reads words, and
      // a banner's lines that took the card's link under them read the same
      // (a bare address is a link to itself: Markdown renderers make it one, and the importer writes it out)
      const L = (t) => (t.match(/\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s)\]]+/g) || []).map((x) => {
        if (x[0] !== '[') { x = x.replace(/[.,;:]+$/, ''); return '[' + x + '](' + x + ')'; }
        return x.replace(/\s+/g, ' ');
      }).map((x) => x.replace(/\/\)$/, ')').replace(/\]\((.+?)\/?\)$/, (m, u) => '](' + u.replace(/\/$/, '') + ')'));   // (a browser adds «/» to a bare host)
      const a = L(want), b = L(md);
      if (a.length || b.length) {
        const pool = b.slice(); let hit = 0;
        a.forEach((x) => { const i = pool.indexOf(x); if (i >= 0) { hit++; pool.splice(i, 1); } });
        row.links = a.length && b.length ? 2 * hit / (a.length + b.length) : 0;
      }
    }
    row.markup = markupLoss(r.html, r.markdown).lost;         // inline markup the Markdown lost (should be 0)
    row.pic = +r.pic.toFixed(4);                               // text under a cropped figure (r.quality): should be 0
    row.mix = mix; row.figs = figs;                            // lines with a picture and words (should be 0); pictures
    rows.push(row);
  }
  const pct = (x) => x === undefined ? '  -  ' : (100 * x).toFixed(1).padStart(5);
  console.log('name'.padEnd(46), 'words', 'order', ' head', ' list', ' tabl', ' code', 'quote', 'total', 'mkup', '  rtl', '  pic', 'mix', 'figs', ' lnk');
  rows.forEach((r) => {
    if (r.error) return console.log(r.name.padEnd(46), 'ERROR', r.error);
    console.log(r.name.padEnd(46), pct(r.recall), pct(r.order), pct(r.headings), pct(r.lists), pct(r.tables), pct(r.code), pct(r.quotes), pct(r.total), String(r.markup).padStart(4), pct(r.rtl), pct(r.pic), String(r.mix).padStart(3), String(r.figs).padStart(4), pct(r.links), r.ms + 'ms');
  });
  fs.writeFileSync(path.join(OUT, '_scores.json'), JSON.stringify(rows, null, 1));
  if (errors.length) console.log('page errors:', errors.slice(0, 5));
  await browser.close();
  if (rows.some((r) => r.error)) process.exitCode = 1;       // a crash fails the run (scores are the gate's: gate.js)
})();
