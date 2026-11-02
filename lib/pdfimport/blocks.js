/**
 * PdfImporter — 5. blocks, 6. HTML (lib/pdfimport/blocks.js)
 * ============================================================================
 * Headings, paragraphs, lists, quotes, code (structure-tree votes included), joined again across pages,
 * then semantic HTML. PDFIMPORT.md §8.2–§8.6, §9.
 *
 * Part of PdfImporter: load after lib/PdfImporter.js (see its header for the order). The methods
 * are those of the class, added to its prototype; the helpers come from the core.
 */
(function (global) {
    'use strict';
    const PdfImporter = global.PdfImporter || (typeof require === 'function' ? require('../PdfImporter.js') : null);
    const { repairArabic, goesOn, esc, median, inside, nfkcArabic } = PdfImporter._internal;
    // a numbered clause, "۳-1. …", "2.4) …", or a line opened by its number and a dash («۳- …») or by a word and its number
    // («مرحله 2: …», "Step 2: …"): a list's number cannot hold it — the text keeps it, a line of its own
    const D_ = '[0-9\u06F0-\u06F9\u0660-\u0669]';
    const ENUM = new RegExp('^\\s*(\\(\\s*(\\d{1,3}|[a-zA-Z]|[ivxIVX]{1,4})\\s*\\)|\\[\\d{1,3}\\]|[*\u2020\u2021\u00A7]|' + D_ + '{1,3}(?:[-.\u066B]' + D_ + '{1,3}){1,3}[.)\u066B]?|' +
        D_ + '{1,3}\\s?[-\u2013]|\\p{L}{2,12}\\s' + D_ + '{1,3}\\s?[:\uFF1A])\\s', 'u');

    Object.assign(PdfImporter.prototype, {
        /**
         * Tables from the structure tree (PDFIMPORT.md §8.3): when the tree is trusted and names tables, a table
         * block whose glyphs belong to one of its Table elements (none placed elsewhere by the tree) takes the tree's rows and columns —
         * cells that wrap, cells set in the middle of their row, a row cut by a column break come out right — and
         * table blocks that follow one another inside one Table element are one table. Left-to-right tables only
         * (yet); the geometry stays where the tree has no say.
         */
        /**
         * Paragraphs from the structure tree: consecutive paragraphs whose glyphs (90 % at least each) belong to one
         * element of the tree that is no heading, list or table — one P — are one paragraph: lines that end short
         * beside a float (an encyclopedia's infobox: "Portable" / "Document" / "Format", a word a line) are no paragraph
         * ends. Only joins: where the tree changes paragraph, the geometry's breaks stand.
         */
        _treeParagraphs(blocks) {
            const si = this._structInfo;
            if (!si || !si.tree || !(si.trust >= 0.5)) return blocks;
            const nodeOf = function (b) {
                if (!b || b.type !== 'p' || !b.glyphs) return null;
                const gs = b.glyphs.filter(function (g) { return g && !g.space && !g.atom && g.ch && g.ch.trim(); });
                if (!gs.length) return null;
                // (the block element: a P; inline code or a quotation inside it is still its text)
                const n = {}; gs.forEach(function (g) { const t = g.struct; if (t && t.block && (!t.sem || /^(Code|Quote|Reference|BibEntry|Note)$/.test(t.sem))) n[t.block] = (n[t.block] || 0) + 1; });
                const id = Object.keys(n).sort(function (a, c) { return n[c] - n[a]; })[0];
                return id && n[id] >= 0.9 * gs.length ? id : null;
            };
            const out = [];
            blocks.forEach(function (b) {
                const prev = out[out.length - 1], id = nodeOf(b);
                if (id !== null && prev && prev._pid === id) { prev.glyphs = prev.glyphs.concat([{ ch: ' ', space: true }], b.glyphs); prev.pageEnd = b.pageEnd; return; }
                if (id !== null) b._pid = id;
                out.push(b);
            });
            out.forEach(function (b) { delete b._pid; });
            return out;
        },

        _treeTables(blocks) {
            const si = this._structInfo;
            if (!si || !si.tree || !(si.trust >= 0.5) || !si.roles.Table) return blocks;
            const ink = function (b) { const out = []; b.rows.forEach(function (r) { r.forEach(function (c) { c.forEach(function (g) { if (g && !g.space && !g.atom && g.ch && g.ch.trim()) out.push(g); }); }); }); return out; };
            const tableOf = function (b) {
                if (b.type !== 'table' || b.rtl || !b.rows || !b.rows.length) return null;
                const gs = ink(b); if (gs.length < 4) return null;
                const n = {}; let loose = 0;
                gs.forEach(function (g) { const t = g.struct && g.struct.table; if (t && g.struct.row >= 0 && g.struct.col >= 0) n[t] = (n[t] || 0) + 1; else if (!g.struct) loose++; });
                const id = Object.keys(n).sort(function (a, c) { return n[c] - n[a]; })[0];
                // no glyph the tree places elsewhere; a few it knows nothing of (text a print style generates: a link's
                // address after it) go with their neighbours — but every cell's run must hold a placed glyph, so no text
                // is left without a cell to go to
                if (!id || n[id] + loose !== gs.length || loose > 0.15 * gs.length) return null;
                const anchored = b.rows.every(function (r) { return r.every(function (c) {
                    const inkC = c.filter(function (g) { return g && !g.space && !g.atom && g.ch && g.ch.trim(); });
                    return !inkC.length || inkC.some(function (g) { return g.struct && g.struct.table === +id; });
                }); });
                return anchored ? +id : null;
            };
            // a quote whose text is all one Table element's (an encyclopedia's infobox: a framed box of label / value rows,
            // which the geometry reads as a quote): its paragraphs' glyphs, as they are, become the cells to place
            const seqs = function (b, out) {
                if (!b) return false;
                if (b.type === 'quote') return (b.children || []).every(function (c) { return seqs(c, out); });
                if (b.type === 'code' || b.type === 'table' || b.type === 'figure' && !b.glyphs) return b.type === 'figure';
                if (b.glyphs) { out.push(b.glyphs); return true; }
                return b.type === 'hr';
            };
            blocks = blocks.map(function (b) {
                if (b.type !== 'quote' || b.rtl) return b;
                const out = [];
                if (!seqs(b, out) || !out.length) return b;
                const t = Object.assign({}, b, { type: 'table', rows: out.map(function (g) { return [g]; }), rtl: false, align: null, children: undefined });
                return tableOf(t) !== null ? t : b;
            });
            // blocks of one Table element in a row: one table
            const merged = [];
            blocks.forEach(function (b) {
                const prev = merged[merged.length - 1], id = tableOf(b);
                if (id !== null && prev && prev._tid === id) { prev.rows = prev.rows.concat(b.rows); prev.pageEnd = b.pageEnd; return; }
                if (id !== null) b._tid = id;
                merged.push(b);
            });
            merged.forEach(function (b) {
                if (b._tid === undefined) return;
                // each geometric cell's glyphs as they are (their spacing is the line builder's), placed by the tree's row
                // and column: a cell is cut where its glyphs change tree cell, and pieces of one tree cell (a cell that
                // wrapped onto lines read as rows) join with a space
                const cells = {}; let maxR = -1, maxC = -1;
                const put = function (k, run) {
                    while (run.length && run[run.length - 1].space) run.pop();
                    while (run.length && run[0].space) run.shift();
                    if (!run.length || k === null) return;
                    const cell = cells[k] || (cells[k] = []);
                    if (cell.length) cell.push({ ch: ' ', space: true });
                    run.forEach(function (g) { cell.push(g); });
                };
                b.rows.forEach(function (r) { r.forEach(function (c) {
                    let key = null, run = [];
                    c.forEach(function (g) {
                        const t = g.struct, k = t && t.table === b._tid && t.row >= 0 && t.col >= 0 && !g.space ? t.row + '/' + t.col : null;
                        if (k !== null && key !== null && k !== key) { put(key, run); run = []; }
                        if (k !== null) {
                            key = k;
                            if (t.row > maxR) maxR = t.row; if (t.col > maxC) maxC = t.col;
                        }
                        run.push(g);
                    });
                    put(key, run);
                }); });
                if (maxR < 1 || maxC < 1) { delete b._tid; return; }
                const rows = [];
                for (let r = 0; r <= maxR; r++) {
                    const row = [];
                    for (let c = 0; c <= maxC; c++) row.push(cells[r + '/' + c] || []);
                    if (row.some(function (c) { return c.length; })) rows.push(row);
                }
                if (b.align && b.align.length !== maxC + 1) b.align = null;
                b.rows = rows; b.tree = true; delete b._tid;
            });
            return merged;
        },

        /**
         * The structure tree on a group of lines: null when it has no say (an untrusted or absent tree, or lines it
         * does not reach: 80 % of each line's glyphs at least), else { heading, level } — every line in one heading
         * element (H1–H6 with its level; H / Title with none: the size decides) —, { text } — no line in a
         * heading —, or { split: k } — the lines change between heading and text, or between two headings, at k.
         * A trust of 0.5 at least (PdfImporter._structure), and a tree that names headings at all; else it is not asked.
         */
        _treeVote(lines) {
            const si = this._structInfo;
            if (!si || !si.tree || !(si.trust >= 0.5)) return null;
            // a tree that names no heading at all has no say on headings (LibreOffice's PDF of a Word file whose
            // headings are styled paragraphs: every heading would be 'text', and vetoed)
            if (!Object.keys(si.headings).length && !si.roles.H && !si.roles.Title) return null;
            const kinds = [];
            for (let i = 0; i < lines.length; i++) {
                const gs = lines[i].glyphs.filter(function (g) { return !g.space && !g.atom && g.ch && g.ch.trim(); });
                if (!gs.length) return null;
                const cov = gs.filter(function (g) { return g.struct; });
                if (cov.length < 0.8 * gs.length) return null;
                // the element most of the line's glyphs belong to
                const n = {}; cov.forEach(function (g) { const k = g.struct.sem && /^(H[1-6]?|Title)$/.test(g.struct.sem) ? 'H' + g.struct.semNode : 'T'; n[k] = (n[k] || 0) + 1; });
                const k = Object.keys(n).sort(function (a, b) { return n[b] - n[a]; })[0];
                const g0 = k === 'T' ? null : cov.find(function (g) { return 'H' + g.struct.semNode === k; });
                kinds.push({ k: k, level: g0 ? g0.struct.level : null });
            }
            for (let i = 1; i < kinds.length; i++) if (kinds[i].k !== kinds[0].k && (kinds[i].k !== 'T' || kinds[0].k !== 'T')) return { split: i };
            if (kinds[0].k === 'T') return { text: true };
            return { heading: true, level: kinds[0].level || null };
        },

        /**
         * Base direction of a block: a clear strong-letter majority (2:1) decides;
         * otherwise the alignment (a short last line, or a single line, against the
         * block / column edges); then the majority; then the fallback.
         */
        _blockDir(lines, left, right, fallbackRtl, marker) {
            // a document without one right-to-left letter or digit has nothing to read right to left: no
            // alignment or side can make it so (a right-aligned cell, a table in a page's right column)
            if (this._anyRtl === false) return 'ltr';
            if (marker) return marker.side === 'right' ? 'rtl' : 'ltr';
            // the letters first, when one direction has two thirds of them: a Persian line beside a float, flush with the
            // float's side of its region, had been read left to right by its alignment
            let R = 0, L = 0;
            lines.forEach(function (ln) { R += ln.strong.R; L += ln.strong.L; });
            if (R >= 2 * L && R > 0) return 'rtl';
            if (L >= 2 * R && L > 0) return 'ltr';
            // no letter at all (a table cell «٣٠٪», a number alone): the direction it stands in — the table's, the caller's —
            // before any guess from alignment or the document language (LibreOffice writes /Lang en-US for Arabic text)
            if (R === 0 && L === 0 && fallbackRtl !== undefined) return fallbackRtl ? 'rtl' : 'ltr';
            if (lines.length === 1) {
                const one = lines[0], tR = Math.abs(one.x1 - right) < 3, tL = Math.abs(one.x0 - left) < 3;
                if (tR && !tL) return 'rtl';
                if (tL && !tR) return 'ltr';
            }
            const tol = 3;
            const last = lines[lines.length - 1];
            const bl = lines.length > 1 ? Math.min.apply(null, lines.map(function (x) { return x.x0; })) : left;
            const br = lines.length > 1 ? Math.max.apply(null, lines.map(function (x) { return x.x1; })) : right;
            const touchR = Math.abs(last.x1 - br) < tol, touchL = Math.abs(last.x0 - bl) < tol;
            if (touchR && !touchL) return 'rtl';
            if (touchL && !touchR) return 'ltr';
            if (R !== L) return R > L ? 'rtl' : 'ltr';
            // use the document language (from PDF metadata) as a fallback before the caller's guess
            if (this._lang && /^(fa|ar|he|ur|ps|sd|ku|yi|dv|ug)/i.test(this._lang)) return 'rtl';
            if (this._lang && /^(en|de|fr|es|pt|it|nl|ru|zh|ja|ko|sv|no|da|fi|pl|cs|hu|ro|tr|vi|el|uk|bg|hr|sk|sl|lt|lv|et|id|ms|th|tl)/i.test(this._lang)) return 'ltr';
            return fallbackRtl ? 'rtl' : 'ltr';
        },

        /** "1. " / "۱) " at the logical start of a line, for either direction. */
        _numMarker(L) {
            const re = /^\s*([0-9\u06F0-\u06F9\u0660-\u0669]{1,3})[.)\u066B]\s/;
            // a bare number set off by a tab-wide gap before a capital ("1⇥Book contractors": ReportLab, word processors)
            const tabNum = function (X) {
                if (X.numTab) return true;
                const ink = X.glyphs.filter(function (g) { return !g.space; });
                let k = 0; while (k < ink.length && k < 3 && /^[0-9]$/.test(ink[k].ch)) k++;
                if (!k || !ink[k] || !/^\p{Lu}/u.test(ink[k].ch)) return false;
                return ink[k].x - (ink[k - 1].x + ink[k - 1].w) > 0.9 * X.size;
            };
            // (a direction the line has no letters of is not tried: "Block elements: ■ □ ●" is no right-to-left item)
            // Word's second-level bullet: a Courier "o" before the text
            const ink0 = L.glyphs.filter(function (g) { return !g.space && !g.atom; });
            if (ink0.length > 1 && ink0[0].ch === 'o' && ink0[0].mono && !ink0[1].mono && ink0[1].x - (ink0[0].x + ink0[0].w) > 0.3 * L.size && L.strong.L >= L.strong.R) {
                return { rtl: false, text: 'o ', n: '1', bullet: true };
            }
            // (right to left: the "o" at the right end, before the text — Word's RTL list)
            const inkN = ink0.length;
            if (inkN > 1 && ink0[inkN - 1].ch === 'o' && ink0[inkN - 1].mono && !ink0[inkN - 2].mono &&
                ink0[inkN - 1].x - (ink0[inkN - 2].x + ink0[inkN - 2].w) > 0.3 * L.size && L.strong.R > L.strong.L) {
                // (the glyph itself goes, not its text's length: an «o» is Latin, and a Latin start of the item — «o pip» —
                // read it into its own run: «pip o»)
                return { rtl: true, text: 'o ', n: '1', bullet: true, glyph: ink0[inkN - 1] };
            }
            // (a bullet at the right end of a Latin line, set off by a gap, on a right-to-left page: an item of a
            // right-to-left list whose text is Latin — a Persian encyclopedia page's external links, «… (https://…) ▪»)
            if ((this._rtlPage || this._rtlDoc || /^(fa|ar|he|ur|ps|ku)\b/i.test(this._lang || '')) && inkN > 1 && /^[\u2022\u25AA\u25AB\u25CF\u25A0\u25E6]$/.test(ink0[inkN - 1].ch) && !L.strong.R &&
                !/^[\u2022\u25AA\u25AB\u25CF\u25A0\u25E6\u25CB\u25A1]$/.test(ink0[inkN - 2].ch) &&
                ink0[inkN - 1].x - (ink0[inkN - 2].x + ink0[inkN - 2].w) > 0.3 * L.size) {
                return { rtl: true, text: ink0[inkN - 1].ch + ' ', n: '1', bullet: true, glyph: ink0[inkN - 1] };
            }
            // (a line of no letters at all — symbols, numbers — reads in the page's direction: «· ₹ 5,400 · ₿ 0.25» read right
            // to left in an English document put its last symbol first)
            const neutralRtl = !L.strong.R && !L.strong.L ? !!(this._rtlPage || this._rtlDoc) : L.strong.R >= L.strong.L;
            const dirs = (neutralRtl ? [true, false] : [false, true]).filter(function (r) { return r ? L.strong.R > 0 || !L.strong.L : L.strong.L > 0 || !L.strong.R; });
            for (const rtl of dirs) {
                const t = this._logical(L, rtl).map(function (g) { return g.ch || ''; }).join('');
                const m = t.match(re) || (!rtl && tabNum(L) ? t.match(/^\s*([0-9]{1,3})()\s/) : null);
                if (m) return { rtl: rtl, text: m[0], n: m[1] };
                // a checkbox typed as a character ("☐ item", "☑ item": Word, Kelk's .docx)
                const tk = t.match(/^\s*([\u2610\u2611\u2612\u2705\u2B1C])\uFE0F?\s/);
                if (tk) return { rtl: rtl, text: tk[0], n: '1', bullet: true, task: true, checked: tk[1] !== '\u2610' && tk[1] !== '\u2B1C' };
                // a bullet typed as a character ("• item", word processors' lists)
                const b = t.match(/^\s*[\u2022\u25E6\u25AA\u25AB\u2023\u2043\u2013\u00B7\u25CF\u25CB\u25A0\u25A1\u25BA\u27A2\u2756\u2751\u25FB\u2713\-*]\s/);
                if (b) return { rtl: rtl, text: b[0], n: '1', bullet: true };
                // a dash typed against its word («-مدیر محترم …»: letters' copy lists, written by hand) — an item all the
                // same; before a letter only (a minus is before a number)
                const d = t.match(/^\s*[-\u2013](?=\p{L})/u);
                if (d) return { rtl: rtl, text: d[0], n: '1', bullet: true };
            }
            return null;
        },

        /**
         * A hyphen at a line end, between lowercase letters: drop it (a word broken by hyphenation)?
         * A soft hyphen always; else the document's own words decide ("trade-offs" written whole
         * elsewhere / "tradeoffs" elsewhere); else the producer — browsers and office suites do not
         * hyphenate by default, TeX and layout programs do.
         */
        _dehyphenate(out, next, ch) {
            if (ch === '\u00AD') return true;
            let k = out.length - 2, a = '';
            while (k >= 0 && out[k].ch && /^\p{L}+$/u.test(out[k].ch)) { a = out[k].ch + a; k--; }
            let b = '';
            for (let i = 0; i < next.length && next[i].ch && /^\p{L}+$/u.test(next[i].ch); i++) b += next[i].ch;
            a = a.toLowerCase(); b = b.toLowerCase();
            const lex = this._lex;
            if (lex && a && b) {
                if (lex.hyph.has(a + '-' + b)) return false;
                if (lex.words.has(a + b)) return true;
            }
            if (this._profile) return this._profile.hyphenates;
            return !/skia|chrom|qt\b|wkhtml|microsoft|word|excel|powerpoint|libreoffice|openoffice|google|jspdf|kelk|quartz|safari|webkit|firefox|mozilla|cairo|wps/i.test(this._producer || '');
        },

        _joinLines(lines, dir) {
            const self = this, out = [];
            lines.forEach(function (L, i) {
                const lg = self._logical(L, dir === 'rtl');
                if (i && out.length && lines[i - 1].br) out.push({ atom: true, br: true, ch: '' });
                else if (i && out.length) {
                    while (out.length > 1 && out[out.length - 1].space && !out[out.length - 1].atom) out.pop();   // (one space at the wrap)
                    const last = out[out.length - 1], before = out[out.length - 2], next = (lg[0] || {}).ch || '';
                    if ((last.ch === '-' || last.ch === '\u00AD') && before && /\p{Ll}/u.test(before.ch) && /^\p{Ll}/u.test(next) && self._dehyphenate(out, lg, last.ch)) {
                        out.pop();                                  // a word hyphenated at the line end: joined again
                    } else if (!(last.ch === '-' && /^[\p{L}\p{N}]/u.test(next))) out.push({ ch: ' ', space: true, wrap: true });
                }
                lg.forEach(function (g) { out.push(g); });
            });
            return repairArabic(out, { keepZwnj: this._hasZwnj, lyingForms: this._lyingForms, lyingBack: this._lyingBack, fwdLies: this._fwdLies });
        },

        /**
         * Lines of one column → paragraph groups: a break where the size or the weight of a
         * heading changes, at a marker (bullet, number), where the gap is clearly wider than the
         * usual leading, at an indented first line, and — in justified text — after a short line.
         */
        _groupLines(lines, body, left, right) {
            const self = this, noEdges = left === undefined;
            if (left === undefined) { left = Math.min.apply(null, lines.map(function (L) { return L.x0; })); right = Math.max.apply(null, lines.map(function (L) { return L.x1; })); }
            const leftAll = left, rightAll = right;
            const leads = [], fullUp = [];
            for (let i = 1; i < lines.length; i++) {
                const a = lines[i - 1], b = lines[i], d = a.y - b.y;
                if (Math.abs(a.size - b.size) < 0.6 && d > 0 && d < 2.5 * b.size) { leads.push(d / b.size); fullUp.push(a.x1 - a.x0 > 0.9 * (right - left)); }
            }
            // (two pitches alike to 2 %, each under a line that fills the column — two wraps —, are the leading too where the
            // page has no more to learn from: a short page whose two paragraphs wrap once each, set 1.85 lines apart — a
            // Persian page's line-height of 1.8 —, came apart at each wrap under the default 1.4)
            const twoAlike = leads.length === 2 && fullUp[0] && fullUp[1] && Math.abs(leads[0] - leads[1]) < 0.02 * Math.max(leads[0], leads[1]) && !this._bodyLead;
            let lead = leads.length >= 3 || twoAlike ? median(leads) : (this._bodyLead || 1.4);
            // (no text is set 2.5 lines apart — double spacing is 2: lines that far apart are one-line paragraphs, and
            // their gap is no leading)
            if (lead > 2.5) lead = this._bodyLead && this._bodyLead < 2.5 ? this._bodyLead : 1.4;
            if (this._bodyLead && lead > this._bodyLead * 1.2 && lines.every(function (L) { return Math.abs(L.size - body) < 0.8; })) lead = this._bodyLead;
            const full = lines.filter(function (L) { return Math.abs(L.x1 - right) < 2.5 && Math.abs(L.x0 - left) < 2.5 + 2 * L.size; }).length;
            const justified = lines.length >= 4 && full >= lines.length * 0.55;
            const groups = []; let cur = null, prev = null;
            // width of a line's first word (at its right end when the line is right to left)
            const firstWord = function (L, rtl) {
                const gs = L.glyphs.filter(function (g) { return !g.atom; });
                if (!gs.length) return 0;
                if (!rtl) { const sp = gs.filter(function (g) { return g.space; })[0]; return (sp ? sp.x : L.x1) - L.x0; }
                const sps = gs.filter(function (g) { return g.space; }), sp = sps[sps.length - 1];
                return L.x1 - (sp ? sp.x + sp.w : L.x0);
            };
            // a run of lines indented on both sides alike (a browser's default <blockquote>: 40px each side)
            // is a quote — two lines at least, none reaching the column's end.  Lines within a run may
            // have different x0 (nested blockquotes indent further), so we require only that each line is
            // indented from the column's left edge, not that all start at the same x.
            if (!noEdges) {
                lines.forEach(function (L) { L.qrun = 0; });
                let id = 0;
                // (a line set in because a picture stands in the margin before it — a portrait left of a biography's first lines —
                // is no quote's: its indent is the picture's)
                const pics = ((self._page && self._page.images) || []).filter(function (m) { return m.x1 - m.x0 > 3 * body && m.y1 - m.y0 > 3 * body; });
                const byPic = function (L) {
                    const rtlL = L.strong.R > L.strong.L;
                    return pics.some(function (m) {
                        if (Math.min(m.y1, L.y + L.size) - Math.max(m.y0, L.y - 0.3 * L.size) <= 0) return false;
                        return rtlL ? m.x0 >= L.x1 - 1 && m.x0 - L.x1 < 3 * L.size && m.x1 <= right + 2 : m.x1 <= L.x0 + 1 && L.x0 - m.x1 < 3 * L.size && m.x0 >= left - 2;
                    });
                };
                lines.forEach(function (L) { L.byPic = byPic(L); });
                const qi = function (L) { return !L.marker && !L.byPic && L.monoShare < 0.5 && L.x0 - left > 1.5 * L.size && right - L.x1 > 1.5 * L.size && Math.abs(L.size - body) < 0.8 && !self._numMarker(L); };
                // a list item's text column, line by line from its marker — full lines too (they are no quote's, and
                // the short ones after them are the item's, not a quote's)
                // (in the item's size: a heading under a list is no text of its last item, nor is what follows the heading —
                // a Persian quote under «## …» after a task list had come in as the items' text, line by line, and was lost)
                const sameSize = function (P, A) { return Math.abs(P.size - A.size) < 0.6; };
                lines.forEach(function (A, i) {
                    const P = lines[i - 1];
                    if (P && !A.marker && !self._numMarker(A) && (P.marker || P.qcont || self._numMarker(P)) && sameSize(P, A) && A.x0 - left > 1 &&
                        A.x0 >= P.x0 - 1.5 && A.x0 - P.x0 < 3 * A.size && P.y - A.y < 2.5 * A.size) A.qcont = true;
                });
                for (let i = 0; i < lines.length; i++) {
                    const A = lines[i];
                    if (!qi(A)) continue;
                    // the continuation of a list item (its text column) is no quote
                    const P = lines[i - 1];
                    if (A.qcont) continue;
                    if (P && (P.marker || P.qcont || self._numMarker(P)) && sameSize(P, A) && ((A.x0 >= P.x0 - 1.5 && A.x0 - P.x0 < 3 * A.size) || (A.x1 <= P.x1 + 1.5 && P.x1 - A.x1 < 3 * A.size))) { A.qcont = true; continue; }
                    // gather consecutive indented lines — allow different x0 (nested quotes) within the run
                    // (a paragraph gap apart at most: 2.5 lines, or the leading and a 1-em margin where the leading is large —
                    // a Persian font's 1.56 put a browser quote's paragraphs 2.56 lines apart, each one a run of its own)
                    const qGap = Math.max(2.5, lead + 1.1);
                    let j = i + 1;
                    while (j < lines.length && qi(lines[j]) && !lines[j].qcont && lines[j - 1].y - lines[j].y < qGap * A.size) {
                        // still reject if it looks like a list-item continuation
                        var Pj = lines[j - 1];
                        if (Pj && (Pj.marker || Pj.qcont || self._numMarker(Pj)) && ((lines[j].x0 >= Pj.x0 - 1.5 && lines[j].x0 - Pj.x0 < 3 * lines[j].size) || (lines[j].x1 <= Pj.x1 + 1.5 && Pj.x1 - lines[j].x1 < 3 * lines[j].size))) break;
                        j++;
                    }
                    // the lines but the last end near one right edge (the quote's own column)
                    // (a right-to-left run ends its lines at the left: «۳-1. …» items flush right, ragged left, are no quote)
                    const rtlRun = lines.slice(i, j).reduce(function (s, L) { return s + L.strong.R - L.strong.L; }, 0) > 0;
                    // (of a run of paragraphs, the lines that wrap — a wrap's pitch over the next one —, when there are such:
                    // a paragraph's last line ends anywhere, and one-line paragraphs around a wrapped one had spread the ends)
                    const wrapEnds = lines.slice(i, j - 1).filter(function (L, k) { return L.y - lines[i + k + 1].y < Math.max(1.7, lead + 0.35) * L.size; });
                    const ends = lines.slice(i, j - 1).map(function (L) { return rtlRun ? L.x0 : L.x1; });
                    const spreadEnds = wrapEnds.length && wrapEnds.length < j - i - 1 ? wrapEnds.map(function (L) { return rtlRun ? L.x0 : L.x1; }) : ends;
                    // (lines that fill the quote's measure — short cells / labels side by side are no quote)
                    const widest = Math.max.apply(null, lines.slice(i, j).map(function (L) { return L.x1 - L.x0; }));
                    // a one-line quote: indented deeper than a first-line indent, half the column wide at least, not
                    // centred, a paragraph gap above and below it from lines at the column's edge
                    const one = j - i === 1 && (function () {
                        const B = lines[i - 1], C = lines[i + 1], sz = A.size;
                        // (lines on both sides, at the column's edge and no list's: a lone line shows no column)
                        const atEdge = function (X) { return X && Math.abs(X.x0 - left) < 1.5 && !X.qrun && !X.marker && !X.qcont && !self._numMarker(X); };
                        return A.x0 - left > 2.2 * sz && A.x1 - A.x0 > 0.5 * (right - left) && Math.abs((A.x0 - left) - (right - A.x1)) > 2 * sz &&
                            atEdge(B) && atEdge(C) && B.y - A.y > 1.6 * sz && A.y - C.y > 1.6 * sz && A.boldShare < 0.5;
                    })();
                    // a shallow indent (a first-line indent's: under 2.2 em) is a quote only when its lines end together, as
                    // wrapped text does — a run of one-line paragraphs, each with its first-line indent (text-indent),
                    // ends anywhere (the fuzz sets' symbols page in indented paragraphs became a quote)
                    const shallow = lines.slice(i, j).every(function (L) { return L.x0 - left < 2.2 * L.size; });
                    const spread = spreadEnds.length ? Math.max.apply(null, spreadEnds) - Math.min.apply(null, spreadEnds) : 0;
                    // (a quote set in by a shallow margin is set in on both sides: its wrapped lines end short of the column's
                    // edge by about as much as they start in — one-line paragraphs with a first-line indent of 1.5 em end
                    // anywhere, and some reach the edge)
                    // (the edge the column's text reaches, not the region's: a region can run wider than its lines)
                    const tL = Math.min.apply(null, lines.map(function (L) { return L.x0; })), tR = Math.max.apply(null, lines.map(function (L) { return L.x1; }));
                    const reachesEdge = ends.length > 0 && ends.some(function (e, k) { const L = lines[i + k]; return rtlRun ? e - tL < 0.5 * (tR - L.x1) : tR - e < 0.5 * (L.x0 - tL); });
                    // (lines centred in the column, every one, are a centred title or verse, not a quote)
                    // (or on one axis of their own, lines of very different lengths: a text box set off-centre on its page —
                    // a slide's agenda centred left of a picture — is centred all the same; a wrapped quote's lines share
                    // an edge, not a centre)
                    const run = lines.slice(i, j), mids = run.map(function (L) { return (L.x0 + L.x1) / 2; }), wid = run.map(function (L) { return L.x1 - L.x0; });
                    const centred = run.every(function (L) { return Math.abs((L.x0 - left) - (right - L.x1)) < 2 * L.size; }) ||
                        (run.length >= 2 && Math.max.apply(null, mids) - Math.min.apply(null, mids) < 0.5 * A.size && Math.max.apply(null, wid) - Math.min.apply(null, wid) > 3 * A.size);
                    // (and two of its lines a wrap's pitch apart: a column of short lines set apart — a side menu's items,
                    // two and a half lines from each other — is no quote's text)
                    // (or a sentence among them: a quote of one-line paragraphs set apart says something; menu items are
                    // labels of three words at most)
                    const wraps = lines.slice(i + 1, j).some(function (L, k) { return lines[i + k].y - L.y < 1.7 * L.size; }) ||
                        lines.slice(i, j).some(function (L) { return L.glyphs.filter(function (g) { return g.space; }).length >= 4; });
                    // (every line a bold «label: value» field: a form's box, set in from the page's edges, is no quote)
                    // (or every line a clause of its own, «مرحله 1: …», «مرحله 2: …» set in: an enumeration, no quote)
                    const enumText = function (X) { return ENUM.test((X.strong.R > X.strong.L ? self._logical(X, true) : X.glyphs).map(function (g) { return g.ch || ''; }).join('')); };
                    const fields = lines.slice(i, j).every(function (L) { return self._boldLabel(L); }) || lines.slice(i, j).every(enumText);
                    if (((j - i >= 2 && wraps) || one) && !centred && !fields && widest > 0.35 * (right - left) && spread < (shallow ? 0.08 : 0.45) * (right - left) && !(shallow && reachesEdge)) {
                        id++; for (let k = i; k < j; k++) lines[k].qrun = id;
                    }
                    i = j - 1;
                }
            }
            lines.forEach(function (L) {
                // (two lines of one card are measured against the card's own text column — §7: a card's padding made every
                // line of it look short against the page's, and each one a paragraph)
                const sameCard = L.card && prev && prev.card === L.card;
                const left = sameCard ? L.card.left : leftAll, right = sameCard ? L.card.right : rightAll;
                // a number marks a list item only at body size (a larger "1. Introduction" is a heading); a bullet at any
                // size (slides set their first level larger than the second)
                L.num = self._numMarker(L);
                if (L.num && !L.num.bullet && L.size > body + 0.6) L.num = null;
                // a dash at the start of a wrapped line of a paragraph is the paragraph's (a number range broken at its
                // dash: «… نامه شماره 451200 / – 1403/06/12، …» in a Prince letter read as a list item): the line above
                // full to the far edge, at the same start, a line's pitch up, no sentence ended, and the paragraph it
                // goes on not itself an item («- …» items, each wrapped full, stay a list)
                // (so is a typed bullet or box a sentence wrapped before \u2014 \u00ab\u2026 x\u00b3 + y\u00b3\u00bb / \u00ab\u00b7 CO\u2082\u00bb, \u00ab\u2026 \u2666 \u2610\u00bb / \u00ab\u2611 \u2026\u00bb in a
                // narrow column: the character comes a word space before the next word, where an item's typed bullet
                // stands a tab or a wide gap from its text)
                const wrapped = L.num && L.num.bullet && !/^\s*[-\u2013\u2014]/.test(L.num.text) && (function () {
                    const lg = self._logical(L, L.num.rtl).filter(function (g) { return g.ch && !/^\s$/.test(g.ch); });
                    const a = lg[0], b = lg[1];
                    if (!a || !b || a.x === undefined || b.x === undefined) return false;
                    const gap = L.num.rtl ? a.x - (b.x + b.w) : b.x - (a.x + a.w);
                    return gap < 0.45 * L.size;
                })();
                if (L.num && L.num.bullet && (/^\s*[-\u2013\u2014]/.test(L.num.text) || wrapped) && prev && cur && cur.length && !cur[0].num && !cur[0].marker && !prev.marker) {
                    const rtlP = L.num.rtl, ink = prev.glyphs.filter(function (g) { return !g.space; });
                    const tP = self._logical(prev, rtlP).map(function (g) { return g.ch || ''; }).join('').trim();
                    const full = rtlP ? prev.x0 - left < 1.0 * prev.size : right - prev.x1 < 1.0 * prev.size;
                    // (or the paragraph's first line, set in by its first-line indent)
                    const inBy = rtlP ? L.x1 - prev.x1 : prev.x0 - L.x0;
                    const sameStart = Math.abs(inBy) < 0.6 * L.size || (cur[0] === prev && inBy > 0 && inBy < 4 * L.size);
                    const pitch = prev.y - L.y > 0 && prev.y - L.y < 1.9 * Math.max(prev.size, L.size) && Math.abs(prev.size - L.size) < 0.6;
                    if (ink.length && full && sameStart && pitch && !/[.:;!?\u061B\u061F\u06D4]$/.test(tP)) { L.num = null; L.marker = null; }
                }
                if (L.num && !L.marker) L.marker = { side: L.num.rtl ? 'right' : 'left', x: L.num.rtl ? L.x1 : L.x0, num: true };
                const d = prev ? prev.y - L.y : 0;
                // (a size change, unless one line holds the other's size too: a run in a smaller bold font that wraps
                // makes the next line "smaller" by its count of glyphs, the rest of it at the paragraph's size)
                const holds = function (X, sz) { return X.glyphs.filter(function (g) { return !g.space && Math.abs(g.size - sz) < 0.6; }).length >= 4; };
                const sizeChange = prev && Math.abs(prev.size - L.size) > 0.6 && !(Math.abs(prev.size - body) < 0.8 || Math.abs(L.size - body) < 0.8 ? holds(L, prev.size) || holds(prev, L.size) : false);
                const styleChange = prev && ((prev.monoShare > 0.9) !== (L.monoShare > 0.9) && (prev.monoShare < 0.3 || L.monoShare < 0.3) || sizeChange || (prev.boldShare > 0.9) !== (L.boldShare > 0.9) && (prev.size > body + 0.5 || L.size > body + 0.5));
                // (or a wide gap after a line the next one's first word would have fitted on: not a wrap — the gap
                // is a paragraph's, even where every paragraph is one line long and the "leading" is that gap; a gap
                // clearly over the leading will do: a line the next word would have fitted on is no wrap — over it:
                // the cap of 1.75 lines sat under a leading of 1.79, and every paragraph lost its first lines)
                const rtlL = L.strong.R > L.strong.L;
                const roomy = prev && !L.marker && (rtlL ? prev.x0 - left : right - prev.x1) > firstWord(L, rtlL) + 0.6 * L.size;
                const bigGap = prev && (d > Math.max(lead * 1.3, 1.15) * Math.max(prev.size, L.size) || (roomy && d > Math.max(1.1 * lead, Math.min(1.75, 1.15 * lead)) * Math.max(prev.size, L.size)));
                // (a bold line the next word would have fitted on, plain text under it: a clause's heading at body size —
                // «**ماده (1): موضوع**» over its text, Word with no space between — was the paragraph's first line)
                const boldHead = prev && !L.marker && roomy && prev.boldShare > 0.9 && L.boldShare < 0.5 && d < 2.5 * L.size;
                const rtlLine = L.strong.R > L.strong.L;
                // (a hanging indent is no new paragraph: a clause «6- …» wrapped, its next line set in to where the clause's
                // text starts after its number — a Word list typed by hand, «که دارای …» under «6- داشتن …»)
                const hang = prev && !L.marker && (function () {
                    const lg = self._logical(prev, rtlLine);
                    let k = 0, t = '';
                    while (k < lg.length && k < 8) { t += lg[k].ch || ''; k++; if (/^\s*[0-9\u06F0-\u06F9\u0660-\u0669]{1,3}\s*[-\u2013.)]\s+$/.test(t)) break; }
                    if (!/^\s*[0-9\u06F0-\u06F9\u0660-\u0669]{1,3}\s*[-\u2013.)]\s+$/.test(t) || k >= lg.length) return false;
                    const g = lg[k];
                    return rtlLine ? Math.abs(L.x1 - (g.x + g.w)) < 2 : Math.abs(L.x0 - g.x) < 2;
                })();
                const indent = prev && !L.marker && !hang && !(cur && cur[0].marker) && Math.abs(L.size - body) < 0.8 &&
                    (rtlLine ? (right - L.x1 > 0.8 * L.size && prev.x1 > L.x1 + 0.8 * L.size)
                             : (L.x0 - left > 0.8 * L.size && L.x0 > prev.x0 + 0.8 * L.size));
                const shortPrev = prev && justified && !L.marker && !prev.beside && (rtlLine ? prev.x0 > left + 1.5 * prev.size : prev.x1 < right - 1.5 * prev.size);
                // a first-line indent after a short line starts a paragraph even when that line was indented too
                // (one-line paragraphs of dialogue); continuation lines start at the margin
                const reIndent = prev && !L.marker && !(cur && cur[0].marker) && Math.abs(L.size - body) < 0.8 && !rtlLine &&
                    L.x0 - left > 0.8 * L.size && L.x0 - left < 4 * L.size && Math.abs(L.x0 - prev.x0) < 1.5 && prev.x1 < right - 1.5 * prev.size &&
                    lines.some(function (o) { return Math.abs(o.x0 - left) < 1.5; });
                // the margin comes back after a short indented line: an indented block (quote) ended (not after a line set
                // in beside a picture: the text runs on under it)
                const outdent = prev && !L.marker && !prev.byPic && !(cur && cur[0].marker) && !rtlLine && prev.x0 - L.x0 > 0.8 * L.size && prev.x1 < right - 1.5 * prev.size &&
                    !(Math.abs((prev.x0 + prev.x1) / 2 - (L.x0 + L.x1) / 2) < 2 && Math.abs((L.x0 + L.x1) / 2 - (left + right) / 2) < 3);   // centred lines
                // an enumerated note after a short line: "(1) …", "(a) …", "[2] …", "* …", "† …"
                const short = prev && (rtlLine ? prev.x0 > left + Math.max(0.35 * (right - left), 6 * prev.size) : prev.x1 < right - Math.max(0.35 * (right - left), 6 * prev.size));
                // (for a line break: the edge of the lines in its own column — a region that also holds a sidebar runs
                // to the page's edge, and every line of the article beside it looked short)
                const colEdge = function () {
                    const ov = lines.filter(function (o) { return o.x0 < prev.x1 && o.x1 > prev.x0; });
                    return { l: Math.min.apply(null, ov.map(function (o) { return o.x0; })), r: Math.max.apply(null, ov.map(function (o) { return o.x1; })) };
                };
                const shortCol = function () {
                    if (!short) return false;
                    const e = colEdge(), w = e.r - e.l;
                    return rtlLine ? prev.x0 > e.l + Math.max(0.35 * w, 6 * prev.size) : prev.x1 < e.r - Math.max(0.35 * w, 6 * prev.size);
                };
                // (and a numbered clause, "۳-1. …", "2.4) …": a list's number cannot hold two levels — the text keeps it)
                const isEnum = function (X) {
                    if (X.enumd === undefined) X.enumd = ENUM.test(X.strong.R > X.strong.L ? self._logical(X, true).map(function (g) { return g.ch || ''; }).join('') : X.glyphs.map(function (g) { return g.ch; }).join(''));
                    return X.enumd;
                };
                const startX = function (X) { return X.strong.R > X.strong.L ? X.x1 : X.x0; };
                // (or after a sentence's end: a clause number does not wrap onto the start of a line mid-sentence)
                const endsSentence = function (X) { const t = (X.strong.R > X.strong.L ? self._logical(X, true) : X.glyphs).map(function (g) { return g.ch || ''; }).join('').replace(/[\s\u200B-\u200F\u2060\uFEFF]+$/, ''); return /[.:;!?؛؟]$/.test(t); };
                const enumd = prev && !L.marker && isEnum(L) && (short || (cur && isEnum(cur[0]) && Math.abs(startX(cur[0]) - startX(L)) < 1) || endsSentence(prev));
                // a list item's text never runs on left of its marker (right of it, right to left)
                const leftOfItem = cur && cur[0].marker && !L.marker && (cur[0].marker.side === 'right' ? L.x1 > cur[0].marker.x + 0.5 * L.size : L.x0 < cur[0].marker.x - 0.5 * L.size);
                const inRun = prev && L.qrun && prev.qrun === L.qrun, runEdge = prev && (L.qrun || prev.qrun) && prev.qrun !== L.qrun;
                // (a contents line — dot leaders to a page number at its end — is an entry of its own, however close the
                // next one: a report's table of contents ran together into one paragraph)
                const toc = prev && self._leaderLine(prev) && self._leaderLine(L);
                // (a line that ends a sentence or opens a list with room left for the next line's first word: the writer
                // broke it — «… به ترتیب زیر عمل کند:» over «الف) …», a line's pitch apart)
                // (the room measured to the next line's own far end, not the column's: beside a table, a column's lines are
                // narrower than the page's)
                // (whatever the next line's size: a flyer's «… رها نکند.» at 11 pt over «وسایل لازم : …» at 13 pt, the
                // label of which is set at 11 — the sizes did not tell — ran on as one paragraph)
                const stopRoom = prev && roomy && !L.marker && endsSentence(prev) &&
                    (rtlL ? prev.x0 - L.x0 : L.x1 - prev.x1) > firstWord(L, rtlL) + 0.6 * L.size;
                // (a line that starts at the column's edge under one that started far from it — the far half of a form's row,
                // «نوع پژوهش: …» beside «موضوع طرح: …» — is no wrap of it: a wrapped line starts where its paragraph does;
                // not under a line set in by a picture beside it: the text runs on under the picture)
                const rtlS = L.strong.R > L.strong.L, colW = right - left;
                const fromFar = prev && !L.marker && !prev.marker && !prev.byPic && colW > 15 * L.size && (rtlS === (prev.strong.R > prev.strong.L)) &&
                    (rtlS ? right - prev.x1 > 0.3 * colW && right - L.x1 < 1.0 * L.size : prev.x0 - left > 0.3 * colW && L.x0 - left < 1.0 * L.size);
                // (a centred line under a line that ends a sentence and fills the column: a flyer's «… لباس گرم، . . .» over
                // «زمان حضور: …» centred — no last line of a centred paragraph, which runs on mid-sentence)
                const midW = right - left;
                const centredAfter = prev && !L.marker && endsSentence(prev) && midW > 15 * L.size && L.x0 - left > 3 * L.size &&
                    Math.abs((L.x0 - left) - (right - L.x1)) < 1.5 * L.size && prev.x1 - prev.x0 > 0.9 * midW;
                // (a letter's head field — «تاریخ: …», «شماره: …» kept from its letterhead, §6a — is a paragraph of its own)
                const field = prev && !L.fieldCont && (L.letterField || prev.letterField || !!L.letterHead !== !!prev.letterHead);
                // (a note opened by its mark is a paragraph of its own: endnotes one under the other ran together)
                const noteStart = prev && L.note && prev.note && /^[\u00B9\u00B2\u00B3\u2070-\u2079\u2071\u1D5B\u02E3*]/.test(self._logical(L, L.strong.R > L.strong.L).map(function (g) { return g.ch || ''; }).join('').trim());
                if (!cur || runEdge || noteStart || (!inRun && (styleChange || bigGap || boldHead || L.marker || indent || shortPrev || reIndent || outdent || enumd || leftOfItem || toc || fromFar || stopRoom || field || centredAfter)) || (inRun && bigGap)) { cur = []; groups.push(cur); }
                // a line that opens with a bold label («زبان طرح: …», «Date: …») is a field of its own: a line break before it
                // (a form's box of fields ran into one paragraph)
                else if (prev && self._boldLabel(L)) prev.br = true;
                // a line break kept in a centred block of short lines (a letter's signature, its name over its title: the
                // two lines' middles at one x, their widths apart — no wrap, which fills a line, sets lines so)
                else if (prev && Math.abs((prev.x0 + prev.x1) / 2 - (L.x0 + L.x1) / 2) < 0.5 * L.size && Math.abs((prev.x1 - prev.x0) - (L.x1 - L.x0)) > L.size &&
                         Math.max(prev.x1 - prev.x0, L.x1 - L.x0) < 0.6 * (right - left) && right - left > 15 * L.size) prev.br = true;
                // (two centred lines, the upper one with room on its two sides for the next one's first word: no wrap — a
                // flyer's «زمان حضور: …» over «محل حضور: …», wider than the short-block rule above allows)
                else if (prev && right - left > 15 * L.size && [prev, L].every(function (X) { return X.x0 - left > 2 * X.size && right - X.x1 > 2 * X.size && Math.abs((X.x0 - left) - (right - X.x1)) < 1.5 * X.size; }) &&
                         (prev.x0 - left) + (right - prev.x1) > firstWord(L, rtlLine) + 1.5 * L.size) prev.br = true;
                // a line break kept — unless the next line's first word could not have fitted after it (a long URL wraps)
                else if (shortCol() && !prev.beside && right - left > 15 * L.size && !/[-\u00AD]$/.test(prev.glyphs.map(function (g) { return g.ch; }).join('').trim()) &&
                         !(firstWord(L, rtlLine) > (rtlLine ? prev.x0 - colEdge().l : colEdge().r - prev.x1) - 0.5 * L.size)) prev.br = true;
                cur.push(L); prev = L;
            });
            return groups;
        },

        /** A line (or segment) that opens with a bold label: bold text of 30 characters or fewer ending in a colon, then
         * text that is not bold (a field's value) — not a line bold throughout (a heading, a bold paragraph). */
        _boldLabel(X) {
            if (X._bl !== undefined) return X._bl;
            const gs = (X.strong.R > X.strong.L ? this._logical(X, true) : X.glyphs).filter(function (g) { return !g.atom; });
            let k = 0; while (k < gs.length && (gs[k].space || !gs[k].ch.trim())) k++;
            let n = 0, colon = -1;
            for (let i = k; i < gs.length && n <= 31; i++, n++) {
                if (/[:：]/.test(gs[i].ch)) { colon = i; break; }
                if (!gs[i].bold && !gs[i].space && !/^[\u200B-\u200F]+$/.test(gs[i].ch || '')) break;   // (a ZWNJ the shapes put back has no style)
            }
            const rest = colon >= 0 ? gs.slice(colon + 1).filter(function (g) { return !g.space && g.ch.trim(); }) : [];
            return (X._bl = colon > k && rest.length > 0 && rest.some(function (g) { return !g.bold; }));
        },

        /** A table of contents' line: dot leaders (or …, ___) running to a page number at the line's end. */
        _leaderLine(X) {
            if (!X || !X.glyphs) return false;
            if (X.leader === undefined) {
                const t = X.glyphs.filter(function (g) { return !g.atom; }).map(function (g) { return g.ch || ''; }).join('').replace(/[\u200B-\u200F]/g, '');
                const D = '[0-9\u06F0-\u06F9\u0660-\u0669]{1,4}', L = '(?:\\.\\s?){4,}|\u2026{2,}|_{5,}|(?:\u00B7\\s?){4,}';
                X.leader = new RegExp('^\\s*' + D + '\\s*(?:' + L + ')').test(t) || new RegExp('(?:' + L + ')\\s*' + D + '\\s*$').test(t);
            }
            return X.leader;
        },

        _textBlocks(lines, body, left, right, inBox) {
            if (!lines.length) return [];
            const self = this;
            if (!inBox && lines[0].qrun && lines.every(function (L) { return L.qrun === lines[0].qrun; })) {
                lines.forEach(function (L) { L.qrun = 0; });
                // (its right edge: as far in as its left one, unless its lines run further — a short quote's longest
                // line is no measure of where its lines end)
                // (right to left, mirrored: the lines start at the right, a nested quote is set in from the right edge, and
                // `_qx0`, the start the merge pass in order.js nests by, is −x1 — larger is deeper either way)
                const rtlQ = lines.reduce(function (s, L) { return s + L.strong.R - L.strong.L; }, 0) > 0;
                const qL = rtlQ ? Math.min(Math.min.apply(null, lines.map(function (L) { return L.x0; })), left + (right - Math.max.apply(null, lines.map(function (L) { return L.x1; }))))
                                : Math.min.apply(null, lines.map(function (L) { return L.x0; }));
                const qR = rtlQ ? Math.max.apply(null, lines.map(function (L) { return L.x1; }))
                                : Math.max(Math.max.apply(null, lines.map(function (L) { return L.x1; })), right - (qL - left));
                // a nested quote inside it set in further (2 em more), its lines one under the other: a part of its own,
                // tagged with its x0 so the merge pass nests it. Without a paragraph gap (indented paragraphs, `margin: 0`)
                // the inner quote's first line had run on from the outer one's, and the nesting was lost. A line set in
                // that runs to the quote's far side, the next one back at the quote's edge, is a first-line indent
                // (a quote set wholly in italic — a stylesheet's `blockquote { font-style: italic }` — is italic by its style,
                // not by markup: its words come back plain, as a heading's do)
                const ink = [].concat.apply([], lines.map(function (L) { return L.glyphs; })).filter(function (g) { return !g.atom && !g.space && g.ch && g.ch.trim(); });
                if (ink.length >= 12 && ink.every(function (g) { return g.italic; })) lines.forEach(function (L) { L.glyphs = L.glyphs.map(function (g) { return g.italic ? Object.assign({}, g, { italic: false }) : g; }); });
                const deep = function (L) { return rtlQ ? qR - L.x1 > 2 * body : L.x0 - qL > 2 * body; };
                const parts = [];
                lines.forEach(function (L, k) {
                    let d = deep(L);
                    const N = lines[k + 1];
                    if (d && !(parts.length && parts[parts.length - 1].deep) && N && !deep(N) && (rtlQ ? L.x0 - qL : qR - L.x1) < 1.5 * body) d = false;
                    if (!parts.length || parts[parts.length - 1].deep !== d) parts.push({ deep: d, lines: [] });
                    parts[parts.length - 1].lines.push(L);
                });
                const kids = [];
                parts.forEach(function (P) {
                    if (rtlQ) {
                        const x1 = Math.max.apply(null, P.lines.map(function (L) { return L.x1; }));
                        self._textBlocks(P.lines, body, qL, P.deep ? x1 : qR, true).forEach(function (c) { if (c._qx0 === undefined) c._qx0 = -(P.deep ? x1 : qR); kids.push(c); });
                        return;
                    }
                    const x0 = Math.min.apply(null, P.lines.map(function (L) { return L.x0; }));
                    self._textBlocks(P.lines, body, P.deep ? x0 : qL, qR, true).forEach(function (c) { if (c._qx0 === undefined) c._qx0 = P.deep ? x0 : qL; kids.push(c); });
                });
                // store x0 on the quote block so the merge pass can detect nested indentation
                return [{ type: 'quote', children: kids, _qx0: rtlQ ? -qR : qL }];
            }
            const M = this._metrics;
            const first = lines[0];
            // the structure tree's word on these lines (PDFIMPORT.md §8.4): when it is trusted and reaches them,
            // it tells a heading — and its level — from text, and splits a group the spacing ran together
            const tv = !inBox ? this._treeVote(lines) : null;
            if (tv && tv.split) return this._textBlocks(lines.slice(0, tv.split), body, left, right, inBox).concat(this._textBlocks(lines.slice(tv.split), body, left, right, inBox));
            if (tv && tv.heading) {
                const dir = this._blockDir(lines, left, right, true);
                lines.forEach(function (L) { L.br = false; });
                let hg = this._joinLines(lines, dir);
                // a heading set wholly in italic: the style's, not markup (pandoc's level 4)
                if (hg.every(function (x) { return x.atom || x.space || !x.ch || !x.ch.trim() || x.italic; })) hg = hg.map(function (x) { return Object.assign({}, x, { italic: false }); });
                return [{ type: 'heading', size: first.size, glyphs: hg, dir: dir, tree: true, level: tv.level }];
            }
            // a section's title band (order.js): a heading of its own
            if (!inBox && lines.length === 1 && first.band) {
                const dir = this._blockDir(lines, left, right, true);
                return [{ type: 'heading', size: first.size, minor: true, band: true, glyphs: this._joinLines(lines, dir), dir: dir }];
            }
            // (a contents entry, bold or large as its level is set, is no heading: the heading is where it points)
            const self0 = this, toc = lines.every(function (L) { return self0._leaderLine(L); });
            const allBold = !toc && lines.every(function (L) { return L.boldShare > 0.85; });
            // heading? A trusted tree's "text" vetoes only the weak signs below — a bold line of body size, a
            // heading family — not a larger size: a tree can mistag a title as P (LibreOffice from HTML does),
            // and a size is stronger evidence than a tag saying nothing
            const big = !toc && lines.every(function (L) { return L.size >= body * 1.4; });
            // (a heading starts at the column's start edge, or is centred: lines pushed to the far side — a letter's
            // signature, name over title, bold and a size up, at the left of a Persian page — are no heading, whatever
            // their face: they stay bold text. The start side's gap a fifth of the column or more, and two fifths more
            // than the far side's)
            const rtlH = lines.reduce(function (a, L) { return a + L.strong.R - L.strong.L; }, 0) > 0, colW = right - left;
            const startGap = rtlH ? right - Math.max.apply(null, lines.map(function (L) { return L.x1; })) : Math.min.apply(null, lines.map(function (L) { return L.x0; })) - left;
            const endGap = rtlH ? Math.min.apply(null, lines.map(function (L) { return L.x0; })) - left : right - Math.max.apply(null, lines.map(function (L) { return L.x1; }));
            const pushed = colW > 0 && startGap > 0.2 * colW && startGap - endGap > 0.4 * colW && !(this._startFlush < 0.6);
            // (a line that is a field — a label without digits, a colon, a value with a number or a list in it: «زمان حضور:
            // ساعت 6:30 …», «وسایل لازم : کفش مناسب، کلاه …» set large on a flyer — or that ends a sentence, is
            // emphasised text, not a heading: it stays a paragraph, its lines apart)
            const fieldLike = function (L) {
                const t = nfkcArabic(self._logical(L, L.strong.R > L.strong.L).map(function (g) { return g.atom ? '' : g.ch || ''; }).join('')).replace(/\s+/g, ' ').trim();
                const m = /^([^\d:：]{2,40}?)\s*[:：]\s*(\S.*)$/.exec(t);
                return !!m && (/[\d\u06F0-\u06F9\u0660-\u0669]/.test(m[2]) || /[،,]/.test(m[2]));
            };
            const lastT = nfkcArabic(this._logical(lines[lines.length - 1], lines[lines.length - 1].strong.R > lines[lines.length - 1].strong.L).map(function (g) { return g.atom ? '' : g.ch || ''; }).join('')).trim();
            const notHead = lines.some(fieldLike) || /[.!?؟]$/.test(lastT);
            if (!inBox && !pushed && !notHead && (allBold || big) && lines.length <= 3 && first.size > body + 0.4) {
                const dir = this._blockDir(lines, left, right, true);
                lines.forEach(function (L) { L.br = false; });
                return [{ type: 'heading', size: first.size, glyphs: this._joinLines(lines, dir), dir: dir, hl: lines }];
            }
            // an OCR layer knows no bold: a short line alone, set an eighth or more over the body, no sentence (a scanned
            // article's third-level headings, 13 pt over 11, read as paragraphs)
            if (this._ocr && !inBox && !toc && !pushed && lines.length === 1 && first.size >= body * 1.15 && !first.marker && !first.num && (first.x1 - first.x0) < (right - left) * 0.75) {
                const dir = this._blockDir(lines, left, right, true), g = this._joinLines(lines, dir);
                const t = g.map(function (x) { return x.ch || ''; }).join('').trim();
                if (t.length <= 80 && !/[.:;,!?؛،]$/.test(t)) return [{ type: 'heading', size: first.size, glyphs: g, dir: dir, hl: lines }];
            }
            // (a cell of a row is no heading: a borderless table's bold header row, its cells side by side — once the bold of
            // a variable font was read, round 26, «السنة», «الإنتاج (م³)» … came back as four headings)
            if (!(tv && tv.text) && !inBox && !pushed && allBold && lines.length === 1 && !first.rowCell && Math.abs(first.size - body) <= 0.6 && (first.x1 - first.x0) < (right - left) * 0.75) {
                const g = this._joinLines(lines, this._blockDir(lines, left, right, true));
                const t = g.map(function (x) { return x.ch || ''; }).join('');
                // (nor one that ends in a comma: a quote's first line, «« بهره‌گیری از … بخش‌ها،», runs on)
                if (!/[:：؛.،,]$/.test(t.trim())) return [{ type: 'heading', size: first.size, minor: true, italic: first.italicShare > 0.5, glyphs: g, dir: this._blockDir(lines, left, right, true) }];
            }
            // a short line at body size in a heading family that is not the body's (headings set in their own font)
            const F = this._fam;
            if (!(tv && tv.text) && !toc && !inBox && !pushed && F && F.heads.length && lines.length === 1 && Math.abs(first.size - body) <= 0.6 && !first.marker && !first.num && !first.beside &&
                (first.x1 - first.x0) < (right - left) * 0.6) {
                const gs = first.glyphs.filter(function (g) { return !g.space && !g.atom; });
                const f = gs.length && F.of(gs[0].font);
                if (f && F.heads.indexOf(f) >= 0 && gs.every(function (g) { return F.of(g.font) === f; })) {
                    const g = this._joinLines(lines, this._blockDir(lines, left, right, true));
                    const t = g.map(function (x) { return x.ch || ''; }).join('').trim();
                    if (t.length <= 60 && !/[.:;,!?؛،]$/.test(t)) return [{ type: 'heading', size: first.size, minor: true, family: true, glyphs: g.map(function (x) { return Object.assign({}, x, { italic: false }); }), dir: this._blockDir(lines, left, right, true) }];
                }
            }
            // list?
            if (first.marker) {
                const dir = first.marker.side === 'right' ? 'rtl' : 'ltr';
                const indent = dir === 'rtl' ? right - first.marker.x : first.marker.x - left;
                const num = first.num;
                // (the item's own text read in its own direction: a Latin item of a right-to-left list was laid out
                // left to right — «…/item/12» + «3456?page=…», not «(page=…?3456»)
                const latin = dir === 'rtl' && lines.every(function (L) { return !L.strong.R; }) && lines.some(function (L) { return L.strong.L > 0; });
                const glyphs = this._joinLines(num && num.glyph ? [Object.assign({}, lines[0], { glyphs: lines[0].glyphs.filter(function (g) { return g !== num.glyph; }) })].concat(lines.slice(1)) : lines, latin ? 'ltr' : dir);
                if (num && !num.glyph) { // drop "1. "
                    let k = 0, seen = 0; while (k < glyphs.length && seen < num.text.length) { seen += (glyphs[k].ch || ' ').length; k++; }
                    glyphs.splice(0, k);
                }
                // a checkbox typed after the bullet ("• ☑ done": Kelk's .docx task items)
                let task = first.marker.task || !!(num && num.task), checked = first.marker.checked || !!(num && num.checked);
                let k0 = 0; while (k0 < glyphs.length && glyphs[k0].space) k0++;
                const box = glyphs[k0] && /^[☐☑☒✅⬜]️?$/.test(glyphs[k0].ch || '');
                if (box && !task) {
                    task = true; checked = !/^[☐⬜]/.test(glyphs[k0].ch);
                    let k1 = k0 + 1; while (k1 < glyphs.length && glyphs[k1].space) k1++;
                    glyphs.splice(0, k1);
                }
                return [{ type: 'li', ordered: !!num && !num.bullet && !task, start: num ? parseInt(num.n.replace(/[\u06F0-\u06F9]/g, function (d) { return d.charCodeAt(0) - 0x06F0; }).replace(/[\u0660-\u0669]/g, function (d) { return d.charCodeAt(0) - 0x0660; }), 10) : 1,
                          indent: indent, glyphs: glyphs, dir: dir, lines: lines, task: task, checked: checked }];
            }
            const dir = this._blockDir(lines, left, right, true);
            // continuation of a list item: indented like the item text (handled in _toHtml by indent)
            const indentR = right - Math.max.apply(null, lines.map(function (L) { return L.x1; }));
            const indentL = Math.min.apply(null, lines.map(function (L) { return L.x0; })) - left;
            return [{ type: 'p', glyphs: this._joinLines(lines, dir), dir: dir, lines: lines,
                      indent: dir === 'rtl' ? indentR : indentL, fullLast: Math.abs(lines[lines.length - 1].x1 - right) < 3 && Math.abs(lines[lines.length - 1].x0 - left) < 3 }];
        },

        _joinAcrossPages(blocks) {
            const out = [], self = this, this_body = (this._metrics && this._metrics.body) || 10;
            const slides = /PowerPoint|\bImpress\b|Keynote/i.test(this._producer || '');
            // a rule at a page's edge right next to a box (a frame's border cut by the page break) is the box's
            const boxy = function (b) { return b && (b.type === 'code' || b.type === 'quote' || b.type === 'table'); };
            blocks = blocks.filter(function (b, i) {
                if (b.type !== 'hr') return true;
                if (b.pageEnd && boxy(blocks[i - 1])) { if (blocks[i - 1]) blocks[i - 1].pageEnd = true; return false; }
                if (b.pageStart && boxy(blocks[i + 1])) { if (blocks[i + 1]) blocks[i + 1].pageStart = true; return false; }
                return true;
            });
            const cellText = function (r) { return r.map(function (c) { return c.map(function (g) { return g.ch || ''; }).join('').replace(/\s+/g, ' ').trim(); }).join('|'); };
            // glyph runs cut at a borderless table's gutters (another page's: they show its columns there) →
            // rows of cells; groups on one baseline make one row. null when a run does not follow the columns
            // (a word cut by a column's start) or a row fills fewer than `need` cells
            const cutRows = function (groups, gut, need) {
                const nc = gut.length + 1, rows = [];
                let lastY = null;
                for (let i = 0; i < groups.length; i++) {
                    const G = groups[i];
                    if (lastY === null || Math.abs(G.y - lastY) > 0.4 * G.size) { const cs = []; for (let c = 0; c < nc; c++) cs.push([]); rows.push(cs); }
                    lastY = G.y;
                    const cells = rows[rows.length - 1];
                    let ink = null, inkC = -1, bad = false;
                    G.glyphs.forEach(function (g) {
                        // (a space Kelk put in when joining lines has no place: it goes with the text before it)
                        let c = inkC < 0 ? 0 : inkC;
                        if (typeof g.x === 'number') {
                            // a column starts where its gutter ends (a longer cell here may run into the gutter)
                            const cx = g.x + (g.w || 0) / 2;
                            c = 0; while (c < gut.length && cx > gut[c][1] - 0.5) c++;
                        }
                        if (!g.space) {
                            if (ink && c !== inkC && (typeof g.x !== 'number' || g.x - (ink.x + (ink.w || 0)) < 0.2 * (g.size || G.size))) bad = true;
                            ink = g; inkC = c;
                        }
                        if (g.space && !cells[c].length) return;
                        if (cells[c].length && !cells[c][cells[c].length - 1].space && cells[c].lastG !== G) cells[c].push({ ch: ' ', space: true });
                        cells[c].push(g); cells[c].lastG = G;
                    });
                    if (bad) return null;
                }
                const done = [];
                for (let i = 0; i < rows.length; i++) {
                    const cs = rows[i].map(function (c) { while (c.length && c[c.length - 1].space) c.pop(); return c; });
                    const filled = cs.filter(function (c) { return c.length; }).length;
                    if (!cs[0].length && done.length) {        // a cell that wraps: the rest of the row above
                        const up = done[done.length - 1];
                        cs.forEach(function (c, j) { if (c.length) up[j] = up[j].length ? up[j].concat([{ ch: ' ', space: true }], c) : c; });
                        continue;
                    }
                    if (filled < need) return null;
                    done.push(cs);
                }
                return done.length ? done : null;
            };
            const lineGroups = function (ps) {
                const ls = [];
                ps.forEach(function (p) { p.lines.forEach(function (L) { ls.push({ y: L.y, size: L.size, x0: L.x0, glyphs: L.glyphs }); }); });
                return ls.sort(function (a, c) { return c.y - a.y || a.x0 - c.x0; });
            };
            // the rows of a borderless table left on a page with too few rows to show its columns (a header and a
            // row or two: their lines come out as paragraphs) — the part on the next page repeats the header and
            // shows the gutters: the lines between are cut at them
            const recut = function (b) {
                if (b.type !== 'table' || !b.pageStart || !b.gutters || !b.gutters.length || b.rtl || b.rows.length < 3) return;
                let k = out.length - 1;
                while (k >= 0 && out.length - 1 - k < 4 && out[k].type === 'p' && out[k].lines) k--;
                const T = out[k];
                if (k === out.length - 1 || !T || T.type !== 'table' || T.rtl || !out[out.length - 1].pageEnd) return;
                if (T.rows[0].length !== b.rows[0].length || b.rows[0].length !== b.gutters.length + 1 || cellText(T.rows[0]) !== cellText(b.rows[0])) return;
                const done = cutRows(lineGroups(out.slice(k + 1)), b.gutters, 2);
                if (!done) return;
                out.splice(k + 1);
                T.rows = T.rows.concat(done); T.pageEnd = true;
            };
            // the other way round: the last row or two of a table alone at the top of the next page (as a narrower
            // table — its first cells run together — or as a paragraph) are cut at the gutters of the part before
            const tailCut = function (prev, b) {
                if (prev.type !== 'table' || prev.rtl || !prev.gutters || !prev.gutters.length || prev.rows[0].length !== prev.gutters.length + 1 || prev.rows.length < 3) return null;
                const nc = prev.gutters.length + 1;
                let groups = null;
                if (b.type === 'table' && !b.rtl && b.rows.length <= 3 && b.rows[0].length < nc) {
                    groups = b.rows.map(function (r, i) {
                        const gs = [];
                        r.forEach(function (c) { if (gs.length && c.length) gs.push({ ch: ' ', space: true }); c.forEach(function (g) { gs.push(g); }); });
                        return { y: -1000 * i, size: this_body, glyphs: gs };
                    });
                } else if (b.type === 'p' && b.lines && b.lines.length <= 3) groups = lineGroups([b]);
                if (!groups) return null;
                // (most cells filled, each a few words: a paragraph that happens to fit the columns is no row)
                const rows = cutRows(groups, prev.gutters, Math.max(2, Math.ceil(0.6 * nc)));
                if (!rows || rows.some(function (r) { return r.some(function (c) { return c.filter(function (g) { return g.space; }).length > 4; }); })) return null;
                return rows;
            };
            const plainOf = function (x) { return (x.glyphs || []).map(function (g) { return g.ch || ''; }).join('').trim(); };
            const isCaption = function (x) { return x && x.type === 'p' && x.lines && x.lines.length && x.lines.every(function (L) { return L.caption; }); };
            // footnotes (Word's, a report's): the blocks that close a page, set 1.5 pt or more under the body's size, each
            // opened by its mark («¹ …», «2 …», «* …») — with body text above them on the page. They are the page's notes,
            // not its last text: the paragraph before them is the one the page break cut, and it runs on to the next
            // page past them (they stood between its halves, and the halves were never joined). They come after the
            // block they would have interrupted, in their order
            const noteText = function (x) { return plainOf(x).replace(/^[\u200E\u200F\u202A-\u202E]+/, ''); };
            const isNote = function (x) {
                // (or under Word's separator rule: order.js marks those lines `note`, mark or none)
                if (x && x.type === 'p' && x.lines && x.lines.length && x.lines.every(function (L) { return L.note; })) return true;
                return x && x.type === 'p' && x.lines && x.lines.length && x.lines.every(function (L) { return L.size <= this_body - 1.5 && L.size >= 0.5 * this_body; }) &&
                    /^([\u00B9\u00B2\u00B3\u2070-\u2079\u2071\u1D5B\u02E3]+|[0-9\u06F0-\u06F9\u0660-\u0669]{1,2}[.)]?|[*\u2020\u2021])\s/.test(noteText(x));
            };
            (function () {
                const pageOf = function (x) { return x.lines && x.lines.length ? x.lines[0].page : x.page; };
                for (let i = blocks.length - 1; i >= 0; i--) {
                    if (!blocks[i].pageEnd) continue;
                    const pg = pageOf(blocks[i]);
                    let k = i;
                    while (k >= 0 && pageOf(blocks[k]) === pg && isNote(blocks[k])) k--;
                    if (k === i || k < 0 || pageOf(blocks[k]) !== pg || isNote(blocks[k])) continue;
                    for (let j = k + 1; j <= i; j++) { blocks[j].note = true; blocks[j].pageEnd = false; }
                    blocks[k].pageEnd = true;
                }
            })();
            // a title page (the first of several, a handful of short blocks, pictures and rules, no running text): its title is the
            // heading; a smaller line set as one after the cover's text has begun — a report's «تهیه کننده: …», its
            // holder's title, in bold white on the cover's band — is the cover's text, not a section's heading (it came back
            // `###` or `####`, a section with nothing in it)
            (function () {
                // (the first page: up to the block that ends it — tables and figures carry no lines to tell their page by)
                const end = blocks.findIndex(function (x) { return x.pageEnd; });
                if (end < 0 || end === blocks.length - 1) return;
                const first = blocks.slice(0, end + 1);
                if (first.length < 3 || first.length > 12 || !first.every(function (x) { return x.type === 'hr' || x.type === 'figure' || (x.type === 'heading' || x.type === 'p') && (x.lines || x.hl || []).length <= 2; })) return;
                const hs = first.filter(function (x) { return x.type === 'heading'; });
                if (hs.length < 2) return;
                const top = Math.max.apply(null, hs.map(function (h) { return h.size || 0; }));
                // (only after the cover's text has begun: a subtitle set as a heading right under the title stays one)
                const textAt = first.findIndex(function (x) { return x.type === 'p'; });
                hs.forEach(function (h) {
                    if (!(h.size < top - 0.5) || textAt < 0 || first.indexOf(h) < textAt) return;
                    h.type = 'p'; h.lines = h.hl || h.lines || []; h.indent = 0; delete h.level; delete h.minor;
                });
            })();
            const notes = [];
            const flushNotes = function () { while (notes.length) out.push(notes.shift()); };
            blocks.forEach(function (b) {
                if (b.note) { notes.push(b); return; }
                if (notes.length && !b.pageStart) flushNotes();
                recut(b);
                // a paragraph that runs over the page break past a figure's caption at the foot of the page (the figure
                // floats beside it, its caption the page's last line): the paragraph goes on, the caption after it
                const cap = out[out.length - 1];
                let mk = out.length - 1; while (mk >= 0 && (isCaption(out[mk]) || out[mk].type === 'figure')) mk--;
                const main = out[mk];
                if (b.pageStart && b.type === 'p' && isCaption(cap) && cap.pageEnd && main && main.type === 'p' && main.dir === b.dir &&
                    !/[.!?:;\u061F\u06D4)\]"\u201D]$/.test(plainOf(main)) && goesOn(plainOf(b))) {
                    main.glyphs = main.glyphs.concat([{ ch: ' ', space: true }], b.glyphs);
                    cap.pageEnd = b.pageEnd; return;
                }
                const prev = out[out.length - 1];
                // a table that goes on in the next column of the same page, its header row repeated there (Chrome
                // repeats <thead> at each column break as at each page break): one table, the repeat dropped. The
                // repeated header is the evidence — two tables that merely follow one another stay two
                if (prev && !(b.pageStart && prev.pageEnd) && prev.type === 'table' && b.type === 'table' && prev.rows.length && b.rows.length > 1 &&
                    prev.rtl === b.rtl && prev.rows[0].length === b.rows[0].length && prev.rows[0].length >= 2) {
                    const rowText = function (r) { return r.map(function (c) { return c.map(function (g) { return g.ch || ''; }).join('').replace(/\s+/g, ' ').trim(); }).join('|'); };
                    if (rowText(b.rows[0]) === rowText(prev.rows[0]) && rowText(b.rows[0]).replace(/\|/g, '').length) {
                        prev.rows = prev.rows.concat(b.rows.slice(1)); prev.pageEnd = b.pageEnd; prev.rowYs = (prev.rowYs || []).concat(b.rowYs || []); return;
                    }
                }
                // (a slide deck's pages are its slides: nothing runs on from one to the next — an agenda's last item took the
                // next slide's title, «… داخلی واحدها پیش دستور»)
                if (prev && b.pageStart && prev.pageEnd && !slides) {
                    if (prev.type === 'code' && b.type === 'code' && !b.lang) { prev.lines = prev.lines.concat(b.lines); prev.pageEnd = b.pageEnd; return; }
                    // a code block whose first line(s) stayed on the previous page
                    const monoP = function (x) { return x.type === 'p' && x.lines && x.lines.every(function (L) { return L.monoShare > 0.9; }); };
                    if (b.type === 'code' && !b.lang && monoP(prev)) {
                        const head = self._codeBlock({ lines: prev.lines, box: { x1: Math.max.apply(null, prev.lines.map(function (L) { return L.x1; })) } });
                        prev.type = 'code'; prev.lang = head.lang; prev.lines = head.lines.concat(b.lines); prev.wrapX = head.wrapX; prev.pageEnd = b.pageEnd; return;
                    }
                    if (prev.type === 'code' && monoP(b)) {
                        const tail = self._codeBlock({ lines: b.lines, box: { x1: Math.max.apply(null, b.lines.map(function (L) { return L.x1; })) } });
                        prev.lines = prev.lines.concat(tail.lines); prev.pageEnd = b.pageEnd; return;
                    }
                    const tail = tailCut(prev, b);
                    if (tail) { prev.rows = prev.rows.concat(tail); prev.pageEnd = b.pageEnd; return; }
                    // a table that goes on on the next page (its header row often repeated there: dropped)
                    if (prev.type === 'table' && b.type === 'table' && prev.rows.length && b.rows.length && prev.rtl === b.rtl) {
                        const rowText = function (r) { return r.map(function (c) { return c.map(function (g) { return g.ch || ''; }).join('').replace(/\s+/g, ' ').trim(); }).join('|'); };
                        const near = function (a, c, tol) { return a && c && a.length === c.length && a.every(function (v, k) { return Math.abs(v - c[k]) <= tol; }); };
                        const inner = function (a) { return a ? a.slice(1, -1) : a; };   // the outer edges of a borderless table are its text's
                        const repeat = prev.rows[0].length === b.rows[0].length && rowText(b.rows[0]) === rowText(prev.rows[0]);
                        // (borderless parts: their gutters — the free bands between the columns — overlap one by one)
                        const sameGutters = prev.gutters && b.gutters && prev.gutters.length && prev.gutters.length === b.gutters.length &&
                            prev.gutters.every(function (g, k) { const h = b.gutters[k]; return Math.min(g[1], h[1]) - Math.max(g[0], h[0]) > -1; });
                        const sameCols = prev.rows[0].length === b.rows[0].length && (sameGutters || near(inner(prev.cols), inner(b.cols), prev.ruled && b.ruled ? 2 : 0.6 * this_body));
                        // down: the same columns (the header row repeated on the new page, or not)
                        if (repeat || sameCols) {
                            const more = repeat ? b.rows.slice(1) : b.rows.slice();
                            // a row cut by the page break: rows with an empty first cell at the top of the new page are
                            // the rest of the last row's cells (the first column is the row's key, never left empty)
                            const last = prev.rows[prev.rows.length - 1];
                            const keyCol = prev.rtl ? last.length - 1 : 0;
                            while (more.length && more[0].length === last.length && !more[0][keyCol].length && more[0].some(function (c) { return c.length; })) {
                                more.shift().forEach(function (c, k) { if (c.length) last[k] = last[k].length ? last[k].concat([{ ch: ' ', space: true }], c) : c; });
                            }
                            prev.rows = prev.rows.concat(more); prev.pageEnd = b.pageEnd;
                            if (sameGutters) prev.gutters = prev.gutters.map(function (g, k) { return [Math.max(g[0], b.gutters[k][0]), Math.min(g[1], b.gutters[k][1])]; });
                            prev.rowYs = (prev.rowYs || []).concat(b.rowYs || []); return;
                        }
                        // over: the columns that did not fit (a wide sheet printed down, then over) — the same rows, at the same heights
                        if (prev.rows.length === b.rows.length && near(prev.rowYs, b.rowYs, 2)) {
                            const rtlT = prev.rtl;
                            prev.rows = prev.rows.map(function (r, k) { return rtlT ? b.rows[k].concat(r) : r.concat(b.rows[k]); });
                            prev.align = rtlT ? (b.align || []).concat(prev.align || []) : (prev.align || []).concat(b.align || []);
                            prev.cols = null; prev.pageEnd = b.pageEnd; return;
                        }
                    }
                    if (prev.type === 'quote' && b.type === 'quote') { prev.children = prev.children.concat(b.children); prev.pageEnd = b.pageEnd; return; }
                    // (ragged text: the last line need not be full when no sentence ends there and the next page goes on in lower case)
                    const plain = function (x) { return x.glyphs.map(function (g) { return g.ch || ''; }).join('').trim(); };
                    const runsOn = prev.type === 'p' && b.type === 'p' && !/[.!?:;\u061B\u061F\u06D4)\]"\u201D]$/.test(plain(prev)) && goesOn(plain(b));
                    // (a table of contents' line — a leader to its page number — is a line of its own on either side of the
                    // break: a verso's last entry ran into the recto's first, «… 163 Access, Privacy …»)
                    const tocEdge = (prev.lines && prev.lines.length && self._leaderLine(prev.lines[prev.lines.length - 1])) || (b.lines && b.lines.length && self._leaderLine(b.lines[0]));
                    if (prev.type === 'p' && b.type === 'p' && (prev.fullLast || runsOn) && prev.dir === b.dir && !tocEdge) {
                        prev.glyphs = prev.glyphs.concat([{ ch: ' ', space: true }], b.glyphs); prev.pageEnd = b.pageEnd; return;
                    }
                    if (prev.type === 'li' && b.type === 'p' && b.indent > 6 && b.indent <= (prev.indent || 0) + 60) { prev.glyphs = prev.glyphs.concat([{ ch: ' ', space: true }], b.glyphs); return; }
                }
                // a paragraph that runs on from the foot of one column to the head of the next (same page):
                // the last line is full, the next column starts higher up, to the right, in lower case
                if (prev && prev.type === 'p' && b.type === 'p' && prev.fullLast && prev.dir === b.dir && prev.lines && b.lines &&
                    !self._leaderLine(prev.lines[prev.lines.length - 1]) && !(b.lines[0] && self._leaderLine(b.lines[0]))) {
                    const a = prev.lines[prev.lines.length - 1], c = b.lines[0];
                    const first = (b.glyphs.filter(function (g) { return g.ch && /\S/.test(g.ch); })[0] || {}).ch || '';
                    const next = b.dir === 'rtl' ? c.x1 < a.x0 + 1 : c.x0 > a.x1 - 1;
                    // (a column's foot and head hold text: two short lines side by side — a letter's addressee and its
                    // «confidential» mark at the other margin — are no columns)
                    if (a.page === c.page && next && c.y > a.y + a.size && goesOn(first) && (prev.lines.length >= 3 || b.lines.length >= 2)) {
                        prev.glyphs = prev.glyphs.concat([{ ch: ' ', space: true }], b.glyphs); prev.lines = prev.lines.concat(b.lines);
                        prev.fullLast = b.fullLast; prev.pageEnd = b.pageEnd; return;
                    }
                }
                flushNotes();
                out.push(b);
            });
            flushNotes();
            // a code block's label drawn in a bar of its own (a framed table in Word: the bar is a row): the one-line block
            // holding just a language name, right before a code block without one
            for (let i = out.length - 2; i >= 0; i--) {
                const a = out[i], b = out[i + 1];
                if (a.type === 'code' && b.type === 'code' && !a.lang && !b.lang && a.lines.length === 1 && /^[\w+#.-]{1,24}$/.test(a.lines[0].trim())) {
                    b.lang = a.lines[0].trim() === 'code' ? '' : a.lines[0].trim(); out.splice(i, 1);
                }
            }
            // a strip of tabs or menu links on one baseline (a site's sub-navigation: «خانه · خدمات · تماس …»),
            // read as a column each and so a paragraph each: one line again, its items apart
            for (let i = 0; i + 2 < out.length; i++) {
                const one = function (b) {
                    const ls = b && (b.type === 'p' || b.type === 'heading') ? (b.lines || b.hl) : null;
                    if (!ls || ls.length !== 1 || typeof ls[0] !== 'object') return null;
                    const t = b.glyphs.map(function (g) { return g.ch || ''; }).join('').trim();
                    return t && t.split(/\s+/).length <= 4 ? ls[0] : null;
                };
                const L0 = one(out[i]); if (!L0) continue;
                let j = i + 1;
                while (j < out.length) { const L = one(out[j]); if (!L || L.page !== L0.page || Math.abs(L.y - L0.y) > 0.3 * L0.size || Math.abs(L.size - L0.size) > 1.5) break; j++; }
                if (j - i < 3) continue;
                const run = out.slice(i, j);
                const glyphs = [];
                run.forEach(function (b, k) { if (k) glyphs.push({ ch: ' ', space: true }, { ch: '·' }, { ch: ' ', space: true }); b.glyphs.forEach(function (g) { glyphs.push(b.type === 'heading' ? Object.assign({}, g, { bold: false }) : g); }); });
                out.splice(i, j - i, { type: 'p', glyphs: glyphs, dir: out[i].dir, lines: run.map(function (b) { return (b.lines || b.hl)[0]; }), page: L0.page });
            }
            // a heading cut in two by the reading order (a web page's three-line title, its words set far apart, read as
            // two regions): the next heading of its size on the next line below, starting where it starts, with no
            // sentence end between — one heading
            for (let i = out.length - 2; i >= 0; i--) {
                const a = out[i], b = out[i + 1];
                if (a.type !== 'heading' || b.type !== 'heading' || !a.hl || !b.hl || a.dir !== b.dir || Math.abs(a.size - b.size) > 0.5) continue;
                const la = a.hl[a.hl.length - 1], lb = b.hl[0];
                if (la.page !== lb.page || la.y - lb.y <= 0 || la.y - lb.y > 1.6 * a.size) continue;
                const start = a.dir === 'rtl' ? Math.abs(Math.max.apply(null, a.hl.map(function (L) { return L.x1; })) - lb.x1) : Math.abs(Math.min.apply(null, a.hl.map(function (L) { return L.x0; })) - lb.x0);
                const ta = a.glyphs.map(function (g) { return g.ch || ''; }).join('').trim();
                if (start > 0.5 * a.size || /[.:;!?؛؟]$/.test(ta)) continue;
                a.glyphs = a.glyphs.concat([{ ch: ' ', space: true }], b.glyphs); a.hl = a.hl.concat(b.hl);
                out.splice(i + 1, 1);
            }
            // a rule under a heading (its underline, often drawn twice) is the heading's style
            for (let i = out.length - 1; i > 0; i--) {
                if (out[i].type === 'hr' && (out[i - 1].type === 'heading' || out[i - 1].type === 'hr')) out.splice(i, 1);
            }
            // a paragraph broken by a float it wraps around (figure, its caption): "… in" [figure] [caption] "that …"
            const text = function (b) { return b.glyphs.map(function (g) { return g.ch || ''; }).join('').trim(); };
            for (let i = 0; i + 2 < out.length; i++) {
                const a = out[i];
                if (a.type !== 'p' || !out[i + 1] || out[i + 1].type !== 'figure') continue;
                let k = i + 1;
                while (out[k] && out[k].type === 'figure') {
                    k++;
                    // the caption
                    if (out[k] && out[k].type === 'p' && out[k + 1] && (out[k + 1].type === 'p' || out[k + 1].type === 'figure') && !/^\p{Ll}/u.test(text(out[k]))) k++;
                }
                const b = out[k];
                if (!b || b.type !== 'p' || b.dir !== a.dir || /[.!?:\u061F\u06D4\u201D"\]]$/.test(text(a)) || !goesOn(text(b))) continue;
                // (a short last line ends its paragraph — one wrapped round a float fills its line; and a line that opens
                // with a bold label or a clause's number begins its own: «مرحله 6: … (…)» [diagram] [caption] «ماده 4- …»)
                // (a float it wraps round stands beside its lines; a figure under a line and over the next paragraph breaks
                // nothing, unless the line above it is full — reaches the far side the next paragraph's first line does)
                const fb = out[i + 1].bb, La = a.lines && a.lines[a.lines.length - 1], Lb = b.lines && b.lines[0];
                if (fb && La && Lb && typeof La === 'object' && typeof Lb === 'object') {
                    const beside = [La, Lb].some(function (L) { return L.y > fb.y0 && L.y < fb.y1 && (L.x1 < fb.x0 + 1 || L.x0 > fb.x1 - 1); });
                    const full = a.dir === 'rtl' ? La.x0 - Lb.x0 < 1.5 * La.size : Lb.x1 - La.x1 < 1.5 * La.size;
                    if (!beside && !full) continue;
                }
                a.glyphs = a.glyphs.concat([{ ch: ' ', space: true }], b.glyphs); a.lines = (a.lines || []).concat(b.lines || []);
                a.fullLast = b.fullLast; a.pageEnd = b.pageEnd;
                out.splice(k, 1);
            }
            // a paragraph broken by a sidebar read between its parts (a news page: the article's paragraph beside the
            // sidebar's end, «… about» [Popular Reads …] «the risk of …»): the next paragraph in the same column, in
            // lower case, with every block between standing wholly outside that column
            const colOf = function (b) {
                if (b.type === 'figure' && b.bb) return { x0: b.bb.x0, x1: b.bb.x1, page: null };      // (a thumbnail: its page is the run's)
                const ls = b.lines || b.hl; if (!ls || !ls.length || typeof ls[0] !== 'object') return null;
                return { x0: Math.min.apply(null, ls.map(function (L) { return L.x0; })), x1: Math.max.apply(null, ls.map(function (L) { return L.x1; })), page: ls[0].page };
            };
            for (let i = 0; i + 2 < out.length; i++) {
                const a = out[i];
                if (a.type !== 'p' || /[.!?:\u061F\u06D4\u201D"\]]$/.test(text(a))) continue;
                const ca = colOf(a); if (!ca) continue;
                let k = i + 1, ok = true;
                while (k < out.length && k <= i + 30) {
                    const c = out[k], cc = colOf(c);
                    if (c.type === 'p' && cc && Math.abs(cc.x0 - ca.x0) < 2 && cc.page === ca.page) break;
                    if (!cc || (cc.page !== null && cc.page !== ca.page) || !(cc.x0 >= ca.x1 - 1 || cc.x1 <= ca.x0 + 1)) { ok = false; break; }
                    k++;
                }
                const b = out[k];
                if (!ok || k === i + 1 || !b || b.dir !== a.dir || !goesOn(text(b))) continue;
                // (its lines below the sidebar end where the column does: wraps, not the breaks a wider region read)
                const brs = (b.lines || []).slice(0, -1).filter(function (L) { return L.br; });
                let q = 0;
                const width = ca.x1 - ca.x0;
                b.glyphs = b.glyphs.map(function (g) {
                    if (!g.br) return g;
                    const L = brs[q++];
                    if (L && (a.dir === 'rtl' ? L.x0 <= ca.x0 + 0.15 * width : L.x1 >= ca.x1 - 0.15 * width)) { L.br = false; return { ch: ' ', space: true }; }
                    return g;
                });
                a.glyphs = a.glyphs.concat([{ ch: ' ', space: true }], b.glyphs); a.lines = a.lines.concat(b.lines);
                a.fullLast = b.fullLast; a.pageEnd = b.pageEnd;
                out.splice(k, 1);
            }
            // quote whose first paragraph continues the previous page's last paragraph
            out.forEach(function (b) {
                if (b.type !== 'quote') return;
                const ch = b.children, merged = [];
                ch.forEach(function (c) {
                    const pr = merged[merged.length - 1];
                    if (pr && pr.type === 'p' && c.type === 'p' && pr.fullLast && c.pageStart) pr.glyphs = pr.glyphs.concat([{ ch: ' ', space: true }], c.glyphs);
                    else merged.push(c);
                });
                b.children = merged;
            });
            // a one-row ruled table (the last row of a table, ruled alone on the next page) that joined no table: its
            // cells are paragraphs, in their order — a row of boxes is no table of its own
            for (let i = out.length - 1; i >= 0; i--) {
                const b = out[i];
                if (b.type !== 'table' || !b.oneRow || b.rows.length !== 1) continue;
                const ps = b.rows[0].filter(function (c) { return c.some(function (g) { return g && !g.space && g.ch && g.ch.trim(); }); })
                    .map(function (c) { return { type: 'p', glyphs: c, dir: b.rtl ? 'rtl' : 'ltr', pageStart: b.pageStart, pageEnd: b.pageEnd }; });
                out.splice.apply(out, [i, 1].concat(ps));
            }
            return out;
        },

        // ── 6. HTML ────────────────────────────────────────────────────
        _inline(glyphs, links) {
            glyphs = this._writeOut(glyphs);
            // (a mark of punctuation between bold glyphs, set in another face — «۱» bold, «)» regular, «خدمات» bold in a Word
            // table's cell — is of their run: it split «**1**) **خدمات …**»)
            glyphs = glyphs.map(function (g, i) {
                if (!g || g.bold || g.space || g.atom || !g.ch || /[\p{L}\p{N}]/u.test(g.ch)) return g;
                // (touching the bold glyph before it: «**Format** (**PDF**)» keeps its bracket plain)
                const a = i - 1;
                let b = i + 1;
                while (b < glyphs.length && glyphs[b] && glyphs[b].space) b++;
                return glyphs[a] && glyphs[b] && glyphs[a].bold && glyphs[b].bold && !glyphs[a].atom && !glyphs[b].atom ? Object.assign({}, g, { bold: true }) : g;
            });
            const self = this;
            // (a glyph drawn on a cover takes only a link that lies on that cover — a banner's own link)
            const onCover = function (l, c) { return !c || l.x0 >= c.x0 - 1 && l.x1 <= c.x1 + 1 && l.y0 >= c.y0 - 1 && l.y1 <= c.y1 + 1; };
            const linkOf = function (g) { return g && g.x !== undefined && (links || []).filter(function (l) { return l.page === g.page && inside(l, g.x + g.w / 2, g.y + g.size * 0.3, 1) && onCover(l, g.cover); })[0]; };
            // a line wrap inside a URL shown as a link's text is no space: the browser broke the address where it
            // had to («…/~notes/Top ics…»); the two halves joined are part of the link's own address
            if (links && links.length && glyphs.some(function (g) { return g.wrap; })) {
                const flat = function (u) { try { u = decodeURI(u); } catch (e) { } return u.replace(/%7E/gi, '~'); };
                glyphs = glyphs.filter(function (g, i) {
                    if (!g.wrap) return true;
                    const a = linkOf(glyphs[i - 1]), b = linkOf(glyphs[i + 1]);
                    if (!a || !b || a.url !== b.url) return true;
                    let l = '', r = '';
                    for (let k = i - 1; k >= 0 && glyphs[k].ch && !/\s/.test(glyphs[k].ch); k--) l = glyphs[k].ch + l;
                    for (let k = i + 1; k < glyphs.length && glyphs[k].ch && !/\s/.test(glyphs[k].ch); k++) r += glyphs[k].ch;
                    l = l.replace(/^[(\[«"']+/, ''); r = r.replace(/[)\]».,;:"']+$/, '');
                    if (l.length < 3 || r.length < 1 || !/[\/.]/.test(l + r)) return true;
                    const u = flat(a.url), w = flat(l + r);
                    return !(u.indexOf(w) >= 0 || a.url.indexOf(l + r) >= 0);
                });
            }
            // runs first, written after: a styled run must survive Markdown (CommonMark's flanking rules) — one with no
            // letter or digit is no style at all (Word's bold full stop after a plain word, «بود**.**», came out as
            // the literal asterisks), and punctuation at a run's edge goes outside it where a letter or digit touches
            // it there («x**.y**» and «**y.**x» are literal too)
            const segs = [];                       // { text, run } | { html }
            let run = null, text = '';
            const flush = function () { if (run) segs.push({ text: text, run: run }); text = ''; run = null; };
            glyphs.forEach(function (g) {
                // (a formula Kelk wrote with its TeX: its placeholder, as the app's HTML has it — the Markdown writes $…$;
                // a space or a ZWNJ made from it, lines.js, is a copy of its fields: not the formula)
                if (g.math && !g.space && !g.zwnj) {
                    flush();
                    segs.push({ html: '<span class="kelk-math" data-display="' + (g.math.display ? 'block' : 'inline') + '" data-tex="' + esc(g.math.tex) + '"></span>' });
                    return;
                }
                if (g.atom) {
                    flush();
                    if (g.img) segs.push({ html: '<img src="' + g.img.src + '" alt="" width="' + g.img.width + '">' });
                    if (g.br) segs.push({ html: '<br>' });
                    return;
                }
                const link = linkOf(g);
                const key = { bold: !!g.bold && !g.space && !self._boldFace, italic: !!g.italic && !g.space, code: !!g.code && !g.space, strike: !!g.strike && !g.space, link: link ? link.url : null };
                if (g.space && run) { text += g.ch; return; }
                // a symbol (✓ → 😀) drawn by a fallback font keeps the run's style; punctuation does not
                if (run && !key.code && !run.code && key.link === run.link && key.strike === run.strike && !/[\p{L}\p{N}\p{P}]/u.test(g.ch)) { text += g.ch; return; }
                if (run && run.bold === key.bold && run.italic === key.italic && run.code === key.code && run.strike === key.strike && run.link === key.link) { text += g.ch; return; }
                // a trailing space belongs outside the styled run
                const m = text.match(/\s+$/);
                let trail = '';
                if (m) { trail = m[0]; text = text.slice(0, -trail.length); }
                flush();
                if (trail) segs.push({ text: trail, run: { bold: false, italic: false, code: false, strike: false, link: null } });
                run = key; text = g.ch;
            });
            flush();
            const emph = function (r) { return r && !r.code && (r.bold || r.italic || r.strike); };
            const plain = function (r) { return Object.assign({}, r, { bold: false, italic: false, strike: false }); };
            const WORD = /[\p{L}\p{N}]/u, EDGE = /^[\p{P}\p{S}]+/u, EDGE_END = /[\p{P}\p{S}]+$/u;
            for (let i = 0; i < segs.length; i++) {
                const sg = segs[i];
                if (!sg.run || !emph(sg.run)) continue;
                if (!WORD.test(sg.text)) { sg.run = plain(sg.run); continue; }
                const before = i > 0 && segs[i - 1].text !== undefined ? segs[i - 1].text.slice(-1) : '';
                const after = i + 1 < segs.length && segs[i + 1].text !== undefined ? segs[i + 1].text.charAt(0) : '';
                const lead = sg.text.match(EDGE), tail = sg.text.match(EDGE_END);
                if (lead && WORD.test(before)) { segs.splice(i, 0, { text: lead[0], run: plain(sg.run) }); i++; sg.text = sg.text.slice(lead[0].length); }
                if (tail && WORD.test(after)) { segs.splice(i + 1, 0, { text: tail[0], run: plain(sg.run) }); sg.text = sg.text.slice(0, -tail[0].length); }
            }
            let html = '';
            segs.forEach(function (sg) {
                if (sg.html !== undefined) { html += sg.html; return; }
                if (!sg.text) return;
                let t = esc(sg.text);
                const r = sg.run;
                if (r.code) t = '<code>' + t + '</code>';
                else {
                    if (r.italic) t = '<em>' + t + '</em>';
                    if (r.bold) t = '<strong>' + t + '</strong>';
                }
                if (r.strike) t = '<del>' + t + '</del>';
                if (r.link) t = '<a href="' + esc(r.link) + '">' + t + '</a>';
                html += t;
            });
            // (no space before a combining mark — a keycap's U+20E3 after "#"; a control character is a glyph the PDF
            // maps to nothing usable — wkhtmltopdf's colour emoji —: shown as U+FFFD, not dropped silently)
            return html.replace(/\s+/g, ' ').replace(/\s*<br>\s*/g, '<br>').replace(/ (?=\p{M})/gu, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '\uFFFD').trim();
        },

        _toHtml(blocks) {
            const self = this, pagesLinks = this._links || [];
            const parts = [];
            // (a letter's invocation — «بسمه تعالی», «باسمه‌تعالی», «بسم الله الرحمن الرحیم», «به نام خدا» — set large and
            // centred over the letter, often in calligraphy, is no heading: a Word circular's «باسمه تعالی» was its `#`)
            const INVOC = /^(?:با?\s*سمه[\s\u200C]*تعالی|بسم[\s\u200C]*الله.*|به[\s\u200C]+نام[\s\u200C]+(?:خدا|خداوند).*)$/;
            // (and «بسمه» and «تعالی» are two words: calligraphy draws them touching, and a ZWNJ was read between them)
            blocks.forEach(function (b) {
                if ((b.type !== 'heading' && b.type !== 'p') || !b.glyphs) return;
                const t = nfkcArabic(b.glyphs.map(function (g) { return g.atom ? '' : g.ch || ''; }).join('')).replace(/[\u064B-\u065F\u0670]/g, '').replace(/[يى]/g, 'ی').replace(/\s+/g, ' ').trim();
                if (!INVOC.test(t)) return;
                if (b.type === 'heading') { b.type = 'p'; delete b.minor; }
                if (/^با?\s*سمه\u200Cتعالی$/.test(t)) b.glyphs = b.glyphs.map(function (g) { return g.ch === '\u200C' ? Object.assign({}, g, { ch: ' ', space: true }) : g; });
            });
            // (a numbered line set all in bold, alone at its depth in its run of items — «2. درخواست از …:» over bullet items set
            // further in, its sibling «1. …» a paragraph over a sub-heading — is a numbered section title, not a list of one
            // whose items are its children: a paragraph, its number kept in its text)
            for (let i = 0; i < blocks.length; i++) {
                const b = blocks[i];
                if (b.type !== 'li' || !b.ordered || !b.glyphs) continue;
                const ink = b.glyphs.filter(function (g) { return !g.space && !g.atom && g.ch && g.ch.trim(); });
                if (!ink.length || ink.filter(function (g) { return g.bold; }).length < 0.9 * ink.length) continue;
                let s0 = i, s1 = i;
                while (s0 > 0 && blocks[s0 - 1].type === 'li') s0--;
                while (s1 < blocks.length - 1 && blocks[s1 + 1].type === 'li') s1++;
                const peer = blocks.slice(s0, s1 + 1).some(function (o) { return o !== b && o.ordered && Math.abs((o.indent || 0) - (b.indent || 0)) < 2; });
                const deeper = s1 > i && (blocks[i + 1].indent || 0) > (b.indent || 0) + 2;
                if (peer || !deeper) continue;
                const g0 = ink[0], num = String(b.start || 1) + '.';
                const pre = Array.from(num).map(function (c) { return Object.assign({}, g0, { ch: c, space: false }); }).concat([Object.assign({}, g0, { ch: ' ', space: true })]);
                blocks[i] = { type: 'p', glyphs: pre.concat(b.glyphs), dir: b.dir, numbered: true };
            }
            // heading levels: distinct heading sizes, largest first
            let hs = Array.from(new Set(blocks.filter(function (b) { return b.type === 'heading' && !b.minor; }).map(function (b) { return Math.round(b.size * 2) / 2; }))).sort(function (a, b) { return b - a; });
            // (an OCR layer measures each line's size from its letters' height: one level's headings came out 15 and 17 pt
            // and read as two levels, while a title at 19 and its sections at 17 are two)
            // A size only one heading has goes to the nearest size two or more have, within 15 % — on a tie the larger:
            // a line with no descender (no g, p, y) measures small («Lessons for other teams» 15 among its level's 17).
            // The document's first heading (its title) keeps its own.
            if (this._ocr) {
                const hb = blocks.filter(function (b) { return b.type === 'heading' && !b.minor; });
                const key = function (b) { return Math.round(b.size * 2) / 2; };
                const n = {}; hb.forEach(function (b) { n[key(b)] = (n[key(b)] || 0) + 1; });
                hb.forEach(function (b, i) {
                    const z = key(b);
                    if (n[z] > 1 || i === 0) return;
                    const to = hs.filter(function (x) { return x !== z && n[x] >= 2 && Math.abs(x - z) <= 0.15 * Math.max(x, z); })
                        .sort(function (a, c) { return Math.abs(a - z) - Math.abs(c - z) || c - a; })[0];
                    if (to) b.size = to;
                });
                hs = Array.from(new Set(hb.map(key))).sort(function (a, c) { return c - a; });
            }
            // (a heading told by its font family alone — not bold — goes under the bold ones of body size)
            const boldMinor = blocks.some(function (b) { return b.type === 'heading' && b.minor && !b.family && !b.italic; });
            const level = function (b) {
                if (b.tree && b.level) return b.level;                    // the structure tree's own level (§8.4)
                return b.minor ? Math.min(6, hs.length + 1 + (b.family && boldMinor ? 1 : 0)) : Math.min(6, Math.max(1, hs.indexOf(Math.round(b.size * 2) / 2) + 1));
            };
            // a bold line of body size is a minor heading only below real (larger) headings (the tree's are headings as they are)
            // (a section's title band is a heading of its own, with no larger heading above it too)
            blocks.forEach(function (b) { if (b.type === 'heading' && b.minor && !b.tree && !b.band && (!hs.length || b.italic)) { b.type = 'p'; } });
            // a label set small right over a larger heading, nothing between them — a section's kicker («01 / THE
            // BASICS» over «01 Basics»; a contract's one-word tab over its first article): no heading of its own,
            // it read a level deeper than the heading it labels. A short bold line
            for (let k = 0; k + 1 < blocks.length; k++) {
                const a = blocks[k], n = blocks[k + 1];
                if (a.type !== 'heading' || n.type !== 'heading' || a.tree || level(a) <= level(n)) continue;
                const t = a.glyphs.map(function (x) { return x.ch || ''; }).join('').trim();
                if (t.length > 40) continue;
                a.type = 'p'; a.glyphs = a.glyphs.map(function (x) { return x.space ? x : Object.assign({}, x, { bold: true }); });
            }
            let i = 0;
            const inl = function (g) { return self._inline(g, self._allLinks); };
            while (i < blocks.length) {
                const b = blocks[i];
                if (b.type === 'heading') {
                    const g = b.glyphs.map(function (x) { return Object.assign({}, x, { bold: false }); });
                    parts.push('<h' + level(b) + '>' + inl(g) + '</h' + level(b) + '>'); i++;
                } else if (b.type === 'p') { parts.push('<p>' + inl(b.glyphs) + '</p>'); i++; }
                else if (b.type === 'hr') { parts.push('<hr>'); i++; }
                else if (b.type === 'figure') { if (b.img) parts.push('<p><img src="' + b.img.src + '" alt="" width="' + b.img.width + '"></p>'); i++; }
                else if (b.type === 'code') {
                    parts.push('<pre><code' + (b.lang ? ' class="language-' + esc(b.lang) + '"' : '') + '>' + esc(b.lines.join('\n')) + '</code></pre>'); i++;
                } else if (b.type === 'quote') {
                    parts.push('<blockquote>' + self._toHtml(b.children) + '</blockquote>'); i++;
                } else if (b.type === 'table') {
                    // (a table without cells: nothing to write — turndown fails on a table without rows)
                    if (b.title) (Array.isArray(b.title[0]) ? b.title : [b.title]).forEach(function (t) { parts.push('<p>' + inl(t) + '</p>'); });
                    if (!b.rows.length || !b.rows.some(function (r) { return r.length; })) { i++; continue; }
                    let t = '<table>';
                    b.rows.forEach(function (row, r) {
                        const tag = r === 0 ? 'th' : 'td';
                        if (r === 0) t += '<thead>';
                        if (r === 1) t += '<tbody>';
                        t += '<tr>' + row.map(function (c, ci) { const al = r === 0 && b.align && b.align[ci]; return '<' + tag + (al ? ' align="' + al + '"' : '') + '>' + inl(c.map(function (x) { return r === 0 ? Object.assign({}, x, { bold: false }) : x; })) + '</' + tag + '>'; }).join('') + '</tr>';
                        if (r === 0) t += '</thead>';
                    });
                    parts.push(t + (b.rows.length > 1 ? '</tbody>' : '') + '</table>'); i++;
                } else if (b.type === 'li') {
                    // a run of list items (and their indented continuation paragraphs)
                    const run = [];
                    // (a paragraph goes on with the item above when it is set in about as far as the item's text — a letter's
                    // signature set at the other side, 330 pt in, had been read into the last item)
                    const contP = function (b) { return b.type === 'p' && run.length && b.indent > 6 && b.indent <= (run[run.length - 1].indent || 0) + 60; };
                    while (i < blocks.length && (blocks[i].type === 'li' || contP(blocks[i]))) {
                        if (blocks[i].type === 'p') run[run.length - 1].glyphs = run[run.length - 1].glyphs.concat([{ ch: ' ', space: true }], blocks[i].glyphs);
                        else run.push(Object.assign({}, blocks[i]));
                        i++;
                    }
                    // levels: the indents in groups, a new one 3 pt or more past its group's first (not a grid of 4 pt: an
                    // OCR layer set one list's markers 0.4 pt apart across a grid line, and the list came out as two)
                    const levels = [];
                    run.map(function (x) { return x.indent; }).sort(function (a, c) { return a - c; }).forEach(function (v) { if (!levels.length || v - levels[levels.length - 1] >= 3) levels.push(v); });
                    run.forEach(function (x) { let k = 0; while (k + 1 < levels.length && x.indent >= levels[k + 1]) k++; x.level = k; });
                    // an item whose marker stands on the other side, deeper by its indent, whose number goes on with the top
                    // level's count, is a top-level item: Firefox draws a right-to-left list's left-to-right items with their
                    // numbers at the left edge, half off the paper (a Persian encyclopedia page's references: 1, 2 right, 3 left, 4 right,
                    // 5–8 left …) — they had made the Persian items a nested list. A nested list of the other direction starts at 1.
                    (function () {
                        let top = null;
                        run.forEach(function (x) {
                            if (x.level === 0) { if (x.ordered) top = x; return; }
                            if (top && x.ordered && x.dir !== top.dir && x.start === top.start + 1) { x.level = 0; top = x; }
                        });
                    })();
                    let k = 0;
                    while (k < run.length) { const res = self._listHtml(run, k, inl); parts.push(res.html); k = Math.max(res.next, k + 1); }
                } else i++;
            }
            this._htmlParts = parts;                      // the top-level blocks, for the Markdown step in chunks
            return parts.join('\n');
        },

        _listHtml(items, from, inl) {
            const lvl = items[from].level, ordered = items[from].ordered;
            let html = ordered ? '<ol' + (items[from].start > 1 ? ' start="' + items[from].start + '"' : '') + '>' : '<ul>';
            let i = from;
            while (i < items.length && items[i].level >= lvl) {
                if (items[i].level > lvl) {
                    const sub = this._listHtml(items, i, inl);
                    html = html.replace(/<\/li>$/, '') + sub.html + '</li>';
                    i = sub.next; continue;
                }
                if (items[i].ordered !== ordered) break;
                html += '<li>' + (items[i].task ? (items[i].checked ? '\u27E6KTASKX\u27E7 ' : '\u27E6KTASK\u27E7 ') : '') + inl(items[i].glyphs) + '</li>';
                i++;
            }
            return { html: html + (ordered ? '</ol>' : '</ul>'), next: i };
        }
    });
})(typeof window !== 'undefined' ? window : globalThis);
