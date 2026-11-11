/**
 * The PDF import report: what an import could not read in full, in a panel beside the text
 * instead of a row of toasts that vanish.
 *
 *   Kelk.importReport.fromResult(r)   PdfImporter's result → the report (pure):
 *       { mode, summary: { pages, full, simplified, textContent, ocr, failed, conf },
 *         pages: [{ page, mode, conf, why: [] }]   (pages not read 'full' only; a page that could not be read —
 *                                                  the contract's failed: true — has the mode 'failed'),
 *         flags: [{ code, pages }], notes: [{ code, pages? }] }
 *     r.report when the importer gives one (normalised: lists always there, a flag never repeated as a
 *     note); otherwise built from the older fields — r.pages (per-page mode / conf), r.quality.flags, r.notes,
 *     r.failedPages.
 *   Kelk.importReport.worth(rep)      something to tell: a page not 'full', a flag, a note that is not quiet
 *                                     (kelkSource, kelkMath, monoBody alone are not news: the import went as it
 *                                     should).
 *   Kelk.importReport.none()          an empty report: a file with nothing to report but its information (2.7).
 *   Kelk.importReport.text(entries)   the report as Markdown (Copy report): its findings a list; the pages not read
 *                                     in full and the file's information GFM tables (2.8: the one copy button).
 *   Kelk.importReport.gfmTable(head, rows)   cells → a GFM table's lines (bars escaped), for a custom view's copy.
 *   An entry ({ name, report }) may carry info and kind: the file's information (scripts/fileinfo.js, loaded by the
 *     import), shown under the report in a closed <details> and copied with it; kind 'docx', 'xlsx', 'html' … names
 *     the panel «Import report» instead of «PDF import report».
 *   Kelk.ui.report(rep | [{ name, report }] | null, { name, onSafe })
 *     shows #import-report for every PDF import, the same way whatever the file: a clean one too (its summary, the
 *     calm color), one with something to tell in the warning color (worth). Open for config.reportOpenMs, then
 *     collapsed to its head (summary and a toggle: open again, collapse again); 0 keeps it open. Its × closes it
 *     for good. It belongs to the document it reports on (Kelk.editor.doc()): replacing the text (Clear, a sample,
 *     another import) hides it, an undo back to that document shows it again (collapsed). null: hidden. The focus moves into the panel and
 *     goes back where it was when it closes (its ×, Escape, or a clean import that closes it). onSafe: the
 *     "Re-import in safe mode" button's action, its explanation shown under it (no button without it, nor for a
 *     report that already ran in safe mode). Kelk.ui.report.release(): a new import starts — onSafe (and the
 *     file bytes it holds) goes. No live region of its
 *     own: the focus move announces the panel once (its name), the import's own toast says it loaded.
 *   Kelk.ui.report.custom(view)
 *     the same panel with content of another module (the slide-format check, scripts/slidecheck.js; the Excel
 *     view's summary and no-tables reports, scripts/sheets.js — loaded on demand with their words): view = { icon,
 *     title(), brief(), body(el) — fills the panel's body, buttons: [{ icon, label(), run }], copy() — the Markdown
 *     Copy report puts on the clipboard (no copy: no Copy report) } — the functions run again on a language change.
 *     It follows the document, collapses after config.reportOpenMs and closes like an import's report; safe mode is
 *     not shown. report.isCustom(): it is open.
 * Every code has its key here, written in full (tools/check-i18n.js: DYNAMIC prefixes pdf_ and rep_).
 */
(function (K) {
    'use strict';

    const own = function (o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); };
    const MODES = ['full', 'simplified', 'textContent', 'ocr'];
    /** the panel's own mode of a page that could not be read (the contract: failed: true, mode 'simplified') */
    const FAILED = 'failed';
    /** the quality flags (r.quality.flags): also in r.notes, shown once, as a flag */
    const FLAGS = { lostGlyphs: 'pdf_lostGlyphs', suspectSpaces: 'pdf_suspectSpaces', textInPictures: 'pdf_textInPictures' };
    /**
     * r.notes codes (every `_note('code'` of lib/ — tests/unit/report.test.js greps them): their key, and warn
     * (something is missing), info (worth knowing) or quiet (listed with the rest, but no reason on its own to open
     * the panel: the import went as it should).
     */
    const NOTES = {
        noText: { key: 'pdf_noText', warn: true },
        pageLimit: { key: 'pdf_pageLimit', warn: true },
        figureFailed: { key: 'pdf_figureFailed', warn: true },
        pageFailed: { key: 'pdf_pageFailed', warn: true },
        ocrNeeded: { key: 'pdf_ocrNeeded', warn: true },
        printNoLinks: { key: 'pdf_printNoLinks' },
        ocrLayer: { key: 'pdf_ocrLayer' },
        watermarkDropped: { key: 'pdf_watermarkDropped' },
        kelkSource: { key: 'pdf_kelkSource', quiet: true },
        kelkMath: { key: 'pdf_kelkMath', quiet: true },
        monoBody: { key: 'pdf_monoBody', quiet: true },
        pageSimplified: { key: 'pdf_pageSimplified' },
        pageTextOnly: { key: 'pdf_pageTextOnly' }
    };
    const MODE_KEYS = { full: 'rep_mode_full', simplified: 'rep_mode_simplified', textContent: 'rep_mode_textContent', ocr: 'rep_mode_ocr', failed: 'rep_mode_failed' };
    const WHY_KEYS = {
        lowConf: 'rep_why_lowConf', suspectSpaces: 'rep_why_suspectSpaces', lostGlyphs: 'rep_why_lostGlyphs',
        layoutFailed: 'rep_why_layoutFailed', extractFailed: 'rep_why_extractFailed', noText: 'rep_why_noText',
        safeMode: 'rep_why_safeMode'
    };

    const pageNums = function (ps) {
        return Array.from(new Set((Array.isArray(ps) ? ps : []).filter(function (p) { return typeof p === 'number' && isFinite(p); })))
            .sort(function (a, b) { return a - b; });
    };
    const confOf = function (c) { return typeof c === 'number' && isFinite(c) ? Math.max(0, Math.min(1, c)) : null; };
    const mean = function (xs) {
        const v = xs.map(confOf).filter(function (c) { return c !== null; });
        return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null;
    };

    /** flags { code: [pages] } or [{ code, pages }] → [{ code, pages }] */
    function flagList(f) {
        if (Array.isArray(f)) return f.filter(function (x) { return x && x.code; }).map(function (x) { return { code: String(x.code), pages: pageNums(x.pages) }; });
        return f && typeof f === 'object' ? Object.keys(f).map(function (k) { return { code: k, pages: pageNums(f[k]) }; }) : [];
    }

    /** notes ['code'] or [{ code, pages }] → [{ code, pages? }], each code once, the flags' codes out */
    function noteList(ns, flags, failedPages) {
        const seen = {}, out = [];
        (Array.isArray(ns) ? ns : []).forEach(function (n) {
            const code = typeof n === 'string' ? n : n && n.code ? String(n.code) : '';
            if (!code || own(seen, code) || flags.some(function (f) { return f.code === code; })) return;
            seen[code] = true;
            const pages = n && typeof n === 'object' && n.pages ? pageNums(n.pages) : code === 'pageFailed' ? pageNums(failedPages) : null;
            out.push(pages && pages.length ? { code: code, pages: pages } : { code: code });
        });
        return out;
    }

    function fromResult(r) {
        r = r || {};
        const failed = pageNums(r.failedPages);
        if (r.report && typeof r.report === 'object') {
            const rep = r.report, s = rep.summary || {};
            const flags = flagList(rep.flags);
            const pages = (Array.isArray(rep.pages) ? rep.pages : []).filter(function (p) { return p && (p.mode !== 'full' || p.failed); }).map(function (p) {
                return { page: p.page, mode: p.failed ? FAILED : String(p.mode || ''), conf: confOf(p.conf), why: (Array.isArray(p.why) ? p.why : []).map(String) };
            });
            const summary = { pages: +s.pages || 0, full: +s.full || 0, simplified: +s.simplified || 0, textContent: +s.textContent || 0, ocr: +s.ocr || 0, failed: +s.failed || 0, conf: confOf(s.conf) };
            return { mode: rep.mode || 'auto', summary: summary, pages: pages, flags: flags, notes: noteList(rep.notes, flags, failed) };
        }
        // from before the fallback ladder: the fields the importer has always given
        const flags = flagList(r.quality && r.quality.flags);
        const per = Array.isArray(r.pages) ? r.pages.filter(function (p) { return p && p.page; }) : null;
        const summary = { pages: 0, full: 0, simplified: 0, textContent: 0, ocr: 0, failed: failed.length, conf: null };
        let pages = [];
        if (per) {
            per.forEach(function (p) { if (MODES.indexOf(p.mode) >= 0) summary[p.mode]++; });
            summary.pages = per.length + failed.filter(function (n) { return !per.some(function (p) { return p.page === n; }); }).length;
            summary.conf = mean(per.map(function (p) { return p.conf; }));
            const lost = function (p) { return failed.indexOf(p.page) >= 0; };
            pages = per.filter(function (p) { return p.mode && (p.mode !== 'full' || lost(p)); }).map(function (p) {
                return { page: p.page, mode: lost(p) ? FAILED : String(p.mode), conf: confOf(p.conf), why: [] };
            });
        } else if (r.source !== 'kelk') {
            const read = ((r.quality && r.quality.pages) || []).map(function (q) { return q.page; });
            summary.pages = pageNums(read.concat(failed)).length;
            summary.full = Math.max(0, summary.pages - failed.length);
        }
        return { mode: 'full', summary: summary, pages: pages, flags: flags, notes: noteList(r.notes, flags, failed) };
    }

    /** a note that opens the panel: a known one that is not quiet, or a code without words yet (shown as it is) */
    const loud = function (n) { return !own(NOTES, n.code) || !NOTES[n.code].quiet; };
    function worth(rep) {
        return !!rep && (rep.pages.length > 0 || rep.flags.length > 0 || rep.notes.some(loud));
    }

    // ---- the words ---------------------------------------------------------------------------------------------
    const t = function () { return K.i18n.t.apply(K.i18n, arguments); };
    const sep = function () { return K.i18n.t('listSep'); };
    // a percentage isolated left-to-right (LRI … PDI): after Persian / Arabic words the bidi algorithm would
    // otherwise read its digits as Arabic numbers and put the % on their left ("%78" in a sentence, "41%" in a cell)
    const pct = function (c) { return c === null || c === undefined ? '—' : '⁦' + Math.round(c * 100) + '%⁩'; };
    const modeName = function (m) { return own(MODE_KEYS, m) ? t(MODE_KEYS[m]) : m; };
    /** a page's mode as shown: the contract's failed page (mode 'simplified', failed: true) is 'failed' */
    const pageMode = function (p) { return p.failed ? FAILED : p.mode; };
    const whyName = function (w) { return own(WHY_KEYS, w) ? t(WHY_KEYS[w]) : w; };
    const list = function (ps) { return K.ui.pageList(ps, 12); };

    /** one finding (a flag or a note) → { text, warn } */
    function finding(f, isFlag) {
        const ps = f.pages ? list(f.pages) : '';
        if (isFlag && own(FLAGS, f.code)) return { text: t(FLAGS[f.code], ps), warn: true };
        if (!isFlag && own(NOTES, f.code)) return { text: t(NOTES[f.code].key, ps), warn: !!NOTES[f.code].warn };
        return { text: t('rep_unknown', f.code + (ps ? ' (' + ps + ')' : '')), warn: false };
    }

    /** the flags and the notes of a report as rows { code, text, warn }: what is missing first, then the rest */
    function findings(rep) {
        const all = rep.flags.map(function (f) { return Object.assign({ code: f.code }, finding(f, true)); })
            .concat(rep.notes.map(function (n) { return Object.assign({ code: n.code }, finding(n, false)); }));
        return all.filter(function (f) { return f.warn; }).concat(all.filter(function (f) { return !f.warn; }));
    }

    function summaryText(rep) {
        const s = rep.summary, parts = [];
        MODES.forEach(function (m) { if (s[m]) parts.push(modeName(m) + ' ' + s[m]); });
        if (s.failed) parts.push(t('rep_failed') + ' ' + s.failed);
        let out = s.pages ? (s.pages === 1 ? t('rep_summary1') : t('rep_summary', s.pages)) + (parts.length ? ' — ' + parts.join(sep()) : '') : '';
        if (s.conf !== null) out += (out ? ' · ' : '') + t('rep_conf', pct(s.conf));
        return out;
    }

    function none() {
        return { mode: null, summary: { pages: 0, full: 0, simplified: 0, textContent: 0, ocr: 0, failed: 0, conf: null }, pages: [], flags: [], notes: [] };
    }
    const titleKey = function (entries) { return entries.some(function (e) { return e.kind && e.kind !== 'pdf'; }) ? 'rep_titleImport' : 'rep_title'; };
    const infoOf = function (e) { return e.info && K.fileInfo && K.fileInfo.any(e.info) ? e.info : null; };

    function entriesOf(rep, o) {
        if (Array.isArray(rep)) return rep.filter(function (e) { return e && e.report; });
        return rep ? [{ name: (o && o.name) || '', report: rep }] : [];
    }

    /** a GFM table cell: one line, its bars escaped */
    const cell = function (v) { return String(v == null ? '' : v).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim(); };
    const row = function (cells) { return '| ' + cells.map(cell).join(' | ') + ' |'; };
    /** cells → a GFM table's lines (the head, its rule, the rows) */
    function gfmTable(head, rows) {
        return [row(head), '| ' + head.map(function () { return '---'; }).join(' | ') + ' |'].concat(rows.map(row));
    }

    /**
     * The report as Markdown (Copy report, 2.8): a heading, then for each file its name, summary and findings (a
     * list), the pages not read in full and the file's information as GFM tables. No bidi isolates (a paste target
     * has its own direction).
     */
    function text(entries) {
        const lines = ['## ' + t(titleKey(entries))];
        entries.forEach(function (e) {
            const rep = e.report;
            lines.push('');
            if (e.name) lines.push('### ' + e.name, '');
            const s = summaryText(rep);
            if (s) lines.push(s);
            if (rep.mode === 'safe') lines.push('', t('rep_safeMode'));
            const fs = findings(rep);
            if (fs.length) {
                lines.push('', '**' + t('rep_findingsHead') + '**', '');
                fs.forEach(function (f) { lines.push('- ' + f.text); });
            }
            if (rep.pages.length) {
                lines.push('', '**' + t('rep_pagesHead') + '**', '');
                Array.prototype.push.apply(lines, gfmTable(['rep_colPage', 'rep_colMode', 'rep_colConf', 'rep_colWhy'].map(function (k) { return t(k); }),
                    rep.pages.map(function (p) { return [p.page, modeName(pageMode(p)), pct(p.conf), p.why.map(whyName).join(sep())]; })));
            }
            if (infoOf(e)) lines.push('', '**' + t('fi_head') + '**', '', K.fileInfo.gfm(e.info).replace(/\n$/, ''));
        });
        return lines.join('\n').replace(/[⁦-⁩]/g, '').replace(/^ +$/gm, '').replace(/\n{3,}/g, '\n\n').trim() + '\n';
    }

    K.importReport = { fromResult: fromResult, worth: worth, text: text, gfmTable: gfmTable, none: none, FLAGS: FLAGS, NOTES: NOTES, MODES: MODES, MODE_KEYS: MODE_KEYS, WHY: WHY_KEYS };

    // ---- the panel ---------------------------------------------------------------------------------------------
    const state = { entries: [], o: {}, back: null, doc: null, timer: 0, view: null };
    const docNow = function () { return K.editor && K.editor.doc ? K.editor.doc() : null; };
    const el = function (tag, cls, txt) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (txt != null) e.textContent = txt;
        return e;
    };

    /** the panel's title, icon and buttons: an import's report or another module's view (report.custom) */
    function kind() {
        const v = state.view, h = K.$('#import-report-title'), acts = K.$('#import-report .report-actions');
        if (h) { h.querySelector('span').textContent = v ? v.title() : t(titleKey(state.entries)); K.ui.setIcon(h, v ? v.icon : 'file-text'); }
        const copyB = K.$('#report-copy'); if (copyB) copyB.hidden = !!v && !v.copy;
        if (!acts) return;
        acts.querySelectorAll('.report-custom').forEach(function (b) { b.remove(); });
        if (v) (v.buttons || []).forEach(function (bt) {
            const b = acts.insertBefore(el('button', 'btn report-custom'), copyB);
            b.type = 'button';
            b.appendChild(el('i')).setAttribute('data-lucide', bt.icon);
            b.appendChild(el('span', null, bt.label()));
            b.addEventListener('click', bt.run);
        });
        K.ui.icons(acts);
    }

    function renderCustom() {
        const box = K.$('#import-report'), body = K.$('#import-report-body'), v = state.view;
        body.textContent = '';
        v.body(body);
        ['#report-safe', '#report-safe-hint'].forEach(function (s) { const x = K.$(s); if (x) x.hidden = true; });
        const name = K.$('#import-report-name'); if (name) name.textContent = '';
        const brief = K.$('#import-report-brief'); if (brief) brief.textContent = v.brief();
        box.classList.remove('clean');
        toggleButton();
    }

    function render() {
        const box = K.$('#import-report'), body = K.$('#import-report-body');
        if (!box || !body) return;
        kind();
        if (state.view) { renderCustom(); return; }
        body.textContent = '';
        state.entries.forEach(function (e) {
            const rep = e.report, sec = body.appendChild(el('div', 'report-entry'));
            if (e.name && state.entries.length > 1) sec.appendChild(el('h4', 'report-file', e.name)).dir = 'auto';
            const s = summaryText(rep);
            if (s) sec.appendChild(el('p', 'report-summary', s));
            if (rep.mode === 'safe') sec.appendChild(el('p', 'report-safe-note', t('rep_safeMode')));
            const fs = findings(rep);
            if (fs.length) {
                sec.appendChild(el('h4', 'report-sub', t('rep_findingsHead')));
                const ul = sec.appendChild(el('ul', 'report-findings'));
                fs.forEach(function (f) {
                    const li = ul.appendChild(el('li', f.warn ? 'warn' : 'info', f.text));
                    li.setAttribute('data-code', f.code);
                });
            }
            if (rep.pages.length) {
                const tbl = sec.appendChild(el('table', 'report-pages'));
                tbl.appendChild(el('caption', null, t('rep_pagesHead')));
                const hr = tbl.appendChild(el('thead')).appendChild(el('tr'));
                ['rep_colPage', 'rep_colMode', 'rep_colConf', 'rep_colWhy'].forEach(function (k) { hr.appendChild(el('th', null, t(k))).scope = 'col'; });
                const tb = tbl.appendChild(el('tbody'));
                rep.pages.forEach(function (p) {
                    const tr = tb.appendChild(el('tr'));
                    tr.setAttribute('data-mode', pageMode(p));
                    tr.appendChild(el('th', 'num', String(p.page))).scope = 'row';
                    tr.appendChild(el('td', 'mode', modeName(pageMode(p))));
                    tr.appendChild(el('td', 'num', pct(p.conf)));
                    tr.appendChild(el('td', 'why', p.why.map(whyName).join(sep())));
                });
            }
            if (infoOf(e)) K.fileInfo.render(sec, e.info);
        });
        const safe = K.$('#report-safe'), hint = K.$('#report-safe-hint');
        // (a clean import has nothing safe mode would do better: no button)
        const noSafe = !state.o.onSafe || state.entries.every(function (e) { return e.report.mode === 'safe' || !worth(e.report); });
        if (safe) safe.hidden = noSafe;
        if (hint) hint.hidden = noSafe;
        const name = K.$('#import-report-name');
        if (name) name.textContent = state.entries.length === 1 ? state.entries[0].name : '';
        // the head's own line, read while the panel is collapsed: the summary of one file, or how many files
        const brief = K.$('#import-report-brief');
        const one = state.entries.length === 1 ? state.entries[0] : null;
        if (brief) brief.textContent = one ? summaryText(one.report) || (infoOf(one) ? K.fileInfo.brief(one.info) : '') : t('rep_files', state.entries.length);
        box.classList.toggle('clean', !state.entries.some(function (e) { return worth(e.report); }));
        toggleButton();
    }

    /** open (the body shown) or collapsed (the head only) */
    function collapse(on) {
        const box = K.$('#import-report');
        if (!box) return;
        clearTimeout(state.timer); state.timer = 0;
        if (on && box.contains(document.activeElement) && document.activeElement !== box) {
            const tg = K.$('#import-report-toggle'); if (tg) tg.focus();       // the focus never left in a hidden part
        }
        box.classList.toggle('collapsed', !!on);
        toggleButton();
    }
    function toggleButton() {
        const box = K.$('#import-report'), tg = K.$('#import-report-toggle');
        if (!box || !tg) return;
        const shut = box.classList.contains('collapsed'), label = t(shut ? 'rep_expand' : 'rep_collapse');
        tg.setAttribute('aria-expanded', shut ? 'false' : 'true');
        tg.title = label; tg.setAttribute('aria-label', label);
        K.ui.setIcon(tg, shut ? 'chevron-down' : 'chevron-up');
    }
    /** collapse after config.reportOpenMs — later while the pointer is over it or the focus on one of its controls */
    function collapseLater(ms) {
        clearTimeout(state.timer); state.timer = 0;
        const wait = ms == null ? +K.config.reportOpenMs : ms;
        if (!(wait > 0)) return;
        state.timer = setTimeout(function () {
            const box = K.$('#import-report');
            if (!box || box.hidden) return;
            const a = document.activeElement, busy = box.matches(':hover') || (box.contains(a) && a !== box && a.id !== 'import-report-toggle');
            if (busy) collapseLater(1000); else collapse(true);
        }, wait);
    }

    /** the text was replaced or an undo / redo moved it: the panel shows only on the document it reports on */
    function follow() {
        const box = K.$('#import-report');
        if (!box || !state.entries.length) return;
        const mine = state.doc === docNow();
        if (!mine && !box.hidden) { const inside = box.contains(document.activeElement); box.hidden = true; clearTimeout(state.timer); if (inside) { const ed = K.$('#editor'); if (ed) ed.focus(); } }
        else if (mine && box.hidden) { collapse(true); box.hidden = false; }
    }

    function close(restore) {
        const box = K.$('#import-report');
        if (!box) return;
        if (box.hidden) { clearTimeout(state.timer); state.entries = []; state.o = {}; state.doc = null; state.view = null; return; }
        const inside = box.contains(document.activeElement);
        box.hidden = true;
        clearTimeout(state.timer); state.timer = 0;
        state.entries = []; state.o = {}; state.doc = null; state.view = null;  // the kept file bytes go with it (onSafe holds them)
        const back = state.back; state.back = null;
        if (restore !== false && inside) {
            const to = back && back.isConnected && !back.disabled && !back.closest('[hidden]') ? back : K.$('#editor');
            if (to) to.focus();
        }
    }

    function report(rep, o) {
        const entries = rep ? entriesOf(rep, o) : [];
        const box = K.$('#import-report');
        if (!box) return false;
        // nothing to tell: an open panel closes (the focus, when it was inside, back where it was before it opened)
        if (!entries.length) { close(); return false; }
        const was = !box.hidden;
        state.entries = entries; state.o = o || {}; state.doc = docNow(); state.view = null;
        if (!was || !box.contains(document.activeElement)) {
            const a = document.activeElement;
            state.back = a && a !== document.body && !box.contains(a) ? a : state.back;
        }
        render();
        collapse(false);
        box.hidden = false;
        box.focus();
        collapseLater();
        return true;
    }
    report.close = close;
    report.custom = function (view) {
        const box = K.$('#import-report');
        if (!box) return false;
        if (!box.contains(document.activeElement)) { const a = document.activeElement; state.back = a && a !== document.body ? a : state.back; }
        state.entries = [{ name: '', report: null }]; state.o = {}; state.doc = docNow(); state.view = view;
        render();
        collapse(false);
        box.hidden = false;
        box.focus();
        collapseLater();                    // as every report: open for config.reportOpenMs, then its toggle line only
        return true;
    };
    report.isCustom = function () { const box = K.$('#import-report'); return !!state.view && !!box && !box.hidden; };
    /**
     * A new import starts: the file kept for "Re-import in safe mode" goes now (not only when its report is
     * replaced), and the button with it; the report on screen stays until the new one comes.
     */
    report.release = function () {
        if (!state.o.onSafe) return;
        state.o = Object.assign({}, state.o, { onSafe: null });
        const safe = K.$('#report-safe'), box = K.$('#import-report');
        if (safe && box && document.activeElement === safe) box.focus();
        render();
    };
    /** the language changed: the panel's words again */
    report.refresh = function () { if (state.entries.length) render(); };
    report.collapse = collapse;
    report.follow = follow;
    report.text = function () { return state.view ? (state.view.copy ? state.view.copy() : '') : text(state.entries); };

    function copy() {
        const s = report.text();
        const ok = function () { K.ui.toast(K.i18n.t('copied')); };
        const no = function (e) { K.ui.toast(K.i18n.t('failed', e && e.message || ''), 'error'); };
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(ok, no);
            else no();
        } catch (e) { no(e); }
    }

    /** the panel's buttons and keys (once, when the page is ready) */
    function wire() {
        const box = K.$('#import-report');
        if (!box || box._wired) return;
        box._wired = true;
        K.$('#import-report-close').addEventListener('click', function () { close(); });
        K.$('#import-report-toggle').addEventListener('click', function () { const shut = box.classList.contains('collapsed'); collapse(!shut); if (shut) collapseLater(0); });
        const ed = K.$('#editor');
        if (ed) ed.addEventListener('kelk:replaced', follow);
        K.$('#report-copy').addEventListener('click', copy);
        K.$('#report-safe').addEventListener('click', function () {
            const run = state.o.onSafe;
            close();
            if (run) run();
        });
        box.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
        });
    }
    report.wire = wire;

    K.ui.report = report;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})(window.Kelk = window.Kelk || {});
