/**
 * Kelk.fonts — fonts that are loaded on demand (script tags, so file:// works):
 *   forPdf(text)   the PDF fonts (pdf-font-*.js, several MB): text + Latin font,
 *                  DejaVu Sans (symbols), the code font, Noto Emoji when the
 *                  text has emoji. Resolves when window.PdfFonts is ready.
 *   forHtml(text)  the web fonts (base64) the standalone HTML export embeds.
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

    K.fonts = {
        forPdf: function (text) {
            const s = K.store.settings();
            const need = [s.fonts.bidi, s.fonts.latin, 'DejaVu Sans', s.code.font];
            if (EMOJI.test(text || '')) need.push('Noto Emoji');
            return load(K.config.pdfFonts, need);
        },

        forHtml: function (text) {
            const s = K.store.settings();
            const need = [s.fonts.bidi, s.fonts.latin];
            if (HAS_CODE.test(text || '')) need.push(s.code.font);
            return load(K.config.webFonts, need).then(function () {
                return Array.from(new Set(need)).filter(function (f) { return window.KelkWebFonts && KelkWebFonts[f]; });
            });
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
