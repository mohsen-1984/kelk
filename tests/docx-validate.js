/**
 * DOCX validation (plan P2.3): every case of tests/test-corpus.js (and the three about/guide documents) through
 * DocxBuilder in headless Chromium, then, per .docx:
 *
 *   1. package   JSZip opens it; every part has a content type ([Content_Types].xml) and, for the parts Kelk
 *                writes, the right one (CONTENT_TYPES); every internal relationship target exists; every XML part
 *                is well-formed; every picture (word/media/*) is what its type says (pictureProblem: a PNG with its
 *                signature, a non-zero IHDR and IEND; a whole JPEG; a GIF / BMP signature; an SVG that parses).
 *   2. schema    every XML part (but docProps/core.xml, see below) against the ECMA-376 Transitional schemas in
 *                tests/ooxml-xsd/ (`xmllint --schema tests/ooxml-xsd/ooxml.xsd`). Markup Compatibility is applied
 *                first, as Word does (applyMce: namespaces in mc:Ignorable removed — w14, w15, wp14, Office
 *                extensions the 2016 schemas do not define — mc:AlternateContent → its mc:Fallback); the w15
 *                attributes docx.js writes are checked before they go, anything else removed is listed. Every
 *                part needs xmllint's own verdict line. Each error is either allowed (ALLOW below) or fails.
 *   3. office    LibreOffice headless opens each file and converts it, one soffice process per file:
 *                `soffice --headless --convert-to pdf` → exit 0 and a new PDF of more than 1 KB.
 *
 *   node tests/docx-validate.js [--cases a,b] [--keep DIR] [--no-xmllint] [--no-soffice]
 *     --keep DIR      write the .docx files, the processed XML parts and the PDFs there (default: a temp folder,
 *                     removed); what an earlier run left in DIR is deleted first
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

/**
 * Files LibreOffice is known to fail on although they are schema-valid: { file, reason }. Matched by name, and only for
 * a crash or abort (exit 134 / a signal) — any other failure, or a crash on another file, fails the run; a listed file
 * that converts is reported (remove the entry).
 */
const SOFFICE_KNOWN = [
  // CI 1405-08-11 (runs 41519377664, 41519387343): LibreOffice 24.2.7 (noble) headless aborts (exit 134, SIGABRT,
  // "SfxBaseModel::impl_store … failed: 0xc10 (Io / Write)") while writing the PDF of the two documents with a Word
  // ToC field, on the first try and the retry; both pass the OOXML schemas, and LibreOffice 24.2.7.2 on Windows
  // converts them. Not a DocxBuilder fault as far as can be seen; checked again when the LibreOffice pin moves.
  { file: 'toc-ltr.docx', reason: 'LibreOffice 24.2.7 (Linux) aborts on the ToC field' },
  { file: 'toc-rtl.docx', reason: 'LibreOffice 24.2.7 (Linux) aborts on the ToC field' }
];

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

/**
 * Office-extension attributes docx.js writes, checked here before Markup Compatibility strips them (the 2016
 * schemas do not define them; Word 2013+, which understands w15, would reject a wrong value). Every other
 * element or attribute of an ignorable namespace is stripped and listed in the run's summary ("stripped: …"),
 * so a new one shows up; today docx.js writes only these two (w14 / wp14 are declared, nothing of them is used).
 */
const W15 = 'http://schemas.microsoft.com/office/word/2012/wordml';
const ON_OFF = /^(true|false|on|off|0|1)$/;
const CHECKED = new Map([[W15 + ' restartNumberingAfterBreak', ON_OFF], [W15 + ' tentative', ON_OFF]]);

/**
 * Markup Compatibility (ECMA-376 Part 3), as Word applies it: namespaces in mc:Ignorable out, mc:AlternateContent
 * → its mc:Fallback. Errors: an mc:Ignorable prefix that is not declared (Word refuses the file), any
 * mc:MustUnderstand / mc:ProcessContent / mc:PreserveElements / mc:PreserveAttributes (this check understands no
 * extension namespace, so it cannot honour them), a checked w15 attribute with a wrong value.
 * @returns {{ xml, errors: string[], stripped: Map<string, number> } | { error }}
 */
function applyMce(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return { error: doc.getElementsByTagName('parsererror')[0].textContent.slice(0, 200) };
  const root = doc.documentElement;
  const ignorable = new Set(), errors = [], stripped = new Map();
  const count = (k) => stripped.set(k, (stripped.get(k) || 0) + 1);
  const walkAll = (el, fn) => {
    fn(el);
    Array.from(el.children).forEach((c) => walkAll(c, fn));
  };
  walkAll(root, (el) => {
    const v = el.getAttributeNS(MC, 'Ignorable');
    if (v) {
      v.split(/\s+/).filter(Boolean).forEach((p) => {
        const ns = el.lookupNamespaceURI(p);
        if (ns) ignorable.add(ns);
        else errors.push('mc:Ignorable names the undeclared prefix "' + p + '" on <' + el.tagName + '>');
      });
    }
    ['MustUnderstand', 'ProcessContent', 'PreserveElements', 'PreserveAttributes'].forEach((a) => {
      if (el.hasAttributeNS(MC, a)) errors.push('mc:' + a + '="' + el.getAttributeNS(MC, a) + '" on <' + el.tagName + '> (not supported by this check)');
    });
  });
  Array.from(doc.getElementsByTagNameNS(MC, 'AlternateContent')).forEach((ac) => {
    const fb = Array.from(ac.children).find((c) => c.namespaceURI === MC && c.localName === 'Fallback');
    if (fb) while (fb.firstChild) ac.parentNode.insertBefore(fb.firstChild, ac);
    ac.remove();
  });
  const strip = (el) => {
    if (ignorable.has(el.namespaceURI)) {
      count('<' + el.tagName + '>');
      el.remove();
      return;
    }
    Array.from(el.attributes).forEach((a) => {
      if (a.namespaceURI === MC) el.removeAttributeNode(a);
      else if (a.namespaceURI && ignorable.has(a.namespaceURI)) {
        const re = CHECKED.get(a.namespaceURI + ' ' + a.localName);
        if (re && !re.test(a.value)) errors.push(a.name + '="' + a.value + '" on <' + el.tagName + '>: not a valid value');
        if (!re) count(a.name);
        el.removeAttributeNode(a);
      }
    });
    Array.from(el.children).forEach(strip);
  };
  strip(root);
  return { xml: new XMLSerializer().serializeToString(doc), errors, stripped };
}

/** the content type each kind of part must have (ECMA-376 Part 1 §11, §15; Part 2) */
const WML = 'application/vnd.openxmlformats-officedocument.wordprocessingml.';
const CONTENT_TYPES = [
  [/^word\/document\.xml$/, WML + 'document.main+xml'],
  [/^word\/(styles|numbering|settings|fontTable|footnotes|endnotes|comments|webSettings)\.xml$/, (m) => WML + m[1] + '+xml'],
  [/^word\/(header|footer)\d*\.xml$/, (m) => WML + m[1] + '+xml'],
  [/^docProps\/core\.xml$/, 'application/vnd.openxmlformats-package.core-properties+xml'],
  [/^docProps\/app\.xml$/, 'application/vnd.openxmlformats-officedocument.extended-properties+xml'],
  [/^docProps\/custom\.xml$/, 'application/vnd.openxmlformats-officedocument.custom-properties+xml'],
  [/\.rels$/, 'application/vnd.openxmlformats-package.relationships+xml'],
  [/\.png$/i, 'image/png'], [/\.jpe?g$/i, 'image/jpeg'], [/\.gif$/i, 'image/gif'], [/\.bmp$/i, 'image/bmp'], [/\.svg$/i, 'image/svg+xml']
];

/**
 * A picture part is what its content type says: a PNG with its signature and an IHDR of a non-zero size, a JPEG
 * from SOI to EOI, a GIF / BMP signature, an SVG that parses with an <svg> root. '' when it is, else the problem.
 */
function pictureProblem(bytes, type) {
  const b = Buffer.from(bytes);
  if (type === 'image/png') {
    if (b.length < 33 || b.toString('hex', 0, 8) !== '89504e470d0a1a0a' || b.toString('latin1', 12, 16) !== 'IHDR') return 'not a PNG';
    if (!b.readUInt32BE(16) || !b.readUInt32BE(20)) return 'PNG of size 0';
    if (b.toString('latin1', b.length - 8, b.length - 4) !== 'IEND') return 'PNG without its IEND chunk (cut short)';
    return '';
  }
  if (type === 'image/jpeg') return b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9 ? '' : 'not a whole JPEG';
  if (type === 'image/gif') return /^GIF8[79]a$/.test(b.toString('latin1', 0, 6)) ? '' : 'not a GIF';
  if (type === 'image/bmp') return b.toString('latin1', 0, 2) === 'BM' ? '' : 'not a BMP';
  if (type === 'image/svg+xml') {
    const d = new DOMParser().parseFromString(b.toString('utf8'), 'image/svg+xml');
    return !d.getElementsByTagName('parsererror').length && d.documentElement.localName === 'svg' ? '' : 'not an SVG';
  }
  return 'unexpected picture type ' + type;
}

/** package checks: content types, relationship targets, well-formed XML, pictures; the XML parts to validate */
async function unpack(buf, dir) {
  const zip = await JSZip.loadAsync(buf);
  const errors = [], parts = [], stripped = new Map();
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  const ctXml = names.includes('[Content_Types].xml') ? await zip.file('[Content_Types].xml').async('string') : '';
  if (!ctXml) errors.push('[Content_Types].xml missing');
  const ct = new DOMParser().parseFromString(ctXml || '<x/>', 'application/xml');
  const defaults = new Map(Array.from(ct.getElementsByTagName('Default')).map((d) => [d.getAttribute('Extension').toLowerCase(), d.getAttribute('ContentType')]));
  const overrides = new Map(Array.from(ct.getElementsByTagName('Override')).map((d) => [d.getAttribute('PartName'), d.getAttribute('ContentType')]));
  const typeOf = (n) => overrides.get('/' + n) || defaults.get(n.split('.').pop().toLowerCase()) || '';
  for (const n of names) {
    if (n === '[Content_Types].xml') continue;
    const type = typeOf(n);
    if (!type) {
      errors.push(n + ': no content type');
      continue;
    }
    const rule = CONTENT_TYPES.find(([re]) => re.test(n));
    if (rule) {
      const want = typeof rule[1] === 'function' ? rule[1](rule[0].exec(n)) : rule[1];
      if (type !== want) errors.push(n + ': content type ' + type + ', expected ' + want);
    }
    if (/^word\/media\//.test(n)) {
      const p = pictureProblem(await zip.file(n).async('uint8array'), type);
      if (p) errors.push(n + ': ' + p);
    }
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
    r.errors.forEach((e) => errors.push(n + ': ' + e));
    r.stripped.forEach((k, v) => stripped.set(v, (stripped.get(v) || 0) + k));
    if (n === 'docProps/core.xml') continue;
    const f = path.join(dir, n.replace(/[[\]]/g, '_'));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, r.xml);
    parts.push({ name: n, file: f });
  }
  return { errors, parts, stripped };
}

/**
 * xmllint over many files at once → errors by file ("Schemas validity error" lines). Each file must get its own
 * verdict line ("<file> validates" / "<file> fails to validate"): a file xmllint says nothing about fails, and so
 * does a chunk that ends in a crash (a signal, or an exit status other than 0 and 3).
 */
function xmllint(files) {
  const bin = process.env.XMLLINT || 'xmllint';
  const byFile = new Map(files.map((f) => [f, []]));
  const failed = new Set(), valid = new Set();
  const key = (f) => (byFile.has(f) ? f : path.resolve(f));
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
      if (m && byFile.has(key(m[1]))) byFile.get(key(m[1])).push(m[3].trim());
      const f = /^(.*) fails to validate$/.exec(line);
      if (f) failed.add(key(f[1]));
      const v = /^(.*) validates$/.exec(line);
      if (v) valid.add(key(v[1]));
    });
    if (r.signal || (r.status !== 0 && r.status !== 3)) {
      throw new Error('xmllint ended with ' + (r.signal || 'exit status ' + r.status) + ' on a chunk of ' + chunk.length + ' files:\n' + out.slice(-2000));
    }
  }
  byFile.forEach((errs, f) => {
    if (failed.has(f) && !errs.length) errs.push('fails to validate (no message parsed)');
    if (!failed.has(f) && !valid.has(f)) errs.push('no verdict from xmllint (neither "validates" nor "fails to validate")');
    if (failed.has(f) && valid.has(f)) errs.push('two verdicts from xmllint');
  });
  return byFile;
}

/**
 * LibreOffice: every .docx → a PDF with content, one soffice process per file (CI's first run gave all files to
 * one process: it stopped at one file and every file after it got no PDF, with nothing in the log saying why).
 * The profile is set up first (--terminate_after_init). A file is converted when soffice exits 0 and its PDF is
 * new, > 1 KB and starts with %PDF-. A failure is retried in the same profile, then in a fresh one (a crash may
 * leave the profile unusable); a conversion that needed a retry is noted, one that fails all three is reported
 * with each try's exit status or signal and soffice's own output.
 */
function soffice(docxFiles, outDir) {
  const bin = process.env.SOFFICE || 'soffice';
  fs.rmSync(outDir, { recursive: true, force: true }); // no PDF of an earlier run can count (--keep)
  fs.mkdirSync(outDir, { recursive: true });
  const { pathToFileURL } = require('node:url');
  let profiles = 0;
  const profile = () => path.join(outDir, '.lo-profile-' + profiles);
  // a new profile is set up by its first start, and that start may end without converting anything (seen with
  // LibreOffice 24.2.7 on Windows: exit 0, no PDF): set it up first
  const init = () => run(bin, ['-env:UserInstallation=' + pathToFileURL(profile()).href, '--headless', '--norestore', '--terminate_after_init'], { timeout: 180000 });
  init();
  const convert = (f) => {
    const pdf = path.join(outDir, path.basename(f).replace(/\.docx$/, '.pdf'));
    fs.rmSync(pdf, { force: true });
    const t0 = Date.now();
    const r = run(bin, ['-env:UserInstallation=' + pathToFileURL(profile()).href, '--headless', '--norestore', '--nolockcheck',
      '--convert-to', 'pdf', '--outdir', outDir, f], { timeout: 180000 });
    const size = fs.existsSync(pdf) ? fs.statSync(pdf).size : 0;
    const head = size ? fs.readFileSync(pdf).subarray(0, 5).toString('latin1') : '';
    const status = r.error ? String(r.error.code || r.error.message) : r.signal ? 'signal ' + r.signal : 'exit ' + r.status;
    const ok = !r.error && !r.signal && r.status === 0 && size > 1000 && head === '%PDF-';
    const why = ok ? '' : status + ', ' + (size ? size + ' bytes' + (head === '%PDF-' ? '' : ', not a PDF') : 'no PDF') + ', ' + (Date.now() - t0) + ' ms' +
      ((r.stderr || r.stdout) ? ' — soffice: ' + ((r.stderr || '') + (r.stdout || '')).trim().replace(/\s+/g, ' ').slice(0, 400) : '');
    return { file: f, pdf, size, ok, why };
  };
  return docxFiles.map((f) => {
    let r = convert(f);
    if (!r.ok) {
      // once more in the same profile, then in a fresh one (a crash may leave the profile unusable)
      const first = r.why;
      r = convert(f);
      if (!r.ok) {
        const second = r.why;
        profiles++;
        init();
        r = convert(f);
        if (!r.ok) r.why = first + ' | retry: ' + second + ' | retry with a fresh profile: ' + r.why;
        else r.retried = first + ' | ' + second;
      } else r.retried = first;
    }
    return r;
  });
}

async function main() {
  const o = args();
  const work = o.keep || fs.mkdtempSync(path.join(os.tmpdir(), 'kelk-docx-validate-'));
  // --keep DIR: nothing of an earlier run may count (old .docx, parts, PDFs)
  ['docx', 'parts', 'pdf'].forEach((d) => fs.rmSync(path.join(work, d), { recursive: true, force: true }));
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
  const cases = [], stripped = new Map();
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
    u.stripped.forEach((n, k) => stripped.set(k, (stripped.get(k) || 0) + n));
    cases.push({ name, file, parts: u.parts });
  }
  // what Markup Compatibility removed without a check of its own (see CHECKED): listed so a new one shows
  console.log('stripped (ignorable namespaces, not checked): ' + (stripped.size ? [...stripped].map(([k, n]) => k + ' ×' + n).join(', ') : 'nothing'));
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
    res.filter((r) => r.retried).forEach((r) => console.log('note  LibreOffice: ' + path.basename(r.file) + ' converted on the retry; first try: ' + r.retried));
    const known = (r) => {
      const k = SOFFICE_KNOWN.find((x) => x.file === path.basename(r.file));
      return k && /exit 134|signal/.test(String(r.why)) ? k : null;
    };
    res.filter((r) => !r.ok).forEach((r) => {
      const k = known(r);
      console.log((k ? 'known LibreOffice: ' : 'FAIL  LibreOffice: ') + path.basename(r.file) + ' → ' + r.why + (k ? ' — ' + k.reason : ''));
    });
    SOFFICE_KNOWN.filter((k) => res.some((r) => r.ok && path.basename(r.file) === k.file)).forEach((k) =>
      console.log('note  LibreOffice: ' + k.file + ' converted — remove its SOFFICE_KNOWN entry'));
    const okN = res.filter((r) => r.ok).length, knownN = res.filter((r) => !r.ok && known(r)).length;
    console.log('LibreOffice: ' + okN + ' / ' + res.length + ' converted to a non-empty PDF' + (knownN ? ', ' + knownN + ' known' : ''));
    fail += res.length - okN - knownN;
  } else console.log('LibreOffice: skipped (--no-soffice)');

  if (!o.keep) fs.rmSync(work, { recursive: true, force: true });
  console.log(fail ? 'docx-validate: FAILED (' + fail + ')' : 'docx-validate: ok');
  if (fail) process.exitCode = 1;
}

// the checks are also a module (their own cases in tests/unit/docx-validate.test.js); run as a script, the whole run
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
module.exports = { applyMce, pictureProblem, unpack, xmllint, soffice };
