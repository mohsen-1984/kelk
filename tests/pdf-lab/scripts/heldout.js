// The lab's held-out parts and their protocol (docs/HELDOUT.md): which real-producer documents are held out, the
// log of held-out files that were opened, the Shamsi date the log is written with. Pure functions, no browser, no
// env.js (it creates LAB_OUT) — tests/unit/heldout.test.js reads them directly.
//
//   node scripts/heldout.js                     the real-producer split: the documents on each side and their PDFs
//   node scripts/heldout.js opened <what>       add a line to LAB_OUT/heldout-opened.log by hand (a held-out real
//                                               file was opened: <what> = real:<document>)
//
// The real-producer split (plan P4.3): pdf/real-producers/<producer>--<document>.pdf is split by DOCUMENT, never by
// file — every producer's PDF of one document lies on the same side, so a rule written for a document seen through
// Word cannot be measured on the same document through Edge. A document is held out when the fixed hash of its name
// (sha-256 of REAL_SALT + its name, read as a number in [0, 1)) is below REAL_SHARE: nobody picks the documents, and
// a new document's side follows from its own name, whatever else is added. Should fewer than REAL_MIN documents fall
// below the threshold, the lowest hashes above it fill up to REAL_MIN. A document named in REAL_OPENED (one of its
// held-out files was opened) is dev from then on, whatever its hash.
const crypto = require('crypto');
const path = require('path');

const REAL_SALT = 'kelk-real-heldout-1';
const REAL_SHARE = 0.3;
const REAL_MIN = 4;
// documents moved to dev because one of their held-out files was opened (docs/HELDOUT.md, "When a held-out file was
// opened"): add the document here, with the date, in the change that records it in the log
const REAL_OPENED = [];

// the document of a lab PDF: 'edge--real-memo-fa.pdf' → 'real-memo-fa' (the part after the producer's '--')
function docOf(name) {
  const base = path.basename(String(name)).replace(/\.pdf$/i, '');
  const i = base.indexOf('--');
  return i < 0 ? base : base.slice(i + 2);
}
// a document's fixed position in [0, 1)
function docHash(doc, salt) {
  const h = crypto.createHash('sha256').update((salt || REAL_SALT) + '\n' + doc).digest();
  return h.readUInt32BE(0) / 0x100000000;
}
// documents → { heldout: [...], dev: [...] }, each sorted by name
function splitDocs(docs, opts) {
  const o = Object.assign({ salt: REAL_SALT, share: REAL_SHARE, min: REAL_MIN, opened: REAL_OPENED }, opts || {});
  const all = [...new Set(docs)].sort();
  const open = new Set(o.opened);
  const ranked = all.filter((d) => !open.has(d)).map((d) => [d, docHash(d, o.salt)]).sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
  const held = new Set(ranked.filter(([, h]) => h < o.share).map(([d]) => d));
  for (const [d] of ranked) { if (held.size >= Math.min(o.min, ranked.length)) break; held.add(d); }
  return { heldout: all.filter((d) => held.has(d)), dev: all.filter((d) => !held.has(d)) };
}
// lab PDFs [{ name, file }] of pdf/real-producers → { heldout: [pdf], dev: [pdf], docs: splitDocs(...) }; other PDFs untouched
function splitRealPdfs(pdfs, isReal, opts) {
  const real = pdfs.filter((x) => isReal(x.name));
  const docs = splitDocs(real.map((x) => docOf(x.name)), opts);
  const held = new Set(docs.heldout);
  return { heldout: real.filter((x) => held.has(docOf(x.name))), dev: real.filter((x) => !held.has(docOf(x.name))), docs };
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
// append a line to <out>/heldout-opened.log and say so on stderr
function logOpened(out, o) {
  const fs = require('fs');
  const file = path.join(out, 'heldout-opened.log');
  fs.mkdirSync(out, { recursive: true });
  fs.appendFileSync(file, openedLine(Object.assign({ user: whoAmI() }, o)));
  console.error('\n*** WARNING: held-out files opened (' + o.split + ') — logged to ' + file + '.\n' +
    '*** This set now measures nothing for whoever reads them: rotate it (docs/HELDOUT.md) and say so in the report. ***\n');
  return file;
}

module.exports = { REAL_SALT, REAL_SHARE, REAL_MIN, REAL_OPENED, docOf, docHash, splitDocs, splitRealPdfs, shamsi, openedLine, logOpened, whoAmI };

if (require.main === module) {
  const env = require('./env.js');
  const isReal = (n) => env.pdfGroup(n) === 'real-producers';
  const a = process.argv.slice(2);
  if (a[0] === 'opened') {
    if (!a[1]) { console.error('usage: node scripts/heldout.js opened real:<document>'); process.exit(2); }
    logOpened(env.OUT, { split: a[1] });
  } else {
    const s = splitRealPdfs(env.labPdfs(), isReal);
    const count = (docs, pdfs) => docs.map((d) => d + ' (' + pdfs.filter((x) => docOf(x.name) === d).length + ')').join(', ');
    console.log('real producers: ' + (s.heldout.length + s.dev.length) + ' PDFs of ' + (s.docs.heldout.length + s.docs.dev.length) + ' documents (salt ' + REAL_SALT + ', share ' + REAL_SHARE + ', at least ' + REAL_MIN + ')');
    console.log('  held out: ' + s.docs.heldout.length + ' documents, ' + s.heldout.length + ' PDFs — ' + count(s.docs.heldout, s.heldout));
    console.log('  dev:      ' + s.docs.dev.length + ' documents, ' + s.dev.length + ' PDFs — ' + count(s.docs.dev, s.dev));
    if (REAL_OPENED.length) console.log('  moved to dev after an opening: ' + REAL_OPENED.join(', '));
  }
}
