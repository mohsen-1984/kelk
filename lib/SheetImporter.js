/**
 * SheetImporter - CSV and Excel workbooks → Markdown tables, in the browser
 * ===========================================================================
 * Version: 1.0
 *
 * The read side of Kelk's Excel work (the write side: XlsxBuilder). Every sheet becomes one Markdown heading and one
 * GitHub Flavored Markdown table, so a CSV, a workbook and a Markdown text all share one pipeline: the editor holds
 * the tables, XlsxBuilder writes them.
 *
 *   const csv = SheetImporter.readCsv(bytes, { Papa });          // { rows, encoding, separator, error }
 *   const book = SheetImporter.readXlsx(bytes, { XLSX });        // [{ name, rows, hidden }]
 *   const md = SheetImporter.toMarkdown([{ name: 'Sales', rows: csv.rows }]);
 *
 * CSV: the encoding from the byte order mark, else UTF-8 when the bytes are valid UTF-8, else Windows-1256 (Persian
 * and Arabic files saved by older Excel); the separator guessed among , ; Tab and | (PapaParse). XLSX: the values as
 * Excel shows them (dates and formats as text); Kelk's own spacer column (one space per row) and the empty rows and
 * columns around the data are dropped. Formulas, merged cells and styles do not come in.
 * Markdown: the first row is the header; a line break in a cell becomes <br>; | * _ ` $ ~ < & are escaped where they
 * would change the text's meaning.
 */
(function (global) {
    'use strict';

    const VERSION = '1.0';
    const SEPARATORS = [',', ';', '\t', '|'];

    /** 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1256' */
    function sniffEncoding(bytes) {
        const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return 'utf-8';
        if (b[0] === 0xFF && b[1] === 0xFE) return 'utf-16le';
        if (b[0] === 0xFE && b[1] === 0xFF) return 'utf-16be';
        try { new TextDecoder('utf-8', { fatal: true }).decode(b); return 'utf-8'; } catch (e) { return 'windows-1256'; }
    }

    function decode(bytes, encoding) {
        const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        let s;
        try { s = new TextDecoder(encoding || 'utf-8').decode(b); } catch (e) { s = new TextDecoder('utf-8').decode(b); }
        return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
    }

    const blank = function (r) { return !r || r.every(function (c) { return c === '' || c == null; }); };

    /** Rows without the empty rows above and below the data, and without empty columns after it. */
    function trimRows(rows) {
        let a = 0, b = rows.length;
        while (a < b && blank(rows[a])) a++;
        while (b > a && blank(rows[b - 1])) b--;
        const out = rows.slice(a, b).map(function (r) { return (r || []).map(function (c) { return c == null ? '' : String(c); }); });
        let w = 0;
        out.forEach(function (r) { for (let i = r.length - 1; i >= 0; i--) if (r[i] !== '') { w = Math.max(w, i + 1); break; } });
        return out.map(function (r) { const o = r.slice(0, w); while (o.length < w) o.push(''); return o; });
    }

    /**
     * A CSV file: { rows, encoding, separator, error: null | 'empty' }. o: { Papa (else the global one), encoding,
     * separator } — given values are used as they are, missing ones guessed.
     */
    function readCsv(bytes, o) {
        o = o || {};
        const P = o.Papa || global.Papa;
        if (!P || !P.parse) throw new Error('SheetImporter: PapaParse is needed to read CSV');
        const encoding = o.encoding || sniffEncoding(bytes);
        const text = decode(bytes, encoding);
        if (!text.trim()) return { rows: [], encoding: encoding, separator: o.separator || ',', error: 'empty' };
        // the separator is guessed without the empty lines (PapaParse counts one as a row of one field, and then
        // never finds «;» in a file that ends with a line break), the file then read with the empty lines kept
        let separator = o.separator;
        if (!separator) {
            const g = P.parse(text, { delimiter: '', delimitersToGuess: SEPARATORS, skipEmptyLines: 'greedy', preview: 200, newline: '' });
            separator = (g.meta && g.meta.delimiter) || ',';
        }
        const res = P.parse(text, { delimiter: separator, skipEmptyLines: false, newline: '' });
        const rows = trimRows(res.data || []);
        return { rows: rows, encoding: encoding, separator: separator, error: rows.length ? null : 'empty' };
    }

    /**
     * A workbook (.xlsx, also .xls / .ods as SheetJS reads them): [{ name, rows, hidden }] in the workbook's order.
     * o: { XLSX (else the global SheetJS), raw: true for the stored values instead of the shown text, mergedRows:
     * 'repeat' (default) | 'empty' }. Merged cells follow Kelk's import rule (Word, HTML, PDF): a cell merged over
     * rows repeats its value in each row ('empty': in its first row only); a cell merged across columns is written
     * once, in its first column.
     */
    function readXlsx(bytes, o) {
        o = o || {};
        const X = o.XLSX || global.XLSX;
        if (!X || !X.read) throw new Error('SheetImporter: SheetJS is needed to read a workbook');
        const wb = X.read(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), { type: 'array', cellDates: true });
        const meta = (wb.Workbook && wb.Workbook.Sheets) || [];
        return wb.SheetNames.map(function (name, i) {
            const ws = wb.Sheets[name];
            let rows = X.utils.sheet_to_json(ws, { header: 1, raw: !!o.raw, defval: '', blankrows: true });
            rows = rows.map(function (r) { return r.map(function (c) { return c instanceof Date ? c.toISOString().slice(0, 10) : c; }); });
            if (o.mergedRows !== 'empty' && ws['!merges'] && ws['!ref']) {
                const at = X.utils.decode_range(ws['!ref']).s;          // rows[0][0] is the sheet's first used cell
                ws['!merges'].forEach(function (m) {
                    const r0 = m.s.r - at.r, c = m.s.c - at.c, row0 = rows[r0];
                    if (!row0 || c < 0) return;
                    for (let r = r0 + 1; r <= m.e.r - at.r && r < rows.length; r++) {
                        while (rows[r].length <= c) rows[r].push('');
                        rows[r][c] = row0[c];
                    }
                });
            }
            rows = trimRows(dropSpacer(rows));
            return { name: name, rows: rows, hidden: !!(meta[i] && meta[i].Hidden) };
        });
    }

    /** Kelk's trailing spacer column (XlsxBuilder: one space in each row) is not data. */
    function dropSpacer(rows) {
        let w = 0;
        rows.forEach(function (r) { w = Math.max(w, r.length); });
        if (!w) return rows;
        const last = rows.map(function (r) { return r[w - 1]; });
        const spacer = last.some(function (v) { return v === ' '; }) && last.every(function (v) { return v === ' ' || v === '' || v == null; });
        return spacer ? rows.map(function (r) { return r.slice(0, w - 1); }) : rows;
    }

    /** Text as Markdown inline text: what would turn into marks, math, HTML or an entity is escaped. */
    function inline(v) {
        return String(v == null ? '' : v)
            .replace(/\\(?=[!-/:-@[-`{-~])/g, '\\\\')
            .replace(/[*`$~]/g, '\\$&')
            .replace(/(^|[^\p{L}\p{N}])_|_(?=$|[^\p{L}\p{N}])/gu, function (m) { return m.replace('_', '\\_'); })
            .replace(/</g, '\\<')
            .replace(/&(?=#?[A-Za-z0-9]+;)/g, '&amp;');
    }
    /** A cell: inline text, | escaped, line breaks as <br>, spaces at its ends dropped (Markdown drops them). */
    function cell(v) {
        return inline(String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim())
            .replace(/\|/g, '\\|')
            .replace(/\n/g, '<br>');
    }

    /**
     * Sheets → Markdown: «## name», a blank line, the table (its first row the header), for each sheet with a row.
     * o: { level: the heading's level (2) }.
     */
    function toMarkdown(sheets, o) {
        const hashes = '#'.repeat(Math.min(6, Math.max(1, (o && o.level) || 2)));
        return sheets.filter(function (s) { return s.rows && s.rows.length; }).map(function (s) {
            const w = s.rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0) || 1;
            const line = function (r) {
                const c = [];
                for (let i = 0; i < w; i++) c.push(cell(r[i]));
                return '| ' + c.join(' | ') + ' |';
            };
            const out = [hashes + ' ' + (inline(String(s.name || '').replace(/\s+/g, ' ').trim()) || '—'), '', line(s.rows[0]),
                '|' + Array(w).fill(' --- ').join('|') + '|'];
            for (let r = 1; r < s.rows.length; r++) out.push(line(s.rows[r]));
            return out.join('\n');
        }).join('\n\n') + '\n';
    }

    /** { rows: the rows under the header, cols, cells } of a sheet's rows. */
    function size(rows) {
        const cols = (rows || []).reduce(function (m, r) { return Math.max(m, r.length); }, 0);
        return { rows: Math.max(0, (rows || []).length - 1), cols: cols, cells: (rows || []).length * cols };
    }

    const SheetImporter = {
        VERSION: VERSION, SEPARATORS: SEPARATORS,
        sniffEncoding: sniffEncoding, decode: decode,
        readCsv: readCsv, readXlsx: readXlsx, toMarkdown: toMarkdown, size: size,
        _cell: cell, _trimRows: trimRows
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = SheetImporter;
    else if (typeof define === 'function' && define.amd) define([], function () { return SheetImporter; });
    else global.SheetImporter = SheetImporter;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
