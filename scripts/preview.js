/**
 * Kelk.preview — Markdown → sanitized HTML in the preview pane:
 * marked (GFM + MathCore formulas) → DOMPurify → images → highlight.js →
 * lib/PreviewBuilder (HtmlBuilder's logic and stylesheet: table of contents,
 * directions, table widths, code frames with copy buttons, formulas).
 * This file keeps only the pane: rendering on input, copying, the stylesheet
 * slot; the dark theme and pane spacing are styles/preview.css.
 * html() hands the builders the preview WITHOUT the BidiView classes and with
 * the formulas still as placeholders (data-tex); the code frames they strip
 * themselves.
 */
(function (K) {
    'use strict';

    let box, clean = '', mathRun = 0;

    // DOMPurify's own URI rules: http(s), mailto, tel, relative names; data: for images
    const PURIFY = { ADD_ATTR: ['target', 'dir', 'align'] };

    // ── the app's dark theme: the document's own colors, translated for the preview only ──────
    // The exports keep the chosen colors; in the dark preview a light fill becomes a dark fill of
    // the same hue, a line a lighter one, a text color a light one — so tables, code and quotes
    // read like the rest of the dark page and their text turns light by itself (BuilderBase.isDarkColor).

    function hexToHsl(hex) {
        const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || '').trim());
        if (!m) return null;
        const r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
        let h = 0, s = 0;
        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
            h /= 6;
        }
        return { h: h, s: s, l: l };
    }
    function hslToHex(c) {
        const f = function (n) {
            const k = (n + c.h * 12) % 12, a = c.s * Math.min(c.l, 1 - c.l);
            const v = c.l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
            return ('0' + Math.round(v * 255).toString(16)).slice(-2);
        };
        return '#' + f(0) + f(8) + f(4);
    }
    const NAMED = { black: '#000000', white: '#ffffff', darkgreen: '#006400', gray: '#808080', grey: '#808080', windowtext: '#000000' };
    const asHex = function (c) { c = String(c || '').trim().toLowerCase(); return NAMED[c] || c; };
    /** A fill: a light one turns into a dark fill of its hue, just above the page (#1e2124). */
    function darkFill(c) {
        const x = hexToHsl(asHex(c));
        if (!x || x.l < 0.5) return c;                           // already dark: as chosen
        return hslToHex({ h: x.h, s: Math.min(x.s, 0.32), l: 0.14 + (1 - x.l) * 0.9 });
    }
    /** A line: colored lines keep their hue at mid lightness, gray and black ones a quiet gray. */
    function darkLine(c) {
        const x = hexToHsl(asHex(c));
        if (!x) return c;
        return x.s >= 0.2 ? hslToHex({ h: x.h, s: Math.min(x.s, 0.55), l: 0.55 }) : hslToHex({ h: x.h, s: x.s, l: 0.34 });
    }
    /** A text color: a dark one turns light, keeping a little of its hue. */
    function darkText(c) {
        const x = hexToHsl(asHex(c));
        if (!x || x.l >= 0.6) return c;
        return hslToHex({ h: x.h, s: Math.min(x.s, 0.3), l: Math.min(0.88, Math.max(0.72, 1 - x.l)) });
    }
    /** "0.75pt solid #d4d0c8" → the same border with darkLine's color. */
    function darkBorder(b) {
        return String(b || '').replace(/(#[0-9a-f]{3,6}\b|\b(?:black|darkgreen|gray|grey|windowtext)\b)/i, function (c) { return darkLine(c); });
    }
    /** Translate a preview builder's document colors for the dark theme. */
    function darkPaper(pb) {
        const T = pb.getTemplateOptions();
        const bar = darkFill(T.codeHeaderBg || '#EDEDED');
        pb.setTemplateOptions({
            codeBlockBg: darkFill(T.codeBlockBg || '#FFFDF7'),
            codeHeaderBg: bar,
            codeHeaderColor: BuilderBase.isDarkColor(bar) ? '#c9c5bd' : (T.codeHeaderColor || '#595959'),
            codeBlockBorder: darkBorder(T.codeBlockBorder || '1px solid darkgreen'),
            quoteBg: T.quoteBg ? darkFill(T.quoteBg) : T.quoteBg,
            quoteBorderColor: darkLine(T.quoteBorderColor || '#C07030'),
            quoteTextColor: darkText(T.quoteTextColor || '#4A4A4A'),
            tableHeaderBg: darkFill(T.tableHeaderBg || '#D9E2F3'),
            tocHeadingColor: darkText(T.tocHeadingColor || '#2F5496'),
            linkColor: darkText(T.linkColor || '#0563C1')
        });
        const st = pb._config.tableStyle;
        if (st) pb.setTableStyle(Object.assign({}, st, {
            headerColor: st.headerColor ? darkFill(st.headerColor) : null,
            stripeColor: st.stripeColor ? darkFill(st.stripeColor) : darkFill(BuilderBase.TABLE_STYLE_DEFAULTS.stripeColor),
            borderColor: darkLine(st.borderColor || BuilderBase.TABLE_STYLE_DEFAULTS.borderColor)
        }));
    }

    K.preview = {
        init: function () {
            box = K.$('#preview');
            if (typeof marked !== 'undefined') marked.setOptions({ gfm: true, breaks: false });
            if (typeof marked !== 'undefined' && typeof MathCore !== 'undefined') {
                MathCore.configure(K.config.math || {});
                marked.use(MathCore.markedExtension());
                const mst = document.createElement('style');
                mst.id = 'mathcore-css';
                mst.textContent = MathCore.css();
                document.head.appendChild(mst);
            }
            if (typeof BidiView !== 'undefined') {           // the classes' CSS, once
                const st = document.createElement('style');
                st.id = 'bidiview-css';
                st.textContent = BidiView.css();
                document.head.appendChild(st);
            }
            this.render();
            // web fonts that arrive after the first drawing change text widths (tables are fitted
            // to them): draw again once they are in
            if (document.fonts && document.fonts.addEventListener) {
                let ft = 0;
                const again = function () { clearTimeout(ft); ft = setTimeout(function () { K.preview.render(); }, 120); };
                document.fonts.addEventListener('loadingdone', again);
                if (document.fonts.ready) document.fonts.ready.then(again);
            }
            // table widths and sides are fitted to the pane's width: when it changes (window,
            // Settings opened or closed, maximize, layout), draw again after a short pause
            if (typeof ResizeObserver !== 'undefined') {
                let lastW = box.clientWidth, timer = 0;
                const self = this;
                new ResizeObserver(function () {
                    const w = box.clientWidth;
                    if (Math.abs(w - lastW) < 2) return;
                    lastW = w;
                    clearTimeout(timer);
                    timer = setTimeout(function () { self.render(); }, 150);
                }).observe(box);
            }
        },

        /**
         * The rendered, sanitized HTML for the builders: highlighted, taken
         * BEFORE BidiView and the code frames decorate it, so they decide
         * directions and frame code on exactly the Markdown's HTML.
         */
        html: function () { return box ? clean : ''; },

        /** Document direction the preview decided ('rtl' | 'ltr'). */
        dir: function () { return (box && box.getAttribute('dir')) || 'rtl'; },

        render: function () {
            if (!box) return;
            const md = K.editor.value();
            if (!md.trim()) { box.innerHTML = ''; clean = ''; K.names.refresh(); return; }
            let html = marked.parse(md);
            if (typeof DOMPurify !== 'undefined') html = DOMPurify.sanitize(html, PURIFY);
            box.innerHTML = html;
            K.images.resolve(box);                       // ![x](name) → registered image

            K.$$('a[href^="http"]', box).forEach(function (a) { a.target = '_blank'; a.rel = 'noopener'; });

            // highlight.js: fenced blocks with a language (and plain ones, auto)
            if (typeof hljs !== 'undefined') {
                K.$$('pre code', box).forEach(function (code) {
                    // a block without a language is colored by a guess, but the guess is
                    // not a label: drop the language-* class hljs adds, so neither the
                    // language bar nor the exports show "vbnet" for a box-drawing table
                    const declared = /(?:^|\s)language-\S/.test(code.className);
                    try { hljs.highlightElement(code); } catch (e) { /* unknown language */ }
                    if (!declared) code.className = code.className.replace(/(?:^|\s)language-\S+/g, '').trim();
                });
            }
            clean = box.innerHTML;                       // for the builders: before any page decoration

            // the rest is PreviewBuilder (lib): HtmlBuilder's logic and stylesheet, in the pane
            const pb = this.builder();
            if (pb) {
                const cs = getComputedStyle(box);
                const r = pb.decorate(box, {
                    width: box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
                    fontSize: parseFloat(cs.fontSize) || 16,
                    onCopy: function (text, btn) { K.preview.copy(text, btn); }
                });
                box.setAttribute('dir', r.dir);          // the container only (read by names, HTML export)
                this.style(pb, r.dir);
            } else if (typeof BidiView !== 'undefined') {
                box.setAttribute('dir', BidiView.apply(box, { dir: K.store.get('direction') }).dir);
            }
            K.ui.icons(box);
            K.names.refresh();
            this.typesetMath(pb);
        },

        /** A PreviewBuilder configured like the HTML export (null without lib/PreviewBuilder.js). */
        builder: function () {
            if (typeof PreviewBuilder === 'undefined' || !K.exporter || !K.exporter._configure) return null;
            try {
                const pb = K.exporter._configure(PreviewBuilder.create(), 'html');
                pb._config.previewLabels = { copy: K.i18n.t('copy') };
                // "Preview with the Word fonts": the document's stylesheet takes them (where installed)
                const f = K.settings && K.settings.previewFonts ? K.settings.previewFonts() : null;
                if (f && f.word) pb.configure({ fonts: { bidi: f.bidi, latin: f.latin, code: f.code } });
                if (document.documentElement.getAttribute('data-theme') === 'dark') darkPaper(pb);
                return pb;
            } catch (e) { return null; }
        },

        /** The document stylesheet (HtmlBuilder's), refreshed when it changes. */
        style: function (pb, dir) {
            let st = document.getElementById('kelk-doc-css');
            if (!st) {
                st = document.createElement('style');
                st.id = 'kelk-doc-css';
                // before the page's own preview rules: they add the pane (padding, dark theme, buttons)
                const pageCss = document.querySelector('link[href*="styles/preview.css"]');
                document.head.insertBefore(st, pageCss || null);
            }
            const css = pb.css(dir);
            if (st.textContent !== css) st.textContent = css;
        },

        /**
         * Formulas → SVG or MathML (as the .html export), after the page is drawn
         * (MathJax is async; it loads with the first formula). A newer render
         * makes an older one stop.
         */
        typesetMath: function (pb) {
            if (typeof MathCore === 'undefined' || !MathCore.hasMath(box)) return;
            const run = ++mathRun;
            const s = K.store.settings();
            const job = pb ? pb.typeset(box) : MathCore.typeset(box, { mode: 'svg', textFont: s.fonts && s.fonts.bidi });
            job.catch(function (e) {
                if (run !== mathRun) return;
                MathCore.fallbackText(box);
                K.ui.toast(K.i18n.t('mathFailed', e.message), 'error');
            });
        },

        copy: function (text, btn) {
            const done = function () {
                if (!btn) return;
                btn.classList.add('copied');
                setTimeout(function () { btn.classList.remove('copied'); }, 1400);
                K.ui.toast(K.i18n.t('copied'));
            };
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {});
        },

        /** Rich copy of the whole preview (HTML + plain text) for pasting into Word/mail. */
        copyAll: async function () {
            try {
                if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
                    const clone = box.cloneNode(true);
                    if (typeof BidiCore !== 'undefined') BidiCore.unwrapCodeBlocks(clone);
                    if (typeof BidiView !== 'undefined') BidiView.toAttributes(clone);   // Word reads dir, not classes
                    await navigator.clipboard.write([new ClipboardItem({
                        'text/html': new Blob(['<div dir="' + K.preview.dir() + '">' + clone.innerHTML + '</div>'], { type: 'text/html' }),
                        'text/plain': new Blob([box.innerText], { type: 'text/plain' })
                    })]);
                    K.ui.toast(K.i18n.t('copied'));
                }
            } catch (e) {
                K.ui.toast(K.i18n.t('failed', e.message), 'error');
            }
        }
    };
})(window.Kelk = window.Kelk || {});
