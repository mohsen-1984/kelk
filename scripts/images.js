/**
 * Kelk.images — images added to the text (dropped or pasted into the editor),
 * referenced in Markdown by a short name: ![alt](name). Kept in localStorage
 * when there is room; "logo" is the uploaded logo. The preview shows them by
 * swapping the name for the data URI, so the exports receive real images.
 */
(function (K) {
    'use strict';

    let map = {};
    let held = 0, dirty = false;      // hold() … flush(): images stored once for a batch

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

        /**
         * Another tab stored its images (Kelk.sync): take its map, so this tab's next save does not drop
         * them; an image this tab could only keep in memory (storage full) stays while its text names it.
         */
        reload: function () {
            const stored = K.store.images(), text = K.editor.value();
            Object.keys(map).forEach(function (k) {
                if (!(k in stored) && (text.indexOf('(' + k) >= 0 || text.indexOf('(' + encodeURI(k)) >= 0)) stored[k] = map[k];
            });
            map = stored;
        },

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
            if (held) dirty = true;                 // an import adding many pictures: stored once, at flush()
            else if (!K.store.saveImages(map)) K.ui.toast(K.i18n.t('imagesSession'), 'warn');
            return name;
        },

        /**
         * Register an image under a name the text already uses (a zip's «images/a.png»): that name, or the
         * same with -2, -3 … when another picture holds it. Resolves to the name.
         */
        addAs: async function (name, file) {
            if (file.size > K.config.maxImageMB * 1024 * 1024) throw new Error(K.i18n.t('tooLarge', K.config.maxImageMB) + ': ' + name);
            return this.addUri(name, await readUri(file), true);
        },

        /** Register a data URI (an MD file's own image) under its label made a name; resolves to the name. */
        addUri: async function (label, uri, exact) {
            let name = exact ? String(label) : slug(label), n = 2;
            const base = name;
            while (name === 'logo' || (map[name] && map[name] !== uri)) name = base + '-' + n++;
            map[name] = uri;
            if (held) dirty = true;
            else if (!K.store.saveImages(map)) K.ui.toast(K.i18n.t('imagesSession'), 'warn');
            return name;
        },

        /**
         * The Markdown with its images inside, for the MD file: every image the text names by a registered
         * name becomes a reference — ![alt][name] — and the end of the file defines it as a data URI
         * («[name]: data:image/png;base64,…»), so the file shows its pictures anywhere and comes back whole
         * when it is imported (Kelk.importer turns the definitions back into stored images).
         */
        embed: function (md) {
            const self = this, defs = {};
            const out = String(md || '').replace(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(\s+"[^"]*")?\s*\)/g, function (all, alt, src, title) {
                if (/^(data:|https?:|blob:)/i.test(src)) return all;
                let key = src; try { key = decodeURIComponent(src); } catch (e) { /* keep */ }
                const uri = self.get(key);
                if (!uri || /[\[\]]/.test(key)) return all;
                defs[key.toLowerCase()] = '[' + key + ']: ' + uri + (title || '');
                return '![' + alt + '][' + key + ']';
            });
            const list = Object.keys(defs).map(function (k) { return defs[k]; });
            return list.length ? out.replace(/\s*$/, '\n\n') + list.join('\n') + '\n' : out;
        },

        /** Hold the storing of added images until flush() (a PDF with forty figures: one write, one message). */
        hold: function () { held++; },
        flush: function () {
            held = Math.max(0, held - 1);
            if (held || !dirty) return;
            dirty = false;
            if (!K.store.saveImages(map)) K.ui.toast(K.i18n.t('imagesSession'), 'warn');
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
