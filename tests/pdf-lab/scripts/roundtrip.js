// Kelk's own round trip (tests/builder-suite.html): md → PdfBuilder → PdfImporter → words recall/order per case.
// The page also checks direction, preview and the DOCX / DOC / PDF / HTML builders; every cell it marks red is
// listed. Exit 1 when a red cell is not in KNOWN, the run does not finish, or the page throws (CI); 0 otherwise.
//   node scripts/roundtrip.js [KELK folder]
const env = require('./env.js');
const { chromium } = env.req('playwright');
// red today, by case → column (the table's header): formula layout reads back out of order (recall 100%,
// order 84.4% < 85%). Remove a line once it passes; a new red cell fails the run.
const KNOWN = new Set(['latex-formulas → PDF → MD', 'latex-formulas-mathml → PDF → MD']);
(async () => {
  const root = process.argv[2] || env.KELK;
  const b = await chromium.launch(); const page = await b.newPage();
  const errors = [];
  page.on('pageerror', (e) => { errors.push(String(e).slice(0, 200)); console.log('pageerror', String(e).slice(0, 200)); });
  await page.goto(env.fileUrl(root + '/tests/builder-suite.html'));
  await page.click('#run');
  // done: one row per case, the last one complete (8 cells) and counted in #sum
  const want = await page.evaluate(() => CORPUS.length + Object.keys(window.KelkSamples || {}).length);
  const done = await page.waitForFunction((n) => {
    const rows = document.querySelectorAll('#out tbody tr'), last = rows[rows.length - 1];
    return rows.length >= n && last.children.length >= 8 && /passed/.test(document.querySelector('#sum').textContent);
  }, want, { timeout: 600000, polling: 1000 }).then(() => true, () => false);
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const head = [...document.querySelectorAll('#out thead th')].map((th) => th.textContent);
    const red = [];
    document.querySelectorAll('#out tbody tr').forEach((tr) => [...tr.children].forEach((td, i) => {
      if (td.className === 'err') red.push({ id: tr.children[0].textContent + ' → ' + head[i], text: td.textContent.slice(0, 160) });
    }));
    return { rt: window.__roundTrip || [], sum: document.querySelector('#sum').textContent, rows: document.querySelectorAll('#out tbody tr').length, red };
  });
  console.log(r.sum);
  r.rt.forEach((x) => console.log(x.name.padEnd(28), (x.recall * 100).toFixed(1).padStart(6), (x.order * 100).toFixed(1).padStart(6), x.n));
  const fresh = r.red.filter((x) => !KNOWN.has(x.id));
  r.red.forEach((x) => console.log(KNOWN.has(x.id) ? 'known' : 'FAIL ', x.id, '·', x.text));
  const gone = [...KNOWN].filter((k) => !r.red.some((x) => x.id === k));
  if (gone.length) console.log('passes now (remove from KNOWN):', gone.join(', '));
  if (!done) console.log('FAIL  the run did not finish:', r.rows, 'of', want, 'cases');
  if (!done || fresh.length || errors.length) { console.log('roundtrip: FAILED'); process.exitCode = 1; }
  else console.log('roundtrip: ok (' + r.red.length + ' known)');
  await b.close();
})().catch((e) => { console.error(e); process.exitCode = 1; process.exit(); });
