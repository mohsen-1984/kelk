/**
 * Kelk.slides — the Slides view and the PowerPoint export.
 * The same Markdown, read as slides (lib/PptxBuilder, convention: lib/SLIDES.md):
 *   view     Document | Slides — the preview pane's toggle (ui.view)
 *   render   the slides preview: PptxBuilder's model drawn in #slides, warnings per slide
 *   blob     the .pptx (PptxGenJS loads on the first export, with JSZip)
 *   present  the slides full screen (arrows, space, Esc)
 * The builder is configured like the Word export (Kelk.exporter._configure: Word fonts, direction,
 * images, the document's title and author) plus Settings → Slides.
 */
(function (K) {
    'use strict';

    let gen = 0, model = null, icons = null, iconsLoading = null, observer = null, store = null, deckMeta = {};
    const EAGER = 2;                 // slides drawn at once; the rest as they near the view (IntersectionObserver)

    const pascal = function (n) { return n.split('-').map(function (p) { return p.charAt(0).toUpperCase() + p.slice(1); }).join(''); };

    /**
     * Icons (:name: before a lead): the full Lucide set (vendor), loaded on the first icon. The page's own
     * icons (assets/icons.js) keep window.lucide: the full library is read and the page's object put back.
     */
    function needIcons(md) {
        if (icons || !/(^|\n)\s*(?:[-*+]|\d+[.)])\s+:[a-z0-9-]+:/.test(md)) return Promise.resolve();
        if (!iconsLoading) {
            const keep = window.lucide;
            iconsLoading = K.ui.loadScript(K.config.slides.icons).then(function () {
                const full = window.lucide;
                window.lucide = keep;
                const set = full && full.icons ? full.icons : {};
                icons = function (name) {
                    const node = set[pascal(name)];
                    if (!node || !node.map) return null;
                    return node.map(function (n) {
                        const a = n[1] || {};
                        return '<' + n[0] + Object.keys(a).filter(function (k) { return k !== 'key'; })
                            .map(function (k) { return ' ' + k + '="' + String(a[k]).replace(/"/g, '&quot;') + '"'; }).join('') + '/>';
                    }).join('');
                };
            }).catch(function () { window.lucide = keep; iconsLoading = null; });
        }
        return iconsLoading;
    }

    /** Words the slides need, by the deck's language (the builder picks: Persian, Arabic or English). */
    function labels() {
        return {
            rtl: { continued: '(ادامه)', image: 'جای تصویر', agenda: 'فهرست', part: 'بخش', presenter: 'ارائه‌دهنده', intro: 'آغاز' },
            ar: { continued: '(تابع)', image: 'مكان الصورة', agenda: 'المحتويات', part: 'القسم', presenter: 'المقدِّم', intro: 'البداية' },
            ltr: { continued: '(continued)', image: 'Image', agenda: 'Agenda', part: 'Part', presenter: 'Presenter', intro: 'Opening' }
        };
    }

    function options() {
        const s = K.store.settings().slides || {}, D = K.config.defaults.slides;
        const pick = function (k) { return s[k] == null ? D[k] : s[k]; };
        return {
            theme: pick('theme'), primary: s.primary || null, accent: s.accent || null, titleStyle: pick('titleStyle'),
            aspect: pick('aspect'), size: pick('size'), numbers: !!pick('numbers'), notes: !!pick('notes'),
            autoLayout: !!pick('autoLayout'), timeline: pick('timeline'), split: !!pick('split'), sectionNumbers: !!pick('sectionNumbers'), sections: !!pick('sections'),
            decoration: pick('decoration') || 'auto', bullet: pick('bullet') || '•', logo: pick('logo') || 'all',
            logoSrc: (K.store.logo && K.store.logo()) || null,
            footer: s.footer == null ? null : s.footer,
            labels: labels(), icons: icons || undefined
        };
    }

    /** The builder for the text on screen (configured; content and deck set). */
    function builder() {
        const md = K.editor.value();
        const r = PptxBuilder.markdownToHtml(md, { breaks: K.store.get('text.breaks') !== false });
        const box = document.createElement('div');
        box.innerHTML = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(r.html, { ADD_ATTR: ['target', 'dir', 'align', 'data-kelk-comment'] }) : r.html;
        if (typeof hljs !== 'undefined') {
            K.$$('pre code', box).forEach(function (code) {
                const declared = /(?:^|\s)language-\S/.test(code.className);
                try { hljs.highlightElement(code); } catch (e) { /* unknown language */ }
                if (!declared) code.className = code.className.replace(/(?:^|\s)language-\S+/g, '').trim();
            });
        }
        // one image store for every render: icons, formulas and pictures are read (and rasterized) once
        const b = PptxBuilder.create();
        if (typeof ImageCore !== 'undefined') { store = store || ImageCore.createStore(); b._images = store; }
        K.exporter._configure(b, 'pptx');
        // logo: in the front matter may name a registered picture (a dropped image, or "logo": the document's logo)
        const meta = Object.assign({}, r.meta);
        // what the user picked for this deck overrides the deck's own value (the deck's value is the default)
        const ov = overrides(), opts = options();
        Object.keys(ov).forEach(function (k) { if (DECK_KEYS.indexOf(k) >= 0 && owns0(r.meta, k)) { delete meta[k]; opts[k] = ov[k] === '' && k !== 'footer' ? null : ov[k]; } });
        if (meta.logo && !/^(data:|https?:|blob:)/i.test(meta.logo) && K.images && K.images.get(meta.logo)) meta.logo = K.images.get(meta.logo);
        deckMeta = r.meta;
        return b.configure({ slides: opts }).addFromHtml(box.innerHTML).setDeck(meta);
    }

    /**
     * A deck's own settings (front matter) are its defaults: what the user then picks in Settings → Slides
     * overrides them for this document only (ui.deckOverrides, cleared when another document comes in);
     * the stored settings — the user's defaults for every other deck — stay as they were.
     */
    const DECK_KEYS = ['theme', 'primary', 'accent', 'decoration', 'bullet', 'aspect', 'footer'];
    const overrides = function () { return K.store.getUi('deckOverrides') || {}; };
    const owns = function (k) { return deckMeta[k] != null && deckMeta[k] !== ''; };
    /** The value a field shows for a key the deck sets: the user's override, else the deck's. */
    function deckValue(k) {
        const o = overrides();
        if (o[k] != null) return o[k];
        let v = String(deckMeta[k]);
        if (k === 'theme' && typeof PptxBuilder !== 'undefined') v = PptxBuilder.THEMES[v] ? v : (PptxBuilder.THEME_ALIAS[v] || v);
        if ((k === 'primary' || k === 'accent') && /^#?[0-9a-f]{6}$/i.test(v)) v = '#' + v.replace('#', '').toLowerCase();
        return v;
    }

    /** Under the theme: the settings this deck brings itself, and a way back to them; the fields show the deck's values. */
    function deckNote() {
        const el = K.$('#slides-deck-note');
        if (!el) return;
        const keys = DECK_KEYS.concat(['logo']).filter(owns);
        const o = overrides();
        el.hidden = !keys.length;
        el.textContent = '';
        if (keys.length) {
            const sep = K.i18n.lang === 'en' ? ', ' : '، ';
            el.appendChild(document.createTextNode(K.i18n.t('slidesDeckNote', keys.map(function (k) {
                return k + (k === 'logo' ? '' : ': ' + String(deckMeta[k]).slice(0, 40)) + (o[k] != null ? ' → ' + String(o[k]).slice(0, 40) : '');
            }).join(sep))));
            if (Object.keys(o).length) {
                const b = document.createElement('button');
                b.type = 'button'; b.className = 'link-btn'; b.textContent = ' ' + K.i18n.t('slidesDeckBack');
                b.addEventListener('click', function () { K.store.setUi('deckOverrides', null); K.preview.render(); });
                el.appendChild(b);
            }
        }
        // the fields show what this deck uses
        const saved = K.store.settings().slides || {};
        DECK_KEYS.forEach(function (k) {
            const f = K.$('[data-setting="slides.' + k + '"]');
            if (!f || document.activeElement === f || k === 'footer' && !owns(k)) return;
            if (owns(k)) { f.value = deckValue(k); f.classList.remove('auto'); }
            else if (k !== 'primary' && k !== 'accent') f.value = saved[k] == null ? (K.config.defaults.slides[k] || '') : saved[k];   // another deck's values go
        });
        if (K.settings && K.settings.slideColors) K.settings.slideColors(Object.assign({}, K.store.settings().slides || {}, K.slides.effective()));
    }

    const owns0 = function (m, k) { return m[k] != null && m[k] !== ''; };

    function warnText(w) {
        const key = 'sw_' + w.code.replace(/-/g, '_');
        const t = K.i18n.t(key, w.arg == null ? '' : w.arg);
        return t && t !== key ? t : (PptxBuilder.WARNINGS[w.code] || w.code).replace('{0}', w.arg == null ? '' : w.arg);
    }

    K.slides = {
        init: function () {
            const st = document.createElement('style');
            st.id = 'kelk-slides-css';
            st.textContent = PptxBuilder.previewCss();
            document.head.appendChild(st);
            const self = this;
            K.$$('[data-view]').forEach(function (b) {
                b.addEventListener('click', function () { self.setView(b.getAttribute('data-view')); });
            });
            const present = K.$('#btn-present');
            if (present) present.addEventListener('click', function () { self.present(); });
            this.applyView();
        },

        /** The front matter of the text on screen (after the last render). */
        deckMeta: function () { return deckMeta; },

        /** Does the deck on screen set this setting itself (slides.theme …)? Then a change is an override for this deck. */
        deckOwns: function (path) {
            const k = String(path).replace(/^slides\./, '');
            return this.active() && /^slides\./.test(path) && DECK_KEYS.indexOf(k) >= 0 && owns(k);
        },
        /** Override a deck's own setting for this document (null: back to the deck's). */
        override: function (path, v) {
            const k = String(path).replace(/^slides\./, ''), o = Object.assign({}, overrides());
            if (v == null) delete o[k]; else o[k] = v;
            K.store.setUi('deckOverrides', Object.keys(o).length ? o : null);
        },
        /** The values this deck uses for the keys it sets (for the color pickers). */
        effective: function () {
            const out = {};
            DECK_KEYS.forEach(function (k) { if (owns(k)) out[k] = deckValue(k); });
            return out;
        },

        active: function () { return K.store.getUi('view') === 'slides'; },

        /**
         * Change the view. The two samples are written for their own view: with the about document on
         * screen (unchanged) the Slides view opens the slides sample, and the other way round — a toast
         * says so, and Undo brings the text back.
         */
        setView: async function (v) {
            const slides = v === 'slides';
            if (slides === this.active()) return;
            K.store.setUi('view', slides ? 'slides' : 'document');
            this.applyView();
            const s = K.samples ? await K.samples.of(K.editor.value()) : null;
            if (s && s.set === (slides ? 'about' : 'slides')) {
                await K.samples.load(slides ? 'slides' : 'about');
                K.ui.toast(K.i18n.t(slides ? 'toSlidesSample' : 'toAboutSample'));
            } else K.preview.render();
            K.$('.preview-scroll').scrollTop = 0;
        },

        /** The toggle, the panes, the primary export button and the name box follow the view. */
        applyView: function () {
            const on = this.active();
            document.body.classList.toggle('view-slides', on);
            K.$$('[data-view]').forEach(function (b) { b.setAttribute('aria-pressed', String((b.getAttribute('data-view') === 'slides') === on)); });
            const doc = K.$('#preview'), sl = K.$('#slides');
            if (doc) doc.hidden = on;
            if (sl) sl.hidden = !on;
            const pptx = K.$('[data-export="pptx"]'), docx = K.$('[data-export="docx"]');
            if (pptx && docx) {
                pptx.classList.toggle('primary', on); pptx.classList.toggle('soft', !on);
                docx.classList.toggle('primary', !on); docx.classList.toggle('soft', on);
            }
            if (K.names && K.names.setExt) K.names.setExt(on ? 'pptx' : 'docx');
        },

        /**
         * The slides preview (async: formulas, images and icons are read first; a newer render wins).
         * The first slides are drawn at once, the others when they come near the view.
         */
        render: async function () {
            const box = K.$('#slides');
            if (!box || typeof PptxBuilder === 'undefined') return;
            const md = K.editor.value();
            const my = ++gen;
            const count = K.$('#slides-count');
            if (!md.trim()) {
                box.innerHTML = ''; box.setAttribute('dir', K.i18n.lang === 'en' ? 'ltr' : 'rtl'); model = null;
                if (count) count.textContent = '';
                deckMeta = {}; deckNote();
                K.names.refresh(); return;
            }
            try {
                await needIcons(md);
                const b = builder();
                const m = await b.model();
                if (my !== gen) return;
                model = m;
                const opts = { notesLabel: K.i18n.t('speakerNotes'), warnText: warnText, uiDir: K.i18n.lang === 'en' ? 'ltr' : 'rtl' };
                box.innerHTML = PptxBuilder.previewHtml(m, Object.assign({ eager: EAGER }, opts));
                box.setAttribute('dir', m.dir);
                const checked = function (sl) {
                    if (!PptxBuilder.markOverflow(sl).length) return;
                    const meta = sl.parentNode.querySelector('.kelk-slide-meta');
                    if (meta && !meta.querySelector('.w')) meta.insertAdjacentHTML('beforeend', '<span class="w">⚠ ' + K.i18n.t('sw_overflow') + '</span>');
                };
                K.$$('.kelk-slide:not([data-lazy])', box).forEach(checked);
                if (observer) observer.disconnect();
                if (typeof IntersectionObserver !== 'undefined') {
                    observer = new IntersectionObserver(function (entries) {
                        entries.forEach(function (en) {
                            if (!en.isIntersecting || model !== m) return;
                            const sl = en.target;
                            observer.unobserve(sl);
                            sl.innerHTML = PptxBuilder.previewSlide(m, +sl.getAttribute('data-i'), opts);
                            sl.removeAttribute('data-lazy');
                            checked(sl);
                        });
                    }, { root: K.$('.preview-scroll'), rootMargin: '900px 0px' });
                    K.$$('.kelk-slide[data-lazy]', box).forEach(function (sl) { observer.observe(sl); });
                } else K.$$('.kelk-slide[data-lazy]', box).forEach(function (sl) {
                    sl.innerHTML = PptxBuilder.previewSlide(m, +sl.getAttribute('data-i'), opts); sl.removeAttribute('data-lazy'); checked(sl);
                });
                if (count) count.textContent = K.i18n.t('slidesCount', m.slides.length);
                deckNote();
                K.names.refresh();
            } catch (e) {
                if (my !== gen) return;
                console.error(e);
                box.innerHTML = '<p class="slides-error">' + String(e && e.message || e).replace(/[<&]/g, '') + '</p>';
            }
        },

        /** The .pptx of the text on screen. */
        blob: async function () {
            const md = K.editor.value();
            await Promise.all([K.libs.need('pptx'), needIcons(md)]);
            const b = builder();
            const m = await b.model();
            return b.toBlob(m);
        },

        /** The slides full screen: → / Space / PageDown next, ← / PageUp back, Home / End, Esc closes. */
        present: async function (from) {
            if (!model) await this.render();
            if (!model || !model.slides.length) { K.ui.toast(K.i18n.t('emptyDoc'), 'warn'); return; }
            const html = PptxBuilder.previewHtml(model, { notes: false });
            const wrap = document.createElement('div');
            wrap.className = 'present';
            wrap.innerHTML = html;
            const slides = Array.prototype.slice.call(wrap.querySelectorAll('.kelk-slide-wrap'));
            let i = Math.max(0, Math.min(from || 0, slides.length - 1));
            const counter = document.createElement('div');
            counter.className = 'present-count';
            wrap.appendChild(counter);
            const show = function () {
                slides.forEach(function (s, k) { s.hidden = k !== i; });
                counter.textContent = (i + 1) + ' / ' + slides.length;
            };
            const close = function () {
                document.removeEventListener('keydown', keys, true);
                if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
                wrap.remove();
            };
            const rtl = model.dir === 'rtl';
            const next = ['ArrowDown', 'PageDown', ' ', 'Enter', rtl ? 'ArrowLeft' : 'ArrowRight'];
            const prev = ['ArrowUp', 'PageUp', 'Backspace', rtl ? 'ArrowRight' : 'ArrowLeft'];
            const keys = function (e) {
                if (next.indexOf(e.key) >= 0) i = Math.min(slides.length - 1, i + 1);
                else if (prev.indexOf(e.key) >= 0) i = Math.max(0, i - 1);
                else if (e.key === 'Home') i = 0;
                else if (e.key === 'End') i = slides.length - 1;
                else if (e.key === 'Escape') close();
                else return;
                e.preventDefault(); e.stopPropagation();
                show();
            };
            wrap.addEventListener('click', function (e) {
                const r = wrap.getBoundingClientRect(), back = rtl ? e.clientX > r.width / 2 : e.clientX < r.width / 2;
                i = back ? Math.max(0, i - 1) : Math.min(slides.length - 1, i + 1);
                show();
            });
            document.body.appendChild(wrap);
            document.addEventListener('keydown', keys, true);
            document.addEventListener('fullscreenchange', function off() {
                if (!document.fullscreenElement) { document.removeEventListener('fullscreenchange', off); if (wrap.isConnected) close(); }
            });
            show();
            if (wrap.requestFullscreen) wrap.requestFullscreen().catch(function () {});
        },

        model: function () { return model; },

        /** The slide convention as a prompt for AI models (Settings → Slides → copy): short, English, plain text. */
        prompt: [
            'Write the presentation as GitHub-Flavored Markdown that follows these rules. Output only the Markdown, nothing before or after it.',
            '',
            'Structure',
            '- Optional front matter at the very top: title, footer, dir (rtl or ltr), theme, presenter, tagline (a short brand line), classification (e.g. Internal), contact (on the closing slide), logo (an image URL), author, date. Themes: modern-emerald, scholarly-blue, corporate-blue, tech-dark, tech-warm, minimal-mono, ocean-teal, sunset-coral, forest-green, royal-purple. Leave theme, bullet and decoration out to let the user choose.',
            '- The first # heading is the title slide; the paragraphs under it are its subtitle lines, and an image there (![Logo](url)) is shown as a logo. Each later # heading starts a section (a PowerPoint section too); the last # heading closes the deck.',
            '- Each ## heading starts a new slide and is its title (at most about 8 words). Do not put --- between slides.',
            '',
            'Content of a slide',
            '- Bullet lists: at most 6 items and 2 levels. Numbered lists for order. One table of at most 8 rows. One image as ![description](url), or ![description](placeholder) when there is no picture yet.',
            '- A label and its text: "- **Label** — detail". A Lucide icon name may come first ("- :rocket: **Label** — detail"), or an emoji ("- 🚀 **Label** — detail").',
            '- A quote is > text, then a line "> — Name, source". Do not nest quotes. Callouts are GitHub alerts: > [!NOTE], [!TIP], [!IMPORTANT], [!WARNING] or [!CAUTION]; at most one per slide.',
            '- Fenced code with a language, at most 12 lines, never inside a list item and without fences nested inside it. Formulas in LaTeX: $$ ... $$ on their own line, or $ ... $ inside a sentence (both become PowerPoint equations).',
            '- Keep the text short and in the slide\'s language; English terms may follow in parentheses, or after a dash ("فارسی — English"). Use Latin digits.',
            '',
            'Layouts (they follow the content; a comment right under the ## heading chooses one)',
            '- Automatic: a numbered list of labeled items is steps; labeled items with sub-items or icons are cards; two or three ### headings are columns; a picture or chart beside a list; one short sentence alone is a statement.',
            '- <!-- layout: NAME --> with NAME one of: cards, stats, timeline, agenda, process, cycle, pyramid, funnel, hierarchy, matrix, venn, columns, statement. statement holds one short paragraph and nothing else; a chart or table goes on a slide of its own.',
            '- timeline: labeled items whose labels are dates; add horizontal or vertical, and highlight=N for the key one. stats: labels that hold a number become big tiles. agenda with no list lists the sections. hierarchy reads a nested list (up to 4 levels). venn: two or three labeled items, then a paragraph with what they share. matrix: four labeled items. process may add vertical.',
            '- A native chart: <!-- chart: TYPE --> right before a table, TYPE one of column, bar, line, area, pie, doughnut, radar; add stacked, percent or labels, and title="...". The first column holds the categories, the other columns numbers.',
            '',
            'Speaker notes',
            '- End every slide with an HTML comment <!-- ... --> holding what the speaker says, in full sentences. Explanations go into the notes, not onto the slide. No other HTML.'
        ].join('\n'),
        _builder: builder
    };
})(window.Kelk = window.Kelk || {});
