/**
 * DOCX validation (plan P2.3): every case of tests/test-corpus.js (and the three about/guide documents) through
 * DocxBuilder in headless Chromium, then, per .docx:
 *
 *   1. package   JSZip opens it; every part has a content type ([Content_Types].xml); every internal relationship
 *                target exists; every XML part is well-formed.
 *   2. schema    every XML part (but docProps/core.xml, see below) against the ECMA-376 Transitional schemas in
 *                tests/ooxml-xsd/ (`xmllint --schema tests/ooxml-xsd/ooxml.xsd`). Markup Compatibility is applied
 *                first, as Word does: elements and attributes of the namespaces listed in mc:Ignorable (w14, w15,
 *                wp14 — Office extensions the 2016 schemas do not define) are removed, mc:AlternateContent is
 *                replaced by its mc:Fallback. Each error is either allowed (ALLOW below, with its reason) or fails.
 *   3. office    LibreOffice headless opens each file and converts it: `soffice --headless --convert-to pdf`
 *                → a non-empty PDF per .docx.
 *
 *   node tests/docx-validate.js [--cases a,b] [--keep DIR] [--no-xmllint] [--no-soffice]
 *     --keep DIR      write the .docx files and the processed XML parts there (default: a temp folder, removed)
 *     --no-xmllint    skip step 2 (a machine without xmllint); --no-soffice: skip step 3 (without LibreOffice).
 *                     Without these flags a missing tool fails the run: CI never skips silently.
 *   Env: XMLLINT (default `xmllint`), SOFFICE (default `soffice`).
 * Exit 1 on any unexpected error, a missing tool, or a case whose .docx could not be built.
 *
 * docProps/core.xml is not schema-checked: its schema (opc-coreProperties.xsd) imports the Dublin Core schemas
 * from dublincore.org, which are not bundled; it is still checked for well-formedness.
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const JSZip = require('jszip');
const { JSDOM } = require('jsdom');
const { ROOT, openSuite, buildCase } = require('./golden/build.js');

const XSD = path.join(ROOT, 'tests', 'ooxml-xsd', 'ooxml.xsd');
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';

/**
 * Schema errors that are known and accepted: { re (matched against "part: message"), reason }. A new kind of error
 * fails the run; an entry that no longer matches anything is reported (remove it).
 */
const ALLOW = [];

function args() {
  const a = process.argv.slice(2), o = { cases: null, keep: null, xmllint: true, soffice: true };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--cases') o.cases = a[++i].split(',');
    else if (a[i] === '--keep') o.keep = path.resolve(a[++i]);
    else if (a[i] === '--no-xmllint') o.xmllint = false;
    else if (a[i] === '--no-soffice') o.soffice = false;
    else throw new Error('unknown argument ' + a[i]);
  }
  return o;
}

/** a command line for spawnSync: on Windows a .cmd shim needs the shell, so quote the arguments there */
function run(cmd, argv, opts) {
  const win = process.platform === 'win32';
  const q = (s) => (/[\s"&|<>^]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
  return win
    ? spawnSync([cmd].concat(argv).map(q).join(' '), Object.assign({ shell: true, encoding: 'utf8', maxBuffer: 1 << 28 }, opts))
    : spawnSync(cmd, argv, Object.assign({ encoding: 'utf8', maxBuffer: 1 << 28 }, opts));
}

function toolMissing(cmd, versionArg) {
  const r = run(cmd, [versionArg]);
  return r.error || r.status === null || (r.status !== 0 && !/\d/.test((r.stdout || '') + (r.stderr || '')));
}

const dom = new JSDOM('');
const { DOMParser, XMLSerializer } = dom.window;

/** Markup Compatibility (ECMA-376 Part 3): ignorable namespaces out, AlternateContent → its Fallback */
function applyMce(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return { error: doc.getElementsByTagName('parsererror')[0].textContent.slice(0, 200) };
  const root = doc.documentElement;
  const ignorable = new Set();
  const walkAll = (el, fn) => {
    fn(el);
    Array.from(el.children).forEach((c) => walkAll(c, fn));
  };
  walkAll(root, (el) => {
    const v = el.getAttributeNS(MC, 'Ignorable');
    if (v) v.split(/\s+/).filter(Boolean).forEach((p) => ignorable.add(el.lookupNamespaceURI(p)));
  });
  Array.from(doc.getElementsByTagNameNS(MC, 'AlternateContent')).forEach((ac) => {
    const fb = Array.from(ac.children).find((c) => c.namespaceURI === MC && c.localName === 'Fallback');
    if (fb) while (fb.firstChild) ac.parentNode.insertBefore(fb.firstChild, ac);
    ac.remove();
  });
  const strip = (el) => {
    if (ignorable.has(el.namespaceURI)) {
      el.remove();
      return;
    }
    Array.from(el.attributes).forEach((a) => {
      if (a.namespaceURI === MC || (a.namespaceURI && ignorable.has(a.namespaceURI))) el.removeAttributeNode(a);
    });
    Array.from(el.children).forEach(strip);
  };
  strip(root);
  return { xml: new XMLSerializer().serializeToString(doc) };
}

/** package checks: content types, relationship targets, well-formed XML; the XML parts to validate */
async function unpack(buf, dir) {
  const zip = await JSZip.loadAsync(buf);
  const errors = [], parts = [];
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  const ctXml = names.includes('[Content_Types].xml') ? await zip.file('[Content_Types].xml').async('string') : '';
  if (!ctXml) errors.push('[Content_Types].xml missing');
  const ct = new DOMParser().parseFromString(ctXml || '<x/>', 'application/xml');
  const defaults = new Set(Array.from(ct.getElementsByTagName('Default')).map((d) => d.getAttribute('Extension').toLowerCase()));
  const overrides = new Set(Array.from(ct.getElementsByTagName('Override')).map((d) => d.getAttribute('PartName')));
  for (const n of names) {
    if (n === '[Content_Types].xml') continue;
    const ext = n.split('.').pop().toLowerCase();
    if (!overrides.has('/' + n) && !defaults.has(ext)) errors.push(n + ': no content type');
  }
  for (const n of names.filter((x) => /\.rels$/.test(x))) {
    const rels = new DOMParser().parseFromString(await zip.file(n).async('string'), 'application/xml');
    const base = path.posix.dirname(path.posix.dirname(n)); // word/_rels/document.xml.rels → word
    Array.from(rels.getElementsByTagName('Relationship')).forEach((r) => {
      if (r.getAttribute('TargetMode') === 'External') return;
      const t = r.getAttribute('Target');
      const target = t.startsWith('/') ? t.slice(1) : path.posix.normalize(path.posix.join(base === '.' ? '' : base, t));
      if (!zip.files[target]) errors.push(n + ': relationship ' + r.getAttribute('Id') + ' → missing part ' + target);
    });
  }
  for (const n of names.filter((x) => /\.(xml|rels)$/.test(x))) {
    const r = applyMce(await zip.file(n).async('string'));
    if (r.error) {
      errors.push(n + ': not well-formed: ' + r.error);
      continue;
    }
    if (n === 'docProps/core.xml') continue;
    const f = path.join(dir, n.replace(/[[\]]/g, '_'));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, r.xml);
    parts.push({ name: n, file: f });
  }
  return { errors, parts };
}

/** xmllint over many files at once → errors by file ("Schemas validity error" lines) */
function xmllint(files) {
  const bin = process.env.XMLLINT || 'xmllint';
  const byFile = new Map(files.map((f) => [f, []]));
  const failed = new Set();
  // chunks: one schema load per chunk; cmd.exe takes 8191 characters per command line
  const limit = process.platform === 'win32' ? 6000 : 100000, chunks = [];
  files.forEach((f) => {
    const last = chunks[chunks.length - 1];
    if (last && last.len + f.length + 3 < limit) {
      last.files.push(f);
      last.len += f.length + 3;
    } else chunks.push({ files: [f], len: f.length });
  });
  for (const { files: chunk } of chunks) {
    const r = run(bin, ['--noout', '--nonet', '--schema', XSD].concat(chunk));
    if (r.error) throw r.error;
    const out = (r.stderr || '') + (r.stdout || '');
    if (/failed to compile|WXS schema .* failed to compile|Schemas parser error/i.test(out)) throw new Error('the schema did not compile:\n' + out.slice(0, 2000));
    out.split(/\r?\n/).forEach((line) => {
      const m = /^(.*?):(\d+): (?:element \S+|parser error|namespace error)\s*: (?:Schemas validity error : )?(.*)$/.exec(line);
      if (m && byFile.has(path.resolve(m[1]))) byFile.get(path.resolve(m[1])).push(m[3].trim());
      else if (m && byFile.has(m[1])) byFile.get(m[1]).push(m[3].trim());
      const f = /^(.*) fails to validate$/.exec(line);
      if (f) failed.add(path.resolve(f[1]));
    });
    if (r.status !== 0 && r.status !== 3 && !failed.size) throw new Error('xmllint exited ' + r.status + ':\n' + out.slice(0, 2000));
  }
  // a file that "fails to validate" with no parsed message still fails
  failed.forEach((f) => {
    if (byFile.has(f) && !byFile.get(f).length) byFile.get(f).push('fails to validate (no message parsed)');
  });
  return byFile;
}

/** LibreOffice: every .docx → a PDF with content (one soffice run for all files) */
function soffice(docxFiles, outDir) {
  const bin = process.env.SOFFICE || 'soffice';
  fs.mkdirSync(outDir, { recursive: true });
  const profile = path.join(outDir, '.lo-profile');
  const r = run(bin, ['-env:UserInstallation=' + require('node:url').pathToFileURL(profile).href, '--headless', '--norestore',
    '--convert-to', 'pdf', '--outdir', outDir].concat(docxFiles), { timeout: 900000 });
  if (r.error) throw r.error;
  return docxFiles.map((f) => {
    const pdf = path.join(outDir, path.basename(f).replace(/\.docx$/, '.pdf'));
    const size = fs.existsSync(pdf) ? fs.statSync(pdf).size : 0;
    const head = size ? fs.readFileSync(pdf).subarray(0, 5).toString('latin1') : '';
    return { file: f, pdf, size, ok: size > 1000 && head === '%PDF-' };
  });
}

(async () => {
  const o = args();
  const work = o.keep || fs.mkdtempSync(path.join(os.tmpdir(), 'kelk-docx-validate-'));
  fs.mkdirSync(work, { recursive: true });
  let fail = 0;
  if (o.xmllint && toolMissing(process.env.XMLLINT || 'xmllint', '--version')) {
    console.log('FAIL  xmllint not found (apt libxml2-utils; or XMLLINT=…; or --no-xmllint)');
    process.exitCode = 1;
    return;
  }
  if (o.soffice && toolMissing(process.env.SOFFICE || 'soffice', '--version')) {
    console.log('FAIL  soffice not found (apt libreoffice-writer-nogui; or SOFFICE=…; or --no-soffice)');
    process.exitCode = 1;
    return;
  }

  // 1. build every .docx, package checks
  const suite = await openSuite();
  const names = o.cases || suite.names;
  const cases = [];
  for (const name of names) {
    const out = await buildCase(suite.page, name, ['docx']);
    if (typeof out.docx !== 'string') {
      console.log('FAIL  ' + name + ': no .docx: ' + (out.docx && out.docx.error));
      fail++;
      continue;
    }
    const buf = Buffer.from(out.docx, 'base64');
    const file = path.join(work, 'docx', name + '.docx');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buf);
    const u = await unpack(buf, path.join(work, 'parts', name));
    u.errors.forEach((e) => console.log('FAIL  ' + name + ': ' + e));
    fail += u.errors.length;
    cases.push({ name, file, parts: u.parts });
  }
  if (suite.errors.length) {
    suite.errors.forEach((e) => console.log('FAIL  page error: ' + e));
    fail += suite.errors.length;
  }
  await suite.close();
  const nParts = cases.reduce((s, c) => s + c.parts.length, 0);
  console.log('built ' + cases.length + ' / ' + names.length + ' .docx files, ' + nParts + ' XML parts');

  // 2. schema
  if (o.xmllint) {
    const byFile = xmllint(cases.flatMap((c) => c.parts.map((p) => p.file)));
    const allowed = new Map(ALLOW.map((a) => [a, 0]));
    const kinds = new Map(); // unexpected errors grouped by message (element, count)
    let bad = 0, okParts = 0;
    cases.forEach((c) => c.parts.forEach((p) => {
      const errs = byFile.get(p.file) || [];
      if (!errs.length) okParts++;
      errs.forEach((e) => {
        const line = p.name + ': ' + e;
        const a = ALLOW.find((x) => x.re.test(line));
        if (a) {
          allowed.set(a, allowed.get(a) + 1);
          return;
        }
        bad++;
        const k = p.name.replace(/\d+(?=\.xml$)/, 'N') + ': ' + e;
        if (!kinds.has(k)) kinds.set(k, { n: 0, cases: new Set() });
        kinds.get(k).n++;
        kinds.get(k).cases.add(c.name);
      });
    }));
    kinds.forEach((v, k) => console.log('FAIL  schema ×' + v.n + ' (' + v.cases.size + ' cases, e.g. ' + [...v.cases].slice(0, 3).join(', ') + '): ' + k));
    allowed.forEach((n, a) => console.log(n ? 'allowed ×' + n + ': ' + a.re + ' — ' + a.reason : 'stale allow-list entry (matches nothing, remove it): ' + a.re));
    console.log('schema: ' + okParts + ' / ' + nParts + ' parts valid, ' + bad + ' unexpected errors');
    fail += bad;
  } else console.log('schema: skipped (--no-xmllint)');

  // 3. LibreOffice
  if (o.soffice) {
    const res = soffice(cases.map((c) => c.file), path.join(work, 'pdf'));
    res.filter((r) => !r.ok).forEach((r) => console.log('FAIL  LibreOffice: ' + path.basename(r.file) + ' → ' + (r.size ? r.size + ' bytes, not a PDF' : 'no PDF')));
    const okN = res.filter((r) => r.ok).length;
    console.log('LibreOffice: ' + okN + ' / ' + res.length + ' converted to a non-empty PDF');
    fail += res.length - okN;
  } else console.log('LibreOffice: skipped (--no-soffice)');

  if (!o.keep) fs.rmSync(work, { recursive: true, force: true });
  console.log(fail ? 'docx-validate: FAILED (' + fail + ')' : 'docx-validate: ok');
  if (fail) process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
