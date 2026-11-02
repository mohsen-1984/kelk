/**
 * Kelk.boot — the page's language, direction and theme before its first paint.
 * Loaded by index.html in <head>, before the stylesheets, as an external script (the Content-Security-Policy
 * allows 'self' scripts only, no inline ones). It runs before config.js and storage.js, so it reads the stored
 * page settings itself: localStorage "kelk.ui" (Kelk.store's ui entry; config.storagePrefix + 'ui'), its
 * `lang` and `theme` (or an old profile's kelk.settings.ui). Without them: the language from the browser (firstLanguage), the light theme — the
 * same choices main.js and Kelk.ui.theme make later, so nothing changes when they run.
 * Without this, the page painted as <html lang="fa" dir="rtl"> and light, then switched (a wrong-language flash
 * for English and Arabic users, a light flash for the dark theme).
 */
(function (K) {
    'use strict';

    const LANGS = { fa: 'rtl', en: 'ltr', ar: 'rtl' };     // the interface languages (Kelk.i18n) and their direction

    /**
     * First visit: the language from the browser's locale. Any Persian entry in the user's language list
     * (fa, fa-IR, fa-AF, prs) → Persian; Arabic → Arabic; an English browser with an Iranian or Afghan time
     * zone (common: an English UI on a Persian speaker's system) → Persian too; otherwise English.
     */
    function firstLanguage() {
        const nav = window.navigator || {};
        const langs = (nav.languages && nav.languages.length ? nav.languages : [nav.language || ''])
            .map(function (l) { return String(l).toLowerCase(); });
        if (langs.some(function (l) { return /^(fa|prs)\b/.test(l); })) return 'fa';
        if (langs.some(function (l) { return /^ar\b/.test(l); })) return 'ar';
        let tz = '';
        try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* none */ }
        if (/^Asia\/(Tehran|Kabul)$/.test(tz)) return 'fa';
        return langs[0] ? 'en' : 'fa';
    }

    /** A stored JSON object ({} when there is none, or the storage is blocked or unreadable). */
    function stored(key) {
        try {
            const v = JSON.parse(window.localStorage.getItem(key) || '{}');
            return v && typeof v === 'object' ? v : {};
        } catch (e) { return {}; }
    }

    /**
     * The stored page settings. A profile of an old version kept them inside kelk.settings (its `ui`);
     * storage.js load() moves them to kelk.ui later, its values over kelk.ui's — the same order here.
     */
    function storedUi() {
        const u = stored('kelk.ui'), old = stored('kelk.settings').ui;
        return Object.assign({}, u, old && typeof old === 'object' ? old : {});
    }

    const has = function (o, k) { return typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); };
    const u = storedUi();
    // a stored language Kelk does not know is Persian, as Kelk.i18n.apply makes it
    const lang = u.lang ? (has(LANGS, u.lang) ? u.lang : 'fa') : firstLanguage();
    // a stored theme other than 'dark' is light, as Kelk.ui.theme makes it
    const theme = u.theme === 'dark' ? 'dark' : 'light';
    const root = document.documentElement;
    root.lang = lang;
    root.dir = LANGS[lang];
    root.setAttribute('data-theme', theme);

    K.boot = { lang: lang, theme: theme, firstLanguage: firstLanguage };
})(window.Kelk = window.Kelk || {});
