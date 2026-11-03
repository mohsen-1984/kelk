// A regression set of real PDFs that are not kept in the repository (a user's private samples): import every
// PDF of a folder (subfolders too), keep the Markdown and a few quality signals as a snapshot, and compare the
// snapshot with an earlier one. Nothing is scored against a source — real files have none —, so the signals
// are measured against pdftotext and against the file itself:
//   recall, order   pdftotext's words found, and in its order (realwords.js)
//   glued           Arabic-script words of 12 letters or more, per thousand words — high when spaces were lost
//                   (pdftotext's own figure beside it, so a long-worded document does not look broken)
//   img             pictures in the Markdown — text taken for a picture shows here
//   fffd            U+FFFD (glyphs whose text could not be found)
//   h / li / tbl / cell / code / q   headings, list items, tables, cells, code blocks, quotes
//
//   node scripts/snapshot.js <pdf folder> <snapshot folder> [--against <older snapshot folder>] [filter]
//
// KELK=… picks the importer, as everywhere in the lab. The snapshot folder holds <name>.md (pictures shortened
// to a hash: the text stays readable and diffable) and _snapshot.json; keep it outside the repository when the
// PDFs are private. With --against, each file is "same" or shows its changed lines and the signals that moved.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { KELK, req, fileUrl } = require('./env.js');
const { chromium } = req('playwright');
const { structure, words } = require('./score.js');
const { pdftotext, against } = require('./realwords.js');

const args = process.argv.slice(2);
const ai = args.indexOf('--against'); const older = ai >= 0 ? args.splice(ai, 2)[1] : null;
const [dir, snap, filt] = args;
if (!dir || !snap) { console.error('usage: node scripts/snapshot.js <pdf folder> <snapshot folder> [--against <older>] [filter]'); process.exit(2); }
const filter = filt ? new RegExp(filt, 'i') : null;
const list = (d, rel) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? list(path.join(d, e.name), path.join(rel, e.name))
  : /\.pdf$/i.test(e.name) ? [path.join(rel, e.name)] : []);
const files = list(dir, '').filter((f) => !filter || filter.test(f)).sort();
const key = (f) => f.replace(/\.pdf$/i, '').replace(/[\\/]/g, '__');
const AR = /[؀-ۿ]/;

function signals(md, ref) {
  const st = structure(md);
  const ws = words(md), ar = ws.filter((w) => AR.test(w));
  const rws = words(ref).filter((w) => AR.test(w));
  const long = (a) => a.length ? Math.round(1000 * a.filter((w) => [...w.replace(/[ً-ْ‌]/g, '')].length >= 12).length / a.length) : 0;
  const a = against(ref, md);
  return {
    recall: +(100 * a.recall).toFixed(1), order: +(100 * a.order).toFixed(1), refWords: a.ref, words: ws.length,
    glued: long(ar), gluedRef: long(rws), img: (md.match(/!\[[^\]]*\]\(/g) || []).length, fffd: (md.match(/�/g) || []).length,
    h: st.headings.length, li: st.items.length, tbl: st.tables.length, cell: st.tables.reduce((n, t) => n + t.reduce((m, r) => m + r.length, 0), 0),
    code: st.code.length, q: st.quotes.length
  };
}

(async () => {
  fs.mkdirSync(snap, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(fileUrl(KELK + '/tools/pdf-lab.html'));
  const res = {};
  for (const f of files) {
    const b64 = fs.readFileSync(path.join(dir, f)).toString('base64');
    const t0 = Date.now();
    let timer;
    const r = await Promise.race([page.evaluate(async (b64) => {
      const bin = atob(b64), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      try { const r = await PdfImporter.create().fromArrayBuffer(u.buffer); return { markdown: r.markdown, notes: r.notes || [], pages: r.pages || null }; }
      catch (e) { return { error: String(e && e.message || e) }; }
    }, b64), new Promise((ok) => { timer = setTimeout(() => ok({ error: 'timeout' }), 300000); })]);
    clearTimeout(timer);   // (a pending timer would keep Node alive for minutes after the last file)
    const ms = Date.now() - t0;
    if (r.error) { res[f] = { error: r.error, ms }; process.stdout.write('x'); continue; }
    const md = r.markdown.replace(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/g, (u) => 'data:image#' + crypto.createHash('sha1').update(u).digest('hex').slice(0, 8));
    fs.writeFileSync(path.join(snap, key(f) + '.md'), md);
    res[f] = Object.assign({ ms, notes: r.notes }, signals(md, pdftotext(path.join(dir, f))));
    process.stdout.write('.');
  }
  await browser.close();
  console.log('\n');
  fs.writeFileSync(path.join(snap, '_snapshot.json'), JSON.stringify({ written: new Date().toISOString(), kelk: KELK, files: res }, null, 1));

  const COLS = ['recall', 'order', 'glued', 'img', 'fffd', 'h', 'li', 'tbl', 'cell', 'code', 'q'];
  const old = older ? JSON.parse(fs.readFileSync(path.join(older, '_snapshot.json'), 'utf8')).files : null;
  console.log('file'.padEnd(34), 'recall order glued(ref)  img fffd    h   li  tbl cell code    q      ms', old ? ' vs older' : '');
  for (const f of files) {
    const x = res[f], name = f.slice(-34).padEnd(34);
    if (x.error) { console.log(name, 'ERROR', x.error); continue; }
    let cmp = '';
    if (old) {
      const o = old[f];
      if (!o) cmp = ' new file';
      else if (o.error) cmp = ' (was an error)';
      else {
        const a = fs.existsSync(path.join(older, key(f) + '.md')) ? fs.readFileSync(path.join(older, key(f) + '.md'), 'utf8') : '';
        const b = fs.readFileSync(path.join(snap, key(f) + '.md'), 'utf8');
        if (a === b) cmp = ' same';
        else {
          const bag = new Map(); a.split('\n').forEach((l) => bag.set(l, (bag.get(l) || 0) + 1));
          let added = 0; b.split('\n').forEach((l) => { const n = bag.get(l) || 0; if (n) bag.set(l, n - 1); else added++; });
          const removed = [...bag.values()].reduce((s, n) => s + n, 0);
          const moved = COLS.filter((c) => o[c] !== x[c]).map((c) => c + ' ' + o[c] + '→' + x[c]);
          cmp = ' CHANGED +' + added + ' −' + removed + ' lines' + (moved.length ? ' · ' + moved.join(', ') : '');
        }
      }
    }
    console.log(name, String(x.recall).padStart(6), String(x.order).padStart(5), (x.glued + '(' + x.gluedRef + ')').padStart(10),
      ...COLS.slice(3).map((c) => String(x[c]).padStart(4)), String(x.ms).padStart(7), cmp);
  }
})();
