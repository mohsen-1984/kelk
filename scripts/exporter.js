/**
 * Kelk.exporter — the preview's HTML through the lib/ builders, configured
 * from the export profile: fonts (Word and PDF apart), sizes, page,
 * direction, code, header/footer, logo and images.
 *   docx → DocxBuilder     pdf → PdfBuilder (fonts loaded on demand)
 *   doc  → WordHtmlBuilder (MHTML)   html → HtmlBuilder (fonts and images embedded)
 *   md   → the text
 */
(function (K) {
    'use strict';

    const esc = function (s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    };

    /** 'a@b.c' → mailto:, 'site.ir' → https:// */
    function linkHref(v) {
        const t = (v || '').trim();
        if (!t) return '';
        if (/^(https?:|mailto:)/i.test(t)) return t;
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return 'mailto:' + t;
        return 'https://' + t;
    }

    function labels(dir) {
        if (dir === 'ltr') return { page: 'Page', from: 'of' };
        const w = K.names.rtlWords();
        return { page: w.page, from: w.from };
    }

    /** {logo} {author} {edition} {pageLabel} {fromLabel} of the custom HTML (the rest: lib) */
    function fillCustom(html, s, logo, dir) {
        const L = labels(dir);
        // no logo uploaded: an <img src="logo"> of the custom HTML (the sample has one) goes
        if (!logo) html = String(html || '').replace(/<img\b[^>]*\bsrc\s*=\s*["']?logo["'\s>][^>]*>?/gi, '');
        return String(html || '')
            .split('{logo}').join(logo ? '<img src="logo" height="' + Math.round((BidiCore.cssPt(s.logoHeight) || 28) / 0.75) + '">' : '')
            .split('{author}').join(s.document.author ? (s.document.link
                ? '<a href="' + esc(linkHref(s.document.link)) + '">' + esc(s.document.author) + '</a>' : esc(s.document.author)) : '')
            .split('{edition}').join(esc(K.names.edition()))
            .split('{pageLabel}').join(L.page)
            .split('{fromLabel}').join(L.from);
    }

    /** Fonts for a builder: PDF and HTML use the shipped fonts, Word the Word names (installed fonts). */
    /** The stored table style, only the keys setTableStyle knows (older stores may hold others). */
    function tableStyleOf(s) {
        const t = s.tableStyle || {}, d = K.config.defaults.tableStyle;
        return { lines: t.lines || d.lines, fill: t.fill || d.fill, total: !!t.total,
                 headerCenter: t.headerCenter == null ? d.headerCenter : !!t.headerCenter,
                 headerBold: t.headerBold == null ? d.headerBold : !!t.headerBold,
                 headerColor: t.headerColor || d.headerColor, stripeColor: t.stripeColor || d.stripeColor, borderColor: t.borderColor || d.borderColor };
    }

    /**
     * Code and quote colors as template options (every builder reads them):
     * the language bar's text turns light on a dark bar.
     */
    function colorTemplate(s) {
        const c = s.code || {}, q = s.quote || {}, D = K.config.defaults;
        const headerBg = c.headerBg || D.code.headerBg;
        const dark = typeof BuilderBase !== 'undefined' && BuilderBase.isDarkColor ? BuilderBase.isDarkColor(headerBg) : false;
        return {
            codeBlockBg: c.bg || D.code.bg,
            codeHeaderBg: headerBg,
            codeHeaderColor: dark ? '#E8E8E8' : '#595959',
            codeBlockBorder: '0.75pt solid ' + (c.border || D.code.border),
            quoteBorderColor: q.border || D.quote.border,
            quoteBorderWidth: q.width || D.quote.width,
            quoteBg: q.bg == null ? D.quote.bg : q.bg,
            quoteTextColor: q.text || D.quote.text
        };
    }

    function fontsFor(kind, s) {
        if (kind === 'pdf' || kind === 'html') return { bidi: s.fonts.bidi, latin: s.fonts.latin, code: s.code.font };
        // null → the automatic Word font of the interface language; '' (emptied) → as PDF
        const W = K.settings.wordFontDefault;
        const pick = function (v, auto, pdf) { return v == null ? auto : (String(v).trim() || pdf); };
        return {
            bidi: pick(s.fonts.wordBidi, W('bidi'), s.fonts.bidi),
            latin: pick(s.fonts.wordLatin, W('latin'), s.fonts.latin),
            code: (s.code.wordFont || '').trim() || s.code.font
        };
    }

    /** Header and footer of the export profile, in BuilderBase terms. */
    function headerFooter(s, logo) {
        const d = s.document, hf = s.headerFooter;
        const title = K.names.title(), edition = K.names.edition();
        if (hf.mode === 'structured') {
            return {
                header: (logo || title || edition) ? { logo: logo ? 'logo' : '', logoHeight: s.logoHeight, title: title, edition: edition } : null,
                footer: { author: d.author, link: linkHref(d.link), pagingLabels: labels(K.names.hfDir()) }
            };
        }
        if (hf.mode === 'simple') return { header: title || null, footer: true };
        if (hf.mode === 'custom') {
            const sm = K.config.samples[K.i18n.lang] || K.config.samples.fa;
            const h = hf.header == null ? sm.header : hf.header;     // null → the sample of the interface language
            const f = hf.footer == null ? sm.footer : hf.footer;
            return {
                header: h.trim() ? { html: fillCustom(h, s, logo, K.names.hfDir()), title: title || undefined } : null,
                footer: f.trim() ? { html: fillCustom(f, s, logo, K.names.hfDir()), title: title || undefined } : null
            };
        }
        return {};
    }

    /** Export profile → builder, in one configure() call (the same for all four builders). */
    function configure(b, kind) {
        const s = K.store.settings(), logo = K.store.logo();
        K.images.register(b);
        if (kind === 'pdf') b.registerFonts(window.PdfFonts || {});
        if (kind === 'html') b.registerWebFonts(window.KelkWebFonts || {});
        const hf = headerFooter(s, logo);
        return b.configure({
            direction: s.direction,
            page: { size: s.page.size, orientation: s.page.orientation, margin: s.page.margin },
            tableWidth: s.page.tableWidth || '98%',
            tableAlign: s.page.tableAlign || 'center',
            tableStyle: tableStyleOf(s),                     // Settings → Tables → Table style
            template: colorTemplate(s),                      // Settings → Code / Quotes: colors
            codeBlock: { showLanguage: !!s.code.showLanguage, rtlFont: s.code.rtlFont },
            math: { mode: (s.math && s.math.html) || 'svg', word: (s.math && s.math.word) || 'native', textFont: s.fonts.bidi },   // HTML: svg | mathml; Word/PDF: images (RTL \text in the web font)
            headerFooterDirection: s.headerFooter.direction,
            fonts: fontsFor(kind, s),
            fontSizes: { bidi: +s.fonts.bidiSize || 12, latin: +s.fonts.latinSize || 11.5, code: +s.code.size || 10 },
            header: hf.header,
            footer: hf.footer,
            toc: s.toc && s.toc.enabled ? {
                levels: +s.toc.levels || 2,
                // both: the builder takes the one of the document's direction (the preview's last
                // direction may be the previous document's — the about text of another language)
                title: { ltr: 'Contents', rtl: K.names.rtlWords().toc }
            } : null
        });
    }

    K.exporter = {
        run: async function (kind, btn) {
            const md = K.editor.value();
            if (!md.trim()) { K.ui.toast(K.i18n.t('emptyDoc'), 'warn'); return; }
            K.ui.busy(btn, true);
            try {
                const html = K.preview.html();
                // Word / PDF: a formula with right-to-left \text embeds the web font in its image
                if (kind !== 'html' && /data-tex="[^"]*[\u0590-\u08FF]/.test(html)) await K.fonts.forHtml(md);
                let blob;
                if (kind === 'docx') {
                    await K.libs.need('docx');
                    blob = await configure(DocxBuilder.create(), 'docx').addFromHtml(html).toBlob();
                } else if (kind === 'doc') {
                    blob = await configure(WordHtmlBuilder.create(), 'doc').addFromHtml(html).toBlob();
                } else if (kind === 'pdf') {
                    if (!window.PdfFonts || !window.jspdf) K.ui.toast(K.i18n.t('loadingFonts'));
                    await Promise.all([K.libs.need('jspdf'), K.fonts.forPdf(md)]);
                    blob = await configure(PdfBuilder.create(), 'pdf').addFromHtml(html).toBlob();
                } else if (kind === 'html') {
                    await K.fonts.forHtml(md);
                    blob = await configure(HtmlBuilder.create(), 'html').addFromHtml(html).toBlob();
                } else if (kind === 'md') {
                    blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
                }
                K.ui.download(blob, blob.type, K.ui.fileName(kind));
                if (kind === 'md') K.editor.markConverted(false);
                K.ui.toast(K.i18n.t('exported', kind.toUpperCase()));
            } catch (e) {
                console.error(e);
                K.ui.toast(K.i18n.t('failed', e.message), 'error');
            } finally {
                K.ui.busy(btn, false);
            }
        },

        // exposed for tests
        _configure: configure,
        _htmlPage: async function () {
            await K.fonts.forHtml(K.editor.value());
            return configure(HtmlBuilder.create(), 'html').addFromHtml(K.preview.html()).toHtml();
        },
        _fontsFor: fontsFor
    };
})(window.Kelk = window.Kelk || {});
