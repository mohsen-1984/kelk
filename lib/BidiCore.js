/**
 * BidiCore - Shared direction & BiDi analysis for WordHtmlBuilder, DocxBuilder and PdfBuilder
 * ==============================================================================
 *
 * Version: 1.0
 *
 * One engine, two renderers. Everything here DECIDES; nothing here renders:
 *
 *   detectDirection(root)            document-level direction ('rtl' | 'ltr')
 *   planDirections(root, docIsRTL)   ordered per-element direction decisions
 *   isComplexQuote(bq)               simple (paragraphs) vs table-form quote
 *   flattenBlock(el)                 a block's own text as ONE string + node map
 *   findIsolateRanges(text, dir, o)  counter-direction runs inside a block
 *   codeLanguage(pre)                code block language ('' if none)
 *   unwrapCodeBlocks(root)           strip preview wrappers (mutates)
 *   codeRtlRanges(text)              RTL runs inside code (UBA, LTR context)
 *   nestedFences / codeSegments      fenced blocks written inside a code block
 *   codeFragment(code, from, to)     lines of a highlighted code element
 *
 * WordHtmlBuilder turns the decisions into inline CSS / <span dir>, DocxBuilder
 * into w:bidi paragraphs and w:rtl runs. Keeping the rules in one place means
 * both outputs always agree on what is RTL and what is LTR.
 *
 * All functions are pure with respect to the DOM (they read, never mutate),
 * except where noted. Browser-only parts need `document`.
 */

(function (global) {
    'use strict';

    // =========================================================================
    // Character classes — the single source of truth
    // =========================================================================

    /**
     * Liberal RTL test, used for DOCUMENT-level detection only:
     *   Arabic \u0600-\u06FF, \uFB50-\uFDFF, \uFE70-\uFEFF;
     *   Hebrew \u0590-\u05FF, \uFB1D-\uFB4F; ZWNJ \u200C.
     */
    const RTL_CHAR_PATTERN = /[\u0590-\u05FF\u0600-\u06FF\uFB1D-\uFDFF\uFE70-\uFEFF\u200C]/;

    /**
     * STRONG letter classes, shared by per-element direction and the BiDi run
     * engine so both always agree. Digits (ASCII, Arabic-Indic, Persian), ZWNJ,
     * marks and punctuation (، ؛ ؟ …) are intentionally NOT strong.
     *
     * RTL — the letters of every right-to-left script in the BMP (Unicode
     * Bidi_Class R / AL): Arabic (+ Supplement, Extended-A/B, presentation
     * forms), Hebrew (+ presentation forms), Syriac, Thaana, N'Ko, Samaritan,
     * Mandaic. Persian is just one user of it.
     */
    const RTL_LETTER_PATTERN = new RegExp('[' +
        '\\u0621-\\u063A\\u0641-\\u064A\\u0671-\\u06D3\\u06D5\\u06FA-\\u06FC' +   // Arabic, Persian, Urdu letters
        '\\u0750-\\u077F\\u0870-\\u088E\\u08A0-\\u08C9' +                            // Arabic Supplement, Extended-B/A
        '\\uFB50-\\uFDFF\\uFE70-\\uFEFF' +                                           // Arabic presentation forms A/B
        '\\u05BE\\u05C0\\u05C3\\u05C6\\u05D0-\\u05EA\\u05EF-\\u05F4' +                    // Hebrew letters (+ maqaf, geresh …)
        '\\uFB1D\\uFB1F-\\uFB28\\uFB2A-\\uFB4F' +                                     // Hebrew presentation forms
        '\\u0710\\u0712-\\u072F\\u074D-\\u074F' +                                     // Syriac
        '\\u0780-\\u07A5\\u07B1\\u07CA-\\u07EA' +                                      // Thaana, N'Ko
        '\\u0800-\\u0815\\u0840-\\u0858' +                                            // Samaritan, Mandaic
        ']');

    /**
     * LTR — letters of the left-to-right scripts a document here is likely to
     * mix with RTL text: Latin (incl. Extended-A/B, IPA, Extended Additional:
     * Vietnamese …), Greek (+ Extended), Cyrillic, Armenian, Georgian.
     * × and ÷ (U+00D7, U+00F7) sit inside Latin-1 but are symbols, not letters.
     * (Named LATIN_* for history; it is the generic strong-LTR letter class.)
     */
    const LATIN_LETTER_PATTERN = new RegExp('[' +
        'A-Za-z\\u00AA\\u00B5\\u00BA\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02AF' +       // Latin, IPA
        '\\u1E00-\\u1EFF' +                                                        // Latin Extended Additional
        '\\u0386\\u0388-\\u03FF\\u1F00-\\u1FBC\\u1FC2-\\u1FCC\\u1FD0-\\u1FDB\\u1FE0-\\u1FEC\\u1FF2-\\u1FFC' + // Greek
        '\\u0400-\\u0482\\u048A-\\u052F' +                                            // Cyrillic
        '\\u0531-\\u0556\\u0561-\\u0587' +                                            // Armenian
        '\\u10A0-\\u10FF' +                                                        // Georgian
        ']');

    /**
     * "Numbers-only" cell text: digits with common separators. In an RTL table
     * such cells keep the table direction ("1,234", "98.6%", "2024-01-15").
     */
    const NUMBERS_ONLY_PATTERN = /^[\s0-9%.,#\-–—\/:\\+×x]+$/;

    /** Blocks the BiDi engine processes, and what a block walk must not enter. */
    const BLOCK_SEL = 'p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote';
    const NON_DESCEND = /^(P|H1|H2|H3|H4|H5|H6|LI|TD|TH|BLOCKQUOTE|CODE|PRE)$/;

    /** Quote content a paragraph border cannot follow in one straight line. */
    const COMPLEX_QUOTE_SEL = 'ul, ol, blockquote, pre, table, hr, dl, figure';

    function hasRTL(text) { return RTL_CHAR_PATTERN.test(text); }
    function hasLatin(text) { return LATIN_LETTER_PATTERN.test(text); }
    /** Has a strong RTL letter (Arabic script, Hebrew …)? */
    function hasRtlLetter(text) { return RTL_LETTER_PATTERN.test(text); }
    function hasMix(t) { return LATIN_LETTER_PATTERN.test(t) && RTL_LETTER_PATTERN.test(t); }

    const RTL_LETTERS_G = new RegExp(RTL_LETTER_PATTERN.source, 'g');
    const LATIN_LETTERS_G = new RegExp(LATIN_LETTER_PATTERN.source, 'g');
    const STRONG_ANY = new RegExp(RTL_LETTER_PATTERN.source + '|' + LATIN_LETTER_PATTERN.source);

    /**
     * Should a paragraph NOT be justified? True when it holds a long unbreakable
     * run — a URL, a path, a long identifier — whatever the language: justifying
     * the line before it would stretch the spaces into gaps.
     * @param {string} text
     */
    function noJustify(text) {
        const t = String(text || '');
        return /(?:https?:\/\/|www\.)\S{16,}/i.test(t) || /\S{32,}/.test(t);
    }

    // =========================================================================
    // Table of contents (shared by the builders)
    // =========================================================================

    /** Default ToC title by document direction. */
    const TOC_TITLES = { rtl: 'فهرست مطالب', ltr: 'Contents' };

    /**
     * Insert a table of contents into a parsed document (MUTATES root) and give
     * every listed heading an id. The layout is the same in every output:
     *     <h1>            (when the document opens with one: its title)
     *     <hr>
     *     <div class="kelk-toc"> title + one entry per heading </div>
     *     <hr>
     *     <p class="kelk-spacer">  (an empty paragraph)
     * Without an opening H1 the ToC comes first and the first <hr> is left out.
     * Headings inside quotes, lists and tables are not listed. Each builder then
     * renders div.kelk-toc its own way (Word field, docx SDT, PDF page numbers,
     * HTML links); p.kelk-toc-entry carries data-level and data-target (the id).
     * @param {Element} root
     * @param {{ levels?: number, title?: string, dir?: 'rtl'|'ltr' }} opts
     * @returns {Array<{ id, level, text }>} the entries (empty → nothing inserted)
     */
    function insertToc(root, opts) {
        const o = opts || {};
        const levels = Math.max(1, Math.min(6, parseInt(o.levels, 10) || 2));
        const sel = Array.from({ length: levels }, function (_, i) { return 'h' + (i + 1); }).join(',');
        const doc = root.ownerDocument;
        let n = 0;
        const entries = [];
        root.querySelectorAll(sel).forEach(function (h) {
            if (h.closest('blockquote, li, td, th, pre')) return;
            const text = h.textContent.replace(/\s+/g, ' ').trim();
            if (!text) return;
            if (!h.id) h.id = '_Toc' + (++n);
            entries.push({ id: h.id, level: +h.tagName.charAt(1), text: text });
        });
        if (!entries.length) return entries;

        const box = doc.createElement('div');
        box.className = 'kelk-toc';
        box.setAttribute('data-levels', String(levels));
        const title = doc.createElement('p');
        title.className = 'kelk-toc-title';
        title.textContent = o.title || TOC_TITLES[o.dir === 'ltr' ? 'ltr' : 'rtl'];
        box.appendChild(title);
        entries.forEach(function (e) {
            const p = doc.createElement('p');
            p.className = 'kelk-toc-entry';
            p.setAttribute('data-level', String(e.level));
            p.setAttribute('data-target', e.id);
            p.textContent = e.text;
            box.appendChild(p);
        });
        const hr = function () { return doc.createElement('hr'); };
        const spacer = doc.createElement('p');
        spacer.className = 'kelk-spacer';
        spacer.innerHTML = '&nbsp;';

        let first = root.firstElementChild;
        const frag = doc.createDocumentFragment();
        if (first && first.tagName === 'H1') {
            frag.appendChild(hr()); frag.appendChild(box); frag.appendChild(hr()); frag.appendChild(spacer);
            // an <hr> right after the title in the text itself is not doubled
            const next = first.nextElementSibling;
            if (next && next.tagName === 'HR') next.parentNode.removeChild(next);
            first.parentNode.insertBefore(frag, first.nextSibling);
        } else {
            frag.appendChild(box); frag.appendChild(hr()); frag.appendChild(spacer);
            root.insertBefore(frag, root.firstChild);
        }
        return entries;
    }

    // =========================================================================
    // Table column widths (shared by the builders)
    // =========================================================================

    /**
     * Distribute a table width over columns from their min/max content widths
     * (the browser's auto layout in short): everything fits → by max; nothing
     * fits → by min; else min plus the rest by (max − min).
     * @returns {number[]} widths summing to `total`
     */
    function distributeColumns(minC, maxC, total) {
        const sumMin = minC.reduce(function (s, x) { return s + x; }, 0);
        const sumMax = maxC.reduce(function (s, x) { return s + x; }, 0);
        if (sumMax <= total) return maxC.map(function (x) { return x * total / sumMax; });
        if (sumMin >= total) return minC.map(function (x) { return x * total / sumMin; });
        const extra = total - sumMin, span = sumMax - sumMin;
        return minC.map(function (x, k) { return x + extra * (maxC[k] - x) / span; });
    }

    /**
     * Table width from the setting: 'NN%' of the available width (default
     * 98%), or 'auto' — as wide as its content wants, up to 100%.
     * @param {string} setting  '98%' | 'auto' | …
     * @param {number} full     available width
     * @param {number} natural  the content's preferred width (sum of max widths)
     */
    function resolveTableWidth(setting, full, natural) {
        const s = String(setting == null ? '98%' : setting).trim().toLowerCase();
        if (s === 'auto') return Math.min(full, Math.max(natural || 0, full * 0.2));
        const p = parseFloat(s);
        return full * (isFinite(p) && p > 0 ? Math.min(100, p) : 98) / 100;
    }

    /** Text of a cell with <br> as line breaks, code included. */
    function cellLines(cell) {
        let t = '';
        (function walk(n) {
            for (let c = n.firstChild; c; c = c.nextSibling) {
                if (c.nodeType === 3) t += c.nodeValue;
                else if (c.nodeType === 1) {
                    if (c.tagName === 'BR') t += '\n';
                    else if (c.tagName !== 'TABLE') { if (/^(P|DIV|LI|H[1-6])$/.test(c.tagName) && t && !/\n$/.test(t)) t += '\n'; walk(c); }
                }
            }
        })(cell);
        return t.split('\n').map(function (l) { return l.replace(/\s+/g, ' ').trim(); });
    }

    /**
     * Column shares of a table from its text (no fonts needed): a character is
     * about half an em, a line is as wide as its characters, the narrowest a
     * column may be is its longest word. Same algorithm as PdfBuilder, which
     * measures with the real fonts.
     * @param {HTMLTableElement} table
     * @param {{ width?: number, fontSize?: number, pad?: number, tableWidth?: string }} [opts] - points;
     *        tableWidth '98%' | 'auto' … (resolveTableWidth) → fraction of `width`
     * @returns {{ shares: number[], cols: Map<Element, number> }} shares sum to 1;
     *          cols: first column index of each cell
     */
    function tableColumnShares(table, opts) {
        const o = Object.assign({ width: 450, fontSize: 11, pad: 16 }, opts || {});
        const em = o.fontSize * 0.6;              // a little generous: bold headers, cell margins
        const rows = Array.from(table.rows);
        const occ = [], cells = [], cols = new Map();
        rows.forEach(function (tr, r) {
            let c = 0;
            Array.from(tr.cells).forEach(function (cell) {
                while (occ[r] && occ[r][c]) c++;
                const span = Math.max(1, cell.colSpan || 1), rs = Math.max(1, cell.rowSpan || 1);
                for (let i = 0; i < rs; i++) for (let k = 0; k < span; k++) { (occ[r + i] = occ[r + i] || [])[c + k] = true; }
                cols.set(cell, c);
                cells.push({ col: c, span: span, el: cell });
                c += span;
            });
        });
        const n = Math.max(1, occ.reduce(function (m, r) { return Math.max(m, (r || []).length); }, 0));
        const base = o.pad + em * 2;
        const minC = Array(n).fill(base), maxC = Array(n).fill(base);
        cells.forEach(function (c) {
            const lines = cellLines(c.el);
            const maxW = Math.max.apply(null, lines.map(function (l) { return l.length; }).concat([0])) * em + o.pad;
            const minW = Math.max.apply(null, lines.join(' ').split(/\s+/).map(function (w) { return w.length; }).concat([0])) * em + o.pad;
            for (let k = 0; k < c.span; k++) {
                minC[c.col + k] = Math.max(minC[c.col + k], minW / c.span);
                maxC[c.col + k] = Math.max(maxC[c.col + k], maxW / c.span);
            }
        });
        const natural = maxC.reduce(function (s, x) { return s + x; }, 0);
        const width = o.tableWidth ? resolveTableWidth(o.tableWidth, o.width, natural) : o.width;
        const w = distributeColumns(minC, maxC, width);
        const total = w.reduce(function (s, x) { return s + x; }, 0) || 1;
        // fraction: the table's width as a part of the available width
        return { shares: w.map(function (x) { return x / total; }), cols: cols, fraction: width / o.width, natural: natural };
    }

    /** Direction of the first strong letter ('rtl' | 'ltr' | null) — UBA rule P2. */
    function firstStrong(t) {
        const m = STRONG_ANY.exec(t);
        if (!m) return null;
        return RTL_LETTER_PATTERN.test(m[0]) ? 'rtl' : 'ltr';
    }

    /**
     * Is this block text LTR? True when it has LTR letters and either no
     * RTL letter, or it STARTS with an LTR letter AND LTR letters are
     * the majority — an English sentence quoting a few Persian words
     * ("… with «شد» and «می‌شود» …") is English, while a Persian sentence
     * with a long English phrase inside stays Persian.
     */
    function isLtrText(t) {
        if (!LATIN_LETTER_PATTERN.test(t)) return false;
        if (!RTL_LETTER_PATTERN.test(t)) return true;
        if (firstStrong(t) !== 'ltr') return false;
        return (t.match(LATIN_LETTERS_G) || []).length > (t.match(RTL_LETTERS_G) || []).length;
    }

    /** Is this block text RTL (has RTL letters and is not LTR by isLtrText)? */
    function isRtlText(t) {
        return RTL_LETTER_PATTERN.test(t) && !isLtrText(t);
    }

    // =========================================================================
    // Text extraction
    // =========================================================================

    /**
     * Visible text of an element, excluding <pre> and <code> subtrees.
     * @param {Element} el
     * @param {WeakMap} [memo] - optional cache (valid only while text is unchanged)
     * @returns {string}
     */
    function getVisibleText(el, memo) {
        if (memo) {
            const hit = memo.get(el);
            if (hit !== undefined) return hit;
        }
        let text = '';
        const childNodes = el.childNodes;
        for (let i = 0; i < childNodes.length; i++) {
            const node = childNodes[i];
            if (node.nodeType === 3) {
                text += node.nodeValue;
            } else if (node.nodeType === 1) {
                const tag = node.tagName.toLowerCase();
                if (tag === 'pre' || tag === 'code') continue;
                text += getVisibleText(node, memo);
            }
        }
        if (memo) memo.set(el, text);
        return text;
    }

    /**
     * Document-level direction: the direction of the FIRST block that has
     * letters (p, h1-h6, li, blockquote — its own text, code excluded; table
     * cells only when there is no such block), decided like every block
     * (isRtlText). This is the UBA's own
     * rule (P2, as dir="auto" does) lifted from the first character to the
     * first block, so "API یک رابط …" or "# ISO 27001 گزارش ممیزی" still
     * open an RTL document, and an English document keeps its Persian words,
     * quotes and cells without turning RTL. No letters at all: any RTL
     * character → rtl. (Before: any RTL character made the document RTL.)
     * An explicit setDirection('rtl'|'ltr') always wins over this.
     * @param {Element|string} source - parsed root (browser) or raw HTML (fallback)
     * @returns {'rtl'|'ltr'}
     */
    function detectDirection(source) {
        const decide = function (t) {
            if (!hasRtlLetter(t) && !hasLatin(t)) return null;
            return isRtlText(t) ? 'rtl' : 'ltr';
        };
        if (typeof source !== 'string') {
            if (source.querySelectorAll) {
                // blocks and loose top-level text, in document order
                const units = Array.from(source.querySelectorAll(BLOCK_SEL + ', pre'));
                for (let n = source.firstChild; n; n = n.nextSibling) if (n.nodeType === 3) units.push(n);
                units.sort(function (x, y) { return x === y ? 0 : (x.compareDocumentPosition(y) & 4 ? -1 : 1); });
                // prose first; table cells (often codes, names, numbers) only if there is no prose
                for (let pass = 0; pass < 2; pass++) {
                    for (let k = 0; k < units.length; k++) {
                        const u = units[k];
                        if (u.nodeType === 1 && (u.tagName === 'PRE' || u.closest('pre'))) continue;
                        if (pass === 0 && u.nodeType === 1 && u.closest('td, th')) continue;
                        const d = decide(u.nodeType === 3 ? u.nodeValue : flattenBlock(u).text);
                        if (d) return d;
                    }
                }
            }
            return hasRTL(getVisibleText(source)) ? 'rtl' : 'ltr';
        }
        const stripped = source
            .replace(/<pre[\s>][\s\S]*?<\/pre>/gi, '')
            .replace(/<code[\s>][\s\S]*?<\/code>/gi, '');
        const prose = stripped.replace(/<table[\s>][\s\S]*?<\/table>/gi, '');
        const tries = [prose, stripped];
        for (let t = 0; t < tries.length; t++) {
            const parts = tries[t].split(/<\/?(?:p|h[1-6]|li|ul|ol|td|th|tr|table|blockquote|div)\b[^>]*>|<br\s*\/?>|\n/i);
            for (let k = 0; k < parts.length; k++) {
                const d = decide(parts[k].replace(/<[^>]+>/g, ''));
                if (d) return d;
            }
        }
        return hasRTL(stripped.replace(/<[^>]+>/g, '')) ? 'rtl' : 'ltr';
    }

    // =========================================================================
    // Per-element direction plan
    // =========================================================================

    /**
     * Decide per-element direction for a document with mixed content.
     * Returns an ORDERED list of actions (renderers apply them in order):
     *
     *   { op: 'ltr',      el }          block/cell/list/li is LTR
     *   { op: 'rtl',      el }          RTL paragraph inside an LTR quote
     *   { op: 'quoteDir', el, dir }     counter-direction blockquote
     *   { op: 'ltrTable', el }          whole table is LTR (column order too)
     *
     * Rules:
     *   1. p, h1-h6 (outside lists/tables/quotes/pre): LTR unless RTL by
     *      isRtlText (RTL letters, and not an LTR-led, LTR-majority text);
     *      in an LTR document the mirror: RTL by isRtlText → explicit RTL.
     *   2. blockquote: counter-direction quotes get quoteDir; their paragraphs
     *      follow. In an RTL quote, English-only paragraphs → LTR; in an LTR
     *      quote of an LTR document, Persian paragraphs → RTL.
     *   3. tables: cells with RTL letters stay (explicit RTL in an LTR
     *      document); numbers-only cells in an RTL table stay; every other
     *      cell → LTR. A table without RTL letters → ltrTable.
     *   4. lists: each item by its OWN text (nested lists, tables, quotes and
     *      code excluded), strong letters only. No RTL letter in any item →
     *      whole tree LTR; otherwise LTR-only items (and English-only
     *      paragraphs of RTL items) → LTR, RTL items under an LTR parent (or
     *      in an LTR document) → explicit RTL, numbers-only items follow their
     *      parent. An item's own paragraphs (loose lists) follow the item.
     *
     * Decisions depend on text only, so planning first and applying afterwards
     * is equivalent to deciding while mutating.
     *
     * @param {Element} root
     * @param {boolean} docIsRTL
     * @returns {Array<object>}
     */
    function planDirections(root, docIsRTL) {
        const memo = new WeakMap();
        const actions = [];
        const text = function (el) { return getVisibleText(el, memo); };
        const elementHasRTL = function (el) { return isRtlText(text(el)); };
        const isNumbersOnly = function (el) {
            const t = text(el).trim();
            return t.length > 0 && NUMBERS_ONLY_PATTERN.test(t);
        };
        const ltr = function (el) { actions.push({ op: 'ltr', el: el }); };

        // An LTR list item and its own paragraphs (loose items: <li><p>…</p>).
        // In Word HTML a <p class=MsoNormal> does NOT inherit the <li>'s
        // direction — the class sets the document direction explicitly — so
        // the paragraphs need their own decision.
        function ltrItem(li) {
            ltr(li);
            for (let c = li.firstElementChild; c; c = c.nextElementSibling) {
                if (/^(P|H[1-6])$/.test(c.tagName)) ltr(c);
            }
        }

        // English-only direct child paragraphs of an RTL container
        function ltrOnlyChildBlocks(container) {
            for (let c = container.firstElementChild; c; c = c.nextElementSibling) {
                if (!/^(P|H[1-6])$/.test(c.tagName)) continue;
                if (isLtrText(text(c))) ltr(c);
            }
        }
        // Persian direct child paragraphs of an LTR container (LTR document)
        function rtlOnlyChildBlocks(container) {
            for (let c = container.firstElementChild; c; c = c.nextElementSibling) {
                if (!/^(P|H[1-6])$/.test(c.tagName)) continue;
                if (isRtlText(text(c))) actions.push({ op: 'rtl', el: c });
            }
        }

        // 1. Standalone blocks
        root.querySelectorAll('p, h1, h2, h3, h4, h5, h6').forEach(function (el) {
            if (el.closest('pre')) return;
            if (el.closest('ul') || el.closest('ol')) return;
            if (el.closest('td') || el.closest('th')) return;
            if (el.closest('blockquote')) return;
            // a paragraph holding only images keeps the document direction
            // (an image in an RTL document sits at the right, as in the preview)
            if (!/\S/.test(el.textContent) && el.querySelector('img')) return;
            const r = elementHasRTL(el);
            if (!r) ltr(el);
            else if (!docIsRTL) actions.push({ op: 'rtl', el: el });        // Persian paragraph in an LTR document
        });

        // 2. Blockquotes
        root.querySelectorAll('blockquote').forEach(function (bq) {
            const bqHasRTL = elementHasRTL(bq);
            if (docIsRTL && !bqHasRTL) {
                actions.push({ op: 'quoteDir', el: bq, dir: 'ltr' });
                bq.querySelectorAll('p, h1, h2, h3, h4, h5, h6').forEach(function (el) {
                    // a Persian paragraph in an English quote stays RTL — explicitly,
                    // since renderers give children the quote's direction
                    if (isRtlText(text(el))) actions.push({ op: 'rtl', el: el });
                    else ltr(el);
                });
            } else if (!docIsRTL && bqHasRTL) {
                actions.push({ op: 'quoteDir', el: bq, dir: 'rtl' });
                ltrOnlyChildBlocks(bq);
            } else if (docIsRTL && bqHasRTL) {
                ltrOnlyChildBlocks(bq);
            } else {
                rtlOnlyChildBlocks(bq);                        // LTR quote of an LTR document
            }
        });

        // 3. Tables
        root.querySelectorAll('table').forEach(function (table) {
            if (table.id === 'hrdftrtbl') return;
            const tableHasRTL = hasRtlLetter(text(table));    // column order: any RTL letter
            table.querySelectorAll('td, th').forEach(function (cell) {
                if (elementHasRTL(cell)) {
                    if (!docIsRTL) actions.push({ op: 'rtl', el: cell });   // Persian cell in an LTR document
                    return;
                }
                if (tableHasRTL && isNumbersOnly(cell)) return;
                ltr(cell);
            });
            if (!tableHasRTL) actions.push({ op: 'ltrTable', el: table });
        });

        // 4. Lists. An item is decided by its OWN text — nested lists, tables,
        // quotes and code are decided on their own and do not vote for it.
        // Only strong letters count: a Persian comma or ؟ in an English item
        // does not make the list RTL.
        function ownText(li) {
            let t = '';
            li.childNodes.forEach(function (n) {
                if (n.nodeType === 3) t += n.nodeValue;
                else if (n.nodeType === 1 && !/^(UL|OL|TABLE|BLOCKQUOTE|PRE)$/.test(n.tagName)) t += text(n);
            });
            return t;
        }
        // An RTL item where the inherited direction is LTR (LTR document, or
        // inside an LTR item) says so explicitly; its own paragraphs too.
        function rtlItem(li) {
            actions.push({ op: 'rtl', el: li });
            for (let c = li.firstElementChild; c; c = c.nextElementSibling) {
                if (/^(P|H[1-6])$/.test(c.tagName) && !isLtrText(text(c))) actions.push({ op: 'rtl', el: c });
            }
        }
        root.querySelectorAll('ul, ol').forEach(function (list) {
            if (list.parentNode.closest('ul, ol')) return;
            const allLis = Array.from(list.querySelectorAll('li'));
            const own = new Map();
            allLis.forEach(function (li) { own.set(li, ownText(li)); });
            const treeHasRTL = allLis.some(function (li) { return hasRtlLetter(own.get(li)); });
            if (!treeHasRTL) {
                ltr(list);
                list.querySelectorAll('ul, ol').forEach(ltr);
                allLis.forEach(ltrItem);
                return;
            }
            // Mixed tree. Document order puts parents before children.
            const isLtr = new Set();
            allLis.forEach(function (li) {
                const t = own.get(li);
                const parentLi = li.parentElement ? li.parentElement.closest('li') : null;
                const inheritedLtr = (parentLi && list.contains(parentLi)) ? isLtr.has(parentLi) : !docIsRTL;
                if (hasLatin(t) && !hasRtlLetter(t)) {
                    isLtr.add(li); ltrItem(li);
                } else if (hasRtlLetter(t)) {
                    if (inheritedLtr) rtlItem(li);
                    ltrOnlyChildBlocks(li);
                } else if (inheritedLtr) {
                    isLtr.add(li); ltrItem(li);              // numbers only: follow the parent
                }
            });
        });

        return actions;
    }

    /**
     * Collapse a plan into element → direction. For renderers that need a
     * lookup (DocxBuilder) rather than ordered style mutations.
     * @param {Array<object>} actions
     * @returns {{ dir: Map<Element,'rtl'|'ltr'>, ltrTables: Set<Element> }}
     */
    function planToMaps(actions) {
        const dir = new Map();
        const ltrTables = new Set();
        actions.forEach(function (a) {
            if (a.op === 'ltr') dir.set(a.el, 'ltr');
            else if (a.op === 'rtl') dir.set(a.el, 'rtl');
            else if (a.op === 'quoteDir') dir.set(a.el, a.dir);
            else if (a.op === 'ltrTable') ltrTables.add(a.el);
        });
        return { dir: dir, ltrTables: ltrTables };
    }

    /**
     * Does this blockquote need the table form?
     *   - it contains lists, nested quotes, code, tables … (own indents), or
     *   - (RTL document) its paragraphs end up in DIFFERENT directions — an
     *     English paragraph in a Persian quote, or a Persian one in an English
     *     quote. A paragraph border is
     *     placed relative to each paragraph's own direction/indent, so an RTL
     *     and an LTR paragraph never share one straight border line; a table
     *     cell border does.
     * Mirrors rule 2 of planDirections (ltrOnlyChildBlocks).
     * @param {Element} bq
     * @param {boolean} [docIsRTL]
     */
    function isComplexQuote(bq, docIsRTL) {
        if (bq.querySelector(COMPLEX_QUOTE_SEL)) return true;
        if (!docIsRTL) return false;
        const quoteRtl = isRtlText(getVisibleText(bq));
        for (let c = bq.firstElementChild; c; c = c.nextElementSibling) {
            if (!/^(P|H[1-6])$/.test(c.tagName)) continue;
            const t = getVisibleText(c);
            // a paragraph whose direction differs from the quote's
            if (quoteRtl ? isLtrText(t) : isRtlText(t)) return true;
        }
        return false;
    }

    // =========================================================================
    // BiDi run engine (see WordHtmlBuilder._wrapBidiRuns for the full rationale)
    // =========================================================================

    // Conservative STRONG classes for BiDi: LETTERS only. Persian digits
    // (U+06F0..F9), ZWNJ (U+200C), and Persian punctuation are intentionally
    // NOT strong here, so an English line containing them is still single-script.
    const STRONG_R = RTL_LETTER_PATTERN;
    const STRONG_L = LATIN_LETTER_PATTERN;
    const FA_PUNCT = /[\u060C\u061B\u061F]/; // ، ؛ ؟ — RTL-owned hard boundary
    // Marks / joiners that stay with the RTL letter before them (code runs)
    const CODE_RUN_TAIL = /[\u0591-\u05C7\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF\u200C\u200D]/;
    // Digits glued (no space) to the FRONT of a Latin word belong to that
    // LTR word: "4k", "3.5GHz", "1,000mAh", "4-bit", "2_x". Internal . or ,
    // only between digits; one optional - or _ as a digit→letter joiner.
    const DIGIT_PREFIX = /[0-9]+(?:[.,][0-9]+)*[-_]?$/;
    // Math operators (∑ √ ∫ ∂ ∇ ≤ ≠ ∈ …, ± × ÷) opening a formula before its
    // first Latin letter. ASCII operators and arrows do not count: "قیمت = Price",
    // "انجام شد → next" keep their plain UBA behaviour.
    const MATH_START = /[\u2200-\u22FF\u2A00-\u2AFF\u00B1\u00D7\u00F7]/;
    // An opening quote glued to the front of the counter-direction run
    // ("Future …" / "حرم …") belongs INSIDE the isolate; left outside at a
    // block start it resolves to the base direction and jumps to the far
    // edge. Pulling it in also lets balanceCore see the pair's real
    // parity, so a following ` / "` is trimmed instead of absorbed.
    // Guillemets « » are excluded on purpose (Persian-owned, mirrored).
    const OPEN_QUOTE = /["'\u201C\u2018]$/;
    const OPEN  = { '(':')', '[':']', '{':'}', '\u00AB':'\u00BB', '\u201C':'\u201D', '\u2039':'\u203A' };
    const CLOSE = { ')':'(', ']':'[', '}':'{', '\u00BB':'\u00AB', '\u201D':'\u201C', '\u203A':'\u2039' };
    const SYM   = { '"':1, "'":1, '\u0060':1, '\u2018':1, '\u2019':1 };

    function hasL(t){ return STRONG_L.test(t); }
    function hasR(t){ return STRONG_R.test(t); }
    function hasMix(t){ return STRONG_L.test(t) && STRONG_R.test(t); }
    function isOppStrong(c, baseDir){ return baseDir === 'rtl' ? STRONG_L.test(c) : STRONG_R.test(c); }
    function isBaseStrong(c, baseDir){ return baseDir === 'rtl' ? STRONG_R.test(c) : STRONG_L.test(c); }
    /** Any counter-direction letter in text[from, to)? */
    function STRONG_L_OR_R_IN(text, from, to, baseDir){
        for (let k = from; k < to; k++) if (isOppStrong(text[k], baseDir)) return true;
        return false;
    }

    // A lone apostrophe touching a letter/digit on EITHER side ("org's",
    // "workers'", "'90s") is a contraction, possessive, or elision mark, not
    // a paired quotation delimiter — the only case with a letter/digit on
    // NEITHER side would be a truly orphaned apostrophe, which doesn't occur
    // in real text. Gate 3 exists to push an unmatched enclosure OUTSIDE the
    // isolate so the UBA can pair it with its real partner elsewhere; but for
    // this kind of apostrophe there is no real partner, so trimming here does
    // the opposite of that goal — it splits one logical LTR word/phrase into
    // two separate <span dir="ltr"> runs with a bare RTL character between
    // them, which Word's bidi engine can then reorder relative to each other,
    // scrambling the on-screen reading order. Same failure mode the
    // block-level flattening below guards against — any artificial split of
    // one logical direction-run, whether caused by a symbol-pairing heuristic
    // or an inline tag boundary, risks reordering.
    // Scoped to ' and ’ (U+2019, the "smart" apostrophe Word/typography tools
    // commonly substitute for it) — " ` ‘ are left untouched since they never
    // occur mid-word or word-adjacent this way.
    function isNonPairingApostrophe(c, region, i){
        if (c !== "'" && c !== '\u2019') return false;
        const isWordChar = function(ch){ return !!ch && /[A-Za-z0-9]/.test(ch); };
        return isWordChar(region[i - 1]) || isWordChar(region[i + 1]);
    }

    // Trim a region down to an enclosure-balanced core (Gate 3).
    function balanceCore(region){
        let start = 0, end = region.length;
        function check(s, e){
            const stack = [], sym = {};
            for (let i = s; i < e; i++){
                const c = region[i];
                if (OPEN[c]) stack.push(i);
                else if (CLOSE[c]){ if (stack.length) stack.pop(); else return { ok:false, bad:i }; }
                else if (SYM[c] && !isNonPairingApostrophe(c, region, i)) sym[c] = (sym[c] || 0) + 1;
            }
            if (stack.length) return { ok:false, bad: stack[stack.length - 1] };
            for (const k in sym){
                if (sym[k] % 2 === 1){
                    for (let t = e - 1; t >= s; t--){
                        if (region[t] === k && !isNonPairingApostrophe(k, region, t)) return { ok:false, bad:t };
                    }
                }
            }
            return { ok:true };
        }
        while (start < end){ const r = check(start, end); if (r.ok) break; end = r.bad; }
        while (start < end && CLOSE[region[start]]) start++;
        return { start: start, end: end };
    }

    // Find counter-direction isolate spans in a block's flattened text.
    // Operates on ONE continuous string per block (built by the caller below)
    // rather than per DOM text node. Returns [start, end) ranges in TEXT's
    // own coordinates.
    function findIsolateRangesImpl(text, baseDir, endRe){
        const hasOpp = (baseDir === 'rtl') ? STRONG_L.test(text) : STRONG_R.test(text);
        if (!hasOpp) return [];
        const ranges = [];
        const n = text.length;
        let i = 0;
        let scanFrom = 0; // end of the previous region — backtracking never crosses it
        while (i < n){
            const ch = text[i];
            if (!isOppStrong(ch, baseDir)){ i++; continue; }
            let j = i, region = '';
            // Digit-prefix rule (RTL base only): pull digits attached to the
            // first Latin letter INTO the isolate. Otherwise "4k" becomes
            // "4" (outside, resolved as Arabic number after Persian letters →
            // placed to the RIGHT of k) + <span dir=ltr>k</span>, and Word
            // shows "k4". Trailing digits ("k4", "USB3") were already absorbed
            // by the greedy scan below; this closes the leading-digit gap.
            // Formula rule (RTL base only): "مجموع: ∑ (i=1 → n) i = n(n+1)/2".
            // A math operator between the last RTL letter (or ، ؛ ؟) and the
            // first Latin letter starts the formula: the run begins THERE, so
            // the whole formula is one LTR isolate. Otherwise the run starts
            // at "i", its "(" is left outside, the balance guard cuts at ")"
            // and the rest of the formula is reordered ("n)n+1(/2").
            if (baseDir === 'rtl'){
                let b = scanFrom;
                for (let k = i - 1; k >= scanFrom; k--){
                    if (isBaseStrong(text[k], baseDir) || FA_PUNCT.test(text[k])){ b = k + 1; break; }
                }
                const at = text.slice(b, i).search(MATH_START);
                if (at >= 0){ region = text.slice(b + at, i); i = b + at; }
            }
            if (baseDir === 'rtl' && !region){
                const dp = text.slice(scanFrom, i).match(DIGIT_PREFIX);
                if (dp){ region = dp[0]; i -= dp[0].length; }
            }
            // Number-before-RTL rule (LTR base only): "Summary (3 صفحه تا …)".
            // A number separated only by spaces from a Persian phrase, and not
            // itself following a Latin word ("Chapter 3 صفحه" keeps its 3),
            // is read with the phrase: it joins the RTL run, so it stands at the
            // phrase's start (its right side) instead of before it on the left.
            if (baseDir === 'ltr' && !region){
                const nm = /[0-9\u0660-\u0669\u06F0-\u06F9]+(?:[.,\u066B\u066C][0-9\u0660-\u0669\u06F0-\u06F9]+)*[ \t\u00A0]+$/.exec(text.slice(scanFrom, i));
                if (nm){
                    let k = i - nm[0].length - 1;
                    while (k >= scanFrom && /[ \t\u00A0]/.test(text[k])) k--;
                    if (k < scanFrom || !(isBaseStrong(text[k], baseDir) || /[0-9]/.test(text[k]))){
                        region = nm[0]; i -= nm[0].length;
                    }
                }
            }
            // Opening-quote prefix (both directions): only when the quote
            // itself starts a word (block start, whitespace or punctuation
            // before it — not a letter/digit, which would make it a
            // closing quote or an apostrophe).
            if (i > scanFrom && OPEN_QUOTE.test(text[i - 1]) &&
                (i - 1 === 0 || !(/[0-9\u0600-\u06FF]/.test(text[i - 2]) || STRONG_ANY.test(text[i - 2])))){
                region = text[i - 1] + region; i -= 1;
            }
            j = i + region.length;
            while (j < n){
                const c = text[j];
                if (isBaseStrong(c, baseDir)) break;
                if (baseDir === 'rtl' && FA_PUNCT.test(c)) break;
                region += c; j++;
            }
            const core = balanceCore(region);
            let keepStart = i + core.start;
            let keepEnd = i + core.end;

            // Boundary punctuation fix: a trailing cluster of dashes, spaces, and
            // separator/connector punctuation (: ; . / \ | =) that sits exactly at the
            // LTR→RTL handoff must stay OUTSIDE the isolate — these characters function
            // as a label/item separator binding to what FOLLOWS (the Farsi phrase), not
            // what precedes (e.g. "B8." / "B8:" / "B8 / " / "B8 = " all read as
            // "item B8, separator, Farsi label"). Comma is deliberately excluded: unlike
            // these separator marks, a comma overwhelmingly binds to the PRECEDING word
            // in ordinary prose (lists, clauses), so trimming it here would risk pulling
            // a legitimate trailing comma out of real English text merely because Farsi
            // happens to follow — a decision to add it should wait for a concrete
            // failing example, not be inferred by analogy.
            // Guard: only trim when what follows leads back to the base direction.
            let nextIsRtl;
            if (j < n){
                nextIsRtl = isBaseStrong(text[j], baseDir) || (baseDir === 'rtl' && FA_PUNCT.test(text[j]));
            } else {
                nextIsRtl = false; // true end of block content — nothing follows, don't trim
            }
            if (nextIsRtl){
                const dm = text.slice(keepStart, keepEnd).match(/[\s\u2010-\u2015\u2212\-\u2013\u2014:;.\/\\|=]+$/);
                if (dm) keepEnd -= dm[0].length;
            }
            const tm = text.slice(keepStart, keepEnd).match(/(\s+)$/);
            if (tm) keepEnd -= tm[1].length;
            const lm = text.slice(keepStart, keepEnd).match(/^(\s+)/);
            if (lm) keepStart += lm[1].length;

            if (keepEnd > keepStart) ranges.push([keepStart, keepEnd]);
            // The balance guard cut the run short: scan the rest of it again,
            // so later Latin text in the same stretch still gets its isolate.
            const cut = i + core.end;
            i = (keepEnd > keepStart && cut < j && STRONG_L_OR_R_IN(text, cut, j, baseDir)) ? Math.max(keepEnd, cut) : j;
            scanFrom = i;
        }

        // End-punctuation rule: only the LAST isolate, only when nothing but
        // trailing whitespace follows it to the end of the block's text.
        if (baseDir === 'rtl' && endRe && ranges.length){
            const last = ranges[ranges.length - 1];
            if (/^\s*$/.test(text.slice(last[1]))){
                const inner = text.slice(last[0], last[1]);
                const m = inner.match(endRe);
                if (m && m[1]) last[1] = last[0] + m[1].length;
            }
        }

        return ranges;
    }

    /**
     * RTL runs inside CODE (an LTR context: inline code, code block lines).
     * Plain UBA for an LTR paragraph, as editors and Word show code: a run
     * goes from an RTL letter to the LAST RTL letter before the next LTR
     * letter (neutrals and numbers BETWEEN RTL letters belong to it — rule
     * N1), plus the marks / ZWNJ right after that letter. Neutrals at either
     * edge stay LTR, so `// توضیح`, `"سلام";` and `کد 😀 code` keep their
     * punctuation, quotes and symbols in place. (The prose engine
     * findIsolateRanges is tuned for Word paragraphs and absorbs trailing
     * neutrals; code needs the strict rule.)
     * @param {string} text
     * @returns {Array<[number, number]>} [start, end) ranges
     */
    function codeRtlRanges(text) {
        const out = [];
        const n = text.length;
        let i = 0;
        while (i < n) {
            if (!STRONG_R.test(text[i])) { i++; continue; }
            let j = i + 1, last = i;
            while (j < n && !STRONG_L.test(text[j])) {
                if (STRONG_R.test(text[j])) last = j;
                j++;
            }
            let end = last + 1;
            while (end < n && CODE_RUN_TAIL.test(text[end])) end++;
            out.push([i, end]);
            i = end;
        }
        return out;
    }

    const endReCache = new Map();
    function endPunctuationRe(chars) {
        if (!chars || !chars.length) return null;
        const key = chars.join('\u0000');
        if (!endReCache.has(key)) {
            endReCache.set(key, new RegExp('^(.*?)([' + chars.map(function (c) {
                return c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            }).join('') + ']+)$'));
        }
        return endReCache.get(key);
    }

    /**
     * Counter-direction isolate ranges in a block's flattened text.
     * @param {string} text - ONE continuous string for the whole block
     * @param {'rtl'|'ltr'} baseDir - the block's effective direction
     * @param {object} [opts]
     * @param {string[]} [opts.endPunctuation=['.']] - end-of-block marks kept
     *        outside the last isolate in RTL blocks ([] disables)
     * @returns {Array<[number, number]>} [start, end) ranges
     */
    function findIsolateRanges(text, baseDir, opts) {
        const chars = opts && opts.endPunctuation !== undefined ? opts.endPunctuation : ['.'];
        return findIsolateRangesImpl(text, baseDir, endPunctuationRe(chars));
    }

    /**
     * Flatten a block's OWN text — through inline formatting, stopping at
     * nested blocks and code/pre — into one string, recording which text node
     * each character came from.
     * @param {Element} el
     * @returns {{ text: string, nodeMap: Array<{node: Text, start: number, end: number}> }}
     */
    function flattenBlock(el) {
        let flatText = '';
        const nodeMap = [];
        (function collect(n) {
            for (let c = n.firstChild; c; c = c.nextSibling) {
                if (c.nodeType === 3) {
                    const val = c.nodeValue;
                    if (val) {
                        nodeMap.push({ node: c, start: flatText.length, end: flatText.length + val.length });
                        flatText += val;
                    }
                } else if (c.nodeType === 1 && !NON_DESCEND.test(c.tagName)) {
                    collect(c);
                }
            }
        })(el);
        return { text: flatText, nodeMap: nodeMap };
    }

    /** Map a flat offset back to { node, offset } (see flattenBlock). */
    function resolvePosition(nodeMap, flatOffset) {
        for (let k = 0; k < nodeMap.length; k++) {
            const entry = nodeMap[k];
            if (flatOffset <= entry.end) return { node: entry.node, offset: flatOffset - entry.start };
        }
        const last = nodeMap[nodeMap.length - 1];
        return { node: last.node, offset: last.node.nodeValue.length };
    }

    // =========================================================================
    // Code blocks — shared by both builders and usable by the preview
    // =========================================================================

    /** Class values that name "no language". */
    const NO_LANGUAGE = /^(plaintext|plain|text|txt|nohighlight|no-highlight|none)$/i;

    /**
     * Language of a code block, from the standard CommonMark/marked class
     * (`language-xxx`, also `lang-xxx`) on <code> or <pre>, or from a
     * `data-lang` attribute. Keeps full names like "c++", "c#",
     * "objective-c", "shell-session". Returns '' when unknown or plain text.
     * @param {Element} pre - a <pre> (or its <code>)
     * @returns {string}
     */
    function codeLanguage(pre) {
        const code = pre.tagName === 'CODE' ? pre : (pre.querySelector('code') || pre);
        const host = code.closest('pre') || code;
        const classes = (code.getAttribute('class') || '') + ' ' + (host.getAttribute('class') || '');
        const m = /(?:^|\s)(?:language|lang)-(\S+)/.exec(classes);
        let lang = m ? m[1] : (host.getAttribute('data-lang') || code.getAttribute('data-lang') || '');
        lang = lang.trim();
        return NO_LANGUAGE.test(lang) ? '' : lang;
    }

    /**
     * Remove preview-only decoration around code blocks (MUTATES root):
     *   <div class="code-block-wrapper">
     *     <div class="code-block-header"><span class="code-lang">…</span><button>…</button></div>
     *     <pre>…</pre>
     *   </div>                                   →   <pre>…</pre>
     * Must run right after parsing: the header text ("javascript Copy") would
     * otherwise take part in direction decisions. A label shown only in the
     * header (no language class) is kept on the <pre> as data-lang.
     * @param {Element} root
     */
    function unwrapCodeBlocks(root) {
        root.querySelectorAll('.code-block-wrapper').forEach(function (w) {
            const pre = w.querySelector('pre');
            if (!pre) { w.parentNode.removeChild(w); return; }
            if (!codeLanguage(pre)) {
                const l = w.querySelector('.code-lang');
                const t = l ? l.textContent.trim() : '';
                if (t && t !== 'code') pre.setAttribute('data-lang', t);
            }
            w.parentNode.replaceChild(pre, w);
        });
        root.querySelectorAll('.code-block-header, .code-copy-btn').forEach(function (e) {
            if (e.parentNode) e.parentNode.removeChild(e);
        });
        // nested-fence frames of the preview (span.code-nested): keep the text
        root.querySelectorAll('.code-nested').forEach(function (sp) {
            while (sp.firstChild) sp.parentNode.insertBefore(sp.firstChild, sp);
            sp.parentNode.removeChild(sp);
        });
    }


    /**
     * Fenced blocks written INSIDE a code block (a ````md block showing
     * ```js … ``` examples). The text stays raw; renderers only draw a frame
     * around each nested block, from its opening fence line to its closing
     * one, like nested quotes. CommonMark fences: ``` or ~~~ (3+), up to 3
     * spaces indent; a closing fence has the same character, at least the
     * same length and no info string. Only markdown blocks (md / markdown /
     * no language) are scanned for further nesting; an unclosed fence gets
     * no frame.
     * @param {string} text - code text (lines split on \n)
     * @returns {Array<{from, to, lang, children}>} line numbers, inclusive
     */
    function nestedFences(text) {
        const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
        const top = [], stack = [];
        text.split('\n').forEach(function (line, i) {
            const m = FENCE.exec(line);
            if (stack.length) {
                const t = stack[stack.length - 1];
                if (m && m[1].charAt(0) === t.ch && m[1].length >= t.len && !m[2].trim()) {
                    t.to = i;
                    stack.pop();
                    (stack.length ? stack[stack.length - 1].children : top).push(t);
                    return;
                }
                if (t.lang && !/^(md|markdown)$/i.test(t.lang)) return;     // raw inside other languages
            }
            if (m && !(m[1].charAt(0) === '`' && m[2].indexOf('`') >= 0)) {
                stack.push({ from: i, to: -1, ch: m[1].charAt(0), len: m[1].length,
                             lang: m[2].trim().split(/\s+/)[0] || '', children: [] });
            }
        });
        return top;
    }

    /**
     * nestedFences as a render tree over ALL lines [0, lineCount):
     *   { lines: [from, to] }                   plain lines (inclusive)
     *   { nested: true, lang, items: [...] }    a framed nested block
     * @param {string} text
     * @returns {Array<object>}
     */
    function codeSegments(text) {
        const count = text.split('\n').length;
        function seg(nodes, from, to) {
            const out = [];
            let i = from;
            nodes.forEach(function (n) {
                if (n.from > i) out.push({ lines: [i, n.from - 1] });
                out.push({ nested: true, lang: n.lang, from: n.from, to: n.to, items: seg(n.children, n.from, n.to) });
                i = n.to + 1;
            });
            if (i <= to) out.push({ lines: [i, to] });
            return out;
        }
        return seg(nestedFences(text), 0, count - 1);
    }

    /**
     * Copy of lines [fromLine, toLine] of a (highlighted) code element as a
     * DocumentFragment — spans cut at the line edges, no trailing newline.
     * Browser only (DOM Range).
     */
    function codeFragment(codeEl, fromLine, toLine) {
        const doc = codeEl.ownerDocument;
        const walker = doc.createTreeWalker(codeEl, 4 /* NodeFilter.SHOW_TEXT */);
        let line = 0, start = null, end = null, lastNode = null;
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const v = n.nodeValue;
            lastNode = n;
            for (let k = 0; k <= v.length; k++) {
                if (!start && line === fromLine) start = [n, k];
                if (k === v.length) break;
                if (v.charAt(k) === '\n') {
                    if (line === toLine) { end = [n, k]; break; }
                    line++;
                }
            }
            if (end) break;
        }
        const range = doc.createRange();
        if (!start) return doc.createDocumentFragment();
        range.setStart(start[0], start[1]);
        if (end) range.setEnd(end[0], end[1]);
        else range.setEnd(lastNode, lastNode.nodeValue.length);
        return range.cloneContents();
    }


    /**
     * A detached <div> in an inert document: content assigned to innerHTML
     * is parsed, but its <img> elements do not start loading (the builders
     * parse the preview HTML; image bytes come from ImageCore). Nodes made
     * with document.createElement can still be inserted (adopted).
     */
    function inertRoot() {
        const doc = (typeof document !== 'undefined' && document.implementation)
            ? document.implementation.createHTMLDocument('') : document;
        return doc.createElement('div');
    }


    // =========================================================================
    // Custom header / footer HTML (shared model for the three builders)
    // =========================================================================
    //
    // setHeader({ html }) / setFooter({ html }) take a SUBSET of HTML that all
    // three outputs can draw the same way:
    //   blocks   <table> (<tr>, <td>/<th>, colspan, width %), <p>, <div>
    //   inline   <b>/<strong>, <i>/<em>, <u>, <span>, <a href>, <img>, <br>
    //   style="" (inline only): text-align, vertical-align, color, background
    //            (-color), font-size, font-weight, font-style, padding(-*),
    //            border / border-top|right|bottom|left, width (%)
    //   fields   {page} {pages} {date} {title} — anywhere in the text
    // Classes, <style> and other properties are ignored (with a console.warn).

    const HF_FIELD = /\{(page|pages|date|title)\}/g;
    const HF_FIELD_TEST = /\{(page|pages|date|title)\}/;
    const HF_STYLE_KEYS = /^(text-align|vertical-align|color|background|background-color|font-size|font-weight|font-style|padding|padding-(top|right|bottom|left)|border|border-(top|right|bottom|left)|width)$/;

    /** CSS length → pt (px, pt, cm, mm, in); NaN when not a length. */
    function cssPt(v) {
        const m = /^\s*(-?[\d.]+)\s*(px|pt|cm|mm|in)?\s*$/i.exec(String(v || ''));
        if (!m) return NaN;
        return parseFloat(m[1]) * { px: 0.75, pt: 1, cm: 72 / 2.54, mm: 72 / 25.4, in: 72 }[(m[2] || 'px').toLowerCase()];
    }

    /** '1pt solid red' (any order) → { width (pt), style, color } | null (none/0) */
    function cssBorder(v) {
        const t = String(v || '').trim().toLowerCase();
        if (!t || /^(none|0|hidden)$/.test(t)) return null;
        let width = 0.75, style = 'solid', color = '#000000';
        t.replace(/rgb\([^)]*\)/g, function (m) { return m.replace(/\s+/g, ''); }).split(/\s+/).forEach(function (p) {
            if (/^(solid|dashed|dotted|double)$/.test(p)) style = p;
            else if (/^(thin|medium|thick)$/.test(p)) width = { thin: 0.5, medium: 1.5, thick: 2.25 }[p];
            else if (!isNaN(cssPt(p))) width = cssPt(p);
            else if (p) color = p;
            return p;
        });
        return width > 0 ? { width: width, style: style, color: color } : null;
    }


    const CSS_COLORS = {
        black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF',
        darkgreen: '006400', navy: '000080', maroon: '800000', orange: 'FFA500', yellow: 'FFFF00',
        gray: '808080', grey: '808080', silver: 'C0C0C0', purple: '800080', teal: '008080',
        darkred: '8B0000', darkblue: '00008B', lightgray: 'D3D3D3', lightgrey: 'D3D3D3', windowtext: '000000'
    };
    /** CSS color (#rgb, #rrggbb, rgb(), common names) → 'RRGGBB' | null */
    function cssColorHex(v) {
        const t = String(v || '').trim().toLowerCase();
        if (CSS_COLORS[t]) return CSS_COLORS[t];
        let m = /^#([0-9a-f]{6})$/.exec(t);
        if (m) return m[1].toUpperCase();
        m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(t);
        if (m) return (m[1] + m[1] + m[2] + m[2] + m[3] + m[3]).toUpperCase();
        m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(t);
        if (m) return [m[1], m[2], m[3]].map(function (x) { return ('0' + Math.min(255, +x).toString(16)).slice(-2); }).join('').toUpperCase();
        return null;
    }

    /** Whitelisted inline style of an element → normalized style object. */
    function hfStyle(el, warn) {
        const out = { border: {} };
        const attrAlign = el.getAttribute && el.getAttribute('align');
        if (attrAlign) out.align = attrAlign.toLowerCase();
        const attrW = el.getAttribute && el.getAttribute('width');
        if (attrW && /%$/.test(attrW)) out.width = parseFloat(attrW);
        String((el.getAttribute && el.getAttribute('style')) || '').split(';').forEach(function (decl) {
            const i = decl.indexOf(':');
            if (i < 0) return;
            const k = decl.slice(0, i).trim().toLowerCase(), v = decl.slice(i + 1).trim();
            if (!k) return;
            if (!HF_STYLE_KEYS.test(k)) { if (warn) warn('style ' + k); return; }
            switch (k) {
                case 'text-align': out.align = v.toLowerCase(); break;
                case 'vertical-align': out.valign = v.toLowerCase(); break;
                case 'color': out.color = v; break;
                case 'background': case 'background-color': out.bg = v.split(/\s+/)[0]; break;
                case 'font-size': out.size = cssPt(v); break;
                case 'font-weight': out.bold = /bold|[6-9]00/.test(v); break;
                case 'font-style': out.italic = /italic|oblique/.test(v); break;
                case 'width': if (/%$/.test(v)) out.width = parseFloat(v); else if (!isNaN(cssPt(v))) out.widthPt = cssPt(v); break;
                case 'padding': {
                    const p = v.split(/\s+/).map(cssPt);
                    const t = p[0], r = p.length > 1 ? p[1] : t, b = p.length > 2 ? p[2] : t, l = p.length > 3 ? p[3] : r;
                    out.padding = { top: t, right: r, bottom: b, left: l };
                    break;
                }
                case 'border': ['top', 'right', 'bottom', 'left'].forEach(function (sd) { out.border[sd] = cssBorder(v); }); break;
                default:
                    if (k.indexOf('padding-') === 0) { out.padding = out.padding || {}; out.padding[k.slice(8)] = cssPt(v); }
                    else out.border[k.slice(7)] = cssBorder(v);
            }
        });
        return out;
    }

    /**
     * Parse header/footer HTML into { blocks }:
     *   { type: 'table', style, rows: [{ cells: [{ colspan, style, paras }] }] }
     *   { type: 'para', style, el }          (el: detached inline container)
     * A cell's paras: one per <p>/<div> (or the cell's own inline content),
     * split further at <br>. Placeholders stay in the text (see hfFields).
     */
    function parseHeaderFooter(html) {
        const doc = (typeof document !== 'undefined' && document.implementation)
            ? document.implementation.createHTMLDocument('') : null;
        if (!doc) return { blocks: [] };
        const root = doc.createElement('div');
        root.innerHTML = String(html || '');
        const warned = new Set();
        const warn = function (what) {
            if (warned.has(what)) return;
            warned.add(what);
            if (typeof console !== 'undefined' && console.warn) console.warn('header/footer HTML: ' + what + ' is not supported, ignored');
        };
        root.querySelectorAll('style, script, link, meta').forEach(function (e) { e.remove(); });
        root.querySelectorAll('[class]').forEach(function () { warn('class'); });
        root.querySelectorAll('*').forEach(function (e) { hfStyle(e, warn); });

        // inline content of a container → paras (split at <br> and child blocks)
        function parasOf(container, baseStyle) {
            const paras = [];
            let cur = null;
            const start = function (style) { cur = doc.createElement('span'); paras.push({ style: style || baseStyle, el: cur }); };
            (function walk(node, style) {
                for (let n = node.firstChild; n; n = n.nextSibling) {
                    if (n.nodeType === 1 && /^(P|DIV|H[1-6])$/.test(n.tagName)) {
                        const st = Object.assign({}, style, stripBox(hfStyle(n)));
                        if (/^H/.test(n.tagName)) st.bold = true;
                        cur = null;
                        start(st);
                        walk(n, st);
                        cur = null;
                        continue;
                    }
                    if (n.nodeType === 1 && n.tagName === 'BR') { start(style); continue; }
                    if (n.nodeType === 3 && !/\S/.test(n.nodeValue) && !cur) continue;
                    if (!cur) start(style);
                    cur.appendChild(n.cloneNode(true));
                }
            })(container, baseStyle);
            return paras.filter(function (p) { return p.el.childNodes.length; });
        }
        // text-level properties only (a paragraph inherits them from its cell)
        function stripBox(st) {
            const o = {};
            ['align', 'color', 'size', 'bold', 'italic'].forEach(function (k) { if (st[k] !== undefined) o[k] = st[k]; });
            return o;
        }

        const blocks = [];
        let loose = null;
        for (let n = root.firstChild; n; n = n.nextSibling) {
            if (n.nodeType === 1 && n.tagName === 'TABLE') {
                loose = null;
                const tStyle = hfStyle(n);
                const rows = [];
                n.querySelectorAll('tr').forEach(function (tr) {
                    if (tr.closest('table') !== n) return;
                    const cells = [];
                    Array.from(tr.children).forEach(function (td) {
                        if (!/^(TD|TH)$/.test(td.tagName)) return;
                        const st = hfStyle(td);
                        if (td.tagName === 'TH' && st.bold === undefined) st.bold = true;
                        cells.push({ colspan: Math.max(1, parseInt(td.getAttribute('colspan'), 10) || 1),
                                     style: st, paras: parasOf(td, stripBox(st)) });
                    });
                    if (cells.length) rows.push({ cells: cells });
                });
                if (rows.length) blocks.push({ type: 'table', style: tStyle, rows: rows });
                continue;
            }
            if (n.nodeType === 1 && /^(P|DIV|H[1-6])$/.test(n.tagName)) {
                loose = null;
                const st = hfStyle(n);
                if (/^H/.test(n.tagName)) st.bold = true;
                parasOf(n, stripBox(st)).forEach(function (p) { blocks.push({ type: 'para', style: Object.assign({}, st, p.style), el: p.el }); });
                continue;
            }
            if (n.nodeType === 3 && !/\S/.test(n.nodeValue)) continue;
            // loose inline content at the top level → one paragraph
            if (!loose) { loose = doc.createElement('span'); blocks.push({ type: 'para', style: {}, el: loose }); }
            loose.appendChild(n.cloneNode(true));
        }
        return { blocks: blocks };
    }

    /**
     * Column widths (%) of a parsed table: widths given on the cells of the
     * first row that has them (colspan split evenly), the rest shared equally.
     */
    function hfColumnWidths(table) {
        const count = Math.max.apply(null, table.rows.map(function (r) {
            return r.cells.reduce(function (s, c) { return s + c.colspan; }, 0);
        }));
        const w = new Array(count).fill(null);
        table.rows.forEach(function (r) {
            let col = 0;
            r.cells.forEach(function (c) {
                if (c.style.width && c.colspan === 1 && w[col] === null) w[col] = c.style.width;
                col += c.colspan;
            });
        });
        const given = w.reduce(function (s, x) { return s + (x || 0); }, 0);
        const free = w.filter(function (x) { return x === null; }).length;
        const rest = free ? Math.max(0, 100 - given) / free : 0;
        const out = w.map(function (x) { return x === null ? rest : x; });
        const sum = out.reduce(function (s, x) { return s + x; }, 0) || 1;
        return out.map(function (x) { return x * 100 / sum; });
    }

    /**
     * Fill the fields of an inline container (a deep clone is returned).
     * values: { page, pages, date, title } — a function value(name) returning
     * a Node places that node (Word field codes); a string replaces the text.
     */
    function hfFields(el, values) {
        const c = el.cloneNode(true);
        const doc = c.ownerDocument;
        const walker = doc.createTreeWalker(c, 4);
        const texts = [];
        for (let n = walker.nextNode(); n; n = walker.nextNode()) if (HF_FIELD_TEST.test(n.nodeValue)) texts.push(n);
        texts.forEach(function (t) {
            const frag = doc.createDocumentFragment();
            let pos = 0;
            const v = t.nodeValue;
            v.replace(HF_FIELD, function (m, name, off) {
                if (off > pos) frag.appendChild(doc.createTextNode(v.slice(pos, off)));
                const val = values[name];
                const node = typeof val === 'function' ? val(name, doc) : null;
                frag.appendChild(node || doc.createTextNode(val == null ? m : String(val)));
                pos = off + m.length;
                return m;
            });
            if (pos < v.length) frag.appendChild(doc.createTextNode(v.slice(pos)));
            t.parentNode.replaceChild(frag, t);
        });
        return c;
    }

    /** {date}: today in the header/footer language, Latin digits. */
    function hfDate(dir, locale) {
        const loc = locale || (dir === 'rtl' ? 'fa-IR-u-nu-latn' : 'en-GB');
        try { return new Intl.DateTimeFormat(loc, { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date()); }
        catch (e) { return new Date().toISOString().slice(0, 10); }
    }

    // =========================================================================
    // Small shared utilities
    // =========================================================================

    const PT_PER_UNIT = { pt: 1, px: 0.75, cm: 72 / 2.54, mm: 72 / 25.4, in: 72, pc: 12 };

    /** CSS length ('1.5cm', '11pt', '0.5in', 11) → points. */
    function lengthToPt(value) {
        if (typeof value === 'number') return value;
        const m = /^\s*(-?[\d.]+)\s*(pt|px|cm|mm|in|pc)?\s*$/i.exec(String(value));
        if (!m) throw new Error('Invalid length: ' + value);
        return parseFloat(m[1]) * PT_PER_UNIT[(m[2] || 'pt').toLowerCase()];
    }

    /**
     * Text-area width in points from template options (pageSize is already
     * landscape-swapped by setPage; margin is a 1–4 value CSS shorthand).
     */
    function contentWidthPt(T) {
        const wh = String(T.pageSize).trim().split(/\s+/).map(lengthToPt);
        const w = T.pageOrientation === 'landscape' ? Math.max(wh[0], wh[1]) : Math.min(wh[0], wh[1]);
        const m = String(T.pageMargin).trim().split(/\s+/).map(lengthToPt);
        const right = m.length > 1 ? m[1] : m[0];
        const left = m.length > 3 ? m[3] : right;
        return w - left - right;
    }

    /**
     * Deep merge without sharing nested objects with `target` (so mutating the
     * result never leaks into a DEFAULTS object). Arrays are copied, not merged.
     * @param {object} target
     * @param {object} source
     * @param {string[]} [skipKeys] - keys of `source` to ignore
     */
    function deepMerge(target, source, skipKeys) {
        const isObj = function (v) { return v && typeof v === 'object' && !Array.isArray(v); };
        const copy = function (v) { return isObj(v) ? deepMerge(v, {}) : (Array.isArray(v) ? v.slice() : v); };
        const result = {};
        for (const key in target) result[key] = copy(target[key]);
        for (const key in source) {
            if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
            if (skipKeys && skipKeys.indexOf(key) !== -1) continue;
            const v = source[key];
            result[key] = isObj(v) ? deepMerge(isObj(result[key]) ? result[key] : {}, v) : copy(v);
        }
        return result;
    }

    // =========================================================================
    // Export (UMD)
    // =========================================================================
    const BidiCore = {
        RTL_CHAR_PATTERN: RTL_CHAR_PATTERN,
        RTL_LETTER_PATTERN: RTL_LETTER_PATTERN,
        LATIN_LETTER_PATTERN: LATIN_LETTER_PATTERN,
        NUMBERS_ONLY_PATTERN: NUMBERS_ONLY_PATTERN,
        BLOCK_SEL: BLOCK_SEL,
        NON_DESCEND: NON_DESCEND,
        COMPLEX_QUOTE_SEL: COMPLEX_QUOTE_SEL,
        hasRTL: hasRTL,
        hasLatin: hasLatin,
        hasRtlLetter: hasRtlLetter,
        hasMix: hasMix,
        firstStrong: firstStrong,
        noJustify: noJustify,
        insertToc: insertToc,
        TOC_TITLES: TOC_TITLES,
        distributeColumns: distributeColumns,
        tableColumnShares: tableColumnShares,
        resolveTableWidth: resolveTableWidth,
        isLtrText: isLtrText,
        isRtlText: isRtlText,
        getVisibleText: getVisibleText,
        detectDirection: detectDirection,
        planDirections: planDirections,
        planToMaps: planToMaps,
        isComplexQuote: isComplexQuote,
        findIsolateRanges: findIsolateRanges,
        codeRtlRanges: codeRtlRanges,
        nestedFences: nestedFences,
        codeSegments: codeSegments,
        codeFragment: codeFragment,
        flattenBlock: flattenBlock,
        resolvePosition: resolvePosition,
        deepMerge: deepMerge,
        codeLanguage: codeLanguage,
        unwrapCodeBlocks: unwrapCodeBlocks,
        inertRoot: inertRoot,
        parseHeaderFooter: parseHeaderFooter,
        hfColumnWidths: hfColumnWidths,
        hfFields: hfFields,
        hfDate: hfDate,
        cssBorder: cssBorder,
        cssColorHex: cssColorHex,
        hfStyleOf: function (el) { return hfStyle(el); },
        cssPt: cssPt,
        lengthToPt: lengthToPt,
        contentWidthPt: contentWidthPt
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = BidiCore;
    } else if (typeof define === 'function' && define.amd) {
        define([], function () { return BidiCore; });
    } else {
        global.BidiCore = BidiCore;
    }

})(typeof window !== 'undefined' ? window : this);
