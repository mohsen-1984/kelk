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
 *   PdfImporter._fontprint.roughs(bytes, probe) a TrueType program → { glyph id: [rough prints] } (probe: the bins on
 *                                               both sides of an edge too, for a file's font)
 *   PdfImporter._fontprint.matchRough(roughs, data, name)  the same as match, by the rough prints (rough: true)
 *
 * The fontprint: every contour's points in order — x, y in thousandths of the em, and whether the point is on the
 * curve — a composite's components laid out by their offsets and scales; two 32-bit FNV-1a hashes of that, 48 bits
 * kept, as eight base64url characters. Hinting, glyph names, codes and widths are not in it.
 *
 * The rough print (3.1): a producer that rebuilds a font's outlines — wkhtmltopdf, through Qt, writes every curve
 * again (more points, composites laid flat, points a unit off) — keeps no glyph's fontprint. What it keeps is the
 * glyph's advance, its number of contours and where each contour lies: the rough print hashes those — the advance
 * and each contour's box, in bins of ROUGH thousandths of the em, the boxes sorted. A file's glyph is printed for both
 * bins when a value lies within ROUGH_NEAR of a bin's edge. A face's rough prints are kept apart from its fontprints
 * (`rough` in the data, for the faces read since 3.1), and a rough print two glyphs of a face share with other
 * characters is kept with no character (a record of the print and a tab): a file's glyph that finds it is not known.
 * A part of the importer (PdfImporter.PARTS, with the data): the font arbiter reads it (trust.js). Needs
 * lib/PdfImporter.js (its sfnt reader, PdfImporter._internal.sfntLigatures). TrueType outlines only (glyf): a CFF or
 * a Type 3 font has no fontprint.
 */
(function (global) {
    'use strict';
    const PdfImporter = global.PdfImporter || (typeof require === 'function' ? require('../PdfImporter.js') : null);
    const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const V = 1;
    const ROUGH = 32, ROUGH_NEAR = 2, ROUGH_MAX = 64;     // thousandths of the em; the most rough prints a glyph is given
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

    /** the rough prints of one glyph: its advance and its contours' boxes in bins (probe: both bins near an edge) */
    function rough(contours, upm, adv, probe) {
        const vals = [Math.round(adv * 1000)];
        const boxes = contours.map(function (ct) {
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            ct.forEach(function (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
            return [x0, y0, x1, y1].map(function (q) { return q * 1000 / upm; });
        });
        boxes.forEach(function (b) { b.forEach(function (q) { vals.push(q); }); });
        const bins = vals.map(function (q) {
            const b = Math.floor(q / ROUGH), out = [b];
            if (probe) { const lo = Math.floor((q - ROUGH_NEAR) / ROUGH), hi = Math.floor((q + ROUGH_NEAR) / ROUGH); if (lo !== b) out.push(lo); if (hi !== b) out.push(hi); }
            return out;
        });
        let combos = [[]];
        for (const opts of bins) {
            const next = [];
            combos.forEach(function (c) { opts.forEach(function (o) { next.push(c.concat([o])); }); });
            combos = next;
            if (combos.length > ROUGH_MAX) return [];                    // (too near too many edges: no rough print)
        }
        return combos.map(function (c) {
            const bx = [];
            for (let k = 1; k < c.length; k += 4) bx.push(c.slice(k, k + 4));
            bx.sort(function (a, b) { for (let k = 0; k < 4; k++) if (a[k] !== b[k]) return a[k] - b[k]; return 0; });
            const flat = [c[0], bx.length];
            bx.forEach(function (b) { b.forEach(function (q) { flat.push(q); }); });
            return print([flat.map(function (q) { return [q, 0, 0]; })], 1000);
        });
    }

    function roughs(d, probe) {
        const o = outlines(d), out = {};
        if (!o || !o.upm) return out;
        const m = PdfImporter._internal.sfntLigatures(d);
        for (let g = 0; g < o.n; g++) {
            const c = o.read(g), adv = m.adv(g);
            if (!c.length || adv === null || adv === undefined) continue;
            const r = rough(c, o.upm, adv, probe);
            if (r.length) out[g] = r;
        }
        return out;
    }

    function names(d) {
        const t = tables(d), v = t.v, o = t.T.name, got = {};
        if (o === undefined) return { family: '', face: '' };
        const n = v.getUint16(o + 2), at = o + v.getUint16(o + 4);
        for (let k = 0; k < n; k++) {
            const r = o + 6 + 12 * k, pid = v.getUint16(r), id = v.getUint16(r + 6), len = v.getUint16(r + 8), off = at + v.getUint16(r + 10);
            if ([1, 2, 5, 16, 17].indexOf(id) < 0 || off + len > d.length) continue;
            let s = '';
            if (pid === 3 || pid === 0) for (let q = 0; q + 1 < len; q += 2) s += String.fromCharCode(v.getUint16(off + q));
            else for (let q = 0; q < len; q++) s += String.fromCharCode(d[off + q]);
            s = s.replace(/\s+/g, ' ').trim();
            // (the Windows names first, an English one over another language's)
            const rank = (pid === 3 ? 2 : 0) + (pid === 3 && v.getUint16(r + 4) === 0x409 ? 1 : 0);
            if (s && (!got[id] || rank > got[id][0])) got[id] = [rank, s];
        }
        const pick = function (a, b) { return (got[a] || got[b] || [0, ''])[1]; };
        return { family: pick(16, 1), face: pick(17, 2), version: pick(5, 5) };
    }

    function face(d, o) {
        const m = PdfImporter._internal.sfntLigatures(d), hs = hashes(d), rs = roughs(d, false), nm = names(d), seen = {}, prints = [];
        const rseen = {}, rbad = {};
        const text = function (g, depth) { return m.g2u[g] || m[g] || (depth < 4 && m.base[g] !== undefined ? text(m.base[g], depth + 1) : ''); };
        Object.keys(hs).map(Number).sort(function (a, b) { return a - b; }).forEach(function (g) {
            // (a form a font's tables give with a kashida after it — «ﻋـ» — is the form: the kashida is how it joins)
            let t = text(g, 0);
            if (t.length > 1) t = t.replace(/\u0640/g, '');
            if (!t || !KEPT.test(t)) return;
            const others = ((m.ar[g] || '') + (m.dig[g] || '')).split('').filter(function (c, k, a) { return c !== t && a.indexOf(c) === k; }).join('');
            const key = hs[g], rk = rs[g] && rs[g][0];
            // (a rough print two glyphs share: the same outline, or the same character — one record; else it names neither)
            if (rk) {
                const r = rseen[rk];
                if (!r) rseen[rk] = { rec: [rk, t, others], hash: key };
                else if (r.hash === key || r.rec[1] === t) (t + others).split('').forEach(function (c) { if (t.length === 1 && c !== r.rec[1] && r.rec[2].indexOf(c) < 0) r.rec[2] += c; });
                else rbad[rk] = 1;
            }
            // (two glyphs of one outline: the first keeps the fontprint, the other's character joins its others)
            if (seen[key]) {
                const p = seen[key];
                if (t.length === 1) (t + others).split('').forEach(function (c) { if (c !== p[1] && p[2].indexOf(c) < 0) p[2] += c; });
                return;
            }
            prints.push(seen[key] = [key, t, others]);
        });
        // (a rough print that names two characters stays, with no character: a file's glyph that finds it is not known)
        const rough = Object.keys(rseen).map(function (k) { return rbad[k] ? [k, '', ''] : rseen[k].rec; });
        return { family: (o && o.family) || nm.family, face: (o && o.face) || nm.face, version: nm.version, glyphs: Object.keys(hs).length, prints: prints, rough: rough };
    }

    // (a record: the eight characters of the fontprint, the text, then a tab and the others when there are any;
    // records a space apart — no kept character is a space or a tab; a rough print with no text: its eight and a tab)
    function pack(prints) { return prints.map(function (p) { return p[0] + p[1] + (p[2] || !p[1] ? '\t' + p[2] : ''); }).join(' '); }
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
    function match(hs, data, name) { return best(hs, data, name, 'prints'); }

    /** match by the rough prints: roughs, { glyph id: [rough prints] } (probed); a glyph is known when its prints find one character */
    function matchRough(rs, data, name) { const r = best(rs, data, name, 'rough'); if (r) r.rough = true; return r; }

    function best(hs, data, name, which) {
        const gids = Object.keys(hs), squeeze = function (t) { return String(t || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
        const fontName = squeeze(String(name || '').replace(/^[A-Z]{6}\+/, ''));
        const named = function (f) { const k = squeeze(f.family); return !!k && fontName.indexOf(k) >= 0; };
        // (a glyph's records in a face's table: its fontprint's; of its rough prints, the one character they all find)
        const look = function (tab, h) {
            if (!Array.isArray(h)) return tab[h] || null;
            let got = null;
            for (const k of h) { const t = tab[k]; if (!t) continue; if (!t[0] || (got && got[0] !== t[0])) return null; got = got || t; }
            return got;
        };
        let top = null;
        const faces = (data && data.faces) || [], slot = which === 'rough' ? '_rtab' : '_tab';
        faces.forEach(function (f) {
            if (which === 'rough' && !f.rough && !f.base) return;
            const tab = f[slot] || Object.defineProperty(f, slot, { value: table(f, faces, which), enumerable: false })[slot];
            let known = 0;
            gids.forEach(function (g) { if (look(tab, hs[g])) known++; });
            if (known && (!top || known > top.known || (known === top.known && !top.named && named(f)))) top = { family: f.family, face: f.face, known: known, of: gids.length, tab: tab, named: named(f) };
        });
        if (!top) return null;
        const text = {};
        gids.forEach(function (g) { const t = look(top.tab, hs[g]); if (t) text[g] = t; });
        return { family: top.family, face: top.face, known: top.known, of: top.of, text: text };
    }

    /**
     * lib/pdfimport/fontprints.js as text, from faces [{ family, face, src, glyphs, prints (packed or a list) }] — the
     * one writer, so tools/build-fontprints.js and tools/fontprints.html give the same file. Faces in order of family,
     * then face. src: 'kelk' (a font of the repository: made again by the build script) or 'supplied' (a font that is
     * not in the repository: kept as it is until supplied again).
     */
    /** a face's table: its records, and — when it names a base (a face it shares most outlines with) — the base's first */
    function table(f, faces, which) {
        const w = which || 'prints', own = unpack(f[w]);
        if (!f.base) return own;
        const b = faces.filter(function (x) { return x.family + '|' + x.face === f.base && !x.base; })[0];
        const out = b ? unpack(b[w]) : {};
        Object.keys(own).forEach(function (h) { out[h] = own[h]; });
        return out;
    }

    /** the faces of the data with each one's records whole (a base's added in): what the build reads back */
    function expand(data) {
        const faces = (data && data.faces) || [];
        return faces.map(function (f) {
            if (!f.base) return f;
            const whole = function (w) { const t = table(f, faces, w); return pack(Object.keys(t).map(function (h) { return [h, t[h][0], t[h][1] || '']; })); };
            const out = { family: f.family, face: f.face, src: f.src, glyphs: f.glyphs, prints: whole('prints') };
            if (f.rough) out.rough = whole('rough');
            return out;
        });
    }

    /**
     * the faces written once: a face that shares most of its outlines with one written before it (the same font
     * under two names, a near copy) keeps only the records the other lacks, and names it
     * as its base: the first in the file's order (by family, then face), never itself based. So a face depends only on
     * faces before it, and a family taken out of the file takes no other face's records with it.
     */
    function shared(fs) {
        const key = function (f) { return f.family + '|' + f.face; }, sets = {};
        fs.forEach(function (f) { sets[key(f)] = f.prints.split(' ').filter(Boolean); });
        const bases = [];
        fs.forEach(function (f) {
            const mine = sets[key(f)], hs = {};
            mine.forEach(function (r) { hs[r] = 1; });
            let best = null, most = 0;
            bases.forEach(function (b) {
                if (b.face !== f.face) return;
                let n = 0; sets[key(b)].forEach(function (r) { if (hs[r]) n++; });
                if (n > most) { most = n; best = b; }
            });
            if (best && most >= 0.9 * mine.length) {
                const inBase = {}; sets[key(best)].forEach(function (r) { inBase[r] = 1; });
                f.base = key(best); f.prints = mine.filter(function (r) { return !inBase[r]; }).join(' ');
                if (f.rough) { const rIn = {}; String(best.rough || '').split(' ').forEach(function (r) { rIn[r] = 1; }); f.rough = f.rough.split(' ').filter(function (r) { return r && !rIn[r]; }).join(' '); }
            } else bases.push(f);
        });
        return fs;
    }

    function source(faces) {
        const order = function (a, b) { return a.family < b.family ? -1 : a.family > b.family ? 1 : a.face < b.face ? -1 : a.face > b.face ? 1 : 0; };
        const packed = function (x) { return typeof x === 'string' ? x : pack(x || []); };
        const all = faces.map(function (f) { const o = { family: f.family, face: f.face, src: f.src || 'supplied', glyphs: f.glyphs, prints: packed(f.prints) }; if (f.rough && packed(f.rough)) o.rough = packed(f.rough); return o; });
        const fs = shared(all.sort(order));
        const q = function (t) { return JSON.stringify(t); };
        return '/**\n * Kelk — fontprints (lib/pdfimport/fontprints.js): generated by tools/build-fontprints.js or tools/fontprints.html;\n' +
            ' * do not edit by hand. Per face, a record a glyph: the fontprint of its outline (eight characters), the character the\n' +
            ' * font gives it, then a tab and the other letters or digits that name the same glyph (lib/pdfimport/fontprint.js). Hashes and\n' +
            ' * characters only: no font is in this file. src: kelk — a font of the repository; supplied — one that is not. base: a face\n' +
            ' * whose records this one shares (written once, there): this face\'s table is the base\'s with its own records over them.\n' +
            ' * rough: the rough prints of a face (its glyphs\' advances and contours\' boxes, for a font whose outlines were rebuilt).\n */\n' +
            '(function (global) {\n    const data = {\n        v: ' + V + ',\n        faces: [\n' +
            fs.map(function (f) { return '            { family: ' + q(f.family) + ', face: ' + q(f.face) + ', src: ' + q(f.src) + ', glyphs: ' + f.glyphs + (f.base ? ', base: ' + q(f.base) : '') + ',\n              prints: ' + q(f.prints) + (f.rough ? ',\n              rough: ' + q(f.rough) : '') + ' }'; }).join(',\n') +
            '\n        ]\n    };\n    if (typeof module !== \'undefined\' && module.exports) module.exports = data;\n    else global.KelkPdfFontprints = data;\n' +
            '})(typeof window !== \'undefined\' ? window : globalThis);\n';
    }

    PdfImporter._fontprint = { V: V, hashes: hashes, roughs: roughs, names: names, face: face, pack: pack, unpack: unpack, table: table, expand: expand, match: match, matchRough: matchRough, source: source };
})(typeof window !== 'undefined' ? window : globalThis);
