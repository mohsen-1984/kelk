/**
 * BuilderBase - the configuration surface shared by every Kelk builder
 * ============================================================================
 * Version: 2.0
 *
 * WordHtmlBuilder (.doc), DocxBuilder (.docx), PdfBuilder (.pdf) and
 * HtmlBuilder (.html) extend this class, so the same call means the same
 * thing in every output — validation included — and a new option is added
 * in ONE place. The builders only render.
 *
 *   configure(options)                 everything below in one object
 *   setDirection('auto'|'rtl'|'ltr')   document direction
 *   setPage({ size, orientation, margin, headerMargin, footerMargin })
 *   setFonts({ latin, bidi, code, latinFallback, codeFallback, bidiLanguage })
 *   setFontSizes({ latin, bidi, code })          numbers are points
 *   setHeader('text' | { logo, logoHeight, title, edition } | { html, title, dateLocale })
 *   setFooter(true | { author, link, pagingLabels } | { html, title, dateLocale })
 *   setHeaderFooterDirection('rtl'|'ltr'|'auto')
 *   setHeaderFooterCallback(fn)        full control (each builder documents fn)
 *   setCodeBlockOptions({ showLanguage, fallbackLabel, nestedFrames, rtlFont })
 *   setMath({ mode: 'svg'|'mathml', word: 'native'|'image', textFont, source })   LaTeX formulas (MathCore placeholders)
 *   setToc({ levels, title })          table of contents after the opening H1 (title: text or { rtl, ltr })
 *   setTableWidth('auto' | '98%')      content tables (default auto; columns always follow the content)
 *   setTableAlign('center'|'text'|'right'|'left')  content tables' side (in a list item / quote: its start)
 *   setTableStyle({ lines, fill, total, headerCenter, headerBold, headerColor, stripeColor, borderColor, borderWidth })
 *                                      content tables' lines, fills and bold (TABLE_LINES × TABLE_FILLS)
 *   registerImage(name, source)        setImageOptions({ baseUrl, svgScale, timeout })
 *   setTemplateOptions({ …createMsoTemplate.DEFAULTS keys })   getTemplateOptions()
 *   setTemplateFactory(fn)             setStyles({ …builder config })
 *   addFromHtml(html | element)        the body (replaces earlier content)
 *
 * configure() example (what Kelk's page does):
 *   PdfBuilder.create().configure({
 *       direction: 'auto',
 *       page: { size: 'A4', margin: '20mm 15mm' },
 *       fonts: { bidi: 'Sahel', latin: 'Vazirmatn', code: 'DejaVu Sans Mono' },
 *       fontSizes: { bidi: 12, latin: 11.5, code: 10 },
 *       codeBlock: { showLanguage: true },
 *       headerFooterDirection: 'rtl',
 *       header: { logo: 'logo', title: 'گزارش', edition: 'پیش‌نویس' },
 *       footer: { author: 'Kelk', link: 'https://example.com' },
 *       images: { logo: dataUri }
 *   }).addFromHtml(html).toBlob();
 */

(function (global) {
    'use strict';

    const BidiCore = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
        ? require('./BidiCore.js') : global.BidiCore;
    const ImageCore = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
        ? (function () { try { return require('./ImageCore.js'); } catch (e) { return undefined; } })()
        : global.ImageCore;
    const MathCore = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
        ? (function () { try { return require('./MathCore.js'); } catch (e) { return undefined; } })()
        : global.MathCore;

    /** Page size presets (portrait: width height). */
    const PAGE_SIZES = Object.freeze({
        A3: '29.7cm 42.0cm',
        A4: '21.0cm 29.7cm',
        A5: '14.8cm 21.0cm',
        LETTER: '21.59cm 27.94cm',
        LEGAL: '21.59cm 35.56cm'
    });

    /** Default paging labels by header/footer direction. */
    const DEFAULT_PAGING_LABELS = Object.freeze({
        rtl: Object.freeze({ page: 'صفحه', from: 'از' }),
        ltr: Object.freeze({ page: 'Page', from: 'of' })
    });

    /**
     * Defaults every builder shares (under each builder's own DEFAULTS), so
     * header and footer look the same in .doc, .docx, .pdf and .html.
     */
    const SHARED_DEFAULTS = {
        headerFooterDirection: 'auto',          // 'rtl' | 'ltr' | 'auto' (the document's)
        borders: {                              // CSS-like: style color width
            headerBottom: 'solid black 0.5pt',
            headerCellDivider: 'solid black 0.5pt',
            footerTop: 'solid black 0.5pt'
        },
        headerColumns: { logo: '10%', title: '75%', edition: '15%' },
        footerColumns: { author: '80%', paging: '20%' },
        toc: null,                              // setToc({ levels, title })
        tableWidth: 'auto',                     // setTableWidth('auto' | 'NN%'): auto = the content's width, up to 100%
        tableMinWidth: '50%',                   // setTableMinWidth('NN%'): with 'auto', the least width of a table
        tableAlign: 'center',                   // setTableAlign('center' | 'text' | 'right' | 'left'): text = the document's side
        tableStyle: null,                       // setTableStyle(…): null = TABLE_STYLE_DEFAULTS, header in tableHeaderBg
        taskMarks: { open: '\u2610', done: '\u2611' } // task-list checkboxes as characters (☐ ☑) in .doc and .docx
    };

    /**
     * Table styles: two independent choices and one switch.
     *   lines — which lines: TABLE_LINES (none, underline, horizontal, vertical, frame, grid)
     *   fill  — which rows are filled: TABLE_FILLS (none, header, stripes, header-stripes)
     *   total — the last row is a total: bold, with a line above it
     *   headerCenter, headerBold — the header row centered (where its column sets no
     *           alignment of its own) and bold; both on by default
     * Internally they make four kinds of row — header, odd and even body rows,
     * and the last row (what it sets replaces the value of the odd/even row it
     * is) — each with lines (top, bottom, start, end = the table's outer sides,
     * inner = between its cells), a fill and bold. Sides are logical: start is
     * the right side of a right-to-left table. One line color and width.
     */
    const ALL = { top: true, bottom: true, start: true, end: true, inner: true };
    const SIDES = { start: true, end: true, inner: true };
    const TABLE_LINES = {
        none:       { header: {}, body: {}, last: {} },
        underline:  { header: { bottom: true }, body: {}, last: {} },
        horizontal: { header: { top: true, bottom: true }, body: { bottom: true }, last: {} },
        vertical:   { header: SIDES, body: SIDES, last: {} },
        frame:      { header: { top: true, bottom: true, start: true, end: true }, body: { start: true, end: true }, last: { bottom: true } },
        grid:       { header: ALL, body: ALL, last: {} }
    };
    const TABLE_FILLS = {                       // the color each row takes: 'header' | 'stripe'
        none: {},
        header: { header: 'header' },
        stripes: { even: 'stripe' },
        'header-stripes': { header: 'header', even: 'stripe' }
    };
    const TABLE_STYLE_DEFAULTS = { lines: 'grid', fill: 'header-stripes', total: false, headerCenter: true, headerBold: true,
                                   headerColor: null, stripeColor: '#F5F7FA', borderColor: '#A9B5C4', borderWidth: 0.5 };   // headerColor null: tableHeaderBg

    const FONT_KEYS = {
        latin: 'latinFont', bidi: 'bidiFont', code: 'codeFont',
        latinFallback: 'latinFontFallback', codeFallback: 'codeFontFallback',
        bidiLanguage: 'bidiLanguage'
    };
    const SIZE_KEYS = { latin: 'fontSize', bidi: 'bidiFontSize', code: 'codeFontSize' };

    class BuilderBase {

        /**
         * @param {object} config - builder config overrides
         * @param {object} spec
         * @param {object} spec.defaults - the builder's DEFAULTS
         * @param {Function} spec.Error  - the builder's error class
         * @param {string[]} [spec.keep] - config keys kept by reference (libraries, functions)
         */
        constructor(config, spec) {
            config = config || {};
            this._Error = spec.Error || Error;
            const keep = (spec.keep || []).concat(['templateFactory']);
            this._config = BidiCore.deepMerge(BidiCore.deepMerge(SHARED_DEFAULTS, spec.defaults || {}, keep), config, keep);
            this._templateFactory = config.templateFactory || null;
            this._contentHtml = '';
            this._headerFooterCallback = null;
            this._images = (typeof ImageCore !== 'undefined' && ImageCore) ? ImageCore.createStore() : null;
        }

        // ── helpers ──────────────────────────────────────────────────────────

        _fail(message) { throw new this._Error(message); }

        /** Strip characters that could break out of a CSS string/declaration. */
        _cssSafe(value, what) {
            const v = String(value).replace(/["';{}<>\\]/g, '').trim();
            if (!v) this._fail('Invalid ' + what + ': ' + value);
            return v;
        }

        /** Font size: numbers are points (11 → '11pt'); strings pass through. */
        _toPt(value, what) {
            if (typeof value === 'number' && isFinite(value) && value > 0) return value + 'pt';
            return this._cssSafe(value, what);
        }

        _oneOf(value, allowed, what) {
            if (allowed.indexOf(value) === -1) {
                this._fail(what + ' must be ' + allowed.map(function (a) { return "'" + a + "'"; }).join(', ').replace(/, ([^,]*)$/, ' or $1'));
            }
            return value;
        }

        // ── one-call configuration ───────────────────────────────────────────

        /**
         * Everything in one object; keys map to the setters of the same name.
         * Unknown keys throw (a typo should not be silently ignored).
         * @param {object} o
         */
        configure(o) {
            o = o || {};
            const self = this;
            const map = {
                direction: function (v) { self.setDirection(v); },
                page: function (v) { self.setPage(v); },
                fonts: function (v) { self.setFonts(v); },
                fontSizes: function (v) { self.setFontSizes(v); },
                codeBlock: function (v) { self.setCodeBlockOptions(v); },
                taskMarks: function (v) { self._config.taskMarks = Object.assign({}, self._config.taskMarks, v || {}); },
                math: function (v) { self.setMath(v); },
                headerFooterDirection: function (v) { self.setHeaderFooterDirection(v); },
                header: function (v) { if (v != null && v !== false) self.setHeader(v); },
                footer: function (v) { if (v != null && v !== false) self.setFooter(v); },
                images: function (v) { Object.keys(v || {}).forEach(function (k) { if (v[k]) self.registerImage(k, v[k]); }); },
                imageOptions: function (v) { self.setImageOptions(v); },
                template: function (v) { self.setTemplateOptions(v); },
                tableWidth: function (v) { self.setTableWidth(v); },
                tableMinWidth: function (v) { self.setTableMinWidth(v); },
                tableAlign: function (v) { self.setTableAlign(v); },
                tableStyle: function (v) { self.setTableStyle(v); },
                toc: function (v) { if (v) self.setToc(v === true ? {} : v); else self._config.toc = null; },
                styles: function (v) { self.setStyles(v); },
                meta: function (v) { self.setMeta(v); },
                content: function (v) { self.addFromHtml(v); }
            };
            Object.keys(o).forEach(function (k) {
                if (o[k] === undefined) return;
                if (!map[k]) self._fail('configure: unknown option "' + k + '"');
                map[k](o[k]);
            });
            return this;
        }

        // ── document ─────────────────────────────────────────────────────────

        /**
         * The file's own properties (PDF Info, .docx core properties, HTML meta):
         * { title, author, subject, keywords, creator } — creator defaults to
         * "Kelk <version>"; a title left out is the header's title, else the first H1.
         */
        setMeta(o) {
            this._config.meta = Object.assign({}, this._config.meta || {}, o || {});
            return this;
        }

        /** The properties to write: the set ones, the creator by default, the title from the document. */
        _metaFor(firstH1) {
            const m = Object.assign({}, this._config.meta || {});
            if (!m.creator) m.creator = 'Kelk ' + (BuilderBase.version || '');
            if (!m.title) {
                const h = this._config.header;
                m.title = (h && typeof h === 'object' && h.title) || (typeof h === 'string' ? h : '') || firstH1 || '';
            }
            Object.keys(m).forEach(function (k) { m[k] = m[k] == null ? '' : String(m[k]).trim(); });
            return m;
        }

        /** @param {'auto'|'rtl'|'ltr'} direction */
        setDirection(direction) {
            this._config.direction = this._oneOf(direction, ['auto', 'rtl', 'ltr'], 'direction');
            return this;
        }

        /**
         * LaTeX formulas (MathCore placeholders in the content):
         * { mode: 'svg' | 'mathml', word: 'native' | 'image', textFont } —
         * mode: how HtmlBuilder writes them (default svg); word: .docx as
         * Word's own, editable equations (default) or as pictures; .doc and
         * .pdf draw them as images / vectors.
         * textFont: the family of right-to-left \\text in a formula image
         * (default the bidi font; for Word pass a web font, e.g. Vazirmatn —
         * it is embedded in the image). A string is the mode.
         * source: PdfBuilder writes each formula's TeX into the PDF (an
         * /ActualText span and the XMP map kelk:math, which PdfImporter reads
         * back as $…$ / $$…$$) — default true; false writes neither.
         */
        setMath(options) {
            const o = typeof options === 'string' ? { mode: options } : Object.assign({}, options || {});
            if (o.mode != null) o.mode = this._oneOf(o.mode, ['svg', 'mathml'], 'math.mode');
            if (o.word != null) o.word = this._oneOf(o.word, ['native', 'image'], 'math.word');
            this._config.math = Object.assign({ mode: 'svg', word: 'native' }, this._config.math || {}, o);
            return this;
        }

        /** Builder-level overrides (borders, columns, pagingLabels, list, …). */
        setStyles(styles) {
            this._config = BidiCore.deepMerge(this._config, styles);
            return this;
        }

        /**
         * Fonts by role. Word files name them (any installed font); the PDF
         * needs registered families (PdfBuilder.registerFonts); HTML embeds the
         * ones registered with HtmlBuilder.registerWebFonts.
         *   .setFonts({ bidi: 'Vazirmatn', latin: 'Calibri', code: 'Consolas' })
         */
        setFonts(fonts = {}) {
            const t = {};
            for (const k in FONT_KEYS) {
                if (fonts[k] !== undefined) t[FONT_KEYS[k]] = this._cssSafe(fonts[k], 'font ' + k);
            }
            return this.setTemplateOptions(t);
        }

        /** Base font sizes; numbers are points: .setFontSizes({ latin: 11, bidi: 12, code: '9.5pt' }) */
        setFontSizes(sizes = {}) {
            const t = {};
            for (const k in SIZE_KEYS) {
                if (sizes[k] !== undefined) t[SIZE_KEYS[k]] = this._toPt(sizes[k], 'font size ' + k);
            }
            return this.setTemplateOptions(t);
        }

        /**
         * Page setup.
         *   .setPage({ size: 'A4', orientation: 'landscape', margin: '2cm' })
         *   .setPage({ size: '17cm 24cm' })              // custom: width height
         * Presets: A3, A4, A5, Letter, Legal. For presets, 'landscape' swaps
         * width/height; a custom size is used exactly as given.
         */
        setPage(page = {}) {
            const t = {};
            if (page.orientation !== undefined) {
                t.pageOrientation = this._oneOf(page.orientation, ['portrait', 'landscape'], 'orientation');
            }
            const cur = this._config.template || {};
            const orientation = t.pageOrientation || cur.pageOrientation || 'portrait';
            const sizeName = page.size !== undefined ? String(page.size).toUpperCase() : cur.pageSizeName;
            // Preset to (re)apply: an explicit preset, a remembered one, or A4 when
            // no size was ever set. A remembered CUSTOM size yields null → untouched.
            const preset = sizeName ? PAGE_SIZES[sizeName] : (cur.pageSize ? null : PAGE_SIZES.A4);
            if (page.size !== undefined && !preset) {
                t.pageSize = this._cssSafe(page.size, 'page size');     // custom, used as given
                t.pageSizeName = undefined;
            } else if (preset && (page.size !== undefined || t.pageOrientation)) {
                const wh = preset.split(' ');
                t.pageSize = orientation === 'landscape' ? wh[1] + ' ' + wh[0] : preset;
                if (sizeName) t.pageSizeName = sizeName;   // remembered for later orientation changes
            }
            if (page.margin !== undefined) t.pageMargin = this._cssSafe(page.margin, 'page margin');
            if (page.headerMargin !== undefined) t.headerMargin = this._cssSafe(page.headerMargin, 'header margin');
            if (page.footerMargin !== undefined) t.footerMargin = this._cssSafe(page.footerMargin, 'footer margin');
            return this.setTemplateOptions(t);
        }

        /**
         * Low-level: any createMsoTemplate.DEFAULTS key (colors, line spacing,
         * heading styles …): .setTemplateOptions({ tableHeaderBg: '#DDEBF7' })
         */
        setTemplateOptions(options = {}) {
            if ('direction' in options) this._fail('Use setDirection() to control direction');
            this._config.template = Object.assign({}, this._config.template, options);
            return this;
        }

        /** Effective template options: defaults + overrides, headings merged per level. */
        getTemplateOptions() {
            const D = this._resolveTemplateFactory().DEFAULTS || {};
            const o = this._config.template || {};
            const T = Object.assign({}, D);
            for (const k in o) if (o[k] !== undefined) T[k] = o[k];
            const ho = o.headings || [];
            T.headings = (D.headings || []).map(function (h, i) { return Object.assign({}, h, ho[i] || {}); });
            delete T.pageSizeName;
            return T;
        }

        setTemplateFactory(factory) {
            if (typeof factory !== 'function') this._fail('Template factory must be a function');
            this._templateFactory = factory;
            return this;
        }

        _resolveTemplateFactory() {
            if (this._templateFactory) return this._templateFactory;
            if (typeof createMsoTemplate === 'function') return createMsoTemplate;
            if (global && typeof global.createMsoTemplate === 'function') return global.createMsoTemplate;
            if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
                try { const m = require('./msOfficeWordHtmlTemplate.js'); const f = typeof m === 'function' ? m : m && m.createMsoTemplate; if (typeof f === 'function') return f; } catch (e) { /* below */ }
            }
            this._fail('Template defaults not found. Load msOfficeWordHtmlTemplate.js (createMsoTemplate) ' +
                'or call setTemplateFactory(fn).');
        }

        // ── header / footer ──────────────────────────────────────────────────

        /*
         * Custom header/footer (same model in every builder — see
         * BidiCore.parseHeaderFooter for the supported HTML subset):
         *   .setHeader({ html: '<table><tr><td style="width:20%"><img src="logo"></td>' +
         *                      '<td style="border:1pt solid red">{title}</td></tr></table>' })
         *   .setFooter({ html: '<p style="text-align:center">صفحه {page} از {pages} — {date}</p>' })
         * Fields: {page} {pages} {date} {title}. Options: title (else the first
         * <h1>), dateLocale (default: fa-IR, Latin digits, for an RTL header;
         * en-GB otherwise). Text runs through the BiDi engine; images resolve
         * like the content's (registered names, data URIs, URLs).
         */

        /** 'text' → simple; { logo, logoHeight, title, edition } → structured; { html } → custom */
        setHeader(options) {
            if (options && typeof options === 'object' && typeof options.html === 'string') {
                this._config.header = { mode: 'html', html: options.html, title: options.title, dateLocale: options.dateLocale };
                return this;
            }
            if (typeof options === 'string') {
                this._config.header = { mode: 'simple', text: options };
            } else if (options && typeof options === 'object') {
                this._config.header = {
                    mode: 'structured',
                    logo: options.logo || '', logoHeight: options.logoHeight || '1cm',   // logoHeight: when logo is an image
                    title: options.title || '', edition: options.edition || ''
                };
            }
            return this;
        }

        /** true | { pagingLabels } → simple page numbers; { author, link, pagingLabels } → structured; { html } → custom */
        setFooter(options) {
            if (options && typeof options === 'object' && typeof options.html === 'string') {
                this._config.footer = { mode: 'html', html: options.html, title: options.title, dateLocale: options.dateLocale };
                return this;
            }
            if (options === true) {
                this._config.footer = { mode: 'simple', pagingLabels: null };   // resolved at build time
            } else if (options && typeof options === 'object') {
                const labels = options.pagingLabels ? Object.assign({}, options.pagingLabels) : null;
                this._config.footer = options.author
                    ? { mode: 'structured', author: options.author, link: options.link || '', pagingLabels: labels }
                    : { mode: 'simple', pagingLabels: labels };
            }
            return this;
        }

        /**
         * Layout direction of header and footer, independent of the content.
         *   'auto' (default) — follow the document direction
         *   'rtl'            — logo/author on the right, «صفحه X از Y»
         *   'ltr'            — mirrored, "Page X of Y"
         */
        setHeaderFooterDirection(direction) {
            this._config.headerFooterDirection = this._oneOf(direction, ['rtl', 'ltr', 'auto'], 'headerFooterDirection');
            return this;
        }

        /** Full control of header and footer; the callback's form is the builder's own. */
        setHeaderFooterCallback(fn) {
            if (typeof fn !== 'function') this._fail('Callback must be a function');
            this._headerFooterCallback = fn;
            this._config.header = Object.assign({}, this._config.header, { mode: 'callback' });
            this._config.footer = Object.assign({}, this._config.footer, { mode: 'callback' });
            return this;
        }

        // ── tables ───────────────────────────────────────────────────────────

        /**
         * Width of content tables: 'auto' (default) — as wide as the content
         * wants, up to 100% — or a share of the text width ('98%', '75%' …). Column widths follow the content in every case (the same shares
         * in all four outputs).
         */
        setTableWidth(width) {
            const s = String(width).trim().toLowerCase();
            if (s !== 'auto' && !/^\d+(\.\d+)?%$/.test(s)) this._fail("tableWidth must be 'auto' or a percentage like '98%'");
            if (s !== 'auto' && (parseFloat(s) <= 0 || parseFloat(s) > 100)) this._fail('tableWidth must be 1%–100%');
            this._config.tableWidth = s;
            return this;
        }

        /**
         * With tableWidth 'auto': the least width of a table, as a share of the
         * text width ('50%' default, as Kelk's page — a table of a few numbers is
         * not a sliver; '20%' lets it be as narrow as its content). A table whose
         * content wants more is wider.
         */
        setTableMinWidth(width) {
            const s = String(width).trim();
            if (!/^\d+(\.\d+)?%$/.test(s) || parseFloat(s) <= 0 || parseFloat(s) > 100) this._fail("tableMinWidth must be a percentage like '50%'");
            this._config.tableMinWidth = s;
            return this;
        }

        // ── table of contents ────────────────────────────────────────────────

        /**
         * A table of contents after the opening H1 (or first): hr, the ToC, hr,
         * an empty paragraph. Word files hold a real TOC field (Word fills the
         * page numbers: it offers to update the fields on opening / F9), the PDF
         * prints page numbers and links, HTML links to the headings.
         *   .setToc({ levels: 2 })                         // H1–H2 (default)
         *   .setToc({ levels: 3, title: 'فهرست' })         // default title: فهرست مطالب / Contents
         *   .setToc(null)                                  // none
         */
        setToc(options) {
            if (options == null || options === false) { this._config.toc = null; return this; }
            const levels = parseInt(options.levels, 10) || 2;
            if (levels < 1 || levels > 6) this._fail('toc.levels must be 1–6');
            // title: one string, or { rtl, ltr } — the one of the document's direction (decided at build time)
            const t = options.title;
            const title = t && typeof t === 'object' ? { rtl: t.rtl ? String(t.rtl) : '', ltr: t.ltr ? String(t.ltr) : '' } : (t ? String(t) : '');
            this._config.toc = { levels: levels, title: title };
            return this;
        }

        // ── code ─────────────────────────────────────────────────────────────

        /**
         * Code block options.
         * @param {object} options
         * @param {boolean} [options.showLanguage=true] - the language bar
         * @param {string}  [options.fallbackLabel='code'] - label of blocks without a language ('' → no bar)
         * @param {boolean} [options.nestedFrames=true] - frame fenced blocks written inside a code block
         * @param {string}  [options.rtlFont='code'] - RTL text inside code: 'code' → the code font draws it
         *        (one font, one column grid; DejaVu Sans Mono covers Arabic script); 'document' → the bidi font
         */
        setCodeBlockOptions(options = {}) {
            if (options.rtlFont !== undefined) this._oneOf(options.rtlFont, ['code', 'document'], 'codeBlock.rtlFont');
            this._config.codeBlock = Object.assign({}, this._config.codeBlock, options);
            return this;
        }

        // ── images ───────────────────────────────────────────────────────────

        /**
         * Register an image under a name: ![alt](name) in the content, or the
         * header logo. Local files: pass the File (file:// is not readable).
         * @param {string} name
         * @param {File|Blob|ArrayBuffer|Uint8Array|string} source - or a data URI / URL / path
         */
        registerImage(name, source) {
            if (!this._images) this._fail('registerImage needs ImageCore.js (load it before the builders)');
            this._images.register(name, source);
            return this;
        }

        /** ImageCore options: { baseUrl, svgScale, timeout }. */
        setImageOptions(options = {}) {
            if (this._images) this._images.setOptions(options);
            return this;
        }

        /** Resolve every image the document uses (content, header logo, custom header/footer). */
        /**
         * Formulas (MathCore placeholders) → images, for the builders that
         * place images (.doc, .docx, .pdf): SVG at the size of the body text,
         * rasterized by ImageCore like any SVG. Call before _resolveImages().
         * Without MathCore the TeX stays as text. Runs once per content.
         */
        async _mathToImages() {
            const html = this._contentHtml || '';
            if (typeof document === 'undefined' || !/class="kelk-math"/.test(html)) return;
            const box = document.createElement('div');
            box.innerHTML = html;
            const T = this.getTemplateOptions();
            const m = this._config.math || {};
            if (MathCore) {
                await MathCore.toImages(box, {
                    fontSizePt: BidiCore.cssPt(T.bidiFontSize) || 12,
                    maxWidth: BidiCore.contentWidthPt(T) * 4 / 3,          // a tagged equation spans the text column
                    omml: !!this._omml && m.word !== 'image',               // DocxBuilder: Word's own equations
                    fontFamily: m.textFont || T.bidiFont
                });
            } else {
                box.querySelectorAll('.kelk-math[data-tex]').forEach(function (el) {
                    const d = el.getAttribute('data-display') === 'block' ? '$$' : '$';
                    el.textContent = d + el.getAttribute('data-tex') + d;
                });
            }
            this._contentHtml = box.innerHTML;
        }

        /**
         * Where a content table stands: 'center' | 'text' (the document's own
         * side: right in a right-to-left document) | 'right' | 'left'. Tables in
         * a list item or a quote are not moved by this: they stand at the start
         * of their item / quote, part of it (see _tableSide).
         */
        setTableAlign(a) {
            this._config.tableAlign = this._oneOf(a, ['center', 'text', 'right', 'left'], 'tableAlign');
            return this;
        }

        /**
         * Lines, fills and bold of content tables — the same in every output.
         *   setTableStyle({ lines: 'grid', fill: 'header-stripes', total: true,
         *                   headerColor: '#DDEBF7', stripeColor: '#F2F2F2', borderColor: '#000000', borderWidth: 0.5 })
         * lines: none | underline (under the header) | horizontal | vertical | frame (outer box) | grid
         * fill:  none | header | stripes (even body rows) | header-stripes
         * total: the last row is bold, with a line above it.
         * headerCenter / headerBold (default true): the header row centered — a column's own
         * Markdown alignment (:---, :---:, ---:) always wins — and bold.
         * A table whose only row is its header has no header: that row is styled as a body row.
         * Every key is optional (TABLE_STYLE_DEFAULTS); headerColor defaults to
         * the template's tableHeaderBg; borderWidth is in points (0.25–3).
         */
        setTableStyle(v) {
            if (v == null) { this._config.tableStyle = null; return this; }
            if (typeof v !== 'object') this._fail('setTableStyle: an object { lines, fill, total, … }');
            const self = this;
            Object.keys(v).forEach(function (k) {
                if (!(k in TABLE_STYLE_DEFAULTS)) self._fail('setTableStyle: unknown option "' + k + '"');
            });
            const color = function (c, what) {
                if (c == null || c === '') return null;
                const x = String(c).trim();
                if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(x)) self._fail('setTableStyle: ' + what + ' must be #rgb or #rrggbb');
                return x.length === 4 ? '#' + x[1] + x[1] + x[2] + x[2] + x[3] + x[3] : x;
            };
            this._config.tableStyle = {
                lines: v.lines == null ? TABLE_STYLE_DEFAULTS.lines : this._oneOf(v.lines, Object.keys(TABLE_LINES), 'table lines'),
                fill: v.fill == null ? TABLE_STYLE_DEFAULTS.fill : this._oneOf(v.fill, Object.keys(TABLE_FILLS), 'table fill'),
                total: !!v.total,
                headerCenter: v.headerCenter == null ? true : !!v.headerCenter,
                headerBold: v.headerBold == null ? true : !!v.headerBold,
                headerColor: color(v.headerColor, 'headerColor'),
                stripeColor: color(v.stripeColor, 'stripeColor'),
                borderColor: color(v.borderColor, 'borderColor'),
                borderWidth: v.borderWidth == null ? TABLE_STYLE_DEFAULTS.borderWidth : Math.min(3, Math.max(0.25, +v.borderWidth || 0.5))
            };
            return this;
        }

        /** The table style in force as four rows with resolved colors: { rows, borderColor, borderWidth }. */
        _tableStyle() {
            const st = Object.assign({}, TABLE_STYLE_DEFAULTS, this._config.tableStyle || {});
            const T = this.getTemplateOptions ? this.getTemplateOptions() : {};
            const hex = function (c) { return /^#[0-9a-f]{6}$/i.test(c || '') ? c : null; };
            const colors = { header: st.headerColor || hex(T.tableHeaderBg) || '#E4E9EF', stripe: st.stripeColor || TABLE_STYLE_DEFAULTS.stripeColor };
            const L = TABLE_LINES[st.lines] || TABLE_LINES.grid, F = TABLE_FILLS[st.fill] || TABLE_FILLS.none;
            const row = function (lines, fill) { const r = Object.assign({}, lines); if (fill) r.background = colors[fill]; return r; };
            const rows = {
                header: Object.assign(row(L.header, F.header), { bold: st.headerBold !== false }),
                odd: row(L.body, F.odd),
                even: row(L.body, F.even),
                last: Object.assign({}, L.last, st.total ? { top: true, bold: true } : {})
            };
            return { rows: rows, borderColor: st.borderColor || TABLE_STYLE_DEFAULTS.borderColor, borderWidth: st.borderWidth,
                     headerCenter: st.headerCenter !== false };
        }

        /**
         * The table style applied to one table — every builder paints exactly
         * this, so the outputs agree. A line shared by two rows is drawn when
         * either row asks for it (the bottom of one, the top of the next); a
         * line shared by two cells of a row is the row's inner line.
         * @param {HTMLTableElement} table
         * @returns {{ color: string, width: number,
         *             rows: Array<{ kind: 'header'|'odd'|'even', last: boolean, background: ?string, bold: boolean, color: ?string }>,
         *             cells: Map<Element, { top: boolean, bottom: boolean, start: boolean, end: boolean }>,
         *             cols: Map<Element, number>, nCols: number }}
         *   rows by table.rows index; a row's text color is set on a fill
         *   (white on a dark fill, black on a light one). cols: each cell's
         *   first column, colspan and rowspan honoured (the occupancy grid);
         *   a builder that places cells itself uses it so text and lines agree.
         */
        _tableStyleGrid(table) {
            const S = this._tableStyle(), R = S.rows;
            const trs = Array.from(table.rows);
            const kinds = trs.map(function (tr) {
                const cells = Array.from(tr.cells);
                const inHead = !!tr.parentElement && tr.parentElement.tagName === 'THEAD';
                return inHead || (cells.length > 0 && cells.every(function (c) { return c.tagName === 'TH'; })) ? 'header' : 'body';
            });
            // a table of header rows only (a one-row Markdown table): no header — its rows are body rows
            if (kinds.indexOf('body') < 0) kinds.forEach(function (k, i) { kinds[i] = 'body'; });
            let lastBody = -1;
            kinds.forEach(function (k, i) { if (k === 'body') lastBody = i; });
            let n = 0;
            const rs = trs.map(function (tr, i) {
                const kind = kinds[i] === 'header' ? 'header' : (n++ % 2 === 0 ? 'odd' : 'even');
                const last = i === lastBody;
                const r = Object.assign({}, R[kind]);
                // the last row: what it sets replaces its odd/even row's value; the rest stays
                if (last) Object.keys(R.last).forEach(function (k) { if (R.last[k] !== undefined) r[k] = R.last[k]; });
                const bg = r.background || null;
                return {
                    kind: kind, last: last, background: bg,
                    bold: r.bold === undefined ? kind === 'header' : !!r.bold,
                    color: bg ? (BuilderBase.isDarkColor(bg) ? '#FFFFFF' : '#000000') : null,
                    top: !!r.top, bottom: !!r.bottom, start: !!r.start, end: !!r.end, inner: !!r.inner
                };
            });
            // the line above row i (and below the last row)
            const H = [];
            for (let i = 0; i <= rs.length; i++) H.push((i > 0 && rs[i - 1].bottom) || (i < rs.length && rs[i].top));
            // column positions (spans and row spans) and the column count
            const taken = [], cols = new Map();
            let nCols = 0;
            trs.forEach(function (tr, i) {
                taken[i] = taken[i] || [];
                let c = 0;
                Array.from(tr.cells).forEach(function (cell) {
                    while (taken[i][c]) c++;
                    const span = Math.max(1, cell.colSpan || 1), rspan = BidiCore.rowSpanOf(cell);
                    cols.set(cell, c);
                    for (let r = i; r < Math.min(trs.length, i + rspan); r++) {
                        taken[r] = taken[r] || [];
                        for (let k = c; k < c + span; k++) taken[r][k] = true;
                    }
                    c += span;
                    nCols = Math.max(nCols, c);
                });
            });
            const cells = new Map();
            trs.forEach(function (tr, i) {
                Array.from(tr.cells).forEach(function (cell) {
                    const c0 = cols.get(cell), span = Math.max(1, cell.colSpan || 1);
                    const below = Math.min(rs.length, i + BidiCore.rowSpanOf(cell));
                    cells.set(cell, {
                        top: H[i], bottom: H[below],
                        start: c0 === 0 ? rs[i].start : rs[i].inner,
                        end: c0 + span >= nCols ? rs[i].end : rs[i].inner
                    });
                });
            });
            return { color: S.borderColor, width: S.borderWidth, rows: rs, cells: cells, headerCenter: S.headerCenter,
                     cols: cols, nCols: nCols };
        }

        /**
         * How a cell is aligned when its column sets no alignment of its own:
         * 'center' in a header row (headerCenter), else null (the cell's start).
         * A column's Markdown alignment (align="…") always wins — the caller reads it first.
         * @param {HTMLTableCellElement} cell
         */
        _cellDefaultAlign(cell) {
            const table = cell.closest('table'), tr = cell.parentElement;
            if (!table || !tr) return null;
            if (!this._gridCache || this._gridCache.table !== table) this._gridCache = { table: table, g: this._tableStyleGrid(table) };
            const g = this._gridCache.g, r = g.rows[Array.prototype.indexOf.call(table.rows, tr)];
            return r && r.kind === 'header' && g.headerCenter ? 'center' : null;
        }

        /**
         * The physical side of a content table: 'left' | 'center' | 'right'.
         * In a list item or a quote: that container's start side (its own
         * direction); in a table cell: center; else setTableAlign.
         * @param {HTMLTableElement} table - still in the source DOM (li / blockquote ancestors)
         * @param {boolean} docRtl
         */
        _tableSide(table, docRtl) {
            const box = table.parentElement && table.parentElement.closest('li, blockquote, td, th');
            if (box && (box.tagName === 'LI' || box.tagName === 'BLOCKQUOTE')) return BidiCore.detectDirection(box) === 'rtl' ? 'right' : 'left';
            if (box) return 'center';
            const a = this._config.tableAlign || 'center';
            return a === 'text' ? (docRtl ? 'right' : 'left') : a;
        }

        /** The character of a task-list checkbox (<input type=checkbox>): taskMarks.done / .open. */
        _taskMark(input) {
            const m = this._config.taskMarks || SHARED_DEFAULTS.taskMarks;
            return input && input.hasAttribute('checked') ? m.done : m.open;
        }

                async _resolveImages() {
            if (!this._images || typeof document === 'undefined') return;
            const srcs = ImageCore.collectSources(this._contentHtml);
            const h = this._config.header, f = this._config.footer;
            if (h && h.mode === 'structured' && ImageCore.looksLikeImage(h.logo, this._images)) srcs.push(h.logo);
            [h, f].forEach(function (c) { if (c && c.mode === 'html') ImageCore.collectSources(c.html).forEach(function (x) { srcs.push(x); }); });
            await this._images.resolveAll(srcs);
        }

        // ── content ──────────────────────────────────────────────────────────

        /**
         * Set the document body (replaces previous content). An HTML string or
         * an element — its innerHTML is copied, the live element is never
         * modified. Processing happens at build time, so setters may be called
         * in any order.
         */
        addFromHtml(content) {
            if (typeof content === 'string') this._contentHtml = content;
            else if (content && content.innerHTML !== undefined) this._contentHtml = content.innerHTML;
            else this._fail('Content must be an HTML string or HTMLElement');
            return this;
        }
    }

    BuilderBase.PAGE_SIZES = PAGE_SIZES;
    /**
     * Word lowers an inline PICTURE twice as far as its run position says
     * (w:position in .docx, mso-text-raise in .doc — both, measured on Word's
     * own rendering): a formula image is lowered by depth × this factor.
     */
    BuilderBase.WORD_PICTURE_LOWER = 0.5;
    BuilderBase.SHARED_DEFAULTS = SHARED_DEFAULTS;
    BuilderBase.TABLE_LINES = TABLE_LINES;
    BuilderBase.TABLE_FILLS = TABLE_FILLS;
    BuilderBase.TABLE_STYLE_DEFAULTS = TABLE_STYLE_DEFAULTS;
    /** Whether text on this fill should be white: relative luminance below 0.179, where white and black contrast equally. */
    BuilderBase.isDarkColor = function (hex) {
        const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
        if (!m) return false;
        const lin = function (h) { const c = parseInt(h, 16) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
        return 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]) < 0.179;
    };
    /**
     * The one named-color table of the builders: the 148 CSS named colors (values checked against
     * Chromium's computed style) plus Word's system color `windowtext`. 'RRGGBB', no '#'.
     * Every builder reads colors through BuilderBase.colorHex (BidiCore.cssColorHex delegates here).
     */
    const NAMED_COLORS = Object.freeze({
        aliceblue: 'F0F8FF', antiquewhite: 'FAEBD7', aqua: '00FFFF', aquamarine: '7FFFD4', azure: 'F0FFFF',
        beige: 'F5F5DC', bisque: 'FFE4C4', black: '000000', blanchedalmond: 'FFEBCD', blue: '0000FF',
        blueviolet: '8A2BE2', brown: 'A52A2A', burlywood: 'DEB887', cadetblue: '5F9EA0', chartreuse: '7FFF00',
        chocolate: 'D2691E', coral: 'FF7F50', cornflowerblue: '6495ED', cornsilk: 'FFF8DC', crimson: 'DC143C',
        cyan: '00FFFF', darkblue: '00008B', darkcyan: '008B8B', darkgoldenrod: 'B8860B', darkgray: 'A9A9A9',
        darkgreen: '006400', darkgrey: 'A9A9A9', darkkhaki: 'BDB76B', darkmagenta: '8B008B', darkolivegreen: '556B2F',
        darkorange: 'FF8C00', darkorchid: '9932CC', darkred: '8B0000', darksalmon: 'E9967A', darkseagreen: '8FBC8F',
        darkslateblue: '483D8B', darkslategray: '2F4F4F', darkslategrey: '2F4F4F', darkturquoise: '00CED1',
        darkviolet: '9400D3', deeppink: 'FF1493', deepskyblue: '00BFFF', dimgray: '696969', dimgrey: '696969',
        dodgerblue: '1E90FF', firebrick: 'B22222', floralwhite: 'FFFAF0', forestgreen: '228B22', fuchsia: 'FF00FF',
        gainsboro: 'DCDCDC', ghostwhite: 'F8F8FF', gold: 'FFD700', goldenrod: 'DAA520', gray: '808080',
        green: '008000', greenyellow: 'ADFF2F', grey: '808080', honeydew: 'F0FFF0', hotpink: 'FF69B4',
        indianred: 'CD5C5C', indigo: '4B0082', ivory: 'FFFFF0', khaki: 'F0E68C', lavender: 'E6E6FA',
        lavenderblush: 'FFF0F5', lawngreen: '7CFC00', lemonchiffon: 'FFFACD', lightblue: 'ADD8E6',
        lightcoral: 'F08080', lightcyan: 'E0FFFF', lightgoldenrodyellow: 'FAFAD2', lightgray: 'D3D3D3',
        lightgreen: '90EE90', lightgrey: 'D3D3D3', lightpink: 'FFB6C1', lightsalmon: 'FFA07A', lightseagreen: '20B2AA',
        lightskyblue: '87CEFA', lightslategray: '778899', lightslategrey: '778899', lightsteelblue: 'B0C4DE',
        lightyellow: 'FFFFE0', lime: '00FF00', limegreen: '32CD32', linen: 'FAF0E6', magenta: 'FF00FF',
        maroon: '800000', mediumaquamarine: '66CDAA', mediumblue: '0000CD', mediumorchid: 'BA55D3',
        mediumpurple: '9370DB', mediumseagreen: '3CB371', mediumslateblue: '7B68EE', mediumspringgreen: '00FA9A',
        mediumturquoise: '48D1CC', mediumvioletred: 'C71585', midnightblue: '191970', mintcream: 'F5FFFA',
        mistyrose: 'FFE4E1', moccasin: 'FFE4B5', navajowhite: 'FFDEAD', navy: '000080', oldlace: 'FDF5E6',
        olive: '808000', olivedrab: '6B8E23', orange: 'FFA500', orangered: 'FF4500', orchid: 'DA70D6',
        palegoldenrod: 'EEE8AA', palegreen: '98FB98', paleturquoise: 'AFEEEE', palevioletred: 'DB7093',
        papayawhip: 'FFEFD5', peachpuff: 'FFDAB9', peru: 'CD853F', pink: 'FFC0CB', plum: 'DDA0DD',
        powderblue: 'B0E0E6', purple: '800080', rebeccapurple: '663399', red: 'FF0000', rosybrown: 'BC8F8F',
        royalblue: '4169E1', saddlebrown: '8B4513', salmon: 'FA8072', sandybrown: 'F4A460', seagreen: '2E8B57',
        seashell: 'FFF5EE', sienna: 'A0522D', silver: 'C0C0C0', skyblue: '87CEEB', slateblue: '6A5ACD',
        slategray: '708090', slategrey: '708090', snow: 'FFFAFA', springgreen: '00FF7F', steelblue: '4682B4',
        tan: 'D2B48C', teal: '008080', thistle: 'D8BFD8', tomato: 'FF6347', turquoise: '40E0D0', violet: 'EE82EE',
        wheat: 'F5DEB3', white: 'FFFFFF', whitesmoke: 'F5F5F5', yellow: 'FFFF00', yellowgreen: '9ACD32',
        windowtext: '000000'
    });
    BuilderBase.NAMED_COLORS = NAMED_COLORS;
    /**
     * CSS color (name, #rgb, #rgba, #rrggbb, #rrggbbaa, rgb() / rgba(), comma or space syntax, alpha as a
     * number or a percentage) → 'RRGGBB' | null. null: unknown, 'auto', 'transparent', or alpha 0 — a
     * fully transparent color is no color: Word 'auto' / no fill, PDF no fill. Partial alpha is composited
     * over white (the page of every export: DOCX, DOC and PDF have no transparency), so a translucent tint
     * such as rgba(0, 0, 0, .05) for a quote background stays the light grey it shows on the page instead
     * of turning solid black; for text it gives the lighter color it shows on white too.
     */
    BuilderBase.colorHex = function (v) {
        const t = String(v || '').trim().toLowerCase();
        if (Object.prototype.hasOwnProperty.call(NAMED_COLORS, t)) return NAMED_COLORS[t];
        const out = function (r, g, b, a) {
            if (!(a > 0)) return null;                       // alpha 0 (or NaN: an unreadable alpha) → no color
            a = Math.min(1, a);
            return [r, g, b].map(function (c) {
                c = Math.round(Math.min(255, c) * a + 255 * (1 - a));
                return ('0' + c.toString(16)).slice(-2);
            }).join('').toUpperCase();
        };
        let m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/.exec(t);
        if (m) return out(parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16), m[4] ? parseInt(m[4], 16) / 255 : 1);
        m = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/.exec(t);
        if (m) return out(parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16), parseInt(m[3] + m[3], 16), m[4] ? parseInt(m[4] + m[4], 16) / 255 : 1);
        m = /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)\s*(?:[,/]\s*(\d*\.?\d+)(%?)\s*)?\)?$/.exec(t);
        if (m) return out(+m[1], +m[2], +m[3], m[4] === undefined ? 1 : parseFloat(m[4]) / (m[5] ? 100 : 1));
        return null;
    };
    /**
     * Download a Blob as a file: a temporary <a download> is clicked, and its blob URL is revoked
     * only after `delay` ms — revoking right after click() can cancel the download in some browsers
     * (Firefox, Safari), which start reading the URL asynchronously.
     */
    BuilderBase.downloadBlob = function (blob, filename, delay) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, delay === undefined ? BuilderBase.REVOKE_DELAY : delay);
        return url;
    };
    BuilderBase.REVOKE_DELAY = 4000;      // ms; the same delay as the app's own download (scripts/ui.js)
    BuilderBase.DEFAULT_PAGING_LABELS = DEFAULT_PAGING_LABELS;
    BuilderBase.version = '2.0';          // the creator written into the files ("Kelk 2.0"); the app sets it from K.config.version, tools/check-version.js keeps this default equal

    if (typeof module !== 'undefined' && module.exports) module.exports = BuilderBase;
    else if (typeof define === 'function' && define.amd) define([], function () { return BuilderBase; });
    else global.BuilderBase = BuilderBase;
})(typeof window !== 'undefined' ? window : this);
