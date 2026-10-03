/**
 * PreviewBuilder - the live preview, drawn the way HtmlBuilder draws a page
 * ============================================================================
 * Version: 1.5
 *
 * The preview and the .html export share one logic and one stylesheet: the
 * same directions (BidiView), code frames, table widths and sides, formulas
 * and document styles. PreviewBuilder is HtmlBuilder with three differences,
 * all about being inside an app page rather than a file:
 *
 *   - it decorates an element in place (decorate), synchronously, so typing
 *     stays fluid; formulas follow asynchronously (typeset);
 *   - its stylesheet (css) is only the document's rules (.doc …): no embedded
 *     fonts (the page has them), no page box, header/footer or print rules;
 *   - code frames get a copy button (and nested frames a small one); images
 *     are left as the page resolved them (no data-URI embedding).
 *
 * Usage (Kelk: scripts/preview.js):
 *
 *   const pb = configure(PreviewBuilder.create());           // the export settings
 *   style.textContent = pb.css(dir);
 *   const r = pb.decorate(article, { width: px, fontSize: px, onCopy: fn });
 *   await pb.typeset(article);                                // formulas, then table widths again
 *
 * The HTML handed to the builders is taken BEFORE decorate: the preview's
 * decorations never reach an export.
 *
 * Load order: … HtmlBuilder, PreviewBuilder.
 */
(function (global) {
    'use strict';

    const HtmlBuilder = global.HtmlBuilder;
    const BidiCore = global.BidiCore;
    if (!HtmlBuilder) throw new Error('PreviewBuilder needs HtmlBuilder (load it first)');

    class PreviewBuilder extends HtmlBuilder {
        static create(config = {}) {
            return new PreviewBuilder(config);
        }

        /** The document's stylesheet for the app page (dir: the preview's direction). */
        css(dir) {
            const T = this.getTemplateOptions();
            return this._css(T, dir || 'rtl', [], { math: true }, 0, true);
        }

        /**
         * Decorate root (already holding the sanitized, highlighted HTML) in
         * place: table of contents, code frames, start-aligned long lines,
         * table widths and sides, directions, table styles.
         * @param {HTMLElement} root
         * @param {{ width: number, fontSize: number, onCopy?: Function }} o - the pane's text column (px)
         * @returns {{ dir: 'rtl'|'ltr' }}
         */
        decorate(root, o) {
            o = o || {};
            const cfg = this._config;
            this._onCopy = o.onCopy || null;
            this._pane = { width: o.width || 800, fontSize: o.fontSize || 16 };
            if (cfg.toc) {
                const tdir = cfg.direction === 'rtl' || cfg.direction === 'ltr' ? cfg.direction : BidiCore.detectDirection(root);
                BidiCore.insertToc(root, { levels: cfg.toc.levels, title: cfg.toc.title, dir: tdir });
                root.querySelectorAll('.kelk-toc-entry').forEach(function (e) {
                    const a = root.ownerDocument.createElement('a');
                    a.href = '#' + e.getAttribute('data-target');
                    while (e.firstChild) a.appendChild(e.firstChild);
                    e.appendChild(a);
                    e.classList.add('toc-' + e.getAttribute('data-level'));
                });
            }
            root.querySelectorAll('p, li').forEach(function (el) {
                if (!el.closest('td, th, pre') && BidiCore.noJustify(el.textContent)) el.classList.add('kelk-start');
            });
            this._fitTables(root, { width: this._pane.width, fontSize: this._pane.fontSize, unit: 'px' });
            // directions BEFORE the code frames: their bar and button are page chrome, not text
            let dir;
            if (typeof BidiView !== 'undefined' && BidiView) dir = BidiView.apply(root, { dir: cfg.direction, endPunctuation: cfg.endPunctuation }).dir;
            else dir = cfg.direction === 'rtl' || cfg.direction === 'ltr' ? cfg.direction : BidiCore.detectDirection(root);
            this._paintTables(root, dir);
            this._frameCode(root);
            return { dir: dir };
        }

        /** Formulas as the .html export draws them — SVG or MathML (MathJax, async) — then the table widths once more. */
        async typeset(root) {
            if (typeof MathCore === 'undefined' || !MathCore.hasMath(root)) return { count: 0, errors: 0 };
            const T = this.getTemplateOptions();
            const r = await MathCore.typeset(root, { mode: (this._config.math || {}).mode || 'svg', textFont: (this._config.math || {}).textFont || T.bidiFont });
            if (root.querySelector('table .kelk-math') && this._pane) this._fitTables(root, { width: this._pane.width, fontSize: this._pane.fontSize, unit: 'px' });
            return r;
        }

        /** The page resolved the images already. */
        _embedImages() {}

        /** HtmlBuilder's frames, with a copy button in the bar (and on nested frames). */
        _frameCode(root) {
            super._frameCode(root);
            const self = this, doc = root.ownerDocument;
            const button = function (cls, label) {
                const b = doc.createElement('button');
                b.type = 'button';
                b.className = 'code-copy-btn' + (cls ? ' ' + cls : '');
                b.setAttribute('aria-label', label || 'copy');
                b.innerHTML = '<i data-lucide="copy"></i>' + (cls ? '' : ' <span>' + (label || 'copy') + '</span>');
                return b;
            };
            const label = (this._config.previewLabels || {}).copy || 'copy';
            root.querySelectorAll('.code').forEach(function (box) {
                if (box.querySelector(':scope > .code-lang > .code-copy-btn')) return;
                const pre = box.querySelector(':scope > pre');
                if (!pre) return;
                let bar = box.querySelector(':scope > .code-lang');
                if (!bar) {                                      // no label: a bar for the button all the same
                    bar = doc.createElement('div');
                    bar.className = 'code-lang';
                    box.insertBefore(bar, pre);
                }
                const code = pre.querySelector('code') || pre;
                const raw = code.textContent;
                const b = button('', label);
                b.addEventListener('click', function () { if (self._onCopy) self._onCopy(raw, b); });
                bar.appendChild(b);
                code.querySelectorAll('.code-nested').forEach(function (frame) {
                    const lines = frame.textContent.split('\n');
                    const inner = lines.slice(1, -1).join('\n');          // without its opening and closing fence
                    const nb = button('code-nested-copy', label);
                    nb.addEventListener('click', function (e) { e.stopPropagation(); if (self._onCopy) self._onCopy(inner, nb); });
                    frame.insertBefore(nb, frame.firstChild);
                });
            });
        }
    }

    if (typeof module !== 'undefined' && module.exports) module.exports = { PreviewBuilder };
    else global.PreviewBuilder = PreviewBuilder;
})(typeof window !== 'undefined' ? window : this);
