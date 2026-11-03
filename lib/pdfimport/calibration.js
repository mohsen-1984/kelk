/**
 * PdfImporter — calibration (lib/pdfimport/calibration.js)
 * ============================================================================
 * _calibrate(pages, fonts): the document's own measures, read once after extraction (pure, O(glyphs), frozen):
 *   body {size, font, name, n}  fonts {[id]: {name, spaceW, letterGap, xHeight, hasSpaceGlyph, n}}
 *   gaps {wordEm, letterEm, bimodal, spaced, n, nLetter}  steps {leading, paraGap, n}  columns {edges, ends, gutter, n}
 *   tracking {tz, tc, tzShare, tcShare, n, drift}  regions {[page]: {size, wordEm, n, drift}}
 *   (drift {n, slope, on}: on = the runs were placed from their untracked widths — lines.js lays them out again so;
 *   PdfImporter._calibrationInternal.untrack is that layout)
 * Sizes and steps in pt, gaps in em of the glyph size; n = samples (thresholds.js minSamples).
 * Load after thresholds.js (see lib/PdfImporter.js for the order).
 */
(function (global) {
    'use strict';
    const PdfImporter = global.PdfImporter || (typeof require === 'function' ? require('../PdfImporter.js') : null);
    const { median, mode } = PdfImporter._internal;
    const freeze = function (o) { if (o && typeof o === 'object') { Object.keys(o).forEach(function (k) { freeze(o[k]); }); Object.freeze(o); } return o; };
    // a histogram's mode within (lo, hi) at 1/r steps, and its count
    function peak(h, lo, hi) { let b = null, c = 0; h.forEach(function (n, k) { if (k > lo && k < hi && n > c) { c = n; b = k; } }); return [b, c]; }
    function hist(a, r) { const h = new Map(); a.forEach(function (v) { const k = Math.round(v * r) / r; h.set(k, (h.get(k) || 0) + 1); }); return h; }
    // OS/2 sxHeight / head unitsPerEm of an embedded TrueType / OpenType font, in em (null if absent)
    function xHeight(f) {
        try {
            const d = f && f.data; if (!d || d.length < 12 || f.isType3Font) return null;
            const v = new DataView(d.buffer, d.byteOffset, d.byteLength), T = {};
            for (let k = 0; k < v.getUint16(4) && 28 + 16 * k <= d.length; k++) T[String.fromCharCode(d[12 + 16 * k], d[13 + 16 * k], d[14 + 16 * k], d[15 + 16 * k])] = v.getUint32(20 + 16 * k);
            const o = T['OS/2'], h = T.head;
            if (o === undefined || h === undefined || v.getUint16(o) < 2 || o + 88 > d.length) return null;
            const x = v.getInt16(o + 86), u = v.getUint16(h + 18);
            return x > 0 && u ? +(x / u).toFixed(3) : null;
        } catch (e) { return null; }
    }

    // the literals of the untracked layout and its drift reading (thresholds.js; defaults only — calibration reads them
    // before there is a calibration, so each is its def)
    const C = 'calibration.js ';
    PdfImporter._defineThresholds({
        calRunBaselineEm: { def: 0.2, unit: 'em', used: [C + 'untrack', C + 'driftOf (two glyphs on one baseline)'] },
        calRunNextEm: { def: 0.002, unit: 'em', used: [C + 'untrack (the next operator drawn where the last one\'s advance left off)'] },
        calDriftGapMaxEm: { def: 1.5, unit: 'em', used: [C + 'driftOf (a gap wider in both readings — a column, a cell — is no sample)'] },
        calDriftMinSamples: { def: 8, unit: 'count', used: [C + 'driftFit (on)'] },
        calDriftSlopeMax: { def: -0.5, unit: 'ratio', used: [C + 'driftFit (on: the gaps follow the drift)'] }
    });
    const K = function (name) { return PdfImporter._thresholds[name].def; };

    // the glyphs of one text-showing operator, as laid out without their Tz and Tc: a run is glyphs next to each
    // other in drawing order with one `seq` (extract.js: the operator's index) on one baseline, unturned, or drawn
    // each at the advance of the one before; within it
    // each step from glyph to glyph is (w + Tc)·Tz plus TJ kerning ·Tz, so the untracked step is step / Tz − Tc.
    // → { x, w, start }: per glyph its untracked x and width, and the index its run starts at (pure; identity for
    // glyphs set without Tz / Tc)
    function untrack(gs) {
        const n = gs.length, x = new Array(n), w = new Array(n), start = new Array(n), BL = K('calRunBaselineEm'), NX = K('calRunNextEm');
        for (let i = 0; i < n; i++) {
            const g = gs[i], a = gs[i - 1], hs = g.hs || 1;
            w[i] = g.w / hs;
            // (or the next operator, drawn where the last one's advance left off: Chrome shows a Persian line glyph by
            // glyph, one Tj each, and moves by Td only where a run starts)
            const same = a && !a.rot && !g.rot && a.size > 0 && Math.abs(a.y - g.y) <= BL * a.size &&
                (a.seq !== undefined && a.seq === g.seq || Math.abs(g.x - (a.x + a.w + (a.track || 0) * a.size * (a.hs || 1))) < NX * a.size);
            if (!same) { x[i] = g.x; start[i] = i; continue; }
            start[i] = start[i - 1];
            x[i] = x[i - 1] + (g.x - a.x) / (a.hs || 1) - (a.track || 0) * a.size;
        }
        return { x: x, w: w, start: start };
    }
    // where one operator's run ends and the next one's starts on the same baseline, to its right, after a run set with
    // Tz or Tc: the gap as drawn (gO) and the run's drift D, how much longer its Tz / Tc made it (both in em). A producer
    // that placed each run from its untracked widths (each word moved to its place by Td — Kelk's own PDFs; a tool that
    // condenses or tracks text afterwards; the metamorphic net's tz85 / trackTight / trackLoose) leaves gaps that shrink
    // as the drift grows (gO = gap − D: slope −1, letter-spaced words overlap); one that laid the runs out tracked
    // leaves gaps that do not follow it (slope 0). Gaps over 1.5 em in both readings (a column, a cell) are no sample.
    // (the sums for driftFit, added into each of accs: the page's and the document's)
    // (two runs drawn one after the other: the next one to the right (left-to-right text), or to the left — a right-
    // to-left line drawn word by word, Chrome's Persian: then the drift is the left run's and the gap before the first)
    function driftOf(gs, U, accs) {
        const runs = [], BL = K('calRunBaselineEm'), GM = K('calDriftGapMaxEm');
        for (let i = 0; i < gs.length; i++) { if (U.start[i] === i) runs.push([i, i]); else runs[runs.length - 1][1] = i; }
        const tracked = function (r) { for (let k = r[0]; k <= r[1]; k++) if ((gs[k].hs || 1) !== 1 || gs[k].track) return true; return false; };
        for (let k = 1; k < runs.length; k++) {
            const A = runs[k - 1], B = runs[k], a0 = gs[A[0]], b0 = gs[B[0]];
            // (not invisible text: an OCR layer's words are stretched by Tz to the boxes of the scan's words — Tesseract —,
            // their places those of the picture whatever their drift)
            if (a0.rot || b0.rot || a0.invisible || b0.invisible || !(a0.size > 0) || Math.abs(a0.y - b0.y) > BL * a0.size || b0.x === a0.x) continue;
            const L = b0.x > a0.x ? A : B, R = L === A ? B : A, e = gs[L[1]], r0 = gs[R[0]], em = e.size;
            if (e.rot || !(em > 0) || !tracked(L)) continue;
            const D = ((e.x + e.w) - (U.x[L[1]] + U.w[L[1]])) / em, gO = (r0.x - (e.x + e.w)) / em;
            if (Math.min(Math.abs(gO), Math.abs(gO + D)) > GM) continue;
            accs.forEach(function (s) { s.n++; s.d += D; s.g += gO; s.dd += D * D; s.dg += D * gO; });
        }
    }
    // the least-squares slope of gO on D; on: eight samples or more and the gaps follow the drift (a slope under −0.5;
    // the net's documents read −0.7 to −1.6, a page of a few lines down to −0.3; the corpus has no tracked layout with
    // samples, Tesseract's visible-text pages read −0.05)
    function driftFit(s) {
        const n = s.n, sd = s.d, sg = s.g, sdd = s.dd, sdg = s.dg;
        const v = n ? sdd / n - (sd / n) * (sd / n) : 0;
        const slope = n && v > 1e-4 ? (sdg / n - (sd / n) * (sg / n)) / v : null;
        return { n: n, slope: slope === null ? null : +slope.toFixed(3), on: slope !== null && n >= K('calDriftMinSamples') && slope < K('calDriftSlopeMax') };
    }

    function calibrate(pages, fonts) {
        fonts = fonts || {};
        const sizes = [], hs = [], tc = [], perFont = {};
        let ink = 0;
        pages.forEach(function (p) { p.glyphs.forEach(function (g) {
            if (g.rot || g.clipped || !(g.size > 0)) return;
            const f = perFont[g.font] || (perFont[g.font] = { sp: [], lg: [], n: 0 });
            f.n++;
            if (g.space) { if (g.w > 0) f.sp.push(g.w / g.size); return; }
            ink++; sizes.push(g.size); hs.push(g.hs || 1); if (g.track) tc.push(g.track);
        }); });
        const size = mode(sizes, 2) || 10, fc = {};
        const isBody = function (g) { return Math.abs(g.size - size) < 0.6; };
        const bare = [], cross = [], steps = [], segs = [], regions = {}, dDoc = { n: 0, d: 0, g: 0, dd: 0, dg: 0 };
        const tracked = ink > 0 && (hs.some(function (h) { return h !== 1; }) || tc.length > 0);
        pages.forEach(function (p) {
            const gs = p.glyphs, rows = new Map(), pb = [], pc = [], psz = [];
            for (let i = 0; i < gs.length; i++) {
                const b = gs[i];
                if (b.rot || b.clipped || !(b.size > 0)) continue;
                if (!b.space) { psz.push(b.size); if (isBody(b)) fc[b.font] = (fc[b.font] || 0) + 1; }
                const y = Math.round(b.y * 2) / 2;
                (rows.get(y) || rows.set(y, []).get(y)).push(b);
                // gaps between glyphs drawn one after the other on a baseline (either direction: right-to-left runs)
                const a = gs[i - 1];
                if (!a || a.space || a.rot || a.clipped || b.space || !isBody(a) || !isBody(b) || Math.abs(a.y - b.y) > 0.2 * a.size) continue;
                const e = (b.x >= a.x ? b.x - (a.x + a.w) : a.x - (b.x + b.w)) / Math.min(a.size, b.size);
                if (e > -0.3 && e < 1.5) { bare.push(e); pb.push(e); if (a.font === b.font) perFont[a.font].lg.push(e); }
            }
            // a gap across one space glyph: a word gap as the producer drew it
            for (let i = 2; i < gs.length; i++) {
                const z = gs[i - 2], s = gs[i - 1], b = gs[i];
                if (!s.space || z.space || z.rot || b.rot || z.clipped || b.clipped || !isBody(z) || !isBody(b) || Math.abs(z.y - b.y) > 0.2 * z.size) continue;
                const e = (b.x >= z.x ? b.x - (z.x + z.w) : z.x - (b.x + b.w)) / Math.min(z.size, b.size);
                if (e > 0 && e < 1.5) { cross.push(e); pc.push(e); }
            }
            // baselines of body text, top to bottom: their steps; their segments (parted by 2 em or more): column edges
            const ys = [];
            rows.forEach(function (r, y) {
                const body = r.filter(function (g) { return !g.space && isBody(g); });
                if (body.length < 3) return;
                ys.push(y);
                body.sort(function (a, b) { return a.x - b.x; });
                let x0 = body[0].x;
                for (let k = 1; k <= body.length; k++) {
                    const g = body[k], q = body[k - 1];
                    if (k < body.length && g.x - (q.x + q.w) < 2 * size) continue;
                    if (q.x + q.w - x0 > 4 * size) segs.push([Math.round(x0), Math.round(q.x + q.w)]);
                    if (k < body.length) x0 = g.x;
                }
            });
            ys.sort(function (a, b) { return b - a; });
            for (let k = 1; k < ys.length; k++) { const d = ys[k - 1] - ys[k]; if (d > 0.8 * size && d < 4 * size) steps.push(d); }
            const w = split(pb, pc);
            // (runs placed from their untracked widths: the page's own reading, and the document's)
            const dPage = { n: 0, d: 0, g: 0, dd: 0, dg: 0 };
            if (tracked) driftOf(gs, untrack(gs), [dPage, dDoc]);
            regions[p.num] = { size: mode(psz, 2), wordEm: w.wordEm, n: w.n, drift: driftFit(dPage) };
        });
        const gaps = split(bare, cross);
        const leading = mode(steps.filter(function (d) { return d < 2.5 * size; }), 10);
        const para = leading ? steps.filter(function (d) { return d > 1.15 * leading; }) : [];
        // column edges: ends shared by a tenth of the segments (3 or more), neighbours within 2 pt merged; left (edges)
        // and right (ends: right-to-left text). gutter: the narrowest gap from a column's right end to the next edge
        const edgesOf = function (xs) {
            const h = hist(xs, 1), e = [];
            Array.from(h.keys()).sort(function (a, b) { return a - b; }).forEach(function (x) {
                if (h.get(x) >= Math.max(3, 0.1 * xs.length) && !(e.length && x - e[e.length - 1] <= 2)) e.push(x);
            });
            return e;
        };
        const edges = edgesOf(segs.map(function (s) { return s[0]; })), ends = edgesOf(segs.map(function (s) { return s[1]; }));
        let gutter = null;
        for (let k = 1; k < edges.length; k++) {
            let r = -Infinity;
            segs.forEach(function (s) { if (Math.abs(s[0] - edges[k - 1]) <= 2 && s[1] < edges[k]) r = Math.max(r, s[1]); });
            if (r > -Infinity && (gutter === null || edges[k] - r < gutter)) gutter = edges[k] - r;
        }
        let body = null, bn = 0;
        Object.keys(fc).forEach(function (k) { if (fc[k] > bn) { bn = fc[k]; body = k; } });
        const fo = {};
        Object.keys(perFont).forEach(function (k) {
            const f = perFont[k], r = fonts[k] || {};
            fo[k] = { name: r.name || '', spaceW: f.sp.length ? +median(f.sp).toFixed(3) : null, letterGap: f.lg.length ? +median(f.lg).toFixed(3) : null,
                      xHeight: xHeight(r.font), hasSpaceGlyph: f.sp.length > 0, n: f.n };
        });
        const tzm = mode(hs, 100);
        return freeze({
            body: { size: size, font: body, name: body && fonts[body] ? fonts[body].name || '' : '', n: Object.keys(fc).reduce(function (s, k) { return s + fc[k]; }, 0) },
            fonts: fo, gaps: gaps,
            steps: { leading: leading, paraGap: para.length ? mode(para, 10) : null, n: steps.length },
            columns: { edges: edges, ends: ends, gutter: gutter, n: segs.length },
            tracking: { tz: tzm === null ? 1 : tzm, tc: tc.length ? mode(tc, 200) : 0, tzShare: ink ? +(hs.filter(function (h) { return h !== 1; }).length / ink).toFixed(3) : 0,
                        tcShare: ink ? +(tc.length / ink).toFixed(3) : 0, n: ink, drift: driftFit(dDoc) },
            regions: regions
        });
    }
    // letter gaps: the mode of the bare gaps; word gaps: bare gaps 0.07 em or more above it (under 1.2), and gaps across
    // a space glyph. bimodal: the bare gaps part in two (a word peak with a valley under half of it before it)
    function split(bare, cross) {
        const h = hist(bare, 50), le = peak(h, -0.3, 1.5)[0];
        const letterEm = le === null ? null : le;
        const words = letterEm === null ? [] : bare.filter(function (e) { return e >= letterEm + 0.07 && e < 1.2; });
        const all = words.concat(cross), wh = hist(all, 50), w = peak(wh, 0, 1.2);
        let bimodal = false;
        if (words.length >= 3 && w[0] !== null) {
            const hw = hist(words, 50), pw = peak(hw, 0, 1.2);
            let valley = Infinity;
            for (let k = Math.round((letterEm + 0.02) * 50); k < Math.round(pw[0] * 50) - 1; k++) valley = Math.min(valley, h.get(k / 50) || 0);
            bimodal = pw[1] >= 3 && valley < 0.5 * pw[1];
        }
        return { wordEm: w[0], letterEm: letterEm, bimodal: bimodal, spaced: all.length ? +(cross.length / all.length).toFixed(3) : 0, n: all.length, nLetter: bare.length - words.length };
    }

    Object.assign(PdfImporter.prototype, { _calibrate(pages, fonts) { return calibrate(pages, fonts); } });
    PdfImporter._calibrationInternal = { untrack: untrack, driftOf: driftOf, driftFit: driftFit };
})(typeof window !== 'undefined' ? window : globalThis);
