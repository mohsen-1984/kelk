/**
 * PdfImporter — glyph shapes (lib/pdfimport/shape.js)
 * ============================================================================
 * A glyph known by how it looks, for a font Kelk has no fontprints of (Kelk 3.2). A fontprint (fontprint.js) finds a
 * glyph only in the very typeface it was made from; a shape finds the nearest glyphs of other typefaces. Each glyph is
 * drawn on a small grid, stretched to its own box, and kept with where that box lies (its width, height, top and
 * bottom, in the font's own body height) and how many small parts — dots — it has above and below its body. The data,
 * one table of shapes per face Kelk ships, is lib/pdfimport/shapes.js, made by tools/build-shapes.js with the code
 * below: only the small grids and the characters are kept there, never a font. In the browser it is
 * window.KelkPdfShapes.
 *
 *   PdfImporter._shape.glyphs(bytes, only)    a TrueType program (Uint8Array) → { glyph id: shape } (the glyphs with an
 *                                             outline only; only: an object whose keys are the ids to give); shape: { grid: Float32Array(G × G), geo: [5], dots: [2] }
 *   PdfImporter._shape.face(bytes)            a reference font → { family, face, shapes: [[packed shape, text]] }: text
 *                                             is the character the font's cmap gives the glyph (through its GSUB for a
 *                                             form or a ligature), as for the fontprints
 *   PdfImporter._shape.pack(shape) / unpack(string)   a shape ↔ PACKED base64url characters
 *   PdfImporter._shape.distance(a, b)         0 for one shape, larger for shapes further apart
 *   PdfImporter._shape.rank(shape, faces, k, only)  the k nearest characters among the faces' shapes: [[text,
 *                                             distance]], the nearest first, each character once (its nearest glyph);
 *                                             only: a pattern the characters must match (a script)
 *   PdfImporter._shape.source(faces)          → lib/pdfimport/shapes.js as text (the one writer of that file)
 *   PdfImporter._shape.expand(data)           shapes.js's data → faces with their shapes unpacked, once
 *
 *   PdfImporter._shape.fromPolygons(polys, body, advance)  one glyph's shape from its polygons (the calibration's bars)
 *   PdfImporter._shape.script(items, faces)   a font's script: 'arabic' | 'latin', by its glyphs' nearest characters
 *   PdfImporter._shape.read(items, words, faces, pairs, o)  a font's glyphs read by their shapes (below)
 *
 * Loaded on demand, by the approximate reading of a font Kelk does not know (trust.js _fontApprox, 3.2). Needs
 * lib/PdfImporter.js (PdfImporter._internal.sfntLigatures) and lib/pdfimport/fontprint.js (its outline reader).
 * TrueType outlines only (glyf).
 */
(function (global) {
    'use strict';
    const PdfImporter = global.PdfImporter || (typeof require === 'function' ? require('../PdfImporter.js') : null);
    if (!PdfImporter._fontprint && typeof require === 'function') require('./fontprint.js');
    const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const V = 1;
    const G = 12, S = 4;                       // the grid's cells a side; samples a cell a side
    const PACKED = Math.ceil((G * G / 2 + 6) * 4 / 3);
    const DOT = 0.5, DOT_AREA = 0.25;          // a dot: under DOT bodies a side, DOT_AREA of the largest part's box
    const W_GEO = 0.5, W_DOTS = 0.03;          // what the box and the dots weigh against the grid
    const LAMBDA = 20;                         // read(): what a unit of distance from the nearest costs, a time drawn
    // the characters a shape may stand for, after NFKC (a joining form is its letter): what a Persian, Arabic or English
    // text writes — ASCII, the Arabic and Persian letters, the digits, Arabic punctuation, «» – — and the lam-alef. Rarer
    // letters (Urdu, Pashto, Latin-1 signs) would only lead a guess astray
    const KEPT = /^(?:[!-~]|[\u0621-\u063A\u0641-\u064A\u067E\u0686\u0698\u06A9\u06AF\u06CC\u06C0\u0660-\u0669\u06F0-\u06F9\u060C\u061B\u061F\u00AB\u00BB\u2013\u2014]|\u0644\u0627)$/;

    function hmtx(d) {
        const v = new DataView(d.buffer, d.byteOffset, d.byteLength), n = v.getUint16(4), T = {};
        for (let k = 0; k < n; k++) { const o = 12 + 16 * k; T[String.fromCharCode(d[o], d[o + 1], d[o + 2], d[o + 3])] = v.getUint32(o + 8); }
        if (T.hhea === undefined || T.hmtx === undefined) return function () { return 0; };
        const m = v.getUint16(T.hhea + 34);
        return function (g) { return v.getUint16(T.hmtx + 4 * Math.min(g, m - 1)); };
    }

    /** a contour's TrueType points → a closed polygon (quadratic curves cut into four lines) */
    function polygon(ct) {
        const n = ct.length, out = [];
        if (!n) return out;
        let s = ct.findIndex(function (p) { return p[2]; });
        let start;
        if (s < 0) { start = [(ct[0][0] + ct[n - 1][0]) / 2, (ct[0][1] + ct[n - 1][1]) / 2]; s = 0; } else { start = ct[s]; s += 1; }
        out.push([start[0], start[1]]);
        let prev = start, ctrl = null;
        for (let k = 0; k < n; k++) {
            const p = ct[(s + k) % n];
            if (p[2]) {
                if (ctrl) quad(prev, ctrl, p); else out.push([p[0], p[1]]);
                prev = p; ctrl = null;
            } else if (ctrl) {
                const mid = [(ctrl[0] + p[0]) / 2, (ctrl[1] + p[1]) / 2];
                quad(prev, ctrl, mid); prev = mid; ctrl = p;
            } else ctrl = p;
        }
        if (ctrl) quad(prev, ctrl, start);
        return out;
        function quad(a, c, b) {
            for (let t = 1; t <= 4; t++) {
                const u = t / 4, w = 1 - u;
                out.push([w * w * a[0] + 2 * w * u * c[0] + u * u * b[0], w * w * a[1] + 2 * w * u * c[1] + u * u * b[1]]);
            }
        }
    }

    function box(pts) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        pts.forEach(function (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
        return [x0, y0, x1, y1];
    }

    /** the polygons drawn on the grid (non-zero winding), each cell the share of its samples inside, then smoothed */
    function grid(polys, b) {
        const w = Math.max(b[2] - b[0], 1), h = Math.max(b[3] - b[1], 1);
        // each side stretched to the grid, but neither more than three times the other (a dash stays a bar)
        let sx = G / w, sy = G / h;
        if (sx > 3 * sy) sx = 3 * sy;
        if (sy > 3 * sx) sy = 3 * sx;
        const ox = (G - w * sx) / 2, oy = (G - h * sy) / 2, N = G * S, cov = new Float32Array(G * G);
        const edges = [];
        polys.forEach(function (pl) {
            for (let k = 0; k < pl.length; k++) {
                const a = pl[k], c = pl[(k + 1) % pl.length];
                edges.push([(a[0] - b[0]) * sx + ox, (a[1] - b[1]) * sy + oy, (c[0] - b[0]) * sx + ox, (c[1] - b[1]) * sy + oy]);
            }
        });
        for (let r = 0; r < N; r++) {
            const y = (r + 0.5) / S, xs = [];
            edges.forEach(function (e) {
                if ((e[1] <= y && e[3] > y) || (e[3] <= y && e[1] > y)) xs.push([e[0] + (y - e[1]) * (e[2] - e[0]) / (e[3] - e[1]), e[3] > e[1] ? 1 : -1]);
            });
            if (!xs.length) continue;
            xs.sort(function (p, q) { return p[0] - q[0]; });
            let wind = 0;
            for (let k = 0; k < xs.length - 1; k++) {
                wind += xs[k][1];
                if (!wind) continue;
                const from = Math.max(0, Math.ceil(xs[k][0] * S - 0.5)), to = Math.min(N - 1, Math.floor(xs[k + 1][0] * S - 0.5));
                for (let c = from; c <= to; c++) cov[Math.floor(r / S) * G + Math.floor(c / S)] += 1 / (S * S);
            }
        }
        const out = new Float32Array(G * G);
        for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
            let s = 0, n = 0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const yy = y + dy, xx = x + dx;
                if (yy < 0 || yy >= G || xx < 0 || xx >= G) continue;
                const wt = dx || dy ? 1 : 4; s += wt * Math.min(1, cov[yy * G + xx]); n += wt;
            }
            out[y * G + x] = s / n;
        }
        return out;
    }

    /** every glyph's shape (body: the font's body height, the median height of its glyphs); only: the glyph ids to give */
    function glyphs(d, only) {
        const o = PdfImporter._fontprint.outlines(d), adv = hmtx(d), raw = {}, out = {};
        if (!o || !o.upm) return out;
        const heights = [];
        for (let g = 0; g < o.n; g++) {
            const polys = o.read(g).map(polygon).filter(function (p) { return p.length > 2; });
            if (!polys.length) continue;
            const b = box([].concat.apply([], polys));
            if (b[3] - b[1] <= 0 && b[2] - b[0] <= 0) continue;
            raw[g] = { polys: polys, b: b };
            heights.push(b[3] - b[1]);
        }
        heights.sort(function (a, b) { return a - b; });
        const body = Math.max(heights[Math.floor(heights.length / 2)] || o.upm / 2, o.upm / 20);
        Object.keys(raw).forEach(function (g) { if (!only || g in only) out[g] = fromPolygons(raw[g].polys, body, adv(+g)); });
        return out;
    }

    /** one glyph's shape from its polygons (in font units), the font's body and the glyph's advance */
    function fromPolygons(polys, body, advance) {
        const b = box([].concat.apply([], polys)), mid = (b[1] + b[3]) / 2;
        // a dot: a part far smaller than the glyph's largest (DOT_AREA of its box's area at most) and small for the body
        const boxes = polys.map(box), area = function (q) { return (q[2] - q[0]) * (q[3] - q[1]); };
        const big = Math.max.apply(null, boxes.map(area));
        let up = 0, down = 0;
        if (boxes.length > 1) boxes.forEach(function (pb) {
            if (area(pb) <= DOT_AREA * big && pb[2] - pb[0] < DOT * body && pb[3] - pb[1] < DOT * body) {
                if ((pb[1] + pb[3]) / 2 > mid) up++; else down++;
            }
        });
        return { grid: grid(polys, b), dots: [Math.min(up, 3), Math.min(down, 3)],
            geo: [(b[2] - b[0]) / body, (b[3] - b[1]) / body, b[1] / body, b[3] / body, advance / body] };
    }

    function distance(a, b) {
        let s = 0;
        for (let k = 0; k < G * G; k++) s += Math.abs(a.grid[k] - b.grid[k]);
        s /= G * G;
        let geo = 0;
        for (let k = 0; k < 4; k++) geo += Math.min(Math.abs(a.geo[k] - b.geo[k]), 1);
        return s + W_GEO * geo / 4 + W_DOTS * (Math.abs(a.dots[0] - b.dots[0]) + Math.abs(a.dots[1] - b.dots[1]));
    }

    // a shape packed: the grid in 4 bits a cell, then the box (signed, in sixteenths of the body), then the dots
    function pack(sh) {
        const bytes = [];
        for (let k = 0; k < G * G; k += 2) bytes.push((Math.round(sh.grid[k] * 15) << 4) | Math.round(sh.grid[k + 1] * 15));
        sh.geo.forEach(function (q) { bytes.push(Math.max(0, Math.min(255, Math.round(q * 16) + 64))); });
        bytes.push(sh.dots[0] * 4 + sh.dots[1]);
        let s = '';
        for (let k = 0; k < bytes.length; k += 3) {
            const x = (bytes[k] << 16) | ((bytes[k + 1] || 0) << 8) | (bytes[k + 2] || 0);
            s += B64[(x >> 18) & 63] + B64[(x >> 12) & 63] + B64[(x >> 6) & 63] + B64[x & 63];
        }
        return s.slice(0, PACKED);
    }
    function unpack(s) {
        const bytes = [];
        for (let k = 0; k < s.length; k += 4) {
            const x = (B64.indexOf(s[k]) << 18) | (B64.indexOf(s[k + 1]) << 12) | (Math.max(0, B64.indexOf(s[k + 2])) << 6) | Math.max(0, B64.indexOf(s[k + 3]));
            bytes.push((x >> 16) & 255, (x >> 8) & 255, x & 255);
        }
        const grid = new Float32Array(G * G);
        for (let k = 0; k < G * G / 2; k++) { grid[2 * k] = (bytes[k] >> 4) / 15; grid[2 * k + 1] = (bytes[k] & 15) / 15; }
        const o = G * G / 2;
        return { grid: grid, geo: [0, 1, 2, 3, 4].map(function (k) { return (bytes[o + k] - 64) / 16; }), dots: [bytes[o + 5] >> 2, bytes[o + 5] & 3] };
    }

    /** a reference font's shapes and their characters (one record a glyph that names a kept character) */
    function face(d) {
        const m = PdfImporter._internal.sfntLigatures(d), sh = glyphs(d), nm = PdfImporter._fontprint.names(d), shapes = [];
        const text = function (g, depth) { return m.g2u[g] || m[g] || (depth < 4 && m.base[g] !== undefined ? text(m.base[g], depth + 1) : ''); };
        Object.keys(sh).map(Number).sort(function (a, b) { return a - b; }).forEach(function (g) {
            let t = text(g, 0);
            if (t.length > 1) t = t.replace(/\u0640/g, '');
            t = t.normalize('NFKC');
            if (!t || !KEPT.test(t)) return;
            shapes.push([pack(sh[g]), t]);
        });
        return { family: nm.family, face: nm.face || 'Regular', shapes: shapes };
    }

    /** the nearest characters: [[text, distance]], each character once, the nearest first */
    function rank(sh, faces, k, only) {
        const best = {};
        faces.forEach(function (f) {
            f.shapes.forEach(function (r) {
                if (only && !only.test(r[1])) return;
                const dd = distance(sh, r[2] || (r[2] = unpack(r[0])));
                if (best[r[1]] === undefined || dd < best[r[1]]) best[r[1]] = dd;
            });
        });
        return Object.keys(best).map(function (t) { return [t, best[t]]; })
            .sort(function (a, b) { return a[1] - b[1] || (a[0] < b[0] ? -1 : 1); }).slice(0, k || 5);
    }

    // the characters a script's text is read in: its letters, the digits, the signs
    const SCRIPTS = {
        arabic: /^(?:[\u0600-\u06FF]|\u0644\u0627|[!-@[-`{-~\u00AB\u00BB\u2013\u2014])$/,
        latin: /^[!-~\u00AB\u00BB\u2013\u2014]$/
    };
    const AR_LETTER = /^[\u0621-\u063A\u0641-\u064A\u067E\u0686\u0698\u06A9\u06AF\u06CC]$/, LA_LETTER = /^[a-z]$/;
    const foldCh = function (t) { return String(t).normalize('NFKC').replace(/[\u064A\u0649]/g, '\u06CC').replace(/\u0643/g, '\u06A9').toLowerCase(); };

    /** the script of a font's glyphs: each glyph's nearest character votes, as often as the font draws the glyph */
    function script(items, faces) {
        let ar = 0, la = 0;
        Object.keys(items).forEach(function (key) {
            const it = items[key], top = rank(it.shape, faces, 1)[0];
            if (!top) return;
            if (/[\u0621-\u06CC]/.test(top[0])) ar += it.uses || 1;
            else if (/[A-Za-z]/.test(top[0])) la += it.uses || 1;
        });
        return ar > la ? 'arabic' : 'latin';
    }

    /**
     * a font's glyphs read by their shapes: items { key: { shape, uses } }, words [[key, …]] in reading order, pairs a
     * Set of the letter pairs the script's language writes (folded, two characters each), o { script, k, lambda }.
     * Each glyph takes one of its k nearest characters: the nearest first, then — glyph by glyph, the most drawn
     * first, three times over — the one that leaves the fewest pairs no language of ours writes, a step from the
     * nearest costing lambda for each unit of distance a time it is drawn. → { script, text: { key: character },
     * dist: the chosen characters' mean distance (as often as drawn), pairs, unseen: the pairs not in `pairs` }
     */
    function read(items, words, faces, pairs, o) {
        o = o || {};
        const sc = o.script || script(items, faces), k = o.k || 3, lambda = o.lambda === undefined ? LAMBDA : o.lambda;
        const keys = Object.keys(items), cand = {}, pick = {}, inWords = {};
        keys.forEach(function (key) {
            cand[key] = rank(items[key].shape, faces, k, SCRIPTS[sc]);
            pick[key] = 0; inWords[key] = [];
        });
        const ws = (words || []).map(function (w) { return w.filter(function (key) { return cand[key] && cand[key].length; }); }).filter(function (w) { return w.length > 1; });
        ws.forEach(function (w, i) { w.forEach(function (key) { if (inWords[key].indexOf(i) < 0) inWords[key].push(i); }); });
        const letter = sc === 'arabic' ? AR_LETTER : LA_LETTER;
        const unseen = function (w) {
            let n = 0, all = 0;
            const t = w.map(function (key) { return foldCh(cand[key][pick[key]][0]); });
            for (let i = 0; i + 1 < t.length; i++) {
                if (!letter.test(t[i]) || !letter.test(t[i + 1])) continue;
                all++; if (!pairs || !pairs.has(t[i] + t[i + 1])) n++;
            }
            return [n, all];
        };
        const order = keys.filter(function (key) { return cand[key].length > 1; })
            .sort(function (a, b) { return (items[b].uses || 0) - (items[a].uses || 0) || (a < b ? -1 : 1); });
        for (let pass = 0; pass < 3; pass++) {
            let moved = false;
            order.forEach(function (key) {
                const c = cand[key], uses = items[key].uses || 1;
                let best = pick[key], bestCost = Infinity;
                for (let j = 0; j < c.length; j++) {
                    pick[key] = j;
                    let n = 0;
                    inWords[key].forEach(function (i) { n += unseen(ws[i])[0]; });
                    const cost = n + lambda * uses * (c[j][1] - c[0][1]);
                    if (cost < bestCost - 1e-9) { bestCost = cost; best = j; }
                }
                if (best !== pick[key]) moved = true;
                pick[key] = best;
            });
            if (!moved) break;
        }
        const text = {};
        let dsum = 0, usum = 0, nUnseen = 0, nPairs = 0, moved = 0;
        keys.forEach(function (key) {
            if (!cand[key].length) return;
            text[key] = cand[key][pick[key]][0];
            dsum += (items[key].uses || 1) * cand[key][pick[key]][1]; usum += items[key].uses || 1;
            if (pick[key]) moved += items[key].uses || 1;
        });
        ws.forEach(function (w) { const u = unseen(w); nUnseen += u[0]; nPairs += u[1]; });
        return { script: sc, text: text, dist: usum ? dsum / usum : 1, moved: usum ? moved / usum : 0, pairs: nPairs, unseen: nUnseen };
    }

    function source(faces) {
        const esc = function (t) { return JSON.stringify(t); };
        return '/**\n * Kelk \u2014 glyph shapes (lib/pdfimport/shapes.js): generated by tools/build-shapes.js; do not edit by hand. Per face Kelk\n' +
            ' * ships, a record a glyph: its shape (lib/pdfimport/shape.js: a small grid, its box and its dots, ' + PACKED + ' characters)\n' +
            ' * and the character the font gives it; records a tab apart. Shapes and characters only: no font is in this file.\n */\n' +
            '(function (global) {\n    const data = {\n        v: ' + V + ',\n        faces: [\n' +
            faces.map(function (f) {
                return '            { family: ' + esc(f.family) + ', face: ' + esc(f.face) + ', glyphs: ' + f.shapes.length + ',\n              shapes: ' +
                    esc(f.shapes.map(function (r) { return r[0] + r[1]; }).join('\t')) + ' }';
            }).join(',\n') + '\n        ]\n    };\n' +
            '    if (typeof module !== \'undefined\' && module.exports) module.exports = data;\n    else global.KelkPdfShapes = data;\n' +
            '})(typeof window !== \'undefined\' ? window : globalThis);\n';
    }

    function expand(data) {
        if (!data) return [];
        if (data._expanded) return data._expanded;
        data._expanded = (data.faces || []).map(function (f) {
            return { family: f.family, face: f.face, shapes: f.shapes ? f.shapes.split('\t').map(function (r) { return [r.slice(0, PACKED), r.slice(PACKED)]; }) : [] };
        });
        return data._expanded;
    }

    PdfImporter._shape = { V: V, G: G, SCRIPTS: SCRIPTS, script: script, read: read, glyphs: glyphs, fromPolygons: fromPolygons, face: face, pack: pack, unpack: unpack, distance: distance, rank: rank, source: source, expand: expand };
})(typeof window !== 'undefined' ? window : globalThis);
