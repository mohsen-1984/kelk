/**
 * PdfImporter — CFF font programs (lib/pdfimport/cff.js)
 * ============================================================================
 * The outlines of a bare CFF program (Compact Font Format: a PDF's FontFile3 /Type1C or /CIDFontType0C — Adobe's
 * compact PostScript font, as Acrobat Distiller, InDesign and the Adobe PDF Library embed it), for the readers that
 * knew only TrueType outlines (glyf): forms and the ZWNJ by outline (extract.js), fontprints and rough prints
 * (fontprint.js), the shapes of a font Kelk does not know (shape.js). Kelk 3.3.
 *
 * A glyph is known by its key — what a code in the PDF names: the glyph id in a plain font (codes reach it through
 * the program's built-in encoding, c2g), the CID in a CID-keyed one (the program's charset maps a CID to its glyph; a
 * CID is the code itself under Identity-H, so the readers that take a composite font's code as its glyph id read the
 * key right). Outlines are in font units: units an em from the FontMatrix (1/1000 by default; 1/2048 too).
 *
 *   PdfImporter._cff.is(bytes)          whether bytes are a bare CFF program (major version 1)
 *   PdfImporter._cff.font(bytes)        → { upm, cid, n, contours(key), polygons(key), adv(key), c2g, g2u }
 *                                       contours: [[x, y, on], …] per contour, a curve's two control points off the
 *                                       curve (what a fontprint hashes); polygons: the same with each curve cut into
 *                                       lines (what a shape is drawn from); adv: the advance in font units; null when
 *                                       the program cannot be read
 *   PdfImporter._cff.ligatures(bytes)   → the map PdfImporter._internal.sfntLigatures gives a TrueType program (g2u,
 *                                       ar, dig, pfs, ink, adv, edges, side, c2g, base, colr), from the CFF program
 *   PdfImporter._cff.outlines(bytes)    → { upm, n, read(key, flat), adv(key) }: fontprint.js's outline reader
 *
 * Read: the Type 2 charstrings (every path operator, flex, hint masks), local and global subroutines (biased, ten
 * deep at most), a CID-keyed font's FDArray and FDSelect (each glyph's own Private DICT), the charset, the built-in
 * encoding (formats 0 and 1, with supplements; the standard encoding by name). Not read: an accented glyph made by
 * endchar's four extra operands (seac), CFF2, a CFF table inside an OpenType program (FontFile3 /OpenType).
 */
(function (global) {
    'use strict';
    const PdfImporter = global.PdfImporter || (typeof require === 'function' ? require('../PdfImporter.js') : null);

    // the standard strings with a character of their own: SID 1–95 are the printable ASCII, space to asciitilde, in order
    const STD_ASCII = 95;
    // the standard encoding: code → SID (codes 32–126 the ASCII names; a font's built-in encoding offset 0)
    const stdSid = function (code) { return code >= 32 && code <= 126 ? code - 31 : 0; };

    function intAt(b, p, n) { let v = 0; for (let k = 0; k < n; k++) v = v * 256 + b[p + k]; return v; }
    function index(b, p) {
        const count = (b[p] << 8) | b[p + 1];
        if (!count) return { items: [], end: p + 2 };
        const os = b[p + 2], offs = [];
        for (let i = 0; i <= count; i++) offs.push(intAt(b, p + 3 + i * os, os));
        const base = p + 2 + (count + 1) * os;
        const items = [];
        for (let i = 0; i < count; i++) items.push([base + offs[i], base + offs[i + 1]]);
        return { items: items, end: base + offs[count] };
    }
    function dict(b, a, z) {
        const d = {};
        let ops = [], p = a;
        while (p < z) {
            const v = b[p];
            if (v <= 21) { let k = v; p++; if (v === 12) { k = 1200 + b[p]; p++; } d[k] = ops; ops = []; }
            else if (v === 28) { ops.push((b[p + 1] << 24 >> 16) | b[p + 2]); p += 3; }
            else if (v === 29) { ops.push((b[p + 1] << 24) | (b[p + 2] << 16) | (b[p + 3] << 8) | b[p + 4]); p += 5; }
            else if (v === 30) {
                let s = ''; p++;
                for (let end = false; !end && p < z;) {
                    const by = b[p++];
                    for (const nib of [by >> 4, by & 15]) {
                        if (nib === 15) { end = true; break; }
                        s += ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', 'e', 'e-', '', '-'][nib];
                    }
                }
                ops.push(parseFloat(s) || 0);
            }
            else if (v >= 32 && v <= 246) { ops.push(v - 139); p++; }
            else if (v >= 247 && v <= 250) { ops.push((v - 247) * 256 + b[p + 1] + 108); p += 2; }
            else if (v >= 251 && v <= 254) { ops.push(-(v - 251) * 256 - b[p + 1] - 108); p += 2; }
            else p++;
        }
        return d;
    }
    const last = function (d, k, def) { const v = d[k]; return v && v.length ? v[v.length - 1] : def; };
    const bias = function (n) { return n < 1240 ? 107 : n < 33900 ? 1131 : 32768; };

    function is(b) { return !!b && b.length > 8 && b[0] === 1 && b[2] >= 4 && b[3] >= 1 && b[3] <= 4; }

    function parse(b) {
        let p = b[2];
        const names = index(b, p); p = names.end;
        const tops = index(b, p); p = tops.end;
        const strings = index(b, p); p = strings.end;
        const gsubrs = index(b, p).items;
        if (!tops.items.length) return null;
        const top = dict(b, tops.items[0][0], tops.items[0][1]);
        const chars = index(b, last(top, 17, 0)).items, n = chars.length;
        if (!n) return null;
        const cid = 1230 in top, fm = top[1207];
        const upm = fm && fm[0] ? Math.round(Math.abs(1 / fm[0])) : 1000;
        const priv = function (d) {
            const pv = d[18];
            if (!pv || pv.length < 2) return { subrs: [], dw: 0, nw: 0 };
            const size = pv[0], off = pv[1], pd = dict(b, off, off + size), so = pd[19];
            return { subrs: so ? index(b, off + so[so.length - 1]).items : [], dw: last(pd, 20, 0), nw: last(pd, 21, 0) };
        };
        // the charset: glyph → SID (a plain font) or CID (a CID-keyed one); offsets 0–2 are the predefined charsets
        const cs = [0], co = last(top, 15, 0);
        if (co <= 2) { for (let g = 1; g < n; g++) cs.push(g); }
        else {
            const fmt = b[co];
            let q = co + 1;
            while (cs.length < n && q < b.length) {
                if (fmt === 0) { cs.push((b[q] << 8) | b[q + 1]); q += 2; }
                else {
                    const first = (b[q] << 8) | b[q + 1], left = fmt === 1 ? b[q + 2] : (b[q + 2] << 8) | b[q + 3];
                    q += fmt === 1 ? 3 : 4;
                    for (let k = 0; k <= left && cs.length < n; k++) cs.push(first + k);
                }
            }
        }
        let fds = null, fdSel = null, one = null;
        if (cid) {
            fds = index(b, last(top, 1236, 0)).items.map(function (it) { return priv(dict(b, it[0], it[1])); });
            fdSel = new Uint8Array(n);
            const so = last(top, 1237, 0);
            if (b[so] === 0) { for (let g = 0; g < n; g++) fdSel[g] = b[so + 1 + g]; }
            else if (b[so] === 3) {
                const nr = (b[so + 1] << 8) | b[so + 2];
                let q = so + 3;
                for (let r = 0; r < nr; r++) {
                    const first = (b[q] << 8) | b[q + 1], fd = b[q + 2], next = (b[q + 3] << 8) | b[q + 4];
                    for (let g = first; g < next && g < n; g++) fdSel[g] = fd;
                    q += 3;
                }
            }
        } else one = priv(top);
        return { b: b, upm: upm, cid: cid, n: n, chars: chars, gsubrs: gsubrs, cs: cs, strings: strings.items, top: top,
            priv: function (g) { return cid ? (fds[fdSel[g]] || { subrs: [], dw: 0, nw: 0 }) : one; } };
    }

    /** one glyph's charstring → { width (font units), contours: [[x, y, on], …] } (curves: two control points off) */
    function run(F, g) {
        const b = F.b, cs = F.chars[g];
        const out = { width: null, contours: [] };
        if (!cs) return out;
        const P = F.priv(g), ls = P.subrs, gs = F.gsubrs, lb = bias(ls.length), gb = bias(gs.length);
        let x = 0, y = 0, stack = [], stems = 0, seen = false, cur = null, done = false;
        const width = function (extra) { if (!seen) { seen = true; if (extra) out.width = P.nw + stack.shift(); } };
        const move = function (dx, dy) { x += dx; y += dy; cur = [[x, y, 1]]; out.contours.push(cur); };
        const line = function (dx, dy) { x += dx; y += dy; if (cur) cur.push([x, y, 1]); };
        const curve = function (a, c, d, e, f, h) {
            const x1 = x + a, y1 = y + c, x2 = x1 + d, y2 = y1 + e;
            x = x2 + f; y = y2 + h;
            if (cur) cur.push([x1, y1, 0], [x2, y2, 0], [x, y, 1]);
        };
        const hints = function () { width(stack.length % 2 === 1); stems += stack.length >> 1; stack = []; };
        const exec = function (a, z, depth) {
            let p = a;
            while (p < z && !done) {
                const v = b[p++];
                if (v >= 32 || v === 28) {
                    if (v === 28) { stack.push((b[p] << 24 >> 16) | b[p + 1]); p += 2; }
                    else if (v <= 246) stack.push(v - 139);
                    else if (v <= 250) stack.push((v - 247) * 256 + b[p++] + 108);
                    else if (v <= 254) stack.push(-(v - 251) * 256 - b[p++] - 108);
                    else { stack.push(((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) / 65536); p += 4; }
                    continue;
                }
                switch (v) {
                    case 1: case 3: case 18: case 23: hints(); break;
                    case 19: case 20: hints(); p += (stems + 7) >> 3; break;
                    case 21: width(stack.length > 2); move(stack[0], stack[1]); stack = []; break;
                    case 22: width(stack.length > 1); move(stack[0], 0); stack = []; break;
                    case 4: width(stack.length > 1); move(0, stack[0]); stack = []; break;
                    case 5: for (let i = 0; i + 1 < stack.length; i += 2) line(stack[i], stack[i + 1]); stack = []; break;
                    case 6: case 7: { let h = v === 6; stack.forEach(function (d) { if (h) line(d, 0); else line(0, d); h = !h; }); stack = []; break; }
                    case 8: for (let i = 0; i + 5 < stack.length; i += 6) curve(stack[i], stack[i + 1], stack[i + 2], stack[i + 3], stack[i + 4], stack[i + 5]); stack = []; break;
                    case 24: { let i = 0; for (; i + 7 < stack.length; i += 6) curve(stack[i], stack[i + 1], stack[i + 2], stack[i + 3], stack[i + 4], stack[i + 5]); line(stack[i], stack[i + 1]); stack = []; break; }
                    case 25: { let i = 0; for (; i + 7 < stack.length; i += 2) line(stack[i], stack[i + 1]); curve(stack[i], stack[i + 1], stack[i + 2], stack[i + 3], stack[i + 4], stack[i + 5]); stack = []; break; }
                    case 26: { let i = 0, d1 = 0; if (stack.length % 2) d1 = stack[i++]; for (; i + 3 < stack.length; i += 4) { curve(d1, stack[i], stack[i + 1], stack[i + 2], 0, stack[i + 3]); d1 = 0; } stack = []; break; }
                    case 27: { let i = 0, d1 = 0; if (stack.length % 2) d1 = stack[i++]; for (; i + 3 < stack.length; i += 4) { curve(stack[i], d1, stack[i + 1], stack[i + 2], stack[i + 3], 0); d1 = 0; } stack = []; break; }
                    case 30: case 31: {
                        let h = v === 31, i = 0;
                        while (i + 3 < stack.length) {
                            const tail = stack.length - i === 5, e = tail ? stack[i + 4] : 0;
                            if (h) curve(stack[i], 0, stack[i + 1], stack[i + 2], e, stack[i + 3]);
                            else curve(0, stack[i], stack[i + 1], stack[i + 2], stack[i + 3], e);
                            i += tail ? 5 : 4; h = !h;
                        }
                        stack = []; break;
                    }
                    case 10: case 29: {
                        const list = v === 10 ? ls : gs, k = stack.pop() + (v === 10 ? lb : gb);
                        if (list[k] && depth < 10) exec(list[k][0], list[k][1], depth + 1);
                        break;
                    }
                    case 11: return;
                    case 14: width(stack.length % 2 === 1); done = true; return;
                    case 12: {
                        const e = b[p++], s = stack;
                        if (e === 35) { curve(s[0], s[1], s[2], s[3], s[4], s[5]); curve(s[6], s[7], s[8], s[9], s[10], s[11]); }
                        else if (e === 34) { curve(s[0], 0, s[1], s[2], s[3], 0); curve(s[4], 0, s[5], -s[2], s[6], 0); }
                        else if (e === 36) { curve(s[0], s[1], s[2], s[3], s[4], 0); curve(s[5], 0, s[6], s[7], s[8], -(s[1] + s[3] + s[7])); }
                        else if (e === 37) {
                            const dx = s[0] + s[2] + s[4] + s[6] + s[8], dy = s[1] + s[3] + s[5] + s[7] + s[9];
                            curve(s[0], s[1], s[2], s[3], s[4], s[5]);
                            if (Math.abs(dx) > Math.abs(dy)) curve(s[6], s[7], s[8], s[9], s[10], -dy); else curve(s[6], s[7], s[8], s[9], -dx, s[10]);
                        }
                        stack = []; break;
                    }
                    default: stack = [];
                }
            }
        };
        exec(cs[0], cs[1], 0);
        if (out.width === null) out.width = P.dw;
        out.contours = out.contours.filter(function (c) { return c.length > 1; });
        return out;
    }

    /** a contour's points with each cubic curve cut into eight lines: on-curve points only */
    function flatten(ct) {
        const out = [];
        for (let i = 0; i < ct.length; i++) {
            const p = ct[i];
            if (p[2] || i + 2 >= ct.length) { out.push([p[0], p[1], 1]); continue; }
            const a = out.length ? out[out.length - 1] : ct[0], c1 = p, c2 = ct[i + 1], e = ct[i + 2];
            for (let k = 1; k <= 8; k++) {
                const t = k / 8, u = 1 - t;
                out.push([u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * e[0],
                    u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * e[1], 1]);
            }
            i += 2;
        }
        return out;
    }

    /** a glyph name → its character: the ASCII standard names, uniXXXX and uXXXX[XX] */
    function nameText(name, sid) {
        // (the standard strings follow the standard encoding: SID 8 is quoteright, SID 64 quoteleft)
        if (sid === 8) return '\u2019';
        if (sid === 64) return '\u2018';
        if (sid >= 1 && sid <= STD_ASCII) return String.fromCharCode(sid + 31);
        let m = /^uni([0-9A-F]{4})$/.exec(name || '') || /^u([0-9A-F]{4,6})$/.exec(name || '');
        if (m) { const c = parseInt(m[1], 16); if (c > 0 && c <= 0x10FFFF && (c < 0xD800 || c > 0xDFFF)) return String.fromCodePoint(c); }
        return '';
    }

    const CACHE = typeof WeakMap === 'function' ? new WeakMap() : null;
    function font(b) {
        if (!is(b)) return null;
        if (CACHE && CACHE.has(b)) return CACHE.get(b);
        let r = null;
        try {
            const F = parse(b);
            if (F) {
                const keyOf = function (g) { return F.cid ? F.cs[g] : g; };
                const gidOf = {};
                for (let g = 0; g < F.n; g++) gidOf[keyOf(g)] = g;
                const memo = {};
                const glyph = function (key) {
                    if (key in memo) return memo[key];
                    const g = gidOf[key];
                    return (memo[key] = g === undefined ? null : run(F, g));
                };
                // codes → keys: the built-in encoding of a plain font (offset 0 the standard encoding, 1 the expert)
                const c2g = {}, g2u = {};
                if (!F.cid) {
                    const eo = last(F.top, 16, 0), sidGid = {};
                    for (let g = 1; g < F.n; g++) if (!(F.cs[g] in sidGid)) sidGid[F.cs[g]] = g;
                    if (eo === 0) { for (let c = 32; c <= 126; c++) { const g = sidGid[stdSid(c)]; if (g) c2g[c] = g; } }
                    else if (eo > 1) {
                        const fmt = b[eo] & 0x7f;
                        let q = eo + 1;
                        if (fmt === 0) { const k = b[q++]; for (let i = 1; i <= k; i++) { if (!(b[q] in c2g)) c2g[b[q]] = i; q++; } }
                        else if (fmt === 1) {
                            const nr = b[q++];
                            let g = 1;
                            for (let r2 = 0; r2 < nr; r2++) { const first = b[q], left = b[q + 1]; q += 2; for (let k = 0; k <= left; k++) { if (!((first + k) in c2g)) c2g[first + k] = g; g++; } }
                        }
                        if (b[eo] & 0x80) {
                            const ns = b[q++];
                            for (let i = 0; i < ns; i++) { const c = b[q], sid = (b[q + 1] << 8) | b[q + 2]; q += 3; if (sidGid[sid]) c2g[c] = sidGid[sid]; }
                        }
                    }
                    for (let g = 1; g < F.n; g++) {
                        const sid = F.cs[g];
                        let nm = '';
                        if (sid >= 391) { const it = F.strings[sid - 391]; nm = it ? String.fromCharCode.apply(null, Array.from(b.subarray(it[0], it[1]))) : ''; }
                        const t = nameText(nm, sid);
                        if (t) g2u[g] = t;
                    }
                }
                let n = 0;
                Object.keys(gidOf).forEach(function (k) { n = Math.max(n, +k + 1); });
                r = {
                    upm: F.upm, cid: F.cid, n: n, c2g: c2g, g2u: g2u,
                    contours: function (key) { const gl = glyph(key); return gl ? gl.contours : []; },
                    polygons: function (key) { const gl = glyph(key); return gl ? gl.contours.map(flatten) : []; },
                    adv: function (key) { const gl = glyph(key); return gl ? gl.width : null; }
                };
            }
        } catch (e) { r = null; }
        if (CACHE) CACHE.set(b, r);
        return r;
    }

    /** the map sfntLigatures gives a TrueType program, from a CFF one (no cmap, no GSUB: g2u from glyph names) */
    function ligatures(b) {
        const C = font(b), out = {};
        const def = function (k, v) { Object.defineProperty(out, k, { value: v, enumerable: false }); };
        const g2u = {}, ar = {}, dig = {};
        if (C) Object.keys(C.g2u).forEach(function (g) {
            const t = C.g2u[g], c = t.codePointAt(0);
            g2u[g] = t;
            if (c >= 0x620 && c <= 0x6FF) ar[g] = t;
            if ((c >= 0x30 && c <= 0x39) || (c >= 0x660 && c <= 0x669) || (c >= 0x6F0 && c <= 0x6F9)) dig[g] = t;
        });
        const box = function (key) {
            const ps = C ? [].concat.apply([], C.polygons(key)) : [];
            if (!ps.length) return null;
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            ps.forEach(function (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
            return { x0: x0, y0: y0, x1: x1, y1: y1, ps: ps };
        };
        // (each of these as sfntLigatures has it: ink — the outline across, in em; adv — the advance, in em; edges — which
        // of its two edges the outline meets at the baseline; side — which way a bracket-like outline opens)
        const adv = function (key) { const a = C ? C.adv(key) : null; return a === null || a === undefined || !C.upm ? null : a / C.upm; };
        def('ink', function (key) { const q = box(key); return q ? [q.x0 / C.upm, q.x1 / C.upm] : null; });
        def('adv', adv);
        def('edges', function (key) {
            const w = adv(key), q = box(key);
            if (!q || !(w > 0) || q.ps.length < 3) return null;
            const U = C.upm, A = w * U, e = 0.02 * U, lo = -0.03 * U, hi = 0.2 * U;
            const band = function (pt) { return pt[1] >= lo && pt[1] <= hi; };
            return { left: q.ps.some(function (pt) { return pt[0] <= e && band(pt); }), right: q.ps.some(function (pt) { return pt[0] >= A - e && band(pt); }) };
        });
        def('side', function (key) {
            const q = box(key);
            if (!q || q.x1 - q.x0 < 10) return null;
            const mid = (q.y0 + q.y1) / 2, band = 0.15 * (q.y1 - q.y0), cx = (q.x0 + q.x1) / 2;
            const m = q.ps.filter(function (p) { return Math.abs(p[1] - mid) <= band; }).map(function (p) { return p[0]; });
            if (!m.length) return null;
            const mx = m.reduce(function (s, t) { return s + t; }, 0) / m.length;
            return Math.abs(mx - cx) < 0.08 * (q.x1 - q.x0) ? null : mx < cx ? 'L' : 'R';
        });
        def('c2g', C ? C.c2g : {});
        def('g2u', g2u); def('ar', ar); def('dig', dig); def('pfs', {}); def('base', {}); def('colr', {});
        def('cff', true);
        return out;
    }

    /** fontprint.js's outline reader: read(key) the contours (flat: the curves cut into lines), adv(key) in font units */
    function outlines(b) {
        const C = font(b);
        if (!C) return null;
        return { upm: C.upm, n: C.n, cff: true,
            read: function (key, flat) { try { return flat ? C.polygons(key) : C.contours(key); } catch (e) { return []; } },
            adv: function (key) { const a = C.adv(key); return a === null || a === undefined ? 0 : a; } };
    }

    if (PdfImporter) PdfImporter._cff = { is: is, font: font, ligatures: ligatures, outlines: outlines };
})(typeof window !== 'undefined' ? window : globalThis);
