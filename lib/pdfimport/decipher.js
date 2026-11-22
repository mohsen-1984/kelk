/**
 * PdfImporter — the decipherment of a font Kelk does not know (lib/pdfimport/decipher.js)
 * ============================================================================
 * An Arabic-script font that no fontprint knows and whose file names no letter (or names them wrong) is read as a
 * cipher (Kelk 3.5, after the font-recovery spike's decipher.js and pool.js): each glyph is a symbol, the plain text
 * Persian. The evidence:
 *   1. the outline (lib/pdfimport/glyphfeat.js): P(features | letter, joins forward), counted on the fonts Kelk ships
 *      (lib/pdfimport/featmodel.js) — no hand-written letter table;
 *   2. the page: word breaks, which glyph follows one that joins forward; one font draws each (letter, form) once;
 *   3. a Persian letter trigram mixed with a word unigram (lib/pdfimport/lm-fa.js, tools/build-lm.js), and the
 *      document's own words (the lexicon: the fonts the file names right, and the fonts read before).
 * The search is simulated annealing over glyph → letter, two runs (a third when they disagree); the best score wins.
 * The verdict comes from the reading's own signals, never from a key: how well its letters fit the language per
 * glyph, and how far the runs agree — 'read', 'low' or 'garbled'. A hollow face is never 'read'. Marks are settled by
 * their drawn shape once the search has said "a mark". Which digit a digit glyph is: the document's own counting first
 * (page numbers, numbered lists, years: anchors), then the outline's top profile among the digits left. OCR's votes,
 * when given (o.ocr: Map glyph → Map text → votes), join each glyph's candidates and weigh on its digit.
 *
 *   PdfImporter._decipher.lm(data)                lm-fa.js's counts → { wordLp(word), freq, norm } (built once)
 *   PdfImporter._decipher.prepare(f, usage, M)    f: glyphfeat.font; usage: { counts: Map key → uses, seqs: [[key | null]]
 *                                                 a line each, in drawing order, null a break } → { symbols, words, hollow }
 *   PdfImporter._decipher.run(o)                  async: o { symbols, words, lm, model, lexicon, tick, lines, ocr } → { map:
 *                                                 Map key → text, verdict, perGlyph, agreement, hollow, digitsUncertain }
 *   PdfImporter._decipher.anchors(lines, map, symbols)  digits from page numbers, numbered lists and years: lines [{ page
 *                                                 (from 0), y, seq: [{ gap } | { mine, code } | { mine: false }] }] → Map
 *                                                 glyph → digit (and .notDigit, the marks beside list numbers), or null
 *   PdfImporter._decipher.pool(entries)           entries [{ id, hs: { key: fontprint }, usage }] → groups of subsets of one
 *                                                 font (enough outlines in common), each { ids, usage, key(id, k), back(id, k) }
 *   PdfImporter._decipher.fit(usage, textOf, L)   a reading's mean log-probability per letter (how well its words fit
 *                                                 Persian): where the decipherment and 3.2's shapes both read a font, the
 *                                                 better one is taken
 *   PdfImporter._decipher.joinShare(f, usage)     the share of a font's glyph uses that join forward (Arabic script: 0.3+)
 *
 * Loaded on demand with glyphfeat.js, featmodel.js and lm-fa.js (trust.js _decipherFonts), never at startup.
 */
(function (global) {
    'use strict';
    const PdfImporter = global.PdfImporter || (typeof require === 'function' ? require('../PdfImporter.js') : null);
    const G = function () { return PdfImporter._glyphfeat; };

    const LETTER = /[ء-يپچژکگیآ]/;
    const isLetter = function (ch) { return LETTER.test(ch); };
    const DIGITS = '۰۱۲۳۴۵۶۷۸۹';
    const PUNCT = '.،:()-!؟';
    const HOLLOW_SHARE = 0.5;         // a hollow face: most glyph uses have a counter (0.22 on every face Kelk ships)
    const MARK_SPLIT = 0.31, RAISED = 0.1;    // a full stop below 0.31 of the tall body, a comma above; a raised mark
    const PRIOR_EXP = 0.5;            // how the outline's evidence grows with a glyph's uses (the language's: linearly)
    const W_CLASH = 40;               // one font draws each (letter, form) once
    const MIN_SHARED = 3, MIN_SHARE = 0.2;    // subsets of one font: outlines in common
    const READ = { fit: -4.5, agree: 0.9 }, LOW = { fit: -7, agree: 0.6 };
    const W_OCR = 6, W_OCR_DIGIT = 12;        // what a glyph's OCR votes weigh against its outline's evidence (nats)
    const toFa = function (d) { return DIGITS['0123456789'.indexOf(d)] || d; };
    /** OCR's votes for a digit: up to W_OCR_DIGIT by their share (two votes or more count in full) */
    function ocrDigit(ocr, c, d) {
        const v = ocr && ocr.get(c);
        if (!v) return 0;
        let n = 0, tot = 0;
        v.forEach(function (k, ch) { tot += k; if (toFa(ch) === d) n += k; });
        return tot ? W_OCR_DIGIT * (n / tot) * Math.min(1, tot / 2) : 0;
    }

    const norm = function (s) {
        return String(s).normalize('NFKC').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[ً-ْ]/g, '').replace(/ؤ/g, 'و').replace(/[إأ]/g, 'ا');
    };

    /** the language model from its counts: an interpolated letter trigram, mixed with the word unigram (log-sum) */
    function lm(data) {
        if (data._lm) return data._lm;
        const toMap = function (o) { return new Map(Object.entries(o || {})); };
        const c1 = toMap(data.c1), c2 = toMap(data.c2), c3 = toMap(data.c3), n = data.n;
        const ctx2 = new Map(), ctx1 = new Map(), add = function (m, k, v) { m.set(k, (m.get(k) || 0) + v); };
        c3.forEach(function (v, k) { add(ctx2, k.slice(0, 2), v); });
        c2.forEach(function (v, k) { add(ctx1, k[0], v); });
        const V = c1.size + 1, cache = new Map();
        const lp = function (a, b, c) {
            const key = a + b + c; let v = cache.get(key);
            if (v !== undefined) return v;
            const p1 = ((c1.get(c) || 0) + 0.5) / (n + 0.5 * V);
            const d1 = ctx1.get(b) || 0, p2 = d1 ? (c2.get(b + c) || 0) / d1 : 0;
            const d2 = ctx2.get(a + b) || 0, p3 = d2 ? (c3.get(a + b + c) || 0) / d2 : 0;
            v = Math.log(0.6 * p3 + 0.3 * p2 + 0.1 * p1);
            cache.set(key, v);
            return v;
        };
        const charLp = function (w) { const s = '^^' + w + '$'; let t = 0; for (let i = 2; i < s.length; i++) t += lp(s[i - 2], s[i - 1], s[i]); return t; };
        const vocab = toMap(data.vocab), nWords = data.nWords, wcache = new Map();
        const wordLp = function (w) {
            let v = wcache.get(w);
            if (v !== undefined) return v;
            const a = Math.log(0.75) + charLp(w), c = vocab.get(w);
            if (c) { const b = Math.log(0.25 * c / nWords); v = Math.max(a, b) + Math.log1p(Math.exp(-Math.abs(a - b))); } else v = a;
            if (wcache.size < 200000) wcache.set(w, v);
            return v;
        };
        const freq = Array.from(c1).filter(function (e) { return e[0] !== '$'; }).sort(function (a, b) { return b[1] - a[1]; }).map(function (e) { return e[0]; });
        const out = { wordLp: wordLp, freq: freq, norm: norm };
        Object.defineProperty(data, '_lm', { value: out, enumerable: false });
        return out;
    }

    function classesFor(model, fwd) {
        return Object.keys(model).filter(function (k) { return k.endsWith('|' + (fwd ? 1 : 0)); }).map(function (k) { return k.slice(0, -2); })
            .filter(function (c) { return (c.length === 1 && (isLetter(c) || DIGITS.indexOf(c) >= 0 || PUNCT.indexOf(c) >= 0)) || c === 'لا' || c === 'ـ'; });
    }

    /** which way a bracket's outline bows: -1 a «(» (its middle further left than its ends), +1 a «)» */
    function bowOf(f, key) {
        const p = (f.path(key) || []).filter(function (k) { return k.x !== undefined; });
        if (p.length < 3) return 0;
        let y0 = Infinity, y1 = -Infinity;
        p.forEach(function (k) { y0 = Math.min(y0, k.y); y1 = Math.max(y1, k.y); });
        const ym = (y0 + y1) / 2, hh = y1 - y0;
        const mid = p.filter(function (k) { return Math.abs(k.y - ym) < hh * 0.15; }), ends = p.filter(function (k) { return Math.abs(k.y - ym) > hh * 0.4; });
        if (!mid.length || !ends.length) return 0;
        const minX = function (a) { return Math.min.apply(null, a.map(function (k) { return k.x; })); };
        return minX(mid) < minX(ends) ? -1 : 1;
    }

    /** two small parts of about one size, one above the other: a colon (a Persian semicolon's upper part is taller) */
    function colonLike(f, key) {
        const g = G().parts(f, key);
        if (!g) return false;
        const others = g.dots.concat(g.strokes);
        if (others.length !== 1) return false;
        const a = g.main, b = others[0], em = g.em, ha = a.y1 - a.y0, hb = b.y1 - b.y0;
        return ha < 0.24 * em && hb < 0.24 * em && Math.abs(a.cx - b.cx) < 0.1 * em && Math.abs(a.cy - b.cy) > Math.max(ha, hb) &&
            Math.abs(Math.abs(a.area) - Math.abs(b.area)) < 0.5 * Math.max(Math.abs(a.area), Math.abs(b.area)) && Math.min(ha, hb) > 0.7 * Math.max(ha, hb);
    }

    /** a font's words (keys in reading order: the line's drawing order reversed, right to left), counted */
    function wordsOf(usage, blank) {
        const wc = new Map(), lines = [];
        usage.seqs.forEach(function (seq) {
            const lw = []; let cur = [];
            const flush = function () { if (cur.length) { const k = cur.join(','); wc.set(k, (wc.get(k) || 0) + 1); lw.push(cur); } cur = []; };
            seq.slice().reverse().forEach(function (c) { if (c === null || blank(c)) { flush(); return; } cur.push(c); });
            flush(); lines.push(lw);
        });
        return { wc: wc, lines: lines };
    }

    function prepare(f, usage, model) {
        const GF = G(), keys = Array.from(usage.counts.keys());
        const cx = GF.context(f, keys), fe = new Map();
        keys.forEach(function (c) { fe.set(c, GF.features(f, c, cx)); });
        const tops = Array.from(fe.values()).filter(function (e) { return !e.blank; }).map(function (e) { return e.bodyTop; }).sort(function (a, b) { return a - b; });
        const H = tops[Math.floor(tops.length * 0.9)] || 0.6;
        const W = wordsOf(usage, function (c) { return fe.get(c).blank; }), wc = W.wc;
        const back = new Map();
        wc.forEach(function (n, k) { const cs = k.split(',').map(Number); cs.forEach(function (c, i) { const v = back.get(c) || [0, 0]; v[1]++; if (i && fe.get(cs[i - 1]).left) v[0]++; back.set(c, v); }); });
        const ho = new Map(); let withHole = 0, all = 0;
        fe.forEach(function (e, c) { if (e.blank) return; const h = GF.holes(f, c); ho.set(c, h); const n = usage.counts.get(c); all += n; if (h > 0) withHole += n; });
        // a glyph used mostly in runs of itself («ـــ»: a rule drawn with the kashida) is no letter of words
        const selfRun = new Map();
        wc.forEach(function (n, k) { const cs = k.split(','); if (cs.length >= 2 && cs.every(function (x) { return x === cs[0]; })) selfRun.set(+cs[0], (selfRun.get(+cs[0]) || 0) + n * cs.length); });
        // how often a glyph sits between two others inside a word, by its neighbours (the slash of «۱۲/۵»)
        const between = new Map();
        wc.forEach(function (n, k) { const cs = k.split(',').map(Number); for (let i = 1; i < cs.length - 1; i++) { if (!between.has(cs[i])) between.set(cs[i], []); between.get(cs[i]).push([cs[i - 1], cs[i + 1], n]); } });
        const symbols = new Map();
        fe.forEach(function (e, c) {
            if (e.blank) return;
            const b = back.get(c) || [0, 1], h = (e.top - e.bottom) / (H || 0.6);
            symbols.set(c, { fwd: e.left, back: b[0] / b[1] > 0.5, f: GF.bins(e, H, ho.get(c), GF.profile(f, c)), count: usage.counts.get(c), bow: bowOf(f, c),
                rule: e.kashida && (selfRun.get(c) || 0) >= 0.5 * usage.counts.get(c), between: between.get(c) || [],
                mark: { parts: f.path(c).filter(function (k) { return k.c === 'M'; }).length, bottom: e.bottom, hH: h, flat: (e.top - e.bottom) < 0.6 * e.w, colon: colonLike(f, c),
                    markLike: e.bottom < -0.05 || (e.bottom > RAISED && (e.top - e.bottom) < 0.6 * e.w) || (Math.abs(e.bottom) <= RAISED && h < MARK_SPLIT) } });
        });
        const words = []; wc.forEach(function (n, k) { if (k.split(',').every(function (x) { return symbols.has(+x); })) words.push({ codes: k.split(',').map(Number), n: n }); });
        return { symbols: symbols, words: words, lineWords: W.lines, hollow: all > 0 && withHole / all > HOLLOW_SHARE };
    }

    /** one search: simulated annealing over each glyph's likeliest letters (by its outline) */
    async function solve(o) {
        const symbols = o.symbols, words = o.words, L = o.lm, model = o.model, lexicon = o.lexicon, tick = o.tick, GF = G();
        let rnd = o.seed;
        const rand = function () { return (rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; };
        const codes = Array.from(symbols.keys()), cand = new Map(), prior = new Map();
        codes.forEach(function (c) {
            const s = symbols.get(c);
            const scored = classesFor(model, s.fwd).map(function (cl) { return [cl, GF.logp(model, cl, s.fwd, s.f)]; }).filter(function (x) { return x[1] !== null; }).sort(function (a, b) { return b[1] - a[1]; });
            const top = scored.filter(function (x) { return x[1] > scored[0][1] - 9; }).slice(0, 9);
            // OCR's votes (when given): the voted reading joins the candidates and gains up to W_OCR, by its share
            const v = o.ocr && o.ocr.get(c);
            if (v) {
                let tot = 0; v.forEach(function (n) { tot += n; });
                v.forEach(function (n, ch) {
                    const bonus = W_OCR * (n / tot) * Math.min(1, tot / 3), at = top.findIndex(function (x) { return x[0] === ch; });
                    if (at >= 0) top[at] = [ch, top[at][1] + bonus];
                    else { const sc = scored.find(function (x) { return x[0] === ch; }); if (sc) top.push([ch, sc[1] + bonus]); }
                });
                top.sort(function (a, b) { return b[1] - a[1]; });
            }
            cand.set(c, top.map(function (x) { return x[0]; })); prior.set(c, top.map(function (x) { return x[1]; }));
        });
        const asg = new Map(); codes.forEach(function (c) { asg.set(c, 0); });
        const where = new Map(codes.map(function (c) { return [c, []]; }));
        words.forEach(function (w, i) { new Set(w.codes).forEach(function (c) { if (where.has(c)) where.get(c).push(i); }); });
        const wordScore = function (w) {
            const cs = w.codes.map(function (c) { return cand.get(c)[asg.get(c)]; });
            let v = 0, run = '';
            const kinds = {};
            const flushRun = function () { if (run) { let lp = L.wordLp(run); if (lexicon && run.length > 1 && lexicon.has(run)) lp = Math.max(lp, -1.5 * run.length) + 4; v += lp; } run = ''; };
            cs.forEach(function (ch, i) {
                if (ch === 'ـ') { v -= 4; return; }                       // a kashida is rare in running text
                if (isLetter(ch) || ch === 'لا') { run += ch; kinds.L = 1; return; }
                flushRun();
                if (DIGITS.indexOf(ch) >= 0) { v -= 2.3; kinds.D = 1; return; }
                v -= 3.5; kinds.P = 1;
                // punctuation at a word's edge: an opening bracket before the word, the rest after it
                if (ch === '(' ? i > 0 : (i < cs.length - 1 || (i === 0 && cs.length > 1))) v -= 8;
            });
            flushRun();
            if (kinds.L && kinds.D) v -= 6;                                // digits and letters in one word: unlikely
            return w.n * v;
        };
        const wScore = new Float64Array(words.length);
        words.forEach(function (w, i) { wScore[i] = wordScore(w); });
        const formKey = function (c, l) { const s = symbols.get(c); return l + '|' + (s.fwd ? 'F' : '-') + (s.back ? 'B' : '-'); };
        const owners = new Map();
        codes.forEach(function (c) { const k = formKey(c, cand.get(c)[0]); owners.set(k, (owners.get(k) || 0) + 1); });
        let clash = 0; owners.forEach(function (v) { if (v > 1) clash += v - 1; });
        const weight = function (c) { return Math.pow(symbols.get(c).count, PRIOR_EXP); };
        let cur = wScore.reduce(function (a, b) { return a + b; }, 0) + codes.reduce(function (a, c) { return a + prior.get(c)[0] * weight(c); }, 0) - W_CLASH * clash;
        let best = cur, bestAsg = new Map(asg);
        // long texts converge fast; short ones need the full search, but each step is cheap
        const iters = o.iters || Math.round(Math.min(120000, 6000 + 400 * codes.length) * Math.max(0.15, Math.min(1, 400 / Math.max(1, words.length))));
        const T0 = 25, T1 = 0.05;
        for (let it = 0; it < iters; it++) {
            if (tick && !(it & 255)) await tick();
            const T = T0 * Math.pow(T1 / T0, it / iters);
            const c = codes[Math.floor(rand() * codes.length)], l = cand.get(c);
            if (l.length < 2) continue;
            const old = asg.get(c); let nw = Math.floor(rand() * (l.length - 1)); if (nw >= old) nw++;
            const k0 = formKey(c, l[old]), k1 = formKey(c, l[nw]);
            const dClash = ((owners.get(k1) || 0) >= 1 ? 1 : 0) - ((owners.get(k0) || 0) > 1 ? 1 : 0);
            asg.set(c, nw);
            const ws = where.get(c), news = ws.map(function (i) { return wordScore(words[i]); });
            let dLm = 0; ws.forEach(function (i, k) { dLm += news[k] - wScore[i]; });
            const delta = dLm + (prior.get(c)[nw] - prior.get(c)[old]) * weight(c) - W_CLASH * dClash;
            if (delta >= 0 || rand() < Math.exp(delta / T)) {
                owners.set(k0, owners.get(k0) - 1); owners.set(k1, (owners.get(k1) || 0) + 1);
                ws.forEach(function (i, k) { wScore[i] = news[k]; }); cur += delta; clash += dClash;
                if (cur > best) { best = cur; bestAsg = new Map(asg); }
            } else asg.set(c, old);
        }
        const map = new Map(); codes.forEach(function (c) { map.set(c, cand.get(c)[bestAsg.get(c)]); });
        digitsByProfile(map, symbols, model, o.ocr);
        return { map: map, score: best, perGlyph: best / Math.max(1, words.reduce(function (a, w) { return a + w.n * w.codes.length; }, 0)) };
    }

    /** which digit each digit glyph is: the outline's top profile, among the digit glyphs only (each digit drawn once);
     *  these features help digits and hurt letters on fonts the model never saw, so letters never see them */
    function digitsByProfile(map, symbols, model, ocr) {
        const GF = G(), ALL = Object.keys(GF.FEATS), dg = Array.from(map.keys()).filter(function (c) { return DIGITS.indexOf(map.get(c)) >= 0; });
        const pairs = [];
        dg.forEach(function (c) { Array.from(DIGITS).forEach(function (d) { const v = GF.logp(model, d, false, symbols.get(c).f, ALL); if (v !== null) pairs.push([v + ocrDigit(ocr, c, d), c, d]); }); });
        pairs.sort(function (a, b) { return b[0] - a[0]; });
        const usedC = new Set(), usedD = new Set();
        pairs.forEach(function (p) { if (usedC.has(p[1]) || usedD.has(p[2])) return; map.set(p[1], p[2]); usedC.add(p[1]); usedD.add(p[2]); });
    }

    /** marks by their drawn shape, once the search has said "a mark" (the letter model barely tells them apart) */
    function fixMarks(best, symbols) {
        symbols.forEach(function (s, c) {
            const ch = best.map.get(c), m = s.mark;
            if (s.rule) { best.map.set(c, 'ـ'); return; }
            // a glyph read as a letter that mostly sits between two digits is the slash of «۱۳۸۱/۰۵/۱۲»
            if (isLetter(ch) && s.between.length) {
                let d = 0;
                s.between.forEach(function (b) { if (DIGITS.indexOf(best.map.get(b[0])) >= 0 && DIGITS.indexOf(best.map.get(b[1])) >= 0) d += b[2]; });
                if (d >= 3 && d >= 0.6 * s.count) { best.map.set(c, '/'); return; }
            }
            if ((ch === '(' || ch === ')') && s.bow) best.map.set(c, s.bow < 0 ? '(' : ')');
            else if (DIGITS.indexOf(ch) >= 0 && m.colon) best.map.set(c, ':');
            else if (ch && '.،:-ـ'.indexOf(ch) >= 0) {
                if (m.bottom > RAISED) { if (m.parts === 1 && m.flat) best.map.set(c, '-'); }
                else if (ch === 'ـ' || ch === '-') best.map.set(c, 'ـ');          // a baseline bar is a kashida
                else best.map.set(c, m.parts >= 2 ? (m.colon ? ':' : '؛') : m.hH < MARK_SPLIT ? '.' : '،');
            }
        });
    }

    function agreement(symbols, a, b) {
        let ag = 0, t = 0;
        symbols.forEach(function (s, c) { t += s.count; if (a.map.get(c) === b.map.get(c)) ag += s.count; });
        return t ? ag / t : 1;
    }
    const RANK = { read: 2, low: 1, garbled: 0 };

    /** a line's runs of the font's digit glyphs, left to right as drawn (digits run left to right in a Persian line) */
    function tokensOf(line, map) {
        const toks = []; let cur = null;
        line.seq.forEach(function (it) {
            if (!it.gap && it.mine && DIGITS.indexOf(map.get(it.code) || '') >= 0) { if (!cur) { cur = []; toks.push(cur); } cur.push(it.code); } else cur = null;
        });
        return toks;
    }
    function letterCount(line, map) { return line.seq.filter(function (it) { return !it.gap && it.mine && DIGITS.indexOf(map.get(it.code) || '') < 0; }).length; }
    /** a token with a value added to a partial digit map; false (and no change) when it conflicts */
    function tryAdd(phi, inv, codes, value) {
        const s = String(value);
        if (s.length !== codes.length) return false;
        const seen = new Map();
        for (let i = 0; i < codes.length; i++) {
            const c = codes[i], d = +s[i];
            if (phi.has(c) ? phi.get(c) !== d : inv.has(d) && inv.get(d) !== c) return false;
            if (phi.has(c)) continue;
            if (seen.has(c) && seen.get(c) !== d) return false;
            for (const e of seen) if (e[1] === d && e[0] !== c) return false;
            seen.set(c, d);
        }
        seen.forEach(function (d, c) { phi.set(c, d); inv.set(d, c); });
        return true;
    }
    /** page numbers: the top or bottom line of a page holding only the font's digits, counting up page by page */
    function pageAnchor(lines, map, vote) {
        const pages = new Map();
        lines.forEach(function (l) { const a = pages.get(l.page) || []; a.push(l); pages.set(l.page, a); });
        const pageTok = [];
        pages.forEach(function (ls, p) {
            const sorted = ls.slice().sort(function (a, b) { return a.y - b.y; });
            for (const l of [sorted[0], sorted[sorted.length - 1]]) {
                if (!l) continue;
                const t = tokensOf(l, map);
                if (t.length === 1 && t[0].length <= 3 && letterCount(l, map) === 0 && l.seq.every(function (it) { return it.gap || it.mine; })) { pageTok.push({ p: p, codes: t[0] }); break; }
            }
        });
        if (pageTok.length < 3) return;
        const agree = function (phi) { let n = 0; phi.forEach(function (d, c) { if (map.get(c) === DIGITS[d]) n++; }); return n; };
        let best = null;
        // pages usually count from 1: tried first and kept on ties
        [1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, -1, -2, -3].forEach(function (k) {
            const phi = new Map(), inv = new Map(); let ok = 0;
            pageTok.forEach(function (t) { if (t.p + k >= 0 && tryAdd(phi, inv, t.codes, t.p + k)) ok++; });
            const ag = agree(phi);
            if (ok >= 3 && ok >= pageTok.length * 0.7 && (!best || ok > best.ok || (ok === best.ok && ag > best.ag))) best = { ok: ok, phi: phi, ag: ag };
        });
        if (best) vote(best.phi, 5);
    }
    /** numbered items: the glyphs at a line's logical start (its right end), counting up line by line; a bracket, dash
     *  or dot beside the number stays the same down the chain (→ notDigit) */
    function listAnchor(lines, map, symbols, vote, notDigit) {
        const markLike = function (c) { const s = symbols.get(c); return !s || s.mark.markLike; };
        const isDig = function (c) { return DIGITS.indexOf(map.get(c) || '') >= 0; };
        const agree = function (phi) { let n = 0; phi.forEach(function (d, c) { if (map.get(c) === DIGITS[d]) n++; }); return n; };
        const tails = [];
        lines.forEach(function (l) {
            if (!letterCount(l, map)) return;                     // (page numbers and other digit-only lines: no list items)
            let t = l.seq.filter(function (it) { return !it.gap; }).slice(-4);
            const cut = t.map(function (it) { return !it.mine; }).lastIndexOf(true);
            t = t.slice(cut + 1);
            if (t.length) tails.push({ codes: t.map(function (it) { return it.code; }), digEdge: t.slice(-3).some(function (it) { return isDig(it.code); }) });
        });
        const GAP = 4;                                            // (an item may wrap over a few lines)
        const fit = function (t, v, strip, constG) {
            const n = String(v).length + strip;
            if (t.codes.length < n) return null;
            const m = t.codes.slice(-n);
            if (strip) { if ((constG !== null && m[0] !== constG) || !markLike(m[0])) return null; } else if (!t.digEdge) return null;
            const digits = strip ? m.slice(1) : m, g = strip ? m[0] : null, k = constG !== null ? constG : g;
            if (k !== null && digits.indexOf(k) >= 0) return null;
            return { digits: digits, g: g };
        };
        const chains = [];
        for (let i = 0; i < tails.length;) {
            let best = null;
            [0, 1].forEach(function (strip) { [0, 1, 2, 3, 4, 5].forEach(function (start) {
                const phi = new Map(), inv = new Map(); let constG = null, dig = 0, all = 0, checks = 0, items = 0, last = i - 1;
                for (let v = start; ; v++) {
                    let hit = null;
                    for (let k = last + 1; k < tails.length && k <= last + 1 + (items ? GAP : 0); k++) {
                        const f = fit(tails[k], v, strip, constG);
                        if (!f) continue;
                        const seen = f.digits.filter(function (c) { return phi.has(c); }).length;
                        if (!tryAdd(phi, inv, f.digits, v)) continue;
                        hit = { k: k, f: f, seen: seen }; break;
                    }
                    if (!hit) break;
                    if (strip && constG === null) constG = hit.f.g;
                    checks += hit.seen; dig += hit.f.digits.filter(isDig).length; all += hit.f.digits.length; items++; last = hit.k;
                }
                if (items < 3 || dig < 0.6 * all) return;
                if (checks < 2 && !strip && (agree(phi) < 0.75 * phi.size || items < 4)) return;
                const sc = [items, start === 1 ? 1 : 0, agree(phi), strip];
                const q = best ? sc.findIndex(function (x, n) { return x !== best.sc[n]; }) : -1;
                if (!best || (q >= 0 && sc[q] > best.sc[q])) best = { j: last + 1, phi: phi, sc: sc, constG: constG, items: items, checks: checks };
            }); });
            if (best) { chains.push(best); i = best.j; } else i++;
        }
        const conflicts = function (a, b) {
            for (const e of a.phi) if (b.phi.has(e[0]) && b.phi.get(e[0]) !== e[1]) return true;
            const inv = new Map(Array.from(a.phi).map(function (e) { return [e[1], e[0]]; }));
            for (const e of b.phi) if (inv.has(e[1]) && inv.get(e[1]) !== e[0]) return true;
            return false;
        };
        chains.forEach(function (ch) { if (ch.constG !== null) notDigit.set(ch.constG, (notDigit.get(ch.constG) || 0) + ch.items); });
        const kept = chains.filter(function (ch) { return ch.checks >= 2; });
        chains.filter(function (c) { return c.checks < 2; }).sort(function (a, b) { return b.items - a.items; })
            .forEach(function (ch) { if (!kept.some(function (o) { return conflicts(ch, o); })) kept.push(ch); });
        kept.forEach(function (ch) { vote(ch.phi, 2); });
    }
    /** years: four-digit numbers in a Persian text are mostly 13xx or 14xx (14 when the third digit is mostly the zero) */
    function yearAnchor(lines, map, symbols, vote, notDigit) {
        const four = [];
        lines.forEach(function (l) { tokensOf(l, map).forEach(function (t) {
            if (t.length === 4 && !t.some(function (c) { const s = symbols.get(c); return notDigit.has(c) || (s && s.mark.markLike && map.get(c) !== DIGITS[0]); })) four.push(t);
        }); });
        if (four.length < 5) return;
        const top = function (arr, k) { const m = new Map(); arr.forEach(function (t) { m.set(t[k], (m.get(t[k]) || 0) + 1); }); let b = null; m.forEach(function (n, c) { if (!b || n > b[1]) b = [c, n]; }); return b; };
        const a = top(four, 0);
        if (a[1] < 0.6 * four.length) return;
        const yrs = four.filter(function (t) { return t[0] === a[0]; }), b = top(yrs, 1);
        if (b[0] === a[0] || b[1] < 0.6 * yrs.length) return;
        const t3 = yrs.filter(function (t) { return t[1] === b[0]; }), c3 = top(t3, 2);
        vote(new Map([[a[0], 1], [b[0], map.get(c3[0]) === DIGITS[0] && c3[1] >= 0.5 * t3.length ? 4 : 3]]), 3);
    }
    /**
     * Which digit is which, from the document itself (the font-recovery spike's anchors): page numbers (5 votes a digit),
     * numbered lists (2), years (3). lines: [{ page, y, seq: [{ gap } | { mine, code }] }] in drawing order. → Map glyph →
     * digit (with .notDigit: the glyphs beside list numbers), or null
     */
    function anchors(lines, map, symbols) {
        const votes = new Map(), notDigit = new Map();
        const vote = function (phi, w) { phi.forEach(function (d, c) { const v = votes.get(c) || new Map(); v.set(d, (v.get(d) || 0) + w); votes.set(c, v); }); };
        pageAnchor(lines, map, vote);
        listAnchor(lines, map, symbols, vote, notDigit);
        yearAnchor(lines, map, symbols, vote, notDigit);
        if (!votes.size) return null;
        const out = new Map(), taken = new Set();
        Array.from(votes).map(function (e) { let bd = null, bw = 0; e[1].forEach(function (w, d) { if (w > bw) { bw = w; bd = d; } }); return [e[0], bd, bw]; })
            .sort(function (a, b) { return b[2] - a[2]; })
            .forEach(function (x) { if (!taken.has(x[1])) { out.set(x[0], DIGITS[x[1]]); taken.add(x[1]); } });
        notDigit.forEach(function (n, c) { if (!out.has(c)) (out.notDigit = out.notDigit || new Set()).add(c); });
        return out;
    }
    /** digits fixed by the anchors (an anchor a clear OCR reading contradicts dropped, with the one that took that digit);
     *  the glyphs beside list numbers given the likeliest mark; the rest chosen among the digits left, by the outline's top
     *  profile and OCR's votes. best.digitsUncertain: the digit glyphs no anchor reached */
    function applyAnchors(best, symbols, model, anchored) {
        const GF = G(), ALL = Object.keys(GF.FEATS);
        anchored = anchored || new Map();
        const dg = Array.from(best.map.keys()).filter(function (c) { return DIGITS.indexOf(best.map.get(c)) >= 0 && !(anchored.notDigit && anchored.notDigit.has(c)); });
        if (best.ocr) Array.from(anchored).forEach(function (e) {
            const v = best.ocr.get(e[0]);
            if (!v) return;
            let tot = 0, top = null;
            v.forEach(function (k, ch) { tot += k; if (!top || k > top[1]) top = [toFa(ch), k]; });
            if (tot >= 3 && top[1] >= 0.7 * tot && DIGITS.indexOf(top[0]) >= 0 && top[0] !== e[1]) {
                anchored.delete(e[0]);
                Array.from(anchored).forEach(function (x) { if (x[1] === top[0]) anchored.delete(x[0]); });
            }
        });
        const used = new Set(anchored.values()), sure = new Set();
        anchored.forEach(function (d, c) { if (symbols.has(c)) { best.map.set(c, d); sure.add(c); } });
        (anchored.notDigit || []).forEach(function (c) {
            if (DIGITS.indexOf(best.map.get(c)) < 0 || !symbols.has(c)) return;
            let bp = null, bv = -Infinity;
            Array.from(PUNCT).forEach(function (p) { const v = GF.logp(model, p, false, symbols.get(c).f, ALL); if (v !== null && v > bv) { bv = v; bp = p; } });
            if (bp) best.map.set(c, bp);
        });
        if (sure.size || best.ocr) {
            fixMarks(best, symbols);
            const rest = dg.filter(function (c) { return !sure.has(c); }), pairs = [];
            rest.forEach(function (c) { Array.from(DIGITS).forEach(function (d) { if (used.has(d)) return; const v = GF.logp(model, d, false, symbols.get(c).f, ALL); if (v !== null) pairs.push([v + ocrDigit(best.ocr, c, d), c, d]); }); });
            pairs.sort(function (a, b) { return b[0] - a[0]; });
            const doneC = new Set();
            pairs.forEach(function (x) { if (doneC.has(x[1]) || used.has(x[2])) return; best.map.set(x[1], x[2]); doneC.add(x[1]); used.add(x[2]); });
        }
        best.digitsUncertain = new Set(dg.filter(function (c) { return !sure.has(c) && !(best.ocr && best.ocr.has(c)); }));
        return best;
    }

    async function run1(o) {
        const runs = [];
        for (let s = 1; s <= 3; s++) {
            runs.push(await solve(Object.assign({}, o, { seed: s * 7919 })));
            if (s === 2 && agreement(o.symbols, runs[0], runs[1]) >= 0.98) break;       // a third only when they disagree
        }
        runs.sort(function (a, b) { return b.score - a.score; });
        const best = runs[0];
        best.agreement = runs.slice(1).reduce(function (a, r) { return a + agreement(o.symbols, best, r); }, 0) / Math.max(1, runs.length - 1);
        best.verdict = best.perGlyph >= READ.fit && best.agreement >= READ.agree ? 'read' : best.perGlyph >= LOW.fit && best.agreement >= LOW.agree ? 'low' : 'garbled';
        if (o.hollow && best.verdict === 'read') best.verdict = 'low';        // its dots and counters are not to be trusted
        best.hollow = !!o.hollow;
        best.ocr = o.ocr || null;
        fixMarks(best, o.symbols);
        applyAnchors(best, o.symbols, o.model, o.lines ? anchors(o.lines, best.map, o.symbols) : null);
        return best;
    }

    /** a short font leans on the lexicon, which can also pull it toward wrong words: read both ways, the lexicon's
     *  reading kept unless the plain one earns a better verdict */
    async function run(o) {
        const uses = Array.from(o.symbols.values()).reduce(function (a, s) { return a + s.count; }, 0);
        const a = await run1(o);
        if (!o.lexicon || uses >= 1000) return a;
        const b = await run1(Object.assign({}, o, { lexicon: null }));
        return RANK[b.verdict] > RANK[a.verdict] ? b : a;
    }

    /** subsets of one font, by the outlines they share: each group read once, with all its text */
    function pool(entries) {
        const sets = entries.map(function (e) { return new Set(Object.keys(e.usage.counts.size ? e.hs : {}).filter(function (k) { return e.usage.counts.has(+k); }).map(function (k) { return e.hs[k]; })); });
        const parent = entries.map(function (_, i) { return i; });
        const find = function (i) { return parent[i] === i ? i : (parent[i] = find(parent[i])); };
        const byHash = new Map();
        sets.forEach(function (s, i) { s.forEach(function (h) { if (!byHash.has(h)) byHash.set(h, []); byHash.get(h).push(i); }); });
        for (let i = 0; i < entries.length; i++) {
            const shared = new Map();
            sets[i].forEach(function (h) { byHash.get(h).forEach(function (j) { if (j > i) shared.set(j, (shared.get(j) || 0) + 1); }); });
            shared.forEach(function (n, j) { if (n >= MIN_SHARED && n >= MIN_SHARE * Math.min(sets[i].size, sets[j].size)) parent[find(j)] = find(i); });
        }
        const groups = new Map();
        entries.forEach(function (e, i) { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(e); });
        return Array.from(groups.values()).map(function (ms) {
            // a pooled glyph: one number per outline; a glyph with no outline keeps a number of its own
            const ids = new Map(), rep = [];
            const key = function (id, k) {
                const e = ms.find(function (m) { return m.id === id; }), h = e && e.hs[k] !== undefined ? 'h' + e.hs[k] : 'g' + id + ':' + k;
                if (!ids.has(h)) { ids.set(h, rep.length); rep.push([id, k]); }
                return ids.get(h);
            };
            const counts = new Map(), seqs = [];
            ms.forEach(function (m) {
                m.usage.counts.forEach(function (n, k) { const p = key(m.id, k); counts.set(p, (counts.get(p) || 0) + n); });
                m.usage.seqs.forEach(function (s) { seqs.push(s.map(function (k) { return k === null ? null : key(m.id, k); })); });
            });
            return { ids: ms.map(function (m) { return m.id; }), usage: { counts: counts, seqs: seqs }, key: key, rep: function (p) { return rep[p]; } };
        });
    }

    /** how well a reading's words fit Persian: the mean log-probability per letter of the font's letter runs
     *  (textOf(glyph id) → its text, or nothing) */
    function fit(usage, textOf, L) {
        let lp = 0, n = 0;
        usage.seqs.forEach(function (seq) {
            let run = '';
            const flush = function () { if (run.length > 1) { lp += L.wordLp(run); n += run.length; } run = ''; };
            seq.slice().reverse().forEach(function (c) {
                const t = c === null ? null : textOf(c);
                if (!t) { flush(); return; }
                const x = norm(t).replace(/ـ/g, '');
                if (x && Array.from(x).every(isLetter)) run += x; else flush();
            });
            flush();
        });
        return n ? lp / n : -Infinity;
    }

    function joinShare(f, usage) {
        const GF = G(), cx = GF.context(f, Array.from(usage.counts.keys()));
        let fwd = 0, all = 0;
        usage.counts.forEach(function (n, c) { const e = GF.features(f, c, cx); if (e.blank) return; all += n; if (e.left) fwd += n; });
        return all ? fwd / all : 0;
    }

    const api = { lm: lm, prepare: prepare, run: run, pool: pool, joinShare: joinShare, fit: fit, anchors: anchors, norm: norm, isLetter: isLetter, DIGITS: DIGITS };
    if (PdfImporter) PdfImporter._decipher = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
