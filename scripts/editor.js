/**
 * Kelk.editor — the Markdown text area: stats, autosave, Tab indent, drag &
 * drop and paste (files and rich text go to Kelk.importer, images to
 * Kelk.images), the MD button state and scroll sync with the preview.
 */
(function (K) {
    'use strict';

    let area, fileName = '', storageWarned = false, saveTimer = 0;

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
    /**
     * Which document the text is: a whole-text replacement (import, sample, clear) starts a new one, typing keeps it,
     * undo and redo go back to the document of their step. What belongs to one document follows it (Kelk.editor.doc():
     * the import report shows while its document is on screen, also after an undo back to it).
     */
    let docSeq = 0, docId = 0;
    function snapshot() { return { text: area.value, s: area.selectionStart, e: area.selectionEnd, name: fileName, doc: docId }; }
    function record() {
        clearTimeout(history.timer); history.timer = 0;
        const cur = history.steps[history.at];
        if (cur && cur.text === area.value) { cur.s = area.selectionStart; cur.e = area.selectionEnd; cur.name = fileName; cur.doc = docId; return; }
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
        docId = st.doc || 0;
        area.focus();
        area.setSelectionRange(Math.min(st.s, st.text.length), Math.min(st.e, st.text.length));
        persist(st.text);
        K.images.prune(st.text);
        K.editor.stats();
        K.preview.render();
        undoButtons();
        area.dispatchEvent(new CustomEvent('kelk:replaced'));   // the whole text changed (the page's sample hint …)
    }

    /** Autosave after a pause in typing; saveNow() writes a pending one at once (the page hides or closes). */
    function saveLater() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, K.config.autosaveMs); }
    function saveNow() { if (!saveTimer) return; clearTimeout(saveTimer); saveTimer = 0; persist(area.value); }

    /** Save; warn once when the browser refuses (storage full), again after a success. */
    function persist(text) {
        clearTimeout(saveTimer); saveTimer = 0;
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

    /**
     * Proportional scroll sync editor ↔ preview (side layout, both visible). The pane the reader is moving —
     * the last one touched by the wheel, a pointer (its scrollbar's thumb too), a finger or the keyboard —
     * leads, and only its scrolling moves the other; the other's own scroll events (the echo of being moved)
     * are ignored. Moved once a frame, not on every event: dragging the preview's scrollbar fast had the two
     * panes answering each other — the thumb shook and the drag lagged behind.
     */
    function scrollSync(preview) {
        let lead = null, raf = 0;
        function active() {
            const ws = K.$('#workspace');
            return K.store.getUi('scrollSync') && !ws.classList.contains('stack') && !ws.classList.contains('editor-closed');
        }
        function apply() {
            raf = 0;
            if (!lead || !active()) return;
            const src = lead, dst = src === area ? preview : area;
            const max = src.scrollHeight - src.clientHeight, dmax = dst.scrollHeight - dst.clientHeight;
            if (max <= 0 || dmax <= 0) return;
            const top = Math.round((src.scrollTop / max) * dmax);
            if (Math.abs(dst.scrollTop - top) >= 1) dst.scrollTop = top;
        }
        [area, preview].forEach(function (el) {
            ['wheel', 'pointerdown', 'touchstart', 'keydown', 'focusin'].forEach(function (ev) {
                el.addEventListener(ev, function () { lead = el; }, { passive: true });
            });
            el.addEventListener('scroll', function () {
                if (lead === null) lead = el;                   // a scroll nobody started here (a find, an anchor): this pane leads
                if (lead !== el) return;                        // the echo of being moved by the other
                if (!raf) raf = requestAnimationFrame(apply);
            }, { passive: true });
        });
    }

    K.editor = {
        init: function () {
            area = K.$('#editor');
            area.value = K.store.content();
            fileName = (area.value && K.store.getUi('sourceName')) || '';      // the imported file's name, after a reload
            area.addEventListener('input', function (e) {
                K.editor.stats(); saveLater(); K.preview.renderSoon();
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
                let pasted = dt ? dt.getData('text/plain') || '' : '';
                // the Excel view: CSV or tab-separated text (not Excel's own cells, which come as an HTML table)
                // becomes a heading and a table, like a CSV import (scripts/sheets.js); Shift pastes it as it is
                const sh = !shift && K.slides && K.slides.view() === 'excel' && window.KelkSheets;
                if (sh && !/<table/i.test(dt.getData('text/html') || '') && sh.looksLikeCsv(pasted)) {
                    e.preventDefault();
                    sh.pasteCsv(pasted);
                    return;
                }
                // after the paste: in Slides, the slide check; in Excel, the sheets' summary when tables came in
                setTimeout(function () { if (K.slides) K.slides.checkIncoming(pasted); }, 0);
                if (shift || !K.store.getUi('importer.richPaste')) return;
                const md = K.importer.fromPaste(dt);
                if (md == null) return;                      // plain text: the browser pastes it
                e.preventDefault();
                // the Excel view: a table without a heading (cells copied from Excel) gets one: its sheet's name
                pasted = K.slides.view() === 'excel' && window.KelkSheets ? window.KelkSheets.headTables(md) : md;
                K.editor.insert(pasted);
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
                // images go into the text at the cursor; the other files (several, a zip) are imported as one document
                const imgs = files.filter(K.images.isImage), docs = files.filter(function (f) { return !K.images.isImage(f); });
                if (docs.length) K.importer.fromFiles(docs);
                else if (imgs.length) insertImages(imgs);
            });

            // the last keystrokes are not lost when the tab is closed or hidden within the autosave pause
            window.addEventListener('pagehide', saveNow);
            document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') saveNow(); });

            scrollSync(K.$('.preview-scroll'));
            this.stats();
            record();                                        // the text the page opened with
        },

        /**
         * The text was saved by another tab (Kelk.sync): this tab takes it — one Undo step — unless it
         * holds typing not saved yet; that typing is saved a moment later and the other tab takes it then.
         * @returns {boolean} taken
         */
        external: function (text) {
            text = text || '';
            if (!area || saveTimer || text === area.value) return false;
            record();
            const s = area.selectionStart, e = area.selectionEnd;
            area.value = text;
            if (document.activeElement === area) area.setSelectionRange(Math.min(s, text.length), Math.min(e, text.length));
            fileName = (text && K.store.getUi('sourceName')) || '';
            this.stats();
            K.preview.render();
            record();
            area.dispatchEvent(new CustomEvent('kelk:replaced'));
            return true;
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

        /** The document on screen (a number): a whole-text replacement starts a new one, undo / redo return to theirs. */
        doc: function () { return docId; },

        /** Replace the whole text (import, sample, clear). */
        set: function (text, name) {
            record();                                        // typing in progress: its own step first
            docId = ++docSeq;                                // a new document
            area.value = text;
            fileName = name || '';
            persist(text);
            K.images.prune(text);
            this.stats();
            K.preview.render();
            record();
            area.dispatchEvent(new CustomEvent('kelk:replaced'));
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
            const size = K.$('#st-size');
            size.textContent = K.i18n.t('sizeKb', (bytes / 1024).toFixed(1));
            size.dir = 'auto';                     // index.html's ltr suited «41.1 KB», not «41.1 كيلوبايت»
            const f = K.$('#st-file');
            f.hidden = !fileName;
            K.$('#st-file-name').textContent = fileName;
            K.$('#st-file-name').title = fileName;
        }
    };
})(window.Kelk = window.Kelk || {});
