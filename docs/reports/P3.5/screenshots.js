/**
 * P3.5 screenshot review: the PDF import report panel (#import-report) in index.html from file:// in Chromium
 * (Playwright, `npm ci`; or NODE_TOOLS = a node_modules outside the repo), opened by Kelk.ui.report with
 * tools/report-sample.js. Saves beside this file, the settings pane closed:
 *   fa-light.png, en-light.png, fa-dark.png   1280×800
 *   fa-phone.png, en-phone.png               390×844 (one column)
 *   fa-typical.png                           1280×800, a typical report (four findings, four pages), unscrolled
 *   en-table.png                             1280×800, the sample scrolled to its table (the "not read" page)
 * and prints, per shot, what the layout measures: the panel's direction, whether its table's first column (Page)
 * stands at the start side (right in RTL, left in LTR), the close button at the end side, any horizontal
 * overflow of the panel or the page, whether the editor's foot (its buttons) is still inside the editor panel, how
 * many findings and page rows the report's body shows unscrolled, and whether the safe-mode hint is visible.
 * Run from the repository root:  node docs/reports/P3.5/screenshots.js
 */
'use strict';
/* global window, document, getComputedStyle -- the functions passed to the page run there */

const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const MODULES = process.env.NODE_TOOLS || path.join(ROOT, 'node_modules');
const { chromium } = require(path.join(MODULES, 'playwright'));
const SAMPLE = require(path.join(ROOT, 'tools', 'report-sample.js'));
const URL = pathToFileURL(path.join(ROOT, 'index.html')).href;

const SHOTS = [
    { file: 'fa-light.png', lang: 'fa', theme: '', w: 1280, h: 800 },
    { file: 'en-light.png', lang: 'en', theme: '', w: 1280, h: 800 },
    { file: 'fa-dark.png', lang: 'fa', theme: 'dark', w: 1280, h: 800 },
    { file: 'fa-phone.png', lang: 'fa', theme: '', w: 390, h: 844 },
    { file: 'en-phone.png', lang: 'en', theme: '', w: 390, h: 844 },
    // a typical hard PDF (four findings, four pages): all of it without scrolling at 1280×800
    { file: 'fa-typical.png', lang: 'fa', theme: '', w: 1280, h: 800, report: 'typical' },
    // the sample scrolled to its table: the page that could not be read shows as "not read"
    { file: 'en-table.png', lang: 'en', theme: '', w: 1280, h: 800, scroll: true }
];
const TYPICAL = {
    mode: 'auto',
    summary: { pages: 10, full: 6, simplified: 3, textContent: 1, ocr: 0, failed: 0, conf: 0.7 },
    pages: [
        { page: 2, mode: 'simplified', conf: 0.4, why: ['lowConf', 'suspectSpaces'] },
        { page: 3, mode: 'simplified', conf: 0.45, why: ['suspectSpaces'] },
        { page: 5, mode: 'simplified', conf: 0.5, why: ['lostGlyphs'] },
        { page: 8, mode: 'textContent', conf: 0.3, why: ['layoutFailed'] }
    ],
    flags: [{ code: 'suspectSpaces', pages: [2, 3] }, { code: 'lostGlyphs', pages: [5] }],
    notes: [{ code: 'pageSimplified', pages: [2, 3, 5] }, { code: 'pageTextOnly', pages: [8] }]
};

(async function () {
    const browser = await chromium.launch();
    try {
        for (const s of SHOTS) {
            const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h } });
            const page = await ctx.newPage();
            await page.addInitScript(function (u) {
                localStorage.clear();
                localStorage.setItem('kelk.ui', JSON.stringify(u));
                localStorage.setItem('kelk.content', '# گزارش\n\nمتن واردشده از PDF. Imported text.');
            }, { lang: s.lang, theme: s.theme, paneOpen: false, sampleSeen: true });
            await page.goto(URL, { waitUntil: 'load' });
            await page.waitForFunction(function () {
                return window.Kelk && window.Kelk.ui && window.Kelk.ui.report;
            });
            await page.evaluate(function () {
                return document.fonts && document.fonts.ready;
            });
            const m = await page.evaluate(function (a) {
                const sample = a.sample;
                window.Kelk.ui.report(sample, { name: 'سند-نمونه.pdf', onSafe: function () {} });
                if (a.scroll) {
                    const body = document.getElementById('import-report-body');
                    body.scrollTop = body.scrollHeight;
                }
                const box = document.getElementById('import-report');
                const b = box.getBoundingClientRect();
                const firstTh = box.querySelector('.report-pages thead th').getBoundingClientRect();
                const lastTh = box.querySelector('.report-pages thead th:last-child').getBoundingClientRect();
                const close = document.getElementById('import-report-close').getBoundingClientRect();
                const title = document.getElementById('import-report-title').getBoundingClientRect();
                const rtl = getComputedStyle(box).direction === 'rtl';
                return {
                    dir: getComputedStyle(box).direction,
                    pageColumnAtStart: rtl ? firstTh.left > lastTh.left : firstTh.left < lastTh.left,
                    closeAtEnd: rtl ? close.left < title.left : close.left > title.left,
                    panelOverflowX: box.scrollWidth > box.clientWidth + 1,
                    bodyOverflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
                    // the editor's foot (its MD button) still inside the editor panel below the report
                    editorFootShown:
                        document.getElementById('btn-md').getBoundingClientRect().bottom <=
                        document.querySelector('.editor-panel').getBoundingClientRect().bottom + 1,
                    // what the report's body shows without scrolling, of all it has (findings, page rows)
                    shown: (function () {
                        const bb = document.getElementById('import-report-body').getBoundingClientRect();
                        const vis = function (e) {
                            const r = e.getBoundingClientRect();
                            return r.top >= bb.top - 1 && r.bottom <= bb.bottom + 1;
                        };
                        const fs = Array.from(box.querySelectorAll('.report-findings li'));
                        const rs = Array.from(box.querySelectorAll('.report-pages tbody tr'));
                        return 'findings ' + fs.filter(vis).length + '/' + fs.length + ', rows ' + rs.filter(vis).length + '/' + rs.length;
                    })(),
                    safeHintShown: !document.getElementById('report-safe-hint').hidden,
                    panel: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]
                };
            }, { sample: s.report === 'typical' ? TYPICAL : SAMPLE, scroll: !!s.scroll });
            await page.waitForTimeout(300);
            await page.screenshot({ path: path.join(__dirname, s.file) });
            console.log(s.file + ' ' + JSON.stringify(m));
            await ctx.close();
        }
    } finally {
        await browser.close();
    }
})().catch(function (e) {
    console.error(e);
    process.exit(1);
});
