/**
 * XlsxBuilder - Markdown tables → Excel workbook (.xlsx) and CSV files, in the browser
 * ====================================================================================
 * Version: 1.0
 *
 * A Kelk builder for tables: every GitHub Flavored Markdown table of a text becomes a sheet (or all of them one
 * sheet), named by the heading or the bold line above it. The workbook is written by SheetJS, then its XML parts are
 * rewritten with JSZip (polish), since SheetJS Community Edition writes no styles, no right-to-left view and no page
 * setup: per-content fonts (a Persian font for Persian text, a Latin font for the rest), alignment by content
 * (Persian right, Latin left, numbers centered), the header row's fill and borders, stripes as conditional
 * formatting (sorting keeps them), column widths from the content, a frozen header row, an AutoFilter, a trailing
 * spacer column (the last column's text cannot overflow), paper, margins, orientation and print titles.
 *
 *   const b = XlsxBuilder.create()
 *       .configure({ fonts: { bidi: 'B Nazanin', latin: 'Calibri' }, fontSizes: { bidi: 12, latin: 11 },
 *                    excel: { sheets: 'each', wrap: 'none' } })
 *       .addFromMarkdown(markdown);                       // marked (global, or o.marked) reads the tables
 *   b.sheets();                                          // [{ name, rows, cols, … }] — the sheets, before styling
 *   const xlsx = await b.toBlob();                       // needs SheetJS (global XLSX) and JSZip
 *   const zip  = await b.toCsvZip();                     // one CSV per sheet (JSZip)
 *   el.innerHTML = XlsxBuilder.previewHtml(b.plans(), { rows: 20 });   // + XlsxBuilder.previewCss() once
 *
 * Fonts are not embedded: Excel has no way to carry them, so the reader needs the fonts installed.
 * Cells: the text of a Markdown cell without its marks; <br> a line break (excel.breaks); a cell that is one
 * link keeps its target (excel.links); digits only (leading zeros kept as text, excel.zeros; more than 15 digits
 * text) become numbers.
 */
(function (global) {
    'use strict';

    class XlsxBuilderError extends Error {
        constructor(message) { super(message); this.name = 'XlsxBuilderError'; }
    }

    const VERSION = '1.0';

    /** The options of excel: { … } — the Kelk page's defaults (scripts/config.js defaults.excel). */
    const DEFAULTS = {
        sheets: 'each',         // each: a sheet per table | one: every table in one sheet (titles and gaps between)
        gap: 2,                 // one sheet: empty rows between two tables
        titleRow: true,         // one sheet: each table's name in a bold row above it
        direction: 'auto',      // a sheet's view: auto (right to left when most text is) | rtl | ltr
        zeros: true,            // 0012 stays text (else the number 12)
        links: true,            // a cell that is one link keeps its target
        breaks: true,           // <br> in a cell: a line break (else a space)
        wrap: 'none',           // none | multi (cells with a line break) | all
        thousands: false,       // numbers with a thousands separator (a number format: the value stays a number)
        headerColor: '#E4E9EF', // the header row's fill (Kelk's table style)
        stripes: true, stripeColor: '#F5F7FA',
        headerBorder: 'all', headerBorderWidth: 'thin', headerBorderColor: '#A9B5C4',   // all | none; thin | medium
        bodyBorder: 'all', bodyBorderWidth: 'thin', bodyBorderColor: '#A9B5C4',
        headerHeight: 21,       // pt, the header row (0: Excel's own); a header that wraps keeps its height free
        filter: true, freeze: true,    // an AutoFilter on the header; the header row frozen (one table per sheet)
        columns: 'content',     // content: each column fits its text | page: the widest shrink to the page width
        paper: 'A4',            // A4 | A3 | Letter
        orientation: 'auto',    // auto (landscape when the columns are wider than portrait) | portrait | landscape
        margins: 'kelk',        // kelk | normal | wide | narrow (Excel's presets; kelk: 1 cm top and bottom, 0.5 cm sides)
        center: true,           // centered on the page horizontally
        fit: true,              // fit to the page width
        headerFooter: true,     // the sheet's name above, «page / pages» below
        csvSeparator: ',',      // , | ; | \t
        csvBom: true            // a UTF-8 byte order mark: Excel then reads Persian text right
    };
    const PAPER = { A4: { code: 9, inch: [8.27, 11.69] }, A3: { code: 8, inch: [11.69, 16.54] }, Letter: { code: 1, inch: [8.5, 11] } };
    /** centimeters: left, right, top, bottom, header, footer */
    const MARGINS = { kelk: [0.5, 0.5, 1, 1, 0.3, 0.3], normal: [1.78, 1.78, 1.91, 1.91, 0.76, 0.76],
        wide: [2.54, 2.54, 2.54, 2.54, 1.27, 1.27], narrow: [0.64, 0.64, 1.91, 1.91, 0.76, 0.76] };

    /** a right-to-left letter (Persian, Arabic, Hebrew) — not a digit */
    const RX_FA_LETTER = /[\u0621-\u064A\u0671-\u06D3\u06FA-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u05D0-\u05EA]/;
    const RX_EN_LETTER = /[A-Za-z\u00C0-\u024F]/;
    const RX_FA_DIGIT = /[\u0660-\u0669\u06F0-\u06F9]/;
    const RX_ANY_DIGIT = /[0-9\u0660-\u0669\u06F0-\u06F9]/;
    const BAD_SHEET = /[\\/?*[\]:]/g;
    const BAD_FILE = /[\\/:*?"<>|]/g;
    /** The classic Borna Rayaneh fonts (B Nazanin …) declare only the Arabic code page: without charset 178 Excel
     * looks for a Latin font and shows a fallback. Unicode fonts (Vazirmatn, Sahel) need none. */
    const ARABIC_ONLY_FONT = /^B\s/;

    // =========================================================================
    // Small helpers
    // =========================================================================

    const xmlEsc = function (s) {
        return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]; });
    };
    const htmlEsc = function (s) {
        return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
    };
    const hex6 = function (c) { return String(c || '').replace('#', '').toUpperCase().padStart(6, '0').slice(0, 6); };
    const argb = function (c) { return 'FF' + hex6(c); };
    function rgbOf(c) { const n = parseInt(hex6(c), 16) || 0; return [n >> 16, n >> 8 & 255, n & 255]; }
    /** Dark text on a light fill, white on a dark one. */
    function inkOn(c) {
        const l = rgbOf(c).map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
        return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2] > 0.4 ? '#1B1B1B' : '#FFFFFF';
    }
    function decodeCol(letters) { let n = 0; for (let i = 0; i < letters.length; i++) n = n * 26 + letters.charCodeAt(i) - 64; return n - 1; }
    function encodeCol(c) { let s = ''; c++; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = (c - m - 1) / 26; } return s; }
    /** Persian and Arabic-Indic digits → ASCII (file names). */
    const toAscii = function (s) {
        return String(s).replace(/[\u06F0-\u06F9\u0660-\u0669]/g, function (d) {
            const c = d.charCodeAt(0);
            return String(c >= 0x06F0 ? c - 0x06F0 : c - 0x0660);
        }).replace(/\u066B/g, '.');
    };
    const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00A0', zwnj: '\u200C', zwj: '\u200D' };
    function decodeEntities(s) {
        return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) {
            if (e[0] === '#') {
                const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
                return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
            }
            const v = ENTITIES[e.toLowerCase()];
            return v == null ? m : v;
        });
    }

    /** A legal sheet name: no \ / ? * [ ] :, at most 31 characters, not blank, not «History», no ' at either end. */
    function cleanSheet(name, fallback) {
        let s = String(name || '').replace(BAD_SHEET, ' ').replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, '').trim().slice(0, 31).trim();
        if (!s || s.toLowerCase() === 'history') s = fallback || 'Sheet';
        return s;
    }
    /** Names made unique (sheet names compare without case, as Excel does): «name», «name-2» … within `limit`. */
    function uniquify(names, limit) {
        const seen = new Set();
        return names.map(function (n) {
            let name = n, i = 2;
            while (seen.has(name.toLowerCase())) {
                const sfx = '-' + i++;
                name = n.slice(0, (limit || 200) - sfx.length) + sfx;
            }
            seen.add(name.toLowerCase());
            return name;
        });
    }

    /** '12' → 12; '0012' stays text when zeros; more than 15 digits (Excel's precision) or a leading + stay text. */
    function coerce(v, zeros) {
        if (v === '' || v == null) return '';
        if (!/^[-+]?\d+(?:\.\d+)?$/.test(v)) return v;
        if (v[0] === '+') return v;
        if (zeros !== false && /^-?0\d/.test(v)) return v;
        if (v.replace(/\D/g, '').length > 15) return v;
        return Number(v);
    }

    /**
     * What a cell holds, for its style:
     *   fa: a Persian / Arabic / Hebrew letter (mixed with Latin or digits too) · en: Latin letters, no Persian letter
     *   num: a number, or digits with separators only (0012, 1405/08/12) · sym: punctuation only · empty
     */
    function cellClass(v) {
        if (v === '' || v == null) return 'empty';
        if (typeof v === 'number') return 'num';
        const s = String(v);
        if (RX_FA_LETTER.test(s)) return 'fa';
        if (RX_EN_LETTER.test(s)) return 'en';
        if (RX_ANY_DIGIT.test(s)) return 'num';
        return 'sym';
    }
    /** The Persian font for Persian text and Persian digits, the Latin font otherwise. */
    const usesBidiFont = function (v, cls) { return cls === 'fa' || (cls !== 'en' && typeof v === 'string' && RX_FA_DIGIT.test(v)); };

    // =========================================================================
    // Reading the tables (marked's lexer: no DOM, fast on long tables)
    // =========================================================================

    /** A Markdown cell's inline tokens → { v: plain text, link: the target when the cell is one link }. */
    function inlineText(tokens, o) {
        let out = '';
        (tokens || []).forEach(function (t) {
            switch (t.type) {
                case 'text': out += t.tokens ? inlineText(t.tokens, o) : decodeEntities(t.text); break;
                case 'escape': out += t.text; break;
                case 'codespan': out += decodeEntities(t.text); break;
                case 'br': out += o.breaks ? '\n' : ' '; break;
                case 'html': out += /^<br\s*\/?>$/i.test(t.text.trim()) ? (o.breaks ? '\n' : ' ') : decodeEntities(t.text.replace(/<[^>]*>/g, '')); break;
                case 'image': out += t.text || ''; break;
                case 'strong': case 'em': case 'del': case 'link': out += inlineText(t.tokens, o); break;
                default: out += t.tokens ? inlineText(t.tokens, o) : (t.raw != null ? t.raw : (t.text || ''));
            }
        });
        return out;
    }
    function readCell(cell, o) {
        const toks = (cell.tokens || []).filter(function (t) { return !(t.type === 'text' && !t.text.trim()); });
        const link = o.links && toks.length === 1 && toks[0].type === 'link' && toks[0].href ? toks[0].href : null;
        return { v: inlineText(cell.tokens, o).trim(), link: link };
    }
    /** A paragraph that is only a bold run (an optional colon after it): a table's name. */
    function boldTitle(tok) {
        const t = (tok.tokens || []).filter(function (x) { return !(x.type === 'text' && /^\s*:?\s*$/.test(x.text)); });
        return t.length === 1 && t[0].type === 'strong' ? inlineText(t[0].tokens, { breaks: false }).trim() : '';
    }

    /**
     * Every table of a Markdown text: [{ name, header: [{v, link}], rows: [[{v, link}]] }]. Its name is the
     * nearest heading or bold line above it (a heading names every table under it until the next one; a bold
     * line, the table right after it); without either, «{table} N».
     */
    function findTables(md, o) {
        const mk = o.marked || global.marked;
        if (!mk || !mk.lexer) throw new XlsxBuilderError('XlsxBuilder: marked is needed to read Markdown tables');
        const found = [];
        let heading = '', bold = '';
        const walk = function (tokens) {
            (tokens || []).forEach(function (tok) {
                if (tok.type === 'heading') { heading = inlineText(tok.tokens, { breaks: false }).trim(); bold = ''; return; }
                if (tok.type === 'paragraph') { bold = boldTitle(tok); return; }
                if (tok.type === 'space') return;
                if (tok.type === 'table') {
                    found.push({ name: bold || heading, header: tok.header.map(function (c) { return readCell(c, o); }),
                        rows: tok.rows.map(function (r) { return r.map(function (c) { return readCell(c, o); }); }) });
                    bold = '';
                    return;
                }
                if (tok.type === 'blockquote') { walk(tok.tokens); return; }
                if (tok.type === 'list') { tok.items.forEach(function (it) { walk(it.tokens); }); return; }
                bold = '';
            });
        };
        walk(mk.lexer(String(md || ''), { gfm: true }));
        return found;
    }

    // =========================================================================
    // Column widths and the page (Excel character units of the Normal font)
    // =========================================================================

    function wrapsCell(x, multiline) { return x.wrap === 'all' || (x.wrap === 'multi' && multiline); }

    function textWidth(v, cls, bold, cfg) {
        const x = cfg.excel;
        let s = typeof v === 'number' ? (x.thousands ? v.toLocaleString('en-US', { maximumFractionDigits: 10 }) : String(v)) : String(v);
        if (!wrapsCell(x, true)) s = s.replace(/\n/g, ' ');            // an unwrapped line break shows as one line
        let w = 0;
        s.split('\n').forEach(function (line) {
            let lw = 0;
            for (const ch of line) {
                if (RX_FA_LETTER.test(ch)) lw += 0.8;
                else if (ch >= 'A' && ch <= 'Z') lw += 1.15;
                else if ('ijlft.,:;!|\''.indexOf(ch) >= 0) lw += 0.5;
                else if (ch === 'm' || ch === 'w') lw += 1.35;
                else if (ch >= 'a' && ch <= 'z') lw += 0.9;
                else if (RX_ANY_DIGIT.test(ch)) lw += 1;
                else if (ch === ' ') lw += 0.45;
                else lw += 0.9;
            }
            w = Math.max(w, lw);
        });
        const size = usesBidiFont(v, cls) ? cfg.fontSizes.bidi : cfg.fontSizes.latin;
        return w * size / cfg.fontSizes.latin * (bold ? 1.1 : 1);
    }

    /** Each column fits its header and its longest cell; one very long cell (over 1.25 × the 95th percentile) does not widen it. */
    function columnWidths(plan, cfg) {
        const out = [];
        for (let c = 0; c < plan.width; c++) {
            let head = 0; const body = [];
            for (let r = 0; r < plan.aoa.length; r++) {
                const v = plan.aoa[r][c];
                if (v === '' || v == null) continue;
                const role = plan.roles[r], cls = cellClass(v);
                if (role === 'head') head = Math.max(head, textWidth(v, cls, true, cfg) + (plan.filter ? 2.5 : 0));
                else if (role === 'body') body.push(textWidth(v, cls, false, cfg));
            }
            body.sort(function (a, b) { return a - b; });
            let b = body.length ? body[body.length - 1] : 0;
            if (body.length >= 20) b = Math.min(b, body[Math.ceil(body.length * 0.95) - 1] * 1.25);
            out.push(Math.max(5, Math.min(Math.max(head, b) + 2, cfg.excel.wrap === 'all' ? 45 : 60)));
        }
        return out;
    }

    const marginsInch = function (x) { return (MARGINS[x.margins] || MARGINS.kelk).map(function (cm) { return +(cm / 2.54).toFixed(4); }); };
    /** The printable width in character units: about 13 per inch for Calibri 11. */
    function pageChars(landscape, cfg) {
        const p = (PAPER[cfg.excel.paper] || PAPER.A4).inch, m = marginsInch(cfg.excel);
        return ((landscape ? p[1] : p[0]) - m[0] - m[1]) * 13 * 11 / cfg.fontSizes.latin;
    }
    /** The widest columns shrink first until the total fits, never below the floor. */
    function shrinkTo(ws, target, floor) {
        const sum = function (cap) { return ws.reduce(function (a, w) { return a + Math.min(w, Math.max(cap, floor)); }, 0); };
        if (sum(Infinity) <= target) return ws;
        let lo = floor, hi = Math.max.apply(null, ws);
        for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (sum(mid) > target) hi = mid; else lo = mid; }
        return ws.map(function (w) { return Math.min(w, lo); });
    }
    function sheetLayout(plan, cfg) {
        let widths = columnWidths(plan, cfg);
        const total = widths.reduce(function (a, b) { return a + b; }, 0);
        const o = cfg.excel.orientation;
        const landscape = o === 'landscape' || (o === 'auto' && total > pageChars(false, cfg));
        if (cfg.excel.columns === 'page') widths = shrinkTo(widths, pageChars(landscape, cfg), 6);
        return { widths: widths, landscape: landscape };
    }

    // =========================================================================
    // Styles (xl/styles.xml): one cell format per role × content kind
    // =========================================================================

    function styleBook(cfg) {
        const x = cfg.excel, F = cfg.fonts, S = cfg.fontSizes;
        const fonts = [], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
        const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'], xfs = [], cache = new Map();
        const put = function (arr, s) { let i = arr.indexOf(s); if (i < 0) { arr.push(s); i = arr.length - 1; } return i; };
        const charset = function (name) {
            const cs = cfg.charsets[name] || (ARABIC_ONLY_FONT.test(name) ? 178 : 0);
            return cs ? '<charset val="' + cs + '"/>' : '';
        };
        const font = function (o) {
            return put(fonts, '<font>' + (o.b ? '<b/>' : '') + (o.u ? '<u/>' : '') + '<sz val="' + o.sz + '"/>' +
                (o.color ? '<color rgb="' + argb(o.color) + '"/>' : '<color theme="1"/>') +
                '<name val="' + xmlEsc(o.name) + '"/><family val="2"/>' + charset(o.name) + '</font>');
        };
        const border = function (kind, w, color) {
            if (kind !== 'all') return 0;
            const side = function (t) { return '<' + t + ' style="' + (w === 'medium' ? 'medium' : 'thin') + '"><color rgb="' + argb(color) + '"/></' + t + '>'; };
            return put(borders, '<border>' + side('left') + side('right') + side('top') + side('bottom') + '<diagonal/></border>');
        };
        const xf = function (o) {
            const a = o.al ? ' applyAlignment="1"><alignment ' + o.al + '/></xf>' : '/>';
            return put(xfs, '<xf numFmtId="' + (o.nf || 0) + '" fontId="' + (o.font || 0) + '" fillId="' + (o.fill || 0) +
                '" borderId="' + (o.border || 0) + '" xfId="0"' + (o.nf ? ' applyNumberFormat="1"' : '') +
                (o.font ? ' applyFont="1"' : '') + (o.fill ? ' applyFill="1"' : '') + (o.border ? ' applyBorder="1"' : '') + a);
        };

        font({ name: F.latin, sz: S.latin });     // font 0 = the Normal style; column widths are measured in it
        xf({});                                    // xf 0 = Normal
        const headFill = put(fills, '<fill><patternFill patternType="solid"><fgColor rgb="' + argb(x.headerColor) + '"/><bgColor indexed="64"/></patternFill></fill>');
        const headBorder = border(x.headerBorder, x.headerBorderWidth, x.headerBorderColor);
        const bodyBorder = border(x.bodyBorder, x.bodyBorderWidth, x.bodyBorderColor);
        const ink = inkOn(x.headerColor);

        function cell(role, v, isLink, multiline) {
            if (role === 'gap') return 0;
            const cls = cellClass(v), bidi = usesBidiFont(v, cls), wrap = wrapsCell(x, multiline);
            const key = role + cls + bidi + !!isLink + wrap + (typeof v === 'number' ? (Number.isInteger(v) ? 'i' : 'd') : typeof v);
            if (cache.has(key)) return cache.get(key);
            const face = bidi ? F.bidi : F.latin, sz = bidi ? S.bidi : S.latin;
            const ro = cls === 'fa' ? 2 : cls === 'en' ? 1 : 0;
            const hz = cls === 'fa' ? 'right' : cls === 'en' ? 'left' : (cls === 'empty' ? '' : 'center');
            const al = function (h, w) { return (h ? 'horizontal="' + h + '" ' : '') + 'vertical="center"' + (w ? ' wrapText="1"' : '') + (ro ? ' readingOrder="' + ro + '"' : ''); };
            let s;
            if (role === 'head') s = xf({ font: font({ name: face, sz: sz, b: true, color: ink }), fill: headFill, border: headBorder, al: al('center', wrap) });
            else if (role === 'title') s = xf({ font: font({ name: face, sz: sz + 2, b: true }), al: al(hz, false) });
            else {
                let nf = 0;
                if (typeof v === 'number' && x.thousands) nf = Number.isInteger(v) ? 3 : 164;
                else if (cls === 'num' && typeof v === 'string') nf = 49;       // digits kept as text (leading zeros)
                const f = isLink ? font({ name: face, sz: sz, u: true, color: '#0563C1' }) : font({ name: face, sz: sz });
                s = xf({ nf: nf, font: f, border: bodyBorder, al: al(hz, wrap) });
            }
            cache.set(key, s);
            return s;
        }
        function xml() {
            return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
                '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
                '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.##########"/></numFmts>' +
                '<fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts>' +
                '<fills count="' + fills.length + '">' + fills.join('') + '</fills>' +
                '<borders count="' + borders.length + '">' + borders.join('') + '</borders>' +
                '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
                '<cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs>' +
                '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
                '<dxfs count="1"><dxf><fill><patternFill patternType="solid"><bgColor rgb="' + argb(x.stripeColor) + '"/></patternFill></fill></dxf></dxfs>' +
                '<tableStyles count="0" defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotStyleMedium4"/></styleSheet>';
        }
        return { cell: cell, xml: xml };
    }

    // =========================================================================
    // Polish: SheetJS's sheet XML rewritten (views, columns, cell styles, stripes, print)
    // =========================================================================

    /** `add` before the first of `tags` found (the schema's order matters). */
    function insertBefore(xml, tags, add) {
        let at = -1;
        tags.forEach(function (t) { const i = xml.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i; });
        if (at < 0) at = xml.lastIndexOf('</worksheet>');
        return xml.slice(0, at) + add + xml.slice(at);
    }
    const AFTER_CF = ['<dataValidations', '<hyperlinks', '<printOptions', '<pageMargins', '<pageSetup', '<headerFooter', '<rowBreaks', '<colBreaks', '<ignoredErrors', '<drawing', '<legacyDrawing', '<tableParts', '<extLst', '</worksheet>'];
    const AFTER_PRINT = ['<rowBreaks', '<colBreaks', '<customProperties', '<cellWatches', '<ignoredErrors', '<smartTags', '<drawing', '<legacyDrawing', '<picture', '<oleObjects', '<controls', '<webPublishItems', '<tableParts', '<extLst', '</worksheet>'];

    function polishSheet(xml, plan, st, cfg) {
        const x = cfg.excel, aoa = plan.aoa, width = plan.width, roles = plan.roles;
        const lay = sheetLayout(plan, cfg);

        if (x.fit) {                                                       // fit to the page's width
            if (/<sheetPr\b[^>]*\/>/.test(xml)) xml = xml.replace(/<sheetPr\b([^>]*)\/>/, '<sheetPr$1><pageSetUpPr fitToPage="1"/></sheetPr>');
            else if (/<sheetPr\b/.test(xml)) xml = xml.replace('</sheetPr>', '<pageSetUpPr fitToPage="1"/></sheetPr>');
            else xml = xml.replace(/(<worksheet\b[^>]*>)/, '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
        }
        const pane = plan.freeze ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>' : '';
        const view = '<sheetViews><sheetView' + (plan.rtl ? ' rightToLeft="1"' : '') + (plan.index === 0 ? ' tabSelected="1"' : '') +
            ' workbookViewId="0">' + pane + '</sheetView></sheetViews>';
        if (/<sheetViews>/.test(xml)) xml = xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, view);
        else xml = xml.replace(/(<dimension[^>]*\/>)/, '$1' + view);

        let cols = lay.widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w.toFixed(2) + '" customWidth="1"/>'; }).join('');
        if (plan.spacer) cols += '<col min="' + (width + 1) + '" max="' + (width + 1) + '" width="1.7" customWidth="1"/>';
        xml = xml.replace(/<cols>[\s\S]*?<\/cols>/, '');
        if (cols) xml = xml.replace('<sheetData', '<cols>' + cols + '</cols><sheetData');

        xml = xml.replace(/<c r="([A-Z]+)(\d+)"([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g, function (m, col, row, attrs, end) {
            const r = +row - 1, c = decodeCol(col);
            attrs = attrs.replace(/\s+s="\d+"/, '');
            if (r >= aoa.length || c >= width) return '<c r="' + col + row + '"' + attrs + end;     // the spacer column
            const v = aoa[r][c];
            const s = st.cell(roles[r], v, plan.links.has(r + ',' + c), typeof v === 'string' && v.indexOf('\n') >= 0);
            if (v === '' || v == null) return '<c r="' + col + row + '"' + (s ? ' s="' + s + '"' : '') + '/>';
            return '<c r="' + col + row + '"' + (s ? ' s="' + s + '"' : '') + attrs + end;
        });

        if (x.stripes && width) {                                          // stripes as conditional formatting: sorting keeps them
            const last = encodeCol(width - 1);
            let cf = '', prio = 1;
            plan.blocks.forEach(function (b) {
                if (b.last - b.first < 1) return;
                cf += '<conditionalFormatting sqref="A' + (b.first + 1) + ':' + last + (b.last + 1) + '"><cfRule type="expression" dxfId="0" priority="' + (prio++) +
                    '"><formula>MOD(ROW()-' + (b.first + 1) + ',2)=1</formula></cfRule></conditionalFormatting>';
            });
            if (cf) xml = insertBefore(xml, AFTER_CF, cf);
        }
        if (+x.headerHeight) {                                             // the header row's height, unless its text wraps
            roles.forEach(function (role, r) {
                if (role !== 'head') return;
                if (x.wrap === 'all' || aoa[r].some(function (v) { return typeof v === 'string' && v.indexOf('\n') >= 0 && wrapsCell(x, true); })) return;
                xml = xml.replace(new RegExp('<row r="' + (r + 1) + '"([^>]*?)(/?)>'), function (m, at, sc) {
                    return '<row r="' + (r + 1) + '"' + at.replace(/\s+(ht|customHeight)="[^"]*"/g, '') + ' ht="' + (+x.headerHeight) + '" customHeight="1"' + sc + '>';
                });
            });
        }
        const mg = marginsInch(x), paper = PAPER[x.paper] || PAPER.A4;
        xml = xml.replace(/<printOptions[^>]*\/>|<pageMargins[^>]*\/>|<pageSetup[^>]*\/>|<headerFooter[\s\S]*?<\/headerFooter>/g, '');
        const print = (x.center ? '<printOptions horizontalCentered="1"/>' : '') +
            '<pageMargins left="' + mg[0] + '" right="' + mg[1] + '" top="' + mg[2] + '" bottom="' + mg[3] + '" header="' + mg[4] + '" footer="' + mg[5] + '"/>' +
            '<pageSetup paperSize="' + paper.code + '" orientation="' + (lay.landscape ? 'landscape' : 'portrait') + '"' + (x.fit ? ' fitToWidth="1" fitToHeight="0"' : '') + '/>' +
            (x.headerFooter ? '<headerFooter><oddHeader>&amp;C&amp;A</oddHeader><oddFooter>&amp;C&amp;P / &amp;N</oddFooter></headerFooter>' : '');
        return insertBefore(xml, AFTER_PRINT, print);
    }

    async function polishXlsx(data, plans, cfg, JSZip) {
        const zip = await JSZip.loadAsync(data);
        const st = styleBook(cfg);
        let wbXml = await zip.file('xl/workbook.xml').async('string');
        const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
        const rids = Array.from(wbXml.matchAll(/<sheet\b[^>]*?r:id="([^"]+)"/g)).map(function (m) { return m[1]; });
        const names = [];
        for (let i = 0; i < rids.length && i < plans.length; i++) {
            const rel = rels.match(new RegExp('<Relationship\\b[^>]*Id="' + rids[i] + '"[^>]*>'));
            const target = rel && (rel[0].match(/Target="([^"]+)"/) || [])[1];
            if (!target) throw new XlsxBuilderError('XlsxBuilder: sheet ' + (i + 1) + ' not found');
            const path = target[0] === '/' ? target.slice(1) : 'xl/' + target;
            const plan = plans[i];
            zip.file(path, polishSheet(await zip.file(path).async('string'), plan, st, cfg));
            const q = "'" + plan.name.replace(/'/g, "''") + "'!";
            const lastCol = encodeCol(Math.max(plan.width, 1) - 1);
            if (plan.aoa.length) names.push('<definedName name="_xlnm.Print_Area" localSheetId="' + i + '">' + xmlEsc(q + '$A$1:$' + lastCol + '$' + plan.aoa.length) + '</definedName>');
            if (plan.freeze) names.push('<definedName name="_xlnm.Print_Titles" localSheetId="' + i + '">' + xmlEsc(q + '$1:$1') + '</definedName>');
        }
        if (names.length) {
            if (wbXml.indexOf('</definedNames>') >= 0) wbXml = wbXml.replace('</definedNames>', names.join('') + '</definedNames>');
            else wbXml = wbXml.replace('</sheets>', '</sheets><definedNames>' + names.join('') + '</definedNames>');
            zip.file('xl/workbook.xml', wbXml);
        }
        zip.file('xl/styles.xml', st.xml());
        return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: XlsxBuilder.MIME });
    }

    // =========================================================================
    // CSV
    // =========================================================================

    function csvField(v, sep) {
        const s = typeof v === 'number' ? String(v) : String(v == null ? '' : v);
        return s.indexOf(sep) >= 0 || /["\r\n]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }

    // =========================================================================
    // The builder
    // =========================================================================

    class XlsxBuilder {
        constructor() {
            this._cfg = {
                fonts: { bidi: 'B Nazanin', latin: 'Calibri' },
                fontSizes: { bidi: 12, latin: 11.5 },
                excel: Object.assign({}, DEFAULTS),
                charsets: {},
                words: { table: 'Table', data: 'Data', sheet: 'Sheet' },
                title: ''
            };
            this._tables = [];
        }
        static create() { return new XlsxBuilder(); }

        /**
         * fonts { bidi, latin } · fontSizes { bidi, latin } (pt) · excel { see DEFAULTS } · charsets { font: Windows
         * character set } · words { table: «Table» (a table without a name: «Table 2»), data: the one sheet's name
         * without a title, sheet } · title (the one sheet's name). An unknown key throws.
         */
        configure(o) {
            o = o || {};
            const c = this._cfg;
            Object.keys(o).forEach(function (k) {
                if (!(k in c)) throw new XlsxBuilderError('XlsxBuilder.configure: unknown option ' + k);
            });
            ['fonts', 'fontSizes', 'charsets', 'words'].forEach(function (k) { if (o[k]) Object.assign(c[k], o[k]); });
            if (o.excel) {
                Object.keys(o.excel).forEach(function (k) {
                    if (!(k in DEFAULTS)) throw new XlsxBuilderError('XlsxBuilder.configure: unknown excel option ' + k);
                    if (o.excel[k] != null) c.excel[k] = o.excel[k];
                });
            }
            if (o.title != null) c.title = String(o.title);
            ['bidi', 'latin'].forEach(function (k) { c.fontSizes[k] = +c.fontSizes[k] || (k === 'bidi' ? 12 : 11); });
            return this;
        }

        /** Every table of a Markdown text (o.marked: a marked instance, else the global one). */
        addFromMarkdown(md, o) {
            const self = this, x = this._cfg.excel;
            findTables(md, Object.assign({ links: x.links, breaks: x.breaks }, o || {})).forEach(function (t) { self._tables.push(t); });
            return this;
        }

        /**
         * One table: name, rows (arrays of strings; the first is the header), o.links { 'r,c': target } (r counts
         * the header as 0).
         */
        addSheet(name, rows, o) {
            const links = (o && o.links) || {};
            const cell = function (r, c, v) { return { v: v == null ? '' : String(v), link: links[r + ',' + c] || null }; };
            const all = (rows || []).map(function (r, ri) { return (r || []).map(function (v, ci) { return cell(ri, ci, v); }); });
            this._tables.push({ name: name || '', header: all[0] || [], rows: all.slice(1) });
            return this;
        }

        /** The tables read so far: [{ name (unique, a legal sheet name), header, rows, cols }]. */
        sheets() {
            const w = this._cfg.words;
            const names = uniquify(this._tables.map(function (t, i) { return cleanSheet(t.name, w.table + ' ' + (i + 1)); }), 31);
            return this._tables.map(function (t, i) {
                const cols = Math.max(t.header.length, t.rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0));
                return { name: names[i], header: t.header, rows: t.rows, cols: cols };
            });
        }

        /**
         * The sheets as they are written: [{ name, index, aoa (values: strings and numbers), width, roles ('head' |
         * 'body' | 'title' | 'gap' per row), blocks (body row ranges, for the stripes), links (Set of 'r,c'),
         * linkTo (Map 'r,c' → target), rtl, filter, freeze, spacer, tables }].
         */
        plans() {
            const cfg = this._cfg, x = cfg.excel, sheets = this.sheets();
            const grid = function (t) {
                const g = [t.header].concat(t.rows), w = g.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
                return g.map(function (r) { const o = r.slice(); while (o.length < w) o.push({ v: '', link: null }); return o; });
            };
            const make = function (name, index, cells, roles, blocks, single, tables) {
                const width = cells.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
                const aoa = cells.map(function (r) {
                    const o = r.map(function (c) { return roles && c.role === 'title' ? c.v : coerce(c.v, x.zeros); });
                    while (o.length < width) o.push('');
                    return o;
                });
                const links = new Set(), linkTo = new Map();
                if (x.links) cells.forEach(function (r, ri) { r.forEach(function (c, ci) { if (c.link) { links.add(ri + ',' + ci); linkTo.set(ri + ',' + ci, c.link); } }); });
                let rtl = x.direction === 'rtl';
                if (x.direction === 'auto') {
                    let fa = 0, en = 0;
                    aoa.forEach(function (r) { r.forEach(function (v) { if (typeof v !== 'string' || !v) return; if (RX_FA_LETTER.test(v)) fa++; else if (RX_EN_LETTER.test(v)) en++; }); });
                    rtl = fa > 0 && fa >= en;
                }
                const r = roles || aoa.map(function (_, i) { return i ? 'body' : 'head'; });
                const head = r[0] === 'head' && aoa.length > 1 && width > 0;
                return {
                    name: name, index: index, aoa: aoa, width: width, roles: r, rtl: rtl, links: links, linkTo: linkTo, tables: tables,
                    blocks: blocks || [{ first: 1, last: aoa.length - 1 }],
                    filter: !!x.filter && single && head, freeze: !!x.freeze && single && head,
                    spacer: x.wrap !== 'all' && width > 0
                };
            };
            if (x.sheets !== 'one' || sheets.length < 2) {
                return sheets.map(function (s, i) { return make(s.name, i, grid(s), null, null, true, 1); });
            }
            const cells = [], roles = [], blocks = [];
            sheets.forEach(function (s, i) {
                if (i) for (let k = 0; k < (+x.gap || 0); k++) { cells.push([]); roles.push('gap'); }
                if (x.titleRow) { cells.push([{ v: s.name, link: null, role: 'title' }]); roles.push('title'); }
                const g = grid(s);
                g.forEach(function (r, k) { cells.push(r); roles.push(k ? 'body' : 'head'); });
                blocks.push({ first: cells.length - g.length + 1, last: cells.length - 1 });
            });
            return [make(cleanSheet(cfg.title, cfg.words.data), 0, cells, roles, blocks, false, sheets.length)];
        }

        /** The workbook (.xlsx). Needs SheetJS (o.XLSX or global XLSX) and JSZip (o.JSZip or global JSZip). */
        async toBlob(o) {
            o = o || {};
            const X = o.XLSX || global.XLSX, Z = o.JSZip || global.JSZip;
            if (!X || !X.utils) throw new XlsxBuilderError('XlsxBuilder: SheetJS (XLSX) is needed for .xlsx');
            if (!Z) throw new XlsxBuilderError('XlsxBuilder: JSZip is needed for .xlsx');
            const plans = this.plans();
            if (!plans.length) throw new XlsxBuilderError('XlsxBuilder: no table to write');
            const wb = X.utils.book_new();
            plans.forEach(function (p) {
                const ws = X.utils.aoa_to_sheet(p.spacer ? p.aoa.map(function (r) { return r.concat(' '); }) : p.aoa);
                p.linkTo.forEach(function (target, k) {
                    const rc = k.split(',').map(Number), addr = X.utils.encode_cell({ r: rc[0], c: rc[1] });
                    if (ws[addr]) ws[addr].l = { Target: target };
                });
                if (p.filter) ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: p.aoa.length - 1, c: p.width - 1 } }) };
                X.utils.book_append_sheet(wb, ws, p.name);
            });
            const raw = X.write(wb, { type: 'array', bookType: 'xlsx', compression: true });
            return polishXlsx(raw, plans, this._cfg, Z);
        }

        /** One CSV per sheet: [{ name: «sheet.csv» (ASCII digits, unique), text }] (excel.csvSeparator, CRLF lines). */
        toCsvFiles() {
            const x = this._cfg.excel, sep = x.csvSeparator === '\\t' || x.csvSeparator === 'tab' ? '\t' : (x.csvSeparator || ',');
            const plans = this.plans();
            const names = uniquify(plans.map(function (p) {
                return (Array.from(toAscii(p.name)).filter(function (ch) { return ch.charCodeAt(0) >= 32; }).join('').replace(BAD_FILE, '-').replace(/\s+/g, ' ').trim() || 'sheet');
            }), 90).map(function (n) { return n + '.csv'; });
            return plans.map(function (p, i) {
                const text = p.aoa.map(function (r) { return r.map(function (v) { return csvField(v, sep); }).join(sep); }).join('\r\n') + '\r\n';
                return { name: names[i], text: (x.csvBom ? '\uFEFF' : '') + text };
            });
        }

        /** The CSV files in a zip (JSZip: o.JSZip or global). */
        async toCsvZip(o) {
            const Z = (o && o.JSZip) || global.JSZip;
            if (!Z) throw new XlsxBuilderError('XlsxBuilder: JSZip is needed for the CSV zip');
            const files = this.toCsvFiles();
            if (!files.length) throw new XlsxBuilderError('XlsxBuilder: no table to write');
            const zip = new Z();
            files.forEach(function (f) { zip.file(f.name, f.text); });
            return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/zip' });
        }
    }

    // =========================================================================
    // Preview: a block per sheet, its first rows (the exports hold every row)
    // =========================================================================

    const PREVIEW_CSS = [
        '.kx-sheets{display:flex;flex-direction:column;gap:18px;padding:16px;min-width:0}',
        '.kx-note{margin:0;padding:8px 12px;border-radius:8px;background:var(--accent-soft,#e9f3f0);color:var(--ink,#1b1b1b);font-size:13px;line-height:1.6}',
        '.kx-note.warn{background:#fdf1e3;color:#7a4a00}',
        '.kx-sheet{background:#fff;color:#1b1b1b;border:1px solid #d6dbe1;border-radius:10px;box-shadow:0 1px 2px rgba(0,0,0,.06);min-width:0;overflow:hidden}',
        '.kx-head{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:baseline;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #e3e7eb;background:#fafbfc}',
        '.kx-name{font-weight:700;font-size:14px;overflow-wrap:anywhere}',
        '.kx-size{font-size:12px;color:#5f6b78;white-space:nowrap}',
        '.kx-scroll{overflow:auto;max-height:min(65vh,620px);overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch;touch-action:pan-x pan-y}',
        '.kx-scroll:focus-visible{outline:2px solid var(--accent,#1f6f5c);outline-offset:-2px}',
        '.kx-grid{border-collapse:separate;border-spacing:0;font-size:13px;line-height:1.45;font-family:var(--kx-bidi),var(--kx-latin),system-ui,sans-serif}',
        '.kx-grid th,.kx-grid td{padding:4px 8px;white-space:pre;vertical-align:middle;' +
            'border-inline-end:var(--kx-bw,1px) solid var(--kx-bc,#a9b5c4);border-bottom:var(--kx-bw,1px) solid var(--kx-bc,#a9b5c4)}',
        '.kx-grid.nob td{border-color:transparent}',
        '.kx-grid thead th{position:sticky;top:0;z-index:2;background:var(--kx-head,#e4e9ef);color:var(--kx-ink,#1b1b1b);font-weight:700;text-align:center;' +
            'border-inline-end:var(--kx-hbw,1px) solid var(--kx-hbc,#a9b5c4);border-bottom:var(--kx-hbw,1px) solid var(--kx-hbc,#a9b5c4)}',
        '.kx-grid.noh thead th{border-color:transparent}',
        '.kx-grid .kx-rn{position:sticky;inset-inline-start:0;z-index:1;background:#f1f3f5;color:#6b7684;font:11px/1.45 system-ui,sans-serif;text-align:center;min-width:2.6em;padding:4px;border-color:#dde1e6}',
        '.kx-grid thead .kx-rn{z-index:3;background:#e9ecef}',
        '.kx-grid.st tbody tr.b2 td{background:var(--kx-stripe,#f5f7fa)}',
        '.kx-grid tr.title td{font-weight:700;font-size:14px;border-color:transparent;background:#fff}',
        '.kx-grid tr.gap td{border-color:transparent;background:#fff;height:1.2em}',
        '.kx-grid tr.head td{background:var(--kx-head,#e4e9ef);color:var(--kx-ink,#1b1b1b);font-weight:700;text-align:center}',
        '.kx-grid .fa{text-align:right;font-family:var(--kx-bidi),system-ui,sans-serif}',
        '.kx-grid .en{text-align:left;font-family:var(--kx-latin),system-ui,sans-serif}',
        '.kx-grid .num,.kx-grid .sym{text-align:center;font-family:var(--kx-latin),system-ui,sans-serif}',
        '.kx-grid .num.fad{font-family:var(--kx-bidi),system-ui,sans-serif}',
        '.kx-grid .lnk{color:#0563c1;text-decoration:underline}',
        '.kx-more{margin:0;padding:6px 12px;font-size:12px;color:#5f6b78;border-top:1px solid #e3e7eb;background:#fafbfc}',
        '@media (max-width:600px){.kx-sheets{padding:8px;gap:12px}.kx-grid{font-size:12px}.kx-grid th,.kx-grid td{padding:3px 6px}.kx-scroll{max-height:60vh}}'
    ].join('\n');

    /**
     * The preview: plans (XlsxBuilder#plans) → HTML. o: { rows: body rows shown per sheet (20), excel (the colors,
     * borders, stripes, thousands; a cell breaks only at its own line breaks), fonts { bidi, latin }, size(rows, cols) → «N rows · M columns», more(n) →
     * «N more rows …», label (the scroll region's name, «sheet …»), note (HTML above the sheets) }.
     */
    function previewHtml(plans, o) {
        o = o || {};
        const x = Object.assign({}, DEFAULTS, o.excel || {});
        const limit = Math.max(1, +o.rows || 20);
        const f = o.fonts || {};
        const vars = '--kx-head:' + x.headerColor + ';--kx-ink:' + inkOn(x.headerColor) + ';--kx-stripe:' + x.stripeColor +
            ';--kx-bc:' + x.bodyBorderColor + ';--kx-bw:' + (x.bodyBorderWidth === 'medium' ? 2 : 1) + 'px' +
            ';--kx-hbc:' + x.headerBorderColor + ';--kx-hbw:' + (x.headerBorderWidth === 'medium' ? 2 : 1) + 'px' +
            ';--kx-bidi:"' + String(f.bidi || 'Vazirmatn').replace(/"/g, '') + '";--kx-latin:"' + String(f.latin || 'Calibri').replace(/"/g, '') + '"';
        const num = function (v) { return x.thousands ? v.toLocaleString('en-US', { maximumFractionDigits: 10 }) : String(v); };
        // like fenced code: a cell breaks only at its own line breaks, and a wide sheet scrolls in its block
        const td = function (v, isLink, tag) {
            const cls = cellClass(v);
            const c = [cls];
            if (cls === 'num' && typeof v === 'string' && RX_FA_DIGIT.test(v)) c.push('fad');
            if (isLink) c.push('lnk');
            const text = typeof v === 'number' ? num(v) : String(v == null ? '' : v);
            return '<' + tag + ' class="' + c.join(' ') + '" dir="auto">' + htmlEsc(text) + '</' + tag + '>';
        };
        let html = '<div class="kx-sheets" style="' + htmlEsc(vars) + '">' + (o.note || '');
        plans.forEach(function (p) {
            const single = p.roles[0] === 'head';
            const body = single ? p.aoa.length - 1 : p.aoa.length;
            const shown = Math.min(body, limit);
            const cls = 'kx-grid' + (x.stripes ? ' st' : '') + (x.bodyBorder === 'none' ? ' nob' : '') + (x.headerBorder === 'none' ? ' noh' : '');
            html += '<section class="kx-sheet" dir="' + (p.rtl ? 'rtl' : 'ltr') + '">' +
                '<header class="kx-head" dir="auto"><span class="kx-name" dir="auto">' + htmlEsc(p.name) + '</span>' +
                '<span class="kx-size">' + htmlEsc(o.size ? o.size(single ? body : p.aoa.length, p.width) : body + ' × ' + p.width) + '</span></header>' +
                '<div class="kx-scroll" tabindex="0" role="region" aria-label="' + htmlEsc((o.label || '') + p.name) + '"><table class="' + cls + '">';
            if (single) {
                html += '<thead><tr><th class="kx-rn">1</th>' + p.aoa[0].map(function (v, c) { return td(v, p.links.has('0,' + c), 'th'); }).join('') + '</tr></thead>';
            }
            html += '<tbody>';
            const start = single ? 1 : 0;
            let band = 0;
            for (let r = start; r < start + shown; r++) {
                const role = p.roles[r];
                if (role === 'body') band++; else band = 0;
                const rc = role === 'body' ? (band % 2 === 0 ? 'b2' : 'b1') : role;
                const cells = role === 'gap' ? p.aoa[r].map(function () { return '<td></td>'; }).join('')
                    : role === 'title' ? '<td colspan="' + p.width + '" dir="auto">' + htmlEsc(String(p.aoa[r][0])) + '</td>'
                        : p.aoa[r].map(function (v, c) { return td(v, p.links.has(r + ',' + c), 'td'); }).join('');
                html += '<tr class="' + rc + '"><th class="kx-rn" scope="row">' + (r + 1) + '</th>' + cells + '</tr>';
            }
            html += '</tbody></table></div>';
            if (body > shown) html += '<p class="kx-more" dir="auto">' + htmlEsc(o.more ? o.more(body - shown) : '… ' + (body - shown)) + '</p>';
            html += '</section>';
        });
        return html + '</div>';
    }

    XlsxBuilder.VERSION = VERSION;
    XlsxBuilder.DEFAULTS = DEFAULTS;
    XlsxBuilder.MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    XlsxBuilder.XlsxBuilderError = XlsxBuilderError;
    /** Every Markdown table of a text: [{ name, header, rows }] (o: { marked, links, breaks }). */
    XlsxBuilder.findTables = function (md, o) { return findTables(md, Object.assign({ links: true, breaks: true }, o || {})); };
    XlsxBuilder.previewHtml = previewHtml;
    XlsxBuilder.previewCss = function () { return PREVIEW_CSS; };
    // exposed for tests
    XlsxBuilder._coerce = coerce;
    XlsxBuilder._cellClass = cellClass;
    XlsxBuilder._cleanSheet = cleanSheet;
    XlsxBuilder._uniquify = uniquify;
    XlsxBuilder._csvField = csvField;

    if (typeof module !== 'undefined' && module.exports) module.exports = XlsxBuilder;
    else if (typeof define === 'function' && define.amd) define([], function () { return XlsxBuilder; });
    else global.XlsxBuilder = XlsxBuilder;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
