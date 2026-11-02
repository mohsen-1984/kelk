// Pages with pictures — the cell `pictures=some` / `text=overPictures` no lab PDF had (features.js): what slides
// exported to PDF and designed reports are made of. Every picture is a raster drawn on a canvas in the page (so the
// PDF holds a real image), next to vector decoration (an SVG dot grid, CSS pills) and a CSS gradient bar:
//   slides, slides-fa   16:9 pages — a raster background with curves, a title set over a raster panel with a
//                       shadow, an icon and a dot grid beside a paragraph, a photo with its caption beside a list
//   brochure            A4 — a logo, a title, a cover band (a raster) with text laid over it; a chart (a raster
//                       with no text in it) with its caption between paragraphs
//   inline, inline-fa   A4 in the page's flow (English and Persian): pictures in the lines of text — an icon before a
//                       heading and after one, a badge in the middle of a sentence, a list whose bullets are pictures,
//                       a picture floated beside a paragraph that wraps round it, a dot grid in the margin beside it,
//                       an icon at the start of the last paragraph. Text wins: no Markdown line holds a picture and
//                       words (run-import's mix column)
// The text must come back as text, each word once; the pictures as pictures that hold no words.
//   node scripts/make-pictures.js     → pdf/chrome-pictures--{slides,slides-fa,brochure,inline,inline-fa}.pdf,
//                                       pdf/wk-pictures--{brochure,inline}.pdf
const { pdfPath, fileUrl } = require('./env.js');
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const { KELK, req } = require('./env.js');
const { chromium } = req('playwright');
const LAB = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kelk-pic-'));
const WEB = fileUrl(KELK + '/assets/fonts/rastikerdar/webfonts') + '/';
const md = (name) => fs.readFileSync(path.join(LAB, 'corpus', name + '.md'), 'utf8');
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// the rasters, drawn in the page: each <canvas data-pic="…"> becomes an <img> of itself before printing
const PICS = `
function seeded(n){let s=n;return()=>((s=Math.imul(s,1103515245)+12345>>>0)/4294967296);}
const DRAW={
 bg(c,g){const w=c.width,h=c.height,gr=g.createLinearGradient(0,0,w,h);gr.addColorStop(0,'#ffffff');gr.addColorStop(1,'#eef3f8');g.fillStyle=gr;g.fillRect(0,0,w,h);
   g.strokeStyle='rgba(120,140,170,.25)';for(let i=0;i<30;i++){g.beginPath();g.arc(-w*.2,h*1.1,w*.4+i*14,-1.2,0);g.stroke();}},
 hero(c,g){const w=c.width,h=c.height,gr=g.createLinearGradient(0,0,w,0);gr.addColorStop(0,'#0b3d6e');gr.addColorStop(1,'#1f7ac0');g.fillStyle=gr;g.fillRect(0,0,w,h);
   g.strokeStyle='rgba(255,255,255,.12)';for(let i=0;i<24;i++){g.beginPath();g.arc(w*1.05,h*.5,60+i*22,0,7);g.stroke();}},
 panel(c,g){const w=c.width,h=c.height;g.fillStyle='rgba(0,0,0,.18)';g.filter='blur(8px)';g.beginPath();g.roundRect(14,16,w-28,h-24,28);g.fill();g.filter='none';
   g.fillStyle='#f3f4f6';g.beginPath();g.roundRect(8,8,w-24,h-26,26);g.fill();g.strokeStyle='#c9ced6';g.lineWidth=2;g.stroke();},
 icon(c,g){const w=c.width;g.fillStyle='#fff';g.shadowColor='rgba(0,0,0,.2)';g.shadowBlur=10;g.beginPath();g.arc(w/2,w/2,w/2-8,0,7);g.fill();g.shadowBlur=0;
   g.strokeStyle='#222';g.lineWidth=4;[30,20,10].forEach(r=>{g.beginPath();g.arc(w/2,w/2,r,0,7);g.stroke();});},
 photo(c,g){const w=c.width,h=c.height,r=seeded(7);const gr=g.createLinearGradient(0,0,0,h);gr.addColorStop(0,'#c9b79c');gr.addColorStop(1,'#5b4b3a');g.fillStyle=gr;g.fillRect(0,0,w,h);
   for(let i=0;i<60;i++){g.fillStyle='hsla('+(20+r()*40)+',30%,'+(30+r()*50)+'%,.7)';g.fillRect(r()*w,h*.45+r()*h*.5,20+r()*60,8+r()*40);}
   g.fillStyle='rgba(255,255,255,.35)';for(let i=0;i<6;i++)g.fillRect(i*w/6+10,20,w/6-20,h*.3);},
 band(c,g){g.fillStyle='#e8762c';g.fillRect(0,0,c.width,c.height);g.fillStyle='#1d4e6b';g.fillRect(0,0,c.width,14);},
 logo(c,g){const w=c.width;g.fillStyle='#fff';g.fillRect(0,0,w,w);g.strokeStyle='#c0262d';g.lineWidth=6;g.strokeRect(6,6,w-12,w-12);
   g.fillStyle='#c0262d';g.beginPath();g.arc(w*.45,w*.5,w*.28,0.6,5.7);g.arc(w*.55,w*.5,w*.22,5.7,0.6,true);g.fill();g.fillStyle='#3a9a5b';g.beginPath();g.arc(w*.62,w*.5,w*.14,0,7);g.fill();},
 chip(c,g){const w=c.width,h=c.height;g.fillStyle='#2e7d4f';g.beginPath();g.roundRect(0,0,w,h,h/2);g.fill();g.fillStyle='rgba(255,255,255,.55)';g.fillRect(h*.6,h*.42,w-h*1.2,h*.16);},
 tick(c,g){const w=c.width;g.fillStyle='#1f7ac0';g.beginPath();g.arc(w/2,w/2,w/2,0,7);g.fill();g.strokeStyle='#fff';g.lineWidth=w/8;g.beginPath();g.moveTo(w*.28,w*.52);g.lineTo(w*.44,w*.68);g.lineTo(w*.74,w*.34);g.stroke();},
 flag(c,g){const w=c.width,h=c.height;['#c0262d','#fff','#1d4e6b'].forEach((k,i)=>{g.fillStyle=k;g.fillRect(0,i*h/3,w,h/3);});g.strokeStyle='#888';g.strokeRect(0,0,w,h);},
 chart(c,g){const w=c.width,h=c.height;g.fillStyle='#fff';g.fillRect(0,0,w,h);g.strokeStyle='#999';g.beginPath();g.moveTo(40,10);g.lineTo(40,h-30);g.lineTo(w-10,h-30);g.stroke();
   [0.82,0.35,0.51,0.18].forEach((v,i)=>{g.fillStyle=['#1f6f5c','#e8762c','#3b7dd8','#9a9a9a'][i];g.fillRect(70+i*(w-100)/4,h-30-v*(h-50),(w-100)/4-30,v*(h-50));});}
};
document.querySelectorAll('canvas[data-pic]').forEach(c=>{DRAW[c.dataset.pic](c,c.getContext('2d'));const i=new Image();i.src=c.toDataURL('image/png');i.style.cssText=c.style.cssText;i.width=c.width/2;i.height=c.height/2;c.replaceWith(i);});`;
const canvas = (pic, x, y, w, h) => `<canvas data-pic="${pic}" width="${w * 2}" height="${h * 2}" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px"></canvas>`;
// a picture in the flow: its own style (inline, floated) — the canvas becomes an <img> with that style
const inl = (pic, w, h, style) => `<canvas data-pic="${pic}" width="${w * 2}" height="${h * 2}" style="width:${w}px;height:${h}px;${style || ''}"></canvas>`;
const dots = (x, y) => { let s = `<svg style="position:absolute;left:${x}px;top:${y}px" width="80" height="150">`; for (let i = 0; i < 4; i++) for (let j = 0; j < 8; j++) s += `<circle cx="${8 + i * 20}" cy="${8 + j * 18}" r="2.2" fill="#c4c9d0"/>`; return s + '</svg>'; };

function slides(src, rtl) {
  const L = src.split('\n').filter((l) => l.trim());
  const h1 = L[0].slice(2), sub = L[1], h2a = L[2].slice(3), para = L[3], h2b = L[4].slice(3), items = L.filter((l) => l.startsWith('- ')).map((l) => l.slice(2)), cap = L[L.length - 1];
  const font = rtl ? '"Vazirmatn"' : '"Liberation Sans"', side = rtl ? 'right' : 'left', other = rtl ? 'left' : 'right';
  const slide = (inner) => `<section class="s">${inner}</section>`;
  return `<!doctype html><html dir="${rtl ? 'rtl' : 'ltr'}" lang="${rtl ? 'fa' : 'en'}"><head><meta charset="utf-8"><style>
    @font-face{font-family:"Vazirmatn";src:url("${WEB}Vazirmatn[wght].woff2") format("woff2");font-weight:100 900}
    @page{size:960px 540px;margin:0} body{margin:0;font-family:${font};color:#1d2733}
    .s{position:relative;width:960px;height:540px;overflow:hidden;page-break-after:always} .a{position:absolute;margin:0}
    h1{font-size:44px} h2{font-size:26px;color:#1f4f8a} p{font-size:17px;line-height:1.75} li{font-size:18px;line-height:1.9}
    .bar{position:absolute;width:7px;border-radius:4px;background:linear-gradient(#5aa9ff,#0a3fa0)}
    .pill{position:absolute;width:46px;height:14px;border-radius:7px;background:#e3e6ea}
  </style></head><body>
  ${slide(canvas('hero', 0, 0, 960, 540) + `<h1 class="a" style="${side}:80px;top:190px;color:#fff">${esc(h1)}</h1><p class="a" style="${side}:82px;top:270px;color:#dbe8f5;font-size:20px">${esc(sub)}</p>`)}
  ${slide(canvas('bg', 0, 0, 960, 540) + canvas('panel', 105, 70, 640, 120) +
    `<h2 class="a" style="${side}:150px;top:104px">${esc(h2a)}</h2>` + canvas('icon', rtl ? 120 : 760, 220, 84, 84) + dots(rtl ? 128 : 772, 320) +
    `<div class="bar" style="${rtl ? 'left' : 'right'}:228px;top:230px;height:210px"></div>` +
    `<p class="a" style="${side}:105px;top:215px;width:590px">${esc(para)}</p>`)}
  ${slide(canvas('bg', 0, 0, 960, 540) + `<h2 class="a" style="${side}:70px;top:40px">${esc(h2b)}</h2>` +
    canvas('photo', rtl ? 540 : 70, 130, 360, 240) + `<p class="a" style="${side}:70px;top:378px;font-size:13px;color:#555">${esc(cap)}</p>` +
    `<ul class="a" style="${other}:60px;top:130px;width:400px">${items.map((i) => '<li>' + esc(i) + '</li>').join('')}</ul>` +
    [0, 1, 2, 3].map((i) => `<div class="pill" style="${other}:${60 + i * 60}px;top:470px"></div>`).join(''))}
  <script>${PICS}</script></body></html>`;
}

function brochure(src) {
  const L = src.split('\n').filter((l) => l.trim());
  const [h1, ed, prep, h2a, p1, cap, p2, h2b, p3] = [L[0].slice(2), L[1], L[2], L[3].slice(3), L[4], L[5], L[6], L[7].slice(3), L[8]];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
    @page{size:A4;margin:0} body{margin:0;font-family:"Liberation Sans",Arial,sans-serif;color:#222}
    .pg{position:relative;width:794px;height:1123px;overflow:hidden;page-break-after:always} .a{position:absolute;margin:0}
    h1{font-size:30px;color:#444} h2{font-size:22px;color:#1d4e6b} p{font-size:15px;line-height:1.6}
  </style></head><body>
  <div class="pg">${canvas('logo', 322, 90, 150, 150)}
    <h1 class="a" style="left:90px;top:330px;width:614px;text-align:center">${esc(h1)}</h1>
    <p class="a" style="left:90px;top:420px;width:614px;text-align:center;color:#777">${esc(ed)}</p>
    ${canvas('band', 40, 880, 714, 150)}<p class="a" style="left:80px;top:940px;color:#fff;font-weight:bold;font-size:17px">${esc(prep)}</p></div>
  <div class="pg"><h2 class="a" style="left:80px;top:80px">${esc(h2a)}</h2>
    <p class="a" style="left:80px;top:130px;width:634px">${esc(p1)}</p>
    ${canvas('chart', 197, 290, 400, 240)}<p class="a" style="left:80px;top:540px;width:634px;text-align:center;font-size:13px;color:#555">${esc(cap)}</p>
    <p class="a" style="left:80px;top:590px;width:634px">${esc(p2)}</p>
    <h2 class="a" style="left:80px;top:720px">${esc(h2b)}</h2>
    <p class="a" style="left:80px;top:770px;width:634px">${esc(p3)}</p></div>
  <script>${PICS}</script></body></html>`;
}

function inline(src, rtl) {
  const L = src.split('\n').filter((l) => l.trim());
  const h1 = L[0].slice(2), h2a = L[1].slice(3), p1 = L[2], items = L.filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
  const p2 = L[6], h2b = L[7].slice(3), p3 = L[8], p4 = L[9];
  const font = rtl ? '"Vazirmatn"' : '"Liberation Sans",Arial,sans-serif', side = rtl ? 'right' : 'left', other = rtl ? 'left' : 'right';
  // a badge after the paragraph's fourth word: in the middle of a sentence, on its first line
  const w1 = p1.split(' '), p1a = w1.slice(0, 4).join(' '), p1b = w1.slice(4).join(' ');
  const ico = (pic, style) => inl(pic, 22, 22, 'vertical-align:-4px;' + style);
  return `<!doctype html><html dir="${rtl ? 'rtl' : 'ltr'}" lang="${rtl ? 'fa' : 'en'}"><head><meta charset="utf-8"><style>
    @font-face{font-family:"Vazirmatn";src:url("${WEB}Vazirmatn[wght].woff2") format("woff2");font-weight:100 900}
    @page{size:A4;margin:0} body{margin:0;font-family:${font};color:#222}
    .pg{position:relative;width:794px;min-height:1123px;padding:70px 90px;box-sizing:border-box}
    h1{font-size:30px} h2{font-size:22px;color:#1d4e6b;margin-top:34px} p,li{font-size:15px;line-height:1.7}
    ul{list-style:none;padding-${side}:0} li{margin:4px 0}
  </style></head><body><div class="pg">
    <h1>${esc(h1)}</h1>
    <h2>${ico('icon', 'margin-' + other + ':10px')}${esc(h2a)}</h2>
    <p>${esc(p1a)} ${inl('chip', 34, 14, 'vertical-align:-1px')} ${esc(p1b)}</p>
    <ul>${items.map((i) => '<li>' + inl('tick', 13, 13, 'vertical-align:-1px;margin-' + other + ':9px') + esc(i) + '</li>').join('')}</ul>
    <div style="position:relative">
      <svg style="position:absolute;${side}:-58px;top:6px" width="44" height="100">${[0, 1, 2].map((i) => [0, 1, 2, 3, 4, 5].map((j) => `<circle cx="${6 + i * 14}" cy="${6 + j * 16}" r="2" fill="#b9c0c8"/>`).join('')).join('')}</svg>
      <p>${inl('photo', 220, 150, 'float:' + other + ';margin-' + side + ':16px;margin-top:4px')}${esc(p2)}</p>
    </div>
    <h2 style="clear:both">${esc(h2b)} ${inl('flag', 30, 20, 'vertical-align:-2px;margin-' + side + ':8px')}</h2>
    <p>${esc(p3)}</p>
    <p>${ico('icon', 'margin-' + other + ':8px')}${esc(p4)}</p>
  </div><script>${PICS}</script></body></html>`;
}

(async () => {
  const b = await chromium.launch(), page = await b.newPage();
  const jobs = [['slides', slides(md('slides'), false)], ['slides-fa', slides(md('slides-fa'), true)], ['brochure', brochure(md('brochure'))],
    ['inline', inline(md('inline'), false)], ['inline-fa', inline(md('inline-fa'), true)]];
  for (const [name, html] of jobs) {
    const f = path.join(TMP, name + '.html'); fs.writeFileSync(f, html);
    await page.goto(fileUrl(f)); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(300);
    await page.pdf({ path: pdfPath('chrome-pictures--' + name + '.pdf'), preferCSSPageSize: true, printBackground: true });
    if (name === 'brochure' || name === 'inline') {      // wkhtmltopdf: the same page, its canvases drawn by Qt WebKit (the HTML with the pictures already in)
      fs.writeFileSync(path.join(TMP, name + '-wk.html'), await page.content());
      cp.execFileSync('wkhtmltopdf', ['-q', '--enable-local-file-access', '-B', '0', '-T', '0', '-L', '0', '-R', '0', '--page-size', 'A4',
        '--disable-smart-shrinking', path.join(TMP, name + '-wk.html'), pdfPath('wk-pictures--' + name + '.pdf')], { stdio: 'ignore' });
    }
    console.log(name);
  }
  await b.close(); fs.rmSync(TMP, { recursive: true, force: true });
})();
