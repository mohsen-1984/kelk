// Style fuzzing: the corpus documents printed in styles the lab's rules were never tuned on.
// Each sample is one corpus document × one style drawn from a seeded random generator, so a run is
// reproducible (same seed, same Chromium, same fonts → the same PDFs) and every PDF has its style
// written down in manifest.json.
//
//   node scripts/make-fuzz.js [split] [count]     split: dev (default) | heldout
//
// Two splits, two uses (PDFIMPORT.md §11):
//   dev      debug freely: open the files, read the Markdown, write rules from what you see
//   heldout  never opened while a rule is written — only its aggregate scores are read (run-fuzz.js).
//            It measures whether a change generalises; the moment a rule is tuned on one of its
//            files it becomes a second dev set and stops measuring anything.
// The seeds of the two splits never overlap (dev 1…, heldout 100001…).
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const { chromium } = require('./env.js').req('playwright');
const KELK = require('./env.js').KELK;
const marked = require(KELK + '/vendor/marked.umd.min_18.0.14.js');
const LAB = path.join(__dirname, '..'), FUZZ = require('./env.js').FUZZ;

// the generator's version: a new dimension or style changes the PDFs of every seed, and the gate must not
// compare means across it (it is part of the manifest's env)
const GENERATOR = 3;     // 1: the first draw; 2: + headCase, tagged; 3: two-column content fits its column
const SPLITS = { dev: { base: 1, count: 100 }, heldout: { base: 100001, count: 100 } };
const DOCS = ['article', 'features', 'readme', 'report', 'symbols'];

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
    tagged: pick(r, { no: 1, yes: 1 })
  };
  // what the producer cannot do is recorded as what it did (wkhtmltopdf: no CSS columns, no Chrome header/footer)
  if (s.producer === 'wkhtmltopdf') { s.columns = '1'; s.headerFooter = 'off'; s.tagged = 'no'; }
  return s;
}

function css(s) {
  const pt = s.size, hs = HEAD_SCALE[s.headScale];
  const hf = s.headFont === 'sans' ? '"Liberation Sans",sans-serif' : s.headFont === 'serif' ? '"Liberation Serif",serif' : 'inherit';
  const out = [
    `body{font-family:${FONTS[s.font]};font-size:${pt}pt;line-height:${s.leading};text-align:${s.align};color:#111;margin:0}`,
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
    { box: 'pre{background:#f4f5f7;border:1px solid #d5d8dc;padding:8px;font-size:.85em}',
      bar: 'pre{border-left:3px solid #888;padding-left:8px;font-size:.85em}',
      plain: 'pre{font-size:.85em;margin-left:1.5em}',
      dashed: 'pre{border:1px dashed #999;padding:6px;font-size:.85em}',
      dark: 'pre{background:#272822;color:#f8f8f2;padding:10px;font-size:.85em}' }[s.code],
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
    s.headCase === 'upper' ? 'h1,h2,h3,h4{text-transform:uppercase;letter-spacing:.04em}' : '',
    'a{color:#0645ad}'
  ];
  return out.filter(Boolean).join('\n');
}

const MARGIN = { narrow: '1cm', normal: '2cm', wide: '3cm' };
const HF = `<div style="font-size:7px;width:100%;display:flex;justify-content:space-between;padding:0 1cm;font-family:Arial"><span class="title"></span><span><span class="pageNumber"></span>/<span class="totalPages"></span></span></div>`;

(async () => {
  const split = process.argv[2] || 'dev';
  if (!SPLITS[split]) { console.error('split: dev | heldout'); process.exit(1); }
  const count = +process.argv[3] || SPLITS[split].count;
  // --tagged=all|none overrides the drawn value: the same styles with and without a structure tree,
  // for a paired test (does tagging alone move the importer?) — such a set is no dev or held-out split
  const forceTagged = (process.argv.find((a) => /^--tagged=/.test(a)) || '').split('=')[1] || null;
  const dir = path.join(FUZZ, split);
  fs.mkdirSync(dir, { recursive: true });
  fs.readdirSync(dir).filter((f) => /\.pdf$/.test(f)).forEach((f) => fs.unlinkSync(path.join(dir, f)));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kelk-fuzz-'));
  const browser = await chromium.launch(), page = await browser.newPage();
  // the environment: the same seed gives the same PDF only with the same browser, wkhtmltopdf and fonts —
  // the gate compares stored scores only when this matches (gate.js)
  const env = { generator: GENERATOR, chromium: browser.version(), wkhtmltopdf: null, fonts: {} };
  try { env.wkhtmltopdf = cp.execFileSync('wkhtmltopdf', ['--version']).toString().trim(); } catch (e) { /* not installed */ }
  Object.keys(FONTS).concat(Object.keys(MONO)).forEach((k) => {
    const fam = (FONTS[k] || MONO[k]).split(',')[0].replace(/"/g, '');
    try { env.fonts[k] = path.basename(cp.execFileSync('fc-match', ['-f', '%{file}', fam]).toString()); } catch (e) { env.fonts[k] = null; }
  });
  const manifest = { split, generated: new Date().toISOString(), env, samples: [] };
  for (let i = 0; i < count; i++) {
    const seed = SPLITS[split].base + i, s = drawStyle(seed);
    if (s.producer === 'wkhtmltopdf' && !env.wkhtmltopdf) s.producer = 'chromium';
    if (forceTagged && s.producer === 'chromium') s.tagged = forceTagged === 'all' ? 'yes' : 'no';
    const md = fs.readFileSync(path.join(LAB, 'corpus', s.doc + '.md'), 'utf8');
    const title = (md.match(/^# (.+)$/m) || [, s.doc])[1];
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><style>${css(s)}</style></head><body>${marked.parse(md)}</body></html>`;
    const name = `fz${seed}-${s.producer === 'chromium' ? 'chr' : 'wk'}--${s.doc}`;
    const out = path.join(dir, name + '.pdf');
    if (s.producer === 'chromium') {
      await page.setContent(html);
      await page.pdf({ path: out, format: s.paper, printBackground: true, displayHeaderFooter: s.headerFooter === 'on',
        headerTemplate: '<span></span>', footerTemplate: HF, tagged: s.tagged === 'yes', outline: s.tagged === 'yes',
        margin: { top: MARGIN[s.margin], bottom: MARGIN[s.margin], left: MARGIN[s.margin], right: MARGIN[s.margin] } });
    } else {
      const hp = path.join(tmp, name + '.html'); fs.writeFileSync(hp, html);
      const m = MARGIN[s.margin].replace('cm', '0mm');
      cp.execFileSync('wkhtmltopdf', ['--quiet', '-s', s.paper, '-T', m, '-B', m, '-L', m, '-R', m, hp, out], { stdio: ['ignore', 'ignore', 'pipe'] });
    }
    manifest.samples.push(Object.assign({ name, seed }, s));
    process.stdout.write('.');
  }
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.log('\n' + count + ' PDFs in ' + path.relative(process.cwd(), dir) + '/ (manifest.json has each style)');
})();

