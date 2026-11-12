/**
 * Kelk.slides — the preview's views (Document | Slides | Excel) and the way to the deck.
 * At startup: the view toggle (ui.view), the switch with its checks (the slide check, the Excel tables check), the
 * export buttons of the view, and the prompt (Settings → Slides). The deck itself — the slides preview, the .pptx,
 * the full-screen show, the settings a deck sets itself — is scripts/deck.js with lib/PptxBuilder.js, loaded on its
 * first use (Kelk.config.libs.slides: the switch to Slides, a PowerPoint export, Settings → Slides opened; 2.8).
 */
(function (K) {
    'use strict';

    /** the deck once it is here (scripts/deck.js), else null; deck() loads it */
    const loaded = function () { return K.libs.loaded('slides') ? window.KelkDeck : null; };
    const deck = function () { return K.libs.need('slides'); };

    K.slides = {
        init: function () {
            const self = this;
            K.$$('[data-view]').forEach(function (b) {
                b.addEventListener('click', function () { self.setView(b.getAttribute('data-view')); });
            });
            const present = K.$('#btn-present');
            if (present) present.addEventListener('click', function () { self.present(); });
            // Settings → Slides: its color pickers show the theme's colors (PptxBuilder's), so the deck comes when it opens
            const group = K.$('#slides-group');
            if (group) group.addEventListener('toggle', function () { if (group.open && !loaded()) deck().then(function () { K.settings.slideColors(Object.assign({}, K.store.settings().slides || {}, K.slides.effective())); }, function () {}); });
            this.applyView();
        },

        /** The front matter of the text on screen (after the last render; nothing before the deck is here). */
        deckMeta: function () { const d = loaded(); return d ? d.deckMeta() : {}; },
        /** Does the deck on screen set this setting itself (slides.theme …)? Then a change is an override for this deck. */
        deckOwns: function (path) { const d = loaded(); return !!d && d.deckOwns(path); },
        /** Override a deck's own setting for this document (null: back to the deck's). */
        override: function (path, v) { const d = loaded(); if (d) d.override(path, v); },
        /** The values this deck uses for the keys it sets (for the color pickers). */
        effective: function () { const d = loaded(); return d ? d.effective() : {}; },

        active: function () { return K.store.getUi('view') === 'slides'; },
        /** The preview's view: 'document' | 'slides' | 'excel' (the Excel view: scripts/sheets.js, loaded on its first use). */
        view: function () { const v = K.store.getUi('view'); return v === 'slides' || v === 'excel' ? v : 'document'; },

        /**
         * Change the view. The two samples are written for their own view: with the about document on
         * screen (unchanged) the Slides view opens the slides sample, and the other way round — a toast
         * says so, and Undo brings the text back. force: into slides without the slide-format check, into Excel
         * without the tables check. v: 'document' | 'slides' | 'excel'.
         */
        setView: async function (v, force) {
            v = v === 'slides' || v === 'excel' ? v : 'document';
            const slides = v === 'slides', was = this.view();
            if (v === was) return;
            const s = K.samples ? await K.samples.of(K.editor.value()) : null;
            // into slides: a text that is plainly not in slide format (the prompt's) stays a document, with a report
            // that says why and offers to make slides anyway (scripts/slidecheck.js, loaded on the first switch)
            if (slides && !force && !s && K.editor.value().trim()) {
                const self = this;
                let sc = null, res = null;
                try { sc = await K.libs.need('slidecheck'); res = sc.check(K.editor.value()); } catch (e) { res = null; }
                if (res && !res.ok) {
                    sc.show(res, function () { self.setView('slides', true); });
                    return;
                }
            }
            // into Excel: a text without a table stays where it is, with a report (scripts/sheets.js)
            if (v === 'excel' && !force && !s && K.editor.value().trim()) {
                const self = this;
                let sh = null;
                try { sh = await K.libs.need('sheets'); } catch (e) { sh = null; }
                if (sh && !sh.hasTables(K.editor.value())) {
                    sh.showNoTables(function () { self.setView('excel', true); });
                    return;
                }
            }
            if (K.ui.report.isCustom()) K.ui.report.close(false);
            if (!slides && loaded()) loaded().stop();          // a slides build under way stops: the other views build none
            K.store.setUi('view', v);
            this.applyView();
            // a sample on screen: each view has its own (the about document, the slides sample, the Excel sample)
            const want = K.samples.setOfView(v);
            if (s && s.set !== want) {
                await K.samples.load(want);
                K.ui.toast(want === 'slides' ? K.i18n.t('toSlidesSample') : want === 'excel' ? K.i18n.t('toExcelSample') : K.i18n.t('toAboutSample'));
            } else K.preview.render();
            K.$('.preview-scroll').scrollTop = 0;
        },

        /** After a paste or an import: in Slides, the slide check may switch to the document (scripts/slidecheck.js). */
        checkIncoming: function (pasted) {
            if (this.active()) K.libs.need('slidecheck').then(function (sc) { return sc.incoming(); }).catch(function () {});
            // the Excel view: a paste that holds a table → the sheets' summary (typing and other edits: nothing)
            else if (this.view() === 'excel' && pasted && pasted.indexOf('|') >= 0) {
                K.libs.need('sheets').then(function (sh) { sh.afterPaste(pasted); }).catch(function () {});
            }
        },
        /** Before a PPTX export: false when the text no longer fits and the report offers to export anyway. */
        exportOk: function (anyway) {
            return K.libs.need('slidecheck').then(function (sc) { return sc.beforeExport(anyway); }, function () { return true; });
        },

        /** The toggle, the panes, the primary export button and the name box follow the view. */
        applyView: function () {
            const v = this.view();
            document.body.classList.toggle('view-slides', v === 'slides');
            document.body.classList.toggle('view-excel', v === 'excel');
            K.$$('[data-view]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-view') === v)); });
            const doc = K.$('#preview'), sl = K.$('#slides'), sh = K.$('#sheets');
            if (doc) doc.hidden = v !== 'document';
            if (sl) sl.hidden = v !== 'slides';
            if (sh) sh.hidden = v !== 'excel';
            // the export buttons of the view only: PPTX for slides; XLSX and the CSV zip for Excel; DOCX, PDF, HTML and
            // DOC for the document
            const OF = { pptx: 'slides', xlsx: 'excel', csv: 'excel' };
            K.$$('.export-bar [data-export]').forEach(function (b) { b.hidden = (OF[b.getAttribute('data-export')] || 'document') !== v; });
            const sep = K.$('.export-bar .sep');
            if (sep) sep.hidden = v !== 'document';
            if (K.names && K.names.setExt) K.names.setExt({ slides: 'pptx', excel: 'xlsx' }[v] || 'docx');
        },

        /** The slides preview (the deck first, on the first switch to Slides). */
        render: function () {
            if (!this.active()) return Promise.resolve();       // the document view builds no slides
            return deck().then(function (d) { return d.render(); }, function (e) { console.error(e); K.ui.toast(K.i18n.t('failed', e.message), 'error'); });
        },
        /** The .pptx of the text on screen (t: the export's task; the deck and PptxGenJS on the first export, the step named). */
        blob: async function (t) {
            const first = !loaded();
            if (first) t.progress(0, 1000, K.i18n.t('pptx_libs'));     // the step named while the deck loads (its blob names it again)
            return (await deck()).blob(t, first);
        },
        /** The slides full screen. */
        present: async function (from) { return (await deck()).present(from); },
        model: function () { const d = loaded(); return d ? d.model() : null; },

        /** The slide convention as a prompt for AI models (Settings → Slides → copy): short, English, plain text. */
        prompt: [
            'Write the presentation as GitHub-Flavored Markdown that follows these rules. First plan the deck silently: one idea per slide and the form of each slide. Then output only the Markdown, nothing before or after it.',
            '',
            'Structure',
            '- Optional front matter at the very top: title, footer, dir (rtl or ltr), theme, presenter, tagline (a short brand line), classification (e.g. Internal), contact (on the closing slide), logo (an image URL), author, date. Themes: modern-emerald, scholarly-blue, corporate-blue, tech-dark, tech-warm, minimal-mono, ocean-teal, sunset-coral, forest-green, royal-purple. Leave theme out to let the user choose.',
            '- The first # heading is the title slide; the paragraphs under it are its subtitle lines, and an image there (![Logo](url)) is shown as a logo. Each later # heading starts a section (a PowerPoint section too); the last # heading closes the deck.',
            '- Each ## heading starts a new slide and is its title (at most about 8 words). Do not put --- between slides.',
            '',
            'Choosing the form (decide for each slide from the shape of its content; the Markdown that produces each form follows the arrow)',
            '- Several items compared on the same two or more attributes (options, tools, before/after, pros/cons, roles and duties) → a table. Never split such a comparison into cards or bullets.',
            '- Numbers across categories or over time → a chart (<!-- chart: TYPE --> before a table); two to four headline figures → <!-- layout: stats -->.',
            '- Order or flow → a numbered list of labeled items with no sub-items (steps), or <!-- layout: process --> or <!-- layout: timeline -->.',
            '- Two to six parallel ideas, each a label and one line → cards: a bulleted list of labeled items with <!-- layout: cards --> above it, or with sub-items or icons on every item and the list alone on the slide. Cards are the right form for such ideas; do not turn them into a plain list.',
            '- Two or three parallel blocks → columns: two or three ### headings.',
            '- Use a diagram only when that relation is really in the content: hierarchy → hierarchy; a repeating loop → cycle; levels or narrowing stages → pyramid or funnel; two dimensions in four cells → matrix; overlap of two or three things → venn.',
            '- A quoted sentence → a quote; a command or code → a code block; one key message → statement.',
            '- Anything else → a plain bullet list.',
            '- Prefer variety, but never change a form only to vary it. Cards usually suit about a quarter to a third of the slides. A deck that compares or quantifies anything should include at least one table or chart, but never invent data to fill one.',
            '',
            'Content of a slide',
            '- Table: a header row, 2 to 5 columns, at most 8 rows, cells of a few words; one table per slide, with at most one short sentence before it. Example:',
            '  | Option | Cost | Speed | Risk |',
            '  |---|---|---|---|',
            '  | A | Low | Slow | Low |',
            '  | B | High | Fast | Medium |',
            '- Bullet lists: at most 6 items and 2 levels. Numbered lists for order. One image as ![description](url), or ![description](placeholder) when there is no picture yet.',
            '- A label and its text: "- **Label** — detail". A Lucide icon name or an emoji may come first ("- :rocket: **Label** — detail"). Icons on every item of a list that is alone on the slide make it cards; otherwise icon items become icon rows. Use icons only when you want one of these.',
            '- A quote is > text, then a line "> — Name, source". Do not nest quotes. Callouts are GitHub alerts: > [!NOTE], [!TIP], [!IMPORTANT], [!WARNING] or [!CAUTION]; at most one per slide.',
            '- Fenced code with a language, at most 12 lines, never inside a list item and without fences nested inside it. Formulas in LaTeX: $$ ... $$ on their own line, or $ ... $ inside a sentence (both become PowerPoint equations).',
            '- Keep the text short and in the slide\'s language; English terms may follow in parentheses, or after a dash ("فارسی — English"). Use Latin digits.',
            '',
            'Layout and chart details',
            '- A comment right under the ## heading forces a layout: <!-- layout: NAME --> with NAME one of: cards, stats, timeline, agenda, process, cycle, pyramid, funnel, hierarchy, matrix, venn, columns, statement.',
            '- statement holds one short paragraph and nothing else. timeline: labeled items whose labels are dates; add horizontal or vertical, and highlight=N for the key one. stats: labels that hold a number become big tiles. agenda with no list lists the sections. hierarchy reads a nested list (up to 4 levels). venn: two or three labeled items, then a paragraph with what they share. matrix: four labeled items. process may add vertical.',
            '- Chart TYPE is one of column, bar, line, area, pie, doughnut, radar; add stacked, percent or labels, and title="...". The first column holds the categories, the other columns numbers. A chart may have a short list or one sentence beside it; never put a layout comment on a chart slide.',
            '',
            'Speaker notes',
            '- End every slide with an HTML comment <!-- ... --> holding what the speaker says, in full sentences. Explanations go into the notes, not onto the slide. No other HTML.'
        ].join('\n'),
    };
})(window.Kelk = window.Kelk || {});
