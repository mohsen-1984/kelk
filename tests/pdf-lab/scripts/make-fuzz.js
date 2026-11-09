// Style fuzzing: the corpus documents printed in styles the lab's rules were never tuned on.
// Each sample is one corpus document × one style drawn from a seeded random generator, so a run is
// reproducible (same seed, same Chromium, same fonts → the same PDFs) and every PDF has its style
// written down in manifest.json.
//
//   node scripts/make-fuzz.js [split] [count]     split: dev (default) | heldout
//   node scripts/make-fuzz.js --rotate            the held-out block now and the next one, and how to rotate (tests/pdf-lab/HELDOUT.md)
//
// Two splits, two uses (PDFIMPORT.md §11):
//   dev      debug freely: open the files, read the Markdown, write rules from what you see
//   heldout  never opened while a rule is written — only its aggregate scores are read (run-fuzz.js).
//            It measures whether a change generalises; the moment a rule is tuned on one of its
//            files it becomes a second dev set and stops measuring anything.
// The seeds of the two splits never overlap (dev 1…, heldout HELDOUT_BASE…: 100001… until the first rotation).
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const { chromium } = require('./env.js').req('playwright');
const KELK = require('./env.js').KELK;
const marked = require(KELK + '/vendor/marked.umd.min_18.0.14.js');
const LAB = path.join(__dirname, '..'), FUZZ = require('./env.js').FUZZ, fileUrl = require('./env.js').fileUrl;

// the generator's version: a new dimension or style changes the PDFs of every seed, and the gate must not
// compare means across it (it is part of the manifest's env)
// 1: the first draw; 2: + headCase, tagged; 3: two-column content fits its column;
// 4: + the right-to-left documents (4 of 9: dir rtl, Persian / Arabic body fonts, digits), tracking (letter-spacing)
const GENERATOR = 4;
// The held-out split's first seed. It rotates (tests/pdf-lab/HELDOUT.md, "Rotation"): every 6 months, or as soon as a held-out
// file was opened (run-fuzz.js heldout --show, logged in tests/pdf-lab/heldout-opened.log) — then it moves up by 100000
// (the next unused block: 200001, 300001, …), HELDOUT_ROTATION goes up by one, a row is added below, and the gate's
// held-out baseline is rebuilt (the rotation is part of the manifest's env, so the old means are never compared
// with the new set's). Never back to an earlier block: those files were seen.
// Rotation history (Solar Hijri date · base · why):
//   0  (from the start)  100001  the first held-out block, generators 1–4; its rotation clock starts 1405-08-12
const HELDOUT_ROTATION = 0;
const HELDOUT_BASE = 100001 + 100000 * HELDOUT_ROTATION;
const SPLITS = { dev: { base: 1, count: 100 }, heldout: { base: HELDOUT_BASE, count: 100 } };
// round robin over the documents: 4 of 9 right-to-left (44 % of each split)
const DOCS = ['article', 'features', 'readme', 'report', 'symbols', 'fa-article', 'fa-report', 'ar-article', 'fa-mixed'];
const isRtl = (doc) => /^(fa|ar)-/.test(doc);

// ── seeded random (mulberry32) ─────────────────────────────────────────
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// a choice: an array of values, or { value: weight }
function pick(r, opts) {
  if (Array.isArray(opts)) return opts[Math.floor(r() * opts.length)];
  const ks = Object.keys(opts), tot = ks.reduce((s, k) => s + opts[k], 0);
  let x = r() * tot; for (const k of ks) { x -= opts[k]; if (x < 0) return k; } return ks[ks.length - 1];
}

// ── the style space: every dimension is a named value, so scores can be read per value ──
const FONTS = {
  'liberation-serif': '"Liberation Serif",serif', 'liberation-sans': '"Liberation Sans",sans-serif',
  'dejavu-serif': '"DejaVu Serif",serif', 'dejavu-sans': '"DejaVu Sans",sans-serif',
  inter: 'Inter,sans-serif', charter: '"Bitstream Charter",serif', carlito: 'Carlito,sans-serif', caladea: 'Caladea,serif'
};
const MONO = { 'dejavu-mono': '"DejaVu Sans Mono",monospace', 'liberation-mono': '"Liberation Mono",monospace', courier: '"Courier 10 Pitch",Courier,monospace' };
const HEAD_SCALE = { large: [2.0, 1.55, 1.25, 1.1], medium: [1.6, 1.3, 1.15, 1.0], small: [1.3, 1.15, 1.05, 1.0] };
// right-to-left body fonts: Vazirmatn and Sahel from the repository (assets/fonts/download/persian-fonts-ttf.zip,
// static TTFs: wkhtmltopdf takes no woff2), loaded by @font-face from a temporary folder; Noto Naskh Arabic from the
// system (fonts-noto-core on the CI runner), by @font-face local(). Each is declared under a family of its own
// (`face`) with a unicode-range of the Arabic blocks, ZWNJ / ZWJ and the direction marks, so it serves the Arabic
// script only: Latin letters, ASCII digits, spaces and Latin punctuation fall through to the drawn Latin font
// (`latinFont`) — Vazirmatn and Sahel have Latin glyphs of their own, which would otherwise take every Latin run.
const RTL_RANGE = 'U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF,U+200C-200F';
const RTL_FONTS = {
  vazirmatn: { family: 'Vazirmatn', face: 'Fuzz Vazirmatn', files: { 400: 'vazirmatn/Vazirmatn-Regular.ttf', 700: 'vazirmatn/Vazirmatn-Bold.ttf' } },
  sahel: { family: 'Sahel', face: 'Fuzz Sahel', files: { 400: 'sahel/Sahel.ttf', 700: 'sahel/Sahel-Bold.ttf' } },
  'noto-naskh': { family: 'Noto Naskh Arabic', face: 'Fuzz Naskh', files: null,
    local: { 400: ['Noto Naskh Arabic', 'Noto Naskh Arabic Regular', 'NotoNaskhArabic-Regular'], 700: ['Noto Naskh Arabic Bold', 'NotoNaskhArabic-Bold'] } }
};
const NASKH_FACE = Object.entries(RTL_FONTS['noto-naskh'].local).map(([w, names]) =>
  `@font-face{font-family:"Fuzz Naskh";src:${names.map((n) => `local("${n}")`).join(',')};font-weight:${w};unicode-range:${RTL_RANGE}}`).join('\n');
const FONT_ZIP = path.join(__dirname, '..', '..', '..', 'assets', 'fonts', 'download', 'persian-fonts-ttf.zip');
// tracking: letter-spacing over the whole text, as a producer sets it (the metamorphic net's trackTight / trackLoose
// shift each run's glyphs by Tc after the fact; here the producer lays the lines out with it)
const TRACKING = { none: '0', tight: '-0.04em', loose: '0.08em' };

// the digits of a right-to-left document (`digits`): asis — as written; ascii — every number ASCII; native — every
// number of the running text in the native digits (Persian ۰–۹ in fa, Arabic-Indic ٠–٩ in ar) except one attached to a
// Latin word (directly or through one space or hyphen: SHA-256, p95, Alpine 3.19, 64 GB, PostgreSQL 16 stay ASCII, as
// Persian text writes them). A number is a run of digits with its separators: native writes the decimal point ٫, the
// thousands separator ٬ and a following percent sign ٪ (as ar-article does), ascii writes them . , % back. In the text
// only — code (fenced and inline), link targets, bare addresses and list markers keep theirs; table cells are text.
const FA = '۰۱۲۳۴۵۶۷۸۹', AR = '٠١٢٣٤٥٦٧٨٩';
const NUM = /[0-9۰-۹٠-٩]+(?:[.,٫٬][0-9۰-۹٠-٩]+)*[%٪]?/g;
function digitsTo(md, mode, lang) {
  if (mode !== 'ascii' && mode !== 'native') return md;
  const native = lang === 'ar' ? AR : FA;
  const toAscii = (n) => n.replace(/[۰-۹]/g, (c) => String(FA.indexOf(c))).replace(/[٠-٩]/g, (c) => String(AR.indexOf(c)))
    .replace(/٫/g, '.').replace(/٬/g, ',').replace(/٪/g, '%');
  const toNative = (n) => n.replace(/[0-9]/g, (c) => native[+c]).replace(/\./g, '٫').replace(/,/g, '٬').replace(/%/g, '٪');
  const latinNear = (t, at, end) => /[A-Za-z][ -]?$/.test(t.slice(Math.max(0, at - 2), at)) || /^[ -]?[A-Za-z]/.test(t.slice(end, end + 2));
  const conv = (t) => t.replace(NUM, (n, at) => mode === 'ascii' ? toAscii(n) : latinNear(t, at, at + n.length) ? n : toNative(n));
  let fence = false;
  return md.split('\n').map((line) => {
    if (/^\s*```/.test(line)) { fence = !fence; return line; }
    if (fence) return line;
    const lead = (line.match(/^\s*(?:\d+[.)]\s+)?/) || [''])[0];     // a numbered item's marker stays ASCII (Markdown syntax)
    return lead + line.slice(lead.length).split(/(`[^`]*`|\]\([^)]*\)|https?:\/\/\S+)/).map((p, i) => i % 2 ? p : conv(p)).join('');
  }).join('\n');
}

function drawStyle(seed) {
  const r = rng(seed);
  const s = {
    producer: pick(r, { chromium: 3, wkhtmltopdf: 1 }),
    doc: DOCS[seed % DOCS.length],     // round robin: both splits hold every document equally often
    font: pick(r, Object.keys(FONTS)),
    size: pick(r, [9, 10, 11, 12, 13]),
    leading: pick(r, [1.15, 1.3, 1.5, 1.7]),
    paper: pick(r, { A4: 3, Letter: 3, A5: 1 }),
    margin: pick(r, { narrow: 1, normal: 2, wide: 1 }),
    align: pick(r, { left: 2, justify: 1 }),
    columns: pick(r, { 1: 3, 2: 1 }),
    headScale: pick(r, Object.keys(HEAD_SCALE)),
    headFont: pick(r, ['same', 'sans', 'serif']),
    paragraph: pick(r, { spaced: 3, indent: 1 }),
    quote: pick(r, ['bar', 'box', 'indent', 'italic-indent', 'bar-shaded']),
    code: pick(r, ['box', 'bar', 'plain', 'dashed', 'dark']),
    mono: pick(r, Object.keys(MONO)),
    inlineCode: pick(r, ['chip', 'plain']),
    table: pick(r, ['grid', 'rules', 'zebra', 'none', 'header-dark']),
    list: pick(r, ['default', 'tight', 'wide']),
    headerFooter: pick(r, { off: 2, on: 1 }),
    // (drawn last: a new dimension goes at the end, so the styles drawn before it stay the same per seed)
    headCase: pick(r, { none: 4, upper: 1 }),
    // a structure tree and an outline (desktop Chrome writes them; headless Chrome only when asked)
    tagged: pick(r, { no: 1, yes: 1 }),
    // generator 4 — drawn for every seed, whatever its document, so the draws above keep their values
    rtlFont: pick(r, Object.keys(RTL_FONTS)),
    // asis (the document as written: fa-report and fa-mixed mix ASCII and Persian digits on purpose) added after
    // ascii and native: one draw still, so `tracking` keeps its value per seed
    digits: pick(r, { ascii: 1, native: 1, asis: 1 }),
    tracking: pick(r, { none: 2, tight: 1, loose: 1 })
  };
  // the direction follows the document; a right-to-left one is set in its right-to-left font (`font`), Latin runs in
  // the drawn Latin one (`latinFont`); a left-to-right one has no digits to choose and no second font ('-')
  s.dir = isRtl(s.doc) ? 'rtl' : 'ltr';
  if (s.dir === 'rtl') { s.latinFont = s.font; s.font = s.rtlFont; } else { s.digits = '-'; s.latinFont = '-'; }
  delete s.rtlFont;
  // what the producer cannot do is recorded as what it did (wkhtmltopdf: no CSS columns, no Chrome header/footer)
  if (s.producer === 'wkhtmltopdf') { s.columns = '1'; s.headerFooter = 'off'; s.tagged = 'no'; }
  return s;
}

// faces: the @font-face rules of the right-to-left fonts (url per weight), '' when none is needed
function css(s, faces) {
  const pt = s.size, hs = HEAD_SCALE[s.headScale], rtl = s.dir === 'rtl';
  // right-to-left: the right-to-left font first (it holds the Arabic letters; a Latin font such as DejaVu would take
  // them too), the Latin one after it for what it lacks; headings in a sans / serif pair of the same kind
  const body = rtl ? `"${RTL_FONTS[s.font].face}",${FONTS[s.latinFont]}` : FONTS[s.font];
  const hf = s.headFont === 'sans' ? (rtl ? '"Fuzz Vazirmatn","Liberation Sans",sans-serif' : '"Liberation Sans",sans-serif')
    : s.headFont === 'serif' ? (rtl ? '"Fuzz Naskh","Liberation Serif",serif' : '"Liberation Serif",serif') : 'inherit';
  // a code block is left to right in either direction: its sheet is never mirrored (its bar stays on the left)
  const codeBlock = { box: 'pre{background:#f4f5f7;border:1px solid #d5d8dc;padding:8px;font-size:.85em}',
    bar: 'pre{border-left:3px solid #888;padding-left:8px;font-size:.85em}',
    plain: 'pre{font-size:.85em;margin-left:1.5em}',
    dashed: 'pre{border:1px dashed #999;padding:6px;font-size:.85em}',
    dark: 'pre{background:#272822;color:#f8f8f2;padding:10px;font-size:.85em}' }[s.code];
  const out = [
    faces || '',
    `body{font-family:${body};font-size:${pt}pt;line-height:${s.leading};text-align:${s.align};color:#111;margin:0}`,
    // two columns: content fits its column, as a real two-column document's does (tables and code set smaller,
    // a word broken only when it cannot fit) — a table wider than the column was cut at the page edge (its last
    // column never drawn: lost in the PDF itself, generator 2)
    s.columns === '2' ? 'body{column-count:2;column-gap:1.1cm} h1{column-span:all} table{width:100%;font-size:.78em} td,th{overflow-wrap:break-word;padding-left:3px;padding-right:3px} pre{white-space:pre-wrap;overflow-wrap:break-word;font-size:.8em} img{max-width:100%}' : '',
    `h1,h2,h3,h4{font-family:${hf};line-height:1.2;margin:1.1em 0 .4em;text-align:left}`,
    `h1{font-size:${hs[0]}em} h2{font-size:${hs[1]}em} h3{font-size:${hs[2]}em} h4{font-size:${hs[3]}em}`,
    s.paragraph === 'indent' ? 'p{margin:0;text-indent:1.5em} h1+p,h2+p,h3+p,h4+p{text-indent:0}' : 'p{margin:0 0 .8em}',
    `code,pre{font-family:${MONO[s.mono]}}`,
    s.inlineCode === 'chip' ? 'code{background:#eceff2;padding:.1em .3em;border-radius:3px;font-size:.88em}' : 'code{font-size:.92em}',
    'pre code{background:none;padding:0;font-size:inherit}',
    rtl ? '' : codeBlock,
    { bar: 'blockquote{border-left:4px solid #bbb;margin:0 0 .8em;padding:0 1em;color:#444}',
      box: 'blockquote{background:#eef2f8;margin:0 0 .8em;padding:.4em 1em}',
      indent: 'blockquote{margin:0 2.5em .8em}',
      'italic-indent': 'blockquote{margin:0 2.5em .8em;font-style:italic}',
      'bar-shaded': 'blockquote{border-left:4px solid #e0a000;background:#fff8e6;margin:0 0 .8em;padding:.2em 1em}' }[s.quote],
    { grid: 'table{border-collapse:collapse} th,td{border:1px solid #888;padding:2px 6px}',
      rules: 'table{border-collapse:collapse;border-top:1.5px solid #000;border-bottom:1.5px solid #000} th{border-bottom:1px solid #000} th,td{padding:2px 8px}',
      zebra: 'table{border-collapse:collapse} th,td{padding:3px 8px} tr:nth-child(even) td{background:#f0f2f5}',
      none: 'table{border-collapse:collapse} th,td{padding:1px 6px}',
      'header-dark': 'table{border-collapse:collapse} th{background:#234;color:#fff} th,td{padding:3px 8px;border-bottom:1px solid #ccc}' }[s.table],
    { default: '', tight: 'ul,ol{padding-left:1.2em}', wide: 'ul,ol{padding-left:2.6em}' }[s.list],
    s.tracking && s.tracking !== 'none' ? `body{letter-spacing:${TRACKING[s.tracking]}}` : '',
    s.headCase === 'upper' ? 'h1,h2,h3,h4{text-transform:uppercase;letter-spacing:.04em}' : '',
    'a{color:#0645ad}'
  ];
  // right-to-left: the sheet mirrored (bars, indents, start alignment on the right — old WebKit has no logical
  // properties), except the faces and the code block: code is left to right as the right-to-left sheets of the corpus
  // set it (make-rtl.js), its bar and indent on the left. A table's `align="left"` (Markdown `:---`) is kept as
  // written: marked writes it as an attribute, and browsers, GitHub and make-rtl.js print it on the left too.
  let sheet = out.filter(Boolean).join('\n');
  if (rtl) {
    const [fc, rest] = [faces || '', sheet.slice((faces || '').length)];
    sheet = fc + rest.replace(/\b(left|right)\b/g, (m) => m === 'left' ? 'right' : 'left') + '\n' + codeBlock + '\npre{direction:ltr;text-align:left}';
  }
  return sheet;
}

// the right-to-left fonts' TTFs out of the repository's zip into tmp: { key: '@font-face …' }, and per font a short
// hash of the TTFs it draws with, for the env (another font file draws other PDFs; other files in the zip do not)
async function rtlFaces(tmp) {
  const JSZip = require(path.join(__dirname, '..', '..', '..', 'vendor', 'jszip.min_3.10.2.js'));
  const buf = fs.readFileSync(FONT_ZIP), zip = await JSZip.loadAsync(buf), faces = {}, hashes = {};
  for (const [k, f] of Object.entries(RTL_FONTS)) {
    if (!f.files) continue;
    const rules = [], sha = require('crypto').createHash('sha1');
    for (const [w, entry] of Object.entries(f.files)) {
      const out = path.join(tmp, path.basename(entry)), data = await zip.file(entry).async('nodebuffer');
      fs.writeFileSync(out, data);
      sha.update(data);
      rules.push(`@font-face{font-family:"${f.face}";src:url("${fileUrl(out)}") format("truetype");font-weight:${w};unicode-range:${RTL_RANGE}}`);
    }
    faces[k] = rules.join('\n');
    hashes[k] = sha.digest('hex').slice(0, 12);
  }
  faces['noto-naskh'] = NASKH_FACE;
  return { faces, hashes };
}

const MARGIN = { narrow: '1cm', normal: '2cm', wide: '3cm' };
const HF = `<div style="font-size:7px;width:100%;display:flex;justify-content:space-between;padding:0 1cm;font-family:Arial"><span class="title"></span><span><span class="pageNumber"></span>/<span class="totalPages"></span></span></div>`;

(async () => {
  // --rotate: what the next rotation is and how it is done (tests/pdf-lab/HELDOUT.md) — it changes nothing itself
  if (process.argv.includes('--rotate')) {
    const next = HELDOUT_ROTATION + 1;
    console.log('held-out now: rotation ' + HELDOUT_ROTATION + ', seeds ' + HELDOUT_BASE + '–' + (HELDOUT_BASE + SPLITS.heldout.count - 1) + '\n' +
      'next:         rotation ' + next + ', seeds ' + (100001 + 100000 * next) + '–' + (100001 + 100000 * next + SPLITS.heldout.count - 1) + '\n' +
      'to rotate: set HELDOUT_ROTATION = ' + next + ' in scripts/make-fuzz.js, add its row to the rotation history, run make-fuzz.js heldout,\n' +
      'and rebuild the held-out part of baseline.json in the approval step — tests/pdf-lab/HELDOUT.md, "Rotation"');
    return;
  }
  const split = process.argv[2] || 'dev';
  if (!SPLITS[split]) { console.error('split: dev | heldout'); process.exit(1); }
  const count = +process.argv[3] || SPLITS[split].count;
  // --tagged=all|none overrides the drawn value: the same styles with and without a structure tree,
  // for a paired test (does tagging alone move the importer?) — such a set is no dev or held-out split
  const forceTagged = (process.argv.find((a) => /^--tagged=/.test(a)) || '').split('=')[1] || null;
  const dir = path.join(FUZZ, split);
  fs.mkdirSync(dir, { recursive: true });
  // the PDFs and the sources of the files whose digits were rewritten (<name>.md, scored instead of corpus/<doc>.md)
  fs.readdirSync(dir).filter((f) => /\.(pdf|md)$/.test(f)).forEach((f) => fs.unlinkSync(path.join(dir, f)));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kelk-fuzz-'));
  const browser = await chromium.launch(), page = await browser.newPage();
  const rf = await rtlFaces(tmp), allFaces = Object.values(rf.faces).join('\n');
  // the environment: the same seed gives the same PDF only with the same browser, wkhtmltopdf and fonts —
  // the gate compares stored scores only when this matches (gate.js)
  const env = { generator: GENERATOR, chromium: browser.version(), wkhtmltopdf: null, fonts: {} };
  try { env.wkhtmltopdf = cp.execFileSync('wkhtmltopdf', ['--version']).toString().trim(); } catch (e) { /* not installed */ }
  const fcMatch = (fam) => { try { return path.basename(cp.execFileSync('fc-match', ['-f', '%{file}', fam]).toString()); } catch (e) { return null; } };
  Object.keys(FONTS).concat(Object.keys(MONO)).forEach((k) => { env.fonts[k] = fcMatch((FONTS[k] || MONO[k]).split(',')[0].replace(/"/g, '')); });
  // the right-to-left fonts: the repository's (by the zip's hash), the system's Noto Naskh Arabic by its file and that
  // file's hash (a package update changes the hash). Whether the browser has it is asked through the very face the
  // pages use (local(), unicode-range); a missing one is drawn in the fallback — said below, and recorded (null), so
  // such a run never matches a baseline's env
  const naskhHere = await page.evaluate(async (face) => {
    const st = document.createElement('style'); st.textContent = face; document.head.appendChild(st);
    try { return (await document.fonts.load('40px "Fuzz Naskh"', 'سلام')).some((f) => f.status === 'loaded'); } catch (e) { return false; }
  }, NASKH_FACE);
  const sha = (f) => require('crypto').createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 12);
  let naskhFile = null;
  try { naskhFile = cp.execFileSync('fc-match', ['-f', '%{file}', RTL_FONTS['noto-naskh'].family]).toString(); } catch (e) { /* no fontconfig */ }
  Object.entries(RTL_FONTS).forEach(([k, f]) => {
    env.fonts[k] = f.files ? f.family + ' TTF#' + rf.hashes[k]
      : !naskhHere ? null : naskhFile && fs.existsSync(naskhFile) ? path.basename(naskhFile) + '#' + sha(naskhFile) : f.family;
  });
  // a rotated held-out block is another set of PDFs: recorded in the env (from the first rotation on, so the env of
  // the first block — and the baselines written with it — stay as they are)
  if (split === 'heldout' && HELDOUT_ROTATION > 0) env.heldoutRotation = HELDOUT_ROTATION;
  const manifest = { split, generated: new Date().toISOString(), base: SPLITS[split].base, env, samples: [] };
  let noWk = 0, noNaskh = 0;      // drawn for wkhtmltopdf, made with Chromium (not installed); Noto Naskh Arabic missing
  for (let i = 0; i < count; i++) {
    const seed = SPLITS[split].base + i, s = drawStyle(seed);
    if (s.producer === 'wkhtmltopdf' && !env.wkhtmltopdf) { s.producer = 'chromium'; noWk++; }
    if (forceTagged && s.producer === 'chromium') s.tagged = forceTagged === 'all' ? 'yes' : 'no';
    if (s.dir === 'rtl' && (s.font === 'noto-naskh' || s.headFont === 'serif') && !naskhHere) noNaskh++;
    const name = `fz${seed}-${s.producer === 'chromium' ? 'chr' : 'wk'}--${s.doc}`;
    const lang = s.dir === 'rtl' ? s.doc.slice(0, 2) : 'en';
    let md = fs.readFileSync(path.join(LAB, 'corpus', s.doc + '.md'), 'utf8');
    if (s.dir === 'rtl') {
      const md2 = digitsTo(md, s.digits, lang);
      if (md2 !== md) { md = md2; s.source = name + '.md'; fs.writeFileSync(path.join(dir, s.source), md); }
    }
    const title = (md.match(/^# (.+)$/m) || [, s.doc])[1];
    const html = `<!doctype html><html lang="${lang}"${s.dir === 'rtl' ? ' dir="rtl"' : ''}><head><meta charset="utf-8"><title>${title}</title>` +
      `<style>${css(s, s.dir === 'rtl' ? allFaces : '')}</style></head><body>${marked.parse(md)}</body></html>`;
    const out = path.join(dir, name + '.pdf');
    if (s.producer === 'chromium') {
      // right-to-left: from a file, so the page may load the fonts from tmp (file://); the fonts loaded before printing
      if (s.dir === 'rtl') {
        const hp = path.join(tmp, name + '.html'); fs.writeFileSync(hp, html);
        await page.goto(fileUrl(hp)); await page.evaluate(() => document.fonts.ready);
      } else await page.setContent(html);
      await page.pdf({ path: out, format: s.paper, printBackground: true, displayHeaderFooter: s.headerFooter === 'on',
        headerTemplate: '<span></span>', footerTemplate: HF, tagged: s.tagged === 'yes', outline: s.tagged === 'yes',
        margin: { top: MARGIN[s.margin], bottom: MARGIN[s.margin], left: MARGIN[s.margin], right: MARGIN[s.margin] } });
    } else {
      const hp = path.join(tmp, name + '.html'); fs.writeFileSync(hp, html);
      const m = MARGIN[s.margin].replace('cm', '0mm');
      // (local files: the right-to-left fonts' @font-face urls)
      cp.execFileSync('wkhtmltopdf', ['--quiet', '--enable-local-file-access', '-s', s.paper, '-T', m, '-B', m, '-L', m, '-R', m, hp, out], { stdio: ['ignore', 'ignore', 'pipe'] });
    }
    manifest.samples.push(Object.assign({ name, seed }, s));
    process.stdout.write('.');
  }
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1));
  const nRtl = manifest.samples.filter((s) => s.dir === 'rtl').length;
  console.log('');
  if (noWk) console.log('wkhtmltopdf not found: ' + noWk + ' files drawn with Chromium instead');
  if (noNaskh) console.log('Noto Naskh Arabic not found: ' + noNaskh + ' right-to-left files set (body or headings) in the browser\'s fallback instead');
  console.log(count + ' PDFs in ' + path.relative(process.cwd(), dir) + '/, ' + nRtl + ' right-to-left (' + Math.round(100 * nRtl / count) + ' %) — manifest.json has each style');
})();

