/**
 * PdfImporter — 4.9 confidence and the fallback ladder (lib/pdfimport/ladder.js)
 * ============================================================================
 * Each page's confidence (pl.conf, 0–1) from what the importer measured on it, and the mode its blocks are
 * given in: `full` (the layout as it is) → `simplified` (headings and paragraphs only: tables, lists and quotes
 * off) → `textContent` (pdf.js's own text, getTextContent(), in paragraphs by their line gaps) → `ocr` (a page
 * with no text over a picture: the picture and a note; with options.ocr 'read', its text read by OCR, 3.4). A page whose
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
        // a page's confidence times (1 − the share of its letters in garbled fonts, trust.js) to this power: a twentieth
        // garbled costs a seventh, a fifth costs half, a half nearly all
        ladGarbledPower: { def: 3, unit: 'power', fixed: true, used: U('_ladReport (a page with garbled fonts)') },
        // a page read in part by the shapes of its glyphs (trust.js _fontApprox, 3.2): its confidence times 1 − this
        // share of its letters so read — about one letter in twenty is wrong, and which one is not known
        ladApproxWeight: { def: 0.5, unit: 'share', fixed: true, used: U('_ladReport (a page read approximately)') },
        // (a caption, a page number left after the furniture, is text: a page with any is no scan to read)
        ladOcrMaxGlyphs: { def: 0, unit: 'glyphs', fixed: true, used: U('ladderDecide (a page with no text …)') },
        ladOcrPicShare: { def: 0.5, unit: 'share', fixed: true, used: U('ladderDecide (… over a picture of the page: OCR)') },
        // OCR (options.ocr 'read', 3.4): the page drawn at this resolution for Tesseract, at most this many pixels; a page
        // read under this confidence (the share of its words the language model knows) is noted; lines' sizes that grow
        // by less than this share from one to the next are one size
        ladOcrDpi: { def: 300, unit: 'dpi', fixed: true, used: U('_ladOcrPixels') },
        ladOcrMaxPx: { def: 16e6, unit: 'px', fixed: true, used: U('_ladOcrPixels (an A3 page at 300 dpi is 17 million)') },
        ladOcrLowConf: { def: 0.7, unit: 'share', fixed: true, used: U('_ladOcrPage (the note lowConf)') },
        ladOcrSizeGap: { def: 0.12, unit: 'share', fixed: true, used: U('_ladOcrPage (the lines\' sizes: one size while they grow by less)') },
        // (the middle 80 % of a Persian line's ink is about half its em: B Nazanin at 12 pt, 300 dpi, 26 px of 50 — 3.6)
        ladOcrWordWide: { def: 2.5, unit: 'ratio', fixed: true, used: U('ocrPlace (a word\'s box no wider than this many times its letters at the line\'s usual width)') },
        ladOcrStrayGap: { def: 3, unit: 'ratio', fixed: true, used: U('ocrPlace (a stray of one or two characters at a line\'s end, further than this many letters from the rest: dust, left out)') },
        ladOcrPicLine: { def: 1.4, unit: 'ratio', fixed: true, used: U('_ladOcrPage (a line with no letter this many times taller than the page\'s usual line: part of a picture)') },
        ladOcrGridMin: { def: 3, unit: 'count', fixed: true, used: U('_ladOcrPage (a table\'s grid: this many rules or more each way, meeting one another; else no rule goes to the layout)') },
        ladOcrDust: { def: 0.18, unit: 'share', fixed: true, used: U('ocrPlace (one character smaller than this share of its line\'s ink height: dust at the line\'s start, or far at its end — the lab\'s dust 7 px, its bullets 10 and 11, the lines 43 to 51)') },
        ladOcrBodyLo: { def: 0.75, unit: 'ratio', fixed: true, used: U('_ladOcrPage (a line this much of the body\'s size or more, up to ladOcrBodyHi: the body\'s size)') },
        ladOcrBodyHi: { def: 1.2, unit: 'ratio', fixed: true, used: U('_ladOcrPage (a line up to this much of the body\'s size: the body\'s; a heading is larger)') },
        ladOcrSpaceEm: { def: 0.28, unit: 'em', fixed: true, used: U('_ladOcrPage (a space glyph\'s width at most: a font\'s own space, B Nazanin\'s 0.28 em)') },
        ladOcrInkEm: { def: 0.52, unit: 'em', fixed: true, used: U('_ladOcrPage (a line\'s size in points, from its ink)') },
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
        ladTcParaRatio: { def: 1.5, unit: 'ratio', used: U('_ladParas (a paragraph gap, of the page\'s usual line pitch: textContent, OCR)').concat(U('_ladSimpleBlocks')) },
        // simplified from the lines (when the layout itself failed)
        ladHeadRatio: { def: 1.2, unit: 'ratio', used: U('_ladSimpleBlocks (a heading\'s size, of the body\'s)').concat(U('_ladParas')) },
        ladHeadMaxGlyphs: { def: 80, unit: 'glyphs', used: U('_ladSimpleBlocks').concat(U('_ladParas')) },
        ladSizeTolPt: { def: 0.6, unit: 'pt', used: U('_ladSimpleBlocks (one paragraph\'s size)').concat(U('_ladParas')) }
    });

    const clamp01 = function (x) { return x < 0 ? 0 : x > 1 ? 1 : x; };
    const share = function (a, b) { return b > 0 ? a / b : 0; };
    // OCR (_ladOcrLoad): the language read, and the files beside lib/ when no loader is given (the app's: scripts/config.js libs.pdfocr)
    const OCR_LANG = 'fas';
    const OCR_FILES = { core: 'tesseract-core-simd-lstm_7.0.0.wasm.js', model: 'fas-best.js' };
    // OCR's glyphs (3.6): a font of their own, which no font step reads (no program, no ToUnicode to check), and no glyph
    // id: one id for every letter taught lines.js that each was a word's end form, a ZWNJ after almost every letter
    const OCR_FONT = 'kelk-ocr';
    const OCR_LTR = /[0-9\u06F0-\u06F9\u0660-\u0669A-Za-z\u00C0-\u024F]/;
    /**
     * a line's words placed (pixels, in reading order): a word keeps Tesseract's box when that box comes after the last
     * one kept in the line's direction and is no wider than kWide times its letters at the line's usual width a letter;
     * the words between two kept ones share the room between them, by their letters (raw-line mode gives a box across
     * half the line now and then: its letters fell among its neighbours', «زممینری‌ابا‌ک‌…»)
     */
    const ocrPlace = function (words, box, kWide, kStray, kDust, isWord) {
        const n = function (wd) { return Array.from(wd.text).length || 1; };
        const all = words.map(function (wd) { return wd.text; }).join('');
        const rtl = (all.match(new RegExp(R_CH.source, 'g')) || []).length >= (all.match(new RegExp(L_CH.source, 'g')) || []).length;
        const per = median(words.map(function (wd) { return (wd.x1 - wd.x0) / n(wd); })) || 1, tol = 0.3 * per;
        // (dust, before anything is placed — a word at either end of the line in reading order:
        //  · one or two characters, no digit, further than kStray letters from the rest: a speck read as «.», «،» or a letter;
        //  · one character drawn smaller than kDust of the line's own ink height (box.ink, its tallest letter's top to its
        //    deepest's bottom — steady from line to line, where the middle of the ink read a fifth smaller), at the line's
        //    start, or at its end and that far: a speck read as «۰» — at the start a bullet by postCorrect, the line's
        //    ends pulled past the margin and the paragraph broken. A real bullet is larger than that, a real period at the
        //    end stands close to its word: both stay)
        const far = kStray * per, small = kDust * (box.ink || 1.75 * (box.size || per));
        const tiny = function (wd) { return n(wd) === 1 && wd.x1 - wd.x0 < small && (wd.y1 === undefined || wd.y1 - wd.y0 < small); };
        // (a two-letter word the language model knows is a word, not a speck: a cover spaces its words widely)
        const stray = function (wd) { return n(wd) <= 2 && !/[0-9\u06F0-\u06F9\u0660-\u0669]/.test(wd.text) && !(n(wd) === 2 && isWord && isWord(wd.text)); };
        const dust = new Set();
        if (words.length > 1) {
            const gapTo = function (wd, nb) { return wd.x0 >= nb.x1 ? wd.x0 - nb.x1 : nb.x0 - wd.x1; };
            [[0, 1, true], [words.length - 1, words.length - 2, false]].forEach(function (e) {
                const wd = words[e[0]], nb = words[e[1]], g = gapTo(wd, nb);
                if ((stray(wd) || tiny(wd)) && g > far || e[2] && tiny(wd)) dust.add(wd);
            });
        }
        words = words.filter(function (wd) { return !dust.has(wd); });
        let edge = rtl ? box.x1 : box.x0;
        const keep = words.map(function (wd) {
            const after = rtl ? wd.x1 <= edge + tol && wd.x0 >= box.x0 - tol : wd.x0 >= edge - tol && wd.x1 <= box.x1 + tol;
            if (!after || wd.x1 - wd.x0 > kWide * per * n(wd) + tol) return false;
            edge = rtl ? wd.x0 : wd.x1;
            return true;
        });
        const out = words.map(function (wd) { return Object.assign({}, wd); });
        const sign = rtl ? -1 : 1;
        for (let i = 0; i < out.length;) {
            if (keep[i]) { i++; continue; }
            let j = i;
            while (j < out.length && !keep[j]) j++;
            let tot = 0;
            for (let k = i; k < j; k++) tot += n(out[k]) + 1;
            // (the room: between the kept words before and after the run; at the line's end, or its start, no kept word
            // there — the run takes its letters' width at the line's usual width a letter, not the line box out to its
            // edge: specks and margins widen that box, and the line stood past the margin, a paragraph broken at it)
            let from, to;
            if (i && j < out.length) { from = rtl ? out[i - 1].x0 : out[i - 1].x1; to = rtl ? out[j].x1 : out[j].x0; }
            else if (i) { from = rtl ? out[i - 1].x0 : out[i - 1].x1; to = from + sign * tot * per; }
            else if (j < out.length) { to = rtl ? out[j].x1 : out[j].x0; from = to - sign * tot * per; }
            else { from = rtl ? box.x1 : box.x0; to = rtl ? box.x0 : box.x1; }
            from = Math.max(box.x0, Math.min(box.x1, from)); to = Math.max(box.x0, Math.min(box.x1, to));
            let at = from;
            const step = (to - from) / (tot || 1);
            for (let k = i; k < j; k++) {
                const a = at, b = at + step * n(out[k]);
                out[k].x0 = Math.min(a, b); out[k].x1 = Math.max(a, b);
                at = b + step;
            }
            i = j;
        }
        // (the line's outer words end where its ink does, inkL and inkR — Tesseract's boxes at a line's ends wander by
        // half a word, and a justified paragraph's lines then looked short or long and were broken)
        if (out.length) {
            const byX = out.slice().sort(function (a, b) { return a.x0 - b.x0; }), lw = byX[0], rw = byX[byX.length - 1];
            if (box.inkL !== null && box.inkL !== undefined && box.inkL < lw.x1 - per) lw.x0 = box.inkL;
            if (box.inkR !== null && box.inkR !== undefined && box.inkR > rw.x0 + per) rw.x1 = box.inkR;
        }
        // (two words never overlap: a space glyph over the letters before it is no word break for lines.js — the words
        // ran together, a ZWNJ between them; neighbours that touch or overlap meet halfway, a third of a letter apart)
        const vis = out.slice().sort(function (a, b) { return a.x0 - b.x0; }), gap = per / 3;
        for (let k = 1; k < vis.length; k++) {
            const a = vis[k - 1], b = vis[k];
            if (b.x0 - a.x1 >= gap) continue;
            const mid = (a.x1 + b.x0) / 2;
            a.x1 = Math.max(a.x0 + 1, mid - gap / 2); b.x0 = Math.max(b.x0, a.x1 + gap); if (b.x1 < b.x0 + 1) b.x1 = b.x0 + 1;
        }
        return out;
    };

    /**
     * a word Tesseract read, in logical order, as the glyphs a PDF would draw for it: its characters — each with the marks
     * and the ZWNJ that follow it — put in visual order (a right-to-left word reversed, its runs of digits and Latin kept
     * left to right, as the bidi algorithm shows them), spread evenly over the word's box, on the line's baseline. toPt
     * maps the page's pixels to its points; y: the baseline in points; size: the line's, in points.
     */
    const ocrWordGlyphs = function (word, toPt, y, size, seq) {
        const cl = [];
        Array.from(word.text).forEach(function (c) {
            if (cl.length && /[\p{M}\u200C\u200D]/u.test(c)) cl[cl.length - 1] += c;
            else cl.push(c);
        });
        const runs = [];
        cl.forEach(function (c) {
            const ltr = OCR_LTR.test(c), r = runs[runs.length - 1];
            if (r && r.ltr === ltr) r.cs.push(c); else runs.push({ ltr: ltr, cs: [c] });
        });
        const vis = [];
        runs.reverse().forEach(function (r) { (r.ltr ? r.cs : r.cs.slice().reverse()).forEach(function (c) { vis.push(c); }); });
        const a = toPt(word.x0, 0)[0], b = toPt(word.x1, 0)[0], x0 = Math.min(a, b), w = Math.abs(b - a) / (vis.length || 1);
        return vis.map(function (c, j) {
            return { ch: c, x: x0 + j * w, y: y, w: w, size: size, font: OCR_FONT, color: '#000000', gw: 0, unmapped: false, space: false, ocr: true, seq: seq };
        });
    };

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
            // (a page OCR has been at, 3.6 — read before the layout, _ladOcrRead: its words are its glyphs, laid out as any
            // page's; or not read, its picture kept and already noted, or listed in the report's OCR section)
            const ocrRead = pl.p.ocrRead || null, wasRead = !!(ocrRead && ocrRead.lines > 0);
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
            if (ocrRead) rec.ocr = { conf: ocrRead.conf, lines: ocrRead.lines, notes: ocrRead.notes.slice() };
            // (read with OCR: the report's mode for it, its confidence the share of its words the language model knows)
            if (wasRead && rec.mode !== 'failed') { rec.mode = 'ocr'; rec.why = ['noText']; rec.conf = ocrRead.conf; this._fire('ladder.ocrRead', pl); }
            if (rec.mode !== 'full' && rec.mode !== 'failed') {
                this._fire('ladder.' + rec.mode, pl);
                const NOTE = { simplified: ['pageSimplified', 'Page ' + pl.p.num + ' was given in a simplified form (headings and paragraphs only)'],
                    textContent: ['pageTextOnly', 'Page ' + pl.p.num + ' is given as its plain text (pdf.js\'s text layer)'],
                    ocr: ['ocrNeeded', 'Page ' + pl.p.num + ' has no text, only a picture: it needs OCR; the picture is kept'] }[rec.mode];
                // (safe mode simplifies every page: that is the caller's choice, not a finding; a page OCR has been at is
                // noted by _ladOcrRead, or listed in the report's OCR section)
                if (!(rec.mode === 'simplified' && rec.why.length === 1 && rec.why[0] === 'safeMode') && !ocrRead) this._note(NOTE[0], NOTE[1] + ' (' + rec.why.join(', ') + ').', pl.p.num);
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
            return this._ladParas(lines, function (ls, dir) { return self._ladTcJoin(ls, dir); }, 'textContent');
        },

        /**
         * A page's lines, top down, in paragraphs by their line gaps (the textContent rung, OCR): lines one paragraph
         * while their gap is the page's usual pitch, their size and direction stay and no list number opens the next;
         * a short paragraph set larger than the body a heading. lines: [{ y (its baseline or foot, pt, down the page),
         * size, rtl, marker, ink (its characters) }]; join(lines, dir) → the paragraph's glyphs; mark: the blocks' flag
         * ('textContent', 'ocr'). → [{ type: 'p' | 'heading', size, glyphs, dir, [mark]: true }]
         */
        _ladParas(lines, join, mark) {
            const kPara = this._t('ladTcParaRatio'), kHead = this._t('ladHeadRatio'), kMax = this._t('ladHeadMaxGlyphs'), kTol = this._t('ladSizeTolPt');
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
                const b = { type: head ? 'heading' : 'p', size: cur.size, glyphs: join(cur.lines, dir), dir: dir };
                b[mark] = true;
                out.push(b);
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
         * OCR (options.ocr 'read'; 3.4, before the fonts and the layout from 3.6): the pages that are one picture and no text
         * — the ladder's own test for its `ocr` rung (ladOcrMaxGlyphs, ladOcrPicShare, _ladOcrWants) —, within
         * options.ocrPages, read a line at a time: the step 'ocrLoad' while the engine loads, then 'ocr' named by its page
         * and line (hooks.onStage(stage, done, total, [page, line, lines])); the import's Cancel is checked between lines
         * (_yield). A page read gets its words as glyphs (_ladOcrPage), in a font of their own that no font step reads, and
         * loses its picture: the layout and the ladder take it as any page with text. p.ocrRead { conf, lines, notes } goes
         * to the report's own list (report.ocr). A page with no line read keeps its picture; one that could not be read,
         * too, with the note ocrPageFailed; an engine that could not start, the note ocrFailed (the pages: ocrNeeded, by the
         * ladder). The engine stays for the decipherment's votes (trust.js _decOcrEngine) until _ladOcrEnd.
         */
        async _ladOcrRead(pages) {
            if (this.options.ocr !== 'read') return;
            const only = this.options.ocrPages, self = this;
            const queue = pages.filter(function (p) { return (!Array.isArray(only) || only.indexOf(p.num) >= 0) && self._ladOcrWants(p); });
            if (!queue.length) return;
            this._stage('ocrLoad', 0, 1);
            let eng = null, why = '';
            try { eng = await this._ladOcrLoad(); } catch (e) { if (e && e.code === 'aborted') throw e; why = e && e.message || String(e); }
            if (!eng) { this._note('ocrFailed', 'OCR could not start' + (why ? ': ' + why : ' (its engine is not there)') + '; the scanned pages are kept as pictures.'); return; }
            this._ocrEngine = eng;
            const kP = this._t('ladOcrPicShare');
            for (let k = 0; k < queue.length; k++) {
                const p = queue[k], num = p.num;
                let res = null;
                try { res = await this._ladOcrPage(eng, p, k, queue.length); } catch (e) {
                    if (e && e.code === 'aborted') throw e;
                    p.ocrRead = { conf: null, lines: 0, notes: ['failed'] };
                    this._note('ocrPageFailed', 'Page ' + num + ' could not be read with OCR: ' + (e && e.message || e) + '; its picture is kept.', num);
                }
                if (!res) continue;
                p.ocrRead = { conf: res.conf, lines: res.lines, notes: res.notes };
                if (!res.glyphs.length) continue;
                // (its words take the picture's place: the scan itself goes, its own pictures and a grid's rules come in)
                const v = p.view || [0, 0, 595, 842], area = Math.abs((v[2] - v[0]) * (v[3] - v[1])) || 1;
                p.images = (p.images || []).filter(function (b) { return (b.x1 - b.x0) * (b.y1 - b.y0) / area < kP; }).concat(res.figures);
                p.glyphs = p.glyphs.concat(res.glyphs);
                p.hsegs = (p.hsegs || []).concat(res.hsegs);
                p.vsegs = (p.vsegs || []).concat(res.vsegs);
            }
        },

        /** one picture and no text: the `ocr` rung's test (ladderDecide), on the page as read (its glyphs, its pictures) */
        _ladOcrWants(p) {
            if (!p || p.failed) return false;
            let n = 0;
            (p.glyphs || []).forEach(function (g) { if (!g.space && g.ch && g.ch.trim()) n++; });
            if (n > this._t('ladOcrMaxGlyphs')) return false;
            const v = p.view || [0, 0, 595, 842], area = Math.abs((v[2] - v[0]) * (v[3] - v[1])) || 1;
            return (p.images || []).some(function (b) { return (b.x1 - b.x0) * (b.y1 - b.y0) / area >= this._t('ladOcrPicShare'); }, this);
        },

        /** the engine given back, after the fonts (the decipherment's votes use it) or when the import stops */
        _ladOcrEnd() {
            const e = this._ocrEngine;
            this._ocrEngine = null;
            if (e) { try { e.reader.end(); } catch (err) { /* gone already */ } }
        },

        /** the engine, once an import: the core, the model and the words — loaded on demand (options.loadOcr) */
        async _ladOcrLoad() {
            const O = function () { return PdfImporter._ocr; };
            const have = function () { return !!(O() && global.TesseractCore && global.KelkOcrModels && global.KelkOcrModels[OCR_LANG] && PdfImporter._lmFa); };
            if (!have()) {
                if (this.options.loadOcr) await this.options.loadOcr();
                else if (typeof document === 'undefined' && typeof require === 'function') {
                    require('./ocr.js');
                    require('./lm-fa.js');
                    if (!global.TesseractCore) global.TesseractCore = require('../../vendor/tesseract/' + OCR_FILES.core);
                    require('../../vendor/tesseract/' + OCR_FILES.model);
                } else {
                    const base = this.options.partsBase || (function () {
                        const el = document.querySelector('script[src*="pdfimport/ladder.js"]');
                        return el ? el.src.replace(/[^/]*$/, '') : 'lib/pdfimport/';
                    })();
                    if (!O()) await this._loadScript(base + 'ocr.js');
                    if (!PdfImporter._lmFa) await this._loadScript(base + 'lm-fa.js');
                    if (!global.TesseractCore) await this._loadScript(base + '../../vendor/tesseract/' + OCR_FILES.core);
                    if (!(global.KelkOcrModels && global.KelkOcrModels[OCR_LANG])) await this._loadScript(base + '../../vendor/tesseract/' + OCR_FILES.model);
                }
            }
            if (!have()) return null;
            const reader = await O().engine({ core: global.TesseractCore, model: O().model(global.KelkOcrModels[OCR_LANG]), lang: OCR_LANG });
            return { reader: reader, vocab: new Set(Object.keys(PdfImporter._lmFa.vocab || {})) };
        },

        /** the page drawn for Tesseract (ladOcrDpi, at most ladOcrMaxPx pixels), in gray: { px, w, h, scale }; null without a canvas */
        async _ladOcrPixels(p) {
            if (typeof document === 'undefined' || !p.page) return null;
            const vp1 = this._pageViewport(p, 1);
            let scale = this._t('ladOcrDpi') / 72;
            const max = this._t('ladOcrMaxPx');
            if (vp1.width * vp1.height * scale * scale > max) scale = Math.sqrt(max / (vp1.width * vp1.height));
            const vp = this._pageViewport(p, scale);
            const cv = document.createElement('canvas');
            cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
            try {
                const ctx = cv.getContext('2d', { willReadFrequently: true });
                ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
                await p.page.render({ canvasContext: ctx, viewport: vp, canvas: cv }).promise;
                const px = PdfImporter._ocr.gray(ctx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height);
                // (a pixel back to the page's points: the viewport's map, turned round)
                const o = vp.convertToViewportPoint(0, 0), ex = vp.convertToViewportPoint(1, 0), ey = vp.convertToViewportPoint(0, 1);
                const a = ex[0] - o[0], b = ey[0] - o[0], c = ex[1] - o[1], d = ey[1] - o[1], det = a * d - b * c;
                const toPt = function (u, w) { const du = u - o[0], dv = w - o[1]; return [(d * du - b * dv) / det, (a * dv - c * du) / det]; };
                return { px: px, w: cv.width, h: cv.height, scale: scale, toPt: toPt };
            } finally { cv.width = cv.height = 0; }           // (its memory given back at once)
        },

        /**
         * one page read with OCR (k of n in _ladOcrRead): its lines found, each read on its own, a step and a check for
         * Cancel before each; → { glyphs, conf, lines, notes } — its words as glyphs where Tesseract saw them (ocrWordGlyphs:
         * a line's words on its baseline, a space between two words, a line's size from its ink, ladOcrInkEm, sizes close
         * together one size), the share of its words the language model knows (lm-fa.js, as tools/build-lm.js counts
         * them), the lines read, the notes (noLines, lowConf; columns: two columns side by side that a word Tesseract
         * read runs across, so the layout cannot tell them apart); null when it could not be drawn
         */
        async _ladOcrPage(eng, p, k, n) {
            const num = p.num, O = PdfImporter._ocr;
            const pix = await this._ladOcrPixels(p);
            if (!pix) return null;
            const pg = O.page(pix.px, pix.w, pix.h);
            pix.px = null;
            const nL = pg.boxes.length, read = [], kWide = this._t('ladOcrWordWide'), kStray = this._t('ladOcrStrayGap'), kDust = this._t('ladOcrDust');
            for (let i = 0; i < nL; i++) {
                this._stage('ocr', k + i / nL, n, [num, i + 1, nL]);
                await this._yield();
                const r = eng.reader.line(pg, i);
                // (Tesseract's bidi marks round a word it read left to right — «‏قاتا‎» — are no text)
                const text = O.postCorrect(r.text.replace(/[\u200E\u200F\u202A-\u202E]/g, ''), eng.vocab).replace(/\s+/g, ' ').trim();
                if (!text) continue;
                // (the words with their boxes, the line's text corrected: word for word when they agree in number, each
                // word corrected on its own when not, the whole line one word when Tesseract gave no boxes)
                const toks = text.split(' ');
                let words = (r.words || []).filter(function (wd) { return wd.x1 > wd.x0; });
                if (words.length === toks.length) words = words.map(function (wd, j) { return Object.assign({}, wd, { text: toks[j] }); });
                else if (words.length) words = words.map(function (wd) { return Object.assign({}, wd, { text: O.postCorrect(wd.text, eng.vocab).trim() }); }).filter(function (wd) { return wd.text; });
                else words = [{ text: text, x0: pg.boxes[i].x0, y0: pg.boxes[i].y0, x1: pg.boxes[i].x1, y1: pg.boxes[i].y1 }];
                // (a lone character at either end of the line measured by its own ink, not Tesseract's box — a speck read
                // «۰» came with a box the line's whole height; ocrPlace tells dust by its size)
                if (pg.ink) [0, words.length - 1].forEach(function (k) {
                    const wd = words[k];
                    if (!wd || Array.from(wd.text).length !== 1 || wd.ink) return;
                    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
                    for (let y = Math.max(0, Math.round(wd.y0)); y < Math.min(pg.h, Math.round(wd.y1)); y++) for (let x = Math.max(0, Math.round(wd.x0)); x < Math.min(pg.w, Math.round(wd.x1)); x++) if (pg.ink[y * pg.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
                    words[k] = x1 < 0 ? Object.assign({}, wd, { x1: wd.x0 + 1, y1: wd.y0 + 1, ink: true }) : Object.assign({}, wd, { x0: x0, y0: y0, x1: x1 + 1, y1: y1 + 1, ink: true });
                });
                // (the line's own ink, left to right: from the first column of a run of ink at least a letter wide to the last
                // — a speck, narrower, is not its end)
                let inkL = null, inkR = null;
                if (pg.ink) {
                    const b = pg.boxes[i], minRun = Math.max(4, Math.round(0.5 * b.size));
                    const col = function (x) { for (let y = b.y0; y < b.y1; y++) if (pg.ink[y * pg.w + x]) return true; return false; };
                    for (let x = b.x0, run = 0; x < b.x1 && inkL === null; x++) { run = col(x) ? run + 1 : 0; if (run >= minRun) inkL = x - run + 1; }
                    for (let x = b.x1 - 1, run = 0; x >= b.x0 && inkR === null; x--) { run = col(x) ? run + 1 : 0; if (run >= minRun) inkR = x + run; }
                }
                read.push({ box: Object.assign({}, pg.boxes[i], { inkL: inkL, inkR: inkR }), text: text, conf: r.conf, words: words });
            }
            // (the page's pictures go at once — its gray copies, and pdf.js's decoded image of the page, kept by its
            // render: a scanned book's pages each hold several megabytes; only the lines' words and boxes stay)
            const cols = pg.columns, rules = pg.rules || { h: [], v: [] }, tall = pg.tall || [];
            pg.clean = null; pg.ink = null;
            try { if (p.page && p.page.cleanup) p.page.cleanup(); } catch (e) { /* busy: let it be */ }
            this._stage('ocr', k + 1, n, [num, nL, nL]);
            await this._yield();
            // (pictures inside the page, 3.6: a line with no letter whose rows are much taller than a line of text — a
            // drawing's parts, read «0 ۵ 6 ۵» —, or a line of brackets and marks alone, and every run too tall to be a
            // line; regions close together one, with the rules that touch them — a drawing's frame and paths are its own)
            const typH = median(read.map(function (L) { return L.box.y1 - L.box.y0; })) || 1, kPic = this._t('ladOcrPicLine'), kGrid = this._t('ladOcrGridMin');
            const LETTER = /[\u0621-\u064A\u066E-\u06D3\u06FA-\u06FFA-Za-z]/, MARKS_ONLY = /^[\s\p{P}\p{S}]+$/u;
            const isPic = function (L) { return !LETTER.test(L.text) && (L.box.y1 - L.box.y0 > kPic * typH || MARKS_ONLY.test(L.text)); };
            let regs = read.filter(isPic).map(function (L) { return { x0: L.box.x0, y0: L.box.y0, x1: L.box.x1, y1: L.box.y1 }; }).concat(tall.map(function (t) { return Object.assign({}, t); }));
            for (let i = read.length - 1; i >= 0; i--) if (isPic(read[i])) read.splice(i, 1);
            regs.sort(function (a, b) { return a.y0 - b.y0; });
            const near = function (a, b, d) { return a.x0 - d < b.x1 && b.x0 - d < a.x1 && a.y0 - d < b.y1 && b.y0 - d < a.y1; };
            const grow = function (a, b) { a.x0 = Math.min(a.x0, b.x0); a.y0 = Math.min(a.y0, b.y0); a.x1 = Math.max(a.x1, b.x1); a.y1 = Math.max(a.y1, b.y1); };
            const merged = [];
            regs.forEach(function (r) { const m = merged.find(function (o) { return near(o, r, typH); }); if (m) grow(m, r); else merged.push(r); });
            regs = merged;
            const hs = rules.h.map(function (r) { return { x0: r.b0, x1: r.b1, y0: r.a, y1: r.a + 1 }; }), vs = rules.v.map(function (r) { return { x0: r.a, x1: r.a + 1, y0: r.b0, y1: r.b1 }; });
            const used = new Set();
            let more = true;
            while (more) {
                more = false;
                hs.concat(vs).forEach(function (sg) { if (used.has(sg)) return; const m = regs.find(function (o) { return near(o, sg, typH / 2); }); if (m) { grow(m, sg); used.add(sg); more = true; } });
            }
            // (no text line inside a picture: a drawing's label read as a line stays text only outside it)
            const inPic = function (L) { return regs.some(function (o) { return L.box.y0 >= o.y0 && L.box.y1 <= o.y1 && L.box.x0 >= o.x0 && L.box.x1 <= o.x1; }); };
            for (let i = read.length - 1; i >= 0; i--) if (inPic(read[i])) read.splice(i, 1);
            const pt = function (x, y) { return pix.toPt(x, y); };
            const box = function (o) { const a = pt(o.x0, o.y0), b = pt(o.x1, o.y1); return { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) }; };
            const figures = regs.map(function (o) { return Object.assign(box(o), { seq: -1, objId: null, ocr: true }); });
            // (only a table's grid goes to the layout: rules that meet one another, three or more each way — a lone rule,
            // the line under a running head, came out as `---` between paragraphs, 66 times on a real scanned book; a page's
            // frame, with that line, kept its running heads; both are left out)
            const all = hs.concat(vs).filter(function (sg) { return !used.has(sg); }), seen = new Set();
            all.forEach(function (sg) {
                if (seen.has(sg)) return;
                const grp = [sg], isH = function (x) { return hs.indexOf(x) >= 0; };
                seen.add(sg);
                for (let k = 0; k < grp.length; k++) {
                    all.forEach(function (o) { if (!seen.has(o) && isH(o) !== isH(grp[k]) && near(grp[k], o, typH / 4)) { seen.add(o); grp.push(o); } });
                }
                const nh = grp.filter(isH).length;
                if (nh < kGrid || grp.length - nh < kGrid) grp.forEach(function (o) { used.add(o); });
            });
            const hsegs = hs.filter(function (sg) { return !used.has(sg); }).map(function (sg) { const b = box(sg); return { x0: b.x0, x1: b.x1, y: (b.y0 + b.y1) / 2, color: '#000000', ocr: true }; });
            const vsegs = vs.filter(function (sg) { return !used.has(sg); }).map(function (sg) { const b = box(sg); return { y0: b.y0, y1: b.y1, x: (b.x0 + b.x1) / 2, color: '#000000', ocr: true }; });
            const notes = [];
            if (!read.length) notes.push('noLines');
            if (cols && read.some(function (L) { return L.words.some(function (wd) { return wd.x0 < cols.x0 && wd.x1 > cols.x1; }); })) notes.push('columns');
            // (sizes close together one size: sorted, a step of more than ladOcrSizeGap starts the next, their median)
            const kGap = this._t('ladOcrSizeGap'), inkEm = this._t('ladOcrInkEm'), spEm = this._t('ladOcrSpaceEm'), sc = pix.scale;
            const order = read.map(function (L, i) { return i; }).sort(function (a, b) { return read[a].box.size - read[b].box.size; });
            const snap = [];
            let group = [];
            const close = function () { const m = read[group[group.length >> 1]].box.size; group.forEach(function (i) { snap[i] = m; }); group = []; };
            order.forEach(function (i, j) {
                if (j && read[i].box.size > read[order[j - 1]].box.size * (1 + kGap)) close();
                group.push(i);
            });
            if (group.length) close();
            // (the body's size — the one most lines have — for every line near it: a line's ink varies with its letters, a
            // paragraph's last line read a fifth smaller and started a paragraph of its own; a heading, well above it, and a
            // running head, well below, keep their own)
            const count = {};
            snap.forEach(function (v) { count[v] = (count[v] || 0) + 1; });
            const body = +Object.keys(count).sort(function (a, b) { return count[b] - count[a] || a - b; })[0];
            const bLo = this._t('ladOcrBodyLo'), bHi = this._t('ladOcrBodyHi');
            snap.forEach(function (v, i) { if (v >= bLo * body && v <= bHi * body) snap[i] = body; });
            // (the words placed, now that the lines' sizes are settled)
            read.forEach(function (L, i) { L.words = ocrPlace(L.words, Object.assign({}, L.box, { size: snap[i] }), kWide, kStray, kDust, function (t) { return !!(eng.vocab && eng.vocab.has(t)); }); });
            // (a word's box that reaches over a table's vertical rule keeps to the side that holds most of it: «مطالع | ه»
            // was one word cut by the cell's edge)
            const vr = vs.filter(function (sg) { return !used.has(sg); });
            read.forEach(function (L) {
                L.words.forEach(function (wd) {
                    vr.forEach(function (sg) {
                        if (sg.y1 < L.box.y0 || sg.y0 > L.box.y1 || !(wd.x0 < sg.x0 && wd.x1 > sg.x1)) return;
                        if (sg.x0 - wd.x0 >= wd.x1 - sg.x1) wd.x1 = sg.x0 - 1; else wd.x0 = sg.x1 + 1;
                    });
                });
            });
            const glyphs = [];
            let seq = 0;
            read.forEach(function (L, i) {
                const y = pix.toPt(0, L.box.base)[1], size = snap[i] / sc / inkEm;
                const ws = L.words.slice().sort(function (a, b) { return a.x0 - b.x0; });
                ws.forEach(function (wd, j) {
                    if (j) {
                        // (a space as wide as a font's own, at the end of the word on its left — a gap wider than that
                        // stays a gap: a column's gutter, a table's cells, as in a PDF that draws its spaces)
                        const a = pix.toPt(ws[j - 1].x1, 0)[0], b = pix.toPt(wd.x0, 0)[0];
                        glyphs.push({ ch: ' ', x: Math.min(a, b), y: y, w: Math.min(Math.abs(b - a), spEm * size), size: size, font: OCR_FONT, color: '#000000', gw: 0, unmapped: false, space: true, ocr: true, seq: seq++ });
                    }
                    ocrWordGlyphs(wd, pix.toPt, y, size, seq++).forEach(function (g) { glyphs.push(g); });
                });
            });
            // (its confidence: the share of its Persian words the language model knows — Tesseract's own scores read
            // high on lines that are wrong)
            const kn = O.known(read.map(function (L) { return L.text; }).join('\n'), eng.vocab);
            const conf = kn.words ? +(kn.known / kn.words).toFixed(3) : 0;
            if (read.length && conf < this._t('ladOcrLowConf')) notes.push('lowConf');
            return { glyphs: glyphs, conf: conf, lines: read.length, notes: notes, figures: figures, hsegs: hsegs, vsegs: vsegs };
        },

        /**
         * r.pages and r.report (the import report, shown by the app): each page read with its mode and confidence;
         * the summary; the pages not given in full and why; the self-diagnosis' flags and the notes, with their pages.
         */
        // kelk: a Kelk source import (its Markdown read from the file, no page laid out): the summary, every list empty
        _ladReport(qualityFlags, nPages, kelk) {
            const full = this._ladMode() === 'full';
            const recs = (this._pageModes || []).map(function (r) { return Object.assign({}, r); }).sort(function (a, b) { return a.page - b.page; });
            // (a page no rung could give — its lines as they are, or nothing — is `failed: true`, shown as not read; its
            // mode the plain-lines fallback's, simplified — in 'full' mode, where nothing is simplified, 'failed')
            const modeOf = function (r) { return r.mode === 'failed' ? (full ? 'failed' : 'simplified') : r.mode; };
            // (trust.js: a page's confidence falls with the share of its letters drawn in fonts whose text is no language)
            const gar = (this._garbled && this._garbled.share) || {}, GP = this._t('ladGarbledPower');
            recs.forEach(function (r) { if (gar[r.page] && r.conf !== null && r.conf !== undefined) r.conf = +(r.conf * Math.pow(1 - gar[r.page], GP)).toFixed(3); });
            const apx = (this._approx && this._approx.share) || {}, AW = this._t('ladApproxWeight');
            recs.forEach(function (r) { if (apx[r.page] && r.conf !== null && r.conf !== undefined) r.conf = +(r.conf * (1 - AW * apx[r.page])).toFixed(3); });
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
                    // (the pages read with OCR, 3.4: their own list, apart from the fonts' findings — each with its confidence,
                    // the lines read and its notes: noLines, lowConf, failed)
                    ocr: recs.filter(function (r) { return r.ocr; }).map(function (r) { return { page: r.page, conf: r.ocr.conf, lines: r.ocr.lines, notes: r.ocr.notes.slice() }; }),
                    // (a Kelk source: no notes here — its kelkSource stays in r.notes —, as the contract has it)
                    notes: kelk ? [] : (this.notes || []).map(function (c) {
                        const o = { code: c };
                        if (np[c] && np[c].size) o.pages = Array.from(np[c]).sort(function (a, b) { return a - b; });
                        if (c === 'garbledText' && this._garbled) o.fonts = this._garbled.fonts.slice();
                        if (c === 'fontApprox' && this._approx) o.fonts = this._approx.fonts.slice();
                        return o;
                    }, this)
                }
            };
        }
    });

    PdfImporter._ladder = { conf: ladderConf, decide: ladderDecide, names: K_NAMES, tcVisual: tcVisual, tcMarker: tcMarker, tcBrackets: tcBrackets, ocrPlace: ocrPlace, ocrWordGlyphs: ocrWordGlyphs, OCR_FONT: OCR_FONT };
})(typeof window !== 'undefined' ? window : globalThis);
