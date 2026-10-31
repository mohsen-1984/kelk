// run the importer with a hook: node scripts/dbg.js file.pdf "<js run in page after import, has r>"
const fs=require('fs');const {chromium}=require('./env.js').req('playwright');
(async()=>{const [file,code='']=process.argv.slice(2);const b=await chromium.launch();const page=await b.newPage();
page.on('console',m=>console.log('[c]',m.text()));
await page.goto(require('./env.js').lab); if (process.env.PRE) await page.evaluate((c)=>{window.__pre=c;}, process.env.PRE);
const out=await page.evaluate(async([b64,code])=>{const bin=atob(b64),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
window.__dbgCode=1; eval(window.__pre||''); const imp=PdfImporter.create({images: window.__img || 'drop'}); window.__imp=imp;
const r=await imp.fromArrayBuffer(u.buffer); return eval(code||'r.markdown');},[fs.readFileSync(file).toString('base64'),code]);
console.log(typeof out==='string'?out:JSON.stringify(out,null,1));await b.close();})();
