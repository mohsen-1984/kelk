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
 * their drawn shape once the search has said "a mark". Which digit a digit glyph is: the outline's top profile only
 * (the document's own counting is the next step).
 *
 *   PdfImporter._decipher.lm(data)                lm-fa.js's counts → { wordLp(word), freq, norm } (built once)
 *   PdfImporter._decipher.prepare(f, usage, M)    f: glyphfeat.font; usage: { counts: Map key → uses, seqs: [[key | null]]
 *                                                 a line each, in drawing order, null a break } → { symbols, words, hollow }
 *   PdfImporter._decipher.run(o)                  async: o { symbols, words, lm, model, lexicon, tick } → { map: Map key →
 *                                                 text, verdict, perGlyph, agreement, hollow }
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
                mark: { parts: f.path(c).filter(function (k) { return k.c === 'M'; }).length, bottom: e.bottom, hH: h, flat: (e.top - e.bottom) < 0.6 * e.w, colon: colonLike(f, c) } });
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
        digitsByProfile(map, symbols, model);
        return { map: map, score: best, perGlyph: best / Math.max(1, words.reduce(function (a, w) { return a + w.n * w.codes.length; }, 0)) };
    }

    /** which digit each digit glyph is: the outline's top profile, among the digit glyphs only (each digit drawn once);
     *  these features help digits and hurt letters on fonts the model never saw, so letters never see them */
    function digitsByProfile(map, symbols, model) {
        const GF = G(), ALL = Object.keys(GF.FEATS), dg = Array.from(map.keys()).filter(function (c) { return DIGITS.indexOf(map.get(c)) >= 0; });
        const pairs = [];
        dg.forEach(function (c) { Array.from(DIGITS).forEach(function (d) { const v = GF.logp(model, d, false, symbols.get(c).f, ALL); if (v !== null) pairs.push([v, c, d]); }); });
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
        fixMarks(best, o.symbols);
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

    const api = { lm: lm, prepare: prepare, run: run, pool: pool, joinShare: joinShare, fit: fit, norm: norm, isLetter: isLetter, DIGITS: DIGITS };
    if (PdfImporter) PdfImporter._decipher = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
