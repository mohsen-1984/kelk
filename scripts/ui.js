/**
 * Kelk.ui — small interface services: toasts, theme, layout, panes,
 * dialogs, icons, busy buttons, script loading and downloads.
 */
(function (K) {
    'use strict';

    const $ = function (sel, root) { return (root || document).querySelector(sel); };

    K.$ = $;
    K.$$ = function (sel, root) { return Array.from((root || document).querySelectorAll(sel)); };

    const scripts = new Map();      // src → Promise

    /**
     * Kelk.libs — the large libraries (docx 0.4 MB, jsPDF 1.2 MB, mammoth
     * 0.6 MB) load on first use, not with the page:
     *   await K.libs.need('docx')     .docx export
     *   await K.libs.need('jspdf')    .pdf export
     *   await K.libs.need('mammoth')  .docx import
     */
    K.libs = {
        need: function (name) {
            const lib = K.config.libs[name];
            if (!lib) return Promise.reject(new Error('unknown library ' + name));
            if (window[lib.global]) return Promise.resolve(window[lib.global]);
            return K.ui.loadScript(lib.src).then(function () {
                if (!window[lib.global]) throw new Error(name + ' did not load');
                return window[lib.global];
            });
        }
    };

    K.ui = {
        /** type: 'info' | 'warn' | 'error' */
        toast: function (message, type, ms) {
            const box = $('#toasts');
            if (!box) return;
            const el = document.createElement('div');
            el.className = 'toast' + (type && type !== 'info' ? ' ' + type : '');
            el.setAttribute('role', type === 'error' ? 'alert' : 'status');
            el.textContent = message;
            box.appendChild(el);
            setTimeout(function () { el.remove(); }, ms || (type === 'error' || type === 'warn' ? 6000 : 2800));
        },

        icons: function (root) {
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                try { lucide.createIcons(root ? { root: root } : undefined); } catch (e) { lucide.createIcons(); }
            }
        },

        /** Set a button's icon (lucide name). */
        setIcon: function (btn, name) {
            if (!btn) return;
            const old = btn.querySelector('svg, i');
            const i = document.createElement('i');
            i.setAttribute('data-lucide', name);
            if (old) old.replaceWith(i); else btn.prepend(i);
            this.icons(btn);
        },

        /**
         * A classic <script> (works from file://, unlike fetch). Resolves once;
         * a failed load can be retried.
         */
        loadScript: function (src) {
            if (!scripts.has(src)) {
                scripts.set(src, new Promise(function (resolve, reject) {
                    const s = document.createElement('script');
                    s.src = src;
                    s.onload = resolve;
                    s.onerror = function () { scripts.delete(src); reject(new Error('cannot load ' + src)); };
                    document.head.appendChild(s);
                }));
            }
            return scripts.get(src);
        },

        theme: function (name) {
            // const t = name || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
            // For now: light by default, whatever the system's matchMedia says (dark styles are not tuned yet); users can still switch to dark.
            const t = name || 'light';
            document.documentElement.setAttribute('data-theme', t);
            this.setIcon($('#btn-theme'), t === 'dark' ? 'sun' : 'moon');
            return t;
        },

        /** 'side' (editor | preview) or 'stack' (editor above preview). */
        layout: function (mode) {
            const m = mode === 'stack' ? 'stack' : 'side';
            const ws = $('#workspace');
            ws.classList.toggle('stack', m === 'stack');
            const btn = $('#btn-layout');
            if (btn) {
                this.setIcon(btn, m === 'stack' ? 'columns-2' : 'rows-2');
                const label = K.i18n.t(m === 'stack' ? 'layoutSide' : 'layoutStack');
                btn.title = label; btn.setAttribute('aria-label', label);
            }
            return m;
        },

        /** Settings pane open / closed. */
        pane: function (open) {
            $('#workspace').classList.toggle('pane-closed', !open);
            const rail = $('#pane-rail');
            if (rail) rail.setAttribute('aria-expanded', open ? 'true' : 'false');
        },

        /** Editor panel open / closed (side layout only). */
        editorPane: function (open) {
            $('#workspace').classList.toggle('editor-closed', !open);
            const rail = $('#editor-rail');
            if (rail) rail.setAttribute('aria-expanded', open ? 'true' : 'false');
        },

        busy: function (btn, on) {
            if (!btn) return;
            btn.classList.toggle('busy', !!on);
            btn.disabled = !!on;
        },

        /** Save a Blob (or text) as a file. */
        download: function (data, mime, filename) {
            const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        },

        /** "<stem>.<ext>" — the stem from the name box (Kelk.names). */
        fileName: function (ext) {
            return K.names.stem() + '.' + ext;
        },

        dialog: function (id, open) {
            const dlg = $(id);
            if (!dlg) return;
            if (open === false || (open === undefined && dlg.open)) dlg.close();
            else if (!dlg.open) dlg.showModal();
        },

        help: function (open) { this.dialog('#help', open); }
    };
})(window.Kelk = window.Kelk || {});
