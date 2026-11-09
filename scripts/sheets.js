/**
 * The Excel view (Kelk.config.libs.sheets: loaded with lib/XlsxBuilder.js on the first switch to Excel, or the first
 * XLSX / CSV export). Every Markdown table of the text is a sheet (lib/XlsxBuilder: its name is the heading or bold
 * line above it); Settings → Excel and the XLSX fonts (Settings → Fonts) configure it.
 *
 *   KelkSheets.render()                the preview (#sheets): a block per sheet — its name, rows and columns, the
 *       first rows (Settings → Excel → excel.previewRows), a note for the rest; a note that Excel embeds no fonts
 *   KelkSheets.hasTables(markdown)     does the text hold a table?
 *   KelkSheets.showNoTables(onAnyway, mode)   the report panel (Kelk.ui.report.custom): the text has no table.
 *       mode '' (the switch to Excel did not happen: its button opens the view anyway) | 'export' (an XLSX or CSV
 *       export: nothing to write)
 *   KelkSheets.blob(kind)              'xlsx' (SheetJS loads first: Kelk.config.libs.xlsx) | 'csv' (a zip of CSV files)
 *   KelkSheets.STRINGS                 its words (xs_*), fa / en / ar: added to Kelk.i18n's tables when it loads
 *       (tools/check-i18n.js reads them from here)
 */
(function (root) {
    'use strict';

    const STRINGS = {
        fa: {
            xs_title: 'جدولی برای اکسل نیست',
            xs_none: 'این متن جدول ندارد. در نمای اکسل هر جدول Markdown یک شیت می‌شود و نامش عنوان یا خط پررنگ بالای آن است.',
            xs_brief: 'جدولی نیست؛ نما عوض نشد',
            xs_exportNone: 'این متن جدول ندارد؛ چیزی برای XLSX یا CSV نیست.',
            xs_exportBrief: 'جدولی برای خروجی نیست',
            xs_format: 'یک جدول Markdown: سطر سرستون‌ها، یک سطر خط‌تیره، بعد سطرهای داده:',
            xs_anyway: 'نمای اکسل را باز کن',
            xs_empty: 'این متن جدول ندارد. هر جدول Markdown یک شیت می‌شود.',
            xs_size: '{0} سطر · {1} ستون',
            xs_more: '{0} سطر دیگر اینجا نمایش داده نمی‌شود؛ XLSX و CSV همهٔ سطرها را دارند (تنظیمات ← اکسل ← سطرهای پیش‌نمایش).',
            xs_fonts: 'اکسل فونت را درون فایل نمی‌گذارد: فایل فقط نام {0} و {1} را دارد و رایانه‌ای که آن‌ها را ندارد، فونت دیگری نشان می‌دهد (تنظیمات ← فونت (قلم)).',
            xs_count: '{0} شیت',
            xs_table: 'جدول',
            xs_data: 'داده‌ها',
            xs_region: 'شیت '
        },
        en: {
            xs_title: 'No table for Excel',
            xs_none: 'This text has no table. In the Excel view each Markdown table becomes a sheet, named by the heading or bold line above it.',
            xs_brief: 'No table: the view did not change',
            xs_exportNone: 'This text has no table, so there is nothing for XLSX or CSV.',
            xs_exportBrief: 'No table to export',
            xs_format: 'A Markdown table: a header row, a row of dashes, then the data rows:',
            xs_anyway: 'Open the Excel view anyway',
            xs_empty: 'This text has no table. Each Markdown table becomes a sheet.',
            xs_size: '{0} rows · {1} columns',
            xs_more: '{0} more rows are not shown here; XLSX and CSV hold every row (Settings → Excel → Rows in the preview).',
            xs_fonts: 'Excel cannot embed fonts: the file only names {0} and {1}, and a computer without them shows other fonts (Settings → Fonts).',
            xs_count: '{0} sheets',
            xs_table: 'Table',
            xs_data: 'Data',
            xs_region: 'Sheet '
        },
        ar: {
            xs_title: 'لا جدول لـ Excel',
            xs_none: 'لا يحتوي هذا النص على جدول. في عرض Excel يصبح كل جدول Markdown ورقةً، اسمها العنوان أو السطر الغامق فوقه.',
            xs_brief: 'لا جدول؛ لم يتغير العرض',
            xs_exportNone: 'لا يحتوي هذا النص على جدول؛ فلا شيء لـ XLSX أو CSV.',
            xs_exportBrief: 'لا جدول للتصدير',
            xs_format: 'جدول Markdown: صف العناوين، ثم صف من الشَّرطات، ثم صفوف البيانات:',
            xs_anyway: 'افتح عرض Excel مع ذلك',
            xs_empty: 'لا يحتوي هذا النص على جدول. كل جدول Markdown يصبح ورقة.',
            xs_size: '{0} صف · {1} عمود',
            xs_more: '{0} صفًّا أخرى لا تظهر هنا؛ وفي XLSX وCSV كل الصفوف (الإعدادات ← Excel ← صفوف المعاينة).',
            xs_fonts: 'لا يستطيع Excel تضمين الخطوط: يذكر الملف اسمَي {0} و{1} فقط، والحاسوب الذي لا يملكهما يعرض خطوطًا أخرى (الإعدادات ← الخطوط).',
            xs_count: '{0} ورقة',
            xs_table: 'جدول',
            xs_data: 'البيانات',
            xs_region: 'ورقة '
        }
    };
    const SAMPLE = '| Name | Age |\n|------|-----|\n| Ann  | 31  |';

    const K = function () { return root.Kelk; };
    const t = function () { const k = K(); return k.i18n.t.apply(k.i18n, arguments); };
    const esc = function (s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
    };

    /** A builder configured from Settings → Excel and the XLSX fonts, with the text's tables. */
    function builder(md) {
        const k = K(), s = k.store.settings(), f = k.settings.fontsFor('xlsx');
        const ex = Object.assign({}, k.config.defaults.excel, s.excel || {});
        const rows = +ex.previewRows || 20;
        delete ex.previewRows;
        const b = XlsxBuilder.create().configure({
            fonts: { bidi: f.bidi, latin: f.latin },
            fontSizes: { bidi: +s.fonts.bidiSize || 12, latin: +s.fonts.latinSize || 11 },
            excel: ex, charsets: k.config.fontCharset || {},
            words: { table: t('xs_table'), data: t('xs_data') },
            title: k.names.title() || ''
        });
        b.addFromMarkdown(md);
        return { b: b, rows: rows, excel: ex, fonts: f };
    }

    function hasTables(md) {
        if (!/\|/.test(md || '')) return false;
        try { return XlsxBuilder.findTables(md).length > 0; } catch (e) { return false; }
    }

    function render() {
        const k = K(), box = k.$('#sheets'), count = k.$('#sheets-count');
        if (!box || k.slides.view() !== 'excel') return;
        const md = k.editor.value();
        box.setAttribute('dir', k.i18n.dir());
        if (!md.trim()) { box.innerHTML = ''; if (count) count.textContent = ''; return; }
        let c, plans;
        try { c = builder(md); plans = c.b.plans(); } catch (e) {
            box.innerHTML = '<p class="kx-note warn">' + esc(t('failed', e.message)) + '</p>';
            return;
        }
        if (count) count.textContent = plans.length ? t('xs_count', plans.length) : '';
        if (!plans.length) { box.innerHTML = '<div class="kx-sheets"><p class="kx-note warn">' + esc(t('xs_empty')) + '</p></div>'; return; }
        // the preview shows the XLSX fonts; one Kelk ships as a PDF font file (B Nazanin …) loads on first use
        [c.fonts.bidi, c.fonts.latin].forEach(function (x) { if (k.config.fontsFromPdf.indexOf(x) >= 0) k.fonts.fromPdf(x); });
        const keep = box.querySelectorAll('.kx-scroll');
        const scroll = Array.prototype.map.call(keep, function (el) { return [el.scrollLeft, el.scrollTop]; });
        box.innerHTML = XlsxBuilder.previewHtml(plans, {
            rows: c.rows, excel: c.excel, fonts: c.fonts,
            size: function (r, n) { return t('xs_size', r, n); },
            more: function (n) { return t('xs_more', n); },
            label: t('xs_region'),
            note: '<p class="kx-note" dir="auto">' + esc(t('xs_fonts', c.fonts.bidi, c.fonts.latin)) + '</p>'
        });
        // a redraw while typing keeps each sheet where it was scrolled to
        box.querySelectorAll('.kx-scroll').forEach(function (el, i) { if (scroll[i]) { el.scrollLeft = scroll[i][0]; el.scrollTop = scroll[i][1]; } });
    }

    function showNoTables(onAnyway, mode) {
        const k = K(), exp = mode === 'export';
        const add = function (box, tag, cls, txt) {
            const e = box.appendChild(document.createElement(tag));
            if (cls) e.className = cls;
            if (txt != null) e.textContent = txt;
            return e;
        };
        return k.ui.report.custom({
            icon: 'sheet',
            title: function () { return t('xs_title'); },
            brief: function () { return t(exp ? 'xs_exportBrief' : 'xs_brief'); },
            body: function (box) {
                add(box, 'p', 'report-summary', t(exp ? 'xs_exportNone' : 'xs_none'));
                add(box, 'p', 'report-summary', t('xs_format'));
                const pre = add(box, 'pre', 'report-sample', SAMPLE);
                pre.setAttribute('dir', 'ltr');
            },
            buttons: exp || !onAnyway ? [] : [
                { icon: 'sheet', label: function () { return t('xs_anyway'); }, run: function () { k.ui.report.close(false); onAnyway(); } }
            ]
        });
    }

    async function blob(kind) {
        const k = K(), c = builder(k.editor.value());
        if (kind === 'xlsx') {
            await k.libs.need('xlsx');
            return c.b.toBlob();
        }
        await k.libs.need('jszip');
        return c.b.toCsvZip();
    }

    // in the page: its words join Kelk.i18n's tables, the preview's stylesheet joins the page
    if (root.Kelk && root.Kelk.i18n && root.Kelk.i18n._strings) {
        const all = root.Kelk.i18n._strings;
        Object.keys(STRINGS).forEach(function (l) { if (all[l]) Object.assign(all[l], STRINGS[l]); });
    }
    if (typeof document !== 'undefined' && typeof XlsxBuilder !== 'undefined' && !document.getElementById('kelk-sheets-css')) {
        const st = document.createElement('style');
        st.id = 'kelk-sheets-css';
        st.textContent = XlsxBuilder.previewCss();
        document.head.appendChild(st);
    }

    const api = { render: render, hasTables: hasTables, showNoTables: showNoTables, blob: blob, STRINGS: STRINGS };
    root.KelkSheets = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
