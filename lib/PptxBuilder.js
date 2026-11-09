/**
 * PptxBuilder - Markdown slides → editable PowerPoint (.pptx), in the browser
 * ============================================================================
 * Version: 1.0
 *
 * A Kelk builder like the others: the same configure() surface (BuilderBase),
 * the same HTML input (marked's output, MathCore placeholders), BidiCore's
 * direction rules and ImageCore's images — and a slide convention on top of
 * plain GitHub Flavored Markdown (lib/SLIDES.md):
 *
 *   # Title            the title slide (the first H1); later H1s: section / closing slides
 *   ## Slide title     a new slide (no --- needed between slides)
 *   <!-- … -->         speaker notes
 *   <!-- layout: timeline vertical highlight=4 -->   a directive (layout, slide, chart, diagram)
 *   > [!NOTE] …        a callout (GitHub alerts)
 *   - **Lead** — text  a lead item: cards, steps, stats, timeline, diagrams build on it
 *   - :crown: **Lead** an icon (Lucide name) — or an emoji — before the lead
 *
 * Every slide is laid out ONCE into a model of positioned shapes (inches on a
 * 10 × 5.625 or 10 × 7.5 slide); the preview (renderPreview) and the .pptx
 * (toBlob) are two renderings of that one model, so what the preview shows is
 * what PowerPoint opens. Text, shapes, tables and charts stay editable:
 * diagrams are native shapes, charts native charts (Edit Data in Excel),
 * titles sit in real title placeholders (outline view, accessibility).
 *
 *   const html = PptxBuilder.markdownToHtml(md);           // front matter + marked + comments kept
 *   const blob = await PptxBuilder.create()
 *       .configure({ fonts: { bidi: 'Vazirmatn', latin: 'Calibri' },
 *                    slides: { theme: 'kelk', aspect: '16:9' } })
 *       .addFromHtml(html.html).setDeck(html.meta)
 *       .toBlob();
 *
 * Needs: PptxGenJS 4 (global PptxGenJS, with JSZip), BuilderBase + BidiCore;
 * ImageCore (pictures, icons), MathCore (formulas as pictures) when present.
 * A DOM is needed (browser): text is measured on a canvas.
 */
(function (global) {
    'use strict';

    const req = function (name, path) {
        if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
            try { return require(path); } catch (e) { return undefined; }
        }
        return global[name];
    };
    const BidiCore = req('BidiCore', './BidiCore.js');
    const BuilderBase = req('BuilderBase', './BuilderBase.js');
    const ImageCore = req('ImageCore', './ImageCore.js');
    const MathCore = req('MathCore', './MathCore.js');

    class PptxBuilderError extends Error {
        constructor(message) { super(message); this.name = 'PptxBuilderError'; }
    }

    // =========================================================================
    // Constants
    // =========================================================================

    const VERSION = '1.0';
    const INSET = 0.08;           // text frame inset (in)
    const LH = 1.6;               // line height the layout measures with (Vazirmatn ≈ 1.56)
    const FIT = 0.95;             // a text box is full at this share of its height (PowerPoint's own spacing)

    /**
     * Themes: the colors of a deck. primary — accents, tiles, header rows; accent — the second
     * color; dark — the title and section slides; bg — the content slides (tech-dark: dark);
     * ink / muted — text; soft — panels; line — rules. decoration: 'steps' (a small stepped
     * pyramid), 'bar' (an accent bar) or 'none'. Text on a fill is white or near black by its
     * luminance (onFill).
     */
    const THEMES = Object.freeze({
        'modern-emerald': { primary: '1F6F5C', accent: 'C07030', dark: '17322B', ink: '22302C', muted: '6B7A75', soft: 'F1F6F4', line: 'D3E1DC', bg: 'FFFFFF', decoration: 'bar' },
        'scholarly-blue': { primary: '1F4E79', accent: 'B5862E', dark: '172A3F', ink: '1E2A36', muted: '66727F', soft: 'F3F5F8', line: 'D8DEE6', bg: 'FFFFFF', decoration: 'steps' },
        'corporate-blue': { primary: '1A56DB', accent: '0E9F9E', dark: '0B1F44', ink: '1F2937', muted: '6B7280', soft: 'F2F6FD', line: 'D6E2F5', bg: 'FFFFFF', decoration: 'bar' },
        'tech-dark':      { primary: '38BDF8', accent: 'A78BFA', dark: '020617', ink: 'E2E8F0', muted: '94A3B8', soft: '1E293B', line: '334155', bg: '0F172A', decoration: 'bar' },
        'tech-warm':      { primary: 'C2410C', accent: '0F766E', dark: '1C1917', ink: '292524', muted: '78716C', soft: 'F5EEE4', line: 'E7DCCD', bg: 'FFFBF5', decoration: 'bar' },
        'minimal-mono':   { primary: '2F3640', accent: 'E4572E', dark: '1F2329', ink: '22262B', muted: '737A83', soft: 'F3F4F5', line: 'DCDFE3', bg: 'FFFFFF', decoration: 'none' },
        'ocean-teal':     { primary: '0E6E7A', accent: 'E9A23B', dark: '0B2E33', ink: '1B2B2E', muted: '5E7377', soft: 'EEF6F7', line: 'CFE3E5', bg: 'FFFFFF', decoration: 'bar' },
        'sunset-coral':   { primary: 'C8414F', accent: 'E9A23B', dark: '3A1F2B', ink: '2E2226', muted: '7D6B70', soft: 'FBF1F2', line: 'F0D9DC', bg: 'FFFFFF', decoration: 'bar' },
        'forest-green':   { primary: '2D6A4F', accent: 'B08968', dark: '1B3A2D', ink: '1F2A24', muted: '6B7A70', soft: 'F1F5F2', line: 'D5E2DA', bg: 'FFFFFF', decoration: 'steps' },
        'royal-purple':   { primary: '5B21B6', accent: 'F59E0B', dark: '2E1065', ink: '241B33', muted: '726A80', soft: 'F5F2FB', line: 'E2DAF2', bg: 'FFFFFF', decoration: 'bar' }
    });
    /** Names of 1.0's first themes, still read (front matter, stored settings). */
    const THEME_ALIAS = Object.freeze({ kelk: 'modern-emerald', pasargad: 'scholarly-blue', ocean: 'ocean-teal', graphite: 'minimal-mono' });
    const themeName = function (n) { n = String(n || '').toLowerCase(); return THEMES[n] ? n : THEME_ALIAS[n] || null; };

    const ALERTS = Object.freeze({
        NOTE: { color: '1F6FB5', glyph: 'i' }, TIP: { color: '2F7D4F', glyph: '?' }, IMPORTANT: { color: '6B4FA0', glyph: '!' },
        WARNING: { color: 'B5862E', glyph: '!' }, CAUTION: { color: 'B23A3A', glyph: '×' }
    });

    const LAYOUTS = ['bullets', 'statement', 'cards', 'stats', 'timeline', 'steps', 'columns', 'quote', 'image', 'agenda',
        'process', 'cycle', 'pyramid', 'funnel', 'hierarchy', 'matrix', 'venn', 'table', 'chart'];
    const LAYOUT_ALIAS = { 'two-column': 'columns', 'three-column': 'columns', 'image-side': 'image', org: 'hierarchy', tree: 'hierarchy',
        'org-chart': 'hierarchy', flow: 'process', chevrons: 'process', grid: 'matrix', toc: 'agenda', 'big-number': 'stats', features: 'bullets' };
    const CHARTS = ['bar', 'column', 'line', 'area', 'pie', 'doughnut', 'radar', 'scatter'];
    const DIRECTIVES = ['layout', 'slide', 'chart', 'diagram'];

    /** Default configuration (merged under BuilderBase's shared defaults). */
    const DEFAULTS = Object.freeze({
        slides: {
            theme: 'modern-emerald',  // THEMES key (old names: THEME_ALIAS)
            primary: null,            // '#RRGGBB' overrides the theme's primary / accent
            accent: null,
            titleStyle: 'dark',       // title and section slides: 'dark' | 'light'
            aspect: '16:9',           // '16:9' | '4:3'
            size: 'medium',           // body text: 'small' | 'medium' | 'large'
            minScale: 0.7,            // text shrinks to this share of its size before a warning
            numbers: true,            // slide numbers
            footer: null,             // footer text; null → the deck's title; '' → none
            notes: true,              // speaker notes into the file
            autoLayout: true,         // pick layouts from the content (directives always win)
            timeline: 'auto',         // 'auto' | 'horizontal' | 'vertical'
            split: true,              // a long list or table continues on the next slide
            maxBullets: 7,            // … beyond this many lines
            maxRows: 8,               // … beyond this many table rows
            sectionNumbers: true,     // 01, 02 … on section slides
            decoration: 'auto',       // title marks: 'auto' (the theme's) | 'steps' | 'bar' | 'none'
            bullet: '•',              // the list bullet (BULLETS: • ○ ▪ ❖ ➢ ✓ ❑ –), or its name
            logo: 'all',              // the deck's logo (front matter logo:, or slides.logoSrc): 'all' slides | 'cover' | 'none'
            logoSrc: null,            // a logo when the deck names none (Kelk: the document's logo)
            sections: true,           // PowerPoint sections: one for each # (the slide sorter and the outline group by them)
            codeLanguage: true,       // a code block's language over it (python, js …); codeBlock.fallbackLabel when it has none
            labels: null              // { continued, image, agenda, part, presenter } — null: by the deck's language
        }
    });

    /** Bullets by name (front matter, settings) — the character, and the one of the second level. */
    const BULLETS = Object.freeze({
        disc: ['•', '–'], circle: ['○', '–'], square: ['▪', '–'], diamond: ['❖', '•'], arrow: ['➢', '•'],
        check: ['✓', '•'], box: ['❑', '•'], dash: ['–', '•']
    });
    const bulletOf = function (v) {
        v = String(v || '').trim();
        if (BULLETS[v.toLowerCase()]) return BULLETS[v.toLowerCase()];
        const k = Object.keys(BULLETS).find(function (n) { return BULLETS[n][0] === v; });
        return k ? BULLETS[k] : (v && Array.from(v).length === 1 ? [v, '–'] : BULLETS.disc);
    };

    const LABELS = Object.freeze({
        rtl: { continued: '(ادامه)', image: 'جای تصویر', agenda: 'فهرست', part: 'بخش', presenter: 'ارائه‌دهنده', intro: 'آغاز' },
        ar: { continued: '(تابع)', image: 'مكان الصورة', agenda: 'المحتويات', part: 'القسم', presenter: 'المقدِّم', intro: 'البداية' },
        ltr: { continued: '(continued)', image: 'Image', agenda: 'Agenda', part: 'Part', presenter: 'Presenter', intro: 'Opening' }
    });

    const SIZES = Object.freeze({ small: 0.88, medium: 1, large: 1.12 });

    /** highlight.js classes (GitHub theme) → run colors, so code stays colored and editable. */
    const HLJS = Object.freeze({
        keyword: 'D73A49', 'built_in': '005CC5', type: 'D73A49', literal: '005CC5', number: '005CC5', operator: 'D73A49',
        string: '032F62', regexp: '032F62', symbol: '005CC5', title: '6F42C1', 'title.function': '6F42C1', 'title.class': '6F42C1',
        params: '24292E', comment: '6A737D', doctag: 'D73A49', meta: '005CC5', 'meta-keyword': 'D73A49', attr: '005CC5',
        attribute: '005CC5', variable: 'E36209', 'template-variable': 'E36209', name: '22863A', tag: '22863A',
        'selector-tag': '22863A', 'selector-class': '6F42C1', 'selector-id': '6F42C1', property: '005CC5', section: '005CC5',
        bullet: 'E36209', addition: '22863A', deletion: 'B31D28', subst: '24292E', quote: '22863A', link: '032F62'
    });

    // =========================================================================
    // Small helpers
    // =========================================================================

    const r3 = function (v) { return Math.round(v * 1000) / 1000; };
    const r1 = function (v) { return Math.round(v * 10) / 10; };
    const clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
    const esc = function (s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
    };
    /** '#1f6f5c' | '1F6F5C' | 'abc' → 'RRGGBB' (null when not a color). */
    function hex(c) {
        let t = String(c == null ? '' : c).trim().replace(/^#/, '');
        if (/^[0-9a-f]{3}$/i.test(t)) t = t.replace(/(.)/g, '$1$1');
        return /^[0-9a-f]{6}$/i.test(t) ? t.toUpperCase() : null;
    }
    function mix(c, to, a) {
        const n = parseInt(c, 16), m = parseInt(to, 16);
        const ch = function (s) { return Math.round(((n >> s) & 255) * (1 - a) + ((m >> s) & 255) * a); };
        return ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0').toUpperCase();
    }
    const tint = function (c, a) { return mix(c, 'FFFFFF', a); };     // toward white
    const shade = function (c, a) { return mix(c, '000000', a); };    // toward black
    let CT = null;                    // the theme of the deck being laid out (layout is synchronous)
    /** Text on a fill: white on a dark fill, near black on a light one. */
    const onFill = function (c) { return isDark(c) ? 'FFFFFF' : '111827'; };
    /** A color washed toward the slide's background (a = share of the background). */
    const wash = function (c, a) { return mix(c, CT ? CT.bg : 'FFFFFF', a); };
    const isDark = function (c) { return BuilderBase && BuilderBase.isDarkColor ? BuilderBase.isDarkColor('#' + c) : parseInt(c, 16) < 0x808080; };
    const digitsAscii = function (s) {
        return String(s).replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
            .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); });
    };
    const hasRtl = function (t) { return BidiCore ? BidiCore.hasRtlLetter(t) : /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(t); };
    const hasLatin = function (t) { return BidiCore ? BidiCore.hasLatin(t) : /[A-Za-z]/.test(t); };
    const runsText = function (runs) { return (runs || []).map(function (r) { return r.t; }).join(''); };
    /** A paragraph's own direction: BidiCore's rule; no letters → the deck's. */
    function textDir(t, deck) {
        if (BidiCore) { if (BidiCore.isRtlText(t)) return 'rtl'; if (BidiCore.isLtrText(t)) return 'ltr'; return deck; }
        return hasRtl(t) ? 'rtl' : hasLatin(t) ? 'ltr' : deck;
    }
    /** Language tag of a piece of text (PowerPoint's proofing and font choice). */
    function langOf(t, fallback) {
        if (/[א-ת]/.test(t)) return 'he-IL';
        if (/[پچژگکیکی]/.test(t)) return 'fa-IR';
        if (/[؀-ۿ]/.test(t)) return /[پچژگ]/.test(t) ? 'fa-IR' : (fallback && /^fa/.test(fallback) ? 'fa-IR' : 'ar-SA');
        return 'en-US';
    }
    /**
     * Split a run's text into script pieces, so that each takes its own font and
     * language — the way PowerPoint decides direction and digit shapes:
     *   R  right-to-left letters → the bidi font, the text's language (fa-IR, ar-SA, he-IL)
     *   L  left-to-right letters, and digits after them (GPT-3, Windows 11) → the Latin font, en-US
     *   D  other digits (with . , : / between them) → en-US, so they stay ASCII digits
     * Neutrals (spaces, punctuation, «», brackets, dashes) between two letters of one kind
     * join them ("Edit Data", "text-to-image"); elsewhere they take the paragraph's side
     * (R in a right-to-left paragraph). A neutral in an en-US run is laid out left to
     * right by PowerPoint, so «Edit Data» and (Histories) would break apart otherwise.
     */
    function scriptClasses(t, rtlPara) {
        const ch = Array.from(String(t));
        const cls = ch.map(function (c) {
            if (hasRtl(c) || c === '\u200C') return 'R';
            if (hasLatin(c)) return 'L';
            return /[0-9\u0660-\u0669\u06F0-\u06F9]/.test(c) ? 'D' : 'N';
        });
        for (let i = 1; i < ch.length - 1; i++) {
            if (cls[i] === 'N' && /[.,:\/\u066B\u066C]/.test(ch[i]) && cls[i - 1] === 'D' && cls[i + 1] === 'D') cls[i] = 'D';
        }
        // digits after Latin letters are Latin (UBA W7); the others count as right to left for the
        // neutrals around them (N1) — unless nothing strong comes before them in a left-to-right paragraph
        const base = rtlPara ? 'R' : 'L';
        let strong = null;
        const side = [];
        for (let i = 0; i < cls.length; i++) {
            if (cls[i] === 'L' || cls[i] === 'R') strong = cls[i];
            else if (cls[i] === 'D') { if (strong === 'L') cls[i] = 'L'; else side[i] = strong || base; }
        }
        const sideOf = function (i) { return cls[i] === 'D' ? side[i] : cls[i]; };
        for (let i = 0; i < cls.length;) {
            if (cls[i] !== 'N') { i++; continue; }
            let j = i;
            while (j < cls.length && cls[j] === 'N') j++;
            const a = i > 0 ? sideOf(i - 1) : null, b = j < cls.length ? sideOf(j) : null;
            const k = a && a === b ? a : base;
            for (let m = i; m < j; m++) cls[m] = k;
            i = j;
        }
        return { ch: ch, cls: cls };
    }
    const pieceOf = function (t, k) { return { t: t, rtl: k === 'R' ? true : k === 'L' ? false : null, digit: k === 'D' }; };
    function scriptPieces(t, rtlPara) {
        const c = scriptClasses(t, rtlPara);
        const out = [];
        c.ch.forEach(function (x, i) {
            const last = out[out.length - 1];
            if (last && last.k === c.cls[i]) last.t += x; else out.push({ t: x, k: c.cls[i] });
        });
        return out.length ? out.map(function (p) { return pieceOf(p.t, p.k); }) : [{ t: String(t), rtl: null }];
    }
    /**
     * The pieces of a paragraph's runs: the classes are decided over the whole paragraph (a neutral at
     * the end of a bold run sees the letters of the next run), then cut at the run edges.
     * runs: [{ t, keep }] — keep: one piece as it is (code in a left-to-right paragraph).
     * → per run, its pieces.
     */
    function paraPieces(runs, rtlPara) {
        const c = scriptClasses(runs.map(function (r) { return r.t; }).join(''), rtlPara);
        let at = 0;
        return runs.map(function (r) {
            const n = Array.from(r.t).length, ch = c.ch.slice(at, at + n), cls = c.cls.slice(at, at + n);
            at += n;
            if (r.keep || !n) return [{ t: r.t, rtl: null }];
            const out = [];
            ch.forEach(function (x, i) {
                const last = out[out.length - 1];
                if (last && last.k === cls[i]) last.t += x; else out.push({ t: x, k: cls[i] });
            });
            return out.map(function (p) { return pieceOf(p.t, p.k); });
        });
    }
    /** "a=1 b c='x y'" → { a: '1', b: true, c: 'x y', _: ['b'] } (bare words also in _). */
    function parseArgs(s) {
        const o = { _: [] };
        const re = /([\w-]+)\s*=\s*("([^"]*)"|'([^']*)'|[^\s]+)|"([^"]*)"|([^\s]+)/g;
        let m;
        while ((m = re.exec(s || ''))) {
            if (m[1]) o[m[1].toLowerCase()] = m[3] != null ? m[3] : m[4] != null ? m[4] : m[2];
            else { const w = (m[5] != null ? m[5] : m[6]).toLowerCase(); o._.push(w); o[w] = true; }
        }
        return o;
    }
    /** Edit distance ≤ 2 (a misspelled directive should warn, not become a note). */
    function near(a, b) {
        if (Math.abs(a.length - b.length) > 2) return false;
        const d = [];
        for (let i = 0; i <= a.length; i++) { d[i] = [i]; for (let j = 1; j <= b.length; j++) d[i][j] = i ? Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) : j; }
        return d[a.length][b.length] <= 2;
    }
    /** A number in a table cell ("1,234", "۳۵٪", "-2.5") → Number (NaN when none). */
    function cellNumber(t) {
        const s = digitsAscii(t).replace(/[٫]/g, '.').replace(/[,٬\s%٪]/g, '').replace(/[^\d.+\-eE]/g, '');
        return s === '' ? NaN : Number(s);
    }

    // =========================================================================
    // 1. Markdown → HTML: front matter, comments kept as markers
    // =========================================================================

    /**
     * Optional YAML-like front matter at the very top:
     *   ---
     *   title: …   footer: …   dir: rtl   theme: scholarly-blue   aspect: 4:3   author: …   date: …
     *   ---
     * Flat "key: value" lines only. Returns { meta, body }.
     */
    function frontMatter(md) {
        const src = String(md == null ? '' : md).replace(/\r\n?/g, '\n');
        const m = /^﻿?---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(src);
        if (!m) return { meta: {}, body: src };
        const meta = {};
        m[1].split('\n').forEach(function (line) {
            const kv = /^\s*([\w-]+)\s*:\s*(.*?)\s*$/.exec(line);
            if (kv) meta[kv[1].toLowerCase()] = kv[2].replace(/^(["'])(.*)\1$/, '$2');
        });
        return { meta: meta, body: src.slice(m[0].length) };
    }

    /**
     * HTML comments → <span data-kelk-comment="…"> markers, so they survive a
     * sanitizer (DOMPurify drops comments). Comments inside code are already
     * escaped by marked and stay text.
     */
    function protectComments(html) {
        return String(html || '').replace(/<!--([\s\S]*?)-->/g, function (m, x) {
            return '<span data-kelk-comment="' + encodeURIComponent(x) + '"></span>';
        });
    }

    /**
     * Markdown → { html, meta } for addFromHtml / setDeck: front matter read,
     * marked (global, or o.marked) with GFM, comments protected.
     * o.breaks: a single new line is a line break (default true, as Kelk).
     */
    function markdownToHtml(md, o) {
        o = o || {};
        const mk = o.marked || global.marked;
        if (!mk) throw new PptxBuilderError('markdownToHtml needs marked');
        const fm = frontMatter(md);
        const html = mk.parse(fm.body, { gfm: true, breaks: o.breaks !== false });
        return { html: protectComments(html), meta: fm.meta };
    }

    // =========================================================================
    // 2. HTML → deck (slides of blocks)
    // =========================================================================

    const ICON_RE = /^\s*:([a-z0-9]+(?:-[a-z0-9]+)*):\s*/;
    const EMOJI_RE = /^\s*((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍(?:\p{Extended_Pictographic})|\p{Regional_Indicator}|[\u{1F3FB}-\u{1F3FF}])*)\s*/u;

    function newSlide(kind, title) {
        return { kind: kind, title: title || [], blocks: [], notes: [], layout: null, opts: { _: [] }, style: {}, warn: [], nodes: [] };
    }

    /** A comment: a directive (layout / slide / chart / diagram) or speaker notes. */
    function takeComment(text, slide) {
        const t = String(text || '').trim();
        if (!t) return;
        const m = /^([a-z][a-z-]{0,15})\s*:\s*([^\n]*)$/i.exec(t);
        if (m) {
            const key = m[1].toLowerCase(), args = parseArgs(m[2]);
            if (key === 'layout' || key === 'diagram') {
                const orig = (args._[0] || '').toLowerCase(), name = LAYOUT_ALIAS[orig] || orig;
                if (LAYOUTS.indexOf(name) >= 0) {
                    args._.shift(); delete args[orig];
                    if (orig === 'three-column' && !args.cols) args.cols = '3';
                    slide.layout = name; slide.opts = args;
                } else slide.warn.push({ code: 'layout', arg: orig || m[2].trim() });
                return;
            }
            if (key === 'slide') { slide.style = Object.assign(slide.style, args); return; }
            if (key === 'chart') {
                const type = (args._[0] || 'column').toLowerCase();
                if (CHARTS.indexOf(type) < 0) { slide.warn.push({ code: 'chart-type', arg: type }); return; }
                args.type = type; slide.pendingChart = args; return;
            }
            if (/^[a-z]+$/.test(key) && DIRECTIVES.some(function (d) { return near(key, d); })) {
                slide.warn.push({ code: 'directive', arg: key }); return;
            }
        }
        slide.notes.push(t);
    }

    function commentText(el) {
        try { return decodeURIComponent(el.getAttribute('data-kelk-comment') || ''); } catch (e) { return el.getAttribute('data-kelk-comment') || ''; }
    }

    /** hljs class list → a run color. */
    function hljsColor(cls) {
        const names = String(cls || '').split(/\s+/);
        let key = '';
        names.forEach(function (n) {
            if (/^hljs-/.test(n)) key = n.slice(5);
            else if (key && /_$/.test(n)) key = key + '.' + n.slice(0, -1);
        });
        return key ? (HLJS[key] || HLJS[key.split('.')[0]] || null) : null;
    }

    /** Inline content of an element → runs { t, b, i, s, u, code, link, sup, sub, hl, color, math }. */
    function runsOf(el, slide, st, out) {
        st = st || {}; out = out || [];
        Array.prototype.forEach.call(el.childNodes, function (n) {
            if (n.nodeType === 3) { out.push(Object.assign({}, st, { t: n.nodeValue })); return; }
            if (n.nodeType === 8) { takeComment(n.nodeValue, slide); return; }
            if (n.nodeType !== 1) return;
            if (n.hasAttribute('data-kelk-comment')) { takeComment(commentText(n), slide); return; }
            const tag = n.tagName;
            if (tag === 'UL' || tag === 'OL' || tag === 'TABLE' || tag === 'PRE') return;
            const add = function (o) { runsOf(n, slide, Object.assign({}, st, o), out); };
            switch (tag) {
                case 'STRONG': case 'B': add({ b: true }); break;
                case 'EM': case 'I': case 'CITE': add({ i: true }); break;
                case 'DEL': case 'S': case 'STRIKE': add({ s: true }); break;
                case 'U': case 'INS': add({ u: true }); break;
                case 'CODE': case 'KBD': case 'SAMP': add({ code: true }); break;
                case 'A': add({ link: n.getAttribute('href') || '' }); break;
                case 'SUP': add({ sup: true }); break;
                case 'SUB': add({ sub: true }); break;
                case 'MARK': add({ hl: true }); break;
                case 'BR': out.push(Object.assign({}, st, { t: '\n' })); break;
                case 'P': case 'DIV':
                    if (out.length && runsText(out).trim()) out.push(Object.assign({}, st, { t: ' ' }));
                    add({}); break;
                case 'IMG': {
                    if (n.classList.contains('kelk-math-img') && n.getAttribute('data-omml')) {     // an inline equation
                        out.push(Object.assign({}, st, { t: '\u2063', eq: { omml: n.getAttribute('data-omml'), tex: n.getAttribute('alt') || '', src: n.getAttribute('src') || '',
                            w: parseFloat(n.getAttribute('width')) || 20, h: parseFloat(n.getAttribute('height')) || 16, depth: parseFloat(n.getAttribute('data-depth')) || 0, base: mathBase } }));
                        break;
                    }
                    const alt = n.getAttribute('alt') || '';
                    if (alt) out.push(Object.assign({}, st, { t: alt }));
                    break;
                }
                case 'INPUT':
                    if ((n.getAttribute('type') || '').toLowerCase() === 'checkbox') out.push(Object.assign({}, st, { t: n.hasAttribute('checked') ? '☑ ' : '☐ ' }));
                    break;
                case 'SPAN': {
                    if (n.classList.contains('kelk-tex')) { out.push(Object.assign({}, st, { t: n.textContent, math: true, i: true })); break; }
                    const c = hljsColor(n.className);
                    add(c ? { color: c } : {});
                    break;
                }
                default: add({});
            }
        });
        return out;
    }

    const sameStyle = function (a, b) {
        return a.b === b.b && a.i === b.i && a.s === b.s && a.u === b.u && a.code === b.code && a.link === b.link &&
            a.sup === b.sup && a.sub === b.sub && a.hl === b.hl && a.color === b.color && a.math === b.math && !a.eq && !b.eq;
    };
    /** Spaces as a browser shows them; '\n' runs are line breaks; same-style runs merged. */
    function clean(runs, keepSpaces) {
        const out = [];
        runs.forEach(function (r0) {
            const r = Object.assign({}, r0);
            if (r.t !== '\n' && !keepSpaces) r.t = r.t.replace(/[ \t\r\n]+/g, ' ');
            if (!r.t) return;
            const last = out[out.length - 1];
            if (last && last.t !== '\n' && r.t !== '\n' && sameStyle(last, r)) last.t += r.t; else out.push(r);
        });
        if (keepSpaces) return out;
        // no spaces at the edges of the paragraph or of its lines
        for (let i = 0; i < out.length; i++) {
            const prevBreak = i === 0 || out[i - 1].t === '\n', nextBreak = i === out.length - 1 || out[i + 1].t === '\n';
            if (out[i].t === '\n') continue;
            if (prevBreak) out[i].t = out[i].t.replace(/^\s+/, '');
            if (nextBreak) out[i].t = out[i].t.replace(/\s+$/, '');
        }
        const res = out.filter(function (r) { return r.t; });
        while (res.length && res[0].t === '\n') res.shift();
        while (res.length && res[res.length - 1].t === '\n') res.pop();
        return res;
    }

    /** "**Lead** — detail" → { icon, lead, detail }; an icon (:name: or an emoji) may come first. */
    function splitLead(runs) {
        let rs = runs.map(function (r) { return Object.assign({}, r); });
        let icon = null;
        if (rs.length && !rs[0].code) {
            const m = ICON_RE.exec(rs[0].t), e = !m && EMOJI_RE.exec(rs[0].t);
            if (m) { icon = { name: m[1] }; rs[0].t = rs[0].t.slice(m[0].length); }
            else if (e) { icon = { emoji: e[1] }; rs[0].t = rs[0].t.slice(e[0].length); }
            if (!rs[0].t) rs.shift();
        }
        let i = 0;
        while (i < rs.length && rs[i].b && !rs[i].code && rs[i].t !== '\n') i++;
        if (i === 0) return { icon: icon, lead: null, detail: null, runs: rs };
        const lead = clean(rs.slice(0, i).map(function (r) { const c = Object.assign({}, r); delete c.b; return c; }));
        const rest = rs.slice(i);
        if (rest.length) {
            const s = /^\s*(?:—|–|-|:|：|\|)\s*/.exec(rest[0].t);
            if (s) rest[0].t = rest[0].t.slice(s[0].length);
            else if (rest[0].t === '\n') rest.shift();
        }
        if (lead.length) lead[lead.length - 1].t = lead[lead.length - 1].t.replace(/\s*[:：]\s*$/, '');
        return { icon: icon, lead: lead, detail: clean(rest), runs: rs };
    }

    function listOf(el, slide) {
        const items = [];
        Array.prototype.forEach.call(el.children, function (li) {
            if (li.tagName !== 'LI') return;
            if (Array.prototype.some.call(li.children, function (c) { return c.tagName === 'PRE' || c.tagName === 'TABLE'; })) slide.warn.push({ code: 'list-block' });
            const runs = clean(runsOf(li, slide));
            const sub = Array.prototype.find.call(li.children, function (c) { return c.tagName === 'UL' || c.tagName === 'OL'; });
            const sp = splitLead(runs);
            items.push({ runs: sp.runs, icon: sp.icon, lead: sp.lead, detail: sp.detail, children: sub ? listOf(sub, slide) : null });
        });
        return { type: 'list', ordered: el.tagName === 'OL', start: parseInt(el.getAttribute('start'), 10) || 1, items: items };
    }

    function cellAlign(c) {
        const a = (c.getAttribute('align') || (c.style && c.style.textAlign) || '').toLowerCase();
        return a === 'center' ? 'center' : a === 'right' ? 'right' : a === 'left' ? 'left' : '';
    }
    function tableOf(el, slide) {
        const rows = Array.prototype.slice.call(el.querySelectorAll('tr'));
        if (!rows.length) return null;
        const cells = function (tr) { return Array.prototype.filter.call(tr.children, function (c) { return /^T[HD]$/.test(c.tagName); }); };
        const head = cells(rows[0]);
        return {
            type: 'table',
            header: head.map(function (c) { return clean(runsOf(c, slide)); }),
            align: head.map(cellAlign),
            rows: rows.slice(1).map(function (tr) { return cells(tr).map(function (c) { return clean(runsOf(c, slide)); }); })
        };
    }

    function codeOf(pre, slide) {
        const code = pre.querySelector('code') || pre;
        const m = /(?:^|\s)language-([\w+#.-]+)/.exec(code.className || '');
        return { type: 'code', lang: BidiCore && BidiCore.codeLanguage ? BidiCore.codeLanguage(pre) : (m ? m[1] : ''), runs: clean(runsOf(code, slide), true) };
    }

    /** Block elements → blocks (para, h3, list, table, chart, quote, alert, code, image, math). */
    function blocksOf(nodes, slide) {
        const out = [];
        const push = function (b) {
            if (!b) return;
            if (slide.pendingChart && b.type === 'table') {
                b = { type: 'chart', chart: slide.pendingChart, table: b };
                slide.pendingChart = null;
            }
            out.push(b);
        };
        nodes.forEach(function (n) {
            if (n.nodeType === 8) { takeComment(n.nodeValue, slide); return; }
            if (n.nodeType === 3) {
                const t = n.nodeValue.trim();
                if (t) push({ type: 'para', runs: clean([{ t: t }]) });
                return;
            }
            if (n.nodeType !== 1) return;
            if (n.hasAttribute('data-kelk-comment')) { takeComment(commentText(n), slide); return; }
            const tag = n.tagName;
            if (tag === 'P') {
                const imgs = n.querySelectorAll('img');
                const rest = n.cloneNode(true);
                Array.prototype.forEach.call(rest.querySelectorAll('img, br, [data-kelk-comment]'), function (x) { x.remove(); });
                Array.prototype.forEach.call(n.querySelectorAll('[data-kelk-comment]'), function (x) { takeComment(commentText(x), slide); });
                if (imgs.length && !rest.textContent.trim()) {
                    Array.prototype.forEach.call(imgs, function (img) {
                        const math = img.classList.contains('kelk-math-img');
                        push({ type: math ? 'math' : 'image', src: img.getAttribute('src') || '', alt: img.getAttribute('alt') || '',
                               w: parseFloat(img.getAttribute('width')) || 0, h: parseFloat(img.getAttribute('height')) || 0,
                               omml: math ? img.getAttribute('data-omml') || null : null });
                    });
                    return;
                }
                const runs = clean(runsOf(n, { notes: [], warn: [], pendingChart: null }));
                if (runs.length) push({ type: 'para', runs: runs });
                return;
            }
            if (/^H[1-6]$/.test(tag)) { push({ type: 'h3', level: +tag[1], runs: clean(runsOf(n, slide)) }); return; }
            if (tag === 'UL' || tag === 'OL') { push(listOf(n, slide)); return; }
            if (tag === 'TABLE') { push(tableOf(n, slide)); return; }
            if (tag === 'PRE') { push(codeOf(n, slide)); return; }
            if (tag === 'IMG') { push({ type: 'image', src: n.getAttribute('src') || '', alt: n.getAttribute('alt') || '' }); return; }
            if (tag === 'HR') return;
            if (tag === 'BLOCKQUOTE') {
                const box = n.cloneNode(true);
                const m = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i.exec(box.textContent);
                if (m) {
                    // drop the marker from the first text node that has it
                    const walker = box.ownerDocument.createTreeWalker(box, 4);
                    let t;
                    while ((t = walker.nextNode())) {
                        const i = t.nodeValue.indexOf('[!');
                        if (i >= 0) { t.nodeValue = t.nodeValue.slice(0, i) + t.nodeValue.slice(i).replace(/^\[![A-Za-z]+\]\s*/, ''); break; }
                    }
                    const first = box.querySelector('p');
                    if (first && first.firstChild && first.firstChild.nodeName === 'BR') first.firstChild.remove();
                    push({ type: 'alert', kind: m[1].toUpperCase(), blocks: blocksOf(Array.prototype.slice.call(box.childNodes), slide) });
                } else push({ type: 'quote', blocks: blocksOf(Array.prototype.slice.call(box.childNodes), slide) });
                return;
            }
            if (tag === 'SPAN' && !n.textContent.trim()) return;
            if (/^(DIV|SECTION|ARTICLE|FIGURE|DETAILS|DL)$/.test(tag) && n.children.length) {
                blocksOf(Array.prototype.slice.call(n.childNodes), slide).forEach(push);
                return;
            }
            const runs = clean(runsOf(n, slide));
            if (runs.length) push({ type: 'para', runs: runs });
        });
        return out;
    }

    /**
     * The deck: slides from H1 / H2, their blocks, notes and directives.
     * meta: the front matter (title, footer, dir, theme, aspect, author, date …).
     */
    function parseDeck(root, meta) {
        const slides = [];
        let cur = null, seenTitle = false;
        const pending = newSlide('content');         // comments before the first heading go to the first slide
        const begin = function (kind, title) {
            cur = newSlide(kind, title);
            if (!slides.length) {
                cur.notes = pending.notes.slice(); cur.warn = pending.warn.slice();
                if (pending.layout) { cur.layout = pending.layout; cur.opts = pending.opts; }
                cur.style = Object.assign({}, pending.style);
                cur.pendingChart = pending.pendingChart;
            }
            slides.push(cur);
        };
        Array.prototype.forEach.call(root.childNodes, function (n) {
            const isComment = n.nodeType === 8 || (n.nodeType === 1 && n.hasAttribute('data-kelk-comment'));
            if (n.nodeType === 1 && (n.tagName === 'H1' || n.tagName === 'H2')) {
                const tmp = newSlide('content');
                const title = clean(runsOf(n, tmp));
                if (n.tagName === 'H1') { begin(seenTitle ? 'section' : 'title', title); seenTitle = true; }
                else begin('content', title);
                cur.notes = cur.notes.concat(tmp.notes); cur.warn = cur.warn.concat(tmp.warn);
                return;
            }
            if (!cur) {
                if (isComment) { takeComment(n.nodeType === 8 ? n.nodeValue : commentText(n), pending); return; }
                if (n.nodeType === 3 && !n.nodeValue.trim()) return;
                if (n.nodeType === 1 && n.tagName === 'HR') return;
                begin('content', []);
            }
            cur.nodes.push(n);
        });
        if (!slides.length && (pending.notes.length || pending.layout)) slides.push(Object.assign(pending, { kind: 'content' }));
        slides.forEach(function (s) {
            s.blocks = blocksOf(s.nodes, s);
            delete s.nodes;
            if (s.pendingChart) { s.warn.push({ code: 'chart-table' }); s.pendingChart = null; }
        });
        return { meta: meta || {}, slides: slides };
    }

    // =========================================================================
    // 3. Measuring text
    // =========================================================================

    let mathBase = 24;            // pt the formulas' pictures are drawn at (MathCore.toImages)
    let measureCtx = null;
    let measureFamily = 'Vazirmatn, Tahoma, sans-serif';
    /** Width (pt) of a string at a size (pt), on a canvas in the measuring font. */
    function textWidthPt(text, sizePt, bold, mono) {
        if (typeof document !== 'undefined') {
            measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
            measureCtx.font = (bold ? '700 ' : '400 ') + sizePt + 'px ' + (mono ? 'Consolas, "Courier New", monospace' : measureFamily);
            return measureCtx.measureText(text).width * 1.02;      // a little room: PowerPoint's own spacing and kerning
        }
        return text.length * sizePt * 0.52;
    }
    const bulletIndent = function (p) { return Math.round(p.size * 1.15); };
    /** Lines of a paragraph in a width (in): greedy word wrap, '\n' runs break. */
    function paraLines(p, w) {
        const indent = p.bullet ? (p.level + 1) * bulletIndent(p) : 0;
        const avail = Math.max(0.25, w - 2 * INSET - indent / 72) * 72;
        let lines = 1, x = 0;
        p.runs.forEach(function (r) {
            if (r.t === '\n') { lines++; x = 0; return; }
            const size = r.sup || r.sub ? p.size * 0.7 : p.size;
            if (r.eq) {                                         // an equation: its picture's width at this size
                const wpt = r.eq.w * 0.75 * size / r.eq.base;
                if (x + wpt > avail && x > 0) { lines++; x = 0; }
                x += wpt; return;
            }
            r.t.split(/(\s+)/).forEach(function (part) {
                if (!part) return;
                if (/\n/.test(part)) { lines += (part.match(/\n/g) || []).length; x = 0; return; }
                const wpt = textWidthPt(part, size, p.bold || r.b, r.code || p.mono);
                if (/^\s+$/.test(part)) { x += wpt; return; }
                if (x + wpt > avail && x > 0) { lines++; x = 0; }
                if (wpt > avail) { lines += Math.floor(wpt / avail); x = wpt % avail; } else x += wpt;
            });
        });
        return lines;
    }
    /** Height (in) of paragraphs in a box of width w (insets included). */
    function parasHeight(paras, w, inset) {
        let h = 0;
        paras.forEach(function (p) { h += paraLines(p, w) * p.size * (p.lh || LH) / 72 + (p.after || 0) / 72; });
        const last = paras[paras.length - 1];
        if (last) h -= (last.after || 0) / 72;
        return h + 2 * (inset == null ? INSET : inset);
    }
    /** Widest line (in) of one-line paragraphs (labels): for shrinking a label to its box. */
    function parasWidth(paras) {
        let w = 0;
        paras.forEach(function (p) {
            runsText(p.runs).split('\n').forEach(function (line) { w = Math.max(w, textWidthPt(line, p.size, p.bold) / 72); });
        });
        return w + 2 * INSET;
    }
    /** Shrink every size by one factor until the paragraphs fit; { scale, fits }. */
    function fit(paras, w, h, min, inset) {
        const base = paras.map(function (p) { return [p.size, p.after || 0]; });
        let s = 1;
        for (;;) {
            paras.forEach(function (p, k) { p.size = r1(base[k][0] * s); p.after = r1(base[k][1] * s); });
            if (parasHeight(paras, w, inset) <= h * FIT + 0.01) return { scale: s, fits: true };
            if (s <= min + 1e-6) return { scale: s, fits: false };
            s = Math.max(min, s - 0.04);
        }
    }

    // =========================================================================
    // 4. Layout: slides → positioned shapes (inches, logical left-to-right)
    // =========================================================================

    /** A paragraph. align: 'start' | 'center' | 'end' (resolved by the deck's direction). */
    function P(runs, size, o) {
        return Object.assign({ runs: runs || [], size: size, color: null, align: 'start', after: r1(size * 0.4), level: 0 }, o || {});
    }

    class Slide {
        constructor(ctx) {
            this.ctx = ctx; this.W = ctx.W; this.H = ctx.H; this.T = ctx.T;
            this.shapes = []; this.bg = ctx.T.white; this.notes = ''; this.showNum = true; this.warn = [];
            this.layout = ''; this.title = ''; this.hidden = false; this.kind = 'content';
        }
        add(s) { this.shapes.push(s); return s; }
        rect(x, y, w, h, o) { return this.add(Object.assign({ t: 'shape', shape: 'rect', x: x, y: y, w: w, h: h }, o || {})); }
        round(x, y, w, h, o) { return this.add(Object.assign({ t: 'shape', shape: 'roundRect', x: x, y: y, w: w, h: h, r: 0.08 }, o || {})); }
        ellipse(x, y, w, h, o) { return this.add(Object.assign({ t: 'shape', shape: 'ellipse', x: x, y: y, w: w, h: h }, o || {})); }
        line(x1, y1, x2, y2, o) { return this.add(Object.assign({ t: 'line', x1: x1, y1: y1, x2: x2, y2: y2, color: this.T.line, width: 1.5 }, o || {})); }
        /** A text box; shrinks its paragraphs to fit unless o.noFit. */
        text(x, y, w, h, paras, o) {
            o = o || {};
            const inset = o.inset == null ? INSET : o.inset;
            if (!o.noFit) {
                const f = fit(paras, w, h, o.min || this.ctx.cfg.minScale, inset);
                if (!f.fits) this.warn.push({ code: 'overflow' });
            }
            paras.forEach(function (p) { if (!p.color) p.color = o.color || null; });
            return this.add({ t: 'text', x: x, y: y, w: w, h: h, paras: paras, valign: o.valign || 'top', inset: inset, role: o.role, fill: o.fill });
        }
        image(x, y, w, h, block, o) {
            const m = block.type === 'math';
            return this.add(Object.assign({ t: 'image', x: x, y: y, w: w, h: h, src: block.src, alt: block.alt || '', math: m,
                omml: m ? block.omml || null : null, mw: m ? block.w : 0, mh: m ? block.h : 0 }, o || {}));
        }
        /** An icon in a circle: a Lucide name (picture) or an emoji (text). */
        icon(icon, x, y, d, fill) {
            this.ellipse(x, y, d, d, { fill: fill });
            if (icon.emoji) return this.text(x, y, d, d, [P([{ t: icon.emoji }], r1(d * 72 * 0.46), { align: 'center', after: 0, lh: 1.2, ltr: true })], { valign: 'middle', noFit: true, inset: 0 });
            const pad = d * 0.24;
            return this.add({ t: 'image', x: x + pad, y: y + pad, w: d - 2 * pad, h: d - 2 * pad, src: iconSrc(icon.name, onFill(fill)), alt: icon.name, icon: true });
        }
    }

    /** A Lucide icon as an SVG data URI, white or near black (rasterized by ImageCore like any SVG). */
    let iconSet = null;
    function iconSrc(name, color) {
        const inner = iconSet ? iconSet(name) : null;
        if (!inner) return '';
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="#' + (color || 'FFFFFF') + '" ' +
            'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    // ── blocks → paragraphs (text flow) ──────────────────────────────────────

    function listParas(ctx, list, size, level, out, plain) {
        out = out || []; level = level || 0;
        const T = ctx.T;
        // a "definition list": every item a lead, no sub-items → lead line + detail line, no bullets
        const def = !plain && level === 0 && !list.ordered && list.items.length > 0 && list.items.every(function (it) { return it.lead && !it.children; });
        list.items.forEach(function (it, k) {
            if (def) {
                out.push(P(it.lead, r1(size * 0.95), { bold: true, color: T.primary, after: it.detail.length ? 0 : r1(size * 0.5) }));
                if (it.detail.length) out.push(P(it.detail, r1(size * 0.85), { color: T.muted, after: r1(size * 0.55) }));
                return;
            }
            const runs = (it.icon && it.icon.emoji ? [{ t: it.icon.emoji + ' ' }] : []).concat(it.runs);
            out.push(P(runs, size, { bullet: list.ordered ? { num: list.start + k } : (ctx.bullets || BULLETS.disc)[level ? 1 : 0], level: level, after: r1(size * 0.32) }));
            if (it.children) listParas(ctx, it.children, r1(size * 0.88), level + 1, out, true);
        });
        return out;
    }
    function blockParas(ctx, b, size) {
        const T = ctx.T;
        switch (b.type) {
            case 'para': return [P(b.runs, size)];
            case 'h3': return [P(b.runs, r1(size * (b.level <= 3 ? 1.02 : 0.95)), { bold: true, color: T.primary, after: r1(size * 0.25) })];
            case 'list': return listParas(ctx, b, size);
            case 'quote': return [].concat.apply([], b.blocks.map(function (x) { return blockParas(ctx, x, size); }))
                .map(function (p) { return Object.assign(p, { runs: p.runs.map(function (r) { return Object.assign({}, r, { i: true }); }), color: T.muted }); });
            case 'alert': return [].concat.apply([], b.blocks.map(function (x) { return blockParas(ctx, x, size); }));
            default: return [];
        }
    }

    // ── tables, code, charts ─────────────────────────────────────────────────

    function tableCols(b, w) {
        const all = [b.header].concat(b.rows), n = b.header.length;
        const weight = [];
        for (let c = 0; c < n; c++) weight.push(Math.max.apply(null, all.map(function (r) { return Math.min(runsText(r[c] || []).length, 40); })) + 6);
        const sum = weight.reduce(function (a, v) { return a + v; }, 0);
        return weight.map(function (v) { return r3(w * v / sum); });
    }
    function tableHeight(b, w, size) {
        const colW = tableCols(b, w);
        return [b.header].concat(b.rows).reduce(function (acc, row) {
            return acc + Math.max.apply(null, b.header.map(function (_, c) {
                return parasHeight([P(row[c] || [], size, { after: 0, lh: 1.45 })], colW[c], 0.05);
            })) + 0.02;
        }, 0);
    }
    function placeTable(S, b, x, y, w, size) {
        const T = S.T, colW = tableCols(b, w);
        const align = b.header.map(function (_, k) {
            const a = b.align[k];
            if (a === 'center') return 'center';
            if (a) return a;                                  // 'left' / 'right' as written
            return b.rows.length && b.rows.every(function (r) { return !hasRtl(runsText(r[k] || [])) && !hasLatin(runsText(r[k] || [])) && /\d/.test(runsText(r[k] || [])); }) ? 'center' : 'start';
        });
        const rows = [b.header.map(function (c, k) { return { runs: c, bold: true, color: onFill(T.primary), fill: T.primary, align: align[k] === 'start' ? 'start' : align[k] }; })];
        b.rows.forEach(function (r, i) {
            rows.push(b.header.map(function (_, k) { return { runs: r[k] || [], color: T.ink, fill: i % 2 ? T.soft : T.bg, align: align[k] }; }));
        });
        const h = tableHeight(b, w, size);
        S.add({ t: 'table', x: x, y: y, w: w, h: h, colW: colW, rows: rows, size: size, border: T.line });
        return h;
    }
    /** The label over a code block (its language), or '' — as the Word, PDF and HTML outputs show it. */
    function codeLabel(ctx, b) {
        if (ctx.cfg.codeLanguage === false) return '';
        return b.lang || ctx.cfg.codeFallback || '';
    }
    const CODE_BAR = 0.27;
    function codeBox(S, b, x, y, w, h, size) {
        const T = S.T;
        S.round(x, y, w, h, { fill: wash(T.soft, 0.3), line: T.line, r: 0.06 });
        const lines = [[]];
        b.runs.forEach(function (r) {
            const parts = r.t.split('\n');
            parts.forEach(function (part, i) {
                if (i > 0) lines.push([]);
                if (part) lines[lines.length - 1].push(Object.assign({}, r, { t: part, code: true }));
            });
        });
        while (lines.length > 1 && !lines[lines.length - 1].length) lines.pop();
        // code is left to right; a block whose lines start with right-to-left letters (a prompt, a
        // Persian comment block) keeps those lines right to left, at the right edge
        const rtlLine = function (l) { const s = runsText(l); return BidiCore ? BidiCore.firstStrong(s) === 'rtl' : hasRtl(s); };
        const rtlBlock = lines.filter(rtlLine).length > lines.length / 2;
        const label = codeLabel(S.ctx, b);
        if (label) {          // the language over the code, on the code's side, under a hairline
            S.rect(x + 0.02, y + CODE_BAR, w - 0.04, 0.01, { fill: T.line, deco: true });
            S.text(x + 0.08, y + 0.02, w - 0.16, CODE_BAR - 0.03, [P([{ t: label }], 9, { mono: true, ltr: true, after: 0, lh: 1.2, color: T.muted, align: rtlBlock ? 'right' : 'left' })], { valign: 'middle', noFit: true, inset: 0.02 });
            y += CODE_BAR; h -= CODE_BAR;
        }
        S.text(x + 0.06, y + 0.04, w - 0.12, h - 0.08, lines.map(function (l) {
            const rtl = rtlLine(l);
            return P(l.length ? l : [{ t: ' ', code: true }], size, { mono: true, after: 0, lh: 1.3, ltr: !rtl, forceRtl: rtl,
                align: rtlBlock ? 'right' : 'left', color: T.ink });
        }), { noFit: true });
    }
    /** A table → chart data: first column the categories, the other columns the series. */
    function chartData(table) {
        const labels = table.rows.map(function (r) { return runsText(r[0] || []); });
        const series = [];
        for (let c = 1; c < table.header.length; c++) {
            const vals = table.rows.map(function (r) { return cellNumber(runsText(r[c] || [])); });
            if (vals.some(function (v) { return !isNaN(v); })) series.push({ name: runsText(table.header[c]) || ('S' + c), labels: labels, values: vals.map(function (v) { return isNaN(v) ? 0 : v; }) });
        }
        return series;
    }
    function placeChart(S, b, x, y, w, h) {
        const data = chartData(b.table);
        if (!data.length) { S.warn.push({ code: 'chart-data' }); return; }
        S.add({ t: 'chart', x: x, y: y, w: w, h: h, kind: b.chart.type, data: data, opts: b.chart,
                title: b.chart.title || '', colors: palette(S.T, Math.max(data.length, data[0].labels.length)) });
    }
    function palette(T, n) {
        const base = [T.primary, T.accent, wash(T.primary, 0.45), shade(T.accent, 0.25), wash(T.accent, 0.4), shade(T.primary, 0.35), '8C9AA5', wash(T.primary, 0.7)];
        const out = [];
        for (let i = 0; i < n; i++) out.push(base[i % base.length]);
        return out;
    }

    // ── text flow: paragraphs, lists, code, tables, pictures, charts, formulas ─

    function flow(S, blocks, x, y, w, h, base) {
        const ctx = S.ctx, segs = [];
        blocks.forEach(function (b) {
            if (['para', 'h3', 'list', 'quote'].indexOf(b.type) >= 0) {
                const last = segs[segs.length - 1];
                if (last && last.type === 'text') last.blocks.push(b); else segs.push({ type: 'text', blocks: [b] });
            } else if (['code', 'table', 'image', 'chart', 'math'].indexOf(b.type) >= 0) segs.push({ type: b.type, block: b });
        });
        if (!segs.length) return 0;
        const gap = 0.14;
        const flex = segs.filter(function (s) { return s.type === 'image' || s.type === 'chart'; }).length;
        const measure = function (s) {
            let fixed = 0;
            segs.forEach(function (g) {
                if (g.type === 'text') { g.paras = [].concat.apply([], g.blocks.map(function (b) { return blockParas(ctx, b, r1(base * s)); })); g.h = parasHeight(g.paras, w); }
                else if (g.type === 'code') { const n = runsText(g.block.runs).replace(/\n$/, '').split('\n').length; g.size = r1(12 * s * ctx.sizeMul); g.h = n * g.size * 1.3 / 72 + 0.26 + (codeLabel(ctx, g.block) ? CODE_BAR : 0); }
                else if (g.type === 'table') { g.size = r1(12.5 * s * ctx.sizeMul); g.h = tableHeight(g.block, w, g.size); }
                else if (g.type === 'math') { const d = mathSize(g.block, w, h); g.h = d.h; g.w = d.w; }
                else g.h = 0;
                fixed += g.h;
            });
            return fixed + gap * (segs.length - 1);
        };
        let s = 1, total = measure(s);
        const flexMin = flex * 1.3;
        while (total + flexMin > h * FIT && s > ctx.cfg.minScale) { s = Math.max(ctx.cfg.minScale, s - 0.04); total = measure(s); }
        if (total + flexMin > h + 0.02) S.warn.push({ code: 'overflow' });
        const flexH = flex ? Math.max(0.8, (h - total) / flex) : 0;
        // the last text box takes the room left: a measured height is an estimate, the box should not be the limit
        const lastSeg = segs[segs.length - 1];
        if (!flex && lastSeg.type === 'text' && h > total) lastSeg.h += h - total;
        let cy = y;
        segs.forEach(function (g) {
            if (g.type === 'text') S.text(x, cy, w, g.h, g.paras, { noFit: true });
            else if (g.type === 'code') codeBox(S, g.block, x, cy, w, g.h, g.size);
            else if (g.type === 'table') placeTable(S, g.block, x, cy, w, g.size);
            else if (g.type === 'math') S.image(x + (w - g.w) / 2, cy, g.w, g.h, g.block);
            else if (g.type === 'image') { S.image(x, cy, w, flexH, g.block); g.h = flexH; }
            else if (g.type === 'chart') { placeChart(S, g.block, x, cy, w, flexH); g.h = flexH; }
            cy += g.h + gap;
        });
        return cy - gap - y;
    }
    /** A formula's display size (in): its picture size at 96 px/in, never wider than the box. */
    function mathSize(b, w, h) {
        let mw = (b.w || 200) / 96 * 1.15, mh = (b.h || 40) / 96 * 1.15;
        const k = Math.min(1, w / mw, (h * 0.6) / mh);
        return { w: mw * k, h: mh * k };
    }

    // ── slide frames ─────────────────────────────────────────────────────────

    function stepsGlyph(S, cx, cy, color, k) {
        k = k || 1;
        [0.14, 0.22, 0.3].forEach(function (bw, i) { S.rect(cx - bw * k / 2, cy - 0.11 * k + i * 0.085 * k, bw * k, 0.055 * k, { fill: color, deco: true }); });
    }
    function pyramid(S, cx, bottom, color, k) {
        k = k || 1;
        for (let i = 0; i < 6; i++) { const bw = (2.1 - i * 0.3) * k; S.rect(cx - bw / 2, bottom - (i + 1) * 0.15 * k, bw, 0.12 * k, { fill: color, deco: true }); }
    }
    /** The deck's classification (front matter classification: — «Internal», «محرمانه») as a small outlined badge. */
    function classBadge(S, cx, y, dark) {
        const T = S.ctx.T, t = S.ctx.classification;
        const w = Math.min(2.4, textWidthPt(t, 8, true) / 72 + 0.34);
        const c = dark ? tint(T.accent, 0.45) : T.accent;
        S.round(cx - w / 2, y + 0.02, w, 0.26, { line: c, lineW: 0.75, r: 0.13, deco: true });
        S.text(cx - w / 2, y + 0.02, w, 0.26, [P([{ t: t }], 8, { bold: true, color: c, after: 0, align: 'center', lh: 1.2 })], { valign: 'middle', noFit: true, inset: 0.02 });
    }
    /** Title, decoration and footer of a content slide; returns the body box. */
    function frame(S, slide) {
        const ctx = S.ctx, T = ctx.T, W = S.W, H = S.H;
        let tx = 0.5;
        if (T.decoration === 'steps') { stepsGlyph(S, 0.68, 0.66, T.accent); tx = 0.95; }
        else if (T.decoration === 'bar') { S.rect(0.5, 0.42, 0.07, 0.48, { fill: T.accent, deco: true }); tx = 0.72; }
        // the organization's mark at the end of the title row, as a letterhead does
        let lw = 0;
        if (ctx.logo && ctx.logoAll && slide.style.logo !== 'off') {
            const lh = 0.42;
            lw = Math.min(1.6, ctx.logo.nw && ctx.logo.nh ? lh * ctx.logo.nw / ctx.logo.nh : lh);
            S.image(W - 0.5 - lw, 0.45, lw, lh, { type: 'image', src: ctx.logo.src, alt: 'Logo' }, { logo: true });
            lw += 0.25;
        }
        S.text(tx, 0.3, W - tx - 0.5 - lw, 0.72, [P(slide.title, r1(24 * ctx.sizeMul), { bold: true, after: 0, lh: 1.45, color: T.ink })],
            { valign: 'middle', min: 0.72, role: 'title' });
        const footer = slide.style.footer === 'off' ? '' : ctx.footer;
        if (ctx.classification) classBadge(S, W / 2, H - 0.42);
        if (footer) S.text(0.5, H - 0.42, ctx.classification ? W / 2 - 1.4 : W - 2.2, 0.3, [P([{ t: footer }], 8, { color: T.muted, after: 0 })], { valign: 'middle', noFit: true, inset: 0.02, role: 'footer' });
        return { x: 0.5, y: 1.15, w: W - 1, h: H - 1.15 - 0.6 };
    }

    // ── layouts ──────────────────────────────────────────────────────────────

    const isLeadList = function (b) { return b && b.type === 'list' && b.items.length > 0 && b.items.every(function (it) { return it.lead; }); };
    const hasDigit = function (runs) { return /[0-9۰-۹٠-٩]/.test(runsText(runs)); };

    function autoLayout(slide, blocks, ctx) {
        if (slide.layout) return slide.layout;
        const kinds = blocks.map(function (b) { return b.type; });
        const h3 = kinds.filter(function (k) { return k === 'h3'; }).length;
        if (!ctx.cfg.autoLayout) return 'bullets';
        if ((h3 === 2 || h3 === 3) && blocks[0] && (blocks[0].type === 'h3' || blocks.indexOf(blocks.find(function (b) { return b.type === 'h3'; })) <= 1)) return 'columns';
        if (blocks.length === 1 && blocks[0].type === 'quote') return 'quote';
        if (blocks.length === 1 && blocks[0].type === 'para' && runsText(blocks[0].runs).length <= 160) return 'statement';
        if (blocks.length === 1 && isLeadList(blocks[0])) {
            const L = blocks[0], n = L.items.length;
            if (L.ordered && n >= 2 && n <= 6 && !L.items.some(function (it) { return it.children; })) return 'steps';
            if (!L.ordered && n >= 2 && n <= 6 && L.items.every(function (it) { return it.children || it.icon; })) return 'cards';
        }
        const imgs = kinds.filter(function (k) { return k === 'image'; }).length, charts = kinds.filter(function (k) { return k === 'chart'; }).length;
        if (imgs + charts === 1 && kinds.some(function (k) { return k === 'list' || k === 'para'; }) && blocks.length <= 4) return 'image';
        return 'bullets';
    }

    function layAlert(S, a, x, y, w, measureOnly) {
        const A = ALERTS[a.kind], ctx = S.ctx;
        const paras = [].concat.apply([], a.blocks.map(function (b) { return blockParas(ctx, b, r1(12.5 * ctx.sizeMul)); }))
            .map(function (p) { return Object.assign(p, { after: 2, runs: p.runs.map(function (r) { return r.b ? Object.assign({}, r, { color: A.color }) : r; }) }); });
        const tw = w - 0.75;
        fit(paras, tw, 1.0, 0.8);
        const h = clamp(parasHeight(paras, tw) + 0.12, 0.56, 1.05);
        if (measureOnly) return h;
        S.round(x, y, w, h, { fill: wash(A.color, 0.88), r: 0.06 });
        S.rect(x, y, 0.06, h, { fill: A.color });
        S.ellipse(x + 0.2, y + h / 2 - 0.17, 0.34, 0.34, { fill: A.color });
        S.text(x + 0.2, y + h / 2 - 0.17, 0.34, 0.34, [P([{ t: A.glyph }], 13, { bold: true, color: onFill(A.color), align: 'center', after: 0, ltr: true, lh: 1.2 })], { valign: 'middle', noFit: true, inset: 0 });
        S.text(x + 0.65, y, tw, h, paras, { valign: 'middle', noFit: true, color: S.T.ink });
        return h;
    }

    const LAYOUT = {
        bullets: function (S, blocks, B, slide) {
            if (blocks.length === 1 && (blocks[0].type === 'image' || blocks[0].type === 'chart')) { if (slide) slide.used = blocks[0].type; return LAYOUT.image(S, blocks, B, slide || { opts: {} }); }
            flow(S, blocks, B.x, B.y, B.w, B.h, r1(17 * S.ctx.sizeMul));
        },
        table: function (S, blocks, B) { flow(S, blocks, B.x, B.y, B.w, B.h, r1(16 * S.ctx.sizeMul)); },
        chart: function (S, blocks, B) { LAYOUT.image(S, blocks, B); },
        statement: function (S, blocks, B) {
            const paras = [].concat.apply([], blocks.map(function (b) { return blockParas(S.ctx, b, 28); })).map(function (p) { return Object.assign(p, { align: 'center', after: 10, bold: true, color: S.T.ink }); });
            S.rect(B.x + B.w / 2 - 0.45, B.y + 0.35, 0.9, 0.06, { fill: S.T.accent, deco: true });
            S.text(B.x + 0.6, B.y + 0.6, B.w - 1.2, B.h - 0.9, paras, { valign: 'middle' });
        },
        image: function (S, blocks, B, slide) {
            const pic = blocks.find(function (b) { return b.type === 'image' || b.type === 'chart'; });
            if (!pic) return LAYOUT.bullets(S, blocks, B);
            const rest = blocks.filter(function (b) { return b !== pic; });
            const caption = pic.type === 'image' && pic.alt;
            if (!rest.length || (slide && slide.opts.full)) {
                const ch = caption ? 0.34 : 0;
                if (pic.type === 'chart') placeChart(S, pic, B.x, B.y, B.w, B.h);
                else S.image(B.x + 0.5, B.y, B.w - 1, B.h - ch, pic, { caption: !!caption });
                if (caption) S.text(B.x, B.y + B.h - ch, B.w, ch, [P([{ t: pic.alt }], 10.5, { color: S.T.muted, align: 'center', after: 0 })], { noFit: true, inset: 0.02 });
                if (rest.length) flow(S, rest, B.x, B.y, B.w, 0, 14);
                return;
            }
            const wide = pic.type === 'chart' ? 0.52 : 0.4;
            const iw = r3(B.w * wide), gap = 0.35, start = slide && slide.opts.start;     // the picture at the end side (start: at the start side)
            const tx = start ? B.x + iw + gap : B.x, ix = start ? B.x : B.x + B.w - iw;
            flow(S, rest, tx, B.y, B.w - iw - gap, B.h, r1(16 * S.ctx.sizeMul));
            const ih = caption ? B.h - 0.38 : B.h;
            if (pic.type === 'chart') placeChart(S, pic, ix, B.y, iw, B.h);
            else S.image(ix, B.y, iw, Math.min(ih, iw * 0.95), pic, { caption: !!caption });
            if (caption) S.text(ix, B.y + Math.min(ih, iw * 0.95) + 0.04, iw, 0.32, [P([{ t: pic.alt }], 9.5, { color: S.T.muted, align: 'center', after: 0 })], { noFit: true, inset: 0.02 });
        },
        quote: function (S, blocks, B) {
            const q = blocks.find(function (b) { return b.type === 'quote'; }) || { blocks: blocks };
            const out = [].concat.apply([], q.blocks.map(function (b) { return blockParas(S.ctx, b, 24); })).map(function (p) {
                return /^[—–-]\s/.test(runsText(p.runs).trim())
                    ? Object.assign(p, { size: 13, color: S.T.muted, align: 'center', after: 0 })
                    : Object.assign(p, { size: 24, color: S.T.ink, align: 'center', after: 10 });
            });
            S.text(B.x, B.y - 0.2, B.w, 1.05, [P([{ t: '“' }], 66, { color: S.T.accent, align: 'center', after: 0, lh: 1.1, ltr: true })], { noFit: true, inset: 0 });
            S.text(B.x + 0.6, B.y + 0.75, B.w - 1.2, B.h - 0.8, out, { valign: 'middle' });
        },
        columns: function (S, blocks, B, slide) {
            const idx = []; blocks.forEach(function (b, i) { if (b.type === 'h3') idx.push(i); });
            let y = B.y, h = B.h;
            const intro = idx.length ? blocks.slice(0, idx[0]) : [];
            if (intro.length) {
                const paras = [].concat.apply([], intro.map(function (b) { return blockParas(S.ctx, b, 14); }));
                const ih = Math.min(1.1, parasHeight(paras, B.w));
                S.text(B.x, y, B.w, ih, paras); y += ih + 0.12; h -= ih + 0.12;
            }
            let cols;
            if (idx.length >= 2) cols = idx.map(function (s, k) { return blocks.slice(s, idx[k + 1] || blocks.length); });
            else {
                const n = clamp(parseInt(slide.opts.cols, 10) || 2, 2, 3), per = Math.ceil(blocks.length / n);
                cols = []; for (let k = 0; k < n; k++) cols.push(blocks.slice(k * per, (k + 1) * per));
            }
            cols = cols.slice(0, 4);
            const gap = 0.3, cw = (B.w - gap * (cols.length - 1)) / cols.length;
            cols.forEach(function (col, k) {
                const x = B.x + k * (cw + gap), color = k % 2 ? S.T.accent : S.T.primary;
                S.round(x, y, cw, h, { fill: S.T.soft });
                S.rect(x, y, cw, 0.06, { fill: color });
                let body = col, top = y + 0.2;
                if (col[0] && col[0].type === 'h3') {
                    S.text(x + 0.18, y + 0.16, cw - 0.36, 0.52, [P(col[0].runs, r1(16 * S.ctx.sizeMul), { bold: true, color: color, after: 0 })], { valign: 'middle' });
                    body = col.slice(1); top = y + 0.72;
                }
                flow(S, body, x + 0.18, top, cw - 0.36, y + h - top - 0.12, r1(14.5 * S.ctx.sizeMul));
            });
        },
        cards: function (S, blocks, B, slide) {
            const L = blocks.find(isLeadList) || blocks.find(function (b) { return b.type === 'list'; });
            if (!L) return LAYOUT.bullets(S, blocks, B);
            let y = B.y, h = B.h;
            const intro = blocks.filter(function (b) { return b !== L; });
            if (intro.length) {
                const paras = [].concat.apply([], intro.map(function (b) { return blockParas(S.ctx, b, 14); }));
                const ih = Math.min(1.0, parasHeight(paras, B.w));
                S.text(B.x, y, B.w, ih, paras); y += ih + 0.12; h -= ih + 0.12;
            }
            const n = L.items.length;
            const cols = clamp(parseInt(slide.opts.cols, 10) || (n <= 3 ? n : n === 4 ? 2 : 3), 1, 4), rows = Math.ceil(n / cols);
            const gap = 0.25, cw = (B.w - gap * (cols - 1)) / cols, ch = (h - gap * (rows - 1)) / rows;
            L.items.forEach(function (it, i) {
                const x = B.x + (i % cols) * (cw + gap), yy = y + Math.floor(i / cols) * (ch + gap);
                const color = i % 2 ? S.T.accent : S.T.primary;
                S.round(x, yy, cw, ch, { fill: S.T.soft });
                S.rect(x, yy, cw, 0.06, { fill: color });
                let top = yy + 0.18;
                if (it.icon) { S.icon(it.icon, x + 0.16, yy + 0.2, 0.5, color); top = yy + 0.78; }
                const paras = [P(it.lead || it.runs, r1(15 * S.ctx.sizeMul), { bold: true, color: color, after: 5 })];
                if (it.detail && it.detail.length) paras.push(P(it.detail, r1(12.5 * S.ctx.sizeMul), { after: 4, color: S.T.ink }));
                if (it.children) listParas(S.ctx, it.children, r1(12 * S.ctx.sizeMul), 0, paras, true);
                S.text(x + 0.12, top, cw - 0.24, yy + ch - top - 0.08, paras);
            });
        },
        steps: function (S, blocks, B) {
            const L = blocks.find(function (b) { return b.type === 'list'; });
            if (!L) return LAYOUT.bullets(S, blocks, B);
            const n = L.items.length, gap = 0.25, cw = (B.w - gap * (n - 1)) / n;
            const ch = Math.min(B.h, 2.9), y = B.y + (B.h - ch) / 2;
            L.items.forEach(function (it, i) {
                const x = B.x + i * (cw + gap), d = 0.62, color = i % 2 ? S.T.accent : S.T.primary;
                S.round(x, y, cw, ch, { fill: S.T.soft });
                if (it.icon) S.icon(it.icon, x + cw / 2 - d / 2, y + 0.3, d, color);
                else {
                    S.ellipse(x + cw / 2 - d / 2, y + 0.3, d, d, { fill: color });
                    S.text(x + cw / 2 - d / 2, y + 0.3, d, d, [P([{ t: String(L.start + i) }], 20, { bold: true, color: onFill(color), align: 'center', after: 0, lh: 1.2, ltr: true })], { valign: 'middle', noFit: true, inset: 0 });
                }
                const paras = [P(it.lead || it.runs, r1(16 * S.ctx.sizeMul), { bold: true, align: 'center', after: 6, color: S.T.ink })];
                if (it.detail && it.detail.length) paras.push(P(it.detail, r1(12 * S.ctx.sizeMul), { color: S.T.muted, align: 'center', after: 0 }));
                S.text(x + 0.1, y + 1.1, cw - 0.2, ch - 1.22, paras);
            });
        },
        stats: function (S, blocks, B, slide) {
            const tiles = [], rest = [];
            blocks.forEach(function (b) {
                if (b.type === 'list' && !tiles.length) {
                    const t = b.items.filter(function (it) { return it.lead && hasDigit(it.lead); });
                    const o = b.items.filter(function (it) { return !(it.lead && hasDigit(it.lead)); });
                    tiles.push.apply(tiles, t);
                    if (o.length) rest.push(Object.assign({}, b, { items: o }));
                } else rest.push(b);
            });
            if (!tiles.length) { slide.warn.push({ code: 'stats' }); return LAYOUT.bullets(S, blocks, B); }
            const tile = function (it, i, x, y, w, h) {
                const color = i % 2 ? S.T.accent : S.T.primary;
                S.round(x, y, w, h, { fill: color });
                let top = y + 0.08;
                if (it.icon && h > 1.3) { S.icon(it.icon, x + w / 2 - 0.22, y + 0.14, 0.44, shade(color, 0.25)); top = y + 0.6; }
                const paras = [P(it.lead, r1(28 * S.ctx.sizeMul), { bold: true, color: onFill(color), align: 'center', after: 2, lh: 1.4 })];
                if (it.detail.length) paras.push(P(it.detail, r1(11 * S.ctx.sizeMul), { color: isDark(color) ? tint(color, 0.85) : shade(color, 0.7), align: 'center', after: 0 }));
                S.text(x + 0.1, top, w - 0.2, y + h - top - 0.08, paras, { valign: 'middle' });
            };
            const column = slide.opts.column || (rest.length && !slide.opts.row);
            if (column) {
                const tw = 3.2, gap = 0.35, n = tiles.length, tg = 0.22;
                const th = Math.min(1.5, (B.h - tg * (n - 1)) / n), total = th * n + tg * (n - 1);
                if (rest.length) featureList(S, rest, B.x, B.y, B.w - tw - gap, B.h);
                tiles.forEach(function (it, i) { tile(it, i, B.x + B.w - tw, B.y + (B.h - total) / 2 + i * (th + tg), tw, th); });
            } else {
                const n = tiles.length, gap = 0.3, tw = Math.min(3, (B.w - gap * (n - 1)) / n), total = tw * n + gap * (n - 1);
                const th = rest.length ? 1.6 : 2.0, ty = rest.length ? B.y : B.y + (B.h - th) / 2;
                tiles.forEach(function (it, i) { tile(it, i, B.x + (B.w - total) / 2 + i * (tw + gap), ty, tw, th); });
                if (rest.length) flow(S, rest, B.x, ty + th + 0.25, B.w, B.h - th - 0.25, r1(15 * S.ctx.sizeMul));
            }
        },
        timeline: function (S, blocks, B, slide) {
            const L = blocks.find(function (b) { return b.type === 'list'; });
            if (!L) return LAYOUT.bullets(S, blocks, B);
            const after = blocks.filter(function (b) { return b !== L; });
            const n = L.items.length, hl = parseInt(slide.opts.highlight, 10) || 0;
            const longest = Math.max.apply(null, L.items.map(function (it) { return runsText(it.detail || it.runs).length; }));
            const cfgT = S.ctx.cfg.timeline;
            const vertical = slide.opts.vertical ? true : slide.opts.horizontal ? false : cfgT === 'vertical' ? true : cfgT === 'horizontal' ? false : (n > 6 || longest > 70);
            slide.used = 'timeline ' + (vertical ? 'vertical' : 'horizontal');
            const leadOf = function (it) { return runsText(it.lead || it.runs).trim(); };
            if (!vertical) {
                const step = B.w / n, d = n > 5 ? 0.9 : 1.0, capH = after.length ? 0.7 : 0, cy = B.y + Math.min(1.0, (B.h - capH) * 0.3);
                S.line(B.x + step / 2, cy, B.x + B.w - step / 2, cy, { color: S.T.line, width: 2.5 });
                L.items.forEach(function (it, i) {
                    const on = hl === i + 1, dd = on ? d * 1.12 : d, cx = B.x + step * i + step / 2;
                    const color = on ? S.T.accent : S.T.primary;
                    S.ellipse(cx - dd / 2, cy - dd / 2, dd, dd, { fill: color, line: S.T.bg, lineW: 3 });
                    const lead = leadOf(it), sp = lead.indexOf(' ');
                    const big = sp > 0 ? lead.slice(0, sp) : lead, small = sp > 0 ? lead.slice(sp + 1) : '';
                    const ps = [P([{ t: big }], r1(20 * S.ctx.sizeMul), { bold: true, color: onFill(color), align: 'center', after: 0, lh: 1.25 })];
                    if (small) ps.push(P([{ t: small }], 9, { color: isDark(color) ? tint(color, 0.8) : shade(color, 0.65), align: 'center', after: 0, lh: 1.25 }));
                    S.text(cx - dd / 2, cy - dd / 2, dd, dd, ps, { valign: 'middle', min: 0.55, inset: 0.03 });
                    if (it.detail && it.detail.length) S.text(cx - step / 2 + 0.04, cy + d / 2 + 0.14, step - 0.08, B.y + B.h - capH - (cy + d / 2 + 0.14),
                        [P(it.detail, r1(12.5 * S.ctx.sizeMul), { align: 'center', after: 0, bold: on, color: on ? shade(S.T.accent, 0.2) : S.T.ink })]);
                });
                if (after.length) {
                    const paras = [].concat.apply([], after.map(function (b) { return blockParas(S.ctx, b, 12.5); })).map(function (p) { return Object.assign(p, { align: 'center', color: S.T.accent }); });
                    S.text(B.x, B.y + B.h - capH, B.w, capH, paras, { valign: 'bottom' });
                }
                return;
            }
            // vertical: dates at the start side of a line, text at the end side
            const capH = after.length ? 0.55 : 0, rowH = Math.min(0.95, (B.h - capH) / n), top = B.y + (B.h - capH - rowH * n) / 2;
            const ax = B.x + 1.75;
            S.line(ax, top + rowH / 2, ax, top + rowH * (n - 0.5), { color: S.T.line, width: 2.5 });
            L.items.forEach(function (it, i) {
                const on = hl === i + 1, y = top + i * rowH, color = on ? S.T.accent : S.T.primary, d = on ? 0.3 : 0.24;
                S.ellipse(ax - d / 2, y + rowH / 2 - d / 2, d, d, { fill: color, line: S.T.bg, lineW: 2 });
                S.text(B.x, y, 1.5, rowH, [P([{ t: leadOf(it) }], r1(15 * S.ctx.sizeMul), { bold: true, color: color, align: 'end', after: 0 })], { valign: 'middle', min: 0.6 });
                if (it.detail && it.detail.length) S.text(ax + 0.3, y, B.x + B.w - ax - 0.3, rowH, [P(it.detail, r1(13.5 * S.ctx.sizeMul), { after: 0, bold: on, color: S.T.ink })], { valign: 'middle', min: 0.6 });
            });
            if (after.length) {
                const paras = [].concat.apply([], after.map(function (b) { return blockParas(S.ctx, b, 12.5); })).map(function (p) { return Object.assign(p, { color: S.T.accent }); });
                S.text(B.x, B.y + B.h - capH, B.w, capH, paras, { valign: 'bottom' });
            }
        },
        agenda: function (S, blocks, B, slide) {
            const L = blocks.find(function (b) { return b.type === 'list'; });
            const items = L ? L.items.map(function (it) { return { lead: it.lead || it.runs, detail: it.detail || [] }; }) : (slide.agenda || []);
            if (!items.length) return LAYOUT.bullets(S, blocks, B);
            const n = items.length, cols = n > 5 ? 2 : 1, per = Math.ceil(n / cols), gap = 0.4;
            const cw = (B.w - gap * (cols - 1)) / cols, rh = Math.min(0.85, B.h / per);
            items.forEach(function (it, i) {
                const c = Math.floor(i / per), r = i % per, x = B.x + c * (cw + gap), y = B.y + r * rh + (B.h - rh * per) / 2;
                const color = i % 2 ? S.T.accent : S.T.primary, d = Math.min(0.56, rh - 0.12);
                S.ellipse(x, y + (rh - d) / 2, d, d, { fill: color });
                S.text(x, y + (rh - d) / 2, d, d, [P([{ t: String(i + 1).padStart(2, '0') }], 14, { bold: true, color: onFill(color), align: 'center', after: 0, lh: 1.2, ltr: true })], { valign: 'middle', noFit: true, inset: 0 });
                const ps = [P(it.lead, r1(17 * S.ctx.sizeMul), { bold: true, after: 0, color: S.T.ink })];
                if (it.detail.length) ps.push(P(it.detail, r1(12 * S.ctx.sizeMul), { color: S.T.muted, after: 0 }));
                S.text(x + d + 0.15, y, cw - d - 0.15, rh, ps, { valign: 'middle' });
                if (r < per - 1 && i < n - 1) S.line(x + d + 0.2, y + rh, x + cw, y + rh, { color: S.T.line, width: 0.75 });
            });
        },
        process: function (S, blocks, B, slide) {
            const L = blocks.find(function (b) { return b.type === 'list'; });
            if (!L) return LAYOUT.bullets(S, blocks, B);
            const items = L.items, n = items.length;
            const after = blocks.filter(function (b) { return b !== L; });
            const capH = after.length ? 0.6 : 0;
            if (slide.opts.vertical) {
                const gap = 0.22, bh = Math.min(0.9, (B.h - capH - gap * (n - 1)) / n), top = B.y + (B.h - capH - (bh * n + gap * (n - 1))) / 2;
                items.forEach(function (it, i) {
                    const y = top + i * (bh + gap), color = i % 2 ? S.T.accent : S.T.primary;
                    S.round(B.x, y, 2.6, bh, { fill: color });
                    S.text(B.x, y, 2.6, bh, [P(it.lead || it.runs, r1(15 * S.ctx.sizeMul), { bold: true, color: onFill(color), align: 'center', after: 0 })], { valign: 'middle', min: 0.6 });
                    S.round(B.x + 2.6, y, B.w - 2.6, bh, { fill: S.T.soft });
                    if (it.detail && it.detail.length) S.text(B.x + 2.75, y, B.w - 2.9, bh, [P(it.detail, r1(13 * S.ctx.sizeMul), { after: 0, color: S.T.ink })], { valign: 'middle', min: 0.6 });
                    if (i < n - 1) S.add({ t: 'shape', shape: 'downArrow', x: B.x + 1.3 - 0.13, y: y + bh + 0.02, w: 0.26, h: gap - 0.04, fill: S.T.line });
                });
            } else {
                const ch = 0.95, top = B.y + Math.min(0.5, (B.h - capH) * 0.12), cw = B.w / n + 0.16 * (n - 1) / n;
                items.forEach(function (it, i) {
                    const x = B.x + i * (cw - 0.16), color = i % 2 ? S.T.accent : S.T.primary;
                    S.add({ t: 'shape', shape: i === 0 ? 'homePlate' : 'chevron', x: x, y: top, w: cw, h: ch, fill: color, dirShape: true });
                    if (it.icon) S.icon(it.icon, x + cw / 2 - 0.25, top + ch + 0.18, 0.5, color);
                    S.text(x + (i ? 0.32 : 0.12), top, cw - (i ? 0.5 : 0.36), ch, [P(it.lead || it.runs, r1(14 * S.ctx.sizeMul), { bold: true, color: onFill(color), align: 'center', after: 0 })], { valign: 'middle', min: 0.55, inset: 0.03 });
                    const dy = top + ch + (it.icon ? 0.78 : 0.2);
                    if (it.detail && it.detail.length) S.text(x + 0.06, dy, cw - 0.28, B.y + B.h - capH - dy, [P(it.detail, r1(12.5 * S.ctx.sizeMul), { align: 'center', after: 0, color: S.T.ink })]);
                });
            }
            if (after.length) S.text(B.x, B.y + B.h - capH, B.w, capH, [].concat.apply([], after.map(function (b) { return blockParas(S.ctx, b, 13); })).map(function (p) { return Object.assign(p, { align: 'center', color: S.T.muted }); }), { valign: 'bottom' });
        },
        cycle: function (S, blocks, B) {
            const L = blocks.find(function (b) { return b.type === 'list'; });
            if (!L) return LAYOUT.bullets(S, blocks, B);
            const items = L.items.slice(0, 8), n = items.length;
            const dw = Math.min(4.6, B.h * 1.25), cx = B.x + dw / 2, cy = B.y + B.h / 2;
            const d = clamp(3.2 / n + 0.35, 0.9, 1.25), rx = dw / 2 - d / 2, ry = B.h / 2 - d / 2;
            const pos = items.map(function (_, i) { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; });
            pos.forEach(function (p, i) {
                const q = pos[(i + 1) % n], dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1, k = (d / 2 + 0.06) / len;
                S.line(p[0] + dx * k, p[1] + dy * k, q[0] - dx * k, q[1] - dy * k, { color: S.T.muted, width: 1.75, arrow: true });
            });
            items.forEach(function (it, i) {
                const color = i % 2 ? S.T.accent : S.T.primary, p = pos[i];
                S.ellipse(p[0] - d / 2, p[1] - d / 2, d, d, { fill: color });
                S.text(p[0] - d / 2, p[1] - d / 2, d, d, [P(it.lead || it.runs, r1(12.5 * S.ctx.sizeMul), { bold: true, color: onFill(color), align: 'center', after: 0, lh: 1.3 })], { valign: 'middle', min: 0.55, inset: 0.04 });
            });
            const rest = items.filter(function (it) { return it.detail && it.detail.length; });
            if (rest.length) {
                const x = B.x + dw + 0.45, paras = [];
                items.forEach(function (it, i) {
                    paras.push(P([{ t: (i + 1) + '. ' }].concat(it.lead || it.runs), r1(14 * S.ctx.sizeMul), { bold: true, color: i % 2 ? S.T.accent : S.T.primary, after: 0 }));
                    if (it.detail && it.detail.length) paras.push(P(it.detail, r1(12.5 * S.ctx.sizeMul), { color: S.T.ink, after: 7 }));
                });
                S.text(x, B.y, B.x + B.w - x, B.h, paras, { valign: 'middle' });
            }
        },
        pyramid: function (S, blocks, B, slide, funnel) {
            const L = blocks.find(function (b) { return b.type === 'list'; });
            if (!L) return LAYOUT.bullets(S, blocks, B);
            const items = L.items.slice(0, 7), n = items.length, dw = Math.min(4.8, B.w * 0.52), gap = 0.08;
            const bh = Math.min(0.85, (B.h - gap * (n - 1)) / n), top = B.y + (B.h - (bh * n + gap * (n - 1))) / 2;
            const hasDetail = items.some(function (it) { return it.detail && it.detail.length; });
            const dx = hasDetail ? B.x : B.x + (B.w - dw) / 2;
            items.forEach(function (it, i) {
                const k = funnel ? n - 1 - i : i;
                const frac = 0.34 + 0.66 * (k + 1) / n, w = dw * frac, x = dx + (dw - w) / 2, y = top + i * (bh + gap);
                const color = i === n - 1 && n > 2 ? S.T.accent : wash(S.T.primary, n > 1 ? 0.5 * i / (n - 1) : 0);
                S.round(x, y, w, bh, { fill: color, r: 0.05 });
                S.text(x, y, w, bh, [P(it.lead || it.runs, r1(13.5 * S.ctx.sizeMul), { bold: true, color: onFill(color), align: 'center', after: 0 })], { valign: 'middle', min: 0.5, inset: 0.03 });
                if (it.detail && it.detail.length) {
                    S.line(x + w + 0.08, y + bh / 2, dx + dw + 0.3, y + bh / 2, { color: S.T.line, width: 1, dash: true });
                    S.text(dx + dw + 0.35, y, B.x + B.w - dx - dw - 0.35, bh, [P(it.detail, r1(13 * S.ctx.sizeMul), { after: 0, color: S.T.ink })], { valign: 'middle', min: 0.6 });
                }
            });
        },
        funnel: function (S, blocks, B, slide) { LAYOUT.pyramid(S, blocks, B, slide, true); },
        hierarchy: function (S, blocks, B) {
            const L = blocks.find(function (b) { return b.type === 'list'; });
            if (!L) return LAYOUT.bullets(S, blocks, B);
            // the tree: one level per list depth (up to 4), leaves spread evenly
            const roots = L.items.map(function toNode(it) {
                return { label: it.lead || it.runs, detail: it.detail || [], kids: it.children ? it.children.items.map(toNode) : [] };
            });
            const depth = function (nd) { return 1 + (nd.kids.length ? Math.max.apply(null, nd.kids.map(depth)) : 0); };
            const leaves = function (nd) { return nd.kids.length ? nd.kids.reduce(function (a, k) { return a + leaves(k); }, 0) : 1; };
            const D = Math.min(4, Math.max.apply(null, roots.map(depth))), nLeaves = roots.reduce(function (a, r) { return a + leaves(r); }, 0);
            const slot = B.w / nLeaves, bw = Math.min(2.3, slot - 0.16), bh = 0.66;
            const vgap = D > 1 ? Math.min(0.75, (B.h - bh * D) / (D - 1)) : 0, top = B.y + (B.h - (bh * D + vgap * (D - 1))) / 2;
            let leafAt = 0;
            const place = function (nd, level) {
                if (level >= D) return null;
                let cx;
                if (nd.kids.length && level < D - 1) {
                    const xs = nd.kids.map(function (k) { return place(k, level + 1); });
                    cx = (xs[0] + xs[xs.length - 1]) / 2;
                    const y = top + level * (bh + vgap), mid = y + bh + vgap / 2;
                    S.line(cx, y + bh, cx, mid, { color: S.T.muted, width: 1.25 });
                    if (xs.length > 1) S.line(xs[0], mid, xs[xs.length - 1], mid, { color: S.T.muted, width: 1.25 });
                    xs.forEach(function (x) { S.line(x, mid, x, mid + vgap / 2, { color: S.T.muted, width: 1.25 }); });
                } else { cx = B.x + slot * (leafAt + 0.5); leafAt += leaves(nd); if (nd.kids.length) cx = B.x + slot * (leafAt - leaves(nd) / 2); }
                const y = top + level * (bh + vgap), first = level === 0;
                const fill = first ? S.T.primary : level === 1 ? wash(S.T.primary, 0.82) : S.T.soft;
                S.round(cx - bw / 2, y, bw, bh, { fill: fill, line: first ? null : wash(S.T.primary, 0.55), lineW: 0.75 });
                const ps = [P(nd.label, r1(12.5 * S.ctx.sizeMul), { bold: true, align: 'center', after: 0, color: first ? onFill(fill) : S.T.ink, lh: 1.35 })];
                if (nd.detail.length) ps.push(P(nd.detail, r1(9.5 * S.ctx.sizeMul), { align: 'center', after: 0, color: first ? (isDark(fill) ? tint(fill, 0.8) : shade(fill, 0.65)) : S.T.muted, lh: 1.3 }));
                S.text(cx - bw / 2, y, bw, bh, ps, { valign: 'middle', min: 0.55, inset: 0.04 });
                return cx;
            };
            roots.forEach(function (r) { place(r, 0); });
        },
        matrix: function (S, blocks, B) {
            let cells = [];
            const L = blocks.find(function (b) { return b.type === 'list'; });
            const h3 = blocks.filter(function (b) { return b.type === 'h3'; });
            if (h3.length >= 4) {
                blocks.forEach(function (b) { if (b.type === 'h3') cells.push({ lead: b.runs, body: [] }); else if (cells.length) cells[cells.length - 1].body.push(b); });
            } else if (L) cells = L.items.map(function (it) { return { lead: it.lead || it.runs, body: it.detail && it.detail.length ? [{ type: 'para', runs: it.detail }] : [], icon: it.icon }; });
            cells = cells.slice(0, 4);
            if (!cells.length) return LAYOUT.bullets(S, blocks, B);
            const gap = 0.2, cw = (B.w - gap) / 2, ch = (B.h - gap) / 2;
            const fills = [S.T.primary, S.T.accent, wash(S.T.accent, 0.35), wash(S.T.primary, 0.35)];
            cells.forEach(function (c, i) {
                const x = B.x + (i % 2) * (cw + gap), y = B.y + Math.floor(i / 2) * (ch + gap), f = fills[i];
                S.round(x, y, cw, ch, { fill: f });
                const ink = onFill(f);
                const ps = [P(c.lead, r1(17 * S.ctx.sizeMul), { bold: true, color: ink, after: 6 })];
                c.body.forEach(function (b) { blockParas(S.ctx, b, r1(13 * S.ctx.sizeMul)).forEach(function (p) { ps.push(Object.assign(p, { color: ink })); }); });
                S.text(x + 0.2, y + 0.15, cw - 0.4, ch - 0.3, ps, { valign: 'middle' });
            });
        },
        venn: function (S, blocks, B) {
            const L = blocks.find(function (b) { return b.type === 'list'; });
            if (!L) return LAYOUT.bullets(S, blocks, B);
            const items = L.items.slice(0, 3), n = items.length;
            const common = blocks.filter(function (b) { return b !== L && b.type === 'para'; });
            const d = Math.min(B.h * (n === 3 ? 0.68 : 0.92), B.w * 0.42), cx = B.x + B.w / 2, cy = B.y + B.h / 2;
            const centers = n === 3
                ? [[cx - d * 0.3, cy - d * 0.22], [cx + d * 0.3, cy - d * 0.22], [cx, cy + d * 0.3]]
                : [[cx - d * 0.33, cy], [cx + d * 0.33, cy]];
            const fills = [S.T.primary, S.T.accent, wash(S.T.primary, 0.3)];
            items.forEach(function (it, i) {
                const c = centers[i];
                S.ellipse(c[0] - d / 2, c[1] - d / 2, d, d, { fill: fills[i], transparency: 30 });
            });
            items.forEach(function (it, i) {
                const c = centers[i], away = n === 3 ? [[-0.24, -0.16], [0.24, -0.16], [0, 0.24]][i] : [[-0.25, 0], [0.25, 0]][i];
                const x = c[0] + away[0] * d - d * 0.28, y = c[1] + away[1] * d - d * 0.25;
                const ink = onFill(fills[i]);
                const ps = [P(it.lead || it.runs, r1(14.5 * S.ctx.sizeMul), { bold: true, color: ink, align: 'center', after: 2 })];
                if (it.detail && it.detail.length) ps.push(P(it.detail, r1(10.5 * S.ctx.sizeMul), { color: ink, align: 'center', after: 0 }));
                S.text(x, y, d * 0.56, d * 0.5, ps, { valign: 'middle', min: 0.55, inset: 0.03 });
            });
            if (common.length) {
                const w = d * (n === 3 ? 0.42 : 0.36);
                S.text(cx - w / 2, (n === 3 ? cy + d * 0.02 : cy) - d * 0.17, w, d * 0.34,
                    [].concat.apply([], common.map(function (b) { return blockParas(S.ctx, b, r1(11 * S.ctx.sizeMul)); })).map(function (p) { return Object.assign(p, { align: 'center', bold: true, color: onFill(mix(S.T.primary, S.T.accent, 0.5)), after: 0 }); }),
                    { valign: 'middle', min: 0.5, inset: 0.02 });
            }
        }
    };

    /** A list of lead items with icons: one row each (icon, lead, detail); other blocks flow. */
    function featureList(S, blocks, x, y, w, h) {
        const L = blocks.find(function (b) { return isLeadList(b) && b.items.some(function (it) { return it.icon; }); });
        if (!L) return flow(S, blocks, x, y, w, h, r1(15 * S.ctx.sizeMul));
        const n = L.items.length, rh = Math.min(0.95, h / n), d = Math.min(0.48, rh - 0.12), top = y + (h - rh * n) / 2;
        L.items.forEach(function (it, i) {
            const yy = top + i * rh, color = i % 2 ? S.T.accent : S.T.primary;
            if (it.icon) S.icon(it.icon, x, yy + (rh - d) / 2, d, color);
            const ps = [P(it.lead, r1(14.5 * S.ctx.sizeMul), { bold: true, color: S.T.ink, after: 0 })];
            if (it.detail && it.detail.length) ps.push(P(it.detail, r1(12 * S.ctx.sizeMul), { color: S.T.muted, after: 0 }));
            S.text(x + d + 0.14, yy, w - d - 0.14, rh, ps, { valign: 'middle' });
        });
        return h;
    }

    function layContent(S, slide) {
        const ctx = S.ctx;
        S.bg = slideBg(ctx, slide, ctx.T.white);
        const B = frame(S, slide);
        const blocks = slide.blocks.filter(function (b) { return b.type !== 'alert'; });
        const alerts = slide.blocks.filter(function (b) { return b.type === 'alert'; });
        if (alerts.length > 1) S.warn.push({ code: 'alerts' });
        if (alerts.length) {
            const ah = layAlert(S, alerts[0], 0, 0, B.w, true);
            layAlert(S, alerts[0], B.x, B.y + B.h - ah, B.w);
            B.h -= ah + 0.2;
        }
        let name = autoLayout(slide, blocks, ctx);
        // a layout that would leave content out (a chart under a statement): the content decides, with a warning
        const fits = { statement: ['para'], quote: ['quote', 'para'] }[name];
        if (fits && slide.layout && blocks.some(function (b) { return fits.indexOf(b.type) < 0; })) {
            S.warn.push({ code: 'layout-content', arg: name });
            const keep = slide.layout; slide.layout = null;
            name = autoLayout(slide, blocks, ctx);
            if (name === keep) name = 'bullets';
            slide.layout = keep;
        }
        slide.used = name;
        if (name === 'bullets' && blocks.some(function (b) { return isLeadList(b) && b.items.some(function (it) { return it.icon; }); })) {
            featureList(S, blocks, B.x, B.y, B.w, B.h);
            slide.used = 'bullets icons';
        } else (LAYOUT[name] || LAYOUT.bullets)(S, blocks, B, slide);
        blocks.forEach(function (b) {
            if (b.type === 'list' && (name === 'bullets' || name === 'columns') && b.items.length > ctx.cfg.maxBullets) S.warn.push({ code: 'bullets', arg: b.items.length });
        });
    }

    function slideBg(ctx, slide, fallback) {
        const bg = slide.style.bg;
        if (!bg) return fallback;
        if (bg === 'dark') return ctx.T.dark;
        if (bg === 'light') return isDark(ctx.T.bg) ? 'FFFFFF' : ctx.T.bg;
        if (bg === 'soft') return ctx.T.soft;
        if (bg === 'primary') return ctx.T.primary;
        if (bg === 'accent') return ctx.T.accent;
        return hex(bg) || fallback;
    }

    /** The title slide (first H1) and the section / closing slides (later H1s). */
    function layTitle(S, slide, isTitle) {
        const ctx = S.ctx, T = ctx.T, W = S.W, H = S.H, light = ctx.cfg.titleStyle === 'light';
        S.bg = slideBg(ctx, slide, light ? T.bg : T.dark);
        const dark = isDark(S.bg);
        const ink = dark ? 'FFFFFF' : T.ink, sub = dark ? tint(T.accent, 0.45) : T.accent, muted = dark ? mix(T.dark, 'FFFFFF', 0.7) : T.muted;
        S.showNum = false;
        if (T.decoration === 'steps') pyramid(S, W - 1.75, H - 0.55, T.accent);
        else if (T.decoration === 'bar') S.rect(0, 0, 0.22, H, { fill: T.accent, deco: true });
        const paras = slide.blocks.filter(function (b) { return b.type === 'para'; });
        const ty = isTitle ? H * 0.22 : H * 0.3;
        if (!isTitle && ctx.cfg.sectionNumbers && slide.section) {
            S.text(0.8, ty - 0.55, 3, 0.5, [P([{ t: String(slide.section).padStart(2, '0') }], 20, { bold: true, color: T.accent, after: 0, ltr: true })], { valign: 'bottom', noFit: true, inset: 0.02 });
        }
        S.text(0.8, ty, W * 0.66, 1.15, [P(slide.title, isTitle ? 40 : 34, { bold: true, color: ink, after: 0, lh: 1.35 })], { valign: 'bottom', min: 0.55, role: 'title' });
        S.rect(0.88, ty + 1.25, 0.9, 0.05, { fill: T.accent, deco: true });
        const lines = paras.map(function (b, k) { return P(b.runs, k === 0 ? (isTitle ? 18 : 16) : 12, { color: k === 0 ? sub : muted, after: k === 0 ? 8 : 4 }); });
        const has = function (t) { return lines.some(function (p) { return runsText(p.runs).trim() === String(t).trim(); }); };
        if (isTitle) {
            // front matter: presenter: → "Presenter: …" (the label in the deck's language); author and date on one line
            const pr = ctx.meta.presenter;
            if (pr && !has(pr)) lines.push(P([{ t: ctx.labels.presenter + ': ', b: true }, { t: String(pr) }], 13, { color: dark ? 'FFFFFF' : T.ink, after: 4 }));
            const extra = [ctx.meta.author, ctx.meta.date].filter(function (v) { return v && v !== pr; }).join(' · ');
            if (extra && !has(extra)) lines.push(P([{ t: extra }], 12, { color: muted, after: 0 }));
        }
        // the closing slide: how to reach the presenter (front matter contact:)
        if (slide.closing && ctx.meta.contact && !has(ctx.meta.contact)) lines.push(P([{ t: String(ctx.meta.contact) }], 13, { color: dark ? 'FFFFFF' : T.ink, after: 0 }));
        // the brand line (front matter tagline:) at the foot of the title and closing slides
        const tag = (isTitle || slide.closing) && ctx.meta.tagline ? String(ctx.meta.tagline) : '';
        if (lines.length) S.text(0.8, ty + 1.42, W * 0.66, H - ty - 1.42 - (tag ? 0.85 : 0.5), lines);
        if (tag) S.text(0.8, H - 0.78, W * 0.66, 0.36, [P([{ t: tag, i: true }], 12, { color: sub, after: 0 })], { valign: 'middle', noFit: true, inset: 0.02 });
        if (ctx.classification && (isTitle || slide.closing)) classBadge(S, W - 1.7, 0.42, dark);
        // a picture under the heading (a logo): over the title, at its start, as tall as 0.8 in
        const pics = slide.blocks.filter(function (b) { return b.type === 'image'; });
        const logo = pics.length ? null : (ctx.logo && (isTitle || ctx.logoAll) ? { type: 'image', src: ctx.logo.src, alt: 'Logo', nw: ctx.logo.nw, nh: ctx.logo.nh } : null);
        if (pics.length || logo) {
            const lh = Math.min(0.8, ty - 0.3), b = pics[0] || logo;
            const lw = b.nw && b.nh ? Math.min(2.6, lh * b.nw / b.nh) : lh;
            S.image(0.8, Math.max(0.25, ty - (isTitle ? 0.25 : 0.65) - lh), lw, lh, b, { logo: true });
        }
        if (pics.length > 1 || slide.blocks.some(function (b) { return b.type !== 'para' && b.type !== 'image'; })) S.warn.push({ code: 'title-blocks' });
    }

    // ── the deck: sections, agenda, long slides split ────────────────────────

    function countLines(list) { return list.items.reduce(function (a, it) { return a + 1 + (it.children ? countLines(it.children) : 0); }, 0); }

    function prepareDeck(deck, ctx) {
        const cfg = ctx.cfg, L = ctx.labels;
        let section = 0;
        const last = deck.slides[deck.slides.length - 1];
        if (last && last.kind === 'section' && deck.slides.length > 1) last.closing = true;     // the last H1: a closing slide
        deck.slides.forEach(function (s) { if (s.kind === 'section' && !s.closing) s.section = ++section; });
        const out = [];
        deck.slides.forEach(function (s, idx) {
            if (s.layout === 'agenda' && !s.blocks.some(function (b) { return b.type === 'list'; })) {
                const later = deck.slides.slice(idx + 1);
                let src = later.filter(function (x) { return x.kind === 'section' && !x.closing; });
                if (!src.length) src = later.filter(function (x) { return x.kind === 'content'; });
                s.agenda = src.slice(0, 10).map(function (x) { return { lead: x.title, detail: [] }; });
            }
            const splittable = s.kind === 'content' && cfg.split && (!s.layout || s.layout === 'bullets' || s.layout === 'table');
            const lists = s.blocks.filter(function (b) { return b.type === 'list'; });
            const tables = s.blocks.filter(function (b) { return b.type === 'table'; });
            const others = s.blocks.filter(function (b) { return b.type !== 'list' && b.type !== 'para' && b.type !== 'alert' && b.type !== 'h3'; });
            if (splittable && lists.length === 1 && !tables.length && !others.length && countLines(lists[0]) > cfg.maxBullets &&
                !(s.blocks.length === 1 && isLeadList(lists[0]))) {
                const list = lists[0], at = s.blocks.indexOf(list), chunks = [];
                let cur = [], lines = 0;
                list.items.forEach(function (it) {
                    const n = 1 + (it.children ? countLines(it.children) : 0);
                    if (cur.length && lines + n > cfg.maxBullets) { chunks.push(cur); cur = []; lines = 0; }
                    cur.push(it); lines += n;
                });
                if (cur.length) chunks.push(cur);
                let start = list.start;
                chunks.forEach(function (items, k) {
                    const part = Object.assign({}, list, { items: items, start: start });
                    start += items.length;
                    const blocks = (k === 0 ? s.blocks.slice(0, at) : []).concat([part]).concat(k === chunks.length - 1 ? s.blocks.slice(at + 1) : []);
                    out.push(Object.assign({}, s, { blocks: blocks, notes: k ? [] : s.notes, warn: k ? [] : s.warn,
                        title: k ? s.title.concat([{ t: ' ' + L.continued }]) : s.title, continued: k > 0 }));
                });
                return;
            }
            if (splittable && tables.length === 1 && lists.length === 0 && tables[0].rows.length > cfg.maxRows) {
                const t = tables[0], at = s.blocks.indexOf(t), n = Math.ceil(t.rows.length / cfg.maxRows), per = Math.ceil(t.rows.length / n);
                for (let k = 0; k < n; k++) {
                    const part = Object.assign({}, t, { rows: t.rows.slice(k * per, (k + 1) * per) });
                    const blocks = (k === 0 ? s.blocks.slice(0, at) : []).concat([part]).concat(k === n - 1 ? s.blocks.slice(at + 1) : []);
                    out.push(Object.assign({}, s, { blocks: blocks, notes: k ? [] : s.notes, warn: k ? [] : s.warn,
                        title: k ? s.title.concat([{ t: ' ' + L.continued }]) : s.title, continued: k > 0 }));
                }
                return;
            }
            out.push(s);
        });
        deck.slides = out;
        return deck;
    }

    /** Mirror a right-to-left slide: every x, table columns, directional shapes. */
    function mirror(S) {
        const W = S.W;
        S.shapes.forEach(function (s) {
            if (s.t === 'line') { s.x1 = r3(W - s.x1); s.x2 = r3(W - s.x2); return; }
            s.x = r3(W - s.x - s.w);
            if (s.dirShape) s.flipH = !s.flipH;
            if (s.t === 'table') { s.colW = s.colW.slice().reverse(); s.rows = s.rows.map(function (r) { return r.slice().reverse(); }); }
            if (s.t === 'chart') s.rtl = true;
        });
    }

    /** Each paragraph's direction (BidiCore) and side (start/end → right/left by the deck). */
    function resolveDirections(S, rtl) {
        const deck = rtl ? 'rtl' : 'ltr';
        const fix = function (p, listDir) {
            const t = runsText(p.runs);
            p.dir = p.ltr ? 'ltr' : p.forceRtl ? 'rtl' : p.bullet && listDir ? listDir : textDir(t, deck);
            const start = rtl ? 'right' : 'left', end = rtl ? 'left' : 'right';
            p.alignX = p.align === 'start' ? start : p.align === 'end' ? end : p.align;
        };
        S.shapes.forEach(function (s) {
            if (s.t === 'text') {
                // a list keeps one direction (the bullets on one side): its items' direction when they all
                // agree, the deck's when they are mixed (Persian sources among English ones)
                const bullets = s.paras.filter(function (p) { return p.bullet; });
                const dirs = Array.from(new Set(bullets.map(function (p) { return textDir(runsText(p.runs), deck); })));
                const listDir = bullets.length ? (dirs.length === 1 ? dirs[0] : deck) : null;
                s.paras.forEach(function (p) { fix(p, listDir); });
            }
            if (s.t === 'table') s.rows.forEach(function (r) { r.forEach(function (c) { const p = { runs: c.runs, align: c.align }; fix(p); c.dir = p.dir; c.alignX = p.alignX; }); });
        });
    }

    /** The layout model: every slide's shapes, notes and warnings. */
    function layoutDeck(deck, cfg, o) {
        const meta = deck.meta || {};
        const T = themeOf(cfg, meta);
        CT = T;
        const aspect = String(meta.aspect || cfg.aspect) === '4:3' ? '4:3' : '16:9';
        const dir = o.dir;
        const ctx = {
            cfg: cfg, T: T, W: 10, H: aspect === '4:3' ? 7.5 : 5.625, aspect: aspect, meta: meta, dir: dir,
            sizeMul: SIZES[cfg.size] || 1,
            labels: (function () {
                // the words by the deck's language: Arabic among the right-to-left decks takes its own
                const ar = dir === 'rtl' && langOf(deck.slides.map(function (s) { return runsText(s.title || []); }).join(' '), 'ar-SA') === 'ar-SA';
                const key = ar ? 'ar' : dir, L = cfg.labels || {};
                return Object.assign({}, LABELS[key], (L.rtl || L.ltr || L.ar) ? (L[key] || L[dir] || {}) : L);
            })(),
            footer: meta.footer != null ? meta.footer : cfg.footer != null ? cfg.footer : (o.title || ''),
            bullets: bulletOf(meta.bullet || cfg.bullet),
            logo: o.logo && cfg.logo !== 'none' ? o.logo : null,           // { src, nw, nh }
            logoAll: cfg.logo !== 'cover',
            classification: meta.classification ? String(meta.classification) : ''
        };
        prepareDeck(deck, ctx);
        const slides = deck.slides.map(function (slide, i) {
            const S = new Slide(ctx);
            S.kind = slide.kind;
            S.notes = slide.notes.join('\n\n').trim();
            if (slide.kind === 'title') { layTitle(S, slide, true); slide.used = 'title'; }
            else if (slide.kind === 'section') { layTitle(S, slide, false); slide.used = 'section'; }
            else layContent(S, slide);
            S.warn = slide.warn.concat(S.warn);
            S.layout = slide.used;
            S.title = runsText(slide.title);
            S.titleRuns = slide.title;
            S.hidden = !!slide.style.hidden;
            if (slide.style.number === 'off') S.showNum = false;
            if (!cfg.numbers) S.showNum = false;
            S.index = i + 1;
            if (dir === 'rtl') mirror(S);
            resolveDirections(S, dir === 'rtl');
            return S;
        });
        return { slides: slides, W: ctx.W, H: ctx.H, aspect: aspect, dir: dir, theme: T, meta: meta, footer: ctx.footer, labels: ctx.labels };
    }

    function themeOf(cfg, meta) {
        const base = THEMES[themeName(meta.theme)] || THEMES[themeName(cfg.theme)] || THEMES['modern-emerald'];
        const T = Object.assign({}, base);
        T.white = T.bg;                                    // the content slides' background
        const p = hex(meta.primary) || hex(cfg.primary), a = hex(meta.accent) || hex(cfg.accent);
        if (p) { T.primary = p; T.soft = mix(p, T.bg, 0.93); T.line = mix(p, T.bg, 0.78); }
        if (a) T.accent = a;
        const d = String(meta.decoration || (cfg.decoration !== 'auto' && cfg.decoration) || '').toLowerCase();
        if (/^(steps|bar|none)$/.test(d)) T.decoration = d;
        return T;
    }

    // =========================================================================
    // 5. Preview: the model as positioned HTML (container units: it scales)
    // =========================================================================

    const PREVIEW_CSS = [
        '.kelk-slides{display:flex;flex-direction:column;gap:18px}',
        '.kelk-slide-wrap{display:flex;flex-direction:column;gap:6px}',
        '.kelk-slide-meta{display:flex;gap:8px;align-items:baseline;font-size:12px;opacity:.75;flex-wrap:wrap}',
        '.kelk-slide-meta code{font:11px ui-monospace,Consolas,monospace;border:1px solid rgba(127,127,127,.35);border-radius:4px;padding:0 5px}',
        '.kelk-slide-meta .w{color:#b26b00}',
        '.kelk-slide{position:relative;width:100%;overflow:hidden;container-type:inline-size;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,.12),0 4px 14px rgba(0,0,0,.06);color:#000;line-height:1.6}',
        '.kelk-slide.hidden-slide{opacity:.55}',
        '.kelk-slide .s{position:absolute;box-sizing:border-box}',
        '.kelk-slide .tx{display:flex;flex-direction:column;overflow:visible}',
        '.kelk-slide .tx.of{background:repeating-linear-gradient(45deg,rgba(208,138,42,.16) 0 6px,transparent 6px 12px)}',
        '.kelk-slide .p{margin:0;white-space:pre-wrap;overflow-wrap:break-word}',
        '.kelk-slide .p:last-child{margin-bottom:0!important}',
        '.kelk-slide .bu{display:inline-block;text-indent:0}',
        '.kelk-slide .ph{display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center}',
        '.kelk-slide img.s{object-fit:contain}',
        '.kelk-slide table.s{border-collapse:collapse;table-layout:fixed}',
        '.kelk-slide table.s td{vertical-align:middle;line-height:1.45}',
        '.kelk-slide svg.s{overflow:visible}',
        '.kelk-slide-notes{font-size:12px;opacity:.85}',
        '.kelk-slide-notes summary{cursor:pointer;width:max-content}',
        '.kelk-slide-notes div{white-space:pre-wrap;padding:6px 10px;border-inline-start:2px solid rgba(127,127,127,.35);margin-top:4px}'
    ].join('\n');

    function previewHtml(model, o) {
        o = o || {};
        const W = model.W, H = model.H;
        const cq = function (v) { return (v / W * 100).toFixed(3) + 'cqw'; };
        const cqPt = function (pt) { return (pt / 72 / W * 100).toFixed(3) + 'cqw'; };
        const fonts = model.fonts || {};
        const fam = function (rtlText, mono) {
            // single quotes: the value goes into a style="…" attribute
            const q = function (n) { return "'" + String(n || '').replace(/['"<>]/g, '') + "'"; };
            if (mono) return q(fonts.code || 'Consolas') + ',Consolas,monospace';
            const f = rtlText ? (o.bidi || fonts.bidi) : (o.latin || fonts.latin);
            return q(f) + ',' + q(o.bidi || fonts.bidi || 'Vazirmatn') + ',Vazirmatn,Tahoma,sans-serif';
        };
        const T = model.theme;
        const runHtml = function (r, p) {
            if (r.eq) {                     // an inline equation: its picture, sized in em of the text around it
                const em = function (px) { return (px * 0.75 / r.eq.base).toFixed(3) + 'em'; };
                return '<img alt="' + esc(r.eq.tex) + '" src="' + esc(r.eq.src) + '" style="height:' + em(r.eq.h) + ';width:' + em(r.eq.w) + ';vertical-align:-' + em(r.eq.depth) + ';display:inline">';
            }
            let st = '';
            if (r.b) st += 'font-weight:700;';
            if (r.i) st += 'font-style:italic;';
            if (r.s || r.u) st += 'text-decoration:' + (r.s ? 'line-through ' : '') + (r.u ? 'underline' : '') + ';';
            if (r.code || p.mono) st += 'font-family:' + fam(false, true) + ';';
            if (r.code && !p.mono) st += 'background:rgba(127,127,127,.14);border-radius:3px;padding:0 .2em;direction:ltr;unicode-bidi:isolate;';
            if (r.color) st += 'color:#' + r.color + ';';
            if (r.sup || r.sub) st += 'font-size:70%;vertical-align:' + (r.sup ? 'super' : 'sub') + ';';
            if (r.hl) st += 'background:#FFF59D;';
            const inner = '<span style="' + st + '">' + esc(r.t) + '</span>';
            return r.link ? '<a href="' + esc(r.link) + '" target="_blank" rel="noopener" style="color:#' + T.primary + ';text-decoration:underline">' + inner + '</a>' : inner;
        };
        const paraHtml = function (p) {
            const ind = p.bullet ? bulletIndent(p) : 0;
            let st = 'font-size:' + cqPt(p.size) + ';color:#' + (p.color || T.ink) + ';text-align:' + p.alignX + ';margin-bottom:' + cqPt(p.after || 0) +
                ';line-height:' + (p.lh || LH) + ';font-family:' + fam(p.dir === 'rtl' || hasRtl(runsText(p.runs)), p.mono) + ';';
            if (p.bold) st += 'font-weight:700;';
            if (ind) st += 'padding-inline-start:' + cqPt(ind * (p.level + 1)) + ';text-indent:-' + cqPt(ind) + ';';
            const bu = p.bullet ? '<span class="bu" style="width:' + cqPt(ind) + '">' + (typeof p.bullet === 'string' ? esc(p.bullet) : p.bullet.num + '.') + '</span>' : '';
            let body = p.runs.map(function (r) { return r.t === '\n' ? '\n' : runHtml(r, p); }).join('') || '&nbsp;';
            // a line in the other direction than its list (an English item in a Persian list): isolated, so the bullet stays put
            if (p.bullet && textDir(runsText(p.runs), p.dir) !== p.dir) body = '<bdi dir="auto">' + body + '</bdi>';
            return '<p class="p" dir="' + p.dir + '" style="' + st + '">' + bu + body + '</p>';
        };
        const shapeHtml = function (sh) {
            const pos = 'left:' + cq(sh.x) + ';top:' + cq(sh.y) + ';width:' + cq(sh.w) + ';height:' + cq(sh.h) + ';';
            switch (sh.t) {
                case 'shape': {
                    let st = pos + 'background:' + (sh.fill ? '#' + sh.fill : 'transparent') + ';';
                    if (sh.transparency) st += 'opacity:' + (1 - sh.transparency / 100) + ';';
                    if (sh.line) st += 'border:' + cqPt(sh.lineW || 0.75) + ' ' + (sh.dash ? 'dashed' : 'solid') + ' #' + sh.line + ';';
                    if (sh.shape === 'ellipse') st += 'border-radius:50%;';
                    else if (sh.shape === 'roundRect') st += 'border-radius:' + cq(Math.min(sh.r || 0.08, sh.h / 2, sh.w / 2)) + ';';
                    const clip = {
                        chevron: 'polygon(0 0,82% 0,100% 50%,82% 100%,0 100%,18% 50%)',
                        homePlate: 'polygon(0 0,82% 0,100% 50%,82% 100%,0 100%)',
                        downArrow: 'polygon(30% 0,70% 0,70% 50%,100% 50%,50% 100%,0 50%,30% 50%)'
                    }[sh.shape];
                    if (clip) st += 'clip-path:' + clip + ';' + (sh.flipH ? 'transform:scaleX(-1);' : '');
                    return '<div class="s" style="' + st + '"></div>';
                }
                case 'line': {
                    const x = Math.min(sh.x1, sh.x2), y = Math.min(sh.y1, sh.y2), w = Math.abs(sh.x2 - sh.x1), h = Math.abs(sh.y2 - sh.y1);
                    const px = function (v) { return (v * 100).toFixed(1); };
                    const id = 'a' + Math.random().toString(36).slice(2, 8);
                    return '<svg class="s" style="left:' + cq(x) + ';top:' + cq(y) + ';width:' + cq(Math.max(w, 0.001)) + ';height:' + cq(Math.max(h, 0.001)) + '" viewBox="' +
                        (x * 100).toFixed(1) + ' ' + (y * 100).toFixed(1) + ' ' + Math.max(w * 100, 0.1).toFixed(1) + ' ' + Math.max(h * 100, 0.1).toFixed(1) + '" preserveAspectRatio="none">' +
                        (sh.arrow ? '<defs><marker id="' + id + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#' + sh.color + '"/></marker></defs>' : '') +
                        '<line x1="' + px(sh.x1) + '" y1="' + px(sh.y1) + '" x2="' + px(sh.x2) + '" y2="' + px(sh.y2) + '" stroke="#' + sh.color + '" stroke-width="' + (sh.width || 1) * 100 / 72 + '"' +
                        (sh.dash ? ' stroke-dasharray="4 3"' : '') + ' vector-effect="non-scaling-stroke" style="stroke-width:' + cqPt(sh.width || 1) + '"' + (sh.arrow ? ' marker-end="url(#' + id + ')"' : '') + '/></svg>';
                }
                case 'text': {
                    const jc = sh.valign === 'middle' ? 'center' : sh.valign === 'bottom' ? 'flex-end' : 'flex-start';
                    return '<div class="s tx" data-pad="' + sh.inset + '" style="' + pos + 'padding:' + cq(sh.inset) + ';justify-content:' + jc + ';' +
                        (sh.fill ? 'background:#' + sh.fill + ';' : '') + '"><div class="in">' + sh.paras.map(paraHtml).join('') + '</div></div>';
                }
                case 'image': {
                    if (sh.data || sh.preview) {
                        const b = sh.nw ? contain(sh, sh.nw, sh.nh) : sh;
                        return '<img class="s" alt="' + esc(sh.alt) + '" src="' + esc(sh.preview || sh.data) + '" style="left:' + cq(b.x) + ';top:' + cq(b.y) + ';width:' + cq(b.w) + ';height:' + cq(b.h) + '">';
                    }
                    if (sh.icon) return '';
                    return '<div class="s ph" style="' + pos + 'background:#' + T.soft + ';border:' + cqPt(1.25) + ' dashed #' + T.muted + ';border-radius:' + cq(0.08) +
                        ';color:#' + T.muted + ';font-size:' + cqPt(12) + ';padding:' + cq(0.12) + ';font-family:' + fam(true) + '"><div>' + esc(model.labels.image) + '</div>' + (sh.caption ? '' : '<div style="font-size:' + cqPt(10) + '">' + esc(sh.alt) + '</div>') + '</div>';
                }
                case 'table': {
                    const rows = sh.rows.map(function (r) {
                        return '<tr>' + r.map(function (c, k) {
                            return '<td dir="' + c.dir + '" style="width:' + cq(sh.colW[k]) + ';background:#' + c.fill + ';color:#' + c.color + ';' + (c.bold ? 'font-weight:700;' : '') +
                                'text-align:' + c.alignX + ';font-size:' + cqPt(sh.size) + ';padding:' + cq(0.05) + ' ' + cq(0.08) + ';border:' + cqPt(0.75) + ' solid #' + sh.border +
                                ';font-family:' + fam(c.dir === 'rtl') + '">' + c.runs.map(function (x) { return x.t === '\n' ? '<br>' : runHtml(x, { size: sh.size }); }).join('') + '</td>';
                        }).join('') + '</tr>';
                    }).join('');
                    return '<table class="s" style="left:' + cq(sh.x) + ';top:' + cq(sh.y) + ';width:' + cq(sh.w) + '">' + rows + '</table>';
                }
                case 'chart': return chartSvg(sh, cq, cqPt, fam, T);
            }
            return '';
        };
        const warnText = o.warnText || function (w) { return WARNINGS[w.code] ? WARNINGS[w.code].replace('{0}', w.arg == null ? '' : w.arg) : w.code; };
        const inner = function (S, i) {
            const num = S.showNum ? '<div class="s" style="left:' + cq(model.dir === 'rtl' ? 0.5 : W - 1.1) + ';top:' + cq(H - 0.42) + ';width:' + cq(0.6) + ';height:' + cq(0.3) +
                ';font-size:' + cqPt(8) + ';color:#' + T.muted + ';display:flex;align-items:center;justify-content:' + (model.dir === 'rtl' ? 'flex-start' : 'flex-end') + ';font-family:' + fam(false) + '">' + (i + 1) + '</div>' : '';
            return S.shapes.map(shapeHtml).join('') + num;
        };
        if (o.only != null) return inner(model.slides[o.only], o.only);
        const eager = o.eager == null ? Infinity : o.eager;
        return '<div class="kelk-slides" dir="' + (o.uiDir || model.dir) + '">' + model.slides.map(function (S, i) {
            const warns = S.warn.length ? ' <span class="w">⚠ ' + esc(Array.from(new Set(S.warn.map(warnText))).join(' · ')) + '</span>' : '';
            const lazy = i >= eager;
            return '<div class="kelk-slide-wrap" data-slide="' + i + '">' +
                '<div class="kelk-slide-meta"><b>' + (i + 1) + '</b><span dir="auto">' + esc(S.title) + '</span><code>' + esc(S.layout) + '</code>' + (S.hidden ? '<code>hidden</code>' : '') + warns + '</div>' +
                '<div class="kelk-slide' + (S.hidden ? ' hidden-slide' : '') + '" data-i="' + i + '"' + (lazy ? ' data-lazy="1"' : '') + ' dir="ltr" style="aspect-ratio:' + W + '/' + H + ';background:#' + S.bg + '">' +
                (lazy ? '' : inner(S, i)) + '</div>' +
                (S.notes && o.notes !== false ? '<details class="kelk-slide-notes"><summary>' + esc(o.notesLabel || 'Speaker notes') + '</summary><div dir="auto">' + esc(S.notes) + '</div></details>' : '') +
                '</div>';
        }).join('') + '</div>';
    }

    function contain(sh, nw, nh) {
        const k = Math.min(sh.w / nw, sh.h / nh), w = nw * k, h = nh * k;
        return { x: sh.x + (sh.w - w) / 2, y: sh.y + (sh.h - h) / 2, w: w, h: h };
    }

    /** A simple SVG drawing of a native chart, for the preview only. */
    function chartSvg(sh, cq, cqPt, fam, T) {
        const W = sh.w * 100, H = sh.h * 100, data = sh.data, kind = sh.kind, cols = sh.colors;
        const rtl = !!sh.rtl;
        let g = '';
        const txt = function (x, y, s, size, anchor, color, bold) {
            return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" font-size="' + size + '" text-anchor="' + anchor + '" fill="#' + (color || T.muted) + '"' + (bold ? ' font-weight="700"' : '') +
                ' style="font-family:' + fam(hasRtl(s)) + '">' + esc(s) + '</text>';
        };
        const top = sh.title ? 26 : 8;
        if (sh.title) g += txt(W / 2, 16, sh.title, 13, 'middle', T.ink, true);
        const legend = data.length > 1 || kind === 'pie' || kind === 'doughnut';
        const bottom = H - (legend ? 26 : 6);
        if (kind === 'pie' || kind === 'doughnut') {
            const s0 = data[0], tot = s0.values.reduce(function (a, v) { return a + Math.max(0, v); }, 0) || 1;
            const r = Math.min(W, bottom - top) / 2 - 4, cx = W / 2, cy = top + (bottom - top) / 2;
            let a = -Math.PI / 2;
            s0.values.forEach(function (v, i) {
                const da = Math.max(0, v) / tot * 2 * Math.PI * (rtl ? -1 : 1), b = a + da;
                const large = Math.abs(da) > Math.PI ? 1 : 0, sweep = rtl ? 0 : 1;
                g += '<path d="M' + cx + ' ' + cy + 'L' + (cx + r * Math.cos(a)).toFixed(1) + ' ' + (cy + r * Math.sin(a)).toFixed(1) + 'A' + r + ' ' + r + ' 0 ' + large + ' ' + sweep + ' ' +
                    (cx + r * Math.cos(b)).toFixed(1) + ' ' + (cy + r * Math.sin(b)).toFixed(1) + 'Z" fill="#' + cols[i % cols.length] + '" stroke="#' + T.bg + '" stroke-width="1.5"/>';
                const m = (a + b) / 2, pr = kind === 'doughnut' ? r * 0.78 : r * 0.62;
                if (Math.abs(da) > 0.25) g += txt(cx + pr * Math.cos(m), cy + pr * Math.sin(m) + 4, Math.round(v / tot * 100) + '%', 10, 'middle', onFill(cols[i % cols.length]), true);
                a = b;
            });
            if (kind === 'doughnut') g += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * 0.55).toFixed(1) + '" fill="#' + T.bg + '"/>';
            g += legendSvg(s0.labels.map(function (l, i) { return [l, cols[i % cols.length]]; }), W, H, txt, rtl);
        } else {
            const labels = data[0].labels, n = labels.length;
            const stacked = sh.opts.stacked || sh.opts.percent;
            let max = 0, min = 0;
            for (let i = 0; i < n; i++) {
                if (stacked) max = Math.max(max, data.reduce(function (a, s) { return a + Math.max(0, s.values[i]); }, 0));
                else data.forEach(function (s) { max = Math.max(max, s.values[i]); min = Math.min(min, s.values[i]); });
            }
            if (sh.opts.percent) max = 100;
            max = max || 1;
            const horiz = kind === 'bar', left = horiz ? 70 : 34, x0 = rtl && !horiz ? 8 : left, x1 = rtl && !horiz ? W - left : W - 8;
            const pw = x1 - x0, ph = bottom - 18 - top, base = top + ph;
            const vx = function (v) { return (v - min) / (max - min) ; };
            // grid
            for (let k = 0; k <= 4; k++) {
                if (horiz) { const x = rtl ? x1 - pw * k / 4 : x0 + pw * k / 4; g += '<line x1="' + x + '" y1="' + top + '" x2="' + x + '" y2="' + base + '" stroke="#' + T.line + '"/>'; }
                else { const y = base - ph * k / 4; g += '<line x1="' + x0 + '" y1="' + y + '" x2="' + x1 + '" y2="' + y + '" stroke="#' + T.line + '"/>' + txt(rtl ? x1 + 4 : x0 - 4, y + 3, String(r1(min + (max - min) * k / 4)), 9, rtl ? 'start' : 'end'); }
            }
            const slot = (horiz ? ph : pw) / n;
            for (let i = 0; i < n; i++) {
                const ci = rtl && !horiz ? n - 1 - i : i;
                const c0 = (horiz ? top : x0) + slot * ci;
                if (horiz) g += txt(rtl ? x1 + 4 : x0 - 4, c0 + slot / 2 + 3, labels[i], 9, rtl ? 'start' : 'end');
                else g += txt(c0 + slot / 2, base + 13, labels[i], 9, 'middle');
                if (kind === 'line' || kind === 'area' || kind === 'radar') continue;
                let acc = 0;
                const tot = data.reduce(function (a, s) { return a + Math.max(0, s.values[i]); }, 0) || 1;
                data.forEach(function (s, k) {
                    let v = s.values[i]; if (sh.opts.percent) v = v / tot * 100;
                    const bw = stacked ? slot * 0.6 : slot * 0.7 / data.length, off = stacked ? slot * 0.2 : slot * 0.15 + bw * k;
                    const len = vx(v) * (horiz ? pw : ph), from = stacked ? vx(acc + min) * (horiz ? pw : ph) : 0;
                    if (horiz) { const x = rtl ? x1 - from - len : x0 + from; g += '<rect x="' + x.toFixed(1) + '" y="' + (c0 + off).toFixed(1) + '" width="' + len.toFixed(1) + '" height="' + bw.toFixed(1) + '" fill="#' + cols[k] + '"/>'; }
                    else g += '<rect x="' + (c0 + off).toFixed(1) + '" y="' + (base - from - len).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + len.toFixed(1) + '" fill="#' + cols[k] + '"/>';
                    if (sh.opts.labels && !stacked) g += horiz ? txt(rtl ? x1 - len - 4 : x0 + len + 4, c0 + off + bw / 2 + 3, String(s.values[i]), 9, rtl ? 'end' : 'start', T.ink)
                        : txt(c0 + off + bw / 2, base - len - 4, String(s.values[i]), 9, 'middle', T.ink);
                    acc += Math.max(0, v);
                });
            }
            if (kind === 'line' || kind === 'area' || kind === 'radar') {
                data.forEach(function (s, k) {
                    const pts = s.values.map(function (v, i) { const ci = rtl ? n - 1 - i : i; return [x0 + slot * ci + slot / 2, base - vx(v) * ph]; });
                    const d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('');
                    if (kind === 'area') g += '<path d="' + d + 'L' + pts[pts.length - 1][0].toFixed(1) + ' ' + base + 'L' + pts[0][0].toFixed(1) + ' ' + base + 'Z" fill="#' + cols[k] + '" opacity=".55"/>';
                    g += '<path d="' + d + '" fill="none" stroke="#' + cols[k] + '" stroke-width="2.5"/>';
                    pts.forEach(function (p) { g += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="#' + cols[k] + '"/>'; });
                });
            }
            if (data.length > 1) g += legendSvg(data.map(function (s, k) { return [s.name, cols[k]]; }), W, H, txt, rtl);
        }
        return '<svg class="s" style="left:' + cq(sh.x) + ';top:' + cq(sh.y) + ';width:' + cq(sh.w) + ';height:' + cq(sh.h) + '" viewBox="0 0 ' + W.toFixed(1) + ' ' + H.toFixed(1) + '">' + g + '</svg>';
    }
    function legendSvg(items, W, H, txt, rtl) {
        let g = '', x = 0;
        const parts = items.map(function (it) { const w = 16 + it[0].length * 6.2 + 12; return [it, w]; });
        const total = parts.reduce(function (a, p) { return a + p[1]; }, 0);
        x = (W - total) / 2;
        (rtl ? parts.slice().reverse() : parts).forEach(function (p) {
            g += '<rect x="' + x.toFixed(1) + '" y="' + (H - 14) + '" width="9" height="9" fill="#' + p[0][1] + '"/>' + txt(x + 13, H - 6, p[0][0], 9, 'start');
            x += p[1];
        });
        return g;
    }

    /** Mark text boxes that overflow in the drawn preview; returns the slide indexes. */
    function markOverflow(root) {
        const bad = [];
        const all = root.classList && root.classList.contains('kelk-slide') ? [root] : root.querySelectorAll('.kelk-slide:not([data-lazy])');
        Array.prototype.forEach.call(all, function (sl) {
            let over = false;
            Array.prototype.forEach.call(sl.querySelectorAll('.tx'), function (tx) {
                const inner = tx.firstElementChild, pad = (+tx.getAttribute('data-pad') || 0) / 10 * sl.clientWidth;
                if (inner && inner.offsetHeight > (tx.clientHeight - 2 * pad) * 1.06 + 2) { tx.classList.add('of'); over = true; }
            });
            if (over) bad.push(+sl.getAttribute('data-i'));
        });
        return bad;
    }

    const WARNINGS = Object.freeze({
        overflow: 'text does not fit — shorten it or split the slide',
        directive: 'unknown directive "{0}"',
        layout: 'unknown layout "{0}"',
        'chart-type': 'unknown chart type "{0}"',
        'chart-table': 'a chart directive needs a table after it',
        'chart-data': 'the chart\'s table has no numbers',
        bullets: '{0} items: at most 7 read well',
        alerts: 'more than one callout: only the first is shown',
        'title-blocks': 'a title slide takes paragraphs only',
        stats: 'stats: no lead with a number',
        image: 'image not found: {0}',
        icon: 'unknown icon "{0}"',
        'math-inline': 'a formula PowerPoint cannot take as an equation (mhchem) is shown as its TeX',
        'layout-content': 'the layout "{0}" cannot hold all of this slide — it follows the content instead',
        'list-block': 'a code block or table inside a list item is left out — put it after the list'
    });

    // =========================================================================
    // 6. PowerPoint: the model through PptxGenJS
    // =========================================================================

    function buildPptx(model, o) {
        const Pptx = o.PptxGenJS || global.PptxGenJS;
        if (!Pptx) throw new PptxBuilderError('PptxGenJS is not loaded');
        const pptx = new Pptx();
        const rtl = model.dir === 'rtl', T = model.theme, fonts = model.fonts;
        pptx.layout = model.aspect === '4:3' ? 'LAYOUT_4x3' : 'LAYOUT_16x9';
        pptx.rtlMode = rtl;
        pptx.theme = { headFontFace: rtl ? fonts.bidi : fonts.latin, bodyFontFace: rtl ? fonts.bidi : fonts.latin };
        const meta = o.meta || {};
        if (meta.title) pptx.title = meta.title;
        if (meta.author) pptx.author = meta.author;
        if (meta.subject) pptx.subject = meta.subject;
        pptx.company = meta.creator || ('Kelk ' + (BuilderBase && BuilderBase.version || ''));
        pptx._kelkCreator = pptx.company;      // also the file's creator / last modified by (toBlob), as in .docx
        pptx._kelkAuthor = meta.author || '';
        const lang = rtl ? langOf(model.slides.map(function (s) { return s.title; }).join(' '), 'fa-IR') : 'en-US';
        const eqs = [];                     // equations: a marker in the text (or a picture's name), PowerPoint's own equation after (slideXml)
        pptx._kelkEqs = eqs;

        // masters: a real title placeholder per kind of slide (outline view, accessibility)
        const masters = {};
        model.slides.forEach(function (S) {
            const key = S.kind;
            if (masters[key]) return;
            const t = S.shapes.find(function (s) { return s.role === 'title'; });
            if (!t) return;
            const name = 'KELK_' + key.toUpperCase();
            pptx.defineSlideMaster({
                title: name, background: { color: S.bg },
                objects: [{ placeholder: { options: { name: 'title', type: 'title', x: t.x, y: t.y, w: t.w, h: t.h, valign: t.valign === 'bottom' ? 'bottom' : 'middle',
                    margin: [t.inset * 72, t.inset * 72, t.inset * 72, t.inset * 72] }, text: '' } }]
            });
            masters[key] = name;
        });

        // a piece's language: its own script's; a neutral piece takes its side's (the paragraph's language on
        // the right-to-left side, en-US on the left) — PowerPoint lays a run out by its language and a:rtl
        const runOpts = function (r, p, piece, paraLang) {
            const mono = r.code || p.mono;
            const face = mono && piece.rtl !== true ? fonts.code : piece.rtl === true ? fonts.bidi : piece.rtl === false ? fonts.latin : (p.dir === 'rtl' ? fonts.bidi : fonts.latin);
            const op = { fontFace: face, fontSize: p.size, color: r.color || p.color || T.ink, bold: !!(r.b || p.bold), italic: !!r.i,
                         lang: piece.rtl === true ? (hasRtl(piece.t) ? langOf(piece.t, paraLang || lang) : (paraLang || lang)) : 'en-US' };
            if (r.s) op.strike = 'sngStrike';
            if (r.u) op.underline = { style: 'sng' };
            if (r.sup) op.superscript = true;
            if (r.sub) op.subscript = true;
            if (r.hl) op.highlight = 'FFF59D';
            if (r.link) { op.hyperlink = { url: r.link }; op.color = T.primary; op.underline = { style: 'sng' }; }
            return op;
        };
        const parasToText = function (paras) {
            const out = [];
            paras.forEach(function (p, k) {
                const po = { align: p.alignX, rtlMode: p.dir === 'rtl', paraSpaceAfter: p.after || 0, paraSpaceBefore: 0 };
                if (p.lh) po.lineSpacingMultiple = Math.round(p.lh / LH * 100) / 100;
                if (p.bullet) {
                    po.bullet = typeof p.bullet === 'string' ? { code: p.bullet.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'), indent: bulletIndent(p) } : { type: 'number', style: 'arabicPeriod', startAt: p.bullet.num, indent: bulletIndent(p) };
                    po.indentLevel = p.level;
                }
                const runs = p.runs.length ? p.runs : [{ t: ' ' }];
                const pt = runsText(runs), paraLang = hasRtl(pt) ? langOf(pt, lang) : (lang === 'en-US' ? 'fa-IR' : lang);
                let soft = false;
                const pieces = [];
                const per = paraPieces(runs.map(function (r) { return { t: r.t === '\n' ? ' ' : r.t, keep: !!r.eq || ((r.code || p.mono) && p.dir !== 'rtl') }; }), p.dir === 'rtl');
                runs.forEach(function (r, ri) {
                    if (r.t === '\n') { soft = true; return; }
                    per[ri].forEach(function (pc) { pieces.push({ r: r, pc: pc, soft: soft }); soft = false; });
                });
                if (!pieces.length) pieces.push({ r: { t: ' ' }, pc: { t: ' ', rtl: null }, soft: false });
                pieces.forEach(function (x, j) {
                    // the paragraph's options on its first run only (PptxGenJS writes a pPr for every run that has them)
                    const op = Object.assign({}, j === 0 ? po : {}, runOpts(x.r, p, x.pc, paraLang), { breakLine: j === pieces.length - 1 && k < paras.length - 1 });
                    if (x.soft) op.softBreakBefore = true;
                    if (x.r.eq) {
                        const n = eqs.push({ omml: x.r.eq.omml, tex: x.r.eq.tex, pt: x.r.sup || x.r.sub ? p.size * 0.7 : p.size, color: x.r.color || p.color || T.ink, rtl: p.dir === 'rtl' }) - 1;
                        op.lang = 'en-US';
                        out.push({ text: EQ_MARK + n + EQ_MARK, options: op });
                        return;
                    }
                    out.push({ text: x.pc.t, options: op });
                });
            });
            return out;
        };

        // sections: the slides before the first section slide under the title slide's name, then one for each #
        const names = {};
        const section = function (t) {
            let n = String(t || '').replace(/\s+/g, ' ').trim() || model.labels.intro || 'Section';
            if (names[n]) { let k = 2; while (names[n + ' (' + k + ')']) k++; n = n + ' (' + k + ')'; }
            names[n] = true;
            pptx.addSection({ title: n });
            return n;
        };
        let cur = null;
        model.slides.forEach(function (S, si) {
            if (o.sections !== false && typeof pptx.addSection === 'function' && (si === 0 || S.kind === 'section')) cur = section(si === 0 && S.kind !== 'section' ? (S.kind === 'title' ? S.title : model.title) : S.title);
            const so = {};
            if (masters[S.kind]) so.masterName = masters[S.kind];
            if (cur) so.sectionTitle = cur;
            const slide = pptx.addSlide(so);
            slide.background = { color: S.bg };
            if (S.hidden) slide.hidden = true;
            S.shapes.forEach(function (sh) {
                if (sh.t === 'shape') {
                    const op = { x: sh.x, y: sh.y, w: sh.w, h: sh.h,
                        fill: sh.fill ? { color: sh.fill, transparency: sh.transparency || 0 } : { type: 'none' },
                        line: sh.line ? { color: sh.line, width: sh.lineW || 0.75, dashType: sh.dash ? 'dash' : 'solid' } : { type: 'none' } };
                    if (sh.shape === 'roundRect') op.rectRadius = Math.min(sh.r || 0.08, sh.h / 2, sh.w / 2);
                    if (sh.flipH) op.flipH = true;
                    slide.addShape(sh.shape, op);
                } else if (sh.t === 'line') {
                    const x = Math.min(sh.x1, sh.x2), y = Math.min(sh.y1, sh.y2);
                    const line = { color: sh.color, width: sh.width || 1 };
                    if (sh.dash) line.dashType = 'dash';
                    if (sh.arrow) line.endArrowType = 'triangle';
                    slide.addShape('line', { x: x, y: y, w: Math.abs(sh.x2 - sh.x1), h: Math.abs(sh.y2 - sh.y1), flipH: sh.x2 < sh.x1, flipV: sh.y2 < sh.y1, line: line });
                } else if (sh.t === 'text') {
                    const m = r1(sh.inset * 72);
                    const op = { x: sh.x, y: sh.y, w: sh.w, h: sh.h, valign: sh.valign, margin: [m, m, m, m], fit: 'none', wrap: true };
                    if (sh.fill) op.fill = { color: sh.fill };
                    if (sh.role === 'title' && masters[S.kind]) { op.placeholder = 'title'; }
                    slide.addText(parasToText(sh.paras), op);
                } else if (sh.t === 'image') {
                    if (sh.data) {
                        const b = sh.nw ? contain(sh, sh.nw, sh.nh) : sh;
                        const io = { data: sh.data, x: b.x, y: b.y, w: b.w, h: b.h, altText: sh.alt || '' };
                        if (sh.math && sh.omml && sh.mw && sh.mh) {         // a display formula: the picture is the fallback of an equation
                            const k = Math.min(b.w / (sh.mw / 96), b.h / (sh.mh / 96));
                            io.objectName = 'Kelk equation ' + (eqs.push({ omml: sh.omml, tex: sh.alt, pt: Math.max(8, Math.min(60, mathBase * k)), color: T.ink, display: true }) - 1);
                        }
                        slide.addImage(io);
                    } else if (!sh.icon) {
                        slide.addText([
                            { text: model.labels.image, options: { fontSize: 12, color: T.muted, align: 'center', breakLine: true, fontFace: fonts.bidi, rtlMode: rtl } },
                            { text: sh.caption ? ' ' : (sh.alt || ' '), options: { fontSize: 10, color: T.muted, align: 'center', fontFace: hasRtl(sh.alt) ? fonts.bidi : fonts.latin, rtlMode: hasRtl(sh.alt) } }
                        ], { shape: 'roundRect', rectRadius: 0.08, x: sh.x, y: sh.y, w: sh.w, h: sh.h, fill: { color: T.soft },
                             line: { color: T.muted, width: 1.25, dashType: 'dash' }, valign: 'middle', align: 'center' });
                    }
                } else if (sh.t === 'table') {
                    const rows = sh.rows.map(function (r) {
                        return r.map(function (c) {
                            const p = { size: sh.size, color: c.color, bold: c.bold, dir: c.dir, alignX: c.alignX, after: 0, runs: c.runs.length ? c.runs : [{ t: ' ' }] };
                            const text = parasToText([p]).map(function (x) { x.options.breakLine = false; return x; });
                            return { text: text, options: { fill: { color: c.fill }, color: c.color, bold: !!c.bold, align: c.alignX, valign: 'middle', fontSize: sh.size } };
                        });
                    });
                    slide.addTable(rows, { x: sh.x, y: sh.y, w: sh.w, colW: sh.colW, fontFace: rtl ? fonts.bidi : fonts.latin, fontSize: sh.size,
                        border: { type: 'solid', pt: 0.75, color: sh.border }, margin: [0.05, 0.08, 0.05, 0.08], autoPage: false });
                } else if (sh.t === 'chart') addChart(pptx, slide, sh, fonts, T, rtl);
            });
            if (S.showNum) slide.slideNumber = { x: rtl ? 0.5 : model.W - 1.1, y: model.H - 0.42, w: 0.6, h: 0.3, fontFace: fonts.latin, fontSize: 8, color: T.muted, align: rtl ? 'left' : 'right' };
            if (S.notes && o.notes !== false) slide.addNotes(S.notes);
        });
        return pptx;
    }

    function addChart(pptx, slide, sh, fonts, T, rtl) {
        const kind = sh.kind, C = pptx.ChartType || pptx.charts || {};
        const type = { bar: C.bar || 'bar', column: C.bar || 'bar', line: C.line || 'line', area: C.area || 'area', pie: C.pie || 'pie',
                       doughnut: C.doughnut || 'doughnut', radar: C.radar || 'radar', scatter: C.line || 'line' }[kind];
        const rtlText = hasRtl(sh.data.map(function (s) { return s.name + s.labels.join(''); }).join(''));
        const face = rtlText ? fonts.bidi : fonts.latin;
        const round = kind === 'pie' || kind === 'doughnut';
        const op = {
            x: sh.x, y: sh.y, w: sh.w, h: sh.h, chartColors: round ? sh.colors : sh.colors.slice(0, sh.data.length),
            showLegend: sh.data.length > 1 || round, legendPos: 'b', legendFontFace: face, legendFontSize: 10, legendColor: T.ink,
            catAxisLabelFontFace: face, catAxisLabelFontSize: 10, catAxisLabelColor: T.ink,
            valAxisLabelFontFace: fonts.latin, valAxisLabelFontSize: 9, valAxisLabelColor: T.muted,
            valGridLine: { color: T.line, size: 0.75 }, catGridLine: { style: 'none' },
            dataLabelFontFace: fonts.latin, dataLabelFontSize: 10, dataLabelColor: round ? onFill(sh.colors[0]) : T.ink
        };
        if (sh.title) { op.showTitle = true; op.title = sh.title; op.titleFontFace = face; op.titleFontSize = 13; op.titleColor = T.ink; }
        if (kind === 'bar' || kind === 'column') {
            op.barDir = kind === 'bar' ? 'bar' : 'col';
            if (sh.opts.stacked) op.barGrouping = 'stacked';
            if (sh.opts.percent) op.barGrouping = 'percentStacked';
            op.barGapWidthPct = 60;
        }
        if (kind === 'doughnut') op.holeSize = 55;
        if (round) { op.showPercent = true; op.showValue = false; }
        else if (sh.opts.labels) { op.showValue = true; op.dataLabelPosition = kind === 'line' ? 't' : 'outEnd'; }
        if (kind === 'line') { op.lineSize = 2.5; op.lineDataSymbol = 'circle'; op.lineDataSymbolSize = 6; }
        // right to left: the first category on the right; a horizontal bar grows to the left
        if (kind === 'bar') { op.catAxisOrientation = 'maxMin'; if (rtl) op.valAxisOrientation = 'maxMin'; }
        else if (rtl && !round) op.catAxisOrientation = 'maxMin';
        slide.addChart(type, sh.data.map(function (s) { return { name: s.name, labels: s.labels, values: s.values }; }), op);
    }

    /** Speaker notes as DrawingML paragraphs: one per line, each with its direction and pieces. */
    function notesXml(text, dir, fonts) {
        const x = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
        return String(text).split('\n').map(function (line) {
            const rtl = textDir(line, dir) === 'rtl';
            const lang = rtl ? langOf(line, 'fa-IR') : 'en-US';
            const runs = line.trim() ? scriptPieces(line, rtl).map(function (pc) {
                const face = pc.rtl === true ? fonts.bidi : pc.rtl === false ? fonts.latin : (rtl ? fonts.bidi : fonts.latin);
                const rl = pc.rtl === true ? (hasRtl(pc.t) ? langOf(pc.t, lang) : (rtl ? lang : langOf(line, 'fa-IR'))) : 'en-US';
                return '<a:r><a:rPr lang="' + rl + '" dirty="0"><a:latin typeface="' + x(face) + '"/><a:ea typeface="' + x(face) + '"/><a:cs typeface="' + x(face) + '"/>' +
                    (rtl || pc.rtl === true ? '<a:rtl val="' + (pc.rtl === true ? 1 : 0) + '"/>' : '') + '</a:rPr><a:t>' + x(pc.t) + '</a:t></a:r>';
            }).join('') : '';
            return '<a:p><a:pPr algn="' + (rtl ? 'r' : 'l') + '" rtl="' + (rtl ? 1 : 0) + '"/>' + runs + '<a:endParaRPr lang="' + lang + '" dirty="0"/></a:p>';
        }).join('');
    }

    const RTL_LANG = /^(fa|ar|he|ur|ps|ckb|yi)\b/i;
    /**
     * A slide's XML, mended after PptxGenJS: one pPr per paragraph (it writes one for every run, and
     * PowerPoint may read the later ones), and every run's direction as PowerPoint stores it (a:rtl,
     * from the run's language) — PowerPoint lays a run out by it, not by the paragraph's text.
     */
    function slideXml(xml, S, model, eqs) {
        xml = xml.replace(/<a:p>[\s\S]*?<\/a:p>/g, function (p) {
            let seen = false;
            p = p.replace(/<a:pPr\b[^>]*?(?:\/>|>[\s\S]*?<\/a:pPr>)/g, function (m) { if (seen) return ''; seen = true; return m; });
            // a bullet other than • and –: a font that has it (Vazirmatn, Calibri do not have ❖ ➢ ✓ ❑)
            p = p.replace(/<a:buChar char="([^"]+)"\/>/, function (m, c) {
                return /^(•|&#x2022;|–|&#x2013;)$/i.test(c) ? m : '<a:buFont typeface="Segoe UI Symbol" pitchFamily="34" charset="0"/>' + m;
            });
            const paraRtl = /^<a:p><a:pPr\b[^>]*\brtl="1"/.test(p);
            return p.replace(/<a:rPr\b([^>]*?)(\/>|>([\s\S]*?)<\/a:rPr>)/g, function (m, attrs, end, inner) {
                const lang = (/\blang="([^"]*)"/.exec(attrs) || [])[1] || '';
                const r = RTL_LANG.test(lang);
                if (!r && !paraRtl) return m;
                if (/<a:rtl\b/.test(inner || '')) return m;
                return '<a:rPr' + attrs + '>' + (inner || '') + '<a:rtl val="' + (r ? 1 : 0) + '"/></a:rPr>';
            });
        });
        return eqs && eqs.length && xml.indexOf('Kelk equation') + xml.indexOf(EQ_MARK) > -2 ? equationsXml(xml, eqs, model.fonts) : xml;
    }

    const EQ_MARK = '\u2063\u2063';
    const MC_NS = 'http://schemas.openxmlformats.org/markup-compatibility/2006', A14_NS = 'http://schemas.microsoft.com/office/drawing/2010/main';
    const mcWrap = function (choice, fallback) {
        return '<mc:AlternateContent xmlns:mc="' + MC_NS + '"><mc:Choice xmlns:a14="' + A14_NS + '" Requires="a14">' + choice + '</mc:Choice><mc:Fallback>' + fallback + '</mc:Fallback></mc:AlternateContent>';
    };
    const xmlEsc = function (v) { return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };

    /**
     * MathCore's OMML (written for Word: w:rPr in its runs) as PowerPoint keeps it: each m:r with an
     * a:rPr — the size, the color, Cambria Math (a right-to-left \text{…} in the bidi font).
     */
    function pptOmml(omml, eq, fonts) {
        const sz = Math.round(eq.pt * 2) * 50;
        return String(omml).replace(/ xmlns:w="[^"]*"/, '').replace(/<m:r>((?:<m:rPr>[\s\S]*?<\/m:rPr>)?)(?:<w:rPr>([\s\S]*?)<\/w:rPr>)?/g, function (m, mpr, wpr) {
            wpr = wpr || '';
            const col = (/<w:color w:val="([0-9A-Fa-f]{6})"/.exec(wpr) || [])[1] || eq.color;
            const rtl = /<w:rtl\/>/.test(wpr);
            const face = rtl ? fonts.bidi : 'Cambria Math';
            const sty = (/<m:sty m:val="(\w+)"/.exec(mpr) || [])[1] || (/<m:nor\/>/.test(mpr) ? 'p' : 'i');
            const bi = (/b/.test(sty) ? ' b="1"' : '') + (/i/.test(sty) ? ' i="1"' : '');
            return '<m:r>' + mpr + '<a:rPr lang="' + (rtl ? 'fa-IR' : 'en-US') + '" sz="' + sz + '"' + bi + ' dirty="0">' +
                (col ? '<a:solidFill><a:srgbClr val="' + col + '"/></a:solidFill>' : '') +
                '<a:latin typeface="' + xmlEsc(face) + '"/><a:cs typeface="' + xmlEsc(face) + '"/>' + (rtl ? '<a:rtl val="1"/>' : '') + '</a:rPr>';
        });
    }

    /**
     * Equations: a text box with markers becomes PowerPoint's own equations (a14:m) with the TeX as its
     * fallback; a formula's picture becomes the fallback of an equation box of its size. Programs that
     * do not know a14 (older PowerPoint, LibreOffice …) show the fallback.
     */
    function equationsXml(xml, eqs, fonts) {
        const markRe = new RegExp('<a:r>(<a:rPr\\b[^>]*?(?:\\/>|>[\\s\\S]*?<\\/a:rPr>))<a:t>' + EQ_MARK + '(\\d+)' + EQ_MARK + '<\\/a:t><\\/a:r>', 'g');
        // text with inline equations (shapes; a table cell keeps the TeX)
        xml = xml.replace(/<p:sp>[\s\S]*?<\/p:sp>/g, function (sp) {
            if (sp.indexOf(EQ_MARK) < 0) return sp;
            const choice = sp.replace(markRe, function (m, rpr, n) {
                const eq = eqs[+n];
                return eq ? '<a14:m>' + pptOmml(eq.omml, eq, fonts) + '</a14:m>' : '';
            });
            const fallback = sp.replace(markRe, function (m, rpr, n) { return '<a:r>' + rpr + '<a:t>' + xmlEsc(eqs[+n] ? eqs[+n].tex : '') + '</a:t></a:r>'; });
            return mcWrap(choice, fallback);
        });
        xml = xml.replace(markRe, function (m, rpr, n) { return '<a:r>' + rpr + '<a:t>' + xmlEsc(eqs[+n] ? eqs[+n].tex : '') + '</a:t></a:r>'; });
        // display formulas: the picture named "Kelk equation N"
        xml = xml.replace(/<p:pic>[\s\S]*?<\/p:pic>/g, function (pic) {
            const m = /<p:cNvPr id="(\d+)" name="Kelk equation (\d+)"/.exec(pic);
            const eq = m && eqs[+m[2]];
            if (!eq) return pic;
            const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(pic), ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(pic);
            if (!off || !ext) return pic;
            const sz = Math.round(eq.pt * 2) * 50;
            const sp = '<p:sp><p:nvSpPr><p:cNvPr id="' + m[1] + '" name="Equation ' + m[2] + '" descr="' + xmlEsc(eq.tex) + '"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>' +
                '<p:spPr><a:xfrm><a:off x="' + off[1] + '" y="' + off[2] + '"/><a:ext cx="' + ext[1] + '" cy="' + ext[2] + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>' +
                '<p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="ctr"><a:noAutofit/></a:bodyPr><a:lstStyle/>' +
                '<a:p><a:pPr algn="ctr" rtl="0"/><a14:m>' + pptOmml(eq.omml, eq, fonts).replace(/<m:jc m:val="center"\/>/, '<m:jc m:val="centerGroup"/>') + '</a14:m>' +
                '<a:endParaRPr lang="en-US" sz="' + sz + '" dirty="0"/></a:p></p:txBody></p:sp>';
            return mcWrap(sp, pic);
        });
        return xml;
    }

    /** The theme's major and minor fonts: Latin and complex-script (cs, and the Arabic/Hebrew script slots) from the deck's fonts. */
    function themeFonts(xml, fonts, rtl) {
        const x = function (v) { return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); };
        return xml.replace(/<a:(majorFont|minorFont)>([\s\S]*?)<\/a:\1>/g, function (m, tag, inner) {
            inner = inner.replace(/<a:latin typeface="[^"]*"/, '<a:latin typeface="' + x(rtl ? fonts.bidi : fonts.latin) + '"')
                .replace(/<a:cs typeface="[^"]*"/, '<a:cs typeface="' + x(fonts.bidi) + '"')
                .replace(/(<a:font script="(?:Arab|Hebr)" typeface=")[^"]*"/g, '$1' + x(fonts.bidi) + '"');
            return '<a:' + tag + '>' + inner + '</a:' + tag + '>';
        });
    }

    // =========================================================================
    // 7. The builder
    // =========================================================================

    class PptxBuilder extends BuilderBase {
        constructor(config) {
            super(config, { defaults: DEFAULTS, Error: PptxBuilderError, keep: ['PptxGenJS'] });
            this._deck = {};
            this._icons = null;
        }

        static create(config) { return new PptxBuilder(config); }

        /** configure() of BuilderBase, plus { slides: setSlides(), deck: setDeck() }. */
        configure(o) {
            o = Object.assign({}, o || {});
            if (o.slides !== undefined) { this.setSlides(o.slides); delete o.slides; }
            if (o.deck !== undefined) { this.setDeck(o.deck); delete o.deck; }
            return super.configure(o);
        }

        /**
         * The slide options (DEFAULTS.slides): theme, primary, accent, titleStyle,
         * aspect, size, minScale, numbers, footer, notes, autoLayout, timeline,
         * split, maxBullets, maxRows, sectionNumbers, labels — and icons: a
         * function (name → the inner markup of a 24×24 Lucide-style SVG).
         */
        setSlides(o) {
            o = Object.assign({}, o || {});
            if (typeof o.icons === 'function') this._icons = o.icons;
            delete o.icons;
            if (o.theme != null) { const n = themeName(o.theme); if (!n) this._fail('slides.theme must be one of ' + Object.keys(THEMES).join(', ')); o.theme = n; }
            if (o.aspect != null) this._oneOf(String(o.aspect), ['16:9', '4:3'], 'slides.aspect');
            if (o.size != null) this._oneOf(o.size, Object.keys(SIZES), 'slides.size');
            if (o.titleStyle != null) this._oneOf(o.titleStyle, ['dark', 'light'], 'slides.titleStyle');
            if (o.timeline != null) this._oneOf(o.timeline, ['auto', 'horizontal', 'vertical'], 'slides.timeline');
            ['primary', 'accent'].forEach(function (k) { if (o[k] === '') o[k] = null; });
            this._config.slides = Object.assign({}, this._config.slides || DEFAULTS.slides, o);
            return this;
        }

        /** The deck's own settings (front matter): title, footer, dir, theme, aspect, author, date … */
        setDeck(meta) { this._deck = Object.assign({}, meta || {}); return this; }

        /** Markdown in one step (front matter + marked + comments): needs the global marked. */
        addFromMarkdown(md, o) {
            const r = markdownToHtml(md, o);
            this.addFromHtml(r.html);
            return this.setDeck(r.meta);
        }

        _fonts() {
            // configure({ fonts }) goes into the template options (BuilderBase.setFonts), as for Word
            const t = this._config.template || {};
            const f = Object.assign({}, this._config.fonts || {});
            if (t.bidiFont) f.bidi = t.bidiFont;
            if (t.latinFont) f.latin = t.latinFont;
            if (t.codeFont) f.code = t.codeFont;
            return { bidi: f.bidi || 'Vazirmatn', latin: f.latin || f.bidi || 'Calibri', code: f.code || 'Consolas' };
        }

        /**
         * The layout model (the preview draws it, toBlob writes it): formulas
         * become pictures, images and icons are read, every slide is laid out.
         */
        async model() {
            if (typeof document === 'undefined') this._fail('PptxBuilder needs a DOM (a browser)');
            const cfg = Object.assign({}, DEFAULTS.slides, this._config.slides || {});
            const cb = this._config.codeBlock || {};                    // the code-block options the other builders share
            if (cb.showLanguage === false) cfg.codeLanguage = false;
            if (cb.fallbackLabel) cfg.codeFallback = cb.fallbackLabel;
            const meta = this._deck || {};
            const fonts = this._fonts();
            measureFamily = '"' + fonts.bidi + '", Vazirmatn, Tahoma, sans-serif';
            // (parsed in a document of its own, with no window: its pictures are not fetched here — they are read
            // through the image store; ![…](placeholder) was requested as a file named placeholder)
            const root = document.implementation.createHTMLDocument('').createElement('div');
            root.innerHTML = this._contentHtml || '';
            const warnAll = [];

            // formulas: each becomes PowerPoint's own equation (OMML, editable) over a picture of it — the
            // picture is what other programs show; one alone in a paragraph is a display formula
            Array.prototype.forEach.call(root.querySelectorAll('.kelk-math[data-display="inline"]'), function (el) {
                const p = el.parentElement;
                const alone = p && p.tagName === 'P' && p.querySelectorAll('.kelk-math').length === 1 && !p.textContent.trim();
                if (alone) el.setAttribute('data-display', 'block');
            });
            mathBase = 24 * (SIZES[cfg.size] || 1);
            if (root.querySelector('.kelk-math')) {
                if (MathCore) {
                    await MathCore.toImages(root, { fontSizePt: mathBase, maxWidth: 8.6 * 96, omml: cfg.equations !== false,
                        fontFamily: (this._config.math && this._config.math.textFont) || fonts.bidi });
                } else Array.prototype.forEach.call(root.querySelectorAll('.kelk-math'), function (el) { el.textContent = '$$' + el.getAttribute('data-tex') + '$$'; });
            }
            // an inline formula PowerPoint cannot take as an equation keeps its TeX as text
            Array.prototype.forEach.call(root.querySelectorAll('img.kelk-math-img[data-display="inline"]:not([data-omml])'), function (img) {
                const sp = document.createElement('span');
                sp.className = 'kelk-tex';
                sp.textContent = img.getAttribute('alt') || '';
                img.replaceWith(sp);
                warnAll.push({ code: 'math-inline' });
            });

            const title = meta.title || (this._config.meta && this._config.meta.title) || (function () { const h = root.querySelector('h1'); return h ? h.textContent.trim() : ''; })();
            const dirSet = /^(rtl|ltr)$/.test(meta.dir || '') ? meta.dir : this._config.direction;
            const dir = dirSet === 'rtl' || dirSet === 'ltr' ? dirSet : (BidiCore ? BidiCore.detectDirection(root) : 'ltr');

            const self = this;
            iconSet = this._icons || (global.KelkSlideIcons ? function (n) { return global.KelkSlideIcons[n]; } : null);
            const deck = parseDeck(root, meta);
            if (warnAll.length && deck.slides[0]) deck.slides[0].warn.push(warnAll[0]);

            // icons: Lucide names → white SVG pictures; an unknown name warns and is left out
            const icons = [];
            deck.slides.forEach(function (s) {
                const walk = function (list) {
                    list.items.forEach(function (it) {
                        if (it.icon && it.icon.name) {
                            const src = iconSrc(it.icon.name);
                            if (src) icons.push(src, iconSrc(it.icon.name, '111827')); else { s.warn.push({ code: 'icon', arg: it.icon.name }); it.icon = null; }
                        }
                        if (it.children) walk(it.children);
                    });
                };
                s.blocks.forEach(function (b) { if (b.type === 'list') walk(b); });
            });

            // the deck's logo: front matter logo:, else the one the page gives (Kelk: the document's logo)
            const logoSrc = cfg.logo !== 'none' ? (meta.logo || cfg.logoSrc || null) : null;
            if (logoSrc) icons.push(logoSrc);
            if (this._images && ImageCore) {
                const srcs = ImageCore.collectSources(root).concat(icons).filter(function (s) { return s && s !== 'placeholder'; });
                await this._images.resolveAll(srcs);
            }

            if (this._images) deck.slides.forEach(function (s) {          // pictures' own sizes (a logo keeps its shape)
                s.blocks.forEach(function (b) {
                    const rec = b.type === 'image' && b.src && b.src !== 'placeholder' ? self._images.get(b.src) : null;
                    if (rec && rec.width) { b.nw = rec.width; b.nh = rec.height; }
                });
            });
            let logo = null;
            if (logoSrc) {
                const rec = this._images ? this._images.get(logoSrc) : null;
                if (rec) logo = { src: logoSrc, nw: rec.width, nh: rec.height };
                else if (deck.slides[0]) deck.slides[0].warn.push({ code: 'image', arg: 'logo' });
            }
            const model = layoutDeck(deck, cfg, { dir: dir, title: title, logo: logo });
            model.fonts = fonts;
            model.title = title;
            model.slides.forEach(function (S) {
                S.shapes.forEach(function (sh) {
                    if (sh.t !== 'image') return;
                    const rec = self._images && sh.src && sh.src !== 'placeholder' ? self._images.get(sh.src) : null;
                    if (rec) {
                        sh.data = 'data:' + rec.mime + ';base64,' + rec.base64;
                        sh.nw = rec.width; sh.nh = rec.height;
                        if (/^data:image\/svg/i.test(sh.src)) sh.preview = sh.src;
                    } else if (sh.src && sh.src !== 'placeholder' && !sh.icon && !sh.math) S.warn.push({ code: 'image', arg: sh.alt || sh.src.slice(0, 40) });
                });
            });
            return model;
        }

        /** PptxGenJS presentation of a model (the default: a new model). */
        async toPptx(model) {
            model = model || await this.model();
            const cfg = Object.assign({}, DEFAULTS.slides, this._config.slides || {});
            const meta = this._metaFor(model.title);
            if ((this._deck.author || this._deck.presenter) && !meta.author) meta.author = this._deck.author || this._deck.presenter;
            return buildPptx(model, { PptxGenJS: this._config.PptxGenJS, meta: meta, notes: cfg.notes, sections: cfg.sections });
        }

        /**
         * The .pptx as a Blob (compressed: PptxGenJS compresses only its default blob output).
         * o.onProgress(step, done, total): 'build' (PptxGenJS's presentation), 'write' (its file), 'slides' (each
         * slide's XML: done of total), 'zip' (the compression: done of 100) — most of a large deck's time is in
         * write and zip.
         */
        async toBlob(model, o) {
            const tell = (o && o.onProgress) || function () {};
            model = model || await this.model();
            tell('build', 0, 1);
            const pptx = await this.toPptx(model);
            tell('write', 0, 1);
            // write() drops compression for any outputType; its own exporter, with none, gives a DEFLATE blob
            const blob = typeof pptx.exportPresentation === 'function'
                ? await pptx.exportPresentation({ compression: true })
                : await pptx.write({ outputType: 'blob' });
            const type = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
            const Zip = global.JSZip;
            const cfg = Object.assign({}, DEFAULTS.slides, this._config.slides || {});
            if (!Zip) return new Blob([blob], { type: type });
            const zip = await Zip.loadAsync(blob);
            const fonts = model.fonts, rtl = model.dir === 'rtl';
            // the theme's fonts: Persian/Arabic text without a font of its own (charts, notes, a new text box)
            // takes the bidi font, not Times New Roman
            const th = zip.file('ppt/theme/theme1.xml');
            if (th) zip.file('ppt/theme/theme1.xml', themeFonts(await th.async('string'), fonts, rtl));
            // the file's properties name Kelk (as the .docx and the PDF do), not the library under it
            const core = zip.file('docProps/core.xml');
            if (core) {
                const esc = function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
                zip.file('docProps/core.xml', (await core.async('string'))
                    .replace(/<dc:creator>[^<]*<\/dc:creator>/, '<dc:creator>' + esc(pptx._kelkAuthor || pptx._kelkCreator) + '</dc:creator>')
                    .replace(/<cp:lastModifiedBy>[^<]*<\/cp:lastModifiedBy>/, '<cp:lastModifiedBy>' + esc(pptx._kelkCreator) + '</cp:lastModifiedBy>'));
            }
            const nm = zip.file('ppt/notesMasters/notesMaster1.xml');
            if (nm && rtl) zip.file('ppt/notesMasters/notesMaster1.xml', (await nm.async('string')).replace(/(<p:notesStyle>[\s\S]*?<\/p:notesStyle>)/, function (m) {
                return m.replace(/algn="l"/g, 'algn="r"').replace(/rtl="0"/g, 'rtl="1"');
            }));
            for (let i = 0; i < model.slides.length; i++) {
                tell('slides', i, model.slides.length);
                const S = model.slides[i];
                // the slide: one pPr per paragraph, each run's direction (a:rtl), formulas as equations
                const sp = 'ppt/slides/slide' + (i + 1) + '.xml', sf = zip.file(sp);
                if (sf) zip.file(sp, slideXml(await sf.async('string'), S, model, pptx._kelkEqs || []));
                // speaker notes: PptxGenJS writes one left-to-right en-US run; each line becomes its own
                // paragraph with its direction, and its pieces get their font and language (scriptPieces)
                const path = 'ppt/notesSlides/notesSlide' + (i + 1) + '.xml', f = zip.file(path);
                if (!S.notes || !f || cfg.notes === false) continue;
                const xml = await f.async('string');
                const body = notesXml(S.notes, model.dir, model.fonts);
                zip.file(path, xml.replace(/(name="Notes Placeholder 2"[\s\S]*?<p:txBody><a:bodyPr\/><a:lstStyle\/>)[\s\S]*?(<\/p:txBody>)/, function (m, a, b) { return a + body + b; }));
            }
            tell('zip', 0, 100);
            return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: type }, function (m) { tell('zip', m.percent, 100); });
        }

        /** The .pptx as an ArrayBuffer. */
        async toArrayBuffer(model) {
            return (await this.toBlob(model)).arrayBuffer();
        }
    }

    PptxBuilder.VERSION = VERSION;
    PptxBuilder.THEMES = THEMES;
    PptxBuilder.THEME_ALIAS = THEME_ALIAS;
    PptxBuilder.LAYOUTS = LAYOUTS.slice();
    PptxBuilder.CHARTS = CHARTS.slice();
    PptxBuilder.DEFAULTS = DEFAULTS;
    PptxBuilder.WARNINGS = WARNINGS;
    PptxBuilder.frontMatter = frontMatter;
    PptxBuilder.protectComments = protectComments;
    PptxBuilder.markdownToHtml = markdownToHtml;
    /** The preview of a model: HTML (o: { notes, notesLabel, warnText(w), uiDir, bidi, latin, eager: draw the first N slides, the rest empty with data-lazy }). */
    PptxBuilder.previewHtml = previewHtml;
    /** One slide's drawing (the inside of its .kelk-slide box) — for a preview drawn lazily (previewHtml o.eager). */
    PptxBuilder.previewSlide = function (model, i, o) { return previewHtml(model, Object.assign({}, o || {}, { only: i })); };
    /** The preview's stylesheet (once per page). */
    PptxBuilder.previewCss = function () { return PREVIEW_CSS; };
    PptxBuilder.markOverflow = markOverflow;
    PptxBuilder.PptxBuilderError = PptxBuilderError;
    // exposed for tests
    PptxBuilder._parseDeck = parseDeck;
    PptxBuilder._scriptPieces = scriptPieces;
    PptxBuilder._parseArgs = parseArgs;

    if (typeof module !== 'undefined' && module.exports) module.exports = PptxBuilder;
    else if (typeof define === 'function' && define.amd) define([], function () { return PptxBuilder; });
    else global.PptxBuilder = PptxBuilder;
})(typeof window !== 'undefined' ? window : this);
