/**
 * Build vendor/pdfjs/ — PDF.js as CLASSIC scripts, so the PDF import works
 * offline and from file:// (browsers load neither ES modules nor Workers there).
 *
 *   node tools/build-pdfjs.js <pdf.mjs> <pdf.worker.mjs> [<wasm folder>]
 *
 * Inputs (either form; the output name follows the input: pdf.mjs → pdf_<v>.js,
 * pdf.min.mjs → pdf.min_<v>.js):
 *   the release zip  https://github.com/mozilla/pdf.js/releases/download/v<v>/pdfjs-<v>-dist.zip
 *                    build/pdf.mjs, build/pdf.worker.mjs, web/wasm/
 *   or jsDelivr      https://cdn.jsdelivr.net/npm/pdfjs-dist@<v>/build/pdf.min.mjs
 *                    https://cdn.jsdelivr.net/npm/pdfjs-dist@<v>/build/pdf.worker.min.mjs
 *                    https://cdn.jsdelivr.net/npm/pdfjs-dist@<v>/wasm/openjpeg.wasm (and jbig2.wasm)
 *
 * Output (the version is read from the files):
 *   vendor/pdfjs/pdf[.min]_<v>.js           defines window.pdfjsLib
 *   vendor/pdfjs/pdf.worker[.min]_<v>.js    defines window.pdfjsWorker
 *   vendor/pdfjs/wasm/openjpeg.wasm.js      JPEG 2000 decoder, base64 (loaded when an image needs it)
 *   vendor/pdfjs/wasm/jbig2.wasm.js         JBIG2 / CCITT decoder, base64
 * With window.pdfjsWorker present, PDF.js runs its worker code on the main
 * thread: no Worker, no fetch, no CORS. The code itself is not changed: each
 * module is wrapped in a function, its `export { … }` becomes the global object,
 * and `import.meta.url` becomes the script's own URL; tools/pdfjs-polyfills.js goes in
 * front (newest built-ins, e.g. Map.prototype.getOrInsertComputed, for browsers without them). The decoders reach PDF.js
 * through PdfImporter's BinaryDataFactory (no fetch); their pure-JS fallbacks
 * (*_nowasm_fallback.js) are not used — PDF.js loads them with import(), which
 * file:// does not allow.
 */
const fs = require('fs'), path = require('path');

const root = path.join(__dirname, '..');
// built-ins the modern build calls directly, defined only where a browser lacks them
const POLYFILLS = fs.readFileSync(path.join(__dirname, 'pdfjs-polyfills.js'), 'utf8');
const [libIn, workerIn, wasmIn] = process.argv.slice(2);
if (!libIn || !workerIn) {
    console.error('usage: node tools/build-pdfjs.js <pdf.mjs> <pdf.worker.mjs> [<wasm folder>]');
    process.exit(1);
}

function version(src, file) {
    // the most frequent "x.y.z" literal, leaving out core-js's {version:"…",mode:…} (legacy polyfills)
    const count = {};
    (src.match(/"\d+\.\d+\.\d+"(?!,mode:)/g) || []).forEach(function (q) { count[q] = (count[q] || 0) + 1; });
    const best = Object.keys(count).sort(function (x, y) { return count[y] - count[x]; })[0];
    if (!best) throw new Error(file + ': no version found');
    return best.slice(1, -1);
}

/** ES module text → classic script that assigns its exports to globalThis[name]. */
function toClassic(src, file, name) {
    src = src.replace(/\n?\/\/# sourceMappingURL=\S*\s*$/, '');
    if (/^\s*import\s+(?:[\w*{][^;]*\sfrom\s|["'])/m.test(src)) {
        throw new Error(file + ': has static imports — use a self-contained build (pdf.mjs, pdf.min.mjs or /+esm)');
    }
    const m = src.match(/export\s*\{([^}]*)\}\s*;?\s*$/);
    if (!m) throw new Error(file + ': no final export { … } found');
    const body = src.slice(0, m.index);
    if (/\bexport\s/.test(body.replace(/["'`][^"'`]*["'`]/g, ''))) throw new Error(file + ': exports other than the final export { … }');
    const props = m[1].split(',').map(function (s) { return s.trim(); }).filter(Boolean).map(function (s) {
        const p = s.split(/\s+as\s+/);
        return JSON.stringify(p[1] || p[0]) + ': ' + p[0];
    });
    return '/* PDF.js — Mozilla Foundation, Apache-2.0 (LICENSE). Classic-script wrap of ' + path.basename(file) +
        ' by tools/build-pdfjs.js; code unchanged. */\n' +
        POLYFILLS + '\n' +
        '(function () {\n"use strict";\n' +
        'var __scriptUrl = (typeof document !== "undefined" && document.currentScript && document.currentScript.src) || "";\n' +
        body.replace(/import\.meta\.url/g, '__scriptUrl') + '\n' +
        'globalThis.' + name + ' = {' + props.join(', ') + '};\n})();\n';
}

const lib = fs.readFileSync(libIn, 'utf8'), worker = fs.readFileSync(workerIn, 'utf8');
const v = version(lib, libIn), vw = version(worker, workerIn);
if (v !== vw) throw new Error('versions differ: ' + v + ' (library) vs ' + vw + ' (worker)');
if (!/WorkerMessageHandler/.test(worker.slice(-2000))) throw new Error(workerIn + ': not the worker (no WorkerMessageHandler export)');

const outDir = path.join(root, 'vendor', 'pdfjs');
fs.mkdirSync(outDir, { recursive: true });
const outName = function (file) { return path.basename(file).replace(/\.m?js$/, '') + '_' + v + '.js'; };
const libOut = path.join(outDir, outName(libIn)), workerOut = path.join(outDir, outName(workerIn));
fs.writeFileSync(libOut, toClassic(lib, libIn, 'pdfjsLib'));
fs.writeFileSync(workerOut, toClassic(worker, workerIn, 'pdfjsWorker'));
const made = [libOut, workerOut];

// image decoders: base64 in classic scripts, registered in window.KelkPdfjsData
if (wasmIn) {
    const wasmOut = path.join(outDir, 'wasm');
    fs.mkdirSync(wasmOut, { recursive: true });
    ['openjpeg.wasm', 'jbig2.wasm'].forEach(function (f) {
        const src = path.join(wasmIn, f);
        if (!fs.existsSync(src)) { console.warn('  (no ' + f + ' in ' + wasmIn + ')'); return; }
        const out = path.join(wasmOut, f + '.js');
        fs.writeFileSync(out, '/* PDF.js ' + v + ' — ' + f + ' (license: LICENSE_* in this folder), base64 by tools/build-pdfjs.js */\n' +
            '(globalThis.KelkPdfjsData = globalThis.KelkPdfjsData || {})[' + JSON.stringify(f) + '] =\n' +
            JSON.stringify(fs.readFileSync(src).toString('base64')) + ';\n');
        made.push(out);
    });
    fs.readdirSync(wasmIn).filter(function (f) { return /^LICENSE_/.test(f) && !/QCMS|QUICKJS/i.test(f); }).forEach(function (f) {
        fs.copyFileSync(path.join(wasmIn, f), path.join(wasmOut, f));
    });
}
console.log('PDF.js ' + v + ' →\n  ' + made.map(function (f) { return path.relative(root, f); }).join('\n  ') +
    '\nNow set the file names in scripts/config.js (libs.pdfjs) and the sources comment in index.html.');
