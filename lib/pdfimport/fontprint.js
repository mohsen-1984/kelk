/**
 * PdfImporter — fontprints (lib/pdfimport/fontprint.js)
 * ============================================================================
 * A glyph known by its outline. A subset keeps each glyph's outline as its font has it, whatever codes, names or
 * ToUnicode the file gives it: the hash of the outline (a fontprint) finds the glyph again in a font Kelk knows, and
 * with it the character that font's own cmap gives the glyph. The data — a table of fontprints per face — is
 * lib/pdfimport/fontprints.js, made by tools/build-fontprints.js and tools/fontprints.html with the code below; only
 * hashes and characters are kept there, never a font.
 *
 *   PdfImporter._fontprint.hashes(bytes)        a TrueType program (Uint8Array) → { glyph id: fontprint }, the glyphs
 *                                               with an outline only (a space, a ZWNJ have none)
 *   PdfImporter._fontprint.names(bytes)         → { family, face } from the name table ('' when it has none)
 *   PdfImporter._fontprint.face(bytes, o)       a reference font → { family, face, glyphs, prints: [[fontprint, text,
 *                                               others]] }: text is the character the font's cmap gives the glyph
 *                                               (through its GSUB for a form or a ligature the cmap does not name),
 *                                               others every other Arabic letter or digit that names the same glyph
 *                                               (ي and ی, 4 ٤ ۴: one outline, and no fontprint tells them apart)
 *   PdfImporter._fontprint.pack(prints)         → the table as a string, a record a glyph, records a space apart
 *   PdfImporter._fontprint.unpack(string)       → { fontprint: [text, others] }
 *   PdfImporter._fontprint.source(faces)        → lib/pdfimport/fontprints.js as text (the one writer of that file)
 *   PdfImporter._fontprint.match(hashes, data, name)  the fontprints of a file's font against the data → the face that
 *                                               knows most of them (name, the file's font name, settles a tie):
 *                                               { family, face, known, of, text: { glyph id: [text, others] } }
 *
 * The fontprint: every contour's points in order — x, y in thousandths of the em, and whether the point is on the
 * curve — a composite's components laid out by their offsets and scales; two 32-bit FNV-1a hashes of that, 48 bits
 * kept, as eight base64url characters. Hinting, glyph names, codes and widths are not in it.
 * A part of the importer (PdfImporter.PARTS, with the data): the font arbiter reads it (trust.js). Needs
 * lib/PdfImporter.js (its sfnt reader, PdfImporter._internal.sfntLigatures). TrueType outlines only (glyf): a CFF or
 * a Type 3 font has no fontprint.
 */
(function (global) {
    'use strict';
    const PdfImporter = global.PdfImporter || (typeof require === 'function' ? require('../PdfImporter.js') : null);
    const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const V = 1;
    // the characters a reference face is kept for: Basic Latin and Latin-1, general punctuation, the Arabic blocks and
    // their presentation forms (a face's other glyphs — extended Latin, Cyrillic — are not what a Persian file gets wrong)
    const KEPT = /^[!-~\u00A1-\u00FF\u2010-\u2044\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFC]+$/;

    function tables(d) {
        const v = new DataView(d.buffer, d.byteOffset, d.byteLength), T = {};
        const n = v.getUint16(4);
        for (let k = 0; k < n; k++) {
            const o = 12 + 16 * k;
            T[String.fromCharCode(d[o], d[o + 1], d[o + 2], d[o + 3])] = v.getUint32(o + 8);
        }
        return { v: v, T: T };
    }

    /** every glyph's contours: glyph id → [[x, y, on], …] per contour, in font units (null: no outline) */
    function outlines(d) {
        const t = tables(d), v = t.v, T = t.T;
        if (T.head === undefined || T.loca === undefined || T.glyf === undefined || T.maxp === undefined) return null;
        const upm = v.getUint16(T.head + 18), long = v.getInt16(T.head + 50) === 1, n = v.getUint16(T.maxp + 4);
        const span = function (g) {
            const a = long ? v.getUint32(T.loca + 4 * g) : 2 * v.getUint16(T.loca + 2 * g);
            const b = long ? v.getUint32(T.loca + 4 * g + 4) : 2 * v.getUint16(T.loca + 2 * g + 2);
            return b > a ? T.glyf + a : -1;
        };
        const read = function (g, depth) {
            const o = g < n ? span(g) : -1;
            if (o < 0 || depth > 4) return [];
            const nc = v.getInt16(o);
            if (nc >= 0) {
                if (!nc) return [];
                const ends = [];
                for (let k = 0; k < nc; k++) ends.push(v.getUint16(o + 10 + 2 * k));
                const np = ends[nc - 1] + 1;
                let q = o + 10 + 2 * nc; q += 2 + v.getUint16(q);
                const flags = [];
                while (flags.length < np) { const f = d[q++]; flags.push(f); if (f & 8) { let r = d[q++]; while (r-- > 0) flags.push(f); } }
                const xs = []; let x = 0, y = 0;
                flags.forEach(function (f) { if (f & 2) { const dx = d[q++]; x += f & 16 ? dx : -dx; } else if (!(f & 16)) { x += v.getInt16(q); q += 2; } xs.push(x); });
                const pts = flags.map(function (f, k) { if (f & 4) { const dy = d[q++]; y += f & 32 ? dy : -dy; } else if (!(f & 32)) { y += v.getInt16(q); q += 2; } return [xs[k], y, f & 1]; });
                const out = []; let s = 0;
                ends.forEach(function (e) { out.push(pts.slice(s, e + 1)); s = e + 1; });
                return out;
            }
            // a composite: each component's contours through its 2 × 2 matrix, then its offset
            const out = []; let q = o + 10, more = true;
            while (more) {
                const fl = v.getUint16(q), cg = v.getUint16(q + 2); q += 4;
                let dx = 0, dy = 0, a = 1, b = 0, c = 0, e = 1;
                if (fl & 1) { dx = v.getInt16(q); dy = v.getInt16(q + 2); q += 4; } else { dx = v.getInt8(q); dy = v.getInt8(q + 1); q += 2; }
                if (!(fl & 2)) dx = dy = 0;                              // (points matched, not offsets: no move read)
                const f2 = function () { const r = v.getInt16(q) / 16384; q += 2; return r; };
                if (fl & 8) a = e = f2(); else if (fl & 0x40) { a = f2(); e = f2(); } else if (fl & 0x80) { a = f2(); b = f2(); c = f2(); e = f2(); }
                read(cg, depth + 1).forEach(function (ct) { out.push(ct.map(function (p) { return [a * p[0] + c * p[1] + dx, b * p[0] + e * p[1] + dy, p[2]]; })); });
                more = !!(fl & 0x20);
            }
            return out;
        };
        return { upm: upm, n: n, read: function (g) { try { return read(g, 0); } catch (err) { return []; } } };
    }

    function print(contours, upm) {
        let h1 = 0x811C9DC5, h2 = 0x9747B28C;
        const put = function (x) {
            for (let k = 0; k < 2; k++) {
                const b = (x >> (8 * k)) & 0xFF;
                h1 = Math.imul(h1 ^ b, 0x01000193) >>> 0;
                h2 = Math.imul(h2 ^ b, 0x01000193) >>> 0; h2 = (h2 ^ (h2 >>> 15)) >>> 0;
            }
        };
        contours.forEach(function (ct) {
            put(0x7FFF); put(ct.length);
            ct.forEach(function (p) { put(Math.round(p[0] * 1000 / upm)); put(Math.round(p[1] * 1000 / upm)); put(p[2] ? 1 : 0); });
        });
        const bytes = [h1 >>> 24, (h1 >>> 16) & 255, (h1 >>> 8) & 255, h1 & 255, h2 >>> 24, (h2 >>> 16) & 255];
        let s = '';
        for (let k = 0; k < 6; k += 3) {
            const x = (bytes[k] << 16) | (bytes[k + 1] << 8) | bytes[k + 2];
            s += B64[x >> 18] + B64[(x >> 12) & 63] + B64[(x >> 6) & 63] + B64[x & 63];
        }
        return s;
    }

    function hashes(d) {
        const o = outlines(d), out = {};
        if (!o || !o.upm) return out;
        for (let g = 0; g < o.n; g++) { const c = o.read(g); if (c.length) out[g] = print(c, o.upm); }
        return out;
    }

    function names(d) {
        const t = tables(d), v = t.v, o = t.T.name, got = {};
        if (o === undefined) return { family: '', face: '' };
        const n = v.getUint16(o + 2), at = o + v.getUint16(o + 4);
        for (let k = 0; k < n; k++) {
            const r = o + 6 + 12 * k, pid = v.getUint16(r), id = v.getUint16(r + 6), len = v.getUint16(r + 8), off = at + v.getUint16(r + 10);
            if ([1, 2, 16, 17].indexOf(id) < 0 || off + len > d.length) continue;
            let s = '';
            if (pid === 3 || pid === 0) for (let q = 0; q + 1 < len; q += 2) s += String.fromCharCode(v.getUint16(off + q));
            else for (let q = 0; q < len; q++) s += String.fromCharCode(d[off + q]);
            s = s.replace(/\s+/g, ' ').trim();
            // (the Windows names first, an English one over another language's)
            const rank = (pid === 3 ? 2 : 0) + (pid === 3 && v.getUint16(r + 4) === 0x409 ? 1 : 0);
            if (s && (!got[id] || rank > got[id][0])) got[id] = [rank, s];
        }
        const pick = function (a, b) { return (got[a] || got[b] || [0, ''])[1]; };
        return { family: pick(16, 1), face: pick(17, 2) };
    }

    function face(d, o) {
        const m = PdfImporter._internal.sfntLigatures(d), hs = hashes(d), nm = names(d), seen = {}, prints = [];
        const text = function (g, depth) { return m.g2u[g] || m[g] || (depth < 4 && m.base[g] !== undefined ? text(m.base[g], depth + 1) : ''); };
        Object.keys(hs).map(Number).sort(function (a, b) { return a - b; }).forEach(function (g) {
            const t = text(g, 0);
            if (!t || !KEPT.test(t)) return;
            const others = ((m.ar[g] || '') + (m.dig[g] || '')).split('').filter(function (c, k, a) { return c !== t && a.indexOf(c) === k; }).join('');
            const key = hs[g];
            // (two glyphs of one outline: the first keeps the fontprint, the other's character joins its others)
            if (seen[key]) {
                const p = seen[key];
                if (t.length === 1) (t + others).split('').forEach(function (c) { if (c !== p[1] && p[2].indexOf(c) < 0) p[2] += c; });
                return;
            }
            prints.push(seen[key] = [key, t, others]);
        });
        return { family: (o && o.family) || nm.family, face: (o && o.face) || nm.face, glyphs: Object.keys(hs).length, prints: prints };
    }

    // (a record: the eight characters of the fontprint, the text, then a tab and the others when there are any;
    // records a space apart — no kept character is a space or a tab)
    function pack(prints) { return prints.map(function (p) { return p[0] + p[1] + (p[2] ? '\t' + p[2] : ''); }).join(' '); }
    function unpack(s) {
        const out = {};
        String(s || '').split(' ').forEach(function (r) { if (r.length > 8) { const p = r.slice(8).split('\t'); out[r.slice(0, 8)] = [p[0], p[1] || '']; } });
        return out;
    }

    /**
     * the face of the data that knows most of a font's fontprints; null when none knows any. Two families can share
     * their outlines (one design under two names): among the faces that know as many, the one whose family the file's
     * font name holds (name: a BaseFont, «BCDFEE+BMitraBold»), else the first.
     */
    function match(hs, data, name) {
        const gids = Object.keys(hs), squeeze = function (t) { return String(t || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
        const fontName = squeeze(String(name || '').replace(/^[A-Z]{6}\+/, ''));
        const named = function (f) { const k = squeeze(f.family); return !!k && fontName.indexOf(k) >= 0; };
        let best = null;
        ((data && data.faces) || []).forEach(function (f) {
            const tab = f._tab || Object.defineProperty(f, '_tab', { value: unpack(f.prints), enumerable: false })._tab;
            let known = 0;
            gids.forEach(function (g) { if (tab[hs[g]]) known++; });
            if (known && (!best || known > best.known || (known === best.known && !best.named && named(f)))) best = { family: f.family, face: f.face, known: known, of: gids.length, tab: tab, named: named(f) };
        });
        if (!best) return null;
        const text = {};
        gids.forEach(function (g) { if (best.tab[hs[g]]) text[g] = best.tab[hs[g]]; });
        return { family: best.family, face: best.face, known: best.known, of: best.of, text: text };
    }

    /**
     * lib/pdfimport/fontprints.js as text, from faces [{ family, face, src, glyphs, prints (packed or a list) }] — the
     * one writer, so tools/build-fontprints.js and tools/fontprints.html give the same file. Faces in order of family,
     * then face. src: 'kelk' (a font of the repository: made again by the build script) or 'supplied' (a font that is
     * not in the repository: kept as it is until supplied again).
     */
    function source(faces) {
        const fs = faces.map(function (f) { return { family: f.family, face: f.face, src: f.src || 'supplied', glyphs: f.glyphs, prints: typeof f.prints === 'string' ? f.prints : pack(f.prints) }; })
            .sort(function (a, b) { return a.family < b.family ? -1 : a.family > b.family ? 1 : a.face < b.face ? -1 : a.face > b.face ? 1 : 0; });
        const q = function (t) { return JSON.stringify(t); };
        return '/**\n * Kelk — fontprints (lib/pdfimport/fontprints.js): generated by tools/build-fontprints.js or tools/fontprints.html;\n' +
            ' * do not edit by hand. Per face, a record a glyph: the fontprint of its outline (eight characters), the character the\n' +
            ' * font gives it, then a tab and the other letters or digits that name the same glyph (lib/pdfimport/fontprint.js). Hashes and\n' +
            ' * characters only: no font is in this file. src: kelk — a font of the repository; supplied — one that is not.\n */\n' +
            '(function (global) {\n    const data = {\n        v: ' + V + ',\n        faces: [\n' +
            fs.map(function (f) { return '            { family: ' + q(f.family) + ', face: ' + q(f.face) + ', src: ' + q(f.src) + ', glyphs: ' + f.glyphs + ',\n              prints: ' + q(f.prints) + ' }'; }).join(',\n') +
            '\n        ]\n    };\n    if (typeof module !== \'undefined\' && module.exports) module.exports = data;\n    else global.KelkPdfFontprints = data;\n' +
            '})(typeof window !== \'undefined\' ? window : globalThis);\n';
    }

    PdfImporter._fontprint = { V: V, hashes: hashes, names: names, face: face, pack: pack, unpack: unpack, match: match, source: source };
})(typeof window !== 'undefined' ? window : globalThis);
