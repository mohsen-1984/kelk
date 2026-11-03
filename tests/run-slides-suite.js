/**
 * Run tests/slides-suite.html headless (Node + Playwright) and print each case's result.
 *   node tests/run-slides-suite.js        exit code 1 when a case fails
 */
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
(async () => {
    const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + path.join(__dirname, 'slides-suite.html') + '?run');
    await page.waitForFunction(() => window.SLIDES_RESULT, null, { timeout: 300000 });
    const rows = await page.$$eval('#out tbody tr', trs => trs.map(tr => Array.from(tr.cells).map(td => td.innerText.replace(/\s+/g, ' ').trim())));
    rows.forEach(r => console.log(r.join(' | ')));
    const res = await page.evaluate(() => window.SLIDES_RESULT);
    console.log(`\n${res.ok} passed, ${res.fail} failed`);
    if (errors.length) console.log('page errors:\n' + errors.join('\n'));
    await browser.close();
    process.exit(res.fail ? 1 : 0);
})();
