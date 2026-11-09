/**
 * The slide-format check (Kelk.config.libs.slidecheck: loaded on the first switch to the Slides view).
 *
 *   KelkSlideCheck.check(markdown) → { ok, slides, words, findings: [{ code, n?, of? }] }
 *
 * Does the text broadly follow the slide convention of the PowerPoint prompt (scripts/slides.js prompt,
 * lib/SLIDES.md §1): a ## heading starts each slide, the content under it is short? Lenient on purpose — only a
 * text that is plainly a document fails: no ## heading at all, one slide holding a long text, most slides far
 * longer than a slide holds, or a long text before the first slide. A failing finding has `fail: true`; the others
 * are notes. Words are counted outside fenced code, front matter, HTML comments, link targets and table rules.
 */
(function (root) {
    'use strict';

    const LIMIT = {
        slideWords: 250,     // a slide's content longer than this does not fit a slide (the prompt: 6 short items)
        longShare: 0.5,      // more than this share of the slides that long: a document
        oneSlideWords: 300,  // a single ## slide with more words than this under it: a document
        introWords: 300      // words before the first ## (after the first #'s subtitle lines): a document's opening
    };

    function words(s) {
        const t = s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')            // a link's text, not its target
            .replace(/^\s*\|?\s*:?-{3,}.*$/gm, ' ')                     // a table's rule row
            .replace(/[#>*_`|~\-:[\]()!]/g, ' ');
        const m = t.match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}‌‍'’.-]*/gu);
        return m ? m.length : 0;
    }

    function check(md) {
        let s = String(md || '').replace(/\r\n?/g, '\n');
        s = s.replace(/^---\n[\s\S]*?\n---\n/, '');                     // front matter
        s = s.replace(/<!--[\s\S]*?-->/g, ' ');                          // layout and chart comments
        const parts = [];                                                // [{ level, words }]: the text under each heading
        let cur = { level: 0, words: 0, title: true };
        let seenH1 = false, fence = null;                                // fenced code: no prose, no headings
        s.split('\n').forEach(function (line) {
            const f = /^ {0,3}(`{3,}|~{3,})/.exec(line);
            if (fence) { if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !line.trim().slice(f[1].length).trim()) fence = null; return; }
            if (f) { fence = f[1]; return; }
            const h = /^ {0,3}(#{1,6})\s+\S/.exec(line);
            if (h && h[1].length <= 2) {
                parts.push(cur);
                cur = { level: h[1].length, words: 0, first: h[1].length === 1 && !seenH1 };
                if (h[1].length === 1) seenH1 = true;
                return;
            }
            cur.words += words(line);
        });
        parts.push(cur);
        const slides = parts.filter(function (p) { return p.level === 2; });
        const firstSlide = parts.findIndex(function (p) { return p.level === 2; });
        // before the first ## : the text with no heading, and under a later # (a section); the first #'s subtitle
        // lines are the title slide's
        const intro = (firstSlide < 0 ? parts : parts.slice(0, firstSlide)).reduce(function (n, p) { return n + (p.first ? Math.max(0, p.words - 60) : p.words); }, 0);
        const total = parts.reduce(function (n, p) { return n + p.words; }, 0);
        const long = slides.filter(function (p) { return p.words > LIMIT.slideWords; }).length;
        const findings = [];
        if (!slides.length) findings.push({ code: 'noSlides', fail: true });
        else if (slides.length === 1 && slides[0].words > LIMIT.oneSlideWords) findings.push({ code: 'oneSlide', n: slides[0].words, fail: true });
        else if (long) findings.push({ code: 'longSlides', n: long, of: slides.length, fail: slides.length > 1 && long / slides.length > LIMIT.longShare });
        if (slides.length && intro > LIMIT.introWords) findings.push({ code: 'longIntro', n: intro, fail: true });
        return {
            ok: !findings.some(function (f) { return f.fail; }),
            slides: slides.length, words: total, findings: findings
        };
    }

    const api = { check: check, LIMIT: LIMIT };
    root.KelkSlideCheck = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
