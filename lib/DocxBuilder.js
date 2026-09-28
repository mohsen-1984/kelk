/**
 * DocxBuilder - Fluent DOCX Generation Library with Full RTL/BiDi Support
 * ========================================================================
 *
 * Version: 1.0
 * Author: mhn.com@gmail.com
 * License: MIT
 *
 * Made first for Persian, and for every right-to-left language (Arabic, Hebrew,
 * Urdu, Kurdish, Pashto …) and their mix with left-to-right text — and just as
 * usable for purely left-to-right documents (English, French, German, Spanish,
 * Greek, Russian …): the direction rules switch themselves off where there is
 * nothing to decide.
 *
 * The .docx sibling of WordHtmlBuilder: same fluent API, same content rules,
 * same styling options — but a real Office Open XML package built with
 * docx.js instead of MSO-flavoured HTML. Works entirely client-side.
 *
 * ─────────────────────────────────────────────────────────────────────
 * PARITY WITH WordHtmlBuilder
 * ─────────────────────────────────────────────────────────────────────
 *
 * Decisions come from BidiCore (shared with WordHtmlBuilder):
 *   - Document direction auto-detected ('auto' | 'rtl' | 'ltr')
 *   - Per-element direction: English paragraphs in an RTL document, list
 *     root-tree rule, all-LTR tables, numbers-only cells, counter-direction
 *     quotes
 *   - BiDi runs: counter-direction text becomes separate runs (w:rtl only on
 *     RTL text), with the same rules for "4k", brackets, quotes and the
 *     sentence-final period
 *
 * Known limitations:
 *   - Table of contents (setToc): Word offers to update the fields on opening;
 *     otherwise right-click the table → Update Field → Update entire table.
 *   - Bullets are the builder's own list definitions (• filled, ○ hollow, ▪),
 *     drawn like Word's but not the same entries as Word's Bullet Library:
 *     they look the same, the Library simply shows them as custom bullets.
 *
 * Styling comes from createMsoTemplate.DEFAULTS (msOfficeWordHtmlTemplate.js),
 * the single source of truth for both builders, so
 *     .setFonts({ bidi: 'Vazirmatn' })
 * gives the same result in .doc and .docx.
 *
 * Word-native output:
 *   - Latin and Complex Script fonts/sizes kept apart (w:rFonts ascii/hAnsi
 *     vs cs, w:sz vs w:szCs); w:rtl only on RTL runs
 *   - Headings → built-in Heading 1..6; quotes → built-in "Quote" style;
 *     lists → real Word numbering (9 levels, independent per list)
 *   - Quotes with lists / nested quotes / code → single-cell table, so the
 *     quote border is ONE straight line
 *   - Tables: colspan/rowspan, column alignment, header-row repeat
 *   - Code blocks: one bordered box (single-cell table), Highlight.js colors
 *     from the template
 *
 * OOXML side semantics (ECMA-376 transitional, verified by rendering): inside
 * an RTL (w:bidi) paragraph, w:jc and w:ind "left/right" are LOGICAL — left
 * means the paragraph's start — while w:pBdr left/right are PHYSICAL. So in
 * this file AlignmentType.LEFT / indent.left always mean "start", and border
 * sides are computed physically. (w:jc start/end are avoided: not every
 * renderer reads them.)
 *
 * ─────────────────────────────────────────────────────────────────────
 * USAGE
 * ─────────────────────────────────────────────────────────────────────
 *
 * @example Basic usage
 * await DocxBuilder.create()
 *     .setFonts({ bidi: 'Vazirmatn' })          // Latin stays Calibri (template)
 *     .setFontSizes({ latin: 11, bidi: 12 })
 *     .setPage({ size: 'A4', orientation: 'portrait', margin: '2cm' })
 *     .setHeader({ logo: 'Logo', title: 'Document Title', edition: 'v1' })
 *     .setFooter({ author: 'IT Center', link: 'https://example.com' })
 *     .addFromHtml(previewInnerHTML)      // string or element (read, never mutated;
 *                                         // preview code-block wrappers removed)
 *     .save('document.docx');
 *
 * @example Header/Footer direction — independent of the content
 * // 'rtl' (default): logo/author on the right, «صفحه X از Y» — also for English documents
 * // 'ltr'          : mirrored, "Page X of Y"
 * // 'auto'         : follow the document direction
 * DocxBuilder.create({ headerFooterDirection: 'ltr' })   // at creation …
 *     .setHeaderFooterDirection('ltr');                  // … or with the setter
 *
 * @example Content direction
 * DocxBuilder.create().setDirection('rtl');   // 'auto' (default) | 'rtl' | 'ltr'
 *
 * @example Simple header/footer, paging labels
 * DocxBuilder.create()
 *     .setHeader('Document Title')
 *     .setFooter(true);                                     // labels by direction
 * DocxBuilder.create()
 *     .setFooter({ pagingLabels: { page: 'Page', from: 'of' } });   // explicit labels
 *
 * @example Code blocks — language bar
 * DocxBuilder.create()
 *     .setCodeBlockOptions({
 *         showLanguage: true,       // false → no bar
 *         fallbackLabel: 'code',    // no language class → 'code'; '' → no bar for those
 *         rtlFont: 'code',          // RTL text in code: 'code' font | 'document' bidi font
 *         nestedFrames: true        // frame fenced blocks written inside a code block
 *     });
 *
 * @example Any template option / builder-level styles
 * DocxBuilder.create()
 *     .setFonts({ latin: 'Calibri', bidi: 'Vazirmatn', code: 'Consolas' })
 *     .setPage({ headerMargin: '0.7cm', footerMargin: '0.7cm' })
 *     .setTemplateOptions({ quoteBorderColor: '#2F5496', codeHeaderBg: '#E7E6E6' })
 *     .setStyles({
 *         endPunctuation: ['.', '!', '?'],
 *         borders: { headerBottom: 'solid black 0.5pt' },       // default: all 0.5pt black
 *         headerColumns: { logo: '15%', title: '70%', edition: '15%' },
 *         footerColumns: { author: '75%', paging: '25%' },
 *         pagingLabels: { page: 'صفحه', from: 'از' },          // for every footer
 *         list: { bullets: ['•', '–', '▪'] },   // indents: template listIndent / listIndentStep / listHanging
 *         taskMarks: { open: '☐', done: '☑' }
 *     });
 *
 * // Or as defaults for a whole app:
 * const make = () => DocxBuilder.create({ template: { bidiFont: 'Vazirmatn' } });
 *
 * @example Custom header/footer (callback)
 * DocxBuilder.create().setHeaderFooterCallback((d, ctx) => ({
 *     // ctx: { config, direction (header/footer), isRTL, docDirection, pagingLabels,
 *     //        border(css), noBorder(), pageNumberRuns(labels), textRuns(text) }
 *     headers: { default: new d.Header({ children: [
 *         new d.Paragraph({ bidirectional: ctx.isRTL, children: ctx.textRuns('سربرگ ISO 2000') })] }) },
 *     footers: { default: new d.Footer({ children: [
 *         new d.Paragraph({ bidirectional: ctx.isRTL, children: ctx.pageNumberRuns() })] }) }
 * }));
 *
 * @example Blob / docx.js Document instead of a download
 * const blob = await DocxBuilder.create().addFromHtml(html).toBlob();
 * const doc  = DocxBuilder.create().addFromHtml(html).build();   // docx.Document
 *
 * @example Legacy 1.x calls (still work, deprecated)
 * //   setFont(family, size)  → Complex Script (bidi) font/size only
 * //   setMargins({ top, right, bottom, left })  (inches)
 * //   setPageSize('A4' | { width, height })     (inches)
 *
 * ─────────────────────────────────────────────────────────────────────
 * REQUIREMENTS (load order)
 * ─────────────────────────────────────────────────────────────────────
 *
 * @requires docx.js 9.x          (global `docx`, or config.docxLib)
 * @requires BidiCore.js          (shared direction / BiDi engine)
 * @requires msOfficeWordHtmlTemplate.js (createMsoTemplate.DEFAULTS)
 */

(function (global) {
    'use strict';

    // Shared configuration surface (setters, validation, images, content)
    const BuilderBase = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
        ? require('./BuilderBase.js')
        : global.BuilderBase;
    if (!BuilderBase) {
        throw new Error('DocxBuilder requires BuilderBase.js — load it before DocxBuilder.js');
    }


    const BidiCore = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
        ? require('./BidiCore.js')
        : global.BidiCore;
    if (!BidiCore) {
        throw new Error('DocxBuilder requires BidiCore.js — load it before DocxBuilder.js');
    }

    // =========================================================================
    // Default Configuration (builder-level; styling lives in the template)
    // =========================================================================
    const DEFAULTS = {
        direction: 'auto',          // 'auto' | 'rtl' | 'ltr'
        endPunctuation: ['.'],      // see WordHtmlBuilder

        // Header/footer layout direction — independent of the content:
        // null → by header/footer direction (rtl: «صفحه … از …», ltr: "Page … of …")
        pagingLabels: null,
        header: { mode: 'none' },   // 'none' | 'simple' | 'structured' | 'callback'
        footer: { mode: 'none' },

        // DOCX-only: list geometry (twips) and markers
        list: {
            bullets: ['•', '○', '▪'],
        },
        horizontalRule: 'solid #A0A0A0 0.75pt',

        // Code blocks: language bar above the code (as in WordHtmlBuilder)
        codeBlock: {
            showLanguage: true,     // false → no language bar
            fallbackLabel: 'code',  // label when no language; '' → no bar then
            rtlFont: 'code',        // RTL text in code: 'code' font | 'document' bidi font
            nestedFrames: true      // frame fenced blocks written inside a code block
        },
        taskMarks: { open: '☐', done: '☑' },

        // Template (styling) overrides — keys of createMsoTemplate.DEFAULTS
        template: {}
    };

    const DEFAULT_PAGING_LABELS = BuilderBase.DEFAULT_PAGING_LABELS;


    /** Block kinds that must never touch each other (see _renderBlocks). */
    const BOX_KINDS = { table: true, squote: true };

    /**
     * Kind of the box at the start / end of an element's rendered content, for
     * the spacer rule: lists and list items count by their edges — a list
     * whose last item ends with code (or a table / quote, at any depth)
     * followed by a table is two adjacent boxes, which Word would join.
     */
    function edgeKind(el, last) {
        const tag = el.tagName;
        if (tag === 'TABLE' || tag === 'PRE') return 'table';
        if (tag === 'BLOCKQUOTE') return 'squote';
        if (!/^(UL|OL|LI|DIV)$/.test(tag)) return 'para';
        const nodes = Array.from(el.childNodes).filter(function (n) {
            return n.nodeType === 1 || (n.nodeType === 3 && /\S/.test(n.nodeValue));
        });
        const n = last ? nodes[nodes.length - 1] : nodes[0];
        return n && n.nodeType === 1 && (n.tagName === 'LI' || !isInlineNode(n)) ? edgeKind(n, last) : 'para';
    }

    const BLOCK_TAGS = /^(P|DIV|H[1-6]|BLOCKQUOTE|UL|OL|PRE|TABLE|HR|DL|DT|DD|FIGURE|FIGCAPTION|SECTION|ARTICLE|MAIN|HEADER|FOOTER|ASIDE|NAV|DETAILS|SUMMARY|ADDRESS)$/;

    // =========================================================================
    // Unit / value helpers (CSS-like template values → OOXML units)
    // =========================================================================
    const PT_PER_UNIT = { pt: 1, px: 0.75, cm: 72 / 2.54, mm: 72 / 25.4, in: 72, pc: 12 };

    /** '1.5cm' | '11pt' | 11 → points */
    function toPt(value) {
        if (typeof value === 'number') return value;
        const m = /^\s*(-?[\d.]+)\s*(pt|px|cm|mm|in|pc)?\s*$/i.exec(String(value));
        if (!m) throw new DocxBuilderError('Invalid length: ' + value);
        return parseFloat(m[1]) * PT_PER_UNIT[(m[2] || 'pt').toLowerCase()];
    }
    const twip = function (v) { return Math.round(toPt(v) * 20); };
    const halfPt = function (v) { return Math.round(toPt(v) * 2); };
    const eighths = function (v) { return Math.min(96, Math.max(2, Math.round(toPt(v) * 8))); };

    const NAMED_COLORS = {
        windowtext: 'auto', auto: 'auto', black: '000000', white: 'FFFFFF',
        darkgreen: '006400', green: '008000', gray: '808080', grey: '808080',
        silver: 'C0C0C0', red: 'FF0000', darkred: '8B0000', blue: '0000FF',
        darkblue: '00008B', navy: '000080', maroon: '800000', orange: 'FFA500',
        yellow: 'FFFF00', purple: '800080', teal: '008080'
    };
    function colorHex(c) {
        const s = String(c || '').trim().toLowerCase();
        if (NAMED_COLORS[s]) return NAMED_COLORS[s];
        let m = /^#([0-9a-f]{6})$/.exec(s);
        if (m) return m[1].toUpperCase();
        m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
        if (m) return (m[1] + m[1] + m[2] + m[2] + m[3] + m[3]).toUpperCase();
        return 'auto';
    }

    /** Margin shorthand (1–4 values) → { top, right, bottom, left } in twips. */
    function parseBox(value) {
        const v = String(value).trim().split(/\s+/).map(twip);
        const t = v[0], r = v.length > 1 ? v[1] : t, b = v.length > 2 ? v[2] : t, l = v.length > 3 ? v[3] : r;
        return { top: t, right: r, bottom: b, left: l };
    }

    /** Sanitize user-supplied option strings (same rules as WordHtmlBuilder). */
    function cssSafe(value, what) {
        const v = String(value).replace(/["';{}<>\\]/g, '').trim();
        if (!v) throw new DocxBuilderError('Invalid ' + what + ': ' + value);
        return v;
    }

    /** mso-bidi-language ('FA', 'AR-SA') → BCP-47 for w:lang w:bidi. */
    function bidiLang(code) {
        const c = String(code || 'FA').trim();
        const map = { FA: 'fa-IR', AR: 'ar-SA', HE: 'he-IL', UR: 'ur-PK', PS: 'ps-AF', KU: 'ku-IQ' };
        if (map[c.toUpperCase()]) return map[c.toUpperCase()];
        const p = c.split('-');
        return p.length === 2 ? p[0].toLowerCase() + '-' + p[1].toUpperCase() : c;
    }

    function textNodes(root) {
        const walker = document.createTreeWalker(root, 4 /* SHOW_TEXT */);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        return nodes;
    }

    /** Collapse HTML whitespace in text nodes outside <pre> (private clone only). */
    function normalizeWhitespace(root) {
        textNodes(root).forEach(function (n) {
            if (n.parentElement && n.parentElement.closest('pre')) return;
            n.nodeValue = n.nodeValue.replace(/[ \t\n\r\f]+/g, ' ');
        });
    }

    /** Trim leading/trailing whitespace of a block's first/last text node. */
    function trimEdges(el) {
        const nodes = textNodes(el);
        for (let i = 0; i < nodes.length; i++) {
            nodes[i].nodeValue = nodes[i].nodeValue.replace(/^\s+/, '');
            if (nodes[i].nodeValue) break;
        }
        for (let i = nodes.length - 1; i >= 0; i--) {
            nodes[i].nodeValue = nodes[i].nodeValue.replace(/\s+$/, '');
            if (nodes[i].nodeValue) break;
        }
    }

    function isInlineNode(node) {
        if (node.nodeType === 3) return true;
        return node.nodeType === 1 && !BLOCK_TAGS.test(node.tagName);
    }

    /** Has this inline group anything to render? */
    function hasContent(el) {
        return /\S/.test(el.textContent) || !!el.querySelector('input, br');
    }

    /** Split a paragraph's inner HTML on <br> into separate <p> (as WordHtmlBuilder). */
    function splitOnBr(innerHtml) {
        return innerHtml.split('<br>')
            .map(function (part) { return part.trim(); })
            .filter(function (part) { return part.length > 0; })
            .map(function (part) { return '<p>' + part + '</p>'; })
            .join('');
    }

    /** Bookmark name for an element id: Word allows letters, digits, _ (≤ 40). */
    function bookmarkName(id) {
        return ('bm_' + String(id).replace(/[^\p{L}\p{N}_]/gu, '_')).slice(0, 40);
    }

    /**
     * An RTL document gets an RTL section (<w:bidi/> in its sectPr), as Word
     * itself writes it when the document direction is right-to-left. Word takes
     * the direction of the paragraphs it CREATES from there — the entries of an
     * updated table of contents included; without it "Update entire table"
     * rebuilt the table LTR. docx.js has no option for it: the element is
     * added to the built section (before docGrid, the schema's order); if the
     * internals ever differ, nothing is changed.
     */
    function markSectionRtl(d, docx) {
        try {
            if (typeof d.OnOffElement !== 'function') return;
            const seen = new Set();
            const find = function (o, depth) {
                if (!o || typeof o !== 'object' || seen.has(o) || depth > 12) return null;
                seen.add(o);
                if (o.rootKey === 'w:sectPr' && Array.isArray(o.root)) return o;
                const kids = Object.values(o);                // documentWrapper.document.root[1].sections[0]
                for (let i = 0; i < kids.length; i++) { const r = find(kids[i], depth + 1); if (r) return r; }
                return null;
            };
            const sect = find(docx, 0);
            if (!sect || sect.root.some(function (c) { return c && c.rootKey === 'w:bidi'; })) return;
            const grid = sect.root.findIndex(function (c) { return c && c.rootKey === 'w:docGrid'; });
            const el = new d.OnOffElement('w:bidi', true);
            if (grid >= 0) sect.root.splice(grid, 0, el); else sect.root.push(el);
        } catch (e) { /* keep the section as docx.js built it */ }
    }

    /** Wrap loose inline nodes (starting at `first`) in a span, in place. */
    function wrapInline(first) {
        const span = document.createElement('span');
        first.parentNode.insertBefore(span, first);
        return span;
    }

    /** Physical side ('left'|'right') of a direction's start. */
    function startSide(dir) { return dir === 'rtl' ? 'right' : 'left'; }


    // =========================================================================
    // DocxBuilderError
    // =========================================================================
    class DocxBuilderError extends Error {
        constructor(message, cause = null) {
            super(message);
            this.name = 'DocxBuilderError';
            this.cause = cause;
        }
    }


    // =========================================================================
    // DocxBuilder
    // =========================================================================
    class DocxBuilder extends BuilderBase {

        /**
         * @param {object} config - builder config overrides; may also carry
         *        `docxLib` and `templateFactory`
         */
        constructor(config = {}) {
            super(config, { defaults: DEFAULTS, Error: DocxBuilderError, keep: ['docxLib'] });
            this._docxLib = config.docxLib || null;
            this._b = null;     // per-build state, only alive inside build()
        }

        // =====================================================================
        // Images
        // =====================================================================

        /** ImageRun for a resolved image (null when missing). size: CSS px. */
        _imageRun(src, size, alt) {
            const rec = this._images ? this._images.get(src) : null;
            if (!rec) return null;
            const d = this._b.d;
            return new d.ImageRun({
                type: rec.ext === 'jpg' ? 'jpg' : 'png',
                data: rec.bytes,
                transformation: { width: Math.max(1, Math.round(size.width)), height: Math.max(1, Math.round(size.height)) },
                altText: { name: alt || 'image', description: alt || '', title: alt || '' }
            });
        }

        static create(config = {}) {
            return new DocxBuilder(config);
        }

        // =====================================================================
        // Configuration (fluent) — same surface as WordHtmlBuilder
        // =====================================================================

        // ── Legacy (1.x) API — thin aliases ─────────────────────────────────

        // =====================================================================
        // Header / Footer
        // =====================================================================

        /*
         * Custom header/footer (all three builders, same model — see
         * BidiCore.parseHeaderFooter for the supported HTML subset):
         *   .setHeader({ html: '<table><tr><td style="width:20%"><img src="logo"></td>' +
         *                      '<td style="border:1pt solid red">{title}</td></tr></table>' })
         *   .setFooter({ html: '<p style="text-align:center">صفحه {page} از {pages} — {date}</p>' })
         * Fields: {page} {pages} {date} {title}. Options: title (else the first
         * <h1>), dateLocale (default: fa-IR, Latin digits, for an RTL header;
         * en-GB otherwise). Text runs through the BiDi engine; images resolve
         * like the content's (registered names, data URIs, URLs).
         */
        // =====================================================================
        // Content
        // =====================================================================

        // =====================================================================
        // Output
        // =====================================================================

        /** Build the docx.js Document (synchronous; needs a DOM). */
        build() {
            const d = this._getDocxLib();
            if (typeof document === 'undefined') {
                throw new DocxBuilderError('DocxBuilder.build() needs a DOM (browser or jsdom)');
            }
            const T = this.getTemplateOptions();
            const factory = this._resolveTemplateFactory();

            // ── Parse once into a private tree ──
            const root = BidiCore.inertRoot();          // parsed without loading images
            root.innerHTML = this._contentHtml;
            BidiCore.unwrapCodeBlocks(root);      // preview decoration out, first
            root.querySelectorAll('p').forEach(function (p) {
                if (p.innerHTML.includes('<br>')) p.outerHTML = splitOnBr(p.innerHTML);
            });

            // ── Direction: the same decisions WordHtmlBuilder makes ──
            const detected = BidiCore.detectDirection(root);
            const docDir = this._config.direction === 'auto' ? detected : this._config.direction;
            const toc = this._config.toc;
            if (toc) BidiCore.insertToc(root, { levels: toc.levels, title: toc.title, dir: docDir });
            const plan = BidiCore.planToMaps(BidiCore.planDirections(root, docDir === 'rtl'));
            const hfPref = this._config.headerFooterDirection;
            const hfDir = (hfPref === 'rtl' || hfPref === 'ltr') ? hfPref : docDir;
            normalizeWhitespace(root);

            // ── Resolved units ──
            const pageWH = String(T.pageSize).trim().split(/\s+/).map(twip);
            const landscape = T.pageOrientation === 'landscape' || pageWH[0] > pageWH[1];
            const margin = parseBox(T.pageMargin);
            const pageWidth = landscape ? Math.max(pageWH[0], pageWH[1]) : Math.min(pageWH[0], pageWH[1]);
            const lineOf = function (lh) {
                const rule = String(T.lineHeightRule || 'auto').toLowerCase();
                if (/%$/.test(String(lh)) && rule === 'auto') {
                    return { line: Math.round(240 * parseFloat(lh) / 100), lineRule: d.LineRuleType.AUTO };
                }
                return { line: twip(lh), lineRule: rule === 'exactly' ? d.LineRuleType.EXACT : d.LineRuleType.AT_LEAST };
            };

            this._b = {
                d: d, T: T, root: root, plan: plan,
                docDir: docDir, docIsRTL: docDir === 'rtl', contentIsRTL: detected === 'rtl',
                hfDir: hfDir, hfIsRTL: hfDir === 'rtl',
                numbering: [],
                contentWidth: pageWidth - margin.left - margin.right,
                spacing: Object.assign({ before: twip(T.paraMarginTop), after: twip(T.paraMarginBottom) }, lineOf(T.lineHeight)),
                spacingTight: Object.assign({ before: twip(T.paraMarginTopTight), after: twip(T.paraMarginBottomTight) }, lineOf(T.lineHeightTight)),
                codeFont: { ascii: T.codeFont, hAnsi: T.codeFont, eastAsia: T.codeFont,
                            // RTL text in code (w:cs): code font, or the bidi font ('document')
                            cs: T.codeBidiFont || ((this._config.codeBlock || {}).rtlFont === 'document' ? T.bidiFont : T.codeFont) },
                codeSize: halfPt(T.codeFontSize),
                quoteBorder: this._border('solid ' + T.quoteBorderColor + ' ' + T.quoteBorderWidth, toPt(T.quotePadding)),
                quoteIndent: twip(T.quoteIndent),                         // edge → border
                quotePad: twip(T.quotePadding),                           // border → text
                quoteTextIndent: twip(T.quoteIndent) + twip(T.quotePadding),
                hljs: this._hljsPalette(factory)
            };

            try {
                // ── Body (+ leading/trailing spacer, as WordHtmlBuilder) ──
                const body = this._renderBlocks(root, {});
                const children = body.items;
                if (body.firstKind !== 'para') children.unshift(this._spacer());
                children.push(this._spacer());

                // ── Header / footer ──
                let headers, footers;
                if (this._headerFooterCallback) {
                    const r = this._headerFooterCallback(d, this._callbackContext()) || {};
                    headers = r.headers;
                    footers = r.footers;
                } else {
                    headers = this._buildHeaders();
                    footers = this._buildFooters();
                }

                const section = {
                    properties: {
                        page: {
                            // docx.js expects PORTRAIT dimensions + orientation flag
                            size: {
                                width: Math.min(pageWH[0], pageWH[1]),
                                height: Math.max(pageWH[0], pageWH[1]),
                                orientation: landscape ? d.PageOrientation.LANDSCAPE : d.PageOrientation.PORTRAIT
                            },
                            margin: {
                                top: margin.top, right: margin.right, bottom: margin.bottom, left: margin.left,
                                header: twip(T.headerMargin), footer: twip(T.footerMargin)
                            }
                        }
                    },
                    children: children
                };
                if (headers) section.headers = headers;
                if (footers) section.footers = footers;

                const docx = new d.Document({
                    styles: this._buildStyles(),
                    numbering: { config: this._b.numbering },
                    sections: [section]
                });
                if (this._b.contentIsRTL) markSectionRtl(d, docx);
                return docx;
            } finally {
                this._b = null;
            }
        }

        /** @returns {Promise<Blob>} */
        async toBlob() {
            await this._resolveImages();          // async first; build() stays sync
            return this._getDocxLib().Packer.toBlob(this.build());
        }

        /** Download as .docx (no FileSaver dependency). */
        async save(filename = 'document.docx') {
            const blob = await this.toBlob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            return this;
        }

        getDocxLib() {
            return this._getDocxLib();
        }

        // =====================================================================
        // Resolution helpers
        // =====================================================================

        _getDocxLib() {
            if (this._docxLib) return this._docxLib;
            if (typeof docx !== 'undefined') return (this._docxLib = docx);
            if (typeof global !== 'undefined' && global.docx) return (this._docxLib = global.docx);
            throw new DocxBuilderError('docx library not found. Load it via <script> or pass config.docxLib');
        }

        /** Highlight.js colors, read from the template's own stylesheet. */
        _hljsPalette(factory) {
            const palette = {};
            let css;
            try { css = factory(Object.assign({}, this._config.template, { direction: 'ltr' })); }
            catch (e) { return palette; }
            const re = /\.(hljs-[\w-]+)\s*\{([^}]*)\}/g;
            let m;
            while ((m = re.exec(css))) {
                const decl = m[2], st = {};
                const color = /(?:^|;|\s)color\s*:\s*([^;]+)/.exec(decl);
                if (color) st.color = colorHex(color[1]);
                if (/font-weight\s*:\s*bold/.test(decl)) st.bold = true;
                if (/font-style\s*:\s*italic/.test(decl)) st.italics = true;
                palette[m[1]] = st;
            }
            return palette;
        }

        /** 'solid #C07030 3.5pt' → docx border object. */
        _border(css, spacePt) {
            const d = this._getDocxLib();
            const styles = { solid: d.BorderStyle.SINGLE, dotted: d.BorderStyle.DOTTED, dashed: d.BorderStyle.DASHED, double: d.BorderStyle.DOUBLE };
            const out = { style: d.BorderStyle.SINGLE, size: 8, color: 'auto' };
            String(css || '').trim().split(/\s+/).forEach(function (t) {
                const low = t.toLowerCase();
                if (low === 'none' || low === 'hidden') out.style = d.BorderStyle.NIL;
                else if (styles[low]) out.style = styles[low];
                else if (/^[\d.]+(pt|px|cm|mm|in)?$/i.test(t)) out.size = eighths(t);
                else out.color = colorHex(t);
            });
            if (spacePt !== undefined) out.space = Math.min(31, Math.round(spacePt));
            return out;
        }

        _noBorder() {
            return { style: this._getDocxLib().BorderStyle.NIL };
        }

        _allNoBorders() {
            const n = this._noBorder();
            return { top: n, bottom: n, left: n, right: n };
        }

        /**
         * Paragraph-border reset for the Quote style (it only ever sets left or
         * right). NOTE: docx.js writes w:pBdr children as top,bottom,left,right,
         * but the schema order is top,left,bottom,right — so a paragraph must
         * never combine a bottom border with a left one. Boxes (code blocks)
         * are therefore single-cell tables, and quote resets touch only sides.
         */
        _sideNoBorders() {
            const n = this._noBorder();
            return { left: n, right: n };
        }

        // =====================================================================
        // Direction lookup
        // =====================================================================

        /**
         * Effective direction of an element: its own plan entry or the nearest
         * planned ancestor (li, list, cell, quote, LTR table), else the document.
         * `planned` mirrors WordHtmlBuilder's explicit text-align:left overrides.
         */
        _dirOf(el) {
            const b = this._b;
            for (let n = el; n && n !== b.root; n = n.parentElement) {
                if (b.plan.dir.has(n)) return { dir: b.plan.dir.get(n), planned: true };
                if (n.tagName === 'TABLE' && b.plan.ltrTables.has(n)) return { dir: 'ltr', planned: true };
            }
            return { dir: b.docDir, planned: false };
        }

        /**
         * Table of contents: the title, then a real Word TOC field (docx SDT)
         * over headings 1–levels, pre-filled with the entries and marked dirty
         * so Word offers to update it — page numbers included — on opening.
         */
        _renderToc(box, ctx) {
            const b = this._b, d = b.d, T = b.T, self = this;
            const levels = parseInt(box.getAttribute('data-levels'), 10) || 2;
            const titleEl = box.querySelector('.kelk-toc-title');
            const titleText = titleEl ? titleEl.textContent.trim() : '';
            const items = [];
            if (titleText) {
                const rtl = this._dirOf(titleEl).dir === 'rtl';
                items.push(new d.Paragraph({
                    style: 'TOCHeading', bidirectional: rtl,
                    children: [new d.TextRun({ text: titleText, rightToLeft: rtl })]   // rtl run → the complex-script font
                }));
            }
            // The entries are our own paragraphs inside Word's TOC field: each with
            // its direction, an RTL run where needed, a dotted tab to the end side
            // and a PAGEREF field. Word fills the page numbers on opening (the field
            // is dirty: Word offers to update it) and rebuilds the entries with the
            // "toc n" styles when the table is updated.
            const tabPos = Math.max(1000, Math.round((ctx.width || b.contentWidth) - 10));   // the end of the text area
            const entries = Array.from(box.querySelectorAll('.kelk-toc-entry')).map(function (e) {
                const lvl = parseInt(e.getAttribute('data-level'), 10) || 1;
                const rtl = self._dirOf(e).dir === 'rtl';
                const bm = bookmarkName(e.getAttribute('data-target'));
                return new d.Paragraph({
                    style: 'TOC' + lvl, bidirectional: rtl,
                    tabStops: [{ type: rtl ? d.TabStopType.LEFT : d.TabStopType.RIGHT, position: tabPos, leader: 'dot' }],
                    children: [new d.InternalHyperlink({ anchor: bm, children: [
                        new d.TextRun({ text: e.textContent.trim(), rightToLeft: rtl }),
                        new d.TextRun({ children: [new d.Tab()], rightToLeft: rtl }),
                        new d.PageReference(bm, { hyperlink: true })
                    ] })]
                });
            });
            const toc = new d.TableOfContents(titleText || 'Contents', {
                hyperlink: true, headingStyleRange: '1-' + levels, contentChildren: entries
            });
            // docx.js puts the field's begin and end in two paragraphs of their own
            // (no direction). Word rebuilds the table from the paragraph that holds
            // the field begin — so an update turned the whole table LTR. Move the
            // begin run into the first entry and the end run into the last (Word's
            // own layout); if docx.js ever changes its internals, leave it as it is.
            try {
                const content = toc.root.find(function (c) { return c && c.rootKey === 'w:sdtContent'; });
                const kids = content && content.root;
                if (kids && kids.length === entries.length + 2 && entries.length) {
                    const runs = function (p) { return p.root.filter(function (c) { return c && c.rootKey === 'w:r'; }); };
                    const beginRuns = runs(kids[0]), endRuns = runs(kids[kids.length - 1]);
                    const first = entries[0].root, last = entries[entries.length - 1].root;
                    const at = first[0] && first[0].rootKey === 'w:pPr' ? 1 : 0;
                    first.splice.apply(first, [at, 0].concat(beginRuns));
                    endRuns.forEach(function (r) { last.push(r); });
                    kids.splice(kids.length - 1, 1);
                    kids.splice(0, 1);
                }
            } catch (err) { /* keep docx.js's layout */ }
            items.push(toc);
            return { items: items, kind: 'para' };
        }

        /** List indents in twips — the template's (shared with PDF and HTML), or config.list.indent. */
        _listIndent() {
            const o = this._config.list && this._config.list.indent;
            if (o) return o;
            const T = this.getTemplateOptions();
            const tw = function (v, dflt) { const n = BidiCore.cssPt(v); return Math.round((isNaN(n) ? dflt : n) * 20); };
            return { base: tw(T.listIndent, 24), increment: tw(T.listIndentStep, 18), hanging: tw(T.listHanging, 14) };
        }

        /** HTML/CSS alignment keyword → AlignmentType for a paragraph direction. */
        _align(keyword, paraDir) {
            const A = this._b.d.AlignmentType;
            switch (String(keyword || '').toLowerCase()) {
                case 'center': return A.CENTER;
                case 'justify': return A.BOTH;
                case 'left': return paraDir === 'rtl' ? A.RIGHT : A.LEFT;
                case 'right': return paraDir === 'rtl' ? A.LEFT : A.RIGHT;
                case 'start': return A.LEFT;
                case 'end': return A.RIGHT;
                default: return undefined;
            }
        }

        // =====================================================================
        // Inline content → runs (BiDi-aware)
        // =====================================================================

        _run(text, fmt, rtl) {
            const b = this._b, d = b.d;
            const p = { text: text };
            if (fmt.bold) p.bold = true;
            if (fmt.italics) p.italics = true;
            if (fmt.underline) p.underline = { type: d.UnderlineType.SINGLE };
            if (fmt.strike) p.strike = true;
            if (fmt.color) p.color = fmt.color;
            if (fmt.highlight) p.highlight = fmt.highlight;
            if (fmt.subScript) p.subScript = true;
            if (fmt.superScript) p.superScript = true;
            if (fmt.link) p.style = 'Hyperlink';
            if (fmt.size) p.size = fmt.size;                 // half-points (header/footer HTML)
            if (fmt.code) { p.font = b.codeFont; p.size = b.codeSize; }
            if (rtl) p.rightToLeft = true;
            return new d.TextRun(p);
        }

        /**
         * Runs for an inline container. Counter-direction ranges come from
         * BidiCore.findIsolateRanges over the block's flattened text, exactly
         * as WordHtmlBuilder computes its <span dir> isolates. A run is w:rtl
         * precisely when its text belongs to an RTL stretch:
         *     rtl = (baseDir === 'rtl') XOR (inside a counter-direction range)
         * Inline code is always LTR and never part of the flattened text.
         */
        _inlineRuns(container, baseDir, baseFmt) {
            const d = this._b.d, self = this;
            const flat = BidiCore.flattenBlock(container);
            const offsets = new Map();
            flat.nodeMap.forEach(function (e) { offsets.set(e.node, e.start); });
            const ranges = BidiCore.hasMix(flat.text)
                ? BidiCore.findIsolateRanges(flat.text, baseDir, { endPunctuation: this._config.endPunctuation || [] })
                : [];
            const baseRtl = baseDir === 'rtl';

            function emitText(node, fmt, sink) {
                const val = node.nodeValue;
                if (!val) return;
                if (fmt.code) { sink.push(self._run(val, fmt, false)); return; }
                if (!ranges.length || !offsets.has(node)) { sink.push(self._run(val, fmt, baseRtl)); return; }
                const s0 = offsets.get(node), s1 = s0 + val.length;
                let pos = 0;
                ranges.forEach(function (r) {
                    if (r[1] <= s0 || r[0] >= s1) return;
                    const a = Math.max(r[0], s0) - s0, e = Math.min(r[1], s1) - s0;
                    if (a > pos) sink.push(self._run(val.slice(pos, a), fmt, baseRtl));
                    sink.push(self._run(val.slice(a, e), fmt, !baseRtl));
                    pos = e;
                });
                if (pos < val.length) sink.push(self._run(val.slice(pos), fmt, baseRtl));
            }

            function walk(node, fmt, sink) {
                if (node.nodeType === 3) { emitText(node, fmt, sink); return; }
                if (node.nodeType !== 1) return;
                const nf = Object.assign({}, fmt);
                switch (node.tagName) {
                    case 'STRONG': case 'B': nf.bold = true; break;
                    case 'EM': case 'I': case 'CITE': case 'DFN': case 'VAR': nf.italics = true; break;
                    case 'U': case 'INS': nf.underline = true; break;
                    case 'S': case 'DEL': case 'STRIKE': nf.strike = true; break;
                    case 'CODE': case 'KBD': case 'SAMP': case 'TT': nf.code = true; break;
                    case 'MARK': nf.highlight = 'yellow'; break;
                    case 'SUB': nf.subScript = true; break;
                    case 'SUP': nf.superScript = true; break;
                    case 'BR': sink.push(new d.TextRun({ break: 1 })); return;
                    case 'SPAN': {
                        const field = node.getAttribute('data-hf-field');
                        if (field) {                     // header/footer {page} / {pages}
                            const fp = { children: [field === 'PAGE' ? d.PageNumber.CURRENT : d.PageNumber.TOTAL_PAGES] };
                            if (fmt.bold) fp.bold = true;
                            if (fmt.italics) fp.italics = true;
                            if (fmt.color) fp.color = fmt.color;
                            if (fmt.size) fp.size = fmt.size;
                            sink.push(new d.TextRun(fp));
                            return;
                        }
                        if (node.getAttribute('style')) {
                            const st = BidiCore.hfStyleOf(node);
                            if (st.color && BidiCore.cssColorHex(st.color)) nf.color = BidiCore.cssColorHex(st.color);
                            if (st.size > 0) nf.size = Math.round(st.size * 2);
                            if (st.bold) nf.bold = true;
                            if (st.italic) nf.italics = true;
                        }
                        break;
                    }
                    case 'IMG': {
                        // resolved image → ImageRun (inside a link too); else its alt text
                        const src = node.getAttribute('src') || '', alt = node.getAttribute('alt') || '';
                        const rec = self._images ? self._images.get(src) : null;
                        const run = rec && self._imageRun(src, ImageCore.displaySize(node, rec, self._b.contentWidth / 15), alt);
                        if (run) sink.push(run);
                        else if (alt) sink.push(self._run(alt, fmt, BidiCore.hasRtlLetter(alt)));
                        return;
                    }
                    case 'INPUT':
                        if ((node.getAttribute('type') || '').toLowerCase() === 'checkbox') {
                            const marks = self._config.taskMarks;
                            sink.push(self._run((node.hasAttribute('checked') ? marks.done : marks.open) + ' ', fmt, baseRtl));
                        }
                        return;
                    case 'A': {
                        const href = node.getAttribute('href') || '';
                        const kids = [];
                        nf.link = !!href;
                        for (let c = node.firstChild; c; c = c.nextSibling) walk(c, nf, kids);
                        if (!kids.length) return;
                        if (!href) kids.forEach(function (k) { sink.push(k); });
                        else if (href.charAt(0) === '#') sink.push(new d.InternalHyperlink({ anchor: bookmarkName(href.slice(1)), children: kids }));
                        else sink.push(new d.ExternalHyperlink({ link: href, children: kids }));
                        return;
                    }
                }
                for (let c = node.firstChild; c; c = c.nextSibling) walk(c, nf, sink);
            }

            const runs = [];
            for (let c = container.firstChild; c; c = c.nextSibling) walk(c, baseFmt || {}, runs);
            return runs;
        }

        /**
         * Runs for a plain string (header/footer text) with the same BiDi rules.
         * A string entirely in the other script becomes one counter-direction
         * run — so "ISO 2000" in an RTL header is not w:rtl (Latin font slot,
         * Latin digits).
         */
        _textRuns(text, baseDir) {
            const t = String(text == null ? '' : text);
            let base = baseDir || this._b.hfDir;
            if (!BidiCore.hasMix(t)) {
                const fa = BidiCore.hasRtlLetter(t), la = BidiCore.hasLatin(t);
                if (base === 'rtl' && la && !fa) base = 'ltr';
                else if (base === 'ltr' && fa && !la) base = 'rtl';
            }
            const span = document.createElement('span');
            span.textContent = t;
            return this._inlineRuns(span, base);
        }

        // =====================================================================
        // Paragraphs
        // =====================================================================

        /**
         * One paragraph from an inline container.
         * @param {Element} container
         * @param {object} ctx - render context { quote, cell, cellHeader, cellAlign, width }
         * @param {object} [extra] - extra Paragraph options (style, numbering, heading, indent)
         */
        _para(container, ctx, extra) {
            const d = this._b.d;
            const info = this._dirOf(container);
            trimEdges(container);
            let runs = this._inlineRuns(container, info.dir, ctx.cellHeader ? { bold: true } : null);
            if (container.id && /^H[1-6]$/.test(container.tagName) && runs.length) {
                runs = [new d.Bookmark({ id: bookmarkName(container.id), children: runs })];
            }
            const p = Object.assign({ bidirectional: info.dir === 'rtl', children: runs }, extra || {});

            if (ctx.cell) {
                if (!p.style) p.style = 'TableParagraph';
                p.alignment = this._align(ctx.cellAlign, info.dir) ||
                    (ctx.cellHeader ? d.AlignmentType.CENTER : d.AlignmentType.LEFT);
            } else if (/^H[1-6]$/.test(container.tagName)) {
                if (info.planned) p.alignment = d.AlignmentType.LEFT;   // headings start (WordHtmlBuilder: same)
            } else if (BidiCore.noJustify(container.textContent)) {
                p.alignment = d.AlignmentType.LEFT;      // a long URL/path: start, not stretched
            }                                            // else the body style's alignment, for every language
            if (ctx.quote) this._applyQuoteProps(p, ctx.quote, info.dir);
            return new d.Paragraph(p);
        }

        _spacer() {
            const b = this._b;
            return new b.d.Paragraph({
                bidirectional: b.contentIsRTL,
                alignment: b.d.AlignmentType.LEFT,
                children: []
            });
        }

        // =====================================================================
        // Blocks
        // =====================================================================

        /**
         * Render the child nodes of `parent` as block content. Loose inline
         * nodes are grouped into one paragraph. Any two adjacent "boxes" —
         * tables, table-form quotes, code blocks, simple quotes, in any
         * combination — get a spacer paragraph; Word would merge them
         * otherwise (same rule as WordHtmlBuilder._separateAdjacentBlocks).
         * @returns {{ items: Array, firstKind: string|null }}
         */
        _renderBlocks(parent, ctx) {
            const self = this, items = [];
            let group = null, prevKind = null, firstKind = null;

            function push(res) {
                if (!res || !res.items.length) return;
                const first = res.first || res.kind, last = res.last || res.kind;
                if (BOX_KINDS[prevKind] && BOX_KINDS[first]) items.push(self._spacer());
                res.items.forEach(function (x) { items.push(x); });
                if (firstKind === null) firstKind = res.kind;     // leading spacer: a list counts as a box
                prevKind = last;
            }
            function flush() {
                if (!group) return;
                const g = group;
                group = null;
                if (!hasContent(g)) return;
                push({ items: [self._para(g, ctx)], kind: 'para' });
            }

            Array.from(parent.childNodes).forEach(function (child) {
                if (isInlineNode(child)) {
                    if (!group) {
                        if (child.nodeType === 3 && !/\S/.test(child.nodeValue)) return;
                        group = wrapInline(child);
                    }
                    group.appendChild(child);
                    return;
                }
                flush();
                if (child.nodeType === 1) push(self._renderBlock(child, ctx));
            });
            flush();
            return { items: items, firstKind: firstKind, lastKind: prevKind };
        }

        /** @returns {{ items: Array, kind: string }} */
        _renderBlock(el, ctx) {
            const d = this._b.d;
            const tag = el.tagName;
            const plainKind = 'para';

            if (tag === 'DIV' && el.classList.contains('kelk-toc')) return this._renderToc(el, ctx);
            if (/^H[1-6]$/.test(tag)) {
                const extra = (ctx.quote || ctx.cell) ? null : { heading: d.HeadingLevel['HEADING_' + tag.charAt(1)] };
                return { items: [this._para(el, ctx, extra)], kind: plainKind };
            }
            switch (tag) {
                case 'P':
                    return { items: [this._para(el, ctx)], kind: plainKind };
                case 'UL': case 'OL': {
                    // edges first: rendering moves the items' nodes
                    const first = edgeKind(el, false), last = edgeKind(el, true);
                    return { items: this._renderList(el, ctx, 0, null), kind: 'list', first: first, last: last };
                }
                case 'BLOCKQUOTE':
                    if ((ctx.quote && ctx.quote.inTable) || BidiCore.isComplexQuote(el, this._b.docIsRTL)) {
                        return { items: [this._quoteTable(el, ctx)], kind: 'table' };
                    }
                    return { items: this._simpleQuote(el, ctx), kind: 'squote' };
                case 'PRE':
                    return { items: this._renderCode(el, ctx), kind: 'table' };
                case 'TABLE':
                    return { items: [this._renderTable(el, ctx)], kind: 'table' };
                case 'HR':
                    return {
                        items: [new d.Paragraph({ border: { bottom: this._border(this._config.horizontalRule, 1) }, children: [] })],
                        kind: 'hr'
                    };
                default: {
                    const r = this._renderBlocks(el, ctx);
                    return { items: r.items, kind: r.firstKind || 'para', last: r.lastKind || 'para' };
                }
            }
        }

        // =====================================================================
        // Lists — real Word numbering, one definition per list
        // =====================================================================

        /** New numbering definition; `level` is where this list starts. */
        _newListRef(listEl, level) {
            const b = this._b, d = b.d, cfg = this._config.list;
            const isOl = listEl.tagName === 'OL';
            const ref = (isOl ? 'ol-' : 'ul-') + b.numbering.length;
            // Decimal at every level (as the .doc output): the indent shows the
            // level, and a Latin letter/roman marker in an RTL item reads badly.
            const formats = [d.LevelFormat.DECIMAL];
            const typeMap = {
                '1': d.LevelFormat.DECIMAL, a: d.LevelFormat.LOWER_LETTER, A: d.LevelFormat.UPPER_LETTER,
                i: d.LevelFormat.LOWER_ROMAN, I: d.LevelFormat.UPPER_ROMAN
            };
            const start = parseInt(listEl.getAttribute('start'), 10);
            const type = listEl.getAttribute('type');
            const levels = [], ind = this._listIndent();
            for (let lvl = 0; lvl < 9; lvl++) {
                const L = {
                    level: lvl,
                    format: isOl ? formats[lvl % formats.length] : d.LevelFormat.BULLET,
                    text: isOl ? '%' + (lvl + 1) + '.' : cfg.bullets[lvl % cfg.bullets.length],
                    alignment: d.AlignmentType.LEFT,
                    style: { paragraph: { indent: { left: ind.base + lvl * ind.increment, hanging: ind.hanging } } }
                };
                if (lvl === level && isOl) {
                    if (start > 0) L.start = start;
                    if (type && typeMap[type]) L.format = typeMap[type];
                }
                levels.push(L);
            }
            b.numbering.push({ reference: ref, levels: levels });
            return ref;
        }

        /**
         * Render a list. Nested lists of the SAME type continue the parent's
         * numbering one level deeper; a different type gets its own definition.
         * Loose items (<li><p>…</p><p>…</p></li>) keep their paragraphs apart:
         * the first is numbered, the rest are indented continuation paragraphs.
         */
        _renderList(listEl, ctx, level, ref) {
            const self = this, cfg = this._config.list, items = [], ind = this._listIndent();
            ref = ref || this._newListRef(listEl, level);
            const indentStart = ind.base + level * ind.increment;
            const itemCtx = Object.assign({}, ctx, { cell: false, cellHeader: false });

            function itemPara(container, numbered) {
                const extra = {
                    style: 'ListParagraph',
                    indent: numbered ? { left: indentStart, hanging: ind.hanging } : { left: indentStart }
                };
                if (numbered) extra.numbering = { reference: ref, level: level };
                return self._para(container, itemCtx, extra);
            }
            function emptyItem(li) {
                const s = document.createElement('span');
                li.insertBefore(s, li.firstChild);
                return itemPara(s, true);
            }

            Array.from(listEl.children).forEach(function (li) {
                if (li.tagName !== 'LI') return;
                let numbered = true, group = null;
                function flush() {
                    if (!group) return;
                    const g = group;
                    group = null;
                    if (!hasContent(g)) return;
                    items.push(itemPara(g, numbered));
                    numbered = false;
                }
                Array.from(li.childNodes).forEach(function (ch) {
                    if (isInlineNode(ch)) {
                        if (!group) {
                            if (ch.nodeType === 3 && !/\S/.test(ch.nodeValue)) return;
                            group = wrapInline(ch);
                        }
                        group.appendChild(ch);
                        return;
                    }
                    flush();
                    if (ch.nodeType !== 1) return;
                    if (/^(P|H[1-6])$/.test(ch.tagName)) {
                        items.push(itemPara(ch, numbered));
                        numbered = false;
                        return;
                    }
                    if (numbered) { items.push(emptyItem(li)); numbered = false; }
                    if (ch.tagName === 'UL' || ch.tagName === 'OL') {
                        const same = ch.tagName === listEl.tagName;
                        self._renderList(ch, ctx, level + 1, same ? ref : null).forEach(function (x) { items.push(x); });
                    } else {
                        // code / quotes / tables align with the item's text
                        self._renderBlock(ch, Object.assign({}, itemCtx, { boxIndent: indentStart }))
                            .items.forEach(function (x) { items.push(x); });
                    }
                });
                flush();
                if (numbered) items.push(emptyItem(li));
            });
            return items;
        }

        // =====================================================================
        // Quotes — built-in "Quote" style; table form for complex content
        // =====================================================================

        /**
         * Quote formatting on a paragraph:
         *   SIMPLE form — the Quote style carries border + indent for the
         *   document direction; only counter-direction quotes, or paragraphs
         *   whose own direction differs from the quote's, get inline values.
         *   TABLE form — the cell draws the border, so paragraphs cancel it.
         */
        _applyQuoteProps(p, q, paraDir) {
            const b = this._b;
            p.style = 'Quote';
            if (q.inTable) {
                p.border = this._sideNoBorders();
                if (!p.indent) p.indent = { left: 0, right: 0 };
                if (p.numbering) p.spacing = b.spacingTight;
                return;
            }
            if (p.numbering) return;          // list items keep their own indent
            const quoteSide = startSide(q.dir);
            const docSide = startSide(b.docDir);
            if (quoteSide !== docSide) {
                p.border = {};
                p.border[quoteSide] = b.quoteBorder;
                p.border[docSide] = this._noBorder();
            }
            if (q.dir !== b.docDir || paraDir !== b.docDir || q.boxIndent) {
                const ind = b.quoteTextIndent + (q.boxIndent || 0);
                p.indent = startSide(paraDir) === quoteSide
                    ? { left: ind, right: 0 }
                    : { left: 0, right: ind };
            }
        }

        _simpleQuote(bq, ctx) {
            const q = { dir: this._dirOf(bq).dir, inTable: false, boxIndent: ctx.boxIndent || 0 };
            return this._renderBlocks(bq, Object.assign({}, ctx, { quote: q })).items;
        }

        /**
         * Single-cell table whose cell draws the quote border on the quote's
         * start side: ONE straight line from the first to the last line,
         * whatever lists / nested quotes / code the quote contains.
         * The table itself is laid out LTR with PHYSICAL sides, which every
         * renderer reads the same way; the start gap comes from width/indent.
         */
        _quoteTable(bq, ctx) {
            const b = this._b, d = b.d;
            const dir = this._dirOf(bq).dir;
            const depth = ctx.quote && ctx.quote.inTable ? (ctx.quoteDepth || 1) + 1 : 1;
            const side = startSide(dir);
            const avail = ctx.width || b.contentWidth;
            // Outer quotes: border exactly quoteIndent from the start margin (as
            // the simple form), end edge where the centered 98% tables and code
            // boxes end (1% inset). Nested quotes fill their cell.
            const place = depth === 1 ? this._boxPlacement(ctx, side, (ctx.boxIndent || 0) + b.quoteIndent) : null;
            const width = depth === 1 ? place.width : Math.max(1440, avail);

            const cellCtx = Object.assign({}, ctx, {
                quote: { dir: dir, inTable: true }, quoteDepth: depth, boxIndent: 0,
                width: width - b.quotePad, cell: false, cellHeader: false
            });
            const content = this._renderBlocks(bq, cellCtx).items;
            if (!content.length || content[content.length - 1] instanceof d.Table) {
                content.push(new d.Paragraph({
                    style: 'Quote', border: this._sideNoBorders(), spacing: b.spacingTight,
                    bidirectional: dir === 'rtl', children: []
                }));
            }

            const borders = this._allNoBorders();
            borders[side] = b.quoteBorder;
            const margins = { top: 40, bottom: 40, left: 0, right: 0 };
            margins[side] = b.quotePad;
            const none = this._noBorder();

            const opts = {
                width: { size: width, type: d.WidthType.DXA },
                columnWidths: [width],
                borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
                rows: [new d.TableRow({
                    children: [new d.TableCell({
                        width: { size: width, type: d.WidthType.DXA },
                        borders: borders,
                        margins: margins,
                        children: content
                    })]
                })]
            };
            if (depth === 1) {
                // LTR-laid-out table: tblInd is measured from the physical left.
                opts.indent = { size: place.indent, type: d.WidthType.DXA };
            } else if (side === 'right') {
                opts.alignment = d.AlignmentType.RIGHT;
            }
            return new d.Table(opts);
        }

        /**
         * Placement of an LTR-laid-out "box" table (code block, table-form
         * quote) inside the current container.
         * `startOffset` = distance of the box's start edge from the container's
         * start (list-item indent, quote indent); 0 → centered 98% like tables.
         * The end edge always sits 1% in, where 98% tables end.
         * @param {object} ctx
         * @param {'left'|'right'} side - physical start side
         * @param {number} startOffset - twips
         * @returns {{ width: number, indent: number }} tblInd from the physical left
         */
        _boxPlacement(ctx, side, startOffset) {
            const avail = ctx.width || this._b.contentWidth;
            const inset = Math.round(avail * 0.01);
            const s = startOffset > 0 ? startOffset : inset;
            return {
                width: Math.max(1440, avail - s - inset),
                indent: side === 'left' ? s : inset
            };
        }

        // =====================================================================
        // Code blocks — a single-cell box (border + background on the cell)
        // =====================================================================

        _renderCode(pre, ctx) {
            const b = this._b, d = b.d;
            const codeEl = pre.querySelector('code') || pre;
            const lines = [[]];
            (function walk(n, st) {
                if (n.nodeType === 3) {
                    n.nodeValue.split('\n').forEach(function (part, i) {
                        if (i > 0) lines.push([]);
                        if (part) lines[lines.length - 1].push({ text: part, st: st });
                    });
                    return;
                }
                if (n.nodeType !== 1) return;
                if (n.tagName === 'BR') { lines.push([]); return; }
                let ns = st;
                String(n.getAttribute('class') || '').split(/\s+/).forEach(function (c) {
                    if (b.hljs[c]) ns = Object.assign({}, ns, b.hljs[c]);
                });
                for (let c = n.firstChild; c; c = c.nextSibling) walk(c, ns);
            })(codeEl, {});
            while (lines.length > 1 && !lines[lines.length - 1].length) lines.pop();   // trailing newline

            const paragraphs = lines.map(function (segs) {
                const runs = [];
                segs.forEach(function (seg) {
                    const props = {};
                    if (seg.st.color) props.color = seg.st.color;
                    if (seg.st.bold) props.bold = true;
                    if (seg.st.italics) props.italics = true;
                    seg.text.split('\t').forEach(function (piece, k) {
                        if (k > 0) runs.push(new d.TextRun(Object.assign({ children: [new d.Tab()] }, props)));
                        if (piece) runs.push(new d.TextRun(Object.assign({ text: piece }, props)));
                    });
                });
                return new d.Paragraph({ style: 'CodeBlock', bidirectional: false, children: runs });
            });

            const border = this._border(b.T.codeBlockBorder);
            const none = this._noBorder();
            ctx = ctx || {};
            const place = this._boxPlacement(ctx, startSide(this._dirOf(pre).dir), ctx.boxIndent || 0);
            const width = place.width;
            const cellBorders = { top: border, bottom: border, left: border, right: border };

            // Fenced blocks written inside the code (```` md showing ``` examples):
            // a nested one-cell table each, framing the lines (text stays raw).
            // A cell must end with a paragraph, and two tables in a row would
            // merge — empty paragraphs keep them apart.
            let content = paragraphs;
            if ((this._config.codeBlock || {}).nestedFrames !== false) {
                const segs = BidiCore.codeSegments(lines.map(function (sg) {
                    return sg.map(function (x) { return x.text; }).join('');
                }).join('\n'));
                if (segs.some(function (sg) { return sg.nested; })) {
                    const gap = function () { return new d.Paragraph({ style: 'CodeBlock', bidirectional: false, spacing: { before: 0, after: 0, line: 120 }, children: [] }); };
                    const build = function (items, w) {
                        const out = [];
                        items.forEach(function (sg) {
                            if (sg.lines) {
                                for (let k = sg.lines[0]; k <= sg.lines[1]; k++) out.push(paragraphs[k]);
                                return;
                            }
                            if (out.length && out[out.length - 1] instanceof d.Table) out.push(gap());
                            const iw = w - 180;
                            const inner = build(sg.items, iw - 120);
                            if (!inner.length || inner[inner.length - 1] instanceof d.Table) inner.push(gap());
                            out.push(new d.Table({
                                width: { size: iw, type: d.WidthType.DXA },
                                columnWidths: [iw],
                                borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
                                rows: [new d.TableRow({ children: [new d.TableCell({
                                    width: { size: iw, type: d.WidthType.DXA },
                                    borders: cellBorders,
                                    margins: { top: 30, bottom: 30, left: 60, right: 60 },
                                    children: inner
                                })] })]
                            }));
                        });
                        return out;
                    };
                    content = build(segs, width - 180);
                    if (content[content.length - 1] instanceof d.Table) content.push(gap());
                }
            }
            const rows = [];

            // Language bar (as the preview header, without the copy button)
            const opt = this._config.codeBlock || {};
            const lang = BidiCore.codeLanguage(pre);
            const label = opt.showLanguage === false ? '' : (lang || opt.fallbackLabel || '');
            if (label) {
                const T = b.T, lsz = halfPt(T.codeHeaderFontSize || '8pt');
                rows.push(new d.TableRow({
                    children: [new d.TableCell({
                        width: { size: width, type: d.WidthType.DXA },
                        borders: cellBorders,
                        shading: { fill: colorHex(T.codeHeaderBg || '#EDEDED'), type: d.ShadingType.CLEAR, color: 'auto' },
                        margins: { top: 20, bottom: 20, left: 90, right: 90 },
                        children: [new d.Paragraph({
                            style: 'CodeBlock', bidirectional: false,
                            children: [new d.TextRun({
                                text: label, size: lsz, sizeComplexScript: lsz,
                                color: colorHex(T.codeHeaderColor || '#595959')
                            })]
                        })]
                    })]
                }));
            }
            rows.push(new d.TableRow({
                children: [new d.TableCell({
                    width: { size: width, type: d.WidthType.DXA },
                    borders: cellBorders,
                    shading: { fill: colorHex(b.T.codeBlockBg), type: d.ShadingType.CLEAR, color: 'auto' },
                    margins: { top: 90, bottom: 90, left: 90, right: 90 },
                    children: content
                })]
            }));

            return [new d.Table({
                width: { size: width, type: d.WidthType.DXA },
                columnWidths: [width],
                indent: { size: place.indent, type: d.WidthType.DXA },
                borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
                rows: rows
            })];
        }

        // =====================================================================
        // Tables
        // =====================================================================

        _renderTable(table, ctx) {
            const b = this._b, d = b.d, T = b.T, self = this;
            const rows = Array.from(table.rows);           // own rows only, not nested tables'
            const colCount = Math.max(1, rows.reduce(function (mx, tr) {
                return Math.max(mx, Array.from(tr.cells).reduce(function (s, c) { return s + (c.colSpan || 1); }, 0));
            }, 0));
            const avail = ctx.width || b.contentWidth;
            const boxIndent = ctx.boxIndent || 0;
            const full = boxIndent > 0 ? avail - boxIndent : avail;
            // table width from the setting ('98%' / 'auto' …) and column widths from the
            // content — the same shares as the PDF, .doc and HTML outputs
            const fit = BidiCore.tableColumnShares(table, { width: full / 20, fontSize: BidiCore.cssPt(T.bidiFontSize) || 12,
                                                            tableWidth: this._config.tableWidth });
            const tableW = Math.round(full * fit.fraction);
            const colWs = fit.shares.slice(0, colCount).map(function (s) { return Math.max(300, Math.floor(s * tableW)); });
            while (colWs.length < colCount) colWs.push(Math.floor(tableW / colCount));
            const spanW = function (cell, span) {
                const c0 = fit.cols.has(cell) ? fit.cols.get(cell) : 0;
                let w = 0;
                for (let k = 0; k < span; k++) w += colWs[c0 + k] || 0;
                return w;
            };
            const border = this._border(T.tableBorder);
            const cellBorders = { top: border, bottom: border, left: border, right: border };
            const cellMargin = { top: 20, bottom: 20, left: 108, right: 108 };

            const docxRows = rows.map(function (tr) {
                const cells = Array.from(tr.cells);
                const inHead = !!tr.parentElement && tr.parentElement.tagName === 'THEAD';
                const allTh = cells.length > 0 && cells.every(function (c) { return c.tagName === 'TH'; });
                return new d.TableRow({
                    tableHeader: inHead || undefined,
                    children: cells.map(function (cell) {
                        const span = cell.colSpan || 1;
                        const isHead = cell.tagName === 'TH' || inHead || allTh;
                        const align = cell.getAttribute('align') ||
                            (/text-align\s*:\s*(\w+)/i.exec(cell.getAttribute('style') || '') || [])[1];
                        const cctx = Object.assign({}, ctx, {
                            cell: true, cellHeader: isHead, cellAlign: align, quote: null, boxIndent: 0,
                            width: spanW(cell, span) - cellMargin.left - cellMargin.right
                        });
                        const content = self._renderBlocks(cell, cctx).items;
                        if (!content.length || content[content.length - 1] instanceof d.Table) {
                            content.push(new d.Paragraph({
                                style: 'TableParagraph', bidirectional: self._dirOf(cell).dir === 'rtl', children: []
                            }));
                        }
                        const opts = {
                            width: { size: spanW(cell, span), type: d.WidthType.DXA },
                            borders: cellBorders,
                            verticalAlign: d.VerticalAlign.CENTER,
                            margins: cellMargin,
                            children: content
                        };
                        if (span > 1) opts.columnSpan = span;
                        if ((cell.rowSpan || 1) > 1) opts.rowSpan = cell.rowSpan;
                        if (isHead) opts.shading = { fill: colorHex(T.tableHeaderBg), type: d.ShadingType.CLEAR, color: 'auto' };
                        return new d.TableCell(opts);
                    })
                });
            });

            return new d.Table({
                width: { size: colWs.reduce(function (s, x) { return s + x; }, 0), type: d.WidthType.DXA },
                columnWidths: colWs,
                layout: d.TableLayoutType.FIXED,
                alignment: boxIndent > 0 ? undefined : d.AlignmentType.CENTER,
                indent: boxIndent > 0 ? { size: boxIndent, type: d.WidthType.DXA } : undefined,
                visuallyRightToLeft: b.docIsRTL && !b.plan.ltrTables.has(table),
                rows: docxRows
            });
        }

        // =====================================================================
        // Header / Footer
        // =====================================================================

        /** Paging labels: explicit footer labels › builder labels › by direction. */
        _pagingLabels(labels) {
            return labels || this._config.pagingLabels || DEFAULT_PAGING_LABELS[this._b.hfDir];
        }

        _pageNumberRuns(labels) {
            const b = this._b, d = b.d;
            labels = this._pagingLabels(labels);
            return [].concat(
                this._textRuns(labels.page + ' '),
                [new d.TextRun({ children: [d.PageNumber.CURRENT] })],
                this._textRuns(' ' + labels.from + ' '),
                [new d.TextRun({ children: [d.PageNumber.TOTAL_PAGES] })]
            );
        }

        _hfPara(children, extra) {
            const b = this._b;
            return new b.d.Paragraph(Object.assign({
                bidirectional: b.hfIsRTL,
                alignment: b.d.AlignmentType.CENTER,
                spacing: { before: 0, after: 0 },
                children: children
            }, extra || {}));
        }

        /** Header/footer cell; dividers use logical start/end (follow the table direction). */
        _hfCell(pct, borders, paragraph) {
            const b = this._b, d = b.d, none = this._noBorder();
            const w = Math.round(b.contentWidth * parseFloat(pct) / 100);
            return {
                width: w,
                cell: new d.TableCell({
                    width: { size: w, type: d.WidthType.DXA },
                    borders: Object.assign({ top: none, bottom: none, start: none, end: none }, borders),
                    verticalAlign: d.VerticalAlign.CENTER,
                    margins: { top: 40, bottom: 40, left: 58, right: 58 },
                    children: [paragraph]
                })
            };
        }

        _hfTable(cells) {
            const b = this._b, d = b.d;
            const widths = cells.map(function (c) { return c.width; });
            return new d.Table({
                width: { size: widths.reduce(function (a, x) { return a + x; }, 0), type: d.WidthType.DXA },
                columnWidths: widths,
                alignment: d.AlignmentType.CENTER,
                visuallyRightToLeft: b.hfIsRTL,
                borders: this._allNoBorders(),
                rows: [new d.TableRow({ children: cells.map(function (c) { return c.cell; }) })]
            });
        }

        /**
         * Custom header/footer from HTML (BidiCore.parseHeaderFooter model):
         * tables with per-side borders, shading, padding and widths; text with
         * the same BiDi runs as the body; {page}/{pages} as PAGE / NUMPAGES.
         * Left/right in CSS are physical; in an RTL table Word's cell borders
         * and paragraph alignment are logical, so they are swapped there.
         */
        _hfFromHtml(cfg) {
            const self = this, b = this._b, d = b.d, rtl = b.hfIsRTL, dir = b.hfDir;
            const model = BidiCore.parseHeaderFooter(cfg.html);
            const values = {
                page: function (n, doc) { const sp = doc.createElement('span'); sp.setAttribute('data-hf-field', 'PAGE'); return sp; },
                pages: function (n, doc) { const sp = doc.createElement('span'); sp.setAttribute('data-hf-field', 'NUMPAGES'); return sp; },
                date: BidiCore.hfDate(dir, cfg.dateLocale),
                title: cfg.title != null ? cfg.title : this._docTitle()
            };
            const STYLE = { solid: d.BorderStyle.SINGLE, dashed: d.BorderStyle.DASHED, dotted: d.BorderStyle.DOTTED, double: d.BorderStyle.DOUBLE };
            const border = function (bd) {
                if (!bd) return self._noBorder();
                return { style: STYLE[bd.style] || d.BorderStyle.SINGLE, size: Math.max(2, Math.round(bd.width * 8)),
                         color: BidiCore.cssColorHex(bd.color) || '000000' };
            };
            const align = function (a) {
                if (a === 'center') return d.AlignmentType.CENTER;
                if (a === 'justify') return d.AlignmentType.BOTH;
                // w:jc left/right are logical (start/end) in a bidi paragraph
                if (a === 'left') return rtl ? d.AlignmentType.RIGHT : d.AlignmentType.LEFT;
                if (a === 'right') return rtl ? d.AlignmentType.LEFT : d.AlignmentType.RIGHT;
                return d.AlignmentType.LEFT;                   // start
            };
            const para = function (p) {
                const st = p.style || {};
                const el = BidiCore.hfFields(p.el, values);
                const t = el.textContent;
                let base = dir;                                // a line wholly in the other script
                if (!BidiCore.hasMix(t)) {
                    if (dir === 'rtl' && BidiCore.hasLatin(t) && !BidiCore.hasRtlLetter(t)) base = 'ltr';
                    else if (dir === 'ltr' && BidiCore.hasRtlLetter(t) && !BidiCore.hasLatin(t)) base = 'rtl';
                }
                const fmt = {};
                if (st.bold) fmt.bold = true;
                if (st.italic) fmt.italics = true;
                if (st.color && BidiCore.cssColorHex(st.color)) fmt.color = BidiCore.cssColorHex(st.color);
                if (st.size > 0) fmt.size = Math.round(st.size * 2);
                return new d.Paragraph({
                    bidirectional: rtl, alignment: align(st.align), spacing: { before: 0, after: 0 },
                    children: self._inlineRuns(el, base, fmt)
                });
            };
            const out = [];
            model.blocks.forEach(function (bl) {
                if (bl.type === 'para') { out.push(para({ style: bl.style, el: bl.el })); return; }
                const widths = BidiCore.hfColumnWidths(bl).map(function (pc) { return Math.round(b.contentWidth * pc / 100); });
                const rows = bl.rows.map(function (row) {
                    let col = 0;
                    return new d.TableRow({ children: row.cells.map(function (c) {
                        let w = 0;
                        for (let k = 0; k < c.colspan; k++) w += widths[col + k] || 0;
                        col += c.colspan;
                        const st = c.style, pd = st.padding || {};
                        const tw = function (v, dflt) { return Math.round((isNaN(v) || v === undefined ? dflt : v) * 20); };
                        const bL = border(st.border.left || null), bR = border(st.border.right || null);
                        const opts = {
                            width: { size: w, type: d.WidthType.DXA },
                            columnSpan: c.colspan > 1 ? c.colspan : undefined,
                            verticalAlign: st.valign === 'top' ? d.VerticalAlign.TOP : st.valign === 'bottom' ? d.VerticalAlign.BOTTOM : d.VerticalAlign.CENTER,
                            borders: { top: border(st.border.top || null), bottom: border(st.border.bottom || null),
                                       start: rtl ? bR : bL, end: rtl ? bL : bR },
                            margins: { top: tw(pd.top, 2), bottom: tw(pd.bottom, 2),
                                       left: tw(rtl ? pd.right : pd.left, 3), right: tw(rtl ? pd.left : pd.right, 3) },
                            children: c.paras.length ? c.paras.map(para) : [new d.Paragraph({ children: [] })]
                        };
                        const bg = st.bg && BidiCore.cssColorHex(st.bg);
                        if (bg) opts.shading = { fill: bg, type: d.ShadingType.CLEAR, color: 'auto' };
                        return new d.TableCell(opts);
                    }) });
                });
                out.push(new d.Table({
                    width: { size: b.contentWidth, type: d.WidthType.DXA },
                    columnWidths: widths, alignment: d.AlignmentType.CENTER,
                    visuallyRightToLeft: rtl, borders: self._allNoBorders(), rows: rows
                }));
            });
            // a header/footer must end with a paragraph
            if (!out.length || out[out.length - 1] instanceof d.Table) out.push(this._hfEndPara());
            return out;
        }

        /** {title}: the option, else the content's first heading. */
        _docTitle() {
            const m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(this._contentHtml || '');
            return m ? m[1].replace(/<[^>]+>/g, '').trim() : '';
        }

        /** Header logo: an image when the value is an image source, else text. */
        _logoRuns(cfg) {
            if (typeof ImageCore !== 'undefined' && ImageCore.looksLikeImage(cfg.logo, this._images)) {
                const rec = this._images.get(cfg.logo);
                if (rec) {
                    // logoHeight, narrowed to fit the logo column
                    const h = BidiCore.lengthToPt(cfg.logoHeight || '1cm') * 96 / 72;
                    const cellW = this._b.contentWidth / 15 * (parseFloat(this._config.headerColumns.logo) || 10) / 100 - 12;
                    return [this._imageRun(cfg.logo, ImageCore.fit(h * rec.width / rec.height, h, cellW, 0), 'logo')];
                }
            }
            return this._textRuns(cfg.logo);
        }

        _buildHeaders() {
            const d = this._b.d, cfg = this._config.header, B = this._config.borders;
            if (cfg.mode === 'html') return { default: new d.Header({ children: this._hfFromHtml(cfg) }) };
            if (cfg.mode === 'simple') {
                return { default: new d.Header({ children: [
                    this._hfPara(this._textRuns(cfg.text), { border: { bottom: this._border(B.headerBottom, 4) } })
                ] }) };
            }
            if (cfg.mode === 'structured') {
                const cols = this._config.headerColumns;
                const bottom = this._border(B.headerBottom), div = this._border(B.headerCellDivider);
                return { default: new d.Header({ children: [this._hfTable([
                    this._hfCell(cols.logo, { bottom: bottom }, this._hfPara(this._logoRuns(cfg))),
                    this._hfCell(cols.title, { bottom: bottom, start: div, end: div }, this._hfPara(this._textRuns(cfg.title))),
                    this._hfCell(cols.edition, { bottom: bottom }, this._hfPara(this._textRuns(cfg.edition)))
                ]), this._hfEndPara()] }) };
            }
            return undefined;
        }

        /**
         * A header/footer (like a table cell) must END with a paragraph, so one
         * after the table is unavoidable. It is made 1pt high (mark size 1pt,
         * exact 1pt line, no spacing) so it takes no visible room; with
         * "Show ¶" on, Word still shows its mark.
         */
        _hfEndPara() {
            const b = this._b, d = b.d;
            return new d.Paragraph({
                bidirectional: b.hfIsRTL,
                spacing: { before: 0, after: 0, line: 20, lineRule: d.LineRuleType.EXACT },
                run: { size: 2, sizeComplexScript: 2 },
                children: []
            });
        }

        _buildFooters() {
            const b = this._b, d = b.d, cfg = this._config.footer, B = this._config.borders;
            if (cfg.mode === 'html') return { default: new d.Footer({ children: this._hfFromHtml(cfg) }) };
            if (cfg.mode === 'simple') {
                return { default: new d.Footer({ children: [
                    this._hfPara(this._pageNumberRuns(cfg.pagingLabels), { border: { top: this._border(B.footerTop, 4) } })
                ] }) };
            }
            if (cfg.mode === 'structured') {
                const cols = this._config.footerColumns;
                const top = this._border(B.footerTop);
                const author = this._textRuns(cfg.author);
                if (cfg.link) {
                    author.push(new d.TextRun({ text: ' | ', rightToLeft: b.hfIsRTL || undefined }));
                    author.push(new d.ExternalHyperlink({
                        link: cfg.link,
                        children: [new d.TextRun({ text: cfg.link.replace(/^https?:\/\//, ''), style: 'Hyperlink' })]
                    }));
                }
                return { default: new d.Footer({ children: [this._hfTable([
                    // one divider, on the author cell's END (inner) side
                    this._hfCell(cols.author, { top: top, end: top },
                        this._hfPara(author, { alignment: d.AlignmentType.LEFT, indent: { left: 200 } })),
                    this._hfCell(cols.paging, { top: top }, this._hfPara(this._pageNumberRuns(cfg.pagingLabels)))
                ]), this._hfEndPara()] }) };
            }
            return undefined;
        }

        _callbackContext() {
            const b = this._b, self = this;
            return {
                config: this._config,
                direction: b.hfDir,              // header/footer direction
                isRTL: b.hfIsRTL,
                docDirection: b.docDir,          // content direction
                pagingLabels: this._pagingLabels(this._config.footer.pagingLabels),
                border: function (css) { return self._border(css || 'solid windowtext 1pt'); },
                noBorder: function () { return self._noBorder(); },
                pageNumberRuns: function (labels) { return self._pageNumberRuns(labels); },
                textRuns: function (text) { return self._textRuns(text); }
            };
        }

        // =====================================================================
        // Styles — built-in Word styles configured from the template options
        // =====================================================================

        _buildStyles() {
            const b = this._b, d = b.d, T = b.T;
            const isRTL = b.docIsRTL;
            const bodyAlign = this._align(T.textAlign, b.docDir) || d.AlignmentType.BOTH;
            const size = { size: halfPt(T.fontSize), sizeComplexScript: halfPt(T.bidiFontSize) };

            const heading = function (h, lvl) {
                return {
                    run: {
                        bold: true, italics: !!h.italic, color: colorHex(h.color),
                        size: halfPt(h.size), sizeComplexScript: halfPt(h.size)
                    },
                    paragraph: {
                        spacing: Object.assign({}, b.spacing, {
                            before: Math.round((T.headingMarginTopBase - lvl * 2) * 20),
                            after: twip(T.headingMarginBottom)
                        }),
                        keepNext: true, keepLines: true,
                        bidirectional: isRTL, alignment: bodyAlign, outlineLevel: lvl - 1
                    }
                };
            };

            const quoteBorder = {};
            quoteBorder[startSide(b.docDir)] = b.quoteBorder;

            const defaults = {
                document: {
                    run: Object.assign({
                        font: { ascii: T.latinFont, hAnsi: T.latinFont, cs: T.bidiFont, eastAsia: T.latinFont },
                        language: { value: 'en-US', bidirectional: bidiLang(T.bidiLanguage) }
                    }, size),
                    paragraph: { spacing: b.spacing }
                },
                listParagraph: {
                    paragraph: { spacing: Object.assign({}, b.spacingTight, { after: twip(T.listItemSpaceAfter || '1.5pt') }),
                                 bidirectional: isRTL, alignment: bodyAlign }
                },
                hyperlink: { run: { color: colorHex(T.linkColor), underline: { type: d.UnderlineType.SINGLE } } }
            };
            T.headings.forEach(function (h, i) { defaults['heading' + (i + 1)] = heading(h, i + 1); });

            return {
                default: defaults,
                paragraphStyles: [
                    {
                        id: 'Normal', name: 'Normal', quickFormat: true,
                        run: size,
                        paragraph: { spacing: b.spacing, alignment: bodyAlign, bidirectional: isRTL }
                    },
                    {
                        id: 'Quote', name: 'Quote', basedOn: 'Normal', next: 'Normal', quickFormat: true,
                        run: { italics: true, color: colorHex(T.quoteTextColor) },
                        paragraph: { border: quoteBorder, indent: { left: b.quoteTextIndent } }
                    },
                    {
                        id: 'CodeBlock', name: 'Code Block', basedOn: 'Normal', next: 'Normal',
                        run: { font: b.codeFont, size: b.codeSize, sizeComplexScript: b.codeSize },
                        paragraph: {
                            spacing: Object.assign({}, b.spacingTight, { before: 0, after: 0 }),
                            bidirectional: false, alignment: d.AlignmentType.LEFT
                        }
                    },
                    {
                        id: 'TableParagraph', name: 'Table Text', basedOn: 'Normal', next: 'TableParagraph',
                        paragraph: { spacing: b.spacingTight }
                    },
                    // table of contents: Word's built-in names, so the gallery shows
                    // "TOC Heading" and "TOC 1…3" (the same look as WordHtmlBuilder)
                    {
                        id: 'TOCHeading', name: 'TOC Heading', basedOn: 'Normal', next: 'Normal', quickFormat: true,
                        run: { bold: true, color: colorHex(T.tocHeadingColor || '#2F5496'),
                               size: halfPt(T.tocHeadingFontSize || '14pt'), sizeComplexScript: halfPt(T.tocHeadingFontSize || '14pt') },
                        paragraph: { spacing: { before: 240, after: 120 }, keepNext: true, bidirectional: isRTL, alignment: d.AlignmentType.LEFT }
                    }
                ].concat([1, 2, 3, 4, 5, 6].map(function (lvl) {
                    return {
                        id: 'TOC' + lvl, name: 'toc ' + lvl, basedOn: 'Normal', next: 'Normal',
                        paragraph: { spacing: { before: 0, after: 100 }, indent: { start: (lvl - 1) * 220 },
                                     bidirectional: isRTL, alignment: d.AlignmentType.LEFT }
                    };
                }))
            };
        }
    }


    // =========================================================================
    // Export (UMD)
    // =========================================================================
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { DocxBuilder, DocxBuilderError };
    } else if (typeof define === 'function' && define.amd) {
        define([], function () { return { DocxBuilder, DocxBuilderError }; });
    } else {
        global.DocxBuilder = DocxBuilder;
        global.DocxBuilderError = DocxBuilderError;
    }

})(typeof window !== 'undefined' ? window : this);
