// Formulas through Kelk and back (round 27): every case of tests/math-cases.js (37 formulas, inline and display:
// arrows, mhchem, accents, fractions, matrices, environments …) in a paragraph of its own — inline ones between
// words, display ones alone, both in English and in Persian text — through PdfBuilder (vectors) and PdfImporter.
// A case passes when the Markdown gives its TeX back exactly, with its delimiters ($…$ / $$…$$), and the words
// around it stay. Also checked: the setting { math: { source: false } } writes no map (the vectors are read as before).
// Exit 1 on any failed case, a page error or a crash (CI) — all 76 pass today, so there is no allow-list.
//   node scripts/math-roundtrip.js [KELK folder]
const env = require('./env.js');
const { chromium } = env.req('playwright');
(async () => {
  const root = process.argv[2] || env.KELK;
  const b = await chromium.launch(); const page = await b.newPage();
  const errors = [];
  page.on('pageerror', (e) => { errors.push(e); console.log('pageerror', String(e).slice(0, 200)); });
  await page.goto(env.fileUrl(root + '/tests/builder-suite.html'));
  const r = await page.evaluate(async () => {
    const out = [];
    const build = async (md, opts) => {
      const h = DOMPurify.sanitize(marked.parse(md, { gfm: true }), { ADD_ATTR: ['target', 'dir', 'align', 'data-tex', 'data-display'] });
      const bld = PdfBuilder.create(opts || {}); bld.registerFonts(window.PdfFonts || {});
      const blob = await bld.addFromHtml(h).toBlob();
      return PdfImporter.create({ images: 'drop', asciiNumbers: false, persianLetters: false }).fromArrayBuffer(await blob.arrayBuffer());
    };
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    for (const [group, name, tex, display] of MATH_CASES) {
      for (const lang of ['en', 'fa']) {
        const words = lang === 'en' ? ['Before the formula', 'and after it.'] : ['پیش از فرمول', 'و پس از آن.'];
        const md = display ? words[0] + '\n\n$$\n' + tex + '\n$$\n\n' + words[1] + '\n' : words[0] + ' $' + tex + '$ ' + words[1] + '\n';
        let res, ok = false, got = '';
        try {
          res = await build(md);
          got = res.markdown;
          const want = display ? '$$\n' + tex + '\n$$' : '$' + tex + '$';
          ok = got.indexOf(want) >= 0 && norm(got).indexOf(words[0]) >= 0 && norm(got).indexOf(words[1].replace(/\.$/, '')) >= 0;
        } catch (e) { got = 'error ' + e; }
        out.push({ name: group + '/' + name + ' ' + lang, ok: ok, got: ok ? '' : got.slice(0, 300) });
      }
    }
    // the setting off: no map, the formula back to the layout path (no $ from the map)
    const off = await build('Before $E = mc^2$ after.\n', { math: { source: false } });
    out.push({ name: 'setting off', ok: off.markdown.indexOf('$E = mc^2$') < 0 && !(off.notes || []).some((n) => /kelkMath/.test(JSON.stringify(n))), got: off.markdown.slice(0, 200) });
    const on = await build('Before $E = mc^2$ after.\n');
    out.push({ name: 'setting on: note', ok: (on.notes || []).some((n) => /kelkMath/.test(JSON.stringify(n))), got: JSON.stringify(on.notes).slice(0, 200) });
    return out;
  });
  const bad = r.filter((x) => !x.ok);
  bad.forEach((x) => console.log('FAIL', x.name, '\n   ', JSON.stringify(x.got)));
  console.log((r.length - bad.length) + ' passed, ' + bad.length + ' failed');
  if (bad.length || errors.length || r.length < 3) process.exitCode = 1;
  await b.close();
})().catch((e) => { console.error(e); process.exitCode = 1; process.exit(); });
