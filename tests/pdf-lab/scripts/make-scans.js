// Kelk 3.4's OCR lab: scanned pages of our own Persian text, each page one picture and no text layer, as a scanner
// writes them — the text set by Chromium in faces Kelk ships, then degraded in the page's canvas (a slight skew, blur,
// noise, binarised by Otsu's threshold) and written as one image a page:
//   · scan-300--scan-plain-fa      two pages, B Nazanin, 300 dpi, 1-bit (Flate)
//   · scan-300--scan-framed-fa     one page, B Mitra, the text block in a printed frame of rules, 300 dpi, 1-bit
//   · scan-150--scan-low-fa        one page, Vazirmatn, 150 dpi grey JPEG (quality 0.35), not binarised
//   · scan-300--scan-headings-fa   one page, B Titr headings over B Nazanin paragraphs, 300 dpi, 1-bit
// A book page of 5.5 × 8.5 in (396 × 612 pt), as an older scanned book. IMITATED: a real scan is often JBIG2 or
// CCITT, which we cannot write here; pdf.js decodes every one of them, so the page's pixels are what OCR reads.
// The text is ours, written for these files (2026-11-21), so it is in no corpus the language model counted
// (tools/lm/lm.json: Kelk's text up to 2026-11-21 and the Leipzig corpora); it also stays out of letterstats.js
// (MEASURED in tools/build-letterstats.js). Lab files carry no personal metadata: Producer, Creator and Title only.
//   node scripts/make-scans.js   → pdf/rtl/scan-*.pdf and corpus/scan-*-fa.md
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib'), os = require('os');
const env = require('./env.js');
const { chromium } = env.req('playwright');
const root = path.join(__dirname, '..', '..', '..');
const JSZip = require(path.join(root, 'vendor', fs.readdirSync(path.join(root, 'vendor')).find((f) => /^jszip\.min_.*\.js$/.test(f))));

const W_PT = 396, H_PT = 612;
const PRODUCER = 'Kelk lab scanner';

// ---- the text (ours) ---------------------------------------------------------------------------------------------------
const PLAIN = [
  ['بازار کهنهٔ شهر در کنار رود ساخته شده است و هنوز بیشتر دکان‌های آن چوبی‌اند. صبح‌ها نخست نانواها در را باز می‌کنند و بوی نان تازه تا سر کوچه‌ها می‌رود. پس از آنان مسگرها کار را آغاز می‌کنند و صدای چکش‌هایشان تا ظهر شنیده می‌شود. کسانی که از روستاهای دور می‌آیند، میوه و پنیر و عسل می‌آورند و در میدان کوچک کنار پل می‌فروشند.',
   'در گوشهٔ شمالی بازار کاروانسرای بزرگی هست که روزگاری بازرگانان در آن بار می‌انداختند. امروز در حجره‌های آن فرش‌بافان و خیاطان کار می‌کنند و حیاط آن در تابستان جای نشستن پیرمردهای محله است. شهرداری چند سال پیش سقف کاروانسرا را تعمیر کرد و آب‌انبار کهنهٔ زیر آن را برای بازدید گردشگران باز گذاشت.'],
  ['بسیاری از خانواده‌های شهر نسل به نسل در این بازار کار کرده‌اند. پدربزرگ‌ها هنوز داستان روزهایی را می‌گویند که کالا با قاطر از کوه می‌آمد و راه سه روز طول می‌کشید. اکنون جادهٔ تازه‌ای شهر را به مرکز استان می‌پیوندد، اما بازار همچنان دل شهر است و مردم برای خرید و دیدار دوستان به آنجا می‌روند.',
   'شورای شهر برنامه‌ای نوشته است تا دکان‌های کهنه بی‌آنکه شکل خود را از دست بدهند بازسازی شوند. در این برنامه از استادکاران محلی خواسته شده است که در کار تعمیر شرکت کنند و شیوهٔ کار خود را به جوانان بیاموزند. نخستین بخش این کار در بهار آغاز می‌شود و تا پایان پاییز ادامه دارد.']
];
const FRAMED = ['باغ گیاه‌شناسی دانشگاه در دامنهٔ تپه‌ای آرام قرار دارد و بیش از هزار گونه گیاه در آن نگهداری می‌شود. بخش بزرگی از باغ به گیاهان کوهستانی سپرده شده است که دانشجویان در سفرهای پژوهشی خود از نقاط گوناگون کشور گرد آورده‌اند. در گلخانهٔ کنار در ورودی، گیاهان گرمسیری در هوای گرم و مرطوب رشد می‌کنند.',
  'باغبانان هر روز صبح پیش از آمدن بازدیدکنندگان به گیاهان آب می‌دهند و برگ‌های خشک را جمع می‌کنند. روی هر درخت تابلوی کوچکی نصب شده است که نام آن را به فارسی و به زبان علمی نشان می‌دهد. کتابخانهٔ باغ نیز مجموعه‌ای از نقاشی‌های قدیمی گیاهان دارد که پژوهشگران برای شناختن گونه‌ها از آن بهره می‌برند.'];
const LOW = ['کارگاه نجاری محله در زیرزمین ساختمان فرهنگسرا برپا شده است و هر هفته سه روز باز است. هنرجویان در آنجا ساختن میز و صندلی و جعبه‌های کوچک را یاد می‌گیرند و با ابزارهای دستی و برقی آشنا می‌شوند. مربی کارگاه سال‌ها در کارخانهٔ مبل‌سازی کار کرده است و به هنرجویان می‌آموزد که چگونه چوب را بشناسند و با آن رفتار کنند.',
  'در پایان هر دوره، کارهای هنرجویان در تالار فرهنگسرا به نمایش گذاشته می‌شود و خانواده‌ها برای دیدن آن‌ها می‌آیند. برخی از هنرجویان پس از گذراندن دوره، در خانه کارگاه کوچکی برای خود ساخته‌اند و سفارش همسایه‌ها را می‌پذیرند.'];
const HEADINGS = [['کشاورزی در دشت', 'دشت پهناوری که در جنوب شهر گسترده است، از دیرباز زمین کشاورزی مردم بوده است. گندم و جو در پاییز کاشته می‌شوند و در آغاز تابستان درو می‌شوند. کشاورزان آب را از چاه‌ها و قنات‌های کهن به زمین‌ها می‌رسانند و نوبت آبیاری هر زمین را با هم تعیین می‌کنند.'],
  ['آب و قنات', 'قنات‌های این دشت صدها سال پیش کنده شده‌اند و هنوز برخی از آن‌ها آب می‌دهند. نگهداری قنات کاری دشوار است و تنها چند خانواده هنر لایروبی آن را می‌دانند. در سال‌های اخیر گروهی از جوانان روستا این کار را از آنان آموخته‌اند.'],
  ['بازار محصول', 'پس از برداشت، بیشتر محصول به بازار شهر برده می‌شود و بخشی از آن در انبارهای روستا برای زمستان نگه داشته می‌شود.']];

// ---- a page's HTML ------------------------------------------------------------------------------------------------------
function html(fonts, body, opts) {
  const ff = Object.entries(fonts).map(([n, f]) => `@font-face{font-family:${n};src:url(${env.fileUrl(f)})}`).join('');
  const frame = opts.frame ? 'border:3px double #000;padding:18px 20px;' : '';
  return `<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><style>${ff}
    html,body{margin:0;background:#fff}
    .page{box-sizing:border-box;width:${W_PT}pt;height:${H_PT}pt;padding:54pt 50pt 60pt 50pt}
    .block{${frame}height:100%;box-sizing:border-box}
    p{font-family:${opts.body};font-size:${opts.size || 12}pt;line-height:1.75;text-align:justify;margin:0 0 9pt 0;color:#000}
    h2{font-family:${opts.head || opts.body};font-size:15pt;font-weight:normal;margin:6pt 0 6pt 0;color:#000}
    </style></head><body><div class="page"><div class="block">${body}</div></div></body></html>`;
}

// ---- the scanner, in the page: skew, blur, noise, Otsu ------------------------------------------------------------------
async function scan(page, png, o) {
  return page.evaluate(async ([b64, o]) => {
    const img = document.createElement('img'); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const w = Math.round(img.width * o.scale), h = Math.round(img.height * o.scale);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
    x.translate(w / 2, h / 2); x.rotate(o.angle * Math.PI / 180); x.translate(-w / 2, -h / 2);
    x.filter = 'blur(' + o.blur + 'px)'; x.drawImage(img, 0, 0, w, h); x.filter = 'none';
    const d = x.getImageData(0, 0, w, h), g = new Uint8Array(w * h);
    let s = o.seed >>> 0;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const gauss = () => { const u = rnd() || 1e-9, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    for (let i = 0; i < w * h; i++) g[i] = Math.max(0, Math.min(255, Math.round(0.299 * d.data[4 * i] + 0.587 * d.data[4 * i + 1] + 0.114 * d.data[4 * i + 2] + o.noise * gauss())));
    if (o.jpeg) {
      for (let i = 0; i < w * h; i++) { d.data[4 * i] = d.data[4 * i + 1] = d.data[4 * i + 2] = g[i]; d.data[4 * i + 3] = 255; }
      x.setTransform(1, 0, 0, 1, 0, 0); x.putImageData(d, 0, 0);
      return { w, h, jpeg: c.toDataURL('image/jpeg', o.jpeg).split(',')[1] };
    }
    // Otsu's threshold over the grey levels
    const hist = new Array(256).fill(0); for (let i = 0; i < w * h; i++) hist[g[i]]++;
    let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sb = 0, wb = 0, best = 0, th = 128;
    for (let t = 0; t < 256; t++) { wb += hist[t]; if (!wb) continue; const wf = w * h - wb; if (!wf) break; sb += t * hist[t]; const mb = sb / wb, mf = (sum - sb) / wf, v = wb * wf * (mb - mf) * (mb - mf); if (v > best) { best = v; th = t; } }
    // 1 bit a pixel, rows padded to a byte; 1 is white (DeviceGray)
    const rb = Math.ceil(w / 8), bits = new Uint8Array(rb * h);
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) if (g[y * w + xx] > th) bits[y * rb + (xx >> 3)] |= 0x80 >> (xx & 7);
    let bin = ''; for (let i = 0; i < bits.length; i += 32768) bin += String.fromCharCode.apply(null, bits.subarray(i, i + 32768));
    return { w, h, bits: btoa(bin) };
  }, [png.toString('base64'), o]);
}

// ---- a PDF of one image a page ------------------------------------------------------------------------------------------
function writePdf(file, pages, title) {
  const objs = [];
  const obj = (b) => { objs.push(Buffer.isBuffer(b) ? b : Buffer.from(b, 'latin1')); return objs.length; };
  const stream = (dict, data) => Buffer.concat([Buffer.from(dict.replace('%LEN%', data.length) + '\nstream\n', 'latin1'), data, Buffer.from('\nendstream', 'latin1')]);
  const np = pages.length, kids = [];
  // object numbers: per page an image and its content, then the pages, then Pages, Catalog, Info
  const ids = pages.map(() => ({}));
  pages.forEach((p, i) => {
    const im = p.jpeg ? stream(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length %LEN% >>`, Buffer.from(p.jpeg, 'base64'))
      : stream(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceGray /BitsPerComponent 1 /Filter /FlateDecode /Length %LEN% >>`, zlib.deflateSync(Buffer.from(p.bits, 'base64'), { level: 9 }));
    ids[i].im = obj(im);
    ids[i].c = obj(stream('<< /Length %LEN% >>', Buffer.from(`q\n${W_PT} 0 0 ${H_PT} 0 0 cm\n/Im0 Do\nQ\n`, 'latin1')));
  });
  const pagesNum = objs.length + np + 1;
  pages.forEach((p, i) => { kids.push(obj(`<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${W_PT} ${H_PT}] /Resources << /XObject << /Im0 ${ids[i].im} 0 R >> >> /Contents ${ids[i].c} 0 R >>`)); });
  if (obj(`<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${np} >>`) !== pagesNum) throw new Error('object numbers');
  const cat = obj(`<< /Type /Catalog /Pages ${pagesNum} 0 R /Lang (fa-IR) >>`);
  const info = obj(`<< /Producer (${PRODUCER}) /Creator (${PRODUCER}) /Title (${title}) >>`);
  const parts = [Buffer.from('%PDF-1.5\n%\xe2\xe3\xcf\xd3\n', 'latin1')]; let off = parts[0].length; const offs = [];
  objs.forEach((b, i) => { const h = Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), t = Buffer.from('\nendobj\n', 'latin1'); offs.push(off); parts.push(h, b, t); off += h.length + b.length + t.length; });
  const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') +
    `trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R /Info ${info} 0 R >>\nstartxref\n${off}\n%%EOF\n`;
  parts.push(Buffer.from(xref, 'latin1'));
  fs.writeFileSync(file, Buffer.concat(parts)); console.log(path.relative(env.LAB, file), fs.statSync(file).size, 'bytes');
}

(async () => {
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(root, 'assets', 'fonts', 'download', 'persian-fonts-ttf.zip')));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kelk-scans-'));
  const font = async (name) => { const f = path.join(tmp, path.basename(name)); fs.writeFileSync(f, await zip.files[name].async('nodebuffer')); return f; };
  const F = { Nazanin: await font('borna-rayaneh/BNAZANIN.TTF'), Mitra: await font('borna-rayaneh/BMITRA.TTF'), Titr: await font('borna-rayaneh/BTITRBD.TTF'), Vazir: await font('vazirmatn/Vazirmatn-Regular.ttf') };
  const b = await chromium.launch(), page = await b.newPage({ viewport: { width: Math.round(W_PT * 96 / 72), height: Math.round(H_PT * 96 / 72) }, deviceScaleFactor: 300 / 96 });
  const shot = async (h) => { const f = path.join(tmp, 'p.html'); fs.writeFileSync(f, h); await page.goto(env.fileUrl(f)); await page.evaluate(() => document.fonts.ready); return page.screenshot({ type: 'png' }); };
  const P = (t) => `<p>${t}</p>`;
  const make = async (name, list, title) => {
    const pages = [];
    for (const [k, it] of list.entries()) pages.push(await scan(page, await shot(html(F, it.body, it.opts)), Object.assign({ seed: 1000 + k + name.length }, it.scan)));
    writePdf(env.pdfPath(name + '.pdf'), pages, title);
  };
  const S300 = { scale: 1, angle: 0.35, blur: 0.9, noise: 12 };
  await make('scan-300--scan-plain-fa', PLAIN.map((ps) => ({ body: ps.map(P).join(''), opts: { body: 'Nazanin' }, scan: S300 })), 'scan-plain-fa');
  await make('scan-300--scan-framed-fa', [{ body: FRAMED.map(P).join(''), opts: { body: 'Mitra', frame: true }, scan: Object.assign({}, S300, { angle: -0.5 }) }], 'scan-framed-fa');
  await make('scan-150--scan-low-fa', [{ body: LOW.map(P).join(''), opts: { body: 'Vazir', size: 11 }, scan: { scale: 0.5, angle: 0.2, blur: 0.6, noise: 8, jpeg: 0.35 } }], 'scan-low-fa');
  await make('scan-300--scan-headings-fa', [{ body: HEADINGS.map(([hd, p]) => `<h2>${hd}</h2>` + P(p)).join(''), opts: { body: 'Nazanin', head: 'Titr' }, scan: Object.assign({}, S300, { angle: 0.6 }) }], 'scan-headings-fa');
  await b.close();
  const md = (ps) => ps.join('\n\n') + '\n';
  const corpus = (n, t) => { fs.writeFileSync(path.join(env.LAB, 'corpus', n), t); console.log('corpus/' + n); };
  corpus('scan-plain-fa.md', md([].concat(...PLAIN)));
  corpus('scan-framed-fa.md', md(FRAMED));
  corpus('scan-low-fa.md', md(LOW));
  corpus('scan-headings-fa.md', HEADINGS.map(([hd, p]) => '## ' + hd + '\n\n' + p).join('\n\n') + '\n');
  fs.rmSync(tmp, { recursive: true, force: true });
})();
