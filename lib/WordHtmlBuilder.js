/**
 * WordHtmlBuilder - Fluent Word-Compatible HTML Generation Library
 * =================================================================
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
 * Generates MS Word-compatible HTML (.doc) with MSO-specific header/footer
 * using hidden table definitions (mso-element:header / mso-element:footer).
 * Works entirely client-side — no server, no CORS issues.
 * 
 * The generated HTML uses MSO (Microsoft Office) proprietary attributes
 * that Word understands for rendering headers, footers, page numbers,
 * and section formatting.
 * 
 * ─────────────────────────────────────────────────────────────────────
 * KEY FEATURES
 * ─────────────────────────────────────────────────────────────────────
 * 
 * Core:
 *   - Fluent/chainable API consistent with DocxBuilder and PdfBuilder
 *   - Injects MSO-compatible base template (styles, fonts, XML namespaces)
 *   - Automatic <br> to <p> conversion for proper Word paragraph handling
 *   - Automatic RTL/LTR direction detection with per-element overrides
 * 
 * Direction (BidiCore — the same decisions in all four builders):
 *   - Document: the direction of the first text block (tables only when there
 *     is no prose); .setDirection('rtl' | 'ltr') overrides it
 *   - Blocks: paragraphs, headings, list items (each by its own text), quotes
 *     and table cells get their own direction when it differs
 *   - Runs: counter-direction words, numbers and formulas become isolates
 *   - Code blocks: always LTR regardless of content
 *
 * Header/Footer direction: 'auto' (default) follows the document; 'rtl' /
 * 'ltr' fix it; see setHeaderFooterDirection().
 *
 * The .doc file is MHTML (MIME multipart): the Word HTML, its images and the
 * header/footer part in one file, as Word itself saves "Single File Web Page".
 * Microsoft Word only; Save As .docx on first opening is a good habit.
 *
 * Known limitations:
 *   - Table of contents (setToc): the page numbers are filled by Word —
 *     right-click the table → Update Field → Update entire table (or F9).
 *
 * Header (3 modes):
 *   - Simple: centered text with bottom border
 *   - Structured: 3-column table (logo | title | edition)
 *   - Callback: full control via user-provided function
 * 
 * Footer (3 modes):
 *   - Simple: centered page numbers using MSO field codes
 *   - Structured: 2-column table (author info | page numbers)
 *   - Callback: full control via user-provided function
 * 
 * Output:
 *   - toHtml() returns complete HTML string ready for Blob download
 *   - save() downloads as .doc file (no external dependency)
 * 
 * ─────────────────────────────────────────────────────────────────────
 * USAGE EXAMPLES
 * ─────────────────────────────────────────────────────────────────────
 * 
 * @example Basic Usage (direction auto-detected)
 * const html = WordHtmlBuilder.create()
 *     .setHeader('Document Title')
 *     .setFooter(true)                    // «صفحه X از Y» (labels follow header/footer direction)
 *     .addFromHtml(previewInnerHTML)      // preview code-block wrappers are removed automatically
 *     .toHtml();
 *
 * @example Structured Header/Footer
 * const html = WordHtmlBuilder.create()
 *     .setHeader({
 *         logo: 'Logo Text',
 *         title: 'Document Title',
 *         edition: 'Draft v1'
 *     })
 *     .setFooter({
 *         author: 'IT Center',
 *         link: 'https://example.com',
 *         pagingLabels: { page: 'Page', from: 'of' }   // optional; default by direction
 *     })
 *     .addFromHtml(previewInnerHTML)
 *     .toHtml();
 *
 * @example Header/Footer direction — independent of the content
 * // 'rtl' (default): logo/author on the right, «صفحه X از Y» — also for English documents
 * // 'ltr'          : mirrored, "Page X of Y"
 * // 'auto'         : follow the document direction
 * const html = WordHtmlBuilder.create({ headerFooterDirection: 'ltr' })   // at creation …
 *     .setHeaderFooterDirection('ltr')                                    // … or with the setter
 *     .setHeader({ logo: 'Logo', title: 'Technical Report', edition: 'v1.2' })
 *     .setFooter({ author: 'IT Center' })
 *     .addFromHtml(previewInnerHTML)
 *     .toHtml();
 *
 * @example Manual Direction Override (content)
 * const html = WordHtmlBuilder.create()
 *     .setDirection('rtl')          // 'auto' (default) | 'rtl' | 'ltr'
 *     .setHeader('Document Title')
 *     .addFromHtml(previewInnerHTML)
 *     .toHtml();
 *
 * @example Code blocks — language bar
 * WordHtmlBuilder.create()
 *     .setCodeBlockOptions({
 *         showLanguage: true,       // false → no bar
 *         fallbackLabel: 'code',    // no language class → 'code'; '' → no bar for those
 *         rtlFont: 'code',          // RTL text in code: 'code' font | 'document' bidi font
 *         nestedFrames: true        // frame fenced blocks written inside a code block
 *     })
 *
 * @example Fonts, sizes and page (no need to edit the template file)
 * const html = WordHtmlBuilder.create()
 *     .setFonts({ bidi: 'Vazirmatn', latin: 'Calibri', code: 'Consolas' })
 *     .setFontSizes({ latin: 11, bidi: 12, code: 10 })
 *     .setPage({ size: 'A4', orientation: 'landscape', margin: '2cm',
 *                headerMargin: '0.7cm', footerMargin: '0.7cm' })
 *     .addFromHtml(previewInnerHTML)
 *     .toHtml();
 *
 * // Any other createMsoTemplate.DEFAULTS key (colors, quote, code, spacing …):
 * WordHtmlBuilder.create()
 *     .setTemplateOptions({ quoteBorderColor: '#2F5496', codeHeaderBg: '#E7E6E6' });
 *
 * // Or as defaults for a whole app:
 * const make = () => WordHtmlBuilder.create({ template: { bidiFont: 'Vazirmatn' } });
 *
 * @example Builder-level styles
 * WordHtmlBuilder.create()
 *     .setStyles({
 *         endPunctuation: ['.', '!', '?'],     // kept outside a trailing English run
 *         borders: { headerBottom: 'solid black 0.5pt' },
 *         headerColumns: { logo: '15%', title: '70%', edition: '15%' },
 *         footerColumns: { author: '75%', paging: '25%' },
 *         pagingLabels: { page: 'صفحه', from: 'از' }   // for every footer
 *     });
 *
 * @example With Callback
 * const html = WordHtmlBuilder.create()
 *     .setHeaderFooterCallback((ctx) => ({
 *         // ctx: { config, direction (header/footer), docDirection,
 *         //        pagingLabels, buildPageNumberHtml(labels), hfText(text) }
 *         headerHtml: '<p>' + ctx.hfText('My Custom Header') + '</p>',
 *         footerHtml: '<p>' + ctx.buildPageNumberHtml() + '</p>'
 *     }))
 *     .addFromHtml(previewInnerHTML)
 *     .toHtml();
 *
 * @example Download as .doc
 * const html = WordHtmlBuilder.create()
 *     .setHeader('Title')
 *     .addFromHtml(previewInnerHTML)
 *     .toHtml();
 * const blob = new Blob([html], { type: 'application/vnd.ms-word' });
 *
 * ─────────────────────────────────────────────────────────────────────
 * REQUIREMENTS
 * ─────────────────────────────────────────────────────────────────────
 * 
 * @requires BidiCore - Shared direction/BiDi engine (BidiCore.js), also used
 *           by DocxBuilder so both outputs make identical decisions.
 *
 * @requires createMsoTemplate - Factory function that returns the base
 *           HTML template string with MSO styles, XML namespaces, and
 *           font definitions. Loaded from msOfficeWordHtmlTemplate.js.
 *           WordHtmlBuilder calls this internally — no manual wiring needed.
 */

(function(global) {
    'use strict';

    // Shared configuration surface (setters, validation, images, content)
    const BuilderBase = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
        ? require('./BuilderBase.js')
        : global.BuilderBase;
    if (!BuilderBase) {
        throw new Error('WordHtmlBuilder requires BuilderBase.js — load it before WordHtmlBuilder.js');
    }


    // =========================================================================
    // Default Configuration
    // =========================================================================
    const DEFAULTS = {
        direction: 'auto',       // 'auto' | 'rtl' | 'ltr'
                                 // 'auto' = detect from content (default)

        // BiDi end-of-block punctuation that should render at the logical
        // end (left edge in an RTL block) instead of inside the trailing
        // LTR isolate. Default: only the period. Add '?', '!', '\u2026', '\u061F'
        // as needed, or set to [] to disable the behavior entirely.
        endPunctuation: ['.'],

        // Code blocks: language bar above the code (like the preview header,
        // without the copy button). Language comes from the code's own
        // `language-xxx` class (BidiCore.codeLanguage).
        codeBlock: {
            showLanguage: true,     // false → no language bar
            fallbackLabel: 'code',  // label when no language; '' → no bar then
            rtlFont: 'code',        // RTL text in code: 'code' font | 'document' bidi font
            nestedFrames: true      // frame fenced blocks written inside a code block
        },




        // Header/footer layout direction — independent of the content:
        // a letterhead belongs to the organization, not to the text.

        // Paging labels for every footer; null → by header/footer direction
        // (rtl: «صفحه … از …», ltr: "Page … of …"). setFooter() may override.
        pagingLabels: null,

        // Header config
        header: {
            mode: 'none'    // 'none', 'simple', 'structured', 'callback'
        },

        // Footer config
        footer: {
            mode: 'none'    // 'none', 'simple', 'structured', 'callback'
        },

        // Template (styling) overrides passed to createMsoTemplate at toHtml().
        // Holds OVERRIDES ONLY — the defaults live in createMsoTemplate.DEFAULTS
        // (single source of truth). Fill via setFonts / setFontSizes / setPage /
        // setTemplateOptions, or create({ template: { bidiFont: 'Vazirmatn' } }).
        template: {}
    };


    /** Strip characters that could break out of a CSS string/declaration. */
    function cssSafe(value, what) {
        const v = String(value).replace(/["';{}<>\\]/g, '').trim();
        if (!v) throw new WordHtmlBuilderError('Invalid ' + what + ': ' + value);
        return v;
    }


    const DEFAULT_PAGING_LABELS = BuilderBase.DEFAULT_PAGING_LABELS;

    // Shared direction/BiDi engine (single source of truth for all rules).
    const BidiCore = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
        ? require('./BidiCore.js')
        : global.BidiCore;
    if (!BidiCore) {
        throw new Error('WordHtmlBuilder requires BidiCore.js — load it before WordHtmlBuilder.js');
    }

    /** Split a paragraph's inner HTML on <br> into separate <p> elements. */
    function splitOnBr(innerHtml) {
        return innerHtml
            .split('<br>')
            .map(function(part) { return part.trim(); })
            .filter(function(part) { return part.length > 0; })
            .map(function(part) { return '<p>' + part + '</p>'; })
            .join('');
    }

    // =========================================================================
    // MHTML (multipart/related) — text only, no zip library needed
    // =========================================================================

    /** quoted-printable (RFC 2045) of a UTF-8 string: CRLF lines, soft breaks < 76 */
    function quotedPrintable(text) {
        const bytes = new TextEncoder().encode(String(text).replace(/\r\n/g, '\n'));
        const out = [];
        let line = '';
        const flush = function (soft) { out.push(line + (soft ? '=' : '')); line = ''; };
        for (let i = 0; i < bytes.length; i++) {
            const b = bytes[i];
            if (b === 10) {
                if (/ $/.test(line)) line = line.slice(0, -1) + '=20';
                flush(false);
                continue;
            }
            const enc = (b >= 33 && b <= 126 && b !== 61) || b === 32 ? String.fromCharCode(b)
                : '=' + (b < 16 ? '0' : '') + b.toString(16).toUpperCase();
            if (line.length + enc.length > 75) flush(true);
            line += enc;
        }
        if (/ $/.test(line)) line = line.slice(0, -1) + '=20';
        out.push(line);
        return out.join('\r\n');
    }

    /** parts: [{ loc, type, qp: text } | { loc, type, b64: base64 }] → MHTML text */
    function buildMhtml(parts) {
        const bnd = '----=_NextPart_WordHtmlBuilder.' + Date.now().toString(16);
        const out = ['MIME-Version: 1.0', 'Content-Type: multipart/related; boundary="' + bnd + '"', '',
                     'This document is a Single File Web Page, also known as a Web Archive file.', ''];
        parts.forEach(function (p) {
            out.push('--' + bnd, 'Content-Location: ' + p.loc,
                'Content-Transfer-Encoding: ' + (p.b64 !== undefined ? 'base64' : 'quoted-printable'),
                'Content-Type: ' + p.type, '',
                p.b64 !== undefined ? p.b64.replace(/(.{76})/g, '$1\r\n').replace(/\r\n$/, '') : quotedPrintable(p.qp), '');
        });
        out.push('--' + bnd + '--', '');
        return out.join('\r\n');
    }

    // =========================================================================
    // WordHtmlBuilderError - Custom Error Class
    // =========================================================================
    class WordHtmlBuilderError extends Error {
        /**
         * @param {string} message
         * @param {Error|null} cause
         */
        constructor(message, cause = null) {
            super(message);
            this.name = 'WordHtmlBuilderError';
            this.cause = cause;
        }
    }


    // =========================================================================
    // WordHtmlBuilder - Main Class
    // =========================================================================
    class WordHtmlBuilder extends BuilderBase {

        /**
         * Create a new WordHtmlBuilder instance
         * @param {object} config - Configuration overrides
         */
        constructor(config = {}) {
            super(config, { defaults: DEFAULTS, Error: WordHtmlBuilderError });
            // Per-build state, recomputed at the start of every toHtml() call.
            // The configured direction ('auto'|'rtl'|'ltr') is never overwritten,
            // so reusing one builder for several documents re-detects each time.
            this._resolvedDir = null;     // 'rtl' | 'ltr'
            this._contentIsRTL = false;   // does the actual content contain RTL?
            // Images (ImageCore): registered sources + resolved bytes, and the
            // MHTML part table of the build in progress (null for toHtml()).
            this._mht = null;
        }

        /**
         * Static factory method
         * @param {object} config - Configuration overrides
         * @returns {WordHtmlBuilder}
         */
        static create(config = {}) {
            return new WordHtmlBuilder(config);
        }

        // =====================================================================
        // Private Utilities
        // =====================================================================


        /**
         * Escape HTML special characters
         * @param {string} str
         * @returns {string}
         * @private
         */
        _escapeHtml(str) {
            if (!str) return '';
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        /**
         * Whether the resolved document direction is RTL
         * @returns {boolean}
         * @private
         */
        _isRTL() {
            const dir = this._resolvedDir || this._config.direction;
            return dir === 'rtl';
        }

        /**
         * Get dir attribute value
         * @returns {string}
         * @private
         */
        _dirAttr() {
            return this._isRTL() ? 'rtl' : 'ltr';
        }

        /**
         * Convert <br> inside <p> tags to separate <p> paragraphs.
         * Word handles <p> much better than <br> for line spacing.
         * @param {HTMLElement} root - parsed body container (mutated in place)
         * @private
         */
        _convertLineBreaksToParagraphs(root) {
            root.querySelectorAll('p').forEach(function(p) {
                if (p.innerHTML.includes('<br>')) {
                    p.outerHTML = splitOnBr(p.innerHTML);
                }
            });
        }

        /**
         * Non-browser fallback of _convertLineBreaksToParagraphs (regex-based).
         * @param {string} html
         * @returns {string}
         * @private
         */
        _convertLineBreaksToParagraphsString(html) {
            return html.replace(/<p>(.*?)<\/p>/gis, function(match, content) {
                return content.includes('<br>') ? splitOnBr(content) : match;
            });
        }


        /**
         * Convert <blockquote> elements to Word's built-in "Quote" style (MsoQuote).
         * Word's Style gallery does not expose <blockquote>; it recognizes only
         * the "Quote" style, i.e. the MsoQuote class. Two output forms:
         *
         *   SIMPLE — text-only quotes (the common case): plain p.MsoQuote
         *            paragraphs; border/indent come from the Quote style, so the
         *            user can restyle, set to Normal, or delete them in Word.
         *   TABLE  — quotes containing lists, nested quotes, code blocks or
         *            tables: a single-cell table whose cell draws one straight
         *            border (a paragraph border would break at every indent).
         *
         * Must run AFTER direction overrides (a counter-direction quote's
         * direction is inline on the blockquote by then) and before
         * _separateAdjacentBlocks (table-form quotes are tables).
         *
         * @param {HTMLElement} root - parsed body container (mutated in place)
         * @private
         */
        _convertBlockquotesToQuoteParagraphs(root) {
            const docIsRTL = this._isRTL();
            // Border/indent values come from the template options (single source
            // of truth); literals are only a fallback for custom factories.
            const T = this.getTemplateOptions();
            const BORDER = 'solid ' + (T.quoteBorderColor || '#C07030') + ' ' + (T.quoteBorderWidth || '3.5pt');
            const INDENT = T.quoteIndent || '14.15pt';
            const PAD = T.quotePadding || '12pt';

            // Outer quote tables end where 98%-wide tables and <pre> end: the
            // start indent is taken OUT of the 98% (a plain 98% plus the indent
            // would overflow the end margin). Nested quotes fill their cell.
            let OUTER_WIDTH = '98%';
            try {
                const cw = BidiCore.contentWidthPt(T);
                const pct = (0.98 * cw - BidiCore.lengthToPt(INDENT)) / cw * 100;
                if (pct > 50 && pct <= 98) OUTER_WIDTH = (Math.round(pct * 10) / 10) + '%';
            } catch (e) { /* custom factory without page options: keep 98% */ }

            // Merge inline style strings; a later declaration of the same
            // property replaces the earlier one (no duplicated properties).
            function mergeStyles() {
                const props = new Map();
                Array.prototype.forEach.call(arguments, function(st) {
                    (st || '').split(';').forEach(function(decl) {
                        const k = decl.indexOf(':');
                        if (k < 1) return;
                        const name = decl.slice(0, k).trim().toLowerCase();
                        props.delete(name);                      // keep insertion order = last wins
                        props.set(name, decl.slice(k + 1).trim());
                    });
                });
                return Array.from(props, function(e) { return e[0] + ':' + e[1]; }).join(';');
            }
            function isRtlStyle(style, fallbackRtl) {
                const m = /direction\s*:\s*(rtl|ltr)(?![\s\S]*direction\s*:)/i.exec(style || '');
                return m ? m[1].toLowerCase() === 'rtl' : fallbackRtl;
            }
            function isInline(node) {
                if (node.nodeType === 3) return /\S/.test(node.nodeValue);
                return node.nodeType === 1 &&
                    !/^(P|DIV|H[1-6]|BLOCKQUOTE|UL|OL|PRE|TABLE|HR|DL|FIGURE)$/.test(node.tagName);
            }
            const RESET_PARA_BORDER =
                'border-top:none;border-right:none;border-bottom:none;border-left:none;' +
                'mso-border-alt:none;padding:0cm;margin-right:0cm;margin-left:0cm';

            const LI_IN_CELL = RESET_PARA_BORDER + ';margin-top:0pt;margin-bottom:0pt;' +
                'line-height:' + (T.lineHeightTight || '100%');

            /** A child's own direction (dir attribute, else inline style) — it wins over the quote's. */
            function ownDir(child) {
                const d = (child.getAttribute('dir') || '').toLowerCase();
                if (d === 'rtl' || d === 'ltr') return d;
                const m = /direction\s*:\s*(rtl|ltr)(?![\s\S]*direction\s*:)/i.exec(child.getAttribute('style') || '');
                return m ? m[1].toLowerCase() : null;
            }

            function quoteP(style, dir) {
                const p = document.createElement('p');
                p.setAttribute('class', 'MsoQuote');
                if (style) p.setAttribute('style', style);
                if (dir) p.setAttribute('dir', dir);
                return p;
            }

            /**
             * Turn one <blockquote> into a single-cell table whose cell carries
             * the quote border on its visual start side.
             *
             * Why a table: Word draws a PARAGRAPH border at each paragraph's own
             * indent, so list items (indented by their bullets) and nested quotes
             * break the line into offset segments. A table-cell border is drawn
             * once for the whole cell — one straight line from the first to the
             * last line of the quote, whatever the content indents are.
             *
             *   p/div/h*     → <p class="MsoQuote">   (italic/color; no own border)
             *   ul/ol        → real Word lists, each <li> gets li.MsoQuote
             *   blockquote   → a nested quote table inside the cell (true nesting)
             *   loose inline → grouped into one MsoQuote paragraph
             *   pre/table/hr → kept as-is, in order
             */
            function buildQuote(bq, depth, parentRtl) {
                const ownStyle = bq.getAttribute('style') || '';     // set only for counter-direction quotes
                const rtl = isRtlStyle(ownStyle, parentRtl);
                const start = rtl ? 'right' : 'left';
                const end = rtl ? 'left' : 'right';
                const dir = rtl ? 'rtl' : 'ltr';
                const flipped = rtl !== docIsRTL;
                const childDirStyle = flipped ? 'direction:' + dir + ';text-align:' + start : '';

                const table = document.createElement('table');
                table.className = 'MsoQuoteTable';
                table.setAttribute('border', '0');
                table.setAttribute('cellspacing', '0');
                table.setAttribute('cellpadding', '0');
                table.setAttribute('dir', dir);
                if (flipped) table.setAttribute('align', start);
                table.setAttribute('width', depth === 1 ? OUTER_WIDTH : '100%');
                table.setAttribute('style',
                    'width:' + (depth === 1 ? OUTER_WIDTH : '100%') + ';' +
                    'border-collapse:collapse;border:none;mso-border-alt:none;' +
                    'mso-yfti-tbllook:1184;mso-padding-alt:0cm 0cm 0cm 0cm;' +
                    'margin-' + start + ':' + (depth === 1 ? INDENT : '0cm') + ';' +
                    'margin-' + end + ':0cm');

                const tr = document.createElement('tr');
                const td = document.createElement('td');
                td.setAttribute('valign', 'top');
                // Every side explicit: Word MERGES inline borders with the generic
                // `th, td { border: … }` template rule instead of replacing it.
                td.setAttribute('style',
                    'border-top:none;border-bottom:none;border-' + end + ':none;' +
                    'border-' + start + ':' + BORDER + ';' +
                    'mso-border-top-alt:none;mso-border-bottom-alt:none;' +
                    'mso-border-' + end + '-alt:none;mso-border-' + start + '-alt:' + BORDER + ';' +
                    'padding:2pt 0cm 2pt 0cm;padding-' + start + ':' + PAD + ';' +
                    'direction:' + dir + ';text-align:' + start);
                tr.appendChild(td);
                table.appendChild(tr);

                // Inside the cell the TABLE draws the border, so paragraphs cancel
                // the p.MsoQuote paragraph border/indent (every side explicit —
                // Word merges inline borders with class rules).
                const cellParaStyle = mergeStyles(RESET_PARA_BORDER, childDirStyle);
                let inlineP = null;
                Array.from(bq.childNodes).forEach(function(child) {
                    if (isInline(child)) {
                        if (!inlineP) { inlineP = quoteP(cellParaStyle, flipped ? dir : null); td.appendChild(inlineP); }
                        inlineP.appendChild(child);
                        return;
                    }
                    if (child.nodeType !== 1) return;   // whitespace / comments
                    inlineP = null;
                    const tag = child.tagName;

                    if (/^(P|DIV|H[1-6])$/.test(tag)) {
                        const p = quoteP(mergeStyles(cellParaStyle, child.getAttribute('style')),
                                         ownDir(child) || (flipped ? dir : null));
                        p.innerHTML = child.innerHTML;
                        td.appendChild(p);
                    } else if (tag === 'BLOCKQUOTE') {
                        td.appendChild(buildQuote(child, depth + 1, rtl));
                    } else if (tag === 'UL' || tag === 'OL') {
                        // li.MsoQuote shares the ONE Quote style rule (Word keys styles
                        // by class), so items cancel its border/indent inline and use
                        // tight list spacing — like li.MsoNormal.
                        child.querySelectorAll('li').forEach(function(li) {
                            li.classList.add('MsoQuote');
                            li.setAttribute('style', mergeStyles(LI_IN_CELL, childDirStyle, li.getAttribute('style')));
                        });
                        td.appendChild(child);
                    } else {
                        td.appendChild(child);
                    }
                });
                // Word needs a paragraph after a table that ends a cell; add an
                // empty one so a trailing nested quote keeps its bottom border.
                if (td.lastElementChild && td.lastElementChild.tagName === 'TABLE') {
                    td.appendChild(quoteP(mergeStyles(RESET_PARA_BORDER, 'margin-top:0pt;margin-bottom:0pt'), null)).innerHTML = '&nbsp;';
                }
                return table;
            }

            /**
             * SIMPLE form — the common case: one or more paragraphs of plain or
             * formatted text. Each becomes a plain <p class="MsoQuote">; the
             * border/indent come from the Quote style itself (template), so the
             * user can restyle it, switch it to Normal, or delete it in Word
             * like any other paragraph — no table involved. Consecutive
             * paragraphs share the same indent, so Word joins their borders
             * into one straight line.
             * Counter-direction quotes get the border/indent flipped inline.
             */
            function buildSimpleQuote(bq) {
                const ownStyle = bq.getAttribute('style') || '';
                const rtl = isRtlStyle(ownStyle, docIsRTL);
                const flipped = rtl !== docIsRTL;
                const start = rtl ? 'right' : 'left';
                const end = rtl ? 'left' : 'right';
                const dir = rtl ? 'rtl' : 'ltr';
                const base = flipped
                    ? 'direction:' + dir + ';text-align:' + start + ';' +
                      'border-top:none;border-bottom:none;border-' + end + ':none;' +
                      'border-' + start + ':' + BORDER + ';' +
                      'padding-' + start + ':' + PAD + ';padding-' + end + ':0pt;' +
                      'margin-' + start + ':' + INDENT + ';margin-' + end + ':0cm'
                    : '';
                const out = [];
                let inlineP = null;
                Array.from(bq.childNodes).forEach(function(child) {
                    if (isInline(child)) {
                        if (!inlineP) { inlineP = quoteP(base, flipped ? dir : null); out.push(inlineP); }
                        inlineP.appendChild(child);
                        return;
                    }
                    if (child.nodeType !== 1) return;
                    inlineP = null;
                    const p = quoteP(mergeStyles(base, child.getAttribute('style')),
                                     ownDir(child) || (flipped ? dir : null));
                    p.innerHTML = child.innerHTML;
                    out.push(p);
                });
                return out;
            }

            // Only outermost quotes; nested ones are handled by the recursion.
            Array.from(root.querySelectorAll('blockquote')).forEach(function(bq) {
                if (bq.parentElement && bq.parentElement.closest('blockquote')) return;
                const parent = bq.parentNode;

                if (BidiCore.isComplexQuote(bq, docIsRTL)) {
                    parent.replaceChild(buildQuote(bq, 1, docIsRTL), bq);
                    return;
                }
                const paras = buildSimpleQuote(bq);
                if (!paras.length) { parent.removeChild(bq); return; }
                // Mark where each simple quote starts, so _separateAdjacentBlocks
                // can tell two back-to-back quotes from one multi-paragraph quote
                // (the marker is removed there).
                paras[0].setAttribute('data-quote-start', '');
                paras.forEach(function(p) { parent.insertBefore(p, bq); });
                parent.removeChild(bq);
            });
        }


        /**
         * Code block → single-column table (class MsoCodeTable):
         *   [ language bar ]   optional row: code font, small, gray, shaded
         *   [ <pre> code   ]   the original <pre> (hljs spans kept), unstyled
         * Border and background live on the CELLS, so the box can never spill
         * out of its container: a bare <pre> with width:98% + padding inside a
         * quote cell overflows the cell and loses its left/right border in Word.
         * Width: 98% (centered) in the body, 100% inside a cell; tables in list
         * items are set to auto later by _fitTablesInListItems.
         * Must run AFTER _convertBlockquotesToQuoteParagraphs.
         * @param {HTMLElement} root - parsed body container (mutated in place)
         * @private
         */
        _convertCodeBlocks(root) {
            const T = this.getTemplateOptions();
            const opt = this._config.codeBlock || {};
            const border = T.codeBlockBorder || '1px solid darkgreen';
            const q = '"' + String(T.codeFont).replace(/["'<>]/g, '') + '"';   // style='…' uses single quotes
            const qb = '"' + String(this._codeBidiFont(T)).replace(/["'<>]/g, '') + '"';
            const codeFont = 'font-family:' + q + ',' + (T.codeFontFallback || 'monospace') +
                ';mso-ascii-font-family:' + q + ';mso-hansi-font-family:' + q + ';mso-bidi-font-family:' + qb;
            const labelSize = T.codeHeaderFontSize || '8.0pt';
            const esc = this._escapeHtml.bind(this);

            root.querySelectorAll('pre').forEach(function(pre) {
                const lang = BidiCore.codeLanguage(pre);
                const label = opt.showLanguage === false ? '' : (lang || opt.fallbackLabel || '');
                const inCell = !!(pre.parentElement && pre.parentElement.closest('td, th'));
                const width = inCell ? '100%' : '98%';
                const side = function(top) {
                    return 'border:none;border-left:' + border + ';border-right:' + border +
                        ';border-bottom:' + border + (top ? ';border-top:' + border : '') +
                        ';mso-border-left-alt:' + border + ';mso-border-right-alt:' + border +
                        ';mso-border-bottom-alt:' + border + (top ? ';mso-border-top-alt:' + border : '');
                };

                let html = "<table class='MsoCodeTable' dir=ltr border=0 cellspacing=0 cellpadding=0" +
                    (inCell ? '' : ' align=center') + " width='" + width + "' style='width:" + width +
                    ";border-collapse:collapse;border:none;mso-border-alt:none;mso-yfti-tbllook:1184;" +
                    "mso-padding-alt:0cm 0cm 0cm 0cm;margin-top:6pt;margin-bottom:6pt'>";
                if (label) {
                    html += "<tr><td valign=top style='" + side(true) + ";background:" + T.codeHeaderBg +
                        ";padding:1pt 6px 1pt 6px'><p class=MsoNormal dir=ltr style='direction:ltr;text-align:left;" +
                        'margin:0cm;line-height:normal;' + codeFont + ';font-size:' + labelSize +
                        ';mso-bidi-font-size:' + labelSize + ';color:' + T.codeHeaderColor + "'>" +
                        esc(label) + '</p></td></tr>';
                }
                html += "<tr><td valign=top style='" + side(!label) + ";background:" + T.codeBlockBg +
                    ";padding:4pt 6px 4pt 6px'></td></tr></table>";

                const holder = document.createElement('div');
                holder.innerHTML = html;
                const table = holder.firstChild;
                pre.parentNode.replaceChild(table, pre);
                const st = pre.getAttribute('style') || '';
                pre.setAttribute('style', (st && !/;\s*$/.test(st) ? st + ';' : st) +
                    'border:none;mso-border-alt:none;padding:0cm;margin:0cm;background:transparent;width:auto');
                const cell = table.rows[table.rows.length - 1].cells[0];
                cell.appendChild(pre);
                if (opt.nestedFrames !== false) this._frameNestedFences(pre, cell, side);
            }, this);
        }

        /**
         * Fenced blocks written INSIDE a code block (```` md showing ```
         * examples): the <pre> is cut at their lines and each gets a nested
         * one-cell table as its frame — the text stays raw (fence lines too).
         * Two nested tables in a row are kept apart by an empty paragraph.
         * @private
         */
        _frameNestedFences(pre, cell, side) {
            const code = pre.querySelector('code') || pre;
            const segs = BidiCore.codeSegments(code.textContent.replace(/\n$/, ''));
            if (!segs.some(function (sg) { return sg.nested; })) return;
            const gap = "<p class=MsoNormal dir=ltr style='margin:0cm;line-height:4.0pt;font-size:4.0pt'>&nbsp;</p>";
            cell.removeChild(pre);
            const build = function (items, parent) {
                let lastTable = false;
                items.forEach(function (sg) {
                    if (sg.lines) {
                        const p = pre.cloneNode(false);
                        const c = code === pre ? p : p.appendChild(code.cloneNode(false));
                        c.appendChild(BidiCore.codeFragment(code, sg.lines[0], sg.lines[1]));
                        parent.appendChild(p);
                        lastTable = false;
                        return;
                    }
                    if (lastTable) parent.insertAdjacentHTML('beforeend', gap);
                    parent.insertAdjacentHTML('beforeend',
                        "<table class='MsoCodeTable' dir=ltr border=0 cellspacing=0 cellpadding=0 width='100%' " +
                        "style='width:100%;border-collapse:collapse;border:none;mso-border-alt:none;" +
                        "mso-padding-alt:0cm 0cm 0cm 0cm;margin-top:2pt;margin-bottom:2pt'><tr><td valign=top style='" +
                        side(true) + ";padding:2pt 4px 2pt 4px'></td></tr></table>");
                    build(sg.items, parent.lastElementChild.rows[0].cells[0]);
                    lastTable = true;
                });
            };
            build(segs, cell);
        }

        /**
         * Insert a spacer paragraph between two "boxes" that follow each other
         * with nothing but whitespace in between. Boxes are:
         *   - tables (incl. table-form quotes and the <div dir=ltr> wrapper of
         *     an all-LTR table),
         *   - code blocks (<pre>),
         *   - simple quotes (a run of p.MsoQuote starting at data-quote-start).
         * Word merges back-to-back tables, and joins same-styled bordered
         * paragraphs, so any pair — table/table, quote/quote, quote/table,
         * pre/pre, pre/table, … — would read as one block without the spacer.
         * Runs at every nesting level (body, table-form quote cells, …).
         * A list counts by its EDGES: a list whose last item ends with a box
         * (code in a list item, a quote, a table — at any depth) followed by
         * a box, or a box followed by a list that starts with one, is the
         * same adjacency — Word would join the two just the same.
         * Must run AFTER _convertBlockquotesToQuoteParagraphs and
         * _applyElementDirectionOverrides.
         * @param {HTMLElement} root - parsed body container (mutated in place)
         * @private
         */
        _separateAdjacentBlocks(root) {
            // 'box' (table / pre / wrapper), 'quote' (first p of a simple quote),
            // 'quoteCont' (its following paragraphs), or null (anything else).
            function kind(el) {
                const tag = el.tagName;
                if (tag === 'TABLE') return el.id === 'hrdftrtbl' ? null : 'box';
                if (tag === 'PRE') return 'box';
                if (tag === 'DIV' && el.hasAttribute('dir') &&
                    el.children.length === 1 && el.firstElementChild.tagName === 'TABLE') return 'box';
                if (tag === 'P' && el.classList.contains('MsoQuote')) {
                    return el.hasAttribute('data-quote-start') ? 'quote' : 'quoteCont';
                }
                return null;
            }
            // Box at the start / end of a container's rendered content (lists,
            // list items, wrappers): 'box' | 'quote' | null.
            function edge(el, last) {
                const k = kind(el);
                if (k) return k === 'quoteCont' ? 'quote' : k;
                if (!/^(UL|OL|LI|DIV)$/.test(el.tagName)) return null;
                const nodes = Array.from(el.childNodes).filter(function (n) {
                    return n.nodeType === 1 || (n.nodeType === 3 && /\S/.test(n.nodeValue));
                });
                const n = last ? nodes[nodes.length - 1] : nodes[0];
                return n && n.nodeType === 1 ? edge(n, last) : null;
            }
            const spacer = this._buildSpacerParagraph();
            const parents = new Set([root]);
            root.querySelectorAll('table, pre, p.MsoQuote').forEach(function(el) {
                if (el.parentElement) parents.add(el.parentElement);
            });
            parents.forEach(function(parent) {
                let prev = null;        // kind of the previous block ('box' | 'quote' | null)
                Array.from(parent.childNodes).forEach(function(n) {
                    if (n.nodeType === 3) { if (/\S/.test(n.nodeValue)) prev = null; return; }
                    if (n.nodeType !== 1) return;
                    const k = kind(n);
                    if (k === 'box' || k === 'quote') {
                        if (prev) n.insertAdjacentHTML('beforebegin', spacer);
                        prev = k;
                    } else if (!(k === 'quoteCont' && prev === 'quote')) {
                        // lists / wrappers count by their edges; anything else resets
                        const container = !k && /^(UL|OL|DIV)$/.test(n.tagName);
                        if (container && prev && edge(n, false)) n.insertAdjacentHTML('beforebegin', spacer);
                        prev = container ? edge(n, true) : null;
                    }
                });
            });
            root.querySelectorAll('[data-quote-start]').forEach(function(p) {
                p.removeAttribute('data-quote-start');
            });
        }

        /**
         * Tables directly inside a list item (md tables, table-form quotes) are
         * indented by Word to the item's text, but a percentage width is still
         * measured against the whole text area — 98% (or the quote's 95%) plus
         * the list indent would run past the end margin. They get width:auto
         * instead (Word auto-fits within the margin). Tables in cells of such
         * tables keep their own widths. <pre> needs nothing: Word turns it into
         * paragraphs that follow the list indent.
         * @param {HTMLElement} root - parsed body container (mutated in place)
         * @private
         */
        _fitTablesInListItems(root) {
            root.querySelectorAll('li table').forEach(function(table) {
                const li = table.closest('li');
                const cell = table.parentElement.closest('td, th');
                if (cell && li.contains(cell)) return;       // nested in a box inside the item
                table.removeAttribute('width');
                const st = (table.getAttribute('style') || '').replace(/(^|;)\s*width\s*:[^;]*/gi, '$1');
                table.setAttribute('style', 'width:auto;' + st.replace(/^;+/, ''));
            });
        }

        /**
         * Whether the body needs a leading spacer paragraph, so the user has an
         * easy first line to type into, place a cursor, or insert a list/heading
         * — hard to do when the document opens straight into a table, list, code
         * block, or quote. Headings and plain <p> count as already having one;
         * <p class="MsoQuote"> does not, since it still opens on quote styling.
         * Must run on the FINAL processed html (after blockquote→MsoQuote and
         * LTR-table wrapping).
         * @param {string} html - fully processed body html (after _wrapBidiRuns)
         * @returns {boolean}
         * @private
         */
        _needsLeadingSpacer(html) {
            const match = /^\s*<(p|h[1-6])\b([^>]*)>/i.exec(html);
            if (!match) return true;
            if (match[1].toLowerCase() === 'p' && /class\s*=\s*["']?[^"'>]*MsoQuote/i.test(match[2])) {
                return true;
            }
            return false;
        }

        /**
         * Build a spacer paragraph containing a single non-breaking space.
         * Word collapses/hides a truly empty <p></p>, so &nbsp; keeps it
         * visible/preserved in the output. Used both as a leading paragraph
         * (when the body doesn't start with a real <p>, e.g. a table or list)
         * and as a trailing paragraph at the end of the document.
         *
         * Direction is based on whether the document's ACTUAL content contains
         * Persian/RTL text — independent of setDirection() overrides — mirroring
         * how a plain LTR-only paragraph (e.g. "test") is rendered: explicit
         * direction:ltr;text-align:left when there's no RTL content, regardless
         * of any forced document-level direction.
         * @returns {string}
         * @private
         */
        _buildSpacerParagraph() {
            const style = this._contentIsRTL
                ? 'direction:rtl;text-align:right'
                : 'direction:ltr;text-align:left';
            return "<p class=MsoNormal style='" + style + "'>&nbsp;</p>";
        }

        /**
         * Assign default Word style classes to unstyled elements
         * Elements without a class get MsoNormal (paragraphs, list items, divs)
         * or MsoNormalTable (tables) for proper Word rendering.
         * @param {HTMLElement} root - parsed body container (mutated in place)
         * @private
         */
        _assignWordStyleClasses(root) {

            root.querySelectorAll('p, li, div').forEach(function(el) {
                if (el.className) return;
                // Skip wrapper divs created by direction override (e.g., LTR table wrappers)
                if (el.tagName === 'DIV' && el.hasAttribute('dir')) return;
                el.setAttribute('class', 'MsoNormal');
            });

            root.querySelectorAll('table').forEach(function(table) {
                if (table.className) return;
                if (table.id === 'hrdftrtbl') return;
                table.setAttribute('class', 'MsoNormalTable');
            });
        }

        // =====================================================================
        // Direction Auto-Detection
        // =====================================================================






        /**
         * Apply per-element direction decisions (BidiCore.planDirections) as
         * inline CSS / wrappers. The rules themselves live in BidiCore so that
         * DocxBuilder makes exactly the same decisions:
         *   - p, h1-h6: explicit LTR when they contain no RTL letter
         *   - blockquote: counter-direction quotes record their direction here;
         *     border/indent follow in _convertBlockquotesToQuoteParagraphs
         *   - td/th: LTR unless Persian, or numbers-only inside an RTL table;
         *     an all-LTR table is wrapped in <div align=center dir=ltr>
         *   - lists: root-tree rule (no RTL anywhere → whole tree LTR)
         *
         * @param {HTMLElement} root - parsed body container (mutated in place)
         * @private
         */
        _applyElementDirectionOverrides(root) {
            const docDir = this._isRTL() ? 'rtl' : 'ltr';
            const justify = String(this.getTemplateOptions().textAlign || 'justify').toLowerCase() === 'justify';
            // One alignment rule for every language: body paragraphs and list items
            // justify (unless a long URL/path would stretch the line), headings
            // start, cells keep their Markdown alignment (th: center, td: start).
            const alignFor = function (el, dir) {
                const start = dir === 'ltr' ? 'left' : 'right';
                if (/^T[DH]$/.test(el.tagName)) {
                    const a = el.getAttribute('align');
                    return a ? a.toLowerCase() : (el.tagName === 'TH' ? 'center' : start);
                }
                if (/^H[1-6]$/.test(el.tagName)) return start;
                return justify && !BidiCore.noJustify(el.textContent) ? 'justify' : start;
            };
            const addStyle = function (el, css) {
                let existing = el.getAttribute('style') || '';
                if (existing && !existing.endsWith(';')) existing += ';';
                el.setAttribute('style', existing + css);
            };
            const planned = new Set();
            BidiCore.planDirections(root, docDir === 'rtl').forEach(function (a) {
                const el = a.el;
                if (a.op === 'ltr' || a.op === 'rtl') {
                    planned.add(el);
                    addStyle(el, 'direction:' + a.op + ';text-align:' + alignFor(el, a.op));
                } else if (a.op === 'quoteDir') {
                    el.setAttribute('style', a.dir === 'ltr'
                        ? 'direction:ltr;text-align:left'
                        : 'direction:rtl;text-align:right');
                } else if (a.op === 'ltrTable') {
                    const wrapper = document.createElement('div');
                    wrapper.setAttribute('align', 'center');
                    wrapper.setAttribute('dir', 'ltr');
                    el.parentNode.insertBefore(wrapper, el);
                    wrapper.appendChild(el);
                }
            });
            // blocks that keep the document direction: a long URL → start; a cell → its Markdown alignment
            root.querySelectorAll('p, li, td, th').forEach(function (el) {
                if (planned.has(el) || el.closest('pre')) return;
                if (/^T[DH]$/.test(el.tagName)) { if (el.getAttribute('align')) addStyle(el, 'text-align:' + el.getAttribute('align').toLowerCase()); return; }
                if (el.closest('td, th')) return;
                if (justify && BidiCore.noJustify(el.textContent)) addStyle(el, 'text-align:' + (docDir === 'ltr' ? 'left' : 'right'));
            });
        }

        /**
         * Table of contents (BidiCore.insertToc) as Word writes it: MsoTocHeading,
         * then MsoToc1…n paragraphs inside a TOC field (\\o "1-n" \\h \\z \u) that
         * link to bookmarks on the headings. Word fills the page numbers when the
         * field is updated (right click → Update Field, F9, or before printing).
         * @param {HTMLElement} root
         * @private
         */
        _renderToc(root) {
            const box = root.querySelector('div.kelk-toc');
            if (!box) return;
            const levels = parseInt(box.getAttribute('data-levels'), 10) || 2;
            const doc = root.ownerDocument;
            // bookmarks on the headings
            box.querySelectorAll('.kelk-toc-entry').forEach(function (e) {
                const h = root.querySelector('[id="' + e.getAttribute('data-target').replace(/"/g, '') + '"]');
                if (h && !h.querySelector('a[name]')) {
                    const a = doc.createElement('a');
                    a.setAttribute('name', h.id);
                    h.insertBefore(a, h.firstChild);
                }
            });
            const title = box.querySelector('.kelk-toc-title');
            if (title) title.className = 'MsoTocHeading';
            const entries = Array.from(box.querySelectorAll('.kelk-toc-entry'));
            const tabPos = Math.floor((BidiCore.contentWidthPt(this.getTemplateOptions()) || 450) - 1);
            const self = this;
            entries.forEach(function (e, i) {
                const level = parseInt(e.getAttribute('data-level'), 10) || 1;
                const text = e.innerHTML;
                const begin = i === 0
                    ? "<!--[if supportFields]><span style='mso-element:field-begin'></span> TOC \\o &quot;1-" + levels +
                      "&quot; \\h \\z \\u <span style='mso-element:field-separator'></span><![endif]-->" : '';
                const end = i === entries.length - 1 ? "<!--[if supportFields]><span style='mso-element:field-end'></span><![endif]-->" : '';
                const id = e.getAttribute('data-target');
                const rtl = /direction:\s*rtl/.test(e.getAttribute('style') || '') ||
                    (!/direction:\s*ltr/.test(e.getAttribute('style') || '') && self._isRTL());
                e.className = 'MsoToc' + level;
                e.removeAttribute('data-level');
                // the page number sits at the end side after a dotted tab; its PAGEREF
                // field is filled when Word updates the table (F9 / Update Field)
                const st = e.getAttribute('style') || '';
                e.setAttribute('style', (st && !/;\s*$/.test(st) ? st + ';' : st) + 'tab-stops:' + (rtl ? 'left' : 'right') + ' dotted ' + tabPos + 'pt');
                e.innerHTML = begin + '<span class=MsoHyperlink><a href="#' + id + '">' + text +
                    "<span style='mso-tab-count:1 dotted'>. </span>" +
                    "<!--[if supportFields]><span style='mso-element:field-begin'></span> PAGEREF " + id +
                    " \\h <span style='mso-element:field-separator'></span><![endif]-->" +
                    "<!--[if supportFields]><span style='mso-element:field-end'></span><![endif]--></a></span>" + end;
                e.removeAttribute('data-target');
            });
            // Word's own form: the heading and the entries inside a Table of Contents
            // content control (w:Sdt, written in place of this marker div), so
            // clicking the table shows Word's "Update Table" button directly
            box.removeAttribute('class');
            box.removeAttribute('data-levels');
            box.setAttribute('data-kelk-sdt', 'toc');
            if (title) title.appendChild(doc.createComment('kelk-sdtpr'));
            box.parentNode.insertBefore(doc.createComment('kelk-sdt-end'), box.nextSibling);
        }

        /**
         * Column widths from the content, as percentages — the same shares as
         * DocxBuilder, PdfBuilder and HtmlBuilder (BidiCore.tableColumnShares),
         * so a narrow "row" column stays narrow in every output.
         * @param {HTMLElement} root
         * @private
         */
        _applyColumnWidths(root) {
            const T = this.getTemplateOptions();
            const width = BidiCore.contentWidthPt ? BidiCore.contentWidthPt(T) : 450;
            const fs = BidiCore.cssPt(T.bidiFontSize) || 12;
            const tw = this._config.tableWidth;
            root.querySelectorAll('table').forEach(function (table) {
                if (table.id === 'hrdftrtbl' || table.closest('pre')) return;
                const fit = BidiCore.tableColumnShares(table, { width: width, fontSize: fs, tableWidth: tw });
                Array.from(table.rows).forEach(function (tr) {
                    Array.from(tr.cells).forEach(function (cell) {
                        const c0 = fit.cols.get(cell) || 0, span = Math.max(1, cell.colSpan || 1);
                        let pc = 0;
                        for (let k = 0; k < span; k++) pc += fit.shares[c0 + k] || 0;
                        const st = cell.getAttribute('style') || '';
                        cell.setAttribute('style', (st && !/;\s*$/.test(st) ? st + ';' : st) + 'width:' + (pc * 100).toFixed(1) + '%');
                    });
                });
                const st = table.getAttribute('style') || '';
                table.setAttribute('style', (st && !/;\s*$/.test(st) ? st + ';' : st) + 'width:' + (fit.fraction * 100).toFixed(1) + '%');
            });
        }

        /**
         * Resolve the per-build direction state WITHOUT touching this._config:
         *   - _contentIsRTL: whether the actual content contains RTL text
         *   - _resolvedDir:  configured direction, or the detected one for 'auto'
         * Called at the start of every toHtml(), so a reused builder re-detects
         * for each new document instead of inheriting the previous result.
         *
         * @param {HTMLElement|string} source - parsed body root or raw HTML
         * @private
         */
        _resolveDirectionality(source) {
            const detected = BidiCore.detectDirection(source);
            this._contentIsRTL = detected === 'rtl';
            this._resolvedDir = this._config.direction === 'auto'
                ? detected
                : this._config.direction;
        }

        /**
         * Wrap counter-directional text runs in <span dir="..."> for Word bidi resolution.
         *
         * Philosophy (validated empirically): the browser/Word bidi algorithm (UBA) is
         * correct in the vast majority of cases. We do NOT re-segment everything; we only
         * isolate the runs the UBA misplaces — text whose script runs COUNTER to the
         * block's base direction. Same-direction text stays as bare text nodes.
         *
         * For each block (p, h1-h6, li, td, th, blockquote) we read the block's EFFECTIVE
         * base direction (set earlier by _applyElementDirectionOverrides via inline
         * style / dir), then flatten the block's OWN text — descending into inline
         * formatting (strong/em/a/...) but stopping at nested block descendants and
         * code/pre — into ONE continuous string, before applying the gates:
         *   - Gate 1 (context): only act when the BLOCK's flattened text mixes Latin
         *     AND RTL letters. A single-script block is left alone. This is
         *     deliberately block-level, not per DOM text node: inline formatting
         *     (e.g. <strong>) splits one logical run into several text nodes with
         *     zero script change between them, and gating per node would isolate
         *     each fragment independently — breaking one continuous LTR/RTL run
         *     into several, which Word's bidi engine can then reorder relative to
         *     each other. Flattening first means a markup boundary is never
         *     mistaken for a language boundary.
         *   - Gate 2 (greedy region): a counter-direction region starts at the first
         *     opposite-strong letter and greedily absorbs inner neutrals (spaces, digits,
         *     brackets, own-side punctuation) until the first BASE-strong letter (or, when
         *     the base is RTL, Persian punctuation ، ؛ ؟ which is RTL-owned) — scanned
         *     over the flattened block text, so it can freely cross inline-tag boundaries.
         *   - Gate 3 (enclosure guard): an enclosure char ( ) [ ] { } « » " " " ' is kept
         *     inside the isolate only if its partner is also inside; an unbalanced one
         *     (partner lives across the language boundary) is pushed back out so the UBA
         *     can pair it. This prevents split bracket/quote pairs. Exception: a lone
         *     apostrophe (' or the smart ’) touching a letter/digit on either side
         *     (e.g. "org's", "workers'", "'90s") is a contraction/possessive/elision
         *     mark, not a quote-pair delimiter, and is never treated as unbalanced —
         *     otherwise a real word/phrase gets split into two isolates around it,
         *     which risks the exact same reordering Gate 1's block-level flattening
         *     guards against, just triggered by punctuation instead of markup.
         *   - End-punctuation rule: when the block's base is RTL and the block ends with a
         *     counter (LTR) region carrying sentence-final punctuation (configurable via
         *     this._config.endPunctuation, default ['.']), that punctuation is emitted
         *     OUTSIDE the isolate so it lands at the logical (left) end of the line.
         *
         * Each isolate is applied via Range.extractContents()/insertNode() rather than
         * string rebuilding, so inline formatting elements that only partially overlap
         * an isolate (e.g. a <strong> that starts before the isolate and ends inside
         * it) are correctly cloned/split by the DOM itself, keeping strong/em scoped
         * to their own original text on each side of the language boundary.
         *
         * Output spans use dir="ltr"/dir="rtl" (no CSS unicode-bidi), because Word
         * understands the explicit dir attribute reliably, whereas CSS bidi properties
         * are not honored consistently in its layout engine.
         *
         * @param {HTMLElement} root - parsed body container (mutated in place)
         * @private
         */
        _wrapBidiRuns(root) {
            const docBaseDir = this._isRTL() ? 'rtl' : 'ltr';
            const opts = { endPunctuation: (this._config && this._config.endPunctuation) || [] };

            // Effective base direction of a block: inline style/dir set by the element
            // direction pass wins; otherwise fall back to the document base direction.
            function blockBaseDir(el) {
                const style = (el.getAttribute('style') || '').toLowerCase();
                if (style.indexOf('direction:rtl') !== -1) return 'rtl';
                if (style.indexOf('direction:ltr') !== -1) return 'ltr';
                const d = (el.getAttribute('dir') || '').toLowerCase();
                if (d === 'rtl' || d === 'ltr') return d;
                return docBaseDir;
            }

            root.querySelectorAll(BidiCore.BLOCK_SEL).forEach(function(el) {
                if (el.id === 'hrdftrtbl') return;
                const flat = BidiCore.flattenBlock(el);

                // Gate 1 (block-level context): only blocks mixing LTR and RTL letters.
                if (!BidiCore.hasMix(flat.text)) return;

                const baseDir = blockBaseDir(el);
                const ranges = BidiCore.findIsolateRanges(flat.text, baseDir, opts);
                if (!ranges.length) return;
                const oppDir = (baseDir === 'rtl') ? 'ltr' : 'rtl';

                // Apply LAST range first: wrapping only touches content at or after
                // its own start, so earlier ranges (and their nodeMap) stay valid.
                // extractContents() splits partially-overlapping <strong>/<em> correctly.
                for (let r = ranges.length - 1; r >= 0; r--) {
                    const start = ranges[r][0], end = ranges[r][1];
                    if (end <= start) continue;
                    const sp = BidiCore.resolvePosition(flat.nodeMap, start);
                    const ep = BidiCore.resolvePosition(flat.nodeMap, end);
                    const range = document.createRange();
                    range.setStart(sp.node, sp.offset);
                    range.setEnd(ep.node, ep.offset);
                    const span = document.createElement('span');
                    span.setAttribute('dir', oppDir);
                    span.appendChild(range.extractContents());
                    range.insertNode(span);
                }
            });
        }


        // =====================================================================
        // Configuration Methods (Fluent API)
        // =====================================================================

        // =====================================================================
        // Template styling (fonts, sizes, page, colors)
        // Only the keys you pass change; everything else keeps the template
        // defaults (createMsoTemplate.DEFAULTS). Calls are cumulative.
        // =====================================================================

        /**
         * Effective template options: template defaults + this builder's overrides.
         * Useful for inspecting what a document will use.
         * @returns {object}
         */
        /** Font for RTL text inside code (see codeBlock.rtlFont). */
        _codeBidiFont(T) {
            // RTL text inside code: 'code' → the code font draws it too (one font,
            // one column grid; DejaVu Sans Mono has Arabic script), 'document'
            // → the document's bidi font draws RTL words (proportional).
            if (T.codeBidiFont) return T.codeBidiFont;
            return (this._config.codeBlock || {}).rtlFont === 'document' ? T.bidiFont : T.codeFont;
        }

        getTemplateOptions() {
            const factory = this._templateFactory ||
                (typeof createMsoTemplate === 'function' ? createMsoTemplate : null);
            const defaults = (factory && factory.DEFAULTS) || {};
            return Object.assign({}, defaults, this._config.template);
        }

        // =====================================================================
        // Header — Three Modes
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
        // Footer — Three Modes
        // =====================================================================

        // =====================================================================
        // Content
        // =====================================================================

        // =====================================================================
        /** Resolved header/footer direction ('rtl' | 'ltr'). @private */
        _hfDir() {
            const d = this._config.headerFooterDirection;
            return (d === 'rtl' || d === 'ltr') ? d : this._dirAttr();
        }

        /** Paging labels: explicit footer labels › builder labels › by direction. @private */
        _pagingLabels(labels) {
            return labels || this._config.pagingLabels || DEFAULT_PAGING_LABELS[this._hfDir()];
        }

        /**
         * Escape a header/footer string and mark its counter-direction parts
         * with <span dir> — the same BiDi rules as the body, so Latin text gets
         * the Latin font slot (and Latin digits) inside an RTL header.
         * A string entirely in the other script is wrapped as a whole.
         * @param {string} text
         * @returns {string} html
         * @private
         */
        _hfText(text) {
            const t = String(text == null ? '' : text);
            const esc = this._escapeHtml.bind(this);
            const base = this._hfDir();
            const opp = base === 'rtl' ? 'ltr' : 'rtl';
            const hasFa = BidiCore.hasRtlLetter(t), hasLa = BidiCore.hasLatin(t);
            if (!BidiCore.hasMix(t)) {
                const whole = base === 'rtl' ? (hasLa && !hasFa) : (hasFa && !hasLa);
                return whole ? '<span dir=' + opp + '>' + esc(t) + '</span>' : esc(t);
            }
            const ranges = BidiCore.findIsolateRanges(t, base,
                { endPunctuation: (this._config && this._config.endPunctuation) || [] });
            let out = '', pos = 0;
            ranges.forEach(function(r) {
                out += esc(t.slice(pos, r[0])) + '<span dir=' + opp + '>' + esc(t.slice(r[0], r[1])) + '</span>';
                pos = r[1];
            });
            return out + esc(t.slice(pos));
        }

        // Header/Footer HTML Builders
        // =====================================================================

        /**
         * Build the MSO page number snippet
         * @param {object} labels - { page, from }
         * @returns {string}
         * @private
         */
        _buildPageNumberHtml(labels) {
            labels = this._pagingLabels(labels);
            return this._hfText(labels.page) +
                " <span style='mso-field-code:\" PAGE \"'></span> " +
                this._hfText(labels.from) +
                " <span style='mso-field-code:\" NUMPAGES \"'></span>";
        }

        /**
         * Build header HTML based on mode
         * @returns {string}
         * @private
         */
        _buildHeaderHtml() {
            const cfg = this._config.header;
            const dir = this._hfDir();
            const borders = this._config.borders;

            switch (cfg.mode) {
                case 'simple':
                    return "<p class=MsoNormal dir=" + dir + " style='direction:" + dir +
                        ";margin-top:0pt;margin-bottom:0pt;text-align:center;border-bottom:" +
                        borders.headerBottom + ";padding-bottom:4pt'>" +
                        this._hfText(cfg.text) +
                        "</p>";

                case 'structured':
                    return this._buildStructuredHeaderHtml(cfg, dir, borders);

                case 'html':
                    return this._buildHfFromHtml(cfg);

                default:
                    return '';
            }
        }

        /**
         * Custom header/footer from HTML (see BidiCore.parseHeaderFooter): the
         * shared model rendered as Word HTML. Tables get Word's border and
         * padding properties; text goes through the same BiDi isolates as the
         * rest of the header; {page}/{pages} become PAGE/NUMPAGES fields;
         * images become MHTML parts (toBlob) or keep their source (toHtml).
         * @private
         */
        _buildHfFromHtml(cfg) {
            const self = this, dir = this._hfDir(), rtl = dir === 'rtl';
            const model = BidiCore.parseHeaderFooter(cfg.html);
            const esc = this._escapeHtml.bind(this);
            const title = cfg.title != null ? cfg.title : this._docTitle();
            const values = {
                page: function (n, doc) { const sp = doc.createElement('span'); sp.setAttribute('data-hf-field', 'PAGE'); return sp; },
                pages: function (n, doc) { const sp = doc.createElement('span'); sp.setAttribute('data-hf-field', 'NUMPAGES'); return sp; },
                date: BidiCore.hfDate(dir, cfg.dateLocale),
                title: title
            };
            const bw = function (b) {
                return b ? b.style + ' ' + (BidiCore.cssColorHex(b.color) ? '#' + BidiCore.cssColorHex(b.color) : b.color) + ' ' + b.width.toFixed(2) + 'pt' : 'none';
            };
            const sideCss = function (st) {
                let css = '';
                ['top', 'right', 'bottom', 'left'].forEach(function (sd) {
                    const v = bw(st.border[sd] || null);
                    css += 'border-' + sd + ':' + v + ';mso-border-' + sd + '-alt:' + v + ';';
                });
                return css;
            };
            const textCss = function (st) {
                let css = '';
                if (st.color) css += 'color:' + st.color + ';';
                if (st.size) css += 'font-size:' + st.size + 'pt;mso-bidi-font-size:' + st.size + 'pt;';
                if (st.bold) css += 'font-weight:bold;mso-bidi-font-weight:bold;';
                if (st.italic) css += 'font-style:italic;mso-bidi-font-style:italic;';
                return css;
            };
            function inline(node) {
                let out = '';
                for (let n = node.firstChild; n; n = n.nextSibling) {
                    if (n.nodeType === 3) { out += self._hfText(n.nodeValue); continue; }
                    if (n.nodeType !== 1) continue;
                    const f = n.getAttribute('data-hf-field');
                    if (f) { out += "<span style='mso-field-code:\" " + f + " \"'></span>"; continue; }
                    switch (n.tagName) {
                        case 'B': case 'STRONG': out += '<b>' + inline(n) + '</b>'; break;
                        case 'I': case 'EM': out += '<i>' + inline(n) + '</i>'; break;
                        case 'U': out += '<u>' + inline(n) + '</u>'; break;
                        case 'A': out += '<a href="' + esc(n.getAttribute('href') || '') + '">' + inline(n) + '</a>'; break;
                        case 'SPAN': {
                            const css = textCss(BidiCore.hfStyleOf(n));
                            out += css ? "<span style='" + css + "'>" + inline(n) + '</span>' : inline(n);
                            break;
                        }
                        case 'IMG': out += self._hfImage(n); break;
                        default: out += inline(n);
                    }
                }
                return out;
            }
            const alignOf = function (st) {
                const a = st.align;
                return a === 'left' || a === 'right' || a === 'center' || a === 'justify' ? a : (rtl ? 'right' : 'left');
            };
            const para = function (p, extraStyle) {
                const st = Object.assign({}, extraStyle || {}, p.style || {});
                const body = inline(BidiCore.hfFields(p.el, values));
                const tc = textCss(st);
                return "<p class=MsoNormal dir=" + dir + " style='margin:0cm;text-align:" + alignOf(st) +
                    ";direction:" + dir + ";unicode-bidi:embed'>" + (tc ? "<span style='" + tc + "'>" + body + '</span>' : body) + '</p>';
            };
            let html = '';
            model.blocks.forEach(function (bl) {
                if (bl.type === 'para') { html += para({ style: bl.style, el: bl.el }); return; }
                const widths = BidiCore.hfColumnWidths(bl);
                html += "<table class=headerFooterTable dir=" + dir + " border=0 cellspacing=0 cellpadding=0 width='100%' " +
                    "style='width:100.0%;border-collapse:collapse;border:none;mso-border-alt:none;" +
                    "mso-padding-alt:0cm 0cm 0cm 0cm;mso-table-dir:" + (rtl ? 'bidi' : 'ltr') + "'>";
                bl.rows.forEach(function (row) {
                    html += '<tr>';
                    let col = 0;
                    row.cells.forEach(function (c) {
                        let w = 0;
                        for (let k = 0; k < c.colspan; k++) w += widths[col + k] || 0;
                        col += c.colspan;
                        const st = c.style, pd = st.padding || {};
                        const pad = [pd.top, pd.right, pd.bottom, pd.left].map(function (v) { return (isNaN(v) || v === undefined ? 2 : v) + 'pt'; }).join(' ');
                        html += "<td width='" + w.toFixed(1) + "%'" + (c.colspan > 1 ? ' colspan=' + c.colspan : '') +
                            ' valign=' + (st.valign === 'top' ? 'top' : st.valign === 'bottom' ? 'bottom' : 'middle') +
                            " style='width:" + w.toFixed(1) + '%;' + sideCss(st) + (st.bg ? 'background:' + st.bg + ';' : '') +
                            'padding:' + pad + "'>";
                        html += c.paras.length ? c.paras.map(function (p) { return para(p); }).join('')
                                               : "<p class=MsoNormal style='margin:0cm'>&nbsp;</p>";
                        html += '</td>';
                    });
                    html += '</tr>';
                });
                html += '</table>';
            });
            return html;
        }

        /** <img> of a header/footer: MHTML part (toBlob) or its source (toHtml). */
        _hfImage(img) {
            const src = img.getAttribute('src') || '', esc = this._escapeHtml.bind(this);
            const part = this._mhtImagePart(src);
            const alt = esc(img.getAttribute('alt') || '');
            if (part) {
                const sz = ImageCore.displaySize(img, part.rec, this._bodyWidthPx());
                return '<img src="' + part.name + '" width=' + sz.width + ' height=' + sz.height + ' alt="' + alt + '">';
            }
            if (/^(data:image\/|https?:)/i.test(src)) {
                const w = img.getAttribute('width'), h = img.getAttribute('height');
                return '<img src="' + esc(src) + '"' + (w ? ' width=' + esc(w) : '') + (h ? ' height=' + esc(h) : '') + ' alt="' + alt + '">';
            }
            return alt;
        }

        /** {title}: the header/footer option, else the content's first heading. */
        _docTitle() {
            const m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(this._contentHtml || '');
            return m ? m[1].replace(/<[^>]+>/g, '').trim() : '';
        }

        /**
         * Build structured 3-column header table HTML
         * @param {object} cfg - Header config
         * @param {string} dir - Direction attribute
         * @param {object} borders - Border styles
         * @returns {string}
         * @private
         */
        _buildStructuredHeaderHtml(cfg, dir, borders) {
            const cols = this._config.headerColumns;
            const bBottom = borders.headerBottom;
            const bDivider = borders.headerCellDivider;

            return "<table class='headerFooterTable' dir=" + dir + " border=0 cellspacing=0 cellpadding=0 " +
                "style='border-collapse:collapse;border:none;margin-top:0pt;margin-bottom:0pt'>" +
                "<tr>" +
                    // Logo cell
                    "<td width=" + cols.logo + " align=center valign=center " +
                    "style='width:" + cols.logo + ";border:none;border-bottom:" + bBottom + ";margin-top:4pt;margin-bottom:4pt'>" +
                        //"<p class=MsoNormal style='margin-top:0pt;margin-bottom:0pt'>" +
                            this._hfLogo(cfg) +
                        //"</p>" +
                    "</td>" +
                    // Title cell
                    "<td width=" + cols.title + " align=center valign=center " +
                    "style='width:" + cols.title + ";border:none;border-bottom:" + bBottom +
                    ";border-right:" + bDivider + ";border-left:" + bDivider + ";margin-top:4pt;margin-bottom:4pt'>" +
                        this._hfText(cfg.title) +
                    "</td>" +
                    // Edition cell
                    "<td width=" + cols.edition + " align=center valign=center " +
                    "style='width:" + cols.edition + ";border:none;border-bottom:" + bBottom + ";margin-top:4pt;margin-bottom:4pt'>" +
                        this._hfText(cfg.edition) +
                    "</td>" +
                "</tr>" +
            "</table>";
        }

        /**
         * Build footer HTML based on mode
         * @returns {string}
         * @private
         */
        _buildFooterHtml() {
            const cfg = this._config.footer;
            const dir = this._hfDir();
            const borders = this._config.borders;

            switch (cfg.mode) {
                case 'simple':
                    return "<p class=MsoNormal dir=" + dir + " style='direction:" + dir +
                        ";margin-top:0pt;margin-bottom:0pt;text-align:center;border-top:" +
                        borders.footerTop + ";padding-top:4pt'>" +
                        this._buildPageNumberHtml(cfg.pagingLabels) +
                        "</p>";

                case 'structured':
                    return this._buildStructuredFooterHtml(cfg, dir, borders);

                case 'html':
                    return this._buildHfFromHtml(cfg);

                default:
                    return '';
            }
        }

        /**
         * Build structured 2-column footer table HTML
         * @param {object} cfg - Footer config
         * @param {string} dir - Direction attribute
         * @param {object} borders - Border styles
         * @returns {string}
         * @private
         */
        _buildStructuredFooterHtml(cfg, dir, borders) {
            const cols = this._config.footerColumns;
            const bTop = borders.footerTop;

            // Build author name with optional link
            // Author sits at the START of the footer; the divider is on the
            // author cell's END side (towards the page number).
            const start = dir === 'rtl' ? 'right' : 'left';
            const end = dir === 'rtl' ? 'left' : 'right';
            let authorHtml = this._hfText(cfg.author);
            if (cfg.link) {
                const displayLink = cfg.link.replace(/^https?:\/\//, '');
                authorHtml += ' | <a href="' + this._escapeHtml(cfg.link) + '">' +
                    '<span dir=LTR>' +
                    this._escapeHtml(displayLink) + '</span></a>';
            }

            return "<table class='headerFooterTable' dir=" + dir + " align='center' border=0 cellspacing=0 cellpadding=0 " +
                "style='border-collapse:collapse;border:none;margin-top:0pt;margin-bottom:0pt'>" +
                "<tr>" +
                    // Author cell
                    "<td width=" + cols.author + " align=" + start + " valign=center " +
                    "style='width:" + cols.author + ";border:none;border-top:" + bTop +
                    ";border-" + end + ":" + bTop + ";margin-" + start + ":10.0pt;margin-top:0pt;margin-bottom:0pt'>" +
                        authorHtml +
                    "</td>" +
                    // Page number cell
                    "<td width=" + cols.paging + " align=center valign=center " +
                    "style='width:" + cols.paging + ";border:none;border-top:" + bTop + ";margin-top:0pt;margin-bottom:0pt'>" +
                        this._buildPageNumberHtml(cfg.pagingLabels) +
                    "</td>" +
                "</tr>" +
            "</table>";
        }

        /**
         * Build the complete hidden header/footer table (MSO specific)
         * @param {string} headerHtml - Header inner HTML
         * @param {string} footerHtml - Footer inner HTML
         * @returns {string}
         * @private
         */
        _buildHiddenHeaderFooterTable(headerHtml, footerHtml) {
            let rows = '';

            if (headerHtml) {
                rows += "<tr><td>" +
                    "<div style='mso-element:header' id='h1'>" +
                        headerHtml +
                    "</div>" +
                "</td></tr>";
            }

            if (footerHtml) {
                rows += "<tr><td>" +
                    "<div style='mso-element:footer' id='f1'>" +
                        footerHtml +
                    "</div>" +
                "</td></tr>";
            }

            if (!rows) return '';

            return "\n    <!-- Hidden table containing header/footer definitions -->\n" +
                "    <table id='hrdftrtbl' border='0' cellspacing='0' cellpadding='0' style='display:none'>" +
                rows +
                "</table>";
        }

        // =====================================================================
        // Template Resolution
        // =====================================================================

        // =====================================================================
        // Output
        // =====================================================================

        /**
         * Build and return the complete Word-compatible HTML string
         * @returns {string}
         */
        // =====================================================================
        // Images
        // =====================================================================

        /** Text width of the page body in CSS px (image size cap). */
        _bodyWidthPx() {
            const T = this.getTemplateOptions();
            const pt = BidiCore.lengthToPt;
            const size = String(T.pageSize || '21cm 29.7cm').trim().split(/\s+/);
            const w = pt(size[0]);                  // pageSize is already width × height as laid out
            const m = String(T.pageMargin || '2cm').trim().split(/\s+/).map(pt);
            const left = m.length === 4 ? m[3] : (m.length >= 2 ? m[1] : m[0]);
            const right = m.length >= 2 ? m[1] : m[0];
            return Math.max(50, (w - left - right) * 96 / 72);
        }

        /**
         * MHTML part for a resolved image: 'imageNNN.ext' (deduplicated by
         * source). Null outside an MHTML build or when the image is missing.
         */
        _mhtImagePart(src) {
            const mht = this._mht;
            const rec = mht && this._images ? this._images.get(src) : null;
            if (!rec) return null;
            // one part per distinct image content (a logo used twice is stored once)
            if (!mht.bySrc.has(rec.base64)) {
                const name = 'image' + String(mht.images.length + 1).padStart(3, '0') + '.' + rec.ext;
                mht.images.push({ name: name, rec: rec });
                mht.bySrc.set(rec.base64, name);
            }
            return { name: mht.bySrc.get(rec.base64), rec: rec };
        }

        /** MHTML: point every resolved <img> at its part, with its display size. */
        _embedImages(root) {
            if (!this._mht) return;
            const self = this, maxW = this._bodyWidthPx();
            root.querySelectorAll('img[src]').forEach(function (img) {
                const part = self._mhtImagePart(img.getAttribute('src'));
                if (!part) return;              // not resolved: keep the URL (Word may fetch it)
                const sz = ImageCore.displaySize(img, part.rec, maxW);
                img.setAttribute('src', self._mht.folder + '/' + part.name);
                img.setAttribute('width', sz.width);
                img.setAttribute('height', sz.height);
                img.removeAttribute('style');
            });
        }

        /**
         * Header logo: a real image when the value is an image source (a
         * registered name, data URI, URL or image path), otherwise text.
         * Height from header.logoHeight (default 1cm), width by its ratio.
         */
        _hfLogo(cfg) {
            const v = cfg.logo;
            if (!(typeof ImageCore !== 'undefined' && ImageCore.looksLikeImage(v, this._images))) return this._hfText(v);
            const hPx = BidiCore.lengthToPt(cfg.logoHeight || '1cm') * 96 / 72;
            const esc = this._escapeHtml.bind(this);
            const part = this._mhtImagePart(v);
            if (part) {
                // logoHeight, narrowed to fit the logo column
                const cellW = this._bodyWidthPx() * (parseFloat(this._config.headerColumns.logo) || 10) / 100 - 8;
                const sz = ImageCore.fit(hPx * part.rec.width / part.rec.height, hPx, cellW, 0);
                return '<img src="' + part.name + '" width=' + Math.round(sz.width) + ' height=' + Math.round(sz.height) + ' alt="logo">';
            }
            if (/^(data:image\/|https?:)/i.test(v)) return '<img src="' + esc(v) + '" height=' + Math.round(hPx) + ' alt="logo">';
            return this._hfText(v);          // not resolvable here (toHtml without images)
        }

        /**
         * The .doc file as MHTML (a "Single File Web Page", which Word opens
         * as a .doc): images embedded byte for byte, header/footer in their
         * own part (referenced from the section's @page), so no hidden table
         * is left in the body. Resolves images first (async).
         * @returns {Promise<Blob>} type application/msword
         */
        async toBlob() {
            return new Blob([await this.toMhtml()], { type: 'application/msword' });
        }

        /** @returns {Promise<string>} the MHTML text (see toBlob) */
        async toMhtml() {
            if (this._images && typeof document !== 'undefined') {
                const srcs = ImageCore.collectSources(this._contentHtml);
                const h = this._config.header, f = this._config.footer;
                if (h && h.mode === 'structured' && ImageCore.looksLikeImage(h.logo, this._images)) srcs.push(h.logo);
                [h, f].forEach(function (c) { if (c && c.mode === 'html') ImageCore.collectSources(c.html).forEach(function (x) { srcs.push(x); }); });
                await this._images.resolveAll(srcs);
            }
            const NAME = 'document', folder = NAME + '_files', base = 'file:///C:/' + NAME;
            this._mht = { folder: folder, images: [], bySrc: new Map() };
            let r;
            try { r = this._compose(true); } finally { var mht = this._mht; this._mht = null; }

            let html = r.html;
            const hf = r.headerHtml || r.footerHtml;
            if (hf) {
                if (r.headerHtml) html = html.replace('mso-header: h1;', 'mso-header: url("' + folder + '/header.htm") h1;');
                if (r.footerHtml) html = html.replace('mso-footer: f1;', 'mso-footer: url("' + folder + '/header.htm") f1;');
            }
            html = html.replace(/<head>/i, '<head>\n<link rel=File-List href="' + folder + '/filelist.xml">');

            const parts = [{ loc: base + '.htm', type: 'text/html; charset="utf-8"', qp: html }];
            mht.images.forEach(function (im) {
                parts.push({ loc: base + '_files/' + im.name, type: im.rec.mime, b64: im.rec.base64 });
            });
            const files = mht.images.map(function (im) { return im.name; });
            if (hf) {
                parts.push({
                    loc: base + '_files/header.htm', type: 'text/html; charset="utf-8"',
                    qp: '<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" ' +
                        'xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">\n<head>\n' +
                        '<meta http-equiv=Content-Type content="text/html; charset=utf-8">\n' +
                        '<link id=Main-File rel=Main-File href="../' + NAME + '.htm">\n</head>\n<body>\n' +
                        (r.headerHtml ? "<div style='mso-element:header' id=h1>" + r.headerHtml + '</div>\n' : '') +
                        (r.footerHtml ? "<div style='mso-element:footer' id=f1>" + r.footerHtml + '</div>\n' : '') +
                        '</body>\n</html>\n'
                });
                files.push('header.htm');
            }
            parts.push({
                loc: base + '_files/filelist.xml', type: 'text/xml; charset="utf-8"',
                qp: '<xml xmlns:o="urn:schemas-microsoft-com:office:office">\n <o:MainFile HRef="../' + NAME + '.htm"/>\n' +
                    files.map(function (f) { return ' <o:File HRef="' + f + '"/>\n'; }).join('') +
                    ' <o:File HRef="filelist.xml"/>\n</xml>\n'
            });
            return buildMhtml(parts);
        }

        /**
         * Plain Word HTML — for debugging. Images keep their original
         * sources (Word fetches web URLs when opening, nothing is embedded)
         * and the header/footer sit in the hidden table. Use toBlob() / save()
         * for the real .doc.
         * @returns {string}
         */
        toHtml() {
            const r = this._compose(false);
            return r.html + r.hiddenTable + "\n</body>\n</html>";
        }

        /**
         * One build. mhtml=true: images point at their MHTML parts and the
         * header/footer are returned separately (no hidden table).
         * @returns {{ html, headerHtml, footerHtml, hiddenTable }}
         * @private
         */
        _compose(mhtml) {
            // Step 1: Parse ONCE, run every DOM transform on the same tree,
            //         serialize ONCE. Order matters:
            //           br→p  →  direction resolve  →  element overrides
            //           →  blockquote→MsoQuote  →  pre→code table  →  box spacers
            //           →  Mso classes
            //           →  BiDi runs
            let bodyHtml;
            if (typeof document !== 'undefined') {
                const root = BidiCore.inertRoot();          // parsed without loading images
                root.innerHTML = this._contentHtml;
                BidiCore.unwrapCodeBlocks(root);      // preview decoration out, first
                this._convertLineBreaksToParagraphs(root);
                this._resolveDirectionality(root);
                if (this._config.toc) BidiCore.insertToc(root, { levels: this._config.toc.levels, title: this._config.toc.title, dir: this._resolvedDir });
                this._applyElementDirectionOverrides(root);
                this._applyColumnWidths(root);
                this._convertBlockquotesToQuoteParagraphs(root);
                this._convertCodeBlocks(root);
                this._separateAdjacentBlocks(root);
                this._fitTablesInListItems(root);
                this._renderToc(root);
                this._assignWordStyleClasses(root);
                this._wrapBidiRuns(root);
                if (mhtml) this._embedImages(root);
                bodyHtml = root.innerHTML
                    // the table of contents as Word's content control (the "Update Table" button)
                    .replace(/<div data-kelk-sdt="toc"[^>]*>/, '<w:Sdt SdtDocPart="t" DocPartType="Table of Contents" DocPartUnique="t" ID="-1694142144">')
                    .replace('</div><!--kelk-sdt-end-->', '</w:Sdt>')
                    .replace('<!--kelk-sdtpr-->', '<w:sdtPr></w:sdtPr>');
            } else {
                // Non-browser fallback: only the string-safe steps
                bodyHtml = this._convertLineBreaksToParagraphsString(this._contentHtml);
                this._resolveDirectionality(bodyHtml);
            }
            const direction = this._resolvedDir;

            // Step 2: Generate the template with resolved direction
            const factory = this._resolveTemplateFactory();
            const templateOptions = Object.assign({}, this._config.template, { direction: direction });
            if (!templateOptions.codeBidiFont) {
                const cbf = this._codeBidiFont(this.getTemplateOptions());
                if (cbf !== this.getTemplateOptions().codeFont) templateOptions.codeBidiFont = cbf;
            }
            delete templateOptions.pageSizeName;   // builder-internal bookkeeping
            const template = factory(templateOptions);

            // Step 3: Determine header/footer HTML
            let headerHtml = '';
            let footerHtml = '';

            if (this._headerFooterCallback) {
                const result = this._headerFooterCallback({
                    config: this._config,
                    direction: this._hfDir(),          // header/footer direction
                    docDirection: direction,           // content direction
                    pagingLabels: this._pagingLabels(this._config.footer.pagingLabels),
                    hfText: this._hfText.bind(this),
                    buildPageNumberHtml: this._buildPageNumberHtml.bind(this)
                });
                headerHtml = result.headerHtml || '';
                footerHtml = result.footerHtml || '';
            } else {
                headerHtml = this._buildHeaderHtml();
                footerHtml = this._buildFooterHtml();
            }

            // Step 4: Build the hidden header/footer definitions table (plain HTML only)
            const hiddenTable = mhtml ? '' : this._buildHiddenHeaderFooterTable(headerHtml, footerHtml);

            // Step 5: Assemble final document
            const spacer = this._buildSpacerParagraph();
            const leadingSpacer = this._needsLeadingSpacer(bodyHtml)
                ? spacer + "\n        "
                : '';
            
            const html = template +
                "<div class=\"WordSection1\" dir=\"" + this._dirAttr() + "\">\n" +
                "        " + leadingSpacer + bodyHtml + "\n" +
                "        " + spacer + "\n" +
                "</div>";
            return mhtml
                ? { html: html + "\n</body>\n</html>", headerHtml: headerHtml, footerHtml: footerHtml, hiddenTable: '' }
                : { html: html, headerHtml: headerHtml, footerHtml: footerHtml, hiddenTable: hiddenTable };
        }

        /**
         * Save as .doc file (no external FileSaver dependency)
         * @param {string} filename - Output filename (default: 'document.doc')
         * @returns {WordHtmlBuilder}
         */
        async save(filename = 'document.doc') {
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
    }

    // =========================================================================
    // Export (UMD)
    // =========================================================================
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { WordHtmlBuilder, WordHtmlBuilderError };
    } else if (typeof define === 'function' && define.amd) {
        define([], function() {
            return { WordHtmlBuilder, WordHtmlBuilderError };
        });
    } else {
        global.WordHtmlBuilder = WordHtmlBuilder;
        global.WordHtmlBuilderError = WordHtmlBuilderError;
    }

})(typeof window !== 'undefined' ? window : this);
