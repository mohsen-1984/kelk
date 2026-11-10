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
 *   KelkSheets.importSheets(o)         CSV and XLSX files from Kelk.importer (lib/SheetImporter.js): each sheet one
 *       «##» heading and one table in the editor, then the Excel view and the summary. Several CSVs: the order
 *       dialog, each with its rows, columns, encoding and separator; CSVs beside documents: the user picks one kind
 *       (the documents chosen go back to the importer: { docs }). Over Kelk.config.maxSheetCells: refused.
 *   KelkSheets.summary(rows)           the report panel: a table of the sheets — the text's tables, or rows given
 *   KelkSheets.looksLikeCsv(text)      pasted text that is CSV or tab-separated (2+ lines, the same separator count
 *       on each, not a Markdown table) — synchronous: the paste event decides on it
 *   KelkSheets.pasteCsv(text)          such a paste → a heading and a table at the cursor, then the summary
 *   KelkSheets.afterPaste(text)        any other paste in the Excel view: the summary when it holds a table
 *   KelkSheets.headTables(md)          a rich paste's Markdown (cells copied from Excel or a web page come as an HTML
 *       table) with a «## Table N» heading above each table that has no heading or bold line: a sheet name
 *   KelkSheets.STRINGS                 its words (xs_*, and Settings → Excel's ex*), fa / en / ar: added to
 *       Kelk.i18n's tables when it loads, then Settings → Excel is labelled (it loads when that group opens: settings.js)
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
            xs_region: 'شیت ',
            xs_reading: 'خواندن {0}…',
            xs_kind: 'وارد شود:',
            xs_kindCsv: 'شیت‌های CSV ({0})',
            xs_kindDoc: 'سندها ({0})',
            xs_notDoc: 'سند است؛ شیت‌های CSV انتخاب شده‌اند',
            xs_notCsv: 'CSV است؛ سندها انتخاب شده‌اند',
            xs_info: '{0} سطر · {1} ستون · {2} · جداکننده: {3}',
            xs_emptyFile: 'خالی است',
            xs_sepBar: 'خط عمودی (|)',
            xs_tooMany: 'برای ویرایشگر خیلی بزرگ است: {0} سلول (بیشینه {1}). فایل را کوچک‌تر کنید یا چند بخش کنید.',
            xs_loaded: '{0} شیت وارد شد',
            xs_sumTitle: 'خلاصهٔ شیت‌ها',
            xs_sumBrief: '{0} شیت · {1} سطر',
            xs_colSheet: 'شیت',
            xs_colSource: 'فایل',
            xs_colRows: 'سطر',
            xs_colCols: 'ستون',
            xs_colEnc: 'کدگذاری',
            xs_colSep: 'جداکننده',
            xs_total: 'جمع',
            xs_most: '{0} (بیشترین)',
            xs_emptySheets: 'شیت‌های خالی که وارد نشدند: {0}',
            xs_sumNote: 'سطرها یعنی سطرهای زیر سرستون. در ویرایشگر هر شیت یک عنوان ## و یک جدول است؛ XLSX و CSV از همین جدول‌ها ساخته می‌شوند.',
            // Settings → Excel (index.html, #excel-group): labelled when this module loads
            exSheets: 'جدول‌ها',
            exSheetsEach: 'هر جدول یک شیت',
            exSheetsOne: 'همهٔ جدول‌ها در یک شیت',
            exGap: 'سطرهای خالی بین جدول‌ها',
            exTitleRow: 'نام هر جدول بالای آن',
            exDirection: 'جهت شیت',
            exWrap: 'شکستن متن سلول',
            exWrapNone: 'بدون شکستن',
            exWrapMulti: 'سلول‌های چندخطی',
            exWrapAll: 'همهٔ سلول‌ها',
            exZeros: 'صفرهای ابتدایی بماند (0012 متن می‌ماند)',
            exThousands: 'جداکنندهٔ هزارگان برای عددها',
            exLinks: 'پیوندها بماند',
            exBreaks: '<br> در سلول، شکست خط شود',
            exHeaderColor: 'رنگ سرستون',
            exStripes: 'سطرهای راه‌راه',
            exStripeColor: 'رنگ راه‌راه',
            exHeaderBorder: 'کادر سرستون',
            exBodyBorder: 'کادر سلول‌ها',
            exBorderAll: 'دورتادور',
            exBorderNone: 'بدون کادر',
            exThin: 'نازک',
            exMedium: 'متوسط',
            exBorderColor: 'رنگ کادر',
            exBorderWidth: 'ضخامت',
            exHeaderHeight: 'ارتفاع سطر سرستون (pt؛ 0: پیش‌فرض اکسل)',
            exFilter: 'فیلتر روی سرستون',
            exFreeze: 'ثابت‌ماندن سطر سرستون',
            exColumns: 'پهنای ستون‌ها',
            exColContent: 'به اندازهٔ محتوا',
            exColPage: 'به پهنای صفحه',
            exOrientAuto: 'خودکار',
            exMarginsKelk: 'کلک (بالا و پایین 1 cm، کناره‌ها 0.5 cm)',
            exMarginsNormal: 'معمولی',
            exMarginsWide: 'پهن',
            exMarginsNarrow: 'باریک',
            exCenter: 'وسط صفحه (افقی)',
            exFit: 'جا شدن در پهنای صفحه',
            exHeaderFooter: 'نام شیت و شمارهٔ صفحه در چاپ',
            exCsv: 'CSV',
            exCsvSep: 'جداکننده',
            exComma: 'ویرگول (,)',
            exSemicolon: 'نقطه‌ویرگول (;)',
            exTab: 'Tab',
            exCsvBom: 'UTF-8 با BOM (اکسل متن فارسی را درست می‌خواند)',
            exPreviewRows: 'سطرهای پیش‌نمایش',
            exPrint: 'چاپ'
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
            xs_region: 'Sheet ',
            xs_reading: 'Reading {0}…',
            xs_kind: 'Import:',
            xs_kindCsv: 'CSV sheets ({0})',
            xs_kindDoc: 'Documents ({0})',
            xs_notDoc: 'a document: CSV sheets were chosen',
            xs_notCsv: 'a CSV: documents were chosen',
            xs_info: '{0} rows · {1} columns · {2} · separator: {3}',
            xs_emptyFile: 'empty',
            xs_sepBar: 'bar (|)',
            xs_tooMany: 'Too large for the editor: {0} cells (at most {1}). Make the file smaller or split it.',
            xs_loaded: '{0} sheets imported',
            xs_sumTitle: 'Sheets summary',
            xs_sumBrief: '{0} sheets · {1} rows',
            xs_colSheet: 'Sheet',
            xs_colSource: 'File',
            xs_colRows: 'Rows',
            xs_colCols: 'Columns',
            xs_colEnc: 'Encoding',
            xs_colSep: 'Separator',
            xs_total: 'Total',
            xs_most: '{0} (most)',
            xs_emptySheets: 'Empty sheets not imported: {0}',
            xs_sumNote: 'Rows are those under the header row. In the editor each sheet is a ## heading and a table; XLSX and CSV are made from these tables.',
            // Settings → Excel (index.html, #excel-group): labelled when this module loads
            exSheets: 'Tables',
            exSheetsEach: 'A sheet for each table',
            exSheetsOne: 'All tables in one sheet',
            exGap: 'Empty rows between tables',
            exTitleRow: 'Each table’s name above it',
            exDirection: 'Sheet direction',
            exWrap: 'Wrap text in cells',
            exWrapNone: 'No wrapping',
            exWrapMulti: 'Cells with several lines',
            exWrapAll: 'All cells',
            exZeros: 'Keep leading zeros (0012 stays text)',
            exThousands: 'Thousands separator for numbers',
            exLinks: 'Keep links',
            exBreaks: '<br> in a cell is a line break',
            exHeaderColor: 'Header fill',
            exStripes: 'Striped rows',
            exStripeColor: 'Stripe color',
            exHeaderBorder: 'Header borders',
            exBodyBorder: 'Cell borders',
            exBorderAll: 'All around',
            exBorderNone: 'None',
            exThin: 'Thin',
            exMedium: 'Medium',
            exBorderColor: 'Border color',
            exBorderWidth: 'Thickness',
            exHeaderHeight: 'Header row height (pt; 0: Excel’s own)',
            exFilter: 'Filter on the header row',
            exFreeze: 'Freeze the header row',
            exColumns: 'Column widths',
            exColContent: 'Fit the content',
            exColPage: 'Fit the page width',
            exOrientAuto: 'Automatic',
            exMarginsKelk: 'Kelk (1 cm top and bottom, 0.5 cm sides)',
            exMarginsNormal: 'Normal',
            exMarginsWide: 'Wide',
            exMarginsNarrow: 'Narrow',
            exCenter: 'Center on the page (horizontally)',
            exFit: 'Fit to the page width',
            exHeaderFooter: 'Sheet name and page numbers when printed',
            exCsv: 'CSV',
            exCsvSep: 'Separator',
            exComma: 'Comma (,)',
            exSemicolon: 'Semicolon (;)',
            exTab: 'Tab',
            exCsvBom: 'UTF-8 with BOM (Excel reads Persian text right)',
            exPreviewRows: 'Rows in the preview',
            exPrint: 'Print'
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
            xs_region: 'ورقة ',
            xs_reading: 'قراءة {0}…',
            xs_kind: 'استيراد:',
            xs_kindCsv: 'أوراق CSV ({0})',
            xs_kindDoc: 'المستندات ({0})',
            xs_notDoc: 'مستند؛ اختيرت أوراق CSV',
            xs_notCsv: 'ملف CSV؛ اختيرت المستندات',
            xs_info: '{0} صف · {1} عمود · {2} · الفاصل: {3}',
            xs_emptyFile: 'فارغ',
            xs_sepBar: 'خط عمودي (|)',
            xs_tooMany: 'كبير جدًّا على المحرر: {0} خلية (الحد {1}). صغّر الملف أو قسّمه.',
            xs_loaded: 'استُوردت {0} ورقة',
            xs_sumTitle: 'ملخص الأوراق',
            xs_sumBrief: '{0} ورقة · {1} صف',
            xs_colSheet: 'الورقة',
            xs_colSource: 'الملف',
            xs_colRows: 'الصفوف',
            xs_colCols: 'الأعمدة',
            xs_colEnc: 'الترميز',
            xs_colSep: 'الفاصل',
            xs_total: 'المجموع',
            xs_most: '{0} (الأكثر)',
            xs_emptySheets: 'أوراق فارغة لم تُستورد: {0}',
            xs_sumNote: 'الصفوف هي ما تحت صف العناوين. في المحرر كل ورقة عنوان ## وجدول؛ ومن هذه الجداول يُصنع XLSX وCSV.',
            // Settings → Excel (index.html, #excel-group): labelled when this module loads
            exSheets: 'الجداول',
            exSheetsEach: 'ورقة لكل جدول',
            exSheetsOne: 'كل الجداول في ورقة واحدة',
            exGap: 'صفوف فارغة بين الجداول',
            exTitleRow: 'اسم كل جدول فوقه',
            exDirection: 'اتجاه الورقة',
            exWrap: 'التفاف النص في الخلايا',
            exWrapNone: 'بلا التفاف',
            exWrapMulti: 'الخلايا متعددة الأسطر',
            exWrapAll: 'كل الخلايا',
            exZeros: 'إبقاء الأصفار في البداية (يبقى 0012 نصًّا)',
            exThousands: 'فاصل الآلاف للأعداد',
            exLinks: 'إبقاء الروابط',
            exBreaks: '<br> في الخلية فاصل سطر',
            exHeaderColor: 'لون صف العناوين',
            exStripes: 'صفوف مخططة',
            exStripeColor: 'لون التخطيط',
            exHeaderBorder: 'حدود صف العناوين',
            exBodyBorder: 'حدود الخلايا',
            exBorderAll: 'من كل الجهات',
            exBorderNone: 'بلا حدود',
            exThin: 'رفيع',
            exMedium: 'متوسط',
            exBorderColor: 'لون الحدود',
            exBorderWidth: 'السُّمك',
            exHeaderHeight: 'ارتفاع صف العناوين (pt؛ 0: ارتفاع Excel)',
            exFilter: 'عامل تصفية على صف العناوين',
            exFreeze: 'تثبيت صف العناوين',
            exColumns: 'عرض الأعمدة',
            exColContent: 'بقدر المحتوى',
            exColPage: 'بعرض الصفحة',
            exOrientAuto: 'تلقائي',
            exMarginsKelk: 'كِلك (1 cm أعلى وأسفل، 0.5 cm الجانبان)',
            exMarginsNormal: 'عادية',
            exMarginsWide: 'عريضة',
            exMarginsNarrow: 'ضيقة',
            exCenter: 'في وسط الصفحة (أفقيًّا)',
            exFit: 'ملاءمة عرض الصفحة',
            exHeaderFooter: 'اسم الورقة وأرقام الصفحات عند الطباعة',
            exCsv: 'CSV',
            exCsvSep: 'الفاصل',
            exComma: 'فاصلة (,)',
            exSemicolon: 'فاصلة منقوطة (;)',
            exTab: 'Tab',
            exCsvBom: 'UTF-8 مع BOM (يقرأ Excel النص العربي صحيحًا)',
            exPreviewRows: 'صفوف المعاينة',
            exPrint: 'الطباعة'
        }
    };
    /** the summary's table in the report panel */
    const REPORT_CSS = [
        '.xs-sum-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:4px 0 8px}',
        '.xs-sum{border-collapse:collapse;font-size:12.5px;width:100%}',
        '.xs-sum th,.xs-sum td{padding:4px 8px;border-bottom:1px solid var(--line);text-align:start;white-space:nowrap}',
        '.xs-sum th{font-weight:600;color:var(--muted);background:var(--panel-2)}',
        '.xs-sum td.n{text-align:center;font-variant-numeric:tabular-nums}',
        '.xs-sum td.src{color:var(--muted)}',
        '.xs-sum tfoot td{font-weight:600;border-bottom:0;border-top:2px solid var(--line-strong)}',
        // the dark theme: the sheets take the app's colors (their own colors: translated in render)
        '[data-theme="dark"] .kx-sheet{background:var(--panel);color:var(--ink);border-color:var(--line);box-shadow:none}',
        '[data-theme="dark"] .kx-head,[data-theme="dark"] .kx-more{background:var(--panel-2);border-color:var(--line)}',
        '[data-theme="dark"] .kx-size,[data-theme="dark"] .kx-more{color:var(--muted)}',
        '[data-theme="dark"] .kx-grid .kx-rn{background:var(--code-bg);color:var(--muted);border-color:var(--line)}',
        '[data-theme="dark"] .kx-grid thead .kx-rn{background:var(--panel-2)}',
        '[data-theme="dark"] .kx-grid tr.title td,[data-theme="dark"] .kx-grid tr.gap td{background:var(--panel)}',
        '[data-theme="dark"] .kx-grid .lnk{color:var(--accent-ink)}',
        '[data-theme="dark"] .kx-note.warn{background:#3b2c14;color:#f1cf94}'
    ].join('\n');
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
            title: k.names.title() || '',
            meta: { title: k.names.title() || '', author: (s.document && s.document.author) || '', creator: 'Kelk ' + k.config.version }   // as the other files
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
        // the dark theme: the sheet's colors translated as the document preview's are (the files keep the chosen ones)
        let ex = c.excel;
        const dk = document.documentElement.getAttribute('data-theme') === 'dark' && k.preview.dark;
        if (dk) {
            ex = Object.assign({}, ex, { headerColor: dk.fill(ex.headerColor), stripeColor: dk.fill(ex.stripeColor),
                headerBorderColor: dk.line(ex.headerBorderColor), bodyBorderColor: dk.line(ex.bodyBorderColor) });
        }
        box.innerHTML = XlsxBuilder.previewHtml(plans, {
            rows: c.rows, excel: ex, fonts: c.fonts,
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

    // ---- import: CSV, XLSX → the editor's Markdown -------------------------------------------------------------

    const SEP = { ',': 'exComma', ';': 'exSemicolon', '\t': 'exTab', '|': 'xs_sepBar' };
    const ENC = { 'utf-8': 'UTF-8', 'utf-16le': 'UTF-16', 'utf-16be': 'UTF-16', 'windows-1256': 'Windows-1256' };
    const sepName = function (c) { return SEP[c] ? t(SEP[c]) : JSON.stringify(c); };
    const stem = function (n) { return String(n || '').replace(/\.[^.]*$/, ''); };
    const isCsv = function (d) { return /\.csv$/i.test(d.name); };
    const isXlsx = function (d) { return /\.xlsx$/i.test(d.name); };

    /**
     * o: { docs (the importer's: { name, path, size, file }), skipped, images, files, first, maxMB }.
     * Resolves null when done here (imported, cancelled or refused), or { docs } when the user chose the documents.
     */
    async function importSheets(o) {
        const k = K();
        const sheets = o.docs.filter(function (d) { return isCsv(d) || isXlsx(d); });
        const others = o.docs.filter(function (d) { return !isCsv(d) && !isXlsx(d); });
        await k.libs.need('sheetimport');
        if (sheets.some(isXlsx)) await k.libs.need('xlsx');
        // read every sheet first: the order dialog shows what each CSV holds
        await k.ui.task(t('xs_reading', o.first), async function (task) {
            for (const d of sheets) {
                if (task.signal.aborted) return;
                task.label(t('xs_reading', d.name));
                const bytes = new Uint8Array(await d.file.arrayBuffer());
                if (isXlsx(d)) {
                    d.book = SheetImporter.readXlsx(bytes, { mergedRows: k.store.getUi('importer.mergedRows') });   // Settings → Import
                } else {
                    d.csv = SheetImporter.readCsv(bytes, { persianLetters: k.store.getUi('importer.persianLetters') !== false });
                    const z = SheetImporter.size(d.csv.rows);
                    d.info = d.csv.error ? t('xs_emptyFile') : t('xs_info', z.rows, z.cols, ENC[d.csv.encoding] || d.csv.encoding, sepName(d.csv.separator));
                }
            }
        });
        let value = 'csv', choice = null;
        const pick = function (v) {
            const on = v === 'csv' ? sheets : others, off = v === 'csv' ? others : sheets;
            return { docs: on, skipped: o.skipped.concat(off.map(function (d) {
                return { name: d.name, path: d.path, size: d.size, reason: 'kind', note: t(v === 'csv' ? 'xs_notDoc' : 'xs_notCsv') };
            })) };
        };
        if (others.length) {
            value = k.slides.view() === 'excel' || sheets.length >= others.length ? 'csv' : 'doc';
            choice = { label: t('xs_kind'), value: value, pick: pick,
                options: [{ value: 'csv', label: t('xs_kindCsv', sheets.length) }, { value: 'doc', label: t('xs_kindDoc', others.length) }] };
        }
        let chosen = sheets;
        if (choice || sheets.length > 1 || o.skipped.length) {
            const p = pick(value);
            chosen = await k.ui.order({ title: k.i18n.t('orderTitle', o.files.length === 1 ? o.files[0].name : o.first),
                docs: p.docs, skipped: p.skipped, images: value === 'doc' ? o.images : 0, maxMB: o.maxMB, choice: choice });
            if (!chosen || !chosen.length) return null;                  // Cancel: the text stays as it was
        }
        if (!isCsv(chosen[0]) && !isXlsx(chosen[0])) return { docs: chosen };   // the documents: the importer goes on
        // the sheets, in the order chosen; an empty one is left out and named in the summary
        const list = [], empty = [];
        chosen.forEach(function (d) {
            if (d.book) {
                d.book.forEach(function (b) {
                    if (b.rows.length) list.push({ name: b.name, rows: b.rows, source: d.name });
                    else empty.push(b.name);
                });
            } else if (d.csv && d.csv.rows.length) {
                list.push({ name: stem(d.name), rows: d.csv.rows, source: d.name, encoding: d.csv.encoding, separator: d.csv.separator });
            } else empty.push(d.name);
        });
        if (!list.length) { k.ui.toast(k.i18n.t('zipEmpty'), 'warn'); return null; }
        const cells = list.reduce(function (n, x) { return n + SheetImporter.size(x.rows).cells; }, 0);
        const max = +k.config.maxSheetCells || 100000;
        if (cells > max) { k.ui.toast(t('xs_tooMany', cells.toLocaleString('en-US'), max.toLocaleString('en-US')), 'error', 9000); return null; }
        const md = SheetImporter.toMarkdown(list);
        const name = o.files.length === 1 ? o.files[0].name : chosen[0].name;
        k.ui.report.release();
        k.names.setSource(name);
        k.editor.set(md, name);
        k.editor.markConverted(true);
        await k.slides.setView('excel', true);
        if (k.slides.view() === 'excel') render();
        k.ui.toast(t('xs_loaded', list.length));
        summary(list.map(function (x) {
            const z = SheetImporter.size(x.rows);
            return { name: x.name, source: x.source, rows: z.rows, cols: z.cols, encoding: x.encoding ? ENC[x.encoding] || x.encoding : '', separator: x.separator ? sepName(x.separator) : '' };
        }), empty);
        return null;
    }

    /**
     * The report panel: a table of the sheets (a row each: name, source, rows, columns — and for a CSV its encoding
     * and separator), their totals, the empty sheets left out. rows: given by an import, else the text's tables.
     */
    function summary(rows, empty) {
        const k = K();
        if (!rows) {
            let plans = [];
            try { plans = builder(k.editor.value()).b.sheets(); } catch (e) { plans = []; }
            if (!plans.length) { showNoTables(null); return; }
            rows = plans.map(function (p) { return { name: p.name, rows: p.rows.length, cols: p.cols }; });
        }
        const src = rows.some(function (r) { return r.source; }), csv = rows.some(function (r) { return r.encoding; });
        const total = rows.reduce(function (n, r) { return n + r.rows; }, 0);
        const most = rows.reduce(function (n, r) { return Math.max(n, r.cols); }, 0);
        const el = function (box, tag, cls, txt) {
            const e = box.appendChild(document.createElement(tag));
            if (cls) e.className = cls;
            if (txt != null) e.textContent = txt;
            return e;
        };
        return k.ui.report.custom({
            icon: 'sheet',
            title: function () { return t('xs_sumTitle'); },
            brief: function () { return t('xs_sumBrief', rows.length, total); },
            body: function (box) {
                const wrap = el(box, 'div', 'xs-sum-wrap');
                const table = el(wrap, 'table', 'xs-sum');
                const head = ['#', t('xs_colSheet')].concat(src ? [t('xs_colSource')] : [], [t('xs_colRows'), t('xs_colCols')], csv ? [t('xs_colEnc'), t('xs_colSep')] : []);
                const tr = el(el(table, 'thead'), 'tr');
                head.forEach(function (h) { el(tr, 'th', '', h).scope = 'col'; });
                const body = el(table, 'tbody');
                rows.forEach(function (r, i) {
                    const row = el(body, 'tr');
                    el(row, 'td', 'n', String(i + 1));
                    el(row, 'td', '', r.name).dir = 'auto';
                    if (src) el(row, 'td', 'src', r.source || '').dir = 'auto';
                    el(row, 'td', 'n', String(r.rows));
                    el(row, 'td', 'n', String(r.cols));
                    if (csv) { el(row, 'td', '', r.encoding || '').dir = 'ltr'; el(row, 'td', '', r.separator || ''); }
                });
                const foot = el(el(table, 'tfoot'), 'tr');
                el(foot, 'td', '', '');
                el(foot, 'td', '', t('xs_total') + ': ' + t('xs_count', rows.length));
                if (src) el(foot, 'td', '', '');
                el(foot, 'td', 'n', String(total));
                el(foot, 'td', 'n', t('xs_most', most));
                if (csv) { el(foot, 'td', '', ''); el(foot, 'td', '', ''); }
                if (empty && empty.length) el(box, 'p', 'report-summary', t('xs_emptySheets', empty.join('، ')));
                el(box, 'p', 'report-summary', t('xs_sumNote'));
            },
            buttons: []
        });
    }

    // ---- paste in the Excel view ---------------------------------------------------------------------------------

    /** The records of a CSV text (a line break inside quotes stays in its record), the first 50. */
    function records(text) {
        const out = [];
        let cur = '', q = false;
        for (let i = 0; i < text.length && out.length < 50; i++) {
            const ch = text[i];
            if (ch === '"') q = !q;
            if ((ch === '\n' || ch === '\r') && !q) {
                if (ch === '\r' && text[i + 1] === '\n') i++;
                if (cur.trim()) out.push(cur);
                cur = '';
            } else cur += ch;
        }
        if (cur.trim() && out.length < 50) out.push(cur);
        return out;
    }
    /** The separator count outside quotes. */
    function countSep(rec, sep) {
        let n = 0, q = false;
        for (let i = 0; i < rec.length; i++) {
            const ch = rec[i];
            if (ch === '"') q = !q;
            else if (ch === sep && !q) n++;
        }
        return n;
    }
    function looksLikeCsv(text) {
        const recs = records(String(text || ''));
        if (recs.length < 2) return false;
        if (recs.some(function (l) { return /^\s*\|/.test(l); })) return false;            // a Markdown table
        return ['\t', ',', ';'].some(function (sep) {
            const n = countSep(recs[0], sep);
            return n >= 1 && recs.every(function (l) { return countSep(l, sep) === n; });
        });
    }

    async function pasteCsv(text) {
        const k = K();
        try {
            await k.libs.need('sheetimport');
            const r = SheetImporter.readCsv(new TextEncoder().encode(text), { persianLetters: k.store.getUi('importer.persianLetters') !== false });
            const z = SheetImporter.size(r.rows), max = +k.config.maxSheetCells || 100000;
            if (z.cells > max) { k.ui.toast(t('xs_tooMany', z.cells.toLocaleString('en-US'), max.toLocaleString('en-US')), 'error', 9000); return; }
            let count = 0;
            try { count = XlsxBuilder.findTables(k.editor.value()).length; } catch (e) { count = 0; }
            const name = t('xs_table') + ' ' + (count + 1);
            k.editor.insert(lead() + SheetImporter.toMarkdown([{ name: name, rows: r.rows }]) + '\n');
            render();
            summary();
        } catch (e) {
            k.ui.toast(t('failed', e.message), 'error');
        }
    }

    /** The line breaks a heading pasted at the cursor needs to stand apart from the text before it. */
    function lead() {
        const k = K(), area = k.$ && k.$('#editor');
        if (!area) return '';
        const before = area.value.slice(0, area.selectionStart);
        return !before.trim() ? '' : /\n\n$/.test(before) ? '' : /\n$/.test(before) ? '\n' : '\n\n';
    }

    function afterPaste(text) { if (hasTables(text)) summary(); }

    /** A heading for each table that has none above it, numbered after the text's own tables (as pasteCsv). */
    function headTables(md) {
        const k = K(), lines = String(md || '').split('\n');
        let n = 0;
        try { n = XlsxBuilder.findTables(k.editor.value()).length; } catch (e) { n = 0; }
        const sep = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;
        const out = [];
        for (let i = 0; i < lines.length; i++) {
            const starts = /\|/.test(lines[i]) && i + 1 < lines.length && sep.test(lines[i + 1]) && /\|/.test(lines[i + 1]) &&
                !(i > 0 && /\|/.test(lines[i - 1]) && lines[i - 1].trim());          // not a row of the table above
            if (starts) {
                let j = out.length - 1;
                while (j >= 0 && !out[j].trim()) j--;
                const named = j >= 0 && (/^#{1,6}\s/.test(out[j]) || /^\s*\*\*[^*]+\*\*\s*:?\s*$/.test(out[j]));
                if (!named) {
                    if (out.length && out[out.length - 1].trim()) out.push('');
                    out.push('## ' + t('xs_table') + ' ' + (++n), '');
                } else n++;
            }
            out.push(lines[i]);
        }
        const res = out.join('\n');
        return /^## /.test(res) && res !== md ? lead() + res : res;
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
        const group = typeof document !== 'undefined' && document.getElementById('excel-group');
        if (group && root.Kelk.i18n.relabel) root.Kelk.i18n.relabel(group);          // Settings → Excel's words
    }
    if (typeof document !== 'undefined' && typeof XlsxBuilder !== 'undefined' && !document.getElementById('kelk-sheets-css')) {
        const st = document.createElement('style');
        st.id = 'kelk-sheets-css';
        st.textContent = XlsxBuilder.previewCss() + '\n' + REPORT_CSS;
        document.head.appendChild(st);
    }

    const api = { render: render, hasTables: hasTables, showNoTables: showNoTables, blob: blob, importSheets: importSheets, summary: summary,
        looksLikeCsv: looksLikeCsv, pasteCsv: pasteCsv, afterPaste: afterPaste, headTables: headTables, STRINGS: STRINGS };
    root.KelkSheets = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
