/**
 * Kelk.config — defaults and fixed paths.
 * Two kinds of user choices, kept apart (Kelk.store):
 *   ui       how the PAGE behaves: language, theme, layout, panes, import, scroll sync
 *   profile  how the DOCUMENT is exported: document fields, header/footer, fonts, page, code
 */
(function (K) {
    'use strict';

    K.config = {
        version: '2.7',
        repoUrl: 'https://github.com/mohsen-1984/kelk',   // the footer link (hidden when empty)
        storagePrefix: 'kelk.',
        maxFileMB: 20,                  // the default of Settings → App → Largest file to import (ui.importer.maxMB)
        maxSheetCells: 100000,          // CSV / XLSX import: more cells than this and typing in the editor slows (2.6, measured)
        // a PDF import's progress bar: each step's share of the bar (they add up to 1), measured on large files —
        // after the last page is read, the font repairs, the layout and the Markdown still take about two thirds of the time
        // (libs: pdf.js and the importer on the first PDF; file: the file read into memory; open: pdf.js opens the
        // document, its metadata and structure tree — not measured, small)
        importProgress: { libs: 0.02, file: 0.01, open: 0.02, read: 0.31, fonts: 0.17, lines: 0.08, layout: 0.34, markdown: 0.05 },
        // a PowerPoint export's progress bar (slides.js blob): each step's share, measured on decks of 200–430 slides
        // (libs: PptxGenJS on the first export, not measured)
        pptxProgress: { libs: 0.02, model: 0.05, build: 0.03, write: 0.5, slides: 0.22, zip: 0.2 },
        // the other exports' bars (exporter.js): rough shares, not measured — what each step shows is its name; the
        // builders run in one synchronous step, so the bar stands still while they work (TODO: a moving bar)
        exportProgress: { math: 0.05, libs: 0.1, fonts: 0.15, build: 0.6, embed: 0.1 },
        // the slides preview's bar (slides.js render): the icon set on first use, formulas, pictures, the layout; shown
        // only for work longer than progressDelayMs
        slidesProgress: { libs: 0.3, math: 0.1, images: 0.1, layout: 0.5 },
        progressDelayMs: 300,
        // the import report (PDF, PPTX, Excel …): stays open this long (ms) after an import, then collapses to its
        // toggle line; 0: stays open
        reportOpenMs: 5000,
        maxImageMB: 5,
        maxLogoPx: 256,                 // uploaded logos are scaled down to this height
        autosaveMs: 600,
        renderMs: 250,

        /** Page behavior (Kelk.store.ui). */
        uiDefaults: {
            lang: '', theme: '',        // '' → from the browser
            layout: 'side',             // side | stack
            paneOpen: false,            // settings pane: closed on the first visit
            editorOpen: true,           // editor panel (side layout)
            scrollSync: true,
            sampleSeen: false,
            sampleLang: null,           // the about/sample document on screen (its language), if any
            view: 'document',           // the preview: document | slides | excel (Kelk.slides.view)
            sourceName: null,           // the imported (or sample) file's name: the exports' default name, kept across reloads
            importer: { richPaste: true, nestedTables: 'extract', mergedRows: 'repeat', images: 'markdown', asciiNumbers: true, persianLetters: true,
                        maxMB: '20', separator: 'name' }   // largest file to import (MB); between files: name | rule | none
        },

        /** Export profile (Kelk.store.settings; stored: what differs from these, and schemaVersion). */
        defaults: {
            // the profile's schema: Kelk.store.migrate brings an older stored profile or settings file up to it
            schemaVersion: 2,
            document: { title: null, edition: null, author: '', link: '' },   // null → automatic (first H1 / words; Draft / پیش‌نویس)
            logoHeight: '1cm',
            headerFooter: {
                mode: 'simple',         // simple (title + page number) | structured | none | custom
                direction: 'auto',      // rtl | ltr | auto (the document's)
                header: null,           // custom header/footer HTML; null → the sample below
                footer: null
            },
            // Settings → Fonts: one choice for the preview and every builder (Kelk.settings.fontsFor)
            fonts: {
                bidi: 'Vazirmatn',      // Complex scripts (Persian, Arabic …): fontsBidi
                latin: '',              // Latin text: fontsLatin, '' → the bidi font's own Latin letters
                embed: true,            // DOCX and PPTX carry the fonts they use that Kelk ships (Kelk.fonts.embed)
                wordOwn: false,         // DOCX, DOC and PPTX take the fonts below instead (any installed font may be typed)
                wordBidi: null,         // null → the font above
                wordLatin: null,
                // XLSX: fonts of its own, on by default — Excel cannot embed fonts, so the classic pair Persian readers
                // have (B Nazanin, Calibri); off: the fonts above
                xlsxOwn: true,
                xlsxBidi: 'B Nazanin',
                xlsxLatin: 'Calibri',
                bidiSize: 12,           // pt
                latinSize: 11.5
            },
            // paragraphs' alignment (template textAlign) and the line spacing of everything:
            // '' → automatic, each its own (paragraphs 1.1, lists / tables / code / quote boxes 1.0)
            text: { align: 'justify', lineHeight: '', breaks: true },   // breaks: a single new line is a line break (chat style); false: GFM's soft break
            page: { size: 'A4', orientation: 'portrait', margin: '20mm 15mm', tableWidth: 'auto', tableMinWidth: '50%', tableAlign: 'center' },
            // table style (BuilderBase.setTableStyle): lines × fill, a total row, three colors (text on a dark fill turns white)
            tableStyle: { lines: 'grid', fill: 'header-stripes', headerCenter: true, headerBold: true, total: false,
                          headerColor: '#E4E9EF', stripeColor: '#F5F7FA', borderColor: '#A9B5C4' },
            direction: 'auto',          // auto | rtl | ltr
            toc: { enabled: false, levels: 2 },   // table of contents after the opening H1
            code: { showLanguage: true, rtlFont: 'code', font: 'Vazir Code Hack', wordFont: 'Consolas', size: 10,
                    bg: '#FCFCFC', headerBg: '#E7F1EE', border: '#D4D0C8' },   // colors: box, language bar (its text follows), frame (0.75pt)
            quote: { border: '#1F6F5C', width: '3.5pt', bg: '#F6F9F8', text: '#4A4A4A' },   // the bar beside a quote, the box's fill, its text
            math: { html: 'svg', word: 'native' },  // formulas: HTML svg | mathml; .docx native (Word equations) | image
            // PowerPoint (lib/PptxBuilder): theme, colors ('' → the theme's), title slides, size, body text, timelines;
            // footer null → the document's title; the rest: slide numbers, speaker notes, automatic layouts, long slides split
            slides: { theme: 'modern-emerald', primary: '', accent: '', titleStyle: 'dark', aspect: '16:9', size: 'medium', timeline: 'auto',
                      footer: null, numbers: true, notes: true, autoLayout: true, split: true, sectionNumbers: true, sections: true,
                      decoration: 'auto', bullet: '•', logo: 'all' },
            // Excel (lib/XlsxBuilder: its DEFAULTS, the same values) and the Excel view's preview (previewRows)
            excel: { sheets: 'each', gap: 2, titleRow: true, direction: 'auto', zeros: true, links: true, breaks: true,
                     wrapHead: 'all', wrap: 'none', thousands: false, headerColor: '#E4E9EF', stripes: true, stripeColor: '#F5F7FA',
                     headerBorder: 'all', headerBorderWidth: 'thin', headerBorderColor: '#A9B5C4',
                     bodyBorder: 'all', bodyBorderWidth: 'thin', bodyBorderColor: '#A9B5C4', headerHeight: 21,
                     filter: true, freeze: true, columns: 'content', paper: 'A4', orientation: 'auto', margins: 'kelk',
                     center: true, fit: true, headerFooter: true, csvSeparator: ',', csvBom: true, previewRows: 20 }
        },

        /** Default edition: LTR header → Draft; RTL header → by interface language (Persian unless Arabic). */
        draft: { rtl: 'پیش‌نویس', ltr: 'Draft', ar: 'مسودة' },

        /** Words the exports need in an RTL header/footer or ToC, by interface language (fa unless ar). */
        rtlWords: {
            fa: { page: 'صفحه', from: 'از', toc: 'فهرست مطالب' },
            ar: { page: 'صفحة', from: 'من', toc: 'المحتويات' }
        },

        /**
         * Settings → Fonts. The text fonts are shipped with Kelk (PDF, the preview, HTML); the Latin fonts are the
         * system's — the PDF, which carries its fonts, writes their text with the text font's Latin letters (or,
         * for a text font without Latin letters, fontsNoLatin, with DejaVu Sans; Word and PowerPoint: noLatinWord).
         */
        fontsBidi: ['Vazirmatn', 'Sahel', 'B Nazanin', 'B Mitra'],
        fontsLatin: ['Calibri', 'Arial', 'Tahoma', 'Times New Roman'],
        fontsCode: ['Vazir Code Hack', 'DejaVu Sans Mono'],
        fontsNoLatin: ['B Nazanin', 'B Mitra', 'B Titr'],
        noLatinWord: 'Times New Roman',
        /** Text fonts the page shows from their PDF font file (regular and bold, as web fonts): loaded on first choice. */
        fontsFromPdf: ['B Nazanin', 'B Mitra'],
        /** The Windows character set a font declares, when not ANSI (the DOCX font table, the PPTX embedded font). */
        fontCharset: { 'B Nazanin': 178, 'B Mitra': 178, 'B Titr': 178 },      // the B fonts: Arabic only

        /** Fonts to install for Word, by language: a zip of .ttf files and { font: web page }; shown when zip is set. */
        wordFontPacks: {
            fa: {
                zip: 'assets/fonts/download/persian-fonts-ttf.zip',
                sites: { 'Vazirmatn و Sahel': 'https://rastikerdar.github.io/', 'برنا رایانه': 'https://www.bornaray.com/' }   // { the name in «وب‌سایت {font}»: its page }
            },
            en: { zip: '', sites: {} },
            ar: { zip: '', sites: {} }
        },

        /** Suggestions for the DOCX / PPTX font fields (any installed font may be typed). */
        wordFonts: ['Vazirmatn', 'Sahel', 'B Nazanin', 'B Lotus', 'B Mitra', 'Tahoma', 'Segoe UI',
                    'Calibri', 'Cambria', 'Arial', 'Times New Roman'],
        wordCodeFonts: ['Consolas', 'Cascadia Mono', 'Courier New', 'Vazir Code Hack', 'DejaVu Sans Mono'],

        /** PDF fonts: loaded on the first PDF export only (large files). */
        pdfFonts: {
            Vazirmatn: 'lib/pdf-base64-ttf-fonts/pdf-font-vazirmatn.js',
            Sahel: 'lib/pdf-base64-ttf-fonts/pdf-font-sahel.js',
            // © Borna Rayaneh, no published license: kept apart with their NOTICE.txt (THIRD-PARTY-NOTICES.md)
            'B Nazanin': 'lib/pdf-base64-ttf-fonts/borna-rayaneh/pdf-font-b-nazanin.js',
            'B Mitra': 'lib/pdf-base64-ttf-fonts/borna-rayaneh/pdf-font-b-mitra.js',
            'B Titr': 'lib/pdf-base64-ttf-fonts/borna-rayaneh/pdf-font-b-titr.js',
            'DejaVu Sans': 'lib/pdf-base64-ttf-fonts/pdf-font-dejavu-sans.js',
            'DejaVu Sans Mono': 'lib/pdf-base64-ttf-fonts/pdf-font-dejavu-sans-mono.js',
            'Vazir Code Hack': 'lib/pdf-base64-ttf-fonts/pdf-font-vazir-code-hack.js',
            'Noto Emoji': 'lib/pdf-base64-ttf-fonts/pdf-font-noto-emoji.js'
        },

        /** Web fonts as base64, embedded in the standalone HTML export (loaded on demand). */
        webFonts: {
            Vazirmatn: 'assets/fonts/embed/vazirmatn.js',
            Sahel: 'assets/fonts/embed/sahel.js',
            'DejaVu Sans': 'assets/fonts/embed/dejavu-sans.js',
            'DejaVu Sans Mono': 'assets/fonts/embed/dejavu-sans-mono.js',
            'Vazir Code Hack': 'assets/fonts/embed/vazir-code-hack.js'
        },

        sample: 'docs/about-kelk-and-samples.js',   // KelkSamples[lang] (tools/build-samples.js)
        slidesSample: 'docs/slides-samples.js',     // KelkSlideSamples[lang]: the slides sample (AI literacy)
        excelSample: 'docs/excel-samples.js',       // KelkExcelSamples[lang]: the Excel sample (sheets, numbers, links, a wide table)

        /** Slides: the full Lucide icon set for :name: icons (loaded on the first icon). */
        slides: { icons: 'vendor/lucide.min_1.48.0.js' },

        /** LaTeX formulas: the local MathJax 4 (lib/MathCore loads it with the first formula). */
        math: { mathjax: 'vendor/mathjax_4.1.3/' },

        /** Large libraries, loaded on first use (Kelk.libs.need). */
        libs: {
            docx: { src: 'vendor/docx.index.iife.min_9.7.1.js', global: 'docx' },
            jspdf: { src: 'vendor/jspdf.umd.min_4.2.1.js', global: 'jspdf' },
            mammoth: { src: 'vendor/mammoth.browser.min_1.12.3.js', global: 'mammoth' },
            pdfjs: { src: ['vendor/pdfjs/pdf_6.4.299.js', 'vendor/pdfjs/pdf.worker_6.4.299.js'], global: 'pdfjsLib' },
            // the PDF importer: its core, then its parts in PdfImporter.PARTS order (tests/unit/app.test.js checks it)
            pdfimport: {
                src: ['lib/PdfImporter.js', 'lib/pdfimport/thresholds.js', 'lib/pdfimport/calibration.js',
                    'lib/pdfimport/extract.js', 'lib/pdfimport/lines.js', 'lib/pdfimport/regions.js',
                    'lib/pdfimport/ladder.js', 'lib/pdfimport/order.js', 'lib/pdfimport/blocks.js'],
                global: 'PdfImporter'
            },
            jszip: { src: 'vendor/jszip.min_3.10.2.js', global: 'JSZip' },
            fontembed: { src: 'lib/FontEmbed.js', global: 'FontEmbed' },           // Settings → Fonts → Embed fonts
            slidecheck: { src: 'scripts/slidecheck.js', global: 'KelkSlideCheck' },      // on the first switch to slides
            fileinfo: { src: 'scripts/fileinfo.js', global: 'KelkFileInfo' },          // the import report's file information
            // the Excel view (its preview, the no-tables report, the exports): on the first switch to Excel
            sheets: { src: ['lib/XlsxBuilder.js', 'scripts/sheets.js'], global: 'KelkSheets' },
            xlsx: { src: ['vendor/jszip.min_3.10.2.js', 'vendor/xlsx.full.min_0.20.3.js'], global: 'XLSX' },     // an XLSX export or import
            sheetimport: { src: ['vendor/papaparse.min_5.7.0.js', 'lib/SheetImporter.js'], global: 'SheetImporter' },   // a CSV / XLSX import
            pptx: { src: ['vendor/jszip.min_3.10.2.js', 'vendor/pptxgen.min_4.0.1.js'], global: 'PptxGenJS' }
        },

        /** Custom header/footer until the user writes their own (↺ brings them back), by interface language. */
        samples: {
            fa: { header: '<table><tr>\n' +
                    '  <td style="width:18%;text-align:center"><img src="logo" height="34"></td>\n' +
                    '  <td style="width:64%;text-align:center"><b>{title}</b><br><span style="color:#666;font-size:8pt">{date}</span></td>\n' +
                    '  <td style="width:18%;border:1.5pt solid red;background:#FFF2CC">نسخه 1.2</td>\n' +
                    '  </tr></table>',
                  footer: '<p style="text-align:center">صفحه {page} از {pages}</p>' },
            ar: { header: '<table><tr>\n' +
                    '  <td style="width:18%;text-align:center"><img src="logo" height="34"></td>\n' +
                    '  <td style="width:64%;text-align:center"><b>{title}</b><br><span style="color:#666;font-size:8pt">{date}</span></td>\n' +
                    '  <td style="width:18%;border:1.5pt solid red;background:#FFF2CC">الإصدار 1.2</td>\n' +
                    '  </tr></table>',
                  footer: '<p style="text-align:center">صفحة {page} من {pages}</p>' },
            en: { header: '<table><tr>\n' +
                    '  <td style="width:18%;text-align:center"><img src="logo" height="34"></td>\n' +
                    '  <td style="width:64%;text-align:center"><b>{title}</b><br><span style="color:#666;font-size:8pt">{date}</span></td>\n' +
                    '  <td style="width:18%;border:1.5pt solid red;background:#FFF2CC">Version 1.2</td>\n' +
                    '  </tr></table>',
                  footer: '<p style="text-align:center">Page {page} of {pages}</p>' }
        },

        extensions: {
            markdown: ['.md', '.markdown', '.txt'],
            html: ['.html', '.htm'],
            docx: ['.docx'],
            pdf: ['.pdf'],
            zip: ['.zip'],
            csv: ['.csv'],
            xlsx: ['.xlsx']                 // on its own only: a workbook in a zip is not imported
        }
    };

    // the creator written into exported files comes from the one version above (lib/BuilderBase.js loads first)
    if (typeof BuilderBase !== 'undefined') BuilderBase.version = K.config.version;
})(window.Kelk = window.Kelk || {});
