/**
 * MathCore - LaTeX math for the Kelk builders and the preview
 * ============================================================================
 * Version: 1.5
 *
 * Formulas written in Markdown the way AI models and scientists write them:
 *
 *   inline    $E = mc^2$            \( E = mc^2 \)
 *   display   $$ … $$  (own lines or inside a paragraph)
 *             \[ … \]  (on their own lines only — an inline "\[1\]" stays
 *                       escaped brackets, as Markdown means it)
 *
 * A dollar sign is a formula only by the Pandoc rule: no space after the
 * opening $, none before the closing $, no digit right after it — so
 * "from $5 to $10" stays money. Code spans and code blocks are never read.
 *
 * 1. marked:  marked.use(MathCore.markedExtension())
 *    Each formula becomes an EMPTY placeholder that carries its TeX:
 *      <span class="kelk-math" data-display="inline" data-tex="E = mc^2"></span>
 *      <div  class="kelk-math" data-display="block"  data-tex="…"></div>
 *    Empty on purpose: BidiCore (isMathAtom) and every text-based rule see
 *    nothing inside, and the HTML passed around stays short.
 *
 * 2. render:  await MathCore.render(tex, display, { textFont })
 *    → { tex, display, svg, mathml, width, height, depth, error }
 *    svg     self-contained SVG markup (no <use>, no stylesheet needed):
 *            width/height in ex (it scales with the text around it)
 *    mathml  MathJax's MathML (full MathML 3 — for converters)
 *    mathmlCore  the same for browsers (MathML Core): letter styles as
 *            Unicode math letters, primes, column alignment as CSS — or null
 *            when a browser cannot draw it (mathmlCoreIssue says why:
 *            \cancel/\boxed, tags, table rules, wide accents and braces,
 *            extensible arrows, mhchem arrows)
 *    width, height, depth   in em (depth: below the baseline) — for layout
 *    error   the TeX error message, '' when none (typeset() then shows the
 *            TeX as written, in red, with the message as its tooltip)
 *    Results are cached; renders run one at a time.
 *
 * 3. typeset: await MathCore.typeset(root, { mode: 'svg'|'mathml', textFont })
 *    fills every placeholder under root (preview, standalone HTML). In
 *    'mathml' mode a formula without mathmlCore is drawn as SVG
 *    (data-math-svg names the reason).
 *    MathCore.css(options) is the CSS the placeholders need on a page.
 *
 * 4. images:  await MathCore.toImages(root, { fontSizePt, fontFamily, maxWidth, omml })
 *    every placeholder → <img class="kelk-math-img" data-depth> (SVG data
 *    URI, display size in px; depth = px below the baseline); a display
 *    formula in its own <p class="kelk-math-block">. The Word and PDF
 *    builders do this themselves (BuilderBase._mathToImages) and ImageCore
 *    rasterizes the SVG. toImage(rec, o) is the single-formula form.
 *    omml: true also gives each image data-omml — the formula as Word's own
 *    equation (OMML), which DocxBuilder writes instead of the picture.
 *
 * 5. OMML:    MathCore.toOmml(rec.mathml, { display }) → { xml, reason }
 *    <m:oMath> / <m:oMathPara>: fractions, radicals, scripts, n-ary operators
 *    with their operand, delimiters, matrices and aligned rows, accents, bars,
 *    braces, arrows with labels, boxes and strikes, letter styles, color.
 *    xml null for mhchem (private glyphs) and maction.
 *    ommlToWordHtml(xml): the same equation as Word writes it in HTML (.doc).
 *
 * 6. OMML → TeX: MathCore.ommlToTex(element) → { tex, display } — Word's
 *    equations back to LaTeX (MarkdownImporter, .docx). No MathJax needed.
 *
 * Text inside a formula (\text{…}) in Persian, Arabic, Hebrew …: MathJax's
 * fonts have no such letters, so that formula is rendered with the document
 * font (textFont, default Vazirmatn — it must be loaded on the page) and the
 * text is kept as one right-to-left run.
 *
 * Engine: MathJax 4 (Apache-2.0), local copy — no CDN, works from file://.
 * Only startup + TeX input + SVG output + ui/safe are loaded (not the combined
 * tex-svg.js: its speech tools read data with fetch(), which file:// refuses).
 * ui/safe keeps \href from making javascript: links. Fonts, font ranges and
 * TeX extensions load on first use from the same folder:
 *   MathCore.configure({ mathjax: 'vendor/mathjax_4.1.3/' })
 * Default: ../vendor/mathjax_4.1.3/ next to this file.
 *
 * Needs a DOM (browser) for render/typeset; markedExtension() works anywhere.
 */
(function (global) {
    'use strict';

    const VERSION = '1.5';

    const RTL_LETTER = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
    const STRONG = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]|[\u0590-\u05FF\u0600-\u06FF\u0700-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
    const RLI = '\u2067', PDI = '\u2069';
    const PUA_RE = /[\uE000-\uF8FF]/;

    const here = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || '';

    const DEFAULTS = {
        mathjax: here ? new URL('../vendor/mathjax_4.1.3/', here).href : 'vendor/mathjax_4.1.3/',
        textFont: 'Vazirmatn',
        imageScale: 2,          // toImage(): the SVG is declared at 2× its display size (sharper PNG)
        fonts: null             // toImage(): { family: [{ weight, style, format, data }] } — default window.KelkWebFonts
    };

    const options = Object.assign({}, DEFAULTS);
    const cache = new Map();            // key → Promise<record>
    let loading = null;                 // Promise<MathJax>
    let queue = Promise.resolve();      // renders one at a time (the text-font switch is global)

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    /** First strong letter is right-to-left? */
    function rtlFirst(t) {
        const m = STRONG.exec(String(t || ''));
        return !!m && RTL_LETTER.test(m[0]);
    }

    /** An RTL run as one isolate; spaces at its ends stay outside (in place, not mirrored). */
    function isolateRtl(t) {
        const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(t);
        return m[1] + RLI + m[2] + PDI + m[3];
    }

    function configure(o) {
        Object.keys(o || {}).forEach(function (k) { if (o[k] != null) options[k] = o[k]; });
        return MathCore;
    }

    // =========================================================================
    // 1. marked extension
    // =========================================================================

    function token(type, raw, tex, display) {
        return { type: type, raw: raw, tex: String(tex).trim(), display: display };
    }

    function markedExtension() {
        const block = {
            name: 'kelkMathBlock',
            level: 'block',
            start: function (src) {
                const m = /(^|\n)[ \t]{0,3}(\$\$|\\\[)/.exec(src);
                return m ? m.index + m[1].length : undefined;
            },
            tokenizer: function (src) {
                const m = /^[ \t]{0,3}(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\])[ \t]*(?:\n+|$)/.exec(src);
                if (!m) return undefined;
                const tex = m[1] !== undefined ? m[1] : m[2];
                if (!tex.trim() || /\n[ \t]*\n/.test(tex)) return undefined;    // a blank line ends a formula
                return token('kelkMathBlock', m[0], tex, true);
            },
            renderer: function (t) {
                return '<div class="kelk-math" data-display="block" data-tex="' + esc(t.tex) + '"></div>\n';
            }
        };
        const inline = {
            name: 'kelkMath',
            level: 'inline',
            start: function (src) {
                const i = src.search(/\$|\\\(/);
                return i < 0 ? undefined : i;
            },
            tokenizer: function (src) {
                let m;
                if ((m = /^\$\$(?!\$)([\s\S]+?)\$\$/.exec(src)) && !/\n[ \t]*\n/.test(m[1])) return token('kelkMath', m[0], m[1], true);
                if ((m = /^\\\(([\s\S]+?)\\\)/.exec(src)) && !/\n[ \t]*\n/.test(m[1])) return token('kelkMath', m[0], m[1], false);
                if ((m = /^\$(?![\s$])((?:\\.|[^\\$\n])+?)(?<!\s)\$(?!\d)/.exec(src))) return token('kelkMath', m[0], m[1], false);
                return undefined;
            },
            renderer: function (t) {
                return '<span class="kelk-math" data-display="' + (t.display ? 'block' : 'inline') + '" data-tex="' + esc(t.tex) + '"></span>';
            }
        };
        return { extensions: [block, inline] };
    }

    // =========================================================================
    // 2. engine
    // =========================================================================

    function placeholders(root) {
        return root && root.querySelectorAll ? Array.from(root.querySelectorAll('.kelk-math[data-tex]')) : [];
    }

    /** Does an element or an HTML string hold formulas? */
    function hasMath(source) {
        if (!source) return false;
        if (typeof source === 'string') return /class="kelk-math"/.test(source);
        return placeholders(source).length > 0;
    }

    /** Load MathJax (once). Reuses a MathJax the page already started. */
    function load() {
        if (loading) return loading;
        if (typeof document === 'undefined') return Promise.reject(new Error('MathCore needs a DOM (browser)'));
        const MJ = global.MathJax;
        if (MJ && MJ.startup && MJ.tex2svgPromise) {
            loading = MJ.startup.promise.then(function () { return MJ; });
            return loading;
        }
        const base = new URL(options.mathjax, document.baseURI).href.replace(/\/?$/, '/');
        global.MathJax = {
            loader: {
                paths: { fonts: '[mathjax]/fonts' },          // font packages: local, never the CDN
                load: ['input/tex', 'output/svg', 'ui/safe']
            },
            startup: { typeset: false },
            svg: {
                fontCache: 'none',                            // every SVG draws its own glyphs
                linebreaks: { inline: false }                 // one piece per formula (v4 splits inline math otherwise)
            }
        };
        loading = new Promise(function (resolve, reject) {
            const s = document.createElement('script');
            s.src = base + 'startup.js';
            s.onload = resolve;
            s.onerror = function () { reject(new Error('MathCore: cannot load ' + s.src)); };
            document.head.appendChild(s);
        }).then(function () {
            return global.MathJax.startup.promise;
        }).then(function () {
            return global.MathJax;
        }).catch(function (e) {
            loading = null;
            throw e;
        });
        return loading;
    }

    function setAll(root, sel, attrs) {
        root.querySelectorAll(sel).forEach(function (el) {
            Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
        });
    }

    /**
     * The rules of MathJax's SVG stylesheet that change how a formula looks,
     * as attributes — so the SVG draws the same with no stylesheet (a page,
     * an <img>, a canvas).
     */
    function selfContain(svg) {
        svg.querySelectorAll('[data-latex]').forEach(function (e) { e.removeAttribute('data-latex'); });
        setAll(svg, 'g[data-mml-node="merror"] > g', { fill: 'red', stroke: 'red' });
        setAll(svg, 'g[data-mml-node="merror"] > rect[data-background]', { fill: 'yellow', stroke: 'none' });
        setAll(svg, 'line[data-line]', { 'stroke-width': '70', fill: 'none' });
        setAll(svg, 'rect[data-frame]', { 'stroke-width': '70', fill: 'none' });
        setAll(svg, '.mjx-dashed', { 'stroke-dasharray': '140' });
        setAll(svg, '.mjx-dotted', { 'stroke-linecap': 'round', 'stroke-dasharray': '0,140' });
        setAll(svg, 'a', { fill: 'blue', stroke: 'blue' });
        // only these may draw outside their box; stretched glyphs (bars, arrows) are CLIPPED by their nested <svg>
        svg.querySelectorAll('g[data-mml-node="mtable"] > g > svg').forEach(function (s) { s.setAttribute('overflow', 'visible'); });
        svg.setAttribute('overflow', 'visible');
        svg.removeAttribute('focusable');
        // right-to-left text: one isolated RTL run (words keep their order)
        svg.querySelectorAll('text').forEach(function (t) {
            t.setAttribute('xml:space', 'preserve');            // "\text{if }": the space was measured, keep it
            t.style.whiteSpace = 'pre';
            if (rtlFirst(t.textContent)) t.textContent = isolateRtl(t.textContent);
        });
    }

    function cleanMathml(mml) {
        return String(mml || '')
            .replace(/\s+data-[\w-]+="[^"]*"/g, '')
            .replace(/(<mtext\b[^>]*>)([^<]*)(<\/mtext>)/g, function (m, a, t, b) {
                return rtlFirst(t) ? a.replace(/^<mtext\b/, '<mtext class="kelk-rtl"') + isolateRtl(t) + b : m;
            });
    }

    // ── MathML for the browser (MathML Core) ─────────────────────────────────
    //
    // MathJax's MathML is full MathML 3; browsers draw MathML Core, a subset
    // (Chromium, Firefox and Safari alike). What Core lacks is either rewritten
    // here (letter styles → Unicode math letters, primes, column alignment) or
    // the formula is drawn as SVG instead (the list in coreProblem()).

    const ALNUM = {           // Latin A–Z a–z start, digits 0–9 start (Mathematical Alphanumeric Symbols)
        'bold': [0x1D400, 0x1D7CE], 'italic': [0x1D434, 0], 'bold-italic': [0x1D468, 0],
        'script': [0x1D49C, 0], 'bold-script': [0x1D4D0, 0], 'fraktur': [0x1D504, 0],
        'double-struck': [0x1D538, 0x1D7D8], 'bold-fraktur': [0x1D56C, 0],
        'sans-serif': [0x1D5A0, 0x1D7E2], 'bold-sans-serif': [0x1D5D4, 0x1D7EC],
        'sans-serif-italic': [0x1D608, 0], 'sans-serif-bold-italic': [0x1D63C, 0],
        'monospace': [0x1D670, 0x1D7F6]
    };
    const GREEK = { 'bold': 0x1D6A8, 'italic': 0x1D6E2, 'bold-italic': 0x1D71C, 'bold-sans-serif': 0x1D756, 'sans-serif-bold-italic': 0x1D790 };
    const HOLES = {           // letters that live in Letterlike Symbols instead
        'italic': { h: 0x210E },
        'script': { B: 0x212C, E: 0x2130, F: 0x2131, H: 0x210B, I: 0x2110, L: 0x2112, M: 0x2133, R: 0x211B, e: 0x212F, g: 0x210A, o: 0x2134 },
        'fraktur': { C: 0x212D, H: 0x210C, I: 0x2111, R: 0x211C, Z: 0x2128 },
        'double-struck': { C: 0x2102, H: 0x210D, N: 0x2115, P: 0x2119, Q: 0x211A, R: 0x211D, Z: 0x2124 }
    };
    const VARIANT_CSS = {
        'bold': 'font-weight:bold', 'italic': 'font-style:italic', 'bold-italic': 'font-weight:bold;font-style:italic',
        'sans-serif': 'font-family:sans-serif', 'bold-sans-serif': 'font-family:sans-serif;font-weight:bold',
        'monospace': 'font-family:monospace'
    };
    // horizontally stretched characters (braces, bars, wide accents, arrows)
    const STRETCH_H = /^[\u2015\u203E\u00AF^\u02C6\u0302~\u02DC\u0303\u23DC-\u23DF\u23B4\u23B5\u2190-\u21FF\u27F5-\u27FF\u203F\u2040\u2322\u2323]$/;

    function variantChar(ch, v) {
        const c = ch.codePointAt(0);
        const hole = HOLES[v] && HOLES[v][ch];
        if (hole) return String.fromCodePoint(hole);
        const a = ALNUM[v];
        if (a && c >= 65 && c <= 90) return String.fromCodePoint(a[0] + c - 65);
        if (a && c >= 97 && c <= 122) return String.fromCodePoint(a[0] + 26 + c - 97);
        if (a && a[1] && c >= 48 && c <= 57) return String.fromCodePoint(a[1] + c - 48);
        const g = GREEK[v];
        if (g && c >= 0x391 && c <= 0x3A9) return String.fromCodePoint(g + c - 0x391);
        if (g && c >= 0x3B1 && c <= 0x3C9) return String.fromCodePoint(g + 26 + c - 0x3B1);
        return null;
    }

    function kids(el) { return Array.prototype.filter.call(el.childNodes, function (n) { return n.nodeType === 1; }); }

    /** An element reduced to its single meaningful child (mrow/mstyle wrappers). */
    function core1(el) {
        while (el && /^(mrow|mstyle)$/.test(el.localName) && kids(el).length === 1) el = kids(el)[0];
        return el;
    }

    /** Why this MathML cannot be drawn by a browser ('' = it can). */
    function coreProblem(math) {
        if (PUA_RE.test(math.textContent)) return 'private-use glyph (mhchem arrow)';
        if (math.querySelector('menclose')) return 'menclose (\\cancel, \\boxed)';
        if (math.querySelector('mlabeledtr')) return 'equation tag';
        if (math.querySelector('maction, mglyph')) return 'maction';
        const tables = math.querySelectorAll('mtable');
        for (let i = 0; i < tables.length; i++) {
            const t = tables[i];
            if (/solid|dashed/.test((t.getAttribute('columnlines') || '') + (t.getAttribute('rowlines') || '') + (t.getAttribute('frame') || ''))) return 'table rules';
        }
        const pads = math.querySelectorAll('mpadded');
        for (let i = 0; i < pads.length; i++) {
            const p = pads[i];
            // Core: plain lengths only — no "+0.8em", no pseudo-units ("2width")
            if (['width', 'height', 'depth', 'lspace', 'voffset'].some(function (a) { return /^\+|width|height|depth/.test(p.getAttribute(a) || ''); })) return 'relative mpadded';
        }
        const scripts = math.querySelectorAll('mover, munder, munderover');
        for (let i = 0; i < scripts.length; i++) {
            const k = kids(scripts[i]);
            const base = core1(k[0]);
            if (base && base.localName === 'mo' && STRETCH_H.test(base.textContent.trim())) return 'extensible arrow';
            const wide = base && (base.localName === 'mrow' || base.localName === 'mstyle' || base.textContent.trim().length > 1);
            for (let j = 1; j < k.length; j++) {
                const acc = core1(k[j]);
                if (acc && acc.localName === 'mo' && STRETCH_H.test(acc.textContent.trim()) && (wide || /[\u23DC-\u23DF\u23B4\u23B5]/.test(acc.textContent))) return 'wide accent or brace';
            }
        }
        return '';
    }

    function applyVariants(math) {
        // mstyle mathvariant → its tokens
        math.querySelectorAll('mstyle[mathvariant]').forEach(function (st) {
            const v = st.getAttribute('mathvariant');
            st.querySelectorAll('mi, mn, mo, mtext').forEach(function (t) { if (!t.hasAttribute('mathvariant')) t.setAttribute('mathvariant', v); });
            st.removeAttribute('mathvariant');
        });
        let ok = true;
        math.querySelectorAll('[mathvariant]').forEach(function (t) {
            const v = t.getAttribute('mathvariant');
            if (v === 'normal' && t.localName === 'mi') return;               // Core: upright single letter
            t.removeAttribute('mathvariant');
            if (v === 'normal') return;
            const chars = Array.from(t.textContent);
            const mapped = chars.map(function (ch) { return /\s/.test(ch) ? ch : variantChar(ch, v); });
            if (/^(mi|mn)$/.test(t.localName) && mapped.every(Boolean) && chars.some(function (ch) { return !/\s/.test(ch); })) {
                t.textContent = mapped.join('');
                if (t.localName === 'mi' && chars.length === 1) t.setAttribute('mathvariant', 'normal');   // no auto-italic on top
            } else if (VARIANT_CSS[v]) {
                t.setAttribute('style', (t.getAttribute('style') ? t.getAttribute('style') + ';' : '') + VARIANT_CSS[v]);
            } else if (mapped.every(Boolean)) {
                t.textContent = mapped.join('');
            } else ok = false;
        });
        return ok;
    }

    /** f′: the prime is a raised glyph already — not a superscript. */
    function flattenPrimes(math) {
        math.querySelectorAll('msup').forEach(function (m) {
            const k = kids(m);
            const sup = k[1] && core1(k[1]);
            if (!sup || sup.localName !== 'mo' || !/^[\u2032-\u2034\u2057]+$/.test(sup.textContent.trim())) return;
            const row = m.ownerDocument.createElementNS(m.namespaceURI, 'mrow');
            row.appendChild(k[0]);
            sup.setAttribute('lspace', '0');
            sup.setAttribute('rspace', '0');
            row.appendChild(sup);
            m.parentNode.replaceChild(row, m);
        });
    }

    function lengthList(v) { return String(v || '').trim().split(/\s+/).filter(Boolean); }

    /** columnalign / columnspacing (align, cases, arrays) as CSS on the cells. */
    function alignColumns(math) {
        math.querySelectorAll('mtable').forEach(function (t) {
            const al = lengthList(t.getAttribute('columnalign'));
            const sp = lengthList(t.getAttribute('columnspacing'));
            if (!al.length && !sp.length) return;
            kids(t).forEach(function (tr) {
                if (tr.localName !== 'mtr') return;
                const rowAl = lengthList(tr.getAttribute('columnalign'));
                const cells = kids(tr).filter(function (c) { return c.localName === 'mtd'; });
                cells.forEach(function (td, i) {
                    const a = td.getAttribute('columnalign') || rowAl[Math.min(i, rowAl.length - 1)] || al[Math.min(i, al.length - 1)] || 'center';
                    const half = function (x) { return x ? 'calc(' + x + ' / 2)' : '0'; };
                    const before = i === 0 ? '0' : half(sp.length ? sp[Math.min(i - 1, sp.length - 1)] : '0.8em');
                    const after = i === cells.length - 1 ? '0' : half(sp.length ? sp[Math.min(i, sp.length - 1)] : '0.8em');
                    td.setAttribute('style', (td.getAttribute('style') ? td.getAttribute('style') + ';' : '') +
                        'text-align:' + a + ';padding-left:' + before + ';padding-right:' + after);
                });
            });
        });
    }

    /**
     * MathML a browser draws as MathJax means it, or null (→ use the SVG).
     * @returns {{ mathml: string|null, reason: string }}
     */
    function toCore(mml) {
        if (typeof DOMParser === 'undefined') return { mathml: null, reason: 'no DOM' };
        const doc = new DOMParser().parseFromString(mml, 'application/xml');
        const math = doc.documentElement;
        if (!math || math.localName !== 'math' || doc.querySelector('parsererror')) return { mathml: null, reason: 'parse error' };
        const why = coreProblem(math);
        if (why) return { mathml: null, reason: why };
        if (!applyVariants(math)) return { mathml: null, reason: 'letter style' };
        flattenPrimes(math);
        alignColumns(math);
        return { mathml: new XMLSerializer().serializeToString(math), reason: '' };
    }

    async function renderNow(tex, display, font) {
        const MJ = await load();
        if (font && document.fonts && document.fonts.load) {
            try { await document.fonts.load('16px "' + font.replace(/"/g, '') + '"', 'ابپ'); } catch (e) { /* measured with a fallback */ }
        }
        const jax = MJ.startup.document.outputJax;
        const inherit = jax.options.mtextInheritFont;
        let node;
        try {
            if (font) jax.options.mtextInheritFont = true;     // \text in the document font, measured in it
            node = await MJ.tex2svgPromise(tex, font ? { display: display, family: font } : { display: display });
        } finally {
            jax.options.mtextInheritFont = inherit;
        }
        const svg = node.querySelector('svg');
        if (!svg) throw new Error('MathCore: no output for ' + tex);
        if (node.querySelectorAll(':scope > svg').length > 1) console.warn('MathCore: formula split in pieces — ' + tex);
        const errEl = svg.querySelector('[data-mjx-error]');
        const error = errEl ? errEl.getAttribute('data-mjx-error') || 'TeX error' : '';
        selfContain(svg);
        svg.setAttribute('aria-label', tex);

        // metrics in em: the viewBox is in 1/1000 em; height and vertical-align are in ex
        // a tagged display equation is full width (width="100%", its box in data-mjx-viewBox)
        const full = svg.getAttribute('width') === '100%';
        const vb = String(svg.getAttribute('viewBox') || svg.getAttribute('data-mjx-viewBox') || '0 0 0 0').trim().split(/[\s,]+/).map(Number);
        const g0 = full ? /scale\(([\d.]+)/.exec((svg.firstElementChild && svg.firstElementChild.getAttribute('transform')) || '') : null;
        const hEm = (vb[3] || 0) / 1000;
        const hEx = parseFloat(svg.getAttribute('height')) || 0;
        const va = /vertical-align:\s*(-?[\d.]+)ex/.exec(svg.getAttribute('style') || '');
        const exPerEm = hEx && hEm ? hEx / hEm : 2;
        const mml = cleanMathml(await MJ.tex2mmlPromise(tex, { display: display }));
        // mhchem lays out with phantoms and zero-width boxes MathML Core does not have
        const native = /\\(ce|pu)\b/.test(tex) ? { mathml: null, reason: 'mhchem' } : toCore(mml);
        return {
            tex: tex,
            display: display,
            svg: new XMLSerializer().serializeToString(svg),   // XML, not HTML: no &nbsp; (\text{if }) — an image parses it as XML
            mathml: mml,
            mathmlCore: native.mathml,
            mathmlCoreIssue: native.reason,
            width: (vb[2] || 0) / 1000,
            height: hEm,
            depth: va ? Math.max(0, -parseFloat(va[1]) / exPerEm) : 0,
            exPerEm: exPerEm,
            full: full,                                   // tagged: fills the line, tag at the end
            fullEm: g0 ? 1000 * parseFloat(g0[1]) : 0,   // (full) user units per em inside it
            error: error
        };
    }

    /** One formula → record (cached). */
    function render(tex, display, o) {
        tex = String(tex == null ? '' : tex);
        display = !!display;
        const font = RTL_LETTER.test(tex) ? ((o && o.textFont) || options.textFont) : '';
        const key = (display ? 'D' : 'I') + font + '\u0000' + tex;
        if (cache.has(key)) return cache.get(key);
        const job = queue.then(function () { return renderNow(tex, display, font); });
        queue = job.catch(function () {});
        cache.set(key, job);
        job.catch(function () { cache.delete(key); });
        return job;
    }

    // =========================================================================
    // 4. image (Word, PDF)
    // =========================================================================

    const exCache = new Map();
    const FONT_MIME = { woff2: 'font/woff2', woff: 'font/woff', truetype: 'font/ttf', ttf: 'font/ttf', opentype: 'font/otf' };

    /** x-height / font size of a family (a formula on a page is sized in ex). */
    async function exRatio(family) {
        if (!family || typeof document === 'undefined' || !document.body) return 0.5;
        if (exCache.has(family)) return exCache.get(family);
        const fam = '"' + String(family).replace(/"/g, '') + '"';
        try { if (document.fonts && document.fonts.load) await document.fonts.load('100px ' + fam); } catch (e) { /* fallback font */ }
        const d = document.createElement('div');
        d.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;font-size:100px;line-height:0;height:10ex;font-family:' + fam + ',serif';
        document.body.appendChild(d);
        const r = d.getBoundingClientRect().height / 1000;
        d.remove();
        const v = r > 0.2 && r < 1 ? r : 0.5;
        exCache.set(family, v);
        return v;
    }

    function b64(text) {
        const bytes = new TextEncoder().encode(text);
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(bin);
    }

    /**
     * A formula as an image for a document: an SVG data URI sized for text of
     * fontSizePt in fontFamily — the size it has on a page, where MathJax
     * matches the x-height of the text around it.
     * The SVG is declared at imageScale × that size (ImageCore then rasterizes
     * it sharper); width/height/depth are the DISPLAY size in CSS px.
     * A tagged equation (\tag, numbered environments) fills maxWidth (px), its
     * number at the end, as on a page.
     * Right-to-left \text: its font is embedded in the SVG (an image cannot
     * use the page's fonts) when options.fonts / window.KelkWebFonts has it.
     * @returns {Promise<{ src: string, width: number, height: number, depth: number }>}
     */
    async function toImage(rec, o) {
        o = o || {};
        const family = o.fontFamily || options.textFont;
        const fontPx = (o.fontSizePt || 12) * 4 / 3;
        const k = (rec.exPerEm || 2.26) * await exRatio(family);
        const w = rec.width * k * fontPx, h = rec.height * k * fontPx, dp = rec.depth * k * fontPx;
        const scale = o.scale || options.imageScale || 1;
        const doc = new DOMParser().parseFromString(rec.svg, 'image/svg+xml');
        const svg = doc.documentElement;
        if (!svg || svg.localName !== 'svg' || doc.querySelector('parsererror')) throw new Error('MathCore: SVG does not parse — ' + rec.tex);
        let W = w;
        if (rec.full && rec.fullEm) {
            // full width (equation tag): the line's width; its inner units scaled to the text size
            W = Math.max(w, o.maxWidth || w);
            const f = k * fontPx / rec.fullEm;
            svg.setAttribute('viewBox', '0 0 ' + (W / f).toFixed(2) + ' ' + (h / f).toFixed(2));
            svg.removeAttribute('data-mjx-viewBox');
        }
        svg.setAttribute('width', (W * scale).toFixed(2));
        svg.setAttribute('height', (h * scale).toFixed(2));
        svg.removeAttribute('style');
        svg.setAttribute('color', o.color || '#000');            // currentColor
        if (svg.querySelector('text')) {
            const g = svg.querySelector('[style*="font-family"]');
            const fam = g ? (/font-family:\s*"?([^";]+)"?/.exec(g.getAttribute('style')) || [])[1] : '';
            const lib = options.fonts || global.KelkWebFonts || {};
            const key = fam && Object.keys(lib).find(function (x) { return x.toLowerCase() === fam.trim().toLowerCase(); });
            const faces = key ? lib[key] : null;
            if (faces && faces.length) {
                const st = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
                st.textContent = faces.map(function (f) {
                    const fmt = f.format || 'woff2';
                    return '@font-face{font-family:"' + fam.trim() + '";src:url(data:' + (FONT_MIME[fmt] || 'font/' + fmt) + ';base64,' + f.data +
                        ') format("' + fmt + '");font-weight:' + (f.weight || 'normal') + ';font-style:' + (f.style || 'normal') + '}';
                }).join('');
                svg.insertBefore(st, svg.firstChild);
            }
        }
        return {
            src: 'data:image/svg+xml;base64,' + b64(new XMLSerializer().serializeToString(svg)),
            width: W, height: h, depth: dp
        };
    }

    /**
     * Every placeholder under root → <img class="kelk-math-img"> (display
     * formulas in their own centered <p class="kelk-math-block">); a TeX error
     * → the TeX as text. For builders that place images (Word, PDF).
     * @returns {Promise<number>} formulas turned into images
     */
    async function toImages(root, o) {
        o = o || {};
        const els = placeholders(root);
        let n = 0;
        for (let i = 0; i < els.length; i++) {
            const el = els[i], doc = el.ownerDocument;
            const tex = el.getAttribute('data-tex');
            const display = el.getAttribute('data-display') === 'block';
            let rec = null;
            try { rec = await render(tex, display, { textFont: o.fontFamily }); } catch (e) { rec = null; }
            if (!rec || rec.error) {                        // the TeX as written, as code (an LTR isolate everywhere)
                const d = display ? '$$' : '$';
                const t = doc.createElement('code');
                t.className = 'kelk-math-error';
                t.textContent = d + tex + d;
                el.parentNode.replaceChild(t, el);
                continue;
            }
            let im = null;
            try { im = await toImage(rec, o); } catch (e) { im = null; }
            if (!im) {
                const d = display ? '$$' : '$';
                const t = doc.createElement('code');
                t.className = 'kelk-math-error';
                t.textContent = d + tex + d;
                el.parentNode.replaceChild(t, el);
                continue;
            }
            const img = doc.createElement('img');
            img.setAttribute('src', im.src);
            img.setAttribute('alt', tex);
            img.setAttribute('width', String(Math.max(1, Math.round(im.width))));
            img.setAttribute('height', String(Math.max(1, Math.round(im.height))));
            img.setAttribute('class', 'kelk-math-img');
            img.setAttribute('data-depth', im.depth.toFixed(2));         // px below the baseline
            img.setAttribute('data-display', display ? 'block' : 'inline');
            if (o.omml) {                                           // Word's own equation, for DocxBuilder
                const om = /\\(ce|pu)\b/.test(tex) ? { xml: null } : toOmml(rec.mathml, { display: display });
                if (om.xml) img.setAttribute('data-omml', om.xml);
            }
            if (el.tagName === 'DIV') {
                const p = doc.createElement('p');
                p.className = 'kelk-math-block';
                p.appendChild(img);
                el.parentNode.replaceChild(p, el);
            } else el.parentNode.replaceChild(img, el);
            n++;
        }
        return n;
    }

    // =========================================================================
    // 5. OMML (Word's own equations) from MathJax's MathML
    // =========================================================================
    //
    // toOmml(mathml, { display }) → { xml, reason }: an <m:oMath> (inline) or
    // <m:oMathPara> (display) — a real, editable Word equation. xml is null
    // (reason says why) when the formula uses what Word cannot show the same:
    // mhchem's private glyphs, maction, mglyph. Word draws it in Cambria Math.

    const M_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
    const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const NARY = /^[\u2211\u220F\u2210\u22C0-\u22C3\u2A00-\u2A06\u2A09\u222B-\u2233\u2A0C-\u2A11]$/;
    const OPEN = /^[([{\u27E8\u2329\u230A\u2308|\u2016\u27E6]$/, CLOSE = /^[)\]}\u27E9\u232A\u230B\u2309|\u2016\u27E7]$/;
    const ARROW = /^[\u2190-\u21FF\u27F5-\u27FF]$/;
    const ACCENT = {
        '^': '\u0302', '\u02C6': '\u0302', '\u0302': '\u0302', '~': '\u0303', '\u02DC': '\u0303', '\u0303': '\u0303',
        '\u00AF': '\u0304', '\u0304': '\u0304', '\u02D9': '\u0307', '\u0307': '\u0307', '\u00A8': '\u0308', '\u0308': '\u0308',
        '\u02DA': '\u030A', '\u030A': '\u030A', '\u02D8': '\u0306', '\u0306': '\u0306', '\u02C7': '\u030C', '\u030C': '\u030C',
        '\u00B4': '\u0301', '\u0301': '\u0301', '`': '\u0300', '\u0300': '\u0300',
        '\u2192': '\u20D7', '\u20D7': '\u20D7', '\u2190': '\u20D6', '\u20D6': '\u20D6', '\u2194': '\u20E1', '\u20E1': '\u20E1'
    };
    const BAR = /^[\u203E\u2015\u0305_\u0332]$/;
    const BRACE = /^[\u23DE\u23DF\u23DC\u23DD\u23B4\u23B5]$/;
    const SCR = { 'double-struck': 'double-struck', 'script': 'script', 'bold-script': 'script', 'fraktur': 'fraktur',
                  'bold-fraktur': 'fraktur', 'sans-serif': 'sans-serif', 'bold-sans-serif': 'sans-serif',
                  'sans-serif-italic': 'sans-serif', 'sans-serif-bold-italic': 'sans-serif', 'monospace': 'monospace' };
    const STY = { 'normal': 'p', 'bold': 'b', 'italic': 'i', 'bold-italic': 'bi', 'double-struck': 'p', 'script': 'p',
                  'bold-script': 'b', 'fraktur': 'p', 'bold-fraktur': 'b', 'sans-serif': 'p', 'bold-sans-serif': 'b',
                  'sans-serif-italic': 'i', 'sans-serif-bold-italic': 'bi', 'monospace': 'p' };

    function xesc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function mval(tag, v) { return '<m:' + tag + ' m:val="' + xesc(v) + '"/>'; }
    function wrap(tag, inner) { return '<m:' + tag + '>' + (inner || '') + '</m:' + tag + '>'; }

    function hexColor(c) {
        if (!c) return '';
        c = String(c).trim();
        let m = /^#([0-9a-f]{6})$/i.exec(c);
        if (m) return m[1].toUpperCase();
        m = /^#([0-9a-f]{3})$/i.exec(c);
        if (m) return m[1].replace(/./g, '$&$&').toUpperCase();
        if (typeof document === 'undefined') return '';
        const x = document.createElement('canvas').getContext('2d');
        x.fillStyle = '#000'; x.fillStyle = c;
        m = /^#([0-9a-f]{6})$/i.exec(x.fillStyle);
        return m ? m[1].toUpperCase() : '';
    }

    function ommlConverter(ctx0) {
        function run(text, node, ctx) {
            text = String(text).replace(/[\u2061-\u2064]/g, '');
            if (!text) return '';
            const tag = node ? node.localName : 'mo';
            const variant = (node && node.getAttribute('mathvariant')) || ctx.variant || '';
            let rpr;
            if (tag === 'mtext' || tag === 'ms') rpr = '<m:nor/>';
            else {
                const scr = SCR[variant] ? mval('scr', SCR[variant]) : '';
                let sty = STY[variant] || '';
                if (!sty) sty = tag === 'mi' && Array.from(text).length === 1 ? '' : 'p';   // one letter: italic (Word's default)
                rpr = scr + (sty ? mval('sty', sty) : '');
            }
            let wpr = '';
            if (ctx.color) wpr += '<w:color w:val="' + ctx.color + '"/>';
            if ((tag === 'mtext' || tag === 'ms') && RTL_LETTER.test(text)) wpr += '<w:rtl/>';
            // a space-only run gets a zero-width space: docx.js's XML import trims whitespace-only text away
            if (!/\S/.test(text)) text += '\u200B';
            return '<m:r>' + (rpr ? wrap('rPr', rpr) : '') + (wpr ? '<w:rPr>' + wpr + '</w:rPr>' : '') +
                '<m:t xml:space="preserve">' + xesc(text) + '</m:t></m:r>';
        }

        function style(node, ctx) {
            const c = Object.assign({}, ctx);
            const col = node.getAttribute && (node.getAttribute('mathcolor') || node.getAttribute('color'));
            if (col) c.color = hexColor(col) || c.color;
            const v = node.getAttribute && node.getAttribute('mathvariant');
            if (v && /^(mstyle|mrow)$/.test(node.localName)) c.variant = v;
            return c;
        }

        function opChar(node) {
            const n = core1(node);
            return n && n.localName === 'mo' ? n.textContent.trim() : '';
        }

        /** An n-ary operator (∑ ∫ ∏ …), bare or with limits? → { chr, loc, sub, sup } */
        function naryOf(node) {
            const t = node.localName;
            if (t === 'mo' && NARY.test(node.textContent.trim())) return { chr: node.textContent.trim(), loc: 'subSup' };
            if (!/^(munderover|munder|mover|msubsup|msub|msup)$/.test(t)) return null;
            const k = kids(node);
            const chr = opChar(k[0]);
            if (!NARY.test(chr)) return null;
            const under = /^(munder|munderover)$/.test(t), over = /^(mover|munderover)$/.test(t);
            const sub = /^(msub|msubsup)$/.test(t), sup = /^(msup|msubsup)$/.test(t);
            return {
                chr: chr, loc: (under || over) ? 'undOvr' : 'subSup',
                sub: (under || sub) ? k[1] : null,
                sup: over ? (t === 'munderover' ? k[2] : k[1]) : (sup ? (t === 'msubsup' ? k[2] : k[1]) : null)
            };
        }

        function nary(n, eXml, ctx) {
            let pr = mval('chr', n.chr) + mval('limLoc', n.loc);
            if (!n.sub) pr += mval('subHide', '1');
            if (!n.sup) pr += mval('supHide', '1');
            return '<m:nary>' + wrap('naryPr', pr) + wrap('sub', n.sub ? conv(n.sub, ctx) : '') +
                wrap('sup', n.sup ? conv(n.sup, ctx) : '') + wrap('e', eXml) + '</m:nary>';
        }

        /** A sequence of siblings: an n-ary operator takes the next element as its operand. */
        function seq(nodes, ctx) {
            let out = '';
            for (let i = 0; i < nodes.length; i++) {
                const n = naryOf(nodes[i]);
                if (n) {
                    let e = '';
                    const nx = nodes[i + 1];
                    if (nx && !(nx.localName === 'mo' && !naryOf(nx))) { e = conv(nx, ctx); i++; }
                    out += nary(n, e, ctx);
                } else out += conv(nodes[i], ctx);
            }
            return out;
        }

        function delim(beg, end, inner) {
            return '<m:d>' + wrap('dPr', mval('begChr', beg) + mval('endChr', end)) + wrap('e', inner) + '</m:d>';
        }

        function table(node, ctx) {
            const al = String(node.getAttribute('columnalign') || '').trim().split(/\s+/).filter(Boolean);
            const rows = kids(node).filter(function (r) { return /^(mtr|mlabeledtr)$/.test(r.localName); });
            let cols = 0;
            const labels = [];
            const body = rows.map(function (r) {
                let cells = kids(r).filter(function (c) { return c.localName === 'mtd'; });
                if (r.localName === 'mlabeledtr') { labels.push(cells[0]); cells = cells.slice(1); }
                cols = Math.max(cols, cells.length);
                return '<m:mr>' + cells.map(function (c) { return wrap('e', seq(kids(c), ctx)); }).join('') + '</m:mr>';
            });
            const jc = { left: 'left', right: 'right', center: 'center' };
            let mcs = '';
            for (let i = 0; i < cols; i++) {
                mcs += wrap('mc', wrap('mcPr', mval('count', '1') + mval('mcJc', jc[al[Math.min(i, al.length - 1)]] || 'center')));
            }
            // a pair "right left" (align, aligned): the matrix keeps its columns tight
            const tight = al.length > 1 && al.every(function (a, i) { return a === (i % 2 ? 'left' : 'right'); });
            const mpr = (tight ? mval('cGpRule', '3') + mval('cGp', '0') : '') + wrap('mcs', mcs);
            let out = '<m:m>' + wrap('mPr', mpr) + body.join('') + '</m:m>';
            labels.forEach(function (l) { out += run('\u2003', null, ctx) + seq(kids(l), ctx); });
            return out;
        }

        function scriptsOver(node, ctx) {
            const t = node.localName, k = kids(node);
            const base = k[0];
            const baseChr = opChar(base);
            const over = t === 'mover' ? k[1] : (t === 'munderover' ? k[2] : null);
            const under = t === 'munder' ? k[1] : (t === 'munderover' ? k[1] : null);
            // an arrow with a label (\xrightarrow): Word's grouping character stretches it
            if (ARROW.test(baseChr) && (over || under)) {
                const lab = over || under;
                let g = '<m:groupChr>' + wrap('groupChrPr', mval('chr', baseChr) + mval('pos', over ? 'bot' : 'top') + mval('vertJc', over ? 'bot' : 'top')) +
                    wrap('e', conv(lab, ctx)) + '</m:groupChr>';
                if (over && under) g = '<m:limLow>' + wrap('e', g) + wrap('lim', conv(under, ctx)) + '</m:limLow>';
                return g;
            }
            const oc = over ? opChar(over) : '', uc = under ? opChar(under) : '';
            if (t === 'mover' && BRACE.test(oc)) return '<m:groupChr>' + wrap('groupChrPr', mval('chr', oc) + mval('pos', 'top') + mval('vertJc', 'bot')) + wrap('e', conv(base, ctx)) + '</m:groupChr>';
            if (t === 'munder' && BRACE.test(uc)) return '<m:groupChr>' + wrap('groupChrPr', mval('chr', uc)) + wrap('e', conv(base, ctx)) + '</m:groupChr>';
            if (t === 'mover' && BAR.test(oc)) return '<m:bar>' + wrap('barPr', mval('pos', 'top')) + wrap('e', conv(base, ctx)) + '</m:bar>';
            if (t === 'munder' && BAR.test(uc)) return '<m:bar>' + wrap('barPr', mval('pos', 'bot')) + wrap('e', conv(base, ctx)) + '</m:bar>';
            if (t === 'mover' && ACCENT[oc]) return '<m:acc>' + wrap('accPr', mval('chr', ACCENT[oc])) + wrap('e', conv(base, ctx)) + '</m:acc>';
            let out = conv(base, ctx);
            if (under) out = '<m:limLow>' + wrap('e', out) + wrap('lim', conv(under, ctx)) + '</m:limLow>';
            if (over) out = '<m:limUpp>' + wrap('e', out) + wrap('lim', conv(over, ctx)) + '</m:limUpp>';
            return out;
        }

        function enclose(node, ctx) {
            const n = String(node.getAttribute('notation') || 'longdiv').split(/\s+/);
            const inner = wrap('e', seq(kids(node), ctx));
            const strike = { updiagonalstrike: 'strikeBLTR', updiagonalarrow: 'strikeBLTR', downdiagonalstrike: 'strikeTLBR', horizontalstrike: 'strikeH', verticalstrike: 'strikeV' };
            const boxed = n.some(function (x) { return /box|roundedbox|circle/.test(x); });
            let pr = '';
            if (!boxed) pr += mval('hideTop', '1') + mval('hideBot', '1') + mval('hideLeft', '1') + mval('hideRight', '1');
            n.forEach(function (x) { if (strike[x]) pr += mval(strike[x], '1'); });
            return '<m:borderBox>' + (pr ? wrap('borderBoxPr', pr) : '') + inner + '</m:borderBox>';
        }

        function conv(node, ctx) {
            if (!node || node.nodeType !== 1) return '';
            const t = node.localName;
            const c = style(node, ctx);
            switch (t) {
                case 'math': case 'mstyle': case 'mpadded': case 'merror':
                    return seq(kids(node), c);
                case 'semantics': return conv(kids(node)[0], c);
                case 'annotation': case 'annotation-xml': case 'none': case 'mprescripts': return '';
                case 'mrow': {
                    const k = kids(node);
                    if (k.length >= 2 && k[0].localName === 'mo' && OPEN.test(k[0].textContent.trim())) {
                        const last = k[k.length - 1];
                        const closes = last.localName === 'mo' && (CLOSE.test(last.textContent.trim()) || !last.textContent.trim());
                        const stretch = k[0].getAttribute('stretchy') !== 'false' && (k.length === 2 || closes);
                        if (stretch && (closes || kids(k[k.length - 1]).length || k[k.length - 1].localName === 'mtable')) {
                            return delim(k[0].textContent.trim(), closes ? last.textContent.trim() : '', seq(closes ? k.slice(1, -1) : k.slice(1), c));
                        }
                    }
                    if (k.length === 1 && k[0].localName === 'mo' && k[0].hasAttribute('minsize')) return run(k[0].textContent, k[0], c);   // \big( …
                    return seq(k, c);
                }
                case 'mi': case 'mn': case 'mo': case 'mtext': case 'ms':
                    return run(node.textContent, node, c);
                case 'mspace': {
                    const named = { veryverythinmathspace: 0.056, verythinmathspace: 0.111, thinmathspace: 0.167, mediummathspace: 0.222,
                                    thickmathspace: 0.278, verythickmathspace: 0.333, veryverythickmathspace: 0.389 };
                    const wa = String(node.getAttribute('width') || '0').trim();
                    const w = named[wa] != null ? named[wa] : parseFloat(wa) * (/ex$/.test(wa) ? 0.44 : 1);
                    if (!(w > 0.05)) return '';
                    return run(w >= 0.9 ? '\u2003' : w >= 0.4 ? '\u2002' : w >= 0.25 ? '\u2005' : '\u2009', null, c);
                }
                case 'mphantom':
                    return '<m:phant>' + wrap('phantPr', mval('show', '0')) + wrap('e', seq(kids(node), c)) + '</m:phant>';
                case 'mfrac': {
                    const k = kids(node);
                    const lt = node.getAttribute('linethickness');
                    const pr = lt != null && parseFloat(lt) === 0 ? wrap('fPr', mval('type', 'noBar')) : '';
                    return '<m:f>' + pr + wrap('num', conv(k[0], c)) + wrap('den', conv(k[1], c)) + '</m:f>';
                }
                case 'msqrt':
                    return '<m:rad>' + wrap('radPr', mval('degHide', '1')) + '<m:deg/>' + wrap('e', seq(kids(node), c)) + '</m:rad>';
                case 'mroot': {
                    const k = kids(node);
                    return '<m:rad>' + wrap('deg', conv(k[1], c)) + wrap('e', conv(k[0], c)) + '</m:rad>';
                }
                case 'msub': case 'msup': case 'msubsup': {
                    const n = naryOf(node);
                    if (n) return nary(n, '', c);
                    const k = kids(node);
                    if (t === 'msub') return '<m:sSub>' + wrap('e', conv(k[0], c)) + wrap('sub', conv(k[1], c)) + '</m:sSub>';
                    if (t === 'msup') return '<m:sSup>' + wrap('e', conv(k[0], c)) + wrap('sup', conv(k[1], c)) + '</m:sSup>';
                    return '<m:sSubSup>' + wrap('e', conv(k[0], c)) + wrap('sub', conv(k[1], c)) + wrap('sup', conv(k[2], c)) + '</m:sSubSup>';
                }
                case 'munder': case 'mover': case 'munderover': {
                    const n = naryOf(node);
                    if (n) return nary(n, '', c);
                    return scriptsOver(node, c);
                }
                case 'mmultiscripts': {
                    const k = kids(node);
                    const pi = k.findIndex(function (x) { return x.localName === 'mprescripts'; });
                    const post = (pi < 0 ? k.slice(1) : k.slice(1, pi)), pre = pi < 0 ? [] : k.slice(pi + 1);
                    let out = conv(k[0], c);
                    if (post.length >= 2) out = '<m:sSubSup>' + wrap('e', out) + wrap('sub', conv(post[0], c)) + wrap('sup', conv(post[1], c)) + '</m:sSubSup>';
                    if (pre.length >= 2) out = '<m:sPre>' + wrap('sub', conv(pre[0], c)) + wrap('sup', conv(pre[1], c)) + wrap('e', out) + '</m:sPre>';
                    return out;
                }
                case 'mtable': return table(node, c);
                case 'mtr': case 'mlabeledtr': case 'mtd': return seq(kids(node), c);
                case 'menclose': return enclose(node, c);
                default: return seq(kids(node), c);
            }
        }

        return function (math) { return seq(kids(math), ctx0); };
    }

    /**
     * MathML (MathJax's, rec.mathml) → OMML.
     * @returns {{ xml: string|null, reason: string }}
     */
    function toOmml(mml, o) {
        o = o || {};
        if (typeof DOMParser === 'undefined') return { xml: null, reason: 'no DOM' };
        const doc = new DOMParser().parseFromString(String(mml || ''), 'application/xml');
        const math = doc.documentElement;
        if (!math || math.localName !== 'math' || doc.querySelector('parsererror')) return { xml: null, reason: 'parse error' };
        if (PUA_RE.test(math.textContent)) return { xml: null, reason: 'private-use glyph (mhchem arrow)' };
        if (math.querySelector('maction, mglyph')) return { xml: null, reason: 'maction / mglyph' };
        const body = ommlConverter({})(math);
        const ns = ' xmlns:m="' + M_NS + '" xmlns:w="' + W_NS + '"';
        const display = o.display != null ? o.display : math.getAttribute('display') === 'block';
        const xml = display
            ? '<m:oMathPara' + ns + '>' + wrap('oMathParaPr', mval('jc', 'center')) + '<m:oMath>' + body + '</m:oMath></m:oMathPara>'
            : '<m:oMath' + ns + '>' + body + '</m:oMath>';
        return { xml: xml, reason: '' };
    }

    /**
     * OMML (toOmml's XML) in the form Word writes inside HTML (.doc / MHTML):
     * the same m: elements, but each run's text sits in <m:r> itself, wrapped
     * in a Cambria Math span — italic letters in <i> — as Word's own "Save as
     * Web Page" writes it. The caller puts it in <!--[if gte msEquation 12]>.
     */
    function ommlToWordHtml(xml) {
        const doc = new DOMParser().parseFromString(String(xml || ''), 'application/xml');
        if (!doc.documentElement || doc.querySelector('parsererror')) return '';
        const hesc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
        const attrs = function (el) {
            let a = '';
            for (let i = 0; i < el.attributes.length; i++) {
                const at = el.attributes[i];
                if (/^xmlns/.test(at.name)) continue;
                a += ' ' + at.name + '="' + hesc(at.value).replace(/"/g, '&quot;') + '"';
            }
            return a;
        };
        const plain = function (el) {           // an m: element as it is (no text runs inside rPr etc.)
            let s = '<' + el.tagName + attrs(el);
            if (!el.childNodes.length) return s + '/>';
            s += '>';
            for (let c = el.firstChild; c; c = c.nextSibling) s += c.nodeType === 1 ? write(c) : '';
            return s + '</' + el.tagName + '>';
        };
        function write(el) {
            if (el.localName !== 'r' || el.prefix !== 'm') return plain(el);
            let rpr = '', text = '', color = '', rtl = false, nor = false, italic = true;
            for (let c = el.firstElementChild; c; c = c.nextElementSibling) {
                if (c.prefix === 'm' && c.localName === 'rPr') {
                    rpr = plain(c);
                    if (c.getElementsByTagName('m:nor').length) nor = true;
                    const sty = c.getElementsByTagName('m:sty')[0];
                    if (sty && !/^(i|bi)$/.test(sty.getAttribute('m:val'))) italic = false;
                    if (nor) italic = false;
                } else if (c.prefix === 'w' && c.localName === 'rPr') {
                    const col = c.getElementsByTagName('w:color')[0];
                    if (col) color = col.getAttribute('w:val');
                    if (c.getElementsByTagName('w:rtl').length) rtl = true;
                } else if (c.localName === 't') text += c.textContent;
            }
            const style = (nor ? '' : 'font-family:"Cambria Math",serif') + (color ? (nor ? '' : ';') + 'color:#' + color : '');
            let s = '<span dir=' + (rtl ? 'RTL' : 'LTR') + (style ? " style='" + style + "'" : '') + '><m:r>' + rpr + hesc(text) + '</m:r></span>';
            if (italic) s = "<i style='mso-bidi-font-style:normal'>" + s + '</i>';
            return s;
        }
        return write(doc.documentElement);
    }

    // =========================================================================
    // 6. OMML → LaTeX (Word equations back to TeX — MarkdownImporter)
    // =========================================================================
    //
    // ommlToTex(el) takes an <m:oMath> / <m:oMathPara> element (any DOM) and
    // returns { tex, display }. The inverse of toOmml, and it also reads what
    // Word itself writes (eqArr, func, box, sPre …). Pure DOM, no MathJax.

    const TEX_SYM = {
        '\u03B1': 'alpha', '\u03B2': 'beta', '\u03B3': 'gamma', '\u03B4': 'delta', '\u03B5': 'epsilon', '\u03F5': 'epsilon',
        '\u03B6': 'zeta', '\u03B7': 'eta', '\u03B8': 'theta', '\u03D1': 'vartheta', '\u03B9': 'iota', '\u03BA': 'kappa',
        '\u03BB': 'lambda', '\u03BC': 'mu', '\u03BD': 'nu', '\u03BE': 'xi', '\u03C0': 'pi', '\u03D6': 'varpi', '\u03C1': 'rho',
        '\u03F1': 'varrho', '\u03C3': 'sigma', '\u03C2': 'varsigma', '\u03C4': 'tau', '\u03C5': 'upsilon', '\u03C6': 'phi',
        '\u03D5': 'phi', '\u03C7': 'chi', '\u03C8': 'psi', '\u03C9': 'omega',
        '\u0393': 'Gamma', '\u0394': 'Delta', '\u0398': 'Theta', '\u039B': 'Lambda', '\u039E': 'Xi', '\u03A0': 'Pi',
        '\u03A3': 'Sigma', '\u03A5': 'Upsilon', '\u03A6': 'Phi', '\u03A8': 'Psi', '\u03A9': 'Omega',
        '\u2264': 'le', '\u2265': 'ge', '\u2260': 'ne', '\u2248': 'approx', '\u2261': 'equiv', '\u223C': 'sim', '\u2243': 'simeq',
        '\u221D': 'propto', '\u00D7': 'times', '\u00B7': 'cdot', '\u22C5': 'cdot', '\u00F7': 'div', '\u00B1': 'pm', '\u2213': 'mp',
        '\u2218': 'circ', '\u2219': 'bullet', '\u2297': 'otimes', '\u2295': 'oplus',
        '\u2192': 'to', '\u2190': 'leftarrow', '\u2194': 'leftrightarrow', '\u21D2': 'Rightarrow', '\u21D0': 'Leftarrow',
        '\u21D4': 'Leftrightarrow', '\u27F6': 'longrightarrow', '\u27F5': 'longleftarrow', '\u27F9': 'Longrightarrow',
        '\u27FA': 'Longleftrightarrow', '\u21A6': 'mapsto', '\u21AA': 'hookrightarrow', '\u2191': 'uparrow', '\u2193': 'downarrow',
        '\u21CC': 'rightleftharpoons',
        '\u221E': 'infty', '\u2202': 'partial', '\u2207': 'nabla', '\u2208': 'in', '\u2209': 'notin', '\u220B': 'ni',
        '\u2282': 'subset', '\u2283': 'supset', '\u2286': 'subseteq', '\u2287': 'supseteq', '\u222A': 'cup', '\u2229': 'cap',
        '\u2205': 'emptyset', '\u2200': 'forall', '\u2203': 'exists', '\u00AC': 'neg', '\u2227': 'wedge', '\u2228': 'vee',
        '\u22EF': 'cdots', '\u2026': 'ldots', '\u22EE': 'vdots', '\u22F1': 'ddots', '\u22A4': 'top', '\u22A5': 'perp',
        '\u2225': 'parallel', '\u2220': 'angle', '\u210F': 'hbar', '\u2113': 'ell', '\u211C': 'Re', '\u2111': 'Im',
        '\u2032': "'", '\u2033': "''", '\u00B0': '^\\circ', '\u2223': 'mid', '\u2217': '*', '\u2016': '\\|', '\u27FC': 'longmapsto'
    };
    const TEX_FUNC = /^(sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh|log|ln|lg|exp|lim|liminf|limsup|max|min|sup|inf|det|dim|ker|deg|gcd|arg|Pr|mod|hom)$/;
    const TEX_NARY = { '\u2211': 'sum', '\u220F': 'prod', '\u2210': 'coprod', '\u222B': 'int', '\u222C': 'iint', '\u222D': 'iiint',
        '\u222E': 'oint', '\u22C3': 'bigcup', '\u22C2': 'bigcap', '\u22C1': 'bigvee', '\u22C0': 'bigwedge', '\u2A01': 'bigoplus', '\u2A02': 'bigotimes' };
    const TEX_ACC = { '\u0302': ['hat', 'widehat'], '\u0303': ['tilde', 'widetilde'], '\u0304': ['bar', 'overline'], '\u0305': ['bar', 'overline'],
        '\u0307': ['dot', 'dot'], '\u0308': ['ddot', 'ddot'], '\u20D7': ['vec', 'overrightarrow'], '\u20D6': ['overleftarrow', 'overleftarrow'],
        '\u20E1': ['overleftrightarrow', 'overleftrightarrow'], '\u030C': ['check', 'check'], '\u0306': ['breve', 'breve'],
        '\u0301': ['acute', 'acute'], '\u0300': ['grave', 'grave'], '\u030A': ['mathring', 'mathring'] };
    const TEX_FENCE = { '{': '\\{', '}': '\\}', '\u27E8': '\\langle', '\u27E9': '\\rangle', '\u2329': '\\langle', '\u232A': '\\rangle',
        '\u230A': '\\lfloor', '\u230B': '\\rfloor', '\u2308': '\\lceil', '\u2309': '\\rceil', '\u2016': '\\|', '': '.' };
    const TEX_SCR = { 'double-struck': 'mathbb', 'script': 'mathcal', 'fraktur': 'mathfrak', 'sans-serif': 'mathsf', 'monospace': 'mathtt' };

    function ommlToTex(root) {
        const child = function (el, name) {
            for (let c = el && el.firstElementChild; c; c = c.nextElementSibling) if (c.localName === name) return c;
            return null;
        };
        const val = function (el, name, def) {           // <m:name m:val="…"/> ('' is a value: endChr="")
            const pr = child(el, name);
            if (!pr) return def;
            const v = pr.getAttribute('m:val');
            return v == null ? def : v;
        };
        const flag = function (pr, name) {
            const e = child(pr, name);
            if (!e) return false;
            const v = e.getAttribute('m:val');
            return v == null || v === '1' || v === 'on' || v === 'true';
        };
        const grp = function (s) {
            s = s.trim();
            return Array.from(s).length === 1 || /^\\[a-zA-Z]+$/.test(s) ? s : '{' + s + '}';
        };
        const join = function (parts) {
            let out = '';
            parts.forEach(function (p) {
                if (!p) return;
                if (/\\[a-zA-Z]+$/.test(out) && /^[a-zA-Z0-9]/.test(p)) out += ' ';
                out += p;
            });
            return out;
        };
        const esc = function (ch, inArr) {
            if (TEX_SYM[ch]) { const v = TEX_SYM[ch]; return /^[a-zA-Z]+$/.test(v) ? '\\' + v : v; }
            if (/[#$%_{}]/.test(ch)) return '\\' + ch;
            if (ch === '&') return inArr ? '&' : '\\&';
            if (ch === '\\') return '\\backslash ';
            if (ch === '~') return '\\sim ';
            if (ch === '^') return '\\wedge ';
            if (ch === '\u2212') return '-';
            if (ch === '\u2003' || ch === '\u2001') return '\\quad ';
            if (ch === '\u2002' || ch === '\u2000') return '\\;';
            if (ch === '\u2005' || ch === '\u2004') return '\\:';
            if (ch === '\u2009' || ch === '\u200A' || ch === '\u2006') return '\\,';
            if (ch === '\u00A0') return '~';
            // math-alphabet letters (𝑥, 𝐯 …) back to plain ones
            const c = ch.codePointAt(0);
            if (c >= 0x1D400 && c <= 0x1D6A3) { const k = (c - 0x1D400) % 52; return String.fromCharCode(k < 26 ? 65 + k : 71 + k); }
            return ch;
        };

        function run(r, ctx) {
            let text = '';
            for (let c = r.firstElementChild; c; c = c.nextElementSibling) if (c.localName === 't') text += c.textContent;
            if (!r.firstElementChild || !child(r, 't')) text = text || r.textContent;     // Word's HTML form: text in <m:r>
            text = text.replace(/[\u200B\uFEFF]/g, '');
            if (!text) return '';
            const pr = child(r, 'rPr');
            if (pr && child(pr, 'nor')) return /^\s+$/.test(text) ? '\\ ' : '\\text{' + text.replace(/([{}\\#$%&_])/g, '\\$1') + '}';
            const sty = pr ? val(pr, 'sty', '') : '';
            const scr = pr ? val(pr, 'scr', '') : '';
            let body = Array.from(text).map(function (ch) { return esc(ch, ctx.arr); }).join('');
            if (TEX_SCR[scr]) return '\\' + TEX_SCR[scr] + '{' + body + '}';
            if (sty === 'b') return '\\mathbf{' + body + '}';
            if (sty === 'bi') return '\\boldsymbol{' + body + '}';
            if (sty === 'p' && /^[a-zA-Z]{2,}$/.test(text)) return text === 'mod' ? '\\bmod' : TEX_FUNC.test(text) ? '\\' + text : '\\mathrm{' + text + '}';
            if (sty === 'p' && /^[a-zA-Z]$/.test(text)) return '\\mathrm{' + text + '}';
            return body;
        }

        function seq(el, ctx) {
            const parts = [];
            for (let c = el && el.firstElementChild; c; c = c.nextElementSibling) parts.push(conv(c, ctx));
            return join(parts);
        }
        const part = function (el, name, ctx) { return seq(child(el, name), ctx); };

        function nameOf(el) {                       // the plain name inside fName / limLow e (lim, max …)
            const t = el ? el.textContent.trim() : '';
            return TEX_FUNC.test(t) ? t : '';
        }

        function conv(el, ctx) {
            if (!el || el.nodeType !== 1) return '';
            const n = el.localName;
            if (/Pr$/.test(n) && n !== 'rPr') return '';
            switch (n) {
                case 'r': return run(el, ctx);
                case 'oMath': case 'e': case 'num': case 'den': case 'sub': case 'sup': case 'deg': case 'lim': case 'fName':
                    return seq(el, ctx);
                case 'f': {
                    const pr = child(el, 'fPr'), type = pr ? val(pr, 'type', 'bar') : 'bar';
                    const a = part(el, 'num', ctx), b = part(el, 'den', ctx);
                    if (type === 'noBar') return '\\genfrac{}{}{0pt}{}{' + a + '}{' + b + '}';
                    if (type === 'lin' || type === 'skw') return grp(a) + '/' + grp(b);
                    return '\\frac{' + a + '}{' + b + '}';
                }
                case 'rad': {
                    const pr = child(el, 'radPr'), d = part(el, 'deg', ctx);
                    return (pr && flag(pr, 'degHide')) || !d ? '\\sqrt{' + part(el, 'e', ctx) + '}' : '\\sqrt[' + d + ']{' + part(el, 'e', ctx) + '}';
                }
                case 'sSub': return grp(part(el, 'e', ctx)) + '_{' + part(el, 'sub', ctx) + '}';
                case 'sSup': {
                    const sup = part(el, 'sup', ctx);
                    if (/^'+$/.test(sup)) return part(el, 'e', ctx) + sup;          // f′ → f'
                    return grp(part(el, 'e', ctx)) + '^{' + sup + '}';
                }
                case 'sSubSup': return grp(part(el, 'e', ctx)) + '_{' + part(el, 'sub', ctx) + '}^{' + part(el, 'sup', ctx) + '}';
                case 'sPre': return '{}_{' + part(el, 'sub', ctx) + '}^{' + part(el, 'sup', ctx) + '}' + grp(part(el, 'e', ctx));
                case 'nary': {
                    const pr = child(el, 'naryPr');
                    const chr = pr && child(pr, 'chr') ? val(pr, 'chr', '\u222B') : '\u222B';
                    const op = TEX_NARY[chr] ? '\\' + TEX_NARY[chr] : chr;
                    const loc = pr ? val(pr, 'limLoc', '') : '';
                    let s = op + (loc === 'undOvr' && /int/.test(op) ? '\\limits' : '');
                    if (!(pr && flag(pr, 'subHide'))) { const x = part(el, 'sub', ctx); if (x) s += '_{' + x + '}'; }
                    if (!(pr && flag(pr, 'supHide'))) { const x = part(el, 'sup', ctx); if (x) s += '^{' + x + '}'; }
                    return join([s, part(el, 'e', ctx)]);
                }
                case 'd': {
                    const pr = child(el, 'dPr');
                    const beg = pr && child(pr, 'begChr') ? val(pr, 'begChr', '(') : '(';
                    const end = pr && child(pr, 'endChr') ? val(pr, 'endChr', ')') : ')';
                    const sep = pr && child(pr, 'sepChr') ? val(pr, 'sepChr', '|') : '|';
                    const es = [];
                    for (let c = el.firstElementChild; c; c = c.nextElementSibling) if (c.localName === 'e') es.push(c);
                    // a matrix in brackets, cases in a brace
                    if (es.length === 1) {
                        const only = es[0].firstElementChild && !es[0].firstElementChild.nextElementSibling ? es[0].firstElementChild : null;
                        const env = { '()': 'pmatrix', '[]': 'bmatrix', '{}': 'Bmatrix', '||': 'vmatrix', '\u2016\u2016': 'Vmatrix' }[beg + end];
                        if (only && only.localName === 'm' && env) return matrix(only, ctx, env);
                        if (only && only.localName === 'f' && beg + end === '()') {                 // \binom
                            const fp = child(only, 'fPr');
                            if (fp && val(fp, 'type', '') === 'noBar') return '\\binom{' + part(only, 'num', ctx) + '}{' + part(only, 'den', ctx) + '}';
                        }
                        if (only && (only.localName === 'm' || only.localName === 'eqArr') && beg === '{' && !end) return matrix(only, ctx, 'cases');
                    }
                    const f = function (c) { return TEX_FENCE[c] != null ? TEX_FENCE[c] : c; };
                    return '\\left' + f(beg) + ' ' + es.map(function (e) { return seq(e, ctx); }).join(' \\middle' + f(sep) + ' ') + ' \\right' + f(end);
                }
                case 'm': return matrix(el, ctx, 'matrix');
                case 'eqArr': return matrix(el, ctx, 'aligned');
                case 'acc': {
                    const pr = child(el, 'accPr');
                    const chr = pr && child(pr, 'chr') ? val(pr, 'chr', '\u0302') : '\u0302';
                    const base = part(el, 'e', ctx);
                    const a = TEX_ACC[chr] || ['hat', 'widehat'];
                    return '\\' + (Array.from(base).length > 1 && !/^\\[a-zA-Z]+$/.test(base) ? a[1] : a[0]) + '{' + base + '}';
                }
                case 'bar': {
                    const pr = child(el, 'barPr');
                    return (pr && val(pr, 'pos', 'bot') === 'top' ? '\\overline{' : '\\underline{') + part(el, 'e', ctx) + '}';
                }
                case 'groupChr': {
                    const pr = child(el, 'groupChrPr');
                    const chr = pr && child(pr, 'chr') ? val(pr, 'chr', '\u23DF') : '\u23DF';
                    const pos = pr ? val(pr, 'pos', 'bot') : 'bot';
                    const e = part(el, 'e', ctx);
                    if (ARROW.test(chr)) {
                        const cmd = /[\u2190\u27F5\u21D0]/.test(chr) ? 'xleftarrow' : 'xrightarrow';
                        return pos === 'top' ? '\\' + cmd + '[' + e + ']{}' : '\\' + cmd + '{' + e + '}';
                    }
                    return (/[\u23DE\u23DC\u23B4]/.test(chr) ? '\\overbrace{' : '\\underbrace{') + e + '}';
                }
                case 'limLow': case 'limUpp': {
                    const eEl = child(el, 'e'), limT = part(el, 'lim', ctx), base = seq(eEl, ctx);
                    const low = n === 'limLow';
                    if (nameOf(eEl)) return '\\' + nameOf(eEl) + (low ? '_{' : '^{') + limT + '}';
                    if (/^\\(under|over)brace\{/.test(base) || /^\\x(right|left)arrow/.test(base)) {
                        if (/^\\x/.test(base) && low) return base.replace(/^\\(x\w+)\{/, '\\$1[' + limT + ']{');
                        return base + (low ? '_{' : '^{') + limT + '}';
                    }
                    return (low ? '\\underset{' : '\\overset{') + limT + '}{' + base + '}';
                }
                case 'func': {
                    const fn = child(el, 'fName'), name = seq(fn, ctx);
                    return join([name, grp(part(el, 'e', ctx))]).replace(/^(\\[a-zA-Z]+)\{/, '$1 {');
                }
                case 'borderBox': {
                    const pr = child(el, 'borderBoxPr'), e = part(el, 'e', ctx);
                    if (pr && flag(pr, 'strikeBLTR') && flag(pr, 'strikeTLBR')) return '\\xcancel{' + e + '}';
                    if (pr && flag(pr, 'strikeBLTR')) return '\\cancel{' + e + '}';
                    if (pr && flag(pr, 'strikeTLBR')) return '\\bcancel{' + e + '}';
                    if (pr && flag(pr, 'strikeH')) return '\\sout{' + e + '}';
                    return '\\boxed{' + e + '}';
                }
                case 'box': return part(el, 'e', ctx);
                case 'phant': return '\\phantom{' + part(el, 'e', ctx) + '}';
                default:
                    // Word's HTML form wraps runs in <i>/<span>; and unknown elements: their content
                    return seq(el, ctx);
            }
        }

        function matrix(el, ctx, env) {
            const rows = [];
            const c2 = Object.assign({}, ctx, { arr: true });
            if (el.localName === 'eqArr') {
                for (let e = el.firstElementChild; e; e = e.nextElementSibling) if (e.localName === 'e') rows.push(seq(e, c2));
                if (env === 'aligned' && !rows.some(function (r) { return /&/.test(r); })) env = 'gathered';
            } else {
                // columns "right left …" (align, aligned): back to aligned
                const pr = child(el, 'mPr'), mcs = pr && child(pr, 'mcs'), jcs = [];
                for (let mc = mcs && mcs.firstElementChild; mc; mc = mc.nextElementSibling) {
                    const mp = child(mc, 'mcPr');
                    const cnt = parseInt(mp ? val(mp, 'count', '1') : '1', 10) || 1, jc = mp ? val(mp, 'mcJc', 'center') : 'center';
                    for (let i = 0; i < cnt; i++) jcs.push(jc);
                }
                if (env === 'matrix' && jcs.length > 1 && jcs.every(function (j, i) { return j === (i % 2 ? 'left' : 'right'); })) env = 'aligned';
                for (let r = el.firstElementChild; r; r = r.nextElementSibling) {
                    if (r.localName !== 'mr') continue;
                    const cells = [];
                    for (let e = r.firstElementChild; e; e = e.nextElementSibling) if (e.localName === 'e') cells.push(seq(e, c2));
                    rows.push(cells.join(' & '));
                }
            }
            return '\\begin{' + env + '} ' + rows.join(' \\\\ ') + ' \\end{' + env + '}';
        }

        const display = root.localName === 'oMathPara';
        let tex;
        if (display) {
            const maths = [];
            for (let c = root.firstElementChild; c; c = c.nextElementSibling) if (c.localName === 'oMath') maths.push(conv(c, {}));
            tex = maths.join(' \\\\ ');
        } else tex = conv(root, {});
        tex = tex.replace(/\s+/g, ' ').trim()
            // an equation number: "\quad (1)" → \tag{1}; a one-cell matrix around the equation → the equation
            .replace(/(?:\\quad ?)?\\text\{\(\}\\text\{([^{}]+)\}\\text\{\)\}$|(?:\\quad ?)?\\text\{\(([^{}]+)\)\}$/, function (m, a, b) { return '\\tag{' + (a || b) + '}'; })
            .replace(/^\\begin\{matrix\} ((?:(?!\\\\|&|\\begin\{matrix\}).)*) \\end\{matrix\}(\\tag\{[^}]*\})?$/, '$1$2');
        return { tex: tex, display: display };
    }

    /** Raw TeX in place of each placeholder (no engine: a text fallback). */
    function fallbackText(root) {
        placeholders(root).forEach(function (el) {
            const d = el.getAttribute('data-display') === 'block' ? '$$' : '$';
            el.textContent = d + el.getAttribute('data-tex') + d;
        });
    }

    /**
     * Fill every placeholder under root. mode 'svg' (default) or 'mathml'.
     * @returns {Promise<{ count: number, errors: number }>}
     */
    async function typeset(root, o) {
        o = o || {};
        const els = placeholders(root);
        let count = 0, errors = 0;
        for (let i = 0; i < els.length; i++) {
            const el = els[i];
            const tex = el.getAttribute('data-tex');
            const display = el.getAttribute('data-display') === 'block';
            let rec;
            try {
                rec = await render(tex, display, o);
            } catch (e) {
                const d = display ? '$$' : '$';
                el.textContent = d + tex + d;
                el.classList.add('kelk-math-error');
                el.title = e.message;
                errors++;
                continue;
            }
            if (rec.error) {                          // the TeX as written, in red; the message on hover
                const d = display ? '$$' : '$';
                el.textContent = d + tex + d;
                el.classList.add('kelk-math-error');
                el.title = rec.error;
                errors++;
                continue;
            }
            const useMml = o.mode === 'mathml' && rec.mathmlCore;
            el.innerHTML = useMml ? rec.mathmlCore : rec.svg;
            if (o.mode === 'mathml' && !useMml) el.setAttribute('data-math-svg', rec.mathmlCoreIssue);   // drawn as SVG instead
            else el.removeAttribute('data-math-svg');
            el.classList.remove('kelk-math-error');
            el.removeAttribute('title');
            el.setAttribute('data-width', rec.width.toFixed(2));        // em — table column widths (BidiCore)
            count++;
        }
        return { count: count, errors: errors };
    }

    /** CSS for placeholders on a page. options.textFont: right-to-left \text in MathML mode. */
    function css(o) {
        const font = (o && o.textFont) || options.textFont;
        return [
            '.kelk-math{unicode-bidi:isolate;direction:ltr}',
            '.kelk-math > svg{overflow:visible}',
            'div.kelk-math,span.kelk-math[data-display="block"]{display:block;text-align:center;margin:.4em 0;padding:.3em 2px;overflow-x:auto;overflow-y:hidden;max-width:100%}',
            // a display formula wider than its column shrinks to fit (as in Word and the PDF), not clipped
            'div.kelk-math > svg,span.kelk-math[data-display="block"] > svg{max-width:100%;height:auto}',
            '.kelk-math math{font-size:1.1em}',
            '.kelk-math mtext.kelk-rtl{font-family:"' + String(font).replace(/"/g, '') + '",serif}',
            '.kelk-math-error{color:#c5221f;font-family:ui-monospace,Consolas,monospace;font-size:.9em;cursor:help}'
        ].join('\n');
    }

    const MathCore = {
        version: VERSION,
        configure: configure,
        options: function () { return Object.assign({}, options); },
        markedExtension: markedExtension,
        hasMath: hasMath,
        placeholders: placeholders,
        load: load,
        render: render,
        typeset: typeset,
        toImage: toImage,
        toImages: toImages,
        toOmml: toOmml,
        ommlToWordHtml: ommlToWordHtml,
        ommlToTex: ommlToTex,
        fallbackText: fallbackText,
        css: css,
        rtlFirst: rtlFirst
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = MathCore;
    else if (typeof define === 'function' && define.amd) define([], function () { return MathCore; });
    else global.MathCore = MathCore;
})(typeof window !== 'undefined' ? window : this);
