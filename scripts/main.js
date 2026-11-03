/**
 * Kelk — startup: language, theme, layout, modules, buttons and keyboard shortcuts.
 */
(function (K) {
    'use strict';

    function on(sel, ev, fn) { const el = K.$(sel); if (el) el.addEventListener(ev, fn); }

    /**
     * The hint above the editor while the text on screen is an about/sample
     * document, unchanged: the eraser starts a document of one's own. It goes
     * with the first edit; the samples script is loaded only when the text
     * could be one (a remembered sample language, or the script already in).
     */
    async function sampleNote() {
        const note = K.$('#sample-note');
        if (!note) return;
        const text = K.editor.value();
        let all = window.KelkSamples;
        if (!all && text.trim() && K.store.getUi('sampleLang')) {
            try { await K.ui.loadScript(K.config.sample); all = window.KelkSamples; } catch (e) { all = null; }
        }
        const isSample = !!all && !!text.trim() && Object.keys(all).some(function (k) { return all[k] && text === all[k].markdown; });
        if (text !== K.editor.value()) return;              // edited meanwhile: the next call decides
        note.hidden = !isSample;
    }

    /** Load the about/guide/sample document of the interface language (a script, so file:// works). */
    async function loadSample() {                    // no confirm: the text before it is one Undo away
        try {
            await K.ui.loadScript(K.config.sample);
            // the document of the interface language (about Kelk + guide + samples)
            const all = window.KelkSamples || {};
            const lang = all[K.i18n.lang] ? K.i18n.lang : (all.en ? 'en' : 'fa');
            const doc = all[lang];
            K.names.newDocument(doc.name, lang);    // remembered: this text IS the sample of `lang`; its file name names the exports
            K.editor.set(doc.markdown, doc.name);
            K.editor.markConverted(false);
            K.$('.preview-scroll').scrollTop = 0;
            K.$('#editor').scrollTop = 0;
        } catch (e) {
            K.ui.toast(K.i18n.t('failed', e.message), 'error');
        }
    }

    function start() {
        const u = K.store.ui();
        // first visit: the browser's language (scripts/boot.js, which already set <html lang dir> and the theme)
        const lang = u.lang || K.boot.firstLanguage();
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
            box.setAttribute('aria-label', K.i18n.t('languageGroup'));
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
            K.editor.stats();                                // the size's unit
            K.ui.layout(K.store.getUi('layout'));
            K.settings.showLogo();
            K.settings.fontPack();
            K.ui.report.refresh();                           // an open import report, in the new language
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
        // ? : the help (a short guide; F1), ⌨ : the keyboard shortcuts
        on('#btn-help', 'click', function () { K.ui.dialog('#guide', true); });
        on('#guide-close', 'click', function () { K.ui.dialog('#guide', false); });
        on('#guide-sample', 'click', function () { K.ui.dialog('#guide', false); loadSample(); });
        on('#guide-keys', 'click', function () { K.ui.dialog('#guide', false); K.ui.help(true); });
        on('#btn-keys', 'click', function () { K.ui.help(true); });
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
        // Settings below the panels (≤1100px): the heading opens and closes it too (the rail opens it)
        on('.settings > .pane-head', 'click', function (e) {
            // the path, not e.target.closest: a button may swap its icon while handling the click,
            // and a detached target finds no button above it
            const onControl = e.composedPath().some(function (n) { return n.nodeType === 1 && /^(BUTTON|A|INPUT|SELECT)$/.test(n.tagName); });
            if (onControl || !window.matchMedia('(max-width: 1100px)').matches) return;
            togglePane();
        });
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
        on('#btn-sample', 'click', function () { loadSample(); });
        on('#btn-import', 'click', function () { K.$('#file-import').click(); });
        on('#file-import', 'change', function () { const fs = Array.from(this.files || []); this.value = ''; K.importer.fromFiles(fs); });
        on('#btn-paste', 'click', function () { K.importer.fromClipboardButton(); });
        // no confirms on this page: every change of the text is one Undo away (Kelk.editor's history)
        on('#btn-replace', 'click', function () { K.importer.fromClipboardButton({ replace: true }); });   // clear, then paste
        const clearText = function () {
            K.names.reset();
            K.editor.set('', '');
            K.editor.markConverted(false);
            K.$('#editor').focus();
        };
        on('#btn-clear', 'click', clearText);
        on('#sample-note-clear', 'click', clearText);       // the sample hint's own eraser
        on('#btn-undo', 'click', function () { K.editor.undo(); });
        on('#btn-redo', 'click', function () { K.editor.redo(); });
        // the sample hint follows the text: typed, or replaced (sample, import, clear, undo, redo)
        on('#editor', 'kelk:replaced', function () { sampleNote(); });
        on('#editor', 'input', function () { sampleNote(); });
        sampleNote();

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
            else if (e.key === 'F1') { e.preventDefault(); K.ui.help(false); K.ui.dialog('#guide', true); }
        });

        // another tab of Kelk saved (the storage event reaches every OTHER tab of the same origin): this tab
        // follows it — text, images, profile, logo, page settings — so it never writes back what it showed before
        window.addEventListener('storage', function (e) {
            const pre = K.config.storagePrefix;
            if (e.key === null) {
                // the storage was cleared (another tab's site data, DevTools): this tab's text and images are
                // written back, not taken as empty; the profile and page settings fall back to the defaults
                K.store.saveContent(K.editor.value());
                K.store.saveImages(K.images.all());
                K.settings.load();
                return;
            }
            if (e.key.indexOf(pre) !== 0) return;
            const key = e.key.slice(pre.length);
            if (key === 'images') { K.images.reload(); K.preview.render(); }
            if (key === 'content' && K.editor.external(K.store.content())) {
                K.names.followStored(true);
                K.ui.toast(K.i18n.t('tabSynced'));
            }
            if (key === 'ui') {
                const u = K.store.ui();
                if (u.lang && u.lang !== K.i18n.lang) switchLang(u.lang);
                K.ui.theme(u.theme || '');                  // the preview's colors follow in settings.load() below
                K.ui.layout(u.layout);
                K.names.followStored(false);
            }
            if (key === 'settings' || key === 'ui' || key === 'logo') K.settings.load();
        });

        K.ui.icons();
        K.ui.watchBars();

        // to the page's top / end: shown when the PAGE scrolls (one column, or editor above
        // preview on a small screen) — side by side each panel scrolls inside and the page does not
        (function () {
            const box = K.$('#page-jump'), up = K.$('#jump-top'), down = K.$('#jump-end');
            if (!box) return;
            let raf = 0;
            const update = function () {
                raf = 0;
                const el = document.scrollingElement || document.documentElement;
                const max = el.scrollHeight - window.innerHeight, y = window.scrollY;
                box.hidden = max < 240;
                up.classList.toggle('off', y < 160);
                down.classList.toggle('off', y > max - 160);
            };
            const later = function () { if (!raf) raf = requestAnimationFrame(update); };
            window.addEventListener('scroll', later, { passive: true });
            window.addEventListener('resize', later);
            if (typeof ResizeObserver !== 'undefined') new ResizeObserver(later).observe(K.$('.app') || document.body);   // body is one screen high (height: 100%); .app grows
            up.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
            down.addEventListener('click', function () {
                const el = document.scrollingElement || document.documentElement;
                window.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
            });
            update();
        })();

        // first visit: show what Kelk does
        if (!K.editor.value().trim() && !u.sampleSeen) {
            K.store.setUi('sampleSeen', true);
            loadSample(false);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})(window.Kelk = window.Kelk || {});
