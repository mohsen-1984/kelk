/**
 * PdfImporter - PDF → Markdown Import Library with Full RTL/BiDi Support
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
 *
 * The way back of PdfBuilder: a PDF — Kelk's own or any other program's — read
 * into semantic HTML and handed to MarkdownImporter, so it is cleaned exactly
 * as Word and HTML imports are. pdf.js reads the file; everything above the
 * glyphs (lines, reading order, tables, lists, headings) is this library's.
 * Entirely client-side, from file:// too.
 *
 * Younger than the builders (2.0): its first release. Well tested where it has
 * been tested — the lab's corpus, style fuzzing, a metamorphic net, Kelk's own
 * round trip, and real files from many producers — but a PDF keeps no
 * structure of its own, and the corpus is good, not complete. What is known
 * to fail is in TODO.md; why each rule is as it is, in PDFIMPORT.md.
 *
 * ─────────────────────────────────────────────────────────────────────
 * HOW A PDF IS READ
 * ─────────────────────────────────────────────────────────────────────
 *
 *   0. source       a PDF made by Kelk can carry its own Markdown (XMP
 *                   kelk:source or an attached *.md) → returned as is (lossless)
 *   0.5 provenance  who made it: engine, app, OS (with evidence), path, post-
 *                   processors — r.profile, evidence only (PDFIMPORT.md §2a)
 *   0.6 structure   a tagged PDF's structure tree onto the glyphs (g.struct), with its
 *                   trust; it votes on headings and tables where it is trusted (§2b)
 *   1. extract      per page: text items (pdf.js), drawing operators
 *                   (rectangles, rules, small dots = bullets, vector figures,
 *                   images), link annotations; /ActualText of marked content
 *                   (read from the page's content stream: pdf.js keeps only MCIDs)
 *                   for glyphs with no Unicode; Type3 widths by their FontMatrix
 *   2. fonts        each font → regular / bold / italic / mono: by its name,
 *                   else (Kelk / jsPDF: four styles with one name) by glyph
 *                   widths and bounding box against the family's regular
 *   3. lines        items → visual glyph lines → logical order with a small
 *                   UBA (base direction from alignment, else majority),
 *                   brackets mirrored on RTL levels, presentation forms
 *                   → letters (NFKC), lost ZWNJ partly restored
 *   4. regions      repeated header/footer lines dropped; tables (ruled
 *                   grids), code boxes (mono text in a frame), quotes
 *                   (filled box / side bar), horizontal rules, figures
 *   5. blocks       headings (size / bold), paragraphs (gaps), lists (dot or
 *                   number markers, levels by indent); blocks split by a page
 *                   break are joined again
 *   6. html         <h*>, <p>, <ul>/<ol>, <pre><code>, <blockquote>, <table>,
 *                   <hr>, <img> → MarkdownImporter.fromHtml (same cleaning as
 *                   Word / HTML import)
 *
 * Right to left: the importer runs its own bidi (the PDF stores glyphs in
 * drawing order), repairs what producers get wrong in Arabic script (a
 * ToUnicode one entry off, shapes that lie about joining, lost ZWNJs,
 * presentation forms) against the font's own cmap and glyph order, and reads
 * each number as its producer meant it (PDFIMPORT.md §4, §6).
 *
 * ─────────────────────────────────────────────────────────────────────
 * FILES
 * ─────────────────────────────────────────────────────────────────────
 *
 * Classic scripts, no build step; load them in this order, after pdf.js
 * (vendor/pdfjs/, made by tools/build-pdfjs.js: it defines window.pdfjsLib and
 * window.pdfjsWorker, so pdf.js runs its worker code on the main thread — no
 * Worker, no fetch, no CORS) and MarkdownImporter:
 *   lib/PdfImporter.js           this core: options, shared helpers (bidi, Arabic, fonts, provenance),
 *                                the pipeline (fromArrayBuffer), structure tree, Kelk source, Markdown
 *   lib/pdfimport/extract.js     1. extract, repairs, 2. fonts
 *   lib/pdfimport/lines.js       3. lines, 3.5 furniture
 *   lib/pdfimport/regions.js     4. regions (the page driver, ruled tables, code boxes, figures)
 *   lib/pdfimport/order.js       4. reading order (XY-cut, borderless tables)
 *   lib/pdfimport/blocks.js      5. blocks, across pages, 6. HTML
 * Each part adds its methods to PdfImporter.prototype; PdfImporter.PARTS names them.
 * Tests: tests/pdf-lab/ (its README), tests/builder-suite.html (the round trip).
 *
 * ─────────────────────────────────────────────────────────────────────
 * USAGE
 * ─────────────────────────────────────────────────────────────────────
 *
 * @example Basic usage
 * const r = await PdfImporter.create().fromArrayBuffer(buf);
 * r.markdown;       // the document
 * r.source;         // 'kelk' (its own Markdown, lossless) | 'layout' (read from the page)
 * r.messages;       // what the user should know (no text layer, links lost …); r.notes their codes
 * r.profile;        // who made the file, with evidence (engine, app, os, path)
 *
 * @example Options (defaults shown)
 * PdfImporter.create({
 *     images: 'markdown',       // 'markdown' (data: URI) | 'drop'
 *     dropHeaderFooter: true,   // running heads, feet and page numbers
 *     asciiNumbers: true,       // ۰–۹ ٠–٩ → 0–9 (and ٬ ٫ ٪ in numbers)
 *     persianLetters: true,     // ي ك ى → ی ک ی in a Persian document
 *     password: undefined,      // an encrypted file's user password
 *     maxPages: 500,
 *     signal: controller.signal // abort at the next page (err.code 'aborted')
 * });
 */
(function (global) {
    'use strict';

    const DEFAULTS = Object.freeze({
        images: 'markdown',        // 'markdown' (data: URI) | 'drop'
        imageScale: 2,             // render scale for cropped figures / formulas
        dropHeaderFooter: true,
        password: undefined,       // the user password of an encrypted PDF
        maxPages: 500,
        onImage: null,
        loadEmojiMap: null,        // async () → { pua, seq } of a PUA-remapped emoji font (Kelk's Noto Emoji), asked for only when needed             // async (dataUri, { page, index }) → src for the <img> (e.g. a registered name)
        wasmBase: null,            // folder of the decoder scripts (vendor/pdfjs/wasm/); default: next to pdf.worker*.js
        markdownImporter: null,    // options passed to MarkdownImporter.create
        signal: null,              // an AbortSignal: aborting stops the import at the next page (err.code 'aborted')
        // text written for searching and typing (PDFIMPORT.md §6, "Numbers and letters written out"); false: as the file names it
        asciiNumbers: true,        // digits ۰–۹ ٠–٩ → 0–9; in a number ٬ ، → ,  ٫ → .  ٪ → %  (whatever the language; code untouched)
        persianLetters: true,      // in a Persian document (پ چ ژ گ in its text): ي ك ى → ی ک ی
        debug: false               // true: r.calibration — the document's measures and every threshold as resolved
    });

    // ── character classes ──────────────────────────────────────────────
    const R_CH = /[֐-׿\u0600-\u065F٪-ۯۺ-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF߀-߿]/;
    const AN_CH = /[٠-٩۰-۹]/;
    const EN_CH = /[0-9²³¹⁰-⁹₀-₉]/;
    const MARK_CH = /[\u0300-\u036F\u0483-҉\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED\uFE20-\uFE2F]/;
    const L_CH = /[A-Za-zªµºÀ-ʸͰ-ϿЀ-ԯḀ-῿Ⰰ-\u2DFF\uE000-\uF8FF]/;
    const CS_CH = /[.,:\/\u060C\u00A0\u066B\u066C]/;            // separators inside numbers
    const ES_CH = /[+\-\u2212]/;                                     // signs: numeric only between two digits
    const ET_CH = /[%\u066A\u2030#$\u00A3\u00A5\u20AC\u00B0]/;   // terminators next to numbers
    const CTRL = /^[\u0000-\u0008\u000B\u000C\u000E-\u001F]$/;              // a control character as a glyph's text: no text
    const MIRROR = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<',
                     '«': '»', '»': '«', '‹': '›', '›': '‹' };

    /** 0–9 for an ASCII, Arabic-Indic or Persian digit, else −1. */
    function digitValue(ch) {
        const c = ch ? ch.charCodeAt(0) : 0;
        return c >= 0x30 && c <= 0x39 ? c - 0x30 : c >= 0x660 && c <= 0x669 ? c - 0x660 : c >= 0x6F0 && c <= 0x6F9 ? c - 0x6F0 : -1;
    }

    function charType(ch) {
        if (MARK_CH.test(ch)) return 'NSM';
        if (AN_CH.test(ch)) return 'AN';
        if (EN_CH.test(ch)) return 'EN';
        // (the Arabic comma is a separator, not a letter: «12،500،000» is one number — Unicode gives it CS)
        if (ch === '\u060C') return 'CS';
        // (and so are the Arabic decimal and thousands separators — «۶٬۹۰۰٬۷۳۹» came back «۷۳۹٬۹۰۰٬۶», its groups
        // reversed: inside R_CH's range they were taken for letters —, and the Arabic percent sign is a terminator)
        if (ch === '\u066B' || ch === '\u066C') return 'CS';
        if (ch === '\u066A') return 'ET';
        if (R_CH.test(ch)) return 'R';
        if (L_CH.test(ch)) return 'L';
        if (/\p{L}/u.test(ch)) return 'L';
        if (CS_CH.test(ch) || ES_CH.test(ch)) return 'CS';
        if (ET_CH.test(ch)) return 'ET';
        if (/\s/.test(ch)) return 'WS';
        return 'ON';
    }

    /**
     * Small Unicode BiDi: levels of a run of glyphs for a base level (0 LTR,
     * 1 RTL). Enough for one line of a document (no explicit embeddings).
     */
    function bidiLevels(glyphs, base, joinSigns) {
        const n = glyphs.length;
        const t = glyphs.map(function (g) { return g.strongL ? 'L' : g.atom ? 'ON' : charType(g.ch.charAt(0)); });
        for (let i = 0; i < n; i++) if (t[i] === 'NSM') t[i] = i ? t[i - 1] : (base ? 'R' : 'L');
        // W7: European numbers after L stay L-like
        let lastStrong = base ? 'R' : 'L';
        for (let i = 0; i < n; i++) {
            if (t[i] === 'L' || t[i] === 'R') lastStrong = t[i];
            else if ((t[i] === 'EN' || t[i] === 'AN') && lastStrong === 'L') t[i] = 'L';
        }
        // W2: a number after an Arabic letter is an Arabic number (AN), and Arabic-Indic digits always are (Persian
        // ۰–۹ are European by class, as ASCII). It matters for what joins it: a hyphen does not join Arabic numbers
        // (W4) nor does a percent sign attach to them (W5) — «قاعدهٔ ۳-۲-۱» is drawn «۱-۲-۳» to the word's left, and
        // «۱۰٪» after Persian words with the sign at the number's left, by Chrome, Word and LibreOffice alike; read
        // as European numbers, both came back reversed. The input is visual: on a right-to-left line the letter
        // before a number in the text is the strong one to its right.
        const AL_CH = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
        // (within the run the number stands in: a gap wider than a word space — a table's next cell, its own
        // paragraph — ends the search; a cell «42%» alone has no letter before it, and its number is European.
        // Unsure, the number stays European: the reading before this rule)
        const gapAt = function (k, j) {
            const a = glyphs[Math.min(k, j)], b = glyphs[Math.max(k, j)];
            if (!a || !b || a.x === undefined || b.x === undefined || a.atom || b.atom) return false;
            return b.x - (a.x + (a.w || 0)) > 0.55 * (b.size || a.size || 10);
        };
        const strongBefore = function (i) {
            if (base) { for (let k = i + 1; k < n; k++) { if (gapAt(k - 1, k)) return -1; if (t[k] === 'L' || t[k] === 'R') return k; } }
            else { for (let k = i - 1; k >= 0; k--) { if (gapAt(k, k + 1)) return -1; if (t[k] === 'L' || t[k] === 'R') return k; } }
            return -1;
        };
        for (let i = 0; i < n; i++) {
            if (t[i] !== 'EN' && t[i] !== 'AN') continue;
            // (Arabic-Indic digits are Arabic numbers wherever they stand — a cell «٣٠٪» alone is drawn «٪٣٠», the sign
            // at its left, by Chrome, LibreOffice and Kelk alike; the producers that join signs do so too)
            if (/[\u0660-\u0669]/.test(glyphs[i].ch)) { t[i] = 'AN'; continue; }
            const k = strongBefore(i);
            t[i] = !joinSigns && k >= 0 && t[k] === 'R' && AL_CH.test(glyphs[k].ch) ? 'AN' : 'EN';
        }
        // W4: a common separator joins two numbers of one kind; a sign (+ −) only European ones.
        // (joinSigns: producers that set every number as a European one, signs and terminators attached — InDesign's
        // composer, Kelk's own PdfBuilder: «بند 2-6» drawn «2-6», «8%» with its sign; read by W2, a contract's 80
        // clause numbers turned round. The provenance profile names them: PDFIMPORT.md §6, "Numbers")
        for (let i = 1; i < n - 1; i++) {
            if (t[i] !== 'CS') continue;
            if (t[i - 1] === 'EN' && t[i + 1] === 'EN') t[i] = 'EN';
            else if (t[i - 1] === 'AN' && t[i + 1] === 'AN' && (!ES_CH.test(glyphs[i].ch) || joinSigns)) t[i] = 'AN';
        }
        // visual input: an Arabic comma drawn against the digits at its left, a space, then digits — «2-9، 2-10» as
        // InDesign sets a list of clause numbers — is one left-to-right run; a list typed so, laid out by the bidi
        // algorithm, puts the comma at the other number's left («2-10 ،2-9»), so this order was drawn left to right
        const num = function (x) { return x === 'EN' || x === 'AN'; };
        if (base) for (let i = 1; i + 2 < n; i++) if (glyphs[i].ch === '\u060C' && num(t[i - 1]) && t[i + 1] === 'WS' && num(t[i + 2])) { t[i] = t[i - 1]; t[i + 1] = t[i - 1]; }
        for (let i = 0; i < n; i++) {
            if (t[i] !== 'ET') continue;
            let j = i; while (j < n && t[j] === 'ET') j++;
            if ((i > 0 && t[i - 1] === 'EN') || (j < n && t[j] === 'EN')) for (let k = i; k < j; k++) t[k] = 'EN';
        }
        for (let i = 0; i < n; i++) if (t[i] === 'CS' || t[i] === 'ET') t[i] = 'ON';
        for (let i = 0; i < n; i++) if (t[i] === 'AN') t[i] = 'EN';     // (from here on a number is a number: the levels are alike)
        // math symbols and arrows (∑ ∫ ∂ ∀ √ → …) next to a Latin run belong to it; other symbols (✓ ★) stay neutral
        for (let i = 0; i < n; i++) {
            if (t[i] !== 'ON' || glyphs[i].atom || !/[\u2100-\u214F\u2190-\u22FF\u221A]/.test(glyphs[i].ch)) continue;
            let a = i - 1; while (a >= 0 && (t[a] === 'WS' || t[a] === 'ON')) a--;
            let b = i + 1; while (b < n && (t[b] === 'WS' || t[b] === 'ON')) b++;
            if ((a >= 0 && t[a] === 'L') || (b < n && t[b] === 'L')) t[i] = 'L';
        }
        // visual input: ASCII sentence punctuation glued to the left end of a right-to-left
        // run, after a space or the line start («word .پایان») was drawn as part of that run
        for (let i = 0; i < n - 1; i++) {
            if (t[i] !== 'ON' || !/^[?!.,:;]$/.test(glyphs[i].ch)) continue;
            let j = i; while (j < n && t[j] === 'ON' && /^[?!.,:;]$/.test(glyphs[j].ch)) j++;
            if (j < n && t[j] === 'R' && (i === 0 || t[i - 1] === 'WS')) for (let k = i; k < j; k++) t[k] = 'R';
            i = j;
        }
        // visual input: ASCII sentence punctuation glued to the right end of a Latin run
        // («Kelk?» «Word.») was drawn as part of that run; so were the signs of a name («C++» «C#» «Notepad++»)
        for (let i = 1; i < n; i++) {
            if (t[i] === 'ON' && t[i - 1] === 'L' && !glyphs[i - 1].atom && /^[?!.,:;'"%+#]$/.test(glyphs[i].ch)) {
                let j = i; while (j < n && t[j] === 'ON' && /^[?!.,:;'"%+#]$/.test(glyphs[j].ch)) j++;
                if (j >= n || t[j] === 'WS') for (let k = i; k < j; k++) t[k] = 'L';
                i = j;
            }
        }
        // N0: bracket pairs (as drawn: opening shape left, closing right) take the
        // direction of their content when it matches the base; content of the other
        // direction makes them follow the strong context before the pair
        const OPEN = '([{', CLOSE = ')]}';
        const pairs = [], stack = [];
        for (let i = 0; i < n; i++) {
            const ch = glyphs[i].atom ? '' : glyphs[i].ch;
            if (t[i] !== 'ON' || ch.length !== 1) continue;
            if (OPEN.indexOf(ch) >= 0) stack.push(i);
            else if (CLOSE.indexOf(ch) >= 0) {
                for (let k = stack.length - 1; k >= 0; k--) {
                    if (OPEN.indexOf(glyphs[stack[k]].ch) === CLOSE.indexOf(ch)) { pairs.push([stack[k], i]); stack.length = k; break; }
                }
            }
        }
        const e = base ? 'R' : 'L', o = base ? 'L' : 'R';
        const strongAt = function (k) { return t[k] === 'L' ? 'L' : (t[k] === 'R' || t[k] === 'EN') ? 'R' : null; };
        pairs.sort(function (a, b) { return base ? b[1] - a[1] : a[0] - b[0]; });     // logical order
        pairs.forEach(function (pr) {
            let hasE = false, hasO = false;
            for (let k = pr[0] + 1; k < pr[1]; k++) { const d = strongAt(k); if (d === e) hasE = true; else if (d === o) hasO = true; }
            let d = null;
            if (hasE) d = e;
            else if (hasO) {
                let ctx = null;
                if (base) { for (let k = pr[1] + 1; k < n && !ctx; k++) ctx = strongAt(k); }
                else { for (let k = pr[0] - 1; k >= 0 && !ctx; k--) ctx = strongAt(k); }
                d = ctx === o ? o : e;
            }
            if (d) { t[pr[0]] = d; t[pr[1]] = d; }
        });
        // N1/N2: neutrals between two equal directions take it (numbers count as R)
        const dirOf = function (x) { return x === 'L' ? 'L' : (x === 'R' || x === 'EN') ? 'R' : null; };
        for (let i = 0; i < n; i++) {
            if (dirOf(t[i]) || t[i] === 'EN') continue;
            let j = i; while (j < n && !dirOf(t[j])) j++;
            const before = i > 0 ? dirOf(t[i - 1]) : (base ? 'R' : 'L');
            const after = j < n ? dirOf(t[j]) : (base ? 'R' : 'L');
            const d = before === after ? before : (base ? 'R' : 'L');
            for (let k = i; k < j; k++) t[k] = d === 'L' ? 'NL' : 'NR';
            i = j - 1;
        }
        return t.map(function (x) {
            if (base === 0) return (x === 'L' || x === 'NL') ? 0 : x === 'EN' ? 2 : 1;
            return (x === 'R' || x === 'NR') ? 1 : 2;
        });
    }

    /** Reorder (L2): reverse every run at or above each level, highest first. */
    function reorder(arr, levels) {
        const out = arr.slice(), lv = levels.slice();
        const max = Math.max.apply(null, lv.concat([0]));
        const minOdd = 1;
        for (let L = max; L >= minOdd; L--) {
            for (let i = 0; i < out.length; i++) {
                if (lv[i] < L) continue;
                let j = i; while (j < out.length && lv[j] >= L) j++;
                const a = out.slice(i, j).reverse(), b = lv.slice(i, j).reverse();
                for (let k = i; k < j; k++) { out[k] = a[k - i]; lv[k] = b[k - i]; }
                i = j;
            }
        }
        return { items: out, levels: lv };
    }

    // ── Arabic-script repair ───────────────────────────────────────────
    /** presentation form → [base char, form] form: 0 isolated 1 final 2 initial 3 medial */
    const PF = {};
    (function () {
        const RANGES = '0622:FE81,FE82;0623:FE83,FE84;0624:FE85,FE86;0625:FE87,FE88;0626:FE89,FE8A,FE8B,FE8C;0627:FE8D,FE8E;0628:FE8F,FE90,FE91,FE92;0629:FE93,FE94;062A:FE95,FE96,FE97,FE98;062B:FE99,FE9A,FE9B,FE9C;062C:FE9D,FE9E,FE9F,FEA0;062D:FEA1,FEA2,FEA3,FEA4;062E:FEA5,FEA6,FEA7,FEA8;062F:FEA9,FEAA;0630:FEAB,FEAC;0631:FEAD,FEAE;0632:FEAF,FEB0;0633:FEB1,FEB2,FEB3,FEB4;0634:FEB5,FEB6,FEB7,FEB8;0635:FEB9,FEBA,FEBB,FEBC;0636:FEBD,FEBE,FEBF,FEC0;0637:FEC1,FEC2,FEC3,FEC4;0638:FEC5,FEC6,FEC7,FEC8;0639:FEC9,FECA,FECB,FECC;063A:FECD,FECE,FECF,FED0;0641:FED1,FED2,FED3,FED4;0642:FED5,FED6,FED7,FED8;0643:FED9,FEDA,FEDB,FEDC;0644:FEDD,FEDE,FEDF,FEE0;0645:FEE1,FEE2,FEE3,FEE4;0646:FEE5,FEE6,FEE7,FEE8;0647:FEE9,FEEA,FEEB,FEEC;0648:FEED,FEEE;0649:FEEF,FEF0;064A:FEF1,FEF2,FEF3,FEF4;067E:FB56,FB57,FB58,FB59;0686:FB7A,FB7B,FB7C,FB7D;0698:FB8A,FB8B;06A9:FB8E,FB8F,FB90,FB91;06AF:FB92,FB93,FB94,FB95;06CC:FBFC,FBFD,FBFE,FBFF;06C0:FBA4,FBA5';
        RANGES.split(';').forEach(function (e) {
            const kv = e.split(':'), base = String.fromCharCode(parseInt(kv[0], 16));
            kv[1].split(',').forEach(function (h, i) { PF[String.fromCharCode(parseInt(h, 16))] = [base, i]; });
        });
    })();
    const ISOLATED = {};                         // letter → its isolated presentation form
    Object.keys(PF).forEach(function (c) { if (PF[c][1] === 0) ISOLATED[PF[c][0]] = c; });
    const DUAL = /[ئبت-خس-غف-هىيپچکگیـ]/;
    const ARABIC_LETTER = /[ء-غف-يٱ-ۓۺ-ۼ]/;
    const NOT_MI_WORDS = /^(?:ن?می(?:ز|زان|زبان|ل|لی|لیون|لیارد|لاد|لادی|ان|انه|انگین|انجی|دان|وه|هن|همان|خ|ش|ر|رزا|راث|کروب|کرو|گو|نا|نو|مون|ترا|ثاق|عاد|سر|کده|ستر|نیاتور|نیمم|نی)(?:ها|های|هایی|ی|ش|م|ت)?)$/;

    /**
     * Logical glyphs of one block → glyphs with letters restored:
     * ZWNJ where shapes show a broken join, «می/نمی» + verb, NFKC on
     * presentation forms, a haraka/hamza that slipped to the word start put back.
     */
    function repairArabic(glyphs, opts) {
        // a drawn ZWNJ (zero-width, placed by its origin) where it cannot be: between two forms that join each other
        // (Word: «پ‌یش» for «پیش‌بینی» — the shapes put it back where it was), or not between two letters (a space, a
        // digit, Latin, the line's edge: there it shapes nothing)
        glyphs = glyphs.filter(function (g, i) {
            if (g.ch !== '\u200C' || g.synthetic) return true;
            const p = glyphs[i - 1], n = glyphs[i + 1];
            if (!p || !n || p.atom || n.atom || !ARABIC_LETTER.test(nfkcArabic(p.ch).slice(-1)) || !ARABIC_LETTER.test(nfkcArabic(n.ch).charAt(0))) return false;
            const a = PF[p.ch], b = PF[n.ch];
            return !(a && b && (a[1] === 2 || a[1] === 3) && (b[1] === 1 || b[1] === 3));
        });
        const out = [];
        for (let i = 0; i < glyphs.length; i++) {
            const g = glyphs[i], next = glyphs[i + 1];
            out.push(g);
            if (!next || g.atom || next.atom) continue;
            const a = PF[g.ch], b = PF[next.ch];
            // the letters that meet at the join: a ligature's last and first (Word names lam-alef «لا»: its alef ends it)
            const aBase = a ? a[0] : nfkcArabic(g.ch).slice(-1), bBase = b ? b[0] : nfkcArabic(next.ch).charAt(0);
            if (!ARABIC_LETTER.test(aBase) || !ARABIC_LETTER.test(bBase)) continue;
            // a dual-joining letter that does not join forward, or a next letter that
            // does not join backward, means an invisible ZWNJ stood between them
            const aNoJoin = a && DUAL.test(aBase) && (a[1] === 0 || a[1] === 1);
            const bNoJoin = b && (b[1] === 0 || b[1] === 2) && DUAL.test(aBase) && !(a && (a[1] === 2 || a[1] === 3));
            // (not in a font whose shapes contradict each other: opts.lyingForms, measured in _layout; a font that lies
            // only about joining back — PowerPoint with Arial: a medial drawn with the initial glyph, reh after meem with
            // the isolated one — still tells by its forward join, opts.lyingBack)
            const has = function (list) { return list && list.length && (list.indexOf(g.font) >= 0 || list.indexOf(next.font) >= 0); };
            const lying = has(opts && opts.lyingForms), lyingBack = has(opts && opts.lyingBack);
            // (and a next letter drawn joining back says they joined, whatever the first one's glyph says: Arial's tah
            // drawn final before the lam it joins, «داوطلبان»)
            const joinedBack = b && (b[1] === 1 || b[1] === 3) && !next.formGuess;
            const fwdLie = opts && opts.fwdLies && opts.fwdLies.indexOf(g.font + '|' + aBase) >= 0;
            if (((aNoJoin && !joinedBack && !fwdLie) || (bNoJoin && !lyingBack)) && !lying) out.push(Object.assign({}, g, { ch: '\u200C', synthetic: true }));
        }
        // the ligature ﷲ named «الله» drawn after an alef of its own (a font whose ﷲ glyph is only «لله»: GDI wrote
        // «بسم االله»): the alef is already in the name
        for (let i = out.length - 2; i >= 0; i--) if (out[i + 1].ch === '\uFDF2' && /^[\u0627\uFE8D\uFE8E]$/.test(out[i].ch)) out.splice(i, 1);
        // presentation forms → letters (lam-alef → لا), then NFC (ە + ٔ, drawn for a missing ۀ → ۀ)
        out.forEach(function (g) { if (!g.atom) g.ch = nfkcArabic(g.ch).normalize('NFC'); });
        // «می» / «نمی» + verb without its ZWNJ — only for files whose producer dropped every ZWNJ
        if (opts && opts.keepZwnj) return out;
        const text = out.map(function (g) { return g.atom ? '\uFFFC' : g.ch; }).join('');
        const re = /(^|[^\u0600-ۿ\u200C])(ن?می)(?=[ء-ی]{2,})/g;
        const inserts = [];
        let m;
        while ((m = re.exec(text))) {
            const start = m.index + m[1].length, end = start + m[2].length;
            const word = text.slice(start).match(/^[\u0600-ۿ\u200C]+/)[0];
            if (word.indexOf('\u200C') === m[2].length) continue;
            if (NOT_MI_WORDS.test(word.split('\u200C')[0])) continue;
            inserts.push(end);
        }
        // map string offsets back to glyph indexes (each glyph ch may be 1+ chars)
        if (inserts.length) {
            let pos = 0; const at = [];
            out.forEach(function (g, gi) { pos += g.atom ? 1 : g.ch.length; at.push([pos, gi]); });
            for (let k = inserts.length - 1; k >= 0; k--) {
                const hit = at.filter(function (p) { return p[0] === inserts[k]; })[0];
                if (hit) out.splice(hit[1] + 1, 0, Object.assign({}, out[hit[1]], { ch: '\u200C', synthetic: true }));
            }
        }
        return out;
    }

    // ── helpers ────────────────────────────────────────────────────────
    /** Does a paragraph go on here — lower case, or a letter of a script with no case (Persian, Arabic, Hebrew …)? */
    function goesOn(t) { const c = Array.from(t || '')[0] || ''; return /^\p{Ll}/u.test(c) || (/^\p{L}/u.test(c) && c.toLowerCase() === c.toUpperCase()); }
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function median(a) { if (!a.length) return 0; const s = a.slice().sort(function (x, y) { return x - y; }); return s[s.length >> 1]; }
    function mode(a, round) {
        const c = new Map(); let best = null, bc = 0;
        a.forEach(function (v) { const k = round ? Math.round(v * round) / round : v; const n = (c.get(k) || 0) + 1; c.set(k, n); if (n > bc) { bc = n; best = k; } });
        return best;
    }
    function mul(m, n) { return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]; }
    function apply(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
    function bboxOf(pts) {
        const xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
        return { x0: Math.min.apply(null, xs), y0: Math.min.apply(null, ys), x1: Math.max.apply(null, xs), y1: Math.max.apply(null, ys) };
    }
    function inside(b, x, y, pad) { pad = pad || 0; return x >= b.x0 - pad && x <= b.x1 + pad && y >= b.y0 - pad && y <= b.y1 + pad; }
    function overlapY(a0, a1, b0, b1) { return Math.min(a1, b1) - Math.max(a0, b0); }
    function isWhite(c) { return !c || /^#f[0-9a-f]f[0-9a-f]f[0-9a-f]$/i.test(c) && parseInt(c.slice(1, 3), 16) > 0xF8 && parseInt(c.slice(3, 5), 16) > 0xF8 && parseInt(c.slice(5, 7), 16) > 0xF8; }

    /**
     * A glyph of an emoji font is shown as emoji: text-default code points in it (⚠ ✏ ❤ 1 #)
     * get their U+FE0F back (emoji fonts for jsPDF drop it).
     */
    const EMOJI_P = (function () { try { return [new RegExp('\\p{Emoji}', 'u'), new RegExp('\\p{Emoji_Presentation}', 'u'), new RegExp('\\p{Emoji_Modifier}', 'u')]; } catch (e) { return null; } })();
    function emojiPresentation(t) {
        if (!EMOJI_P || /[\uE000-\uF8FF]/.test(t)) return t;
        const cps = Array.from(t), out = [];
        cps.forEach(function (c, i) {
            out.push(c);
            const next = cps[i + 1];
            if (EMOJI_P[0].test(c) && !EMOJI_P[1].test(c) && !EMOJI_P[2].test(c) && c !== '\u200D' && next !== '\uFE0F' && next !== '\uFE0E' &&
                !(next && EMOJI_P[2].test(next))) out.push('\uFE0F');
        });
        return out.join('');
    }

    /** Symbol fonts with no Unicode (Wingdings, Wingdings 2): their codes, often moved to U+F0xx, → Unicode. */
    const DINGBATS = {
        // (0x6D ❍: Word's empty radio button — a form's «○حقیقی ⚫حقوقی»: the empty one was lost)
        wingdings: { 0x6C: '\u25CF', 0x6D: '\u274D', 0x6E: '\u25A0', 0x6F: '\u25A1', 0x70: '\u25FB', 0x71: '\u2751', 0x72: '\u2752', 0x75: '\u25C6',
                     0x76: '\u2756', 0x77: '\u2B25', 0x9F: '\u2022', 0xA1: '\u25CB', 0xA7: '\u25AA', 0xA8: '\u25FB', 0xD8: '\u27A2',
                     0xDF: '\u2190', 0xE0: '\u2192', 0xE1: '\u2191', 0xE2: '\u2193', 0xE8: '\u2794', 0xF0: '\u21E8', 0xFB: '\u2717',
                     0xFC: '\u2713', 0xFD: '\u2612', 0xFE: '\u2611', 0x4A: '\u263A', 0x4C: '\u2639', 0x46: '\u261E', 0x41: '\u270C' },
        wingdings2: { 0x4F: '\u2717', 0x50: '\u2713', 0x51: '\u2715', 0x52: '\u2611', 0x53: '\u2612', 0x54: '\u2612', 0xA3: '\u2610',
                      0x97: '\u25CF', 0x98: '\u25CB' },
        // Symbol (Word's bullet is Symbol U+F0B7): the signs, not the Greek letters (those come mapped)
        symbol: { 0xB7: '\u2022', 0xA7: '\u2663', 0xA8: '\u2666', 0xA9: '\u2665', 0xAA: '\u2660', 0xAB: '\u2194', 0xAC: '\u2190', 0xAD: '\u2191',
                  0xAE: '\u2192', 0xAF: '\u2193', 0xB0: '\u00B0', 0xB1: '\u00B1', 0xB3: '\u2265', 0xA3: '\u2264', 0xB4: '\u00D7', 0xB8: '\u00F7',
                  0xB9: '\u2260', 0xBB: '\u2248', 0xBC: '\u2026', 0xA5: '\u221E', 0xB6: '\u2202', 0xD6: '\u221A', 0xE5: '\u2211', 0xF2: '\u222B',
                  0xC5: '\u2295', 0xC4: '\u2297', 0xE0: '\u25CA', 0xD2: '\u00AE', 0xD3: '\u00A9', 0xD4: '\u2122', 0xE2: '\u00AE', 0xE3: '\u00A9', 0xE4: '\u2122' },
        // ITC Zapf Dingbats (also embedded as "Dingbats"): its standard encoding, 0x21–0x7E
        zapf: (function () {
            const t = {}, set = function (code, u) { t[code] = String.fromCharCode(u); };
            const run = function (c0, c1, u0) { for (let c = c0; c <= c1; c++) set(c, u0 + c - c0); };
            run(0x21, 0x24, 0x2701); set(0x25, 0x260E); run(0x26, 0x29, 0x2706); set(0x2A, 0x261B); set(0x2B, 0x261E);
            run(0x2C, 0x47, 0x270C); set(0x48, 0x2605); run(0x49, 0x6B, 0x2729); set(0x6C, 0x25CF); set(0x6D, 0x274D);
            set(0x6E, 0x25A0); run(0x6F, 0x72, 0x274F); set(0x73, 0x25B2); set(0x74, 0x25BC); set(0x75, 0x25C6);
            set(0x76, 0x2756); set(0x77, 0x25D7); run(0x78, 0x7E, 0x2758);
            return t;
        })()
    };
    const WORD_BULLETS = { '\uF0B7': '\u2022', '\uF0A7': '\u25AA', '\uF076': '\u2756', '\uF0D8': '\u27A2', '\uF0FC': '\u2713', '\uF0A8': '\u25FB',
                           '\uF06E': '\u25A0', '\uF071': '\u2751', '\uF0E0': '\u2192', '\uF0E8': '\u2794' };
    function dingbat(fontName, ch) {
        const n = String(fontName || '').toLowerCase().replace(/^[a-z]{6}\+/, '');
        const table = /wingdings\W*2/.test(n) ? DINGBATS.wingdings2 : /wingdings/.test(n) ? DINGBATS.wingdings :
            /^(itc)?\W*(zapf\W*)?dingbats/.test(n) ? DINGBATS.zapf : /^symbol(mt)?$/.test(n) ? DINGBATS.symbol : null;
        // Word's list bullets in the private-use area, whatever font drew them (OpenSymbol, a renamed subset)
        if (!table && ch.length === 1 && WORD_BULLETS[ch]) return WORD_BULLETS[ch];
        if (!table || ch.length !== 1) return ch;
        let c = ch.charCodeAt(0);
        if (table === DINGBATS.symbol && !(c >= 0xF000 && c <= 0xF0FF)) return ch;      // Symbol: only its private-use codes
        if (c >= 0xF000 && c <= 0xF0FF) c -= 0xF000;
        return table[c] || ch;
    }

    /**
     * The embedded font program's own description (pdf.js keeps its "name" and "OS/2" tables): full name,
     * weight, italic, fixed pitch — for fonts the PDF names without a style (Microsoft Print to PDF:
     * "CIDFont+F2" is Calibri Bold). null when the font has no such data.
     */
    const FACES = new WeakMap();
    function fontFace(f) {
        if (!f || typeof f !== 'object') return null;
        if (FACES.has(f)) return FACES.get(f);
        let face = null;
        try {
            const d = f.data;
            if (d && d.length > 12 && !f.isType3Font) {
                const v = new DataView(d.buffer, d.byteOffset, d.byteLength), n = v.getUint16(4), T = {};
                for (let k = 0; k < n && 12 + 16 * k + 16 <= d.length; k++) T[String.fromCharCode(d[12 + 16 * k], d[13 + 16 * k], d[14 + 16 * k], d[15 + 16 * k])] = v.getUint32(12 + 16 * k + 8);
                face = {};
                if (T['OS/2'] !== undefined && T['OS/2'] + 64 <= d.length) {
                    const o = T['OS/2'];
                    face.weight = v.getUint16(o + 4); face.fs = v.getUint16(o + 62); face.panose = d[o + 35];
                }
                if (T.post !== undefined && T.post + 16 <= d.length) face.fixed = v.getUint32(T.post + 12) !== 0;
                if (T.name !== undefined) {
                    const o = T.name, cnt = v.getUint16(o + 2), so = o + v.getUint16(o + 4);
                    for (let k = 0; k < cnt; k++) {
                        const r = o + 6 + 12 * k; if (r + 12 > d.length) break;
                        const pid = v.getUint16(r), nid = v.getUint16(r + 6), len = v.getUint16(r + 8), off = v.getUint16(r + 10);
                        if (nid !== 4 || face.full) continue;
                        let t = '';
                        if (pid === 3 || pid === 0) { for (let q = 0; q + 1 < len; q += 2) t += String.fromCharCode(v.getUint16(so + off + q)); }
                        else { for (let q = 0; q < len; q++) t += String.fromCharCode(d[so + off + q]); }
                        face.full = t;
                    }
                }
                if (face.weight === undefined && !face.full) face = null;
            }
        } catch (e) { face = null; }
        FACES.set(f, face);
        return face;
    }

    /**
     * An embedded TrueType / OpenType font program → { glyph id: text } of its ligatures (GSUB lookup
     * type 4, also inside type 7 extensions), the components read back through the font's cmap.
     */
    function sfntLigatures(d) {
        const v = new DataView(d.buffer, d.byteOffset, d.byteLength), out = {};
        const u16 = function (o) { return v.getUint16(o); }, u32 = function (o) { return v.getUint32(o); };
        const n = u16(4), T = {};
        for (let k = 0; k < n; k++) T[String.fromCharCode(d[12 + 16 * k], d[13 + 16 * k], d[14 + 16 * k], d[15 + 16 * k])] = u32(12 + 16 * k + 8);
        // cmap: glyph → character (format 4 and 12 of the Unicode subtables; a subset may have none — its outlines
        // still say where a mark sits and which way a bracket opens)
        const g2u = {}, cm = T.cmap, nt = cm === undefined ? 0 : u16(cm + 2);
        // (every Arabic letter that names a glyph, too: a Persian font draws ي and ی with one glyph)
        const ar = {};
        const put = function (g, c) {
            if (!g) return;
            if (!(g in g2u)) g2u[g] = String.fromCodePoint(c);
            if (c >= 0x620 && c <= 0x6FF) ar[g] = (ar[g] || '') + String.fromCharCode(c);
            if ((c >= 0x30 && c <= 0x39) || (c >= 0x660 && c <= 0x669) || (c >= 0x6F0 && c <= 0x6F9)) dig[g] = (dig[g] || '') + String.fromCharCode(c);
            // (every presentation form that names it: Arial draws reh's isolated and final forms, noon's initial and
            // medial, with one glyph — the first code alone says it does not join where it may)
            const pc = c <= 0xFFFF ? String.fromCharCode(c) : '';
            if (PF[pc] && (pfs[g] = pfs[g] || []).indexOf(pc) < 0) pfs[g].push(pc);
        };
        const pfs = {};
        Object.defineProperty(out, 'pfs', { value: pfs, enumerable: false });
        const dig = {};                          // glyph → every digit that names it (a Persian font's ۴ is 4, ٤ and ۴)
        Object.defineProperty(out, 'dig', { value: dig, enumerable: false });
        for (let k = 0; k < nt; k++) {
            const pid = u16(cm + 4 + 8 * k), eid = u16(cm + 6 + 8 * k), off = cm + u32(cm + 8 + 8 * k);
            if (!(pid === 0 || (pid === 3 && (eid === 1 || eid === 10)))) continue;
            const fmt = u16(off);
            if (fmt === 4) {
                const segs = u16(off + 6) / 2, ends = off + 14, starts = ends + 2 * segs + 2, deltas = starts + 2 * segs, ranges = deltas + 2 * segs;
                for (let sI = 0; sI < segs; sI++) {
                    const e = u16(ends + 2 * sI), st = u16(starts + 2 * sI), dl = v.getInt16(deltas + 2 * sI), ro = u16(ranges + 2 * sI);
                    for (let c = st; c <= e && c !== 0xFFFF; c++) {
                        let g;
                        if (!ro) g = (c + dl) & 0xFFFF;
                        else { const a = ranges + 2 * sI + ro + 2 * (c - st); g = a + 2 <= d.length ? u16(a) : 0; if (g) g = (g + dl) & 0xFFFF; }
                        put(g, c);
                    }
                }
            } else if (fmt === 12) {
                const ng = u32(off + 12);
                for (let q = 0; q < ng; q++) { const a = off + 16 + 12 * q, sc = u32(a), ec = u32(a + 4), sg = u32(a + 8); for (let c = sc; c <= ec && c - sc < 0x10000; c++) put(sg + c - sc, c); }
            }
        }
        const coverage = function (o) {
            const f = u16(o), gs = [];
            if (f === 1) { const c = u16(o + 2); for (let q = 0; q < c; q++) gs.push(u16(o + 4 + 2 * q)); }
            else if (f === 2) { const c = u16(o + 2); for (let q = 0; q < c; q++) { const a = o + 4 + 6 * q; for (let g = u16(a); g <= u16(a + 2); g++) gs.push(g); } }
            return gs;
        };
        const base = {};
        // a glyph's outline across, in em (glyf bounding boxes): where a mark of no advance is drawn
        const ink = function (gid) {
            try {
                if (T.head === undefined || T.loca === undefined || T.glyf === undefined) return null;
                const upem = u16(T.head + 18), long = v.getInt16(T.head + 50) === 1;
                const a = long ? u32(T.loca + 4 * gid) : 2 * u16(T.loca + 2 * gid), b = long ? u32(T.loca + 4 * gid + 4) : 2 * u16(T.loca + 2 * gid + 2);
                if (!(b > a) || !upem) return null;
                const o = T.glyf + a;
                return [v.getInt16(o + 2) / upem, v.getInt16(o + 6) / upem];
            } catch (e) { return null; }
        };
        Object.defineProperty(out, 'ink', { value: ink, enumerable: false });
        // a glyph's advance, in em (hmtx): with `ink`, whether its outline reaches its two edges — an Arabic letter's
        // joining stroke runs to the side it joins on (forms by outline, extract.js)
        const adv = function (gid) {
            try {
                if (T.head === undefined || T.hhea === undefined || T.hmtx === undefined) return null;
                const upem = u16(T.head + 18), nh = u16(T.hhea + 34);
                return upem ? u16(T.hmtx + 4 * Math.min(gid, nh - 1)) / upem : null;
            } catch (e) { return null; }
        };
        Object.defineProperty(out, 'adv', { value: adv, enumerable: false });
        // a glyph's outline points (glyf; a composite's components moved by their offsets, depth 3 at most), in font units
        const points = function (gid, depth) {
            if (T.head === undefined || T.loca === undefined || T.glyf === undefined || depth > 3) return [];
            const long = v.getInt16(T.head + 50) === 1;
            const a = long ? u32(T.loca + 4 * gid) : 2 * u16(T.loca + 2 * gid), b = long ? u32(T.loca + 4 * gid + 4) : 2 * u16(T.loca + 2 * gid + 2);
            if (!(b > a)) return [];
            const o = T.glyf + a, nc = v.getInt16(o), pts = [];
            if (nc < 0) {
                let q = o + 10, more = true;
                while (more) {
                    const fl = u16(q), cg = u16(q + 2); q += 4;
                    let dx = 0, dy = 0;
                    if (fl & 1) { dx = v.getInt16(q); dy = v.getInt16(q + 2); q += 4; } else { dx = v.getInt8(q); dy = v.getInt8(q + 1); q += 2; }
                    if (fl & 8) q += 2; else if (fl & 0x40) q += 4; else if (fl & 0x80) q += 8;
                    if (!(fl & 2)) dx = dy = 0;                       // (points matched, not offsets: no move read)
                    points(cg, depth + 1).forEach(function (pt) { pts.push([pt[0] + dx, pt[1] + dy]); });
                    more = !!(fl & 0x20);
                }
                return pts;
            }
            if (nc === 0) return pts;
            const np = u16(o + 10 + 2 * (nc - 1)) + 1;
            let q = o + 10 + 2 * nc; q += 2 + u16(q);
            const flags = [];
            while (flags.length < np) { const f = d[q++]; flags.push(f); if (f & 8) { let r = d[q++]; while (r-- > 0) flags.push(f); } }
            const xs = []; let x = 0, y = 0;
            flags.forEach(function (f) { if (f & 2) { const dx = d[q++]; x += f & 16 ? dx : -dx; } else if (!(f & 16)) { x += v.getInt16(q); q += 2; } xs.push(x); });
            flags.forEach(function (f, k) { if (f & 4) { const dy = d[q++]; y += f & 32 ? dy : -dy; } else if (!(f & 32)) { y += v.getInt16(q); q += 2; } pts.push([xs[k], y]); });
            return pts;
        };
        // which of its two edges a glyph's outline meets at the baseline (a point within 0.02 em of the edge, from 0.03 em
        // under the baseline to 0.2 em over it): an Arabic letter's joining stroke — its left edge where it joins the next
        // letter, its right where it joins the one before. A tail below the line (reh, waw, an isolated ain's) is no join
        const edges = function (gid) {
            try {
                const upem = T.head === undefined ? 0 : u16(T.head + 18), w = adv(gid);
                if (!upem || !(w > 0)) return null;
                const pts = points(gid, 0);
                if (pts.length < 3) return null;
                const A = w * upem, e = 0.02 * upem, lo = -0.03 * upem, hi = 0.2 * upem;
                const band = function (pt) { return pt[1] >= lo && pt[1] <= hi; };
                return { left: pts.some(function (pt) { return pt[0] <= e && band(pt); }), right: pts.some(function (pt) { return pt[0] >= A - e && band(pt); }) };
            } catch (e) { return null; }
        };
        Object.defineProperty(out, 'edges', { value: edges, enumerable: false });
        // a simple font's codes → glyphs: the (3,0) symbol subtable (codes at U+F000 + code, as Prince writes it) or the
        // (1,0) Macintosh one (format 0 or 6) — a one-byte font draws by these, not by Unicode
        const c2g = {};
        for (let k = 0; k < nt; k++) {
            try {
                const pid = u16(cm + 4 + 8 * k), eid = u16(cm + 6 + 8 * k), off = cm + u32(cm + 8 + 8 * k), fmt = u16(off);
                if (pid === 3 && eid === 0 && fmt === 4) {
                    const segs = u16(off + 6) / 2, ends = off + 14, starts = ends + 2 * segs + 2, deltas = starts + 2 * segs, ranges = deltas + 2 * segs;
                    for (let sI = 0; sI < segs; sI++) {
                        const e = u16(ends + 2 * sI), st = u16(starts + 2 * sI), dl = v.getInt16(deltas + 2 * sI), ro = u16(ranges + 2 * sI);
                        for (let c = st; c <= e && c !== 0xFFFF; c++) {
                            if (c < 0xF000 || c > 0xF0FF) continue;
                            let g;
                            if (!ro) g = (c + dl) & 0xFFFF;
                            else { const a = ranges + 2 * sI + ro + 2 * (c - st); g = a + 2 <= d.length ? u16(a) : 0; if (g) g = (g + dl) & 0xFFFF; }
                            if (g && !((c & 0xFF) in c2g)) c2g[c & 0xFF] = g;
                        }
                    }
                } else if (pid === 1 && eid === 0 && fmt === 6) {
                    const first = u16(off + 6), cnt = u16(off + 8);
                    for (let q = 0; q < cnt; q++) { const g = u16(off + 10 + 2 * q); if (g && !((first + q) in c2g)) c2g[first + q] = g; }
                } else if (pid === 1 && eid === 0 && fmt === 0) {
                    for (let q = 0; q < 256; q++) { const g = d[off + 6 + q]; if (g && !(q in c2g)) c2g[q] = g; }
                }
            } catch (e) { /* not this subtable */ }
        }
        Object.defineProperty(out, 'c2g', { value: c2g, enumerable: false });
        // which way a bracket-like outline opens: 'L' when its ink at mid-height lies left of its middle — the look of
        // ( [ { < « —, 'R' for the mirror look; null for a composite or empty glyph (a simple glyph's points only)
        const side = function (gid) {
            try {
                if (T.head === undefined || T.loca === undefined || T.glyf === undefined) return null;
                const long = v.getInt16(T.head + 50) === 1;
                const a = long ? u32(T.loca + 4 * gid) : 2 * u16(T.loca + 2 * gid), b = long ? u32(T.loca + 4 * gid + 4) : 2 * u16(T.loca + 2 * gid + 2);
                if (!(b > a)) return null;
                const o = T.glyf + a, nc = v.getInt16(o);
                if (nc <= 0) return null;
                const xMin = v.getInt16(o + 2), yMin = v.getInt16(o + 4), xMax = v.getInt16(o + 6), yMax = v.getInt16(o + 8);
                const np = u16(o + 10 + 2 * (nc - 1)) + 1;
                let q = o + 10 + 2 * nc; q += 2 + u16(q);
                const flags = [];
                while (flags.length < np) { const f = d[q++]; flags.push(f); if (f & 8) { let r = d[q++]; while (r-- > 0) flags.push(f); } }
                const xs = [], ys = []; let x = 0, y = 0;
                flags.forEach(function (f) { if (f & 2) { const dx = d[q++]; x += f & 16 ? dx : -dx; } else if (!(f & 16)) { x += v.getInt16(q); q += 2; } xs.push(x); });
                flags.forEach(function (f) { if (f & 4) { const dy = d[q++]; y += f & 32 ? dy : -dy; } else if (!(f & 32)) { y += v.getInt16(q); q += 2; } ys.push(y); });
                const mid = (yMin + yMax) / 2, band = 0.15 * (yMax - yMin), cx = (xMin + xMax) / 2;
                const m = xs.filter(function (_, k) { return Math.abs(ys[k] - mid) <= band; });
                if (!m.length || xMax - xMin < 10) return null;
                const mx = m.reduce(function (s2, t) { return s2 + t; }, 0) / m.length;
                return Math.abs(mx - cx) < 0.08 * (xMax - xMin) ? null : mx < cx ? 'L' : 'R';
            } catch (e) { return null; }
        };
        Object.defineProperty(out, 'side', { value: side, enumerable: false });
        Object.defineProperty(out, 'g2u', { value: g2u, enumerable: false });
        Object.defineProperty(out, 'ar', { value: ar, enumerable: false });
        Object.defineProperty(out, 'base', { value: base, enumerable: false });
        // COLR (v0) colour glyphs: each layer → its base glyph (a printer draws an emoji as its layers, one glyph each)
        const colr = {};
        Object.defineProperty(out, 'colr', { value: colr, enumerable: false });
        if (T.COLR !== undefined) {
            try {
                const c0 = T.COLR, nb = u16(c0 + 2), bo = c0 + u32(c0 + 4), lo = c0 + u32(c0 + 8);
                for (let q = 0; q < nb; q++) {
                    const r = bo + 6 * q, bg = u16(r), first = u16(r + 2), nlay = u16(r + 4);
                    for (let a = 0; a < nlay; a++) { const lg = u16(lo + 4 * (first + a)); if (!(lg in colr)) colr[lg] = { base: bg, first: a === 0 }; }
                }
            } catch (e) { /* no colour table */ }
        }
        // post (format 2) names: a glyph its cmap no longer names (a printer's trimmed copy keeps the font's
        // whole glyph set, its cmap only the characters typed) may still be called uniFE97, u1F600, uni0647.init
        if (T.post !== undefined) {
            try {
                const po = T.post;
                if (u32(po) === 0x20000) {
                    const ng = u16(po + 32), idx = [], names = [];
                    for (let q = 0; q < ng; q++) idx.push(u16(po + 34 + 2 * q));
                    let o = po + 34 + 2 * ng;
                    while (o < d.length && names.length < 65536) { const len = d[o]; if (o + 1 + len > d.length) break; names.push(String.fromCharCode.apply(null, d.subarray(o + 1, o + 1 + len))); o += 1 + len; }
                    for (let q = 0; q < ng; q++) {
                        if (idx[q] < 258 || q in g2u) continue;
                        const m = /^(?:uni([0-9A-F]{4})|u([0-9A-F]{4,6}))(?:\.|$)/.exec(names[idx[q] - 258] || '');
                        if (m) { const c = parseInt(m[1] || m[2], 16); if (c > 0x20 && c <= 0x10FFFF && !(c >= 0xD800 && c < 0xE000)) g2u[q] = String.fromCodePoint(c); }
                    }
                }
            } catch (e) { /* no names */ }
        }
        if (T.GSUB === undefined) return out;
        const gsub = T.GSUB, ll = gsub + u16(gsub + 8), nl = u16(ll);
        // the lookups of the Arabic joining features: what each makes is an initial, medial or final form
        const lkRole = {};
        try {
            const fl = gsub + u16(gsub + 6), nf = u16(fl);
            for (let q = 0; q < nf; q++) {
                const tag = String.fromCharCode(d[fl + 2 + 6 * q], d[fl + 3 + 6 * q], d[fl + 4 + 6 * q], d[fl + 5 + 6 * q]);
                const role = { init: 2, medi: 3, fina: 1 }[tag];
                if (role === undefined) continue;
                const ft = fl + u16(fl + 6 + 6 * q), nlk = u16(ft + 2);
                for (let a = 0; a < nlk; a++) lkRole[u16(ft + 4 + 2 * a)] = role;
            }
        } catch (e) { /* no features */ }
        const formOf = {};
        for (let k = 0; k < nl; k++) {
            const lk = ll + u16(ll + 2 + 2 * k);
            let type = u16(lk); const nsub = u16(lk + 4);
            for (let q = 0; q < nsub; q++) {
                let st = lk + u16(lk + 6 + 2 * q), t = type;
                if (t === 7) { t = u16(st + 2); st = st + u32(st + 4); }
                if (t === 1 || t === 3) {                                  // single / alternate: variant → its base glyph
                    const fmt = u16(st), cov = coverage(st + u16(st + 2));
                    const role = t === 1 ? lkRole[k] : undefined;
                    if (t === 1 && fmt === 1) { const dl = v.getInt16(st + 4); cov.forEach(function (g) { const s2 = (g + dl) & 0xFFFF; if (s2 !== g && role !== undefined && !(s2 in formOf)) formOf[s2] = role; if (!(s2 in base)) base[s2] = g; }); }
                    else if (t === 1 && fmt === 2) { const c = u16(st + 4); for (let a = 0; a < c && a < cov.length; a++) { const s2 = u16(st + 6 + 2 * a); if (s2 !== cov[a] && role !== undefined && !(s2 in formOf)) formOf[s2] = role; if (!(s2 in base)) base[s2] = cov[a]; } }
                    else if (t === 3 && fmt === 1) { const c = u16(st + 4); for (let a = 0; a < c && a < cov.length; a++) { const set = st + u16(st + 6 + 2 * a), na = u16(set); for (let b = 0; b < na; b++) { const s2 = u16(set + 2 + 2 * b); if (!(s2 in base)) base[s2] = cov[a]; } } }
                    continue;
                }
                if (t !== 4 || u16(st) !== 1) continue;
                const firsts = coverage(st + u16(st + 2)), nset = u16(st + 4);
                for (let a = 0; a < nset && a < firsts.length; a++) {
                    const set = st + u16(st + 6 + 2 * a), nlig = u16(set);
                    for (let b = 0; b < nlig; b++) {
                        const lg = set + u16(set + 2 + 2 * b), glyph = u16(lg), nc = u16(lg + 2);
                        const comps = [firsts[a]]; for (let c = 1; c < nc; c++) comps.push(u16(lg + 4 + 2 * (c - 1)));
                        if (comps.every(function (g) { return g in g2u; }) && !(glyph in out)) out[glyph] = comps.map(function (g) { return g2u[g]; }).join('');
                    }
                }
            }
        }
        // a joining form with no name at all (a calligraphic font's ه initial, ح medial): fonts lay their Arabic
        // glyphs out in the order of the presentation forms block, so the named forms around it say which it is —
        // counted from the nearest named glyph on either side, and kept only when the form that gives is the one
        // the font's own init / medi / fina lookup makes (and both sides do not disagree)
        const anchors = [];
        Object.keys(g2u).forEach(function (k) {
            const c = g2u[k], f = PF[c] ? c : ISOLATED[c];
            if (f) anchors.push([+k, f.charCodeAt(0)]);
        });
        anchors.sort(function (a, b) { return a[0] - b[0]; });
        if (anchors.length >= 2) {
            Object.keys(formOf).forEach(function (k) {
                const g = +k;
                if (g in g2u) return;
                let lo = 0, hi = anchors.length - 1;
                while (lo <= hi) { const mid = (lo + hi) >> 1; if (anchors[mid][0] < g) lo = mid + 1; else hi = mid - 1; }
                const cands = [];
                [anchors[lo - 1], anchors[lo]].forEach(function (a) {
                    if (!a || Math.abs(a[0] - g) > 24) return;
                    const c = String.fromCharCode(a[1] + g - a[0]), pf = PF[c];
                    if (pf && pf[1] === formOf[g]) cands.push(c);
                });
                if (cands.length && cands.every(function (c) { return c === cands[0]; })) g2u[g] = cands[0];
            });
        }
        return out;
    }

    /** Presentation forms → letters (NFKC on those ranges only: ² \uFB01 … stay as they are). */
    function nfkcArabic(t) { return t.replace(/[\uFB00-\uFB06\uFB50-\uFDFF\uFE70-\uFEFF]/g, function (c) { return c.normalize('NFKC'); }); }

    /**
     * Alignment of a table column from its body cells' text extents ({x0, x1}): 'right' when the right
     * edges line up and the left edges do not, 'center' when only the centres line up, else ''.
     */
    function columnAlign(cells, head, rtl, loose) {
        if (cells.length < 2) return '';
        // (loose: an OCR layer's cells, placed by their ink — a figure's full stop read in, «3.», moves its end 2–3 pt)
        const k = loose ? 2 : 1;
        // a column's own direction (its letters), else the table's: each cell starts on its own side
        const sR = cells.reduce(function (a, c) { return a + (c.R || 0); }, 0), sL = cells.reduce(function (a, c) { return a + (c.L || 0); }, 0);
        if (sR !== sL) rtl = sR > sL;
        if (rtl) {
            // right to left: flush right is the start (no mark); flush left is the explicit end alignment
            const a = columnAlign(cells.map(function (c) { return { x0: -c.x1, x1: -c.x0 }; }), head && { x0: -head.x1, x1: -head.x0 }, false, loose);
            return a === 'right' ? 'left' : a;
        }
        const spread = function (list, f) { const v = list.map(f); return Math.max.apply(null, v) - Math.min.apply(null, v); };
        const x0 = function (c) { return c.x0; }, x1 = function (c) { return c.x1; }, xc = function (c) { return (c.x0 + c.x1) / 2; };
        let sl = spread(cells, x0), sr = spread(cells, x1), sc = spread(cells, xc);
        // body cells all alike ("-79%", "-94%"): the header, when it lines up with them on one side, tells
        // (right only: browsers centre a header cell by default)
        if (sl <= 2.5 * k && sr < 1.5 * k && head) { const all = cells.concat([head]); return spread(all, x1) < 1.5 * k && spread(all, x0) > 2.5 * k ? 'right' : ''; }
        if (sr < 1.5 * k && sl > 2.5 * k) return 'right';
        if (sc < 1.5 * k && sl > 2.5 * k && sr > 2.5 * k) return 'center';
        return '';
    }

    /** x-extent, size, strong-character counts and style shares of a line. */
    function finishLine(L, pageNum) {
        // a space drawn under a glyph's ink — the reader sees no gap there (PDFIMPORT.md §6, "A space under ink"):
        //   · Acrobat's PDFMaker draws a space glyph at the very origin of the letter before it, under it («ورزش‌شناسی»
        //     read «ورز ش‌شناسی», «وضعیت» «وضعی ت»: a word's last letter set apart);
        //   · Word draws an isolated yeh after waw over a space of its own («نیروی» read «نیرو ی»), a date's «/» over one
        //     («1403/02/08» read «08/ 02/ 1403»).
        // A space four fifths covered by the ink box of a glyph beside it (two places either way) goes.
        if (L.glyphs.some(function (g) { return g.space; })) L.glyphs = L.glyphs.filter(function (g, i, gs) {
            if (!g.space || g.atom || !(g.w > 0)) return true;
            const near = gs.slice(Math.max(0, i - 2), i + 3);
            return !near.some(function (o) {
                // (a letter of a right-to-left script, a digit or a separator: a symbol's box — LibreOffice's «₿» from a
                // fallback font — may run over the gap after it, which the reader sees)
                if (o === g || o.space || o.atom || !o.ch || !(o.w > 0) || !(R_CH.test(o.ch) || /^[0-9\u0660-\u0669\u06F0-\u06F9\/.\-:\u060C,]$/.test(o.ch))) return false;
                const cov = Math.min(o.x + o.w, g.x + g.w) - Math.max(o.x, g.x);
                return cov >= 0.8 * g.w;
            });
        });
        const vis = L.glyphs.filter(function (g) { return !g.space; });
        L.x0 = vis.length ? Math.min.apply(null, vis.map(function (g) { return g.x; })) : 0;
        L.x1 = vis.length ? Math.max.apply(null, vis.map(function (g) { return g.x + g.w; })) : 0;
        const text = vis.filter(function (g) { return !g.atom && /\S/.test(g.ch); });
        const prose = text.filter(function (g) { return !g.mono; });
        const sizes = (prose.length ? prose : text).map(function (g) { return g.size; });
        if (sizes.length) L.size = mode(sizes, 2);
        L.top = L.y + L.size * 0.8; L.bottom = L.y - L.size * 0.25;
        if (pageNum) L.page = pageNum;
        const strong = { R: 0, L: 0 };
        vis.forEach(function (g) { if (g.atom) return; const t = charType(g.ch.charAt(0)); if (t === 'R' || t === 'L') strong[t]++; });
        L.strong = strong;
        const n = vis.length || 1;
        L.boldShare = vis.filter(function (g) { return g.bold; }).length / n;
        L.monoShare = vis.filter(function (g) { return g.mono; }).length / n;
        L.italicShare = vis.filter(function (g) { return g.italic; }).length / n;
        return L;
    }

    // ── ActualText (marked content) ────────────────────────────────────
    // pdf.js keeps a /Span's MCID, not its /ActualText — the text a producer gives for glyphs it could
    // not map (Chrome: list numbers, minus and dash signs of variable fonts). Read from the page's own
    // content stream: the n-th BDC there is the n-th beginMarkedContentProps of the operator list.
    function latin1(u8) {
        let s = '';
        for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
        return s;
    }
    /** a PDF string (literal "(…)" or hex "<…>") at s[i] → [text, end] */
    function pdfString(s, i) {
        let bytes = [];
        if (s[i] === '(') {
            let depth = 1; i++;
            while (i < s.length && depth) {
                const c = s[i];
                if (c === '\\') {
                    const d = s[i + 1];
                    if (/[0-7]/.test(d)) { let o = d, k = i + 2; while (k < i + 4 && /[0-7]/.test(s[k])) o += s[k++]; bytes.push(parseInt(o, 8) & 255); i = k; continue; }
                    const map = { n: 10, r: 13, t: 9, b: 8, f: 12 };
                    if (d === '\r' || d === '\n') { i += (d === '\r' && s[i + 2] === '\n') ? 3 : 2; continue; }
                    bytes.push(map[d] !== undefined ? map[d] : d.charCodeAt(0)); i += 2; continue;
                }
                if (c === '(') depth++;
                else if (c === ')') { depth--; if (!depth) { i++; break; } }
                bytes.push(c.charCodeAt(0) & 255); i++;
            }
        } else if (s[i] === '<') {
            const e = s.indexOf('>', i), h = s.slice(i + 1, e < 0 ? s.length : e).replace(/[^0-9A-Fa-f]/g, '');
            for (let k = 0; k < h.length; k += 2) bytes.push(parseInt((h.substr(k, 2) + '0').slice(0, 2), 16));
            i = e < 0 ? s.length : e + 1;
        } else return [null, i];
        let t = '';
        if (bytes[0] === 0xFE && bytes[1] === 0xFF) { for (let k = 2; k + 1 < bytes.length; k += 2) t += String.fromCharCode(bytes[k] << 8 | bytes[k + 1]); }
        else t = String.fromCharCode.apply(null, bytes);
        return [t, i];
    }
    /** the ActualText of every BDC of a content stream, in order (null where it has none) */
    function markedTexts(s) {
        const out = [];
        let i = 0, dict = null;
        const n = s.length, WS = /[\s\0]/, DELIM = /[\s\0()<>\[\]{}\/%]/;
        while (i < n) {
            const c = s[i];
            if (WS.test(c)) { i++; continue; }
            if (c === '%') { while (i < n && s[i] !== '\n' && s[i] !== '\r') i++; continue; }
            if (c === '(') { i = pdfString(s, i)[1]; continue; }
            if (c === '<' && s[i + 1] === '<') {
                const start = i; let depth = 0;
                while (i < n) {
                    if (s[i] === '<' && s[i + 1] === '<') { depth++; i += 2; }
                    else if (s[i] === '>' && s[i + 1] === '>') { depth--; i += 2; if (!depth) break; }
                    else if (s[i] === '(' || s[i] === '<') i = pdfString(s, i)[1];
                    else i++;
                }
                dict = s.slice(start, i); continue;
            }
            if (c === '<') { i = pdfString(s, i)[1]; continue; }
            if (c === '[' || c === ']' || c === '{' || c === '}') { i++; continue; }
            let j = i + 1; while (j < n && !DELIM.test(s[j])) j++;
            const tok = s.slice(i, j); i = j;
            if (c === '/' || /^[-+.\d]/.test(tok)) continue;      // a name or a number: an operand
            if (tok === 'BDC') {
                let t = null;
                const k = dict ? dict.indexOf('/ActualText') : -1;
                if (k >= 0) { let m = k + 11; while (m < dict.length && WS.test(dict[m])) m++; t = pdfString(dict, m)[0]; }
                out.push(t);
            } else if (tok === 'ID') {                               // inline image data: up to EI
                const e = s.indexOf('EI', i); i = e < 0 ? n : e + 2;
            }
            dict = null;                                              // an operator ends its operands
        }
        return out;
    }

    // ── provenance: who made this PDF, on what, by which path ──────────
    // A pure function of what the file says about itself (Info, XMP) and what it shows (fonts, invisible
    // text): no layout rule reads a producer name (PDFIMPORT.md §1, "No producer switch"); the profile is
    // evidence — a prior for ambiguous decisions, a key for the test matrix, a line for the user.
    // Every conclusion carries its evidence; an OS read from the file itself (a browser's User-Agent,
    // Quartz's "macOS Version", InDesign's "(Macintosh)") is near certain, one read from fonts is a hint.
    const ENGINES = [
        // [engine, test on "Producer | Creator", app (string or function of the match), path]
        ['skia', /Skia\/PDF\s*(m\d+)?/i, function (s) { return /Google Docs/i.test(s) ? 'Google Docs' : /Google Slides/i.test(s) ? 'Google Slides' : /Google Sheets/i.test(s) ? 'Google Sheets' : null; }, 'export'],
        // a desktop Chrome / Edge writes its User-Agent as Creator: Skia, even when a later tool rewrote Producer
        ['skia', /Mozilla\/5\.0 \([^)]*\).*(?:Chrome|Edg|OPR)\//, null, 'export'],
        ['quartz', /Quartz PDFContext|Mac OS X [\d.]+ Quartz|macOS Version|iOS Version|iPadOS Version/i, null, null],
        ['gdi', /Microsoft:\s*Print To PDF/i, 'Microsoft Print to PDF', 'print'],
        ['word', /Microsoft[®\s]*(Office )?Word/i, 'Word', 'export'],
        ['excel', /Microsoft[®\s]*(Office )?Excel/i, 'Excel', 'export'],
        ['powerpoint', /Microsoft[®\s]*(Office )?PowerPoint/i, 'PowerPoint', 'export'],
        ['libreoffice', /LibreOffice|OpenOffice|NeoOffice/i, function (s) { const m = s.match(/\|\s*(Writer|Calc|Impress|Draw|Math)\b/); return m ? m[1] : 'LibreOffice'; }, 'export'],
        ['wps', /\bWPS\b|Kingsoft/i, 'WPS Office', 'export'],
        ['qt', /\bQt [\d.]+|wkhtmltopdf/i, function (s) { return /wkhtmltopdf/i.test(s) ? 'wkhtmltopdf' : 'Qt'; }, 'export'],
        ['jspdf', /jsPDF/i, 'jsPDF', 'export'],
        ['tex', /pdfTeX|XeTeX|xdvipdfmx|LuaTeX|dvipdfm|LaTeX|ConTeXt|Tectonic/i, function (s) { const m = s.match(/pdfTeX|XeTeX|xdvipdfmx|LuaTeX|dvipdfmx?|ConTeXt|Tectonic/i); return m ? m[0] : 'TeX'; }, 'export'],
        ['indesign', /InDesign/i, 'InDesign', 'export'],
        ['distiller', /Acrobat Distiller|PDFMaker/i, function (s) { const m = s.match(/PDFMaker [\d.]+ for (\w+)/i); return m ? m[1] : 'Distiller'; }, 'print'],
        ['cairo', /\bcairo\b/i, function (s) { return /Firefox|Mozilla/i.test(s) ? 'Firefox' : null; }, null],
        ['weasyprint', /WeasyPrint/i, 'WeasyPrint', 'export'],
        ['prince', /Prince\b/i, 'Prince', 'export'],
        ['reportlab', /ReportLab/i, 'ReportLab', 'export'],
        ['fop', /Apache FOP/i, 'Apache FOP', 'export'],
        ['itext', /iText/i, 'iText', 'export'],
        ['ghostscript', /Ghostscript/i, 'Ghostscript', 'print'],
        ['ocr', /ABBYY|FineReader|OCRmyPDF|Tesseract|ScanSnap|Readiris|OmniPage/i, null, 'ocr']
    ];
    // tools that rewrite a PDF made elsewhere: their name in Producer hides the maker, Creator usually keeps it
    // (not "Adobe PDF Library": InDesign, Illustrator and PDFMaker write it as their own Producer)
    const POST = /Ghostscript|iLovePDF|Smallpdf|qpdf|pikepdf|PyPDF|pypdf|PDFium|Foxit|Nitro|PDF-XChange|Acrobat Pro|Adobe Acrobat \d|iText|Sejda|PDFsam|OCRmyPDF|PDF24|Preview\b/i;
    // fonts that come with one OS only (not with an office suite installed elsewhere: Calibri, Cambria … say Office, not Windows)
    const OS_FONTS = [
        ['windows', /^(Segoe ?UI|SegoeUI|Segoe ?Print|Segoe ?Script|MicrosoftSansSerif|Microsoft ?Sans ?Serif|Tahoma|MS ?Gothic|MS ?Mincho|Yu ?Gothic|Malgun|Ebrima|Gadugi|Nirmala|Leelawadee|Myanmar ?Text|SimSun|Microsoft ?YaHei|Sylfaen|Aldhabi|Urdu ?Typesetting)/i],
        ['macos', /^(\.?SF ?Pro|\.SFNS|SFNS|\.AppleSystem|Helvetica ?Neue|Lucida ?Grande|Geeza ?Pro|Menlo|Apple ?Color ?Emoji|PingFang|Hiragino|Avenir ?Next|San ?Francisco|Al ?Bayan|Baghdad|Nadeem|Damascus|Farah|Kohinoor)/i],
        ['linux', /^(DejaVu|Ubuntu|Cantarell|Noto ?Sans ?Mono|Bitstream ?Vera|FreeSans|FreeSerif|Nimbus|URW|Droid)/i]
    ];

    // the structure part of the profile: what the tree is and how far it can be trusted (PdfImporter._structure)
    function tagInfo(m) {
        const s = m.structure;
        if (!s) return { marked: !!m.marked, structTree: m.structTree === undefined ? null : !!m.structTree, cover: null, sem: null, trust: null };
        return { marked: !!m.marked, structTree: !!s.tree,
                 cover: s.chars ? +(s.covered / s.chars).toFixed(3) : 0, sem: s.chars ? +(s.sem / s.chars).toFixed(3) : 0,
                 trust: s.trust, roles: s.roles, headings: s.headings };
    }

    function provenance(m) {
        const producer = String(m.producer || ''), creator = String(m.creator || ''), xmp = String(m.xmp || '');
        const xget = function (tag) { const r = xmp.match(new RegExp('<' + tag + '>([^<]*)</' + tag + '>|' + tag + '="([^"]*)"')); return r ? (r[1] || r[2] || '').trim() : ''; };
        const xProducer = xget('pdf:Producer'), xTool = xget('xmp:CreatorTool');
        const agents = []; xmp.replace(/stEvt:softwareAgent(?:>|=")([^<"]+)/g, function (_, a) { if (agents.indexOf(a.trim()) < 0) agents.push(a.trim()); return _; });
        const all = [producer, creator, xProducer, xTool].concat(agents).filter(Boolean).join(' | ');
        const p = {
            producer: producer || xProducer, creator: creator || xTool, pdfVersion: m.pdfVersion || null,
            engine: 'unknown', app: null, version: null, path: 'unknown', postprocessors: [],
            os: { value: null, confidence: 0, evidence: [] }, lang: m.lang || null,
            tagged: tagInfo(m),
            outline: m.outline || 0, pageLabels: !!m.pageLabels, fonts: m.fonts ? m.fonts.length : 0,
            text: { invisible: m.invisibleShare || 0, type3: m.type3Share || 0 }
        };
        // the maker: Creator (the application) before Producer (often the library or a post-processor)
        const pick = function (s) {
            for (let i = 0; i < ENGINES.length; i++) { const e = ENGINES[i], r = s.match(e[1]); if (r) return { e: e, r: r }; }
            return null;
        };
        const fromProd = pick([producer, xProducer].join(' | ')), fromCreator = pick([creator, xTool].join(' | '));
        let hit = fromProd;
        // a post-processor in Producer, the maker in Creator: the maker wins, the tool is recorded
        if (fromProd && POST.test(producer || xProducer) && fromCreator && fromCreator.e[0] !== fromProd.e[0]) hit = fromCreator;
        if (!hit) hit = fromCreator;
        // Office on a Mac prints through Quartz: Quartz in Producer, Word in Creator — the engine is Quartz, the app Word
        if (hit) {
            const e = hit.e; p.engine = e[0];
            const app = typeof e[2] === 'function' ? e[2](all) : e[2];
            p.app = app || null; p.path = e[3] || 'unknown';
            const v = (producer + ' ' + creator).match(e[1]); p.version = v && v[1] && /\d/.test(v[1]) ? v[1] : null;
        }
        if (p.engine === 'quartz') { const c = pick(creator || xTool || ''); p.app = c ? (typeof c.e[2] === 'function' ? c.e[2](creator) : c.e[2]) : (creator || null); }
        if (!p.app && creator) p.app = creator.replace(/\s*\(.*$/, '').slice(0, 60);
        [producer, xProducer].concat(agents).forEach(function (s) { const r = s && s.match(POST); if (r && p.postprocessors.indexOf(r[0]) < 0 && !(hit && hit.e[1].test(s) && hit === fromProd)) p.postprocessors.push(r[0]); });
        if (p.postprocessors.length && p.path !== 'ocr') p.path = 'postprocessed';
        if (p.text.invisible > 0.5) p.path = 'ocr';            // text drawn invisible over a picture: an OCR layer

        // the browser, from Chrome's / Edge's User-Agent in Creator (desktop "Save as PDF")
        const ua = creator.match(/Mozilla\/5\.0 \(([^)]*)\)/);
        if (ua) {
            p.app = /Edg\//.test(creator) ? 'Edge' : /OPR\//.test(creator) ? 'Opera' : /HeadlessChrome/.test(creator) ? 'Chrome (headless)' : /Chrome\//.test(creator) ? 'Chrome' : p.app;
            const cv = creator.match(/(?:Edg|Chrome|OPR)\/([\d.]+)/); if (cv) p.version = cv[1];
        } else if (p.engine === 'skia' && !p.app) p.app = /HeadlessChrome/i.test(creator) ? 'Chrome (headless)' : /Chromium/i.test(creator) ? 'Chromium' : 'Chrome / Edge';

        // the OS: said by the file (near certain), else the fonts (a hint)
        const os = p.os, say = function (v, c, ev) { if (c > os.confidence) { os.value = v; os.confidence = c; } os.evidence.push(ev); };
        if (ua) {
            const u = ua[1];
            if (/Windows NT/.test(u)) say('windows', 0.95, 'User-Agent: ' + u);
            else if (/iPhone|iPad/.test(u)) say('ios', 0.95, 'User-Agent: ' + u);
            else if (/Mac OS X|Macintosh/.test(u)) say('macos', 0.95, 'User-Agent: ' + u);
            else if (/Android/.test(u)) say('android', 0.95, 'User-Agent: ' + u);
            else if (/CrOS/.test(u)) say('chromeos', 0.95, 'User-Agent: ' + u);
            else if (/Linux|X11/.test(u)) say('linux', 0.9, 'User-Agent: ' + u);
        }
        const q = all.match(/(macOS|Mac OS X|iOS|iPadOS) Version ([\d.]+)|Mac OS X ([\d.]+)/);
        if (q) say(/^i/.test(q[1] || '') ? 'ios' : 'macos', 0.95, 'Quartz: ' + q[0]);
        const plat = all.match(/\((Macintosh|Windows)\)/);
        if (plat) say(plat[1] === 'Windows' ? 'windows' : 'macos', 0.9, 'platform in the tool name: ' + plat[0]);
        if (p.engine === 'gdi') say('windows', 0.95, 'Microsoft Print to PDF exists on Windows only');
        if (/for Mac\b|Mac OS/i.test(all) && !q) say('macos', 0.8, 'tool name: "' + (all.match(/[^|]*(for Mac\b|Mac OS)[^|]*/i) || [''])[0].trim() + '"');
        if (/Windows/i.test(all) && !plat && !ua && p.engine !== 'gdi') say('windows', 0.6, 'tool name mentions Windows');
        // (fonts that travel with the tool say nothing about the OS: jsPDF / Kelk embed their own, TeX its own)
        const votes = {}; const seen = {};
        (/^(jspdf|tex)$/.test(p.engine) ? [] : m.fonts || []).forEach(function (n) {
            const base = String(n).replace(/^[A-Z]{6}\+/, '').replace(/[,-].*$/, '');
            OS_FONTS.forEach(function (o) { if (o[1].test(base) && !seen[o[0] + base]) { seen[o[0] + base] = 1; (votes[o[0]] = votes[o[0]] || []).push(base); } });
        });
        Object.keys(votes).forEach(function (k) {
            const v = votes[k];
            // a font hint: weaker for Linux (LibreOffice ships DejaVu and Liberation everywhere)
            const c = Math.min(0.7, (v.length >= 2 ? 0.55 : 0.4) - (k === 'linux' && p.engine === 'libreoffice' ? 0.2 : 0));
            say(k, c, 'fonts: ' + v.slice(0, 4).join(', '));
        });
        if (os.value) os.confidence = +os.confidence.toFixed(2);
        // does the maker hyphenate by itself? browsers and office suites do not (a line-end hyphen is real);
        // TeX, InDesign … do — unknown makers are taken to (as before)
        p.hyphenates = !/^(skia|quartz|gdi|word|excel|powerpoint|libreoffice|wps|qt|jspdf|cairo)$/.test(p.engine) &&
            !/skia|chrom|qt\b|wkhtml|microsoft|word|excel|powerpoint|libreoffice|openoffice|google|jspdf|kelk|quartz|safari|webkit|firefox|mozilla|cairo|wps/i.test(producer + ' ' + creator);
        return p;
    }

    class PdfImporter {
        constructor(options) {
            this.options = Object.assign({}, DEFAULTS, options || {});
            this.messages = [];
        }
        static create(options) { return new PdfImporter(options); }
        static isAvailable() { return !!(global.pdfjsLib && global.pdfjsLib.getDocument) && PdfImporter.missingParts().length === 0; }
        /** the parts of lib/pdfimport/ not loaded (a method each part adds stands for it). */
        static missingParts() {
            const probe = { thresholds: '_t', calibration: '_calibrate', extract: '_extractPage', lines: '_lines', regions: '_layout', order: '_pageBlocks', blocks: '_toHtml' };
            return PdfImporter.PARTS.filter(function (p) { return typeof PdfImporter.prototype[probe[p]] !== 'function'; });
        }

        /**
         * @param {ArrayBuffer|Uint8Array} buffer
         * @param {{onProgress?: function(number, number)}} [hooks]
         * @returns {Promise<{markdown:string, html:string, messages:string[], notes:string[], source:string}>}
         *   notes: codes for the page to translate — 'noText' (a scan, or text as outlines), 'pageLimit', 'figureFailed', 'kelkSource',
         *   'printNoLinks' (Microsoft Print to PDF: links not in the file), 'ocrLayer' (the text is an OCR layer over scans),
         *   'pageFailed' (pages that could not be read or laid out: r.failedPages; the others were),
         *   'watermarkDropped' (a watermark drawn as text — «CONFIDENTIAL DRAFT» across the page — was left out; the
         *   message names its words and pages)
         *   A PDF that cannot be opened rejects with an Error whose .code is 'password' (a user password is
         *   needed), 'invalid' (damaged / not a PDF) or 'open'; options.signal aborted: 'aborted'.
         */
        async fromArrayBuffer(buffer, hooks) {
            const lib = global.pdfjsLib;
            if (!lib) throw new Error('PdfImporter needs pdf.js (vendor/pdfjs/pdf.min_*.js + pdf.worker.min_*.js)');
            const missing = PdfImporter.missingParts();
            if (missing.length) throw new Error('PdfImporter needs lib/pdfimport/' + missing.join('.js, ') + '.js (loaded after lib/PdfImporter.js)');
            this.messages = []; this.notes = []; this._imageCount = 0; this._quality = [];
            this._rulesStart(); this._cal = null;
            const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
            this._raw = data.slice(0); this._rawIndex = null;      // pdf.js may take over the buffer
            const task = lib.getDocument({ data: data, password: this.options.password, fontExtraProperties: true, isEvalSupported: false,
                                           disableFontFace: true, useSystemFonts: false, verbosity: 0,
                                           // image decoders (JPEG 2000, JBIG2) from local scripts, never fetched
                                           BinaryDataFactory: this._binaryDataFactory(), useWorkerFetch: false,
                                           useWasm: true, wasmUrl: 'kelk-pdfjs-wasm/' });
            let doc;
            try { doc = await task.promise; }
            catch (e) {
                // a clear code for the page to translate: 'password' (encrypted with a user password), 'invalid'
                const err = new Error(e && e.message || String(e));
                err.code = e && e.name === 'PasswordException' ? 'password' : e && (e.name === 'InvalidPDFException' || e.name === 'FormatError') ? 'invalid' : 'open';
                err.cause = e;
                throw err;
            }
            try {
                const own = await this._kelkSource(doc);
                // the producer: a browser or an office suite does not hyphenate words by itself (a hyphen at
                // a line end is a real one); TeX, InDesign … do
                try {
                    const meta = await doc.getMetadata();
                    const info = meta.info || {};
                    this._meta = { producer: info.Producer, creator: info.Creator, pdfVersion: info.PDFFormatVersion || null,
                                   xmp: meta.metadata && meta.metadata.getRaw ? meta.metadata.getRaw() : '' };
                    this._producer = String(info.Producer || '') + ' ' + String(info.Creator || '');
                    // document language (BCP-47): Chrome/Edge set "en", Word "fa"/"en", LibreOffice "en-US", …
                    this._lang = (typeof info.Language === 'string' && info.Language) || '';
                    // tagged PDF: MarkInfo.Marked means the producer wrote a structure tree (headings, lists, tables …)
                    try { const mi = await doc.getMarkInfo(); this._tagged = !!(mi && mi.get('Marked')); } catch (e2) { this._tagged = false; }
                    // outline (bookmarks): heading titles the producer recorded — used later to confirm heading detection
                    try {
                        const ol = await doc.getOutline();
                        this._outline = ol ? ol.map(function walk(e) { return { title: e.title, items: e.items ? e.items.map(walk) : [] }; }) : [];
                    } catch (e2) { this._outline = []; }
                    try { const pl = await doc.getPageLabels(); this._meta.pageLabels = !!(pl && pl.some(function (l, i) { return l !== String(i + 1); })); } catch (e2) { /* none */ }
                } catch (e) { this._producer = ''; this._lang = ''; this._tagged = false; this._outline = []; this._meta = {}; }
                this._profile = this._provenance(null);
                if (own !== null) return this._rulesFinish({ markdown: own, html: '', messages: this.messages, notes: this.notes, source: 'kelk', producer: this._producer, lang: this._lang, tagged: this._tagged, profile: this._profile });

                const n = Math.min(doc.numPages, this.options.maxPages);
                if (doc.numPages > n) this._note('pageLimit', 'Only the first ' + n + ' pages were read.');
                // the formulas Kelk wrote with their TeX (an XMP map, §3): put back as formulas, not read from their vectors
                this._mathMap = this._kelkMath((this._meta && this._meta.xmp) || '');
                const pages = [];
                for (let i = 1; i <= n; i++) {
                    // one page that cannot be read does not cost the others: it stays empty, and the reader is told
                    try { pages.push(await this._extractPage(doc, i)); }
                    catch (e) { if (e && e.code === 'aborted') throw e; pages.push(this._emptyPage(i, e)); }
                    if (hooks && hooks.onProgress) hooks.onProgress(i, n);
                    await this._yield();
                }
                if (this._mathMap) this._mathIn(pages);
                try { await this._gsubRepair(pages); } catch (e) { /* the width solver tries next */ }
                try { await this._outlineJoins(pages); } catch (e) { this._joinsBy = {}; }
                this._repairUnmapped(pages);
                this._ornaments(pages);
                this._formsByOrder(pages);
                const fonts = this._classifyFonts(pages);
                // the document's own measures (calibration.js): recorded for every stage, read through this._t()
                this._cal = this._calibrate(pages, fonts);
                // a Persian document: the letters only Persian (and Urdu) write — پ چ ژ گ —, three or more and not lost
                // among the Arabic-script letters (an Arabic text with one loan word is no Persian one)
                (function (self) {
                    let pe = 0, ar = 0, la = 0;
                    pages.forEach(function (p) { p.glyphs.forEach(function (g) { const c = nfkcArabic(g.ch || ''); if (/[پچژگ]/.test(c)) pe++; if (/[\u0620-\u064A\u066E-\u06D3]/.test(c)) ar++; else if (/[A-Za-z\u00C0-\u024F]/.test(c)) la++; }); });
                    self._persianDoc = pe >= 3 && pe >= 0.003 * ar;
                    // (a right-to-left document: more Arabic-script letters than Latin ones, all pages taken together)
                    self._rtlDoc = ar > la;
                })(this);
                this._fonts = fonts;
                // 0.5 provenance, completed with what the pages show (fonts, invisible text, a structure tree)
                // 0.6 structure: the producer's structure tree onto the glyphs, and how far it can be trusted
                this._structInfo = await this._structure(pages);
                this._profile = this._provenance(pages, fonts, this._structInfo);
                // how the file is drawn (r.features): evidence only, as the profile is — no layout rule reads it
                try { this._featureSet = this._features(pages, fonts, this._structInfo); } catch (e) { this._featureSet = null; }
                const blocks = await this._layout(pages, fonts);
                const html = this._toHtml(blocks);
                const textChars = pages.reduce(function (s, p) { return s + p.glyphs.filter(function (g) { return !g.space; }).length; }, 0);
                // a watermark drawn as text was left out of the text (_watermark): what it said, and where
                const marked = pages.filter(function (p) { return p && p.watermark && p.watermark.length; });
                if (marked.length) {
                    const said = Array.from(new Set([].concat.apply([], marked.map(function (p) { return p.watermark; })))).slice(0, 3);
                    this._note('watermarkDropped', 'A watermark drawn as text («' + said.join('», «') + '») was left out of the text (page' +
                        (marked.length > 1 ? 's ' : ' ') + marked.map(function (p) { return p.num; }).join(', ') + ').');
                }
                if (textChars < 20 * n) this._note('noText', 'This PDF has little or no text layer (a scan, or text drawn as outlines, as Microsoft Print to PDF can do) — OCR is not part of the importer yet.');
                // what the provenance tells the reader (codes translated by the page: scripts/importer.js)
                const pr = this._profile || {};
                if (pr.engine === 'gdi') this._note('printNoLinks', 'This PDF was made by Microsoft Print to PDF, which drops links: they are not in the file.');
                if (pr.path === 'ocr' && this.notes.indexOf('noText') < 0) this._note('ocrLayer', 'The text of this PDF is an OCR layer over scanned pages: its words and layout are as good as that OCR was.');
                const qualityFlags = this._qualityNotes();
                const md = await this._markdownChunked(html);
                return this._rulesFinish({ markdown: md, html: html, messages: this.messages, notes: this.notes, source: 'layout', producer: this._producer, lang: this._lang, tagged: this._tagged, profile: this._profile,
                         features: this._featureSet,
                         quality: { pages: this._quality || [], flags: qualityFlags },
                         structure: this._structInfo && this._structInfo.tree ? this._structInfo.elements : null,
                         failedPages: Array.from(new Set(this._failedPages || [])).sort(function (a, b) { return a - b; }) });
            } finally {
                try { await task.destroy(); } catch (e) { /* ignore */ }
            }
        }

        /** The provenance profile (PDFIMPORT.md §2a): the file's own words (Info, XMP) and, once the pages are read, what they show. */
        _provenance(pages, fonts, structure) {
            const m = Object.assign({}, this._meta || {}, { lang: this._lang, marked: this._tagged, outline: (this._outline || []).length, structure: structure });
            if (fonts) {
                let all = 0, t3 = 0;
                m.fonts = Object.keys(fonts).map(function (id) { const r = fonts[id]; all += r.chars; if (r.font && r.font.isType3Font) t3 += r.chars; return r.name; }).filter(Boolean);
                m.type3Share = all ? +(t3 / all).toFixed(3) : 0;
            }
            if (pages) {
                let n = 0, inv = 0;
                pages.forEach(function (p) { p.glyphs.forEach(function (g) { if (!g.space) { n++; if (g.invisible) inv++; } }); });
                m.invisibleShare = n ? +(inv / n).toFixed(3) : 0;
            }
            return provenance(m);
        }

        /**
         * How the file is drawn (r.features, PDFIMPORT.md §2c): the profile says who made the PDF, this says what the
         * pages are made of — the choices any producer makes, whatever its name: the fonts' kinds, whether the
         * ToUnicode maps cover the glyphs, Arabic script as presentation forms or letters, word spaces drawn or left
         * as gaps, condensed or tracked type, text in Form XObjects, over pictures, invisible or turned; rules,
         * fills, pictures, transparency and clips; tags, artifacts; the paper. Measured once, after the repairs and
         * before the layout; no rule reads it. `cells` lists it as axis=value pairs: the lab's coverage matrix
         * (tests/pdf-lab/scripts/features.js) is made of them, and a new file shows its cells no lab PDF has.
         */
        _features(pages, fonts, structure) {
            const AR = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/, PFORM = /[\uFB50-\uFDFF\uFE70-\uFEFF]/, HE = /[\u0590-\u05FF]/, LAT = /[A-Za-z\u00C0-\u024F]/;
            const r3 = function (x) { return +(+x || 0).toFixed(3); };
            let n = 0, sp = 0, noMap = 0, fffd = 0, ar = 0, pf = 0, he = 0, lat = 0, hs = 0, tr = 0, inv = 0, rot = 0, form = 0, inImg = 0, art = 0, gapOnly = 0;
            const trackEm = [], wordGapEm = [], letterGapEm = [];
            const g8 = { forms: 0, smask: 0, alpha: 0, clips: 0, patterns: 0, groups: 0 };
            let rects = 0, rules = 0, vectors = 0, images = 0, imgCover = 0, rotated = 0;
            const sizes = {};
            pages.forEach(function (p) {
                const v = p.view || [0, 0, 595, 842], W = Math.abs(v[2] - v[0]), H = Math.abs(v[3] - v[1]);
                const key = (function () {
                    const a = Math.min(W, H), b = Math.max(W, H), near = function (x, y) { return Math.abs(a - x) < 8 && Math.abs(b - y) < 8; };
                    const k = near(595, 842) ? 'A4' : near(612, 792) ? 'Letter' : near(420, 595) ? 'A5' : near(612, 1008) ? 'Legal' : near(842, 1191) ? 'A3' :
                        b / a > 1.6 && W > H ? 'wide' : 'other';
                    return k + (W > H ? '-landscape' : '');
                })();
                sizes[key] = (sizes[key] || 0) + 1;
                if (p.rotate) rotated++;
                rects += (p.rects || []).length; rules += (p.hsegs || []).length + (p.vsegs || []).length;
                vectors += (p.vectors || []).length; images += (p.images || []).length;
                (p.images || []).forEach(function (b) { imgCover = Math.max(imgCover, (b.x1 - b.x0) * (b.y1 - b.y0) / (W * H || 1)); });
                if (p.stats) Object.keys(g8).forEach(function (k) { g8[k] += p.stats[k] || 0; });
                let prev = null;
                p.glyphs.forEach(function (g) {
                    if (g.space) { sp++; if (prev && g.size) wordGapEm.push(Math.max(0, g.x - (prev.x + prev.w) + g.w) / g.size); prev = null; return; }
                    n++;
                    if (g.noMap) noMap++;
                    if (g.ch === '\uFFFD') fffd++;
                    if (AR.test(g.ch)) { ar++; if (PFORM.test(g.ch)) pf++; } else if (HE.test(g.ch)) he++; else if (LAT.test(g.ch)) lat++;
                    if (g.hs && Math.abs(g.hs - 1) > 0.02) hs++;
                    if (g.track && Math.abs(g.track) > 0.005) { tr++; trackEm.push(g.track); }
                    if (g.invisible) inv++;
                    if (g.rot) rot++;
                    if (g.inForm) form++;
                    if (g.artifact) art++;
                    if ((p.images || []).some(function (b) { return g.x >= b.x0 && g.x <= b.x1 && g.y >= b.y0 && g.y <= b.y1; })) inImg++;
                    // the gap to the glyph before on the same baseline (drawing order): letters' own spacing, or a
                    // word gap that no space glyph marks
                    if (prev && g.size && !g.rot && Math.abs(g.y - prev.y) < 0.2 * g.size && !g.invisible) {
                        const gap = (g.x - (prev.x + prev.w)) / g.size;
                        if (gap > 0.15 && gap < 1.2) { gapOnly++; wordGapEm.push(gap); }   // (wider: a column or cell gap)
                        else if (gap > -0.3 && gap <= 0.15 && LAT.test(g.ch) && LAT.test(prev.ch)) letterGapEm.push(gap);
                    }
                    prev = g;
                });
            });
            const P = pages.length || 1, letters = ar + he + lat || 1;
            const rtlShare = (ar + he) / letters;
            const kinds = {}; let fch = 0;
            Object.keys(fonts || {}).forEach(function (id) {
                const r = fonts[id], f = r.font || {};
                const k = f.composite ? 'cid' : f.isType3Font || f.type === 'Type3' ? 'type3' : /truetype/i.test(f.type || '') ? 'truetype' : /type1|cff/i.test(f.type || '') ? 'type1' : 'other';
                kinds[k] = (kinds[k] || 0) + r.chars; fch += r.chars;
                if (f.missingFile) kinds.notEmbedded = (kinds.notEmbedded || 0) + r.chars;
            });
            Object.keys(kinds).forEach(function (k) { kinds[k] = r3(kinds[k] / (fch || 1)); });
            const share = function (x) { return r3(x / (n || 1)); };
            const f = {
                text: {
                    glyphs: n, script: rtlShare > 0.6 ? 'rtl' : rtlShare > 0.05 ? 'mixed' : n ? 'ltr' : 'none',
                    arabic: ar ? (pf / ar > 0.5 ? 'forms' : 'letters') : null,
                    noToUnicode: share(noMap), lost: share(fffd),
                    spaces: !n ? null : sp + gapOnly === 0 ? 'none' : gapOnly / (sp + gapOnly) > 0.7 ? 'gaps' : gapOnly / (sp + gapOnly) < 0.2 ? 'drawn' : 'mixed',
                    wordGapEm: r3(median(wordGapEm)), letterGapEm: r3(median(letterGapEm)),
                    hscale: share(hs), tracked: share(tr), trackEm: r3(median(trackEm)),
                    invisible: share(inv), turned: share(rot), inForms: share(form), overPictures: share(inImg), artifacts: share(art)
                },
                fonts: kinds,
                graphics: { rectsPerPage: r3(rects / P), rulesPerPage: r3(rules / P), vectorsPerPage: r3(vectors / P), imagesPerPage: r3(images / P),
                            largestPicture: r3(imgCover), transparency: g8.alpha + g8.smask, softMasks: g8.smask, clips: g8.clips, patterns: g8.patterns, forms: g8.forms, groups: g8.groups },
                structure: { tagged: !!(structure && structure.tree), trust: structure ? r3(structure.trust) : 0, outline: (this._outline || []).length },
                pages: { n: pages.length, sizes: sizes, rotated: rotated }
            };
            // axis=value cells: a few values per axis, so that files can be counted per cell
            const c = [], lvl = function (x, a, b) { return x <= a ? 'none' : x <= b ? 'some' : 'most'; };
            c.push('script=' + f.text.script);
            if (f.text.arabic) c.push('arabic=' + f.text.arabic);
            Object.keys(kinds).forEach(function (k) { if (k !== 'notEmbedded' && kinds[k] >= 0.1) c.push('font=' + k); });
            if (kinds.notEmbedded >= 0.1) c.push('font=notEmbedded');
            c.push('toUnicode=' + (f.text.noToUnicode <= 0.005 ? 'full' : f.text.noToUnicode <= 0.3 ? 'partial' : 'missing'));
            if (f.text.spaces) c.push('spaces=' + f.text.spaces);
            c.push('hscale=' + lvl(f.text.hscale, 0.01, 0.5));
            c.push('tracking=' + (f.text.tracked <= 0.01 ? 'none' : f.text.trackEm < -0.005 ? 'tight' : 'loose'));
            if (f.text.invisible > 0.01) c.push('text=invisible');
            if (f.text.turned > 0.01) c.push('text=turned');
            if (f.text.inForms > 0.5) c.push('text=inForms');
            if (f.text.overPictures > 0.05) c.push('text=overPictures');
            c.push('rules=' + (f.graphics.rulesPerPage < 1 ? 'none' : f.graphics.rulesPerPage < 15 ? 'some' : 'many'));
            c.push('fills=' + (f.graphics.rectsPerPage < 1 ? 'none' : f.graphics.rectsPerPage < 15 ? 'some' : 'many'));
            c.push('pictures=' + (f.graphics.imagesPerPage === 0 ? 'none' : f.graphics.largestPicture > 0.6 ? 'pageSize' : 'some'));
            if (f.graphics.vectorsPerPage >= 1) c.push('vectors=yes');
            if (f.graphics.transparency) c.push('transparency=' + (f.graphics.softMasks ? 'softMask' : 'alpha'));
            if (f.graphics.patterns) c.push('patterns=yes');
            c.push('tagged=' + (!f.structure.tagged ? 'no' : f.structure.trust >= 0.5 ? 'trusted' : 'weak'));
            if (f.text.artifacts > 0.005) c.push('artifacts=yes');
            if (f.structure.outline) c.push('outline=yes');
            Object.keys(sizes).forEach(function (k) { if (sizes[k] / P >= 0.3) c.push('paper=' + k); });
            if (rotated) c.push('rotate=yes');
            f.cells = c;
            return f;
        }

        /**
         * Self-diagnosis, per page (r.quality, PDFIMPORT.md §2d): cheap signs that a page came back worse than its
         * text layer allows — glyphs whose text was lost (U+FFFD), words glued together (lost word spaces: long
         * runs of Arabic-script letters, or of Latin ones), text lying under a picture the importer cropped (the
         * words may be in the picture only). Measured on the page's lines and blocks after its layout; a page over
         * a threshold is flagged, and the reader gets one note per kind, with its pages.
         */
        _pageQuality(pl, pageBlocks) {
            const AR_LETTER = /[\u0620-\u064A\u066E-\u06D3\u06D5\u06FA-\u06FC\uFB50-\uFDFF\uFE70-\uFEFF]/g, LAT_LETTER = /[A-Za-z\u00C0-\u024F]/g;
            const figs = pageBlocks.filter(function (b) { return b.type === 'figure' && b.bb; }).map(function (b) { return b.bb; });
            let glyphs = 0, lost = 0, covered = 0, arWords = 0, arLong = 0, latWords = 0, latLong = 0;
            pl.lines.forEach(function (L) {
                const ink = L.glyphs.filter(function (g) { return !g.space && !g.atom && !g.invisible; });
                glyphs += ink.length;
                ink.forEach(function (g) { if (g.ch === '\uFFFD') lost++; });
                const cx = (L.x0 + L.x1) / 2, cy = L.y + 0.3 * L.size;
                if (figs.some(function (b) { return cx >= b.x0 - 1 && cx <= b.x1 + 1 && cy >= b.y0 - 1 && cy <= b.y1 + 1; })) covered += ink.length;
                L.glyphs.map(function (g) { return g.atom ? ' ' : g.ch; }).join('').split(/[\s\u00A0]+/).forEach(function (w) {
                    const a = (w.match(AR_LETTER) || []).length, l = (w.match(LAT_LETTER) || []).length;
                    if (a >= 2) { arWords++; if (a >= 12) arLong++; } else if (l >= 2 && !/[\/@.:_]/.test(w)) { latWords++; if (l >= 20) latLong++; }
                });
            });
            const q = { page: pl.p.num, glyphs: glyphs, lost: lost, covered: covered, words: arWords + latWords, glued: arLong + latLong, flags: [] };
            if (lost >= 5 && lost / Math.max(1, glyphs) >= 0.02) q.flags.push('lostGlyphs');
            if (arLong >= 3 && arLong / Math.max(1, arWords) >= 0.04 || latLong >= 4 && latLong / Math.max(1, latWords) >= 0.03) q.flags.push('suspectSpaces');
            if (covered >= 20 && covered / Math.max(1, glyphs) >= 0.1) q.flags.push('textInPictures');
            (this._quality = this._quality || []).push(q);
            return q;
        }

        /** the notes of the self-diagnosis: one per kind, naming its pages (r.quality.flags). */
        _qualityNotes() {
            const by = {};
            (this._quality || []).forEach(function (q) { q.flags.forEach(function (f) { (by[f] = by[f] || []).push(q.page); }); });
            const pages = function (ps) { return ps.join(', '); };
            const TEXT = {
                lostGlyphs: 'Some characters could not be read from the PDF\'s fonts and show as \uFFFD (pages ',
                suspectSpaces: 'Word spaces may be missing — words run together (pages ',
                textInPictures: 'Some text lies under a picture and may be in the picture only, not in the text (pages '
            };
            Object.keys(TEXT).forEach(function (code) { if (by[code]) this._note(code, TEXT[code] + pages(by[code]) + ').'); }, this);
            return by;
        }

        /**
         * 0.6 structure: the producer's structure tree, onto the glyphs (PDFIMPORT.md §2b). Each glyph inside
         * marked content the tree points to gets g.struct — its node and the nearest node that says something
         * layout cannot see for sure (a heading and its level, a list item and its depth, a table cell and its
         * row and column, code, a quote, a caption). The document gets a trust value: how much of its text the
         * tree reaches (cover) and how much of that it says something about (sem). No layout rule reads either
         * yet (TODO): this step only measures.
         */
        async _structure(pages) {
            const st = { tree: false, chars: 0, covered: 0, sem: 0, roles: {}, headings: {}, trust: 0, elements: [] };
            if (!this._tagged) return st;
            const SEM = /^(H[1-6]?|Title|L|LI|Lbl|LBody|Table|TR|TH|TD|THead|TBody|TFoot|Code|BlockQuote|Quote|Caption|TOC|TOCI|Note|Reference|BibEntry|Formula|Figure)$/;
            // role names as producers write them when no RoleMap brings them back to the standard ones
            const norm = function (r) {
                const h = /^(?:Heading|Überschrift|Titre|Título|Titolo|عنوان)\s*([1-6])$/i.exec(r);
                return h ? 'H' + h[1] : r;
            };
            let uid = 0;
            for (const p of pages) {
                let tree = null;
                try { tree = await p.page.getStructTree(); } catch (e) { tree = null; }
                if (!tree || !tree.children || !tree.children.length) continue;
                st.tree = true;
                const ref = p.page.ref, prefix = ref ? 'p' + ref.num + 'R' + (ref.gen ? ref.gen : '') + '_mc' : null;
                const byMcid = {};
                const walk = function (node, ctx) {
                    if (node.type === 'content') {
                        const m = /_mc(\d+)$/.exec(node.id || '');
                        if (m && (!prefix || node.id.indexOf(prefix) === 0)) byMcid[+m[1]] = ctx;
                        return;
                    }
                    if (node.type) return;                                // object / annotation references
                    const role = norm(node.role || '');
                    const c = Object.assign({}, ctx, { node: ++uid, role: role });
                    // the nearest block element (inline ones — Span, Strong, Em, Link, inline Code, Sub, Sup — are transparent,
                    // and so is NonStruct, a grouping "whose content is treated as its parent's" (ISO 32000); Edge wraps a
                    // paragraph's bold and links in it)
                    c.block = /^(Span|Strong|Em|Link|Code|Sub|Sup|Annot|Quote|Reference|BibEntry|NonStruct)$/.test(role) && ctx.block ? ctx.block : uid;
                    if (role) { st.roles[role] = (st.roles[role] || 0) + 1; }
                    const h = /^H([1-6])$/.exec(role);
                    if (h) st.headings[h[1]] = (st.headings[h[1]] || 0) + 1;
                    if (SEM.test(role) && !/^(THead|TBody|TFoot|LBody)$/.test(role)) {
                        c.sem = role; c.semNode = uid;
                        if (h) c.level = +h[1]; else if (role === 'H' || role === 'Title') c.level = null;
                    }
                    if (role === 'L') c.list = (ctx.list || 0) + 1;
                    if (role === 'LI') c.item = uid;
                    // tables: rows counted through THead / TBody / TFoot (the counters are shared by reference), cells per row
                    if (role === 'Table') { c.table = uid; c.rowCounter = { n: -1 }; }
                    if (role === 'TR') { c.row = ctx.rowCounter ? ++ctx.rowCounter.n : 0; c.colCounter = { n: -1 }; }
                    if ((role === 'TD' || role === 'TH') && ctx.colCounter) { c.col = ++ctx.colCounter.n; c.th = role === 'TH'; }
                    (node.children || []).forEach(function (ch) { walk(ch, c); });
                };
                walk(tree, {});
                p.glyphs.forEach(function (g) {
                    if (g.artifact) return;
                    const c = g.mcid !== undefined ? byMcid[g.mcid] : undefined;
                    if (g.space) { if (c) g.struct = { node: c.node, block: c.block, role: c.role, sem: c.sem || null, semNode: c.semNode || null }; return; }   // carried, not counted
                    st.chars++;
                    if (!c) return;
                    st.covered++;
                    g.struct = { node: c.node, block: c.block, role: c.role, sem: c.sem || null, semNode: c.semNode || null, level: c.level, list: c.list || 0,
                                 item: c.item || null, table: c.table || null, row: c.row, col: c.col, th: !!c.th };
                    if (c.sem) st.sem++;
                });
                // the named elements and their text (drawing order), for the tests and for whoever reads r.structure
                const els = {};
                p.glyphs.forEach(function (g) {
                    const t = g.struct; if (!t || !t.semNode) return;
                    const e = els[t.semNode] || (els[t.semNode] = { role: t.sem, level: t.level, page: p.num, list: t.list, row: t.row, col: t.col, text: '', last: null });
                    // a word gap that draws no space (Chrome), or a new line: a space
                    const q = e.last;
                    if (q && (Math.abs(g.y - q.y) > 0.5 * g.size || g.x - (q.x + q.w) > 0.15 * g.size || g.x < q.x - 0.5 * g.size)) e.text += ' ';
                    e.text += g.ch; e.last = g;
                });
                Object.keys(els).sort(function (a, b) { return a - b; }).forEach(function (k) {
                    if (st.elements.length < 5000) { const e = els[k]; delete e.last; e.text = e.text.replace(/\s+/g, ' ').trim().slice(0, 120); st.elements.push(e); }
                });
            }
            if (st.tree && st.chars) {
                const cover = st.covered / st.chars, sem = st.sem / st.chars;
                // trust is reliability, not richness: a tree that reaches the text and names anything at all (prose
                // is P, rightly — Chrome's tree of a page of symbols names 10 %, of a report 80 %) is as good as its
                // reach; one that names nothing (all P / Span: LibreOffice Calc's single root) is worth nothing
                st.trust = +(cover * Math.min(1, sem / 0.05)).toFixed(2);
            }
            return st;
        }

        /**
         * Give the page a breath: back to the event loop when the thread has been held for 30 ms (the interface
         * stays responsive, a progress bar moves), and stop when the caller aborted (options.signal).
         */
        async _yield() {
            const sig = this.options.signal;
            const now = (typeof performance !== 'undefined' ? performance : Date).now();
            if (!this._lastYield || now - this._lastYield > 30) {
                await new Promise(function (r) { setTimeout(r, 0); });
                this._lastYield = (typeof performance !== 'undefined' ? performance : Date).now();
            }
            if (sig && sig.aborted) { const e = new Error('The PDF import was cancelled.'); e.code = 'aborted'; throw e; }
        }

        /** A page that could not be read: empty, in the shape of _extractPage's, and noted (code 'pageFailed'). */
        _emptyPage(num, err) {
            (this._failedPages = this._failedPages || []).push(num);
            this._note('pageFailed', 'Page ' + num + ' could not be read (' + String(err && err.message || err).slice(0, 80) + '); the other pages were.');
            return { num: num, page: null, view: [0, 0, 595, 842], glyphs: [], rects: [], hsegs: [], vsegs: [], vectors: [], images: [], small: [], links: [], fonts: {}, failed: true };
        }

        /**
         * Numbers and letters written out (options.asciiNumbers, options.persianLetters): the characters a keyboard types
         * and a search finds. Digits of any system become ASCII; inside a number — a digit on both sides — the Arabic
         * thousands separator and the Arabic comma become «,», the Arabic decimal separator «.», and the Arabic percent
         * sign next to a digit «%». In a Persian document the Arabic yeh, kaf and alef maksura (GDI and some Word exports
         * name the Persian letters so) become Persian. Code is left as drawn. Applied to each block's logical glyphs.
         */
        _writeOut(glyphs) {
            const o = this.options, nums = o.asciiNumbers !== false, letters = o.persianLetters !== false && this._persianDoc;
            if (!nums && !letters) return glyphs;
            const DIG = /^[0-9\u06F0-\u06F9\u0660-\u0669]$/;
            const isDig = function (k) { const g = glyphs[k]; return !!g && !g.atom && !g.code && DIG.test(g.ch); };
            return glyphs.map(function (g, k) {
                if (g.atom || g.code || !g.ch) return g;
                let ch = g.ch;
                if (nums) {
                    ch = ch.replace(/[\u06F0-\u06F9]/g, function (d) { return String.fromCharCode(d.charCodeAt(0) - 0x06F0 + 48); })
                           .replace(/[\u0660-\u0669]/g, function (d) { return String.fromCharCode(d.charCodeAt(0) - 0x0660 + 48); });
                    if ((ch === '\u066C' || ch === '\u060C') && isDig(k - 1) && isDig(k + 1)) ch = ',';
                    else if (ch === '\u066B' && isDig(k - 1) && isDig(k + 1)) ch = '.';
                    else if (ch === '\u066A' && (isDig(k - 1) || isDig(k + 1))) ch = '%';
                }
                if (letters) ch = ch.replace(/\u064A/g, '\u06CC').replace(/\u0643/g, '\u06A9').replace(/\u0649/g, '\u06CC');
                return ch === g.ch ? g : Object.assign({}, g, { ch: ch });
            });
        }

        _note(code, text) { if (this.notes.indexOf(code) < 0) this.notes.push(code); this.messages.push(text); }

        /**
         * PDF.js asks for its WebAssembly decoders by file name; they come from
         * vendor/pdfjs/wasm/<name>.js (base64, window.KelkPdfjsData), loaded on the
         * first image that needs one — file:// allows no fetch.
         */
        _binaryDataFactory() {
            const self = this;
            return class KelkBinaryDataFactory {
                constructor() { /* cMapUrl / standardFontDataUrl / wasmUrl: not used */ }
                async fetch(req) {
                    const name = req && req.filename;
                    if (req.kind !== 'wasmUrl' || !/^[\w.-]+\.wasm$/.test(name || '')) {
                        throw new Error('PdfImporter: no local ' + req.kind + ' data for ' + name);
                    }
                    const store = function () { return global.KelkPdfjsData || {}; };
                    if (!store()[name]) await self._loadScript(self._wasmBase() + name + '.js');
                    const b64 = store()[name];
                    if (!b64) throw new Error('PdfImporter: ' + name + ' did not load');
                    const bin = atob(b64), bytes = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                    return bytes;
                }
            };
        }

        _wasmBase() {
            if (this.options.wasmBase) return this.options.wasmBase;
            const s = typeof document !== 'undefined' && document.querySelector('script[src*="pdf.worker"]');
            return s ? s.src.replace(/[^/]*$/, '') + 'wasm/' : 'vendor/pdfjs/wasm/';
        }

        _loadScript(src) {
            if (this.options.loadScript) return this.options.loadScript(src);
            return new Promise(function (resolve, reject) {
                const el = document.createElement('script');
                el.src = src; el.onload = resolve;
                el.onerror = function () { reject(new Error('could not load ' + src)); };
                document.head.appendChild(el);
            });
        }

        // ── 0. Kelk's own source ───────────────────────────────────────
        /**
         * The formulas PdfBuilder drew, from its XMP (`kelk:math`: base64 of UTF-8 JSON { v: 1, math: [{ p, x0, x1, y0,
         * y1, b, d, t }] } — page, box and baseline in PDF space, display, TeX): page → its formulas, or null.
         */
        _kelkMath(raw) {
            try {
                const m = raw && raw.match(/<kelk:math[^>]*>([\s\S]*?)<\/kelk:math>/);
                if (!m) return null;
                const bin = atob(m[1].replace(/\s+/g, '')), bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                const j = JSON.parse(new TextDecoder('utf-8').decode(bytes));
                if (!j || j.v !== 1 || !Array.isArray(j.math)) return null;
                const by = {};
                j.math.forEach(function (e) {
                    if (!e || typeof e.t !== 'string' || !e.t || !(e.p >= 1) || !(e.x1 > e.x0) || !(e.y1 > e.y0)) return;
                    (by[e.p] = by[e.p] || []).push(e);
                });
                return Object.keys(by).length ? by : null;
            } catch (e) { return null; }
        }


        async _kelkSource(doc) {
            try {
                const att = await doc.getAttachments();
                if (att) {
                    for (const k of Object.keys(att)) {
                        const a = att[k];
                        if (/\.(md|markdown)$/i.test(a.filename || k)) {
                            this._note('kelkSource', 'Markdown source embedded in the PDF was used (' + (a.filename || k) + ').');
                            return new TextDecoder('utf-8').decode(a.content);
                        }
                    }
                }
            } catch (e) { /* no attachments */ }
            try {
                const meta = await doc.getMetadata();
                const raw = meta && meta.metadata && meta.metadata.getRaw ? meta.metadata.getRaw() : '';
                const m = raw && raw.match(/<kelk:source[^>]*>([\s\S]*?)<\/kelk:source>/);
                if (m) {
                    const bin = atob(m[1].replace(/\s+/g, ''));
                    const bytes = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                    this._note('kelkSource', 'Markdown source embedded by Kelk was used.');
                    return new TextDecoder('utf-8').decode(bytes);
                }
            } catch (e) { /* no XMP */ }
            return null;
        }

        _markdown(html) {
            if (!global.MarkdownImporter) return html;
            const imp = global.MarkdownImporter.create(this.options.markdownImporter || {});
            // task boxes travel as tokens (MarkdownImporter drops <input>)
            return imp.fromHtml(html).markdown.replace(/\u27E6KTASKX\u27E7/g, '[x]').replace(/\u27E6KTASK\u27E7/g, '[ ]');
        }

        /**
         * The Markdown, in chunks of top-level blocks (about 30 000 characters of HTML each) with a breath between
         * them: one turndown call over a long document held the thread for half a second and more. The blocks are
         * independent in Markdown (a list, a table, a quote is one block), so the chunks join with a blank line —
         * the lab checks the result is the same as one call's, file for file.
         */
        async _markdownChunked(html) {
            const parts = this._htmlParts;
            const chunk = this.options.markdownChunk || 30000;      // (the lab sets it small to test the joins)
            if (!parts || html.length < 2 * chunk) return this._markdown(html);
            const out = []; let buf = [], size = 0;
            for (let i = 0; i <= parts.length; i++) {
                if (i === parts.length || (size > chunk && buf.length)) {
                    const md = this._markdown(buf.join('\n')).replace(/^\n+|\n+$/g, '');
                    if (md) out.push(md);
                    buf = []; size = 0;
                    await this._yield();
                    if (i === parts.length) break;
                }
                buf.push(parts[i]); size += parts[i].length;
            }
            return out.join('\n\n') + '\n';
        }

        _emojiSource() {
            let found = null;
            if (global.PdfFonts) Object.keys(global.PdfFonts).forEach(function (k) { const f = global.PdfFonts[k]; if (!found && f && f.emoji && f.emoji.seq) found = f.emoji; });
            return found;
        }

        _emojiMap() {
            let seq = this.options.emojiSeq, pua = this.options.emojiPua || 0xE000;
            if (!seq && global.PdfFonts) {
                Object.keys(global.PdfFonts).forEach(function (k) {
                    const f = global.PdfFonts[k];
                    if (!seq && f && f.emoji && f.emoji.seq) { seq = f.emoji.seq; pua = f.emoji.pua || 0xE000; }
                });
            }
            if (!seq) return null;
            const list = seq.split(';');
            return function (ch) {
                const e = list[ch.charCodeAt(0) - pua];
                return e ? e.split(' ').map(function (h) { return String.fromCodePoint(parseInt(h, 16)); }).join('') : null;
            };
        }
    }

    PdfImporter.VERSION = '1.0';
    PdfImporter._bidi = { levels: bidiLevels, reorder: reorder, repairArabic: repairArabic };
    PdfImporter.provenance = provenance;          // pure: tests/pdf-lab/scripts/profile.js
    // the helpers the parts in lib/pdfimport/ share (not an API)
    PdfImporter._internal = {
        DEFAULTS, R_CH, AN_CH, EN_CH, MARK_CH, L_CH, CS_CH, ES_CH, ET_CH, CTRL, MIRROR, digitValue, charType,
        bidiLevels, reorder, PF, ISOLATED, DUAL, ARABIC_LETTER, NOT_MI_WORDS, repairArabic, goesOn, esc,
        median, mode, mul, apply, bboxOf, inside, overlapY, isWhite, EMOJI_P, emojiPresentation, DINGBATS,
        WORD_BULLETS, dingbat, FACES, fontFace, sfntLigatures, nfkcArabic, columnAlign, finishLine, latin1,
        pdfString, markedTexts, ENGINES, POST, OS_FONTS, tagInfo, provenance
    };
    PdfImporter.PARTS = ['thresholds', 'calibration', 'extract', 'lines', 'regions', 'order', 'blocks'];   // lib/pdfimport/<part>.js, in load order
    if (typeof module !== 'undefined' && module.exports) module.exports = PdfImporter;
    else global.PdfImporter = PdfImporter;
})(typeof window !== 'undefined' ? window : globalThis);
