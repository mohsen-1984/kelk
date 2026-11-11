/**
 * PdfImporter — 3. lines, 3.5 page furniture (lib/pdfimport/lines.js)
 * ============================================================================
 * Glyphs → visual lines → segments (cut at column and cell gaps) → logical order (the importer's own UBA);
 * running heads and feet, side panels, page numbers, logos found before the page is measured.
 * PDFIMPORT.md §6, §6a.
 *
 * Part of PdfImporter: load after lib/PdfImporter.js (see its header for the order). The methods
 * are those of the class, added to its prototype; the helpers come from the core.
 */
(function (global) {
    'use strict';
    const PdfImporter = global.PdfImporter || (typeof require === 'function' ? require('../PdfImporter.js') : null);
    const { R_CH, MARK_CH, MIRROR, bidiLevels, reorder, PF, median, inside, emojiPresentation, dingbat,
            nfkcArabic, finishLine } = PdfImporter._internal;
    const DUAL_L = PdfImporter._internal.DUAL;
    // the brackets whose names _bracketsLogical reads on right-to-left levels: kind, opening (< > stay out: a comparison)
    const PAIRED_BR = { '(': [0, true], ')': [0, false], '[': [1, true], ']': [1, false], '{': [2, true], '}': [2, false] };

    // the layout literals of this file (thresholds.js; defaults only). wordGapEm, wordGapBareEm,
    // scriptChangeGapEm and lineWordGap* are defined in thresholds.js (seed entries) and read here
    (function () {
        const F = 'lines.js ', GR = F + '_glyphRows', VL = F + '_visualLines', SG = F + '_segments', CE = F + '_cellEdges',
              JS = F + '_joinSegments', FR = F + '_finishRows', WS = F + '_wordSpaces', SC = F + '_streamColumns',
              FU = F + '_furniture', FM = F + '_furnitureMarked', FE = F + '_furnitureEvidence', FC = F + '_furnitureCut',
              FD = F + '_furnitureDrawn', LF = F + '_letterFields';
        const e = function (def, unit, used, fixed) { const o = { def: def, unit: unit, used: [].concat(used) }; if (fixed) o.fixed = true; return o; };
        PdfImporter._defineThresholds({
        // a glyph drawn slanted by its text matrix (the shear over the height) is italic: Chrome slants a font with no italic
        // face by 0.2–0.25 — most Persian and Arabic fonts have none (2.7)
        linSlantItalic: { def: 0.1, unit: 'ratio', used: ['lines.js _glyphRows (italic from a slanted text matrix)'] },
            // 3a. glyph records: calligraphic baselines, stray accents, combining marks
            linCalliBoxEm: e(2.2, 'em', GR + ' (calligraphic font box)'),
            linCalliMinGlyphs: e(3, 'glyphs', GR + ' (calligraphic run)'),
            linCalliSizeTolPt: e(0.1, 'pt', GR + ' (calligraphic run)'),
            linCalliRiseEm: e(0.5, 'em', GR + ' (calligraphic run)'),
            linCalliTouchEm: e(1.0, 'em', GR + ' (calligraphic run)'),
            linStrayAccentWEm: e(0.02, 'em', GR + ' (stray accent)'),
            linStrayAccentGapEm: e(0.25, 'em', GR + ' (stray accent)'),
            linMarkWindowGlyphs: e(8, 'glyphs', GR + ' (mark host)'),
            linMarkHostRiseEm: e(1.2, 'em', GR + ' (mark host)'),
            linMarkZeroWEm: e(0.05, 'em', GR + ' (mark host)'),
            linMarkOutlineOffsetEm: e(0.2, 'em', GR + ' (mark host)'),
            linMarkPadEm: e(0.15, 'em', GR + ' (mark host)'),
            linMarkPadShare: e(0.25, 'share', GR + ' (mark host, of the host width)'),
            linMarkPrevNearEm: e(0.25, 'em', GR + ' (mark host)'),
            linMarkNearEm: e(0.5, 'em', GR + ' (mark host)'),
            linMarkEdgeTolPt: e(0.6, 'pt', GR + ' (Latin mark at a boundary)'),
            linUntrackPageMinSamples: e(30, 'count', GR + ' (untracked layout: the page\'s own drift reading from this many samples, else the document\'s)'),
            // 3b. visual lines
            linDrawsSpacesShare: e(0.05, 'share', VL + ' drawsSpaces'),
            linSpaceEmMinSamples: e(4, 'count', VL + ' spaceEm'),
            linSpacedDocShare: e(0.1, 'share', VL + ' spacedDoc'),
            linBaselineLookback: e(3, 'count', VL + ' (baseline grouping)'),
            linBaselineTolPt: e(1.5, 'pt', VL + ' (baseline grouping)'),
            linBaselineTolEm: e(0.35, 'em', VL + ' (baseline grouping)'),
            linMainTextRatio: e(1.15, 'ratio', VL + ' (line baseline of its main text)'),
            linLineMarkNearEm: e(0.6, 'em', VL + ' (marks merged)'),
            // 3c. segments
            linJustGapMaxEm: e(5, 'em', SG + ' justGap'),
            linJustGapMinEm: e(0.2, 'em', SG + ' justGap'),
            linJustGapTol: e(0.15, 'share', SG + ' justGap (of the gap)'),
            linJustGapMinCount: e(3, 'count', SG + ' justGap'),
            linOwnGapMinGlyphs: e(12, 'glyphs', SG + ' lineWordGap'),
            linOwnGapMinWordGaps: e(3, 'count', SG + ' lineWordGap'),
            linSpaceInGapTolPt: e(0.5, 'pt', SG + ' (drawn space in a gap)'),
            linSpaceFillGapEm: e(1.1, 'em', SG + ' (drawn space fills little of a wide gap)'),
            linSpaceFillShare: e(0.5, 'share', SG + ' (drawn space fills little of a wide gap)'),
            linDigitCellGapEm: e(0.7, 'em', SG + ' (digit cells)'),
            linMonoCellGapEm: e(0.3, 'em', SG + ' (code cell beside text)'),
            linCellGapMinEm: e(0.15, 'em', SG + ' cellGap'),
            linCellGapOverLetterEm: e(0.12, 'em', SG + ' cellGap'),
            linWideGapEm: e(1.1, 'em', SG + ' (wide gap cut)'),
            linWideGapSpacedEm: e(2.5, 'em', SG + ' (wide gap cut, drawn space)'),
            linWideGapMinPt: e(6, 'pt', SG + ' (wide gap cut)'),
            linSizeJumpRatio: e(1.6, 'ratio', [SG + ' (size jump cut)', JS + ' (rejoin)']),
            linSizeJumpGapEm: e(0.8, 'em', SG + ' (size jump cut)'),
            linFormatCharWEm: e(0.05, 'em', SG + ' (zero-width format character)'),
            linRowCellMinCuts: e(2, 'count', SG + ' rowCell'),
            linWordEdgeGapEm: e(0.12, 'em', CE + ' wordEdges'),
            linRunEndGapEm: e(0.6, 'em', CE + ' runEnd'),
            linSpaceWMinEm: e(0.1, 'em', CE + ' spaceW'),
            linEdgeAlignTolPt: e(1.2, 'pt', CE + ' columnEdge'),
            linEdgeRowsNearEm: e(12, 'em', CE + ' columnEdge'),
            linSpaceGapFactor: e(1.15, 'ratio', CE + ' columnEdge (of the font space)'),
            linEdgeMinRows: e(2, 'count', CE + ' columnEdge'),
            linEdgeMinRowsSpace: e(3, 'count', CE + ' columnEdge (gap of a space)'),
            linRtlMarginTolPt: e(0.5, 'pt', CE + ' columnEdge (RTL margin)'),
            // 3d. segments joined
            linRaisedSizeRatio: e(0.85, 'ratio', JS + ' (raised mark)'),
            linSubtitleMinGlyphs: e(6, 'glyphs', JS + ' (raised mark: a subtitle)'),
            linSubtitleBaseEm: e(0.15, 'em', JS + ' (raised mark: a subtitle)'),
            linJoinOverlapPt: e(1, 'pt', JS + ' (raised mark, rejoin)'),
            linRaisedTouchEm: e(0.3, 'em', JS + ' (raised mark)'),
            linRaisedRiseTouchEm: e(0.85, 'em', JS + ' (raised mark touching)'),
            linRaisedRiseEm: e(0.6, 'em', JS + ' (raised mark)'),
            linRaisedWithinTolPt: e(0.3, 'pt', JS + ' (raised mark inside a line)'),
            linRaisedGapEm: e(0.6, 'em', JS + ' (raised mark)'),
            linRejoinBaseEm: e(0.3, 'em', JS + ' (rejoin)'),
            linRejoinGapEm: e(0.6, 'em', JS + ' (rejoin)'),
            linRejoinGapPt: e(3, 'pt', JS + ' (rejoin)'),
            linBadgeMaxGlyphs: e(3, 'glyphs', JS + ' (badge)'),
            linBadgeBoxTolPt: e(0.5, 'pt', JS + ' (badge)'),
            linBadgeBoxMinHEm: e(0.5, 'em', JS + ' (badge)'),
            linBadgeBoxMaxWEm: e(5, 'em', JS + ' (badge)'),
            linBadgeBoxPadEm: e(2.5, 'em', JS + ' (badge)'),
            linBadgeBoxMaxHEm: e(3, 'em', JS + ' (badge)'),
            linBadgeBaseEm: e(0.35, 'em', JS + ' (badge)'),
            linBadgeGapEm: e(2, 'em', JS + ' (badge)'),
            linMarkerBaseEm: e(0.3, 'em', JS + ' (list marker set off by a tab)'),
            linMarkerHostSizeRatio: e(0.75, 'ratio', JS + ' (list marker set off by a tab)'),
            linMarkerTabMaxEm: e(4, 'em', JS + ' (list marker set off by a tab)'),
            linNumTabBaseEm: e(0.3, 'em', JS + ' (number set off by a tab)'),
            linNumTabSizeTolPt: e(0.6, 'pt', JS + ' (number set off by a tab)'),
            linNumTabMinEm: e(1.2, 'em', JS + ' (number set off by a tab)'),
            linNumTabMaxEm: e(4, 'em', JS + ' (number set off by a tab)'),
            linLoneBulletBaseEm: e(0.3, 'em', JS + ' (lone bullet)'),
            linLoneBulletGapEm: e(1.2, 'em', JS + ' (lone bullet)'),
            // 3e. rows: word spaces, ZWNJs, kashidas, raised digits, code
            linFormTouchEm: e(0.08, 'em', [FR + ' (glyph forms)', WS + ' (ZWNJ from forms)']),
            linFormApartEm: e(0.15, 'em', FR + ' (glyph forms)'),
            linFormMinSeen: e(2, 'count', FR + ' (glyph forms)'),
            linInklessWPt: e(0.05, 'pt', [FR + ' (inkless row)', SC + ' (inkless segment)']),
            linNoSpaceLineGapEm: e(0.14, 'em', WS + ' (a line without its spaces)'),
            linNoSpaceLineMinGaps: e(2, 'count', WS + ' (a line without its spaces)'),
            linZwnjSpaceMinEm: e(0.12, 'em', WS + ' (ZWNJ glyph as a space)'),
            linZwnjSpaceRoomShare: e(0.7, 'share', WS + ' (ZWNJ glyph as a space, of its width)'),
            linNoRoomShare: e(0.25, 'share', WS + ' noRoom (of the space width)'),
            linChainSpaceMinEm: e(0.1, 'em', WS + ' (space in the chain of advances)'),
            linChainTolEm: e(0.05, 'em', WS + ' (space in the chain of advances)'),
            linChainAdvShare: e(0.5, 'share', WS + ' noRoom (of the space width)'),
            linChainPastPrevEm: e(0.1, 'em', WS + ' (space over letters, chained)'),
            linNarrowSpaceEm: e(0.08, 'em', WS + ' (narrow space: a ZWNJ)'),
            linNarrowOwnShare: e(0.5, 'share', WS + ' (narrow space, of the font space)'),
            linCalliSpaceMinEm: e(0.02, 'em', WS + ' (calligraphic space)'),
            linFontSpaceMinEm: e(0.15, 'em', WS + ' (gap of the font space)'),
            linFontSpaceShare: e(0.85, 'share', WS + ' (gap of the font space)'),
            linSpacedGapMinEm: e(0.15, 'em', WS + ' (spaced document)'),
            linSpacedGapOverLetterEm: e(0.12, 'em', WS + ' (spaced document)'),
            linZwnjGapShare: e(0.85, 'share', WS + ' (undrawn ZWNJ, of the font space)'),
            linZwnjSpaceDefEm: e(1, 'em', WS + ' (undrawn ZWNJ, no font space known)'),
            linZwnjGapMaxEm: e(0.3, 'em', WS + ' (undrawn ZWNJ)'),
            linSpaceOverInkPt: e(0.5, 'pt', WS + ' (space over letters)'),
            linSpaceOverNextEm: e(0.15, 'em', WS + ' (space over letters)'),
            linKashidaMinCount: e(2, 'count', F + '_kashidas'),
            linKashidaTolPt: e(0.5, 'pt', F + '_kashidas'),
            linSupSizeRatio: e(0.85, 'ratio', F + '_raisedDigits'),
            linSupRiseEm: e(0.15, 'em', F + '_raisedDigits'),
            linSubDropEm: e(0.08, 'em', F + '_raisedDigits'),
            linMonoAdvEm: e(0.6, 'em', F + '_codeRuns (no width known)'),
            linCodeSpanGapAdv: e(1.6, 'ratio', F + '_codeRuns (of a mono advance)'),
            linCodeIsolateMonoShare: e(0.9, 'share', F + '_logical'),
            // streamed columns (touching cells)
            linStreamMinSegs: e(10, 'count', SC),
            linStreamBaseEm: e(0.3, 'em', SC + ' (baselines)'),
            linStreamSpaceMinEm: e(0.05, 'em', SC + ' (drawn spaces)'),
            linStreamPitchEm: e(2.4, 'em', SC + ' (runs)'),
            linStreamSizeTolPt: e(0.8, 'pt', SC + ' (runs)'),
            linStreamOverlapShare: e(0.5, 'share', SC + ' (runs)'),
            linStreamMinRows: e(5, 'count', SC + ' (runs, bands)'),
            linStreamStepPt: e(0.25, 'pt', SC + ' (band resolution)'),
            linStreamBandMinPt: e(1, 'pt', SC + ' (bands)'),
            linStreamBandMaxEm: e(0.9, 'em', SC + ' (bands)'),
            linStreamSpaceTolPt: e(0.2, 'pt', SC + ' (bands)'),
            linStreamInkTolPt: e(0.3, 'pt', SC + ' (bands, cuts)'),
            linStreamMarkerShare: e(0.6, 'share', SC + ' (list markers)'),
            linStreamBothShare: e(0.9, 'share', SC + ' (bands)'),
            // 3.5 furniture: bands and zones (shares of the page)
            linBandTopShare: e(0.88, 'share', [FU, FE, FC]),
            linBandBottomShare: e(0.12, 'share', [FU, FE, FC]),
            linSideZoneShare: e(0.25, 'share', FU + ' zone'),
            linDeepBandTopShare: e(0.78, 'share', FE + ' (deep letterhead)'),
            linDeepBandBottomShare: e(0.22, 'share', FE + ' (deep letterhead)'),
            linPageNumApartEm: e(1.8, 'em', FU + ' (lone page number)'),
            linPageNumCutPt: e(2, 'pt', FU + ' (lone page number)'),
            linHeadRowBaseEm: e(0.3, 'em', FM + ' headRow'),
            linHeadRowMinCells: e(2, 'count', FM + ' headRow'),
            linHeadRowRowsEm: e(6, 'em', FM + ' headRow'),
            linHeadRowAlignPt: e(2, 'pt', FM + ' headRow'),
            linHeadRowCentreTolPt: e(4, 'pt', FM + ' headRow (centres, doubled)'),
            linArtifactShare: e(0.8, 'share', FM + ' (/Artifact)'),
            linTitleSizeTolPt: e(0.5, 'pt', FM + ' (one-page title)'),
            linTitleMinWords: e(4, 'count', FM + ' (one-page title)'),
            linTreeTrustMin: e(0.5, 'share', FM + ' (structure tree)'),
            linTreeNearEm: e(2, 'em', FM + ' (structure tree)'),
            linPieceGapEm: e(1.5, 'em', FE + ' pieces'),
            linPanelBaseEm: e(0.6, 'em', FE + ' (side panel)'),
            linPanelGapEm: e(2.5, 'em', FE + ' (side panel)'),
            linSideMinChars: e(5, 'count', FE + ' (side panel)'),
            linRepeatTolPt: e(4, 'pt', FE + ' repeats'),
            linRepeatMinPages: e(2, 'count', [FE + ' minRep', FD]),
            linRepeatShare: e(0.25, 'share', [FE + ' minRep', FD]),
            linShortMaxChars: e(5, 'count', FE + ' shortKey'),
            linShortSideMaxChars: e(6, 'count', FE + ' shortKey (side margin)'),
            linShortBucketPt: e(6, 'pt', FE + ' shortKey'),
            linInklessWEm: e(0.05, 'em', FE + ' inkless'),
            linInklessDefSizePt: e(10, 'pt', FE + ' inkless (no size)'),
            linRuleMinWidthShare: e(0.6, 'share', [FE + ' ruleCount', FC + ' bandRule']),
            linSideNumMinPages: e(3, 'count', FE + ' (side page numbers)'),
            linSideNumShare: e(0.8, 'share', FE + ' (side page numbers)'),
            linRuledRiseEm: e(0.5, 'em', FC + ' ruled / headTable'),
            linRuledReachEm: e(3, 'em', FC + ' ruled / headTable'),
            linRuledBaseEm: e(0.3, 'em', FC + ' ruled'),
            linRuledTolPt: e(1, 'pt', FC + ' ruled'),
            linHeadTableDepthEm: e(3, 'em', FC + ' headTable'),
            linHeadBaseEm: e(0.3, 'em', FC + ' (whole baseline)'),
            linBandCutPt: e(12, 'pt', FC + ' cutTop / cutBottom'),
            linFrameTolPt: e(1.5, 'pt', FC + ' framed / headFrame'),
            linRuleBandTopShare: e(0.85, 'share', FC + ' bandRule'),
            linRuleBandBottomShare: e(0.15, 'share', FC + ' bandRule'),
            linRectMinPt: e(3, 'pt', FD + ' (fills)'),
            linNoteMarkMaxPt: e(20, 'pt', FD + ' (footnote mark picture)'),
            linNoteMarkDropEm: e(0.3, 'em', FD + ' (footnote mark picture)'),
            linNoteMarkGapEm: e(1.5, 'em', FD + ' (footnote mark picture)'),
            linHoldsTextRiseEm: e(0.3, 'em', FD + ' holdsText'),
            linHoldsTextTolPt: e(1, 'pt', FD + ' holdsText'),
            // letter fields and the head's chunks
            linLetterHeadShare: e(0.75, 'share', LF + ' (head band)'),
            linFieldRowEm: e(0.5, 'em', LF + ' sameRow'),
            linFieldNearEm: e(6, 'em', LF + ' near'),
            linLabelMaxWords: e(4, 'count', LF + ' (label line)'),
            linFieldSideTolPt: e(1, 'pt', LF + ' (label and value)'),
            linFieldMaxChars: e(60, 'count', LF + ' (field)'),
            linLabelValueMaxWords: e(3, 'count', LF + ' (label: value)'),
            linFieldWrapEm: e(1.4, 'em', LF + ' (wrapped value)'),
            linFieldWrapAlignPt: e(1.5, 'pt', LF + ' (wrapped value)'),
            linFieldWrapSizeTolPt: e(0.6, 'pt', LF + ' (wrapped value)'),
            linFieldMinFound: e(2, 'count', LF + ' (fields)'),
            linFieldMinBare: e(2, 'count', LF + ' (labels added)'),
            linLabelGlyphEm: e(0.5, 'em', LF + ' (labels added: a letter)'),
            linLabelPunctEm: e(0.25, 'em', LF + ' (labels added: a space, a colon)'),
            linChunkOverlapEm: e(0.5, 'em', F + '_headChunks'),
            linChunkGapEm: e(2.2, 'em', F + '_headChunks')
        });
    })();

    Object.assign(PdfImporter.prototype, {
        // ── 3. lines ───────────────────────────────────────────────────
        _lines(page, fonts, emojiMap) {
            const v = this._visualLines(page, fonts, emojiMap);
            const s = this._segments(v.lines, v.glyphRows, v.spacedDoc, page);
            this._joinSegments(s.segs, page);
            this._streamColumns(s.segs, page);
            return this._finishRows(s.segs, page, { fonts: fonts, drawsSpaces: v.drawsSpaces, spaceEm: v.spaceEm, spacedDoc: v.spacedDoc,
                                                     lineWordGap: s.lineWordGap, letterGap: s.letterGap });
        },

        // 3a. the page's glyphs as records: emoji and dingbats read, a calligraphic font's letters on one baseline,
        // combining marks merged into the glyph they sit on
        _glyphRows(page, fonts, emojiMap) {
            const me = this, glyphRows = [];
            const calliBox = this._t('linCalliBoxEm', page), calliMin = this._t('linCalliMinGlyphs', page), calliSize = this._t('linCalliSizeTolPt', page),
                  calliRise = this._t('linCalliRiseEm', page), calliTouch = this._t('linCalliTouchEm', page);
            const strayW = this._t('linStrayAccentWEm', page), strayGap = this._t('linStrayAccentGapEm', page);
            const slantIt = this._t('linSlantItalic', page);
            const mWin = this._t('linMarkWindowGlyphs', page), mRise = this._t('linMarkHostRiseEm', page), mZero = this._t('linMarkZeroWEm', page),
                  mOff = this._t('linMarkOutlineOffsetEm', page), mPad = this._t('linMarkPadEm', page), mPadS = this._t('linMarkPadShare', page),
                  mPrev = this._t('linMarkPrevNearEm', page), mNear = this._t('linMarkNearEm', page), mEdge = this._t('linMarkEdgeTolPt', page);
            // a page whose text runs were placed from their untracked widths (calibration.js `drift`: each word moved to
            // its place by Td, its letters then condensed by Tz or spaced by Tc — Kelk's own PDFs condensed or tracked
            // afterwards, the net's tz85 / trackLoose): its words overlap or stand apart by the drift, glued «Designing
            // Resilient» into «DesigningResilient» and cut lines as columns. Its glyphs are laid out again untracked
            // (the page's own reading when it has thirty samples or more — a document that mixes layouts —, else the
            // document's: a page of a few lines reads its slope loosely, −0.3 for −1)
            const U = (function (cal) {
                const rg = cal && cal.regions && cal.regions[page.num], dr = rg && rg.drift && rg.drift.n >= me._t('linUntrackPageMinSamples', page) ? rg.drift : cal && cal.tracking && cal.tracking.drift;
                if (!dr || !dr.on) return null;
                me._fire('lines.untracked', page);
                return PdfImporter._calibrationInternal.untrack(page.glyphs);
            })(this._cal);
            page.glyphs.forEach(function (g0, gi) {
                const f = fonts[g0.font] || {};
                let ch = g0.ch;
                if (f.emoji && emojiMap && ch.length === 1 && ch.charCodeAt(0) >= 0xE000 && ch.charCodeAt(0) <= 0xF8FF) ch = emojiMap(ch) || ch;
                if (f.emoji) ch = emojiPresentation(ch);
                else ch = dingbat(f.realName || f.name, ch);
                // modifier letters that share their glyph with the closing quotes (Inter, Segoe UI): a font's
                // ToUnicode may name the modifier letter
                if (ch === '\u02EE') ch = '\u201D'; else if (ch === '\u02BC') ch = '\u2019';
                glyphRows.push({ ch: ch, pic: g0.pic, ink: g0.ink, x: U ? U.x[gi] : g0.x, w: U ? U.w[gi] : g0.w, y: g0.y, size: g0.size, color: g0.color, space: g0.space,
                                 font: g0.font, page: page.num, bold: !!f.bold || !!g0.inkBold, italic: !!f.italic || Math.abs(g0.slant || 0) > slantIt, mono: !!f.mono, strike: g0.inkStrike || undefined,
                                 struct: g0.struct,        // the structure tree's element (PdfImporter._structure), when the PDF is tagged
                                 artifact: g0.artifact, rot: g0.rot, cover: g0.cover, cid: g0.cid, formGuess: g0.formGuess, math: g0.math });   // math: a formula Kelk wrote with its TeX (extract.js _mathIn)   // marked /Artifact; turned (page furniture, §6a); a form read by width (extract.js)
            });
            // a calligraphic font's words (Nastaliq: a font box over 2.2 em tall) climb and fall letter by letter — they
            // sit on a slope, not a baseline: a letterhead's «بسمه تعالی» came apart into two lines, «بسمتل» over «ه عای»,
            // and «صلوات بر محمد و آل محمد», its last word set 6 pt up, read «محمد صلوات بر محمد و آل». Letters of one such
            // font and size that touch — within half an em in height, an em across, whatever order they are drawn in
            // (Prince draws a line's words out of order) — are one line, at their middle height
            (function () {
                // (or named so: Word's subset of IranNastaliq gives a box of 1.1 em — a plan's cover title came apart in pieces)
                const CALLI = /nastaliq|nastaleeq|shekasteh|diwani|thuluth|naskh\W*callig/i;
                const tall = function (g) { const f = fonts[g.font], b = f && f.font && f.font.bbox; return !!(b && (b[3] - b[1]) / 1000 > calliBox) || !!(f && CALLI.test(f.name || '')); };
                // (Arabic-script letters only: an emoji font's box is as tall, and its pictures on lines a pitch apart
                // were joined into one line)
                const gs = glyphRows.filter(function (g) { return tall(g) && !(fonts[g.font] || {}).emoji && (g.space || /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(g.ch)); });
                if (gs.length < calliMin) return;
                const parent = gs.map(function (_, k) { return k; });
                const find = function (k) { while (parent[k] !== k) k = parent[k] = parent[parent[k]]; return k; };
                for (let a = 0; a < gs.length; a++) for (let b = a + 1; b < gs.length; b++) {
                    const A = gs[a], B = gs[b];
                    if (A.font !== B.font || Math.abs(A.size - B.size) > calliSize || Math.abs(A.y - B.y) > calliRise * A.size) continue;
                    const gap = Math.max(A.x, B.x) - Math.min(A.x + A.w, B.x + B.w);
                    if (gap <= calliTouch * A.size) parent[find(a)] = find(b);
                }
                const comp = {};
                gs.forEach(function (g, k) { (comp[find(k)] = comp[find(k)] || []).push(g); });
                Object.keys(comp).forEach(function (k) {
                    const c = comp[k];
                    if (c.length < calliMin) return;
                    const ys = c.filter(function (g) { return !g.space; }).map(function (g) { return g.y; }).sort(function (u, v) { return u - v; });
                    if (ys.length < calliMin) return;
                    const y = ys[ys.length >> 1];
                    c.forEach(function (g) { g.y = y; });
                    me._fire('lines.calliBaseline', page);
                });
            })();
            // a letter of no width straight after an accented letter, at its end: the stray half of a cluster mapped as
            // one (LibreOffice draws "ế" as "ê" + an accent of no width and maps the accent to a letter — "Tiếhng")
            for (let i = glyphRows.length - 1; i > 0; i--) {
                const g = glyphRows[i], a = glyphRows[i - 1];
                if (g.space || g.w > strayW * g.size || !/^[a-z]$/.test(g.ch) || a.space || a.font !== g.font) continue;
                if (a.ch.length === 1 && a.ch.normalize('NFD').length > 2 && Math.abs(a.x + a.w - g.x) < strayGap * g.size) { glyphRows.splice(i, 1); this._fire('lines.strayAccentDropped', page); }
            }
            // combining marks → the base glyph drawn just before them (drawing order), else the
            // nearest glyph they overlap; GPOS-placed marks sit above / below the baseline
            const isMark = function (g) { return g.ch.length >= 1 && Array.from(g.ch).every(function (c) { return MARK_CH.test(c); }); };
            // the host: a glyph (drawn up to 8 glyphs before or after) whose box holds the mark's center —
            // the one whose center is nearest; else the glyph drawn just before, when close; else the nearest
            const kept = [], marks = [];
            glyphRows.forEach(function (g, i) { if (isMark(g)) marks.push(i); });
            const isHost = function (b, g) { return b && !b.space && !isMark(b) && Math.abs(b.y - g.y) < b.size * mRise; };
            const hostOf = {};
            marks.forEach(function (i) {
                // a zero-width mark is drawn to the right of its origin (its outline, not its advance)
                // (where the embedded font says its outline is, when it does: fonts differ — GDI's shadda in one
                // calligraphic font lies left of its origin, over the ی before it, in another to the right)
                const g = glyphRows[i], cx = g.ink ? g.x + (g.ink[0] + g.ink[1]) / 2 * g.size : g.w > mZero * g.size ? g.x + g.w / 2 : g.x + mOff * g.size;
                let inside = null, insideD = Infinity, near = null, nearD = Infinity;
                for (let k = Math.max(0, i - mWin); k <= Math.min(glyphRows.length - 1, i + mWin); k++) {
                    const b = glyphRows[k];
                    if (k === i || !isHost(b, g)) continue;
                    const pad = Math.min(mPad * b.size, b.w * mPadS);
                    if (cx >= b.x - pad && cx <= b.x + b.w + pad) {
                        const dc = Math.abs(cx - (b.x + b.w / 2));
                        if (dc < insideD) { insideD = dc; inside = k; }
                    }
                    const d = cx < b.x ? b.x - cx : cx > b.x + b.w ? cx - b.x - b.w : 0;
                    if (d < nearD) { nearD = d; near = k; }
                }
                let prev = i - 1; while (prev >= 0 && isMark(glyphRows[prev])) prev--;
                const pb = glyphRows[prev];
                const dp = pb && isHost(pb, g) ? (cx < pb.x ? pb.x - cx : cx > pb.x + pb.w ? cx - pb.x - pb.w : 0) : Infinity;
                let host = inside !== null ? inside : dp < g.size * mPrev ? prev : (near !== null && nearD < g.size * mNear ? near : null);
                // a Latin mark of no width whose origin is a boundary between two glyphs (none holds it) is the letter's
                // that ends there — its outline reaches back over it (Kelk / jsPDF draw "e" "," then U+0301 from the
                // comma's start; the accent stands on the e)
                if (g.w < mZero * g.size && /^[\u0300-\u036F]+$/.test(g.ch)) {
                    let inner = false, end = null, endD = mEdge;
                    for (let k = Math.max(0, i - mWin); k <= Math.min(glyphRows.length - 1, i + mWin); k++) {
                        const b = glyphRows[k];
                        if (k === i || !isHost(b, g)) continue;
                        if (g.x > b.x + mEdge && g.x < b.x + b.w - mEdge) inner = true;
                        const d = Math.abs(b.x + b.w - g.x);
                        if (/[\p{L}]/u.test(b.ch) && d < endD) { endD = d; end = k; }
                    }
                    if (!inner && end !== null) { host = end; me._fire('lines.latinMarkAtBoundary', page); }
                }
                if (host !== null) { hostOf[i] = host; me._fire('lines.markMerged', page); }
            });
            glyphRows.forEach(function (g, i) {
                if (i in hostOf) glyphRows[hostOf[i]].ch += g.ch;
                else kept.push(g);
            });
            glyphRows.length = 0; kept.forEach(function (g) { glyphRows.push(g); });
            return glyphRows;
        },

        // 3b. glyphs → visual lines: grouped by baseline, each line's glyphs in visual order
        _visualLines(page, fonts, emojiMap) {
            const me = this, glyphRows = this._glyphRows(page, fonts, emojiMap);
            const blBack = this._t('linBaselineLookback', page), blPt = this._t('linBaselineTolPt', page), blEm = this._t('linBaselineTolEm', page),
                  mainR = this._t('linMainTextRatio', page), markNear = this._t('linLineMarkNearEm', page);
            const drawsSpaces = glyphRows.filter(function (g) { return g.space; }).length > glyphRows.length * this._t('linDrawsSpacesShare', page);
            // each font's usual space (em): a narrow one is a ZWNJ only where its font's spaces are wider — a
            // calligraphic font's every space is 0.04 em (GDI, Microsoft Print to PDF), and they are spaces
            const spaceEm = {};
            (function () {
                const by = {}, minN = me._t('linSpaceEmMinSamples', page);
                glyphRows.forEach(function (g) { if (g.space && g.size > 0) (by[g.font] = by[g.font] || []).push(g.w / g.size); });
                Object.keys(by).forEach(function (f) { const a = by[f].sort(function (x, y) { return x - y; }); if (a.length >= minN) spaceEm[f] = a[a.length >> 1]; });
            })();
            // most word gaps hold a drawn space (in the whole document): then a gap without one means something
            const spacedDoc = this._spacedDoc !== undefined ? this._spacedDoc : glyphRows.filter(function (g) { return g.space; }).length > glyphRows.length * this._t('linSpacedDocShare', page);
            // group by baseline
            glyphRows.sort(function (a, b) { return b.y - a.y || a.x - b.x; });
            const lines = [];
            glyphRows.forEach(function (g) {
                if (!g.ch.trim() && g.ch !== '\u00A0') { g.space = true; }
                let L = null;
                for (let i = lines.length - 1; i >= 0 && i >= lines.length - blBack; i--) {
                    // (a turned glyph — a vertical tab's — joins no horizontal line, nor one of them a turned glyph's)
                    if (Math.abs(lines[i].y - g.y) < Math.max(blPt, blEm * Math.min(lines[i].size, g.size)) && !!lines[i].rot === !!g.rot) { L = lines[i]; break; }
                }
                if (!L) { L = { y: g.y, size: g.size, glyphs: [], rot: !!g.rot }; lines.push(L); }
                L.glyphs.push(g);
                // the baseline is that of the line's main (largest) text, not of a raised footnote mark
                if (!g.space && g.size > L.size * mainR) L.y = g.y;
                if (!g.space) L.size = Math.max(L.size, g.size);
            });
            lines.forEach(function (L) {
                L.glyphs.sort(function (a, b) { return a.x - b.x; });
                // combining marks (harakat, hamza above …) belong to the glyph they sit on:
                // merged into it, they keep their logical place when RTL runs are reversed
                const bases = L.glyphs.filter(function (g) { return !(g.ch.length === 1 && MARK_CH.test(g.ch)); });
                L.glyphs.forEach(function (g) {
                    if (!(g.ch.length === 1 && MARK_CH.test(g.ch))) return;
                    const cx = g.x + Math.max(g.w, 0.01) / 2;
                    let best = null, bd = Infinity;
                    bases.forEach(function (b) {
                        if (b.space) return;
                        const d = cx < b.x ? b.x - cx : cx > b.x + b.w ? cx - b.x - b.w : 0;
                        if (d < bd) { bd = d; best = b; }
                    });
                    if (best && bd < g.size * markNear) { best.ch += g.ch; me._fire('lines.lineMarkMerged', page); } else bases.push(g);
                });
                // (by centre: a zero-width glyph — a ZWNJ Word draws as a zero-advance space — sits at its neighbour's edge,
                // and by origin it fell on the wrong side of it: "‌همنظور" for "به‌منظور")
                L.glyphs = bases.sort(function (a, b) { return (a.x + a.w / 2) - (b.x + b.w / 2); });
            });
            return { glyphRows: glyphRows, lines: lines, drawsSpaces: drawsSpaces, spaceEm: spaceEm, spacedDoc: spacedDoc };
        },

        // 3c. visual lines → segments, cut at column and cell gaps (the line's word-gap rules are here)
        _segments(lines, glyphRows, spacedDoc, page) {
            // a baseline → segments: a wide gap (column gutter, table column) ends a segment
            const me = this, segs = [];
            const jMax = this._t('linJustGapMaxEm', page), jMin = this._t('linJustGapMinEm', page), jTol = this._t('linJustGapTol', page), jN = this._t('linJustGapMinCount', page);
            const owG = this._t('linOwnGapMinGlyphs', page), owN = this._t('linOwnGapMinWordGaps', page), wTol = this._t('lineWordGapTol', page),
                  wMin = this._t('lineWordGapMin', page), wJump = this._t('lineWordGapJump', page), wMax = this._t('lineWordGapMax', page);
            const spTol = this._t('linSpaceInGapTolPt', page), fillEm = this._t('linSpaceFillGapEm', page), fillS = this._t('linSpaceFillShare', page),
                  digEm = this._t('linDigitCellGapEm', page), monoEm = this._t('linMonoCellGapEm', page), cMin = this._t('linCellGapMinEm', page),
                  cOver = this._t('linCellGapOverLetterEm', page), wideEm = this._t('linWideGapEm', page), wideSp = this._t('linWideGapSpacedEm', page),
                  widePt = this._t('linWideGapMinPt', page), sjR = this._t('linSizeJumpRatio', page), sjG = this._t('linSizeJumpGapEm', page),
                  fmtW = this._t('linFormatCharWEm', page), rowCuts = this._t('linRowCellMinCuts', page);
            // a justified line stretches every word gap alike: a wide gap with two or more others of its width
            // (±15 %) on the line is a word gap, not a column's edge (Chrome / Edge draw no spaces in justified text)
            const justGap = function (L, gap, hi) {
                // (a line that draws its own spaces is not stretched this way: evenly spaced table cells are no justified line)
                // (unless every wide gap of it holds a drawn space: Chrome draws a justified line's spaces at their own
                // width and stretches the gaps by moving the words — letter-spaced type in a narrow column, four words
                // 1.9 em apart, «package · ships · its · own · type» cut into five pieces; table cells' gaps vary with
                // their text, and a cell's trailing space stands in few of them)
                if (gap > jMax * hi) return false;
                if (!L._gaps) {
                    L._gaps = []; L._gapsSp = true;
                    let last = null, sp = false;
                    L.glyphs.forEach(function (g) {
                        if (g.space) { sp = true; return; }
                        if (last) { const d = g.x - (last.x + last.w); if (d > jMin * g.size) { L._gaps.push(d); if (!sp) L._gapsSp = false; } }
                        last = g; sp = false;
                    });
                }
                if (drawsOwnSpaces(L) && !L._gapsSp) return false;
                const just = L._gaps.filter(function (d) { return Math.abs(d - gap) <= jTol * gap; }).length >= jN;
                if (just) me._fire('lines.justifiedGap', page);
                return just;
            };
            const edges = this._cellEdges(lines, glyphRows, page), runEnd = edges.runEnd, columnEdge = edges.columnEdge;
            // the line itself draws its word spaces (a justified line, or a font that never draws them, does not:
            // its gaps are word gaps whatever their width)
            const drawsOwnSpaces = function (L) {
                if (L._ds === undefined) L._ds = L.glyphs.some(function (g, i) { return g.space && i > 0 && i < L.glyphs.length - 1 && !L.glyphs[i - 1].space && !L.glyphs[i + 1].space; });
                return L._ds;
            };
            // the usual gap between two letters of a line (kerning, letter spacing)
            // a line that draws no space glyph: its own word gap, from its own gaps (PDFIMPORT.md §6, "Word gaps from
            // the line"). Prince and InDesign set some lines with space glyphs and position the words of others by
            // gaps alone (a justified line: 0.21–0.25 em, its letters 0) — the page's rule for files that draw their
            // spaces (0.45 em) glued every word of those lines. The gaps must part in two: letter gaps around the
            // line's median, then a jump of 0.07 em or more to three or more gaps of 0.1 em or more (a few ZWNJ gaps
            // in a word or two are no such line). Returns the threshold in em, or null: the page's rules stand.
            const lineWordGap = function (L) {
                if (L._wg !== undefined) return L._wg;
                const ink = L.glyphs.filter(function (g) { return !g.atom; });
                const inner = ink.slice(1, -1);
                if (inner.some(function (g) { return g.space; }) || ink.filter(function (g) { return !g.space; }).length < owG) return (L._wg = null);
                const d = [];
                for (let i = 1; i < ink.length; i++) {
                    const a = ink[i - 1], b = ink[i];
                    if (a.space || b.space) continue;
                    d.push((b.x - (a.x + a.w)) / Math.min(a.size, b.size));
                }
                d.sort(function (a, b) { return a - b; });
                const m = median(d);
                let lo = -Infinity, k = 0;
                while (k < d.length && d[k] <= m + wTol) { lo = d[k]; k++; }
                const up = d.slice(k).filter(function (x) { return x < wMax; });
                if (up.length < owN || up[0] < wMin || up[0] - lo < wJump) return (L._wg = null);
                me._fire('lines.ownWordGap', page);
                return (L._wg = (lo + up[0]) / 2);
            };
            const letterGap = function (L) {
                if (L._lg !== undefined) return L._lg;
                const d = [];
                for (let i = 1; i < L.glyphs.length; i++) {
                    const a = L.glyphs[i - 1], b = L.glyphs[i];
                    if (!a.space && !b.space) d.push(Math.max(0, b.x - (a.x + a.w)));
                }
                return (L._lg = d.length ? median(d) : 0);
            };
            // a list bullet alone at the line's start (Word's "o" in Courier New, "•", "▪"): the gap after it is the
            // list's indent, not a cell boundary
            const bulletLead = function (L, g) {
                const first = L.glyphs.filter(function (x) { return !x.space; })[0];
                return first === g && /^[o•◦▪▫■□●○‣⁃∙·\-–*+§]$/.test(g.ch || '');
            };
            const mixedLine = function (L) {
                if (L._mx === undefined) L._mx = L.glyphs.some(function (g) { return !g.space && g.mono; }) && L.glyphs.some(function (g) { return !g.space && !g.mono; });
                return L._mx;
            };
            lines.forEach(function (L) {
                let cur = null, lastInk = null, lastAt = -1, cuts = 0;
                const first = segs.length;
                L.glyphs.forEach(function (g, gi) {
                    if (!g.space && lastInk) {
                        const gap = g.x - (lastInk.x + lastInk.w), lo = Math.min(g.size, lastInk.size), hi = Math.max(g.size, lastInk.size);
                        // a wide gap, or a word-sized gap where the type size jumps (a title and its subtitle on one baseline)
                        // a drawn space in the gap (justified text stretches it) is a word space unless very wide
                        // (or between the two in the line's order: Quartz sets a space back into the comma before it)
                        const sp = L.glyphs.filter(function (s2, si) { return s2.space && s2.x < g.x && (s2.x >= lastInk.x + lastInk.w - spTol || (si > lastAt && si < gi)); });
                        // a drawn space that fills little of a wide gap does not explain it (a cell's trailing space)
                        const spW = sp.reduce(function (a, s2) { return a + s2.w; }, 0);
                        const spaced = sp.length > 0 && !(gap > fillEm * hi && spW < fillS * gap);
                        // figures with a wide undrawn gap between them are cells of a column ("120   135")
                        const digits = !spaced && /[0-9]/.test(lastInk.ch) && /[0-9]/.test(g.ch) && gap > digEm * hi;
                        // a file that draws its word spaces (browsers, office suites) draws none between two table cells:
                        // an undrawn gap of a third of an em there is a cell boundary (a bare HTML table: 3 pt apart)
                        // (measured against the line's own letter gaps: letter-spaced type has wide gaps everywhere)
                        // (a code cell beside a text cell too — one side monospace, the gap a third of an em: no inline
                        // code chip sits that far from its text without a drawn space; two code cells side by side only on
                        // a line that has text too: a line all in code is a code block's, its columns those of the font)
                        const monoOk = (!lastInk.mono && !g.mono || (gap > monoEm * hi && (lastInk.mono !== g.mono || mixedLine(L)))) && !bulletLead(L, lastInk);
                        const cellGap = spacedDoc && !spaced && gap > Math.max(cMin * hi, letterGap(L) + cOver * hi) && monoOk && !justGap(L, gap, hi) && columnEdge(L, lastInk.x + lastInk.w, g.x, gap, lastInk.font, runEnd(L, g));
                        if (digits || cellGap || gap > Math.max((spaced ? wideSp : wideEm) * hi, widePt) && !justGap(L, gap, hi) || (hi >= sjR * lo && gap > sjG * lo)) {
                            if (cellGap || digits) cuts++;
                            me._fire(digits ? 'lines.cutDigits' : cellGap ? 'lines.cutCell' : hi >= sjR * lo && gap > sjG * lo ? 'lines.cutSizeJump' : 'lines.cutWideGap', page);
                            cur = null; var cellCut = cellGap || digits;
                        }
                    }
                    if (!cur) { cur = { y: L.y, size: L.size, glyphs: [], cell: !!cellCut }; segs.push(cur); cellCut = false; }
                    cur.glyphs.push(g);
                    // (a zero-width format character — ZWNJ, ZWJ, ZWSP — has no ink and no extent: no gap is measured from it)
                    if (!g.space && !(g.w < fmtW * g.size && /^[\u200B-\u200F\u2060\uFEFF]+$/.test(g.ch))) { lastInk = g; lastAt = gi; }
                });
                // (a line cut at two cell boundaries or more is a row of cells, its first piece too — `rowCell`: a borderless
                // table's bold header row «السنة · الإنتاج · … · الفاقد», read as headings once the bold showed; two pieces
                // may be two columns' headings on one baseline, and stay as they were)
                if (cuts >= rowCuts) { for (let k = first; k < segs.length; k++) segs[k].rowCell = true; me._fire('lines.rowCell', page); }
            });
            return { segs: segs, lineWordGap: lineWordGap, letterGap: letterGap };
        },

        // 3c, the evidence of a cell boundary: word edges that line up with other rows (for _segments)
        _cellEdges(lines, glyphRows, page) {
            const edgeGap = this._t('linWordEdgeGapEm', page), runGap = this._t('linRunEndGapEm', page), spMin = this._t('linSpaceWMinEm', page),
                  alignPt = this._t('linEdgeAlignTolPt', page), rowsEm = this._t('linEdgeRowsNearEm', page), spF = this._t('linSpaceGapFactor', page),
                  minRows = this._t('linEdgeMinRows', page), minRowsSp = this._t('linEdgeMinRowsSpace', page), rtlTol = this._t('linRtlMarginTolPt', page);
            // a cell boundary lines up with other rows: the text after it starts (left-aligned cells) or the text
            // before it ends (right-aligned numbers) at the same x on two other lines at least
            const wordEdges = { starts: [], ends: [] };
            lines.forEach(function (L, li) {
                let last = null;
                L.glyphs.forEach(function (g) {
                    if (g.space) return;
                    if (!last || g.x - (last.x + last.w) > edgeGap * g.size) { wordEdges.starts.push([g.x, li]); if (last) wordEdges.ends.push([last.x + last.w, li]); }
                    last = g;
                });
                if (last) wordEdges.ends.push([last.x + last.w, li]);
            });
            // the end of the run of words that starts at glyph g (up to the next wide undrawn gap)
            const runEnd = function (L, g) {
                const gs = L.glyphs; let i = gs.indexOf(g), last = g;
                for (i = i + 1; i < gs.length; i++) {
                    const h = gs[i]; if (h.space) continue;
                    if (h.x - (last.x + last.w) > runGap * h.size) break;
                    last = h;
                }
                return last.x + last.w;
            };
            // a font's drawn word space (a gap no wider is a space left undrawn, unless many rows line up with it)
            const spaceW = {};
            glyphRows.forEach(function (g) { if (g.space && g.w > spMin * g.size) (spaceW[g.font] = spaceW[g.font] || []).push(g.w); });
            Object.keys(spaceW).forEach(function (k) { spaceW[k] = median(spaceW[k]); });
            const columnEdge = function (L, endX, startX, gap, font, nextEnd) {
                const li = lines.indexOf(L);
                // rows near this one (a table's rows follow each other; LibreOffice sets them five lines apart)
                const count = function (arr, x) { const seen = {}; arr.forEach(function (e) { if (e[1] !== li && Math.abs(e[0] - x) < alignPt && Math.abs(lines[e[1]].y - L.y) < rowsEm * L.size) seen[e[1]] = 1; }); return Object.keys(seen).length; };
                const need = spaceW[font] && gap <= spF * spaceW[font] ? minRowsSp : minRows;
                // the cell after the gap lines up (by its start, or by its end when right-aligned) on two other rows; the
                // text before it, ending at one x on others, is weaker evidence (short words end alike: "A", "An")
                // (not by an end at the line's own end in a right-to-left line: there every line ends at the margin —
                // a link and the bold word after it, a word space apart, were cut as two cells beside a float)
                if (L._rtl === undefined) { let r = 0, l = 0; L.glyphs.forEach(function (g) { if (R_CH.test(g.ch)) r++; else if (/\p{L}/u.test(g.ch)) l++; }); L._rtl = r > l; }
                const lineEnd = Math.max.apply(null, L.glyphs.map(function (g) { return g.x + g.w; }));
                const atMargin = L._rtl && nextEnd !== undefined && nextEnd >= lineEnd - rtlTol;
                const before = count(wordEdges.ends, endX), after = Math.max(count(wordEdges.starts, startX), nextEnd !== undefined && !atMargin ? count(wordEdges.ends, nextEnd) : 0);
                return after >= minRows || before >= need;
            };
            return { runEnd: runEnd, columnEdge: columnEdge };
        },

        // 3d. segments that belong together meet again: raised marks, badges, list markers, numbers set off by a tab
        _joinSegments(segs, page) {
            const me = this, t = function (n) { return me._t(n, page); };
            const rSize = t('linRaisedSizeRatio'), subN = t('linSubtitleMinGlyphs'), subBase = t('linSubtitleBaseEm'), ov = t('linJoinOverlapPt'),
                  rTouch = t('linRaisedTouchEm'), rRiseT = t('linRaisedRiseTouchEm'), rRise = t('linRaisedRiseEm'), rWithin = t('linRaisedWithinTolPt'),
                  rGap = t('linRaisedGapEm'), jBase = t('linRejoinBaseEm'), jGap = t('linRejoinGapEm'), jGapPt = t('linRejoinGapPt'), sjR = t('linSizeJumpRatio');
            const bMax = t('linBadgeMaxGlyphs'), bTol = t('linBadgeBoxTolPt'), bMinH = t('linBadgeBoxMinHEm'), bMaxW = t('linBadgeBoxMaxWEm'),
                  bPad = t('linBadgeBoxPadEm'), bMaxH = t('linBadgeBoxMaxHEm'), bBase = t('linBadgeBaseEm'), bGap = t('linBadgeGapEm');
            const mkBase = t('linMarkerBaseEm'), mkSize = t('linMarkerHostSizeRatio'), mkMax = t('linMarkerTabMaxEm'),
                  ntBase = t('linNumTabBaseEm'), ntSize = t('linNumTabSizeTolPt'), ntMin = t('linNumTabMinEm'), ntMax = t('linNumTabMaxEm'),
                  lbBase = t('linLoneBulletBaseEm'), lbGap = t('linLoneBulletGapEm');
            // a small segment raised or lowered next to a larger one (footnote mark, index) joins it
            const ink = function (S) { const v = S.glyphs.filter(function (g) { return !g.space; }); return v.length ? { x0: v[0].x, x1: v[v.length - 1].x + v[v.length - 1].w, size: Math.max.apply(null, v.map(function (g) { return g.size; })) } : null; };
            segs.forEach(function (S) { S.ink = ink(S); });
            segs.forEach(function (S) {
                if (!S.ink || S.joined) return;
                const host = segs.filter(function (T) {
                    if (T === S || !T.ink || T.joined || S.ink.size >= T.ink.size * rSize) return false;
                    // a long run on the same baseline is text of its own (a subtitle), not a mark
                    if (S.glyphs.filter(function (g) { return !g.space; }).length > subN && Math.abs(S.y - T.y) < subBase * T.ink.size) return false;
                    const gapR = S.ink.x0 - T.ink.x1, gapL = T.ink.x0 - S.ink.x1;
                    // a browser raises a citation ("[24]") further: allowed when it touches the line's end / start
                    const touching = (gapR > -ov && gapR < rTouch * T.ink.size) || (gapL > -ov && gapL < rTouch * T.ink.size);
                    if (Math.abs(S.y - T.y) > (touching && S.y > T.y ? rRiseT : rRise) * T.ink.size) return false;
                    // or inside the line, in a gap between its letters (a footnote mark after a word)
                    const within = S.ink.x0 > T.ink.x0 && S.ink.x1 < T.ink.x1 && !T.glyphs.some(function (g) { return !g.space && g.x < S.ink.x1 - rWithin && g.x + g.w > S.ink.x0 + rWithin; });
                    return within || (gapR > -ov && gapR < rGap * T.ink.size) || (gapL > -ov && gapL < rGap * T.ink.size);
                })[0];
                if (host) { host.glyphs = host.glyphs.concat(S.glyphs).sort(function (a, b) { return a.x - b.x; }); S.joined = true; host.ink = ink(host); host.raised = true; me._fire('lines.raisedJoined', page); }
            });
            // segments that a raised mark had kept apart ("CSS,[15] while …") meet again
            const live = segs.filter(function (S) { return S.ink && !S.joined; }).sort(function (a, b) { return a.y - b.y || a.ink.x0 - b.ink.x0; });
            for (let i = 0; i + 1 < live.length; i++) {
                const A = live[i], B = live[i + 1];
                if (A.joined || (B.cell && !A.raised) || Math.abs(A.y - B.y) > jBase * Math.min(A.ink.size, B.ink.size)) continue;
                const gap = B.ink.x0 - A.ink.x1, hi = Math.max(A.ink.size, B.ink.size), lo = Math.min(A.ink.size, B.ink.size);
                if (gap < -ov || gap > Math.max(jGap * hi, jGapPt) || hi >= sjR * lo) continue;
                B.glyphs = A.glyphs.concat(B.glyphs).sort(function (a, b) { return a.x - b.x; }); A.joined = true; B.ink = ink(B);
                this._fire('lines.rejoined', page);
            }
            // a badge (a short number / label in a small box) on the baseline of the larger text after it: "01 Headings"
            const boxes = (page.rects || []).concat(page.small || []);
            segs.forEach(function (S) {
                if (!S.ink || S.joined) return;
                const n = S.glyphs.filter(function (g) { return !g.space; });
                if (n.length > bMax || !n.every(function (g) { return /^[\p{L}\p{N}]+$/u.test(g.ch); })) return;
                const box = boxes.filter(function (r) {
                    return r.x0 <= S.ink.x0 + bTol && r.x1 >= S.ink.x1 - bTol && r.y0 <= S.y + bTol && r.y1 >= S.y + S.ink.size * bMinH &&
                           r.x1 - r.x0 < Math.min(S.ink.size * bMaxW, S.ink.x1 - S.ink.x0 + bPad * S.ink.size) && r.y1 - r.y0 < S.ink.size * bMaxH;
                })[0];
                if (!box) return;
                const host = segs.filter(function (T) {
                    if (T === S || !T.ink || T.joined || T.ink.size < S.ink.size) return false;
                    const gap = T.ink.x0 - box.x1;
                    return Math.abs(S.y - T.y) < bBase * T.ink.size && gap > -bTol && gap < bGap * T.ink.size;
                })[0];
                if (host) { S.glyphs.forEach(function (g) { g.badge = true; }); host.glyphs = S.glyphs.concat(host.glyphs); S.joined = true; host.ink = ink(host); me._fire('lines.badgeJoined', page); }
            });
            // a list marker set off by a tab ("•⇥text", "1.⇥text": word processors) belongs to its text
            segs.forEach(function (S) {
                if (!S.ink || S.joined) return;
                const t = S.glyphs.filter(function (g) { return !g.space; }).map(function (g) { return g.ch; }).join('');
                // right to left: the bullet at the right of its text (Word, an RTL list: "text ⇥•"), nothing beyond it
                if ((/^[\u2022\u25E6\u25AA\u25AB\u25CF\u25CB\u25A0\u25A1\u27A2\u2713\u2714]$/.test(t) || (t === 'o' && S.glyphs.some(function (g) { return g.mono; }))) &&
                    !segs.some(function (T) { return T !== S && T.ink && !T.joined && Math.abs(T.y - S.y) < mkBase * S.ink.size && T.ink.x0 > S.ink.x1; })) {
                    const text = segs.filter(function (T) {
                        if (T === S || !T.ink || T.joined || T.ink.size < mkSize * S.ink.size) return false;
                        const gap = S.ink.x0 - T.ink.x1;
                        return Math.abs(S.y - T.y) < mkBase * T.ink.size && gap > 0 && gap < mkMax * T.ink.size && T.glyphs.some(function (g) { return R_CH.test(g.ch); });
                    }).sort(function (a, b) { return b.ink.x1 - a.ink.x1; })[0];
                    if (text) { text.glyphs = text.glyphs.concat(S.glyphs); S.joined = true; text.ink = ink(text); me._fire('lines.rtlMarkerJoined', page); return; }
                }
                if (!/^([\u2022\u25E6\u25AA\u25AB\u2023\u2043\u2013\u2014\u00B7\u25CF\u25CB\u25A0\u25A1\u25BA\u27A2\u2713\u2714\-*]|\(?(\d{1,3}|[a-zA-Z]|[ivxlcdmIVXLCDM]{1,5})[.)])$/.test(t)) return;
                if (segs.some(function (T) { return T !== S && T.ink && !T.joined && Math.abs(T.y - S.y) < mkBase * S.ink.size && T.ink.x1 < S.ink.x0; })) return;
                const host = segs.filter(function (T) {
                    if (T === S || !T.ink || T.joined || T.ink.size < mkSize * S.ink.size) return false;
                    const gap = T.ink.x0 - S.ink.x1;
                    return Math.abs(S.y - T.y) < mkBase * T.ink.size && gap > 0 && gap < mkMax * T.ink.size;
                })[0];
                if (host) { host.glyphs = S.glyphs.concat(host.glyphs); S.joined = true; host.ink = ink(host); me._fire('lines.markerJoined', page); }
            });
            // a bare number set off by a tab-wide gap ("1⇥Book contractors": ReportLab, some word processors)
            segs.forEach(function (S) {
                if (!S.ink || S.joined) return;
                const t = S.glyphs.filter(function (g) { return !g.space; }).map(function (g) { return g.ch; }).join('');
                if (!/^\d{1,3}$/.test(t)) return;
                if (segs.some(function (T) { return T !== S && T.ink && !T.joined && Math.abs(T.y - S.y) < ntBase * S.ink.size && T.ink.x1 < S.ink.x0; })) return;
                const host = segs.filter(function (T) {
                    if (T === S || !T.ink || T.joined || Math.abs(T.ink.size - S.ink.size) > ntSize) return false;
                    const gap = T.ink.x0 - S.ink.x1;
                    return Math.abs(S.y - T.y) < ntBase * T.ink.size && gap > ntMin * T.ink.size && gap < ntMax * T.ink.size && /^\p{Lu}/u.test(T.glyphs.filter(function (g) { return !g.space; })[0].ch);
                })[0];
                if (host) { host.glyphs = S.glyphs.concat(host.glyphs); S.joined = true; host.ink = ink(host); host.numTab = true; me._fire('lines.numTabJoined', page); }
            });
            // a lone bullet or dash cut off from its item at a small gap (Prince: «-» a few points right of the item's
            // first word, its own column cut — the items read as one paragraph «-معاون … -رئیس …»): one line again
            segs.forEach(function (S) {
                if (!S.ink || S.joined) return;
                const t = S.glyphs.filter(function (g) { return !g.space; }).map(function (g) { return g.ch; }).join('');
                if (!/^[-\u2013\u2022\u25AA\u25CF\u00B7*]$/.test(t)) return;
                const host = segs.filter(function (T) {
                    if (T === S || !T.ink || T.joined || Math.abs(T.y - S.y) > lbBase * T.ink.size) return false;
                    const gap = Math.max(T.ink.x0 - S.ink.x1, S.ink.x0 - T.ink.x1);
                    return gap >= 0 && gap < lbGap * T.ink.size;
                })[0];
                if (host) { host.glyphs = host.ink.x0 > S.ink.x1 ? S.glyphs.concat(host.glyphs) : host.glyphs.concat(S.glyphs); S.joined = true; host.ink = ink(host); me._fire('lines.loneBulletJoined', page); }
            });
        },

        // 3e. segments → the page's lines: word spaces and ZWNJs, kashidas, finishLine, raised digits, code runs
        _finishRows(segs, page, o) {
            const me = this;
            const fTouch = this._t('linFormTouchEm', page), fApart = this._t('linFormApartEm', page), fSeen = this._t('linFormMinSeen', page), inkW = this._t('linInklessWPt', page);
            const AR =/[\u0620-\u064A\u066E-\u06D3\u06FA-\u06FC\uFB50-\uFDFF\uFE70-\uFEFC]/;
            // (a ZWNJ found here — a space with no room — tells the file draws its ZWNJs: no «می» guessing, §6)
            let zwnjSeen = false;
            const rows = segs.filter(function (S) { return !S.joined; });
            // a ZWNJ the file did not draw, read from which glyph it drew (PDFIMPORT.md §4, "Shapes by use"): a font whose
            // glyphs are named by their base letters (Prince's ToUnicode: «ه» for every form) hides the shapes, but its
            // glyph numbers do not — a dual-joining letter's glyph seen at the end of words as often as inside them is
            // its final or isolated form, and drawn touching a letter after it, a ZWNJ stood between them
            // («بهروزرسانی», «توسعههای», «نرمافزاری» in a Prince letter). Right-to-left: the next letter is the one left of it
            const AR0 = /^[\u0620-\u064A\u067E\u0686\u0698\u06A9\u06AF\u06CC]$/;
            // (a glyph already named by its form — read from the font's glyph order, extract.js — is its letter here)
            const baseL = function (c, g) { return PF[c] && (!g || g.formGuess) ? PF[c][0] : c; };
            // (and the letter after it the same way: a glyph seen at the start of words — after a space, or after a letter
            // that never joins forward — as often as after a joining one is its initial or isolated form)
            const formEnd = {}, formStart = {};
            (function () {
                const se = {}, ss = {};
                const touch = function (a, b) { return a && b && !a.space && !b.space && AR0.test(baseL(a.ch, a)) && AR0.test(baseL(b.ch, b)) && Math.abs(b.x - (a.x + a.w)) < fTouch * b.size; };
                const apart = function (a, b) { return !a || a.space || b.x - (a.x + a.w) > fApart * b.size; };
                rows.forEach(function (L) {
                    const gs = L.glyphs;
                    for (let i = 0; i < gs.length; i++) {
                        const g = gs[i];
                        if (g.space || g.cid === undefined || !AR0.test(baseL(g.ch, g))) continue;
                        const k = g.font + '|' + g.cid, left = gs[i - 1], right = gs[i + 1];
                        if (DUAL_L.test(baseL(g.ch, g))) {
                            const e = se[k] || (se[k] = { end: 0, mid: 0 });
                            if (touch(left, g)) e.mid++; else if (apart(left, g)) e.end++;
                        }
                        const st0 = ss[k] || (ss[k] = { start: 0, mid: 0 });
                        if (right && touch(g, right) && DUAL_L.test(baseL(right.ch, right))) st0.mid++;
                        else if (!right || apart(g, right) || touch(g, right) && !DUAL_L.test(baseL(right.ch, right))) st0.start++;
                    }
                });
                Object.keys(se).forEach(function (k) { if (se[k].end >= fSeen && se[k].end >= se[k].mid) formEnd[k] = true; });
                Object.keys(ss).forEach(function (k) { if (ss[k].start >= fSeen && ss[k].start >= ss[k].mid) formStart[k] = true; });
            })();
            rows.forEach(function (L) {
                const ws = me._wordSpaces(L, { fonts: o.fonts, drawsSpaces: o.drawsSpaces, spaceEm: o.spaceEm, spacedDoc: o.spacedDoc,
                                               lineWordGap: o.lineWordGap, letterGap: o.letterGap, AR: AR, AR0: AR0, baseL: baseL,
                                               formEnd: formEnd, formStart: formStart, page: page });
                const gl = ws.gl;
                if (ws.zwnj) zwnjSeen = true;
                me._kashidas(gl, AR, page);
                while (gl.length && gl[0].space) gl.shift();
                while (gl.length && gl[gl.length - 1].space) gl.pop();
                L.glyphs = gl;
                finishLine(L, page.num);
                me._raisedDigits(L, page);
                me._codeRuns(gl, page);
            });
            if (zwnjSeen) this._hasZwnj = true;
            // (a row of nothing drawn — a lone zero-width ZWNJ Acrobat's PDFMaker sets at a run's start, a segment of its
            // own — is no line: joined to its cell's text it put a space before a word's last letter, «وضعی ت»)
            return rows.filter(function (L) { return L.glyphs.some(function (g) { return !g.space && !(/^[\u200B-\u200F\u2060\uFEFF]$/.test(g.ch) && !(g.w > inkW)); }); });
        },

        // 3e, one row: spaces from the gaps between glyph runs; ZWNJs drawn, undrawn or read from the glyphs' forms
        _wordSpaces(L, o) {
            const { fonts, drawsSpaces, spaceEm, spacedDoc, lineWordGap, letterGap, AR, AR0, baseL, formEnd, formStart, page } = o;
            const me = this, t = function (n) { return me._t(n, page); };
            const nsGap = t('linNoSpaceLineGapEm'), nsN = t('linNoSpaceLineMinGaps'), zsMin = t('linZwnjSpaceMinEm'), zsRoom = t('linZwnjSpaceRoomShare'),
                  nrS = t('linNoRoomShare'), chMin = t('linChainSpaceMinEm'), chTol = t('linChainTolEm'), chAdv = t('linChainAdvShare'), chPast = t('linChainPastPrevEm'),
                  nar = t('linNarrowSpaceEm'), narOwn = t('linNarrowOwnShare'), calMin = t('linCalliSpaceMinEm'), wg = t('wordGapEm'), wgb = t('wordGapBareEm'),
                  fsMin = t('linFontSpaceMinEm'), fsS = t('linFontSpaceShare'), sc = t('scriptChangeGapEm'), sdMin = t('linSpacedGapMinEm'),
                  sdOver = t('linSpacedGapOverLetterEm'), zwS = t('linZwnjGapShare'), zwDef = t('linZwnjSpaceDefEm'), zwMax = t('linZwnjGapMaxEm'),
                  ovInk = t('linSpaceOverInkPt'), ovNext = t('linSpaceOverNextEm'), fTouch = t('linFormTouchEm');
            let zwnj = false;
            // spaces from gaps between glyph runs
            const gl = [];
            // (a line that draws no space while the page does, its words apart by gaps of a space or more: a text box
            // that left its spaces out — PowerPoint, one quote drawn with its spaces and the one above it without —
            // its gaps are word breaks, not the ZWNJs of a file that draws its spaces: «مرور‌کارهای‌هفته»)
            let draws = drawsSpaces;
            // (a font's own space, or its neighbour's, or the line's: a Latin run in its own font draws no space —
            // «Open Data Kit 2» in a Persian slide, its words a third of an em apart, read «OpenDataKit2»)
            const lineSp = L.glyphs.filter(function (g) { return g.space && g.size > 0 && g.w > 0; }).map(function (g) { return g.w / g.size; }).sort(function (x, y) { return x - y; });
            const sEm = function (a, b) { return spaceEm[a.font] || spaceEm[b.font] || (lineSp.length ? lineSp[lineSp.length >> 1] : 0); };
            if (draws && !L.glyphs.some(function (g) { return g.space; })) {
                let wide = 0;
                for (let k = 1; k < L.glyphs.length; k++) { const a = L.glyphs[k - 1], b = L.glyphs[k]; if (b.x - (a.x + a.w) > nsGap * Math.min(a.size, b.size)) wide++; }
                if (wide >= nsN) { draws = false; me._fire('lines.lineWithoutSpaces', page); }
            }
            L.glyphs.forEach(function (g, i) {
                // a glyph named ZWNJ that leaves room for itself is a space: LibreOffice's subset fonts share one glyph
                // between the two and its ToUnicode names it U+200C — a space's neighbours stand its width apart
                // (0.27 em), a ZWNJ's touch (the next letter drawn at the ZWNJ's own x). pdftotext reads them so too.
                if (g.ch === '\u200C' && !g.zwnj && g.w >= zsMin * g.size) {
                    let lft = null, rgt = null;
                    for (let k = i - 1; k >= 0 && !lft; k--) if (L.glyphs[k].ch !== '\u200C') lft = L.glyphs[k];
                    for (let k = i + 1; k < L.glyphs.length && !rgt; k++) if (L.glyphs[k].ch !== '\u200C') rgt = L.glyphs[k];
                    if (lft && rgt && rgt.x - (lft.x + lft.w) >= zsRoom * g.w) { g = Object.assign({}, g, { ch: ' ', space: true }); me._fire('lines.zwnjGlyphAsSpace', page); }
                }
                const prev = gl[gl.length - 1];
                // a "space" glyph with no width between two Arabic letters is a ZWNJ
                // (or one that leaves no room: Firefox draws the ZWNJ as a space of full width whose neighbours touch —
                // «پراستفاده ترین» for «پراستفاده‌ترین»; a real space has its width of room)
                const nx = L.glyphs[i + 1];
                // (a space whose own advance the next glyph follows is a space, however tight: InDesign's justified
                // line draws the letter before it narrower than its width — «مبلغ قرارداد به حساب»)
                const noRoom = g.space && prev && nx && !prev.space && !nx.space && nx.x - (prev.x + prev.w) < nrS * g.w &&
                    !(g.w > chMin * g.size && Math.abs(nx.x - (g.x + g.w)) < chTol * g.size && nx.x - g.x > chAdv * g.w);
                // (a calligraphic font's space, by its name, is a space however narrow: Word's IranNastaliq draws it 0.04 em
                // wide, and a title of two or three words gives no count of its spaces — «طرح‌نامه‌نمونه»)
                const calliF = fonts[g.font] && /nastaliq|nastaleeq|shekasteh|diwani|thuluth/i.test(fonts[g.font].name || '');
                const narrow = g.w < nar * g.size && !(spaceEm[g.font] < nar && g.w > narOwn * spaceEm[g.font] * g.size) && !(calliF && g.w > calMin * g.size);
                if (g.space && (narrow || noRoom) && prev && AR.test(prev.ch.slice(-1)) && nx && AR.test(nx.ch.charAt(0))) {
                    zwnj = true; me._fire('lines.zwnjFromSpace', page);
                    gl.push(Object.assign({}, g, { ch: '\u200C', space: false, zwnj: true })); return;
                }
                // a gap with no space glyph is a word break; in files that draw their spaces only a wide one
                // (tab stop, column), else kerning would split words
                const gp = prev ? g.x - (prev.x + prev.w) : 0;
                const own = lineWordGap(L);
                if (prev && !prev.space && !g.space && own !== null && gp >= own * Math.min(g.size, prev.size)) {
                    me._fire('lines.wordSpaceOwnGap', page);
                    gl.push(Object.assign({}, prev, { ch: ' ', space: true, x: prev.x + prev.w, w: g.x - prev.x - prev.w }));
                } else if (prev && !prev.space && !g.space && own === null && (gp > (draws ? wg : wgb) * Math.min(g.size, prev.size) ||
                    // (or a gap as wide as its font's own space: the space drawn elsewhere — PowerPoint draws a wrapped
                    // line's space at the line's far end and leaves its room empty, «وقت همه»)
                    (draws && sEm(g, prev) >= fsMin && gp >= fsS * sEm(g, prev) * Math.min(g.size, prev.size) && !prev.mono && !g.mono && /[\p{L}\p{N}\p{P}]/u.test(prev.ch.slice(-1)) && /[\p{L}\p{N}\p{P}]/u.test(g.ch.charAt(0))) ||
                    // (where the script changes — a Persian word and a number or a Latin word — a gap of a fifth of an em
                    // is the space: Prince draws none at a bidi run's edge, «حداکثر3روز» for «حداکثر 3 روز»)
                    (AR.test(prev.ch.slice(-1)) !== AR.test(g.ch.charAt(0)) && /[\p{L}\p{N}]/u.test(prev.ch.slice(-1)) && /[\p{L}\p{N}]/u.test(g.ch.charAt(0)) && gp > sc * Math.min(g.size, prev.size)) ||
                    (spacedDoc && !prev.mono && !g.mono && gp > Math.max(sdMin * g.size, letterGap(L) + sdOver * g.size)))) {
                    // files that draw their spaces: a gap without one, between Arabic letters, is a ZWNJ
                    const zw = draws && gp < zwS * (spaceEm[g.font] || zwDef) * Math.min(g.size, prev.size) && AR.test(prev.ch.slice(-1)) && AR.test(g.ch.charAt(0)) && g.x - (prev.x + prev.w) < zwMax * g.size;
                    // (which rule made the break: in the order of the test above; the font-space and script-change
                    // rules without their letter-class conditions)
                    const mn = Math.min(g.size, prev.size);
                    me._fire(zw ? 'lines.zwnjFromGap' : gp > (draws ? wg : wgb) * mn ? (draws ? 'lines.wordSpaceInserted' : 'lines.wordSpaceBare')
                        : draws && sEm(g, prev) >= fsMin && gp >= fsS * sEm(g, prev) * mn && !prev.mono && !g.mono ? 'lines.wordSpaceFontSpace'
                        : AR.test(prev.ch.slice(-1)) !== AR.test(g.ch.charAt(0)) && gp > sc * mn ? 'lines.wordSpaceScriptChange' : 'lines.wordSpaceSpacedDoc', page);
                    gl.push(Object.assign({}, prev, zw ? { ch: '\u200C', zwnj: true, x: prev.x + prev.w, w: 0 } : { ch: ' ', space: true, x: prev.x + prev.w, w: g.x - prev.x - prev.w }));
                }
                if (g.space && prev && prev.space) { prev.w = Math.max(prev.w, g.x + g.w - prev.x); return; }   // one gap, its whole width
                // a drawn space that sits on top of letters (another text run's) is no word break
                // (unless the next glyph starts where it ends: a space in the line's own chain of advances, the
                // letter before it drawn tighter than its width — InDesign's tracked, justified Persian)
                if (g.space && prev && !prev.space && prev.x + prev.w > g.x + ovInk) {
                    const nx = L.glyphs[i + 1];
                    // (not where the shapes join across it: a final form left of an initial one — Chrome's test word with a
                    // space glyph drawn over the join)
                    const pfL = PF[prev.ch], pfR = nx && PF[nx.ch];
                    const joined = pfL && pfR && (pfL[1] === 1 || pfL[1] === 3) && (pfR[1] === 2 || pfR[1] === 3);
                    const chained = nx && !joined && g.w > chMin * g.size && Math.abs(nx.x - (g.x + g.w)) < chTol * g.size && g.x > prev.x + chPast * g.size;
                    if (nx && !nx.space && nx.x < prev.x + prev.w + ovNext * g.size && !chained) { me._fire('lines.spaceOverInkDropped', page); return; }
                }
                const pv = gl[gl.length - 1];
                if (pv && !g.space && !pv.space && !pv.zwnj && AR0.test(baseL(pv.ch, pv)) && AR0.test(baseL(g.ch, g)) && DUAL_L.test(baseL(g.ch, g)) && Math.abs(g.x - (pv.x + pv.w)) < fTouch * g.size &&
                    (formEnd[g.font + '|' + g.cid] || formStart[pv.font + '|' + pv.cid]) && (me._fire('lines.zwnjFromForm', page), true))
                    gl.push(Object.assign({}, pv, { ch: '\u200C', zwnj: true, space: false, x: g.x, w: 0 }));
                gl.push(g);
            });
            return { gl: gl, zwnj: zwnj };
        },

        // 3e, one row: the kashidas a justified line stretches its words with go (for _finishRows)
        _kashidas(gl, AR, page) {
            const kMin = this._t('linKashidaMinCount', page), kTol = this._t('linKashidaTolPt', page);
            // kashidas a justified line stretches its words with (Word's kashida justification: «بـا احتــرام»):
            // typesetting, not text — two or more inside words on one line go; a lone ـ may be meant
            const tat = function (k) { return gl[k] && gl[k].ch === '\u0640'; };
            const inWord = gl.filter(function (g, k) {
                if (!tat(k)) return false;
                // (and marks: «احترامــاً»; and the ZWNJ a gap beside a kashida was read as: «حسّـ‌ـاس»)
                const skip = function (j) { return tat(j) || (gl[j] && (gl[j].ch === '\u200C' || Array.from(gl[j].ch).every(function (c) { return MARK_CH.test(c); }))); };
                let a = k - 1, b = k + 1; while (skip(a)) a--; while (skip(b)) b++;
                const bare = function (x) { return Array.from(x.ch).filter(function (c) { return !MARK_CH.test(c); }).join(''); };
                return gl[a] && gl[b] && AR.test(bare(gl[a]).slice(-1)) && AR.test(bare(gl[b]).charAt(0));
            });
            // (once the line shows itself justified so, every kashida that touches an Arabic letter goes — one beside a
            // shadda and the ZWNJ the importer put there was kept, «السـّلام», when the font's own tables were read)
            if (inWord.length >= kMin) gl.forEach(function (g, k) {
                if (!tat(k) || inWord.indexOf(g) >= 0) return;
                const near = [gl[k - 1], gl[k + 1], gl[k - 2], gl[k + 2]].filter(Boolean).map(function (x) { return Array.from(x.ch).filter(function (c) { return !MARK_CH.test(c); }).join(''); });
                if (near.some(function (s) { return s && AR.test(s); })) inWord.push(g);
            });
            const gone = inWord.length >= kMin ? gl.filter(function (g, k) { return inWord.indexOf(g) >= 0 || (g.ch === '\u200C' && (inWord.indexOf(gl[k - 1]) >= 0 || inWord.indexOf(gl[k + 1]) >= 0)); }) : [];
            if (gone.length) this._fire('lines.kashidasRemoved', page);
            if (gone.length) for (let k = gl.length - 1; k >= 0; k--) if (gone.indexOf(gl[k]) >= 0) {
                const a = gl[k - 1]; if (a && !a.space && a.x + a.w <= gl[k].x + kTol) a.w = Math.max(a.w, gl[k].x + gl[k].w - a.x);
                gl.splice(k, 1);
            }
        },

        // 3e, one row: raised digits and small roman numerals → superscript / subscript characters (for _finishRows)
        _raisedDigits(L, page) {
            const me = this, supS = this._t('linSupSizeRatio', page), supRise = this._t('linSupRiseEm', page), subDrop = this._t('linSubDropEm', page);
            // superscript / subscript digits (footnote marks …) → ¹²³ / ₁₂₃
            L.glyphs.forEach(function (g, gi) {
                if (g.space || g.atom || g.badge || g.size >= L.size * supS || !/^[0-9]+$/.test(g.ch)) return;
                // a raised citation in brackets ("[24]"): the brackets carry it, the digits stay
                let a = gi - 1; while (a >= 0 && /^[0-9]+$/.test(L.glyphs[a].ch) && L.glyphs[a].size < L.size * supS) a--;
                if (a >= 0 && L.glyphs[a].ch === '[' && L.glyphs[a].size < L.size * supS) return;
                if (g.y > L.y + supRise * L.size && (me._fire('lines.superscriptDigits', page), true)) g.ch = g.ch.replace(/[0-9]/g, function (d) { return '\u2070\u00B9\u00B2\u00B3\u2074\u2075\u2076\u2077\u2078\u2079'.charAt(+d); });
                else if (g.y < L.y - subDrop * L.size && (me._fire('lines.subscriptDigits', page), true)) g.ch = g.ch.replace(/[0-9]/g, function (d) { return '\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089'.charAt(+d); });
            });
            // raised small roman numerals — Word's endnote marks, «i», «ii», «iv» after a word and before each note — → ⁱ ᵛ ˣ
            // (the modifier letters: Unicode has no superscript roman numerals); the whole raised run must read as one,
            // four letters at most, touching a word or opening the line
            (function () {
                const gs = L.glyphs, SUPR = { i: 'ⁱ', v: 'ᵛ', x: 'ˣ' };
                const up = function (g) { return g && !g.space && !g.atom && /^[ivx]$/.test(g.ch) && g.size < L.size * supS && g.y > L.y + supRise * L.size; };
                for (let k = 0; k < gs.length; k++) {
                    if (!up(gs[k])) continue;
                    let e = k; while (e + 1 < gs.length && up(gs[e + 1])) e++;
                    const run = gs.slice(k, e + 1), t = run.map(function (g) { return g.ch; }).join('');
                    const before = gs[k - 1], after = gs[e + 1];
                    const touches = !before || before.space || /\p{L}|[.,؛،:)\]»]/u.test(before.ch) || (after && /\p{L}/u.test(after.ch));
                    if (/^(i{1,3}|iv|vi{0,3}|ix|xi{0,3}|x)$/.test(t) && touches) { run.forEach(function (g) { g.ch = SUPR[g.ch]; }); me._fire('lines.romanSuperscript', page); }
                    k = e;
                }
            })();
        },

        // 3e, one row: monospace runs → inline code (for _finishRows)
        _codeRuns(gl, page) {
            const monoAdv = this._t('linMonoAdvEm', page), spanGap = this._t('linCodeSpanGapAdv', page);
            // monospace runs: inline code when they hold ASCII; a monospace font used only
            // as a fallback for a script (Greek in Vazir Code) is prose
            for (let i = 0; i < gl.length; i++) {
                if (!gl[i].mono || gl[i].space) continue;
                // a symbol from a fallback font (✓ in DejaVu) between monospace glyphs stays in the run
                // (sentence punctuation and a prose space between two code spans end the span: "`a`, `b`")
                const sym = function (x) { return !x.space && !/[\p{L}\p{N}]/u.test(x.ch) && !/^[,.;:!?'"()\[\]‘’“”]+$/.test(x.ch); };
                const bridge = function (k) {
                    const x = gl[k];
                    if (x.mono) return true;
                    if (!(x.space || sym(x))) return false;
                    let n = k + 1; while (n < gl.length && !gl[n].mono && (gl[n].space || sym(gl[n]))) n++;
                    if (!(n < gl.length && gl[n].mono)) return false;
                    // only spaces between two code spans: one span when the gap is one mono space wide
                    let s = k; while (s > 0 && !gl[s - 1].mono && gl[s - 1].space) s--;
                    const onlySpaces = gl.slice(s, n).every(function (y) { return y.space; });
                    if (onlySpaces && s > 0) {
                        const a = gl[s - 1], b = gl[n], cw = a.w || monoAdv * a.size;
                        return b.x - (a.x + a.w) < spanGap * cw;
                    }
                    return true;
                };
                let j = i; while (j < gl.length && bridge(j)) j++;
                const run = gl.slice(i, j);
                // code holds ASCII letters / digits / symbols; sentence punctuation alone does not count
                // (a number alone is no code: fonts with tabular figures are often flagged fixed-pitch — an Excel sheet's
                // «فاز 1-», its month numbers, every one of them came back as `1`)
                const numeric = run.every(function (g) { return g.space || /^[0-9.,:\/\-+%\u066B\u066C]+$/.test(g.ch); });
                const code = !numeric && run.some(function (g) { return /[A-Za-z0-9#$%&*+\-\/<=>@\[\\\]^_`{|}~]/.test(g.ch); });
                run.forEach(function (g) { g.code = code; });
                if (code) this._fire('lines.codeRun', page);
                i = j - 1;
            }
        },

        /**
         * Columns of a table whose cells touch (a spreadsheet printed with its default narrow padding, no
         * spaces drawn): over five baselines or more in a row, a vertical band no glyph touches, with ink
         * on both sides in nearly every baseline and no drawn space inside it, is a column boundary —
         * the segments crossing it are cut there. Prose leaves no such band through five lines.
         */
        _streamColumns(segs, page) {
            const me = this, t = function (n) { return me._t(n, page); };
            const inkW = t('linInklessWPt'), minSegs = t('linStreamMinSegs'), stBase = t('linStreamBaseEm'), stSp = t('linStreamSpaceMinEm'),
                  pitch = t('linStreamPitchEm'), szTol = t('linStreamSizeTolPt'), ovS = t('linStreamOverlapShare'), minRows = t('linStreamMinRows'),
                  bandMin = t('linStreamBandMinPt'), bandMax = t('linStreamBandMaxEm'), spTol = t('linStreamSpaceTolPt'), inkTol = t('linStreamInkTolPt'),
                  mkS = t('linStreamMarkerShare'), bothS = t('linStreamBothShare');
            const live = segs.filter(function (S) { return !S.joined && S.glyphs.some(function (g) { return !g.space && !(/^[\u200B-\u200F\u2060\uFEFF]$/.test(g.ch) && !(g.w > inkW)); }); });
            if (live.length < minSegs) return;
            // baselines, top first
            const bl = [];
            live.slice().sort(function (a, b) { return b.y - a.y; }).forEach(function (S) {
                const B = bl[bl.length - 1];
                if (B && Math.abs(B.y - S.y) < stBase * S.size) B.segs.push(S); else bl.push({ y: S.y, size: S.size, segs: [S] });
            });
            const ink = function (B) {
                const iv = [];
                B.segs.forEach(function (S) { S.glyphs.forEach(function (g) { if (!g.space && !g.atom) iv.push([g.x, g.x + g.w]); }); });
                return iv;
            };
            const spaces = function (B) {
                const iv = [];
                B.segs.forEach(function (S) { S.glyphs.forEach(function (g) { if (g.space && g.w > stSp * S.size) iv.push([g.x, g.x + g.w]); }); });
                return iv;
            };
            // runs of baselines a line pitch apart, overlapping in x
            const runs = []; let cur = null;
            bl.forEach(function (B) {
                const x0 = Math.min.apply(null, B.segs.map(function (S) { return S.glyphs[0].x; }));
                const x1 = Math.max.apply(null, B.segs.map(function (S) { const g = S.glyphs[S.glyphs.length - 1]; return g.x + g.w; }));
                B.x0 = x0; B.x1 = x1;
                const P = cur && cur[cur.length - 1];
                if (P && P.y - B.y < pitch * B.size && Math.abs(P.size - B.size) < szTol && Math.min(P.x1, x1) - Math.max(P.x0, x0) > ovS * Math.min(P.x1 - P.x0, x1 - x0)) cur.push(B);
                else { cur = [B]; runs.push(cur); }
            });
            runs.forEach(function (run) {
                if (run.length < minRows) return;
                const lo = Math.min.apply(null, run.map(function (B) { return B.x0; })), hi = Math.max.apply(null, run.map(function (B) { return B.x1; }));
                const step = t('linStreamStepPt'), n = Math.ceil((hi - lo) / step) + 1;
                if (n > 20000) return;
                const occ = new Uint8Array(n);
                const inks = run.map(ink), sps = run.map(spaces);
                inks.forEach(function (iv) { iv.forEach(function (q) { for (let k = Math.max(0, Math.floor((q[0] - lo) / step) + 1); k <= Math.min(n - 1, Math.ceil((q[1] - lo) / step) - 1); k++) occ[k] = 1; }); });
                // empty bands inside the run
                const bands = [];
                for (let k = 0; k < n;) {
                    if (occ[k]) { k++; continue; }
                    let e = k; while (e < n && !occ[e]) e++;
                    const b0 = lo + k * step, b1 = lo + e * step;
                    if (k > 0 && e < n && b1 - b0 >= bandMin) bands.push([b0, b1]);
                    k = e;
                }
                const size = run[0].size;
                const cuts = bands.filter(function (b) {
                    if (b[1] - b[0] > bandMax * size) return false;          // wide gutters: the usual rules find them
                    let both = 0;
                    for (let r = 0; r < run.length; r++) {
                        if (sps[r].some(function (q) { return q[1] > b[0] + spTol && q[0] < b[1] - spTol; })) return false;   // a drawn space there: a word gap
                        const L = inks[r].some(function (q) { return q[1] <= b[0] + inkTol; }), R = inks[r].some(function (q) { return q[0] >= b[1] - inkTol; });
                        if (L && R) both++;
                    }
                    // (a list: what stands left of the band is a marker alone — "•", "1.", "a)" — on most of its rows)
                    const markers = run.filter(function (B) {
                        const t = B.segs.map(function (S) { return S.glyphs.filter(function (g) { return !g.space && g.x + g.w <= b[0] + inkTol; }).map(function (g) { return g.ch; }).join(''); }).join('');
                        return /^([•◦▪▫■□●○‣⁃∙·\-–*+o☐☑☒✓✔]|\(?[0-9]{1,3}[.)]|\(?[a-zA-Z][.)])$/.test(t);
                    }).length;
                    if (markers >= mkS * run.length) return false;
                    return both >= Math.max(minRows, bothS * run.length);
                }).map(function (b) { return (b[0] + b[1]) / 2; });
                if (!cuts.length) return;
                run.forEach(function (B) {
                    B.segs.forEach(function (S) {
                        const parts = [];
                        let curP = [];
                        S.glyphs.forEach(function (g) {
                            const prev = curP.filter(function (x) { return !x.space; }).pop();
                            if (prev && !g.space && cuts.some(function (c) { return c > prev.x + prev.w - inkTol && c < g.x + inkTol; })) {
                                while (curP.length && curP[curP.length - 1].space) curP.pop();
                                parts.push(curP); curP = [];
                            }
                            if (!(g.space && !curP.length)) curP.push(g);
                        });
                        if (curP.length) parts.push(curP);
                        if (parts.length < 2) return;
                        S.glyphs = parts[0];
                        parts.slice(1).forEach(function (gs) { segs.push({ y: S.y, size: S.size, glyphs: gs, cell: true }); });
                        S.cell = true;
                        me._fire('lines.streamColumnCut', page);
                    });
                });
            });
        },

        /** visual glyphs of a line → logical glyphs for a base direction. */
        _logical(line, rtl, plain) {
            // a run of monospace glyphs (inline code) inside prose is an LTR isolate:
            // resolved on its own, then one strong-L unit of the line
            let seq = line.glyphs;
            if (!plain && line.monoShare < this._t('linCodeIsolateMonoShare')) {
                seq = [];
                for (let i = 0; i < line.glyphs.length; i++) {
                    const g = line.glyphs[i];
                    if (!g.code || g.space) { seq.push(g); continue; }
                    const gs = line.glyphs;
                    let j = i; while (j < gs.length && ((gs[j].code && !gs[j].space) || (gs[j].space && gs[j + 1] && gs[j + 1].code && !gs[j + 1].space))) j++;
                    const run = line.glyphs.slice(i, j);
                    // code spans are drawn left-to-right (Kelk, Word, browsers' <code> in an LTR isolate)
                    this._fire('lines.codeIsolate');
                    seq.push({ atom: true, strongL: true, group: this._logical({ glyphs: run }, false, true), x: run[0].x, w: 0, ch: '' });
                    i = j - 1;
                }
            }
            const lv = bidiLevels(seq, rtl ? 1 : 0, this._joinSigns);
            const r = reorder(seq.map(function (g, i) { return Object.assign({}, g, { level: lv[i] }); }), lv);
            const named = this._bracketsLogical(r.items);
            const out = [];
            r.items.forEach(function (g) {
                if (g.group) { g.group.forEach(function (x) { out.push(x); }); return; }
                if (g.level % 2 === 1 && MIRROR[g.ch] && !(named && PAIRED_BR[g.ch])) out.push(Object.assign({}, g, { ch: MIRROR[g.ch] }));
                else out.push(g);
            });
            return out;
        },

        /**
         * Brackets on right-to-left levels named by the logical character, not by the shape drawn (PDFIMPORT.md §4,
         * item 9; LibreOffice: the ')' shape at the right end of «(NAS)» named '(' — its fonts' codes are no glyph ids,
         * so the repairs of extract.js by the font's own cmap and outline cannot reach them, and step 3's mirroring
         * read «)NAS(»). In logical order, before the mirroring, logical names read «( … )» and shape names «) … (»:
         * the line's pairs decide (true: keep the names); a line with none follows what the same fonts' earlier lines
         * showed (this._brNames, one import's), else the shapes — mirrored, as before. Only ( ) [ ] { }.
         */
        _bracketsLogical(items) {
            // (called for every line, often several times: nothing is made until a bracket on a right-to-left level is met)
            let br = null;
            for (let i = 0; i < items.length; i++) {
                const g = items[i];
                if (g.level % 2 === 1 && !g.group && PAIRED_BR[g.ch]) (br || (br = [])).push(g);
            }
            if (!br) return false;
            const pairs = function (logical) {
                const open = [];
                let n = 0;
                br.forEach(function (g) {
                    const k = PAIRED_BR[g.ch];
                    if (k[1] === logical) { open.push(k[0]); return; }
                    const i = open.lastIndexOf(k[0]);
                    if (i >= 0) { open.splice(i, 1); n++; }
                });
                return n;
            };
            const L = pairs(true), S = pairs(false), memo = this._brNames || (this._brNames = {});
            const fonts = Array.from(new Set(br.map(function (g) { return g.font; })));
            let logical;
            if (L !== S) {
                logical = L > S;
                fonts.forEach(function (f) { const m = memo[f] || (memo[f] = { l: 0, s: 0 }); if (logical) m.l++; else m.s++; });
            } else logical = fonts.reduce(function (v, f) { const m = memo[f]; return m ? v + m.l - m.s : v; }, 0) > 0;
            if (logical) this._fire('lines.bracketsLogical');
            return logical;
        },

        /**
         * Page furniture (PDFIMPORT.md §6a): what a page carries that is no part of the text — running heads and feet,
         * a side panel, page numbers, a letterhead, logos repeated on every page. Taken out of the pages' lines (and
         * their pictures and fills) before the body is measured. The evidence, strongest first:
         *   1. the producer's own word: text marked /Artifact (LibreOffice, Foxit, Acrobat: running heads and feet,
         *      a table's header row repeated) — in a margin zone;
         *   2. a trusted structure tree that does not reach a line of the top or bottom band (Chrome's printed
         *      header and footer);
         *   3. repetition: the same text (numbers aside) at the same place on a quarter of the pages, two at least —
         *      in the top / bottom 12 % at the same height (running heads alternate sides), in a side zone (the outer
         *      quarter of the page) at the same place; pictures and vector parts the same way (logos, an outlined
         *      sidebar, a panel's fill), when no text of the page's own lies on them;
         *   4. page numbers: a short line in a band on many pages; a lone «3», «Page 3 of 9», «۳/۱۷», «صفحه ۳ از ۹».
         * Not without evidence: a letterhead on the first page only, untagged, stays (it cannot be told from a title).
         */
        _furniture(all, pages) {
            const me = this;
            const bandT = this._t('linBandTopShare'), bandB = this._t('linBandBottomShare'), sideZ = this._t('linSideZoneShare'),
                  pnApart = this._t('linPageNumApartEm'), pnCut = this._t('linPageNumCutPt');
            const W = function (pl) { return pl.p.view[2] - pl.p.view[0]; }, H = function (pl) { return pl.p.view[3] - pl.p.view[1]; };
            const zone = function (pl, b) {
                const rt = (b.y0 - pl.p.view[1]) / H(pl), rb = (b.y1 - pl.p.view[1]) / H(pl);
                if (rb > 0.5 && rt > bandT) return 'T';
                if (rt < 0.5 && rb < bandB) return 'B';
                if (b.x1 < pl.p.view[0] + sideZ * W(pl)) return 'L';
                if (b.x0 > pl.p.view[2] - sideZ * W(pl)) return 'R';
                return null;
            };
            const lineBox = function (L) { return { x0: L.x0, x1: L.x1, y0: L.bottom !== undefined ? L.bottom : L.y, y1: L.top !== undefined ? L.top : L.y + L.size }; };
            const geo = { zone: zone, lineBox: lineBox, H: H };
            this._furnitureMarked(all, pages, geo);
            // header / footer: lines in the top / bottom 12% that repeat on most pages
            if (pages.length > 1) {
                const ev = this._furnitureEvidence(all, pages, geo);
                all.forEach(function (pl) { me._furnitureCut(pl, all, ev); });
            }

            // a lone page number (also in a one-page file): a bare number / roman numeral alone in the
            // top or bottom margin band, set apart from the text
            all.forEach(function (pl) {
                const h = pl.p.view[3] - pl.p.view[1];
                const ls = pl.lines.slice().sort(function (a, b) { return a.y - b.y; });
                [ls[0], ls[ls.length - 1]].forEach(function (L, i) {
                    if (!L || pl.lines.indexOf(L) < 0) return;
                    const t = L.glyphs.map(function (g) { return g.ch; }).join('').trim();
                    // (any digits: «۳/۱۷», «صفحه ۳ از ۹» — read in either order, a right-to-left line's glyphs being visual)
                    const D = '[0-9\u0660-\u0669\u06F0-\u06F9]{1,4}';
                    const num = new RegExp('^[-\u2013\u2014]?\\s*((page|p\\.|صفحه)\\s*)?(' + D + '|[ivxlcdm]{1,7}|[IVXLCDM]{1,7})(\\s*(of|\\/|از)\\s*' + D + ')?\\s*[-\u2013\u2014]?$', 'i');
                    const tn = nfkcArabic(t), rev = Array.from(tn).reverse().join('');
                    if (!num.test(tn) && !num.test(rev)) return;
                    const rel = (L.y - pl.p.view[1]) / h;
                    if (i === 0 ? rel > bandB : rel < bandT) return;
                    const nb = i === 0 ? ls[1] : ls[ls.length - 2];
                    if (nb && nb !== L && Math.abs(nb.y - L.y) < pnApart * Math.max(L.size, nb.size)) return;
                    pl.lines.splice(pl.lines.indexOf(L), 1);
                    me._fire('lines.pageNumberDropped', pl);
                    if (i === 0) pl.cutBottom = Math.max(pl.cutBottom, L.top + pnCut); else pl.cutTop = Math.min(pl.cutTop, L.bottom - pnCut);
                });
            });

                    // 3, for what is drawn: pictures, vector parts and fills at the same place on a quarter of the pages, in a
            // margin zone, with no text of the page's own on them — logos, an outlined side panel (InDesign sets a
            // letterhead's text as outlines), the panel's fill. (Not rules: a table's borders at the top of each page
            // carry its repeated header; rules have their own cut above. Not where a remaining line stands.)
            if (pages.length > 1) this._furnitureDrawn(all, pages, geo);
        },

        // 3.5, steps 1 and 2: the producer's word (/Artifact) and the structure tree's silence (for _furniture)
        _furnitureMarked(all, pages, geo) {
            const me = this, zone = geo.zone, lineBox = geo.lineBox;
            const si = this._structInfo;
            const hrBase = this._t('linHeadRowBaseEm'), hrMin = this._t('linHeadRowMinCells'), hrRows = this._t('linHeadRowRowsEm'),
                  hrAlign = this._t('linHeadRowAlignPt'), hrCentre = this._t('linHeadRowCentreTolPt'), artS = this._t('linArtifactShare'),
                  titleTol = this._t('linTitleSizeTolPt'), titleN = this._t('linTitleMinWords'), trustMin = this._t('linTreeTrustMin'), treeNear = this._t('linTreeNearEm');
            // 1, 2: the producer's word, the tree's silence — but not a table's header row repeated at a page's top
            // (LibreOffice marks it an artifact too): a row of cells, rows under it whose cells start where its do
            const headRow = function (pl, L) {
                const row = pl.lines.filter(function (M) { return Math.abs(M.y - L.y) < hrBase * Math.max(M.size, L.size); });
                if (row.length < hrMin) return false;
                // (LibreOffice sets a table's rows up to five lines apart; cells may be centred)
                const below = pl.lines.filter(function (M) { return M.y < L.y - hrBase * L.size && L.y - M.y < hrRows * Math.max(L.size, M.size); });
                return row.filter(function (C) { return below.some(function (M) { return Math.abs(M.x0 - C.x0) < hrAlign || Math.abs(M.x1 - C.x1) < hrAlign || Math.abs(M.x0 + M.x1 - C.x0 - C.x1) < hrCentre; }); }).length >= hrMin;
            };
            const pageSize = function (pl) { if (pl._ms === undefined) { const z = []; pl.lines.forEach(function (L) { z.push(L.size); }); z.sort(function (a, b) { return a - b; }); pl._ms = z.length ? z[z.length >> 1] : 0; } return pl._ms; };
            all.forEach(function (pl) {
                const out = pl.lines.filter(function (L) {
                    if (headRow(pl, L)) { if (zone(pl, lineBox(L))) me._fire('lines.furnitureHeadRowKept', pl); return false; }
                    const z = zone(pl, lineBox(L));
                    if (!z) return false;
                    const ink = L.glyphs.filter(function (g) { return !g.space && !g.atom; });
                    if (!ink.length) return false;
                    // (a one-page document's head is its own title: nothing repeats to tell a running head, and Word marks
                    // what it sets in the page header an artifact — a form's title, 12 pt bold, four words or more, at
                    // least the page's usual size, went)
                    if (ink.filter(function (g) { return g.artifact; }).length >= artS * ink.length) {
                        if (pages.length === 1 && z === 'T' && L.size >= pageSize(pl) - titleTol && L.glyphs.map(function (g) { return g.ch; }).join('').trim().split(/\s+/).length >= titleN) { me._fire('lines.onePageTitleKept', pl); return false; }
                        me._fire('lines.furnitureArtifact', pl);
                        return true;
                    }
                    // (and apart from the text the tree reaches: more than two lines from it — a reference's wrapped link
                    // the tree does not reach opens a page of an encyclopedia page from Edge, in the top band, a line above the next)
                    if (!((z === 'T' || z === 'B') && si && si.tree && si.trust >= trustMin && !ink.some(function (g) { return g.struct || g.artifact; }))) return false;
                    const silent = !pl.lines.some(function (M) { return M !== L && Math.abs(M.y - L.y) < treeNear * Math.max(L.size, M.size) && M.glyphs.some(function (g) { return g.struct; }); });
                    if (silent) me._fire('lines.furnitureTreeSilence', pl);
                    return silent;
                });
                if (out.length) pl.lines = pl.lines.filter(function (L) { return out.indexOf(L) < 0; });
                pl.furniture = out;
            });
        },

        // 3.5, step 3: what repeats across the pages — text by place, short lines, page numbers in a side margin,
        // long rules — counted once for all pages (for _furniture, more than one page)
        _furnitureEvidence(all, pages, geo) {
            const me = this, zone = geo.zone, lineBox = geo.lineBox, H = geo.H;
            const bandT = this._t('linBandTopShare'), bandB = this._t('linBandBottomShare'), deepT = this._t('linDeepBandTopShare'), deepB = this._t('linDeepBandBottomShare'),
                  pieceGap = this._t('linPieceGapEm'), pnlBase = this._t('linPanelBaseEm'), pnlGap = this._t('linPanelGapEm'), sideMin = this._t('linSideMinChars'),
                  repTol = this._t('linRepeatTolPt'), shortMax = this._t('linShortMaxChars'), shortSide = this._t('linShortSideMaxChars'), bucket = this._t('linShortBucketPt'),
                  inkEm = this._t('linInklessWEm'), inkSize = this._t('linInklessDefSizePt'), ruleW = this._t('linRuleMinWidthShare'),
                  sideNumMin = this._t('linSideNumMinPages'), sideNumS = this._t('linSideNumShare');
            const key = function (L) { return L.glyphs.map(function (g) { return g.ch; }).join('').replace(/[0-9٠-٩۰-۹]+/g, '#').replace(/[\s\u200B-\u200F\u2060\uFEFF]+/g, ''); };
            // where a line repeats: its band (top / bottom: at one height — running heads alternate sides) or side
            // zone (a side panel: at one place, the outer quarter of the page), and its text; a repeat is the same
            // text there within 4 pt on another page (by tolerance, not buckets: Chrome draws a fixed panel's lines
            // up to 3 pt apart from page to page, and buckets of 3 pt split them)
            // (a band line is matched piece by piece — its parts apart by more than 1.5 em: Edge's footer is one line
            // «url  3/25» on some pages and two on others, and as wholes neither came to a quarter of the pages)
            const pieces = function (L) {
                const out = []; let cur = [];
                L.glyphs.forEach(function (g, i) {
                    const p = L.glyphs[i - 1];
                    if (p && !g.atom && !p.atom && g.x - (p.x + p.w) > pieceGap * L.size && cur.length) { out.push(cur); cur = []; }
                    cur.push(g);
                });
                if (cur.length) out.push(cur);
                return out.map(function (gs) { return gs.map(function (g) { return g.ch; }).join('').replace(/[0-9٠-٩۰-۹]+/g, '#').replace(/[\s\u200B-\u200F\u2060\uFEFF]+/g, ''); }).filter(function (t) { return t; });
            };
            const where = function (L, pl) {
                const rel = (L.y - pl.p.view[1]) / H(pl);
                if (rel >= bandT || rel <= bandB) return { z: rel > 0.5 ? 'T' : 'B', ts: pieces(L), side: false };
                // (a letterhead taller than the band — a government letter's logo with its number, date, time and
                // attachments fields down to 0.85 of the page: «ساعت: 10:15» and the office's name stayed on every page —
                // deeper in, a line is furniture only at one place on every page, its very text)
                if (rel >= deepT || rel <= deepB) return { z: rel > 0.5 ? 'T2' : 'B2', ts: [L.glyphs.map(function (g) { return g.ch; }).join('').replace(/[\s\u200B-\u200F\u2060\uFEFF]+/g, '')], side: true, deep: true };   // (a ZWNJ drawn on one page and not on the next: the same text)
                const z = zone(pl, lineBox(L));
                // (the exact text there: numbers normalised, a table's number cells at one place on two pages repeated)
                const exact = L.glyphs.map(function (g) { return g.ch; }).join('').replace(/[\s\u200B-\u200F\u2060\uFEFF]+/g, '');
                if (!(z === 'L' || z === 'R') || !(/\p{L}/u.test(exact) || exact.length >= sideMin)) return null;
                // (a panel stands apart, a gutter from the text beside it: a table's first cells, «P-» of a wrapped
                // «P-105» at one place on two pages, have their row's next cell close by)
                const turned = L.glyphs.every(function (g) { return g.space || g.rot; });
                const near = !turned && pl.lines.some(function (M) {
                    return M !== L && Math.abs(M.y - L.y) < pnlBase * Math.max(M.size, L.size) && Math.max(M.x0 - L.x1, L.x0 - M.x1) < pnlGap * L.size;
                });
                return near ? null : { z: z, ts: [exact], side: true };
            };
            const seen = {};                // zone + text → [{ page, x0, y }]
            // (the lines step 1 / 2 took out count too: a footer the tree does not reach on most pages repeats there)
            all.forEach(function (pl) { pl.lines.concat(pl.furniture || []).forEach(function (L) {
                const w = where(L, pl); if (!w) return;
                w.ts.forEach(function (t) { (seen[w.z + '|' + t] = seen[w.z + '|' + t] || []).push({ page: pl.p.num, x0: L.x0, y: L.y }); });
            }); });
            // on how many pages the line repeats: its least repeated piece
            const repeats = function (L, pl) {
                const w = where(L, pl); if (!w || !w.ts.length) return 0;
                return Math.min.apply(null, w.ts.map(function (t) {
                    const pagesSeen = {};
                    (seen[w.z + '|' + t] || []).forEach(function (o) {
                        if (Math.abs(o.y - L.y) <= repTol && (!w.side || Math.abs(o.x0 - L.x0) <= repTol)) pagesSeen[o.page] = 1;
                    });
                    const n = Object.keys(pagesSeen).length;
                    return w.deep && n < pages.length ? 0 : n;
                }));
            };
            // running heads alternate between even and odd pages, so a quarter of the pages is enough
            const minRep = Math.max(this._t('linRepeatMinPages'), Math.ceil(pages.length * this._t('linRepeatShare')));
            // page numbers: a short line (≤ 5 characters, no spaces) in the same margin band on many pages
            const shortKey = function (L, pl) {
                const t = L.glyphs.map(function (g) { return g.ch; }).join('').trim();
                if (!t || t.length > shortSide || /\s/.test(t)) return null;
                const rel = (L.y - pl.p.view[1]) / (pl.p.view[3] - pl.p.view[1]);
                if (t.length > shortMax && rel <= bandT && rel >= bandB) { /* (the side margin's number with its picture) */ } else if (t.length > shortMax) return null;
                if (rel > bandT) return 'T' + Math.round(L.y / bucket);
                if (rel < bandB) return 'B' + Math.round(L.y / bucket);
                // (a bare number in a side margin, at one place: a Word template's page number in a circle halfway
                // down the outer margin)
                const z = zone(pl, lineBox(L));
                const ng = L.glyphs.filter(function (g) { return !g.atom && !g.space; });
                const tn = ng.map(function (g) { return g.ch; }).join('').trim();
                // (at its centre: «5» and «12» centred in one circle)
                const nc = ng.length ? (ng[0].x + ng[ng.length - 1].x + ng[ng.length - 1].w) / 2 : 0;
                return (z === 'L' || z === 'R') && /^[0-9\u0660-\u0669\u06F0-\u06F9]{1,4}$/.test(tn) ? 'S' + Math.round(nc / bucket) + ',' + Math.round((ng.length ? ng[0].y : L.y) / bucket) : null;   // (its letters' own height: a line's may be another's — a Word plan's last page had its margin number read 4 pt off, alone, and kept)
            };
            // a line that draws nothing: spaces, ZWNJ, zero-width glyphs only
            const inkless = function (M) { return M.glyphs.every(function (g) { return g.space || g.ch === '\u200C' || g.ch === '\u200D' || !g.ch.trim() || g.w < inkEm * (g.size || inkSize); }); };
            // long rules by height, a page once each (for the head's and the foot's borders)
            const ruleCount = {};
            all.forEach(function (pl) { const seen = {}; pl.p.hsegs.forEach(function (s) {
                if (Math.abs(s.x1 - s.x0) < ruleW * (pl.p.view[2] - pl.p.view[0])) return;
                const k = Math.round(s.y); if (seen[k]) return; seen[k] = 1; ruleCount[k] = (ruleCount[k] || 0) + 1;
            }); });
            const shortCount = {}, sideNums = {};
            all.forEach(function (pl) { const seen = {}; pl.lines.concat(pl.furniture || []).forEach(function (L) {
                const k = shortKey(L, pl); if (!k || seen[k]) return;
                seen[k] = 1;
                // (in a side margin, the number must be the page's — its value a fixed step from the page's own, on
                // most of the pages it stands on: a table's last cells, «140» at one place on two pages, are none)
                if (k[0] === 'S') {
                    const v = parseInt(L.glyphs.filter(function (g) { return !g.atom && !g.space; }).map(function (g) { return g.ch; }).join('')
                        .replace(/[\u06F0-\u06F9]/g, function (d) { return d.charCodeAt(0) - 0x06F0; }).replace(/[\u0660-\u0669]/g, function (d) { return d.charCodeAt(0) - 0x0660; }), 10);
                    (sideNums[k] = sideNums[k] || []).push(v - pl.p.num);
                    return;
                }
                shortCount[k] = (shortCount[k] || 0) + 1;
            }); });
            Object.keys(sideNums).forEach(function (k) {
                const by = {}; sideNums[k].forEach(function (o) { by[o] = (by[o] || 0) + 1; });
                const top = Math.max.apply(null, Object.keys(by).map(function (o) { return by[o]; }));
                if (top >= sideNumMin && top >= sideNumS * sideNums[k].length) { shortCount[k] = sideNums[k].length; me._fire('lines.sideNumberRepeat'); }
            });
            return { repeats: repeats, minRep: minRep, shortKey: shortKey, shortCount: shortCount, inkless: inkless, ruleCount: ruleCount };
        },

        // 3.5, step 3 on one page: its running head and foot and their rules go, the letter's fields stay (for _furniture)
        _furnitureCut(pl, all, ev) {
            const me = this;
            const { repeats, minRep, shortKey, shortCount, inkless, ruleCount } = ev;
            const h = pl.p.view[3] - pl.p.view[1];
            const bandT = this._t('linBandTopShare'), bandB = this._t('linBandBottomShare'), rRise = this._t('linRuledRiseEm'), rReach = this._t('linRuledReachEm'),
                  rBase = this._t('linRuledBaseEm'), rTol = this._t('linRuledTolPt'), htDepth = this._t('linHeadTableDepthEm'), hBase = this._t('linHeadBaseEm'),
                  cut = this._t('linBandCutPt'), frTol = this._t('linFrameTolPt'), rbT = this._t('linRuleBandTopShare'), rbB = this._t('linRuleBandBottomShare'),
                  ruleW = this._t('linRuleMinWidthShare');
            // a line inside a ruled grid (a table's header row, repeated on each page) is no running head
            // (a row of cells: text on its baseline across a vertical rule too — a letterhead's one text cell
            // between its logos, rules at its sides, is a running head all the same)
            const ruled = function (L) {
                const vs = pl.p.vsegs.filter(function (v) { return v.y0 < L.y && v.y1 > L.y + rRise * L.size && v.x > L.x0 - rReach * L.size && v.x < L.x1 + rReach * L.size; });
                return vs.length > 0 && pl.lines.some(function (M) {
                    return M !== L && Math.abs(M.y - L.y) < rBase * Math.max(M.size, L.size) &&
                        vs.some(function (v) { return (v.x > Math.min(L.x1, M.x1) - rTol && v.x < Math.max(L.x0, M.x0) + rTol); });
                });
            };
            const headTable = function (L) {
                const vs = pl.p.vsegs.filter(function (v) { return v.y0 < L.y && v.y1 > L.y + rRise * L.size && v.x > L.x0 - rReach * L.size && v.x < L.x1 + rReach * L.size; });
                return vs.length > 0 && vs.every(function (v) { return Math.min(v.y0, v.y1) > L.y - htDepth * L.size; });
            };
            const drop = pl.lines.filter(function (L) {
                const rel = (L.y - pl.p.view[1]) / h;
                // (a table goes on at the top of the next page, its header row repeated — not at the bottom margin; and
                // its vertical rules go on down into its rows: a header made as a table of its own — Word's «نسخه اول |
                // title» in two cells, its rules ending with it in the margin — is a running head)
                // (a page number in the side margin is none: a table's row beside it on its baseline, the margin's
                // rule between them, kept a Word plan's last page number)
                const sk = shortKey(L, pl);
                if (rel > 0.5 && !(sk && sk[0] === 'S') && ruled(L) && !(rel >= bandT && headTable(L))) { me._fire('lines.furnitureRuledKept', pl); return false; }
                return repeats(L, pl) >= minRep || (sk && shortCount[sk] >= minRep);
            }).filter(function (L, i, list) {
                // a running head is the whole baseline: a repeating cell ("P-1##", "2##") next to text that does
                // not repeat is a table row at the top of the page
                // (in the top / bottom band: a side panel's line has the body's text beside it on its baseline)
                const rel = (L.y - pl.p.view[1]) / h;
                if (rel < bandT && rel > bandB) return true;
                return pl.lines.every(function (M) { return M === L || Math.abs(M.y - L.y) > hBase * Math.max(M.size, L.size) || list.indexOf(M) >= 0 || inkless(M); });
            });
            if (drop.length) this._fire('lines.furnitureRepeat', pl);
            // a line with no ink beside a running head (a lone zero-width ZWNJ that Word's header drew between its
            // two text runs — Microsoft Print to PDF) goes with it: it is nothing, and kept it made the head stay
            // (in the top and bottom bands only: in the body an inkless glyph is the end of a line — a ZWNJ at a
            // right-to-left line's left end, beside a side ornament dropped on its baseline — and its line's edge)
            if (drop.length) pl.lines.forEach(function (M) {
                const rel = (M.y - pl.p.view[1]) / h;
                if (rel < bandT && rel > bandB) return;
                if (inkless(M) && drop.indexOf(M) < 0 && drop.some(function (L) { return Math.abs(M.y - L.y) <= hBase * Math.max(M.size, L.size); })) { drop.push(M); me._fire('lines.furnitureInklessDropped', pl); }
            });
            pl.cutTop = Infinity; pl.cutBottom = -Infinity;
            drop.concat(pl.furniture || []).forEach(function (L) {
                const rel = (L.y - pl.p.view[1]) / h;
                if (rel < bandT && rel > bandB) return;                  // (a side panel's line cuts no band)
                if (rel > 0.5) pl.cutTop = Math.min(pl.cutTop, L.bottom - cut); else pl.cutBottom = Math.max(pl.cutBottom, L.top + cut);
            });
            // (a letter's number, date and attachment fields, in its letterhead on every page, are the letter's
            // own: kept once, on its first page — §6a «Letter fields»)
            // (given before the page's own text, in the head's reading order — regions.js: not measured with the body)
            const fields = pl === all[0] ? me._letterFields(pl, drop) : [];
            if (fields.length) { pl.letterHead = me._headChunks(fields); me._fire('lines.letterFieldsKept', pl); }
            pl.lines = pl.lines.filter(function (L) { return drop.indexOf(L) < 0; });
            // rules that belong to the running head / foot
            const keep = function (y) { return y < pl.cutTop && y > pl.cutBottom; };
            // (a rule that vertical rules meet is a table's edge: a table can start just under the running head)
            const framed = function (s) { return pl.p.vsegs.some(function (v) { return v.x > s.x0 - frTol && v.x < s.x1 + frTol && (Math.abs(v.y0 - s.y) < frTol || Math.abs(v.y1 - s.y) < frTol) && keep(Math.min(v.y0, v.y1) + 0.1); }); };
            // (… unless the rules that meet it all rise into the running head: the bottom edge of a letterhead's
            // own frame — its separators between logos and text end on it — a thematic break at every page's top)
            const headFrame = function (s) {
                const meet = pl.p.vsegs.filter(function (v) { return v.x > s.x0 - frTol && v.x < s.x1 + frTol && (Math.abs(v.y0 - s.y) < frTol || Math.abs(v.y1 - s.y) < frTol); });
                return meet.length > 0 && meet.every(function (v) { return Math.min(v.y0, v.y1) > s.y - frTol && Math.max(v.y0, v.y1) > pl.cutTop; }) ||
                       meet.length > 0 && meet.every(function (v) { return Math.max(v.y0, v.y1) < s.y + frTol && Math.min(v.y0, v.y1) < pl.cutBottom; });
            };
            // (a rule that runs under the running head or over the foot across the page, at one height on many pages,
            // with no text of the page's own beyond it — Word's header and footer borders, 25 pt from their text:
            // past the 12 pt cut, a thematic break at each page's join)
            const bandRule = function (s) {
                const rel = (s.y - pl.p.view[1]) / h;
                if (!(rel > rbT || rel < rbB) || Math.abs(s.x1 - s.x0) < ruleW * (pl.p.view[2] - pl.p.view[0]) || framed(s)) return false;
                if (pl.lines.some(function (L) { return rel > 0.5 ? L.y > s.y : L.y < s.y; })) return false;
                const band = (ruleCount[Math.round(s.y)] || 0) + (ruleCount[Math.round(s.y) + 1] || 0) + (ruleCount[Math.round(s.y) - 1] || 0) >= minRep;
                if (band) me._fire('lines.furnitureBandRule', pl);
                return band;
            };
            const nRules = pl.p.hsegs.length;
            pl.p.hsegs = pl.p.hsegs.filter(function (s) { return !headFrame(s) && !bandRule(s) && (keep(s.y) || framed(s)); });
            if (pl.p.hsegs.length < nRules) this._fire('lines.furnitureRulesDropped', pl);
        },

        // 3.5, step 3 for what is drawn: pictures, vector parts and fills repeated in a margin zone (for _furniture)
        _furnitureDrawn(all, pages, geo) {
            const me = this, zone = geo.zone;
            const rectMin = this._t('linRectMinPt'), nmMax = this._t('linNoteMarkMaxPt'), nmDrop = this._t('linNoteMarkDropEm'), nmGap = this._t('linNoteMarkGapEm'),
                  htRise = this._t('linHoldsTextRiseEm'), htTol = this._t('linHoldsTextTolPt');
            const minRep = Math.max(this._t('linRepeatMinPages'), Math.ceil(pages.length * this._t('linRepeatShare')));
            const gk = function (b) { return Math.round(b.x0) + ',' + Math.round(b.y0) + ',' + Math.round(b.x1) + ',' + Math.round(b.y1); };
            const kinds = ['images', 'vectors', 'rects'];
            const cand = function (pl, kind, b) { return zone(pl, b) && (kind !== 'rects' || (b.x1 - b.x0 > rectMin && b.y1 - b.y0 > rectMin)); };
            const counts = {};
            all.forEach(function (pl) {
                const seen = {};
                kinds.forEach(function (kind) { (pl.p[kind] || []).forEach(function (b) {
                    if (!cand(pl, kind, b)) return;
                    const k = kind + gk(b);
                    if (!seen[k]) { seen[k] = 1; counts[k] = (counts[k] || 0) + 1; }
                }); });
            });
            let n = 0;
            all.forEach(function (pl) {
                const holdsText = function (b) { return pl.lines.some(function (L) { return inside(b, (L.x0 + L.x1) / 2, L.y + htRise * L.size, htTol); }); };
                kinds.forEach(function (kind) {
                    if (!pl.p[kind]) return;
                    pl.p[kind] = pl.p[kind].filter(function (b) {
                        // (nor a small picture set on a remaining line's baseline right before or after it: a footnote's
                        // mark Word draws as a picture — at one place on each page that has a note)
                        const onLine = kind === 'images' && b.x1 - b.x0 < nmMax && b.y1 - b.y0 < nmMax && pl.lines.some(function (L) {
                            return Math.min(b.y1, L.y + L.size) - Math.max(b.y0, L.y - nmDrop * L.size) > 0 && Math.min(Math.abs(L.x0 - b.x1), Math.abs(b.x0 - L.x1)) < nmGap * L.size;
                        });
                        const drop = cand(pl, kind, b) && counts[kind + gk(b)] >= minRep && !holdsText(b) && !onLine;
                        if (drop) { n++; me._fire('lines.furnitureDrawnDropped', pl); }
                        return !drop;
                    });
                });
            });
            this._furnitureGraphics = n;
        },

        /**
         * Letter fields (PDFIMPORT.md §6a): an office letter's head carries its number, date and attachments — «شماره:»,
         * «تاریخ:», «پیوست:» — and a letter of two pages or more draws them on every page, where repetition takes them
         * for a running head. They are the letter's own, as much as its subject: of the lines the repetition took out of
         * the first page's head (its top quarter: not a side panel's lines), two or more that read as fields stay there
         * (once: the other pages' copies go), each a paragraph of its own.
         *   · a field is «label: value» on one line, or a label ending in «:» with its value beside it on its baseline
         *     (Word's letterhead table: label and value two cells — joined into one line), or a bare value of a field's
         *     kind standing alone: a date («1403/06/12», «2024-05-13»), a number («451288», «12/3400/5678», a number with
         *     a word or two in brackets after it), «دارد / ندارد»; a value wrapped under itself (its far edge at one x,
         *     a line apart) is one value;
         *   · where the labels are no text — a letterhead printed as one picture behind the page, a Prince letter's values
         *     written over it — a right-to-left letter's bare values are given the labels its head shows: «تاریخ», «شماره»,
         *     «پیوست», a left-to-right letter's "Date", "No.", "Attachments" (two kinds or more, each once, a date or a
         *     number among them; otherwise the values stay bare); a date may name its month («12 October 2026»);
         *   · the rest of that head's text — the office's name, its holder's title beside the logo — is the letter's
         *     sender: kept once too, before the body (a head with fields is a letter's, not a book's running head).
         * Returns the lines to keep.
         */
        _letterFields(pl, drop) {
            const self = this, h = pl.p.view[3] - pl.p.view[1];
            const headS = this._t('linLetterHeadShare'), rowEm = this._t('linFieldRowEm'), nearEm = this._t('linFieldNearEm'), lblWords = this._t('linLabelMaxWords'),
                  sideTol = this._t('linFieldSideTolPt'), maxChars = this._t('linFieldMaxChars'), lvWords = this._t('linLabelValueMaxWords'),
                  wrapEm = this._t('linFieldWrapEm'), wrapAlign = this._t('linFieldWrapAlignPt'), wrapSize = this._t('linFieldWrapSizeTolPt'),
                  minFound = this._t('linFieldMinFound'), minBare = this._t('linFieldMinBare'), lblG = this._t('linLabelGlyphEm'), lblP = this._t('linLabelPunctEm');
            const fa = function (t) { return t.replace(/[۰-۹]/g, function (d) { return String.fromCharCode(d.charCodeAt(0) - 0x06F0 + 48); })
                                              .replace(/[٠-٩]/g, function (d) { return String.fromCharCode(d.charCodeAt(0) - 0x0660 + 48); }); };
            const rtlOf = function (L) {
                const ink = L.glyphs.filter(function (g) { return !g.space && !g.atom; });
                return ink.filter(function (g) { return R_CH.test(g.ch); }).length > ink.filter(function (g) { return /\p{L}/u.test(g.ch) && !R_CH.test(g.ch); }).length;
            };
            const textOf = function (L) {
                return fa(nfkcArabic(self._logical(L, rtlOf(L), true).map(function (g) { return g.atom ? '' : g.ch; }).join(''))).replace(/[​-‏⁠﻿]/g, '').replace(/\s+/g, ' ').trim();
            };
            const DATE = /^(?:(?:1[3-4]|19|20)\d\d\s*[\/.\-]\s*\d{1,2}\s*[\/.\-]\s*\d{1,2}|\d{1,2}\s*[\/.\-]\s*\d{1,2}\s*[\/.\-]\s*(?:1[3-4]|19|20)\d\d)$/;
            const ATTACH = /^(?:ندارد|دارد|ندارد\.|دارد\.|\d{1,3}\s*(?:برگ|صفحه)|none|enclosed|\d{1,3}\s*(?:pages?|sheets?|enclosures?))$/i;
            // (a date written with its month's name: «12 October 2026», «October 12, 2026»)
            const MONTHS = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
            const DATE_W = new RegExp('^(?:\\d{1,2}\\s+' + MONTHS + ',?\\s+(?:19|20)\\d\\d|' + MONTHS + '\\s+\\d{1,2},?\\s+(?:19|20)\\d\\d)$', 'i');
            // (a reference may open with a few Latin letters: «NA/2026/0457»)
            const NUMBER = /^(?=(?:\D*\d){3})(?:[A-Za-z]{1,4}[\/\-.\s]?)?[\d\s\/\-.]*\d[\d\s\/\-.]*(?:[؀-ۿA-Za-z]{1,2}[\d\s\/\-.]*)*(?:\s*\([^()]{1,30}\))?$/;
            const kindOf = function (t) {
                if (DATE.test(t) || DATE_W.test(t)) return 'date';
                if (ATTACH.test(t)) return 'attach';
                if (NUMBER.test(t)) return 'number';
                return null;
            };
            const head = drop.filter(function (L) { return (L.y - pl.p.view[1]) / h >= headS; });     // (not a side panel's lines lower down)
            const sameRow = function (A, B) { return Math.abs(A.y - B.y) < rowEm * Math.max(A.size, B.size); };
            const near = function (A, B) { return Math.max(A.x0 - B.x1, B.x0 - A.x1) < nearEm * Math.max(A.size, B.size); };
            // a label line and its value beside it on its baseline: one line (the value on the label's far side)
            const used = [];
            head.forEach(function (L) {
                if (used.indexOf(L) >= 0) return;
                const t = textOf(L);
                if (!/^[^\d:：]{1,24}[:：]$/.test(t) || !/\p{L}/u.test(t) || t.split(/\s+/).length > lblWords) return;
                const rtl = rtlOf(L);
                const v = head.filter(function (M) { return M !== L && used.indexOf(M) < 0 && sameRow(L, M) && near(L, M) && (rtl ? M.x1 <= L.x0 + sideTol : M.x0 >= L.x1 - sideTol) && textOf(M) && !/[:：]$/.test(textOf(M)); })
                    .sort(function (A, B) { return rtl ? B.x1 - A.x1 : A.x0 - B.x0; })[0];
                if (!v) return;
                L.glyphs = rtl ? v.glyphs.concat([Object.assign({}, v.glyphs[v.glyphs.length - 1], { ch: ' ', space: true, w: 0 })], L.glyphs)
                               : L.glyphs.concat([Object.assign({}, L.glyphs[L.glyphs.length - 1], { ch: ' ', space: true, w: 0 })], v.glyphs);
                L.x0 = Math.min(L.x0, v.x0); L.x1 = Math.max(L.x1, v.x1);
                L.paired = v; used.push(v);
                self._fire('lines.letterLabelPaired', pl);
            });
            const found = [];
            head.forEach(function (L) {
                if (used.indexOf(L) >= 0) return;
                const t = textOf(L);
                if (!t || t.length > maxChars) return;
                const m = /^([^\d:：]{1,24}?)\s*[:：]\s*(\S.{0,40})$/.exec(t);
                if (m && /\p{L}/u.test(m[1]) && m[1].trim().split(/\s+/).length <= lvWords) { found.push({ L: L, label: true }); return; }
                // (a bare value stands alone on its baseline: «17870» after a side panel's «Registered no.» is that line's end)
                const alone = !pl.lines.concat(drop).some(function (M) { return M !== L && sameRow(L, M) && near(L, M); });
                if (!alone) return;
                // (a value wrapped under itself: its far edge at one x, a line's pitch below — «… (نسخه» over «دوم)»)
                const rtl = rtlOf(L) || !/\p{L}/u.test(t);
                const next = head.filter(function (M) { return M !== L && used.indexOf(M) < 0 && M.y < L.y && L.y - M.y < wrapEm * Math.max(L.size, M.size) &&
                    Math.abs(rtl ? M.x1 - L.x1 : M.x0 - L.x0) < wrapAlign && Math.abs(M.size - L.size) < wrapSize; })[0];
                const k = kindOf(t), k2 = next && kindOf(t + ' ' + textOf(next));
                if (k2 && (!k || k2 === k)) { found.push({ L: L, kind: k2 }); next.fieldCont = true; used.push(next); self._fire('lines.letterFieldWrapped', pl); return; }
                if (k) found.push({ L: L, kind: k });
            });
            if (found.length < minFound) return [];
            // the labels a right-to-left head shows for bare values
            const bare = found.filter(function (f) { return !f.label; });
            const ink = pl.lines.concat(drop).reduce(function (a, L) { L.glyphs.forEach(function (g) { if (!g.space && /\p{L}/u.test(g.ch)) a[R_CH.test(g.ch) ? 1 : 0]++; }); return a; }, [0, 0]);
            const kinds = bare.map(function (f) { return f.kind; });
            // (and a left-to-right head the English ones, at the value's left: a Latin letter's bare values had stayed bare)
            const unique = (kinds.indexOf('date') >= 0 || kinds.indexOf('number') >= 0) && kinds.every(function (k, i) { return kinds.indexOf(k) === i; });
            if (bare.length >= minBare && ink[0] > ink[1] && unique) {
                this._fire('lines.letterLabelsAddedLtr', pl);
                const NAME_L = { date: 'Date', number: 'No.', attach: 'Attachments' };
                bare.forEach(function (f) {
                    const L = f.L, ref = L.glyphs.filter(function (g) { return !g.space; })[0];
                    const chs = Array.from(NAME_L[f.kind]).concat([':', ' ']);
                    let x = L.x0 - chs.length * lblG * ref.size;
                    const add = chs.map(function (ch) {
                        const w = (ch === ' ' || ch === ':' ? lblP : lblG) * ref.size;
                        const g = { ch: ch, x: x, w: w, y: ref.y, size: ref.size, color: ref.color, space: ch === ' ', font: ref.font, page: ref.page,
                                    bold: ref.bold, italic: false, mono: false, label: true };
                        x += w;
                        return g;
                    });
                    L.glyphs = add.concat(L.glyphs);
                    L.x0 = add[0].x;
                });
            }
            if (bare.length >= minBare && ink[1] > ink[0] && unique) {
                this._fire('lines.letterLabelsAddedRtl', pl);
                const NAME = { date: 'تاریخ', number: 'شماره', attach: 'پیوست' };
                bare.forEach(function (f) {
                    const L = f.L, ref = L.glyphs.filter(function (g) { return !g.space; })[0];
                    // drawn at the value's right, as the head shows it: visual order, the label's letters reversed
                    const chs = [' ', ':'].concat(Array.from(NAME[f.kind]).reverse());
                    let x = L.x1;
                    const add = chs.map(function (ch) {
                        const w = (ch === ' ' || ch === ':' ? lblP : lblG) * ref.size;
                        const g = { ch: ch, x: x, w: w, y: ref.y, size: ref.size, color: ref.color, space: ch === ' ', font: ref.font, page: ref.page,
                                    bold: ref.bold, italic: false, mono: false, label: true };
                        x += w;
                        return g;
                    });
                    L.glyphs = L.glyphs.concat(add);
                    L.x1 = x;
                });
            }
            found.forEach(function (f) { f.L.letterField = true; });
            const keep = found.map(function (f) { return f.L; });
            head.forEach(function (L) { if (L.fieldCont) { L.letterField = true; keep.push(L); } });
            // the sender: the head's other text (not a page number, not what pairing took)
            head.forEach(function (L) {
                if (keep.indexOf(L) >= 0 || used.indexOf(L) >= 0) return;
                const t = textOf(L);
                if (!/\p{L}/u.test(t)) return;
                L.letterHead = true; keep.push(L);
            });
            return keep;
        },

        /**
         * A letter's kept head (`_letterFields`) in its reading order: its lines in chunks — the lines of one block (their
         * extents overlapping, two lines' height apart at most: «معاون …» over «و» over «رئیس …» beside a logo), each field
         * a chunk of its own (a wrapped value with its first line) — and the chunks in columns, read across the head in
         * the letter's direction (a right-to-left head from its right), each column top to bottom. Returns arrays of lines.
         */
        _headChunks(lines) {
            const ovEm = this._t('linChunkOverlapEm'), gapEm = this._t('linChunkGapEm');
            const rtlN = lines.reduce(function (a, L) { L.glyphs.forEach(function (g) { if (!g.space && /\p{L}/u.test(g.ch)) a += R_CH.test(g.ch) ? 1 : -1; }); return a; }, 0);
            const rtl = rtlN > 0;
            const ls = lines.slice().sort(function (a, b) { return b.y - a.y; });
            const chunks = [];
            ls.forEach(function (L) {
                const over = function (A, B) { return Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0) > -ovEm * Math.max(A.size, B.size); };
                let c = null;
                if (L.fieldCont) c = chunks.filter(function (k) { return k.some(function (M) { return M.letterField && !M.fieldCont && over(M, L) && M.y > L.y; }); }).pop();
                else if (L.letterHead) c = chunks.filter(function (k) { const last = k[k.length - 1]; return last.letterHead && over(last, L) && last.y - L.y < gapEm * Math.max(L.size, last.size); }).pop();
                if (c) c.push(L); else chunks.push([L]);
            });
            // columns: chunks whose extents overlap
            const box = function (k) { return { x0: Math.min.apply(null, k.map(function (L) { return L.x0; })), x1: Math.max.apply(null, k.map(function (L) { return L.x1; })), y: k[0].y }; };
            const cols = [];
            chunks.forEach(function (k) {
                const b = box(k);
                const col = cols.filter(function (c) { return Math.min(c.x1, b.x1) - Math.max(c.x0, b.x0) > 0; })[0];
                if (col) { col.ks.push(k); col.x0 = Math.min(col.x0, b.x0); col.x1 = Math.max(col.x1, b.x1); } else cols.push({ x0: b.x0, x1: b.x1, ks: [k] });
            });
            cols.sort(function (a, b) { return rtl ? b.x1 - a.x1 : a.x0 - b.x0; });
            const out = [];
            cols.forEach(function (c) { c.ks.sort(function (a, b) { return b[0].y - a[0].y; }).forEach(function (k) { out.push(k); }); });
            return out;
        }
    });
})(typeof window !== 'undefined' ? window : globalThis);
