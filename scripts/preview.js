/**
 * Kelk.preview — Markdown → sanitized HTML in the preview pane:
 * marked (GFM) → DOMPurify → images → directions (lib/BidiView: the same
 * block rules as the exports, isolates for counter-direction runs) →
 * highlight.js → code frames (language + copy, nested-fence frames).
 * html() hands the builders the preview WITHOUT the BidiView classes; the
 * code frames they strip themselves.
 */
(function (K) {
    'use strict';

    let box, clean = '';

    // DOMPurify's own URI rules: http(s), mailto, tel, relative names; data: for images
    const PURIFY = { ADD_ATTR: ['target', 'dir', 'align'] };

    K.preview = {
        init: function () {
            box = K.$('#preview');
            if (typeof marked !== 'undefined') marked.setOptions({ gfm: true, breaks: false });
            if (typeof BidiView !== 'undefined') {           // the classes' CSS, once
                const st = document.createElement('style');
                st.id = 'bidiview-css';
                st.textContent = BidiView.css();
                document.head.appendChild(st);
            }
            this.render();
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
                    // a block without a language is coloured by a guess, but the guess is
                    // not a label: drop the language-* class hljs adds, so neither the
                    // language bar nor the exports show "vbnet" for a box-drawing table
                    const declared = /(?:^|\s)language-\S/.test(code.className);
                    try { hljs.highlightElement(code); } catch (e) { /* unknown language */ }
                    if (!declared) code.className = code.className.replace(/(?:^|\s)language-\S+/g, '').trim();
                });
            }
            clean = box.innerHTML;                       // for the builders: before any page decoration

            // directions: the export rules (BidiCore via BidiView) — blocks, isolates; code stays LTR.
            // BEFORE the code frames: their label and copy button are page chrome, not text
            // (framed first, "bash" in a list item was taken for a Latin run of the item).
            if (typeof BidiView !== 'undefined') {
                const r = BidiView.apply(box, { dir: K.store.get('direction') });
                box.setAttribute('dir', r.dir);          // the container only (read by names, HTML export)
            } else {
                box.setAttribute('dir', typeof BidiCore !== 'undefined' ? BidiCore.detectDirection(box) : 'rtl');
            }
            this.frameCodeBlocks();
            K.ui.icons(box);
            K.names.refresh();
        },

        /** Language bar + copy button around each <pre>; frames for fences written inside. */
        frameCodeBlocks: function () {
            K.$$('pre', box).forEach(function (pre) {
                if (pre.parentNode.classList.contains('code-block-wrapper')) return;
                const lang = typeof BidiCore !== 'undefined' ? BidiCore.codeLanguage(pre) : '';
                const wrap = document.createElement('div');
                wrap.className = 'code-block-wrapper';
                const head = document.createElement('div');
                head.className = 'code-block-header';
                const label = document.createElement('span');
                label.className = 'code-lang';
                label.textContent = lang || 'code';
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'code-copy-btn';
                btn.setAttribute('aria-label', K.i18n.t('copy'));
                btn.innerHTML = '<i data-lucide="copy"></i> <span>' + K.i18n.t('copy') + '</span>';
                head.appendChild(label);
                head.appendChild(btn);
                pre.parentNode.insertBefore(wrap, pre);
                wrap.appendChild(head);
                wrap.appendChild(pre);
                const code = pre.querySelector('code') || pre;
                const raw = code.textContent;
                btn.addEventListener('click', function () { K.preview.copy(raw, btn); });
                K.preview.frameNested(code);
            });
        },

        /**
         * Frame fenced blocks written inside a code block (the text stays
         * raw; textContent is unchanged, so exports read the same text).
         */
        frameNested: function (code) {
            if (typeof BidiCore === 'undefined' || code.querySelector('.code-nested')) return;
            const text = code.textContent;
            const trailing = /\n$/.test(text) ? '\n' : '';
            const lines = text.replace(/\n$/, '').split('\n');
            const segs = BidiCore.codeSegments(lines.join('\n'));
            if (!segs.some(function (s) { return s.nested; })) return;
            function build(items, parent) {
                items.forEach(function (s, i) {
                    if (s.lines) parent.appendChild(BidiCore.codeFragment(code, s.lines[0], s.lines[1]));
                    else {
                        const frame = document.createElement('span');
                        frame.className = 'code-nested';
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.className = 'code-copy-btn code-nested-copy';
                        btn.setAttribute('aria-label', K.i18n.t('copy') + (s.lang ? ' (' + s.lang + ')' : ''));
                        btn.innerHTML = '<i data-lucide="copy"></i>';
                        const inner = lines.slice(s.from + 1, s.to).join('\n');
                        btn.addEventListener('click', function (e) { e.stopPropagation(); K.preview.copy(inner, btn); });
                        frame.appendChild(btn);
                        build(s.items, frame);
                        parent.appendChild(frame);
                    }
                    if (i < items.length - 1) parent.appendChild(document.createTextNode('\n'));
                });
            }
            const frag = document.createDocumentFragment();
            build(segs, frag);
            if (trailing) frag.appendChild(document.createTextNode(trailing));
            code.textContent = '';
            code.appendChild(frag);
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
