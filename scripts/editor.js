/**
 * Kelk.editor — the Markdown text area: stats, autosave, Tab indent, drag &
 * drop and paste (files and rich text go to Kelk.importer, images to
 * Kelk.images), the MD button state and scroll sync with the preview.
 */
(function (K) {
    'use strict';

    let area, fileName = '', storageWarned = false;

    /**
     * Undo / redo of the text, kept here because the browser's own undo stops
     * at the first programmatic change (sample, import, clear, rich paste, Tab
     * indent): every change — typed or not — is one history. Typing is grouped
     * (a pause, a new line or a word boundary after a while closes a step); a
     * programmatic change is a step of its own. Memory only (not saved), at
     * most LIMIT steps and about CHARS characters in all, oldest dropped first.
     */
    const history = { steps: [], at: -1, timer: 0 };
    const LIMIT = 200, CHARS = 20e6;
    function snapshot() { return { text: area.value, s: area.selectionStart, e: area.selectionEnd, name: fileName }; }
    function record() {
        clearTimeout(history.timer); history.timer = 0;
        const cur = history.steps[history.at];
        if (cur && cur.text === area.value) { cur.s = area.selectionStart; cur.e = area.selectionEnd; cur.name = fileName; return; }
        history.steps.length = history.at + 1;                    // a new change drops the redo steps
        history.steps.push(snapshot());
        let total = history.steps.reduce(function (n, x) { return n + x.text.length; }, 0);
        while (history.steps.length > 1 && (history.steps.length > LIMIT || total > CHARS)) total -= history.steps.shift().text.length;
        history.at = history.steps.length - 1;
        undoButtons();
    }
    /** Typing: a step closes after a pause. */
    function recordLater() { clearTimeout(history.timer); history.timer = setTimeout(record, 600); undoButtons(true); }
    function undoButtons(pending) {
        const u = K.$('#btn-undo'), r = K.$('#btn-redo');
        if (u) u.disabled = !(history.at > 0 || pending || (history.timer && history.steps[history.at] && history.steps[history.at].text !== area.value));
        if (r) r.disabled = !!history.timer || history.at >= history.steps.length - 1;
    }
    function restore(st) {
        area.value = st.text;
        fileName = st.name || '';
        area.focus();
        area.setSelectionRange(Math.min(st.s, st.text.length), Math.min(st.e, st.text.length));
        persist(st.text);
        K.images.prune(st.text);
        K.editor.stats();
        K.preview.render();
        undoButtons();
    }

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
            area.addEventListener('input', function (e) {
                K.editor.stats(); save(); render();
                // a programmatic change (insert, indent) records itself; typing is grouped
                if (K.editor._quiet) return;
                if (/^(insertFromPaste|insertFromDrop|deleteByCut|deleteByDrag)$/.test(e.inputType || '')) record();
                else recordLater();
            });
            // Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z: this history, not the browser's
            area.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { if (history.timer) record(); return; }   // a new line closes a typing step
                if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
                const k = e.key.toLowerCase();
                if (k === 'z' && !e.shiftKey) { e.preventDefault(); K.editor.undo(); }
                else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); K.editor.redo(); }
            });
            area.addEventListener('beforeinput', function (e) {          // the browser's own undo (menu, gestures)
                if (e.inputType === 'historyUndo') { e.preventDefault(); K.editor.undo(); }
                else if (e.inputType === 'historyRedo') { e.preventDefault(); K.editor.redo(); }
            });

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
            area.addEventListener('cut', function () { record(); });
            area.addEventListener('paste', function (e) {
                record();                                    // a paste is a step of its own
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
            record();                                        // the text the page opened with
        },

        /** One step back / forward in the text's history (typing in progress closes first). */
        undo: function () {
            if (history.timer) record();
            if (history.at <= 0) return;
            history.at--;
            restore(history.steps[history.at]);
        },
        redo: function () {
            if (history.timer) record();
            if (history.at >= history.steps.length - 1) return;
            history.at++;
            restore(history.steps[history.at]);
        },

        value: function () { return area ? area.value : ''; },

        /** Replace the whole text (import, sample, clear). */
        set: function (text, name) {
            record();                                        // typing in progress: its own step first
            area.value = text;
            fileName = name || '';
            persist(text);
            K.images.prune(text);
            this.stats();
            K.preview.render();
            record();
        },

        /** Insert at the cursor (paste, images). */
        insert: function (text) {
            area.focus();
            record();
            const s = area.selectionStart, e = area.selectionEnd;
            area.setRangeText(text, s, e, 'end');
            this._change();
        },

        /** A programmatic edit happened: redraw and save, as one history step. */
        _change: function () {
            this._quiet = true;
            try { area.dispatchEvent(new Event('input')); } finally { this._quiet = false; }
            record();
        },

        indent: function (out) {
            record();
            const v = area.value, s = area.selectionStart, e = area.selectionEnd;
            const ls = v.lastIndexOf('\n', s - 1) + 1;
            const block = v.slice(ls, e);
            const next = out ? block.replace(/^( {1,4}|\t)/gm, '') : block.replace(/^/gm, '    ');
            area.setRangeText(next, ls, e, 'select');
            if (s === e && !out) area.setSelectionRange(s + 4, s + 4);
            this._change();
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
            K.$('#st-file-name').title = fileName;
        }
    };
})(window.Kelk = window.Kelk || {});
