/**
 * OCR in the import report (3.4; Kelk.config.libs.ocrreport: loaded on demand with the PDF importer, with its words).
 * The report's own section for the pages read with OCR, and its «Read with OCR» button with a page range — so none of
 * it is at startup: a report can only hold such pages, or offer them, after a PDF import, and that import loaded this.
 *
 *   KelkOcrReport.table(rep, pct, sep)   the pages read with OCR as one of the panel's page tables (scripts/report.js
 *                                        tables()): { cls, head, cols, rows } — page, confidence, notes —, or null
 *   KelkOcrReport.show(entries, onOcr, close)  the button, its page range and its hint, below the panel's body: shown
 *                                        when a report says pages need OCR (the note ocrNeeded) and the import gave
 *                                        onOcr(pages); the range filled with those pages for each new report, kept as
 *                                        the reader typed it otherwise; an invalid range refused with a toast naming
 *                                        the pages. entries []: hidden (a custom view)
 *   KelkOcrReport.scans(entries)         the pages the report says need OCR
 *   KelkOcrReport.fonts(entries)         whether it says OCR could read fonts Kelk does not know (fontOcr, 3.5): the
 *                                        button shows for them too, without the range (onOcr([]): the whole document)
 *   KelkOcrReport.rangeText(pages)       → «1-3, 7» (ASCII, whatever the language)
 *   KelkOcrReport.rangePages(text, allowed)  the range typed (Persian or Arabic digits, dashes, spaces) → the pages of
 *                                        `allowed` in it, or null (none, or not a range)
 *   KelkOcrReport.NOTES                  a page's OCR notes (lib/pdfimport/ladder.js _ladOcrRead) → their keys
 *   KelkOcrReport.STRINGS                its words, fa / en / ar: added to Kelk.i18n's tables when it loads
 */
(function (root) {
    'use strict';

    const STRINGS = {
        fa: {
            pdf_ocrFailed: 'تشخیص نویسه (OCR) آغاز نشد؛ صفحه‌های اسکن‌شده به شکل تصویر ماندند.',
            pdf_fontOcr: 'برخی قلم‌های ناشناخته از روی شکل حروفشان با اطمینان خوانده نشدند؛ تشخیص نویسه (OCR) می‌تواند آن‌ها را بخواند (صفحهٔ {0}). «خواندن با OCR» را بزنید.',
            pdf_toUnicodeDoubt: 'نام برخی نویسه‌های یک قلم در فایل با شکل آن‌ها نمی‌خواند (صفحهٔ {0}). متن همان است که فایل نام می‌برد؛ آن را با PDF مقایسه کنید.',
            pdf_ocrPageFailed: 'برخی صفحه‌ها با تشخیص نویسه (OCR) خوانده نشدند و به شکل تصویر ماندند (صفحهٔ {0}).',
            rep_colNotes: 'یادداشت',
            rep_ocrHead: 'صفحه‌هایی که با تشخیص نویسه (OCR) خوانده شدند',
            rep_ocr_noLines: 'خطی از متن پیدا نشد',
            rep_ocr_lowConf: 'اطمینان کم: متن را با تصویر صفحه مقایسه کنید',
            rep_ocr_columns: 'شاید چند ستونی باشد: ترتیب خواندن ممکن است نادرست باشد',
            rep_ocr_failed: 'خوانده نشد؛ تصویر صفحه ماند',
            rep_ocr_turned: 'به نظر می‌رسد بخشی از صفحه چرخیده چاپ شده است؛ تصویر آن بخش ماند',
            rep_ocrRead: 'خواندن با تشخیص نویسه (OCR)',
            rep_ocrPages: 'صفحه‌ها',
            rep_ocrHint: 'متن فارسی تصویر صفحه‌ها را می‌خواند، حدود 1 تا 2 ثانیه برای هر صفحه؛ «لغو» آن را متوقف می‌کند. واگرد (Ctrl+Z) متن کنونی را برمی‌گرداند.',
            rep_ocrPagesBad: 'صفحه‌ها را به شکل «1-3, 7» بنویسید، از میان این صفحه‌ها: {0}',
            taskOcr: 'خواندن صفحهٔ {0} با تشخیص نویسه (OCR): خط {1} از {2}',
            imp_ocrStart: 'آماده‌سازی تشخیص نویسه (OCR)…'
        },
        en: {
            pdf_ocrFailed: 'Character recognition (OCR) could not start; the scanned pages were kept as pictures.',
            pdf_fontOcr: 'Some fonts Kelk does not know could not be read for sure from the shapes of their letters; OCR can read them (page {0}). Use «Read with OCR».',
            pdf_toUnicodeDoubt: 'The file names some characters of a font otherwise than their shapes read (page {0}). The text is what the file names; compare it with the PDF.',
            pdf_ocrPageFailed: 'Some pages could not be read with character recognition (OCR) and were kept as pictures (page {0}).',
            rep_colNotes: 'Notes',
            rep_ocrHead: 'Pages read with character recognition (OCR)',
            rep_ocr_noLines: 'no line of text found',
            rep_ocr_lowConf: 'low confidence: compare the text with the page',
            rep_ocr_columns: 'may have columns: the reading order may be wrong',
            rep_ocr_failed: 'not read; the page\'s picture was kept',
            rep_ocr_turned: 'part of the page seems printed sideways; its picture was kept',
            rep_ocrRead: 'Read with OCR',
            rep_ocrPages: 'Pages',
            rep_ocrHint: 'Reads the Persian text of the pages\' pictures, about 1–2 seconds a page; Cancel stops it. Undo (Ctrl+Z) brings the current text back.',
            rep_ocrPagesBad: 'Write the pages as «1-3, 7», among these: {0}',
            taskOcr: 'Reading page {0} with OCR: line {1} of {2}',
            imp_ocrStart: 'Starting character recognition (OCR)…'
        },
        ar: {
            pdf_ocrFailed: 'تعذّر بدء التعرّف الضوئي على الحروف (OCR)؛ بقيت الصفحات الممسوحة ضوئيًا صورًا.',
            pdf_fontOcr: 'تعذّرت قراءة بعض الخطوط المجهولة بثقة من أشكال حروفها؛ يمكن للتعرّف الضوئي (OCR) قراءتها (الصفحة {0}). استخدم «القراءة بالتعرّف الضوئي».',
            pdf_toUnicodeDoubt: 'يسمّي الملف بعض حروف خطٍّ بغير ما تقرؤه أشكالها (الصفحة {0}). النص هو ما يسمّيه الملف؛ قارنه بملف PDF.',
            pdf_ocrPageFailed: 'تعذّرت قراءة بعض الصفحات بالتعرّف الضوئي على الحروف (OCR) فبقيت صورًا (الصفحة {0}).',
            rep_colNotes: 'ملاحظات',
            rep_ocrHead: 'صفحات قُرئت بالتعرّف الضوئي على الحروف (OCR)',
            rep_ocr_noLines: 'لم يُعثر على سطر نص',
            rep_ocr_lowConf: 'ثقة منخفضة: قارن النص بصورة الصفحة',
            rep_ocr_columns: 'قد تكون متعددة الأعمدة: قد يكون ترتيب القراءة خاطئًا',
            rep_ocr_failed: 'لم تُقرأ؛ بقيت صورة الصفحة',
            rep_ocr_turned: 'يبدو أن جزءًا من الصفحة مطبوع بالعرض؛ بقيت صورة هذا الجزء',
            rep_ocrRead: 'القراءة بالتعرّف الضوئي (OCR)',
            rep_ocrPages: 'الصفحات',
            rep_ocrHint: 'يقرأ النص الفارسي من صور الصفحات، نحو ثانية إلى ثانيتين للصفحة؛ «إلغاء» يوقفه. التراجع (Ctrl+Z) يعيد النص الحالي.',
            rep_ocrPagesBad: 'اكتب الصفحات بالشكل «1-3, 7»، من بين هذه: {0}',
            taskOcr: 'قراءة الصفحة {0} بالتعرّف الضوئي على الحروف (OCR): السطر {1} من {2}',
            imp_ocrStart: 'تهيئة التعرّف الضوئي على الحروف (OCR)…'
        }
    };
    const NOTES = { noLines: 'rep_ocr_noLines', lowConf: 'rep_ocr_lowConf', columns: 'rep_ocr_columns', failed: 'rep_ocr_failed', turned: 'rep_ocr_turned' };

    const K = root.Kelk;
    const t = function () { return K.i18n.t.apply(K.i18n, arguments); };
    const nums = function (ps) {
        return Array.from(new Set((ps || []).filter(function (p) { return typeof p === 'number' && isFinite(p); }))).sort(function (a, b) { return a - b; });
    };

    function table(rep, pct, sep) {
        const rows = (Array.isArray(rep.ocr) ? rep.ocr : []).map(function (x) {
            return { cells: [x.page, pct(x.conf), x.notes.map(function (n) { return NOTES[n] ? t(NOTES[n]) : n; }).join(sep())] };
        });
        return rows.length ? { cls: 'report-pages report-ocr', head: 'rep_ocrHead', cols: [['rep_colPage', 'num'], ['rep_colConf', 'num'], ['rep_colNotes', 'why']], rows: rows } : null;
    }

    function scans(entries) {
        const ps = [];
        (entries || []).forEach(function (e) { (e.report ? e.report.notes : []).forEach(function (n) { if (n.code === 'ocrNeeded') Array.prototype.push.apply(ps, n.pages || []); }); });
        return nums(ps);
    }
    /** whether a report says OCR could read fonts Kelk does not know (the note fontOcr, 3.5) */
    function fonts(entries) {
        return (entries || []).some(function (e) { return (e.report ? e.report.notes : []).some(function (n) { return n.code === 'fontOcr'; }); });
    }
    function rangeText(ps) {
        const out = [];
        for (let i = 0; i < ps.length; i++) { let j = i; while (j + 1 < ps.length && ps[j + 1] === ps[j] + 1) j++; out.push(j > i ? ps[i] + '-' + ps[j] : String(ps[i])); i = j; }
        return out.join(', ');
    }
    function rangePages(s, allowed) {
        const FA = '۰۱۲۳۴۵۶۷۸۹', AR = '٠١٢٣٤٥٦٧٨٩', got = [];
        s = String(s || '').replace(/[۰-۹٠-٩]/g, function (d) { return String(FA.indexOf(d) >= 0 ? FA.indexOf(d) : AR.indexOf(d)); })
            .replace(/[–—]/g, '-').replace(/\s*-\s*/g, '-');
        for (const p of s.split(/[,،;\s]+/).filter(Boolean)) {
            const m = /^(\d+)(?:-(\d+))?$/.exec(p);
            if (!m) return null;
            const a = +m[1], b = m[2] ? +m[2] : a;
            if (b < a) return null;
            allowed.forEach(function (n) { if (n >= a && n <= b) got.push(n); });
        }
        return got.length ? nums(got) : null;
    }

    // the button, its range and its hint: made once, in the panel's row of buttons, before «Re-import in safe mode»
    const cur = { entries: [], onOcr: null, close: null };
    let ui = null;
    function make() {
        const acts = K.$('#import-report .report-actions');
        if (!acts) return null;
        const before = K.$('#report-safe');
        const field = document.createElement('label');
        field.className = 'field report-ocr-pages'; field.id = 'report-ocr-field';
        field.innerHTML = '<span></span><input id="report-ocr-pages" type="text" dir="ltr" inputmode="numeric" autocomplete="off" aria-describedby="report-ocr-hint">';
        const btn = document.createElement('button');
        btn.className = 'btn soft'; btn.id = 'report-ocr'; btn.type = 'button'; btn.setAttribute('aria-describedby', 'report-ocr-hint');
        btn.innerHTML = '<i data-lucide="scan-text"></i><span></span>';
        const hint = document.createElement('p');
        hint.className = 'report-safe-hint'; hint.id = 'report-ocr-hint';
        acts.insertBefore(field, before); acts.insertBefore(btn, before); acts.appendChild(hint);
        K.ui.icons(btn);
        const input = field.querySelector('input');
        const read = function () {
            const all = scans(cur.entries), run = cur.onOcr;
            // (no scanned page: OCR for the fonts alone, the whole document)
            const pages = all.length ? rangePages(input.value, all) : [];
            if (!pages) { K.ui.toast(t('rep_ocrPagesBad', rangeText(all)), 'error'); input.focus(); return; }
            if (cur.close) cur.close();
            if (run) run(pages);
        };
        btn.addEventListener('click', read);
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); read(); } });
        return { field: field, input: input, btn: btn, hint: hint };
    }
    function show(entries, onOcr, close) {
        const all = scans(entries), on = !!onOcr && (all.length > 0 || fonts(entries));
        if (!ui && on) ui = make();
        if (!ui) return;
        if (entries !== cur.entries) ui.input.value = rangeText(all);
        cur.entries = entries; cur.onOcr = onOcr || null; cur.close = close || null;
        ui.field.querySelector('span').textContent = t('rep_ocrPages');
        ui.btn.querySelector('span').textContent = t('rep_ocrRead');
        ui.hint.textContent = t('rep_ocrHint');
        [ui.field, ui.btn, ui.hint].forEach(function (x) { x.hidden = !on; });
        ui.field.hidden = !on || !all.length;                // (the range: for scanned pages only)
    }

    // its words join Kelk.i18n's tables
    if (K && K.i18n && K.i18n._strings) {
        const all = K.i18n._strings;
        Object.keys(STRINGS).forEach(function (l) { if (all[l]) Object.assign(all[l], STRINGS[l]); });
    }

    const api = { table: table, show: show, scans: scans, fonts: fonts, rangeText: rangeText, rangePages: rangePages, NOTES: NOTES, STRINGS: STRINGS };
    root.KelkOcrReport = api;
    if (K) K.ocrReport = api;
})(typeof window !== 'undefined' ? window : globalThis);
