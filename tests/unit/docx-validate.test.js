/**
 * The checks of tests/docx-validate.js on crafted input (plan P2.3, review findings): Markup Compatibility errors,
 * pictures that are not what their type says, an xmllint that says nothing or crashes, a soffice that fails while
 * an old PDF is lying in the output folder. The real tools are not needed: fake ones are written to a temp folder.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { applyMce, pictureProblem, xmllint, soffice } = require('../docx-validate.js');

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
const W15 = 'http://schemas.microsoft.com/office/word/2012/wordml';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABgAAAAMCAIAAAD3UuoiAAAAF0lEQVR42mOQz4+hCmIYNWjUoFGD8CEAQKoHUDfC1K4AAAAASUVORK5CYII=', 'base64');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kelk-dv-test-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** a fake command: Windows .cmd or a POSIX shell script, running `body` (one line per platform) */
function fake(name, win, sh) {
  const f = path.join(tmp, name + (process.platform === 'win32' ? '.cmd' : ''));
  fs.writeFileSync(f, process.platform === 'win32' ? '@echo off\r\n' + win + '\r\n' : '#!/bin/sh\n' + sh + '\n');
  if (process.platform !== 'win32') fs.chmodSync(f, 0o755);
  return f;
}

test('Markup Compatibility: an undeclared mc:Ignorable prefix and mc:MustUnderstand are errors', function () {
  const r = applyMce(`<w:document xmlns:w="${W}" xmlns:mc="${MC}" mc:Ignorable="zz"><w:body/></w:document>`);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /undeclared prefix "zz"/);
  const m = applyMce(`<w:document xmlns:w="${W}" xmlns:mc="${MC}" xmlns:qq="urn:x" mc:MustUnderstand="qq"><w:body/></w:document>`);
  assert.match(m.errors.join(), /mc:MustUnderstand="qq"/);
});

test('Markup Compatibility: w15 attributes are checked before they are stripped; others are counted', function () {
  const xml = (v) => `<w:numbering xmlns:w="${W}" xmlns:mc="${MC}" xmlns:w14="${W14}" xmlns:w15="${W15}" mc:Ignorable="w14 w15">` +
    `<w:abstractNum w:abstractNumId="0" w15:restartNumberingAfterBreak="0"><w:lvl w:ilvl="0" w15:tentative="${v}" w14:foo="x"><w:start w:val="1"/></w:lvl></w:abstractNum></w:numbering>`;
  const good = applyMce(xml('1'));
  assert.deepEqual(good.errors, []);
  assert.equal(good.stripped.get('w14:foo'), 1);
  assert.ok(!/w15:|w14:|mc:Ignorable/.test(good.xml.replace(/xmlns:\w+="[^"]*"/g, '')), good.xml);
  const bad = applyMce(xml('bogus'));
  assert.match(bad.errors.join(), /w15:tentative="bogus"/);
});

test('pictures: a whole PNG passes; a PNG cut short, a 40-byte stub and a mislabelled one fail', function () {
  assert.equal(pictureProblem(PNG, 'image/png'), '');
  assert.match(pictureProblem(PNG.subarray(0, PNG.length - 12), 'image/png'), /IEND/);
  assert.match(pictureProblem(Buffer.alloc(40), 'image/png'), /not a PNG/);
  assert.match(pictureProblem(PNG, 'image/jpeg'), /JPEG/);
  assert.equal(pictureProblem(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml'), '');
  assert.match(pictureProblem(Buffer.from('<svg'), 'image/svg+xml'), /not an SVG/);
});

test('xmllint: a file it says nothing about fails; a crash fails the run', function () {
  const part = path.join(tmp, 'part.xml');
  fs.writeFileSync(part, '<x/>');
  const keep = process.env.XMLLINT;
  try {
    process.env.XMLLINT = fake('silent-xmllint', 'exit /b 0', 'exit 0');
    const r = xmllint([part]);
    assert.match(r.get(part).join(), /no verdict/);
    process.env.XMLLINT = fake('crash-xmllint', 'echo out of memory 1>&2 & exit /b 2', 'echo out of memory >&2; exit 2');
    assert.throws(() => xmllint([part]), /exit status 2/);
  } finally {
    if (keep === undefined) delete process.env.XMLLINT;
    else process.env.XMLLINT = keep;
  }
});

test('soffice: a failing conversion is reported with its status and output; an old PDF does not count', function () {
  const out = path.join(tmp, 'pdf');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'case.pdf'), '%PDF-' + 'x'.repeat(2000)); // left by an earlier run
  const docx = path.join(tmp, 'case.docx');
  fs.writeFileSync(docx, 'not a docx');
  const keep = process.env.SOFFICE;
  try {
    process.env.SOFFICE = fake('fail-soffice', 'echo Error: source file could not be loaded 1>&2 & exit /b 1', 'echo "Error: source file could not be loaded" >&2; exit 1');
    const [r] = soffice([docx], out);
    assert.equal(r.ok, false);
    assert.match(r.why, /exit 1, no PDF/);
    assert.match(r.why, /could not be loaded/);
    assert.match(r.why, /retry with a fresh profile/);
  } finally {
    if (keep === undefined) delete process.env.SOFFICE;
    else process.env.SOFFICE = keep;
  }
});
