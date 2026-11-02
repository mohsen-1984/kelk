/**
 * Check the interface strings of scripts/i18n.js (fa / en / ar) against their use.
 * Run with Node (CI runs it too):  node tools/check-i18n.js   (npm run check:i18n)
 *
 * Reports, one line each:
 *   MISSING      a key one language has and another lacks, or a key the page uses that no language has
 *   UNUSED       a key no code and no markup uses
 *   PLACEHOLDER  a key whose {0} {1} … differ between the languages (a translation dropped or added one)
 * Exit 0 when there is nothing to report, 1 otherwise, 2 when the tables cannot be read.
 *
 * Uses: index.html's data-i18n="key" and data-i18n-attr="attr:key;…", and every `.t(…)` call in scripts/*.js
 * (K.i18n.t, self.t, this.t): each string literal of the first argument is a key (`a ? 'x' : 'y'` names two).
 * A literal followed by `+` is a prefix (`t('pdf_' + n)`): a key with that prefix counts as used when the rest
 * of its name is a string literal of the same file (`n === 'noText'`) — so a prefix does not hide a dead key.
 * Option: --root <dir>  check another copy of the tree (the unit tests use it).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

/** The string literals of a piece of JavaScript, with their positions ('…', "…"; no template literals). */
function literals(src) {
    const out = [];
    const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g;
    let m;
    while ((m = re.exec(src))) out.push({ value: m[1] != null ? m[1] : m[2], start: m.index, end: re.lastIndex });
    return out;
}

/** The bracket depth at position `at` of a piece of JavaScript (strings skipped). */
function depthAt(src, at) {
    let depth = 0, quote = null;
    for (let i = 0; i < at; i++) {
        const c = src[i];
        if (quote) {
            if (c === '\\') i++;
            else if (c === quote) quote = null;
        } else if (c === "'" || c === '"') quote = c;
        else if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;
    }
    return depth;
}

/** The first argument of each `.t(` call: its keys and its prefixes. */
function callKeys(src) {
    const keys = [], prefixes = [];
    const re = /\.t\(/g;
    while (re.exec(src)) {
        // the first argument ends at a comma or the closing parenthesis at depth 0, outside strings
        let i = re.lastIndex, depth = 0, quote = null;
        for (; i < src.length; i++) {
            const c = src[i];
            if (quote) {
                if (c === '\\') i++;
                else if (c === quote) quote = null;
                continue;
            }
            if (c === "'" || c === '"') quote = c;
            else if (c === '(' || c === '[' || c === '{') depth++;
            else if (c === ')' || c === ']' || c === '}') {
                if (depth === 0) break;
                depth--;
            } else if (c === ',' && depth === 0) break;
        }
        const arg = src.slice(re.lastIndex, i);
        literals(arg).forEach(function (l) {
            const before = arg.slice(0, l.start), after = arg.slice(l.end);
            // not a key: inside a nested call or bracket (`t(el.getAttribute('data-i18n'))`), or an operand of a
            // comparison (`t(m === 'stack' ? …)`)
            if (depthAt(arg, l.start) > 0 || /[=!]==?\s*$/.test(before) || /^\s*[=!]==?/.test(after)) return;
            if (/^\s*\+/.test(after)) prefixes.push(l.value);
            else keys.push(l.value);
        });
    }
    return { keys: keys, prefixes: prefixes };
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

    // ---- uses: index.html markup, the scripts' t() calls ----
    const used = new Map(); // key → where
    const use = function (k, where) {
        if (!used.has(k)) used.set(k, where);
    };
    const html = read('index.html');
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
            const src = fs.readFileSync(path.join(dir, f), 'utf8');
            const c = callKeys(src);
            c.keys.forEach(function (k) {
                use(k, 'scripts/' + f);
            });
            if (!c.prefixes.length) return;
            const lits = new Set(
                literals(src).map(function (l) {
                    return l.value;
                })
            );
            c.prefixes.forEach(function (p) {
                all.forEach(function (k) {
                    if (k.startsWith(p) && lits.has(k.slice(p.length))) use(k, 'scripts/' + f + ' (' + p + '…)');
                });
            });
        });

    // ---- report ----
    const lines = [];
    Array.from(all)
        .sort()
        .forEach(function (k) {
            const lacking = langs.filter(function (l) {
                return S[l][k] == null;
            });
            if (lacking.length) lines.push('MISSING      ' + k + ' — not in ' + lacking.join(', '));
            if (!used.has(k)) lines.push('UNUSED       ' + k);
            const ph = langs
                .filter(function (l) {
                    return S[l][k] != null;
                })
                .map(function (l) {
                    return (String(S[l][k]).match(/\{\d+\}/g) || []).sort().join('');
                });
            if (new Set(ph).size > 1) lines.push('PLACEHOLDER  ' + k + ' — ' + langs.map(function (l, i) {
                return l + ' ' + (ph[i] || '-');
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
            ' placeholder mismatches'
    );
    return lines.length ? 1 : 0;
}

process.exitCode = main();
