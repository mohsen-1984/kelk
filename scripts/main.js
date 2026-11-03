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
        const which = text.trim() ? await sampleOf(text) : null;
        if (text !== K.editor.value()) return;              // edited meanwhile: the next call decides
        note.hidden = !which;
        if (which) {                                        // a sample on screen: its file name names the exports
            const all = which.set === 'slides' ? window.KelkSlideSamples : window.KelkSamples;
            if (all && all[which.lang]) K.names.adopt(all[which.lang].name);
        }
        const label = note.querySelector('[data-i18n]');
        if (label) { label.setAttribute('data-i18n', which && which.set === 'slides' ? 'sampleNoteSlides' : 'sampleNote'); label.textContent = K.i18n.t(label.getAttribute('data-i18n')); }
    }

    /**
     * Which sample is this text — { set: 'about' | 'slides', lang } or null. The samples scripts load
     * when the text could be one (a remembered sample language, or the scripts already in).
     */
    async function sampleOf(text) {
        if (!text || !text.trim()) return null;
        const sets = [['about', K.config.sample, 'KelkSamples'], ['slides', K.config.slidesSample, 'KelkSlideSamples']];
        for (let i = 0; i < sets.length; i++) {
            let all = window[sets[i][2]];
            if (!all && K.store.getUi('sampleLang')) {
                try { await K.ui.loadScript(sets[i][1]); all = window[sets[i][2]]; } catch (e) { all = null; }
            }
            if (!all) continue;
            const sl = K.store.getUi('sampleLang');
            if (sl && all[sl] && all[sl].markdown === text) return { set: sets[i][0], lang: sl };
            const k = Object.keys(all).find(function (x) { return all[x] && all[x].markdown === text; });
            if (k) return { set: sets[i][0], lang: k };
        }
        return null;
    }

    /**
     * Load the sample of the interface language (a script, so file:// works): in the Slides view the
     * slides sample (AI literacy), otherwise the about/guide/sample document.
     */
    async function loadSample(_, set) {                 // no confirm: the text before it is one Undo away
        try {
            const slides = set ? set === 'slides' : K.slides.active();
            await K.ui.loadScript(slides ? K.config.slidesSample : K.config.sample);
            // the document of the interface language (about Kelk + guide + samples, or the slides)
            const all = (slides ? window.KelkSlideSamples : window.KelkSamples) || {};
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

    /** For Kelk.slides: which sample is on screen, and loading the other one when the view changes. */
    K.samples = { of: sampleOf, load: function (set) { return loadSample(false, set); } };

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
        K.slides.init();

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
            let showingSample = null;
            const text = K.editor.value();
            if (text.trim()) {
                try {
                    await Promise.all([K.ui.loadScript(K.config.sample), K.ui.loadScript(K.config.slidesSample)]);   // cached after the first time
                    showingSample = await sampleOf(text);
                } catch (e) { /* no samples: keep the text */ }
            }
            K.store.setUi('lang', next);
            K.i18n.apply(next);
            langButtons();
            K.ui.layout(K.store.getUi('layout'));
            K.settings.showLogo();
            K.settings.fontPack();
            if (showingSample) await loadSample(false, showingSample.set); else K.preview.render();
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
        // a text without a file name after a reload may still be a sample (one an older version stored): look
        (K.store.getUi('sourceName') || !K.editor.value().trim() ? Promise.resolve()
            : Promise.all([K.ui.loadScript(K.config.sample), K.ui.loadScript(K.config.slidesSample)]).catch(function () {})).then(sampleNote);

        // preview / export
        on('#btn-copy-preview', 'click', function () { K.preview.copyAll(); });
        on('#btn-copy-editor', 'click', function () {       // the Markdown as it is
            const text = K.editor.value();
            if (!text || !navigator.clipboard || !navigator.clipboard.writeText) return;
            navigator.clipboard.writeText(text).then(function () { K.ui.toast(K.i18n.t('copied')); },
                function (e) { K.ui.toast(K.i18n.t('failed', e && e.message || ''), 'error'); });
        });
        on('#btn-slides-prompt', 'click', function () {          // Settings → Slides: the convention as a prompt for AI models
            if (!navigator.clipboard || !navigator.clipboard.writeText) return;
            navigator.clipboard.writeText(K.slides.prompt).then(function () { K.ui.toast(K.i18n.t('promptCopied')); },
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
            else if (mod && e.altKey && e.key === 'Enter') { e.preventDefault(); exp('pptx'); }
            else if (mod && e.key === 'Enter') { e.preventDefault(); exp(e.shiftKey ? 'pdf' : 'docx'); }
            else if (e.key === 'F5' && K.slides.active() && !document.querySelector('.present')) { e.preventDefault(); K.slides.present(); }
            else if (mod && !e.shiftKey && k === 'o') { e.preventDefault(); K.$('#file-import').click(); }
            else if (mod && e.key === ',') { e.preventDefault(); togglePane(); }
            else if (e.key === 'F1') { e.preventDefault(); K.ui.help(false); K.ui.dialog('#guide', true); }
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
