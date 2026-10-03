/**
 * Kelk — startup: language, theme, layout, modules, buttons and keyboard shortcuts.
 */
(function (K) {
    'use strict';

    function on(sel, ev, fn) { const el = K.$(sel); if (el) el.addEventListener(ev, fn); }

    /** Load the about/guide/sample document of the interface language (a script, so file:// works). */
    async function loadSample(ask) {
        if (ask && K.editor.value().trim() && !confirm(K.i18n.t('confirmSample'))) return;
        try {
            await K.ui.loadScript(K.config.sample);
            // the document of the interface language (about Kelk + guide + samples)
            const all = window.KelkSamples || {};
            const lang = all[K.i18n.lang] ? K.i18n.lang : (all.en ? 'en' : 'fa');
            const doc = all[lang];
            K.names.newDocument('', lang);          // remembered: this text IS the sample of `lang`
            K.editor.set(doc.markdown, doc.name);
            K.editor.markConverted(false);
            K.$('.preview-scroll').scrollTop = 0;
            K.$('#editor').scrollTop = 0;
        } catch (e) {
            K.ui.toast(K.i18n.t('failed', e.message), 'error');
        }
    }

    /**
     * First visit: the language from the browser's locale. Any Persian entry
     * in the user's language list (fa, fa-IR, fa-AF, prs) → Persian; an English
     * browser with an Iranian or Afghan time zone (common: an English UI on a
     * Persian speaker's system) → Persian too; otherwise English.
     */
    function firstLanguage() {
        const langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''])
            .map(function (l) { return String(l).toLowerCase(); });
        if (langs.some(function (l) { return /^(fa|prs)\b/.test(l); })) return 'fa';
        if (langs.some(function (l) { return /^ar\b/.test(l); })) return 'ar';
        let tz = '';
        try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* none */ }
        if (/^Asia\/(Tehran|Kabul)$/.test(tz)) return 'fa';
        return langs[0] ? 'en' : 'fa';
    }

    function start() {
        const u = K.store.ui();
        const lang = u.lang || firstLanguage();
        K.i18n.apply(lang);
        K.ui.theme(u.theme || '');
        K.ui.layout(u.layout);
        K.ui.pane(u.paneOpen !== false);
        K.ui.editorPane(true);                          // no close button any more: maximize the preview instead

        K.images.init();
        K.editor.init();
        K.preview.init();
        K.names.init();
        K.settings.init();

        const repo = K.$('#repo-link');
        if (repo) { if (K.config.repoUrl) repo.href = K.config.repoUrl; else repo.hidden = true; }

        // top bar
        // language: one button for each OTHER interface language, named in its own language
        const langButtons = function () {
            const box = K.$('#lang-switch');
            K.$$('button', box).forEach(function (b) { b.remove(); });
            Object.keys(K.i18n.languages).forEach(function (code) {
                if (code === K.i18n.lang) return;
                const b = document.createElement('button');
                b.type = 'button'; b.className = 'btn ghost'; b.lang = code;
                b.dir = code === 'en' ? 'ltr' : 'rtl';
                b.textContent = K.i18n.languages[code];
                b.addEventListener('click', function () { switchLang(code); });
                box.appendChild(b);
            });
        };
        /**
         * Switch the interface language. If the text on screen is an about/sample
         * document, unchanged, it is swapped for the one of the new language. The
         * page remembers which sample it loaded (ui.sampleLang) and loads the
         * samples script before comparing — the comparison used to run against a
         * script that was not loaded yet after a reload, so the swap was skipped.
         */
        let switching = Promise.resolve();
        const switchLang = function (next) {                 // one switch at a time, in click order
            switching = switching.then(function () { return doSwitchLang(next); }, function () { return doSwitchLang(next); });
            return switching;
        };
        const doSwitchLang = async function (next) {
            if (next === K.i18n.lang) return;
            let showingSample = false;
            const text = K.editor.value();
            if (text.trim()) {
                try {
                    await K.ui.loadScript(K.config.sample);      // cached after the first time
                    const all = window.KelkSamples || {};
                    const sl = K.store.getUi('sampleLang');
                    // the remembered sample first; any sample otherwise (text saved before this was tracked)
                    showingSample = !!(sl && all[sl] && text === all[sl].markdown) ||
                        Object.keys(all).some(function (k) { return text === all[k].markdown; });
                } catch (e) { /* no samples: keep the text */ }
            }
            K.store.setUi('lang', next);
            K.i18n.apply(next);
            langButtons();
            K.ui.layout(K.store.getUi('layout'));
            K.settings.showLogo();
            if (showingSample) await loadSample(false); else K.preview.render();
        };
        langButtons();

        on('#btn-theme', 'click', function () {
            const cur = document.documentElement.getAttribute('data-theme');
            K.store.setUi('theme', K.ui.theme(cur === 'dark' ? 'light' : 'dark'));
            K.preview.render();                 // the document's colors follow the theme (preview only)
        });
        on('#btn-layout', 'click', function () {
            K.store.setUi('layout', K.ui.layout(K.$('#workspace').classList.contains('stack') ? 'side' : 'stack'));
        });
        on('#btn-help', 'click', function () { K.ui.help(true); });
        on('#help-close', 'click', function () { K.ui.help(false); });

        // panes
        const togglePane = function () {
            const ws = K.$('#workspace');
            // a maximized panel first steps back (as Esc does), so Settings opens at its full width
            if (ws.className.indexOf('max-') >= 0) {
                K.ui.maximize(null);
                K.ui.pane(true);
                K.store.setUi('paneOpen', true);
                return;
            }
            const open = ws.classList.contains('pane-closed');
            K.ui.pane(open);
            K.store.setUi('paneOpen', open);
        };
        on('#pane-rail', 'click', togglePane);
        const groups = function (open) { K.$$('#pane-body details.group').forEach(function (d) { d.open = open; }); };
        on('#groups-open', 'click', function () { groups(true); });
        on('#groups-close', 'click', function () { groups(false); });
        on('#pane-close', 'click', togglePane);
        const toggleEditor = function () {
            const open = K.$('#workspace').classList.contains('editor-closed');
            K.ui.editorPane(open);
            K.store.setUi('editorOpen', open);
            if (open) K.$('#editor').focus();
        };
        on('#editor-rail', 'click', toggleEditor);
        // maximize one panel (the other and Settings step aside); again or Esc restores
        K.$$('[data-max]').forEach(function (b) {
            b.addEventListener('click', function () {
                const w = b.getAttribute('data-max');
                K.ui.maximize(K.$('#workspace').classList.contains('max-' + w) ? null : w);
            });
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && K.$('#workspace').className.indexOf('max-') >= 0 && !document.querySelector('dialog[open]')) K.ui.maximize(null);
        });

        // editor actions
        on('#btn-sample', 'click', function () { loadSample(true); });
        on('#btn-import', 'click', function () { K.$('#file-import').click(); });
        on('#file-import', 'change', function () { const f = this.files[0]; this.value = ''; K.importer.fromFile(f); });
        on('#btn-paste', 'click', function () { K.importer.fromClipboardButton(); });
        on('#btn-replace', 'click', function () {           // clear, then paste: the clipboard becomes the document
            if (K.editor.value() && !confirm(K.i18n.t('confirmReplace'))) return;
            K.importer.fromClipboardButton({ replace: true });
        });
        on('#btn-clear', 'click', function () {
            if (K.editor.value() && !confirm(K.i18n.t('confirmClear'))) return;
            K.names.reset();
            K.editor.set('', '');
            K.editor.markConverted(false);
        });

        // preview / export
        on('#btn-copy-preview', 'click', function () { K.preview.copyAll(); });
        on('#btn-copy-editor', 'click', function () {       // the Markdown as it is
            const text = K.editor.value();
            if (!text || !navigator.clipboard || !navigator.clipboard.writeText) return;
            navigator.clipboard.writeText(text).then(function () { K.ui.toast(K.i18n.t('copied')); },
                function (e) { K.ui.toast(K.i18n.t('failed', e && e.message || ''), 'error'); });
        });
        K.$$('[data-export]').forEach(function (b) {
            b.addEventListener('click', function () { K.exporter.run(b.getAttribute('data-export'), b); });
        });

        // shortcuts (Ctrl+Enter is free in every browser; Ctrl+S saves the Markdown)
        const exp = function (kind) { K.exporter.run(kind, K.$('[data-export="' + kind + '"]')); };
        document.addEventListener('keydown', function (e) {
            const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
            if (mod && !e.shiftKey && !e.altKey && k === 's') { e.preventDefault(); exp('md'); }
            else if (mod && e.key === 'Enter') { e.preventDefault(); exp(e.shiftKey ? 'pdf' : 'docx'); }
            else if (mod && !e.shiftKey && k === 'o') { e.preventDefault(); K.$('#file-import').click(); }
            else if (mod && e.key === ',') { e.preventDefault(); togglePane(); }
            else if (e.key === 'F1') { e.preventDefault(); K.ui.help(true); }
        });

        K.ui.icons();

        // first visit: show what Kelk does
        if (!K.editor.value().trim() && !u.sampleSeen) {
            K.store.setUi('sampleSeen', true);
            loadSample(false);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})(window.Kelk = window.Kelk || {});
