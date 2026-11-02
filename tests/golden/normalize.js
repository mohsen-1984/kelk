/**
 * Normalisers for the golden snapshots (tests/golden/run.js): each output reduced to what is stable from one run
 * and one machine to the next, as readable text.
 *
 *   html(text)        HtmlBuilder export: data URIs → a placeholder (see dataUri)
 *   docx(buffer)      DocxBuilder .docx: its XML parts (docProps/core.xml's dates → [date]), media renamed in order,
 *                     pretty-printed one element per line (property containers *Pr on one line), concatenated
 *   mhtml(text)       WordHtmlBuilder .doc: the MIME boundary (a timestamp) fixed, quoted-printable parts decoded,
 *                     base64 parts (pictures) replaced by a placeholder
 *   markdown(text)    PDF → MD and DOCX → MD: data URIs → a placeholder
 *
 * Pictures rendered on a canvas (a formula's PNG fallback) differ in their bytes between platforms (font
 * rasterising, anti-aliasing): of a raster picture the type and the size in its header are kept, its bytes (as a
 * hash) only when they are an input picture's (see raster()); vector and font data (SVG, woff2, …)
 * come from Kelk's own files and MathJax's paths and are kept as a size and a hash, and so are long SVG path
 * outlines (d="…"). Each output is split into sections, one marker line each (<!-- ===== name ===== -->): the
 * parts of a .docx or .doc, and an HTML page's head and body — run.js stores large repeated sections once.
 */
'use strict';

const crypto = require('node:crypto');
const JSZip = require('jszip');

const RASTER = /^image\/(png|jpe?g|gif|webp|bmp)$/i;

function sha(data) {
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 12);
}

const DATA_URI = /data:([\w.+-]+\/[\w.+-]+)((?:;[\w-]+=[^;,]*)*);base64,([A-Za-z0-9+/=\s]+)/g;

/** a raster picture's width × height from its header; null when the header is not one of its type */
function rasterSize(b, type) {
  try {
    if (/png/i.test(type)) {
      if (b.length < 33 || b.toString('hex', 0, 8) !== '89504e470d0a1a0a' || b.toString('latin1', 12, 16) !== 'IHDR') return null;
      if (b.toString('latin1', b.length - 8, b.length - 4) !== 'IEND') return null; // cut short
      return [b.readUInt32BE(16), b.readUInt32BE(20)];
    }
    if (/jpe?g/i.test(type)) {
      if (b[0] !== 0xff || b[1] !== 0xd8 || b[b.length - 2] !== 0xff || b[b.length - 1] !== 0xd9) return null;
      for (let i = 2; i + 9 < b.length;) {
        if (b[i] !== 0xff) return null;
        const marker = b[i + 1], len = b.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
        i += 2 + len;
      }
      return null;
    }
    if (/gif/i.test(type)) return /^GIF8[79]a$/.test(b.toString('latin1', 0, 6)) ? [b.readUInt16LE(6), b.readUInt16LE(8)] : null;
    if (/bmp/i.test(type)) return b.toString('latin1', 0, 2) === 'BM' ? [b.readInt32LE(18), Math.abs(b.readInt32LE(22))] : null;
  } catch (e) {
    return null;
  }
  return null;
}

/**
 * A raster picture's placeholder. Its bytes are kept (as a hash) only when they are the input's own — a picture
 * of the case passed through unchanged; a picture the builder drew (a formula on a canvas) differs in its bytes
 * between platforms, so of it only the type and the size in the header are kept, and for a formula whose width is
 * measured in the page (ctx.measured, see rtlTextWidths) not even the size. A header that does not decode is said
 * so: a damaged picture changes the snapshot.
 */
function raster(bytes, type, ctx, measured) {
  const b = Buffer.from(bytes), t = type.replace(/^image\//, '');
  const size = rasterSize(b, type);
  if (!size || !size[0] || !size[1]) return '[raster ' + t + ' NOT DECODABLE, ' + b.length + ' bytes]';
  if (ctx && ctx.inputs && ctx.inputs.has(sha(b))) return '[raster ' + t + ' ' + size.join('×') + ' sha256 ' + sha(b) + ' = an input picture]';
  return measured ? '[raster ' + t + ', size measured]' : '[raster ' + t + ' ' + size.join('×') + ']';
}

/** the hashes of the raster pictures of a case's input (data URIs) */
function inputPictures(source) {
  const set = new Set();
  String(source || '').replace(DATA_URI, (m, mime, params, b64) => {
    if (RASTER.test(mime)) set.add(sha(Buffer.from(b64.replace(/\s+/g, ''), 'base64')));
    return m;
  });
  return set;
}

/** data:<mime>;base64,<data> → data:<mime>;base64,[<bytes> bytes sha256 <hash>] (raster: see raster()) */
function dataUri(text, ctx) {
  return text.replace(DATA_URI, function (m, mime, params, b64) {
    const bytes = Buffer.from(b64.replace(/\s+/g, ''), 'base64');
    if (RASTER.test(mime)) return 'data:' + mime + params + ';base64,' + raster(bytes, mime, ctx);
    return 'data:' + mime + params + ';base64,[' + bytes.length + ' bytes sha256 ' + sha(bytes) + ']';
  });
}

/** an SVG path's d="…" (MathJax glyph outlines, hundreds of KB per formula document) → its length and hash */
function vectors(text) {
  return text.replace(/ d="([^"]{120,})"/g, (m, d) => ' d="[' + d.length + ' chars sha256 ' + sha(d) + ']"');
}

/** LF line ends and one final newline; trailing spaces are kept (two of them are a Markdown line break) */
function eol(text) {
  return String(text).replace(/\r\n?/g, '\n').replace(/\n*$/, '\n');
}

/** an HTML page as two sections, head and body: the head (CSS) is the same in many cases (run.js shares it) */
function splitHead(text, label) {
  const i = text.search(/<\/head>/i);
  if (i < 0) return text;
  const j = i + '</head>'.length;
  return '<!-- ===== ' + label + 'head ===== -->\n' + text.slice(0, j) + '\n<!-- ===== ' + label + 'body ===== -->\n' + text.slice(j).replace(/^\r?\n/, '');
}

/**
 * A formula with right-to-left \text: its width is not kept. MathJax measures such text in the page
 * (mtextInheritFont, MathCore.renderNow): an SVG <text> getBBox at the page's small text size, where Chromium on
 * Linux rounds each glyph's advance to whole pixels and Windows does not — with the same font file (Vazirmatn, a
 * registered face) Case 36 of latex-formulas is 7.997 em wide on Windows and 7.934 em on Ubuntu (first CI run).
 * So, only for a formula whose TeX holds a right-to-left letter: data-width, the SVG's width, its viewBox width and
 * the x of every translate() (positions after the text) → [measured]; in the .doc, the picture's width. The TeX,
 * the glyph outlines, heights and everything else stay.
 */
const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const M = '[measured]';
function rtlTextWidths(text) {
  return text
    .replace(/(<(span|div) class="kelk-math"[^>]*?data-tex="([^"]*)"[^>]*>)([\s\S]*?<\/(?:svg|math)>)/g, (m, open, tag, tex, body) => {
      if (!RTL.test(tex)) return m;
      return open.replace(/data-width="[^"]*"/, 'data-width="' + M + '"') + body
        .replace(/(<svg\b[^>]*?\bwidth=")[\d.]+(ex")/, '$1' + M + '$2')
        .replace(/(<svg\b[^>]*?\bviewBox="[-\d.]+ [-\d.]+ )[-\d.]+/, '$1' + M)
        .replace(/translate\([-\d.]+([,)])/g, 'translate(' + M + '$1');
    })
    .replace(/<img\b[^>]*class="kelk-math-img"[^>]*>/g, (m) => {
      const alt = (/\balt="([^"]*)"/.exec(m) || [])[1] || '';
      return RTL.test(alt) ? m.replace(/\bwidth="[\d.]+"/, 'width="' + M + '"') : m;
    });
}

function html(text, ctx) {
  return eol(splitHead(rtlTextWidths(vectors(dataUri(text, ctx))), ''));
}

function markdown(text, ctx) {
  return eol(dataUri(text, ctx));
}

/**
 * XML → one element per line, two-space indent; an element whose content is only text stays on one line, and so
 * does a property container (w:pPr, w:rPr, w:tcPr, …: local name ending in "Pr") or a run (w:r, m:r) with
 * everything in it. A root element's run of namespace declarations (docx.js writes the same ≈40 on every part)
 * becomes one placeholder with their count and hash.
 */
function prettyXml(xml) {
  const src = String(xml).replace(/^﻿/, '').replace(/(?:\s+xmlns(?::[\w.-]+)?="[^"]*"){5,}/, (m) => {
    const n = (m.match(/xmlns/g) || []).length;
    return ' [' + n + ' xmlns declarations sha256 ' + sha(m.trim().split(/\s+/).sort().join(' ')) + ']';
  });
  const tokens = src.match(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<[^>]+>|[^<]+/g) || [];
  const out = [];
  let depth = 0;
  const pad = () => '  '.repeat(depth);
  const nameOf = (t) => (/^<\/?([^\s/>]+)/.exec(t) || [])[1] || '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^<\?/.test(t) || /^<!--/.test(t)) {
      out.push(pad() + t);
      continue;
    }
    if (!/^</.test(t)) {
      if (t.trim()) out.push(pad() + t);
      continue;
    }
    if (/^<\//.test(t)) {
      depth = Math.max(0, depth - 1);
      out.push(pad() + t);
      continue;
    }
    if (/\/>$/.test(t)) {
      out.push(pad() + t);
      continue;
    }
    const name = nameOf(t);
    // <x>text</x> on one line
    if (i + 2 < tokens.length && !/^</.test(tokens[i + 1]) && tokens[i + 2] === '</' + name + '>') {
      out.push(pad() + t + tokens[i + 1] + tokens[i + 2]);
      i += 2;
      continue;
    }
    // a property container (and a run: its properties and text): everything up to its end tag on one line
    if (/Pr$|^r$/.test(name.split(':').pop())) {
      let j = i + 1, level = 1, s = t;
      for (; j < tokens.length && level; j++) {
        const u = tokens[j];
        if (/^<\//.test(u) && nameOf(u) === name) level--;
        else if (/^<[^/!?]/.test(u) && !/\/>$/.test(u) && nameOf(u) === name) level++;
        s += u;
      }
      out.push(pad() + s);
      i = j - 1;
      continue;
    }
    out.push(pad() + t);
    depth++;
  }
  return out.join('\n') + '\n';
}

/**
 * docProps/core.xml's dates (written at every build) → [date]; the rest of the document properties is kept
 * (title, creator — Kelk's version —, subject, keywords; app.xml, custom.xml).
 */
function propDates(xml) {
  return xml.replace(/(<dcterms:(?:created|modified)\b[^>]*>)[^<]*(<\/dcterms:)/g, '$1[date]$2');
}

/** the .docx's parts as one text: every XML part (docProps' dates normalised), media renamed media/imageN.ext */
async function docx(buf, ctx) {
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort();
  const media = names.filter((n) => /^word\/media\//.test(n));
  // media names are hashes of the bytes (docx.js): a formula's PNG differs by platform — number them instead,
  // in the order the relationships list them
  const rels = names.includes('word/_rels/document.xml.rels') ? await zip.file('word/_rels/document.xml.rels').async('string') : '';
  const order = [];
  rels.replace(/Target="media\/([^"]+)"/g, (m, f) => order.push(f));
  media.forEach((n) => {
    const f = n.slice('word/media/'.length);
    if (!order.includes(f)) order.push(f);
  });
  const rename = new Map(order.map((f, i) => [f, 'image' + (i + 1) + f.replace(/^[^.]*/, '')]));
  const fix = (s) => s.replace(/media\/([0-9a-f]{20,}\.\w+)/g, (m, f) => 'media/' + (rename.get(f) || f));
  const out = ['# ' + names.length + ' parts: ' + names.map(fix).sort().join(', ')];
  for (const n of names) {
    if (!/\.(xml|rels)$/.test(n)) continue;
    const text = propDates(await zip.file(n).async('string'));
    out.push('', '<!-- ===== ' + n + ' ===== -->', fix(prettyXml(text)).replace(/\n$/, ''));
  }
  for (const f of order) {
    const n = 'word/media/' + f, type = f.split('.').pop();
    if (!zip.files[n]) continue;
    const bytes = await zip.file(n).async('nodebuffer');
    out.push('', '<!-- ===== word/media/' + rename.get(f) + ' ===== -->',
      /^(png|jpe?g|gif|webp|bmp)$/i.test(type) ? raster(bytes, 'image/' + type.replace('jpg', 'jpeg'), ctx) : '[' + bytes.length + ' bytes sha256 ' + sha(bytes) + ']');
  }
  // docx.js gives a hyperlink's relationship a random id (rId + 21 characters): number them in order of appearance
  const ids = new Map();
  return eol(out.join('\n').replace(/\brId(?!\d+")[\w-]{12,}/g, (m) => {
    if (!ids.has(m)) ids.set(m, 'rIdRandom' + (ids.size + 1));
    return ids.get(m);
  }));
}

/** quoted-printable (RFC 2045) → UTF-8 text */
function unQp(s) {
  const bytes = [];
  const t = s.replace(/=\r?\n/g, '');
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '=' && /^[0-9A-F]{2}$/i.test(t.substr(i + 1, 2))) {
      bytes.push(parseInt(t.substr(i + 1, 2), 16));
      i += 2;
    } else bytes.push(...Buffer.from(t[i], 'utf8'));
  }
  return Buffer.from(bytes).toString('utf8');
}

/** the .doc (MHTML): its parts, text decoded, pictures as placeholders */
function mhtml(text, ctx) {
  const m = /boundary="([^"]+)"/.exec(text);
  if (!m) return eol('# not MHTML\n' + dataUri(text, ctx));
  // the pictures of formulas with right-to-left \text (their size is measured in the page: rtlTextWidths)
  const measured = new Set();
  const parts = text.split('--' + m[1]);
  const out = ['# MHTML, ' + (parts.length - 2) + ' parts'];
  parts.slice(1).forEach((p) => {
    if (/^--/.test(p)) return; // the closing boundary
    const sep = p.search(/\r?\n\r?\n/);
    const head = p.slice(0, sep).trim(), body = p.slice(sep).replace(/^\r?\n\r?\n/, '');
    const loc = (/Content-Location: (.*)/.exec(head) || [])[1] || '?';
    const type = ((/Content-Type: ([^;\r\n]*)/.exec(head) || [])[1] || '').trim();
    const enc = ((/Content-Transfer-Encoding: (.*)/.exec(head) || [])[1] || '').trim();
    const label = loc.trim() + ' (' + type + ') ';
    out.push('');
    if (enc === 'base64') {
      const bytes = Buffer.from(body.replace(/\s+/g, ''), 'base64');
      const file = loc.trim().split('/').pop();
      out.push('<!-- ===== ' + label + '===== -->', RASTER.test(type) ? raster(bytes, type, ctx, measured.has(file)) : '[' + bytes.length + ' bytes sha256 ' + sha(bytes) + ']');
      return;
    }
    const decoded = enc === 'quoted-printable' ? unQp(body) : body;
    decoded.replace(/<img\b[^>]*class="kelk-math-img"[^>]*>/g, (img) => {
      const src = (/\bsrc="([^"]*)"/.exec(img) || [])[1] || '', alt = (/\balt="([^"]*)"/.exec(img) || [])[1] || '';
      if (RTL.test(alt)) measured.add(src.split('/').pop());
      return img;
    });
    const t = rtlTextWidths(vectors(dataUri(decoded, ctx).replace(/\r\n?/g, '\n'))).replace(/\s+$/, '');
    out.push(/^text\/html$/i.test(type) && /<\/head>/i.test(t) ? splitHead(t, label) : '<!-- ===== ' + label + '===== -->\n' + t);
  });
  return eol(out.join('\n'));
}

module.exports = { html, markdown, docx, mhtml, prettyXml, dataUri, inputPictures, rasterSize };
