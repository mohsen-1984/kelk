/**
 * Accessibility check of the app page (plan P2.4): axe-core (devDependency, `npm ci`) on index.html in Chromium
 * (the repository's pinned Playwright), in the fa, en and ar interfaces, light and dark theme — 6 runs.
 *
 *   node tools/check-a11y.js [--json <file>]        (npm run check:a11y)
 *
 * - The page is served by a static http server started here (Node `http`, a random local port), as GitHub Pages
 *   serves it; the interface language and theme are the stored page settings (localStorage "kelk.ui", written
 *   before any script of the page runs — as docs/reports/P1.4/screenshots.js does).
 * - axe is injected with page.evaluate(<axe source>): Playwright evaluates through the DevTools protocol, which the
 *   page's Content-Security-Policy (`script-src 'self'`) does not govern, so the page is checked under its real
 *   policy. (page.addScriptTag({content}) would be an inline <script>, refused by that policy; `bypassCSP: true`
 *   would work too, but would check a page that is not the one users get.)
 * - Rules: the WCAG 2.0 and 2.1 level A and AA tags (wcag2a, wcag2aa, wcag21a, wcag21aa). Scanned per run: the
 *   whole page with the settings pane open and every settings group (<details>) expanded — including the sample
 *   document in the preview — then each <dialog id> opened on its own (its nodes printed as "[#id] selector").
 * - Prints every violation per run: impact, rule id, the target selector of each node.
 * - Exit 1 when a violation of impact `serious` or `critical` is not in tools/a11y-allow.json. Each allow-list
 *   entry: { "rule": <axe rule id>, "selector": <a CSS selector the failing element matches — tested in the page
 *   with element.matches(), so it can name a kind of element rather than axe's one-off path — or "*" for every
 *   node of the rule>, "reason": …, "fixedIn": <plan phase> }. An entry that matches nothing is reported (stale),
 *   not an error.
 *   `minor` and `moderate` violations are printed and never fail the check.
 */
/* global window, document, axe -- the functions passed to the page run there */
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const MODULES = process.env.NODE_TOOLS || path.join(ROOT, 'node_modules');
const { chromium } = require(path.join(MODULES, 'playwright'));
const AXE_SOURCE = fs.readFileSync(path.join(MODULES, 'axe-core', 'axe.min.js'), 'utf8');
const AXE_VERSION = require(path.join(MODULES, 'axe-core', 'package.json')).version;
const ALLOW_FILE = path.join(__dirname, 'a11y-allow.json');

const LANGS = ['fa', 'en', 'ar'];
const THEMES = ['light', 'dark'];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const FAILING = { serious: true, critical: true };

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
    '.json': 'application/json',
    '.wasm': 'application/wasm'
};

function serve() {
    return new Promise(function (resolve) {
        const srv = http
            .createServer(function (req, res) {
                const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
                if (!p.startsWith(ROOT)) {
                    res.writeHead(403);
                    return res.end();
                }
                fs.readFile(p, function (err, data) {
                    if (err) {
                        res.writeHead(404);
                        return res.end();
                    }
                    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
                    res.end(data);
                });
            })
            .listen(0, '127.0.0.1', function () {
                resolve(srv);
            });
    });
}

/** One run: the page in a language and theme; the axe violations, one row per node. */
async function check(browser, url, lang, theme, allow) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', function (e) {
        errors.push(String(e).slice(0, 200));
    });
    await page.addInitScript(
        function (u) {
            if (!sessionStorage.getItem('seeded')) {
                localStorage.clear();
                localStorage.setItem('kelk.ui', JSON.stringify(u));
                sessionStorage.setItem('seeded', '1');
            }
        },
        { lang: lang, theme: theme === 'dark' ? 'dark' : '', paneOpen: true }
    );
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(
        function () {
            return window.Kelk && window.Kelk.editor && document.getElementById('preview');
        },
        null,
        { timeout: 30000 }
    );
    await page.waitForTimeout(1500); // the sample document, its formulas and the icons
    const state = await page.evaluate(function () {
        const r = document.documentElement;
        return { lang: r.lang, dir: r.dir, theme: r.getAttribute('data-theme') || 'light' };
    });
    await page.evaluate(AXE_SOURCE);
    // the page with every settings group expanded, then each dialog open on its own (a node of a dialog is printed
    // as "[#id] selector")
    await page.evaluate(function () {
        document.querySelectorAll('details').forEach(function (d) {
            d.open = true;
        });
    });
    const dialogs = await page.$$eval('dialog[id]', function (ds) {
        return ds.map(function (d) {
            return d.id;
        });
    });
    const violations = [];
    for (const scope of [null].concat(dialogs)) {
        const found = await page.evaluate(
            function (a) {
                const d = a.scope ? document.getElementById(a.scope) : null;
                if (d) d.showModal();
                return axe
                    .run(d || document, { runOnly: { type: 'tag', values: a.tags }, resultTypes: ['violations'] })
                    .then(function (r) {
                        if (d) d.close();
                        return r.violations.map(function (v) {
                            return {
                                rule: v.id,
                                impact: v.impact,
                                help: v.help,
                                nodes: v.nodes.map(function (n) {
                                    // the allow-list entries of this rule whose selector the element matches
                                    let el = null;
                                    try {
                                        el = n.target.length === 1 ? document.querySelector(n.target[0]) : null;
                                    } catch (e) {
                                        /* a selector the page cannot parse */
                                    }
                                    const allowedBy = [];
                                    a.allow.forEach(function (x, i) {
                                        if (x.rule !== v.id) return;
                                        try {
                                            if (x.selector === '*' || (el && el.matches(x.selector))) allowedBy.push(i);
                                        } catch (e) {
                                            /* an invalid selector in the allow-list matches nothing */
                                        }
                                    });
                                    return {
                                        allowedBy: allowedBy,
                                        target: (a.scope ? '[#' + a.scope + '] ' : '') + n.target.join(' '),
                                        impact: n.impact || v.impact,
                                        summary: (n.failureSummary || '').slice(0, 300)
                                    };
                                })
                            };
                        });
                    });
            },
            { scope: scope, tags: TAGS, allow: allow }
        );
        violations.push.apply(violations, found);
    }
    await ctx.close();
    return { lang: lang, theme: theme, state: state, errors: errors, violations: violations };
}

(async function () {
    const allow = JSON.parse(fs.readFileSync(ALLOW_FILE, 'utf8')).allow || [];
    const used = new Set();
    const jsonAt = process.argv.indexOf('--json');
    const srv = await serve();
    const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
    const browser = await chromium.launch();
    const runs = [];
    let failing = 0;
    console.log('axe-core ' + AXE_VERSION + ', tags ' + TAGS.join(' ') + ', ' + url);
    try {
        for (const lang of LANGS) {
            for (const theme of THEMES) {
                const r = await check(browser, url, lang, theme, allow);
                runs.push(r);
                const count = { critical: 0, serious: 0, moderate: 0, minor: 0 };
                const lines = [];
                r.violations.forEach(function (v) {
                    v.nodes.forEach(function (n) {
                        count[n.impact] = (count[n.impact] || 0) + 1;
                        const a = n.allowedBy.length ? allow[n.allowedBy[0]] : null;
                        if (a) used.add(a);
                        const fails = FAILING[n.impact] && !a;
                        if (fails) failing++;
                        n.allowed = !!a;
                        lines.push(
                            '    ' +
                                (fails ? 'FAIL ' : a ? 'allow' : 'info ') +
                                ' ' +
                                n.impact.padEnd(8) +
                                ' ' +
                                v.rule.padEnd(28) +
                                ' ' +
                                n.target
                        );
                    });
                });
                console.log(
                    '\n' +
                        lang +
                        ' ' +
                        theme +
                        ' (html lang=' +
                        r.state.lang +
                        ' dir=' +
                        r.state.dir +
                        ' theme=' +
                        r.state.theme +
                        '): ' +
                        Object.keys(count)
                            .map(function (k) {
                                return k + ' ' + count[k];
                            })
                            .join(', ') +
                        (r.errors.length ? '; page errors: ' + r.errors.join(' | ') : '')
                );
                lines.forEach(function (l) {
                    console.log(l);
                });
                if (r.state.lang !== lang) {
                    console.log('    FAIL the page did not open in ' + lang);
                    failing++;
                }
            }
        }
    } finally {
        await browser.close();
        srv.close();
    }
    allow.forEach(function (a) {
        if (!used.has(a)) console.log('\nstale allow-list entry (matched nothing): ' + a.rule + ' ' + a.selector);
    });
    if (jsonAt > 0) fs.writeFileSync(process.argv[jsonAt + 1], JSON.stringify(runs, null, 1));
    console.log(
        '\n' +
            (failing
                ? 'FAIL: ' + failing + ' serious/critical node(s) not in tools/a11y-allow.json'
                : 'ok: no serious/critical violation outside tools/a11y-allow.json')
    );
    if (failing) process.exitCode = 1;
})().catch(function (e) {
    console.error(e);
    process.exit(1);
});
