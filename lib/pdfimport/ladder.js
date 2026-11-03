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
    const { R_CH, L_CH, median, nfkcArabic, PF, DUAL, ARABIC_LETTER } = PdfImporter._internal;

    const U = function (m) { return ['ladder.js ' + m]; };
    PdfImporter._defineThresholds({
        // the decision (ladderDecide): votes and shares, never calibrated
        pageConfSimplified: { def: 0.45, unit: 'share', fixed: true, used: U('ladderDecide (a page under it is simplified)') },
        ladLostTextContent: { def: 0.2, unit: 'share', fixed: true, used: U('ladderDecide (lost glyphs: simplified, or pdf.js\'s own text when it lost fewer)') },
        ladTcLostShare: { def: 0.5, unit: 'share', fixed: true, used: U('_ladTcBetter (pdf.js\'s text loses at most this share of what the glyphs lost …)') },
        ladTcMinInk: { def: 0.8, unit: 'share', fixed: true, used: U('_ladTcBetter (… and keeps this share of their characters)') },
        // (a caption, a page number left after the furniture, is text: a page with any is no scan to read)
        ladOcrMaxGlyphs: { def: 0, unit: 'glyphs', fixed: true, used: U('ladderDecide (a page with no text …)') },
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
        ladTcSpaceEm: { def: 0.15, unit: 'em', used: U('_ladTcLines (a word gap between items)') },
        ladTcZwnjGapEm: { def: 0.05, unit: 'em', used: U('_ladTcLines (items that touch: where a ZWNJ may have stood)') },
        ladTcParaRatio: { def: 1.5, unit: 'ratio', used: U('_ladTextContent (a paragraph gap, of the page\'s usual line pitch)').concat(U('_ladSimpleBlocks')) },
        // simplified from the lines (when the layout itself failed)
        ladHeadRatio: { def: 1.2, unit: 'ratio', used: U('_ladSimpleBlocks (a heading\'s size, of the body\'s)') },
        ladHeadMaxGlyphs: { def: 80, unit: 'glyphs', used: U('_ladSimpleBlocks') },
        ladSizeTolPt: { def: 0.6, unit: 'pt', used: U('_ladSimpleBlocks (one paragraph\'s size)') }
    });

    const clamp01 = function (x) { return x < 0 ? 0 : x > 1 ? 1 : x; };
    const share = function (a, b) { return b > 0 ? a / b : 0; };

    /*
     * pdf.js's own bidi (its src/core/bidi.js, run on each getTextContent item): an item's characters, gathered in the
     * order they were drawn — left to right, as the page shows them —, put through the Unicode algorithm as if they
     * were logical text and reordered by its levels, with no mirroring (and «<» «>» dropped). For an item of one
     * direction that is the logical text; for anything else — digits, Latin and brackets in a right-to-left line,
     * single glyphs each an item of its own — it is neither visual nor logical, and items sorted by position on top
     * of it gave «۱۴۰۳» → «3041», «(NAS)» → «)NAS(». The same reordering, run once more with the item's base level,
     * gives the drawn order back (the levels do not change when a run is turned round); the importer's own bidi
     * (_logical) then reads the line as it reads glyphs. The classes are pdf.js's, below U+0100 and in the Arabic block.
     */
    const PJ_RLE = function (s) {
        const a = [];
        s.split(' ').forEach(function (r) { const m = /^([A-Z-]+)(\d*)$/.exec(r); for (let i = 0; i < (+m[2] || 1); i++) a.push(m[1] === '-' ? '' : m[1]); });
        return a;
    };
    const PJ_BASE = PJ_RLE('BN9 S B S WS B BN14 B3 S WS ON2 ET3 ON5 ES CS ES CS2 EN10 CS ON6 L26 ON6 L26 ON4 BN6 B BN26 CS ON ET4 ON4 L ON2 BN ON2 ET2 EN2 ON L ON3 EN L ON5 L23 ON L31 ON L8');
    const PJ_AR = PJ_RLE('AN6 ON2 AL ET2 AL CS AL ON2 NSM11 AL2 - AL45 NSM21 AN10 ET AN2 AL3 NSM AL101 NSM7 AN ON NSM6 AL2 NSM2 ON NSM4 AL2 EN10 AL6');
    const pjType = function (c) {
        if (c <= 0xFF) return PJ_BASE[c];
        if (c >= 0x590 && c <= 0x5F4) return 'R';
        if (c >= 0x600 && c <= 0x6FF) return PJ_AR[c & 0xFF];
        if (c >= 0x700 && c <= 0x8AC || c >= 0xFB50 && c <= 0xFDFF || c >= 0xFE70 && c <= 0xFEFF) return 'AL';
        return 'L';
    };
    function pdfjsReorder(str, level) {
        const n = str.length, chars = str.split(''), t = [];
        let bidi = 0;
        for (let i = 0; i < n; i++) { t.push(pjType(str.charCodeAt(i))); if (t[i] === 'R' || t[i] === 'AL' || t[i] === 'AN') bidi++; }
        if (!bidi) return str;
        const e = level ? 'R' : 'L';
        let last = e;
        for (let i = 0; i < n; i++) { if (t[i] === 'NSM') t[i] = last; else last = t[i]; }
        last = e;
        for (let i = 0; i < n; i++) { if (t[i] === 'EN') t[i] = last === 'AL' ? 'AN' : 'EN'; else if (t[i] === 'R' || t[i] === 'L' || t[i] === 'AL') last = t[i]; }
        for (let i = 0; i < n; i++) if (t[i] === 'AL') t[i] = 'R';
        for (let i = 1; i < n - 1; i++) {
            if (t[i] === 'ES' && t[i - 1] === 'EN' && t[i + 1] === 'EN') t[i] = 'EN';
            if (t[i] === 'CS' && (t[i - 1] === 'EN' || t[i - 1] === 'AN') && t[i + 1] === t[i - 1]) t[i] = t[i - 1];
        }
        for (let i = 0; i < n; i++) {
            if (t[i] !== 'EN') continue;
            for (let j = i - 1; j >= 0 && t[j] === 'ET'; j--) t[j] = 'EN';
            for (let j = i + 1; j < n && t[j] === 'ET'; j++) t[j] = 'EN';
        }
        for (let i = 0; i < n; i++) if (t[i] === 'WS' || t[i] === 'ES' || t[i] === 'ET' || t[i] === 'CS') t[i] = 'ON';
        last = e;
        for (let i = 0; i < n; i++) { if (t[i] === 'EN') t[i] = last === 'L' ? 'L' : 'EN'; else if (t[i] === 'R' || t[i] === 'L') last = t[i]; }
        const side = function (x) { return x === 'L' ? 'L' : x === 'R' || x === 'EN' || x === 'AN' ? 'R' : null; };
        for (let i = 0; i < n; i++) {
            if (t[i] !== 'ON') continue;
            let end = i + 1; while (end < n && t[end] === 'ON') end++;
            let before = e, after = e;
            for (let j = i - 1; j >= 0; j--) if (side(t[j])) { before = side(t[j]); break; }
            for (let j = end; j < n; j++) if (side(t[j])) { after = side(t[j]); break; }
            if (before === after) for (let j = i; j < end; j++) t[j] = before;
            i = end - 1;
        }
        const lv = t.map(function (x) {
            if (x === 'ON') x = e;
            if (!level) return x === 'R' ? 1 : x === 'AN' || x === 'EN' ? 2 : 0;
            return x === 'L' || x === 'AN' || x === 'EN' ? 2 : 1;
        });
        let hi = -1, lo = 99;
        lv.forEach(function (x) { if (x > hi) hi = x; if (x % 2 && x < lo) lo = x; });
        for (let l = hi; l >= lo; l--) {
            for (let i = 0; i < n; i++) {
                if (lv[i] < l) continue;
                let j = i; while (j < n && lv[j] >= l) j++;
                const a = chars.slice(i, j).reverse();
                for (let k = i; k < j; k++) chars[k] = a[k - i];
                i = j - 1;
            }
        }
        return chars.join('');
    }
    // an item's characters in the order they were drawn (pdf.js gave them back reordered when it found a right-to-left
    // character: dir 'rtl' at base level 1, 'ltr' at 0); an item with none it left as it was
    function tcVisual(str, dir) { return pdfjsReorder(str, dir === 'rtl' ? 1 : 0); }

    // brackets named by their logical character in a line's visual glyphs (LibreOffice's ToUnicode: the «)» shape drawn at
    // the left of «(NAS)» in a right-to-left line named «(»; Chrome names the shape): a closing bracket with no opening
    // one before it, and an opening one after it with nothing of their kind between, are such a pair — named as drawn,
    // so that _logical's mirroring gives them back («)NAS(» in the forced run of LibreOffice's files otherwise)
    function tcBrackets(gs) {
        const OPEN = '([{', CLOSE = ')]}';
        for (let k = 0; k < 3; k++) {
            let depth = 0;
            for (let i = 0; i < gs.length; i++) {
                const c = gs[i].ch;
                if (c === OPEN[k]) depth++;
                else if (c === CLOSE[k] && depth) depth--;
                else if (c === CLOSE[k]) {
                    let j = i + 1; while (j < gs.length && gs[j].ch !== OPEN[k] && gs[j].ch !== CLOSE[k]) j++;
                    if (j < gs.length && gs[j].ch === OPEN[k]) { gs[i] = Object.assign({}, gs[i], { ch: OPEN[k] }); gs[j] = Object.assign({}, gs[j], { ch: CLOSE[k] }); i = j; }
                }
            }
        }
        return gs;
    }

    // a list's marker — «1.» «۲)» «•» — as the first or last word of a line's glyphs in visual order, set apart by a space:
    // 'left' | 'right' | null (a number alone is none: a table's figure, a page's)
    const MARK_RE = /^(?:[.)\u066B][0-9\u0660-\u0669\u06F0-\u06F9]{1,3}|[0-9\u0660-\u0669\u06F0-\u06F9]{1,3}[.)\u066B]|[\u2022\u25E6▪▫■□●○‣⁃∙·\u2013*-])$/;
    function tcMarker(glyphs) {
        const t = (glyphs || []).map(function (g) { return g.space ? ' ' : g.ch; }).join('').trim().split(/\s+/);
        if (t.length < 2) return null;
        if (MARK_RE.test(t[t.length - 1])) return 'right';
        if (MARK_RE.test(t[0])) return 'left';
        return null;
    }

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
        // (many glyphs lost: pdf.js's text is where the glyphs' letters came from, and has lost the same as a rule —
        // simplified; pdf.js's own text only where it shows fewer lost, measured by the caller: tryText)
        if (s.glyphs > 0 && share(s.lost, s.glyphs) >= k.ladLostTextContent) return { mode: 'simplified', why: ['lostGlyphs'], tryText: true };
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
        // (only a valid hooks.mode overrides: a misspelt one — «Safe» — leaves options.mode as it is)
        _ladMode() {
            const ok = function (m) { return m === 'auto' || m === 'safe' || m === 'full'; };
            const m = ok(this._runMode) ? this._runMode : this.options.mode;
            return m === 'safe' || m === 'full' ? m : 'auto';
        },

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
            let sig, sigOk = true;
            try { sig = this._ladSignals(pl, blocks || [], q); } catch (e) { sig = { flags: [] }; sigOk = false; }
            if (failed) sig.failed = failed.kind;
            // (signs that could not be read say nothing: the confidence is unknown — null, skipped by the summary's
            // mean — and the page is given as laid out, or simplified in safe mode, the caller's choice)
            const conf = failed ? 0 : sigOk ? ladderConf(sig, k) : null;
            const d = failed || sigOk ? ladderDecide(sig, conf, mode, k) : mode === 'safe' ? { mode: 'simplified', why: ['safeMode'] } : { mode: 'full', why: [] };
            let out = null;
            // (a page with no text has nothing to be sure of: its confidence is 0, whatever its text signs say)
            const rec = { page: pl.p.num, mode: d.mode, conf: d.mode === 'ocr' ? 0 : conf, why: d.why };
            if (this.options.debug) rec.sig = sig;
            const text = async function (self) {
                try { return await self._ladTextContent(pl); } catch (e) { if (e && e.code === 'aborted') throw e; return null; }
            };
            if (d.mode === 'full') out = blocks;
            if (d.mode === 'ocr') out = await this._ladOcr(pl, blocks);
            if (d.mode === 'textContent') {
                out = await text(this);
                // (no text from pdf.js either: a rung down — simplified, from the lines the page has)
                if (!out || !out.length) { rec.mode = 'simplified'; out = null; }
            }
            // (lost glyphs: pdf.js's text only where it shows demonstrably fewer lost characters than the glyphs)
            if (d.tryText) {
                const tc = await text(this);
                if (tc && tc.length && this._ladTcBetter(tc, sig)) { out = tc; rec.mode = 'textContent'; }
            }
            if (rec.mode === 'textContent' && out) rec.tcChars = this._ladInk(out).ink;
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
         * textContent: pdf.js's own text of the page (getTextContent), for a page whose glyphs could not be read — read as
         * the importer reads glyphs (_ladTcLines: each item in the order it was drawn, spread over its width), not as
         * strings sorted by position: each line's direction (its letters; a list number at its right end; its edge), the
         * lines a paragraph while their gap is the page's usual pitch and their size stays, a short line set larger a
         * heading, a line opening with a list number a paragraph of its own; each paragraph through _joinLines (_logical's
         * bidi — numbers, Latin and mirrored brackets in a right-to-left line —, ZWNJs from the shapes, presentation forms
         * to letters: _ladTcJoin). Running heads, feet and page numbers go (_ladTcFurniture). The reviewer's forced run
         * (every page's extraction failed) had read «۱۴۰۳» «3041», «2024-05-12» «12-05-2024», «(NAS)» «)NAS(».
         */
        async _ladTextContent(pl) {
            const tl = await this._ladTcLines(pl.p);
            if (!tl || !tl.lines.length) return null;
            const near = this.options.dropHeaderFooter ? await this._ladTcNeighbours(pl) : [];
            const self = this, lines = this._ladTcFurniture(tl, near);
            if (!lines.length) return null;
            const kPara = this._t('ladTcParaRatio'), kHead = this._t('ladHeadRatio'), kMax = this._t('ladHeadMaxGlyphs'), kTol = this._t('ladSizeTolPt');
            const maj = this._t('blkDirMajority'), edge = this._t('blkDirOneTouchPt');
            const left = Math.min.apply(null, lines.map(function (L) { return L.x0; })), right = Math.max.apply(null, lines.map(function (L) { return L.x1; }));
            let nR = 0, nL = 0;
            lines.forEach(function (L) { nR += L.strong.R; nL += L.strong.L; });
            const pageRtl = nR > nL || nR === nL && !!this._rtlDoc;
            lines.forEach(function (L) {
                const r = L.strong.R, l = L.strong.L, m = tcMarker(L.glyphs);
                // (a list number at a line's right end is a right-to-left item — «۱. مورد اول با Google Chrome» has more
                // Latin letters than Persian ones —, else two thirds of the letters, else the edge it keeps, as _blockDir)
                if (m === 'right' && r > 0) L.rtl = true;
                else if (r > 0 && r >= maj * l) L.rtl = true;
                else if (l > 0 && l >= maj * r) L.rtl = false;
                else if (!r && !l) L.rtl = pageRtl;
                else {
                    const tR = right - L.x1 < edge, tL = L.x0 - left < edge;
                    L.rtl = tR !== tL ? tR : r !== l ? r > l : pageRtl;
                }
                L.marker = m === (L.rtl ? 'right' : 'left');
            });
            const steps = [];
            for (let i = 1; i < lines.length; i++) { const d = lines[i].y - lines[i - 1].y; if (d > 0.5 * lines[i].size && d < 3 * lines[i].size) steps.push(d / lines[i].size); }
            const pitch = steps.length ? Math.min.apply(null, steps.sort(function (a, b) { return a - b; }).slice(0, Math.max(1, Math.ceil(steps.length / 2)))) : 1.2;
            // (the body: the size most of the page's characters are set in)
            const bySize = lines.slice().sort(function (a, b) { return a.size - b.size; }), half = lines.reduce(function (n, L) { return n + L.ink; }, 0) / 2;
            let body = bySize[0].size;
            for (let i = 0, n = 0; i < bySize.length; i++) { n += bySize[i].ink; if (n >= half) { body = bySize[i].size; break; } }
            const out = [];
            let cur = null;
            const flush = function () {
                if (!cur) return;
                const dir = cur.rtl ? 'rtl' : 'ltr', ink = cur.lines.reduce(function (n, L) { return n + L.ink; }, 0);
                const head = cur.size >= kHead * body && ink <= kMax;
                out.push({ type: head ? 'heading' : 'p', size: cur.size, glyphs: self._ladTcJoin(cur.lines, dir), dir: dir, textContent: true });
                cur = null;
            };
            lines.forEach(function (L) {
                if (cur && !L.marker && cur.rtl === L.rtl && Math.abs(cur.size - L.size) <= kTol && L.y - cur.y <= kPara * pitch * L.size) { cur.lines.push(L); cur.y = L.y; return; }
                flush();
                cur = { lines: [L], y: L.y, size: L.size, rtl: L.rtl };
            });
            flush();
            return out.filter(function (b) { return b.glyphs.length; });
        },

        /**
         * textContent, step 1 (cached on the page: its neighbours' lines are read for the furniture): pdf.js's items placed
         * by the page's viewport, each in the order it was drawn (tcVisual) and spread over its width as glyphs; items on
         * one baseline a line, side by side, a word gap where they stand apart. { lines, H } — lines top down, each
         * { y, size, x0, x1, glyphs (visual), strong: { R, L }, ink }.
         */
        async _ladTcLines(p) {
            if (p._tcLines !== undefined) return p._tcLines;
            const page = p.page || p._tcPage;
            if (!page || !page.getTextContent) return (p._tcLines = null);
            const tc = await page.getTextContent();
            await this._yield();
            const vp = page.getViewport({ scale: 1, rotation: p.rotate || page.rotate || 0 });
            const kLine = this._t('ladTcLineEm'), kSpace = this._t('ladTcSpaceEm'), kZw = this._t('ladTcZwnjGapEm'), num = p.num;
            const skia = /skia|chrom/i.test(this._producer || '');
            const items = (tc.items || []).filter(function (it) { return it && typeof it.str === 'string' && it.str && it.transform; }).map(function (it) {
                const t = it.transform, a = vp.convertToViewportPoint(t[4], t[5]), u = Math.hypot(t[0], t[1]) || 1;
                const size = Math.hypot(t[2], t[3]) || Math.hypot(t[0], t[1]) || 10;
                // (x0, x1 along the line; y down the page, as the viewport has it)
                const b = vp.convertToViewportPoint(t[4] + (it.width || 0) * t[0] / u, t[5] + (it.width || 0) * t[1] / u);
                // (an item of no width is a mark drawn over its letter — a hamza, a haraka —: pdf.js put the space it had
                // seen before it into it)
                const s = it.width ? it.str : it.str.replace(/\s+/g, '');
                return { vis: tcVisual(s, it.dir), x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y: a[1], size: size, w0: it.width ? 0 : 1 };
            }).filter(function (it) { return it.vis; }).sort(function (a, b) { return a.y - b.y || a.x0 - b.x0; });
            // (a ZWNJ: pdf.js drops it, and the zero-advance space Chrome draws for it, but not the item it ends — every
            // ZWNJ of the right-to-left corpus' Chrome files, 302 of them, stands where one item ends and the next begins
            // with no gap. Where a presentation form shows the broken join, repairArabic puts it back as it does for
            // glyphs; between two letters named by themselves it cannot — «نرم‌افزار»: «م» then «ا». There: a dual-joining
            // letter on the right (logically first) whose initial and medial forms the page names by their presentation
            // forms, twice at least — so its own name is its isolated or final shape —, against a letter on the left that
            // joins back only («ا» «د» «ر» «و» …), touching: in the corpus' Chrome files 27 ZWNJs and no join; without
            // that evidence the same pair was 28 ZWNJs and 41 joins (Chrome «گزارش», LibreOffice): left alone. Chrome only,
            // where it was measured)
            const named = {};
            items.forEach(function (it) { for (const c of it.vis) { const f = PF[c]; if (f && (f[1] === 2 || f[1] === 3)) named[f[0]] = (named[f[0]] || 0) + 1; } });
            const zwnjAt = function (left, right) {
                if (!skia || !left || !right || left.space || PF[right] || PF[left.ch]) return false;
                return DUAL.test(right) && (named[right] || 0) >= 2 && ARABIC_LETTER.test(left.ch) && !DUAL.test(left.ch);
            };
            const lines = [];
            items.forEach(function (it) { const L = lines[lines.length - 1]; if (L && Math.abs(L.y - it.y) < kLine * Math.max(it.size, L.size)) L.items.push(it); else lines.push({ y: it.y, size: it.size, items: [it] }); });
            lines.forEach(function (L) {
                // (left to right; a mark of no width before the letter it stands on, as the glyphs are drawn)
                L.items.sort(function (a, b) { const d = a.x0 - b.x0; return a.w0 !== b.w0 && Math.abs(d) < 0.25 * Math.max(a.size, b.size) ? b.w0 - a.w0 : d; });
                const gs = [];
                let lastX1 = null;
                L.items.forEach(function (it) {
                    const prev = gs[gs.length - 1];
                    const cs = Array.from(it.vis), w = (it.x1 - it.x0) / cs.length;
                    // (a number drawn with its percent sign on its right, one item: laid out as a European number, its
                    // sign attached — LibreOffice's table cells «76%» —, its sign after it; marked (pct) for _ladTcJoin)
                    const pct = /^[0-9]+([.,][0-9]+)*%$/.test(it.vis);
                    // (a space of a space's width: the rest of a wide gap stays a gap — a table's next cell, where _logical's
                    // bidi stops looking for the letter a number follows; spanned, «54%» in a cell came back «%54»)
                    if (prev && !prev.space && !/^\s/.test(it.vis) && it.x0 - lastX1 > kSpace * it.size) gs.push({ ch: ' ', space: true, x: lastX1, w: Math.min(it.x0 - lastX1, 0.3 * it.size), size: it.size, page: num });
                    else if (prev && Math.abs(it.x0 - lastX1) < kZw * it.size && zwnjAt(prev, cs[0])) gs.push({ ch: '\u200C', x: it.x0, w: 0, size: it.size, page: num });
                    cs.forEach(function (c, i) {
                        // (whitespace that opens an item's drawn text, against an Arabic letter: the zero-advance space
                        // Chrome draws for a ZWNJ, kept by pdf.js when the item goes on — 99 of 99 in the corpus' Chrome
                        // files, «نگه‌داری» «داده‌های»; a word space ends the item before it, or stands inside one. Chrome
                        // only: wkhtmltopdf's word spaces open items so)
                        if (skia && i === 0 && /\s/.test(c) && cs[1] && ARABIC_LETTER.test(nfkcArabic(cs[1]))) {
                            if (gs.length && !gs[gs.length - 1].space) gs.push({ ch: '\u200C', x: it.x0, w: 0, size: it.size, page: num });
                            return;
                        }
                        const sp = /\s/.test(c);
                        if (sp && (!gs.length || gs[gs.length - 1].space)) return;
                        const g = { ch: sp ? ' ' : c, x: it.x0 + i * w, w: w, size: it.size, page: num };
                        if (sp) g.space = true;
                        else if (pct) g.pct = it;
                        gs.push(g);
                    });
                    // (a space item measures nothing: wkhtmltopdf's run across the whole line, 377 pt, had glued every
                    // word after it)
                    if (it.vis.trim()) lastX1 = lastX1 === null ? it.x1 : Math.max(lastX1, it.x1);
                });
                while (gs.length && gs[gs.length - 1].space) gs.pop();
                tcBrackets(gs);
                L.glyphs = gs;
                L.strong = { R: 0, L: 0 };
                gs.forEach(function (g) { if (R_CH.test(g.ch)) L.strong.R++; else if (L_CH.test(g.ch)) L.strong.L++; });
                L.ink = gs.filter(function (g) { return !g.space; }).length;
                L.x0 = Math.min.apply(null, L.items.map(function (it) { return it.x0; }));
                L.x1 = Math.max.apply(null, L.items.map(function (it) { return it.x1; }));
                L.size = median(L.items.map(function (it) { return it.size; })) || L.size;
                delete L.items;
            });
            return (p._tcLines = { lines: lines.filter(function (L) { return L.ink; }), H: vp.height || 842 });
        },

        // textContent: the lines of the pages around this one (two before, two after) — for its running heads and feet
        async _ladTcNeighbours(pl) {
            const all = this._ladPls || [], i = all.indexOf(pl), out = [];
            if (i < 0) return out;
            for (const j of [i - 1, i + 1, i - 2, i + 2]) {
                if (j < 0 || j >= all.length) continue;
                let t;
                try { t = await this._ladTcLines(all[j].p); } catch (e) { if (e && e.code === 'aborted') throw e; t = null; }
                if (t && t.lines.length) out.push(t);
            }
            return out;
        },

        /**
         * textContent: the page's furniture out (§6a, as _furniture has it for glyphs): a line in the top or bottom band
         * (linBandTopShare, linBandBottomShare) whose text, numbers aside, a page around it has in the same band at about
         * its height — Chrome's printed title and date, its «file:///… 1/2» —, and a lone page number there, set apart.
         */
        _ladTcFurniture(tl, near) {
            if (!this.options.dropHeaderFooter) return tl.lines;
            const bandT = this._t('linBandTopShare'), bandB = this._t('linBandBottomShare'), apart = this._t('linPageNumApartEm');
            const zone = function (L, H) { const rel = 1 - L.y / H; return rel > bandT ? 'T' : rel < bandB ? 'B' : null; };
            const text = function (L) { return nfkcArabic(L.glyphs.map(function (g) { return g.ch; }).join('')).replace(/\s+/g, ' ').trim(); };
            const key = function (L) { return L.key !== undefined ? L.key : (L.key = text(L).replace(/[0-9\u0660-\u0669\u06F0-\u06F9]+/g, '#')); };
            const D = '[0-9\u0660-\u0669\u06F0-\u06F9]{1,4}';
            const pnum = new RegExp('^[-\u2013\u2014]?\\s*((page|p\\.|\u0635\u0641\u062D\u0647)\\s*)?(' + D + '|[ivxlcdm]{1,7}|[IVXLCDM]{1,7})(\\s*(of|\\/|\u0627\u0632)\\s*' + D + ')?\\s*[-\u2013\u2014]?$', 'i');
            const ls = tl.lines, n = ls.length;
            return ls.filter(function (L, i) {
                const z = zone(L, tl.H);
                if (!z) return true;
                const k = key(L);
                if (near.some(function (t) { return t.lines.some(function (M) { return zone(M, t.H) === z && Math.abs(M.y / t.H - L.y / tl.H) * tl.H < 2 * L.size && key(M) === k; }); })) return false;
                const tx = text(L);
                if ((i === 0 || i === n - 1) && (pnum.test(tx) || pnum.test(Array.from(tx).reverse().join('')))) {
                    const nb = ls[i === 0 ? 1 : n - 2];
                    if (!nb || Math.abs(nb.y - L.y) >= apart * Math.max(L.size, nb.size)) return false;
                }
                return true;
            });
        },

        // textContent: one paragraph's lines in logical order (_joinLines: _logical, the ZWNJs the shapes show, the
        // letters), «می» always read for its ZWNJ (repairArabic): pdf.js drops ZWNJs, and the items give back only some
        // (_ladTcLines) — «می‌کند» had come back «میکند» where the page's other ZWNJs had switched the guess off
        _ladTcJoin(lines, dir) {
            const hz = this._hasZwnj;
            this._hasZwnj = false;
            let g;
            try { g = this._joinLines(lines, dir); } finally { this._hasZwnj = hz; }
            // (a number drawn «76%» as one item stays so: the glyphs' bidi, looking past the cell for a letter in a row
            // read whole — LibreOffice's table rows —, had made it an Arabic number and put its sign first, «%76»)
            for (let i = 0; i < g.length; i++) {
                const it = g[i].pct;
                if (!it || g[i].ch !== '%') continue;
                let j = i + 1; while (j < g.length && g[j].pct === it) j++;
                if (j - i > 1) { const sign = g[i]; g.splice(i, 1); g.splice(j - 1, 0, sign); }
                i = j - 1;
            }
            return g;
        },

        // the characters of some blocks, and those lost (U+FFFD, a control character, a private-use code: no letter)
        _ladInk(blocks) {
            let ink = 0, lost = 0;
            (blocks || []).forEach(function (b) { (b.glyphs || []).forEach(function (g) { if (g.space || g.atom || !g.ch || /^\s+$/.test(g.ch)) return; ink++; const c = g.ch.charCodeAt(0); if (c < 0x20 || c === 0xFFFD || c >= 0xE000 && c <= 0xF8FF) lost++; }); });
            return { ink: ink, lost: lost };
        },

        // pdf.js's text demonstrably better than the glyphs (lost glyphs, ladderDecide's tryText): at most ladTcLostShare of
        // their lost share lost, and ladTcMinInk of their characters kept
        _ladTcBetter(tc, sig) {
            const a = this._ladInk(tc), lostG = share(sig.lost || 0, sig.glyphs || 0);
            return a.ink >= this._t('ladTcMinInk') * (sig.glyphs || 0) && share(a.lost, a.ink) <= this._t('ladTcLostShare') * lostG;
        },

        // ocr: the page's pictures as its layout gave them (the scan); none, the page rendered whole — and a note
        async _ladOcr(pl, blocks) {
            const figs = (blocks || []).filter(function (b) { return b.type === 'figure'; });
            if (figs.length) return blocks;
            const v = pl.p.view || [0, 0, 595, 842];
            const img = await this._crop(pl.p, { x0: v[0], y0: v[1], x1: v[2], y1: v[3] });
            pl.p._canvas = null; pl.p._vp = null;           // (the render was for this crop only)
            return (blocks || []).concat(img ? [{ type: 'figure', img: img, bb: { x0: v[0], x1: v[2], y0: v[1], y1: v[3] } }] : []);
        },

        /**
         * r.pages and r.report (the import report, shown by the app: P3.5): each page read with its mode and confidence;
         * the summary; the pages not given in full and why; the self-diagnosis' flags and the notes, with their pages.
         */
        // kelk: a Kelk source import (its Markdown read from the file, no page laid out): the summary, every list empty
        _ladReport(qualityFlags, nPages, kelk) {
            const full = this._ladMode() === 'full';
            const recs = (this._pageModes || []).slice().sort(function (a, b) { return a.page - b.page; });
            // (a page no rung could give — its lines as they are, or nothing — is `failed: true`, shown as not read; its
            // mode the plain-lines fallback's, simplified — in 'full' mode, where nothing is simplified, 'failed')
            const modeOf = function (r) { return r.mode === 'failed' ? (full ? 'failed' : 'simplified') : r.mode; };
            const pages = recs.map(function (r) {
                const o = { page: r.page, mode: modeOf(r), conf: r.conf };
                if (r.mode === 'failed') o.failed = true;
                if (r.sig) o.sig = r.sig;
                return o;
            });
            const summary = { pages: nPages !== undefined ? nPages : recs.length, full: 0, simplified: 0, textContent: 0, ocr: 0, failed: 0, conf: 0 };
            // (the mean of the confidences known: a page whose signs could not be read has none — null)
            let nk = 0;
            recs.forEach(function (r) { summary[r.mode]++; if (r.conf !== null && r.conf !== undefined) { summary.conf += r.conf; nk++; } });
            summary.conf = nk ? +(summary.conf / nk).toFixed(3) : recs.length ? null : 1;
            if (nPages !== undefined && !recs.length) summary.full = nPages;
            const np = this._notePages || {};
            return {
                pages: pages,
                report: {
                    mode: this._ladMode(),
                    summary: summary,
                    pages: recs.filter(function (r) { return r.mode !== 'full'; }).map(function (r) { return { page: r.page, mode: modeOf(r), conf: r.conf, why: r.why.length ? r.why.slice() : ['layoutFailed'], failed: r.mode === 'failed' || undefined }; }),
                    flags: Object.keys(qualityFlags || {}).map(function (c) { return { code: c, pages: qualityFlags[c].slice() }; }),
                    // (a Kelk source: no notes here — its kelkSource stays in r.notes —, as the contract has it)
                    notes: kelk ? [] : (this.notes || []).map(function (c) { const o = { code: c }; if (np[c] && np[c].size) o.pages = Array.from(np[c]).sort(function (a, b) { return a - b; }); return o; })
                }
            };
        }
    });

    PdfImporter._ladder = { conf: ladderConf, decide: ladderDecide, names: K_NAMES, tcVisual: tcVisual, tcMarker: tcMarker, tcBrackets: tcBrackets };
})(typeof window !== 'undefined' ? window : globalThis);
