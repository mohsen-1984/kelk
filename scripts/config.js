/**
 * Kelk.config — defaults and fixed paths.
 * Two kinds of user choices, kept apart (Kelk.store):
 *   ui       how the PAGE behaves: language, theme, layout, panes, import, scroll sync
 *   profile  how the DOCUMENT is exported: document fields, header/footer, fonts, page, code
 */
(function (K) {
    'use strict';

    K.config = {
        version: '1.0',
        repoUrl: 'https://github.com/mohsen-1984/kelk',   // the footer link (hidden when empty)
        storagePrefix: 'kelk.',
        maxFileMB: 10,
        maxImageMB: 5,
        maxLogoPx: 256,                 // uploaded logos are scaled down to this height
        autosaveMs: 600,
        renderMs: 250,

        /** Page behaviour (Kelk.store.ui). */
        uiDefaults: {
            lang: '', theme: '',        // '' → from the browser
            layout: 'side',             // side | stack
            paneOpen: false,            // settings pane: closed on the first visit
            editorOpen: true,           // editor panel (side layout)
            scrollSync: true,
            previewWordFont: false,     // preview with the Word fonts when installed
            sampleSeen: false,
            sampleLang: null,           // the about/sample document on screen (its language), if any
            importer: { richPaste: true, nestedTables: 'extract', images: 'markdown' }
        },

        /** Export profile (Kelk.store.settings). */
        defaults: {
            document: { title: null, edition: null, author: '', link: '' },   // null → automatic (first H1 / words; Draft / پیش‌نویس)
            logoHeight: '1cm',
            headerFooter: {
                mode: 'structured',     // structured | simple | none | custom
                direction: 'auto',      // rtl | ltr | auto (the document's)
                header: null,           // custom header/footer HTML; null → the sample below
                footer: null
            },
            fonts: {
                bidi: 'Vazirmatn',      // PDF + page: Complex scripts (Persian, Arabic …)
                latin: 'Vazirmatn',     // PDF + page: Latin text
                wordBidi: null,         // Word (.doc/.docx); null → by interface language (wordFontDefaults)
                wordLatin: null,
                bidiSize: 12,           // pt
                latinSize: 11.5
            },
            page: { size: 'A4', orientation: 'portrait', margin: '20mm 15mm', tableWidth: 'auto' },
            direction: 'auto',          // auto | rtl | ltr
            toc: { enabled: false, levels: 2 },   // table of contents after the opening H1
            code: { showLanguage: true, rtlFont: 'code', font: 'Vazir Code Hack', wordFont: 'Consolas', size: 10 }
        },

        /** Default edition: LTR header → Draft; RTL header → by interface language (Persian unless Arabic). */
        draft: { rtl: 'پیش‌نویس', ltr: 'Draft', ar: 'مسودة' },

        /** Words the exports need in an RTL header/footer or ToC, by interface language (fa unless ar). */
        rtlWords: {
            fa: { page: 'صفحه', from: 'از', toc: 'فهرست مطالب' },
            ar: { page: 'صفحة', from: 'من', toc: 'المحتويات' }
        },

        /** Fonts shipped with Kelk (PDF + page). DejaVu Sans has no Arabic script: Latin only. */
        fontsBidi: ['Vazirmatn', 'Sahel'],
        fontsLatin: ['Vazirmatn', 'Sahel', 'DejaVu Sans'],
        fontsCode: ['Vazir Code Hack', 'DejaVu Sans Mono'],

        /** Word fonts until the user types their own (↺ brings them back), by interface language. */
        wordFontDefaults: {
            fa: { bidi: 'B Nazanin', latin: 'Calibri' },
            en: { bidi: 'Arial', latin: 'Calibri' },       // Arial has Arabic script on every Windows
            ar: { bidi: 'Arial', latin: 'Calibri' }
        },

        /** Suggestions for the Word font fields (any installed font may be typed). */
        wordFonts: ['Vazirmatn', 'Sahel', 'B Nazanin', 'B Lotus', 'B Mitra', 'Tahoma', 'Segoe UI',
                    'Calibri', 'Cambria', 'Arial', 'Times New Roman'],
        wordCodeFonts: ['Consolas', 'Cascadia Mono', 'Courier New', 'Vazir Code Hack', 'DejaVu Sans Mono'],

        /** PDF fonts: loaded on the first PDF export only (large files). */
        pdfFonts: {
            Vazirmatn: 'lib/pdf-base64-ttf-fonts/pdf-font-vazirmatn.js',
            Sahel: 'lib/pdf-base64-ttf-fonts/pdf-font-sahel.js',
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

        /** Large libraries, loaded on first use (Kelk.libs.need). */
        libs: {
            docx: { src: 'vendor/docx.index.iife.min_9.7.1.js', global: 'docx' },
            jspdf: { src: 'vendor/jspdf.umd.min_4.2.1.js', global: 'jspdf' },
            mammoth: { src: 'vendor/mammoth.browser.min_1.12.3.js', global: 'mammoth' }
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
            docx: ['.docx']
        }
    };
})(window.Kelk = window.Kelk || {});
