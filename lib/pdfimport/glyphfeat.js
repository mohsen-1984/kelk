/**
 * PdfImporter — outline features of a glyph (lib/pdfimport/glyphfeat.js)
 * ============================================================================
 * What a glyph's outline says about which Arabic-script letter, and which form of it, the glyph can be — read from
 * the outline alone, with no reference font: whether it joins forward (its outline reaches the side it joins on, in
 * the baseline band), its dots above and below (counted by area: two or three dots are often one part), a bar over
 * it (گ's stroke), how tall its body stands against the font's own tall bodies, a descender, its holes (counters),
 * its width, its tall strokes (lam 1, lam-alef 2), a kashida's bar, and its top profile (peaks, a dip or a rise).
 * For the decipherment of fonts Kelk does not know (Kelk 3.5, after the font-recovery spike's feat.js, featmodel.js).
 *
 * The model, P(feature | letter, joins forward), is learned from the fonts Kelk ships only — never from a lab file —
 * by tools/build-featmodel.js into lib/pdfimport/featmodel.js (window.KelkPdfFeatModel): counts per group of faces,
 * summed when loaded, so a group (the B fonts) can be taken out with its fonts.
 *
 *   PdfImporter._glyphfeat.font(bytes)        a TrueType or bare CFF program → { upm, cff, path(key), adv(key) }:
 *                                             path: [{ c: 'M'|'L'|'Q'|'C'|'Z', x, y, x1, y1, x2, y2 }] in font units
 *                                             (key: a glyph id, a CID in a CID-keyed CFF font); null: no outlines
 *   PdfImporter._glyphfeat.parts(f, key)       a glyph's parts: { main, dots, strokes, em } (each { area, x0, y0, x1, y1,
 *                                             cx, cy }), null when it has no outline
 *   PdfImporter._glyphfeat.context(f, keys)   the font's measures over the glyphs a document uses (keys, repeats
 *                                             counted): its single dot's area
 *   PdfImporter._glyphfeat.features(f, key, cx)  → { blank } or { left, right, above, below, bar, tall, kashida, w,
 *                                             h, top, bottom, bodyTop, bodyBottom } (em units)
 *   PdfImporter._glyphfeat.holes(f, key)      the parts wound against the body (counters)
 *   PdfImporter._glyphfeat.profile(f, key)    → { peaks, v, aspect }: the top edge's peaks, a dip (-1) or a rise (1)
 *   PdfImporter._glyphfeat.bins(e, H, holes, pr)  the discrete features (H: the font's tall body height)
 *   PdfImporter._glyphfeat.build(samples)     → the model's counts: { 'letter|fwd': { n, c: { feature: [counts] } } }
 *   PdfImporter._glyphfeat.model(data)        featmodel.js's data → the counts of every group summed, once
 *   PdfImporter._glyphfeat.logp(model, letter, fwd, f, feats)  log P(f | letter, fwd), naive Bayes, add-0.5
 *   PdfImporter._glyphfeat.FEATS, BASE        the features and their sizes; the ones letters are scored on (the top
 *                                             profile only chooses among digits: on letters it overfitted)
 *
 * Loaded on demand with the decipherment. Needs lib/pdfimport/fontprint.js (the TrueType outline reader) and, for CFF,
 * lib/pdfimport/cff.js.
 */
(function (global) {
    'use strict';
    const PdfImporter = global.PdfImporter || (typeof require === 'function' ? require('../PdfImporter.js') : null);

    /** a TrueType program's advance widths (font units) */
    function hmtx(d) {
        const v = new DataView(d.buffer, d.byteOffset, d.byteLength), n = v.getUint16(4), T = {};
        for (let k = 0; k < n; k++) { const o = 12 + 16 * k; T[String.fromCharCode(d[o], d[o + 1], d[o + 2], d[o + 3])] = v.getUint32(o + 8); }
        if (T.hhea === undefined || T.hmtx === undefined) return function () { return 0; };
        const m = v.getUint16(T.hhea + 34);
        return function (g) { return v.getUint16(T.hmtx + 4 * Math.min(g, m - 1)); };
    }

    /** TrueType contours ([[x, y, on]]) → path commands: quadratic curves, an implied point between two off ones */
    function ttPath(contours) {
        const cmds = [];
        contours.forEach(function (ct) {
            const pts = ct.map(function (p) { return { x: p[0], y: p[1], on: !!p[2] }; });
            if (!pts.length) return;
            let start = pts.findIndex(function (q) { return q.on; }), first;
            if (start < 0) { first = { x: (pts[0].x + pts[1 % pts.length].x) / 2, y: (pts[0].y + pts[1 % pts.length].y) / 2, on: true }; start = 0; }
            else first = pts[start];
            cmds.push({ c: 'M', x: first.x, y: first.y });
            let ctrl = null;
            for (let k = 1; k <= pts.length; k++) {
                const q = pts[(start + k) % pts.length];
                if (k === pts.length && q === first) { if (ctrl) cmds.push({ c: 'Q', x1: ctrl.x, y1: ctrl.y, x: first.x, y: first.y }); ctrl = null; break; }
                if (q.on) { if (ctrl) { cmds.push({ c: 'Q', x1: ctrl.x, y1: ctrl.y, x: q.x, y: q.y }); ctrl = null; } else cmds.push({ c: 'L', x: q.x, y: q.y }); }
                else { if (ctrl) cmds.push({ c: 'Q', x1: ctrl.x, y1: ctrl.y, x: (ctrl.x + q.x) / 2, y: (ctrl.y + q.y) / 2 }); ctrl = q; }
            }
            if (ctrl) cmds.push({ c: 'Q', x1: ctrl.x, y1: ctrl.y, x: first.x, y: first.y });
            cmds.push({ c: 'Z' });
        });
        return cmds;
    }

    /** CFF contours ([[x, y, on]], a cubic curve's two control points off the curve) → path commands */
    function cffPath(contours) {
        const cmds = [];
        contours.forEach(function (ct) {
            if (!ct.length) return;
            cmds.push({ c: 'M', x: ct[0][0], y: ct[0][1] });
            for (let k = 1; k < ct.length; k++) {
                const p = ct[k];
                if (p[2]) { cmds.push({ c: 'L', x: p[0], y: p[1] }); continue; }
                const a = p, b = ct[k + 1], e = ct[k + 2] || ct[0];
                if (!b) break;
                cmds.push({ c: 'C', x1: a[0], y1: a[1], x2: b[0], y2: b[1], x: e[0], y: e[1] });
                k += 2;
            }
            cmds.push({ c: 'Z' });
        });
        return cmds;
    }

    function font(bytes) {
        const FP = PdfImporter._fontprint;
        const o = FP && FP.outlines(bytes);
        if (!o || !o.upm) return null;
        const cache = {}, adv = o.cff ? o.adv : hmtx(bytes);
        return {
            upm: o.upm, cff: !!o.cff, n: o.n,
            path: function (key) {
                if (key in cache) return cache[key];
                const c = o.read(key);
                return (cache[key] = c && c.length ? (o.cff ? cffPath(c) : ttPath(c)) : []);
            },
            adv: function (key) { return adv(key) || 0; }
        };
    }

    /** a glyph's parts: its main body, the small parts filled like it (dots) and the other parts filled like it (strokes) */
    function parts(f, key) {
        const p = f.path(key);
        if (!p || !p.length) return null;
        if (f._parts && key in f._parts) return f._parts[key];
        const cs = []; let cur = null;
        p.forEach(function (k) {
            if (k.c === 'M') { cur = []; cs.push(cur); }
            if (!cur || k.c === 'Z') return;
            if (k.x1 !== undefined) cur.push([k.x1, k.y1]);
            if (k.x2 !== undefined) cur.push([k.x2, k.y2]);
            cur.push([k.x, k.y]);
        });
        const info = cs.filter(function (c) { return c.length > 2; }).map(function (c) {
            let a = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            for (let i = 0; i < c.length; i++) {
                const x = c[i][0], y = c[i][1], u = c[(i + 1) % c.length][0], v = c[(i + 1) % c.length][1];
                a += x * v - u * y; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
            }
            return { area: a / 2, x0: x0, y0: y0, x1: x1, y1: y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
        });
        let out = null;
        if (info.length) {
            const main = info.reduce(function (m, c) { return Math.abs(c.area) > Math.abs(m.area) ? c : m; });
            const em = f.upm || 1000, sign = Math.sign(main.area);
            // a dot: a small part filled like the body (two or three dots are often one part: wide, never tall)
            const dots = info.filter(function (c) { return c !== main && Math.sign(c.area) === sign && (c.y1 - c.y0) < 0.24 * em && (c.x1 - c.x0) < 0.42 * em && Math.abs(c.area) < 0.45 * Math.abs(main.area); });
            const strokes = info.filter(function (c) { return c !== main && Math.sign(c.area) === sign && dots.indexOf(c) < 0; });
            out = { main: main, dots: dots, strokes: strokes, em: em };
        }
        (f._parts || (f._parts = {}))[key] = out;
        return out;
    }

    /** the font's measures over the glyphs a document uses: the single dot's area (where most dots cluster, among
     *  the smaller ones — marks such as tanwin are rarer) */
    function context(f, keys) {
        const areas = [];
        keys.forEach(function (k) { const g = parts(f, k); if (g) g.dots.forEach(function (d) { areas.push(Math.abs(d.area)); }); });
        areas.sort(function (a, b) { return a - b; });
        if (!areas.length) return { dot: 0 };
        const lo = areas.slice(0, Math.max(1, Math.ceil(areas.length * 0.6)));
        return { dot: lo[Math.floor(lo.length / 2)] };
    }

    /** dots above and below the body, counted by area; a bar over it */
    function dots(f, key, cx) {
        const g = parts(f, key), u = cx && cx.dot;
        if (!g || !u) return null;
        let above = 0, below = 0;
        g.dots.forEach(function (d) { const n = Math.max(1, Math.min(3, Math.round(Math.abs(d.area) / u))); if (d.cy >= g.main.cy) above += n; else below += n; });
        return { above: above, below: below, bar: g.strokes.some(function (s) { return s.cy > g.main.cy && (s.x1 - s.x0) > 2.2 * (s.y1 - s.y0); }) };
    }

    /** tall strokes: clusters of outline points in the glyph's top quarter (lam 1, lam-alef 2) */
    function tall(f, key) {
        const p = f.path(key);
        if (!p || !p.length) return 0;
        const pts = p.filter(function (k) { return k.x !== undefined; });
        let y0 = Infinity, y1 = -Infinity;
        pts.forEach(function (k) { y0 = Math.min(y0, k.y); y1 = Math.max(y1, k.y); });
        const em = f.upm || 1000;
        if (y1 - y0 < 0.45 * em) return 0;
        const xs = pts.filter(function (k) { return k.y > y0 + 0.75 * (y1 - y0); }).map(function (k) { return k.x; }).sort(function (a, b) { return a - b; });
        let n = xs.length ? 1 : 0;
        for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > 0.12 * em) n++;
        return n;
    }

    /** a kashida (tatweel): one thin horizontal bar on the baseline */
    function kashida(f, key) {
        const g = parts(f, key);
        if (!g || g.dots.length || g.strokes.length) return false;
        const w = g.main.x1 - g.main.x0, h = g.main.y1 - g.main.y0;
        return h < 0.13 * g.em && w > 1.6 * h && g.main.y0 > -0.1 * g.em;
    }

    function features(f, key, cx) {
        const p = f.path(key);
        if (!p || !p.length) return { blank: true };
        const em = f.upm || 1000, adv = f.adv(key);
        let y0 = Infinity, y1 = -Infinity;
        const pts = [];
        p.forEach(function (k) { if (k.x !== undefined) { pts.push([k.x, k.y]); y0 = Math.min(y0, k.y); y1 = Math.max(y1, k.y); } });
        // joining strokes reach the glyph's advance box on the side they join, in the baseline band
        const band = pts.filter(function (q) { return q[1] > -0.05 * em && q[1] < 0.25 * em; }), eps = 0.03 * em;
        const right = band.some(function (q) { return q[0] >= adv - eps; }), left = band.some(function (q) { return q[0] <= eps; });
        const d = dots(f, key, cx) || { above: 0, below: 0, bar: false };
        const g = parts(f, key);
        return { blank: false, left: left, right: right, above: d.above, below: d.below, bar: d.bar, tall: tall(f, key), kashida: kashida(f, key),
                 w: adv / em, h: (y1 - y0) / em, top: y1 / em, bottom: y0 / em,
                 bodyTop: g ? g.main.y1 / em : y1 / em, bodyBottom: g ? g.main.y0 / em : y0 / em };
    }

    /** holes: parts wound against the body (counters), more than 1 % of its area */
    function holes(f, key) {
        const p = f.path(key);
        if (!p || !p.length) return 0;
        const cs = []; let cur = null;
        p.forEach(function (k) { if (k.c === 'M') { cur = []; cs.push(cur); } if (!cur || k.c === 'Z') return; cur.push([k.x, k.y]); });
        const areas = cs.filter(function (c) { return c.length > 2; }).map(function (c) {
            let a = 0;
            for (let i = 0; i < c.length; i++) { const q = c[i], r = c[(i + 1) % c.length]; a += q[0] * r[1] - r[0] * q[1]; }
            return a / 2;
        });
        if (!areas.length) return 0;
        const main = areas.reduce(function (m, a) { return Math.abs(a) > Math.abs(m) ? a : m; });
        return areas.filter(function (a) { return Math.sign(a) !== Math.sign(main) && Math.abs(a) > Math.abs(main) * 0.01; }).length;
    }

    /** the top profile: peaks along the top edge, and whether it dips (V) or rises (Λ) in the middle */
    function profile(f, key) {
        const p = f.path(key);
        if (!p || !p.length) return { peaks: 0, v: 0, aspect: 1 };
        const pts = []; let last = null;
        p.forEach(function (k) {
            if (k.x === undefined) return;
            if (last && (k.c === 'L' || k.c === 'Q' || k.c === 'C')) for (let t = 0.25; t < 1; t += 0.25) pts.push([last[0] + (k.x - last[0]) * t, last[1] + (k.y - last[1]) * t]);
            pts.push([k.x, k.y]); last = [k.x, k.y];
        });
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        pts.forEach(function (q) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
        const n = 9, top = new Array(n).fill(-Infinity), h = Math.max(1, y1 - y0), w = Math.max(1, x1 - x0);
        pts.forEach(function (q) { const i = Math.min(n - 1, Math.floor((q[0] - x0) / w * n)); top[i] = Math.max(top[i], q[1]); });
        for (let i = 0; i < n; i++) if (top[i] === -Infinity) top[i] = i ? top[i - 1] : y0;
        let peaks = 0;
        for (let i = 0; i < n; i++) { const l = i ? top[i - 1] : y0, r = i < n - 1 ? top[i + 1] : y0; if (top[i] > l && top[i] >= r && top[i] - Math.min(l, r) > 0.12 * h) peaks++; }
        const mid = (top[3] + top[4] + top[5]) / 3, edge = (top[0] + top[n - 1]) / 2;
        return { peaks: Math.min(3, peaks), v: mid < edge - 0.25 * h ? -1 : mid > edge + 0.25 * h ? 1 : 0, aspect: w / h };
    }

    const FEATS = { a: 4, b: 4, t: 4, d: 3, h: 2, k: 2, s: 3, w: 4, p: 4, v: 3, r: 3 };
    const BASE = ['a', 'b', 't', 'd', 'h', 'k', 's', 'w'];

    function bins(e, H, nh, pr) {
        pr = pr || { peaks: 0, v: 0, aspect: 1 };
        const r = e.bodyTop / H;
        return {
            a: Math.min(3, e.above + (e.bar ? 1 : 0)), b: Math.min(3, e.below),
            t: r < 0.62 ? 0 : r < 0.8 ? 1 : r < 0.95 ? 2 : 3,
            d: e.bodyBottom > -0.05 ? 0 : e.bodyBottom > -0.15 ? 1 : 2,
            h: nh > 0 ? 1 : 0, k: e.kashida ? 1 : 0, s: Math.min(2, e.tall),
            w: e.w < 0.25 ? 0 : e.w < 0.45 ? 1 : e.w < 0.7 ? 2 : 3,
            p: pr.peaks, v: pr.v + 1, r: pr.aspect < 0.45 ? 0 : pr.aspect < 0.9 ? 1 : 2
        };
    }

    function build(samples) {
        const m = {};
        samples.forEach(function (s) {
            const key = s.letter + '|' + (s.fwd ? 1 : 0), f = bins(s.e, s.H, s.holes, s.pr);
            const e = m[key] || (m[key] = { n: 0, c: {} });
            e.n++;
            Object.keys(FEATS).forEach(function (k) { (e.c[k] || (e.c[k] = new Array(FEATS[k]).fill(0)))[f[k]]++; });
        });
        return m;
    }

    /** featmodel.js's data ({ v, feats, groups: [{ name, faces, classes: { key: [n, counts…] } }] }) → summed counts */
    function model(data) {
        if (data._model) return data._model;
        const ks = data.feats, m = {};
        data.groups.forEach(function (g) {
            Object.keys(g.classes).forEach(function (key) {
                const a = g.classes[key], e = m[key] || (m[key] = { n: 0, c: {} });
                e.n += a[0];
                let o = 1;
                ks.forEach(function (k) {
                    const c = e.c[k] || (e.c[k] = new Array(FEATS[k]).fill(0));
                    for (let i = 0; i < FEATS[k]; i++) c[i] += a[o + i];
                    o += FEATS[k];
                });
            });
        });
        Object.defineProperty(data, '_model', { value: m, enumerable: false });
        return m;
    }

    function logp(m, letter, fwd, f, feats) {
        const e = m[letter + '|' + (fwd ? 1 : 0)];
        if (!e) return null;
        let t = 0;
        (feats || BASE).forEach(function (k) { t += Math.log(((e.c[k] ? e.c[k][f[k]] : 0) + 0.5) / (e.n + 0.5 * FEATS[k])); });
        return t;
    }

    const api = { font: font, parts: parts, context: context, features: features, holes: holes, profile: profile, bins: bins, build: build,
                  model: model, logp: logp, FEATS: FEATS, BASE: BASE };
    if (PdfImporter) PdfImporter._glyphfeat = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
