/**
 * Startup size budget of the app page (lowered once the builders load on demand).
 *
 *   node tools/check-size.js [--budget <bytes>] [--root <dir>]        (npm run check:size)
 *
 * "Startup bytes" = the JavaScript and CSS the browser fetches and parses before the page is usable: every
 * <script src> and every <link rel="stylesheet"> of index.html (in <head> and <body>, outside HTML comments; async
 * or deferred ones too), plus any stylesheet those pull in with @import. Measured as the size of each file on disk
 * (the repository's LF checkout = the bytes GitHub Pages serves, before HTTP compression). MB = 1,000,000 bytes.
 * Not counted: what loads later on demand (Kelk.libs.need: pdf.js, the PDF importer — lib/PdfImporter.js and
 * lib/pdfimport/*.js, on demand —, MathJax, docx, mammoth, JSZip, the PDF fonts),
 * the web fonts the stylesheets name (@font-face is fetched only when text uses it), images, inline <script> /
 * <style> (none: the Content-Security-Policy refuses inline scripts) and index.html itself.
 * This is the definition behind the plan's "≈1.93 MB JS/CSS parsed at startup" (§2.2): measured this way the
 * review's commit 585b0fb gives 1,932,621 bytes.
 *
 * Prints the total (JS and CSS apart) and the 15 largest files; exit 1 when the total exceeds maxBytes of
 * tools/size-budget.json (or --budget), 2 when a file index.html names is missing.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BUDGET_FILE = path.join(__dirname, 'size-budget.json');

/** The value of attribute `name` in the attribute text of a tag ('' when absent). */
function attr(tag, name) {
    const m = new RegExp('\\s' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i').exec(tag);
    return m ? m[1] || m[2] || m[3] || '' : '';
}

/**
 * The startup files an HTML page names, in document order: { kind: 'js' | 'css', href } for each <script src> and
 * <link rel="stylesheet" href> outside comments. Remote and data: URLs are returned too (href as written).
 */
function startupFiles(html) {
    const text = String(html).replace(/<!--[\s\S]*?-->/g, '');
    const out = [];
    const re = /<(script|link)\b[^>]*>/gi;
    let m;
    while ((m = re.exec(text))) {
        const tag = m[0];
        if (m[1].toLowerCase() === 'script') {
            const src = attr(tag, 'src');
            if (src) out.push({ kind: 'js', href: src });
        } else if (/(^|\s)stylesheet(\s|$)/i.test(attr(tag, 'rel'))) {
            const href = attr(tag, 'href');
            if (href) out.push({ kind: 'css', href: href });
        }
    }
    return out;
}

/** The @import URLs of a stylesheet (comments ignored). */
function cssImports(css) {
    const text = String(css).replace(/\/\*[\s\S]*?\*\//g, '');
    const out = [];
    const re = /@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?[^;]*;/gi;
    let m;
    while ((m = re.exec(text))) out.push(m[1]);
    return out;
}

const isRemote = function (href) {
    return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href);
};

/** Every startup file of root/index.html with its size: { files: [{ kind, file, bytes }], missing, remote }. */
function measure(root) {
    const files = [];
    const missing = [];
    const remote = [];
    const seen = new Set();
    function add(kind, href, base) {
        if (isRemote(href)) return remote.push(href);
        const file = path.posix.normalize(path.posix.join(base, href.split(/[?#]/)[0]));
        if (seen.has(file)) return;
        seen.add(file);
        const abs = path.join(root, file);
        if (!fs.existsSync(abs)) return missing.push(file);
        files.push({ kind: kind, file: file, bytes: fs.statSync(abs).size });
        if (kind === 'css') {
            cssImports(fs.readFileSync(abs, 'utf8')).forEach(function (h) {
                add('css', h, path.posix.dirname(file));
            });
        }
    }
    startupFiles(fs.readFileSync(path.join(root, 'index.html'), 'utf8')).forEach(function (f) {
        add(f.kind, f.href, '');
    });
    return { files: files, missing: missing, remote: remote };
}

const sum = function (files, kind) {
    return files.reduce(function (s, f) {
        return s + (!kind || f.kind === kind ? f.bytes : 0);
    }, 0);
};
const mb = function (n) {
    return (n / 1e6).toFixed(3) + ' MB';
};
const num = function (n) {
    return n.toLocaleString('en-US');
};

function main(argv) {
    const opt = function (name) {
        const i = argv.indexOf(name);
        return i >= 0 ? argv[i + 1] : null;
    };
    const root = path.resolve(opt('--root') || path.join(__dirname, '..'));
    const budget = opt('--budget')
        ? Number(opt('--budget'))
        : JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8')).maxBytes;
    const r = measure(root);
    const total = sum(r.files);
    console.log(
        'startup JS + CSS: ' +
            num(total) +
            ' bytes (' +
            mb(total) +
            ') in ' +
            r.files.length +
            ' files — JS ' +
            num(sum(r.files, 'js')) +
            ', CSS ' +
            num(sum(r.files, 'css'))
    );
    console.log('largest:');
    r.files
        .slice()
        .sort(function (a, b) {
            return b.bytes - a.bytes;
        })
        .slice(0, 15)
        .forEach(function (f) {
            console.log('  ' + num(f.bytes).padStart(9) + '  ' + f.kind.padEnd(3) + '  ' + f.file);
        });
    r.remote.forEach(function (h) {
        console.log('not counted (remote): ' + h);
    });
    if (r.missing.length) {
        console.log('FAIL: missing file(s): ' + r.missing.join(', '));
        return 2;
    }
    if (!(budget > 0)) {
        console.log('FAIL: no budget (tools/size-budget.json maxBytes)');
        return 2;
    }
    if (total > budget) {
        console.log('FAIL: ' + num(total) + ' bytes > budget ' + num(budget) + ' (+' + num(total - budget) + ')');
        return 1;
    }
    console.log(
        'ok: within budget ' + num(budget) + ' bytes (' + mb(budget) + '), ' + num(budget - total) + ' to spare'
    );
    return 0;
}

module.exports = { startupFiles: startupFiles, cssImports: cssImports, measure: measure };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
