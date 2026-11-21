#!/usr/bin/env node
/**
 * A Tesseract model as a script (Kelk 3.4): vendor/tesseract/<lang>-best.js from a .traineddata file of tessdata_best,
 * so the model loads from file:// as the rest of Kelk does (a script tag; nothing is fetched). The bytes are not
 * changed, only written in base64. Read by lib/pdfimport/ocr.js (PdfImporter._ocr.model).
 *
 *   node tools/vendor-ocr-model.js <path>/fas.traineddata <tessdata_best commit>   → vendor/tesseract/fas-best.js
 *
 * The model: https://github.com/tesseract-ocr/tessdata_best (Apache-2.0); vendor/tesseract/README.md records the commit
 * and the file's SHA-256.
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const [src, commit] = process.argv.slice(2);
if (!src || !commit) { console.error('usage: node tools/vendor-ocr-model.js <lang>.traineddata <tessdata_best commit>'); process.exit(2); }
const lang = path.basename(src).replace(/\.traineddata$/, '');
const bytes = fs.readFileSync(src);
const sha = crypto.createHash('sha256').update(bytes).digest('hex');
const out = path.join(__dirname, '..', 'vendor', 'tesseract', lang + '-best.js');
fs.writeFileSync(out,
    '/* Tesseract\'s ' + lang + ' model, tessdata_best (https://github.com/tesseract-ocr/tessdata_best, commit ' + commit +
    ', Apache-2.0), in base64; SHA-256 of the .traineddata ' + sha + '. Made by tools/vendor-ocr-model.js. */\n' +
    '(function (g) { (g.KelkOcrModels = g.KelkOcrModels || {})[\'' + lang + '\'] = \'' + bytes.toString('base64') + '\';\n' +
    '    if (typeof module !== \'undefined\' && module.exports) module.exports = g.KelkOcrModels[\'' + lang + '\']; })(typeof window !== \'undefined\' ? window : globalThis);\n');
console.log(path.relative(process.cwd(), out), (fs.statSync(out).size / 1e6).toFixed(2) + ' MB', sha);
