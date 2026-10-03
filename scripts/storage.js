/**
 * Kelk.store — everything the page remembers, in localStorage under "kelk.*":
 *   ui        (JSON) page behavior, merged over config.uiDefaults
 *   settings  (JSON) export profile, merged over config.defaults
 *   content   the Markdown text
 *   logo      data URI of the uploaded logo
 *   images    (JSON) name → data URI of images added to the text
 * All access is guarded: a full or blocked storage never breaks the page;
 * writers return false when the browser refused.
 */
(function (K) {
    'use strict';

    const P = function (k) { return K.config.storagePrefix + k; };

    function merge(base, over) {
        const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
        Object.keys(over || {}).forEach(function (k) {
            const b = base ? base[k] : undefined, v = over[k];
            out[k] = (b && typeof b === 'object' && !Array.isArray(b) && v && typeof v === 'object') ? merge(b, v) : v;
        });
        return out;
    }

    function readJson(k) {
        try { return JSON.parse(raw.get(k) || '{}') || {}; } catch (e) { return {}; }
    }

    function setPath(obj, path, value) {
        const keys = path.split('.');
        let o = obj;
        for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]] = (o[keys[i]] && typeof o[keys[i]] === 'object') ? o[keys[i]] : {};
        o[keys[keys.length - 1]] = value;
        return obj;
    }

    function getPath(obj, path) {
        return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
    }

    const raw = {
        get: function (k) { try { return localStorage.getItem(P(k)); } catch (e) { return null; } },
        set: function (k, v) { try { localStorage.setItem(P(k), v); return true; } catch (e) { return false; } },
        remove: function (k) { try { localStorage.removeItem(P(k)); } catch (e) { /* ignore */ } }
    };

    /** Settings saved before ui/profile were split: move the page parts out. */
    (function migrate() {
        const s = readJson('settings');
        let changed = false;
        if (s.ui || s.importer) {
            const u = merge(readJson('ui'), s.ui || {});
            if (s.importer) u.importer = s.importer;
            raw.set('ui', JSON.stringify(u));
            delete s.ui; delete s.importer; changed = true;
        }
        if (s.fonts && s.fonts.content) { s.fonts.bidi = s.fonts.content; delete s.fonts.content; changed = true; }
        if (s.document && s.document.edition === '') { s.document.edition = null; changed = true; }
        // before automatic values, '' meant "not set": now null (so '' can mean "deliberately empty")
        if (!s._auto) {
            if (s.document && s.document.title === '') s.document.title = null;
            if (s.headerFooter && s.headerFooter.header === '') s.headerFooter.header = null;
            if (s.headerFooter && s.headerFooter.footer === '') s.headerFooter.footer = null;
            if (Object.keys(s).length) { s._auto = 1; changed = true; }
        }
        // the code font default became Vazir Code Hack (the stored DejaVu Sans Mono was the old default)
        if (!s._vch && Object.keys(s).length) {
            if (s.code && s.code.font === 'DejaVu Sans Mono') s.code.font = 'Vazir Code Hack';
            s._vch = 1; changed = true;
        }
        // the PDF/page Complex-scripts font default became Vazirmatn (the stored Sahel was the old default)
        if (!s._vz && Object.keys(s).length) {
            if (s.fonts && s.fonts.bidi === 'Sahel') s.fonts.bidi = 'Vazirmatn';
            s._vz = 1; changed = true;
        }
        // new defaults: table width 'auto'; Word fonts automatic by interface language
        if (!s._auto2 && Object.keys(s).length) {
            if (s.page && s.page.tableWidth === '98%') s.page.tableWidth = 'auto';
            if (s.fonts && s.fonts.wordBidi === '') s.fonts.wordBidi = null;
            if (s.fonts && s.fonts.wordLatin === 'Calibri') s.fonts.wordLatin = null;
            s._auto2 = 1; changed = true;
        }
        // the header/footer direction default became 'auto' (the stored 'rtl' was the old default)
        if (!s._hfauto && Object.keys(s).length) {
            if (s.headerFooter && s.headerFooter.direction === 'rtl') s.headerFooter.direction = 'auto';
            s._hfauto = 1; changed = true;
        }
        if (changed) raw.set('settings', JSON.stringify(s));
    })();

    K.store = {
        raw: raw,

        // ── export profile ─────────────────────────────────────────────
        settings: function () { return merge(K.config.defaults, readJson('settings')); },
        set: function (path, value) {
            const s = setPath(this.settings(), path, value);
            raw.set('settings', JSON.stringify(s));
            return s;
        },
        get: function (path) { return getPath(this.settings(), path); },
        replaceSettings: function (obj) { raw.set('settings', JSON.stringify(merge(K.config.defaults, obj || {}))); },
        resetSettings: function () { raw.remove('settings'); },

        // ── page behavior ─────────────────────────────────────────────
        ui: function () { return merge(K.config.uiDefaults, readJson('ui')); },
        setUi: function (path, value) {
            const u = setPath(this.ui(), path, value);
            raw.set('ui', JSON.stringify(u));
            return u;
        },
        getUi: function (path) { return getPath(this.ui(), path); },

        // ── content, logo, images ──────────────────────────────────────
        content: function () { return raw.get('content') || ''; },
        saveContent: function (text) { return raw.set('content', text); },

        logo: function () { return raw.get('logo') || ''; },
        saveLogo: function (dataUri) { return dataUri ? raw.set('logo', dataUri) : (raw.remove('logo'), true); },

        images: function () { return readJson('images'); },
        saveImages: function (map) {
            if (!map || !Object.keys(map).length) { raw.remove('images'); return true; }
            return raw.set('images', JSON.stringify(map));
        }
    };
})(window.Kelk = window.Kelk || {});
