/**
 * PdfImporter — 4. reading order (XY-cut) (lib/pdfimport/order.js)
 * ============================================================================
 * A page's blocks in reading order: columns, rows of borderless tables, floats. PDFIMPORT.md §8.1, §8.3.
 *
 * Part of PdfImporter: load after lib/PdfImporter.js (see its header for the order). The methods
 * are those of the class, added to its prototype; the helpers come from the core.
 */
(function (global) {
    'use strict';
    const PdfImporter = global.PdfImporter || (typeof require === 'function' ? require('../PdfImporter.js') : null);
    const { goesOn, inside, overlapY, isWhite, columnAlign, finishLine, median } = PdfImporter._internal;
    // a bullet as an OCR layer reads it: «◦» as © or o, «▪» as =, a checkbox as °
    const OCR_BUL = /^[©®°oO0e•·*◦○●■□▪‣∙=-]$/;

    Object.assign(PdfImporter.prototype, {
        async _pageBlocks(pl, body) {
            const p = pl.p;
            this._page = p;
            p.rects = p.rects.filter(function (r) { return r.y1 < pl.cutTop && r.y0 > pl.cutBottom; });
            this._pbCellShading(p);
            this._pbLineShading(p);
            let lines = pl.lines.slice();
            this._pbNotes(p, lines, body);
            this._pbStrike(p, lines);
            this._pbBoxPictures(pl, p, lines);
            const ruled = this._pbRuledTables(p, lines, body);
            const form = ruled.form, tables = ruled.tables, flow = ruled.flow;
            lines = ruled.lines;
            const boxes = this._pbBoxes(p, tables);
            const outer = this._pbFences(p, lines, boxes, tables);
            lines = this._pbBoxBlocks({ p: p, lines: lines, outer: outer, boxes: boxes, tables: tables, form: form, flow: flow });
            lines = this._pbQuoteBars({ pl: pl, p: p, body: body, lines: lines, tables: tables, flow: flow, outer: outer });
            const vec = this._pbMarkers(pl, p, body);
            const fig = this._pbClusters(pl, p, vec, body);
            const inl = await this._pbInline({ p: p, body: body, lines: lines, flow: flow, clusters: fig.clusters });
            await this._pbFigures({ pl: pl, p: p, body: body, allLines: inl.allLines, free: inl.free, textIn: fig.textIn, flow: flow });
            this._pbRules({ pl: pl, p: p, body: body, lines: lines, tables: tables, outer: outer, form: form, flow: flow });
            const cols = this._pbColumns(lines, flow, body);
            this._pbFloats(cols.items);
            const ordered = this._pbOrder(cols.leaves, body, cols.rtlPage);
            const out = this._pbBlocks(ordered, body);
            this._pbMergeBlocks(out, body);
            this._pbUnframedCode(out);
            return out;
        },

        // _pageBlocks step: table-cell shading merged into row bands
        _pbCellShading(p) {
            // shading drawn cell by cell (Chrome gives each table cell its own background): fills of one colour and
            // height that touch side by side are one band — a table row's; `cells` counts what it was made of
            const fills = p.rects.filter(function (r) { return r.color && !r.stroked && r.y1 - r.y0 >= 2 && r.x1 - r.x0 >= 2; })
                .sort(function (a, b) { return b.y1 - a.y1 || a.x0 - b.x0; });
            const gone = new Set();
            for (let i = 0; i < fills.length; i++) {
                const a = fills[i];
                if (gone.has(a)) continue;
                for (let j = i + 1; j < fills.length; j++) {
                    const b = fills[j];
                    if (gone.has(b) || b.color !== a.color || Math.abs(b.y0 - a.y0) > 0.6 || Math.abs(b.y1 - a.y1) > 0.6) continue;
                    if (b.x0 >= a.x1 - 0.6 && b.x0 <= a.x1 + 1) { a.x1 = Math.max(a.x1, b.x1); a.cells = (a.cells || 1) + (b.cells || 1); gone.add(b); j = i; }
                    else if (b.x1 <= a.x0 + 0.6 && b.x1 >= a.x0 - 1) { a.x0 = Math.min(a.x0, b.x0); a.cells = (a.cells || 1) + (b.cells || 1); gone.add(b); j = i; }
                }
            }
            if (gone.size) p.rects = p.rects.filter(function (r) { return !gone.has(r); });
        },

        // _pageBlocks step: line-by-line shading merged into boxes
        _pbLineShading(p) {
            // shading drawn line by line (Word shades each line of a paragraph / table cell on its own): fills of one
            // colour and width that touch top to bottom are one box
            const fills = p.rects.filter(function (r) { return r.color && !r.stroked && r.y1 - r.y0 >= 2 && r.x1 - r.x0 > 40; })
                .sort(function (a, b) { return a.x0 - b.x0 || b.y1 - a.y1; });
            const gone = new Set();
            for (let i = 0; i < fills.length; i++) {
                const a = fills[i];
                if (gone.has(a)) continue;
                for (let j = i + 1; j < fills.length; j++) {
                    const b = fills[j];
                    if (gone.has(b) || b.color !== a.color || Math.abs(b.x0 - a.x0) > 0.6 || Math.abs(b.x1 - a.x1) > 0.6) continue;
                    if (b.y1 <= a.y0 + 0.6 && b.y1 >= a.y0 - 1.2) { a.y0 = Math.min(a.y0, b.y0); gone.add(b); j = i; }      // b just below a
                    else if (b.y0 >= a.y1 - 0.6 && b.y0 <= a.y1 + 1.2) { a.y1 = Math.max(a.y1, b.y1); gone.add(b); j = i; } // b just above a
                }
            }
            if (gone.size) p.rects = p.rects.filter(function (r) { return !gone.has(r); });
        },

        // _pageBlocks step: footnotes / endnotes under a separator, their picture marks
        _pbNotes(p, lines, body) {
            const self = this, M = this._metrics;
            // footnotes and endnotes under Word's separator: a short rule (under 45 % of the measure, three ems at least) with
            // only lines set 1.5 pt or more under the body's size below it on the page — the notes (`L.note`). A note's mark
            // drawn as a small picture just before its first line (Word: a note «¹ …» with its «¹» a picture, no
            // text) becomes that mark again: the page's raised marks in the text, in reading order, give the digits
            const view = p.view || [0, 0, 595, 842], meas = (M.right - M.left) || (view[2] - view[0]);
            const small = function (L) { return L.size <= body - 1.5 && L.size >= 0.5 * body; };
            // (footnotes at the page's foot, or endnotes after the text's end, anywhere down the page: under the rule
            // only notes, the first of them within three ems of it, and text at the body's size above it)
            const sep = (p.hsegs || []).filter(function (s) {
                if (!(s.x1 - s.x0 < 0.45 * meas && s.x1 - s.x0 > 3 * body)) return false;
                const below = lines.filter(function (L) { return L.y + L.size < s.y + 1; });
                if (!below.length || !below.every(small)) return false;
                if (!below.some(function (L) { return s.y - (L.y + L.size) < 3 * body; })) return false;
                return lines.some(function (L) { return L.y > s.y && !small(L); });
            }).sort(function (a, b) { return b.y - a.y; })[0];
            if (!sep) return;
            const notes = lines.filter(function (L) { return L.y + L.size < sep.y + 1; }).sort(function (a, b) { return b.y - a.y; });
            if (!notes.length) return;
            notes.forEach(function (L) { L.note = true; });
            const SUP = /^[\u00B9\u00B2\u00B3\u2070-\u2079\u2071\u1D5B\u02E3]+$/;
            const rtlP = lines.reduce(function (a, L) { return a + L.strong.R - L.strong.L; }, 0) > 0;
            const marks = [];
            lines.filter(function (L) { return !L.note; }).sort(function (a, b) { return b.y - a.y; }).forEach(function (L) {
                // (a mark of several glyphs side by side — «ⁱⁱ», «¹²» — is one mark)
                const ms = L.glyphs.filter(function (g) { return g.ch && SUP.test(g.ch); }).sort(function (a, b) { return a.x - b.x; });
                const runs = [];
                ms.forEach(function (g) { const r = runs[runs.length - 1]; if (r && g.x - (r.x1) < 0.3 * g.size) { r.gs.push(g); r.x1 = g.x + g.w; } else runs.push({ gs: [g], x1: g.x + g.w }); });
                if (rtlP) runs.reverse();
                runs.forEach(function (r) { marks.push(r.gs.map(function (g) { return g.ch; }).join('')); });
            });
            let k = 0;
            notes.forEach(function (L) {
                const rtlL = L.strong.R > L.strong.L;
                const im = (p.images || []).filter(function (m) {
                    const w = m.x1 - m.x0, h = m.y1 - m.y0;
                    if (w > 1.6 * L.size || h > 1.8 * L.size || Math.min(m.y1, L.y + L.size) - Math.max(m.y0, L.y - 0.3 * L.size) <= 0) return false;
                    return rtlL ? m.x0 >= L.x1 - 1 && m.x0 - L.x1 < 1.5 * L.size : m.x1 <= L.x0 + 1 && L.x0 - m.x1 < 1.5 * L.size;
                })[0];
                // (a note whose mark is text uses up its digit all the same)
                const lead = self._logical(L, rtlL).map(function (g) { return g.ch || ''; }).join('').trim().split(/\s/)[0];
                if (!im) { if (SUP.test(lead)) k++; return; }
                p.images = p.images.filter(function (m) { return m !== im; });
                const g0 = L.glyphs.filter(function (g) { return !g.space; })[0] || {};
                const mk = Object.assign({}, g0, { ch: marks[k++] || '*', x: im.x0, w: im.x1 - im.x0, space: false, atom: false, bold: false, italic: false });
                const sp = Object.assign({}, g0, { ch: ' ', space: true, x: rtlL ? L.x1 : im.x1, w: Math.max(0.1, rtlL ? im.x0 - L.x1 : L.x0 - im.x1) });
                L.glyphs = rtlL ? L.glyphs.concat([sp, mk]) : [mk, sp].concat(L.glyphs);
                finishLine(L, L.page);
            });
        },

        // _pageBlocks step: strikethrough rules
        _pbStrike(p, lines) {
            // strikethrough: a rule across letters at half their x-height (not an underline, not a table rule)
            const struck = [];
            p.hsegs.forEach(function (sg) {
                let hit = false;
                lines.forEach(function (L) {
                    if (sg.x1 < L.x0 || sg.x0 > L.x1) return;
                    // through the letters' own middle (a fraction bar runs between two baselines)
                    const crossed = L.glyphs.filter(function (g) {
                        if (g.atom || g.space) return false;
                        const cx = g.x + g.w / 2, h = sg.y - g.y;
                        return cx > sg.x0 && cx < sg.x1 && h > 0.15 * g.size && h < 0.45 * g.size;
                    });
                    const under = L.glyphs.filter(function (g) { const cx = g.x + g.w / 2; return !g.space && !g.atom && cx > sg.x0 && cx < sg.x1; });
                    if (!crossed.length || crossed.length < 0.8 * under.length) return;
                    crossed.forEach(function (g) { g.strike = true; hit = true; });
                    // spaces between struck letters belong to the struck run
                    L.glyphs.forEach(function (g, i) { if (g.space && L.glyphs[i - 1] && L.glyphs[i - 1].strike && L.glyphs[i + 1] && L.glyphs[i + 1].strike) g.strike = true; });
                });
                if (hit) struck.push(sg);
            });
            if (struck.length) p.hsegs = p.hsegs.filter(function (sg) { return struck.indexOf(sg) < 0; });
        },

        // _pageBlocks step: box pictures on lines with box characters, as text
        _pbBoxPictures(pl, p, lines) {
            // a box drawn as a little picture on a line that has box characters (a Word form's unticked «☐», its ticked
            // ones «☑» in the font): that character, as text, in the segment it stands nearest on its baseline — cropped,
            // it held a box and its neighbour's letters. Before the forms, which read their lines' text
            const BOXCH = /^[\u2610-\u2612\u25A1\u25A0\u2713\u2714\u2717\u2718]$/;
            p.images = p.images.filter(function (c) {
                const cw = c.x1 - c.x0, chh = c.y1 - c.y0, cy = (c.y0 + c.y1) / 2;
                const row = lines.filter(function (L) { return cy > L.bottom && cy < L.top && cw <= 1.6 * L.size && chh <= 1.6 * L.size && cw >= 0.5 * chh && cw <= 2 * chh; });
                if (!row.some(function (L) { return L.glyphs.some(function (g) { return BOXCH.test(g.ch || ''); }); })) return true;
                const d = function (L) { return Math.max(0, L.x0 - c.x1, c.x0 - L.x1); };
                const L = row.slice().sort(function (a, b) { return d(a) - d(b); })[0];
                if (d(L) > 2 * L.size) return true;
                L.glyphs = L.glyphs.filter(function (g) { return !(g.space && g.x > c.x0 && g.x < c.x1); });
                const box = { ch: '\u2610', x: c.x0, w: cw, y: L.y, size: L.size, font: (L.glyphs[0] || {}).font, page: p.num };
                L.glyphs.push(box);
                L.glyphs.sort(function (a, b) { return a.x - b.x; });
                // (a word gap beside it, as the page shows one: «services ☐ both», not «services ☐both»)
                const k = L.glyphs.indexOf(box), a = L.glyphs[k - 1], b = L.glyphs[k + 1];
                // (or the picture runs over the word beside it — a Word form's box picture is wider than its box, its
                // clear part over the label's letters: «تألیف☐» — a box is never part of a word: a space against a letter)
                const over = function (g) { return g && !g.space && /\p{L}/u.test(g.ch || '') && g.x < c.x1 && g.x + g.w > c.x0; };
                if (b && !b.space && (b.x - c.x1 > 0.15 * L.size || over(b))) L.glyphs.splice(k + 1, 0, { ch: ' ', space: true, x: Math.min(c.x1, b.x), w: Math.max(0, b.x - c.x1), y: L.y, size: L.size, font: box.font, page: p.num });
                if (a && !a.space && (c.x0 - (a.x + a.w) > 0.15 * L.size || over(a))) L.glyphs.splice(k, 0, { ch: ' ', space: true, x: Math.min(a.x + a.w, c.x0), w: Math.max(0, c.x0 - a.x - a.w), y: L.y, size: L.size, font: box.font, page: p.num });
                finishLine(L, p.num);
                // (the segment the box ended, cut from it at the box's room — a gap the picture filled: one line again,
                // «تألیف ☐ ترجمه ☐» read as two paragraphs)
                for (let again = true; again;) {
                    again = false;
                    const M = lines.filter(function (X) {
                        if (X === L || X.rot || Math.abs(X.y - L.y) > 0.3 * L.size || Math.abs(X.size - L.size) > 0.6) return false;
                        const gap = Math.max(X.x0 - L.x1, L.x0 - X.x1);
                        return gap > -0.5 && gap < 1.2 * L.size && (Math.abs(X.x0 - c.x1) < 1.2 * L.size || Math.abs(c.x0 - X.x1) < 1.2 * L.size);
                    })[0];
                    if (!M) break;
                    const right = M.x0 > L.x1 - 0.5, gap = right ? M.x0 - L.x1 : L.x0 - M.x1, edge = right ? L.x1 : M.x1;
                    const sp = gap > 0.15 * L.size ? [{ ch: ' ', space: true, x: edge, w: gap, y: L.y, size: L.size, font: box.font, page: p.num }] : [];
                    L.glyphs = (right ? L.glyphs.concat(sp, M.glyphs) : M.glyphs.concat(sp, L.glyphs));
                    finishLine(L, p.num);
                    lines.splice(lines.indexOf(M), 1);
                    if (pl.lines.indexOf(M) >= 0) pl.lines.splice(pl.lines.indexOf(M), 1);
                    again = true;
                }
                return false;
            });
        },

        // _pageBlocks step: form rows and ruled tables (the flow starts with them)
        _pbRuledTables(p, lines, body) {
            // a form: rows of «label: value» pairs (an invoice's seller and buyer boxes) — each pair an item, row by row.
            // Before the ruled tables: a box with rules between its rows is no table of them
            const form = this._formRows(lines, body, p);
            if (form.used.size) lines = lines.filter(function (L) { return !form.used.has(L); });
            // tables: groups of ruled cells (≥2 columns × ≥2 rows)
            const tables = this._tables(p, this._fonts);
            const flow = form.rows.slice();
            tables.forEach(function (t) {
                const inT = lines.filter(function (L) { return inside(t, (L.x0 + L.x1) / 2, L.y + L.size * 0.3, 1); });
                lines = lines.filter(function (L) { return inT.indexOf(L) < 0; });
                flow.push({ type: 'table', top: t.y1, table: t, lines: inT, bb: { x0: t.x0, x1: t.x1, y0: t.y0, y1: t.y1 } });
            });
            return { lines: lines, form: form, tables: tables, flow: flow };
        },

        // _pageBlocks step: boxes (filled / framed rectangles)
        _pbBoxes(p, tables) {
            // a background drawn line by line (LibreOffice: one rectangle per paragraph, touching): one box
            const fills = p.rects.filter(function (r) { return r.color && !r.stroked && r.x1 - r.x0 > 40; }).sort(function (a, b) { return b.y1 - a.y1; });
            for (let i = 0; i < fills.length; i++) {
                const a = fills[i]; if (a.gone) continue;
                for (let j = i + 1; j < fills.length; j++) {
                    const b = fills[j]; if (b.gone) continue;
                    if (b.color === a.color && Math.abs(b.x0 - a.x0) < 1 && Math.abs(b.x1 - a.x1) < 1 && b.y1 >= a.y0 - 1.2 && b.y1 <= a.y0 + 1.2) { a.y0 = Math.min(a.y0, b.y0); b.gone = true; }
                }
            }
            if (fills.some(function (r) { return r.gone; })) p.rects = p.rects.filter(function (r) { return !r.gone; });
            // boxes: filled / framed rectangles holding text (code, quote, callout)
            const boxes = p.rects.filter(function (r) {
                // (a white fill counts when framed: a stroked rectangle on its edges, or thin rules along both sides — Word)
                const sideRule = function (x) { return p.vsegs.some(function (v) { return Math.abs(v.x - x) < 6 && v.y0 < r.y1 && v.y1 > r.y0 && Math.min(v.y1, r.y1) - Math.max(v.y0, r.y0) > 0.5 * (r.y1 - r.y0); }); };
                const framedWhite = p.rects.some(function (o) { return o !== r && o.stroked && Math.abs(o.x0 - r.x0) < 1 && Math.abs(o.y1 - r.y1) < 1; }) || (sideRule(r.x0) && sideRule(r.x1));
                return r.x1 - r.x0 > 40 && r.y1 - r.y0 > 8 && !(isWhite(r.color) && !r.stroked && !framedWhite) &&
                    !tables.some(function (t) { return inside(t, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2); });
            }).sort(function (a, b) { return (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0); });
            return boxes;
        },

        // _pageBlocks step: row bands, row rules and column rules (the XY-cut's fences); the outermost boxes
        _pbFences(p, lines, boxes, tables) {
            const self = this, M = this._metrics;
            // row shading (zebra stripes): equal-width one-line bands holding cells side by side, stacked at
            // a steady pitch, are table rows, not boxes — their text stays in the flow for the table finder
            // (a row whose cells wrap is a taller band: its lines still stand side by side — two of them on
            // overlapping heights, apart across — where a shaded paragraph's lines stand one above the other)
            const oneRow = function (b) {
                const inB = lines.filter(function (L) { return inside(b, (L.x0 + L.x1) / 2, L.y + L.size * 0.3, 1); });
                if (inB.length < 2) return false;
                if (b.y1 - b.y0 < 2.6 * inB[0].size && inB.every(function (L) { return Math.abs(L.y - inB[0].y) < 0.3 * L.size; })) return true;
                if (b.y1 - b.y0 > 8 * inB[0].size) return false;
                return inB.some(function (A) { return inB.some(function (B) { return B !== A && B.x0 > A.x1 + 0.3 * A.size && overlapY(A.bottom, A.top, B.bottom, B.top) > 0; }); });
            };
            const bands = boxes.filter(function (b) {
                // (a band joined from cell backgrounds side by side is a row whatever its neighbours)
                return oneRow(b) && (b.cells >= 2 || boxes.some(function (o) {
                    const h = Math.max(b.y1 - b.y0, o.y1 - o.y0);
                    return o !== b && Math.abs(o.x0 - b.x0) < 1 && Math.abs(o.x1 - b.x1) < 1 && oneRow(o) &&
                           Math.abs((o.y0 + o.y1) / 2 - (b.y0 + b.y1) / 2) < 3.2 * h;
                }));
            });
            bands.forEach(function (b) { boxes.splice(boxes.indexOf(b), 1); });
            // the rows' bands bound their tables: no table crosses the side of a shaded row (XY-cut's fences)
            this._fences = bands.map(function (b) { return { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 }; });
            // and the rules between rows (a web table's thin separators: a row of cells two lines tall between them)
            this._rowRules = (p.hsegs || []).filter(function (h) { return !tables.some(function (t) { return inside(t, (h.x0 + h.x1) / 2, h.y, 1); }); });
            // and so do column rules: a vertical line (a thin rectangle or a stroke) five lines tall at least, outside
            // the ruled tables — a sidebar's border, a newspaper's column rule (a web app's settings page read its
            // sidebar and its main panel line by line, interleaved, without it)
            p.rects.filter(function (r) { return r.x1 - r.x0 <= 2 && r.y1 - r.y0 >= 5 * M.body; })
                .map(function (r) { return { x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1 }; })
                .concat(p.vsegs.filter(function (v) { return v.y1 - v.y0 >= 5 * M.body; }).map(function (v) { return { x0: v.x - 0.5, x1: v.x + 0.5, y0: v.y0, y1: v.y1 }; }))
                .filter(function (r) { return !tables.some(function (t) { return inside(t, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, 1); }); })
                .forEach(function (r) { r.rule = true; self._fences.push(r); });
            const outer = [];
            boxes.forEach(function (b) {
                if (outer.some(function (o) { return o.x0 <= b.x0 + 1 && o.x1 >= b.x1 - 1 && o.y0 <= b.y0 + 1 && o.y1 >= b.y1 - 1; })) return;
                outer.push(b);
            });
            return outer;
        },

        // _pageBlocks step: boxes that are code or quote blocks (their lines leave the flow)
        _pbBoxBlocks(s) {
            const self = this, M = this._metrics, p = s.p, outer = s.outer, boxes = s.boxes, tables = s.tables, form = s.form, flow = s.flow;
            let lines = s.lines;
            const linesOnPage = lines.length;
            outer.forEach(function (b) {
                // the box holds the whole line (an inline-code chip holds the centre of a long line, not the line)
                const inB = lines.filter(function (L) { return inside(b, (L.x0 + L.x1) / 2, L.y + L.size * 0.3, 1) && L.x0 > b.x0 - 2 && L.x1 < b.x1 + 2; });
                if (!inB.length) return;
                // a frame around most of the page's text is the page's own (a card, a dialog of a web app, a bordered
                // page), no quote or code box: its text stays in the flow, columns and all
                if (inB.length >= 10 && inB.length >= 0.7 * linesOnPage) return;
                // a band past the text column on both sides (a site's header or footer bar, edge to edge) is no quote:
                // a quote sits inside the column
                if (b.x0 < M.left - 2 * M.body && b.x1 > M.right + 2 * M.body) return;
                // a box the paper cuts (it runs past the page's side: a mobile page wider than the paper, its cards cut
                // at the edge) is the page's layout, no quote — what is left of a card
                if (p.view && (b.x0 < p.view[0] - 1 || b.x1 > p.view[2] + 1)) {
                    // (measured by its own text, as a card is)
                    const card = { left: Math.min.apply(null, inB.map(function (L) { return L.x0; })), right: Math.max.apply(null, inB.map(function (L) { return L.x1; })) };
                    inB.forEach(function (L) { L.card = card; });
                    return;
                }
                // a title cell on top of a ruled table, as wide as it (Excel: the merged, shaded first row) is the
                // table's title, no quote: its text stays in the flow, just above the table
                if (inB.length === 1 && tables.some(function (t) { return Math.abs(t.x0 - b.x0) < 2 && Math.abs(t.x1 - b.x1) < 2 && b.y0 - t.y1 > -2 && b.y0 - t.y1 < 0.5 * inB[0].size; })) return;
                // a figure's frame (a picture or a drawing over most of the box, its caption under it: an encyclopedia page's thumbnail)
                // is no quote — the caption's lines stay in the flow, with the figure
                const boxArea = (b.x1 - b.x0) * (b.y1 - b.y0);
                const pictured = (p.images || []).concat(p.vectors || []).reduce(function (a, o) {
                    const w = Math.min(o.x1, b.x1) - Math.max(o.x0, b.x0), hh = Math.min(o.y1, b.y1) - Math.max(o.y0, b.y0);
                    return a + (w > 0 && hh > 0 ? w * hh : 0);
                }, 0);
                if (boxArea > 0 && pictured >= 0.4 * boxArea && inB.length <= 4) { inB.forEach(function (L) { L.caption = true; }); return; }
                // a card (a web page's framed section: a heading of its own on top, or a picture inside, and text under
                // it — a horoscope site's sign by sign) is the page's layout, no quote: its text stays in the flow
                const topL = inB.slice().sort(function (a, c) { return c.y - a.y; })[0];
                const topText = topL.glyphs.map(function (g) { return g.ch || ''; }).join('').trim();
                const headed = inB.length >= 3 && topL.boldShare > 0.85 && topText.length <= 60 && !/[.!?؟]$/.test(topText);
                // (one column of text: an infobox's rows, label and value side by side, are a table's)
                const sideBySide = inB.some(function (A) { return inB.some(function (B) { return B !== A && Math.abs(B.y - A.y) < 0.3 * A.size; }); });
                if (inB.length >= 3 && !sideBySide && (pictured >= 0.1 * boxArea || headed)) {
                    const card = { left: Math.min.apply(null, inB.map(function (L) { return L.x0; })), right: Math.max.apply(null, inB.map(function (L) { return L.x1; })) };
                    inB.forEach(function (L) { L.card = card; });
                    return;
                }
                // a section's title band (an invoice's shaded «مشخصات فروشنده» across its box, the box's rows under it): one
                // short line, no sentence, in a fill or frame as wide as most of the column, on top of another box, a
                // table or a form — the section's heading, no quote
                // (or a frame round the whole section, the band's line at its top and the section's form rows in it)
                const atTop = inB.length === 1 && b.y1 - inB[0].top < 2 * inB[0].size && form.rows.some(function (r) { return inside(b, (r.bb.x0 + r.bb.x1) / 2, (r.bb.y0 + r.bb.y1) / 2, 1); });
                if (inB.length === 1 && inB[0].monoShare < 0.5 && b.x1 - b.x0 >= 0.6 * (M.right - M.left) && (b.y1 - b.y0 < 2.5 * inB[0].size || atTop)) {
                    const t1 = inB[0].glyphs.map(function (g) { return g.ch || ''; }).join('').trim();
                    const ov = function (o) { return Math.min(o.x1, b.x1) - Math.max(o.x0, b.x0) >= 0.8 * (b.x1 - b.x0); };
                    const under = function (o) { return o !== b && ov(o) && o.y1 <= b.y0 + 2 && o.y1 >= b.y0 - 1.5 * inB[0].size; };
                    const below = p.rects.some(function (o) { return under(o) || o !== b && ov(o) && o.y0 < b.y0 - 2 && o.y1 >= b.y1 - 2 && o.y1 - o.y0 > 2 * (b.y1 - b.y0); }) ||
                        tables.some(under) || form.rows.some(function (r) { return under(r.bb); });
                    // (the line takes its band's width: the section reads as one piece across the page — beside a narrow
                    // header column the XY-cut had read the band before the header)
                    if ((below || atTop) && t1.length <= 60 && !/[.!?؟]$/.test(t1)) { inB[0].band = true; inB[0].x0 = Math.min(inB[0].x0, b.x0 + 1); inB[0].x1 = Math.max(inB[0].x1, b.x1 - 1); return; }
                }
                // a highlight (a fill hugging one line, no frame: Word's text highlight colour, a marker pen) is the text's
                // own background, no box: its text stays in the flow — a list item highlighted became a quote
                if (inB.length === 1 && !b.stroked && b.y1 - b.y0 < 1.5 * inB[0].size && Math.abs(b.x0 - inB[0].x0) < 0.5 * inB[0].size && Math.abs(b.x1 - inB[0].x1) < 0.5 * inB[0].size) return;
                // a frame round form fields (a Word plan's boxes: «تاریخ تنظیم: …», «عنوان طرح: …» over «سفارش‌دهنده: …»):
                // every line a bold label and its value — fields, no quote
                // (a field's value wrapped in the box — a sentence-long «هدف طرح: …» whose second line starts under the label —
                // is that field still: a line under a field's line that filled the box, no label of its own, a line's pitch down)
                const inBy = inB.slice().sort(function (p, q) { return q.y - p.y; });
                const wrapOf = function (k) { const P = inBy[k - 1], L = inBy[k]; return k > 0 && P.x1 - P.x0 > 0.85 * (b.x1 - b.x0) - 2 * L.size && P.y - L.y < 2.2 * L.size && Math.abs(P.size - L.size) < 0.6; };
                if (inB.length <= 6 && inBy[0].strong && self._boldLabel(inBy[0]) && inBy.every(function (L, k) { return (L.strong && self._boldLabel(L)) || wrapOf(k); })) return;
                // a title in a frame of its own (a slide's title box: one short line, larger than the body, centred in the box,
                // no sentence) is a title, no quote — a deck's slide whose only text was its title came back «> …»
                if (inB.length === 1 && inB[0].size > 1.2 * M.body && Math.abs((inB[0].x0 - b.x0) - (b.x1 - inB[0].x1)) < 2 * inB[0].size) {
                    const t1 = inB[0].glyphs.map(function (g) { return g.ch || ''; }).join('').trim();
                    if (t1.length <= 80 && !/[.!?؟:]$/.test(t1)) return;
                }
                // a chip / badge (a small box around a few characters) is decoration: its text stays in the flow
                if (inB.length === 1 && b.y1 - b.y0 < inB[0].size * 3 && inB[0].glyphs.filter(function (g) { return !g.space; }).length <= 6) return;
                // an inline-code chip: one line in a narrow box, other text on its baseline (a table row, a sentence)
                if (inB.length === 1 && b.y1 - b.y0 < inB[0].size * 2.4 && b.x1 - b.x0 < 0.45 * (M.right - M.left) &&
                    lines.some(function (L) { return L !== inB[0] && Math.abs(L.y - inB[0].y) < 0.3 * L.size && (L.x0 > b.x1 - 1 || L.x1 < b.x0 + 1); })) return;
                lines = lines.filter(function (L) { return inB.indexOf(L) < 0; });
                const framed = !!(b.stroked || p.rects.some(function (o) { return o.stroked && Math.abs(o.x0 - b.x0) < 1 && Math.abs(o.y1 - b.y1) < 1 && Math.abs(o.x1 - b.x1) < 1; }));
                const bar = p.rects.some(function (r) { return r.x1 - r.x0 <= 5 && overlapY(r.y0, r.y1, b.y0, b.y1) > (b.y1 - b.y0) * 0.6 && (Math.abs(r.x0 - b.x0) < 6 || Math.abs(r.x1 - b.x1) < 6); })
                    || !framed && p.vsegs.some(function (v) { return overlapY(v.y0, v.y1, b.y0, b.y1) > (b.y1 - b.y0) * 0.6 && (Math.abs(v.x - b.x0) < 6 || Math.abs(v.x - b.x1) < 6); });
                const monoLines = inB.filter(function (L) { return L.monoShare > 0.8; }).length;
                const glyphsIn = inB.reduce(function (a, L) { return a.concat(L.glyphs.filter(function (g) { return !g.space && !g.atom; })); }, []);
                const monoShare = glyphsIn.length ? glyphsIn.filter(function (g) { return g.mono || /[\u2500-\u259F]/.test(g.ch); }).length / glyphsIn.length : 0;
                // a header strip across the top of the box holding one short line (a code block's language label)
                const top = inB.slice().sort(function (a, c) { return c.y - a.y; })[0];
                const strip = p.rects.some(function (r) {
                    return r !== b && r.color && Math.abs(r.x0 - b.x0) < 1.5 && Math.abs(r.x1 - b.x1) < 1.5 && Math.abs(r.y1 - b.y1) < 1.5 &&
                           r.y1 - r.y0 < 2.2 * top.size && top.y > r.y0 && top.y < r.y1 && inB.length > 1;
                });
                // code: (almost) every line monospace, or a framed box without a side bar that is
                // largely monospace (letters a monospace font lacks fall back to another font)
                const code = monoLines >= Math.max(1, inB.length - 1) || (framed && !bar && (monoShare >= 0.4 || strip));
                // boxes inside a quote box: nested quotes (their text was taken with this box)
                // (a part of it: the box's own inset fill is as tall as the box)
                // (set in from the lines' start: from the right in a right-to-left quote — Kelk's Persian nested quote is a
                // box flush with its outer one's left edge, set in at the right: it was no nest, and the nesting was lost)
                const rtlBox = self._quoteRtl(inB);
                const setIn = function (o) { return rtlBox ? o.x1 < b.x1 - 2 && o.x0 >= b.x0 - 1 : o.x0 > b.x0 + 2 && o.x1 <= b.x1 + 1; };
                const ins = code ? [] : boxes.filter(function (o) { return o !== b && setIn(o) && o.y0 >= b.y0 - 1 && o.y1 <= b.y1 + 1 && o.y1 - o.y0 < 0.85 * (b.y1 - b.y0); })
                    .filter(function (o, k, a) { return !a.slice(0, k).some(function (q) { return Math.abs(q.x0 - o.x0) < 0.3 && Math.abs(q.x1 - o.x1) < 0.3 && Math.abs(q.y0 - o.y0) < 0.3 && Math.abs(q.y1 - o.y1) < 0.3; }); });
                // (a quote that shades each of its paragraphs — Kelk's .docx — is no nest of quotes: a box holding
                // another box is a nested quote's frame; a box beside a twin at its x, or inside such a frame, is a
                // paragraph's shading)
                const holds = function (o, q) { return q !== o && q.x0 >= o.x0 - 0.5 && q.x1 <= o.x1 + 0.5 && q.y0 >= o.y0 - 0.5 && q.y1 <= o.y1 + 0.5; };
                const frames = ins.filter(function (o) { return ins.some(function (q) { return holds(o, q); }); });
                const innerBoxes = ins.filter(function (o) {
                    if (frames.indexOf(o) >= 0) return true;
                    if (frames.some(function (f) { return holds(f, o); })) return false;
                    return !ins.some(function (q) { return q !== o && frames.indexOf(q) < 0 && Math.abs(q.x0 - o.x0) < 0.6 && Math.abs(q.x1 - o.x1) < 0.6; });
                }).map(function (o) { const e = rtlBox ? o.x1 : o.x0; return { x0: e, x1: e, y0: o.y0, y1: o.y1 }; });
                flow.push({ type: code ? 'code' : 'quote', top: b.y1, box: b, bar: bar, lines: inB, inner: innerBoxes, rtl: rtlBox, bb: { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 } });
            });
            return lines;
        },

        // _pageBlocks step: quotes drawn as a bare side bar
        _pbQuoteBars(s) {
            const pl = s.pl, p = s.p, body = s.body, tables = s.tables, flow = s.flow, outer = s.outer;
            let lines = s.lines;
            // a quote drawn as a bare side bar (no box: GitHub, most blog themes): a thin vertical bar —
            // filled rectangle or stroked line — with text lines starting just after it, along its height
            const inTable = function (x, y) { return tables.some(function (t) { return inside(t, x, y, 1); }); };
            const barCands = p.rects.filter(function (r) { return r.x1 - r.x0 <= 6 && r.x1 - r.x0 >= 0.4 && r.y1 - r.y0 >= 0.8 * body; })
                .map(function (r) { return { x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1 }; })
                .concat(p.vsegs.filter(function (v) { return !v.filled && v.y1 - v.y0 >= 0.8 * body; }).map(function (v) { return { x0: v.x - 0.5, x1: v.x + 0.5, y0: v.y0, y1: v.y1 }; }))
                .filter(function (b) { return !inTable((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2) && b.y1 < pl.cutTop && b.y0 > pl.cutBottom; })
                .sort(function (a, b) { return a.x0 - b.x0; });
            // a quote's border drawn paragraph by paragraph (LibreOffice): bars at one x, one under the other, a
            // paragraph gap apart — or with a nested quote's bar, further in, bridging the gap — are one bar
            (function () {
                const near = function (a, b) { return Math.abs(a.x0 - b.x0) < 1 && Math.abs(a.x1 - b.x1) < 1; };
                const bridged = function (a, top, bot) {
                    // bars further in, inside the gap, that leave no gap of their own over 3 lines
                    const ins = barCands.filter(function (o) { return o.x0 > a.x1 + 2 && o.x0 < a.x1 + 8 * body && o.y1 <= top + 1 && o.y0 >= bot - 1; })
                        .sort(function (u, v) { return v.y1 - u.y1; });
                    if (!ins.length) return false;
                    let y = top;
                    for (let k = 0; k < ins.length; k++) { if (y - ins[k].y1 > 3 * body) return false; y = Math.min(y, ins[k].y0); }
                    return y - bot <= 3 * body;
                };
                let changed = true;
                while (changed) {
                    changed = false;
                    for (let i = 0; i < barCands.length && !changed; i++) for (let j = 0; j < barCands.length && !changed; j++) {
                        const a = barCands[i], b = barCands[j];
                        if (i === j || !near(a, b) || b.y1 > a.y0 + 0.5) continue;           // b below a
                        const gap = a.y0 - b.y1;
                        if (gap > 3 * body && !bridged(a, a.y0, b.y1)) continue;
                        a.y0 = b.y0; barCands.splice(j, 1); changed = true;
                    }
                }
            })();
            // an edge of a frame or a cell is no quote bar: a rule meets its end, or a matching edge stands
            // on the other side of the text
            const corner = function (b) {
                const cx = (b.x0 + b.x1) / 2;
                return p.hsegs.some(function (s) { return (Math.abs(s.y - b.y0) < 1.6 || Math.abs(s.y - b.y1) < 1.6) && s.x0 < cx + 1.6 && s.x1 > cx - 1.6; }) ||
                    p.rects.some(function (r) { return r.y1 - r.y0 < 2 && r.x1 - r.x0 > 6 && (Math.abs(r.y0 - b.y0) < 1.6 || Math.abs(r.y1 - b.y1) < 1.6 || Math.abs(r.y1 - b.y0) < 1.6 || Math.abs(r.y0 - b.y1) < 1.6) && r.x0 < cx + 1.6 && r.x1 > cx - 1.6; });
            };
            const twin = function (b) {
                return barCands.concat(p.vsegs.map(function (v) { return { x0: v.x - 0.5, x1: v.x + 0.5, y0: v.y0, y1: v.y1 }; })).some(function (o) {
                    return o !== b && Math.abs(o.x0 - b.x0) > 20 && Math.abs(o.y0 - b.y0) < 2 && Math.abs(o.y1 - b.y1) < 2;
                });
            };
            // (the bars are taken outermost first: left to right for text right of its bar; a bar with its text on its left
            // — a right-to-left quote's — waits while a bar further right, as tall or taller, may hold it as a nested one:
            // a Persian nested quote's inner bar, taken first, had made a quote of its own and left the outer one too few
            // lines to be a quote)
            const deferred = [];
            const takeBar = function (b, wait) {
                if (b.done || corner(b) || twin(b)) return;
                const along = function (L) { const cy = (L.top + L.bottom) / 2; return cy >= b.y0 - 2 && cy <= b.y1 + 2; };
                const right = lines.filter(function (L) { return along(L) && L.x0 > b.x1 && L.x0 - b.x1 < 3 * body; });
                const left = lines.filter(function (L) { return along(L) && L.x1 < b.x0 && b.x0 - L.x1 < 3 * body; });
                // text on both sides: a column rule, not a quote
                if (right.length && left.length) return;
                const inB = right.length ? right : left;
                if (!inB.length) return;
                if (wait && !right.length && barCands.some(function (o) { return o !== b && !o.done && o.x0 > b.x1 + 2 && o.x0 - b.x1 < 8 * body && o.y0 <= b.y0 + 2 && o.y1 >= b.y1 - 2; })) { deferred.push(b); return; }
                // a quote's bar stands at its lines' start: on the right of right-to-left lines — one at their ragged
                // end is a decoration of the page (a Word template's rule down the margin, beside the page number:
                // a Persian report's every page began with a quote)
                const rtlLines = inB.reduce(function (n, L) { return n + L.strong.R - L.strong.L; }, 0) > 0;
                if (rtlLines === !!right.length && inB.some(function (L) { return L.strong.R + L.strong.L > 0; })) return;
                const span = Math.max.apply(null, inB.map(function (L) { return L.top; })) - Math.min.apply(null, inB.map(function (L) { return L.bottom; }));
                if (span < 0.5 * (b.y1 - b.y0)) return;
                // the rest of the quote: lines further in, inside the bar's height (nested text, list items)
                const more = lines.filter(function (L) { return inB.indexOf(L) < 0 && along(L) && (right.length ? L.x0 > b.x1 : L.x1 < b.x0) && Math.abs(L.y - inB[0].y) < (b.y1 - b.y0) + body; })
                    .filter(function (L) { return right.length ? L.x0 - b.x1 < 8 * body : b.x0 - L.x1 < 8 * body; });
                const all = inB.concat(more);
                lines = lines.filter(function (L) { return all.indexOf(L) < 0; });
                const x0 = right.length ? b.x0 : Math.min.apply(null, all.map(function (L) { return L.x0; }));
                const x1 = right.length ? Math.max.apply(null, all.map(function (L) { return L.x1; })) : b.x1;
                const box = { x0: x0, x1: x1, y0: b.y0, y1: b.y1 };
                // bars further in, within this one's height: nested quotes (their lines are taken here already)
                // (further left, right to left)
                const inner = barCands.filter(function (o) { return o !== b && (right.length ? o.x0 > b.x1 + 2 && o.x0 < x1 : o.x1 < b.x0 - 2 && o.x1 > x0) && o.y0 >= b.y0 - 2 && o.y1 <= b.y1 + 2; });
                inner.forEach(function (o) { o.done = true; });
                // (almost) every line monospace, no nested bar: a code block drawn with a side bar (a common blog and
                // docs style), not a quote — the boxes' own test (above), which the bars had skipped
                const monoN = all.filter(function (L) { return L.monoShare > 0.8; }).length;
                const code = !inner.length && monoN >= Math.max(1, all.length - 1);
                flow.push({ type: code ? 'code' : 'quote', top: b.y1, box: box, bar: true, lines: all, inner: inner, rtl: !right.length, bb: box });
                outer.push(box);
            };
            barCands.forEach(function (b) { takeBar(b, true); });
            deferred.forEach(function (b) { takeBar(b, false); });
            return lines;
        },

        // _pageBlocks step: list markers (dots, task boxes, picture bullets); the vector parts left
        _pbMarkers(pl, p, body) {
            const self = this;
            // figures: vector clusters (formulas, drawings) and images
            // list markers: small round / square shapes (bullets), framed squares (task boxes);
            // a shape inside a task box is its check mark. Shapes inside text lines are glyph parts.
            // a dot grid (decoration on slides and brochures: three rows and three columns or more of one small shape at a
            // regular pitch, no text among them) is neither a list's bullets nor a figure — PowerPoint's grid beside a
            // paragraph read as bullets, and a slide's grid came out as eight one-row pictures under its paragraph
            const lattice = this._dotLattice((p.small || []).concat(p.vectors || []), pl.lines);
            if (lattice.size) {
                const inGrid = function (v) { return lattice.has(Math.round(v.x0 * 2) + ',' + Math.round(v.y0 * 2)); };
                p.small = (p.small || []).filter(function (m) { return !inGrid(m); });
                p.vectors = p.vectors.filter(function (v) { return !inGrid(v); });
            }
            const dots = [];
            (p.small || []).forEach(function (m) {
                const w = m.x1 - m.x0, h = m.y1 - m.y0;
                if (Math.abs(w - h) > 2.5) return;
                if (dots.some(function (d) { return d.task && inside(d, (m.x0 + m.x1) / 2, (m.y0 + m.y1) / 2, 1); })) return;
                // (a framed square filled white — wkhtmltopdf's checkbox — too: a filled square bullet is smaller)
                if ((m.box && m.stroke && (!m.fill ? w >= 5 : w >= 6.5)) || m.rbox) { dots.push(Object.assign({ task: true }, m)); return; }
                if (w > 10) return;
                dots.push(m);
            });
            // a check mark: a smaller shape inside the box (its own fill and border layers are as large as the box)
            (p.small || []).forEach(function (m) {
                const cx = (m.x0 + m.x1) / 2, cy = (m.y0 + m.y1) / 2;
                dots.forEach(function (d) {
                    // (a tick drawn as strokes — no rectangle — may span the box: wkhtmltopdf's)
                    if (d.task && d !== m && inside(d, cx, cy, 1) && !(m.box && m.stroke && !m.fill) && !m.rbox &&
                        ((m.x1 - m.x0) < 0.85 * (d.x1 - d.x0) || (!m.box && !m.round && m.stroke && !m.fill))) d.checked = true;
                });
            });
            // pictures as bullets (list-style-image, an icon before each item): small square pictures, two or more at one
            // x, each just before a line's start — a web page's ticked list came out as its items between pictures
            const lineStart = function (m) {
                return pl.lines.filter(function (L) {
                    const cy = (m.y0 + m.y1) / 2, gap = L.strong.R > L.strong.L ? m.x0 - L.x1 : L.x0 - m.x1;
                    return cy > L.bottom && cy < L.top && gap > -0.5 && gap < 1.5 * L.size && m.y1 - m.y0 <= 1.3 * L.size;
                })[0];
            };
            const smallPics = p.images.filter(function (m) { const w = m.x1 - m.x0, h = m.y1 - m.y0; return w <= 16 && h <= 16 && Math.abs(w - h) <= 2 && lineStart(m); });
            const picBullets = smallPics.filter(function (m) { return smallPics.some(function (o) { return o !== m && Math.abs(o.x0 - m.x0) < 1 && Math.abs((o.x1 - o.x0) - (m.x1 - m.x0)) < 1; }); });
            if (picBullets.length) {
                picBullets.forEach(function (m) { dots.push({ x0: m.x0, x1: m.x1, y0: m.y0, y1: m.y1, round: true, fill: true, picture: true }); });
                p.images = p.images.filter(function (m) { return picBullets.indexOf(m) < 0; });
            }
            pl.lines.forEach(function (L) { L.marker = self._dotMarker(L, dots); });
            if (this._ocr) this._ocrMarkers(pl.lines, body, p);
            const same = function (a, b) { return Math.abs(a.x0 - b.x0) < 0.5 && Math.abs(a.y0 - b.y0) < 0.5 && Math.abs(a.x1 - b.x1) < 0.5; };
            const used = dots.filter(function (d) { return d.used; });
            const vec = p.vectors.filter(function (v) {
                if (used.some(function (d) { return same(d, v) || (d.task && inside(d, (v.x0 + v.x1) / 2, (v.y0 + v.y1) / 2, 1)); })) return false;
                return v.y1 < (pl.cutTop || Infinity) && v.y0 > (pl.cutBottom || -Infinity);
            });
            return vec;
        },

        // _pageBlocks step: figure clusters, less backdrops and decoration
        _pbClusters(pl, p, vec, body) {
            // thin filled rules lying among vector glyphs are fraction bars / radicals
            const bars = p.rects.filter(function (r) {
                return r.y1 - r.y0 < 1.6 && r.x1 - r.x0 < 300 && vec.some(function (v) { return Math.abs(v.y0 - r.y1) < 8 || Math.abs(r.y0 - v.y1) < 8; }) &&
                       vec.some(function (v) { return v.x1 > r.x0 - 4 && v.x0 < r.x1 + 4; });
            });
            // a picture behind the text — a third of the page or more, with lines of text inside it — is the page's
            // background (a web app's layers, a decorated page), no figure: as an item it would bridge every gutter
            const pageArea = (p.view[2] - p.view[0]) * (p.view[3] - p.view[1]);
            const behind = function (b) {
                if ((b.x1 - b.x0) * (b.y1 - b.y0) < 0.33 * pageArea) return false;
                let n = 0; pl.lines.forEach(function (L) { if (inside(b, (L.x0 + L.x1) / 2, L.y + 0.3 * L.size, 1)) n++; });
                return n >= 3;
            };
            // text stays text (PDFIMPORT.md §7, "Pictures and text"): the text lines a box holds — its visible lines whose
            // middle lies in it — and whether they are the page's words or a drawing's labels
            const textIn = function (b) {
                const ls = pl.lines.filter(function (L) {
                    if (!inside(b, (L.x0 + L.x1) / 2, L.y + 0.3 * L.size, 1)) return false;
                    return L.glyphs.filter(function (g) { return !g.space && !g.atom && !g.invisible; }).length >= 3;
                });
                const ink = ls.reduce(function (n, L) { return n + L.glyphs.filter(function (g) { return !g.space && !g.atom; }).length; }, 0);
                const widest = ls.reduce(function (w, L) { return Math.max(w, L.x1 - L.x0); }, 0);
                return { lines: ls, ink: ink, widest: widest };
            };
            // a backdrop: a picture with text drawn over it (a slide's title box, a cover's coloured band — a picture
            // made in the producer, the words laid on it), or drawn parts holding running text (a panel, a callout) —
            // the text's ground, no figure: cropped, it gave the reader the words a second time, as a picture, and
            // as one piece with its neighbours it covered whole slides. A drawing's labels are short: it stays a figure.
            const backdrop = function (b, image) {
                const t = textIn(b), w = b.x1 - b.x0;
                if (!t.lines.length) return false;
                if (image) return t.ink >= 4;
                return t.ink >= 12 && t.widest >= 0.4 * w || t.ink >= 60 && t.lines.length >= 3;
            };
            const clusters = this._clusterFigures(vec.filter(function (v) { return !behind(v); }).concat(bars, p.images.filter(function (b) { return !behind(b) && !backdrop(b, true); }).map(function (b) { return Object.assign({ image: true }, b); })), body, textIn)
                .filter(function (c) { return !backdrop(c, c.image && !vec.some(function (v) { return inside(c, (v.x0 + v.x1) / 2, (v.y0 + v.y1) / 2, 0); })); });
            // decoration is no figure (PDFIMPORT.md §7, "Pictures and text"): a drawing of one colour holding no text
            // that is a panel — one shape filling most of its box (a card's rounded background left alone on the next
            // page: a 470 × 430 pt "picture" of nothing), or a shape in a colour close to white (a light pill on a
            // light page) — or a small icon of a few shapes standing alone (a site's logo mark, a menu's three bars:
            // two and a half em or less each way, four shapes or fewer — a formula's glyphs are more)
            const light = function (c) { const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c || ''); return !!m && [m[1], m[2], m[3]].every(function (h) { return parseInt(h, 16) >= 0xE6; }); };
            for (let k = clusters.length - 1; k >= 0; k--) {
                const c = clusters[k];
                if (c.image) continue;
                const parts = vec.filter(function (v) { return v.x0 >= c.x0 - 1 && v.x1 <= c.x1 + 1 && v.y0 >= c.y0 - 1 && v.y1 <= c.y1 + 1; });
                if (!parts.length || bars.some(function (r) { return r.x0 >= c.x0 - 1 && r.x1 <= c.x1 + 1 && r.y0 >= c.y0 - 1 && r.y1 <= c.y1 + 1; })) continue;
                if (new Set(parts.map(function (v) { return v.color; })).size !== 1 || textIn(c).lines.length) continue;
                const area = (c.x1 - c.x0) * (c.y1 - c.y0), big = Math.max.apply(null, parts.map(function (v) { return (v.x1 - v.x0) * (v.y1 - v.y0); }));
                const panel = big >= 0.6 * area && (c.x1 - c.x0 > 3 * body || c.y1 - c.y0 > 3 * body);
                const icon = parts.length <= 4 && c.x1 - c.x0 <= 2.5 * body && c.y1 - c.y0 <= 2.5 * body;
                if (panel || light(parts[0].color) || icon) clusters.splice(k, 1);
            }
            return { clusters: clusters, textIn: textIn };
        },

        // _pageBlocks step: pictures hosted inline by a line, glyphs kept as pictures
        async _pbInline(s) {
            const p = s.p, body = s.body, lines = s.lines, flow = s.flow, clusters = s.clusters;
            const allLines = lines.concat(flow.reduce(function (a, f) { return a.concat(f.lines || []); }, []));
            const hosted = new Map(), free = [];
            // text wins over pictures (PDFIMPORT.md §7, "Pictures and text"): a picture and words never share a Markdown
            // line. A picture is hosted by a line only when it stands in the line's run of text — between its letters,
            // or within an em and a half of its ends: the icon at the side of a slide's paragraph and the rows of its dot
            // grid, each lying in one line's band, were cropped into that line and broke the paragraph three times.
            // A drawing so hosted stays inline (a formula, a drawn sign); a raster one only holds its place, so the line
            // is not cut where it stood — _picturesOut moves it after its block.
            const inRun = function (L, c) {
                const ink = L.glyphs.filter(function (g) { return !g.space && !g.atom && !g.invisible; });
                if (!ink.length) return false;
                const x0 = Math.min.apply(null, ink.map(function (g) { return g.x; })), x1 = Math.max.apply(null, ink.map(function (g) { return g.x + g.w; }));
                return c.x1 > x0 - 1.5 * L.size && c.x0 < x1 + 1.5 * L.size;
            };
            clusters.forEach(function (c) {
                // inside a line band and in its run → inline atom of that line; else a block figure
                const host = allLines.filter(function (L) { return overlapY(c.y0, c.y1, L.bottom, L.top) > Math.min(c.y1 - c.y0, L.top - L.bottom) * 0.5 && c.y1 - c.y0 < L.size * 2.6 && inRun(L, c); })[0];
                if (host) { if (!hosted.has(host)) hosted.set(host, []); hosted.get(host).push(c); } else free.push(c);
            });
            // inline: neighbours with nothing but spaces between them are one formula
            for (const [host, cs] of hosted) {
                cs.sort(function (a, b) { return a.x0 - b.x0; });
                const runs = [];
                cs.forEach(function (c) {
                    const last = runs[runs.length - 1];
                    const between = last && host.glyphs.some(function (g) { return !g.space && !g.atom && g.x + g.w / 2 > last.x1 && g.x + g.w / 2 < c.x0; });
                    if (last && !between && c.x0 - last.x1 < body * 1.5) {
                        last.x0 = Math.min(last.x0, c.x0); last.x1 = Math.max(last.x1, c.x1); last.y0 = Math.min(last.y0, c.y0); last.y1 = Math.max(last.y1, c.y1);
                    } else runs.push(Object.assign({}, c));
                });
                for (const c of runs) {
                    // a box drawn as a little picture among box characters on its line (a Word form's unticked «☐», its
                    // ticked ones «☑» in the font): that character, as text — the crop held a box and its neighbour's letters
                    const img = await this._crop(p, c);
                    host.glyphs = host.glyphs.filter(function (g) { return !(g.space && g.x > c.x0 && g.x < c.x1); });
                    host.glyphs.push({ atom: true, img: img, raster: !!c.image, bb: { x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1 }, x: c.x0, w: c.x1 - c.x0, y: host.y, size: host.size, ch: '\uFFFC', page: p.num });
                    host.glyphs.sort(function (a, b) { return a.x - b.x; });
                    host.x0 = Math.min(host.x0, c.x0); host.x1 = Math.max(host.x1, c.x1);
                    // the line's other part, cut off at the picture's gap when the line was found (a badge in a sentence:
                    // «… now reports [badge] its daily use …» came out as two paragraphs) — one line again
                    const H = host, sz = host.size;
                    const twin = lines.filter(function (S) {
                        return S !== H && Math.abs(S.y - H.y) < 0.2 * sz && Math.abs(S.size - sz) < 0.15 * sz &&
                            (S.x0 >= c.x1 - 1 && S.x0 - c.x1 < 1.5 * sz || S.x1 <= c.x0 + 1 && c.x0 - S.x1 < 1.5 * sz);
                    })[0];
                    if (twin && lines.indexOf(host) >= 0) {
                        host.glyphs = host.glyphs.concat(twin.glyphs).sort(function (a, b) { return a.x - b.x; });
                        lines.splice(lines.indexOf(twin), 1);
                        if (allLines.indexOf(twin) >= 0) allLines.splice(allLines.indexOf(twin), 1);
                        finishLine(host, p.num);
                    }
                }
            }
            // a glyph kept only as a picture (a colour emoji whose character is lost): cropped, inline
            for (const L of allLines) {
                for (let k = 0; k < L.glyphs.length; k++) {
                    const g = L.glyphs[k];
                    if (!g.pic || g.atom) continue;
                    const img = await this._crop(p, { x0: g.x, x1: g.x + g.w, y0: g.y - 0.22 * g.size, y1: g.y + 0.88 * g.size });
                    L.glyphs[k] = { atom: true, img: img, x: g.x, w: g.w, y: g.y, size: g.size, ch: '\uFFFC', page: p.num };
                }
            }
            return { allLines: allLines, free: free };
        },

        // _pageBlocks step: block figures (rows, stacks, trimmed, cropped) into the flow
        async _pbFigures(s) {
            const pl = s.pl, p = s.p, body = s.body, allLines = s.allLines, free = s.free, textIn = s.textIn, flow = s.flow;
            const atoms = [];
            // display: parts on one row, then rows stacked closely, are one figure
            const rows = [];
            // (side by side means close: a gap under three em with no text in it — an article's picture and a
            // sidebar's thumbnails at one height are two figures, and as one they bridged the page's gutter)
            const nearAcross = function (x, c) {
                const g0 = Math.min(x.x1, c.x1), g1 = Math.max(x.x0, c.x0);
                if (g1 - g0 <= 0) return true;
                if (g1 - g0 > 3 * body) return false;
                return !allLines.some(function (L) { return L.x0 < g1 && L.x1 > g0 && L.top > Math.max(x.y0, c.y0) && L.bottom < Math.min(x.y1, c.y1); });
            };
            // (nor parts whose joined box would hold text that neither held: an icon, a dot grid and a title box
            // around a paragraph are three pictures, not one over the paragraph)
            const swallows = function (x, c) {
                const u = { x0: Math.min(x.x0, c.x0), y0: Math.min(x.y0, c.y0), x1: Math.max(x.x1, c.x1), y1: Math.max(x.y1, c.y1) };
                return textIn(u).lines.length > textIn(x).lines.length + textIn(c).lines.length;
            };
            free.sort(function (a, b) { return b.y1 - a.y1; }).forEach(function (c) {
                const r = rows.filter(function (x) { return Math.min(x.y1, c.y1) - Math.max(x.y0, c.y0) > 0 && nearAcross(x, c) && !swallows(x, c); })[0];
                if (r) { r.x0 = Math.min(r.x0, c.x0); r.x1 = Math.max(r.x1, c.x1); r.y0 = Math.min(r.y0, c.y0); r.y1 = Math.max(r.y1, c.y1); }
                else rows.push(Object.assign({}, c));
            });
            const figs = [];
            rows.sort(function (a, b) { return b.y1 - a.y1; }).forEach(function (r) {
                const last = figs[figs.length - 1];
                const textBetween = last && allLines.some(function (L) { return L.y < last.y0 && L.y > r.y1; });
                // (stacked means one above the other: across the same x — a picture in the article and a widget in the
                // sidebar, side by side at one height, are not stacked)
                const over = last && Math.min(last.x1, r.x1) - Math.max(last.x0, r.x0) > 0;
                if (last && over && !textBetween && last.y0 - r.y1 < body * 0.5 && !swallows(last, r)) { last.x0 = Math.min(last.x0, r.x0); last.x1 = Math.max(last.x1, r.x1); last.y0 = Math.min(last.y0, r.y0); }
                else figs.push(r);
            });
            // a figure's box trimmed back from the text that reaches into it from a side (a line whose middle lies outside):
            // the crop shows the picture, not the edge of the paragraph beside it — the side cut that takes the least
            // of the box, line by line; a box the text would cut away entirely is left as it was
            figs.forEach(function (c) {
                const ink = pl.lines.filter(function (L) { return L.glyphs.some(function (g) { return !g.space && !g.atom && !g.invisible; }); });
                const into = function (b) {
                    return ink.filter(function (L) {
                        if (inside(b, (L.x0 + L.x1) / 2, L.y + 0.3 * L.size, 1)) return false;
                        return Math.min(b.x1, L.x1) - Math.max(b.x0, L.x0) > 0.5 && Math.min(b.y1, L.top) - Math.max(b.y0, L.bottom) > 0.5;
                    });
                };
                const orig = { x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 }, area0 = (c.x1 - c.x0) * (c.y1 - c.y0);
                for (let guard = 0; guard < 20; guard++) {
                    const hit = into(c);
                    if (!hit.length) break;
                    // every side cut that clears one of them; the one that leaves the fewest lines reaching in, then the most box
                    const cand = [];
                    hit.forEach(function (L) {
                        [['x0', L.x1 + 0.5], ['x1', L.x0 - 0.5], ['y0', L.top + 0.5], ['y1', L.bottom - 0.5]].forEach(function (kv) {
                            const b = Object.assign({}, c); b[kv[0]] = kv[1];
                            if (b.x1 - b.x0 > 2 && b.y1 - b.y0 > 2) cand.push({ b: b, left: into(b).length, keep: (b.x1 - b.x0) * (b.y1 - b.y0) });
                        });
                    });
                    cand.sort(function (a, b) { return a.left - b.left || b.keep - a.keep; });
                    if (!cand.length || cand[0].keep < 0.25 * area0) { Object.assign(c, orig); break; }
                    Object.assign(c, cand[0].b);
                }
            });
            for (const c of figs) atoms.push({ type: 'figure', top: c.y1, box: c, img: await this._crop(p, c), bb: { x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1 } });
            atoms.forEach(function (a) { flow.push(a); });
        },

        // _pageBlocks step: horizontal rules
        _pbRules(s) {
            const M = this._metrics, pl = s.pl, p = s.p, body = s.body, lines = s.lines, tables = s.tables, outer = s.outer, form = s.form, flow = s.flow;
            // horizontal rules outside tables / boxes; a thicker filled band with no text (GitHub's <hr>, 0.25em) too
            const bands2 = p.rects.filter(function (r) {
                const h = r.y1 - r.y0;
                return h >= 1.6 && h <= Math.max(6, 0.5 * body) && r.color && !isWhite(r.color) && r.y1 < pl.cutTop && r.y0 > pl.cutBottom &&
                    !pl.lines.some(function (L) { return overlapY(L.bottom, L.top, r.y0, r.y1) > 0 && Math.min(L.x1, r.x1) - Math.max(L.x0, r.x0) > 0; });
            }).map(function (r) { return { x0: r.x0, x1: r.x1, y: (r.y0 + r.y1) / 2, color: r.color, filled: true }; });
            // (an edge of a frame — a vertical rule or band meets it at both ends: a page border of bands, a form's box
            // that is no quote — is no break: a plan's cover and its boxes each read «---»)
            const uprights = p.vsegs.map(function (v) { return { x: v.x, y0: v.y0, y1: v.y1 }; }).concat(p.rects.filter(function (r) {
                return r.x1 - r.x0 <= 6 && r.y1 - r.y0 > 2 * body && r.color && !isWhite(r.color);
            }).map(function (r) { return { x: (r.x0 + r.x1) / 2, y0: r.y0, y1: r.y1 }; }));
            const frameEnd = function (x, y) { return uprights.some(function (v) { return Math.abs(v.x - x) < 4 && v.y0 <= y + 4 && v.y1 >= y - 4 && v.y1 - v.y0 > 2 * body; }); };
            p.hsegs.concat(bands2).forEach(function (s) {
                if (s.x1 - s.x0 < (M.right - M.left) * 0.5) return;
                if (frameEnd(s.x0, s.y) && frameEnd(s.x1, s.y)) return;
                if (tables.some(function (t) { return s.y >= t.y0 - 1 && s.y <= t.y1 + 1 && s.x0 >= t.x0 - 1 && s.x1 <= t.x1 + 1; })) return;
                // (a rule just outside a box, as wide as it, is the box's border)
                if (outer.some(function (b) { return s.y >= b.y0 - 4 && s.y <= b.y1 + 4 && Math.min(s.x1, b.x1) - Math.max(s.x0, b.x0) > 0.8 * (s.x1 - s.x0); })) return;
                if (outer.some(function (b) { return s.y >= b.y0 - 1 && s.y <= b.y1 + 1; })) return;
                // (a rule between a form's rows is its frame's)
                if (form.box && s.y > form.box.y0 - body && s.y < form.box.y1 + body && Math.min(s.x1, form.box.x1) - Math.max(s.x0, form.box.x0) > 0.5 * (s.x1 - s.x0)) return;
                // a rule along a row of cells (above / below a header, a booktabs table) is the table's, not a break
                const rowAt = function (above) {
                    const near = lines.filter(function (L) { return above ? L.bottom > s.y - 1 && L.bottom - s.y < 1.2 * L.size : L.top < s.y + 1 && s.y - L.top < 1.2 * L.size; });
                    if (!near.length) return null;
                    const y = above ? Math.min.apply(null, near.map(function (L) { return L.y; })) : Math.max.apply(null, near.map(function (L) { return L.y; }));
                    return near.filter(function (L) { return Math.abs(L.y - y) < 0.3 * L.size; });
                };
                const cells = function (r) {
                    if (!r || r.length < 2) return false;
                    const lo = Math.min.apply(null, r.map(function (L) { return L.x0; })), hiStart = Math.max.apply(null, r.map(function (L) { return L.x0; }));
                    // (the last column's cell runs on past its text: with three cells or more, up to a column's pitch)
                    const pitch = r.length >= 3 ? (hiStart - lo) / (r.length - 1) : 0;
                    return lo - s.x0 < 2 * body && s.x1 - Math.max.apply(null, r.map(function (L) { return L.x1; })) < Math.max(2 * body, pitch);
                };
                if (cells(rowAt(true)) || cells(rowAt(false))) return;
                // a link / text underline: just under the baseline of the text it spans — the text of that baseline taken
                // together (a long URL is cut into several segments; Firefox underlines a link that fills a line: Persian
                // an encyclopedia page's references had a rule drawn into a reference, cutting it in three)
                // (or further down, up to 0.75em, when the next line follows at a plain line pitch: no room for a break
                // there — Firefox set the reference links' grey underlines 0.6em down)
                const tight = function (L) { return lines.some(function (M) { return M !== L && M.y < L.y && L.y - M.y < 1.8 * L.size && Math.min(M.x1, s.x1) > Math.max(M.x0, s.x0); }); };
                // (the part of the rule its clip shows: Firefox's underline is drawn long and clipped to the link)
                const sv = s.shown || s;
                const under = lines.filter(function (L) { return L.y - s.y > -0.5 && (L.y - s.y < 0.35 * L.size || L.y - s.y < 0.75 * L.size && tight(L)); });
                const spans = under.reduce(function (n, L) { return n + Math.max(0, Math.min(L.x1, sv.x1) - Math.max(L.x0, sv.x0)); }, 0);
                if (spans > 0.8 * (sv.x1 - sv.x0)) return;
                flow.push({ type: 'hr', top: s.y, bb: { x0: s.x0, x1: s.x1, y0: s.y - 0.5, y1: s.y + 0.5 } });
            });
        },

        // _pageBlocks step: the page's items, direction and measure; XY-cut into column leaves
        _pbColumns(lines, flow, body) {
            const M = this._metrics;
            // reading order: recursive XY-cut over every element of the page (columns first, then
            // the rows of each column); free lines of one column region → paragraphs / headings / lists
            let R = 0, Lc = 0;
            lines.forEach(function (L) { R += L.strong.R; Lc += L.strong.L; });
            const items = flow.map(function (f) { return { bb: f.bb, f: f }; })
                .concat(lines.map(function (L) { return { bb: { x0: L.x0, x1: L.x1, y0: L.bottom, y1: L.top }, line: L }; }));
            const rtlPage = R > Lc;
            this._rtlPage = rtlPage;
            // a book's mirrored margins: a page whose own column is the document's measure moved to one side — flush with
            // the document's edge on that side, as wide as 92 % of the document's span at least, two lines or more at
            // each of its edges — is measured by its own edges. The document's span covers both kinds of page, and on a
            // recto every line looked set in at the left and short at the right: a biography's last lines became a quote
            let mL = M.left, mR = M.right;
            (function () {
                const bl = lines.filter(function (L) { return Math.abs(L.size - body) < 0.6 && !L.cell; });
                if (bl.length < 6) return;
                const x0s = bl.map(function (L) { return L.x0; }).sort(function (a, b) { return a - b; }), x1s = bl.map(function (L) { return L.x1; }).sort(function (a, b) { return a - b; });
                const p0 = x0s[Math.floor(x0s.length * 0.03)], p1 = x1s[Math.ceil(x1s.length * 0.97) - 1];
                const atL = bl.filter(function (L) { return Math.abs(L.x0 - p0) < 1.5; }).length, atR = bl.filter(function (L) { return Math.abs(L.x1 - p1) < 1.5; }).length;
                const flush = Math.abs(p0 - M.left) < 1.5 * body || Math.abs(M.right - p1) < 1.5 * body;
                if (p0 >= M.left - 1.5 * body && p1 <= M.right + 1.5 * body && p1 - p0 >= 0.92 * (M.right - M.left) && flush && atL >= 2 && atR >= 2 && atL + atR >= 6 &&
                    (Math.abs(p0 - M.left) > 0.5 * body || Math.abs(M.right - p1) > 0.5 * body)) { mL = p0; mR = p1; }
            })();
            this._pageMeasure = { left: mL, right: mR };
            const leaves = this._xyCut(items, body, mL, mR, rtlPage);
            return { items: items, leaves: leaves, rtlPage: rtlPage };
        },

        // _pageBlocks step: lines beside a float
        _pbFloats(items) {
            // lines beside a float (a figure wrapped by the text) end short without a line break
            // (any block of the page; its caption below it counts too)
            const floats = items;
            items.forEach(function (it) {
                if (!it.line) return;
                it.line.beside = floats.some(function (f) { return Math.min(f.bb.y1, it.bb.y1) - Math.max(f.bb.y0, it.bb.y0) > 0 && f !== it && (f.bb.x0 >= it.bb.x1 + 1 || f.bb.x1 <= it.bb.x0 - 1); });
            });
            // the wrap goes on below the float (its margin): lines ending where the beside lines end
            const pageLines = items.filter(function (it) { return it.line; }).map(function (it) { return it.line; }).sort(function (a, b) { return b.y - a.y; });
            pageLines.forEach(function (L, i) {
                if (L.beside) return;
                let up = null;
                for (let k = i - 1; k >= 0; k--) {
                    const U = pageLines[k];
                    if (U.y - L.y > 2.5 * L.size) break;
                    if (U.y - L.y > 0.3 * L.size && Math.abs(U.x0 - L.x0) < 1.5 * L.size) { up = U; break; }
                }
                if (up && up.beside && Math.abs(L.x1 - up.x1) < 1.5) L.beside = true;
            });
        },

        // _pageBlocks step: each leaf's items in reading order, runs of lines grouped
        _pbOrder(leaves, body, rtlPage) {
            const self = this;
            const ordered = [];
            leaves.forEach(function (leaf) {
                if (leaf.rows) { self._rowsLeaf(leaf, body, rtlPage).forEach(function (o) { ordered.push(o); }); return; }
                // top to bottom; elements side by side on one row (boxes overlapping by half) by x
                // (a total order: by the top edge, and across the page only for tops on one row — overlap alone is not
                // transitive: a tall float beside short lines would scramble them)
                const rowTol = 0.35 * body;
                // a float beside text (an infobox, a figure the text wraps around) goes before the lines beside it:
                // the text runs on unbroken
                leaf.items.forEach(function (it) {
                    if (it.line) return;
                    const beside = leaf.items.filter(function (o) {
                        return o.line && Math.min(o.bb.y1, it.bb.y1) - Math.max(o.bb.y0, it.bb.y0) > 0 && (o.bb.x1 <= it.bb.x0 + 1 || o.bb.x0 >= it.bb.x1 - 1);
                    });
                    it.floatKey = beside.length >= 2 ? Math.max(it.bb.y1, Math.max.apply(null, beside.map(function (o) { return o.line.y + o.line.size * 0.8; })) + rowTol + 0.01) : null;
                });
                // (a rule stands on a row of its own: its key is raised past the row tolerance, so the line under it
                // never shares its row — a frame's double bottom edge just above a line went after it, into a code block)
                const rowKey = function (it) { return it.line ? it.line.y + it.line.size * 0.8 : it.f && it.f.type === 'hr' ? it.bb.y1 + rowTol * 1.01 : (it.floatKey !== null && it.floatKey !== undefined ? it.floatKey : it.bb.y1); };
                leaf.items.sort(function (a, b) {
                    const d = rowKey(b) - rowKey(a);
                    if (Math.abs(d) > rowTol) return d;
                    return rtlPage ? b.bb.x1 - a.bb.x1 : a.bb.x0 - b.bb.x0;
                });
                // two short lines on one row at the column's two sides, far apart: each goes with the lines above it — a
                // signature's caption at the far side under its signer's name, the next table's title at the start side
                // (a Word report): the far one first when the nearest line over it is its own (over it alone, nearer than
                // any over the start one). By x alone the title came between the name and its caption
                const lw = leaf.x1 - leaf.x0;
                for (let k = 0; k + 1 < leaf.items.length; k++) {
                    const A = leaf.items[k].line, B = leaf.items[k + 1].line;
                    if (!A || !B || Math.abs(rowKey(leaf.items[k]) - rowKey(leaf.items[k + 1])) > rowTol || Math.abs(A.size - B.size) > 0.6) continue;
                    if (k + 2 < leaf.items.length && leaf.items[k + 2].line && Math.abs(rowKey(leaf.items[k + 2]) - rowKey(leaf.items[k])) <= rowTol) continue;
                    const gap = rtlPage ? A.x0 - B.x1 : B.x0 - A.x1;
                    if (lw < 15 * A.size || gap < 0.25 * lw || A.x1 - A.x0 > 0.45 * lw || B.x1 - B.x0 > 0.45 * lw) continue;
                    if (rtlPage ? leaf.x1 - A.x1 > 1.5 * A.size : A.x0 - leaf.x0 > 1.5 * A.size) continue;
                    const over = function (X, not) {
                        let best = null;
                        leaf.items.forEach(function (o) {
                            const U = o.line;
                            if (!U || U === A || U === B || U.y - X.y < 0.6 * X.size || U.y - X.y > 2.2 * X.size) return;
                            if (Math.min(U.x1, X.x1) - Math.max(U.x0, X.x0) <= 0 || Math.min(U.x1, not.x1) - Math.max(U.x0, not.x0) > 0) return;
                            if (!best || U.y < best.y) best = U;
                        });
                        return best;
                    };
                    const uB = over(B, A), uA = over(A, B);
                    if (uB && (!uA || uB.y < uA.y)) { const t = leaf.items[k]; leaf.items[k] = leaf.items[k + 1]; leaf.items[k + 1] = t; k++; }
                }
                let run = [];
                const flush = function () {
                    if (!run.length) return;
                    self._groupLines(run, body, leaf.x0, leaf.x1).forEach(function (g) { ordered.push({ type: 'text', lines: g, left: leaf.x0, right: leaf.x1 }); });
                    run = [];
                };
                leaf.items.forEach(function (it) { if (it.line) run.push(it.line); else { flush(); ordered.push(it.f); } });
                flush();
            });
            return ordered;
        },

        // _pageBlocks step: the ordered elements as blocks
        _pbBlocks(ordered, body) {
            const self = this;
            const out = [];
            ordered.forEach(function (f) {
                if (f.type === 'text') self._textBlocks(f.lines, body, f.left, f.right).forEach(function (b) { out.push(b); });
                else if (f.type === 'table') out.push(f.rows ? f : self._tableBlock(f));
                else if (f.type === 'code') out.push(self._codeBlock(f));
                else if (f.type === 'quote') {
                    const ql = f.lines.sort(function (a, b) { return b.y - a.y; });
                    // the quote style's own italic is not markup
                    if (ql.every(function (L) { return L.italicShare > 0.7 || L.monoShare > 0.5; })) ql.forEach(function (L) { L.glyphs.forEach(function (g) { g.italic = false; }); });
                    const kids = [];
                    // the quote's text column: its lines' own edges (the box adds padding and a bar)
                    const qL = Math.min.apply(null, ql.map(function (L) { return L.x0; })), qR = Math.max.apply(null, ql.map(function (L) { return L.x1; }));
                    // nested quotes (bars further in): runs of lines beside an inner bar become a quote of their own
                    // (right to left: lines left of an inner bar or box edge, the innermost the leftmost)
                    const innerOf = function (L) {
                        const cy = (L.top + L.bottom) / 2;
                        return (f.inner || []).filter(function (o) { return cy >= o.y0 - 2 && cy <= o.y1 + 2 && (f.rtl ? L.x1 < o.x0 : L.x0 > o.x1); })
                            .sort(function (a, c) { return f.rtl ? a.x0 - c.x0 : c.x0 - a.x0; })[0] || null;
                    };
                    const runs = [];
                    ql.forEach(function (L) { const o = innerOf(L), last = runs[runs.length - 1]; if (last && last.bar === o) last.lines.push(L); else runs.push({ bar: o, lines: [L] }); });
                    runs.forEach(function (r) {
                        const rL = Math.min.apply(null, r.lines.map(function (L) { return L.x0; })), rR = Math.max.apply(null, r.lines.map(function (L) { return L.x1; }));
                        const blocks = [];
                        self._groupLines(r.lines, body).forEach(function (g) { self._textBlocks(g, body, r.bar ? rL : qL, r.bar ? rR : qR, true).forEach(function (b) { blocks.push(b); }); });
                        if (r.bar) kids.push({ type: 'quote', children: blocks }); else blocks.forEach(function (b) { kids.push(b); });
                    });
                    out.push({ type: 'quote', children: kids });
                }
                else if (f.type === 'formrow') f.pairs.forEach(function (g) { out.push({ type: 'li', ordered: false, start: 1, indent: 0, glyphs: g, dir: f.dir, lines: f.lines, task: false, checked: false, form: true }); });
                else out.push(f);
            });
            return out;
        },

        // _pageBlocks step: consecutive tables and indentation quotes merged, quotes nested
        _pbMergeBlocks(out, body) {
            // rows set far apart (LibreOffice's HTML tables) come out as one table each: consecutive tables with the
            // same columns, close together, are one
            for (let i = out.length - 1; i > 0; i--) {
                const a = out[i - 1], b = out[i];
                if (a.type !== 'table' || b.type !== 'table' || !a.rows.length || !b.rows.length || a.rtl !== b.rtl) continue;
                if (a.rows[0].length !== b.rows[0].length || !a.cols || !b.cols || a.cols.length !== b.cols.length) continue;
                const ia = a.cols.slice(1, -1), ib = b.cols.slice(1, -1);
                // (borderless: their gutters overlap; ruled: the same rules)
                const same = a.gutters && b.gutters && a.gutters.length === b.gutters.length
                    ? a.gutters.every(function (g, k) { return Math.max(g[0], b.gutters[k][0]) < Math.min(g[1], b.gutters[k][1]) + 0.5; })
                    : ia.every(function (v, k) { return Math.abs(v - ib[k]) <= 0.6 * body; });
                if (!same) continue;
                const gapY = (a.rowYs && b.rowYs && a.rowYs.length && b.rowYs.length) ? a.rowYs[a.rowYs.length - 1] - b.rowYs[0] : Infinity;
                if (!(gapY > 0 && gapY < 5 * body)) continue;
                a.rows = a.rows.concat(b.rows); a.rowYs = a.rowYs.concat(b.rowYs); a.pageEnd = b.pageEnd;
                if (a.gutters && b.gutters) a.gutters = a.gutters.map(function (g, k) { return [Math.max(g[0], b.gutters[k][0]), Math.min(g[1], b.gutters[k][1])]; });
                out.splice(i, 1);
            }
            // consecutive indentation-detected quotes (same qrun split into separate paragraphs by _groupLines
            // due to inter-paragraph spacing): merge them into one blockquote with nested structure
            for (let i = out.length - 1; i > 0; i--) {
                // (of one direction: _qx0 is x0 left to right, −x1 right to left — runs of two directions are no nest)
                if (out[i - 1].type === 'quote' && out[i].type === 'quote' && out[i - 1]._qx0 !== undefined && out[i]._qx0 !== undefined && !!out[i - 1]._qrtl === !!out[i]._qrtl) {
                    out[i - 1].children = out[i - 1].children.concat(out[i].children);
                    out[i - 1]._qx0 = Math.min(out[i - 1]._qx0, out[i]._qx0);
                    out.splice(i, 1);
                }
            }
            // within a merged indentation quote, children at a deeper x0 become nested quotes (right to left, _qx0 is −x1:
            // deeper is larger in both directions)
            out.forEach(function (b) {
                if (b.type !== 'quote' || b._qx0 === undefined || !b.children.length) return;
                var baseX = b._qx0, sz = body;
                var kids = [], run = [];
                var flushR = function () { run.forEach(function (c) { kids.push(c); }); run = []; };
                b.children.forEach(function (c) {
                    var cx = c._qx0 !== undefined ? c._qx0 : baseX;
                    if (cx - baseX > 1.5 * sz) {
                        flushR();
                        kids.push({ type: 'quote', children: [c] });
                    } else {
                        run.push(c);
                    }
                });
                flushR();
                b.children = kids;
                delete b._qx0;
            });
        },

        // _pageBlocks step: unframed code from consecutive monospace paragraphs
        _pbUnframedCode(out) {
            const self = this;
            // unframed code (preformatted text with no box): consecutive monospace paragraphs, two lines or more
            // (a "- item" typed in monospace is code too: a list marker inside a code block printed without its box)
            const mono = function (b) { return b && (b.type === 'p' || (b.type === 'li' && !b.task)) && b.lines && b.lines.every(function (L) { return L.monoShare > 0.9 && !L.marker || (L.monoShare > 0.9 && L.marker && L.marker.num); }); };
            for (let i = 0; i < out.length; i++) {
                if (!mono(out[i])) continue;
                let j = i, ls = out[i].lines.slice();
                // (a gap of up to two blank lines stays inside the block: printed without its background, a
                // code block's blank lines split it into monospace paragraphs)
                while (mono(out[j + 1]) && out[j + 1].lines[0].page === ls[ls.length - 1].page && ls[ls.length - 1].y - out[j + 1].lines[0].y < 4.6 * ls[ls.length - 1].size) { j++; ls = ls.concat(out[j].lines); }
                // one line: a code block too (a paragraph of nothing but code is a <pre>, printed without its box)
                if (ls.length < 2 && (ls[0].monoShare < 0.98 || ls[0].glyphs.filter(function (g) { return !g.space; }).length < 2)) continue;
                // (one line that is a label — a word or two in capitals, set in a monospace face as web designs do for
                // "DATE", "CATEGORY": no code, a paragraph)
                if (ls.length < 2) {
                    const t = ls[0].glyphs.map(function (g) { return g.ch || ''; }).join('').trim();
                    if (t.length <= 24 && /^[\p{Lu}\d][\p{Lu}\d &\/·.-]*$/u.test(t) && t.split(/\s+/).length <= 3) continue;
                }
                out.splice(i, j - i + 1, self._codeBlock({ lines: ls, box: { x1: Math.max.apply(null, ls.map(function (L) { return L.x1; })) } }));
            }
        },

        /**
         * List marks an OCR layer lost (PDFIMPORT.md §7, "An OCR layer"). The scan shows the bullets; the text over it
         * has them misread — a second-level «◦» as «©» or «o» — or not at all. Two rules, both on lines set in from
         * the column's start by an em and a half or more:
         *  - a lone misread mark (© ® ° o O 0 e • · * ◦ ○ ● ■ □ ▪ = -) and a space before a letter is a bullet; the scan
         *    is looked at where its box would be (the mark itself, or the gap after it when the bullet came first);
         *  - lines one under another at one indent (three or more, with the marked lines inside them), each a new
         *    sentence — a capital first, no full stop before the next — are a list's items. A quote set in as far
         *    runs its sentences on (its next line starts in lower case), and a list whose items end in full stops
         *    is left as it was: no mark is better than a wrong one.
         */
        _ocrMarkers(lines, body, page) {
            const self = this, M = this._metrics, BUL = OCR_BUL;
            const ls = lines.filter(function (L) { return !L.cell && Math.abs(L.size - body) <= Math.max(1, 0.1 * body); }).sort(function (a, b) { return b.y - a.y; });
            const rtlOf = function (L) { return L.strong.R > L.strong.L; };
            const indentOf = function (L) { return rtlOf(L) ? M.right - L.x1 : L.x0 - M.left; };
            ls.forEach(function (L) {
                if (L.marker || L.num || indentOf(L) < 1.5 * body) return;
                const rtl = rtlOf(L), gs = L.glyphs.slice().sort(function (a, b) { return rtl ? b.x - a.x : a.x - b.x; });
                const k = gs.findIndex(function (g) { return !g.space; });
                if (k < 0 || !BUL.test(gs[k].ch) || !(gs[k + 1] && gs[k + 1].space) || !(gs[k + 2] && /\p{L}/u.test(gs[k + 2].ch))) return;
                L.marker = { x: gs[k].x + gs[k].w / 2, side: rtl ? 'right' : 'left', task: false, checked: false, ocr: true };
                // a task box: the scan shows a square there — its sides inked; a tick inside it is a checked one
                // (a bullet before the box — «•» read as «°» — leaves the box in the gap before the item's words)
                const nx = gs[k + 2].x, ex = gs[k].x + gs[k].w;
                const cx = nx - ex >= 0.9 * L.size ? (ex + nx) / 2 : gs[k].x + gs[k].w / 2, cy = L.y + 0.33 * L.size, h = 0.42 * L.size;
                const ink = self._ocrBox(page, { x0: cx - h, x1: cx + h, y0: cy - h, y1: cy + h });
                L._box = ink;
                L.glyphs = L.glyphs.filter(function (g) { return g !== gs[k] && g !== gs[k + 1]; });
                finishLine(L, L.page);
            });
            // task boxes: a run of items at one marker (2 pt) with one box that shows ticked — ink in its middle, its
            // sides inked — is a task list; each item checked when its box is. An empty box is too faint in a scan to
            // tell from the gap after a bullet on its own (Chrome's grey box: a tenth of its sides darker than white)
            const marked = ls.filter(function (L) { return L.marker && L.marker.ocr; });
            for (let i = 0; i < marked.length;) {
                let j = i + 1;
                while (j < marked.length && Math.abs(marked[j].marker.x - marked[i].marker.x) < 2 && marked[j - 1].y - marked[j].y < 2.5 * marked[j].size) j++;
                const run = marked.slice(i, j), ticked = function (L) { return !!L._box && L._box.inside >= 0.3 && L._box.edge >= 0.2; };
                if (run.some(ticked)) run.forEach(function (L) { L.marker.task = true; L.marker.checked = ticked(L); });
                i = j;
            }
            const text = function (L) { return L.glyphs.slice().sort(function (a, b) { return rtlOf(L) ? b.x - a.x : a.x - b.x; }).map(function (g) { return g.ch || ''; }).join('').trim(); };
            for (let i = 0; i < ls.length; i++) {
                const A = ls[i], ind = indentOf(A);
                if (A.marker || A.num || ind < 1.5 * body) continue;
                const run = [A], inner = [];
                let prev = A;
                for (let j = i + 1; j < ls.length; j++) {
                    const B = ls[j];
                    if (prev.y - B.y > 1.8 * B.size) break;
                    const d = indentOf(B) - ind;
                    if (Math.abs(d) <= 1.5 && !B.marker && !B.num) run.push(B);
                    else if (d > 1 * body && B.marker) inner.push(B);
                    else break;
                    prev = B;
                }
                if (run.length < 2 || run.length + inner.length < 3) continue;
                const ok = run.every(function (L, n) {
                    const t = text(L);
                    return /^\p{Lu}/u.test(t) && (n === run.length - 1 || !/[.!?:;؟]$/.test(t));
                });
                if (!ok) continue;
                run.forEach(function (L) {
                    const rtl = rtlOf(L);
                    L.marker = { x: rtl ? L.x1 + 0.9 * body : L.x0 - 0.9 * body, side: rtl ? 'right' : 'left', task: false, checked: false, ocr: true };
                });
                i += run.length + inner.length - 1;
            }
        },

        /**
         * What only the scan shows under an OCR layer (PDFIMPORT.md §7, "An OCR layer"): the page is drawn once (2.5 ×) and
         * each word's pixels are read where its letters stand —
         *  - **bold**: the word's strokes, the median run of dark pixels across a row, in em; a word whose strokes are a
         *    third wider than the page's usual is bold (a scanned article's «bold», «both», its headings);
         *  - **strike**: one row through the middle of its small letters dark over nine tenths of its width without a
         *    break (letters leave gaps between them; a strike does not) — «legacy_mode» struck through;
         * and the page's grey levels are kept (p._ink) for the list rules to look at a task box (_ocrBox).
         */
        async _ocrInk(pages) {
            if (typeof document === 'undefined') return;
            const S = 2.5;
            for (const p of pages) {
                if (!p.page || !p.glyphs.length) continue;
                const vp = p.page.getViewport({ scale: S });
                const cv = document.createElement('canvas');
                cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
                const ctx = cv.getContext('2d');
                ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
                await p.page.render({ canvasContext: ctx, viewport: vp, canvas: cv }).promise;
                const rgba = ctx.getImageData(0, 0, cv.width, cv.height).data, W = cv.width, H = cv.height;
                const gray = new Uint8Array(W * H);
                for (let i = 0; i < W * H; i++) gray[i] = (rgba[4 * i] * 3 + rgba[4 * i + 1] * 6 + rgba[4 * i + 2]) / 10;
                p._ink = { gray: gray, W: W, H: H, vp: vp };
                // words: glyphs one after another on a baseline, no space between
                const words = []; let cur = [];
                p.glyphs.forEach(function (g) {
                    const last = cur[cur.length - 1];
                    if (g.space || !g.ch || !g.ch.trim() || last && (Math.abs(g.y - last.y) > 0.2 * g.size || g.x - (last.x + last.w) > 0.25 * g.size || g.x < last.x)) { if (cur.length) words.push(cur); cur = []; }
                    if (!g.space && g.ch && g.ch.trim()) cur.push(g);
                });
                if (cur.length) words.push(cur);
                const px = function (x, y) { const q = vp.convertToViewportPoint(x, y); return [Math.round(q[0]), Math.round(q[1])]; };
                const dark = function (x, y) { return x >= 0 && y >= 0 && x < W && y < H && gray[y * W + x] < 140; };
                const stats = words.map(function (w) {
                    const a = w[0], z = w[w.length - 1], size = median(w.map(function (g) { return g.size; }));
                    const tl = px(a.x, a.y + 0.72 * size), br = px(z.x + z.w, a.y - 0.05 * size);
                    const x0 = Math.min(tl[0], br[0]), x1 = Math.max(tl[0], br[0]), y0 = Math.min(tl[1], br[1]), y1 = Math.max(tl[1], br[1]);
                    if (x1 - x0 < 3 || y1 - y0 < 3) return null;
                    const runs = [];
                    for (let y = y0; y <= y1; y++) {
                        let n = 0;
                        for (let x = x0; x <= x1 + 1; x++) { if (x <= x1 && dark(x, y)) n++; else if (n) { runs.push(n); n = 0; } }
                    }
                    if (runs.length < 6) return null;
                    runs.sort(function (u, v) { return u - v; });
                    // the strike: rows through the small letters' middle, one dark run over 90 % of the width
                    let strike = false;
                    const m0 = px(a.x, a.y + 0.42 * size)[1], m1 = px(a.x, a.y + 0.18 * size)[1];
                    if (w.length >= 3) for (let y = Math.min(m0, m1); y <= Math.max(m0, m1) && !strike; y++) {
                        let n = 0, best = 0, gap = 0;
                        for (let x = x0; x <= x1; x++) { if (dark(x, y)) { n += 1 + gap; gap = 0; } else if (n && gap < 1) gap++; else { best = Math.max(best, n); n = 0; gap = 0; } }
                        best = Math.max(best, n);
                        if (best >= 0.9 * (x1 - x0)) strike = true;
                    }
                    return { w: w, sw: runs[runs.length >> 1] / (S * size), strike: strike };
                });
                const ref = median(stats.filter(function (t) { return t && t.w.length >= 3; }).map(function (t) { return t.sw; }));
                stats.forEach(function (t) {
                    if (!t) return;
                    // (the word's punctuation at its ends not: «**Schema drift**,» — the OCR's word holds the comma)
                    if (ref && t.sw >= 1.3 * ref && t.w.length >= 2) {
                        let i0 = 0, i1 = t.w.length - 1;
                        while (i0 < i1 && /^\p{P}$/u.test(t.w[i0].ch)) i0++;
                        while (i1 > i0 && /^\p{P}$/u.test(t.w[i1].ch)) i1--;
                        for (let i = i0; i <= i1; i++) t.w[i].inkBold = true;
                    }
                    if (t.strike) t.w.forEach(function (g) { g.inkStrike = true; });
                });
            }
        },

        /** The scan's ink in a box (PDF units): the share of dark pixels in its middle and on its sides (and of faint ones there). */
        _ocrBox(p, box) {
            const k = p && p._ink;
            if (!k) return null;
            const a = k.vp.convertToViewportPoint(box.x0, box.y1), b = k.vp.convertToViewportPoint(box.x1, box.y0);
            const x0 = Math.round(Math.min(a[0], b[0])), x1 = Math.round(Math.max(a[0], b[0])), y0 = Math.round(Math.min(a[1], b[1])), y1 = Math.round(Math.max(a[1], b[1]));
            const at = function (x, y) { return x >= 0 && y >= 0 && x < k.W && y < k.H ? k.gray[y * k.W + x] : 255; };
            let inD = 0, inN = 0, edge = 0, edgeN = 0, faint = 0;
            const bw = Math.max(1, Math.round(0.15 * (x1 - x0)));
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
                const v = at(x, y) < 215;
                const border = x - x0 < bw || x1 - x < bw || y - y0 < bw || y1 - y < bw;
                if (border) { edgeN++; if (v) edge++; if (at(x, y) < 245) faint++; } else if (x - x0 > 2 * bw && x1 - x > 2 * bw && y - y0 > 2 * bw && y1 - y > 2 * bw) { inN++; if (v) inD++; }
            }
            return { inside: inN ? inD / inN : 0, edge: edgeN ? edge / edgeN : 0, faint: edgeN ? faint / edgeN : 0 };
        },

        /**
         * An OCR layer's lines, mended before anything measures them (PDFIMPORT.md §7, "An OCR layer"). Tesseract sets
         * each line's size from its letters' height and each word where its ink stands, so:
         *  - **code** has no monospace font to show it. A row (the segments of one baseline) set smaller than the
         *    body (under 93 %) whose words are wide for their letters (0.47 em a letter or more, the median of four
         *    words or more of three letters, letters only — two words OCR ran together are wide too: a monospace pitch — prose reads 0.3–0.42) or that holds two of = ( ) [ ] { } " _ ; < > is
         *    code: its segments one line again (they were cut at its wide word gaps and read as a table), its glyphs
         *    monospace, so the code rules take it. A lone closing bracket right after such rows goes with them.
         *  - **sizes**: a line alone on its row with no descender is a fifth taller than measured; then sizes within
         *    15 % of the body are the body's: a list item read at 10 pt among items at 11 split the
         *    list, and a paragraph's last line at 10 pt split the paragraph.
         *  - **bullets**: a row that starts with a lone misread bullet is one line (the list rules take it).
         *  - **gaps**: two long runs of prose on one baseline (twelve glyphs or more each) no further apart than two
         *    em and a fifth are one line — a sentence gap measured from ink cut a paragraph in two; a short run (four
         *    glyphs or more) beside a long one (25 or more) within an em and three fifths too.
         */
        _ocrRepair(all, body) {
            const CODEP = /[=(){}\[\]"_;<>]/g;
            const ink = function (L) { return L.glyphs.filter(function (g) { return !g.space && !g.atom; }); };
            const words = function (L) {
                const out = []; let cur = [];
                L.glyphs.slice().sort(function (a, b) { return a.x - b.x; }).forEach(function (g) { if (g.space || g.atom) { if (cur.length) out.push(cur); cur = []; } else cur.push(g); });
                if (cur.length) out.push(cur);
                return out;
            };
            const merge = function (segs, mono) {
                segs.sort(function (a, b) { return a.x0 - b.x0; });
                const A = segs[0];
                let gs = [];
                segs.forEach(function (S, k) {
                    if (k) { const P = segs[k - 1]; gs.push({ ch: ' ', space: true, x: P.x1, w: Math.max(0, S.x0 - P.x1), y: A.y, size: A.size, font: (S.glyphs[0] || {}).font }); }
                    gs = gs.concat(S.glyphs);
                });
                if (mono) gs.forEach(function (g) { g.mono = true; });
                A.glyphs = gs; A.cell = false;
                finishLine(A, A.page);
                return A;
            };
            all.forEach(function (pl) {
                // rows: the segments of one baseline, top to bottom
                const rows = [];
                pl.lines.slice().sort(function (a, b) { return b.y - a.y || a.x0 - b.x0; }).forEach(function (L) {
                    const r = rows[rows.length - 1];
                    if (r && Math.abs(r[0].y - L.y) < 0.25 * Math.min(r[0].size, L.size)) r.push(L); else rows.push([L]);
                });
                const codey = rows.map(function (r) {
                    const size = median(r.map(function (L) { return L.size; }));
                    if (size > 0.93 * body) return false;
                    const t = r.map(function (L) { return ink(L).map(function (g) { return g.ch; }).join(''); }).join(' ');
                    if ((t.match(CODEP) || []).length >= 2) return true;
                    // (words of letters only: a table's figures, «31h» «-94%», are wide for their letters too)
                    const ws = [].concat.apply([], r.map(words)).filter(function (w) { return w.length >= 3 && w.every(function (g) { return /^[\p{L},.]$/u.test(g.ch); }); });
                    if (ws.length < 4) return false;
                    return median(ws.map(function (w) { return (w[w.length - 1].x + w[w.length - 1].w - w[0].x) / w.length / size; })) >= 0.47;
                });
                const gone = new Set();
                rows.forEach(function (r, i) {
                    // (a closing bracket alone on its row, right after code: the call's end)
                    const closer = !codey[i] && i > 0 && codey[i - 1] && r.length === 1 && /^[)\]}]+[;,]?$/.test(ink(r[0]).map(function (g) { return g.ch; }).join(''));
                    if (!codey[i] && !closer) return;
                    if (closer) codey[i] = true;
                    if (r.length > 1) r.slice(1).forEach(function (L) { gone.add(L); });
                    const A = merge(r, true);
                    A.size = Math.min(A.size, median(rows[i].map(function (L) { return L.size; })));
                });
                // a line with no descender (no g j p q y) measures short — the OCR's size is the height of its letters'
                // box: «Structure» read 14 among its level's 17, «Lists inside lists» 11 for 13. Alone on its row, six
                // letters or more, no sentence's end (a paragraph's last line keeps its size): a fifth more
                rows.forEach(function (r, i) {
                    if (codey[i] || r.length !== 1) return;
                    const L = r[0], t = ink(L).map(function (g) { return g.ch; }).join('');
                    const first = L.glyphs.filter(function (g) { return !g.atom; }).sort(function (a, b) { return a.x - b.x; });
                    const lead = first.length > 1 && OCR_BUL.test(first[0].ch) && first[1].space;     // (a list item: «= New features»)
                    if (lead || (t.match(/\p{L}/gu) || []).length < 6 || /[gjpqy,;]/.test(t) || /[.:!?؟]$/.test(t) || L.size < body - 0.5) return;
                    L.size = Math.round(L.size * 1.2);
                });
                // the body's sizes, then prose cut at a wide ink gap
                pl.lines.forEach(function (L) { if (!gone.has(L) && L.monoShare < 0.5 && Math.abs(L.size - body) <= 0.15 * body) L.size = body; });
                rows.forEach(function (r, i) {
                    if (codey[i] || r.length < 2) return;
                    r.sort(function (a, b) { return a.x0 - b.x0; });
                    // (a row that starts with a lone misread bullet — a task list's checkboxes read as «°» — is one line:
                    // its words lined up from row to row and the list came out as a table)
                    const rtl = r.reduce(function (n, L) { return n + L.strong.R - L.strong.L; }, 0) > 0, lead = rtl ? r[r.length - 1] : r[0];
                    const leadInk = ink(lead);
                    if (leadInk.length === 1 && OCR_BUL.test(leadInk[0].ch)) { r.slice(1).forEach(function (L) { gone.add(L); }); merge(r.slice(), false); return; }
                    for (let k = 1; k < r.length; k++) {
                        const A = r[k - 1], B = r[k];
                        if (gone.has(A) || gone.has(B)) continue;
                        // (or a short run beside a long one, closer: a line's last words «A removed» after a sentence)
                        const nA = ink(A).length, nB = ink(B).length, gap = B.x0 - A.x1, em = Math.max(A.size, B.size);
                        const near = gap <= 2.2 * em && nA >= 12 && nB >= 12 || gap <= 1.6 * em && Math.min(nA, nB) >= 4 && Math.max(nA, nB) >= 25;
                        if (!near || Math.abs(A.size - B.size) > 0.5) continue;
                        merge([A, B], false); gone.add(B); r[k] = A;
                    }
                });
                if (gone.size) pl.lines = pl.lines.filter(function (L) { return !gone.has(L); });
            });
        },

        /**
         * A form (PDFIMPORT.md §7, "Forms"): rows of «label: value» pairs set side by side — an invoice's seller and buyer
         * boxes (labels and values in one run, «نام فروشنده: شرکت نمونه …», or apart, «نام خریدار:» … «فروشگاه …»). The
         * XY-cut read them column by column and the size rules made values headings. Rows (the segments of one
         * baseline, 0.4 em) with two segments or more, one of them a label (a colon after at most 40 characters, at the
         * text's start), three such rows or more one under another (3 em at most apart; two whose labels start at one
         * x): each row a run of pairs in
         * reading order — a label opens a pair, the segments after it until the next label are its value. A value set
         * on a row of its own a little above or below (under an em) fills the empty pair it stands beside.
         * Returns { rows: flow items (type 'formrow'), used: the lines taken }.
         */
        _formRows(lines, body, p) {
            const self = this, used = new Set(), out = [];
            // (not an address's colon: «https://…» at a line's start is no label)
            const LABEL = /^[^:：\n]{1,40}[:：](?!\/\/)/;
            const rows = [];
            lines.slice().sort(function (a, b) { return b.y - a.y || a.x0 - b.x0; }).forEach(function (L) {
                if (L.monoShare > 0.5 || L.cell === undefined && false) return;
                const r = rows[rows.length - 1];
                if (r && Math.abs(r.y - L.y) < 0.4 * Math.min(r.size, L.size)) r.segs.push(L); else rows.push({ y: L.y, size: L.size, segs: [L] });
            });
            const info = function (L) {
                const rtl = L.strong.R > L.strong.L, g = self._joinLines([L], rtl ? 'rtl' : 'ltr');
                const t = g.map(function (x) { return x.atom ? '' : x.ch || ''; }).join('');
                const m = t.trim().match(LABEL);
                return { L: L, rtl: rtl, g: g, t: t, label: !!m };
            };
            // (a row of one pair in one run — «Review date: 2026-10-24» — goes on with a form when it is short: a field, not a
            // sentence; it never starts one, nor counts toward the three rows — a page's «Arrows: ← → …» lines are prose)
            const field = function (q) { const t = q.t.trim(), k = t.search(/[:：]/); return q.label && k <= 25 && t.length - k <= 60; };
            rows.forEach(function (r) { r.info = r.segs.map(info); r.form = r.segs.length >= 2 && r.info.some(function (s) { return s.label; }); r.field = r.segs.length === 1 && field(r.info[0]); });
            // runs of form rows
            let i = 0;
            // (a run may start with a value set on its own just above its first form row)
            const lead = function (k) { return rows[k].segs.length === 1 && !rows[k].info[0].label && rows[k + 1] && rows[k + 1].form && rows[k].y - rows[k + 1].y <= 1.0 * rows[k].size; };
            while (i < rows.length) {
                if (!rows[i].form && !lead(i)) { i++; continue; }
                let j = i + 1;
                // (a row of one value goes on with the run only right over the next form row, within an em: a raised
                // value — a section's title between two boxes ends the run)
                // (and a row whose words stand under a value of the row above, a line pitch down: that value's next line —
                // a remark wrapped over three lines in a cell merged over the row, «توضیحات کارشناسی: …»)
                const valueSegs = function (r) { return r.info.filter(function (q) { return !q.label || !/[:：]\s*$/.test(q.t.trim()); }); };
                const cont = function (k) {
                    const r = rows[k], up = rows[k - 1];
                    if (r.form || r.info.some(function (q) { return q.label; }) || up.y - r.y > 1.8 * r.size) return false;
                    return r.segs.every(function (S) { return valueSegs(up).some(function (V) { return S.x0 >= V.L.x0 - r.size && S.x1 <= V.L.x1 + r.size && V.L.x1 - V.L.x0 > 0.5 * (S.x1 - S.x0); }); });
                };
                while (j < rows.length && rows[j - 1].y - rows[j].y <= 3 * body && (rows[j].form || lead(j) || cont(j) && (rows[j].cont = true) || rows[j].field && (rows[j].asForm = true))) j++;
                const run = rows.slice(i, j), fr = run.filter(function (r) { return r.form; });
                // (two rows are enough when their labels stand in one column — a header's «Date:», «Invoice number:»)
                // (the row's first label in reading order: at its start side)
                const startX = function (r) {
                    const ls = r.info.filter(function (q) { return q.label; }), rtl = ls.reduce(function (n, q) { return n + (q.rtl ? 1 : -1); }, 0) > 0;
                    return rtl ? Math.max.apply(null, ls.map(function (q) { return q.L.x1; })) : Math.min.apply(null, ls.map(function (q) { return q.L.x0; }));
                };
                const column = fr.length === 2 && Math.abs(startX(fr[0]) - startX(fr[1])) < 2;
                // a form is drawn as one: rules or fills along its rows or round them (a box, a ruled table, a band), or
                // its labels stand apart from their values («Date:» … «2026-10-24»). Two columns of prose whose lines
                // start «Latin: …», «Arrows: …» at one height are none — read as pairs, the columns ran together
                const bx = { x0: Math.min.apply(null, run.map(function (r) { return Math.min.apply(null, r.segs.map(function (L) { return L.x0; })); })),
                             x1: Math.max.apply(null, run.map(function (r) { return Math.max.apply(null, r.segs.map(function (L) { return L.x1; })); })),
                             y0: run[run.length - 1].y - run[run.length - 1].size, y1: run[0].y + run[0].size };
                const w = bx.x1 - bx.x0;
                const framed = !!p && ((p.hsegs || []).some(function (h) { return h.y > bx.y0 - body && h.y < bx.y1 + body && Math.min(h.x1, bx.x1) - Math.max(h.x0, bx.x0) > 0.5 * w; }) ||
                    (p.vsegs || []).some(function (v) { return v.x > bx.x0 - 2 * body && v.x < bx.x1 + 2 * body && Math.min(v.y1, bx.y1) - Math.max(v.y0, bx.y0) > 0.5 * (bx.y1 - bx.y0); }) ||
                    (p.rects || []).some(function (r) { return Math.min(r.x1, bx.x1) - Math.max(r.x0, bx.x0) > 0.5 * w && Math.min(r.y1, bx.y1 + 2 * body) - Math.max(r.y0, bx.y0 - 2 * body) > 0; }));
                const apart = fr.every(function (r) { return r.info.filter(function (q) { return q.label; }).every(function (q) { return /[:：]\s*$/.test(q.t.trim()); }); });
                if ((fr.length >= 3 || column) && (framed || apart)) {
                    const rtl = run.reduce(function (n, r) { return n + r.segs.reduce(function (m, L) { return m + L.strong.R - L.strong.L; }, 0); }, 0) > 0;
                    const owner = new Map();       // a value's segment → its pair (for its next lines)
                    const built = run.map(function (r, n) {
                        const segs = r.info.slice().sort(function (a, b) { return rtl ? b.L.x1 - a.L.x1 : a.L.x0 - b.L.x0; });
                        const pairs = [];
                        if (r.cont) {
                            const up = run[n - 1];
                            segs.forEach(function (s) {
                                const V = up.segs.filter(function (L) { return owner.has(L) && s.L.x0 >= L.x0 - r.size && s.L.x1 <= L.x1 + r.size; })[0];
                                const P = V && owner.get(V);
                                if (!P) return;
                                P.value = P.value.concat(P.value.length ? [{ ch: ' ', space: true }] : [], s.g); P.segs.push(s.L); owner.set(s.L, P);
                            });
                            return { r: r, pairs: [], cont: true };
                        }
                        segs.forEach(function (s) {
                            if (s.label) {
                                // the label's own value, when the run holds it («نام فروشنده: شرکت نمونه …»)
                                let k = 0; while (k < s.g.length && !/[:：]/.test(s.g[k].ch || '')) k++;
                                const val = s.g.slice(k + 1).filter(function (x, n, a) { return !(x.space && (n === 0 || n === a.length - 1)); });
                                pairs.push({ label: s.g.slice(0, k + 1), value: val, segs: [s.L] }); owner.set(s.L, pairs[pairs.length - 1]);
                            } else if (pairs.length) { const P = pairs[pairs.length - 1]; P.value = P.value.concat(P.value.length ? [{ ch: ' ', space: true }] : [], s.g); P.segs.push(s.L); owner.set(s.L, P); }
                            else { pairs.push({ label: [], value: s.g, segs: [s.L] }); owner.set(s.L, pairs[pairs.length - 1]); }
                        });
                        return { r: r, pairs: pairs };
                    });
                    // a value alone on its row: into the nearest empty pair beside it, a row above or below
                    built.forEach(function (b, n) {
                        if (b.r.form || b.r.asForm || b.pairs.length !== 1) return;
                        const v = b.r.segs[0];
                        let best = null, bd = Infinity;
                        [built[n - 1], built[n + 1]].forEach(function (o) {
                            if (!o || Math.abs(o.r.y - b.r.y) > 1.0 * b.r.size) return;
                            o.pairs.forEach(function (P) {
                                if (P.value.length || !P.segs.length) return;
                                const lab = P.segs[0], d = rtl ? lab.x0 - v.x1 : v.x0 - lab.x1;
                                if (d > -1 && d < bd) { bd = d; best = P; }
                            });
                        });
                        if (best) { best.value = b.pairs[0].value; best.segs.push(v); b.pairs = []; }
                    });
                    built.forEach(function (b) {
                        // (a row of one segment and no label — a box's title between its rows — stays text, unless its
                        // value went into a pair)
                        if (b.cont) { b.r.segs.forEach(function (L) { used.add(L); }); return; }
                        if (!b.r.form && !b.r.asForm) { if (!b.pairs.length) b.r.segs.forEach(function (L) { used.add(L); }); return; }
                        b.r.segs.forEach(function (L) { used.add(L); });
                        if (!b.pairs.length) return;
                        const ls = b.r.segs, bb = { x0: Math.min.apply(null, ls.map(function (L) { return L.x0; })), x1: Math.max.apply(null, ls.map(function (L) { return L.x1; })),
                            y0: Math.min.apply(null, ls.map(function (L) { return L.bottom; })), y1: Math.max.apply(null, ls.map(function (L) { return L.top; })) };
                        out.push({ type: 'formrow', dir: rtl ? 'rtl' : 'ltr', lines: ls, bb: bb, top: bb.y1,
                            pairs: b.pairs.map(function (P) { return P.label.concat(P.label.length && P.value.length ? [{ ch: ' ', space: true }] : [], P.value); }) });
                    });
                }
                i = j;
            }
            const box = out.length ? { x0: Math.min.apply(null, out.map(function (r) { return r.bb.x0; })), x1: Math.max.apply(null, out.map(function (r) { return r.bb.x1; })),
                y0: Math.min.apply(null, out.map(function (r) { return r.bb.y0; })), y1: Math.max.apply(null, out.map(function (r) { return r.bb.y1; })) } : null;
            return { rows: out, used: used, box: box };
        },

        /**
         * Dot grids: of the page's small shapes, those of one size (within 0.4 pt, at most 8 pt) that stand on a
         * regular lattice — three columns and three rows or more, most of its points filled, one pitch across and
         * one down (within 15 %), no text line among them. Keys "x0*2,y0*2" of the shapes found.
         */
        _dotLattice(shapes, lines) {
            const found = new Set(), groups = [];
            shapes.forEach(function (s) {
                const w = s.x1 - s.x0, h = s.y1 - s.y0;
                if (w <= 0 || h <= 0 || w > 8 || h > 8 || Math.abs(w - h) > 1) return;
                // (half a point apart is one size: PowerPoint rounds a grid's dots to the half point — 4 and 4.5 pt — and its
                // last column and one row fell in a group of their own, the rest not a grid any more)
                let g = groups.filter(function (x) { return Math.abs(x.w - w) < 0.6 && Math.abs(x.h - h) < 0.6; })[0];
                if (!g) { g = { w: w, h: h, m: [] }; groups.push(g); }
                const k = Math.round(s.x0 * 2) + ',' + Math.round(s.y0 * 2);
                if (!g.m.some(function (o) { return o.k === k; })) g.m.push({ k: k, x: s.x0, y: s.y0 });
            });
            const axis = function (vs) {          // distinct positions (within 0.6 pt) and whether their steps are one pitch
                const u = [];
                vs.slice().sort(function (a, b) { return a - b; }).forEach(function (v) { if (!u.length || v - u[u.length - 1] > 0.6) u.push(v); });
                const st = []; for (let i = 1; i < u.length; i++) st.push(u[i] - u[i - 1]);
                const md = median(st);
                return { n: u.length, regular: st.length > 0 && md > 0 && st.every(function (d) { return Math.abs(d - md) <= 0.15 * md; }) };
            };
            groups.forEach(function (g) {
                if (g.m.length < 9) return;
                const ax = axis(g.m.map(function (o) { return o.x; })), ay = axis(g.m.map(function (o) { return o.y; }));
                if (ax.n < 3 || ay.n < 3 || !ax.regular || !ay.regular || g.m.length < 0.75 * ax.n * ay.n) return;
                const box = { x0: Math.min.apply(null, g.m.map(function (o) { return o.x; })), y0: Math.min.apply(null, g.m.map(function (o) { return o.y; })) };
                box.x1 = Math.max.apply(null, g.m.map(function (o) { return o.x; })) + g.w; box.y1 = Math.max.apply(null, g.m.map(function (o) { return o.y; })) + g.h;
                if (lines.some(function (L) { return L.x0 < box.x1 && L.x1 > box.x0 && L.bottom < box.y1 && L.top > box.y0; })) return;
                g.m.forEach(function (o) { found.add(o.k); });
            });
            return found;
        },

        /**
         * Recursive XY-cut: a region splits at vertical gutters (columns; left to right, or right to
         * left in a right-to-left page) before horizontal gaps. When there is no gutter, the
         * horizontal gap chosen is one that frees a part with columns (a full-width title above
         * columns); else the region splits at every horizontal gap. Leaves keep the x-range of
         * their column, for alignment.
         * @returns {Array<{items, x0, x1}>}
         */
        _xyCut(items, body, x0, x1, rtl) {
            const X = this._xyTests(body);
            // a header row cut off from its body (their gutters differ: a left-aligned header over right-aligned
            // numbers): consecutive row leaves, close together, are one
            const leaves = this._xyRegions(X, items, x0, x1, rtl), merged = [];
            leaves.forEach(function (lf) {
                const pv = merged[merged.length - 1];
                // (the leaf above: a header row, perhaps under its section heading — two baselines at most)
                const baselines = function (l) {
                    const ys = l.items.map(function (it) { return it.line ? it.line.y : 0; }).sort(function (a, b) { return b - a; });
                    return ys.filter(function (y, k) { return !k || ys[k - 1] - y > 0.5 * body; }).length;
                };
                if (pv && pv.rows && lf.rows && baselines(pv) <= 2 && baselines(lf) > 2) {
                    const bot = Math.min.apply(null, pv.items.map(function (it) { return it.bb.y0; }));
                    const top = Math.max.apply(null, lf.items.map(function (it) { return it.bb.y1; }));
                    if (bot - top < 1.5 * body && bot - top > -0.5 * body) { pv.items = pv.items.concat(lf.items); pv.x0 = Math.min(pv.x0, lf.x0); pv.x1 = Math.max(pv.x1, lf.x1); return; }
                }
                merged.push(lf);
            });
            return merged;
        },

        // _xyCut step: the gap finders and the tests a region's parts are put to
        _xyTests(body) {
            const colGap = Math.max(0.9 * body, 6), rowGap = 0.25 * body, fences = this._fences || [];
            const gapsOf = function (list, axis, minGap) {
                const iv = list.map(function (it) { return axis === 'x' ? [it.bb.x0, it.bb.x1] : [it.bb.y0, it.bb.y1]; }).sort(function (a, b) { return a[0] - b[0]; });
                const gaps = []; let end = -Infinity;
                iv.forEach(function (q) { if (end > -Infinity && q[0] - end >= minGap) gaps.push([end, q[0]]); end = Math.max(end, q[1]); });
                return gaps;
            };
            const splitBy = function (list, axis, gaps) {
                const parts = gaps.map(function () { return []; }).concat([[]]);
                list.forEach(function (it) {
                    const c = axis === 'x' ? (it.bb.x0 + it.bb.x1) / 2 : (it.bb.y0 + it.bb.y1) / 2;
                    let k = 0; while (k < gaps.length && c > gaps[k][0]) k++;
                    parts[k].push(it);
                });
                return parts.filter(function (q) { return q.length; });
            };
            const extent = function (list) { return { x0: Math.min.apply(null, list.map(function (it) { return it.bb.x0; })), x1: Math.max.apply(null, list.map(function (it) { return it.bb.x1; })) }; };
            // a borderless table, not columns: the parts' lines share their baselines (rows) and are
            // short (a few words), where columns of prose run on with full lines
            const rowStructured = function (list, maxWords, vg) {
                const ls = list.filter(function (it) { return it.line; });
                if (ls.length < 4 || ls.length < list.length) return false;
                let shared = 0;
                ls.forEach(function (a) {
                    if (ls.some(function (b) { return b !== a && Math.abs(b.line.y - a.line.y) < 0.3 * a.line.size && (b.bb.x0 > a.bb.x1 || b.bb.x1 < a.bb.x0); })) shared++;
                });
                const words = ls.map(function (it) { return it.line.glyphs.filter(function (g) { return g.space; }).length + 1; }).sort(function (a, b) { return a - b; });
                if (!(shared >= ls.length * 0.6 && words[words.length >> 1] <= (maxWords || 4))) return false;
                // (columns of prose, however narrow, are no table: headings stand in two of them, larger than the text, or
                // most lines of each column run to its far side — two A5 columns of short wrapped lines, lists and
                // quotes shared their baselines and became a two-column table)
                const narrow = ls.filter(function (it) { return it.bb.x1 - it.bb.x0 < 0.6 * (extent(ls).x1 - extent(ls).x0); });
                const nGaps = gapsOf(narrow, 'x', colGap);
                if (nGaps.length && splitBy(narrow, 'x', nGaps).filter(function (q) { return q.some(function (it) { return it.line.size > 1.15 * body; }); }).length >= 2) return false;
                if (vg && vg.length) {
                    const parts = splitBy(list, 'x', vg).filter(function (q) { return q.filter(function (it) { return it.line; }).length >= 6; });
                    if (parts.length >= 2 && parts.every(function (q) {
                        const e = extent(q), w = e.x1 - e.x0, qs = q.filter(function (it) { return it.line; });
                        return qs.filter(function (it) { return it.bb.x1 >= e.x1 - 0.15 * w && it.line.glyphs.filter(function (g) { return g.space; }).length >= 2; }).length >= 0.4 * qs.length;
                    })) return false;
                }
                return true;
            };
            // a shaded band across a gutter with a line on its baseline at each side: a table's header row (the
            // signature table at a contract's end: «مهر و امضای طرف اول | مهر و امضای طرف دوم» on grey, the next row
            // bare) — its cells may run to a few more words than a bare table's
            const bandedRow = function (list, vg) {
                return fences.some(function (f) {
                    if (f.rule) return false;
                    return vg.some(function (g) {
                        if (!(f.x0 < g[0] && f.x1 > g[1])) return false;
                        const inBand = list.filter(function (it) { return it.line && it.line.y > f.y0 && it.line.y < f.y1; });
                        return inBand.some(function (a) { return a.bb.x1 <= g[0] + 0.5 && inBand.some(function (b) { return b.bb.x0 >= g[1] - 0.5 && Math.abs(b.line.y - a.line.y) < 0.3 * a.line.size; }); });
                    });
                });
            };
            // real columns stand side by side: most items of each part have a neighbour at the same
            // height in the next part (short lines of one column, or alternating left / right
            // paragraphs, leave gaps that are no gutters)
            const words = function (it) { return it.line ? it.line.glyphs.filter(function (g) { return g.space; }).length + 1 : Infinity; };
            // a gutter through the rows of a borderless table (its last column only reaches past the text
            // below it): the narrower part's items are short, each on the baseline of a short cell across the gutter
            const throughRows = function (a, b) {
                const S = a.length <= b.length ? a : b, Lg = S === a ? b : a;
                if (S.length < 2) return false;
                const paired = S.filter(function (it) {
                    return words(it) <= 4 && Lg.some(function (o) { return words(o) <= 4 && Math.abs(o.line.y - it.line.y) < 0.3 * it.line.size; });
                }).length;
                return paired >= 0.8 * S.length;
            };
            const sideBySide = function (parts) {
                for (let i = 0; i + 1 < parts.length; i++) {
                    const a = parts[i], b = parts[i + 1];
                    if (throughRows(a, b)) return false;
                    const meets = function (p, q) {
                        return p.filter(function (it) { return q.some(function (o) { return Math.min(it.bb.y1, o.bb.y1) - Math.max(it.bb.y0, o.bb.y0) > 0; }); }).length;
                    };
                    let ok = meets(a, b) >= a.length * 0.5 && meets(b, a) >= b.length * 0.5;
                    if (!ok && parts.length === 2) {
                        // a short column (the end of an article) wholly beside a long one that runs on
                        // past its end without a break (a break there = a section ending across the page)
                        const S = a.length < b.length ? a : b, Lg = S === a ? b : a;
                        const yb = Math.min.apply(null, S.map(function (it) { return it.bb.y0; }));
                        const yt = Math.max.apply(null, S.map(function (it) { return it.bb.y1; }));
                        const lt = Math.max.apply(null, Lg.map(function (it) { return it.bb.y1; }));
                        const ys = Lg.filter(function (it) { return it.bb.y1 < yb + body; }).map(function (it) { return [it.bb.y0, it.bb.y1]; });
                        ok = S.length >= 3 && meets(S, Lg) >= S.length * 0.8 && Math.abs(yt - lt) < 2 * body && ys.length > 0;
                    }
                    if (!ok) return false;
                }
                return true;
            };
            // a borderless table set at the text's own line pitch (no gap above or below it to cut at): a run of
            // three baselines or more, each of short cells side by side, sharing gutters → [above, run, below]
            const lead = /^([•◦▪▫■□●○‣⁃∙·\-–*+o]|\(?[0-9]{1,3}[.)]|\(?[a-zA-Z][.)])$/;
            const baselineRun = function (list) {
                const others = list.filter(function (it) { return !it.line; });
                const rows = [];
                list.filter(function (it) { return it.line; }).sort(function (a, b) { return b.line.y - a.line.y; }).forEach(function (it) {
                    const r = rows[rows.length - 1];
                    if (r && Math.abs(r.y - it.line.y) < 0.3 * it.line.size) r.items.push(it); else rows.push({ y: it.line.y, items: [it] });
                });
                const text = function (it) { return it.line.glyphs.map(function (g) { return g.ch || ''; }).join('').trim(); };
                const cellRow = function (r) {
                    if (r.items.length < 2 || gapsOf(r.items, 'x', colGap).length < r.items.length - 1) return false;
                    const its = r.items.slice().sort(function (a, b) { return a.bb.x0 - b.bb.x0; });
                    // (a list's marker and its item are no two cells)
                    if (lead.test(text(its[0]))) return false;
                    return its.every(function (it) { return words(it) <= 5; });
                };
                let best = null;
                for (let i = 0; i < rows.length; i++) {
                    if (!cellRow(rows[i])) continue;
                    let j = i; while (j + 1 < rows.length && cellRow(rows[j + 1]) && rows[j].y - rows[j + 1].y < 2.6 * rows[j].items[0].line.size) j++;
                    const its = rows.slice(i, j + 1).reduce(function (a, r) { return a.concat(r.items); }, []);
                    if (j - i >= 2 && gapsOf(its, 'x', colGap).length && (!best || its.length > best.its.length)) best = { i: i, j: j, its: its };
                    i = j;
                }
                // (its header row above it, its cells closer than a column's gap — four short bold words over right-aligned
                // numbers stand a little apart — when no cell of it crosses the run's gutters: the table's own)
                if (best && best.i > 0) {
                    const H = rows[best.i - 1], gut = gapsOf(best.its, 'x', colGap), sz = best.its[0].line.size;
                    const fits = H.items.length >= 2 && H.items.length <= gut.length + 1 && rows[best.i - 1].y - rows[best.i].y < 2.6 * sz &&
                        gapsOf(H.items, 'x', Math.max(0.3 * body, 2)).length >= H.items.length - 1 &&
                        H.items.every(function (it) { return words(it) <= 5 && !gut.some(function (g) { return it.bb.x0 < g[0] - 0.5 && it.bb.x1 > g[1] + 0.5; }); }) &&
                        !lead.test(text(H.items.slice().sort(function (a, b) { return a.bb.x0 - b.bb.x0; })[0]));
                    if (fits) { best.i--; best.its = H.items.concat(best.its); }
                }
                if (!best || (best.i === 0 && best.j === rows.length - 1 && !others.length)) return null;
                // (the page's other elements — figures, ruled tables — go above or below it; one beside it: no cut)
                const top = Math.max.apply(null, best.its.map(function (it) { return it.bb.y1; })), bot = Math.min.apply(null, best.its.map(function (it) { return it.bb.y0; }));
                if (others.some(function (o) { return o.bb.y0 < top && o.bb.y1 > bot; })) return null;
                const flat = function (rs) { return rs.reduce(function (a, r) { return a.concat(r.items); }, []); };
                return [flat(rows.slice(0, best.i)).concat(others.filter(function (o) { return o.bb.y0 >= top; })), best.its,
                        flat(rows.slice(best.j + 1)).concat(others.filter(function (o) { return o.bb.y1 <= bot; }))];
            };
            return { colGap: colGap, rowGap: rowGap, fences: fences, gapsOf: gapsOf, splitBy: splitBy, extent: extent, rowStructured: rowStructured, bandedRow: bandedRow, sideBySide: sideBySide, baselineRun: baselineRun, body: body };
        },

        // _xyCut step: the recursive cut of a region into leaves
        _xyRegions(X, items, x0, x1, rtl) {
            const colGap = X.colGap, rowGap = X.rowGap, fences = X.fences, gapsOf = X.gapsOf, splitBy = X.splitBy, extent = X.extent, body = X.body;
            const rowStructured = X.rowStructured, bandedRow = X.bandedRow, sideBySide = X.sideBySide, baselineRun = X.baselineRun;
            const rec = function (list, rx0, rx1, depth) {
                if (list.length <= 1 || depth > 40) return [{ items: list, x0: rx0, x1: rx1 }];
                const vg = gapsOf(list, 'x', colGap);
                // (cells set close together leave no gutter: segments cut at undrawn gaps tell instead)
                const cellish = list.filter(function (it) { return it.line && it.line.cell; }).length >= Math.max(3, 0.25 * list.length);
                // a gutter fenced by shaded rows — a row band whose side stands in it, within this region's height —
                // is a column gutter, however the rows beside it share their baselines: a table's rows never cross
                // their own band's side (two columns of zebra tables read as one table across the page)
                if (vg.length && fences.length) {
                    const ly0 = Math.min.apply(null, list.map(function (it) { return it.bb.y0; })), ly1 = Math.max.apply(null, list.map(function (it) { return it.bb.y1; }));
                    const fenced = vg.filter(function (g) {
                        // (a rule must run along most of the region's height; a band need only meet it)
                        const near = fences.filter(function (f) { return (f.rule ? Math.min(f.y1, ly1) - Math.max(f.y0, ly0) > 0.6 * (ly1 - ly0) : f.y1 > ly0 && f.y0 < ly1) && !(f.x0 < g[0] && f.x1 > g[1]); });
                        // (a band reaches past its text — the cells' padding — so its side stands in the gutter; one side
                        // fenced is enough: what stands beyond a row's side is not that table's, text or another table)
                        return near.some(function (f) { return (f.x1 <= g[1] && f.x1 >= g[0] - 1) || (f.x0 >= g[0] && f.x0 <= g[1] + 1); });
                    });
                    if (fenced.length) {
                        let cols = splitBy(list, 'x', fenced);
                        if (rtl) cols = cols.reverse();
                        return cols.reduce(function (acc, col) { const e = extent(col); return acc.concat(rec(col, e.x0, e.x1, depth + 1)); }, []);
                    }
                }
                // a vertical rule down the region that no line crosses — a sidebar's border (a web app's settings panel):
                // the columns either side of it, before any cut across (a figure may reach over it a little: a search
                // field's shadow)
                if (!vg.length && fences.length) {
                    const ly0 = Math.min.apply(null, list.map(function (it) { return it.bb.y0; })), ly1 = Math.max.apply(null, list.map(function (it) { return it.bb.y1; }));
                    const wall = fences.filter(function (f) {
                        if (!f.rule || f.x1 - f.x0 > 3 || Math.min(f.y1, ly1) - Math.max(f.y0, ly0) < 0.8 * (ly1 - ly0)) return false;
                        const x = (f.x0 + f.x1) / 2;
                        const left = list.filter(function (it) { return it.bb.x1 <= x + 1; }).length, right = list.filter(function (it) { return it.bb.x0 >= x - 1; }).length;
                        // (a line's letters, not a picture inline in it: a progress bar's crop reached back over the border)
                        const txt = function (it) { const gs = it.line.glyphs.filter(function (g) { return !g.atom && !g.space; }); return gs.length ? [Math.min.apply(null, gs.map(function (g) { return g.x; })), Math.max.apply(null, gs.map(function (g) { return g.x + g.w; }))] : [it.bb.x0, it.bb.x1]; };
                        return left >= 2 && right >= 2 && !list.some(function (it) { if (it.line) { const e = txt(it); return e[0] < x - 1 && e[1] > x + 1; } return it.bb.x0 < x - 25 && it.bb.x1 > x + 25; });
                    })[0];
                    if (wall) {
                        const x = (wall.x0 + wall.x1) / 2;
                        let cols = [list.filter(function (it) { return (it.bb.x0 + it.bb.x1) / 2 < x; }), list.filter(function (it) { return (it.bb.x0 + it.bb.x1) / 2 >= x; })];
                        if (rtl) cols = cols.reverse();
                        return cols.filter(function (c) { return c.length; }).reduce(function (acc, col) { const e = extent(col); return acc.concat(rec(col, e.x0, e.x1, depth + 1)); }, []);
                    }
                }
                if ((vg.length || cellish) && rowStructured(list, 0, vg)) return [{ items: list, x0: rx0, x1: rx1, rows: true }];
                if (vg.length && fences.length && bandedRow(list, vg) && rowStructured(list, 8)) return [{ items: list, x0: rx0, x1: rx1, rows: true }];
                if (vg.length && sideBySide(splitBy(list, 'x', vg))) {
                    let cols = splitBy(list, 'x', vg);
                    if (rtl) cols = cols.reverse();
                    return cols.reduce(function (acc, col) { const e = extent(col); return acc.concat(rec(col, e.x0, e.x1, depth + 1)); }, []);
                }
                // (not between two lines of one card a line's pitch apart: inside a paragraph of a card, a cut freeing
                // the columns of a table below took the paragraph's last line away from it)
                const hg = gapsOf(list, 'y', rowGap).filter(function (gp) {
                    if (gp[1] - gp[0] >= body) return true;
                    const below = list.filter(function (it) { return it.line && Math.abs(it.bb.y1 - gp[0]) < 0.5; })[0];
                    const above = list.filter(function (it) { return it.line && Math.abs(it.bb.y0 - gp[1]) < 0.5; })[0];
                    return !(below && above && below.line.card && below.line.card === above.line.card);
                });
                if (!hg.length) return [{ items: list, x0: rx0, x1: rx1 }];
                // a cut that frees a region with columns (largest such region first)
                let best = null;
                hg.forEach(function (gp) {
                    const lo = list.filter(function (it) { return (it.bb.y0 + it.bb.y1) / 2 < gp[0] + 0.01; });
                    const hi = list.filter(function (it) { return (it.bb.y0 + it.bb.y1) / 2 >= gp[0] + 0.01; });
                    // a cut with columns on one side only first (it frees the column region whole); then the largest
                    // column region; then the widest gap (between blocks, not between the lines of a paragraph)
                    const h = gp[1] - gp[0];
                    // (three items will do across a wide gutter, side by side: a slide's two columns of a few lines)
                    const cols = function (part) {
                        if (part.length >= 4) return gapsOf(part, 'x', colGap).length > 0;
                        if (part.length < 3) return false;
                        const wg = gapsOf(part, 'x', Math.max(2 * body, colGap));
                        if (!wg.length) return false;
                        const parts = splitBy(part, 'x', wg);
                        // (one of them a column of text: two lines a line pitch apart)
                        const textCol = parts.some(function (c) {
                            const ls = c.filter(function (it) { return it.line; }).map(function (it) { return it.line; }).sort(function (a, b) { return b.y - a.y; });
                            return ls.some(function (L, k) { return k && ls[k - 1].y - L.y < 1.6 * L.size; });
                        });
                        return textCol && sideBySide(parts);
                    };
                    const one = cols(lo) !== cols(hi) ? 1 : 0;
                    [lo, hi].forEach(function (part) {
                        if (!cols(part)) return;
                        // (the largest column region before the widest gap: a cut that frees the whole set of columns keeps
                        // them whole; a wider gap between blocks inside the columns — a row of sections that all end at one
                        // height, a cheat sheet's page 2 — is no break of the page, and cutting there read that row across)
                        const better = !best || one > best.one || (one === best.one && (part.length > best.n + 2 || (Math.abs(part.length - best.n) <= 2 && h > best.h + 0.3 * body)));
                        if (better) best = { gap: gp, n: part.length, h: h, one: one };
                    });
                });
                if (!best) {
                    // a run of rows with cells side by side between full-width text above and below
                    // (a borderless table inside a column): cut it out on both sides
                    const slabs = splitBy(list, 'y', hg).reverse();          // top first
                    const wide = slabs.map(function (sl) { return sl.length >= 2 && gapsOf(sl, 'x', colGap).length > 0; });
                    // (a row whose cells start where the row beside it does goes with it, however narrow its gutter:
                    // an invoice's «VAT Registration | EU VAT: …», the label nearly touching the value column)
                    const xs = function (sl) { return sl.filter(function (it) { return it.line; }).map(function (it) { return it.bb.x0; }).sort(function (a, b) { return a - b; }); };
                    const alignedSl = function (a, b) {
                        const p = xs(a), q = xs(b);
                        return p.length >= 2 && p.length === a.length && p.length === q.length && p.every(function (x, k) { return Math.abs(x - q[k]) < 2; });
                    };
                    for (let i = 0; i < slabs.length; i++) if (!wide[i] && ((wide[i - 1] && alignedSl(slabs[i], slabs[i - 1])) || (wide[i + 1] && alignedSl(slabs[i], slabs[i + 1])))) wide[i] = true;
                    let run = null;
                    for (let i = 0; i < slabs.length; i++) {
                        if (!wide[i]) continue;
                        let j = i; while (j + 1 < slabs.length && wide[j + 1]) j++;
                        const n = slabs.slice(i, j + 1).reduce(function (a, sl) { return a + sl.length; }, 0);
                        if (j > i && n >= 4 && (!run || n > run.n)) run = { i: i, j: j, n: n };
                        i = j;
                    }
                    if (!run || (run.i === 0 && run.j === slabs.length - 1)) {
                        const cut = baselineRun(list);
                        if (cut) return cut.filter(function (q) { return q.length; }).reduce(function (acc, part) { return acc.concat(rec(part, rx0, rx1, depth + 1)); }, []);
                        return [{ items: list, x0: rx0, x1: rx1 }];   // one column: the leaf keeps it whole
                    }
                    const flat = function (a) { return a.reduce(function (acc, sl) { return acc.concat(sl); }, []); };
                    return [flat(slabs.slice(0, run.i)), flat(slabs.slice(run.i, run.j + 1)), flat(slabs.slice(run.j + 1))]
                        .filter(function (q) { return q.length; })
                        .reduce(function (acc, part) { return acc.concat(rec(part, rx0, rx1, depth + 1)); }, []);
                }
                const parts = splitBy(list, 'y', [best.gap]).reverse();      // top first
                return parts.reduce(function (acc, part) { return acc.concat(rec(part, rx0, rx1, depth + 1)); }, []);
            };
            return rec(items, x0, x1, 0);
        },

        /**
         * A region of short lines in rows: runs of consecutive rows whose cells keep a common
         * vertical gutter become borderless tables; the other rows stay text.
         */
        _rowsLeaf(leaf, body, rtl) {
            // the lines here are already segments (split at real gaps), so a narrower gutter counts
            // (cells set close together — a bare HTML table — are split at their undrawn gaps already)
            const self = this, colGap = Math.max(0.3 * body, 3), cellGap = Math.max(0.15 * body, 1.5);
            const lines = leaf.items.map(function (it) { return it.line; }).sort(function (a, b) { return b.y - a.y; });
            const spans = this._rowSpans(leaf, body);
            // (only between bands: the rows at a table's ends have no bound of their own — above the first band stand
            // the header and the first body row, below the last the region may run on past the table; tried and
            // measured, both guesses cost more than they gave)
            const spanOf = function (L) { const cy = L.y + 0.3 * L.size; for (let k = 0; k < spans.length; k++) if (cy > spans[k][0] && cy < spans[k][1]) return k; return -1; };
            const rows = [];
            lines.forEach(function (L) {
                const k = spans.length ? spanOf(L) : -1;
                const row = k >= 0 ? rows.filter(function (r) { return r.span === k; })[0] : rows.filter(function (r) { return r.span === undefined && Math.abs(r.y - L.y) < 0.4 * L.size; })[0];
                if (row) row.lines.push(L); else rows.push(k >= 0 ? { y: L.y, size: L.size, lines: [L], span: k } : { y: L.y, size: L.size, lines: [L] });
            });
            rows.forEach(function (r) { r.lines.sort(function (a, b) { return a.x0 - b.x0; }); });
            // a justified line stretches its word gaps alike — wider than half an em in a narrow column, and cut into
            // segments there —, where a table's gutters differ: a row across the leaf whose word gaps are all one width
            // is a line of text, not cells, unless a row of cells stands right beside it (a header row whose columns happen
            // to stand evenly apart, over its body). Two lines of a justified paragraph came back as a table
            const evenRow = function (r) {
                if (!r || r.even !== undefined) return r ? r.even : false;
                const ink = [].concat.apply([], r.lines.map(function (L) { return L.glyphs; })).filter(function (g) { return !g.space && !g.atom && g.x !== undefined; })
                    .sort(function (a, b) { return a.x - b.x; });
                r.even = false;
                if (!ink.length) return false;
                const ws = [];
                for (let k = 1; k < ink.length; k++) { const d = ink[k].x - (ink[k - 1].x + ink[k - 1].w); if (d > 0.2 * r.size) ws.push(d); }
                r.jx0 = ink[0].x; r.jx1 = ink[ink.length - 1].x + ink[ink.length - 1].w;
                r.even = ws.length >= 3 && r.jx0 - leaf.x0 < 1.5 * r.size && leaf.x1 - r.jx1 < 1.5 * r.size && Math.max.apply(null, ws) - Math.min.apply(null, ws) < 0.15 * r.size;
                return r.even;
            };
            const justRows = new Set(rows.filter(function (r, i) {
                if (!evenRow(r)) return false;
                return ![rows[i - 1], rows[i + 1]].some(function (o) { return o && Math.abs(o.y - r.y) < 2.6 * r.size && o.lines.length >= 2 && !evenRow(o); });
            }));
            // free x-intervals of a row inside the leaf
            const free = function (r) {
                const out = []; let x = leaf.x0 - 1;
                if (justRows.has(r)) return [[leaf.x0 - 1, r.jx0], [r.jx1, leaf.x1 + 1]];
                // (narrower where the line was cut at an undrawn gap: cells set close together)
                // (and inside a line, at a gap of over half an em between its letters: two cells that ran together —
                // the line is cut there by the grid)
                r.lines.forEach(function (L) {
                    if (L.x0 - x >= (L.cell ? cellGap : colGap)) out.push([x, L.x0]);
                    let last = null;
                    L.glyphs.forEach(function (g) {
                        if (g.space) return;
                        if (last && g.x - (last.x + last.w) >= 0.6 * L.size) out.push([last.x + last.w, g.x]);
                        last = g;
                    });
                    x = Math.max(x, L.x1);
                });
                out.push([x, leaf.x1 + 1]);
                return out;
            };
            const meet = function (A, B) {
                const out = [];
                A.forEach(function (a) { B.forEach(function (b) { const lo = Math.max(a[0], b[0]), hi = Math.min(a[1], b[1]); if (hi - lo >= cellGap * 0.5) out.push([lo, hi]); }); });
                return out;
            };
            const inner = function (gaps) { return gaps.filter(function (g) { return g[0] > leaf.x0 && g[1] < leaf.x1; }); };
            const out = [], tables = [];
            let cur = null;
            rows.forEach(function (r, i) {
                const prev = rows[i - 1];
                // (a header row set apart above its table — a signature block's two party names over the names and titles
                // of their signatories — is still its row: one row above, as many cells, each over its column)
                const paired = function (a, b) {
                    if (!a || a.lines.length !== b.lines.length || a.lines.length < 2) return false;
                    return a.lines.every(function (L, k) { const o = b.lines[k]; return Math.min(L.x1, o.x1) - Math.max(L.x0, o.x0) > 0; });
                };
                const far = prev && prev.y - r.y > 2.6 * r.size && !(cur && cur.rows.length === 1 && cur.rows[0] === prev && prev.y - r.y < 5 * r.size && paired(prev, r));
                // (a row with no gutter inside it — a justified line cut at its stretched word gaps — is text)
                // (its segments one line again: left apart, each read as a menu's item)
                if (r.lines.length >= 2 && !inner(free(r)).length) {
                    const segs = r.lines.slice().sort(function (a, b) { return a.x0 - b.x0; });
                    const gs = [];
                    segs.forEach(function (S, k) {
                        if (k) { const P = segs[k - 1]; gs.push({ ch: ' ', space: true, x: P.x1, w: S.x0 - P.x1, y: S.y, size: S.size }); }
                        S.glyphs.forEach(function (g) { gs.push(g); });
                    });
                    const M = Object.assign({}, segs[0], { glyphs: gs });
                    finishLine(M, segs[0].page);
                    cur = null; tables.push({ text: { lines: [M] } }); return;
                }
                if (r.lines.length >= 2) {
                    if (cur && !far) {
                        // the first row (often a centred header) does not narrow the gutters of the body
                        const base = cur.rows.length === 1 ? free(r) : cur.gaps;
                        const g = cur.rows.length === 1 ? meet(free(r), free(r)) : meet(base, free(r));
                        const ok = inner(meet(cur.first, free(r))).length || inner(g).length;
                        if (ok && inner(g).length) { cur.gaps = g; cur.rows.push(r); return; }
                    }
                    cur = { gaps: free(r), first: free(r), rows: [r] }; tables.push(cur); return;
                }
                // one line inside one column of the table, a line pitch below the row before it, with the table
                // going on: the second line of a cell that wraps ("North / America")
                // (or a line pitch above the next row: a cell set in the middle of its row wraps above it too)
                const below = rows[i + 1];
                // (its column left empty on that row's baseline: the cell's lines sit above and below it)
                const above = below && below.lines.length >= 2 && r.y - below.y < 1.7 * r.size &&
                    !below.lines.some(function (o) { return Math.min(o.x1, r.lines[0].x1) - Math.max(o.x0, r.lines[0].x0) > 0; });
                if (cur && r.lines.length === 1 && prev && (prev.y - r.y < 1.7 * r.size || above)) {
                    const L = r.lines[0], gs = inner(cur.gaps);
                    const within = !gs.some(function (g) { return L.x0 < g[0] && L.x1 > g[1]; });
                    const next = rows.slice(i + 1).filter(function (q) { return q.lines.length >= 2; })[0];
                    const goesOn = next && r.y - next.y < 5 * r.size;
                    const cols = gs.length + 1;
                    if (within && cols >= 2 && (goesOn || prev.lines.length >= 2 || prev.partial)) { r.partial = true; cur.rows.push(r); return; }
                }
                cur = null; tables.push({ text: r });
            });
            let run = [];
            const flush = function () {
                if (!run.length) return;
                self._groupLines(run, body, leaf.x0, leaf.x1).forEach(function (g) { out.push({ type: 'text', lines: g, left: leaf.x0, right: leaf.x1 }); });
                run = [];
            };
            tables.forEach(function (t) {
                if (t.text) { run.push.apply(run, t.text.lines); return; }
                if (t.rows.length < 2 && t.rows[0].lines.length < 3) { t.rows.forEach(function (r) { run.push.apply(run, r.lines); }); return; }
                flush();
                out.push(self._gridTable(t.rows, self._ruleColumns(t.rows, leaf, inner(t.gaps)), rtl));
            });
            flush();
            return out;
        },

        // _rowsLeaf step: the rows' own bounds — shaded bands, or rules a row's height apart
        _rowSpans(leaf, body) {
            // shaded rows (zebra) give the rows' own bounds: each band is a row, and so is the space between two
            // bands — every line inside one is that row's, on whatever baseline (cells that wrap, cells centred
            // in a taller row); the other lines are grouped by baseline
            const fences = (this._fences || []).filter(function (f) { return f.x0 < leaf.x1 && f.x1 > leaf.x0 && f.x1 - f.x0 > 0.6 * (leaf.x1 - leaf.x0); })
                .sort(function (a, b) { return b.y1 - a.y1; });
            const spans = [];
            fences.forEach(function (f, i) {
                spans.push([f.y0, f.y1]);
                const n = fences[i + 1];
                if (n && f.y0 - n.y1 > 0.5 * body && f.y0 - n.y1 < 8 * body) spans.push([n.y1, f.y0]);
            });
            // (no bands: the rules between rows, consecutive rules a row's height apart)
            if (!spans.length) {
                // (drawn cell by cell: the pieces on one height that touch are one rule first)
                const joined = [];
                (this._rowRules || []).slice().sort(function (a, b) { return a.y - b.y || a.x0 - b.x0; }).forEach(function (h) {
                    const j = joined.filter(function (o) { return Math.abs(o.y - h.y) < 0.6 && h.x0 <= o.x1 + 1.5 && h.x1 >= o.x0 - 1.5; })[0];
                    if (j) { j.x0 = Math.min(j.x0, h.x0); j.x1 = Math.max(j.x1, h.x1); } else joined.push({ x0: h.x0, x1: h.x1, y: h.y });
                });
                const rules = joined.filter(function (h) { return h.x0 < leaf.x1 && h.x1 > leaf.x0 && Math.min(h.x1, leaf.x1) - Math.max(h.x0, leaf.x0) > 0.6 * (leaf.x1 - leaf.x0); })
                    .sort(function (a, b) { return b.y - a.y; })
                    .filter(function (h, i, a) { return !i || a[i - 1].y - h.y > 1; });
                const cand = [];
                for (let i = 0; i + 1 < rules.length; i++) {
                    const gap = rules[i].y - rules[i + 1].y;
                    if (gap > 0.5 * body && gap < 8 * body) cand.push([rules[i + 1].y, rules[i].y]);
                }
                // (a table's rows have one height: a span between a table's last rule and the next table's header rule —
                // a heading and a header row — has none like it beside it)
                const h = function (k) { return cand[k] ? cand[k][1] - cand[k][0] : null; };
                const like = function (a, b) { return a !== null && b !== null && Math.abs(a - b) <= 0.25 * Math.max(a, b); };
                cand.forEach(function (sp, k) {
                    const nb = [k - 1, k + 1].filter(function (j) { return cand[j] && (Math.abs(cand[j][1] - sp[0]) < 1.5 || Math.abs(cand[j][0] - sp[1]) < 1.5); });
                    if (nb.some(function (j) { return like(h(k), h(j)); })) spans.push(sp);
                });
            }
            return spans;
        },

        /**
         * Column boundaries of a borderless table from its rules: browsers draw each cell's border
         * on its own, so the rules under / over the rows break where the columns meet. Used when
         * they give at least as many columns as the gutters (a left-aligned header over right-aligned
         * numbers leaves no clean gutter).
         */
        _ruleColumns(rows, leaf, gaps) {
            const p = this._page;
            if (!p || !rows.length) return gaps;
            const size = rows[0].size;
            const top = rows[0].y + 1.6 * size, bottom = rows[rows.length - 1].y - 1.2 * size;
            const segs = p.hsegs.filter(function (s) { return s.y < top && s.y > bottom && s.x1 > leaf.x0 && s.x0 < leaf.x1; });
            const meets = [];
            segs.forEach(function (a) {
                segs.forEach(function (b) {
                    if (a !== b && Math.abs(a.y - b.y) < 0.6 && Math.abs(a.x1 - b.x0) < 1.2) meets.push({ x: (a.x1 + b.x0) / 2, y: a.y });
                });
            });
            if (!meets.length) return gaps;
            meets.sort(function (a, b) { return a.x - b.x; });
            const bps = [];
            meets.forEach(function (m) {
                const last = bps[bps.length - 1];
                if (last && m.x - last.x < 2) { last.ys[Math.round(m.y)] = 1; last.n++; } else { const ys = {}; ys[Math.round(m.y)] = 1; bps.push({ x: m.x, ys: ys, n: 1 }); }
            });
            // a break shared by the rule rows (all of them, or most when there are several)
            const ruleRows = {}; segs.forEach(function (s) { ruleRows[Math.round(s.y)] = 1; });
            const nRows = Object.keys(ruleRows).length;
            const good = bps.filter(function (b) { return Object.keys(b.ys).length >= Math.max(1, Math.ceil(nRows * 0.6)); });
            if (good.length < gaps.length || !good.length) return gaps;
            const out = good.map(function (b) { return [b.x - 0.25, b.x + 0.25]; });
            out.exact = true;                 // cells go to the column they stand in, not to the nearest text
            return out;
        },

        /** A borderless table: rows (lines on one baseline) cut at the common gutters. */
        _gridTable(rows, gaps, pageRtl) {
            const self = this, nc = gaps.length + 1;
            // the table's own direction: the page's, when the table has letters of it anywhere (a price list on a
            // Persian page: its rows are Latin symbols and numbers, its «خرید» Persian — the columns run right to left);
            // else its first row's letters
            let R = 0, Lc = 0, allR = 0, allL = 0;
            rows[0].lines.forEach(function (L) { R += L.strong.R; Lc += L.strong.L; });
            rows.forEach(function (r) { r.lines.forEach(function (L) { allR += L.strong.R; allL += L.strong.L; }); });
            const rtl = this._anyRtl === false ? false : (pageRtl && allR > 0) ? true : (!pageRtl && allL > 0) ? false : R !== Lc ? R > Lc : pageRtl;
            // a line running across a gutter (two cells set close: "Region Q1") splits at its glyph gap inside the gutter
            rows = rows.map(function (r) {
                const out = [];
                r.lines.forEach(function (L) {
                    let parts = [L];
                    gaps.forEach(function (g) {
                        parts = parts.reduce(function (acc, P) {
                            if (!(P.x0 < g[0] && P.x1 > g[1])) return acc.concat([P]);
                            const gl = P.glyphs;
                            let cut = -1, best = 0;
                            for (let k = 1; k < gl.length; k++) {
                                const a = gl.slice(0, k).filter(function (x) { return !x.space; }).pop(), b = gl[k];
                                if (!a || b.space) continue;
                                const e = a.x + a.w;
                                if (e <= g[1] + 0.5 && b.x >= g[0] - 0.5 && b.x - e > best) { best = b.x - e; cut = k; }
                            }
                            if (cut < 0 || best < 0.3 * P.size) return acc.concat([P]);
                            const mk = function (gs) { return finishLine(Object.assign({}, P, { glyphs: gs.filter(function (x, i) { return !(x.space && (i === 0 || i === gs.length - 1)); }) })); };
                            return acc.concat([mk(gl.slice(0, cut)), mk(gl.slice(cut))]);
                        }, []);
                    });
                    parts.forEach(function (P) { if (P.glyphs.length) out.push(P); });
                });
                return Object.assign({}, r, { lines: out });
            });
            const colOf = function (L) { const cx = (L.x0 + L.x1) / 2; let c = 0; while (c < gaps.length && cx > gaps[c][0]) c++; return c; };
            // column extents from the body rows; a line that falls in a gutter (a centred header)
            // goes to the column it is nearest to
            const ext = []; for (let c = 0; c < nc; c++) ext.push(null);
            rows.slice(rows.length > 2 ? 1 : 0).forEach(function (r) { r.lines.forEach(function (L) {
                if (gaps.some(function (g) { return (L.x0 + L.x1) / 2 > g[0] && (L.x0 + L.x1) / 2 < g[1]; })) return;
                const c = colOf(L); ext[c] = ext[c] ? [Math.min(ext[c][0], L.x0), Math.max(ext[c][1], L.x1)] : [L.x0, L.x1];
            }); });
            const place = function (L) {
                if (gaps.exact) return colOf(L);
                let best = colOf(L), bd = Infinity;
                ext.forEach(function (e, c) {
                    if (!e) return;
                    const d = Math.max(0, e[0] - L.x1, L.x0 - e[1]);
                    if (d < bd) { bd = d; best = c; }
                });
                return best;
            };
            let grid = rows.map(function (r) {
                const cells = []; for (let c = 0; c < nc; c++) cells.push([]);
                r.lines.forEach(function (L) { cells[place(L)].push(L); });
                return cells;
            });
            // cells that wrap: a baseline filling few columns belongs to the nearest row filling most of them
            // (above or below: cells can be aligned top, middle or bottom; a tie goes to the row above)
            if (nc >= 2) {
                const filled = grid.map(function (cells) { return cells.filter(function (c) { return c.length; }).length; });
                const need = Math.max(2, Math.ceil(0.6 * nc));
                const anchor = filled.map(function (n) { return n >= need; });
                if (anchor.filter(Boolean).length >= 2) {
                    // groups of baselines one line pitch apart (rows are set apart by their cells' padding)
                    const gaps = rows.slice(1).map(function (r, i) { return rows[i].y - r.y; });
                    const pitch = gaps.length ? Math.min.apply(null, gaps.filter(function (g) { return g > 0.6 * rows[0].size; }).concat([Infinity])) : Infinity;
                    const into = grid.map(function (_, i) { return i; });
                    let g0 = 0;
                    const close = function (a, b) {                       // baselines a..b (inclusive) are one group
                        const idx = []; for (let k = a; k <= b; k++) idx.push(k);
                        const anchors = idx.filter(function (k) { return anchor[k]; });
                        // (no baseline of the group fills the row, but together they do, closer than a line's pitch — a row
                        // whose cells wrap in two lines while its one-line cells sit in the middle, half a line from each:
                        // «P- / Customer / M.», «At risk 850 790», «102 / portal / Okafor» — one row, its first baseline's)
                        if (!anchors.length && idx.length >= 2 && idx.slice(1).every(function (k) { return rows[k - 1].y - rows[k].y < 0.9 * rows[k].size; })) {
                            const union = grid[a].map(function (_, c) { return idx.some(function (k) { return grid[k][c].length; }); }).filter(Boolean).length;
                            if (union >= need) idx.forEach(function (k) { into[k] = a; });
                            return;
                        }
                        if (!anchors.length) return;
                        idx.forEach(function (k) {
                            if (anchor[k]) return;
                            // the anchor above (top-aligned cells), or the first one when the line comes before it
                            const above = anchors.filter(function (j) { return j < k; }).pop();
                            into[k] = above !== undefined ? above : anchors[0];
                        });
                    };
                    for (let i = 1; i <= rows.length; i++) {
                        if (i === rows.length || gaps[i - 1] > pitch * 1.12 + 0.3) { close(g0, i - 1); g0 = i; }
                    }
                    const merged = grid.map(function (cells, i) { return into[i] === i ? cells.map(function (c) { return c.slice(); }) : null; });
                    grid.forEach(function (cells, i) { if (into[i] !== i) cells.forEach(function (c, k) { merged[into[i]][k] = merged[into[i]][k].concat(c); }); });
                    const keep = merged.map(function (m) { return !!m; });
                    rows = rows.filter(function (_, i) { return keep[i]; });
                    grid = merged.filter(Boolean).map(function (cells) { return cells.map(function (c) { return c.sort(function (a, b) { return b.y - a.y || a.x0 - b.x0; }); }); });
                }
            }
            const used = grid[0].map(function (_, c) { return grid.some(function (cells) { return cells[c].length; }); });
            const align = used.map(function (_, c) {
                const ext = function (ls) { return ls.length ? { x0: Math.min.apply(null, ls.map(function (L) { return L.x0; })), x1: Math.max.apply(null, ls.map(function (L) { return L.x1; })),
                    R: ls.reduce(function (a, L) { return a + L.strong.R; }, 0), L: ls.reduce(function (a, L) { return a + L.strong.L; }, 0) } : null; };
                return columnAlign(grid.slice(1).filter(function (cells) { return cells[c].length; }).map(function (cells) { return ext(cells[c]); }), grid[0] && ext(grid[0][c]), rtl, self._ocr);
            }).filter(function (_, c) { return used[c]; });
            const xs0 = Math.min.apply(null, rows.map(function (r) { return Math.min.apply(null, r.lines.map(function (L) { return L.x0; })); }));
            const xs1 = Math.max.apply(null, rows.map(function (r) { return Math.max.apply(null, r.lines.map(function (L) { return L.x1; })); }));
            return {
                type: 'table', rtl: rtl, align: rtl ? align.reverse() : align,
                cols: [xs0].concat(gaps.map(function (g) { return (g[0] + g[1]) / 2; }), [xs1]), gutters: gaps.map(function (g) { return g.slice(); }), rowYs: rows.map(function (r) { return r.y; }), ruled: !!gaps.exact,
                rows: grid.map(function (cells) {
                    const out = cells.filter(function (_, c) { return used[c]; }).map(function (ls) {
                        if (!ls.length) return [];
                        ls = ls.slice().sort(function (a, b) { return b.y - a.y || a.x0 - b.x0; });   // (a cell's lines top first: by x a right-aligned pair came out «Alpha ALP»)
                        return self._joinLines(ls, self._blockDir(ls, ls[0].x0, ls[0].x1, rtl));
                    });
                    return rtl ? out.reverse() : out;
                })
            };
        }
    });
})(typeof window !== 'undefined' ? window : globalThis);
