/**
 * Normalisers for the golden snapshots (tests/golden/run.js): each output reduced to what is stable from one run
 * and one machine to the next, as readable text.
 *
 *   html(text)        HtmlBuilder export: data URIs → a placeholder (see dataUri)
 *   docx(buffer)      DocxBuilder .docx: its XML parts (not docProps/: dates, application), media renamed in order,
 *                     pretty-printed one element per line (property containers *Pr on one line), concatenated
 *   mhtml(text)       WordHtmlBuilder .doc: the MIME boundary (a timestamp) fixed, quoted-printable parts decoded,
 *                     base64 parts (pictures) replaced by a placeholder
 *   markdown(text)    PDF → MD and DOCX → MD: data URIs → a placeholder
 *
 * Pictures rendered on a canvas (a formula's PNG fallback) differ in their bytes between platforms (font
 * rasterising, anti-aliasing), so raster data is never kept, only its type; vector and font data (SVG, woff2, …)
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

/** data:<mime>;base64,<data> → data:<mime>;base64,[<bytes> bytes sha256 <hash>] (raster: [raster]) */
function dataUri(text) {
  return text.replace(/data:([\w.+-]+\/[\w.+-]+)((?:;[\w-]+=[^;,]*)*);base64,([A-Za-z0-9+/=\s]+)/g, function (m, mime, params, b64) {
    if (RASTER.test(mime)) return 'data:' + mime + params + ';base64,[raster]';
    const bytes = Buffer.from(b64.replace(/\s+/g, ''), 'base64');
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

function html(text) {
  return eol(splitHead(vectors(dataUri(text)), ''));
}

function markdown(text) {
  return eol(dataUri(text));
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

/** the .docx's parts as one text: every XML part but docProps/*, media renamed media/imageN.ext in order */
async function docx(buf) {
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
    if (!/\.(xml|rels)$/.test(n) || /^docProps\//.test(n)) continue;
    const text = await zip.file(n).async('string');
    out.push('', '<!-- ===== ' + n + ' ===== -->', fix(prettyXml(text)).replace(/\n$/, ''));
  }
  for (const f of order) {
    const n = 'word/media/' + f, type = f.split('.').pop();
    if (!zip.files[n]) continue;
    const bytes = await zip.file(n).async('nodebuffer');
    out.push('', '<!-- ===== word/media/' + rename.get(f) + ' ===== ' +
      (/^(png|jpe?g|gif|webp|bmp)$/i.test(type) ? 'raster' : bytes.length + ' bytes sha256 ' + sha(bytes)) + ' -->');
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
function mhtml(text) {
  const m = /boundary="([^"]+)"/.exec(text);
  if (!m) return eol('# not MHTML\n' + dataUri(text));
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
      out.push('<!-- ===== ' + label + '===== -->', RASTER.test(type) ? '[raster]' : '[' + bytes.length + ' bytes sha256 ' + sha(bytes) + ']');
      return;
    }
    const t = vectors(dataUri(enc === 'quoted-printable' ? unQp(body) : body).replace(/\r\n?/g, '\n')).replace(/\s+$/, '');
    out.push(/^text\/html$/i.test(type) && /<\/head>/i.test(t) ? splitHead(t, label) : '<!-- ===== ' + label + '===== -->\n' + t);
  });
  return eol(out.join('\n'));
}

module.exports = { html, markdown, docx, mhtml, prettyXml, dataUri };
