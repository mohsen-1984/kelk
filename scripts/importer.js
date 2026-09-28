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

        /** "Paste" button: rich text when the clipboard has it, else plain. */
        fromClipboardButton: async function () {
            try {
                if (navigator.clipboard && navigator.clipboard.read) {
                    const items = await navigator.clipboard.read();
                    for (const it of items) {
                        if (it.types.indexOf('text/html') >= 0 && K.store.getUi('importer.richPaste')) {
                            const html = await (await it.getType('text/html')).text();
                            if (MarkdownImporter.isRich(html)) {
                                K.editor.insert(importer().fromHtml(html).markdown);
                                K.editor.markConverted(true);
                                K.ui.toast(K.i18n.t('imported'));
                                return;
                            }
                        }
                    }
                }
                const text = await navigator.clipboard.readText();
                if (text) K.editor.insert(text);
            } catch (e) {
                K.ui.toast(K.i18n.t('failed', e.message), 'error');
            }
        }
    };
})(window.Kelk = window.Kelk || {});
