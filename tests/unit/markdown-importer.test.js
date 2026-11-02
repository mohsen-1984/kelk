/**
 * MarkdownImporter (plan P2.3): .docx → Markdown through its own zip reader, the equation / horizontal-rule tokens
 * and mammoth's style map, and the HTML path for rules inside tables. Node's test runner + jsdom: the vendor
 * libraries (DOMPurify, turndown + GFM, mammoth) and lib/MathCore.js + lib/MarkdownImporter.js run in a jsdom
 * window, as in the page; the .docx fixtures are written here with JSZip (the smallest package mammoth opens).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const JSZip = require('jszip');

const ROOT = path.resolve(__dirname, '..', '..');
const HR_TOKEN = '⟦KHR⟧';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/**
 * The scripts run in Node's realm with jsdom's DOM passed in as their browser globals: mammoth's zip library
 * checks `instanceof ArrayBuffer`, and the importer's zip reader makes its buffers with Node's Blob / Response /
 * DecompressionStream — in jsdom's own realm (runScripts) those would be another realm's ArrayBuffers.
 */
function importerWindow() {
  const w = new JSDOM('<!doctype html><html><body></body></html>').window;
  // a free name resolves on the jsdom window (document, DOMParser, and what the scripts set: mammoth,
  // TurndownService, …), except the binary / stream types, which stay Node's
  const NODE = new Set(['ArrayBuffer', 'Uint8Array', 'Uint32Array', 'DataView', 'Blob', 'Response', 'DecompressionStream',
    'TextDecoder', 'TextEncoder', 'Promise', 'module', 'exports', 'define', 'require']);
  const scope = new Proxy(w, {
    has: function (t, k) { return typeof k === 'string' && !NODE.has(k) && k in t; },
    get: function (t, k) { return k === Symbol.unscopables ? undefined : t[k]; }
  });
  [
    'vendor/purify.min_3.4.16.js',
    'vendor/turndown/turndown_7.2.4.js',
    'vendor/turndown/turndown-plugin-gfm_1.0.2.js',
    'vendor/mammoth.browser.min_1.12.3.js',
    'lib/MathCore.js',
    'lib/MarkdownImporter.js'
  ].forEach(function (f) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    // a script's top-level `var X = …` is a page global (turndown, the GFM plugin): put it on the window
    const vars = (src.match(/^var ([A-Za-z_$][\w$]*) =/gm) || []).map(function (m) { return m.slice(4, -2); });
    const exp = vars.map(function (v) { return 'if (typeof ' + v + ' !== "undefined") window.' + v + ' = ' + v + ';'; }).join('');
    new Function('scope', 'with (scope) {\n' + src + '\n;' + exp + '\n}').call(w, scope);
  });
  return w;
}
const win = importerWindow();

// ── .docx fixtures ──────────────────────────────────────────────────────────

const STYLES = [
  ['paragraph', 'Quote', 'Quote'],
  ['paragraph', 'Title', 'Title'],
  ['paragraph', 'Subtitle', 'Subtitle'],
  ['paragraph', 'CodeBlock', 'Code Block'],
  ['paragraph', 'CodeBlockGap', 'Code Block Gap'],
  ['paragraph', 'BoxSpacer', 'Box Spacer'],
  ['paragraph', 'ListParagraph', 'List Paragraph'],
  ['character', 'InlineCode', 'Inline Code']
];

/** body: the XML inside <w:body>; opts.compression 'STORE' | 'DEFLATE', opts.comment, opts.streamFiles */
async function docx(body, opts) {
  opts = opts || {};
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
    '</Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>');
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' +
    '</Relationships>');
  zip.file('word/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="' + W + '">' +
    STYLES.map(function (s) { return '<w:style w:type="' + s[0] + '" w:styleId="' + s[1] + '"><w:name w:val="' + s[2] + '"/></w:style>'; }).join('') +
    '</w:styles>');
  zip.file('word/numbering.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="' + W + '">' +
    '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum>' +
    '<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum>' +
    '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>' +
    '</w:numbering>');
  zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="' + W + '" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"' +
    ' xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><w:body>' + body + '</w:body></w:document>');
  const buf = await zip.generateAsync({
    type: 'uint8array',
    compression: opts.compression || 'DEFLATE',
    comment: opts.comment,
    streamFiles: !!opts.streamFiles
  });
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

const p = function (text, ppr) { return '<w:p>' + (ppr ? '<w:pPr>' + ppr + '</w:pPr>' : '') + (text ? '<w:r><w:t xml:space="preserve">' + text + '</w:t></w:r>' : '') + '</w:p>'; };
const style = function (id) { return '<w:pStyle w:val="' + id + '"/>'; };
const num = function (id) { return '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="' + id + '"/></w:numPr>'; };
// Kelk's own rule (DocxBuilder._horizontalRule): a VML shape with o:hr="t" in a centred paragraph
const VML_HR = '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:pict><v:rect id="_x0000_i1025" style="width:0;height:0.75pt" o:hralign="center" o:hrstd="t" o:hrnoshade="t" o:hr="t" fillcolor="#A0A0A0" stroked="f"/></w:pict></w:r></w:p>';
const VML_RUN = '<w:r><w:pict><v:rect id="_x0000_i1026" style="width:0;height:0.75pt" o:hr="t" fillcolor="#A0A0A0" stroked="f"/></w:pict></w:r>';
// an older Kelk file or another tool: an empty paragraph with only a bottom border
const BORDER_HR = function (ppr) { return '<w:p><w:pPr>' + (ppr || '') + '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="A0A0A0"/></w:pBdr></w:pPr></w:p>'; };
const cell = function (inner) { return '<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr>' + inner + '</w:tc>'; };
const table = function (rows) { return '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>' + rows.map(function (r) { return '<w:tr>' + r.join('') + '</w:tr>'; }).join('') + '</w:tbl>'; };
const OMATH = '<m:oMath><m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup></m:oMath>';

async function md(body, opts) {
  const r = await win.MarkdownImporter.create().fromDocx(await docx(body, opts));
  return r.markdown;
}

/** every line of a GFM table block starts and ends with a pipe (a broken table has a line that does not) */
function tableIntact(markdown) {
  const lines = markdown.split('\n');
  const first = lines.findIndex(function (l) { return /^\|/.test(l); });
  assert.ok(first >= 0, 'no table in:\n' + markdown);
  let i = first;
  while (i < lines.length && lines[i].trim()) {
    assert.match(lines[i], /^\|.*\|$/, 'table line ' + (i - first + 1) + ' broken in:\n' + markdown);
    i++;
  }
  return lines.slice(first, i);
}

// ── horizontal rules (HR_TOKEN) ──────────────────────────────────────────────

test('HR: Kelk\'s VML rule and a bordered empty paragraph become --- (no token)', async function () {
  const out = await md(p('Before') + VML_HR + p('Middle') + BORDER_HR() + p('After'));
  assert.ok(!out.includes(HR_TOKEN), out);
  assert.equal(out, 'Before\n\n---\n\nMiddle\n\n---\n\nAfter\n');
});

test('HR: a rule inside a table cell leaves the table intact and no token', async function () {
  const body = table([[cell(p('Cell')), cell(p('Content'))], [cell(p('a rule')), cell(p('above') + VML_HR + p('below'))]]) +
    table([[cell(p('x')), cell(p('y'))], [cell(BORDER_HR()), cell(p('z'))]]);
  const out = await md(body);
  assert.ok(!out.includes(HR_TOKEN), out);
  const rows = tableIntact(out);
  assert.ok(rows.some(function (r) { return /above<br>below/.test(r); }), out);
  assert.ok(!/^---$/m.test(out), 'a rule line inside a table:\n' + out);
});

test('HR: a rule paragraph inside a list (numbered, bordered, empty) leaves no token', async function () {
  const body = p('one', num(1)) + BORDER_HR(num(1)) + p('two', num(1)) + p('after');
  const out = await md(body);
  assert.ok(!out.includes(HR_TOKEN), out);
  assert.match(out, /^- +one$/m);
  assert.match(out, /^- +two$/m);
  // the rule stays inside the list: in the item before it (indented), and the list is not split in two
  assert.match(out, /^ {2,}---$/m, out);
  assert.doesNotMatch(out, /^---$/m, out);
});

test('HR: a rule run inside a paragraph with text leaves no token', async function () {
  const out = await md('<w:p><w:r><w:t xml:space="preserve">text before </w:t></w:r>' + VML_RUN + '<w:r><w:t xml:space="preserve"> after</w:t></w:r></w:p>');
  assert.ok(!out.includes(HR_TOKEN), out);
  assert.match(out, /text before/);
  assert.match(out, /after/);
});

test('HR (HTML path): <hr> inside a table cell keeps the table intact', function () {
  const r = win.MarkdownImporter.create().fromHtml('<table><tr><th>A</th><th>B</th></tr><tr><td>x<hr>y</td><td><p>p1</p><hr><p>p2</p></td></tr></table>');
  const rows = tableIntact(r.markdown);
  assert.equal(rows.length, 3, r.markdown);
  assert.match(rows[2], /x<br>y/);
  assert.match(rows[2], /p1<br>p2/);
});

test('HR (HTML path): a rule at a cell\'s edge leaves no line break; the cell\'s own line breaks stay', function () {
  const r = win.MarkdownImporter.create().fromHtml('<table><tr><th>A</th><th>B</th><th>C</th></tr>' +
    '<tr><td><hr>top rule</td><td>bottom rule<hr></td><td>line one<br><br>line three</td></tr></table>');
  const rows = tableIntact(r.markdown);
  assert.match(rows[2], /^\| top rule \| bottom rule \| line one<br><br>line three \|$/, r.markdown);
});

test('HR: a rule as the first item of a list goes before the list; as the only item it replaces the list', async function () {
  const first = await md(BORDER_HR(num(1)) + p('two', num(1)) + p('three', num(1)));
  assert.ok(!first.includes(HR_TOKEN), first);
  assert.match(first, /^---\n\n- +two\n- +three\n$/, first);
  const only = await md(p('before') + BORDER_HR(num(2)) + p('after'));
  assert.ok(!only.includes(HR_TOKEN), only);
  assert.equal(only, 'before\n\n---\n\nafter\n');
});

// ── the zip reader (readZip / inflateEntry / writeZip, run when the .docx has equations or rules) ────────────

test('zip reader: deflated, stored, with an archive comment and with data descriptors — the equation comes back', async function () {
  const body = p('Area') + '<w:p><w:r><w:t xml:space="preserve">is </w:t></w:r>' + OMATH + '</w:p>';
  for (const opts of [{}, { compression: 'STORE' }, { comment: 'a zip comment, as some tools write' }, { streamFiles: true }]) {
    const out = await md(body, opts);
    assert.equal(out, 'Area\n\nis $x^{2}$\n', JSON.stringify(opts) + '\n' + out);
  }
});

test('zip reader: a display equation (oMathPara) becomes $$ … $$', async function () {
  const out = await md(p('Before') + '<w:p><m:oMathPara>' + OMATH + '</m:oMathPara></w:p>' + p('After'));
  assert.equal(out, 'Before\n\n$$\nx^{2}\n$$\n\nAfter\n');
});

test('zip reader: a .docx without equations or rules is passed to mammoth untouched', async function () {
  const out = await md(p('Just text') + p('Two paragraphs'));
  assert.equal(out, 'Just text\n\nTwo paragraphs\n');
});

test('zip reader: something that is not a zip is rejected', async function () {
  const junk = new TextEncoder().encode('this is not a docx file at all').buffer;
  await assert.rejects(win.MarkdownImporter.create().fromDocx(junk));
});

// ── mammoth's style map (Kelk's own style names) ─────────────────────────────

test('style map: Title, Subtitle, Quote, Code Block, Inline Code; spacer paragraphs dropped', async function () {
  const body = p('The title', style('Title')) + p('The subtitle', style('Subtitle')) +
    p('A quoted line', style('Quote')) + p('', style('BoxSpacer')) +
    p('let a = 1;', style('CodeBlock')) + p('let b = 2;', style('CodeBlock')) + p('', style('CodeBlockGap')) +
    '<w:p><w:r><w:t xml:space="preserve">Call </w:t></w:r><w:r><w:rPr><w:rStyle w:val="InlineCode"/></w:rPr><w:t>f(x)</w:t></w:r><w:r><w:t xml:space="preserve"> now.</w:t></w:r></w:p>';
  const out = await md(body);
  assert.equal(out, '# The title\n\n## The subtitle\n\n> A quoted line\n\n```\nlet a = 1;\nlet b = 2;\n```\n\nCall `f(x)` now.\n');
});

test('style map: numbered and bulleted paragraphs in the Quote style stay list items inside the quote', async function () {
  const out = await md(p('Quoted intro', style('Quote')) + p('first', style('Quote') + num(2)) + p('second', style('Quote') + num(2)) +
    p('a bullet', style('Quote') + num(1)));
  assert.match(out, /^> Quoted intro$/m);
  assert.match(out, /^> 1\. +first$/m);
  assert.match(out, /^> 2\. +second$/m);
  assert.match(out, /^> - +a bullet$/m);
});
