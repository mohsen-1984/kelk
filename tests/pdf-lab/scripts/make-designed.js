// Designed pages as Chromium prints them, for the designed-pages work of 3.0 (from real files' habits; our own text):
//   · chrome-mail--mail-fa: a web mail printed from the browser — the print's own head (the subject in bold on two
//     lines, the sender and the date on one row), a centred title and subtitle, a side box of short lines (a bold name,
//     then its line, twice: the second name came back glued to the line before it), links drawn as centred buttons
//     (each came back a quote), a numbered list whose rows are tinted every other one (the tinted rows came back
//     quotes, the list broken in five), a row of two phone numbers, a footer of «label : value» lines
//   · chrome-booklet--figure-labels-fa: a booklet's chapter with a figure drawn of pieces with short labels woven in
//     (each label came back a bold paragraph or a heading) and a caption under it, a thin strip between two parts (a
//     drawn rule), statements each beside a number badge (the numbers came back apart from their lines), and a
//     figure of pieces that touch with no text at all
// The Markdown that must come back is corpus/mail-fa.md and corpus/figure-labels-fa.md. A figure is one picture, its
// labels in the picture's alt text: the lab takes pictures out before scoring, so the labels are not in the expected text.
//   node scripts/make-designed.js   → pdf/pages/chrome-mail--mail-fa.pdf, chrome-booklet--figure-labels-fa.pdf
const { pdfPath, fileUrl, req } = require('./env.js');
const fs = require('fs'), path = require('path'), os = require('os');
const { chromium } = req('playwright');
const FONT = path.join(__dirname, '..', '..', '..', 'assets', 'fonts', 'rastikerdar', 'webfonts', 'Vazirmatn[wght].woff2');
const face = `@font-face{font-family:V;src:url("${fileUrl(FONT)}") format("woff2");font-weight:100 900}`;
const corpus = (name, text) => { fs.writeFileSync(path.join(__dirname, '..', 'corpus', name), text); console.log('corpus/' + name); };

// ---- 1. a printed web mail ---------------------------------------------------------------------------------------
const SUBJECT = 'جشن پایان فصل باشگاه کتاب‌خوانی | کارگاه‌های نویسندگی، نشست‌های نقد کتاب و برنامه بازدید از چاپخانه شهر';
const TITLE = 'جشن پایان فصل باشگاه کتاب‌خوانی', SUB = 'کتاب‌خوانی در محله، برای همه';
const HELLO = ['اعضای گرامی باشگاه و دوستداران کتاب،', 'با سلام و احترام؛'];
const P1 = 'باشگاه کتاب‌خوانی محله در سال گذشته هر هفته یک نشست برگزار کرد و شمار اعضای آن از چهل نفر به بیش از صد و بیست نفر رسید. امسال جشن پایان فصل در سالن بزرگ کتابخانه برگزار می‌شود و شرکت در آن برای همه آزاد است.';
const H_TALKS = 'سخنرانی‌های جشن', P_TALKS = 'در کنار برنامه‌های جشن، دو سخنرانی کوتاه درباره کتاب‌خوانی در خانه و مدرسه خواهیم داشت.';
const TALKS = [['خانم نسرین کتابدار', 'کتاب‌خوانی با کودکان؛ از قصه شب تا کتابخانه خانه'], ['آقای بهرام آموزگار', 'از زنگ انشا تا کارگاه نویسندگی']];
const B1 = ['دیدن برنامه سخنرانی‌ها', 'https://example.org/2026/talks'];
const H_MEET = 'نشست‌های نقد کتاب', P_MEET = 'پنج نشست نقد کتاب با حضور نویسندگان شهر برگزار می‌شود:';
const MEET = ['داستان‌های کوتاه امروز', 'کتاب کودک و تصویرگری', 'سفرنامه‌ها و خاطره‌ها (گذشته و امروز)', 'شعر نو و خوانندگان جوان', 'از کتاب کاغذی تا کتاب صوتی؛ خواندن و شنیدن در کنار هم'];
const P_AFTER = 'این نشست‌ها فرصتی برای گفت‌وگو با نویسندگان و آشنایی با کتاب‌های تازه است.';
const B2 = ['دیدن برنامه نشست‌ها', 'https://example.org/2026/meetings'];
const H_CONTACT = 'دبیرخانه باشگاه', ADDR = 'خیابان کتاب، کوچه سوم، کتابخانه مرکزی شهر', PHONES = '051-5550101 | 051-5550102', MAIL = 'club@example.org';
const FOOT = [['وب‌سایت', 'https://example.org/2026', 'https://example.org/2026'], ['شماره تماس', '0515550102', null], ['ایمیل دبیرخانه', 'club@example.org', 'mailto:club@example.org']];
const mail = `<!doctype html><html lang="fa"><head><meta charset="utf-8"><style>${face}
  body{margin:0;font:13px/2 V;color:#222}
  .ph{direction:rtl;font:bold 17px/1.5 V;margin:0 0 4px}
  .meta{display:flex;justify-content:space-between;font:10px/1.4 Arial,sans-serif;border-top:1px solid #000;border-bottom:1px solid #000;padding:3px 0;margin:0 0 14px;direction:ltr}
  .body{direction:rtl;padding:0 18px}
  h1{color:#8a6a1c;font-size:20px;text-align:center;margin:10px 0 4px}
  .sub{color:#b08d2f;font-weight:700;text-align:center;margin:0 0 10px}
  hr{border:0;border-top:1.5px solid #b08d2f;margin:10px 0 22px}
  h2{color:#b08d2f;font-size:16px;text-align:center;margin:22px 0 10px}
  p{margin:0 0 14px;text-align:justify}
  .side{background:#faf5e8;border-right:3px solid #b08d2f;padding:12px 16px;margin:0 0 16px}
  .side p{margin:0 0 4px}.side p.t{margin:0 0 12px}.side p:last-child{margin:0}
  .name{color:#8a6a1c;font-weight:700}
  .btn{text-align:center;margin:0 0 18px}
  .btn a{display:inline-block;background:#b08d2f;color:#fff;font-weight:700;text-decoration:none;border-radius:6px;padding:8px 22px}
  ol{list-style:none;margin:0 0 16px;padding:0;counter-reset:n}
  ol li{counter-increment:n;padding:8px 14px}ol li::before{content:counter(n) ". "}
  ol li:nth-child(odd){background:#faf5e8}
  .c{text-align:center}.foot{font-size:11px;line-height:1.8;margin-top:26px}.foot p{margin:0;text-align:right}
</style></head><body>
<div class="ph">${SUBJECT}</div>
<div class="meta"><span>Reading Club &lt;club@example.org&gt;<br>To: reader@example.org</span><span>Sat, 3 Oct 2026 at 10:30</span></div>
<div class="body">
<h1>${TITLE}</h1><div class="sub">${SUB}</div><hr>
${HELLO.map((t) => `<p><b>${t}</b></p>`).join('')}
<p>${P1}</p>
<h2>${H_TALKS}</h2><p>${P_TALKS}</p>
<div class="side">${TALKS.map(([n, t]) => `<p class="name">${n}</p><p class="t">${t}</p>`).join('')}</div>
<div class="btn"><a href="${B1[1]}">${B1[0]}</a></div>
<h2>${H_MEET}</h2><p>${P_MEET}</p>
<ol>${MEET.map((t) => `<li>${t}</li>`).join('')}</ol>
<p>${P_AFTER}</p>
<div class="btn"><a href="${B2[1]}">${B2[0]}</a></div>
<h2>${H_CONTACT}</h2>
<p class="c">${ADDR}</p><p class="c">${PHONES}</p><p class="c"><a href="mailto:${MAIL}">${MAIL}</a></p>
<div class="foot">${FOOT.map(([l, v, u]) => `<p>${l} : ${u ? `<a href="${u}">${v}</a>` : v}</p>`).join('')}</div>
</div></body></html>`;
const mailMd = `**${SUBJECT}**

Reading Club <club@example.org>\\
To: reader@example.org

Sat, 3 Oct 2026 at 10:30

# ${TITLE}

**${SUB}**

---

${HELLO.map((t) => `**${t}**`).join('\n\n')}

${P1}

## ${H_TALKS}

${P_TALKS}

${TALKS.map(([n, t]) => `> **${n}**\n>\n> ${t}`).join('\n>\n')}

[${B1[0]}](${B1[1]})

## ${H_MEET}

${P_MEET}

${MEET.map((t, i) => `${i + 1}. ${t}`).join('\n')}

${P_AFTER}

[${B2[0]}](${B2[1]})

## ${H_CONTACT}

${ADDR}

${PHONES}

[${MAIL}](mailto:${MAIL})

${FOOT.map(([l, v, u]) => `${l} : ${u ? `[${v}](${u})` : v}`).join('\\\n')}
`;

// ---- 2. a booklet's chapter: a figure with labels, a thin strip, number badges -----------------------------------
const CH = 'نقشه و قطب‌نما', CH_SUB = 'تصویرِ اصلیِ این دفتر';
const F1 = 'برای رسیدن به یک قله دو چیز لازم داری: نقشه‌ای که راه را نشان بدهد و قطب‌نمایی که هر چند قدم جهت را درست کند.';
const CAP = 'نقشه راه را نشان می‌دهد؛ قطب‌نما جهت را درست می‌کند. فقط با هر دو به قله می‌رسی.';
const F2 = 'اگر فقط نقشه داشته باشی، با اولین پیچِ اشتباه گم می‌شوی. اگر فقط قطب‌نما داشته باشی، نمی‌دانی به کجا باید بروی.';
const H3 = 'سه نشانه‌ی یک برنامه‌ی خوب';
const MARKS = [['روشن است', 'می‌دانی فردا صبح دقیقاً چه کاری می‌کنی.'], ['کوتاه است', 'هر قدمش در یک نشست تمام می‌شود.'], ['سنجیدنی است', 'آخرِ هفته می‌فهمی جلو رفته‌ای یا نه.']];
const F3 = 'هر برنامه‌ای که این سه نشانه را داشته باشد، ارزشِ امتحان کردن دارد.';
const fig = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><style>${face}
  body{font:13px/1.9 V;direction:rtl;background:#faf8f3;color:#222;margin:0}
  .page{padding:40px 48px}
  .head{display:flex;align-items:center;gap:12px}.head h2{font-size:20px;margin:0}
  .badge{display:inline-flex;width:26px;height:26px;border-radius:6px;background:#1f2a44;color:#fff;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex:none}
  .sub{color:#c58a12;font-size:11px;font-weight:700;margin:4px 0 18px}
  p{margin:0 0 12px;text-align:justify}
  figure{margin:18px 0}figure svg{display:block;margin:0 auto}
  figcaption{font-size:10px;color:#777;text-align:center;margin-top:8px}
  .strip{height:3px;background:#1f2a44;border-radius:2px;margin:22px 0}
  h3{font-size:15px;margin:0 0 12px}
  .mark{display:flex;align-items:flex-start;gap:10px;margin:0 0 10px}
  .mark .badge{width:22px;height:22px;font-size:12px;background:#c58a12;margin-top:2px}
  svg text{font-family:V;font-weight:700;font-size:11px;fill:#1f2a44}
</style></head><body><div class="page">
<div class="head"><span class="badge">4</span><h2>${CH}</h2></div><div class="sub">${CH_SUB}</div>
<p>${F1}</p>
<figure><svg width="380" height="170" viewBox="0 0 380 170">
  <rect x="20" y="120" width="340" height="18" rx="4" fill="#dfe3ee"/>
  <path d="M60 120 L60 70" stroke="#1f2a44" stroke-width="2"/><path d="M60 70 L88 80 L60 90 Z" fill="#c8553d"/>
  <text x="60" y="60" text-anchor="middle">قله</text>
  <rect x="190" y="98" width="70" height="22" rx="6" fill="#1f2a44"/><rect x="205" y="84" width="40" height="16" rx="5" fill="#1f2a44"/>
  <circle cx="205" cy="122" r="9" fill="#1f2a44"/><circle cx="245" cy="122" r="9" fill="#1f2a44"/>
  <circle cx="310" cy="50" r="24" fill="none" stroke="#c58a12" stroke-width="5"/><circle cx="310" cy="50" r="5" fill="#c58a12"/>
  <text x="310" y="92" text-anchor="middle" fill="#c58a12">قطب‌نما =</text><text x="310" y="106" text-anchor="middle">درست کردنِ جهت</text>
  <path d="M170 152 L100 152" stroke="#1f2a44" stroke-width="3"/><path d="M100 146 L88 152 L100 158 Z" fill="#1f2a44"/>
  <text x="250" y="156" text-anchor="middle">راه رفتن = نقشه</text>
</svg><figcaption>${CAP}</figcaption></figure>
<p>${F2}</p>
<div class="strip"></div>
<h3>${H3}</h3>
${MARKS.map(([b, t], i) => `<div class="mark"><span class="badge">${i + 1}</span><div><b>${b}</b> — ${t}</div></div>`).join('')}
<figure><svg width="200" height="60" viewBox="0 0 200 60">
  <rect x="20" y="20" width="50" height="30" fill="#1f2a44"/><rect x="70" y="10" width="50" height="40" fill="#c58a12"/><rect x="120" y="25" width="50" height="25" fill="#c8553d"/>
</svg></figure>
<p>${F3}</p>
</div></body></html>`;
const figMd = `## 4. ${CH}

**${CH_SUB}**

${F1}

${CAP}

${F2}

---

### ${H3}

${MARKS.map(([b, t], i) => `${i + 1}. **${b}** — ${t}`).join('\n')}

${F3}
`;

(async () => {
  const b = await chromium.launch(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kelk-ds-'));
  for (const [name, html, opt] of [['chrome-mail--mail-fa.pdf', mail, { format: 'Letter', margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } }],
    ['chrome-booklet--figure-labels-fa.pdf', fig, { width: '148mm', height: '210mm', margin: { top: 0, bottom: 0, left: 0, right: 0 } }]]) {
    const page = await b.newPage(), f = path.join(dir, name + '.html'); fs.writeFileSync(f, html);
    await page.goto(fileUrl(f)); await page.evaluate(() => document.fonts.ready);
    await page.pdf(Object.assign({ path: pdfPath(name), printBackground: true }, opt)); await page.close();
    console.log(name);
  }
  await b.close();
  corpus('mail-fa.md', mailMd); corpus('figure-labels-fa.md', figMd);
})();
