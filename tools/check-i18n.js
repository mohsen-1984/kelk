/**
 * Check the interface strings of scripts/i18n.js (fa / en / ar) against their use.
 * Run with Node (CI runs it too):  node tools/check-i18n.js   (npm run check:i18n)
 *
 * Reports, one line each:
 *   MISSING      a key one language has and another lacks, or a key the page uses that no language has
 *   UNUSED       a key no code and no markup uses
 *   PLACEHOLDER  a key whose {0} {1} … differ between the languages (a translation dropped or added one)
 *   NONLITERAL   a `.t(…)` whose key the checker cannot read (a variable, an expression) outside the allow-list
 * Exit 0 when there is nothing to report, 1 otherwise, 2 when the tables cannot be read.
 *
 * Uses — comments never count (JS // and block comments, HTML <!-- -->):
 *   index.html   data-i18n="key" and data-i18n-attr="attr:key;…"
 *   scripts/*.js the first argument of every `.t(…)` (K.i18n.t, self.t, this.t), which must be a key written as
 *                a literal: 'key', "key", `key` (a template without ${}), or `condition ? 'a' : 'b'` (two keys).
 *                Anything else is NONLITERAL, unless the file and argument are in DYNAMIC below.
 * DYNAMIC: the few places that compute a key on purpose. A file listed with a prefix may compute keys of that
 * prefix; such a key counts as used only where it is written in full as a string in that file (so a table of
 * full keys, not a suffix that happens to appear somewhere, keeps it alive).
 * Option: --root <dir>  check another copy of the tree (the unit tests use it).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DYNAMIC = [
    // PdfImporter's errors → a toast: PDF_ERRORS holds each key in full
    { file: 'scripts/importer.js', prefix: 'pdf_' },
    // PptxBuilder's warnings → the slides pane: WARN_KEYS holds each key in full
    { file: 'scripts/slides.js', prefix: 'sw_' },
    // the PowerPoint export's steps (slides.js blob): pptx_ + the step's name
    { file: 'scripts/slides.js', prefix: 'pptx_' },
    // the import report: its tables hold each note / flag (pdf_) and mode / why / label (rep_) key in full
    { file: 'scripts/report.js', prefix: 'pdf_' },
    { file: 'scripts/report.js', prefix: 'rep_' },
    { file: 'scripts/report.js', prefix: 'sc_' },
    // Kelk.i18n.apply(): the markup's own keys, checked above from index.html
    { file: 'scripts/i18n.js', arg: "el.getAttribute('data-i18n')" },
    { file: 'scripts/i18n.js', arg: 'kv[1].trim()' }
];

const argRoot = process.argv.indexOf('--root');
const root = argRoot > 0 ? path.resolve(process.argv[argRoot + 1]) : path.join(__dirname, '..');
const read = function (f) {
    return fs.readFileSync(path.join(root, f), 'utf8');
};

/** STRINGS of scripts/i18n.js, run in a sandbox with an empty window. */
function tables() {
    const sandbox = { window: {} };
    vm.runInNewContext(read('scripts/i18n.js'), sandbox, { filename: 'scripts/i18n.js' });
    const i18n = sandbox.window.Kelk && sandbox.window.Kelk.i18n;
    if (!i18n || !i18n._strings) throw new Error('scripts/i18n.js: Kelk.i18n._strings not found');
    return i18n._strings;
}

/**
 * A light JavaScript scanner: `code` is the source with comments and the insides of strings, templates and
 * regular expressions blanked (same length, line breaks kept), so brackets and `.t(` are only ever code;
 * `strings` are the string and template literals { value, start, end, subst (a template with ${}) }.
 */
function scan(src) {
    const out = src.split(''), strings = [];
    const blank = function (a, b) {
        for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' ';
    };
    let prev = '', word = '';
    let i = 0;
    while (i < src.length) {
        const c = src[i], d = src[i + 1];
        if (c === '/' && d === '/') {
            const e = src.indexOf('\n', i);
            const end = e < 0 ? src.length : e;
            blank(i, end);
            i = end;
        } else if (c === '/' && d === '*') {
            const e = src.indexOf('*/', i + 2);
            const end = e < 0 ? src.length : e + 2;
            blank(i, end);
            i = end;
        } else if (c === "'" || c === '"' || c === '`') {
            let j = i + 1, subst = false, depth = 0;
            for (; j < src.length; j++) {
                const x = src[j];
                if (x === '\\') { j++; continue; }
                if (c === '`') {
                    if (depth === 0 && x === '$' && src[j + 1] === '{') { subst = true; depth = 1; j++; continue; }
                    if (depth > 0) { if (x === '{') depth++; else if (x === '}') depth--; continue; }
                }
                if (x === c) break;
                if (x === '\n' && c !== '`') break;
            }
            const raw = src.slice(i + 1, j);
            strings.push({ value: raw.replace(/\\(.)/g, '$1'), start: i, end: j + 1, subst: subst });
            blank(i + 1, j);
            i = j + 1;
            prev = 'S'; word = '';
        } else if (c === '/' && (prev === '' || '(,=:[!&|?{};+-*%<>~^'.indexOf(prev) >= 0 ||
                /^(return|typeof|case|in|of|delete|void|throw|new|else)$/.test(word))) {
            // a regular expression literal
            let j = i + 1, cls = false;
            for (; j < src.length && src[j] !== '\n'; j++) {
                const x = src[j];
                if (x === '\\') { j++; continue; }
                if (x === '[') cls = true;
                else if (x === ']') cls = false;
                else if (x === '/' && !cls) break;
            }
            blank(i + 1, j);
            i = j + 1;
            prev = 'R'; word = '';
        } else {
            if (/\s/.test(c)) { i++; continue; }
            if (/[A-Za-z0-9_$]/.test(c)) { word = /[A-Za-z0-9_$]/.test(prev) ? word + c : c; } else word = '';
            prev = c;
            i++;
        }
    }
    return { code: out.join(''), strings: strings };
}

/** The keys of each `.t(` call's first argument, and the arguments that are not literal keys. */
function calls(src) {
    const s = scan(src), code = s.code;
    const keys = [], dynamic = [];
    const re = /\.t\(/g;
    while (re.exec(code)) {
        const a = re.lastIndex;
        let i = a, depth = 0;
        for (; i < code.length; i++) {
            const c = code[i];
            if (c === '(' || c === '[' || c === '{') depth++;
            else if (c === ')' || c === ']' || c === '}') {
                if (depth === 0) break;
                depth--;
            } else if (c === ',' && depth === 0) break;
        }
        const toks = s.strings.filter(function (t) {
            return t.start >= a && t.end <= i;
        });
        // the argument's shape: each literal one mark (\u0001; a template with ${} is not a literal: \u0002)
        let shape = '', at = a;
        toks.forEach(function (t) {
            shape += code.slice(at, t.start) + (t.subst ? '\u0002' : '\u0001');
            at = t.end;
        });
        shape += code.slice(at, i);
        const lits = toks.filter(function (t) {
            return !t.subst;
        });
        // results: the whole argument, or the two branches of a conditional at depth 0
        let results = [shape];
        let q = -1, colon = -1;
        for (let k = 0, dd = 0; k < shape.length; k++) {
            const c = shape[k];
            if (c === '(' || c === '[' || c === '{') dd++;
            else if (c === ')' || c === ']' || c === '}') dd--;
            else if (dd === 0 && c === '?' && shape[k + 1] !== '.' && shape[k + 1] !== '?' && shape[k - 1] !== '?' && q < 0) q = k;
            else if (dd === 0 && c === ':' && q >= 0 && colon < 0) colon = k;
        }
        if (q >= 0 && colon > q) results = [shape.slice(q + 1, colon), shape.slice(colon + 1)];
        const ok = results.every(function (r) {
            return r.trim() === '\u0001';
        });
        const line = src.slice(0, a).split('\n').length;
        if (ok) {
            // the literals of the results are the last ones (the condition's literals come first)
            const n = results.length;
            lits.slice(lits.length - n).forEach(function (t) {
                keys.push({ key: t.value, line: line });
            });
        } else {
            dynamic.push({ arg: src.slice(a, i).trim(), line: line });
        }
    }
    return { keys: keys, dynamic: dynamic, strings: s.strings };
}

function main() {
    let S;
    try {
        S = tables();
    } catch (e) {
        console.log('ERROR     ' + e.message);
        return 2;
    }
    const langs = Object.keys(S);
    const all = new Set();
    langs.forEach(function (l) {
        Object.keys(S[l]).forEach(function (k) {
            all.add(k);
        });
    });
    const has = function (l, k) {
        return Object.prototype.hasOwnProperty.call(S[l], k) && S[l][k] != null;
    };

    // ---- uses: index.html markup, the scripts' t() calls ----
    const lines = [];
    const used = new Map(); // key → where
    const use = function (k, where) {
        if (!used.has(k)) used.set(k, where);
    };
    const html = read('index.html').replace(/<!--[\s\S]*?-->/g, '');
    let m;
    const reText = /\bdata-i18n="([^"]+)"/g;
    while ((m = reText.exec(html))) use(m[1].trim(), 'index.html');
    const reAttr = /\bdata-i18n-attr="([^"]+)"/g;
    while ((m = reAttr.exec(html))) {
        m[1].split(';').forEach(function (pair) {
            const kv = pair.split(':');
            if (kv.length === 2) use(kv[1].trim(), 'index.html');
        });
    }
    const dir = path.join(root, 'scripts');
    fs.readdirSync(dir)
        .filter(function (f) {
            return f.endsWith('.js');
        })
        .sort()
        .forEach(function (f) {
            const file = 'scripts/' + f;
            const c = calls(fs.readFileSync(path.join(dir, f), 'utf8'));
            c.keys.forEach(function (k) {
                use(k.key, file + ':' + k.line);
            });
            const prefixes = DYNAMIC.filter(function (d) {
                return d.file === file && d.prefix;
            });
            c.dynamic.forEach(function (d) {
                const allowed = prefixes.length || DYNAMIC.some(function (x) {
                    return x.file === file && x.arg === d.arg;
                });
                if (!allowed) lines.push('NONLITERAL   ' + file + ':' + d.line + ' t(' + d.arg + ') — write the key as a literal, or list it in DYNAMIC');
            });
            prefixes.forEach(function (p) {
                c.strings.forEach(function (t) {
                    if (!t.subst && t.value.startsWith(p.prefix) && all.has(t.value)) use(t.value, file + ' (' + p.prefix + '…)');
                });
            });
        });

    // ---- report ----
    Array.from(all)
        .sort()
        .forEach(function (k) {
            const lacking = langs.filter(function (l) {
                return !has(l, k);
            });
            if (lacking.length) lines.push('MISSING      ' + k + ' — not in ' + lacking.join(', '));
            if (!used.has(k)) lines.push('UNUSED       ' + k);
            const ph = {};
            langs.forEach(function (l) {
                if (has(l, k)) ph[l] = (String(S[l][k]).match(/\{\d+\}/g) || []).sort().join('');
            });
            const forms = Object.keys(ph).map(function (l) {
                return ph[l];
            });
            if (new Set(forms).size > 1) lines.push('PLACEHOLDER  ' + k + ' — ' + Object.keys(ph).map(function (l) {
                return l + ' ' + (ph[l] || '-');
            }).join(', '));
        });
    used.forEach(function (where, k) {
        if (!all.has(k)) lines.push('MISSING      ' + k + ' — used in ' + where + ', in no language');
    });

    lines.forEach(function (l) {
        console.log(l);
    });
    const count = function (w) {
        return lines.filter(function (l) {
            return l.startsWith(w);
        }).length;
    };
    console.log(
        'i18n: ' + all.size + ' keys × ' + langs.length + ' languages (' + langs.join(', ') + '), ' + used.size +
            ' used — ' + count('MISSING') + ' missing, ' + count('UNUSED') + ' unused, ' + count('PLACEHOLDER') +
            ' placeholder mismatches, ' + count('NONLITERAL') + ' non-literal keys'
    );
    return lines.length ? 1 : 0;
}

process.exitCode = main();
