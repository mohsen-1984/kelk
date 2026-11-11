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
 *
 *   KelkSlideCheck.show(res, onAnyway)   (in the page) the report panel says why the Slides view did not open
 *       (Kelk.ui.report.custom): the findings, «Make slides anyway» (onAnyway), «Copy the prompt» and Copy report (2.8).
 *   KelkSlideCheck.incoming()            (in the page) after a paste or an import in the Slides view: a text plainly not
 *       in slide format switches the view to the document, with the same report (a toast instead when an import's
 *       report is on screen). Editing never switches the view.
 *   KelkSlideCheck.beforeExport(anyway)  (in the page) before a PPTX export: true when the text fits; else the same
 *       report, with «Export anyway» (anyway), and false.
 *   KelkSlideCheck.STRINGS               its words (sc_*), fa / en / ar: added to Kelk.i18n's tables when it loads,
 *       so the page's startup carries none of them (tools/check-i18n.js reads them from here).
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

    const STRINGS = {
        fa: {
            sc_title: 'متن در قالب اسلاید نیست',
            sc_brief: 'نمای سند ماند؛ متن قالب اسلاید ندارد',
            sc_summary: 'کِلک در نمای سند ماند: این متن قالب اسلاید ندارد. در این قالب هر عنوان ## یک اسلاید است و زیر آن متن کوتاهی می‌آید.',
            sc_noSlides: 'هیچ عنوان ## ندارد؛ هر اسلاید با یک عنوان ## آغاز می‌شود.',
            sc_oneSlide: 'فقط یک اسلاید دارد، با {0} کلمه؛ این اندازه متن در یک اسلاید جا نمی‌شود.',
            sc_longSlides: '{0} اسلاید از {1} بیش از 250 کلمه دارد؛ متنی به این درازی در اسلاید جا نمی‌شود.',
            sc_longIntro: 'پیش از نخستین عنوان ## متنی {0} کلمه‌ای آمده است.',
            sc_prompt: 'متنی که با پرامپت اسلاید (تنظیمات ← اسلایدها) آماده شود اسلایدهای قابل‌قبولی می‌دهد. می‌توانید همین متن را هم اسلاید کنید.',
            sc_anyway: 'با این حال اسلاید بساز',
            sc_switched: 'کِلک به نمای سند رفت: متنی که آمد قالب اسلاید ندارد. در این قالب هر عنوان ## یک اسلاید است و زیر آن متن کوتاهی می‌آید.',
            sc_switchedBrief: 'به نمای سند رفت؛ متن قالب اسلاید ندارد',
            sc_export: 'این متن دیگر قالب اسلاید ندارد. در این قالب هر عنوان ## یک اسلاید است و زیر آن متن کوتاهی می‌آید.',
            sc_exportBrief: 'متن دیگر قالب اسلاید ندارد',
            sc_exportAnyway: 'با این حال PPTX بگیر',
        },
        en: {
            sc_title: 'Not in slide format',
            sc_brief: 'stayed in the document view; the text is not in slide format',
            sc_summary: 'Kelk stayed in the document view: this text is not in slide format. In that format each ## heading is a slide, with a short text under it.',
            sc_noSlides: 'It has no ## heading; each slide starts at a ## heading.',
            sc_oneSlide: 'It has one slide, of {0} words; that much text does not fit a slide.',
            sc_longSlides: '{0} of {1} slides have more than 250 words; text that long does not fit a slide.',
            sc_longIntro: 'Before the first ## heading there are {0} words of text.',
            sc_prompt: 'A text prepared with the slide prompt (Settings → Slides) gives acceptable slides. You can also make slides of this text as it is.',
            sc_anyway: 'Make slides anyway',
            sc_switched: 'Kelk switched to the document view: the text that came in is not in slide format. In that format each ## heading is a slide, with a short text under it.',
            sc_switchedBrief: 'switched to the document view; the text is not in slide format',
            sc_export: 'This text is no longer in slide format. In that format each ## heading is a slide, with a short text under it.',
            sc_exportBrief: 'the text is no longer in slide format',
            sc_exportAnyway: 'Export PPTX anyway',
        },
        ar: {
            sc_title: 'النص ليس بتنسيق الشرائح',
            sc_brief: 'بقي عرض المستند؛ النص ليس بتنسيق الشرائح',
            sc_summary: 'بقي كِلك في عرض المستند: هذا النص ليس بتنسيق الشرائح. في هذا التنسيق كل عنوان ## شريحة، وتحته نص قصير.',
            sc_noSlides: 'لا يحتوي على أي عنوان ##؛ تبدأ كل شريحة بعنوان ##.',
            sc_oneSlide: 'فيه شريحة واحدة من {0} كلمة؛ هذا القدر من النص لا يتسع في شريحة.',
            sc_longSlides: 'في {0} من {1} شرائح أكثر من 250 كلمة؛ نص بهذا الطول لا يتسع في شريحة.',
            sc_longIntro: 'قبل أول عنوان ## نص من {0} كلمة.',
            sc_prompt: 'النص المُعدّ بموجّه الشرائح (الإعدادات ← الشرائح) يعطي شرائح مقبولة. ويمكنك أيضًا إنشاء شرائح من هذا النص كما هو.',
            sc_anyway: 'أنشئ الشرائح مع ذلك',
            sc_switched: 'انتقل كِلك إلى عرض المستند: النص الوارد ليس بتنسيق الشرائح. في هذا التنسيق كل عنوان ## شريحة، وتحته نص قصير.',
            sc_switchedBrief: 'انتقل إلى عرض المستند؛ النص ليس بتنسيق الشرائح',
            sc_export: 'لم يعد هذا النص بتنسيق الشرائح. في هذا التنسيق كل عنوان ## شريحة، وتحته نص قصير.',
            sc_exportBrief: 'لم يعد النص بتنسيق الشرائح',
            sc_exportAnyway: 'صدّر PPTX مع ذلك',
        }
    };
    /** the findings' keys, each written in full */
    const KEYS = { noSlides: 'sc_noSlides', oneSlide: 'sc_oneSlide', longSlides: 'sc_longSlides', longIntro: 'sc_longIntro' };

    /**
     * The report. mode: '' (the switch to Slides did not happen), 'switched' (a paste or an import switched to the
     * document view), 'export' (a PPTX export: its button exports anyway).
     */
    function show(res, onAnyway, mode) {
        const K = root.Kelk, t = function () { return K.i18n.t.apply(K.i18n, arguments); };
        const W = { '': ['sc_summary', 'sc_brief', 'sc_anyway', 'presentation'], switched: ['sc_switched', 'sc_switchedBrief', 'sc_anyway', 'presentation'],
            export: ['sc_export', 'sc_exportBrief', 'sc_exportAnyway', 'download'] }[mode || ''];
        const add = function (box, tag, cls, txt) {
            const e = box.appendChild(document.createElement(tag));
            e.className = cls;
            if (txt != null) e.textContent = txt;
            return e;
        };
        return K.ui.report.custom({
            icon: 'presentation',
            title: function () { return t('sc_title'); },
            brief: function () { return t(W[1]); },
            // Copy report (2.8, as every report panel): the same as Markdown
            copy: function () {
                return ['## ' + t('sc_title'), '', t(W[0]), '', '**' + t('rep_findingsHead') + '**', '']
                    .concat(res.findings.map(function (f) { return '- ' + t(KEYS[f.code], f.n, f.of); }), ['', t('sc_prompt')])
                    .join('\n') + '\n';
            },
            body: function (box) {
                add(box, 'p', 'report-summary', t(W[0]));
                const ul = add(box, 'ul', 'report-findings');
                res.findings.forEach(function (f) {
                    add(ul, 'li', f.fail ? 'warn' : 'info', t(KEYS[f.code], f.n, f.of)).setAttribute('data-code', f.code);
                });
                add(box, 'p', 'report-summary', t('sc_prompt'));
            },
            buttons: [
                { icon: W[3], label: function () { return t(W[2]); }, run: function () { K.ui.report.close(false); onAnyway(); } },
                { icon: 'copy', label: function () { return t('slidesPrompt'); }, run: function () { const b = K.$('#btn-slides-prompt'); if (b) b.click(); } }
            ]
        });
    }

    /** The text on screen, unless it is empty or one of the samples (written for their view). */
    async function screenText(K) {
        const md = K.editor.value();
        if (!md.trim() || (K.samples && await K.samples.of(md))) return null;
        return md;
    }

    async function incoming() {
        const K = root.Kelk;
        if (!K.slides.active()) return;
        const md = await screenText(K);
        const res = md == null ? null : check(md);
        if (!res || res.ok || !K.slides.active()) return;
        const box = K.$('#import-report'), other = box && !box.hidden && !K.ui.report.isCustom();
        await K.slides.setView('document');
        if (other) { K.ui.toast(K.i18n.t('sc_switchedBrief'), 'warn'); return; }     // an import's report stays
        show(res, function () { K.slides.setView('slides', true); }, 'switched');
    }

    async function beforeExport(anyway) {
        const md = await screenText(root.Kelk);
        const res = md == null ? null : check(md);
        if (!res || res.ok) return true;
        show(res, anyway, 'export');
        return false;
    }

    // in the page: its words join Kelk.i18n's tables
    if (root.Kelk && root.Kelk.i18n && root.Kelk.i18n._strings) {
        const all = root.Kelk.i18n._strings;
        Object.keys(STRINGS).forEach(function (l) { if (all[l]) Object.assign(all[l], STRINGS[l]); });
    }

    const api = { check: check, show: show, incoming: incoming, beforeExport: beforeExport, LIMIT: LIMIT, STRINGS: STRINGS };
    root.KelkSlideCheck = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
