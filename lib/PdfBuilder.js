/**
 * PdfBuilder - Fluent PDF Generation Library with Full RTL/BiDi Support
 * ======================================================================
 *
 * Dedicated to Persian speakers around the world
 * تقدیم به فارسی‌زبانان عزیز در سراسر جهان
 *
 * Made first for Persian, and for every right-to-left language (Arabic, Hebrew,
 * Urdu, Kurdish, Pashto …) and their mix with left-to-right text — and just as
 * usable for purely left-to-right documents (English, French, German, Spanish,
 * Greek, Russian …): the direction rules switch themselves off where there is
 * nothing to decide.
 *
 * Version: 1.0
 * Author: mhn.com@gmail.com
 * License: MIT
 *
 * The PDF sibling of WordHtmlBuilder (.doc) and DocxBuilder (.docx): same
 * fluent API, same content rules, same styling options — rendered with
 * jsPDF, entirely client-side.
 *
 * ─────────────────────────────────────────────────────────────────────
 * PARITY WITH WordHtmlBuilder / DocxBuilder
 * ─────────────────────────────────────────────────────────────────────
 *
 * Decisions come from BidiCore (shared by all three builders):
 *   - Document direction auto-detected ('auto' | 'rtl' | 'ltr')
 *   - Per-element direction: English paragraphs in an RTL document, list
 *     root-tree rule, all-LTR tables, numbers-only cells, counter-direction
 *     quotes
 *   - BiDi runs: the same rules for "4k", brackets, quotes and the
 *     sentence-final period
 *
 * Styling comes from createMsoTemplate.DEFAULTS (msOfficeWordHtmlTemplate.js):
 * fonts and sizes (Latin and Complex Script kept apart, as in Word), heading
 * sizes/colors, spacing, quote/code/table colors, page size and margins.
 *
 * ─────────────────────────────────────────────────────────────────────
 * HOW TEXT IS LAID OUT
 * ─────────────────────────────────────────────────────────────────────
 *
 * jsPDF draws strings; it has no paragraph layout. PdfBuilder does it:
 *   1. inline content → pieces in LOGICAL order (style × direction; the
 *      direction of every piece comes from BidiCore)
 *   2. line breaking on logical words, measured with each piece's own font
 *      (Arabic-script shaping included)
 *   3. per line, visual order of the direction runs (RTL line: runs right
 *      to left; an LTR run inside keeps its own order)
 *   4. jsPDF only reorders characters INSIDE an RTL run (digits, mirrored
 *      brackets) and shapes the letters
 * So an English sentence that wraps inside a Persian paragraph continues
 * on the next line in its natural order, in table cells as well.
 *
 * Fonts: a run in RTL text uses the Complex Script font/size (bidiFont,
 * bidiFontSize), any other run the Latin one (latinFont, fontSize) — like
 * Word's w:rFonts cs/ascii split. Fonts must be registered (TTF, base64);
 * a template font that is not registered falls back to the first registered
 * family (e.g. Vazirmatn, which also covers Latin). Code falls back to the
 * built-in Courier for Latin-1 text.
 *
 * Per-glyph fallback: a character the run's font has no glyph for (✓ → ⚠ ☐
 * in Vazirmatn/Sahel) is drawn with the first font of the fallback chain
 * whose cmap has it — setFonts({ fallback: ['DejaVu Sans'] }); default 'auto'
 * = every other registered family, in registration order. Combining marks
 * stay with their base; invisible characters (ZWJ, variation selectors) are
 * dropped where no font draws them. Colour emoji are not supported.
 *
 * Emoji: load pdf-font-noto-emoji.js (monochrome Noto Emoji, remapped by
 * build_pdf_fonts.py) and put it in the chain — setFonts({ fallback:
 * ['Noto Emoji', 'DejaVu Sans'] }) or 'auto'. jsPDF reads only the BMP cmap
 * and does no GSUB shaping, so emoji above U+FFFF and sequences (ZWJ, flags,
 * skin tones, keycaps) are drawn through Private Use Area code points; the
 * PDF's text layer (copy/search) therefore gives those PUA characters.
 * Presentation: Emoji_Presentation characters and anything + FE0F → emoji
 * font; text-default ones (⚠ ✏ ☑) and + FE0E → text chain (e.g. DejaVu).
 *
 * Four styles per family: the input is HTML converted from Markdown, whose
 * only style changes are <strong> and <em>. So every font file (Vazirmatn,
 * Sahel, DejaVu Sans, Noto Emoji) carries exactly normal, bold, italic and
 * bold italic in one pdf-font-*.js; other weights (Light, Medium …) are
 * never selected and not built. Emoji follow the run's style: bold text →
 * bold emoji, italic → slanted (Noto Emoji's italics are generated obliques,
 * DejaVu's are its own).
 *
 * Scripts: direction comes from BidiCore's strong-letter classes — every
 * RTL script of the BMP (Arabic script, Hebrew, Syriac, Thaana, N'Ko …) and
 * the common LTR ones (Latin incl. Vietnamese, Greek, Cyrillic, Armenian,
 * Georgian). Arabic script is shaped here; Hebrew needs no joining (its
 * points are placed by the font's own offsets, no GPOS). Scripts that need
 * GSUB/GPOS shaping (Devanagari, Thai, Khmer …) cannot be drawn correctly.
 * Glyphs the document font lacks come from the fallback chain: DejaVu Sans
 * covers Hebrew, Greek, Cyrillic, Armenian, Georgian, Vietnamese.
 * For documents mostly in a Latin language with many accented letters
 * (Vietnamese, Polish …) use setFonts({ latin: 'DejaVu Sans' }): per-glyph
 * fallback would otherwise mix two fonts inside one word.
 *
 * Code: setFonts({ code: 'DejaVu Sans Mono' }) — Latin, digits, symbols and
 * box drawing share one width, so columns line up. Its Arabic script keeps
 * Persian comments in the same font and grid (codeBlock.rtlFont 'code',
 * default); rtlFont 'document' draws RTL words with the bidi font instead.
 *
 * Why two fallback fonts — Noto Emoji AND DejaVu Sans:
 * They cover different ground and neither can stand in for the other.
 *   · Noto Emoji is the only way to reach anything above U+FFFF (jsPDF can
 *     draw no astral glyph from a normal font) and the only source of
 *     sequences (👍🏽 👨‍👩‍👧 🇮🇷 1️⃣) — but it holds emoji ONLY: no ✓ (U+2713),
 *     → ★ ☐ • …, ∑ ≠ α, box drawing, i.e. none of the text symbols common
 *     in technical and Persian documents, which Vazirmatn/Sahel lack too.
 *   · DejaVu Sans supplies those text symbols, and draws text-presentation
 *     characters (⚠ ✏ ☑ without FE0F, anything + FE0E) as text: line
 *     weight and size that sit with the letters instead of an emoji
 *     pictogram. It has no emoji and cannot reach astral code points.
 * So: emoji presentation → Noto Emoji; text presentation and plain symbols
 * → DejaVu Sans; the emoji font is always tried last for coverage, so a
 * symbol found in both prefers the text look. With only Noto Emoji, ✓ → ★
 * print as empty boxes; with only DejaVu, every modern emoji does.
 *
 * ─────────────────────────────────────────────────────────────────────
 * USAGE
 * ─────────────────────────────────────────────────────────────────────
 *
 * @example Basic usage
 * await PdfBuilder.create()
 *     .registerFonts(PdfFonts)                // pdf-font-*.js files loaded
 *     .setFonts({ bidi: 'Vazirmatn' })
 *     .setFontSizes({ latin: 11, bidi: 12 })
 *     .setPage({ size: 'A4', orientation: 'portrait', margin: '2cm' })
 *     .setHeader({ logo: 'Logo', title: 'Document Title', edition: 'v1' })
 *     .setFooter({ author: 'IT Center', link: 'https://example.com' })
 *     .addFromHtml(previewInnerHTML)          // string or element (read, never mutated;
 *                                             // preview code-block wrappers removed)
 *     .save('document.pdf');
 *
 * @example Header/Footer direction — independent of the content
 * // 'rtl' (default): logo/author on the right, «صفحه X از Y» — also for English documents
 * // 'ltr'          : mirrored, "Page X of Y"
 * // 'auto'         : follow the document direction
 * PdfBuilder.create({ headerFooterDirection: 'ltr' })   // at creation …
 *     .setHeaderFooterDirection('ltr');                 // … or with the setter
 *
 * @example Content direction
 * PdfBuilder.create().setDirection('rtl');   // 'auto' (default) | 'rtl' | 'ltr'
 *
 * @example Simple header/footer, paging labels
 * PdfBuilder.create()
 *     .setHeader('Document Title')
 *     .setFooter(true);                                          // labels by direction
 * PdfBuilder.create()
 *     .setFooter({ pagingLabels: { page: 'Page', from: 'of' } });   // explicit labels
 *
 * @example Code blocks — language bar
 * PdfBuilder.create()
 *     .setCodeBlockOptions({
 *         showLanguage: true,       // false → no bar
 *         fallbackLabel: 'code',    // no language class → 'code'; '' → no bar for those
 *         rtlFont: 'code',          // RTL text in code: 'code' font | 'document' bidi font
 *         nestedFrames: true        // frame fenced blocks written inside a code block
 *     });
 *
 * @example Any template option / builder-level styles
 * PdfBuilder.create()
 *     .setFonts({ latin: 'Vazirmatn', bidi: 'Vazirmatn', code: 'DejaVu Sans Mono' })
 *     .setPage({ headerMargin: '0.7cm', footerMargin: '0.7cm' })
 *     .setTemplateOptions({ quoteBorderColor: '#2F5496', codeHeaderBg: '#E7E6E6' })
 *     .setStyles({
 *         endPunctuation: ['.', '!', '?'],
 *         borders: { headerBottom: 'solid black 0.5pt' },       // default: all 0.5pt black
 *         headerColumns: { logo: '15%', title: '70%', edition: '15%' },
 *         footerColumns: { author: '75%', paging: '25%' },
 *         pagingLabels: { page: 'صفحه', from: 'از' },          // for every footer
 *         list: { indent: { base: 24, increment: 18, hanging: 14 } },   // points (default: template listIndent …)
 *         pdf: { lineScale: 1.45, compress: true, outline: true, tableBorder: 'solid black 0.5pt' }
 *     });
 *
 * @example Custom header/footer (callback, called for every page)
 * PdfBuilder.create().setHeaderFooterCallback((doc, ctx) => {
 *     // ctx: { pageNumber, pageCount, direction (header/footer), isRTL, docDirection,
 *     //        pagingLabels, page: { width, height, margin },
 *     //        drawText(text, { x0, x1, y, align, size, color }) }  — BiDi-aware
 *     ctx.drawText('سربرگ ISO 2000', { x0: ctx.page.margin.left,
 *         x1: ctx.page.width - ctx.page.margin.right, y: 30, align: 'center' });
 * });
 *
 * @example Page breaks and images
 * PdfBuilder.create()
 *     .addFromHtml(html)            // <div style="page-break-before:always"> is honored
 *     .addPageBreak()               // appends a page break to the content
 *     .addImage(dataUri, { width: 300 });   // appends a data-URI image (width in pt)
 *
 * @example Output
 * const doc  = builder.build();          // jsPDF instance
 * const blob = builder.toBlob();
 * const uri  = builder.toDataUri();
 * builder.preview('#pdfFrame');           // iframe element or selector
 * builder.save('document.pdf');
 *
 * ─────────────────────────────────────────────────────────────────────
 * REQUIREMENTS (load order)
 * ─────────────────────────────────────────────────────────────────────
 *
 * @requires jsPDF 4.x (UMD: global `jspdf.jsPDF`, or config.jsPDF)
 * @requires BidiCore.js — shared direction / BiDi engine
 * @requires msOfficeWordHtmlTemplate.js — createMsoTemplate.DEFAULTS
 * @requires pdf-font-vazirmatn.js / pdf-font-sahel.js (global PdfFonts) — or your
 *           own TTF fonts as base64 via registerFont() — for Persian text;
 *           optional pdf-font-dejavu-sans.js (symbols, Hebrew, Cyrillic,
 *           Greek … fallback), pdf-font-dejavu-sans-mono.js (code, with
 *           Arabic script) and pdf-font-noto-emoji.js (emoji)
 */

(function (global) {
    'use strict';

    // Shared configuration surface (setters, validation, images, content)
    const BuilderBase = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
        ? require('./BuilderBase.js')
        : global.BuilderBase;
    if (!BuilderBase) {
        throw new Error('PdfBuilder requires BuilderBase.js — load it before PdfBuilder.js');
    }


    const BidiCore = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
        ? require('./BidiCore.js')
        : global.BidiCore;
    if (!BidiCore) {
        throw new Error('PdfBuilder requires BidiCore.js — load it before PdfBuilder.js');
    }

    // =========================================================================
    // Default Configuration (builder-level; styling lives in the template)
    // =========================================================================
    const DEFAULTS = {
        direction: 'auto',              // 'auto' | 'rtl' | 'ltr'
        endPunctuation: ['.'],

        pagingLabels: null,             // null → by header/footer direction
        header: { mode: 'none' },       // 'none' | 'simple' | 'structured' | 'callback'
        footer: { mode: 'none' },

        // rtlFont — RTL text inside code: 'code' → the code font draws it too
        // (one font, one column grid; DejaVu Sans Mono has Arabic script),
        // 'document' → the document's bidi font draws RTL words.
        // nestedFrames — fenced blocks written inside a code block (```` md
        // showing ``` examples) get a frame each; their text stays raw.
        codeBlock: { showLanguage: true, fallbackLabel: 'code', rtlFont: 'code', nestedFrames: true },

        // Per-glyph font fallback (PDF only). A character the run's font has
        // no glyph for is drawn with the first family in this chain that has
        // one. 'auto' → every other registered family, in registration order;
        // ['DejaVu Sans', …] → exactly these (registered names); [] → off.
        fallbackFonts: 'auto',

        // List geometry in points (DocxBuilder: 720/720/360 twips)
        horizontalRule: 'solid #A0A0A0 0.75pt',

        // PDF-only
        pdf: {
            lineScale: 1.45,            // single-line height / font size
            compress: true,
            outline: true,              // PDF bookmarks for headings
            tableBorder: 'solid black 0.5pt'   // null → template tableBorder
        },

        template: {}
    };


    const DEFAULT_PAGING_LABELS = BuilderBase.DEFAULT_PAGING_LABELS;

    /**
     * Unicode Bidi_Mirrored pairs. jsPDF's BiDi engine reverses an RTL run
     * but does not mirror, so "(متن)" would come out as ")متن(".
     */
    const MIRROR = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<',
                     '«': '»', '»': '«', '‹': '›', '›': '‹' };
    function mirror(text) { return text.replace(/[()[\]{}<>«»‹›]/g, function (c) { return MIRROR[c]; }); }

    // ── Arabic-script shaping ───────────────────────────────────────────
    // jsPDF shapes by itself, but treats EVERY U+0600–06FF character as a
    // joining letter — so a letter before «،» «؟» «؛», before a haraka (ِ)
    // or before hamza above (ٔ) takes its medial form («اینکه،» → ـهـ).
    // PdfBuilder shapes first, with the Unicode joining rules; jsPDF leaves
    // presentation forms untouched and still resolves lam-alef ligatures.

    /** base letter → [isolated, final, initial, medial] presentation forms */
    const ARABIC_FORMS = {};
    '0621:FE80;0622:FE81,FE82;0623:FE83,FE84;0624:FE85,FE86;0625:FE87,FE88;0626:FE89,FE8A,FE8B,FE8C;0627:FE8D,FE8E;0628:FE8F,FE90,FE91,FE92;0629:FE93,FE94;062A:FE95,FE96,FE97,FE98;062B:FE99,FE9A,FE9B,FE9C;062C:FE9D,FE9E,FE9F,FEA0;062D:FEA1,FEA2,FEA3,FEA4;062E:FEA5,FEA6,FEA7,FEA8;062F:FEA9,FEAA;0630:FEAB,FEAC;0631:FEAD,FEAE;0632:FEAF,FEB0;0633:FEB1,FEB2,FEB3,FEB4;0634:FEB5,FEB6,FEB7,FEB8;0635:FEB9,FEBA,FEBB,FEBC;0636:FEBD,FEBE,FEBF,FEC0;0637:FEC1,FEC2,FEC3,FEC4;0638:FEC5,FEC6,FEC7,FEC8;0639:FEC9,FECA,FECB,FECC;063A:FECD,FECE,FECF,FED0;0641:FED1,FED2,FED3,FED4;0642:FED5,FED6,FED7,FED8;0643:FED9,FEDA,FEDB,FEDC;0644:FEDD,FEDE,FEDF,FEE0;0645:FEE1,FEE2,FEE3,FEE4;0646:FEE5,FEE6,FEE7,FEE8;0647:FEE9,FEEA,FEEB,FEEC;0648:FEED,FEEE;0649:FEEF,FEF0,488,489;064A:FEF1,FEF2,FEF3,FEF4;0671:FB50,FB51;0677:FBDD;0679:FB66,FB67,FB68,FB69;067A:FB5E,FB5F,FB60,FB61;067B:FB52,FB53,FB54,FB55;067E:FB56,FB57,FB58,FB59;067F:FB62,FB63,FB64,FB65;0680:FB5A,FB5B,FB5C,FB5D;0683:FB76,FB77,FB78,FB79;0684:FB72,FB73,FB74,FB75;0686:FB7A,FB7B,FB7C,FB7D;0687:FB7E,FB7F,FB80,FB81;0688:FB88,FB89;068C:FB84,FB85;068D:FB82,FB83;068E:FB86,FB87;0691:FB8C,FB8D;0698:FB8A,FB8B;06A4:FB6A,FB6B,FB6C,FB6D;06A6:FB6E,FB6F,FB70,FB71;06A9:FB8E,FB8F,FB90,FB91;06AD:FBD3,FBD4,FBD5,FBD6;06AF:FB92,FB93,FB94,FB95;06B1:FB9A,FB9B,FB9C,FB9D;06B3:FB96,FB97,FB98,FB99;06BA:FB9E,FB9F;06BB:FBA0,FBA1,FBA2,FBA3;06BE:FBAA,FBAB,FBAC,FBAD;06C0:FBA4,FBA5;06C1:FBA6,FBA7,FBA8,FBA9;06C5:FBE0,FBE1;06C6:FBD9,FBDA;06C7:FBD7,FBD8;06C8:FBDB,FBDC;06C9:FBE2,FBE3;06CB:FBDE,FBDF;06CC:FBFC,FBFD,FBFE,FBFF;06D0:FBE4,FBE5,FBE6,FBE7;06D2:FBAE,FBAF;06D3:FBB0,FBB1'.split(';').forEach(function (e) {
        const kv = e.split(':');
        ARABIC_FORMS[parseInt(kv[0], 16)] = kv[1].split(',').map(function (h) { return parseInt(h, 16); });
    });
    /** Transparent (Joining_Type T): harakat, superscript alef, Quranic marks, hamza above/below. */
    const TRANSPARENT = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/;
    const JOIN_CAUSING = /[\u0640\u200D]/;                 // tatweel, ZWJ

    function joiningType(ch) {
        if (ch === undefined) return 'U';
        if (TRANSPARENT.test(ch)) return 'T';
        if (JOIN_CAUSING.test(ch)) return 'C';
        const f = ARABIC_FORMS[ch.charCodeAt(0)];
        if (!f) return 'U';                                 // punctuation, digits, ZWNJ, Latin …
        return f.length >= 4 ? 'D' : f.length >= 2 ? 'R' : 'U';
    }

    /** Logical text → contextual presentation forms (still logical order). */
    function shapeArabic(text) {
        if (!/[\u0620-\u06FF]/.test(text)) return text;
        const chars = Array.from(text);
        const types = chars.map(joiningType);
        let out = '';
        for (let i = 0; i < chars.length; i++) {
            const t = types[i];
            if (t !== 'D' && t !== 'R') { out += chars[i]; continue; }
            let p = i - 1; while (p >= 0 && types[p] === 'T') p--;
            let n = i + 1; while (n < chars.length && types[n] === 'T') n++;
            const tp = p >= 0 ? types[p] : 'U', tn = n < chars.length ? types[n] : 'U';
            const joinPrev = (tp === 'D' || tp === 'C');
            const joinNext = t === 'D' && (tn === 'D' || tn === 'R' || tn === 'C');
            const f = ARABIC_FORMS[chars[i].charCodeAt(0)];
            const form = joinPrev && joinNext ? 3 : joinPrev ? 1 : joinNext ? 2 : 0;
            out += String.fromCharCode(f[form] !== undefined ? f[form] : f[0]);
        }
        return out;
    }

    // ── Per-glyph font fallback ─────────────────────────────────────────
    /** Default-ignorable code points: never drawn as a glyph of their own. */
    const IGNORABLE = /[\u00AD\u034F\u061C\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFE00-\uFE0F\uFEFF]|\uDB40[\uDC00-\uDDEF]/;
    /** Combining marks: kept with the base character's font when it has them. */
    const MARK = /\p{M}/u;
    /** Emoji properties (null on engines without Unicode property escapes). */
    const unicodeRe = function (src) { try { return new RegExp(src, 'u'); } catch (e) { return null; } };
    const EMOJI = unicodeRe('^\\p{Emoji}$');
    const EMOJI_PRES = unicodeRe('^\\p{Emoji_Presentation}$');
    /** Quick test: may this word contain an emoji? (astral, BMP symbols, keycap bases) */
    const EMOJI_HINT = /[\uD800-\uDBFF\u00A9\u00AE\u203C-\u3299#*0-9]/;

    /** jsPDF options that make it reorder (and shape) one RTL run. */
    const RTL_TEXT = { isInputVisual: false, isOutputVisual: true, isInputRtl: true, isOutputRtl: false };

    const BLOCK_TAGS = /^(P|DIV|H[1-6]|BLOCKQUOTE|UL|OL|PRE|TABLE|HR|DL|DT|DD|FIGURE|FIGCAPTION|SECTION|ARTICLE|MAIN|HEADER|FOOTER|ASIDE|NAV|DETAILS|SUMMARY|ADDRESS)$/;

    // =========================================================================
    // Helpers
    // =========================================================================
    const toPt = BidiCore.lengthToPt;

    const NAMED_COLORS = {
        windowtext: '#000000', black: '#000000', white: '#FFFFFF', darkgreen: '#006400',
        green: '#008000', gray: '#808080', grey: '#808080', silver: '#C0C0C0', red: '#FF0000',
        blue: '#0000FF', navy: '#000080', maroon: '#800000', orange: '#FFA500', yellow: '#FFFF00'
    };
    /** CSS color → [r, g, b] */
    function rgb(c) {
        let s = String(c || '').trim().toLowerCase();
        if (NAMED_COLORS[s]) s = NAMED_COLORS[s].toLowerCase();
        let m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(s);
        if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
        m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
        if (m) return [parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16), parseInt(m[3] + m[3], 16)];
        return [0, 0, 0];
    }

    /** 'solid #C07030 3.5pt' → { width (pt), color [r,g,b], none } */
    function parseBorder(css) {
        const out = { width: 0.75, color: [0, 0, 0], none: false };
        String(css || '').trim().split(/\s+/).forEach(function (t) {
            const low = t.toLowerCase();
            if (low === 'none' || low === 'hidden') out.none = true;
            else if (/^(solid|dotted|dashed|double)$/.test(low)) { /* drawn solid */ }
            else if (/^[\d.]+(pt|px|cm|mm|in)?$/i.test(t)) out.width = toPt(t);
            else out.color = rgb(t);
        });
        return out;
    }

    /** Margin shorthand (1–4 values) → { top, right, bottom, left } in pt. */
    function parseBox(value) {
        const v = String(value).trim().split(/\s+/).map(toPt);
        const t = v[0], r = v.length > 1 ? v[1] : t, b = v.length > 2 ? v[2] : t, l = v.length > 3 ? v[3] : r;
        return { top: t, right: r, bottom: b, left: l };
    }

    function cssSafe(value, what) {
        const v = String(value).replace(/["';{}<>\\]/g, '').trim();
        if (!v) throw new PdfBuilderError('Invalid ' + what + ': ' + value);
        return v;
    }

    function textNodes(root) {
        const walker = document.createTreeWalker(root, 4);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        return nodes;
    }
    function normalizeWhitespace(root) {
        textNodes(root).forEach(function (n) {
            if (n.parentElement && n.parentElement.closest('pre')) return;
            n.nodeValue = n.nodeValue.replace(/[ \t\n\r\f]+/g, ' ');
        });
    }
    function trimEdges(el) {
        const nodes = textNodes(el);
        for (let i = 0; i < nodes.length; i++) {
            nodes[i].nodeValue = nodes[i].nodeValue.replace(/^\s+/, '');
            if (nodes[i].nodeValue) break;
        }
        for (let i = nodes.length - 1; i >= 0; i--) {
            nodes[i].nodeValue = nodes[i].nodeValue.replace(/\s+$/, '');
            if (nodes[i].nodeValue) break;
        }
    }
    function isInlineNode(node) {
        if (node.nodeType === 3) return true;
        return node.nodeType === 1 && !BLOCK_TAGS.test(node.tagName);
    }
    function hasContent(el) {
        return /\S/.test(el.textContent) || !!el.querySelector('input, br, img');
    }
    function splitOnBr(innerHtml) {
        return innerHtml.split('<br>')
            .map(function (p) { return p.trim(); })
            .filter(function (p) { return p.length > 0; })
            .map(function (p) { return '<p>' + p + '</p>'; })
            .join('');
    }
    function wrapInline(first) {
        const span = document.createElement('span');
        first.parentNode.insertBefore(span, first);
        return span;
    }
    function isLatin1(text) { return /^[\u0009\u0020-\u007E\u00A0-\u00FF]*$/.test(text); }
    function pageBreakBefore(el) {
        const s = (el.getAttribute && el.getAttribute('style')) || '';
        return /(page-break-before|break-before)\s*:\s*(always|page)/i.test(s);
    }
    function pageBreakAfter(el) {
        const s = (el.getAttribute && el.getAttribute('style')) || '';
        return /(page-break-after|break-after)\s*:\s*(always|page)/i.test(s);
    }

    function toRoman(n) {
        const map = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
            [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
        let s = '';
        map.forEach(function (p) { while (n >= p[0]) { s += p[1]; n -= p[0]; } });
        return s;
    }
    function toLetters(n) {
        let s = '';
        while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); }
        return s;
    }

    /**
     * Direction spans of a text: [[start, end, rtl], …] covering it.
     * Mixed LTR/RTL text → BidiCore isolate ranges; single-script text
     * entirely in the other script flips as a whole (an English title in an
     * RTL header, a Persian paragraph in an LTR document).
     */
    /** Code (LTR context): [start, end, rtl] spans by BidiCore.codeRtlRanges. */
    function codeSpans(text) {
        const spans = [];
        let pos = 0;
        BidiCore.codeRtlRanges(text).forEach(function (r) {
            if (r[0] > pos) spans.push([pos, r[0], false]);
            spans.push([r[0], r[1], true]);
            pos = r[1];
        });
        if (pos < text.length) spans.push([pos, text.length, false]);
        return spans;
    }

    function dirSpans(text, base, endPunctuation) {
        const baseRtl = base === 'rtl';
        if (!text) return [];
        if (!BidiCore.hasMix(text)) {
            let rtl = baseRtl;
            if (baseRtl && BidiCore.hasLatin(text) && !BidiCore.hasRtlLetter(text)) rtl = false;
            else if (!baseRtl && BidiCore.hasRtlLetter(text) && !BidiCore.hasLatin(text)) rtl = true;
            return [[0, text.length, rtl]];
        }
        const ranges = BidiCore.findIsolateRanges(text, base, { endPunctuation: endPunctuation || [] });
        const spans = [];
        let pos = 0;
        ranges.forEach(function (r) {
            if (r[0] > pos) spans.push([pos, r[0], baseRtl]);
            if (r[1] > r[0]) spans.push([r[0], r[1], !baseRtl]);
            pos = Math.max(pos, r[1]);
        });
        if (pos < text.length) spans.push([pos, text.length, baseRtl]);
        return spans;
    }


    // =========================================================================
    // PdfBuilderError
    // =========================================================================
    class PdfBuilderError extends Error {
        constructor(message, cause = null) {
            super(message);
            this.name = 'PdfBuilderError';
            this.cause = cause;
        }
    }


    // =========================================================================
    // PdfBuilder
    // =========================================================================
    class PdfBuilder extends BuilderBase {

        /**
         * @param {object} config - builder config overrides; may also carry
         *        `jsPDF` (the constructor) and `templateFactory`
         */
        constructor(config = {}) {
            super(config, { defaults: DEFAULTS, Error: PdfBuilderError, keep: ['jsPDF'] });
            this._jsPDF = config.jsPDF || null;
            this._fonts = {};                 // lower-case family → { family, styles }
            this._b = null;                   // per-build state
        }

        static create(config = {}) {
            return new PdfBuilder(config);
        }

        // =====================================================================
        // Fonts
        // =====================================================================

        /**
         * Register font families, in the pdf-font-*.js format (global PdfFonts):
         *   { key: { family, styles: { normal|bold|italic|bolditalic: { vfsName, data } } } }
         * Entries with empty data are skipped.
         */
        registerFonts(fontsObj) {
            Object.keys(fontsObj || {}).forEach(function (k) {
                const f = fontsObj[k];
                if (f && f.family && f.styles) this.registerFont(f.family, f.styles, { emoji: f.emoji, marks: f.marks });
            }, this);
            return this;
        }

        /**
         * Register one family: registerFont('Vazirmatn', { normal: { vfsName, data }, bold: … })
         * Registering a family again ADDS its styles (e.g. a bold style from
         * another source); a style given again replaces the earlier one.
         * options.marks: GPOS mark anchors from build_pdf_fonts.py (see _markData).
         * options.emoji: { pua, seq } of an emoji font built by build_pdf_fonts.py
         * (emoji / sequences above the BMP remapped to the Private Use Area);
         * every style of one family must come with the identical map.
         */
        registerFont(family, styles, options = {}) {
            const valid = {};
            Object.keys(styles || {}).forEach(function (st) {
                const s = styles[st];
                if (s && s.data) valid[st] = { vfsName: s.vfsName || (family + '-' + st + '.ttf'), data: s.data };
            });
            if (!Object.keys(valid).length) return this;
            const key = String(family).toLowerCase();
            const emoji = options.emoji && typeof options.emoji.seq === 'string' ? options.emoji : null;
            const entry = this._fonts[key] || (this._fonts[key] = { family: family, styles: {} });
            if (emoji) {
                if (entry.emoji && (entry.emoji.seq !== emoji.seq || (entry.emoji.pua || 0xE000) !== (emoji.pua || 0xE000))) {
                    throw new PdfBuilderError('registerFont: "' + family + '" styles come from different emoji builds '
                        + '(PUA maps differ) — rebuild the emoji font with build_pdf_fonts.py');
                }
                entry.emoji = emoji;
            }
            if (options.marks && options.marks.styles) {
                entry.marks = Object.assign({}, entry.marks || {}, options.marks,
                    { styles: Object.assign({}, entry.marks && entry.marks.styles, options.marks.styles) });
                entry.marksParsed = null;
            }
            Object.assign(entry.styles, valid);
            return this;
        }

        // =====================================================================
        // Configuration (fluent) — same surface as WordHtmlBuilder / DocxBuilder
        // =====================================================================

        /**
         * Font families by role — names of registered families.
         *   .setFonts({ latin: 'Vazirmatn', bidi: 'Vazirmatn', code: 'DejaVu Sans Mono' })
         *   .setFonts({ fallback: ['DejaVu Sans'] })   // per-glyph fallback chain
         *   .setFonts({ fallback: 'auto' })            // default: all other registered
         *   .setFonts({ fallback: [] })                // no fallback
         */
        setFonts(fonts = {}) {
            if (fonts.fallback !== undefined) {
                const fb = fonts.fallback;
                if (fb === 'auto') this._config.fallbackFonts = 'auto';
                else if (Array.isArray(fb)) {
                    if (fb.some(function (n) { return String(n).toLowerCase() === 'auto'; })) {
                        throw new PdfBuilderError("setFonts: use fallback: 'auto' (a string), not ['auto'] — "
                            + 'inside an array, auto would be read as a family name');
                    }
                    this._config.fallbackFonts = fb.map(function (n) { return cssSafe(n, 'fallback font'); });
                }
                else throw new PdfBuilderError("setFonts: fallback must be 'auto' or an array of family names");
            }
            return super.setFonts(fonts);           // latin, bidi, code (BuilderBase)
        }

        // =====================================================================
        // Header / Footer
        // =====================================================================

        // =====================================================================
        // Content
        // =====================================================================

        /** Append a page break to the content. */
        addPageBreak() {
            this._contentHtml += '<div style="page-break-before:always"></div>';
            return this;
        }

        /** Append a data-URI image (PNG/JPEG); options.width in pt (default: natural, max text width). */
        addImage(dataUri, options = {}) {
            const w = options.width ? ' width="' + (parseFloat(options.width) / 0.75) + '"' : '';
            this._contentHtml += '<p><img src="' + String(dataUri).replace(/"/g, '') + '"' + w + '></p>';
            return this;
        }

        // =====================================================================
        // Output
        // =====================================================================

        /** Build and return the jsPDF document. */
        /**
         * The jsPDF document. With a table of contents the layout runs twice:
         * the first pass finds the page of every listed heading, the second
         * prints the same layout with those page numbers.
         * @returns {object} jsPDF document
         */
        build() {
            if (!this._config.toc) return this._buildOnce();
            this._tocPages = null;
            this._tocCollect = {};
            try {
                this._buildOnce();                       // pass 1: where the headings land
                this._tocPages = this._tocCollect;
                this._tocCollect = null;
                return this._buildOnce();                // pass 2: the same layout, with the numbers
            } finally {
                this._tocPages = this._tocCollect = null;
            }
        }

        _buildOnce() {
            const JsPDF = this._getJsPDF();
            if (typeof document === 'undefined') throw new PdfBuilderError('PdfBuilder.build() needs a DOM');
            const T = this.getTemplateOptions();
            const factory = this._resolveTemplateFactory();
            const cfg = this._config;

            // ── Parse once into a private tree ──
            const root = BidiCore.inertRoot();          // parsed without loading images
            root.innerHTML = this._contentHtml;
            BidiCore.unwrapCodeBlocks(root);
            root.querySelectorAll('p').forEach(function (p) {
                if (p.innerHTML.includes('<br>')) p.outerHTML = splitOnBr(p.innerHTML);
            });

            // ── Direction: the same decisions as the Word builders ──
            const detected = BidiCore.detectDirection(root);
            const docDir = cfg.direction === 'auto' ? detected : cfg.direction;
            if (cfg.toc) BidiCore.insertToc(root, { levels: cfg.toc.levels, title: cfg.toc.title, dir: docDir });
            const plan = BidiCore.planToMaps(BidiCore.planDirections(root, docDir === 'rtl'));
            const hfPref = cfg.headerFooterDirection;
            const hfDir = (hfPref === 'rtl' || hfPref === 'ltr') ? hfPref : docDir;
            normalizeWhitespace(root);

            // ── Page ──
            const wh = String(T.pageSize).trim().split(/\s+/).map(toPt);
            const landscape = T.pageOrientation === 'landscape' || wh[0] > wh[1];
            const pageW = landscape ? Math.max(wh[0], wh[1]) : Math.min(wh[0], wh[1]);
            const pageH = landscape ? Math.min(wh[0], wh[1]) : Math.max(wh[0], wh[1]);
            const margin = parseBox(T.pageMargin);

            const doc = new JsPDF({
                unit: 'pt', format: [Math.min(pageW, pageH), Math.max(pageW, pageH)],
                orientation: landscape ? 'landscape' : 'portrait',
                compress: cfg.pdf.compress !== false, putOnlyUsedFonts: true
            });
            if (doc.setR2L) doc.setR2L(false);
            this._registerFontsIn(doc);

            const pct = function (v) {
                return /%$/.test(String(v)) ? parseFloat(v) / 100 : null;
            };

            // Body starts below a header that is taller than the top margin (and
            // ends above such a footer), as in Word.
            const hfRow = toPt(T.bidiFontSize) * (cfg.pdf.lineScale || 1.45) + 4;
            const hasHeader = cfg.header.mode === 'simple' || cfg.header.mode === 'structured';
            const hasFooter = cfg.footer.mode === 'simple' || cfg.footer.mode === 'structured';
            // a header logo image may make the header row taller than one text line
            const hLogo = this._headerLogo();
            const headerRow = hLogo ? Math.max(hfRow, toPt(cfg.header.logoHeight || '1cm') + 4) : hfRow;
            const bodyTop = hasHeader ? Math.max(margin.top, toPt(T.headerMargin) + headerRow + 8) : margin.top;
            const bodyBottom = hasFooter ? Math.min(pageH - margin.bottom, pageH - toPt(T.footerMargin) - hfRow - 8) : pageH - margin.bottom;

            this._b = {
                doc: doc, T: T, root: root, plan: plan, cfg: cfg,
                docDir: docDir, docIsRTL: docDir === 'rtl', hfDir: hfDir,
                pageW: pageW, pageH: pageH, margin: margin,
                top: bodyTop, bottom: bodyBottom, headerRow: headerRow, headerLogo: hLogo,
                y: bodyTop, decos: [], widthCache: new Map(),
                lineScale: cfg.pdf.lineScale || 1.45,
                lh: pct(T.lineHeight) || 1.1, lhTight: pct(T.lineHeightTight) || 1.0,
                exactLine: String(T.lineHeightRule || '').toLowerCase() === 'exactly' ? toPt(T.lineHeight) : 0,
                spacing: { before: toPt(T.paraMarginTop), after: toPt(T.paraMarginBottom) },
                sizes: { latin: toPt(T.fontSize), bidi: toPt(T.bidiFontSize), code: toPt(T.codeFontSize) },
                fams: this._resolveFamilies(T),
                fallback: this._resolveFallback(),
                emoji: this._resolveEmoji(),
                cover: new Map(), splitCache: new Map(),
                hljs: this._hljsPalette(factory),
                listCounter: 0
            };

            // custom HTML header/footer: measured with 3-digit page numbers; the
            // body starts below / ends above it, as Word does with a tall header
            if (cfg.header.mode === 'html') {
                const hh = this._hfLayout('header', margin.left, pageW - margin.right, 999, 999).h;
                this._b.top = this._b.y = Math.max(margin.top, toPt(T.headerMargin) + hh + 6);
            }
            if (cfg.footer.mode === 'html') {
                const fh = this._hfLayout('footer', margin.left, pageW - margin.right, 999, 999).h;
                this._b.bottom = Math.min(pageH - margin.bottom, pageH - toPt(T.footerMargin) - fh - 6);
            }

            try {
                const frame = { left: margin.left, right: pageW - margin.right, body: true };
                this._renderBlocks(root, frame, {});
                this._closeDecos(this._b.y);
                this._drawHeadersFooters();
                if (doc.setLanguage) doc.setLanguage(docDir === 'rtl' ? 'fa-IR' : 'en-US');
                return doc;
            } finally {
                this._b = null;
            }
        }

        // Outputs resolve the images first (async); build() itself stays sync
        // and uses whatever is resolved (plus data URIs as given).

        /** @returns {Promise<Blob>} */
        async toBlob() { await this._resolveImages(); return this.build().output('blob'); }

        /** @returns {Promise<string>} */
        async toDataUri() { await this._resolveImages(); return this.build().output('datauristring'); }

        async save(filename = 'document.pdf') {
            await this._resolveImages();
            this.build().save(filename);
            return this;
        }

        /** Show in an iframe (element or selector). */
        async preview(target) {
            const el = typeof target === 'string' ? document.querySelector(target) : target;
            if (!el) throw new PdfBuilderError('Preview target not found: ' + target);
            const url = URL.createObjectURL(await this.toBlob());
            if (el._pdfBuilderUrl) URL.revokeObjectURL(el._pdfBuilderUrl);
            el._pdfBuilderUrl = url;
            el.src = url;
            return this;
        }

        // =====================================================================
        // Resolution helpers
        // =====================================================================

        _getJsPDF() {
            if (this._jsPDF) return this._jsPDF;
            if (global.jspdf && global.jspdf.jsPDF) return (this._jsPDF = global.jspdf.jsPDF);
            if (global.jsPDF) return (this._jsPDF = global.jsPDF);
            throw new PdfBuilderError('jsPDF not found. Load jspdf.umd.js or pass config.jsPDF');
        }

        _registerFontsIn(doc) {
            const fonts = this._fonts;
            Object.keys(fonts).forEach(function (k) {
                const f = fonts[k];
                Object.keys(f.styles).forEach(function (st) {
                    doc.addFileToVFS(f.styles[st].vfsName, f.styles[st].data);
                    doc.addFont(f.styles[st].vfsName, f.family, st);
                });
            });
        }

        /** Template font names → registered families (fallbacks: first registered, built-ins). */
        _resolveFamilies(T) {
            const fonts = this._fonts;
            const first = Object.keys(fonts)[0];
            const reg = function (name) { const f = fonts[String(name || '').toLowerCase()]; return f || null; };
            const firstFam = first ? fonts[first] : null;
            return {
                latin: reg(T.latinFont) || firstFam,           // null → helvetica
                bidi: reg(T.bidiFont) || firstFam,
                code: reg(T.codeFont)                           // null → courier / bidi fallback
            };
        }

        /** Fallback chain → registered families ('auto': all, in registration order). */
        _resolveFallback() {
            const fonts = this._fonts, fb = this._config.fallbackFonts;
            const names = fb === 'auto' || fb === undefined ? Object.keys(fonts)
                : (Array.isArray(fb) ? fb : []).map(function (n) { return String(n).toLowerCase(); });
            const out = [], missing = [];
            names.forEach(function (n) {
                if (!fonts[n]) missing.push(n);
                else if (out.indexOf(fonts[n]) < 0) out.push(fonts[n]);
            });
            if (missing.length && !this._warnedFallback && typeof console !== 'undefined' && console.warn) {
                this._warnedFallback = true;          // _resolveFallback runs twice per build
                console.warn('PdfBuilder: fallback font(s) not registered, skipped: ' + missing.join(', ')
                    + ' — load the pdf-font-*.js file and call registerFonts(PdfFonts) first');
            }
            return out;
        }

        /**
         * The emoji font: the first family of the fallback chain that carries an
         * emoji map. Its sequence trie (code points, FE0F removed → PUA char)
         * is built once per registered font.
         */
        _resolveEmoji() {
            const fam = this._resolveFallback().filter(function (f) { return f.emoji; })[0];
            if (!fam) return null;
            if (!fam.trie) {
                const root = new Map(), base = fam.emoji.pua || 0xE000;
                fam.emoji.seq.split(';').forEach(function (entry, i) {
                    let node = root;
                    entry.split(' ').forEach(function (h) {
                        const cp = parseInt(h, 16);
                        if (!node.has(cp)) node.set(cp, new Map());
                        node = node.get(cp);
                    });
                    node.pua = String.fromCharCode(base + i);
                });
                fam.trie = root;
            }
            return fam;
        }

        _hljsPalette(factory) {
            const palette = {};
            let css;
            try { css = factory(Object.assign({}, this._config.template, { direction: 'ltr' })); } catch (e) { return palette; }
            const re = /\.(hljs-[\w-]+)\s*\{([^}]*)\}/g;
            let m;
            while ((m = re.exec(css))) {
                const decl = m[2], st = {};
                const color = /(?:^|;|\s)color\s*:\s*([^;]+)/.exec(decl);
                if (color) st.color = color[1].trim();
                if (/font-weight\s*:\s*bold/.test(decl)) st.bold = true;
                if (/font-style\s*:\s*italic/.test(decl)) st.italic = true;
                palette[m[1]] = st;
            }
            return palette;
        }

        _dirOf(el) {
            const b = this._b;
            for (let n = el; n && n !== b.root; n = n.parentElement) {
                if (b.plan.dir.has(n)) return { dir: b.plan.dir.get(n), planned: true };
                if (n.tagName === 'TABLE' && b.plan.ltrTables.has(n)) return { dir: 'ltr', planned: true };
            }
            return { dir: b.docDir, planned: false };
        }

        // =====================================================================
        // Fonts & measuring
        // =====================================================================

        /** Font for a piece: role by direction (Latin vs Complex Script) or code. */
        _fontFor(fmt, rtl, text) {
            const b = this._b;
            let fam, size;
            if (fmt.code) {
                const rtlDoc = (b.cfg.codeBlock || {}).rtlFont === 'document' && BidiCore.hasRtlLetter(text);
                fam = rtlDoc ? b.fams.bidi : (b.fams.code || (isLatin1(text) ? null : b.fams.bidi));
                size = fmt.size || b.sizes.code;
                if (!fam) return { name: 'courier', style: this._styleName(null, fmt), size: this._scriptSize(size, fmt) };
            } else if (rtl) {
                fam = b.fams.bidi; size = fmt.size || b.sizes.bidi;
            } else {
                fam = b.fams.latin; size = fmt.size || b.sizes.latin;
            }
            if (!fam) return { name: 'helvetica', style: this._styleName(null, fmt), size: this._scriptSize(size, fmt) };
            return { name: fam.family, style: this._styleName(fam, fmt), size: this._scriptSize(size, fmt) };
        }

        _scriptSize(size, fmt) { return (fmt.sup || fmt.sub) ? size * 0.7 : size; }

        _styleName(fam, fmt) {
            const want = fmt.bold && fmt.italic ? 'bolditalic' : fmt.bold ? 'bold' : fmt.italic ? 'italic' : 'normal';
            if (!fam) return want;                           // built-in fonts have all four
            if (fam.styles[want]) return want;
            if (want === 'bolditalic' && fam.styles.bold) return 'bold';
            if (want === 'bolditalic' && fam.styles.italic) return 'italic';
            return fam.styles.normal ? 'normal' : Object.keys(fam.styles)[0];
        }

        _setFont(f) {
            const doc = this._b.doc;
            doc.setFont(f.name, f.style);
            doc.setFontSize(f.size);
        }

        _width(text, f) {
            const key = f.name + '|' + f.style + '|' + f.size + '|' + text;
            const c = this._b.widthCache;
            if (c.has(key)) return c.get(key);
            this._setFont(f);
            const w = this._b.doc.getTextWidth(text);
            c.set(key, w);
            return w;
        }

        /**
         * Code points a font can draw: the TTF cmap for registered fonts,
         * WinAnsiEncoding for jsPDF's built-in fonts. Cached per build.
         */
        _coverage(f) {
            const b = this._b, key = f.name + '|' + f.style;
            if (b.cover.has(key)) return b.cover.get(key);
            let set = null;
            try {
                const font = b.doc.internal.getFont(f.name, f.style);
                const md = font && font.metadata;
                if (md && md.cmap && md.cmap.unicode && md.cmap.unicode.codeMap) {
                    set = new Set(Object.keys(md.cmap.unicode.codeMap).map(Number));
                } else if (font && font.isStandardFont) {
                    // built-in fonts: WinAnsiEncoding = Latin-1 + the 0x80–0x9F extras
                    set = new Set();
                    for (let c = 0x20; c <= 0x7E; c++) set.add(c);
                    for (let c = 0xA0; c <= 0xFF; c++) set.add(c);
                    const enc = md && md.Unicode && md.Unicode.encoding && md.Unicode.encoding.WinAnsiEncoding;
                    Object.keys(enc || {}).forEach(function (k) { set.add(Number(k)); });
                }
            } catch (e) { set = null; }
            b.cover.set(key, set);                          // null → unknown: assume full coverage
            return set;
        }

        /**
         * Split a word at characters its font cannot draw; each part gets the
         * first font of the fallback chain that has the glyph (the run's own
         * font when none has it). Combining marks and default-ignorables
         * (ZWJ, ZWNJ, variation selectors …) stay with the preceding part and
         * are dropped when that part's font has no glyph for them, so e.g.
         * «⚠️» (U+26A0 U+FE0F) prints as the plain sign instead of a box.
         * @returns {Array<{ text, f }>}
         */
        _splitByCoverage(text, f, fmt) {
            const b = this._b;
            if (!b.fallback.length || !text) return [{ text: text, f: f }];
            const ck = f.name + '|' + f.style + '|' + f.size + '|' + (fmt && fmt.bold ? 1 : 0) + (fmt && fmt.italic ? 1 : 0) + '|' + text;
            if (b.splitCache.has(ck)) return b.splitCache.get(ck);
            const own = this._coverage(f);
            let result;
            if (!own) result = [{ text: text, f: f }];
            else {
                const self = this, chain = [f];
                // text fallbacks in chain order; the emoji font always last, so a
                // text-default symbol (⚠ without FE0F) prefers a text font
                b.fallback.filter(function (fam) { return !fam.emoji; })
                    .concat(b.fallback.filter(function (fam) { return fam.emoji; })).forEach(function (fam) {
                    if (String(fam.family).toLowerCase() === String(f.name).toLowerCase()) return;
                    chain.push({ name: fam.family, style: self._styleName(fam, fmt || {}), size: f.size, emoji: !!fam.emoji });
                });
                const covers = function (font, cp) {
                    // an emoji font's PUA slots are reached only through _emojiSplit,
                    // never by coverage: user PUA text must not turn into emoji
                    if (font.emoji && cp >= 0xE000 && cp <= 0xF8FF) return false;
                    const c = self._coverage(font); return !c || c.has(cp);
                };
                const parts = [];
                Array.from(text).forEach(function (ch) {
                    const cp = ch.codePointAt(0);
                    const last = parts[parts.length - 1];
                    if (IGNORABLE.test(ch) || MARK.test(ch)) {
                        if (last && covers(last.f, cp)) { last.text += ch; return; }
                        if (IGNORABLE.test(ch)) return;         // invisible: drop rather than draw a box
                    }
                    let font = f;
                    if (!own.has(cp)) {
                        for (let i = 1; i < chain.length; i++) if (covers(chain[i], cp)) { font = chain[i]; break; }
                    }
                    if (last && last.f === font) last.text += ch;
                    else parts.push({ text: ch, f: font });
                });
                result = parts.length ? parts : [{ text: '', f: f }];
            }
            b.splitCache.set(ck, result);
            return result;
        }

        /**
         * One logical word → drawable parts. With an emoji font: emoji (and
         * emoji sequences) become separate parts in that font — one part per
         * emoji, so the line's BiDi reordering places them — and the text
         * between them is shaped and split by coverage as usual.
         * @returns {Array<{ text, f }>}
         */
        _wordParts(word, f, fmt) {
            const b = this._b, self = this;
            if (!b.emoji || !EMOJI_HINT.test(word)) return this._splitByCoverage(shapeArabic(word), f, fmt);
            const ef = { name: b.emoji.family, style: this._styleName(b.emoji, fmt || {}), size: f.size };
            const out = [];
            this._emojiSplit(word, ef).forEach(function (tok) {
                if (tok.emoji) out.push({ text: tok.text, f: ef });
                else self._splitByCoverage(shapeArabic(tok.text), f, fmt).forEach(function (p) { out.push(p); });
            });
            return out;
        }

        /**
         * Emoji segmentation, on the ORIGINAL text (after BidiCore's direction
         * decisions — PUA code points are strong LTR, emoji are neutral):
         *   1. sequences first (ZWJ, flags, skin tones, keycaps, tag flags),
         *      longest match, FE0F anywhere inside ignored (1 FE0F 20E3 = 1 20E3);
         *   2. code points above U+FFFF → the emoji font whatever their
         *      presentation (jsPDF can draw them from no other font);
         *   3. BMP emoji → the emoji font when Emoji_Presentation (⌚ ⚡ ✅)
         *      or followed by FE0F; FE0E, or text presentation (⚠ ✏ © 1),
         *      keeps them in the text chain (emoji font as last resort).
         * The selector after an emoji is consumed. Unknown sequences fall
         * apart into their components (ZWJ is then dropped as invisible).
         * @returns {Array<{ text, emoji?: true }>}
         */
        _emojiSplit(word, ef) {
            const b = this._b, trie = b.emoji.trie, cover = this._coverage(ef);
            const cps = Array.from(word, function (ch) { return ch.codePointAt(0); });
            const out = [];
            let text = '';
            const flush = function () { if (text) { out.push({ text: text }); text = ''; } };
            const emit = function (pua) { flush(); out.push({ text: pua, emoji: true }); };
            let i = 0;
            while (i < cps.length) {
                const cp = cps[i];
                // 1–2. sequence or astral emoji: longest match in the trie
                let node = trie.get(cp), best = -1, pua = null, j = i + 1;
                while (node) {
                    if (node.pua !== undefined) { best = j; pua = node.pua; }
                    let k = j;
                    while (k < cps.length && cps[k] === 0xFE0F) k++;
                    if (k >= cps.length || !node.has(cps[k])) break;
                    node = node.get(cps[k]); j = k + 1;
                }
                if (best > 0) {
                    i = best;
                    if (cps[i] === 0xFE0F || cps[i] === 0xFE0E) i++;
                    emit(pua); continue;
                }
                // 3. BMP emoji by presentation
                const next = cps[i + 1];
                if (cp <= 0xFFFF && !(cp >= 0xE000 && cp <= 0xF8FF) && cover && cover.has(cp) && EMOJI && EMOJI.test(String.fromCodePoint(cp))) {
                    if (next === 0xFE0F || (next !== 0xFE0E && EMOJI_PRES && EMOJI_PRES.test(String.fromCodePoint(cp)))) {
                        emit(String.fromCodePoint(cp)); i += next === 0xFE0F ? 2 : 1; continue;
                    }
                    if (next === 0xFE0E) { text += String.fromCodePoint(cp); i += 2; continue; }
                }
                text += String.fromCodePoint(cp); i++;
            }
            flush();
            return out;
        }

        // =====================================================================
        // Inline content → pieces → atoms
        // =====================================================================

        /**
         * Pieces of an inline container, in logical order, each with its
         * direction. Inline code keeps LTR (its Persian parts flip by script).
         * @returns {Array<{text, fmt, rtl} | {br:true} | {box, checked, fmt}>}
         */
        _pieces(container, baseDir, baseFmt) {
            const self = this, b = this._b;
            const raw = [];
            let flat = '';

            (function walk(node, fmt) {
                if (node.nodeType === 3) {
                    const v = node.nodeValue;
                    if (!v) return;
                    if (fmt.code) raw.push({ text: v, fmt: fmt, code: true });
                    else { raw.push({ text: v, fmt: fmt, off: flat.length }); flat += v; }
                    return;
                }
                if (node.nodeType !== 1) return;
                const nf = Object.assign({}, fmt);
                switch (node.tagName) {
                    case 'STRONG': case 'B': nf.bold = true; break;
                    case 'EM': case 'I': case 'CITE': case 'DFN': case 'VAR': nf.italic = true; break;
                    case 'U': case 'INS': nf.underline = true; break;
                    case 'S': case 'DEL': case 'STRIKE': nf.strike = true; break;
                    case 'CODE': case 'KBD': case 'SAMP': case 'TT': nf.code = true; break;
                    case 'MARK': nf.mark = true; break;
                    case 'SPAN':
                        // inline style (header/footer HTML): color, size, weight, style
                        if (node.getAttribute && node.getAttribute('style')) {
                            const st = BidiCore.hfStyleOf(node);
                            const hx = st.color && BidiCore.cssColorHex(st.color);
                            if (hx) nf.color = '#' + hx;
                            if (st.size > 0) nf.size = st.size;
                            if (st.bold) nf.bold = true;
                            if (st.italic) nf.italic = true;
                        }
                        break;
                    case 'SUB': nf.sub = true; break;
                    case 'SUP': nf.sup = true; break;
                    case 'BR': raw.push({ br: true }); return;
                    case 'IMG': return;
                    case 'INPUT':
                        if ((node.getAttribute('type') || '').toLowerCase() === 'checkbox') {
                            raw.push({ box: true, checked: node.hasAttribute('checked'), fmt: fmt });
                        }
                        return;
                    case 'A': {
                        const href = node.getAttribute('href') || '';
                        if (href && href.charAt(0) !== '#') { nf.link = href; nf.color = b.T.linkColor; nf.underline = true; }
                        break;
                    }
                }
                if (BLOCK_TAGS.test(node.tagName) && raw.length) raw.push({ br: true });
                for (let c = node.firstChild; c; c = c.nextSibling) walk(c, nf);
            })(container, baseFmt || {});

            // Embedding levels (UBA): paragraph P (0 LTR / 1 RTL); counter-
            // direction text P+1; inline code is an LTR isolate (level C, even)
            // whose own RTL parts sit one level higher. _drawLine reorders by
            // these levels (rule L2), so e.g. `f({ a: 'متن' })` inside a
            // Persian sentence stays in one piece.
            const P = baseDir === 'rtl' ? 1 : 0;
            const C = P % 2 ? P + 1 : P;
            const spans = dirSpans(flat, baseDir, this._config.endPunctuation);
            const out = [];
            raw.forEach(function (p) {
                if (p.br) { out.push(p); return; }
                if (p.box) { out.push(Object.assign({ lvl: P }, p)); return; }
                if (p.code) {
                    codeSpans(p.text).forEach(function (s) {
                        out.push({ text: p.text.slice(s[0], s[1]), fmt: p.fmt, rtl: s[2], lvl: s[2] ? C + 1 : C });
                    });
                    return;
                }
                const s0 = p.off, s1 = p.off + p.text.length;
                spans.forEach(function (s) {
                    const a = Math.max(s[0], s0), e = Math.min(s[1], s1);
                    if (e > a) out.push({ text: p.text.slice(a - s0, e - s0), fmt: p.fmt, rtl: s[2],
                                          lvl: s[2] === (P === 1) ? P : P + 1 });
                });
            });
            return out;
        }

        /**
         * Pieces → atoms: words ('w'), spaces ('s'), breaks ('br'), checkboxes.
         * @param {boolean} [pre] - keep all whitespace (code)
         */
        _atoms(pieces, pre) {
            const self = this, atoms = [];
            pieces.forEach(function (p) {
                if (p.br) { atoms.push({ t: 'br' }); return; }
                if (p.box) {
                    const f = self._fontFor(p.fmt || {}, false, 'x');
                    const bl = p.lvl || 0;
                    atoms.push({ t: 'w', box: true, checked: p.checked, fmt: p.fmt || {}, rtl: bl % 2 === 1, lvl: bl, f: f, w: f.size * 0.85, text: '' });
                    atoms.push({ t: 's', text: ' ', rtl: bl % 2 === 1, lvl: bl, fmt: {}, f: f, w: self._width(' ', f) });
                    return;
                }
                const text = pre ? p.text.replace(/\t/g, '    ') : p.text;
                const lvl = p.lvl !== undefined ? p.lvl : (p.rtl ? 1 : 0);
                text.split(/( +)/).forEach(function (part) {
                    if (!part) return;
                    const f = self._fontFor(p.fmt, p.rtl, part);
                    if (/^ +$/.test(part)) {
                        atoms.push({ t: 's', text: part, rtl: p.rtl, lvl: lvl, fmt: p.fmt, f: f, w: self._width(part, f) });
                    } else {
                        // consecutive 'w' atoms form one word for line breaking,
                        // so a fallback part never opens a break opportunity
                        self._wordParts(part, f, p.fmt).forEach(function (s) {
                            atoms.push({ t: 'w', text: s.text, rtl: p.rtl, lvl: lvl, fmt: p.fmt, f: s.f, w: self._width(s.text, s.f) });
                        });
                    }
                });
            });
            return atoms;
        }

        /**
         * Greedy line breaking on logical words (a word may span several
         * atoms, e.g. a bold part inside a word). Over-long words are cut.
         * @returns {Array<{ atoms, w, size, br }>}
         */
        _breakLines(atoms, width, pre) {
            const self = this, lines = [];
            let cur = [], curW = 0;

            function push(br) {
                // trailing spaces never count (except code, where leading ones matter)
                while (cur.length && cur[cur.length - 1].t === 's') cur.pop();
                lines.push({ atoms: cur, w: cur.reduce(function (s, a) { return s + a.w; }, 0), br: br });
                cur = []; curW = 0;
            }
            function cutWord(word) {
                // split an over-long word into pieces that fit
                const out = [];
                word.forEach(function (a) {
                    if (a.w <= width) { out.push(a); return; }
                    let chunk = '';
                    Array.from(a.text).forEach(function (ch) {
                        const w = self._width(chunk + ch, a.f);
                        if (w > width && chunk) { out.push(Object.assign({}, a, { text: chunk, w: self._width(chunk, a.f), cut: true })); chunk = ch; }
                        else chunk += ch;
                    });
                    if (chunk) out.push(Object.assign({}, a, { text: chunk, w: self._width(chunk, a.f) }));
                });
                return out;
            }

            let i = 0;
            while (i < atoms.length) {
                const a = atoms[i];
                if (a.t === 'br') { push(true); i++; continue; }
                if (a.t === 's') {
                    if (cur.length || pre) { cur.push(a); curW += a.w; }
                    i++; continue;
                }
                let j = i, word = [], ww = 0;
                while (j < atoms.length && atoms[j].t === 'w') { word.push(atoms[j]); ww += atoms[j].w; j++; }
                const trailing = cur.length && cur[cur.length - 1].t === 's' ? 0 : 0;
                if (curW + ww > width + 0.01 && cur.some(function (x) { return x.t === 'w'; })) {
                    push(false);
                    if (pre) { /* keep indentation of wrapped code minimal */ }
                }
                if (ww > width + 0.01) {
                    cutWord(word).forEach(function (x) {
                        if (curW + x.w > width + 0.01 && cur.length) push(false);
                        cur.push(x); curW += x.w;
                    });
                } else {
                    word.forEach(function (x) { cur.push(x); });
                    curW += ww + trailing;
                }
                i = j;
            }
            if (cur.length || !lines.length) push(true);
            return lines;
        }

        _lineHeight(line, tight, minSize) {
            const b = this._b;
            if (b.exactLine && !tight) return b.exactLine;
            let size = minSize || 0;
            line.atoms.forEach(function (a) { if (a.f && a.f.size > size) size = a.f.size; });
            if (!size) size = b.sizes.bidi;
            return size * b.lineScale * (tight ? b.lhTight : b.lh);
        }

        /**
         * Draw one line inside [x0, x1] with its top at `top`.
         * Visual order: runs of equal direction; an RTL line lists them right
         * to left; atoms of an RTL run are reversed and each drawn through
         * jsPDF's own reordering (digits, brackets, shaping).
         */
        _drawLine(line, x0, x1, top, h, dir, align, isLast, color) {
            const b = this._b, doc = b.doc;
            const atoms = line.atoms.slice();
            while (atoms.length && atoms[0].t === 's' && !line.pre) atoms.shift();
            if (!atoms.length) return;

            // visual order — UBA rule L2: from the highest level down to the
            // lowest odd level, reverse every run of atoms at that level or above
            const visual = atoms.slice();
            const base = dir === 'rtl' ? 1 : 0;
            visual.forEach(function (a) { if (a.lvl === undefined) a.lvl = a.rtl ? 1 : 0; if (a.lvl < base) a.lvl = base; });
            let maxL = 0, minOdd = 99;
            visual.forEach(function (a) {
                maxL = Math.max(maxL, a.lvl);
                if (a.lvl % 2 === 1) minOdd = Math.min(minOdd, a.lvl);
            });
            for (let L = maxL; L >= minOdd && L >= 1; L--) {
                for (let i = 0; i < visual.length;) {
                    if (visual[i].lvl < L) { i++; continue; }
                    let j = i;
                    while (j < visual.length && visual[j].lvl >= L) j++;
                    const seg = visual.slice(i, j).reverse();
                    for (let k = 0; k < seg.length; k++) visual[i + k] = seg[k];
                    i = j;
                }
            }

            const avail = x1 - x0;
            const w = atoms.reduce(function (s, a) { return s + a.w; }, 0);
            let mode = align;
            if (mode === 'justify' && (isLast || line.br)) mode = 'start';
            let x, extra = 0;
            if (mode === 'center') x = x0 + (avail - w) / 2;
            else if (mode === 'end') x = dir === 'rtl' ? x0 : x1 - w;
            else if (mode === 'justify') {
                const gaps = visual.filter(function (a) { return a.t === 's'; }).length;
                extra = gaps ? Math.max(0, avail - w) / gaps : 0;
                x = x0;
                if (!gaps) x = dir === 'rtl' ? x1 - w : x0;
            } else x = dir === 'rtl' ? x1 - w : x0;
            // physical alignment keywords
            if (align === 'left') x = x0;
            if (align === 'right') x = x1 - w;

            let maxSize = 0;
            visual.forEach(function (a) { if (a.f && a.f.size > maxSize) maxSize = a.f.size; });
            const baseline = top + h / 2 + maxSize * 0.24;

            // pass 1: backgrounds; pass 2: text & decorations
            let cx = x;
            const placed = visual.map(function (a) {
                const p = { a: a, x: cx };
                cx += a.w + (a.t === 's' ? extra : 0);
                return p;
            });
            placed.forEach(function (p) {
                if (p.a.fmt && p.a.fmt.mark && p.a.t === 'w') {
                    doc.setFillColor(255, 242, 0);
                    doc.rect(p.x, top + 1, p.a.w, h - 2, 'F');
                }
            });
            const self = this;
            placed.forEach(function (p) {
                const a = p.a;
                if (a.t !== 'w') return;
                if (a.box) { self._drawCheckbox(p.x, baseline, a.f.size, a.checked); return; }
                const fmt = a.fmt || {};
                self._setFont(a.f);
                const c = rgb(fmt.color || color || '#000000');
                doc.setTextColor(c[0], c[1], c[2]);
                let by = baseline;
                if (fmt.sup) by -= a.f.size * 0.45;
                if (fmt.sub) by += a.f.size * 0.2;
                const pm = self._placeMarks(a, p.x, by);
                if (a.lvl % 2 === 1) doc.text(mirror(pm.text), p.x, by, RTL_TEXT);
                else doc.text(pm.text, p.x, by);
                pm.marks.forEach(function (m) { doc.text(m.ch, m.x, m.y); });
                if (fmt.underline || fmt.strike) {
                    doc.setDrawColor(c[0], c[1], c[2]);
                    doc.setLineWidth(Math.max(0.4, a.f.size / 20));
                    if (fmt.underline) doc.line(p.x, by + a.f.size * 0.15, p.x + a.w, by + a.f.size * 0.15);
                    if (fmt.strike) doc.line(p.x, by - a.f.size * 0.28, p.x + a.w, by - a.f.size * 0.28);
                }
                if (fmt.link) doc.link(p.x, top, a.w, h, { url: fmt.link });
            });
            doc.setTextColor(0, 0, 0);
        }

        _drawCheckbox(x, baseline, size, checked) {
            const doc = this._b.doc, s = size * 0.65, y = baseline - s;
            doc.setDrawColor(60, 60, 60);
            doc.setLineWidth(0.6);
            doc.rect(x + size * 0.1, y, s, s, 'S');
            if (checked) {
                doc.setLineWidth(1);
                doc.line(x + size * 0.1 + s * 0.2, y + s * 0.55, x + size * 0.1 + s * 0.42, y + s * 0.8);
                doc.line(x + size * 0.1 + s * 0.42, y + s * 0.8, x + size * 0.1 + s * 0.85, y + s * 0.2);
            }
        }

        // =====================================================================
        // Pagination & decorations
        // =====================================================================

        _newPage() {
            const b = this._b;
            this._closeDecos(b.y);
            b.doc.addPage();
            b.y = b.top;
            b.decos.forEach(function (d) { d.startY = b.top; });
        }

        /** Make room for `h`; returns true when a new page was started. */
        _ensure(h) {
            const b = this._b;
            if (b.y + h <= b.bottom + 0.01) return false;
            if (b.y <= b.top + 0.01) return false;       // already at top: let it overflow
            this._newPage();
            return true;
        }

        /** Draw the open vertical borders (quotes) from their start to y. */
        _closeDecos(y) {
            const doc = this._b.doc;
            this._b.decos.forEach(function (d) {
                if (y - d.startY < 0.5) return;
                doc.setDrawColor(d.color[0], d.color[1], d.color[2]);
                doc.setLineWidth(d.width);
                doc.line(d.x, d.startY, d.x, y);
            });
        }

        _space(pt) {
            const b = this._b;
            if (b.y > b.top + 0.01) b.y = Math.min(b.y + pt, b.bottom);
        }

        // =====================================================================
        // Paragraphs
        // =====================================================================

        /**
         * Lay out and draw one paragraph from an inline container.
         * @param {object} o - { fmt, color, tight, align, before, after, keepWith (pt),
         *                       marker(firstLineTop, h, dir), minSize }
         */
        _para(container, frame, o) {
            const b = this._b;
            o = o || {};
            const info = this._dirOf(container);
            const dir = o.dir || info.dir;
            trimEdges(container);

            // images on their own
            const imgs = container.querySelectorAll('img');
            if (imgs.length && !/\S/.test(container.textContent)) {
                imgs.forEach(function (img) { this._image(img, frame); }, this);
                return;
            }

            const pieces = this._pieces(container, dir, o.fmt);
            const atoms = this._atoms(pieces);
            const x0 = frame.left, x1 = frame.right;
            const lines = this._breakLines(atoms, x1 - x0);
            const hs = lines.map(function (l) { return this._lineHeight(l, o.tight, o.minSize); }, this);

            let align = o.align;
            // one body alignment for every language; a long URL/path keeps its paragraph at start
            if (!align) align = BidiCore.noJustify(container.textContent) ? 'start' : this._bodyAlign();

            this._space(o.before !== undefined ? o.before : (o.tight ? 0 : b.spacing.before));
            // keep a heading with what follows / avoid a lone first line (orphan)
            const need = o.keepWith !== undefined
                ? hs.reduce(function (s, h) { return s + h; }, 0) + (o.after !== undefined ? o.after : 0) + o.keepWith
                : (lines.length > 1 ? hs[0] + hs[1] : hs[0]);
            this._ensure(Math.min(need, b.bottom - b.top));

            lines.forEach(function (line, i) {
                this._ensure(hs[i]);
                if (i === 0 && this._tocCollect && container.id) this._tocCollect[container.id] = b.doc.getNumberOfPages();
                if (i === 0 && o.marker) o.marker(b.y, hs[0], dir);
                this._drawLine(line, x0, x1, b.y, hs[i], dir, align, i === lines.length - 1, o.color);
                b.y += hs[i];
            }, this);
            b.y += (o.after !== undefined ? o.after : (o.tight ? 0 : b.spacing.after));
            if (o.outline && b.cfg.pdf.outline && b.doc.outline) {
                try { b.doc.outline.add(null, container.textContent.trim(), { pageNumber: b.doc.getNumberOfPages() }); } catch (e) { /* optional */ }
            }
        }

        /**
         * Table of contents (BidiCore.insertToc): the title, then one line per
         * heading — its text at the start side (indented by level), a dotted
         * leader, the page number at the end side, the line a link to the page.
         * Pass 1 (page numbers unknown) draws "00" of the same width.
         */
        _toc(box, frame, ctx) {
            const b = this._b, T = b.T, doc = b.doc, self = this;
            const title = box.querySelector('.kelk-toc-title');
            if (title) {
                // the Word "TOC Heading" look (template tocHeadingColor / tocHeadingFontSize)
                this._para(title, frame, this._paraOpts(ctx, {
                    fmt: { bold: true, size: toPt(T.tocHeadingFontSize || '14pt') }, color: T.tocHeadingColor || '#2F5496', align: 'start',
                    before: 0, after: toPt(T.headingMarginBottom)
                }));
            }
            const step = toPt(T.listIndentStep || '18pt');
            box.querySelectorAll('.kelk-toc-entry').forEach(function (e) {
                const level = parseInt(e.getAttribute('data-level'), 10) || 1;
                const dir = self._dirOf(e).dir;
                const page = self._tocPages ? self._tocPages[e.getAttribute('data-target')] : null;
                const num = page ? String(page) : '00';
                const numAtoms = self._atoms(self._pieces(self._textSpan(num), dir, {})).filter(function (a) { return a.t !== 'br'; });
                const numW = numAtoms.reduce(function (s, a) { return s + a.w; }, 0) + 2;
                const indent = (level - 1) * step, gap = 6;
                const textAvail = frame.right - frame.left - indent - numW - gap * 2;
                const atoms = self._atoms(self._pieces(e, dir, {})).filter(function (a) { return a.t !== 'br'; });
                const tw = Math.min(textAvail, atoms.reduce(function (s, a) { return s + a.w; }, 0));
                const lineH = self._lineHeight({ atoms: atoms, br: true }, true) + 2;
                self._ensure(lineH);
                const top = b.y, mid = top + lineH / 2;
                const rtl = dir === 'rtl';
                const tx1 = rtl ? frame.right - indent : frame.left + indent + tw;
                const tx0 = rtl ? frame.right - indent - tw : frame.left + indent;
                const nx0 = rtl ? frame.left : frame.right - numW, nx1 = rtl ? frame.left + numW : frame.right;
                self._drawString(e, { x0: tx0, x1: tx1, y: mid, h: lineH, dir: dir, align: 'start' });
                self._drawString(num, { x0: nx0, x1: nx1, y: mid, h: lineH, dir: dir, align: rtl ? 'left' : 'right' });
                // dotted leader between the text and the number
                const d0 = rtl ? nx1 + gap : tx1 + gap, d1 = rtl ? tx0 - gap : nx0 - gap;
                if (d1 - d0 > 4) {
                    const baseY = top + lineH * 0.68;
                    doc.setFillColor(90, 90, 90);
                    for (let x = d1 - 1.5; x > d0; x -= 3.2) doc.circle(x, baseY, 0.45, 'F');
                }
                if (page && doc.link) { try { doc.link(frame.left, top, frame.right - frame.left, lineH, { pageNumber: page }); } catch (err) { /* optional */ } }
                b.y += lineH;
            });
            this._space(b.spacing.after);
        }

        _bodyAlign() {
            const a = String(this._b.T.textAlign || 'justify').toLowerCase();
            return a === 'justify' ? 'justify' : a === 'center' ? 'center' : a === 'right' ? 'right' : a === 'left' ? 'left' : 'start';
        }

        // =====================================================================
        // Blocks
        // =====================================================================

        _renderBlocks(parent, frame, ctx) {
            const self = this;
            let group = null;
            function flush() {
                if (!group) return;
                const g = group; group = null;
                if (hasContent(g)) self._para(g, frame, self._paraOpts(ctx));
            }
            Array.from(parent.childNodes).forEach(function (child) {
                if (isInlineNode(child)) {
                    if (!group) {
                        if (child.nodeType === 3 && !/\S/.test(child.nodeValue)) return;
                        group = wrapInline(child);
                    }
                    group.appendChild(child);
                    return;
                }
                flush();
                if (child.nodeType === 1) {
                    if (pageBreakBefore(child)) self._newPageIfUsed();
                    self._renderBlock(child, frame, ctx);
                    if (pageBreakAfter(child)) self._newPageIfUsed();
                }
            });
            flush();
        }

        _newPageIfUsed() {
            if (this._b.y > this._b.top + 0.01) this._newPage();
        }

        /** Paragraph options inside the current context (quote colors, tight lists). */
        _paraOpts(ctx, extra) {
            const o = Object.assign({}, extra || {});
            if (ctx.quote) {
                o.fmt = Object.assign({ italic: true }, o.fmt || {});
                o.color = this._b.T.quoteTextColor;
            }
            if (ctx.tight) o.tight = true;
            return o;
        }

        /** Next sibling node that renders something (skips whitespace). */
        _nextBlock(el) {
            let n = el.nextSibling;
            while (n && ((n.nodeType === 3 && !/\S/.test(n.nodeValue)) || (n.nodeType !== 1 && n.nodeType !== 3))) n = n.nextSibling;
            return n;
        }

        /** Height of an inline container laid out in `frame` (first `maxLines` lines). */
        _linesHeight(container, frame, fmt, tight, maxLines) {
            const dir = this._dirOf(container.nodeType === 1 ? container : container.parentElement).dir;
            const el = container.nodeType === 1 ? container : this._textSpan(container.nodeValue);
            const lines = this._breakLines(this._atoms(this._pieces(el, dir, fmt || {})), frame.right - frame.left);
            let h = 0;
            lines.slice(0, maxLines || lines.length).forEach(function (l) { h += this._lineHeight(l, tight); }, this);
            return h;
        }

        /**
         * Height of the first unit of a block — what must share the page
         * with a heading before it: two lines of a paragraph, a list item's
         * first line, a table's header + first row, a code block's bar + two
         * lines, two lines of a quote, an image, or (for a heading) the
         * heading plus the first unit after it.
         */
        _firstUnitHeight(node, frame, ctx, depth) {
            const b = this._b, T = b.T;
            if (!node || depth > 3) return 0;
            const line = b.sizes.bidi * b.lineScale;
            if (node.nodeType === 3 || !BLOCK_TAGS.test(node.tagName)) {
                return b.spacing.before + this._linesHeight(node, frame, {}, false, 2);
            }
            const tag = node.tagName;
            if (/^H[1-6]$/.test(tag)) {
                const lvl = +tag.charAt(1), hd = T.headings[lvl - 1] || {};
                return (T.headingMarginTopBase - lvl * 2) +
                    this._linesHeight(node, frame, { bold: true, size: toPt(hd.size || T.fontSize) }, false) +
                    toPt(T.headingMarginBottom) + this._firstUnitHeight(this._nextBlock(node), frame, ctx, depth + 1);
            }
            switch (tag) {
                case 'P': return b.spacing.before + this._linesHeight(node, frame, {}, !!ctx.tight, 2);
                case 'UL': case 'OL': return line * b.lhTight;
                case 'BLOCKQUOTE': return b.spacing.before + line * b.lh * 2;
                case 'PRE': return 6 + toPt(T.codeHeaderFontSize || '8pt') * b.lineScale + 2 + 8 + b.sizes.code * b.lineScale * b.lhTight * 2;
                case 'TABLE': { const L = this._tableLayout(node, frame); return L ? 6 + L.keep : 0; }
                case 'HR': return 12;
                default: {
                    const first = node.firstElementChild || node.firstChild;
                    return first ? this._firstUnitHeight(first, frame, ctx, depth + 1) : 0;
                }
            }
        }

        _renderBlock(el, frame, ctx) {
            const b = this._b, T = b.T, tag = el.tagName;
            if (/^H[1-6]$/.test(tag)) {
                const lvl = +tag.charAt(1), h = T.headings[lvl - 1] || {};
                const size = toPt(h.size || T.fontSize);
                const opts = this._paraOpts(ctx, {
                    fmt: { bold: true, italic: !!h.italic || !!ctx.quote, size: size },
                    color: ctx.quote ? T.quoteTextColor : h.color,
                    before: T.headingMarginTopBase - lvl * 2,
                    after: toPt(T.headingMarginBottom),
                    outline: !ctx.quote && !ctx.cell
                });
                // widow/orphan: the heading never ends a page alone — it keeps
                // with the first unit of whatever follows (text, list, table, code …)
                opts.keepWith = this._firstUnitHeight(this._nextBlock(el), frame, ctx, 0);
                this._para(el, frame, opts);
                return;
            }
            if (tag === 'DIV' && el.classList.contains('kelk-toc')) { this._toc(el, frame, ctx); return; }
            if (tag === 'P' && el.classList.contains('kelk-spacer')) { this._space(b.sizes.bidi * b.lineScale * b.lh); return; }
            switch (tag) {
                case 'P': this._para(el, frame, this._paraOpts(ctx)); return;
                case 'UL': case 'OL': this._list(el, frame, ctx, 0, null); return;
                case 'BLOCKQUOTE': this._quote(el, frame, ctx); return;
                case 'PRE': this._code(el, frame, ctx); return;
                case 'TABLE': this._table(el, frame, ctx); return;
                case 'HR': this._hr(frame); return;
                default: this._renderBlocks(el, frame, ctx);
            }
        }

        _hr(frame) {
            const b = this._b, br = parseBorder(b.cfg.horizontalRule);
            this._space(6);
            this._ensure(br.width + 6);
            b.doc.setDrawColor(br.color[0], br.color[1], br.color[2]);
            b.doc.setLineWidth(br.width);
            b.doc.line(frame.left, b.y, frame.right, b.y);
            b.y += 6 + br.width;
        }

        /**
         * An image on its own line (a paragraph holding only images). Source:
         * the resolved image (ImageCore — any URL, path, registered name, SVG
         * rasterized), else a data URI as given; neither → its alt text.
         * Size: width/height attributes or its own size (px → pt at 96 dpi),
         * capped at the frame width and the page height. Inside <a href>:
         * the image is a link.
         */
        _image(img, frame) {
            const b = this._b, doc = b.doc;
            const src = img.getAttribute('src') || '';
            let data = null, fmt = null, rec = this._images ? this._images.get(src) : null;
            if (rec) { data = rec.bytes; fmt = rec.ext === 'jpg' ? 'JPEG' : 'PNG'; }
            else {
                const m = /^data:image\/(png|jpe?g);base64,/i.exec(src);
                if (m) {
                    try { const pr = doc.getImageProperties(src); rec = { width: pr.width, height: pr.height }; } catch (e) { rec = null; }
                    if (rec) { data = src; fmt = m[1].toUpperCase().replace('JPG', 'JPEG'); }
                }
            }
            if (!data) {                                      // not embeddable: the alt text instead
                const alt = img.getAttribute('alt');
                if (alt) this._para(this._textSpan(alt), frame, { fmt: { italic: true } });
                return;
            }
            const sz = ImageCore.displaySize(img, rec);
            let w = sz.width * 0.75, h = sz.height * 0.75;
            const fitted = ImageCore.fit(w, h, frame.right - frame.left, b.bottom - b.top);
            w = fitted.width; h = fitted.height;
            this._space(b.spacing.before);
            this._ensure(h);
            const dir = this._dirOf(img).dir;
            const x = dir === 'rtl' ? frame.right - w : frame.left;
            try { doc.addImage(data, fmt, x, b.y, w, h); } catch (e) { return; }
            const a = img.closest('a[href]');
            const href = a ? a.getAttribute('href') : '';
            if (href && href.charAt(0) !== '#' && doc.link) doc.link(x, b.y, w, h, { url: href });
            b.y += h + b.spacing.after;
        }

        /** Header logo record (resolved image) or null → text logo. */
        _headerLogo() {
            const h = this._config.header;
            if (!h || h.mode !== 'structured' || typeof ImageCore === 'undefined') return null;
            return ImageCore.looksLikeImage(h.logo, this._images) && this._images ? this._images.get(h.logo) : null;
        }

        // =====================================================================
        // Images
        // =====================================================================

        // ── Lists ──────────────────────────────────────────────────────────

        _marker(listEl, index, level) {
            const isOl = listEl.tagName === 'OL';
            if (!isOl) return { bullet: level % 3 };
            const type = listEl.getAttribute('type');
            // decimal at every level (as .doc/.docx); an explicit type="a|A|i|I" is kept
            const fmt = type || '1';
            const text = fmt === 'a' ? toLetters(index) : fmt === 'A' ? toLetters(index).toUpperCase()
                : fmt === 'i' ? toRoman(index) : fmt === 'I' ? toRoman(index).toUpperCase() : String(index);
            return { text: text + '.' };
        }

        /**
         * Lists: marker in the hanging area at the item's start side, text at
         * base + level × increment; nested lists and block children of an item
         * align with the item's text.
         */
        _list(listEl, frame, ctx, level) {
            const b = this._b, self = this;
            // the template's list metrics (shared with DOCX and HTML), or config.list.indent
            const ind = (b.cfg.list && b.cfg.list.indent) || {
                base: toPt(b.T.listIndent || '24pt'), increment: toPt(b.T.listIndentStep || '18pt'), hanging: toPt(b.T.listHanging || '14pt')
            };
            const isOl = listEl.tagName === 'OL';
            let index = isOl ? (parseInt(listEl.getAttribute('start'), 10) || 1) : 1;
            const listCtx = Object.assign({}, ctx, { tight: true });

            Array.from(listEl.children).forEach(function (li) {
                if (li.tagName !== 'LI') return;
                const dir = self._dirOf(li).dir;
                const offset = ind.base + level * ind.increment;
                const textFrame = dir === 'rtl'
                    ? { left: frame.left, right: frame.right - offset }
                    : { left: frame.left + offset, right: frame.right };
                const mk = self._marker(listEl, index++, level);
                let marked = false;
                const markerFn = function (top, h, pdir) {
                    marked = true;
                    self._drawMarker(mk, dir, textFrame, top, h, ind.hanging, ctx);
                };

                let group = null;
                const flush = function () {
                    if (!group) return;
                    const g = group; group = null;
                    if (!hasContent(g)) return;
                    self._para(g, textFrame, self._paraOpts(listCtx, { marker: marked ? null : markerFn, dir: dir }));
                };
                Array.from(li.childNodes).forEach(function (ch) {
                    if (isInlineNode(ch)) {
                        if (!group) {
                            if (ch.nodeType === 3 && !/\S/.test(ch.nodeValue)) return;
                            group = wrapInline(ch);
                        }
                        group.appendChild(ch);
                        return;
                    }
                    flush();
                    if (ch.nodeType !== 1) return;
                    if (/^(P|H[1-6])$/.test(ch.tagName)) {
                        // the numbered paragraph follows the item; later ones indent on their own start side
                        const pdir = self._dirOf(ch).dir;
                        const f = (marked && pdir !== dir)
                            ? (pdir === 'rtl' ? { left: frame.left, right: frame.right - offset } : { left: frame.left + offset, right: frame.right })
                            : textFrame;
                        self._para(ch, f, self._paraOpts(listCtx, { marker: marked ? null : markerFn }));
                        return;
                    }
                    if (!marked) { self._ensure(b.sizes.bidi * 1.6); markerFn(b.y, b.sizes.bidi * b.lineScale, dir); b.y += b.sizes.bidi * b.lineScale; }
                    if (ch.tagName === 'UL' || ch.tagName === 'OL') self._list(ch, frame, ctx, level + 1);
                    else self._renderBlock(ch, textFrame, Object.assign({}, ctx, { inList: true }));
                });
                flush();
                if (!marked) { self._ensure(b.sizes.bidi * 1.6); markerFn(b.y, b.sizes.bidi * b.lineScale, dir); b.y += b.sizes.bidi * b.lineScale * b.lhTight; }
                b.y += toPt(b.T.listItemSpaceAfter || '1.5pt');       // a little air between items (all outputs)
            });
            if (level === 0 && !ctx.tight) b.y += b.spacing.after;
        }

        _drawMarker(mk, dir, textFrame, top, h, hanging, ctx) {
            const b = this._b, doc = b.doc;
            const size = b.sizes[dir === 'rtl' ? 'bidi' : 'latin'];
            const color = rgb(ctx.quote ? b.T.quoteTextColor : '#000000');
            // hanging area: [text start − hanging, text start] on the start side
            const x0 = dir === 'rtl' ? textFrame.right : textFrame.left - hanging;
            const x1 = dir === 'rtl' ? textFrame.right + hanging : textFrame.left;
            const cy = top + h / 2;
            if (mk.bullet !== undefined) {
                const r = size * 0.16, cx = dir === 'rtl' ? x1 - hanging / 2 : x0 + hanging / 2;
                doc.setDrawColor(color[0], color[1], color[2]);
                doc.setFillColor(color[0], color[1], color[2]);
                doc.setLineWidth(0.6);
                if (mk.bullet === 0) doc.circle(cx, cy, r, 'F');
                else if (mk.bullet === 1) doc.circle(cx, cy, r, 'S');
                else doc.rect(cx - r, cy - r, r * 2, r * 2, 'F');
                return;
            }
            const line = { atoms: this._atoms(this._pieces(this._textSpan(mk.text), dir, {})), br: true };
            this._drawLine(line, x0, x1, top, h, dir, 'start', true, ctx.quote ? b.T.quoteTextColor : null);
        }

        // ── Mark attachment (GPOS anchors) ─────────────────────────────────

        /**
         * Anchor data of the font `f` ({ name, style }), parsed once:
         * { upem, slant, mark: Map(cp → [[key, x, y]]), base: Map(cp → {key: [x, y]}),
         *   mark2: Map(cp → {key: [x, y]}) } — or null. A generated oblique
         * refers to its upright style's anchors, slanted like its outlines.
         */
        _markData(f) {
            const fam = this._fonts[String(f.name).toLowerCase()];
            if (!fam || !fam.marks || !fam.marks.styles) return null;
            fam.marksParsed = fam.marksParsed || {};
            if (fam.marksParsed[f.style] !== undefined) return fam.marksParsed[f.style];
            let v = fam.marks.styles[f.style], slant = 0;
            if (typeof v === 'string') { v = fam.marks.styles[v]; slant = fam.marks.slant || 0; }
            let out = null;
            if (v && typeof v === 'object') {
                const toMap = function (o) {
                    const m = new Map();
                    Object.keys(o || {}).forEach(function (k) { m.set(parseInt(k, 16), o[k]); });
                    return m;
                };
                out = { upem: v.upem || 1000, slant: slant, mark: toMap(v.mark), base: toMap(v.base), mark2: toMap(v.mark2) };
            }
            fam.marksParsed[f.style] = out;
            return out;
        }

        /**
         * Place combining marks by the font's GPOS anchors (jsPDF ignores
         * GPOS: a kasra would otherwise sit wherever the mark glyph's own
         * offsets put it — in Sahel, inside the bowl of «ن»). A mark with an
         * anchor on its base (or on the mark before it: shadda + fatha) is
         * taken out of the atom's text and drawn on its own; the rest stay
         * inline. Base positions follow the drawing order: an RTL atom is
         * drawn reversed by jsPDF, so its first logical base is rightmost.
         * @returns {{ text: string, marks: Array<{ ch, x, y }> }}
         */
        _placeMarks(a, x, y) {
            const md = a.f && this._markData(a.f);
            if (!md || !a.text || !MARK.test(a.text)) return { text: a.text, marks: [] };
            const chars = Array.from(a.text);
            const kept = [], placed = [];
            const k = md.slant;
            const tx = function (p) { return p[0] + k * p[1]; };      // slant an anchor like the outlines
            let lastBase = -1, lastMark = null;                        // lastBase: index in kept
            chars.forEach(function (ch) {
                const cp = ch.codePointAt(0);
                const recs = md.mark.get(cp);
                if (recs) {
                    // mark → mark (stacked on the previous placed mark), else mark → base
                    let done = false;
                    if (lastMark) {
                        const m2 = md.mark2.get(lastMark.cp);
                        for (let i = 0; m2 && i < recs.length; i++) {
                            const an = m2[recs[i][0]];
                            if (an) {
                                placed.push({ ch: ch, cp: cp, ref: lastMark, dx: tx(an) - tx([recs[i][1], recs[i][2]]), dy: an[1] - recs[i][2] });
                                lastMark = placed[placed.length - 1]; done = true; break;
                            }
                        }
                    }
                    if (!done && lastBase >= 0) {
                        const bs = md.base.get(kept[lastBase].cp);
                        for (let i = 0; bs && i < recs.length; i++) {
                            const an = bs[recs[i][0]];
                            if (an) {
                                placed.push({ ch: ch, cp: cp, base: lastBase, dx: tx(an) - tx([recs[i][1], recs[i][2]]), dy: an[1] - recs[i][2] });
                                lastMark = placed[placed.length - 1]; done = true; break;
                            }
                        }
                    }
                    if (done) return;
                    kept.push({ ch: ch, cp: cp });                     // no anchor: stays inline
                    lastMark = null;
                    return;
                }
                kept.push({ ch: ch, cp: cp });
                lastBase = kept.length - 1; lastMark = null;
            });
            if (!placed.length) return { text: a.text, marks: [] };
            // origins of the kept characters in drawing order
            const self = this, rtl = a.lvl % 2 === 1;
            const w = kept.map(function (c) { return self._width(rtl ? mirror(c.ch) : c.ch, a.f); });
            const origin = new Array(kept.length);
            let acc = 0;
            if (rtl) for (let i = kept.length - 1; i >= 0; i--) { origin[i] = x + acc; acc += w[i]; }
            else for (let i = 0; i < kept.length; i++) { origin[i] = x + acc; acc += w[i]; }
            const s = a.f.size / md.upem;
            placed.forEach(function (m) {
                const ox = m.ref ? m.ref.x : origin[m.base], oy = m.ref ? m.ref.y : y;
                m.x = ox + m.dx * s;
                m.y = oy - m.dy * s;
            });
            return { text: kept.map(function (c) { return c.ch; }).join(''), marks: placed };
        }

        _textSpan(text) {
            const s = document.createElement('span');
            s.textContent = text;
            return s;
        }

        // ── Quotes ─────────────────────────────────────────────────────────

        /**
         * One continuous border on the quote's start side (across pages too),
         * whatever the quote contains; paragraphs of either direction inside.
         */
        _quote(bq, frame, ctx) {
            const b = this._b, T = b.T;
            const dir = this._dirOf(bq).dir;
            const depth = (ctx.quoteDepth || 0) + 1;
            const indent = depth === 1 ? toPt(T.quoteIndent) : 0;
            const pad = toPt(T.quotePadding);
            const bw = toPt(T.quoteBorderWidth);
            const inner = dir === 'rtl'
                ? { left: frame.left, right: frame.right - indent - bw - pad }
                : { left: frame.left + indent + bw + pad, right: frame.right };
            const x = dir === 'rtl' ? frame.right - indent - bw / 2 : frame.left + indent + bw / 2;

            this._space(b.spacing.before);
            this._ensure(b.sizes.bidi * b.lineScale * 2);    // at least two lines of the quote
            const deco = { x: x, width: bw, color: rgb(T.quoteBorderColor), startY: b.y };
            b.decos.push(deco);
            b.y += 2;
            this._renderBlocks(bq, inner, Object.assign({}, ctx, { quote: true, quoteDepth: depth, tight: false }));
            // last paragraph's space-after stays inside the border only partly
            b.y = Math.max(deco.startY, b.y - b.spacing.after + 2);
            b.decos.splice(b.decos.indexOf(deco), 1);
            this._closeDecoOne(deco, b.y);
            b.y += b.spacing.after;
        }

        _closeDecoOne(d, y) {
            const doc = this._b.doc;
            if (y - d.startY < 0.5) return;
            doc.setDrawColor(d.color[0], d.color[1], d.color[2]);
            doc.setLineWidth(d.width);
            doc.line(d.x, d.startY, d.x, y);
        }

        // ── Code blocks ────────────────────────────────────────────────────

        /** Box width: 98% centered in the body, full frame elsewhere. */
        _boxFrame(frame) {
            if (!frame.body) return { left: frame.left, right: frame.right };
            const inset = (frame.right - frame.left) * 0.01;
            return { left: frame.left + inset, right: frame.right - inset };
        }

        _code(pre, frame, ctx) {
            const b = this._b, T = b.T, doc = b.doc, self = this;
            const box = this._boxFrame(frame);
            const padX = 4.5, padY = 4;
            const border = parseBorder(T.codeBlockBorder);
            const bg = rgb(T.codeBlockBg);

            // hljs-colored pieces, split into lines
            const codeEl = pre.querySelector('code') || pre;
            const lines = [[]];
            (function walk(n, st) {
                if (n.nodeType === 3) {
                    n.nodeValue.split('\n').forEach(function (part, i) {
                        if (i > 0) lines.push([]);
                        if (part) lines[lines.length - 1].push({ text: part, st: st });
                    });
                    return;
                }
                if (n.nodeType !== 1) return;
                if (n.tagName === 'BR') { lines.push([]); return; }
                let ns = st;
                String(n.getAttribute('class') || '').split(/\s+/).forEach(function (c) {
                    if (b.hljs[c]) ns = Object.assign({}, ns, b.hljs[c]);
                });
                for (let c = n.firstChild; c; c = c.nextSibling) walk(c, ns);
            })(codeEl, {});
            while (lines.length > 1 && !lines[lines.length - 1].length) lines.pop();

            // fenced blocks written inside the code: a frame each (text stays raw)
            const inset = 6;                                   // per nesting level
            const depth = new Array(lines.length).fill(0), frames = [];
            if ((b.cfg.codeBlock || {}).nestedFrames !== false) {
                (function walkSeg(items, d) {
                    items.forEach(function (sg) {
                        if (!sg.nested) return;
                        frames.push({ from: sg.from, to: sg.to, depth: d + 1 });
                        for (let k = sg.from; k <= sg.to; k++) depth[k] = Math.max(depth[k], d + 1);
                        walkSeg(sg.items, d + 1);
                    });
                })(BidiCore.codeSegments(lines.map(function (sg) {
                    return sg.map(function (x) { return x.text; }).join('');
                }).join('\n')), 0);
            }

            // lay out: each source line may wrap
            const width = box.right - box.left - 2 * padX;
            const laid = [];
            lines.forEach(function (segs, src) {
                // direction over the WHOLE line (hljs splits it into segments):
                // base LTR, RTL runs by the UBA rule for code
                const spans = codeSpans(segs.map(function (s) { return s.text; }).join(''));
                const pieces = [];
                let off = 0;
                segs.forEach(function (s) {
                    const fmt = { code: true, color: s.st.color, bold: s.st.bold, italic: s.st.italic };
                    const s0 = off, s1 = off + s.text.length;
                    spans.forEach(function (sp) {
                        const a = Math.max(sp[0], s0), e = Math.min(sp[1], s1);
                        if (e > a) pieces.push({ text: s.text.slice(a - s0, e - s0), fmt: fmt, rtl: sp[2], lvl: sp[2] ? 1 : 0 });
                    });
                    off = s1;
                });
                const atoms = self._atoms(pieces, true);
                const wd = width - 2 * depth[src] * inset;
                const ls = atoms.length ? self._breakLines(atoms, wd, true) : [{ atoms: [], w: 0, br: true }];
                ls.forEach(function (l) { l.pre = true; l.src = src; l.depth = depth[src]; laid.push(l); });
            });
            const lineH = b.sizes.code * b.lineScale * b.lhTight;

            const opt = b.cfg.codeBlock || {};
            const lang = BidiCore.codeLanguage(pre);
            const label = opt.showLanguage === false ? '' : (lang || opt.fallbackLabel || '');
            const labelSize = toPt(T.codeHeaderFontSize || '8pt');
            const labelH = label ? labelSize * b.lineScale + 2 : 0;

            // room around nested frames: a gap above a frame's first line and
            // below its last (per frame), so the frame clears the glyphs
            const FG = 2.5;
            laid.forEach(function (l, k) {
                const firstOfSrc = k === 0 || laid[k - 1].src !== l.src;
                const lastOfSrc = k === laid.length - 1 || laid[k + 1].src !== l.src;
                l.padTop = 0; l.padBot = 0;
                frames.forEach(function (fr) {
                    if (firstOfSrc && fr.from === l.src) l.padTop += FG;
                    if (lastOfSrc && fr.to === l.src) l.padBot += FG;
                });
                l.h = lineH + l.padTop + l.padBot;
            });

            this._space(6);
            // keep the language bar with at least two code lines
            this._ensure(Math.min(labelH + padY * 2 + laid.slice(0, 2).reduce(function (s2, l) { return s2 + l.h; }, 0), b.bottom - b.top));
            let i = 0, first = true;
            while (i < laid.length) {
                const head = first ? labelH : 0;
                this._ensure(head + padY * 2 + laid[i].h);
                const room = b.bottom - b.y - head - padY * 2;
                let n = 0, used = 0;
                while (i + n < laid.length && (n === 0 || used + laid[i + n].h <= room + 0.01)) { used += laid[i + n].h; n++; }
                const hBox = head + padY * 2 + used;
                // background + border
                doc.setFillColor(bg[0], bg[1], bg[2]);
                doc.rect(box.left, b.y, box.right - box.left, hBox, 'F');
                if (head) {
                    const hb = rgb(T.codeHeaderBg || '#EDEDED');
                    doc.setFillColor(hb[0], hb[1], hb[2]);
                    doc.rect(box.left, b.y, box.right - box.left, head, 'F');
                }
                doc.setDrawColor(border.color[0], border.color[1], border.color[2]);
                doc.setLineWidth(border.width);
                doc.rect(box.left, b.y, box.right - box.left, hBox, 'S');
                if (head) {
                    doc.line(box.left, b.y + head, box.right, b.y + head);
                    const lf = { name: 'courier', style: 'normal', size: labelSize };
                    const fam = b.fams.code || (isLatin1(label) ? null : b.fams.bidi);
                    if (fam) { lf.name = fam.family; lf.style = this._styleName(fam, {}); }
                    this._setFont(lf);
                    const hc = rgb(T.codeHeaderColor || '#595959');
                    doc.setTextColor(hc[0], hc[1], hc[2]);
                    doc.text(label, box.left + padX, b.y + head / 2 + labelSize * 0.35);
                    doc.setTextColor(0, 0, 0);
                }
                let y = b.y + head + padY;
                const i0 = i;
                for (let k = 0; k < n; k++, i++) {
                    const l = laid[i];
                    const dx = l.depth * inset;
                    y += l.padTop;
                    l.top = y;
                    this._drawLine(l, box.left + padX + dx, box.right - padX - dx, y, lineH, 'ltr', 'left', true, null);
                    y += lineH + l.padBot;
                }
                // nested-fence frames on this page's part of the block
                frames.forEach(function (fr) {
                    let top = -1, bot = -1;
                    for (let k = i0; k < i; k++) {
                        if (laid[k].src < fr.from || laid[k].src > fr.to) continue;
                        if (top < 0) top = laid[k].top - (laid[k].src === fr.from ? FG * 0.7 : 0);
                        bot = laid[k].top + lineH + (laid[k].src === fr.to ? FG * 0.7 : 0);
                    }
                    if (top < 0) return;
                    const off = fr.depth * inset - inset * 0.55;
                    doc.setDrawColor(border.color[0], border.color[1], border.color[2]);
                    doc.setLineWidth(Math.max(0.4, border.width * 0.75));
                    doc.rect(box.left + padX + off, top, box.right - box.left - 2 * (padX + off), bot - top, 'S');
                });
                b.y += hBox;
                first = false;
                if (i < laid.length) this._newPage();
            }
            b.y += 6;
        }

        // ── Tables ─────────────────────────────────────────────────────────

        /**
         * Tables: automatic column widths (min/max content), header rows
         * repeated on every page, per-cell direction and alignment, RTL column
         * order for RTL tables. colspan is honored; rowspan is not.
         */
        _table(table, frame, ctx) {
            const L = this._tableLayout(table, frame);
            if (L) this._drawTable(L);
        }

        /** Measure a table: cells, column widths, row heights (no drawing). */
        _tableLayout(table, frame) {
            const b = this._b, T = b.T, self = this;
            if (table._pdfLayout) return table._pdfLayout;           // measured once per build
            const rows = Array.from(table.rows);
            if (!rows.length) return null;
            const full = frame.right - frame.left;
            const padX = 5.4, padY = 2;
            const border = parseBorder(b.cfg.pdf.tableBorder || T.tableBorder);
            const headBg = rgb(T.tableHeaderBg);
            const rtlTable = b.docIsRTL && !b.plan.ltrTables.has(table);

            // prepare cells
            const grid = rows.map(function (tr) {
                const inHead = !!tr.parentElement && tr.parentElement.tagName === 'THEAD';
                const cells = Array.from(tr.cells);
                const allTh = cells.length > 0 && cells.every(function (c) { return c.tagName === 'TH'; });
                let col = 0;
                return {
                    head: inHead, headerLike: inHead || allTh,
                    cells: cells.map(function (td) {
                        const span = td.colSpan || 1;
                        const dir = self._dirOf(td).dir;
                        trimEdges(td);
                        const isHead = td.tagName === 'TH' || inHead || allTh;
                        const atoms = self._atoms(self._pieces(td, dir, isHead ? { bold: true } : {}));
                        let maxW = 0, cur = 0, minW = 0;
                        atoms.forEach(function (a) {
                            if (a.t === 'br') { maxW = Math.max(maxW, cur); cur = 0; return; }
                            cur += a.w;
                            if (a.t === 'w') minW = Math.max(minW, a.w);
                        });
                        maxW = Math.max(maxW, cur);
                        const align = (td.getAttribute('align') ||
                            (/text-align\s*:\s*(\w+)/i.exec(td.getAttribute('style') || '') || [])[1] || '').toLowerCase();
                        const c = { el: td, col: col, span: span, dir: dir, head: isHead, atoms: atoms,
                                    minW: minW + 2 * padX, maxW: maxW + 2 * padX, align: align };
                        col += span;
                        return c;
                    })
                };
            });
            const nCols = Math.max(1, grid.reduce(function (m, r) {
                return Math.max(m, r.cells.reduce(function (s, c) { return s + c.span; }, 0));
            }, 0));

            // column widths: min/max content, scaled to the table width
            const minC = Array(nCols).fill(2 * padX + 6), maxC = Array(nCols).fill(2 * padX + 6);
            grid.forEach(function (r) {
                r.cells.forEach(function (c) {
                    for (let k = 0; k < c.span; k++) {
                        minC[c.col + k] = Math.max(minC[c.col + k], c.minW / c.span);
                        maxC[c.col + k] = Math.max(maxC[c.col + k], c.maxW / c.span);
                    }
                });
            });
            // table width: the setting ('98%' default / 'auto': the content's, up to 100%), centered
            const natural = maxC.reduce(function (s, x) { return s + x; }, 0);
            const tableW = BidiCore.resolveTableWidth(b.cfg.tableWidth, full, natural);
            const mid = (frame.left + frame.right) / 2;
            const box = { left: mid - tableW / 2, right: mid + tableW / 2 };
            const colW = BidiCore.distributeColumns(minC, maxC, tableW);   // shared with the other builders
            // physical x of each column (RTL tables: first column on the right)
            const colX = [];
            let acc = 0;
            for (let k = 0; k < nCols; k++) {
                colX.push(rtlTable ? box.right - acc - colW[k] : box.left + acc);
                acc += colW[k];
            }

            // lay out cells
            const lineTight = true;
            grid.forEach(function (r) {
                r.h = 0;
                r.cells.forEach(function (c) {
                    let w = 0;
                    for (let k = 0; k < c.span; k++) w += colW[c.col + k];
                    c.w = w;
                    c.x = rtlTable ? colX[c.col + c.span - 1] : colX[c.col];
                    c.lines = self._breakLines(c.atoms, w - 2 * padX);
                    c.hs = c.lines.map(function (l) { return self._lineHeight(l, lineTight); });
                    c.h = c.hs.reduce(function (s, h) { return s + h; }, 0) + 2 * padY;
                    r.h = Math.max(r.h, c.h);
                });
            });

            const headRows = grid.filter(function (r) { return r.head; });
            // first unit: header rows + first body row (or the first two rows)
            const firstBody = grid.findIndex(function (r) { return !r.head; });
            const keep = headRows.length
                ? grid.slice(0, firstBody < 0 ? grid.length : Math.min(grid.length, firstBody + 1)).reduce(function (s, r) { return s + r.h; }, 0)
                : grid.slice(0, 2).reduce(function (s, r) { return s + r.h; }, 0);
            table._pdfLayout = { grid: grid, headRows: headRows, keep: keep, border: border, headBg: headBg, padY: padY, padX: padX };
            return table._pdfLayout;
        }

        _drawTable(L) {
            const b = this._b, doc = b.doc, self = this;
            const grid = L.grid, headRows = L.headRows, border = L.border, headBg = L.headBg, padY = L.padY, padX = L.padX;
            const drawRow = function (r) {
                r.cells.forEach(function (c) {
                    if (c.head) {
                        doc.setFillColor(headBg[0], headBg[1], headBg[2]);
                        doc.rect(c.x, b.y, c.w, r.h, 'F');
                    }
                    let align = c.align === 'left' || c.align === 'right' || c.align === 'center' ? c.align
                        : c.align === 'justify' ? 'justify' : (c.head ? 'center' : 'start');
                    let y = b.y + padY + (r.h - c.h) / 2;
                    c.lines.forEach(function (l, i) {
                        self._drawLine(l, c.x + padX, c.x + c.w - padX, y, c.hs[i], c.dir, align, i === c.lines.length - 1, null);
                        y += c.hs[i];
                    });
                    if (!border.none) {
                        doc.setDrawColor(border.color[0], border.color[1], border.color[2]);
                        doc.setLineWidth(border.width);
                        doc.rect(c.x, b.y, c.w, r.h, 'S');
                    }
                });
                b.y += r.h;
            };

            this._space(6);
            // never leave header rows (or a lone first row) at the bottom of a page
            this._ensure(Math.min(L.keep, b.bottom - b.top));
            grid.forEach(function (r, i) {
                if (self._ensure(r.h) && !r.head) headRows.forEach(drawRow);
                drawRow(r);
            });
            b.y += 6;
        }

        // =====================================================================
        // Header / Footer
        // =====================================================================

        _pagingLabels(labels) {
            return labels || this._config.pagingLabels || DEFAULT_PAGING_LABELS[this._b.hfDir];
        }

        /** One BiDi-aware line of text between x0 and x1 (no wrapping). */
        _drawString(textOrEl, o) {
            const b = this._b;
            const el = typeof textOrEl === 'string' ? this._textSpan(textOrEl) : textOrEl;
            const dir = o.dir || b.hfDir;
            let fmt = o.size ? { size: o.size } : {};
            let atoms = this._atoms(this._pieces(el, dir, fmt)).filter(function (a) { return a.t !== 'br'; });
            // shrink to fit: a header/footer cell never overflows into its neighbour
            const w = atoms.reduce(function (s, a) { return s + a.w; }, 0), avail = o.x1 - o.x0;
            if (w > avail && w > 0) {
                const base = o.size || b.sizes.bidi;
                fmt = { size: Math.max(5, base * avail / w * 0.98) };
                atoms = this._atoms(this._pieces(el, dir, fmt)).filter(function (a) { return a.t !== 'br'; });
            }
            const line = { atoms: atoms, br: true };
            const h = o.h || this._lineHeight(line, true);
            this._drawLine(line, o.x0, o.x1, o.y - h / 2, h, dir, o.align || 'center', true, o.color || null);
        }

        _drawHeadersFooters() {
            const b = this._b, doc = b.doc, self = this;
            const n = doc.getNumberOfPages();
            const T = b.T, cfg = this._config;
            const x0 = b.margin.left, x1 = b.pageW - b.margin.right;
            const headerY = toPt(T.headerMargin);
            const footerY = b.pageH - toPt(T.footerMargin);
            const rtl = b.hfDir === 'rtl';

            for (let p = 1; p <= n; p++) {
                doc.setPage(p);
                if (this._headerFooterCallback) {
                    this._headerFooterCallback(doc, {
                        pageNumber: p, pageCount: n,
                        direction: b.hfDir, isRTL: rtl, docDirection: b.docDir,
                        pagingLabels: this._pagingLabels(cfg.footer.pagingLabels),
                        page: { width: b.pageW, height: b.pageH, margin: b.margin },
                        drawText: function (text, o) { self._drawString(text, Object.assign({ x0: x0, x1: x1 }, o || {})); }
                    });
                    continue;
                }
                const h = cfg.header, f = cfg.footer;
                const rowH = b.sizes.bidi * b.lineScale + 4;
                if (h.mode === 'html') this._hfLayout('header', x0, x1, p, n).draw(headerY);
                if (f.mode === 'html') { const lf = this._hfLayout('footer', x0, x1, p, n); lf.draw(footerY - lf.h); }

                // ── header ──
                if (h.mode === 'simple' || h.mode === 'structured') {
                    const hRow = b.headerRow || rowH;
                    const midY = headerY + hRow / 2;
                    const bottom = parseBorder(cfg.borders.headerBottom);
                    if (h.mode === 'simple') {
                        this._drawString(h.text, { x0: x0, x1: x1, y: midY, align: 'center' });
                    } else {
                        const cols = this._hfColumns([['logo', h.logo], ['title', h.title], ['edition', h.edition]], cfg.headerColumns, x0, x1, rtl);
                        const div = parseBorder(cfg.borders.headerCellDivider);
                        cols.forEach(function (c) {
                            if (c.key === 'logo' && b.headerLogo) {
                                // logo image: its height, centered in the cell (narrowed if the cell is narrower)
                                const rec = b.headerLogo, lh = toPt(h.logoHeight || '1cm');
                                const sz = ImageCore.fit(lh * rec.width / rec.height, lh, c.x1 - c.x0 - 4, hRow - 2);
                                doc.addImage(rec.bytes, rec.ext === 'jpg' ? 'JPEG' : 'PNG', (c.x0 + c.x1 - sz.width) / 2, midY - sz.height / 2, sz.width, sz.height);
                                return;
                            }
                            self._drawString(c.text, { x0: c.x0 + 3, x1: c.x1 - 3, y: midY, align: 'center' });
                        });
                        this._vline(div, cols[1].x0, headerY, headerY + hRow);
                        this._vline(div, cols[1].x1, headerY, headerY + hRow);
                    }
                    this._hline(bottom, x0, x1, headerY + hRow);
                }

                // ── footer ──
                if (f.mode === 'simple' || f.mode === 'structured') {
                    const labels = this._pagingLabels(f.pagingLabels);
                    const paging = labels.page + ' ' + p + ' ' + labels.from + ' ' + n;
                    const topY = footerY - rowH;
                    const midY = footerY - rowH / 2;
                    const topB = parseBorder(cfg.borders.footerTop);
                    this._hline(topB, x0, x1, topY);
                    if (f.mode === 'simple') {
                        this._drawString(paging, { x0: x0, x1: x1, y: midY, align: 'center' });
                    } else {
                        const cols = this._hfColumns([['author', ''], ['paging', paging]], cfg.footerColumns, x0, x1, rtl);
                        const author = document.createElement('span');
                        author.textContent = f.author;
                        if (f.link) {
                            author.appendChild(document.createTextNode(' | '));
                            const a = document.createElement('a');
                            a.setAttribute('href', f.link);
                            a.textContent = f.link.replace(/^https?:\/\//, '');
                            author.appendChild(a);
                        }
                        this._drawString(author, { x0: cols[0].x0 + 10, x1: cols[0].x1 - 10, y: midY, align: 'start' });
                        this._drawString(paging, { x0: cols[1].x0, x1: cols[1].x1, y: midY, align: 'center' });
                        // one divider, on the author cell's inner (end) side
                        this._vline(topB, rtl ? cols[0].x0 : cols[0].x1, topY, footerY);
                    }
                }
            }
        }

        /** Columns in header/footer order; RTL puts the first on the right. */
        /**
         * Custom header/footer from HTML (BidiCore.parseHeaderFooter model),
         * laid out for page p of n between x0 and x1:
         *   → { h, draw(top) }
         * Tables: column widths (%), colspan, per-side borders, background,
         * padding, vertical alignment; RTL tables run right to left. Each
         * paragraph is one line (shrunk to fit its cell, as the built-in
         * header); a paragraph holding only images draws them.
         */
        _hfLayout(which, x0, x1, p, n) {
            const self = this, b = this._b, doc = b.doc, cfg = this._config[which];
            b.hfModels = b.hfModels || {};
            const model = b.hfModels[which] || (b.hfModels[which] = BidiCore.parseHeaderFooter(cfg.html));
            const dir = b.hfDir, rtl = dir === 'rtl';
            const values = { page: p, pages: n, date: BidiCore.hfDate(dir, cfg.dateLocale),
                             title: cfg.title != null ? cfg.title : this._docTitle() };
            const color = function (c) { const hx = c && BidiCore.cssColorHex(c); return hx ? rgb('#' + hx) : null; };
            const bline = function (bd) { return bd ? { width: bd.width, color: color(bd.color) || [0, 0, 0], none: false } : { none: true }; };

            // one paragraph → { h, draw(xa, xb, top) }
            const para = function (pp, width) {
                const st = pp.style || {};
                let el = BidiCore.hfFields(pp.el, values);
                const imgs = el.querySelectorAll('img');
                if (imgs.length && !/\S/.test(el.textContent)) {
                    const list = [];
                    imgs.forEach(function (img) {
                        const rec = self._images ? self._images.get(img.getAttribute('src') || '') : null;
                        if (!rec) return;
                        const sz = ImageCore.displaySize(img, rec);
                        const f = ImageCore.fit(sz.width * 0.75, sz.height * 0.75, width, 0);
                        list.push({ rec: rec, w: f.width, h: f.height });
                    });
                    const h = list.reduce(function (m, x) { return Math.max(m, x.h); }, 0);
                    const tw = list.reduce(function (sm, x) { return sm + x.w; }, 0) + Math.max(0, list.length - 1) * 3;
                    return { h: h, draw: function (xa, xb, top) {
                        const a = st.align || (rtl ? 'right' : 'left');
                        let x = a === 'center' ? (xa + xb - tw) / 2 : a === 'right' ? xb - tw : xa;
                        (rtl && a !== 'center' ? list.slice().reverse() : list).forEach(function (im) {
                            doc.addImage(im.rec.bytes, im.rec.ext === 'jpg' ? 'JPEG' : 'PNG', x, top + (h - im.h) / 2, im.w, im.h);
                            x += im.w + 3;
                        });
                    } };
                }
                if (st.bold || st.italic) {                     // paragraph-level weight/style
                    const wrap = el.ownerDocument.createElement(st.bold ? 'b' : 'i');
                    while (el.firstChild) wrap.appendChild(el.firstChild);
                    if (st.bold && st.italic) { const i2 = el.ownerDocument.createElement('i'); i2.appendChild(wrap); el.appendChild(i2); }
                    else el.appendChild(wrap);
                }
                const size = st.size > 0 ? st.size : b.sizes.bidi;
                const h = size * b.lineScale;
                return { h: h, draw: function (xa, xb, top) {
                    self._drawString(el, { x0: xa, x1: xb, y: top + h / 2, h: h, size: st.size > 0 ? st.size : undefined,
                                           align: st.align === 'justify' ? 'start' : (st.align || 'start'),
                                           color: st.color && BidiCore.cssColorHex(st.color) ? '#' + BidiCore.cssColorHex(st.color) : null });
                } };
            };

            const items = [];
            model.blocks.forEach(function (bl) {
                if (bl.type === 'para') {
                    const pr = para({ style: bl.style, el: bl.el }, x1 - x0);
                    items.push({ h: pr.h, draw: function (top) { pr.draw(x0, x1, top); } });
                    return;
                }
                const pct = BidiCore.hfColumnWidths(bl);
                const edges = [];                               // column x ranges, in reading order
                let acc = 0;
                pct.forEach(function (pc) {
                    const w = (x1 - x0) * pc / 100;
                    edges.push(rtl ? { a: x1 - acc - w, b: x1 - acc } : { a: x0 + acc, b: x0 + acc + w });
                    acc += w;
                });
                bl.rows.forEach(function (row) {
                    let col = 0;
                    const cells = row.cells.map(function (c) {
                        const span = edges.slice(col, col + c.colspan);
                        col += c.colspan;
                        const ca = Math.min.apply(null, span.map(function (e) { return e.a; }));
                        const cb = Math.max.apply(null, span.map(function (e) { return e.b; }));
                        const st = c.style, pd = st.padding || {};
                        const pv = function (v, dflt) { return isNaN(v) || v === undefined ? dflt : v; };
                        const pad = { top: pv(pd.top, 2), bottom: pv(pd.bottom, 2), left: pv(pd.left, 3), right: pv(pd.right, 3) };
                        const paras = c.paras.map(function (pp) {
                            return para({ style: Object.assign({}, { align: st.align }, pp.style), el: pp.el }, cb - ca - pad.left - pad.right);
                        });
                        const ch = paras.reduce(function (sm, x) { return sm + x.h; }, 0) + pad.top + pad.bottom;
                        return { a: ca, b: cb, st: st, pad: pad, paras: paras, h: ch };
                    });
                    const rh = cells.reduce(function (m, c) { return Math.max(m, c.h); }, 0);
                    items.push({ h: rh, draw: function (top) {
                        cells.forEach(function (c) {
                            const bg = color(c.st.bg);
                            if (bg) { doc.setFillColor(bg[0], bg[1], bg[2]); doc.rect(c.a, top, c.b - c.a, rh, 'F'); }
                        });
                        cells.forEach(function (c) {
                            const inner = c.h - c.pad.top - c.pad.bottom;
                            const va = c.st.valign;
                            let y = top + c.pad.top + (va === 'top' ? 0 : va === 'bottom' ? rh - c.h : (rh - c.h) / 2);
                            c.paras.forEach(function (pr) { pr.draw(c.a + c.pad.left, c.b - c.pad.right, y); y += pr.h; });
                            const bd = c.st.border;
                            self._hline(bline(bd.top), c.a, c.b, top);
                            self._hline(bline(bd.bottom), c.a, c.b, top + rh);
                            self._vline(bline(bd.left), c.a, top, top + rh);
                            self._vline(bline(bd.right), c.b, top, top + rh);
                            return inner;
                        });
                    } });
                });
            });
            const total = items.reduce(function (sm, it) { return sm + it.h; }, 0);
            return { h: total, draw: function (top) {
                let y = top;
                items.forEach(function (it) { it.draw(y); y += it.h; });
            } };
        }

        /** {title}: the option, else the content's first heading. */
        _docTitle() {
            const m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(this._contentHtml || '');
            return m ? m[1].replace(/<[^>]+>/g, '').trim() : '';
        }

        _hfColumns(items, widths, x0, x1, rtl) {
            const total = x1 - x0;
            let acc = 0;
            return items.map(function (it) {
                const w = total * parseFloat(widths[it[0]]) / 100;
                const c = rtl ? { x0: x1 - acc - w, x1: x1 - acc } : { x0: x0 + acc, x1: x0 + acc + w };
                acc += w;
                c.text = it[1];
                c.key = it[0];
                return c;
            });
        }

        _hline(br, x0, x1, y) {
            if (br.none) return;
            const doc = this._b.doc;
            doc.setDrawColor(br.color[0], br.color[1], br.color[2]);
            doc.setLineWidth(br.width);
            doc.line(x0, y, x1, y);
        }

        _vline(br, x, y0, y1) {
            if (br.none) return;
            const doc = this._b.doc;
            doc.setDrawColor(br.color[0], br.color[1], br.color[2]);
            doc.setLineWidth(br.width);
            doc.line(x, y0, x, y1);
        }
    }


    // =========================================================================
    // Export (UMD)
    // =========================================================================
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { PdfBuilder, PdfBuilderError };
    } else if (typeof define === 'function' && define.amd) {
        define([], function () { return { PdfBuilder, PdfBuilderError }; });
    } else {
        global.PdfBuilder = PdfBuilder;
        global.PdfBuilderError = PdfBuilderError;
    }

})(typeof window !== 'undefined' ? window : this);
