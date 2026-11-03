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

    // the layout literals of this stage, by name (thresholds.js; read with this._t(name, page)). Defaults are the
    // literals as they were; em = of the line's or the body's size as the rule multiplies it; checkboxMinPt and
    // checkboxStrokeMinPt (the task boxes of _pbMarkers) are in the seed of thresholds.js
    PdfImporter._defineThresholds({
        ordCellFillMinPt: { def: 2, unit: 'pt', used: ['order.js _pbCellShading — cell fill, least height and width'] },
        ordCellBandTolPt: { def: 0.6, unit: 'pt', used: ['order.js _pbCellShading — same height / touching tolerance'] },
        ordCellBandGapPt: { def: 1, unit: 'pt', used: ['order.js _pbCellShading — gap bridged side by side'] },
        ordLineFillMinHPt: { def: 2, unit: 'pt', used: ['order.js _pbLineShading — line fill, least height'] },
        ordLineFillMinWPt: { def: 40, unit: 'pt', used: ['order.js _pbLineShading — line fill, least width'] },
        ordLineBandTolPt: { def: 0.6, unit: 'pt', used: ['order.js _pbLineShading — same width / touching tolerance'] },
        ordLineBandGapPt: { def: 1.2, unit: 'pt', used: ['order.js _pbLineShading — gap bridged top to bottom'] },
        ordNoteSizeDropPt: { def: 1.5, unit: 'pt', used: ['order.js _pbNotes — a note line, at least this much under the body size'] },
        ordNoteSizeMinRatio: { def: 0.5, unit: 'ratio', used: ['order.js _pbNotes — a note line, at least this share of the body size'] },
        ordNoteRuleMaxShare: { def: 0.45, unit: 'share', used: ['order.js _pbNotes — separator rule, shorter than this share of the measure'] },
        ordNoteRuleMinEm: { def: 3, unit: 'em', used: ['order.js _pbNotes — separator rule, longer than this many ems'] },
        ordNoteRuleTolPt: { def: 1, unit: 'pt', used: ['order.js _pbNotes — a line under the rule'] },
        ordNoteFirstGapEm: { def: 3, unit: 'em', used: ['order.js _pbNotes — first note within this many ems under the rule'] },
        ordNoteMarkRunEm: { def: 0.3, unit: 'em', used: ['order.js _pbNotes — raised marks side by side are one mark'] },
        ordNoteMarkMaxWEm: { def: 1.6, unit: 'em', used: ['order.js _pbNotes — picture mark, widest'] },
        ordNoteMarkMaxHEm: { def: 1.8, unit: 'em', used: ['order.js _pbNotes — picture mark, tallest'] },
        ordNoteMarkDropEm: { def: 0.3, unit: 'em', used: ['order.js _pbNotes — picture mark, below the baseline'] },
        ordNoteMarkTolPt: { def: 1, unit: 'pt', used: ['order.js _pbNotes — picture mark, overlap with the line\'s start'] },
        ordNoteMarkGapEm: { def: 1.5, unit: 'em', used: ['order.js _pbNotes — picture mark, before the line\'s start'] },
        ordStrikeLoEm: { def: 0.15, unit: 'em', used: ['order.js _pbStrike — strike rule, lowest above the baseline'] },
        ordStrikeHiEm: { def: 0.45, unit: 'em', used: ['order.js _pbStrike — strike rule, highest above the baseline'] },
        ordStrikeShare: { def: 0.8, unit: 'share', used: ['order.js _pbStrike — share of the letters under the rule crossed'] },
        ordBoxPicMaxEm: { def: 1.6, unit: 'em', used: ['order.js _pbBoxPictures — box picture, widest and tallest'] },
        ordBoxPicMinAspect: { def: 0.5, unit: 'ratio', used: ['order.js _pbBoxPictures — box picture, width / height least'] },
        ordBoxPicMaxAspect: { def: 2, unit: 'ratio', used: ['order.js _pbBoxPictures — box picture, width / height most'] },
        ordBoxPicReachEm: { def: 2, unit: 'em', used: ['order.js _pbBoxPictures — box picture, farthest from its line'] },
        ordBoxPicSpaceEm: { def: 0.15, unit: 'em', used: ['order.js _pbBoxPictures — gap beside the box read as a word gap'] },
        ordBoxPicOverlapPt: { def: 0.5, unit: 'pt', used: ['order.js _pbBoxPictures — segments overlapping by this much still side by side'] },
        ordBoxPicJoinEm: { def: 1.2, unit: 'em', used: ['order.js _pbBoxPictures — segment cut at the box rejoined within this gap'] },
        ordLineMidEm: { def: 0.3, unit: 'em', used: ['order.js (shared) — a line\'s reference point, this many ems over its baseline (is it inside a box)'] },
        ordInsideTolPt: { def: 1, unit: 'pt', used: ['order.js (shared) — pad of the inside() test of a line or shape in a box / table'] },
        ordBaselineEm: { def: 0.3, unit: 'em', used: ['order.js (shared) — two lines on one baseline: baselines within this many ems'] },
        ordSameSizePt: { def: 0.6, unit: 'pt', used: ['order.js (shared) — two lines of one size: sizes within this many pt'] },
        ordBoxFillMinWPt: { def: 40, unit: 'pt', used: ['order.js _pbBoxes — background fill joined line by line, least width'] },
        ordBoxFillTolPt: { def: 1, unit: 'pt', used: ['order.js _pbBoxes — fills of one width: edges within'] },
        ordBoxFillGapPt: { def: 1.2, unit: 'pt', used: ['order.js _pbBoxes — fills touching: gap within'] },
        ordBoxSideRuleTolPt: { def: 6, unit: 'pt', used: ['order.js _pbBoxes — side rule of a white box, from its edge'] },
        ordBoxSideRuleShare: { def: 0.5, unit: 'share', used: ['order.js _pbBoxes — side rule of a white box, share of its height'] },
        ordBoxFrameTolPt: { def: 1, unit: 'pt', used: ['order.js _pbBoxes _pbBoxBlocks — a stroked frame on a fill\'s edges'] },
        ordBoxMinWPt: { def: 40, unit: 'pt', used: ['order.js _pbBoxes — a box, least width'] },
        ordBoxMinHPt: { def: 8, unit: 'pt', used: ['order.js _pbBoxes — a box, least height'] },
        ordBandOneRowEm: { def: 2.6, unit: 'em', used: ['order.js _pbFences — zebra band of one line: shorter than this many ems'] },
        ordBandMaxEm: { def: 8, unit: 'em', used: ['order.js _pbFences — zebra band of wrapped cells: at most this many ems tall'] },
        ordBandCellGapEm: { def: 0.3, unit: 'em', used: ['order.js _pbFences — cells side by side in a band: apart by this many ems'] },
        ordBandTolPt: { def: 1, unit: 'pt', used: ['order.js _pbFences — bands of one width: edges within'] },
        ordBandPitchRatio: { def: 3.2, unit: 'ratio', used: ['order.js _pbFences — stacked bands: centres within this many band heights'] },
        ordColRuleMaxWPt: { def: 2, unit: 'pt', used: ['order.js _pbFences — column rule as a rectangle: at most this wide'] },
        ordColRuleMinEm: { def: 5, unit: 'em', used: ['order.js _pbFences — column rule: at least this many body sizes tall'] },
        ordOuterTolPt: { def: 1, unit: 'pt', used: ['order.js _pbFences — a box inside another (outermost boxes)'] },
        ordMonoLineShare: { def: 0.8, unit: 'share', used: ['order.js (shared) — a monospace line: share of monospace glyphs over this'] },
        ordBoxHoldTolPt: { def: 2, unit: 'pt', used: ['order.js _pbBoxBlocks — a box holds a whole line: its ends within'] },
        ordPageFrameMinLines: { def: 10, unit: 'count', used: ['order.js _pbBoxBlocks — page frame: at least this many lines'] },
        ordPageFrameShare: { def: 0.7, unit: 'share', used: ['order.js _pbBoxBlocks — page frame: share of the page\'s lines'] },
        ordBoxBleedEm: { def: 2, unit: 'em', used: ['order.js _pbBoxBlocks — band past the text column on both sides by this many body sizes'] },
        ordBoxCutTolPt: { def: 1, unit: 'pt', used: ['order.js _pbBoxBlocks — box running past the paper\'s side'] },
        ordTitleCellTolPt: { def: 2, unit: 'pt', used: ['order.js _pbBoxBlocks — table title cell: edges with the table\'s within'] },
        ordTitleCellGapEm: { def: 0.5, unit: 'em', used: ['order.js _pbBoxBlocks — table title cell: above the table by under this many ems'] },
        ordBoxFigureShare: { def: 0.4, unit: 'share', used: ['order.js _pbBoxBlocks — figure frame: pictured share of the box'] },
        ordBoxFigureMaxLines: { def: 4, unit: 'count', used: ['order.js _pbBoxBlocks — figure frame: caption lines at most'] },
        ordCardMinLines: { def: 3, unit: 'count', used: ['order.js _pbBoxBlocks — card: at least this many lines'] },
        ordCardHeadBold: { def: 0.85, unit: 'share', used: ['order.js _pbBoxBlocks — card heading: bold share over this'] },
        ordCardHeadMaxChars: { def: 60, unit: 'count', used: ['order.js _pbBoxBlocks — card heading: characters at most'] },
        ordCardPictureShare: { def: 0.1, unit: 'share', used: ['order.js _pbBoxBlocks — card: pictured share of the box'] },
        ordBandTopEm: { def: 2, unit: 'em', used: ['order.js _pbBoxBlocks — section band\'s line at its frame\'s top: within this many ems'] },
        ordBandMaxMono: { def: 0.5, unit: 'share', used: ['order.js _pbBoxBlocks — section band: monospace share under this'] },
        ordBandMinWShare: { def: 0.6, unit: 'share', used: ['order.js _pbBoxBlocks — section band: least share of the measure'] },
        ordBandMaxHEm: { def: 2.5, unit: 'em', used: ['order.js _pbBoxBlocks — section band: shorter than this many ems'] },
        ordBandBelowShare: { def: 0.8, unit: 'share', used: ['order.js _pbBoxBlocks — what stands under the band: overlap share of its width'] },
        ordBandBelowTolPt: { def: 2, unit: 'pt', used: ['order.js _pbBoxBlocks — what stands under the band: edge tolerance'] },
        ordBandBelowGapEm: { def: 1.5, unit: 'em', used: ['order.js _pbBoxBlocks — what stands under the band: within this many ems'] },
        ordBandBelowTallRatio: { def: 2, unit: 'ratio', used: ['order.js _pbBoxBlocks — a frame round the section: this many band heights tall'] },
        ordBandMaxChars: { def: 60, unit: 'count', used: ['order.js _pbBoxBlocks — section band\'s title: characters at most'] },
        ordBandInsetPt: { def: 1, unit: 'pt', used: ['order.js _pbBoxBlocks — band\'s line widened to its band less this'] },
        ordHighlightMaxHEm: { def: 1.5, unit: 'em', used: ['order.js _pbBoxBlocks — highlight: shorter than this many ems'] },
        ordHighlightTolEm: { def: 0.5, unit: 'em', used: ['order.js _pbBoxBlocks — highlight: ends at its line\'s within this many ems'] },
        ordFieldWrapShare: { def: 0.85, unit: 'share', used: ['order.js _pbBoxBlocks — field wrapped: the line above fills this share of the box'] },
        ordFieldWrapInsetEm: { def: 2, unit: 'em', used: ['order.js _pbBoxBlocks — field wrapped: less this many ems'] },
        ordFieldWrapPitchEm: { def: 2.2, unit: 'em', used: ['order.js _pbBoxBlocks — field wrapped: under this many ems below'] },
        ordFieldBoxMaxLines: { def: 6, unit: 'count', used: ['order.js _pbBoxBlocks — frame of form fields: lines at most'] },
        ordBoxTitleSizeRatio: { def: 1.2, unit: 'ratio', used: ['order.js _pbBoxBlocks — framed title: larger than the body by this ratio'] },
        ordBoxTitleCentreEm: { def: 2, unit: 'em', used: ['order.js _pbBoxBlocks — framed title: centred within this many ems'] },
        ordBoxTitleMaxChars: { def: 80, unit: 'count', used: ['order.js _pbBoxBlocks — framed title: characters at most'] },
        ordChipMaxHEm: { def: 3, unit: 'em', used: ['order.js _pbBoxBlocks — chip / badge: shorter than this many ems'] },
        ordChipMaxGlyphs: { def: 6, unit: 'glyphs', used: ['order.js _pbBoxBlocks — chip / badge: glyphs at most'] },
        ordCodeChipMaxHEm: { def: 2.4, unit: 'em', used: ['order.js _pbBoxBlocks — inline-code chip: shorter than this many ems'] },
        ordCodeChipMaxWShare: { def: 0.45, unit: 'share', used: ['order.js _pbBoxBlocks — inline-code chip: narrower than this share of the measure'] },
        ordCodeChipTolPt: { def: 1, unit: 'pt', used: ['order.js _pbBoxBlocks — inline-code chip: text beside it'] },
        ordBoxBarMaxWPt: { def: 5, unit: 'pt', used: ['order.js _pbBoxBlocks — side bar of a box: at most this wide'] },
        ordBoxBarShare: { def: 0.6, unit: 'share', used: ['order.js _pbBoxBlocks — side bar of a box: share of its height'] },
        ordBoxBarTolPt: { def: 6, unit: 'pt', used: ['order.js _pbBoxBlocks — side bar of a box: from its edge'] },
        ordStripTolPt: { def: 1.5, unit: 'pt', used: ['order.js _pbBoxBlocks — code box\'s header strip: edges within'] },
        ordStripMaxHEm: { def: 2.2, unit: 'em', used: ['order.js _pbBoxBlocks — code box\'s header strip: shorter than this many ems'] },
        ordCodeBoxMonoShare: { def: 0.4, unit: 'share', used: ['order.js _pbBoxBlocks — framed box largely monospace: share at least'] },
        ordNestInsetPt: { def: 2, unit: 'pt', used: ['order.js _pbBoxBlocks — nested box: set in by more than'] },
        ordNestTolPt: { def: 1, unit: 'pt', used: ['order.js _pbBoxBlocks — nested box: inside its outer box within'] },
        ordNestMaxHShare: { def: 0.85, unit: 'share', used: ['order.js _pbBoxBlocks — nested box: shorter than this share of the outer'] },
        ordNestDupTolPt: { def: 0.3, unit: 'pt', used: ['order.js _pbBoxBlocks — nested box drawn twice: edges within'] },
        ordNestHoldTolPt: { def: 0.5, unit: 'pt', used: ['order.js _pbBoxBlocks — a box holding another: edges within'] },
        ordNestTwinTolPt: { def: 0.6, unit: 'pt', used: ['order.js _pbBoxBlocks — paragraph shading twins: edges within'] },
        ordQBarMaxWPt: { def: 6, unit: 'pt', used: ['order.js _pbQuoteBars — quote bar: at most this wide'] },
        ordQBarMinWPt: { def: 0.4, unit: 'pt', used: ['order.js _pbQuoteBars — quote bar (a rectangle): at least this wide'] },
        ordQBarMinHEm: { def: 0.8, unit: 'em', used: ['order.js _pbQuoteBars — quote bar: at least this many body sizes tall'] },
        ordQBarAlignPt: { def: 1, unit: 'pt', used: ['order.js _pbQuoteBars — bars at one x: edges within'] },
        ordQBarNestInPt: { def: 2, unit: 'pt', used: ['order.js _pbQuoteBars — a bar further in: by more than'] },
        ordQBarNestReachEm: { def: 8, unit: 'em', used: ['order.js _pbQuoteBars — a bar or a line further in: within this many body sizes'] },
        ordQBarGapTolPt: { def: 1, unit: 'pt', used: ['order.js _pbQuoteBars — bridging bar inside the gap: within'] },
        ordQBarGapEm: { def: 3, unit: 'em', used: ['order.js _pbQuoteBars — bars one under another: a gap of at most this many body sizes'] },
        ordQBarBelowTolPt: { def: 0.5, unit: 'pt', used: ['order.js _pbQuoteBars — a bar below another: overlap within'] },
        ordQBarCornerPt: { def: 1.6, unit: 'pt', used: ['order.js _pbQuoteBars — a rule meeting the bar\'s end: within'] },
        ordQBarCornerRuleHPt: { def: 2, unit: 'pt', used: ['order.js _pbQuoteBars — a thin rectangle as a rule: shorter than'] },
        ordQBarCornerRuleWPt: { def: 6, unit: 'pt', used: ['order.js _pbQuoteBars — a thin rectangle as a rule: wider than'] },
        ordQBarTwinApartPt: { def: 20, unit: 'pt', used: ['order.js _pbQuoteBars — frame\'s other edge: further than this across'] },
        ordQBarTwinTolPt: { def: 2, unit: 'pt', used: ['order.js _pbQuoteBars — frame\'s other edge: ends within'] },
        ordQBarAlongTolPt: { def: 2, unit: 'pt', used: ['order.js _pbQuoteBars — a line along the bar\'s height: within'] },
        ordQBarTextGapEm: { def: 3, unit: 'em', used: ['order.js _pbQuoteBars — the quote\'s text: starts within this many body sizes of the bar'] },
        ordQBarSpanShare: { def: 0.5, unit: 'share', used: ['order.js _pbQuoteBars — the text spans this share of the bar at least'] },
        ordDotSquareTolPt: { def: 2.5, unit: 'pt', used: ['order.js _pbMarkers — a bullet or box is square: sides within'] },
        ordDotMaxPt: { def: 10, unit: 'pt', used: ['order.js _pbMarkers — a bullet: at most this wide'] },
        ordCheckMarkShare: { def: 0.85, unit: 'share', used: ['order.js _pbMarkers — check mark: narrower than this share of its box'] },
        ordPicBulletOverlapPt: { def: 0.5, unit: 'pt', used: ['order.js _pbMarkers — picture bullet: overlapping its line\'s start by at most'] },
        ordPicBulletGapEm: { def: 1.5, unit: 'em', used: ['order.js _pbMarkers — picture bullet: before its line\'s start within this many ems'] },
        ordPicBulletMaxHEm: { def: 1.3, unit: 'em', used: ['order.js _pbMarkers — picture bullet: at most this many ems tall'] },
        ordPicBulletMaxPt: { def: 16, unit: 'pt', used: ['order.js _pbMarkers — picture bullet: at most this wide and tall'] },
        ordPicBulletSquareTolPt: { def: 2, unit: 'pt', used: ['order.js _pbMarkers — picture bullet: square within'] },
        ordPicBulletAlignPt: { def: 1, unit: 'pt', used: ['order.js _pbMarkers — picture bullets at one x and width: within'] },
        ordMarkerSameTolPt: { def: 0.5, unit: 'pt', used: ['order.js _pbMarkers — a used marker and a vector part are one shape: within'] },
        ordFracBarMaxHPt: { def: 1.6, unit: 'pt', used: ['order.js _pbClusters — fraction bar: thinner than'] },
        ordFracBarMaxWPt: { def: 300, unit: 'pt', used: ['order.js _pbClusters — fraction bar: shorter than'] },
        ordFracBarNearPt: { def: 8, unit: 'pt', used: ['order.js _pbClusters — fraction bar: within this of a vector glyph, up or down'] },
        ordFracBarReachPt: { def: 4, unit: 'pt', used: ['order.js _pbClusters — fraction bar: overlapping a vector glyph across, with this pad'] },
        ordBackdropPageShare: { def: 0.33, unit: 'share', used: ['order.js _pbClusters — page background picture: this share of the page at least'] },
        ordBackdropMinLines: { def: 3, unit: 'count', used: ['order.js _pbClusters — page background picture: lines inside it at least'] },
        ordTextInMinGlyphs: { def: 3, unit: 'glyphs', used: ['order.js _pbClusters — a text line in a picture: visible glyphs at least'] },
        ordBackdropImageInk: { def: 4, unit: 'glyphs', used: ['order.js _pbClusters — picture with text over it: glyphs at least'] },
        ordBackdropInk: { def: 12, unit: 'glyphs', used: ['order.js _pbClusters — drawing holding running text: glyphs at least'] },
        ordBackdropWideShare: { def: 0.4, unit: 'share', used: ['order.js _pbClusters — drawing holding running text: its widest line this share of it'] },
        ordBackdropRunInk: { def: 60, unit: 'glyphs', used: ['order.js _pbClusters — drawing holding several lines: glyphs at least'] },
        ordBackdropRunLines: { def: 3, unit: 'count', used: ['order.js _pbClusters — drawing holding several lines: lines at least'] },
        ordLightColourMin: { def: 230, unit: 'level', fixed: true, used: ['order.js _pbClusters — near-white decoration: every channel at least (of 255)'] },
        ordClusterPartTolPt: { def: 1, unit: 'pt', used: ['order.js _pbClusters — a vector part inside its cluster: pad'] },
        ordPanelShare: { def: 0.6, unit: 'share', used: ['order.js _pbClusters — decoration panel: one shape fills this share of its box'] },
        ordPanelMinEm: { def: 3, unit: 'em', used: ['order.js _pbClusters — decoration panel: wider or taller than this many body sizes'] },
        ordIconMaxParts: { def: 4, unit: 'count', used: ['order.js _pbClusters — lone icon: shapes at most'] },
        ordIconMaxEm: { def: 2.5, unit: 'em', used: ['order.js _pbClusters — lone icon: at most this many body sizes each way'] },
        ordInlineRunEm: { def: 1.5, unit: 'em', used: ['order.js _pbInline — a picture in a line\'s run: within this many ems of its ends'] },
        ordInlineHostShare: { def: 0.5, unit: 'share', used: ['order.js _pbInline — a picture in a line\'s band: overlap share of the shorter'] },
        ordInlineMaxHEm: { def: 2.6, unit: 'em', used: ['order.js _pbInline — an inline picture: shorter than this many ems'] },
        ordInlineJoinEm: { def: 1.5, unit: 'em', used: ['order.js _pbInline — inline pictures one formula: apart by under this many body sizes'] },
        ordInlineTwinYEm: { def: 0.2, unit: 'em', used: ['order.js _pbInline — line cut at a picture: baselines within this many ems'] },
        ordInlineTwinSizeShare: { def: 0.15, unit: 'share', used: ['order.js _pbInline — line cut at a picture: sizes within this share'] },
        ordInlineTwinTolPt: { def: 1, unit: 'pt', used: ['order.js _pbInline — line cut at a picture: overlap with it within'] },
        ordInlineTwinGapEm: { def: 1.5, unit: 'em', used: ['order.js _pbInline — line cut at a picture: beside it within this many ems'] },
        ordPicGlyphDescEm: { def: 0.22, unit: 'em', used: ['order.js _pbInline — glyph kept as a picture: crop below the baseline'] },
        ordPicGlyphAscEm: { def: 0.88, unit: 'em', used: ['order.js _pbInline — glyph kept as a picture: crop above the baseline'] },
        ordFigRowGapEm: { def: 3, unit: 'em', used: ['order.js _pbFigures — figure parts side by side: a gap of at most this many body sizes'] },
        ordFigStackGapEm: { def: 0.5, unit: 'em', used: ['order.js _pbFigures — figure rows stacked: a gap under this many body sizes'] },
        ordFigTrimPadPt: { def: 0.5, unit: 'pt', used: ['order.js _pbFigures — figure box trimmed back past a line by'] },
        ordFigTrimOverlapPt: { def: 0.5, unit: 'pt', used: ['order.js _pbFigures — a line reaching into a figure: overlap over'] },
        ordFigTrimMinPt: { def: 2, unit: 'pt', used: ['order.js _pbFigures — a trimmed figure box: at least this wide and tall'] },
        ordFigTrimKeepShare: { def: 0.25, unit: 'share', used: ['order.js _pbFigures — a trimmed figure keeps this share of its box, or is left'] },
        ordHrBandMinHPt: { def: 1.6, unit: 'pt', used: ['order.js _pbRules — filled band as a rule: at least this tall'] },
        ordHrBandMaxHPt: { def: 6, unit: 'pt', used: ['order.js _pbRules — filled band as a rule: at most this tall (or ordHrBandMaxHEm)'] },
        ordHrBandMaxHEm: { def: 0.5, unit: 'em', used: ['order.js _pbRules — filled band as a rule: at most this many body sizes tall'] },
        ordHrUprightMaxWPt: { def: 6, unit: 'pt', used: ['order.js _pbRules — upright band of a frame: at most this wide'] },
        ordHrUprightMinEm: { def: 2, unit: 'em', used: ['order.js _pbRules — upright of a frame: taller than this many body sizes'] },
        ordHrFrameEndPt: { def: 4, unit: 'pt', used: ['order.js _pbRules — an upright meets the rule\'s end: within'] },
        ordHrMinShare: { def: 0.5, unit: 'share', used: ['order.js _pbRules — a rule: at least this share of the measure'] },
        ordHrTableTolPt: { def: 1, unit: 'pt', used: ['order.js _pbRules — a rule inside a ruled table: pad'] },
        ordHrBoxEdgePt: { def: 4, unit: 'pt', used: ['order.js _pbRules — a box\'s border rule: within this of the box'] },
        ordHrBoxShare: { def: 0.8, unit: 'share', used: ['order.js _pbRules — a box\'s border rule: overlap share of its width'] },
        ordHrBoxInTolPt: { def: 1, unit: 'pt', used: ['order.js _pbRules — a rule inside a box: pad'] },
        ordHrFormShare: { def: 0.5, unit: 'share', used: ['order.js _pbRules — a rule of a form\'s frame: overlap share'] },
        ordHrRowTolPt: { def: 1, unit: 'pt', used: ['order.js _pbRules — a row\'s line against the rule: pad'] },
        ordHrRowGapEm: { def: 1.2, unit: 'em', used: ['order.js _pbRules — a row\'s line against the rule: within this many ems'] },
        ordHrCellReachEm: { def: 2, unit: 'em', used: ['order.js _pbRules — a rule along a row of cells: its ends within this many body sizes'] },
        ordHrTightPitchEm: { def: 1.8, unit: 'em', used: ['order.js _pbRules — underline: next line within this many ems (a plain pitch)'] },
        ordHrUnderTolPt: { def: 0.5, unit: 'pt', used: ['order.js _pbRules — underline: the baseline over the rule, less this'] },
        ordHrUnderEm: { def: 0.35, unit: 'em', used: ['order.js _pbRules — underline: within this many ems under the baseline'] },
        ordHrUnderTightEm: { def: 0.75, unit: 'em', used: ['order.js _pbRules — underline: within this many ems at a tight pitch'] },
        ordHrUnderShare: { def: 0.8, unit: 'share', used: ['order.js _pbRules — underline: the text spans this share of the rule'] },
        ordMirrorMinLines: { def: 6, unit: 'count', used: ['order.js _pbColumns — mirrored margins: body lines at least'] },
        ordMirrorLoPct: { def: 0.03, unit: 'share', used: ['order.js _pbColumns — mirrored margins: the page\'s start edge at this percentile'] },
        ordMirrorHiPct: { def: 0.97, unit: 'share', used: ['order.js _pbColumns — mirrored margins: the page\'s end edge at this percentile'] },
        ordMirrorEdgeTolPt: { def: 1.5, unit: 'pt', used: ['order.js _pbColumns — mirrored margins: a line at the edge within'] },
        ordMirrorFlushEm: { def: 1.5, unit: 'em', used: ['order.js _pbColumns — mirrored margins: flush with the document\'s edge within this many body sizes'] },
        ordMirrorSpanShare: { def: 0.92, unit: 'share', used: ['order.js _pbColumns — mirrored margins: the page\'s span this share of the document\'s'] },
        ordMirrorEdgeLines: { def: 2, unit: 'count', used: ['order.js _pbColumns — mirrored margins: lines at each edge at least'] },
        ordMirrorEdgeLinesSum: { def: 6, unit: 'count', used: ['order.js _pbColumns — mirrored margins: lines at both edges at least'] },
        ordMirrorShiftEm: { def: 0.5, unit: 'em', used: ['order.js _pbColumns — mirrored margins: moved by more than this many body sizes'] },
        ordFloatSideTolPt: { def: 1, unit: 'pt', used: ['order.js _pbFloats _pbOrder — a float beside a line: clear by'] },
        ordFloatWrapLookEm: { def: 2.5, unit: 'em', used: ['order.js _pbFloats — wrap below a float: look up this many ems'] },
        ordFloatWrapUpEm: { def: 0.3, unit: 'em', used: ['order.js _pbFloats — wrap below a float: the line above is above by more than'] },
        ordFloatWrapIndentEm: { def: 1.5, unit: 'em', used: ['order.js _pbFloats — wrap below a float: starts with the line above within this many ems'] },
        ordFloatWrapEndPt: { def: 1.5, unit: 'pt', used: ['order.js _pbFloats — wrap below a float: ends with the line above within'] },
        ordRowTolEm: { def: 0.35, unit: 'em', used: ['order.js _pbOrder — items on one row: row keys within this many body sizes'] },
        ordFloatMinBeside: { def: 2, unit: 'count', used: ['order.js _pbOrder — a float goes first: lines beside it at least'] },
        ordRowKeyEm: { def: 0.8, unit: 'em', used: ['order.js _pbOrder — a line\'s row key: this many ems over its baseline'] },
        ordHrRowKeyRatio: { def: 1.01, unit: 'ratio', used: ['order.js _pbOrder — a rule\'s row key: raised by this many row tolerances'] },
        ordSigMinLeafEm: { def: 15, unit: 'em', used: ['order.js _pbOrder — far-side pair: the leaf at least this many ems wide'] },
        ordSigGapShare: { def: 0.25, unit: 'share', used: ['order.js _pbOrder — far-side pair: apart by this share of the leaf'] },
        ordSigMaxWShare: { def: 0.45, unit: 'share', used: ['order.js _pbOrder — far-side pair: each narrower than this share of the leaf'] },
        ordSigStartEm: { def: 1.5, unit: 'em', used: ['order.js _pbOrder — far-side pair: the first at the leaf\'s start within this many ems'] },
        ordSigOverMinEm: { def: 0.6, unit: 'em', used: ['order.js _pbOrder — far-side pair: the line over it at least this many ems up'] },
        ordSigOverMaxEm: { def: 2.2, unit: 'em', used: ['order.js _pbOrder — far-side pair: the line over it at most this many ems up'] },
        ordQuoteItalicShare: { def: 0.7, unit: 'share', used: ['order.js _pbBlocks — quote style\'s own italic: italic share over'] },
        ordQuoteMonoShare: { def: 0.5, unit: 'share', used: ['order.js _pbBlocks — quote style\'s own italic: or monospace share over'] },
        ordQuoteInnerTolPt: { def: 2, unit: 'pt', used: ['order.js _pbBlocks — a line beside a nested quote\'s bar: along it within'] },
        ordTableJoinColEm: { def: 0.6, unit: 'em', used: ['order.js _pbMergeBlocks — tables joined: column positions within this many body sizes'] },
        ordTableJoinGutterPt: { def: 0.5, unit: 'pt', used: ['order.js _pbMergeBlocks — tables joined: gutters overlap, less this'] },
        ordTableJoinGapEm: { def: 5, unit: 'em', used: ['order.js _pbMergeBlocks — tables joined: apart by under this many body sizes'] },
        ordQuoteNestEm: { def: 1.5, unit: 'em', used: ['order.js _pbMergeBlocks — indentation quote nested: deeper by this many body sizes'] },
        ordUnframedMonoShare: { def: 0.9, unit: 'share', used: ['order.js _pbUnframedCode — unframed code: monospace share of each line over'] },
        ordUnframedGapEm: { def: 4.6, unit: 'em', used: ['order.js _pbUnframedCode — unframed code: paragraphs apart by under this many ems'] },
        ordUnframedOneLineMono: { def: 0.98, unit: 'share', used: ['order.js _pbUnframedCode — unframed code of one line: monospace share at least'] },
        ordUnframedMinGlyphs: { def: 2, unit: 'glyphs', used: ['order.js _pbUnframedCode — unframed code of one line: glyphs at least'] },
        ordCodeLabelMaxChars: { def: 24, unit: 'count', used: ['order.js _pbUnframedCode — monospace label, no code: characters at most'] },
        ordCodeLabelMaxWords: { def: 3, unit: 'count', used: ['order.js _pbUnframedCode — monospace label, no code: words at most'] },
        ordOcrBodyTolPt: { def: 1, unit: 'pt', used: ['order.js _ocrMarkers — OCR list rules: body lines within this many pt (or ordOcrBodyTolShare)'] },
        ordOcrBodyTolShare: { def: 0.1, unit: 'share', used: ['order.js _ocrMarkers — OCR list rules: body lines within this share of the body size'] },
        ordOcrIndentEm: { def: 1.5, unit: 'em', used: ['order.js _ocrMarkers — OCR list rules: set in by this many body sizes at least'] },
        ordOcrBulletGapEm: { def: 0.9, unit: 'em', used: ['order.js _ocrMarkers — OCR task box looked at in the gap after the mark when wider than this many ems'] },
        ordOcrBoxMidEm: { def: 0.33, unit: 'em', used: ['order.js _ocrMarkers — OCR task box: its middle this many ems over the baseline'] },
        ordOcrBoxHalfEm: { def: 0.42, unit: 'em', used: ['order.js _ocrMarkers — OCR task box: half its side in ems'] },
        ordOcrMarkerAlignPt: { def: 2, unit: 'pt', used: ['order.js _ocrMarkers — OCR task list: markers at one x within'] },
        ordOcrRunPitchEm: { def: 2.5, unit: 'em', used: ['order.js _ocrMarkers — OCR task list: items within this many ems'] },
        ordOcrTickInside: { def: 0.3, unit: 'share', used: ['order.js _ocrMarkers — OCR ticked box: dark share of its middle at least'] },
        ordOcrTickEdge: { def: 0.2, unit: 'share', used: ['order.js _ocrMarkers — OCR ticked box: dark share of its sides at least'] },
        ordOcrListPitchEm: { def: 1.8, unit: 'em', used: ['order.js _ocrMarkers — OCR list of sentences: lines within this many ems'] },
        ordOcrListIndentPt: { def: 1.5, unit: 'pt', used: ['order.js _ocrMarkers — OCR list of sentences: one indent within'] },
        ordOcrInnerEm: { def: 1, unit: 'em', used: ['order.js _ocrMarkers — OCR list of sentences: a marked line further in by this many body sizes'] },
        ordOcrListMinRun: { def: 2, unit: 'count', used: ['order.js _ocrMarkers — OCR list of sentences: lines at one indent at least'] },
        ordOcrListMinItems: { def: 3, unit: 'count', used: ['order.js _ocrMarkers — OCR list of sentences: lines in all at least'] },
        ordOcrMarkerOffsetEm: { def: 0.9, unit: 'em', used: ['order.js _ocrMarkers — OCR list of sentences: the marker set this many body sizes before the line'] },
        ordOcrScale: { def: 2.5, unit: 'ratio', fixed: true, used: ['order.js _ocrInk — OCR page drawn at this scale'] },
        ordOcrWordYEm: { def: 0.2, unit: 'em', used: ['order.js _ocrInk — OCR word: glyphs on one baseline within'] },
        ordOcrWordGapEm: { def: 0.25, unit: 'em', used: ['order.js _ocrInk — OCR word: glyphs apart by at most'] },
        ordOcrDarkLevel: { def: 140, unit: 'level', fixed: true, used: ['order.js _ocrInk — OCR ink: a dark pixel under this grey (of 255)'] },
        ordOcrWordTopEm: { def: 0.72, unit: 'em', used: ['order.js _ocrInk — OCR word box: top over the baseline'] },
        ordOcrWordBotEm: { def: 0.05, unit: 'em', used: ['order.js _ocrInk — OCR word box: bottom under the baseline'] },
        ordOcrMinPx: { def: 3, unit: 'px', used: ['order.js _ocrInk — OCR word box: at least this many pixels each way'] },
        ordOcrMinRuns: { def: 6, unit: 'count', used: ['order.js _ocrInk — OCR word: dark runs at least'] },
        ordOcrStrikeHiEm: { def: 0.42, unit: 'em', used: ['order.js _ocrInk — OCR strike: rows up to this many ems over the baseline'] },
        ordOcrStrikeLoEm: { def: 0.18, unit: 'em', used: ['order.js _ocrInk — OCR strike: rows from this many ems over the baseline'] },
        ordOcrStrikeMinGlyphs: { def: 3, unit: 'glyphs', used: ['order.js _ocrInk — OCR strike: word glyphs at least'] },
        ordOcrStrikeShare: { def: 0.9, unit: 'share', used: ['order.js _ocrInk — OCR strike: one dark run over this share of the width'] },
        ordOcrRefMinGlyphs: { def: 3, unit: 'glyphs', used: ['order.js _ocrInk — OCR stroke reference: words of this many glyphs at least'] },
        ordOcrBoldRatio: { def: 1.3, unit: 'ratio', used: ['order.js _ocrInk — OCR bold: strokes this many times the page\'s usual'] },
        ordOcrBoldMinGlyphs: { def: 2, unit: 'glyphs', used: ['order.js _ocrInk — OCR bold: word glyphs at least'] },
        ordOcrBoxBorderShare: { def: 0.15, unit: 'share', used: ['order.js _ocrBox — OCR box: border this share of its width'] },
        ordOcrBoxDarkLevel: { def: 215, unit: 'level', fixed: true, used: ['order.js _ocrBox — OCR box: a dark pixel under this grey'] },
        ordOcrBoxFaintLevel: { def: 245, unit: 'level', fixed: true, used: ['order.js _ocrBox — OCR box: a faint pixel under this grey'] },
        ordOcrRowEm: { def: 0.25, unit: 'em', used: ['order.js _ocrRepair — OCR row: baselines within this many ems'] },
        ordOcrCodeSizeShare: { def: 0.93, unit: 'share', used: ['order.js _ocrRepair — OCR code row: size at most this share of the body'] },
        ordOcrCodePunct: { def: 2, unit: 'count', used: ['order.js _ocrRepair — OCR code row: code punctuation at least'] },
        ordOcrCodeWordGlyphs: { def: 3, unit: 'glyphs', used: ['order.js _ocrRepair — OCR code row: words of this many letters at least'] },
        ordOcrCodeMinWords: { def: 4, unit: 'count', used: ['order.js _ocrRepair — OCR code row: such words at least'] },
        ordOcrCodeLetterEm: { def: 0.47, unit: 'em', used: ['order.js _ocrRepair — OCR code row: median letter width at least'] },
        ordOcrTallMinLetters: { def: 6, unit: 'count', used: ['order.js _ocrRepair — OCR line without descender: letters at least'] },
        ordOcrTallSizeTolPt: { def: 0.5, unit: 'pt', used: ['order.js _ocrRepair — OCR line without descender: at least the body less this'] },
        ordOcrTallRatio: { def: 1.2, unit: 'ratio', used: ['order.js _ocrRepair — OCR line without descender: size raised by this ratio'] },
        ordOcrBodySnapShare: { def: 0.15, unit: 'share', used: ['order.js _ocrRepair — OCR sizes within this share of the body are the body\'s'] },
        ordOcrBodySnapMono: { def: 0.5, unit: 'share', used: ['order.js _ocrRepair — OCR body snap: monospace share under this'] },
        ordOcrJoinLongEm: { def: 2.2, unit: 'em', used: ['order.js _ocrRepair — OCR prose cut at an ink gap: two long runs within this many ems'] },
        ordOcrJoinLongGlyphs: { def: 12, unit: 'glyphs', used: ['order.js _ocrRepair — OCR prose cut at an ink gap: a long run at least'] },
        ordOcrJoinShortEm: { def: 1.6, unit: 'em', used: ['order.js _ocrRepair — OCR prose cut at an ink gap: short beside long within this many ems'] },
        ordOcrJoinShortGlyphs: { def: 4, unit: 'glyphs', used: ['order.js _ocrRepair — OCR prose cut at an ink gap: the short run at least'] },
        ordOcrJoinLongerGlyphs: { def: 25, unit: 'glyphs', used: ['order.js _ocrRepair — OCR prose cut at an ink gap: the long run (beside a short one) at least'] },
        ordOcrJoinSizePt: { def: 0.5, unit: 'pt', used: ['order.js _ocrRepair — OCR prose cut at an ink gap: sizes within'] },
        ordFormMaxMono: { def: 0.5, unit: 'share', used: ['order.js _formRows — form row: monospace share at most'] },
        ordFormRowEm: { def: 0.4, unit: 'em', used: ['order.js _formRows — form row: segments on one baseline within this many ems'] },
        ordFieldLabelMaxChars: { def: 25, unit: 'count', used: ['order.js _formRows — a lone field: its colon within this many characters'] },
        ordFieldValueMaxChars: { def: 60, unit: 'count', used: ['order.js _formRows — a lone field: its value at most this many characters'] },
        ordFormLeadEm: { def: 1, unit: 'em', used: ['order.js _formRows — a value just above the first form row: within this many ems'] },
        ordFormContPitchEm: { def: 1.8, unit: 'em', used: ['order.js _formRows — a value\'s next line: within this many ems below'] },
        ordFormContShare: { def: 0.5, unit: 'share', used: ['order.js _formRows — a value\'s next line: the value wider than this share of it'] },
        ordFormRunGapEm: { def: 3, unit: 'em', used: ['order.js _formRows — form rows one under another: within this many body sizes'] },
        ordFormColumnTolPt: { def: 2, unit: 'pt', used: ['order.js _formRows — two form rows whose labels start at one x: within'] },
        ordFormFrameShare: { def: 0.5, unit: 'share', used: ['order.js _formRows — form frame: a rule or fill along this share of it'] },
        ordFormFramePadEm: { def: 2, unit: 'em', used: ['order.js _formRows — form frame: within this many body sizes of it'] },
        ordFormMinRows: { def: 3, unit: 'count', used: ['order.js _formRows — a form: rows at least (or two in one column)'] },
        ordFormValueRowEm: { def: 1, unit: 'em', used: ['order.js _formRows — a value alone on its row: within this many ems of its pair\'s row'] },
        ordFormValueOverlapPt: { def: 1, unit: 'pt', used: ['order.js _formRows — a value alone on its row: overlapping its label by at most'] },
        ordLatticeMaxPt: { def: 8, unit: 'pt', used: ['order.js _dotLattice — dot grid: dots at most this wide'] },
        ordLatticeSquareTolPt: { def: 1, unit: 'pt', used: ['order.js _dotLattice — dot grid: dots square within'] },
        ordLatticeSizeTolPt: { def: 0.6, unit: 'pt', used: ['order.js _dotLattice — dot grid: dots of one size within'] },
        ordLatticePosTolPt: { def: 0.6, unit: 'pt', used: ['order.js _dotLattice — dot grid: one position within'] },
        ordLatticePitchShare: { def: 0.15, unit: 'share', used: ['order.js _dotLattice — dot grid: steps of one pitch within this share'] },
        ordLatticeMinDots: { def: 9, unit: 'count', used: ['order.js _dotLattice — dot grid: dots at least'] },
        ordLatticeMinAxis: { def: 3, unit: 'count', used: ['order.js _dotLattice — dot grid: rows and columns at least'] },
        ordLatticeFillShare: { def: 0.75, unit: 'share', used: ['order.js _dotLattice — dot grid: share of its points filled'] },
        ordXyBaselineEm: { def: 0.5, unit: 'em', used: ['order.js _xyCut — header row leaf: baselines apart by this many body sizes count as two'] },
        ordXyHeaderMaxRows: { def: 2, unit: 'count', used: ['order.js _xyCut — header row leaf: baselines at most'] },
        ordXyHeaderGapEm: { def: 1.5, unit: 'em', used: ['order.js _xyCut — header row leaf: above its body within this many body sizes'] },
        ordXyHeaderOverlapEm: { def: 0.5, unit: 'em', used: ['order.js _xyCut — header row leaf: overlapping its body by at most this many body sizes'] },
        ordColGapEm: { def: 0.9, unit: 'em', used: ['order.js _xyTests _xyRegions — a column gutter: at least this many body sizes (or ordColGapMinPt)'] },
        ordColGapMinPt: { def: 6, unit: 'pt', used: ['order.js _xyTests _xyRegions — a column gutter: at least this wide'] },
        ordRowGapEm: { def: 0.25, unit: 'em', used: ['order.js _xyTests _xyRegions — a row gap: at least this many body sizes'] },
        ordRowsMinLines: { def: 4, unit: 'count', used: ['order.js _xyTests — borderless table: lines at least'] },
        ordRowsSharedShare: { def: 0.6, unit: 'share', used: ['order.js _xyTests — borderless table: share of lines sharing a baseline'] },
        ordRowsMaxWords: { def: 4, unit: 'count', used: ['order.js _xyTests — borderless table: median words a cell at most'] },
        ordRowsNarrowShare: { def: 0.6, unit: 'share', used: ['order.js _xyTests — columns of prose: a narrow line under this share of the region'] },
        ordRowsHeadingRatio: { def: 1.15, unit: 'ratio', used: ['order.js _xyTests — columns of prose: headings larger than the body by this ratio'] },
        ordRowsProseMinLines: { def: 6, unit: 'count', used: ['order.js _xyTests — columns of prose: lines a column at least'] },
        ordRowsProseEndShare: { def: 0.15, unit: 'share', used: ['order.js _xyTests — columns of prose: a line runs to the far side within this share'] },
        ordRowsProseMinSpaces: { def: 2, unit: 'count', used: ['order.js _xyTests — columns of prose: spaces a running line at least'] },
        ordRowsProseShare: { def: 0.4, unit: 'share', used: ['order.js _xyTests — columns of prose: share of such lines a column'] },
        ordBandedRowTolPt: { def: 0.5, unit: 'pt', used: ['order.js _xyTests — banded header row: a cell at the gutter\'s side within'] },
        ordThroughRowsMaxWords: { def: 4, unit: 'count', used: ['order.js _xyTests — gutter through a table\'s rows: words a cell at most'] },
        ordThroughRowsShare: { def: 0.8, unit: 'share', used: ['order.js _xyTests — gutter through a table\'s rows: share of the narrow part paired'] },
        ordSideBySideShare: { def: 0.5, unit: 'share', used: ['order.js _xyTests — columns side by side: share of each part meeting the next'] },
        ordShortColMinItems: { def: 3, unit: 'count', used: ['order.js _xyTests — short column beside a long one: items at least'] },
        ordShortColShare: { def: 0.8, unit: 'share', used: ['order.js _xyTests — short column beside a long one: share meeting it'] },
        ordShortColEndEm: { def: 2, unit: 'em', used: ['order.js _xyTests — short column beside a long one: tops within this many body sizes'] },
        ordBaselineRunMaxWords: { def: 5, unit: 'count', used: ['order.js _xyTests — table at the text\'s pitch: words a cell at most'] },
        ordBaselineRunPitchEm: { def: 2.6, unit: 'em', used: ['order.js _xyTests — table at the text\'s pitch: rows within this many ems'] },
        ordBaselineRunMinSteps: { def: 2, unit: 'count', used: ['order.js _xyTests — table at the text\'s pitch: row steps at least (three rows)'] },
        ordBaselineRunHeadGapEm: { def: 0.3, unit: 'em', used: ['order.js _xyTests — its header row: cells apart by this many body sizes (or ordBaselineRunHeadGapPt)'] },
        ordBaselineRunHeadGapPt: { def: 2, unit: 'pt', used: ['order.js _xyTests — its header row: cells apart by at least'] },
        ordBaselineRunHeadTolPt: { def: 0.5, unit: 'pt', used: ['order.js _xyTests — its header row: a cell crossing a gutter by more than'] },
        ordCellishMinLines: { def: 3, unit: 'count', used: ['order.js _xyRegions — cell segments tell a table: at least (or ordCellishShare)'] },
        ordCellishShare: { def: 0.25, unit: 'share', used: ['order.js _xyRegions — cell segments tell a table: share of the region\'s items'] },
        ordFenceRuleShare: { def: 0.6, unit: 'share', used: ['order.js _xyRegions — a fencing column rule: along this share of the region'] },
        ordFenceSideTolPt: { def: 1, unit: 'pt', used: ['order.js _xyRegions — a band\'s side in the gutter: within'] },
        ordWallMaxWPt: { def: 3, unit: 'pt', used: ['order.js _xyRegions — sidebar wall: at most this wide'] },
        ordWallShare: { def: 0.8, unit: 'share', used: ['order.js _xyRegions — sidebar wall: along this share of the region'] },
        ordWallTolPt: { def: 1, unit: 'pt', used: ['order.js _xyRegions — sidebar wall: items clear of it by'] },
        ordWallMinItems: { def: 2, unit: 'count', used: ['order.js _xyRegions — sidebar wall: items on each side at least'] },
        ordWallFigureReachPt: { def: 25, unit: 'pt', used: ['order.js _xyRegions — sidebar wall: a picture may reach over it by'] },
        ordBandedRowMaxWords: { def: 8, unit: 'count', used: ['order.js _xyRegions — banded table: words a cell at most'] },
        ordCardGapTolPt: { def: 0.5, unit: 'pt', used: ['order.js _xyRegions — a gap between two lines of one card: edges within'] },
        ordColsMinItems: { def: 4, unit: 'count', used: ['order.js _xyRegions — a part with columns: items at least'] },
        ordColsWideMinItems: { def: 3, unit: 'count', used: ['order.js _xyRegions — a part with columns across a wide gutter: items at least'] },
        ordColsWideGapEm: { def: 2, unit: 'em', used: ['order.js _xyRegions — a wide gutter: at least this many body sizes'] },
        ordColsTextPitchEm: { def: 1.6, unit: 'em', used: ['order.js _xyRegions — a column of text: two lines within this many ems'] },
        ordCutSizeSlack: { def: 2, unit: 'count', used: ['order.js _xyRegions — choosing a cut: column regions of sizes within this many items tie'] },
        ordCutGapSlackEm: { def: 0.3, unit: 'em', used: ['order.js _xyRegions — choosing a cut: a wider gap by this many body sizes wins a tie'] },
        ordSlabAlignPt: { def: 2, unit: 'pt', used: ['order.js _xyRegions — slabs whose cells start at one x: within'] },
        ordSlabRunMinItems: { def: 4, unit: 'count', used: ['order.js _xyRegions — a run of table slabs: items at least'] },
        ordLeafColGapEm: { def: 0.3, unit: 'em', used: ['order.js _rowsLeaf — a cell gutter in a rows leaf: at least this many body sizes (or ordLeafColGapPt)'] },
        ordLeafColGapPt: { def: 3, unit: 'pt', used: ['order.js _rowsLeaf — a cell gutter in a rows leaf: at least'] },
        ordLeafCellGapEm: { def: 0.15, unit: 'em', used: ['order.js _rowsLeaf — a gutter at an undrawn cell gap: at least this many body sizes (or ordLeafCellGapPt)'] },
        ordLeafCellGapPt: { def: 1.5, unit: 'pt', used: ['order.js _rowsLeaf — a gutter at an undrawn cell gap: at least'] },
        ordLeafRowEm: { def: 0.4, unit: 'em', used: ['order.js _rowsLeaf — a row of the leaf: baselines within this many ems'] },
        ordJustGapEm: { def: 0.2, unit: 'em', used: ['order.js _rowsLeaf — justified row: a word gap wider than this many ems'] },
        ordJustMinGaps: { def: 3, unit: 'count', used: ['order.js _rowsLeaf — justified row: word gaps at least'] },
        ordJustEdgeEm: { def: 1.5, unit: 'em', used: ['order.js _rowsLeaf — justified row: at the leaf\'s sides within this many ems'] },
        ordJustEvenEm: { def: 0.15, unit: 'em', used: ['order.js _rowsLeaf — justified row: gaps of one width within this many ems'] },
        ordJustNeighbourEm: { def: 2.6, unit: 'em', used: ['order.js _rowsLeaf — justified row: a row of cells beside it within this many ems'] },
        ordLeafInnerGapEm: { def: 0.6, unit: 'em', used: ['order.js _rowsLeaf — a gutter inside a line: a letter gap of this many ems'] },
        ordLeafMeetShare: { def: 0.5, unit: 'share', used: ['order.js _rowsLeaf — common gutter: at least this share of the cell gap'] },
        ordLeafFarEm: { def: 2.6, unit: 'em', used: ['order.js _rowsLeaf — a row set apart from the table: further than this many ems'] },
        ordLeafHeaderFarEm: { def: 5, unit: 'em', used: ['order.js _rowsLeaf — a header row set apart: still its row within this many ems'] },
        ordLeafWrapEm: { def: 1.7, unit: 'em', used: ['order.js _rowsLeaf — a wrapped cell\'s line: within this many ems of its row'] },
        ordLeafGoesOnEm: { def: 5, unit: 'em', used: ['order.js _rowsLeaf — a wrapped cell\'s line: the table goes on within this many ems'] },
        ordLeafMinCells: { def: 3, unit: 'count', used: ['order.js _rowsLeaf — a one-row table: cells at least'] },
        ordSpanWidthShare: { def: 0.6, unit: 'share', used: ['order.js _rowSpans — a band or rule bounding rows: across this share of the leaf'] },
        ordSpanMinEm: { def: 0.5, unit: 'em', used: ['order.js _rowSpans — a row span: at least this many body sizes'] },
        ordSpanMaxEm: { def: 8, unit: 'em', used: ['order.js _rowSpans — a row span: under this many body sizes'] },
        ordSpanJoinYPt: { def: 0.6, unit: 'pt', used: ['order.js _rowSpans — rule pieces on one height: within'] },
        ordSpanJoinGapPt: { def: 1.5, unit: 'pt', used: ['order.js _rowSpans — rule pieces touching: gap within'] },
        ordSpanRuleDupPt: { def: 1, unit: 'pt', used: ['order.js _rowSpans — a rule drawn twice: within'] },
        ordSpanLikeShare: { def: 0.25, unit: 'share', used: ['order.js _rowSpans — row spans of one height: within this share'] },
        ordSpanAdjTolPt: { def: 1.5, unit: 'pt', used: ['order.js _rowSpans — row spans side by side: ends within'] },
        ordRuleColTopEm: { def: 1.6, unit: 'em', used: ['order.js _ruleColumns — rules of a table\'s rows: from this many ems over its first baseline'] },
        ordRuleColBottomEm: { def: 1.2, unit: 'em', used: ['order.js _ruleColumns — rules of a table\'s rows: to this many ems under its last baseline'] },
        ordRuleColYPt: { def: 0.6, unit: 'pt', used: ['order.js _ruleColumns — rule pieces on one height: within'] },
        ordRuleColMeetPt: { def: 1.2, unit: 'pt', used: ['order.js _ruleColumns — rule pieces meeting: within'] },
        ordRuleColMergePt: { def: 2, unit: 'pt', used: ['order.js _ruleColumns — breaks at one x: within'] },
        ordRuleColShare: { def: 0.6, unit: 'share', used: ['order.js _ruleColumns — a break shared by this share of the rule rows'] },
        ordRuleColHalfPt: { def: 0.25, unit: 'pt', used: ['order.js _ruleColumns — a column boundary from a break: half its width'] },
        ordGridSplitEm: { def: 0.3, unit: 'em', used: ['order.js _gridTable — a line across a gutter splits at a glyph gap of this many ems'] },
        ordGridSplitTolPt: { def: 0.5, unit: 'pt', used: ['order.js _gridTable — that glyph gap inside the gutter: within'] },
        ordGridAnchorShare: { def: 0.6, unit: 'share', used: ['order.js _gridTable — an anchor row fills this share of the columns'] },
        ordGridPitchMinEm: { def: 0.6, unit: 'em', used: ['order.js _gridTable — the table\'s line pitch: steps over this many ems'] },
        ordGridGroupPitchEm: { def: 0.9, unit: 'em', used: ['order.js _gridTable — baselines of one row: closer than this many ems'] },
        ordGridPitchRatio: { def: 1.12, unit: 'ratio', used: ['order.js _gridTable — rows apart: a step over this many pitches (plus ordGridPitchSlackPt)'] },
        ordGridPitchSlackPt: { def: 0.3, unit: 'pt', used: ['order.js _gridTable — rows apart: slack over the pitch'] }
    });

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
            const kMin = this._t('ordCellFillMinPt', p), kTol = this._t('ordCellBandTolPt', p), kGap = this._t('ordCellBandGapPt', p);
            const fills = p.rects.filter(function (r) { return r.color && !r.stroked && r.y1 - r.y0 >= kMin && r.x1 - r.x0 >= kMin; })
                .sort(function (a, b) { return b.y1 - a.y1 || a.x0 - b.x0; });
            const gone = new Set();
            for (let i = 0; i < fills.length; i++) {
                const a = fills[i];
                if (gone.has(a)) continue;
                for (let j = i + 1; j < fills.length; j++) {
                    const b = fills[j];
                    if (gone.has(b) || b.color !== a.color || Math.abs(b.y0 - a.y0) > kTol || Math.abs(b.y1 - a.y1) > kTol) continue;
                    if (b.x0 >= a.x1 - kTol && b.x0 <= a.x1 + kGap) { a.x1 = Math.max(a.x1, b.x1); a.cells = (a.cells || 1) + (b.cells || 1); gone.add(b); j = i; }
                    else if (b.x1 <= a.x0 + kTol && b.x1 >= a.x0 - kGap) { a.x0 = Math.min(a.x0, b.x0); a.cells = (a.cells || 1) + (b.cells || 1); gone.add(b); j = i; }
                }
            }
            if (gone.size) { this._fire('order.cellShadingJoined', p); p.rects = p.rects.filter(function (r) { return !gone.has(r); }); }
        },

        // _pageBlocks step: line-by-line shading merged into boxes
        _pbLineShading(p) {
            // shading drawn line by line (Word shades each line of a paragraph / table cell on its own): fills of one
            // colour and width that touch top to bottom are one box
            const kH = this._t('ordLineFillMinHPt', p), kW = this._t('ordLineFillMinWPt', p), kTol = this._t('ordLineBandTolPt', p), kGap = this._t('ordLineBandGapPt', p);
            const fills = p.rects.filter(function (r) { return r.color && !r.stroked && r.y1 - r.y0 >= kH && r.x1 - r.x0 > kW; })
                .sort(function (a, b) { return a.x0 - b.x0 || b.y1 - a.y1; });
            const gone = new Set();
            for (let i = 0; i < fills.length; i++) {
                const a = fills[i];
                if (gone.has(a)) continue;
                for (let j = i + 1; j < fills.length; j++) {
                    const b = fills[j];
                    if (gone.has(b) || b.color !== a.color || Math.abs(b.x0 - a.x0) > kTol || Math.abs(b.x1 - a.x1) > kTol) continue;
                    if (b.y1 <= a.y0 + kTol && b.y1 >= a.y0 - kGap) { a.y0 = Math.min(a.y0, b.y0); gone.add(b); j = i; }      // b just below a
                    else if (b.y0 >= a.y1 - kTol && b.y0 <= a.y1 + kGap) { a.y1 = Math.max(a.y1, b.y1); gone.add(b); j = i; } // b just above a
                }
            }
            if (gone.size) { this._fire('order.lineShadingJoined', p); p.rects = p.rects.filter(function (r) { return !gone.has(r); }); }
        },

        // _pageBlocks step: footnotes / endnotes under a separator, their picture marks
        _pbNotes(p, lines, body) {
            const self = this, M = this._metrics;
            // footnotes and endnotes under Word's separator: a short rule (under 45 % of the measure, three ems at least) with
            // only lines set 1.5 pt or more under the body's size below it on the page — the notes (`L.note`). A note's mark
            // drawn as a small picture just before its first line (Word: a note «¹ …» with its «¹» a picture, no
            // text) becomes that mark again: the page's raised marks in the text, in reading order, give the digits
            const view = p.view || [0, 0, 595, 842], meas = (M.right - M.left) || (view[2] - view[0]);
            const kDrop = this._t('ordNoteSizeDropPt', p), kMinR = this._t('ordNoteSizeMinRatio', p), kRuleMax = this._t('ordNoteRuleMaxShare', p), kRuleMin = this._t('ordNoteRuleMinEm', p);
            const kTol = this._t('ordNoteRuleTolPt', p), kFirst = this._t('ordNoteFirstGapEm', p), kRun = this._t('ordNoteMarkRunEm', p);
            const kMW = this._t('ordNoteMarkMaxWEm', p), kMH = this._t('ordNoteMarkMaxHEm', p), kMDrop = this._t('ordNoteMarkDropEm', p), kMTol = this._t('ordNoteMarkTolPt', p), kMGap = this._t('ordNoteMarkGapEm', p);
            const small = function (L) { return L.size <= body - kDrop && L.size >= kMinR * body; };
            // (footnotes at the page's foot, or endnotes after the text's end, anywhere down the page: under the rule
            // only notes, the first of them within three ems of it, and text at the body's size above it)
            const sep = (p.hsegs || []).filter(function (s) {
                if (!(s.x1 - s.x0 < kRuleMax * meas && s.x1 - s.x0 > kRuleMin * body)) return false;
                const below = lines.filter(function (L) { return L.y + L.size < s.y + kTol; });
                if (!below.length || !below.every(small)) return false;
                if (!below.some(function (L) { return s.y - (L.y + L.size) < kFirst * body; })) return false;
                return lines.some(function (L) { return L.y > s.y && !small(L); });
            }).sort(function (a, b) { return b.y - a.y; })[0];
            if (!sep) return;
            const notes = lines.filter(function (L) { return L.y + L.size < sep.y + kTol; }).sort(function (a, b) { return b.y - a.y; });
            if (!notes.length) return;
            this._fire('order.notesUnderRule', p);
            notes.forEach(function (L) { L.note = true; });
            const SUP = /^[\u00B9\u00B2\u00B3\u2070-\u2079\u2071\u1D5B\u02E3]+$/;
            const rtlP = lines.reduce(function (a, L) { return a + L.strong.R - L.strong.L; }, 0) > 0;
            const marks = [];
            lines.filter(function (L) { return !L.note; }).sort(function (a, b) { return b.y - a.y; }).forEach(function (L) {
                // (a mark of several glyphs side by side — «ⁱⁱ», «¹²» — is one mark)
                const ms = L.glyphs.filter(function (g) { return g.ch && SUP.test(g.ch); }).sort(function (a, b) { return a.x - b.x; });
                const runs = [];
                ms.forEach(function (g) { const r = runs[runs.length - 1]; if (r && g.x - (r.x1) < kRun * g.size) { r.gs.push(g); r.x1 = g.x + g.w; } else runs.push({ gs: [g], x1: g.x + g.w }); });
                if (rtlP) runs.reverse();
                runs.forEach(function (r) { marks.push(r.gs.map(function (g) { return g.ch; }).join('')); });
            });
            let k = 0;
            notes.forEach(function (L) {
                const rtlL = L.strong.R > L.strong.L;
                const im = (p.images || []).filter(function (m) {
                    const w = m.x1 - m.x0, h = m.y1 - m.y0;
                    if (w > kMW * L.size || h > kMH * L.size || Math.min(m.y1, L.y + L.size) - Math.max(m.y0, L.y - kMDrop * L.size) <= 0) return false;
                    return rtlL ? m.x0 >= L.x1 - kMTol && m.x0 - L.x1 < kMGap * L.size : m.x1 <= L.x0 + kMTol && L.x0 - m.x1 < kMGap * L.size;
                })[0];
                // (a note whose mark is text uses up its digit all the same)
                const lead = self._logical(L, rtlL).map(function (g) { return g.ch || ''; }).join('').trim().split(/\s/)[0];
                if (!im) { if (SUP.test(lead)) k++; return; }
                self._fire('order.noteMarkPicture', p);
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
            const struck = [], self = this;
            const kLo = this._t('ordStrikeLoEm', p), kHi = this._t('ordStrikeHiEm', p), kShare = this._t('ordStrikeShare', p);
            p.hsegs.forEach(function (sg) {
                let hit = false;
                lines.forEach(function (L) {
                    if (sg.x1 < L.x0 || sg.x0 > L.x1) return;
                    // through the letters' own middle (a fraction bar runs between two baselines)
                    const crossed = L.glyphs.filter(function (g) {
                        if (g.atom || g.space) return false;
                        const cx = g.x + g.w / 2, h = sg.y - g.y;
                        return cx > sg.x0 && cx < sg.x1 && h > kLo * g.size && h < kHi * g.size;
                    });
                    const under = L.glyphs.filter(function (g) { const cx = g.x + g.w / 2; return !g.space && !g.atom && cx > sg.x0 && cx < sg.x1; });
                    if (!crossed.length || crossed.length < kShare * under.length) return;
                    crossed.forEach(function (g) { g.strike = true; hit = true; });
                    // spaces between struck letters belong to the struck run
                    L.glyphs.forEach(function (g, i) { if (g.space && L.glyphs[i - 1] && L.glyphs[i - 1].strike && L.glyphs[i + 1] && L.glyphs[i + 1].strike) g.strike = true; });
                });
                if (hit) { self._fire('order.strikethrough', p); struck.push(sg); }
            });
            if (struck.length) p.hsegs = p.hsegs.filter(function (sg) { return struck.indexOf(sg) < 0; });
        },

        // _pageBlocks step: box pictures on lines with box characters, as text
        _pbBoxPictures(pl, p, lines) {
            // a box drawn as a little picture on a line that has box characters (a Word form's unticked «☐», its ticked
            // ones «☑» in the font): that character, as text, in the segment it stands nearest on its baseline — cropped,
            // it held a box and its neighbour's letters. Before the forms, which read their lines' text
            const BOXCH = /^[\u2610-\u2612\u25A1\u25A0\u2713\u2714\u2717\u2718]$/, self = this;
            const kMax = this._t('ordBoxPicMaxEm', pl), kAsp0 = this._t('ordBoxPicMinAspect', pl), kAsp1 = this._t('ordBoxPicMaxAspect', pl), kReach = this._t('ordBoxPicReachEm', pl);
            const kSp = this._t('ordBoxPicSpaceEm', pl), kRow = this._t('ordBaselineEm', pl), kSz = this._t('ordSameSizePt', pl), kOv = this._t('ordBoxPicOverlapPt', pl), kJoin = this._t('ordBoxPicJoinEm', pl);
            p.images = p.images.filter(function (c) {
                const cw = c.x1 - c.x0, chh = c.y1 - c.y0, cy = (c.y0 + c.y1) / 2;
                const row = lines.filter(function (L) { return cy > L.bottom && cy < L.top && cw <= kMax * L.size && chh <= kMax * L.size && cw >= kAsp0 * chh && cw <= kAsp1 * chh; });
                if (!row.some(function (L) { return L.glyphs.some(function (g) { return BOXCH.test(g.ch || ''); }); })) return true;
                const d = function (L) { return Math.max(0, L.x0 - c.x1, c.x0 - L.x1); };
                const L = row.slice().sort(function (a, b) { return d(a) - d(b); })[0];
                if (d(L) > kReach * L.size) return true;
                self._fire('order.boxPicture', pl);
                L.glyphs = L.glyphs.filter(function (g) { return !(g.space && g.x > c.x0 && g.x < c.x1); });
                const box = { ch: '\u2610', x: c.x0, w: cw, y: L.y, size: L.size, font: (L.glyphs[0] || {}).font, page: p.num };
                L.glyphs.push(box);
                L.glyphs.sort(function (a, b) { return a.x - b.x; });
                // (a word gap beside it, as the page shows one: «services ☐ both», not «services ☐both»)
                const k = L.glyphs.indexOf(box), a = L.glyphs[k - 1], b = L.glyphs[k + 1];
                // (or the picture runs over the word beside it — a Word form's box picture is wider than its box, its
                // clear part over the label's letters: «تألیف☐» — a box is never part of a word: a space against a letter)
                const over = function (g) { return g && !g.space && /\p{L}/u.test(g.ch || '') && g.x < c.x1 && g.x + g.w > c.x0; };
                if (b && !b.space && (b.x - c.x1 > kSp * L.size || over(b))) L.glyphs.splice(k + 1, 0, { ch: ' ', space: true, x: Math.min(c.x1, b.x), w: Math.max(0, b.x - c.x1), y: L.y, size: L.size, font: box.font, page: p.num });
                if (a && !a.space && (c.x0 - (a.x + a.w) > kSp * L.size || over(a))) L.glyphs.splice(k, 0, { ch: ' ', space: true, x: Math.min(a.x + a.w, c.x0), w: Math.max(0, c.x0 - a.x - a.w), y: L.y, size: L.size, font: box.font, page: p.num });
                finishLine(L, p.num);
                // (the segment the box ended, cut from it at the box's room — a gap the picture filled: one line again,
                // «تألیف ☐ ترجمه ☐» read as two paragraphs)
                for (let again = true; again;) {
                    again = false;
                    const M = lines.filter(function (X) {
                        if (X === L || X.rot || Math.abs(X.y - L.y) > kRow * L.size || Math.abs(X.size - L.size) > kSz) return false;
                        const gap = Math.max(X.x0 - L.x1, L.x0 - X.x1);
                        return gap > -kOv && gap < kJoin * L.size && (Math.abs(X.x0 - c.x1) < kJoin * L.size || Math.abs(c.x0 - X.x1) < kJoin * L.size);
                    })[0];
                    if (!M) break;
                    self._fire('order.boxPictureRejoin', pl);
                    const right = M.x0 > L.x1 - kOv, gap = right ? M.x0 - L.x1 : L.x0 - M.x1, edge = right ? L.x1 : M.x1;
                    const sp = gap > kSp * L.size ? [{ ch: ' ', space: true, x: edge, w: gap, y: L.y, size: L.size, font: box.font, page: p.num }] : [];
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
            const flow = form.rows.slice(), kMid = this._t('ordLineMidEm', p), kIn = this._t('ordInsideTolPt', p);
            if (tables.length) this._fire('order.ruledTable', p);
            tables.forEach(function (t) {
                const inT = lines.filter(function (L) { return inside(t, (L.x0 + L.x1) / 2, L.y + L.size * kMid, kIn); });
                lines = lines.filter(function (L) { return inT.indexOf(L) < 0; });
                flow.push({ type: 'table', top: t.y1, table: t, lines: inT, bb: { x0: t.x0, x1: t.x1, y0: t.y0, y1: t.y1 } });
            });
            return { lines: lines, form: form, tables: tables, flow: flow };
        },

        // _pageBlocks step: boxes (filled / framed rectangles)
        _pbBoxes(p, tables) {
            // a background drawn line by line (LibreOffice: one rectangle per paragraph, touching): one box
            const kFW = this._t('ordBoxFillMinWPt', p), kFTol = this._t('ordBoxFillTolPt', p), kFGap = this._t('ordBoxFillGapPt', p);
            const kSRTol = this._t('ordBoxSideRuleTolPt', p), kSRShare = this._t('ordBoxSideRuleShare', p), kFrame = this._t('ordBoxFrameTolPt', p), kW = this._t('ordBoxMinWPt', p), kH = this._t('ordBoxMinHPt', p);
            const fills = p.rects.filter(function (r) { return r.color && !r.stroked && r.x1 - r.x0 > kFW; }).sort(function (a, b) { return b.y1 - a.y1; });
            for (let i = 0; i < fills.length; i++) {
                const a = fills[i]; if (a.gone) continue;
                for (let j = i + 1; j < fills.length; j++) {
                    const b = fills[j]; if (b.gone) continue;
                    if (b.color === a.color && Math.abs(b.x0 - a.x0) < kFTol && Math.abs(b.x1 - a.x1) < kFTol && b.y1 >= a.y0 - kFGap && b.y1 <= a.y0 + kFGap) { a.y0 = Math.min(a.y0, b.y0); b.gone = true; }
                }
            }
            if (fills.some(function (r) { return r.gone; })) { this._fire('order.boxFillsJoined', p); p.rects = p.rects.filter(function (r) { return !r.gone; }); }
            // boxes: filled / framed rectangles holding text (code, quote, callout)
            const boxes = p.rects.filter(function (r) {
                // (a white fill counts when framed: a stroked rectangle on its edges, or thin rules along both sides — Word)
                const sideRule = function (x) { return p.vsegs.some(function (v) { return Math.abs(v.x - x) < kSRTol && v.y0 < r.y1 && v.y1 > r.y0 && Math.min(v.y1, r.y1) - Math.max(v.y0, r.y0) > kSRShare * (r.y1 - r.y0); }); };
                const framedWhite = p.rects.some(function (o) { return o !== r && o.stroked && Math.abs(o.x0 - r.x0) < kFrame && Math.abs(o.y1 - r.y1) < kFrame; }) || (sideRule(r.x0) && sideRule(r.x1));
                return r.x1 - r.x0 > kW && r.y1 - r.y0 > kH && !(isWhite(r.color) && !r.stroked && !framedWhite) &&
                    !tables.some(function (t) { return inside(t, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2); });
            }).sort(function (a, b) { return (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0); });
            return boxes;
        },

        // _pageBlocks step: row bands, row rules and column rules (the XY-cut's fences); the outermost boxes
        _pbFences(p, lines, boxes, tables) {
            const self = this, M = this._metrics;
            const kMid = this._t('ordLineMidEm', p), kIn = this._t('ordInsideTolPt', p), kRowEm = this._t('ordBandOneRowEm', p), kBl = this._t('ordBaselineEm', p), kMaxEm = this._t('ordBandMaxEm', p);
            const kCell = this._t('ordBandCellGapEm', p), kTol = this._t('ordBandTolPt', p), kPitch = this._t('ordBandPitchRatio', p), kCRW = this._t('ordColRuleMaxWPt', p), kCRH = this._t('ordColRuleMinEm', p), kOut = this._t('ordOuterTolPt', p);
            // row shading (zebra stripes): equal-width one-line bands holding cells side by side, stacked at
            // a steady pitch, are table rows, not boxes — their text stays in the flow for the table finder
            // (a row whose cells wrap is a taller band: its lines still stand side by side — two of them on
            // overlapping heights, apart across — where a shaded paragraph's lines stand one above the other)
            const oneRow = function (b) {
                const inB = lines.filter(function (L) { return inside(b, (L.x0 + L.x1) / 2, L.y + L.size * kMid, kIn); });
                if (inB.length < 2) return false;
                if (b.y1 - b.y0 < kRowEm * inB[0].size && inB.every(function (L) { return Math.abs(L.y - inB[0].y) < kBl * L.size; })) return true;
                if (b.y1 - b.y0 > kMaxEm * inB[0].size) return false;
                return inB.some(function (A) { return inB.some(function (B) { return B !== A && B.x0 > A.x1 + kCell * A.size && overlapY(A.bottom, A.top, B.bottom, B.top) > 0; }); });
            };
            const bands = boxes.filter(function (b) {
                // (a band joined from cell backgrounds side by side is a row whatever its neighbours)
                return oneRow(b) && (b.cells >= 2 || boxes.some(function (o) {
                    const h = Math.max(b.y1 - b.y0, o.y1 - o.y0);
                    return o !== b && Math.abs(o.x0 - b.x0) < kTol && Math.abs(o.x1 - b.x1) < kTol && oneRow(o) &&
                           Math.abs((o.y0 + o.y1) / 2 - (b.y0 + b.y1) / 2) < kPitch * h;
                }));
            });
            if (bands.length) this._fire('order.zebraBands', p);
            bands.forEach(function (b) { boxes.splice(boxes.indexOf(b), 1); });
            // the rows' bands bound their tables: no table crosses the side of a shaded row (XY-cut's fences)
            this._fences = bands.map(function (b) { return { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 }; });
            // and the rules between rows (a web table's thin separators: a row of cells two lines tall between them)
            this._rowRules = (p.hsegs || []).filter(function (h) { return !tables.some(function (t) { return inside(t, (h.x0 + h.x1) / 2, h.y, kIn); }); });
            // and so do column rules: a vertical line (a thin rectangle or a stroke) five lines tall at least, outside
            // the ruled tables — a sidebar's border, a newspaper's column rule (a web app's settings page read its
            // sidebar and its main panel line by line, interleaved, without it)
            p.rects.filter(function (r) { return r.x1 - r.x0 <= kCRW && r.y1 - r.y0 >= kCRH * M.body; })
                .map(function (r) { return { x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1 }; })
                .concat(p.vsegs.filter(function (v) { return v.y1 - v.y0 >= kCRH * M.body; }).map(function (v) { return { x0: v.x - 0.5, x1: v.x + 0.5, y0: v.y0, y1: v.y1 }; }))
                .filter(function (r) { return !tables.some(function (t) { return inside(t, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, kIn); }); })
                .forEach(function (r) { r.rule = true; self._fences.push(r); self._fire('order.columnRule', p); });
            const outer = [];
            boxes.forEach(function (b) {
                if (outer.some(function (o) { return o.x0 <= b.x0 + kOut && o.x1 >= b.x1 - kOut && o.y0 <= b.y0 + kOut && o.y1 >= b.y1 - kOut; })) return;
                outer.push(b);
            });
            return outer;
        },

        // _pbBoxBlocks: its thresholds, read once a page
        _ordBoxK(p) {
            return {
                mid: this._t('ordLineMidEm', p), inTol: this._t('ordInsideTolPt', p), bl: this._t('ordBaselineEm', p), sz: this._t('ordSameSizePt', p), mono: this._t('ordMonoLineShare', p), frame: this._t('ordBoxFrameTolPt', p),
                hold: this._t('ordBoxHoldTolPt', p), pfLines: this._t('ordPageFrameMinLines', p), pfShare: this._t('ordPageFrameShare', p), bleed: this._t('ordBoxBleedEm', p), cut: this._t('ordBoxCutTolPt', p),
                ttTol: this._t('ordTitleCellTolPt', p), ttGap: this._t('ordTitleCellGapEm', p), figShare: this._t('ordBoxFigureShare', p), figLines: this._t('ordBoxFigureMaxLines', p),
                cardLines: this._t('ordCardMinLines', p), cardBold: this._t('ordCardHeadBold', p), cardChars: this._t('ordCardHeadMaxChars', p), cardPic: this._t('ordCardPictureShare', p),
                bandTop: this._t('ordBandTopEm', p), bandMono: this._t('ordBandMaxMono', p), bandW: this._t('ordBandMinWShare', p), bandH: this._t('ordBandMaxHEm', p), bandOv: this._t('ordBandBelowShare', p),
                bandTol: this._t('ordBandBelowTolPt', p), bandGap: this._t('ordBandBelowGapEm', p), bandTall: this._t('ordBandBelowTallRatio', p), bandChars: this._t('ordBandMaxChars', p), bandInset: this._t('ordBandInsetPt', p),
                hlH: this._t('ordHighlightMaxHEm', p), hlTol: this._t('ordHighlightTolEm', p),
                fwShare: this._t('ordFieldWrapShare', p), fwInset: this._t('ordFieldWrapInsetEm', p), fwPitch: this._t('ordFieldWrapPitchEm', p), fwLines: this._t('ordFieldBoxMaxLines', p),
                titleSize: this._t('ordBoxTitleSizeRatio', p), titleCentre: this._t('ordBoxTitleCentreEm', p), titleChars: this._t('ordBoxTitleMaxChars', p),
                chipH: this._t('ordChipMaxHEm', p), chipGlyphs: this._t('ordChipMaxGlyphs', p), icH: this._t('ordCodeChipMaxHEm', p), icW: this._t('ordCodeChipMaxWShare', p), icTol: this._t('ordCodeChipTolPt', p),
                barW: this._t('ordBoxBarMaxWPt', p), barShare: this._t('ordBoxBarShare', p), barTol: this._t('ordBoxBarTolPt', p), stripTol: this._t('ordStripTolPt', p), stripH: this._t('ordStripMaxHEm', p), codeMono: this._t('ordCodeBoxMonoShare', p),
                nestIn: this._t('ordNestInsetPt', p), nestTol: this._t('ordNestTolPt', p), nestH: this._t('ordNestMaxHShare', p), nestDup: this._t('ordNestDupTolPt', p), nestHold: this._t('ordNestHoldTolPt', p), nestTwin: this._t('ordNestTwinTolPt', p)
            };
        },

        // _pageBlocks step: boxes that are code or quote blocks (their lines leave the flow)
        _pbBoxBlocks(s) {
            const self = this, M = this._metrics, p = s.p, outer = s.outer, boxes = s.boxes, tables = s.tables, form = s.form, flow = s.flow;
            let lines = s.lines;
            const linesOnPage = lines.length, K = this._ordBoxK(p);
            outer.forEach(function (b) {
                // the box holds the whole line (an inline-code chip holds the centre of a long line, not the line)
                const inB = lines.filter(function (L) { return inside(b, (L.x0 + L.x1) / 2, L.y + L.size * K.mid, K.inTol) && L.x0 > b.x0 - K.hold && L.x1 < b.x1 + K.hold; });
                if (!inB.length) return;
                // a frame around most of the page's text is the page's own (a card, a dialog of a web app, a bordered
                // page), no quote or code box: its text stays in the flow, columns and all
                if (inB.length >= K.pfLines && inB.length >= K.pfShare * linesOnPage) { self._fire('order.boxPageFrame', p); return; }
                // a band past the text column on both sides (a site's header or footer bar, edge to edge) is no quote:
                // a quote sits inside the column
                if (b.x0 < M.left - K.bleed * M.body && b.x1 > M.right + K.bleed * M.body) { self._fire('order.boxFullBleed', p); return; }
                // a box the paper cuts (it runs past the page's side: a mobile page wider than the paper, its cards cut
                // at the edge) is the page's layout, no quote — what is left of a card
                if (p.view && (b.x0 < p.view[0] - K.cut || b.x1 > p.view[2] + K.cut)) {
                    // (measured by its own text, as a card is)
                    const card = { left: Math.min.apply(null, inB.map(function (L) { return L.x0; })), right: Math.max.apply(null, inB.map(function (L) { return L.x1; })) };
                    inB.forEach(function (L) { L.card = card; });
                    self._fire('order.boxCutByPaper', p);
                    return;
                }
                // a title cell on top of a ruled table, as wide as it (Excel: the merged, shaded first row) is the
                // table's title, no quote: its text stays in the flow, just above the table
                if (inB.length === 1 && tables.some(function (t) { return Math.abs(t.x0 - b.x0) < K.ttTol && Math.abs(t.x1 - b.x1) < K.ttTol && b.y0 - t.y1 > -K.ttTol && b.y0 - t.y1 < K.ttGap * inB[0].size; })) { self._fire('order.boxTableTitle', p); return; }
                // a figure's frame (a picture or a drawing over most of the box, its caption under it: an encyclopedia page's thumbnail)
                // is no quote — the caption's lines stay in the flow, with the figure
                const boxArea = (b.x1 - b.x0) * (b.y1 - b.y0);
                const pictured = (p.images || []).concat(p.vectors || []).reduce(function (a, o) {
                    const w = Math.min(o.x1, b.x1) - Math.max(o.x0, b.x0), hh = Math.min(o.y1, b.y1) - Math.max(o.y0, b.y0);
                    return a + (w > 0 && hh > 0 ? w * hh : 0);
                }, 0);
                if (boxArea > 0 && pictured >= K.figShare * boxArea && inB.length <= K.figLines) { self._fire('order.boxFigureFrame', p); inB.forEach(function (L) { L.caption = true; }); return; }
                // a card (a web page's framed section: a heading of its own on top, or a picture inside, and text under
                // it — a horoscope site's sign by sign) is the page's layout, no quote: its text stays in the flow
                const topL = inB.slice().sort(function (a, c) { return c.y - a.y; })[0];
                const topText = topL.glyphs.map(function (g) { return g.ch || ''; }).join('').trim();
                const headed = inB.length >= K.cardLines && topL.boldShare > K.cardBold && topText.length <= K.cardChars && !/[.!?؟]$/.test(topText);
                // (one column of text: an infobox's rows, label and value side by side, are a table's)
                const sideBySide = inB.some(function (A) { return inB.some(function (B) { return B !== A && Math.abs(B.y - A.y) < K.bl * A.size; }); });
                if (inB.length >= K.cardLines && !sideBySide && (pictured >= K.cardPic * boxArea || headed)) {
                    const card = { left: Math.min.apply(null, inB.map(function (L) { return L.x0; })), right: Math.max.apply(null, inB.map(function (L) { return L.x1; })) };
                    inB.forEach(function (L) { L.card = card; });
                    self._fire('order.boxCard', p);
                    return;
                }
                // a section's title band (an invoice's shaded «مشخصات فروشنده» across its box, the box's rows under it): one
                // short line, no sentence, in a fill or frame as wide as most of the column, on top of another box, a
                // table or a form — the section's heading, no quote
                // (or a frame round the whole section, the band's line at its top and the section's form rows in it)
                const atTop = inB.length === 1 && b.y1 - inB[0].top < K.bandTop * inB[0].size && form.rows.some(function (r) { return inside(b, (r.bb.x0 + r.bb.x1) / 2, (r.bb.y0 + r.bb.y1) / 2, K.inTol); });
                if (inB.length === 1 && inB[0].monoShare < K.bandMono && b.x1 - b.x0 >= K.bandW * (M.right - M.left) && (b.y1 - b.y0 < K.bandH * inB[0].size || atTop)) {
                    const t1 = inB[0].glyphs.map(function (g) { return g.ch || ''; }).join('').trim();
                    const ov = function (o) { return Math.min(o.x1, b.x1) - Math.max(o.x0, b.x0) >= K.bandOv * (b.x1 - b.x0); };
                    const under = function (o) { return o !== b && ov(o) && o.y1 <= b.y0 + K.bandTol && o.y1 >= b.y0 - K.bandGap * inB[0].size; };
                    const below = p.rects.some(function (o) { return under(o) || o !== b && ov(o) && o.y0 < b.y0 - K.bandTol && o.y1 >= b.y1 - K.bandTol && o.y1 - o.y0 > K.bandTall * (b.y1 - b.y0); }) ||
                        tables.some(under) || form.rows.some(function (r) { return under(r.bb); });
                    // (the line takes its band's width: the section reads as one piece across the page — beside a narrow
                    // header column the XY-cut had read the band before the header)
                    if ((below || atTop) && t1.length <= K.bandChars && !/[.!?؟]$/.test(t1)) { self._fire('order.boxTitleBand', p); inB[0].band = true; inB[0].x0 = Math.min(inB[0].x0, b.x0 + K.bandInset); inB[0].x1 = Math.max(inB[0].x1, b.x1 - K.bandInset); return; }
                }
                // a highlight (a fill hugging one line, no frame: Word's text highlight colour, a marker pen) is the text's
                // own background, no box: its text stays in the flow — a list item highlighted became a quote
                if (inB.length === 1 && !b.stroked && b.y1 - b.y0 < K.hlH * inB[0].size && Math.abs(b.x0 - inB[0].x0) < K.hlTol * inB[0].size && Math.abs(b.x1 - inB[0].x1) < K.hlTol * inB[0].size) { self._fire('order.boxHighlight', p); return; }
                // a frame round form fields (a Word plan's boxes: «تاریخ تنظیم: …», «عنوان طرح: …» over «سفارش‌دهنده: …»):
                // every line a bold label and its value — fields, no quote
                // (a field's value wrapped in the box — a sentence-long «هدف طرح: …» whose second line starts under the label —
                // is that field still: a line under a field's line that filled the box, no label of its own, a line's pitch down)
                const inBy = inB.slice().sort(function (p, q) { return q.y - p.y; });
                const wrapOf = function (k) { const P = inBy[k - 1], L = inBy[k]; return k > 0 && P.x1 - P.x0 > K.fwShare * (b.x1 - b.x0) - K.fwInset * L.size && P.y - L.y < K.fwPitch * L.size && Math.abs(P.size - L.size) < K.sz; };
                if (inB.length <= K.fwLines && inBy[0].strong && self._boldLabel(inBy[0]) && inBy.every(function (L, k) { return (L.strong && self._boldLabel(L)) || wrapOf(k); })) { self._fire('order.boxFormFields', p); return; }
                // a title in a frame of its own (a slide's title box: one short line, larger than the body, centred in the box,
                // no sentence) is a title, no quote — a deck's slide whose only text was its title came back «> …»
                if (inB.length === 1 && inB[0].size > K.titleSize * M.body && Math.abs((inB[0].x0 - b.x0) - (b.x1 - inB[0].x1)) < K.titleCentre * inB[0].size) {
                    const t1 = inB[0].glyphs.map(function (g) { return g.ch || ''; }).join('').trim();
                    if (t1.length <= K.titleChars && !/[.!?؟:]$/.test(t1)) { self._fire('order.boxTitle', p); return; }
                }
                // a chip / badge (a small box around a few characters) is decoration: its text stays in the flow
                if (inB.length === 1 && b.y1 - b.y0 < inB[0].size * K.chipH && inB[0].glyphs.filter(function (g) { return !g.space; }).length <= K.chipGlyphs) { self._fire('order.boxChip', p); return; }
                // an inline-code chip: one line in a narrow box, other text on its baseline (a table row, a sentence)
                if (inB.length === 1 && b.y1 - b.y0 < inB[0].size * K.icH && b.x1 - b.x0 < K.icW * (M.right - M.left) &&
                    lines.some(function (L) { return L !== inB[0] && Math.abs(L.y - inB[0].y) < K.bl * L.size && (L.x0 > b.x1 - K.icTol || L.x1 < b.x0 + K.icTol); })) { self._fire('order.boxInlineCode', p); return; }
                lines = lines.filter(function (L) { return inB.indexOf(L) < 0; });
                const framed = !!(b.stroked || p.rects.some(function (o) { return o.stroked && Math.abs(o.x0 - b.x0) < K.frame && Math.abs(o.y1 - b.y1) < K.frame && Math.abs(o.x1 - b.x1) < K.frame; }));
                const bar = p.rects.some(function (r) { return r.x1 - r.x0 <= K.barW && overlapY(r.y0, r.y1, b.y0, b.y1) > (b.y1 - b.y0) * K.barShare && (Math.abs(r.x0 - b.x0) < K.barTol || Math.abs(r.x1 - b.x1) < K.barTol); })
                    || !framed && p.vsegs.some(function (v) { return overlapY(v.y0, v.y1, b.y0, b.y1) > (b.y1 - b.y0) * K.barShare && (Math.abs(v.x - b.x0) < K.barTol || Math.abs(v.x - b.x1) < K.barTol); });
                const monoLines = inB.filter(function (L) { return L.monoShare > K.mono; }).length;
                const glyphsIn = inB.reduce(function (a, L) { return a.concat(L.glyphs.filter(function (g) { return !g.space && !g.atom; })); }, []);
                const monoShare = glyphsIn.length ? glyphsIn.filter(function (g) { return g.mono || /[\u2500-\u259F]/.test(g.ch); }).length / glyphsIn.length : 0;
                // a header strip across the top of the box holding one short line (a code block's language label)
                const top = inB.slice().sort(function (a, c) { return c.y - a.y; })[0];
                const strip = p.rects.some(function (r) {
                    return r !== b && r.color && Math.abs(r.x0 - b.x0) < K.stripTol && Math.abs(r.x1 - b.x1) < K.stripTol && Math.abs(r.y1 - b.y1) < K.stripTol &&
                           r.y1 - r.y0 < K.stripH * top.size && top.y > r.y0 && top.y < r.y1 && inB.length > 1;
                });
                // code: (almost) every line monospace, or a framed box without a side bar that is
                // largely monospace (letters a monospace font lacks fall back to another font)
                const code = monoLines >= Math.max(1, inB.length - 1) || (framed && !bar && (monoShare >= K.codeMono || strip));
                // boxes inside a quote box: nested quotes (their text was taken with this box)
                // (a part of it: the box's own inset fill is as tall as the box)
                // (set in from the lines' start: from the right in a right-to-left quote — Kelk's Persian nested quote is a
                // box flush with its outer one's left edge, set in at the right: it was no nest, and the nesting was lost)
                const rtlBox = self._quoteRtl(inB);
                const setIn = function (o) { return rtlBox ? o.x1 < b.x1 - K.nestIn && o.x0 >= b.x0 - K.nestTol : o.x0 > b.x0 + K.nestIn && o.x1 <= b.x1 + K.nestTol; };
                const ins = code ? [] : boxes.filter(function (o) { return o !== b && setIn(o) && o.y0 >= b.y0 - K.nestTol && o.y1 <= b.y1 + K.nestTol && o.y1 - o.y0 < K.nestH * (b.y1 - b.y0); })
                    .filter(function (o, k, a) { return !a.slice(0, k).some(function (q) { return Math.abs(q.x0 - o.x0) < K.nestDup && Math.abs(q.x1 - o.x1) < K.nestDup && Math.abs(q.y0 - o.y0) < K.nestDup && Math.abs(q.y1 - o.y1) < K.nestDup; }); });
                // (a quote that shades each of its paragraphs — Kelk's .docx — is no nest of quotes: a box holding
                // another box is a nested quote's frame; a box beside a twin at its x, or inside such a frame, is a
                // paragraph's shading)
                const holds = function (o, q) { return q !== o && q.x0 >= o.x0 - K.nestHold && q.x1 <= o.x1 + K.nestHold && q.y0 >= o.y0 - K.nestHold && q.y1 <= o.y1 + K.nestHold; };
                const frames = ins.filter(function (o) { return ins.some(function (q) { return holds(o, q); }); });
                const innerBoxes = ins.filter(function (o) {
                    if (frames.indexOf(o) >= 0) return true;
                    if (frames.some(function (f) { return holds(f, o); })) return false;
                    return !ins.some(function (q) { return q !== o && frames.indexOf(q) < 0 && Math.abs(q.x0 - o.x0) < K.nestTwin && Math.abs(q.x1 - o.x1) < K.nestTwin; });
                }).map(function (o) { const e = rtlBox ? o.x1 : o.x0; return { x0: e, x1: e, y0: o.y0, y1: o.y1 }; });
                self._fire(code ? 'order.boxCode' : 'order.boxQuote', p);
                if (innerBoxes.length) self._fire('order.boxNestedQuote', p);
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
            const self = this;
            const kIn = this._t('ordInsideTolPt', pl), kW = this._t('ordQBarMaxWPt', pl), kW0 = this._t('ordQBarMinWPt', pl), kH = this._t('ordQBarMinHEm', pl), kAl = this._t('ordQBarAlignPt', pl), kNest = this._t('ordQBarNestInPt', pl), kReach = this._t('ordQBarNestReachEm', pl);
            const kGTol = this._t('ordQBarGapTolPt', pl), kGap = this._t('ordQBarGapEm', pl), kBelow = this._t('ordQBarBelowTolPt', pl), kC = this._t('ordQBarCornerPt', pl), kCH = this._t('ordQBarCornerRuleHPt', pl), kCW = this._t('ordQBarCornerRuleWPt', pl);
            const kTwA = this._t('ordQBarTwinApartPt', pl), kTwT = this._t('ordQBarTwinTolPt', pl), kAlong = this._t('ordQBarAlongTolPt', pl), kText = this._t('ordQBarTextGapEm', pl), kSpan = this._t('ordQBarSpanShare', pl), kMono = this._t('ordMonoLineShare', pl);
            const inTable = function (x, y) { return tables.some(function (t) { return inside(t, x, y, kIn); }); };
            const barCands = p.rects.filter(function (r) { return r.x1 - r.x0 <= kW && r.x1 - r.x0 >= kW0 && r.y1 - r.y0 >= kH * body; })
                .map(function (r) { return { x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1 }; })
                .concat(p.vsegs.filter(function (v) { return !v.filled && v.y1 - v.y0 >= kH * body; }).map(function (v) { return { x0: v.x - 0.5, x1: v.x + 0.5, y0: v.y0, y1: v.y1 }; }))
                .filter(function (b) { return !inTable((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2) && b.y1 < pl.cutTop && b.y0 > pl.cutBottom; })
                .sort(function (a, b) { return a.x0 - b.x0; });
            // a quote's border drawn paragraph by paragraph (LibreOffice): bars at one x, one under the other, a
            // paragraph gap apart — or with a nested quote's bar, further in, bridging the gap — are one bar
            (function () {
                const near = function (a, b) { return Math.abs(a.x0 - b.x0) < kAl && Math.abs(a.x1 - b.x1) < kAl; };
                const bridged = function (a, top, bot) {
                    // bars further in, inside the gap, that leave no gap of their own over 3 lines
                    const ins = barCands.filter(function (o) { return o.x0 > a.x1 + kNest && o.x0 < a.x1 + kReach * body && o.y1 <= top + kGTol && o.y0 >= bot - kGTol; })
                        .sort(function (u, v) { return v.y1 - u.y1; });
                    if (!ins.length) return false;
                    let y = top;
                    for (let k = 0; k < ins.length; k++) { if (y - ins[k].y1 > kGap * body) return false; y = Math.min(y, ins[k].y0); }
                    return y - bot <= kGap * body;
                };
                let changed = true;
                while (changed) {
                    changed = false;
                    for (let i = 0; i < barCands.length && !changed; i++) for (let j = 0; j < barCands.length && !changed; j++) {
                        const a = barCands[i], b = barCands[j];
                        if (i === j || !near(a, b) || b.y1 > a.y0 + kBelow) continue;           // b below a
                        const gap = a.y0 - b.y1;
                        if (gap > kGap * body && !bridged(a, a.y0, b.y1)) continue;
                        a.y0 = b.y0; barCands.splice(j, 1); changed = true;
                        self._fire('order.quoteBarsJoined', pl);
                    }
                }
            })();
            // an edge of a frame or a cell is no quote bar: a rule meets its end, or a matching edge stands
            // on the other side of the text
            const corner = function (b) {
                const cx = (b.x0 + b.x1) / 2;
                return p.hsegs.some(function (s) { return (Math.abs(s.y - b.y0) < kC || Math.abs(s.y - b.y1) < kC) && s.x0 < cx + kC && s.x1 > cx - kC; }) ||
                    p.rects.some(function (r) { return r.y1 - r.y0 < kCH && r.x1 - r.x0 > kCW && (Math.abs(r.y0 - b.y0) < kC || Math.abs(r.y1 - b.y1) < kC || Math.abs(r.y1 - b.y0) < kC || Math.abs(r.y0 - b.y1) < kC) && r.x0 < cx + kC && r.x1 > cx - kC; });
            };
            const twin = function (b) {
                return barCands.concat(p.vsegs.map(function (v) { return { x0: v.x - 0.5, x1: v.x + 0.5, y0: v.y0, y1: v.y1 }; })).some(function (o) {
                    return o !== b && Math.abs(o.x0 - b.x0) > kTwA && Math.abs(o.y0 - b.y0) < kTwT && Math.abs(o.y1 - b.y1) < kTwT;
                });
            };
            // (the bars are taken outermost first: left to right for text right of its bar; a bar with its text on its left
            // — a right-to-left quote's — waits while a bar further right, as tall or taller, may hold it as a nested one:
            // a Persian nested quote's inner bar, taken first, had made a quote of its own and left the outer one too few
            // lines to be a quote)
            const deferred = [];
            const takeBar = function (b, wait) {
                if (b.done) return;
                if (corner(b) || twin(b)) { self._fire('order.quoteBarFrameEdge', pl); return; }
                const along = function (L) { const cy = (L.top + L.bottom) / 2; return cy >= b.y0 - kAlong && cy <= b.y1 + kAlong; };
                const right = lines.filter(function (L) { return along(L) && L.x0 > b.x1 && L.x0 - b.x1 < kText * body; });
                const left = lines.filter(function (L) { return along(L) && L.x1 < b.x0 && b.x0 - L.x1 < kText * body; });
                // text on both sides: a column rule, not a quote
                if (right.length && left.length) { self._fire('order.quoteBarColumnRule', pl); return; }
                const inB = right.length ? right : left;
                if (!inB.length) return;
                if (wait && !right.length && barCands.some(function (o) { return o !== b && !o.done && o.x0 > b.x1 + kNest && o.x0 - b.x1 < kReach * body && o.y0 <= b.y0 + kAlong && o.y1 >= b.y1 - kAlong; })) { self._fire('order.quoteBarDeferred', pl); deferred.push(b); return; }
                // a quote's bar stands at its lines' start: on the right of right-to-left lines — one at their ragged
                // end is a decoration of the page (a Word template's rule down the margin, beside the page number:
                // a Persian report's every page began with a quote)
                const rtlLines = inB.reduce(function (n, L) { return n + L.strong.R - L.strong.L; }, 0) > 0;
                if (rtlLines === !!right.length && inB.some(function (L) { return L.strong.R + L.strong.L > 0; })) { self._fire('order.quoteBarAtLineEnd', pl); return; }
                const span = Math.max.apply(null, inB.map(function (L) { return L.top; })) - Math.min.apply(null, inB.map(function (L) { return L.bottom; }));
                if (span < kSpan * (b.y1 - b.y0)) return;
                // the rest of the quote: lines further in, inside the bar's height (nested text, list items)
                const more = lines.filter(function (L) { return inB.indexOf(L) < 0 && along(L) && (right.length ? L.x0 > b.x1 : L.x1 < b.x0) && Math.abs(L.y - inB[0].y) < (b.y1 - b.y0) + body; })
                    .filter(function (L) { return right.length ? L.x0 - b.x1 < kReach * body : b.x0 - L.x1 < kReach * body; });
                const all = inB.concat(more);
                lines = lines.filter(function (L) { return all.indexOf(L) < 0; });
                const x0 = right.length ? b.x0 : Math.min.apply(null, all.map(function (L) { return L.x0; }));
                const x1 = right.length ? Math.max.apply(null, all.map(function (L) { return L.x1; })) : b.x1;
                const box = { x0: x0, x1: x1, y0: b.y0, y1: b.y1 };
                // bars further in, within this one's height: nested quotes (their lines are taken here already)
                // (further left, right to left)
                const inner = barCands.filter(function (o) { return o !== b && (right.length ? o.x0 > b.x1 + kNest && o.x0 < x1 : o.x1 < b.x0 - kNest && o.x1 > x0) && o.y0 >= b.y0 - kAlong && o.y1 <= b.y1 + kAlong; });
                inner.forEach(function (o) { o.done = true; });
                // (almost) every line monospace, no nested bar: a code block drawn with a side bar (a common blog and
                // docs style), not a quote — the boxes' own test (above), which the bars had skipped
                const monoN = all.filter(function (L) { return L.monoShare > kMono; }).length;
                const code = !inner.length && monoN >= Math.max(1, all.length - 1);
                self._fire(code ? 'order.quoteBarCode' : 'order.quoteBar', pl);
                if (inner.length) self._fire('order.quoteBarNested', pl);
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
            const kSq = this._t('ordDotSquareTolPt', pl), kBoxS = this._t('checkboxStrokeMinPt', pl), kBoxF = this._t('checkboxMinPt', pl), kDot = this._t('ordDotMaxPt', pl), kIn = this._t('ordInsideTolPt', pl);
            const kTick = this._t('ordCheckMarkShare', pl), kPOv = this._t('ordPicBulletOverlapPt', pl), kPGap = this._t('ordPicBulletGapEm', pl), kPH = this._t('ordPicBulletMaxHEm', pl);
            const kPMax = this._t('ordPicBulletMaxPt', pl), kPSq = this._t('ordPicBulletSquareTolPt', pl), kPAl = this._t('ordPicBulletAlignPt', pl), kSame = this._t('ordMarkerSameTolPt', pl);
            if (lattice.size) {
                this._fire('order.dotGrid', pl);
                const inGrid = function (v) { return lattice.has(Math.round(v.x0 * 2) + ',' + Math.round(v.y0 * 2)); };
                p.small = (p.small || []).filter(function (m) { return !inGrid(m); });
                p.vectors = p.vectors.filter(function (v) { return !inGrid(v); });
            }
            const dots = [];
            (p.small || []).forEach(function (m) {
                const w = m.x1 - m.x0, h = m.y1 - m.y0;
                if (Math.abs(w - h) > kSq) return;
                if (dots.some(function (d) { return d.task && inside(d, (m.x0 + m.x1) / 2, (m.y0 + m.y1) / 2, kIn); })) return;
                // (a framed square filled white — wkhtmltopdf's checkbox — too: a filled square bullet is smaller)
                if ((m.box && m.stroke && (!m.fill ? w >= kBoxS : w >= kBoxF)) || m.rbox) { self._fire('order.taskBox', pl); dots.push(Object.assign({ task: true }, m)); return; }
                if (w > kDot) return;
                dots.push(m);
            });
            // a check mark: a smaller shape inside the box (its own fill and border layers are as large as the box)
            (p.small || []).forEach(function (m) {
                const cx = (m.x0 + m.x1) / 2, cy = (m.y0 + m.y1) / 2;
                dots.forEach(function (d) {
                    // (a tick drawn as strokes — no rectangle — may span the box: wkhtmltopdf's)
                    if (d.task && d !== m && inside(d, cx, cy, kIn) && !(m.box && m.stroke && !m.fill) && !m.rbox &&
                        ((m.x1 - m.x0) < kTick * (d.x1 - d.x0) || (!m.box && !m.round && m.stroke && !m.fill))) { d.checked = true; self._fire('order.taskChecked', pl); }
                });
            });
            // pictures as bullets (list-style-image, an icon before each item): small square pictures, two or more at one
            // x, each just before a line's start — a web page's ticked list came out as its items between pictures
            const lineStart = function (m) {
                return pl.lines.filter(function (L) {
                    const cy = (m.y0 + m.y1) / 2, gap = L.strong.R > L.strong.L ? m.x0 - L.x1 : L.x0 - m.x1;
                    return cy > L.bottom && cy < L.top && gap > -kPOv && gap < kPGap * L.size && m.y1 - m.y0 <= kPH * L.size;
                })[0];
            };
            const smallPics = p.images.filter(function (m) { const w = m.x1 - m.x0, h = m.y1 - m.y0; return w <= kPMax && h <= kPMax && Math.abs(w - h) <= kPSq && lineStart(m); });
            const picBullets = smallPics.filter(function (m) { return smallPics.some(function (o) { return o !== m && Math.abs(o.x0 - m.x0) < kPAl && Math.abs((o.x1 - o.x0) - (m.x1 - m.x0)) < kPAl; }); });
            if (picBullets.length) {
                this._fire('order.pictureBullets', pl);
                picBullets.forEach(function (m) { dots.push({ x0: m.x0, x1: m.x1, y0: m.y0, y1: m.y1, round: true, fill: true, picture: true }); });
                p.images = p.images.filter(function (m) { return picBullets.indexOf(m) < 0; });
            }
            pl.lines.forEach(function (L) { L.marker = self._dotMarker(L, dots); });
            if (this._ocr) this._ocrMarkers(pl.lines, body, p);
            const same = function (a, b) { return Math.abs(a.x0 - b.x0) < kSame && Math.abs(a.y0 - b.y0) < kSame && Math.abs(a.x1 - b.x1) < kSame; };
            const used = dots.filter(function (d) { return d.used; });
            const vec = p.vectors.filter(function (v) {
                if (used.some(function (d) { return same(d, v) || (d.task && inside(d, (v.x0 + v.x1) / 2, (v.y0 + v.y1) / 2, kIn)); })) return false;
                return v.y1 < (pl.cutTop || Infinity) && v.y0 > (pl.cutBottom || -Infinity);
            });
            return vec;
        },

        // _pageBlocks step: figure clusters, less backdrops and decoration
        _pbClusters(pl, p, vec, body) {
            // thin filled rules lying among vector glyphs are fraction bars / radicals
            const self = this, kBH = this._t('ordFracBarMaxHPt', pl), kBW = this._t('ordFracBarMaxWPt', pl), kBN = this._t('ordFracBarNearPt', pl), kBR = this._t('ordFracBarReachPt', pl);
            const kMid = this._t('ordLineMidEm', pl), kIn = this._t('ordInsideTolPt', pl), kPage = this._t('ordBackdropPageShare', pl), kPageL = this._t('ordBackdropMinLines', pl), kTG = this._t('ordTextInMinGlyphs', pl);
            const kImgInk = this._t('ordBackdropImageInk', pl), kInk = this._t('ordBackdropInk', pl), kWide = this._t('ordBackdropWideShare', pl), kRunInk = this._t('ordBackdropRunInk', pl), kRunL = this._t('ordBackdropRunLines', pl);
            const kLight = this._t('ordLightColourMin', pl), kPart = this._t('ordClusterPartTolPt', pl), kPanel = this._t('ordPanelShare', pl), kPanelEm = this._t('ordPanelMinEm', pl), kIconN = this._t('ordIconMaxParts', pl), kIconEm = this._t('ordIconMaxEm', pl);
            const bars = p.rects.filter(function (r) {
                return r.y1 - r.y0 < kBH && r.x1 - r.x0 < kBW && vec.some(function (v) { return Math.abs(v.y0 - r.y1) < kBN || Math.abs(r.y0 - v.y1) < kBN; }) &&
                       vec.some(function (v) { return v.x1 > r.x0 - kBR && v.x0 < r.x1 + kBR; });
            });
            if (bars.length) this._fire('order.fractionBars', pl);
            // a picture behind the text — a third of the page or more, with lines of text inside it — is the page's
            // background (a web app's layers, a decorated page), no figure: as an item it would bridge every gutter
            const pageArea = (p.view[2] - p.view[0]) * (p.view[3] - p.view[1]);
            const behind = function (b) {
                if ((b.x1 - b.x0) * (b.y1 - b.y0) < kPage * pageArea) return false;
                let n = 0; pl.lines.forEach(function (L) { if (inside(b, (L.x0 + L.x1) / 2, L.y + kMid * L.size, kIn)) n++; });
                if (n >= kPageL) self._fire('order.pageBackground', pl);
                return n >= kPageL;
            };
            // text stays text (PDFIMPORT.md §7, "Pictures and text"): the text lines a box holds — its visible lines whose
            // middle lies in it — and whether they are the page's words or a drawing's labels
            const textIn = function (b) {
                const ls = pl.lines.filter(function (L) {
                    if (!inside(b, (L.x0 + L.x1) / 2, L.y + kMid * L.size, kIn)) return false;
                    return L.glyphs.filter(function (g) { return !g.space && !g.atom && !g.invisible; }).length >= kTG;
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
                const r = image ? t.ink >= kImgInk : t.ink >= kInk && t.widest >= kWide * w || t.ink >= kRunInk && t.lines.length >= kRunL;
                if (r) self._fire('order.textBackdrop', pl);
                return r;
            };
            const clusters = this._clusterFigures(vec.filter(function (v) { return !behind(v); }).concat(bars, p.images.filter(function (b) { return !behind(b) && !backdrop(b, true); }).map(function (b) { return Object.assign({ image: true }, b); })), body, textIn)
                .filter(function (c) { return !backdrop(c, c.image && !vec.some(function (v) { return inside(c, (v.x0 + v.x1) / 2, (v.y0 + v.y1) / 2, 0); })); });
            // decoration is no figure (PDFIMPORT.md §7, "Pictures and text"): a drawing of one colour holding no text
            // that is a panel — one shape filling most of its box (a card's rounded background left alone on the next
            // page: a 470 × 430 pt "picture" of nothing), or a shape in a colour close to white (a light pill on a
            // light page) — or a small icon of a few shapes standing alone (a site's logo mark, a menu's three bars:
            // two and a half em or less each way, four shapes or fewer — a formula's glyphs are more)
            const light = function (c) { const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c || ''); return !!m && [m[1], m[2], m[3]].every(function (h) { return parseInt(h, 16) >= kLight; }); };
            for (let k = clusters.length - 1; k >= 0; k--) {
                const c = clusters[k];
                if (c.image) continue;
                const parts = vec.filter(function (v) { return v.x0 >= c.x0 - kPart && v.x1 <= c.x1 + kPart && v.y0 >= c.y0 - kPart && v.y1 <= c.y1 + kPart; });
                if (!parts.length || bars.some(function (r) { return r.x0 >= c.x0 - kPart && r.x1 <= c.x1 + kPart && r.y0 >= c.y0 - kPart && r.y1 <= c.y1 + kPart; })) continue;
                if (new Set(parts.map(function (v) { return v.color; })).size !== 1 || textIn(c).lines.length) continue;
                const area = (c.x1 - c.x0) * (c.y1 - c.y0), big = Math.max.apply(null, parts.map(function (v) { return (v.x1 - v.x0) * (v.y1 - v.y0); }));
                const panel = big >= kPanel * area && (c.x1 - c.x0 > kPanelEm * body || c.y1 - c.y0 > kPanelEm * body);
                const icon = parts.length <= kIconN && c.x1 - c.x0 <= kIconEm * body && c.y1 - c.y0 <= kIconEm * body;
                if (panel || light(parts[0].color) || icon) { this._fire(panel ? 'order.decorationPanel' : icon ? 'order.decorationIcon' : 'order.decorationLight', pl); clusters.splice(k, 1); }
            }
            return { clusters: clusters, textIn: textIn };
        },

        // _pageBlocks step: pictures hosted inline by a line, glyphs kept as pictures
        async _pbInline(s) {
            const p = s.p, body = s.body, lines = s.lines, flow = s.flow, clusters = s.clusters;
            const allLines = lines.concat(flow.reduce(function (a, f) { return a.concat(f.lines || []); }, []));
            const hosted = new Map(), free = [], self = this;
            const kRun = this._t('ordInlineRunEm', p), kHost = this._t('ordInlineHostShare', p), kHH = this._t('ordInlineMaxHEm', p), kJoin = this._t('ordInlineJoinEm', p);
            const kTY = this._t('ordInlineTwinYEm', p), kTS = this._t('ordInlineTwinSizeShare', p), kTT = this._t('ordInlineTwinTolPt', p), kTG = this._t('ordInlineTwinGapEm', p);
            const kDesc = this._t('ordPicGlyphDescEm', p), kAsc = this._t('ordPicGlyphAscEm', p);
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
                return c.x1 > x0 - kRun * L.size && c.x0 < x1 + kRun * L.size;
            };
            clusters.forEach(function (c) {
                // inside a line band and in its run → inline atom of that line; else a block figure
                const host = allLines.filter(function (L) { return overlapY(c.y0, c.y1, L.bottom, L.top) > Math.min(c.y1 - c.y0, L.top - L.bottom) * kHost && c.y1 - c.y0 < L.size * kHH && inRun(L, c); })[0];
                if (host) { self._fire('order.inlinePicture', p); if (!hosted.has(host)) hosted.set(host, []); hosted.get(host).push(c); } else free.push(c);
            });
            // inline: neighbours with nothing but spaces between them are one formula
            for (const [host, cs] of hosted) {
                cs.sort(function (a, b) { return a.x0 - b.x0; });
                const runs = [];
                cs.forEach(function (c) {
                    const last = runs[runs.length - 1];
                    const between = last && host.glyphs.some(function (g) { return !g.space && !g.atom && g.x + g.w / 2 > last.x1 && g.x + g.w / 2 < c.x0; });
                    if (last && !between && c.x0 - last.x1 < body * kJoin) {
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
                        return S !== H && Math.abs(S.y - H.y) < kTY * sz && Math.abs(S.size - sz) < kTS * sz &&
                            (S.x0 >= c.x1 - kTT && S.x0 - c.x1 < kTG * sz || S.x1 <= c.x0 + kTT && c.x0 - S.x1 < kTG * sz);
                    })[0];
                    if (twin && lines.indexOf(host) >= 0) {
                        this._fire('order.inlineRejoin', p);
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
                    this._fire('order.pictureGlyph', p);
                    const img = await this._crop(p, { x0: g.x, x1: g.x + g.w, y0: g.y - kDesc * g.size, y1: g.y + kAsc * g.size });
                    L.glyphs[k] = { atom: true, img: img, x: g.x, w: g.w, y: g.y, size: g.size, ch: '\uFFFC', page: p.num };
                }
            }
            return { allLines: allLines, free: free };
        },

        // _pageBlocks step: block figures (rows, stacks, trimmed, cropped) into the flow
        async _pbFigures(s) {
            const pl = s.pl, p = s.p, body = s.body, allLines = s.allLines, free = s.free, textIn = s.textIn, flow = s.flow;
            const atoms = [], self = this;
            const kRowGap = this._t('ordFigRowGapEm', pl), kStack = this._t('ordFigStackGapEm', pl), kPad = this._t('ordFigTrimPadPt', pl), kOv = this._t('ordFigTrimOverlapPt', pl);
            const kMinB = this._t('ordFigTrimMinPt', pl), kKeep = this._t('ordFigTrimKeepShare', pl), kMid = this._t('ordLineMidEm', pl), kIn = this._t('ordInsideTolPt', pl);
            // display: parts on one row, then rows stacked closely, are one figure
            const rows = [];
            // (side by side means close: a gap under three em with no text in it — an article's picture and a
            // sidebar's thumbnails at one height are two figures, and as one they bridged the page's gutter)
            const nearAcross = function (x, c) {
                const g0 = Math.min(x.x1, c.x1), g1 = Math.max(x.x0, c.x0);
                if (g1 - g0 <= 0) return true;
                if (g1 - g0 > kRowGap * body) return false;
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
                if (r) { self._fire('order.figureRowJoined', pl); r.x0 = Math.min(r.x0, c.x0); r.x1 = Math.max(r.x1, c.x1); r.y0 = Math.min(r.y0, c.y0); r.y1 = Math.max(r.y1, c.y1); }
                else rows.push(Object.assign({}, c));
            });
            const figs = [];
            rows.sort(function (a, b) { return b.y1 - a.y1; }).forEach(function (r) {
                const last = figs[figs.length - 1];
                const textBetween = last && allLines.some(function (L) { return L.y < last.y0 && L.y > r.y1; });
                // (stacked means one above the other: across the same x — a picture in the article and a widget in the
                // sidebar, side by side at one height, are not stacked)
                const over = last && Math.min(last.x1, r.x1) - Math.max(last.x0, r.x0) > 0;
                if (last && over && !textBetween && last.y0 - r.y1 < body * kStack && !swallows(last, r)) { self._fire('order.figureStacked', pl); last.x0 = Math.min(last.x0, r.x0); last.x1 = Math.max(last.x1, r.x1); last.y0 = Math.min(last.y0, r.y0); }
                else figs.push(r);
            });
            // a figure's box trimmed back from the text that reaches into it from a side (a line whose middle lies outside):
            // the crop shows the picture, not the edge of the paragraph beside it — the side cut that takes the least
            // of the box, line by line; a box the text would cut away entirely is left as it was
            figs.forEach(function (c) {
                const ink = pl.lines.filter(function (L) { return L.glyphs.some(function (g) { return !g.space && !g.atom && !g.invisible; }); });
                const into = function (b) {
                    return ink.filter(function (L) {
                        if (inside(b, (L.x0 + L.x1) / 2, L.y + kMid * L.size, kIn)) return false;
                        return Math.min(b.x1, L.x1) - Math.max(b.x0, L.x0) > kOv && Math.min(b.y1, L.top) - Math.max(b.y0, L.bottom) > kOv;
                    });
                };
                const orig = { x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 }, area0 = (c.x1 - c.x0) * (c.y1 - c.y0);
                for (let guard = 0; guard < 20; guard++) {
                    const hit = into(c);
                    if (!hit.length) break;
                    // every side cut that clears one of them; the one that leaves the fewest lines reaching in, then the most box
                    const cand = [];
                    hit.forEach(function (L) {
                        [['x0', L.x1 + kPad], ['x1', L.x0 - kPad], ['y0', L.top + kPad], ['y1', L.bottom - kPad]].forEach(function (kv) {
                            const b = Object.assign({}, c); b[kv[0]] = kv[1];
                            if (b.x1 - b.x0 > kMinB && b.y1 - b.y0 > kMinB) cand.push({ b: b, left: into(b).length, keep: (b.x1 - b.x0) * (b.y1 - b.y0) });
                        });
                    });
                    cand.sort(function (a, b) { return a.left - b.left || b.keep - a.keep; });
                    if (!cand.length || cand[0].keep < kKeep * area0) { self._fire('order.figureTrimUndone', pl); Object.assign(c, orig); break; }
                    self._fire('order.figureTrimmed', pl);
                    Object.assign(c, cand[0].b);
                }
            });
            if (figs.length) this._fire('order.blockFigure', pl);
            for (const c of figs) atoms.push({ type: 'figure', top: c.y1, box: c, img: await this._crop(p, c), bb: { x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1 } });
            atoms.forEach(function (a) { flow.push(a); });
        },

        // _pageBlocks step: horizontal rules
        _pbRules(s) {
            const M = this._metrics, pl = s.pl, p = s.p, body = s.body, lines = s.lines, tables = s.tables, outer = s.outer, form = s.form, flow = s.flow, self = this;
            const kBH0 = this._t('ordHrBandMinHPt', pl), kBH1 = this._t('ordHrBandMaxHPt', pl), kBHE = this._t('ordHrBandMaxHEm', pl), kUW = this._t('ordHrUprightMaxWPt', pl), kUH = this._t('ordHrUprightMinEm', pl);
            const kFE = this._t('ordHrFrameEndPt', pl), kMin = this._t('ordHrMinShare', pl), kTT = this._t('ordHrTableTolPt', pl), kBE = this._t('ordHrBoxEdgePt', pl), kBS = this._t('ordHrBoxShare', pl), kBI = this._t('ordHrBoxInTolPt', pl);
            const kFS = this._t('ordHrFormShare', pl), kRT = this._t('ordHrRowTolPt', pl), kRG = this._t('ordHrRowGapEm', pl), kBl = this._t('ordBaselineEm', pl), kCR = this._t('ordHrCellReachEm', pl);
            const kTight = this._t('ordHrTightPitchEm', pl), kUT = this._t('ordHrUnderTolPt', pl), kUE = this._t('ordHrUnderEm', pl), kUTE = this._t('ordHrUnderTightEm', pl), kUS = this._t('ordHrUnderShare', pl);
            // horizontal rules outside tables / boxes; a thicker filled band with no text (GitHub's <hr>, 0.25em) too
            const bands2 = p.rects.filter(function (r) {
                const h = r.y1 - r.y0;
                return h >= kBH0 && h <= Math.max(kBH1, kBHE * body) && r.color && !isWhite(r.color) && r.y1 < pl.cutTop && r.y0 > pl.cutBottom &&
                    !pl.lines.some(function (L) { return overlapY(L.bottom, L.top, r.y0, r.y1) > 0 && Math.min(L.x1, r.x1) - Math.max(L.x0, r.x0) > 0; });
            }).map(function (r) { return { x0: r.x0, x1: r.x1, y: (r.y0 + r.y1) / 2, color: r.color, filled: true }; });
            // (an edge of a frame — a vertical rule or band meets it at both ends: a page border of bands, a form's box
            // that is no quote — is no break: a plan's cover and its boxes each read «---»)
            const uprights = p.vsegs.map(function (v) { return { x: v.x, y0: v.y0, y1: v.y1 }; }).concat(p.rects.filter(function (r) {
                return r.x1 - r.x0 <= kUW && r.y1 - r.y0 > kUH * body && r.color && !isWhite(r.color);
            }).map(function (r) { return { x: (r.x0 + r.x1) / 2, y0: r.y0, y1: r.y1 }; }));
            const frameEnd = function (x, y) { return uprights.some(function (v) { return Math.abs(v.x - x) < kFE && v.y0 <= y + kFE && v.y1 >= y - kFE && v.y1 - v.y0 > kUH * body; }); };
            p.hsegs.concat(bands2).forEach(function (s) {
                if (s.x1 - s.x0 < (M.right - M.left) * kMin) return;
                if (frameEnd(s.x0, s.y) && frameEnd(s.x1, s.y)) { self._fire('order.hrFrameEdge', pl); return; }
                if (tables.some(function (t) { return s.y >= t.y0 - kTT && s.y <= t.y1 + kTT && s.x0 >= t.x0 - kTT && s.x1 <= t.x1 + kTT; })) return;
                // (a rule just outside a box, as wide as it, is the box's border)
                if (outer.some(function (b) { return s.y >= b.y0 - kBE && s.y <= b.y1 + kBE && Math.min(s.x1, b.x1) - Math.max(s.x0, b.x0) > kBS * (s.x1 - s.x0); })) { self._fire('order.hrBoxBorder', pl); return; }
                if (outer.some(function (b) { return s.y >= b.y0 - kBI && s.y <= b.y1 + kBI; })) return;
                // (a rule between a form's rows is its frame's)
                if (form.box && s.y > form.box.y0 - body && s.y < form.box.y1 + body && Math.min(s.x1, form.box.x1) - Math.max(s.x0, form.box.x0) > kFS * (s.x1 - s.x0)) { self._fire('order.hrFormFrame', pl); return; }
                // a rule along a row of cells (above / below a header, a booktabs table) is the table's, not a break
                const rowAt = function (above) {
                    const near = lines.filter(function (L) { return above ? L.bottom > s.y - kRT && L.bottom - s.y < kRG * L.size : L.top < s.y + kRT && s.y - L.top < kRG * L.size; });
                    if (!near.length) return null;
                    const y = above ? Math.min.apply(null, near.map(function (L) { return L.y; })) : Math.max.apply(null, near.map(function (L) { return L.y; }));
                    return near.filter(function (L) { return Math.abs(L.y - y) < kBl * L.size; });
                };
                const cells = function (r) {
                    if (!r || r.length < 2) return false;
                    const lo = Math.min.apply(null, r.map(function (L) { return L.x0; })), hiStart = Math.max.apply(null, r.map(function (L) { return L.x0; }));
                    // (the last column's cell runs on past its text: with three cells or more, up to a column's pitch)
                    const pitch = r.length >= 3 ? (hiStart - lo) / (r.length - 1) : 0;
                    return lo - s.x0 < kCR * body && s.x1 - Math.max.apply(null, r.map(function (L) { return L.x1; })) < Math.max(kCR * body, pitch);
                };
                if (cells(rowAt(true)) || cells(rowAt(false))) { self._fire('order.hrRowRule', pl); return; }
                // a link / text underline: just under the baseline of the text it spans — the text of that baseline taken
                // together (a long URL is cut into several segments; Firefox underlines a link that fills a line: Persian
                // an encyclopedia page's references had a rule drawn into a reference, cutting it in three)
                // (or further down, up to 0.75em, when the next line follows at a plain line pitch: no room for a break
                // there — Firefox set the reference links' grey underlines 0.6em down)
                const tight = function (L) { return lines.some(function (M) { return M !== L && M.y < L.y && L.y - M.y < kTight * L.size && Math.min(M.x1, s.x1) > Math.max(M.x0, s.x0); }); };
                // (the part of the rule its clip shows: Firefox's underline is drawn long and clipped to the link)
                const sv = s.shown || s;
                const under = lines.filter(function (L) { return L.y - s.y > -kUT && (L.y - s.y < kUE * L.size || L.y - s.y < kUTE * L.size && tight(L)); });
                const spans = under.reduce(function (n, L) { return n + Math.max(0, Math.min(L.x1, sv.x1) - Math.max(L.x0, sv.x0)); }, 0);
                if (spans > kUS * (sv.x1 - sv.x0)) { self._fire('order.hrUnderline', pl); return; }
                self._fire('order.hr', pl);
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
            const rtlPage = R > Lc, pg = this._page;
            this._rtlPage = rtlPage;
            if (rtlPage) this._fire('order.rtlPage', pg);
            const kSz = this._t('ordSameSizePt', pg), kN = this._t('ordMirrorMinLines', pg), kLo = this._t('ordMirrorLoPct', pg), kHi = this._t('ordMirrorHiPct', pg), kEdge = this._t('ordMirrorEdgeTolPt', pg);
            const kFlush = this._t('ordMirrorFlushEm', pg), kSpan = this._t('ordMirrorSpanShare', pg), kEL = this._t('ordMirrorEdgeLines', pg), kELS = this._t('ordMirrorEdgeLinesSum', pg), kShift = this._t('ordMirrorShiftEm', pg);
            let mirrored = false;
            // a book's mirrored margins: a page whose own column is the document's measure moved to one side — flush with
            // the document's edge on that side, as wide as 92 % of the document's span at least, two lines or more at
            // each of its edges — is measured by its own edges. The document's span covers both kinds of page, and on a
            // recto every line looked set in at the left and short at the right: a biography's last lines became a quote
            let mL = M.left, mR = M.right;
            (function () {
                const bl = lines.filter(function (L) { return Math.abs(L.size - body) < kSz && !L.cell; });
                if (bl.length < kN) return;
                const x0s = bl.map(function (L) { return L.x0; }).sort(function (a, b) { return a - b; }), x1s = bl.map(function (L) { return L.x1; }).sort(function (a, b) { return a - b; });
                const p0 = x0s[Math.floor(x0s.length * kLo)], p1 = x1s[Math.ceil(x1s.length * kHi) - 1];
                const atL = bl.filter(function (L) { return Math.abs(L.x0 - p0) < kEdge; }).length, atR = bl.filter(function (L) { return Math.abs(L.x1 - p1) < kEdge; }).length;
                const flush = Math.abs(p0 - M.left) < kFlush * body || Math.abs(M.right - p1) < kFlush * body;
                if (p0 >= M.left - kFlush * body && p1 <= M.right + kFlush * body && p1 - p0 >= kSpan * (M.right - M.left) && flush && atL >= kEL && atR >= kEL && atL + atR >= kELS &&
                    (Math.abs(p0 - M.left) > kShift * body || Math.abs(M.right - p1) > kShift * body)) { mL = p0; mR = p1; mirrored = true; }
            })();
            if (mirrored) this._fire('order.mirroredMeasure', pg);
            this._pageMeasure = { left: mL, right: mR };
            const leaves = this._xyCut(items, body, mL, mR, rtlPage);
            return { items: items, leaves: leaves, rtlPage: rtlPage };
        },

        // _pageBlocks step: lines beside a float
        _pbFloats(items) {
            // lines beside a float (a figure wrapped by the text) end short without a line break
            // (any block of the page; its caption below it counts too)
            const floats = items, pg = this._page, self = this;
            const kSide = this._t('ordFloatSideTolPt', pg), kLook = this._t('ordFloatWrapLookEm', pg), kUp = this._t('ordFloatWrapUpEm', pg), kInd = this._t('ordFloatWrapIndentEm', pg), kEnd = this._t('ordFloatWrapEndPt', pg);
            items.forEach(function (it) {
                if (!it.line) return;
                it.line.beside = floats.some(function (f) { return Math.min(f.bb.y1, it.bb.y1) - Math.max(f.bb.y0, it.bb.y0) > 0 && f !== it && (f.bb.x0 >= it.bb.x1 + kSide || f.bb.x1 <= it.bb.x0 - kSide); });
                if (it.line.beside) self._fire('order.besideFloat', pg);
            });
            // the wrap goes on below the float (its margin): lines ending where the beside lines end
            const pageLines = items.filter(function (it) { return it.line; }).map(function (it) { return it.line; }).sort(function (a, b) { return b.y - a.y; });
            pageLines.forEach(function (L, i) {
                if (L.beside) return;
                let up = null;
                for (let k = i - 1; k >= 0; k--) {
                    const U = pageLines[k];
                    if (U.y - L.y > kLook * L.size) break;
                    if (U.y - L.y > kUp * L.size && Math.abs(U.x0 - L.x0) < kInd * L.size) { up = U; break; }
                }
                if (up && up.beside && Math.abs(L.x1 - up.x1) < kEnd) { L.beside = true; self._fire('order.besideFloatBelow', pg); }
            });
        },

        // _pageBlocks step: each leaf's items in reading order, runs of lines grouped
        _pbOrder(leaves, body, rtlPage) {
            const self = this, pg = this._page;
            const ordered = [];
            const kRow = this._t('ordRowTolEm', pg), kSide = this._t('ordFloatSideTolPt', pg), kFB = this._t('ordFloatMinBeside', pg), kKey = this._t('ordRowKeyEm', pg), kHr = this._t('ordHrRowKeyRatio', pg);
            const kSz = this._t('ordSameSizePt', pg), kLeaf = this._t('ordSigMinLeafEm', pg), kGap = this._t('ordSigGapShare', pg), kW = this._t('ordSigMaxWShare', pg), kStart = this._t('ordSigStartEm', pg);
            const kO0 = this._t('ordSigOverMinEm', pg), kO1 = this._t('ordSigOverMaxEm', pg);
            leaves.forEach(function (leaf) {
                if (leaf.rows) { self._fire('order.rowsLeaf', pg); self._rowsLeaf(leaf, body, rtlPage).forEach(function (o) { ordered.push(o); }); return; }
                // top to bottom; elements side by side on one row (boxes overlapping by half) by x
                // (a total order: by the top edge, and across the page only for tops on one row — overlap alone is not
                // transitive: a tall float beside short lines would scramble them)
                const rowTol = kRow * body;
                // a float beside text (an infobox, a figure the text wraps around) goes before the lines beside it:
                // the text runs on unbroken
                leaf.items.forEach(function (it) {
                    if (it.line) return;
                    const beside = leaf.items.filter(function (o) {
                        return o.line && Math.min(o.bb.y1, it.bb.y1) - Math.max(o.bb.y0, it.bb.y0) > 0 && (o.bb.x1 <= it.bb.x0 + kSide || o.bb.x0 >= it.bb.x1 - kSide);
                    });
                    it.floatKey = beside.length >= kFB ? Math.max(it.bb.y1, Math.max.apply(null, beside.map(function (o) { return o.line.y + o.line.size * kKey; })) + rowTol + 0.01) : null;
                    if (it.floatKey !== null) self._fire('order.floatFirst', pg);
                });
                // (a rule stands on a row of its own: its key is raised past the row tolerance, so the line under it
                // never shares its row — a frame's double bottom edge just above a line went after it, into a code block)
                const rowKey = function (it) { return it.line ? it.line.y + it.line.size * kKey : it.f && it.f.type === 'hr' ? it.bb.y1 + rowTol * kHr : (it.floatKey !== null && it.floatKey !== undefined ? it.floatKey : it.bb.y1); };
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
                    if (!A || !B || Math.abs(rowKey(leaf.items[k]) - rowKey(leaf.items[k + 1])) > rowTol || Math.abs(A.size - B.size) > kSz) continue;
                    if (k + 2 < leaf.items.length && leaf.items[k + 2].line && Math.abs(rowKey(leaf.items[k + 2]) - rowKey(leaf.items[k])) <= rowTol) continue;
                    const gap = rtlPage ? A.x0 - B.x1 : B.x0 - A.x1;
                    if (lw < kLeaf * A.size || gap < kGap * lw || A.x1 - A.x0 > kW * lw || B.x1 - B.x0 > kW * lw) continue;
                    if (rtlPage ? leaf.x1 - A.x1 > kStart * A.size : A.x0 - leaf.x0 > kStart * A.size) continue;
                    const over = function (X, not) {
                        let best = null;
                        leaf.items.forEach(function (o) {
                            const U = o.line;
                            if (!U || U === A || U === B || U.y - X.y < kO0 * X.size || U.y - X.y > kO1 * X.size) return;
                            if (Math.min(U.x1, X.x1) - Math.max(U.x0, X.x0) <= 0 || Math.min(U.x1, not.x1) - Math.max(U.x0, not.x0) > 0) return;
                            if (!best || U.y < best.y) best = U;
                        });
                        return best;
                    };
                    const uB = over(B, A), uA = over(A, B);
                    if (uB && (!uA || uB.y < uA.y)) { self._fire('order.rowFarSideFirst', pg); const t = leaf.items[k]; leaf.items[k] = leaf.items[k + 1]; leaf.items[k + 1] = t; k++; }
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
            const self = this, pg = this._page;
            const out = [];
            const kIt = this._t('ordQuoteItalicShare', pg), kMono = this._t('ordQuoteMonoShare', pg), kInner = this._t('ordQuoteInnerTolPt', pg);
            ordered.forEach(function (f) {
                if (f.type === 'text') self._textBlocks(f.lines, body, f.left, f.right).forEach(function (b) { out.push(b); });
                else if (f.type === 'table') out.push(f.rows ? f : self._tableBlock(f));
                else if (f.type === 'code') out.push(self._codeBlock(f));
                else if (f.type === 'quote') {
                    const ql = f.lines.sort(function (a, b) { return b.y - a.y; });
                    // the quote style's own italic is not markup
                    if (ql.every(function (L) { return L.italicShare > kIt || L.monoShare > kMono; })) { self._fire('order.quoteStyleItalic', pg); ql.forEach(function (L) { L.glyphs.forEach(function (g) { g.italic = false; }); }); }
                    const kids = [];
                    // the quote's text column: its lines' own edges (the box adds padding and a bar)
                    const qL = Math.min.apply(null, ql.map(function (L) { return L.x0; })), qR = Math.max.apply(null, ql.map(function (L) { return L.x1; }));
                    // nested quotes (bars further in): runs of lines beside an inner bar become a quote of their own
                    // (right to left: lines left of an inner bar or box edge, the innermost the leftmost)
                    const innerOf = function (L) {
                        const cy = (L.top + L.bottom) / 2;
                        return (f.inner || []).filter(function (o) { return cy >= o.y0 - kInner && cy <= o.y1 + kInner && (f.rtl ? L.x1 < o.x0 : L.x0 > o.x1); })
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
            const pg = this._page, self = this, kCol = this._t('ordTableJoinColEm', pg), kGut = this._t('ordTableJoinGutterPt', pg), kGap = this._t('ordTableJoinGapEm', pg), kNest = this._t('ordQuoteNestEm', pg);
            // rows set far apart (LibreOffice's HTML tables) come out as one table each: consecutive tables with the
            // same columns, close together, are one
            for (let i = out.length - 1; i > 0; i--) {
                const a = out[i - 1], b = out[i];
                if (a.type !== 'table' || b.type !== 'table' || !a.rows.length || !b.rows.length || a.rtl !== b.rtl) continue;
                if (a.rows[0].length !== b.rows[0].length || !a.cols || !b.cols || a.cols.length !== b.cols.length) continue;
                const ia = a.cols.slice(1, -1), ib = b.cols.slice(1, -1);
                // (borderless: their gutters overlap; ruled: the same rules)
                const same = a.gutters && b.gutters && a.gutters.length === b.gutters.length
                    ? a.gutters.every(function (g, k) { return Math.max(g[0], b.gutters[k][0]) < Math.min(g[1], b.gutters[k][1]) + kGut; })
                    : ia.every(function (v, k) { return Math.abs(v - ib[k]) <= kCol * body; });
                if (!same) continue;
                const gapY = (a.rowYs && b.rowYs && a.rowYs.length && b.rowYs.length) ? a.rowYs[a.rowYs.length - 1] - b.rowYs[0] : Infinity;
                if (!(gapY > 0 && gapY < kGap * body)) continue;
                this._fire('order.tablesJoined', pg);
                a.rows = a.rows.concat(b.rows); a.rowYs = a.rowYs.concat(b.rowYs); a.pageEnd = b.pageEnd;
                if (a.gutters && b.gutters) a.gutters = a.gutters.map(function (g, k) { return [Math.max(g[0], b.gutters[k][0]), Math.min(g[1], b.gutters[k][1])]; });
                out.splice(i, 1);
            }
            // consecutive indentation-detected quotes (same qrun split into separate paragraphs by _groupLines
            // due to inter-paragraph spacing): merge them into one blockquote with nested structure
            for (let i = out.length - 1; i > 0; i--) {
                // (of one direction: _qx0 is x0 left to right, −x1 right to left — runs of two directions are no nest)
                if (out[i - 1].type === 'quote' && out[i].type === 'quote' && out[i - 1]._qx0 !== undefined && out[i]._qx0 !== undefined && !!out[i - 1]._qrtl === !!out[i]._qrtl) {
                    this._fire('order.indentQuotesJoined', pg);
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
                    if (cx - baseX > kNest * sz) {
                        self._fire('order.indentQuoteNested', pg);
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
            const self = this, pg = this._page;
            const kM = this._t('ordUnframedMonoShare', pg), kGap = this._t('ordUnframedGapEm', pg), kOne = this._t('ordUnframedOneLineMono', pg), kG = this._t('ordUnframedMinGlyphs', pg);
            const kLC = this._t('ordCodeLabelMaxChars', pg), kLW = this._t('ordCodeLabelMaxWords', pg);
            // unframed code (preformatted text with no box): consecutive monospace paragraphs, two lines or more
            // (a "- item" typed in monospace is code too: a list marker inside a code block printed without its box)
            const mono = function (b) { return b && (b.type === 'p' || (b.type === 'li' && !b.task)) && b.lines && b.lines.every(function (L) { return L.monoShare > kM && !L.marker || (L.monoShare > kM && L.marker && L.marker.num); }); };
            for (let i = 0; i < out.length; i++) {
                if (!mono(out[i])) continue;
                let j = i, ls = out[i].lines.slice();
                // (a gap of up to two blank lines stays inside the block: printed without its background, a
                // code block's blank lines split it into monospace paragraphs)
                while (mono(out[j + 1]) && out[j + 1].lines[0].page === ls[ls.length - 1].page && ls[ls.length - 1].y - out[j + 1].lines[0].y < kGap * ls[ls.length - 1].size) { j++; ls = ls.concat(out[j].lines); }
                // one line: a code block too (a paragraph of nothing but code is a <pre>, printed without its box)
                if (ls.length < 2 && (ls[0].monoShare < kOne || ls[0].glyphs.filter(function (g) { return !g.space; }).length < kG)) continue;
                // (one line that is a label — a word or two in capitals, set in a monospace face as web designs do for
                // "DATE", "CATEGORY": no code, a paragraph)
                if (ls.length < 2) {
                    const t = ls[0].glyphs.map(function (g) { return g.ch || ''; }).join('').trim();
                    if (t.length <= kLC && /^[\p{Lu}\d][\p{Lu}\d &\/·.-]*$/u.test(t) && t.split(/\s+/).length <= kLW) { this._fire('order.monoLabel', pg); continue; }
                }
                this._fire('order.unframedCode', pg);
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
            const kBT = this._t('ordOcrBodyTolPt', page), kBS = this._t('ordOcrBodyTolShare', page), kInd = this._t('ordOcrIndentEm', page), kBG = this._t('ordOcrBulletGapEm', page);
            const kBM = this._t('ordOcrBoxMidEm', page), kBH = this._t('ordOcrBoxHalfEm', page), kMA = this._t('ordOcrMarkerAlignPt', page), kRP = this._t('ordOcrRunPitchEm', page);
            const kTI = this._t('ordOcrTickInside', page), kTE = this._t('ordOcrTickEdge', page), kLP = this._t('ordOcrListPitchEm', page), kLI = this._t('ordOcrListIndentPt', page);
            const kIn = this._t('ordOcrInnerEm', page), kMR = this._t('ordOcrListMinRun', page), kMI = this._t('ordOcrListMinItems', page), kMO = this._t('ordOcrMarkerOffsetEm', page);
            const ls = lines.filter(function (L) { return !L.cell && Math.abs(L.size - body) <= Math.max(kBT, kBS * body); }).sort(function (a, b) { return b.y - a.y; });
            const rtlOf = function (L) { return L.strong.R > L.strong.L; };
            const indentOf = function (L) { return rtlOf(L) ? M.right - L.x1 : L.x0 - M.left; };
            ls.forEach(function (L) {
                if (L.marker || L.num || indentOf(L) < kInd * body) return;
                const rtl = rtlOf(L), gs = L.glyphs.slice().sort(function (a, b) { return rtl ? b.x - a.x : a.x - b.x; });
                const k = gs.findIndex(function (g) { return !g.space; });
                if (k < 0 || !BUL.test(gs[k].ch) || !(gs[k + 1] && gs[k + 1].space) || !(gs[k + 2] && /\p{L}/u.test(gs[k + 2].ch))) return;
                self._fire('order.ocrBullet', page);
                L.marker = { x: gs[k].x + gs[k].w / 2, side: rtl ? 'right' : 'left', task: false, checked: false, ocr: true };
                // a task box: the scan shows a square there — its sides inked; a tick inside it is a checked one
                // (a bullet before the box — «•» read as «°» — leaves the box in the gap before the item's words)
                const nx = gs[k + 2].x, ex = gs[k].x + gs[k].w;
                const cx = nx - ex >= kBG * L.size ? (ex + nx) / 2 : gs[k].x + gs[k].w / 2, cy = L.y + kBM * L.size, h = kBH * L.size;
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
                while (j < marked.length && Math.abs(marked[j].marker.x - marked[i].marker.x) < kMA && marked[j - 1].y - marked[j].y < kRP * marked[j].size) j++;
                const run = marked.slice(i, j), ticked = function (L) { return !!L._box && L._box.inside >= kTI && L._box.edge >= kTE; };
                if (run.some(ticked)) { this._fire('order.ocrTaskList', page); run.forEach(function (L) { L.marker.task = true; L.marker.checked = ticked(L); }); }
                i = j;
            }
            const text = function (L) { return L.glyphs.slice().sort(function (a, b) { return rtlOf(L) ? b.x - a.x : a.x - b.x; }).map(function (g) { return g.ch || ''; }).join('').trim(); };
            for (let i = 0; i < ls.length; i++) {
                const A = ls[i], ind = indentOf(A);
                if (A.marker || A.num || ind < kInd * body) continue;
                const run = [A], inner = [];
                let prev = A;
                for (let j = i + 1; j < ls.length; j++) {
                    const B = ls[j];
                    if (prev.y - B.y > kLP * B.size) break;
                    const d = indentOf(B) - ind;
                    if (Math.abs(d) <= kLI && !B.marker && !B.num) run.push(B);
                    else if (d > kIn * body && B.marker) inner.push(B);
                    else break;
                    prev = B;
                }
                if (run.length < kMR || run.length + inner.length < kMI) continue;
                const ok = run.every(function (L, n) {
                    const t = text(L);
                    return /^\p{Lu}/u.test(t) && (n === run.length - 1 || !/[.!?:;؟]$/.test(t));
                });
                if (!ok) continue;
                this._fire('order.ocrListItems', page);
                run.forEach(function (L) {
                    const rtl = rtlOf(L);
                    L.marker = { x: rtl ? L.x1 + kMO * body : L.x0 - kMO * body, side: rtl ? 'right' : 'left', task: false, checked: false, ocr: true };
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
            const self = this, S = this._t('ordOcrScale');
            for (const p of pages) {
                if (!p.page || !p.glyphs.length) continue;
                const kWY = this._t('ordOcrWordYEm', p), kWG = this._t('ordOcrWordGapEm', p), kDark = this._t('ordOcrDarkLevel', p), kTop = this._t('ordOcrWordTopEm', p), kBot = this._t('ordOcrWordBotEm', p);
                const kPx = this._t('ordOcrMinPx', p), kRuns = this._t('ordOcrMinRuns', p), kSH = this._t('ordOcrStrikeHiEm', p), kSL = this._t('ordOcrStrikeLoEm', p), kSG = this._t('ordOcrStrikeMinGlyphs', p);
                const kSS = this._t('ordOcrStrikeShare', p), kRef = this._t('ordOcrRefMinGlyphs', p), kBold = this._t('ordOcrBoldRatio', p), kBG = this._t('ordOcrBoldMinGlyphs', p);
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
                    if (g.space || !g.ch || !g.ch.trim() || last && (Math.abs(g.y - last.y) > kWY * g.size || g.x - (last.x + last.w) > kWG * g.size || g.x < last.x)) { if (cur.length) words.push(cur); cur = []; }
                    if (!g.space && g.ch && g.ch.trim()) cur.push(g);
                });
                if (cur.length) words.push(cur);
                const px = function (x, y) { const q = vp.convertToViewportPoint(x, y); return [Math.round(q[0]), Math.round(q[1])]; };
                const dark = function (x, y) { return x >= 0 && y >= 0 && x < W && y < H && gray[y * W + x] < kDark; };
                const stats = words.map(function (w) {
                    const a = w[0], z = w[w.length - 1], size = median(w.map(function (g) { return g.size; }));
                    const tl = px(a.x, a.y + kTop * size), br = px(z.x + z.w, a.y - kBot * size);
                    const x0 = Math.min(tl[0], br[0]), x1 = Math.max(tl[0], br[0]), y0 = Math.min(tl[1], br[1]), y1 = Math.max(tl[1], br[1]);
                    if (x1 - x0 < kPx || y1 - y0 < kPx) return null;
                    const runs = [];
                    for (let y = y0; y <= y1; y++) {
                        let n = 0;
                        for (let x = x0; x <= x1 + 1; x++) { if (x <= x1 && dark(x, y)) n++; else if (n) { runs.push(n); n = 0; } }
                    }
                    if (runs.length < kRuns) return null;
                    runs.sort(function (u, v) { return u - v; });
                    // the strike: rows through the small letters' middle, one dark run over 90 % of the width
                    let strike = false;
                    const m0 = px(a.x, a.y + kSH * size)[1], m1 = px(a.x, a.y + kSL * size)[1];
                    if (w.length >= kSG) for (let y = Math.min(m0, m1); y <= Math.max(m0, m1) && !strike; y++) {
                        let n = 0, best = 0, gap = 0;
                        for (let x = x0; x <= x1; x++) { if (dark(x, y)) { n += 1 + gap; gap = 0; } else if (n && gap < 1) gap++; else { best = Math.max(best, n); n = 0; gap = 0; } }
                        best = Math.max(best, n);
                        if (best >= kSS * (x1 - x0)) strike = true;
                    }
                    return { w: w, sw: runs[runs.length >> 1] / (S * size), strike: strike };
                });
                const ref = median(stats.filter(function (t) { return t && t.w.length >= kRef; }).map(function (t) { return t.sw; }));
                stats.forEach(function (t) {
                    if (!t) return;
                    if (t.strike) self._fire('order.ocrInkStrike', p);
                    // (the word's punctuation at its ends not: «**Schema drift**,» — the OCR's word holds the comma)
                    if (ref && t.sw >= kBold * ref && t.w.length >= kBG) {
                        self._fire('order.ocrInkBold', p);
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
            const kDark = this._t('ordOcrBoxDarkLevel', p), kFaint = this._t('ordOcrBoxFaintLevel', p);
            const bw = Math.max(1, Math.round(this._t('ordOcrBoxBorderShare', p) * (x1 - x0)));
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
                const v = at(x, y) < kDark;
                const border = x - x0 < bw || x1 - x < bw || y - y0 < bw || y1 - y < bw;
                if (border) { edgeN++; if (v) edge++; if (at(x, y) < kFaint) faint++; } else if (x - x0 > 2 * bw && x1 - x > 2 * bw && y - y0 > 2 * bw && y1 - y > 2 * bw) { inN++; if (v) inD++; }
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
            const self = this;
            all.forEach(function (pl) {
                const kRow = self._t('ordOcrRowEm', pl), kCS = self._t('ordOcrCodeSizeShare', pl), kCP = self._t('ordOcrCodePunct', pl), kCWG = self._t('ordOcrCodeWordGlyphs', pl), kCW = self._t('ordOcrCodeMinWords', pl);
                const kCL = self._t('ordOcrCodeLetterEm', pl), kTL = self._t('ordOcrTallMinLetters', pl), kTS = self._t('ordOcrTallSizeTolPt', pl), kTR = self._t('ordOcrTallRatio', pl);
                const kSnap = self._t('ordOcrBodySnapShare', pl), kSnapM = self._t('ordOcrBodySnapMono', pl), kJLE = self._t('ordOcrJoinLongEm', pl), kJLG = self._t('ordOcrJoinLongGlyphs', pl);
                const kJSE = self._t('ordOcrJoinShortEm', pl), kJSG = self._t('ordOcrJoinShortGlyphs', pl), kJXG = self._t('ordOcrJoinLongerGlyphs', pl), kJSz = self._t('ordOcrJoinSizePt', pl);
                // rows: the segments of one baseline, top to bottom
                const rows = [];
                pl.lines.slice().sort(function (a, b) { return b.y - a.y || a.x0 - b.x0; }).forEach(function (L) {
                    const r = rows[rows.length - 1];
                    if (r && Math.abs(r[0].y - L.y) < kRow * Math.min(r[0].size, L.size)) r.push(L); else rows.push([L]);
                });
                const codey = rows.map(function (r) {
                    const size = median(r.map(function (L) { return L.size; }));
                    if (size > kCS * body) return false;
                    const t = r.map(function (L) { return ink(L).map(function (g) { return g.ch; }).join(''); }).join(' ');
                    if ((t.match(CODEP) || []).length >= kCP) return true;
                    // (words of letters only: a table's figures, «31h» «-94%», are wide for their letters too)
                    const ws = [].concat.apply([], r.map(words)).filter(function (w) { return w.length >= kCWG && w.every(function (g) { return /^[\p{L},.]$/u.test(g.ch); }); });
                    if (ws.length < kCW) return false;
                    return median(ws.map(function (w) { return (w[w.length - 1].x + w[w.length - 1].w - w[0].x) / w.length / size; })) >= kCL;
                });
                const gone = new Set();
                rows.forEach(function (r, i) {
                    // (a closing bracket alone on its row, right after code: the call's end)
                    const closer = !codey[i] && i > 0 && codey[i - 1] && r.length === 1 && /^[)\]}]+[;,]?$/.test(ink(r[0]).map(function (g) { return g.ch; }).join(''));
                    if (!codey[i] && !closer) return;
                    self._fire(closer ? 'order.ocrCodeCloser' : 'order.ocrCodeRow', pl);
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
                    if (lead || (t.match(/\p{L}/gu) || []).length < kTL || /[gjpqy,;]/.test(t) || /[.:!?؟]$/.test(t) || L.size < body - kTS) return;
                    self._fire('order.ocrTallLine', pl);
                    L.size = Math.round(L.size * kTR);
                });
                // the body's sizes, then prose cut at a wide ink gap
                pl.lines.forEach(function (L) { if (!gone.has(L) && L.monoShare < kSnapM && Math.abs(L.size - body) <= kSnap * body) { if (L.size !== body) self._fire('order.ocrBodySize', pl); L.size = body; } });
                rows.forEach(function (r, i) {
                    if (codey[i] || r.length < 2) return;
                    r.sort(function (a, b) { return a.x0 - b.x0; });
                    // (a row that starts with a lone misread bullet — a task list's checkboxes read as «°» — is one line:
                    // its words lined up from row to row and the list came out as a table)
                    const rtl = r.reduce(function (n, L) { return n + L.strong.R - L.strong.L; }, 0) > 0, lead = rtl ? r[r.length - 1] : r[0];
                    const leadInk = ink(lead);
                    if (leadInk.length === 1 && OCR_BUL.test(leadInk[0].ch)) { self._fire('order.ocrBulletRow', pl); r.slice(1).forEach(function (L) { gone.add(L); }); merge(r.slice(), false); return; }
                    for (let k = 1; k < r.length; k++) {
                        const A = r[k - 1], B = r[k];
                        if (gone.has(A) || gone.has(B)) continue;
                        // (or a short run beside a long one, closer: a line's last words «A removed» after a sentence)
                        const nA = ink(A).length, nB = ink(B).length, gap = B.x0 - A.x1, em = Math.max(A.size, B.size);
                        const near = gap <= kJLE * em && nA >= kJLG && nB >= kJLG || gap <= kJSE * em && Math.min(nA, nB) >= kJSG && Math.max(nA, nB) >= kJXG;
                        if (!near || Math.abs(A.size - B.size) > kJSz) continue;
                        self._fire('order.ocrGapJoined', pl);
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
            const kMono = this._t('ordFormMaxMono', p), kRow = this._t('ordFormRowEm', p), kFL = this._t('ordFieldLabelMaxChars', p), kFV = this._t('ordFieldValueMaxChars', p), kLead = this._t('ordFormLeadEm', p);
            const kCP = this._t('ordFormContPitchEm', p), kCS = this._t('ordFormContShare', p), kRun = this._t('ordFormRunGapEm', p), kCol = this._t('ordFormColumnTolPt', p);
            const kFS = this._t('ordFormFrameShare', p), kFP = this._t('ordFormFramePadEm', p), kMin = this._t('ordFormMinRows', p), kVR = this._t('ordFormValueRowEm', p), kVO = this._t('ordFormValueOverlapPt', p);
            lines.slice().sort(function (a, b) { return b.y - a.y || a.x0 - b.x0; }).forEach(function (L) {
                if (L.monoShare > kMono || L.cell === undefined && false) return;
                const r = rows[rows.length - 1];
                if (r && Math.abs(r.y - L.y) < kRow * Math.min(r.size, L.size)) r.segs.push(L); else rows.push({ y: L.y, size: L.size, segs: [L] });
            });
            const info = function (L) {
                const rtl = L.strong.R > L.strong.L, g = self._joinLines([L], rtl ? 'rtl' : 'ltr');
                const t = g.map(function (x) { return x.atom ? '' : x.ch || ''; }).join('');
                const m = t.trim().match(LABEL);
                return { L: L, rtl: rtl, g: g, t: t, label: !!m };
            };
            // (a row of one pair in one run — «Review date: 2026-10-24» — goes on with a form when it is short: a field, not a
            // sentence; it never starts one, nor counts toward the three rows — a page's «Arrows: ← → …» lines are prose)
            const field = function (q) { const t = q.t.trim(), k = t.search(/[:：]/); return q.label && k <= kFL && t.length - k <= kFV; };
            rows.forEach(function (r) { r.info = r.segs.map(info); r.form = r.segs.length >= 2 && r.info.some(function (s) { return s.label; }); r.field = r.segs.length === 1 && field(r.info[0]); });
            // runs of form rows
            let i = 0;
            // (a run may start with a value set on its own just above its first form row)
            const lead = function (k) { return rows[k].segs.length === 1 && !rows[k].info[0].label && rows[k + 1] && rows[k + 1].form && rows[k].y - rows[k + 1].y <= kLead * rows[k].size; };
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
                    if (r.form || r.info.some(function (q) { return q.label; }) || up.y - r.y > kCP * r.size) return false;
                    return r.segs.every(function (S) { return valueSegs(up).some(function (V) { return S.x0 >= V.L.x0 - r.size && S.x1 <= V.L.x1 + r.size && V.L.x1 - V.L.x0 > kCS * (S.x1 - S.x0); }); });
                };
                while (j < rows.length && rows[j - 1].y - rows[j].y <= kRun * body && (rows[j].form || lead(j) || cont(j) && (rows[j].cont = true) || rows[j].field && (rows[j].asForm = true))) j++;
                const run = rows.slice(i, j), fr = run.filter(function (r) { return r.form; });
                // (two rows are enough when their labels stand in one column — a header's «Date:», «Invoice number:»)
                // (the row's first label in reading order: at its start side)
                const startX = function (r) {
                    const ls = r.info.filter(function (q) { return q.label; }), rtl = ls.reduce(function (n, q) { return n + (q.rtl ? 1 : -1); }, 0) > 0;
                    return rtl ? Math.max.apply(null, ls.map(function (q) { return q.L.x1; })) : Math.min.apply(null, ls.map(function (q) { return q.L.x0; }));
                };
                const column = fr.length === 2 && Math.abs(startX(fr[0]) - startX(fr[1])) < kCol;
                // a form is drawn as one: rules or fills along its rows or round them (a box, a ruled table, a band), or
                // its labels stand apart from their values («Date:» … «2026-10-24»). Two columns of prose whose lines
                // start «Latin: …», «Arrows: …» at one height are none — read as pairs, the columns ran together
                const bx = { x0: Math.min.apply(null, run.map(function (r) { return Math.min.apply(null, r.segs.map(function (L) { return L.x0; })); })),
                             x1: Math.max.apply(null, run.map(function (r) { return Math.max.apply(null, r.segs.map(function (L) { return L.x1; })); })),
                             y0: run[run.length - 1].y - run[run.length - 1].size, y1: run[0].y + run[0].size };
                const w = bx.x1 - bx.x0;
                const framed = !!p && ((p.hsegs || []).some(function (h) { return h.y > bx.y0 - body && h.y < bx.y1 + body && Math.min(h.x1, bx.x1) - Math.max(h.x0, bx.x0) > kFS * w; }) ||
                    (p.vsegs || []).some(function (v) { return v.x > bx.x0 - kFP * body && v.x < bx.x1 + kFP * body && Math.min(v.y1, bx.y1) - Math.max(v.y0, bx.y0) > kFS * (bx.y1 - bx.y0); }) ||
                    (p.rects || []).some(function (r) { return Math.min(r.x1, bx.x1) - Math.max(r.x0, bx.x0) > kFS * w && Math.min(r.y1, bx.y1 + kFP * body) - Math.max(r.y0, bx.y0 - kFP * body) > 0; }));
                const apart = fr.every(function (r) { return r.info.filter(function (q) { return q.label; }).every(function (q) { return /[:：]\s*$/.test(q.t.trim()); }); });
                if ((fr.length >= kMin || column) && (framed || apart)) {
                    self._fire(framed ? 'order.formFramed' : 'order.formLabelsApart', p);
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
                            if (!o || Math.abs(o.r.y - b.r.y) > kVR * b.r.size) return;
                            o.pairs.forEach(function (P) {
                                if (P.value.length || !P.segs.length) return;
                                const lab = P.segs[0], d = rtl ? lab.x0 - v.x1 : v.x0 - lab.x1;
                                if (d > -kVO && d < bd) { bd = d; best = P; }
                            });
                        });
                        if (best) { self._fire('order.formValueAlone', p); best.value = b.pairs[0].value; best.segs.push(v); b.pairs = []; }
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
            const found = new Set(), groups = [], pg = this._page;
            const kMax = this._t('ordLatticeMaxPt', pg), kSq = this._t('ordLatticeSquareTolPt', pg), kSz = this._t('ordLatticeSizeTolPt', pg), kPos = this._t('ordLatticePosTolPt', pg);
            const kPitch = this._t('ordLatticePitchShare', pg), kDots = this._t('ordLatticeMinDots', pg), kAxis = this._t('ordLatticeMinAxis', pg), kFill = this._t('ordLatticeFillShare', pg);
            shapes.forEach(function (s) {
                const w = s.x1 - s.x0, h = s.y1 - s.y0;
                if (w <= 0 || h <= 0 || w > kMax || h > kMax || Math.abs(w - h) > kSq) return;
                // (half a point apart is one size: PowerPoint rounds a grid's dots to the half point — 4 and 4.5 pt — and its
                // last column and one row fell in a group of their own, the rest not a grid any more)
                let g = groups.filter(function (x) { return Math.abs(x.w - w) < kSz && Math.abs(x.h - h) < kSz; })[0];
                if (!g) { g = { w: w, h: h, m: [] }; groups.push(g); }
                const k = Math.round(s.x0 * 2) + ',' + Math.round(s.y0 * 2);
                if (!g.m.some(function (o) { return o.k === k; })) g.m.push({ k: k, x: s.x0, y: s.y0 });
            });
            const axis = function (vs) {          // distinct positions (within 0.6 pt) and whether their steps are one pitch
                const u = [];
                vs.slice().sort(function (a, b) { return a - b; }).forEach(function (v) { if (!u.length || v - u[u.length - 1] > kPos) u.push(v); });
                const st = []; for (let i = 1; i < u.length; i++) st.push(u[i] - u[i - 1]);
                const md = median(st);
                return { n: u.length, regular: st.length > 0 && md > 0 && st.every(function (d) { return Math.abs(d - md) <= kPitch * md; }) };
            };
            groups.forEach(function (g) {
                if (g.m.length < kDots) return;
                const ax = axis(g.m.map(function (o) { return o.x; })), ay = axis(g.m.map(function (o) { return o.y; }));
                if (ax.n < kAxis || ay.n < kAxis || !ax.regular || !ay.regular || g.m.length < kFill * ax.n * ay.n) return;
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
            const leaves = this._xyRegions(X, items, x0, x1, rtl), merged = [], self = this, pg = this._page;
            const kBl = this._t('ordXyBaselineEm', pg), kRows = this._t('ordXyHeaderMaxRows', pg), kGap = this._t('ordXyHeaderGapEm', pg), kOv = this._t('ordXyHeaderOverlapEm', pg);
            leaves.forEach(function (lf) {
                const pv = merged[merged.length - 1];
                // (the leaf above: a header row, perhaps under its section heading — two baselines at most)
                const baselines = function (l) {
                    const ys = l.items.map(function (it) { return it.line ? it.line.y : 0; }).sort(function (a, b) { return b - a; });
                    return ys.filter(function (y, k) { return !k || ys[k - 1] - y > kBl * body; }).length;
                };
                if (pv && pv.rows && lf.rows && baselines(pv) <= kRows && baselines(lf) > kRows) {
                    const bot = Math.min.apply(null, pv.items.map(function (it) { return it.bb.y0; }));
                    const top = Math.max.apply(null, lf.items.map(function (it) { return it.bb.y1; }));
                    if (bot - top < kGap * body && bot - top > -kOv * body) { self._fire('order.xyHeaderRowJoined', pg); pv.items = pv.items.concat(lf.items); pv.x0 = Math.min(pv.x0, lf.x0); pv.x1 = Math.max(pv.x1, lf.x1); return; }
                }
                merged.push(lf);
            });
            return merged;
        },

        // _xyTests / _xyRegions: their thresholds, read once a page
        _ordXyK(pg) {
            return {
                bl: this._t('ordBaselineEm', pg), colEm: this._t('ordColGapEm', pg), colPt: this._t('ordColGapMinPt', pg), rowEm: this._t('ordRowGapEm', pg),
                rsLines: this._t('ordRowsMinLines', pg), rsShared: this._t('ordRowsSharedShare', pg), rsWords: this._t('ordRowsMaxWords', pg), rsNarrow: this._t('ordRowsNarrowShare', pg),
                rsHead: this._t('ordRowsHeadingRatio', pg), rsProseL: this._t('ordRowsProseMinLines', pg), rsProseEnd: this._t('ordRowsProseEndShare', pg),
                rsProseSp: this._t('ordRowsProseMinSpaces', pg), rsProse: this._t('ordRowsProseShare', pg), bandTol: this._t('ordBandedRowTolPt', pg),
                trWords: this._t('ordThroughRowsMaxWords', pg), trShare: this._t('ordThroughRowsShare', pg), sbs: this._t('ordSideBySideShare', pg),
                scItems: this._t('ordShortColMinItems', pg), scShare: this._t('ordShortColShare', pg), scEnd: this._t('ordShortColEndEm', pg),
                brWords: this._t('ordBaselineRunMaxWords', pg), brPitch: this._t('ordBaselineRunPitchEm', pg), brSteps: this._t('ordBaselineRunMinSteps', pg),
                brHeadEm: this._t('ordBaselineRunHeadGapEm', pg), brHeadPt: this._t('ordBaselineRunHeadGapPt', pg), brHeadTol: this._t('ordBaselineRunHeadTolPt', pg),
                cellN: this._t('ordCellishMinLines', pg), cellShare: this._t('ordCellishShare', pg), fenceRule: this._t('ordFenceRuleShare', pg), fenceSide: this._t('ordFenceSideTolPt', pg),
                wallW: this._t('ordWallMaxWPt', pg), wallShare: this._t('ordWallShare', pg), wallTol: this._t('ordWallTolPt', pg), wallN: this._t('ordWallMinItems', pg), wallFig: this._t('ordWallFigureReachPt', pg),
                bandWords: this._t('ordBandedRowMaxWords', pg), cardTol: this._t('ordCardGapTolPt', pg), colsN: this._t('ordColsMinItems', pg), colsWideN: this._t('ordColsWideMinItems', pg),
                colsWideEm: this._t('ordColsWideGapEm', pg), colsPitch: this._t('ordColsTextPitchEm', pg), cutSlack: this._t('ordCutSizeSlack', pg), cutGap: this._t('ordCutGapSlackEm', pg),
                slabAl: this._t('ordSlabAlignPt', pg), slabN: this._t('ordSlabRunMinItems', pg)
            };
        },

        // _xyCut step: the gap finders and the tests a region's parts are put to
        _xyTests(body) {
            const self = this, pg = this._page, K = this._ordXyK(pg);
            const colGap = Math.max(K.colEm * body, K.colPt), rowGap = K.rowEm * body, fences = this._fences || [];
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
                if (ls.length < K.rsLines || ls.length < list.length) return false;
                let shared = 0;
                ls.forEach(function (a) {
                    if (ls.some(function (b) { return b !== a && Math.abs(b.line.y - a.line.y) < K.bl * a.line.size && (b.bb.x0 > a.bb.x1 || b.bb.x1 < a.bb.x0); })) shared++;
                });
                const words = ls.map(function (it) { return it.line.glyphs.filter(function (g) { return g.space; }).length + 1; }).sort(function (a, b) { return a - b; });
                if (!(shared >= ls.length * K.rsShared && words[words.length >> 1] <= (maxWords || K.rsWords))) return false;
                // (columns of prose, however narrow, are no table: headings stand in two of them, larger than the text, or
                // most lines of each column run to its far side — two A5 columns of short wrapped lines, lists and
                // quotes shared their baselines and became a two-column table)
                const narrow = ls.filter(function (it) { return it.bb.x1 - it.bb.x0 < K.rsNarrow * (extent(ls).x1 - extent(ls).x0); });
                const nGaps = gapsOf(narrow, 'x', colGap);
                if (nGaps.length && splitBy(narrow, 'x', nGaps).filter(function (q) { return q.some(function (it) { return it.line.size > K.rsHead * body; }); }).length >= 2) { self._fire('order.xyProseHeadings', pg); return false; }
                if (vg && vg.length) {
                    const parts = splitBy(list, 'x', vg).filter(function (q) { return q.filter(function (it) { return it.line; }).length >= K.rsProseL; });
                    if (parts.length >= 2 && parts.every(function (q) {
                        const e = extent(q), w = e.x1 - e.x0, qs = q.filter(function (it) { return it.line; });
                        return qs.filter(function (it) { return it.bb.x1 >= e.x1 - K.rsProseEnd * w && it.line.glyphs.filter(function (g) { return g.space; }).length >= K.rsProseSp; }).length >= K.rsProse * qs.length;
                    })) { self._fire('order.xyProseColumns', pg); return false; }
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
                        return inBand.some(function (a) { return a.bb.x1 <= g[0] + K.bandTol && inBand.some(function (b) { return b.bb.x0 >= g[1] - K.bandTol && Math.abs(b.line.y - a.line.y) < K.bl * a.line.size; }); });
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
                    return words(it) <= K.trWords && Lg.some(function (o) { return words(o) <= K.trWords && Math.abs(o.line.y - it.line.y) < K.bl * it.line.size; });
                }).length;
                return paired >= K.trShare * S.length;
            };
            const sideBySide = function (parts) {
                for (let i = 0; i + 1 < parts.length; i++) {
                    const a = parts[i], b = parts[i + 1];
                    if (throughRows(a, b)) { self._fire('order.xyGutterThroughRows', pg); return false; }
                    const meets = function (p, q) {
                        return p.filter(function (it) { return q.some(function (o) { return Math.min(it.bb.y1, o.bb.y1) - Math.max(it.bb.y0, o.bb.y0) > 0; }); }).length;
                    };
                    let ok = meets(a, b) >= a.length * K.sbs && meets(b, a) >= b.length * K.sbs;
                    if (!ok && parts.length === 2) {
                        // a short column (the end of an article) wholly beside a long one that runs on
                        // past its end without a break (a break there = a section ending across the page)
                        const S = a.length < b.length ? a : b, Lg = S === a ? b : a;
                        const yb = Math.min.apply(null, S.map(function (it) { return it.bb.y0; }));
                        const yt = Math.max.apply(null, S.map(function (it) { return it.bb.y1; }));
                        const lt = Math.max.apply(null, Lg.map(function (it) { return it.bb.y1; }));
                        const ys = Lg.filter(function (it) { return it.bb.y1 < yb + body; }).map(function (it) { return [it.bb.y0, it.bb.y1]; });
                        ok = S.length >= K.scItems && meets(S, Lg) >= S.length * K.scShare && Math.abs(yt - lt) < K.scEnd * body && ys.length > 0;
                        if (ok) self._fire('order.xyShortColumn', pg);
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
                    if (r && Math.abs(r.y - it.line.y) < K.bl * it.line.size) r.items.push(it); else rows.push({ y: it.line.y, items: [it] });
                });
                const text = function (it) { return it.line.glyphs.map(function (g) { return g.ch || ''; }).join('').trim(); };
                const cellRow = function (r) {
                    if (r.items.length < 2 || gapsOf(r.items, 'x', colGap).length < r.items.length - 1) return false;
                    const its = r.items.slice().sort(function (a, b) { return a.bb.x0 - b.bb.x0; });
                    // (a list's marker and its item are no two cells)
                    if (lead.test(text(its[0]))) return false;
                    return its.every(function (it) { return words(it) <= K.brWords; });
                };
                let best = null;
                for (let i = 0; i < rows.length; i++) {
                    if (!cellRow(rows[i])) continue;
                    let j = i; while (j + 1 < rows.length && cellRow(rows[j + 1]) && rows[j].y - rows[j + 1].y < K.brPitch * rows[j].items[0].line.size) j++;
                    const its = rows.slice(i, j + 1).reduce(function (a, r) { return a.concat(r.items); }, []);
                    if (j - i >= K.brSteps && gapsOf(its, 'x', colGap).length && (!best || its.length > best.its.length)) best = { i: i, j: j, its: its };
                    i = j;
                }
                // (its header row above it, its cells closer than a column's gap — four short bold words over right-aligned
                // numbers stand a little apart — when no cell of it crosses the run's gutters: the table's own)
                if (best && best.i > 0) {
                    const H = rows[best.i - 1], gut = gapsOf(best.its, 'x', colGap), sz = best.its[0].line.size;
                    const fits = H.items.length >= 2 && H.items.length <= gut.length + 1 && rows[best.i - 1].y - rows[best.i].y < K.brPitch * sz &&
                        gapsOf(H.items, 'x', Math.max(K.brHeadEm * body, K.brHeadPt)).length >= H.items.length - 1 &&
                        H.items.every(function (it) { return words(it) <= K.brWords && !gut.some(function (g) { return it.bb.x0 < g[0] - K.brHeadTol && it.bb.x1 > g[1] + K.brHeadTol; }); }) &&
                        !lead.test(text(H.items.slice().sort(function (a, b) { return a.bb.x0 - b.bb.x0; })[0]));
                    if (fits) { self._fire('order.xyBaselineRunHeader', pg); best.i--; best.its = H.items.concat(best.its); }
                }
                if (!best || (best.i === 0 && best.j === rows.length - 1 && !others.length)) return null;
                // (the page's other elements — figures, ruled tables — go above or below it; one beside it: no cut)
                const top = Math.max.apply(null, best.its.map(function (it) { return it.bb.y1; })), bot = Math.min.apply(null, best.its.map(function (it) { return it.bb.y0; }));
                if (others.some(function (o) { return o.bb.y0 < top && o.bb.y1 > bot; })) return null;
                const flat = function (rs) { return rs.reduce(function (a, r) { return a.concat(r.items); }, []); };
                return [flat(rows.slice(0, best.i)).concat(others.filter(function (o) { return o.bb.y0 >= top; })), best.its,
                        flat(rows.slice(best.j + 1)).concat(others.filter(function (o) { return o.bb.y1 <= bot; }))];
            };
            return { colGap: colGap, rowGap: rowGap, fences: fences, gapsOf: gapsOf, splitBy: splitBy, extent: extent, rowStructured: rowStructured, bandedRow: bandedRow, sideBySide: sideBySide, baselineRun: baselineRun, body: body, K: K, pg: pg };
        },

        // _xyCut step: the recursive cut of a region into leaves
        _xyRegions(X, items, x0, x1, rtl) {
            const colGap = X.colGap, rowGap = X.rowGap, fences = X.fences, gapsOf = X.gapsOf, splitBy = X.splitBy, extent = X.extent, body = X.body;
            const rowStructured = X.rowStructured, bandedRow = X.bandedRow, sideBySide = X.sideBySide, baselineRun = X.baselineRun, K = X.K, pg = X.pg, self = this;
            const rec = function (list, rx0, rx1, depth) {
                if (list.length <= 1 || depth > 40) return [{ items: list, x0: rx0, x1: rx1 }];
                const vg = gapsOf(list, 'x', colGap);
                // (cells set close together leave no gutter: segments cut at undrawn gaps tell instead)
                const cellish = list.filter(function (it) { return it.line && it.line.cell; }).length >= Math.max(K.cellN, K.cellShare * list.length);
                // a gutter fenced by shaded rows — a row band whose side stands in it, within this region's height —
                // is a column gutter, however the rows beside it share their baselines: a table's rows never cross
                // their own band's side (two columns of zebra tables read as one table across the page)
                if (vg.length && fences.length) {
                    const ly0 = Math.min.apply(null, list.map(function (it) { return it.bb.y0; })), ly1 = Math.max.apply(null, list.map(function (it) { return it.bb.y1; }));
                    const fenced = vg.filter(function (g) {
                        // (a rule must run along most of the region's height; a band need only meet it)
                        const near = fences.filter(function (f) { return (f.rule ? Math.min(f.y1, ly1) - Math.max(f.y0, ly0) > K.fenceRule * (ly1 - ly0) : f.y1 > ly0 && f.y0 < ly1) && !(f.x0 < g[0] && f.x1 > g[1]); });
                        // (a band reaches past its text — the cells' padding — so its side stands in the gutter; one side
                        // fenced is enough: what stands beyond a row's side is not that table's, text or another table)
                        return near.some(function (f) { return (f.x1 <= g[1] && f.x1 >= g[0] - K.fenceSide) || (f.x0 >= g[0] && f.x0 <= g[1] + K.fenceSide); });
                    });
                    if (fenced.length) {
                        self._fire('order.xyFencedColumns', pg);
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
                        if (!f.rule || f.x1 - f.x0 > K.wallW || Math.min(f.y1, ly1) - Math.max(f.y0, ly0) < K.wallShare * (ly1 - ly0)) return false;
                        const x = (f.x0 + f.x1) / 2;
                        const left = list.filter(function (it) { return it.bb.x1 <= x + K.wallTol; }).length, right = list.filter(function (it) { return it.bb.x0 >= x - K.wallTol; }).length;
                        // (a line's letters, not a picture inline in it: a progress bar's crop reached back over the border)
                        const txt = function (it) { const gs = it.line.glyphs.filter(function (g) { return !g.atom && !g.space; }); return gs.length ? [Math.min.apply(null, gs.map(function (g) { return g.x; })), Math.max.apply(null, gs.map(function (g) { return g.x + g.w; }))] : [it.bb.x0, it.bb.x1]; };
                        return left >= K.wallN && right >= K.wallN && !list.some(function (it) { if (it.line) { const e = txt(it); return e[0] < x - K.wallTol && e[1] > x + K.wallTol; } return it.bb.x0 < x - K.wallFig && it.bb.x1 > x + K.wallFig; });
                    })[0];
                    if (wall) {
                        self._fire('order.xyWall', pg);
                        const x = (wall.x0 + wall.x1) / 2;
                        let cols = [list.filter(function (it) { return (it.bb.x0 + it.bb.x1) / 2 < x; }), list.filter(function (it) { return (it.bb.x0 + it.bb.x1) / 2 >= x; })];
                        if (rtl) cols = cols.reverse();
                        return cols.filter(function (c) { return c.length; }).reduce(function (acc, col) { const e = extent(col); return acc.concat(rec(col, e.x0, e.x1, depth + 1)); }, []);
                    }
                }
                if ((vg.length || cellish) && rowStructured(list, 0, vg)) { self._fire('order.xyRowsTable', pg); return [{ items: list, x0: rx0, x1: rx1, rows: true }]; }
                if (vg.length && fences.length && bandedRow(list, vg) && rowStructured(list, K.bandWords)) { self._fire('order.xyBandedRowsTable', pg); return [{ items: list, x0: rx0, x1: rx1, rows: true }]; }
                if (vg.length && sideBySide(splitBy(list, 'x', vg))) {
                    self._fire('order.xyColumns', pg);
                    let cols = splitBy(list, 'x', vg);
                    if (rtl) cols = cols.reverse();
                    return cols.reduce(function (acc, col) { const e = extent(col); return acc.concat(rec(col, e.x0, e.x1, depth + 1)); }, []);
                }
                // (not between two lines of one card a line's pitch apart: inside a paragraph of a card, a cut freeing
                // the columns of a table below took the paragraph's last line away from it)
                const hg = gapsOf(list, 'y', rowGap).filter(function (gp) {
                    if (gp[1] - gp[0] >= body) return true;
                    const below = list.filter(function (it) { return it.line && Math.abs(it.bb.y1 - gp[0]) < K.cardTol; })[0];
                    const above = list.filter(function (it) { return it.line && Math.abs(it.bb.y0 - gp[1]) < K.cardTol; })[0];
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
                        if (part.length >= K.colsN) return gapsOf(part, 'x', colGap).length > 0;
                        if (part.length < K.colsWideN) return false;
                        const wg = gapsOf(part, 'x', Math.max(K.colsWideEm * body, colGap));
                        if (!wg.length) return false;
                        const parts = splitBy(part, 'x', wg);
                        // (one of them a column of text: two lines a line pitch apart)
                        const textCol = parts.some(function (c) {
                            const ls = c.filter(function (it) { return it.line; }).map(function (it) { return it.line; }).sort(function (a, b) { return b.y - a.y; });
                            return ls.some(function (L, k) { return k && ls[k - 1].y - L.y < K.colsPitch * L.size; });
                        });
                        return textCol && sideBySide(parts);
                    };
                    const one = cols(lo) !== cols(hi) ? 1 : 0;
                    [lo, hi].forEach(function (part) {
                        if (!cols(part)) return;
                        // (the largest column region before the widest gap: a cut that frees the whole set of columns keeps
                        // them whole; a wider gap between blocks inside the columns — a row of sections that all end at one
                        // height, a cheat sheet's page 2 — is no break of the page, and cutting there read that row across)
                        const better = !best || one > best.one || (one === best.one && (part.length > best.n + K.cutSlack || (Math.abs(part.length - best.n) <= K.cutSlack && h > best.h + K.cutGap * body)));
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
                        return p.length >= 2 && p.length === a.length && p.length === q.length && p.every(function (x, k) { return Math.abs(x - q[k]) < K.slabAl; });
                    };
                    for (let i = 0; i < slabs.length; i++) if (!wide[i] && ((wide[i - 1] && alignedSl(slabs[i], slabs[i - 1])) || (wide[i + 1] && alignedSl(slabs[i], slabs[i + 1])))) wide[i] = true;
                    let run = null;
                    for (let i = 0; i < slabs.length; i++) {
                        if (!wide[i]) continue;
                        let j = i; while (j + 1 < slabs.length && wide[j + 1]) j++;
                        const n = slabs.slice(i, j + 1).reduce(function (a, sl) { return a + sl.length; }, 0);
                        if (j > i && n >= K.slabN && (!run || n > run.n)) run = { i: i, j: j, n: n };
                        i = j;
                    }
                    if (!run || (run.i === 0 && run.j === slabs.length - 1)) {
                        const cut = baselineRun(list);
                        if (cut) self._fire('order.xyBaselineRun', pg);
                        if (cut) return cut.filter(function (q) { return q.length; }).reduce(function (acc, part) { return acc.concat(rec(part, rx0, rx1, depth + 1)); }, []);
                        return [{ items: list, x0: rx0, x1: rx1 }];   // one column: the leaf keeps it whole
                    }
                    const flat = function (a) { return a.reduce(function (acc, sl) { return acc.concat(sl); }, []); };
                    self._fire('order.xySlabRun', pg);
                    return [flat(slabs.slice(0, run.i)), flat(slabs.slice(run.i, run.j + 1)), flat(slabs.slice(run.j + 1))]
                        .filter(function (q) { return q.length; })
                        .reduce(function (acc, part) { return acc.concat(rec(part, rx0, rx1, depth + 1)); }, []);
                }
                if (best.one) self._fire('order.xyCutFreesColumns', pg);
                const parts = splitBy(list, 'y', [best.gap]).reverse();      // top first
                return parts.reduce(function (acc, part) { return acc.concat(rec(part, rx0, rx1, depth + 1)); }, []);
            };
            return rec(items, x0, x1, 0);
        },

        // _rowsLeaf: its thresholds, read once a leaf
        _ordLeafK(pg) {
            return {
                colEm: this._t('ordLeafColGapEm', pg), colPt: this._t('ordLeafColGapPt', pg), cellEm: this._t('ordLeafCellGapEm', pg), cellPt: this._t('ordLeafCellGapPt', pg),
                mid: this._t('ordLineMidEm', pg), row: this._t('ordLeafRowEm', pg), justGap: this._t('ordJustGapEm', pg), justN: this._t('ordJustMinGaps', pg),
                justEdge: this._t('ordJustEdgeEm', pg), justEven: this._t('ordJustEvenEm', pg), justNb: this._t('ordJustNeighbourEm', pg), inner: this._t('ordLeafInnerGapEm', pg),
                meet: this._t('ordLeafMeetShare', pg), far: this._t('ordLeafFarEm', pg), headFar: this._t('ordLeafHeaderFarEm', pg), wrap: this._t('ordLeafWrapEm', pg),
                goesOn: this._t('ordLeafGoesOnEm', pg), minCells: this._t('ordLeafMinCells', pg)
            };
        },

        /**
         * A region of short lines in rows: runs of consecutive rows whose cells keep a common
         * vertical gutter become borderless tables; the other rows stay text.
         */
        _rowsLeaf(leaf, body, rtl) {
            // the lines here are already segments (split at real gaps), so a narrower gutter counts
            // (cells set close together — a bare HTML table — are split at their undrawn gaps already)
            const self = this, pg = this._page, K = this._ordLeafK(pg), colGap = Math.max(K.colEm * body, K.colPt), cellGap = Math.max(K.cellEm * body, K.cellPt);
            const lines = leaf.items.map(function (it) { return it.line; }).sort(function (a, b) { return b.y - a.y; });
            const spans = this._rowSpans(leaf, body);
            // (only between bands: the rows at a table's ends have no bound of their own — above the first band stand
            // the header and the first body row, below the last the region may run on past the table; tried and
            // measured, both guesses cost more than they gave)
            const spanOf = function (L) { const cy = L.y + K.mid * L.size; for (let k = 0; k < spans.length; k++) if (cy > spans[k][0] && cy < spans[k][1]) return k; return -1; };
            const rows = [];
            lines.forEach(function (L) {
                const k = spans.length ? spanOf(L) : -1;
                const row = k >= 0 ? rows.filter(function (r) { return r.span === k; })[0] : rows.filter(function (r) { return r.span === undefined && Math.abs(r.y - L.y) < K.row * L.size; })[0];
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
                const kGap = K.justGap * r.size;
                for (let k = 1; k < ink.length; k++) { const d = ink[k].x - (ink[k - 1].x + ink[k - 1].w); if (d > kGap) ws.push(d); }
                r.jx0 = ink[0].x; r.jx1 = ink[ink.length - 1].x + ink[ink.length - 1].w;
                r.even = ws.length >= K.justN && r.jx0 - leaf.x0 < K.justEdge * r.size && leaf.x1 - r.jx1 < K.justEdge * r.size && Math.max.apply(null, ws) - Math.min.apply(null, ws) < K.justEven * r.size;
                return r.even;
            };
            const justRows = new Set(rows.filter(function (r, i) {
                if (!evenRow(r)) return false;
                return ![rows[i - 1], rows[i + 1]].some(function (o) { return o && Math.abs(o.y - r.y) < K.justNb * r.size && o.lines.length >= 2 && !evenRow(o); });
            }));
            if (justRows.size) this._fire('order.leafJustifiedRow', pg);
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
                    const kIn = K.inner * L.size;
                    L.glyphs.forEach(function (g) {
                        if (g.space) return;
                        if (last && g.x - (last.x + last.w) >= kIn) out.push([last.x + last.w, g.x]);
                        last = g;
                    });
                    x = Math.max(x, L.x1);
                });
                out.push([x, leaf.x1 + 1]);
                return out;
            };
            const meet = function (A, B) {
                const out = [];
                A.forEach(function (a) { B.forEach(function (b) { const lo = Math.max(a[0], b[0]), hi = Math.min(a[1], b[1]); if (hi - lo >= cellGap * K.meet) out.push([lo, hi]); }); });
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
                const far = prev && prev.y - r.y > K.far * r.size && !(cur && cur.rows.length === 1 && cur.rows[0] === prev && prev.y - r.y < K.headFar * r.size && paired(prev, r));
                // (a row with no gutter inside it — a justified line cut at its stretched word gaps — is text)
                // (its segments one line again: left apart, each read as a menu's item)
                if (r.lines.length >= 2 && !inner(free(r)).length) {
                    self._fire('order.leafRowRejoined', pg);
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
                const above = below && below.lines.length >= 2 && r.y - below.y < K.wrap * r.size &&
                    !below.lines.some(function (o) { return Math.min(o.x1, r.lines[0].x1) - Math.max(o.x0, r.lines[0].x0) > 0; });
                if (cur && r.lines.length === 1 && prev && (prev.y - r.y < K.wrap * r.size || above)) {
                    const L = r.lines[0], gs = inner(cur.gaps);
                    const within = !gs.some(function (g) { return L.x0 < g[0] && L.x1 > g[1]; });
                    const next = rows.slice(i + 1).filter(function (q) { return q.lines.length >= 2; })[0];
                    const goesOn = next && r.y - next.y < K.goesOn * r.size;
                    const cols = gs.length + 1;
                    if (within && cols >= 2 && (goesOn || prev.lines.length >= 2 || prev.partial)) { self._fire('order.leafCellWrap', pg); r.partial = true; cur.rows.push(r); return; }
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
                if (t.rows.length < 2 && t.rows[0].lines.length < K.minCells) { t.rows.forEach(function (r) { run.push.apply(run, r.lines); }); return; }
                self._fire('order.borderlessTable', pg);
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
            const pg = this._page, kW = this._t('ordSpanWidthShare', pg), kMin = this._t('ordSpanMinEm', pg), kMax = this._t('ordSpanMaxEm', pg);
            const fences = (this._fences || []).filter(function (f) { return f.x0 < leaf.x1 && f.x1 > leaf.x0 && f.x1 - f.x0 > kW * (leaf.x1 - leaf.x0); })
                .sort(function (a, b) { return b.y1 - a.y1; });
            const spans = [];
            fences.forEach(function (f, i) {
                spans.push([f.y0, f.y1]);
                const n = fences[i + 1];
                if (n && f.y0 - n.y1 > kMin * body && f.y0 - n.y1 < kMax * body) spans.push([n.y1, f.y0]);
            });
            if (spans.length) this._fire('order.rowSpansBands', pg);
            // (no bands: the rules between rows, consecutive rules a row's height apart)
            if (!spans.length) {
                const kJY = this._t('ordSpanJoinYPt', pg), kJG = this._t('ordSpanJoinGapPt', pg), kDup = this._t('ordSpanRuleDupPt', pg), kLike = this._t('ordSpanLikeShare', pg), kAdj = this._t('ordSpanAdjTolPt', pg);
                // (drawn cell by cell: the pieces on one height that touch are one rule first)
                const joined = [];
                (this._rowRules || []).slice().sort(function (a, b) { return a.y - b.y || a.x0 - b.x0; }).forEach(function (h) {
                    const j = joined.filter(function (o) { return Math.abs(o.y - h.y) < kJY && h.x0 <= o.x1 + kJG && h.x1 >= o.x0 - kJG; })[0];
                    if (j) { j.x0 = Math.min(j.x0, h.x0); j.x1 = Math.max(j.x1, h.x1); } else joined.push({ x0: h.x0, x1: h.x1, y: h.y });
                });
                const rules = joined.filter(function (h) { return h.x0 < leaf.x1 && h.x1 > leaf.x0 && Math.min(h.x1, leaf.x1) - Math.max(h.x0, leaf.x0) > kW * (leaf.x1 - leaf.x0); })
                    .sort(function (a, b) { return b.y - a.y; })
                    .filter(function (h, i, a) { return !i || a[i - 1].y - h.y > kDup; });
                const cand = [];
                for (let i = 0; i + 1 < rules.length; i++) {
                    const gap = rules[i].y - rules[i + 1].y;
                    if (gap > kMin * body && gap < kMax * body) cand.push([rules[i + 1].y, rules[i].y]);
                }
                // (a table's rows have one height: a span between a table's last rule and the next table's header rule —
                // a heading and a header row — has none like it beside it)
                const h = function (k) { return cand[k] ? cand[k][1] - cand[k][0] : null; };
                const like = function (a, b) { return a !== null && b !== null && Math.abs(a - b) <= kLike * Math.max(a, b); };
                cand.forEach(function (sp, k) {
                    const nb = [k - 1, k + 1].filter(function (j) { return cand[j] && (Math.abs(cand[j][1] - sp[0]) < kAdj || Math.abs(cand[j][0] - sp[1]) < kAdj); });
                    if (nb.some(function (j) { return like(h(k), h(j)); })) spans.push(sp);
                });
                if (spans.length) this._fire('order.rowSpansRules', pg);
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
            const kTop = this._t('ordRuleColTopEm', p), kBot = this._t('ordRuleColBottomEm', p), kY = this._t('ordRuleColYPt', p), kMeet = this._t('ordRuleColMeetPt', p);
            const kMerge = this._t('ordRuleColMergePt', p), kShare = this._t('ordRuleColShare', p), kHalf = this._t('ordRuleColHalfPt', p);
            const top = rows[0].y + kTop * size, bottom = rows[rows.length - 1].y - kBot * size;
            const segs = p.hsegs.filter(function (s) { return s.y < top && s.y > bottom && s.x1 > leaf.x0 && s.x0 < leaf.x1; });
            const meets = [];
            segs.forEach(function (a) {
                segs.forEach(function (b) {
                    if (a !== b && Math.abs(a.y - b.y) < kY && Math.abs(a.x1 - b.x0) < kMeet) meets.push({ x: (a.x1 + b.x0) / 2, y: a.y });
                });
            });
            if (!meets.length) return gaps;
            meets.sort(function (a, b) { return a.x - b.x; });
            const bps = [];
            meets.forEach(function (m) {
                const last = bps[bps.length - 1];
                if (last && m.x - last.x < kMerge) { last.ys[Math.round(m.y)] = 1; last.n++; } else { const ys = {}; ys[Math.round(m.y)] = 1; bps.push({ x: m.x, ys: ys, n: 1 }); }
            });
            // a break shared by the rule rows (all of them, or most when there are several)
            const ruleRows = {}; segs.forEach(function (s) { ruleRows[Math.round(s.y)] = 1; });
            const nRows = Object.keys(ruleRows).length;
            const good = bps.filter(function (b) { return Object.keys(b.ys).length >= Math.max(1, Math.ceil(nRows * kShare)); });
            if (good.length < gaps.length || !good.length) return gaps;
            this._fire('order.ruleColumns', p);
            const out = good.map(function (b) { return [b.x - kHalf, b.x + kHalf]; });
            out.exact = true;                 // cells go to the column they stand in, not to the nearest text
            return out;
        },

        /** A borderless table: rows (lines on one baseline) cut at the common gutters. */
        _gridTable(rows, gaps, pageRtl) {
            const self = this, nc = gaps.length + 1, pg = this._page;
            const kSplit = this._t('ordGridSplitEm', pg), kSTol = this._t('ordGridSplitTolPt', pg), kAnchor = this._t('ordGridAnchorShare', pg), kPMin = this._t('ordGridPitchMinEm', pg);
            const kGroup = this._t('ordGridGroupPitchEm', pg), kPR = this._t('ordGridPitchRatio', pg), kPS = this._t('ordGridPitchSlackPt', pg);
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
                                if (e <= g[1] + kSTol && b.x >= g[0] - kSTol && b.x - e > best) { best = b.x - e; cut = k; }
                            }
                            if (cut < 0 || best < kSplit * P.size) return acc.concat([P]);
                            self._fire('order.gridCellSplit', pg);
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
                const need = Math.max(2, Math.ceil(kAnchor * nc));
                const anchor = filled.map(function (n) { return n >= need; });
                if (anchor.filter(Boolean).length >= 2) {
                    // groups of baselines one line pitch apart (rows are set apart by their cells' padding)
                    const gaps = rows.slice(1).map(function (r, i) { return rows[i].y - r.y; });
                    const pitch = gaps.length ? Math.min.apply(null, gaps.filter(function (g) { return g > kPMin * rows[0].size; }).concat([Infinity])) : Infinity;
                    const into = grid.map(function (_, i) { return i; });
                    let g0 = 0;
                    const close = function (a, b) {                       // baselines a..b (inclusive) are one group
                        const idx = []; for (let k = a; k <= b; k++) idx.push(k);
                        const anchors = idx.filter(function (k) { return anchor[k]; });
                        // (no baseline of the group fills the row, but together they do, closer than a line's pitch — a row
                        // whose cells wrap in two lines while its one-line cells sit in the middle, half a line from each:
                        // «P- / Customer / M.», «At risk 850 790», «102 / portal / Okafor» — one row, its first baseline's)
                        if (!anchors.length && idx.length >= 2 && idx.slice(1).every(function (k) { return rows[k - 1].y - rows[k].y < kGroup * rows[k].size; })) {
                            const union = grid[a].map(function (_, c) { return idx.some(function (k) { return grid[k][c].length; }); }).filter(Boolean).length;
                            if (union >= need) { self._fire('order.gridUnionRow', pg); idx.forEach(function (k) { into[k] = a; }); }
                            return;
                        }
                        if (!anchors.length) return;
                        idx.forEach(function (k) {
                            if (anchor[k]) return;
                            self._fire('order.gridWrapMerged', pg);
                            // the anchor above (top-aligned cells), or the first one when the line comes before it
                            const above = anchors.filter(function (j) { return j < k; }).pop();
                            into[k] = above !== undefined ? above : anchors[0];
                        });
                    };
                    for (let i = 1; i <= rows.length; i++) {
                        if (i === rows.length || gaps[i - 1] > pitch * kPR + kPS) { close(g0, i - 1); g0 = i; }
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
