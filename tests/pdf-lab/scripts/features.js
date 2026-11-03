// The coverage matrix (PDFIMPORT.md §2c): how the lab's PDFs are drawn, as r.features' axis=value cells — and,
// for any other folder (a user's private files), which cells of each file no lab PDF has. A new file is then
// not "a producer we have not seen" but "these ways of drawing we have not tested": the next lab PDF to make.
//   node scripts/features.js                 the matrix of pdf/ (and meta/ when made: the transforms add cells)
//   node scripts/features.js folder…         the same, then each file of those folders with its new cells
//   node scripts/features.js --json f.pdf    one file's whole r.features
// The other folders' file names are printed, never written: keep private names out of the repository.
const fs = require('fs'), path = require('path');
const { LAB, lab, req } = require('./env.js');
const { chromium } = req('playwright');
const META = path.resolve(process.env.LAB_META || path.join(LAB, 'meta'));

const list = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? list(path.join(d, e.name)) : /\.pdf$/i.test(e.name) ? [path.join(d, e.name)] : []);
(async () => {
  const args = process.argv.slice(2);
  const browser = await chromium.launch(), page = await browser.newPage();
  await page.goto(lab);
  const feat = async (file) => page.evaluate(async (b64) => {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    try { const r = await PdfImporter.create({ images: 'drop' }).fromArrayBuffer(u.buffer); return Object.assign({}, r.features || { cells: ['source=kelk'] }, { app: r.profile && (r.profile.app || r.profile.engine) }); }
    catch (e) { return { error: String(e && e.message || e), cells: [] }; }
  }, fs.readFileSync(file).toString('base64'));
  if (args[0] === '--json') { console.log(JSON.stringify(await feat(args[1]), null, 1)); await browser.close(); return; }

  const metaFiles = fs.existsSync(META) ? list(META) : [], labFiles = list(path.join(LAB, 'pdf')).concat(metaFiles);
  const cells = new Map();       // cell → [lab file labels]
  const apps = new Map();        // 'application\tdirection' → files (pdf/ only: a transform keeps its seed's producer)
  for (const f of labFiles) {
    // 'producer--doc' for pdf/<group>/…, 'transform/seed' for meta/ — with '/' on every platform
    const label = (metaFiles.includes(f) ? path.relative(META, f).split(path.sep).join('/') : path.basename(f)).replace(/\.pdf$/, '');
    const ft = await feat(f);
    ft.cells.forEach((c) => { if (!cells.has(c)) cells.set(c, []); cells.get(c).push(label); });
    if (!metaFiles.includes(f)) { const k = (ft.app || 'unknown') + '\t' + (ft.cells.find((c) => /^script=/.test(c)) || 'script=?').slice(7); apps.set(k, (apps.get(k) || 0) + 1); }
    process.stdout.write('.');
  }
  console.log('\n\nthe lab\'s coverage — ' + labFiles.length + ' PDFs (pdf/' + (fs.existsSync(META) ? ' + meta/' : '') + '): cell, files, producers\n');
  const axes = {};
  [...cells.keys()].forEach((c) => { const [a] = c.split('='); (axes[a] = axes[a] || []).push(c); });
  Object.keys(axes).sort().forEach((a) => {
    axes[a].sort().forEach((c) => {
      const fl = cells.get(c), prod = [...new Set(fl.map((x) => x.includes('/') ? 'meta:' + x.split('/')[0] : x.split('--')[0]))];
      console.log('  ' + c.padEnd(26) + String(fl.length).padStart(4) + '  ' + prod.slice(0, 8).join(', ') + (prod.length > 8 ? ' … +' + (prod.length - 8) : ''));
    });
  });
  // the application (r.profile.app, else its engine) × the text's direction (script=): an empty cell is a producer the
  // lab has no file of in that direction (plan P4.1: none for Word, Excel, PowerPoint × rtl, ltr)
  const appNames = [...new Set([...apps.keys()].map((k) => k.split('\t')[0]))].sort(), dirs = ['rtl', 'mixed', 'ltr'];
  console.log('\nthe applications × the text\'s direction, pdf/ (files)\n\n  ' + ''.padEnd(30) + dirs.map((s) => s.padStart(7)).join(''));
  appNames.forEach((a) => console.log('  ' + a.slice(0, 29).padEnd(30) + dirs.map((s) => String(apps.get(a + '\t' + s) || '·').padStart(7)).join('')));
  for (const d of args) {
    console.log('\n' + d + ' — cells no lab PDF has\n');
    for (const f of list(d)) {
      const ft = await feat(f);
      const fresh = ft.cells.filter((c) => !cells.has(c)), thin = ft.cells.filter((c) => cells.has(c) && cells.get(c).length <= 2);
      console.log('  ' + path.relative(d, f).slice(-40).padEnd(40), ft.error ? 'ERROR ' + ft.error : (fresh.length ? 'NEW ' + fresh.join(', ') : '–') + (thin.length ? '   (thin: ' + thin.join(', ') + ')' : ''));
    }
  }
  await browser.close();
})();
