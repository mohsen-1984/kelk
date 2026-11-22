/**
 * PdfImporter — can the text be trusted (lib/pdfimport/trust.js)
 * ============================================================================
 * The importer's signs of a bad page (ladder.js) are structural — lost glyphs, glued words, unclear gaps: none reads
 * the letters, and a font whose every letter is named wrong scores 1. The judge reads them: per font, over the whole
 * document, is its text language?
 *
 *   PdfImporter._trust.judge(runs)   runs: arrays of glyphs in reading order ({ ch, font, space, page }) → per font
 *                                    { ar, la, garbled, why, pages }: the measures of its Arabic-script words and of
 *                                    its Latin words, and the verdict. Pure.
 *   this._trustRuns(blocks)          the glyph runs of the layout's blocks (paragraphs, items, headings, cells)
 *   this._trustReport(blocks, fonts) the finding: this._note('garbledText', …) with its pages; this._garbled =
 *                                    { fonts, pages, share } for the report and the pages' confidence (_ladReport)
 *
 * The measures (letters folded as the importer folds them; a word: letters between spaces, ZWNJs and other characters):
 *   ar.unseen   the share of letter pairs inside Arabic-script words that neither our Persian nor our Arabic text
 *               writes (letterstats.js; the language that fits best) — a wrong ToUnicode scatters letters at random
 *   ar.single   the share of one-letter words but «و» — forms named by spaces split words into letters
 *   ar.punct    the share of words with an ASCII or Latin-1 sign between two Arabic letters
 *   la.unseen   the same share of pairs for Latin words (a–z), against our English text
 *   la.signs    the share of Latin words holding a Latin-1 sign or symbol (¼ » ¿ ¯ × …) — codes read as Latin-1
 *   la.odd      the share of Latin words with a sign between letters or digits, or made of signs alone — codes read
 *               as ASCII; a verdict only when the font's program names no character (a font of figures is odd too)
 * A font is judged only with enough text (trustMinLetters). Report only: the Markdown is not touched.
 * Load after ladder.js, with letterstats.js before it.
 */
(function (global) {
    'use strict';
    const PdfImporter = global.PdfImporter || (typeof require === 'function' ? require('../PdfImporter.js') : null);
    const nfkcArabic = PdfImporter._internal.nfkcArabic;
    const X = 'trust.js ';
    PdfImporter._defineThresholds({
        trustMinLetters: { def: 150, unit: 'letters', used: [X + 'judge'], fixed: true },
        // (the lab's clean fonts and its garbled ones, 2026-11: unseen 0.04 at most against 0.14 and more; single 0.03
        // against 0.13; punct 0.06 against 0.09; Latin unseen 0.01 against 0.18; signs 0.09 against 0.9; odd 0.10
        // against 0.25)
        trustArUnseen: { def: 0.08, unit: 'share', used: [X + 'judge'], fixed: true },
        trustArSingle: { def: 0.08, unit: 'share', used: [X + 'judge'], fixed: true },
        trustArPunct: { def: 0.075, unit: 'share', used: [X + 'judge'], fixed: true },
        trustLaUnseen: { def: 0.12, unit: 'share', used: [X + 'judge'], fixed: true },
        trustLaMinPairs: { def: 100, unit: 'pairs', used: [X + 'judge'], fixed: true },
        trustLaSigns: { def: 0.25, unit: 'share', used: [X + 'judge'], fixed: true },
        trustLaOdd: { def: 0.2, unit: 'share', used: [X + 'judge'], fixed: true },
        // the font arbiter: a font is known by its outlines when a face of the fontprints names this share of the
        // glyphs it draws, and this many; the file's names are trusted but for a few when they agree with the face
        // on this share of those glyphs — under it the file's names are not the font's (a renumbered or wrong map)
        // (the lab, 2026-11: a known face names every drawn glyph; a healthy map agrees on 0.97 and more, a wrong
        // one on 0.2 and less)
        // a font too small to judge alone, its letters mostly accented Latin in a document of Arabic script: at least
        // this many such letters (a year of four digits read as four accented letters: the lab's «ÝÙÝÚ»)
        trustForeignMin: { def: 4, unit: 'letters', used: [X + 'judge'], fixed: true },
        trustPrintMinGlyphs: { def: 12, unit: 'glyphs', used: [X + '_fontArbiter'], fixed: true },
        trustPrintKnown: { def: 0.8, unit: 'share', used: [X + '_fontArbiter'], fixed: true },
        trustPrintAgree: { def: 0.85, unit: 'share', used: [X + '_fontArbiter'], fixed: true },
        // the approximate reading of a font Kelk does not know (3.2): its reading is taken when its letter pairs no
        // language of ours writes and its glyphs' mean distance from their characters' shapes are at most these, with
        // this many letters. Set on the fonts Kelk ships only (tools/calibrate-shapes.js, 2026-11-19; never the lab's
        // files): each family drawing our docs/ text, read against the others — the right readings of 600 letters
        // showed unseen 0.18 and distance 0.15 at most (Arabic script), 0.035 and 0.09 (Latin); the same pages in a
        // font of another glyph's shapes 0.30 and 0.09, of bars 0.20 and 0.11 at least. Under 20 letters nothing is taken
        trustApproxMinLetters: { def: 20, unit: 'letters', used: [X + '_fontApprox'], fixed: true },
        // … and only when the file's own names agree with the reading on under half of the font's letters (a font the
        // file names right reads back 83 % the same at the fewest; a renumbered one next to none)
        trustApproxAgree: { def: 0.5, unit: 'share', used: [X + '_fontApprox'], fixed: true },
        trustApproxArUnseen: { def: 0.19, unit: 'share', used: [X + '_fontApprox'], fixed: true },
        trustApproxArDist: { def: 0.18, unit: 'distance', used: [X + '_fontApprox'], fixed: true },
        trustApproxLaUnseen: { def: 0.04, unit: 'share', used: [X + '_fontApprox'], fixed: true },
        trustApproxLaDist: { def: 0.1, unit: 'distance', used: [X + '_fontApprox'], fixed: true },
        // the decipherment (3.5, decipher.js; the font-recovery spike's measures): a gap of decGap × the size between two
        // glyphs breaks a word (a print driver draws no space); a font of Arabic script joins forward on decJoin of its uses
        decGap: { def: 0.22, unit: 'em', used: [X + '_decUsage'], fixed: true },
        decJoin: { def: 0.3, unit: 'share', used: [X + '_decipherFonts'], fixed: true },
        // OCR's votes (3.5): for a font under decOcrUses glyph uses (and any font read low, or with digits no anchor
        // reached), at most decOcrRuns lines read
        decOcrUses: { def: 1000, unit: 'count', used: [X + '_decipherFonts'], fixed: true },
        // the ToUnicode cross-check: a font whose file names a glyph as two letters or more on this share of its uses
        decMultiShare: { def: 0.005, unit: 'share', used: [X + '_decCrossCheck'], fixed: true },
        decOcrRuns: { def: 60, unit: 'count', used: [X + '_decVotes'], fixed: true },
        // lost text (3.1): a page short of more than this many letters with no known reason, and of this share of its own
        lostTextMin: { def: 20, unit: 'letters', used: [X + '_lostOut'], fixed: true },
        lostTextShare: { def: 0.01, unit: 'share', used: [X + '_lostOut'], fixed: true }
    });
    const T = function (name) { return PdfImporter._thresholds[name].def; };
    const AR = /[\u0621-\u063A\u0641-\u064A\u067E\u0686\u0698\u06A9\u06AF\u06CC]/, LA = /[A-Za-z]/;
    const SIGN = /[\u00A1-\u00BF\u00D7\u00F7\u02C6-\u02DC\u2018-\u203A\u0192\u0152\u0153\u0160\u0161\u0178]/;
    const fold = function (s) { return nfkcArabic(String(s || '')).replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[\u064A\u0649]/g, '\u06CC').replace(/\u0643/g, '\u06A9'); };
    const ODD_IN = /[A-Za-z0-9][^A-Za-z0-9'\u2019.,:\/@_\u00C0-\u024F-]+[A-Za-z0-9]/, ODD_ALL = /^[^A-Za-z0-9]{3,}$/;
    const BLANK = /^[\s\u200C\u200B]*$/;
    const PE = /[\u067E\u0686\u0698\u06AF]/;
    const ARB_CTRL = /^[\u0000-\u0008\u000B\u000C\u000E-\u001F]$/;
    const ARB_DIGIT = /^[0-9\u0660-\u0669\u06F0-\u06F9]$/, ARB_MIRROR = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<', '\u00AB': '\u00BB', '\u00BB': '\u00AB' };
    // the hidden-text block: the note it opens with, the label of a piece («page N — reason:»), the reasons — in the
    // document's language (_noteLang). The lab's files expect these words (tests/pdf-lab/scripts/rtl_pdf2.py, HIDDEN:
    // keep them in step).
    const WHY = ['off', 'white', 'tiny', 'invisible'], MARK = 'KelkHiddenTextBlock';
    const HIDDEN = {
        fa: ['> [!WARNING]\n> **متن پنهان (hidden text)**: این بخش متنی است که در فایل هست ولی هنگام نمایش دیده نمی‌شود. آن را بررسی کنید و در بیشتر موارد حذف کنید؛ چنین متنی می‌تواند برای ابزارهای هوش مصنوعی دستور پنهان (prompt injection) باشد.\n',
             'صفحهٔ %d — %s:', { off: 'بیرون از صفحه', white: 'سفید روی سفید', tiny: 'بسیار ریز', invisible: 'نامریی' }],
        ar: ['> [!WARNING]\n> **نص مخفي (hidden text)**: هذا الجزء نص موجود في الملف لكنه لا يظهر عند عرضه. راجعه واحذفه في أغلب الحالات؛ فمثل هذا النص قد يكون تعليمات مخفية لأدوات الذكاء الاصطناعي (prompt injection).\n',
             'الصفحة %d — %s:', { off: 'خارج الصفحة', white: 'أبيض على أبيض', tiny: 'صغير جدًا', invisible: 'غير مرئي' }],
        en: ['> [!WARNING]\n> **Hidden text**: this part is text that exists in the file but is not shown when the file is viewed. Check it and in most cases delete it; such text can act as a hidden instruction for AI tools (prompt injection).\n',
             'Page %d — %s:', { off: 'off the page', white: 'white on white', tiny: 'too small to read', invisible: 'invisible' }]
    };
    /**
     * the block's Markdown — one quote, seen and deleted as one: the note, then each piece under its page and reason
     * as a `text` code block inside the quote (its fence longer than any run of backticks in it). Every line of a
     * piece stands behind the quote's mark and inside the fence: nothing in it is read as Markdown — a link, a picture
     * or an instruction in the hidden text stays text.
     */
    function hiddenMd(lang, items) {
        const H = HIDDEN[lang] || HIDDEN.en;
        return H[0] + items.map(function (h) {
            const run = (String(h.text).match(/`+/g) || []).reduce(function (m, t) { return Math.max(m, t.length); }, 0), fence = '`'.repeat(Math.max(3, run + 1));
            return ['', H[1].replace('%d', h.page).replace('%s', H[2][h.why]), '', fence + 'text'].concat(String(h.text).split('\n'), [fence])
                .map(function (l) { return l ? '> ' + l : '>'; }).join('\n') + '\n';
        }).join('');
    }
    let SETS = null;
    const sets = function () {
        if (SETS) return SETS;
        const st = PdfImporter._letterstats || {}, mk = function (s) { const o = new Set(); for (let k = 0; k + 1 < (s || '').length; k += 2) o.add(s.slice(k, k + 2)); return o; };
        return (SETS = { fa: mk(st.fa), ar: mk(st.ar), en: mk(st.en) });
    };
    const share = function (a, b) { return b ? a / b : 0; };

    /** one font's words → its measures */
    function measure(words) {
        const S = sets();
        const ar = { letters: 0, words: 0, pairs: 0, fa: 0, arb: 0, single: 0, punct: 0 }, la = { letters: 0, chars: 0, words: 0, pairs: 0, bad: 0, signs: 0, odd: 0 };
        words.forEach(function (w) {
            const t = fold(w), chars = Array.from(t), nAr = chars.filter(function (c) { return AR.test(c); }).length, nLa = chars.filter(function (c) { return LA.test(c); }).length;
            if (nAr && nAr >= nLa) {
                ar.words++; ar.letters += nAr;
                if (nAr === 1 && chars.length === 1 && t !== '\u0648') ar.single++;          // (but the waw, «and»)
                if (/[\u0621-\u06CC][!-\/:-@\[-`{-~\u00A1-\u00FF]+[\u0621-\u06CC]/.test(t) && !/^[\u0621-\u06CC]+[-\/][\u0621-\u06CC]+$/.test(t)) ar.punct++;
                for (let k = 0; k + 1 < chars.length; k++) {
                    if (!AR.test(chars[k]) || !AR.test(chars[k + 1])) continue;
                    ar.pairs++; const p = chars[k] + chars[k + 1];
                    if (!S.fa.has(p)) ar.fa++;
                    if (!S.ar.has(p)) ar.arb++;
                }
            } else if (nLa || /[^0-9\s]/.test(t)) {
                if (!nLa && chars.length < 3) return;
                la.words++; la.letters += nLa; la.chars += chars.length;
                if (SIGN.test(t) && chars.length > 1) la.signs++;
                // (a sign inside the word, between its letters or digits — but the ones prose writes there: it's, e-mail,
                // 3.5, a/b, a@b.c, snake_case — or a word of signs alone)
                if (ODD_IN.test(t) || ODD_ALL.test(t)) la.odd++;
                const l = t.toLowerCase();
                for (let k = 0; k + 1 < l.length; k++) {
                    if (!/[a-z]/.test(l[k]) || !/[a-z]/.test(l[k + 1])) continue;
                    la.pairs++; if (!S.en.has(l[k] + l[k + 1])) la.bad++;
                }
            }
        });
        return {
            ar: { letters: ar.letters, words: ar.words, unseen: +share(Math.min(ar.fa, ar.arb), ar.pairs).toFixed(3), single: +share(ar.single, ar.words).toFixed(3), punct: +share(ar.punct, ar.words).toFixed(3) },
            la: { letters: la.letters, chars: la.chars, words: la.words, pairs: la.pairs, unseen: +share(la.bad, la.pairs).toFixed(3), signs: +share(la.signs, la.words).toFixed(3), odd: +share(la.odd, la.words).toFixed(3) }
        };
    }

    // the verdict of the measures: why the font's text is no language ([] — it reads). `odd` is no verdict alone (a
    // font of signs and figures is odd too): the caller adds it when the font's program names no character
    function verdict(m) {
        const why = [], N = T('trustMinLetters');
        if (m.ar.letters >= N) {
            if (m.ar.unseen > T('trustArUnseen')) why.push('pairs');
            if (m.ar.single > T('trustArSingle')) why.push('letters');
            if (m.ar.punct > T('trustArPunct')) why.push('signs');
        }
        let odd = false;
        if (m.la.chars >= N && m.la.letters >= m.ar.letters) {
            if (m.la.signs > T('trustLaSigns')) why.push('latin1');
            if (m.la.pairs >= T('trustLaMinPairs') && m.la.unseen > T('trustLaUnseen')) why.push('latinPairs');
            odd = m.la.odd > T('trustLaOdd');
        }
        return { why: why, odd: odd };
    }

    /** runs of glyphs in reading order → per font id: { ar, la, garbled, why, pages } */
    function judge(runs) {
        const by = {};
        (runs || []).forEach(function (run) {
            // a word: the glyphs between two spaces, given to the font that draws most of it (a producer can cut one
            // font into several: a word is not broken where the font changes); code is no prose — not judged
            let cur = '', fonts = {}, page = null;
            const flush = function () {
                const ids = Object.keys(fonts);
                if (cur && ids.length) {
                    const font = ids.sort(function (a, b) { return fonts[b] - fonts[a]; })[0], f = by[font] || (by[font] = { words: [], pages: new Set() });
                    f.words.push(cur); if (page) f.pages.add(page);
                }
                cur = ''; fonts = {}; page = null;
            };
            run.forEach(function (g) {
                if (!g || g.atom || g.math || g.mono) { flush(); return; }
                const ch = g.ch || '';
                if (g.space || BLANK.test(ch)) { flush(); return; }
                cur += ch; fonts[g.font] = (fonts[g.font] || 0) + 1; page = g.page || page;
            });
            flush();
        });
        const out = {};
        Object.keys(by).forEach(function (id) {
            const m = measure(by[id].words), v = verdict(m);
            out[id] = { ar: m.ar, la: m.la, garbled: v.why.length > 0, why: v.why, odd: v.odd, pages: Array.from(by[id].pages).sort(function (a, b) { return a - b; }) };
        });
        // a font with too little text to judge alone, in a document of Arabic script: its letters mostly accented
        // Latin (U+00C0–U+024F: the lab's «ŒœŔ ŕŖŗ») — a producer that names each glyph by its glyph index —, no language
        // the document writes. A title or a date in a font Kelk does not know; a French name in a Persian text has
        // a few accented letters among plain ones, never most
        const N = T('trustMinLetters');
        let ar = 0, la = 0;
        Object.keys(out).forEach(function (id) { if (!out[id].garbled) { ar += out[id].ar.letters; la += out[id].la.letters; } });
        if (ar >= N && ar > 4 * la) Object.keys(out).forEach(function (id) {
            const o = out[id];
            if (o.garbled || o.ar.letters + o.la.letters >= N) return;
            const text = by[id].words.join(''), letters = (text.match(/\p{L}/gu) || []).length, foreign = (text.match(/[\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F]/g) || []).length;
            if (foreign >= T('trustForeignMin') && foreign >= 0.6 * letters) { o.garbled = true; o.why = ['foreign']; }
        });
        return out;
    }

    Object.assign(PdfImporter.prototype, {
        /** the glyph runs of the layout's blocks: a paragraph's, an item's, a heading's glyphs, each cell of a table */
        _trustRuns(blocks) {
            const out = [];
            const walk = function (x, depth) {
                if (!x || depth > 8) return;
                if (Array.isArray(x)) {
                    if (x.length && x[0] && typeof x[0] === 'object' && !Array.isArray(x[0]) && typeof x[0].ch === 'string' && !x[0].type) out.push(x);
                    else x.forEach(function (y) { walk(y, depth + 1); });
                } else if (typeof x === 'object') ['glyphs', 'children', 'rows', 'cells', 'items'].forEach(function (k) { if (x[k]) walk(x[k], depth + 1); });
            };
            walk(blocks, 0);
            return out;
        },

        /**
         * 1.9 text no reader sees (extract.js _hiddenText marks it, _tinyText keeps what it takes out) leaves the pages'
         * glyphs: p.hidden = { off, white, tiny, invisible: [glyphs] }
         */
        _hiddenSplit(pages) {
            const self = this;
            pages.forEach(function (p) {
                if (!p) return;
                const hid = {}, seen = {}; let n = 0;
                // (a glyph drawn twice at one place — an invisible copy laid over the page — is one glyph)
                const put = function (why, g) {
                    const k = g.space ? null : g.ch + '|' + Math.round(g.x * 2) + '|' + Math.round(g.y * 2);
                    if (k !== null) { if (seen[k]) return; seen[k] = true; }
                    (hid[why] || (hid[why] = [])).push(g); n++;
                };
                (p.tiny || []).forEach(function (g) { put('tiny', g); });
                if (p.glyphs.some(function (g) { return g.hid; })) {
                    let w = 0;
                    for (let k = 0; k < p.glyphs.length; k++) { const g = p.glyphs[k]; if (g.hid) put(g.hid, g); else p.glyphs[w++] = g; }
                    p.glyphs.length = w;
                }
                if (!n) return;
                p.hidden = hid;
                self._fire('trust.hiddenText', p.num);
            });
        },

        /**
         * 1.8 the font arbiter: who names a glyph. A file names each glyph of a font (its ToUnicode, its cmap, its
         * glyph names — pdf.js's reading); the font's own outlines name it too, when the font is one Kelk knows
         * (fontprint.js: the hash of a glyph's outline finds it in a face of fontprints.js, with the character that
         * face's cmap gives it). Per font with an embedded TrueType program:
         *   · known: a face names most of the glyphs the font has drawn so far (trustPrintKnown, trustPrintMinGlyphs);
         *   · where the file and the face agree — the same character after folding, or one of the letters and digits
         *     that share the outline (ي and ی, ك and ک, 4 ٤ ۴: no outline tells them apart, the file's word stands),
         *     or a bracket and its mirror (which side it opens to is read from the outline elsewhere) — nothing changes;
         *   · the file's names agree with the face on most glyphs (trustPrintAgree): the map is sound, and the few
         *     glyphs it names as another kind of character take the face's — a bracket named as a letter, a comma
         *     as a stop (_arbiterFew) — but never a letter for a letter, nor a digit the file names;
         *   · they agree on few: the map is not this font's (codes renumbered by a print driver, a ToUnicode of
         *     another subset) — every glyph the face knows takes the face's character, and a glyph with no outline
         *     is a space (with no advance, a ZWNJ).
         * It works page by page on the glyphs as pdf.js gives them (_arbiterPage, from _extractPage before any
         * repair: a letter the file names as a space, a mark or a kashida is lost to the repairs that follow), a font
         * decided once the pages read so far hold enough of its glyphs; _fontArbiter, after the last page, decides the
         * fonts that had too few on every page and tells the reader. this._arb = { read, font, mode, done }; what it
         * did is this._arbiter = { font id: { name, family, face, changed, all } }. The judge reads the result after
         * the layout as it reads any text (a font still not language is still reported).
         */
        _arbiterStart() { this._arb = { read: {}, font: {}, mode: {} }; this._arbiter = {}; },

        /** the font's program read once: { m: the face that knows it, gid(cid), hs } or null (not embedded, not TrueType, not known) */
        async _arbiterFont(id, f, glyphs) {
            const A = this._arb;
            if (id in A.font) return A.font[id];
            A.font[id] = null;
            const FP = PdfImporter._fontprint, data = global.KelkPdfFontprints;
            if (!FP || !data || !f || !this._rawIdx()) return null;
            try {
                const files = await this._fontPrograms(), name = String(f.name || '').replace(/[()<>\[\]{}\/%\s]/g, '');
                if (!files || !name) return null;
                if (f.composite) { const fs = {}; fs[id] = f; if (!(await this._cidGlyphIds([{ glyphs: glyphs }], fs))[id]) return null; }
                const named = this._gsubNamed(files, name);
                let cands = named.filter(function (e) { return e.composite === !!f.composite; });
                if (!cands.length && named.length === 1) cands = named;
                if (!cands.length) return null;
                const sfnt = PdfImporter._internal.sfntLigatures, progs = [];
                for (const c of cands) { const bytes = await this._rawStream(c.ref); if (bytes && bytes.length > 12) progs.push({ bytes: bytes, m: sfnt(bytes) }); }
                let P = progs.length === 1 ? progs[0] : null;
                if (!P && progs.length > 1) {
                    // several programs under one name (a print driver embeds a subset per run of pages): the one whose
                    // advances are the font's widths on every code this page draws in it; none or two alike: not yet —
                    // a later page may tell (the font is asked again)
                    const TOL = this._t('extByCodeWidthTolEm'), seen = {}, ws = [];
                    glyphs.forEach(function (g) { if (g.font !== id || seen[g.cid] || !(g.gw > 0)) return; seen[g.cid] = 1; ws.push([g.cid, g.gw / 1000]); });
                    const fit = progs.filter(function (p) {
                        return ws.length >= 3 && ws.every(function (w) { const gid = f.composite ? w[0] : p.m.c2g[w[0]], a = gid ? p.m.adv(gid) : null; return a !== null && Math.abs(a - w[1]) <= TOL; });
                    });
                    if (fit.length !== 1) { delete A.font[id]; return null; }
                    P = fit[0];
                }
                if (!P) return null;
                // (a font no face knows is kept too, m null: its program still says which glyphs draw nothing)
                const hs = FP.hashes(P.bytes);
                let m = FP.match(hs, data, f.name);
                // (a font whose outlines were rebuilt — wkhtmltopdf's, through Qt — keeps few fontprints: its glyphs'
                // rough prints, the advance and the contours' boxes, may still find the face)
                if ((m ? m.known : 0) < T('trustPrintKnown') * Object.keys(hs).length && FP.matchRough) {
                    const rm = FP.matchRough(FP.roughs(P.bytes, true), data, f.name);
                    if (rm && rm.known > (m ? m.known : 0)) m = rm;
                }
                const c2g = f.composite ? null : P.m.c2g;
                A.font[id] = { m: m, hs: hs, bytes: P.bytes, name: String(f.name || '').replace(/^[A-Z]{6}\+/, ''), gid: function (cid) { return f.composite ? +cid : c2g[cid]; } };
            } catch (e) { if (e && e.code === 'aborted') throw e; }
            return A.font[id];
        },

        /** whether the file's name of a glyph and the face's ([text, others]) are one */
        _arbiterSame(ch, t) {
            if (ch === t[0] || fold(ch) === fold(t[0]) || ARB_MIRROR[ch] === t[0]) return true;
            return !!t[1] && ch.length === 1 && (t[1].indexOf(ch) >= 0 || t[1].indexOf(fold(ch)) >= 0);
        },

        /**
         * in a font whose map is sound, whether the face's character t takes the place of the file's ch — only where
         * the two are of different kinds, which no shared outline explains: a letter named where the face has a
         * sign (a bracket read «م», a comma read «ک»), a sign or a blank where the face has a letter («(» for «ل»),
         * or one ASCII sign for another (a stop for a comma). A letter for a letter stays the file's — a form's
         * outline is often several letters' (ه ە ھ, ی ي ى) —, as do a digit, a ZWNJ and the signs beyond ASCII (a
         * hyphen's outline is three characters').
         */
        _arbiterFew(ch, t) {
            const letter = function (s) { return /[\p{L}\p{M}]/u.test(s); }, sign = function (s) { return /^[!-\/:-@\[-`{-~]$/.test(s); };
            const arSign = function (s) { return /^[\u060C\u061B\u061F\u00AB\u00BB]$/.test(s); };
            // (an ASCII letter or digit where the face has an Arabic letter is of another kind too \u2014 no outline is both:
            // wkhtmltopdf's ToUnicode names some of Vazirmatn's forms \u00ABH\u00BB, \u00ABc\u00BB, \u00AB4\u00BB)
            if (/^[A-Za-z0-9]$/.test(ch) && /^[\u0620-\u064A\u066E-\u06D3\u06D5\uFB50-\uFDFF\uFE70-\uFEFC]+$/.test(t)) return true;
            if (ARB_DIGIT.test(ch) || /[0-9\u0660-\u0669\u06F0-\u06F9]/.test(t) || /[\u200B-\u200F\u00AD]/.test(ch)) return false;
            if (letter(ch)) return sign(t) || arSign(t);
            // (a blank where the face has a mark stays: the file often names the mark with its letter)
            if (letter(t)) return sign(ch) || (!/^\p{M}+$/u.test(t) && (!ch.trim() || /[\uFFFD\u0000-\u001F\uE000-\uF8FF]/.test(ch)));
            return sign(ch) && sign(t);
        },

        /** a font's verdict from what the pages read so far hold of it: 'few' | 'all' | 'none' (sound, nothing to do: left open) | null (too little yet) */
        _arbiterDecide(id) {
            const A = this._arb, F = A.font[id], read = A.read[id] || {}, self = this;
            if (!F || !F.m) return null;
            let drawn = 0, known = 0, agree = 0;
            Object.keys(read).forEach(function (cid) {
                const gid = F.gid(cid);
                if (!gid || !(gid in F.hs)) return;                              // (no outline: a space, a ZWNJ)
                drawn++;
                const t = F.m.text[gid]; if (!t) return;
                known++;
                const r = read[cid], ch = Object.keys(r).sort(function (a, b) { return r[b] - r[a]; })[0];
                if (self._arbiterSame(ch, t)) agree++;
            });
            if (known < T('trustPrintMinGlyphs') || known < T('trustPrintKnown') * drawn) return null;
            return agree < T('trustPrintAgree') * known ? 'all' : 'few';
        },

        /** the glyphs of a decided font take the face's characters where the file names them otherwise */
        _arbiterApply(glyphs, num) {
            const A = this._arb, self = this;
            let n = 0;
            glyphs.forEach(function (g) {
                const mode = g.font && A.mode[g.font], F = mode && A.font[g.font];
                if (!F || g.cid === undefined || typeof g.ch !== 'string' || g.math) return;
                const gid = F.gid(g.cid), t = F.m.text[gid];
                if (!t && mode === 'all' && gid && !(gid in F.hs) && g.ch.trim() && g.ch !== '\u200C') {
                    // a glyph with no outline, in a font whose map is not its own: a space — with no advance, a ZWNJ
                    if (g.w > 0) { g.ch = ' '; g.space = true; } else { g.ch = '\u200C'; g.space = false; }
                    g.unmapped = false; g.guess = false; n++; return;
                }
                if (!t || self._arbiterSame(g.ch, t) || (mode === 'few' && !self._arbiterFew(g.ch, t[0]))) return;
                g.ch = t[0]; g.space = false; g.unmapped = false; g.guess = false; n++;
                const rec = self._arbiter[g.font] || (self._arbiter[g.font] = { name: F.name, family: F.m.family, face: F.m.face, changed: 0, all: mode === 'all' });
                rec.changed++;
            });
            if (n) this._fire('trust.fontprintGlyphs', num);
        },

        /** a page's glyphs as pdf.js gives them: its fonts' names added to what is known, the decided fonts' glyphs named */
        async _arbiterPage(glyphs, page, num) {
            const A = this._arb;
            if (!A || !PdfImporter._fontprint || !global.KelkPdfFontprints) return;
            const ids = {};
            glyphs.forEach(function (g) {
                if (!g.font || g.cid === undefined || typeof g.ch !== 'string' || g.math) return;
                ids[g.font] = 1;
                const r = A.read[g.font] || (A.read[g.font] = {}), c = r[g.cid] || (r[g.cid] = {}); c[g.ch] = (c[g.ch] || 0) + 1;
            });
            for (const id of Object.keys(ids)) {
                if (A.mode[id]) continue;
                let f = null; try { f = page.commonObjs.get(id); } catch (e) { f = null; }
                if (!(await this._arbiterFont(id, f, glyphs))) continue;
                const mode = this._arbiterDecide(id);
                if (mode) A.mode[id] = mode;
            }
            this._arbiterApply(glyphs, num);
            this._arbiterBlank(glyphs, num);
        },

        /**
         * a glyph that draws nothing, named by a control character — a producer that names each glyph by its glyph
         * index names the space U+0003 (the space is glyph 3 of most TrueType fonts) —: a space when it has an
         * advance. Read in the font's program, any font whose program is found, known to a face or not: the control
         * character came out «�», lines of them where the page has blank lines in a bold font drawn twice.
         */
        _arbiterBlank(glyphs, num) {
            const A = this._arb;
            let n = 0;
            glyphs.forEach(function (g) {
                const F = g.font && A.font[g.font];
                if (!F || g.cid === undefined || typeof g.ch !== 'string' || !ARB_CTRL.test(g.ch) || !(g.w > 0)) return;
                const gid = F.gid(g.cid);
                if (gid === undefined || gid in F.hs) return;
                g.ch = ' '; g.space = true; g.unmapped = false; g.guess = false; n++;
            });
            if (n) this._fire('trust.blankSpace', num);
        },

        /** after the last page: the fonts no page could decide alone, and the reader told */
        async _fontArbiter(pages) {
            const A = this._arb, self = this;
            if (!A) return;
            const late = {};
            Object.keys(A.font).forEach(function (id) { if (A.font[id] && !A.mode[id]) { const mode = self._arbiterDecide(id); if (mode) { A.mode[id] = mode; late[id] = 1; } } });
            if (Object.keys(late).length) pages.forEach(function (p) { self._arbiterApply(p.glyphs.filter(function (g) { return late[g.font]; }), p.num); });
            const names = Object.keys(this._arbiter).map(function (id) { return self._arbiter[id].name; }).filter(function (n, i, a) { return n && a.indexOf(n) === i; });
            if (names.length) this._note('fontprintRead', 'The characters of ' + (names.length === 1 ? 'the font ' : 'some fonts (') + names.slice(0, 6).join(', ') + (names.length === 1 ? '' : ')') +
                ' were read from the font\'s own outlines: the file names them wrong.');
        },

        /**
         * 1.9 the approximate reading of a font Kelk does not know (3.2): a font whose program was found but that no
         * face of the fontprints knows, and whose text, as the file names it, is no language either way it is read
         * (the glyphs left to right as drawn, or the other way: a right-to-left line is drawn from its end). Its glyphs
         * are read by their shapes against the fonts Kelk ships (shape.js read(): the nearest of each glyph's three
         * nearest characters that leaves the fewest letter pairs no language of ours writes), and the reading is taken
         * only when it reads as language and its glyphs are near their characters (trustApprox*). Taken: every glyph
         * of the font takes its character, a glyph with no outline is a space (a ZWNJ with no advance); the note
         * fontApprox names the fonts and pages, and this._approx = { fonts, pages, share } lowers those pages'
         * confidence (ladder.js). Not taken: the text stays the file's, and the judge reports it after the layout.
         * options.unknownFonts 'report' leaves every font as the file names it. The shapes (shape.js, shapes.js: 300 KB)
         * load here, on the first font that needs them: options.loadShapes, else script tags beside trust.js
         * (file:// too), else require under Node.
         */
        async _fontApprox(pages) {
            const A = this._arb, self = this;
            this._approx = null;
            if (!A || this.options.unknownFonts === 'report') return;
            if (this.options.decipherKnown) await this._decipherSide(pages);
            // (a font a face knows — most of its glyphs found — is the arbiter's, whatever it decided)
            const ids = Object.keys(A.font).filter(function (id) {
                const F = A.font[id];
                return F && F.bytes && !A.mode[id] && (F.m ? F.m.known : 0) < T('trustPrintKnown') * Object.keys(F.hs).length;
            });
            if (!ids.length) return;
            const lines = this._approxLines(pages), want = this._approxGarbled(lines, ids);
            await this._decCrossCheck(pages, lines, ids.filter(function (id) { return want.indexOf(id) < 0; }));
            if (!want.length) return;
            // 1.9a the decipherment (3.5: decipher.js), for the fonts of Arabic script; a reading it does not take ('low',
            // 'garbled') and every other font are 3.2's shapes' alone
            const taken = {}, names = [];
            const dec = await this._decipherFonts(pages, lines, want), nDec = Object.keys(dec).length;
            // 3.2's shapes read every font too; where both read one, the language chooses: the reading whose words fit
            // Persian better per letter (a font close to one Kelk ships reads better by its shapes; the others by the
            // decipherment)
            const byShape = {}, shapeNames = [];
            if (await this._loadShapes()) await this._approxShapes(pages, lines, want, byShape, shapeNames, nDec > 0);
            const D = PdfImporter._decipher;
            want.forEach(function (id) {
                let pick = dec[id] ? 'dec' : byShape[id] ? 'shape' : null;
                if (dec[id] && byShape[id]) {
                    const u = self._decUse[id], L = D.lm(PdfImporter._lmFa);
                    const a = D.fit(u, function (g) { return dec[id][g]; }, L), b = D.fit(u, function (g) { return byShape[id].text[g]; }, L);
                    if (b > a) pick = 'shape';
                    self._fire('trust.approxBoth' + (pick === 'dec' ? 'Decipher' : 'Shapes'));
                    const r = self._decRead.find(function (x) { return x.fonts.indexOf(A.font[id].name) >= 0; });
                    if (r) { r.fit2 = { decipher: +a.toFixed(2), shapes: +b.toFixed(2) }; r.chosen = pick; }
                }
                if (!pick) return;
                taken[id] = pick === 'dec' ? { text: dec[id], F: A.font[id] } : byShape[id];
                if (names.indexOf(A.font[id].name) < 0) names.push(A.font[id].name);
            });
            if (!names.length) return;
            const all = {}, mine = {};
            pages.forEach(function (p) {
                p.glyphs.forEach(function (g) {
                    if (g.ch && !BLANK.test(g.ch)) all[p.num] = (all[p.num] || 0) + 1;
                    const T_ = g.font && taken[g.font];
                    if (!T_ || g.cid === undefined || typeof g.ch !== 'string' || g.math) return;
                    const gid = T_.F.gid(g.cid), t = T_.text[gid];
                    if (t) { g.ch = t; g.space = false; }
                    else if (gid !== undefined && !(gid in T_.F.hs)) { if (g.w > 0) { g.ch = ' '; g.space = true; } else { g.ch = '\u200C'; g.space = false; } }
                    else return;
                    g.unmapped = false; g.guess = false;
                    if (!g.space) mine[p.num] = (mine[p.num] || 0) + 1;
                });
            });
            const pnums = Object.keys(mine).map(Number).sort(function (a, b) { return a - b; }), share = {};
            pnums.forEach(function (n) { share[n] = +Math.min(1, mine[n] / (all[n] || mine[n])).toFixed(3); });
            this._approx = { fonts: names.slice().sort(), pages: pnums, share: share };
            this._note('fontApprox', 'The text of ' + (names.length === 1 ? 'the font ' : 'some fonts (') + names.slice(0, 6).join(', ') + (names.length === 1 ? '' : ')') +
                ', which the file does not name, was read from the shapes of its letters (recovered, approximate: page' + (pnums.length > 1 ? 's ' : ' ') + pnums.join(', ') + '). Check it against the PDF.', pnums);
        },

        /** 3.2's reading by shapes, for the fonts ids the decipherment did not take: what it reads joins taken and names
         *  (deciphered: the decipherment took a font — Arabic script, written in Persian letters) */
        async _approxShapes(pages, lines, ids, taken, names, deciphered) {
            const A = this._arb, self = this;
            const S = PdfImporter._shape, faces = S.expand(global.KelkPdfShapes), sets_ = sets();
            const PAIRS = { arabic: new Set(Array.from(sets_.fa).concat(Array.from(sets_.ar))), latin: sets_.en };
            const read = [];
            for (const id of ids) {
                await this._yield();                       // (a font at a time: a long document held the page otherwise)
                const F = A.font[id], uses = {}, named = {};
                pages.forEach(function (p) { p.glyphs.forEach(function (g) {
                    if (g.font !== id || g.cid === undefined || g.math) return;
                    const gid = F.gid(g.cid);
                    if (!(gid in F.hs)) return;
                    uses[gid] = (uses[gid] || 0) + 1;
                    const c = fold(g.ch || ''), n = named[gid] || (named[gid] = {}); n[c] = (n[c] || 0) + 1;
                }); });
                const sh = S.glyphs(F.bytes, uses), items = {};
                Object.keys(uses).forEach(function (gid) { if (sh[gid]) items[gid] = { shape: sh[gid], uses: uses[gid] }; });
                if (!Object.keys(items).length) continue;
                const sc = S.script(items, faces), words = [];
                lines.forEach(function (line) {
                    const seq = sc === 'arabic' ? line.slice().reverse() : line;
                    let cur = [];
                    seq.forEach(function (g) {
                        const gid = g.font === id && g.cid !== undefined ? F.gid(g.cid) : undefined;
                        if (gid === undefined || !items[gid] || g.space) { if (cur.length) words.push(cur); cur = []; return; }
                        cur.push(String(gid));
                    });
                    if (cur.length) words.push(cur);
                });
                const r = S.read(items, words, faces, PAIRS[sc], { script: sc });
                // the file's names against the reading: where they agree on half the letters, they are the font's (a
                // font Kelk does not know, named right: its reading agrees on 83 % and more — tools/calibrate-shapes.js)
                let letters = 0, agree = 0;
                Object.keys(items).forEach(function (gid) {
                    const t = r.text[gid] || '';
                    if (!/\p{L}/u.test(t)) return;
                    letters += items[gid].uses;
                    agree += (named[gid] || {})[fold(t)] || 0;
                });
                if (letters && agree >= T('trustApproxAgree') * letters) { this._fire('trust.approxNamedRight'); continue; }
                const ar = sc === 'arabic', share = r.pairs ? r.unseen / r.pairs : 1, near = r.dist <= T(ar ? 'trustApproxArDist' : 'trustApproxLaDist');
                read.push({ id: id, F: F, r: r, sc: sc, near: near, small: letters < T('trustApproxMinLetters'),
                            ok: near && letters >= T('trustApproxMinLetters') && share <= T(ar ? 'trustApproxArUnseen' : 'trustApproxLaUnseen') });
            }
            // a font too small for its pairs to say anything (a title, a year) is taken with a font of its script that
            // was: the document is one whose fonts the file does not name; its own glyphs must still be near
            read.forEach(function (x) { if (!x.ok && x.small && x.near && (read.some(function (y) { return y.ok && y.sc === x.sc; }) || (deciphered && x.sc === 'arabic'))) x.ok = true; });
            // ي ى ی and ك ک: one shape in the forms a Persian text writes them — a reading with پ چ ژ گ is Persian, and
            // writes ی and ک; an Arabic one keeps what the shapes chose (its ى and ي differ by their dots)
            const fa = deciphered || read.some(function (x) { return x.ok && x.sc === 'arabic' && Object.keys(x.r.text).some(function (k) { return PE.test(x.r.text[k]); }); });
            read.forEach(function (x) {
                self._fire(x.ok ? 'trust.approxTaken' : 'trust.approxLeft');
                if (!x.ok) return;
                if (fa && x.sc === 'arabic') Object.keys(x.r.text).forEach(function (k) { x.r.text[k] = x.r.text[k].replace(/[\u064A\u0649]/g, '\u06CC').replace(/\u0643/g, '\u06A9'); });
                taken[x.id] = { text: x.r.text, F: x.F };
                if (names.indexOf(x.F.name) < 0) names.push(x.F.name);
            });
        },

        /** every page's glyphs in lines: one baseline (within a third of the size), left to right as drawn */
        _approxLines(pages) {
            const out = [];
            pages.forEach(function (p) {
                const gs = (p.glyphs || []).filter(function (g) { return g && typeof g.ch === 'string' && isFinite(g.x) && isFinite(g.y); })
                    .sort(function (a, b) { return b.y - a.y || a.x - b.x; });
                let line = [], y = null, size = 0;
                gs.forEach(function (g) {
                    if (y !== null && Math.abs(g.y - y) > Math.max(1, (size || g.size || 10) / 3)) { out.push(line); line = []; }
                    if (!line.length) { y = g.y; size = g.size || 10; }
                    line.push(g);
                });
                if (line.length) out.push(line);
            });
            return out.map(function (l) {
                l.sort(function (a, b) { return a.x - b.x; });
                // a gap of a third of the size between two glyphs is a space (a print driver draws no space glyph)
                const r = [];
                l.forEach(function (g, i) {
                    const prev = l[i - 1];
                    if (prev && g.x - (prev.x + (prev.w || 0)) > (g.size || 10) / 3) r.push({ ch: ' ', space: true });
                    r.push(g);
                });
                return r;
            });
        },

        /**
         * the fonts among ids whose text the file does not name, and whose own program does not either (a program
         * whose cmap names most of the glyphs drawn is the repairs' to read, exactly: _gsubRepair) — no language to
         * the judge (each line read in its script's order: a line mostly of Arabic script from its end), or a font
         * dictionary with neither a ToUnicode nor an Encoding (nothing in the file says which letter a code is: a
         * print driver's; a font too small for the judge too)
         */
        _approxGarbled(lines, ids) {
            const A = this._arb, self = this, sfnt = PdfImporter._internal.sfntLigatures;
            const j = judge(lines.map(function (l) {
                let ar = 0, la = 0;
                l.forEach(function (g) { if (/[\u0600-\u06FF\uFB50-\uFEFC]/.test(g.ch)) ar++; else if (/[A-Za-z\u00C0-\u024F]/.test(g.ch)) la++; });
                return ar > la ? l.slice().reverse() : l;
            }));
            const drawn = {};
            lines.forEach(function (l) { l.forEach(function (g) {
                const F = g.font && A.font[g.font];
                if (!F || g.cid === undefined) return;
                const gid = F.gid(g.cid);
                if (gid in F.hs) (drawn[g.font] || (drawn[g.font] = {}))[gid] = 1;
            }); });
            return ids.filter(function (id) {
                const gids = Object.keys(drawn[id] || {});
                if (!gids.length) return false;
                let m = null;
                try { m = sfnt(A.font[id].bytes); } catch (e) { return false; }
                if (gids.filter(function (g) { return m.g2u[g]; }).length >= gids.length / 2) return false;
                return !!(j[id] && j[id].garbled) || !self._approxDictNames(A.font[id].name);
            });
        },

        /** whether a font dictionary of this name (subset tag or not) has a ToUnicode or an Encoding */
        _approxDictNames(name) {
            const R = this._rawIdx();
            if (!R || !R.str || !name) return true;
            // (a composite font's dictionary may name it with its CMap after it, «Name-Identity-H», as Distiller does; its
            // /Encoding is that CMap, which names no character: only a ToUnicode does)
            const esc = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), re = new RegExp('/BaseFont\\s*/(?:[A-Z]{6}\\+)?' + esc + '(?:-Identity-[HV])?[\\s/>]', 'g');
            let m, seen = false;
            while ((m = re.exec(R.str))) {
                const from = R.str.lastIndexOf('obj', m.index), to = R.str.indexOf('endobj', m.index), d = R.str.slice(from < 0 ? m.index : from, to < 0 ? m.index + 1200 : to);
                if (!/\/Type\s*\/Font\b/.test(d) || !/\/Subtype\s*\/(TrueType|Type1|Type0|MMType1)\b/.test(d)) continue;
                seen = true;
                if (/\/ToUnicode/.test(d) || (/\/Encoding/.test(d) && !/\/Subtype\s*\/Type0\b/.test(d))) return true;
            }
            return !seen;
        },

        /** the shapes, once: true when shape.js and shapes.js are there */
        /** the decipherment's parts (3.5): glyphfeat.js, featmodel.js, decipher.js and the language model (lm-fa.js, which
         *  OCR loads too) — options.loadDecipher, else script tags beside trust.js (file:// too), else require under Node */
        async _loadDecipher() {
            const have = function () { return !!(PdfImporter._glyphfeat && PdfImporter._decipher && global.KelkPdfFeatModel && PdfImporter._lmFa); };
            if (have()) return true;
            try {
                if (this.options.loadDecipher) await this.options.loadDecipher();
                else if (typeof document === 'undefined' && typeof require === 'function') {
                    require('./glyphfeat.js'); require('./decipher.js'); require('./lm-fa.js');
                    global.KelkPdfFeatModel = require('./featmodel.js');
                } else {
                    const base = this.options.partsBase || (function () {
                        const el = document.querySelector('script[src*="pdfimport/trust.js"]');
                        return el ? el.src.replace(/[^/]*$/, '') : 'lib/pdfimport/';
                    })();
                    if (!PdfImporter._glyphfeat) await this._loadScript(base + 'glyphfeat.js');
                    if (!global.KelkPdfFeatModel) await this._loadScript(base + 'featmodel.js');
                    if (!PdfImporter._decipher) await this._loadScript(base + 'decipher.js');
                    if (!PdfImporter._lmFa) await this._loadScript(base + 'lm-fa.js');
                }
            } catch (e) { return false; }
            return have();
        },

        /** a font's use on the lines: glyph id → uses, and each line's ids in drawing order, null a break (a space, a gap
         *  of decGap × the size, a glyph of another font, one with no outline) */
        _decUsage(lines, id, F) {
            const counts = new Map(), seqs = [], GAP = T('decGap');
            lines.forEach(function (line) {
                const s = [], brk = function () { if (s.length && s[s.length - 1] !== null) s.push(null); };
                let prev = null;
                line.forEach(function (g) {
                    if (g.space && g.font === undefined && g.cid === undefined) return;      // (_approxLines' own gaps)
                    if (prev && g.x - (prev.x + (prev.w || 0)) > GAP * Math.min(prev.size || 10, g.size || 10)) brk();
                    prev = g;
                    if (g.font !== id || g.cid === undefined || g.math) { brk(); return; }
                    // (a glyph with an outline is a letter whatever the file names it: a CID read as a space is one)
                    const gid = F.gid(g.cid);
                    if (gid === undefined || !(gid in F.hs)) { brk(); return; }
                    s.push(+gid); counts.set(+gid, (counts.get(+gid) || 0) + 1);
                });
                if (s.some(function (c) { return c !== null; })) seqs.push(s);
            });
            return { counts: counts, seqs: seqs };
        },

        /**
         * The ToUnicode cross-check (3.5, the spike's crosscheck.js): a font the judge accepts (its text reads as language)
         * whose file names some glyphs as two letters or more (lam-alef aside) on decMultiShare of its uses or more — a
         * ligature, or a producer's error («ها» for one glyph) — is deciphered too; where the reading comes out 'read' and
         * reads such a glyph as one of the letters the file names it (an extra letter in the name), the note toUnicodeDoubt
         * names the font and its glyphs. Nothing is rewritten.
         */
        async _decCrossCheck(pages, lines, ids) {
            const A = this._arb, cand = [], letters = function (v) { return Array.from(String(v || '').normalize('NFKC').replace(/[ـ\s]/g, '')).filter(function (ch) { return /[\u0621-\u064A\u067E\u0686\u0698\u06A9\u06AF\u06CC]/.test(ch); }); };
            // (one pass over the glyphs for all the fonts, a page at a time: a long document held the page otherwise)
            const n = {}, multi = {}, seen = new Map();
            ids.forEach(function (id) { const F = A.font[id]; if (F && F.bytes) { n[id] = 0; multi[id] = 0; } });
            for (let pi = 0; pi < pages.length; pi++) {
                if (pi % 20 === 19) await this._yield();
                (pages[pi].glyphs || []).forEach(function (g) {
                    if (!(g.font in n) || g.space) return;
                    n[g.font]++;
                    let m = seen.get(g.ch);
                    if (m === undefined) { const L = letters(g.ch); m = L.length >= 2 && L.join('') !== 'لا'; seen.set(g.ch, m); }
                    if (m) multi[g.font]++;
                });
            }
            ids.forEach(function (id) { if (n[id] && multi[id] / n[id] >= T('decMultiShare')) cand.push(id); });
            if (!cand.length) return;
            const found = [];
            await this._decipherFonts(pages, lines, cand, function (g, byId, r) {
                if (r.verdict !== 'read') return;
                const D = PdfImporter._decipher, diff = {};
                pages.forEach(function (p) { (p.glyphs || []).forEach(function (gl) {
                    if (g.ids.indexOf(gl.font) < 0 || gl.cid === undefined || typeof gl.ch !== 'string') return;
                    const gid = byId[gl.font].F.gid(gl.cid), t = gid === undefined ? null : r.map.get(g.key(gl.font, +gid));
                    // (only a glyph the file names as two letters or more whose shape reads one of them: an extra letter
                    // in the file's name — a ligature the reading cannot name, or a misread, is no doubt about the file)
                    const a = D.norm(gl.ch.replace(/\s/g, '')), b = D.norm(t || ''), la = letters(a);
                    if (!t || la.length < 2 || la.join('') === 'لا' || letters(b).length !== 1 || la.indexOf(letters(b)[0]) < 0) return;
                    const k = a + '→' + b;
                    diff[k] = (diff[k] || 0) + 1;
                }); });
                const top = Object.keys(diff).sort(function (x, y) { return diff[y] - diff[x]; }).slice(0, 5);
                if (top.length) found.push({ names: g.ids.map(function (id) { return String(A.font[id].name).replace(/^[A-Z]{6}\+/, ''); }), diff: top, pages: pages.filter(function (p) { return (p.glyphs || []).some(function (x) { return g.ids.indexOf(x.font) >= 0; }); }).map(function (p) { return p.num; }) });
            });
            this._decCross = found;
            if (!found.length) return;
            const pg = Array.from(new Set([].concat.apply([], found.map(function (x) { return x.pages; })))).sort(function (a, b) { return a - b; });
            this._fire('trust.toUnicodeDoubt');
            this._note('toUnicodeDoubt', 'The file names some glyphs of ' + found.map(function (x) { return x.names.join(', ') + ' (' + x.diff.join(', ') + ')'; }).join('; ') +
                ' otherwise than their shapes read (the file\'s names → the reading); the text is what the file names (page ' + pg.join(', ') + ').', pg);
        },

        /** a group's lines for the digit anchors (byPage: each page's _approxLines): per page, each line in drawing order — { page (from 0, as page numbers
         *  count from 1 or so), y, seq: [{ gap } | { mine, code (the pooled glyph) } | { mine: false } (another font's glyph)] } */
        async _decLines(byPage, g, byId) {
            const out = [], GAP = T('decGap');
            for (let pi = 0; pi < byPage.length; pi++) {
                if (pi % 20 === 19) await this._yield();
                byPage[pi].forEach(function (line) {
                    const seq = [], brk = function () { if (seq.length && !seq[seq.length - 1].gap) seq.push({ gap: true }); };
                    let prev = null, y = null;
                    line.forEach(function (gl) {
                        if (gl.space && gl.font === undefined && gl.cid === undefined) return;
                        if (prev && gl.x - (prev.x + (prev.w || 0)) > GAP * Math.min(prev.size || 10, gl.size || 10)) brk();
                        prev = gl;
                        if (y === null) y = gl.y;
                        const e = byId[gl.font], gid = e && g.ids.indexOf(gl.font) >= 0 && gl.cid !== undefined ? e.F.gid(gl.cid) : undefined;
                        if (gid !== undefined && gid in e.F.hs) { seq.push({ mine: true, code: g.key(gl.font, +gid) }); return; }
                        if (gl.space || !/\S/.test(gl.ch || '')) { brk(); return; }
                        seq.push({ mine: false });
                    });
                    if (seq.some(function (it) { return it.mine; })) out.push({ page: pi, y: y, seq: seq });
                });
            }
            return out;
        },

        /** the pages a group's glyphs are drawn on */
        _decPages(pages, g) {
            return pages.filter(function (p) { return (p.glyphs || []).some(function (gl) { return g.ids.indexOf(gl.font) >= 0; }); }).map(function (p) { return p.num; });
        },

        /** OCR's engine for the votes (3.4's, ladder.js _ladOcrLoad), or null when it cannot start */
        async _decOcrEngine() {
            try { return await this._ladOcrLoad(); } catch (e) { return null; }
        },

        /**
         * OCR's votes for a group (3.5; the spike's ocrvotes.js): each line's run of its glyphs cut from the page drawn at
         * 300 dpi (ladder.js _ladOcrPixels), read by Tesseract as one line, lined up with the glyphs — word by word when
         * the word counts match, else the whole run when its letters count the same — one vote a glyph; at most decOcrRuns
         * runs. The step is the font's («font k of n»), Cancel checked between lines. → Map pooled glyph → Map text → votes
         */
        async _decVotes(pages, byPage, g, byId, eng, k, n) {
            const O = PdfImporter._ocr, D = PdfImporter._decipher, GAP = T('decGap'), V = new Map(), self = this;
            let left = T('decOcrRuns');
            const add = function (c, ch) { const m = V.get(c) || V.set(c, new Map()).get(c); m.set(ch, (m.get(ch) || 0) + 1); };
            const tokens = function (w) {
                const t = Array.from(D.norm(w).replace(/[\u064B-\u065F\u0670\u0640\u200C]/g, '').replace(/[0-9]/g, function (d) { return D.DIGITS[+d]; })), out = [];
                for (let i = 0; i < t.length; i++) { if (t[i] === 'ل' && t[i + 1] === 'ا') { out.push('لا'); i++; } else out.push(t[i]); }
                return out;
            };
            for (let pi = 0; pi < pages.length; pi++) {
                const p = pages[pi];
                if (left <= 0) break;
                if (!byPage[pi].some(function (line) { return line.some(function (gl) { return g.ids.indexOf(gl.font) >= 0; }); })) continue;
                const runs = [];
                byPage[pi].forEach(function (line) {
                    if (left - runs.length <= 0) return;
                    const words = []; let cur = [], prev = null;
                    const mine = [];
                    line.forEach(function (gl) {
                        if (gl.space && gl.font === undefined && gl.cid === undefined) return;
                        const gap = prev && gl.x - (prev.x + (prev.w || 0)) > GAP * Math.min(prev.size || 10, gl.size || 10);
                        prev = gl;
                        const e = byId[gl.font], gid = e && g.ids.indexOf(gl.font) >= 0 && gl.cid !== undefined ? e.F.gid(gl.cid) : undefined;
                        const ok = gid !== undefined && gid in e.F.hs;
                        if (gap || !ok) { if (cur.length) words.push(cur); cur = []; }
                        if (ok) { cur.push(g.key(gl.font, +gid)); mine.push(gl); }
                    });
                    if (cur.length) words.push(cur);
                    if (mine.length < 3) return;
                    const size = mine[0].size || 10;
                    const x0 = Math.min.apply(null, mine.map(function (x) { return x.x; })) - 0.3 * size, x1 = Math.max.apply(null, mine.map(function (x) { return x.x + (x.w || 0); })) + 0.3 * size;
                    // (words in reading order: right to left; each word's glyphs as drawn, left to right — read backwards
                    // unless OCR reads the word as a number, which runs left to right)
                    runs.push({ x0: x0, x1: x1, base: mine[0].y, size: size, words: words.reverse() });
                });
                if (!runs.length) continue;
                left -= runs.length;
                const pix = await this._ladOcrPixels(p);
                if (!pix) continue;
                const vp = this._pageViewport(p, pix.scale);
                const boxes = runs.map(function (r) {
                    const a = vp.convertToViewportPoint(r.x0, r.base + 1.05 * r.size), b = vp.convertToViewportPoint(r.x1, r.base - 0.45 * r.size);
                    const bx0 = Math.max(0, Math.floor(Math.min(a[0], b[0]))), bx1 = Math.min(pix.w, Math.ceil(Math.max(a[0], b[0])));
                    const by0 = Math.max(0, Math.floor(Math.min(a[1], b[1]))), by1 = Math.min(pix.h, Math.ceil(Math.max(a[1], b[1])));
                    return { x0: bx0, x1: bx1, y0: by0, y1: by1 };
                });
                const pg = { w: pix.w, h: pix.h, clean: pix.px, boxes: boxes };
                for (let i = 0; i < runs.length; i++) {
                    this._stage('decipher', k, n, [k + 1, n]);
                    await this._yield();
                    if (boxes[i].x1 - boxes[i].x0 < 4 || boxes[i].y1 - boxes[i].y0 < 4) continue;
                    const text = O.postCorrect(eng.reader.line(pg, i).text, eng.vocab);
                    const ow = text.split(/\s+/).filter(function (w) { return /[\u0600-\u06FF0-9]/.test(w); }), r = runs[i];
                    const num = function (w) { return /^[0-9\u06F0-\u06F9\u0660-\u0669]+$/.test(w); };
                    if (ow.length === r.words.length) {
                        r.words.forEach(function (w, j) {
                            const t = tokens(ow[j]), codes = num(ow[j]) ? w : w.slice().reverse();
                            if (t.length === codes.length) codes.forEach(function (c, q) { add(c, t[q]); });
                        });
                        continue;
                    }
                    // (word gaps that differ — a ZWNJ, a gap the file does not draw: the whole run, when its letters count the same)
                    if (ow.some(num)) continue;
                    const all = [].concat.apply([], r.words.map(function (w) { return w.slice().reverse(); })), t = tokens(ow.join(''));
                    if (t.length === all.length) all.forEach(function (c, q) { add(c, t[q]); });
                }
                pix.px = null;
                try { if (p.page && p.page.cleanup) p.page.cleanup(); } catch (e) { /* busy: let it be */ }
            }
            self._fire('trust.decipherVotes');
            return V;
        },

        /** the document's own words: the Arabic-script words of the fonts not deciphered (the file names them right) */
        _decLexicon(lines, skip) {
            const D = PdfImporter._decipher, lex = new Map();
            lines.forEach(function (line) {
                let w = '';
                const flush = function () { const t = D.norm(w).replace(/ـ/g, ''); if (t.length > 1 && Array.from(t).every(D.isLetter)) lex.set(t, (lex.get(t) || 0) + 1); w = ''; };
                line.slice().reverse().forEach(function (g) {
                    if (g.space || !g.font || skip[g.font] || typeof g.ch !== 'string') { flush(); return; }
                    const c = nfkcArabic(g.ch);
                    if (/^[ء-يپچژکگیـ]+$/.test(c)) w += c; else flush();
                });
                flush();
            });
            return lex;
        },

        /**
         * The decipherment of the fonts ids (3.5, decipher.js): each font of Arabic script (decJoin of its glyph uses join
         * forward) that is not named right, its subsets pooled by outline, the biggest first; a reading that comes out
         * 'read' is taken — its words join the lexicon of the next —, 'low' and 'garbled' are not. → { font id: { glyph id:
         * text } }. The step is named a font at a time; Cancel stops it within a font.
         */
        async _decipherFonts(pages, lines, ids, side) {
            const A = this._arb, self = this, out = {};
            this._decUse = {}; this._decRead = [];
            if (!(await this._loadDecipher())) return out;
            const D = PdfImporter._decipher, GF = PdfImporter._glyphfeat, model = GF.model(global.KelkPdfFeatModel), L = D.lm(PdfImporter._lmFa);
            const entries = [];
            ids.forEach(function (id) {
                const F = A.font[id], f = F && GF.font(F.bytes);
                if (!f) return;
                const usage = self._decUsage(lines, id, F);
                if (!usage.counts.size || D.joinShare(f, usage) < T('decJoin')) return;
                entries.push({ id: id, F: F, f: f, hs: F.hs, usage: usage });
                self._decUse[id] = usage;
            });
            if (!entries.length) return out;
            const byId = {}; entries.forEach(function (e) { byId[e.id] = e; });
            const skip = {}; ids.forEach(function (id) { skip[id] = 1; });
            const lexicon = this._decLexicon(lines, skip);
            const groups = D.pool(entries).map(function (g) { let n = 0; g.usage.counts.forEach(function (v) { n += v; }); return { g: g, n: n }; })
                .sort(function (a, b) { return b.n - a.n; }).map(function (x) { return x.g; });
            const tick = function () { return self._yield(); };
            // (each page's lines once, for every group's anchors and votes: a long document held the page otherwise)
            const byPage = [];
            for (const p of pages) { byPage.push(this._approxLines([p])); await this._yield(); }
            const ocrCould = [];
            let eng;                                       // (OCR's engine: loaded on the first font that wants votes)
            try {
                for (let k = 0; k < groups.length; k++) {
                    const g = groups[k], e0 = byId[g.ids[0]];
                    this._stage('decipher', k, groups.length, [k + 1, groups.length]);
                    const f = { upm: e0.f.upm, path: function (p) { const r = g.rep(p); return byId[r[0]].f.path(r[1]); }, adv: function (p) { const r = g.rep(p); return byId[r[0]].f.adv(r[1]); } };
                    const P = D.prepare(f, g.usage, model);
                    if (!P.symbols.size) continue;
                    const lines_ = await this._decLines(byPage, g, byId), o = { symbols: P.symbols, words: P.words, hollow: P.hollow, lm: L, model: model, lexicon: lexicon.size ? lexicon : null, tick: tick, lines: lines_ };
                    let r = await D.run(o);
                    const uses = g.usage.counts.size ? Array.from(g.usage.counts.values()).reduce(function (a, b) { return a + b; }, 0) : 0;
                    // OCR's votes (3.4's engine) where the reading is least sure: a font 'low', a short font, digits no anchor
                    // reached — with Settings → Scanned pages «Read with OCR» (options.ocr 'read'); else the report says OCR may help
                    const unsure = r.verdict === 'low' || (r.digitsUncertain && r.digitsUncertain.size > 0);
                    let voted = 0;
                    if (!side && (unsure || uses < T('decOcrUses'))) {
                        if (this.options.ocr === 'read') {
                            if (eng === undefined) eng = await this._decOcrEngine();
                            const votes = eng ? await this._decVotes(pages, byPage, g, byId, eng, k, groups.length) : null;
                            if (votes && votes.size) { r = await D.run(Object.assign({}, o, { ocr: votes })); voted = votes.size; }
                        } else if (unsure) ocrCould.push({ names: g.ids.map(function (id) { return A.font[id].name; }), pages: this._decPages(pages, g) });
                    }
                    this._decRead.push({ fonts: g.ids.map(function (id) { return A.font[id].name; }), verdict: r.verdict, hollow: r.hollow, uses: uses, fit: +r.perGlyph.toFixed(2), agree: +r.agreement.toFixed(3),
                        voted: voted, uncertainDigits: r.digitsUncertain ? r.digitsUncertain.size : 0 });
                    this._fire('trust.decipher' + r.verdict[0].toUpperCase() + r.verdict.slice(1));
                    if (side) { side(g, byId, r); continue; }
                    if (r.verdict !== 'read') continue;
                    // the file's names against the reading: where they agree on half the letters, they are the font's own
                    if (this._decNamedRight(pages, g, byId, r.map)) { this._fire('trust.approxNamedRight'); continue; }
                    g.ids.forEach(function (id) {
                        const text = {};
                        byId[id].usage.counts.forEach(function (n, gid) { const t = r.map.get(g.key(id, gid)); if (t) text[gid] = t; });
                        out[id] = text;
                    });
                    P.words.forEach(function (w) {
                        const t = D.norm(w.codes.map(function (c) { return r.map.get(c) || ''; }).join('')).replace(/ـ/g, '');
                        if (t.length > 1 && Array.from(t).every(D.isLetter)) lexicon.set(t, (lexicon.get(t) || 0) + w.n);
                    });
                }
            } finally { if (eng) eng.reader.end(); }
            if (ocrCould.length) {
                const names = Array.from(new Set([].concat.apply([], ocrCould.map(function (x) { return x.names; })))).map(function (n) { return String(n).replace(/^[A-Z]{6}\+/, ''); });
                const pg = Array.from(new Set([].concat.apply([], ocrCould.map(function (x) { return x.pages; })))).sort(function (a, b) { return a - b; });
                this._note('fontOcr', 'Some fonts Kelk does not know (' + names.join(', ') + ') could not be read for sure from their shapes; OCR could read them (Read with OCR; page ' + pg.join(', ') + ').', pg);
            }
            return out;
        },

        /**
         * The lab's side-by-side check (options.decipherKnown, never in Settings): the fonts of Arabic script fontprints
         * read are deciphered too, as if no face knew them, and the reading is compared with the fontprints' glyph by
         * glyph — letters, digits and marks apart. Nothing is taken. → this._decSide: [{ fonts, family, face, verdict,
         * letters: [right, of], digits: [right, of], marks: [right, of] }]
         */
        async _decipherSide(pages) {
            const A = this._arb, D0 = PdfImporter._decipher, out = this._decSide = [];
            const ids = Object.keys(A.font).filter(function (id) { const F = A.font[id]; return F && F.bytes && A.mode[id] && F.m && F.m.family; });
            if (!ids.length) return;
            const lines = this._approxLines(pages), seen = {};
            await this._decipherFonts(pages, lines, ids, function (g, byId, r) {
                const D = D0 || PdfImporter._decipher, k = { letters: [0, 0], digits: [0, 0], marks: [0, 0] };
                pages.forEach(function (p) { p.glyphs.forEach(function (gl) {
                    if (g.ids.indexOf(gl.font) < 0 || gl.cid === undefined || typeof gl.ch !== 'string') return;
                    const e = byId[gl.font], gid = e.F.gid(gl.cid), t = gid === undefined ? null : r.map.get(g.key(gl.font, +gid));
                    if (!t) return;
                    const want = D.norm(gl.ch).replace(/[\u0660-\u0669\u06F0-\u06F90-9]/g, function (c) { return String((c.charCodeAt(0) - (c >= '۰' ? 0x6F0 : c >= '٠' ? 0x660 : 48))); });
                    const got = D.norm(t).replace(/[\u06F0-\u06F9]/g, function (c) { return String(c.charCodeAt(0) - 0x6F0); });
                    const kind = /^[0-9]$/.test(want) ? 'digits' : Array.from(want).every(D.isLetter) && want ? 'letters' : 'marks';
                    k[kind][1]++;
                    if (want === got || (want === 'لا' && got === 'لا')) k[kind][0]++;
                }); });
                const F0 = byId[g.ids[0]].F;
                if (seen[g.ids.join()]) return;
                seen[g.ids.join()] = 1;
                out.push(Object.assign({ fonts: g.ids.map(function (id) { return A.font[id].name; }), family: F0.m.family, face: F0.m.face, verdict: r.verdict }, k));
            });
        },

        /** whether a group's reading agrees with what the file names its glyphs on half their letter uses or more */
        _decNamedRight(pages, g, byId, map) {
            let letters = 0, agree = 0;
            pages.forEach(function (p) { p.glyphs.forEach(function (gl) {
                const e = byId[gl.font];
                if (!e || g.ids.indexOf(gl.font) < 0 || gl.cid === undefined) return;
                const gid = e.F.gid(gl.cid), t = gid === undefined ? null : map.get(g.key(gl.font, +gid));
                if (!t || !/\p{L}/u.test(t)) return;
                letters++;
                if (fold(gl.ch || '') === fold(t)) agree++;
            }); });
            return letters > 0 && agree >= T('trustApproxAgree') * letters;
        },

        async _loadShapes() {
            const have = function () { return !!(PdfImporter._shape && global.KelkPdfShapes); };
            if (have()) return true;
            try {
                if (this.options.loadShapes) await this.options.loadShapes();
                else if (typeof document === 'undefined' && typeof require === 'function') {
                    require('./shape.js');
                    global.KelkPdfShapes = require('./shapes.js');
                } else {
                    const base = this.options.partsBase || (function () {
                        const el = document.querySelector('script[src*="pdfimport/trust.js"]');
                        return el ? el.src.replace(/[^/]*$/, '') : 'lib/pdfimport/';
                    })();
                    if (!PdfImporter._shape) await this._loadScript(base + 'shape.js');
                    if (!global.KelkPdfShapes) await this._loadScript(base + 'shapes.js');
                }
            } catch (e) { return false; }
            return have();
        },

        /**
         * the language of a note Kelk writes into the document (the hidden-text block): 'fa', 'ar' or 'en'. In order:
         * the document's own text — what stays on the pages in fonts the judge trusts, with enough letters to tell
         * (a garbled font's letters say nothing: a Persian file read as Latin gibberish got an English note) —; the
         * language the file declares when that is Persian or Arabic (English is every program's default, and says
         * little); the interface's language (options.uiLang: the reader's); English.
         */
        _noteLang(pages) {
            const bad = (this._garbled && this._garbled.why) || {};
            let ar = 0, pe = 0, la = 0;
            // (the first few thousand letters tell: a long document is not read through for it)
            for (let i = 0; i < (pages || []).length && ar + la < 4000; i++) {
                const gs = pages[i].glyphs;
                for (let k = 0; k < gs.length; k++) {
                    const g = gs[k]; if (bad[g.font] || g.space) continue;
                    const c = nfkcArabic(g.ch || ''); if (AR.test(c)) { ar++; if (PE.test(c)) pe++; } else if (LA.test(c)) la++;
                }
            }
            if (ar + la >= T('trustMinLetters')) return ar > la ? (pe ? 'fa' : 'ar') : 'en';
            const two = function (s) { return String(s || '').toLowerCase().slice(0, 2); };
            const file = two(this._lang), ui = two(this.options.uiLang);
            if (file === 'fa' || file === 'ar') return file;
            if (HIDDEN[ui]) return ui;
            return ar + la ? (ar > la ? (pe ? 'fa' : 'ar') : 'en') : 'en';
        },

        /** the hidden glyphs of each page as text: [{ page, why, text, y, lang }], a page's pieces in the order off, white, tiny, invisible */
        _hiddenItems(pages, fonts) {
            const self = this, out = [];
            let lang = null;
            const plain = function (glyphs) {
                // (the fallback: rows by baseline, left to right, a space at a gap)
                const rows = [];
                glyphs.slice().sort(function (a, b) { return b.y - a.y || a.x - b.x; }).forEach(function (g) {
                    const r = rows[rows.length - 1];
                    if (r && Math.abs(r.y - g.y) < 0.5 * (g.size || 1)) r.g.push(g); else rows.push({ y: g.y, g: [g] });
                });
                return rows.map(function (r) {
                    let t = '', px = null;
                    r.g.sort(function (a, b) { return a.x - b.x; }).forEach(function (g) { if (px !== null && g.x - px > 0.25 * (g.size || 1) && !/ $/.test(t)) t += ' '; t += g.space ? ' ' : (g.ch || ''); px = g.x + (g.w || 0); });
                    return t;
                });
            };
            pages.forEach(function (p) {
                if (!p || !p.hidden) return;
                WHY.forEach(function (why) {
                    const glyphs = p.hidden[why];
                    if (!glyphs || !glyphs.some(function (g) { return !g.space && g.ch; })) return;
                    let lines;
                    try {
                        // (the page's own line builder, over these glyphs alone: words, spaces and the visual order as the text has them)
                        const pp = Object.assign({}, p, { glyphs: glyphs.map(function (g) { const c = Object.assign({}, g); delete c.hid; delete c.invisible; return c; }), rects: [], hsegs: [], vsegs: [], vectors: [], images: [], small: [], links: [], hidden: null });
                        lines = self._lines(pp, fonts, self._emojiMap ? self._emojiMap() : null).map(function (L) {
                            // (each line as a paragraph of its own would be read: its logical order, its numbers and letters written out)
                            const lg = self._joinLines([L], L.strong.R > L.strong.L ? 'rtl' : 'ltr').map(function (g) { return g.atom ? g : Object.assign({}, g, { ch: nfkcArabic(g.ch || '') }); });
                            return self._writeOut(lg).map(function (g) { return g.atom ? '' : g.ch || ''; }).join('');
                        });
                    } catch (e) { if (e && e.code === 'aborted') throw e; lines = plain(glyphs); }
                    const text = lines.map(function (t) { return nfkcArabic(t).replace(/[\u0000-\u001F\u007F\uFFFD]/g, ' ').replace(/\s+/g, ' ').trim(); }).filter(Boolean).join('\n');
                    if (!text) return;
                    out.push({ page: p.num, why: why, text: text, y: Math.max.apply(null, glyphs.map(function (g) { return g.y; })), lang: lang || (lang = self._noteLang(pages)) });
                });
            });
            return out;
        },

        /**
         * lost text (3.1): the layout counts the letters it is given and the letters its blocks hold, page by page; a
         * letter a step drops on purpose is counted with its reason (_lostDrop: page furniture, doubles, ornaments…).
         * What is left — letters gone with no known reason — is the note lostText. A glyph is known by its page and its
         * place in the page's glyphs (lid, set by lines.js): one glyph copied into several views is counted once; a mark
         * or a ligature folded into another glyph moves its letters with it. Letters: NFKC, letters and digits only.
         */
        _lostLetters(g) {
            if (!g || g.space || !g.ch) return 0;
            const m = g.ch.normalize('NFKC').replace(/\u0640/g, '').match(/[\p{L}\p{N}]/gu);     // (a kashida is no letter)
            return m ? m.length : 0;
        },

        _lostIn(pages) {
            const self = this, book = this._lostBook = {}, snap = {};
            pages.forEach(function (p) {
                const b = book[p.num] || (book[p.num] = { in: 0, drop: new Map() }), m = snap[p.num] = new Map();
                p.glyphs.forEach(function (g, i) { const n = self._lostLetters(g); b.in += n; if (n) m.set(i + 1, { page: p.num, lid: i + 1, ch: g.ch }); });
            });
            return snap;
        },

        /**
         * the glyphs a step of the layout took out of the pages' lines: why, the step's name when its drops are on
         * purpose (null: no known reason, counted lost unless a later step gives them back). before: the last snapshot.
         */
        _lostStep(why, all, before) {
            if (!this._lostBook || !before) return before;
            const snap = {}, gone = [];
            all.forEach(function (pl) {
                const m = snap[pl.p.num] || (snap[pl.p.num] = new Map());
                pl.lines.forEach(function (L) { (L.glyphs || []).forEach(function (g) { if (g.lid) m.set(g.lid, g); }); });
            });
            Object.keys(before).forEach(function (num) { const m = snap[num] || new Map(); before[num].forEach(function (g, lid) { if (!m.has(lid)) gone.push(g); }); });
            if (why) this._lostDrop(why, gone);
            return snap;
        },

        /** glyphs a step keeps as text of its own (a code block's lines are strings, not glyphs) */
        _lostKeep(glyphs) {
            const book = this._lostBook, self = this;
            if (!book) return;
            (glyphs || []).forEach(function (g) { const b = g && book[g.page]; if (b && g.lid) (b.keep || (b.keep = new Map())).set(g.lid, self._lostLetters(g)); });
        },

        /** glyphs a step drops on purpose, and why (each glyph counted once: the first reason given) */
        _lostDrop(why, glyphs) {
            const book = this._lostBook, self = this;
            if (!book) return;
            (glyphs || []).forEach(function (g) {
                const b = g && book[g.page];
                if (!b || !g.lid || b.drop.has(g.lid)) return;
                b.drop.set(g.lid, [why, self._lostLetters(g)]);
            });
        },

        /**
         * the letters the blocks hold, and the note: a page short of more than lostTextMin letters with no known
         * reason, and of more than lostTextShare of its own (a glyph counted as dropped and also kept is kept)
         */
        _lostOut(blocks) {
            const book = this._lostBook, self = this;
            if (!book) return;
            const out = {}, vis = new Set();
            const walk = function (x) {
                if (!x || typeof x !== 'object' || vis.has(x)) return;
                vis.add(x);
                if (Array.isArray(x)) { x.forEach(walk); return; }
                if (typeof x.ch === 'string' && typeof x.x === 'number') {
                    if (book[x.page] && x.lid) { const o = out[x.page] || (out[x.page] = new Map()); o.set(x.lid, Math.max(o.get(x.lid) || 0, self._lostLetters(x))); }
                    return;
                }
                Object.keys(x).forEach(function (k) { walk(x[k]); });
            };
            walk(blocks);
            const lost = [], pages = [];
            Object.keys(book).forEach(function (num) {
                const b = book[num], o = out[num] || new Map(), drops = {};
                if (b.keep) b.keep.forEach(function (n, lid) { o.set(lid, Math.max(o.get(lid) || 0, n)); });
                let kept = 0, dropped = 0;
                o.forEach(function (n) { kept += n; });
                b.drop.forEach(function (d, lid) { if (o.has(lid) || !d[1]) return; drops[d[0]] = (drops[d[0]] || 0) + d[1]; dropped += d[1]; });
                const gone = Math.max(0, b.in - kept - dropped);
                pages.push({ page: +num, in: b.in, out: kept, drops: drops, lost: gone });
                if (gone > self._t('lostTextMin') && gone > self._t('lostTextShare') * b.in) lost.push(+num);
            });
            this._lostPages = pages;
            this._lostBook = null;
            if (lost.length) {
                this._fire('trust.lostText');
                this._note('lostText', 'Some of this file\'s text was left out with no known reason (page' + (lost.length > 1 ? 's ' : ' ') + lost.join(', ') + '). Compare it with the PDF.', lost);
            }
        },

        /** the note hiddenText, with its pages */
        _hiddenNote(items) {
            const pages = Array.from(new Set(items.map(function (h) { return h.page; }))).sort(function (a, b) { return a - b; });
            this._note('hiddenText', 'This file holds text that is not shown when it is viewed (page' + (pages.length > 1 ? 's ' : ' ') + pages.join(', ') + ': ' +
                Array.from(new Set(items.map(function (h) { return HIDDEN.en[2][h.why]; }))).join(', ') + '). ' +
                (this.options.hiddenText === 'drop' ? 'It was left out of the text.' : 'It is given in a marked block: check it, and in most cases delete it.'), pages);
        },

        /**
         * 'inPlace': a mark — a paragraph of one word — before the first block of the piece's page that lies under it
         * (after the page's last block when none does; at the end when the page gave no block): between blocks, never
         * inside one. _hiddenMarkdown puts the piece's block in the mark's place.
         */
        _hiddenMarks(blocks, items) {
            const self = this;
            const tops = blocks.map(function (b) {
                const t = {};
                self._trustRuns([b]).forEach(function (run) { run.forEach(function (g) { if (g && g.page && typeof g.y === 'number' && !(t[g.page] >= g.y)) t[g.page] = g.y; }); });
                return t;
            });
            const model = (function () { for (const b of blocks) { const r = self._trustRuns([b])[0]; if (r && r[0]) return r[0]; } return null; })();
            if (!model) return;
            const at = [];
            items.forEach(function (h, k) {
                let i = -1, last = -1;
                for (let q = 0; q < blocks.length; q++) {
                    if (tops[q][h.page] === undefined) continue;
                    last = q;
                    if (i < 0 && tops[q][h.page] < h.y) i = q;
                }
                if (last < 0) return;                                  // (no block of its page: the piece goes to the end)
                h.mark = MARK + k + 'x';
                const glyphs = Array.from(h.mark).map(function (c) { return Object.assign({}, model, { ch: c, space: false, bold: false, italic: false, mono: false, strike: false, link: undefined, math: undefined, atom: undefined, pic: undefined, cover: undefined }); });
                at.push({ before: i >= 0 ? i : last + 1, order: k, block: { type: 'p', glyphs: glyphs, dir: 'ltr' } });
            });
            at.sort(function (a, b) { return b.before - a.before || b.order - a.order; }).forEach(function (m) { blocks.splice(m.before, 0, m.block); });
        },

        /** the Markdown with the hidden text's blocks: in the marks' places ('inPlace'), the rest — or all ('end') — at the end; 'drop': none */
        _hiddenMarkdown(md, items) {
            if (!items || !items.length) return md;
            const mode = this.options.hiddenText;
            let out = String(md || ''), rest = [];
            if (mode === 'inPlace') {
                // (pieces marked at one place: one block, one note)
                const groups = [];
                items.forEach(function (h) {
                    if (!h.mark || out.indexOf(h.mark) < 0) { rest.push(h); return; }
                    const g = groups[groups.length - 1];
                    if (g && new RegExp('^' + g.marks[g.marks.length - 1] + '\\s+' + h.mark, 'm').test(out)) { g.items.push(h); g.marks.push(h.mark); }
                    else groups.push({ items: [h], marks: [h.mark] });
                });
                groups.forEach(function (g) {
                    out = out.replace(g.marks[0], function () { return hiddenMd(g.items[0].lang, g.items).replace(/\n$/, ''); });
                    g.marks.slice(1).forEach(function (m) { out = out.replace(new RegExp('\\n*' + m + '(?=\\n|$)'), ''); });
                });
            } else if (mode !== 'drop') rest = items.slice();
            if (mode === 'drop' || !rest.length) return out;
            return out.replace(/\s+$/, '') + '\n\n' + hiddenMd(rest[0].lang, rest);
        },

        /** a simple font whose program names no character: codes to glyphs only (a (1,0) or (3,0) cmap), no Unicode cmap */
        async _trustUnnamed(font) {
            try {
                if (!font || font.composite || !this._rawIdx()) return false;
                const files = await this._fontPrograms(), name = String(font.name || '').replace(/[()<>\[\]{}\/%\s]/g, '');
                const cands = ((files || {})[name] || []).filter(function (e) { return !e.composite; });
                if (cands.length !== 1) return false;
                const bytes = await this._rawStream(cands[0].ref);
                if (!(bytes && bytes.length > 12)) return false;
                const m = PdfImporter._internal.sfntLigatures(bytes);
                return Object.keys(m.c2g).length > 0 && Object.keys(m.g2u).length === 0;
            } catch (e) { return false; }
        },

        /**
         * 5.9 the judge over the document's blocks: the fonts whose text is no language → the note garbledText (its
         * pages), this._garbled = { fonts: [names], pages: [numbers], share: { page: the share of its letters in those
         * fonts, each weighed by how garbled its font is } } — _ladReport lowers those pages' confidence by it. The Markdown is not touched.
         */
        async _trustReport(blocks, fonts) {
            this._garbled = null;
            const runs = this._trustRuns(blocks), j = judge(runs), bad = {};
            for (const id of Object.keys(j)) {
                const why = j[id].why.slice();
                if (j[id].odd && await this._trustUnnamed((fonts[id] || {}).font)) why.push('unnamed');
                if (why.length) bad[id] = why;
            }
            const ids = Object.keys(bad);
            if (!ids.length) return;
            // how garbled a font is, 0 to 1: its worst measure against twice its limit and more (a font of scattered
            // letters is 1; one whose marks alone are named wrong is a third)
            const sev = {};
            ids.forEach(function (id) {
                const m = j[id], r = function (v, name, k) { return v / (k * T(name)); };
                sev[id] = bad[id].indexOf('unnamed') >= 0 || bad[id].indexOf('foreign') >= 0 ? 1 : Math.min(1, Math.max(r(m.ar.unseen, 'trustArUnseen', 2), r(m.ar.single, 'trustArSingle', 2), r(m.ar.punct, 'trustArPunct', 4),
                    r(m.la.signs, 'trustLaSigns', 2), m.la.pairs >= T('trustLaMinPairs') ? r(m.la.unseen, 'trustLaUnseen', 1.5) : 0));
            });
            const all = {}, gar = {};
            runs.forEach(function (run) { run.forEach(function (g) {
                if (!g || g.space || !g.ch || !g.page || BLANK.test(g.ch)) return;
                all[g.page] = (all[g.page] || 0) + 1;
                if (bad[g.font]) gar[g.page] = (gar[g.page] || 0) + sev[g.font];
            }); });
            const share = {}, pages = Object.keys(gar).map(Number).sort(function (a, b) { return a - b; });
            pages.forEach(function (p) { share[p] = +(gar[p] / all[p]).toFixed(3); });
            const names = Array.from(new Set(ids.map(function (id) { return String((fonts[id] || {}).name || id).replace(/^[A-Z]{6}\+/, ''); }))).sort();
            this._garbled = { fonts: names, pages: pages, share: share, why: bad };
            this._fire('trust.garbledFont');
            this._note('garbledText', 'The text of ' + (names.length > 1 ? 'some fonts' : 'a font') + ' (' + names.join(', ') + ') is not readable: the file does not name ' +
                'its characters right, and the text of page' + (pages.length > 1 ? 's ' : ' ') + pages.join(', ') + ' is scrambled where it is drawn in ' + (names.length > 1 ? 'them' : 'it') + '.', pages);
        }
    });

    PdfImporter._trust = { judge: judge, measure: measure, fold: fold, hiddenMd: hiddenMd, HIDDEN: HIDDEN };
})(typeof window !== 'undefined' ? window : globalThis);
