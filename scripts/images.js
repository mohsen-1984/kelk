/**
 * Kelk.images — images added to the text (dropped or pasted into the editor),
 * referenced in Markdown by a short name: ![alt](name). Kept in localStorage
 * when there is room; "logo" is the uploaded logo. The preview shows them by
 * swapping the name for the data URI, so the exports receive real images.
 */
(function (K) {
    'use strict';

    let map = {};

    function slug(fileName) {
        return String(fileName || '').replace(/\.[^.]+$/, '').normalize('NFC')
            .replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'image';
    }

    function readUri(file) {
        return new Promise(function (resolve, reject) {
            const r = new FileReader();
            r.onload = function () { resolve(r.result); };
            r.onerror = function () { reject(r.error); };
            r.readAsDataURL(file);
        });
    }

    K.images = {
        init: function () { map = K.store.images(); },

        get: function (name) { return name === 'logo' ? K.store.logo() : map[name]; },

        all: function () { return Object.assign({}, map); },

        isImage: function (file) { return !!file && /^image\//.test(file.type); },

        /** Register a File; resolves to its name. */
        add: async function (file) {
            if (file.size > K.config.maxImageMB * 1024 * 1024) throw new Error(K.i18n.t('tooLarge', K.config.maxImageMB));
            const uri = await readUri(file);
            let name = slug(file.name), n = 2;
            const base = name;
            while (name === 'logo' || (map[name] && map[name] !== uri)) name = base + '-' + n++;
            map[name] = uri;
            if (!K.store.saveImages(map)) K.ui.toast(K.i18n.t('imagesSession'), 'warn');
            return name;
        },

        /** Forget images the text no longer uses. */
        prune: function (md) {
            const text = md || '';
            let changed = false;
            Object.keys(map).forEach(function (k) {
                if (text.indexOf('(' + k) < 0 && text.indexOf('(' + encodeURI(k)) < 0 && text.indexOf('"' + k + '"') < 0) { delete map[k]; changed = true; }
            });
            if (changed) K.store.saveImages(map);
        },

        /** Swap registered names for data URIs in rendered HTML. */
        resolve: function (root) {
            const self = this;
            K.$$('img[src]', root).forEach(function (img) {
                let src = img.getAttribute('src');
                if (/^(data:|https?:|blob:)/i.test(src)) return;
                try { src = decodeURIComponent(src); } catch (e) { /* keep */ }
                const uri = self.get(src);
                if (uri) img.setAttribute('src', uri);
            });
        },

        /** Give a builder every registered name (and the logo). */
        register: function (b) {
            const logo = K.store.logo();
            if (logo) b.registerImage('logo', logo);
            Object.keys(map).forEach(function (k) { b.registerImage(k, map[k]); });
        }
    };
})(window.Kelk = window.Kelk || {});
