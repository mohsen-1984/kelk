// The metamorphic net (README, "Metamorphic testing"): lab PDFs (seeds) rewritten in ways that change how the
// page is drawn but not what it says — the importer should give back the same Markdown, or nearly. Producers
// are countless; the ways they draw are not: a scale, a rotation, condensed or tracked type, colours, a page
// background, object streams, a missing ToUnicode, no tags. Each transform stands for many producers at once.
//   node scripts/make-meta.js            → meta/<transform>/<seed>.pdf and meta/manifest.json
// Needs pdf-lib (npm) and qpdf with fix-qdf (without qpdf, only the pdf-lib transforms are made). LAB_META=… writes elsewhere. The PDFs are not shipped (seconds to
// make again). Raise GENERATOR when a transform changes: every file then differs.
const { pdfPath } = require('./env.js');
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const { LAB, req } = require('./env.js');
const { PDFDocument, PDFName, PDFArray, PDFNumber, degrees } = req('pdf-lib');
const GENERATOR = 2;
const META = path.resolve(process.env.LAB_META || path.join(LAB, 'meta'));

// seeds: one or two of each producer family of the lab, both directions, tagged and not
const SEEDS = ['chrome-github-bg--article', 'chrome-plain-hf--report', 'chrome-tagged--features', 'chrome-layout--layout-columns',
  'chrome-template--template', 'chrome-web-rtl--web-rtl', 'wk-github--readme', 'lohtml--article', 'kelkdocx-lo--report',
  'pandoc-lo--article', 'lowriter--word-tables', 'calc--xl-sales', 'impress--deck', 'kelk--article', 'word-print--word-rtl',
  // the right-to-left corpus (generator 2): Arabic from tagged Chrome, a Persian report from Chrome and from Kelk
  'chrome-rtl-tagged--ar-article', 'chrome-rtl-github-bg--fa-report', 'kelk--fa-report'];

// kind: 'same'  the Markdown should not change at all (the drawing is the same, in other coordinates or containers)
//       'near'  the text is drawn otherwise (colour, a fill behind it, its letters closer or wider): small losses only
//       'hard'  information is taken away (the ToUnicode maps): measured, not expected to hold
const TRANSFORMS = {
  scale80:     { kind: 'same', what: 'content at 80 % on the same paper (a "fit to page" print)' },
  scale125:    { kind: 'same', what: 'page and content at 125 % (a larger paper)' },
  rotate90:    { kind: 'same', what: 'the page rotated by /Rotate 90 (a landscape page, a scanner)' },
  objstm:      { kind: 'same', what: 'rewritten with object streams and compressed (qpdf, as post-processors do)' },
  untag:       { kind: 'same', what: 'structure tree and MarkInfo removed (tagged seeds only)', taggedOnly: true },
  color:       { kind: 'near', what: 'black text and fills turned dark blue' },
  pagebg:      { kind: 'near', what: 'a light fill under the whole page (background graphics on)' },
  band:        { kind: 'near', what: 'a coloured band behind the top third of the page (a hero banner, a slide)' },
  tz85:        { kind: 'near', what: 'type condensed to 85 % (Tz: horizontal scaling)' },
  trackTight:  { kind: 'near', what: 'letters set 0.04 em closer (Tc: InDesign tracking, a tight print)' },
  trackLoose:  { kind: 'near', what: 'letters set 0.08 em apart (Tc: letter-spaced type)' },
  noToUnicode: { kind: 'hard', what: 'every /ToUnicode map removed (the repairs must read the fonts)' }
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kelk-meta-'));
const run = (cmd, args, opts) => cp.execFileSync(cmd, args, Object.assign({ stdio: ['pipe', 'pipe', 'pipe'] }, opts || {}));
// qpdf's version line, or null when it is not installed (fix-qdf ships with it)
const QPDF = (() => { try { return run('qpdf', ['--version']).toString().split('\n')[0]; } catch (e) { return null; } })();
const PAGE_LEVEL = ['scale80', 'scale125', 'rotate90', 'pagebg', 'band'];   // pdf-lib only; the rest need qpdf

/** page-level rewrites with pdf-lib: a content stream before and after the page's own, the boxes, /Rotate */
async function pageLevel(bytes, t) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  for (const page of doc.getPages()) {
    const box = page.getMediaBox(), x0 = box.x, y0 = box.y, W = box.width, H = box.height;
    let pre = null, post = null, k = 1, dx = 0, dy = 0;
    if (t === 'scale80') { k = 0.8; dx = (x0 + W / 2) * 0.2; dy = (y0 + H / 2) * 0.2; }
    if (t === 'scale125') { k = 1.25; }
    if (k !== 1) { pre = `q ${k} 0 0 ${k} ${dx.toFixed(3)} ${dy.toFixed(3)} cm\n`; post = '\nQ\n'; }
    if (t === 'pagebg') pre = `q 0.94 0.95 0.97 rg ${x0} ${y0} ${W} ${H} re f Q\n`;
    if (t === 'band') pre = `q 0.85 0.91 0.97 rg ${x0} ${(y0 + H * 0.62).toFixed(2)} ${W} ${(H * 0.38).toFixed(2)} re f Q\n`;
    if (t === 'rotate90') page.setRotation(degrees((page.getRotation().angle + 90) % 360));
    if (pre !== null) {
      const node = page.node, contents = node.Contents();
      const list = contents instanceof PDFArray ? contents.asArray() : contents ? [node.get(PDFName.of('Contents'))] : [];
      const refs = [doc.context.register(doc.context.flateStream(pre))].concat(list);
      if (post) refs.push(doc.context.register(doc.context.flateStream(post)));
      node.set(PDFName.of('Contents'), doc.context.obj(refs));
    }
    if (t === 'scale125') {
      for (const b of ['MediaBox', 'CropBox', 'BleedBox', 'TrimBox', 'ArtBox']) {
        const a = page.node.get(PDFName.of(b));
        if (a instanceof PDFArray) page.node.set(PDFName.of(b), doc.context.obj(a.asArray().map((n) => n instanceof PDFNumber ? n.asNumber() * 1.25 : n)));
      }
    }
    if (k !== 1) {     // link rectangles follow the content
      const annots = page.node.lookup(PDFName.of('Annots'));
      if (annots instanceof PDFArray) annots.asArray().forEach((ref) => {
        const a = doc.context.lookup(ref), r = a && a.lookup(PDFName.of('Rect'));
        if (r instanceof PDFArray) {
          const v = r.asArray().map((n) => n.asNumber());
          a.set(PDFName.of('Rect'), doc.context.obj([v[0] * k + dx, v[1] * k + dy, v[2] * k + dx, v[3] * k + dy]));
        }
      });
    }
  }
  return Buffer.from(await doc.save({ useObjectStreams: false, updateFieldAppearances: false }));
}

/** operator-level rewrites in qpdf's QDF form: every content stream (pages and forms) as plain text */
function opLevel(bytes, t) {
  const a = path.join(tmp, 'a.pdf'), q = path.join(tmp, 'q.pdf'), f = path.join(tmp, 'f.pdf'), o = path.join(tmp, 'o.pdf');
  fs.writeFileSync(a, bytes);
  run('qpdf', ['--qdf', '--object-streams=disable', '--decode-level=generalized', a, q], { stdio: 'ignore' });
  let s = fs.readFileSync(q).toString('latin1'), edits = 0;
  const before = s.length;
  // a content stream: a stream object whose dictionary is no image, font program, XML or cross-reference
  s = s.replace(/(\d+ 0 obj\n<<)([\s\S]*?)(>>\nstream\n)([\s\S]*?)(\nendstream)/g, (all, o1, dict, mid, body, end) => {
    if (/\/Subtype \/(Image|XML|Type1C|CIDFontType0C|OpenType)|\/Length[123] |\/Type \/(XRef|ObjStm|Metadata|EmbeddedFile)/.test(dict)) return all;
    if (!/\bBT\b/.test(body)) return all;
    if (/[\x00-\x08\x0E-\x1F]/.test(body.slice(0, 2000)) && !/\bTf\b/.test(body)) return all;
    let b = body; edits++;
    const afterTf = (fn) => { b = b.replace(/(-?[\d.]+)(\s+Tf)\b/g, (m, size, op) => m + ' ' + fn(+size)); };
    if (t === 'tz85') afterTf(() => '85 Tz');
    if (t === 'trackTight') afterTf((sz) => (-0.04 * sz).toFixed(4) + ' Tc');
    if (t === 'trackLoose') afterTf((sz) => (0.08 * sz).toFixed(4) + ' Tc');
    if (t === 'color') {
      // any dark fill (text is rarely pure black: GitHub's #1f2328) → dark blue, in the colour space it was set in
      const N = '(-?\\d*\\.?\\d+)';
      b = b.replace(new RegExp('(^|\\s)' + N + ' ' + N + ' ' + N + ' (rg|sc|scn)(?=\\s)', 'g'), (m, sp, r, g, bl, op) =>
        Math.max(+r, +g, +bl) < 0.35 ? sp + '0.1 0.25 0.55 ' + op : m)
        .replace(new RegExp('(^|\\s)' + N + ' (g|sc|scn)(?=\\s)', 'g'), (m, sp, v, op) => +v < 0.35 ? sp + (op === 'g' ? '0.1 0.25 0.55 rg' : m.trim()) : m)
        .replace(new RegExp('(^|\\s)' + N + ' ' + N + ' ' + N + ' ' + N + ' k(?=\\s)', 'g'), (m, sp, c, mm, y, k) => +k > 0.65 ? sp + '0.1 0.25 0.55 rg' : m);
      if (b === body) edits--;
    }
    return o1 + dict + mid + b + end;
  });
  if (t === 'noToUnicode') s = s.replace(/\/ToUnicode \d+ 0 R/g, '');
  if (t === 'untag') s = s.replace(/\/StructTreeRoot \d+ 0 R/g, '').replace(/\/MarkInfo <<[^>]*>>/g, '').replace(/\/MarkInfo \d+ 0 R/g, '');
  // a transform that changed nothing would read as "same": count what it did
  const did = t === 'noToUnicode' || t === 'untag' ? (s.length < before ? 1 : 0) : t === 'color' ? edits : edits && s.length !== before ? edits : 0;
  if (!did) throw new Error('nothing to change');
  fs.writeFileSync(q, Buffer.from(s, 'latin1'));
  fs.writeFileSync(f, run('fix-qdf', [q]));
  run('qpdf', ['--object-streams=preserve', '--compress-streams=y', '--recompress-flate', f, o]);
  return fs.readFileSync(o);
}

(async () => {
  fs.rmSync(META, { recursive: true, force: true });
  const manifest = { generator: GENERATOR, env: { qpdf: QPDF, pdfLib: req('pdf-lib/package.json').version },
    transforms: TRANSFORMS, seeds: SEEDS, files: [] };
  let n = 0, skipped = 0;
  const made = Object.keys(TRANSFORMS).filter((t) => QPDF || PAGE_LEVEL.includes(t));
  if (!QPDF) console.log('qpdf not found: skipped ' + Object.keys(TRANSFORMS).filter((t) => !made.includes(t)).join(', ') + ' (they need qpdf / fix-qdf)');
  for (const [t, spec] of Object.entries(TRANSFORMS)) {
    if (!made.includes(t)) continue;
    fs.mkdirSync(path.join(META, t), { recursive: true });
    for (const seed of SEEDS) {
      const src = fs.readFileSync(pdfPath(seed + '.pdf'));
      if (spec.taggedOnly && !/\/StructTreeRoot/.test(run('qpdf', ['--qdf', '--object-streams=disable', pdfPath(seed + '.pdf'), '-']).toString('latin1'))) { skipped++; continue; }
      let out;
      try {
        if (t === 'objstm') {
          const a = path.join(tmp, 's.pdf'), o = path.join(tmp, 'so.pdf');
          fs.writeFileSync(a, src); run('qpdf', ['--object-streams=generate', '--compress-streams=y', '--recompress-flate', a, o]); out = fs.readFileSync(o);
        } else if (PAGE_LEVEL.includes(t)) out = await pageLevel(src, t);
        else out = opLevel(src, t);
      } catch (e) { console.log('✗', t, seed, String(e.message || e).split('\n')[0]); continue; }
      fs.writeFileSync(path.join(META, t, seed + '.pdf'), out);
      manifest.files.push({ transform: t, seed, doc: seed.split('--')[1] });
      n++;
    }
  }
  fs.writeFileSync(path.join(META, 'manifest.json'), JSON.stringify(manifest, null, 1));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(n + ' PDFs in ' + META + ' (' + made.length + ' transforms × ' + SEEDS.length + ' seeds' + (skipped ? ', ' + skipped + ' untagged seeds skipped for untag' : '') + ')');
})();
