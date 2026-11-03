/**
 * PdfImporter — 4.9 confidence and the fallback ladder (lib/pdfimport/ladder.js)
 * ============================================================================
 * Each page's confidence (pl.conf, 0–1) from what the importer measured on it, and the mode its blocks are
 * given in: `full` (the layout as it is) → `simplified` (headings and paragraphs only: tables, lists and quotes
 * off) → `textContent` (pdf.js's own text, getTextContent(), in paragraphs by their line gaps) → `ocr` (a page
 * with no text over a picture: the picture and a note, until an OCR runtime reads it — plan P7). A page whose
 * every rung fails keeps the last resort, its lines as plain paragraphs (_pageFallback). PDFIMPORT.md §7a.
 * options.mode: 'auto' (the ladder decides), 'safe' (every page at least `simplified` — the app's safe mode),
 * 'full' (never demoted: the importer as before the ladder).
 *
 * Part of PdfImporter: load after regions.js (see lib/PdfImporter.js for the order). The methods are those of
 * the class, added to its prototype; `ladderConf` and `ladderDecide` are pure (PdfImporter._ladder, tests/unit).
 */
(function (global) {
    'use strict';
    const PdfImporter = global.PdfImporter || (typeof require === 'function' ? require('../PdfImporter.js') : null);
    const { R_CH, L_CH, median, nfkcArabic } = PdfImporter._internal;

    const U = function (m) { return ['ladder.js ' + m]; };
    PdfImporter._defineThresholds({
        // the decision (ladderDecide): votes and shares, never calibrated
        pageConfSimplified: { def: 0.45, unit: 'share', fixed: true, used: U('ladderDecide (a page under it is simplified)') },
        ladLostTextContent: { def: 0.2, unit: 'share', fixed: true, used: U('ladderDecide (lost glyphs: pdf.js\'s own text instead)') },
        ladOcrMaxGlyphs: { def: 10, unit: 'glyphs', fixed: true, used: U('ladderDecide (a page with no text …)') },
        ladOcrPicShare: { def: 0.5, unit: 'share', fixed: true, used: U('ladderDecide (… over a picture of the page: OCR)') },
        // the confidence (ladderConf): each sign's weight, and the share at which it counts in full
        ladWLost: { def: 0.5, unit: 'weight', fixed: true, used: U('ladderConf (U+FFFD glyphs)') },
        ladLostFull: { def: 0.2, unit: 'share', fixed: true, used: U('ladderConf') },
        ladWGlued: { def: 0.3, unit: 'weight', fixed: true, used: U('ladderConf (words run together)') },
        ladGluedFull: { def: 0.25, unit: 'share', fixed: true, used: U('ladderConf') },
        ladWCovered: { def: 0.1, unit: 'weight', fixed: true, used: U('ladderConf (text under a cropped picture)') },
        ladWGuess: { def: 0.15, unit: 'weight', fixed: true, used: U('ladderConf (glyphs whose letter was guessed: telemetry of the repairs)') },
        ladWTree: { def: 0.15, unit: 'weight', fixed: true, used: U('ladderConf (blocks the structure tree disagrees with)') },
        ladTreeMinVotes: { def: 3, unit: 'count', fixed: true, used: U('ladderConf') },
        ladWAmbig: { def: 0.1, unit: 'weight', fixed: true, used: U('ladderConf (gaps between a letter gap and a word gap)') },
        ladAmbigFull: { def: 0.5, unit: 'share', fixed: true, used: U('ladderConf') },
        ladAmbigLoEm: { def: 0.1, unit: 'em', fixed: true, used: U('_ladSignals (an ambiguous gap: over this …)') },
        ladAmbigHiEm: { def: 0.18, unit: 'em', fixed: true, used: U('_ladSignals (… and under this, no space glyph)') },
        ladWSamples: { def: 0.05, unit: 'weight', fixed: true, used: U('ladderConf (a document too short to calibrate)') },
        ladSamplesMin: { def: 20, unit: 'count', fixed: true, used: U('ladderConf (word-gap samples: thresholds.js wordGapBareEm minSamples)') },
        // textContent: pdf.js's items to lines and paragraphs
        ladTcLineEm: { def: 0.5, unit: 'em', used: U('_ladTextContent (items on one line)') },
        ladTcSpaceEm: { def: 0.15, unit: 'em', used: U('_ladTextContent (a word gap between items)') },
        ladTcParaRatio: { def: 1.5, unit: 'ratio', used: U('_ladTextContent (a paragraph gap, of the page\'s usual line pitch)').concat(U('_ladSimpleBlocks')) },
        // simplified from the lines (when the layout itself failed)
        ladHeadRatio: { def: 1.2, unit: 'ratio', used: U('_ladSimpleBlocks (a heading\'s size, of the body\'s)') },
        ladHeadMaxGlyphs: { def: 80, unit: 'glyphs', used: U('_ladSimpleBlocks') },
        ladSizeTolPt: { def: 0.6, unit: 'pt', used: U('_ladSimpleBlocks (one paragraph\'s size)') }
    });

    const clamp01 = function (x) { return x < 0 ? 0 : x > 1 ? 1 : x; };
    const share = function (a, b) { return b > 0 ? a / b : 0; };

    /**
     * A page's confidence, 0–1 (pure): one minus the weighted signs that the page came back worse than its text layer
     * allows. sig: { glyphs, lost, words, glued, covered, guessed, treeVotes, treeAgree, gaps, ambig, samples };
     * k: the weights and full shares (ladW*, *Full, ladTreeMinVotes, ladSamplesMin). Each sign counts in full at its
     * share (lost glyphs at a fifth of the page …), less below it.
     */
    function ladderConf(sig, k) {
        const s = sig || {};
        let pen = 0;
        pen += k.ladWLost * clamp01(share(share(s.lost, s.glyphs), k.ladLostFull));
        pen += k.ladWGlued * clamp01(share(share(s.glued, s.words), k.ladGluedFull));
        pen += k.ladWCovered * clamp01(share(s.covered, s.glyphs));
        pen += k.ladWGuess * clamp01(share(s.guessed, s.glyphs));
        // (the tree's word only where it spoke on a few blocks: one disagreement in two blocks is no measure)
        if (s.treeVotes >= k.ladTreeMinVotes) pen += k.ladWTree * clamp01(1 - share(s.treeAgree, s.treeVotes));
        pen += k.ladWAmbig * clamp01(share(share(s.ambig, s.gaps), k.ladAmbigFull));
        // (a short document falls back to the default thresholds: a little less sure, never demoted by that alone)
        if (s.samples !== undefined && s.samples !== null) pen += k.ladWSamples * clamp01(1 - share(s.samples, k.ladSamplesMin));
        return +clamp01(1 - pen).toFixed(3);
    }

    /**
     * The ladder's decision for one page (pure): { mode, why }. sig as for ladderConf (and flags — _pageQuality's —,
     * picShare, failed: 'layout' | 'extract' | 'lines'), conf, mode: 'auto' | 'safe' | 'full', k: the thresholds.
     * 'full' never demotes (a failed page then gets the caller's last resort, as before the ladder); in 'auto' and
     * 'safe' a failed step goes down a rung; 'safe' gives every page simplified at least.
     */
    function ladderDecide(sig, conf, mode, k) {
        const s = sig || {}, flags = s.flags || [];
        if (mode === 'full') return { mode: 'full', why: [] };
        if (s.failed === 'extract') return { mode: 'textContent', why: ['extractFailed'] };
        if (s.failed === 'lines') return { mode: 'textContent', why: ['layoutFailed'] };
        if (s.failed === 'layout') return { mode: 'simplified', why: ['layoutFailed'] };
        if ((s.glyphs || 0) <= k.ladOcrMaxGlyphs && (s.picShare || 0) >= k.ladOcrPicShare) return { mode: 'ocr', why: ['noText'] };
        if (s.glyphs > 0 && share(s.lost, s.glyphs) >= k.ladLostTextContent) return { mode: 'textContent', why: ['lostGlyphs'] };
        if (flags.indexOf('suspectSpaces') >= 0 && flags.indexOf('lostGlyphs') >= 0) return { mode: 'simplified', why: ['suspectSpaces', 'lostGlyphs'] };
        if (conf < k.pageConfSimplified) return { mode: 'simplified', why: ['lowConf'] };
        if (mode === 'safe') return { mode: 'simplified', why: ['safeMode'] };
        return { mode: 'full', why: [] };
    }

    // the names ladderConf / ladderDecide read, resolved once per import
    const K_NAMES = ['pageConfSimplified', 'ladLostTextContent', 'ladOcrMaxGlyphs', 'ladOcrPicShare', 'ladWLost', 'ladLostFull', 'ladWGlued',
        'ladGluedFull', 'ladWCovered', 'ladWGuess', 'ladWTree', 'ladTreeMinVotes', 'ladWAmbig', 'ladAmbigFull', 'ladWSamples', 'ladSamplesMin'];

    Object.assign(PdfImporter.prototype, {
        _ladK() {
            const self = this, k = {};
            K_NAMES.forEach(function (n) { k[n] = self._t(n); });
            return k;
        },

        // the mode an import runs in: hooks.mode of fromArrayBuffer when given (a re-import in safe mode), else options.mode;
        // 'auto' unless it is 'safe' or 'full'
        _ladMode() { const m = this._runMode !== undefined ? this._runMode : this.options.mode; return m === 'safe' || m === 'full' ? m : 'auto'; },

        /**
         * A page's signs (the input of ladderConf / ladderDecide): its self-diagnosis q (_pageQuality), the glyphs
         * whose letter a repair guessed, the structure tree's agreement with the page's blocks, the gaps between a
         * letter gap and a word gap, the document's word-gap samples, how much of the page a picture covers.
         */
        _ladSignals(pl, blocks, q) {
            const self = this, kLo = this._t('ladAmbigLoEm'), kHi = this._t('ladAmbigHiEm');
            const s = { glyphs: 0, lost: 0, words: 0, glued: 0, covered: 0, guessed: 0, treeVotes: 0, treeAgree: 0, gaps: 0, ambig: 0, samples: null, flags: [], picShare: 0 };
            if (q) { s.glyphs = q.glyphs; s.lost = q.lost; s.words = q.words; s.glued = q.glued; s.covered = q.covered; s.flags = q.flags.slice(); }
            pl.lines.forEach(function (L) {
                const gs = L.glyphs;
                for (let i = 0; i < gs.length; i++) {
                    const g = gs[i];
                    if (!g.space && !g.atom && (g.guess || g.formGuess)) s.guessed++;
                    const a = gs[i - 1];
                    if (!a || a.space || g.space || a.atom || g.atom || !(g.size > 0)) continue;
                    // (in visual order: the gap between two glyphs drawn side by side, no space glyph between them)
                    const e = (g.x - (a.x + a.w)) / g.size;
                    if (e > kLo) { s.gaps++; if (e < kHi) s.ambig++; }
                }
                for (let i = 0; i < gs.length; i++) if (gs[i].space) s.gaps++;
            });
            // the structure tree's word on the page's blocks (blocks.js _treeVote): a heading where it says heading, text where text
            const si = this._structInfo;
            if (si && si.tree) blocks.forEach(function (b) {
                const ls = b.lines || b.hl;
                if (!ls || !ls.length || !ls[0].glyphs || (b.type !== 'heading' && b.type !== 'p')) return;
                let tv; try { tv = self._treeVote(ls); } catch (e) { tv = null; }
                if (!tv || tv.split) return;
                s.treeVotes++;
                if (tv.heading === (b.type === 'heading') || tv.text && b.type !== 'heading') s.treeAgree++;
            });
            const cal = pl.cal || this._cal;
            if (cal && cal.gaps) s.samples = cal.gaps.n || 0;
            const v = pl.p.view || [0, 0, 595, 842], area = Math.abs((v[2] - v[0]) * (v[3] - v[1])) || 1;
            (pl.p.images || []).forEach(function (b) { s.picShare = Math.max(s.picShare, (b.x1 - b.x0) * (b.y1 - b.y0) / area); });
            return s;
        },

        /**
         * The ladder on one page (regions.js _layoutPage): its blocks in the mode decided, recorded in this._pageModes.
         * full: the blocks as laid out. simplified: those blocks flattened (_ladFlatten), or — the layout failed — the
         * page's lines in headings and paragraphs (_ladSimpleBlocks). textContent: pdf.js's text (_ladTextContent);
         * failing that, simplified. ocr: the page's pictures (its scan), a note. Each rung that fails gives the next;
         * the last is _pageFallback's plain lines (the page counted failed).
         */
        async _ladder(pl, blocks, q, failed) {
            const k = this._ladK(), mode = this._ladMode();
            let sig;
            try { sig = this._ladSignals(pl, blocks || [], q); } catch (e) { sig = { flags: [] }; }
            if (failed) sig.failed = failed.kind;
            const conf = failed ? 0 : ladderConf(sig, k);
            const d = ladderDecide(sig, conf, mode, k);
            let out = null;
            // (a page with no text has nothing to be sure of: its confidence is 0, whatever its text signs say)
            const rec = { page: pl.p.num, mode: d.mode, conf: d.mode === 'ocr' ? 0 : conf, why: d.why };
            if (this.options.debug) rec.sig = sig;
            if (d.mode === 'full') out = blocks;
            if (d.mode === 'ocr') out = await this._ladOcr(pl, blocks);
            if (d.mode === 'textContent') {
                try { out = await this._ladTextContent(pl); } catch (e) { if (e && e.code === 'aborted') throw e; out = null; }
                // (no text from pdf.js either: a rung down — simplified, from the lines the page has)
                if (!out || !out.length) { rec.mode = 'simplified'; out = null; }
            }
            if (rec.mode === 'simplified' && !out) {
                try { out = blocks && !failed ? this._ladFlatten(blocks) : this._ladSimpleBlocks(pl); } catch (e) { out = null; }
            }
            if (!out || !out.length && (failed || pl.lines.length && rec.mode !== 'full')) {
                // the last resort: the page's lines as they are (a page whose lines failed has none: empty, noted)
                rec.mode = 'failed';
                const err = failed ? failed.error : new Error('no rung of the ladder gave this page');
                if (failed && (failed.kind === 'extract' || failed.kind === 'lines')) { this._emptyPage(pl.p.num, err); out = []; }
                else out = this._pageFallback(pl, err);
            }
            // (a page that could not be read, in 'full' mode: noted when it failed, as before the ladder)
            if (pl.p.failed && !failed) { rec.mode = 'failed'; rec.why = ['extractFailed']; rec.conf = 0; }
            else if (pl.linesNoted && !failed) { rec.mode = 'failed'; rec.why = ['layoutFailed']; rec.conf = 0; }
            if (rec.mode !== 'full' && rec.mode !== 'failed') {
                this._fire('ladder.' + rec.mode, pl);
                const NOTE = { simplified: ['pageSimplified', 'Page ' + pl.p.num + ' was given in a simplified form (headings and paragraphs only)'],
                    textContent: ['pageTextOnly', 'Page ' + pl.p.num + ' is given as its plain text (pdf.js\'s text layer)'],
                    ocr: ['ocrNeeded', 'Page ' + pl.p.num + ' has no text, only a picture: it needs OCR (not part of the importer yet); the picture is kept'] }[rec.mode];
                // (safe mode simplifies every page: that is the caller's choice, not a finding)
                if (!(rec.mode === 'simplified' && rec.why.length === 1 && rec.why[0] === 'safeMode')) this._note(NOTE[0], NOTE[1] + ' (' + rec.why.join(', ') + ').', pl.p.num);
            }
            (this._pageModes = this._pageModes || []).push(rec);
            return out;
        },

        /**
         * simplified, from the page's blocks: headings, paragraphs, code, rules and pictures as they are; a table's
         * rows each a paragraph (its title first), a list's items paragraphs, a quote's blocks in its place.
         */
        _ladFlatten(blocks) {
            const out = [], SP = { ch: ' ', space: true };
            const cells = function (row) { const g = []; row.forEach(function (c) { if (!c || !c.length) return; if (g.length) g.push(SP); c.forEach(function (x) { g.push(x); }); }); return g; };
            const walk = function (b) {
                if (b.type === 'table') {
                    if (b.title) (Array.isArray(b.title[0]) ? b.title : [b.title]).forEach(function (t) { if (t.length) out.push({ type: 'p', glyphs: t, dir: b.rtl ? 'rtl' : 'ltr' }); });
                    (b.rows || []).forEach(function (r) { const g = cells(r); if (g.length) out.push({ type: 'p', glyphs: g, dir: b.rtl ? 'rtl' : 'ltr' }); });
                } else if (b.type === 'li') out.push({ type: 'p', glyphs: b.glyphs || [], dir: b.dir });
                else if (b.type === 'quote') (b.children || []).forEach(walk);
                else out.push(b);
            };
            blocks.forEach(walk);
            return out.filter(function (b) { return b.type !== 'p' || b.glyphs && b.glyphs.length; });
        },

        /**
         * simplified, from the page's lines (its layout failed): top down, lines on one baseline side by side in the
         * page's direction, a paragraph while the size stays and the gap is a line's; a short line set larger than
         * the body is a heading.
         */
        _ladSimpleBlocks(pl) {
            const self = this, body = (this._metrics && this._metrics.body) || this._t('bodySizePt');
            const kHead = this._t('ladHeadRatio'), kMax = this._t('ladHeadMaxGlyphs'), kTol = this._t('ladSizeTolPt'), kPara = this._t('ladTcParaRatio');
            const ls = pl.lines.filter(function (L) { return L.glyphs && L.glyphs.length; }).slice().sort(function (a, b) { return b.y - a.y || a.x0 - b.x0; });
            // rows: lines on one baseline (a table's cells, a float's two sides)
            const rows = [];
            ls.forEach(function (L) { const r = rows[rows.length - 1]; if (r && Math.abs(r[0].y - L.y) < 0.3 * Math.max(1, L.size)) r.push(L); else rows.push([L]); });
            const out = [];
            let cur = null;
            const flush = function () {
                if (!cur) return;
                const dir = self._blockDir(cur.lines, cur.lines[0].x0, cur.lines[0].x1, self._rtlDoc);
                const ink = cur.lines.reduce(function (n, L) { return n + L.glyphs.filter(function (g) { return !g.space; }).length; }, 0);
                const head = cur.size >= kHead * body && ink <= kMax;
                out.push({ type: head ? 'heading' : 'p', size: cur.size, glyphs: self._joinLines(cur.lines, dir), dir: dir });
                cur = null;
            };
            rows.forEach(function (r) {
                const rtl = r.reduce(function (n, L) { return n + (L.strong ? L.strong.R - L.strong.L : 0); }, 0) > 0;
                r.sort(function (a, b) { return rtl ? b.x1 - a.x1 : a.x0 - b.x0; });
                const L = r[0], size = L.size;
                if (cur && Math.abs(cur.size - size) <= kTol && cur.y - L.y <= kPara * Math.max(size, cur.size) && r.length === 1 && cur.single) { cur.lines.push(L); cur.y = L.y; return; }
                flush();
                cur = { lines: r.slice(), size: size, y: L.y, single: r.length === 1 };
                if (r.length > 1) flush();
            });
            flush();
            return out;
        },

        /**
         * textContent: pdf.js's own text of the page (getTextContent — its strings in logical order, each with its
         * direction), placed by the page's viewport: items on one baseline a line (a word gap where they stand apart),
         * ordered by the line's direction (the importer's letter majority: R_CH against L_CH; BidiCore is not loaded
         * with the importer), lines a paragraph while their gap is the page's usual pitch. Arabic presentation forms
         * become letters (nfkcArabic): pdf.js gives a wkhtmltopdf page's glyphs as drawn — the forced corpus run read its
         * right-to-left files at words 40 before, 81 after.
         */
        async _ladTextContent(pl) {
            const page = pl.p.page || pl.p._tcPage;
            if (!page || !page.getTextContent) return null;
            const tc = await page.getTextContent();
            await this._yield();
            const vp = page.getViewport({ scale: 1, rotation: pl.p.rotate || page.rotate || 0 });
            const kLine = this._t('ladTcLineEm'), kSpace = this._t('ladTcSpaceEm'), kPara = this._t('ladTcParaRatio');
            const items = (tc.items || []).filter(function (it) { return it && typeof it.str === 'string' && it.str.trim() && it.transform; }).map(function (it) {
                const t = it.transform, p = vp.convertToViewportPoint(t[4], t[5]);
                const size = Math.hypot(t[2], t[3]) || Math.hypot(t[0], t[1]) || 10;
                // (x0, x1 along the line; y down the page, as the viewport has it)
                const q = vp.convertToViewportPoint(t[4] + (it.width || 0) * (t[0] / (Math.hypot(t[0], t[1]) || 1)), t[5] + (it.width || 0) * (t[1] / (Math.hypot(t[0], t[1]) || 1)));
                return { str: nfkcArabic(it.str), x0: Math.min(p[0], q[0]), x1: Math.max(p[0], q[0]), y: p[1], size: size };
            }).sort(function (a, b) { return a.y - b.y || a.x0 - b.x0; });
            const lines = [];
            items.forEach(function (it) { const L = lines[lines.length - 1]; if (L && Math.abs(L.y - it.y) < kLine * Math.max(it.size, L.size)) L.items.push(it); else lines.push({ y: it.y, size: it.size, items: [it] }); });
            lines.forEach(function (L) {
                let R = 0, Lt = 0;
                L.items.forEach(function (it) { for (const c of it.str) { if (R_CH.test(c)) R++; else if (L_CH.test(c)) Lt++; } });
                L.rtl = R > Lt;
                L.items.sort(function (a, b) { return L.rtl ? b.x1 - a.x1 : a.x0 - b.x0; });
                let t = '';
                L.items.forEach(function (it, i) {
                    const prev = L.items[i - 1];
                    const gap = prev ? (L.rtl ? prev.x0 - it.x1 : it.x0 - prev.x1) : 0;
                    if (prev && gap > kSpace * it.size && !/\s$/.test(t) && !/^\s/.test(it.str)) t += ' ';
                    t += it.str;
                });
                L.text = t.replace(/\s+/g, ' ').trim();
                L.size = median(L.items.map(function (it) { return it.size; })) || L.size;
            });
            const steps = [];
            for (let i = 1; i < lines.length; i++) { const d = lines[i].y - lines[i - 1].y; if (d > 0.5 * lines[i].size && d < 3 * lines[i].size) steps.push(d / lines[i].size); }
            const pitch = steps.length ? Math.min.apply(null, steps.sort(function (a, b) { return a - b; }).slice(0, Math.max(1, Math.ceil(steps.length / 2)))) : 1.2;
            const num = pl.p.num, out = [];
            let cur = null;
            const glyphs = function (text) { return Array.from(text).map(function (ch) { return ch === ' ' ? { ch: ' ', space: true, page: num } : { ch: ch, page: num }; }); };
            lines.forEach(function (L) {
                if (!L.text) return;
                const near = cur && L.y - cur.y <= kPara * pitch * L.size && cur.rtl === L.rtl;
                if (near) { cur.text += ' ' + L.text; cur.y = L.y; return; }
                if (cur) out.push({ type: 'p', glyphs: glyphs(cur.text), dir: cur.rtl ? 'rtl' : 'ltr', textContent: true });
                cur = { text: L.text, y: L.y, rtl: L.rtl };
            });
            if (cur) out.push({ type: 'p', glyphs: glyphs(cur.text), dir: cur.rtl ? 'rtl' : 'ltr', textContent: true });
            return out;
        },

        // ocr: the page's pictures as its layout gave them (the scan); none, the page rendered whole — and a note
        async _ladOcr(pl, blocks) {
            const figs = (blocks || []).filter(function (b) { return b.type === 'figure'; });
            if (figs.length) return blocks;
            const v = pl.p.view || [0, 0, 595, 842];
            const img = await this._crop(pl.p, { x0: v[0], y0: v[1], x1: v[2], y1: v[3] });
            return (blocks || []).concat(img ? [{ type: 'figure', img: img, bb: { x0: v[0], x1: v[2], y0: v[1], y1: v[3] } }] : []);
        },

        /**
         * r.pages and r.report (the import report, shown by the app: P3.5): each page read with its mode and confidence;
         * the summary; the pages not given in full and why; the self-diagnosis' flags and the notes, with their pages.
         */
        _ladReport(qualityFlags, nPages) {
            const recs = (this._pageModes || []).slice().sort(function (a, b) { return a.page - b.page; });
            const pages = recs.map(function (r) { const o = { page: r.page, mode: r.mode === 'failed' ? 'simplified' : r.mode, conf: r.conf }; if (r.sig) o.sig = r.sig; return o; });
            const summary = { pages: nPages !== undefined ? nPages : recs.length, full: 0, simplified: 0, textContent: 0, ocr: 0, failed: 0, conf: 0 };
            recs.forEach(function (r) { summary[r.mode]++; summary.conf += r.conf; });
            summary.conf = recs.length ? +(summary.conf / recs.length).toFixed(3) : 1;
            if (nPages !== undefined && !recs.length) summary.full = nPages;
            const np = this._notePages || {};
            return {
                pages: pages,
                report: {
                    mode: this._ladMode(),
                    summary: summary,
                    pages: recs.filter(function (r) { return r.mode !== 'full'; }).map(function (r) { return { page: r.page, mode: r.mode === 'failed' ? 'simplified' : r.mode, conf: r.conf, why: r.why.length ? r.why.slice() : ['layoutFailed'], failed: r.mode === 'failed' || undefined }; }),
                    flags: Object.keys(qualityFlags || {}).map(function (c) { return { code: c, pages: qualityFlags[c].slice() }; }),
                    notes: (this.notes || []).map(function (c) { const o = { code: c }; if (np[c] && np[c].size) o.pages = Array.from(np[c]).sort(function (a, b) { return a - b; }); return o; })
                }
            };
        }
    });

    PdfImporter._ladder = { conf: ladderConf, decide: ladderDecide, names: K_NAMES };
})(typeof window !== 'undefined' ? window : globalThis);
