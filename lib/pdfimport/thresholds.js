/**
 * PdfImporter — threshold registry and rule telemetry (lib/pdfimport/thresholds.js)
 * ============================================================================
 * Every layout literal by name: T[name] = { def, unit, used, calib?, n?, minSamples?, on?, fixed? }.
 * this._t(name, ctx) → def; when on: calib(cal, page) if n(cal) ≥ minSamples and finite, else def.
 * fixed: physical, never calibrated. ctx: a page (pl / p, .cal), a line or glyph (.page) or nothing (this._cal).
 * Unknown name throws. Extraction (extract.js) reads its entries before _calibrate has run (this._cal is null
 * then), so an ext… entry switched on still resolves to its default.
 * this._fire(rule, page) counts into r.rules; this._rulesFinish(r) writes r.rules and, with options.debug,
 * r.calibration. Registry: PdfImporter._thresholds; each part adds the literals of its own code with
 * PdfImporter._defineThresholds({ name: entry, … }) (a name defined twice throws). Load after lib/PdfImporter.js,
 * before extract.js.
 */
(function (global) {
    'use strict';
    const PdfImporter = global.PdfImporter || (typeof require === 'function' ? require('../PdfImporter.js') : null);
    // the midpoint of the letter and word gaps of a file that draws no spaces, when its gaps part in two (bimodal); NaN —
    // the default — when either is unknown (a null letterEm is no 0) or the gaps do not part
    const mid = function (c) {
        const g = c.gaps;
        return g.bimodal && typeof g.letterEm === 'number' && typeof g.wordEm === 'number' ? (g.letterEm + g.wordEm) / 2 : NaN;
    }, gn = function (c) { return c.gaps.n; };
    const L = 'lines.js _wordSpaces', LW = 'lines.js _segments lineWordGap', RL = 'regions.js _layout', OP = 'order.js _pageBlocks';
    const T = {
        // (wordGapEm: an undrawn gap in a file that draws its spaces — kerning must not split words; the letter / word
        // midpoint is no measure of it: real files read letterEm 0, wordEm ≈ 0.26 → 0.13 em, kerning gaps as spaces)
        wordGapEm: { def: 0.45, unit: 'em', used: [L + ' (draws spaces)'] },
        // (wordGapBareEm stays at its default: switched on, measured dev 86.8 → 86.6 — two letter-spaced Persian
        // reports, their bimodal midpoint over the gaps that part their words)
        wordGapBareEm: { def: 0.14, unit: 'em', calib: mid, n: gn, minSamples: 20, used: [L + ' (no space glyphs)'] },
        scriptChangeGapEm: { def: 0.2, unit: 'em', used: [L] },
        lineWordGapTol: { def: 0.04, unit: 'em', used: [LW] },
        lineWordGapMin: { def: 0.1, unit: 'em', used: [LW] },
        lineWordGapJump: { def: 0.07, unit: 'em', used: [LW] },
        lineWordGapMax: { def: 1.2, unit: 'em', used: [LW] },
        bodySizePt: { def: 10, unit: 'pt', calib: function (c) { return c.body.size; }, n: function (c) { return c.body.n; }, minSamples: 30, used: [RL + ' body'] },
        bodyLongLineGlyphs: { def: 30, unit: 'glyphs', used: [RL + ' body'] },
        bodyLongSamples: { def: 300, unit: 'glyphs', used: [RL + ' body'] },
        spacedDocMinGaps: { def: 20, unit: 'gaps', used: [RL + ' _spacedDoc'] },
        spacedDocShare: { def: 0.75, unit: 'share', used: [RL + ' _spacedDoc'] },
        boldFaceMin: { def: 40, unit: 'glyphs', used: [RL + ' _boldFace'] },
        boldFaceShare: { def: 0.6, unit: 'share', used: [RL + ' _boldFace'] },
        checkboxMinPt: { def: 6.5, unit: 'pt', fixed: true, used: [OP + ' task boxes (filled)'] },
        checkboxStrokeMinPt: { def: 5, unit: 'pt', fixed: true, used: [OP + ' task boxes (stroked)'] }
    };
    // entries are frozen as they are defined; the registry itself grows while the parts load
    function define(entries) {
        Object.keys(entries).forEach(function (k) {
            if (Object.prototype.hasOwnProperty.call(T, k) && T[k] !== entries[k]) throw new Error('PdfImporter: threshold "' + k + '" defined twice');
            const e = entries[k];
            if (typeof e.def !== 'number' || !e.unit || !Array.isArray(e.used)) throw new Error('PdfImporter: threshold "' + k + '" needs def, unit and used');
            Object.freeze(e.used); T[k] = Object.freeze(e);
        });
    }
    define(T);

    // [value, source]: 'def' | 'cal' | 'fixed'
    function resolve(name, cal, page) {
        const e = T[name];
        if (!e) throw new Error('PdfImporter: unknown threshold "' + name + '"');
        if (e.fixed) return [e.def, 'fixed'];
        if (!e.on || !cal || !e.calib) return [e.def, 'def'];
        let v, n;
        try { v = e.calib(cal, page); n = e.n ? e.n(cal, page) : Infinity; } catch (x) { return [e.def, 'def']; }
        return typeof v === 'number' && isFinite(v) && n >= (e.minSamples || 0) ? [v, 'cal'] : [e.def, 'def'];
    }
    // a line's .num is its list number, not its page: .p.num (pl), then .page (a line, a glyph), then .num (a page)
    // (a page record's and the walk state's .page is pdf.js's page object, no number: their page is .num)
    const pageOf = function (x) { return typeof x === 'number' ? x : x ? (x.p ? x.p.num : typeof x.page === 'number' ? x.page : x.num !== undefined ? x.num : null) : null; };

    Object.assign(PdfImporter.prototype, {
        _t(name, ctx) { return resolve(name, (ctx && ctx.cal) || this._cal || null, pageOf(ctx))[0]; },
        _fire(rule, page) {
            const m = this._ruleLog || (this._ruleLog = {}), r = m[rule] || (m[rule] = { count: 0, pages: new Set() });
            r.count++;
            const p = pageOf(page);
            if (p !== null && p !== undefined) r.pages.add(p);
        },
        _rulesStart() { this._ruleLog = {}; },
        _rulesFinish(r) {
            const m = this._ruleLog || {}, out = {};
            Object.keys(m).sort().forEach(function (k) { out[k] = { count: m[k].count, pages: Array.from(m[k].pages).sort(function (a, b) { return a - b; }) }; });
            r.rules = out;
            if (this.options && this.options.debug) {
                const cal = this._cal || null, th = {};
                Object.keys(T).forEach(function (k) { const v = resolve(k, cal, null); th[k] = { value: v[0], def: T[k].def, unit: T[k].unit, from: v[1] }; });
                r.calibration = Object.assign({}, cal, { thresholds: th });
            }
            return r;
        }
    });
    PdfImporter._thresholds = T;
    PdfImporter._defineThresholds = define;
})(typeof window !== 'undefined' ? window : globalThis);
