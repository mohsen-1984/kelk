/**
 * Kelk.fonts — fonts that are loaded on demand (script tags, so file:// works):
 *   forPdf(text)   the PDF fonts (pdf-font-*.js, several MB): text + Latin font,
 *                  DejaVu Sans (symbols), the code font, Noto Emoji when the
 *                  text has emoji. Resolves when window.PdfFonts is ready.
 *   forHtml(text)  the web fonts (base64) the standalone HTML export embeds.
 *   fromPdf(f)     a text font shown from its PDF font file (config.fontsFromPdf), on first use.
 *   installed(f)   is a font available to this page (system or web font)?
 */
(function (K) {
    'use strict';

    const EMOJI = (function () { try { return new RegExp('\\p{Extended_Pictographic}', 'u'); } catch (e) { return /[\uD83C-\uDBFF]/; } })();
    const HAS_CODE = /(^|\n) {0,3}(```|~~~)|`[^`\n]+`|(^|\n)( {4}|\t)\S/;

    function load(map, families) {
        const srcs = Array.from(new Set(families)).map(function (f) { return map[f]; }).filter(Boolean);
        return Promise.all(srcs.map(function (s) { return K.ui.loadScript(s); }));
    }

    let canvas = null;
    const fromPdf = {};

    K.fonts = {
        forPdf: function (text) {
            const f = K.settings.fontsFor('pdf');
            const need = [f.bidi, f.latin, 'DejaVu Sans', f.code];
            if (EMOJI.test(text || '')) need.push('Noto Emoji');
            return load(K.config.pdfFonts, need);
        },

        forHtml: function (text) {
            const f = K.settings.fontsFor('html');
            const need = [f.bidi, f.latin];                  // a system Latin font (Calibri …) has no web font: not embedded
            if (HAS_CODE.test(text || '')) need.push(f.code);
            const fromPdf = need.filter(function (x) { return K.config.fontsFromPdf.indexOf(x) >= 0; }).map(K.fonts.fromPdf);
            return Promise.all([load(K.config.webFonts, need)].concat(fromPdf)).then(function () {
                return Array.from(new Set(need)).filter(function (x) { return window.KelkWebFonts && KelkWebFonts[x]; });
            });
        },

        /**
         * A text font shown from its PDF font file (config.fontsFromPdf): its regular and bold TTFs, as they are,
         * become the page's web font (FontFace) and the HTML export's (KelkWebFonts). Loaded once, on first use.
         */
        fromPdf: function (family) {
            if (fromPdf[family]) return fromPdf[family];
            fromPdf[family] = K.ui.loadScript(K.config.pdfFonts[family]).then(function () {
                const all = window.PdfFonts || {};
                const e = Object.keys(all).map(function (k) { return all[k]; })
                    .find(function (x) { return x && x.family === family; });
                if (!e) return;
                const faces = [['normal', '400'], ['bold', '700']].filter(function (w) { return e.styles[w[0]]; }).map(function (w) {
                    return { weight: w[1], style: 'normal', format: 'truetype', data: e.styles[w[0]].data };
                });
                (window.KelkWebFonts = window.KelkWebFonts || {})[family] = faces;
                if (typeof FontFace === 'undefined' || !document.fonts) return;
                return Promise.all(faces.map(function (x) {
                    const bin = atob(x.data), buf = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
                    const ff = new FontFace(family, buf.buffer, { weight: x.weight });
                    document.fonts.add(ff);
                    return ff.load().catch(function () {});
                })).then(function () {
                    K.settings.checkWordFonts();
                    if (K.slides && K.slides.active()) K.preview.render();     // the slides measure their text
                });
            }).catch(function () { fromPdf[family] = null; });
            return fromPdf[family];
        },

        /**
         * Width test against three generic families: a font that is not
         * available leaves every width unchanged. A web font counts once loaded.
         */
        installed: function (family) {
            if (!family) return false;
            canvas = canvas || document.createElement('canvas').getContext('2d');
            const t = 'mmmmmmmmmmlli WwQq 0123 سلام ابجد پژوهش';
            return ['monospace', 'serif', 'sans-serif'].some(function (base) {
                canvas.font = '40px ' + base;
                const w0 = canvas.measureText(t).width;
                canvas.font = '40px "' + family.replace(/"/g, '') + '", ' + base;
                return canvas.measureText(t).width !== w0;
            });
        }
    };
})(window.Kelk = window.Kelk || {});
