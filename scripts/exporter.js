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
            codeBlock: { showLanguage: !!s.code.showLanguage, rtlFont: s.code.rtlFont },
            headerFooterDirection: s.headerFooter.direction,
            fonts: fontsFor(kind, s),
            fontSizes: { bidi: +s.fonts.bidiSize || 12, latin: +s.fonts.latinSize || 11.5, code: +s.code.size || 10 },
            header: hf.header,
            footer: hf.footer,
            toc: s.toc && s.toc.enabled ? {
                levels: +s.toc.levels || 2,
                title: K.preview.dir() === 'ltr' ? 'Contents' : K.names.rtlWords().toc
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
