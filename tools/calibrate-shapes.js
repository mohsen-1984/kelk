/**
 * Calibrate the approximate reading of a font Kelk does not know (lib/pdfimport/shape.js read(), the acceptance in
 * lib/pdfimport/trust.js) on the fonts Kelk ships only — never on the lab's files.
 *   node tools/calibrate-shapes.js [--lambda 20] [--accept <arabic unseen> <arabic distance> <latin unseen> <latin distance>]
 * Each family Kelk ships plays the font Kelk does not know: our own text (docs/*.md, by language) is drawn in it, glyph
 * by glyph (PdfBuilder's shaping for the forms), and read back against the other families' shapes (shapes.js). The
 * letter pairs come from the lab's expected Markdown, the measured files left out — not from docs/, whose text is read.
 * The same pages are drawn in a font whose shapes are another glyph's (a fixed shuffle: what a reading of the wrong
 * font gives). Printed: per text length, the right letters' share, and the measures the acceptance reads — the
 * reading's unseen pairs, one-letter words and mean distance — for the right fonts and the shuffled ones. Writes nothing.
 */
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const PdfImporter = require(path.join(root, 'lib', 'PdfImporter.js'));
require(path.join(root, 'lib', 'pdfimport', 'fontprint.js'));
require(path.join(root, 'lib', 'pdfimport', 'shape.js'));
const { PdfBuilder } = require(path.join(root, 'lib', 'PdfBuilder.js'));
const JSZip = require(path.join(root, 'vendor', fs.readdirSync(path.join(root, 'vendor')).find((f) => /^jszip\.min_.*\.js$/.test(f))));
const S = PdfImporter._shape, faces = S.expand(require(path.join(root, 'lib', 'pdfimport', 'shapes.js')));
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? +process.argv[i + 1] : d; };
const LAMBDA = arg('--lambda', undefined);
// --accept <arabic unseen> <arabic dist> <latin unseen> <latin dist>: how many readings such limits accept
const ai = process.argv.indexOf('--accept');
const ACCEPT = ai > 0 ? { arabic: [+process.argv[ai + 1], +process.argv[ai + 2]], latin: [+process.argv[ai + 3], +process.argv[ai + 4]] } : null;

// the families that play the unknown font: [family in shapes.js, its font file in the zip or DejaVu's PdfBuilder file]
const FAMILIES = [['Vazirmatn', 'vazirmatn/Vazirmatn-Regular.ttf'], ['Sahel', 'sahel/Sahel.ttf'], ['B Nazanin', 'borna-rayaneh/BNAZANIN.TTF'],
  ['B Mitra', 'borna-rayaneh/BMITRA.TTF'], ['B Titr', 'borna-rayaneh/BTITRBD.TTF'], ['DejaVu Sans', 'dejavu'], ['DejaVu Serif', 'dejavu-serif']];
const MEASURED = ['glyph-index-fa.md', 'renumbered-en.md', 'unknown-serif-fa.md', 'unknown-serif-en.md', 'unreadable-fa.md',
  'cff-cid-fa.md', 'cff-type1c-fa.md', 'cff-known-fa.md', 'cff-unreadable-fa.md', 'cff-zwnj-fa.md', 'teh-fa.md', 'tatweel-fa.md',
  'scan-plain-fa.md', 'scan-framed-fa.md', 'scan-low-fa.md', 'scan-headings-fa.md', 'scan-columns-fa.md',
  'decipher-body-fa.md', 'decipher-cid-fa.md', 'decipher-subsets-fa.md', 'decipher-digits-fa.md', 'decipher-marks-fa.md',
  'decipher-short-fa.md', 'decipher-hollow-fa.md', 'decipher-cyrillic-ru.md', 'decipher-cross-fa.md',
  'decipher-ocr-terms-fa.md', 'decipher-ocr-digits-fa.md',
  'decipher-titr-small-fa.md', 'decipher-titr-large-fa.md',
  'decipher-titr-alone-fa.md'];
const fold = (t) => t.normalize('NFKC').replace(/[ً-ٰٟـ]/g, '').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک');

/** the letter pairs of the lab's expected Markdown (as tools/build-letterstats.js counts them: seen twice or more) */
function pairs() {
  const dir = path.join(root, 'tests', 'pdf-lab', 'corpus'), count = { arabic: {}, latin: {} };
  fs.readdirSync(dir).filter((f) => /\.md$/.test(f) && MEASURED.indexOf(f) < 0).forEach((f) => {
    const text = fold(fs.readFileSync(path.join(dir, f), 'utf8').replace(/```[\s\S]*?```/g, ' ').replace(/\]\([^)]*\)/g, '] '));
    text.split(/[^A-Za-zء-غف-يپچژکگی]+/).forEach((w) => {
      const sc = /[A-Za-z]/.test(w) ? 'latin' : 'arabic', l = sc === 'latin' ? w.toLowerCase() : w;
      for (let k = 0; k + 1 < l.length; k++) count[sc][l[k] + l[k + 1]] = (count[sc][l[k] + l[k + 1]] || 0) + 1;
    });
  });
  const out = {};
  Object.keys(count).forEach((sc) => { out[sc] = new Set(Object.keys(count[sc]).filter((p) => count[sc][p] >= 2)); });
  return out;
}

/** a TrueType font's Unicode cmap (format 4): code point → glyph id */
function cmap(d) {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength), n = v.getUint16(4), out = {};
  let cm = -1;
  for (let k = 0; k < n; k++) if (String.fromCharCode(d[12 + 16 * k], d[13 + 16 * k], d[14 + 16 * k], d[15 + 16 * k]) === 'cmap') cm = v.getUint32(20 + 16 * k);
  for (let k = 0; k < v.getUint16(cm + 2); k++) {
    const pid = v.getUint16(cm + 4 + 8 * k), eid = v.getUint16(cm + 6 + 8 * k), off = cm + v.getUint32(cm + 8 + 8 * k);
    if (!(pid === 3 && eid === 1) || v.getUint16(off) !== 4) continue;
    const seg = v.getUint16(off + 6) / 2, ends = off + 14, starts = ends + 2 * seg + 2, deltas = starts + 2 * seg, ranges = deltas + 2 * seg;
    for (let s = 0; s < seg; s++) {
      const e = v.getUint16(ends + 2 * s), st = v.getUint16(starts + 2 * s), dl = v.getInt16(deltas + 2 * s), ro = v.getUint16(ranges + 2 * s);
      for (let c = st; c <= e && c !== 0xFFFF; c++) {
        let g;
        if (!ro) g = (c + dl) & 0xFFFF;
        else { g = v.getUint16(ranges + 2 * s + ro + 2 * (c - st)); if (g) g = (g + dl) & 0xFFFF; }
        if (g) out[c] = g;
      }
    }
  }
  return out;
}

/** our text by script: docs/*.<lang>.md, Markdown marks and code dropped, paragraphs of words */
function texts() {
  const out = { arabic: [], latin: [] };
  fs.readdirSync(path.join(root, 'docs')).filter((f) => /\.(fa|ar|en)\.md$/.test(f)).sort().forEach((f) => {
    const sc = /\.en\.md$/.test(f) ? 'latin' : 'arabic';
    const t = fs.readFileSync(path.join(root, 'docs', f), 'utf8').replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, ' ').replace(/<[^>]+>/g, ' ').replace(/[#*_>|$\\[\]]/g, ' ');
    const keep = sc === 'latin' ? /[^A-Za-z0-9 .,;:!?'()-]/g : /[^ء-غف-يپچژکگی۰-۹0-9 .،؛:؟!()‌-]/g;
    t.split(/\n\s*\n/).forEach((p) => { const w = p.replace(keep, ' ').replace(/\s+/g, ' ').trim(); if (w.length > 20 && (sc === 'latin' || /[ء-ی]/.test(w))) out[sc].push(w); });
  });
  return out;
}

/** a text drawn in a font: words of glyph ids (forms by PdfBuilder's shaping), each id's uses */
function draw(text, map) {
  const words = [], uses = {};
  text.split(' ').forEach((w) => {
    const shaped = PdfBuilder._shaping.shapeArabic(w.replace(/‌/g, '')), ids = [];
    Array.from(shaped).forEach((c) => { const g = map[c.codePointAt(0)]; if (g) { ids.push(String(g)); uses[g] = (uses[g] || 0) + 1; } });
    if (ids.length) words.push(ids);
  });
  return { words, uses };
}

const measures = (r, truth, words) => {
  let right = 0, all = 0, single = 0, nw = 0;
  words.forEach((w) => {
    const t = w.map((g) => r.text[g] || '');
    w.forEach((g) => { if (truth[g]) { all++; if (fold(r.text[g] || '').toLowerCase() === fold(truth[g]).toLowerCase()) right++; } });
    nw++; if (t.length === 1 && /[ء-ی]/.test(t[0]) && fold(t[0]) !== 'و') single++;
  });
  return { right: all ? right / all : 0, unseen: r.pairs ? r.unseen / r.pairs : 0, single: nw ? single / nw : 0, dist: r.dist, moved: r.moved, letters: all };
};

(async () => {
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(root, 'assets', 'fonts', 'download', 'persian-fonts-ttf.zip')));
  const PdfFonts = {};
  new Function('PdfFonts', 'window', 'globalThis', fs.readFileSync(path.join(root, 'lib', 'pdf-base64-ttf-fonts', 'pdf-font-dejavu-sans.js'), 'utf8'))(PdfFonts, { PdfFonts }, { PdfFonts });
  const P = pairs(), T = texts(), rows = [];
  for (const [family, file] of FAMILIES) {
    const bytes = file === 'dejavu' ? new Uint8Array(Buffer.from(Object.values(PdfFonts)[0].styles.normal.data, 'base64'))
      : file === 'dejavu-serif' ? new Uint8Array(fs.readFileSync(path.join(root, 'assets', 'fonts', 'dejavu', 'DejaVuSerif.ttf'))) : await zip.files[file].async('uint8array');
    const map = cmap(bytes), sh = S.glyphs(bytes), others = faces.filter((f) => f.family !== family);
    const truth = {};
    Object.keys(map).forEach((c) => { const g = map[c]; if (!truth[g]) truth[g] = String.fromCodePoint(+c).normalize('NFKC'); });
    // the shuffle: every glyph that draws a letter takes another such glyph's shape (a fixed rotation by 7)
    const ids = Object.keys(sh).filter((g) => truth[g] && /\p{L}/u.test(truth[g])).sort((a, b) => a - b), shuffled = {};
    ids.forEach((g, i) => { shuffled[g] = sh[ids[(i + 7) % ids.length]]; });
    // bars: every glyph drawn as one to three bars from its id (tests/pdf-lab/scripts/make-unknown32.py's abstract
    // font, here in a body of 1000 and an advance of 600): shapes no font has
    const bars = {};
    Object.keys(sh).forEach((g) => {
      const h = Math.imul(+g, 2654435761) >>> 0, polys = [];
      for (let k = 0; k < 1 + h % 3; k++) {
        const bits = (h >>> (5 * k)) & 31, x0 = 600 * (0.1 + 0.25 * (bits % 3)), x1 = x0 + 118, y0 = 1000 * (-0.1 + 0.15 * (bits % 4)), y1 = y0 + 1000 * (0.2 + 0.1 * (bits % 5));
        polys.push([[x0, y0], [x0, y1], [x1, y1], [x1, y0]]);
      }
      bars[g] = S.fromPolygons(polys, 1000, 600);
    });
    ['arabic', 'latin'].forEach((sc) => {
      if (sc === 'arabic' ? family === 'DejaVu Sans' : !/Vazirmatn|Sahel|DejaVu/.test(family)) return;
      [30, 150, 600].forEach((len) => {
        // pieces of our text of about len letters, at most 12 a length
        const pieces = [];
        let cur = '';
        T[sc].forEach((p) => { p.split(' ').forEach((w) => { cur += (cur ? ' ' : '') + w; if ((cur.match(/\p{L}/gu) || []).length >= len) { pieces.push(cur); cur = ''; } }); });
        pieces.slice(0, 12).forEach((text) => {
          const d = draw(text, map);
          [['right', sh], ['shuffled', shuffled], ['bars', bars]].forEach(([kind, shapes]) => {
            const items = {};
            Object.keys(d.uses).forEach((g) => { if (shapes[g]) items[g] = { shape: shapes[g], uses: d.uses[g] }; });
            const r = S.read(items, d.words, others, P[sc], { script: sc, lambda: LAMBDA });
            rows.push(Object.assign({ family, sc, len, kind }, measures(r, truth, d.words)));
          });
        });
      });
    });
  }
  const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
  const f2 = (x) => (Math.round(x * 1000) / 1000).toFixed(3);
  const span = (a, k) => f2(Math.min(...a.map((r) => r[k]))) + '–' + f2(q(a.map((r) => r[k]), 0.5)) + '–' + f2(Math.max(...a.map((r) => r[k])));
  console.log('per script and length: min–median–max of each measure, for the right fonts, the shuffled and the bars');
  ['arabic', 'latin'].forEach((sc) => [30, 150, 600].forEach((len) => {
    const of = (kind) => rows.filter((r) => r.sc === sc && r.len === len && r.kind === kind), right = of('right');
    if (!right.length) return;
    const mean = (a, k) => a.reduce((s, r) => s + r[k], 0) / a.length;
    console.log(sc, len, 'n', right.length, '· right letters', (100 * mean(right, 'right')).toFixed(1) + ' %, the fewest', (100 * Math.min(...right.map((r) => r.right))).toFixed(1) + ' %');
    ['unseen', 'dist', 'moved'].forEach((k) => console.log('   ', k.padEnd(7), 'right', span(right, k), '| shuffled', span(of('shuffled'), k), '| bars', span(of('bars'), k)));
    if (ACCEPT) {
      const ok = (r) => r.unseen <= ACCEPT[sc][0] && r.dist <= ACCEPT[sc][1], rate = (a) => (100 * a.filter(ok).length / a.length).toFixed(0) + ' %';
      console.log('    accepted (unseen <= ' + ACCEPT[sc][0] + ', dist <= ' + ACCEPT[sc][1] + '): right', rate(right), '| shuffled', rate(of('shuffled')), '| bars', rate(of('bars')));
    }
  }));
})();
