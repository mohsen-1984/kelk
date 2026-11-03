// The structure diff of golden.js: the shape of a document, apart from its words — what score.js's F1s blur.
//   heading tree   the heading levels in document order          [1, 2, 2, 3, 2]
//   table shapes   rows × columns of each table, in order (the header row counted)   ['4x3', '2x2']
//   list nesting   the depth of each list item in document order (0 = top level)    [0, 0, 1, 1, 0]
// Each sequence of the golden is aligned with the importer's by the fewest edits (Levenshtein); an edit is
// missing (in the golden, not in the import), extra (the other way) or changed (a heading at another level, a
// table of another shape, an item at another depth). Pure functions: no browser, no files (tests/unit/structdiff.test.js).
const path = require('path');
// head's own marked, whatever KELK points at: the diff is a measuring tool, it does not change with the importer under test
const marked = require(path.join(__dirname, '..', '..', '..', 'vendor', 'marked.umd.min_18.0.14.js'));

/** The three sequences of a Markdown text. Headings, tables and lists inside quotes and list items count too. */
function shape(md) {
  const s = { headings: [], tables: [], lists: [] };
  const walk = (tokens, depth) => {
    (tokens || []).forEach((t) => {
      if (t.type === 'heading') s.headings.push(t.depth);
      else if (t.type === 'table') s.tables.push((1 + t.rows.length) + 'x' + t.header.length);
      else if (t.type === 'list') t.items.forEach((it) => { s.lists.push(depth); walk(it.tokens, depth + 1); });
      else if (t.type === 'blockquote') walk(t.tokens, depth);
    });
  };
  walk(marked.lexer(String(md || '')), 0);
  return s;
}

/** The fewest edits turning a into b: { same, missing (a only), extra (b only), changed (a substitution) }. */
function align(a, b) {
  const n = a.length, m = b.length;
  // d[i][j]: edits for a[0..i) → b[0..j); ties broken toward a substitution (one edit, not a missing and an extra)
  const d = Array.from({ length: n + 1 }, (_, i) => { const r = new Array(m + 1).fill(0); r[0] = i; return r; });
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++)
    d[i][j] = Math.min(d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), d[i - 1][j] + 1, d[i][j - 1] + 1);
  const r = { same: 0, missing: 0, extra: 0, changed: 0 };
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) { r[a[i - 1] === b[j - 1] ? 'same' : 'changed']++; i--; j--; }
    else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { r.missing++; i--; }
    else { r.extra++; j--; }
  }
  return r;
}

/** The structure diff of an import (got) against its golden (want), per part and in all (edits). */
function structDiff(want, got) {
  const a = shape(want), b = shape(got), out = { edits: 0 };
  ['headings', 'tables', 'lists'].forEach((k) => {
    const x = align(a[k], b[k]);
    out[k] = { want: a[k].length, got: b[k].length, missing: x.missing, extra: x.extra, changed: x.changed };
    out.edits += x.missing + x.extra + x.changed;
  });
  return out;
}

/** One part as a short cell: «12/13 −1 +2 ~0» (golden/import, missing, extra, changed); «-» when neither has any. */
function cell(p) {
  if (!p || (!p.want && !p.got)) return '-';
  return p.want + '/' + p.got + (p.missing ? ' −' + p.missing : '') + (p.extra ? ' +' + p.extra : '') + (p.changed ? ' ~' + p.changed : '');
}

module.exports = { shape, align, structDiff, cell };
