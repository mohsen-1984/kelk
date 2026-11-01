// corpus/overlay.md as a web app prints it (Chromium): the page in a framed card, its text drawn twice (a second
// layer laid exactly over the first, as Opera's PDF of a web app), and a paragraph covered by an opaque panel drawn
// after it. The Markdown that must come back is corpus/overlay.md: the visible text, each word once.
// And corpus/banner.md: a card that is one link as a whole (a news card), and a cookie banner laid over the card's
// lower part with its own text and its own link — the banner's text must not take the card's link (a real page
// printed from a browser gave every line and button of its banner the card's address).
//   node scripts/make-overlay.js        → pdf/chrome-layers--overlay.pdf, pdf/chrome-layers--banner.pdf
const { pdfPath } = require('./env.js');
const fs = require('fs'), path = require('path');
const { chromium } = require('./env.js').req('playwright');
const KELK = require('./env.js').KELK, LAB = path.join(__dirname, '..');
const marked = require(KELK + '/vendor/marked.umd.min_18.0.14.js');
(async () => {
  const body = marked.parse(fs.readFileSync(path.join(LAB, 'corpus', 'overlay.md'), 'utf8'))
    .replace('<h2>What the reader sees</h2>', '<p class="hidden">A covered paragraph the reader cannot see: it must not come back.</p><div class="panel"></div><h2>What the reader sees</h2>');
  const css = `body{margin:0;font:12pt/1.5 "Liberation Sans",sans-serif}
    .card{position:relative;margin:24px;padding:24px 32px;border:1px solid #333;border-radius:10px;background:#fff}
    .layer{position:absolute;left:32px;top:24px;right:32px;pointer-events:none}
    .hidden{margin:0;height:3em} .panel{position:relative;margin-top:-3em;height:3em;background:#ffffff;z-index:2}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${css}</style></head><body>
    <div class="card"><div class="main">${body}</div><div class="layer" aria-hidden="true">${body}</div></div></body></html>`;
  const browser = await chromium.launch(), page = await browser.newPage();
  await page.setContent(html);
  await page.pdf({ path: pdfPath('chrome-layers--overlay.pdf'), format: 'A4', printBackground: true });
  const b = fs.readFileSync(path.join(LAB, 'corpus', 'banner.md'), 'utf8').split('\n').filter((l) => l.trim());
  const link = (t) => t.replace(/\[([^\]]+)\]\(([^)]+)\)/, '<a href="$2">$1</a>');
  const card = b[1].match(/^\[(.+)\]\((.+)\)$/);
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
    body{margin:40px;font:12pt/1.5 "Liberation Sans",sans-serif;color:#222} a{color:inherit}
    .card{display:block;position:relative;height:330px;padding:20px 24px;border-radius:14px;background:#f1efe8;text-decoration:none}
    .banner{position:absolute;left:250px;top:250px;width:380px;padding:16px 20px;border-radius:12px;background:#1f1f1f;color:#f4f4f4;font-size:10pt}
    .banner a{text-decoration:underline} .btn{display:inline-block;margin-top:8px;padding:4px 14px;border-radius:6px;background:#d97757}
  </style></head><body><h1>${b[0].slice(2)}</h1><a class="card" href="${card[2]}">${card[1]}</a>
    <div class="banner"><h2 style="margin:0;font-size:10pt">${b[2].slice(3)}</h2><p style="margin:6px 0">${link(b[3])}</p><span class="btn">${b[4]}</span></div></body></html>`);
  await page.pdf({ path: pdfPath('chrome-layers--banner.pdf'), format: 'A4', printBackground: true });
  await browser.close();
  console.log('pdf/chrome-layers--overlay.pdf, pdf/chrome-layers--banner.pdf');
})();
