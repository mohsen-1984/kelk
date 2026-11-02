/**
 * Security hardening (plan P1.2): hostile Markdown in the preview leaves the app intact (DOMPurify with
 * SANITIZE_NAMED_PROPS and no <style> / form controls), the custom header / footer HTML is sanitised, and
 * HtmlBuilder.toHtml writes no on* handler, script or javascript: URL (B4). The CSP itself is checked in a
 * browser (docs/reports/P1.2-security.md): jsdom does not enforce it.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { appWindow } = require('./helpers');

const OPENED = { 'kelk.ui': JSON.stringify({ lang: 'en', sampleSeen: true }), 'kelk.content': '# Title\n\nText.' };

const HOSTILE = [
  '# Hostile',
  '',
  '<div id="toasts">fake toasts</div>',
  '<div id="editor">fake editor</div>',
  '',
  '<style>body{display:none} #toasts{display:none}</style>',
  '',
  '<img src="x" onerror="window.__pwned = 1">',
  '',
  '<form action="https://example.com/steal"><input name="password" type="password"><button>Sign in</button>',
  '<textarea>t</textarea><select><option>o</option></select></form>',
  '',
  '<a href="javascript:window.__pwned=2">click</a> <a href="#part">to the part</a>',
  '',
  '<p id="part" onclick="window.__pwned = 3">The part.</p>',
  '',
  '<svg><a xlink:href="javascript:window.__pwned=4"><text>svg</text></a></svg>',
  '',
  '[web](https://example.com/)'
].join('\n');

function setText(w, md) {
  const area = w.document.getElementById('editor');
  area.value = md;
  area.dispatchEvent(new w.InputEvent('input', { inputType: 'insertText' }));
  w.Kelk.preview.flush();
}

/** Every handler / script URL / forbidden tag that would reach a page from `html`. */
function active(html) {
  const found = [];
  if (/<script\b/i.test(html)) found.push('<script>');
  if (/<style\b/i.test(html)) found.push('<style>');
  if (/<(form|input|button|textarea|select)\b/i.test(html)) found.push('form control');
  if (/\son[a-z]+\s*=/i.test(html)) found.push('on* handler');
  if (/javascript:/i.test(html)) found.push('javascript:');
  return found;
}

/** The body of an exported page (its <head> holds the page's own stylesheet). */
function body(html) {
  const i = html.indexOf('<body');
  assert.ok(i > 0, 'a whole page');
  return html.slice(i);
}

async function exportText(w, kind) {
  const K = w.Kelk;
  let file = null;
  K.ui.download = function (data) {
    file = data;
  };
  K.fonts.forHtml = function () {
    return Promise.resolve([]);
  };
  await K.exporter.run(kind, null);
  assert.ok(file, kind + ': a file was made');
  return typeof file === 'string' ? file : await file.text();
}

test('hostile Markdown leaves the app’s elements, styles and toasts intact', async function () {
  const { window: w, errors } = await appWindow(OPENED);
  const d = w.document;
  const K = w.Kelk;
  const toasts = d.getElementById('toasts');
  const editor = d.getElementById('editor');
  setText(w, HOSTILE);
  const box = d.getElementById('preview');
  assert.ok(box.textContent.includes('fake toasts'), 'the document is shown');

  // ids of the document are prefixed: the app's own elements are still the ones found by id
  assert.equal(d.querySelectorAll('[id="toasts"]').length, 1);
  assert.equal(d.getElementById('toasts'), toasts);
  assert.equal(d.getElementById('editor'), editor);
  assert.ok(box.querySelector('#user-content-toasts'), 'prefixed id kept in the document');
  // a link of the document to its own id follows the prefix
  assert.equal(box.querySelector('a[href^="#"]').getAttribute('href'), '#user-content-part');

  // no <style>, form control, handler or script URL in the pane
  assert.deepEqual(active(box.innerHTML), []);
  assert.equal(w.getComputedStyle(d.body).display !== 'none', true, 'the page is still shown');
  assert.equal(w.__pwned, undefined);

  // a toast still reaches the app's toast box
  K.ui.toast('still here');
  assert.ok(toasts.textContent.includes('still here'));

  // web links open a new tab without opener or referrer
  const web = box.querySelector('a[href="https://example.com/"]');
  assert.equal(web.target, '_blank');
  assert.equal(web.rel, 'noopener noreferrer');
  box.querySelectorAll('a[target]').forEach(function (a) {
    assert.equal(a.rel, 'noopener noreferrer');
  });

  // the builders get the sanitised HTML
  assert.deepEqual(active(K.preview.html()), []);
  assert.deepEqual(errors, []);
  w.close();
});

test('task-list checkboxes stay (disabled, as marked writes them); other inputs go', async function () {
  const { window: w } = await appWindow(OPENED);
  setText(
    w,
    '- [ ] open\n- [x] done\n\n<input type="checkbox" onclick="window.__pwned=1"> <input type="text" value="v">'
  );
  const html = w.Kelk.preview.html();
  assert.ok(html.includes('<li><input disabled="" type="checkbox"> open</li>'), html);
  assert.ok(html.includes('<li><input checked="" disabled="" type="checkbox"> done</li>'), html);
  const inputs = w.document.querySelectorAll('#preview input');
  assert.equal(inputs.length, 3, 'two task boxes and the raw checkbox');
  inputs.forEach(function (i) {
    assert.equal(i.type, 'checkbox');
    assert.ok(i.disabled);
    assert.equal(i.getAttribute('onclick'), null);
  });
  assert.ok(!html.includes('data-kelk-task'), 'no mark left');
  w.close();
});

test('the exports of hostile Markdown carry no script, handler or script URL', async function () {
  const { window: w } = await appWindow(OPENED);
  setText(w, HOSTILE);
  const html = await exportText(w, 'html');
  assert.ok(html.includes('fake toasts'), 'the text is exported');
  assert.deepEqual(active(body(html)), []);
  const md = await exportText(w, 'md');
  assert.ok(md.includes('<div id="toasts">'), 'MD export keeps the text as written');
  w.close();
});

test('custom header / footer HTML is sanitised before it reaches the builders', async function () {
  const hostile =
    '<p style="text-align:center">{title} <img src="x" onerror="window.__pwned=5"><script>window.__pwned=6</script>' +
    '<a href="javascript:window.__pwned=7">x</a><style>body{display:none}</style><b>bold</b></p>';
  const stored = Object.assign({}, OPENED, {
    'kelk.settings': JSON.stringify({
      schemaVersion: 1,
      headerFooter: { mode: 'custom', header: hostile, footer: hostile }
    })
  });
  const { window: w } = await appWindow(stored);
  const K = w.Kelk;
  assert.deepEqual(active(K.preview.sanitize(hostile)), []);
  assert.ok(
    K.preview.sanitize(hostile).includes('style="text-align:center"'),
    'the inline style the builders read stays'
  );

  const html = await exportText(w, 'html');
  assert.ok(/<header class="kelk-header"[^>]*>[\s\S]*<b>bold<\/b>/.test(html), 'the header is drawn');
  assert.ok(/<footer class="kelk-footer"/.test(html), 'the footer is drawn');
  assert.deepEqual(active(body(html)), []);
  assert.equal(w.__pwned, undefined);
  w.close();
});

test('HtmlBuilder.toHtml writes no on* handler, script or javascript: URL (B4)', async function () {
  const { window: w } = await appWindow(OPENED);
  const created = [];
  const make = w.document.createElement.bind(w.document);
  w.document.createElement = function (tag) {
    created.push(String(tag).toLowerCase());
    return make.apply(null, arguments);
  };
  const html = await w.HtmlBuilder.create()
    .configure({ header: { html: '<p><img src="x" onerror="alert(1)"> head</p>' } })
    .addFromHtml(
      '<h1 onclick="alert(1)">T</h1><p>a <img src="x" onerror="alert(2)"> <a href="javascript:alert(3)">j</a>' +
        ' <a href=" JaVa&#x09;ScRiPt:alert(4)">k</a> <a href="https://example.com/" onmouseover="alert(5)">ok</a></p>' +
        '<script>alert(6)</script><iframe srcdoc="<script>alert(7)</script>"></iframe>' +
        '<object data="javascript:alert(8)"></object><svg><a xlink:href="javascript:alert(9)"><text>s</text></a></svg>' +
        '<form action="javascript:alert(10)"><button formaction="javascript:alert(11)">b</button></form>'
    )
    .toHtml();
  w.document.createElement = make;
  // (the builder keeps form markup as document content; the app's sanitiser removes it before)
  const left = active(body(html)).filter(function (x) {
    return x !== 'form control';
  });
  assert.deepEqual(left, [], 'no handler, script or script URL');
  assert.ok(html.includes('href="https://example.com/"'), 'a web link stays');
  assert.ok(html.includes('head'), 'the custom header is drawn');
  assert.ok(!/<iframe|<object/i.test(html), 'no embedded page');
  assert.ok(!created.includes('article'), 'the content was not parsed into the app’s document');

  // the helper on its own
  const box = w.document.createElement('div');
  box.innerHTML = '<a href="vbscript:x" onfocus="y">a</a><img src="data:image/svg+xml;base64,AAAA">';
  w.HtmlBuilder.defang(box);
  assert.equal(box.innerHTML, '<a>a</a><img src="data:image/svg+xml;base64,AAAA">');
  w.close();
});

test('after the prefix, <a name> anchors, image maps and <area> links still work (review of P1.2)', async function () {
  const { window: w } = await appWindow(OPENED);
  setText(
    w,
    '<a name="sec"></a>\n\n[go](#sec)\n\n<map name="m"><area shape="rect" coords="0,0,9,9" href="https://example.com/" target="_blank"></map>' +
      '<img src="x.png" usemap="#m" alt="m">'
  );
  const html = w.document.getElementById('preview').innerHTML;
  assert.ok(html.includes('name="user-content-sec"') && html.includes('href="#user-content-sec"'), 'the link follows the anchor');
  assert.ok(html.includes('usemap="#user-content-m"'), 'the image follows its map');
  assert.ok(/<area[^>]*rel="noopener noreferrer"/.test(html), '<area target> gets rel');
  w.close();
});

test('DOCX bookmarks: ids alike in their first 24 characters stay distinct (review of P1.2)', async function () {
  const { window: w } = await appWindow(OPENED);
  const bm = w.DocxBuilder._bookmarkName;
  const a = bm('user-content-introduction-to-the-topic-a'),
    b = bm('user-content-introduction-to-the-topic-b');
  assert.notEqual(a, b, a + ' / ' + b);
  assert.equal(a, 'bm_introduction_to_the_topic_a', 'the prefix is not in the name');
  assert.ok(bm('x'.repeat(80)).length <= 40, 'Word’s 40 characters');
  w.close();
});

test('HtmlBuilder.defang removes SVG animation and XML / script data: URLs (review of P1.2)', async function () {
  const { window: w } = await appWindow(OPENED);
  const box = w.document.createElement('div');
  box.innerHTML =
    '<svg><a><animate attributeName="href" values="javascript:alert(1)"></animate><set attributeName="href" to="javascript:alert(2)"></set><text>s</text></a></svg>' +
    '<a href="data:text/xml,&lt;x:script/&gt;">x</a><a href="data:application/xml,x">y</a><img src="data:image/png;base64,AAAA">';
  w.HtmlBuilder.defang(box);
  assert.ok(!/<animate|<set/i.test(box.innerHTML), 'no SVG animation');
  assert.ok(!/href="data:/i.test(box.innerHTML), 'no XML data: link');
  assert.ok(box.innerHTML.includes('src="data:image/png'), 'a picture stays');
  w.close();
});
