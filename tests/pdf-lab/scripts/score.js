// Score an imported Markdown against its source: words (recall, order) and structure
// (headings with level, list items with ordered/task, tables cell-by-cell, code block lines, quotes).
const marked = require(require('./env.js').KELK + '/vendor/marked.umd.min_18.0.14.js');

// heh with hamza above has two encodings, ۀ (U+06C0) and ه + ٔ (U+0647 U+0654), drawn alike — the PDF names one
// (Chrome / HarfBuzz: the ligature's ۀ), the source may hold the other; neither is wrong. Folded before comparing.
const HEH_HAMZA = /\u0647\u0654/g;
function words(t) {
  return t.replace(HEH_HAMZA, '\u06C0').normalize('NFC').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\]\([^)]*\)/g, ' ')
    .replace(/[*_`#>|\\\[\]()~:\-–—.,;!?«»"'،؛؟]+/g, ' ').split(/\s+/).filter(Boolean);
}
const norm = (s) => String(s || '').replace(HEH_HAMZA, '\u06C0').replace(/<[^>]+>/g, '').replace(/[*_`\\]/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

function structure(md) {
  const s = { headings: [], items: [], tables: [], code: [], quotes: [], text: '' };
  const walk = (tokens, depth) => {
    tokens.forEach((t) => {
      if (t.type === 'heading') s.headings.push(t.depth + ':' + norm(t.text));
      else if (t.type === 'list') t.items.forEach((it) => {
        s.items.push((t.ordered ? 'o' : 'u') + (it.task ? (it.checked ? 'x' : 't') : '') + depth + ':' + norm(it.tokens.filter((x) => x.type === 'text' || x.type === 'paragraph').map((x) => x.text).join(' ')));
        walk(it.tokens.filter((x) => x.type === 'list'), depth + 1);
      });
      else if (t.type === 'table') s.tables.push([t.header.map((c) => norm(c.text))].concat(t.rows.map((r) => r.map((c) => norm(c.text)))));
      else if (t.type === 'code') s.code.push(t.text.replace(/\s+$/gm, '').trim());
      else if (t.type === 'blockquote') s.quotes.push(norm(t.text));
    });
  };
  walk(marked.lexer(md), 0);
  return s;
}

/** F1 of two multisets of strings */
function f1(a, b) {
  if (!a.length && !b.length) return undefined;
  const bag = new Map(); b.forEach((x) => bag.set(x, (bag.get(x) || 0) + 1));
  let hit = 0; a.forEach((x) => { const n = bag.get(x) || 0; if (n) { hit++; bag.set(x, n - 1); } });
  const p = b.length ? hit / b.length : 0, r = a.length ? hit / a.length : 0;
  return p + r ? 2 * p * r / (p + r) : 0;
}

function lcsRatio(src, got) {
  const n = src.length, m = got.length, band = Math.max(200, Math.abs(n - m) + 200);
  let prev = new Map(), lcs = 0;
  for (let i = 1; i <= n; i++) {
    const cur = new Map(), c = Math.round(i * m / Math.max(n, 1));
    for (let j = Math.max(1, c - band); j <= Math.min(m, c + band); j++) {
      const v = src[i - 1] === got[j - 1] ? (prev.get(j - 1) || 0) + 1 : Math.max(prev.get(j) || 0, cur.get(j - 1) || 0);
      cur.set(j, v); if (v > lcs) lcs = v;
    }
    prev = cur;
  }
  return n ? lcs / n : 1;
}

// Right-to-left details the word metrics blur (Persian, Arabic): of the source's words that carry a ZWNJ, a yeh
// or kaf (Persian ی ک or Arabic ي ك), or a digit (ASCII, Persian or Arabic-Indic), the share found exactly as
// written; and of its bracketed spans «(…)», the share found with their brackets the right way round. `rtl` is
// their mean, undefined for a document with no Arabic script. A column of its own, outside the total: the
// words already count these losses once; this column says which of them it was.
const AR_SCRIPT = /[\u0600-\u06FF]/;
function rtlScore(srcMd, gotMd) {
  if (!AR_SCRIPT.test(srcMd)) return {};
  const strip = (md) => md.replace(/^```[\s\S]*?^```/gm, ' ').replace(/\]\([^)]*\)/g, ']').replace(/https?:\/\/\S+/g, ' ');
  const sw = words(strip(srcMd)), gw = words(strip(gotMd));
  const bag = new Map(); gw.forEach((w) => bag.set(w, (bag.get(w) || 0) + 1));
  const recall = (re) => {
    const want = sw.filter((w) => re.test(w)); if (!want.length) return undefined;
    const b = new Map(bag); let hit = 0;
    want.forEach((w) => { const n = b.get(w) || 0; if (n) { hit++; b.set(w, n - 1); } });
    return hit / want.length;
  };
  const sq = (t) => t.replace(/\s+/g, ' ');
  const spans = (strip(srcMd).match(/\([^()\n]{1,40}\)/g) || []).map(sq), got = sq(strip(gotMd));
  const r = { zwnj: recall(/\u200C/), yehKaf: recall(/[یکيك]/), digits: recall(/[0-9\u06F0-\u06F9\u0660-\u0669]/),
              brackets: spans.length ? spans.filter((x) => got.indexOf(x) >= 0).length / spans.length : undefined };
  const v = Object.values(r).filter((x) => x !== undefined);
  r.rtl = v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
  return r;
}

function score(srcMd, gotMd, opts) {
  // fold: compare case-insensitively (the fuzz sets: a style may set headings in capitals)
  if (opts && opts.fold) { srcMd = srcMd.toLowerCase(); gotMd = gotMd.toLowerCase(); }
  const sw = words(srcMd.replace(/^```.*$/gm, '')), gw = words(gotMd.replace(/^```.*$/gm, ''));
  const bag = new Map(); gw.forEach((w) => bag.set(w, (bag.get(w) || 0) + 1));
  let hit = 0; sw.forEach((w) => { const n = bag.get(w) || 0; if (n) { hit++; bag.set(w, n - 1); } });
  const a = structure(srcMd), b = structure(gotMd);
  const cells = (ts) => ts.reduce((acc, t, ti) => acc.concat(t.reduce((x, row, ri) => x.concat(row.map((c, ci) => ri + '/' + ci + ':' + c)), [])), []);
  const r = {
    recall: sw.length ? hit / sw.length : 1, order: lcsRatio(sw, gw), extra: gw.length / Math.max(1, sw.length),
    headings: f1(a.headings, b.headings), lists: f1(a.items, b.items),
    tables: a.tables.length || b.tables.length ? f1(cells(a.tables), cells(b.tables)) * Math.min(1, a.tables.length ? Math.min(a.tables.length, b.tables.length) / Math.max(a.tables.length, b.tables.length) : 0) : undefined,
    code: f1(a.code.join('\n').split('\n'), b.code.join('\n').split('\n')),
    quotes: f1(a.quotes, b.quotes),
    nTables: [a.tables.length, b.tables.length]
  };
  const parts = ['recall', 'order', 'headings', 'lists', 'tables', 'code', 'quotes'].map((k) => r[k]).filter((x) => x !== undefined);
  r.total = parts.reduce((s, x) => s + x, 0) / parts.length;
  Object.assign(r, rtlScore(srcMd, gotMd));
  return r;
}
module.exports = { score, structure, words, rtlScore };
