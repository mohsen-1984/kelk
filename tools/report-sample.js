/**
 * A sample PDF import report (the import report contract) with every page mode, every `why`, every quality flag
* and every note code, and the pages read with OCR with every OCR note — for tools/check-a11y.js (axe on the open panel), and the
 * unit tests (tests/unit/report.test.js). Kept in step with scripts/report.js (Kelk.importReport: NOTES, FLAGS,
 * WHY, MODES, MODE_KEYS, OCR_NOTES): the unit tests check that it holds every code there is, a page that failed among them.
 */
'use strict';

module.exports = {
    mode: 'auto',
    summary: { pages: 18, full: 5, simplified: 3, textContent: 1, ocr: 5, scan: 3, failed: 1, conf: 0.78 },
    pages: [
        { page: 3, mode: 'simplified', conf: 0.41, why: ['lowConf', 'suspectSpaces'] },
        { page: 4, mode: 'simplified', conf: 0.55, why: ['suspectSpaces', 'lostGlyphs'] },
        { page: 7, mode: 'textContent', conf: 0.3, why: ['layoutFailed'] },
        { page: 9, mode: 'ocr', conf: 0.12, why: ['noText', 'extractFailed'] },
        // pages read with OCR (3.4): in the report's own list below, not in the pages not read in full
        { page: 10, mode: 'ocr', conf: 0.91, why: ['noText'] },
        { page: 11, mode: 'simplified', conf: 0.62, why: ['safeMode'] },
        // a page that could not be read: the ladder's last resort (shown as "not read", not as simplified)
        { page: 12, mode: 'simplified', conf: 0, why: ['extractFailed'], failed: true },
        { page: 13, mode: 'ocr', conf: 0.52, why: ['noText'] },
        { page: 14, mode: 'ocr', conf: 0, why: ['noText'] },
        { page: 15, mode: 'ocr', conf: 0, why: ['noText'] },
        // scanned pages OCR has not read (3.6): no confidence, one row «16–18» in the panel
        { page: 16, mode: 'scan', conf: null, why: ['noText'] },
        { page: 17, mode: 'scan', conf: null, why: ['noText'] },
        { page: 18, mode: 'scan', conf: null, why: ['noText'] }
    ],
    flags: [
        { code: 'lostGlyphs', pages: [4] },
        { code: 'suspectSpaces', pages: [3, 4, 5] },
        { code: 'textInPictures', pages: [8] }
    ],
    ocr: [
        { page: 10, conf: 0.91, lines: 28, notes: ['columns'] },
        { page: 13, conf: 0.52, lines: 6, notes: ['lowConf', 'turned'] },
        { page: 14, conf: 0, lines: 0, notes: ['noLines'] },
        { page: 15, conf: null, lines: 0, notes: ['failed'] }
    ],
    notes: [
        { code: 'noText' },
        { code: 'pageLimit' },
        { code: 'figureFailed' },
        { code: 'pageFailed', pages: [12] },
        { code: 'ocrNeeded', pages: [9] },
        { code: 'ocrFailed' },
        { code: 'ocrPageFailed', pages: [15] },
        { code: 'printNoLinks' },
        { code: 'ocrLayer' },
        { code: 'watermarkDropped' },
        { code: 'kelkSource' },
        { code: 'kelkMath' },
        { code: 'monoBody' },
        { code: 'fontprintRead' },
        { code: 'fontApprox', pages: [8] },
        { code: 'fontOcr', pages: [5] },
        { code: 'toUnicodeDoubt', pages: [8] },
        { code: 'garbledText', pages: [5] },
        { code: 'hiddenText', pages: [2, 6] },
        { code: 'lostText', pages: [4] },
        { code: 'pageSimplified', pages: [3, 4, 11] },
        { code: 'pageTextOnly', pages: [7] },
        { code: 'tooLargeToKeep' }
    ]
};
