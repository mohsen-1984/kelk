/**
 * P1.4 screenshot review: index.html from file:// in Chromium (Playwright, `npm ci`), in fa / en / ar, light and
 * dark. For each run it records
 *   - <html lang dir data-theme> at the moment <body> is created (before anything can paint; a MutationObserver
 *     installed before the page's scripts) and at the first animation frame,
 *   - in the Arabic interface: Persian-only letters (پ چ ژ گ ک ی) anywhere in the interface's text (shown or
 *     not: closed settings groups, dialogs) or its title / aria-label / placeholder attributes, outside the
 *     editor and the preview (the document),
 *   - the {date} of an RTL custom header in an HTML export,
 * and saves a 1280×800 PNG beside this file (<lang>-<theme>.png, settings pane open): ar light and dark, fa and
 * en light.
 * Run from the repository root:  node docs/reports/P1.4/screenshots.js
 */
'use strict';
// the functions passed to page.evaluate / addInitScript run in the page:
/* global window, document, NodeFilter, MutationObserver, requestAnimationFrame */

const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const URL = pathToFileURL(path.join(ROOT, 'index.html')).href;

const PROBE = function () {
    const at = function () {
        const r = document.documentElement;
        return { lang: r.lang, dir: r.dir, theme: r.getAttribute('data-theme') };
    };
    window.__probe = {};
    new MutationObserver(function (list, obs) {
        if (document.body && !window.__probe.body) {
            window.__probe.body = at();
            obs.disconnect();
        }
    }).observe(document, { childList: true, subtree: true });
    requestAnimationFrame(function () {
        window.__probe.frame = at();
    });
};

/** Persian-only letters in the interface's text and labels (not the editor's text, not the preview's document). */
const PERSIAN_IN_UI = function () {
    const re = /[پچژگکی]/;
    const skip = function (el) {
        return el.closest('#editor, #preview, .preview-scroll, script, style, template, textarea');
    };
    const hits = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
        const p = n.parentElement;
        if (!p || skip(p)) continue; // hidden text too: closed settings groups, the dialogs
        if (re.test(n.nodeValue)) hits.push(n.nodeValue.trim().slice(0, 60));
    }
    document.querySelectorAll('[title], [aria-label], [placeholder]').forEach(function (el) {
        if (skip(el)) return;
        ['title', 'aria-label', 'placeholder'].forEach(function (a) {
            const v = el.getAttribute(a);
            if (v && re.test(v)) hits.push(a + ': ' + v.slice(0, 60));
        });
    });
    if (re.test(document.title)) hits.push('document.title: ' + document.title);
    return hits;
};

(async function () {
    const browser = await chromium.launch();
    const out = [];
    for (const lang of ['ar', 'fa', 'en']) {
        for (const theme of ['light', 'dark']) {
            const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
            const page = await ctx.newPage();
            const errors = [];
            page.on('pageerror', function (e) {
                errors.push(e.message);
            });
            // the stored page settings, as a returning user has them (written before any script of the page runs)
            await page.addInitScript(function (u) {
                if (!sessionStorage.getItem('seeded')) {
                    localStorage.clear();
                    localStorage.setItem('kelk.ui', JSON.stringify(u));
                    sessionStorage.setItem('seeded', '1');
                }
            }, { lang: lang, theme: theme === 'dark' ? 'dark' : '', paneOpen: true });
            await page.addInitScript(PROBE);
            await page.goto(URL, { waitUntil: 'load' });
            await page.waitForTimeout(1500); // the sample document and its formulas
            const probe = await page.evaluate(function () {
                return window.__probe;
            });
            const now = await page.evaluate(function () {
                const r = document.documentElement;
                return { lang: r.lang, dir: r.dir, theme: r.getAttribute('data-theme'), title: document.title,
                         size: document.getElementById('st-size').textContent };
            });
            const persian = lang === 'ar' ? await page.evaluate(PERSIAN_IN_UI) : null;
            const date = await page.evaluate(async function () {
                const K = window.Kelk;
                K.store.set('headerFooter.mode', 'custom');
                K.store.set('headerFooter.direction', 'rtl');
                K.store.set('headerFooter.header', '<p>DATE[{date}]</p>');
                const html = await K.exporter._htmlPage();
                const m = /DATE\[([^\]]*)\]/.exec(html);
                return m ? m[1] : null;
            });
            // pictures: Arabic in both themes, Persian and English light for comparison (the rest is measured only)
            const file = lang === 'ar' || theme === 'light' ? lang + '-' + theme + '.png' : null;
            if (file) {
                await page.reload({ waitUntil: 'load' });
                await page.waitForTimeout(1500);
                await page.screenshot({ path: path.join(__dirname, file) });
            }
            out.push({ lang, theme, probe, now, persian, date, errors, file });
            await ctx.close();
        }
    }
    await browser.close();
    console.log(JSON.stringify(out, null, 1));
})().catch(function (e) {
    console.error(e);
    process.exitCode = 1;
});
