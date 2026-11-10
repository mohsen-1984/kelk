/**
 * Kelk.names — values derived from the text when the user left them empty:
 *   title()    Settings title, else the first H1, else the first words (as Word does)
 *   edition()  Settings edition, else Draft / پیش‌نویس by the header/footer direction
 *   stem()     output file name: typed in the name box, else the imported file's
 *              name, else the title chain, else "document"
 * and the name box in the preview footer (stem editable, extension read-only).
 */
(function (K) {
    'use strict';

    let source = '';        // stem of the imported file
    let user = null;        // stem typed in the name box (null → automatic)
    let lastExt = 'docx';

    const FENCE = /(^|\n) {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(\n {0,3}\2[`~]*[ \t]*(?=\n|$)|$)/g;

    function inline(s) {
        return String(s || '')
            .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
            .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
            .replace(/<[^>]+>/g, '')
            .replace(/[*_~`|\\]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function body(md) { return String(md || '').replace(/\r\n?/g, '\n').replace(FENCE, '\n'); }

    /** Small function words a shortened title should not end on. */
    const STOP = /^(از|به|در|با|که|و|را|تا|بر|یا|هم|نیز|برای|این|آن|یک|of|to|in|on|at|by|for|and|or|the|a|an|with|from|as|is|are)$/i;

    function sanitize(name) {
        return String(name || '').replace(/[\u0000-\u001f\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 80);
    }

    K.names = {
        /** First level-1 heading (ATX or setext), outside code. */
        heading: function (md) {
            const t = body(md);
            const m = /^ {0,3}#[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/m.exec(t) || /^(?! {0,3}[-*+>#|])(\S.*)\n {0,3}=+[ \t]*$/m.exec(t);
            return m ? inline(m[1]) : '';
        },

        /**
         * The opening words, cut at the first sentence mark and at about 40
         * characters. A cut never ends on a small function word ("از", "به",
         * "of", "to" …); with `ellipsis` a cut text ends in "…".
         */
        firstWords: function (md, ellipsis) {
            const lines = body(md).split('\n');
            for (let i = 0; i < lines.length; i++) {
                let l = lines[i].trim();
                if (!l || /^(\|?\s*:?-{2,}|[-*_=]{3,}\s*$|<\/?[a-z][^>]*>\s*$|!\[)/i.test(l)) continue;
                l = l.replace(/^#{1,6}\s+/, '').replace(/^(>\s*)+/, '').replace(/^([-*+]|\d+[.)])\s+/, '').replace(/^\[[ xX]\]\s+/, '');
                l = inline(l);
                if (!/[\p{L}\p{N}]/u.test(l)) continue;
                l = l.split(/[.!?؟:؛;]\s/)[0];
                let cut = false;
                if (l.length > 40) {
                    const at = l.lastIndexOf(' ', 40);
                    l = l.slice(0, at > 15 ? at : 40);
                    cut = true;
                }
                l = l.replace(/[\s،,.:؛;\-–—]+$/, '');
                if (cut) {
                    let words = l.split(' ');
                    while (words.length > 2 && STOP.test(words[words.length - 1])) words.pop();
                    l = words.join(' ').replace(/[\s،,.:؛;\-–—]+$/, '') + (ellipsis ? '…' : '');
                }
                return l;
            }
            return '';
        },

        /** Title from the text: the first H1, else the opening words (… when shortened). */
        autoTitle: function (ellipsis) {
            const md = K.editor ? K.editor.value() : '';
            return this.heading(md) || this.firstWords(md, ellipsis !== false);
        },

        /** Settings title: null → automatic; '' → deliberately none. */
        title: function () {
            const t = K.store.get('document.title');
            return t == null ? this.autoTitle(true) : String(t).trim();
        },

        /** Direction of the header/footer ('auto' → the document's). */
        hfDir: function () {
            const d = K.store.get('headerFooter.direction');
            if (d === 'rtl' || d === 'ltr') return d;
            const p = K.$('#preview');
            return (p && p.getAttribute('dir')) || 'rtl';
        },

        defaultEdition: function () {
            if (this.hfDir() === 'ltr') return K.config.draft.ltr;
            return K.i18n.lang === 'ar' ? K.config.draft.ar : K.config.draft.rtl;
        },

        /** Page/of/contents words for an RTL export (Persian, or Arabic in the Arabic interface). */
        rtlWords: function () { return K.config.rtlWords[K.i18n.lang === 'ar' ? 'ar' : 'fa']; },

        edition: function () {
            const e = K.store.get('document.edition');
            return e == null ? this.defaultEdition() : e;
        },

        /** The automatic stem; '' without any text (the box then shows its placeholder). */
        autoStem: function () {
            const t = K.store.get('document.title');
            return sanitize(source) || (t != null ? sanitize(t) : '') || sanitize(this.autoTitle(false));
        },

        stem: function () { return sanitize(user) || this.autoStem() || K.i18n.t('untitled'); },

        /** A file was imported: its name becomes the default stem. */
        /**
         * A NEW document replaced the text (import, sample, clear): everything the
         * name box and the title took from the old one goes — the imported
         * file's name, a typed stem, a typed title (back to automatic) — and the
         * page remembers whether the new text is an about/sample document, and of
         * which language (so a language switch can swap it for the right one).
         * @param {string} [fileName]   imported file: its name becomes the default stem
         * @param {string} [sampleLang] the about/sample document's language
         */
        newDocument: function (fileName, sampleLang) {
            source = String(fileName || '').replace(/\.[^.]+$/, '');
            K.store.setUi('sourceName', fileName ? String(fileName) : null);        // the exports keep the imported file's name after a reload
            user = null;
            if (K.store.get('document.title') != null) K.store.set('document.title', null);
            K.store.setUi('sampleLang', sampleLang || null);
            K.store.setUi('deckOverrides', null);              // Settings picked over the old deck's own values: not for this one
            this.refresh();
        },

        /**
         * The text on screen is a known file (a sample restored after a reload, an older session's text):
         * its name names the exports, as when it was loaded — without resetting a typed name or title.
         */
        adopt: function (fileName) {
            if (!fileName || source) return;
            source = String(fileName).replace(/\.[^.]+$/, '');
            K.store.setUi('sourceName', String(fileName));
            this.refresh();
        },

        /**
         * Another tab saved (Kelk's storage listener): the imported file's name as it stored it; a text
         * replaced from there also drops a stem typed here for the old one.
         */
        followStored: function (replaced) {
            source = String(K.store.getUi('sourceName') || '').replace(/\.[^.]+$/, '');
            if (replaced) user = null;
            this.refresh();
        },

        /** Kept for callers: an imported file. */
        setSource: function (fileName) { this.newDocument(fileName, null); },

        /** Kept for callers: cleared text. */
        reset: function () { this.newDocument('', null); },

        setExt: function (ext) {
            const el = K.$('#nb-ext');
            // the extension follows the page direction, so the dot sits next to the
            // name: "name.docx" in LTR, "docx.نام" read right to left in RTL
            const x = ext || lastExt;
            if (el) el.textContent = '.' + (x === 'csv' ? 'zip' : x);        // the CSV files come in a zip
        },

        init: function () {
            const self = this;
            const stem = K.$('#nb-stem');
            source = String(K.store.getUi('sourceName') || '').replace(/\.[^.]+$/, '');
            // a click on a name copies it (the first click: the box takes the focus; the next ones place the caret)
            const copy = function (text) {
                if (!text || !navigator.clipboard || !navigator.clipboard.writeText) return;
                navigator.clipboard.writeText(text).then(function () { K.ui.toast(K.i18n.t('nameCopied', text)); }, function () {});
            };
            stem.addEventListener('mousedown', function () { stem._wasFocused = document.activeElement === stem; });
            stem.addEventListener('click', function () { if (!stem._wasFocused) copy((stem.value || stem.placeholder) + (K.$('#nb-ext') ? K.$('#nb-ext').textContent : '')); });
            const fname = K.$('#st-file-name');
            if (fname) { fname.style.cursor = 'copy'; fname.addEventListener('click', function () { copy(fname.textContent); }); }
            stem.addEventListener('input', function () { user = stem.value.trim() ? stem.value : null; });
            stem.addEventListener('blur', function () { if (user == null) self.refresh(); });
            stem.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    // the last format used, or the view's own when the view hides it (PPTX for slides, XLSX for Excel, DOCX
                    // for the document)
                    let ext = lastExt, b = K.$('[data-export="' + ext + '"]');
                    if (!b || b.hidden) { ext = { slides: 'pptx', excel: 'xlsx' }[K.slides.view()] || 'docx'; b = K.$('[data-export="' + ext + '"]'); }
                    K.exporter.run(ext, b);
                }
                if (e.key === 'Escape') { user = null; self.refresh(); stem.blur(); }
            });
            // the extension follows the export button under the pointer / focus
            K.$$('[data-export]').forEach(function (b) {
                const ext = b.getAttribute('data-export');
                ['mouseenter', 'focus'].forEach(function (ev) { b.addEventListener(ev, function () { self.setExt(ext); }); });
                ['mouseleave', 'blur'].forEach(function (ev) { b.addEventListener(ev, function () { self.setExt(); }); });
                b.addEventListener('click', function () { lastExt = ext; });
            });
            this.setExt();
        },

        /** After a render or a settings change: automatic values in the fields. */
        refresh: function () {
            const stem = K.$('#nb-stem');
            if (stem) stem.placeholder = K.i18n.t('untitled');
            if (stem && user == null && document.activeElement !== stem) stem.value = this.autoStem();
            if (K.settings && K.settings.fillDefaults) K.settings.fillDefaults();
        }
    };
})(window.Kelk = window.Kelk || {});
