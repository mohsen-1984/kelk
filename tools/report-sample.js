/**
 * A sample PDF import report (the P3.4 contract, plan P3.5) with every page mode, every `why`, every quality flag
 * and every note code — for tools/check-a11y.js (axe on the open panel), docs/reports/P3.5/screenshots.js and the
 * unit tests (tests/unit/report.test.js). Kept in step with scripts/report.js (Kelk.importReport: NOTES, FLAGS,
 * WHY, MODES): the unit tests check that it holds every code there is.
 */
'use strict';

module.exports = {
    mode: 'auto',
    summary: { pages: 12, full: 6, simplified: 3, textContent: 1, ocr: 1, failed: 1, conf: 0.78 },
    pages: [
        { page: 3, mode: 'simplified', conf: 0.41, why: ['lowConf', 'suspectSpaces'] },
        { page: 4, mode: 'simplified', conf: 0.55, why: ['suspectSpaces', 'lostGlyphs'] },
        { page: 7, mode: 'textContent', conf: 0.3, why: ['layoutFailed'] },
        { page: 9, mode: 'ocr', conf: 0.12, why: ['noText', 'extractFailed'] },
        { page: 11, mode: 'simplified', conf: 0.62, why: ['safeMode'] }
    ],
    flags: [
        { code: 'lostGlyphs', pages: [4] },
        { code: 'suspectSpaces', pages: [3, 4, 5] },
        { code: 'textInPictures', pages: [8] }
    ],
    notes: [
        { code: 'noText' },
        { code: 'pageLimit' },
        { code: 'figureFailed' },
        { code: 'pageFailed', pages: [12] },
        { code: 'ocrNeeded', pages: [9] },
        { code: 'printNoLinks' },
        { code: 'ocrLayer' },
        { code: 'kelkSource' },
        { code: 'pageSimplified', pages: [3, 4, 11] },
        { code: 'pageTextOnly', pages: [7] }
    ]
};
