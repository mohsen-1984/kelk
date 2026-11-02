// The metamorphic net (README, "Metamorphic testing"): lab PDFs (seeds) rewritten in ways that change how the
// page is drawn but not what it says — the importer should give back the same Markdown, or nearly. Producers
// are countless; the ways they draw are not: a scale, a rotation, a crop box, condensed or tracked type, colours,
// a page background, a stamp, object streams, a missing ToUnicode, no tags. Each transform stands for many
// producers at once.
//   node scripts/make-meta.js            → meta/<transform>/<seed>.pdf, meta/_control/<seed>.pdf, meta/manifest.json
// Needs pdf-lib (npm); qpdf with fix-qdf for the operator-level transforms; Playwright's Chromium for the
// generator-side ones. A family whose tool is missing is skipped with a note. LAB_META=… writes elsewhere. The
// PDFs are not shipped (seconds to make again). Raise GENERATOR when the seeds or the files' layout change; raise
// a transform's `v` when its code changes — the gate then does not compare it with a baseline written before.
const { pdfPath, fileUrl } = require('./env.js');
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const { LAB, KELK, req } = require('./env.js');
const { PDFDocument, PDFName, PDFArray, PDFNumber, PDFOperator, StandardFonts, degrees, rgb, endMarkedContent } = req('pdf-lib');
const GENERATOR = 3;
const META = path.resolve(process.env.LAB_META || path.join(LAB, 'meta'));

// seeds: one or two of each producer family of the lab, both directions, tagged and not
const SEEDS = ['chrome-github-bg--article', 'chrome-plain-hf--report', 'chrome-tagged--features', 'chrome-layout--layout-columns',
  'chrome-template--template', 'chrome-web-rtl--web-rtl', 'wk-github--readme', 'lohtml--article', 'kelkdocx-lo--report',
  'pandoc-lo--article', 'lowriter--word-tables', 'calc--xl-sales', 'impress--deck', 'kelk--article', 'word-print--word-rtl',
  // the right-to-left corpus (generator 2): Arabic from tagged Chrome, a Persian report from Chrome and from Kelk
  'chrome-rtl-tagged--ar-article', 'chrome-rtl-github-bg--fa-report', 'kelk--fa-report',
  // right-to-left producers the lab imitates (generator 3): a Word memo, a PowerPoint deck, Prince with shapes, an
  // iText circular, an Acrobat booklet; and Chrome's print of a Persian encyclopedia page (a ToC, links, a margin rule)
  'word-memo--memo-fa', 'pptx-rtl--slides-rtl', 'prince-shapes--shapes-fa', 'itext-word--circular-fa', 'acrobat-word--booklet-fa',
  'chrome-fa-links--fa-links'];

// kind: 'same'  the Markdown should not change at all (the same drawing in other coordinates, boxes or containers,
//               or with something added the importer is meant to drop): run-meta.js asserts it byte for byte and
//               exits 1 on a file that differs, unless that file is a listed known exception (run-meta.js KNOWN)
//       'near'  the text is drawn otherwise (colour, a fill or a stamp, its letters closer or wider, another font or
//               paper): small losses only
//       'hard'  information is taken away (the ToUnicode maps): measured, not expected to hold
// via:  'pdf-lib'   page level (boxes, /Rotate, a content stream before or after the page's own, a stamp)
//       'qpdf'      operator level, in qpdf's QDF form (skipped without qpdf / fix-qdf)
//       'chromium'  generator side: the seed's Markdown drawn again with a change (CSS, paper) — only the seeds whose
//                   recipe this script knows (recipe()); each is compared with a control drawn here the same way
//                   without the change (meta/_control/), never with the shipped seed, so the Chromium version and
//                   the fonts of this machine are not what is measured (skipped without Playwright's Chromium)
// v:    the transform's own version — raise it when its code changes
const TRANSFORMS = {
  scale80:     { kind: 'same', via: 'pdf-lib', v: 1, what: 'content at 80 % on the same paper (a "fit to page" print)' },
  scale125:    { kind: 'same', via: 'pdf-lib', v: 1, what: 'page and content at 125 % (a larger paper)' },
  // (v2, generator 3: content turned by its matrix, /Rotate turning it upright again — v1 only added /Rotate to
  // upright content, which an importer reading user space passes by construction; dropped: it tested nothing)
  rotate90:    { kind: 'same', via: 'pdf-lib', v: 2, what: 'the content turned a quarter (cm) on portrait-turned paper, /Rotate 90 turning it upright again (Word\'s landscape page)' },
  objstm:      { kind: 'same', via: 'qpdf', v: 1, what: 'rewritten with object streams and compressed (qpdf, as post-processors do)' },
  untag:       { kind: 'same', via: 'qpdf', v: 1, what: 'structure tree and MarkInfo removed (tagged seeds only)', taggedOnly: true },
  color:       { kind: 'near', via: 'qpdf', v: 1, what: 'black text and fills turned dark blue' },
  pagebg:      { kind: 'near', via: 'pdf-lib', v: 1, what: 'a light fill under the whole page (background graphics on)' },
  band:        { kind: 'near', via: 'pdf-lib', v: 1, what: 'a coloured band behind the top third of the page (a hero banner, a slide)' },
  tz85:        { kind: 'near', via: 'qpdf', v: 1, what: 'type condensed to 85 % (Tz: horizontal scaling)' },
  trackTight:  { kind: 'near', via: 'qpdf', v: 1, what: 'letters set 0.04 em closer (Tc: InDesign tracking, a tight print)' },
  trackLoose:  { kind: 'near', via: 'qpdf', v: 1, what: 'letters set 0.08 em apart (Tc: letter-spaced type)' },
  noToUnicode: { kind: 'hard', via: 'qpdf', v: 1, what: 'every /ToUnicode map removed (the repairs must read the fonts)' },
  // generator 3 (P2.2)
  rotate180:   { kind: 'same', via: 'pdf-lib', v: 2, what: 'the content drawn upside down (cm), /Rotate 180 turning it upright again (a page scanned upside down)' },
  cropbox:     { kind: 'same', via: 'pdf-lib', v: 2, what: 'a print proof: MediaBox grown by a 36 pt bleed (origin negative), CropBox and TrimBox the old visible page; crop marks and a job line in the slug, outside the CropBox, to drop' },
  hfInject:    { kind: 'same', via: 'pdf-lib', v: 1, what: 'a running head and «Page n of N» stamped in the margins, marked /Artifact /Pagination (Acrobat\'s Header & Footer): page furniture to drop' },
  renderMode:  { kind: 'same', via: 'pdf-lib', v: 1, what: 'an invisible copy (Tr 3) of the whole page laid over it (a hidden text layer over born-digital text): the copy to drop' },
  // (the plan says "near"; measured, it behaves "hard" — −32.7, 23 of 24 files break block ± 1 — and is gated so)
  stamp:       { kind: 'hard', via: 'pdf-lib', v: 1, what: 'a diagonal «CONFIDENTIAL DRAFT» watermark over the page, light grey at 30 % opacity (pdf-lib drawText, unmarked)' },
  fontSubst:   { kind: 'near', via: 'chromium', v: 1, what: 'the body font replaced (CSS): Latin → DejaVu Sans, Vazirmatn ↔ Sahel (a reader without the author\'s font)' },
  letterSpace: { kind: 'near', via: 'chromium', v: 1, what: 'CSS letter-spacing 0.05em on the body (tracking from a real producer, unlike the synthetic Tc)' },
  pageSize:    { kind: 'near', via: 'chromium', v: 1, what: 'the paper swapped, A4 ↔ Letter: the text reflows (other line and page breaks)' }
};

// ── generator side: the seeds this script can draw again — the recipes of make-chrome.js and make-rtl.js, kept in
// step with them by hand (a drift moves the control and its variants together, never the comparison) ──
const MD_CSS = {
  github: `body{font:16px/1.5 -apple-system,"Segoe UI","Liberation Sans",Arial,sans-serif;color:#1f2328;max-width:980px;margin:0 auto;padding:0 8px}
    h1,h2{border-bottom:1px solid #d1d9e0;padding-bottom:.3em} code{font:85% "DejaVu Sans Mono",monospace;background:#eff1f3;padding:.2em .4em;border-radius:6px}
    pre{background:#f6f8fa;padding:16px;border-radius:6px} pre code{background:none;padding:0;font-size:85%}
    table{border-collapse:collapse} th,td{border:1px solid #d1d9e0;padding:6px 13px} tr:nth-child(2n){background:#f6f8fa}
    blockquote{margin:0;padding:0 1em;color:#59636e;border-left:.25em solid #d1d9e0} hr{border:0;height:.25em;background:#d1d9e0}
    a{color:#0969da;text-decoration:none}`,
  plain: 'body{font-family:"Liberation Serif",serif}',
  blog: `body{font:17px/1.7 Georgia,"DejaVu Serif",serif;color:#222;max-width:720px;margin:auto}
    h1,h2,h3{font-family:"Liberation Sans",Arial,sans-serif} h1{font-size:2.4em}
    pre{background:#272822;color:#f8f8f2;padding:14px;border-radius:4px;font-size:13px}
    code{font-family:"DejaVu Sans Mono",monospace;font-size:.9em}
    blockquote{font-style:italic;border-left:4px solid #e0a000;margin:1em 0;padding:.2em 1em;background:#fff8e6}
    table{border-collapse:collapse;width:100%} th{border-bottom:2px solid #333;text-align:left} td{border-bottom:1px solid #ddd;padding:4px 8px}
    a{color:#c0392b}`
};
const RTL_GH = (font) => `body{font:15px/1.7 "${font}",sans-serif;color:#1f2328;margin:0 auto;max-width:900px}
  h1,h2{border-bottom:1px solid #d1d9e0;padding-bottom:.3em} code{font:85% "DejaVu Sans Mono",monospace;background:#eff1f3;padding:.2em .4em;border-radius:6px}
  pre{background:#f6f8fa;padding:14px;border-radius:6px;direction:ltr;text-align:left} pre code{background:none;padding:0}
  table{border-collapse:collapse} th,td{border:1px solid #d1d9e0;padding:5px 12px} tr:nth-child(2n){background:#f6f8fa}
  blockquote{margin:0;padding:0 1em;color:#59636e;border-right:.25em solid #d1d9e0} a{color:#0969da;text-decoration:none}`;
// the fonts come from the repository (the same files on every machine): Vazirmatn and Sahel as make-rtl.js takes
// them, DejaVu Sans as the Latin substitute
const WEB = fileUrl(path.join(KELK, 'assets', 'fonts', 'rastikerdar', 'webfonts')) + '/', DJV = fileUrl(path.join(KELK, 'assets', 'fonts', 'dejavu')) + '/';
const FACES = `@font-face{font-family:"Vazirmatn";src:url("${WEB}Vazirmatn[wght].woff2") format("woff2");font-weight:100 900}
  @font-face{font-family:"Sahel";src:url("${WEB}Sahel-VF.woff2") format("woff2");font-weight:300 900}
  @font-face{font-family:"KelkDejaVu";src:url("${DJV}DejaVuSans-Regular.woff") format("woff");font-weight:400}
  @font-face{font-family:"KelkDejaVu";src:url("${DJV}DejaVuSans-Bold.woff") format("woff");font-weight:700}
  @font-face{font-family:"KelkDejaVu";src:url("${DJV}DejaVuSans-Oblique.woff") format("woff");font-style:italic}`;
const HF_HEADER = '<div style="font-size:8px;width:100%;display:flex;justify-content:space-between;padding:0 0.4in;font-family:Arial"><span class="date"></span><span class="title"></span><span></span></div>';
const HF_FOOTER = '<div style="font-size:8px;width:100%;display:flex;justify-content:space-between;padding:0 0.4in;font-family:Arial"><span class="url"></span><span><span class="pageNumber"></span>/<span class="totalPages"></span></span></div>';
/** how a seed was drawn, or null when this script cannot draw it (an office file, an imitated producer, a page of its own) */
function recipe(seed) {
  let m = /^chrome-(github-bg|github-nobg-hf|plain-hf|blog-bg|tagged)--(article|features|readme|report|symbols)$/.exec(seed);
  if (m) {
    const [css, bg, hf, fmt] = { 'github-bg': ['github', true, false, 'Letter'], 'github-nobg-hf': ['github', false, true, 'A4'],
      'plain-hf': ['plain', false, true, 'Letter'], 'blog-bg': ['blog', true, false, 'A4'], tagged: ['github', false, true, 'A4'] }[m[1]];
    return { doc: m[2], dir: 'ltr', lang: 'en', css: MD_CSS[css], bg, hf, fmt, tagged: m[1] === 'tagged', font: null };
  }
  m = /^chrome-rtl-(plain-hf|github-bg|tagged)--((?:fa|ar)-[\w-]+)$/.exec(seed);
  if (m) {
    const [css, bg, hf, fmt, font] = { 'plain-hf': ['body{font-family:"Vazirmatn",serif}', false, true, 'A4', 'Vazirmatn'],
      'github-bg': [RTL_GH('Vazirmatn'), true, false, 'Letter', 'Vazirmatn'], tagged: [RTL_GH('Sahel'), false, true, 'A4', 'Sahel'] }[m[1]];
    return { doc: m[2], dir: 'rtl', lang: m[2].slice(0, 2), css, bg, hf, fmt, tagged: m[1] === 'tagged', font };
  }
  return null;
}
/** what a generator-side transform changes: CSS added after the recipe's, and the paper ('control': nothing) */
function genChange(t, r) {
  if (t === 'fontSubst') return { css: 'body{font-family:' + (r.dir === 'rtl' ? '"' + (r.font === 'Sahel' ? 'Vazirmatn' : 'Sahel') + '"' : '"KelkDejaVu"') + ',sans-serif !important}', fmt: r.fmt };
  if (t === 'letterSpace') return { css: 'body{letter-spacing:0.05em}', fmt: r.fmt };
  if (t === 'pageSize') return { css: '', fmt: r.fmt === 'A4' ? 'Letter' : 'A4' };
  return { css: '', fmt: r.fmt };
}
async function draw(page, seed, r, change, out) {
  const marked = require(path.join(KELK, 'vendor', 'marked.umd.min_18.0.14.js'));
  const md = fs.readFileSync(path.join(LAB, 'corpus', r.doc + '.md'), 'utf8');
  const title = (md.match(/^# (.+)$/m) || [null, r.doc])[1];
  const html = '<!doctype html><html' + (r.dir === 'rtl' ? ' dir="rtl" lang="' + r.lang + '"' : '') + '><head><meta charset="utf-8"><title>' + title +
    '</title><style>' + FACES + r.css + change.css + '</style></head><body>' + marked.parse(md) + '</body></html>';
  const f = path.join(tmp, seed + '.html');
  fs.writeFileSync(f, html);
  await page.goto(fileUrl(f)); await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: out, format: change.fmt, printBackground: r.bg, displayHeaderFooter: r.hf, headerTemplate: HF_HEADER, footerTemplate: HF_FOOTER,
    margin: { top: '0.4in', bottom: '0.4in', left: '0.4in', right: '0.4in' }, tagged: r.tagged, outline: r.tagged });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kelk-meta-'));
const run = (cmd, args, opts) => cp.execFileSync(cmd, args, Object.assign({ stdio: ['pipe', 'pipe', 'pipe'] }, opts || {}));
// qpdf's version line, or null when it is not installed (fix-qdf ships with it)
const QPDF = (() => { try { return run('qpdf', ['--version']).toString().split('\n')[0]; } catch (e) { return null; } })();
// its package version where dpkg knows it (CI: Ubuntu's build of 11.9.0 — two builds print the same --version)
const QPDF_PKG = (() => { try { return run('dpkg-query', ['-W', '-f=${Version}', 'qpdf']).toString().trim() || null; } catch (e) { return null; } })();
const PAGE_LEVEL = Object.keys(TRANSFORMS).filter((t) => TRANSFORMS[t].via === 'pdf-lib');
const GEN = Object.keys(TRANSFORMS).filter((t) => TRANSFORMS[t].via === 'chromium');

/** the page's content streams as a list of references (Contents is a stream or an array of them) */
function contentRefs(page) {
  const node = page.node, contents = node.Contents();
  return contents instanceof PDFArray ? contents.asArray() : contents ? [node.get(PDFName.of('Contents'))] : [];
}
const streamRef = (doc, text) => doc.context.register(doc.context.flateStream(text));
// a transform that finds nothing to change in a seed: no file, an expected note (not a failure)
const nothing = (msg) => Object.assign(new Error(msg), { expected: true });

/**
 * A content stream's text alone, for an invisible copy laid over the page (renderMode): every Tr sets mode 3; the
 * painting operators become `n` (the path is built, nothing painted — a clip still clips); pictures, shadings and
 * forms go with their operands (`Do`, `sh`, inline images). A copy of the whole page would paint its fills over the
 * page's own text a second time — another drawing, not the same one. src and the result: latin1 strings.
 */
function textOnly(src) {
  const ws = (c) => c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\f' || c === '\0';
  const delim = (c) => '()<>[]{}/%'.indexOf(c) >= 0;
  const PAINT = { f: 1, F: 1, 'f*': 1, B: 1, 'B*': 1, b: 1, 'b*': 1, S: 1, s: 1 };
  let out = '', i = 0, opStart = 0;      // opStart: where the current operator's operands begin in out
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (ws(c)) { out += c; i++; continue; }
    if (c === '%') { while (i < n && src[i] !== '\n' && src[i] !== '\r') i++; continue; }
    let j = i + 1;
    if (c === '(') {
      for (let depth = 0, k = i; k < n; k++) {
        if (src[k] === '\\') { k++; continue; }
        if (src[k] === '(') depth++;
        else if (src[k] === ')' && --depth === 0) { j = k + 1; break; }
        if (k === n - 1) j = n;
      }
    } else if ((c === '<' && src[i + 1] === '<') || (c === '>' && src[i + 1] === '>')) j = i + 2;
    else if (c === '<') j = src.indexOf('>', i) + 1 || n;
    else if (c === '/') { while (j < n && !ws(src[j]) && !delim(src[j])) j++; }
    else if (!delim(c)) { j = i; while (j < n && !ws(src[j]) && !delim(src[j])) j++; }
    const tok = src.slice(i, j);
    i = j;
    // operands: numbers, strings, names, arrays, dictionaries, booleans
    if (/^[\d.+-]/.test(tok) || /^[(<[\]/{}]/.test(tok) || tok === '>>' || tok === 'true' || tok === 'false' || tok === 'null') { out += tok; continue; }
    if (tok === 'BI') {                  // an inline image: up to its EI, gone with its operands
      const id = src.indexOf('ID', i), ei = id < 0 ? -1 : src.slice(id + 3).search(/[\s\0]EI(?=[\s\0]|$)/);
      i = ei < 0 ? n : id + 3 + ei + 3;
      out = out.slice(0, opStart); opStart = out.length; continue;
    }
    if (tok === 'Do' || tok === 'sh') { out = out.slice(0, opStart); opStart = out.length; continue; }
    if (tok === 'Tr') out = out.slice(0, opStart) + ' 3 Tr';
    else out += PAINT[tok] ? 'n' : tok;
    opStart = out.length;
  }
  return out;
}
/** a page's content streams decoded and joined, as latin1 text */
function pageContent(doc, page) {
  const { decodePDFRawStream, PDFRawStream } = req('pdf-lib');
  return contentRefs(page).map((ref) => {
    const s = doc.context.lookup(ref);
    return s instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(s).decode()).toString('latin1') : Buffer.from(s.getContents()).toString('latin1');
  }).join('\n');
}

/**
 * The page's content drawn turned by `deg` (90: a quarter turn anticlockwise; 180) and its /Rotate raised by `deg`,
 * which turns it upright again on screen — how Word stores a landscape page (portrait paper, the content turned,
 * /Rotate 90) and how a scanner stores a page fed upside down. The boxes and the link rectangles follow the content.
 * What a viewer shows is the page as it was: the importer has to read the content through /Rotate.
 */
function turnPage(doc, page, deg) {
  const m = page.getMediaBox(), x0 = m.x, y0 = m.y, x1 = m.x + m.width, y1 = m.y + m.height;
  const M = deg === 90 ? [0, 1, -1, 0, y1, -x0] : [-1, 0, 0, -1, x0 + x1, y0 + y1];
  const pt = (x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
  const rect = (r) => { const a = pt(r[0], r[1]), b = pt(r[2], r[3]); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; };
  page.node.set(PDFName.of('Contents'), doc.context.obj([streamRef(doc, 'q ' + M.map((v) => +v.toFixed(3)).join(' ') + ' cm\n')].concat(contentRefs(page), [streamRef(doc, '\nQ\n')])));
  for (const b of ['MediaBox', 'CropBox', 'BleedBox', 'TrimBox', 'ArtBox']) {
    const a = page.node.get(PDFName.of(b));
    if (a instanceof PDFArray) page.node.set(PDFName.of(b), doc.context.obj(rect(a.asArray().map((n) => n.asNumber()))));
  }
  const annots = page.node.lookup(PDFName.of('Annots'));
  if (annots instanceof PDFArray) annots.asArray().forEach((ref) => {
    const a = doc.context.lookup(ref), r = a && a.lookup(PDFName.of('Rect')), q = a && a.lookup(PDFName.of('QuadPoints'));
    if (r instanceof PDFArray) a.set(PDFName.of('Rect'), doc.context.obj(rect(r.asArray().map((n) => n.asNumber()))));
    if (q instanceof PDFArray) {
      const v = q.asArray().map((n) => n.asNumber()), out = [];
      for (let k = 0; k + 1 < v.length; k += 2) out.push(...pt(v[k], v[k + 1]));
      a.set(PDFName.of('QuadPoints'), doc.context.obj(out));
    }
  });
  page.setRotation(degrees((page.getRotation().angle + deg) % 360));
}

/** page-level rewrites with pdf-lib: a content stream before and after the page's own, the boxes, /Rotate, a stamp */
async function pageLevel(bytes, t) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const pages = doc.getPages();
  const helv = t === 'hfInject' || t === 'cropbox' ? await doc.embedFont(StandardFonts.Helvetica) : t === 'stamp' ? await doc.embedFont(StandardFonts.HelveticaBold) : null;
  let copied = 0;
  for (const [i, page] of pages.entries()) {
    if (t === 'rotate90') turnPage(doc, page, 90);
    if (t === 'rotate180') turnPage(doc, page, 180);
    if (t === 'cropbox') {
      // what a viewer shows is the CropBox (the MediaBox when there is none): it stays; the paper grows around it,
      // and the slug outside it carries what a print shop's proof does — crop marks and a job line, which are no
      // part of the page (the importer reads the CropBox: they must not come back)
      const m = page.getMediaBox(), c = page.node.get(PDFName.of('CropBox')) ? page.getCropBox() : m;
      page.setMediaBox(m.x - 36, m.y - 36, m.width + 72, m.height + 72);
      page.setCropBox(c.x, c.y, c.width, c.height);
      page.setTrimBox(c.x, c.y, c.width, c.height);
      page.setBleedBox(c.x - 9, c.y - 9, c.width + 18, c.height + 18);
      page.node.set(PDFName.of('Contents'), doc.context.obj([streamRef(doc, 'q\n')].concat(contentRefs(page), [streamRef(doc, '\nQ\n')])));
      const ink = rgb(0, 0, 0), X0 = c.x, Y0 = c.y, X1 = c.x + c.width, Y1 = c.y + c.height;
      for (const [x, y, sx, sy] of [[X0, Y0, -1, -1], [X1, Y0, 1, -1], [X0, Y1, -1, 1], [X1, Y1, 1, 1]]) {
        page.drawLine({ start: { x: x + sx * 12, y }, end: { x: x + sx * 30, y }, thickness: 0.25, color: ink });
        page.drawLine({ start: { x, y: y + sy * 12 }, end: { x, y: y + sy * 30 }, thickness: 0.25, color: ink });
      }
      page.drawText('Kelk lab proof 3 - job 1405-118 - page ' + (i + 1) + ' - 2026-10-21 13:04', { x: X0 + 36, y: Y0 - 22, size: 7, font: helv, color: ink });
      page.drawText('Plate: black - 175 lpi - trim ' + Math.round(c.width) + ' x ' + Math.round(c.height) + ' pt', { x: X0 + 36, y: Y1 + 16, size: 7, font: helv, color: ink });
    }
    if (t === 'renderMode') {
      // the page as drawn, then its text again in text render mode 3 (invisible) — glyph for glyph the same places,
      // nothing else painted (textOnly); each in its own q … Q, so the first leaves no state to the second
      const refs = contentRefs(page), copy = textOnly(pageContent(doc, page));
      if (!/(^|[\s)>\]])(Tj|TJ|'|")(?=[\s(<[/]|$)/.test(copy)) continue;     // its text all in forms: no copy here
      copied++;
      page.node.set(PDFName.of('Contents'), doc.context.obj([streamRef(doc, 'q\n')].concat(refs, [streamRef(doc, '\nQ\nq 3 Tr\n' + copy + '\nQ\n')])));
    }
    if (t === 'hfInject' || t === 'stamp') {
      // the page's own drawing closed in q … Q first (it may leave a matrix or colour set), then the stamp after it
      page.node.set(PDFName.of('Contents'), doc.context.obj([streamRef(doc, 'q\n')].concat(contentRefs(page), [streamRef(doc, '\nQ\n')])));
      const c = page.getCropBox();
      if (t === 'hfInject') {
        // as Acrobat's Header & Footer writes them: marked content /Artifact <</Type /Pagination /Subtype /Header>>
        const mark = (sub) => PDFOperator.of('BDC', [PDFName.of('Artifact'), doc.context.obj({ Type: 'Pagination', Subtype: sub })]);
        // at the paper's very edges (7 pt, 10 pt from the top, 6 pt from the bottom): clear of the running heads and
        // feet the seeds already carry (Chrome's date and title at about 20 pt — on one baseline with them, the
        // stamp and Chrome's header ran into one line, another drawing than the one meant)
        const grey = rgb(0.35, 0.35, 0.35), head = 'Kelk lab - quarterly review - internal', foot = 'Page ' + (i + 1) + ' of ' + pages.length;
        page.pushOperators(mark('Header'));
        page.drawText(head, { x: c.x + c.width - 40 - helv.widthOfTextAtSize(head, 7), y: c.y + c.height - 10, size: 7, font: helv, color: grey });
        page.pushOperators(endMarkedContent(), mark('Footer'));
        page.drawText(foot, { x: c.x + (c.width - helv.widthOfTextAtSize(foot, 7)) / 2, y: c.y + 6, size: 7, font: helv, color: grey });
        page.pushOperators(endMarkedContent());
      } else {
        // across the page's diagonal, centred, as wide as 80 % of it
        const text = 'CONFIDENTIAL DRAFT', a = Math.atan2(c.height, c.width), size = 0.8 * Math.hypot(c.width, c.height) / helv.widthOfTextAtSize(text, 1);
        const w = helv.widthOfTextAtSize(text, size), cx = c.x + c.width / 2, cy = c.y + c.height / 2;
        page.drawText(text, { x: cx - (w / 2) * Math.cos(a) + (size * 0.35) * Math.sin(a), y: cy - (w / 2) * Math.sin(a) - (size * 0.35) * Math.cos(a),
          size, font: helv, color: rgb(0.6, 0.6, 0.6), opacity: 0.3, rotate: degrees(a * 180 / Math.PI) });
      }
    }
  }
  // (a copy of nothing would read as "same": the transform did not happen)
  if (t === 'renderMode' && !copied) throw nothing('no page-level text to copy (its text is in forms)');
  for (const page of pages) {
    const box = page.getMediaBox(), x0 = box.x, y0 = box.y, W = box.width, H = box.height;
    let pre = null, post = null, k = 1, dx = 0, dy = 0;
    if (t === 'scale80') { k = 0.8; dx = (x0 + W / 2) * 0.2; dy = (y0 + H / 2) * 0.2; }
    if (t === 'scale125') { k = 1.25; }
    if (k !== 1) { pre = `q ${k} 0 0 ${k} ${dx.toFixed(3)} ${dy.toFixed(3)} cm\n`; post = '\nQ\n'; }
    if (t === 'pagebg') pre = `q 0.94 0.95 0.97 rg ${x0} ${y0} ${W} ${H} re f Q\n`;
    if (t === 'band') pre = `q 0.85 0.91 0.97 rg ${x0} ${(y0 + H * 0.62).toFixed(2)} ${W} ${(H * 0.38).toFixed(2)} re f Q\n`;
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
  if (!did) throw nothing('nothing to change');
  fs.writeFileSync(q, Buffer.from(s, 'latin1'));
  fs.writeFileSync(f, run('fix-qdf', [q]));
  run('qpdf', ['--object-streams=preserve', '--compress-streams=y', '--recompress-flate', f, o]);
  return fs.readFileSync(o);
}

(async () => {
  fs.rmSync(META, { recursive: true, force: true });
  // Playwright's Chromium for the generator-side transforms, or null (they are skipped then)
  let browser = null, chromiumVersion = null;
  try { browser = await req('playwright').chromium.launch(); chromiumVersion = browser.version(); } catch (e) { browser = null; }
  // env: what drew the files — per transform, run-meta.js keeps the part its `via` depends on (the gate compares that)
  const manifest = { generator: GENERATOR, env: { qpdf: QPDF, qpdfPkg: QPDF_PKG, pdfLib: req('pdf-lib/package.json').version, chromium: chromiumVersion, platform: process.platform },
    transforms: TRANSFORMS, seeds: SEEDS, files: [], skipped: {} };
  let n = 0, skipped = 0;
  // a file not made: expected when the transform finds nothing to change in that seed (noted with ∅: a file that
  // would read as its seed for no reason); anything else is a failure — the file would drop out of the net unseen
  const failures = [];
  const failed = (t, seed, e) => {
    const msg = String(e && e.message || e).split('\n')[0];
    if (e && e.expected) { console.log('∅', t, seed, '(expected: ' + msg + ')'); (manifest.notMade = manifest.notMade || []).push(t + '/' + seed + ': ' + msg); }
    else { console.log('✗', t, seed, msg); failures.push(t + '/' + seed); }
  };
  const made = Object.keys(TRANSFORMS).filter((t) => TRANSFORMS[t].via === 'pdf-lib' || (TRANSFORMS[t].via === 'qpdf' && QPDF) || (TRANSFORMS[t].via === 'chromium' && browser));
  const noTool = (via, why) => { const ts = Object.keys(TRANSFORMS).filter((t) => TRANSFORMS[t].via === via && !made.includes(t)); if (ts.length) { console.log(why + ': skipped ' + ts.join(', ')); ts.forEach((t) => { manifest.skipped[t] = why; }); } };
  noTool('qpdf', 'qpdf not found (they need qpdf / fix-qdf)');
  noTool('chromium', 'Playwright\'s Chromium did not start');
  // the generator side: one control per drawable seed (the recipe without a change) and its variants
  const drawable = SEEDS.filter((s) => recipe(s));
  const page = browser && GEN.some((t) => made.includes(t)) ? await browser.newPage() : null;
  if (page) {
    fs.mkdirSync(path.join(META, '_control'), { recursive: true });
    for (const seed of drawable) await draw(page, seed, recipe(seed), genChange('control', recipe(seed)), path.join(META, '_control', seed + '.pdf'));
    console.log('generator side: ' + drawable.length + ' seeds drawn again (' + drawable.join(', ') + '); the other ' + (SEEDS.length - drawable.length) +
      ' have no recipe here (office files, imitated producers, pages of their own) and are skipped for ' + GEN.join(', '));
  }
  for (const [t, spec] of Object.entries(TRANSFORMS)) {
    if (!made.includes(t)) continue;
    fs.mkdirSync(path.join(META, t), { recursive: true });
    for (const seed of SEEDS) {
      if (spec.via === 'chromium') {
        if (!recipe(seed)) { skipped++; continue; }
        try { await draw(page, seed, recipe(seed), genChange(t, recipe(seed)), path.join(META, t, seed + '.pdf')); }
        catch (e) { failed(t, seed, e); continue; }
        manifest.files.push({ transform: t, seed, doc: recipe(seed).doc, ref: '_control/' + seed + '.pdf' });
        n++; continue;
      }
      const src = fs.readFileSync(pdfPath(seed + '.pdf'));
      if (spec.taggedOnly && !/\/StructTreeRoot/.test(run('qpdf', ['--qdf', '--object-streams=disable', pdfPath(seed + '.pdf'), '-']).toString('latin1'))) { skipped++; continue; }
      let out;
      try {
        if (t === 'objstm') {
          const a = path.join(tmp, 's.pdf'), o = path.join(tmp, 'so.pdf');
          fs.writeFileSync(a, src); run('qpdf', ['--object-streams=generate', '--compress-streams=y', '--recompress-flate', a, o]); out = fs.readFileSync(o);
        } else if (PAGE_LEVEL.includes(t)) out = await pageLevel(src, t);
        else out = opLevel(src, t);
      } catch (e) { failed(t, seed, e); continue; }
      fs.writeFileSync(path.join(META, t, seed + '.pdf'), out);
      manifest.files.push({ transform: t, seed, doc: seed.split('--')[1] });
      n++;
    }
  }
  if (browser) await browser.close();
  fs.writeFileSync(path.join(META, 'manifest.json'), JSON.stringify(manifest, null, 1));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(n + ' PDFs in ' + META + ' (' + made.length + ' of ' + Object.keys(TRANSFORMS).length + ' transforms × ' + SEEDS.length + ' seeds' +
    (skipped ? '; ' + skipped + ' pairs skipped: untagged seeds for untag, seeds with no recipe for the generator side' : '') + ')');
  if (failures.length) { console.log('FAILED: ' + failures.length + ' file(s) could not be made: ' + failures.join(', ')); process.exitCode = 1; }
})().catch((e) => { console.error(e); process.exit(1); });
