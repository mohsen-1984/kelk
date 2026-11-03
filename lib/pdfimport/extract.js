/**
 * PdfImporter — 1. extract and repair, 2. fonts (lib/pdfimport/extract.js)
 * ============================================================================
 * Per page: glyphs from pdf.js's operator list, paths, images, links; /ActualText and the raw content
 * streams; Unicode repairs for glyphs that have none (GSUB, widths, symbol fonts, twins); each font
 * classified regular / bold / italic / monospace. PDFIMPORT.md §4, §5.
 *
 * Part of PdfImporter: load after lib/PdfImporter.js (see its header for the order). The methods
 * are those of the class, added to its prototype; the helpers come from the core.
 */
(function (global) {
    'use strict';
    const PdfImporter = global.PdfImporter || (typeof require === 'function' ? require('../PdfImporter.js') : null);
    const { MARK_CH, CTRL, MIRROR, digitValue, PF, ISOLATED, median, mode, mul, apply, bboxOf, inside, dingbat,
            fontFace, sfntLigatures, latin1, markedTexts, provenance } = PdfImporter._internal;

    // the layout literals of this part (thresholds.js): read with this._t(name, p), hoisted out of the per-glyph loops
    const X = 'extract.js ';
    PdfImporter._defineThresholds({
        // glyph boxes, shared by several steps
        extGlyphHeightEm: { def: 0.7, unit: 'em', used: [X + '_mathIn', X + '_opGlyphs (clip)'] },
        extGlyphMidEm: { def: 0.3, unit: 'em', used: [X + '_hideCovered', X + '_classifyFonts'] },
        extAxisTolPt: { def: 0.6, unit: 'pt', fixed: true, used: [X + '_opPaths', X + '_opShape'] },
        // formulas from Kelk's map
        extMathBoxTolPt: { def: 1, unit: 'pt', used: [X + '_mathIn'] },
        extMathBoxGrowPt: { def: 2, unit: 'pt', used: [X + '_mathIn'] },
        extMathBodyPt: { def: 10, unit: 'pt', used: [X + '_mathIn (no text on the page)'] },
        extMathBaselineEm: { def: 0.4, unit: 'em', used: [X + '_mathIn'] },
        // font programs and their tables
        extOutlineJoinsMinLetters: { def: 8, unit: 'glyphs', used: [X + '_outlineJoins'] },
        extBogusMinDiffer: { def: 3, unit: 'count', used: [X + '_gsubBogus'] },
        extBogusDifferRatio: { def: 2, unit: 'ratio', used: [X + '_gsubBogus'] },
        extColourLayerTolPt: { def: 0.2, unit: 'pt', used: [X + '_gsubColour'] },
        extArTrustMinAgree: { def: 20, unit: 'count', used: [X + '_gsubArTrust'] },
        extArTrustRatio: { def: 4, unit: 'ratio', used: [X + '_gsubArTrust'] },
        extMarkAdvanceEm: { def: 0.05, unit: 'em', used: [X + '_gsubGlyph'] },
        extSpaceAdvanceEm: { def: 0.1, unit: 'em', used: [X + '_gsubGlyph'] },
        extLostLineEm: { def: 0.5, unit: 'em', used: [X + '_gsubLost'] },
        // the operator walk
        extRotatedSkew: { def: 0.2, unit: 'ratio', fixed: true, used: [X + '_opGlyphs'] },
        extSmallClipShare: { def: 0.125, unit: 'share', used: [X + '_opGlyphs'] },
        extClipTolPt: { def: 1, unit: 'pt', used: [X + '_opGlyphs'] },
        extImageMinPt: { def: 2, unit: 'pt', used: [X + '_opImages'] },
        extImageShownMin: { def: 0.1, unit: 'share', used: [X + '_opImages'] },
        extImageAlphaMin: { def: 0.05, unit: 'share', used: [X + '_opImages'] },
        extSmallMarkMaxPt: { def: 14, unit: 'pt', used: [X + '_opShape'] },
        extSmallMarkMinPt: { def: 1.5, unit: 'pt', used: [X + '_opShape'] },
        extSmallMarkPt: { def: 10, unit: 'pt', used: [X + '_opShape'] },
        extRboxSideMinPt: { def: 1.5, unit: 'pt', used: [X + '_opShape'] },
        extRboxCornerShare: { def: 0.6, unit: 'share', used: [X + '_opShape'] },
        extRboxCornerPadPt: { def: 0.3, unit: 'pt', used: [X + '_opShape'] },
        extRboxMinPt: { def: 6, unit: 'pt', used: [X + '_opShape'] },
        extRboxEdgeTolPt: { def: 0.4, unit: 'pt', used: [X + '_opShape'] },
        extRectMinPt: { def: 0.3, unit: 'pt', used: [X + '_opShape (box; flat rule)'] },
        extRoundRectMaxCurves: { def: 48, unit: 'count', used: [X + '_opShape'] },
        extRoundRectMaxSegs: { def: 8, unit: 'count', used: [X + '_opShape'] },
        extRoundRectMinWPt: { def: 12, unit: 'pt', used: [X + '_opShape'] },
        extRoundRectMinHPt: { def: 8, unit: 'pt', used: [X + '_opShape'] },
        extRoundRectCornerMaxPt: { def: 20, unit: 'pt', used: [X + '_opShape'] },
        extRoundRectCornerPadPt: { def: 0.5, unit: 'pt', used: [X + '_opShape'] },
        extRoundRectEdgeTolPt: { def: 0.6, unit: 'pt', used: [X + '_opShape'] },
        extRoundRectSideMinPt: { def: 2, unit: 'pt', used: [X + '_opShape'] },
        extPatternMinPt: { def: 12, unit: 'pt', used: [X + '_opShape'] },
        extOpaqueAlpha: { def: 0.99, unit: 'share', used: [X + '_opShape'] },
        extRuleMinPt: { def: 1, unit: 'pt', used: [X + '_opShape'] },
        extFlatRuleMinPt: { def: 2, unit: 'pt', used: [X + '_opShape'] },
        extThinShapeMaxPt: { def: 2, unit: 'pt', used: [X + '_opShape'] },
        extThinShapeMinLenPt: { def: 4, unit: 'pt', used: [X + '_opShape'] },
        extThinShapeAspect: { def: 4, unit: 'ratio', used: [X + '_opShape'] },
        extFrameMinSegs: { def: 5, unit: 'count', used: [X + '_opShape'] },
        extFrameMaxSegs: { def: 12, unit: 'count', used: [X + '_opShape'] },
        extFrameMinPt: { def: 2, unit: 'pt', used: [X + '_opShape'] },
        extFrameAreaRatio: { def: 2.2, unit: 'pt', used: [X + '_opShape (area ≤ k × (w + h))'] },
        extFrameEdgeShare: { def: 0.6, unit: 'share', used: [X + '_opShape'] },
        extFrameEdgeTolPt: { def: 0.3, unit: 'pt', used: [X + '_opShape'] },
        extThinRectMaxPt: { def: 2, unit: 'pt', used: [X + '_opShape'] },
        extThinRectMinLenPt: { def: 2, unit: 'pt', used: [X + '_opShape'] },
        extRuleClipTolPt: { def: 1, unit: 'pt', used: [X + '_opShape (a rule\'s shown part)'] },
        // after the walk
        extZwnjLineTolPt: { def: 0.5, unit: 'pt', used: [X + '_unicodeRepair'] },
        extZwnjAdvanceEm: { def: 0.05, unit: 'em', used: [X + '_unicodeRepair'] },
        extZwnjTakenShare: { def: 0.6, unit: 'share', used: [X + '_unicodeRepair'] },
        extCopySizeTolPt: { def: 0.1, unit: 'pt', used: [X + '_unicodeRepair'] },
        extFakeBoldYEm: { def: 0.05, unit: 'em', used: [X + '_unicodeRepair'] },
        extFakeBoldEm: { def: 0.08, unit: 'em', used: [X + '_unicodeRepair'] },
        extFakeBoldWidthShare: { def: 0.25, unit: 'share', used: [X + '_unicodeRepair'] },
        extFakeBoldMinWPt: { def: 0.5, unit: 'pt', used: [X + '_unicodeRepair'] },
        extTwiceTolPt: { def: 0.3, unit: 'pt', used: [X + '_unicodeRepair'] },
        extTwiceSizeTolPt: { def: 0.5, unit: 'pt', used: [X + '_unicodeRepair'] },
        extCoverMinWPt: { def: 8, unit: 'pt', used: [X + '_hideCovered'] },
        extCoverMinHPt: { def: 6, unit: 'pt', used: [X + '_hideCovered'] },
        extMaskedCoverMinPt: { def: 40, unit: 'pt', used: [X + '_hideCovered'] },
        extMaskedCoverMinGlyphs: { def: 10, unit: 'glyphs', used: [X + '_hideCovered'] },
        extMaskedInsetMaxPt: { def: 12, unit: 'pt', used: [X + '_hideCovered'] },
        extMaskedInsetShare: { def: 0.15, unit: 'share', used: [X + '_hideCovered'] },
        extCoverEdgePt: { def: 0.5, unit: 'pt', used: [X + '_hideCovered'] },
        extPictureHiddenShare: { def: 0.25, unit: 'share', used: [X + '_hideCovered'] },
        extCodeRepairMinSame: { def: 10, unit: 'glyphs', used: [X + '_codeRepair'] },
        extCodeRepairRatio: { def: 9, unit: 'ratio', used: [X + '_codeRepair'] },
        extCodeRepairMinAlone: { def: 4, unit: 'glyphs', used: [X + '_codeRepair'] },
        extDashMinThickPt: { def: 0.05, unit: 'pt', used: [X + '_dashedRules'] },
        extDashMaxThickPt: { def: 2, unit: 'pt', used: [X + '_dashedRules'] },
        extDashMaxLenPt: { def: 10, unit: 'pt', used: [X + '_dashedRules'] },
        extDashAspect: { def: 1.5, unit: 'ratio', used: [X + '_dashedRules'] },
        extDotMaxPt: { def: 1.6, unit: 'pt', used: [X + '_dashedRules'] },
        extDashMinRun: { def: 4, unit: 'count', used: [X + '_dashedRules'] },
        extDashMinSpanPt: { def: 20, unit: 'pt', used: [X + '_dashedRules'] },
        extDashSameLenPt: { def: 0.6, unit: 'pt', used: [X + '_dashedRules'] },
        extDashOverlapPt: { def: 0.3, unit: 'pt', used: [X + '_dashedRules'] },
        extDashGapRatio: { def: 2.5, unit: 'ratio', used: [X + '_dashedRules'] },
        extDashGapMinPt: { def: 3, unit: 'pt', used: [X + '_dashedRules'] },
        extTinyMinGlyphs: { def: 20, unit: 'glyphs', used: [X + '_tinyText'] },
        extTinyPageMinPt: { def: 6, unit: 'pt', used: [X + '_tinyText'] },
        extTinyMaxPt: { def: 2, unit: 'pt', used: [X + '_tinyText'] },
        // presentation forms
        extFormsTailRatio: { def: 1.15, unit: 'ratio', used: [X + '_formsRuns'] },
        extFormsMinLetters: { def: 3, unit: 'count', used: [X + '_formsRuns'] },
        extFormsRatio: { def: 3, unit: 'ratio', used: [X + '_formsRuns'] },
        extFormsJoinGapEm: { def: 0.15, unit: 'em', used: [X + '_formsPlaces'] },
        extOutlineMinLetters: { def: 4, unit: 'count', used: [X + '_formsByOutline'] },
        extOutlineBadRatio: { def: 4, unit: 'ratio', used: [X + '_formsByOutline'] },
        extSkeletonRatio: { def: 1.3, unit: 'ratio', used: [X + '_formsByWidth'] },
        extBoldScaleMinSamples: { def: 3, unit: 'count', used: [X + '_formsByWidth'] },
        extFormWideShare: { def: 0.8, unit: 'share', used: [X + '_formsByWidth'] },
        extFormNarrowRatio: { def: 1.2, unit: 'ratio', used: [X + '_formsByWidth'] },
        extOrnamentScriptRatio: { def: 4, unit: 'ratio', used: [X + '_ornaments'] },
        extOrnamentMaxGlyphs: { def: 3, unit: 'glyphs', used: [X + '_ornaments'] },
        extOrnamentSquareEm: { def: 0.85, unit: 'em', used: [X + '_ornaments'] },
        // glyphs with no Unicode
        extUnmappedLineTolPt: { def: 1, unit: 'pt', used: [X + '_unmappedFonts'] },
        extUnmappedWordGapEm: { def: 0.15, unit: 'em', used: [X + '_unmappedFonts'] },
        extLigWidthErr: { def: 0.16, unit: 'share', used: [X + '_unmappedMaps'] },
        extLigWidthErrEst: { def: 0.2, unit: 'share', used: [X + '_unmappedMaps (a width from Times)'] },
        extLigErrWeight: { def: 25, unit: 'ratio', used: [X + '_unmappedMaps'] },
        extLigScaleMinLetters: { def: 5, unit: 'count', used: [X + '_unmappedMaps'] },
        extScClusterGap: { def: 8, unit: 'count', used: [X + '_unmappedMaps (codes)'] },
        extScFigureMax: { def: 10, unit: 'count', used: [X + '_unmappedMaps (codes)'] },
        extScWordMinLetters: { def: 3, unit: 'glyphs', used: [X + '_unmappedMaps'] },
        extScWordBonus: { def: 6, unit: 'ratio', used: [X + '_unmappedMaps (log score)'] },
        extScMinCount: { def: 5, unit: 'glyphs', used: [X + '_unmappedMaps'] },
        extScMinHits: { def: 2, unit: 'count', used: [X + '_unmappedMaps'] },
        extScMinDistinct: { def: 2, unit: 'count', used: [X + '_unmappedMaps'] },
        extScMargin: { def: 2, unit: 'ratio', used: [X + '_unmappedMaps (log score)'] },
        extMarkerLineEm: { def: 0.3, unit: 'em', used: [X + '_unmappedMarkers'] },
        extMarkerMaxRun: { def: 4, unit: 'glyphs', used: [X + '_unmappedMarkers'] },
        extMarkerBaselineEm: { def: 0.2, unit: 'em', used: [X + '_unmappedMarkers'] },
        extMarkerPeriodMaxEm: { def: 0.4, unit: 'em', used: [X + '_unmappedMarkers'] },
        extMarkerDigitMinEm: { def: 0.4, unit: 'em', used: [X + '_unmappedMarkers'] },
        extMarkerDigitMaxEm: { def: 0.8, unit: 'em', used: [X + '_unmappedMarkers'] },
        extMarkerGapMinEm: { def: 0.15, unit: 'em', used: [X + '_unmappedMarkers'] },
        extMarkerGapMaxEm: { def: 2.5, unit: 'em', used: [X + '_unmappedMarkers'] },
        extSignBaselineEm: { def: 0.1, unit: 'em', used: [X + '_unmappedMarkers'] },
        extSignTouchEm: { def: 0.12, unit: 'em', used: [X + '_unmappedMarkers'] },
        extSignMinEm: { def: 0.25, unit: 'em', used: [X + '_unmappedMarkers'] },
        extSignMaxEm: { def: 0.7, unit: 'em', used: [X + '_unmappedMarkers'] },
        extSignLineEm: { def: 0.3, unit: 'em', used: [X + '_unmappedMarkers'] },
        extSignGlueEm: { def: 0.2, unit: 'em', used: [X + '_unmappedMarkers'] },
        extSignHyphenMaxEm: { def: 0.5, unit: 'em', used: [X + '_unmappedMarkers'] },
        // font classes
        extMonoMinSamples: { def: 8, unit: 'glyphs', used: [X + '_classifyFonts'] },
        extMonoSpread: { def: 0.25, unit: 'share', used: [X + '_classifyFonts (of the median width)'] },
        extMonoDocMinGlyphs: { def: 200, unit: 'glyphs', used: [X + '_classifyFonts'] },
        extMonoDocShare: { def: 0.6, unit: 'share', used: [X + '_classifyFonts'] },
        extCodeBoxMinWPt: { def: 40, unit: 'pt', used: [X + '_classifyFonts'] },
        extCodeBoxMinHPt: { def: 8, unit: 'pt', used: [X + '_classifyFonts'] },
        extJspdfMinWidths: { def: 3, unit: 'count', used: [X + '_classifyFonts'] },
        extJspdfNarrowRatio: { def: 0.99, unit: 'ratio', used: [X + '_classifyFonts'] },
        extJspdfBoldRatio: { def: 1.008, unit: 'ratio', used: [X + '_classifyFonts'] },
        extJspdfItalicShift: { def: 40, unit: 'font units', used: [X + '_classifyFonts (bbox xMin)'] },
        extT3BoldMinChars: { def: 4, unit: 'count', used: [X + '_classifyFonts'] },
        extT3BoldRatio: { def: 1.02, unit: 'ratio', used: [X + '_classifyFonts'] }
    });

    Object.assign(PdfImporter.prototype, {
        /**
         * ActualText of the page's marked content, applied to the glyphs it covers when they have no
         * Unicode of their own. Needs the page's content stream(s) as plain or Flate objects (not inside
         * object streams, not encrypted); when the count of BDCs differs from pdf.js's, nothing is changed.
         */
        async _applyActualText(page, glyphs, count) {
            try {
                const texts = await this._pageMarkedTexts(page), self = this;
                if (!texts || texts.length !== count) { this._fire('extract.actualTextUnread', page.pageNumber); return; }
                const bySpan = new Map();
                glyphs.forEach(function (g) { if (g.span !== null) { if (!bySpan.has(g.span)) bySpan.set(g.span, []); bySpan.get(g.span).push(g); } });
                bySpan.forEach(function (gs, k) {
                    const t = texts[k];
                    // (also private-use glyphs: Noto Color Emoji's flags and keycaps, plane 15; and glyphs whose ToUnicode
                    // names a control character — a Stripe invoice's hyphens, colons, brackets: U+0000, ActualText "-")
                    if (typeof t !== 'string' || !gs.some(function (g) { return g.unmapped || CTRL.test(g.ch) || /[\uE000-\uF8FF]|[\uDB80-\uDBFF][\uDC00-\uDFFF]/.test(g.ch); })) return;
                    const a = gs[0], z = gs[gs.length - 1];
                    a.ch = t.normalize('NFC'); a.unmapped = false; a.space = !t.trim() && t.length > 0; a.w = Math.max(a.w, z.x + z.w - a.x); a.actual = true;
                    gs.slice(1).forEach(function (g) { g.drop = true; });
                    if (!t) a.drop = true;
                    self._fire('extract.actualTextApplied', page.pageNumber);
                });
                for (let i = glyphs.length - 1; i >= 0; i--) if (glyphs[i].drop) glyphs.splice(i, 1);
            } catch (e) { /* the glyphs stay as they are */ }
        },

        async _pageMarkedTexts(page) {
            const R = this._rawIdx();
            if (!R || !page.ref) return null;
            const body = this._rawBody.bind(this);
            const pg = body(page.ref.num + ' ' + page.ref.gen);
            if (!pg) return null;
            const cm = /\/Contents\s*(\[([^\]]*)\]|(\d+)\s+(\d+)\s+R)/.exec(pg.text);
            if (!cm) return null;
            const refs = [];
            if (cm[3]) refs.push(cm[3] + ' ' + cm[4]);
            else { const rr = /(\d+)\s+(\d+)\s+R/g; let q; while ((q = rr.exec(cm[2]))) refs.push(q[1] + ' ' + q[2]); }
            let text = '';
            for (const ref of refs) {
                const bytes = await this._rawStream(ref);
                if (!bytes) return null;
                text += latin1(bytes) + '\n';
            }
            return markedTexts(text);
        },

        /** the raw file's object index (plain objects only; none for an encrypted file) */
        _rawIdx() {
            const raw = this._raw;
            if (!raw || typeof DecompressionStream === 'undefined') return null;
            if (!this._rawIndex) {
                const str = latin1(raw), idx = {};
                if (/\/Encrypt\s/.test(str)) { this._rawIndex = { encrypted: true }; return null; }
                const re = /(\d+)\s+(\d+)\s+obj\b/g; let m;
                while ((m = re.exec(str))) idx[m[1] + ' ' + m[2]] = m.index + m[0].length;
                this._rawIndex = { str: str, idx: idx };
            }
            return this._rawIndex.encrypted ? null : this._rawIndex;
        },

        /**
         * The objects kept inside object streams (`/Type /ObjStm`: Word for Microsoft 365, qpdf, post-processors), as their
         * text: 'n 0' → the object's dictionary. Font descriptors live there; the font programs (streams) never do. The
         * importer looked for descriptors in the file's plain objects only, and a file that packed them found no font
         * program — every repair that reads one (brackets by outline, the cmap's twins, ligatures) was skipped.
         */
        async _rawObjStms() {
            const R = this._rawIdx(); if (!R) return {};
            if (R.inStm) return R.inStm;
            R.inStm = {};
            for (const k of Object.keys(R.idx)) {
                const head = R.str.substr(R.idx[k], 400);
                if (!/\/Type\s*\/ObjStm\b/.test(head.slice(0, Math.max(0, head.indexOf('stream')) || 400))) continue;
                const first = /\/First\s+(\d+)/.exec(head), n = /\/N\s+(\d+)/.exec(head);
                if (!first || !n) continue;
                let bytes = null;
                try { bytes = await this._rawStream(k); } catch (e) { bytes = null; }
                if (!bytes) continue;
                const s = latin1(bytes), nums = s.slice(0, +first[1]).trim().split(/\s+/).map(Number);
                for (let i = 0; i + 1 < nums.length && i / 2 < +n[1]; i += 2) {
                    const at = +first[1] + nums[i + 1], next = i + 3 < nums.length ? +first[1] + nums[i + 3] : s.length;
                    R.inStm[nums[i] + ' 0'] = s.slice(at, next);
                }
            }
            return R.inStm;
        },

        _rawBody(ref) {
            const R = this._rawIdx(); if (!R) return null;
            const at = R.idx[ref];
            if (at === undefined) return null;
            const end = R.str.indexOf('endobj', at);
            return { at: at, text: R.str.slice(at, end < 0 ? R.str.length : end) };
        },

        /** a stream object's data, plain or Flate (no predictor); null otherwise */
        async _rawStream(ref) {
            const raw = this._raw, ob = this._rawBody(ref);
            if (!ob) return null;
            const sk = ob.text.search(/\bstream\r?\n/);
            if (sk < 0) return null;
            const dict = ob.text.slice(0, sk);
            const start = ob.at + sk + ob.text.slice(sk).match(/^stream\r?\n/)[0].length;
            let end = ob.at + ob.text.lastIndexOf('endstream');
            while (end > start && (raw[end - 1] === 10 || raw[end - 1] === 13)) end--;
            let bytes = raw.subarray(start, end);
            const filters = (/\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(dict) || [])[1] || '';
            const names = filters.match(/\/\w+/g) || [];
            if (names.some(function (f) { return f !== '/FlateDecode' && f !== '/Fl'; }) || names.length > 1 || /\/DecodeParms/.test(dict)) return null;
            // (the dictionary's own length, when it is a number: what follows it is no part of the data)
            const len = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
            if (len && +len[1] > 0 && +len[1] <= bytes.length) bytes = bytes.subarray(0, +len[1]);
            if (names.length) {
                // read as far as the data goes: a stream with bytes after its end (Microsoft Print to PDF's B Mitra) or a
                // damaged tail still gives what came before — the browser's strict reader would give nothing
                const rd = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader(), parts = [];
                let n = 0;
                try { for (;;) { const r = await rd.read(); if (r.done) break; parts.push(r.value); n += r.value.length; } }
                catch (e) { if (!n) throw e; }
                bytes = new Uint8Array(n); let o = 0;
                parts.forEach(function (q) { bytes.set(q, o); o += q.length; });
            }
            return bytes;
        },

        /**
         * Formulas from Kelk's map (PDFIMPORT.md §3, round 27): on each page, what is drawn inside a formula's box —
         * its vector glyphs and rules, or its picture (a right-to-left \text) — goes, and one glyph stands in its place:
         * as wide as the box, on the formula's baseline, in the page's body font and the size of the text beside it,
         * carrying the TeX (`g.math`). Lines, paragraphs, lists and cells are built round it as round a word; the writer
         * gives it back as Kelk's formula placeholder, and the Markdown as `$…$` / `$$…$$`.
         */
        _mathIn(pages) {
            const M = this._mathMap, self = this;
            let n = 0;
            pages.forEach(function (p) {
                const TOL = self._t('extMathBoxTolPt', p), GROW = self._t('extMathBoxGrowPt', p), HE = self._t('extGlyphHeightEm', p), BL = self._t('extMathBaselineEm', p);
                const inBox = function (e, x0, y0, x1, y1) { const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; return cx >= e.x0 - TOL && cx <= e.x1 + TOL && cy >= e.y0 - TOL && cy <= e.y1 + TOL && x1 - x0 <= e.x1 - e.x0 + GROW && y1 - y0 <= e.y1 - e.y0 + GROW; };
                // (only where the page draws something in the box: a file whose pages were moved, cut or merged after Kelk
                // wrote it has a map that no longer fits — an entry with nothing drawn under it is not trusted)
                const es = (M[p.num] || []).filter(function (e) {
                    return ['vectors', 'images', 'small', 'rects'].some(function (k) { return (p[k] || []).some(function (b) { return inBox(e, b.x0, b.y0, b.x1, b.y1); }); });
                });
                if (es.length < (M[p.num] || []).length) self._fire('extract.mathEntryUntrusted', p);
                if (!es.length) return;
                const inAny = function (b) { return es.some(function (e) { return inBox(e, b.x0, b.y0, b.x1, b.y1); }); };
                ['vectors', 'rects', 'small', 'images'].forEach(function (k) { if (p[k]) p[k] = p[k].filter(function (b) { return !inAny(b); }); });
                if (p.hsegs) p.hsegs = p.hsegs.filter(function (r) { return !inAny({ x0: r.x0, x1: r.x1, y0: r.y, y1: r.y }); });
                if (p.vsegs) p.vsegs = p.vsegs.filter(function (r) { return !inAny({ x0: r.x, x1: r.x, y0: r.y0, y1: r.y1 }); });
                const text = p.glyphs.filter(function (g) { return !g.space && g.font && g.size > 0; });
                p.glyphs = p.glyphs.filter(function (g) { return !inAny({ x0: g.x, x1: g.x + g.w, y0: g.y, y1: g.y + HE * g.size }); });
                // (the page's body font: the font of most of its text)
                const count = {};
                text.forEach(function (g) { count[g.font] = (count[g.font] || 0) + 1; });
                const font = Object.keys(count).sort(function (a, b) { return count[b] - count[a]; })[0] || null;
                const sizes = text.map(function (g) { return g.size; }).sort(function (a, b) { return a - b; });
                const body = sizes.length ? sizes[sizes.length >> 1] : self._t('extMathBodyPt', p);
                es.forEach(function (e) {
                    // (the size of the text on its baseline — a formula in a heading or a table cell takes theirs)
                    const near = text.filter(function (g) { return Math.abs(g.y - e.b) < BL * g.size; })
                        .sort(function (a, b) { return Math.min(Math.abs(a.x - e.x1), Math.abs(a.x + a.w - e.x0)) - Math.min(Math.abs(b.x - e.x1), Math.abs(b.x + b.w - e.x0)); })[0];
                    const g = { ch: 'x', x: e.x0, w: e.x1 - e.x0, y: near ? near.y : e.b, size: near ? near.size : body, font: near && !e.d ? near.font : font,
                                color: near ? near.color : undefined, space: false, math: { tex: e.t, display: !!e.d } };
                    // (in drawing order, where its line has it: after the last glyph of its baseline before it, else before
                    // the first one after it — the lines are built in that order)
                    const gs = p.glyphs, on = function (o) { return !o.math && Math.abs(o.y - g.y) < BL * g.size; };
                    let at = -1;
                    for (let k = 0; k < gs.length; k++) if (on(gs[k]) && gs[k].x + gs[k].w / 2 < e.x0) at = k + 1;
                    if (at < 0) for (let k = 0; k < gs.length; k++) if (on(gs[k])) { at = k; break; }
                    if (at < 0) at = gs.length;
                    gs.splice(at, 0, g); n++; self._fire('extract.mathPlaced', p);
                    if (g.font && p.fonts && !(g.font in p.fonts)) p.fonts[g.font] = null;
                });
            });
            if (n) this._note('kelkMath', n + ' formula' + (n > 1 ? 's' : '') + ' given back from the TeX Kelk wrote in the PDF.');
        },

        /** The embedded TrueType programs by font name (R.fontFiles), read once: name → [{ ref, composite }]. */
        async _fontPrograms() {
            const R = this._rawIdx();
            if (!R) return null;
            const inStm = await this._rawObjStms();
            if (!R.fontFiles) {
                // name → its programs, each with whether a composite font's descriptor points to it (a file can
                // embed one font twice under one name: InDesign's Dana-Bold as a CID font and as a WinAnsi one,
                // two subsets whose glyph numbers differ)
                R.fontFiles = {};
                const cidDesc = {}, heads = {};
                Object.keys(R.idx).concat(Object.keys(inStm)).forEach(function (k) {
                    const head = k in inStm ? inStm[k].slice(0, 1200) : R.str.substr(R.idx[k], 1200), st = head.indexOf('stream');
                    const d = heads[k] = st >= 0 ? head.slice(0, st) : head;
                    if (/\/CIDFontType[02]/.test(d)) { const fd = /\/FontDescriptor\s+(\d+)\s+(\d+)\s+R/.exec(d); if (fd) cidDesc[fd[1] + ' ' + fd[2]] = 1; }
                });
                Object.keys(heads).forEach(function (k) {
                    const d = heads[k];
                    const fn = /\/FontName\s*\/([^\s\/<>\[\]()]+)/.exec(d), ff = /\/FontFile2\s+(\d+)\s+(\d+)\s+R/.exec(d);
                    if (!fn || !ff) return;
                    const ref = ff[1] + ' ' + ff[2], list = R.fontFiles[fn[1]] = R.fontFiles[fn[1]] || [];
                    if (!list.some(function (e) { return e.ref === ref; })) list.push({ ref: ref, composite: !!cidDesc[k] || /\/CIDFontType[02]|\/DescendantFonts/.test(d) });
                });
            }
            return R.fontFiles;
        },

        /**
         * Forms by outline (PDFIMPORT.md §4, "Shapes by use"): an Arabic letter's joining stroke runs to the side of its
         * glyph it joins on — an initial or medial form's outline reaches its left edge (the next letter's side), a final
         * or medial one its right edge (or past them); an isolated form keeps its side bearings. Where a font names every
         * form by its base letter and its codes keep no order of forms (a modern font's subset: forms from its GSUB, no
         * presentation forms in its cmap, no glyph names), its program still holds the outlines: each code's joins, by
         * code → glyph (the font's (3,0) or (1,0) cmap for a simple font; the code itself for a composite one with an
         * Identity map). Read here, checked against where the codes stand in _formsByOrder.
         */
        async _outlineJoins(pages) {
            this._joinsBy = {};
            const want = {}, MIN = this._t('extOutlineJoinsMinLetters');
            pages.forEach(function (p) { p.glyphs.forEach(function (g) {
                const f = g.font && p.fonts[g.font];
                if (!f || g.space || g.cid === undefined || typeof g.ch !== 'string') return;
                const w = want[g.font] || (want[g.font] = { font: f, ar: 0, pf: 0 });
                if (PF[g.ch]) w.pf++; else if (/^[\u0626-\u064A\u067E\u0686\u06A9\u06AF\u06CC]$/.test(g.ch)) w.ar++;
            }); });
            const ids = Object.keys(want).filter(function (id) { return want[id].ar >= MIN && !want[id].pf; });
            if (!ids.length || !this._rawIdx()) return;
            const R = this._rawIdx(), files = await this._fontPrograms();
            if (!files) return;
            const byGid = !/\/CIDToGIDMap\s*\d+\s+\d+\s+R/.test(R.str);
            for (const id of ids) {
                await this._yield();
                try {
                    const f = want[id].font, name = String(f.name || '').replace(/[()<>\[\]{}\/%\s]/g, '');
                    if (!name || (f.composite && !byGid)) continue;
                    const cands = (files[name] || []).filter(function (e) { return e.composite === !!f.composite; });
                    if (cands.length !== 1) continue;                          // (two programs under one name: no choice made)
                    const bytes = await this._rawStream(cands[0].ref);
                    if (!(bytes && bytes.length > 12)) continue;
                    const m = sfntLigatures(bytes), composite = !!f.composite;
                    this._joinsBy[id] = function (cid) {
                        const gid = composite ? cid : m.c2g[cid];
                        if (!gid) return null;
                        const e = m.edges(gid);
                        return e ? { fwd: e.left, back: e.right } : null;
                    };
                    this._fire('extract.outlineJoinsRead');
                } catch (e) { /* not this font */ }
            }
        },

        /**
         * Ligature glyphs with no Unicode, read from the embedded font's own GSUB table (Microsoft Print
         * to PDF embeds whole fonts: Calibri's tt, ti, ft …). Composite fonts with an Identity CID → glyph
         * map only: there the code is the glyph id.
         */
        async _gsubRepair(pages) {
            // the fonts with glyphs to repair (no Unicode), and composite fonts whose ToUnicode may be wrong
            const want = {};
            pages.forEach(function (p) { p.glyphs.forEach(function (g) {
                const f = g.font && p.fonts[g.font];
                if (f && (g.unmapped || g.guess || f.composite || CTRL.test(g.ch))) (want[g.font] = want[g.font] || { font: f, n: 0 }).n++;
            }); });
            const ids = Object.keys(want);
            if (!ids.length || !this._rawIdx()) return;
            const R = this._rawIdx(), self = this;
            const maps = await this._gsubPrograms(pages, want, ids, R);
            const bogus = this._gsubBogus(pages, maps);
            this._gsubColour(pages, maps);
            // the outline rules read a glyph by its code: composite fonts, and a file with no CID → glyph map of its own
            const byGid = !/\/CIDToGIDMap\s*\d+\s+\d+\s+R/.test(R.str);
            const outline = function (g) { const m = maps[g.font]; return byGid && m && want[g.font] && want[g.font].font.composite ? m : null; };
            // each font's digit systems in its ToUnicode (1: one system throughout)
            const digSys = this._gsubDigits(pages);
            const arTrust = this._gsubArTrust(pages, outline);
            const ctx = { maps: maps, bogus: bogus, outline: outline, digSys: digSys, arTrust: arTrust, p: null,
                          mark: this._t('extMarkAdvanceEm'), space: this._t('extSpaceAdvanceEm') };
            pages.forEach(function (p) {
                ctx.p = p;
                p.glyphs.forEach(function (g) { self._gsubGlyph(g, ctx); });
            });
            this._gsubLost(pages);
        },

        /** _gsubRepair, step 1: each font's embedded program, read for its cmap, GSUB and outlines (font id → its map) */
        async _gsubPrograms(pages, want, ids, R) {
            const self = this, maps = {};
            for (const id of ids) {
                await this._yield();
                const name = String(want[id].font.name || '').replace(/[()<>\[\]{}\/%\s]/g, '');
                if (!name) continue;
                try {
                    // the font descriptor that names this font, and its embedded TrueType program
                    await self._fontPrograms();
                    let cands = (R.fontFiles[name] || []).filter(function (e) { return e.composite === !!want[id].font.composite; });
                    if (!cands.length && (R.fontFiles[name] || []).length === 1) cands = R.fontFiles[name];
                    if (!cands.length) continue;
                    // (two subsets under one name — Chrome's BNazanin, once per run of text —: the one whose own cmap
                    // agrees with this font's text on most of its glyphs; a tie is no choice)
                    let best = null, bestS = -1, tie = false;
                    for (const c of cands) {
                        const bytes = await self._rawStream(c.ref);
                        if (!(bytes && bytes.length > 12)) continue;
                        const m = sfntLigatures(bytes);
                        if (cands.length === 1) { best = m; break; }
                        let sc = 0; const seen = {};
                        pages.forEach(function (p) { p.glyphs.forEach(function (g) {
                            if (g.font !== id || g.space || seen[g.cid] || !(g.cid in m.g2u)) return;
                            seen[g.cid] = 1;
                            const u = m.g2u[g.cid];
                            // (a bracket named by the other of its pair agrees: Word and PowerPoint name the shape by the logical character —
                            // a deck's «(AI)» in its own Arial subset was a tie against the deck's Persian one, and stayed «)AI(»)
                            if (u === g.ch || u.normalize('NFKC') === g.ch.normalize('NFKC') || (PF[u] && PF[u][0] === g.ch) || MIRROR[g.ch] === u) sc++; else sc--;
                        }); });
                        // (a tie between programs that name this font's glyphs alike is no choice to make: two subsets
                        // of the same characters)
                        const alike = function (a, b) { return Object.keys(seen).every(function (k) { return a.g2u[k] === b.g2u[k]; }); };
                        if (sc > bestS) { best = m; bestS = sc; tie = false; } else if (sc === bestS && !(best && alike(best, m))) tie = true;
                    }
                    if (best && !(cands.length > 1 && (tie || bestS <= 0))) maps[id] = best;
                    else if (best) self._fire('extract.gsubSubsetUndecided');
                } catch (e) { /* not this font */ }
            }
            return maps;
        },

        /** _gsubRepair, step 2: the fonts whose ToUnicode disagrees with their own cmap (font id → the cmap's g2u) */
        _gsubBogus(pages, maps) {
            // a ToUnicode that disagrees with the font's own cmap for most of its glyphs is wrong (Microsoft
            // Print to PDF: Cambria Math's italic x as Tamil ௫): the cmap's character wins there
            const bogus = {}, self = this, MIN = this._t('extBogusMinDiffer'), RAT = this._t('extBogusDifferRatio');
            // (the glyphs by font, in reading order, gathered once: a pass over every page for each font held a
            // 276-page file's thread a second)
            const byFont = {};
            pages.forEach(function (p) { p.glyphs.forEach(function (g) { if (g.font in maps) (byFont[g.font] = byFont[g.font] || []).push(g); }); });
            Object.keys(maps).forEach(function (id) {
                const g2u = maps[id].g2u; if (!g2u) return;
                const seen = {}; let agree = 0, differ = 0;
                (byFont[id] || []).forEach(function (g) {
                    if (g.unmapped || g.space || seen[g.cid] || !(g.cid in g2u)) return;
                    seen[g.cid] = 1;
                    if (g.ch === g2u[g.cid] || g.ch.normalize('NFKC') === g2u[g.cid].normalize('NFKC')) agree++; else differ++;
                });
                if (differ >= MIN && differ > RAT * agree) { bogus[id] = g2u; self._fire('extract.gsubBogusToUnicode'); }
            });
            return bogus;
        },

        /** _gsubRepair, step 3: colour emoji drawn as their layers */
        _gsubColour(pages, maps) {
            const self = this, TOL = this._t('extColourLayerTolPt');
            // colour emoji drawn as their layers (Microsoft Print to PDF with Segoe UI Emoji): the stack of
            // layers at one place → the emoji of their base glyph
            pages.forEach(function (p) {
                const gs = p.glyphs;
                for (let i = 0; i < gs.length; i++) {
                    const g = gs[i], m = maps[g.font];
                    if (!m || !m.colr || !(g.cid in m.colr)) continue;
                    const bg = m.colr[g.cid].base;
                    let j = i + 1;
                    while (j < gs.length && gs[j].font === g.font && gs[j].cid in m.colr && m.colr[gs[j].cid].base === bg &&
                           Math.abs(gs[j].x - g.x) < TOL && Math.abs(gs[j].y - g.y) < TOL) j++;
                    const u = m.g2u[bg];
                    if (u) {
                        g.ch = u; g.unmapped = false; g.guess = false; g.colour = true; self._fire('extract.colourEmoji', p);
                        for (let k = i + 1; k < j; k++) gs[k].colourLayer = true;
                    } else {
                        // the font's cmap no longer names it (a printer's trimmed copy): the emoji as a picture, cropped
                        // like a figure inside the line — no text is better than the layers' meaningless codes
                        for (let k = i + 1; k < j; k++) gs[k].colourLayer = true;
                        g.ch = '\uFFFC'; g.pic = true; g.unmapped = false; g.guess = false; g.colour = true; self._fire('extract.colourEmojiPicture', p);
                    }
                    i = j - 1;
                }
                p.glyphs = gs.filter(function (g) { return !g.colourLayer; });
            });
        },

        /** _gsubRepair, step 4: each font's digit systems in its ToUnicode (1: one system throughout) */
        _gsubDigits(pages) {
            const digSys = {};
            const seen = {};
            pages.forEach(function (p) { p.glyphs.forEach(function (g) {
                if (g.ch.length !== 1 || digitValue(g.ch) < 0) return;
                const c = g.ch.charCodeAt(0), k = c < 0x80 ? 'a' : c < 0x6F0 ? 'r' : 'p';
                (seen[g.font] = seen[g.font] || {})[k] = 1;
            }); });
            Object.keys(seen).forEach(function (f) { digSys[f] = Object.keys(seen[f]).length; });
            return digSys;
        },

        /** _gsubRepair, step 5: the fonts whose cmap is trusted over their ToUnicode on Arabic letters (font id → twin test) */
        _gsubArTrust(pages, outline) {
            // a font whose own cmap agrees with its ToUnicode on most of its Arabic letters, and disagrees on a few: the few
            // are the ToUnicode's mistakes (twins aside: ي ی, ك ک, ة ۀ, and Arial's heh named ھ; a Word letter stamped by iText: B Mitra's medial lam named «ه», final noon «ج»,
            // final and medial yeh, medial sin, isolated ain and kheh named a space — «عمه ات» for «عملیات», «ایج» for
            // «این», «پ شرفت» for «پیشرفت»). There the cmap's letter wins, the twins aside (ي ی, ك ک, ة ۀ)
            const arTrust = {};
            const AR = /^[\u0620-\u064A\u066E-\u06D3\u06FA-\u06FC\uFB50-\uFDFF\uFE70-\uFEFC]$/;
            const tw = function (a, b) { const n = function (c) { return c.replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/ة/g, 'ۀ').replace(/\u06BE/g, 'ه').replace(/\u06C1/g, 'ه'); }; return n(a) === n(b) || n(a).replace(/ۀ/g, 'ه') === n(b).replace(/ۀ/g, 'ه'); };
            const seen = {}, st = {}, self = this, MIN = this._t('extArTrustMinAgree'), RAT = this._t('extArTrustRatio');
            pages.forEach(function (p) { p.glyphs.forEach(function (g) {
                const m = outline(g); if (!m || !m.g2u || !(g.cid in m.g2u) || seen[g.font + '|' + g.cid]) return;
                const u = m.g2u[g.cid]; if (!AR.test(u)) return;
                seen[g.font + '|' + g.cid] = 1;
                const s = st[g.font] || (st[g.font] = { a: 0, d: 0 });
                if (tw(u.normalize('NFKC'), String(g.ch).normalize('NFKC'))) s.a++; else s.d++;
            }); });
            Object.keys(st).forEach(function (f) { if (st[f].a >= MIN && st[f].d >= 1 && st[f].a >= RAT * st[f].d) { arTrust[f] = tw; self._fire('extract.arTrustFont'); } });
            return arTrust;
        },

        /** _gsubRepair, step 6: one glyph's repairs from its font's own tables, in order (the first that applies may end them) */
        _gsubGlyph(g, c) {
            const maps = c.maps, bogus = c.bogus, outline = c.outline, digSys = c.digSys, arTrust = c.arTrust;
            if (g.colour) return;
            if (arTrust[g.font]) {
                const m0 = outline(g), u0 = m0 && m0.g2u && g.cid in m0.g2u ? m0.g2u[g.cid] : null;
                if (u0 && /^[\u0620-\u064A\u066E-\u06D3\u06FA-\u06FC\uFB50-\uFDFF\uFE70-\uFEFC]$/.test(u0) && g.w > c.mark * g.size &&
                    (g.space || (g.ch.length === 1 && /[\u0600-\u06FF]/.test(g.ch))) && !arTrust[g.font](u0.normalize('NFKC'), g.ch.normalize('NFKC'))) {
                    g.ch = u0; g.space = false; this._fire('extract.cmapArabicLetter', c.p); return;
                }
            }
            // a bracket its ToUnicode names by the other of its pair (InDesign's Dana-Bold names the "(" glyph ")" while
            // Dana-Regular, in the same file, names it "("): the outline says which way it opens — the shape is what
            // step 3 mirrors on right-to-left levels; named the wrong way it came out «)نمونه(»
            if (outline(g) && MIRROR[g.ch] && /^[()\[\]{}<>«»]$/.test(g.ch)) {
                const sd = outline(g).side(g.cid);
                if (sd && (sd === 'L') !== /^[(\[{<«]$/.test(g.ch)) { g.ch = MIRROR[g.ch]; this._fire('extract.bracketByOutline', c.p); }
            }
            // a mark of no advance: its outline's place, from the font (step 2 puts it on its letter)
            if (outline(g) && g.w < c.mark * g.size && MARK_CH.test(g.ch)) { const k = outline(g).ink(g.cid); if (k && k[1] > k[0]) g.ink = k; }
            const t = g.unmapped && maps[g.font] && maps[g.font][g.cid];
            if (t) { g.ch = t; g.unmapped = false; this._fire('extract.gsubLigature', c.p); return; }
            if (g.guess && maps[g.font]) {
                const m = maps[g.font];
                let gid = g.cid, k = 0;
                while (!(gid in m.g2u) && gid in m.base && k++ < 4) gid = m.base[gid];
                if (gid in m.g2u) { g.ch = m.g2u[gid]; g.guess = false; this._fire('extract.guessConfirmed', c.p); }
                return;
            }
            // a ToUnicode built from a legacy font's cmap one entry off (PowerPoint with B Mitra): the space glyph named
            // «ً», the «ً» glyph named «ا», the final lam-alef «ﻼ» named «ل» — every word gap came out «ً» and «السلام»
            // «السل‌م». The font's own cmap names the glyph; it wins only where the glyph's advance agrees with it:
            // a space has width, a mark none, a ligature is both its letters (most glyphs agree, so `bogus` misses it)
            const om = outline(g), ou = om && om.g2u && g.cid in om.g2u ? om.g2u[g.cid] : null;
            if (ou !== null && ou !== g.ch && !g.space) {
                if (ou === ' ' && g.w >= c.space * g.size && (MARK_CH.test(g.ch) || /^\p{L}$/u.test(g.ch))) { g.ch = ' '; g.space = true; this._fire('extract.cmapSpace', c.p); return; }
                if (MARK_CH.test(ou) && ou.length === 1 && g.w < c.mark * g.size && /^\p{L}$/u.test(g.ch)) { g.ch = ou; this._fire('extract.cmapMark', c.p); return; }
                if (/^[ﻵ-ﻼ]$/.test(ou) && ou.normalize('NFKC').indexOf(g.ch) >= 0 && g.ch.length === 1) { g.ch = ou.normalize('NFKC'); this._fire('extract.cmapLamAlef', c.p); return; }
            }
            const fix = bogus[g.font];
            if (fix && !g.space && g.cid in fix && /\S/.test(fix[g.cid])) { g.ch = fix[g.cid]; this._fire('extract.bogusToUnicodeFixed', c.p); }
            // a glyph its ToUnicode maps to a control character (U+0000: a Stripe invoice's hyphens, colons and
            // brackets in Inter) — the font's own cmap names it, as pdftotext reads it
            const m = maps[g.font];
            if (CTRL.test(g.ch) && m && m.g2u && g.cid in m.g2u && /\S/.test(m.g2u[g.cid])) { g.ch = m.g2u[g.cid]; this._fire('extract.ctrlFromCmap', c.p); }
            // a mirrored bracket its ToUnicode names by the logical character (Word: the ')' shape drawn at the
            // right end of "ماده (1)" mapped to '(') — the shape is what is drawn, and step 3 mirrors shapes on
            // RTL levels; the logical name mirrored again came out ")1(". Only a mirror pair: nothing else changes
            else if (m && m.g2u && g.cid in m.g2u && MIRROR[g.ch] === m.g2u[g.cid]) { g.ch = m.g2u[g.cid]; this._fire('extract.mirrorFromCmap', c.p); }
            // a digit its ToUnicode names in one system and the font's cmap in another, the same value (Word: one
            // glyph «۳» here, «3» there, as each was first typed — «4-۳», «12۳4۵»): the font's name, one system
            // (a glyph the cmap names in every system — B Mitra's ۴ for 4, ٤ and ۴ — says nothing where the
            // ToUnicode names all of the font's digits in one system: Microsoft Print to PDF's ١٢٣ stays)
            else if (m && m.g2u && g.cid in m.g2u && g.ch.length === 1 && g.ch !== m.g2u[g.cid] && digitValue(g.ch) >= 0 && digitValue(g.ch) === digitValue(m.g2u[g.cid]) &&
                     !(digSys[g.font] === 1 && m.dig && m.dig[g.cid] && m.dig[g.cid].indexOf(g.ch) >= 0)) { g.ch = m.g2u[g.cid]; this._fire('extract.digitFromCmap', c.p); }
            // an Arabic letter its ToUnicode names by the base letter while the font's cmap names the glyph by its
            // presentation form (Word, Microsoft Print to PDF): the form says how the glyph joins — the repair of
            // step 3 reads a broken join as the ZWNJ the producer did not draw — and which letter it is: GDI names
            // the Persian yeh and kaf (ﯽ ﮐ) by the Arabic ي ك, and Word a ۀ (ﮥ) by ة: «نحوة». Only the same letter or those twins
            // A glyph the cmap names by a plain letter in a font whose cmap has presentation forms is that letter's
            // isolated form (the base code maps to it); a Persian font names one glyph by both ي and ی — the ی it is
            else if (m && m.g2u && g.cid in m.g2u && g.ch.length === 1 && /[\u0620-\u06FF]/.test(g.ch)) {
                const twin = function (base) { return base === g.ch || (/^[يى]$/.test(g.ch) && base === 'ی') || (g.ch === 'ك' && base === 'ک') || (g.ch === 'ة' && base === 'ۀ'); };
                const pf = PF[m.g2u[g.cid]];
                if (pf) { if (twin(pf[0])) { g.ch = m.g2u[g.cid]; this._fire('extract.formFromCmap', c.p); } }
                else if (m.ar && m.ar[g.cid] && (m.ar[g.cid].indexOf(g.ch) >= 0 || twin(m.ar[g.cid].charAt(0)))) {
                    // (named by the letter itself, or by its Persian twin alone: the shape is the twin's)
                    let letter = g.ch;
                    if (/^[يى]$/.test(letter) && m.ar[g.cid].indexOf('ی') >= 0) letter = 'ی';
                    if (letter === 'ك' && m.ar[g.cid].indexOf('ک') >= 0) letter = 'ک';
                    if (letter === 'ة' && m.ar[g.cid].indexOf('ۀ') >= 0) letter = 'ۀ';
                    if (m.forms === undefined) m.forms = Object.keys(m.g2u).some(function (k) { return PF[m.g2u[k]]; });
                    g.ch = m.forms && ISOLATED[letter] ? ISOLATED[letter] : letter;
                    this._fire('extract.letterFromCmap', c.p);
                }
                // one glyph for several forms of its letter (Arial: reh's isolated and final, noon's initial and
                // medial): it may join wherever one of them does — named by the first, every «مر» and «ند» of a
                // PowerPoint deck was a broken join, the font a liar (§4, "Shapes that lie"), and the ZWNJs it
                // left out («شخصي‌سازي‌شده», where ي's final form shows them) were not read at all
                const fs = m.pfs && m.pfs[g.cid], cur = PF[g.ch];
                if (fs && fs.length > 1 && cur) {
                    const same = fs.filter(function (c) { return PF[c][0] === cur[0]; });
                    if (same.length > 1) {
                        const back = same.some(function (c) { return PF[c][1] === 1 || PF[c][1] === 3; }), fwd = same.some(function (c) { return PF[c][1] === 2 || PF[c][1] === 3; });
                        const want = (back ? 1 : 0) + (fwd ? 2 : 0), idx = want === 1 ? 1 : want === 2 ? 2 : want === 3 ? 3 : 0;
                        const hit = Object.keys(PF).filter(function (c) { return PF[c][0] === cur[0] && PF[c][1] === idx; })[0];
                        if (hit) { g.ch = hit; this._fire('extract.sharedFormJoins', c.p); }
                    }
                }
            }
        },

        /** _gsubRepair, step 7: a guess nothing confirmed, in a script the document does not use → U+FFFD */
        _gsubLost(pages) {
            // a guess nothing confirmed, in a block of Unicode no mapped text of the document uses (a calligraphic
            // font's swash ه read as Bengali গ): the code was the glyph's number, not a character — a replacement
            // mark says a letter is there, the stray script would say something false
            const blocks = {}, self = this, LN = this._t('extLostLineEm');
            pages.forEach(function (p) { p.glyphs.forEach(function (g) { if (!g.guess && !g.unmapped && !g.space && g.ch) blocks[g.ch.codePointAt(0) >> 7] = 1; }); });
            // (and only inside a word of another script: a neighbour on its line is a confirmed letter from elsewhere —
            // a document all in guesses, CJK with no ToUnicode, keeps them)
            const other = function (g, nb) { return nb && !nb.guess && !nb.space && /\p{L}/u.test(nb.ch) && Math.abs(nb.y - g.y) < LN * g.size && (nb.ch.codePointAt(0) >> 7) !== (g.ch.codePointAt(0) >> 7); };
            // (a letter only: a guessed dash or sign between letters is that sign — an OCR layer's «—» in «legacy—mode»
            // came out «�», where its own text, copied, reads «—»)
            pages.forEach(function (p) { const gs = p.glyphs; gs.forEach(function (g, i) {
                if (!g.guess || blocks[g.ch.codePointAt(0) >> 7] || !/^\p{L}/u.test(g.ch)) return;
                let a = i - 1, b = i + 1;
                while (a >= 0 && gs[a].guess) a--;
                while (b < gs.length && gs[b].guess) b++;
                if (other(g, gs[a]) || other(g, gs[b])) { g.ch = '\uFFFD'; g.guess = false; g.lost = true; self._fire('extract.guessLost', p); }
            }); });
        },

        // ── 1. extraction ──────────────────────────────────────────────
        async _extractPage(doc, num) {
            const lib = global.pdfjsLib, OPS = lib.OPS;
            const page = await doc.getPage(num);
            const view = page.view;     // [x0, y0, x1, y1]
            const ops = await page.getOperatorList();
            const annots = await page.getAnnotations().catch(function () { return []; });

            // the operator walk, one operator at a time; its state is one object (_opState), each family of operators
            // a step: marked content, text (and its glyphs), the graphics state, images, paths
            const st = this._opState(page, view, OPS), glyphs = st.glyphs, self = this;
            st.num = num;
            for (let i = 0; i < ops.fnArray.length; i++) {
                const fn = ops.fnArray[i], args = ops.argsArray[i];
                st.opIndex = i;
                if (this._opMarked(st, fn, args)) continue;
                if (fn === OPS.paintFormXObjectBegin) { st.formDepth++; st.stats.forms++; }
                else if (fn === OPS.paintFormXObjectEnd) st.formDepth = Math.max(0, st.formDepth - 1);
                if (this._opText(st, fn, args) || this._opGraphics(st, fn, args) || this._opImages(st, fn, args)) continue;
                if (fn === OPS.constructPath) this._opPaths(st, args);
            }
            if (st.mcOrd >= 0 && glyphs.some(function (g) { return g.span !== null && (g.unmapped || CTRL.test(g.ch) || /[\uE000-\uF8FF]|[\uDB80-\uDBFF][\uDC00-\uDFFF]/.test(g.ch)); })) await this._applyActualText(page, glyphs, st.mcOrd + 1);
            this._unicodeRepair(glyphs);
            this._hideCovered(st);
            this._codeRepair(glyphs, st.isCid);
            this._dashedRules(st);
            this._tinyText(glyphs);
            // a link's target written as UTF-8 bytes in a PDF string, which pdf.js reads one byte a character (PowerPoint's
            // links to attached files: «Attach/Ø¨Ø±Ù …» for «Attach/برنامه …»): the bytes decoded as UTF-8, when they are that
            const utf8Url = function (u) {
                if (typeof u !== 'string' || !/[\u0080-\u00FF]/.test(u) || /[^\u0000-\u00FF]/.test(u)) return u;
                try {
                    const b = new Uint8Array(u.length); for (let i = 0; i < u.length; i++) b[i] = u.charCodeAt(i);
                    const d = new TextDecoder('utf-8', { fatal: true }).decode(b);
                    self._fire('extract.linkUtf8', num); return d;
                }
                catch (e) { return u; }
            };
            const links = (annots || []).filter(function (a) { return a.subtype === 'Link' && (a.url || a.unsafeUrl); })
                .map(function (a) { return { x0: a.rect[0], y0: a.rect[1], x1: a.rect[2], y1: a.rect[3], url: utf8Url(a.url || a.unsafeUrl) }; });
            const fontsUsed = {};
            glyphs.forEach(function (g) {
                if (!g.font || g.font in fontsUsed) return;
                try { fontsUsed[g.font] = page.commonObjs.get(g.font); } catch (e) { fontsUsed[g.font] = null; }
            });
            return { num: num, page: page, view: view, glyphs: glyphs,
                     rects: st.rects, hsegs: st.hsegs, vsegs: st.vsegs, vectors: st.vectors, images: st.images, small: st.small, links: links, fonts: fontsUsed,
                     stats: st.stats, rotate: page.rotate || 0 };
        },

        /** 1, the operator walk's state: what the page draws, the graphics and text state, marked content, font tests */
        _opState(page, view, OPS) {
            const st = { OPS: OPS, page: page, view: view,
                         rects: [], hsegs: [], vsegs: [], vectors: [], images: [], small: [],
                         ctm: [1, 0, 0, 1, 0, 0], stack: [], fill: '#000000', stroke: '#000000' };
            // what may hide text drawn earlier: the fill's opacity and blend (ExtGState ca / BM / SMask) and the clip —
            // a large fill under a narrow clip covers only the clip (Skia's "re W n" then "re f")
            st.gfx = { alpha: 1, normal: true, smask: false, clip: null }; st.pendingClip = false; st.opIndex = 0;
            st.groups = [];                 // beginGroup … endGroup: true for a group that defines a soft mask (never shown)
            st.groupAlpha = [];             // … and the opacity it is composited with (ca at its begin, times its parents')
            st.stats = { forms: 0, smask: 0, alpha: 0, clips: 0, patterns: 0, groups: 0 };   // how the page is drawn (r.features)
            st.PAINT_STROKE = [OPS.stroke, OPS.closeStroke]; st.PAINT_FILL = [OPS.fill, OPS.eoFill];
            st.PAINT_BOTH = [OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke];
            // text state (glyphs are placed here, in drawing order, with exact positions —
            // pdf.js's text content applies its own bidi, which mixed runs do not survive)
            st.glyphs = [];
            // composite (CID) fonts: a glyph whose text is just its own code is a PDF.js guess
            const cidCache = {};
            const isCid = function (id) {
                if (id in cidCache) return cidCache[id];
                let c = false;
                try { const f = page.commonObjs.get(id); c = !!(f && f.composite); } catch (e) { c = false; }
                return (cidCache[id] = c);
            };
            // a text font whose glyph maps into the Private Use Area (an OpenType ligature's own code,
            // U+E053 for "Th") gives no text; symbol, icon and emoji fonts use the PUA on purpose
            const puaCache = {};
            const textFont = function (id) {
                if (id in puaCache) return puaCache[id];
                let t = true;
                try {
                    const f = page.commonObjs.get(id), face = fontFace(f);
                    t = !(f && /emoji|symbol|wingding|webding|dingbat|awesome|icon|material|zapf|marlett|mt ?extra/i.test((f.name || '') + ' ' + (face && face.full || '')));
                } catch (e) { t = false; }
                return (puaCache[id] = t);
            };
            // glyph widths are in glyph space: 1/1000 of the size, except in Type3 fonts, whose own
            // FontMatrix scales them (Chrome / Skia writes variable fonts such as Inter as Type3, 1/2048)
            const fmCache = {};
            const widthScale = function (id) {
                if (id in fmCache) return fmCache[id];
                let s = 0.001;
                try {
                    const f = page.commonObjs.get(id), fm = f && f.isType3Font && f.fontMatrix;
                    if (fm && isFinite(fm[0]) && Math.abs(fm[0]) > 1e-7 && Math.abs(fm[0]) < 10) s = Math.abs(fm[0]);
                } catch (e) { /* default */ }
                return (fmCache[id] = s);
            };
            st.isCid = isCid; st.textFont = textFont; st.widthScale = widthScale;
            st.k = this._opConsts(page.pageNumber);
            st.ts = { font: null, size: 10, cs: 0, ws: 0, hs: 1, lead: 0, rise: 0, mode: 0 }; st.tm = [1, 0, 0, 1, 0, 0]; st.tlm = st.tm;
            // marked content: the ordinal of each page-level BDC, for its ActualText
            st.formDepth = 0; st.mcOrd = -1; st.mcStack = [];
            // the same marked content, as the structure tree sees it: its MCID (page level only — a form's MCIDs
            // belong to the form's own StructParents) and whether it is an /Artifact (running heads, decoration)
            st.mcTag = [];
            return st;
        },

        /** 1, the walk's literals (thresholds.js), read once a page: the walk's steps run per operator and per glyph */
        _opConsts(num) {
            const self = this, t = function (name) { return self._t(name, num); };
            return { rot: t('extRotatedSkew'), clipShare: t('extSmallClipShare'), clipTol: t('extClipTolPt'), he: t('extGlyphHeightEm'),
                     imgMin: t('extImageMinPt'), imgShown: t('extImageShownMin'), imgAlpha: t('extImageAlphaMin'), axis: t('extAxisTolPt'),
                     smMax: t('extSmallMarkMaxPt'), smMin: t('extSmallMarkMinPt'), sm: t('extSmallMarkPt'),
                     rbSide: t('extRboxSideMinPt'), rbCorner: t('extRboxCornerShare'), rbPad: t('extRboxCornerPadPt'), rbMin: t('extRboxMinPt'), rbEdge: t('extRboxEdgeTolPt'),
                     rectMin: t('extRectMinPt'), rrCurves: t('extRoundRectMaxCurves'), rrSegs: t('extRoundRectMaxSegs'), rrW: t('extRoundRectMinWPt'), rrH: t('extRoundRectMinHPt'),
                     rrCorner: t('extRoundRectCornerMaxPt'), rrPad: t('extRoundRectCornerPadPt'), rrEdge: t('extRoundRectEdgeTolPt'), rrSide: t('extRoundRectSideMinPt'),
                     pattern: t('extPatternMinPt'), opaque: t('extOpaqueAlpha'), ruleMin: t('extRuleMinPt'), ruleClip: t('extRuleClipTolPt'), flatMin: t('extFlatRuleMinPt'),
                     thinMax: t('extThinShapeMaxPt'), thinLen: t('extThinShapeMinLenPt'), thinAspect: t('extThinShapeAspect'),
                     frMinSegs: t('extFrameMinSegs'), frMaxSegs: t('extFrameMaxSegs'), frMin: t('extFrameMinPt'), frArea: t('extFrameAreaRatio'),
                     frShare: t('extFrameEdgeShare'), frTol: t('extFrameEdgeTolPt'), thinRect: t('extThinRectMaxPt'), thinRectLen: t('extThinRectMinLenPt') };
        },

        /** 1, the walk's marked-content operators (BDC / BMC / EMC); true when the operator was one */
        _opMarked(st, fn, args) {
            const OPS = st.OPS;
            if (fn === OPS.beginMarkedContentProps) {
                if (!st.formDepth) st.mcOrd++; st.mcStack.push(st.formDepth ? null : st.mcOrd);
                st.mcTag.push({ mcid: !st.formDepth && typeof args[1] === 'number' ? args[1] : null, artifact: args[0] === 'Artifact' });
                return true;
            }
            if (fn === OPS.beginMarkedContent) { st.mcStack.push(null); st.mcTag.push({ mcid: null, artifact: !!(args[0] && (args[0].name || args[0]) === 'Artifact') }); return true; }
            if (fn === OPS.endMarkedContent) { st.mcStack.pop(); st.mcTag.pop(); return true; }
            return false;
        },

        /** 1, the walk's text operators: text state and position, and the shown strings (_opGlyphs); true when the operator was one */
        _opText(st, fn, args) {
            const OPS = st.OPS, ts = st.ts;
            if (fn === OPS.beginText) { st.tm = st.tlm = [1, 0, 0, 1, 0, 0]; }
            else if (fn === OPS.setFont) { ts.font = args[0]; ts.size = args[1]; }
            else if (fn === OPS.setTextRenderingMode) ts.mode = args[0];   // 3 / 7: invisible (an OCR layer over a scan)
            else if (fn === OPS.setTextMatrix) { st.tm = st.tlm = Array.from(args.length === 6 ? args : args[0]); }
            else if (fn === OPS.moveText) this._opMoveText(st, args[0], args[1]);
            else if (fn === OPS.setLeadingMoveText) { ts.lead = -args[1]; this._opMoveText(st, args[0], args[1]); }
            else if (fn === OPS.nextLine) this._opMoveText(st, 0, -ts.lead);
            else if (fn === OPS.setLeading) ts.lead = args[0];
            else if (fn === OPS.setCharSpacing) ts.cs = args[0];
            else if (fn === OPS.setWordSpacing) ts.ws = args[0];
            else if (fn === OPS.setHScale) ts.hs = args[0] / 100;
            else if (fn === OPS.setTextRise) ts.rise = args[0];
            else if (fn === OPS.showText || fn === OPS.showSpacedText) this._opGlyphs(st, args[0]);
            else if (fn === OPS.nextLineShowText) { this._opMoveText(st, 0, -ts.lead); this._opGlyphs(st, args[0]); }
            else if (fn === OPS.nextLineSetSpacingShowText) { ts.ws = args[0]; ts.cs = args[1]; this._opMoveText(st, 0, -ts.lead); this._opGlyphs(st, args[2]); }
            else return false;
            return true;
        },

        /** 1, the text line matrix moved by (tx, ty), the text matrix with it */
        _opMoveText(st, tx, ty) { st.tlm = mul(st.tlm, [1, 0, 0, 1, tx, ty]); st.tm = st.tlm; },

        /** 1, a shown string's glyphs: placed in drawing order, with exact positions (the text matrix advances) */
        _opGlyphs(st, arr) {
            const ts = st.ts, ctm = st.ctm, glyphs = st.glyphs, gfx = st.gfx, view = st.view, fill = st.fill, opIndex = st.opIndex,
                  formDepth = st.formDepth, mcStack = st.mcStack, mcTag = st.mcTag, isCid = st.isCid, textFont = st.textFont, widthScale = st.widthScale, K = st.k;
            let tm = st.tm;
            if (!arr) return;
            for (let k = 0; k < arr.length; k++) {
                let g = arr[k];
                if (typeof g === 'number') { tm = mul(tm, [1, 0, 0, 1, -g / 1000 * ts.size * ts.hs, 0]); continue; }
                if (!g) continue;
                const trm = mul(mul(ctm, tm), [ts.size * ts.hs, 0, 0, ts.size, 0, ts.rise]);
                const w = (g.width || 0) * widthScale(ts.font) * ts.size;
                const adv = (w + ts.cs + (g.isSpace ? ts.ws : 0)) * ts.hs;
                const scale = Math.hypot(trm[0], trm[1]) / (ts.size * ts.hs || 1);
                if (g.unicode !== undefined && g.unicode !== null) {
                    // a glyph the font's ToUnicode does not cover (ligatures, small caps, old-style figures
                    // of OpenType fonts): PDF.js gives '' or the character of its code — repaired later
                    const cid = g.originalCharCode;
                    // Adobe's PUA small capitals / old-style figures (U+F761 = small "a", U+F730 = old-style "0")
                    const pc = g.unicode.length === 1 ? g.unicode.charCodeAt(0) : 0;
                    if (pc >= 0xF721 && pc <= 0xF77E && textFont(ts.font)) g = Object.assign({}, g, { unicode: String.fromCharCode(pc - 0xF700) });
                    const unmapped = !g.isSpace && g.width > 0 && (g.unicode === '' ||
                        (cid >= 0x100 && cid <= 0x2FF && isCid(ts.font) && g.unicode === String.fromCharCode(cid)) ||
                        (/^[\uE000-\uF8FF]$/.test(g.unicode) && textFont(ts.font)));
                    let span = null; for (let q = mcStack.length - 1; q >= 0 && span === null; q--) span = mcStack[q];
                    // a code pdf.js turned into the character of the same number (no ToUnicode entry): a guess,
                    // checked against the embedded font later (Cambria Math's script-size variants)
                    const guess = !unmapped && cid >= 0x300 && g.unicode.length === 1 && g.unicode === String.fromCharCode(cid) && isCid(ts.font);
                    glyphs.push({ span: span, guess: guess, ch: unmapped && g.unicode === '' ? '\uFFFD' : g.unicode, x: trm[4], y: trm[5], w: w * ts.hs * scale,
                                  size: Math.hypot(trm[2], trm[3]), font: ts.font, color: fill, cid: cid, gw: g.width * widthScale(ts.font) * 1000, unmapped: unmapped,
                                  // code 32 is the space only when it maps to one (subset fonts re-use the code: LibreOffice's "2")
                                  space: !unmapped && !String(g.unicode).trim() });
                    if (glyphs[glyphs.length - 1].space && /^[\t\n\r\f\v]+$/.test(g.unicode)) glyphs[glyphs.length - 1].ch = ' ';   // a tab drawn as the space (wkhtmltopdf)
                    glyphs[glyphs.length - 1].seq = opIndex;
                    // (turned: a vertical tab's letters — a side tab of a web page — have no baseline to share)
                    if (Math.abs(trm[1]) > K.rot * Math.abs(trm[0]) || trm[0] < 0) { glyphs[glyphs.length - 1].rot = true; this._fire('extract.rotatedText', st); }
                    if (ts.mode === 3 || ts.mode === 7) { glyphs[glyphs.length - 1].invisible = true; this._fire('extract.invisibleText', st); }
                    // (outside its clip: not shown — a Word text box in a page's margin holds a heading's copy, cut by
                    // the box to nothing; its letters had come back one or two at a time, «بین», «ت»)
                    // (a small clip only — a box an eighth of the page or less: a page's or a column's clip cuts the
                    // ends of lines that overflow, whose words the reader is still meant to have: Chrome's code blocks)
                    if (gfx.clip && (gfx.clip.x1 - gfx.clip.x0) * (gfx.clip.y1 - gfx.clip.y0) < K.clipShare * Math.abs((view[2] - view[0]) * (view[3] - view[1]))) {
                        const G = glyphs[glyphs.length - 1], c = gfx.clip;
                        if (G.x > c.x1 + K.clipTol || G.x + G.w < c.x0 - K.clipTol || G.y + K.he * G.size < c.y0 - K.clipTol || G.y > c.y1 + K.clipTol) { G.clipped = true; this._fire('extract.clippedText', st); }
                    }
                    // how the text is set, for r.features (evidence only): horizontal scaling (Tz), tracking (Tc, in em),
                    // and text drawn inside a Form XObject
                    if (ts.hs !== 1) glyphs[glyphs.length - 1].hs = ts.hs;
                    if (ts.cs) glyphs[glyphs.length - 1].track = ts.cs / (ts.size || 1);
                    if (formDepth) glyphs[glyphs.length - 1].inForm = true;
                    if (unmapped) glyphs[glyphs.length - 1].noMap = true;      // as the file had it (repairs clear .unmapped)
                    if (mcTag.length) {          // the innermost MCID, for the structure tree (_structure)
                        for (let q = mcTag.length - 1; q >= 0; q--) if (mcTag[q].mcid !== null) { glyphs[glyphs.length - 1].mcid = mcTag[q].mcid; break; }
                        if (mcTag.some(function (t) { return t.artifact; })) glyphs[glyphs.length - 1].artifact = true;
                    }   // counted by the provenance profile; laid out as any glyph
                }
                tm = mul(tm, [1, 0, 0, 1, adv, 0]);
            }
            st.tm = tm;
        },

        /** 1, the walk's graphics-state operators: save / restore, forms, CTM, ExtGState, clip, groups, colours; true when the operator was one */
        _opGraphics(st, fn, args) {
            const OPS = st.OPS;
            if (fn === OPS.save) st.stack.push([st.ctm, st.fill, st.stroke, Object.assign({}, st.ts), Object.assign({}, st.gfx)]);
            else if (fn === OPS.restore) { const s = st.stack.pop(); if (s) { st.ctm = s[0]; st.fill = s[1]; st.stroke = s[2]; st.ts = s[3]; if (s[4]) st.gfx = s[4]; } }
            else if (fn === OPS.transform) st.ctm = mul(st.ctm, args);
            else if (fn === OPS.paintFormXObjectBegin) {
                st.stack.push([st.ctm, st.fill, st.stroke, Object.assign({}, st.ts), Object.assign({}, st.gfx)]);
                const fm = args[0] && args[0].length === 6 ? Array.from(args[0]) : null;
                if (fm) st.ctm = mul(st.ctm, fm);
            } else if (fn === OPS.paintFormXObjectEnd) { const s = st.stack.pop(); if (s) { st.ctm = s[0]; st.fill = s[1]; st.stroke = s[2]; st.ts = s[3]; if (s[4]) st.gfx = s[4]; } }
            else if (fn === OPS.setGState) {
                const gfx = st.gfx, stats = st.stats;
                (args[0] || []).forEach(function (kv) {
                    if (kv[0] === 'ca') { gfx.alpha = +kv[1]; if (+kv[1] < 1) stats.alpha++; }
                    else if (kv[0] === 'BM') gfx.normal = /^(source-over|normal|compatible)$/i.test(String(kv[1]));
                    else if (kv[0] === 'SMask') { gfx.smask = !!kv[1]; if (kv[1]) stats.smask++; }     // under a soft mask: not opaque, whatever ca says
                });
            }
            else if (fn === OPS.clip || fn === OPS.eoClip) { st.pendingClip = true; st.stats.clips++; }
            else if (fn === OPS.beginGroup) { st.groups.push(!!(args[0] && args[0].smask)); st.groupAlpha.push((st.groupAlpha.length ? st.groupAlpha[st.groupAlpha.length - 1] : 1) * st.gfx.alpha); st.stats.groups++; }
            else if (fn === OPS.endGroup) { st.groups.pop(); st.groupAlpha.pop(); }
            // a pattern as the fill (Skia paints a picture as a rectangle filled with a tiling pattern: Firefox's
            // encyclopedia thumbnails) — what it fills is a picture, not a box
            else if (fn === OPS.setFillColorN) { if (args && (args[0] === 'TilingPattern' || args[0] === 'Shading' || args[0] === 'RadialAxial' || args[0] === 'Mesh')) { st.fill = 'pattern'; st.stats.patterns++; } }
            else if (fn === OPS.setFillRGBColor) st.fill = args[0];
            else if (fn === OPS.setStrokeRGBColor) st.stroke = args[0];
            else if (fn === OPS.setFillGray) st.fill = typeof args[0] === 'string' ? args[0] : '#000000';
            else return false;
            return true;
        },

        /** 1, the walk's image operators: a picture's box, where its clip lets it show; true when the operator was one */
        _opImages(st, fn, args) {
            const OPS = st.OPS;
            if (!(fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject)) return false;
            const ctm = st.ctm, gfx = st.gfx, groupAlpha = st.groupAlpha, opIndex = st.opIndex;
            const b = bboxOf([apply(ctm, 0, 0), apply(ctm, 1, 0), apply(ctm, 0, 1), apply(ctm, 1, 1)]);
            // (where its clip lets it show: a home page's card picture clipped away to nothing was "cropped" as the
            // title over it — the crop is of what the page shows there; a picture shown a tenth or less is none)
            const c = gfx.clip;
            const v = c ? { x0: Math.max(c.x0, b.x0), y0: Math.max(c.y0, b.y0), x1: Math.min(c.x1, b.x1), y1: Math.min(c.y1, b.y1) } : b;
            const shown = v.x1 > v.x0 && v.y1 > v.y0 ? (v.x1 - v.x0) * (v.y1 - v.y0) / Math.max(1e-6, (b.x1 - b.x0) * (b.y1 - b.y0)) : 0;
            // (and seen at all: a carousel's hidden slides are drawn in groups of opacity 0.002 — their pictures
            // were cropped as whatever the page shows there)
            const alpha = gfx.alpha * (groupAlpha.length ? groupAlpha[groupAlpha.length - 1] : 1), K = st.k;
            if (b.x1 - b.x0 > K.imgMin && b.y1 - b.y0 > K.imgMin) {
                if (shown > K.imgShown && alpha > K.imgAlpha) st.images.push(Object.assign({ seq: opIndex, objId: typeof args[0] === 'string' ? args[0] : null }, v));
                else this._fire('extract.pictureUnseen', st);
            }
            return true;
        },

        /** 1, the walk's paths (constructPath): a clip's path, or the shapes a painted path draws (_opShape) */
        _opPaths(st, args) {
            const self = this, ctm = st.ctm, gfx = st.gfx;
            const paint = args[0], buf = args[1] && args[1][0];
            if (!buf) return;
            if (st.pendingClip) {
                // the clip's path (W n): what is drawn from here on shows only inside it
                st.pendingClip = false;
                const cp = [];
                for (let k = 0; k < buf.length;) {
                    const op = buf[k];
                    if (op === 0 || op === 1) { cp.push(apply(ctm, buf[k + 1], buf[k + 2])); k += 3; }
                    else if (op === 2) { cp.push(apply(ctm, buf[k + 1], buf[k + 2]), apply(ctm, buf[k + 3], buf[k + 4]), apply(ctm, buf[k + 5], buf[k + 6])); k += 7; }
                    else if (op === 3) { cp.push(apply(ctm, buf[k + 1], buf[k + 2]), apply(ctm, buf[k + 3], buf[k + 4])); k += 5; }
                    else if (op === 4) k += 1; else break;
                }
                if (cp.length) {
                    const cb = bboxOf(cp), c = gfx.clip;
                    gfx.clip = c ? { x0: Math.max(c.x0, cb.x0), y0: Math.max(c.y0, cb.y0), x1: Math.min(c.x1, cb.x1), y1: Math.min(c.y1, cb.y1) } : cb;
                }
            }
            const isStroke = st.PAINT_STROKE.indexOf(paint) >= 0 || st.PAINT_BOTH.indexOf(paint) >= 0;
            const isFill = st.PAINT_FILL.indexOf(paint) >= 0 || st.PAINT_BOTH.indexOf(paint) >= 0;
            if (!isStroke && !isFill) return;
            // walk the path: 0 moveTo 1 lineTo 2 curveTo 3 quadTo 4 close
            const pts = []; let curves = 0, segs = []; let cur = null, start = null;
            const subs = []; let sub = null;   // sub-paths (a moveTo starts one)
            for (let k = 0; k < buf.length;) {
                const op = buf[k];
                if (op === 0) { cur = apply(ctm, buf[k + 1], buf[k + 2]); start = cur; pts.push(cur); sub = { pts: [cur], segs: [], curves: 0 }; subs.push(sub); k += 3; }
                else if (op === 1) { const p = apply(ctm, buf[k + 1], buf[k + 2]); if (cur) { segs.push([cur, p]); if (sub) sub.segs.push([cur, p]); } cur = p; pts.push(p); if (sub) sub.pts.push(p); k += 3; }
                else if (op === 2) { const p = apply(ctm, buf[k + 5], buf[k + 6]); pts.push(apply(ctm, buf[k + 1], buf[k + 2]), apply(ctm, buf[k + 3], buf[k + 4]), p); cur = p; curves++; if (sub) sub.curves++; k += 7; }
                else if (op === 3) { const p = apply(ctm, buf[k + 3], buf[k + 4]); pts.push(apply(ctm, buf[k + 1], buf[k + 2]), p); cur = p; curves++; if (sub) sub.curves++; k += 5; }
                else if (op === 4) { if (cur && start) { segs.push([cur, start]); if (sub) sub.segs.push([cur, start]); } cur = start; k += 1; }
                else break;
            }
            // one path of many axis-aligned rectangles (Microsoft Print to PDF / GDI draws every cell border of
            // a sheet as a sub-path of one filled path): each rectangle on its own
            const AX = st.k.axis;
            const rectSub = function (q) { return !q.curves && q.segs.length >= 3 && q.segs.length <= 5 && q.segs.every(function (sg) { return Math.abs(sg[0][0] - sg[1][0]) < AX || Math.abs(sg[0][1] - sg[1][1]) < AX; }); };
            if (subs.length > 1 && !curves && subs.every(rectSub)) { subs.forEach(function (q) { self._opShape(st, q.pts, q.segs, 0, isFill, isStroke); }); this._fire('extract.pathOfRects', st); }
            else this._opShape(st, pts, segs, curves, isFill, isStroke);
        },

        /** 1, one painted (sub-)path: a small mark, a box, a rule, a picture's pattern, or a vector shape */
        _opShape(st, pts, segs, curves, isFill, isStroke) {
            const gfx = st.gfx, fill = st.fill, stroke = st.stroke, opIndex = st.opIndex, groups = st.groups,
                  rects = st.rects, hsegs = st.hsegs, vsegs = st.vsegs, vectors = st.vectors, images = st.images, small = st.small;
            // a horizontal rule keeps the part the clip shows as .shown (Firefox draws a link's underline as a long
            // rule, clipped to the link: whole, it ran under neighbouring text and was read as a rule between
            // paragraphs). The rule itself stays whole: the tables are found from the rules as drawn (a vertical
            // rule of Chrome's table row cut by the page break, clipped, no longer met the row's top border)
            const K = st.k, AX = K.axis, self = this;
            const clipH = function (r) {
                const c = gfx.clip; if (r.x1 - r.x0 <= K.ruleMin) return;
                if (c && (r.x0 < c.x0 - K.ruleClip || r.x1 > c.x1 + K.ruleClip)) { r.shown = { x0: Math.max(r.x0, c.x0), x1: Math.min(r.x1, c.x1) }; self._fire('extract.ruleClipped', st); }
                hsegs.push(r);
            };
            const clipV = function (r) { if (r.y1 - r.y0 > K.ruleMin) vsegs.push(r); };
            if (!pts.length) return;
            const b = bboxOf(pts);
            if (b.x1 - b.x0 <= K.smMax && b.y1 - b.y0 <= K.smMax && (b.x1 - b.x0 > K.smMin || b.y1 - b.y0 > K.smMin)) {
                const axisSegs = segs.every(function (sg) { return Math.abs(sg[0][0] - sg[1][0]) < AX || Math.abs(sg[0][1] - sg[1][1]) < AX; });
                const axisOnly = !curves && axisSegs;
                // a rounded square with straight sides (a browser's checkbox)
                const sides = segs.filter(function (sg) { return Math.hypot(sg[0][0] - sg[1][0], sg[0][1] - sg[1][1]) > K.rbSide; }).length;
                const rz = Math.min((b.x1 - b.x0) / 2, (b.y1 - b.y0) / 2) * K.rbCorner + K.rbPad;
                const rbox = curves > 0 && axisSegs && sides >= 3 && b.x1 - b.x0 >= K.rbMin && pts.every(function (q) {
                    const ex = Math.min(q[0] - b.x0, b.x1 - q[0]), ey = Math.min(q[1] - b.y0, b.y1 - q[1]);
                    return ex < K.rbEdge || ey < K.rbEdge || (ex <= rz && ey <= rz);
                });
                if (b.x1 - b.x0 <= K.sm && b.y1 - b.y0 <= K.sm || rbox) small.push(Object.assign({ round: curves > 0, box: axisOnly && segs.length >= 3, rbox: rbox, fill: isFill, stroke: isStroke }, b));
                if (rbox) this._fire('extract.roundedCheckbox', st);
            }
            const axis = segs.length && !curves && segs.every(function (s) { return Math.abs(s[0][0] - s[1][0]) < AX || Math.abs(s[0][1] - s[1][1]) < AX; });
            let isRect = axis && segs.length >= 3 && segs.length <= 5 && b.x1 - b.x0 > K.rectMin && b.y1 - b.y0 > K.rectMin;
            // a rounded rectangle (four corner curves, straight axis-aligned sides) is a box too
            // (Skia splits each corner into several curves: every point lies on an edge of the box
            // or in a corner zone)
            if (!isRect && curves >= 4 && curves <= K.rrCurves && segs.length <= K.rrSegs && b.x1 - b.x0 > K.rrW && b.y1 - b.y0 > K.rrH &&
                segs.every(function (sg) { return Math.abs(sg[0][0] - sg[1][0]) < AX || Math.abs(sg[0][1] - sg[1][1]) < AX; })) {
                const rz = Math.min(K.rrCorner, (b.x1 - b.x0) / 2, (b.y1 - b.y0) / 2) + K.rrPad;
                const onBox = pts.every(function (q) {
                    const ex = Math.min(q[0] - b.x0, b.x1 - q[0]), ey = Math.min(q[1] - b.y0, b.y1 - q[1]);
                    return ex < K.rrEdge || ey < K.rrEdge || (ex <= rz && ey <= rz);
                });
                const corners = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]].every(function (c) {
                    return pts.some(function (q) { return Math.abs(q[0] - c[0]) <= rz && Math.abs(q[1] - c[1]) <= rz; });
                });
                // straight sides too (a circle is no box)
                const sides = segs.filter(function (sg) { return Math.hypot(sg[0][0] - sg[1][0], sg[0][1] - sg[1][1]) > K.rrSide; }).length;
                if (onBox && corners && sides >= 2) { isRect = true; curves = 0; this._fire('extract.roundedBox', st); }
            }
            if (isFill && fill === 'pattern') {
                if (b.x1 - b.x0 >= K.pattern && b.y1 - b.y0 >= K.pattern) { images.push(Object.assign({ pattern: true }, b)); this._fire('extract.patternPicture', st); }
            } else if (isRect && isFill) {
                const c = gfx.clip, vis = c ? { x0: Math.max(c.x0, b.x0), y0: Math.max(c.y0, b.y0), x1: Math.min(c.x1, b.x1), y1: Math.min(c.y1, b.y1) } : b;
                rects.push(Object.assign({ color: fill, stroked: isStroke ? stroke : null, seq: opIndex, opaque: gfx.alpha >= K.opaque && gfx.normal && !gfx.smask && !groups.some(function (m) { return m; }),
                    masked: gfx.alpha >= K.opaque && gfx.normal && gfx.smask && !groups.some(function (m) { return m; }), vis: vis }, b));
            }
            else if (isRect && isStroke) rects.push(Object.assign({ color: null, stroked: stroke }, b));
            if (axis && isStroke) {
                segs.forEach(function (s) {
                    const x0 = Math.min(s[0][0], s[1][0]), x1 = Math.max(s[0][0], s[1][0]);
                    const y0 = Math.min(s[0][1], s[1][1]), y1 = Math.max(s[0][1], s[1][1]);
                    if (y1 - y0 < AX && x1 - x0 > K.ruleMin) clipH({ x0: x0, x1: x1, y: (y0 + y1) / 2, color: stroke });
                    else if (x1 - x0 < AX && y1 - y0 > K.ruleMin) clipV({ y0: y0, y1: y1, x: (x0 + x1) / 2, color: stroke });
                });
            } else if (isFill && axis && (b.x1 - b.x0 < K.rectMin || b.y1 - b.y0 < K.rectMin)) {
                // a flat (zero-area) filled rectangle: a hairline rule when long, else nothing
                if (b.x1 - b.x0 > K.flatMin || b.y1 - b.y0 > K.flatMin) this._fire('extract.flatRule', st);
                if (b.x1 - b.x0 > K.flatMin) clipH({ x0: b.x0, x1: b.x1, y: (b.y0 + b.y1) / 2, color: fill, filled: true });
                else if (b.y1 - b.y0 > K.flatMin) clipV({ y0: b.y0, y1: b.y1, x: (b.x0 + b.x1) / 2, color: fill, filled: true });
            } else if (isFill && !isRect && !curves && Math.min(b.x1 - b.x0, b.y1 - b.y0) <= K.thinMax && Math.max(b.x1 - b.x0, b.y1 - b.y0) > Math.max(K.thinLen, K.thinAspect * Math.min(b.x1 - b.x0, b.y1 - b.y0))) {
                this._fire('extract.thinShapeRule', st);
                // a thin straight filled shape is a rule, whatever its ends (Firefox draws a collapsed table's
                // outer borders as thin trapezoids, mitred at the corners: the table lost its outer columns)
                if (b.y1 - b.y0 < b.x1 - b.x0) clipH({ x0: b.x0, x1: b.x1, y: (b.y0 + b.y1) / 2, color: fill, filled: true });
                else clipV({ y0: b.y0, y1: b.y1, x: (b.x0 + b.x1) / 2, color: fill, filled: true });
            } else if (isFill && !isRect && !curves && segs.length >= K.frMinSegs && segs.length <= K.frMaxSegs && Math.min(b.x1 - b.x0, b.y1 - b.y0) > K.frMin && (function () {
                // a thin frame band, its corners mitred (Prince's inset / outset cell borders: each cell drawn as two
                // L-shaped bands, dark above and left, grey below and right — a ruled table that had no rules):
                // its outer edges, those along its box, are the rules
                let a = 0;
                segs.forEach(function (sg) { a += sg[0][0] * sg[1][1] - sg[1][0] * sg[0][1]; });
                a = Math.abs(a / 2);
                const w = b.x1 - b.x0, h = b.y1 - b.y0;
                if (!(a > 0 && a <= K.frArea * (w + h))) return false;
                let hit = false;
                segs.forEach(function (sg) {
                    const x0 = Math.min(sg[0][0], sg[1][0]), x1 = Math.max(sg[0][0], sg[1][0]), y0 = Math.min(sg[0][1], sg[1][1]), y1 = Math.max(sg[0][1], sg[1][1]);
                    if (y1 - y0 < K.frTol && x1 - x0 > K.frShare * w && (Math.abs(y0 - b.y0) < K.frTol || Math.abs(y0 - b.y1) < K.frTol)) { clipH({ x0: x0, x1: x1, y: y0, color: fill, filled: true }); hit = true; }
                    else if (x1 - x0 < K.frTol && y1 - y0 > K.frShare * h && (Math.abs(x0 - b.x0) < K.frTol || Math.abs(x0 - b.x1) < K.frTol)) { clipV({ y0: y0, y1: y1, x: x0, color: fill, filled: true }); hit = true; }
                });
                return hit;
            })()) {
                this._fire('extract.frameBandRules', st);          // (the band's rules are in)
            } else if (isFill && !isRect) {
                const cv = gfx.clip;
                vectors.push(Object.assign({ curves: curves, color: fill, seq: opIndex,
                    solid: gfx.alpha >= K.opaque && gfx.normal && !groups.some(function (m) { return m; }),
                    vis: cv ? { x0: Math.max(cv.x0, b.x0), y0: Math.max(cv.y0, b.y0), x1: Math.min(cv.x1, b.x1), y1: Math.min(cv.y1, b.y1) } : b }, b));
            } else if (isRect && isFill && Math.min(b.x1 - b.x0, b.y1 - b.y0) < K.thinRect && Math.max(b.x1 - b.x0, b.y1 - b.y0) > K.thinRectLen) {
                // a thin filled rectangle is a rule (Word draws every cell border this way)
                this._fire('extract.thinRectRule', st);
                if (b.y1 - b.y0 < b.x1 - b.x0) clipH({ x0: b.x0, x1: b.x1, y: (b.y0 + b.y1) / 2, color: fill, filled: true });
                else clipV({ y0: b.y0, y1: b.y1, x: (b.x0 + b.x1) / 2, color: fill, filled: true });
            }
        },

        /** 1, after the walk: a zero-advance space as the ZWNJ it stands for, and text drawn twice at one place */
        _unicodeRepair(glyphs) {
            // a space glyph that takes no room (the next glyph starts where it does) stands
            // for a ZWNJ: Chrome / Skia map ZWNJ to U+0020 and advance by zero
            const LT = this._t('extZwnjLineTolPt'), ZA = this._t('extZwnjAdvanceEm'), ZT = this._t('extZwnjTakenShare');
            for (let k = 0; k + 1 < glyphs.length; k++) {
                const a = glyphs[k], b = glyphs[k + 1];
                // (Arabic script only: a zero-advance space between Hebrew or Latin letters is just a space)
                const pa = glyphs[k - 1];
                // (no room, not a narrow one: a calligraphic font's own space is 0.04 em wide, and the next word
                // starts where it ends — its advance taken, it is a space)
                if (a.ch === ' ' && Math.abs(a.y - b.y) < LT && Math.abs(b.x - a.x) < ZA * a.size && !(a.w > 0 && b.x - a.x > ZT * a.w) &&
                    /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test((pa ? pa.ch : '') + b.ch)) { a.ch = '\u200C'; a.space = false; a.w = 0; this._fire('extract.zwnjFromZeroSpace'); }
            }
            // text drawn twice at one place (web pages that lay a second text layer — a shadow, a selection layer —
            // over the first; Opera's PDF of a web app: "SSeettttiinnggss"): the second copy of a character at the same
            // origin and size goes. (Fake bold drawn a little offset is no copy: 0.3 pt at most here.)
            // Fake bold — each letter drawn again right after itself, a hair to the side (a Word letter's calligraphic
            // «بسمه تعالی» through PDFium: 0.32 pt at 16 pt, «ببسسمم») — is one letter: the copy goes (its boldness is
            // not kept: a letterhead line in bold would read as a heading). A hair: under 0.08 em and a quarter of the
            // letter's width (a real double letter is a width away).
            const seen = new Map(); let w = 0;
            const CS = this._t('extCopySizeTolPt'), FY = this._t('extFakeBoldYEm'), FB = this._t('extFakeBoldEm'), FW = this._t('extFakeBoldWidthShare'),
                  FM = this._t('extFakeBoldMinWPt'), TT = this._t('extTwiceTolPt'), TS = this._t('extTwiceSizeTolPt');
            for (let k = 0; k < glyphs.length; k++) {
                const g = glyphs[k];
                // (the copy may follow a short run — a space and a letter drawn, then both again: look two back)
                let copy = null;
                for (let b = w - 1; b >= Math.max(0, w - 2) && !copy; b--) {
                    const o = glyphs[b];
                    if (g.ch && o.ch === g.ch && o.font === g.font && Math.abs(o.size - g.size) < CS && Math.abs(o.y - g.y) < FY * g.size &&
                        Math.abs(g.x - o.x) > 0 && Math.abs(g.x - o.x) < Math.min(FB * g.size, g.space ? FB * g.size : FW * Math.max(g.w, FM))) copy = o;
                }
                if (copy) { this._fire('extract.fakeBoldCopy'); continue; }
                if (!g.space && g.ch) {
                    const key = g.ch + '|' + Math.round(g.x * 2) + '|' + Math.round(g.y * 2);
                    const o = seen.get(key);
                    if (o && Math.abs(o.x - g.x) < TT && Math.abs(o.y - g.y) < TT && Math.abs(o.size - g.size) < TS) { this._fire('extract.drawnTwice'); continue; }
                    seen.set(key, g);
                }
                glyphs[w++] = g;
            }
            glyphs.length = w;
        },

        /** 1, after the walk: text (and pictures) a later opaque fill covers */
        _hideCovered(st) {
            // text a later opaque fill covers is hidden from the reader (a cookie banner, a dialog over a web page:
            // the page under it was read into the banner's text): it goes. Opaque = full opacity, normal blending;
            // the fill counts only where its clip lets it show
            const glyphs = st.glyphs, rects = st.rects, vectors = st.vectors, images = st.images, self = this;
            const CW = this._t('extCoverMinWPt', st), CH = this._t('extCoverMinHPt', st), MC = this._t('extMaskedCoverMinPt', st), MG = this._t('extMaskedCoverMinGlyphs', st),
                  MI = this._t('extMaskedInsetMaxPt', st), MS = this._t('extMaskedInsetShare', st), MID = this._t('extGlyphMidEm', st), EDGE = this._t('extCoverEdgePt', st),
                  PH = this._t('extPictureHiddenShare', st);
            const covers = rects.filter(function (r) { return r.opaque && r.color && r.vis && r.vis.x1 - r.vis.x0 >= CW && r.vis.y1 - r.vis.y0 >= CH; });
            // a fill under a soft mask — a banner's rounded corners — covers too when it carries text of its own drawn
            // after it (a cookie banner, a dialog: a fade or a shadow carries none), inside its corners only
            // (and a shape filled whole — a rounded banner drawn as a path —, on the same terms)
            rects.concat(vectors.filter(function (v) { return v.solid; }).map(function (v) { return Object.assign({ masked: true }, v); })).forEach(function (r) {
                if (!r.masked || !r.color || !r.vis || r.vis.x1 - r.vis.x0 < MC || r.vis.y1 - r.vis.y0 < MC) return;
                const own = glyphs.filter(function (g) { return !g.space && g.seq !== undefined && g.seq > r.seq && g.x > r.vis.x0 && g.x + g.w < r.vis.x1 && g.y > r.vis.y0 && g.y < r.vis.y1; }).length;
                if (own < MG) return;
                const m = Math.min(MI, MS * Math.min(r.vis.x1 - r.vis.x0, r.vis.y1 - r.vis.y0));
                covers.push({ seq: r.seq, vis: { x0: r.vis.x0 + m, x1: r.vis.x1 - m, y0: r.vis.y0 + m, y1: r.vis.y1 - m } });
                self._fire('extract.maskedCover', st);
            });
            if (!covers.length) return;
            let w = 0, hidden = 0;
            for (let k = 0; k < glyphs.length; k++) {
                const g = glyphs[k];
                if (g.clipped) { hidden++; this._fire('extract.clippedDropped', st); continue; }
                if (!g.space && g.seq !== undefined) {
                    const cx = g.x + g.w / 2, cy = g.y + MID * g.size;
                    if (covers.some(function (r) { return r.seq > g.seq && cx > r.vis.x0 + EDGE && cx < r.vis.x1 - EDGE && cy > r.vis.y0 + EDGE && cy < r.vis.y1 - EDGE; })) { hidden++; this._fire('extract.coveredDropped', st); continue; }
                    // drawn on a cover (a banner's own text): the page's links under the banner are not its links —
                    // a cookie banner over a card took the card's link for every one of its lines and buttons
                    // (the last drawn under it: a page's own background is a cover too, under everything)
                    const on = covers.filter(function (r) { return r.seq < g.seq && cx > r.vis.x0 && cx < r.vis.x1 && cy > r.vis.y0 && cy < r.vis.y1; })
                        .sort(function (a, b) { return b.seq - a.seq; })[0];
                    if (on) { g.cover = on.vis; this._fire('extract.textOnCover', st); }
                }
                glyphs[w++] = g;
            }
            glyphs.length = w;
            if (hidden) this._hiddenGlyphs = (this._hiddenGlyphs || 0) + hidden;
            // a picture a later cover hides in part (a quarter or more: the reader sees a piece of it — a home page's
            // card picture half under its cookie banner was cropped as half a word) is no picture to give back:
            // text wins, and a piece of a picture is not the picture
            // (any opaque fill drawn after it counts here, a card's rounded background too: a carousel's pictures
            // under the next card were cropped as the card's title image above them)
            const over = covers.concat(rects.filter(function (r) { return r.opaque && r.color && r.vis; }), vectors.filter(function (v) { return v.solid && v.color && v.color !== 'pattern' && v.vis; }));
            for (let k = images.length - 1; k >= 0; k--) {
                const im = images[k];
                if (im.seq === undefined) continue;
                const area = (im.x1 - im.x0) * (im.y1 - im.y0);
                const hid = over.filter(function (r) { return r.seq > im.seq; }).reduce(function (a, r) {
                    const w = Math.min(im.x1, r.vis.x1) - Math.max(im.x0, r.vis.x0), h = Math.min(im.y1, r.vis.y1) - Math.max(im.y0, r.vis.y0);
                    return Math.max(a, w > 0 && h > 0 ? w * h : 0);
                }, 0);
                if (hid >= PH * area) { images.splice(k, 1); this._fire('extract.pictureCovered', st); }
            }
        },

        /** 1, after the walk: a code mapped to U+FFFD in a font that maps its ASCII codes to themselves → the code's character */
        _codeRepair(glyphs, isCid) {
            // a code its ToUnicode maps to U+FFFD — "no character" — in a font that maps the rest of its ASCII codes to
            // themselves: the character of the code. A typesetter's table of contents (Adobe PDF Library) draws its dot
            // leaders with the body font's period, maps that one code to U+FFFD, and wraps the run in an /ActualText of
            // a control character (the tab it was): every entry's leader came back as a row of «�». Nine in ten of the
            // font's other ASCII codes on the page, ten at least, must read as themselves — or all of them, four at least
            // (a bold face used for one entry: «Index» and its page number)
            const by = {}, self = this, MS = this._t('extCodeRepairMinSame'), RT = this._t('extCodeRepairRatio'), MA = this._t('extCodeRepairMinAlone');
            glyphs.forEach(function (g) {
                if (!(g.cid >= 0x21 && g.cid <= 0x7E) || g.unmapped) return;
                const s = by[g.font] || (by[g.font] = { same: 0, other: 0, lost: [] });
                if (g.ch === '�') s.lost.push(g);
                else if (g.ch === String.fromCharCode(g.cid)) s.same++;
                else s.other++;
            });
            Object.keys(by).forEach(function (f) {
                const s = by[f];
                if (!s.lost.length || isCid(f) || !(s.same >= MS && s.same >= RT * s.other || !s.other && s.same >= MA)) return;
                s.lost.forEach(function (g) { g.ch = String.fromCharCode(g.cid); g.fromCode = true; });
                self._fire('extract.codeForFffd');
            });
        },

        /** 1, after the walk: a dashed or dotted border drawn dash by dash → one rule */
        _dashedRules(st) {
            // a dashed or dotted border drawn dash by dash (Chrome fills each dash of a `dashed` / `dotted` border as a
            // rectangle of its own): a run of four or more small marks of one size and colour on one line, each the
            // next's neighbour by less than a few dash lengths, is one rule — the frame of a code block or a box.
            // Left as marks, the frame's left side stood beside every line as a bullet («-   ┌──…» a list item a
            // line, the code lost). A dash is long along its run (1.5 × its thickness) or a dot of 1.5 pt at most:
            // bullets stand a line apart, and a dot grid's dots are larger than a border's
            const rects = st.rects, hsegs = st.hsegs, vsegs = st.vsegs, small = st.small, self = this;
            const TMIN = this._t('extDashMinThickPt', st), TMAX = this._t('extDashMaxThickPt', st), LMAX = this._t('extDashMaxLenPt', st), ASP = this._t('extDashAspect', st),
                  DOT = this._t('extDotMaxPt', st), RUN = this._t('extDashMinRun', st), SPAN = this._t('extDashMinSpanPt', st), SAME = this._t('extDashSameLenPt', st),
                  OVL = this._t('extDashOverlapPt', st), GR = this._t('extDashGapRatio', st), GM = this._t('extDashGapMinPt', st);
            const sz = function (r) { return { w: r.x1 - r.x0, h: r.y1 - r.y0 }; };
            const used = new Set();
            const runs = function (horiz) {
                const c = rects.filter(function (r) {
                    const s = sz(r), len = horiz ? s.w : s.h, th = horiz ? s.h : s.w;
                    return th > TMIN && th <= TMAX && len <= LMAX && (len >= ASP * th || len <= DOT && th <= DOT) && !used.has(r);
                });
                const key = function (r) { return (horiz ? Math.round((r.y0 + r.y1) * 2) : Math.round((r.x0 + r.x1) * 2)) + '|' + (r.color || r.stroked); };
                const by = {};
                c.forEach(function (r) { (by[key(r)] = by[key(r)] || []).push(r); });
                Object.keys(by).forEach(function (k) {
                    const L = by[k].sort(function (a, b) { return horiz ? a.x0 - b.x0 : a.y0 - b.y0; });
                    let run = [L[0]];
                    const close = function () {
                        if (run.length >= RUN) {
                            const a = run[0], z = run[run.length - 1];
                            const span = horiz ? z.x1 - a.x0 : z.y1 - a.y0;
                            if (span >= SPAN) {
                                run.forEach(function (r) { used.add(r); });
                                self._fire('extract.dashedRule', st);
                                if (horiz) hsegs.push({ x0: a.x0, x1: z.x1, y: (a.y0 + a.y1) / 2, color: a.color || a.stroked, dashed: true });
                                else vsegs.push({ y0: a.y0, y1: z.y1, x: (a.x0 + a.x1) / 2, color: a.color || a.stroked, dashed: true });
                            }
                        }
                    };
                    for (let i = 1; i < L.length; i++) {
                        const p = run[run.length - 1], r = L[i];
                        const len = horiz ? p.x1 - p.x0 : p.y1 - p.y0, gap = horiz ? r.x0 - p.x1 : r.y0 - p.y1;
                        const same = Math.abs((horiz ? r.x1 - r.x0 : r.y1 - r.y0) - len) <= SAME;
                        if (gap > -OVL && gap <= Math.max(GR * len, GM) && same) run.push(r);
                        else { close(); run = [r]; }
                    }
                    close();
                });
            };
            runs(true); runs(false);
            if (!used.size) return;
            for (let k = rects.length - 1; k >= 0; k--) if (used.has(rects[k])) rects.splice(k, 1);
            const at = function (r) { return r.x0.toFixed(1) + ',' + r.y0.toFixed(1) + ',' + r.x1.toFixed(1) + ',' + r.y1.toFixed(1); };
            const gone = new Set(Array.from(used).map(at));
            for (let k = small.length - 1; k >= 0; k--) if (gone.has(at(small[k]))) small.splice(k, 1);
        },

        /** 1, after the walk: text too small to read */
        _tinyText(glyphs) {
            // text too small to read (under 2 pt on a page whose text is of a reading size): no reader's — a Word
            // letterhead's 1-pt code in its logo, a code a printer stamps (a page drawn small is left alone)
            const sizes = glyphs.filter(function (g) { return !g.space; }).map(function (g) { return g.size; });
            if (sizes.length < this._t('extTinyMinGlyphs') || median(sizes) < this._t('extTinyPageMinPt')) return;
            let w = 0;
            const TM = this._t('extTinyMaxPt');
            for (let k = 0; k < glyphs.length; k++) if (!(glyphs[k].size < TM)) glyphs[w++] = glyphs[k];
            if (w < glyphs.length) this._fire('extract.tinyTextDropped');
            glyphs.length = w;
        },

        /**
         * Glyphs with no Unicode in the PDF (OpenType ligatures, small capitals … that the producer
         * left out of ToUnicode, e.g. XeTeX). Per font:
         *  - ligatures: a glyph between letters whose width is the sum of known letters' widths
         *    (fi, fl, ff, ffi, ffl, Th, st, ct …);
         *  - small capitals: glyph codes in alphabetical order (a.sc … z.sc are consecutive in the
         *    font), so one offset maps them all — the offset whose letters read most like English.
         * What stays unknown is dropped (a stray Latin-Extended character is worse than nothing).
         */
        /**
         * An ornament font's glyph (a Persian letter's heading ornament in the Nemad font, drawn by typing "g"): a font
         * the document uses for one to three Latin letters and nothing else, each as wide as it is tall (a letter is
         * half an em), in text of another script — a picture, not the letter its cmap names.
         */
        /**
         * Presentation forms read from glyph order (PDFIMPORT.md §4, "Shapes by use"): a font subset that keeps the full
         * font's glyph order (Prince) and names every form by its base letter still numbers a letter's forms one after
         * another, in the order of the font — B Nazanin's: isolated, final, initial, medial. Where a dual-joining letter
         * has four codes in a row (a right-joining one two), and the widths agree — a tailed letter's isolated and final
         * forms are wider than its initial and medial — on most such letters of the font, the codes are those forms:
         * a ZWNJ the file did not draw shows again («نقش‌ها», «تصمیم‌گیری» in a Prince letter, where use alone could
         * not tell: the letter's final form stood before a ZWNJ more often than at a word's end).
         */
        _formsByOrder(pages) {
            const FORMS = {};                  // base → [codes of its forms by index]
            Object.keys(PF).forEach(function (c) { const e = PF[c]; (FORMS[e[0]] = FORMS[e[0]] || [])[e[1]] = c; });
            const DUAL4 = /^[\u0626\u0628\u062A-\u062E\u0633-\u063A\u0641-\u0647\u064A\u067E\u0686\u06A9\u06AF\u06CC]$/;
            const RIGHT2 = /^[\u0622\u0623\u0624\u0625\u0627\u0629\u062F-\u0632\u0648\u0698]$/;
            const TAIL = /^[\u0628\u062A\u062B\u062C-\u062E\u0633-\u0636\u0639\u063A\u0641\u0642\u0644\u0646\u064A\u067E\u0686\u06A9\u06AF\u06CC]$/;
            const byFont = {};
            pages.forEach(function (p) { p.glyphs.forEach(function (g) {
                if (g.space || g.cid === undefined || typeof g.ch !== 'string') return;
                const F = byFont[g.font] || (byFont[g.font] = { forms: 0, letters: {} });
                if (PF[g.ch]) { F.forms++; return; }
                if (g.ch.length !== 1 || !FORMS[g.ch]) return;
                const L = F.letters[g.ch] || (F.letters[g.ch] = {});
                L[g.cid] = g.gw;
            }); });
            const K = { FORMS: FORMS, DUAL4: DUAL4, RIGHT2: RIGHT2, TAIL: TAIL };
            this._formsRuns(byFont, K);
            const nameOf = {};
            pages.forEach(function (p) { Object.keys(p.fonts || {}).forEach(function (k) { const f = p.fonts[k]; if (f && !(k in nameOf)) nameOf[k] = String(f.name || '').replace(/^[A-Z]{6}\+/, ''); }); });
            const family = function (n) { return n.replace(/[-,]?(Bold|Italic|Oblique|Regular|Medium|Light|Black|Semi\w*|Demi\w*)$/i, '').replace(/[-,\s]+$/, '').toLowerCase(); };
            K.nameOf = nameOf; K.family = family;
            this._formsByPlace(pages, byFont, K);
            this._formsByOutline(pages, byFont, K);
            this._formsByWidth(byFont, K);
            Object.keys(byFont).forEach(function (fid) {
                const F = byFont[fid], map = F.map;
                if (!map || !Object.keys(map).length) return;
                // (a form read by width says its forward join only: `formGuess` — the back join it is named with is no evidence)
                pages.forEach(function (p) { p.glyphs.forEach(function (g) { if (g.font === fid && !g.space && g.cid in map && FORMS[g.ch]) { g.ch = map[g.cid]; if (!(F.exact && F.exact[g.cid])) g.formGuess = true; } }); });
            });
        },

        /** _formsByOrder, step 1: a letter's codes in a row whose widths agree with the forms' order */
        _formsRuns(byFont, K) {
            const FORMS = K.FORMS, DUAL4 = K.DUAL4, RIGHT2 = K.RIGHT2, TAIL = K.TAIL, self = this;
            const TR = this._t('extFormsTailRatio'), MIN = this._t('extFormsMinLetters'), RAT = this._t('extFormsRatio');
            Object.keys(byFont).forEach(function (fid) {
                const F = byFont[fid];
                if (F.forms) return;                                          // (the font names its forms already)
                const runs = {};
                Object.keys(F.letters).forEach(function (ch) {
                    const cids = Object.keys(F.letters[ch]).map(Number).sort(function (a, b) { return a - b; });
                    const n = DUAL4.test(ch) ? 4 : RIGHT2.test(ch) ? 2 : 0;
                    if (n && cids.length === n && cids[n - 1] - cids[0] === n - 1) runs[ch] = cids;
                });
                // (the widths agree: a tailed letter's isolated and final forms wider than its joining ones)
                let ok = 0, bad = 0;
                Object.keys(runs).forEach(function (ch) {
                    if (runs[ch].length !== 4 || !TAIL.test(ch)) return;
                    const w = runs[ch].map(function (c) { return F.letters[ch][c]; });
                    if (Math.min(w[0], w[1]) > TR * Math.max(w[2], w[3])) ok++; else bad++;
                });
                const map = {}, exact = {};
                if (ok >= MIN && ok >= RAT * bad) Object.keys(runs).forEach(function (ch) { runs[ch].forEach(function (c, i) { if (FORMS[ch][i]) { map[c] = FORMS[ch][i]; exact[c] = 1; } }); });
                F.map = map; F.exact = exact;
                if (ok >= MIN && ok >= RAT * bad) { F.ref = runs; self._fire('extract.formsByOrder'); }
            });
        },

        /** _formsByOrder: where each code of a font stands — whether its place allows a back join, a forward one */
        _formsPlaces(pages, fid, RIGHT2) {
            // (a letter with fewer codes in a row — the bold face of a few words uses two or three of its forms — by where
            // they stand, first: the codes keep the forms' order, and some places allow only some forms whatever the file
            // left undrawn — after a letter that joins nothing forward, or at a word's start, no back join (isolated or
            // initial); before a gap, a space or a mark of punctuation, no forward join (isolated or final). A ZWNJ the file
            // did not draw only breaks joins, so these hold. Where one order-keeping choice of forms fits every place each
            // code stands, the codes are those forms: heh, whose forms no width tells, «برنامه‌ریزی» in a Prince letter's
            // bold signature — «گروه» had its isolated heh, «واحدها» an unjoined one, the code between them the final)
            const at = {}, JG = this._t('extFormsJoinGapEm');  // cid → [{ back: false | null, fwd: false | null }]
            pages.forEach(function (p) {
                const rows = {};
                p.glyphs.forEach(function (g) { if (!g.space && typeof g.ch === 'string' && g.ch.trim()) (rows[Math.round(g.y)] = rows[Math.round(g.y)] || []).push(g); });
                Object.keys(rows).forEach(function (y) {
                    const row = (rows[y] || []).concat(rows[+y - 1] || [], rows[+y + 1] || []).sort(function (a, b) { return (a.x + a.w / 2) - (b.x + b.w / 2); });
                    (rows[y] || []).forEach(function (g) {
                        if (g.font !== fid || g.cid === undefined) return;
                        const i = row.indexOf(g), r = row[i + 1], l = row[i - 1], tol = JG * g.size;
                        const base = function (x) { return PF[x.ch] ? PF[x.ch][0] : x.ch; };
                        const letter = function (x) { return /\p{L}/u.test(base(x)); };
                        // (to the right: the letter before it; to the left: the one after it — the line runs right to left)
                        const noBack = !r || r.x - (g.x + g.w) > tol || !letter(r) || RIGHT2.test(base(r)) || !/[\u0600-\u06FF]/.test(base(r));
                        const noFwd = !l || g.x - (l.x + l.w) > tol || !letter(l) || !/[\u0600-\u06FF]/.test(base(l));
                        (at[g.cid] = at[g.cid] || []).push({ noBack: noBack, noFwd: noFwd });
                    });
                });
            });
            return at;
        },

        /** _formsByOrder, step 2: a letter with fewer codes in a row, by where they stand */
        _formsByPlace(pages, byFont, K) {
            const self = this, FORMS = K.FORMS, DUAL4 = K.DUAL4, RIGHT2 = K.RIGHT2, nameOf = K.nameOf, family = K.family;
            const glyphPlaces = function (fid) { return self._formsPlaces(pages, fid, RIGHT2); };
            Object.keys(byFont).forEach(function (fid) {
                const F = byFont[fid];
                if (F.forms || !F.map) return;
                const kin = F.ref || Object.keys(byFont).some(function (o) { return o !== fid && byFont[o].ref && family(nameOf[o] || '') === family(nameOf[fid] || '') && family(nameOf[fid] || ''); });
                if (!kin) return;
                let at = null;
                Object.keys(F.letters).forEach(function (ch) {
                    const cids = Object.keys(F.letters[ch]).map(Number).sort(function (a, b) { return a - b; });
                    const n = DUAL4.test(ch) ? 4 : RIGHT2.test(ch) ? 2 : 0;
                    if (!n || cids.length >= n || cids[cids.length - 1] - cids[0] !== cids.length - 1 || cids.some(function (c) { return c in F.map; })) return;
                    at = at || glyphPlaces(fid);
                    // forms: 0 isolated, 1 final, 2 initial, 3 medial (a right-joining letter: 0, 1)
                    const fits = function (c, f) { return (at[c] || []).every(function (o) { return !(o.noBack && (f === 1 || f === 3)) && !(o.noFwd && (f === 2 || f === 3)); }); };
                    const choices = [];
                    const pick = function (from, chosen) {
                        if (chosen.length === cids.length) { choices.push(chosen.slice()); return; }
                        for (let f = from; f < n; f++) if (fits(cids[chosen.length], f)) { chosen.push(f); pick(f + 1, chosen); chosen.pop(); }
                    };
                    pick(0, []);
                    if (!choices.length) return;
                    cids.forEach(function (c, i) {
                        const f = choices[0][i];
                        if (choices.every(function (o) { return o[i] === f; }) && FORMS[ch][f]) { F.map[c] = FORMS[ch][f]; F.exact[c] = 1; self._fire('extract.formsByPlace'); }
                    });
                });
            });
        },

        /** _formsByOrder, step 3: forms by outline (_outlineJoins) */
        _formsByOutline(pages, byFont, K) {
            const self = this, FORMS = K.FORMS, DUAL4 = K.DUAL4, RIGHT2 = K.RIGHT2;
            const glyphPlaces = function (fid) { return self._formsPlaces(pages, fid, RIGHT2); };
            // forms by outline (round 26; `_outlineJoins`): a face whose codes keep no order of forms — a modern font's
            // subset, its forms from GSUB — still has its outlines, and a joining stroke runs to the glyph's edge on the side
            // it joins. Read for each code of a letter, after its order and its places (they are exact too), before its
            // width (a guess). The outlines must tell the font's way: no right-joining letter's code reaching its left edge,
            // no join where the page shows that code standing apart — a letter whose codes do (a tail that runs past the
            // edge: a final yeh's) is left to the other readings, and a font where a quarter of the letters do is read by
            // none. A Prince letter in a modern font: its bold face, used for two lines, each «توسعه‌های», read «توسعههای»
            const JB = this._joinsBy || {}, OM = this._t('extOutlineMinLetters'), OB = this._t('extOutlineBadRatio');
            Object.keys(byFont).forEach(function (fid) {
                const F = byFont[fid], J = JB[fid];
                if (F.forms || !F.map || !J) return;
                const at = glyphPlaces(fid), read = {};
                let letters = 0, badLetters = 0, rightFwd = 0, joinsFwd = 0, apart = 0;
                Object.keys(F.letters).forEach(function (ch) {
                    const dual = DUAL4.test(ch), right = RIGHT2.test(ch);
                    if ((!dual && !right) || !FORMS[ch]) return;
                    const mine = {}; let bad = false;
                    Object.keys(F.letters[ch]).forEach(function (c) {
                        if (c in F.map) return;
                        const j = J(+c); if (!j) return;
                        if (right && j.fwd) { rightFwd++; bad = true; return; }
                        if ((at[c] || []).some(function (o) { return (j.fwd && o.noFwd) || (j.back && o.noBack); })) bad = true;
                        mine[c] = j.fwd ? (j.back ? 3 : 2) : (j.back ? 1 : 0);
                    });
                    if (!Object.keys(mine).length) return;
                    letters++;
                    if (bad) { badLetters++; return; }
                    Object.keys(mine).forEach(function (c) { read[c] = { ch: ch, f: mine[c] }; if (dual) { if (mine[c] >= 2) joinsFwd++; else apart++; } });
                });
                if (rightFwd || letters < OM || OB * badLetters > letters || !joinsFwd || !apart) return;
                Object.keys(read).forEach(function (c) { const f = FORMS[read[c].ch][read[c].f]; if (f) { F.map[c] = f; F.exact[c] = 1; } });
                self._fire('extract.formsByOutline');
            });
        },

        /** _formsByOrder, step 4: a letter with fewer codes, by width against its skeleton's read forms */
        _formsByWidth(byFont, K) {
            const FORMS = K.FORMS, nameOf = K.nameOf, family = K.family, self = this;
            const SK = this._t('extSkeletonRatio'), BS = this._t('extBoldScaleMinSamples'), WS = this._t('extFormWideShare'), NR = this._t('extFormNarrowRatio');
            // (a letter with fewer codes — the bold face of a few words uses two or three of its forms — by width, against a
            // letter of its skeleton whose forms were read, in this face or in its family's regular one (B Nazanin for B
            // Nazanin Bold, scaled): a tailed letter's isolated and final forms are wide, its initial and medial narrow. A
            // code read so is named the final or the medial form — what it says forward is known, its back join is not
            // (`formGuess`); a ZWNJ is read from the forward side only. Two narrow codes — an initial and a medial — are
            // no wide and narrow pair: the skeleton's widths decide, not the letter's own spread)
            const GROUPS = ['بپتثنیيئ', 'جچحخ', 'سش', 'صض', 'عغ', 'فق', 'کگك', 'ل'];
            const groupOf = function (ch) { for (let i = 0; i < GROUPS.length; i++) if (GROUPS[i].indexOf(ch) >= 0) return i; return -1; };
            const skeletons = function (F) {
                const out = {};
                if (!F.ref) return out;
                Object.keys(F.ref).forEach(function (ch) {
                    const run = F.ref[ch], gi = groupOf(ch);
                    if (gi < 0 || run.length !== 4) return;
                    const w = run.map(function (c) { return F.letters[ch][c]; });
                    const wide = Math.min(w[0], w[1]), narrow = Math.max(w[2], w[3]);
                    if (!(wide > SK * narrow)) return;
                    const o = out[gi] || (out[gi] = { wide: Infinity, narrow: 0 });
                    o.wide = Math.min(o.wide, wide); o.narrow = Math.max(o.narrow, narrow);
                });
                return out;
            };
            // (the font ids listed once: listing them again for each font and each candidate was cubic in the fonts —
            // a 276-page file of 1 095 fonts held the thread 27 s here)
            const ids = Object.keys(byFont);
            ids.forEach(function (fid) {
                const F = byFont[fid];
                if (F.forms || !F.map) return;
                let sk = skeletons(F), k = 1;
                const fam = family(nameOf[fid] || '');
                const rid = fam ? ids.find(function (id) { return id !== fid && byFont[id].ref && family(nameOf[id] || '') === fam; }) : undefined;
                const R = rid === undefined ? undefined : byFont[rid];
                if (R) {
                    // (a bold face is wider throughout: its letters' widest codes over the regular's, their median)
                    const rat = [];
                    Object.keys(F.letters).forEach(function (ch) {
                        if (!R.letters[ch] || Object.keys(F.letters[ch]).length < 2 || Object.keys(R.letters[ch]).length < 2) return;
                        const a = Math.max.apply(null, Object.keys(F.letters[ch]).map(function (c) { return F.letters[ch][c]; }));
                        const b = Math.max.apply(null, Object.keys(R.letters[ch]).map(function (c) { return R.letters[ch][c]; }));
                        if (a > 0 && b > 0) rat.push(a / b);
                    });
                    rat.sort(function (x, y) { return x - y; });
                    k = rat.length >= BS ? rat[rat.length >> 1] : 1;
                    const rs = skeletons(R);
                    Object.keys(rs).forEach(function (gi) { if (!sk[gi]) sk[gi] = { wide: rs[gi].wide * k, narrow: rs[gi].narrow * k }; });
                }
                Object.keys(F.letters).forEach(function (ch) {
                    const gi = groupOf(ch), o = sk[gi];
                    if (gi < 0 || !o || !FORMS[ch][3]) return;
                    Object.keys(F.letters[ch]).forEach(function (c) {
                        if (c in F.map) return;
                        const w = F.letters[ch][c];
                        if (w >= WS * o.wide) { F.map[c] = FORMS[ch][1]; self._fire('extract.formsByWidth'); } else if (w <= NR * o.narrow) { F.map[c] = FORMS[ch][3]; self._fire('extract.formsByWidth'); }
                    });
                });
            });
        },

        _ornaments(pages) {
            const by = {}, self = this, OS = this._t('extOrnamentSquareEm'), OM = this._t('extOrnamentMaxGlyphs'); let latin = 0, other = 0;
            pages.forEach(function (p) { p.glyphs.forEach(function (g) {
                if (g.space || !g.ch) return;
                (by[g.font] = by[g.font] || []).push(g);
                if (/\p{Script=Latin}/u.test(g.ch)) latin++; else if (/\p{L}/u.test(g.ch)) other++;
            }); });
            if (other < this._t('extOrnamentScriptRatio') * Math.max(1, latin)) return;
            Object.keys(by).forEach(function (f) {
                const gs = by[f];
                if (gs.length > OM || !gs.every(function (g) { return /^[A-Za-z]$/.test(g.ch) && g.size > 0 && g.w >= OS * g.size; })) return;
                gs.forEach(function (g) { g.ch = '\uFFFC'; g.pic = true; g.ornament = true; });
                self._fire('extract.ornament');
            });
        },

        _repairUnmapped(pages) {
            const byFont = this._unmappedFonts(pages), self = this;
            const maps = this._unmappedMaps(pages, byFont);
            this._unmappedMarkers(pages, maps);
            pages.forEach(function (p) {
                p.glyphs = p.glyphs.filter(function (g) {
                    if (!g.unmapped) return true;
                    const m = maps[g.font] && maps[g.font][g.cid];
                    if (!m) { self._fire('extract.unmappedDropped', p); return false; }    // unknown: dropped
                    g.ch = m; g.unmapped = false;
                    return true;
                });
            });
        },

        /** _repairUnmapped, step 1: per font, its letters' widths and its unmapped codes with their neighbours and runs */
        _unmappedFonts(pages) {
            const byFont = {}, LT = this._t('extUnmappedLineTolPt'), WG = this._t('extUnmappedWordGapEm');
            pages.forEach(function (p) {
                const gs = p.glyphs;
                gs.forEach(function (g, i) {
                    const F = byFont[g.font] || (byFont[g.font] = { widths: {}, un: {}, runs: [] });
                    if (!g.unmapped) { if (!g.space && g.ch.length === 1 && g.gw > 0) F.widths[g.ch] = g.gw; return; }
                    const u = F.un[g.cid] || (F.un[g.cid] = { cid: g.cid, gw: g.gw, n: 0, nearLetter: 0, nearUn: 0, nearUpper: 0, ctx: [] });
                    u.n++;
                    const nbCh = function (nb) { return nb && !nb.unmapped && !nb.space && nb.font === g.font && Math.abs(nb.y - g.y) <= LT ? nb.ch.toLowerCase() : ''; };
                    if (u.ctx.length < 80) u.ctx.push([nbCh(gs[i - 1]), nbCh(gs[i + 1])]);
                    [gs[i - 1], gs[i + 1]].forEach(function (nb) {
                        if (!nb || nb.font !== g.font || Math.abs(nb.y - g.y) > LT || nb.space) return;
                        if (nb.unmapped) u.nearUn++; else if (/\p{Ll}/u.test(nb.ch)) u.nearLetter++; else if (/\p{Lu}/u.test(nb.ch)) u.nearUpper++;
                    });
                });
                // runs of unmapped glyphs (with the mapped capital before them), for the small-caps solver
                let run = null, last = null;
                gs.forEach(function (g, i) {
                    if (g.unmapped) {
                        if (!run) { run = { font: g.font, cids: [] }; byFont[g.font].runs.push(run); }
                        else if (last && (Math.abs(g.y - last.y) > LT || g.x - (last.x + last.w) > WG * g.size)) run.cids.push(-1);   // a word gap
                        run.cids.push(g.cid); last = g;
                    } else if (!(g.space && run && gs[i + 1] && gs[i + 1].unmapped && gs[i + 1].font === run.font)) run = null;
                    else if (run) run.cids.push(-1);                                // a space inside a small-caps phrase
                });
            });
            return byFont;
        },

        /** _repairUnmapped, step 2: per font, its unmapped codes read as ligatures or small capitals (font id → code → text) */
        _unmappedMaps(pages, byFont) {
            // the document's own letter pairs (its mapped text) tell which reading is plausible
            const bi = {}, uni = {}, self = this;
            const LW = this._t('extLigWidthErr'), LE = this._t('extLigWidthErrEst'), LG = this._t('extLigErrWeight'), LS = this._t('extLigScaleMinLetters'),
                  CG = this._t('extScClusterGap'), FM = this._t('extScFigureMax'), WM = this._t('extScWordMinLetters'), WB = this._t('extScWordBonus'),
                  MC = this._t('extScMinCount'), MH = this._t('extScMinHits'), MD = this._t('extScMinDistinct'), MG = this._t('extScMargin');
            pages.forEach(function (p) {
                let prev = '';
                p.glyphs.forEach(function (g) {
                    const c = !g.unmapped && !g.space && g.ch.length === 1 && /\p{L}/u.test(g.ch) ? g.ch.toLowerCase() : '';
                    if (c) { uni[c] = (uni[c] || 0) + 1; if (prev) bi[prev + c] = (bi[prev + c] || 0) + 1; }
                    prev = c;
                });
            });
            const lp = function (a, b) { return Math.log(((bi[a + b] || 0) + 0.5) / ((uni[a] || 0) + 13)); };
            // (Calibri, Cambria … also join t: tt, ti, tf; fj)
            const LIGS = ['ffi', 'ffl', 'fft', 'ff', 'fi', 'fl', 'ft', 'fj', 'tt', 'ti', 'tf', 'tti', 'Th', 'st', 'ct'];
            // English letter frequencies (%), a–z
            const FREQ = [8.2, 1.5, 2.8, 4.3, 12.7, 2.2, 2.0, 6.1, 7.0, 0.15, 0.77, 4.0, 2.4, 6.7, 7.5, 1.9, 0.095, 6.0, 6.3, 9.1, 2.8, 0.98, 2.4, 0.15, 2.0, 0.074];
            const WORDS = /^(the|and|of|to|in|a|is|that|for|it|as|was|with|be|by|on|not|he|she|his|her|chapter|part|book|contents|preface|introduction|com|or|from|at|an|are|this|which|you|all|one|had|but|they|have|we|i|my|me|so|no|said|mr|mrs|miss)$/;
            const maps = {};
            Object.keys(byFont).forEach(function (fid) {
                const F = byFont[fid], map = maps[fid] = {};
                const un = Object.keys(F.un).map(function (k) { return F.un[k]; });
                if (!un.length) return;
                // 1) ligatures: candidates whose letters' widths add up (ligatures are a little narrower),
                //    chosen by how well they fit the letters around them
                // a letter the font never shows on its own (the T of a Th ligature): its width estimated from
                // Times' proportions, scaled by the letters the font does show
                const TIMES = { a: 444, b: 500, c: 444, d: 500, e: 444, f: 333, g: 500, h: 500, i: 278, j: 278, k: 500, l: 278, m: 778, n: 500, o: 500, p: 500, q: 500, r: 333, s: 389, t: 278,
                    u: 500, v: 500, w: 722, x: 500, y: 500, z: 444, T: 611, C: 667 };
                const rs = Object.keys(TIMES).filter(function (c) { return F.widths[c]; }).map(function (c) { return F.widths[c] / TIMES[c]; }).sort(function (x, y) { return x - y; });
                const scale = rs.length >= LS ? rs[rs.length >> 1] : null;
                const width = function (c) { return F.widths[c] || (scale && TIMES[c] ? TIMES[c] * scale : 0); };
                un.forEach(function (u) {
                    if (u.nearLetter < u.nearUn || !u.gw) return;
                    let best = null, bestScore = -Infinity;
                    LIGS.forEach(function (lg) {
                        const cs = lg.toLowerCase().split('');
                        if (!lg.split('').every(function (c) { return width(c); })) return;
                        const est = !lg.split('').every(function (c) { return F.widths[c]; });
                        const sum = lg.split('').reduce(function (a, c) { return a + width(c); }, 0);
                        const err = Math.abs(sum - u.gw) / u.gw;
                        if (err > (est ? LE : LW)) return;
                        let score = -LG * err;
                        for (let k = 1; k < cs.length; k++) score += lp(cs[k - 1], cs[k]);
                        u.ctx.forEach(function (c) {
                            if (c[0]) score += lp(c[0], cs[0]) / Math.max(1, u.ctx.length / 10);
                            if (c[1]) score += lp(cs[cs.length - 1], c[1]) / Math.max(1, u.ctx.length / 10);
                        });
                        if (score > bestScore) { bestScore = score; best = lg; }
                    });
                    if (best) { map[u.cid] = best; self._fire('extract.ligatureRead'); }
                });
                // 2) small capitals: codes in clusters (a.sc … z.sc are consecutive); one offset per cluster
                // small capitals stand next to capitals or to each other, not inside lowercase words
                const rest = un.filter(function (u) { return !(u.cid in map) && u.nearUn + u.nearUpper >= u.nearLetter; }).sort(function (a, b) { return a.cid - b.cid; });
                const clusters = [];
                rest.forEach(function (u) {
                    const c = clusters[clusters.length - 1];
                    if (c && u.cid - c[c.length - 1].cid <= CG) c.push(u); else clusters.push([u]);
                });
                clusters.forEach(function (cl) {
                    const lo = cl[0].cid, hi = cl[cl.length - 1].cid;
                    if (hi - lo > 25) return;
                    // ten codes or fewer in a row: old-style / alternate figures, not letters (left out)
                    if (hi - lo <= FM - 1 && cl.length <= FM) return;
                    const inCl = {}; cl.forEach(function (u) { inCl[u.cid] = 1; });
                    let bestK = null, bestScore = -Infinity, second = -Infinity, bestHits = 0, bestDistinct = 0;
                    for (let k = hi - 25; k <= lo; k++) {
                        let score = 0, hits = 0; const distinct = {};
                        cl.forEach(function (u) { score += u.n * Math.log(FREQ[u.cid - k] / 100); });
                        F.runs.forEach(function (r) {
                            if (!r.cids.some(function (c) { return inCl[c]; })) return;
                            const word = r.cids.map(function (c) { return c < 0 ? ' ' : inCl[c] ? String.fromCharCode(97 + c - k) : (map[c] || '?'); }).join('');
                            word.split(/\s+/).forEach(function (w) {
                                // a word of two or more letters, most of them from this cluster
                                if (w.length < WM) return;
                                if (WORDS.test(w) || WORDS.test(w.slice(1))) { score += WB; hits++; distinct[w] = 1; }
                            });
                        });
                        if (score > bestScore) { second = bestScore; bestScore = score; bestK = k; bestHits = hits; bestDistinct = Object.keys(distinct).length; } else if (score > second) second = score;
                    }
                    const total = cl.reduce(function (a, u) { return a + u.n; }, 0);
                    if (bestK !== null && total >= MC && bestHits >= MH && bestDistinct >= MD && bestScore - second > MG) {
                        cl.forEach(function (u) { map[u.cid] = String.fromCharCode(97 + u.cid - bestK); });
                        self._fire('extract.smallCapsRead');
                    }
                });
            });
            return maps;
        },

        /** _repairUnmapped, step 3: list numbers and signs before numbers with no Unicode */
        _unmappedMarkers(pages, maps) {
            // a list number with no Unicode (Chrome draws ::marker text — tabular digits — without ToUnicode):
            // one to three unmapped glyphs at the start of a drawn line, the last one narrow (the period),
            // then a gap and mapped text on the same baseline. The digits are unknown: "1." keeps the
            // item ordered (Markdown numbers the items again)
            const self = this, ML = this._t('extMarkerLineEm'), MR = this._t('extMarkerMaxRun'), MB = this._t('extMarkerBaselineEm'), MP = this._t('extMarkerPeriodMaxEm'),
                  MDN = this._t('extMarkerDigitMinEm'), MDX = this._t('extMarkerDigitMaxEm'), MGN = this._t('extMarkerGapMinEm'), MGX = this._t('extMarkerGapMaxEm'),
                  SB = this._t('extSignBaselineEm'), STC = this._t('extSignTouchEm'), SN = this._t('extSignMinEm'), SX = this._t('extSignMaxEm'),
                  SL = this._t('extSignLineEm'), SG = this._t('extSignGlueEm'), SH = this._t('extSignHyphenMaxEm');
            pages.forEach(function (p) {
                const gs = p.glyphs;
                for (let i = 0; i < gs.length; i++) {
                    const g = gs[i];
                    if (!g.unmapped || (i && gs[i - 1].unmapped)) continue;
                    const prev = gs[i - 1];
                    if (prev && !prev.space && Math.abs(prev.y - g.y) < ML * g.size && prev.x < g.x) continue;   // not a line start
                    let j = i; while (j < gs.length && j - i < MR && gs[j].unmapped && Math.abs(gs[j].y - g.y) < MB * g.size) j++;
                    const run = gs.slice(i, j), last = run[run.length - 1];
                    if (run.length < 2 || run.length > MR || last.w > MP * last.size) continue;
                    if (run.slice(0, -1).some(function (x) { return x.w < MDN * x.size || x.w > MDX * x.size; })) continue;
                    let k = j; while (k < gs.length && gs[k].space) k++;
                    const nx = gs[k];
                    if (!nx || nx.unmapped || Math.abs(nx.y - g.y) > MB * g.size || nx.x - (last.x + last.w) < MGN * g.size || nx.x - (last.x + last.w) > MGX * g.size) continue;
                    self._fire('extract.listMarkerUnmapped', p);
                    run.forEach(function (x, n) { x.ch = n === run.length - 1 ? '.' : n === run.length - 2 ? '1' : '0'; x.unmapped = false; x.marker = true; });
                    if (k === j) gs.splice(j, 0, Object.assign({}, last, { ch: ' ', space: true, x: last.x + last.w, w: nx.x - last.x - last.w, marker: false }));
                }
                // a sign before a number with no Unicode (a contextual alternate: Inter's hyphen before digits):
                // dash-wide, after a space or a line start, touching the first digit
                for (let i = 0; i < gs.length; i++) {
                    const g = gs[i], nx = gs[i + 1], pv = gs[i - 1];
                    if (!g.unmapped || (maps[g.font] && maps[g.font][g.cid]) || !nx || nx.unmapped || !/^[0-9]$/.test(nx.ch)) continue;
                    if (Math.abs(nx.y - g.y) > SB * g.size || nx.x - (g.x + g.w) > STC * g.size || g.w < SN * g.size || g.w > SX * g.size) continue;
                    const glued = pv && !pv.space && Math.abs(pv.y - g.y) < SL * g.size && pv.x < g.x && g.x - (pv.x + pv.w) < SG * g.size;
                    // glued between a capital / digit and a digit: a hyphen of a code ("P-101", "ISO-9001"; Inter's
                    // case-sensitive hyphen, often given a private-use code)
                    if (glued && !/^[(\[=<>~]$/.test(pv.ch) && !(/^[\p{Lu}0-9]$/u.test(pv.ch) && g.w < SH * g.size)) continue;
                    g.ch = '-'; g.unmapped = false; self._fire('extract.signBeforeNumber', p);
                }
            });
        },

        // ── 2. fonts ───────────────────────────────────────────────────
        _classifyFonts(pages) {
            const info = {}, self = this;
            const KC = { ms: this._t('extMonoMinSamples'), sp: this._t('extMonoSpread'), dg: this._t('extMonoDocMinGlyphs'), ds: this._t('extMonoDocShare'),
                         bw: this._t('extCodeBoxMinWPt'), bh: this._t('extCodeBoxMinHPt'), mid: this._t('extGlyphMidEm'), jw: this._t('extJspdfMinWidths'),
                         jn: this._t('extJspdfNarrowRatio'), jb: this._t('extJspdfBoldRatio'), ji: this._t('extJspdfItalicShift'), tc: this._t('extT3BoldMinChars'), tb: this._t('extT3BoldRatio') };
            pages.forEach(function (p) {
                p.glyphs.forEach(function (g) {
                    const f = p.fonts[g.font];
                    const r = info[g.font] || (info[g.font] = { id: g.font, font: f, chars: 0, name: (f && f.name) || '', ws: [], chw: {} });
                    r.chars++;
                    if (!g.space && g.gw > 0 && typeof g.ch === 'string' && g.ch.length === 1 && /\p{L}/u.test(g.ch)) r.chw[g.ch] = g.gw;
                    if (!g.space && /^[A-Za-z]$/.test(g.ch || '') && g.size > 0 && r.ws.length < 400) r.ws.push(g.w / g.size);
                });
            });
            const byName = {};
            Object.keys(info).forEach(function (id) {
                const r = info[id], n = r.name;
                // TeX's Computer Modern / EC (cm-super) names: CMBX12 bold, CMTI10 italic, CMSL slanted, CMTT typewriter
                const tex = n.replace(/^[A-Z]{6}\+/, '').match(/^(?:CM|SF|EC|TC)([A-Z]+)\d*$/);
                const t = tex ? tex[1] : '';
                r.mono = !!(r.font && r.font.isMonospace) || /mono|code|courier|consol|hack|menlo|fixed|typewriter/i.test(n) || /^(TT|SLTT|ITT|TCTT|VTT)$/.test(t);
                r.bold = /bold|black|heavy|semibold|demi|\bmedium\b/i.test(n) || /^(BX|B|SSBX|BXTI|BXSL|BI|SXBX)/.test(t) || (!!tex && /^EC/.test(n.replace(/^[A-Z]{6}\+/, '')) && /^BX/.test(t));
                r.italic = /italic|oblique|slant/i.test(n) || /^(TI|SL|BXTI|BXSL|SSI|ITT|SLTT|BI|U)$/.test(t);
                // a font named without its style (Microsoft Print to PDF: "CIDFont+F1", "F2" …): the font
                // program's own name and OS/2 table, else the descriptor's flags
                if (r.font && /^([A-Z]{6}\+)?(CIDFont\+)?(F|T1_|TT|C\d_|R)\d+$/i.test(n)) {
                    const face = fontFace(r.font);
                    if (face) {
                        r.realName = face.full || '';
                        r.bold = (face.weight || 400) >= 600 || !!(face.fs & 0x20) || /bold|black|heavy|semibold/i.test(r.realName);
                        r.italic = !!(face.fs & 0x01) || /italic|oblique/i.test(r.realName);
                        r.mono = face.panose === 9 || !!face.fixed || /mono|code|courier|consol|menlo|fixed/i.test(r.realName);
                        r.named = true;
                        self._fire('extract.fontStyleFromProgram');
                    } else {
                        if (r.font.bold || r.font.black) r.bold = true;
                        if (r.font.italic) r.italic = true;
                    }
                }
                r.emoji = /emoji/i.test(n + ' ' + (r.realName || ''));
                // no code font: an emoji or symbol font (its glyphs are all one width), or a font flagged fixed-pitch whose
                // letters are not (LibreOffice marks Inter so) — unless its name says monospace
                const named = /mono|code|courier|consol|hack|menlo|fixed|typewriter/i.test(n + ' ' + (r.realName || ''));
                if (r.mono && !named && !t) {
                    const ws = r.ws.slice().sort(function (a, b) { return a - b; });
                    const varied = ws.length >= KC.ms && (ws[ws.length - 1] - ws[0]) > KC.sp * ws[ws.length >> 1];
                    if (r.emoji || /symbol|dingbat|wingding|webding|zapf/i.test(n) || varied) { r.mono = false; self._fire('extract.fontMonoNotCode'); }
                }
                // a style in the name, "Regular" too (Chrome splits one face into several Type3 subsets
                // that share a name: they must not be told apart by their glyph boxes)
                r.named = r.bold || r.italic || /regular|roman|\bbook\b|normal|plain|light|thin|condensed/i.test(n) || !!(r.font && r.font.isType3Font);
                const fam = n.replace(/^[A-Z]{6}\+/, '').replace(/[-,]?(bold|italic|oblique|regular|black|heavy|semibold|medium|light|demi)/ig, '').trim().toLowerCase();
                (byName[fam] = byName[fam] || []).push(r);
            });
            // a document set in a monospace font (a text file printed, a typewriter style): monospace is its body
            // text, not code — code is told apart only where it differs from the body
            // (text outside boxes only: code blocks sit in boxes — a document of mostly code is no monospace document)
            let total = 0, monoChars = 0;
            pages.forEach(function (p) {
                const boxes = p.rects.filter(function (r) { return r.x1 - r.x0 > KC.bw && r.y1 - r.y0 > KC.bh; });
                p.glyphs.forEach(function (g) {
                    if (g.space || boxes.some(function (r) { return inside(r, g.x + g.w / 2, g.y + KC.mid * g.size); })) return;
                    total++; if (info[g.font] && info[g.font].mono) monoChars++;
                });
            });
            if (total > KC.dg && monoChars > KC.ds * total) {
                Object.keys(info).forEach(function (k) { info[k].mono = false; });
                this._fire('extract.fontMonoBody');
                this._note('monoBody', 'The text is set in a monospace font: read as plain text, not as code.');
            }
            // one family name with several fonts and no style in the names (jsPDF):
            // the most used is regular; wider glyphs = bold; bbox xMin = slant
            Object.keys(byName).forEach(function (fam) {
                const list = byName[fam];
                if (list.length < 2 || list.some(function (r) { return r.named; })) return;
                // jsPDF: four styles under one name. Reference: the most used font, unless another
                // is clearly narrower (then that one: the reference must be the regular). Wider than it
                // = bold; outlines starting further right (bbox xMin) = slanted = italic.
                const ratio = function (r, ref) {
                    const w = r.font && r.font.widths, rw = ref.font && ref.font.widths, q = [];
                    if (w && rw) Object.keys(w).forEach(function (k) { if (rw[k] > 0 && w[k] > 0) q.push(w[k] / rw[k]); });
                    return q.length >= KC.jw ? median(q) : null;
                };
                list.sort(function (a, b) { return b.chars - a.chars; });
                let ref = list[0];
                list.slice(1).forEach(function (r) { const q = ratio(r, ref); if (q !== null && q < KC.jn) ref = r; });
                const xMin = function (r) { return r.font && r.font.bbox ? r.font.bbox[0] : 0; };
                list.forEach(function (r) {
                    if (r === ref) return;
                    const q = ratio(r, ref);
                    r.widthRatio = q;
                    if (q !== null && q > KC.jb) { r.bold = true; self._fire('extract.fontWiderBold'); }
                    r.xMinShift = xMin(r) - xMin(ref);
                    if (r.xMinShift > KC.ji) { r.italic = true; self._fire('extract.fontShiftedItalic'); }
                });
            });
            // a variable font printed by Chromium (Skia): each instance it uses a Type 3 font of drawn glyphs, and every one
            // named «…-Regular» — Vazirmatn[wght] at 400, 700 and 800 in one page, the bold read as regular. The instances
            // have subset tags of their own (AAAAAA+, BAAAAA+ …; one instance may span several fonts under one tag, which
            // stay alike) and a heavier weight is a wider one: per family, the tag with the most text is the reference, and a
            // tag whose letters are wider than the reference's, character by character (the median of four or more), by 2 %
            // or more is bold. (Widths that a width or optical-size axis changes go the other way at display sizes: narrower)
            const t3 = {};
            Object.keys(info).forEach(function (id) {
                const r = info[id], m = /^([A-Z]{6})\+(.+)$/.exec(r.name);
                if (!m || !(r.font && r.font.isType3Font) || r.bold) return;
                const fam = m[2].replace(/[-,]?(bold|italic|oblique|regular|black|heavy|semibold|medium|light|demi)/ig, '').trim().toLowerCase();
                const T = (t3[fam] = t3[fam] || {}), tag = T[m[1]] || (T[m[1]] = { chars: 0, w: {}, list: [] });
                tag.chars += r.chars; tag.list.push(r);
                Object.keys(r.chw).forEach(function (c) { tag.w[c] = r.chw[c]; });
            });
            Object.keys(t3).forEach(function (fam) {
                const tags = Object.keys(t3[fam]).map(function (k) { return t3[fam][k]; });
                if (tags.length < 2) return;
                tags.sort(function (a, b) { return b.chars - a.chars; });
                const ref = tags[0];
                tags.slice(1).forEach(function (T) {
                    const q = Object.keys(T.w).filter(function (c) { return ref.w[c] > 0; }).map(function (c) { return T.w[c] / ref.w[c]; });
                    if (q.length >= KC.tc && median(q) >= KC.tb) { T.list.forEach(function (r) { r.bold = true; r.widthRatio = median(q); }); self._fire('extract.fontType3InstanceBold'); }
                });
            });
            return info;
        }
    });
})(typeof window !== 'undefined' ? window : globalThis);
