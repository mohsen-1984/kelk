/**
 * Kelk.editor — the Markdown text area: stats, autosave, Tab indent, drag &
 * drop and paste (files and rich text go to Kelk.importer, images to
 * Kelk.images), the MD button state and scroll sync with the preview.
 */
(function (K) {
    'use strict';

    let area, fileName = '', storageWarned = false;

    function debounce(fn, ms) {
        let t = null;
        return function () { clearTimeout(t); t = setTimeout(fn, ms); };
    }

    /** Save; warn once when the browser refuses (storage full), again after a success. */
    function persist(text) {
        if (K.store.saveContent(text)) { storageWarned = false; return; }
        if (!storageWarned) { storageWarned = true; K.ui.toast(K.i18n.t('storageFull'), 'warn'); }
    }

    /** Images dropped or pasted: register and insert ![name](name). */
    async function insertImages(files) {
        const out = [];
        for (const f of files) {
            try { const name = await K.images.add(f); out.push('![' + name + '](' + name + ')'); K.ui.toast(K.i18n.t('imageAdded', name)); }
            catch (e) { K.ui.toast(K.i18n.t('failed', e.message), 'error'); }
        }
        if (!out.length) return;
        // an image is a paragraph of its own: blank lines around it unless already there
        const v = area.value, at = area.selectionStart, end = area.selectionEnd;
        const before = v.slice(0, at), after = v.slice(end);
        const pre = !before || /\n\n$/.test(before) ? '' : (/\n$/.test(before) ? '\n' : '\n\n');
        const post = !after || /^\n\n/.test(after) ? '' : (/^\n/.test(after) ? '\n' : '\n\n');
        K.editor.insert(pre + out.join('\n\n') + post);
    }

    /** Proportional scroll sync editor ↔ preview (side layout, both visible). */
    function scrollSync(preview) {
        let from = null;
        function active() {
            const ws = K.$('#workspace');
            return K.store.getUi('scrollSync') && !ws.classList.contains('stack') && !ws.classList.contains('editor-closed');
        }
        function follow(src, dst) {
            if (!active() || from === dst) return;
            const max = src.scrollHeight - src.clientHeight;
            if (max <= 0) return;
            from = src;
            dst.scrollTop = (src.scrollTop / max) * (dst.scrollHeight - dst.clientHeight);
            requestAnimationFrame(function () { requestAnimationFrame(function () { from = null; }); });
        }
        area.addEventListener('scroll', function () { follow(area, preview); }, { passive: true });
        preview.addEventListener('scroll', function () { follow(preview, area); }, { passive: true });
    }

    K.editor = {
        init: function () {
            area = K.$('#editor');
            area.value = K.store.content();
            const save = debounce(function () { persist(area.value); }, K.config.autosaveMs);
            const render = debounce(function () { K.preview.render(); }, K.config.renderMs);
            area.addEventListener('input', function () { K.editor.stats(); save(); render(); });

            // Tab / Shift+Tab: indent / outdent the selected lines
            area.addEventListener('keydown', function (e) {
                if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey) return;
                e.preventDefault();
                K.editor.indent(e.shiftKey);
            });

            // paste: images → registered; rich text (Word, web) → Markdown, unless Shift is held
            let shift = false;
            document.addEventListener('keydown', function (e) { if (e.key === 'Shift') shift = true; });
            document.addEventListener('keyup', function (e) { if (e.key === 'Shift') shift = false; });
            window.addEventListener('blur', function () { shift = false; });
            area.addEventListener('paste', function (e) {
                const dt = e.clipboardData;
                const imgs = dt ? Array.from(dt.files || []).filter(K.images.isImage) : [];
                if (imgs.length && !(dt.getData('text/html') || '').trim()) {
                    e.preventDefault();
                    insertImages(imgs);
                    return;
                }
                if (shift || !K.store.getUi('importer.richPaste')) return;
                const md = K.importer.fromPaste(dt);
                if (md == null) return;                      // plain text: the browser pastes it
                e.preventDefault();
                K.editor.insert(md);
                K.editor.markConverted(true);
                K.ui.toast(K.i18n.t('imported'));
            });

            // drag & drop: an image → inserted; any other file → imported
            const wrap = K.$('.editor-wrap');
            ['dragenter', 'dragover'].forEach(function (ev) {
                wrap.addEventListener(ev, function (e) {
                    if (!e.dataTransfer || Array.from(e.dataTransfer.types || []).indexOf('Files') < 0) return;
                    e.preventDefault();
                    wrap.classList.add('dragging');
                });
            });
            ['dragleave', 'drop'].forEach(function (ev) {
                wrap.addEventListener(ev, function () { wrap.classList.remove('dragging'); });
            });
            wrap.addEventListener('drop', function (e) {
                const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
                if (!files.length) return;
                e.preventDefault();
                const imgs = files.filter(K.images.isImage);
                if (imgs.length) insertImages(imgs);
                else K.importer.fromFile(files[0]);
            });

            scrollSync(K.$('.preview-scroll'));
            this.stats();
        },

        value: function () { return area ? area.value : ''; },

        /** Replace the whole text (import, sample, clear). */
        set: function (text, name) {
            area.value = text;
            fileName = name || '';
            persist(text);
            K.images.prune(text);
            this.stats();
            K.preview.render();
        },

        /** Insert at the cursor (paste, images). */
        insert: function (text) {
            area.focus();
            const s = area.selectionStart, e = area.selectionEnd;
            area.setRangeText(text, s, e, 'end');
            area.dispatchEvent(new Event('input'));
        },

        indent: function (out) {
            const v = area.value, s = area.selectionStart, e = area.selectionEnd;
            const ls = v.lastIndexOf('\n', s - 1) + 1;
            const block = v.slice(ls, e);
            const next = out ? block.replace(/^( {1,4}|\t)/gm, '') : block.replace(/^/gm, '    ');
            area.setRangeText(next, ls, e, 'select');
            if (s === e && !out) area.setSelectionRange(s + 4, s + 4);
            area.dispatchEvent(new Event('input'));
        },

        /**
         * The text came from a conversion (Word, HTML, rich paste): the MD
         * button turns primary until the Markdown is saved or replaced.
         */
        markConverted: function (on) {
            const b = K.$('#btn-md');
            if (!b) return;
            b.classList.toggle('primary', !!on);
            b.classList.toggle('soft', !on);
        },

        stats: function () {
            const v = this.value();
            const words = (v.match(/[^\s#*_>`\-|[\]()!]+/g) || []).length;
            const bytes = new Blob([v]).size;
            K.$('#st-words').textContent = words.toLocaleString('en-US');
            K.$('#st-chars').textContent = v.length.toLocaleString('en-US');
            K.$('#st-size').textContent = (bytes / 1024).toFixed(1) + ' KB';
            const f = K.$('#st-file');
            f.hidden = !fileName;
            K.$('#st-file-name').textContent = fileName;
        }
    };
})(window.Kelk = window.Kelk || {});
