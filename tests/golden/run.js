/**
 * Golden snapshots of the builders (plan P2.3): every case of tests/test-corpus.js (not the about/guide
 * documents: see below), built in headless Chromium (tests/golden/build.js), normalised
 * (tests/golden/normalize.js) and compared with tests/golden/expected/<case>/:
 *
 *   export.html   HtmlBuilder.toHtml()                       — the HTML export
 *   docx.xml      DocxBuilder: the .docx's XML parts         — word/document.xml, styles, numbering, headers …
 *   doc.mhtml.txt WordHtmlBuilder.toMhtml(): the .doc parts — the Word HTML, header/footer part, file list
 *   pdf.md        PdfBuilder → PdfImporter (layout only)     — the PDF read back as Markdown
 *   docx.md       DocxBuilder → MarkdownImporter.fromDocx    — the .docx read back as Markdown
 *
 * Large boilerplate sections (the .docx's styles / settings / numbering / notes, the CSS head of the .html and
 * .doc) are stored once in expected/_shared/<hash>.txt and referenced from the case's file; a difference is always
 * shown on the expanded text. What is normalised away (and why): tests/golden/normalize.js.
 *
 *   node tests/golden/run.js             compare; a difference prints a unified diff and exits 1
 *   node tests/golden/run.js --update    rewrite the snapshots (then review `git diff tests/golden`): every case is
 *                                        built first and nothing is written unless all built; stray files in a
 *                                        case's folder, unused shared sections and folders of removed cases go
 *   options: --cases a,b (only these; with --update only these are rewritten)
 *            --out DIR   also write every actual snapshot there (CI uploads it; default: none)
 * Exit 1 on a difference, a builder that throws, a case without a snapshot, a snapshot without a case, a stray
 * file in a snapshot folder, or a shared section whose content does not match its name.
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { openSuite, buildCase } = require('./build.js');
const norm = require('./normalize.js');

const EXPECTED = path.join(__dirname, 'expected');
const KINDS = ['html', 'docx', 'doc', 'pdf', 'docx-md'];
const FILES = { html: 'export.html', docx: 'docx.xml', doc: 'doc.mhtml.txt', pdfMd: 'pdf.md', docxMd: 'docx.md' };
const MAX_DIFF_LINES = 80; // per file

function args() {
  const a = process.argv.slice(2), o = { update: false, cases: null, out: null };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--update') o.update = true;
    else if (a[i] === '--cases') o.cases = a[++i].split(',');
    else if (a[i] === '--out') o.out = path.resolve(a[++i]);
    else throw new Error('unknown argument ' + a[i]);
  }
  return o;
}

/** a file-system-safe folder name for a case (names are already [a-z0-9.-]) */
const dirOf = (name) => path.join(EXPECTED, name.replace(/[^\w.-]+/g, '_'));

/**
 * Shared sections: the boilerplate that is the same in many cases (the .docx's styles, settings, notes and font
 * table; the CSS head of the HTML export and of the .doc) is stored once, in expected/_shared/<sha256-12>.txt, and
 * the case's file holds a reference line instead. A change shows as a diff of the expanded text.
 */
const SHARED_DIR = path.join(EXPECTED, '_shared');
const SHARED = /^<!-- ===== (?:.*head|word\/(?:styles|settings|fontTable|footnotes|endnotes|comments|webSettings|numbering)\.xml) ===== -->$/;
const REF = /^<!-- shared: _shared\/([0-9a-f]{12})\.txt -->$/gm;

/** a shared section's name: the first 12 hex digits of its SHA-256 (checked in compare mode) */
const hash = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);

/** text → { compact (sections replaced by references), blobs: Map hash → section text } */
function share(text) {
  const parts = text.split(/^(<!-- ===== .+ ===== -->\n)/m), blobs = new Map();
  for (let i = 1; i < parts.length; i += 2) {
    const body = parts[i + 1] || '';
    if (!SHARED.test(parts[i].trim()) || body.length < 1000) continue;
    const h = hash(body);
    blobs.set(h, body);
    parts[i + 1] = '<!-- shared: _shared/' + h + '.txt -->\n';
  }
  return { compact: parts.join(''), blobs };
}

/** references → the shared texts (from blobs, else expected/_shared/) */
function expand(compact, blobs) {
  return compact.replace(REF, (m, h) => {
    if (blobs && blobs.has(h)) return blobs.get(h).replace(/\n$/, '');
    const f = path.join(SHARED_DIR, h + '.txt');
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '') : m + ' (MISSING)';
  });
}

/**
 * Unified diff of two texts (3 lines of context). The common head and tail are trimmed first; the middle is an
 * LCS when small enough, else shown as removed + added.
 */
function unifiedDiff(a, b, label) {
  const A = a.split('\n'), B = b.split('\n');
  let s = 0;
  while (s < A.length && s < B.length && A[s] === B[s]) s++;
  let ea = A.length, eb = B.length;
  while (ea > s && eb > s && A[ea - 1] === B[eb - 1]) { ea--; eb--; }
  const x = A.slice(s, ea), y = B.slice(s, eb);
  let ops = [];
  if (x.length * y.length <= 4e6) {
    const n = x.length, m = y.length, L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && x[i] === y[j]) { ops.push([' ', x[i]]); i++; j++; }
      else if (i < n && (j === m || L[i + 1][j] >= L[i][j + 1])) { ops.push(['-', x[i]]); i++; }
      else { ops.push(['+', y[j]]); j++; }
    }
  } else ops = x.map((l) => ['-', l]).concat(y.map((l) => ['+', l]));
  const ctxA = A.slice(Math.max(0, s - 3), s).map((l) => [' ', l]), ctxB = A.slice(ea, ea + 3).map((l) => [' ', l]);
  const all = ctxA.concat(ops, ctxB);
  const lines = ['--- expected/' + label, '+++ actual/' + label, '@@ -' + (Math.max(0, s - 3) + 1) + ' +' + (Math.max(0, s - 3) + 1) + ' @@'];
  // collapse long unchanged runs inside the middle
  let run = [];
  const flush = () => {
    if (run.length > 7) lines.push(...run.slice(0, 3), ' …', ...run.slice(-3));
    else lines.push(...run);
    run = [];
  };
  all.forEach(([op, l]) => {
    if (op === ' ') run.push(' ' + l);
    else { flush(); lines.push(op + l); }
  });
  flush();
  const cut = lines.length > MAX_DIFF_LINES ? lines.slice(0, MAX_DIFF_LINES).concat('… ' + (lines.length - MAX_DIFF_LINES) + ' more diff lines') : lines;
  return cut.join('\n');
}

const readText = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

(async () => {
  const o = args();
  const suite = await openSuite();
  // the about/guide documents (docs/about-kelk-and-samples.*.md) are the app's content, edited for their own sake:
  // a snapshot of them would fail on every wording change. They stay in the builder suite and docx-validate.js.
  const cases = suite.names.filter((n) => !/^about-kelk-and-samples\./.test(n));
  const names = o.cases || cases;
  const unknown = names.filter((n) => !cases.includes(n));
  if (unknown.length) throw new Error('no such case: ' + unknown.join(', '));
  let fail = 0, same = 0, written = 0;
  const t0 = Date.now(), used = new Map(); // shared sections of this run: hash → text

  // 1. build and normalise every case first: --update writes nothing unless all of them built
  const built = [];
  for (const name of names) {
    const out = await buildCase(suite.page, name, KINDS);
    const ctx = { inputs: norm.inputPictures(out.source) };
    const snap = {};
    for (const key of Object.keys(FILES)) {
      const v = out[key];
      if (typeof v !== 'string') {
        console.log('FAIL  ' + name + ' ' + FILES[key] + ': ' + (v && v.error ? v.error.split('\n')[0] : 'not built'));
        fail++;
        continue;
      }
      snap[key] = key === 'html' ? norm.html(v, ctx)
        : key === 'docx' ? await norm.docx(Buffer.from(v, 'base64'), ctx)
        : key === 'doc' ? norm.mhtml(v, ctx)
        : norm.markdown(v, ctx);
    }
    const dir = dirOf(name);
    if (o.out) {
      fs.mkdirSync(path.join(o.out, path.basename(dir)), { recursive: true });
      Object.keys(snap).forEach((k) => fs.writeFileSync(path.join(o.out, path.basename(dir), FILES[k]), snap[k]));
    }
    const files = {};
    for (const k of Object.keys(snap)) {
      const { compact, blobs } = share(snap[k]);
      blobs.forEach((v, h) => used.set(h, v));
      files[k] = { compact, blobs };
    }
    built.push({ name, dir, files });
  }
  if (suite.errors.length) {
    suite.errors.forEach((e) => console.log('FAIL  page error: ' + e));
    fail += suite.errors.length;
  }
  await suite.close();
  const known = new Set(Object.values(FILES));
  const strays = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !known.has(f)) : []);

  if (o.update) {
    // 2a. all or nothing
    if (fail) {
      console.log('golden: ' + fail + ' FAILED — nothing written (--update writes only when every case builds)');
      process.exitCode = 1;
      return;
    }
    fs.mkdirSync(SHARED_DIR, { recursive: true });
    used.forEach((v, h) => {
      const f = path.join(SHARED_DIR, h + '.txt');
      if (!fs.existsSync(f) || readText(f) !== v) { fs.writeFileSync(f, v); written++; } // new, or damaged
    });
    for (const { dir, files } of built) {
      fs.mkdirSync(dir, { recursive: true });
      for (const k of Object.keys(files)) {
        const f = path.join(dir, FILES[k]);
        if (!fs.existsSync(f) || readText(f) !== files[k].compact) { fs.writeFileSync(f, files[k].compact); written++; }
      }
      strays(dir).forEach((f) => {
        fs.rmSync(path.join(dir, f), { recursive: true, force: true });
        written++;
        console.log('removed tests/golden/expected/' + path.basename(dir) + '/' + f);
      });
    }
    if (!o.cases) {
      // shared sections no case refers to any more; folders of cases that no longer exist
      fs.readdirSync(SHARED_DIR).filter((f) => !used.has(f.replace(/\.txt$/, ''))).forEach((f) => { fs.rmSync(path.join(SHARED_DIR, f)); written++; });
      const want = new Set(names.map((n) => path.basename(dirOf(n))).concat('_shared'));
      fs.readdirSync(EXPECTED).filter((d) => !want.has(d)).forEach((d) => {
        fs.rmSync(path.join(EXPECTED, d), { recursive: true, force: true });
        written++;
        console.log('removed tests/golden/expected/' + d);
      });
    }
    console.log('golden: ' + names.length + ' cases, ' + written + ' files written (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
    console.log('golden: ok');
    return;
  }

  // 2b. compare. Every shared file must hold what its name says (its SHA-256), so a reference cannot point at
  // changed text; a stray or stale file anywhere under expected/ fails too.
  if (fs.existsSync(SHARED_DIR)) {
    fs.readdirSync(SHARED_DIR).forEach((f) => {
      const m = /^([0-9a-f]{12})\.txt$/.exec(f);
      const where = 'tests/golden/expected/_shared/' + f;
      if (!m) { console.log('FAIL  ' + where + ': not a shared section (stray file)'); fail++; }
      else if (hash(readText(path.join(SHARED_DIR, f))) !== m[1]) { console.log('FAIL  ' + where + ': its content does not match its name (damaged; --update rewrites it)'); fail++; }
      else if (!o.cases && !used.has(m[1])) { console.log('FAIL  ' + where + ': no snapshot refers to it (stale; --update removes it)'); fail++; }
    });
  }
  for (const { name, dir, files } of built) {
    strays(dir).forEach((f) => { console.log('FAIL  ' + name + ': stray file ' + f + ' in its snapshot folder (--update removes it)'); fail++; });
    for (const k of Object.keys(files)) {
      const { compact, blobs } = files[k];
      const f = path.join(dir, FILES[k]);
      if (!fs.existsSync(f)) {
        console.log('FAIL  ' + name + ' ' + FILES[k] + ': no snapshot (a new case? run with --update and review)');
        fail++;
        continue;
      }
      const want = readText(f);
      const missing = [...want.matchAll(REF)].map((m) => m[1]).filter((h) => !fs.existsSync(path.join(SHARED_DIR, h + '.txt')));
      if (want === compact && !missing.length) { same++; continue; }
      console.log('FAIL  ' + name + ' ' + FILES[k] + ' differs from tests/golden/expected:' + (missing.length ? ' (missing _shared/' + missing.join(', ') + ')' : ''));
      console.log(unifiedDiff(expand(want), expand(compact, blobs), path.basename(dir) + '/' + FILES[k]));
      fail++;
    }
  }
  if (!o.cases && fs.existsSync(EXPECTED)) {
    const want = new Set(names.map((n) => path.basename(dirOf(n))).concat('_shared'));
    fs.readdirSync(EXPECTED).filter((d) => !want.has(d)).forEach((d) => { console.log('FAIL  tests/golden/expected/' + d + ': no such case (removed? run with --update)'); fail++; });
  }
  console.log('golden: ' + names.length + ' cases, ' + same + ' snapshots equal, ' + fail + ' failed (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
  console.log(fail ? 'golden: FAILED' : 'golden: ok');
  if (fail) process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

