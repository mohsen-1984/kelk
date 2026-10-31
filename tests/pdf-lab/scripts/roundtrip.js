// Kelk's own round trip (tests/builder-suite.html): md → PdfBuilder → PdfImporter → words recall/order per case
const { chromium } = require('./env.js').req('playwright');
(async () => {
  const root = process.argv[2] || require('./env.js').KELK;
  const b = await chromium.launch(); const page = await b.newPage();
  page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 200)));
  await page.goto('file://' + root + '/tests/builder-suite.html');
  await page.click('#run');
  await page.waitForFunction(() => window.__roundTrip && window.__roundTrip.length >= (window.CORPUS ? CORPUS.length : 1) && /passed/.test(document.querySelector('#sum').textContent), null, { timeout: 600000, polling: 1000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({ rt: window.__roundTrip || [], sum: document.querySelector('#sum').textContent }));
  console.log(r.sum);
  r.rt.forEach((x) => console.log(x.name.padEnd(28), (x.recall * 100).toFixed(1).padStart(6), (x.order * 100).toFixed(1).padStart(6), x.n));
  await b.close();
})();
