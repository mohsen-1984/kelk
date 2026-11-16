/**
 * Build lib/pdfimport/fontprints.js — the fontprints (outline hashes, lib/pdfimport/fontprint.js) of the fonts Kelk
 * knows, so the PDF importer can name a glyph by its outline when a file's own names are missing or wrong.
 *   node tools/build-fontprints.js                   the repository's fonts (assets/fonts/download/persian-fonts-ttf.zip);
 *                                                    the faces marked `supplied` in the file are kept as they are
 *   node tools/build-fontprints.js --add <folder>    … and every .ttf under <folder> as `supplied` faces (fonts that
 *                                                    are not in the repository: only their hashes are written)
 *   node tools/build-fontprints.js --skip <text>     leave out the repository fonts whose path holds <text>
 * Without a shell: tools/fontprints.html does the same in a browser, from font files dropped on it.
 * `npm run check:fresh` runs it: the file must equal what its sources give.
 */
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const PdfImporter = require(path.join(root, 'lib', 'PdfImporter.js'));
require(path.join(root, 'lib', 'pdfimport', 'fontprint.js'));
const JSZip = require(path.join(root, 'vendor', fs.readdirSync(path.join(root, 'vendor')).find((f) => /^jszip\.min_.*\.js$/.test(f))));
const F = PdfImporter._fontprint, OUT = path.join(root, 'lib', 'pdfimport', 'fontprints.js');
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const add = arg('--add'), skip = arg('--skip');

const faceOf = (bytes, src) => { const f = F.face(new Uint8Array(bytes)); return { family: f.family, face: f.face, src, glyphs: f.glyphs, prints: F.pack(f.prints) }; };
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : /\.ttf$/i.test(e.name) ? [path.join(d, e.name)] : []);

(async () => {
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(root, 'assets', 'fonts', 'download', 'persian-fonts-ttf.zip')));
  const faces = [];
  for (const name of Object.keys(zip.files).filter((n) => /\.ttf$/i.test(n) && !(skip && n.indexOf(skip) >= 0)).sort()) {
    faces.push(faceOf(await zip.files[name].async('uint8array'), 'kelk'));
  }
  const key = (f) => f.family + '|' + f.face;
  let supplied = [];
  try { delete require.cache[require.resolve(OUT)]; supplied = require(OUT).faces.filter((f) => f.src === 'supplied'); } catch (e) { /* no file yet */ }
  if (add) walk(add).sort().forEach((p) => { const f = faceOf(fs.readFileSync(p), 'supplied'); supplied = supplied.filter((x) => key(x) !== key(f)).concat([f]); });
  const have = new Set(faces.map(key));
  supplied.filter((f) => !have.has(key(f))).forEach((f) => faces.push(f));
  const bad = faces.filter((f) => !f.family || !f.prints);
  if (bad.length) { console.error('a font without a family name or without TrueType outlines:', bad.map(key).join(', ')); process.exit(1); }
  // one fontprint, two characters in two faces: no table could be trusted — stop (none so far)
  const where = {}, clash = [];
  faces.forEach((f) => { const t = F.unpack(f.prints); Object.keys(t).forEach((h) => {
    const c = t[h][0].normalize('NFKC');
    if (where[h] && where[h][1] !== c) clash.push(h + ': «' + where[h][1] + '» in ' + where[h][0] + ', «' + c + '» in ' + key(f)); else where[h] = [key(f), c];
  }); });
  if (clash.length) { console.error('fontprints that name two characters:\n  ' + clash.slice(0, 20).join('\n  ')); process.exit(1); }
  const text = F.source(faces);
  fs.writeFileSync(OUT, text);
  console.log('lib/pdfimport/fontprints.js:', faces.length, 'faces (' + faces.filter((f) => f.src === 'supplied').length + ' supplied),',
    faces.reduce((n, f) => n + f.prints.split(' ').length, 0), 'fontprints,', Buffer.byteLength(text), 'bytes');
})();
