'use strict';
/**
 * lib/FontEmbed.js: the fonts embedded in a .docx (obfuscated, ECMA-376 §17.8.1) and a .pptx (Embedded OpenType
 * in application/x-fontdata parts, [MS-OI29500] §2.1.1134). tests/docx-validate.js also checks an embedded .docx
 * against the schemas and opens it in LibreOffice.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const JSZip = require('jszip');
const FE = require('../../lib/FontEmbed.js');

// a real TrueType file: Vazirmatn's regular and bold, from its PDF font file
global.window = global;
global.PdfFonts = global.PdfFonts || {};
require(path.join(__dirname, '../../lib/pdf-base64-ttf-fonts/pdf-font-vazirmatn.js'));
const fam = Object.values(global.PdfFonts).find((x) => x.family === 'Vazirmatn');
const REG = new Uint8Array(Buffer.from(fam.styles.normal.data, 'base64'));
const BOLD = new Uint8Array(Buffer.from(fam.styles.bold.data, 'base64'));
const KEY = '{0123ABCD-4567-89EF-0123-456789ABCDEF}';

async function docxFile() {
  const z = new JSZip();
  z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
  z.file('word/fontTable.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>');
  z.file('word/_rels/fontTable.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>');
  z.file('word/settings.xml', '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="100"/><w:displayBackgroundShape/><w:evenAndOddHeaders w:val="false"/><w:compat><w:compatSetting/></w:compat></w:settings>');
  return z.generateAsync({ type: 'uint8array' });
}

test('obfuscation (§17.8.1): the first 32 bytes XORed with the GUID read backwards; the same call undoes it', function () {
  const o = FE.obfuscate(REG, KEY);
  // the key: the hex pairs, last first — EF CD AB 89 67 45 23 01 EF 89 67 45 CD AB 23 01
  assert.equal(o[0], REG[0] ^ 0xEF);
  const key = [0xEF, 0xCD, 0xAB, 0x89, 0x67, 0x45, 0x23, 0x01, 0xEF, 0x89, 0x67, 0x45, 0xCD, 0xAB, 0x23, 0x01];
  for (let i = 0; i < 32; i++) assert.equal(o[i], REG[i] ^ key[i % 16], 'byte ' + i);
  for (let i = 32; i < 64; i++) assert.equal(o[i], REG[i]);
  assert.deepEqual(FE.obfuscate(o, KEY), REG);
});

test('DOCX: font parts, the font table, its relationships, the content type and «Embed fonts» in the settings', async function () {
  const out = await FE.docx(await docxFile(), [{ name: 'Vazirmatn', regular: REG, bold: BOLD, charset: 0 }, { name: 'Named Only', charset: 178 }],
    { type: 'uint8array', guid: () => KEY });
  const z = await JSZip.loadAsync(out);
  const ft = await z.file('word/fontTable.xml').async('string');
  assert.match(ft, /<w:font w:name="Vazirmatn"><w:charset w:val="00"\/><w:embedRegular r:id="rId1" w:fontKey="\{0123ABCD-4567-89EF-0123-456789ABCDEF\}"\/><w:embedBold r:id="rId2" w:fontKey="[^"]+"\/><\/w:font>/);
  assert.match(ft, /<w:font w:name="Named Only"><w:charset w:val="B2"\/><\/w:font><\/w:fonts>$/);
  const rels = await z.file('word/_rels/fontTable.xml.rels').async('string');
  assert.match(rels, /Id="rId1" Type="http:\/\/schemas.openxmlformats.org\/officeDocument\/2006\/relationships\/font" Target="fonts\/kelk-font1.odttf"/);
  assert.deepEqual(FE.obfuscate(await z.file('word/fonts/kelk-font1.odttf').async('uint8array'), KEY), REG);
  assert.match(await z.file('[Content_Types].xml').async('string'), /<Default Extension="odttf" ContentType="application\/vnd.openxmlformats-officedocument.obfuscatedFont"\/>/);
  // CT_Settings order: after w:displayBackgroundShape, before w:evenAndOddHeaders
  assert.match(await z.file('word/settings.xml').async('string'), /<w:displayBackgroundShape\/><w:embedTrueTypeFonts\/><w:evenAndOddHeaders/);
});

test('DOCX: a font only described (no faces) changes no settings and adds no part', async function () {
  const z = await JSZip.loadAsync(await FE.docx(await docxFile(), [{ name: 'B', charset: 178 }], { type: 'uint8array' }));
  assert.doesNotMatch(await z.file('word/settings.xml').async('string'), /embedTrueTypeFonts/);
  assert.equal(Object.keys(z.files).filter((n) => /odttf$/.test(n)).length, 0);
});

test('Embedded OpenType 0x00020001: the header (sizes, magic, charset, names), then the TrueType file as it is', function () {
  const e = FE.eot(REG, 178);
  const v = new DataView(e.buffer);
  assert.equal(v.getUint32(0, true), e.length);                 // EOTSize
  assert.equal(v.getUint32(4, true), REG.length);               // FontDataSize
  assert.equal(v.getUint32(8, true), 0x00020001);               // Version
  assert.equal(v.getUint32(12, true), 0);                       // Flags: not compressed, not XORed
  assert.equal(e[26], 178);                                     // Charset
  assert.equal(v.getUint16(34, true), 0x504C);                  // MagicNumber
  assert.equal(v.getUint32(28, true), 400);                     // Weight
  const famSize = v.getUint16(82, true);
  assert.equal(Buffer.from(e.slice(84, 84 + famSize)).toString('utf16le'), 'Vazirmatn');
  assert.deepEqual(e.slice(e.length - REG.length), REG);
});

test('PPTX: font parts (EOT), p:embeddedFontLst after p:notesSz, embedTrueTypeFonts on, the content type', async function () {
  const z0 = new JSZip();
  z0.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>');
  z0.file('ppt/presentation.xml', '<p:presentation xmlns:p="p" xmlns:r="r" rtl="1" saveSubsetFonts="1"><p:sldIdLst/><p:sldSz cx="1" cy="1"/><p:notesSz cx="1" cy="1"/><p:defaultTextStyle/></p:presentation>');
  z0.file('ppt/_rels/presentation.xml.rels', '<Relationships xmlns="x"><Relationship Id="rId1" Type="t" Target="slides/slide1.xml"/><Relationship Id="rId7" Type="t" Target="theme/theme1.xml"/></Relationships>');
  const z = await JSZip.loadAsync(await FE.pptx(await z0.generateAsync({ type: 'uint8array' }),
    [{ name: 'B Font', regular: REG, bold: BOLD, charset: 178 }], { type: 'uint8array' }));
  const p = await z.file('ppt/presentation.xml').async('string');
  assert.match(p, /^<p:presentation xmlns:p="p" xmlns:r="r" rtl="1" embedTrueTypeFonts="1">/);
  assert.match(p, /<p:notesSz cx="1" cy="1"\/><p:embeddedFontLst><p:embeddedFont><p:font typeface="B Font" charset="-78"\/><p:regular r:id="rId8"\/><p:bold r:id="rId9"\/><\/p:embeddedFont><\/p:embeddedFontLst><p:defaultTextStyle\/>/);
  assert.match(await z.file('ppt/_rels/presentation.xml.rels').async('string'), /Id="rId8" Type="http:\/\/schemas.openxmlformats.org\/officeDocument\/2006\/relationships\/font" Target="fonts\/kelk-font1.fntdata"/);
  assert.deepEqual(await z.file('ppt/fonts/kelk-font1.fntdata').async('uint8array'), FE.eot(REG, 178));
  assert.match(await z.file('[Content_Types].xml').async('string'), /<Default Extension="fntdata" ContentType="application\/x-fontdata"\/>/);
});
