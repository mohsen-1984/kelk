/**
 * Kelk.settings — the Settings pane: the export profile (data-setting="path")
 * and, in its last group, App settings (page behavior, data-ui="path"). Every control
 * is saved on change. The logo is uploaded, dropped or pasted, scaled down
 * and kept in localStorage as a data URI.
 */
(function (K) {
    'use strict';

    function read(el) {
        if (el.type === 'checkbox') return el.checked;
        if (el.type === 'number') { const n = parseFloat(el.value); return isFinite(n) ? n : undefined; }
        return el.value;
    }
    function write(el, v) {
        if (el.type === 'checkbox') el.checked = !!v;
        else el.value = v == null ? '' : v;
    }
    function pathGet(obj, path) {
        return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
    }

    /** Raster logos are scaled to maxLogoPx high (PNG); SVG and small images are kept as they are. */
    function prepareLogo(file) {
        return new Promise(function (resolve, reject) {
            if (!K.images.isImage(file)) { reject(new Error(K.i18n.t('notImage'))); return; }
            const r = new FileReader();
            r.onerror = function () { reject(r.error); };
            r.onload = function () {
                const uri = r.result;
                if (/^data:image\/svg/i.test(uri)) { resolve(uri); return; }
                const img = new Image();
                img.onerror = function () { reject(new Error(K.i18n.t('notImage'))); };
                img.onload = function () {
                    const max = K.config.maxLogoPx;
                    if (img.naturalHeight <= max && uri.length < 400 * 1024) { resolve(uri); return; }
                    const h = Math.min(max, img.naturalHeight), w = Math.round(img.naturalWidth * h / img.naturalHeight);
                    const c = document.createElement('canvas');
                    c.width = w; c.height = h;
                    c.getContext('2d').drawImage(img, 0, 0, w, h);
                    resolve(c.toDataURL('image/png'));
                };
                img.src = uri;
            };
            r.readAsDataURL(file);
        });
    }

    function fillDatalist(id, items) {
        const dl = K.$(id);
        if (dl) dl.innerHTML = items.map(function (f) { return '<option value="' + f + '"></option>'; }).join('');
    }

    function fillSelect(sel, items) {
        const el = K.$(sel);
        if (el) el.innerHTML = items.map(function (f) { return '<option>' + f + '</option>'; }).join('');
    }

    /**
     * Which outputs a setting reaches (P = the preview, H = HTML, F = PDF,
     * W = Word .docx/.doc). The pane's groups say it by where a setting sits;
     * this table is what the code reads: every setting that reaches the
     * preview redraws it at once (onChange), so no setting waits for another.
     */
    const SCOPES = {
        'direction': 'PHFW', 'document.title': 'HFW', 'document.author': 'HFW', 'document.edition': 'HFW', 'document.link': 'HFW',
        'logoHeight': 'HFW', 'headerFooter.mode': 'HFW', 'headerFooter.header': 'HFW', 'headerFooter.footer': 'HFW', 'headerFooter.direction': 'HFW',
        'fonts.bidi': 'PHF', 'fonts.latin': 'PHF', 'fonts.bidiSize': 'PHFW', 'fonts.latinSize': 'PHFW', 'fonts.wordBidi': 'W', 'fonts.wordLatin': 'W',
        'toc.enabled': 'PHFW', 'toc.levels': 'PHFW', 'page.size': 'HFW', 'page.orientation': 'HFW', 'page.margin': 'HFW',
        'page.tableWidth': 'PHFW', 'page.tableAlign': 'PHFW',
        'tableStyle.lines': 'PHFW', 'tableStyle.fill': 'PHFW', 'tableStyle.total': 'PHFW', 'tableStyle.headerCenter': 'PHFW', 'tableStyle.headerBold': 'PHFW', 'tableStyle.headerColor': 'PHFW', 'tableStyle.stripeColor': 'PHFW', 'tableStyle.borderColor': 'PHFW',
        'code.showLanguage': 'PHFW', 'code.rtlFont': 'PHFW', 'code.font': 'PHF', 'code.wordFont': 'W', 'code.size': 'PHFW',
        'code.bg': 'PHFW', 'code.headerBg': 'PHFW', 'code.border': 'PHFW', 'quote.border': 'PHFW', 'quote.width': 'PHFW', 'quote.bg': 'PHFW', 'quote.text': 'PHFW',
        'math.html': 'PH', 'math.word': 'W', 'ui.previewWordFont': 'P'
    };
    const reachesPreview = function (path) { return (SCOPES[path] || '').indexOf('P') >= 0; };
    let renderTimer = 0;

    K.settings = {
        init: function () {
            const self = this;
            fillSelect('[data-setting="fonts.bidi"]', K.config.fontsBidi);
            fillSelect('[data-setting="fonts.latin"]', K.config.fontsLatin);
            fillSelect('[data-setting="code.font"]', K.config.fontsCode);
            fillDatalist('#dl-word-fonts', K.config.wordFonts);
            fillDatalist('#dl-word-code-fonts', K.config.wordCodeFonts);

            const live = function (el) { return el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input'; };
            K.$$('[data-setting]').forEach(function (el) {
                el.addEventListener(live(el), function () {
                    const path = el.getAttribute('data-setting'), v = read(el);
                    if (v === undefined) return;
                    K.store.set(path, v);
                    el.classList.remove('auto');
                    self.onChange(path, live(el) === 'input');     // typing: redraw after a short pause
                });
            });
            K.$$('[data-ui]').forEach(function (el) {
                el.addEventListener(live(el), function () {
                    K.store.setUi(el.getAttribute('data-ui'), read(el));
                    self.onChange('ui.' + el.getAttribute('data-ui'));
                });
            });

            // automatic values (title, edition, custom header/footer): typed — even
            // emptied — is kept as it is; ↺ brings the automatic value back
            // a link in a hint opens another group and brings it into view (Text → Word)
            K.$$('[data-open-group]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    const label = K.$('details.group > summary [data-i18n="' + btn.getAttribute('data-open-group') + '"]');
                    const group = label && label.closest('details');
                    if (!group) return;
                    group.open = true;
                    group.scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
            });

            // a group of values (table style, code colors, quote box): one ↺ for all of them,
            // shown once any differs from the default (data-reset-keys="path,path,…")
            K.$$('[data-reset-keys]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    const keys = btn.getAttribute('data-reset-keys').split(',');
                    keys.forEach(function (path) {
                        const d = pathGet(K.config.defaults, path);
                        K.store.set(path, d);
                        const el = K.$('[data-setting="' + path + '"]');
                        if (el) write(el, d);
                    });
                    self.onChange(keys[0]);
                });
            });

            K.$$('[data-reset]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    const path = btn.getAttribute('data-reset');
                    K.store.set(path, null);
                    self.fillDefaults(true);
                    self.onChange(path);
                });
            });

            // logo: choose, drop or paste
            const setLogo = async function (f) {
                if (!f) return;
                try {
                    const uri = await prepareLogo(f);
                    if (!K.store.saveLogo(uri)) { K.ui.toast(K.i18n.t('logoTooBig'), 'error'); return; }
                    self.showLogo();
                    K.preview.render();
                    K.ui.toast(K.i18n.t('logoSaved'));
                } catch (e) { K.ui.toast(K.i18n.t('failed', e.message), 'error'); }
            };
            K.$('#logo-file').addEventListener('change', function () { const f = this.files && this.files[0]; this.value = ''; setLogo(f); });
            const box = K.$('#logo-box');
            ['dragenter', 'dragover'].forEach(function (ev) {
                box.addEventListener(ev, function (e) {
                    if (!e.dataTransfer || Array.from(e.dataTransfer.types || []).indexOf('Files') < 0) return;
                    e.preventDefault(); box.classList.add('dragging');
                });
            });
            ['dragleave', 'drop'].forEach(function (ev) { box.addEventListener(ev, function () { box.classList.remove('dragging'); }); });
            box.addEventListener('drop', function (e) {
                const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
                if (!f) return;
                e.preventDefault(); setLogo(f);
            });
            box.addEventListener('paste', function (e) {
                const f = Array.from((e.clipboardData && e.clipboardData.files) || []).filter(K.images.isImage)[0];
                if (f) { e.preventDefault(); setLogo(f); }
            });
            K.$('#logo-remove').addEventListener('click', function () { K.store.saveLogo(''); self.showLogo(); K.preview.render(); });

            // backup: the export profile and the logo (page behavior is not part of it)
            K.$('#set-export').addEventListener('click', function () {
                const data = { app: 'kelk', version: K.config.version, settings: K.store.settings(), logo: K.store.logo() };
                K.ui.download(JSON.stringify(data, null, 2), 'application/json', 'kelk-settings.json');
                K.ui.toast(K.i18n.t('settingsSaved'));
            });
            K.$('#set-import-file').addEventListener('change', async function () {
                const f = this.files && this.files[0];
                this.value = '';
                if (!f) return;
                try {
                    const data = JSON.parse(await f.text());
                    if (!data || data.app !== 'kelk' || typeof data.settings !== 'object') throw new Error(K.i18n.t('notSettings'));
                    const s = data.settings;
                    delete s.ui; delete s.importer;                  // files from before the split
                    if (!s._auto) {                                  // files from before automatic values
                        if (s.document && s.document.title === '') s.document.title = null;
                        if (s.headerFooter && s.headerFooter.header === '') s.headerFooter.header = null;
                        if (s.headerFooter && s.headerFooter.footer === '') s.headerFooter.footer = null;
                    }
                    K.store.replaceSettings(s);
                    if (data.logo !== undefined) K.store.saveLogo(data.logo);
                    self.load();
                    K.ui.toast(K.i18n.t('settingsLoaded'));
                } catch (e) { K.ui.toast(K.i18n.t('failed', e.message), 'error'); }
            });
            K.$('#set-reset').addEventListener('click', function () {
                if (!confirm(K.i18n.t('confirmReset'))) return;
                K.store.resetSettings();
                self.load();
            });

            this.load();
            if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { self.onChange('fonts.'); });
        },

        /** Stored values → controls and page state. */
        load: function () {
            const s = K.store.settings(), u = K.store.ui();
            K.$$('[data-setting]').forEach(function (el) { write(el, pathGet(s, el.getAttribute('data-setting'))); el.classList.remove('auto'); });
            K.$$('[data-ui]').forEach(function (el) { write(el, pathGet(u, el.getAttribute('data-ui'))); });
            this.showLogo();
            this.onChange('*');
            this.fillDefaults(true);
        },

        showLogo: function () {
            const logo = K.store.logo();
            const thumb = K.$('#logo-thumb');
            thumb.innerHTML = '';
            if (logo) {
                const img = document.createElement('img');
                img.src = logo;
                img.alt = 'logo';
                thumb.appendChild(img);
            } else {
                thumb.textContent = K.i18n.t('logoNone');
            }
            K.$('#logo-remove').hidden = !logo;
        },

        /**
         * Fields whose stored value is null show their automatic value (muted),
         * and their ↺ button hides; a typed value shows ↺. `force` also fills a
         * focused field (right after ↺).
         */
        fillDefaults: function (force) {
            const auto = {
                'document.title': function () { return K.names.autoTitle(true); },
                'document.edition': function () { return K.names.defaultEdition(); },
                'fonts.wordBidi': function () { return K.settings.wordFontDefault('bidi'); },
                'fonts.wordLatin': function () { return K.settings.wordFontDefault('latin'); },
                'headerFooter.header': function () { return (K.config.samples[K.i18n.lang] || K.config.samples.fa).header; },
                'headerFooter.footer': function () { return (K.config.samples[K.i18n.lang] || K.config.samples.fa).footer; }
            };
            Object.keys(auto).forEach(function (path) {
                const el = K.$('[data-setting="' + path + '"]');
                const btn = K.$('[data-reset="' + path + '"]');
                const isAuto = K.store.get(path) == null;
                if (btn) btn.hidden = isAuto;
                if (!el) return;
                if (isAuto && (force || document.activeElement !== el)) {
                    el.value = auto[path]();
                    el.classList.add('auto');
                } else if (!isAuto) el.classList.remove('auto');
                if (path === 'document.title') el.placeholder = K.i18n.t('untitled');   // سند / document / مستند
            });
        },

        /**
         * Color pickers the table style does not use are dimmed and disabled
         * (no header fill, no stripes, no lines); their color is kept for later.
         * @param {{ lines, fill, total }} t - the stored table style
         */
        tableColorsInUse: function (t) {
            const F = (typeof BuilderBase !== 'undefined' && BuilderBase.TABLE_FILLS) || null;
            if (!F) return;
            const fill = F[t.fill] || {}, used = {};
            Object.keys(fill).forEach(function (k) { used[fill[k]] = true; });       // 'header' | 'stripe'
            const uses = { headerColor: !!used.header, stripeColor: !!used.stripe, borderColor: t.lines !== 'none' || !!t.total };
            Object.keys(uses).forEach(function (key) {
                const el = K.$('[data-setting="tableStyle.' + key + '"]');
                if (!el) return;
                el.disabled = !uses[key];
                el.closest('.field').classList.toggle('unused', el.disabled);
            });
        },

        /** The automatic Word font of a role ('bidi' | 'latin') for the interface language. */
        wordFontDefault: function (role) {
            const d = K.config.wordFontDefaults[K.i18n.lang] || K.config.wordFontDefaults.en;
            return d[role];
        },

        /** Word font fields: a note when the typed font is not on this system. */
        checkWordFonts: function () {
            K.$$('[data-font-check]').forEach(function (el) {
                const note = K.$(el.getAttribute('data-font-check'));
                const v = el.value.trim();
                if (note) note.hidden = !v || K.fonts.installed(v);
            });
        },

        /**
         * The document fonts of the editor and the preview: the Text and Code
         * groups' fonts, or — with "Preview with the Word fonts" — the Word
         * fonts, each where it is installed on this system.
         * @returns {{ bidi: string, latin: string, code: string, word: boolean }}
         */
        previewFonts: function () {
            const s = K.store.settings();
            const word = !!K.store.getUi('previewWordFont');
            const pick = function (wordName, pdfName) {
                const w = (wordName || '').trim();
                return word && w && K.fonts.installed(w) ? w : pdfName;
            };
            const wb = s.fonts.wordBidi == null ? this.wordFontDefault('bidi') : s.fonts.wordBidi;
            const wl = s.fonts.wordLatin == null ? this.wordFontDefault('latin') : s.fonts.wordLatin;
            return { bidi: pick(wb, s.fonts.bidi), latin: pick(wl, s.fonts.latin), code: pick(s.code.wordFont, s.code.font), word: word };
        },

        /** Fonts of the page (editor + preview): see previewFonts. */
        applyFonts: function () {
            const s = K.store.settings(), root = document.documentElement.style;
            const f = this.previewFonts(), bidi = f.bidi, latin = f.latin, code = f.code;
            root.setProperty('--font-content', '"' + bidi + '", "' + latin + '", system-ui, sans-serif');
            root.setProperty('--font-latin', '"' + latin + '", system-ui, sans-serif');
            root.setProperty('--font-mono', '"' + code + '", ui-monospace, Consolas, monospace');
            root.setProperty('--doc-size', ((+s.fonts.bidiSize || 12) * 4 / 3).toFixed(1) + 'px');
        },

        /**
         * Side effects of a changed setting. `typing` (text and number fields)
         * redraws the preview after a short pause instead of on every key.
         */
        onChange: function (path, typing) {
            const s = K.store.settings();
            const all = path === '*';
            if (all || path.indexOf('fonts.') === 0 || path.indexOf('code.') === 0 || path === 'ui.previewWordFont') {
                this.applyFonts();
                this.checkWordFonts();
            }
            if (all || path.indexOf('tableStyle.') === 0) this.tableColorsInUse(s.tableStyle || {});
            K.$$('[data-reset-keys]').forEach(function (btn) {
                const keys = btn.getAttribute('data-reset-keys').split(',');
                if (!all && keys.indexOf(path) < 0) return;
                btn.hidden = !keys.some(function (p) {
                    const d = pathGet(K.config.defaults, p), v = pathGet(s, p);
                    return String(v === undefined ? d : v).toLowerCase() !== String(d).toLowerCase();
                });
            });
            if (all || path === 'headerFooter.mode') {
                K.$('#hf-custom').hidden = s.headerFooter.mode !== 'custom';
            }
            const wordFont = path === 'fonts.wordBidi' || path === 'fonts.wordLatin' || path === 'code.wordFont';
            if (all || reachesPreview(path) || (wordFont && K.store.getUi('previewWordFont'))) {
                clearTimeout(renderTimer);
                if (typing) renderTimer = setTimeout(function () { K.preview.render(); }, 200);
                else K.preview.render();
            } else K.names.refresh();
        }
    };
})(window.Kelk = window.Kelk || {});
