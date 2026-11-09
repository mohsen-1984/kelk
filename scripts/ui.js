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
    const batches = [];             // K.ui.batch: toasts held back, one queue per batch

    /**
     * Kelk.libs — the large libraries (docx 0.4 MB, jsPDF 0.4 MB, mammoth
     * 0.6 MB) load on first use, not with the page:
     *   await K.libs.need('docx')     .docx export
     *   await K.libs.need('jspdf')    .pdf export
     *   await K.libs.need('mammoth')  .docx import
     *   await K.libs.need('pdfjs')    .pdf import (library + its worker, in order)
     *   await K.libs.need('pdfimport') .pdf import (PdfImporter + lib/pdfimport/*.js, in order, after pdfjs)
     * A library of several files counts as loaded once ALL its files ran: its global exists after the first
     * one, so a load that failed half way is finished on the next call (the files that ran are not run twice).
     * A global already on the page (a test page with its own script tags) is taken as it is.
     */
    K.libs = {
        need: function (name) {
            const lib = K.config.libs[name];
            if (!lib) return Promise.reject(new Error('unknown library ' + name));
            const srcs = [].concat(lib.src);
            const started = srcs.some(function (src) { return scripts.has(src); });
            if (window[lib.global] && !started) return Promise.resolve(window[lib.global]);
            return srcs.reduce(function (p, src) { return p.then(function () { return K.ui.loadScript(src); }); }, Promise.resolve()).then(function () {
                if (!window[lib.global]) throw new Error(K.i18n.t('libFailed', name));
                return window[lib.global];
            });
        }
    };

    K.ui = {
        /**
         * type: 'info' | 'warn' | 'error'; action: { label, run } — a button in the toast (e.g. Undo).
         * The same message twice is one toast with a count (×3), its time restarted — never a stack of copies.
         * Inside K.ui.batch(…) the toasts wait, and come out once at its end: one per message, the most
         * serious first (an import that stored forty pictures says "no room" once).
         */
        toast: function (message, type, ms, action) {
            if (batches.length) { batches[batches.length - 1].push({ message: message, type: type || 'info', ms: ms, action: action }); return; }
            const box = $('#toasts');
            if (!box) return;
            const same = Array.from(box.children).filter(function (t) { return t._msg === message && t._type === (type || 'info') && !action; })[0];
            if (same) {
                same._count++;
                same.querySelector('.toast-count').textContent = '×' + same._count;
                clearTimeout(same._timer);
                same._timer = setTimeout(function () { same.remove(); }, same._ms);
                return;
            }
            const el = document.createElement('div');
            el.className = 'toast' + (type && type !== 'info' ? ' ' + type : '');
            el.setAttribute('role', type === 'error' ? 'alert' : 'status');
            el.appendChild(document.createElement('span')).textContent = message;
            const count = el.appendChild(document.createElement('span'));
            count.className = 'toast-count';
            el._msg = message; el._type = type || 'info'; el._count = 1;
            if (action) {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'toast-action';
                b.textContent = action.label;
                b.addEventListener('click', function () { el.remove(); action.run(); });
                el.appendChild(b);
            }
            box.appendChild(el);
            el._ms = ms || (type === 'error' || type === 'warn' ? 6000 : 2800);
            el._timer = setTimeout(function () { el.remove(); }, el._ms);
        },

        /**
         * Run fn with the toasts held back, then show them once each (with a count when repeated), errors
         * first, then warnings, then the rest — at most `max` (default 4), the others summed up in the last.
         */
        batch: async function (fn, max) {
            const queue = []; batches.push(queue);
            try { return await fn(); }
            finally {
                batches.splice(batches.indexOf(queue), 1);
                const order = { error: 0, warn: 1, info: 2 }, seen = new Map();
                queue.forEach(function (t) {
                    const k = t.type + '\u0000' + t.message;
                    if (seen.has(k)) seen.get(k).n++; else seen.set(k, Object.assign({ n: 1 }, t));
                });
                const list = Array.from(seen.values()).sort(function (a, b) { return order[a.type] - order[b.type]; });
                const lim = max || 4;
                list.slice(0, lim).forEach(function (t) {
                    K.ui.toast(t.message + (t.n > 1 ? ' (×' + t.n + ')' : ''), t.type, t.ms || (list.length > 1 && t.type !== 'info' ? 9000 : t.ms), t.action);
                });
                if (list.length > lim) {
                    list.slice(lim).forEach(function (t) { console.info('Kelk:', t.message + (t.n > 1 ? ' (×' + t.n + ')' : '')); });
                    K.ui.toast(K.i18n.t('moreMessages', list.length - lim), 'info');
                }
            }
        },

        /** page numbers as a short list: "1–3, 7, 9 …" (ranges joined, at most `max` parts) */
        pageList: function (pages, max) {
            const ps = Array.from(new Set(pages || [])).sort(function (a, b) { return a - b; }), parts = [];
            for (let i = 0; i < ps.length; i++) {
                let j = i; while (j + 1 < ps.length && ps[j + 1] === ps[j] + 1) j++;
                parts.push(j > i + 1 ? ps[i] + '–' + ps[j] : j === i + 1 ? ps[i] + K.i18n.t('listSep') + ps[j] : String(ps[i]));
                i = j;
            }
            const lim = max || 6, sep = K.i18n.t('listSep');
            return parts.slice(0, lim).join(sep) + (parts.length > lim ? ' …' : '');
        },

        icons: function (root) {
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                try { lucide.createIcons(root ? { root: root } : undefined); } catch (e) { lucide.createIcons(); }
            }
        },

        /**
         * Progress for work that runs while the page stays usable (the slides preview: typing goes on), in the
         * same window as a task's (#task), shown without making it modal: no Cancel (styles: dialog.task.quiet), no focus taken from the editor
         * (the open attribute is set, which moves no focus), clicks pass through it. start(label) shows it only when
         * the work lasts longer than config.progressDelayMs (a quick render never flashes it); start(label, true) at
         * once (the first slides build, known to be long); progress(done, total,
         * detail) as a task's; end(). A task (an export) takes the window over: this one steps aside meanwhile.
         */
        bar: function () {
            const self = this;
            let timer = 0, shown = false;
            const q = {
                start: function (label, now) {
                    if (shown || timer) return;
                    const open = function () {
                        timer = 0;
                        const dlg = $('#task');
                        if (!dlg || dlg.open || self._taskOn) return;
                        $('#task-label').textContent = label || ''; $('#task-detail').textContent = '';
                        $('#task-bar').removeAttribute('value');
                        dlg.classList.add('quiet');
                        dlg.setAttribute('open', '');
                        shown = true; self._quiet = q;
                    };
                    if (now) open(); else timer = setTimeout(open, K.config.progressDelayMs);
                },
                progress: function (done, total, detail) {
                    if (!shown) return;
                    const bar = $('#task-bar');
                    bar.max = total; bar.value = Math.min(done, total);
                    $('#task-detail').textContent = detail || '';
                },
                end: function () {
                    clearTimeout(timer); timer = 0;
                    if (!shown) return;
                    shown = false; if (self._quiet === q) self._quiet = null;
                    const dlg = $('#task');
                    dlg.removeAttribute('open'); dlg.classList.remove('quiet');
                }
            };
            return q;
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
                    s.onerror = function () { scripts.delete(src); reject(new Error(K.i18n.t('libFailed', src))); };
                    document.head.appendChild(s);
                }));
            }
            return scripts.get(src);
        },

        theme: function (name) {
            // const t = name || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
            // Light by default, whatever the system's matchMedia says; the dark theme is a choice (the
            // preview then shows the document's colors in a dark version — scripts/preview.js darkPaper).
            // Any other value (an old or edited store) is light — the same as scripts/boot.js before the first paint.
            const t = name === 'dark' ? 'dark' : 'light';
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

        /**
         * Maximize a panel ('editor' | 'preview') or restore (null): the other
         * panel and the Settings pane step aside, and come back as they were.
         */
        maximize: function (which) {
            const ws = $('#workspace');
            const was = ws.classList.contains('max-editor') ? 'editor' : ws.classList.contains('max-preview') ? 'preview' : null;
            if (which && !was) this._paneBefore = !ws.classList.contains('pane-closed');
            ws.classList.toggle('max-editor', which === 'editor');
            ws.classList.toggle('max-preview', which === 'preview');
            if (which) this.pane(false);
            else if (was) this.pane(this._paneBefore !== false && K.store.getUi('paneOpen') !== false);
            K.$$('[data-max]').forEach(function (b) {
                const on = b.getAttribute('data-max') === which;
                K.ui.setIcon(b, on ? 'minimize-2' : 'maximize-2');
                const label = K.i18n.t(on ? 'restore' : 'maximize');
                b.title = label; b.setAttribute('aria-label', label);
            });
            return which;
        },

        /**
         * The editor's and the preview's bars, matched: when the two panels stand
         * side by side, each top bar takes the taller one's height, and so does
         * each bottom bar — a bar that wraps (a narrow screen, a long file name,
         * the stats) wraps both. One above the other, each keeps its own height.
         * Runs on every size change of the bars and the panels (ResizeObserver).
         */
        syncBars: function () {
            const ed = $('.editor-panel'), pv = $('.preview-panel');
            if (!ed || !pv) return;
            const pairs = [[$('.editor-panel > .pane-head'), $('.preview-panel > .panel-head')],
                           [$('.editor-panel .editor-foot'), $('.preview-panel > .export-foot')]];
            const a = ed.getBoundingClientRect(), b = pv.getBoundingClientRect();
            const side = a.width > 0 && b.width > 0 && Math.abs(a.top - b.top) < 2 && pairs[0][0].offsetParent !== null;
            pairs.forEach(function (p) {
                if (!p[0] || !p[1]) return;
                p[0].style.minHeight = p[1].style.minHeight = '';
                if (!side || !p[0].offsetHeight || !p[1].offsetHeight) return;
                const h = Math.max(p[0].offsetHeight, p[1].offsetHeight) + 'px';
                p[0].style.minHeight = p[1].style.minHeight = h;
            });
        },
        watchBars: function () {
            if (typeof ResizeObserver === 'undefined') return;
            let raf = 0;
            const self = this;
            const ro = new ResizeObserver(function () {
                cancelAnimationFrame(raf);
                raf = requestAnimationFrame(function () { self.syncBars(); });
            });
            // the bars' contents (their natural height) and the panels (side by side or not)
            K.$$('.editor-panel, .preview-panel, .editor-panel > .pane-head .actions, .preview-panel > .panel-head .actions, .editor-foot .stats, .export-foot .export-bar, .export-foot .namebox').forEach(function (el) { ro.observe(el); });
            this.syncBars();
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

        help: function (open) { this.dialog('#help', open); },

        /**
         * A long task (an import, an export): a modal dialog — the page cannot be used meanwhile — with
         * a label, a detail line, a progress bar and Cancel. fn gets { signal, progress(done, total,
         * detail), label(text) }; the dialog shows after `delay` ms (default 200: a quick task never
         * flashes it). Cancel (or Esc) aborts the signal and rejects at once with err.code 'aborted';
         * a task that cannot stop half way (a builder) runs out and its result is dropped. One task at
         * a time: another one waits for it.
         */
        task: function (label, fn, o) {
            o = o || {};
            const self = this, dlg = $('#task'), bar = $('#task-bar'), lab = $('#task-label'), det = $('#task-detail'), btn = $('#task-cancel');
            const run = function () {
                const ctl = new AbortController();
                let cancel;
                const aborted = new Promise(function (resolve, reject) {
                    cancel = function () { if (ctl.signal.aborted) return; ctl.abort(); const e = new Error(K.i18n.t('cancelled')); e.code = 'aborted'; reject(e); };
                });
                aborted.catch(function () {});
                const api = {
                    signal: ctl.signal,
                    label: function (t) { if (lab) lab.textContent = t; },
                    progress: function (done, total, detail) {
                        if (!bar) return;
                        if (total > 0) { bar.max = total; bar.value = Math.min(done, total); } else bar.removeAttribute('value');
                        if (det) det.textContent = detail || '';
                    }
                };
                self._taskOn = true;
                if (self._quiet) self._quiet.end();          // the slides preview's quiet progress steps aside
                if (dlg) {
                    lab.textContent = label || ''; det.textContent = ''; bar.removeAttribute('value');
                    btn.onclick = cancel;
                    dlg.oncancel = function (e) { e.preventDefault(); cancel(); };       // Esc
                }
                const timer = dlg ? setTimeout(function () { if (!dlg.open) dlg.showModal(); }, o.delay == null ? 200 : o.delay) : 0;
                // done: the dialog's handlers go too (they would keep this task's scope, and what it read, alive)
                const done = function () {
                    clearTimeout(timer); self._taskOn = false;
                    if (dlg) { if (dlg.open) dlg.close(); btn.onclick = null; dlg.oncancel = null; }
                };
                return Promise.race([Promise.resolve().then(function () { return fn(api); }), aborted])
                    .then(function (v) { done(); return v; }, function (e) { done(); throw e; });
            };
            const p = (self._tasks || Promise.resolve()).then(run, run);
            // the queue waits for the task, not for its value: resolving to undefined, it holds no result alive
            // (an import's text, a PDF's bytes) after the caller has taken it
            const settle = function () {};
            self._tasks = p.then(settle, settle);
            return p;
        },

        /**
         * Several documents (a zip, a multi-file drop) before they are imported: the order they come in, and
         * which of them. o: { title, docs: [{ name, path, size }], skipped: [{ name, path, size, reason:
         * 'type' | 'size' }], images: n, maxMB }. Each document has the icon of its kind (md, txt, html, docx,
         * pdf), a checkbox, a handle to drag (mouse or touch) and up/down buttons (Alt + ↑/↓ on a focused row);
         * the files that cannot come in are listed apart, with the reason. Resolves with the documents
         * chosen, in their order, or null on Cancel / Esc.
         */
        order: function (o) {
            const dlg = $('#order');
            if (!dlg) return Promise.resolve(o.docs);
            const list = $('#order-list'), ok = $('#order-ok'), count = $('#order-count');
            const KIND = { '.md': 'md', '.markdown': 'md', '.txt': 'txt', '.html': 'html', '.htm': 'html', '.docx': 'docx', '.pdf': 'pdf' };
            const ICON = { md: 'file-pen-line', txt: 'file-text', html: 'file-code', docx: 'file-type', pdf: 'file-badge', image: 'file-image', none: 'file-x' };
            const ext = function (n) { const m = /\.[^.\/]+$/.exec(n || ''); return m ? m[0].toLowerCase() : ''; };
            const size = function (b) {
                if (!(b >= 0)) return '';
                return b < 1024 ? b + ' B' : b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
            };
            const el = function (tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
            const iconOf = function (kind) { const i = el('i', 'order-icon k-' + kind); i.setAttribute('data-lucide', ICON[kind] || 'file'); return i; };
            /** name (bold) and its folder in the zip (muted), the kind's tag, the size */
            const label = function (d, kind, note) {
                const box = el('span', 'order-name');
                const dir = d.path && d.path.indexOf('/') >= 0 ? d.path.slice(0, d.path.lastIndexOf('/') + 1) : '';
                box.appendChild(el('bdi', 'n', d.name));
                if (dir) box.appendChild(el('bdi', 'dir', dir));
                const meta = el('span', 'order-meta');
                meta.appendChild(el('span', 'order-tag k-' + kind, (ext(d.name).slice(1) || '?').toUpperCase()));
                if (note) meta.appendChild(el('span', 'order-note', note));
                else if (size(d.size)) { const z = meta.appendChild(el('span', 'order-size', size(d.size))); z.dir = 'ltr'; }
                return [box, meta];
            };

            list.textContent = '';
            o.docs.forEach(function (d, i) {
                const kind = KIND[ext(d.name)] || 'none';
                const li = el('li', 'order-row');
                li._doc = d; li.tabIndex = -1;
                const grip = el('span', 'order-grip');
                grip.title = K.i18n.t('orderDrag'); grip.setAttribute('aria-hidden', 'true');
                const gi = el('i'); gi.setAttribute('data-lucide', 'grip-vertical'); grip.appendChild(gi);
                const cb = el('input'); cb.type = 'checkbox'; cb.checked = true; cb.setAttribute('aria-label', d.name);
                const up = el('button', 'btn ghost icon order-up'), down = el('button', 'btn ghost icon order-down');
                [[up, 'arrow-up', K.i18n.t('orderUp')], [down, 'arrow-down', K.i18n.t('orderDown')]].forEach(function (b) {
                    b[0].type = 'button'; b[0].title = b[2]; b[0].setAttribute('aria-label', b[2]);
                    const ic = el('i'); ic.setAttribute('data-lucide', b[1]); b[0].appendChild(ic);
                });
                li.append(grip, cb, iconOf(kind));
                label(d, kind).forEach(function (x) { li.appendChild(x); });
                li.append(up, down);
                list.appendChild(li);
            });

            const skip = $('#order-skip'), skipList = $('#order-skip-list');
            skipList.textContent = '';
            (o.skipped || []).forEach(function (d) {
                const li = el('li', 'order-row off');
                li.appendChild(iconOf('none'));
                label(d, 'none', d.reason === 'size' ? K.i18n.t('orderTooBig', o.maxMB) : K.i18n.t('orderNoType')).forEach(function (x) { li.appendChild(x); });
                skipList.appendChild(li);
            });
            if (o.images) {
                const li = el('li', 'order-row off img');
                li.appendChild(iconOf('image'));
                li.appendChild(el('span', 'order-name', K.i18n.t('orderImages', o.images)));
                skipList.appendChild(li);
            }
            $('#order-skip-head').textContent = K.i18n.t('orderSkipped', (o.skipped || []).length);
            $('#order-skip-head').hidden = !(o.skipped || []).length;
            skip.hidden = !skipList.children.length;
            $('#order-label').textContent = o.title || '';
            this.icons(dlg);

            const rows = function () { return Array.from(list.children); };
            const refresh = function () {
                const all = rows(), on = all.filter(function (r) { return r.querySelector('input').checked; });
                all.forEach(function (r, i) {
                    r.classList.toggle('unchecked', !r.querySelector('input').checked);
                    r.querySelector('.order-up').disabled = i === 0;
                    r.querySelector('.order-down').disabled = i === all.length - 1;
                });
                count.textContent = K.i18n.t('orderCount', on.length, all.length);
                ok.disabled = !on.length;
            };
            const move = function (li, by) {
                const all = rows(), j = all.indexOf(li) + by;
                if (j < 0 || j >= all.length) return;
                list.insertBefore(li, by > 0 ? all[j].nextSibling : all[j]);
                refresh();
                li.scrollIntoView({ block: 'nearest' });
            };

            list.onclick = function (e) {
                const b = e.target.closest('button'), li = e.target.closest('li');
                if (!b || !li) return;
                const upward = b.classList.contains('order-up');
                if (!upward && !b.classList.contains('order-down')) return;
                move(li, upward ? -1 : 1);
                // the button moved with its row and keeps the focus; at an end it is disabled: its sibling takes it
                (b.disabled ? li.querySelector(upward ? '.order-down' : '.order-up') : b).focus();
            };
            list.onchange = refresh;
            list.onkeydown = function (e) {
                if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
                const li = e.target.closest('li');
                if (!li) return;
                e.preventDefault();
                const f = document.activeElement;
                move(li, e.key === 'ArrowUp' ? -1 : 1);
                if (f && !f.disabled) f.focus(); else li.querySelector('input').focus();
            };
            // drag by the handle: pointer events, so a mouse and a finger both work (HTML5 drag does not on touch)
            list.onpointerdown = function (e) {
                const grip = e.target.closest('.order-grip');
                if (!grip || e.button > 0) return;
                const li = grip.closest('li');
                e.preventDefault();
                grip.setPointerCapture(e.pointerId);
                li.classList.add('dragging');
                const onMove = function (ev) {
                    const all = rows().filter(function (r) { return r !== li; });
                    const after = all.filter(function (r) { const b = r.getBoundingClientRect(); return ev.clientY > b.top + b.height / 2; }).pop();
                    const ref = after ? after.nextSibling : all[0];
                    if (ref !== li && li.nextSibling !== ref) list.insertBefore(li, ref || null);
                    // the list scrolls under a pointer held near its edges
                    const lb = list.getBoundingClientRect();
                    if (ev.clientY < lb.top + 24) list.scrollTop -= 8; else if (ev.clientY > lb.bottom - 24) list.scrollTop += 8;
                };
                const onUp = function () {
                    grip.removeEventListener('pointermove', onMove);
                    grip.removeEventListener('pointerup', onUp);
                    grip.removeEventListener('pointercancel', onUp);
                    li.classList.remove('dragging');
                    refresh();
                };
                grip.addEventListener('pointermove', onMove);
                grip.addEventListener('pointerup', onUp);
                grip.addEventListener('pointercancel', onUp);
            };
            $('#order-sort').onclick = function () {
                const by = function (a, b) { return String(a._doc.path).localeCompare(String(b._doc.path), undefined, { numeric: true, sensitivity: 'base' }); };
                rows().sort(by).forEach(function (r) { list.appendChild(r); });
                refresh();
            };
            refresh();

            return new Promise(function (resolve) {
                const end = function (v) { dlg.close(); resolve(v); };
                ok.onclick = function () {
                    end(rows().filter(function (r) { return r.querySelector('input').checked; }).map(function (r) { return r._doc; }));
                };
                $('#order-cancel').onclick = function () { end(null); };
                dlg.oncancel = function (e) { e.preventDefault(); end(null); };      // Esc
                dlg.showModal();
                ok.focus();                                  // Enter: import in the order shown
            });
        },

        /** Let the page paint (the task dialog) before a long synchronous step. */
        paint: function () {
            return new Promise(function (r) { requestAnimationFrame(function () { setTimeout(r, 0); }); });
        }
    };
})(window.Kelk = window.Kelk || {});
