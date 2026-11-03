/**
 * The app under its Content Security Policy in Chromium (Playwright from `npm ci`), from file:// and from
 * http://localhost (a static server standing in for GitHub Pages). Not part of `npm test`
 * (it needs a browser):   node tests/unit/csp-browser.js [out folder] [file|http|both]
 * Per origin: the page loads with no CSP violation; an injected inline script is refused (the policy is in
 * force); hostile Markdown leaves the app intact; MathJax draws a formula; PDF, DOCX, DOC, HTML and MD
 * exports each give a file; a PDF imports through pdf.js. Prints the measurements as JSON; exit 1 on a failure.
 */
/* global window, document, InputEvent, getComputedStyle -- the functions passed to page.evaluate run in the page */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'kelk-csp'));
const { chromium } = require(path.join(process.env.NODE_TOOLS || path.join(ROOT, 'node_modules'), 'playwright'));
fs.mkdirSync(OUT, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.json': 'application/json',
  '.wasm': 'application/wasm'
};
function serve() {
  return new Promise(function (resolve) {
    const srv = http
      .createServer(function (req, res) {
        const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        if (!p.startsWith(ROOT)) {
          res.writeHead(403);
          return res.end();
        }
        fs.readFile(p, function (err, data) {
          if (err) {
            res.writeHead(404);
            return res.end();
          }
          res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
          res.end(data);
        });
      })
      .listen(0, function () {
        resolve(srv);
      });
  });
}

const HOSTILE =
  '# Hostile\n\n<div id="toasts">fake</div>\n\n<style>body{display:none}</style>\n\n<img src="x" onerror="window.__pwned=1">\n\n<form><input value="i"><button>b</button></form>\n\n<a href="javascript:window.__pwned=2">j</a>' +
  '\n\n![remote](https://example.invalid/remote.png)';
const MATH =
  '# Math\n\n$$\\int_0^1 x^2\\,dx = \\frac{1}{3}$$\n\nInline $a^2+b^2=c^2$ and text.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n';
const PDF = path.join(ROOT, 'tests', 'pdf-lab', 'pdf', 'rtl', 'chrome-rtl-github-bg--fa-article.pdf');

async function run(label, url) {
  const r = { label: label, url: url, violations: [], console: [], pageErrors: [], steps: {} };
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true });
  await ctx.addInitScript(function () {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', function (e) {
      window.__csp.push(
        e.violatedDirective + ' | ' + (e.blockedURI || '') + ' | ' + (e.sourceFile || '') + ':' + e.lineNumber
      );
    });
  });
  const page = await ctx.newPage();
  page.on('console', function (m) {
    if (m.type() === 'error' || m.type() === 'warning' || /Content Security Policy/i.test(m.text()))
      r.console.push(m.type() + ': ' + m.text().slice(0, 300));
  });
  page.on('requestfailed', function (q) {
    r.console.push('requestfailed: ' + q.url().slice(-60));
  });
  page.on('response', function (q) {
    if (q.status() >= 400) r.console.push('status ' + q.status() + ': ' + q.url().slice(-60));
  });
  page.on('pageerror', function (e) {
    r.pageErrors.push(String(e).slice(0, 300));
  });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(
    function () {
      return window.Kelk && window.Kelk.editor && document.getElementById('preview');
    },
    null,
    { timeout: 30000 }
  );
  r.steps.load = {
    ok: true,
    ms: Date.now() - t0,
    csp: await page.evaluate(function () {
      const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      return m ? m.content : null;
    })
  };

  // the CSP is enforced: an inline script is refused (this one violation is expected)
  r.steps.inlineProbe = await page.evaluate(function () {
    const s = document.createElement('script');
    s.textContent = 'window.__inline = 1';
    document.head.appendChild(s);
    return new Promise(function (ok) {
      setTimeout(function () {
        ok({ inlineRan: window.__inline === 1 });
      }, 200);
    });
  });
  const probe = await page.evaluate(function () {
    return window.__csp.splice(0);
  });
  r.steps.inlineProbe.violations = probe;

  async function setText(md) {
    await page.evaluate(function (md) {
      const a = document.getElementById('editor');
      a.value = md;
      a.dispatchEvent(new InputEvent('input', { inputType: 'insertText' }));
      window.Kelk.preview.flush();
    }, md);
  }

  // hostile Markdown
  await setText(HOSTILE);
  await page.waitForTimeout(800);
  r.steps.hostile = await page.evaluate(function () {
    window.Kelk.ui.toast('toast after hostile text');
    return {
      pwned: window.__pwned || null,
      bodyDisplay: getComputedStyle(document.body).display,
      toastsIds: document.querySelectorAll('[id="toasts"]').length,
      toastShown: document.getElementById('toasts').textContent.includes('toast after hostile text'),
      previewHasStyleOrForm: !!document.querySelector(
        '#preview style, #preview form, #preview input, #preview button:not(.code-copy):not([class*="copy"])'
      )
    };
  });

  // MathJax
  await setText(MATH);
  const tm = Date.now();
  try {
    await page.waitForSelector('#preview .kelk-math svg, #preview mjx-container svg', { timeout: 30000 });
    r.steps.mathjax = {
      ok: true,
      ms: Date.now() - tm,
      formulas: await page.$$eval('#preview .kelk-math svg', function (x) {
        return x.length;
      })
    };
  } catch (e) {
    r.steps.mathjax = { ok: false, error: String(e).slice(0, 200) };
  }

  // exports
  r.steps.exports = {};
  for (const kind of ['pdf', 'docx', 'doc', 'html', 'md']) {
    const te = Date.now();
    try {
      const [dl] = await Promise.all([
        page.waitForEvent('download', { timeout: 90000 }),
        page.evaluate(function (k) {
          return window.Kelk.exporter.run(k, null);
        }, kind)
      ]);
      const file = path.join(OUT, label + '-' + dl.suggestedFilename());
      await dl.saveAs(file);
      r.steps.exports[kind] = {
        ok: true,
        bytes: fs.statSync(file).size,
        ms: Date.now() - te,
        name: dl.suggestedFilename()
      };
    } catch (e) {
      r.steps.exports[kind] = { ok: false, error: String(e).slice(0, 200) };
    }
  }
  // the HTML export: formulas present, no handler
  const htmlFile = fs.readdirSync(OUT).filter(function (f) {
    return f.indexOf(label + '-') === 0 && /\.html$/.test(f);
  })[0];
  if (htmlFile) {
    const h = fs.readFileSync(path.join(OUT, htmlFile), 'utf8');
    r.steps.exports.html.svgFormulas = (h.match(/class="kelk-math"[^>]*>\s*<svg/g) || []).length;
    r.steps.exports.html.onHandlers = (h.match(/\son[a-z]+\s*=/gi) || []).length;
  }

  // PDF import through pdf.js
  const before = await page.evaluate(function () {
    return window.Kelk.editor.value();
  });
  const ti = Date.now();
  await page.setInputFiles('#file-import', PDF);
  try {
    await page.waitForFunction(
      function (b) {
        const v = window.Kelk.editor.value();
        return v !== b && v.length > 200;
      },
      before,
      { timeout: 90000 }
    );
    const v = await page.evaluate(function () {
      return window.Kelk.editor.value();
    });
    r.steps.pdfImport = { ok: true, ms: Date.now() - ti, chars: v.length, head: v.slice(0, 80) };
  } catch (e) {
    r.steps.pdfImport = {
      ok: false,
      error: String(e).slice(0, 200),
      dialogs: await page.evaluate(function () {
        return Array.from(document.querySelectorAll('dialog[open]')).map(function (d) {
          return d.id;
        });
      })
    };
  }
  // pdf.js's image decoders (JPEG 2000, JBIG2 / CCITT) are WebAssembly on the page's main thread: the CSP must
  // let them compile ('wasm-unsafe-eval'), or scanned PDFs lose their pictures (no pure-JS fallback is shipped)
  r.steps.wasm = await page.evaluate(async function () {
    const out = {};
    await window.Kelk.libs.need('pdfimport'); // on demand (the PDF import above loaded it already)
    const F = new window.PdfImporter()._binaryDataFactory();
    for (const name of ['openjpeg.wasm', 'jbig2.wasm']) {
      try {
        const buf = await new F().fetch({ kind: 'wasmUrl', filename: name });
        await WebAssembly.compile(buf);
        out[name] = 'ok';
      } catch (e) {
        out[name] = String(e).slice(0, 160);
      }
    }
    return out;
  });
  await page.waitForTimeout(500);
  r.violations = await page.evaluate(function () {
    return window.__csp;
  });
  await browser.close();
  return r;
}

(async function () {
  const srv = await serve();
  const port = srv.address().port;
  const results = [];
  const which = process.argv[3] || 'both';
  if (which !== 'http')
    results.push(await run('file', 'file:///' + ROOT.replace(/\\/g, '/').replace(/^\//, '') + '/index.html'));
  if (which !== 'file') results.push(await run('http', 'http://localhost:' + port + '/index.html'));
  srv.close();
  console.log(JSON.stringify(results, null, 2));
  let failed = 0;
  results.forEach(function (r) {
    const s = r.steps,
      bad = [];
    if (!s.load.csp) bad.push('no CSP meta');
    if (r.violations.length) bad.push(r.violations.length + ' CSP violation(s)');
    if (s.inlineProbe.inlineRan || !s.inlineProbe.violations.length) bad.push('policy not in force');
    if (
      s.hostile.pwned ||
      s.hostile.bodyDisplay === 'none' ||
      s.hostile.toastsIds !== 1 ||
      !s.hostile.toastShown ||
      s.hostile.previewHasStyleOrForm
    )
      bad.push('hostile Markdown');
    if (!s.mathjax.ok) bad.push('MathJax');
    Object.keys(s.exports).forEach(function (k) {
      if (!s.exports[k].ok || !s.exports[k].bytes) bad.push('export ' + k);
    });
    if (s.exports.html && s.exports.html.onHandlers) bad.push('on* in the HTML export');
    if (!s.pdfImport.ok) bad.push('PDF import');
    Object.keys(s.wasm).forEach(function (k) {
      if (s.wasm[k] !== 'ok') bad.push('WebAssembly ' + k);
    });
    if (r.pageErrors.length) bad.push(r.pageErrors.length + ' page error(s)');
    console.log(r.label.padEnd(5), bad.length ? 'FAIL ' + bad.join(', ') : 'ok');
    failed += bad.length;
  });
  if (failed) process.exitCode = 1;
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
