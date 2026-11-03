// Clears the personal metadata Office writes into the real-producer corpus (plan P4.1), so the committed files carry no
// user name and no local folder:
//   .docx / .xlsx / .pptx   docProps/core.xml dc:creator and cp:lastModifiedBy, docProps/app.xml Manager and Company
//                           (emptied), and xl/workbook.xml's x15ac:absPath (the folder the workbook was saved in: removed)
//   .pdf                    the Info dictionary's /Author and the XMP stream's dc:creator (emptied). Producer and Creator
//                           are kept: they name the application, and the provenance profile (profile.js) reads them
// A PDF is rewritten with pdf-lib only when it holds an author; its page content streams are compared before and after
// (decoded, page by page) and the file is left as it was if any differs. A file with nothing to clear is not touched.
// make-real.ps1 runs it at its end; by hand:
//   node tests/pdf-lab/scripts/strip-meta.js [file-or-folder …]     (default: corpus/real-src and pdf/real-producers)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { req, LAB } = require('./env.js');
const JSZip = req('jszip');
const { PDFDocument, PDFName, PDFString, PDFArray, PDFRawStream, decodePDFRawStream } = req('pdf-lib');

const emptyTag = (xml, tag) => xml.replace(new RegExp('<' + tag + '(\\s[^>]*)?>[^<]*</' + tag + '>', 'g'), '<' + tag + '$1></' + tag + '>');

async function ooxml(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const edits = {
    'docProps/core.xml': (x) => emptyTag(emptyTag(x, 'dc:creator'), 'cp:lastModifiedBy'),
    'docProps/app.xml': (x) => emptyTag(emptyTag(x, 'Manager'), 'Company'),
    'xl/workbook.xml': (x) => x.replace(/<mc:AlternateContent\b[^>]*>\s*<mc:Choice Requires="x15">\s*<x15ac:absPath\b[^>]*\/>\s*<\/mc:Choice>\s*<\/mc:AlternateContent>/g, '')
  };
  let changed = 0;
  for (const name of Object.keys(edits)) {
    const entry = zip.file(name);
    if (!entry) continue;
    const before = await entry.async('string'), after = edits[name](before);
    if (after !== before) { zip.file(name, after, { date: entry.date }); changed++; }
  }
  if (changed) fs.writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } }));
  return changed ? 'cleared ' + changed + ' part(s)' : null;
}

// a hash of every page's decoded content stream(s), in page order
function contentHash(doc) {
  const h = crypto.createHash('sha256');
  doc.getPages().forEach((p, i) => {
    let c = p.node.get(PDFName.of('Contents'));
    c = c && doc.context.lookup(c);
    const parts = c instanceof PDFArray ? c.asArray().map((r) => doc.context.lookup(r)) : c ? [c] : [];
    h.update('page ' + i + '\n');
    parts.forEach((s) => h.update(s instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(s).decode()) : Buffer.from(s.getContents())));
  });
  return h.digest('hex');
}

async function pdf(file) {
  const bytes = fs.readFileSync(file);
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  const before = contentHash(doc);
  let changed = 0;
  const info = doc.getInfoDict(), author = info.get(PDFName.of('Author'));
  if (author && (author.decodeText ? author.decodeText() : String(author)) !== '') { info.set(PDFName.of('Author'), PDFString.of('')); changed++; }
  const metaRef = doc.catalog.get(PDFName.of('Metadata')), meta = metaRef && doc.context.lookup(metaRef);
  if (meta instanceof PDFRawStream) {
    const xmp = Buffer.from(decodePDFRawStream(meta).decode()).toString('utf8');
    const clean = xmp.replace(/<dc:creator>\s*<rdf:Seq>[\s\S]*?<\/rdf:Seq>\s*<\/dc:creator>/g, '<dc:creator><rdf:Seq><rdf:li></rdf:li></rdf:Seq></dc:creator>');
    if (clean !== xmp) {
      // (uncompressed, as XMP is meant to be readable, under the same object number)
      doc.context.assign(metaRef, doc.context.stream(Buffer.from(clean, 'utf8'), { Type: 'Metadata', Subtype: 'XML' }));
      changed++;
    }
  }
  if (!changed) return null;
  const out = await doc.save({ updateFieldAppearances: false });
  const after = contentHash(await PDFDocument.load(out, { updateMetadata: false }));
  if (after !== before) throw new Error(file + ': the page content changed: left as it was');
  fs.writeFileSync(file, out);
  return 'cleared ' + changed + ' field(s), page content identical';
}

(async () => {
  const roots = process.argv.slice(2).length ? process.argv.slice(2) : [path.join(LAB, 'corpus', 'real-src'), path.join(LAB, 'pdf', 'real-producers')];
  const files = roots.flatMap((r) => fs.statSync(r).isDirectory() ? fs.readdirSync(r).sort().map((f) => path.join(r, f)) : [r]);
  let n = 0;
  for (const f of files) {
    const what = /\.(docx|xlsx|pptx)$/i.test(f) ? await ooxml(f) : /\.pdf$/i.test(f) ? await pdf(f) : null;
    if (what) { n++; console.log(path.basename(f).padEnd(44), what); }
  }
  console.log(n + ' of ' + files.length + ' files changed');
})().catch((e) => { console.error(e.message || e); process.exitCode = 1; });
