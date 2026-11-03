// The lab's held-out parts and their protocol (docs/HELDOUT.md): which documents are held out, the log of held-out
// files that were opened, the Shamsi date the log is written with. Pure functions, no browser, no env.js (it creates
// LAB_OUT) — tests/unit/heldout.test.js reads them directly; env.js heldSplit() / openHeld() apply them to the lab.
//
//   node scripts/heldout.js                     the split: the documents on each side and their PDFs
//   node scripts/heldout.js opened <what>       add a line to docs/reports/heldout-opened.log by hand (a held-out
//                                               file was opened: <what> = real:<document> or fuzz:heldout)
//
// The real-producer split (plan P4.3) is by DOCUMENT, never by file: the document of a lab PDF is the part of its
// name after the producer's '--' (a name without '--' is no document), and every PDF of a held-out document is held
// out wherever it lies in pdf/ — so a rule written for a document seen through Word is never measured on the same
// document through Edge, or through a producer in another folder.
// Which documents: HELD_DOCS, a committed list — once held out, a document stays held out (until it is opened). A
// document not in that list is held out when the fixed hash of its name (sha-256 of REAL_SALT + its name, read as a
// number in [0, 1)) is below REAL_SHARE — nobody picks it — and is added to HELD_DOCS in the change that brings it
// (tests/unit/heldout.test.js checks that). The hash rule looks at the documents of pdf/real-producers/ only (the
// corpus documents are dev). Nothing fills the held-out side from the dev documents: they were read file by file.
// HELD_DOCS minus REAL_OPENED holds at least REAL_MIN documents (the test checks it); below that, NEW documents are
// added (docs/HELDOUT.md). A document named in REAL_OPENED (one of its held-out files was opened) is dev from then on.
const crypto = require('crypto');
const path = require('path');

const REAL_SALT = 'kelk-real-heldout-1';
const REAL_SHARE = 0.3;
const REAL_MIN = 4;
// the held-out documents, committed 1405-08-12 (P4.3): real-deck-fa, real-memo-fa, real-report-fa by their hash,
// real-letter-ar by P4.3's first fill to 4 — kept, as the list changes only by a new document or an opening
const HELD_DOCS = ['real-deck-fa', 'real-letter-ar', 'real-memo-fa', 'real-report-fa'];
// documents moved to dev because one of their held-out files was opened (docs/HELDOUT.md, "When a held-out file was
// opened"): add the document here, with the date, in the change that records it in the log
const REAL_OPENED = [];
// the log of openings: in the repository, committed with the change that opened something (docs/HELDOUT.md)
const OPENED_LOG = path.resolve(__dirname, '..', '..', '..', 'docs', 'reports', 'heldout-opened.log');

// the document of a lab PDF: 'edge--real-memo-fa.pdf' → 'real-memo-fa' (the part after the producer's '--'); null
// for a name without '--' (no document)
function docOf(name) {
  const base = path.basename(String(name)).replace(/\.pdf$/i, '');
  const i = base.indexOf('--');
  return i < 0 ? null : base.slice(i + 2);
}
// a document's fixed position in [0, 1)
function docHash(doc, salt) {
  const h = crypto.createHash('sha256').update((salt || REAL_SALT) + '\n' + doc).digest();
  return h.readUInt32BE(0) / 0x100000000;
}
// documents → { heldout: [...], dev: [...] }, each sorted by name: held out when not opened and either listed (HELD_DOCS)
// or below the share by its hash — a document's side depends on itself alone, never on the other documents
function splitDocs(docs, opts) {
  const o = Object.assign({ salt: REAL_SALT, share: REAL_SHARE, held: HELD_DOCS, opened: REAL_OPENED }, opts || {});
  const all = [...new Set(docs.filter((d) => d))].sort();
  const open = new Set(o.opened), listed = new Set(o.held);
  const isHeld = (d) => !open.has(d) && (listed.has(d) || docHash(d, o.salt) < o.share);
  return { heldout: all.filter(isHeld), dev: all.filter((d) => !isHeld(d)) };
}
// lab PDFs [{ name, file }] → { heldout: [pdf], dev: [real-producer pdf], docs: { heldout, dev } }: the hash rule over
// the documents of the real-producer PDFs (isReal) and the committed list; then every lab PDF whose document is held
// out is held out, whatever its folder or producer
function splitLab(pdfs, isReal, opts) {
  const o = Object.assign({ held: HELD_DOCS, opened: REAL_OPENED }, opts || {});
  const open = new Set(o.opened);
  const realDocs = pdfs.filter((x) => isReal(x.name)).map((x) => docOf(x.name));
  const docs = splitDocs(realDocs.concat(o.held.filter((d) => !open.has(d))), o);
  const held = new Set(docs.heldout);
  const isHeldPdf = (x) => held.has(docOf(x.name));
  return { heldout: pdfs.filter(isHeldPdf), dev: pdfs.filter((x) => isReal(x.name) && !isHeldPdf(x)), docs };
}

// today (or a Date) as Solar Hijri YYYY-MM-DD, the project's date format
function shamsi(date) {
  const p = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran' }).formatToParts(date || new Date());
  const get = (t) => p.find((x) => x.type === t).value;
  return get('year') + '-' + get('month') + '-' + get('day');
}
// one line of heldout-opened.log: date, what was opened, who, generator, seed base — tab-separated
function openedLine(o) {
  return [o.date || shamsi(), o.split, o.user || '?', 'generator ' + (o.generator === undefined || o.generator === null ? '?' : o.generator),
    'seed base ' + (o.base === undefined || o.base === null ? '-' : o.base)].join('\t') + '\n';
}
// who is opening: the git identity, else the login
function whoAmI() {
  try { const n = require('child_process').execFileSync('git', ['config', 'user.name'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); if (n) return n; } catch (e) { /* no git */ }
  try { return require('os').userInfo().username; } catch (e) { return '?'; }
}
// append a line to the opened log (default OPENED_LOG, docs/reports/heldout-opened.log) and say so on stderr
function logOpened(o, file) {
  const fs = require('fs');
  file = file || OPENED_LOG;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, openedLine(Object.assign({ user: whoAmI() }, o)));
  console.error('\n*** WARNING: held-out files opened (' + o.split + ') — logged to ' + file + ': commit it with this change.\n' +
    '*** This set now measures nothing for whoever reads them: rotate it or retire the document (docs/HELDOUT.md) and say so in the report. ***\n');
  return file;
}
// the lines of the opened log (none when it does not exist)
function openedLines(file) {
  try { return require('fs').readFileSync(file || OPENED_LOG, 'utf8').split('\n').filter((l) => l.trim()); } catch (e) { return []; }
}

module.exports = { REAL_SALT, REAL_SHARE, REAL_MIN, HELD_DOCS, REAL_OPENED, OPENED_LOG, docOf, docHash, splitDocs, splitLab, shamsi, openedLine, logOpened, openedLines, whoAmI };

if (require.main === module) {
  const env = require('./env.js');
  const a = process.argv.slice(2);
  if (a[0] === 'opened') {
    if (!/^(real:.+|fuzz:\w+)$/.test(a[1] || '')) { console.error('usage: node scripts/heldout.js opened real:<document> | fuzz:heldout'); process.exit(2); }
    logOpened({ split: a[1] });
  } else {
    const s = env.heldSplit();
    const count = (docs, pdfs) => docs.map((d) => d + ' (' + pdfs.filter((x) => docOf(x.name) === d).length + ')').join(', ');
    console.log('real-producer split: ' + (s.docs.heldout.length + s.docs.dev.length) + ' documents (committed HELD_DOCS ' + HELD_DOCS.length +
      '; a new document by salt ' + REAL_SALT + ', share ' + REAL_SHARE + '; at least ' + REAL_MIN + ' held out)');
    console.log('  held out: ' + s.docs.heldout.length + ' documents, ' + s.heldout.length + ' PDFs anywhere in pdf/ — ' + count(s.docs.heldout, s.heldout));
    console.log('  dev:      ' + s.docs.dev.length + ' documents, ' + s.dev.length + ' real-producer PDFs — ' + count(s.docs.dev, s.dev));
    const unlisted = s.docs.heldout.filter((d) => !HELD_DOCS.includes(d));
    if (unlisted.length) console.log('  NEW, held out by its hash — add to HELD_DOCS: ' + unlisted.join(', '));
    if (REAL_OPENED.length) console.log('  moved to dev after an opening: ' + REAL_OPENED.join(', '));
    console.log('  ' + path.relative(process.cwd(), OPENED_LOG) + ': ' + openedLines().length + ' line(s)');
  }
}
