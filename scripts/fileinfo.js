/**
 * The imported file's information in the import report (2.7; Kelk.config.libs.fileinfo: loaded on demand by an
 * import, with its words). What the file says, as it says it; what Kelk infers about it, in a group of its own
 * labelled a guess, each with its evidence. The operating system only when the file itself names it (a browser's
 * User-Agent, Quartz's «macOS Version», a platform in a tool's name, Microsoft Print to PDF) — never from the fonts.
 *
 *   KelkFileInfo.fromPdf(r)            PdfImporter's result → info: r.info (the file's words), r.profile (the guesses)
 *   KelkFileInfo.fromOffice(bytes)     a .docx / .xlsx → info from docProps/core.xml and docProps/app.xml (a small zip
 *                                      reader of its own: the browser's DecompressionStream, no library) — a promise
 *   KelkFileInfo.fromHtml(text)        <title>, <html lang>, <meta name="generator" | "author" | "description" | "keywords">
 *   KelkFileInfo.any(info)             something to show
 *   KelkFileInfo.render(box, info)     a closed <details> in the report panel: a table of the file's words, then the guesses
 *   KelkFileInfo.brief(info)           the panel's head line for a file with nothing else to report
 *   KelkFileInfo.lines(info)           the same as plain text (Copy report)
 *   KelkFileInfo.gfm(info)             the same as GFM tables, the file's words then the guesses (the table's Copy button)
 *   KelkFileInfo.STRINGS               its words (fi_*), fa / en / ar: added to Kelk.i18n's tables when it loads
 *
 * info = { kind: 'pdf' | 'office' | 'html', said: [[key, value]], guess: [[key, value, evidence]] }: keys are
 * the words' keys (fi_*); a value is the file's own text (dates only laid out: 2026-11-11 09:30:00 +03:30, never
 * converted) or { t: key, args } for a word of the interface (yes, no, «3 items»), translated when shown.
 */
(function (root) {
    'use strict';

    const STRINGS = {
        fa: {
            fi_head: 'اطلاعات فایل',
            fi_copy: 'رونوشت به‌صورت جدول',
            fi_field: 'ویژگی',
            fi_value: 'مقدار',
            fi_evidenceCol: 'شاهد',
            fi_guessHead: 'برداشت Kelk (حدس؛ در خود فایل نوشته نشده)',
            fi_title: 'عنوان',
            fi_author: 'نویسنده',
            fi_subject: 'موضوع',
            fi_description: 'توضیح',
            fi_keywords: 'کلیدواژه‌ها',
            fi_category: 'دسته',
            fi_creator: 'برنامهٔ سازنده (Creator)',
            fi_producer: 'تولیدکنندهٔ PDF (Producer)',
            fi_creatorTool: 'ابزار سازنده (XMP)',
            fi_xmpProducer: 'تولیدکننده (XMP)',
            fi_history: 'ویرایش‌شده با (تاریخچهٔ XMP)',
            fi_generator: 'سازنده (generator)',
            fi_app: 'برنامه',
            fi_company: 'شرکت',
            fi_template: 'قالب',
            fi_lastBy: 'آخرین ذخیره به نام',
            fi_revision: 'شمارهٔ بازبینی',
            fi_created: 'تاریخ ساخت',
            fi_modified: 'تاریخ تغییر',
            fi_pdfVersion: 'نسخهٔ PDF',
            fi_pages: 'صفحه‌ها',
            fi_words: 'واژه‌ها',
            fi_pageSize: 'اندازهٔ صفحه (صفحهٔ اول)',
            fi_lang: 'زبان',
            fi_tagged: 'برچسب‌دار (tagged، درخت ساختار)',
            fi_outline: 'نشانک‌ها (bookmarks)',
            fi_pageLabels: 'برچسب صفحه (page labels)',
            fi_encrypted: 'رمزگذاری‌شده',
            fi_fonts: 'قلم‌ها',
            fi_notEmbedded: '* جاسازی نشده',
            fi_yes: 'بله',
            fi_no: 'خیر',
            fi_items: '{0} مورد',
            fi_more: 'و {0} مورد دیگر',
            fi_maker: 'ساخته‌شده با',
            fi_engine: 'موتور ترسیم (drawing engine)',
            fi_path: 'مسیر تولید (production path)',
            fi_post: 'بازنویسی‌شده با',
            fi_os: 'سیستم‌عامل',
            fi_pathExport: 'خروجی مستقیم (export)',
            fi_pathPrint: 'چاپ به PDF (print)',
            fi_pathPost: 'پس از ساخت، با ابزار دیگری بازنویسی شده (post-processing)',
            fi_pathOcr: 'لایهٔ متنی OCR روی صفحه‌های اسکن‌شده',
            fi_evNames: 'از نام برنامه و تولیدکننده در فایل',
            fi_evPost: 'نام ابزار بازنویسی در فایل',
            fi_evOcr: 'متن نامرئی روی تصویر صفحه‌ها',
            fi_evidence: 'شاهد: {0}',
            fi_evUa: 'User-Agent مرورگر در فایل: {0}',
            fi_evQuartz: 'Quartz نام سیستم را نوشته است: {0}',
            fi_evTool: 'نام ابزار در فایل: {0}',
            fi_evGdi: 'Microsoft Print to PDF فقط در Windows هست'
        },
        en: {
            fi_head: 'File information',
            fi_copy: 'Copy as a table',
            fi_field: 'Field',
            fi_value: 'Value',
            fi_evidenceCol: 'Evidence',
            fi_guessHead: 'Kelk’s reading (a guess: not written in the file)',
            fi_title: 'Title',
            fi_author: 'Author',
            fi_subject: 'Subject',
            fi_description: 'Description',
            fi_keywords: 'Keywords',
            fi_category: 'Category',
            fi_creator: 'Application (Creator)',
            fi_producer: 'PDF producer (Producer)',
            fi_creatorTool: 'Creator tool (XMP)',
            fi_xmpProducer: 'Producer (XMP)',
            fi_history: 'Edited with (XMP history)',
            fi_generator: 'Generator',
            fi_app: 'Application',
            fi_company: 'Company',
            fi_template: 'Template',
            fi_lastBy: 'Last saved by',
            fi_revision: 'Revision',
            fi_created: 'Created',
            fi_modified: 'Modified',
            fi_pdfVersion: 'PDF version',
            fi_pages: 'Pages',
            fi_words: 'Words',
            fi_pageSize: 'Page size (first page)',
            fi_lang: 'Language',
            fi_tagged: 'Tagged (structure tree)',
            fi_outline: 'Bookmarks (outline)',
            fi_pageLabels: 'Page labels',
            fi_encrypted: 'Encrypted',
            fi_fonts: 'Fonts',
            fi_notEmbedded: '* not embedded',
            fi_yes: 'yes',
            fi_no: 'no',
            fi_items: '{0} items',
            fi_more: 'and {0} more',
            fi_maker: 'Made with',
            fi_engine: 'Drawing engine',
            fi_path: 'Production path',
            fi_post: 'Rewritten by',
            fi_os: 'Operating system',
            fi_pathExport: 'exported directly (Save as PDF)',
            fi_pathPrint: 'printed to PDF',
            fi_pathPost: 'rewritten by another tool after it was made',
            fi_pathOcr: 'an OCR text layer over scanned pages',
            fi_evNames: 'from the application and producer names in the file',
            fi_evPost: 'a rewriting tool’s name in the file',
            fi_evOcr: 'invisible text over the page images',
            fi_evidence: 'evidence: {0}',
            fi_evUa: 'the browser’s User-Agent in the file: {0}',
            fi_evQuartz: 'Quartz names the system: {0}',
            fi_evTool: 'the tool’s name in the file: {0}',
            fi_evGdi: 'Microsoft Print to PDF exists on Windows only'
        },
        ar: {
            fi_head: 'معلومات الملف',
            fi_copy: 'نسخ كجدول',
            fi_field: 'الخاصية',
            fi_value: 'القيمة',
            fi_evidenceCol: 'الدليل',
            fi_guessHead: 'قراءة Kelk (تخمين؛ غير مكتوب في الملف)',
            fi_title: 'العنوان',
            fi_author: 'المؤلف',
            fi_subject: 'الموضوع',
            fi_description: 'الوصف',
            fi_keywords: 'الكلمات المفتاحية',
            fi_category: 'الفئة',
            fi_creator: 'التطبيق المنشئ (Creator)',
            fi_producer: 'منتِج PDF (Producer)',
            fi_creatorTool: 'أداة الإنشاء (XMP)',
            fi_xmpProducer: 'المنتِج (XMP)',
            fi_history: 'عُدِّل باستخدام (سجل XMP)',
            fi_generator: 'المولِّد (generator)',
            fi_app: 'التطبيق',
            fi_company: 'الشركة',
            fi_template: 'القالب',
            fi_lastBy: 'آخر حفظ باسم',
            fi_revision: 'رقم المراجعة',
            fi_created: 'تاريخ الإنشاء',
            fi_modified: 'تاريخ التعديل',
            fi_pdfVersion: 'إصدار PDF',
            fi_pages: 'الصفحات',
            fi_words: 'الكلمات',
            fi_pageSize: 'حجم الصفحة (الصفحة الأولى)',
            fi_lang: 'اللغة',
            fi_tagged: 'موسوم (tagged، شجرة البنية)',
            fi_outline: 'الإشارات المرجعية (bookmarks)',
            fi_pageLabels: 'تسميات الصفحات (page labels)',
            fi_encrypted: 'مشفَّر',
            fi_fonts: 'الخطوط',
            fi_notEmbedded: '* غير مضمَّن',
            fi_yes: 'نعم',
            fi_no: 'لا',
            fi_items: '{0} عناصر',
            fi_more: 'و{0} أخرى',
            fi_maker: 'أُنشئ باستخدام',
            fi_engine: 'محرك الرسم (drawing engine)',
            fi_path: 'مسار الإنتاج (production path)',
            fi_post: 'أعيدت كتابته بواسطة',
            fi_os: 'نظام التشغيل',
            fi_pathExport: 'تصدير مباشر (export)',
            fi_pathPrint: 'طباعة إلى PDF (print)',
            fi_pathPost: 'أعيدت كتابته بأداة أخرى بعد إنشائه (post-processing)',
            fi_pathOcr: 'طبقة نص OCR فوق صفحات ممسوحة ضوئيًا',
            fi_evNames: 'من اسم التطبيق والمنتِج في الملف',
            fi_evPost: 'اسم أداة إعادة الكتابة في الملف',
            fi_evOcr: 'نص غير مرئي فوق صور الصفحات',
            fi_evidence: 'الدليل: {0}',
            fi_evUa: 'سلسلة User-Agent للمتصفح في الملف: {0}',
            fi_evQuartz: 'Quartz يذكر النظام: {0}',
            fi_evTool: 'اسم الأداة في الملف: {0}',
            fi_evGdi: 'Microsoft Print to PDF موجود في Windows فقط'
        }
    };

    // names as their makers write them: the same in every language
    const ENGINES = {
        skia: 'Skia (Chrome, Edge, Google Docs)', quartz: 'Quartz (macOS, iOS)', gdi: 'Microsoft Print to PDF (GDI)',
        word: 'Microsoft Word', excel: 'Microsoft Excel', powerpoint: 'Microsoft PowerPoint', libreoffice: 'LibreOffice',
        wps: 'WPS Office', qt: 'Qt (wkhtmltopdf)', jspdf: 'jsPDF', tex: 'TeX', indesign: 'Adobe InDesign',
        distiller: 'Adobe Acrobat Distiller', cairo: 'cairo (Firefox)', weasyprint: 'WeasyPrint', prince: 'Prince',
        reportlab: 'ReportLab', fop: 'Apache FOP', itext: 'iText', ghostscript: 'Ghostscript', ocr: 'OCR'
    };
    const OS = { windows: 'Windows', macos: 'macOS', ios: 'iOS', android: 'Android', chromeos: 'ChromeOS', linux: 'Linux' };
    const PATHS = { export: 'fi_pathExport', print: 'fi_pathPrint', postprocessed: 'fi_pathPost', ocr: 'fi_pathOcr' };
    const EVIDENCE = { export: 'fi_evNames', print: 'fi_evNames', postprocessed: 'fi_evPost', ocr: 'fi_evOcr' };
    // paper sizes named when the first page is one of them (millimetres, either way round, ±2 mm)
    const PAPER = [['A3', 297, 420], ['A4', 210, 297], ['A5', 148, 210], ['B5', 176, 250], ['Letter', 216, 279], ['Legal', 216, 356]];
    const MAX_FONTS = 12;

    const K = function () { return root.Kelk; };
    const t = function () { const k = K(); return k.i18n.t.apply(k.i18n, arguments); };
    const word = function (key, args) { return { t: key, args: args || [] }; };
    const clean = function (v) { return typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim() : null; };
    const xmlText = function (s) {
        return s.replace(/<[^>]*>/g, '').replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
            .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(+d); })
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    };

    /**
     * A date as the file writes it, only laid out: PDF «D:20261111093000+03'30'» or ISO «2026-11-11T09:30:00+03:30»
     * → «2026-11-11 09:30:00 +03:30» («UTC» for Z; no zone when the file gives none). Anything else stays as written.
     */
    function date(v) {
        v = clean(v);
        if (!v) return null;
        let m = v.match(/^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?\s*(Z|[+-]\d{2}'?\d{0,2}'?)?/);
        if (m) {
            const z = m[7] ? (m[7] === 'Z' ? ' UTC' : ' ' + m[7].slice(0, 3) + ':' + (m[7].replace(/'/g, '').slice(3) || '00')) : '';
            // only the parts the file gives: «D:2026» stays a year, not 2026-01-01
            const day = m[1] + (m[2] ? '-' + m[2] + (m[3] ? '-' + m[3] : '') : '');
            const time = m[3] && m[4] ? ' ' + m[4] + (m[5] ? ':' + m[5] + (m[6] ? ':' + m[6] : '') : '') : '';
            return day + time + (time ? z : '');
        }
        m = v.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?)?\s*(Z|[+-]\d{2}:\d{2})?$/);
        if (m) return m[1] + (m[2] ? ' ' + m[2] : '') + (m[3] ? (m[3] === 'Z' ? ' UTC' : ' ' + m[3]) : '');
        return v;
    }

    /** Points → «210 × 297 mm (A4)» */
    function pageSize(s) {
        if (!Array.isArray(s) || !(s[0] > 0) || !(s[1] > 0)) return null;
        const w = Math.round(s[0] * 25.4 / 72), h = Math.round(s[1] * 25.4 / 72);
        const a = Math.min(w, h), b = Math.max(w, h);
        const p = PAPER.filter(function (x) { return Math.abs(x[1] - a) <= 2 && Math.abs(x[2] - b) <= 2; })[0];
        return w + ' × ' + h + ' mm' + (p ? ' (' + p[0] + ')' : '');
    }

    /** a row when there is something to say */
    const add = function (rows, key, value, evidence) { if (value != null && value !== '') rows.push(evidence === undefined ? [key, value] : [key, value, evidence]); };
    const yesNo = function (b) { return word(b ? 'fi_yes' : 'fi_no'); };

    function fromPdf(r) {
        const i = (r && r.info) || {}, p = (r && r.profile) || {}, said = [], guess = [];
        add(said, 'fi_title', clean(i.title));
        add(said, 'fi_author', clean(i.author));
        add(said, 'fi_subject', clean(i.subject));
        add(said, 'fi_keywords', clean(i.keywords));
        add(said, 'fi_creator', clean(i.creator));
        add(said, 'fi_producer', clean(i.producer));
        // the XMP's own names, only when they say something the Info dictionary does not
        if (clean(i.creatorTool) !== clean(i.creator)) add(said, 'fi_creatorTool', clean(i.creatorTool));
        if (clean(i.xmpProducer) !== clean(i.producer)) add(said, 'fi_xmpProducer', clean(i.xmpProducer));
        const hist = (i.history || []).filter(function (a) { return a !== i.creator && a !== i.producer && a !== i.creatorTool; });
        if (hist.length) add(said, 'fi_history', i.history.join(' · '));
        add(said, 'fi_created', date(i.created));
        add(said, 'fi_modified', date(i.modified));
        add(said, 'fi_pdfVersion', clean(i.pdfVersion));
        if (i.pages) add(said, 'fi_pages', String(i.pages));
        add(said, 'fi_pageSize', pageSize(i.pageSize));
        add(said, 'fi_lang', clean(i.lang));
        if (typeof i.tagged === 'boolean') add(said, 'fi_tagged', yesNo(i.tagged));
        if (typeof i.outline === 'number') add(said, 'fi_outline', i.outline ? word('fi_items', [i.outline]) : yesNo(false));
        if (i.pageLabels) add(said, 'fi_pageLabels', yesNo(true));
        if (i.encrypted) add(said, 'fi_encrypted', yesNo(true));
        const fonts = i.fonts || [];
        if (fonts.length) {
            const shown = fonts.slice(0, MAX_FONTS).join(', ');
            add(said, 'fi_fonts', { fonts: shown, more: fonts.length - MAX_FONTS, missing: fonts.some(function (f) { return / \*$/.test(f); }) });
        }
        // the guesses: what PdfImporter's provenance profile reads from those words (PDFIMPORT.md §2a)
        const names = word('fi_evNames');
        if (p.app) add(guess, 'fi_maker', p.app + (p.version ? ' ' + p.version : ''), names);
        if (ENGINES[p.engine]) add(guess, 'fi_engine', ENGINES[p.engine], names);
        if (PATHS[p.path]) add(guess, 'fi_path', word(PATHS[p.path]), word(EVIDENCE[p.path]));
        if (p.postprocessors && p.postprocessors.length) add(guess, 'fi_post', p.postprocessors.join(', '), word('fi_evPost'));
        const os = p.os && p.os.stated;
        if (os && OS[os.value]) add(guess, 'fi_os', OS[os.value], { os: os.evidence });
        return { kind: 'pdf', said: said, guess: guess };
    }

    // ---- .docx / .xlsx: docProps ---------------------------------------------------------------------------------

    async function inflate(data) {
        if (typeof DecompressionStream === 'undefined') return null;
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }

    /** The named entries of a zip (its central directory read from the end), each inflated; a missing one is absent. */
    async function zipEntries(bytes, names) {
        const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), out = {};
        if (u.length < 22) return out;
        const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
        let end = -1;
        for (let i = u.length - 22; i >= Math.max(0, u.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
        if (end < 0) return out;
        let at = dv.getUint32(end + 16, true);
        const count = dv.getUint16(end + 10, true), dec = new TextDecoder();
        for (let k = 0; k < count && at + 46 <= u.length && dv.getUint32(at, true) === 0x02014b50; k++) {
            const method = dv.getUint16(at + 10, true), size = dv.getUint32(at + 20, true), nlen = dv.getUint16(at + 28, true);
            const name = dec.decode(u.subarray(at + 46, at + 46 + nlen)), local = dv.getUint32(at + 42, true);
            if (names.indexOf(name) >= 0 && size < 1048576 && local + 30 <= u.length && dv.getUint32(local, true) === 0x04034b50) {
                const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
                const data = u.subarray(start, start + size);
                try { out[name] = method === 0 ? data : method === 8 ? await inflate(data) : null; } catch (e) { out[name] = null; }
            }
            at += 46 + nlen + dv.getUint16(at + 30, true) + dv.getUint16(at + 32, true);
        }
        return out;
    }

    async function fromOffice(bytes) {
        const e = await zipEntries(bytes, ['docProps/core.xml', 'docProps/app.xml']);
        const dec = new TextDecoder(), core = e['docProps/core.xml'] ? dec.decode(e['docProps/core.xml']) : '', app = e['docProps/app.xml'] ? dec.decode(e['docProps/app.xml']) : '';
        const get = function (xml, tag) {
            const m = xml.match(new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)</' + tag + '>'));
            return m ? clean(xmlText(m[1])) : null;
        };
        const said = [];
        add(said, 'fi_title', get(core, 'dc:title'));
        add(said, 'fi_author', get(core, 'dc:creator'));
        add(said, 'fi_subject', get(core, 'dc:subject'));
        add(said, 'fi_description', get(core, 'dc:description'));
        add(said, 'fi_keywords', get(core, 'cp:keywords'));
        add(said, 'fi_category', get(core, 'cp:category'));
        add(said, 'fi_lastBy', get(core, 'cp:lastModifiedBy'));
        add(said, 'fi_revision', get(core, 'cp:revision'));
        add(said, 'fi_created', date(get(core, 'dcterms:created')));
        add(said, 'fi_modified', date(get(core, 'dcterms:modified')));
        const appName = get(app, 'Application'), ver = get(app, 'AppVersion');
        add(said, 'fi_app', appName ? appName + (ver ? ' (' + ver + ')' : '') : null);
        add(said, 'fi_company', get(app, 'Company'));
        add(said, 'fi_template', get(app, 'Template'));
        add(said, 'fi_pages', get(app, 'Pages'));
        add(said, 'fi_words', get(app, 'Words'));
        return { kind: 'office', said: said, guess: [] };
    }

    // ---- HTML ----------------------------------------------------------------------------------------------------

    function fromHtml(text) {
        const s = String(text || ''), metas = {};
        const attr = function (tag, a) {
            const m = tag.match(new RegExp('\\s' + a + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i'));
            return m ? m[1] != null ? m[1] : m[2] != null ? m[2] : m[3] : null;
        };
        s.replace(/<meta\b[^>]*>/gi, function (tag) {
            const n = attr(tag, 'name'), c = attr(tag, 'content');
            if (n && c && !(n.toLowerCase() in metas)) metas[n.toLowerCase()] = clean(xmlText(c));
            return tag;
        });
        const title = s.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i), html = s.match(/<html\b[^>]*>/i);
        const said = [];
        add(said, 'fi_title', title ? clean(xmlText(title[1])) : null);
        add(said, 'fi_author', metas.author);
        add(said, 'fi_description', metas.description);
        add(said, 'fi_keywords', metas.keywords);
        add(said, 'fi_generator', metas.generator);
        add(said, 'fi_lang', html ? clean(attr(html[0], 'lang')) : null);
        return { kind: 'html', said: said, guess: [] };
    }

    // ---- shown ---------------------------------------------------------------------------------------------------

    const any = function (info) { return !!info && (info.said.length + info.guess.length) > 0; };
    /**
     * The OS's evidence (PdfImporter's provenance, written in English) in the interface language: the file's own
     * text it quotes stays as it is.
     */
    function osEvidence(ev) {
        return ev.map(function (e) {
            let m = e.match(/^User-Agent: (.*)$/);
            if (m) return t('fi_evUa', m[1]);
            m = e.match(/^Quartz: (.*)$/);
            if (m) return t('fi_evQuartz', m[1]);
            m = e.match(/^(?:platform in the tool name|tool name): (.*)$/);
            if (m) return t('fi_evTool', m[1].replace(/^"|"$/g, ''));
            if (/^Microsoft Print to PDF exists on Windows only/.test(e)) return t('fi_evGdi');
            if (/^tool name mentions Windows/.test(e)) return t('fi_evTool', 'Windows');
            return e;
        }).join('; ');
    }

    /** a value in the interface language */
    function shown(v) {
        if (v && v.t) return t.apply(null, [v.t].concat(v.args));
        if (v && v.os) return osEvidence(v.os);
        if (v && v.fonts != null) return v.fonts + (v.more > 0 ? ' ' + t('fi_more', v.more) : '') + (v.missing ? ' — ' + t('fi_notEmbedded') : '');
        return String(v);
    }
    const brief = function (info) {
        const ti = info.said.filter(function (r) { return r[0] === 'fi_title'; })[0];
        return t('fi_head') + (ti ? ': ' + ti[1] : '');
    };

    const CSS = '.report-info{margin:.5rem 0}.report-info>summary{cursor:pointer;font-weight:600}' +
        '.report-info table{width:100%;margin-top:.35rem}.report-info th[scope=row]{text-align:start;font-weight:500;white-space:nowrap;padding-inline-end:.75rem;vertical-align:top}' +
        '.report-info td{overflow-wrap:anywhere}.report-info .fi-actions{margin:.4rem 0 0}.report-info .fi-group th{text-align:start;padding-top:.6rem}.report-info .fi-ev{display:block;opacity:.75;font-size:.85em}';

    function render(box, info) {
        if (!any(info) || typeof document === 'undefined') return null;
        if (!document.getElementById('kelk-fileinfo-css')) {
            const st = document.createElement('style');
            st.id = 'kelk-fileinfo-css'; st.textContent = CSS;
            document.head.appendChild(st);
        }
        const el = function (parent, tag, cls, txt) {
            const e = parent.appendChild(document.createElement(tag));
            if (cls) e.className = cls;
            if (txt != null) e.textContent = txt;
            return e;
        };
        const d = el(box, 'details', 'report-info');               // closed: one click away
        el(d, 'summary', null, t('fi_head'));
        const tb = el(el(d, 'table', 'report-pages'), 'tbody');
        const row = function (r) {
            const tr = el(tb, 'tr');
            el(tr, 'th', null, t(r[0])).scope = 'row';
            const td = el(tr, 'td', null, shown(r[1]));
            td.dir = 'auto';                                        // a Persian title, a date, a font name: each its own way
            if (r.length > 2) el(td, 'span', 'fi-ev', t('fi_evidence', shown(r[2]))).dir = 'auto';
        };
        info.said.forEach(row);
        if (info.guess.length) {
            const g = el(el(tb, 'tr', 'fi-group'), 'th', null, t('fi_guessHead'));
            g.colSpan = 2; g.scope = 'colgroup';
            info.guess.forEach(row);
        }
        // the table to the clipboard as Markdown (GFM), in the interface language
        const b = el(el(d, 'p', 'fi-actions'), 'button', 'btn', t('fi_copy'));
        b.type = 'button';
        b.addEventListener('click', function () {
            const k = K(), ok = function () { k.ui.toast(t('copied')); }, no = function (e) { k.ui.toast(t('failed', (e && e.message) || ''), 'error'); };
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(gfm(info)).then(ok, no);
                else no();
            } catch (e) { no(e); }
        });
        return d;
    }

    /** a GFM table cell: no line break, its pipes escaped */
    const cellMd = function (v) { return String(v).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim(); };

    function gfm(info) {
        if (!any(info)) return '';
        const out = ['| ' + t('fi_field') + ' | ' + t('fi_value') + ' |', '| --- | --- |'];
        info.said.forEach(function (r) { out.push('| ' + cellMd(t(r[0])) + ' | ' + cellMd(shown(r[1])) + ' |'); });
        if (info.guess.length) {
            out.push('', '**' + cellMd(t('fi_guessHead')) + '**', '', '| ' + t('fi_field') + ' | ' + t('fi_value') + ' | ' + t('fi_evidenceCol') + ' |', '| --- | --- | --- |');
            info.guess.forEach(function (r) { out.push('| ' + cellMd(t(r[0])) + ' | ' + cellMd(shown(r[1])) + ' | ' + cellMd(shown(r[2])) + ' |'); });
        }
        return out.join('\n') + '\n';
    }

    function lines(info) {
        if (!any(info)) return [];
        const out = [t('fi_head')];
        info.said.forEach(function (r) { out.push('- ' + t(r[0]) + ': ' + shown(r[1])); });
        if (info.guess.length) {
            out.push('', t('fi_guessHead'));
            info.guess.forEach(function (r) { out.push('- ' + t(r[0]) + ': ' + shown(r[1]) + ' (' + t('fi_evidence', shown(r[2])) + ')'); });
        }
        return out;
    }

    // in the page: its words join Kelk.i18n's tables
    if (root.Kelk && root.Kelk.i18n && root.Kelk.i18n._strings) {
        const all = root.Kelk.i18n._strings;
        Object.keys(STRINGS).forEach(function (l) { if (all[l]) Object.assign(all[l], STRINGS[l]); });
    }

    const api = { fromPdf: fromPdf, fromOffice: fromOffice, fromHtml: fromHtml, any: any, render: render, brief: brief, lines: lines, gfm: gfm,
        STRINGS: STRINGS, _date: date, _pageSize: pageSize };
    root.KelkFileInfo = api;
    if (root.Kelk) root.Kelk.fileInfo = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
