/**
 * BuilderBase - the configuration surface shared by every Kelk builder
 * ============================================================================
 * Version: 1.0
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
 *   setToc({ levels, title })          table of contents after the opening H1
 *   setTableWidth('auto' | '98%')      content tables (default auto; columns always follow the content)
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
        tableWidth: 'auto'                      // setTableWidth('auto' | 'NN%'): auto = the content's width, up to 100%
    };

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
                headerFooterDirection: function (v) { self.setHeaderFooterDirection(v); },
                header: function (v) { if (v != null && v !== false) self.setHeader(v); },
                footer: function (v) { if (v != null && v !== false) self.setFooter(v); },
                images: function (v) { Object.keys(v || {}).forEach(function (k) { if (v[k]) self.registerImage(k, v[k]); }); },
                imageOptions: function (v) { self.setImageOptions(v); },
                template: function (v) { self.setTemplateOptions(v); },
                tableWidth: function (v) { self.setTableWidth(v); },
                toc: function (v) { if (v) self.setToc(v === true ? {} : v); else self._config.toc = null; },
                styles: function (v) { self.setStyles(v); },
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

        /** @param {'auto'|'rtl'|'ltr'} direction */
        setDirection(direction) {
            this._config.direction = this._oneOf(direction, ['auto', 'rtl', 'ltr'], 'direction');
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
            if (typeof createMsoTemplate === 'function') return createMsoTemplate;          // eslint-disable-line no-undef
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
            this._config.toc = { levels: levels, title: options.title ? String(options.title) : '' };
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
    BuilderBase.SHARED_DEFAULTS = SHARED_DEFAULTS;
    BuilderBase.DEFAULT_PAGING_LABELS = DEFAULT_PAGING_LABELS;
    BuilderBase.version = '1.0';

    if (typeof module !== 'undefined' && module.exports) module.exports = BuilderBase;
    else if (typeof define === 'function' && define.amd) define([], function () { return BuilderBase; });
    else global.BuilderBase = BuilderBase;
})(typeof window !== 'undefined' ? window : this);
