#!/usr/bin/env node
// The side-by-side check of Kelk 3.5's decipherment against fontprints (a lab check, not a gate): every lab file whose
// fonts of Arabic script fontprints read is imported with options.decipherKnown — those fonts deciphered too, as if no
// face knew them, nothing taken — and the reading is compared with the fontprints' glyph by glyph: letters, digits and
// marks apart, per font face. The faces the feature model was counted on (tools/build-featmodel.js) are reported apart
// («calibration face»: in-sample), and so is B Mitra Bold («same family as a calibration font»), never among the unknown.
//   node scripts/decipher-side.js [filter]      (KELK=<a checkout> to run another importer)
'use strict';
const fs = require('fs');
const env = require('./env.js');
const { chromium } = env.req('playwright');

// the calibration faces: every Vazirmatn and Sahel, B Nazanin (not its Outline), B Mitra (not its Bold)
function kind(family, face) {
  if (/^B Mitra$/.test(family) && /bold/i.test(face || '')) return 'same family as a calibration font';
  if (/^(Vazirmatn|Sahel)/.test(family)) return 'calibration face';
  if (/^B Nazanin$/.test(family) && !/outline/i.test(face || '')) return 'calibration face';
  if (/^B Mitra$/.test(family)) return 'calibration face';
  return 'unknown to the model';
}

(async () => {
  const filter = new RegExp(process.argv[2] || '.');
  const browser = await chromium.launch(), page = await browser.newPage();
  await page.goto(env.fileUrl(env.KELK + '/tools/pdf-lab.html'));
  const rows = {};
  let files = 0;
  for (const x of env.labPdfs().filter((y) => filter.test(y.name))) {
    const p = x.file;
    const side = await page.evaluate(async ({ b64 }) => {
      const bin = atob(b64), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const imp = PdfImporter.create({ images: 'drop', asciiNumbers: false, persianLetters: false, decipherKnown: true, ocr: 'leave' });
      await imp.fromArrayBuffer(u.buffer);
      return imp._decSide || [];
    }, { b64: fs.readFileSync(p).toString('base64') });
    if (!side.length) continue;
    files++;
    side.forEach((s) => {
      const key = s.family + ' · ' + s.face, r = rows[key] || (rows[key] = { kind: kind(s.family, s.face), files: 0, letters: [0, 0], digits: [0, 0], marks: [0, 0], verdicts: {} });
      r.files++;
      ['letters', 'digits', 'marks'].forEach((k) => { r[k][0] += s[k][0]; r[k][1] += s[k][1]; });
      r.verdicts[s.verdict] = (r.verdicts[s.verdict] || 0) + 1;
    });
  }
  await browser.close();
  const pc = (a) => a[1] ? (100 * a[0] / a[1]).toFixed(1) + ' % of ' + a[1] : '—';
  console.log('the decipherment against fontprints, ' + files + ' lab files (letters · digits · marks, glyph uses; verdicts by font)');
  ['unknown to the model', 'same family as a calibration font', 'calibration face'].forEach((k) => {
    const ks = Object.keys(rows).filter((x) => rows[x].kind === k).sort();
    if (!ks.length) return;
    console.log('\n' + k + ':');
    const tot = { letters: [0, 0], digits: [0, 0], marks: [0, 0] };
    ks.forEach((x) => {
      const r = rows[x];
      ['letters', 'digits', 'marks'].forEach((q) => { tot[q][0] += r[q][0]; tot[q][1] += r[q][1]; });
      console.log('  ' + x.padEnd(34) + ' ' + pc(r.letters).padEnd(20) + ' ' + pc(r.digits).padEnd(16) + ' ' + pc(r.marks).padEnd(16) + ' ' + JSON.stringify(r.verdicts));
    });
    console.log('  ' + 'all'.padEnd(34) + ' ' + pc(tot.letters).padEnd(20) + ' ' + pc(tot.digits).padEnd(16) + ' ' + pc(tot.marks));
  });
})().catch((e) => { console.error(e); process.exit(1); });
