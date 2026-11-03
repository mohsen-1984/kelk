/**
 * Kelk.importer — the ONE way content enters the editor from outside:
 *   .md / .txt        as is (images it carries as data URIs go back to the image store)
 *   .zip              its documents, in the order chosen (Kelk.ui.order; name order by default),
 *                     and its images (JSZip, loaded on the first .zip)
 *   .html / .htm      MarkdownImporter.fromHtml
 *   .docx             MarkdownImporter.fromDocx (mammoth)
 *   .pdf              PdfImporter (it and PDF.js loaded on the first .pdf) → HTML → MarkdownImporter
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

    /** A zip's documents (into docs), its images (into pics, by their path) and what cannot come in (into skipped). */
    async function unzip(file, docs, pics, skipped, t, maxMB) {
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
            const image = /^\.(png|jpe?g|gif|webp|svg|bmp)$/.test(x);
            if (!image && known.indexOf(x) < 0) { skipped.push({ name: base, path: e.name, size: size, reason: 'type' }); continue; }
            if (size > maxMB * 1024 * 1024) { skipped.push({ name: base, path: e.name, size: size, reason: 'size' }); continue; }
            if (image) {
                const type = x === '.svg' ? 'image/svg+xml' : 'image/' + x.slice(1).replace('jpg', 'jpeg');
                pics[e.name] = new File([await e.async('blob')], base, { type: type });
            } else {
                docs.push({ name: base, path: e.name, size: size, file: new File([await e.async('blob')], base) });
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

    /** One document → { md, converted } (a PDF: and report, bytes); null when its kind is not known. */
    async function convert(file, name, t, o) {
        const e = ext(name), X = K.config.extensions;
        if (X.markdown.indexOf(e) >= 0) return { md: await takeDataImages(await readText(file)), converted: false };
        if (X.html.indexOf(e) >= 0) return { md: importer().fromHtml(await readText(file)).markdown, converted: true };
        if (X.docx.indexOf(e) >= 0) {
            await K.libs.need('mammoth');            // loaded on the first .docx import
            const r = await importer().fromDocx(await readBuffer(file));
            if (r.messages && r.messages.length) console.info('mammoth:', r.messages);
            return { md: r.markdown, converted: true };
        }
        if (X.pdf.indexOf(e) >= 0) return Object.assign({ converted: true }, await fromPdf(file, name, t, o));
        K.ui.toast(K.i18n.t('unsupported', e || name), 'error');
        return null;
    }

    /** PdfImporter's errors with a message of their own (err.code); others show the error's text. */
    const PDF_ERRORS = { password: 'pdf_password', invalid: 'pdf_invalid' };
    const own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

    /**
     * A PDF → { md, report, bytes }, page by page on the task's bar; Cancel stops it at the next page. report: what
     * the import could not read in full (Kelk.importReport.fromResult — shown by Kelk.ui.report once the text is
     * in, not as toasts); bytes: a copy of the file for "Re-import in safe mode" (pdf.js may take the buffer it
     * reads), only with o.keepBytes (a PDF imported on its own: the one case with that button), else null.
     * o.mode: PdfImporter's mode ('safe': headings and paragraphs only; default its own, 'auto').
     */
    async function fromPdf(file, name, t, o) {
        const mode = o && o.mode;
        await K.libs.need('pdfjs');                  // loaded on the first .pdf import
        await K.libs.need('pdfimport');              // PdfImporter and its parts, after pdf.js (as its header says)
        const set = K.store.getUi('importer'), base = name.replace(/\.[^.]+$/, '');
        const buf = await readBuffer(file), bytes = o && o.keepBytes ? new Uint8Array(buf.slice(0)) : null;
        // the import's messages come once, at its end (K.ui.batch), and its pictures are stored once
        return K.ui.batch(async function () {
            K.images.hold();
            try {
                const opts = {
                    images: set.images === 'drop' ? 'drop' : 'markdown',
                    asciiNumbers: set.asciiNumbers !== false, persianLetters: set.persianLetters !== false,
                    markdownImporter: { nestedTables: set.nestedTables, images: set.images, labels: labels() },
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
                };
                const hooks = { onProgress: function (i, n) { t.progress(i, n, K.i18n.t('taskPage', i, n)); } };
                if (mode) opts.mode = hooks.mode = mode;
                const r = await PdfImporter.create(opts).fromArrayBuffer(buf, hooks);
                if (r.messages && r.messages.length) console.info('PdfImporter:', r.messages);
                return { md: r.markdown, report: K.importReport.fromResult(r), bytes: bytes };
            } finally { K.images.flush(); }
        });
    }

    /** "Re-import in safe mode" of a PDF imported on its own: the action, the only holder of the file's bytes */
    function safeAction(bytes, name) {
        return function () {
            const b = bytes; bytes = null;
            return b ? K.importer.fromFiles([new File([b], name, { type: 'application/pdf' })], { mode: 'safe' }) : undefined;
        };
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
         * in name order (numbers in numeric order: «2» before «10») unless the order dialog (Kelk.ui.order —
         * shown for several documents, or when files were left out) changes it, each after the separator of Settings → App
         * (its name and a rule — the default —, a rule, or a blank line). A zip is opened (JSZip, loaded on the
         * first one) and its md, txt, html, docx and pdf files imported; its images are registered under the paths
         * the text gives them, relative to the file that names them. The page waits in a dialog with a progress
         * bar (Kelk.ui.task): Cancel stops the import, and the text stays as it was.
         * Once the text is in, the PDFs' reports (Kelk.ui.report): the panel opens when a PDF was not read in full,
         * and a clean import closes an older one. One PDF on its own can be re-imported in safe mode from there:
         * its bytes are copied for that import only, kept while its panel is open, and let go when the panel
         * closes, when nothing was worth a panel, and when the next import starts. o.mode: the PDF importer's mode
         * ('safe').
         */
        fromFiles: async function (files, o) {
            files = Array.from(files || []).filter(Boolean);
            if (!files.length) return;
            K.ui.report.release();                           // the last report's kept bytes go now
            const keepBytes = files.length === 1 && K.config.extensions.pdf.indexOf(ext(files[0].name)) >= 0;
            const co = Object.assign({}, o, { keepBytes: keepBytes });
            const maxMB = +K.store.getUi('importer.maxMB') || K.config.maxFileMB;
            const big = files.filter(function (f) { return f.size > maxMB * 1024 * 1024; });
            big.forEach(function (f) { K.ui.toast(K.i18n.t('tooLarge', maxMB) + ': ' + f.name, 'error'); });
            files = files.filter(function (f) { return big.indexOf(f) < 0; });
            if (!files.length) return;
            const X = K.config.extensions, known = [].concat(X.markdown, X.html, X.docx, X.pdf);
            const first = files.length === 1 ? files[0].name : files.map(function (f) { return f.name; }).sort(byName)[0];
            const zipped = files.some(function (f) { return ext(f.name) === '.zip'; });
            const fail = function (err) {
                if (err && err.code === 'aborted') { K.ui.toast(K.i18n.t('cancelled')); return; }
                console.error(err);
                if (err && own(PDF_ERRORS, err.code)) K.ui.toast(K.i18n.t(PDF_ERRORS[err.code]), 'error');
                else K.ui.toast(K.i18n.t('failed', err && err.message || ''), 'error');
            };
            // 1. the documents, the images and what cannot come in — a zip opened in place
            let set;
            try {
                set = await K.ui.task(K.i18n.t(files.length === 1 && !zipped ? 'taskImport' : 'taskZip', first), async function (t) {
                    const docs = [], pics = {}, skipped = [];
                    for (const f of files) {
                        if (ext(f.name) === '.zip') await unzip(f, docs, pics, skipped, t, maxMB);
                        else if (K.images.isImage(f)) continue;
                        else if (files.length > 1 && known.indexOf(ext(f.name)) < 0) skipped.push({ name: f.name, path: f.name, size: f.size, reason: 'type' });
                        else docs.push({ name: f.name, path: f.name, size: f.size, file: f });
                    }
                    docs.sort(function (x, y) { return byName(x.path, y.path); });
                    skipped.sort(function (x, y) { return byName(x.path, y.path); });
                    return { docs: docs, pics: pics, skipped: skipped };
                });
            } catch (err) { fail(err); return; }
            let docs = set.docs;
            if (!docs.length) { K.ui.toast(K.i18n.t('zipEmpty'), 'warn'); return; }
            // 2. several documents, or files left out: their order and which of them (Kelk.ui.order)
            if (docs.length > 1 || set.skipped.length) {
                docs = await K.ui.order({
                    title: K.i18n.t('orderTitle', files.length === 1 ? files[0].name : first),
                    docs: docs, skipped: set.skipped, images: Object.keys(set.pics).length, maxMB: maxMB
                });
                if (!docs) return;                           // Cancel: the text stays as it was
            }
            // 3. each document → Markdown, in that order
            let parts;
            try {
                parts = await K.ui.task(K.i18n.t('taskImport', docs[0].name), async function (t) {
                    const out = [];
                    for (let i = 0; i < docs.length; i++) {
                        const d = docs[i];
                        t.label(docs.length > 1 ? K.i18n.t('taskImportN', d.name, i + 1, docs.length) : K.i18n.t('taskImport', d.name));
                        t.progress(0, 0, '');
                        const r = await convert(d.file, d.name, t, co);
                        if (r == null) continue;
                        out.push({ name: d.name, md: await placeImages(r.md, d.path, set.pics), converted: r.converted, report: r.report, bytes: r.bytes });
                    }
                    return out;
                });
            } catch (err) { fail(err); return; }
            if (!parts || !parts.length) return;
            const md = parts.length === 1 ? parts[0].md : join(parts);
            // the name: the file's (one), the zip's (one zip), else the first file's in the order chosen
            const name = files.length === 1 ? files[0].name : parts[0].name;
            K.names.setSource(name);
            K.editor.set(md, name);
            K.editor.markConverted(parts.some(function (p) { return p.converted; }));
            K.ui.toast(parts.length > 1 ? K.i18n.t('loadedN', parts.length) : K.i18n.t('loaded', name));
            const reports = parts.filter(function (p) { return p.report; });
            const one = parts.length === 1 && reports.length === 1 ? parts[0] : null;
            // the bytes: held by the safe-mode action only (the panel's), not by parts, the task's promise or this
            // function's scope (safeAction: a closure of its own — one here would share the scope with the task's)
            const onSafe = one && one.bytes ? safeAction(one.bytes, one.name) : null;
            parts.forEach(function (p) { p.bytes = null; });
            K.ui.report(one ? one.report : reports.map(function (p) { return { name: p.name, report: p.report }; }), {
                name: one ? one.name : '',
                onSafe: onSafe
            });
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
