/**
 * Kelk.importer — the ONE way content enters the editor from outside:
 *   .md / .txt        as is (images it carries as data URIs go back to the image store)
 *   .zip              its documents, in name order, and its images (JSZip, loaded on the first .zip)
 *   .html / .htm      MarkdownImporter.fromHtml
 *   .docx             MarkdownImporter.fromDocx (mammoth)
 *   .pdf              PdfImporter (PDF.js, loaded on the first .pdf) → HTML → MarkdownImporter
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
            labels: labels()
        });
    }

    /** The words the importer writes into the text (nested-table references), in the interface's language. */
    function labels() {
        return { table: K.i18n.t('tableLabel') };
    }

    function ext(name) { const m = /\.[^.]+$/.exec(name || ''); return m ? m[0].toLowerCase() : ''; }

    function readText(file) { return file.text ? file.text() : new Response(file).text(); }
    function readBuffer(file) { return file.arrayBuffer ? file.arrayBuffer() : new Response(file).arrayBuffer(); }

    /** Natural order of names: «a2» before «a10», letters by the locale. */
    function byName(a, b) { return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }); }

    /** A file name as Markdown text (its marks escaped: «my_file.md» stays as written). */
    function mdText(name) { return String(name).replace(/([\\`*_\[\]<>#|~])/g, '\\$1'); }

    /**
     * Several documents → one text, each after the separator of Settings → App (ui.importer.separator):
     *   name  (default) a blank paragraph, the file's name, a rule, a blank paragraph — the first file
     *         without the blank paragraph above it
     *   rule  a rule between two files     none  a blank line
     */
    function join(parts) {
        const kind = K.store.getUi('importer.separator') || 'name';
        return parts.map(function (p, i) {
            const md = p.md.replace(/^\s+|\s+$/g, '');
            if (kind === 'none') return md;
            if (kind === 'rule') return i ? '---\n\n' + md : md;
            return (i ? '&nbsp;\n\n' : '') + mdText(p.name) + '\n\n---\n\n&nbsp;\n\n' + md;
        }).join('\n\n') + '\n';
    }

    /** A zip's documents (into docs) and images (into pics, by their path). */
    async function unzip(file, docs, pics, t, maxMB) {
        t.label(K.i18n.t('taskZip', file.name));
        await K.libs.need('jszip');                  // loaded on the first .zip
        const zip = await JSZip.loadAsync(await readBuffer(file));
        const X = K.config.extensions, known = [].concat(X.markdown, X.html, X.docx, X.pdf);
        const entries = Object.keys(zip.files).map(function (k) { return zip.files[k]; })
            .filter(function (e) { return !e.dir && !/(^|\/)(__MACOSX|\.)/.test(e.name); });
        for (const e of entries) {
            if (t.signal.aborted) return;
            const x = ext(e.name), base = e.name.split('/').pop();
            const size = e._data && e._data.uncompressedSize;
            if (size > maxMB * 1024 * 1024) { K.ui.toast(K.i18n.t('tooLarge', maxMB) + ': ' + e.name, 'error'); continue; }
            if (/^\.(png|jpe?g|gif|webp|svg|bmp)$/.test(x)) {
                const type = x === '.svg' ? 'image/svg+xml' : 'image/' + x.slice(1).replace('jpg', 'jpeg');
                pics[e.name] = new File([await e.async('blob')], base, { type: type });
            } else if (known.indexOf(x) >= 0) {
                docs.push({ name: base, path: e.name, file: new File([await e.async('blob')], base) });
            }
        }
    }

    /**
     * Images a document names that a zip carries: registered under the name as the text writes it
     * (relative to the document's own folder), so the text stays as it is and the preview finds them.
     */
    async function placeImages(md, path, pics) {
        if (!Object.keys(pics).length) return md;
        const dir = path.indexOf('/') >= 0 ? path.slice(0, path.lastIndexOf('/') + 1) : '';
        const norm = function (p) {
            const out = [];
            p.split('/').forEach(function (seg) { if (seg === '..') out.pop(); else if (seg && seg !== '.') out.push(seg); });
            return out.join('/');
        };
        const re = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
        let m;
        while ((m = re.exec(md))) {
            let src = m[1];
            if (/^(data:|https?:|blob:)/i.test(src) || K.images.get(src)) continue;
            let dec = src; try { dec = decodeURIComponent(src); } catch (e) { /* keep */ }
            const hit = pics[norm(dir + dec)] || pics[norm(dec)];
            if (hit) { try { await K.images.addAs(dec, hit); } catch (e) { K.ui.toast(K.i18n.t('failed', e.message), 'warn'); } }
        }
        return md;
    }

    /**
     * Images a Markdown file carries in itself — reference definitions with data URIs at its end, as
     * Kelk's MD export writes them («[name]: data:image/png;base64,…») — go back to the image store and
     * the text names them by a short name again: ![alt][name] → ![alt](name).
     */
    async function takeDataImages(md) {
        const defs = {};
        md = md.replace(/^ {0,3}\[([^\]\n]+)\]:[ \t]*<?(data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+\/=\s]+?)>?[ \t]*(?:"[^"\n]*")?[ \t]*$\n?/gim, function (all, label, uri) {
            defs[label.toLowerCase()] = { label: label, uri: uri.replace(/\s+/g, '') };
            return '';
        });
        const names = {};
        for (const k of Object.keys(defs)) {
            try { names[k] = await K.images.addUri(defs[k].label, defs[k].uri, true); } catch (e) { names[k] = null; }
        }
        return md.replace(/!\[([^\]]*)\]\[([^\]]*)\]/g, function (all, alt, ref) {
            const k = (ref || alt).toLowerCase();
            if (!names[k]) return all;
            return '![' + alt + '](' + names[k] + ')';
        }).replace(/\n{3,}$/, '\n');
    }

    /** One document → { md, converted }; null when its kind is not known. */
    async function convert(file, name, t) {
        const e = ext(name), X = K.config.extensions;
        if (X.markdown.indexOf(e) >= 0) return { md: await takeDataImages(await readText(file)), converted: false };
        if (X.html.indexOf(e) >= 0) return { md: importer().fromHtml(await readText(file)).markdown, converted: true };
        if (X.docx.indexOf(e) >= 0) {
            await K.libs.need('mammoth');            // loaded on the first .docx import
            const r = await importer().fromDocx(await readBuffer(file));
            if (r.messages && r.messages.length) console.info('mammoth:', r.messages);
            return { md: r.markdown, converted: true };
        }
        if (X.pdf.indexOf(e) >= 0) return { md: await fromPdf(file, name, t), converted: true };
        K.ui.toast(K.i18n.t('unsupported', e || name), 'error');
        return null;
    }

    /**
     * PdfImporter's notes (r.notes) → a toast: its message key, written in full (tools/check-i18n.js counts a
     * computed pdf_ key as used only where it is written out), its type, and whether it names pages (pages: the
     * importer's self-diagnosis, r.quality.flags; pageFailed: r.failedPages). An unknown note is not shown.
     */
    const PDF_NOTES = {
        noText: { key: 'pdf_noText', type: 'warn' },
        figureFailed: { key: 'pdf_figureFailed', type: 'warn' },
        pageLimit: { key: 'pdf_pageLimit', type: 'warn' },
        printNoLinks: { key: 'pdf_printNoLinks', type: 'info' },
        ocrLayer: { key: 'pdf_ocrLayer', type: 'info' },
        pageFailed: { key: 'pdf_pageFailed', type: 'warn' },
        lostGlyphs: { key: 'pdf_lostGlyphs', type: 'warn', pages: true },
        suspectSpaces: { key: 'pdf_suspectSpaces', type: 'warn', pages: true },
        textInPictures: { key: 'pdf_textInPictures', type: 'warn', pages: true }
    };
    /** PdfImporter's errors with a message of their own (err.code); others show the error's text. */
    const PDF_ERRORS = { password: 'pdf_password', invalid: 'pdf_invalid' };
    const own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

    /** A PDF → Markdown, page by page on the task's bar; Cancel stops it at the next page. */
    async function fromPdf(file, name, t) {
        await K.libs.need('pdfjs');                  // loaded on the first .pdf import
        const o = K.store.getUi('importer'), base = name.replace(/\.[^.]+$/, '');
        // the import's messages come once, at its end (K.ui.batch), and its pictures are stored once
        return K.ui.batch(async function () {
            K.images.hold();
            try {
                const r = await PdfImporter.create({
                    images: o.images === 'drop' ? 'drop' : 'markdown',
                    asciiNumbers: o.asciiNumbers !== false, persianLetters: o.persianLetters !== false,
                    markdownImporter: { nestedTables: o.nestedTables, images: o.images, labels: labels() },
                    wasmBase: 'vendor/pdfjs/wasm/',
                    loadScript: K.ui.loadScript,
                    signal: t.signal,
                    // a Kelk PDF with emoji: their PUA map lives in the emoji font file (loaded only then)
                    loadEmojiMap: async function () {
                        const src = K.config.pdfFonts && K.config.pdfFonts['Noto Emoji'];
                        if (!src) return null;
                        await K.ui.loadScript(src);
                        return window.PdfFonts && window.PdfFonts.notoemoji && window.PdfFonts.notoemoji.emoji;
                    },
                    // figures and formulas become registered images (short names, not data URIs in the text)
                    onImage: async function (uri, at) {
                        try {
                            const blob = await (await fetch(uri)).blob();
                            return await K.images.add(new File([blob], base + '-p' + at.page + '-' + at.index + '.png', { type: 'image/png' }));
                        } catch (err) { return uri; }
                    }
                }).fromArrayBuffer(await readBuffer(file), {
                    onProgress: function (i, n) { t.progress(i, n, K.i18n.t('taskPage', i, n)); }
                });
                (r.notes || []).forEach(function (n) {
                    if (!own(PDF_NOTES, n)) return;
                    const note = PDF_NOTES[n];
                    const pages = n === 'pageFailed' ? r.failedPages : note.pages ? r.quality && r.quality.flags[n] : null;
                    K.ui.toast(K.i18n.t(note.key, pages ? K.ui.pageList(pages) : ''), note.type);
                });
                if (r.messages && r.messages.length) console.info('PdfImporter:', r.messages);
                return r.markdown;
            } finally { K.images.flush(); }
        });
    }

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

        /** A File from the file picker or a drop (one file: Kelk.importer.fromFiles). */
        fromFile: function (file) { return this.fromFiles(file ? [file] : []); },

        /**
         * Files from the picker or a drop — one or many, a .zip among them — into the editor as ONE document:
         * in name order (numbers in numeric order: «2» before «10»), each after the separator of Settings → App
         * (its name and a rule — the default —, a rule, or a blank line). A zip is opened (JSZip, loaded on the
         * first one) and its md, txt, html, docx and pdf files imported; its images are registered under the paths
         * the text gives them, relative to the file that names them. The page waits in a dialog with a progress
         * bar (Kelk.ui.task): Cancel stops the import, and the text stays as it was.
         */
        fromFiles: async function (files) {
            files = Array.from(files || []).filter(Boolean);
            if (!files.length) return;
            const maxMB = +K.store.getUi('importer.maxMB') || K.config.maxFileMB;
            const big = files.filter(function (f) { return f.size > maxMB * 1024 * 1024; });
            big.forEach(function (f) { K.ui.toast(K.i18n.t('tooLarge', maxMB) + ': ' + f.name, 'error'); });
            files = files.filter(function (f) { return big.indexOf(f) < 0; });
            if (!files.length) return;
            const first = files.length === 1 ? files[0].name : files.map(function (f) { return f.name; }).sort(byName)[0];
            let parts;
            try {
                parts = await K.ui.task(K.i18n.t(files.length === 1 && ext(first) !== '.zip' ? 'taskImport' : 'taskZip', first), async function (t) {
                    // the documents and the images, a zip opened in place
                    const docs = [], pics = {};
                    for (const f of files) {
                        if (ext(f.name) === '.zip') await unzip(f, docs, pics, t, maxMB);
                        else if (K.images.isImage(f)) continue;
                        else docs.push({ name: f.name, path: f.name, file: f });
                    }
                    docs.sort(function (x, y) { return byName(x.path, y.path); });
                    if (!docs.length) { K.ui.toast(K.i18n.t('zipEmpty'), 'warn'); return null; }
                    const out = [];
                    for (let i = 0; i < docs.length; i++) {
                        const d = docs[i];
                        t.label(docs.length > 1 ? K.i18n.t('taskImportN', d.name, i + 1, docs.length) : K.i18n.t('taskImport', d.name));
                        t.progress(0, 0, '');
                        const r = await convert(d.file, d.name, t);
                        if (r == null) continue;
                        out.push({ name: d.name, md: await placeImages(r.md, d.path, pics), converted: r.converted });
                    }
                    return out;
                });
            } catch (err) {
                if (err && err.code === 'aborted') { K.ui.toast(K.i18n.t('cancelled')); return; }
                console.error(err);
                if (err && own(PDF_ERRORS, err.code)) K.ui.toast(K.i18n.t(PDF_ERRORS[err.code]), 'error');
                else K.ui.toast(K.i18n.t('failed', err && err.message || ''), 'error');
                return;
            }
            if (!parts || !parts.length) return;
            const md = parts.length === 1 ? parts[0].md : join(parts);
            // the name: the file's (one), the zip's (one zip), else the first file's in name order
            const name = files.length === 1 ? files[0].name : parts[0].name;
            K.names.setSource(name);
            K.editor.set(md, name);
            K.editor.markConverted(parts.some(function (p) { return p.converted; }));
            K.ui.toast(parts.length > 1 ? K.i18n.t('loadedN', parts.length) : K.i18n.t('loaded', name));
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
