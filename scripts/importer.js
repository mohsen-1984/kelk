/**
 * Kelk.importer — the ONE way content enters the editor from outside:
 *   .md / .txt        as is
 *   .html / .htm      MarkdownImporter.fromHtml
 *   .docx             MarkdownImporter.fromDocx (mammoth)
 *   rich paste        MarkdownImporter.fromHtml (Word, web pages)
 * Cleaning, sanitizing and nested-table handling happen once, inside
 * MarkdownImporter (lib/), with the options of Settings → Import.
 */
(function (K) {
    'use strict';

    function importer() {
        const o = K.store.getUi('importer');
        return MarkdownImporter.create({
            nestedTables: o.nestedTables,
            images: o.images,
            labels: { table: K.i18n.lang === 'fa' ? 'جدول' : 'Table' }
        });
    }

    function ext(name) { const m = /\.[^.]+$/.exec(name || ''); return m ? m[0].toLowerCase() : ''; }

    function readText(file) { return file.text ? file.text() : new Response(file).text(); }
    function readBuffer(file) { return file.arrayBuffer ? file.arrayBuffer() : new Response(file).arrayBuffer(); }

    K.importer = {
        /** Paste event data → Markdown, or null to let a plain-text paste happen. */
        fromPaste: function (dt) {
            const html = dt && dt.getData('text/html');
            if (!html || !MarkdownImporter.isRich(html)) return null;
            try {
                return importer().fromHtml(html).markdown;
            } catch (e) {
                console.error(e);
                return null;                                 // fall back to the browser's plain paste
            }
        },

        /** A File from the file picker or a drop. */
        fromFile: async function (file) {
            if (!file) return;
            const e = ext(file.name), X = K.config.extensions;
            if (file.size > K.config.maxFileMB * 1024 * 1024) { K.ui.toast(K.i18n.t('tooLarge', K.config.maxFileMB), 'error'); return; }
            try {
                let md, converted = true;
                if (X.markdown.indexOf(e) >= 0) { md = await readText(file); converted = false; }
                else if (X.html.indexOf(e) >= 0) md = importer().fromHtml(await readText(file)).markdown;
                else if (X.docx.indexOf(e) >= 0) {
                    await K.libs.need('mammoth');            // loaded on the first .docx import
                    const r = await importer().fromDocx(await readBuffer(file));
                    md = r.markdown;
                    if (r.messages && r.messages.length) console.info('mammoth:', r.messages);
                } else { K.ui.toast(K.i18n.t('unsupported', e || file.name), 'error'); return; }
                K.names.setSource(file.name);
                K.editor.set(md, file.name);
                K.editor.markConverted(converted);
                K.ui.toast(K.i18n.t('loaded', file.name));
            } catch (err) {
                console.error(err);
                K.ui.toast(K.i18n.t('failed', err.message), 'error');
            }
        },

        /**
         * The Paste button (o.replace: the Clear & paste button — the clipboard
         * becomes the document). One clipboard call where it works: every read /
         * readText is a separate browser prompt (Firefox's "Paste" menu, Chrome's
         * paste bubble), so the HTML, the plain text and an image all come from
         * the same read(). Mobile browsers (Chrome and Opera on Android) often
         * refuse read() — or give items whose types cannot be read — while
         * readText() works: then the plain text. When neither works the editor
         * gets the focus and a hint: the system's own paste (long press, Ctrl+V)
         * always works and takes the rich-paste path.
         */
        fromClipboardButton: async function (o) {
            const replace = !!(o && o.replace);
            const clear = function () { if (replace) { K.names.reset(); K.editor.set('', ''); K.editor.markConverted(false); } };
            const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
            const blocked = function () {
                K.$('#editor').focus();
                K.ui.toast(K.i18n.t('pasteBlocked'), 'warn');
            };
            const getText = async function (it, type) {
                try { return await (await it.getType(type)).text(); } catch (e) { return ''; }
            };
            let html = '', text = '', image = null, readFailed = null;
            if (navigator.clipboard && navigator.clipboard.read) {
                try {
                    const items = await navigator.clipboard.read();
                    for (const it of items) {
                        const types = Array.from(it.types || []);
                        if (!html && types.indexOf('text/html') >= 0) html = await getText(it, 'text/html');
                        if (!text && types.indexOf('text/plain') >= 0) text = await getText(it, 'text/plain');
                        if (!image) {
                            const t = types.find(function (x) { return /^image\//.test(x); });
                            if (t) { try { const blob = await it.getType(t); image = new File([blob], 'image.' + t.split('/')[1], { type: t }); } catch (e) { /* unreadable */ } }
                        }
                    }
                } catch (e) { readFailed = e; }
                // the user declined the prompt on a desktop browser: nothing more to ask
                if (readFailed && readFailed.name === 'NotAllowedError' && !coarse) return;
            }
            // no read(), read() refused, or nothing readable in it: the plain text
            if (!html && !text && !image && navigator.clipboard && navigator.clipboard.readText) {
                try { text = await navigator.clipboard.readText(); } catch (e) { if (!readFailed) readFailed = e; }
            }
            try {
                if (html && K.store.getUi('importer.richPaste') && MarkdownImporter.isRich(html)) {
                    const md = importer().fromHtml(html).markdown;
                    clear();
                    K.editor.insert(md);
                    K.editor.markConverted(true);
                    K.ui.toast(K.i18n.t('imported'));
                } else if (text) {
                    clear();
                    K.editor.insert(text);
                } else if (image) {
                    clear();
                    const name = await K.images.add(image);
                    K.editor.insert('![' + name + '](' + name + ')');
                    K.ui.toast(K.i18n.t('imageAdded', name));
                } else if (readFailed || !navigator.clipboard || (!navigator.clipboard.read && !navigator.clipboard.readText)) {
                    blocked();
                }
            } catch (e) {
                K.ui.toast(K.i18n.t('failed', e.message), 'error');
            }
        }
    };
})(window.Kelk = window.Kelk || {});
