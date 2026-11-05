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
    // a block's text, as it is set (`_joinAcrossPages`: its footnotes, its paragraphs run past a caption)
    const plainOf = function (x) { return (x.glyphs || []).map(function (g) { return g.ch || ''; }).join('').trim(); };
    // a line's size as drawn: the median of its letters' sizes (L.size is their mode in half points)
    const drawnSize = function (L) {
        const s = L.glyphs.filter(function (g) { return !g.space && !g.atom && g.size > 0 && /\S/.test(g.ch || ''); }).map(function (g) { return g.size; });
        return s.length ? median(s) : L.size;
    };

    // the layout literals of this part, by name (thresholds.js): read with this._t(name, page); em = of the line's
    // (or, where the entry says so, the body's) font size — a leading too: a pitch over the size —, pt = absolute,
    // share = 0–1 of a width or a count, ratio = a factor on another measure
    const U = function (m) { return ['blocks.js ' + m]; };
    PdfImporter._defineThresholds({
        // structure tree (votes, not geometry: never calibrated)
        blkTreeTrustMin: { def: 0.5, unit: 'share', fixed: true, used: ['blocks.js _treeParagraphs', 'blocks.js _treeTables', 'blocks.js _treeVote'] },
        blkTreeParaShare: { def: 0.9, unit: 'share', fixed: true, used: U('_treeParagraphs') },
        blkTreeTableMinGlyphs: { def: 4, unit: 'glyphs', used: U('_treeTables') },
        blkTreeTableLooseShare: { def: 0.15, unit: 'share', fixed: true, used: U('_treeTables (glyphs the tree does not place)') },
        blkTreeVoteCover: { def: 0.8, unit: 'share', fixed: true, used: U('_treeVote') },
        // block direction
        blkDirMajority: { def: 2, unit: 'ratio', fixed: true, used: U('_blockDir (strong letters, one direction over the other)') },
        blkDirOneTouchPt: { def: 3, unit: 'pt', used: U('_blockDir (a single line at an edge)') },
        blkDirLastTouchPt: { def: 3, unit: 'pt', used: U('_blockDir (the last line at the block edge)') },
        // list markers
        blkNumTabGapEm: { def: 0.9, unit: 'em', used: U('_numMarker (number, tab gap, capital)') },
        blkNumOBulletGapEm: { def: 0.3, unit: 'em', used: U('_numMarker (Word\'s Courier "o" bullet)') },
        blkNumRtlBulletGapEm: { def: 0.3, unit: 'em', used: U('_numMarker (bullet at the right end of a Latin line)') },
        blkNumOverBodyPt: { def: 0.6, unit: 'pt', used: U('_lineMarker (a number over body size is no item)') },
        blkWrapBulletGapEm: { def: 0.45, unit: 'em', used: U('_lineMarker (typed bullet a word space from the text)') },
        blkDashFullEm: { def: 1.0, unit: 'em', used: U('_lineMarker (line above full)') },
        blkDashStartEm: { def: 0.6, unit: 'em', used: U('_lineMarker (same start)') },
        blkDashIndentEm: { def: 4, unit: 'em', used: U('_lineMarker (first-line indent)') },
        blkDashPitchEm: { def: 1.9, unit: 'em', used: U('_lineMarker (a line\'s pitch)') },
        blkBoldLabelMaxGlyphs: { def: 31, unit: 'glyphs', used: U('_boldLabel (label up to its colon)') },
        // sizes alike (pt)
        blkSameSizePt: { def: 0.6, unit: 'pt', used: ['blocks.js _groupLines', 'blocks.js _quoteRuns', 'blocks.js _lineBreaks', 'blocks.js _lineMarker'] },
        blkAtBodyPt: { def: 0.8, unit: 'pt', used: ['blocks.js _groupLines', 'blocks.js _quoteRuns', 'blocks.js _lineBreaks'] },
        // leading and justification (_groupLines)
        blkLeadSampleMaxEm: { def: 2.5, unit: 'em', used: U('_groupLines (a pitch sampled as leading)') },
        blkLeadFullShare: { def: 0.9, unit: 'share', used: U('_groupLines (a line that fills the column)') },
        blkLeadAlikeShare: { def: 0.02, unit: 'share', used: U('_groupLines (two pitches alike)') },
        blkLeadMinSamples: { def: 3, unit: 'count', used: U('_groupLines (pitches for a median)') },
        blkLeadDefault: { def: 1.4, unit: 'em', used: U('_groupLines (leading without samples)') },
        blkLeadMax: { def: 2.5, unit: 'em', used: U('_groupLines (no leading is wider)') },
        blkLeadBodyRatio: { def: 1.2, unit: 'ratio', used: U('_groupLines (over the body leading)') },
        blkJustEdgePt: { def: 2.5, unit: 'pt', used: U('_groupLines (justified: at both edges)') },
        blkJustIndentEm: { def: 2, unit: 'em', used: U('_groupLines (justified: first-line indent allowed)') },
        blkJustMinLines: { def: 4, unit: 'count', used: U('_groupLines (justified)') },
        blkJustFullShare: { def: 0.55, unit: 'share', used: U('_groupLines (justified: full lines)') },
        // quote runs (_quoteRuns)
        blkQuotePicMinEm: { def: 3, unit: 'em', used: U('_quoteRuns (a picture, of the body size)') },
        blkQuotePicPadEm: { def: 0.3, unit: 'em', used: U('_quoteRuns (picture beside a line)') },
        blkQuotePicTolPt: { def: 1, unit: 'pt', used: U('_quoteRuns (picture beside a line)') },
        blkQuotePicEdgePt: { def: 2, unit: 'pt', used: U('_quoteRuns (picture inside the column)') },
        blkQuotePicGapEm: { def: 3, unit: 'em', used: U('_quoteRuns (picture beside a line)') },
        blkQuoteMonoMax: { def: 0.5, unit: 'share', used: U('_quoteRuns (no code line)') },
        blkQuoteIndentEm: { def: 1.5, unit: 'em', used: U('_quoteRuns (set in on both sides)') },
        blkQContLeftPt: { def: 1, unit: 'pt', used: U('_quoteRuns (item text column)') },
        blkQContTolPt: { def: 1.5, unit: 'pt', used: U('_quoteRuns (item text column)') },
        blkQContSpanEm: { def: 3, unit: 'em', used: U('_quoteRuns (item text column)') },
        blkQContPitchEm: { def: 2.5, unit: 'em', used: U('_quoteRuns (item text column)') },
        blkQuoteGapLines: { def: 2.5, unit: 'em', used: U('_quoteRuns (lines of one run)') },
        blkQuoteGapMargin: { def: 1.1, unit: 'em', used: U('_quoteRuns (lines of one run, over the leading)') },
        blkQuoteWrapPitch: { def: 1.7, unit: 'em', used: U('_quoteRuns (a wrap\'s pitch)') },
        blkQuoteWrapLeadPad: { def: 0.35, unit: 'em', used: U('_quoteRuns (a wrap\'s pitch, over the leading)') },
        blkQuoteShallowEm: { def: 2.2, unit: 'em', used: U('_quoteRuns (a first-line indent\'s depth)') },
        blkQuoteCentredEm: { def: 2, unit: 'em', used: U('_quoteRuns (centred lines)') },
        blkQuoteOneEdgePt: { def: 1.5, unit: 'pt', used: U('_quoteRuns (one-line quote: neighbours at the edge)') },
        blkQuoteOneGapEm: { def: 1.6, unit: 'em', used: U('_quoteRuns (one-line quote: gaps around it)') },
        blkQuoteOneWidthShare: { def: 0.5, unit: 'share', used: U('_quoteRuns (one-line quote: width)') },
        blkQuoteOneBoldMax: { def: 0.5, unit: 'share', used: U('_quoteRuns (one-line quote: not bold)') },
        blkQuoteReachShare: { def: 0.5, unit: 'share', used: U('_quoteRuns (a shallow quote reaching the edge)') },
        blkQuoteAxisEm: { def: 0.5, unit: 'em', used: U('_quoteRuns (lines on one axis)') },
        blkQuoteAxisWidthEm: { def: 3, unit: 'em', used: U('_quoteRuns (lines on one axis: widths apart)') },
        blkQuoteSentenceSpaces: { def: 4, unit: 'count', used: U('_quoteRuns (a sentence: word spaces)') },
        blkQuoteWidestShare: { def: 0.35, unit: 'share', used: U('_quoteRuns (the widest line)') },
        blkQuoteSpreadShallow: { def: 0.08, unit: 'share', used: U('_quoteRuns (line ends together, shallow indent)') },
        blkQuoteSpreadShare: { def: 0.45, unit: 'share', used: U('_quoteRuns (line ends together)') },
        // paragraph breaks (_lineBreaks, via _blkBreakK)
        blkHoldsMinGlyphs: { def: 4, unit: 'glyphs', used: U('_lineBreaks (a line holds the other\'s size)') },
        blkStyleMonoHigh: { def: 0.9, unit: 'share', used: U('_lineBreaks (style change: mono)') },
        blkStyleMonoLow: { def: 0.3, unit: 'share', used: U('_lineBreaks (style change: mono)') },
        blkStyleBoldHigh: { def: 0.9, unit: 'share', used: U('_lineBreaks (style change: bold)') },
        blkStyleBoldOverPt: { def: 0.5, unit: 'pt', used: U('_lineBreaks (style change: bold over body size)') },
        blkRoomyPadEm: { def: 0.6, unit: 'em', used: U('_lineBreaks (room for the next first word)') },
        blkBigGapLead: { def: 1.3, unit: 'ratio', used: U('_lineBreaks (gap over the leading)') },
        blkBigGapMin: { def: 1.15, unit: 'em', used: U('_lineBreaks (gap over the leading)') },
        blkBigGapRoomyLead: { def: 1.1, unit: 'ratio', used: U('_lineBreaks (gap after a roomy line)') },
        blkBigGapRoomyCap: { def: 1.75, unit: 'em', used: U('_lineBreaks (gap after a roomy line)') },
        blkBigGapRoomyCapLead: { def: 1.15, unit: 'ratio', used: U('_lineBreaks (gap after a roomy line)') },
        blkBoldHeadShare: { def: 0.9, unit: 'share', used: U('_lineBreaks (bold head line)') },
        blkBoldHeadTextMax: { def: 0.5, unit: 'share', used: U('_lineBreaks (plain text under it)') },
        blkBoldHeadPitchEm: { def: 2.5, unit: 'em', used: U('_lineBreaks (bold head line)') },
        blkHangMaxGlyphs: { def: 8, unit: 'glyphs', used: U('_lineBreaks (a clause number\'s length)') },
        blkHangTolPt: { def: 2, unit: 'pt', used: U('_lineBreaks (hanging indent)') },
        blkIndentEm: { def: 0.8, unit: 'em', used: U('_lineBreaks (first-line indent, re-indent, outdent)') },
        blkShortEndEm: { def: 1.5, unit: 'em', used: U('_lineBreaks (a line ending short)') },
        blkReIndentMaxEm: { def: 4, unit: 'em', used: U('_lineBreaks (re-indent)') },
        blkReIndentTolPt: { def: 1.5, unit: 'pt', used: U('_lineBreaks (re-indent)') },
        blkOutdentMidPt: { def: 2, unit: 'pt', used: U('_lineBreaks (outdent: centred lines)') },
        blkOutdentCentrePt: { def: 3, unit: 'pt', used: U('_lineBreaks (outdent: centred lines)') },
        blkShortShare: { def: 0.35, unit: 'share', used: U('_lineBreaks (a short line)') },
        blkShortEm: { def: 6, unit: 'em', used: U('_lineBreaks (a short line)') },
        blkEnumStartPt: { def: 1, unit: 'pt', used: U('_lineBreaks (clauses at one start)') },
        blkItemLeftEm: { def: 0.5, unit: 'em', used: U('_lineBreaks (text past its item\'s marker)') },
        blkWideColEm: { def: 15, unit: 'em', used: U('_lineBreaks (a column wide enough to tell)') },
        blkFromFarShare: { def: 0.3, unit: 'share', used: U('_lineBreaks (a line from far)') },
        blkFromFarEdgeEm: { def: 1.0, unit: 'em', used: U('_lineBreaks (a line from far)') },
        blkCentredAfterInEm: { def: 3, unit: 'em', used: U('_lineBreaks (centred line after a sentence)') },
        blkCentredTolEm: { def: 1.5, unit: 'em', used: U('_lineBreaks (centred lines)') },
        blkCentredAfterFull: { def: 0.9, unit: 'share', used: U('_lineBreaks (centred line after a full one)') },
        blkBrMidEm: { def: 0.5, unit: 'em', used: U('_lineBreaks (line break: middles at one x)') },
        blkBrShortShare: { def: 0.6, unit: 'share', used: U('_lineBreaks (line break: short centred block)') },
        blkBrCentredInEm: { def: 2, unit: 'em', used: U('_lineBreaks (line break: two centred lines)') },
        blkBrCentredRoomEm: { def: 1.5, unit: 'em', used: U('_lineBreaks (line break: two centred lines)') },
        blkBrFitEm: { def: 0.5, unit: 'em', used: U('_lineBreaks (line break: the next word fits)') },
        // headings, items, paragraphs (_textBlocks)
        blkHeadBoldShare: { def: 0.85, unit: 'share', used: U('_textBlocks (all bold)') },
        blkHeadBigRatio: { def: 1.4, unit: 'ratio', used: U('_textBlocks (over the body size)') },
        blkPushedStartShare: { def: 0.2, unit: 'share', used: U('_textBlocks (pushed to the far side)') },
        blkPushedDiffShare: { def: 0.4, unit: 'share', used: U('_textBlocks (pushed to the far side)') },
        blkPushedFlushMin: { def: 0.6, unit: 'share', used: U('_textBlocks (the page\'s start-flush share)') },
        blkHeadMaxLines: { def: 3, unit: 'count', used: U('_textBlocks (heading lines)') },
        blkHeadOverBodyPt: { def: 0.4, unit: 'pt', used: U('_textBlocks (heading over body size)') },
        blkOcrHeadRatio: { def: 1.15, unit: 'ratio', used: U('_textBlocks (OCR heading)') },
        blkOcrHeadWidthShare: { def: 0.75, unit: 'share', used: U('_textBlocks (OCR heading)') },
        blkOcrHeadMaxChars: { def: 80, unit: 'chars', used: U('_textBlocks (OCR heading)') },
        blkMinorAtBodyPt: { def: 0.6, unit: 'pt', used: U('_textBlocks (minor heading at body size)') },
        blkMinorWidthShare: { def: 0.75, unit: 'share', used: U('_textBlocks (bold minor heading)') },
        blkMinorItalicShare: { def: 0.5, unit: 'share', used: U('_textBlocks (minor heading in italic)') },
        blkFamilyWidthShare: { def: 0.6, unit: 'share', used: U('_textBlocks (heading family)') },
        blkFamilyMaxChars: { def: 60, unit: 'chars', used: U('_textBlocks (heading family)') },
        blkFullLastPt: { def: 3, unit: 'pt', used: U('_textBlocks (last line at both edges)') },
        // quote blocks (_quoteBlock)
        blkQuoteItalicMinGlyphs: { def: 12, unit: 'glyphs', used: U('_quoteBlock (italic by its style)') },
        blkQuoteDeepEm: { def: 2, unit: 'em', used: U('_quoteBlock (nested quote, of the body size)') },
        blkQuoteDeepFarEm: { def: 1.5, unit: 'em', used: U('_quoteBlock (first-line indent, of the body size)') },
        // joins across pages and columns
        blkNoteUnderPt: { def: 1.5, unit: 'pt', used: U('_joinPrepare (footnotes under the body size)') },
        blkNoteMinRatio: { def: 0.5, unit: 'ratio', used: U('_joinPrepare (footnotes over half the body size)') },
        blkCoverMinBlocks: { def: 3, unit: 'count', used: U('_joinPrepare (title page)') },
        blkCoverMaxBlocks: { def: 12, unit: 'count', used: U('_joinPrepare (title page)') },
        blkCoverMaxLines: { def: 2, unit: 'count', used: U('_joinPrepare (title page)') },
        blkCoverMinHeads: { def: 2, unit: 'count', used: U('_joinPrepare (title page)') },
        blkCoverHeadStepPt: { def: 0.5, unit: 'pt', used: U('_joinPrepare (title page: smaller than the title)') },
        blkColJoinTolPt: { def: 1, unit: 'pt', used: U('_joinStream (next column)') },
        blkColJoinMinLines: { def: 3, unit: 'count', used: U('_joinStream (next column: lines above)') },
        blkColJoinMinNext: { def: 2, unit: 'count', used: U('_joinStream (next column: lines below)') },
        blkGutterMinRows: { def: 3, unit: 'count', used: ['blocks.js _joinRecut', 'blocks.js _joinTailRows'] },
        blkRecutMaxParas: { def: 4, unit: 'count', used: U('_joinRecut (paragraphs between)') },
        blkRecutNeedCells: { def: 2, unit: 'count', used: U('_joinRecut (cells of a row)') },
        blkContIndentMinPt: { def: 6, unit: 'pt', used: ['blocks.js _joinPageBreak', 'blocks.js _toHtml (item continuation)'] },
        blkContIndentMaxPt: { def: 60, unit: 'pt', used: ['blocks.js _joinPageBreak', 'blocks.js _toHtml (item continuation)'] },
        blkGutterOverlapPt: { def: 1, unit: 'pt', used: U('_joinTables (gutters overlap)') },
        blkTableColTolPt: { def: 2, unit: 'pt', used: U('_joinTables (ruled columns alike)') },
        blkTableColTolEm: { def: 0.6, unit: 'em', used: U('_joinTables (columns alike, of the body size)') },
        blkTableRowYTolPt: { def: 2, unit: 'pt', used: U('_joinTables (rows at one height)') },
        blkTailMaxRows: { def: 3, unit: 'count', used: U('_joinTailRows') },
        blkTailNeedMin: { def: 2, unit: 'count', used: U('_joinTailRows (cells filled)') },
        blkTailNeedShare: { def: 0.6, unit: 'share', used: U('_joinTailRows (cells filled)') },
        blkTailCellMaxSpaces: { def: 4, unit: 'count', used: U('_joinTailRows (a few words a cell)') },
        blkCutRowYEm: { def: 0.4, unit: 'em', used: U('_joinCutRows (one baseline)') },
        blkCutGutterPt: { def: 0.5, unit: 'pt', used: U('_joinCutRows (column start)') },
        blkCutWordGapEm: { def: 0.2, unit: 'em', used: U('_joinCutRows (a word cut by a column)') },
        blkStripMaxWords: { def: 4, unit: 'count', used: U('_joinLineRuns (link strip)') },
        blkStripYEm: { def: 0.3, unit: 'em', used: U('_joinLineRuns (link strip: one baseline)') },
        blkStripSizePt: { def: 1.5, unit: 'pt', used: U('_joinLineRuns (link strip: sizes alike)') },
        blkStripMinItems: { def: 3, unit: 'count', used: U('_joinLineRuns (link strip)') },
        blkHeadCutSizePt: { def: 0.5, unit: 'pt', used: U('_joinLineRuns (cut heading)') },
        blkHeadCutPitchEm: { def: 1.6, unit: 'em', used: U('_joinLineRuns (cut heading)') },
        blkHeadCutStartEm: { def: 0.5, unit: 'em', used: U('_joinLineRuns (cut heading)') },
        blkFloatBesideTolPt: { def: 1, unit: 'pt', used: U('_joinParagraphs (round a float)') },
        blkFloatFullEm: { def: 1.5, unit: 'em', used: U('_joinParagraphs (round a float: full line)') },
        blkSidebarColPt: { def: 2, unit: 'pt', used: U('_joinParagraphs (past a sidebar: same column)') },
        blkSidebarMaxBlocks: { def: 30, unit: 'count', used: U('_joinParagraphs (past a sidebar)') },
        blkSidebarTolPt: { def: 1, unit: 'pt', used: U('_joinParagraphs (past a sidebar: outside the column)') },
        blkSidebarWrapShare: { def: 0.15, unit: 'share', used: U('_joinParagraphs (past a sidebar: wraps)') },
        // HTML
        blkLinkCoverTolPt: { def: 1, unit: 'pt', used: U('_inline (a link on a cover)') },
        blkLinkYEm: { def: 0.3, unit: 'em', used: U('_inline (a glyph\'s point inside a link)') },
        blkLinkTolPt: { def: 1, unit: 'pt', used: U('_inline (a glyph inside a link)') },
        blkUrlWrapMinChars: { def: 3, unit: 'chars', used: U('_inline (a URL wrapped)') },
        blkNumTitleBoldShare: { def: 0.9, unit: 'share', used: U('_toHtml (numbered section title)') },
        blkNumTitlePeerPt: { def: 2, unit: 'pt', used: U('_toHtml (numbered section title: a peer)') },
        blkNumTitleDeeperPt: { def: 2, unit: 'pt', used: U('_toHtml (numbered section title: items deeper)') },
        blkOcrLevelMinCount: { def: 2, unit: 'count', used: U('_toHtml (OCR heading levels)') },
        blkOcrLevelShare: { def: 0.15, unit: 'share', used: U('_toHtml (OCR heading levels)') },
        blkKickerMaxChars: { def: 40, unit: 'chars', used: U('_toHtml (kicker over a heading)') },
        blkListLevelStepPt: { def: 3, unit: 'pt', used: U('_toHtml (list levels)') }
    });

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
            const si = this._structInfo, self = this;
            if (!si || !si.tree || !(si.trust >= this._t('blkTreeTrustMin'))) return blocks;
            const share = this._t('blkTreeParaShare');
            const nodeOf = function (b) {
                if (!b || b.type !== 'p' || !b.glyphs) return null;
                const gs = b.glyphs.filter(function (g) { return g && !g.space && !g.atom && g.ch && g.ch.trim(); });
                if (!gs.length) return null;
                // (the block element: a P; inline code or a quotation inside it is still its text)
                const n = {}; gs.forEach(function (g) { const t = g.struct; if (t && t.block && (!t.sem || /^(Code|Quote|Reference|BibEntry|Note)$/.test(t.sem))) n[t.block] = (n[t.block] || 0) + 1; });
                const id = Object.keys(n).sort(function (a, c) { return n[c] - n[a]; })[0];
                return id && n[id] >= share * gs.length ? id : null;
            };
            const out = [];
            blocks.forEach(function (b) {
                const prev = out[out.length - 1], id = nodeOf(b);
                if (id !== null && prev && prev._pid === id) { self._fire('blocks.treeParagraphJoined'); prev.glyphs = prev.glyphs.concat([{ ch: ' ', space: true }], b.glyphs); prev.pageEnd = b.pageEnd; return; }
                if (id !== null) b._pid = id;
                out.push(b);
            });
            out.forEach(function (b) { delete b._pid; });
            return out;
        },

        _treeTables(blocks) {
            const si = this._structInfo, self = this;
            if (!si || !si.tree || !(si.trust >= this._t('blkTreeTrustMin')) || !si.roles.Table) return blocks;
            const minInk = this._t('blkTreeTableMinGlyphs'), looseMax = this._t('blkTreeTableLooseShare');
            const ink = function (b) { const out = []; b.rows.forEach(function (r) { r.forEach(function (c) { c.forEach(function (g) { if (g && !g.space && !g.atom && g.ch && g.ch.trim()) out.push(g); }); }); }); return out; };
            const tableOf = function (b) {
                if (b.type !== 'table' || b.rtl || !b.rows || !b.rows.length) return null;
                const gs = ink(b); if (gs.length < minInk) return null;
                const n = {}; let loose = 0;
                gs.forEach(function (g) { const t = g.struct && g.struct.table; if (t && g.struct.row >= 0 && g.struct.col >= 0) n[t] = (n[t] || 0) + 1; else if (!g.struct) loose++; });
                const id = Object.keys(n).sort(function (a, c) { return n[c] - n[a]; })[0];
                // no glyph the tree places elsewhere; a few it knows nothing of (text a print style generates: a link's
                // address after it) go with their neighbours — but every cell's run must hold a placed glyph, so no text
                // is left without a cell to go to
                if (!id || n[id] + loose !== gs.length || loose > looseMax * gs.length) return null;
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
                if (tableOf(t) === null) return b;
                self._fire('blocks.treeQuoteTable'); return t;
            });
            // blocks of one Table element in a row: one table
            const merged = [];
            blocks.forEach(function (b) {
                const prev = merged[merged.length - 1], id = tableOf(b);
                if (id !== null && prev && prev._tid === id) { self._fire('blocks.treeTableMerged'); prev.rows = prev.rows.concat(b.rows); prev.pageEnd = b.pageEnd; return; }
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
                b.rows = rows; b.tree = true; delete b._tid; self._fire('blocks.treeTableCells');
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
            if (!si || !si.tree || !(si.trust >= this._t('blkTreeTrustMin'))) return null;
            // a tree that names no heading at all has no say on headings (LibreOffice's PDF of a Word file whose
            // headings are styled paragraphs: every heading would be 'text', and vetoed)
            if (!Object.keys(si.headings).length && !si.roles.H && !si.roles.Title) return null;
            const kinds = [], cover = this._t('blkTreeVoteCover', this._page);
            for (let i = 0; i < lines.length; i++) {
                const gs = lines[i].glyphs.filter(function (g) { return !g.space && !g.atom && g.ch && g.ch.trim(); });
                if (!gs.length) return null;
                const cov = gs.filter(function (g) { return g.struct; });
                if (cov.length < cover * gs.length) return null;
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
            const pg = this._page, maj = this._t('blkDirMajority', pg);
            lines.forEach(function (ln) { R += ln.strong.R; L += ln.strong.L; });
            if (R >= maj * L && R > 0) return 'rtl';
            if (L >= maj * R && L > 0) return 'ltr';
            // no letter at all (a table cell «٣٠٪», a number alone): the direction it stands in — the table's, the caller's —
            // before any guess from alignment or the document language (LibreOffice writes /Lang en-US for Arabic text)
            if (R === 0 && L === 0 && fallbackRtl !== undefined) return fallbackRtl ? 'rtl' : 'ltr';
            if (lines.length === 1) {
                const oneTol = this._t('blkDirOneTouchPt', pg), one = lines[0], tR = Math.abs(one.x1 - right) < oneTol, tL = Math.abs(one.x0 - left) < oneTol;
                if (tR !== tL) this._fire('blocks.dirByOneLineEdge', pg);
                if (tR && !tL) return 'rtl';
                if (tL && !tR) return 'ltr';
            }
            const tol = this._t('blkDirLastTouchPt', pg);
            const last = lines[lines.length - 1];
            const bl = lines.length > 1 ? Math.min.apply(null, lines.map(function (x) { return x.x0; })) : left;
            const br = lines.length > 1 ? Math.max.apply(null, lines.map(function (x) { return x.x1; })) : right;
            const touchR = Math.abs(last.x1 - br) < tol, touchL = Math.abs(last.x0 - bl) < tol;
            if (touchR !== touchL) this._fire('blocks.dirByLastLineEdge', pg);
            if (touchR && !touchL) return 'rtl';
            if (touchL && !touchR) return 'ltr';
            if (R !== L) return R > L ? 'rtl' : 'ltr';
            // use the document language (from PDF metadata) as a fallback before the caller's guess
            if (this._lang && /^(fa|ar|he|ur|ps|sd|ku|yi|dv|ug)/i.test(this._lang)) { this._fire('blocks.dirByLang', pg); return 'rtl'; }
            if (this._lang && /^(en|de|fr|es|pt|it|nl|ru|zh|ja|ko|sv|no|da|fi|pl|cs|hu|ro|tr|vi|el|uk|bg|hr|sk|sl|lt|lv|et|id|ms|th|tl)/i.test(this._lang)) { this._fire('blocks.dirByLang', pg); return 'ltr'; }
            return fallbackRtl ? 'rtl' : 'ltr';
        },

        /** "1. " / "۱) " at the logical start of a line, for either direction. */
        _numMarker(L) {
            const re = /^\s*([0-9\u06F0-\u06F9\u0660-\u0669]{1,3})[.)\u066B]\s/;
            // a bare number set off by a tab-wide gap before a capital ("1⇥Book contractors": ReportLab, word processors)
            const pg = this._page, tabGap = this._t('blkNumTabGapEm', pg), oGap = this._t('blkNumOBulletGapEm', pg);
            const tabNum = function (X) {
                if (X.numTab) return true;
                const ink = X.glyphs.filter(function (g) { return !g.space; });
                let k = 0; while (k < ink.length && k < 3 && /^[0-9]$/.test(ink[k].ch)) k++;
                if (!k || !ink[k] || !/^\p{Lu}/u.test(ink[k].ch)) return false;
                return ink[k].x - (ink[k - 1].x + ink[k - 1].w) > tabGap * X.size;
            };
            // (a direction the line has no letters of is not tried: "Block elements: ■ □ ●" is no right-to-left item)
            // Word's second-level bullet: a Courier "o" before the text
            const ink0 = L.glyphs.filter(function (g) { return !g.space && !g.atom; });
            if (ink0.length > 1 && ink0[0].ch === 'o' && ink0[0].mono && !ink0[1].mono && ink0[1].x - (ink0[0].x + ink0[0].w) > oGap * L.size && L.strong.L >= L.strong.R) {
                this._fire('blocks.numWordOBullet', pg);
                return { rtl: false, text: 'o ', n: '1', bullet: true };
            }
            // (right to left: the "o" at the right end, before the text — Word's RTL list)
            const inkN = ink0.length;
            if (inkN > 1 && ink0[inkN - 1].ch === 'o' && ink0[inkN - 1].mono && !ink0[inkN - 2].mono &&
                ink0[inkN - 1].x - (ink0[inkN - 2].x + ink0[inkN - 2].w) > oGap * L.size && L.strong.R > L.strong.L) {
                this._fire('blocks.numWordOBullet', pg);
                // (the glyph itself goes, not its text's length: an «o» is Latin, and a Latin start of the item — «o pip» —
                // read it into its own run: «pip o»)
                return { rtl: true, text: 'o ', n: '1', bullet: true, glyph: ink0[inkN - 1] };
            }
            // (a bullet at the right end of a Latin line, set off by a gap, on a right-to-left page: an item of a
            // right-to-left list whose text is Latin — a Persian encyclopedia page's external links, «… (https://…) ▪»)
            if ((this._rtlPage || this._rtlDoc || /^(fa|ar|he|ur|ps|ku)\b/i.test(this._lang || '')) && inkN > 1 && /^[\u2022\u25AA\u25AB\u25CF\u25A0\u25E6]$/.test(ink0[inkN - 1].ch) && !L.strong.R &&
                !/^[\u2022\u25AA\u25AB\u25CF\u25A0\u25E6\u25CB\u25A1]$/.test(ink0[inkN - 2].ch) &&
                ink0[inkN - 1].x - (ink0[inkN - 2].x + ink0[inkN - 2].w) > this._t('blkNumRtlBulletGapEm', pg) * L.size) {
                this._fire('blocks.numRtlLatinBullet', pg);
                return { rtl: true, text: ink0[inkN - 1].ch + ' ', n: '1', bullet: true, glyph: ink0[inkN - 1] };
            }
            // (a line of no letters at all — symbols, numbers — reads in the page's direction: «· ₹ 5,400 · ₿ 0.25» read right
            // to left in an English document put its last symbol first)
            const neutralRtl = !L.strong.R && !L.strong.L ? !!(this._rtlPage || this._rtlDoc) : L.strong.R >= L.strong.L;
            const dirs = (neutralRtl ? [true, false] : [false, true]).filter(function (r) { return r ? L.strong.R > 0 || !L.strong.L : L.strong.L > 0 || !L.strong.R; });
            for (const rtl of dirs) {
                const t = this._logical(L, rtl).map(function (g) { return g.ch || ''; }).join('');
                const m0 = t.match(re), m = m0 || (!rtl && tabNum(L) ? t.match(/^\s*([0-9]{1,3})()\s/) : null);
                if (m && !m0) this._fire('blocks.numTabNumber', pg);
                if (m) return { rtl: rtl, text: m[0], n: m[1] };
                // a checkbox typed as a character ("☐ item", "☑ item": Word, Kelk's .docx)
                const tk = t.match(/^\s*([\u2610\u2611\u2612\u2705\u2B1C])\uFE0F?\s/);
                if (tk) this._fire('blocks.numTaskChar', pg);
                if (tk) return { rtl: rtl, text: tk[0], n: '1', bullet: true, task: true, checked: tk[1] !== '\u2610' && tk[1] !== '\u2B1C' };
                // a bullet typed as a character ("• item", word processors' lists)
                const b = t.match(/^\s*[\u2022\u25E6\u25AA\u25AB\u2023\u2043\u2013\u00B7\u25CF\u25CB\u25A0\u25A1\u25BA\u27A2\u2756\u2751\u25FB\u2713\-*]\s/);
                if (b) return { rtl: rtl, text: b[0], n: '1', bullet: true };
                // a dash typed against its word («-مدیر محترم …»: letters' copy lists, written by hand) — an item all the
                // same; before a letter only (a minus is before a number)
                const d = t.match(/^\s*[-\u2013](?=\p{L})/u);
                if (d) this._fire('blocks.numDashBullet', pg);
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
                        out.pop(); self._fire('blocks.dehyphenated', L.page);   // a word hyphenated at the line end: joined again
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
            const noEdges = left === undefined;
            if (left === undefined) { left = Math.min.apply(null, lines.map(function (L) { return L.x0; })); right = Math.max.apply(null, lines.map(function (L) { return L.x1; })); }
            const leftAll = left, rightAll = right, pg = this._page;
            const leads = [], fullUp = [], same = this._t('blkSameSizePt', pg), maxLead = this._t('blkLeadSampleMaxEm', pg), fullS = this._t('blkLeadFullShare', pg);
            for (let i = 1; i < lines.length; i++) {
                const a = lines[i - 1], b = lines[i], d = a.y - b.y;
                if (Math.abs(a.size - b.size) < same && d > 0 && d < maxLead * b.size) { leads.push(d / b.size); fullUp.push(a.x1 - a.x0 > fullS * (right - left)); }
            }
            const leadDef = this._t('blkLeadDefault', pg), leadMax = this._t('blkLeadMax', pg);
            // (two pitches alike to 2 %, each under a line that fills the column — two wraps —, are the leading too where the
            // page has no more to learn from: a short page whose two paragraphs wrap once each, set 1.85 lines apart — a
            // Persian page's line-height of 1.8 —, came apart at each wrap under the default 1.4)
            const twoAlike = leads.length === 2 && fullUp[0] && fullUp[1] && Math.abs(leads[0] - leads[1]) < this._t('blkLeadAlikeShare', pg) * Math.max(leads[0], leads[1]) && !this._bodyLead;
            if (twoAlike) this._fire('blocks.leadTwoAlike', pg);
            let lead = leads.length >= this._t('blkLeadMinSamples', pg) || twoAlike ? median(leads) : (this._bodyLead || leadDef);
            // (no text is set 2.5 lines apart — double spacing is 2: lines that far apart are one-line paragraphs, and
            // their gap is no leading)
            if (lead > leadMax) { lead = this._bodyLead && this._bodyLead < leadMax ? this._bodyLead : leadDef; this._fire('blocks.leadCapped', pg); }
            const atBody = this._t('blkAtBodyPt', pg);
            if (this._bodyLead && lead > this._bodyLead * this._t('blkLeadBodyRatio', pg) && lines.every(function (L) { return Math.abs(L.size - body) < atBody; })) { lead = this._bodyLead; this._fire('blocks.leadBody', pg); }
            const edge = this._t('blkJustEdgePt', pg), inEm = this._t('blkJustIndentEm', pg);
            const full = lines.filter(function (L) { return Math.abs(L.x1 - right) < edge && Math.abs(L.x0 - left) < edge + inEm * L.size; }).length;
            const justified = lines.length >= this._t('blkJustMinLines', pg) && full >= lines.length * this._t('blkJustFullShare', pg);
            if (justified) this._fire('blocks.justified', pg);
            if (!noEdges) this._quoteRuns({ lines: lines, body: body, left: left, right: right, lead: lead });
            return this._lineBreaks({ lines: lines, body: body, left: leftAll, right: rightAll, lead: lead, justified: justified });
        },

        // _groupLines, step 2 — the quote runs: lines set in on both sides, marked `qrun` (and `qrtl`)
        _quoteRuns({ lines, body, left, right, lead }) {
            const self = this, pg = this._page;
            const picMin = this._t('blkQuotePicMinEm', pg), picPad = this._t('blkQuotePicPadEm', pg), picTol = this._t('blkQuotePicTolPt', pg),
                picEdge = this._t('blkQuotePicEdgePt', pg), picGap = this._t('blkQuotePicGapEm', pg), monoMax = this._t('blkQuoteMonoMax', pg),
                qIn = this._t('blkQuoteIndentEm', pg), atBody = this._t('blkAtBodyPt', pg), same = this._t('blkSameSizePt', pg),
                cLeft = this._t('blkQContLeftPt', pg), cTol = this._t('blkQContTolPt', pg), cSpan = this._t('blkQContSpanEm', pg), cPitch = this._t('blkQContPitchEm', pg),
                wrapP = this._t('blkQuoteWrapPitch', pg), shallowEm = this._t('blkQuoteShallowEm', pg), centEm = this._t('blkQuoteCentredEm', pg);
            // a run of lines indented on both sides alike (a browser's default <blockquote>: 40px each side)
            // is a quote — two lines at least, none reaching the column's end.  Lines within a run may
            // have different x0 (nested blockquotes indent further), so we require only that each line is
            // indented from the column's left edge, not that all start at the same x.
            lines.forEach(function (L) { L.qrun = 0; });
            let id = 0;
            // (a line set in because a picture stands in the margin before it — a portrait left of a biography's first lines —
            // is no quote's: its indent is the picture's)
            const pics = ((self._page && self._page.images) || []).filter(function (m) { return m.x1 - m.x0 > picMin * body && m.y1 - m.y0 > picMin * body; });
            const byPic = function (L) {
                const rtlL = L.strong.R > L.strong.L;
                return pics.some(function (m) {
                    if (Math.min(m.y1, L.y + L.size) - Math.max(m.y0, L.y - picPad * L.size) <= 0) return false;
                    return rtlL ? m.x0 >= L.x1 - picTol && m.x0 - L.x1 < picGap * L.size && m.x1 <= right + picEdge : m.x1 <= L.x0 + picTol && L.x0 - m.x1 < picGap * L.size && m.x0 >= left - picEdge;
                });
            };
            lines.forEach(function (L) { L.byPic = byPic(L); if (L.byPic) self._fire('blocks.quotePicIndent', pg); });
            const qi = function (L) { return !L.marker && !L.byPic && L.monoShare < monoMax && L.x0 - left > qIn * L.size && right - L.x1 > qIn * L.size && Math.abs(L.size - body) < atBody && !self._numMarker(L); };
            // a list item's text column, line by line from its marker — full lines too (they are no quote's, and
            // the short ones after them are the item's, not a quote's)
            // (in the item's size: a heading under a list is no text of its last item, nor is what follows the heading —
            // a Persian quote under «## …» after a task list had come in as the items' text, line by line, and was lost)
            const sameSize = function (P, A) { return Math.abs(P.size - A.size) < same; };
            lines.forEach(function (A, i) {
                const P = lines[i - 1];
                if (P && !A.marker && !self._numMarker(A) && (P.marker || P.qcont || self._numMarker(P)) && sameSize(P, A) && A.x0 - left > cLeft &&
                    A.x0 >= P.x0 - cTol && A.x0 - P.x0 < cSpan * A.size && P.y - A.y < cPitch * A.size) { A.qcont = true; self._fire('blocks.itemTextColumn', pg); }
            });
            for (let i = 0; i < lines.length; i++) {
                const A = lines[i];
                if (!qi(A)) continue;
                // the continuation of a list item (its text column) is no quote
                const P = lines[i - 1];
                if (A.qcont) continue;
                if (P && (P.marker || P.qcont || self._numMarker(P)) && sameSize(P, A) && ((A.x0 >= P.x0 - cTol && A.x0 - P.x0 < cSpan * A.size) || (A.x1 <= P.x1 + cTol && P.x1 - A.x1 < cSpan * A.size))) { A.qcont = true; self._fire('blocks.itemTextColumn', pg); continue; }
                // gather consecutive indented lines — allow different x0 (nested quotes) within the run
                // (a paragraph gap apart at most: 2.5 lines, or the leading and a 1-em margin where the leading is large —
                // a Persian font's 1.56 put a browser quote's paragraphs 2.56 lines apart, each one a run of its own)
                const qGap = Math.max(self._t('blkQuoteGapLines', pg), lead + self._t('blkQuoteGapMargin', pg));
                let j = i + 1;
                while (j < lines.length && qi(lines[j]) && !lines[j].qcont && lines[j - 1].y - lines[j].y < qGap * A.size) {
                    // still reject if it looks like a list-item continuation
                    var Pj = lines[j - 1];
                    if (Pj && (Pj.marker || Pj.qcont || self._numMarker(Pj)) && ((lines[j].x0 >= Pj.x0 - cTol && lines[j].x0 - Pj.x0 < cSpan * lines[j].size) || (lines[j].x1 <= Pj.x1 + cTol && Pj.x1 - lines[j].x1 < cSpan * lines[j].size))) break;
                    j++;
                }
                // the lines but the last end near one right edge (the quote's own column)
                // (a right-to-left run ends its lines at the left: «۳-1. …» items flush right, ragged left, are no quote)
                const rtlRun = lines.slice(i, j).reduce(function (s, L) { return s + L.strong.R - L.strong.L; }, 0) > 0;
                // (of a run of paragraphs, the lines that wrap — a wrap's pitch over the next one —, when there are such:
                // a paragraph's last line ends anywhere, and one-line paragraphs around a wrapped one had spread the ends)
                const wrapEnds = lines.slice(i, j - 1).filter(function (L, k) { return L.y - lines[i + k + 1].y < Math.max(wrapP, lead + self._t('blkQuoteWrapLeadPad', pg)) * L.size; });
                const ends = lines.slice(i, j - 1).map(function (L) { return rtlRun ? L.x0 : L.x1; });
                const spreadEnds = wrapEnds.length && wrapEnds.length < j - i - 1 ? wrapEnds.map(function (L) { return rtlRun ? L.x0 : L.x1; }) : ends;
                // (lines that fill the quote's measure — short cells / labels side by side are no quote)
                const widest = Math.max.apply(null, lines.slice(i, j).map(function (L) { return L.x1 - L.x0; }));
                // a one-line quote: indented deeper than a first-line indent, half the column wide at least, not
                // centred, a paragraph gap above and below it from lines at the column's edge
                const one = j - i === 1 && (function () {
                    const B = lines[i - 1], C = lines[i + 1], sz = A.size;
                    // (lines on both sides, at the column's edge and no list's: a lone line shows no column)
                    const oEdge = self._t('blkQuoteOneEdgePt', pg), oGap = self._t('blkQuoteOneGapEm', pg);
                    const atEdge = function (X) { return X && Math.abs(X.x0 - left) < oEdge && !X.qrun && !X.marker && !X.qcont && !self._numMarker(X); };
                    return A.x0 - left > shallowEm * sz && A.x1 - A.x0 > self._t('blkQuoteOneWidthShare', pg) * (right - left) && Math.abs((A.x0 - left) - (right - A.x1)) > centEm * sz &&
                        atEdge(B) && atEdge(C) && B.y - A.y > oGap * sz && A.y - C.y > oGap * sz && A.boldShare < self._t('blkQuoteOneBoldMax', pg);
                })();
                // a shallow indent (a first-line indent's: under 2.2 em) is a quote only when its lines end together, as
                // wrapped text does — a run of one-line paragraphs, each with its first-line indent (text-indent),
                // ends anywhere (the fuzz sets' symbols page in indented paragraphs became a quote)
                const shallow = lines.slice(i, j).every(function (L) { return L.x0 - left < shallowEm * L.size; });
                const spread = spreadEnds.length ? Math.max.apply(null, spreadEnds) - Math.min.apply(null, spreadEnds) : 0;
                // (a quote set in by a shallow margin is set in on both sides: its wrapped lines end short of the column's
                // edge by about as much as they start in — one-line paragraphs with a first-line indent of 1.5 em end
                // anywhere, and some reach the edge)
                // (the edge the column's text reaches, not the region's: a region can run wider than its lines)
                const tL = Math.min.apply(null, lines.map(function (L) { return L.x0; })), tR = Math.max.apply(null, lines.map(function (L) { return L.x1; }));
                const reach = self._t('blkQuoteReachShare', pg);
                const reachesEdge = ends.length > 0 && ends.some(function (e, k) { const L = lines[i + k]; return rtlRun ? e - tL < reach * (tR - L.x1) : tR - e < reach * (L.x0 - tL); });
                // (lines centred in the column, every one, are a centred title or verse, not a quote)
                // (or on one axis of their own, lines of very different lengths: a text box set off-centre on its page —
                // a slide's agenda centred left of a picture — is centred all the same; a wrapped quote's lines share
                // an edge, not a centre)
                const run = lines.slice(i, j), mids = run.map(function (L) { return (L.x0 + L.x1) / 2; }), wid = run.map(function (L) { return L.x1 - L.x0; });
                const centred = run.every(function (L) { return Math.abs((L.x0 - left) - (right - L.x1)) < centEm * L.size; }) ||
                    (run.length >= 2 && Math.max.apply(null, mids) - Math.min.apply(null, mids) < self._t('blkQuoteAxisEm', pg) * A.size && Math.max.apply(null, wid) - Math.min.apply(null, wid) > self._t('blkQuoteAxisWidthEm', pg) * A.size);
                // (and two of its lines a wrap's pitch apart: a column of short lines set apart — a side menu's items,
                // two and a half lines from each other — is no quote's text)
                // (or a sentence among them: a quote of one-line paragraphs set apart says something; menu items are
                // labels of three words at most)
                const sentSp = self._t('blkQuoteSentenceSpaces', pg);
                const wraps = lines.slice(i + 1, j).some(function (L, k) { return lines[i + k].y - L.y < wrapP * L.size; }) ||
                    lines.slice(i, j).some(function (L) { return L.glyphs.filter(function (g) { return g.space; }).length >= sentSp; });
                // (every line a bold «label: value» field: a form's box, set in from the page's edges, is no quote)
                // (or every line a clause of its own, «مرحله 1: …», «مرحله 2: …» set in: an enumeration, no quote)
                const enumText = function (X) { return ENUM.test((X.strong.R > X.strong.L ? self._logical(X, true) : X.glyphs).map(function (g) { return g.ch || ''; }).join('')); };
                const fields = lines.slice(i, j).every(function (L) { return self._boldLabel(L); }) || lines.slice(i, j).every(enumText);
                if (((j - i >= 2 && wraps) || one) && !centred && !fields && widest > self._t('blkQuoteWidestShare', pg) * (right - left) &&
                    spread < (shallow ? self._t('blkQuoteSpreadShallow', pg) : self._t('blkQuoteSpreadShare', pg)) * (right - left) && !(shallow && reachesEdge)) {
                    // (the run's direction, for its nesting: its first line's — the outer level's —, not a majority: an
                    // English quote round a longer Persian one had read as right to left and come back mirrored)
                    if (one) self._fire('blocks.quoteOneLine', pg); else self._fire('blocks.quoteRun', pg);
                    id++; const qrtl = self._quoteRtl(lines.slice(i, j));
                    for (let k = i; k < j; k++) { lines[k].qrun = id; lines[k].qrtl = qrtl; }
                }
                i = j - 1;
            }
        },

        // _groupLines, step 3 — the breaks: each line opens a paragraph group or runs on in the one before
        _lineBreaks({ lines, body, left: leftAll, right: rightAll, lead, justified }) {
            const self = this, pg = this._page, K = this._blkBreakK(pg);
            const groups = []; let cur = null, prev = null;
            // width of a line's first word (at its right end when the line is right to left)
            const firstWord = function (L, rtl) {
                const gs = L.glyphs.filter(function (g) { return !g.atom; });
                if (!gs.length) return 0;
                if (!rtl) { const sp = gs.filter(function (g) { return g.space; })[0]; return (sp ? sp.x : L.x1) - L.x0; }
                const sps = gs.filter(function (g) { return g.space; }), sp = sps[sps.length - 1];
                return L.x1 - (sp ? sp.x + sp.w : L.x0);
            };
            lines.forEach(function (L) {
                // (two lines of one card are measured against the card's own text column — §7: a card's padding made every
                // line of it look short against the page's, and each one a paragraph)
                const sameCard = L.card && prev && prev.card === L.card;
                const left = sameCard ? L.card.left : leftAll, right = sameCard ? L.card.right : rightAll;
                self._lineMarker({ L: L, prev: prev, cur: cur, body: body, left: left, right: right });
                const d = prev ? prev.y - L.y : 0;
                // (a size change, unless one line holds the other's size too: a run in a smaller bold font that wraps
                // makes the next line "smaller" by its count of glyphs, the rest of it at the paragraph's size)
                const holds = function (X, sz) { return X.glyphs.filter(function (g) { return !g.space && Math.abs(g.size - sz) < K.same; }).length >= K.holds; };
                const sizeChange = prev && Math.abs(prev.size - L.size) > K.same && !(Math.abs(prev.size - body) < K.atBody || Math.abs(L.size - body) < K.atBody ? holds(L, prev.size) || holds(prev, L.size) : false);
                const styleChange = prev && ((prev.monoShare > K.monoHi) !== (L.monoShare > K.monoHi) && (prev.monoShare < K.monoLo || L.monoShare < K.monoLo) || sizeChange || (prev.boldShare > K.boldHi) !== (L.boldShare > K.boldHi) && (prev.size > body + K.boldOver || L.size > body + K.boldOver));
                // (or a wide gap after a line the next one's first word would have fitted on: not a wrap — the gap
                // is a paragraph's, even where every paragraph is one line long and the "leading" is that gap; a gap
                // clearly over the leading will do: a line the next word would have fitted on is no wrap — over it:
                // the cap of 1.75 lines sat under a leading of 1.79, and every paragraph lost its first lines)
                const rtlL = L.strong.R > L.strong.L;
                const roomy = prev && !L.marker && (rtlL ? prev.x0 - left : right - prev.x1) > firstWord(L, rtlL) + K.room * L.size;
                const bigGap = prev && (d > Math.max(lead * K.gapLead, K.gapMin) * Math.max(prev.size, L.size) || (roomy && d > Math.max(K.gapRoomyLead * lead, Math.min(K.gapRoomyCap, K.gapRoomyCapLead * lead)) * Math.max(prev.size, L.size)));
                // (a bold line the next word would have fitted on, plain text under it: a clause's heading at body size —
                // «**ماده (1): موضوع**» over its text, Word with no space between — was the paragraph's first line)
                const boldHead = prev && !L.marker && roomy && prev.boldShare > K.bhShare && L.boldShare < K.bhText && d < K.bhPitch * L.size;
                const rtlLine = L.strong.R > L.strong.L;
                // (a hanging indent is no new paragraph: a clause «6- …» wrapped, its next line set in to where the clause's
                // text starts after its number — a Word list typed by hand, «که دارای …» under «6- داشتن …»)
                const hang = prev && !L.marker && (function () {
                    const lg = self._logical(prev, rtlLine);
                    let k = 0, t = '';
                    while (k < lg.length && k < K.hangN) { t += lg[k].ch || ''; k++; if (/^\s*[0-9\u06F0-\u06F9\u0660-\u0669]{1,3}\s*[-\u2013.)]\s+$/.test(t)) break; }
                    if (!/^\s*[0-9\u06F0-\u06F9\u0660-\u0669]{1,3}\s*[-\u2013.)]\s+$/.test(t) || k >= lg.length) return false;
                    const g = lg[k];
                    return rtlLine ? Math.abs(L.x1 - (g.x + g.w)) < K.hangTol : Math.abs(L.x0 - g.x) < K.hangTol;
                })();
                const indent = prev && !L.marker && !hang && !(cur && cur[0].marker) && Math.abs(L.size - body) < K.atBody &&
                    (rtlLine ? (right - L.x1 > K.indent * L.size && prev.x1 > L.x1 + K.indent * L.size)
                             : (L.x0 - left > K.indent * L.size && L.x0 > prev.x0 + K.indent * L.size));
                const shortPrev = prev && justified && !L.marker && !prev.beside && (rtlLine ? prev.x0 > left + K.shortEnd * prev.size : prev.x1 < right - K.shortEnd * prev.size);
                // a first-line indent after a short line starts a paragraph even when that line was indented too
                // (one-line paragraphs of dialogue); continuation lines start at the margin
                const reIndent = prev && !L.marker && !(cur && cur[0].marker) && Math.abs(L.size - body) < K.atBody && !rtlLine &&
                    L.x0 - left > K.indent * L.size && L.x0 - left < K.reMax * L.size && Math.abs(L.x0 - prev.x0) < K.reTol && prev.x1 < right - K.shortEnd * prev.size &&
                    lines.some(function (o) { return Math.abs(o.x0 - left) < K.reTol; });
                // the margin comes back after a short indented line: an indented block (quote) ended (not after a line set
                // in beside a picture: the text runs on under it)
                const outdent = prev && !L.marker && !prev.byPic && !(cur && cur[0].marker) && !rtlLine && prev.x0 - L.x0 > K.indent * L.size && prev.x1 < right - K.shortEnd * prev.size &&
                    !(Math.abs((prev.x0 + prev.x1) / 2 - (L.x0 + L.x1) / 2) < K.outMid && Math.abs((L.x0 + L.x1) / 2 - (left + right) / 2) < K.outCentre);   // centred lines
                // an enumerated note after a short line: "(1) …", "(a) …", "[2] …", "* …", "† …"
                const short = prev && (rtlLine ? prev.x0 > left + Math.max(K.shortShare * (right - left), K.shortEm * prev.size) : prev.x1 < right - Math.max(K.shortShare * (right - left), K.shortEm * prev.size));
                // (for a line break: the edge of the lines in its own column — a region that also holds a sidebar runs
                // to the page's edge, and every line of the article beside it looked short)
                const colEdge = function () {
                    const ov = lines.filter(function (o) { return o.x0 < prev.x1 && o.x1 > prev.x0; });
                    return { l: Math.min.apply(null, ov.map(function (o) { return o.x0; })), r: Math.max.apply(null, ov.map(function (o) { return o.x1; })) };
                };
                const shortCol = function () {
                    if (!short) return false;
                    const e = colEdge(), w = e.r - e.l;
                    return rtlLine ? prev.x0 > e.l + Math.max(K.shortShare * w, K.shortEm * prev.size) : prev.x1 < e.r - Math.max(K.shortShare * w, K.shortEm * prev.size);
                };
                // (and a numbered clause, "۳-1. …", "2.4) …": a list's number cannot hold two levels — the text keeps it)
                const isEnum = function (X) {
                    if (X.enumd === undefined) X.enumd = ENUM.test(X.strong.R > X.strong.L ? self._logical(X, true).map(function (g) { return g.ch || ''; }).join('') : X.glyphs.map(function (g) { return g.ch; }).join(''));
                    return X.enumd;
                };
                const startX = function (X) { return X.strong.R > X.strong.L ? X.x1 : X.x0; };
                // (or after a sentence's end: a clause number does not wrap onto the start of a line mid-sentence)
                const endsSentence = function (X) { const t = (X.strong.R > X.strong.L ? self._logical(X, true) : X.glyphs).map(function (g) { return g.ch || ''; }).join('').replace(/[\s\u200B-\u200F\u2060\uFEFF]+$/, ''); return /[.:;!?؛؟]$/.test(t); };
                const enumd = prev && !L.marker && isEnum(L) && (short || (cur && isEnum(cur[0]) && Math.abs(startX(cur[0]) - startX(L)) < K.enumStart) || endsSentence(prev));
                // a list item's text never runs on left of its marker (right of it, right to left)
                const leftOfItem = cur && cur[0].marker && !L.marker && (cur[0].marker.side === 'right' ? L.x1 > cur[0].marker.x + K.itemLeft * L.size : L.x0 < cur[0].marker.x - K.itemLeft * L.size);
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
                    (rtlL ? prev.x0 - L.x0 : L.x1 - prev.x1) > firstWord(L, rtlL) + K.room * L.size;
                // (a line that starts at the column's edge under one that started far from it — the far half of a form's row,
                // «نوع پژوهش: …» beside «موضوع طرح: …» — is no wrap of it: a wrapped line starts where its paragraph does;
                // not under a line set in by a picture beside it: the text runs on under the picture)
                const rtlS = L.strong.R > L.strong.L, colW = right - left;
                const fromFar = prev && !L.marker && !prev.marker && !prev.byPic && colW > K.wideCol * L.size && (rtlS === (prev.strong.R > prev.strong.L)) &&
                    (rtlS ? right - prev.x1 > K.farShare * colW && right - L.x1 < K.farEdge * L.size : prev.x0 - left > K.farShare * colW && L.x0 - left < K.farEdge * L.size);
                // (a centred line under a line that ends a sentence and fills the column: a flyer's «… لباس گرم، . . .» over
                // «زمان حضور: …» centred — no last line of a centred paragraph, which runs on mid-sentence)
                const midW = right - left;
                const centredAfter = prev && !L.marker && endsSentence(prev) && midW > K.wideCol * L.size && L.x0 - left > K.caIn * L.size &&
                    Math.abs((L.x0 - left) - (right - L.x1)) < K.centTol * L.size && prev.x1 - prev.x0 > K.caFull * midW;
                // (a letter's head field — «تاریخ: …», «شماره: …» kept from its letterhead, §6a — is a paragraph of its own)
                const field = prev && !L.fieldCont && (L.letterField || prev.letterField || !!L.letterHead !== !!prev.letterHead);
                // (a note opened by its mark is a paragraph of its own: endnotes one under the other ran together)
                const noteStart = prev && L.note && prev.note && /^[\u00B9\u00B2\u00B3\u2070-\u2079\u2071\u1D5B\u02E3*]/.test(self._logical(L, L.strong.R > L.strong.L).map(function (g) { return g.ch || ''; }).join('').trim());
                if (!cur || runEdge || noteStart || (!inRun && (styleChange || bigGap || boldHead || L.marker || indent || shortPrev || reIndent || outdent || enumd || leftOfItem || toc || fromFar || stopRoom || field || centredAfter)) || (inRun && bigGap)) {
                    if (cur) self._blkFireBreak({ runEdge, noteStart, inRun, marker: L.marker, styleChange, bigGap, boldHead, indent, shortPrev, reIndent, outdent, enumd, leftOfItem, toc, fromFar, stopRoom, field, centredAfter }, pg);
                    cur = []; groups.push(cur);
                }
                // a line that opens with a bold label («زبان طرح: …», «Date: …») is a field of its own: a line break before it
                // (a form's box of fields ran into one paragraph)
                else if (prev && self._boldLabel(L)) { prev.br = true; self._fire('blocks.brBoldLabel', pg); }
                // a line break kept in a centred block of short lines (a letter's signature, its name over its title: the
                // two lines' middles at one x, their widths apart — no wrap, which fills a line, sets lines so)
                else if (prev && Math.abs((prev.x0 + prev.x1) / 2 - (L.x0 + L.x1) / 2) < K.brMid * L.size && Math.abs((prev.x1 - prev.x0) - (L.x1 - L.x0)) > L.size &&
                         Math.max(prev.x1 - prev.x0, L.x1 - L.x0) < K.brShort * (right - left) && right - left > K.wideCol * L.size) { prev.br = true; self._fire('blocks.brCentredShort', pg); }
                // (two centred lines, the upper one with room on its two sides for the next one's first word: no wrap — a
                // flyer's «زمان حضور: …» over «محل حضور: …», wider than the short-block rule above allows)
                else if (prev && right - left > K.wideCol * L.size && [prev, L].every(function (X) { return X.x0 - left > K.brIn * X.size && right - X.x1 > K.brIn * X.size && Math.abs((X.x0 - left) - (right - X.x1)) < K.centTol * X.size; }) &&
                         (prev.x0 - left) + (right - prev.x1) > firstWord(L, rtlLine) + K.brRoom * L.size) { prev.br = true; self._fire('blocks.brCentredPair', pg); }
                // a line break kept — unless the next line's first word could not have fitted after it (a long URL wraps)
                else if (shortCol() && !prev.beside && right - left > K.wideCol * L.size &&!/[-\u00AD]$/.test(prev.glyphs.map(function (g) { return g.ch; }).join('').trim()) &&
                         !(firstWord(L, rtlLine) > (rtlLine ? prev.x0 - colEdge().l : colEdge().r - prev.x1) - K.brFit * L.size)) { prev.br = true; self._fire('blocks.brShortLine', pg); }
                cur.push(L); prev = L;
            });
            return groups;
        },

        // _lineBreaks — its thresholds, read once a call (thresholds.js)
        _blkBreakK(pg) {
            const t = this;
            return {
                same: t._t('blkSameSizePt', pg), atBody: t._t('blkAtBodyPt', pg), holds: t._t('blkHoldsMinGlyphs', pg),
                monoHi: t._t('blkStyleMonoHigh', pg), monoLo: t._t('blkStyleMonoLow', pg), boldHi: t._t('blkStyleBoldHigh', pg), boldOver: t._t('blkStyleBoldOverPt', pg),
                room: t._t('blkRoomyPadEm', pg), gapLead: t._t('blkBigGapLead', pg), gapMin: t._t('blkBigGapMin', pg),
                gapRoomyLead: t._t('blkBigGapRoomyLead', pg), gapRoomyCap: t._t('blkBigGapRoomyCap', pg), gapRoomyCapLead: t._t('blkBigGapRoomyCapLead', pg),
                bhShare: t._t('blkBoldHeadShare', pg), bhText: t._t('blkBoldHeadTextMax', pg), bhPitch: t._t('blkBoldHeadPitchEm', pg),
                hangN: t._t('blkHangMaxGlyphs', pg), hangTol: t._t('blkHangTolPt', pg), indent: t._t('blkIndentEm', pg), shortEnd: t._t('blkShortEndEm', pg),
                reMax: t._t('blkReIndentMaxEm', pg), reTol: t._t('blkReIndentTolPt', pg), outMid: t._t('blkOutdentMidPt', pg), outCentre: t._t('blkOutdentCentrePt', pg),
                shortShare: t._t('blkShortShare', pg), shortEm: t._t('blkShortEm', pg), enumStart: t._t('blkEnumStartPt', pg), itemLeft: t._t('blkItemLeftEm', pg),
                wideCol: t._t('blkWideColEm', pg), farShare: t._t('blkFromFarShare', pg), farEdge: t._t('blkFromFarEdgeEm', pg),
                caIn: t._t('blkCentredAfterInEm', pg), centTol: t._t('blkCentredTolEm', pg), caFull: t._t('blkCentredAfterFull', pg),
                brMid: t._t('blkBrMidEm', pg), brShort: t._t('blkBrShortShare', pg), brIn: t._t('blkBrCentredInEm', pg), brRoom: t._t('blkBrCentredRoomEm', pg), brFit: t._t('blkBrFitEm', pg)
            };
        },

        // _lineBreaks — telemetry: the reasons a paragraph group was opened (no effect on the output)
        _blkFireBreak(w, pg) {
            if (w.runEdge) this._fire('blocks.breakQuoteEdge', pg);
            if (w.noteStart) this._fire('blocks.breakNoteMark', pg);
            if (w.inRun) { if (w.bigGap) this._fire('blocks.breakGapInQuote', pg); return; }
            if (w.marker) this._fire('blocks.breakMarker', pg);
            if (w.styleChange) this._fire('blocks.breakStyle', pg);
            if (w.bigGap) this._fire('blocks.breakBigGap', pg);
            if (w.boldHead) this._fire('blocks.breakBoldHead', pg);
            if (w.indent) this._fire('blocks.breakIndent', pg);
            if (w.shortPrev) this._fire('blocks.breakShortJustified', pg);
            if (w.reIndent) this._fire('blocks.breakReIndent', pg);
            if (w.outdent) this._fire('blocks.breakOutdent', pg);
            if (w.enumd) this._fire('blocks.breakEnum', pg);
            if (w.leftOfItem) this._fire('blocks.breakLeftOfItem', pg);
            if (w.toc) this._fire('blocks.breakToc', pg);
            if (w.fromFar) this._fire('blocks.breakFromFar', pg);
            if (w.stopRoom) this._fire('blocks.breakStopRoom', pg);
            if (w.field) this._fire('blocks.breakLetterField', pg);
            if (w.centredAfter) this._fire('blocks.breakCentredAfter', pg);
        },

        // _lineBreaks, step 3a — a line's list marker: its number or bullet (`L.num`, `L.marker`), unless it is a wrap's
        _lineMarker({ L, prev, cur, body, left, right }) {
            const self = this, pg = this._page;
            // a number marks a list item only at body size (a larger "1. Introduction" is a heading); a bullet at any
            // size (slides set their first level larger than the second)
            L.num = self._numMarker(L);
            if (L.num && !L.num.bullet && L.size > body + this._t('blkNumOverBodyPt', pg)) { L.num = null; this._fire('blocks.numOverBodyDropped', pg); }
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
                return gap < self._t('blkWrapBulletGapEm', pg) * L.size;
            })();
            if (L.num && L.num.bullet && (/^\s*[-\u2013\u2014]/.test(L.num.text) || wrapped) && prev && cur && cur.length && !cur[0].num && !cur[0].marker && !prev.marker) {
                const rtlP = L.num.rtl, ink = prev.glyphs.filter(function (g) { return !g.space; });
                const tP = self._logical(prev, rtlP).map(function (g) { return g.ch || ''; }).join('').trim();
                const fullEm = this._t('blkDashFullEm', pg), full = rtlP ? prev.x0 - left < fullEm * prev.size : right - prev.x1 < fullEm * prev.size;
                // (or the paragraph's first line, set in by its first-line indent)
                const inBy = rtlP ? L.x1 - prev.x1 : prev.x0 - L.x0;
                const sameStart = Math.abs(inBy) < this._t('blkDashStartEm', pg) * L.size || (cur[0] === prev && inBy > 0 && inBy < this._t('blkDashIndentEm', pg) * L.size);
                const pitch = prev.y - L.y > 0 && prev.y - L.y < this._t('blkDashPitchEm', pg) * Math.max(prev.size, L.size) && Math.abs(prev.size - L.size) < this._t('blkSameSizePt', pg);
                if (ink.length && full && sameStart && pitch && !/[.:;!?\u061B\u061F\u06D4]$/.test(tP)) { L.num = null; L.marker = null; this._fire('blocks.markerWrapDropped', pg); }
            }
            if (L.num && !L.marker) L.marker = { side: L.num.rtl ? 'right' : 'left', x: L.num.rtl ? L.x1 : L.x0, num: true };
        },

        /** A quote's direction, for its nesting (which side its levels are set in from): its first line with letters — the
         * outer level's own — in reading order (top down), not the majority of its letters: an English quote holding a
         * longer Persian one is set in from the left all the same. A quote with no letters: the majority (none: false). */
        _quoteRtl(lines) {
            const first = lines.slice().sort(function (a, b) { return b.y - a.y; }).find(function (L) { return L.strong && L.strong.R + L.strong.L > 0; });
            if (first) return first.strong.R > first.strong.L;
            return lines.reduce(function (n, L) { return n + (L.strong ? L.strong.R - L.strong.L : 0); }, 0) > 0;
        },

        /** A line (or segment) that opens with a bold label: bold text of 30 characters or fewer ending in a colon, then
         * text that is not bold (a field's value) — not a line bold throughout (a heading, a bold paragraph). */
        _boldLabel(X) {
            if (X._bl !== undefined) return X._bl;
            const gs = (X.strong.R > X.strong.L ? this._logical(X, true) : X.glyphs).filter(function (g) { return !g.atom; });
            let k = 0; while (k < gs.length && (gs[k].space || !gs[k].ch.trim())) k++;
            let n = 0, colon = -1;
            const maxN = this._t('blkBoldLabelMaxGlyphs', this._page);
            for (let i = k; i < gs.length && n <= maxN; i++, n++) {
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
            if (!inBox && lines[0].qrun && lines.every(function (L) { return L.qrun === lines[0].qrun; })) return this._quoteBlock({ lines: lines, body: body, left: left, right: right });
            const M = this._metrics;
            const first = lines[0];
            // the structure tree's word on these lines (PDFIMPORT.md §8.4): when it is trusted and reaches them,
            // it tells a heading — and its level — from text, and splits a group the spacing ran together
            const tv = !inBox ? this._treeVote(lines) : null, pg = this._page;
            if (tv && tv.split) this._fire('blocks.treeVoteSplit', pg);
            if (tv && tv.heading) this._fire('blocks.headingTree', pg);
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
                this._fire('blocks.headingBand', pg);
                return [{ type: 'heading', size: first.size, minor: true, band: true, glyphs: this._joinLines(lines, dir), dir: dir }];
            }
            // (a contents entry, bold or large as its level is set, is no heading: the heading is where it points)
            const self0 = this, toc = lines.every(function (L) { return self0._leaderLine(L); });
            const boldS = this._t('blkHeadBoldShare', pg), bigR = this._t('blkHeadBigRatio', pg);
            const allBold = !toc && lines.every(function (L) { return L.boldShare > boldS; });
            // heading? A trusted tree's "text" vetoes only the weak signs below — a bold line of body size, a
            // heading family — not a larger size: a tree can mistag a title as P (LibreOffice from HTML does),
            // and a size is stronger evidence than a tag saying nothing
            const big = !toc && lines.every(function (L) { return L.size >= body * bigR; });
            // (a heading starts at the column's start edge, or is centred: lines pushed to the far side — a letter's
            // signature, name over title, bold and a size up, at the left of a Persian page — are no heading, whatever
            // their face: they stay bold text. The start side's gap a fifth of the column or more, and two fifths more
            // than the far side's)
            const rtlH = lines.reduce(function (a, L) { return a + L.strong.R - L.strong.L; }, 0) > 0, colW = right - left;
            const startGap = rtlH ? right - Math.max.apply(null, lines.map(function (L) { return L.x1; })) : Math.min.apply(null, lines.map(function (L) { return L.x0; })) - left;
            const endGap = rtlH ? Math.min.apply(null, lines.map(function (L) { return L.x0; })) - left : right - Math.max.apply(null, lines.map(function (L) { return L.x1; }));
            const pushed = colW > 0 && startGap > this._t('blkPushedStartShare', pg) * colW && startGap - endGap > this._t('blkPushedDiffShare', pg) * colW && !(this._startFlush < this._t('blkPushedFlushMin', pg));
            if (pushed && (allBold || big)) this._fire('blocks.headingPushedVeto', pg);
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
            const headOk = lines.length <= this._t('blkHeadMaxLines', pg) && first.size > body + this._t('blkHeadOverBodyPt', pg);
            if (!inBox && !pushed && notHead && (allBold || big) && headOk) this._fire('blocks.headingFieldVeto', pg);
            if (!inBox && !pushed && !notHead && (allBold || big) && headOk) {
                const dir = this._blockDir(lines, left, right, true);
                lines.forEach(function (L) { L.br = false; });
                this._fire('blocks.headingSize', pg);
                return [{ type: 'heading', size: first.size, glyphs: this._joinLines(lines, dir), dir: dir, hl: lines }];
            }
            // an OCR layer knows no bold: a short line alone, set an eighth or more over the body, no sentence (a scanned
            // article's third-level headings, 13 pt over 11, read as paragraphs)
            if (this._ocr && !inBox && !toc && !pushed && lines.length === 1 && first.size >= body * this._t('blkOcrHeadRatio', pg) && !first.marker && !first.num && (first.x1 - first.x0) < (right - left) * this._t('blkOcrHeadWidthShare', pg)) {
                const dir = this._blockDir(lines, left, right, true), g = this._joinLines(lines, dir);
                const t = g.map(function (x) { return x.ch || ''; }).join('').trim();
                const ocrHead = t.length <= this._t('blkOcrHeadMaxChars', pg) && !/[.:;,!?؛،]$/.test(t);
                if (ocrHead) this._fire('blocks.headingOcr', pg);
                if (ocrHead) return [{ type: 'heading', size: first.size, glyphs: g, dir: dir, hl: lines }];
            }
            // (a cell of a row is no heading: a borderless table's bold header row, its cells side by side — once the bold of
            // a variable font was read, round 26, «السنة», «الإنتاج (م³)» … came back as four headings)
            // (at body size: the sizes as drawn, not their half points — a bold caption 1.2 pt under a 9.6-pt body, an
            // iText circular scaled to 80 %, rounded to 9 against 9.5 and read as a heading)
            const minorAt = this._t('blkMinorAtBodyPt', pg), Mx = this._metrics;
            const offBody = Mx && Mx.body === body && Mx.bodyExact ? Math.abs(drawnSize(first) - Mx.bodyExact) : Math.abs(first.size - body);
            if (!(tv && tv.text) && !inBox && !pushed && allBold && lines.length === 1 && !first.rowCell && offBody <= minorAt && (first.x1 - first.x0) < (right - left) * this._t('blkMinorWidthShare', pg)) {
                const g = this._joinLines(lines, this._blockDir(lines, left, right, true));
                const t = g.map(function (x) { return x.ch || ''; }).join('');
                // (nor one that ends in a comma: a quote's first line, «« بهره‌گیری از … بخش‌ها،», runs on)
                const minorHead = !/[:：؛.،,]$/.test(t.trim());
                if (minorHead) this._fire('blocks.headingBoldMinor', pg);
                if (minorHead) return [{ type: 'heading', size: first.size, minor: true, italic: first.italicShare > this._t('blkMinorItalicShare', pg), glyphs: g, dir: this._blockDir(lines, left, right, true) }];
            }
            // a short line at body size in a heading family that is not the body's (headings set in their own font)
            const F = this._fam;
            if (!(tv && tv.text) && !toc && !inBox && !pushed && F && F.heads.length && lines.length === 1 && Math.abs(first.size - body) <= minorAt && !first.marker && !first.num && !first.beside &&
                (first.x1 - first.x0) < (right - left) * this._t('blkFamilyWidthShare', pg)) {
                const gs = first.glyphs.filter(function (g) { return !g.space && !g.atom; });
                const f = gs.length && F.of(gs[0].font);
                if (f && F.heads.indexOf(f) >= 0 && gs.every(function (g) { return F.of(g.font) === f; })) {
                    const g = this._joinLines(lines, this._blockDir(lines, left, right, true));
                    const t = g.map(function (x) { return x.ch || ''; }).join('').trim();
                    const famHead = t.length <= this._t('blkFamilyMaxChars', pg) && !/[.:;,!?؛،]$/.test(t);
                    if (famHead) this._fire('blocks.headingFamily', pg);
                    if (famHead) return [{ type: 'heading', size: first.size, minor: true, family: true, glyphs: g.map(function (x) { return Object.assign({}, x, { italic: false }); }), dir: this._blockDir(lines, left, right, true) }];
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
                    this._fire('blocks.listTaskBox', pg);
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
            const indentL = Math.min.apply(null, lines.map(function (L) { return L.x0; })) - left, fl = this._t('blkFullLastPt', pg);
            return [{ type: 'p', glyphs: this._joinLines(lines, dir), dir: dir, lines: lines,
                      indent: dir === 'rtl' ? indentR : indentL, fullLast: Math.abs(lines[lines.length - 1].x1 - right) < fl && Math.abs(lines[lines.length - 1].x0 - left) < fl }];
        },

        // _textBlocks, a quote run — one quote block, its nested quotes set in further as parts of their own
        _quoteBlock({ lines, body, left, right }) {
            const self = this;
            lines.forEach(function (L) { L.qrun = 0; });
            // (its right edge: as far in as its left one, unless its lines run further — a short quote's longest
            // line is no measure of where its lines end)
            // (right to left, mirrored: the lines start at the right, a nested quote is set in from the right edge, and
            // `_qx0`, the start the merge pass in order.js nests by, is −x1 — larger is deeper either way)
            const rtlQ = lines[0].qrtl !== undefined ? lines[0].qrtl : self._quoteRtl(lines);
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
            const pg = this._page, deepEm = this._t('blkQuoteDeepEm', pg), farEm = this._t('blkQuoteDeepFarEm', pg);
            if (ink.length >= this._t('blkQuoteItalicMinGlyphs', pg) && ink.every(function (g) { return g.italic; })) {
                this._fire('blocks.quoteItalicPlain', pg);
                lines.forEach(function (L) { L.glyphs = L.glyphs.map(function (g) { return g.italic ? Object.assign({}, g, { italic: false }) : g; }); });
            }
            const deep = function (L) { return rtlQ ? qR - L.x1 > deepEm * body : L.x0 - qL > deepEm * body; };
            const parts = [];
            lines.forEach(function (L, k) {
                let d = deep(L);
                const N = lines[k + 1];
                if (d && !(parts.length && parts[parts.length - 1].deep) && N && !deep(N) && (rtlQ ? L.x0 - qL : qR - L.x1) < farEm * body) { d = false; self._fire('blocks.quoteFirstLineIndent', pg); }
                if (!parts.length || parts[parts.length - 1].deep !== d) parts.push({ deep: d, lines: [] });
                parts[parts.length - 1].lines.push(L);
            });
            const kids = [];
            if (parts.some(function (P) { return P.deep; })) this._fire('blocks.quoteNested', pg);
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
            return [{ type: 'quote', children: kids, _qx0: rtlQ ? -qR : qL, _qrtl: rtlQ }];
        },

        _joinAcrossPages(blocks) {
            const this_body = (this._metrics && this._metrics.body) || this._t('bodySizePt');
            const slides = /PowerPoint|\bImpress\b|Keynote/i.test(this._producer || '');
            blocks = this._joinPrepare(blocks, this_body);
            const out = this._joinStream(blocks, { body: this_body, slides: slides });
            this._joinLineRuns(out);
            this._joinParagraphs(out);
            this._oneRowTables(out);
            return out;
        },

        // _joinAcrossPages, step 1 — before the joins: rules at a box's edge, the pages' footnotes, a title page
        _joinPrepare(blocks, this_body) {
            // a rule at a page's edge right next to a box (a frame's border cut by the page break) is the box's
            const self = this, boxy = function (b) { return b && (b.type === 'code' || b.type === 'quote' || b.type === 'table'); };
            blocks = blocks.filter(function (b, i) {
                if (b.type !== 'hr') return true;
                if (b.pageEnd && boxy(blocks[i - 1])) { if (blocks[i - 1]) blocks[i - 1].pageEnd = true; self._fire('blocks.joinRuleToBox'); return false; }
                if (b.pageStart && boxy(blocks[i + 1])) { if (blocks[i + 1]) blocks[i + 1].pageStart = true; self._fire('blocks.joinRuleToBox'); return false; }
                return true;
            });
            const noteUnder = this._t('blkNoteUnderPt'), noteMin = this._t('blkNoteMinRatio');
            // footnotes (Word's, a report's): the blocks that close a page, set 1.5 pt or more under the body's size, each
            // opened by its mark («¹ …», «2 …», «* …») — with body text above them on the page. They are the page's notes,
            // not its last text: the paragraph before them is the one the page break cut, and it runs on to the next
            // page past them (they stood between its halves, and the halves were never joined). They come after the
            // block they would have interrupted, in their order
            const noteText = function (x) { return plainOf(x).replace(/^[\u200E\u200F\u202A-\u202E]+/, ''); };
            const isNote = function (x) {
                // (or under Word's separator rule: order.js marks those lines `note`, mark or none)
                if (x && x.type === 'p' && x.lines && x.lines.length && x.lines.every(function (L) { return L.note; })) return true;
                return x && x.type === 'p' && x.lines && x.lines.length && x.lines.every(function (L) { return L.size <= this_body - noteUnder && L.size >= noteMin * this_body; }) &&
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
                    blocks[k].pageEnd = true; self._fire('blocks.joinFootnotesMoved', pg);
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
                const maxL = self._t('blkCoverMaxLines');
                if (first.length < self._t('blkCoverMinBlocks') || first.length > self._t('blkCoverMaxBlocks') || !first.every(function (x) { return x.type === 'hr' || x.type === 'figure' || (x.type === 'heading' || x.type === 'p') && (x.lines || x.hl || []).length <= maxL; })) return;
                const hs = first.filter(function (x) { return x.type === 'heading'; });
                if (hs.length < self._t('blkCoverMinHeads')) return;
                const step = self._t('blkCoverHeadStepPt');
                const top = Math.max.apply(null, hs.map(function (h) { return h.size || 0; }));
                // (only after the cover's text has begun: a subtitle set as a heading right under the title stays one)
                const textAt = first.findIndex(function (x) { return x.type === 'p'; });
                hs.forEach(function (h) {
                    if (!(h.size < top - step) || textAt < 0 || first.indexOf(h) < textAt) return;
                    self._fire('blocks.coverHeadingDemoted');
                    h.type = 'p'; h.lines = h.hl || h.lines || []; h.indent = 0; delete h.level; delete h.minor;
                });
            })();
            return blocks;
        },

        // _joinAcrossPages, step 2 — the stream: each block joined to the one before it (over a page or a column break) or after it
        _joinStream(blocks, { body: this_body, slides }) {
            const out = [], self = this;
            const isCaption = function (x) { return x && x.type === 'p' && x.lines && x.lines.length && x.lines.every(function (L) { return L.caption; }); };
            const notes = [];
            const flushNotes = function () { while (notes.length) out.push(notes.shift()); };
            blocks.forEach(function (b) {
                if (b.note) { notes.push(b); return; }
                if (notes.length && !b.pageStart) flushNotes();
                self._joinRecut(out, b);
                // a paragraph that runs over the page break past a figure's caption at the foot of the page (the figure
                // floats beside it, its caption the page's last line): the paragraph goes on, the caption after it
                const cap = out[out.length - 1];
                let mk = out.length - 1; while (mk >= 0 && (isCaption(out[mk]) || out[mk].type === 'figure')) mk--;
                const main = out[mk];
                if (b.pageStart && b.type === 'p' && isCaption(cap) && cap.pageEnd && main && main.type === 'p' && main.dir === b.dir &&
                    !/[.!?:;\u061F\u06D4)\]"\u201D]$/.test(plainOf(main)) && goesOn(plainOf(b))) {
                    main.glyphs = main.glyphs.concat([{ ch: ' ', space: true }], b.glyphs);
                    cap.pageEnd = b.pageEnd; self._fire('blocks.joinPastCaption'); return;
                }
                const prev = out[out.length - 1];
                // a table that goes on in the next column of the same page, its header row repeated there (Chrome
                // repeats <thead> at each column break as at each page break): one table, the repeat dropped. The
                // repeated header is the evidence — two tables that merely follow one another stay two
                if (prev && !(b.pageStart && prev.pageEnd) && prev.type === 'table' && b.type === 'table' && prev.rows.length && b.rows.length > 1 &&
                    prev.rtl === b.rtl && prev.rows[0].length === b.rows[0].length && prev.rows[0].length >= 2) {
                    const rowText = function (r) { return r.map(function (c) { return c.map(function (g) { return g.ch || ''; }).join('').replace(/\s+/g, ' ').trim(); }).join('|'); };
                    if (rowText(b.rows[0]) === rowText(prev.rows[0]) && rowText(b.rows[0]).replace(/\|/g, '').length) {
                        prev.rows = prev.rows.concat(b.rows.slice(1)); prev.pageEnd = b.pageEnd; prev.rowYs = (prev.rowYs || []).concat(b.rowYs || []);
                        self._fire('blocks.joinTableNextColumn'); return;
                    }
                }
                // (a slide deck's pages are its slides: nothing runs on from one to the next — an agenda's last item took the
                // next slide's title, «… داخلی واحدها پیش دستور»)
                if (prev && b.pageStart && prev.pageEnd && !slides && self._joinPageBreak(prev, b, this_body)) return;
                // a paragraph that runs on from the foot of one column to the head of the next (same page):
                // the last line is full, the next column starts higher up, to the right, in lower case
                if (prev && prev.type === 'p' && b.type === 'p' && prev.fullLast && prev.dir === b.dir && prev.lines && b.lines &&
                    !self._leaderLine(prev.lines[prev.lines.length - 1]) && !(b.lines[0] && self._leaderLine(b.lines[0]))) {
                    const a = prev.lines[prev.lines.length - 1], c = b.lines[0];
                    const first = (b.glyphs.filter(function (g) { return g.ch && /\S/.test(g.ch); })[0] || {}).ch || '';
                    const tol = self._t('blkColJoinTolPt', a.page), next = b.dir === 'rtl' ? c.x1 < a.x0 + tol : c.x0 > a.x1 - tol;
                    // (a column's foot and head hold text: two short lines side by side — a letter's addressee and its
                    // «confidential» mark at the other margin — are no columns)
                    if (a.page === c.page && next && c.y > a.y + a.size && goesOn(first) && (prev.lines.length >= self._t('blkColJoinMinLines', a.page) || b.lines.length >= self._t('blkColJoinMinNext', a.page))) {
                        prev.glyphs = prev.glyphs.concat([{ ch: ' ', space: true }], b.glyphs); prev.lines = prev.lines.concat(b.lines);
                        prev.fullLast = b.fullLast; prev.pageEnd = b.pageEnd; self._fire('blocks.joinNextColumn', a.page); return;
                    }
                }
                flushNotes();
                out.push(b);
            });
            flushNotes();
            return out;
        },

        // _joinStream, step 2a — the rows of a table cut short at a page's foot, recut at the gutters of its next part
        // the rows of a borderless table left on a page with too few rows to show its columns (a header and a
        // row or two: their lines come out as paragraphs) — the part on the next page repeats the header and
        // shows the gutters: the lines between are cut at them
        _joinRecut(out, b) {
            const cellText = function (r) { return r.map(function (c) { return c.map(function (g) { return g.ch || ''; }).join('').replace(/\s+/g, ' ').trim(); }).join('|'); };
            if (b.type !== 'table' || !b.pageStart || !b.gutters || !b.gutters.length || b.rtl || b.rows.length < this._t('blkGutterMinRows')) return;
            let k = out.length - 1;
            const maxP = this._t('blkRecutMaxParas');
            while (k >= 0 && out.length - 1 - k < maxP && out[k].type === 'p' && out[k].lines) k--;
            const T = out[k];
            if (k === out.length - 1 || !T || T.type !== 'table' || T.rtl || !out[out.length - 1].pageEnd) return;
            if (T.rows[0].length !== b.rows[0].length || b.rows[0].length !== b.gutters.length + 1 || cellText(T.rows[0]) !== cellText(b.rows[0])) return;
            const done = this._joinCutRows(this._joinLineGroups(out.slice(k + 1)), b.gutters, this._t('blkRecutNeedCells'));
            if (!done) return;
            this._fire('blocks.joinRecut');
            out.splice(k + 1);
            T.rows = T.rows.concat(done); T.pageEnd = true;
        },

        // _joinStream, step 2b — a block that opens a page joined to the one that closed the page before: code, a table,
        // a quote, a paragraph, a list item's text (true when it is joined)
        _joinPageBreak(prev, b, this_body) {
            const self = this;
            if (prev.type === 'code' && b.type === 'code' && !b.lang) { prev.lines = prev.lines.concat(b.lines); prev.pageEnd = b.pageEnd; self._fire('blocks.joinCodePages'); return true; }
            // a code block whose first line(s) stayed on the previous page
            const monoP = function (x) { return x.type === 'p' && x.lines && x.lines.every(function (L) { return L.monoShare > 0.9; }); };
            if (b.type === 'code' && !b.lang && monoP(prev)) {
                const head = self._codeBlock({ lines: prev.lines, box: { x1: Math.max.apply(null, prev.lines.map(function (L) { return L.x1; })) } });
                prev.type = 'code'; prev.lang = head.lang; prev.lines = head.lines.concat(b.lines); prev.wrapX = head.wrapX; prev.pageEnd = b.pageEnd;
                self._fire('blocks.joinCodeHead'); return true;
            }
            if (prev.type === 'code' && monoP(b)) {
                const tail = self._codeBlock({ lines: b.lines, box: { x1: Math.max.apply(null, b.lines.map(function (L) { return L.x1; })) } });
                prev.lines = prev.lines.concat(tail.lines); prev.pageEnd = b.pageEnd; self._fire('blocks.joinCodeTail'); return true;
            }
            if (self._joinTables(prev, b, this_body)) return true;
            if (prev.type === 'quote' && b.type === 'quote') { prev.children = prev.children.concat(b.children); prev.pageEnd = b.pageEnd; self._fire('blocks.joinQuotePages'); return true; }
            // (ragged text: the last line need not be full when no sentence ends there and the next page goes on in lower case)
            const plain = function (x) { return x.glyphs.map(function (g) { return g.ch || ''; }).join('').trim(); };
            const runsOn = prev.type === 'p' && b.type === 'p' && !/[.!?:;\u061B\u061F\u06D4)\]"\u201D]$/.test(plain(prev)) && goesOn(plain(b));
            // (a table of contents' line — a leader to its page number — is a line of its own on either side of the
            // break: a verso's last entry ran into the recto's first, «… 163 Access, Privacy …»)
            const tocEdge = (prev.lines && prev.lines.length && self._leaderLine(prev.lines[prev.lines.length - 1])) || (b.lines && b.lines.length && self._leaderLine(b.lines[0]));
            if (prev.type === 'p' && b.type === 'p' && (prev.fullLast || runsOn) && prev.dir === b.dir && !tocEdge) {
                prev.glyphs = prev.glyphs.concat([{ ch: ' ', space: true }], b.glyphs); prev.pageEnd = b.pageEnd;
                if (prev.fullLast) self._fire('blocks.joinParaPagesFull'); else self._fire('blocks.joinParaPagesRunsOn');
                return true;
            }
            if (prev.type === 'li' && b.type === 'p' && b.indent > self._t('blkContIndentMinPt') && b.indent <= (prev.indent || 0) + self._t('blkContIndentMaxPt')) {
                prev.glyphs = prev.glyphs.concat([{ ch: ' ', space: true }], b.glyphs); self._fire('blocks.joinItemPages'); return true;
            }
            return false;
        },

        // _joinPageBreak, step 2b.1 — a table that goes on on the next page: its last rows alone there, or its next part
        // down (the same columns) or over (the same rows) (true when it is joined)
        _joinTables(prev, b, this_body) {
            const tail = this._joinTailRows(prev, b, this_body);
            if (tail) { prev.rows = prev.rows.concat(tail); prev.pageEnd = b.pageEnd; this._fire('blocks.joinTableTailRows'); return true; }
            const self = this;
            // a table that goes on on the next page (its header row often repeated there: dropped)
            if (prev.type === 'table' && b.type === 'table' && prev.rows.length && b.rows.length && prev.rtl === b.rtl) {
                const rowText = function (r) { return r.map(function (c) { return c.map(function (g) { return g.ch || ''; }).join('').replace(/\s+/g, ' ').trim(); }).join('|'); };
                const near = function (a, c, tol) { return a && c && a.length === c.length && a.every(function (v, k) { return Math.abs(v - c[k]) <= tol; }); };
                const inner = function (a) { return a ? a.slice(1, -1) : a; };   // the outer edges of a borderless table are its text's
                const repeat = prev.rows[0].length === b.rows[0].length && rowText(b.rows[0]) === rowText(prev.rows[0]);
                // (borderless parts: their gutters — the free bands between the columns — overlap one by one)
                const gOver = this._t('blkGutterOverlapPt');
                const sameGutters = prev.gutters && b.gutters && prev.gutters.length && prev.gutters.length === b.gutters.length &&
                    prev.gutters.every(function (g, k) { const h = b.gutters[k]; return Math.min(g[1], h[1]) - Math.max(g[0], h[0]) > -gOver; });
                const sameCols = prev.rows[0].length === b.rows[0].length && (sameGutters || near(inner(prev.cols), inner(b.cols), prev.ruled && b.ruled ? this._t('blkTableColTolPt') : this._t('blkTableColTolEm') * this_body));
                // down: the same columns (the header row repeated on the new page, or not)
                if (repeat || sameCols) {
                    const more = repeat ? b.rows.slice(1) : b.rows.slice();
                    // a row cut by the page break: rows with an empty first cell at the top of the new page are
                    // the rest of the last row's cells (the first column is the row's key, never left empty)
                    const last = prev.rows[prev.rows.length - 1];
                    const keyCol = prev.rtl ? last.length - 1 : 0;
                    while (more.length && more[0].length === last.length && !more[0][keyCol].length && more[0].some(function (c) { return c.length; })) {
                        self._fire('blocks.joinTableRowCut');
                        // (the rest of a cell's list — an item on the new page's first line, the part above holding items
                        // too — goes on on a line of its own: _cellItems)
                        const opensItem = function (c) { const g = c.filter(function (x) { return !x.space && !x.atom; })[0]; return !!(g && g.itemMark); };
                        more.shift().forEach(function (c, k) {
                            if (!c.length) return;
                            if (!last[k].length) { last[k] = c; return; }
                            const br = opensItem(c) && last[k].some(function (x) { return x.itemMark; });
                            if (br) self._fire('blocks.joinTableRowCutItem');
                            last[k] = last[k].concat([br ? { atom: true, br: true, ch: '' } : { ch: ' ', space: true }], c);
                        });
                    }
                    prev.rows = prev.rows.concat(more); prev.pageEnd = b.pageEnd;
                    if (sameGutters) prev.gutters = prev.gutters.map(function (g, k) { return [Math.max(g[0], b.gutters[k][0]), Math.min(g[1], b.gutters[k][1])]; });
                    prev.rowYs = (prev.rowYs || []).concat(b.rowYs || []);
                    if (repeat) this._fire('blocks.joinTableDownRepeat'); else this._fire('blocks.joinTableDownColumns');
                    return true;
                }
                // over: the columns that did not fit (a wide sheet printed down, then over) — the same rows, at the same heights
                if (prev.rows.length === b.rows.length && near(prev.rowYs, b.rowYs, this._t('blkTableRowYTolPt'))) {
                    this._fire('blocks.joinTableOver');
                    const rtlT = prev.rtl;
                    prev.rows = prev.rows.map(function (r, k) { return rtlT ? b.rows[k].concat(r) : r.concat(b.rows[k]); });
                    prev.align = rtlT ? (b.align || []).concat(prev.align || []) : (prev.align || []).concat(b.align || []);
                    prev.cols = null; prev.pageEnd = b.pageEnd; return true;
                }
            }
            return false;
        },

        // _joinTables, step 2b.2 — the last row or two of a table alone at the top of the next page, as rows
        // the other way round: the last row or two of a table alone at the top of the next page (as a narrower
        // table — its first cells run together — or as a paragraph) are cut at the gutters of the part before
        _joinTailRows(prev, b, this_body) {
            if (prev.type !== 'table' || prev.rtl || !prev.gutters || !prev.gutters.length || prev.rows[0].length !== prev.gutters.length + 1 || prev.rows.length < this._t('blkGutterMinRows')) return null;
            const nc = prev.gutters.length + 1, tailMax = this._t('blkTailMaxRows');
            let groups = null;
            if (b.type === 'table' && !b.rtl && b.rows.length <= tailMax && b.rows[0].length < nc) {
                groups = b.rows.map(function (r, i) {
                    const gs = [];
                    r.forEach(function (c) { if (gs.length && c.length) gs.push({ ch: ' ', space: true }); c.forEach(function (g) { gs.push(g); }); });
                    return { y: -1000 * i, size: this_body, glyphs: gs };
                });
            } else if (b.type === 'p' && b.lines && b.lines.length <= tailMax) groups = this._joinLineGroups([b]);
            if (!groups) return null;
            // (most cells filled, each a few words: a paragraph that happens to fit the columns is no row)
            const rows = this._joinCutRows(groups, prev.gutters, Math.max(this._t('blkTailNeedMin'), Math.ceil(this._t('blkTailNeedShare') * nc)));
            const maxSp = this._t('blkTailCellMaxSpaces');
            if (!rows || rows.some(function (r) { return r.some(function (c) { return c.filter(function (g) { return g.space; }).length > maxSp; }); })) return null;
            return rows;
        },

        // _joinRecut, _joinTailRows — glyph runs cut into a borderless table's rows
        // glyph runs cut at a borderless table's gutters (another page's: they show its columns there) →
        // rows of cells; groups on one baseline make one row. null when a run does not follow the columns
        // (a word cut by a column's start) or a row fills fewer than `need` cells
        _joinCutRows(groups, gut, need) {
            const nc = gut.length + 1, rows = [];
            const rowY = this._t('blkCutRowYEm'), gutIn = this._t('blkCutGutterPt'), wordGap = this._t('blkCutWordGapEm');
            let lastY = null;
            for (let i = 0; i < groups.length; i++) {
                const G = groups[i];
                if (lastY === null || Math.abs(G.y - lastY) > rowY * G.size) { const cs = []; for (let c = 0; c < nc; c++) cs.push([]); rows.push(cs); }
                lastY = G.y;
                const cells = rows[rows.length - 1];
                let ink = null, inkC = -1, bad = false;
                G.glyphs.forEach(function (g) {
                    // (a space Kelk put in when joining lines has no place: it goes with the text before it)
                    let c = inkC < 0 ? 0 : inkC;
                    if (typeof g.x === 'number') {
                        // a column starts where its gutter ends (a longer cell here may run into the gutter)
                        const cx = g.x + (g.w || 0) / 2;
                        c = 0; while (c < gut.length && cx > gut[c][1] - gutIn) c++;
                    }
                    if (!g.space) {
                        if (ink && c !== inkC && (typeof g.x !== 'number' || g.x - (ink.x + (ink.w || 0)) < wordGap * (g.size || G.size))) bad = true;
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
        },

        // _joinRecut, _joinTailRows — the lines of paragraphs as glyph runs, top down
        _joinLineGroups(ps) {
            const ls = [];
            ps.forEach(function (p) { p.lines.forEach(function (L) { ls.push({ y: L.y, size: L.size, x0: L.x0, glyphs: L.glyphs }); }); });
            return ls.sort(function (a, c) { return c.y - a.y || a.x0 - c.x0; });
        },

        // _joinAcrossPages, step 3 — runs of one-line blocks: a code block's label, a strip of links, a cut heading, its rule
        _joinLineRuns(out) {
            // a code block's label drawn in a bar of its own (a framed table in Word: the bar is a row): the one-line block
            // holding just a language name, right before a code block without one
            for (let i = out.length - 2; i >= 0; i--) {
                const a = out[i], b = out[i + 1];
                if (a.type === 'code' && b.type === 'code' && !a.lang && !b.lang && a.lines.length === 1 && /^[\w+#.-]{1,24}$/.test(a.lines[0].trim())) {
                    b.lang = a.lines[0].trim() === 'code' ? '' : a.lines[0].trim(); out.splice(i, 1); this._fire('blocks.codeLabelBar');
                }
            }
            const stripWords = this._t('blkStripMaxWords'), stripY = this._t('blkStripYEm'), stripSize = this._t('blkStripSizePt'), stripMin = this._t('blkStripMinItems');
            // a strip of tabs or menu links on one baseline (a site's sub-navigation: «خانه · خدمات · تماس …»),
            // read as a column each and so a paragraph each: one line again, its items apart
            for (let i = 0; i + 2 < out.length; i++) {
                const one = function (b) {
                    const ls = b && (b.type === 'p' || b.type === 'heading') ? (b.lines || b.hl) : null;
                    if (!ls || ls.length !== 1 || typeof ls[0] !== 'object') return null;
                    const t = b.glyphs.map(function (g) { return g.ch || ''; }).join('').trim();
                    return t && t.split(/\s+/).length <= stripWords ? ls[0] : null;
                };
                const L0 = one(out[i]); if (!L0) continue;
                let j = i + 1;
                while (j < out.length) { const L = one(out[j]); if (!L || L.page !== L0.page || Math.abs(L.y - L0.y) > stripY * L0.size || Math.abs(L.size - L0.size) > stripSize) break; j++; }
                if (j - i < stripMin) continue;
                this._fire('blocks.linkStripJoined', L0.page);
                const run = out.slice(i, j);
                const glyphs = [];
                run.forEach(function (b, k) { if (k) glyphs.push({ ch: ' ', space: true }, { ch: '·' }, { ch: ' ', space: true }); b.glyphs.forEach(function (g) { glyphs.push(b.type === 'heading' ? Object.assign({}, g, { bold: false }) : g); }); });
                out.splice(i, j - i, { type: 'p', glyphs: glyphs, dir: out[i].dir, lines: run.map(function (b) { return (b.lines || b.hl)[0]; }), page: L0.page });
            }
            // a heading cut in two by the reading order (a web page's three-line title, its words set far apart, read as
            // two regions): the next heading of its size on the next line below, starting where it starts, with no
            // sentence end between — one heading
            const cutSize = this._t('blkHeadCutSizePt'), cutPitch = this._t('blkHeadCutPitchEm'), cutStart = this._t('blkHeadCutStartEm');
            for (let i = out.length - 2; i >= 0; i--) {
                const a = out[i], b = out[i + 1];
                if (a.type !== 'heading' || b.type !== 'heading' || !a.hl || !b.hl || a.dir !== b.dir || Math.abs(a.size - b.size) > cutSize) continue;
                const la = a.hl[a.hl.length - 1], lb = b.hl[0];
                if (la.page !== lb.page || la.y - lb.y <= 0 || la.y - lb.y > cutPitch * a.size) continue;
                const start = a.dir === 'rtl' ? Math.abs(Math.max.apply(null, a.hl.map(function (L) { return L.x1; })) - lb.x1) : Math.abs(Math.min.apply(null, a.hl.map(function (L) { return L.x0; })) - lb.x0);
                const ta = a.glyphs.map(function (g) { return g.ch || ''; }).join('').trim();
                if (start > cutStart * a.size || /[.:;!?؛؟]$/.test(ta)) continue;
                this._fire('blocks.headingCutJoined', la.page);
                a.glyphs = a.glyphs.concat([{ ch: ' ', space: true }], b.glyphs); a.hl = a.hl.concat(b.hl);
                out.splice(i + 1, 1);
            }
            // a rule under a heading (its underline, often drawn twice) is the heading's style
            for (let i = out.length - 1; i > 0; i--) {
                if (out[i].type === 'hr' && (out[i - 1].type === 'heading' || out[i - 1].type === 'hr')) { out.splice(i, 1); this._fire('blocks.headingRuleDropped'); }
            }
        },

        // _joinAcrossPages, step 4 — paragraphs broken within a page joined again: round a float, past a sidebar, in a quote
        _joinParagraphs(out) {
            // a paragraph broken by a float it wraps around (figure, its caption): "… in" [figure] [caption] "that …"
            const text = function (b) { return b.glyphs.map(function (g) { return g.ch || ''; }).join('').trim(); };
            const fTol = this._t('blkFloatBesideTolPt'), fFull = this._t('blkFloatFullEm');
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
                    const beside = [La, Lb].some(function (L) { return L.y > fb.y0 && L.y < fb.y1 && (L.x1 < fb.x0 + fTol || L.x0 > fb.x1 - fTol); });
                    const full = a.dir === 'rtl' ? La.x0 - Lb.x0 < fFull * La.size : Lb.x1 - La.x1 < fFull * La.size;
                    if (!beside && !full) continue;
                }
                this._fire('blocks.joinRoundFloat');
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
            const sCol = this._t('blkSidebarColPt'), sMax = this._t('blkSidebarMaxBlocks'), sTol = this._t('blkSidebarTolPt'), sWrap = this._t('blkSidebarWrapShare');
            for (let i = 0; i + 2 < out.length; i++) {
                const a = out[i];
                if (a.type !== 'p' || /[.!?:\u061F\u06D4\u201D"\]]$/.test(text(a))) continue;
                const ca = colOf(a); if (!ca) continue;
                let k = i + 1, ok = true;
                while (k < out.length && k <= i + sMax) {
                    const c = out[k], cc = colOf(c);
                    if (c.type === 'p' && cc && Math.abs(cc.x0 - ca.x0) < sCol && cc.page === ca.page) break;
                    if (!cc || (cc.page !== null && cc.page !== ca.page) || !(cc.x0 >= ca.x1 - sTol || cc.x1 <= ca.x0 + sTol)) { ok = false; break; }
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
                    if (L && (a.dir === 'rtl' ? L.x0 <= ca.x0 + sWrap * width : L.x1 >= ca.x1 - sWrap * width)) { L.br = false; return { ch: ' ', space: true }; }
                    return g;
                });
                this._fire('blocks.joinPastSidebar', ca.page);
                a.glyphs = a.glyphs.concat([{ ch: ' ', space: true }], b.glyphs); a.lines = a.lines.concat(b.lines);
                a.fullLast = b.fullLast; a.pageEnd = b.pageEnd;
                out.splice(k, 1);
            }
            // quote whose first paragraph continues the previous page's last paragraph
            const self = this;
            out.forEach(function (b) {
                if (b.type !== 'quote') return;
                const ch = b.children, merged = [];
                ch.forEach(function (c) {
                    const pr = merged[merged.length - 1];
                    if (pr && pr.type === 'p' && c.type === 'p' && pr.fullLast && c.pageStart) { pr.glyphs = pr.glyphs.concat([{ ch: ' ', space: true }], c.glyphs); self._fire('blocks.joinQuoteParagraphs'); }
                    else merged.push(c);
                });
                b.children = merged;
            });
        },

        // _joinAcrossPages, step 5 — a one-row ruled table that joined no table: its cells as paragraphs
        _oneRowTables(out) {
            // a one-row ruled table (the last row of a table, ruled alone on the next page) that joined no table: its
            // cells are paragraphs, in their order — a row of boxes is no table of its own
            for (let i = out.length - 1; i >= 0; i--) {
                const b = out[i];
                if (b.type !== 'table' || !b.oneRow || b.rows.length !== 1) continue;
                const ps = b.rows[0].filter(function (c) { return c.some(function (g) { return g && !g.space && g.ch && g.ch.trim(); }); })
                    .map(function (c) { return { type: 'p', glyphs: c, dir: b.rtl ? 'rtl' : 'ltr', pageStart: b.pageStart, pageEnd: b.pageEnd }; });
                out.splice.apply(out, [i, 1].concat(ps)); this._fire('blocks.oneRowTableSplit');
            }
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
            const cTol = this._t('blkLinkCoverTolPt'), linkY = this._t('blkLinkYEm'), linkTol = this._t('blkLinkTolPt');
            const onCover = function (l, c) { return !c || l.x0 >= c.x0 - cTol && l.x1 <= c.x1 + cTol && l.y0 >= c.y0 - cTol && l.y1 <= c.y1 + cTol; };
            const linkOf = function (g) { return g && g.x !== undefined && (links || []).filter(function (l) { return l.page === g.page && inside(l, g.x + g.w / 2, g.y + g.size * linkY, linkTol) && onCover(l, g.cover); })[0]; };
            // a line wrap inside a URL shown as a link's text is no space: the browser broke the address where it
            // had to («…/~notes/Top ics…»); the two halves joined are part of the link's own address
            if (links && links.length && glyphs.some(function (g) { return g.wrap; })) {
                const flat = function (u) { try { u = decodeURI(u); } catch (e) { } return u.replace(/%7E/gi, '~'); }, urlMin = this._t('blkUrlWrapMinChars');
                glyphs = glyphs.filter(function (g, i) {
                    if (!g.wrap) return true;
                    const a = linkOf(glyphs[i - 1]), b = linkOf(glyphs[i + 1]);
                    if (!a || !b || a.url !== b.url) return true;
                    let l = '', r = '';
                    for (let k = i - 1; k >= 0 && glyphs[k].ch && !/\s/.test(glyphs[k].ch); k--) l = glyphs[k].ch + l;
                    for (let k = i + 1; k < glyphs.length && glyphs[k].ch && !/\s/.test(glyphs[k].ch); k++) r += glyphs[k].ch;
                    l = l.replace(/^[(\[«"']+/, ''); r = r.replace(/[)\]».,;:"']+$/, '');
                    if (l.length < urlMin || r.length < 1 || !/[\/.]/.test(l + r)) return true;
                    const u = flat(a.url), w = flat(l + r);
                    if (!(u.indexOf(w) >= 0 || a.url.indexOf(l + r) >= 0)) return true;
                    self._fire('blocks.urlWrapJoined', g.page); return false;
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
                if (!WORD.test(sg.text)) { sg.run = plain(sg.run); this._fire('blocks.inlineStyleNoWord'); continue; }
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
            // (the links of the inline runs are this._allLinks — every page's, with their page — read by inl() below)
            const self = this;
            const parts = [];
            // (a letter's invocation — «بسمه تعالی», «باسمه‌تعالی», «بسم الله الرحمن الرحیم», «به نام خدا» — set large and
            // centred over the letter, often in calligraphy, is no heading: a Word circular's «باسمه تعالی» was its `#`)
            const INVOC = /^(?:با?\s*سمه[\s\u200C]*تعالی|بسم[\s\u200C]*الله.*|به[\s\u200C]+نام[\s\u200C]+(?:خدا|خداوند).*)$/;
            // (and «بسمه» and «تعالی» are two words: calligraphy draws them touching, and a ZWNJ was read between them)
            blocks.forEach(function (b) {
                if ((b.type !== 'heading' && b.type !== 'p') || !b.glyphs) return;
                const t = nfkcArabic(b.glyphs.map(function (g) { return g.atom ? '' : g.ch || ''; }).join('')).replace(/[\u064B-\u065F\u0670]/g, '').replace(/[يى]/g, 'ی').replace(/\s+/g, ' ').trim();
                if (!INVOC.test(t)) return;
                if (b.type === 'heading') { b.type = 'p'; delete b.minor; self._fire('blocks.invocationNotHeading'); }
                if (/^با?\s*سمه\u200Cتعالی$/.test(t)) b.glyphs = b.glyphs.map(function (g) { return g.ch === '\u200C' ? Object.assign({}, g, { ch: ' ', space: true }) : g; });
            });
            // (a numbered line set all in bold, alone at its depth in its run of items — «2. درخواست از …:» over bullet items set
            // further in, its sibling «1. …» a paragraph over a sub-heading — is a numbered section title, not a list of one
            // whose items are its children: a paragraph, its number kept in its text)
            const ntBold = this._t('blkNumTitleBoldShare'), ntPeer = this._t('blkNumTitlePeerPt'), ntDeeper = this._t('blkNumTitleDeeperPt');
            for (let i = 0; i < blocks.length; i++) {
                const b = blocks[i];
                if (b.type !== 'li' || !b.ordered || !b.glyphs) continue;
                const ink = b.glyphs.filter(function (g) { return !g.space && !g.atom && g.ch && g.ch.trim(); });
                if (!ink.length || ink.filter(function (g) { return g.bold; }).length < ntBold * ink.length) continue;
                let s0 = i, s1 = i;
                while (s0 > 0 && blocks[s0 - 1].type === 'li') s0--;
                while (s1 < blocks.length - 1 && blocks[s1 + 1].type === 'li') s1++;
                const peer = blocks.slice(s0, s1 + 1).some(function (o) { return o !== b && o.ordered && Math.abs((o.indent || 0) - (b.indent || 0)) < ntPeer; });
                const deeper = s1 > i && (blocks[i + 1].indent || 0) > (b.indent || 0) + ntDeeper;
                if (peer || !deeper) continue;
                this._fire('blocks.numberedTitle');
                const g0 = ink[0], num = String(b.start || 1) + '.';
                const pre = Array.from(num).map(function (c) { return Object.assign({}, g0, { ch: c, space: false }); }).concat([Object.assign({}, g0, { ch: ' ', space: true })]);
                blocks[i] = { type: 'p', glyphs: pre.concat(b.glyphs), dir: b.dir, numbered: true };
            }
            // (a table's title — «جدول 2- …», «Table 3: …», over or under its table — is no heading: set large and bold, it
            // came back as a `#` and entered the outline. It is written bold; a title read as a paragraph is left as it is)
            const TITLE = /^(?:جدول|Table)\s*[0-9۰-۹٠-٩]+(?:\s*[-‐-—:.)]|\s|$)/i;
            blocks.forEach(function (b, k) {
                if (b.type !== 'heading' || b.tree || !b.glyphs) return;
                const prev = blocks[k - 1], next = blocks[k + 1];
                if (!(prev && prev.type === 'table') && !(next && next.type === 'table')) return;
                const t = nfkcArabic(b.glyphs.map(function (g) { return g.atom ? '' : g.ch || ''; }).join('')).replace(/[يى]/g, 'ی').replace(/\s+/g, ' ').trim();
                if (!TITLE.test(t)) return;
                self._fire('blocks.tableTitleNotHeading');
                b.type = 'p'; delete b.minor; delete b.level;
                b.glyphs = b.glyphs.map(function (x) { return x.space || x.atom ? x : Object.assign({}, x, { bold: true }); });
            });
            // heading levels: distinct heading sizes, largest first
            let hs =Array.from(new Set(blocks.filter(function (b) { return b.type === 'heading' && !b.minor; }).map(function (b) { return Math.round(b.size * 2) / 2; }))).sort(function (a, b) { return b - a; });
            // (an OCR layer measures each line's size from its letters' height: one level's headings came out 15 and 17 pt
            // and read as two levels, while a title at 19 and its sections at 17 are two)
            // A size only one heading has goes to the nearest size two or more have, within 15 % — on a tie the larger:
            // a line with no descender (no g, p, y) measures small («Lessons for other teams» 15 among its level's 17).
            // The document's first heading (its title) keeps its own.
            if (this._ocr) {
                const hb = blocks.filter(function (b) { return b.type === 'heading' && !b.minor; });
                const key = function (b) { return Math.round(b.size * 2) / 2; };
                const n = {}; hb.forEach(function (b) { n[key(b)] = (n[key(b)] || 0) + 1; });
                const lvMin = this._t('blkOcrLevelMinCount'), lvShare = this._t('blkOcrLevelShare');
                hb.forEach(function (b, i) {
                    const z = key(b);
                    if (n[z] > 1 || i === 0) return;
                    const to = hs.filter(function (x) { return x !== z && n[x] >= lvMin && Math.abs(x - z) <= lvShare * Math.max(x, z); })
                        .sort(function (a, c) { return Math.abs(a - z) - Math.abs(c - z) || c - a; })[0];
                    if (to) { b.size = to; self._fire('blocks.ocrLevelMerged'); }
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
            blocks.forEach(function (b) { if (b.type === 'heading' && b.minor && !b.tree && !b.band && (!hs.length || b.italic)) { b.type = 'p'; self._fire('blocks.minorHeadingDemoted'); } });
            const kickerMax = this._t('blkKickerMaxChars');
            // a label set small right over a larger heading, nothing between them — a section's kicker («01 / THE
            // BASICS» over «01 Basics»; a contract's one-word tab over its first article): no heading of its own,
            // it read a level deeper than the heading it labels. A short bold line
            for (let k = 0; k + 1 < blocks.length; k++) {
                const a = blocks[k], n = blocks[k + 1];
                if (a.type !== 'heading' || n.type !== 'heading' || a.tree || level(a) <= level(n)) continue;
                const t = a.glyphs.map(function (x) { return x.ch || ''; }).join('').trim();
                if (t.length > kickerMax) continue;
                this._fire('blocks.kickerDemoted');
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
                    const cMin = self._t('blkContIndentMinPt'), cMax = self._t('blkContIndentMaxPt'), lvStep = self._t('blkListLevelStepPt');
                    const contP = function (b) { return b.type === 'p' && run.length && b.indent > cMin && b.indent <= (run[run.length - 1].indent || 0) + cMax; };
                    while (i < blocks.length && (blocks[i].type === 'li' || contP(blocks[i]))) {
                        if (blocks[i].type === 'p') { run[run.length - 1].glyphs = run[run.length - 1].glyphs.concat([{ ch: ' ', space: true }], blocks[i].glyphs); self._fire('blocks.listContinuation'); }
                        else run.push(Object.assign({}, blocks[i]));
                        i++;
                    }
                    // levels: the indents in groups, a new one 3 pt or more past its group's first (not a grid of 4 pt: an
                    // OCR layer set one list's markers 0.4 pt apart across a grid line, and the list came out as two)
                    const levels = [];
                    run.map(function (x) { return x.indent; }).sort(function (a, c) { return a - c; }).forEach(function (v) { if (!levels.length || v - levels[levels.length - 1] >= lvStep) levels.push(v); });
                    run.forEach(function (x) { let k = 0; while (k + 1 < levels.length && x.indent >= levels[k + 1]) k++; x.level = k; });
                    // an item whose marker stands on the other side, deeper by its indent, whose number goes on with the top
                    // level's count, is a top-level item: Firefox draws a right-to-left list's left-to-right items with their
                    // numbers at the left edge, half off the paper (a Persian encyclopedia page's references: 1, 2 right, 3 left, 4 right,
                    // 5–8 left …) — they had made the Persian items a nested list. A nested list of the other direction starts at 1.
                    (function () {
                        let top = null;
                        run.forEach(function (x) {
                            if (x.level === 0) { if (x.ordered) top = x; return; }
                            if (top && x.ordered && x.dir !== top.dir && x.start === top.start + 1) { x.level = 0; top = x; self._fire('blocks.listOtherSideTop'); }
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
