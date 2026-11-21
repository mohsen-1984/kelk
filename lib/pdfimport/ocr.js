/**
 * PdfImporter — OCR, line by line (lib/pdfimport/ocr.js)
 * ============================================================================
 * Persian text read off a page that is one picture (Kelk 3.4). Tesseract reads it, through its WebAssembly core
 * (vendor/tesseract/, tesseract.js-core 7.0.0, its SIMD-LSTM build) and the `fas` model of tessdata_best. Tesseract's
 * own page layout drops lines of a Persian page; ours finds the lines and Tesseract reads each on its own as one raw
 * line (page segmentation mode 13). Measured on 24 scan pages of our own text: 0.78 % of the letters and 3.6 % of the
 * words wrong, about 2.4 s a page.
 *
 *   PdfImporter._ocr.gray(rgba, w, h)      RGBA pixels (a canvas' ImageData) → one byte a pixel, 0 black
 *   PdfImporter._ocr.otsu(gray)            the gray level that splits ink from paper (Otsu's method)
 *   PdfImporter._ocr.page(gray, w, h)      → { w, h, clean, boxes }: the page with its frames and rules taken out
 *                                          (clean, gray), and its text lines top to bottom, each { y0, y1, x0, x1, size } in
 *                                          pixels (size: the height of the middle 80 % of its ink)
 *   PdfImporter._ocr.postCorrect(text, vocab)  marks Tesseract confuses with the Persian comma; «ة» where only «ه»
 *                                          makes a known word (vocab: a Set of words, lib/pdfimport/lm-fa.js)
 *   PdfImporter._ocr.known(text, vocab)    → { words, known }: its words as tools/build-lm.js counts them, and how many
 *                                          the language model knows (a page's confidence: ladder.js _ladOcrPage)
 *   PdfImporter._ocr.engine({ core, model, lang })  → a reader: line(pg, i) → { text, conf } — the line i of a page()
 *                                          read (conf 0–1, Tesseract's), end() — its memory given back. core: the
 *                                          core's factory (TesseractCore), model: the .traineddata bytes
 *   PdfImporter._ocr.model(base64)         a model script's text (vendor/tesseract/fas-best.js) → its bytes
 *
 * The importer calls it a line at a time (ladder.js _ladOcrPass): its progress and its Cancel are checked between
 * lines. Loaded on demand with the core, the model and the language model (ladder.js _ladOcrLoad), never at startup.
 * Pure but for the engine; under Node too (tests/unit/ocr.test.js).
 */
(function (global) {
    'use strict';
    const PdfImporter = global.PdfImporter || (typeof require === 'function' ? require('../PdfImporter.js') : null);
    const V = 1;
    // the line finder (measured on the spike's pages, HANDOFF §8): a rule is a run of ink this long; a row is ink when
    // it has this share of the width; runs under this share of the usual line's height are dots and marks, joined to
    // the line they belong to when this close; a line is padded by this share of its height; its size is the height
    // between these shares of its ink, counted down the line; a line's ink is at least, and at most, these shares of the
    // page's height
    const K = Object.freeze({
        ruleMinPx: 40, ruleW: 1 / 12, ruleH: 1 / 25, ruleSlack: 1, rowMinPx: 2, rowShare: 0.002,
        bigShare: 0.5, smallShare: 0.45, joinShare: 0.35, minShare: 0.3, padShare: 0.25, sizeLo: 0.1, sizeHi: 0.9, lineMinPage: 1 / 300, lineMaxPage: 1 / 6
    });

    function gray(rgba, w, h) {
        const g = new Uint8Array(w * h);
        for (let i = 0, j = 0; i < g.length; i++, j += 4) {
            // (a transparent pixel is paper)
            const a = rgba[j + 3] / 255;
            g[i] = Math.round(255 - a * (255 - (0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2])));
        }
        return g;
    }

    function otsu(px) {
        const hist = new Float64Array(256);
        for (let i = 0; i < px.length; i++) hist[px[i]]++;
        const n = px.length;
        let sum = 0;
        for (let t = 0; t < 256; t++) sum += t * hist[t];
        let sumB = 0, wB = 0, best = 0, th = 128;
        for (let t = 0; t < 256; t++) {
            wB += hist[t];
            if (!wB) continue;
            const wF = n - wB;
            if (!wF) break;
            sumB += t * hist[t];
            const mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
            if (v > best) { best = v; th = t; }
        }
        return th;
    }

    /** the ink (1 = ink) and the gray page, frames and table rules taken out: long runs of ink, across or down */
    function withoutRules(px, w, h) {
        const th = otsu(px), ink = new Uint8Array(w * h);
        for (let i = 0; i < ink.length; i++) ink[i] = px[i] <= th ? 1 : 0;
        const rule = new Uint8Array(w * h);
        const minH = Math.max(K.ruleMinPx, (w * K.ruleW) | 0), minV = Math.max(K.ruleMinPx, (h * K.ruleH) | 0);
        // (a run is measured on the ink of three rows — three columns for a vertical rule —, so a rule scanned a little
        // askew, which steps from row to row, is still one run; its ink in those rows is the rule)
        const S = K.ruleSlack;
        const across = function (y, x) { for (let d = -S; d <= S; d++) { const yy = y + d; if (yy >= 0 && yy < h && ink[yy * w + x]) return true; } return false; };
        const down = function (x, y) { for (let d = -S; d <= S; d++) { const xx = x + d; if (xx >= 0 && xx < w && ink[y * w + xx]) return true; } return false; };
        for (let y = 0; y < h; y++) {
            let x = 0;
            while (x < w) {
                if (!across(y, x)) { x++; continue; }
                let e = x;
                while (e < w && across(y, e)) e++;
                if (e - x >= minH) for (let k = x; k < e; k++) for (let d = -S; d <= S; d++) { const yy = y + d; if (yy >= 0 && yy < h && ink[yy * w + k]) rule[yy * w + k] = 1; }
                x = e;
            }
        }
        for (let x = 0; x < w; x++) {
            let y = 0;
            while (y < h) {
                if (!down(x, y)) { y++; continue; }
                let e = y;
                while (e < h && down(x, e)) e++;
                if (e - y >= minV) for (let k = y; k < e; k++) for (let d = -S; d <= S; d++) { const xx = x + d; if (xx >= 0 && xx < w && ink[k * w + xx]) rule[k * w + xx] = 1; }
                y = e;
            }
        }
        const clean = new Uint8Array(px);
        // (a rule's pixel and its eight neighbours go white: its blurred edges with it)
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (!rule[y * w + x]) continue;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const yy = y + dy, xx = x + dx;
                if (yy >= 0 && yy < h && xx >= 0 && xx < w) { ink[yy * w + xx] = 0; clean[yy * w + xx] = 255; }
            }
        }
        return { ink: ink, clean: clean };
    }

    function page(px, w, h) {
        const r = withoutRules(px, w, h), ink = r.ink;
        const rows = new Int32Array(h);
        for (let y = 0; y < h; y++) { let s = 0; for (let x = 0; x < w; x++) s += ink[y * w + x]; rows[y] = s; }
        const lim = Math.max(K.rowMinPx, K.rowShare * w);
        const runs = [];
        for (let y = 0; y < h;) {
            if (rows[y] <= lim) { y++; continue; }
            let e = y;
            while (e < h && rows[e] > lim) e++;
            runs.push([y, e]);
            y = e;
        }
        const out = { w: w, h: h, clean: r.clean, boxes: [] };
        if (!runs.length) return out;
        const hs = runs.map(function (a) { return a[1] - a[0]; }).sort(function (a, b) { return a - b; }), med = hs[hs.length >> 1];
        const big = hs.filter(function (v) { return v >= K.bigShare * med; }), typical = big.length ? big[big.length >> 1] : med;
        // (the dots under and over a line are runs of their own: joined to the line they are close to)
        const merged = [];
        runs.forEach(function (a) {
            const last = merged[merged.length - 1];
            if (last && (a[1] - a[0] < K.smallShare * typical || last[1] - last[0] < K.smallShare * typical) && a[0] - last[1] < K.joinShare * typical) last[1] = a[1];
            else merged.push([a[0], a[1]]);
        });
        const pad = Math.round(K.padShare * typical);
        // (a run no line of type can be — a few pixels high: a rule's remnant, a speck's row; a sixth of the page or more: a
        // picture — is none: Tesseract spent up to 100 s reading a one-pixel row of a real scan as a line)
        const shortest = h * K.lineMinPage, tallest = h * K.lineMaxPage;
        merged.forEach(function (a) {
            if (a[1] - a[0] < K.minShare * typical || a[1] - a[0] < shortest || a[1] - a[0] > tallest) return;
            let x0 = w, x1 = -1;
            for (let y = a[0]; y < a[1]; y++) for (let x = 0; x < w; x++) if (ink[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
            if (x1 < 0) return;
            // (its size: the rows holding the middle 80 % of its ink — a box grows with its dots, tails and padding, a
            // heading's letters with its type)
            let tot = 0, n = 0, lo = -1, hi = -1;
            for (let y = a[0]; y < a[1]; y++) tot += rows[y];
            for (let y = a[0]; y < a[1]; y++) { n += rows[y]; if (lo < 0 && n >= K.sizeLo * tot) lo = y; if (hi < 0 && n >= K.sizeHi * tot) hi = y; }
            out.boxes.push({ y0: Math.max(0, a[0] - pad), y1: Math.min(h, a[1] + pad), x0: Math.max(0, x0 - pad), x1: Math.min(w, x1 + pad), size: Math.max(1, hi - lo) });
        });
        return out;
    }

    const P = '؀-ۿ';
    const AFTER_LETTER = new RegExp('([' + P + ']),', 'g');
    const WORD = new RegExp('[' + P + ']+', 'g');
    const EZAFE = /^(.+?)(ةٌ|هٌ|ٌ|ة)$/;
    function postCorrect(text, vocab) {
        return String(text).split('\n').map(function (line) {
            line = line.replace(AFTER_LETTER, '$1،');
            // (a hamza after a joining letter, ending a word: the comma)
            line = line.replace(/([بپتثجچحخدذرزژسشصضطظعغفقکگلمنهی])ء(?=\s|$)/g, '$1،');
            if (line.indexOf('«') < 0) line = line.replace(/»/g, '،');
            if (vocab) line = line.replace(WORD, function (wd) {
                // («هٔ», a word's ezafe, read «ة», «ةٌ», «هٌ», or «ٌ» after the word with its «ه» lost: the hamza seen as
                // dots or as tanwin — every such ending on the lab's scans, 9 of 9 —, where the word with «ه» is known)
                const ez = EZAFE.exec(wd);
                if (ez && vocab.has(ez[1] + 'ه')) return ez[1] + 'ه\u0654';
                if (wd.indexOf('ة') >= 0 && !vocab.has(wd) && vocab.has(wd.replace(/ة/g, 'ه'))) return wd.replace(/ة/g, 'ه');
                // (a hamza after alef or vav that makes no known word, «هاء»: the comma again)
                if (/[اوآ]ء$/.test(wd) && !vocab.has(wd) && vocab.has(wd.slice(0, -1))) return wd.slice(0, -1) + '،';
                return wd;
            });
            return line;
        }).join('\n');
    }

    // (the words as tools/build-lm.js counts them: NFKC, ی and ک, no short vowels, ؤ إ أ as و ا, runs of ء–ی)
    const lmWords = function (s) {
        return String(s).normalize('NFKC').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[\u064B-\u0652]/g, '')
            .replace(/ؤ/g, 'و').replace(/[إأ]/g, 'ا').split(/[^\u0621-\u06CC]+/).filter(Boolean);
    };
    function known(text, vocab) {
        const ws = lmWords(text);
        return { words: ws.length, known: vocab ? ws.filter(function (w) { return vocab.has(w); }).length : 0 };
    }

    function model(b64) {
        if (typeof atob !== 'function') return new Uint8Array(global.Buffer.from(b64, 'base64'));
        const s = atob(b64), u = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
        return u;
    }

    async function engine(o) {
        const lang = o.lang || 'fas';
        // (Tesseract's messages — the resolution it guesses for each line — are not the user's)
        const T = await o.core({ print: function () {}, printErr: function () {} });
        T.FS.mkdir('/td');
        T.FS.writeFile('/td/' + lang + '.traineddata', o.model);
        let api = new T.TessBaseAPI();
        if (api.Init('/td', lang) !== 0) throw new Error('Tesseract could not load its ' + lang + ' model');
        api.SetPageSegMode(13);              // PSM_RAW_LINE: the box is one line, read as it is
        return {
            line: function (pg, i) {
                const b = pg.boxes[i], cw = b.x1 - b.x0, ch = b.y1 - b.y0;
                const head = 'P5\n' + cw + ' ' + ch + '\n255\n', buf = new Uint8Array(head.length + cw * ch);
                for (let k = 0; k < head.length; k++) buf[k] = head.charCodeAt(k);
                for (let y = 0; y < ch; y++) buf.set(pg.clean.subarray((b.y0 + y) * pg.w + b.x0, (b.y0 + y) * pg.w + b.x1), head.length + y * cw);
                T.FS.writeFile('/input', buf);
                api.SetImageFile(1, 0);
                const text = String(api.GetUTF8Text() || '').replace(/\s+$/, '');
                const conf = Math.max(0, Math.min(100, api.MeanTextConf())) / 100;
                return { text: text, conf: conf };
            },
            end: function () {
                if (!api) return;
                try { api.End(); api.delete(); } catch (e) { /* gone with the core */ }
                api = null;
            }
        };
    }

    PdfImporter._ocr = { V: V, K: K, gray: gray, otsu: otsu, page: page, postCorrect: postCorrect, known: known, engine: engine, model: model };
    if (typeof module !== 'undefined' && module.exports) module.exports = PdfImporter._ocr;
})(typeof window !== 'undefined' ? window : globalThis);
