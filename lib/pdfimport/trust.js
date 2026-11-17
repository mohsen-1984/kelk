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
        trustPrintMinGlyphs: { def: 12, unit: 'glyphs', used: [X + '_fontArbiter'], fixed: true },
        trustPrintKnown: { def: 0.8, unit: 'share', used: [X + '_fontArbiter'], fixed: true },
        trustPrintAgree: { def: 0.85, unit: 'share', used: [X + '_fontArbiter'], fixed: true }
    });
    const T = function (name) { return PdfImporter._thresholds[name].def; };
    const AR = /[\u0621-\u063A\u0641-\u064A\u067E\u0686\u0698\u06A9\u06AF\u06CC]/, LA = /[A-Za-z]/;
    const SIGN = /[\u00A1-\u00BF\u00D7\u00F7\u02C6-\u02DC\u2018-\u203A\u0192\u0152\u0153\u0160\u0161\u0178]/;
    const fold = function (s) { return nfkcArabic(String(s || '')).replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[\u064A\u0649]/g, '\u06CC').replace(/\u0643/g, '\u06A9'); };
    const ODD_IN = /[A-Za-z0-9][^A-Za-z0-9'\u2019.,:\/@_\u00C0-\u024F-]+[A-Za-z0-9]/, ODD_ALL = /^[^A-Za-z0-9]{3,}$/;
    const BLANK = /^[\s\u200C\u200B]*$/;
    const PE = /[\u067E\u0686\u0698\u06AF]/;
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
                for (const c of cands) { const bytes = await this._rawStream(c.ref, true); if (bytes && bytes.length > 12) progs.push({ bytes: bytes, m: sfnt(bytes) }); }
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
                const hs = FP.hashes(P.bytes), m = FP.match(hs, data, f.name);
                if (!m) return null;
                const c2g = f.composite ? null : P.m.c2g;
                A.font[id] = { m: m, hs: hs, name: String(f.name || '').replace(/^[A-Z]{6}\+/, ''), gid: function (cid) { return f.composite ? +cid : c2g[cid]; } };
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
            if (ARB_DIGIT.test(ch) || /[0-9\u0660-\u0669\u06F0-\u06F9]/.test(t) || /[\u200B-\u200F\u00AD]/.test(ch)) return false;
            if (letter(ch)) return sign(t) || arSign(t);
            // (a blank where the face has a mark stays: the file often names the mark with its letter)
            if (letter(t)) return sign(ch) || (!/^\p{M}+$/u.test(t) && (!ch.trim() || /[\uFFFD\u0000-\u001F\uE000-\uF8FF]/.test(ch)));
            return sign(ch) && sign(t);
        },

        /** a font's verdict from what the pages read so far hold of it: 'few' | 'all' | 'none' (sound, nothing to do: left open) | null (too little yet) */
        _arbiterDecide(id) {
            const A = this._arb, F = A.font[id], read = A.read[id] || {}, self = this;
            if (!F) return null;
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
                sev[id] = bad[id].indexOf('unnamed') >= 0 ? 1 : Math.min(1, Math.max(r(m.ar.unseen, 'trustArUnseen', 2), r(m.ar.single, 'trustArSingle', 2), r(m.ar.punct, 'trustArPunct', 4),
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
