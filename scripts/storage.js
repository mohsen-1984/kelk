/**
 * Kelk.store — everything the page remembers, in localStorage under "kelk.*":
 *   ui        (JSON) page behavior: only what differs from config.uiDefaults
 *   settings  (JSON) export profile: only what differs from config.defaults, and its schemaVersion
 *   content   the Markdown text
 *   logo      data URI of the uploaded logo
 *   images    (JSON) name → data URI of images added to the text
 * Readers merge the stored differences over the defaults, so a changed default reaches every
 * value the user never set. A stored profile older than config.defaults.schemaVersion goes
 * through migrate() once (at load, and every profile that comes in: a settings file, Undo).
 * All access is guarded: a full or blocked storage never breaks the page;
 * writers return false when the browser refused.
 */
(function (K) {
    'use strict';

    const P = function (k) { return K.config.storagePrefix + k; };

    function merge(base, over) {
        const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
        // nested objects copied too: a caller that changes the result (setPath) must never
        // change K.config.defaults through a shared reference
        Object.keys(out).forEach(function (k) {
            const v = out[k];
            if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = merge(v, null);
        });
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

    const isObj = function (v) { return !!v && typeof v === 'object' && !Array.isArray(v); };

    /** What `obj` holds that differs from `base` (nested objects key by key; anything else by value). */
    function diff(obj, base) {
        const out = {};
        Object.keys(obj || {}).forEach(function (k) {
            const v = obj[k], b = base ? base[k] : undefined;
            if (isObj(v) && isObj(b)) {
                const d = diff(v, b);
                if (Object.keys(d).length) out[k] = d;
            } else if (v !== undefined && JSON.stringify(v) !== JSON.stringify(b)) out[k] = v;
        });
        return out;
    }

    // the one-shot markers of the profiles from before schemaVersion: a step ran when its marker was missing
    const MARKERS = ['_auto', '_vch', '_vz', '_auto2', '_hfauto', '_lh'];

    /**
     * An export profile of any age → the current schema (config.defaults.schemaVersion), as a copy. The one
     * migration for every profile: the stored one at load, a settings file, the profile Undo brings back.
     * Steps run only for an older schemaVersion, so a value the user chose is never "migrated" — before
     * schemaVersion the markers were not in the defaults, and a fresh profile lost a deliberate DejaVu Sans
     * Mono, Sahel, 98 %, 'rtl' or an emptied title on the next reload. A new default that must change stored
     * values: raise schemaVersion and add `if (v < n) { … }` below.
     */
    function migrate(profile) {
        const s = merge(isObj(profile) ? profile : {}, null);
        const v = +s.schemaVersion || 0;
        // settings saved before ui/profile were split: the page parts are not the profile's
        // (load() moves the stored ones to kelk.ui; a settings file's are dropped)
        delete s.ui; delete s.importer;
        if (v < 1) {
            if (isObj(s.fonts) && s.fonts.content) { s.fonts.bidi = s.fonts.content; delete s.fonts.content; }
            if (isObj(s.document) && s.document.edition === '') s.document.edition = null;
            // before automatic values, '' meant "not set": now null (so '' can mean "deliberately empty")
            if (!s._auto) {
                if (isObj(s.document) && s.document.title === '') s.document.title = null;
                if (isObj(s.headerFooter) && s.headerFooter.header === '') s.headerFooter.header = null;
                if (isObj(s.headerFooter) && s.headerFooter.footer === '') s.headerFooter.footer = null;
            }
            // the code font default became Vazir Code Hack (the stored DejaVu Sans Mono was the old default)
            if (!s._vch && isObj(s.code) && s.code.font === 'DejaVu Sans Mono') s.code.font = 'Vazir Code Hack';
            // the PDF/page Complex-scripts font default became Vazirmatn (the stored Sahel was the old default)
            if (!s._vz && isObj(s.fonts) && s.fonts.bidi === 'Sahel') s.fonts.bidi = 'Vazirmatn';
            // new defaults: table width 'auto'; Word fonts automatic by interface language
            if (!s._auto2) {
                if (isObj(s.page) && s.page.tableWidth === '98%') s.page.tableWidth = 'auto';
                if (isObj(s.fonts) && s.fonts.wordBidi === '') s.fonts.wordBidi = null;
                if (isObj(s.fonts) && s.fonts.wordLatin === 'Calibri') s.fonts.wordLatin = null;
            }
            // the header/footer direction default became 'auto' (the stored 'rtl' was the old default)
            if (!s._hfauto && isObj(s.headerFooter) && s.headerFooter.direction === 'rtl') s.headerFooter.direction = 'auto';
            // line spacing: automatic by default (an early 1.1 was the paragraphs' value only)
            if (!s._lh && isObj(s.text) && s.text.lineHeight === '110%') s.text.lineHeight = '';
        }
        MARKERS.forEach(function (m) { delete s[m]; });
        s.schemaVersion = Math.max(v, K.config.defaults.schemaVersion);
        return s;
    }

    const current = function (s) { return +s.schemaVersion >= K.config.defaults.schemaVersion; };

    /** Store a whole profile as its differences from the defaults, stamped with its schemaVersion. */
    function saveSettings(s) {
        const d = diff(s, K.config.defaults);
        d.schemaVersion = s.schemaVersion || K.config.defaults.schemaVersion;
        return raw.set('settings', JSON.stringify(d));
    }
    function saveUi(u) {
        const d = diff(u, K.config.uiDefaults);
        if (!Object.keys(d).length) { raw.remove('ui'); return true; }
        return raw.set('ui', JSON.stringify(d));
    }

    /** Stored before this version: the page parts moved to kelk.ui, the profile migrated, both kept as differences. */
    (function load() {
        const s = readJson('settings');
        if (s.ui || s.importer) {
            const u = merge(readJson('ui'), s.ui || {});
            if (s.importer) u.importer = s.importer;
            raw.set('ui', JSON.stringify(u));
        }
        if (Object.keys(s).length && (!current(s) || s.ui || s.importer)) saveSettings(merge(K.config.defaults, migrate(s)));
        const u = readJson('ui');
        if (Object.keys(u).length) {
            const d = diff(merge(K.config.uiDefaults, u), K.config.uiDefaults);
            if (JSON.stringify(d) !== JSON.stringify(u)) saveUi(merge(K.config.uiDefaults, u));
        }
    })();

    K.store = {
        raw: raw,
        migrate: migrate,
        diff: diff,

        // ── export profile ─────────────────────────────────────────────
        settings: function () {
            const s = readJson('settings');
            return merge(K.config.defaults, current(s) ? s : migrate(s));   // older: written by a tab of an older version
        },
        set: function (path, value) {
            const stored = readJson('settings');
            if (+stored.schemaVersion > K.config.defaults.schemaVersion) {
                // a newer version's profile (another tab): its differences are measured against defaults this
                // version does not know, so only this one value is written into them
                raw.set('settings', JSON.stringify(setPath(stored, path, value)));
                return this.settings();
            }
            const s = setPath(this.settings(), path, value);
            saveSettings(s);
            return s;
        },
        get: function (path) { return getPath(this.settings(), path); },
        /** A whole profile (a settings file, Undo of Reset): migrated when older, stored as differences. */
        replaceSettings: function (obj) { return saveSettings(merge(K.config.defaults, migrate(obj))); },
        resetSettings: function () { raw.remove('settings'); },

        // ── page behavior ─────────────────────────────────────────────
        ui: function () { return merge(K.config.uiDefaults, readJson('ui')); },
        setUi: function (path, value) {
            const u = setPath(this.ui(), path, value);
            saveUi(u);
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
