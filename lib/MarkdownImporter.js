/**
 * MarkdownImporter - Word / HTML / .docx → Markdown, in one pipeline
 * ============================================================================
 * Version: 1.5
 *
 * One path for every source — a .docx file (mammoth), an .html file, rich
 * text pasted from Word or a web page — so they are cleaned the same way and
 * each step runs exactly once:
 *
 *   0. .docx          Word's equations (OMML) read from the zip before mammoth,
 *                     as tokens → $…$ / $$…$$ (MathCore.ommlToTex)
 *   1. parse          inert DOMParser document (nothing loads, no scripts);
 *                     formulas kept aside as their TeX (Kelk, KaTeX — ChatGPT,
 *                     Claude —, MathML with a TeX annotation, MathJax 4, a Kelk
 *                     formula picture — alt = its TeX) and
 *                     written back at the end as $…$ / $$…$$
 *   2. word           Word HTML only: list paragraphs (mso-list) → real
 *                     <ul>/<ol> with levels, list markers taken from Word's
 *                     own <![if !supportLists]> part, <o:p> and Mso junk out
 *   3. sanitize       DOMPurify once (when loaded), then only the attributes
 *                     Markdown can use are kept (href, src, alt, title, dir,
 *                     colspan, rowspan, class="language-*")
 *   4. structure      spans/fonts unwrapped, empty paragraphs dropped,
 *                     <p> in list items unwrapped, headings/bold from Word
 *                     styles, table cells flattened (blocks → <br>), header
 *                     row made (<thead>)
 *   5. nested tables  'extract' (default): each nested table becomes its own
 *                     Markdown table below its parent, with a reference in
 *                     the cell (↳ Table 1.1) — any depth; 'html': the outer
 *                     table stays raw HTML (lossless; Markdown renderers and
 *                     the builders read it)
 *   6. turndown       GFM tables/strike, fenced code with language, images
 *                     as Markdown (or HTML, or dropped), <br> kept in cells
 *   7. tidy           blank lines collapsed, trailing spaces removed
 *
 * Needs: TurndownService (+ turndown-plugin-gfm). Optional: DOMPurify,
 * mammoth (for .docx).
 *
 * @example
 *   const imp = MarkdownImporter.create({ nestedTables: 'extract', labels: { table: 'جدول' } });
 *   const { markdown } = imp.fromHtml(clipboardHtml);
 *   const r = await imp.fromDocx(arrayBuffer);        // r.markdown, r.messages
 *   imp.fromDataTransfer(event.clipboardData)         // null when there is no HTML
 */
(function (global) {
    'use strict';

    const DEFAULTS = Object.freeze({
        nestedTables: 'extract',    // 'extract' | 'html'
        maxNestedDepth: 5,          // 'extract': deeper tables stay raw HTML
        images: 'markdown',         // 'markdown' | 'html' | 'drop'
        labels: Object.freeze({ table: 'Table' }),   // text of the nested-table references
        keepDir: true               // keep dir="rtl|ltr" on blocks (as HTML is dropped anyway)
    });

    const KEEP_ATTR = { href: 1, src: 1, alt: 1, title: 1, colspan: 1, rowspan: 1, dir: 1, start: 1 };
    const BLOCK = /^(P|DIV|H[1-6]|UL|OL|LI|TABLE|THEAD|TBODY|TFOOT|TR|TD|TH|BLOCKQUOTE|PRE|HR|SECTION|ARTICLE|HEADER|FOOTER|FIGURE|FIGCAPTION)$/;
    const LIST_MARKER_TEXT = /^[\s\u00A0]*([\u00B7\u2022\u25AA\u25CF\u25CB\u25E6\u2023\u2043\u25BA\u00A7\u00D8\u00FCo\-*]|\(?[0-9a-zA-Z\u06F0-\u06F9\u0660-\u0669]{1,4}[.)])[\s\u00A0]*$/;

    // a formula kept aside (see _mathTokens): letters only, nothing Markdown escapes
    function MATH_TOKEN(i) { return '\u27E6KMATH' + i + '\u27E7'; }

    function restoreMath(md, formulas) {
        if (!formulas.length) return md;
        return md.replace(/\u27E6KMATH(\d+)\u27E7/g, function (m, i) {
            const f = formulas[+i];
            if (!f) return m;
            const tex = f.tex.replace(/\n\s*\n/g, '\n');
            return f.display ? '\n\n$$\n' + tex + '\n$$\n\n' : '$' + tex.replace(/\s*\n\s*/g, ' ') + '$';
        });
    }

    // =========================================================================
    // .docx equations: a .docx is a zip — Word's equations (OMML) are read from
    // word/document.xml before mammoth (which drops them), each replaced by a
    // token run, and come back as $…$ / $$…$$ (MathCore.ommlToTex).
    // A small zip reader/writer: DecompressionStream inflates, the rewritten
    // document.xml is stored uncompressed, every other entry copied as it is.
    // =========================================================================

    const CRC_TABLE = (function () {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
        return t;
    })();
    function crc32(u8) {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    }

    function readZip(ab) {
        const u8 = new Uint8Array(ab), dv = new DataView(ab);
        let eocd = -1;
        for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
        if (eocd < 0) throw new Error('not a zip');
        const count = dv.getUint16(eocd + 10, true);
        let p = dv.getUint32(eocd + 16, true);
        const entries = [];
        for (let k = 0; k < count; k++) {
            if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('bad zip directory');
            const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commLen = dv.getUint16(p + 32, true);
            const e = {
                flags: dv.getUint16(p + 8, true), method: dv.getUint16(p + 10, true), time: dv.getUint16(p + 12, true), date: dv.getUint16(p + 14, true),
                crc: dv.getUint32(p + 16, true), csize: dv.getUint32(p + 20, true), usize: dv.getUint32(p + 24, true),
                local: dv.getUint32(p + 42, true), nameBytes: u8.slice(p + 46, p + 46 + nameLen)
            };
            e.name = new TextDecoder().decode(e.nameBytes);
            const ln = dv.getUint16(e.local + 26, true), le = dv.getUint16(e.local + 28, true);
            e.data = u8.subarray(e.local + 30 + ln + le, e.local + 30 + ln + le + e.csize);
            entries.push(e);
            p += 46 + nameLen + extraLen + commLen;
        }
        return entries;
    }

    async function inflateEntry(e) {
        if (e.method === 0) return e.data;
        if (e.method !== 8) throw new Error('zip method ' + e.method);
        const stream = new Blob([e.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }

    function writeZip(entries) {
        const parts = [], central = [];
        let offset = 0;
        entries.forEach(function (e) {
            const lh = new DataView(new ArrayBuffer(30));
            const flags = e.flags & 0x0800;                        // UTF-8 names; no data descriptor
            lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, flags, true);
            lh.setUint16(8, e.method, true); lh.setUint16(10, e.time, true); lh.setUint16(12, e.date, true);
            lh.setUint32(14, e.crc, true); lh.setUint32(18, e.data.length, true); lh.setUint32(22, e.usize, true);
            lh.setUint16(26, e.nameBytes.length, true); lh.setUint16(28, 0, true);
            parts.push(new Uint8Array(lh.buffer), e.nameBytes, e.data);
            const ch = new DataView(new ArrayBuffer(46));
            ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, flags, true);
            ch.setUint16(10, e.method, true); ch.setUint16(12, e.time, true); ch.setUint16(14, e.date, true);
            ch.setUint32(16, e.crc, true); ch.setUint32(20, e.data.length, true); ch.setUint32(24, e.usize, true);
            ch.setUint16(28, e.nameBytes.length, true); ch.setUint32(42, offset, true);
            central.push(new Uint8Array(ch.buffer), e.nameBytes);
            offset += 30 + e.nameBytes.length + e.data.length;
        });
        const cdSize = central.reduce(function (s, a) { return s + a.length; }, 0);
        const end = new DataView(new ArrayBuffer(22));
        end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
        end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
        return new Blob(parts.concat(central, [new Uint8Array(end.buffer)])).arrayBuffer();
    }

    const OMML_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
    const WML_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

    /**
     * Word's equations out of a .docx, before mammoth: each <m:oMathPara> /
     * <m:oMath> in word/document.xml → a run with its token; the formulas as TeX.
     * @returns {Promise<{ buffer: ArrayBuffer, formulas: Array<{ tex, display }> }|null>} null: nothing to do
     */
    async function docxEquations(ab) {
        const MC = global.MathCore;
        if (!MC || !MC.ommlToTex || typeof DecompressionStream === 'undefined' || typeof DOMParser === 'undefined') return null;
        const entries = readZip(ab);
        const doc = entries.find(function (e) { return e.name === 'word/document.xml'; });
        if (!doc) return null;
        const text = new TextDecoder().decode(await inflateEntry(doc));
        if (text.indexOf('oMath') < 0) return null;
        const xml = new DOMParser().parseFromString(text, 'application/xml');
        if (xml.querySelector('parsererror')) return null;
        const formulas = [];
        const swap = function (el) {
            let f;
            try { f = MC.ommlToTex(el); } catch (e) { f = null; }
            if (!f || !f.tex) { f = { tex: el.textContent, display: el.localName === 'oMathPara' }; }
            const r = xml.createElementNS(WML_NS, 'w:r'), t = xml.createElementNS(WML_NS, 'w:t');
            t.setAttribute('xml:space', 'preserve');
            t.textContent = MATH_TOKEN(formulas.length);
            formulas.push(f);
            r.appendChild(t);
            el.parentNode.replaceChild(r, el);
        };
        Array.from(xml.getElementsByTagNameNS(OMML_NS, 'oMathPara')).forEach(swap);
        Array.from(xml.getElementsByTagNameNS(OMML_NS, 'oMath')).forEach(swap);
        if (!formulas.length) return null;
        const bytes = new TextEncoder().encode(new XMLSerializer().serializeToString(xml));
        Object.assign(doc, { method: 0, data: bytes, usize: bytes.length, crc: crc32(bytes) });
        return { buffer: await writeZip(entries), formulas: formulas };
    }

    /** The number of a list marker Word printed ("9.", "۱۲)", "٣."); 0 for letters or bullets. */
    function markerNumber(text) {
        const m = /([0-9\u06F0-\u06F9\u0660-\u0669]+)\s*[.)]\s*$/.exec(String(text || '').trim());
        if (!m) return 0;
        return parseInt(m[1].replace(/[\u06F0-\u06F9]/g, function (d) { return d.charCodeAt(0) - 0x06F0; })
                            .replace(/[\u0660-\u0669]/g, function (d) { return d.charCodeAt(0) - 0x0660; }), 10) || 0;
    }

    class MarkdownImporter {
        constructor(options) {
            this.options = Object.assign({}, DEFAULTS, options || {});
            this.options.labels = Object.assign({}, DEFAULTS.labels, (options || {}).labels);
            this._td = null;
        }

        static create(options) { return new MarkdownImporter(options); }

        // =====================================================================
        // Sources
        // =====================================================================

        /** HTML string (Word, web page, .html file) → { markdown, html, warnings } */
        fromHtml(html) {
            const warnings = [];
            const doc = this._parse(html);
            // the LRE / PDF / LRM marks Kelk puts into Word's inline code (BidiCore.codeForWord)
            doc.querySelectorAll('code, kbd, samp, tt').forEach(function (c) {
                const w = doc.createTreeWalker(c, 4);
                for (let t = w.nextNode(); t; t = w.nextNode()) t.nodeValue = t.nodeValue.replace(/[\u200E\u202A\u202C]/g, '');
            });
            const formulas = this._mathTokens(doc, this._preMath);
            if (this._isWord(html, doc)) this._wordLists(doc);
            this._sanitize(doc);
            this._structure(doc);
            const fallbacks = this._nestedTables(doc, warnings);
            let md = this._turndown().turndown(doc.body.innerHTML);
            fallbacks.forEach(function (f) { md = md.split(f.token).join(f.markdown); });
            md = restoreMath(md, formulas);
            return { markdown: tidy(md), html: doc.body.innerHTML, warnings: warnings };
        }

        /**
         * Formulas → tokens, before anything else touches them: sanitizing
         * drops <math>/<svg> and turndown escapes backslashes, so the TeX is
         * kept aside and written back as $…$ / $$…$$ at the end. Sources:
         * Kelk (.kelk-math data-tex), KaTeX (ChatGPT, Claude … — the TeX in
         * its annotation), MathML with a TeX annotation or alttext
         * (Wikipedia), MathJax 4 (data-latex).
         * @returns {Array<{ tex, display }>} — token i is MATH_TOKEN(i)
         * @private
         */
        _mathTokens(doc, pre) {
            const found = (pre || []).slice();                   // .docx: Word's equations, already tokens
            const put = function (el, tex, display) {
                tex = String(tex || '').trim().replace(/^\{\\displaystyle\s*([\s\S]*)\}$/, '$1').trim();
                if (!tex) return;
                const t = doc.createTextNode(MATH_TOKEN(found.length));
                found.push({ tex: tex, display: !!display });
                el.parentNode.replaceChild(t, el);
            };
            const annotation = function (el) {
                const a = el.querySelector('annotation[encoding="application/x-tex"], annotation[encoding="TeX"]');
                return a ? a.textContent : '';
            };
            doc.querySelectorAll('.kelk-math[data-tex]').forEach(function (el) {
                put(el, el.getAttribute('data-tex'), el.getAttribute('data-display') === 'block');
            });
            doc.querySelectorAll('.katex-display, .katex').forEach(function (el) {
                if (!el.isConnected || (el.classList.contains('katex') && el.closest('.katex-display'))) return;
                put(el, annotation(el), el.classList.contains('katex-display'));
            });
            doc.querySelectorAll('.mwe-math-element').forEach(function (el) {       // Wikipedia
                const m = el.querySelector('math');
                put(el, annotation(el) || (m && m.getAttribute('alttext')), !!el.querySelector('.mwe-math-mathml-display, .mwe-math-fallback-image-display'));
            });
            doc.querySelectorAll('mjx-container').forEach(function (el) {           // MathJax 4
                const src = el.hasAttribute('data-latex') ? el : el.querySelector('[data-latex]');
                if (src) put(el, src.getAttribute('data-latex'), el.getAttribute('display') === 'true');
            });
            // a formula Kelk wrote as a picture (.docx image mode, mhchem): its alt is the TeX
            doc.querySelectorAll('img[alt]').forEach(function (el) {
                const alt = el.getAttribute('alt') || '';
                if (!/\\[a-zA-Z]{2,}|[_^]\{|\\[,;!]/.test(alt)) return;
                const p = el.parentElement;
                const alone = p && /^(P|DIV|LI)$/.test(p.tagName) && !/\S/.test(p.textContent) && p.querySelectorAll('img').length === 1;
                put(el, alt, alone && p.tagName !== 'LI' && !el.closest('td, th, li'));
            });
            doc.querySelectorAll('math').forEach(function (el) {
                if (!el.isConnected) return;
                const tex = annotation(el) || el.getAttribute('alttext');
                if (tex) put(el, tex, el.getAttribute('display') === 'block');
            });
            return found;
        }

        /** .docx (ArrayBuffer) → Promise<{ markdown, html, warnings, messages }> via mammoth */
        async fromDocx(arrayBuffer) {
            if (typeof mammoth === 'undefined') throw new Error('MarkdownImporter.fromDocx needs mammoth.js');
            // Word's numbering, paragraph by paragraph (mammoth turns every list run into a
            // fresh <ol> that would restart at 1 in Markdown — see _docxListNumbers)
            const seq = [];
            const last = [], count = [];
            const walk = function (node) {
                if (node && node.type === 'paragraph' && node.numbering) {
                    const num = node.numbering, L = parseInt(num.level, 10) || 0;
                    if (last[L] !== num) { last[L] = num; count[L] = 0; }       // another list at this level starts over
                    count[L]++;
                    for (let k = L + 1; k < last.length; k++) { last[k] = null; count[k] = 0; }   // a new parent: sub-levels restart
                    seq.push({ level: L, ordered: !!num.isOrdered, n: count[L] });
                }
                (node && node.children || []).forEach(walk);
            };
            // Word's equations → tokens first (mammoth drops them); back as $…$ in fromHtml
            let eq = null;
            try { eq = await docxEquations(arrayBuffer); } catch (e) { eq = null; }
            if (eq) arrayBuffer = eq.buffer;
            const r = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer }, {
                transformDocument: function (doc) { walk(doc); return doc; },
                styleMap: [
                    "p[style-name='Quote'] => blockquote > p:fresh",
                    "p[style-name='Intense Quote'] => blockquote > p:fresh",
                    "p[style-name='Title'] => h1:fresh",
                    "p[style-name='Subtitle'] => h2:fresh",
                    "r[style-name='Code'] => code",
                    "r[style-name='Inline Code'] => code",
                    "r[style-name='HTML Code'] => code",
                    "p[style-name='Code'] => pre:separator('\\n')",
                    "p[style-name='Code Block'] => pre:separator('\\n')"
                ]
            });
            this._preMath = eq ? eq.formulas : null;
            let out;
            try { out = this.fromHtml(this._docxCodeFrames(this._docxListNumbers(r.value, seq))); } finally { this._preMath = null; }
            out.messages = (r.messages || []).map(function (m) { return m.message; });
            return out;
        }

        /**
         * Code frames Kelk wrote (a one-column table: an optional language bar and
         * the code, all in the "Code Block" style → <pre>) back to one fenced block:
         * <pre><code class="language-…">. mammoth splits a frame into one <pre> per
         * table row; nothing else in the table is allowed, so a real table stays a table.
         * @private
         */
        _docxCodeFrames(html) {
            if (html.indexOf('<pre') < 0 || typeof DOMParser === 'undefined') return html;
            const doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
            let changed = false;
            doc.querySelectorAll('table').forEach(function (t) {
                const rows = Array.from(t.rows);
                if (!rows.length || rows.length > 2 || rows.some(function (r) { return r.cells.length !== 1; })) return;
                const pres = rows.map(function (r) {
                    const c = r.cells[0], kids = Array.from(c.children);
                    return kids.length === 1 && kids[0].tagName === 'PRE' && !/\S/.test(c.textContent.replace(kids[0].textContent, '')) ? kids[0] : null;
                });
                if (pres.some(function (p) { return !p; })) return;
                let lang = '', code = pres[pres.length - 1].textContent;
                if (pres.length === 2) {
                    lang = pres[0].textContent.trim();
                    if (!/^[\w+#.-]{1,24}$/.test(lang)) return;           // not a language bar
                    if (lang === 'code') lang = '';                          // Kelk's label for a block without one
                }
                const pre = doc.createElement('pre'), c = doc.createElement('code');
                if (lang) c.className = 'language-' + lang;
                c.textContent = code;
                pre.appendChild(c);
                t.parentNode.replaceChild(pre, t);
                changed = true;
            });
            return changed ? doc.body.innerHTML : html;
        }

        /**
         * Word numbering → Markdown lists. Word numbers a list across the
         * paragraphs in between (…8, a paragraph, 9, 10…) and lets a list go on
         * at a deeper level after them (12.13, a paragraph, 12.14…). mammoth
         * writes each run as a new <ol> — restarting at 1 — and a run that
         * starts deeper as an empty <ul><li> holding it ("-   1." in Markdown).
         *   - a list that goes on where an earlier one stopped gets start="n"
         *     (Markdown and every builder honor it): "9." stays 9;
         *   - a run that starts deeper goes back into the item it belongs to,
         *     with the paragraphs in between (they were indented under it).
         * `seq`: Word's number of each list paragraph, in document order.
         * @private
         */
        _docxListNumbers(html, seq) {
            const doc = this._parse(html);
            const isWrapper = function (li) {           // an <li> mammoth made for a missing parent level
                if (!li || li.tagName !== 'LI') return false;
                for (let c = li.firstChild; c; c = c.nextSibling) {
                    if (c.nodeType === 3 && c.nodeValue.trim()) return false;
                    if (c.nodeType === 1 && !/^(OL|UL)$/.test(c.tagName)) return false;
                }
                return !!li.querySelector('ol, ul');
            };
            const isWrapperList = function (list) {
                return list && /^(OL|UL)$/.test(list.tagName) && list.children.length === 1 && isWrapper(list.firstElementChild);
            };
            // 1. Word's numbers on the real items
            const items = Array.from(doc.body.querySelectorAll('li')).filter(function (li) { return !isWrapper(li); });
            if (items.length === seq.length) {
                items.forEach(function (li, i) { li.setAttribute('data-mdi-n', String(seq[i].n)); });
            }
            // 2. runs that start deeper: back into the item they belong to
            const mergeInto = function (targetLi, list, between) {
                if (isWrapperList(list)) {
                    const nested = Array.from(targetLi.children).filter(function (c) { return /^(OL|UL)$/.test(c.tagName); }).pop();
                    if (nested && nested.lastElementChild && !between.length) {
                        Array.from(list.firstElementChild.children).forEach(function (il) { mergeInto(nested.lastElementChild, il, []); });
                        return;
                    }
                }
                between.forEach(function (b) { targetLi.appendChild(b); });
                const tail = targetLi.lastElementChild;
                if (!between.length && tail && tail.tagName === list.tagName) {
                    while (list.firstChild) tail.appendChild(list.firstChild);
                } else {
                    targetLi.appendChild(list);
                }
            };
            Array.from(doc.body.children).forEach(function (el) {
                if (!isWrapperList(el) || !el.parentNode) return;
                const between = [];
                let prev = el.previousElementSibling;
                while (prev && !/^(OL|UL)$/.test(prev.tagName)) { between.unshift(prev); prev = prev.previousElementSibling; }
                if (!prev || !prev.lastElementChild) {                  // nothing to belong to: drop the empty level
                    const inner = Array.from(el.firstElementChild.children);
                    inner.forEach(function (il) { el.parentNode.insertBefore(il, el); });
                    el.parentNode.removeChild(el);
                    return;
                }
                const inner = Array.from(el.firstElementChild.children);
                inner.forEach(function (il, i) { mergeInto(prev.lastElementChild, il, i === 0 ? between : []); });
                el.parentNode.removeChild(el);
            });
            // 3. a list that goes on: start at Word's number
            doc.body.querySelectorAll('ol').forEach(function (ol) {
                const first = ol.firstElementChild;
                const n = first ? parseInt(first.getAttribute('data-mdi-n'), 10) : NaN;
                if (n > 1) ol.setAttribute('start', String(n));
            });
            doc.body.querySelectorAll('[data-mdi-n]').forEach(function (e) { e.removeAttribute('data-mdi-n'); });
            return doc.body.innerHTML;
        }

        /**
         * A paste/drop DataTransfer → result of fromHtml, or null when it holds
         * no HTML (let the plain-text paste happen).
         */
        fromDataTransfer(dt) {
            const html = dt && dt.getData && dt.getData('text/html');
            if (!html || !/<[a-z][\s\S]*>/i.test(html)) return null;
            return this.fromHtml(html);
        }

        /** Does this HTML carry structure worth converting (not just a plain line)? */
        static isRich(html) {
            return /<(table|ul|ol|h[1-6]|blockquote|pre|img|b|strong|i|em|a)\b/i.test(html || '') ||
                   /urn:schemas-microsoft-com:office|class="?Mso/i.test(html || '');
        }

        // =====================================================================
        // 1. parse
        // =====================================================================

        _parse(html) {
            let src = String(html || '');
            // Word clipboard: StartFragment/EndFragment markers → keep the fragment
            const f = /<!--StartFragment-->([\s\S]*)<!--EndFragment-->/i.exec(src);
            if (f) src = f[1];
            // Word list markers sit in <![if !supportLists]> … <![endif]> — tag
            // them before comments/conditionals are dropped by the parser
            src = src.replace(/<!\[if !supportLists\]>([\s\S]*?)<!\[endif\]>/gi, '<span data-mdi-marker="1">$1</span>')
                     .replace(/<!--\[if !supportLists\]-->([\s\S]*?)<!--\[endif\]-->/gi, '<span data-mdi-marker="1">$1</span>')
                     .replace(/<!--\[if [^\]]*\]>[\s\S]*?<!\[endif\]-->/gi, '')    // other Word conditionals (VML …)
                     .replace(/<\/?o:p>/gi, '');
            return new DOMParser().parseFromString(src, 'text/html');
        }

        _isWord(html, doc) {
            return /urn:schemas-microsoft-com:office|mso-list|class="?Mso/i.test(html) ||
                   !!doc.querySelector('[class^="Mso"], [style*="mso-"]');
        }

        // =====================================================================
        // 2. Word lists
        // =====================================================================

        /**
         * Word HTML writes list items as paragraphs (class MsoListParagraph…,
         * style mso-list: l0 level2 lfo1) with the marker as text. Rebuild real
         * nested lists: the list id (l0) separates lists, the level nests, the
         * marker's shape (digit/letter vs bullet) decides <ol>/<ul>.
         */
        _wordLists(doc) {
            const paras = Array.from(doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6')).filter(function (p) {
                return /mso-list\s*:\s*l\d+/i.test(p.getAttribute('style') || '') ||
                       /MsoListParagraph/i.test(p.getAttribute('class') || '');
            });
            let stack = [], lastPara = null, lastList = null;
            paras.forEach(function (p) {
                const st = p.getAttribute('style') || '';
                const m = /mso-list\s*:\s*(l\d+)\s+level(\d+)/i.exec(st);
                const listId = m ? m[1] : 'l?';
                const level = m ? parseInt(m[2], 10) : 1;
                const marker = p.querySelector('[data-mdi-marker]');
                const markerText = marker ? marker.textContent : '';
                const ordered = /[0-9a-zA-Z\u06F0-\u06F9\u0660-\u0669][.)]/.test(markerText);
                if (marker) marker.remove();
                else {                                  // no conditional part: strip a leading marker-like span
                    const first = p.querySelector('span');
                    if (first && LIST_MARKER_TEXT.test(first.textContent)) first.remove();
                }
                const li = doc.createElement('li');
                while (p.firstChild) li.appendChild(p.firstChild);
                const adjacent = lastPara && nextElement(lastPara) === p;
                if (!adjacent || !lastList || lastList.id !== listId) stack = [];
                // pop to this level, push new lists as needed
                while (stack.length && stack[stack.length - 1].level > level) stack.pop();
                let top = stack[stack.length - 1];
                if (!top || top.level < level) {
                    const list = doc.createElement(ordered ? 'ol' : 'ul');
                    // a list that goes on after paragraphs: Word printed its number ("9.") — keep it
                    const startN = ordered ? markerNumber(markerText) : 0;
                    if (startN > 1) list.setAttribute('start', String(startN));
                    if (top) {
                        const parentLi = top.el.lastElementChild || top.el.appendChild(doc.createElement('li'));
                        parentLi.appendChild(list);
                    } else {
                        p.parentNode.insertBefore(list, p);
                    }
                    top = { el: list, level: level };
                    stack.push(top);
                } else if ((top.el.tagName === 'OL') !== ordered && stack.length === 1) {
                    const list = doc.createElement(ordered ? 'ol' : 'ul');
                    top.el.parentNode.insertBefore(list, top.el.nextSibling);
                    top = stack[0] = { el: list, level: level };
                }
                top.el.appendChild(li);
                lastPara = p;
                lastList = { id: listId };
                p.dataset.mdiGone = '1';
            });
            paras.forEach(function (p) {
                // keep the adjacency test working until the end, then remove
                if (p.parentNode) p.parentNode.removeChild(p);
            });
            doc.querySelectorAll('[data-mdi-marker]').forEach(function (e) { e.remove(); });
        }

        // =====================================================================
        // 3. sanitize
        // =====================================================================

        _sanitize(doc) {
            if (typeof DOMPurify !== 'undefined') {
                const clean = DOMPurify.sanitize(doc.body.innerHTML, {
                    ALLOW_DATA_ATTR: false,
                    FORBID_TAGS: ['style', 'script', 'meta', 'link', 'title', 'xml', 'form', 'input', 'button', 'svg', 'math'],
                    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data:image\/[a-z+.-]+;base64):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i
                });
                doc.body.innerHTML = clean;
            } else {
                doc.querySelectorAll('script, style, meta, link, title, xml').forEach(function (e) { e.remove(); });
            }
            // attributes Markdown can carry; the language of code blocks
            doc.body.querySelectorAll('*').forEach(function (el) {
                const lang = /\blanguage-([\w+#-]+)/.exec(el.getAttribute('class') || '');
                Array.from(el.attributes).forEach(function (a) {
                    if (!KEEP_ATTR[a.name]) el.removeAttribute(a.name);
                });
                if (lang) el.setAttribute('class', 'language-' + lang[1]);
            });
        }

        // =====================================================================
        // 4. structure
        // =====================================================================

        _structure(doc) {
            const body = doc.body;
            // presentational wrappers → their content
            body.querySelectorAll('span, font, o\\:p, ins').forEach(unwrap);
            // bold/italic synonyms (Word writes <b>, web pages <strong> …): leave to turndown
            // empty paragraphs (Word: <p>&nbsp;</p>)
            body.querySelectorAll('p, div').forEach(function (p) {
                if (!p.querySelector('img, table, br') && !/\S/.test(p.textContent.replace(/\u00A0/g, ' '))) p.remove();
            });
            // a <p> that is the only block of a list item → inline
            body.querySelectorAll('li > p:only-child').forEach(unwrap);
            // divs are only containers here
            body.querySelectorAll('div').forEach(function (d) { if (!d.closest('pre')) unwrap(d); });
            // tables: header row, flat cells
            body.querySelectorAll('table').forEach(function (t) {
                t.querySelectorAll('colgroup, col, caption').forEach(function (e) { e.remove(); });
                flattenCells(t);
                ensureHeader(t, doc);
            });
        }

        // =====================================================================
        // 5. nested tables
        // =====================================================================

        _nestedTables(doc, warnings) {
            const self = this, o = this.options, out = [];
            const tag = Math.random().toString(36).slice(2, 8).toUpperCase();
            let root = 0;
            Array.from(doc.body.querySelectorAll('table')).forEach(function (t) {
                if (!t.parentNode || t.parentNode.closest('table')) return;
                if (!t.querySelector('table')) return;
                root++;
                const token = 'MDINESTED' + tag + root + 'END';
                let md;
                if (o.nestedTables === 'html') {
                    md = '\n\n' + cleanTableHtml(t) + '\n\n';
                } else {
                    md = '\n\n' + self._extract(t, String(root), 0, warnings) + '\n\n';
                }
                t.replaceWith(doc.createTextNode(token));
                out.push({ token: token, markdown: md });
            });
            return out;
        }

        /** A table with its nested tables pulled out below it (depth-first). */
        _extract(table, id, depth, warnings) {
            const self = this, o = this.options, doc = table.ownerDocument;
            const label = o.labels.table || 'Table';
            const children = [];
            const direct = Array.from(table.querySelectorAll('table')).filter(function (nt) {
                return nt.parentNode.closest('table') === table;
            });
            direct.forEach(function (nt, i) {
                const cid = id + '.' + (i + 1);
                const ref = doc.createElement('em');
                ref.textContent = '↳ ' + label + ' ' + cid;
                nt.replaceWith(ref);
                if (depth + 1 >= o.maxNestedDepth) {
                    warnings.push(label + ' ' + cid + ': deeper than ' + o.maxNestedDepth + ' levels, kept as HTML');
                    children.push('**' + label + ' ' + cid + '**\n\n' + cleanTableHtml(nt));
                } else {
                    children.push('**' + label + ' ' + cid + '**\n\n' + self._extract(nt, cid, depth + 1, warnings));
                }
            });
            flattenCells(table);
            ensureHeader(table, doc);
            const own = this._turndown().turndown(table.outerHTML).trim();
            return [own].concat(children).join('\n\n');
        }

        // =====================================================================
        // 6. turndown
        // =====================================================================

        _turndown() {
            if (this._td) return this._td;
            if (typeof TurndownService === 'undefined') throw new Error('MarkdownImporter needs TurndownService (turndown.js)');
            const o = this.options;
            const td = new TurndownService({
                headingStyle: 'atx', hr: '---', bulletListMarker: '-',
                codeBlockStyle: 'fenced', fence: '```', emDelimiter: '*', strongDelimiter: '**'
            });
            if (global.turndownPluginGfm) td.use(global.turndownPluginGfm.gfm);
            td.addRule('strike', { filter: ['del', 's', 'strike'], replacement: function (c) { return c ? '~~' + c + '~~' : ''; } });
            td.addRule('brInCell', {
                filter: function (n) { return n.nodeName === 'BR' && !!n.closest && !!n.closest('td, th'); },
                replacement: function () { return '<br>'; }
            });
            td.addRule('fencedLang', {
                filter: function (n) { return n.nodeName === 'PRE'; },
                replacement: function (c, n) {
                    const code = n.querySelector('code');
                    const lang = /language-([\w+#-]+)/.exec((code && code.getAttribute('class')) || n.getAttribute('class') || '');
                    const text = (code || n).textContent.replace(/\n$/, '');
                    let fence = '```';
                    while (text.indexOf(fence) >= 0) fence += '`';
                    return '\n\n' + fence + (lang ? lang[1] : '') + '\n' + text + '\n' + fence + '\n\n';
                }
            });
            td.addRule('images', {
                filter: 'img',
                replacement: function (c, n) {
                    if (o.images === 'drop') return '';
                    if (o.images === 'html') return n.outerHTML;
                    const src = n.getAttribute('src') || '';
                    if (!src) return '';
                    const alt = (n.getAttribute('alt') || '').replace(/[\[\]]/g, '');
                    const title = n.getAttribute('title');
                    return '![' + alt + '](' + src + (title ? ' "' + title.replace(/"/g, '\\"') + '"' : '') + ')';
                }
            });
            // raw HTML tables left by nestedTables:'html' pass through untouched
            td.keep(function (n) { return n.nodeName === 'TABLE' && n.hasAttribute('data-mdi-raw'); });
            this._td = td;
            return td;
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    function unwrap(el) {
        const p = el.parentNode;
        if (!p) return;
        while (el.firstChild) p.insertBefore(el.firstChild, el);
        p.removeChild(el);
    }

    function nextElement(el) {
        let n = el.nextSibling;
        while (n && n.nodeType === 3 && !/\S/.test(n.nodeValue)) n = n.nextSibling;
        return n && n.nodeType === 1 ? n : null;
    }

    /**
     * GFM cells hold one line: blocks inside a cell become <br>-separated
     * lines, list items get a bullet, paragraphs lose their wrapper. Only the
     * cells of this table (not of tables nested in it).
     */
    function flattenCells(table) {
        const doc = table.ownerDocument;
        Array.from(table.querySelectorAll('td, th')).forEach(function (cell) {
            if (cell.closest('table') !== table) return;
            cell.querySelectorAll('li').forEach(function (li) {
                if (li.closest('table') !== table) return;
                li.insertBefore(doc.createTextNode('• '), li.firstChild);
            });
            Array.from(cell.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6, blockquote, ul, ol')).forEach(function (b) {
                if (b.closest('table') !== table) return;
                if (/^(UL|OL|BLOCKQUOTE)$/.test(b.tagName)) { unwrap(b); return; }
                if (b.nextSibling || b.nextElementSibling) b.parentNode.insertBefore(doc.createElement('br'), b.nextSibling);
                unwrap(b);
            });
            // no trailing / doubled <br>
            let last = cell.lastChild;
            while (last && (last.nodeName === 'BR' || (last.nodeType === 3 && !/\S/.test(last.nodeValue)))) {
                const prev = last.previousSibling; cell.removeChild(last); last = prev;
            }
        });
    }

    /** First row as header (GFM needs one): <td> → <th>, moved into <thead>. */
    function ensureHeader(table, doc) {
        const rows = Array.from(table.rows).filter(function (r) { return r.closest('table') === table; });
        if (!rows.length) return;
        if (!table.tHead) {
            const first = rows[0];
            Array.from(first.cells).forEach(function (td) {
                if (td.tagName === 'TH') return;
                const th = doc.createElement('th');
                while (td.firstChild) th.appendChild(td.firstChild);
                Array.from(td.attributes).forEach(function (a) { th.setAttribute(a.name, a.value); });
                td.replaceWith(th);
            });
            const thead = doc.createElement('thead');
            thead.appendChild(first);
            table.insertBefore(thead, table.firstChild);
        }
    }

    /** A table kept as HTML: compact, marked so turndown keeps it. */
    function cleanTableHtml(t) {
        const c = t.cloneNode(true);
        c.setAttribute('data-mdi-raw', '1');
        return c.outerHTML.replace(/\sdata-mdi-raw="1"/g, '').replace(/>\s+</g, '><');
    }

    function tidy(md) {
        return md.replace(/^(#{1,6} [^\n]*?\d)\\\./gm, '$1.')      // "## 1\\. Title" → "## 1. Title" (safe in a heading)
                 .replace(/[ \t]+$/gm, '')
                 .replace(/\n{3,}/g, '\n\n')
                 .replace(/^\n+|\n+$/g, '') + '\n';
    }

    MarkdownImporter.DEFAULTS = DEFAULTS;

    if (typeof module !== 'undefined' && module.exports) module.exports = MarkdownImporter;
    else if (typeof define === 'function' && define.amd) define([], function () { return MarkdownImporter; });
    else global.MarkdownImporter = MarkdownImporter;
})(typeof window !== 'undefined' ? window : this);
