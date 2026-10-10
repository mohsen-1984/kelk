/**
 * HtmlBuilder - a standalone .html file from HTML content
 * ============================================================================
 * Version: 1.5
 *
 * Made first for Persian, and for every right-to-left language (Arabic, Hebrew,
 * Urdu, Kurdish, Pashto …) and their mix with left-to-right text — and just as
 * usable for purely left-to-right documents (English, French, German, Spanish,
 * Greek, Russian …): the direction rules switch themselves off where there is
 * nothing to decide.
 *
 * The fourth Kelk builder, with the same API as WordHtmlBuilder, DocxBuilder
 * and PdfBuilder (BuilderBase): one self-contained file that opens in any
 * browser, offline, and prints like the other outputs.
 *
 *   - direction   BidiView over BidiCore — the same decisions as the Word and
 *                 PDF files; the browser's own BiDi algorithm does the rest
 *   - styling     the template (createMsoTemplate.DEFAULTS + setTemplateOptions):
 *                 heading sizes and colors, tables, quotes, code, line spacing
 *   - fonts       embedded as base64 @font-face — registerWebFonts() — for the
 *                 families in use; the rest falls back to the reader's fonts
 *   - images      embedded as data URIs (registered names, data URIs, URLs
 *                 ImageCore can read)
 *   - formulas    LaTeX placeholders of MathCore (lib/MathCore.js) as SVG
 *                 (default, the same drawing as the other outputs) or native
 *                 MathML — setMath({ mode: 'svg'|'mathml' }); without MathCore
 *                 the TeX is written as text
 *   - page        @page size and margins for printing; on screen the text
 *                 column has the width of the page's text area
 *   - header / footer  simple, structured (logo | title | edition,
 *                 author | paging), custom HTML or a callback; page numbers
 *                 appear when printing (CSS page-margin boxes, where supported)
 *
 * Usage:
 *   const html = await HtmlBuilder.create()
 *       .configure({ fonts: { bidi: 'Vazirmatn', latin: 'Vazirmatn' }, header: { title: 'گزارش' } })
 *       .registerWebFonts(window.KelkWebFonts)        // { family: [{ weight, style, format, data }] }
 *       .addFromHtml(previewHtml)
 *       .toHtml();                                   // or toBlob() / save('report.html')
 *
 * setHeaderFooterCallback(fn): fn(ctx) → { headerHtml, footerHtml }, with
 * ctx = { config, direction (header/footer), docDirection, title, pagingLabels }.
 *
 * Needs a DOM (browser). Load order: ImageCore, (MathCore,) BidiCore, BidiView,
 * msOfficeWordHtmlTemplate, BuilderBase, HtmlBuilder.
 */

(function (global) {
    'use strict';

    const isNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
    const BuilderBase = isNode ? require('./BuilderBase.js') : global.BuilderBase;
    const BidiCore = isNode ? require('./BidiCore.js') : global.BidiCore;
    const BidiView = isNode ? require('./BidiView.js') : global.BidiView;
    const MathCore = isNode ? (function () { try { return require('./MathCore.js'); } catch (e) { return null; } })() : global.MathCore;
    if (!BuilderBase || !BidiCore) throw new Error('HtmlBuilder requires BuilderBase.js and BidiCore.js — load them first');

    class HtmlBuilderError extends Error {
        constructor(message, cause = null) {
            super(message);
            this.name = 'HtmlBuilderError';
            this.cause = cause;
        }
    }

    const DEFAULTS = {
        direction: 'auto',
        endPunctuation: ['.', ':'],
        pagingLabels: null,
        header: { mode: 'none' },
        footer: { mode: 'none' },
        codeBlock: { showLanguage: true, fallbackLabel: 'code', rtlFont: 'code', nestedFrames: true },
        lineHeight: 1.6,            // screen line height at the template's 100% (Persian fonts need room)
        template: {}
    };

    /** highlight.js "GitHub" colors (BSD-3-Clause) */
    const HLJS_CSS =
        '.hljs-doctag,.hljs-keyword,.hljs-meta .hljs-keyword,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language_{color:#d73a49}' +
        '.hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_{color:#6f42c1}' +
        '.hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id,.hljs-variable{color:#005cc5}' +
        '.hljs-meta .hljs-string,.hljs-regexp,.hljs-string{color:#032f62}.hljs-built_in,.hljs-symbol{color:#e36209}.hljs-code,.hljs-comment,.hljs-formula{color:#6a737d}' +
        '.hljs-name,.hljs-quote,.hljs-selector-pseudo,.hljs-selector-tag{color:#22863a}.hljs-section{color:#005cc5;font-weight:700}.hljs-bullet{color:#735c0f}' +
        '.hljs-emphasis{font-style:italic}.hljs-strong{font-weight:700}.hljs-addition{color:#22863a;background-color:#f0fff4}.hljs-deletion{color:#b31d28;background-color:#ffeef0}';

    const FONT_MIME = { woff2: 'font/woff2', woff: 'font/woff', truetype: 'font/ttf', ttf: 'font/ttf', opentype: 'font/otf' };

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function q(family) { return '"' + String(family).replace(/"/g, '') + '"'; }

    /** Word's 'solid windowtext 1.0pt' → CSS '1pt solid #000'. */
    function cssBorderOf(v, fallback) {
        const b = BidiCore.cssBorder(v);
        if (!b) return fallback || 'none';
        return b.width + 'pt ' + b.style + ' ' + (b.color === 'windowtext' ? '#000' : b.color);
    }

    class HtmlBuilder extends BuilderBase {

        constructor(config = {}) {
            super(config, { defaults: DEFAULTS, Error: HtmlBuilderError });
            this._webFonts = {};        // family (lower case) → { family, faces: [...] }
        }

        static create(config = {}) { return new HtmlBuilder(config); }

        // ── fonts ────────────────────────────────────────────────────────────

        /**
         * Web fonts to embed: { family: [{ weight, style, format, data }] }
         * (the format of Kelk's assets/fonts/embed/*.js — data is base64).
         * Only the families the document uses (bidi, latin, code) are written.
         */
        registerWebFonts(fonts) {
            Object.keys(fonts || {}).forEach(function (family) {
                this.registerWebFont(family, fonts[family]);
            }, this);
            return this;
        }

        /** One family: registerWebFont('Vazirmatn', [{ weight: '100 900', style: 'normal', format: 'woff2', data }]) */
        registerWebFont(family, faces) {
            const list = (Array.isArray(faces) ? faces : [faces]).filter(function (f) { return f && f.data; });
            if (list.length) this._webFonts[String(family).toLowerCase()] = { family: family, faces: list };
            return this;
        }

        _fontFaces(families) {
            const self = this, seen = new Set();
            return families.map(function (f) {
                const key = String(f || '').toLowerCase();
                const entry = self._webFonts[key];
                if (!entry || seen.has(key)) return '';
                seen.add(key);
                return entry.faces.map(function (x) {
                    const fmt = x.format || 'woff2';
                    return '@font-face{font-family:' + q(entry.family) + ';src:url(data:' + (FONT_MIME[fmt] || 'font/' + fmt) +
                        ';base64,' + x.data + ') format("' + fmt + '");font-weight:' + (x.weight || 'normal') +
                        ';font-style:' + (x.style || 'normal') + ';font-display:swap}';
                }).join('\n');
            }).filter(Boolean).join('\n');
        }

        // ── images ───────────────────────────────────────────────────────────

        _imageUri(src) {
            const rec = this._images ? this._images.get(src) : null;
            return rec ? 'data:' + rec.mime + ';base64,' + rec.base64 : null;
        }

        _embedImages(root) {
            const self = this;
            root.querySelectorAll('img[src]').forEach(function (img) {
                const src = img.getAttribute('src');
                if (/^data:/i.test(src)) return;                  // already embedded (an SVG stays vector)
                const rec = self._images ? self._images.get(src) : null;
                if (!rec) return;
                img.setAttribute('src', 'data:' + rec.mime + ';base64,' + rec.base64);
                // a rasterized or scaled image keeps its display size (CSS px)
                if (!img.hasAttribute('width') && !img.hasAttribute('height') && rec.width) img.setAttribute('width', rec.width);
            });
        }

        // ── code blocks ──────────────────────────────────────────────────────

        _frameCode(root) {
            const o = this._config.codeBlock || {};
            root.querySelectorAll('pre').forEach(function (pre) {
                if (pre.parentElement && pre.parentElement.classList.contains('code')) return;
                const box = pre.ownerDocument.createElement('div');
                box.className = 'code';
                const lang = BidiCore.codeLanguage(pre) || o.fallbackLabel || '';
                if (o.showLanguage !== false && lang) {
                    const bar = pre.ownerDocument.createElement('div');
                    bar.className = 'code-lang';
                    bar.textContent = lang;
                    box.appendChild(bar);
                }
                pre.parentNode.insertBefore(box, pre);
                box.appendChild(pre);
                const code = pre.querySelector('code') || pre;
                if (o.nestedFrames !== false) HtmlBuilder._frameNested(code);
            });
        }

        /**
         * Frames around fenced blocks written inside a code block (a ````md
         * block showing ```js examples) — the text stays raw, as in the other outputs.
         */
        static _frameNested(code) {
            const text = code.textContent;
            const trailing = /\n$/.test(text) ? '\n' : '';
            const lines = text.replace(/\n$/, '').split('\n');
            const segs = BidiCore.codeSegments(lines.join('\n'));
            if (!segs.some(function (x) { return x.nested; })) return;
            const doc = code.ownerDocument;
            function build(items, parent) {
                items.forEach(function (x, i) {
                    if (x.lines) parent.appendChild(BidiCore.codeFragment(code, x.lines[0], x.lines[1]));
                    else {
                        const frame = doc.createElement('span');
                        frame.className = 'code-nested';
                        build(x.items, frame);
                        parent.appendChild(frame);
                    }
                    if (i < items.length - 1) parent.appendChild(doc.createTextNode('\n'));
                });
            }
            const frag = doc.createDocumentFragment();
            build(segs, frag);
            if (trailing) frag.appendChild(doc.createTextNode(trailing));
            code.textContent = '';
            code.appendChild(frag);
        }

        // ── header / footer ──────────────────────────────────────────────────

        _hfDir(docDir) {
            const d = this._config.headerFooterDirection;
            return d === 'rtl' || d === 'ltr' ? d : docDir;
        }

        _pagingLabels(labels, dir) {
            return labels || this._config.pagingLabels || BuilderBase.DEFAULT_PAGING_LABELS[dir];
        }

        /** Logo cell: a registered/URL image, else the text. */
        _logoHtml(h) {
            const uri = h.logo ? this._imageUri(h.logo) : null;
            if (uri) {
                const hpt = BidiCore.cssPt(h.logoHeight) || 28;
                return '<img src="' + uri + '" alt="logo" style="height:' + hpt + 'pt;width:auto">';
            }
            return esc(h.logo || '');
        }

        /** Custom header/footer HTML with its fields ({page}/{pages} only when printing). */
        _customHtml(c, dir, title) {
            const box = document.createElement('div');
            box.innerHTML = c.html;
            box.querySelectorAll('style, script, link, meta').forEach(function (e) { e.remove(); });
            this._embedImages(box);
            const filled = BidiCore.hfFields(box, {
                title: c.title || title,
                date: BidiCore.hfDate(dir, c.dateLocale),
                page: function (n, doc) { const s = doc.createElement('span'); s.className = 'hf-page'; return s; },
                pages: function (n, doc) { const s = doc.createElement('span'); s.className = 'hf-pages'; return s; }
            });
            return filled.innerHTML;
        }

        _headerFooter(docDir, title) {
            const cfg = this._config, dir = this._hfDir(docDir);
            const h = cfg.header || {}, f = cfg.footer || {};
            let header = '', footer = '', paging = null;

            if (h.mode === 'callback' || f.mode === 'callback') {
                const r = this._headerFooterCallback({ config: cfg, direction: dir, docDirection: docDir, title: title,
                    pagingLabels: this._pagingLabels(null, dir) }) || {};
                header = r.headerHtml || '';
                footer = r.footerHtml || '';
            } else {
                const B = cfg.borders || BuilderBase.SHARED_DEFAULTS.borders;
                const bBottom = cssBorderOf(B.headerBottom, '1pt solid #000');
                const bDivider = cssBorderOf(B.headerCellDivider, '1pt solid #9d9d9d');
                const bTop = cssBorderOf(B.footerTop, '1pt solid #000');
                if (h.mode === 'simple') {
                    header = '<p class="hf-simple" style="border-bottom:' + bBottom + ';padding-bottom:4pt">' + esc(h.text) + '</p>';
                } else if (h.mode === 'structured') {
                    // logo | title | edition, dividers on both sides of the title (as in Word)
                    const c = cfg.headerColumns || BuilderBase.SHARED_DEFAULTS.headerColumns;
                    const cell = 'border-bottom:' + bBottom + ';';
                    header = '<table class="hf-table"><tr>' +
                        '<td class="hf-logo" style="width:' + c.logo + ';' + cell + '">' + this._logoHtml(h) + '</td>' +
                        '<td class="hf-title" style="width:' + c.title + ';' + cell + 'border-left:' + bDivider + ';border-right:' + bDivider + '">' + esc(h.title) + '</td>' +
                        '<td class="hf-edition" style="width:' + c.edition + ';' + cell + '">' + esc(h.edition) + '</td></tr></table>';
                } else if (h.mode === 'html') header = this._customHtml(h, dir, title);

                // page numbers: only paper has pages — the @page margin box prints them
                if (f.mode === 'simple') {
                    paging = this._pagingLabels(f.pagingLabels, dir);
                } else if (f.mode === 'structured') {
                    // author (| link) at the start, page numbers at the end, a divider between (as in Word)
                    paging = this._pagingLabels(f.pagingLabels, dir);
                    const c = cfg.footerColumns || BuilderBase.SHARED_DEFAULTS.footerColumns;
                    let who = esc(f.author);
                    if (f.link) who += ' | <a href="' + esc(f.link) + '"><span dir="ltr">' + esc(f.link.replace(/^https?:\/\//, '')) + '</span></a>';
                    footer = '<table class="hf-table"><tr>' +
                        '<td class="hf-author" style="width:' + c.author + ';border-top:' + bTop + ';border-inline-end:' + bTop + '">' + who + '</td>' +
                        '<td class="hf-paging" style="width:' + c.paging + ';border-top:' + bTop + '"></td></tr></table>';
                } else if (f.mode === 'html') footer = this._customHtml(f, dir, title);
            }
            return {
                dir: dir,
                header: header ? '<header class="kelk-header" dir="' + dir + '">' + header + '</header>' : '',
                footer: footer ? '<footer class="kelk-footer" dir="' + dir + '">' + footer + '</footer>' : '',
                paging: paging
            };
        }

        // ── styles ───────────────────────────────────────────────────────────

        /**
         * The document stylesheet. preview = true: only the document's own rules
         * (.doc …) — no fonts to embed, no page box, header/footer or print rules
         * (PreviewBuilder puts it in the app page).
         */
        _css(T, docDir, families, hf, widthPx, preview) {
            const lh = (parseFloat(T.lineHeight) / 100 || 1.1) / 1.1 * (this._config.lineHeight || 1.6);
            const lhTight = (parseFloat(T.lineHeightTight) / 100 || 1) / 1.1 * (this._config.lineHeight || 1.6);
            const bidi = q(T.bidiFont), latin = q(T.latinFont);
            const latinStack = latin + ',' + (T.latinFontFallback || 'sans-serif');
            const codeStack = q(T.codeFont) + ',ui-monospace,Consolas,' + (T.codeFontFallback || 'monospace');
            const rtlCode = (this._config.codeBlock || {}).rtlFont === 'document' ? bidi + ',' : '';
            const heads = (T.headings || []).map(function (h, i) {
                const top = Math.max(0, (T.headingMarginTopBase || 20) - (i + 1) * 2);
                return '.doc h' + (i + 1) + '{font-size:' + h.size + ';color:' + h.color + ';margin:' + top + 'pt 0 ' + (T.headingMarginBottom || '6pt') +
                    (h.italic ? ';font-style:italic' : '') + '}';
            }).join('\n');
            const out = [
                preview ? '' : this._fontFaces(families),
                preview ? '' : '*{box-sizing:border-box}',
                preview ? '' : 'html{background:#f4f4f2}',
                preview ? '' : 'body{margin:0;padding:24px 12px;color:#1c1b1a}',
                preview ? '' : '.page{max-width:' + Math.round(widthPx + 96) + 'px;margin:0 auto;background:#fff;padding:40px 48px;box-shadow:0 1px 4px rgba(0,0,0,.08)}',
                '.doc{font-family:' + bidi + ',' + latinStack + ';font-size:' + T.bidiFontSize + ';line-height:' + lh.toFixed(2) +
                    ';--bd-base:' + (T.listIndent || '24pt') + ';--bd-step:' + (T.listIndentStep || '18pt') + '}',
                // Latin text in the Latin font and size, as Word shows it
                '.doc .bd-ltr,.doc .bd-iso-ltr:not(code){font-family:' + latinStack + '}',
                '.doc .bd-rtl,.doc .bd-iso-rtl:not(code){font-family:' + bidi + ',' + latinStack + '}',
                '.doc p{margin:' + (T.paraMarginTop || '4pt') + ' 0 ' + (T.paraMarginBottom || '6pt') + '}',
                // one body alignment for every language (BidiView's own start rule is overridden);
                // a long URL/path (.kelk-start) and headings stay at start
                '.doc :is(p,li),.doc.bd-root :is(p,li):is(.bd-ltr,.bd-rtl){text-align:' + (T.textAlign || 'justify') + '}',
                '.doc :is(p,li).kelk-start,.doc.bd-root :is(p,li).kelk-start:is(.bd-ltr,.bd-rtl){text-align:start}',
                heads,
                '.doc a{color:' + (T.linkColor || '#0563C1') + '}.doc a:visited{color:' + (T.linkVisitedColor || '#954F72') + '}',
                '.doc ul,.doc ol{margin:.3em 0}.doc li{line-height:' + lhTight.toFixed(2) + ';margin-block:0 ' + (T.listItemSpaceAfter || '1.5pt') + '}',
                '.doc ol ol,.doc ol ol ol{list-style-type:decimal}.doc li:has(>input[type=checkbox]){list-style:none}',
                '.doc table{border-collapse:collapse;margin:.5em auto 1em;max-width:100%}.doc table.kelk-fit{table-layout:fixed}',
                // lines, fills and bold come from the table style, on each cell (_paintTables)
                '.doc th,.doc td{padding:3pt 6pt;vertical-align:top;line-height:' + lhTight.toFixed(2) + '}',
                // cells: the Markdown alignment wins; without one, th center and td start
                '.doc th:not([align]),.doc.bd-root th:not([align]):is(.bd-ltr,.bd-rtl){text-align:center}',
                '.doc blockquote{margin:.5em 0;margin-inline-start:' + (T.quoteIndent || '14pt') + ';padding:.2em 0;padding-inline-start:' + (T.quotePadding || '12pt') +
                    ';border-inline-start:' + (T.quoteBorderWidth || '3.5pt') + ' solid ' + (T.quoteBorderColor || '#C07030') + ';color:' + (T.quoteTextColor || '#4A4A4A') +
                    // a filled quote: the fill reaches past its text at the end side, corners rounded —
                    // clearly at the end side, slightly at the bar's ends (a quote without a fill: the bar's ends only)
                    (T.quoteBg ? ';background:' + T.quoteBg + ';padding-block:.35em;padding-inline-end:.7em;border-radius:3px 8px 8px 3px;border-start-start-radius:3px;border-end-start-radius:3px;border-start-end-radius:8px;border-end-end-radius:8px'
                               : ';border-radius:2px') + '}',
                '.doc blockquote p{margin:.2em 0}',
                '.doc code{font-family:' + codeStack + ';font-size:' + T.codeFontSize + ';background:#f4f2ee;padding:.05em .3em;border-radius:3px}',
                '.doc code :is(.bd-iso-rtl){font-family:' + rtlCode + codeStack + '}',
                '.doc .code{margin:.6em 0;border:' + cssBorderOf(T.codeBlockBorder, '1px solid darkgreen') + ';background:' + (T.codeBlockBg || '#FFFDF7') + ';color:#1c1b1a;direction:ltr;border-radius:6px;overflow:hidden}',
                '.doc .code-lang{background:' + (T.codeHeaderBg || '#EDEDED') + ';border-bottom:' + cssBorderOf(T.codeBlockBorder, '1px solid darkgreen') + ';color:' + (T.codeHeaderColor || '#595959') + ';font:' + (T.codeHeaderFontSize || '8pt') + ' ' + codeStack + ';padding:2pt 6pt;text-align:left}',
                '.doc pre{margin:0;padding:6pt 8pt;overflow-x:auto;direction:ltr;text-align:left;line-height:' + lhTight.toFixed(2) + '}',
                '.doc pre code{background:none;padding:0;font-size:' + T.codeFontSize + '}',
                '.doc img{max-width:100%;height:auto}.doc hr{border:0;border-top:1px solid #a0a0a0}',
                '.doc table.kelk-fit :is(td,th){overflow-wrap:anywhere}',
                // table of contents
                '.doc .kelk-toc-title{font-weight:700;font-size:' + (T.tocHeadingFontSize || '14pt') + ';color:' + (T.tocHeadingColor || '#2F5496') + ';margin:0 0 6pt}',
                '.doc .kelk-toc-entry,.doc.bd-root .kelk-toc-entry:is(.bd-ltr,.bd-rtl){margin-block:2pt;text-align:start}',
                '.doc .kelk-toc-entry a{color:inherit;text-decoration:none}.doc .kelk-toc-entry a:hover{text-decoration:underline}',
                '.doc .toc-1{font-weight:600}' + [2, 3, 4, 5, 6].map(function (n) {
                    return '.doc.bd-root .kelk-toc-entry.toc-' + n + ',.doc .toc-' + n + '{margin-inline-start:calc(' + (n - 1) + ' * ' + (T.listIndentStep || '18pt') + ')}';
                }).join(''),
                // header / footer
                '.kelk-header,.kelk-footer{font-family:' + bidi + ',' + latinStack + ';font-size:9pt;color:#333}',
                '.kelk-header{margin-bottom:12pt}.kelk-footer{margin-top:16pt}',
                '.hf-table{width:100%;border-collapse:collapse}.hf-table td{padding:3pt 5pt;vertical-align:middle;text-align:center}',
                '.hf-table td.hf-author{text-align:start}.hf-title{font-weight:700}',
                '.hf-simple{text-align:center;margin:0}',
                '.doc .code-nested{display:inline-block;width:100%;border:1px solid ' + ((BidiCore.cssBorder(T.codeBlockBorder) || {}).color || 'darkgreen') +
                    ';border-radius:3px;padding:1px 5px;margin:1px 0;vertical-align:top}',
                typeof BidiView !== 'undefined' && BidiView ? BidiView.css() : '',
                hf.math && MathCore ? MathCore.css({ textFont: T.bidiFont }) : '',
                HLJS_CSS
            ];
            if (preview) return out.filter(Boolean).join('\n');
            out.push(
                // print: the paper takes over
                '@page{size:' + T.pageSize + ';margin:' + T.pageMargin + (hf.paging
                    ? ';@bottom-center{content:"' + hf.paging.page + ' " counter(page) " ' + hf.paging.from + ' " counter(pages);font-size:9pt}'
                    : '') + '}',
                '@media print{html,body{background:#fff}body{padding:0}.page{max-width:none;padding:0;box-shadow:none}.doc .code,.doc table,.doc img{break-inside:avoid}}'
            );
            return out.filter(Boolean).join('\n');
        }

        /**
         * The table style (BuilderBase._tableStyleGrid) on each cell: its four
         * lines, fill, text color and weight, as inline styles — the preview
         * and the export paint the same. Runs after the directions: start and
         * end become the physical sides of each table's own direction.
         * @param {HTMLElement} root
         * @param {'rtl'|'ltr'} rootDir - the document's direction
         */
        _paintTables(root, rootDir) {
            const self = this;
            const tableDir = function (table) {
                for (let n = table; n && n !== root; n = n.parentElement) {
                    const c = n.classList;
                    if (c && (c.contains('bd-ltr-table') || c.contains('bd-ltr'))) return 'ltr';
                    if (c && c.contains('bd-rtl')) return 'rtl';
                    const d = n.getAttribute && n.getAttribute('dir');
                    if (d === 'rtl' || d === 'ltr') return d;
                }
                return rootDir;
            };
            root.querySelectorAll('table').forEach(function (table) {
                if (table.closest('pre') || table.classList.contains('hf-table') || !table.rows.length) return;
                const g = self._tableStyleGrid(table);
                const rtl = tableDir(table) === 'rtl';
                const line = g.width + 'pt solid ' + g.color;
                // the default black lines: the app's dark theme may lighten them (styles/preview.css)
                table.classList.toggle('kelk-tb-black', /^#0{3}(0{3})?$/.test(g.color));
                Array.from(table.rows).forEach(function (tr, i) {
                    const r = g.rows[i];
                    Array.from(tr.cells).forEach(function (cell) {
                        const b = g.cells.get(cell), st = cell.style;
                        st.borderTop = b.top ? line : 'none';
                        st.borderBottom = b.bottom ? line : 'none';
                        st.borderLeft = (rtl ? b.end : b.start) ? line : 'none';
                        st.borderRight = (rtl ? b.start : b.end) ? line : 'none';
                        st.background = r.background || '';
                        st.color = r.color || '';
                        st.fontWeight = r.bold ? 'bold' : 'normal';
                        // alignment: the column's own (align="…") wins; else a header row is
                        // centered (headerCenter) and every other cell — a th too — starts
                        if (!cell.getAttribute('align')) st.textAlign = r.kind === 'header' && g.headerCenter ? 'center' : 'start';
                    });
                });
            });
        }

        /**
         * Column widths from the content (BidiCore.tableColumnShares) and the
         * table's side (BuilderBase._tableSide), as colgroup + inline styles.
         * o: { width, fontSize, unit: 'pt'|'px' } — the text column (the page, or
         * the preview pane). A second call replaces the first (formulas drawn later).
         */
        _fitTables(doc, o) {
            const cfg = this._config, self = this;
            const docRtl = cfg.direction === 'rtl' || (cfg.direction !== 'ltr' && BidiCore.detectDirection(doc) === 'rtl');
            doc.querySelectorAll('table').forEach(function (table) {
                if (table.closest('pre') || !table.rows.length) return;
                const fit = BidiCore.tableColumnShares(table, { width: o.width, fontSize: o.fontSize, tableWidth: cfg.tableWidth });
                // in a list item or a quote (narrower than the text column): its width in absolute units
                const inBox = table.parentElement && table.parentElement.closest('li, blockquote');
                table.style.width = inBox ? (fit.fraction * o.width).toFixed(1) + (o.unit || 'pt') : (fit.fraction * 100).toFixed(1) + '%';
                const side = self._tableSide(table, docRtl);         // center by the stylesheet
                table.style.marginLeft = side === 'left' ? '0' : side === 'right' ? 'auto' : '';
                table.style.marginRight = side === 'right' ? '0' : side === 'left' ? 'auto' : '';
                const old = table.querySelector(':scope > colgroup.kelk-fit');
                if (old) old.remove();
                const cg = table.ownerDocument.createElement('colgroup');
                cg.className = 'kelk-fit';
                fit.shares.forEach(function (x) { const c = table.ownerDocument.createElement('col'); c.setAttribute('style', 'width:' + (x * 100).toFixed(1) + '%'); cg.appendChild(c); });
                table.insertBefore(cg, table.firstChild);
                table.classList.add('kelk-fit');
            });
        }

        // ── output ───────────────────────────────────────────────────────────

        /** The complete page as a string. */
        async toHtml() {
            if (typeof document === 'undefined') this._fail('HtmlBuilder needs a DOM (browser)');
            await this._resolveImages();
            const cfg = this._config, T = this.getTemplateOptions();

            const doc = document.createElement('article');
            doc.className = 'doc';
            doc.innerHTML = this._contentHtml;
            if (BidiCore.unwrapCodeBlocks) BidiCore.unwrapCodeBlocks(doc);
            if (cfg.toc) {
                const tdir = cfg.direction === 'rtl' || cfg.direction === 'ltr' ? cfg.direction : BidiCore.detectDirection(doc);
                BidiCore.insertToc(doc, { levels: cfg.toc.levels, title: cfg.toc.title, dir: tdir });
                doc.querySelectorAll('.kelk-toc-entry').forEach(function (e) {
                    const a = document.createElement('a');
                    a.href = '#' + e.getAttribute('data-target');
                    while (e.firstChild) a.appendChild(e.firstChild);
                    e.appendChild(a);
                    e.classList.add('toc-' + e.getAttribute('data-level'));
                });
            }
            doc.querySelectorAll('script, style, link, meta').forEach(function (e) { e.remove(); });
            this._embedImages(doc);
            doc.querySelectorAll('p, li').forEach(function (el) {
                if (!el.closest('td, th, pre') && BidiCore.noJustify(el.textContent)) el.classList.add('kelk-start');
            });

            // formulas: SVG or MathML (before the directions: BidiCore reads them as atoms)
            const hasMath = !!doc.querySelector('.kelk-math[data-tex]');
            if (hasMath) {
                if (MathCore) await MathCore.typeset(doc, { mode: (cfg.math || {}).mode || 'svg', textFont: T.bidiFont });
                else doc.querySelectorAll('.kelk-math[data-tex]').forEach(function (el) {
                    const d = el.getAttribute('data-display') === 'block' ? '$$' : '$';
                    el.textContent = d + el.getAttribute('data-tex') + d;
                });
            }

            // column widths from the content (formulas drawn by now): the same shares as the other outputs
            this._fitTables(doc, { width: BidiCore.contentWidthPt(T), fontSize: BidiCore.cssPt(T.bidiFontSize) || 12, unit: 'pt' });

            let dir;
            if (typeof BidiView !== 'undefined' && BidiView) dir = BidiView.apply(doc, { dir: cfg.direction, endPunctuation: cfg.endPunctuation }).dir;
            else dir = cfg.direction === 'rtl' || cfg.direction === 'ltr' ? cfg.direction : BidiCore.detectDirection(doc);
            // code frames AFTER the directions, as in the preview: their bar is chrome, not text
            // (framed first, a list item's text run swallowed the bar of the code inside it)
            this._frameCode(doc);
            this._paintTables(doc, dir);

            const h1 = doc.querySelector('h1');
            const title = (cfg.header && cfg.header.title) || (h1 ? h1.textContent.trim() : '') || 'Document';
            const hf = this._headerFooter(dir, title);
            hf.math = hasMath;
            const widthPx = BidiCore.contentWidthPt(T) * 4 / 3;
            const css = this._css(T, dir, [T.bidiFont, T.latinFont, doc.querySelector('code, pre') ? T.codeFont : ''], hf, widthPx);
            const lang = String(T.bidiLanguage || 'FA').toLowerCase().split('-')[0];

            return '<!DOCTYPE html>\n<html lang="' + (dir === 'rtl' ? lang : 'en') + '" dir="' + dir + '">\n<head>\n<meta charset="utf-8">\n' +
                '<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="generator" content="Kelk HtmlBuilder ' + (BuilderBase.version || '') + '">\n' +
                '<title>' + esc(title) + '</title>\n<style>\n' + css + '\n</style>\n</head>\n<body>\n<div class="page">\n' +
                hf.header + '\n' + doc.outerHTML + '\n' + hf.footer + '\n</div>\n</body>\n</html>\n';
        }

        async toBlob() {
            return new Blob([await this.toHtml()], { type: 'text/html;charset=utf-8' });
        }

        async save(filename = 'document.html') {
            const blob = await this.toBlob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        }
    }

    HtmlBuilder.HtmlBuilderError = HtmlBuilderError;

    if (isNode) module.exports = { HtmlBuilder, HtmlBuilderError };
    else if (typeof define === 'function' && define.amd) define([], function () { return { HtmlBuilder, HtmlBuilderError }; });
    else { global.HtmlBuilder = HtmlBuilder; global.HtmlBuilderError = HtmlBuilderError; }
})(typeof window !== 'undefined' ? window : this);
