// The import settings that write the text out (PDFIMPORT.md «Numbers and letters on the way out»): checks of
// PdfImporter's _writeOut on glyph runs — digits, ٬ ٫ ٪ and ، inside numbers, ي/ك in a Persian document, and
// what must stay (an Arabic comma between words, code, either setting off). Exit code 1 on a failure.
//   node scripts/writeout.js
const { chromium } = require('./env.js').req('playwright');
const env = require('./env.js');
const cases = [
  // [text, options, persian document?, expected]
  ['۱۲٬۵۰۰ ریال', {}, true, '12,500 ریال'],
  ['٣٫١٤', {}, false, '3.14'],
  ['۲۵٪', {}, true, '25%'],
  ['٪۲۵', {}, true, '%25'],
  ['۱،۲۰۰', {}, true, '1,200'],
  ['سلام، دنیا', {}, true, 'سلام، دنیا'],                 // a comma between words stays
  ['ساعت ۱۰٫۳۰ و ۵۰٪', {}, true, 'ساعت 10.30 و 50%'],
  ['٬۵', {}, true, '٬5'],                                 // a separator not between digits stays
  ['۱۲٬۵۰۰', { asciiNumbers: false }, true, '۱۲٬۵۰۰'],
  ['كتاب يك', {}, true, 'کتاب یک'],
  ['كتاب يك', {}, false, 'كتاب يك'],                      // an Arabic document keeps its letters
  ['كتاب يك', { persianLetters: false }, true, 'كتاب يك'],
  ['مصطفى', {}, true, 'مصطفی'],
];
(async () => {
  const b = await chromium.launch(), page = await b.newPage();
  await page.goto(env.lab);
  const out = await page.evaluate((cases) => cases.map(([t, o, fa]) => {
    const imp = PdfImporter.create(Object.assign({ images: 'drop' }, o)); imp._persianDoc = fa;
    const gs = Array.from(t).map((ch) => ({ ch: ch, space: ch === ' ' }));
    return imp._writeOut(gs).map((g) => g.ch).join('');
  }), cases);
  await b.close();
  let bad = 0;
  cases.forEach((c, i) => { const ok = out[i] === c[3]; if (!ok) bad++; console.log((ok ? 'ok   ' : 'FAIL ') + JSON.stringify(c[0]) + ' ' + JSON.stringify(c[1]) + (c[2] ? ' fa' : '') + ' → ' + JSON.stringify(out[i]) + (ok ? '' : ' (want ' + JSON.stringify(c[3]) + ')')); });
  console.log(bad ? bad + ' failed' : 'all ' + cases.length + ' passed');
  process.exit(bad ? 1 : 0);
})();
