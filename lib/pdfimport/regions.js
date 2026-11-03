/**
 * PdfImporter — 4. regions (lib/pdfimport/regions.js)
 * ============================================================================
 * The page driver (_layout) and what is drawn around the text: ruled tables, code boxes, figures and
 * their crops, drawn list marks. PDFIMPORT.md §7.
 *
 * Part of PdfImporter: load after lib/PdfImporter.js (see its header for the order). The methods
 * are those of the class, added to its prototype; the helpers come from the core.
 */
(function (global) {
    'use strict';
    const PdfImporter = global.PdfImporter || (typeof require === 'function' ? require('../PdfImporter.js') : null);
    const { R_CH, AN_CH, median, mode, inside, nfkcArabic, columnAlign, finishLine, PF, DUAL } = PdfImporter._internal;

    // the layout literals of this file (thresholds.js); seeds of thresholds.js used here: bodySizePt, bodyLongLineGlyphs,
    // bodyLongSamples (_bodyMetrics), spacedDocMinGaps, spacedDocShare, boldFaceMin, boldFaceShare (_docSignals)
    const U = function (m) { return ['regions.js ' + m]; };
    PdfImporter._defineThresholds({
        // _docSignals: drawn word spaces
        regSpacedBaselineEm: { def: 0.2, unit: 'em', used: U('_docSignals (same baseline)') },
        regSpacedBareGapEm: { def: 0.2, unit: 'em', used: U('_docSignals (a word gap with no space glyph)') },
        // _lyingShapes
        regLieBaselineEm: { def: 0.2, unit: 'em', used: U('_lyingShapes (same baseline)') },
        regLieTouchEm: { def: 0.08, unit: 'em', used: U('_lyingShapes (touching letters)') },
        regLieMinPairs: { def: 3, unit: 'count', used: U('_lyingShapes') },
        regLieShare: { def: 0.05, unit: 'share', used: U('_lyingShapes') },
        // _docLexicon: where long lines start
        regFlushLongGlyphs: { def: 30, unit: 'glyphs', used: U('_docLexicon') },
        regFlushEdgeEm: { def: 2, unit: 'em', used: U('_docLexicon') },
        regFlushMinLines: { def: 4, unit: 'count', used: U('_docLexicon') },
        // _bodyMetrics, _bodyFamilies, _bodyPitches
        regBodySizeRes: { def: 2, unit: 'bins/pt', used: U('_bodyMetrics (mode of sizes)') },
        regBodySizeTolPt: { def: 0.6, unit: 'pt', used: U('_bodyMetrics').concat(U('_bodyFamilies'), U('_bodyPitches')) },
        regColLeftQuantile: { def: 0.03, unit: 'share', used: U('_bodyMetrics') },
        regColRightQuantile: { def: 0.97, unit: 'share', used: U('_bodyMetrics') },
        regColEdgeTolPt: { def: 1.5, unit: 'pt', used: U('_bodyMetrics') },
        regColEdgeMinLines: { def: 8, unit: 'count', used: U('_bodyMetrics') },
        regColMirrorSrcLines: { def: 2, unit: 'count', used: U('_bodyMetrics (a margin mirrored from a side lines show)') },
        regFamBoldShare: { def: 0.85, unit: 'share', used: U('_bodyFamilies') },
        regFamLongGlyphs: { def: 30, unit: 'glyphs', used: U('_bodyFamilies') },
        regFamHeadStepPt: { def: 1, unit: 'pt', used: U('_bodyFamilies') },
        regFamHeadMaxGlyphs: { def: 80, unit: 'glyphs', used: U('_bodyFamilies') },
        regFamHeadMinLines: { def: 2, unit: 'count', used: U('_bodyFamilies') },
        regFamBodyMaxLines: { def: 3, unit: 'count', used: U('_bodyFamilies') },
        regFamBodyShare: { def: 0.05, unit: 'share', used: U('_bodyFamilies') },
        regLeadWrapEndEm: { def: 3, unit: 'em', used: U('_bodyPitches') },
        regLeadWrapWidthShare: { def: 0.75, unit: 'share', used: U('_bodyPitches') },
        regLeadMinEm: { def: 0.8, unit: 'em', used: U('_bodyPitches') },
        regLeadMaxEm: { def: 3, unit: 'em', used: U('_bodyPitches') },
        regLeadOverlapShare: { def: 0.5, unit: 'share', used: U('_bodyPitches') },
        regLeadMinSamples: { def: 4, unit: 'count', used: U('_bodyPitches') },
        regLeadModeRes: { def: 20, unit: 'bins/em', used: U('_bodyPitches') },
        regCodeEdgeTolPt: { def: 1, unit: 'pt', used: U('_bodyPitches') },
        regCodeStepMinEm: { def: 0.6, unit: 'em', used: U('_bodyPitches') },
        regCodeStepMaxEm: { def: 3.5, unit: 'em', used: U('_bodyPitches') },
        regCodeMonoShare: { def: 0.9, unit: 'share', used: U('_bodyPitches') },
        regCodeMinSteps: { def: 6, unit: 'count', used: U('_bodyPitches') },
        regCodeStepQuantile: { def: 0.1, unit: 'share', used: U('_bodyPitches') },
        // _hiddenPictures (a 16 × 16 render)
        regPicTinyPx: { def: 4, unit: 'px', fixed: true, used: U('_hiddenPictures') },
        regPicAlphaMax: { def: 8, unit: 'alpha (0-255)', fixed: true, used: U('_hiddenPictures') },
        // _pageBorders
        regBorderGapPt: { def: 2, unit: 'pt', used: U('_pageBorders') },
        regBorderEdgeShare: { def: 0.1, unit: 'share', used: U('_pageBorders (of the page)') },
        regBorderSpanShare: { def: 0.7, unit: 'share', used: U('_pageBorders (of the page)') },
        regBorderThinPt: { def: 2.5, unit: 'pt', used: U('_pageBorders') },
        regBorderAlongTolPt: { def: 1, unit: 'pt', used: U('_pageBorders') },
        regBorderEndTolPt: { def: 1.5, unit: 'pt', used: U('_pageBorders') },
        regBorderMinMeets: { def: 2, unit: 'count', used: U('_pageBorders') },
        // _tableNotes
        regNoteMinRows: { def: 3, unit: 'count', used: U('_tableNotes') },
        regNoteMinCols: { def: 3, unit: 'count', used: U('_tableNotes') },
        regNoteKeepRows: { def: 2, unit: 'count', used: U('_tableNotes') },
        regNoteMinChars: { def: 60, unit: 'chars', used: U('_tableNotes') },
        regNoteLabelMinCols: { def: 4, unit: 'count', used: U('_tableNotes') },
        regNoteLabelMaxChars: { def: 40, unit: 'chars', used: U('_tableNotes') },
        // _dotMarker
        regDotMaxGapEm: { def: 3, unit: 'em', used: U('_dotMarker') },
        regDotSideTolPt: { def: 1, unit: 'pt', used: U('_dotMarker') },
        // _clusterFigures, _cluster, _crop
        regFigHGapEm: { def: 0.55, unit: 'em', used: U('_clusterFigures') },
        regFigVGapEm: { def: 0.25, unit: 'em', used: U('_clusterFigures') },
        regFigSameLineShare: { def: 0.3, unit: 'share', used: U('_clusterFigures') },
        regFigStackTolPt: { def: 1, unit: 'pt', used: U('_clusterFigures') },
        regFigMinPt: { def: 3, unit: 'pt', used: U('_clusterFigures') },
        regClusterMinPt: { def: 3, unit: 'pt', used: U('_cluster').concat(U('_tables')) },
        regCropPadPt: { def: 1.5, unit: 'pt', used: U('_crop') },
        // _tables
        regTabFrameTolPt: { def: 1.5, unit: 'pt', used: U('_tables (frame sides)') },
        regTabFrameMinWPt: { def: 20, unit: 'pt', used: U('_tables') },
        regTabFrameMinHPt: { def: 10, unit: 'pt', used: U('_tables') },
        regTabUnionMaxSegs: { def: 3000, unit: 'count', used: U('_tables (union-find, else _cluster)') },
        regTabTouchPt: { def: 1.5, unit: 'pt', used: U('_tables (segments that touch)') },
        regTabInsideTolPt: { def: 1, unit: 'pt', used: U('_tables') },
        regTabOwnTolPt: { def: 1.5, unit: 'pt', used: U('_tables (a table\'s H, V)') },
        regTabDedupPt: { def: 2, unit: 'pt', used: U('_tables') },
        regTabMonoMax: { def: 0.7, unit: 'share', used: U('_tables') },
        regTabInnerPt: { def: 2, unit: 'pt', used: U('_tables (frames inside a frame)') },
        regTabShareEdgePt: { def: 1.2, unit: 'pt', used: U('_tables (frames inside a frame)') },
        regTabMinRules: { def: 3, unit: 'count', used: U('_tables') },
        regTabOneRowMinRules: { def: 4, unit: 'count', used: U('_tables') },
        regTabOneRowHShare: { def: 0.25, unit: 'ratio', used: U('_tables (height / width)') },
        regLineMidEm: { def: 0.3, unit: 'em', used: U('_tables').concat(U('_tableDir'), U('_tableSpans'), U('_cellLinesIn')) },
        // _tableDir, _tableSpans, _cellLinesIn, _tableRowSplit, _tableTitle, _tablePreamble, _cellItems
        regTabSideTolPt: { def: 4, unit: 'pt', used: U('_tableDir') },
        regTabDirRatio: { def: 3, unit: 'ratio', used: U('_tableDir') },
        regTabDirMargin: { def: 5, unit: 'count', used: U('_tableDir') },
        regTabRuleTolPt: { def: 1.6, unit: 'pt', used: U('_tableSpans') },
        regTabCoveredShare: { def: 0.6, unit: 'share', used: U('_tableSpans') },
        regTabCrossPt: { def: 2, unit: 'pt', used: U('_tableSpans') },
        regTabCrossGapEm: { def: 0.8, unit: 'em', used: U('_tableSpans') },
        regCellSameLineEm: { def: 0.3, unit: 'em', used: U('_cellLinesIn') },
        regSplitMinLines: { def: 3, unit: 'count', used: U('_tableRowSplit') },
        regSplitMinCells: { def: 2, unit: 'count', used: U('_tableRowSplit') },
        regSplitBaseEm: { def: 0.5, unit: 'em', used: U('_tableRowSplit') },
        regSplitMatchShare: { def: 0.6, unit: 'share', used: U('_tableRowSplit') },
        regSplitMinBases: { def: 3, unit: 'count', used: U('_tableRowSplit') },
        regSplitWordShare: { def: 0.5, unit: 'share', used: U('_tableRowSplit') },
        regSplitFullShare: { def: 0.85, unit: 'share', used: U('_tableRowSplit') },
        regSplitWrapShare: { def: 0.6, unit: 'share', used: U('_tableRowSplit') },
        regSplitBalanceShare: { def: 0.8, unit: 'share', used: U('_tableRowSplit') },
        regTitleMinRows: { def: 3, unit: 'count', used: U('_tableTitle') },
        regTitleMinCols: { def: 2, unit: 'count', used: U('_tableTitle') },
        regTitleMinCelled: { def: 2, unit: 'count', used: U('_tableTitle') },
        regTitleSizeTolPt: { def: 0.6, unit: 'pt', used: U('_tableTitle') },
        regPreMinRows: { def: 2, unit: 'count', used: U('_tablePreamble') },
        regPreSameLineEm: { def: 0.3, unit: 'em', used: U('_tablePreamble') },
        regPreGapEm: { def: 1.2, unit: 'em', used: U('_tablePreamble') },
        regPreOverlapPt: { def: 1, unit: 'pt', used: U('_tablePreamble') },
        regPreColTolPt: { def: 4, unit: 'pt', used: U('_tablePreamble') },
        regItemMinGlyphs: { def: 3, unit: 'glyphs', used: U('_cellItems') },
        regItemGapEm: { def: 0.3, unit: 'em', used: U('_cellItems') },
        regItemMinMarks: { def: 2, unit: 'count', used: U('_cellItems') },
        // _codeBlock
        regCodeSameLineEm: { def: 0.3, unit: 'em', used: U('_codeBlock') },
        regCodeLabelStepPt: { def: 0.5, unit: 'pt', used: U('_codeBlock') },
        regCodeCharWPt: { def: 5, unit: 'pt', used: U('_codeBlock (fallback)') },
        regCodeSizePt: { def: 10, unit: 'pt', used: U('_codeBlock (fallback)') },
        regCodePitchMinEm: { def: 0.6, unit: 'em', used: U('_codeBlock') },
        regCodeDoubleRatio: { def: 1.7, unit: 'ratio', used: U('_codeBlock') },
        regCodeWrapPitch: { def: 1.3, unit: 'ratio', used: U('_codeBlock (of the pitch)') },
        regCodeWrapIndentCells: { def: 0.5, unit: 'cells', used: U('_codeBlock') },
        regCodeMaxBlank: { def: 3, unit: 'count', used: U('_codeBlock') }
    });

    Object.assign(PdfImporter.prototype, {
        // ── 4/5. regions and blocks ────────────────────────────────────
        async _layout(pages, fonts) {
            const emojiMap = await this._docSignals(pages, fonts);
            const all = await this._pageLines(pages, fonts, emojiMap);
            this._lyingShapes(all);
            // page furniture before anything measures the page (PDFIMPORT.md §6a): running heads and feet, side panels,
            // page numbers, letterheads, repeated logos — a sidebar's lines counted in the text column's edges
            await this._hiddenPictures(all);
            if (this.options.dropHeaderFooter) this._furniture(all, pages);
            this._pageBorders(all);
            this._docLexicon(all);

            const body = this._bodyMetrics(all, pages);
            this._bodyFamilies(all, body);
            this._bodyPitches(all, this._metrics);

            const blocks = [];
            this._ladPls = all;                 // (the ladder's textContent rung reads the pages around one: ladder.js _ladTcNeighbours)
            for (const pl of all) {
                const pageBlocks = await this._layoutPage(pl, body);
                pageBlocks.forEach(function (b) { blocks.push(b); });
            }
            return this._calliGaps(this._treeParagraphs(this._tableNotes(this._treeTables(this._joinAcrossPages(blocks)))));
        },

        // _layout, step 1: the document's signals read off its glyphs before any line is made — links, emoji, drawn
        // word spaces, ZWNJ, bold face, OCR; returns the emoji map
        async _docSignals(pages, fonts) {
            this._allLinks = pages.reduce(function (a, p) { return a.concat(p.links.map(function (l) { return Object.assign({ page: p.num }, l); })); }, []);   // links are needed per glyph during layout
            // emoji drawn through Private Use Area code points (jsPDF + a remapped emoji font)
            const fontsAll = this._fonts || {};
            const needEmoji = pages.some(function (p) { return p.glyphs.some(function (g) { const f = fontsAll[g.font]; return f && f.emoji && /[\uE000-\uF8FF]/.test(g.ch); }); });
            if (needEmoji && !this.options.emojiSeq && this.options.loadEmojiMap && !this._emojiSource()) {
                try { const m = await this.options.loadEmojiMap(); if (m && m.seq) { this.options.emojiSeq = m.seq; this.options.emojiPua = m.pua || 0xE000; } } catch (e) { /* emoji stay as PUA */ }
            }
            const emojiMap = this._emojiMap();
            // does the producer draw its word spaces? Of the word-wide gaps between glyphs drawn one after the
            // other on a baseline, the share that holds a space glyph
            let spacedGaps = 0, bareGaps = 0;
            const kBase = this._t('regSpacedBaselineEm'), kBare = this._t('regSpacedBareGapEm');
            pages.forEach(function (p) {
                const gs = p.glyphs;
                for (let i = 1; i < gs.length; i++) {
                    const a = gs[i - 1], b = gs[i];
                    if (Math.abs(a.y - b.y) > kBase * a.size || b.x < a.x) continue;
                    // gaps in running prose only (a letter, then a lowercase letter): table cells would blur the count
                    if (!/^\p{Ll}/u.test(b.ch)) continue;
                    const z = gs[i - 2];
                    if (a.space && z && /\p{L}$/u.test(z.ch) && Math.abs(z.y - a.y) < kBase * a.size) spacedGaps++;
                    else if (!a.space && /\p{L}$/u.test(a.ch) && b.x - (a.x + a.w) > kBare * a.size) bareGaps++;
                }
            });
            this._spacedDoc = spacedGaps + bareGaps >= this._t('spacedDocMinGaps') ? spacedGaps / (spacedGaps + bareGaps) > this._t('spacedDocShare') : undefined;
            if (this._spacedDoc === true) this._fire('regions.spacedDoc');
            else if (this._spacedDoc === false) this._fire('regions.unspacedDoc');
            this._hasZwnj = pages.some(function (p) { return p.glyphs.some(function (g) { return g.ch.indexOf('\u200C') >= 0; }); });
            // any right-to-left letter or Arabic-Indic digit at all? Without one, every block is left to right (_blockDir)
            // producers that set every number as a European one (bidiLevels' joinSigns): a hint from the provenance
            const eng = (this._profile && this._profile.engine) || '';
            this._joinSigns = eng === 'indesign' || eng === 'jspdf';
            // an OCR layer (invisible text over a scan): one font, no bold, sizes from letter heights, bullets misread
            // a document set in bold throughout (an invoice whose every word is bold): bold is its face, not markup —
            // every line came out between ** **. Three glyphs in five or more (the invoice: 69 %; a document with bold
            // for emphasis and headings has a tenth), of forty or more
            (function (self) {
                let n = 0, b = 0;
                pages.forEach(function (p) { p.glyphs.forEach(function (g) { if (g.space || !g.ch || !g.ch.trim()) return; n++; const f = fonts[g.font]; if (f && f.bold) b++; }); });
                self._boldFace = n >= self._t('boldFaceMin') && b >= self._t('boldFaceShare') * n;
                if (self._boldFace) self._fire('regions.boldFace');
            })(this);
            this._ocr = !!(this._profile && this._profile.path === 'ocr');
            if (this._ocr) { try { await this._ocrInk(pages); } catch (e) { /* no canvas, a page that will not render: the text as it is */ } }
            this._anyRtl = pages.some(function (p) { return p.glyphs.some(function (g) { return R_CH.test(g.ch) || AN_CH.test(g.ch); }); });
            return emojiMap;
        },

        // _layout, step 2: each page's lines (a page whose lines fail is an empty page) — the per-page object `pl`
        // the later steps work on: { p, lines, cutTop, cutBottom }
        async _pageLines(pages, fonts, emojiMap) {
            const self = this;
            const all = [];
            for (const p of pages) {
                let ls = [];
                let err = null, noted = false;
                // (in 'full' mode noted at once, as before the ladder; else the ladder tries pdf.js's text first: ladder.js)
                try { ls = self._lines(p, fonts, emojiMap); } catch (e) { if (e && e.code === 'aborted') throw e; if (self._ladMode() === 'full') { self._emptyPage(p.num, e); noted = true; } else err = e; }
                all.push({ p: p, lines: ls, cutTop: Infinity, cutBottom: -Infinity, cal: self._cal, linesError: err, linesNoted: noted });
                await self._yield();
            }
            return all;
        },

        // _layout, step 3: fonts whose joining forms lie (_lyingForms, _lyingBack, _fwdLies)
        _lyingShapes(all) {
            const self = this;
            // fonts whose shapes cannot be trusted to show where a ZWNJ was (PDFIMPORT.md §4, "Shapes that lie"): of two
            // touching letters, one drawn joining toward the other, which is drawn not joining back — in text set by a
            // shaping engine that never happens. A PowerPoint export named its glyphs so (ﺷ ﻣ ﻧ: three initial forms in
            // a row, waw isolated after heh): the ZWNJ rule read breaks into every word («ه‌وشمند», «داوط‌لبان»).
            const pairs = {}, wrong = {}, wrongF = {}, fwdLies = {};
            const kBase = this._t('regLieBaselineEm'), kTouch = this._t('regLieTouchEm'), kMin = this._t('regLieMinPairs'), kShare = this._t('regLieShare');
            all.forEach(function (pl) { pl.lines.forEach(function (L) {
                const gs = L.glyphs;
                for (let i = 1; i < gs.length; i++) {
                    const left = gs[i - 1], right = gs[i];             // visual order: the right one comes first in the text
                    const a = PF[right.ch], b = PF[left.ch];
                    if (!a || !b || right.font !== left.font || Math.abs(right.y - left.y) > kBase * right.size || right.formGuess || left.formGuess) continue;
                    if (Math.abs(right.x - (left.x + left.w)) > kTouch * right.size) continue;
                    pairs[right.font] = (pairs[right.font] || 0) + 1;
                    const aFwd = a[1] === 2 || a[1] === 3, bBack = b[1] === 1 || b[1] === 3;
                    if (aFwd && !bBack) wrong[right.font] = (wrong[right.font] || 0) + 1;
                    else if (!aFwd && bBack && DUAL.test(a[0])) { wrongF[right.font] = (wrongF[right.font] || 0) + 1; fwdLies[right.font + '|' + a[0]] = 1; }
                }
            }); });
            // (by side: a font drawn joining forward toward a letter whose glyph does not join back lies about the back
            // join only — its forward join still shows a ZWNJ, §4; one that lies the other way too is no witness at all)
            const liar = function (w) { return Object.keys(w).filter(function (f) { return w[f] >= kMin && w[f] > kShare * pairs[f]; }); };
            this._lyingForms = liar(wrongF);
            this._lyingBack = liar(wrong);
            if (this._lyingForms.length) this._fire('regions.lyingForms');
            if (this._lyingBack.length) this._fire('regions.lyingBack');
            // (and a letter of such a font seen once drawn not joining forward toward a letter that joins back to it: Arial's
            // tah, one glyph for all its forms — «ط‌ریق», «منظ‌ور» — its forward join says nothing either)
            this._fwdLies = Object.keys(fwdLies).filter(function (k) { return self._lyingBack.indexOf(k.split('|')[0]) >= 0; });
            if (this._fwdLies.length) this._fire('regions.fwdLies');
        },

        // _layout, step 4: the document's own words (_lex) and where its long lines start (_startFlush)
        _docLexicon(all) {
            // the document's own words, whole and hyphenated, to tell a line-end hyphen apart
            const lex = { words: new Set(), hyph: new Set() };
            all.forEach(function (pl) { pl.lines.forEach(function (L) {
                const t = L.glyphs.map(function (g) { return g.atom ? ' ' : g.ch; }).join('').toLowerCase();
                const re = /[\p{L}]+(?:-[\p{L}]+)*/gu; let m;
                while ((m = re.exec(t))) {
                    if (m.index + m[0].length >= t.length && /-$/.test(t)) continue;   // the fragment at the line end
                    if (m[0].indexOf('-') >= 0) { lex.hyph.add(m[0]); } else lex.words.add(m[0]);
                }
            }); });
            this._lex = lex;
            // where the document's long lines start (for headings, blocks.js): right-to-left lines at the right edge of
            // their page's text, left-to-right ones at the left — as writing sets them; LibreOffice's HTML export sets a
            // Persian page's lines all at the left, and there a line at the far side is no signature
            (function (self) {
                let n = 0, at = 0;
                const kLong = self._t('regFlushLongGlyphs'), kEdge = self._t('regFlushEdgeEm');
                all.forEach(function (pl) {
                    const long = pl.lines.filter(function (L) { return L.glyphs.filter(function (g) { return !g.space; }).length >= kLong; });
                    if (!long.length) return;
                    const R = Math.max.apply(null, long.map(function (L) { return L.x1; })), Lf = Math.min.apply(null, long.map(function (L) { return L.x0; }));
                    long.forEach(function (L) {
                        const rtl = L.strong && L.strong.R > L.strong.L;
                        n++; if (rtl ? R - L.x1 < kEdge * L.size : L.x0 - Lf < kEdge * L.size) at++;
                    });
                });
                self._startFlush = n >= self._t('regFlushMinLines') ? at / n : 1;
                if (self._startFlush < 1) self._fire('regions.startFlushPartial');
            })(this);
        },

        // _layout, step 5: the body size and the text column's edges (_metrics); returns the body size
        _bodyMetrics(all, pages) {
            // body metrics
            // the body size: what running text is set in — the size of the long lines (segments are cut at cells' gaps,
            // so a table's cells are short lines), when there are enough of them; a report whose tables, set smaller,
            // outnumber its prose took the tables' size for the body, and its prose for headings — its list numbers
            // were dropped as heading numbers (two-column fuzz files)
            const sizes = [], longSizes = [];
            const kLong = this._t('bodyLongLineGlyphs'), kTol = this._t('regBodySizeTolPt'), kRes = this._t('regBodySizeRes');
            all.forEach(function (pl) { pl.lines.forEach(function (L) {
                const ink = L.glyphs.filter(function (g) { return !g.space && !g.mono; });
                ink.forEach(function (g) { sizes.push(g.size); });
                if (ink.length >= kLong) ink.forEach(function (g) { longSizes.push(g.size); });
            }); });
            const fromLong = longSizes.length >= this._t('bodyLongSamples');
            this._fire(fromLong ? 'regions.bodyFromLongLines' : 'regions.bodyFromAllLines');
            const body = (fromLong ? mode(longSizes, kRes) : mode(sizes, kRes)) || this._t('bodySizePt');
            if (this._ocr) this._ocrRepair(all, body);
            const xs0 = [], xs1 = [], rtlStarts = [];
            all.forEach(function (pl) { pl.lines.forEach(function (L) { if (Math.abs(L.size - body) < kTol) { xs0.push(Math.round(L.x0)); xs1.push(Math.round(L.x1)); if (L.strong.R > L.strong.L) rtlStarts.push(Math.round(L.x1)); } }); });
            // the text column: the usual line edges; with few lines, mirrored margins of the page
            // (a short left-aligned line must not be taken for the whole column)
            const sorted0 = xs0.slice().sort(function (a, b) { return a - b; }), sorted1 = xs1.slice().sort(function (a, b) { return a - b; });
            let left = sorted0.length ? sorted0[Math.floor(sorted0.length * this._t('regColLeftQuantile'))] : 0;
            let right = sorted1.length ? sorted1[Math.ceil(sorted1.length * this._t('regColRightQuantile')) - 1] : 0;
            const view = pages[0] ? pages[0].view : [0, 0, 595, 842];
            const m = Math.min(left - view[0], view[2] - right);
            // (the left edge, where lines start, many lines show themselves: margins need not be alike — LibreOffice's
            // HTML pages are not; a wider right margin drawn in would make every line there look indented)
            // (and so does the right edge, where right-to-left lines start: a logo's caption at the far left of a Word
            // letterhead mirrored to the right made every line of an RTL page indented — sections became quotes)
            const kEdge = this._t('regColEdgeTolPt'), kMin = this._t('regColEdgeMinLines');
            const atLeft = xs0.filter(function (x) { return Math.abs(x - left) <= kEdge; }).length;
            const atRight = rtlStarts.filter(function (x) { return Math.abs(x - right) <= kEdge; }).length;
            // (a margin is mirrored from the other side's only where lines show that side: a slide's one line drawn past
            // the page's left edge gave no margin there, while scaled down to 80 % it gave one — and mirrored to the right,
            // every right-to-left line of the slide looked indented and its paragraphs read as quotes)
            const kSrc = this._t('regColMirrorSrcLines');
            const endsRight = xs1.filter(function (x) { return Math.abs(x - right) <= kEdge; }).length;
            if (m > 0) {
                if (atLeft < kMin && endsRight >= kSrc) { left = Math.min(left, view[0] + m); this._fire('regions.columnLeftMirrored'); }
                if (atRight < kMin && atLeft >= kSrc) { right = Math.max(right, view[2] - m); this._fire('regions.columnRightMirrored'); }
            }
            // (and the body size unrounded: the sizes of its half-point bin, their median — a size test near the body
            // compares two rounded sizes otherwise: a caption 1.2 pt under a 9.6-pt body measured 9 against 9.5, alike)
            const bin = (fromLong ? longSizes : sizes).filter(function (s) { return Math.abs(s - body) <= 0.5 / kRes; });
            this._metrics = { body: body, bodyExact: bin.length ? median(bin) : body, left: left, right: right };
            return body;
        },

        // _layout, step 6: the body text's font family and the heading families (_fam)
        _bodyFamilies(all, body) {
            // font families: the body text's (long lines at body size), and those of the large headings — a short
            // line in a heading family alone, at body size, is a heading too (pandoc's level 4: Calibri italic over Cambria)
            const fontInfo = this._fonts || {};
            const famOf = function (id) {
                const n = (fontInfo[id] && fontInfo[id].name) || '';
                return n.replace(/^[A-Z]{6}\+/, '').replace(/[-,](Bold|Italic|Oblique|Regular|Roman|Book|Medium|Light|Semibold|SemiBold|Black|Heavy)+.*$/i, '').replace(/(MT|PS)$/, '');
            };
            const famCount = {}, headFam = {}, famLines = {};
            let bodyLines = 0;
            const kTol = this._t('regBodySizeTolPt'), kBold = this._t('regFamBoldShare'), kLong = this._t('regFamLongGlyphs');
            const kStep = this._t('regFamHeadStepPt'), kHeadMax = this._t('regFamHeadMaxGlyphs');
            all.forEach(function (pl) { pl.lines.forEach(function (L) {
                const gs = L.glyphs.filter(function (g) { return !g.space && !g.atom; });
                if (!gs.length) return;
                if (Math.abs(L.size - body) < kTol && !(L.boldShare > kBold)) { bodyLines++; const f0 = famOf(gs[0].font); famLines[f0] = (famLines[f0] || 0) + 1; }
                if (Math.abs(L.size - body) < kTol && gs.length >= kLong) gs.forEach(function (g) { const f = famOf(g.font); famCount[f] = (famCount[f] || 0) + 1; });
                if (L.size >= body + kStep && gs.length <= kHeadMax) { const f = famOf(gs[0].font); if (gs.every(function (g) { return famOf(g.font) === f; })) headFam[f] = (headFam[f] || 0) + 1; }
            }); });
            const bodyFam = Object.keys(famCount).sort(function (a, b) { return famCount[b] - famCount[a]; })[0] || '';
            // (rare at body size: a family the text itself is set in tells no heading)
            const kMinH = this._t('regFamHeadMinLines'), kMaxB = this._t('regFamBodyMaxLines'), kShareB = this._t('regFamBodyShare');
            this._fam = { of: famOf, body: bodyFam, heads: Object.keys(headFam).filter(function (f) { return f && f !== bodyFam && headFam[f] >= kMinH && (famLines[f] || 0) <= Math.max(kMaxB, kShareB * bodyLines); }) };
            if (this._fam.heads.length) this._fire('regions.headFamilies');
        },

        // _layout, step 7: the body text's line pitch (_bodyLead) and the document's pitch of code (_codePitch);
        // M: the metrics of step 5 ({ body, left, right })
        _bodyPitches(all, M) {
            const body = M.body, left = M.left, right = M.right;
            // the body text's own line pitch (most body lines follow one another inside paragraphs): a run of
            // one-line paragraphs must not take their paragraph gap for the leading
            const pitches = [];
            const kTol = this._t('regBodySizeTolPt'), kEnd = this._t('regLeadWrapEndEm'), kWide = this._t('regLeadWrapWidthShare');
            const kMinD = this._t('regLeadMinEm'), kMaxD = this._t('regLeadMaxEm'), kOver = this._t('regLeadOverlapShare');
            all.forEach(function (pl) {
                const ls = pl.lines.filter(function (L) { return Math.abs(L.size - body) < kTol; }).sort(function (a, b) { return b.y - a.y; });
                for (let i = 1; i < ls.length; i++) {
                    const a = ls[i - 1], b = ls[i], d = a.y - b.y;
                    // (the upper line wraps: it runs to the column's end, so the next line is the same paragraph's)
                    const wraps = a.x1 > right - kEnd * body || a.x0 < left + kEnd * body && a.x1 - a.x0 > kWide * (right - left);
                    if (wraps && d > kMinD * body && d < kMaxD * body && Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > kOver * Math.min(a.x1 - a.x0, b.x1 - b.x0)) pitches.push(d / body);
                }
            });
            this._bodyLead = pitches.length >= this._t('regLeadMinSamples') ? mode(pitches, this._t('regLeadModeRes')) : null;
            if (this._bodyLead !== null) this._fire('regions.bodyLead');
            // the document's single pitch of code, in sizes: monospace lines one under the other at one left edge (the
            // lower tenth of their steps — blocks with blank lines between all their lines step twice as far)
            const codeSteps = [];
            const kMono = this._t('regCodeMonoShare'), kX = this._t('regCodeEdgeTolPt'), kMinS = this._t('regCodeStepMinEm'), kMaxS = this._t('regCodeStepMaxEm');
            all.forEach(function (pl) {
                // (each line with the nearest one below it at its left edge: columns side by side interleave by height)
                const ls = pl.lines.filter(function (L) { return L.monoShare > kMono; });
                ls.forEach(function (a) {
                    let d = Infinity;
                    ls.forEach(function (b) { const e = a.y - b.y; if (b !== a && Math.abs(a.x0 - b.x0) < kX && e > kMinS * b.size && e < d) d = e; });
                    if (d < kMaxS * a.size) codeSteps.push(d / a.size);
                });
            });
            codeSteps.sort(function (a, b) { return a - b; });
            this._codePitch = codeSteps.length >= this._t('regCodeMinSteps') ? codeSteps[Math.floor(codeSteps.length * this._t('regCodeStepQuantile'))] : null;
            if (this._codePitch !== null) this._fire('regions.codePitch');
        },

        // _layout, step 8 (per page): the page's blocks — its layout, the page render released, a letterhead's head
        // before them, pictures out of the text, the page's quality noted, then the ladder (ladder.js: the mode the page
        // is given in — full, simplified, textContent, ocr —, and failing every rung its plain lines, _pageFallback)
        async _layoutPage(pl, body) {
            const self = this;
            let pageBlocks = null, failed = null;
            // (a page whose extraction or lines failed has nothing to lay out: the ladder starts lower)
            if (pl.p.error) failed = { kind: 'extract', error: pl.p.error };
            else if (pl.linesError) failed = { kind: 'lines', error: pl.linesError };
            if (!failed) {
                try { pageBlocks = await this._pageBlocks(pl, body); }
                catch (e) {
                    if (e && e.code === 'aborted') throw e;
                    failed = { kind: 'layout', error: e };
                }
            }
            pl.p._canvas = null; pl.p._vp = null;           // the page render is only needed for its figures
            // pdf.js's caches of this page (operator list, fonts' glyph data) are no longer needed
            try { if (pl.p.page && pl.p.page.cleanup) pl.p.page.cleanup(); } catch (e) { /* busy: let it be */ }
            await this._yield();
            // a letter's head kept from its letterhead (§6a, `_letterFields`): before the page's own text, a paragraph a chunk
            if (pl.letterHead) this._fire('regions.letterHead', pl);
            if (pl.letterHead && pageBlocks) pageBlocks = pl.letterHead.map(function (k) {
                const rtl = k.some(function (L) { return L.strong && L.strong.R > L.strong.L; }) || k.every(function (L) { return !(L.strong && L.strong.L); });
                return { type: 'p', glyphs: self._joinLines(k, rtl ? 'rtl' : 'ltr'), dir: rtl ? 'rtl' : 'ltr', letterHead: true };
            }).concat(pageBlocks);
            if (pageBlocks) pageBlocks = this._picturesOut(pageBlocks);
            let q = null;
            try { q = this._pageQuality(pl, pageBlocks || []); } catch (e) { /* a diagnosis never fails a page */ }
            pageBlocks = await this._ladder(pl, pageBlocks, q, failed);
            if (pageBlocks.length) { pageBlocks[0].pageStart = true; pageBlocks[pageBlocks.length - 1].pageEnd = true; }
            return pageBlocks;
        },

        // _layout, step 8a: a page whose layout failed (e: the error) and no rung of the ladder gave one — noted, its
        // lines as plain paragraphs (the last resort; in 'full' mode the only one, as before the ladder)
        _pageFallback(pl, e) {
            const self = this;
            // its layout failed: its lines as plain paragraphs, in reading order top to bottom — the words kept
            (this._failedPages = this._failedPages || []).push(pl.p.num);
            this._fire('regions.pageFallback', pl);
            this._note('pageFailed', 'The layout of page ' + pl.p.num + ' failed (' + String(e && e.message || e).slice(0, 80) + '); its text is given as plain lines.', pl.p.num);
            return pl.lines.slice().sort(function (a, b) { return b.y - a.y || a.x0 - b.x0; }).map(function (L) {
                let g; try { g = self._joinLines([L], self._blockDir([L], L.x0, L.x1, false)); } catch (e2) { g = L.glyphs; }
                return { type: 'p', glyphs: g };
            });
        },

        /**
         * A picture that draws nothing (PDFIMPORT.md §7, "Pictures and text"): its soft mask transparent throughout — Word's
         * empty anchor picture, 43 × 57 pixels, black under an all-zero mask, by a booklet's quote: cropped from the page it
         * was a square of the paper's texture, and as an atom in the line it cut a word («ورز ش»). Read where pdf.js
         * decoded it (waiting a moment for it), at 16 × 16; where it cannot be read, it stays.
         */
        async _hiddenPictures(all) {
            if (typeof document === 'undefined') return;
            let cv = null, cx = null;
            const kTiny = this._t('regPicTinyPx'), kAlpha = this._t('regPicAlphaMax');
            for (const pl of all) {
                const page = pl.p.page, ims = pl.p.images || [];
                if (!page || !page.objs || !ims.length) continue;
                const keep = [];
                for (const im of ims) {
                    let gone = false;
                    if (im.objId) {
                        let o = null;
                        try {
                            if (page.objs.has(im.objId)) o = page.objs.get(im.objId);
                            else o = await Promise.race([new Promise(function (res) { page.objs.get(im.objId, res); }), new Promise(function (res) { setTimeout(function () { res(null); }, 300); })]);
                        } catch (e) { o = null; }
                        const src = o && o.bitmap;
                        // (a picture of a few pixels whose shape is its soft mask — Word's footnote mark, a 2 × 2 image under a
                        // glyph-shaped mask — reads near transparent at that size: too few pixels to judge, it stays)
                        if (src && (src.width <= kTiny || src.height <= kTiny)) { keep.push(im); continue; }
                        if (src) try {
                            if (!cv) { cv = document.createElement('canvas'); cv.width = cv.height = 16; cx = cv.getContext('2d', { willReadFrequently: true }); }
                            cx.clearRect(0, 0, 16, 16); cx.drawImage(src, 0, 0, 16, 16);
                            const d = cx.getImageData(0, 0, 16, 16).data;
                            let a = 0; for (let q = 3; q < d.length; q += 4) a = Math.max(a, d[q]);
                            gone = a < kAlpha;
                        } catch (e) { /* unreadable: kept */ }
                    }
                    if (!gone) keep.push(im); else this._fire('regions.hiddenPicture', pl);
                }
                pl.p.images = keep;
            }
        },

        /**
         * A page border (PDFIMPORT.md §7, "Page borders"): Word's art border is a ring of small tiles round the page — each
         * tile outlined and filled, every 18 pt along each edge —, a plain one rules or bands. A one-page flyer has no
         * repetition to tell it, and the tiles' outlines along the top and the bottom are vertical rules at a steady pitch
         * over the whole width: the ruled-table reading took the page for one table of 28 columns, every line cut into
         * them. Drawn things wholly between the page's edge and its text, more than 6 pt from the text (a table's rules
         * hug their cells), go, when there are such things beyond the text on all four sides: a ring, not a rule over a
         * page's first table or a bar under its last line; and not what touches what is drawn among the text (a table's
         * outer rule).
         */
        _pageBorders(all) {
            let n = 0;
            const self = this, kGap = this._t('regBorderGapPt'), kEdge = this._t('regBorderEdgeShare'), kSpan = this._t('regBorderSpanShare');
            const kThin = this._t('regBorderThinPt'), kAlong = this._t('regBorderAlongTolPt'), kEnd = this._t('regBorderEndTolPt'), kMeets = this._t('regBorderMinMeets');
            all.forEach(function (pl) {
                const p = pl.p, ls = pl.lines.filter(function (L) { return L.glyphs.some(function (g) { return !g.space; }); });
                if (!ls.length) return;
                const T = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
                ls.forEach(function (L) {
                    T.x0 = Math.min(T.x0, L.x0); T.x1 = Math.max(T.x1, L.x1);
                    T.y0 = Math.min(T.y0, L.bottom !== undefined ? L.bottom : L.y); T.y1 = Math.max(T.y1, L.top !== undefined ? L.top : L.y + L.size);
                });
                const G = kGap, V = p.view, PW = V[2] - V[0], PH = V[3] - V[1];
                // (beyond the text and near the page's edge: within a tenth of the page — a table's rules a few points
                // past its cells, a web page's background bands, lie nearer the text)
                const side = function (b) {
                    if (b.y0 > T.y1 + G && b.y0 > V[3] - kEdge * PH) return 'T';
                    if (b.y1 < T.y0 - G && b.y1 < V[1] + kEdge * PH) return 'B';
                    if (b.x1 < T.x0 - G && b.x1 < V[0] + kEdge * PW) return 'L';
                    if (b.x0 > T.x1 + G && b.x0 > V[2] - kEdge * PW) return 'R';
                    return null;
                };
                const boxes = {
                    hsegs: function (s) { return { x0: Math.min(s.x0, s.x1), x1: Math.max(s.x0, s.x1), y0: s.y, y1: s.y }; },
                    vsegs: function (s) { return { x0: s.x, x1: s.x, y0: Math.min(s.y0, s.y1), y1: Math.max(s.y0, s.y1) }; },
                    rects: function (r) { return r; }, vectors: function (v) { return v; }, small: function (m) { return m; }, images: function (m) { return m; }
                };
                // (a ring: on each side, what is drawn there runs along most of that edge)
                const span = { T: [Infinity, -Infinity], B: [Infinity, -Infinity], L: [Infinity, -Infinity], R: [Infinity, -Infinity] };
                Object.keys(boxes).forEach(function (k) { (p[k] || []).forEach(function (o) {
                    const b = boxes[k](o), sd = side(b); if (!sd) return;
                    const a = sd === 'T' || sd === 'B' ? [b.x0, b.x1] : [b.y0, b.y1];
                    span[sd][0] = Math.min(span[sd][0], a[0]); span[sd][1] = Math.max(span[sd][1], a[1]);
                }); });
                if (!['T', 'B', 'L', 'R'].every(function (sd) { return span[sd][1] - span[sd][0] > kSpan * (sd === 'T' || sd === 'B' ? PW : PH); })) return;
                self._fire('regions.pageBorder', pl);
                // (but not a table's outer rule: a rule beyond the text on which two rules or more of what is drawn among the
                // text end — a landscape page's table, its right edge a few points past its first column's cells, inside
                // the page's ring, lost that column. A banner that merely touches the ring makes it no table)
                const inner = { h: [], v: [] };
                const thin = function (b) { return b.x1 - b.x0 <= kThin ? 'v' : b.y1 - b.y0 <= kThin ? 'h' : null; };
                const all = [];
                Object.keys(boxes).forEach(function (k) { (p[k] || []).forEach(function (o) {
                    const b = boxes[k](o), out = !!side(b), t = k === 'hsegs' ? 'h' : k === 'vsegs' ? 'v' : (k === 'rects' ? thin(b) : null);
                    all.push({ o: o, b: b, out: out, t: t });
                    if (!out && t) inner[t].push(b);
                }); });
                const edge = function (e) {
                    const b = e.b;
                    if (e.t === 'v') return inner.h.filter(function (h) { return h.y0 >= b.y0 - kAlong && h.y0 <= b.y1 + kAlong && (Math.abs(h.x0 - b.x1) < kEnd || Math.abs(h.x1 - b.x0) < kEnd); }).length >= kMeets;
                    if (e.t === 'h') return inner.v.filter(function (v) { return v.x0 >= b.x0 - kAlong && v.x0 <= b.x1 + kAlong && (Math.abs(v.y0 - b.y1) < kEnd || Math.abs(v.y1 - b.y0) < kEnd); }).length >= kMeets;
                    return false;
                };
                const gone = new Set();
                all.forEach(function (e) { if (e.out) { if (!edge(e)) gone.add(e.o); else self._fire('regions.borderTableEdgeKept', pl); } });
                Object.keys(boxes).forEach(function (k) {
                    if (!p[k]) return;
                    p[k] = p[k].filter(function (o) { const out = gone.has(o); if (out) n++; return !out; });
                });
            });
            this._borderParts = n;
        },

        /**
         * Word gaps a calligraphic font closed (PDFIMPORT.md §6, "Word gaps from the line"): Word sets IranNastaliq with no
         * space glyph where a word ends in a letter that does not join forward and the next one climbs over it — a plan's
         * cover read «ابزارنوین ردیاب». No gap, no glyph: the document's own words decide. A calligraphic word that
         * the text elsewhere never uses, which splits into two words that it does use side by side, is those two words.
         */
        _calliGaps(blocks) {
            const self = this, fonts = this._fonts || {};
            const CALLI = /nastaliq|nastaleeq|shekasteh|diwani|thuluth/i;
            const calli = function (g) { const f = g && fonts[g.font]; return !!(f && CALLI.test(f.name || '')); };
            const AR = /^[\u0620-\u064A\u066E-\u06D3\u200C]+$/;
            const bare = function (t) { return t.replace(/[\u064B-\u065F\u0670]/g, ''); };
            const words = new Set(), pairs = new Set();
            const textOf = function (b, out) {
                if (!b) return;
                if (b.glyphs) out.push(b.glyphs);
                (b.children || []).forEach(function (c) { textOf(c, out); });
                (b.items || []).forEach(function (c) { textOf(c, out); });
            };
            const runs = []; blocks.forEach(function (b) { textOf(b, runs); });
            // the words of the text in other fonts (the calligraphic word itself is what is in doubt)
            runs.forEach(function (gs) {
                const ws = []; let cur = '', ok = true;
                const flush = function () { if (cur && ok) ws.push(bare(cur)); else ws.push(null); cur = ''; ok = true; };
                gs.forEach(function (g) {
                    if (!g || g.space || !g.ch || !/\S/.test(g.ch)) { flush(); return; }
                    if (calli(g)) ok = false;
                    cur += g.ch;
                });
                flush();
                ws.forEach(function (w, k) { if (w && AR.test(w)) { words.add(w); if (ws[k + 1] && AR.test(ws[k + 1])) pairs.add(w + ' ' + ws[k + 1]); } });
            });
            // (a ZWNJ in a calligraphic word is weak evidence: typed to shape the calligraphy — Word's IranNastaliq letterhead
            // «اداره … آموزشی» drew «آموزش‌ی». The word whole, where the text elsewhere uses it, is that word; else it
            // stays: «طرح‌نامه» on a plan's cover)
            runs.forEach(function (gs) {
                for (let i = 0; i < gs.length; i++) {
                    const z = gs[i];
                    if (!z || z.ch !== '\u200C' || !calli(z)) continue;
                    let s0 = i, s1 = i + 1;
                    while (s0 > 0 && gs[s0 - 1] && !gs[s0 - 1].space && gs[s0 - 1].ch && /\S/.test(gs[s0 - 1].ch)) s0--;
                    while (s1 < gs.length && gs[s1] && !gs[s1].space && gs[s1].ch && /\S/.test(gs[s1].ch) && gs[s1].ch !== '\u200C') s1++;
                    const a = bare(gs.slice(s0, i).map(function (g) { return g.ch || ''; }).join('')).split('\u200C').pop();
                    const b = bare(gs.slice(i + 1, s1).map(function (g) { return g.ch || ''; }).join(''));
                    if (!a || !b) continue;
                    if (words.has(a + b)) { gs.splice(i, 1); i--; self._fire('regions.calliZwnjDropped'); }
                }
            });
            if (!pairs.size) return blocks;
            runs.forEach(function (gs) {
                for (let i = 0; i < gs.length; i++) {
                    if (!calli(gs[i]) || gs[i].space) continue;
                    let j = i; while (j < gs.length && gs[j] && !gs[j].space && calli(gs[j])) j++;
                    const word = bare(gs.slice(i, j).map(function (g) { return g.ch || ''; }).join(''));
                    if (AR.test(word) && !words.has(word)) {
                        for (let k = i + 1; k < j; k++) {
                            const a = bare(gs.slice(i, k).map(function (g) { return g.ch || ''; }).join('')), b = bare(gs.slice(k, j).map(function (g) { return g.ch || ''; }).join(''));
                            if (pairs.has(a + ' ' + b)) { gs.splice(k, 0, Object.assign({}, gs[k], { ch: ' ', space: true, w: 0, synthetic: true })); j++; self._fire('regions.calliWordSplit'); break; }
                        }
                    }
                    i = j;
                }
            });
            return blocks;
        },

        /**
         * Text wins over pictures (PDFIMPORT.md §7): a raster picture that stood in a line's run of text (a badge in a
         * sentence, an icon before a heading) leaves the line and follows its block as a figure — after a list, the
         * whole list. The words close up round where it stood. A table's cells keep theirs (a cell is no line of text).
         */
        _picturesOut(blocks) {
            const self = this, out = [];
            let pending = [];
            const flush = function () { pending.forEach(function (f) { out.push(f); }); pending = []; };
            blocks.forEach(function (b, i) {
                if (b.children) b.children = self._picturesOut(b.children);
                if (b.glyphs && b.glyphs.some(function (g) { return g && g.atom && g.raster; })) {
                    const gs = [];
                    let gap = false;
                    b.glyphs.forEach(function (g) {
                        if (g && g.atom && g.raster) { pending.push({ type: 'figure', img: g.img, bb: g.bb, top: g.bb.y1 }); gap = true; self._fire('regions.pictureOut', g.page); return; }
                        // (one space where the picture stood between two words: none drawn, or one on each side)
                        if (g && g.space && gs.length && gs[gs.length - 1].space && !gs[gs.length - 1].atom) return;
                        const prev = gs[gs.length - 1];
                        if (gap && g && !g.space && prev && !prev.space && !g.br && !prev.br) gs.push(Object.assign({}, prev, { ch: ' ', space: true, atom: false, img: null, bold: false, italic: false, code: false, link: null }));
                        gap = false;
                        gs.push(g);
                    });
                    while (gs.length && gs[0].space && !gs[0].br) gs.shift();
                    while (gs.length && gs[gs.length - 1].space && !gs[gs.length - 1].br) gs.pop();
                    b.glyphs = gs;
                }
                out.push(b);
                const next = blocks[i + 1];
                if (!(b.type === 'li' && next && next.type === 'li')) flush();
            });
            flush();
            return out;
        },

        /**
         * A table's closing note (PDFIMPORT.md §7, "Tables"): its last rows, each one long text (60 characters or more)
         * in one cell merged over the row — an invoice's payment instructions under its goods — or a short label and
         * such a text beside it («توضیحات کارشناسی» | its remark over the other cells). As a row the note was one cell
         * of a dozen, the rest empty; it follows the table as a paragraph, «label: text».
         */
        _tableNotes(blocks) {
            const out = [];
            const txt = function (c) { return (c || []).map(function (g) { return g.atom ? '' : g.ch || ''; }).join('').trim(); };
            const self = this, kRows = this._t('regNoteMinRows'), kCols = this._t('regNoteMinCols'), kKeep = this._t('regNoteKeepRows');
            const kChars = this._t('regNoteMinChars'), kLabCols = this._t('regNoteLabelMinCols'), kLabChars = this._t('regNoteLabelMaxChars');
            blocks.forEach(function (b) {
                if (b.type !== 'table' || !b.rows || b.rows.length < kRows || (b.rows[0] || []).length < kCols) { out.push(b); return; }
                const notes = [];
                while (b.rows.length > kKeep) {
                    const row = b.rows[b.rows.length - 1], full = row.map(function (c, k) { return { k: k, t: txt(c) }; }).filter(function (c) { return c.t; });
                    let note = null;
                    if (full.length === 1 && full[0].t.length >= kChars) note = { label: null, text: row[full[0].k] };
                    else if (full.length === 2 && row.length >= kLabCols && full[0].t.length <= kLabChars && full[1].t.length >= kChars) note = { label: row[full[0].k], text: row[full[1].k] };
                    if (!note) break;
                    self._fire(note.label ? 'regions.tableNoteLabelled' : 'regions.tableNote');
                    notes.unshift(note); b.rows.pop();
                    if (b.rowYs) b.rowYs.pop();
                }
                out.push(b);
                notes.forEach(function (n) {
                    let g = n.text;
                    if (n.label) {
                        const lab = n.label.slice(), t = txt(lab);
                        if (!/[:：]$/.test(t)) lab.push({ ch: ':', bold: lab.length && lab[lab.length - 1].bold });
                        g = lab.concat([{ ch: ' ', space: true }], n.text);
                    }
                    out.push({ type: 'p', glyphs: g, dir: b.rtl ? 'rtl' : 'ltr', note: true });
                });
            });
            return out;
        },

        _dotMarker(L, dots) {
            if (!dots.length) return null;
            const kSide = this._t('regDotSideTolPt', L.page), kGap = this._t('regDotMaxGapEm', L.page);
            const near = dots.filter(function (v) {
                const cy = (v.y0 + v.y1) / 2;
                return cy > L.bottom && cy < L.top && (v.x0 > L.x1 - kSide && v.x0 - L.x1 < L.size * kGap || v.x1 < L.x0 + kSide && L.x0 - v.x1 < L.size * kGap);
            });
            if (!near.length) return null;
            near.forEach(function (d) { d.used = true; });
            const task = near.filter(function (d) { return d.task; })[0];
            const bullet = near.filter(function (d) { return !d.task; })[0] || task;
            this._fire(task ? 'regions.dotMarkerTask' : 'regions.dotMarker', L.page);
            return { x: (bullet.x0 + bullet.x1) / 2, side: bullet.x0 > L.x1 - kSide ? 'right' : 'left', task: !!task, checked: !!(task && task.checked) };
        },

        /** formula / drawing parts → one box per formula: near on a line, or stacked. */
        _clusterFigures(boxes, body, textIn) {
            const cs = boxes.map(function (b) { return { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, image: !!b.image }; });
            // (textIn: the page's text lines in a box — two parts are not one when their joined box holds lines
            // that neither part held: a figure never swallows the text beside it)
            const swallows = textIn ? function (a, b) {
                const u = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
                return textIn(u).lines.length > textIn(a).lines.length + textIn(b).lines.length;
            } : function () { return false; };
            const hgap = body * this._t('regFigHGapEm'), vgap = body * this._t('regFigVGapEm');
            const kLine = this._t('regFigSameLineShare'), kStack = this._t('regFigStackTolPt'), kMin = this._t('regFigMinPt');
            let merged = true;
            while (merged) {
                merged = false;
                for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
                    const a = cs[i], b = cs[j];
                    if (a.image || b.image) { if (!(a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1)) continue; }
                    const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
                    const sameLine = oy > Math.min(a.y1 - a.y0, b.y1 - b.y0) * kLine && ox > -hgap;
                    const stacked = ox > -kStack && oy > -vgap;
                    if ((sameLine || stacked) && !swallows(a, b)) {
                        a.x0 = Math.min(a.x0, b.x0); a.y0 = Math.min(a.y0, b.y0); a.x1 = Math.max(a.x1, b.x1); a.y1 = Math.max(a.y1, b.y1);
                        a.image = a.image || b.image; cs.splice(j, 1); merged = true; j--;
                        this._fire('regions.figurePartsMerged');
                    } else if (sameLine || stacked) this._fire('regions.figureSwallowRefused');
                }
            }
            return cs.filter(function (c) { return c.x1 - c.x0 > kMin || c.y1 - c.y0 > kMin; });
        },

        _cluster(boxes, gap) {
            const cs = boxes.map(function (b) { return { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, image: !!b.image }; });
            let merged = true;
            while (merged) {
                merged = false;
                for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
                    const a = cs[i], b = cs[j];
                    if (a.x0 - gap <= b.x1 && b.x0 - gap <= a.x1 && a.y0 - gap <= b.y1 && b.y0 - gap <= a.y1) {
                        a.x0 = Math.min(a.x0, b.x0); a.y0 = Math.min(a.y0, b.y0); a.x1 = Math.max(a.x1, b.x1); a.y1 = Math.max(a.y1, b.y1);
                        a.image = a.image || b.image; cs.splice(j, 1); merged = true; j--;
                    }
                }
            }
            const kMin = this._t('regClusterMinPt');
            return cs.filter(function (c) { return c.x1 - c.x0 > kMin || c.y1 - c.y0 > kMin; });
        },

        async _crop(p, box) {
            if (this.options.images === 'drop' || typeof document === 'undefined') return null;
            try {
                if (!p._canvas) {
                    const scale = this.options.imageScale;
                    const vp = this._pageViewport(p, scale);
                    const cv = document.createElement('canvas');
                    cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
                    const ctx = cv.getContext('2d');
                    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
                    await p.page.render({ canvasContext: ctx, viewport: vp, canvas: cv }).promise;
                    p._canvas = cv; p._vp = vp;
                }
                const vp = p._vp, pad = this._t('regCropPadPt', p);
                const a = vp.convertToViewportPoint(box.x0 - pad, box.y1 + pad), b = vp.convertToViewportPoint(box.x1 + pad, box.y0 - pad);
                const x = Math.max(0, Math.floor(Math.min(a[0], b[0]))), y = Math.max(0, Math.floor(Math.min(a[1], b[1])));
                const w = Math.ceil(Math.abs(b[0] - a[0])), h = Math.ceil(Math.abs(b[1] - a[1]));
                const c = document.createElement('canvas'); c.width = w; c.height = h;
                c.getContext('2d').drawImage(p._canvas, x, y, w, h, 0, 0, w, h);
                let src = c.toDataURL('image/png');
                if (this.options.onImage) src = await this.options.onImage(src, { page: p.num, index: ++this._imageCount });
                return { src: src, width: Math.round(w / this.options.imageScale), height: Math.round(h / this.options.imageScale) };
            } catch (e) {
                if (this.notes.indexOf('figureFailed') < 0) this._note('figureFailed', 'A figure could not be rendered: ' + e.message);
                return null;
            }
        },

        _tables(p, fonts) {
            // cell rectangles from stroked segments: cluster segments that touch
            let H = p.hsegs, V = p.vsegs;
            if (!H.length || !V.length) return [];
            // a stroked frame whose inner rules end on its sides is the table's border: its sides are rules too (a web
            // receipt — a framed card, rules between the rows and between label and value, no outer rule of their own;
            // the frame alone is a box, as a code block's or a quote's is)
            const self = this, T = this._t('regTabFrameTolPt', p), frameSides = [];
            const kW = this._t('regTabFrameMinWPt', p), kH = this._t('regTabFrameMinHPt', p);
            p.rects.filter(function (r) { return r.stroked && r.x1 - r.x0 > kW && r.y1 - r.y0 > kH; }).forEach(function (r) {
                const meetH = H.filter(function (q) { return q.y > r.y0 + T && q.y < r.y1 - T && (Math.abs(q.x0 - r.x0) < T || Math.abs(q.x1 - r.x1) < T); }).length;
                const meetV = V.filter(function (q) { return q.x > r.x0 + T && q.x < r.x1 - T && (Math.abs(Math.min(q.y0, q.y1) - r.y0) < T || Math.abs(Math.max(q.y0, q.y1) - r.y1) < T); }).length;
                if (meetH >= 1 && meetV >= 1) frameSides.push(r);
            });
            if (frameSides.length) {
                this._fire('regions.tableFrameSides', p);
                H = H.concat.apply(H, frameSides.map(function (r) { return [{ x0: r.x0, x1: r.x1, y: r.y0, frame: true }, { x0: r.x0, x1: r.x1, y: r.y1, frame: true }]; }));
                V = V.concat.apply(V, frameSides.map(function (r) { return [{ x: r.x0, y0: r.y0, y1: r.y1, frame: true }, { x: r.x1, y0: r.y0, y1: r.y1, frame: true }]; }));
            }
            const segs = H.map(function (s) { return { x0: s.x0, x1: s.x1, y0: s.y, y1: s.y }; })
                .concat(V.map(function (s) { return { x0: s.x, x1: s.x, y0: s.y0, y1: s.y1 }; }));
            // (segments that touch — not boxes that grow: a card's frame, as a box, took in every rule inside it, and the
            // table in the card became the card, its heading lines rows)
            const kTouch = this._t('regTabTouchPt', p), kMinG = this._t('regClusterMinPt', p), union = segs.length <= this._t('regTabUnionMaxSegs', p);
            if (!union) this._fire('regions.tableClusterFallback', p);
            const groups = union ? (function () {
                const par = segs.map(function (_, i) { return i; });
                const find = function (i) { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
                const T = kTouch;
                for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
                    const a = segs[i], b = segs[j];
                    if (a.x0 - T <= b.x1 && b.x0 - T <= a.x1 && a.y0 - T <= b.y1 && b.y0 - T <= a.y1) { const x = find(i), y = find(j); if (x !== y) par[Math.max(x, y)] = Math.min(x, y); }
                }
                const by = {};
                segs.forEach(function (sg, i) {
                    const k = find(i), g = by[k] || (by[k] = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, own: [] });
                    g.own.push(sg);
                    g.x0 = Math.min(g.x0, sg.x0); g.y0 = Math.min(g.y0, sg.y0); g.x1 = Math.max(g.x1, sg.x1); g.y1 = Math.max(g.y1, sg.y1);
                });
                return Object.keys(by).map(function (k) { return by[k]; }).filter(function (g) { return g.x1 - g.x0 > kMinG || g.y1 - g.y0 > kMinG; });
            })() : this._cluster(segs, kTouch);
            const tables = [];
            const kIn = this._t('regTabInsideTolPt', p), kDedup = this._t('regTabDedupPt', p), kMid = this._t('regLineMidEm', p), kMono = this._t('regTabMonoMax', p);
            const kInner = this._t('regTabInnerPt', p), kNear = this._t('regTabShareEdgePt', p), kRules = this._t('regTabMinRules', p);
            const kRow = this._t('regTabOneRowMinRules', p), kRowH = this._t('regTabOneRowHShare', p), kOwn = this._t('regTabOwnTolPt', p);
            groups.forEach(function (g) {
                const xs = [], ys = [];
                // (a group's own rules only: a frame's grid is not the table's inside it)
                const mine = g.own ? function (s) { return g.own.some(function (o) { return (o.x0 === o.x1 ? o.x0 === s.x && o.y0 === s.y0 && o.y1 === s.y1 : o.y0 === s.y && o.x0 === s.x0 && o.x1 === s.x1); }); } : function () { return true; };
                V.forEach(function (s) { if (inside(g, s.x, (s.y0 + s.y1) / 2, kIn) && mine(s)) xs.push(Math.round(s.x)); });
                H.forEach(function (s) { if (inside(g, (s.x0 + s.x1) / 2, s.y, kIn) && mine(s)) ys.push(Math.round(s.y)); });
                const ux = Array.from(new Set(xs)).sort(function (a, b) { return a - b; });
                const uy = Array.from(new Set(ys)).sort(function (a, b) { return b - a; });
                const dedup = function (a) { return a.filter(function (v, i) { return !i || Math.abs(v - a[i - 1]) > kDedup; }); };
                const cx = dedup(ux), cy = dedup(uy);
                const gl = p.glyphs.filter(function (q) { return !q.space && inside(g, q.x + q.w / 2, q.y + q.size * kMid); });
                const monoShare = gl.length ? gl.filter(function (q) { const f = fonts && fonts[q.font]; return f && f.mono; }).length / gl.length : 0;
                // frames inside a frame that share no edge with anything (fenced blocks drawn inside a
                // code block) make a box, not a table: table cells share their edges
                const rs = p.rects.filter(function (r) { return r.stroked && r.x0 >= g.x0 - kIn && r.x1 <= g.x1 + kIn && r.y0 >= g.y0 - kIn && r.y1 <= g.y1 + kIn; });
                const near = function (a, b) { return Math.abs(a - b) < kNear; };
                const floating = rs.some(function (r) {
                    const inner = rs.some(function (o) { return o !== r && r.x0 > o.x0 + kInner && r.x1 < o.x1 - kInner && r.y0 > o.y0 + kInner && r.y1 < o.y1 - kInner; });
                    if (!inner) return false;
                    return !rs.some(function (o) {
                        if (o === r) return false;
                        return near(o.x0, r.x0) || near(o.x1, r.x1) || near(o.x0, r.x1) || near(o.x1, r.x0) ||
                               near(o.y0, r.y0) || near(o.y1, r.y1) || near(o.y0, r.y1) || near(o.y1, r.y0);
                    });
                });
                // (or one row of three cells or more: the last row of a table, ruled alone at the top of the next page —
                // it joins the table there, or comes back as paragraphs, _joinAcrossPages)
                const oneRow = cy.length === 2 && cx.length >= kRow && cy[0] - cy[1] < kRowH * (g.x1 - g.x0);
                const grid = cx.length >= kRules && (cy.length >= kRules || oneRow);
                if (grid && monoShare < kMono && !floating) {
                    self._fire(cy.length === 2 ? 'regions.tableOneRow' : 'regions.tableRuled', p);
                    tables.push({ x0: g.x0, x1: g.x1, y0: g.y0, y1: g.y1, xs: cx, ys: cy, oneRow: cy.length === 2,
                                  H: H.filter(function (s) { return inside(g, (s.x0 + s.x1) / 2, s.y, kOwn); }),
                                  V: V.filter(function (s) { return inside(g, s.x, (s.y0 + s.y1) / 2, kOwn); }) });
                } else if (grid) self._fire(floating ? 'regions.tableFloatingBox' : 'regions.tableMonoBox', p);
            });
            return tables;
        },

        _tableBlock(f) {
            const t = f.table, self = this;
            const rtl = this._tableDir(f);
            const nr = t.ys.length - 1, nc = t.xs.length - 1;
            const cellRegion = this._tableSpans(f, nr, nc);
            const cellLinesIn = function (xL, xR, yTop, yBot) { return self._cellLinesIn(f.lines, xL, xR, yTop, yBot); };
            // the text of a merged cell goes to its first grid cell (Markdown has no spans); the rest stay empty
            const grid = [];
            for (let r = 0; r < nr; r++) {
                const row = [];
                for (let c = 0; c < nc; c++) {
                    const g = cellRegion(r, c);
                    // anchor: the region's first row, at its start column (the right one in a RTL table,
                    // which is reversed below)
                    row.push(g.r0 === r && c === (rtl ? g.c1 : g.c0)
                        ? cellLinesIn(t.xs[g.c0], t.xs[g.c1 + 1], t.ys[g.r0], t.ys[g.r1 + 1]) : []);
                }
                grid.push(row);
            }
            const gys = t.ys.slice(0, grid.length);             // each grid row's top (a split row: its baselines)
            this._tableRowSplit(grid, gys);
            const tb = { t: t, nr: nr, nc: nc, rtl: rtl, grid: grid, cellRegion: cellRegion, cellLinesIn: cellLinesIn };
            let title = this._tableTitle(tb);
            const pre = this._tablePreamble(tb, title);
            if (pre.length) title = (title || []).concat(pre.map(function (ls) { return self._joinLines(ls, self._blockDir(ls, Math.min.apply(null, ls.map(function (L) { return L.x0; })), Math.max.apply(null, ls.map(function (L) { return L.x1; })), rtl)); }));
            const rows = grid.filter(function (row) { return row.some(function (c) { return c.length; }); });
            // columns that stay empty in every row are artefacts of the grid
            const used = rows[0] ? rows[0].map(function (_, c) { return rows.some(function (row) { return row[c].length; }); }) : [];
            const align = used.map(function (_, c) {
                const ext = function (ls) { return ls.length ? { x0: Math.min.apply(null, ls.map(function (L) { return L.x0; })), x1: Math.max.apply(null, ls.map(function (L) { return L.x1; })),
                    R: ls.reduce(function (a, L) { return a + L.strong.R; }, 0), L: ls.reduce(function (a, L) { return a + L.strong.L; }, 0) } : null; };
                return columnAlign(rows.slice(1).filter(function (row) { return row[c].length; }).map(function (row) { return ext(row[c]); }), rows[0] && ext(rows[0][c]), rtl, self._ocr);
            }).filter(function (_, c) { return used[c]; });
            // geometry, to join the parts of a table split over pages
            const rowYs = [];
            for (let r = 0; r < grid.length; r++) if (grid[r].some(function (c) { return c.length; })) rowYs.push(gys[r]);
            return {
                type: 'table', rtl: rtl, align: rtl ? align.reverse() : align, cols: t.xs.slice(), rowYs: rowYs, ruled: true, title: title, oneRow: !!t.oneRow,
                rows: rows.map(function (row) {
                    const cells = row.filter(function (_, c) { return used[c]; }).map(function (lines) {
                        if (!lines.length) return [];
                        self._cellItems(lines, rtl);
                        return self._joinLines(lines, self._blockDir(lines, lines[0].x0, lines[0].x1, rtl));
                    });
                    return rtl ? cells.reverse() : cells;
                })
            };
        },

        // _tableBlock, step 1: the reading direction of a ruled table's columns (true: right to left)
        _tableDir(f) {
            const t = f.table, M = this._metrics;
            // reading direction of the columns: a table narrower than the column sits at its start
            // side; else the header row's letters decide; else the whole table's
            const count = function (lines) { let R = 0, L = 0; lines.forEach(function (ln) { R += ln.strong.R; L += ln.strong.L; }); return { R: R, L: L }; };
            const pg = f.lines.length ? f.lines[0].page : null, kSide = this._t('regTabSideTolPt', pg), kMid = this._t('regLineMidEm', pg);
            const atR = Math.abs(t.x1 - M.right) < kSide, atL = Math.abs(t.x0 - M.left) < kSide;
            const head = f.lines.filter(function (L) { const cy = L.y + L.size * kMid; return cy <= t.ys[0] && cy >= t.ys[1]; });
            const hc = count(head), all = count(f.lines);
            // (a document with no right-to-left letter: left to right — the right column of a two-column page is no start side)
            // (letters that clearly say one direction come first — three to one and more: a receipt's card, its margins
            // guessed from a few centred lines, put a Persian table «at the left»; position speaks for tables of
            // numbers and mixed ones)
            const kR = this._t('regTabDirRatio', pg), kM = this._t('regTabDirMargin', pg);
            const strong = all.R >= kR * all.L + kM ? true : all.L >= kR * all.R + kM ? false : null;
            if (this._anyRtl === false) this._fire('regions.tableDirNoRtl', pg);
            else if (strong !== null) this._fire('regions.tableDirByLetters', pg);
            else if (atR !== atL) this._fire('regions.tableDirByPosition', pg);
            else if (hc.R !== hc.L) this._fire('regions.tableDirByHeader', pg);
            else this._fire('regions.tableDirByAll', pg);
            return this._anyRtl === false ? false : strong !== null ? strong : atR !== atL ? atR : hc.R !== hc.L ? hc.R > hc.L : all.R > all.L;
        },

        // _tableBlock, step 2: merged cells — the grid's cells joined where no rule parts them (nr × nc grid cells);
        // returns cellRegion(r, c), the rectangle of grid cells the cell at (r, c) belongs to
        _tableSpans(f, nr, nc) {
            const t = f.table, self = this, pg = f.lines.length ? f.lines[0].page : null;
            const kRule = this._t('regTabRuleTolPt', pg), kCov = this._t('regTabCoveredShare', pg), kMid = this._t('regLineMidEm', pg);
            const kCross = this._t('regTabCrossPt', pg), kGap = this._t('regTabCrossGapEm', pg);
            // merged cells: neighbours with no rule between them are one cell (union-find over the grid)
            const covered = function (segs, along, lo, hi, pos, key) {
                let got = 0;
                const parts = segs.filter(function (sg) { return Math.abs(sg[key] - pos) < kRule; })
                    .map(function (sg) { return [Math.max(lo, along === 'x' ? sg.x0 : sg.y0), Math.min(hi, along === 'x' ? sg.x1 : sg.y1)]; })
                    .filter(function (q) { return q[1] > q[0]; }).sort(function (u, v) { return u[0] - v[0]; });
                let end = lo;
                parts.forEach(function (q) { if (q[1] > end) { got += q[1] - Math.max(q[0], end); end = q[1]; } });
                return got >= (hi - lo) * kCov;
            };
            const parent = []; for (let i = 0; i < nr * nc; i++) parent.push(i);
            const find = function (i) { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
            const join = function (a, b) { a = find(a); b = find(b); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); };
            // a column edge without a vertical rule is still an edge where the row's rules break (drawn cell by cell) —
            // above it and below it: a merged title row's own top rule runs whole, and the rule under it, broken at every
            // column, is the next row's cells' (Word: «تسک لیست …» over eight columns had been cut into three)
            const ruleBreak = function (x, y0, y1) {
                return [y0, y1].every(function (y) {
                    return t.H.some(function (a) { return Math.abs(a.y - y) < kRule && Math.abs(a.x1 - x) < kRule; }) &&
                           t.H.some(function (b) { return Math.abs(b.y - y) < kRule && Math.abs(b.x0 - x) < kRule; });
                });
            };
            // (text running across the edge settles it: a cell does not hold words beyond its sides — Chrome breaks a
            // colspan cell's bottom border at every column, and a table's closing note merged over its row was cut into
            // five cells mid-word, «the a | mount»)
            const crossed = function (x, yTop, yBot) {
                return f.lines.some(function (L) {
                    const cy = L.y + L.size * kMid;
                    if (cy > yTop || cy < yBot || L.x0 > x - kCross || L.x1 < x + kCross) return false;
                    const gs = L.glyphs.filter(function (g) { return !g.space && !g.atom; });
                    let a = null, b = null;
                    gs.forEach(function (g) { if (g.x + g.w / 2 <= x) { if (!a || g.x > a.x) a = g; } else if (!b || g.x < b.x) b = g; });
                    return !!(a && b) && b.x - (a.x + a.w) < kGap * L.size;
                });
            };
            for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
                if (c + 1 < nc && !covered(t.V, 'y', t.ys[r + 1], t.ys[r], t.xs[c + 1], 'x')) {
                    if (!ruleBreak(t.xs[c + 1], t.ys[r + 1], t.ys[r])) { join(r * nc + c, r * nc + c + 1); self._fire('regions.tableSpanAcross', pg); }
                    else if (crossed(t.xs[c + 1], t.ys[r], t.ys[r + 1])) { join(r * nc + c, r * nc + c + 1); self._fire('regions.tableSpanTextCrosses', pg); }
                }
                if (r + 1 < nr && !covered(t.H, 'x', t.xs[c], t.xs[c + 1], t.ys[r + 1], 'y')) { join(r * nc + c, (r + 1) * nc + c); self._fire('regions.tableSpanDown', pg); }
            }
            const region = {};
            for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
                const k = find(r * nc + c), g = region[k] || (region[k] = { r0: r, r1: r, c0: c, c1: c, n: 0 });
                g.r0 = Math.min(g.r0, r); g.r1 = Math.max(g.r1, r); g.c0 = Math.min(g.c0, c); g.c1 = Math.max(g.c1, c); g.n++;
            }
            // a merged cell is a rectangle: grid cells joined around a corner (a missing rule under the last row, the open
            // space round a lone total cell under the table: Excel) are no span — read over their bounding box they took
            // in a neighbour's text a second time («9» + its row's title). Such cells stay single
            Object.keys(region).forEach(function (k) { const g = region[k]; if (g.n !== (g.r1 - g.r0 + 1) * (g.c1 - g.c0 + 1)) self._fire('regions.tableSpanNotRect', pg); });
            const cellRegion = function (r, c) {
                const g = region[find(r * nc + c)];
                return g.n === (g.r1 - g.r0 + 1) * (g.c1 - g.c0 + 1) ? g : { r0: r, r1: r, c0: c, c1: c, n: 1 };
            };
            return cellRegion;
        },

        // _tableBlock, step 3 (per cell): the lines of a table's lines (lines) whose glyphs fall in a cell's box
        _cellLinesIn(lines, xL, xR, yTop, yBot) {
            const out = [], pg = lines.length ? lines[0].page : null;
            const kMid = this._t('regLineMidEm', pg), kSame = this._t('regCellSameLineEm', pg);
            lines.forEach(function (L) {
                const cy = L.y + L.size * kMid;
                if (cy > yTop || cy < yBot) return;
                const gs = L.glyphs.filter(function (g) { const cx = g.x + g.w / 2; return cx >= xL && cx <= xR; });
                while (gs.length && gs[0].space) gs.shift();
                while (gs.length && gs[gs.length - 1].space) gs.pop();
                if (gs.length) out.push(finishLine({ y: L.y, size: L.size, glyphs: gs, page: L.page }));
            });
            // (pieces of one line — a justified cell's words cut at its wide gaps into segments — are one line again,
            // its glyphs in their order on the page: Prince's Persian cells read their pieces left to right)
            out.sort(function (a, b) { return b.y - a.y; });
            for (let i = out.length - 1; i > 0; i--) {
                const a = out[i - 1], b = out[i];
                if (Math.abs(a.y - b.y) < kSame * Math.max(a.size, b.size) && a.page === b.page) {
                    this._fire('regions.cellPiecesJoined', a.page);
                    const gs = a.glyphs.concat([{ ch: ' ', space: true, x: Math.min(a.x1, b.x1), w: 0, y: a.y, size: a.size, font: (a.glyphs[0] || {}).font }], b.glyphs)
                        .sort(function (u, v) { return u.x - v.x; });
                    out.splice(i - 1, 2, finishLine({ y: a.y, size: Math.max(a.size, b.size), glyphs: gs, page: a.page }));
                }
            }
            return out;
        },

        // _tableBlock, step 4: grid rows that hold rows drawn without rules, split at their baselines — grid and gys
        // (each grid row's top) changed in place
        _tableRowSplit(grid, gys) {
            // rows drawn without rules (a payslip: one ruled band whose columns hold a line per item): a grid row whose
            // cells hold several lines each, at the same baselines from cell to cell, is that many rows — split at its
            // baselines (a wrapped paragraph beside a one-line cell keeps its lines: its baselines are its own)
            const kLines = this._t('regSplitMinLines'), kCells = this._t('regSplitMinCells'), kBase = this._t('regSplitBaseEm'), kMatch = this._t('regSplitMatchShare');
            const kBases = this._t('regSplitMinBases'), kWords = this._t('regSplitWordShare'), kFull = this._t('regSplitFullShare'), kWrap = this._t('regSplitWrapShare');
            const kBal = this._t('regSplitBalanceShare');
            for (let r = grid.length - 1; r >= 0; r--) {
                const row = grid[r];
                const multi = row.filter(function (c) { return c.length >= kLines; });
                if (multi.length < kCells) continue;
                const bases = [];
                row.forEach(function (c) { c.forEach(function (L) { if (!bases.some(function (y) { return Math.abs(y - L.y) < kBase * L.size; })) bases.push(L.y); }); });
                bases.sort(function (a, b) { return b - a; });
                const big = multi.slice().sort(function (a, b) { return b.length - a.length; });
                const match = big[1].filter(function (L) { return big[0].some(function (M) { return Math.abs(M.y - L.y) < kBase * L.size; }); }).length;
                if (match < kMatch * big[1].length || bases.length < kBases) continue;
                // (items, not wrapped text: a wrapped cell fills its width on every line but the last — a Word table's cells
                // wrap at one pitch in every column, and their lines share baselines too — and the fullest cells hold
                // about as many lines)
                const wrapped = function (c) {
                    const ls = c.slice().sort(function (a, b) { return b.y - a.y; }), wmax = Math.max.apply(null, ls.map(function (L) { return L.x1 - L.x0; }));
                    // (figures are no wrapped text: a column of amounts is as wide on every line)
                    const words = ls.filter(function (L) { return L.glyphs.some(function (g) { return /\p{L}/u.test(g.ch); }); }).length;
                    if (words < kWords * ls.length) return false;
                    const full = ls.slice(0, -1).filter(function (L) { return L.x1 - L.x0 >= kFull * wmax; }).length;
                    return full >= kWrap * (ls.length - 1);
                };
                if (big[1].length < kBal * big[0].length || multi.some(wrapped)) continue;
                // (every multi-line cell one line per baseline: no wrapped text among them)
                if (!multi.every(function (c) { return c.every(function (L, i) { return !c.some(function (M, j) { return j !== i && Math.abs(M.y - L.y) < kBase * L.size; }); }); })) continue;
                this._fire('regions.tableRowSplit', multi[0][0].page);
                const sub = bases.map(function (y) { return row.map(function (c) { return c.filter(function (L) { return Math.abs(L.y - y) < kBase * L.size; }); }); });
                grid.splice.apply(grid, [r, 1].concat(sub));
                gys.splice.apply(gys, [r, 1].concat(bases));
            }
        },

        // _tableBlock, step 5: a merged first row over the whole table, its title — returns its paragraphs (or null),
        // the row emptied in tb.grid. tb: { t, nr, nc, rtl, grid, cellRegion, cellLinesIn }
        _tableTitle(tb) {
            const self = this, nr = tb.nr, nc = tb.nc, rtl = tb.rtl, grid = tb.grid, cellRegion = tb.cellRegion;
            // a first row that is one cell across the whole table, with rows under it, is the table's title (Excel's
            // merged title row, a Word table's caption row): Markdown has no span — it goes before the table
            let title = null;
            const r0 = cellRegion(0, 0);
            // (over rows that have cells: in a table drawn without vertical rules every row is one span — no title)
            const celled = function (r) { const g = cellRegion(r, 0); return g.c1 < nc - 1; };
            let rowsWithCells = 0; for (let r = 1; r < nr; r++) if (celled(r)) rowsWithCells++;
            if (nr >= this._t('regTitleMinRows') && nc >= this._t('regTitleMinCols') && r0.r1 === 0 && r0.c0 === 0 && r0.c1 === nc - 1 && rowsWithCells >= this._t('regTitleMinCelled')) {
                const tl = grid[0].filter(function (c) { return c.length; })[0];
                if (tl) {
                    // (a title and its subtitle, set in two sizes, are two paragraphs: a payslip's company over «… - month»)
                    title = [];
                    const kSize = this._t('regTitleSizeTolPt', tl[0].page);
                    tl.forEach(function (L) {
                        const last = title[title.length - 1];
                        if (last && Math.abs(last[0].size - L.size) < kSize) last.push(L); else title.push([L]);
                    });
                    this._fire(title.length > 1 ? 'regions.tableTitleSubtitle' : 'regions.tableTitle', tl[0].page);
                    title = title.map(function (ls) { return self._joinLines(ls, self._blockDir(ls, ls[0].x0, ls[0].x1, rtl)); });
                    grid[0] = grid[0].map(function () { return []; });
                }
            }
            return title;
        },

        // _tableBlock, step 6: «label: value» rows between the title and the first fully celled row — returns their
        // items (each a list of lines), the rows emptied in tb.grid. title: step 5's (a row 0 title is skipped)
        _tablePreamble(tb, title) {
            const t = tb.t, nr = tb.nr, nc = tb.nc, rtl = tb.rtl, grid = tb.grid, cellRegion = tb.cellRegion, cellLinesIn = tb.cellLinesIn;
            // rows between the title and the first row cut into every column, merged across columns — a payslip's block of
            // «label: value» pairs over its table, in two or three columns of their own that the grid's columns cut through
            // («شماره» | «ملی: …»): no row of the table but text above it — each pair a paragraph, column by column from
            // the start side, a line with no colon going on from the one before
            const pre = [];
            const fullCelled = function (r) { for (let c = 0; c < nc; c++) { const g = cellRegion(r, c); if (g.c0 !== g.c1 || g.r0 !== g.r1) return false; } return true; };
            let firstCelled = 0; while (firstCelled < nr && !fullCelled(firstCelled)) firstCelled++;
            const self = this, kSame = this._t('regPreSameLineEm'), kGap = this._t('regPreGapEm'), kOver = this._t('regPreOverlapPt'), kCol = this._t('regPreColTolPt');
            if (firstCelled < nr && nr - firstCelled >= this._t('regPreMinRows')) {
                for (let r = title ? 1 : 0; r < firstCelled && r < grid.length; r++) {
                    let ls = cellLinesIn(t.xs[0], t.xs[nc], t.ys[r], t.ys[r + 1]);
                    if (!ls.length || !ls.some(function (L) { return L.glyphs.some(function (g) { return g.ch === ':' || g.ch === '：'; }); })) continue;
                    // (segments of one baseline a word apart are one line again)
                    ls.sort(function (a, b) { return b.y - a.y || a.x0 - b.x0; });
                    const merged = [];
                    ls.forEach(function (L) {
                        const m = merged.filter(function (o) { return Math.abs(o.y - L.y) < kSame * L.size && (L.x0 - o.x1 < kGap * L.size && L.x0 - o.x1 > -kOver); })[0];
                        if (m) { m.glyphs = m.glyphs.concat([{ ch: ' ', space: true, x: m.x1, w: L.x0 - m.x1, y: L.y, size: L.size }], L.glyphs); finishLine(m, L.page); }
                        else merged.push(finishLine({ y: L.y, size: L.size, glyphs: L.glyphs.slice(), page: L.page }, L.page));
                    });
                    const edge = function (L) { return rtl ? -L.x1 : L.x0; };
                    const cols = [];
                    merged.sort(function (a, b) { return edge(a) - edge(b); }).forEach(function (L) {
                        const c = cols.filter(function (q) { return Math.abs(edge(q[0]) - edge(L)) < kCol; })[0];
                        if (c) c.push(L); else cols.push([L]);
                    });
                    cols.forEach(function (c) {
                        let item = null;
                        c.sort(function (a, b) { return b.y - a.y; }).forEach(function (L) {
                            const colon = L.glyphs.some(function (g) { return g.ch === ':' || g.ch === '：'; });
                            if (!item || colon) { item = [L]; pre.push(item); } else item.push(L);
                        });
                    });
                    grid[r] = grid[r].map(function () { return []; });
                    self._fire('regions.tablePreamble', merged[0].page);
                }
            }
            return pre;
        },

        /**
         * A list inside a table cell (PDFIMPORT.md §7, "Tables"): Markdown's cells hold no list, so each item keeps its line —
         * a line break before it — and its marker as «•». A line opened by a marker — «•», «▪», «◦», Word's level-two «o»
         * in Courier New, a Wingdings «§» —, a gap after it, is an item; a line without one goes on the item above (a wrap).
         * Joined as prose, a Word plan's cell of eleven items came back as one line, each «o» as inline code.
         */
        _cellItems(lines, rtl) {
            const fonts = this._fonts || {}, pg = lines.length ? lines[0].page : null;
            const kGlyphs = this._t('regItemMinGlyphs', pg), kGap = this._t('regItemGapEm', pg);
            const isMarker = function (L) {
                const gs = L.glyphs.filter(function (g) { return !g.space && !g.atom && g.ch && g.ch.trim() && !/^[\u200B-\u200F]$/.test(g.ch); });
                if (gs.length < kGlyphs) return null;
                const m = rtl ? gs[gs.length - 1] : gs[0], nb = rtl ? gs[gs.length - 2] : gs[1];
                const gap = rtl ? m.x - (nb.x + nb.w) : nb.x - (m.x + m.w);
                if (gap < kGap * L.size) return null;
                const fn = String((fonts[m.font] || {}).name || '');
                if (/^[•◦▪▫■□●○‣⁃∙·\u25CB\u25E6\uF0A7\uF0B7]$/.test(m.ch)) return m;
                if ((m.ch === 'o' || m.ch === '§') && (m.mono || /courier|wingding|symbol/i.test(fn)) && m.font !== nb.font) return m;
                return null;
            };
            const marks = lines.map(isMarker);
            if (marks.filter(Boolean).length < this._t('regItemMinMarks', pg)) return;
            this._fire('regions.cellItems', pg);
            lines.forEach(function (L, i) {
                const m = marks[i];
                if (!m) return;
                if (i > 0) lines[i - 1].br = true;
                L.glyphs = L.glyphs.map(function (g) { return g === m ? Object.assign({}, g, { ch: '•', mono: false, code: false, bold: false }) : g; });
            });
        },

        _codeBlock(f) {
            // segments of one baseline (a wide run of spaces, a fallback font) are one line of code
            const lines = [], pg = f.lines.length ? f.lines[0].page : null, kSame = this._t('regCodeSameLineEm', pg);
            f.lines.slice().sort(function (a, b) { return b.y - a.y || a.x0 - b.x0; }).forEach(function (L) {
                const P = lines[lines.length - 1];
                if (P && P.page === L.page && Math.abs(P.y - L.y) < kSame * Math.min(P.size, L.size)) {
                    const a = P.glyphs[P.glyphs.length - 1], b = L.glyphs[0];
                    const gap = a && b ? [Object.assign({}, a, { ch: ' ', space: true, x: a.x + a.w, w: Math.max(0, b.x - a.x - a.w) })] : [];
                    const M = finishLine(Object.assign({}, P, { glyphs: P.glyphs.concat(gap, L.glyphs) }), P.page);
                    lines[lines.length - 1] = M;
                } else lines.push(L);
            });
            let lang = '';
            // Kelk: a small label line (language) on top
            if (lines.length > 1 && lines[0].size < lines[1].size - this._t('regCodeLabelStepPt', pg) && /^[\w+#.-]{1,24}$/.test(lines[0].glyphs.map(function (g) { return g.ch; }).join('').trim())) {
                this._fire('regions.codeLangLabel', pg);
                lang = lines.shift().glyphs.map(function (g) { return g.ch; }).join('').trim();
                if (lang === 'code') lang = '';                  // Kelk's label of a block without a language
            }
            const self = this;
            const widths = function (pick) { return lines.reduce(function (a, L) { return a.concat(L.glyphs.filter(pick).map(function (g) { return g.w; })); }, []); };
            const monoW = widths(function (g) { return g.mono && !g.space && !g.atom; });
            const charW = median(monoW.length ? monoW : widths(function (g) { return !g.space && !g.atom; })) || this._t('regCodeCharWPt', pg);
            const x0 = Math.min.apply(null, lines.map(function (L) { return L.x0; }));
            // blank lines inside the block: a gap of several line pitches (the most common pitch is one line)
            const steps = [];
            for (let i = 1; i < lines.length; i++) if (lines[i].page === lines[i - 1].page) steps.push(lines[i - 1].y - lines[i].y);
            const sz = median(lines.map(function (L) { return L.size; })) || this._t('regCodeSizePt', pg);
            const kMinP = this._t('regCodePitchMinEm', pg);
            const regular = steps.filter(function (d) { return d > kMinP * sz; });
            let pitch = regular.length ? Math.min.apply(null, regular) : 0;
            // every line a blank line apart: the block's own smallest pitch is then two lines. The document's single
            // pitch of code (_codePitch: monospace lines one under the other, anywhere in it) tells (a cheat sheet's
            // blocks set with a blank line between all their lines came out without one)
            const single = this._codePitch;
            if (pitch && single && pitch / sz >= this._t('regCodeDoubleRatio', pg) * single) { pitch = pitch / Math.round(pitch / (single * sz)); this._fire('regions.codePitchFromDoc', pg); }
            // a line the block wrapped (no room left for its next word, the rest going on at the block's left edge, a
            // pitch below) is one line of code: the edge is the frame's inside, else the text column's
            const M = this._metrics || {};
            const edge = f.box && f.box.x0 !== undefined ? f.box.x1 - Math.max(0, x0 - f.box.x0) : M.right;
            const firstW = function (L) {
                const gs = L.glyphs; let k = 0; while (k < gs.length && gs[k].space) k++;
                const a = gs[k]; let e = a; while (k < gs.length && !gs[k].space) { e = gs[k]; k++; }
                return a ? e.x + e.w - a.x : 0;
            };
            const kWrapP = this._t('regCodeWrapPitch', pg), kWrapX = this._t('regCodeWrapIndentCells', pg), kBlank = this._t('regCodeMaxBlank', pg);
            const wrapped = lines.map(function (L, i) {
                const P = lines[i - 1];
                return !!(P && edge && P.page === L.page && pitch > 0 && P.y - L.y < kWrapP * pitch && Math.abs(L.x0 - x0) < kWrapX * charW &&
                    edge - P.x1 < firstW(L) + charW && edge - P.x1 > -charW);
            });
            const text = [];
            lines.forEach(function (L, i) {
                const P = lines[i - 1];
                if (P && pitch > 0 && P.page === L.page) {
                    const blank = Math.round((P.y - L.y) / pitch) - 1;
                    if (blank > 0) self._fire('regions.codeBlankLines', pg);
                    for (let k = 0; k < Math.min(blank, kBlank); k++) text.push('');
                }
                let indent = Math.max(0, Math.round((L.x0 - x0) / charW));
                // (an OCR layer places each word by its ink, not on the font's cells: its gaps say «a space», and its
                // indents come out a cell long or short — 5 for 4 — so they go to the nearest even count)
                if (self._ocr) indent = 2 * Math.round(indent / 2);
                // a gap is as many spaces as character cells (column alignment survives)
                const cells = { glyphs: L.glyphs.map(function (g) { return g.space ? Object.assign({}, g, { ch: self._ocr ? ' ' : ' '.repeat(Math.max(1, Math.round(g.w / charW))) }) : g; }) };
                let t = nfkcArabic(self._logical(cells, false, true).map(function (g) { return g.atom ? '' : g.ch; }).join(''));
                if (self._ocr) t = t.replace(/ {2,}/g, ' ');
                if (wrapped[i] && text.length) { text[text.length - 1] = text[text.length - 1].replace(/\s+$/, '') + ' ' + t.trim(); self._fire('regions.codeWrapJoined', pg); }
                else text.push(' '.repeat(indent) + t);
            });
            return { type: 'code', lang: lang, lines: text, wrapX: f.box.x1 };
        }
    });
})(typeof window !== 'undefined' ? window : globalThis);
