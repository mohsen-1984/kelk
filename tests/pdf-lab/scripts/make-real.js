// The real-producer corpus (plan P4.1), the browsers' half: the documents of make-real.ps1 as web pages
// (corpus/real-src/real-<doc>.html, from corpus/real-<doc>.md through the vendored marked, in a plain office-like
// style, right to left where the document is), printed by the browsers people print with on Windows:
//   edge--<doc>.pdf      Microsoft Edge, headless --print-to-pdf (no header and footer), A4
//   chrome--<doc>.pdf    Chromium through Playwright (page.pdf), A4 — Chrome's own engine
//   firefox--<doc>.pdf   Firefox through WebDriver BiDi browsingContext.print, A4: its print engine drawing with cairo
//                        (Producer «cairo 1.18.4», Creator «Mozilla Firefox 152.0.3»); the print dialog's «Save to PDF» draws with
//                        Skia now (profile.js) and has no headless way in: a silent window.print() wrote nothing here
// The decks have no web page (a slide is not printed from a browser). Windows paths by default; set EDGE=… and
// FIREFOX=… for other installs; a browser that is missing is skipped with a note.
//   node tests/pdf-lab/scripts/make-real.js [doc-regex]
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const { pdfPath, fileUrl, req, KELK } = require('./env.js');
const marked = require(KELK + '/vendor/marked.umd.min_18.0.14.js');
const LAB = path.join(__dirname, '..'), SRC = path.join(LAB, 'corpus', 'real-src');
const EDGE = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const FIREFOX = process.env.FIREFOX || 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';

// doc → its page's language, direction and body font (the fonts a Windows user has; the browser falls back if not)
const DOCS = {
  'real-memo-fa': { lang: 'fa', font: '"B Nazanin", Tahoma, sans-serif', size: 17 },
  'real-report-fa': { lang: 'fa', font: 'Tahoma, sans-serif', size: 14 },
  'real-letter-ar': { lang: 'ar', font: '"Traditional Arabic", "Sakkal Majalla", serif', size: 20 },
  'real-readme-en': { lang: 'en', font: '"Segoe UI", Arial, sans-serif', size: 15 },
  'real-sheet-borders-fa': { lang: 'fa', font: '"B Nazanin", Tahoma, sans-serif', size: 15, grid: true },
  'real-sheet-plain-fa': { lang: 'fa', font: 'Tahoma, sans-serif', size: 13, grid: false }
};
const only = process.argv[2] ? new RegExp(process.argv[2]) : null;
const names = Object.keys(DOCS).filter((n) => !only || only.test(n));

function page(name) {
  const d = DOCS[name], rtl = d.lang !== 'en';
  const md = fs.readFileSync(path.join(LAB, 'corpus', name + '.md'), 'utf8');
  const title = (md.match(/^# (.*)$/m) || [, name])[1];
  const css = `body{font-family:${d.font};font-size:${d.size}px;line-height:1.6;color:#111;max-width:46em;margin:0 auto}
    h1{font-size:1.6em;color:#1f3864} h2{font-size:1.25em;color:#2f5496}
    table{border-collapse:collapse;margin:.6em 0} th,td{padding:3px 10px;text-align:start;vertical-align:top}
    ${d.grid === false ? 'th{border-bottom:1px solid #fff}' : 'th,td{border:1px solid #444} th{background:#d9e1f2}'}`;
  const html = `<!DOCTYPE html>\n<html lang="${d.lang}" dir="${rtl ? 'rtl' : 'ltr'}">\n<head>\n<meta charset="utf-8">\n<title>${title}</title>\n` +
    `<style>\n${css}\n</style>\n</head>\n<body>\n${marked.parse(md)}</body>\n</html>\n`;
  const file = path.join(SRC, name + '.html');
  fs.writeFileSync(file, html);
  return file;
}

function edge(file, out) {
  if (!fs.existsSync(EDGE)) return 'no Edge at ' + EDGE;
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'real-edge-'));
  try {
    cp.execFileSync(EDGE, ['--headless', '--disable-gpu', '--no-first-run', '--user-data-dir=' + prof, '--no-pdf-header-footer',
      '--print-to-pdf=' + out, fileUrl(file)], { stdio: 'ignore', timeout: 60000 });
  } finally { fs.rmSync(prof, { recursive: true, force: true }); }
  return fs.existsSync(out) ? null : 'Edge wrote nothing';
}

// Firefox: its WebDriver BiDi server (built in, --remote-debugging-port), one session, one print per page
async function firefoxSession() {
  if (!fs.existsSync(FIREFOX)) return null;
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'real-ff-')), port = 9300 + Math.floor(Math.random() * 600);
  const proc = cp.spawn(FIREFOX, ['--headless', '-no-remote', '-profile', prof, '--remote-debugging-port', String(port)], { stdio: 'ignore' });
  let ws;
  for (let i = 0; i < 60 && !ws; i++) {
    await new Promise((r) => setTimeout(r, 500));
    ws = await new Promise((res) => { const w = new WebSocket('ws://127.0.0.1:' + port + '/session'); w.onopen = () => res(w); w.onerror = () => res(null); });
  }
  if (!ws) { proc.kill(); return null; }
  let id = 0; const wait = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } };
  const send = (method, params) => new Promise((res, rej) => {
    const n = ++id; const t = setTimeout(() => rej(new Error(method + ': timeout')), 60000);
    wait.set(n, (m) => { clearTimeout(t); m.type === 'error' ? rej(new Error(method + ': ' + m.error + ' ' + m.message)) : res(m.result); });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  await send('session.new', { capabilities: {} });
  const ctx = (await send('browsingContext.getTree', {})).contexts[0].context;
  return {
    async print(file, out) {
      await send('browsingContext.navigate', { context: ctx, url: fileUrl(file), wait: 'complete' });
      const r = await send('browsingContext.print', { context: ctx, background: true, page: { width: 21, height: 29.7 }, margin: { top: 1.5, bottom: 1.5, left: 1.5, right: 1.5 } });
      fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
    },
    // browser.close ends Firefox (its launcher process has a child of its own: killing the one we spawned is not enough)
    async close() {
      ws.send(JSON.stringify({ id: ++id, method: 'browser.close', params: {} }));
      await new Promise((r) => setTimeout(r, 3000)); ws.close();
      try { cp.execFileSync('taskkill', ['/T', '/F', '/PID', String(proc.pid)], { stdio: 'ignore' }); } catch (e) { /* already gone */ }
      try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { /* a file still held: the temp folder keeps it */ }
    }
  };
}

(async () => {
  fs.mkdirSync(SRC, { recursive: true });
  const { chromium } = req('playwright');
  const browser = await chromium.launch(), pg = await browser.newPage();
  const ff = await firefoxSession();
  if (!ff) console.log('Firefox: no WebDriver BiDi session (not installed at ' + FIREFOX + '?) — firefox--* skipped');
  for (const name of names) {
    const file = page(name);
    const e = edge(file, pdfPath('edge--' + name + '.pdf'));
    if (e) console.log('edge--' + name + ': ' + e);
    await pg.goto(fileUrl(file), { waitUntil: 'load' });
    await pg.pdf({ path: pdfPath('chrome--' + name + '.pdf'), format: 'A4', printBackground: true, margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' } });
    if (ff) await ff.print(file, pdfPath('firefox--' + name + '.pdf'));
    console.log(name, ['edge', 'chrome', 'firefox'].map((p) => { const f = pdfPath(p + '--' + name + '.pdf'); return fs.existsSync(f) ? p + ' ' + fs.statSync(f).size : p + ' -'; }).join(', '));
  }
  if (ff) await ff.close();
  await browser.close();
})().catch((e) => { console.error(e); process.exitCode = 1; });
